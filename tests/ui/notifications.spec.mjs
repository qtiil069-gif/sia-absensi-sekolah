import { test, expect } from '@playwright/test';

const toast = (page) => page.locator('.toast');
const success = (page) => page.locator('.toast--success');
const failure = (page) => page.locator('.toast--error');
const row = (page, name) => page.locator('tbody tr').filter({ hasText: name });

async function open(page, route) {
  await page.goto('/#' + route);
  await expect(page.locator('#module-title')).toHaveText({ kelas: 'Data Kelas', siswa: 'Data Siswa',
    absensi: 'Absensi Siswa', settings: 'Pengaturan Sekolah' }[route]);
  if (route === 'kelas' || route === 'siswa') await expect(page.locator('tbody tr').first()).toBeVisible();
  if (route === 'absensi') await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  if (route === 'settings') await expect(page.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
}

// Hold the response before the real demo backend runs. Pending assertions must
// not depend on an arbitrary timeout or a mocked success in the browser itself.
async function gateRpc(page, method, error = null) {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/__demo/rpc', async (route) => {
    if (route.request().postDataJSON().method !== method) return route.continue();
    calls++;
    await pending;
    if (error) return route.fulfill({ json: { ok: false, error: { code: 'WRITE_FAILED', message: error } } });
    return route.continue();
  });
  return { release, calls: () => calls, entered: () => expect.poll(() => calls).toBe(1) };
}

async function expectSuccess(page, text) {
  await expect(success(page)).toHaveCount(1);
  await expect(success(page).locator('.toast-message')).toHaveText(text);
  await expect(success(page)).toHaveAttribute('role', 'status');
  await expect(success(page).locator('.toast-icon')).toHaveText('✓');
  await expect(failure(page)).toHaveCount(0);
}

async function closeToast(page) {
  await page.getByRole('button', { name: 'Tutup notifikasi', exact: true }).click();
  await expect(toast(page)).toHaveCount(0);
}

async function createClassForm(page, name = 'Kelas Notifikasi') {
  await page.getByRole('button', { name: 'Tambah kelas', exact: true }).click();
  await page.getByLabel('Nama kelas', { exact: true }).fill(name);
}

test('class notifications await backend confirmation, reject duplicate submits and keep deactivate confirmation', async ({ page }) => {
  await open(page, 'kelas');
  const gate = await gateRpc(page, 'createClass');
  await createClassForm(page);
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await gate.entered();
  await expect(toast(page)).toHaveCount(0);
  await page.locator('.record-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(gate.calls()).toBe(1);
  gate.release();
  await expectSuccess(page, 'Kelas berhasil disimpan.');
  await expect(row(page, 'Kelas Notifikasi')).toHaveCount(1);
  await closeToast(page);

  await row(page, 'Kelas Notifikasi').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Nama kelas', { exact: true }).fill('Kelas Notifikasi Revisi');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expectSuccess(page, 'Kelas berhasil diperbarui.');
  await expect(row(page, 'Kelas Notifikasi Revisi')).toHaveCount(1);
  await closeToast(page);

  const deactivations = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/__demo/rpc') && request.postDataJSON().method === 'deactivateClass') deactivations.push(request);
  });
  page.once('dialog', (dialog) => dialog.dismiss());
  await row(page, 'Kelas Notifikasi Revisi').getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await expect(toast(page)).toHaveCount(0);
  expect(deactivations).toHaveLength(0);
  await expect(row(page, 'Kelas Notifikasi Revisi')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await row(page, 'Kelas Notifikasi Revisi').getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await expectSuccess(page, 'Kelas berhasil dinonaktifkan.');
  expect(deactivations).toHaveLength(1);
});

