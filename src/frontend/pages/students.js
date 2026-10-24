(() => {
  const { element } = window.SIA.dom;
  const { button, field, feedback, editor, actions, debounce } = window.SIA.forms;
  const { table } = window.SIA.components;
  window.SIA.pages.students = async (host, context) => {
    const admin = context.user.role === 'ADMIN_KEPALA_SEKOLAH';
    const tools = element('div', undefined, 'page-tools');
    const query = field('Cari siswa', { type: 'search', maxLength: 100, placeholder: 'Nama atau NIS…' });
    const rooms = await context.rpc('listClasses', admin ? { status: 'all' } : {});
    if (!context.isCurrent()) return;
    const classFilter = field('Filter kelas siswa', { options: [['', 'Semua kelas'], ...rooms.map((room) => [room.id, room.name + (room.active ? '' : ' (nonaktif)')])] });
    const status = field('Status siswa', { options: [['active', 'Aktif'], ['inactive', 'Nonaktif'], ['all', 'Semua status']] });
    const size = field('Siswa per halaman', { value: '25', options: [10, 25, 50, 100].map((n) => [String(n), String(n)]) });
    tools.append(query.wrap, classFilter.wrap, size.wrap);
    if (admin) tools.append(status.wrap);
    host.append(tools);
    const message = feedback(host); host.lastElementChild.classList.add('students-feedback');
    const editorHost = element('div');
    const body = element('div');
    const pager = element('div', undefined, 'pagination');
    host.append(editorHost, body, pager);
    let page = 1;
    let version = 0;
    let saving = false;
    const current = () => context.isCurrent() && host.isConnected;
    async function load(reset = false) {
      if (reset) page = 1;
      const request = ++version;
      body.setAttribute('aria-busy', 'true');
      try {
        const result = await context.rpc('queryStudents', { q: query.input.value, classId: classFilter.input.value,
          status: admin ? status.input.value : 'active', page, pageSize: Number(size.input.value) });
        if (!current() || request !== version) return;
        page = result.page;
        body.replaceChildren(table(['NIS', 'Nama siswa', 'Kelas', 'Nama wali', 'Telepon/WA wali', 'Hubungan', 'Status', 'Tindakan'], result.items.map((row) => {
          const cells = [row.nis, row.name, row.classIds.map((id) => rooms.find((room) => room.id === id)?.name || id).join(', ') || 'Belum ditetapkan', row.guardianName, row.guardianPhone, row.guardianRelation, row.active ? 'Aktif' : 'Nonaktif'];
          const group = admin ? actions(() => open(row), () => deactivate(row), row.active) : element('div', undefined, 'row-actions');
          const print = button('Cetak kartu ID', () => window.SIA.cards.open(context, rooms, { studentIds: [row.id] }, () => { if (current()) load(); }));
          print.disabled = !row.active; group.append(print); cells.push(group);
          return cells;
        })));
        const previous = button('Sebelumnya', () => { page--; load(); });
        const next = button('Berikutnya', () => { page++; load(); });
        previous.disabled = page <= 1;
        next.disabled = page >= result.pages;
        pager.replaceChildren(element('span', `${result.total} siswa · Halaman ${page} dari ${result.pages}`), previous, next);
      } catch (error) { if (current() && request === version) { body.replaceChildren(); pager.replaceChildren(); message(error.message, true); } }
      finally { if (request === version) body.setAttribute('aria-busy', 'false'); }
    }
    function open(row) {
      if (saving) return;
      const ui = editor(editorHost, row ? 'Edit siswa' : 'Tambah siswa');
      const name = field('Nama siswa', { required: true, maxLength: 120, value: row?.name || '' });
      const nis = field('NIS', { required: true, maxLength: 30, value: row?.nis || '' });
      const nisn = field('NISN (opsional)', { maxLength: 10, value: row?.nisn || '' });
      const room = field('Kelas siswa', { required: true, options: [['', 'Pilih kelas aktif'], ...rooms.filter((item) => item.active).map((item) => [item.id, item.name])] });
      room.input.value = row?.classIds[0] || '';
      const guardian = field('Nama wali murid', { maxLength: 120, value: row?.guardianName || '' });
      const phone = field('Telepon/WhatsApp wali', { type: 'tel', maxLength: 30, value: row?.guardianPhone || '' });
      const relation = field('Hubungan wali dengan siswa', { maxLength: 60, value: row?.guardianRelation || '', placeholder: 'Ayah, Ibu, Wali, …' });
      const photo = window.SIA.images.imageField('Foto siswa', row?.photo || '');
      ui.form.append(name.wrap, nis.wrap, nisn.wrap, room.wrap, guardian.wrap, phone.wrap, relation.wrap, photo.node, ui.actions);
      name.input.focus();
      ui.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saving) return;
        saving = true;
        ui.setBusy(true);
        ui.message('Menyimpan…');
        try {
          await photo.ready();
          const profile = { guardianName: guardian.input.value, guardianPhone: phone.input.value, guardianRelation: relation.input.value, photo: photo.value() };
          const includeProfile = Object.values(profile).some(Boolean) || [row?.guardianName, row?.guardianPhone, row?.guardianRelation, row?.photo].some(Boolean);
          await context.rpc(row ? 'updateStudent' : 'createStudent', { name: name.input.value, nis: nis.input.value, nisn: nisn.input.value, classId: room.input.value,
            ...(includeProfile ? profile : {}),
            ...(row ? { id: row.id, expectedRevision: row.revision } : {}) });
          if (!current()) return;
          ui.panel.remove();
          message('Data siswa berhasil disimpan.');
          await load();
        } catch (error) { if (current()) ui.message(error.message, true); }
        finally { saving = false; ui.setBusy(false); }
      });
    }
    async function deactivate(row) {
      if (!row.active || saving || !confirm(`Nonaktifkan siswa ${row.name}? Data dan riwayat absensi tetap disimpan.`)) return;
      saving = true;
      try {
        await context.rpc('deactivateStudent', { id: row.id, expectedRevision: row.revision });
        if (!current()) return;
        editorHost.replaceChildren();
        message('Siswa dinonaktifkan tanpa menghapus riwayat.');
        await load();
      } catch (error) { if (current()) message(error.message, true); }
      finally { saving = false; }
    }
    tools.append(button('Muat ulang', () => { editorHost.replaceChildren(); message(''); load(); }));
    if (admin) tools.append(button('Tambah siswa', () => open(), 'coral'));
    tools.append(button('Cetak Kartu ID', () => window.SIA.cards.open(context, rooms, null, () => { if (current()) load(); }, classFilter.input.value)));
    tools.append(button('Unduh data Excel / PDF', () => window.SIA.cards.exportsPopup(context, {
      q: query.input.value, classId: classFilter.input.value, status: admin ? status.input.value : 'active'
    })));
    query.input.addEventListener('input', debounce(() => load(true)));
    for (const input of [classFilter.input, status.input, size.input]) input.addEventListener('change', () => load(true));
    await load();
  };
})();
