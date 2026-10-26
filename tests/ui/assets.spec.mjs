import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { root } from '../../scripts/build.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function assetRequest(request) {
  if (request.method() !== 'POST' || !request.url().endsWith('/__demo/rpc')) return null;
  const input = request.postDataJSON();
  return input.method === 'getBrowserAsset' ? input.args : null;
}
async function boot(page) {
  await page.goto('/');
  await expect(page.locator('#stat-students')).toHaveText('288');
}
async function load(page, asset) {
  return page.evaluate(async (asset) => {
    try { await window.SIA.assets.load(asset); return { ok: true }; }
    catch (error) { return { ok: false, code: error.code }; }
  }, asset);
}

test('bootstrap, settings and manual attendance do not request or initialize vendor libraries', async ({ page }) => {
  const calls = [];
  const errors = [];
  page.on('request', (request) => { const args = assetRequest(request); if (args) calls.push(args); });
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await page.locator('nav [data-route=settings]').click();
  await expect(page.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
  await page.locator('nav [data-route=kelas]').click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.locator('nav [data-route=siswa]').click();
  await expect(page.locator('.pagination')).toContainText('288 siswa');
  await page.locator('nav [data-route=absensi]').click();
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await expect(page.getByLabel('Status Siswa Contoh 001', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.SIA.vendors))).toEqual([]);
  await expect(page.locator('script[data-sia-asset]')).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

for (const fault of ['truncated', 'same-size corruption', 'wrong version', 'swapped parts']) {
  test(`rejects ${fault} PDF before execution and allows an explicit successful retry`, async ({ page }) => {
    let corrupt = true;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__demo/rpc', async (route) => {
      const args = assetRequest(route.request());
      if (!args || args.asset !== 'pdf' || !corrupt) return route.continue();
      const response = await route.fetch();
      const result = await response.json();
      if (fault === 'truncated') result.data.parts[0] = result.data.parts[0].slice(0, -4);
      if (fault === 'same-size corruption') {
        const part = result.data.parts[0];
        result.data.parts[0] = (part[0] === 'A' ? 'B' : 'A') + part.slice(1);
      }
      if (fault === 'wrong version') result.data.version = '0'.repeat(64);
      if (fault === 'swapped parts') [result.data.parts[0], result.data.parts[1]] = [result.data.parts[1], result.data.parts[0]];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await boot(page);
    expect(await load(page, 'pdf')).toEqual({ ok: false, code: 'ASSET_LOAD_FAILED' });
    await expect(page.locator('script[data-sia-asset=pdf]')).toHaveCount(0);
    expect(await page.evaluate(() => window.SIA.vendors.pdfMake === undefined)).toBe(true);
    await expect(page.locator('#stat-students')).toHaveText('288');
    await page.locator('nav [data-route=settings]').click();
    await expect(page.getByLabel('Nama sekolah', { exact: true })).toBeVisible();
    corrupt = false;
    expect(await load(page, 'pdf')).toEqual({ ok: true });
    expect(await page.evaluate(() => typeof window.SIA.vendors.pdfMake.createPdf)).toBe('function');
    await expect(page.locator('script[data-sia-asset=pdf]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('concurrent QR requests share one load, four bounded batches and one script', async ({ page }) => {
  const calls = [];
  page.on('request', (request) => { const args = assetRequest(request); if (args?.asset === 'qr') calls.push(args); });
  await boot(page);
  const shared = await page.evaluate(async () => {
    const first = window.SIA.assets.load('qr');
    const second = window.SIA.assets.load('qr');
    const third = window.SIA.assets.load('qr');
    await Promise.all([first, second, third]);
    return first === second && first === third;
  });
  expect(shared).toBe(true);
  expect(calls).toHaveLength(4);
  expect(calls.map((call) => call.start).sort((a, b) => a - b)).toEqual([0, 8, 16, 24]);
  expect(calls.map((call) => call.count).sort((a, b) => a - b)).toEqual([3, 8, 8, 8]);
  await expect(page.locator('script[data-sia-asset=qr]')).toHaveCount(1);
  expect(await load(page, 'qr')).toEqual({ ok: true });
  expect(calls).toHaveLength(4);
});

test('all decoded static assets match the exact JavaScript inserted into the document', async ({ page }) => {
  const catalog = JSON.parse(await readFile(`${root}.preview/browser-assets.json`, 'utf8'));
  await boot(page);
  for (const asset of ['qr', 'pdf', 'excel']) {
    const encoded = await readFile(`${root}dist/${catalog[asset].file}.html`, 'utf8');
    const expected = Buffer.from(encoded.replace(/[\r\n]/g, ''), 'base64');
    expect(expected.length).toBe(catalog[asset].bytes);
    expect(digest(expected)).toBe(catalog[asset].sha256);
    expect(await load(page, asset)).toEqual({ ok: true });
    const script = page.locator(`script[data-sia-asset=${asset}]`);
    await expect(script).toHaveCount(1);
    await expect(script).toHaveAttribute('data-sha256', catalog[asset].sha256);
    const text = await script.textContent();
    const actual = Buffer.from(text);
    expect(actual.length).toBe(expected.length);
    expect(digest(actual)).toBe(catalog[asset].sha256);
    expect(actual.equals(expected)).toBe(true);
  }
  await expect(page.locator('script[data-sia-asset]')).toHaveCount(3);
});

test('failed QR verification never asks for a camera and manual attendance remains usable', async ({ page }) => {
  await page.route('**/__demo/rpc', async (route) => {
    const args = assetRequest(route.request());
    if (!args || args.asset !== 'qr') return route.continue();
    const response = await route.fetch();
    const result = await response.json();
    result.data.parts[0] = result.data.parts[0].slice(0, -4);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/#absensi');
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await page.evaluate(() => {
    window.__assetCameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.__assetCameraRequests++; throw new Error('Camera must not be requested'); };
  });
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai kamera', exact: true }).click();
  await expect(page.locator('#scan-attendance-panel .page-feedback')).toContainText('Pustaka QR belum dapat dimuat');
  expect(await page.evaluate(() => window.__assetCameraRequests)).toBe(0);
  await expect(page.locator('script[data-sia-asset=qr]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Absensi Manual', exact: true }).click();
  await expect(page.getByLabel('Status Siswa Contoh 001', { exact: true })).toBeVisible();
});

test('leaving scan while its asset is downloading cannot start a camera after download finishes', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/__demo/rpc', async (route) => {
    const args = assetRequest(route.request());
    if (args?.asset === 'qr' && args.start === 0) await gate;
    await route.continue();
  });
  await page.goto('/#absensi');
  await expect(page.locator('.attendance-caption')).toContainText('36 siswa aktif');
  await page.evaluate(() => {
    window.__assetCameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.__assetCameraRequests++; throw new Error('Camera must remain stopped'); };
  });
  await page.getByRole('tab', { name: 'Scan QR Code', exact: true }).click();
  const started = page.waitForRequest((request) => assetRequest(request)?.asset === 'qr');
  await page.getByRole('button', { name: 'Mulai kamera', exact: true }).click();
  await started;
  await page.locator('nav [data-route=kelas]').click();
  await expect(page.locator('#page-title')).toHaveText('Data Kelas');
  release();
  expect(await load(page, 'qr')).toEqual({ ok: true });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => window.__assetCameraRequests)).toBe(0);
  await expect(page.locator('tbody tr')).toHaveCount(8);
});
