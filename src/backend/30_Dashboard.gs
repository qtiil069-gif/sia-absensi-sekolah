function dashboard_(context, options) {
  options = options || {};
  var date = dateInput_(options.date === undefined ? today_() : options.date);
  var classes = classes_(context);
  if (options.classId !== undefined && typeof options.classId !== 'string') {
    fail_('INVALID_ARGUMENT', 'ID kelas harus berupa teks.');
  }
  if (options.classId) {
    classes = classes.filter(function (item) { return item.id === options.classId; });
    if (!classes.length) fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
  }
  var classIds = classes.map(function (item) { return item.id; });
  var students = students_(context, classes);
  var sessions = rows_(context, 'SesiAbsensi').filter(function (item) {
    return classIds.indexOf(item.class_id) !== -1;
  });
  var monday = new Date(date + 'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  var week = Array.from({ length: 7 }, function (_, i) {
    var day = new Date(monday.getTime());
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
  var relevantSessions = sessions.filter(function (item) { return week.indexOf(item.tanggal) !== -1; });
  var sessionMap = Object.create(null);
  relevantSessions.forEach(function (item) {
    if (sessionMap[item.session_id]) fail_('DATA_INVALID', 'ID sesi absensi duplikat.');
    sessionMap[item.session_id] = item;
  });
  var seen = Object.create(null);
  var attendance = rows_(context, 'Absensi').filter(function (item) {
    return Object.prototype.hasOwnProperty.call(sessionMap, item.session_id);
  }).map(function (item) {
    var key = JSON.stringify([item.session_id, item.student_id]);
    if (seen[key] || ['H', 'S', 'I', 'A'].indexOf(item.status) === -1) {
      fail_('DATA_INVALID', 'Data absensi duplikat atau status tidak valid.');
    }
    seen[key] = true;
    return { date: sessionMap[item.session_id].tanggal, status: item.status };
  });
  function summary(items) {
    var counts = { H: 0, S: 0, I: 0, A: 0 };
    items.forEach(function (item) { counts[item.status] += 1; });
    return { counts: counts, total: items.length,
      rate: items.length ? Math.round(counts.H / items.length * 100) : null };
  }
  var daily = summary(attendance.filter(function (item) { return item.date === date; }));
  var journals = rows_(context, 'Jurnal').filter(function (item) {
    return classIds.indexOf(item.class_id) !== -1 && item.tanggal === date;
  });
  return {
    date: date, scope: context.user.role === 'GURU' ? 'Kelas penugasan Anda' : 'Seluruh kelas aktif',
    stats: { students: students.length, classes: classes.length, attendanceRate: daily.rate,
      sessions: sessions.filter(function (item) { return item.tanggal === date; }).length, journals: journals.length },
    composition: daily,
    weekly: week.map(function (day) {
      var result = summary(attendance.filter(function (item) { return item.date === day; }));
      return { date: day, rate: result.rate, total: result.total };
    })
  };
}
