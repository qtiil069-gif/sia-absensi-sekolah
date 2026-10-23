# Pengujian fondasi

## Perintah

```sh
npm ci
npm run check
```

Node test runner (`node:test`) menguji backend menggunakan mock layanan Apps Script dan Sheets. Playwright menguji browser Chromium pada port terpisah `4174`, termasuk server demo aktual. `npm test` tidak mengeksekusi Playwright; `npm run check` menjalankan keduanya. Playwright menyimpan screenshot responsif pada `test-results/`; trace dan screenshot kegagalan juga di sana, semuanya diabaikan Git.

Jika browser belum tersedia, ikuti [instalasi](installation.md). Pengujian tidak membutuhkan kredensial Google dan tidak mengirim atau menulis data ke Google. Seluruh nama/email uji adalah data sintetis; domain email `.test` tidak mewakili akun login.

## Cakupan otomatis

- Bootstrap, nama sekolah dari Sheets mock, serialisasi DTO tanpa tabel akun/email.
- Seluruh RPC data menolak identitas kosong, pengguna tidak terdaftar, dan akun nonaktif.
- Email duplikat, role tidak dikenal, normalisasi email dan boolean `FALSE`.
- Guru wali kelas/penugasan aktif, penugasan nonaktif, kelas arsip, pemalsuan filter kelas/role, dan guru tanpa kelas.
- Agregasi admin dan filter kelas/tanggal; pekan Senin–Minggu; penyebut catatan; null saat tanpa data.
- Tanggal tidak valid, tipe ID salah, header/tab hilang, status invalid dan catatan siswa-sesi duplikat.
- Pembacaan bulk satu kali per tab per request dan penyembunyian pesan error internal.
- Initializer dapat diulang, mempertahankan data, membuat header tanpa dummy, memvalidasi sebelum penambahan.
- Paket build deterministik: manifest privat, source backend dapat dievaluasi, template HTML Service, fixture hanya pada demo.
- UI desktop dan lebar 360/390/768/1024px tanpa overflow halaman; menu mobile, filter, pencarian, tabel kelas/siswa, placeholder fitur, keadaan error tanpa Google, serta alur RPC mock dan rendering teks inert terhadap HTML dari Sheets.

Ini pengujian fungsional, bukan sertifikasi keamanan, benchmark 500 siswa, tes kuota Google, atau validasi deployment produksi. Mock tidak mereplikasi seluruh perilaku Apps Script, OAuth, dan spreadsheet.

## Hasil validasi lokal fondasi — 23 Oktober 2026

Pada lingkungan cloud dengan Node 24.19.0 dan Chromium 154:

- Instalasi ulang `npm ci` dari lockfile berhasil.
- `npm run build` berhasil, menghasilkan 11 file paket Apps Script.
- `npm test`: **30 lulus**, 0 gagal, 0 dilewati.
- `npm run test:ui`: **11 lulus**, 0 gagal, 0 dilewati.
- `npm run clasp -- -P .clasp.json.example status` memverifikasi hanya 11 file `dist/` yang masuk paket; tidak membutuhkan login atau mengirim kode.
- Screenshot desktop dan mobile ditinjau terhadap referensi; sidebar, banner, warna kartu, grafik, dan layout responsif tersedia.

Login Google, pembacaan spreadsheet nyata, dan deployment Apps Script belum dijalankan. Hasil di atas adalah baseline lokal; jalankan ulang setelah perubahan kode atau konfigurasi.

## Checklist manual pada Google — belum dijalankan otomatis

1. Konfigurasikan proyek/spreadsheet pengembangan, timezone sama, dan Script Property sesuai panduan instalasi.
2. Push ke proyek pengembangan, jalankan initializer dua kali; pastikan data yang ada tidak berubah dan header tepat.
3. Buka test deployment privat sebagai pengembang yang terdaftar. Pastikan nama sekolah dan roster cocok dengan Sheets dan angka dummy 288 tidak muncul tanpa data yang sesuai.
4. Buat data nonpribadi: dua kelas, empat siswa, dua hari sesi, status H/S/I/A; bandingkan dashboard dengan perhitungan manual, termasuk tanggal tanpa catatan dan filter kelas.
5. Setelah kebijakan multiuser ditinjau, uji Admin, Guru A, Guru B, akun nonaktif, dan akun tidak terdaftar pada sesi browser berbeda. Uji ID kelas yang dipalsukan di RPC, bukan hanya menu tersembunyi.
6. Verifikasi identitas pada mode deployment yang dipilih dan izin akses langsung ke spreadsheet. Akses file tidak boleh melanggar batas data sekolah yang disepakati; model awal belum mengisolasi data mentah antarguru.
7. Uji kegagalan izin spreadsheet, header salah, dan identitas kosong; pastikan tampil error tanpa data dummy atau data lama.
8. Ukur waktu/kuota pada 100–500 siswa dan histori representatif. Tetapkan penyebut laporan resmi, sesi harian/mapel, dan kebijakan keanggotaan historis.
9. Sebelum membuka mutasi, uji validasi, formula injection, role, foreign key, replay/idempotensi, konkurensi dua guru, lock, kegagalan parsial, serta audit/backup.

Catat hasil uji Google pada pekerjaan integrasi berikutnya. Jangan menandai checklist ini lulus hanya karena tes lokal berhasil.
