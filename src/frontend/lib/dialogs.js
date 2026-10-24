(() => {
  const { element } = window.SIA.dom;
  const { button, feedback } = window.SIA.forms;
  function dialog(title, className = '', onClose = () => {}) {
    const node = element('dialog', undefined, `app-dialog ${className}`);
    node.setAttribute('aria-label', title);
    const header = element('div', undefined, 'dialog-header');
    header.append(element('h2', title), button('Tutup', () => node.close()));
    const body = element('div', undefined, 'dialog-body');
    const actions = element('div', undefined, 'dialog-actions');
    node.append(header);
    const message = feedback(node);
    node.append(body, actions);
    const cleanup = () => { onClose(); node.remove(); document.body.classList.remove('printing-cards'); };
    node.addEventListener('close', cleanup, { once: true });
    document.body.append(node);
    node.showModal();
    return { node, body, actions, message, close: () => node.close() };
  }
  window.SIA.dialog = dialog;
})();
