(() => {
  const mm = (value) => value * 72 / 25.4;
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function cardImages(data) {
    return Promise.all(data.cards.map(async (card) => ({ ...card,
      qrImage: await window.SIA.vendors.QRCode.toDataURL(card.qr, { scale: 8, margin: 4, errorCorrectionLevel: 'M' }) })));
  }
  function cardDefinition(school, cards) {
    return { pageSize: { width: mm(54), height: mm(85.6) }, pageMargins: [0, 0, 0, 0],
      defaultStyle: { font: 'Roboto', fontSize: 7 }, info: { title: 'Kartu ID Siswa' },
      content: cards.map((card, index) => ({ pageBreak: index ? 'before' : undefined, stack: [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: mm(54), h: 62, color: '#f9dfd3' }], absolutePosition: { x: 0, y: 0 } },
        ...(school.logo ? [{ image: school.logo, fit: [22, 22], absolutePosition: { x: mm(27) - 11, y: 6 } }] : []),
        { text: school.name, bold: true, fontSize: school.name.length > 60 ? 6 : 8, width: mm(48), alignment: 'center', absolutePosition: { x: mm(3), y: school.logo ? 31 : 12 } },
        { text: school.identity.slice(0, 65), fontSize: 5, alignment: 'center', width: mm(48), absolutePosition: { x: mm(3), y: 52 } },
        ...(card.photo ? [{ image: card.photo, fit: [46, 58], absolutePosition: { x: mm(27) - 23, y: 68 } }] :
          [{ text: 'FOTO SISWA', color: '#7f8e81', fontSize: 7, absolutePosition: { x: mm(18), y: 92 } }]),
        { text: card.name, bold: true, fontSize: card.name.length > 55 ? 6 : 8, alignment: 'center', width: mm(48), absolutePosition: { x: mm(3), y: 130 } },
        { text: 'NISN: ' + (card.nisn || 'Belum diisi'), fontSize: 6.5, alignment: 'center', width: mm(48), absolutePosition: { x: mm(3), y: 154 } },
        { text: 'Kelas: ' + card.className, fontSize: 7, alignment: 'center', width: mm(48), absolutePosition: { x: mm(3), y: 165 } },
        { image: card.qrImage, width: 44, height: 44, absolutePosition: { x: mm(27) - 22, y: 177 } },
        { text: school.address.slice(0, 120), fontSize: 4.5, alignment: 'center', width: mm(48), absolutePosition: { x: mm(3), y: 227 } }
      ] })) };
  }
  async function cardsPdf(data) {
    const cards = await cardImages(data);
    return window.SIA.vendors.pdfMake.createPdf(cardDefinition(data.school, cards)).getBlob();
  }
  const columns = [['name','Nama'],['nis','NIS'],['nisn','NISN'],['className','Kelas'],['guardianName','Nama Wali'],['guardianPhone','Telepon/WA Wali'],['guardianRelation','Hubungan'],['active','Aktif']];
  async function studentsExcel(data) {
    const workbook = new window.SIA.vendors.ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Siswa');
    sheet.columns = columns.map(([key, header]) => ({ key, header, width: key === 'name' ? 30 : 23, style: { numFmt: '@' } }));
    data.rows.forEach((row) => sheet.addRow(Object.fromEntries(columns.map(([key]) => [key, key === 'active' ? (row.active ? 'Ya' : 'Tidak') : String(row[key] || '')]))));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  async function studentsPdf(data) {
    return window.SIA.vendors.pdfMake.createPdf({ pageSize: 'A4', pageOrientation: 'landscape', pageMargins: 25,
      defaultStyle: { font: 'Roboto', fontSize: 8 }, content: [
        { text: data.school.name, fontSize: 15, bold: true, margin: [0, 0, 0, 8] },
        { text: data.school.address, margin: [0, 0, 0, 12] },
        { table: { headerRows: 1, widths: [100,65,65,55,90,90,60,30], body: [columns.map(([, label]) => ({ text: label, bold: true })),
          ...data.rows.map((row) => columns.map(([key]) => key === 'active' ? (row.active ? 'Ya' : 'Tidak') : String(row[key] || '')))] }, layout: 'lightHorizontalLines' }
      ] }).getBlob();
  }
  window.SIA.files = { saveBlob, cardImages, cardDefinition, cardsPdf, studentsExcel, studentsPdf };
})();
