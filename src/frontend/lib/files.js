(() => {
  const mm = (value) => value * 72 / 25.4;
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function cardImages(data) {
    await Promise.all([window.SIA.assets.load('qr'), window.SIA.cardLayout.prepareFont()]);
    return Promise.all(data.cards.map(async (card) => ({ ...card,
      qrImage: await window.SIA.vendors.QRCode.toDataURL(card.qr, { scale: 8, margin: 4, errorCorrectionLevel: 'M' }) })));
  }
  function cardDefinition(school, cards) {
    const layout = window.SIA.cardLayout;
    const text = (box) => ({ columns: [{ width: mm(box.w), text: box.text, bold: !!box.bold, color: box.color,
      fontSize: mm(box.fontSize), lineHeight: 1, alignment: 'center' }], columnGap: 0,
    absolutePosition: { x: mm(box.x), y: mm(box.y) } });
    const image = (source, box, crop = false) => ({ columns: [{ width: mm(box.w), image: source,
      ...(crop ? { cover: { width: mm(box.w), height: mm(box.h), align: 'center', valign: 'center' } } : { fit: [mm(box.w), mm(box.h)] }),
      alignment: 'center' }], columnGap: 0, absolutePosition: { x: mm(box.x), y: mm(box.y) } });
    return { pageSize: { width: mm(layout.width), height: mm(layout.height) }, pageMargins: [0, 0, 0, 0],
      defaultStyle: { font: 'Roboto', fontSize: 7 }, info: { title: 'Kartu ID Siswa' },
      content: cards.map((card, index) => {
        const content = layout.content(school, card);
        return { pageBreak: index ? 'before' : undefined, stack: [
          { canvas: [{ type: 'rect', x: 0, y: 0, w: mm(layout.width), h: mm(layout.height), color: layout.colors.white },
            ...layout.decorations.map((shape) => ({ type: 'rect', x: mm(shape.x), y: mm(shape.y), w: mm(shape.w), h: mm(shape.h), color: shape.color })),
            ...(!card.photo ? [{ type: 'rect', x: mm(layout.boxes.photo.x), y: mm(layout.boxes.photo.y),
              w: mm(layout.boxes.photo.w), h: mm(layout.boxes.photo.h), color: layout.colors.soft }] : [])],
          absolutePosition: { x: 0, y: 0 } },
          ...(school.logo ? [image(school.logo, layout.boxes.logo)] : []),
          text(content.title), text(content.schoolName), text(content.identity),
          ...(card.photo ? [image(card.photo, layout.boxes.photo, true)] :
            [text({ ...layout.boxes.photo, y: layout.boxes.photo.y + 9, text: 'FOTO SISWA', fontSize: 1.8, color: layout.colors.navy })]),
          text(content.name), text(content.nisn), text(content.className), image(card.qrImage, layout.boxes.qr), text(content.address)
        ] };
      }) };
  }
  async function cardsPdf(data) {
    await window.SIA.assets.load('pdf');
    const cards = await cardImages(data);
    return window.SIA.vendors.pdfMake.createPdf(cardDefinition(data.school, cards)).getBlob();
  }
  const columns = [['name','Nama'],['nis','NIS'],['nisn','NISN'],['className','Kelas'],['guardianName','Nama Wali'],['guardianPhone','Telepon/WA Wali'],['guardianRelation','Hubungan'],['active','Aktif']];
  async function studentsExcel(data) {
    await window.SIA.assets.load('excel');
    const workbook = new window.SIA.vendors.ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data Siswa');
    sheet.columns = columns.map(([key, header]) => ({ key, header, width: key === 'name' ? 30 : 23, style: { numFmt: '@' } }));
    data.rows.forEach((row) => sheet.addRow(Object.fromEntries(columns.map(([key]) => [key, key === 'active' ? (row.active ? 'Ya' : 'Tidak') : String(row[key] || '')]))));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  async function studentsPdf(data) {
    await window.SIA.assets.load('pdf');
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
