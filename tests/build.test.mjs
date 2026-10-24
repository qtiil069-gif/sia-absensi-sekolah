import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build, root } from '../scripts/build.mjs';
import vm from 'node:vm';

test('build produces clasp package with valid manifest, private schema and no demo fixtures', async () => {
  await build();
  const files = await readdir(`${root}dist`);
  assert.equal(files.length, (await readdir(`${root}src/backend`)).filter((name) => name.endsWith('.gs')).length + 5);
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
  const preview = await readFile(`${root}.preview/index.html`, 'utf8');
  assert.ok(preview.includes('window.SIA_PREVIEW = true'));
  assert.ok(preview.includes('/__demo/rpc'));
  assert.ok(!preview.includes('<!-- SCRIPTS -->'));
  new vm.Script(preview.slice(preview.indexOf('<script>') + 8, preview.lastIndexOf('</script>')));
  const index = await readFile(`${root}dist/Index.html`, 'utf8');
  assert.ok(index.includes("<?!= include_('Styles'); ?>"));
  assert.ok(index.includes("<?!= include_('Scripts'); ?>"));
  assert.ok(!index.includes('<!-- SCRIPTS -->'));
});

test('build is deterministic when run repeatedly', async () => {
  await build();
  const snapshot = async () => Promise.all((await readdir(`${root}dist`)).sort().map((file) => readFile(`${root}dist/${file}`, 'utf8')));
  const before = await snapshot();
  await build();
  assert.deepEqual(await snapshot(), before);
});
