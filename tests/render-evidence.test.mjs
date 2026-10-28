import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { root } from '../scripts/build.mjs';
import { describeRenderContent } from '../scripts/render-build.mjs';
import { analyzeRenderReport } from '../scripts/analyze-render-report.mjs';
import { reconstructBlockComments, reconstructCommentNormalization } from '../scripts/render-evidence.mjs';

test('observed comment normalization preserves the actual generated core and its Pustaka template literal', async () => {
  const html = await readFile(`${root}dist/Scripts.html`, 'utf8');
  const original = html.slice(8, -9);
  const candidate = reconstructCommentNormalization(original);
  assert.equal(candidate.parsedFormMatchesOriginal, true, 'parsed code must match, not just compile');
  new vm.Script(candidate.source);
  assert.ok(Buffer.byteLength(candidate.source) < Buffer.byteLength(original));
  assert.ok(candidate.source.includes('script.textContent = source;'));
  const expression = /const error = new Error\((`Pustaka [^\n]+`)\);/.exec(candidate.source)?.[1];
  assert.ok(expression, 'the actual Pustaka message retains both backticks and the complete interpolation');
  assert.equal(vm.runInNewContext(expression, { labels: { pdf: 'PDF' }, asset: 'pdf' }),
    'Pustaka PDF belum dapat dimuat atau diverifikasi. Coba tindakan ini lagi; jika versi aplikasi berubah, muat ulang halaman.');
});

test('offline reconstruction never treats changed string contents or a cropped literal as comment-only equivalence', () => {
  for (const source of ['const text = "/* this is data */";', 'const link = "https://example.test/a";', 'const text = `cropped']) {
    assert.equal(reconstructCommentNormalization(source).parsedFormMatchesOriginal, false);
  }
  const original = '/* one line */\n/* several\n * lines\n */\nconst text = `Pustaka ${"PDF"}`; // retry\n';
  const candidate = reconstructCommentNormalization(original);
  assert.equal(candidate.source, ' \n\n\nconst text = `Pustaka ${"PDF"}`; \n');
  assert.equal(candidate.parsedFormMatchesOriginal, true);
});

function fixture() {
  const files = { Index: '<html>\n<?!= include_("Scripts"); ?>\n</html>',
    Styles: '<style>\n/* palette */\nbody { color: green; }\n</style>',
    Scripts: '<script>\n/* header\n * more\n */\nconst text = `Pustaka ${"PDF"}`; // comment\n</script>',
    RenderProbe: '<script>\n/* probe */\nvoid 0;\n</script>' };
  const originals = { ...files, Index: files.Index.replace(/\n/g, '\r\n'),
    Styles: '<style>\n' + files.Styles.slice(8, -9).replace(/\n/g, '\r\n') + '\n</style>' };
  const retrieved = { Index: originals.Index.replace(/<\?/g, '&lt;?'), Styles: reconstructBlockComments(originals.Styles),
    Scripts: reconstructCommentNormalization(originals.Scripts).source,
    RenderProbe: reconstructCommentNormalization(originals.RenderProbe).source };
  const fp = describeRenderContent;
  const core = fp(retrieved.Scripts.slice(8, -9));
  const report = { schema: 1, build: { core: fp(originals.Scripts.slice(8, -9)),
    files: Object.fromEntries(Object.entries(originals).map(([name, text]) => [name, fp(text)])) },
  server: { files: Object.fromEntries(Object.entries(retrieved).map(([name, text]) => [name, fp(text)])),
    retrievedCore: core, evaluated: { core } }, browser: { core } };
  return { files, report };
}

test('report analysis independently matches build, retrieval, template and DOM fingerprints without echoing report fields', () => {
  const { files, report } = fixture();
  report.privateValue = 'PRIVATE_SENTINEL';
  report.browser.errors = [{ message: 'PRIVATE_SENTINEL' }];
  const result = analyzeRenderReport(files, report);
  assert.equal(result.conclusion, 'EXACT_COMMENT_NORMALIZATION_REPRODUCED');
  assert.equal(result.core.parsedFormMatchesOriginal, true);
  assert.equal(result.core.reconstructed.syntax.valid, true);
  assert.ok(Object.values(result.files).every((item) => item.buildReproduced && item.retrievedReproduced));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});

test('report analysis rejects content changes, truncation and unavailable DOM evidence instead of relaxing integrity checks', () => {
  for (const stage of ['build', 'retrieved', 'evaluated', 'browser', 'file', 'missing browser']) {
    const { files, report } = fixture();
    const changed = describeRenderContent('const changed = true;');
    if (stage === 'build') report.build.core = changed;
    if (stage === 'retrieved') report.server.retrievedCore = changed;
    if (stage === 'evaluated') report.server.evaluated.core = changed;
    if (stage === 'browser') report.browser.core = changed;
    if (stage === 'file') report.server.files.Scripts = changed;
    if (stage === 'missing browser') delete report.browser;
    assert.equal(analyzeRenderReport(files, report).conclusion, 'NOT_REPRODUCED', stage);
  }
  const { files, report } = fixture();
  files.Scripts = files.Scripts.slice(0, -12) + '</script>';
  assert.equal(analyzeRenderReport(files, report).conclusion, 'NOT_REPRODUCED');
});

test('matching probe hashes cannot classify changed string contents as benign normalization', () => {
  const { files, report } = fixture();
  files.RenderProbe = '<script>const text = "/* payload, not a comment */";</script>';
  report.build.files.RenderProbe = describeRenderContent(files.RenderProbe);
  report.server.files.RenderProbe = describeRenderContent('<script>const text = " ";</script>');
  const result = analyzeRenderReport(files, report);
  assert.equal(result.files.RenderProbe.retrievedReproduced, true);
  assert.equal(result.files.RenderProbe.parsedFormMatchesOriginal, false);
  assert.equal(result.conclusion, 'NOT_REPRODUCED');
});
