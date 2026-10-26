# Instalasi dan deployment pengembangan

## Paket HtmlService dengan pustaka terpisah

Build saat ini menghasilkan **24 file**: 17 .gs, 6 .html dan manifest. Tiga Asset_*.html berisi data pustaka statis, dan 00_BrowserAssets.gs memuat hash/ukuran yang harus cocok dengan core. Tinjau semua file melalui clasp status sebelum pemilik melakukan push manual. Tidak perlu migrasi atau mengganti ID/Script Properties untuk perbaikan bootstrap ini. Panduan /dev dan /exec: [isolasi bundle HtmlService](htmlservice-bundle.md). Bagian instalasi historis di bawah dapat menyebut jumlah file baseline lama.

## Pembaruan Tahap 3

Ikuti [panduan Tahap 3](stage-3.md) untuk perubahan terbaru. Setelah build/check dan peninjauan source, push hanya ke proyek yang sudah terhubung dengan ID yang sama. Pada deployment pengembangan, Admin membuka Pengaturan Sekolah → Siapkan database Tahap 3 untuk membuat backup terverifikasi dan menambah ProfilSiswa. Jangan reset, menghapus tab, atau menjalankan initializer untuk upgrade. Source tetap memakai scopes yang sudah ada; foto/logo kecil disimpan di Sheets tanpa file Drive publik.

Bagian tahap 2 di bawah adalah petunjuk historis. Pernyataan skema tidak berubah/tidak perlu migrasi hanya berlaku untuk tahap 2; tahap 3 menggunakan migrasi v1 → v2 di atas.


Untuk bug halaman putih saat klik menu HtmlService, ikuti [panduan navigasi dan pembaruan deployment](navigation-htmlservice.md). `clasp push` hanya mengubah source; deployment `/exec` yang dipin tetap memakai versi lama sampai pemilik memperbarui versi deployment secara manual. Script ID, Spreadsheet ID, dan skema tidak perlu diganti.

## Pembaruan tahap 2 pada proyek yang sudah berjalan

Gunakan proyek Apps Script, Script ID di `.clasp.json`, dan `APP_SPREADSHEET_ID` yang sudah berhasil dipakai. Jangan membuat proyek baru, menyalin template di atas konfigurasi lokal yang ada, atau mengganti ID. Skema v1 tetap identik; **jangan menjalankan reset/initializer atau migrasi ulang**. Cadangkan spreadsheet sebelum uji tulis pada layanan nyata dan gunakan salinan pengembangan bila tersedia.

```sh
npm ci
npm run check
npm run build
npm run clasp:status
npm run clasp:push
```

`clasp:push` membangun ulang lalu menjalankan `clasp push`; ini mengirim sumber, bukan membuat deployment produksi. Tinjau file yang akan dikirim dan manifest proyek aktual terlebih dahulu, khususnya bila access/executeAs diatur manual. Manifest repo dipertahankan pada pekerjaan ini. Tidak ada clasp push/deploy yang dijalankan oleh agen untuk tahap 2. Perubahan sumber belum diuji pada Google nyata dari cloud ini.

Tab TahunAjaran perlu berisi tahun nyata yang aktif sebelum Admin dapat menambah kelas; tambah baris tersebut manual bila masih kosong. Pengguna aktif, wali/penugasan dan mapel harus memakai ID stabil yang cocok. Panduan fitur: [operasional.md](operasional.md). Bagian berikut berlaku untuk pemasangan baru; **lewati pembuatan proyek dan inisialisasi jika lingkungan Anda sudah berjalan**.


## 1. Alat lokal/cloud

Prasyarat: Node.js **24 LTS**, npm, Git; Chromium untuk pengujian UI. `clasp` sudah dipin sebagai dev dependency, sehingga tidak perlu instalasi global.

Jalankan dari checkout proyek, misalnya `/workspace/sia-absensi-sekolah`:

```sh
nvm use                 # jika nvm tersedia
npm ci
npm run build
npm test
npm run test:ui
npm run dev
```

Jika Chromium tidak terpasang:

```sh
npx playwright install chromium
```

Konfigurasi tes otomatis memakai `/usr/bin/chromium` jika ada; `CHROMIUM_PATH` dapat menunjuk executable lain. Jika keduanya tidak ada, Playwright memakai browser hasil unduh. Dependensi OS Linux untuk browser dapat disiapkan sesuai panduan Playwright pada mesin milik administrator. Tidak ada unduhan browser saat aplikasi berjalan.

