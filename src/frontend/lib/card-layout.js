(() => {
  const width = 54;
  const height = 85.6;
  const colors = { royal: '#2354C5', navy: '#102B5C', yellow: '#F6C945', white: '#FFFFFF', soft: '#EEF3FC' };
  const boxes = {
    logo: { x: 22.4, y: 2.6, w: 9.2, h: 9.2 },
    title: { x: 3, y: 12.8, w: 48, h: 3, fontSize: 2.15, bold: true, color: colors.royal },
    schoolName: { x: 3, y: 17.3, w: 48, h: 5.5, fontSize: 2.3, bold: true, color: colors.white },
    identity: { x: 3, y: 23.4, w: 48, h: 2.5, fontSize: 1.45, color: colors.white },
    photo: { x: 19, y: 29.5, w: 16, h: 20 },
    name: { x: 3, y: 51.2, w: 48, h: 6.2, fontSize: 2.5, bold: true, color: colors.navy },
    nisn: { x: 3, y: 58, w: 48, h: 2.5, fontSize: 1.95, color: colors.navy },
    className: { x: 3, y: 61.3, w: 48, h: 2.5, fontSize: 1.95, color: colors.navy },
    qr: { x: 19.4, y: 64.4, w: 15.2, h: 15.2 },
    address: { x: 3, y: 80.4, w: 48, h: 4.6, fontSize: 1.45, minFontSize: 1.35, maxLines: 2, color: colors.white }
  };
  const decorations = [
    { x: 0, y: 0, w: width, h: 1.2, color: colors.navy },
    { x: 0, y: 1.2, w: 12, h: .5, color: colors.yellow },
    { x: 0, y: 16.5, w: width, h: 10.3, color: colors.royal },
    { x: 0, y: 26.8, w: width, h: .7, color: colors.yellow },
    { x: 18.6, y: 29.1, w: 16.8, h: 20.8, color: colors.royal },
    { x: 0, y: 80, w: width, h: height - 80, color: colors.navy }
  ];
  let fontPromise;
  let measureContext;
  async function prepareFont() {
    if (!fontPromise) fontPromise = (async () => {
      await window.SIA.assets.load('pdf');
      const fonts = window.SIA.vendors.cardFonts;
      const faces = await Promise.all([['400', fonts.normal], ['700', fonts.bold]].map(async ([weight, data]) => {
        const face = new FontFace('SIA Card Roboto', 'url(data:font/ttf;base64,' + data + ')', { weight });
        await face.load(); document.fonts.add(face); return face;
      }));
      return faces;
    })().catch((error) => { fontPromise = null; throw error; });
    await fontPromise;
  }
  function measure(text, size, bold) {
    if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
    measureContext.font = `${bold ? 700 : 400} ${size * 96 / 25.4}px "SIA Card Roboto"`;
    return measureContext.measureText(text).width * 25.4 / 96;
  }
  function linesFor(text, box, size) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (measure(next, size, box.bold) <= box.w) { line = next; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && measure(line + character, size, box.bold) > box.w) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  function fitText(value, box) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    let size = box.fontSize;
    let lines = linesFor(text, box, size);
    // Roboto's ascender/descender span is 1.171875 em. Use that same leading
    // in the browser and pdfmake's native Roboto line metrics.
    const minimum = box.minFontSize || .3;
    const overflows = () => lines.length * size * 1.171875 > box.h || (box.maxLines && lines.length > box.maxLines);
    while (overflows() && size > minimum) {
      size = Math.max(minimum, Math.round((size - .05) * 100) / 100);
      lines = linesFor(text, box, size);
    }
    // Only the optional address has a bounded summary. Core identity fields
    // retain their complete text, and the full address stays in school data.
    if (box.maxLines && lines.length > box.maxLines) {
      lines = lines.slice(0, box.maxLines);
      let last = lines[lines.length - 1].trimEnd();
      while (last && measure(last + '…', size, box.bold) > box.w) last = last.slice(0, -1);
      lines[lines.length - 1] = last.trimEnd() + '…';
    }
    return { ...box, text: lines.join('\n'), fontSize: size, lineHeight: size * 1.171875 };
  }
  function content(school, card) {
    return {
      title: fitText('KARTU ID SISWA', boxes.title), schoolName: fitText(school.name, boxes.schoolName),
      identity: fitText(school.identity, boxes.identity), name: fitText(card.name, boxes.name),
      nisn: fitText('NISN: ' + (card.nisn || 'Belum diisi'), boxes.nisn),
      className: fitText('Kelas: ' + card.className, boxes.className), address: fitText(school.address, boxes.address)
    };
  }
  function place(node, box) {
    Object.assign(node.style, { position: 'absolute', left: box.x + 'mm', top: box.y + 'mm', width: box.w + 'mm', height: box.h + 'mm' });
    return node;
  }
  function textNode(node, box) {
    place(node, box);
    node.textContent = box.text;
    Object.assign(node.style, { fontSize: box.fontSize + 'mm', lineHeight: box.lineHeight + 'mm',
      fontWeight: box.bold ? '700' : '400', color: box.color });
    return node;
  }
  window.SIA.cardLayout = { width, height, colors, boxes, decorations, prepareFont, content, place, textNode };
})();
