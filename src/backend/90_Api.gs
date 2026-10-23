function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('SIA Sekolah · Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(name) {
  if (['Styles', 'Scripts'].indexOf(name) === -1) throw new Error('Template tidak dikenal.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function respond_(callback) {
  try {
    return { ok: true, data: callback(authorize_()) };
  } catch (error) {
    var known = ['CONFIG_REQUIRED', 'UNAUTHENTICATED', 'FORBIDDEN', 'SCHEMA_MISMATCH', 'DATA_INVALID', 'INVALID_ARGUMENT'];
    var safe = known.indexOf(error.code) !== -1;
    if (!safe) console.error('SIA backend: kegagalan layanan internal.');
    return { ok: false, error: { code: safe ? error.code : 'INTERNAL',
      message: safe ? error.message : 'Layanan Sheets belum dapat dibaca. Hubungi administrator.' } };
  }
}

function getBootstrap() {
  return respond_(function (context) {
    var settings = {};
    rows_(context, 'Pengaturan').forEach(function (item) { settings[item.key] = item.value; });
    return { user: { id: context.user.user_id, name: context.user.nama, role: context.user.role },
      school: { name: settings.school_name || 'SIA Sekolah', semester: settings.semester_label || 'Semester aktif' },
      today: today_(), timeZone: Session.getScriptTimeZone(), classes: classes_(context) };
  });
}

function getDashboard(options) {
  return respond_(function (context) { return dashboard_(context, options); });
}

function listClasses() {
  return respond_(function (context) { return classes_(context); });
}

function listStudents(options) {
  return respond_(function (context) {
    options = options || {};
    var classes = classes_(context);
    if (options.classId !== undefined && typeof options.classId !== 'string') {
      fail_('INVALID_ARGUMENT', 'ID kelas harus berupa teks.');
    }
    if (options.classId) {
      classes = classes.filter(function (item) { return item.id === options.classId; });
      if (!classes.length) fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
    }
    return students_(context, classes);
  });
}
