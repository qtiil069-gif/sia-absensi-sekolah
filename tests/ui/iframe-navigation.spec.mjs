import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { root } from '../../scripts/build.mjs';

const shellUrl = 'https://sia-shell.test/exec';
const panelUrl = 'https://script.googleusercontent.com/userCodeAppPanel?createOAuthDialog=true';

async function htmlService(page, request, role = 'admin') {
  const [index, styles, scripts] = await Promise.all(['Index.html', 'Styles.html', 'Scripts.html']
    .map((name) => readFile(`${root}dist/${name}`, 'utf8')));
  const session = randomUUID();
  // google.script.run bridges to the same .gs backend with in-memory Sheets.
  // Nothing in this fixture is included in dist or sent to Google.
  await page.exposeBinding('siaIframeRpc', async (_, method, args) => {
    const response = await request.post('http://127.0.0.1:4174/__demo/rpc', {
      data: { session, role, method, args }
    });
    return response.json();
  });
  const shim = `<script>
    window.__navigationProbe = { documentId: Math.random(), hashChanges: 0, historyCalls: 0 };
    addEventListener('hashchange', () => window.__navigationProbe.hashChanges++);
    for (const method of ['pushState', 'replaceState']) {
      history[method] = () => { window.__navigationProbe.historyCalls++; throw new Error('Frame history must not be used'); };
    }
    const methods = ['getBootstrap','getDashboard','listClasses','listStudents','getRosterOptions','queryStudents',
      'createClass','updateClass','deactivateClass','createStudent','updateStudent','deactivateStudent',
      'getAttendanceOptions','getAttendance','saveAttendance'];
    function runner(success, failure) {
      const value = { withSuccessHandler(fn) { return runner(fn, failure); }, withFailureHandler(fn) { return runner(success, fn); } };
      for (const method of methods) value[method] = (args) => window.siaIframeRpc(method, args).then(success, failure);
      return value;
    }
    window.google = { script: { run: runner() } };
  </script>`;
  // Retain a hostile _top default, even though the fixed source removes it.
  // Native fragment links would target the parent script wrapper under this base.
  const html = index.replace('<head>', '<head><base target="_top">')
    .replace("<?!= include_('Styles'); ?>", styles)
    .replace("<?!= include_('Scripts'); ?>", shim + scripts);
  await page.route(panelUrl, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route(shellUrl, (route) => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html><body style="margin:0"><iframe id="apps-script-frame"
      style="border:0;width:100vw;height:100vh" src="${panelUrl}"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe></body></html>` }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(shellUrl);
  const ui = page.frameLocator('#apps-script-frame');
  await expect(ui.locator('#stat-students')).toHaveText(role === 'guru' ? '36' : '288');
  const frame = page.frames().find((item) => item.url() === panelUrl);
  const documentId = await frame.evaluate(() => window.__navigationProbe.documentId);
  const navigations = [];
  page.on('framenavigated', (item) => navigations.push(item.url()));
  const assertStayed = async () => {
    expect(page.url()).toBe(shellUrl);
    expect(frame.url()).toBe(panelUrl);
    expect(page.context().pages()).toHaveLength(1);
    expect(navigations).toEqual([]);
    expect(errors).toEqual([]);
    expect(await frame.evaluate(() => window.__navigationProbe)).toEqual({ documentId, hashChanges: 0, historyCalls: 0 });
  };
  return { ui, frame, assertStayed };
}

test('all sidebar routes render within the same cross-origin HtmlService iframe', async ({ page, request }) => {
  const { ui, assertStayed } = await htmlService(page, request);
  for (const [route, title] of [['kelas', 'Data Kelas'], ['siswa', 'Data Siswa'], ['absensi', 'Absensi Siswa'],
    ['nilai', 'Nilai & Leger'], ['jurnal', 'Jurnal Mengajar'], ['guru', 'Akun Guru'], ['laporan', 'Laporan Kehadiran'], ['dashboard', 'Dashboard']]) {
    await ui.locator(`nav [data-route="${route}"]`).click();
    await expect(ui.locator('#page-title')).toHaveText(title);
    await expect(ui.locator(`nav [data-route="${route}"]`)).toHaveAttribute('aria-current', 'page');
    if (route === 'kelas') await expect(ui.locator('tbody tr')).toHaveCount(8);
    if (route === 'siswa') await expect(ui.locator('.pagination')).toContainText('288 siswa');
    if (route === 'absensi') await expect(ui.locator('.attendance-caption')).toContainText('36 siswa aktif');
    if (['nilai', 'jurnal', 'guru', 'laporan'].includes(route)) await expect(ui.locator('#module-content')).toHaveText('Fitur dalam pengembangan');
    if (route === 'dashboard') await expect(ui.locator('#stat-students')).toHaveText('288');
    await assertStayed();
  }
});

test('CTAs, search, brand, nested SVG, keyboard and modified clicks cannot navigate out of the frame', async ({ page, request }) => {
  const { ui, assertStayed } = await htmlService(page, request);
  await ui.getByRole('button', { name: 'Mulai Absensi Kelas' }).click();
  await expect(ui.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await ui.getByRole('button', { name: 'Kembali ke dashboard' }).click();
  await expect(ui.locator('#stat-students')).toHaveText('288');
  await ui.getByRole('button', { name: 'Input Nilai', exact: true }).click();
  await expect(ui.locator('#module-title')).toHaveText('Nilai & Leger');
  await ui.locator('.brand').click();
  await expect(ui.locator('#dashboard-panel')).toBeVisible();
  await ui.locator('nav [data-route="kelas"] svg').click();
  await expect(ui.locator('#module-title')).toHaveText('Data Kelas');
  await ui.locator('nav [data-route="siswa"]').press('Enter');
  await expect(ui.locator('.pagination')).toContainText('288 siswa');
  await ui.locator('nav [data-route="dashboard"]').press('Space');
  await expect(ui.locator('#dashboard-panel')).toBeVisible();
  await ui.locator('nav [data-route="kelas"]').click({ modifiers: ['Control'] });
  await expect(ui.locator('#module-title')).toHaveText('Data Kelas');
  await ui.locator('nav [data-route="siswa"]').click({ button: 'middle' });
  await ui.locator('#search').fill('siswa');
  await ui.locator('#search-results').getByRole('button', { name: 'Data Siswa', exact: true }).click();
  await expect(ui.locator('.pagination')).toContainText('288 siswa');
  await ui.getByRole('button', { name: 'Buka jurnal' }).click();
  await expect(ui.locator('#module-title')).toHaveText('Jurnal Mengajar');
  await ui.locator('#skip-content').focus();
  await ui.locator('#skip-content').press('Enter');
  await expect(ui.locator('#main')).toBeFocused();
  await expect(ui.locator('[data-route][href], [data-route][target]')).toHaveCount(0);
  await assertStayed();
});

test('class/student writes and attendance save still work through RPC inside the iframe', async ({ page, request }) => {
  const { ui, assertStayed } = await htmlService(page, request);
  await ui.locator('nav [data-route="kelas"]').click();
  await expect(ui.locator('tbody tr')).toHaveCount(8);
  await ui.getByRole('button', { name: 'Tambah kelas', exact: true }).click();
  await ui.getByLabel('Nama kelas', { exact: true }).fill('8 Iframe');
  await ui.getByLabel('Tingkat kelas', { exact: true }).fill('8');
  await ui.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(ui.locator('.page-feedback')).toHaveText('Kelas berhasil disimpan.');
  await ui.locator('nav [data-route="siswa"]').click();
  await expect(ui.locator('.pagination')).toContainText('288 siswa');
  await ui.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await ui.getByLabel('Nama siswa', { exact: true }).fill('Siswa Uji Iframe');
  await ui.getByLabel('NIS', { exact: true }).fill('IFRAME-01');
  await ui.getByLabel('Kelas siswa', { exact: true }).selectOption({ label: '8 Iframe' });
  await ui.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(ui.locator('.page-feedback')).toHaveText('Data siswa berhasil disimpan.');
  await ui.locator('nav [data-route="absensi"]').click();
  await expect(ui.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await ui.getByLabel('Kelas absensi').selectOption({ label: '8 Iframe' });
  await ui.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(ui.locator('.attendance-caption')).toContainText('1 siswa aktif');
  await ui.getByLabel('Status Siswa Uji Iframe', { exact: true }).selectOption('H');
  await ui.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(ui.locator('.page-feedback')).toHaveText('Absensi berhasil disimpan.');
  await expect(ui.locator('.attendance-summary')).toContainText('Hadir: 1');
  await assertStayed();
});

test('mobile iframe keeps attendance draft when navigation is cancelled and restricts teacher scope', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { ui, frame, assertStayed } = await htmlService(page, request, 'guru');
  await ui.getByRole('button', { name: 'Buka menu', exact: true }).click();
  await ui.locator('nav [data-route="absensi"]').click();
  await expect(ui.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await expect(ui.getByLabel('Kelas absensi').locator('option')).toHaveCount(1);
  await ui.getByLabel('Status Siswa Contoh 001', { exact: true }).selectOption('A');
  await ui.getByRole('button', { name: 'Buka menu', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await ui.locator('nav [data-route="kelas"]').click();
  await expect(ui.locator('#page-title')).toHaveText('Absensi Siswa');
  await expect(ui.getByLabel('Status Siswa Contoh 001', { exact: true })).toHaveValue('A');
  await assertStayed();
  page.once('dialog', (dialog) => dialog.accept());
  await ui.locator('nav [data-route="kelas"]').click();
  await expect(ui.locator('tbody tr')).toHaveCount(1);
  await expect(ui.getByRole('button', { name: 'Tambah kelas', exact: true })).toHaveCount(0);
  await expect(ui.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  expect(await frame.evaluate(async () => {
    try { await window.SIA.api.rpc('getAttendance', { classId: 'DEMO-K2', date: '2026-10-23' }); }
    catch (error) { return error.code; }
  })).toBe('FORBIDDEN');
  await assertStayed();
});
