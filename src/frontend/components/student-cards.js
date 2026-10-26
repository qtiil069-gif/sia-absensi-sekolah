(() => {
  const { element } = window.SIA.dom;
  const { button, field } = window.SIA.forms;
  function image(src, alt, className) {
    if (!src) return element('div', 'Foto siswa', className + ' photo-placeholder');
    const img = element('img', undefined, className); img.src = src; img.alt = alt; return img;
  }
  function cardNode(school, card) {
    const node = element('article', undefined, 'id-card');
    const header = element('header', undefined, 'id-card-header');
    if (school.logo) header.append(image(school.logo, 'Logo ' + school.name, 'id-school-logo'));
    const schoolName = element('h3', school.name); if (school.name.length > 60) { schoolName.style.fontSize = '8px'; schoolName.style.webkitLineClamp = '3'; }
    header.append(schoolName, element('p', school.identity));
    node.append(header, image(card.photo, 'Foto ' + card.name, 'id-photo'), element('strong', card.name, 'id-name'),
      element('p', 'NISN: ' + (card.nisn || 'Belum diisi'), 'id-nisn'), element('p', 'Kelas: ' + card.className, 'id-class'),
      image(card.qrImage, 'QR unik ' + card.name, 'id-qr'), element('footer', school.address));
    const name = node.querySelector('.id-name'); if (card.name.length > 55) name.style.fontSize = card.name.length > 80 ? '7px' : '8px';
    return node;
  }
  async function open(context, rooms, selection, onClose = () => {}, defaultClass = '') {
    const ui = window.SIA.dialog('Cetak Kartu ID', 'card-dialog', onClose);
    context.onDispose(() => { if (ui.node.open) ui.close(); });
    const area = element('div', undefined, 'id-preview-grid');
    const note = element('p', 'Portrait 54 × 85,6 mm · periksa foto, identitas, dan QR sebelum mencetak.', 'preview-note');
    const print = button('Cetak kartu', () => output('print'), 'coral');
    const pdf = button('Unduh PDF kartu', () => output('pdf'));
    print.disabled = true; pdf.disabled = true;
    ui.actions.append(print, pdf);
    let selected = selection;
    let loaded = null;
    let busy = false;
    let version = 0;
    const current = () => ui.node.open && context.isCurrent();
    if (!selection) {
      const tools = element('div', undefined, 'page-tools');
      const room = field('Kelas cetak massal', { options: [['', 'Pilih kelas aktif'], ...rooms.filter((item) => item.active).map((item) => [item.id, item.name])] });
      room.input.value = defaultClass;
      const show = button('Tampilkan kartu', () => {
        if (!room.input.value) { ui.message('Pilih kelas untuk cetak massal.', true); return; }
        selected = { classId: room.input.value }; refresh();
      });
      room.input.addEventListener('change', () => { loaded = null; area.replaceChildren(); print.disabled = pdf.disabled = true; });
      tools.append(room.wrap, show); ui.body.append(tools);
    }
    ui.body.append(note, area);
    async function refresh() {
      const request = ++version;
      print.disabled = pdf.disabled = true;
      ui.message('Menyiapkan identitas sekolah dan kartu…');
      try {
        const data = await context.rpc('prepareStudentCards', selected);
        const cards = await window.SIA.files.cardImages(data);
        if (!current() || request !== version) return null;
        loaded = data;
        area.replaceChildren(...cards.map((card) => cardNode(data.school, card)));
        ui.message(`${cards.length} kartu siap ditinjau. QR hanya berisi token, tanpa data pribadi.`);
        print.disabled = pdf.disabled = false;
        return data;
      } catch (error) { if (current() && request === version) ui.message(error.message, true); return null; }
    }
    async function output(kind) {
      if (busy || !loaded) return;
      busy = true; print.disabled = pdf.disabled = true;
      try {
        // Fetch again so a settings change applies to both preview and output.
        const fresh = await refresh();
        if (!fresh || !current()) return;
        if (kind === 'pdf') {
          ui.message('Menyiapkan PDF kartu…');
          window.SIA.files.saveBlob(await window.SIA.files.cardsPdf(fresh), 'kartu-id-siswa.pdf');
          ui.message('PDF kartu siap diunduh.');
        }
        else {
          await Promise.all([...area.querySelectorAll('img')].map((img) => img.decode()));
          document.body.classList.add('printing-cards');
          window.addEventListener('afterprint', () => document.body.classList.remove('printing-cards'), { once: true });
          window.print();
        }
      } catch (error) { if (current()) ui.message(error.message, true); }
      finally { busy = false; if (current()) print.disabled = pdf.disabled = !loaded; }
    }
    if (selection) await refresh();
    return ui;
  }
  async function exportsPopup(context, filters) {
    const ui = window.SIA.dialog('Unduh Data Siswa');
    context.onDispose(() => { if (ui.node.open) ui.close(); });
    ui.message('Mengambil data sesuai filter dan hak akses…');
    try {
      const data = await context.rpc('exportStudentData', filters);
      if (!ui.node.open || !context.isCurrent()) return;
      ui.body.append(element('p', `${data.rows.length} siswa · ${data.school.name}`));
      ui.body.append(window.SIA.components.table(['Nama', 'NIS', 'NISN', 'Kelas', 'Nama wali', 'Telepon/WA', 'Hubungan'], data.rows.map((row) =>
        [row.name, row.nis, row.nisn, row.className, row.guardianName, row.guardianPhone, row.guardianRelation])));
      ui.message('Periksa data sebelum mengunduh. Ekspor mengikuti filter, bukan hanya halaman tabel yang sedang tampil.');
      for (const [label, make, filename] of [
        ['Unduh Excel', window.SIA.files.studentsExcel, 'data-siswa.xlsx'], ['Unduh PDF data', window.SIA.files.studentsPdf, 'data-siswa.pdf']
      ]) {
        const action = button(label, async () => {
          action.disabled = true;
          ui.message('Menyiapkan berkas…');
          try { window.SIA.files.saveBlob(await make(data), filename); ui.message('Berkas siap diunduh.'); }
          catch (error) { ui.message(error.message, true); }
          finally { action.disabled = false; }
        });
        action.disabled = !data.rows.length; ui.actions.append(action);
      }
    } catch (error) { if (ui.node.open) ui.message(error.message, true); }
  }
  window.SIA.cards = { open, exportsPopup };
})();
