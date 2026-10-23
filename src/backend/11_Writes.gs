/** Compensated multi-tab writes under a script lock, not a Sheets transaction.
 * Only changed row ranges are written; no table clearing or permanent deletion.
 */
function change_(table, row, fields) {
  return { table: table, row: row ? row._row : null, fields: fields };
}

function auditChange_(context, action, entity, id) {
  return change_('AuditLog', null, { audit_id: Utilities.getUuid(), actor_user_id: context.user.user_id,
    action: action, entity: entity, entity_id: id, timestamp: new Date().toISOString() });
}

function applyChanges_(context, changes) {
  var groups = Object.create(null);
  changes.forEach(function (change) {
    rows_(context, change.table); // Validate all affected schemas before any content write.
    if (!groups[change.table]) groups[change.table] = [];
    groups[change.table].push(change);
  });
  var plans = [];
  Object.keys(groups).forEach(function (name) {
    var sheet = context.book.getSheetByName(name);
    var headers = DatabaseSchema_.sheets[name];
    var next = sheet.getLastRow() + 1;
    var changesByRow = Object.create(null);
    groups[name].forEach(function (change) {
      var row = change.row || next++;
      if (row < 2 || changesByRow[row]) fail_('DATA_INVALID', 'Rencana penulisan baris tidak valid.');
      changesByRow[row] = change.fields;
    });
    var indexes = Object.keys(changesByRow).map(Number).sort(function (a, b) { return a - b; });
    var end = indexes[indexes.length - 1];
    if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
    var blocks = [];
    indexes.forEach(function (row) {
      var last = blocks[blocks.length - 1];
      if (last && row === last[last.length - 1] + 1) last.push(row);
      else blocks.push([row]);
    });
    blocks.forEach(function (block) {
      var range = sheet.getRange(block[0], 1, block.length, headers.length);
      var values = range.getValues();
      var formulas = range.getFormulas();
      var before = values.map(function (row, i) {
        return row.map(function (value, j) { return formulas[i][j] || value; });
      });
      var after = before.map(function (row, i) {
        return headers.map(function (header, j) {
          var fields = changesByRow[block[i]];
          return Object.prototype.hasOwnProperty.call(fields, header) ? fields[header] : row[j];
        });
      });
      plans.push({ range: range, before: before, after: after });
    });
  });
  var attempted = [];
  try {
    plans.forEach(function (plan) {
      attempted.push(plan); // Include writes whose server acknowledgement may fail.
      plan.range.setValues(plan.after);
    });
    SpreadsheetApp.flush();
  } catch (error) {
    var recovered = true;
    attempted.reverse().forEach(function (plan) {
      try { plan.range.setValues(plan.before); } catch (restoreError) { recovered = false; }
    });
    try { SpreadsheetApp.flush(); } catch (flushError) { recovered = false; }
    if (!recovered) fail_('RECOVERY_REQUIRED', 'Penyimpanan terhenti dan pemulihan belum terkonfirmasi. Hentikan input dan hubungi administrator untuk memeriksa Sheets.');
    fail_('WRITE_FAILED', 'Penyimpanan gagal. Muat ulang dan periksa data sebelum mencoba kembali.');
  }
  context.cache = {};
}
