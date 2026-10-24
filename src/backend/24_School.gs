function imageInput_(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 40000) fail_('INVALID_ARGUMENT', 'Gambar maksimal 28 KB setelah diperkecil.');
  var match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail_('INVALID_ARGUMENT', 'Gambar harus PNG atau JPEG hasil unggahan yang valid.');
  var bytes;
  try { bytes = Utilities.base64Decode(match[2]).map(function (b) { return (b + 256) % 256; }); }
  catch (error) { fail_('INVALID_ARGUMENT', 'Data gambar tidak valid.'); }
  if (bytes.length > 28000 || bytes.length < 12) fail_('INVALID_ARGUMENT', 'Ukuran gambar tidak valid.');
  var valid = match[1] === 'png' ? [137,80,78,71,13,10,26,10].every(function (n, i) { return bytes[i] === n; }) :
    match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217 :
      bytes.slice(0, 4).join(',') === '82,73,70,70' && bytes.slice(8, 12).join(',') === '87,69,66,80';
  if (!valid) fail_('INVALID_ARGUMENT', 'Isi gambar tidak sesuai format.');
  return value;
}

function displayImage_(value) {
  return typeof value === 'string' && value.length <= 40000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}

function schoolSettings_(context) {
  var settings = Object.create(null);
  rows_(context, 'Pengaturan').forEach(function (row) {
    if (settings[row.key]) fail_('DATA_INVALID', 'Kunci Pengaturan duplikat.');
    settings[row.key] = row;
  });
  var read = function (key) { return settings[key] ? String(settings[key].value) : ''; };
  var dto = { name: read('school_name') || 'SIA Sekolah', logo: displayImage_(read('school_logo')), address: read('school_address'),
    identity: read('school_identity'), semester: read('semester_label') || 'Semester aktif' };
  dto.revision = revision_(['school_name', 'school_logo', 'school_address', 'school_identity'].map(function (key) { return settings[key] || null; }));
  return dto;
}

function updateSchool_(context, input) {
  admin_(context);
  input = inputObject_(input, ['name', 'logo', 'address', 'identity', 'expectedRevision']);
  checkRevision_(input.expectedRevision, schoolSettings_(context).revision);
  var values = { school_name: textInput_(input.name, 'Nama sekolah', 120), school_logo: imageInput_(input.logo),
    school_address: textInput_(input.address, 'Alamat sekolah', 500, true, true),
    school_identity: textInput_(input.identity, 'Identitas sekolah', 200, true) };
  var changes = Object.keys(values).map(function (key) {
    var current = rows_(context, 'Pengaturan').filter(function (row) { return row.key === key; })[0];
    return change_('Pengaturan', current, { key: key, value: values[key], description: current ? current.description : 'Pengaturan identitas sekolah' });
  });
  changes.push(auditChange_(context, 'UPDATE_SCHOOL', 'Pengaturan', 'school'));
  applyChanges_(context, changes);
  return schoolSettings_(context);
}

function profileRows_(context, required) {
  var sheet = context.book.getSheetByName('ProfilSiswa');
  if (!sheet || sheet.getLastRow() === 0) {
    if (required) fail_('MIGRATION_REQUIRED', 'Admin perlu menjalankan persiapan Tahap 3 melalui Pengaturan Sekolah.');
    return [];
  }
  return rows_(context, 'ProfilSiswa');
}

function profile_(context, id) {
  var matches = profileRows_(context, false).filter(function (row) { return row.student_id === id; });
  if (matches.length > 1) fail_('DATA_INVALID', 'Profil siswa duplikat.');
  return matches[0] || null;
}
