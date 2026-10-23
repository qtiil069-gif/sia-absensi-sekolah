import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { root } from '../../scripts/build.mjs';

test('desktop dashboard renders demo charts, labels and reference layout', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.locator('#stat-students')).toHaveText('288');
  await expect(page.locator('#stat-classes')).toHaveText('8');
  await expect(page.locator('#mode-badge')).toHaveText('MODE DEMO');
  await expect(page.locator('#weekly-chart .bar-column')).toHaveCount(7);
  await expect(page.locator('#composition-legend li')).toHaveCount(4);
  await expect(page.locator('#donut-rate')).toHaveText('93%');
  await expect(page.locator('#error-panel')).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
});

test('class and date filters update figures and distinguish missing records', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#stat-students')).toHaveText('288');
  await page.selectOption('#class-filter', 'DEMO-K1');
  await expect(page.locator('#stat-students')).toHaveText('36');
  await expect(page.locator('#stat-classes')).toHaveText('1');
  await expect(page.locator('#stat-sessions')).toHaveText('1 sesi absensi');
  await page.locator('#date-filter').fill('2026-10-24');
  await page.locator('#date-filter').dispatchEvent('change');
  await expect(page.locator('#stat-attendance')).toHaveText('—');
  await expect(page.locator('#composition-note')).toContainText('Tidak dihitung sebagai alfa');
});

for (const width of [360, 390, 768, 1024]) {
  test(`responsive layout at ${width}px has no horizontal page overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('#stat-students')).toHaveText('288');
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
  });
}

test('mobile navigation opens, changes route and closes with accurate aria state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#stat-students')).toHaveText('288');
  await page.getByRole('button', { name: 'Buka menu', exact: true }).click();
  await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('nav').getByRole('link', { name: 'Data Kelas' }).click();
  await expect(page.locator('#module-title')).toHaveText('Data Kelas');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#sidebar-backdrop')).toBeHidden();
});

test('planned value module discloses status and has no save controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Input Nilai', exact: true }).click();
  await expect(page.locator('#module-title')).toHaveText('Nilai & Leger');
  await expect(page.locator('#module-description')).toContainText('Belum ada nilai yang disimpan');
  await expect(page.locator('#module-content')).toContainText('Fitur dalam pengembangan');
  await expect(page.getByRole('button', { name: 'Simpan' })).toHaveCount(0);
});

test('menu search navigates and missing menu gives honest empty state', async ({ page }) => {
  await page.goto('/');
  await page.locator('#search').fill('siswa');
  await page.locator('#search-results').getByRole('link', { name: 'Data Siswa' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  await page.locator('#search').fill('tidakada');
  await expect(page.locator('#search-results')).toHaveText('Menu tidak ditemukan.');
});

test('Apps Script package with absent Google runtime fails visibly without demo fallback', async ({ page }) => {
  const [index, styles, scripts] = await Promise.all([
    readFile(`${root}dist/Index.html`, 'utf8'), readFile(`${root}dist/Styles.html`, 'utf8'), readFile(`${root}dist/Scripts.html`, 'utf8')
  ]);
  await page.setContent(index.replace("<?!= include_('Styles'); ?>", styles).replace("<?!= include_('Scripts'); ?>", scripts));
  await expect(page.locator('#error-panel')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('Buka aplikasi melalui Apps Script');
  await expect(page.locator('#dashboard-panel')).toBeHidden();
  await expect(page.locator('#notice')).toContainText('Tidak ada data dummy');
});

test('Google RPC path renders Sheets data and text remains inert against stored HTML', async ({ page }) => {
  const [index, styles, scripts] = await Promise.all([
    readFile(`${root}dist/Index.html`, 'utf8'), readFile(`${root}dist/Styles.html`, 'utf8'), readFile(`${root}dist/Scripts.html`, 'utf8')
  ]);
  const mock = `<script>
    const runner = {
      withSuccessHandler(fn) { this.success = fn; return this; },
      withFailureHandler(fn) { this.failure = fn; return this; },
      getBootstrap() { this.success({ ok: true, data: {
        user: { name: '<img src=x onerror="window.injected=true">', role: 'GURU' },
        school: { name: 'Sekolah Uji', semester: 'Semester Uji' }, today: '2026-10-23', classes: []
      } }); },
      listClasses() { this.success({ ok: true, data: [] }); },
      getDashboard() { this.success({ ok: true, data: { date: '2026-10-23', scope: 'Kelas penugasan Anda',
        stats: { students: 0, classes: 0, attendanceRate: null, sessions: 0, journals: 0 },
        composition: { counts: {H:0,S:0,I:0,A:0}, total:0, rate:null }, weekly: []
      } }); }
    }; window.google = { script: { run: runner } };
  </script>`;
  await page.setContent(index.replace("<?!= include_('Styles'); ?>", styles).replace("<?!= include_('Scripts'); ?>", mock + scripts));
  await expect(page.locator('#mode-badge')).toHaveText('GOOGLE SHEETS');
  await expect(page.locator('#stat-students')).toHaveText('0');
  await expect(page.locator('#profile-name')).toHaveText('<img src=x onerror="window.injected=true">');
  await expect(page.locator('#profile-name img')).toHaveCount(0);
  await expect(page.locator('#teacher-nav')).toBeHidden();
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
