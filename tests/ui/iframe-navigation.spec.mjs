import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { root } from '../../scripts/build.mjs';
import playwrightConfig from '../../playwright.config.mjs';

// Windows Chromium enables native middle-click autoscroll by default. Exercise
// that behavior on every platform instead of allowing this regression to hide
// on Linux, where the feature is normally disabled.
test.use({ launchOptions: { ...playwrightConfig.use.launchOptions,
  args: [...(playwrightConfig.use.launchOptions.args || []), '--enable-blink-features=MiddleClickAutoscroll'] } });

const shellUrl = 'https://sia-shell.test/exec';
const panelUrl = 'https://script.googleusercontent.com/userCodeAppPanel?createOAuthDialog=true';

async function htmlService(page, request, role = 'admin', { beforeRpc = () => {}, documentWriteTransport = false } = {}) {
  const [index, styles, scripts] = await Promise.all(['Index.html', 'Styles.html', 'Scripts.html']
    .map((name) => readFile(`${root}dist/${name}`, 'utf8')));
  const session = randomUUID();
  const rpcCalls = [];
  // google.script.run bridges to the same .gs backend with in-memory Sheets.
  // Nothing in this fixture is included in dist or sent to Google.
  await page.exposeBinding('siaIframeRpc', async (_, method, args) => {
    await beforeRpc(method, args);
    const response = await request.post('http://127.0.0.1:4174/__demo/rpc', {
      data: { session, role, method, args }
    });
    const result = await response.json();
    rpcCalls.push({ method, args, result });
    return result;
  });
  const shim = `<script>
    window.__navigationProbe = { documentId: Math.random(), hashChanges: 0, historyCalls: 0 };
    addEventListener('hashchange', () => window.__navigationProbe.hashChanges++);
    for (const method of ['pushState', 'replaceState']) {
      history[method] = () => { window.__navigationProbe.historyCalls++; throw new Error('Frame history must not be used'); };
    }
    const methods = ['getBootstrap','getDashboard','listClasses','listStudents','getRosterOptions','queryStudents',
      'createClass','updateClass','deactivateClass','createStudent','updateStudent','deactivateStudent',
      'getAttendanceOptions','getAttendance','saveAttendance','getSchoolSettings', 'updateSchoolSettings', 'getStage3Status', 'migrateStage3', 'prepareStudentCards', 'exportStudentData', 'validateStudentQr', 'saveQrAttendance'];
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
    .replace("<?!= include_('Styles'); ?>", () => styles)
    .replace("<?!= include_('Scripts'); ?>", () => shim + scripts);
  // Model a host HTML processing-instruction pass before document.write(). This
  // deliberately differs from serving the untouched HTML directly: XML text in
  // a JS literal must survive the transport, not become host markup.
  const panel = documentWriteTransport
    ? `<script>document.open();document.write(${JSON.stringify(html.replace(/<\?[\s\S]*?\?>/g, '')).replace(/</g, '\\u003c')});document.close();</script>`
    : html;
  await page.route(panelUrl, (route) => route.fulfill({ contentType: 'text/html', body: panel }));
  await page.route(shellUrl, (route) => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html><body style="margin:0"><iframe id="apps-script-frame"
      style="border:0;width:100vw;height:100vh" src="${panelUrl}"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe></body></html>` }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(shellUrl);
  expect(errors).toEqual([]);
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
  return { ui, frame, assertStayed, rpcCalls };
}

