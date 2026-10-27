/* Local in-memory Apps Script/Sheets runtime for tests and preview only. Never deployed. */
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../', import.meta.url));
export const schema = JSON.parse(readFileSync(`${base}database/schema.json`, 'utf8'));
export function backend({ email = 'admin@example.test', configured = true, overrides = {} } = {}) {
  // Apps Script returns a string for the requested key, or null when absent.
  const scriptProperties = new Map(configured ? [['APP_SPREADSHEET_ID', 'SHEET_TEST_ID']] : []);
  const data = {
    Pengaturan: [{ key: 'school_name', value: 'Sekolah Uji', description: '' }],
    Pengguna: [
      { user_id: 'U1', email: 'admin@example.test', nama: 'Admin Uji', role: 'ADMIN_KEPALA_SEKOLAH', aktif: true },
      { user_id: 'U2', email: 'guru@example.test', nama: 'Guru Uji', role: 'GURU', aktif: true },
      { user_id: 'U3', email: 'nonaktif@example.test', nama: 'Nonaktif', role: 'GURU', aktif: false }
    ],
    Kelas: [
      { class_id: 'K1', nama: '7 A', tingkat: 7, year_id: 'Y1', wali_user_id: 'U2', aktif: true },
      { class_id: 'K2', nama: '7 B', tingkat: 7, year_id: 'Y1', wali_user_id: 'U1', aktif: true },
      { class_id: 'K3', nama: 'Arsip', tingkat: 7, year_id: 'Y0', wali_user_id: 'U2', aktif: false }
    ],
    Siswa: [
      { student_id: 'S1', nama: 'Siswa Uji 1', nis: '001', aktif: true },
      { student_id: 'S2', nama: 'Siswa Uji 2', nis: '002', aktif: true },
      { student_id: 'S3', nama: 'Arsip', nis: '003', aktif: false },
      { student_id: 'S4', nama: 'Siswa Uji 4', nis: '004', aktif: true }
    ],
    KeanggotaanKelas: [
      { student_id: 'S1', class_id: 'K1', aktif: true },
      { student_id: 'S2', class_id: 'K2', aktif: true },
      { student_id: 'S3', class_id: 'K1', aktif: true },
      { student_id: 'S4', class_id: 'K1', aktif: false }
    ],
    TahunAjaran: [{ year_id: 'Y1', nama: '2026/2027', aktif: true }, { year_id: 'Y0', nama: '2025/2026', aktif: false }],
    PenugasanGuru: [],
    SesiAbsensi: [
      { session_id: 'X1', class_id: 'K1', tanggal: '2026-10-23', jenis: 'HARIAN' },
      { session_id: 'X2', class_id: 'K2', tanggal: '2026-10-23', jenis: 'HARIAN' },
      { session_id: 'X3', class_id: 'K1', tanggal: '2026-10-22', jenis: 'HARIAN' },
      { session_id: 'X4', class_id: 'K1', tanggal: '2026-09-01', jenis: 'HARIAN' }
    ],
    Absensi: [
      { attendance_id: 'A1', session_id: 'X1', student_id: 'S1', status: 'H', updated_at: '2026-10-23T00:00:00Z' },
      { attendance_id: 'A2', session_id: 'X2', student_id: 'S2', status: 'S', updated_at: '2026-10-23T00:00:00Z' },
      { attendance_id: 'A3', session_id: 'X3', student_id: 'S1', status: 'I', updated_at: '2026-10-22T00:00:00Z' },
      { attendance_id: 'A4', session_id: 'X4', student_id: 'S1', status: 'A', updated_at: '2026-09-01T00:00:00Z' }
    ],
    Jurnal: [{ journal_id: 'J1', class_id: 'K1', tanggal: '2026-10-23', teacher_user_id: 'U2' }],
    ...overrides
  };
  const tables = new Map(Object.entries(schema.sheets).map(([name, headers]) => [name,
    [headers.slice(), ...(data[name] || []).map((row) => headers.map((key) => row[key] ?? ''))]
  ]));
  const calls = [];
  const faults = { backupFailure: false, backupMismatch: false, busy: false, failWriteAt: null, persistentWriteFailure: false, failFlushAt: null };
  const backups = [];
  const metrics = { backups: 0, locked: false, locks: 0, writes: 0, flushes: 0, unlockedWrites: 0 };
  const capacities = new Map();
  const lastRow = (name) => {
    const rows = tables.get(name);
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].some((value) => value !== '')) return i + 1;
    return 0;
  };
  const range = (name, start, col, count, width) => ({
    getValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => tables.get(name)[start - 1 + i]?.[col - 1 + j] ?? '')),
    getFormulas: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => {
      const value = tables.get(name)[start - 1 + i]?.[col - 1 + j];
      return typeof value === 'string' && value.startsWith('=') ? value : '';
    })),
    setValues: (rows) => {
      metrics.writes++;
      if (!metrics.locked) metrics.unlockedWrites++;
      if (faults.failWriteAt === metrics.writes || (faults.persistentWriteFailure && metrics.writes >= faults.failWriteAt)) throw new Error('MOCK_WRITE_FAILURE_PRIVATE');
      if (rows.length !== count || rows.some((row) => row.length !== width)) throw new Error('Range shape mismatch');
      rows.forEach((row, i) => {
        while (tables.get(name).length < start + i) tables.get(name).push(Array(schema.sheets[name].length).fill(''));
        row.forEach((value, j) => { tables.get(name)[start - 1 + i][col - 1 + j] = value; });
      });
    }
  });
  const wrapSheet = (name) => ({
    getName: () => name,
    getDataRange: () => ({ getValues: () => { calls.push(name); return tables.get(name).map((row) => Array.from(row)); }, getFormulas: () => tables.get(name).map((row) => Array.from(row, (value) => typeof value === 'string' && value.startsWith('=') ? value : '')) }),
    getLastRow: () => lastRow(name),
    getMaxRows: () => Math.max(capacities.get(name) || 1000, tables.get(name).length),
    insertRowsAfter: (_, number) => capacities.set(name, Math.max(capacities.get(name) || 1000, tables.get(name).length) + number),
    getRange: (start, col, count, width) => range(name, start, col, count, width),
    setFrozenRows: () => {}
  });
  const book = {
    getSheets: () => [...tables.keys()].map(wrapSheet),
    copy: (name) => {
      if (faults.backupFailure) throw new Error('Backup unavailable');
      const saved = new Map([...tables].map(([key, values]) => [key, values.map((row) => Array.from(row))]));
      if (faults.backupMismatch) saved.get('Siswa')[1][0] = 'changed';
      backups.push({ name, tables: saved }); metrics.backups++;
      const wrap = (key) => ({ getName: () => key, getDataRange: () => ({
        getValues: () => saved.get(key).map((row) => Array.from(row)),
        getFormulas: () => saved.get(key).map((row) => Array.from(row, (value) => typeof value === 'string' && value.startsWith('=') ? value : ''))
      }) });
      return { getSheets: () => [...saved.keys()].map(wrap), getSheetByName: (key) => saved.has(key) ? wrap(key) : null };
    },
    getSheetByName: (name) => tables.has(name) ? wrapSheet(name) : null,
    insertSheet: (name) => { tables.set(name, []); return wrapSheet(name); }
  };
  const htmlOutput = (content) => ({
    getContent: () => content,
    setTitle(value) { this.title = value; return this; },
    addMetaTag(name, value) { (this.meta || (this.meta = [])).push({ name, value }); return this; }
  });
  const context = vm.createContext({
    console: { error: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => scriptProperties.get(key) ?? null }) },
    Session: { getActiveUser: () => ({ getEmail: () => email }), getScriptTimeZone: () => 'Asia/Jakarta' },
    HtmlService: {
      createHtmlOutput: htmlOutput,
      createHtmlOutputFromFile: (name) => {
        if (!/^(?:Asset_(qr|pdf|excel)|Index|Styles|Scripts|RenderProbe)$/.test(name)) throw new Error('Unknown local HTML file.');
        return htmlOutput(readFileSync(`${base}dist/${name}.html`, 'utf8'));
      },
      createTemplateFromFile: (name) => {
        if (name !== 'Index') throw new Error('Unknown local HTML template.');
        return { evaluate: () => htmlOutput(context.HtmlService.createHtmlOutputFromFile(name).getContent()
          .replace("<?!= include_('Styles'); ?>", () => context.include_('Styles'))
          .replace("<?!= include_('Scripts'); ?>", () => context.include_('Scripts'))) };
      }
    },
    SpreadsheetApp: { openById: () => book, flush: () => { if (++metrics.flushes === faults.failFlushAt) throw new Error('MOCK_FLUSH_FAILURE_PRIVATE'); } },
    Utilities: {
      getUuid: randomUUID,
      base64Decode: (value) => [...Buffer.from(value, 'base64')],
      base64Encode: (value) => Buffer.from(typeof value === 'string' ? value : Uint8Array.from(value)).toString('base64'),
      newBlob: (value) => ({ getBytes: () => [...Buffer.from(value, 'utf8')] }),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => [...createHash('sha256').update(value).digest()],
      formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? date.toISOString().slice(0, 10) : date.toISOString()
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (faults.busy || metrics.locked) return false; metrics.locked = true; metrics.locks++; return true; },
      waitLock: () => { if (metrics.locked) throw new Error('Busy'); metrics.locked = true; metrics.locks++; },
      releaseLock: () => { metrics.locked = false; }
    }) }
  });
  let browserAssets;
  let browserAssetsLoaded = false;
  Object.defineProperty(context, 'BrowserAssets_', {
    configurable: true,
    get: () => {
      // Read on first asset RPC, after preview build completes; normal backend
      // tests and bootstrap do not depend on generated files being present.
      if (!browserAssetsLoaded) {
        browserAssets = JSON.parse(readFileSync(`${base}.preview/browser-assets.json`, 'utf8'));
        browserAssetsLoaded = true;
      }
      return browserAssets;
    },
    set: (value) => { browserAssets = value; browserAssetsLoaded = true; }
  });
  let renderBuild;
  let renderBuildLoaded = false;
  Object.defineProperty(context, 'RenderBuild_', {
    configurable: true,
    get: () => {
      if (!renderBuildLoaded) {
        renderBuild = JSON.parse(readFileSync(`${base}.preview/render-build.json`, 'utf8'));
        renderBuildLoaded = true;
      }
      return renderBuild;
    },
    set: (value) => { renderBuild = value; renderBuildLoaded = true; }
  });
  vm.runInContext(`var DatabaseSchema_ = ${JSON.stringify(schema)};`, context);
  for (const file of readdirSync(`${base}src/backend`).filter((name) => name.endsWith('.gs')).sort()) {
    vm.runInContext(readFileSync(`${base}src/backend/${file}`, 'utf8'), context, { filename: file });
  }
  return { api: context, tables, calls, data, context, faults, metrics, backups, scriptProperties };
}
