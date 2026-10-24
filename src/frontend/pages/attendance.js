(() => {
  const { element } = window.SIA.dom;
  const { button, field, feedback } = window.SIA.forms;
  const { table } = window.SIA.components;
  window.SIA.pages.attendance = async (host, context) => {
    const rooms = await context.rpc('listClasses');
    if (!context.isCurrent()) return;
    const message = feedback(host); host.lastElementChild.classList.add('attendance-feedback');
    if (!rooms.length) { message('Tidak ada kelas aktif yang dapat Anda akses. Hubungi administrator.'); return; }
    const filters = element('form', undefined, 'page-tools attendance-filters');
    const room = field('Kelas absensi', { required: true, options: rooms.map((item) => [item.id, item.name]) });
    const date = field('Tanggal absensi', { type: 'date', required: true, value: context.today });
    const kind = field('Jenis sesi', { options: [['HARIAN', 'Harian'], ['MAPEL', 'Mata pelajaran']] });
    const subject = field('Mata pelajaran', { options: [['', 'Tidak digunakan']] });
    const show = button('Tampilkan siswa');
    show.type = 'submit';
    filters.append(room.wrap, date.wrap, kind.wrap, subject.wrap, show);
    const summary = element('div', undefined, 'attendance-summary');
    summary.setAttribute('aria-live', 'polite');
    const controls = element('div', undefined, 'form-actions');
    const body = element('div');
    const caption = element('p', '', 'attendance-caption');
    const fill = button('Isi yang belum diisi: Hadir', () => {
      if (!loaded || saving || !selectionMatches()) return;
      drafts.forEach((draft) => { if (!draft.status) draft.status = 'H'; });
      dirty = true;
      renderRows();
    });
    const save = button('Simpan absensi', saveEntries, 'coral');
    save.disabled = true;
    controls.append(fill, save);
    const tabs = element('div', undefined, 'attendance-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Metode absensi');
    const manualPanel = element('div'); manualPanel.id = 'manual-attendance-panel'; manualPanel.setAttribute('role', 'tabpanel');
    const scanPanel = element('div'); scanPanel.id = 'scan-attendance-panel'; scanPanel.setAttribute('role', 'tabpanel'); scanPanel.hidden = true;
    const manualTab = button('Absensi Manual', () => changeTab(false)); const scanTab = button('Scan QR Code', () => changeTab(true));
    for (const [tab, id] of [[manualTab, manualPanel.id], [scanTab, scanPanel.id]]) { tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', id); }
    manualTab.id = 'manual-attendance-tab'; scanTab.id = 'scan-attendance-tab';
    manualPanel.setAttribute('aria-labelledby', manualTab.id); scanPanel.setAttribute('aria-labelledby', scanTab.id);
    manualTab.setAttribute('aria-selected', 'true'); scanTab.setAttribute('aria-selected', 'false'); manualTab.tabIndex = 0; scanTab.tabIndex = -1;
    tabs.append(manualTab, scanTab); manualPanel.append(controls, body);
    host.append(filters, tabs, caption, summary, manualPanel, scanPanel);
    let loaded = null;
    let drafts = [];
    let dirty = false;
    let saving = false;
    let blocked = false;
    let version = 0;
    let subjectVersion = 0;
    const current = () => context.isCurrent() && host.isConnected;
    const key = () => ({ classId: room.input.value, date: date.input.value, kind: kind.input.value,
      subjectId: kind.input.value === 'MAPEL' ? subject.input.value : '' });
    const selectionMatches = () => loaded && ['classId', 'date', 'kind', 'subjectId'].every((name) => loaded[name] === key()[name]);
    context.setNavigationGuard(() => {
      if (saving || scanner.busy()) { message('Tunggu sampai proses simpan selesai.', true); return false; }
      return !dirty || confirm('Perubahan absensi belum disimpan. Tinggalkan halaman ini?');
    }, () => dirty);

    const scanner = window.SIA.mountQrScanner(scanPanel, {
      ...context,
      selection: () => {
        if (!selectionMatches()) throw new Error('Klik Tampilkan siswa untuk memuat kelas, tanggal, dan sesi yang dipilih.');
        return key();
      },
      onSaved: (data) => { loaded = data; drafts = data.entries.map((row) => ({ ...row })); dirty = false; blocked = false; renderRows(); }
    });
    function changeTab(scan) {
      if (saving || scanner.busy()) { message('Tunggu proses yang sedang berjalan.', true); return; }
      if (scan && dirty) { message('Simpan atau muat ulang draft absensi manual sebelum membuka scan QR.', true); return; }
      if (!scan) scanner.stop();
      manualPanel.hidden = scan; scanPanel.hidden = !scan;
      manualTab.setAttribute('aria-selected', String(!scan)); scanTab.setAttribute('aria-selected', String(scan));
      manualTab.tabIndex = scan ? -1 : 0; scanTab.tabIndex = scan ? 0 : -1;
    }

    function updateControls() {
      const matches = selectionMatches();
      const disabled = saving || !matches;
      save.disabled = disabled || blocked || !drafts.length;
      fill.disabled = disabled || blocked || !drafts.some((item) => !item.status);
      for (const input of body.querySelectorAll('select,input')) input.disabled = disabled || blocked;
      for (const input of filters.querySelectorAll('input,select,button')) input.disabled = saving;
      subject.input.disabled = saving || kind.input.value !== 'MAPEL';
      subject.wrap.hidden = kind.input.value !== 'MAPEL';
    }
    function renderSummary() {
      const counts = { H: 0, S: 0, I: 0, A: 0, pending: 0 };
      drafts.forEach((row) => counts[row.status || 'pending']++);
      summary.replaceChildren(...[['H', 'Hadir'], ['S', 'Sakit'], ['I', 'Izin'], ['A', 'Alfa'], ['pending', 'Belum diisi']]
        .map(([code, label]) => element('span', `${label}: ${counts[code]}`, `summary-chip status-${code}`)));
      updateControls();
    }
    function renderRows() {
      body.replaceChildren(table(['NIS', 'Nama siswa', 'Status kehadiran', 'Catatan'], drafts.map((draft) => {
        const status = element('select');
        status.setAttribute('aria-label', `Status ${draft.name}`);
        [['', 'Belum diisi'], ['H', 'Hadir'], ['S', 'Sakit'], ['I', 'Izin'], ['A', 'Alfa']].forEach(([value, label]) => status.append(new Option(label, value)));
        status.value = draft.status || '';
        status.addEventListener('change', () => { draft.status = status.value || null; dirty = true; renderSummary(); });
        const note = element('input');
        note.type = 'text';
        note.maxLength = 500;
        note.value = draft.note;
        note.setAttribute('aria-label', `Catatan ${draft.name}`);
        note.addEventListener('input', () => { draft.note = note.value; dirty = true; });
        return [draft.nis, draft.name, status, note];
      })));
      renderSummary();
    }
    async function refreshSubjects() {
      const attempt = ++subjectVersion;
      const classId = room.input.value;
      try {
        const options = await context.rpc('getAttendanceOptions', { classId });
        if (!current() || attempt !== subjectVersion || classId !== room.input.value) return;
        const previous = subject.input.value;
        subject.input.replaceChildren(new Option('Pilih mata pelajaran', ''), ...options.subjects.map((item) => new Option(item.name, item.id)));
        subject.input.value = options.subjects.some((item) => item.id === previous) ? previous : options.subjects[0]?.id || '';
      } catch (error) {
        if (current() && attempt === subjectVersion) {
          subject.input.replaceChildren(new Option('Mata pelajaran belum tersedia', ''));
          message(error.message, true);
        }
      }
      updateControls();
    }
    async function load() {
      if (saving || scanner.busy()) return;
      scanner.stop();
      if (dirty && !confirm('Muat ulang siswa? Perubahan absensi yang belum disimpan akan dilepas.')) return;
      if (kind.input.value === 'MAPEL' && !subject.input.value) { message('Pilih mata pelajaran yang ditugaskan.', true); return; }
      const request = ++version;
      loaded = null;
      drafts = [];
      dirty = false;
      blocked = false;
      caption.textContent = '';
      body.replaceChildren();
      summary.replaceChildren();
      updateControls();
      message('Memuat siswa dan absensi…');
      const selection = key();
      try {
        const data = await context.rpc('getAttendance', selection);
        if (!current() || request !== version) return;
        loaded = data;
        drafts = data.entries.map((row) => ({ ...row }));
        caption.textContent = `${rooms.find((item) => item.id === data.classId)?.name} · ${data.date} · ${data.kind === 'HARIAN' ? 'Harian' : 'Mata pelajaran'} · ${drafts.length} siswa aktif`;
        renderRows();
        message(data.retainedCount ? `${data.retainedCount} catatan historis di luar roster aktif tetap tersimpan dan tidak diedit di sini.` :
          drafts.length ? 'Pilih status setiap siswa. Tanpa catatan tidak otomatis dianggap alfa.' : 'Belum ada siswa aktif pada kelas ini.');
      } catch (error) { if (current() && request === version) message(error.message, true); }
    }
    async function saveEntries() {
      if (saving || blocked || !selectionMatches()) return;
      if (drafts.some((row) => !row.status)) { message('Lengkapi status seluruh siswa sebelum menyimpan.', true); return; }
      saving = true;
      updateControls();
      message('Menyimpan absensi…');
      try {
        const data = await context.rpc('saveAttendance', { ...key(), expectedRevision: loaded.revision,
          entries: drafts.map((row) => ({ studentId: row.studentId, status: row.status, note: row.note })) });
        if (!current()) return;
        loaded = data;
        drafts = data.entries.map((row) => ({ ...row }));
        dirty = false;
        renderRows();
        message('Absensi berhasil disimpan.' + (context.preview ? ' Perubahan hanya berada dalam memori demo.' : ''));
      } catch (error) {
        if (current()) {
          blocked = ['CONFLICT', 'RECOVERY_REQUIRED'].includes(error.code);
          message(error.message, true);
        }
      } finally { saving = false; if (current()) updateControls(); }
    }
    tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const scan = event.key === 'End' || (event.key !== 'Home' && scanPanel.hidden);
      changeTab(scan); (scanPanel.hidden ? manualTab : scanTab).focus();
    });
    filters.addEventListener('submit', (event) => { event.preventDefault(); load(); });
    for (const input of [room.input, date.input, kind.input, subject.input]) input.addEventListener('change', () => {
      scanner.stop();
      if (!selectionMatches()) message('Pilihan berubah. Klik Tampilkan siswa sebelum mengisi atau menyimpan.');
      updateControls();
    });
    room.input.addEventListener('change', refreshSubjects);
    await refreshSubjects();
    if (current()) await load();
  };
})();
