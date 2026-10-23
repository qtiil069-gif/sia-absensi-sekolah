# Pengujian tahap 2

## Perintah

```sh
npm ci
npm run check          # build + node:test + Playwright
npm run build          # artefak clasp final
```

`npm test` menjalankan suite Node. `npm run test:ui` menjalankan Chromium dan server lokal pada port 4174. Chromium sistem atau CHROMIUM_PATH digunakan bila tersedia; alternatifnya `npx playwright install chromium`. Screenshot dan trace berada pada test-results/ dan tidak dilacak Git.

## Lingkungan dan cakupan

Kode `.gs` asli dievaluasi dalam VM dengan mock Apps Script/Sheets, tidak ditulis ulang sebagai backend berbeda. Runtime mock berada pada `dev/sheets-runtime.mjs`, dipakai oleh tes dan server demo. Browser demo memanggil fungsi yang sama melalui endpoint lokal yang hanya mengakses seed sintetis dalam memori per sesi. Identitas demo admin/guru hanya berlaku di server lokal; mekanisme tersebut tidak disertakan dalam dist.

Cakupan:

- Tes fondasi: bootstrap, penolakan akun/role, cakupan guru, agregasi/tanggal kosong, validasi skema dan build deterministik tanpa fixture dalam paket Google.
- Kelas: tambah/edit/nonaktif tanpa hapus, filter, referensi tahun/wali, duplikasi, role admin/guru, revision, lock, error audit, kompensasi dan kegagalan kompensasi.
- Siswa: tambah/edit/pindah/nonaktif, nol awal NIS/NISN, NIS duplikat termasuk nonaktif, cakupan role, input malformed, pagination seluruh 500 siswa, histori keanggotaan, konflik, kegagalan lintas tab dan blank row fisik.
- Absensi: roster aktif/pending, simpan/edit sesi yang sama, penolakan replay revision, kelas/mapel guru, H/S/I/A, seluruh roster wajib, status/siswa/formula invalid, sesi duplikat, data lama malformed, roster berubah, catatan historis, flush failure, kompensasi, dan penyimpanan bulk 500 siswa.
- Browser: dashboard dan responsif 360/390/768/1024px, CRUD/nonaktif kelas/siswa melalui form, pencarian/filter/pagination, absensi simpan/muat ulang/edit, navigasi desktop/mobile, draft yang belum disimpan, konflik data, kegagalan Sheets tanpa pesan sukses, rendering HTML sebagai teks, guru read-only pada master dan penolakan kelas lain, serta placeholder yang jujur.

Mock mensimulasikan kegagalan write/flush dan kontensi lock secara deterministik. Ini tidak mereplikasi konkurensi jaringan Google, otorisasi OAuth, sharing file, timeout Apps Script, atau pemulihan transaksi atomik.

## Hasil validasi lokal — 23 Oktober 2026

- `npm run check`: berhasil, **63 tes backend/build + 20 tes browser lulus**, 0 gagal, 0 dilewati.
- `npm run build` terpisah: berhasil, menghasilkan 12 file .gs, 3 .html, dan 1 manifest (16 file).
- `npm run clasp -- -P .clasp.json.example status`: hanya file dist yang dipilih; tidak mengirim kode atau memakai proyek Google nyata.
- Screenshot dashboard dan modul operasional mobile ditinjau; palet referensi dan navigasi responsif dipertahankan.
- Skema database v1, manifest, konfigurasi contoh ID, dan referensi dashboard dibandingkan byte-per-byte dengan basis tahap 2 dan tetap identik.

Login/integrasi Google, otorisasi akun sekolah nyata, serta push/deployment tahap 2 ke Apps Script tidak dijalankan dari lingkungan ini.

## Checklist Google pada proyek yang sudah ada

1. Backup spreadsheet, pertahankan kedua ID dan manifest/kebijakan deployment yang sudah ditinjau. Skema v1 tidak berubah; jangan reset database.
2. Gunakan clasp status untuk meninjau 16 file dist sebelum push yang dilakukan pengembang. Jangan kirim fixture, token, atau data pribadi ke GitHub/Apps Script source.
3. Pada salinan spreadsheet pengembangan atau data nonpribadi yang disetujui, uji kelas baru/edit/nonaktif serta siswa baru/pindah/nonaktif. Periksa baris lama, foreign key, dan AuditLog tetap tersedia.
4. Uji NIS ganda, nama kelas-tahun ganda, tanggal invalid, formula input, dan akun tidak terdaftar; pastikan tidak ada penulisan.
5. Uji Admin, Guru A, Guru B, dan akun nonaktif pada sesi Google terpisah. Coba RPC dengan classId dan subjectId di luar penugasan, bukan hanya memeriksa menu tersembunyi.
6. Verifikasi izin file Sheets langsung sesuai kebijakan sekolah. USER_ACCESSING membutuhkan izin spreadsheet dan tidak mengisolasi data mentah antarguru. Tinjau executeAs/Workspace tanpa mengganti identitas dengan email kiriman klien.
7. Simpan absensi dua kali pada sesi yang sama; pastikan ID/jumlah baris tidak bertambah. Buka dua form, simpan dari yang pertama lalu kedua; yang kedua harus CONFLICT dan tidak menimpa.
8. Uji gangguan layanan hanya pada database pengembangan yang dapat dipulihkan, periksa kompensasi serta langkah pemulihan manual. Jangan menyatakan transaksi atomik.
9. Ukur latensi/kuota pada 100–500 siswa dan histori panjang. Tentukan batas tanggal edit, kebijakan tutup buku, backup, serta retensi sebelum operasional sekolah.

Deployment sebelumnya dikonfirmasi pengguna. Validasi kode tahap 2 di atas tetap lokal sampai langkah Google benar-benar dijalankan dan dicatat. Build, status clasp, atau tes mock tidak membuktikan deployment/integrasi Google berhasil.
