function studentDto_(context, row, permittedIds, detailed) {
  var memberships = rows_(context, 'KeanggotaanKelas').filter(function (item) {
    return item.student_id === row.student_id && isActive_(item.aktif);
  });
  var dto = { id: row.student_id, name: row.nama, nis: String(row.nis), active: isActive_(row.aktif),
    classIds: memberships.filter(function (item) { return !permittedIds || permittedIds.indexOf(item.class_id) !== -1; })
      .map(function (item) { return item.class_id; }) };
  var profile = profile_(context, row.student_id);
  dto.guardianName = profile ? profile.wali_nama : '';
  dto.guardianPhone = profile ? String(profile.wali_telepon).replace(/^'(?=\+)/, '') : '';
  dto.guardianRelation = profile ? profile.wali_hubungan : '';
  dto.photo = profile ? displayImage_(profile.foto_data_url) : '';
  if (detailed) {
    dto.nisn = String(row.nisn);
    dto.revision = revision_([row, memberships, profile]);
  }
  return dto;
}

function queryStudents_(context, options) {
  options = inputObject_(options, ['q', 'classId', 'status', 'page', 'pageSize']);
  var status = queryStatus_(options, context);
  var query = searchInput_(options.q);
  var classId = idInput_(options.classId, true);
  var admin = context.user.role === 'ADMIN_KEPALA_SEKOLAH';
  var permitted = admin ? null : classes_(context).map(function (row) { return row.id; });
  if (classId && (admin ? !rows_(context, 'Kelas').some(function (row) { return row.class_id === classId; }) : permitted.indexOf(classId) === -1)) {
    fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
  }
  var page = options.page === undefined ? 1 : options.page;
  var pageSize = options.pageSize === undefined ? 25 : options.pageSize;
  if (!Number.isInteger(page) || page < 1 || page > 10000 || [10, 25, 50, 100].indexOf(pageSize) === -1) {
    fail_('INVALID_ARGUMENT', 'Pagination tidak valid. Ukuran halaman: 10, 25, 50, atau 100.');
  }
  var students = rows_(context, 'Siswa').filter(function (row) {
    return matchesStatus_(row, status) && (!query || String(row.nama).toLocaleLowerCase().indexOf(query) !== -1 ||
      String(row.nis).toLocaleLowerCase().indexOf(query) !== -1);
  }).map(function (row) { return studentDto_(context, row, permitted, admin); }).filter(function (dto) {
    return (!permitted || dto.classIds.length > 0) && (!classId || dto.classIds.indexOf(classId) !== -1);
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id); });
  var pages = Math.max(1, Math.ceil(students.length / pageSize));
  page = Math.min(page, pages);
  return { items: students.slice((page - 1) * pageSize, page * pageSize), total: students.length,
    page: page, pageSize: pageSize, pages: pages };
}

function activeClass_(context, classId) {
  var room = uniqueRow_(context, 'Kelas', 'class_id', classId);
  if (!isActive_(room.aktif)) fail_('INVALID_ARGUMENT', 'Kelas tujuan harus aktif.');
  return room;
}

function studentFields_(context, input, current) {
  var name = textInput_(input.name, 'Nama siswa', 120);
  var nis = textInput_(input.nis, 'NIS', 30);
  if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(nis)) fail_('INVALID_ARGUMENT', 'NIS hanya boleh berisi huruf, angka, titik, garis miring, garis bawah, atau tanda hubung.');
  var nisn = textInput_(input.nisn, 'NISN', 10, true);
  if (nisn && !/^\d{10}$/.test(nisn)) fail_('INVALID_ARGUMENT', 'NISN harus 10 digit atau dikosongkan.');
  if (rows_(context, 'Siswa').some(function (row) {
    return (!current || row.student_id !== current.student_id) && String(row.nis).trim().toLocaleLowerCase() === nis.toLocaleLowerCase();
  })) fail_('DUPLICATE', 'NIS sudah digunakan, termasuk oleh siswa nonaktif.');
  activeClass_(context, idInput_(input.classId));
  return { nama: name, nis: nis, nisn: nisn, updated_at: new Date().toISOString() };
}

