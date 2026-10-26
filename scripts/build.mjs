import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { escapeHtmlServiceScript } from './htmlservice-script.mjs';
import { buildBrowserAssets } from './browser-assets.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function build() {
  const read = (file) => readFile(path.join(root, file), 'utf8');
  const frontendFiles = ['lib/dom.js', 'lib/router.js', 'lib/forms.js', 'lib/dialogs.js', 'lib/images.js', 'services/api.js', 'lib/asset-loader.js', 'lib/files.js', 'lib/qr-camera.js', 'components/dashboard.js', 'components/table.js', 'components/student-cards.js', 'components/qr-scanner.js',
    'pages/classes.js', 'pages/students.js', 'pages/attendance.js', 'pages/settings.js', 'app.js'];
  const [html, css, frontend, demo, schemaText, manifestText] = await Promise.all([
    read('src/frontend/index.html'), read('src/frontend/styles.css'),
    Promise.all(frontendFiles.map((name) => read(`src/frontend/${name}`))),
    read('dev/demo-transport.js'), read('database/schema.json'), read('src/appsscript.json')
  ]);
  const browserAssets = await buildBrowserAssets(root);
  const pinnedAssets = `window.SIA.vendors = {};\nwindow.SIA.assetManifest = ${JSON.stringify(browserAssets.manifest)};`;
  const js = escapeHtmlServiceScript([frontend[0], pinnedAssets, ...frontend.slice(1)].join('\n'));
  const manifest = JSON.parse(manifestText);
  const schema = JSON.parse(schemaText);
  new vm.Script(js);
  const previewScript = escapeHtmlServiceScript(`window.SIA_PREVIEW = true;\n${demo}\n${js}`);
  new vm.Script(previewScript);
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
  const localHtml = html.replace('<!-- STYLES -->', () => `<style>\n${css}\n</style>`)
    .replace('<!-- SCRIPTS -->', () => `<script>${previewScript}\n</script>`);
  await Promise.all([
    write('dist/Index.html', gasHtml), write('dist/Styles.html', `<style>\n${css}\n</style>`),
    write('dist/Scripts.html', `<script>\n${js}\n</script>`),
    write('dist/appsscript.json', JSON.stringify(manifest, null, 2) + '\n'),
    write('dist/00_Schema.gs', `// Generated from database/schema.json. Do not edit.\nvar DatabaseSchema_ = ${JSON.stringify(schema, null, 2)};\n`),
    write('dist/00_BrowserAssets.gs', `// Generated integrity manifest. Do not edit.\nvar BrowserAssets_ = ${JSON.stringify(browserAssets.manifest, null, 2)};\n`),
    ...browserAssets.assets.map(({ manifest, encoded }) => write(`dist/${manifest.file}.html`, encoded)),
    write('.preview/browser-assets.json', JSON.stringify(browserAssets.manifest, null, 2) + '\n'),
    write('.preview/index.html', localHtml),
    ...backend.map(([name, code]) => write(`dist/${name}`, code))
  ]);
  return { backendFiles: files.length + 2, schemaVersion: schema.version, browserAssets: Object.keys(browserAssets.manifest) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Build selesai:', await build());
}
