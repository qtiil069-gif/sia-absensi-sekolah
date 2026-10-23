/* Shared form controls, inline feedback and accessible editors. */
(() => {
  const { element } = window.SIA.dom;
  function button(text, onClick, kind = 'light') {
    const node = element('button', text, `button ${kind}`);
    node.type = 'button';
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }
  function field(label, options = {}) {
    const wrap = element('label', undefined, 'form-field');
    wrap.append(element('span', label));
    const input = element(options.options ? 'select' : options.multiline ? 'textarea' : 'input');
    input.setAttribute('aria-label', label);
    if (options.options) options.options.forEach(([value, text]) => input.append(new Option(text, value)));
    else input.type = options.type || 'text';
    if (options.required) input.required = true;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    if (options.value !== undefined) input.value = options.value;
    if (options.placeholder) input.placeholder = options.placeholder;
    wrap.append(input);
    return { wrap, input };
  }
  function feedback(host) {
    const node = element('p', '', 'page-feedback');
    node.setAttribute('role', 'status');
    node.hidden = true;
    host.append(node);
    return (text, error = false) => {
      node.textContent = text;
      node.hidden = !text;
      node.classList.toggle('is-error', error);
      node.setAttribute('role', error ? 'alert' : 'status');
    };
  }
  function editor(host, title) {
    const panel = element('section', undefined, 'record-editor');
    panel.append(element('h3', title));
    const form = element('form', undefined, 'record-form');
    const message = feedback(panel);
    const actions = element('div', undefined, 'form-actions');
    const submit = button('Simpan', null, 'coral');
    submit.type = 'submit';
    actions.append(submit, button('Batal', () => panel.remove()));
    panel.append(form);
    host.replaceChildren(panel);
    const setBusy = (value) => form.querySelectorAll('input,select,textarea,button').forEach((control) => { control.disabled = value; });
    return { panel, form, message, actions, submit, setBusy };
  }
  function actions(edit, deactivate, active = true) {
    const group = element('div', undefined, 'row-actions');
    const off = button('Nonaktifkan', deactivate);
    off.disabled = !active;
    group.append(button('Edit', edit), off);
    return group;
  }
  function debounce(fn) {
    let timer;
    return () => { clearTimeout(timer); timer = setTimeout(fn, 200); };
  }
  window.SIA.forms = { button, field, feedback, editor, actions, debounce };
})();
