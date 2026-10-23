function inputObject_(value, keys) {
  if (value === undefined) value = {};
  if (!value || Object.prototype.toString.call(value) !== '[object Object]' || Object.keys(value).some(function (key) {
    return keys.indexOf(key) === -1;
  })) fail_('INVALID_ARGUMENT', 'Format permintaan atau nama kolom tidak valid.');
  return value;
}

function textInput_(value, label, max, optional, multiline) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string') fail_('INVALID_ARGUMENT', label + ' harus berupa teks.');
  value = value.trim();
  var control = multiline ? /[\x00-\x09\x0b-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
  if ((!optional && !value) || value.length > max || control.test(value) || /^[=+@-]/.test(value)) {
    fail_('INVALID_ARGUMENT', label + ' kosong, terlalu panjang, atau mengandung awalan formula/karakter terlarang.');
  }
  return value;
}

function idInput_(value, optional) {
  value = textInput_(value, 'ID', 100, optional);
  if (value && !/^[A-Za-z0-9_-]+$/.test(value)) fail_('INVALID_ARGUMENT', 'Format ID tidak valid.');
  return value;
}

function admin_(context) {
  if (context.user.role !== 'ADMIN_KEPALA_SEKOLAH') fail_('FORBIDDEN', 'Hanya Admin Kepala Sekolah yang dapat mengelola data master.');
}

function revision_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function checkRevision_(expected, actual) {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) {
    fail_('INVALID_ARGUMENT', 'Versi data wajib disertakan. Muat ulang data sebelum menyimpan.');
  }
  if (expected !== actual) fail_('CONFLICT', 'Data telah berubah. Muat ulang dan periksa perubahan sebelum menyimpan kembali.');
}

function uniqueRow_(context, table, key, id) {
  var found = rows_(context, table).filter(function (row) { return row[key] === id; });
  if (found.length > 1) fail_('DATA_INVALID', 'ID duplikat pada tab ' + table + '.');
  if (!found.length) fail_('NOT_FOUND', 'Data tidak ditemukan. Muat ulang halaman.');
  return found[0];
}

function queryStatus_(options, context) {
  var status = options.status === undefined ? 'active' : options.status;
  if (['active', 'inactive', 'all'].indexOf(status) === -1) fail_('INVALID_ARGUMENT', 'Filter status tidak valid.');
  if (status !== 'active') admin_(context);
  return status;
}

function matchesStatus_(row, status) {
  return status === 'all' || isActive_(row.aktif) === (status === 'active');
}

function searchInput_(value) {
  return textInput_(value, 'Pencarian', 100, true).toLocaleLowerCase();
}