function saveStudent_(context, input, editing) {
  admin_(context);
  input = inputObject_(input, (editing ? ['id', 'name', 'nis', 'nisn', 'classId', 'expectedRevision'] : ['name', 'nis', 'nisn', 'classId'])
    .concat(['guardianName', 'guardianPhone', 'guardianRelation', 'photo']));
  var row = editing ? uniqueRow_(context, 'Siswa', 'student_id', idInput_(input.id)) : null;
  if (row) checkRevision_(input.expectedRevision, studentDto_(context, row, null, true).revision);
  var fields = studentFields_(context, input, row);
  var id = row ? row.student_id : Utilities.getUuid();
  if (!row) { fields.student_id = id; fields.aktif = true; fields.created_at = fields.updated_at; }
  var changes = [change_('Siswa', row, fields)];
  if (['guardianName', 'guardianPhone', 'guardianRelation', 'photo'].some(function (key) { return Object.prototype.hasOwnProperty.call(input, key); })) {
    profileRows_(context, true);
    var oldProfile = profile_(context, id);
    var profileFields = { student_id: id, qr_token: oldProfile ? oldProfile.qr_token : Utilities.getUuid(), updated_at: fields.updated_at };
    var profileKeys = { guardianName: 'wali_nama', guardianPhone: 'wali_telepon', guardianRelation: 'wali_hubungan', photo: 'foto_data_url' };
    Object.keys(profileKeys).forEach(function (key) {
      var column = profileKeys[key];
      if (!Object.prototype.hasOwnProperty.call(input, key)) { profileFields[column] = oldProfile ? oldProfile[column] : ''; return; }
      if (key === 'photo') profileFields[column] = imageInput_(input[key]);
      else if (key === 'guardianPhone') {
        if (typeof input[key] !== 'string' || input[key].length > 30 || !/^[+0-9 ()-]*$/.test(input[key])) fail_('INVALID_ARGUMENT', 'Format nomor wali tidak valid.');
        var phone = input[key].trim().replace(/[ ()-]/g, '');
        if (phone && !/^\+?\d{8,18}$/.test(phone)) fail_('INVALID_ARGUMENT', 'Nomor telepon/WhatsApp wali harus 8–18 digit dengan kode negara opsional.');
        profileFields[column] = phone.charAt(0) === '+' ? "'" + phone : phone;
      } else profileFields[column] = textInput_(input[key], key === 'guardianName' ? 'Nama wali' : 'Hubungan wali', key === 'guardianName' ? 120 : 60, true);
    });
    changes.push(change_('ProfilSiswa', oldProfile, profileFields));
  }
  var memberships = rows_(context, 'KeanggotaanKelas').filter(function (item) { return item.student_id === id; });
  var target = memberships.filter(function (item) { return item.class_id === input.classId && isActive_(item.aktif); });
  if (target.length > 1) fail_('DATA_INVALID', 'Keanggotaan kelas aktif duplikat. Hubungi administrator.');
  memberships.forEach(function (item) {
    if (isActive_(item.aktif) && item.class_id !== input.classId) changes.push(change_('KeanggotaanKelas', item, { aktif: false }));
  });
  if (!target.length) changes.push(change_('KeanggotaanKelas', null, {
    enrollment_id: Utilities.getUuid(), student_id: id, class_id: input.classId, aktif: true
  }));
  changes.push(auditChange_(context, editing ? 'UPDATE_STUDENT' : 'CREATE_STUDENT', 'Siswa', id));
  applyChanges_(context, changes);
  return studentDto_(context, uniqueRow_(context, 'Siswa', 'student_id', id), null, true);
}

function deactivateStudent_(context, input) {
  admin_(context);
  input = inputObject_(input, ['id', 'expectedRevision']);
  var row = uniqueRow_(context, 'Siswa', 'student_id', idInput_(input.id));
  checkRevision_(input.expectedRevision, studentDto_(context, row, null, true).revision);
  if (isActive_(row.aktif)) applyChanges_(context, [change_('Siswa', row, { aktif: false, updated_at: new Date().toISOString() }),
    auditChange_(context, 'DEACTIVATE_STUDENT', 'Siswa', row.student_id)]);
  return studentDto_(context, uniqueRow_(context, 'Siswa', 'student_id', row.student_id), null, true);
}