Cache npm pada cloud ini diarahkan ke direktori writable:

```sh
npm --cache /tmp/sia-npm-cache ci
```

`PORT=4180 npm run dev` mengganti port demo. Server ini hanya untuk pengembangan lokal, bukan server produksi atau pengganti Apps Script. Mulai ulang setelah perubahan sumber. Node tidak diperlukan oleh runtime Google.

Destinasi setup: `github.com` melalui autentikasi Git yang disediakan platform, `registry.npmjs.org`, serta host unduh Playwright bila Chromium belum tersedia. Workflow lokal tidak membutuhkan secret atau database eksternal.

## 2. Spreadsheet khusus pengembangan

1. Buat spreadsheet **kosong khusus pengembangan**, jangan memakai data pribadi siswa saat bootstrap.
2. Buat proyek di editor Google Apps Script. Buka **Project Settings** dan catat Script ID; ID spreadsheet berasal dari URL spreadsheet. Keduanya ID sumber daya, bukan token login.
3. Di **Script Properties**, tambahkan `APP_SPREADSHEET_ID` berisi ID spreadsheet tersebut. Ini properti runtime Apps Script; bukan environment variable shell dan bukan file `.env`.
4. Timezone default manifest adalah `Asia/Jakarta`. Sesuaikan `src/appsscript.json` dengan wilayah sekolah (`Asia/Makassar` atau `Asia/Jayapura` bila diperlukan), atur timezone spreadsheet sama, lalu build ulang. Perhitungan tanggal server menggunakan timezone proyek; browser tidak menentukan tanggal default data nyata.

## 3. Hubungkan clasp secara manual

Di akun pengembang, aktifkan Google Apps Script API pada pengaturan Apps Script. Lakukan login pada mesin tepercaya; jangan menyalin refresh token, `.clasprc.json`, atau token OAuth ke chat/repo.

```sh
npm run clasp -- login
cp .clasp.json.example .clasp.json
```

Isi `scriptId` di `.clasp.json` dengan ID **proyek pengembangan** tadi, pertahankan `rootDir: "dist"`. File ini diabaikan Git. Pilih proyek yang benar sebelum push; clasp dapat mengganti sumber pada proyek tujuan.

```sh
npm run build
npm run clasp:status          # periksa hanya file dist yang masuk
npm run clasp:push            # mengirim kode, BUKAN membuat deployment produksi
```

Paket tahap 2 mencakup dua belas file `.gs`, tiga `.html`, dan satu manifest JSON (16 file total). `dev/`, tes, docs, `node_modules`, konfigurasi clasp, serta HTML demo tidak dikirim. Jangan mengedit hasil `dist/`; build selanjutnya menggantinya.

## 4. Inisialisasi header dan allowlist

Setelah push, di editor Apps Script jalankan fungsi **`initializeDatabase_`** secara manual, lalu berikan izin OAuth yang diminta. Helper ini tidak dapat dipanggil melalui `google.script.run` karena berakhiran `_`.

- Membuat 15 tab dan header dari `database/schema.json`.
- Mengambil script lock saat setup; memvalidasi semua tab berisi data sebelum menambah header.
- Membiarkan baris yang ada; menolak header yang salah; tidak menghapus tab atau menanam data dummy.
- Aman diulang untuk skema yang sama. Ini bukan sistem migrasi atau transaksi atomik; jika layanan berhenti di tengah pembuatan, perbaiki penyebabnya dan ulangi. Cadangkan Sheets sebelum perubahan struktur.

Tambahkan **akun Google pengembang yang sebenarnya** secara manual pada `Pengguna`:

| Kolom | Isi |
| --- | --- |
| `user_id` | UUID stabil yang dibuat administrator |
| `email` | Email akun Google yang akan mengakses aplikasi, unik tanpa membedakan kapital |
| `nama` | Nama tampilan |
| `role` | `ADMIN_KEPALA_SEKOLAH` atau `GURU` |
| `aktif` | Boolean `TRUE` |
| `created_at`, `updated_at` | Waktu ISO 8601 |

Jangan membuat akun bootstrap dengan password atau email rekaan. Aplikasi tidak memakai password lokal. Tab kosong menampilkan akses ditolak atau keadaan tanpa catatan; bukan data demo.

