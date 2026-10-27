import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { backend } from './helpers/backend.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));
const fingerprint = (text) => ({ bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') });
const body = '\nwindow.fixture = "STATIC_CODE_MARKER é 漢字 😀";\n';
function fixture(options) {
  const runtime = backend(options);
  const files = {
    Index: '<!doctype html><html lang="id"><head><?!= include_(\'Styles\'); ?></head><body><main id="app-shell">Static UI</main><?!= include_(\'Scripts\'); ?></body></html>',
    Styles: '<style>body { color: #234; }</style>',
    Scripts: '<script>' + body + '</script>',
    RenderProbe: '<script>window.SIA_RENDER_PROBE={afterCore:function(){}};</script>'
  };
  const reads = [];
  runtime.api.HtmlService.createHtmlOutputFromFile = (name) => {
    reads.push(name);
    if (!(name in files)) throw new Error('PRIVATE_STATIC_PATH');
    return runtime.api.HtmlService.createHtmlOutput(files[name]);
  };
  const build = { schema: 1, id: fingerprint('synthetic-render-build').sha256, files: {}, core: fingerprint(body) };
  for (const [name, text] of Object.entries(files)) build.files[name] = fingerprint(text);
  runtime.api.RenderBuild_ = build;
  const evaluate = () => files.Index.replace("<?!= include_('Styles'); ?>", () => files.Styles)
    .replace("<?!= include_('Scripts'); ?>", () => files.Scripts);
  return { ...runtime, files, reads, build, evaluate };
}
function textarea(html, id) {
  const match = new RegExp('<textarea[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)<\\/textarea>').exec(html);
  assert.ok(match, id);
  return match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
const reportFrom = (html) => JSON.parse(textarea(html, 'sia-render-report'));
const diagnostic = (api) => api.doGet({ parameter: { diagnostic: 'render' } }).getContent();

test('normal doGet retains the original template chain without diagnostic authorization or generated reads', () => {
  const { api, evaluate, reads } = fixture({ configured: false });
  api.authorize_ = () => { throw new Error('Normal doGet must not authorize earlier than before'); };
  Object.defineProperty(api, 'RenderBuild_', { configurable: true, get: () => { throw new Error('No diagnostic build read'); } });
  for (const event of [undefined, {}, { parameter: {} }, { parameter: { diagnostic: 'other' } }]) {
    const output = api.doGet(event);
    assert.equal(output.getContent(), evaluate());
    assert.equal(output.title, 'SIA Sekolah · Dashboard');
    assert.deepEqual(plain(output.meta), [{ name: 'viewport', value: 'width=device-width, initial-scale=1' }]);
  }
  assert.ok(!reads.includes('RenderProbe'));
});

test('admin rendering diagnostics compare static/evaluated metadata without database writes or identity leakage', () => {
  const { api, files, build, tables, metrics, calls } = fixture();
  const before = JSON.stringify([...tables]);
  build.secret = 'SHOULD_NOT_EXPORT';
  build.files.Scripts.snapshotHtml = files.Scripts;
  const html = diagnostic(api);
  const report = reportFrom(html);
  assert.equal(report.schema, 1);
  assert.equal(report.build.id, build.id);
  assert.deepEqual(report.browser, { status: 'pending' });
  for (const name of ['Index', 'Styles', 'Scripts', 'RenderProbe']) {
    assert.deepEqual(report.server.files[name], { ...fingerprint(files[name]), matchesBuild: true });
  }
  assert.deepEqual(report.server.retrievedCore, { ...fingerprint(body), matchesBuild: true });
  assert.equal(report.server.evaluated.coreCount, 1);
  assert.equal(report.server.evaluated.status, 'ok');
  assert.equal(report.server.evaluated.coreMatchesRetrieved, true);
  assert.deepEqual(report.server.evaluated.core, { ...fingerprint(body), matchesBuild: true });
  assert.equal(Buffer.from(textarea(html, 'sia-render-expected'), 'base64').toString('utf8'), body);
  assert.equal(/<script id="sia-render-core">([\s\S]*?)<\/script>/.exec(html)[1], body, 'body bytes are unchanged');
  assert.ok(html.indexOf('id="sia-render-diagnostics"') < html.indexOf('id="app-shell"'));
  assert.ok(html.includes(files.RenderProbe + '<script id="sia-render-core">'));
  assert.ok(html.includes('</script><script>window.SIA_RENDER_PROBE && window.SIA_RENDER_PROBE.afterCore();</script>'));
  for (const id of ['sia-render-build', 'sia-render-status', 'sia-render-refresh', 'sia-render-download']) assert.ok(html.includes('id="' + id + '"'));
  const json = JSON.stringify(report);
  for (const forbidden of ['SHOULD_NOT_EXPORT', 'STATIC_CODE_MARKER', 'snapshotHtml', 'admin@example.test', 'SHEET_TEST_ID', 'Admin Uji', 'Sekolah Uji', 'sourceURL', 'stack']) {
    assert.ok(!json.includes(forbidden), forbidden);
  }
  assert.equal(JSON.stringify([...tables]), before);
  assert.equal(metrics.writes, 0);
  assert.equal(metrics.backups, 0);
  assert.equal(metrics.locks, 0);
  assert.deepEqual(calls, ['Pengguna']);
});

test('diagnostics remain admin-only and denied requests read no static files or error details', () => {
  for (const options of [{ email: '' }, { email: 'guru@example.test' }, { email: 'asing@example.test' },
    { email: 'nonaktif@example.test' }, { configured: false },
    { overrides: { Pengguna: [{ user_id: 'U1', email: 'admin@example.test', role: 'SUPERADMIN', aktif: true }] } }]) {
    const { api, reads, metrics } = fixture(options);
    const html = api.doGet({ parameter: { diagnostic: 'render', role: 'ADMIN_KEPALA_SEKOLAH' } }).getContent();
    assert.match(html, /Diagnostik rendering tidak tersedia/);
    assert.doesNotMatch(html, /sia-render-report|PRIVATE_|APP_SPREADSHEET_ID|admin@example.test|SHEET_TEST_ID/);
    assert.deepEqual(reads, []);
    assert.equal(metrics.writes, 0);
    assert.equal(metrics.locks, 0);
  }
});

test('changed static retrieval is distinguished from the original build and expected data is retrieved core', () => {
  const { api, files } = fixture();
  const changed = '\nwindow.fixture = "CHANGED_RETRIEVAL'; // Also valid diagnostic evidence when app JS has broken syntax.
  files.Scripts = '<script>' + changed + '</script>';
  const html = diagnostic(api);
  const report = reportFrom(html);
  assert.equal(report.server.files.Scripts.matchesBuild, false);
  assert.equal(report.server.retrievedCore.matchesBuild, false);
  assert.equal(report.server.evaluated.core.matchesBuild, false);
  assert.equal(report.server.evaluated.coreMatchesRetrieved, true);
  assert.equal(Buffer.from(textarea(html, 'sia-render-expected'), 'base64').toString('utf8'), changed);
  assert.ok(html.includes('<script id="sia-render-core">' + changed + '</script>'));
  assert.ok(!JSON.stringify(report).includes('CHANGED_RETRIEVAL'));
});

test('evaluation changes are reported independently of retrieved static files', () => {
  const { api, evaluate } = fixture();
  const altered = '\nwindow.fixture = "CHANGED_EVALUATION";\n';
  api.HtmlService.createTemplateFromFile = () => ({ evaluate: () => api.HtmlService.createHtmlOutput(evaluate().replace(body, altered)) });
  const html = diagnostic(api);
  const report = reportFrom(html);
  assert.equal(report.server.files.Scripts.matchesBuild, true);
  assert.equal(report.server.retrievedCore.matchesBuild, true);
  assert.equal(report.server.evaluated.core.matchesBuild, false);
  assert.equal(report.server.evaluated.coreMatchesRetrieved, false);
  assert.equal(Buffer.from(textarea(html, 'sia-render-expected'), 'base64').toString('utf8'), body);
  assert.equal(/<script id="sia-render-core">([\s\S]*?)<\/script>/.exec(html)[1], altered);
});

test('zero, multiple or external executable candidates produce a standalone ambiguous report', () => {
  for (const [script, count] of [['', 0], ['<script type="application/json">{}</script>', 0],
    ['<script>one()</script><script>two()</script>', 2], ['<script src="https://private.example.invalid/path"></script>', 1]]) {
    const { api } = fixture();
    api.HtmlService.createTemplateFromFile = () => ({ evaluate: () => api.HtmlService.createHtmlOutput('<html><body><main id="app-shell">Unsafe choice</main>' + script + '</body></html>') });
    const html = diagnostic(api);
    const report = reportFrom(html);
    assert.equal(report.server.evaluated.status, 'ambiguous-core');
    assert.equal(report.server.evaluated.coreCount, count);
    assert.equal(report.server.evaluated.core, null);
    assert.equal(report.server.evaluated.coreMatchesRetrieved, false);
    assert.doesNotMatch(html, /id="sia-render-core"|id="app-shell"|private\.example/);
  }
});

test('ambiguous static envelope, missing probe or evaluation failure leaves readable server-only evidence', () => {
  for (const mode of ['ambiguous', 'missing probe', 'evaluation failure']) {
    const { api, files } = fixture();
    if (mode === 'ambiguous') files.Scripts += '<script>second()</script>';
    if (mode === 'missing probe') delete files.RenderProbe;
    if (mode === 'evaluation failure') api.HtmlService.createTemplateFromFile = () => { throw new Error('PRIVATE_TEMPLATE_STACK'); };
    const html = diagnostic(api);
    const report = reportFrom(html);
    assert.doesNotMatch(html, /id="sia-render-core"|id="app-shell"|PRIVATE_/);
    assert.equal(report.browser.status, 'pending');
    if (mode === 'ambiguous') assert.equal(report.server.retrievedCore.status, 'ambiguous-core');
    if (mode === 'missing probe') assert.equal(report.server.files.RenderProbe.status, 'unavailable');
    if (mode === 'evaluation failure') assert.equal(report.server.evaluated.status, 'unavailable');
  }
});

test('diagnostic metadata/HTML helpers count UTF-8 bytes and escape closing textarea or markup', () => {
  const { api } = fixture();
  const text = 'é 漢字 😀\r\n';
  assert.deepEqual(plain(api.renderFingerprint_(text)), fingerprint(text));
  assert.equal(api.renderEscapeText_('</textarea><img src="x" onerror=\'x\'>&'), '&lt;/textarea&gt;&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;&amp;');
  api.RenderBuild_.id = '</textarea><script>unsafe()</script>';
  const html = diagnostic(api);
  assert.match(html, /Diagnostik rendering tidak tersedia/);
  assert.doesNotMatch(html, /unsafe\(\)|sia-render-report/);
});
