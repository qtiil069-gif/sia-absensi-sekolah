import { test, expect } from '@playwright/test';

async function open(page, route, demo = '') {
  await page.goto('/' + demo + '#' + route);
  await expect(page.locator('#module-title')).toHaveText({ kelas: 'Data Kelas', siswa: 'Data Siswa', absensi: 'Absensi Siswa' }[route]);
  if (route !== 'absensi') await expect(page.locator('tbody tr').first()).toBeVisible();
  else await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
}
const rowWith = (page, text) => page.locator('tbody tr').filter({ hasText: text });

test('admin class UI creates, searches, edits, filters and soft-deactivates', async ({ page }) => {
  await open(page, 'kelas');
  await page.getByRole('button', { name: 'Tambah kelas', exact: true }).click();
  await page.getByLabel('Nama kelas', { exact: true }).fill('11 Operasional');
  await page.getByLabel('Tingkat kelas', { exact: true }).fill('11');
  await page.getByLabel('Wali kelas', { exact: true }).selectOption('DEMO-GURU');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.classes-feedback')).toHaveText('Kelas berhasil disimpan.');
  await page.getByLabel('Cari kelas', { exact: true }).fill('Operasional');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await rowWith(page, '11 Operasional').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Nama kelas', { exact: true }).fill('11 Operasional Revisi');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(rowWith(page, '11 Operasional Revisi')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await rowWith(page, '11 Operasional Revisi').getByRole('button', { name: 'Nonaktifkan' }).click();
  await expect(page.getByText('Belum ada data yang dapat ditampilkan.', { exact: true })).toBeVisible();
  await page.getByLabel('Status kelas').selectOption('inactive');
  await expect(rowWith(page, '11 Operasional Revisi')).toContainText('Nonaktif');
});

test('admin student UI validates duplicate NIS, edits class and retains inactive student', async ({ page }) => {
  await open(page, 'siswa');
  await page.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await page.getByLabel('Nama siswa', { exact: true }).fill('Siswa Operasional');
  await page.getByLabel('NIS', { exact: true }).fill('000999');
  await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.students-feedback')).toHaveText('Data siswa berhasil disimpan.');
  await page.getByLabel('Cari siswa', { exact: true }).fill('000999');
  await expect(rowWith(page, 'Siswa Operasional')).toHaveCount(1);
  await rowWith(page, 'Siswa Operasional').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K2');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(rowWith(page, 'Siswa Operasional')).toContainText('7 B');
  page.once('dialog', (dialog) => dialog.accept());
  await rowWith(page, 'Siswa Operasional').getByRole('button', { name: 'Nonaktifkan' }).click();
  await expect(page.locator('.students-feedback')).toHaveText('Siswa dinonaktifkan tanpa menghapus riwayat.');
  await page.getByLabel('Status siswa').selectOption('inactive');
  await expect(rowWith(page, 'Siswa Operasional')).toContainText('Nonaktif');
  await page.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await page.getByLabel('Nama siswa', { exact: true }).fill('Siswa Duplikat');
  await page.getByLabel('NIS', { exact: true }).fill('000999');
  await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.record-editor .page-feedback')).toContainText('NIS sudah digunakan');
});

