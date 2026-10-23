function attendanceKey_(context, input) {
  var classId = idInput_(input.classId);
  if (!classes_(context).some(function (room) { return room.id === classId; })) {
    fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
  }
  var date = dateInput_(input.date);
  var kind = input.kind === undefined ? 'HARIAN' : input.kind;
  if (['HARIAN', 'MAPEL'].indexOf(kind) === -1) fail_('INVALID_ARGUMENT', 'Jenis sesi harus HARIAN atau MAPEL.');
  var subjectId = idInput_(input.subjectId, true);
  if (kind === 'HARIAN' && subjectId) fail_('INVALID_ARGUMENT', 'Sesi harian tidak memakai mata pelajaran.');
  if (kind === 'MAPEL') {
    var subject = uniqueRow_(context, 'Mapel', 'subject_id', idInput_(subjectId));
    if (!isActive_(subject.aktif)) fail_('INVALID_ARGUMENT', 'Mata pelajaran harus aktif.');
    if (context.user.role === 'GURU' && !rows_(context, 'PenugasanGuru').some(function (row) {
      return isActive_(row.aktif) && row.user_id === context.user.user_id && row.class_id === classId && row.subject_id === subjectId;
    })) fail_('FORBIDDEN', 'Mata pelajaran tidak ditugaskan kepada akun ini pada kelas tersebut.');
  }
  return { classId: classId, date: date, kind: kind, subjectId: subjectId };
}

function attendanceOptions_(context, input) {
  input = inputObject_(input, ['classId']);
  var classId = idInput_(input.classId);
  if (!classes_(context).some(function (room) { return room.id === classId; })) fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
  var assigned = context.user.role === 'GURU' ? rows_(context, 'PenugasanGuru').filter(function (row) {
    return isActive_(row.aktif) && row.user_id === context.user.user_id && row.class_id === classId;
  }).map(function (row) { return row.subject_id; }) : null;
  return { subjects: rows_(context, 'Mapel').filter(function (row) {
    return isActive_(row.aktif) && (!assigned || assigned.indexOf(row.subject_id) !== -1);
  }).map(function (row) { return { id: row.subject_id, name: row.nama }; }) };
}

function attendanceState_(context, input) {
  var key = attendanceKey_(context, input);
  var allSessions = rows_(context, 'SesiAbsensi');
  var sessions = allSessions.filter(function (row) {
    return row.class_id === key.classId && row.tanggal === key.date && row.jenis === key.kind && (row.subject_id || '') === key.subjectId;
  });
  if (sessions.length > 1) fail_('DATA_INVALID', 'Sesi kelas, tanggal, jenis, dan mapel duplikat. Hubungi administrator.');
  // Refuse to silently create a second session beside malformed legacy data.
  if (allSessions.some(function (row) {
    return row.class_id === key.classId && row.tanggal === key.date && (['HARIAN', 'MAPEL'].indexOf(row.jenis) === -1 ||
      (row.jenis === 'HARIAN' && !!row.subject_id) || (row.jenis === 'MAPEL' && !row.subject_id));
  })) fail_('DATA_INVALID', 'Jenis sesi lama tidak valid. Administrator perlu memeriksa data terlebih dahulu.');
  var session = sessions[0] || null;
  if (session && (!session.session_id || allSessions.filter(function (row) { return row.session_id === session.session_id; }).length !== 1)) {
    fail_('DATA_INVALID', 'ID sesi kosong atau duplikat.');
  }
  var records = session ? rows_(context, 'Absensi').filter(function (row) { return row.session_id === session.session_id; }) : [];
  var byStudent = Object.create(null);
  var attendanceIds = Object.create(null);
  records.forEach(function (row) {
    if (!row.attendance_id || !row.student_id || byStudent[row.student_id] || attendanceIds[row.attendance_id] || ['H', 'S', 'I', 'A'].indexOf(row.status) === -1) {
      fail_('DATA_INVALID', 'ID/status absensi tidak valid atau siswa-sesi duplikat.');
    }
    byStudent[row.student_id] = row;
    attendanceIds[row.attendance_id] = true;
  });
  var roster = students_(context, [{ id: key.classId }]);
  var seen = Object.create(null);
  roster.forEach(function (student) {
    if (seen[student.id]) fail_('DATA_INVALID', 'ID siswa aktif duplikat.');
    seen[student.id] = true;
  });
  var summary = { H: 0, S: 0, I: 0, A: 0, pending: 0 };
  var entries = roster.map(function (student) {
    var row = byStudent[student.id];
    summary[row ? row.status : 'pending']++;
    return { studentId: student.id, name: student.name, nis: student.nis, status: row ? row.status : null,
      note: row ? String(row.catatan || '') : '' };
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'id') || a.studentId.localeCompare(b.studentId); });
  var dto = { classId: key.classId, date: key.date, kind: key.kind, subjectId: key.subjectId,
    sessionId: session ? session.session_id : null, entries: entries, summary: summary,
    retainedCount: records.filter(function (row) { return !seen[row.student_id]; }).length,
    revision: revision_([key, session, records, roster.map(function (row) { return row.id; }).sort()]) };
  return { dto: dto, session: session, records: byStudent, key: key };
}

