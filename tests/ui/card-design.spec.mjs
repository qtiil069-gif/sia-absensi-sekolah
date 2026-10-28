import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';

const mmToPt = (mm) => mm * 72 / 25.4;
const mmToPx = (mm) => mm * 96 / 25.4;

async function transparentLogo(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const draw = canvas.getContext('2d');
    draw.fillStyle = '#2454c6'; draw.fillRect(12, 12, 40, 40);
    draw.fillStyle = '#ffffff'; draw.fillRect(28, 28, 8, 8);
    return canvas.toDataURL('image/png');
  });
}

async function imagePixels(page, source) {
  return page.evaluate(async (source) => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const draw = canvas.getContext('2d'); draw.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height,
      corner: [...draw.getImageData(0, 0, 1, 1).data],
      color: [...draw.getImageData(16, 16, 1, 1).data],
      white: [...draw.getImageData(30, 30, 1, 1).data] };
  }, source);
}

async function openCard(page) {
  await page.locator('nav [data-route="siswa"]').click();
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  await page.getByLabel('Cari siswa', { exact: true }).fill('CONTOH-001');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cetak kartu ID', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cetak Kartu ID', exact: true });
  await expect(modal.locator('.id-card')).toHaveCount(1);
  return modal;
}

async function capturePdfDefinition(page) {
  await page.evaluate(async () => {
    await window.SIA.assets.load('pdf');
    const pdfMake = window.SIA.vendors.pdfMake;
    const create = pdfMake.createPdf.bind(pdfMake);
    pdfMake.createPdf = (definition) => { window.__cardPdfDefinition = structuredClone(definition); return create(definition); };
  });
}

async function cardPdf(page, modal) {
  const pending = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Unduh PDF kartu', exact: true }).click();
  const result = await pending;
  const bytes = await readFile(await result.path());
  return { bytes, pdf: await PDFDocument.load(bytes) };
}

async function decodedQr(page, source) {
  return page.evaluate(async (source) => (await window.SIA.qrCamera.createReader().decodeFromImageUrl(source)).getText(), source);
}

async function sharedPresentation(page) {
  return page.evaluate(() => {
    const layout = window.SIA.cardLayout;
    const card = document.querySelector('.id-card');
    const origin = card.getBoundingClientRect();
    const selectors = { logo: '.id-school-logo', title: '.id-card-title', schoolName: '.id-card-header h3',
      identity: '.id-school-identity', name: '.id-name', nisn: '.id-nisn', className: '.id-class', address: 'footer', qr: '.id-qr' };
    const pdfItems = window.__cardPdfDefinition.content[0].stack.flatMap((item) => item.columns
      ? item.columns.map((column) => ({ ...column, absolutePosition: item.absolutePosition })) : [item]);
    const canvas = pdfItems.flatMap((item) => item.canvas || []);
    const photo = card.querySelector('.id-photo.photo-placeholder');
    const photoRect = photo?.getBoundingClientRect();
    return { colors: layout.colors, boxes: Object.entries(selectors).map(([key, selector]) => {
      const node = card.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const item = pdfItems.find((item) => node.tagName === 'IMG' ? item.image === node.src : item.text === node.textContent);
      return { key, expected: layout.boxes[key], actual: { x: rect.left - origin.left, y: rect.top - origin.top,
        w: rect.width, h: rect.height, fontSize: parseFloat(style.fontSize), color: style.color }, pdf: item };
    }).filter(Boolean), canvasColors: canvas.map((shape) => shape.color?.toUpperCase()),
    placeholder: photo ? { expected: layout.boxes.photo, color: layout.colors.soft,
      actual: { x: photoRect.left - origin.left, y: photoRect.top - origin.top, w: photoRect.width, h: photoRect.height,
        background: getComputedStyle(photo).backgroundColor },
      pdf: canvas.find((shape) => shape.type === 'rect' && shape.color === layout.colors.soft) } : null };
  });
}

