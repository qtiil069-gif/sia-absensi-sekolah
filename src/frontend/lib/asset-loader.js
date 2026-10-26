/* Static, build-pinned libraries travel as bounded RPC data, never initial HTML. */
(() => {
  'use strict';
  const catalog = window.SIA.assetManifest;
  const loads = new Map();
  const labels = { pdf: 'PDF', excel: 'Excel', qr: 'QR' };
  const ready = {
    pdf: () => typeof window.SIA.vendors.pdfMake?.createPdf === 'function',
    excel: () => typeof window.SIA.vendors.ExcelJS?.Workbook === 'function',
    qr: () => typeof window.SIA.vendors.QRCode?.toDataURL === 'function' &&
      typeof window.SIA.vendors.BrowserQRCodeReader === 'function' && typeof window.SIA.vendors.jsQR === 'function'
  };
  const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');

  async function request(args) {
    let timer;
    try {
      return await Promise.race([window.SIA.api.rpc('getBrowserAsset', args), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Asset request timed out')), 30000);
      })]);
    } finally { clearTimeout(timer); }
  }

  async function receive(asset) {
    const meta = catalog[asset];
    const pieces = new Array(meta.parts);
    let next = 0;
    let failed = false;
    async function worker() {
      while (!failed && next < meta.parts) {
        const start = next;
        const count = Math.min(8, meta.parts - start);
        next += count;
        const response = await request({ asset, version: meta.sha256, start, count });
        if (response?.asset !== asset || response.version !== meta.sha256 || response.start !== start ||
            !Array.isArray(response.parts) || response.parts.length !== count) throw new Error('Asset response mismatch');
        response.parts.forEach((part, offset) => {
          const index = start + offset;
          const length = Math.min(meta.partSize, meta.encodedLength - index * meta.partSize);
          if (typeof part !== 'string' || part.length !== length || !/^[A-Za-z0-9+/]+={0,2}$/.test(part)) {
            throw new Error('Asset part missing or truncated');
          }
          pieces[index] = part;
        });
      }
    }
    try { await Promise.all([worker(), worker()]); }
    catch (error) { failed = true; throw error; }
    const encoded = pieces.join('');
    if (encoded.length !== meta.encodedLength) throw new Error('Asset size mismatch');
    const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    if (bytes.length !== meta.bytes || await sha256(bytes) !== meta.sha256) throw new Error('Asset digest mismatch');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // textContent avoids the HTML tokenizer and document.write; no CDN, eval,
    // Blob URL, or parsing of library literals by the host HTML renderer.
    const script = document.createElement('script');
    script.dataset.siaAsset = asset;
    script.dataset.sha256 = meta.sha256;
    script.textContent = source + `\n//# sourceURL=sia-asset-${asset}-${meta.sha256.slice(0, 12)}.js\n`;
    document.head.append(script);
    if (!ready[asset]()) { script.remove(); throw new Error('Asset did not initialize'); }
    return window.SIA.vendors;
  }

  function load(asset) {
    if (!Object.prototype.hasOwnProperty.call(labels, asset) || !Object.prototype.hasOwnProperty.call(catalog, asset)) {
      return Promise.reject(new Error('Pustaka aplikasi tidak dikenal.'));
    }
    if (!loads.has(asset)) {
      const promise = receive(asset).catch(() => {
        loads.delete(asset); // An explicit retry can fetch a fresh, complete asset.
        const error = new Error(`Pustaka ${labels[asset]} belum dapat dimuat atau diverifikasi. Coba tindakan ini lagi; jika versi aplikasi berubah, muat ulang halaman.`);
        error.code = 'ASSET_LOAD_FAILED';
        throw error;
      });
      loads.set(asset, promise);
    }
    return loads.get(asset);
  }
  window.SIA.assets = { load };
})();
