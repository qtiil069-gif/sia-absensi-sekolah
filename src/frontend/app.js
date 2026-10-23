/* Browser entry point. Production never loads dev/fixtures.js. */
(() => {
  'use strict';
  const { byId, element } = window.SIA.dom;
  const { preview, rpc } = window.SIA.api;
  const { renderDashboard, table } = window.SIA.components;
  const modules = {
    dashboard: ['Dashboard', ''],
    kelas: ['Data Kelas', 'Daftar kelas aktif yang dapat diakses akun Anda. Pengelolaan kelas belum tersedia.'],
    siswa: ['Data Siswa', 'Daftar siswa aktif pada kelas yang dapat Anda akses. Pengelolaan siswa belum tersedia.'],
    absensi: ['Absensi Siswa', 'Modul pencatatan absensi masih direncanakan. Belum ada penyimpanan atau perubahan data kehadiran.'],
    nilai: ['Nilai & Leger', 'Modul penilaian dan perhitungan leger masih direncanakan. Belum ada nilai yang disimpan.'],
    jurnal: ['Jurnal Mengajar', 'Modul pencatatan jurnal mengajar masih direncanakan. Belum ada jurnal yang disimpan.'],
    guru: ['Akun Guru', 'Manajemen akun dan perubahan role melalui aplikasi belum tersedia. Akses awal diatur administrator di Sheets.'],
    laporan: ['Laporan Kehadiran', 'Modul laporan dan ekspor masih direncanakan. Grafik dashboard saat ini hanya merangkum catatan yang sudah diisi.']
  };
  const state = { bootstrap: null, route: 'dashboard', request: 0, boot: 0, ready: false };

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
    const route = location.hash.slice(1) || 'dashboard';
    state.route = Object.hasOwn(modules, route) ? route : 'dashboard';
    const current = state.route;
    const request = ++state.request;
    closeMenu();
    byId('error-panel').hidden = true;
    byId('dashboard-panel').hidden = current !== 'dashboard';
    byId('module-panel').hidden = current === 'dashboard';
    byId('page-title').textContent = modules[current][0];
    document.title = `${modules[current][0]} · SIA Sekolah`;
    document.querySelectorAll('.nav-item').forEach((link) => {
      const active = link.hash === `#${current}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    byId('main').setAttribute('aria-busy', 'true');
    byId('class-filter').disabled = true;
    byId('date-filter').disabled = true;
    try {
      if (current === 'dashboard') {
        // Hide old figures while a different date/class is being loaded.
        byId('dashboard-panel').hidden = true;
        if (!byId('date-filter').value) throw new Error('Pilih tanggal ringkasan terlebih dahulu.');
        const data = await rpc('getDashboard', { date: byId('date-filter').value, classId: byId('class-filter').value });
        if (request !== state.request) return;
        renderDashboard(data);
        byId('dashboard-panel').hidden = false;
      } else {
        byId('module-title').textContent = modules[current][0];
        byId('module-description').textContent = modules[current][1];
        byId('module-content').replaceChildren(element('p', 'Memuat…'));
        if (current === 'kelas' || current === 'siswa') {
          const records = await rpc(current === 'kelas' ? 'listClasses' : 'listStudents');
          if (request !== state.request) return;
          const names = Object.fromEntries(state.bootstrap.classes.map((item) => [item.id, item.name]));
          byId('module-content').replaceChildren(current === 'kelas'
            ? table(['Kelas', 'Tingkat', 'ID tahun ajaran'], records.map((item) => [item.name, item.level, item.yearId]))
            : table(['NIS', 'Nama siswa', 'Kelas'], records.map((item) => [item.nis, item.name, item.classIds.map((id) => names[id] || id).join(', ')])));
        } else {
          byId('module-content').replaceChildren(element('p', 'Tahap perencanaan · fitur ini belum diimplementasikan.', 'notice'));
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
        ? 'Mode demo pengembangan · semua angka dan nama adalah data contoh. Tidak ada perubahan yang disimpan.'
        : 'Data Google Sheets · akses baca sesuai role. Aplikasi masih dalam tahap pengembangan.';
      byId('profile-name').textContent = data.user.name;
      byId('greeting-name').textContent = data.user.name + '!';
      byId('profile-role').textContent = data.user.role === 'GURU' ? 'Guru' : 'Admin Kepala Sekolah';
      byId('teacher-nav').hidden = data.user.role !== 'ADMIN_KEPALA_SEKOLAH';
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
  window.addEventListener('hashchange', loadRoute);
  byId('search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLocaleLowerCase('id-ID');
    const results = byId('search-results');
    results.replaceChildren();
    results.hidden = !query;
    if (!query) return;
    Object.entries(modules).filter(([key, [label]]) => label.toLocaleLowerCase('id-ID').includes(query) &&
      (key !== 'guru' || state.bootstrap?.user.role === 'ADMIN_KEPALA_SEKOLAH')).forEach(([key, [label]]) => {
      const link = element('a', label);
      link.href = `#${key}`;
      link.addEventListener('click', () => { results.hidden = true; byId('search').value = ''; });
      results.append(link);
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
