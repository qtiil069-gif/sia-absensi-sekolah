import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import * as esbuild from 'esbuild';

// Vendor code is shipped as inert Base64 data, never initial HtmlService script
// text. Runtime verifies the decoded UTF-8 source before executing an asset.
export async function buildBrowserAssets(root) {
  const entries = { qr: 'vendors.mjs', pdf: 'pdf-vendor.mjs', excel: 'excel-vendor.mjs' };
  const assets = await Promise.all(Object.entries(entries).map(async ([id, entry]) => {
    const contents = await readFile(path.join(root, 'src/frontend/lib', entry), 'utf8');
    const result = await esbuild.build({ stdin: { contents, resolveDir: root, loader: 'js' },
      bundle: true, platform: 'browser', format: 'iife', target: 'es2020', write: false,
      minify: true, legalComments: 'inline', logLevel: 'silent' });
    const source = result.outputFiles[0].text;
    new vm.Script(source, { filename: `vendor-${id}.js` });
    const bytes = Buffer.from(source, 'utf8');
    const encoded = bytes.toString('base64');
    const partSize = 32768;
    const manifest = { file: `Asset_${id}`, sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length, encodedLength: encoded.length, partSize, parts: Math.ceil(encoded.length / partSize) };
    return { id, manifest, encoded, source };
  }));
  return { assets, manifest: Object.fromEntries(assets.map(({ id, manifest }) => [id, manifest])) };
}
