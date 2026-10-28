(() => {
  const { element } = window.SIA.dom;
  const { button, field, feedback } = window.SIA.forms;
  window.SIA.mountQrScanner = (host, context) => {
    const message = feedback(host);
    const video = element('video', undefined, 'qr-video'); video.autoplay = true; video.muted = true; video.playsInline = true;
    video.setAttribute('aria-label', 'Kamera pemindai QR');
    const facing = field('Kamera', { options: [['environment', 'Kamera belakang / utama'], ['user', 'Kamera depan']] });
    const code = field('Kode QR (alternatif pembaca USB atau tempel)', { maxLength: 100, placeholder: 'SIA-ID:1:…' });
    const actions = element('div', undefined, 'form-actions');
    let opening = false; let controls = null; let attempt = 0; let validating = false; let saving = false; let popup = null;
    const start = button('Mulai kamera', async () => {
      if (validating || saving || opening) return;
      stop(); const token = ++attempt; opening = true; start.disabled = true;
      message('Meminta izin kamera…');
      try {
        const value = await window.SIA.qrCamera.start(video, facing.input.value, validate,
          () => token === attempt && context.isCurrent() && !host.hidden);
        if (token !== attempt || !context.isCurrent() || host.hidden) { window.SIA.qrCamera.stop(video, value); return; }
        controls = value; message('Arahkan QR kartu siswa ke kamera. Hasil scan belum menyimpan absensi.');
      } catch (error) {
        if (token === attempt) message(error.code === 'ASSET_LOAD_FAILED' ? error.message : 'Kamera tidak dapat dibuka. Periksa izin perangkat/browser dan kebijakan kamera iframe. Anda tetap dapat menggunakan pembaca USB/kode atau Absensi Manual.', true);
      } finally { opening = false; start.disabled = false; }
    }, 'coral');
    function stop() { attempt++; window.SIA.qrCamera.stop(video, controls); controls = null; start.disabled = opening; }
    async function validate(qr) {
      if (validating || saving || popup?.node.open || !context.isCurrent()) return;
      validating = true; stop(); message('QR terbaca. Memvalidasi siswa…');
      try {
        const selection = context.selection();
        const result = await context.rpc('validateStudentQr', { ...selection, qr });
        if (!context.isCurrent() || host.hidden) return;
        popup = window.SIA.dialog('Konfirmasi Absensi QR', '', () => { if (context.isCurrent()) message('Pemindaian dihentikan. Mulai kamera atau validasi kode lain.'); });
        const student = result.student;
        if (student.photo) { const img = element('img', undefined, 'confirmation-photo'); img.src = student.photo; img.alt = 'Foto ' + student.name; popup.body.append(img); }
        popup.body.append(element('h3', student.name), element('p', 'NISN: ' + (student.nisn || 'Belum diisi')),
          element('p', 'Kelas: ' + student.className), element('p', `${selection.date} · ${selection.kind}`));
        const confirm = button('Konfirmasi Hadir', async () => {
          if (saving) return; saving = true; confirm.disabled = true;
          try {
            const data = await context.rpc('saveQrAttendance', { ...selection, qr, expectedRevision: result.expectedRevision });
            if (!context.isCurrent()) return;
            context.onSaved(data); popup.close(); message('Kehadiran ' + student.name + ' berhasil disimpan.');
            window.SIA.toast.success('Absensi berhasil tersimpan.');
          } catch (error) { if (context.isCurrent() && popup.node.open) { popup.message(error.message, true); window.SIA.toast.error(error.message); } }
          finally { saving = false; }
        }, 'coral');
        if (result.status) { popup.message('Siswa sudah tercatat (' + result.status + ') pada sesi ini. Gunakan Absensi Manual untuk koreksi.'); confirm.disabled = true; }
        else popup.message('Periksa foto dan identitas siswa, lalu konfirmasi untuk menyimpan Hadir.');
        popup.actions.append(confirm);
        if (!result.status) window.SIA.toast.success('QR berhasil dipindai. Identitas siswa tervalidasi.');
      } catch (error) { if (context.isCurrent() && !host.hidden) { message(error.message, true); window.SIA.toast.error(error.message); } }
      finally { validating = false; }
    }
    actions.append(start, button('Hentikan kamera', stop), button('Validasi kode', () => validate(code.input.value)));
    host.append(element('p', 'Pilih kelas, tanggal, dan sesi di atas. Identitas hasil scan harus dikonfirmasi petugas sebelum disimpan.'),
      facing.wrap, video, code.wrap, actions);
    const onHidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onHidden);
    context.onDispose(() => { stop(); if (popup?.node.open) popup.close(); document.removeEventListener('visibilitychange', onHidden); });
    return { stop, busy: () => saving || validating };
  };
})();
