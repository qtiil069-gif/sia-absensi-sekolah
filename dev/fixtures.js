/* Synthetic UI fixtures, included ONLY in .preview/index.html by the build. */
(() => {
  const today = '2026-10-23';
  const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', today];
  const classes = Array.from({ length: 8 }, (_, index) => ({
    id: `DEMO-K${index + 1}`, name: `${Math.floor(index / 2) + 7} ${index % 2 ? 'B' : 'A'}`,
    level: Math.floor(index / 2) + 7, yearId: 'DEMO-2026'
  }));
  const students = classes.flatMap((room, index) => Array.from({ length: 36 }, (_, i) => ({
    id: `DEMO-S${index * 36 + i + 1}`, nis: `CONTOH-${String(index * 36 + i + 1).padStart(3, '0')}`,
    name: `Siswa Contoh ${String(index * 36 + i + 1).padStart(3, '0')}`, classIds: [room.id]
  })));
  function summary(date, selected) {
    const counts = { H: 0, S: 0, I: 0, A: 0 };
    if (days.includes(date)) selected.forEach((room) => {
      const i = classes.findIndex((item) => item.id === room.id);
      const missing = (days.indexOf(date) + i) % 4 + 1;
      counts.H += 36 - missing;
      counts.S += Math.min(missing, 2);
      counts.I += Math.max(0, missing - 2);
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total, rate: total ? Math.round(counts.H / total * 100) : null };
  }
  window.SIA_DEMO = {
    async call(name, args = {}) {
      const selected = args.classId ? classes.filter((item) => item.id === args.classId) : classes;
      if (name === 'getBootstrap') return {
        user: { id: 'DEMO-ADMIN', name: 'Admin Kepala Sekolah', role: 'ADMIN_KEPALA_SEKOLAH' },
        school: { name: 'Sekolah Contoh · Demo', semester: 'Semester Ganjil · 2026/2027' },
        today, timeZone: 'Asia/Jakarta', classes: structuredClone(classes)
      };
      if (name === 'listClasses') return structuredClone(classes);
      if (name === 'listStudents') return structuredClone(students.filter((item) => selected.some((room) => item.classIds.includes(room.id))));
      if (name !== 'getDashboard') throw new Error('Fungsi demo tidak tersedia.');
      const date = args.date || today;
      const composition = summary(date, selected);
      const start = new Date(`${date}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
      return {
        date, scope: args.classId ? `Kelas ${selected[0].name} · data contoh` : 'Seluruh kelas · data contoh',
        stats: { students: selected.length * 36, classes: selected.length, attendanceRate: composition.rate,
          sessions: composition.total ? selected.length : 0, journals: composition.total ? selected.length : 0 },
        composition,
        weekly: Array.from({ length: 7 }, (_, i) => {
          const day = new Date(start);
          day.setUTCDate(day.getUTCDate() + i);
          const value = day.toISOString().slice(0, 10);
          const result = summary(value, selected);
          return { date: value, rate: result.rate, total: result.total };
        })
      };
    }
  };
})();
