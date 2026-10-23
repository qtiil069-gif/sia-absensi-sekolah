import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './helpers/backend.mjs';

const input = { name: '8 A', level: 8, yearId: 'Y1', homeroomId: 'U2' };
const ok = (result) => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };

test('admin creates, finds, edits and deactivates class without deleting it', () => {
  const { api, tables, metrics } = backend();
  const created = ok(api.createClass(input));
  assert.ok(created.id);
  assert.equal(created.active, true);
  assert.equal(ok(api.listClasses({ q: '8 a', yearId: 'Y1', level: 8 })).length, 1);
  const edited = ok(api.updateClass({ ...input, id: created.id, name: '8 B', expectedRevision: created.revision }));
  assert.equal(edited.name, '8 B');
  assert.notEqual(edited.revision, created.revision);
  assert.equal(ok(api.deactivateClass({ id: edited.id, expectedRevision: edited.revision })).active, false);
  assert.equal(ok(api.listClasses()).length, 2);
  assert.equal(ok(api.listClasses({ status: 'inactive', q: '8 B' })).length, 1);
  assert.equal(tables.get('Kelas').length, 5);
  assert.equal(tables.get('AuditLog').length, 4);
  assert.equal(metrics.unlockedWrites, 0);
  assert.equal(metrics.locked, false);
});

test('teacher can read only assigned classes and cannot mutate master data or read admin options', () => {
  const { api, metrics } = backend({ email: 'guru@example.test' });
  assert.equal(ok(api.listClasses()).length, 1);
  for (const [method, payload] of [['createClass', input], ['updateClass', { ...input, id: 'K2' }], ['deactivateClass', { id: 'K1' }], ['getRosterOptions'], ['listClasses', { status: 'all' }]]) {
    assert.equal(api[method](payload).error.code, 'FORBIDDEN');
  }
  assert.equal(metrics.writes, 0);
});

test('class writes reject duplicate names including inactive rows, bad references and formula text', () => {
  const { api, metrics } = backend();
  for (const [patch, code] of [
    [{ name: ' 7 a ' }, 'DUPLICATE'], [{ name: '=IMPORTXML("x")' }, 'INVALID_ARGUMENT'],
    [{ yearId: 'NO_YEAR' }, 'NOT_FOUND'], [{ yearId: 'Y0' }, 'INVALID_ARGUMENT'],
    [{ homeroomId: 'U3' }, 'INVALID_ARGUMENT'], [{ level: 0 }, 'INVALID_ARGUMENT'],
    [{ level: '8' }, 'INVALID_ARGUMENT'], [{ role: 'GURU' }, 'INVALID_ARGUMENT']
  ]) assert.equal(api.createClass({ ...input, ...patch }).error.code, code);
  assert.equal(metrics.writes, 0);
});

test('stale class revision is rejected, preventing lost updates', () => {
  const { api } = backend();
  const row = ok(api.listClasses())[0];
  ok(api.updateClass({ ...input, id: row.id, name: '7 A revisi', expectedRevision: row.revision }));
  assert.equal(api.deactivateClass({ id: row.id, expectedRevision: row.revision }).error.code, 'CONFLICT');
});

test('all class write endpoints reject missing Google identity even with forged role', () => {
  const { api, metrics } = backend({ email: '' });
  for (const method of ['createClass', 'updateClass', 'deactivateClass']) {
    assert.equal(api[method]({ ...input, role: 'ADMIN_KEPALA_SEKOLAH' }).error.code, 'UNAUTHENTICATED');
  }
  assert.equal(metrics.writes, 0);
  assert.equal(metrics.locked, false);
});

test('lock contention prevents writes and returns BUSY', () => {
  const { api, faults, metrics } = backend();
  faults.busy = true;
  assert.equal(api.createClass(input).error.code, 'BUSY');
  assert.equal(metrics.writes, 0);
});

test('failure during audit write compensates class write and does not report success', () => {
  const { api, faults } = backend();
  faults.failWriteAt = 2;
  assert.equal(api.createClass(input).error.code, 'WRITE_FAILED');
  assert.equal(ok(api.listClasses({ q: '8 A' })).length, 0);
});

test('unconfirmed compensation gives explicit recovery-required error', () => {
  const { api, faults, metrics } = backend();
  faults.failWriteAt = 2;
  faults.persistentWriteFailure = true;
  assert.equal(api.createClass(input).error.code, 'RECOVERY_REQUIRED');
  assert.equal(metrics.locked, false);
});

test('all affected tab headers are validated before class content write', () => {
  const { api, tables, metrics } = backend();
  tables.get('AuditLog')[0][0] = 'wrong';
  assert.equal(api.createClass(input).error.code, 'SCHEMA_MISMATCH');
  assert.equal(metrics.writes, 0);
});

test('admin options omit email and teacher cannot receive the account directory', () => {
  const { api } = backend();
  const options = ok(api.getRosterOptions());
  assert.equal(options.years.length, 2);
  assert.equal(options.teachers.length, 2);
  assert.ok(!JSON.stringify(options).includes('example.test'));
});
