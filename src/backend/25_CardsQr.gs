function cardSelection_(context, input) {
  input = inputObject_(input, ['classId', 'studentIds']);
  var rooms = classes_(context);
  var classId = idInput_(input.classId, true);
  var ids = input.studentIds;
  if (classId && ids !== undefined) fail_('INVALID_ARGUMENT', 'Pilih kelas atau siswa individual, bukan keduanya.');
  if (classId) {
    rooms = rooms.filter(function (row) { return row.id === classId; });
    if (!rooms.length) fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
  } else if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(function (id) { return typeof id !== 'string'; }) || new Set(ids).size !== ids.length) {
    fail_('INVALID_ARGUMENT', 'Pilih 1–500 siswa atau satu kelas.');
  }
  var allowed = students_(context, rooms);
  if (ids !== undefined) {
    allowed = allowed.filter(function (row) { return ids.indexOf(row.id) !== -1; });
    if (allowed.length !== ids.length) fail_('FORBIDDEN', 'Siswa harus aktif dan berada di kelas yang dapat diakses.');
  }
  if (!allowed.length || allowed.length > 500) fail_('INVALID_ARGUMENT', 'Tidak ada siswa aktif atau jumlah kartu melebihi 500.');
  return { students: allowed, rooms: rooms };
}

function prepareCards_(context, input) {
  var selection = cardSelection_(context, input);
  var profiles = profileRows_(context, true);
  var changes = [];
  var tokens = Object.create(null);
  profiles.forEach(function (row) {
    if (row.qr_token && !/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(row.qr_token)) fail_('DATA_INVALID', 'Token QR tersimpan tidak valid.');
    if (row.qr_token && tokens[row.qr_token]) fail_('DATA_INVALID', 'Token QR duplikat. Hubungi administrator.');
    if (row.qr_token) tokens[row.qr_token] = true;
  });
  selection.students.forEach(function (student) {
    var profile = profile_(context, student.id);
    if (!profile || !profile.qr_token) {
      var token = Utilities.getUuid();
      if (tokens[token]) fail_('DATA_INVALID', 'Token baru tidak unik. Ulangi persiapan.');
      tokens[token] = true;
      changes.push(change_('ProfilSiswa', profile, { student_id: student.id, wali_nama: profile ? profile.wali_nama : '',
        wali_telepon: profile ? profile.wali_telepon : '', wali_hubungan: profile ? profile.wali_hubungan : '',
        foto_data_url: profile ? profile.foto_data_url : '', qr_token: token, updated_at: new Date().toISOString() }));
    }
  });
  if (changes.length) {
    changes.push(auditChange_(context, 'ISSUE_STUDENT_CARDS', 'ProfilSiswa', 'batch'));
    applyChanges_(context, changes);
  }
  return { school: schoolSettings_(context), cards: selection.students.map(function (student) {
    var raw = uniqueRow_(context, 'Siswa', 'student_id', student.id);
    var profile = profile_(context, student.id);
    return { id: student.id, name: student.name, nis: student.nis, nisn: String(raw.nisn), photo: displayImage_(profile.foto_data_url),
      className: selection.rooms.filter(function (room) { return student.classIds.indexOf(room.id) !== -1; }).map(function (room) { return room.name; }).join(', '),
      qr: 'SIA-ID:1:' + profile.qr_token };
  }) };
}

function exportStudents_(context, input) {
  input = inputObject_(input, ['q', 'classId', 'status']);
  var first = queryStudents_(context, Object.assign({}, input, { page: 1, pageSize: 100 }));
  if (first.total > 500) fail_('INVALID_ARGUMENT', 'Ekspor maksimal 500 siswa. Gunakan filter kelas.');
  var students = first.items;
  for (var page = 2; page <= first.pages; page++) students = students.concat(queryStudents_(context, Object.assign({}, input, { page: page, pageSize: 100 })).items);
  var rooms = context.user.role === 'ADMIN_KEPALA_SEKOLAH' ? rows_(context, 'Kelas').map(classDto_) : queryClasses_(context);
  return { school: schoolSettings_(context), rows: students.map(function (student) {
    var raw = uniqueRow_(context, 'Siswa', 'student_id', student.id);
    return { name: student.name, nis: student.nis, nisn: String(raw.nisn),
      className: rooms.filter(function (room) { return student.classIds.indexOf(room.id) !== -1; }).map(function (room) { return room.name; }).join(', '),
      guardianName: student.guardianName, guardianPhone: student.guardianPhone, guardianRelation: student.guardianRelation, active: student.active };
  }) };
}

function resolveQr_(context, input) {
  var state = attendanceState_(context, input);
  if (typeof input.qr !== 'string' || !/^SIA-ID:1:[a-fA-F0-9-]{36}$/.test(input.qr)) fail_('INVALID_ARGUMENT', 'Format QR siswa tidak valid.');
  var token = input.qr.slice(9);
  var profiles = profileRows_(context, true).filter(function (row) { return row.qr_token === token; });
  if (profiles.length !== 1) fail_('FORBIDDEN', 'QR tidak dikenal atau tidak dapat digunakan.');
  var student = state.dto.entries.filter(function (row) { return row.studentId === profiles[0].student_id; })[0];
  if (!student) fail_('FORBIDDEN', 'Siswa tidak aktif pada kelas dan sesi yang dipilih.');
  var raw = uniqueRow_(context, 'Siswa', 'student_id', student.studentId);
  return { state: state, student: { id: student.studentId, name: student.name, nis: student.nis, nisn: String(raw.nisn),
    photo: displayImage_(profiles[0].foto_data_url), className: uniqueRow_(context, 'Kelas', 'class_id', state.key.classId).nama }, status: student.status };
}

function validateQr_(context, input) {
  input = inputObject_(input, ['classId', 'date', 'kind', 'subjectId', 'qr']);
  var found = resolveQr_(context, input);
  return { student: found.student, status: found.status, expectedRevision: revision_([found.state.dto.revision, found.student]), selection: found.state.key };
}

function saveQr_(context, input) {
  input = inputObject_(input, ['classId', 'date', 'kind', 'subjectId', 'qr', 'expectedRevision']);
  var found = resolveQr_(context, input);
  if (found.status) fail_('DUPLICATE', 'Siswa sudah diabsen pada sesi ini. Gunakan Absensi Manual bila perlu koreksi.');
  checkRevision_(input.expectedRevision, revision_([found.state.dto.revision, found.student]));
  var now = new Date().toISOString();
  var id = found.state.session ? found.state.session.session_id : Utilities.getUuid();
  var changes = [];
  if (!found.state.session) changes.push(change_('SesiAbsensi', null, { session_id: id, class_id: found.state.key.classId,
    tanggal: found.state.key.date, jenis: found.state.key.kind, subject_id: found.state.key.subjectId, created_by: context.user.user_id, created_at: now }));
  changes.push(change_('Absensi', null, { attendance_id: Utilities.getUuid(), session_id: id, student_id: found.student.id,
    status: 'H', catatan: '', recorded_by: context.user.user_id, updated_at: now }));
  changes.push(auditChange_(context, 'QR_ATTENDANCE', 'SesiAbsensi', id));
  applyChanges_(context, changes);
  return attendanceState_(context, found.state.key).dto;
}
