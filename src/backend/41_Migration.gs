function stage3Status_(context) {
  admin_(context);
  var sheet = context.book.getSheetByName('ProfilSiswa');
  if (sheet && sheet.getLastRow() > 0) rows_(context, 'ProfilSiswa');
  return { version: sheet && sheet.getLastRow() > 0 ? 2 : 1, ready: !!sheet && sheet.getLastRow() > 0 };
}

function migrateStage3_(context) {
  admin_(context);
  if (stage3Status_(context).ready) return { ready: true, version: 2, changed: false };
  Object.keys(DatabaseSchema_.sheets).filter(function (name) { return name !== 'ProfilSiswa'; }).forEach(function (name) { rows_(context, name); });
  // A complete, verified copy precedes any mutation. Existing cells are never rewritten.
  var name = 'Cadangan SIA sebelum Tahap 3 ' + new Date().toISOString();
  var backup = context.book.copy(name);
  var originals = context.book.getSheets();
  if (backup.getSheets().length !== originals.length || originals.some(function (sheet) {
    var copy = backup.getSheetByName(sheet.getName());
    if (!copy) return true;
    var a = sheet.getDataRange();
    var b = copy.getDataRange();
    return revision_([a.getValues(), a.getFormulas()]) !== revision_([b.getValues(), b.getFormulas()]);
  })) fail_('RECOVERY_REQUIRED', 'Cadangan belum terverifikasi. Migrasi dibatalkan tanpa mengubah data lama.');
  var sheet = context.book.getSheetByName('ProfilSiswa') || context.book.insertSheet('ProfilSiswa');
  if (sheet.getLastRow() !== 0) fail_('CONFLICT', 'Tab profil berubah saat persiapan. Periksa data sebelum melanjutkan.');
  sheet.getRange(1, 1, 1, DatabaseSchema_.sheets.ProfilSiswa.length).setValues([DatabaseSchema_.sheets.ProfilSiswa]);
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  context.cache = {};
  return { ready: true, version: 2, changed: true, backupName: name };
}
