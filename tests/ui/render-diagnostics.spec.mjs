import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDemo } from '../../dev/seed.mjs';

const url = 'https://sia-render-diagnostic.test/dev?diagnostic=render';
async function serve(page, { corruptBrowserCore = false, changeRetrieved = false } = {}) {
  const api = createDemo('admin');
  const calls = [];
  if (changeRetrieved) {
    const original = api.HtmlService.createHtmlOutputFromFile;
    api.HtmlService.createHtmlOutputFromFile = (name) => name === 'Scripts'
      ? { getContent: () => original(name).getContent().replace('Pustaka aplikasi tidak dikenal.', 'Pustaka aplikasi belum dikenal.') }
      : original(name);
  }
  const bootstrap = api.getBootstrap;
  api.getBootstrap = () => {
    const result = bootstrap();
    result.data.user.name = 'DIAG_PRIVATE_PERSON_9f1';
    result.data.school.name = 'DIAG_PRIVATE_SCHOOL_9f1';
    return result;
  };
  let html = api.doGet({ parameter: { diagnostic: 'render' } }).getContent();
  if (corruptBrowserCore) {
    html = html.replace(/(<script id="sia-render-core"[^>]*>)([\s\S]*?)(<\/script>)/,
      (_, open, body, close) => open + body.replace('script.textContent = source;', 'script.textContent = source + `') + close);
  }
  await page.exposeBinding('siaRenderRpc', (_, method, args) => {
    if (!['getBootstrap', 'getDashboard', 'listClasses'].includes(method)) throw new Error('Diagnostic fixture only permits read RPC');
    calls.push(method);
    return api[method](args);
  });
  const shim = `<script>
    function runner(ok, fail) {
      var value = { withSuccessHandler: function(fn) { return runner(fn, fail); }, withFailureHandler: function(fn) { return runner(ok, fn); } };
      ['getBootstrap','getDashboard','listClasses'].forEach(function(name) { value[name] = function(args) { return window.siaRenderRpc(name,args).then(ok,fail); }; });
      return value;
    }
    window.google = { script: { run: runner() } };
  </script>`;
  html = html.replace('<script>', () => shim + '<script>');
  // Real diagnostic doGet output, then a document.write host fixture. The
  // HtmlService template evaluator is mocked: this does not prove Google works.
  const writer = '<script>document.open();document.write(' + JSON.stringify(html).replace(/</g, '\\u003c') + ');document.close();</script>';
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: writer }));
  await page.goto(url);
  return { calls };
}
async function report(page) {
  await expect.poll(async () => JSON.parse(await page.getByLabel('Laporan diagnostik', { exact: true }).inputValue()).browser.status).toBe('complete');
  return JSON.parse(await page.getByLabel('Laporan diagnostik', { exact: true }).inputValue());
}

test('opt-in diagnostic compares build, retrieved, evaluated and browser core without exporting account data', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { calls } = await serve(page);
  await expect(page.locator('#stat-students')).toHaveText('288');
  await expect(page.locator('#profile-name')).toHaveText('DIAG_PRIVATE_PERSON_9f1');
  const value = await report(page);
  expect(value.server.files.Scripts.matchesBuild).toBe(true);
  expect(value.server.evaluated.coreMatchesRetrieved).toBe(true);
  expect(value.browser.matchesRetrievedCore).toBe(true);
  expect(value.browser.matchesEvaluatedCore).toBe(true);
  expect(value.browser.matchesBuildCore).toBe(true);
  expect(value.browser.firstDifference).toBeNull();
  expect(value.browser.beforeProbeRan).toBe(true);
  expect(value.browser.afterCoreReached).toBe(true);
  expect(value.browser.errors).toEqual([]);
  expect(JSON.stringify(value)).not.toContain('DIAG_PRIVATE_');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh laporan JSON', exact: true }).click();
  const download = await downloaded;
  const text = await readFile(await download.path(), 'utf8');
  expect(JSON.parse(text).build.id).toBe(value.build.id);
  expect(text).not.toContain('DIAG_PRIVATE_');
  expect(calls.every((method) => ['getBootstrap', 'getDashboard', 'listClasses'].includes(method))).toBe(true);
  expect(errors).toEqual([]);
});

test('independent probes and download survive the exact Pustaka SyntaxError in the received core', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { calls } = await serve(page, { corruptBrowserCore: true });
  const value = await report(page);
  expect(value.server.files.Scripts.matchesBuild).toBe(true);
  expect(value.server.evaluated.coreMatchesRetrieved).toBe(true);
  expect(value.browser.matchesRetrievedCore).toBe(false);
  expect(value.browser.matchesEvaluatedCore).toBe(false);
  expect(value.browser.matchesBuildCore).toBe(false);
  expect(value.browser.firstDifference.expectedCodeUnit).toBe('U+003B');
  expect(value.browser.firstDifference.actualCodeUnit).toBe('U+0020');
  expect(value.browser.afterCoreReached).toBe(true);
  expect(value.browser.coreNamespacePresent).toBe(false);
  expect(value.browser.errors.some((error) => error.kind === 'SYNTAX_PUSTAKA')).toBe(true);
  expect(errors.some((message) => message.includes("Unexpected identifier 'Pustaka'"))).toBe(true);
  expect(calls).toEqual([]);
  await expect(page.locator('#mode-badge')).toHaveText('MEMUAT');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh laporan JSON', exact: true }).click();
  expect(JSON.parse(await readFile(await (await downloaded).path(), 'utf8')).browser.matchesBuildCore).toBe(false);
});

test('diagnostics distinguish changed HtmlOutput retrieval from later browser transformation', async ({ page }) => {
  await serve(page, { changeRetrieved: true });
  const value = await report(page);
  expect(value.server.files.Scripts.matchesBuild).toBe(false);
  expect(value.server.retrievedCore.matchesBuild).toBe(false);
  expect(value.server.evaluated.coreMatchesRetrieved).toBe(true);
  expect(value.browser.matchesRetrievedCore).toBe(true);
  expect(value.browser.matchesEvaluatedCore).toBe(true);
  expect(value.browser.matchesBuildCore).toBe(false);
  expect(value.browser.firstDifference).toBeNull();
});

test('static build fingerprint and copyable server report remain available when all browser JavaScript is disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const api = createDemo('admin');
  const html = api.doGet({ parameter: { diagnostic: 'render' } }).getContent();
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(url);
  await expect(page.locator('#sia-render-build')).toHaveText(/^[a-f0-9]{64}$/);
  const value = JSON.parse(await page.getByLabel('Laporan diagnostik', { exact: true }).inputValue());
  expect(value.browser.status).toBe('pending');
  expect(value.server.files.Scripts.matchesBuild).toBe(true);
  await expect(page.locator('#sia-render-status')).toContainText('Laporan server tersedia');
  await context.close();
});

test('unavailable browser hashing is reported as unknown rather than a false integrity mismatch', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'subtle', { value: undefined }));
  await serve(page);
  await expect.poll(async () => JSON.parse(await page.getByLabel('Laporan diagnostik', { exact: true }).inputValue()).browser.status).toBe('hash_unavailable');
  const value = JSON.parse(await page.getByLabel('Laporan diagnostik', { exact: true }).inputValue());
  expect(value.browser.core.sha256).toBeNull();
  expect(value.browser.matchesRetrievedCore).toBeNull();
  expect(value.browser.matchesEvaluatedCore).toBeNull();
  expect(value.browser.matchesBuildCore).toBeNull();
  expect(value.browser.firstDifference).toBeNull();
  expect(value.server.files.Scripts.matchesBuild).toBe(true);
});
