import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

async function students(page, query = '') {
  await page.goto('/' + query + '#siswa');
  await expect(page.locator('.pagination')).toContainText(query ? '36 siswa' : '288 siswa');
}
async function filterPupil(page) {
  await page.getByLabel('Cari siswa', { exact: true }).fill('CONTOH-001');
  await expect(page.locator('tbody tr')).toHaveCount(1);
}
async function png(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 50;
    const context = canvas.getContext('2d'); context.fillStyle = '#75a99c'; context.fillRect(0, 0, 40, 50);
    return canvas.toDataURL('image/png');
  });
}
async function download(page, action) {
  const pending = page.waitForEvent('download'); await action();
  const result = await pending; return readFile(await result.path());
}
async function token(page, id = 'DEMO-S1') {
  return page.evaluate(async (id) => (await window.SIA.api.rpc('prepareStudentCards', { studentIds: [id] })).cards[0].qr, id);
}

test('sidebar adds only admin school settings; name/logo/address update card preview', async ({ page }) => {
  await page.goto('/#settings');
  await expect(page.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
  await expect(page.locator('nav .nav-item')).toHaveCount(9);
  await expect(page.locator('nav [data-route="cards"],nav [data-route="scan"]')).toHaveCount(0);
  const logo = await png(page);
  await page.getByLabel('Nama sekolah', { exact: true }).fill('Sekolah Identitas Baru');
  await page.getByLabel('Alamat sekolah').fill('Jl. Pendidikan 12');
  await page.getByLabel('Identitas tambahan sekolah').fill('NPSN 12345678');
  await page.getByLabel('Logo sekolah', { exact: true }).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo.split(',')[1], 'base64') });
  await page.getByRole('button', { name: 'Simpan pengaturan sekolah', exact: true }).click();
  await expect(page.locator('.school-feedback')).toContainText('Pengaturan sekolah disimpan');
  await page.locator('nav [data-route="siswa"]').click();
  await filterPupil(page);
  await page.getByRole('button', { name: 'Cetak kartu ID', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cetak Kartu ID', exact: true });
  await expect(modal.locator('.id-card')).toHaveCount(1);
  await expect(modal.locator('.id-card-header')).toContainText('Sekolah Identitas Baru');
  await expect(modal.locator('.id-school-logo')).toHaveCount(1);
  await expect(modal.locator('.id-card footer')).toHaveText('Jl. Pendidikan 12');
});

test('legacy UI preserves basic CRUD and migrates only after admin confirms a backup', async ({ page }) => {
  await page.goto('/?demo=legacy#siswa');
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  await page.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await page.getByLabel('Nama siswa', { exact: true }).fill('Siswa Legacy');
  await page.getByLabel('NIS', { exact: true }).fill('LEGACY-01');
  await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.students-feedback')).toHaveText('Data siswa berhasil disimpan.');
  const before = await page.evaluate(async () => JSON.stringify(await window.SIA.api.rpc('listStudents')));
  await page.locator('nav [data-route=settings]').click();
  await expect(page.locator('.migration-box')).toContainText('Data lama tetap dapat dipakai');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Siapkan database Tahap 3', exact: true }).click();
  await expect(page.locator('.migration-box')).toContainText('Database profil siswa siap (skema v2)');
  await expect(page.locator('.migration-box')).toContainText('Cadangan SIA sebelum Tahap 3');
  expect(await page.evaluate(async () => JSON.stringify(await window.SIA.api.rpc('listStudents')))).toBe(before);
});