function getAttendance_(context, input) {
  input = inputObject_(input, ['classId', 'date', 'kind', 'subjectId']);
  return attendanceState_(context, input).dto;
}

function saveAttendance_(context, input) {
  input = inputObject_(input, ['classId', 'date', 'kind', 'subjectId', 'expectedRevision', 'entries']);
  var state = attendanceState_(context, input);
  checkRevision_(input.expectedRevision, state.dto.revision);
  if (!Array.isArray(input.entries) || !input.entries.length || input.entries.length > 500 || input.entries.length !== state.dto.entries.length) {
    fail_('INVALID_ARGUMENT', 'Isi absensi seluruh siswa aktif (maksimal 500) pada kelas dan sesi yang dipilih.');
  }
  var allowed = Object.create(null);
  state.dto.entries.forEach(function (row) { allowed[row.studentId] = true; });
  var seen = Object.create(null);
  var cleaned = input.entries.map(function (entry) {
    entry = inputObject_(entry, ['studentId', 'status', 'note']);
    var id = idInput_(entry.studentId);
    if (!allowed[id] || seen[id]) fail_('INVALID_ARGUMENT', 'Siswa tidak terdaftar aktif pada kelas atau tercantum lebih dari sekali.');
    if (['H', 'S', 'I', 'A'].indexOf(entry.status) === -1) fail_('INVALID_ARGUMENT', 'Setiap siswa wajib berstatus Hadir, Sakit, Izin, atau Alfa.');
    seen[id] = true;
    return { id: id, status: entry.status, note: textInput_(entry.note, 'Catatan', 500, true, true) };
  });
  var changes = [];
  var now = new Date().toISOString();
  var sessionId = state.session ? state.session.session_id : Utilities.getUuid();
  if (!state.session) changes.push(change_('SesiAbsensi', null, { session_id: sessionId,
    class_id: state.key.classId, tanggal: state.key.date, jenis: state.key.kind, subject_id: state.key.subjectId,
    created_by: context.user.user_id, created_at: now }));
  cleaned.forEach(function (entry) {
    var existing = state.records[entry.id];
    changes.push(change_('Absensi', existing, { attendance_id: existing ? existing.attendance_id : Utilities.getUuid(),
      session_id: sessionId, student_id: entry.id, status: entry.status, catatan: entry.note,
      recorded_by: context.user.user_id, updated_at: now }));
  });
  changes.push(auditChange_(context, state.session ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE', 'SesiAbsensi', sessionId));
  applyChanges_(context, changes);
  return attendanceState_(context, state.key).dto;
}
