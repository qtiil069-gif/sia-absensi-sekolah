import test from 'node:test';
import assert from 'node:assert/strict';
import { backend, schema } from './helpers/backend.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));
test('bootstrap returns real configured school and permitted classes without email/role table leakage', () => {
  const result = plain(backend().api.getBootstrap());
  assert.equal(result.ok, true);
  assert.equal(result.data.school.name, 'Sekolah Uji');
  assert.equal(result.data.classes.length, 2);
  assert.equal(result.data.user.email, undefined);
});

for (const [label, email, code] of [
  ['no Google identity', '', 'UNAUTHENTICATED'],
  ['unregistered account', 'asing@example.test', 'FORBIDDEN'],
  ['inactive account', 'nonaktif@example.test', 'FORBIDDEN']
]) {
  test(`${label}: every data RPC denies access`, () => {
    const { api } = backend({ email });
    for (const [method, args] of [['getBootstrap'], ['getDashboard', { date: '2026-10-23' }], ['listClasses'], ['listStudents']]) {
      const result = api[method](args);
      assert.equal(result.ok, false, method);
      assert.equal(result.error.code, code, method);
      assert.equal(result.data, undefined);
    }
  });
}

test('missing spreadsheet configuration produces actionable error, no demo fallback', () => {
  const result = backend({ configured: false }).api.getBootstrap();
  assert.equal(result.error.code, 'CONFIG_REQUIRED');
});

test('duplicate account and unsupported role fail closed', () => {
  const duplicate = backend();
  duplicate.tables.get('Pengguna').push(duplicate.tables.get('Pengguna')[1].slice());
  assert.equal(duplicate.api.getBootstrap().error.code, 'FORBIDDEN');
  const invalid = backend({ overrides: { Pengguna: [{ user_id: 'U1', email: 'admin@example.test', role: 'SUPERADMIN', aktif: true }] } });
  assert.equal(invalid.api.getBootstrap().error.code, 'FORBIDDEN');
});

test('email matching ignores case and whitespace; active FALSE is not truthy', () => {
  assert.equal(backend({ email: ' ADMIN@EXAMPLE.TEST ' }).api.getBootstrap().ok, true);
  const result = backend({ overrides: { Pengguna: [{ user_id: 'U1', email: 'admin@example.test', role: 'GURU', aktif: 'FALSE' }] } }).api.getBootstrap();
  assert.equal(result.error.code, 'FORBIDDEN');
});

test('teacher reads only active homeroom students, classes, attendance and journals', () => {
  const { api } = backend({ email: 'guru@example.test' });
  assert.deepEqual(plain(api.listClasses().data).map((room) => room.id), ['K1']);
  assert.deepEqual(plain(api.listStudents().data).map((student) => student.id), ['S1']);
  const data = api.getDashboard({ date: '2026-10-23' }).data;
  assert.equal(data.stats.students, 1);
  assert.equal(data.stats.classes, 1);
  assert.equal(data.stats.attendanceRate, 100);
  assert.equal(data.composition.total, 1);
  assert.equal(data.stats.journals, 1);
});

test('active teaching assignments grant class access; inactive assignments do not', () => {
  const assigned = backend({ email: 'guru@example.test', overrides: { PenugasanGuru: [
    { user_id: 'U2', class_id: 'K2', aktif: true }, { user_id: 'U2', class_id: 'K3', aktif: false }
  ] } });
  assert.equal(assigned.api.listClasses().data.length, 2);
  const inactive = backend({ email: 'guru@example.test', overrides: { PenugasanGuru: [{ user_id: 'U2', class_id: 'K2', aktif: 'FALSE' }] } });
  assert.equal(inactive.api.listClasses().data.length, 1);
});

test('teacher cannot select a different class by forging frontend filter', () => {
  const { api } = backend({ email: 'guru@example.test' });
  for (const method of ['getDashboard', 'listStudents']) {
    assert.equal(api[method]({ date: '2026-10-23', classId: 'K2', role: 'ADMIN_KEPALA_SEKOLAH' }).error.code, 'FORBIDDEN');
  }
});

test('admin aggregation uses selected date; weekly counts use selected Monday-Sunday', () => {
  const { api } = backend();
  const data = plain(api.getDashboard({ date: '2026-10-23' }).data);
  assert.deepEqual(data.stats, { students: 2, classes: 2, attendanceRate: 50, sessions: 2, journals: 1 });
  assert.deepEqual(data.composition.counts, { H: 1, S: 1, I: 0, A: 0 });
  assert.equal(data.weekly.length, 7);
  assert.equal(data.weekly[0].date, '2026-10-19');
  assert.equal(data.weekly[3].rate, 0);
  assert.equal(data.weekly[4].total, 2);
  assert.equal(data.weekly[5].rate, null);
});

