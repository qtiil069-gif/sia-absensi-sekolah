import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function build() {
  const read = (file) => readFile(path.join(root, file), 'utf8');
  const frontendFiles = ['lib/dom.js', 'lib/forms.js', 'services/api.js', 'components/dashboard.js', 'components/table.js',
    'pages/classes.js', 'pages/students.js', 'pages/attendance.js', 'app.js'];
  const [html, css, frontend, demo, schemaText, manifestText] = await Promise.all([
    read('src/frontend/index.html'), read('src/frontend/styles.css'),
    Promise.all(frontendFiles.map((name) => read(`src/frontend/${name}`))),
    read('dev/demo-transport.js'), read('database/schema.json'), read('src/appsscript.json')
  ]);
  const js = frontend.join('\n');
  const manifest = JSON.parse(manifestText);
  const schema = JSON.parse(schemaText);
  new vm.Script(js);
  new vm.Script(demo);
  const files = (await readdir(path.join(root, 'src/backend'))).filter((file) => file.endsWith('.gs')).sort();
  const backend = await Promise.all(files.map(async (name) => [name, await read(`src/backend/${name}`)]));
  backend.forEach(([name, code]) => new vm.Script(code, { filename: name }));
  for (const marker of ['<!-- STYLES -->', '<!-- SCRIPTS -->']) {
    if (html.split(marker).length !== 2) throw new Error(`Template marker missing or repeated: ${marker}`);
  }
  // Only these owned generated directories are replaced. No changes to src/ or lockfiles.
  for (const name of ['dist', '.preview']) {
    await rm(path.join(root, name), { recursive: true, force: true });
    await mkdir(path.join(root, name), { recursive: true });
  }
  const write = (file, contents) => writeFile(path.join(root, file), contents);
  const gasHtml = html.replace('<!-- STYLES -->', "<?!= include_('Styles'); ?>")
    .replace('<!-- SCRIPTS -->', "<?!= include_('Scripts'); ?>");
  const localHtml = html.replace('<!-- STYLES -->', `<style>\n${css}\n</style>`)
    .replace('<!-- SCRIPTS -->', `<script>window.SIA_PREVIEW = true;\n${demo}\n${js}\n</script>`);
  await Promise.all([
    write('dist/Index.html', gasHtml), write('dist/Styles.html', `<style>\n${css}\n</style>`),
    write('dist/Scripts.html', `<script>\n${js}\n</script>`),
    write('dist/appsscript.json', JSON.stringify(manifest, null, 2) + '\n'),
    write('dist/00_Schema.gs', `// Generated from database/schema.json. Do not edit.\nvar DatabaseSchema_ = ${JSON.stringify(schema, null, 2)};\n`),
    write('.preview/index.html', localHtml),
    ...backend.map(([name, code]) => write(`dist/${name}`, code))
  ]);
  return { backendFiles: files.length + 1, schemaVersion: schema.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Build selesai:', await build());
}
