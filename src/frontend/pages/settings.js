(() => {
  const { element } = window.SIA.dom;
  const { field, button, feedback } = window.SIA.forms;
  window.SIA.pages.settings = async (host, context) => {
    const message = feedback(host); host.lastElementChild.classList.add('school-feedback');
    const [settings, status] = await Promise.all([context.rpc('getSchoolSettings'), context.rpc('getStage3Status')]);
    if (!context.isCurrent()) return;
    let revision = settings.revision;
    const migration = element('section', undefined, 'migration-box');
    migration.append(element('h3', 'Persiapan database Tahap 3'));
    const state = element('p', status.ready ? 'Database profil siswa siap (skema v2).' : 'Data lama tetap dapat dipakai. Siapkan tab profil sebelum menggunakan foto, kartu, dan QR.');
    const migrate = button('Siapkan database Tahap 3', async () => {
      if (!confirm('Buat salinan cadangan lengkap, verifikasi, lalu tambahkan tab ProfilSiswa? Data/tab lama tidak ditimpa.')) return;
      migrate.disabled = true;
      try {
        const result = await context.rpc('migrateStage3');
        if (!context.isCurrent()) return;
        state.textContent = 'Database profil siswa siap (skema v2).' + (result.backupName ? ' Cadangan: ' + result.backupName : '');
        message('Persiapan database berhasil.');
      } catch (error) { message(error.message, true); migrate.disabled = false; }
    }, 'coral');
    migrate.disabled = status.ready;
    migration.append(state, migrate); host.append(migration);
    const form = element('form', undefined, 'record-form settings-form');
    const name = field('Nama sekolah', { required: true, maxLength: 120, value: settings.name });
    const address = field('Alamat sekolah', { multiline: true, maxLength: 500, value: settings.address });
    const identity = field('Identitas tambahan sekolah', { maxLength: 200, value: settings.identity });
    const logo = window.SIA.images.imageField('Logo sekolah', settings.logo, true);
    const save = button('Simpan pengaturan sekolah', null, 'coral'); save.type = 'submit';
    form.append(name.wrap, identity.wrap, address.wrap, logo.node, save); host.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (save.disabled) return;
      save.disabled = true;
      try {
        await logo.ready();
        const result = await context.rpc('updateSchoolSettings', { name: name.input.value, address: address.input.value,
          identity: identity.input.value, logo: logo.value(), expectedRevision: revision });
        if (!context.isCurrent()) return;
        revision = result.revision; context.onSchoolUpdated(result);
        message('Pengaturan sekolah disimpan. Preview dan cetak kartu berikutnya memakai identitas terbaru.');
        window.SIA.toast.success('Pengaturan sekolah berhasil diperbarui.');
      } catch (error) { if (context.isCurrent()) { message(error.message, true); window.SIA.toast.error(error.message); } }
      finally { save.disabled = false; }
    });
  };
})();
