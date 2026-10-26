import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { backend } from './helpers/backend.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture(options) {
  const runtime = backend(options);
  const manifest = {};
  const files = new Map();
  const reads = [];
  const sources = {};
  for (const asset of ['qr', 'pdf', 'excel']) {
    const source = `// Synthetic static library ${asset}: é 漢字\nconst data = "${'ABCD'.repeat(70000)}";`;
    const bytes = Buffer.from(source);
    const encoded = bytes.toString('base64');
    manifest[asset] = { file: `Asset_${asset}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
      encodedLength: encoded.length, partSize: 32768, parts: Math.ceil(encoded.length / 32768) };
    files.set(`Asset_${asset}`, encoded);
    sources[asset] = source;
  }
  runtime.api.BrowserAssets_ = manifest;
  runtime.api.HtmlService.createHtmlOutputFromFile = (name) => {
    reads.push(name);
    if (!files.has(name)) throw new Error('PRIVATE_LOCAL_ASSET_PATH');
    return { getContent: () => files.get(name) };
  };
  const request = (asset = 'pdf', changes = {}) => ({ asset, version: manifest[asset]?.sha256, start: 0, count: 1, ...changes });
  return { ...runtime, manifest, files, sources, reads, request };
}

test('authenticated admin and teacher read bounded static asset chunks without writes or locks', () => {
  for (const email of ['admin@example.test', 'guru@example.test']) {
    const { api, manifest, sources, tables, metrics, request, reads } = fixture({ email });
    const before = JSON.stringify([...tables]);
    for (const asset of ['qr', 'pdf', 'excel']) {
      const chunks = [];
      for (let start = 0; start < manifest[asset].parts; start += 8) {
        const count = Math.min(8, manifest[asset].parts - start);
        const result = plain(api.getBrowserAsset(request(asset, { start, count })));
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.data.asset, asset);
        assert.equal(result.data.version, manifest[asset].sha256);
        assert.equal(result.data.start, start);
        assert.equal(result.data.parts.length, count);
        chunks.push(...result.data.parts);
      }
      assert.equal(Buffer.from(chunks.join(''), 'base64').toString('utf8'), sources[asset]);
    }
    assert.ok(reads.every((name) => /^Asset_(qr|pdf|excel)$/.test(name)));
    assert.equal(metrics.writes, 0);
    assert.equal(metrics.locks, 0);
    assert.equal(metrics.locked, false);
    assert.equal(JSON.stringify([...tables]), before);
  }
});

test('asset RPC authenticates before reading files or accepting frontend role claims', () => {
  for (const [options, code] of [
    [{ email: '' }, 'UNAUTHENTICATED'], [{ email: 'asing@example.test' }, 'FORBIDDEN'],
    [{ email: 'nonaktif@example.test' }, 'FORBIDDEN'], [{ configured: false }, 'CONFIG_REQUIRED'],
    [{ overrides: { Pengguna: [{ user_id: 'U1', email: 'admin@example.test', role: 'SUPERADMIN', aktif: true }] } }, 'FORBIDDEN']
  ]) {
    const { api, request, reads, metrics } = fixture(options);
    const result = api.getBrowserAsset(request('pdf', { role: 'ADMIN_KEPALA_SEKOLAH' }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    assert.equal(result.data, undefined);
    assert.deepEqual(reads, []);
    assert.equal(metrics.writes, 0);
  }
});

test('asset RPC rejects unknown IDs, path access, arbitrary fields, and malformed payloads', () => {
  const { api, request, reads } = fixture();
  for (const input of [undefined, null, [], 'pdf', ...['../Index', 'Styles', 'constructor', '__proto__', '', 5, {}, null]
    .map((asset) => request('pdf', { asset })), request('pdf', { file: 'Index' }), request('pdf', { role: 'ADMIN_KEPALA_SEKOLAH' })]) {
    assert.equal(api.getBrowserAsset(input).error.code, 'INVALID_ARGUMENT', JSON.stringify(input));
  }
  assert.deepEqual(reads, []);
});

test('asset versions are pinned and invalid chunk ranges never read files', () => {
  const { api, manifest, request, reads } = fixture();
  assert.equal(api.getBrowserAsset(request('pdf', { version: '0'.repeat(64) })).error.code, 'CONFLICT');
  for (const version of [undefined, null, 7, '', 'wrong', manifest.pdf.sha256.toUpperCase()]) {
    assert.equal(api.getBrowserAsset(request('pdf', { version })).error.code, 'INVALID_ARGUMENT');
  }
  for (const [start, count] of [[-1, 1], [0.5, 1], ['0', 1], [NaN, 1], [Infinity, 1], [undefined, 1],
    [manifest.pdf.parts, 1], [0, 0], [0, 9], [0, -1], [0, '1'], [0, 1.5], [0, undefined], [manifest.pdf.parts - 1, 2]]) {
    assert.equal(api.getBrowserAsset(request('pdf', { start, count })).error.code, 'INVALID_ARGUMENT', `${start}/${count}`);
  }
  assert.deepEqual(reads, []);
});

test('missing, truncated, or malformed static payloads fail internally without private details', () => {
  for (const mutate of [
    (files) => files.delete('Asset_pdf'),
    (files) => files.set('Asset_pdf', files.get('Asset_pdf').slice(0, -4)),
    (files) => files.set('Asset_pdf', '<' + files.get('Asset_pdf').slice(1)),
    (files) => files.set('Asset_pdf', ' ' + files.get('Asset_pdf').slice(1))
  ]) {
    const { api, files, request, metrics } = fixture();
    mutate(files);
    const result = plain(api.getBrowserAsset(request()));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INTERNAL');
    assert.equal(result.data, undefined);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
    assert.equal(metrics.writes, 0);
  }
});

test('CR/LF wrapping of inert Base64 assets preserves every returned part', () => {
  const { api, files, manifest, request } = fixture();
  const encoded = files.get('Asset_pdf');
  files.set('Asset_pdf', encoded.match(/.{1,80}/g).join('\r\n') + '\n');
  for (let start = 0; start < manifest.pdf.parts; start++) {
    const result = api.getBrowserAsset(request('pdf', { start }));
    assert.equal(result.ok, true);
    assert.equal(result.data.parts[0], encoded.slice(start * 32768, (start + 1) * 32768));
  }
});

test('invalid generated manifest cannot request arbitrary filenames or publish incomplete asset metadata', () => {
  for (const changes of [{ file: '../Index' }, { partSize: 1024 }, { encodedLength: 3 }, { parts: 0 }, { bytes: -1 }, { sha256: 'invalid' }]) {
    const { api, manifest, request, reads } = fixture();
    const input = request();
    Object.assign(manifest.pdf, changes);
    assert.equal(api.getBrowserAsset(input).error.code, 'INTERNAL');
    assert.deepEqual(reads, []);
  }
});
