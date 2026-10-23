# Kontrak backend v1 — baca saja

Transport: `google.script.run.withSuccessHandler(...).withFailureHandler(...)`. Tidak ada REST endpoint atau autentikasi password. `doGet()` hanya merender shell HTML tanpa data sekolah. Data diambil melalui RPC setelah pemeriksaan server.

Semua fungsi data mengembalikan salah satu bentuk berikut:

```js
{ ok: true, data: /* DTO di bawah */ }
{ ok: false, error: { code: 'FORBIDDEN', message: 'Pesan aman dalam bahasa Indonesia' } }
```

Kegagalan transport/platform tetap dapat masuk `withFailureHandler`; frontend menanganinya terpisah. DTO hanya berisi tipe JSON, tidak pernah objek `Date` Sheets. Email pengguna aktif diambil dari `Session.getActiveUser().getEmail()`, lalu dicocokkan ke `Pengguna`. Input klien tidak menentukan identitas, role, atau ID pengguna otorisasi.

## `getBootstrap()`

```ts
type Bootstrap = {
  user: { id: string; name: string; role: 'ADMIN_KEPALA_SEKOLAH' | 'GURU' };
  school: { name: string; semester: string };
  today: string;       // YYYY-MM-DD pada timezone proyek
  timeZone: string;
  classes: Class[];
};
type Class = { id: string; name: string; level: number | string; yearId: string };
```

Sekolah dan semester berasal dari Pengaturan; nilai default hanya label generik, bukan data sekolah rekaan. Daftar kelas tunduk pada role. Tabel pengguna dan email tidak dikirim ke browser.

## `listClasses()`

Mengembalikan `Class[]`, hanya kelas aktif. Admin membaca semua kelas aktif. Guru membaca kelas dengan `wali_user_id` dirinya atau PenugasanGuru aktif miliknya. Tidak ada endpoint publik untuk menulis role atau memberikan penugasan.

## `listStudents({ classId?: string } = {})`

```ts
type Student = { id: string; name: string; nis: string; classIds: string[] };
// data: Student[]
```

Hanya siswa aktif dengan keanggotaan aktif pada kelas yang diizinkan. `classIds` juga dibatasi cakupan pengguna. `classId: ''` berarti seluruh kelas dalam cakupan. Kelas di luar cakupan atau ID tidak dikenal menghasilkan `FORBIDDEN`, bukan daftar siswa kelas lain. NISN dan data sensitif tambahan tidak dikirim. Pagination belum ada; target master 100–500 siswa.

## `getDashboard({ date?: string, classId?: string } = {})`

`date` harus tanggal kalender valid `YYYY-MM-DD`, default tanggal server; `classId` memakai aturan yang sama seperti daftar siswa. Angka berasal dari Sheets, tanpa fallback demo.

```ts
type Dashboard = {
  date: string;
  scope: string;
  stats: {
    students: number; classes: number; attendanceRate: number | null;
    sessions: number; journals: number;
  };
  composition: {
    counts: { H: number; S: number; I: number; A: number };
    total: number; rate: number | null;
  };
  weekly: { date: string; rate: number | null; total: number }[]; // 7 hari, Senin–Minggu
};
```

Definisi penyebut dan histori: [database.md](database.md). Kedua tipe sesi saat ini digabung. Jangan menggunakan angka ini sebagai laporan siswa unik resmi sebelum definisi absensi harian diputuskan.

## Kode error

| Kode | Arti |
| --- | --- |
| `UNAUTHENTICATED` | Google tidak menyediakan email aktif |
| `FORBIDDEN` | Akun tidak aktif/tidak unik, role salah, atau kelas di luar cakupan |
| `CONFIG_REQUIRED` | Script Property spreadsheet belum diisi |
| `SCHEMA_MISMATCH` | Tab hilang atau urutan/header tidak sesuai skema |
| `INVALID_ARGUMENT` | Tanggal atau tipe ID kelas salah |
| `DATA_INVALID` | Data absensi duplikat/status tidak valid pada pekan yang dibaca |
| `INTERNAL` | Kegagalan layanan internal/izin/kuota; pesan internal disembunyikan dari klien |

Helper internal (`rows_`, `authorize_`, `initializeDatabase_`, dll.) berakhiran `_` sehingga tidak dapat dipanggil lewat `google.script.run`. Initializer dijalankan manual dari editor oleh pengembang dan tidak membuat akun atau data dummy.

## Kontrak yang masih direncanakan

Belum ada RPC untuk menyimpan absensi, jurnal, nilai, membuat kelas/siswa, mengelola guru, atau mengekspor laporan. Jangan memanggil nama fungsi hipotetis dari klien. Tahap selanjutnya harus menetapkan DTO mutasi, validasi server, matriks izin admin/guru, lock/idempotensi, audit, dan pengujian negatif sebelum mengaktifkan formulir tulis.

Gerbang role awal sudah dapat diuji dengan mock. Ini **belum membuktikan autentikasi atau absensi aman untuk produksi**, terutama model berbagi spreadsheet, perilaku identitas pada deployment nyata, serta ketiadaan jalur mutasi yang teruji.