Opsional: isi `Pengaturan` dengan `school_name` dan `semester_label` untuk nama sekolah dan label semester. Masukkan data uji nonpribadi untuk kelas, siswa, keanggotaan, dan penugasan sesuai [skema](database.md). ID, NIS, NISN harus berformat teks biasa agar nol awal tidak hilang.

## 5. Uji sebagai web app pengembangan

Manifest awal mengizinkan **hanya pemilik** (`MYSELF`) dan mengeksekusi sebagai pengguna pengakses (`USER_ACCESSING`). Di editor Apps Script, gunakan **Deploy → Test deployments → Web app** untuk pengujian pengembang. Ikuti otorisasi Google untuk akun yang terdaftar pada `Pengguna` dan memiliki izin spreadsheet. Jangan mengubah akses menjadi publik untuk menghindari error identitas.

Periksa halaman, kelas, siswa, filter, keadaan kosong, serta kode error berdasarkan [checklist Google](testing.md). Pengujian lokal menggunakan mock; ia tidak menggantikan langkah ini.

**Batas untuk banyak guru:** akses privat awal belum memenuhi deployment multiuser. Sebelum membuka akses ke guru, putuskan kebijakan Workspace, identitas yang tersedia pada `Session.getActiveUser()`, execute-as, scopes, dan izin file. Dalam mode `USER_ACCESSING`, guru membutuhkan izin spreadsheet, sehingga pembatasan antarkelas di backend bukan isolasi data mentah pada file. Eksekusi sebagai pemilik mempunyai konsekuensi identitas dan izin lain yang juga harus diuji. Jangan mengganti mode dan menganggapnya otomatis aman. Dokumentasikan hasil pengujian dua guru berbeda, admin, dan akun tidak terdaftar.

Tidak ada deployment produksi yang dilakukan oleh build, pengujian, atau proses onboarding. Penerbitan produksi hanya setelah implementasi fitur, audit izin, dan persetujuan pemilik sekolah dalam pekerjaan terpisah.

## Pemecahan masalah

| Gejala | Pemeriksaan |
| --- | --- |
| `CONFIG_REQUIRED` | Isi `APP_SPREADSHEET_ID` pada Script Properties proyek yang benar. Properti yang tidak ada, kosong, atau hanya berisi spasi dianggap belum dikonfigurasi; spasi di sekitar ID dipangkas saat dibaca, tanpa menulis ulang properti. |
| `UNAUTHENTICATED` | Identitas Google kosong; periksa sesi, akun, dan konfigurasi deployment. Jangan menerima email dari klien sebagai pengganti. |
| `FORBIDDEN` | Periksa email unik, role persis, `aktif=TRUE`, kelas aktif dan penugasan; jangan memperluas akses global. |
| `SCHEMA_MISMATCH` | Bandingkan header/urutannya dengan JSON; cadangkan sebelum memperbaiki manual. |
| `DATA_INVALID` | Periksa status H/S/I/A, ID sesi duplikat, dan pasangan siswa-sesi duplikat pada pekan yang diminta. |
| `INTERNAL` | Periksa izin spreadsheet, ID, kuota, dan log Apps Script; pesan teknis tidak dikirim ke browser. |
| Demo belum berisi catatan di tanggal tertentu | Catatan awal sintetis hanya 19–23 Oktober 2026; form dapat menyimpan catatan tambahan hanya di memori sesi demo. |
| Perubahan sumber belum terlihat | Mulai ulang `npm run dev`; untuk Google, build, tinjau status, lalu push ke proyek pengembangan. |

Error operasional tambahan (DUPLICATE, CONFLICT, BUSY, WRITE_FAILED, RECOVERY_REQUIRED) dijelaskan pada [panduan operasional](operasional.md). Jangan mengulang simpan otomatis setelah error; muat ulang dan rekonsiliasi dahulu.

Kegagalan membaca PropertiesService atau membuka spreadsheet dengan ID terisi tetap `INTERNAL`, bukan `CONFIG_REQUIRED`. Jangan mengatasi gangguan izin/layanan dengan mengganti ID atau mereset database. Dalam tes lokal, mock getProperty harus mengembalikan string untuk kunci yang diminta atau null jika tidak ada, sesuai kontrak Apps Script.
