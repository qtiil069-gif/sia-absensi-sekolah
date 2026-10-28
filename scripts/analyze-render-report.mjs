import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeRenderContent } from './render-build.mjs';
import { describeSource } from './audit-htmlservice.mjs';
import { reconstructBlockComments, reconstructCommentNormalization } from './render-evidence.mjs';

const same = (source, fingerprint) => {
  const actual = describeRenderContent(source);
  return actual.bytes === fingerprint?.bytes && actual.sha256 === fingerprint?.sha256;
};

// Only return locally computed metadata and booleans. Do not echo arbitrary
// report fields, source text, parser errors, account data, or URLs.
export function analyzeRenderReport(files, report) {
  if (report?.schema !== 1 || !report.build?.files || !report.server?.files) throw new Error('Unsupported report.');
  const variants = (name) => {
    const original = files[name];
    const lf = original.replace(/\r\n?/g, '\n');
    if (name === 'Index') return [original, lf, lf.replace(/\n/g, '\r\n')];
    if (name === 'Styles') {
      if (!lf.startsWith('<style>\n') || !lf.endsWith('\n</style>')) throw new Error('Unsupported styles envelope.');
      return [original, lf, '<style>\n' + lf.slice(8, -9).replace(/\n/g, '\r\n') + '\n</style>'];
    }
    return [original];
  };
  const result = { files: {}, core: {}, conclusion: 'NOT_REPRODUCED',
    limitations: 'Offline byte/syntax reconstruction only. The failing normal /dev VM is still required; the diagnostic route rewraps HTML.' };
  for (const name of ['Index', 'Styles', 'Scripts', 'RenderProbe']) {
    const source = variants(name).find((value) => same(value, report.build.files[name]));
    const item = result.files[name] = { buildReproduced: source !== undefined, retrievedReproduced: false };
    if (source === undefined) continue;
    let retrieved;
    if (name === 'Index') retrieved = source.replace(/<\?/g, '&lt;?');
    else if (name === 'Styles') retrieved = reconstructBlockComments(source);
    else {
      if (!source.startsWith('<script>') || !source.endsWith('</script>')) throw new Error('Unsupported script envelope.');
      const normalized = reconstructCommentNormalization(source.slice(8, -9));
      retrieved = '<script>' + normalized.source + '</script>';
      item.parsedFormMatchesOriginal = normalized.parsedFormMatchesOriginal;
    }
    item.build = describeRenderContent(source);
    item.retrieved = describeRenderContent(retrieved);
    item.retrievedReproduced = same(retrieved, report.server.files[name]);
    if (name !== 'Scripts') continue;
    if (!source.startsWith('<script>') || !source.endsWith('</script>')) throw new Error('Unsupported script envelope.');
    const original = source.slice(8, -9);
    const normalized = reconstructCommentNormalization(original);
    result.core = { build: describeSource(original), reconstructed: describeSource(normalized.source),
      parsedFormMatchesOriginal: normalized.parsedFormMatchesOriginal,
      matchesReportedBuild: same(original, report.build.core),
      matchesReportedRetrieved: same(normalized.source, report.server.retrievedCore),
      matchesReportedEvaluated: same(normalized.source, report.server.evaluated?.core),
      matchesReportedBrowser: same(normalized.source, report.browser?.core) };
  }
  if (Object.values(result.files).every((item) => item.buildReproduced && item.retrievedReproduced &&
        item.parsedFormMatchesOriginal !== false) &&
      result.core.reconstructed?.syntax.valid && result.core.parsedFormMatchesOriginal &&
      ['matchesReportedBuild', 'matchesReportedRetrieved', 'matchesReportedEvaluated', 'matchesReportedBrowser']
        .every((name) => result.core[name])) result.conclusion = 'EXACT_COMMENT_NORMALIZATION_REPRODUCED';
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const files = Object.fromEntries(await Promise.all(['Index', 'Styles', 'Scripts', 'RenderProbe'].map(async (name) =>
      [name, await readFile(path.join(root, 'dist', `${name}.html`), 'utf8')])));
    console.log(JSON.stringify(analyzeRenderReport(files, report), null, 2));
  } catch {
    console.error(JSON.stringify({ error: 'REPORT_ANALYSIS_FAILED', message: 'Run npm run build and provide a valid render-report JSON path.' }));
    process.exitCode = 1;
  }
}