test('student guardian/photo edit persists and exports real Excel/PDF through preview popup', async ({ page }) => {
  await students(page); await filterPupil(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('NISN (opsional)').fill('0123456789');
  await page.getByLabel('Nama wali murid').fill('Wali Contoh');
  await page.getByLabel('Telepon/WhatsApp wali').fill('+62 812-3456-7890');
  await page.getByLabel('Hubungan wali dengan siswa').fill('Ibu');
  const photo = await png(page);
  await page.getByLabel('Foto siswa', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.students-feedback')).toHaveText('Data siswa berhasil disimpan.');
  await expect(page.locator('tbody')).toContainText('Wali Contoh');
  await expect(page.locator('tbody')).toContainText('+6281234567890');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Nama wali murid')).toHaveValue('Wali Contoh');
  await expect(page.locator('.image-field img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('button', { name: 'Unduh data Excel / PDF', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Unduh Data Siswa', exact: true });
  await expect(modal.locator('tbody')).toContainText('0123456789');
  const bytes = await download(page, () => modal.getByRole('button', { name: 'Unduh Excel', exact: true }).click());
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet('Data Siswa');
  expect(sheet.rowCount).toBe(2);
  expect(sheet.getCell('C2').value).toBe('0123456789');
  expect(sheet.getCell('E2').value).toBe('Wali Contoh');
  expect(sheet.getCell('F2').value).toBe('+6281234567890');
  const pdf = await PDFDocument.load(await download(page, () => modal.getByRole('button', { name: 'Unduh PDF data', exact: true }).click()));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
});

test('individual card preview and PDF have portrait ID dimensions and a decodable unique QR', async ({ page }, testInfo) => {
  await students(page); await filterPupil(page);
  await page.getByRole('button', { name: 'Cetak kartu ID', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cetak Kartu ID', exact: true });
  await expect(modal.locator('.id-card')).toHaveCount(1);
  const size = await modal.locator('.id-card').boundingBox();
  expect(size.width).toBeCloseTo(54 * 96 / 25.4, 0);
  expect(size.height).toBeCloseTo(85.6 * 96 / 25.4, 0);
  const qr = await modal.locator('.id-qr').getAttribute('src');
  const decoded = await page.evaluate(async (qr) => (await window.SIA.qrCamera.createReader().decodeFromImageUrl(qr)).getText(), qr);
  expect(decoded).toMatch(/^SIA-ID:1:[a-f0-9-]{36}$/);
  expect(decoded).toBe(await token(page));
  await page.screenshot({ path: testInfo.outputPath('kartu-preview.png') });
  await page.evaluate(() => { window.print = () => { window.__printedCards = { count: document.querySelectorAll('.id-card').length,
    printClass: document.body.classList.contains('printing-cards') }; window.dispatchEvent(new Event('afterprint')); }; });
  await modal.getByRole('button', { name: 'Cetak kartu', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__printedCards)).toEqual({ count: 1, printClass: true });
  const pdf = await PDFDocument.load(await download(page, () => modal.getByRole('button', { name: 'Unduh PDF kartu', exact: true }).click()));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(54 * 72 / 25.4, 1);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(85.6 * 72 / 25.4, 1);
});

test('toolbar class batch preview generates one PDF card page per active pupil', async ({ page }) => {
  await students(page);
  await page.getByRole('button', { name: 'Cetak Kartu ID', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cetak Kartu ID', exact: true });
  await modal.getByLabel('Kelas cetak massal').selectOption('DEMO-K1');
  await modal.getByRole('button', { name: 'Tampilkan kartu', exact: true }).click();
  await expect(modal.locator('.id-card')).toHaveCount(36);
  const pdf = await PDFDocument.load(await download(page, () => modal.getByRole('button', { name: 'Unduh PDF kartu', exact: true }).click()));
  expect(pdf.getPageCount()).toBe(36);
});

test('QR requires officer confirmation, writes once, then prevents a duplicate', async ({ page }) => {
  await page.goto('/#absensi');
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  const qr = await token(page);
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await page.getByLabel('Kode QR (alternatif pembaca USB atau tempel)').fill(qr);
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Konfirmasi Absensi QR', exact: true });
  await expect(modal).toContainText('Siswa Contoh 001');
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await modal.getByRole('button', { name: 'Konfirmasi Hadir', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.attendance-summary')).toContainText('Hadir: 1');
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  await expect(modal).toContainText('Siswa sudah tercatat');
  await expect(modal.getByRole('button', { name: 'Konfirmasi Hadir', exact: true })).toBeDisabled();
});

test('teacher sees no settings menu and retains card/QR access only within assigned class', async ({ page }) => {
  await students(page, '?demo=teacher');
  await expect(page.locator('nav [data-route=settings]')).toBeHidden();
  const denied = await page.evaluate(async () => { try { await window.SIA.api.rpc('getSchoolSettings'); } catch (error) { return error.code; } });
  expect(denied).toBe('FORBIDDEN');
  await page.getByRole('button', { name: 'Cetak Kartu ID', exact: true }).click();
  await expect(page.getByLabel('Kelas cetak massal').locator('option')).toHaveCount(2); // placeholder plus assigned class
});

test('camera denial is handled and manual attendance remains available on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#absensi');
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai kamera', exact: true }).click();
  await expect(page.locator('#scan-attendance-panel .page-feedback')).toContainText('Kamera tidak dapat dibuka');
  await page.getByRole('tab', { name: 'Absensi Manual', exact: true }).click();
  await expect(page.getByLabel('Status Siswa Contoh 001', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('real QR decoder scans a synthetic camera stream and releases tracks before confirmation', async ({ page }) => {
  await page.goto('/#absensi');
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  const qr = await token(page);
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.evaluate(async (qr) => {
    const qrCanvas = document.createElement('canvas');
    await window.SIA.vendors.QRCode.toCanvas(qrCanvas, qr, { width: 300, margin: 4 });
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const draw = () => { const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 640, 480); context.drawImage(qrCanvas, 170, 90); };
    draw();
    const stream = canvas.captureStream(10);
    window.__testCameraStream = stream; window.__cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequests++; return stream; };
    window.__cameraTimer = setInterval(draw, 100);
  }, qr);
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai kamera', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Konfirmasi Absensi QR', exact: true })).toContainText('Siswa Contoh 001');
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(1);
  expect(await page.evaluate(() => window.__testCameraStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
  await page.evaluate(() => clearInterval(window.__cameraTimer));
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
});

test('leaving the scan page stops a live camera and its video tracks', async ({ page }) => {
  await page.goto('/#absensi');
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    canvas.getContext('2d').fillRect(0, 0, 320, 240);
    window.__testCameraStream = canvas.captureStream(5);
    navigator.mediaDevices.getUserMedia = async () => window.__testCameraStream;
  });
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai kamera', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('nav [data-route=kelas]').click();
  await expect(page.locator('#page-title')).toHaveText('Data Kelas');
  expect(await page.evaluate(() => window.__testCameraStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
});


test('dense QR payload regression decodes through the production camera adapter', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#stat-students')).toHaveText('288');
  const payload = await readFile(new URL('../fixtures/qr-dense-payload.txt', import.meta.url), 'utf8');
  const decoded = await page.evaluate(async (payload) => {
    const image = await window.SIA.vendors.QRCode.toDataURL(payload, { scale: 8, margin: 4, errorCorrectionLevel: 'M' });
    return (await window.SIA.qrCamera.createReader().decodeFromImageUrl(image)).getText();
  }, payload);
  expect(decoded).toBe(payload);
});
