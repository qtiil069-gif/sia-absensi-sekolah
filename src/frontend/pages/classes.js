(() => {
  const { element } = window.SIA.dom;
  const { button, field, feedback, editor, actions, debounce } = window.SIA.forms;
  const { table } = window.SIA.components;
  window.SIA.pages = {};
  window.SIA.pages.classes = async (host, context) => {
    const admin = context.user.role === 'ADMIN_KEPALA_SEKOLAH';
    const tools = element('div', undefined, 'page-tools');
    const query = field('Cari kelas', { type: 'search', maxLength: 100, placeholder: 'Nama kelas…' });
    const level = field('Tingkat', { options: [['', 'Semua tingkat'], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1)])] });
    tools.append(query.wrap, level.wrap);
    const status = field('Status kelas', { options: [['active', 'Aktif'], ['inactive', 'Nonaktif'], ['all', 'Semua status']] });
    if (admin) tools.append(status.wrap);
    host.append(tools);
    const message = feedback(host);
    const editorHost = element('div');
    const body = element('div');
    host.append(editorHost, body);
    let version = 0;
    let metadata = { years: [], teachers: [] };
    let saving = false;
    const current = () => context.isCurrent() && host.isConnected;
    async function load() {
      const request = ++version;
      body.setAttribute('aria-busy', 'true');
      try {
        const records = await context.rpc('listClasses', { q: query.input.value, level: level.input.value, status: admin ? status.input.value : 'active' });
        if (!current() || request !== version) return;
        body.replaceChildren(table(['Kelas', 'Tingkat', 'Tahun ajaran', 'Status', ...(admin ? ['Tindakan'] : [])], records.map((row) => {
          const cells = [row.name, row.level, metadata.years.find((year) => year.id === row.yearId)?.name || row.yearId, row.active ? 'Aktif' : 'Nonaktif'];
          if (admin) cells.push(actions(() => open(row), () => deactivate(row), row.active));
          return cells;
        })));
      } catch (error) {
        if (current() && request === version) { body.replaceChildren(); message(error.message, true); }
      } finally { if (request === version) body.setAttribute('aria-busy', 'false'); }
    }
    function open(row) {
      if (saving) return;
      const ui = editor(editorHost, row ? 'Edit kelas' : 'Tambah kelas');
      const name = field('Nama kelas', { required: true, maxLength: 60, value: row?.name || '' });
      const grade = field('Tingkat kelas', { type: 'number', min: 1, max: 12, required: true, value: row?.level || 1 });
      const year = field('Tahun ajaran', { required: true, options: [['', 'Pilih tahun ajaran'], ...metadata.years.filter((item) => item.active || item.id === row?.yearId).map((item) => [item.id, item.name])] });
      const teacher = field('Wali kelas', { options: [['', 'Belum ditetapkan'], ...metadata.teachers.map((item) => [item.id, item.name])] });
      year.input.value = row?.yearId || metadata.years.find((item) => item.active)?.id || '';
      teacher.input.value = row?.homeroomId || '';
      ui.form.append(name.wrap, grade.wrap, year.wrap, teacher.wrap, ui.actions);
      name.input.focus();
      if (!metadata.years.length) ui.message('Isi tab TahunAjaran terlebih dahulu. Struktur database tidak diubah oleh form ini.', true);
      ui.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saving) return;
        saving = true;
        ui.setBusy(true);
        ui.message('Menyimpan…');
        try {
          await context.rpc(row ? 'updateClass' : 'createClass', { name: name.input.value, level: Number(grade.input.value), yearId: year.input.value, homeroomId: teacher.input.value,
            ...(row ? { id: row.id, expectedRevision: row.revision } : {}) });
          if (!current()) return;
          ui.panel.remove();
          message('Kelas berhasil disimpan.');
          await load();
        } catch (error) { if (current()) ui.message(error.message, true); }
        finally { saving = false; ui.setBusy(false); }
      });
    }
    async function deactivate(row) {
      if (!row.active || saving || !confirm(`Nonaktifkan kelas ${row.name}? Data siswa dan riwayat tetap disimpan.`)) return;
      saving = true;
      try {
        await context.rpc('deactivateClass', { id: row.id, expectedRevision: row.revision });
        if (!current()) return;
        editorHost.replaceChildren();
        message('Kelas dinonaktifkan. Data dan riwayat tetap tersimpan.');
        await load();
      } catch (error) { if (current()) message(error.message, true); }
      finally { saving = false; }
    }
    tools.append(button('Muat ulang', () => { editorHost.replaceChildren(); message(''); load(); }));
    if (admin) tools.append(button('Tambah kelas', () => open(), 'coral'));
    query.input.addEventListener('input', debounce(load));
    level.input.addEventListener('change', load);
    status.input.addEventListener('change', load);
    if (admin) metadata = await context.rpc('getRosterOptions');
    if (current()) await load();
  };
})();
