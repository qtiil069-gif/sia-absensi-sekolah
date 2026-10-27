# SIA Absensi Sekolah — tahap 3

Aplikasi berbahasa Indonesia berbasis **Google Apps Script HTML Service dan Google Sheets**, dengan build untuk clasp. Dashboard mengikuti `docs/dashboard-reference.jpeg`: sidebar hijau pastel, banner peach, kartu statistik pastel, grafik batang/donat, dan tampilan responsif.

Navigasi memakai SPA dengan state di memori agar menu tetap berada dalam iframe HtmlService tanpa mengubah URL panel. Audit, regresi iframe, serta petunjuk memperbarui deployment yang sudah ada tersedia pada [perbaikan navigasi HtmlService](docs/navigation-htmlservice.md).

Investigasi /dev yang masih MEMUAT: [mode diagnostik admin baca-saja](docs/render-diagnostics.md) membandingkan build, sumber HtmlService, hasil template dan core DOM. Query opt-in `?diagnostic=render` menyediakan laporan unduhan/salin tanpa JavaScript di Console. Paket diagnostik berisi 27 file; mode normal dan fitur operasional tetap sama. Penyebab Google belum terkonfirmasi oleh pengujian lokal.

Bootstrap kini terpisah dari pustaka PDF/Excel/QR: HTML awal sekitar 71 KB, pustaka dimuat saat diperlukan melalui RPC berotorisasi dan diverifikasi ukuran/SHA-256 sebelum dijalankan. Paket saat ini berisi **27 file**, termasuk tiga Asset_*.html, manifest integritas dan diagnostik opt-in. Lihat [audit Base64, isolasi kegagalan, dan verifikasi /dev serta /exec](docs/htmlservice-bundle.md); tidak ada migrasi atau perubahan ID untuk perbaikan ini.

Validasi lokal 26 Oktober 2026: **93 tes backend/build + 49 tes browser lulus**. Periksa ukuran/hash/sintaks artefak dengan `node scripts/audit-htmlservice.mjs`; tambahkan path file VM sebagai argumen untuk membandingkan salinan DevTools tanpa mengeksekusinya.

Implementasi mengikuti [rencana dan panduan Tahap 3](docs/stage-3.md). Kartu ID berada di Data Siswa, scan QR di tab Absensi Siswa, dan hanya Pengaturan Sekolah ditambahkan ke sidebar.

Modul yang telah diimplementasikan dan diuji lokal:

- **Data Kelas:** baca, pencarian/filter, tambah, edit, nonaktif. Mutasi hanya Admin Kepala Sekolah; Guru hanya melihat kelas wali/penugasan aktif.
- **Data Siswa:** baca, tambah, edit, nonaktif, pindah kelas, validasi NIS unik (termasuk siswa nonaktif), pencarian nama/NIS, filter kelas/status dan pagination server.
- **Absensi Siswa:** tanggal/kelas/sesi harian atau mapel, roster aktif, H/S/I/A dan catatan, simpan/edit, ringkasan, pencegahan duplikasi, script lock dan revision untuk konflik data.
- **Pengaturan Sekolah:** identitas/logo/alamat khusus admin dan migrasi dengan backup terverifikasi.
- **Kartu dan ekspor:** popup preview kartu individual/per kelas portrait 54 × 85,6 mm, PDF kartu, dan ekspor data Excel/PDF. Foto/wali/telepon/hubungan ditangani melalui Data Siswa.
- **QR:** kamera/USB/kode, validasi backend dan popup identitas sebelum Konfirmasi Hadir, pencegahan duplikasi dan pelepasan kamera.
- **Dashboard:** statistik dan grafik tetap tersedia; pilihan kelas dimuat ulang agar perubahan master terlihat.

**Batas validasi:** kode operasional diuji terhadap runtime Apps Script/Sheets dalam memori dan browser Chromium. Perubahan tahap 3 belum dikirim atau diuji pada Google nyata dari cloud ini. Belum ada jaminan keamanan/kesiapan produksi. Workspace, identitas Google, izin file Sheets langsung, kuota dan pemulihan jaringan tetap perlu diuji. Modul nilai/leger, jurnal, akun guru, dan laporan menampilkan **Fitur dalam pengembangan**.

## Menjalankan dan menguji

Node.js 24 LTS (`.nvmrc`), npm, dan Chromium untuk tes UI:

```sh
npm ci
npm run dev          # demo lokal pada port 4173, hanya loopback
npm run check        # build + backend/build tests + browser tests
npm run build        # dist/ untuk clasp, .preview/ untuk demo
```

Gunakan `npm --cache /tmp/sia-npm-cache ci` bila cache home tidak writable. Konfigurasi tes memakai Chromium sistem bila tersedia; alternatifnya `npx playwright install chromium` atau `CHROMIUM_PATH`.

