/* Read-only roster table; text from Sheets is never parsed as HTML. */
(() => {
  'use strict';
  const { element } = window.SIA.dom;
  function table(headers, rows) {
    if (!rows.length) return element('p', 'Belum ada data yang dapat ditampilkan.');
    const wrap = element('div', undefined, 'table-wrap');
    const root = element('table');
    const head = element('thead');
    const heading = element('tr');
    headers.forEach((text) => {
      const cell = element('th', text);
      cell.scope = 'col';
      heading.append(cell);
    });
    head.append(heading);
    const body = element('tbody');
    rows.forEach((row) => {
      const tr = element('tr');
      row.forEach((value) => tr.append(element('td', String(value))));
      body.append(tr);
    });
    root.append(head, body);
    wrap.append(root);
    return wrap;
  }

  window.SIA.components.table = table;
})();
