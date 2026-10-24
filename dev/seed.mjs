import { backend } from './sheets-runtime.mjs';

// Fictional school and accounts; no real student or Google credentials.
export function createDemo(role, legacy = false) {
  const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
  const classes = Array.from({ length: 8 }, (_, i) => ({ class_id: `DEMO-K${i + 1}`, nama: `${Math.floor(i / 2) + 7} ${i % 2 ? 'B' : 'A'}`,
    tingkat: Math.floor(i / 2) + 7, year_id: 'DEMO-2026', wali_user_id: i === 0 ? 'DEMO-GURU' : '', aktif: true }));
  const pupils = classes.flatMap((room, c) => Array.from({ length: 36 }, (_, i) => ({ student_id: `DEMO-S${c * 36 + i + 1}`,
    nama: `Siswa Contoh ${String(c * 36 + i + 1).padStart(3, '0')}`, nis: `CONTOH-${String(c * 36 + i + 1).padStart(3, '0')}`,
    nisn: '', aktif: true, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' })));
  const members = pupils.map((pupil, i) => ({ enrollment_id: `DEMO-E${i + 1}`, student_id: pupil.student_id,
    class_id: classes[Math.floor(i / 36)].class_id, aktif: true }));
  const sessions = days.flatMap((date, day) => classes.map((room, c) => ({ session_id: `DEMO-X${day}-${c}`, class_id: room.class_id,
    tanggal: date, jenis: 'HARIAN', subject_id: '', created_by: 'DEMO-ADMIN', created_at: `${date}T00:00:00Z` })));
  const attendance = sessions.flatMap((session, i) => {
    const c = i % 8;
    const missing = (Math.floor(i / 8) + c) % 4 + 1;
    return pupils.slice(c * 36, c * 36 + 36).map((pupil, j) => ({ attendance_id: `DEMO-A${i}-${j}`, session_id: session.session_id,
      student_id: pupil.student_id, status: j < 36 - missing ? 'H' : j < 38 - missing ? 'S' : 'I', catatan: '', recorded_by: 'DEMO-ADMIN', updated_at: `${session.tanggal}T00:00:00Z` }));
  });
  const runtime = backend({ email: role === 'guru' ? 'guru@example.test' : 'admin@example.test', overrides: {
    Pengaturan: [{ key: 'school_name', value: 'Sekolah Contoh · Demo' }, { key: 'semester_label', value: 'Semester Ganjil · 2026/2027' }],
    Pengguna: [
      { user_id: 'DEMO-ADMIN', email: 'admin@example.test', nama: 'Admin Kepala Sekolah', role: 'ADMIN_KEPALA_SEKOLAH', aktif: true },
      { user_id: 'DEMO-GURU', email: 'guru@example.test', nama: 'Guru Contoh', role: 'GURU', aktif: true }
    ],
    TahunAjaran: [{ year_id: 'DEMO-2026', nama: '2026/2027', aktif: true }],
    Kelas: classes, Siswa: pupils, KeanggotaanKelas: members,
    PenugasanGuru: [{ assignment_id: 'DEMO-P1', user_id: 'DEMO-GURU', class_id: 'DEMO-K1', subject_id: 'DEMO-M1', aktif: true }],
    Mapel: [{ subject_id: 'DEMO-M1', nama: 'Matematika', aktif: true }],
    SesiAbsensi: sessions, Absensi: attendance,
    Jurnal: sessions.map((session, i) => ({ journal_id: `DEMO-J${i}`, class_id: session.class_id, tanggal: session.tanggal, teacher_user_id: 'DEMO-GURU' }))
  } });
  if (legacy) runtime.tables.delete('ProfilSiswa');
  runtime.api.today_ = () => '2026-10-23';
  return runtime.api;
}
