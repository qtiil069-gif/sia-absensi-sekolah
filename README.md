# SIA Sekolah

Fondasi **Sistem Informasi Absensi Sekolah**, menggunakan Apps Script HTML Service, Google Apps Script, dan Google Sheets. Antarmuka berbahasa Indonesia untuk Admin Kepala Sekolah dan Guru, ditujukan untuk sekitar 100–500 siswa.

**Status: fondasi pengembangan, belum siap produksi.** Dashboard, pembacaan kelas/siswa, gerbang role awal, dan build clasp tersedia. Pencatatan absensi, perubahan akun, nilai, leger, jurnal, serta ekspor laporan **belum diimplementasikan**. Autentikasi dan isolasi data belum diuji pada deployment Google dan akun sekolah sesungguhnya.

## Mulai secara lokal

Gunakan Node.js 24 LTS (`.nvmrc`) dan npm:

```sh
npm ci
npm run dev
```

Server demo memakai port `4173` dan hanya bind ke loopback. Tidak perlu akun Google untuk demo. Mulai ulang server setelah mengubah sumber. Data dummy eksplisit bertanggal **23 Oktober 2026**, 288 siswa contoh dalam delapan kelas. Tanggal di luar pekan data contoh menampilkan keadaan tanpa catatan. Filter kelas/tanggal, pencarian menu, dan navigasi responsif dapat dicoba; demo tidak menyimpan data.

```sh
npm run build       # menghasilkan dist/ untuk clasp dan .preview/ untuk demo
npm test            # uji backend dengan mock Apps Script/Sheets dan uji build
npm run test:ui     # uji browser Chromium, termasuk layout responsif
npm run check       # build + seluruh pengujian di atas
```

Untuk uji browser, gunakan Chromium sistem atau `npx playwright install chromium`. Panduan lengkap: [Instalasi](docs/installation.md).

## Struktur proyek

```text
database/schema.json            # sumber kebenaran nama tab dan urutan kolom
dev/fixtures.js                 # data sintetis; hanya masuk build demo
docs/
  dashboard-reference.jpeg      # gambar referensi asli
  installation.md               # setup lokal, Sheets, Apps Script, clasp
  database.md                   # relasi, tipe, aturan, definisi metrik
  backend-contracts.md          # kontrak RPC dan batas otorisasi
  testing.md                    # cakupan uji dan checklist uji Google
scripts/
  build.mjs                     # flatten backend, kemas HTML Service
  preview.mjs                   # server demo lokal
src/
  appsscript.json               # V8, timezone, scopes, akses awal privat
  backend/
    01_Config.gs                # properti, tanggal, helper error
    10_Sheets.gs                # pembacaan bulk dan cakupan kelas/siswa
    20_Auth.gs                  # identitas Google + allowlist role awal
    30_Dashboard.gs             # agregasi dashboard
    40_Setup.gs                 # inisialisasi header manual, non-destruktif
    90_Api.gs                   # doGet, template, RPC publik
  frontend/
    index.html                  # kerangka HTML Service
    styles.css                  # sidebar hijau, peach, pastel, responsif
    app.js                      # controller routing dan state halaman
    lib/dom.js                  # utilitas DOM aman
    services/api.js             # adapter google.script.run / demo
    components/
      dashboard.js              # renderer statistik dan grafik
      table.js                  # tabel roster baca saja
tests/
  helpers/backend.mjs           # mock layanan Apps Script
  backend.test.mjs
  build.test.mjs
  ui/dashboard.spec.mjs
.clasp.json.example             # salin lokal; Script ID asli tidak dilacak
.claspignore
.nvmrc
package.json
package-lock.json
playwright.config.mjs
dist/                           # hasil build, diabaikan Git
  00_Schema.gs                  # dihasilkan dari database/schema.json
  01_Config.gs … 90_Api.gs
  Index.html / Styles.html / Scripts.html
  appsscript.json
.preview/index.html             # demo mandiri, diabaikan Git
```

## Batas implementasi

- Desain mengikuti [gambar referensi](docs/dashboard-reference.jpeg): sidebar hijau pastel, banner peach, empat kartu statistik, grafik batang dan donat. Ilustrasi dan ikon SVG lokal tanpa ketergantungan CDN.
- Paket `dist/` menggunakan `google.script.run`. **Tidak ada fallback otomatis ke data dummy** saat Google/Sheets tidak tersedia. Hanya `.preview/` yang menyertakan fixture.
- RPC baca memakai email dari `Session.getActiveUser()`, bukan email atau role kiriman klien. Guru dibatasi ke kelas wali/penugasan aktif; admin ke seluruh kelas aktif. Semua helper internal memakai akhiran `_`.
- Manifest awal `access: MYSELF`, `executeAs: USER_ACCESSING` untuk pengembangan privat. **Ini belum menjadi deployment banyak guru.** Pengguna yang mengakses sebagai dirinya sendiri memerlukan izin spreadsheet; izin file dapat membuka data mentah di luar pembatasan UI. Tinjau model akses sebelum penerapan sekolah.
- Tidak ada script `deploy` otomatis, write RPC, akun contoh yang ditanam ke Sheets, maupun kredensial di repositori.

Lanjutkan dengan [konfigurasi Google dan clasp](docs/installation.md), [rancangan database](docs/database.md), dan [kontrak backend](docs/backend-contracts.md). Uji Google, izin data, dan konkurensi mutasi wajib dilakukan sebelum mempertimbangkan penggunaan produksi.
