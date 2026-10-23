import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../../', import.meta.url));
export const schema = JSON.parse(readFileSync(`${base}database/schema.json`, 'utf8'));
export function backend({ email = 'admin@example.test', configured = true, overrides = {} } = {}) {
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
    PenugasanGuru: [],
    SesiAbsensi: [
      { session_id: 'X1', class_id: 'K1', tanggal: '2026-10-23' },
      { session_id: 'X2', class_id: 'K2', tanggal: '2026-10-23' },
      { session_id: 'X3', class_id: 'K1', tanggal: '2026-10-22' },
      { session_id: 'X4', class_id: 'K1', tanggal: '2026-09-01' }
    ],
    Absensi: [
      { session_id: 'X1', student_id: 'S1', status: 'H' },
      { session_id: 'X2', student_id: 'S2', status: 'S' },
      { session_id: 'X3', student_id: 'S1', status: 'I' },
      { session_id: 'X4', student_id: 'S1', status: 'A' }
    ],
    Jurnal: [{ journal_id: 'J1', class_id: 'K1', tanggal: '2026-10-23', teacher_user_id: 'U2' }],
    ...overrides
  };
  const tables = new Map(Object.entries(schema.sheets).map(([name, headers]) => [name,
    [headers.slice(), ...(data[name] || []).map((row) => headers.map((key) => row[key] ?? ''))]
  ]));
  const calls = [];
  const wrapSheet = (name) => ({
    getDataRange: () => ({ getValues: () => { calls.push(name); return tables.get(name); } }),
    getLastRow: () => tables.get(name).length,
    getRange: () => ({ setValues: (rows) => tables.set(name, rows) }),
    setFrozenRows: () => {}
  });
  const book = {
    getSheetByName: (name) => tables.has(name) ? wrapSheet(name) : null,
    insertSheet: (name) => { tables.set(name, []); return wrapSheet(name); }
  };
  const context = vm.createContext({
    console: { error: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => configured ? 'SHEET_TEST_ID' : null }) },
    Session: { getActiveUser: () => ({ getEmail: () => email }), getScriptTimeZone: () => 'Asia/Jakarta' },
    SpreadsheetApp: { openById: () => book },
    Utilities: { formatDate: (date, zone, format) => format === 'yyyy-MM-dd' ? date.toISOString().slice(0, 10) : date.toISOString() },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) }
  });
  vm.runInContext(`var DatabaseSchema_ = ${JSON.stringify(schema)};`, context);
  for (const file of readdirSync(`${base}src/backend`).filter((name) => name.endsWith('.gs')).sort()) {
    vm.runInContext(readFileSync(`${base}src/backend/${file}`, 'utf8'), context, { filename: file });
  }
  return { api: context, tables, calls, data, context };
}
