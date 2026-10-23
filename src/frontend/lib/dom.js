/* Shared safe DOM utilities. Dynamic values are always text nodes. */
(() => {
  'use strict';
  window.SIA = { components: {} };
  const byId = (id) => document.getElementById(id);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function formatDate(date) {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  window.SIA.dom = { byId, element, formatDate };
})();