test('student create, update and soft deactivate use distinct success notifications', async ({ page }) => {
  await open(page, 'siswa');
  await page.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await page.getByLabel('Nama siswa', { exact: true }).fill('Siswa Notifikasi');
  await page.getByLabel('NIS', { exact: true }).fill('TOAST-001');
  await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expectSuccess(page, 'Data siswa berhasil disimpan.');
  await closeToast(page);
  await page.getByLabel('Cari siswa', { exact: true }).fill('TOAST-001');
  await expect(row(page, 'Siswa Notifikasi')).toHaveCount(1);
  await row(page, 'Siswa Notifikasi').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Nama siswa', { exact: true }).fill('Siswa Notifikasi Revisi');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expectSuccess(page, 'Data siswa berhasil diperbarui.');
  await expect(row(page, 'Siswa Notifikasi Revisi')).toHaveCount(1);
  await closeToast(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await row(page, 'Siswa Notifikasi Revisi').getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await expect(toast(page)).toHaveCount(0);
  await expect(row(page, 'Siswa Notifikasi Revisi')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await row(page, 'Siswa Notifikasi Revisi').getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await expectSuccess(page, 'Data siswa berhasil dinonaktifkan.');
  await page.getByLabel('Status siswa').selectOption('inactive');
  await expect(row(page, 'Siswa Notifikasi Revisi')).toContainText('Nonaktif');
});

test('failed class deactivation keeps the active record and shows only a backend-confirmed error', async ({ page }) => {
  await open(page, 'kelas');
  const name = await page.locator('tbody tr').first().locator('td').first().textContent();
  const gate = await gateRpc(page, 'deactivateClass', 'Kelas gagal dinonaktifkan. Data tetap tersedia.');
  page.once('dialog', (dialog) => dialog.accept());
  await row(page, name).getByRole('button', { name: 'Nonaktifkan', exact: true }).click();
  await gate.entered();
  await expect(toast(page)).toHaveCount(0);
  await expect(row(page, name)).toContainText('Aktif');
  gate.release();
  await expect(failure(page).locator('.toast-message')).toHaveText('Kelas gagal dinonaktifkan. Data tetap tersedia.');
  await expect(success(page)).toHaveCount(0);
  await expect(row(page, name).getByRole('button', { name: 'Nonaktifkan', exact: true })).toBeEnabled();
  await expect(row(page, name)).toContainText('Aktif');
});

for (const scenario of [
  { route: 'kelas', method: 'createClass', form: async (page) => createClassForm(page), button: 'Simpan', inline: '.record-editor .page-feedback' },
  { route: 'siswa', method: 'createStudent', form: async (page) => {
    await page.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
    await page.getByLabel('Nama siswa', { exact: true }).fill('Siswa Gagal');
    await page.getByLabel('NIS', { exact: true }).fill('TOAST-FAIL');
    await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K1');
  }, button: 'Simpan', inline: '.record-editor .page-feedback' },
  { route: 'settings', method: 'updateSchoolSettings', form: async (page) => page.getByLabel('Nama sekolah', { exact: true }).fill('Sekolah Gagal'),
    button: 'Simpan pengaturan sekolah', inline: '.school-feedback' }
]) {
  test(`${scenario.method} failure shows one safe error toast and never shows success while pending or failed`, async ({ page }) => {
    await open(page, scenario.route);
    const error = '<img src=x onerror="window.toastInjected=true"> Penyimpanan gagal.';
    const gate = await gateRpc(page, scenario.method, error);
    await scenario.form(page);
    await page.getByRole('button', { name: scenario.button, exact: true }).click();
    await gate.entered();
    await expect(toast(page)).toHaveCount(0);
    gate.release();
    await expect(failure(page)).toHaveCount(1);
    await expect(failure(page)).toHaveAttribute('role', 'alert');
    await expect(failure(page).locator('.toast-message')).toHaveText(error);
    await expect(page.locator(scenario.inline)).toHaveText(error);
    await expect(success(page)).toHaveCount(0);
    await expect(failure(page).locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => window.toastInjected)).toBeUndefined();
  });
}

test('manual attendance reports success only after the attendance backend response', async ({ page }) => {
  await open(page, 'absensi');
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('button', { name: 'Isi yang belum diisi: Hadir', exact: true }).click();
  const gate = await gateRpc(page, 'saveAttendance');
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await gate.entered();
  await expect(toast(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Simpan absensi', exact: true })).toBeDisabled();
  gate.release();
  await expectSuccess(page, 'Absensi berhasil tersimpan.');
  await expect(page.locator('.attendance-summary')).toContainText('Hadir: 36');
});

test('failed manual attendance preserves the draft and shows no successful attendance notification', async ({ page }) => {
  await open(page, 'absensi');
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('button', { name: 'Isi yang belum diisi: Hadir', exact: true }).click();
  await page.getByLabel('Status Siswa Contoh 001', { exact: true }).selectOption('S');
  const gate = await gateRpc(page, 'saveAttendance', 'Absensi gagal disimpan. Periksa data.');
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await gate.entered();
  await expect(toast(page)).toHaveCount(0);
  gate.release();
  await expect(failure(page).locator('.toast-message')).toHaveText('Absensi gagal disimpan. Periksa data.');
  await expect(success(page)).toHaveCount(0);
  await expect(page.locator('.attendance-feedback')).toHaveText('Absensi gagal disimpan. Periksa data.');
  await expect(page.getByLabel('Status Siswa Contoh 001', { exact: true })).toHaveValue('S');
  await expect(page.locator('.attendance-summary')).toContainText('Sakit: 1');
});

test('QR validation and attendance save notify separately after backend approval, inside the confirmation dialog', async ({ page }) => {
  await open(page, 'absensi');
  const qr = await page.evaluate(async () => (await window.SIA.api.rpc('prepareStudentCards', { studentIds: ['DEMO-S1'] })).cards[0].qr);
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await page.getByLabel('Kode QR (alternatif pembaca USB atau tempel)').fill(qr);
  const validation = await gateRpc(page, 'validateStudentQr');
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  await validation.entered();
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  expect(validation.calls()).toBe(1);
  await expect(toast(page)).toHaveCount(0);
  validation.release();
  const modal = page.getByRole('dialog', { name: 'Konfirmasi Absensi QR', exact: true });
  await expect(modal).toContainText('Siswa Contoh 001');
  await expectSuccess(page, 'QR berhasil dipindai. Identitas siswa tervalidasi.');
  await expect(modal.locator('.toast--success')).toBeVisible();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await closeToast(page);
  const save = await gateRpc(page, 'saveQrAttendance');
  await modal.getByRole('button', { name: 'Konfirmasi Hadir', exact: true }).click();
  await save.entered();
  await expect(toast(page)).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Konfirmasi Hadir', exact: true })).toBeDisabled();
  save.release();
  await expect(modal).toHaveCount(0);
  await expectSuccess(page, 'Absensi berhasil tersimpan.');
  await expect(page.locator('.attendance-summary')).toContainText('Hadir: 1');
  await closeToast(page);
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  await expect(modal).toContainText('Siswa sudah tercatat');
  await expect(modal.getByRole('button', { name: 'Konfirmasi Hadir', exact: true })).toBeDisabled();
  await expect(success(page)).toHaveCount(0);
});

test('settings success waits for backend and toast remains within a mobile viewport with a check icon', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'settings');
  const gate = await gateRpc(page, 'updateSchoolSettings');
  await page.getByLabel('Nama sekolah', { exact: true }).fill('Sekolah Notifikasi Mobile');
  await page.getByRole('button', { name: 'Simpan pengaturan sekolah', exact: true }).click();
  await gate.entered();
  await expect(toast(page)).toHaveCount(0);
  gate.release();
  await expectSuccess(page, 'Pengaturan sekolah berhasil diperbarui.');
  const bounds = await success(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('notifikasi-mobile.png'), animations: 'disabled' });
});