for (const role of ['admin', 'guru']) {
  test(`document.write transport preserves bundled XML and boots the ${role} iframe`, async ({ page, request }) => {
    const { ui, assertStayed, rpcCalls } = await htmlService(page, request, role, { documentWriteTransport: true });
    await expect(ui.locator('#mode-badge')).toHaveText('GOOGLE SHEETS');
    await expect(ui.locator('#notice')).not.toContainText('Menyiapkan ruang sekolah Anda');
    await expect(ui.locator('#profile-name')).not.toHaveText('Selamat datang!');
    expect(rpcCalls.some((call) => call.method === 'getBootstrap' && call.result.ok)).toBe(true);
    expect(rpcCalls.some((call) => call.method === 'getDashboard' && call.result.ok)).toBe(true);
    if (role === 'admin') {
      await expect(ui.locator('#settings-nav')).toBeVisible();
      await ui.locator('#settings-nav').click();
      await expect(ui.locator('#module-title')).toHaveText('Pengaturan Sekolah');
      await expect(ui.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
    } else await expect(ui.locator('#settings-nav')).toBeHidden();
    await ui.locator('nav [data-route="siswa"]').click();
    await expect(ui.locator('.pagination')).toContainText(role === 'admin' ? '288 siswa' : '36 siswa');
    await assertStayed();
  });
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
  const { ui, assertStayed, rpcCalls } = await htmlService(page, request);
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
  await assertStayed();
  // Middle click can start native autoscroll. Otherwise the next left click
  // only dismisses that browser mode and never activates the search result.
  await page.keyboard.press('Escape');
  await expect(ui.locator('#page-title')).toHaveText('Data Kelas');
  const previousQueries = rpcCalls.filter((call) => call.method === 'queryStudents').length;
  await ui.locator('#search').fill('siswa');
  await ui.locator('#search-results').getByRole('button', { name: 'Data Siswa', exact: true }).click();
  await expect(ui.locator('#page-title')).toHaveText('Data Siswa');
  await expect(ui.locator('#main')).toHaveAttribute('aria-busy', 'false');
  await expect(ui.locator('.pagination')).toContainText('288 siswa');
  await expect(ui.locator('#module-content tbody tr')).toHaveCount(25);
  const queries = rpcCalls.filter((call) => call.method === 'queryStudents');
  expect(queries).toHaveLength(previousQueries + 1);
  expect(queries.at(-1)).toMatchObject({ args: { q: '', page: 1, pageSize: 25 },
    result: { ok: true, data: { total: 288, page: 1, pageSize: 25, pages: 12 } } });
  await ui.getByRole('button', { name: 'Buka jurnal' }).click();
  await expect(ui.locator('#module-title')).toHaveText('Jurnal Mengajar');
  await ui.locator('#skip-content').focus();
  await ui.locator('#skip-content').press('Enter');
  await expect(ui.locator('#main')).toBeFocused();
  await expect(ui.locator('[data-route][href], [data-route][target]')).toHaveCount(0);
  await assertStayed();
});

test('menu search renders student pagination after the asynchronous RPC completes', async ({ page, request }) => {
  let release;
  let started;
  const held = new Promise((resolve) => { release = resolve; });
  const querying = new Promise((resolve) => { started = resolve; });
  const { ui, assertStayed, rpcCalls } = await htmlService(page, request, 'admin', {
    beforeRpc: async (method) => {
      if (method === 'queryStudents') { started(); await held; }
    }
  });
  try {
    await ui.locator('#search').fill('siswa');
    await ui.locator('#search-results').getByRole('button', { name: 'Data Siswa', exact: true }).click();
    await querying;
    await expect(ui.locator('#page-title')).toHaveText('Data Siswa');
    await expect(ui.locator('#main')).toHaveAttribute('aria-busy', 'true');
    await expect(ui.locator('.pagination')).toHaveCount(1);
    await expect(ui.locator('.pagination')).toBeEmpty();
    release();
    await expect(ui.locator('#main')).toHaveAttribute('aria-busy', 'false');
    await expect(ui.locator('.pagination')).toContainText('288 siswa');
    await expect(ui.locator('.pagination')).toContainText('Halaman 1 dari 12');
    await expect(ui.locator('#module-content tbody tr')).toHaveCount(25);
    await expect(ui.getByLabel('Cari siswa', { exact: true })).toHaveValue('');
    expect(rpcCalls.find((call) => call.method === 'queryStudents')).toMatchObject({
      args: { q: '', classId: '', status: 'active', page: 1, pageSize: 25 },
      result: { ok: true, data: { total: 288 } }
    });
    await assertStayed();
  } finally { release(); }
});

