/** Private helpers have trailing underscores so google.script.run cannot call them. */
function fail_(code, message) {
  var error = new Error(message);
  error.code = code;
  throw error;
}

function openDatabase_() {
  var id = PropertiesService.getScriptProperties().getProperty('APP_SPREADSHEET_ID');
  if (!id) fail_('CONFIG_REQUIRED', 'Spreadsheet belum dikonfigurasi oleh administrator.');
  return SpreadsheetApp.openById(id);
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function dateInput_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail_('INVALID_ARGUMENT', 'Tanggal harus berformat YYYY-MM-DD.');
  }
  var parsed = new Date(value + 'T00:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail_('INVALID_ARGUMENT', 'Tanggal tidak valid.');
  }
  return value;
}

function isActive_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}
