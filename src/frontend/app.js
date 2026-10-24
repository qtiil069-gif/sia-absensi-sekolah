/* Browser entry point. Production never loads the dev/ demo runtime. */
(() => {
  'use strict';
  const { byId, element } = window.SIA.dom;
  const { preview, rpc } = window.SIA.api;
  const { renderDashboard } = window.SIA.components;
  const modules = {
    dashboard: ['Dashboard', ''],
    settings: ['Pengaturan Sekolah', 'Identitas sekolah dan persiapan database. Hanya Admin Kepala Sekolah.'],
    kelas: ['Data Kelas', 'Kelola rombongan belajar dan wali kelas. Guru hanya dapat melihat kelas penugasannya.'],
    siswa: ['Data Siswa', 'Cari siswa, kelola data dan keanggotaan kelas. Riwayat siswa nonaktif tetap disimpan.'],
    absensi: ['Absensi Siswa', 'Catat dan perbarui kehadiran siswa per kelas, tanggal, dan sesi yang diizinkan.'],
    nilai: ['Nilai & Leger', 'Modul penilaian dan perhitungan leger masih direncanakan. Belum ada nilai yang disimpan.'],
    jurnal: ['Jurnal Mengajar', 'Modul pencatatan jurnal mengajar masih direncanakan. Belum ada jurnal yang disimpan.'],
    guru: ['Akun Guru', 'Manajemen akun dan perubahan role melalui aplikasi belum tersedia. Akses awal diatur administrator di Sheets.'],
    laporan: ['Laporan Kehadiran', 'Modul laporan dan ekspor masih direncanakan. Grafik dashboard saat ini hanya merangkum catatan yang sudah diisi.']
  };
  const state = { bootstrap: null, route: 'dashboard', request: 0, boot: 0, ready: false, guard: null, dirty: null, disposers: [] };
  const pages = { kelas: window.SIA.pages.classes, siswa: window.SIA.pages.students, absensi: window.SIA.pages.attendance, settings: window.SIA.pages.settings };
  const router = window.SIA.createRouter({
    routes: Object.keys(modules),
    // An initial fragment is a read-only hint (also useful for local tests).
    // Subsequent navigation never writes to window.location or browser history.
    initialRoute: window.location.hash.slice(1),
    onNavigate: loadRoute,
    canNavigate: () => !state.guard || state.guard(),
    onSameRoute: closeMenu
  });

  function showError(error) {
    byId('error-message').textContent = error.message;
    byId('error-panel').hidden = false;
    byId('dashboard-panel').hidden = true;
    byId('module-panel').hidden = true;
    byId('notice').textContent = preview
      ? 'Mode demo pengembangan · data contoh, bukan data sekolah.'
      : 'Data sekolah belum tersedia. Tidak ada data dummy yang ditampilkan.';
  }

  function closeMenu() {
    byId('sidebar').classList.remove('open');
    byId('sidebar-backdrop').hidden = true;
    byId('menu-toggle').setAttribute('aria-expanded', 'false');
  }

  async function loadRoute() {
    if (!state.ready) return;
    const request = ++state.request;
    state.disposers.splice(0).forEach((dispose) => dispose());
    state.guard = null;
    state.dirty = null;
    state.route = router.current();
    const current = state.route;
    closeMenu();
    byId('error-panel').hidden = true;
    byId('dashboard-panel').hidden = current !== 'dashboard';
    byId('module-panel').hidden = current === 'dashboard';
    byId('page-title').textContent = modules[current][0];
    document.title = `${modules[current][0]} · SIA Sekolah`;
    document.querySelectorAll('.nav-item').forEach((control) => {
      const active = control.dataset.route === current;
      control.classList.toggle('active', active);
      if (active) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    });
    byId('main').setAttribute('aria-busy', 'true');
    byId('class-filter').disabled = true;
    byId('date-filter').disabled = true;
    try {
      if (current === 'dashboard') {
        // Hide old figures while a different date/class is being loaded.
        byId('dashboard-panel').hidden = true;
        if (!byId('date-filter').value) throw new Error('Pilih tanggal ringkasan terlebih dahulu.');
        const rooms = await rpc('listClasses');
        if (request !== state.request) return;
        const previous = byId('class-filter').value;
        byId('class-filter').replaceChildren(new Option('Semua kelas', ''), ...rooms.map((room) => new Option(room.name, room.id)));
        byId('class-filter').value = rooms.some((room) => room.id === previous) ? previous : '';
        const data = await rpc('getDashboard', { date: byId('date-filter').value, classId: byId('class-filter').value });
        if (request !== state.request) return;
        renderDashboard(data);
        byId('dashboard-panel').hidden = false;
      } else {
        byId('module-title').textContent = modules[current][0];
        byId('module-description').textContent = modules[current][1];
        const host = element('div');
        byId('module-content').replaceChildren(host);
        if (pages[current]) {
          await pages[current](host, { user: state.bootstrap.user, today: state.bootstrap.today, rpc, preview,
            isCurrent: () => request === state.request,
            onDispose: (dispose) => { if (request === state.request) state.disposers.push(dispose); else dispose(); },
            onSchoolUpdated: (school) => { state.bootstrap.school = school; byId('school-name').textContent = school.name; },
            setNavigationGuard: (guard, dirty) => { if (request === state.request) { state.guard = guard; state.dirty = dirty; } } });
        } else {
          host.replaceChildren(element('p', 'Fitur dalam pengembangan', 'notice'));
          if (current === 'guru' && state.bootstrap.user.role !== 'ADMIN_KEPALA_SEKOLAH') {
            byId('module-description').textContent = 'Halaman ini direncanakan khusus administrator. Tidak ada data akun guru yang ditampilkan.';
          }
        }
      }
    } catch (error) {
      if (request === state.request) showError(error);
    } finally {
      if (request === state.request) {
        byId('main').setAttribute('aria-busy', 'false');
        byId('class-filter').disabled = false;
        byId('date-filter').disabled = false;
      }
    }
  }

  async function boot() {
    const attempt = ++state.boot;
    state.ready = false;
    ++state.request;
    byId('error-panel').hidden = true;
    byId('dashboard-panel').hidden = true;
    byId('module-panel').hidden = true;
    byId('mode-badge').textContent = preview ? 'MODE DEMO' : 'GOOGLE SHEETS';
    byId('notice').textContent = 'Memuat konfigurasi dan memeriksa akses akun…';
    try {
      const data = await rpc('getBootstrap');
      if (attempt !== state.boot) return;
      state.bootstrap = data;
      state.ready = true;
      byId('notice').textContent = preview
        ? 'Mode demo pengembangan · semua data adalah contoh. Perubahan hanya di memori sesi lokal, bukan Google Sheets.'
        : 'Data Google Sheets · akses sesuai role. Periksa pilihan sebelum menyimpan perubahan.';
      byId('profile-name').textContent = data.user.name;
      byId('greeting-name').textContent = data.user.name + '!';
      byId('profile-role').textContent = data.user.role === 'GURU' ? 'Guru' : 'Admin Kepala Sekolah';
      byId('teacher-nav').hidden = data.user.role !== 'ADMIN_KEPALA_SEKOLAH';
      byId('settings-nav').hidden = data.user.role !== 'ADMIN_KEPALA_SEKOLAH';
      byId('school-name').textContent = data.school.name;
      byId('semester-label').textContent = data.school.semester;
      byId('date-filter').value = data.today;
      byId('class-filter').replaceChildren(new Option('Semua kelas', ''));
      data.classes.forEach((item) => byId('class-filter').append(new Option(item.name, item.id)));
      await loadRoute();
    } catch (error) {
      if (attempt === state.boot) showError(error);
    }
  }

  byId('menu-toggle').addEventListener('click', () => {
    const open = byId('sidebar').classList.toggle('open');
    byId('sidebar-backdrop').hidden = !open;
    byId('menu-toggle').setAttribute('aria-expanded', String(open));
  });
  byId('sidebar-backdrop').addEventListener('click', closeMenu);
  byId('retry').addEventListener('click', boot);
  byId('class-filter').addEventListener('change', loadRoute);
  byId('date-filter').addEventListener('change', loadRoute);
  byId('skip-content').addEventListener('click', () => byId('main').focus());
  window.addEventListener('pagehide', () => state.disposers.splice(0).forEach((dispose) => dispose()));
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty?.()) { event.preventDefault(); event.returnValue = ''; }
  });
  byId('search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLocaleLowerCase('id-ID');
    const results = byId('search-results');
    results.replaceChildren();
    results.hidden = !query;
    if (!query) return;
    Object.entries(modules).filter(([key, [label]]) => label.toLocaleLowerCase('id-ID').includes(query) &&
      (!['guru', 'settings'].includes(key) || state.bootstrap?.user.role === 'ADMIN_KEPALA_SEKOLAH')).forEach(([key, [label]]) => {
      const control = element('button', label);
      control.type = 'button';
      control.dataset.route = key;
      control.addEventListener('click', () => { results.hidden = true; byId('search').value = ''; });
      results.append(control);
    });
    if (!results.children.length) results.append(element('p', 'Menu tidak ditemukan.'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeMenu(); byId('search-results').hidden = true; }
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      byId('search').focus();
    }
  });
  boot();
})();
