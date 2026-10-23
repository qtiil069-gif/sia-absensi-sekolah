/** Run manually from the Apps Script editor on a DEVELOPMENT spreadsheet only.
 * No public RPC, no seed accounts, no sample student data, no overwrites.
 */
function initializeDatabase_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var book = openDatabase_();
    var names = Object.keys(DatabaseSchema_.sheets);
    // Validate every existing nonempty table before creating anything.
    names.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (sheet && sheet.getLastRow() > 0) rows_({ book: book, cache: {} }, name);
    });
    names.forEach(function (name) {
      var sheet = book.getSheetByName(name) || book.insertSheet(name);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, DatabaseSchema_.sheets[name].length).setValues([DatabaseSchema_.sheets[name]]);
        sheet.setFrozenRows(1);
      }
    });
    return { schemaVersion: DatabaseSchema_.version, sheets: names.length };
  } finally {
    lock.releaseLock();
  }
}