test('student pagination, NIS search, class filter and text-only rendering work together', async ({ page }) => {
  await open(page, 'siswa');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await expect(page.locator('.pagination')).toContainText('Halaman 1 dari 12');
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('Halaman 2 dari 12');
  await page.getByLabel('Filter kelas siswa').selectOption('DEMO-K1');
  await expect(page.locator('.pagination')).toContainText('36 siswa');
  await page.getByLabel('Cari siswa', { exact: true }).fill('CONTOH-001');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await page.getByLabel('Nama siswa', { exact: true }).fill('<img src=x onerror="window.injected=true">');
  await page.getByLabel('NIS', { exact: true }).fill('XSS-001');
  await page.getByLabel('Kelas siswa', { exact: true }).selectOption('DEMO-K1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.record-editor')).toHaveCount(0);
  await page.getByLabel('Cari siswa', { exact: true }).fill('XSS-001');
  await expect(page.locator('tbody')).toContainText('<img src=x onerror="window.injected=true">');
  await expect(page.locator('tbody img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('attendance form saves H/S/I/A, reloads and edits existing session without extra rows', async ({ page }) => {
  await open(page, 'absensi');
  await page.getByLabel('Tanggal absensi').fill('2026-10-26');
  await expect(page.getByRole('button', { name: 'Simpan absensi', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(page.locator('.attendance-feedback')).toContainText('Lengkapi status');
  await page.getByRole('button', { name: 'Isi yang belum diisi: Hadir' }).click();
  await page.getByLabel('Status Siswa Contoh 001', { exact: true }).selectOption('S');
  await page.getByLabel('Status Siswa Contoh 002', { exact: true }).selectOption('I');
  await page.getByLabel('Status Siswa Contoh 003', { exact: true }).selectOption('A');
  await page.getByLabel('Catatan Siswa Contoh 001', { exact: true }).fill('Catatan uji');
  await expect(page.locator('.attendance-summary')).toContainText('Hadir: 33');
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(page.locator('.attendance-feedback')).toContainText('Absensi berhasil disimpan');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.getByLabel('Status Siswa Contoh 001', { exact: true })).toHaveValue('S');
  await expect(page.getByLabel('Catatan Siswa Contoh 001', { exact: true })).toHaveValue('Catatan uji');
  await page.getByLabel('Status Siswa Contoh 001', { exact: true }).selectOption('H');
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(page.locator('.attendance-feedback')).toContainText('Absensi berhasil disimpan');
  await expect(page.locator('.attendance-summary')).toContainText('Hadir: 34');
  await expect(page.locator('tbody tr')).toHaveCount(36);
});

test('teacher UI is read-only for master data and backend rejects a forged different class', async ({ page }) => {
  await open(page, 'kelas', '?demo=teacher');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Tambah kelas', exact: true })).toHaveCount(0);
  await page.locator('nav').getByRole('button', { name: 'Data Siswa', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('36 siswa');
  await expect(page.getByRole('button', { name: 'Tambah siswa', exact: true })).toHaveCount(0);
  await page.locator('nav').getByRole('button', { name: 'Absensi Siswa', exact: true }).click();
  await expect(page.getByLabel('Kelas absensi').locator('option')).toHaveCount(1);
  const code = await page.evaluate(async () => {
    try { await window.SIA.api.rpc('getAttendance', { classId: 'DEMO-K2', date: '2026-10-23' }); }
    catch (error) { return error.code; }
  });
  expect(code).toBe('FORBIDDEN');
  await page.getByLabel('Jenis sesi').selectOption('MAPEL');
  await page.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(page.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await page.getByRole('button', { name: 'Isi yang belum diisi: Hadir' }).click();
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(page.locator('.attendance-feedback')).toContainText('Absensi berhasil disimpan');
});

test('Sheets write error preserves the editor and never shows a success message', async ({ page }) => {
  await open(page, 'kelas');
  await page.route('**/__demo/rpc', async (route) => {
    if (route.request().postDataJSON().method === 'createClass') {
      return route.fulfill({ json: { ok: false, error: { code: 'WRITE_FAILED', message: 'Penyimpanan gagal. Muat ulang dan periksa data.' } } });
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Tambah kelas', exact: true }).click();
  await page.getByLabel('Nama kelas', { exact: true }).fill('Kelas Gagal Simpan');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('.record-editor .page-feedback')).toContainText('Penyimpanan gagal');
  await expect(page.getByLabel('Nama kelas', { exact: true })).toHaveValue('Kelas Gagal Simpan');
  await expect(page.getByText('Kelas berhasil disimpan.', { exact: true })).toHaveCount(0);
});

test('attendance conflict retains draft, blocks repeated save and requires explicit reload', async ({ page }) => {
  await open(page, 'absensi');
  await page.route('**/__demo/rpc', async (route) => {
    if (route.request().postDataJSON().method === 'saveAttendance') {
      return route.fulfill({ json: { ok: false, error: { code: 'CONFLICT', message: 'Data telah berubah. Muat ulang dan periksa perubahan.' } } });
    }
    await route.continue();
  });
  await page.getByLabel('Status Siswa Contoh 001', { exact: true }).selectOption('A');
  await page.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(page.locator('.attendance-feedback')).toContainText('Data telah berubah');
  await expect(page.getByLabel('Status Siswa Contoh 001', { exact: true })).toHaveValue('A');
  await expect(page.getByRole('button', { name: 'Simpan absensi', exact: true })).toBeDisabled();
});

test('unsaved attendance can cancel navigation then leave after confirmation', async ({ page }) => {
  await open(page, 'absensi');
  await page.getByLabel('Status Siswa Contoh 001', { exact: true }).selectOption('A');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('nav').getByRole('button', { name: 'Data Kelas', exact: true }).click();
  await expect(page).toHaveURL(/#absensi$/);
  await expect(page.locator('#module-title')).toHaveText('Absensi Siswa');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('nav').getByRole('button', { name: 'Data Kelas', exact: true }).click();
  await expect(page.locator('#module-title')).toHaveText('Data Kelas');
});

test('mobile navigation reaches operational forms and planned pages without page overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'kelas');
  await page.getByRole('button', { name: 'Tambah kelas', exact: true }).click();
  await expect(page.getByLabel('Nama kelas', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('kelas-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Buka menu', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'Absensi Siswa', exact: true }).click();
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('absensi-mobile.png'), fullPage: true });
  for (const label of ['Nilai & Leger', 'Jurnal Mengajar', 'Akun Guru', 'Laporan Kehadiran']) {
    await page.getByRole('button', { name: 'Buka menu', exact: true }).click();
    await page.locator('nav').getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#module-content')).toHaveText('Fitur dalam pengembangan');
  }
});
