(() => {
  const { element } = window.SIA.dom;
  let active = null;

  function clear() {
    if (!active) return;
    clearTimeout(active.timer);
    active.region.remove();
    active = null;
  }

  function show(text, error = false) {
    const message = String(text || '');
    if (!message) return;
    if (active?.node.isConnected && active.message === message && active.error === error) return;
    clear();
    const region = element('div', undefined, 'toast-region');
    region.setAttribute('aria-label', 'Notifikasi aplikasi');
    const node = element('div', undefined, 'toast ' + (error ? 'toast--error' : 'toast--success'));
    node.setAttribute('role', error ? 'alert' : 'status');
    node.setAttribute('aria-atomic', 'true');
    const icon = element('span', error ? '!' : '✓', 'toast-icon');
    icon.setAttribute('aria-hidden', 'true');
    const close = element('button', '×', 'toast-close');
    close.type = 'button'; close.setAttribute('aria-label', 'Tutup notifikasi');
    close.addEventListener('click', clear);
    node.append(icon, element('span', message, 'toast-message'), close);
    region.append(node);
    // Native modal dialogs occupy the browser top layer. A body notification,
    // regardless of z-index, would sit behind their backdrop and be inert.
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    (dialogs[dialogs.length - 1] || document.body).append(region);
    const state = { region, node, message, error, timer: null };
    active = state;
    const pause = () => clearTimeout(state.timer);
    const resume = () => {
      pause();
      if (active !== state || node.matches(':hover') || node.contains(document.activeElement)) return;
      state.timer = setTimeout(() => { if (active === state) clear(); }, error ? 7000 : 5000);
    };
    node.addEventListener('pointerenter', pause);
    node.addEventListener('pointerleave', resume);
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', () => setTimeout(resume, 0));
    resume();
  }

  window.SIA.toast = { success: (text) => show(text), error: (text) => show(text, true), clear };
})();
