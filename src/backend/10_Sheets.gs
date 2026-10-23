/** One bulk read per table per request; no cell-by-cell loops or cached identities. */
function rows_(context, name) {
  if (context.cache[name]) return context.cache[name];
  var headers = DatabaseSchema_.sheets[name];
  var sheet = context.book.getSheetByName(name);
  if (!sheet) fail_('SCHEMA_MISMATCH', 'Tab database belum lengkap: ' + name + '.');
  var values = sheet.getDataRange().getValues();
  if (!values.length || headers.some(function (header, index) {
    return values[0][index] !== header;
  }) || values[0].length !== headers.length) {
    fail_('SCHEMA_MISMATCH', 'Header database tidak sesuai: ' + name + '.');
  }
  var rows = values.slice(1).filter(function (row) {
    return row.some(function (cell) { return cell !== ''; });
  }).map(function (row) {
    var result = {};
    headers.forEach(function (header, index) {
      var value = row[index];
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(),
          header === 'tanggal' || header.indexOf('tanggal_') === 0 ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX");
      }
      result[header] = value;
    });
    return result;
  });
  context.cache[name] = rows;
  return rows;
}

function classes_(context) {
  var assignments = context.user.role === 'GURU'
    ? rows_(context, 'PenugasanGuru').filter(function (item) {
      return isActive_(item.aktif) && item.user_id === context.user.user_id;
    }).map(function (item) { return item.class_id; }) : [];
  return rows_(context, 'Kelas').filter(function (item) {
    return isActive_(item.aktif) && (context.user.role === 'ADMIN_KEPALA_SEKOLAH' ||
      item.wali_user_id === context.user.user_id || assignments.indexOf(item.class_id) !== -1);
  }).map(function (item) {
    return { id: item.class_id, name: item.nama, level: item.tingkat, yearId: item.year_id };
  });
}

function students_(context, classes) {
  var classIds = classes.map(function (item) { return item.id; });
  var memberships = rows_(context, 'KeanggotaanKelas').filter(function (item) {
    return isActive_(item.aktif) && classIds.indexOf(item.class_id) !== -1;
  });
  return rows_(context, 'Siswa').filter(function (item) {
    return isActive_(item.aktif) && memberships.some(function (m) { return m.student_id === item.student_id; });
  }).map(function (item) {
    return { id: item.student_id, name: item.nama, nis: String(item.nis), classIds: memberships.filter(function (m) {
      return m.student_id === item.student_id;
    }).map(function (m) { return m.class_id; }) };
  });
}