test('class/student writes and attendance save still work through RPC inside the iframe', async ({ page, request }) => {
  const { ui, assertStayed } = await htmlService(page, request);
  await ui.locator('nav [data-route="kelas"]').click();
  await expect(ui.locator('tbody tr')).toHaveCount(8);
  await ui.getByRole('button', { name: 'Tambah kelas', exact: true }).click();
  await ui.getByLabel('Nama kelas', { exact: true }).fill('8 Iframe');
  await ui.getByLabel('Tingkat kelas', { exact: true }).fill('8');
  await ui.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(ui.locator('.classes-feedback')).toHaveText('Kelas berhasil disimpan.');
  await ui.locator('nav [data-route="siswa"]').click();
  await expect(ui.locator('.pagination')).toContainText('288 siswa');
  await ui.getByRole('button', { name: 'Tambah siswa', exact: true }).click();
  await ui.getByLabel('Nama siswa', { exact: true }).fill('Siswa Uji Iframe');
  await ui.getByLabel('NIS', { exact: true }).fill('IFRAME-01');
  await ui.getByLabel('Kelas siswa', { exact: true }).selectOption({ label: '8 Iframe' });
  await ui.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(ui.locator('.students-feedback')).toHaveText('Data siswa berhasil disimpan.');
  await ui.locator('nav [data-route="absensi"]').click();
  await expect(ui.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await ui.getByLabel('Kelas absensi').selectOption({ label: '8 Iframe' });
  await ui.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(ui.locator('.attendance-caption')).toContainText('1 siswa aktif');
  await ui.getByLabel('Status Siswa Uji Iframe', { exact: true }).selectOption('H');
  await ui.getByRole('button', { name: 'Simpan absensi', exact: true }).click();
  await expect(ui.locator('.attendance-feedback')).toHaveText('Absensi berhasil disimpan.');
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

test('school settings, integrated card popup and QR confirmation stay within the HtmlService iframe', async ({ page, request }) => {
  const { ui, frame, assertStayed } = await htmlService(page, request);
  await ui.locator('nav [data-route=settings]').click();
  await expect(ui.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
  await ui.getByLabel('Nama sekolah', { exact: true }).fill('Sekolah Iframe Tahap 3');
  await ui.getByRole('button', { name: 'Simpan pengaturan sekolah', exact: true }).click();
  await expect(ui.locator('.school-feedback')).toContainText('Pengaturan sekolah disimpan');
  await ui.locator('nav [data-route=siswa]').click();
  await ui.getByLabel('Cari siswa', { exact: true }).fill('CONTOH-001');
  await expect(ui.locator('tbody tr')).toHaveCount(1);
  await ui.getByRole('button', { name: 'Cetak kartu ID', exact: true }).click();
  const card = ui.getByRole('dialog', { name: 'Cetak Kartu ID', exact: true });
  await expect(card.locator('.id-card')).toHaveCount(1);
  await expect(card.locator('.id-card')).toContainText('Sekolah Iframe Tahap 3');
  await card.getByRole('button', { name: 'Tutup', exact: true }).click();
  const qr = await frame.evaluate(async () => (await window.SIA.api.rpc('prepareStudentCards', { studentIds: ['DEMO-S1'] })).cards[0].qr);
  await ui.locator('nav [data-route=absensi]').click();
  await expect(ui.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await ui.getByLabel('Tanggal absensi').fill('2026-10-26');
  await ui.getByRole('button', { name: 'Tampilkan siswa', exact: true }).click();
  await expect(ui.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await ui.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await ui.getByLabel('Kode QR (alternatif pembaca USB atau tempel)').fill(qr);
  await ui.getByRole('button', { name: 'Validasi kode', exact: true }).click();
  const confirm = ui.getByRole('dialog', { name: 'Konfirmasi Absensi QR', exact: true });
  await expect(confirm).toContainText('Siswa Contoh 001');
  await expect(ui.locator('.attendance-summary')).toContainText('Belum diisi: 36');
  await confirm.getByRole('button', { name: 'Konfirmasi Hadir', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(ui.locator('.attendance-summary')).toContainText('Hadir: 1');
  await expect(ui.locator('nav .nav-item')).toHaveCount(9);
  await assertStayed();
});
