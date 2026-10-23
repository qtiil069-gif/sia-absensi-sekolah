import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './helpers/backend.mjs';

const key = { classId: 'K1', date: '2026-10-24', kind: 'HARIAN', subjectId: '' };
const ok = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
function payload(data, status = 'H') { return { ...key, expectedRevision: data.revision, entries: data.entries.map((row) => ({ studentId: row.studentId, status, note: '' })) }; }

test('attendance read is active-roster only, starts pending, and creates/edit exactly one session/record', () => {
  const { api, tables, metrics } = backend({ email: 'guru@example.test' });
  const data = ok(api.getAttendance(key));
  assert.equal(data.entries.length, 1);
  assert.equal(data.summary.pending, 1);
  assert.equal(data.entries[0].status, null);
  const saved = ok(api.saveAttendance(payload(data)));
  assert.ok(saved.sessionId);
  assert.equal(saved.summary.H, 1);
  const edited = ok(api.saveAttendance(payload(saved, 'S')));
  assert.equal(edited.summary.S, 1);
  assert.equal(edited.sessionId, saved.sessionId);
  assert.equal(tables.get('SesiAbsensi').length, 6);
  assert.equal(tables.get('Absensi').length, 6);
  assert.equal(tables.get('Absensi').at(-1)[5], 'U2');
  assert.equal(metrics.unlockedWrites, 0);
  assert.equal(metrics.locked, false);
});

test('a retry or second teacher with stale revision cannot duplicate an attendance session', () => {
  const { api, tables } = backend();
  const original = ok(api.getAttendance(key));
  const first = ok(api.saveAttendance(payload(original)));
  assert.equal(api.saveAttendance(payload(original, 'A')).error.code, 'CONFLICT');
  assert.equal(ok(api.getAttendance(key)).summary.H, 1);
  assert.equal(tables.get('SesiAbsensi').filter((row) => row[0] === first.sessionId).length, 1);
});

test('teacher cannot read/write/obtain subjects for other classes, even with forged role', () => {
  const { api, metrics } = backend({ email: 'guru@example.test' });
  assert.equal(api.getAttendance({ ...key, classId: 'K2' }).error.code, 'FORBIDDEN');
  assert.equal(api.getAttendanceOptions({ classId: 'K2' }).error.code, 'FORBIDDEN');
  assert.equal(api.saveAttendance({ ...key, classId: 'K2', expectedRevision: '0'.repeat(64), entries: [] }).error.code, 'FORBIDDEN');
  assert.equal(api.saveAttendance({ ...key, role: 'ADMIN_KEPALA_SEKOLAH' }).error.code, 'INVALID_ARGUMENT');
  assert.equal(metrics.writes, 0);
});

test('all new RPCs reject nonregistered accounts and missing identity without writes', () => {
  for (const email of ['', 'asing@example.test', 'nonaktif@example.test']) {
    const { api, metrics } = backend({ email });
    for (const method of ['queryStudents', 'getRosterOptions', 'createClass', 'updateClass', 'deactivateClass', 'createStudent', 'updateStudent', 'deactivateStudent', 'getAttendanceOptions', 'getAttendance', 'saveAttendance']) {
      assert.equal(api[method](key).ok, false, method);
    }
    assert.equal(metrics.writes, 0);
  }
});