test('failed QR validation and failed QR attendance never present a successful save', async ({ page }) => {
  await open(page, 'absensi');
  const qr = await page.evaluate(async () => (await window.SIA.api.rpc('prepareStudentCards', { studentIds: ['DEMO-S1'] })).cards[0].qr);
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  const code = page.getByLabel('Kode QR (alternatif pembaca USB atau tempel)');
  await code.fill('SIA-ID:1:invalid');
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  await expect(failure(page)).toHaveCount(1);
  await expect(success(page)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Konfirmasi Absensi QR', exact: true })).toHaveCount(0);
  await closeToast(page);
  await code.fill(qr);
  await page.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Konfirmasi Absensi QR', exact: true });
  await expect(modal).toContainText('Siswa Contoh 001');
  await expectSuccess(page, 'QR berhasil dipindai. Identitas siswa tervalidasi.');
  await closeToast(page);
  const gate = await gateRpc(page, 'saveQrAttendance', 'Absensi gagal disimpan. Periksa data.');
  await modal.getByRole('button', { name: 'Konfirmasi Hadir', exact: true }).click();
  await gate.entered();
  await expect(toast(page)).toHaveCount(0);
  gate.release();
  await expect(modal.locator('.toast--error')).toHaveCount(1);
  await expect(modal.locator('.page-feedback')).toHaveText('Absensi gagal disimpan. Periksa data.');
  await expect(success(page)).toHaveCount(0);
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
});

test('toast component deduplicates visible messages, safely renders text and supports explicit dismissal', async ({ page }) => {
  await open(page, 'kelas');
  const literal = '<img src=x onerror="window.toastInjected=true">';
  await page.evaluate((message) => {
    window.SIA.toast.success(message);
    window.SIA.toast.success(message);
  }, literal);
  await expectSuccess(page, literal);
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.toastInjected)).toBeUndefined();
  const green = await success(page).evaluate((node) => getComputedStyle(node).backgroundColor);
  const greenChannels = green.match(/\d+/g).map(Number);
  expect(greenChannels[1]).toBeGreaterThan(greenChannels[0]);
  expect(Math.min(...greenChannels.slice(0, 3))).toBeGreaterThan(180);
  await page.evaluate(() => window.SIA.toast.error('Gagal menyimpan.'));
  await expect(toast(page)).toHaveCount(1);
  await expect(failure(page).locator('.toast-message')).toHaveText('Gagal menyimpan.');
  const red = await failure(page).evaluate((node) => getComputedStyle(node).backgroundColor);
  const redChannels = red.match(/\d+/g).map(Number);
  expect(redChannels[0]).toBeGreaterThan(redChannels[1]);
  expect(Math.min(...redChannels.slice(0, 3))).toBeGreaterThan(180);
  await closeToast(page);
});