test('no attendance is unknown, not zero attendance or all absent', () => {
  const data = backend().api.getDashboard({ date: '2026-10-24' }).data;
  assert.equal(data.stats.attendanceRate, null);
  assert.equal(data.composition.total, 0);
  assert.equal(data.composition.counts.A, 0);
});

test('class filter affects students, sessions and journal totals together', () => {
  const data = backend().api.getDashboard({ date: '2026-10-23', classId: 'K2' }).data;
  assert.equal(data.stats.students, 1);
  assert.equal(data.stats.classes, 1);
  assert.equal(data.stats.attendanceRate, 0);
  assert.equal(data.stats.sessions, 1);
  assert.equal(data.stats.journals, 0);
});

test('teacher with no class receives empty scope without leaking school data', () => {
  const { api } = backend({ email: 'guru@example.test', overrides: { Kelas: [] } });
  assert.equal(api.listStudents().data.length, 0);
  const data = api.getDashboard({ date: '2026-10-23' }).data;
  assert.equal(data.stats.students, 0);
  assert.equal(data.stats.attendanceRate, null);
  assert.equal(data.composition.total, 0);
});

for (const value of ['2026-02-30', '2026-13-01', '23/10/2026', '', 123, null]) {
  test(`invalid date ${JSON.stringify(value)} is rejected`, () => {
    const result = backend().api.getDashboard({ date: value });
    assert.equal(result.error.code, 'INVALID_ARGUMENT');
  });
}

test('invalid class ID type rejected by both query APIs', () => {
  const { api } = backend();
  assert.equal(api.listStudents({ classId: 5 }).error.code, 'INVALID_ARGUMENT');
  assert.equal(api.getDashboard({ classId: 5 }).error.code, 'INVALID_ARGUMENT');
});

test('duplicate student-session pair and invalid attendance status fail explicitly', () => {
  for (const records of [
    [{ session_id: 'X1', student_id: 'S1', status: 'H' }, { session_id: 'X1', student_id: 'S1', status: 'S' }],
    [{ session_id: 'X1', student_id: 'S1', status: 'UNKNOWN' }]
  ]) {
    assert.equal(backend({ overrides: { Absensi: records } }).api.getDashboard({ date: '2026-10-23' }).error.code, 'DATA_INVALID');
  }
});

test('missing tab, reordered header and extra columns fail schema validation', () => {
  for (const mutate of [
    (tables) => tables.delete('Kelas'),
    (tables) => { tables.get('Kelas')[0][0] = 'wrong_id'; },
    (tables) => { tables.get('Kelas')[0].push('extra_column'); }
  ]) {
    const { api, tables } = backend();
    mutate(tables);
    assert.equal(api.listClasses().error.code, 'SCHEMA_MISMATCH');
  }
});

test('each table is read at most once in a dashboard request', () => {
  const { api, calls } = backend({ email: 'guru@example.test' });
  assert.equal(api.getDashboard({ date: '2026-10-23' }).ok, true);
  assert.equal(new Set(calls).size, calls.length);
});

test('unexpected spreadsheet errors do not expose stack traces or internal messages', () => {
  const { api } = backend();
  api.SpreadsheetApp.openById = () => { throw new Error('PRIVATE_SPREADSHEET_ID'); };
  const result = plain(api.getBootstrap());
  assert.equal(result.error.code, 'INTERNAL');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SPREADSHEET_ID'));
});

test('initializer is repeatable and preserves all pre-existing rows', () => {
  const { api, tables } = backend();
  const before = JSON.stringify([...tables]);
  const result = api.initializeDatabase_();
  assert.equal(result.sheets, Object.keys(schema.sheets).length);
  api.initializeDatabase_();
  assert.equal(JSON.stringify([...tables]), before);
});

test('initializer creates missing headers without injecting demo accounts or students', () => {
  const { api, tables } = backend();
  tables.clear();
  api.initializeDatabase_();
  assert.equal(tables.size, Object.keys(schema.sheets).length);
  for (const [name, rows] of tables) assert.deepEqual(plain(rows), [schema.sheets[name]]);
});

test('initializer preflights existing headers before any additions or overwrites', () => {
  const { api, tables } = backend();
  tables.delete('Pengaturan');
  tables.get('Kelas')[0][0] = 'wrong';
  const before = JSON.stringify([...tables]);
  assert.throws(() => api.initializeDatabase_(), { code: 'SCHEMA_MISMATCH' });
  assert.equal(JSON.stringify([...tables]), before);
});
