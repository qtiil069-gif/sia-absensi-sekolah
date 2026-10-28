import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { reconstructCommentNormalization } from './render-evidence.mjs';

const bytesOf = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');

// Compile only. Never execute copied code, and never echo source or parser text
// (an unexpected identifier in an error message could itself contain a secret).
export function describeSource(value) {
  const bytes = bytesOf(value);
  const source = bytes.toString('utf8');
  let syntax = { valid: true };
  try { new vm.Script(source, { filename: 'audit-source.js' }); }
  catch (error) {
    const firstLine = String(error.stack).split('\n')[0];
    const line = /^audit-source\.js:(\d+)/.exec(firstLine);
    const kind = error.message === 'Invalid or unexpected token' ? 'INVALID_TOKEN'
      : error.message === 'Unexpected end of input' ? 'UNEXPECTED_END' : 'PARSE_ERROR';
    syntax = { valid: false, kind, ...(line ? { line: Number(line[1]) } : {}) };
  }
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    utf8Roundtrip: Buffer.from(source, 'utf8').equals(bytes), syntax };
}

function location(bytes, offset) {
  let line = 1;
  let start = 0;
  for (let index = 0; index < offset; index++) if (bytes[index] === 10) { line++; start = index + 1; }
  return { line, columnBytes: offset - start + 1 };
}

// These are byte comparisons, not an inference about what Google served. In
// particular a capture can be cropped by DevTools, copying, or local editing.
export function compareSources(captureValue, candidateValue) {
  const capture = bytesOf(captureValue);
  const candidate = bytesOf(candidateValue);
  const shortest = Math.min(capture.length, candidate.length);
  let prefix = 0;
  while (prefix < shortest && capture[prefix] === candidate[prefix]) prefix++;
  let suffix = 0;
  while (suffix < shortest && capture[capture.length - suffix - 1] === candidate[candidate.length - suffix - 1]) suffix++;
  const exactMatch = capture.length === candidate.length && prefix === capture.length;
  return { exactMatch, commonPrefixBytes: prefix, commonSuffixBytes: suffix,
    captureMatchesCandidatePrefix: capture.length <= candidate.length && prefix === capture.length,
    firstDifference: exactMatch ? null : { byteOffset: prefix, captureEnded: prefix === capture.length,
      candidateEnded: prefix === candidate.length, capture: location(capture, prefix), candidate: location(candidate, prefix) } };
}

export async function auditHtmlService(root, capturePath) {
  const html = await readFile(path.join(root, 'dist/Scripts.html'), 'utf8');
  if (!html.startsWith('<script>\n') || !html.endsWith('</script>')) throw new Error('Unsupported script envelope.');
  const candidates = [{ id: 'core', source: Buffer.from(html.slice('<script>'.length, -'</script>'.length), 'utf8') }];
  const normalized = reconstructCommentNormalization(candidates[0].source.toString('utf8'));
  candidates.push({ id: 'core-comments-normalized', source: Buffer.from(normalized.source, 'utf8'),
    parsedFormMatchesOriginal: normalized.parsedFormMatchesOriginal });
  const manifest = JSON.parse(await readFile(path.join(root, '.preview/browser-assets.json'), 'utf8'));
  for (const id of ['qr', 'pdf', 'excel']) {
    const asset = manifest[id];
    if (asset?.file !== `Asset_${id}`) throw new Error('Unexpected asset manifest.');
    const encoded = await readFile(path.join(root, 'dist', `${asset.file}.html`), 'utf8');
    const source = Buffer.from(encoded, 'base64');
    const description = describeSource(source);
    candidates.push({ id, source, manifestMatches: /^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      && encoded === source.toString('base64') && encoded.length === asset.encodedLength
      && description.bytes === asset.bytes && description.sha256 === asset.sha256 });
  }
  const result = { note: 'Local syntax and byte comparisons only. A cropped capture is not proof of truncation by Google.',
    candidates: candidates.map(({ id, source, manifestMatches, parsedFormMatchesOriginal }) => ({ id, ...describeSource(source),
      ...(parsedFormMatchesOriginal === undefined ? {} : { parsedFormMatchesOriginal }),
      ...(manifestMatches === undefined ? {} : { manifestMatches }) })) };
  if (capturePath) {
    const capture = await readFile(capturePath);
    result.capture = { ...describeSource(capture),
      comparisons: candidates.map(({ id, source }) => ({ id, ...compareSources(capture, source) })) };
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    console.log(JSON.stringify(await auditHtmlService(root, process.argv[2]), null, 2));
  } catch {
    console.error(JSON.stringify({ error: 'AUDIT_READ_FAILED', message: 'Run npm run build and check the optional captured-file path.' }));
    process.exitCode = 1;
  }
}
