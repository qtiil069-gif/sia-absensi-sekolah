import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './helpers/backend.mjs';

const input = { name: 'Siswa Baru', nis: '0005', nisn: '0123456789', classId: 'K1' };
const ok = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };

test('admin creates student, retains leading zero NIS, moves classes and soft-deactivates', () => {
  const { api, tables, metrics } = backend();
  const created = ok(api.createStudent(input));
  assert.equal(created.nis, '0005');
  assert.equal(created.nisn, '0123456789');
  assert.equal(created.classIds[0], 'K1');
  const edited = ok(api.updateStudent({ ...input, id: created.id, name: 'Siswa Pindah', classId: 'K2', expectedRevision: created.revision }));
  assert.equal(edited.classIds.length, 1);
  assert.equal(edited.classIds[0], 'K2');
  const history = tables.get('KeanggotaanKelas').filter((row) => row[1] === created.id);
  assert.equal(history.length, 2);
  assert.equal(history.filter((row) => row[3] === false).length, 1);
  const inactive = ok(api.deactivateStudent({ id: edited.id, expectedRevision: edited.revision }));
  assert.equal(inactive.active, false);
  assert.equal(ok(api.queryStudents({ q: '0005' })).total, 0);
  assert.equal(ok(api.queryStudents({ status: 'inactive', q: '0005' })).total, 1);
  assert.equal(tables.get('Siswa').length, 6);
  assert.equal(metrics.unlockedWrites, 0);
});

test('NIS duplicate checks include inactive students and case normalization', () => {
  const { api, metrics } = backend();
  assert.equal(api.createStudent({ ...input, nis: '003' }).error.code, 'DUPLICATE');
  ok(api.createStudent({ ...input, nis: 'AB-01' }));
  const writes = metrics.writes;
  assert.equal(api.createStudent({ ...input, nis: ' ab-01 ' }).error.code, 'DUPLICATE');
  assert.equal(metrics.writes, writes);
});

test('updating existing student can preserve its own NIS and cannot steal another NIS', () => {
  const { api } = backend();
  const row = ok(api.queryStudents({ q: '001' })).items[0];
  assert.equal(api.updateStudent({ ...input, id: row.id, nis: '002', expectedRevision: row.revision }).error.code, 'DUPLICATE');
  assert.equal(ok(api.updateStudent({ ...input, id: row.id, nis: '001', expectedRevision: row.revision })).nis, '001');
});

test('teacher search/pagination remain scoped; master writes and inactive listings denied', () => {
  const { api, metrics } = backend({ email: 'guru@example.test' });
  assert.equal(ok(api.queryStudents()).total, 1);
  assert.equal(ok(api.queryStudents({ q: '002' })).total, 0);
  assert.equal(api.queryStudents({ classId: 'K2' }).error.code, 'FORBIDDEN');
  assert.equal(api.queryStudents({ status: 'all' }).error.code, 'FORBIDDEN');
  assert.equal(ok(api.queryStudents()).items[0].nisn, undefined);
  for (const method of ['createStudent', 'updateStudent', 'deactivateStudent']) assert.equal(api[method](input).error.code, 'FORBIDDEN');
  assert.equal(metrics.writes, 0);
});

test('pagination covers all 500 students once, with name/NIS search and class filters', () => {
  const pupils = Array.from({ length: 500 }, (_, index) => ({ student_id: `P${index}`, nama: `Siswa ${String(index).padStart(3, '0')}`, nis: `N${index}`, aktif: true }));
  const members = pupils.map((row) => ({ student_id: row.student_id, class_id: 'K1', aktif: true }));
  const { api } = backend({ overrides: { Siswa: pupils, KeanggotaanKelas: members } });
  const ids = [];
  for (let page = 1; page <= 20; page++) {
    const result = ok(api.queryStudents({ page, pageSize: 25, classId: 'K1' }));
    assert.equal(result.total, 500);
    ids.push(...result.items.map((row) => row.id));
  }
  assert.equal(new Set(ids).size, 500);
  assert.equal(ok(api.queryStudents({ q: 'Siswa 499' })).items[0].nis, 'N499');
  assert.equal(ok(api.queryStudents({ classId: 'K2' })).total, 0);
  assert.equal(ok(api.queryStudents({ page: 1000 })).page, 20);
});

test('student validation rejects malformed payload, NISN, class, and formula injection', () => {
  const { api, metrics } = backend();
  for (const patch of [{ name: '=IMPORTXML("x")' }, { nis: 123 }, { nisn: '123' }, { classId: 'K3' }, { role: 'ADMIN_KEPALA_SEKOLAH' }, { name: '' }]) {
    assert.equal(api.createStudent({ ...input, ...patch }).ok, false);
  }
  for (const options of [{ page: 0 }, { pageSize: 500 }, { page: '2' }, null, { role: 'ADMIN_KEPALA_SEKOLAH' }]) {
    assert.equal(api.queryStudents(options).error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(metrics.writes, 0);
});

test('stale roster version blocks edits and preserves current data', () => {
  const { api } = backend();
  const row = ok(api.queryStudents({ q: '001' })).items[0];
  ok(api.updateStudent({ ...input, nis: row.nis, id: row.id, expectedRevision: row.revision }));
  assert.equal(api.deactivateStudent({ id: row.id, expectedRevision: row.revision }).error.code, 'CONFLICT');
});

test('membership failure compensates student and leaves no orphaned live data', () => {
  const { api, faults } = backend();
  faults.failWriteAt = 2;
  assert.equal(api.createStudent(input).error.code, 'WRITE_FAILED');
  assert.equal(ok(api.queryStudents({ q: '0005', status: 'all' })).total, 0);
});

test('updates address physical sheet row even when blank rows exist', () => {
  const { api, tables } = backend();
  tables.get('Siswa').splice(1, 0, Array(7).fill(''));
  const row = ok(api.queryStudents({ q: '001' })).items[0];
  ok(api.updateStudent({ ...input, id: row.id, nis: row.nis, expectedRevision: row.revision }));
  assert.equal(tables.get('Siswa')[2][0], 'S1');
  assert.equal(tables.get('Siswa')[1][0], '');
});
