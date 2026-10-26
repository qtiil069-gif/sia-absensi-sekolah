/** Static browser libraries only; the existing responder authenticates every request. */
function getBrowserAsset(input) {
  return respond_(function () { return browserAssetParts_(input); });
}

function browserAssetParts_(input) {
  input = inputObject_(input, ['asset', 'version', 'start', 'count']);
  if (['qr', 'pdf', 'excel'].indexOf(input.asset) === -1) fail_('INVALID_ARGUMENT', 'Pustaka browser tidak dikenal.');
  if (typeof input.version !== 'string' || !/^[a-f0-9]{64}$/.test(input.version)) {
    fail_('INVALID_ARGUMENT', 'Versi pustaka browser tidak valid.');
  }
  var meta = BrowserAssets_[input.asset];
  if (!meta || meta.file !== 'Asset_' + input.asset || !/^[a-f0-9]{64}$/.test(meta.sha256) ||
      meta.partSize !== 32768 || !Number.isInteger(meta.bytes) || meta.bytes < 1 ||
      !Number.isInteger(meta.encodedLength) || meta.encodedLength < 4 || meta.encodedLength % 4 !== 0 ||
      meta.parts !== Math.ceil(meta.encodedLength / meta.partSize)) throw new Error('Invalid browser asset manifest.');
  if (input.version !== meta.sha256) fail_('CONFLICT', 'Versi pustaka berbeda. Muat ulang aplikasi sebelum mencoba lagi.');
  if (!Number.isInteger(input.start) || input.start < 0 || input.start >= meta.parts ||
      !Number.isInteger(input.count) || input.count < 1 || input.count > 8 || input.start + input.count > meta.parts) {
    fail_('INVALID_ARGUMENT', 'Rentang bagian pustaka browser tidak valid.');
  }
  // The filename comes exclusively from a verified generated manifest, never input.
  var encoded = HtmlService.createHtmlOutputFromFile(meta.file).getContent().replace(/[\r\n]/g, '');
  if (encoded.length !== meta.encodedLength || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Incomplete or invalid browser asset file.');
  }
  var parts = [];
  for (var offset = input.start; offset < input.start + input.count; offset++) {
    parts.push(encoded.slice(offset * meta.partSize, (offset + 1) * meta.partSize));
  }
  return { asset: input.asset, version: meta.sha256, start: input.start, parts: parts };
}
