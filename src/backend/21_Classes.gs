function classDto_(row) {
  return { id: row.class_id, name: row.nama, level: row.tingkat, yearId: row.year_id,
    homeroomId: row.wali_user_id, active: isActive_(row.aktif), revision: revision_([
      row.class_id, row.nama, row.tingkat, row.year_id, row.wali_user_id, row.aktif
    ]) };
}

function queryClasses_(context, options) {
  options = inputObject_(options, ['q', 'status', 'yearId', 'level']);
  var status = queryStatus_(options, context);
  var query = searchInput_(options.q);
  var year = idInput_(options.yearId, true);
  var level = options.level === undefined || options.level === '' ? '' : String(options.level);
  if (level && !/^(?:[1-9]|1[0-2])$/.test(level)) fail_('INVALID_ARGUMENT', 'Tingkat harus 1–12.');
  var permitted = context.user.role === 'GURU' ? classes_(context).map(function (row) { return row.id; }) : null;
  return rows_(context, 'Kelas').filter(function (row) {
    return matchesStatus_(row, status) && (!permitted || permitted.indexOf(row.class_id) !== -1) &&
      (!year || row.year_id === year) && (!level || String(row.tingkat) === level) &&
      (!query || String(row.nama).toLocaleLowerCase().indexOf(query) !== -1);
  }).map(classDto_);
}

function rosterOptions_(context) {
  admin_(context);
  return {
    years: rows_(context, 'TahunAjaran').map(function (row) {
      return { id: row.year_id, name: row.nama, active: isActive_(row.aktif) };
    }),
    teachers: rows_(context, 'Pengguna').filter(function (row) { return isActive_(row.aktif); }).map(function (row) {
      return { id: row.user_id, name: row.nama };
    })
  };
}

function classFields_(context, input, current) {
  var name = textInput_(input.name, 'Nama kelas', 60);
  var yearId = idInput_(input.yearId);
  var year = uniqueRow_(context, 'TahunAjaran', 'year_id', yearId);
  if (!isActive_(year.aktif) && (!current || current.year_id !== yearId)) fail_('INVALID_ARGUMENT', 'Tahun ajaran tidak aktif.');
  if (typeof input.level !== 'number' || !Number.isInteger(input.level) || input.level < 1 || input.level > 12) {
    fail_('INVALID_ARGUMENT', 'Tingkat harus bilangan bulat 1–12.');
  }
  var homeroomId = idInput_(input.homeroomId, true);
  if (homeroomId) {
    var teacher = uniqueRow_(context, 'Pengguna', 'user_id', homeroomId);
    if (!isActive_(teacher.aktif) || ['GURU', 'ADMIN_KEPALA_SEKOLAH'].indexOf(teacher.role) === -1) {
      fail_('INVALID_ARGUMENT', 'Wali kelas harus akun aktif dengan role yang diizinkan.');
    }
  }
  var duplicate = rows_(context, 'Kelas').some(function (row) {
    return (!current || row.class_id !== current.class_id) && row.year_id === yearId &&
      String(row.nama).trim().toLocaleLowerCase() === name.toLocaleLowerCase();
  });
  if (duplicate) fail_('DUPLICATE', 'Nama kelas sudah dipakai pada tahun ajaran tersebut, termasuk kelas nonaktif.');
  return { nama: name, tingkat: input.level, year_id: yearId, wali_user_id: homeroomId };
}

function saveClass_(context, input, editing) {
  admin_(context);
  input = inputObject_(input, editing ? ['id', 'name', 'level', 'yearId', 'homeroomId', 'expectedRevision'] : ['name', 'level', 'yearId', 'homeroomId']);
  var current = editing ? uniqueRow_(context, 'Kelas', 'class_id', idInput_(input.id)) : null;
  if (current) checkRevision_(input.expectedRevision, classDto_(current).revision);
  var fields = classFields_(context, input, current);
  var id = current ? current.class_id : Utilities.getUuid();
  if (!current) { fields.class_id = id; fields.aktif = true; }
  applyChanges_(context, [change_('Kelas', current, fields), auditChange_(context, editing ? 'UPDATE_CLASS' : 'CREATE_CLASS', 'Kelas', id)]);
  return classDto_(uniqueRow_(context, 'Kelas', 'class_id', id));
}

function deactivateClass_(context, input) {
  admin_(context);
  input = inputObject_(input, ['id', 'expectedRevision']);
  var row = uniqueRow_(context, 'Kelas', 'class_id', idInput_(input.id));
  checkRevision_(input.expectedRevision, classDto_(row).revision);
  if (isActive_(row.aktif)) applyChanges_(context, [change_('Kelas', row, { aktif: false }), auditChange_(context, 'DEACTIVATE_CLASS', 'Kelas', row.class_id)]);
  return classDto_(uniqueRow_(context, 'Kelas', 'class_id', row.class_id));
}
