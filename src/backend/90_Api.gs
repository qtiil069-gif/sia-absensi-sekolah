function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('SIA Sekolah · Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(name) {
  if (['Styles', 'Scripts'].indexOf(name) === -1) throw new Error('Template tidak dikenal.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function respond_(callback, write) {
  var lock;
  var locked = false;
  try {
    if (write) {
      lock = LockService.getScriptLock();
      locked = lock.tryLock(10000);
      if (!locked) fail_('BUSY', 'Layanan sedang menyimpan data lain. Tunggu sebentar lalu muat ulang.');
    }
    return { ok: true, data: callback(authorize_()) };
  } catch (error) {
    var known = ['CONFIG_REQUIRED', 'UNAUTHENTICATED', 'FORBIDDEN', 'SCHEMA_MISMATCH', 'DATA_INVALID', 'INVALID_ARGUMENT',
      'NOT_FOUND', 'DUPLICATE', 'CONFLICT', 'BUSY', 'WRITE_FAILED', 'RECOVERY_REQUIRED', 'MIGRATION_REQUIRED'];
    var safe = known.indexOf(error.code) !== -1;
    if (!safe) console.error('SIA backend: kegagalan layanan internal.');
    return { ok: false, error: { code: safe ? error.code : 'INTERNAL',
      message: safe ? error.message : 'Layanan Sheets mengalami gangguan. Hubungi administrator.' } };
  } finally {
    if (locked) lock.releaseLock();
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

function listClasses(options) {
  return respond_(function (context) { return queryClasses_(context, options); });
}

function getRosterOptions() { return respond_(rosterOptions_); }
function createClass(input) { return respond_(function (context) { return saveClass_(context, input, false); }, true); }
function updateClass(input) { return respond_(function (context) { return saveClass_(context, input, true); }, true); }
function deactivateClass(input) { return respond_(function (context) { return deactivateClass_(context, input); }, true); }

function queryStudents(options) { return respond_(function (context) { return queryStudents_(context, options); }); }
function createStudent(input) { return respond_(function (context) { return saveStudent_(context, input, false); }, true); }
function updateStudent(input) { return respond_(function (context) { return saveStudent_(context, input, true); }, true); }
function deactivateStudent(input) { return respond_(function (context) { return deactivateStudent_(context, input); }, true); }

function getAttendanceOptions(input) { return respond_(function (context) { return attendanceOptions_(context, input); }); }
function getAttendance(input) { return respond_(function (context) { return getAttendance_(context, input); }, true); }
function saveAttendance(input) { return respond_(function (context) { return saveAttendance_(context, input); }, true); }

function getSchoolSettings() { return respond_(function (context) { admin_(context); return schoolSettings_(context); }); }
function updateSchoolSettings(input) { return respond_(function (context) { return updateSchool_(context, input); }, true); }
function getStage3Status() { return respond_(stage3Status_); }
function migrateStage3() { return respond_(migrateStage3_, true); }
function prepareStudentCards(input) { return respond_(function (context) { return prepareCards_(context, input); }, true); }
function exportStudentData(input) { return respond_(function (context) { return exportStudents_(context, input); }); }
function validateStudentQr(input) { return respond_(function (context) { return validateQr_(context, input); }, true); }
function saveQrAttendance(input) { return respond_(function (context) { return saveQr_(context, input); }, true); }

function listStudents(options) {
  return respond_(function (context) {
    if (options === undefined) options = {};
    if (!options || Object.prototype.toString.call(options) !== '[object Object]') inputObject_(options, ['classId']);
    var classes = classes_(context);
    if (options.classId !== undefined && typeof options.classId !== 'string') {
      fail_('INVALID_ARGUMENT', 'ID kelas harus berupa teks.');
    }
    if (options.classId) {
      classes = classes.filter(function (item) { return item.id === options.classId; });
      if (!classes.length) fail_('FORBIDDEN', 'Kelas tidak tersedia untuk akun ini.');
    }
    inputObject_(options, ['classId']);
    return students_(context, classes);
  });
}
