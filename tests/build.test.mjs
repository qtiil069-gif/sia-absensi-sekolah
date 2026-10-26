import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build, root } from '../scripts/build.mjs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { escapeHtmlServiceScript } from '../scripts/htmlservice-script.mjs';

test('build produces clasp package with valid manifest, private schema and no demo fixtures', async () => {
  await build();
  const files = await readdir(`${root}dist`);
  assert.equal(files.length, (await readdir(`${root}src/backend`)).filter((name) => name.endsWith('.gs')).length + 9);
  assert.ok(files.every((file) => /\.(gs|html|json)$/.test(file)));
  const manifest = JSON.parse(await readFile(`${root}dist/appsscript.json`, 'utf8'));
  assert.equal(manifest.webapp.access, 'MYSELF');
  assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
  const context = vm.createContext({});
  for (const file of files.filter((name) => name.endsWith('.gs')).sort()) {
    vm.runInContext(await readFile(`${root}dist/${file}`, 'utf8'), context, { filename: file });
  }
  assert.equal(typeof context.getDashboard, 'function');
  assert.equal(context.DatabaseSchema_.version, 2);
  const scripts = await readFile(`${root}dist/Scripts.html`, 'utf8');
  assert.ok(!scripts.includes('window.SIA_PREVIEW = true'));
  assert.ok(!scripts.includes('DEMO-ADMIN'));
  assert.ok(!scripts.includes('Siswa Contoh'));
  assert.ok(Buffer.byteLength(scripts) < 150000, 'initial application code stays independent of multi-megabyte vendors');
  assert.doesNotMatch(scripts, /AAAL0AAAAAACAAAAbW50clJHQi|AAEAAAARAQAABAAQR0RFR/,
    'PDF color profiles and embedded fonts must not be initial executable HTML');
  const body = scripts.slice('<script>\n'.length, scripts.lastIndexOf('</script>'));
  assert.doesNotMatch(body, /\r/, 'inline JavaScript uses the same LF bytes as the HTML parser');
  assert.doesNotMatch(body, /<\?|\?>/, 'XML delimiters must not reach the host HTML processor');
  assert.doesNotMatch(body, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
  new vm.Script(body);
  const preview = await readFile(`${root}.preview/index.html`, 'utf8');
  assert.ok(preview.includes('window.SIA_PREVIEW = true'));
  assert.ok(preview.includes('/__demo/rpc'));
  assert.ok(!preview.includes('<!-- SCRIPTS -->'));
  new vm.Script(preview.slice(preview.indexOf('<script>') + 8, preview.lastIndexOf('</script>')));
  const index = await readFile(`${root}dist/Index.html`, 'utf8');
  assert.ok(index.includes("<?!= include_('Styles'); ?>"));
  assert.ok(index.includes("<?!= include_('Scripts'); ?>"));
  assert.ok(!index.includes('<!-- SCRIPTS -->'));
  const browserAssets = JSON.parse(JSON.stringify(context.BrowserAssets_));
  assert.deepEqual(Object.keys(browserAssets), ['qr', 'pdf', 'excel']);
  assert.deepEqual(JSON.parse(await readFile(`${root}.preview/browser-assets.json`, 'utf8')), browserAssets);
  const pinned = /window\.SIA\.assetManifest = (\{[^\n]+\});/.exec(body);
  assert.ok(pinned);
  assert.deepEqual(JSON.parse(pinned[1]), browserAssets, 'client and server must pin the same build');
  for (const [id, asset] of Object.entries(browserAssets)) {
    assert.equal(asset.file, `Asset_${id}`);
    assert.equal(asset.partSize, 32768);
    assert.equal(asset.parts, Math.ceil(asset.encodedLength / asset.partSize));
    const encoded = await readFile(`${root}dist/${asset.file}.html`, 'utf8');
    assert.match(encoded, /^[A-Za-z0-9+/]+={0,2}$/);
    assert.equal(encoded.length, asset.encodedLength);
    const bytes = Buffer.from(encoded, 'base64');
    assert.equal(bytes.toString('base64'), encoded, 'payload has canonical, complete Base64');
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes), 'UTF-8 roundtrip preserves every byte');
    new vm.Script(bytes.toString('utf8'), { filename: asset.file });
    assert.ok(!index.includes(asset.file), 'asset data is never included in the initial HTML');
  }
});

test('PDF asset retains the complete upstream ICC profile and four font literals outside initial HTML', async () => {
  const assetManifest = JSON.parse(await readFile(`${root}.preview/browser-assets.json`, 'utf8'));
  const pdf = Buffer.from(await readFile(`${root}dist/${assetManifest.pdf.file}.html`, 'utf8'), 'base64').toString('utf8');
  const upstream = await readFile(`${root}node_modules/pdfmake/build/pdfmake.js`, 'utf8');
  const icc = /var iccProfileBase64 = "([A-Za-z0-9+/=]+)";/.exec(upstream)?.[1];
  assert.ok(icc, 'locate the original PDFKit color profile rather than assuming it is a font');
  assert.equal(icc.length, 4032);
  assert.equal(Buffer.from(icc, 'base64').toString('ascii', 36, 40), 'acsp');
  assert.ok(pdf.includes(`"${icc}"`), 'ICC data and both delimiters survive bundling and encoding');
  const fonts = (await import('../node_modules/pdfmake/build/vfs_fonts.js')).default;
  assert.equal(Object.keys(fonts).length, 4);
  for (const [name, base64] of Object.entries(fonts)) {
    assert.ok(pdf.includes(`"${base64}"`), `${name} remains complete, including its closing quote`);
  }
});

test('HtmlService escaping preserves XML, regex and binary values without introducing executable HTML', () => {
  const source = [
    'globalThis.values = [',
    '`<?xml version="1.0"?>\\n<root/>`,',
    '`<?xpacket begin="header"?>\\n<?xpacket end="w"?>`,',
    `"${String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i).filter((i) => ![10,13].includes(i)))}",`,
    String.raw`/^<\?[\s\S]*?\?>/.test('<?xml version="1.0"?>'),`,
    String.raw`/^<!--[\s\S]*?-->/.test('<!-- comment -->'),`,
    String.raw`'literal $& and backtick: \x60'];`
  ].join('\n');
  const evaluate = (code) => {
    const context = vm.createContext({});
    vm.runInContext(code, context);
    return Array.from(context.values);
  };
  const escaped = escapeHtmlServiceScript(source);
  assert.doesNotMatch(escaped, /<\?|\?>|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
  assert.deepEqual(evaluate(escaped), evaluate(source));
  assert.equal(escapeHtmlServiceScript(escaped), escaped, 'escaping is idempotent');
  assert.throws(() => escapeHtmlServiceScript('const text = "</ScRiPt >";'), /closing script tag/);
});

test('build is deterministic when run repeatedly', async () => {
  await build();
  const snapshot = async () => Promise.all((await readdir(`${root}dist`)).sort().map((file) => readFile(`${root}dist/${file}`, 'utf8')));
  const before = await snapshot();
  await build();
  assert.deepEqual(await snapshot(), before);
});