test('invalid, incomplete, duplicate, foreign-student and formula entries are rejected without writing', () => {
  const { api, metrics } = backend();
  const data = ok(api.getAttendance(key));
  for (const entries of [[], [{ studentId: 'S1', status: '' }], [{ studentId: 'S2', status: 'H' }],
    [{ studentId: 'S1', status: 'H' }, { studentId: 'S1', status: 'H' }], [{ studentId: 'S1', status: 'H', note: '=HYPERLINK("x")' }]]) {
    assert.equal(api.saveAttendance({ ...payload(data), entries }).error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(api.getAttendance({ ...key, date: '2026-02-30' }).error.code, 'INVALID_ARGUMENT');
  assert.equal(metrics.writes, 0);
});

test('MAPEL is isolated per class-date-subject and teacher needs matching subject assignment', () => {
  const seed = { Mapel: [{ subject_id: 'M1', nama: 'Matematika', aktif: true }, { subject_id: 'M2', nama: 'Bahasa', aktif: true }],
    PenugasanGuru: [{ assignment_id: 'P1', user_id: 'U2', class_id: 'K1', subject_id: 'M1', aktif: true }] };
  const { api } = backend({ email: 'guru@example.test', overrides: seed });
  assert.equal(ok(api.getAttendanceOptions({ classId: 'K1' })).subjects.length, 1);
  assert.equal(api.getAttendance({ ...key, kind: 'MAPEL', subjectId: 'M2' }).error.code, 'FORBIDDEN');
  const mapelKey = { ...key, kind: 'MAPEL', subjectId: 'M1' };
  const data = ok(api.getAttendance(mapelKey));
  ok(api.saveAttendance({ ...payload(data), ...mapelKey }));
  assert.equal(ok(api.getAttendance(key)).sessionId, null);
  assert.equal(ok(api.getAttendance(mapelKey)).summary.H, 1);
});

test('duplicate natural session keys and duplicate student-session rows fail closed', () => {
  const first = backend();
  const sessions = first.tables.get('SesiAbsensi');
  sessions.push([...sessions[1]]);
  assert.equal(first.api.getAttendance({ ...key, date: '2026-10-23' }).error.code, 'DATA_INVALID');
  const second = backend();
  const attendance = second.tables.get('Absensi');
  attendance.push([...attendance[1]]);
  assert.equal(second.api.getAttendance({ ...key, date: '2026-10-23' }).error.code, 'DATA_INVALID');
});

test('roster changes invalidate an attendance form before saving', () => {
  const { api, tables, metrics } = backend();
  const data = ok(api.getAttendance(key));
  tables.get('Siswa')[1][4] = false;
  assert.equal(api.saveAttendance(payload(data)).error.code, 'CONFLICT');
  assert.equal(metrics.writes, 0);
});

test('historical entries for moved/inactive students are retained without exposing their names to current teacher roster', () => {
  const { api, tables } = backend({ email: 'guru@example.test' });
  tables.get('Absensi').push(['A5', 'X1', 'OLD-STUDENT', 'I', 'Riwayat', 'U1', '2026-10-23T01:00:00Z']);
  const selection = { ...key, date: '2026-10-23' };
  const data = ok(api.getAttendance(selection));
  assert.equal(data.retainedCount, 1);
  assert.equal(data.entries.some((row) => row.studentId === 'OLD-STUDENT'), false);
  ok(api.saveAttendance({ ...payload(data), ...selection }));
  assert.equal(tables.get('Absensi').find((row) => row[0] === 'A5')[3], 'I');
});

test('failure after creating a session compensates all changes; retry creates just one session', () => {
  const { api, faults } = backend();
  const data = ok(api.getAttendance(key));
  faults.failWriteAt = 2;
  assert.equal(api.saveAttendance(payload(data)).error.code, 'WRITE_FAILED');
  const reloaded = ok(api.getAttendance(key));
  assert.equal(reloaded.sessionId, null);
  assert.equal(reloaded.summary.pending, 1);
  ok(api.saveAttendance(payload(reloaded)));
});

test('flush failure does not report success and releases the lock after compensation', () => {
  const { api, faults, metrics } = backend();
  const data = ok(api.getAttendance(key));
  faults.failFlushAt = 1;
  assert.equal(api.saveAttendance(payload(data)).error.code, 'WRITE_FAILED');
  assert.equal(ok(api.getAttendance(key)).sessionId, null);
  assert.equal(metrics.locked, false);
});

test('empty roster cannot save and inactive classes cannot be used', () => {
  const { api } = backend({ overrides: { KeanggotaanKelas: [] } });
  const data = ok(api.getAttendance(key));
  assert.equal(api.saveAttendance(payload(data)).error.code, 'INVALID_ARGUMENT');
  assert.equal(api.getAttendance({ ...key, classId: 'K3' }).error.code, 'FORBIDDEN');
});

test('500-student attendance saves in bulk without per-cell write loops', () => {
  const pupils = Array.from({ length: 500 }, (_, i) => ({ student_id: `P${i}`, nis: String(i).padStart(4, '0'), nama: `Siswa ${i}`, aktif: true }));
  const { api, metrics } = backend({ overrides: { Siswa: pupils,
    KeanggotaanKelas: pupils.map((row, i) => ({ enrollment_id: `E${i}`, student_id: row.student_id, class_id: 'K1', aktif: true })) } });
  const data = ok(api.getAttendance(key));
  assert.equal(data.entries.length, 500);
  const saved = ok(api.saveAttendance(payload(data)));
  assert.equal(saved.summary.H, 500);
  assert.equal(metrics.writes, 3); // One session block, one attendance block, one audit block.
});

test('malformed legacy harian/mapel session cannot silently create a duplicate natural session', () => {
  for (const patch of [{ jenis: '' }, { jenis: 'HARIAN', subject_id: 'M1' }]) {
    const { api, tables } = backend();
    const headers = tables.get('SesiAbsensi')[0];
    for (const [name, value] of Object.entries(patch)) tables.get('SesiAbsensi')[1][headers.indexOf(name)] = value;
    assert.equal(api.getAttendance({ ...key, date: '2026-10-23' }).error.code, 'DATA_INVALID');
  }
});
