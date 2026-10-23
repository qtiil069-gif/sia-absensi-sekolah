# Kontrak backend — tahap 2

Transport tetap `google.script.run`, bukan REST. `doGet()` hanya merender shell. Semua RPC data memvalidasi email dari `Session.getActiveUser()` terhadap akun aktif/unik di Pengguna, lalu memeriksa role dan cakupan. Helper berakhiran `_` tidak dapat dipanggil via RPC. Initializer tetap helper manual yang hanya dapat dijalankan pemilik/editor proyek.

```js
{ ok: true, data: /* DTO */ }
{ ok: false, error: { code: 'FORBIDDEN', message: 'Pesan aman berbahasa Indonesia' } }
```

Kegagalan platform/transport dapat masuk `withFailureHandler`. Error internal tidak mengirim ID spreadsheet, stack trace, atau pesan layanan mentah. Penulisan tidak diulang otomatis. Field payload yang tidak dikenal pada API operasional ditolak; role/pencatat tidak boleh dikirim klien.

## API fondasi yang dipertahankan

| Fungsi | Kontrak |
| --- | --- |
| `getBootstrap()` | `{user:{id,name,role},school:{name,semester},today,timeZone,classes}`; tidak mengirim direktori email |
| `getDashboard({date?,classId?})` | Bentuk stats/composition/weekly tetap seperti fondasi; tanggal ISO valid, 7 hari Senin–Minggu, rate null bila tanpa catatan |
| `listClasses({q?,status?,yearId?,level?})` | `Class[]`, default aktif. q nama kelas; status active/inactive/all (dua terakhir admin); guru hanya kelas aktif wali/penugasan |
| `listStudents({classId?})` | Array DTO lama `{id,name,nis,classIds}`, siswa/keanggotaan aktif sesuai cakupan. Dipertahankan untuk kompatibilitas, UI baru memakai queryStudents |

```ts
type Class = {
  id: string; name: string; level: number | string; yearId: string;
  homeroomId: string; active: boolean; revision: string;
};
```

## Master kelas — khusus admin

| Fungsi | Input | Output data |
| --- | --- | --- |
| `getRosterOptions()` | Tidak ada | `{years:[{id,name,active}],teachers:[{id,name}]}` tanpa email |
| `createClass(input)` | `{name,level:number,yearId,homeroomId?:string}` | Class |
| `updateClass(input)` | Field create + `{id,expectedRevision}` | Class |
| `deactivateClass(input)` | `{id,expectedRevision}` | Class dengan active=false |

Nama unik per tahun termasuk nonaktif. Tingkat integer 1–12, tahun ajaran harus ada, penetapan tahun baru harus aktif. Wali opsional dari akun aktif dengan role sah. Tidak ada hard delete atau endpoint mengubah role.

## Master siswa

`queryStudents({q?,classId?,status?,page?,pageSize?})` mengembalikan:

```ts
type Student = {
  id: string; name: string; nis: string; active: boolean; classIds: string[];
  nisn?: string; revision?: string; // hanya admin
};
type StudentPage = { items: Student[]; total: number; page: number; pageSize: number; pages: number };
```

q mencari nama/NIS. Default page=1, pageSize=25; pageSize hanya 10/25/50/100. page integer 1–10000; melewati halaman terakhir dikembalikan ke halaman terakhir. Status active/inactive/all, dua terakhir admin. Guru hanya menerima siswa aktif serta classIds dalam kelas aktif yang diizinkan; memilih kelas lain menghasilkan FORBIDDEN. Admin juga dapat menemukan siswa tanpa kelas dan kelas nonaktif.

| Fungsi admin | Input | Output data |
| --- | --- | --- |
| `createStudent(input)` | `{name,nis,nisn?:string,classId}` | Student lengkap + revision |
| `updateStudent(input)` | Field create + `{id,expectedRevision}` | Student lengkap + revision |
| `deactivateStudent(input)` | `{id,expectedRevision}` | Student dengan active=false |

NIS berupa teks unik tanpa membedakan kapital/trim, termasuk nonaktif. NISN kosong atau 10 digit. Kelas tujuan aktif. Pindah kelas menonaktifkan keanggotaan lama dan menambah keanggotaan; riwayat tidak dihapus. ID generated oleh server. classIds dan revision mencakup keanggotaan saat ini, sehingga perubahan roster invalidates form lama.

## Absensi

