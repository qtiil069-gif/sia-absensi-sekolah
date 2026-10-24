import test from 'node:test';
import assert from 'node:assert/strict';
import { backend, schema } from './helpers/backend.mjs';
import { readFileSync } from 'node:fs';

const ok = (value) => { assert.equal(value.ok, true, JSON.stringify(value)); return value.data; };
const key = { classId: 'K1', date: '2026-10-24', kind: 'HARIAN', subjectId: '' };
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=';

test('v2 only adds a profile tab; every legacy header is identical', () => {
  const old = JSON.parse(readFileSync(new URL('../database/migrations/001-schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.version, 2);
  for (const [name, headers] of Object.entries(old.sheets)) assert.deepEqual(schema.sheets[name], headers);
  assert.equal(Object.keys(schema.sheets).length, Object.keys(old.sheets).length + 1);
});

test('migration verifies full backup before adding profile tab; repeat is a no-op', () => {
  const { api, tables, metrics, backups } = backend();
  tables.delete('ProfilSiswa');
  const before = JSON.stringify([...tables]);
  assert.equal(ok(api.getStage3Status()).ready, false);
  assert.equal(ok(api.migrateStage3()).changed, true);
  assert.equal(JSON.stringify([...tables].filter(([name]) => name !== 'ProfilSiswa')), before);
  assert.equal(JSON.stringify([...backups[0].tables]), before);
  assert.equal(ok(api.migrateStage3()).changed, false);
  assert.equal(metrics.backups, 1);
  assert.equal(metrics.unlockedWrites, 0);
});

test('failed/mismatching backup and malformed headers do not change old data', () => {
  for (const fault of ['backupFailure', 'backupMismatch']) {
    const { api, tables, faults } = backend(); tables.delete('ProfilSiswa'); faults[fault] = true;
    const before = JSON.stringify([...tables]);
    assert.equal(api.migrateStage3().ok, false);
    assert.equal(JSON.stringify([...tables]), before);
  }
  const { api, tables, metrics } = backend(); tables.delete('ProfilSiswa'); tables.get('Kelas')[0][0] = 'wrong';
  assert.equal(api.migrateStage3().error.code, 'SCHEMA_MISMATCH');
  assert.equal(metrics.backups, 0);
});

test('teacher cannot access school settings or migration, even with forged payload', () => {
  const { api, metrics } = backend({ email: 'guru@example.test' });
  for (const method of ['getSchoolSettings', 'updateSchoolSettings', 'getStage3Status', 'migrateStage3']) assert.equal(api[method]({ role: 'ADMIN_KEPALA_SEKOLAH' }).error.code, 'FORBIDDEN');
  assert.equal(metrics.writes, 0);
});

test('school settings preserve unrelated keys, validate logo and protect stale revision', () => {
  const { api, tables } = backend();
  const old = ok(api.getSchoolSettings());
  const result = ok(api.updateSchoolSettings({ name: 'Sekolah Baru', address: 'Alamat Sekolah', identity: 'NPSN 12345678', logo: photo, expectedRevision: old.revision }));
  assert.equal(result.logo, photo);
  assert.equal(result.name, 'Sekolah Baru');
  assert.equal(api.updateSchoolSettings({ name: result.name, logo: result.logo, address: result.address, identity: result.identity, expectedRevision: old.revision }).error.code, 'CONFLICT');
  assert.equal(tables.get('Pengaturan').filter((row) => row[0] === 'school_name').length, 1);
});

test('extended student fields save with profile and preserve old optional clients', () => {
  const { api } = backend();
  const created = ok(api.createStudent({ name: 'Profil Uji', nis: '005', nisn: '0123456789', classId: 'K1', guardianName: 'Wali Uji', guardianPhone: '+62 812-3456-7890', guardianRelation: 'Ibu', photo }));
  assert.equal(created.guardianPhone, '+6281234567890');
  assert.equal(created.photo, photo);
  const updated = ok(api.updateStudent({ id: created.id, name: 'Nama Baru', nis: '005', nisn: '0123456789', classId: 'K1', expectedRevision: created.revision }));
  assert.equal(updated.guardianName, 'Wali Uji');
  assert.equal(updated.photo, photo);
});

test('v1 old CRUD/read still works; profile/card writes require migration', () => {
  const { api, tables } = backend(); tables.delete('ProfilSiswa');
  assert.equal(ok(api.queryStudents()).total, 3);
  ok(api.createStudent({ name: 'Lama', nis: '009', classId: 'K1' }));
  assert.equal(api.createStudent({ name: 'Baru', nis: '010', classId: 'K1', photo }).error.code, 'MIGRATION_REQUIRED');
  assert.equal(api.prepareStudentCards({ classId: 'K1' }).error.code, 'MIGRATION_REQUIRED');
});

test('image/phone/formula payloads rejected without student or school writes', () => {
  const { api, metrics } = backend();
  for (const patch of [{ photo: 'data:image/svg+xml;base64,PHN2Zy8+' }, { photo: 'https://example.test/pupil.jpg' },
    { photo: 'data:image/png;base64,' + 'A'.repeat(40000) }, { guardianPhone: '=IMPORTXML()' }, { guardianName: '=HYPERLINK()' }]) {
    assert.equal(api.createStudent({ name: 'Uji', nis: 'NEW', classId: 'K1', ...patch }).ok, false);
  }
  assert.equal(metrics.writes, 0);
});

test('card tokens unique and stable on reprint; latest school settings used', () => {
  const { api } = backend();
  const a = ok(api.prepareStudentCards({ studentIds: ['S1', 'S2'] }));
  assert.notEqual(a.cards[0].qr, a.cards[1].qr);
  assert.ok(!a.cards[0].qr.includes('Siswa'));
  const settings = ok(api.getSchoolSettings());
  ok(api.updateSchoolSettings({ name: 'Nama Terkini', logo: photo, address: 'Alamat', identity: '', expectedRevision: settings.revision }));
  const b = ok(api.prepareStudentCards({ classId: 'K1' }));
  assert.equal(a.cards[0].qr, b.cards[0].qr);
  assert.equal(b.school.name, 'Nama Terkini');
  assert.equal(b.school.logo, photo);
});

test('teacher cards/export scoped to assignment; inactive and foreign pupils denied', () => {
  const { api } = backend({ email: 'guru@example.test' });
  assert.equal(ok(api.prepareStudentCards({ classId: 'K1' })).cards.length, 1);
  assert.equal(api.prepareStudentCards({ studentIds: ['S2'] }).error.code, 'FORBIDDEN');
  assert.equal(api.prepareStudentCards({ studentIds: ['S3'] }).error.code, 'FORBIDDEN');
  assert.equal(ok(api.exportStudentData({})).rows.length, 1);
  assert.equal(api.exportStudentData({ classId: 'K2' }).error.code, 'FORBIDDEN');
});

test('QR validation requires confirmation; one-student save preserves others and rejects duplicates', () => {
  const { api, tables } = backend();
  const card = ok(api.prepareStudentCards({ studentIds: ['S1'] })).cards[0];
  const oldCount = tables.get('Absensi').length;
  const resolved = ok(api.validateStudentQr({ ...key, qr: card.qr }));
  assert.equal(resolved.student.id, 'S1');
  assert.equal(tables.get('Absensi').length, oldCount); // Preview never writes attendance.
  const saved = ok(api.saveQrAttendance({ ...key, qr: card.qr, expectedRevision: resolved.expectedRevision }));
  assert.equal(saved.summary.H, 1);
  assert.equal(api.saveQrAttendance({ ...key, qr: card.qr, expectedRevision: resolved.expectedRevision }).error.code, 'DUPLICATE');
  assert.equal(tables.get('Absensi').length, oldCount + 1);
});

test('QR rejects forged, inactive, foreign-class, wrong subject and stale confirmation', () => {
  const { api, tables } = backend({ email: 'guru@example.test' });
  const qr = ok(api.prepareStudentCards({ studentIds: ['S1'] })).cards[0].qr;
  assert.equal(api.validateStudentQr({ ...key, qr: 'SIA-ID:1:00000000-0000-0000-0000-000000000000' }).error.code, 'FORBIDDEN');
  assert.equal(api.validateStudentQr({ ...key, classId: 'K2', qr }).error.code, 'FORBIDDEN');
  const confirmed = ok(api.validateStudentQr({ ...key, qr }));
  tables.get('Siswa')[1][4] = false;
  assert.equal(api.saveQrAttendance({ ...key, qr, expectedRevision: confirmed.expectedRevision }).error.code, 'FORBIDDEN');
});

test('QR save failure compensates session and attendance, never returns success', () => {
  const { api, faults, metrics } = backend();
  const qr = ok(api.prepareStudentCards({ studentIds: ['S1'] })).cards[0].qr;
  const validated = ok(api.validateStudentQr({ ...key, qr }));
  faults.failWriteAt = metrics.writes + 2;
  assert.equal(api.saveQrAttendance({ ...key, qr, expectedRevision: validated.expectedRevision }).error.code, 'WRITE_FAILED');
  assert.equal(ok(api.getAttendance(key)).sessionId, null);
});

test('QR confirmation is bound to the displayed identity, date and subject assignment', () => {
  const { api, tables } = backend({ email: 'guru@example.test', overrides: {
    Mapel: [{ subject_id: 'M1', nama: 'Mapel 1', aktif: true }, { subject_id: 'M2', nama: 'Mapel 2', aktif: true }],
    PenugasanGuru: [{ assignment_id: 'P1', user_id: 'U2', class_id: 'K1', subject_id: 'M1', aktif: true }]
  } });
  const qr = ok(api.prepareStudentCards({ studentIds: ['S1'] })).cards[0].qr;
  const approved = ok(api.validateStudentQr({ ...key, qr }));
  assert.equal(api.validateStudentQr({ ...key, kind: 'MAPEL', subjectId: 'M2', qr }).error.code, 'FORBIDDEN');
  assert.equal(api.saveQrAttendance({ ...key, date: '2026-10-25', qr, expectedRevision: approved.expectedRevision }).error.code, 'CONFLICT');
  tables.get('Siswa')[1][3] = 'Identitas Diubah';
  assert.equal(api.saveQrAttendance({ ...key, qr, expectedRevision: approved.expectedRevision }).error.code, 'CONFLICT');
});

test('initializer refuses to upgrade an existing v1 database without a verified migration backup', () => {
  const { api, tables, metrics } = backend(); tables.delete('ProfilSiswa');
  const before = JSON.stringify([...tables]);
  assert.throws(() => api.initializeDatabase_(), { code: 'MIGRATION_REQUIRED' });
  assert.equal(JSON.stringify([...tables]), before);
  assert.equal(metrics.writes, 0);
});


test('failed profile/membership write restores old student and profile data', () => {
  const { api, faults, metrics } = backend();
  faults.failWriteAt = 3;
  assert.equal(api.createStudent({ name: 'Gagal Profil', nis: 'FAILED', classId: 'K1', guardianName: 'Wali', photo }).error.code, 'WRITE_FAILED');
  assert.equal(ok(api.queryStudents({ q: 'FAILED', status: 'all' })).total, 0);
  assert.equal(api.profileRows_({ book: api.openDatabase_(), cache: {} }, true).length, 0);
  assert.equal(metrics.locked, false);
});