test('transparent school logo survives upload, preview and actual PDF without losing its opaque white identity', async ({ page }, testInfo) => {
  await page.goto('/#settings');
  await expect(page.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
  const logo = await transparentLogo(page);
  await page.getByLabel('Nama sekolah', { exact: true }).fill('SD Contoh Identitas');
  await page.getByLabel('Alamat sekolah').fill('Jl. Pendidikan 12');
  await page.getByLabel('Identitas tambahan sekolah').fill('NPSN 12345678');
  await page.getByLabel('Logo sekolah', { exact: true }).setInputFiles({ name: 'logo-transparan.png', mimeType: 'image/png', buffer: Buffer.from(logo.split(',')[1], 'base64') });
  await page.getByRole('button', { name: 'Simpan pengaturan sekolah', exact: true }).click();
  await expect(page.locator('.school-feedback')).toContainText('Pengaturan sekolah disimpan');
  const saved = await page.evaluate(() => window.SIA.api.rpc('getSchoolSettings'));
  expect(saved.logo).toMatch(/^data:image\/png;base64,/);
  expect(await imagePixels(page, saved.logo)).toEqual({ width: 64, height: 64,
    corner: [0, 0, 0, 0], color: [36, 84, 198, 255], white: [255, 255, 255, 255] });

  const modal = await openCard(page);
  await expect(modal.locator('.id-school-logo')).toHaveAttribute('src', saved.logo);
  await expect(modal.locator('.id-school-logo + .id-card-title')).toHaveText('KARTU ID SISWA');
  await expect(modal.locator('.id-card-header')).toContainText('SD Contoh Identitas');
  await expect(modal.locator('.id-card footer')).toHaveText('Jl. Pendidikan 12');
  const dimensions = await modal.locator('.id-card').boundingBox();
  expect(dimensions.width).toBeCloseTo(mmToPx(54), 0);
  expect(dimensions.height).toBeCloseTo(mmToPx(85.6), 0);

  await capturePdfDefinition(page);
  const { bytes, pdf } = await cardPdf(page, modal);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(mmToPt(54), 1);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(mmToPt(85.6), 1);
  const presentation = await sharedPresentation(page);
  expect(presentation.colors).toMatchObject({ royal: '#2354C5', navy: '#102B5C', yellow: '#F6C945', white: '#FFFFFF' });
  expect(presentation.canvasColors).toEqual(expect.arrayContaining(['#2354C5', '#102B5C', '#F6C945', '#FFFFFF']));
  for (const { key, expected, actual, pdf: item } of presentation.boxes) {
    for (const axis of ['x', 'y', 'w', 'h']) expect(actual[axis], key + ' DOM ' + axis).toBeCloseTo(mmToPx(expected[axis]), 0);
    expect(item, key + ' must also appear in the actual PDF definition').toBeTruthy();
    expect(item.absolutePosition.x, key + ' PDF x').toBeCloseTo(mmToPt(expected.x), 1);
    expect(item.absolutePosition.y, key + ' PDF y').toBeCloseTo(mmToPt(expected.y), 1);
    if (item.text) expect(item.fontSize, key + ' PDF/preview font size').toBeCloseTo(actual.fontSize * 72 / 96, 1);
    if (expected.color) {
      const rgb = expected.color.slice(1).match(/../g).map((value) => parseInt(value, 16));
      expect(actual.color, key + ' preview color').toBe('rgb(' + rgb.join(', ') + ')');
      expect(item.color, key + ' PDF color').toBe(expected.color);
    }
  }
  expect(presentation.placeholder, 'the unpictured pupil has a preview placeholder').toBeTruthy();
  const placeholder = presentation.placeholder;
  expect(placeholder.color).toBe('#EEF3FC');
  expect(placeholder.actual.background).toBe('rgb(238, 243, 252)');
  expect(placeholder.pdf, 'actual PDF must fill the photo placeholder with the same light blue').toBeTruthy();
  expect(placeholder.pdf.color).toBe(placeholder.color);
  for (const axis of ['x', 'y', 'w', 'h']) {
    expect(placeholder.actual[axis], 'photo placeholder DOM ' + axis).toBeCloseTo(mmToPx(placeholder.expected[axis]), 0);
    expect(placeholder.pdf[axis], 'photo placeholder PDF ' + axis).toBeCloseTo(mmToPt(placeholder.expected[axis]), 1);
  }
  const logoImage = pdf.context.enumerateIndirectObjects().map(([, value]) => value).find((value) =>
    value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') &&
    value.dict.lookup(PDFName.of('Width'))?.asNumber() === 64 && value.dict.lookup(PDFName.of('Height'))?.asNumber() === 64);
  expect(logoImage, 'actual PDF embeds the original 64 × 64 logo').toBeTruthy();
  const mask = pdf.context.lookup(logoImage.dict.get(PDFName.of('SMask')), PDFRawStream);
  const alpha = decodePDFRawStream(mask).decode();
  expect(alpha).toContain(0);
  expect(alpha).toContain(255);
  await writeFile(testInfo.outputPath('kartu-royal.pdf'), bytes);
  await modal.locator('.id-card').screenshot({ path: testInfo.outputPath('kartu-royal-preview.png') });
});

test('new school settings refresh both preview and actual PDF while retaining the issued QR token', async ({ page }) => {
  await page.goto('/#siswa');
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  const before = await page.evaluate(async () => (await window.SIA.api.rpc('prepareStudentCards', { studentIds: ['DEMO-S1'] })).cards[0].qr);
  const modal = await openCard(page);
  expect(await decodedQr(page, await modal.locator('.id-qr').getAttribute('src'))).toBe(before);
  await page.evaluate(async () => {
    const school = await window.SIA.api.rpc('getSchoolSettings');
    await window.SIA.api.rpc('updateSchoolSettings', { name: 'Sekolah Baru untuk Cetak', address: 'Alamat cetak terbaru',
      identity: 'NPSN 87654321', logo: school.logo, expectedRevision: school.revision });
  });
  await capturePdfDefinition(page);
  const { pdf } = await cardPdf(page, modal);
  expect(pdf.getPageCount()).toBe(1);
  await expect(modal.locator('.id-card-header')).toContainText('Sekolah Baru untuk Cetak');
  await expect(modal.locator('.id-card footer')).toHaveText('Alamat cetak terbaru');
  const source = await modal.locator('.id-qr').getAttribute('src');
  expect(await decodedQr(page, source)).toBe(before);
  const definition = await page.evaluate(() => window.__cardPdfDefinition);
  const items = definition.content.flatMap((card) => card.stack).flatMap((item) => item.columns
    ? item.columns.map((column) => ({ ...column, absolutePosition: item.absolutePosition })) : [item]);
  expect(items.some((item) => String(item.text).replace(/\s+/g, ' ').includes('Sekolah Baru untuk Cetak'))).toBe(true);
  expect(items.some((item) => String(item.text).replace(/\s+/g, ' ').includes('Alamat cetak terbaru'))).toBe(true);
  expect(items.some((item) => item.text === 'KARTU ID SISWA')).toBe(true);
  expect(items.some((item) => item.image === source)).toBe(true);
});

test('long student and school names remain safe and fit the portrait card without logo or photo', async ({ page }) => {
  await page.goto('/#siswa');
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  const name = 'Nama Murid <img src=x onerror=alert(1)> ' + 'Panjang '.repeat(10);
  const schoolName = ('Sekolah Dasar Identitas Panjang '.repeat(4)).slice(0, 120);
  await page.evaluate(async ({ name, schoolName }) => {
    const school = await window.SIA.api.rpc('getSchoolSettings');
    await window.SIA.api.rpc('updateSchoolSettings', { name: schoolName, logo: '',
      address: 'Alamat sekolah sangat panjang '.repeat(16), identity: 'Identitas sekolah '.repeat(10), expectedRevision: school.revision });
    const student = (await window.SIA.api.rpc('queryStudents', { q: 'CONTOH-001' })).items[0];
    await window.SIA.api.rpc('updateStudent', { id: student.id, expectedRevision: student.revision, name,
      nis: student.nis, nisn: '0123456789', classId: student.classIds[0], photo: '' });
  }, { name, schoolName });
  const modal = await openCard(page);
  await expect(modal.locator('.id-school-logo')).toHaveCount(0);
  await expect(modal.locator('.id-photo.photo-placeholder')).toBeVisible();
  expect((await modal.locator('.id-name').innerText()).replace(/\s/g, '')).toBe(name.replace(/\s/g, ''));
  expect((await modal.locator('.id-card-header h3').innerText()).replace(/\s/g, '')).toBe(schoolName.replace(/\s/g, ''));
  await expect(modal.locator('.id-name img')).toHaveCount(0);
  await expect(modal.locator('.id-nisn')).toHaveText('NISN: 0123456789');
  const boxes = await modal.locator('.id-card').evaluate((card) => {
    const parent = card.getBoundingClientRect();
    return [...card.querySelectorAll('.id-card-title,h3,.id-photo,.id-name,.id-nisn,.id-class,.id-qr,footer')].map((node) => {
      const box = node.getBoundingClientRect();
      return { className: node.tagName === 'H3' ? 'school-name' : node.className, left: box.left - parent.left, top: box.top - parent.top,
        right: parent.right - box.right, bottom: parent.bottom - box.bottom, overflow: node.scrollHeight - node.clientHeight };
    });
  });
  for (const box of boxes) {
    expect(box.left, box.className).toBeGreaterThanOrEqual(-1);
    expect(box.top, box.className).toBeGreaterThanOrEqual(-1);
    expect(box.right, box.className).toBeGreaterThanOrEqual(-1);
    expect(box.bottom, box.className).toBeGreaterThanOrEqual(-1);
  }
  for (const box of boxes.filter((item) => item.className === 'id-name' || item.className === 'school-name')) {
    expect(box.overflow, box.className + ' must not clip identity text').toBeLessThanOrEqual(1);
  }
  const { pdf } = await cardPdf(page, modal);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(mmToPt(54), 1);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(mmToPt(85.6), 1);
});

test('student landscape photo uses the same centered portrait crop in preview and actual PDF without changing identity or QR', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#stat-students')).toHaveText('288');
  const before = await page.evaluate(async () => {
    const student = (await window.SIA.api.rpc('queryStudents', { q: 'CONTOH-001' })).items[0];
    const updated = await window.SIA.api.rpc('updateStudent', { id: student.id, expectedRevision: student.revision,
      name: student.name, nis: student.nis, nisn: '0123456789', classId: student.classIds[0] });
    const card = (await window.SIA.api.rpc('prepareStudentCards', { studentIds: [student.id] })).cards[0];
    return { name: updated.name, nisn: updated.nisn, qr: card.qr };
  });
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 50;
    const draw = canvas.getContext('2d');
    draw.fillStyle = '#2354c5'; draw.fillRect(0, 0, 80, 50);
    draw.fillStyle = '#f6c945'; draw.fillRect(24, 0, 32, 50);
    draw.fillStyle = '#102b5c'; draw.fillRect(34, 12, 12, 26);
    draw.fillStyle = '#ffffff'; draw.fillRect(0, 0, 8, 50); draw.fillRect(72, 0, 8, 50);
    return canvas.toDataURL('image/png');
  });
  await page.locator('nav [data-route="siswa"]').click();
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  await page.getByLabel('Cari siswa', { exact: true }).fill('CONTOH-001');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Nama siswa', { exact: true })).toHaveValue(before.name);
  await expect(page.getByLabel('NISN (opsional)', { exact: true })).toHaveValue(before.nisn);
  await page.getByLabel('Foto siswa', { exact: true }).setInputFiles({ name: 'foto-bentuk-landscape.png', mimeType: 'image/png',
    buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.students-feedback')).toHaveText('Data siswa berhasil disimpan.');
  const saved = await page.evaluate(async () => (await window.SIA.api.rpc('prepareStudentCards', { studentIds: ['DEMO-S1'] })).cards[0]);
  expect(saved.name).toBe(before.name);
  expect(saved.nisn).toBe(before.nisn);
  expect(saved.qr).toBe(before.qr);
  expect(saved.photo).toMatch(/^data:image\/jpeg;base64,/);

  await page.getByRole('button', { name: 'Cetak kartu ID', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cetak Kartu ID', exact: true });
  await expect(modal.locator('.id-photo')).toHaveAttribute('src', saved.photo);
  await expect(modal.locator('.id-photo')).toHaveCSS('object-fit', 'cover');
  await expect(modal.locator('.id-photo')).toHaveCSS('object-position', '50% 50%');
  await expect(modal.locator('.id-nisn')).toHaveText('NISN: 0123456789');
  expect(await decodedQr(page, await modal.locator('.id-qr').getAttribute('src'))).toBe(before.qr);
  await capturePdfDefinition(page);
  const { bytes, pdf } = await cardPdf(page, modal);
  expect(pdf.getPageCount()).toBe(1);
  const geometry = await page.evaluate((source) => {
    const card = document.querySelector('.id-card').getBoundingClientRect();
    const photo = document.querySelector('.id-photo').getBoundingClientRect();
    const item = window.__cardPdfDefinition.content[0].stack.find((item) => item.columns?.some((column) => column.image === source));
    return { expected: window.SIA.cardLayout.boxes.photo, column: item.columns.find((column) => column.image === source),
      position: item.absolutePosition, actual: { x: photo.left - card.left, y: photo.top - card.top, w: photo.width, h: photo.height } };
  }, saved.photo);
  expect(geometry.column.cover.align).toBe('center');
  expect(geometry.column.cover.valign).toBe('center');
  expect(geometry.column.cover.width).toBeCloseTo(mmToPt(geometry.expected.w), 1);
  expect(geometry.column.cover.height).toBeCloseTo(mmToPt(geometry.expected.h), 1);
  for (const axis of ['x', 'y', 'w', 'h']) expect(geometry.actual[axis], 'photo DOM ' + axis).toBeCloseTo(mmToPx(geometry.expected[axis]), 0);
  for (const axis of ['x', 'y']) expect(geometry.position[axis], 'photo PDF ' + axis).toBeCloseTo(mmToPt(geometry.expected[axis]), 1);
  const embeddedPhoto = pdf.context.enumerateIndirectObjects().some(([, value]) => value instanceof PDFRawStream &&
    value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') && value.dict.lookup(PDFName.of('Width'))?.asNumber() === 80 &&
    value.dict.lookup(PDFName.of('Height'))?.asNumber() === 50 && value.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'));
  expect(embeddedPhoto, 'actual PDF embeds the uploaded landscape JPEG').toBe(true);
  await writeFile(testInfo.outputPath('kartu-foto-landscape.pdf'), bytes);
  await modal.locator('.id-card').screenshot({ path: testInfo.outputPath('kartu-foto-landscape-preview.png') });
});