`getAttendanceOptions({classId})` → `{subjects:[{id,name}]}`, hanya mapel aktif. Guru mendapat mapel dengan penugasan aktif user+kelas+mapel yang cocok. Cakupan kelas diperiksa bahkan untuk request opsi.

```ts
type AttendanceKey = { classId: string; date: string; kind?: 'HARIAN'|'MAPEL'; subjectId?: string };
type Attendance = {
  classId: string; date: string; kind: 'HARIAN'|'MAPEL'; subjectId: string;
  sessionId: string|null; revision: string;
  entries: {studentId:string; name:string; nis:string; status:'H'|'S'|'I'|'A'|null; note:string}[];
  summary: {H:number;S:number;I:number;A:number;pending:number};
  retainedCount: number;
};
```

- `getAttendance(key)` → Attendance. kind default HARIAN, subjectId kosong untuk harian, wajib untuk MAPEL. Tanggal ISO valid. Memakai script lock agar pembacaan revision tidak menyela penulisan absensi pada proyek yang sama.
- `saveAttendance({...key,expectedRevision,entries:[{studentId,status,note?}]})` → Attendance terbaru. Wajib seluruh roster aktif, 1–500 siswa; tidak boleh duplikat, siswa asing, atau status kosong. Note maksimal 500 karakter. Roster berubah atau revision lama → CONFLICT sebelum penulisan.
- Session identity unik kelas+tanggal+jenis+mapel. Satu sesi MAPEL per mapel per hari; belum mendukung slot jam. Duplikasi/jenis malformed pada data lama ditolak, tidak diperbaiki diam-diam.
- Guru dapat membaca/menulis HARIAN pada kelas aktif wali/penugasan; MAPEL juga memerlukan penugasan mapel spesifik. Admin dapat mengelola semua kelas/mapel aktif. Semua edit memakai aturan cakupan yang sama, tidak bergantung pada role atau created_by kiriman frontend.
- Server menentukan UUID baru, pencatat, timestamp, dan audit. Update menggunakan ID/baris yang sama, menyimpan catatan historis di luar roster tanpa mengirim nama/ID siswa historis itu ke form.

## Versioning, lock, dan kegagalan tulis

`revision` adalah hash SHA-256 snapshot; `expectedRevision` harus cocok pada edit/nonaktif/absensi. Token ini bukan pengganti autentikasi. Lock diperoleh sebelum validasi ulang akun dan data; timeout 10 detik menghasilkan BUSY. Semua rencana tulis memvalidasi header tab terkait, lalu menulis rentang baris secara bulk dan append AuditLog. Snapshot rentang digunakan untuk kompensasi bila setValues/flush gagal. SpreadsheetApp tidak menyediakan transaksi atomik lintas tab; lihat [operasional.md](operasional.md) untuk batas pemulihan.

| Kode | Arti/tindakan |
| --- | --- |
| UNAUTHENTICATED / FORBIDDEN | Akun/role/cakupan tidak diizinkan; tidak ada fallback identitas klien |
| CONFIG_REQUIRED | Script Property spreadsheet belum tersedia |
| SCHEMA_MISMATCH / DATA_INVALID | Header atau data lama tidak valid/duplikat; administrator perlu memeriksa |
| INVALID_ARGUMENT | Payload, teks, tanggal, NISN, ID, status, pagination, atau revision salah |
| NOT_FOUND | Referensi master atau target tidak ditemukan |
| DUPLICATE | Nama kelas-tahun atau NIS sudah dipakai |
| CONFLICT | Snapshot data berubah; muat ulang dan rekonsiliasi |
| BUSY | Lock sedang dipakai |
| WRITE_FAILED | Penulisan gagal dan upaya kompensasi selesai tanpa error; muat ulang untuk memastikan keadaan |
| RECOVERY_REQUIRED | Pemulihan belum terkonfirmasi; hentikan input dan minta pemeriksaan administrator |
| INTERNAL | Kegagalan layanan lain atau pembacaan ulang; jangan menganggap data belum tersimpan |

Semua teks divalidasi server; awalan formula (=,+,-,@ setelah trim) dan karakter kontrol ditolak. UI memasukkan data ke textContent/value, bukan innerHTML. Identitas Google, sharing file, kuota, dan pemulihan pada layanan sesungguhnya tetap memerlukan uji integrasi; tes lokal tidak membuktikan kesiapan produksi.