Hasil lokal 24 Oktober 2026: **79 tes backend/build + 37 tes browser lulus**, dan build final berhasil (19 file clasp). Rincian serta batas validasinya ada pada [hasil Tahap 3](docs/stage-3.md#hasil-validasi-lokal--24-oktober-2026).

Demo memakai backend `.gs` yang sama dengan database **sintetis dalam memori**, terisolasi per sesi browser. Data awal 288 siswa contoh, 8 kelas, tanggal 19–23 Oktober 2026. Perubahan demo bertahan selama sesi server dan tidak pernah ditulis ke Google. Mulai ulang server atau sesi demo untuk reset. Pilihan lokal `?demo=teacher` menguji tampilan guru dengan satu kelas; ini hanya mekanisme demo, bukan mekanisme autentikasi aplikasi Google. `.preview/index.html` memerlukan server demo, bukan file HTML mandiri.

## Struktur

```text
database/schema.json             # skema v2: 15 tab lama + ProfilSiswa
database/migrations/001-schema.json # snapshot header v1
src/
  appsscript.json                 # manifest yang sudah ada dipertahankan
  backend/
    01_Config.gs / 02_Validation.gs
    10_Sheets.gs / 11_Writes.gs   # bulk read/write, snapshot, kompensasi, audit
    20_Auth.gs                   # identitas Google dan role server
    21_Classes.gs                # master kelas
    22_Students.gs               # master siswa dan keanggotaan
    23_Attendance.gs             # absensi harian/mapel
    24_School.gs / 25_CardsQr.gs  # sekolah, kartu, QR, ekspor
    41_Migration.gs              # backup dan migrasi aman
    30_Dashboard.gs / 40_Setup.gs / 90_Api.gs
  frontend/
    index.html / styles.css / app.js
    lib/                         # DOM aman dan komponen form
    services/api.js              # google.script.run, tanpa fallback dummy
    components/                  # tabel dan grafik reusable
    pages/                       # classes.js, students.js, attendance.js, settings.js
dev/                             # transport demo, seed sintetis, runtime mock
scripts/                         # build.mjs dan preview.mjs
tests/                           # backend, build, dan alur browser
docs/                            # audit, panduan operasional, skema, API, instalasi
.clasp.json.example / .claspignore
package.json / package-lock.json / playwright.config.mjs
dist/                            # generated, diabaikan Git
.preview/                        # generated, diabaikan Git
```

## Memperbarui proyek Apps Script yang sudah ada

**Jangan mengganti Script ID atau APP_SPREADSHEET_ID.** Tahap 3 menambah satu tab melalui migrasi dengan backup: setelah review dan push ke proyek pengembangan, Admin memilih Pengaturan Sekolah → Siapkan database Tahap 3. Jangan memakai initializer/reset pada database lama. Pertahankan `.clasp.json` lokal dan Script Properties yang telah bekerja. Tinjau manifest terhadap konfigurasi deployment aktual sebelum push.

```sh
npm run check
npm run build
npm run clasp:status
npm run clasp:push     # menjalankan clasp push ke proyek terhubung, bukan deploy
```

Perintah di atas adalah petunjuk untuk pengembang; tidak dijalankan otomatis terhadap Google pada pekerjaan tahap 3. Push mengubah sumber proyek tujuan dan memerlukan login clasp pada mesin tepercaya. Jangan commit `.clasp.json`, `.clasprc.json`, token, credential, data pribadi sekolah, node_modules, dist, atau hasil pengujian. Manifest di repo masih memiliki default pengembangan privat MYSELF/USER_ACCESSING; jangan mengganti kebijakan deployment tanpa meninjau implikasi identitas/izin data.

Dokumentasi: [Tahap 3 dan migrasi](docs/stage-3.md), [audit awal](docs/stage-2-audit.md), [panduan operasional dan role](docs/operasional.md), [instalasi](docs/installation.md), [rancangan database](docs/database.md), [kontrak API](docs/backend-contracts.md), serta [pengujian dan checklist Google](docs/testing.md).

## Keutuhan data

Tidak ada hard delete atau dummy seed pada Google. Nonaktif mempertahankan baris dan riwayat. NIS unik mencakup seluruh siswa. Absensi harian unik per kelas/tanggal; mapel unik per kelas/tanggal/mapel (belum multi-slot). Revision menolak form lama, dan mutasi memakai script lock, validasi ulang, AuditLog, serta upaya kompensasi jika penulisan gagal. **SpreadsheetApp bukan transaksi atomik**: error pemulihan memerlukan pemeriksaan admin, dan izin file langsung/script lain tetap berada di luar pembatasan UI dan lock aplikasi.
