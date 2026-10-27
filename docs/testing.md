# Pengujian Tahap 3

Diagnostik /dev baca-saja: [cara mengambil bukti rendering tanpa JavaScript di Console](render-diagnostics.md). Manifest build dipin, sumber HtmlService dan hasil template diukur, lalu probe independen mengukur core DOM meskipun core gagal parsing. Laporan tidak mengambil identitas/data siswa. Hasil tes lokal tidak membuktikan renderer Google berfungsi.

Validasi alat diagnostik 27 Oktober 2026: **105 tes backend/build + 59 tes Playwright lulus**, tanpa gagal/dilewati. Build berisi 27 file; status clasp offline memilih seluruhnya. Jalur normal, otorisasi dan fitur operasional tetap diuji; tidak ada operasi tulis Google atau deployment.

Regresi Versi 9: [Unexpected identifier Pustaka](htmlservice-pustaka.md). Filter anotasi sourceURL yang dimodelkan eksplisit menghasilkan pesan/lokasi yang cocok sebelum perbaikan; dua tes admin/guru lalu lulus setelah suffix debug dihapus. Ini tidak membuktikan transformasi internal Google tanpa VM31 asli. `npm run check` terbaru lulus **96 tes backend/build dan 54 tes Playwright**, tanpa gagal/dilewati. Assertion hash tetap persis; teks penuh aset di DOM dibandingkan tanpa pemotongan suffix.

Regresi hash setelah PR #8: [reproduksi checkout CRLF dan perbaikan newline build](htmlservice-line-endings.md). Helper inline menghasilkan LF sebelum HTML parsing; assertion SHA-256 iframe tetap persis tanpa normalisasi/trim. Tes Node dan browser baru mencakup LF, CRLF, lone CR, nilai template/escape/Unicode/Base64 dan deteksi perubahan isi.

Validasi perbaikan newline 26 Oktober 2026: checkout LF dan CRLF masing-masing lulus **95 tes backend/build dan 52 tes Playwright** melalui `npm run check`, tanpa gagal/dilewati. Scripts.html kedua checkout identik byte/hash; build terpisah tetap menghasilkan 24 file. Tidak ada migrasi, clasp push atau deployment.

Regresi pemisahan pustaka: [audit dan verifikasi Google](htmlservice-bundle.md). Core dan tiga aset dibandingkan dengan script yang benar-benar disisipkan di browser melalui ukuran/hash; payload terpotong/berubah/tertukar/berversi salah ditolak sebelum eksekusi, Dashboard/menu/manual tetap hidup, dan retry memuat pustaka utuh. Seluruh tes ekspor PDF/Excel, kartu dan QR tetap dijalankan. Penghapusan XML rekaan tidak digunakan untuk membuktikan perilaku Google.

Validasi 26 Oktober 2026: `npm run check` lulus **93 tes backend/build dan 49 tes browser**, tanpa gagal/dilewati; build final menghasilkan 24 file. Status clasp dengan konfigurasi contoh mengonfirmasi daftar tersebut secara offline. Tidak ada migrasi, clasp push atau deployment; /dev dan /exec nyata masih perlu verifikasi pemilik.

Baseline PR #7 pada 24 Oktober 2026: 81 tes backend/build dan 39 tes browser lulus. Pengujian XML pada baseline memakai transformasi fixture rekaan dan tidak membuktikan perilaku Google; fixture sekarang menggunakan output utuh. Build baseline menghasilkan 19 file, sedangkan pemisahan pustaka menghasilkan 24.

## Regresi konfigurasi Spreadsheet setelah PR #5

Pada main `c3beff2`, Node v24.19.0, tes asli `missing spreadsheet configuration produces actionable error, no demo fallback` dan seluruh 79 tes backend/build lulus sebelum perubahan. Kegagalan null → INTERNAL yang dilaporkan belum direproduksi dari checkout tersebut; penyebab spesifik pada lingkungan pelapor belum dapat dipastikan tanpa output/versi lingkungannya.

Celah yang berhasil direproduksi: nilai Script Property berisi whitespace lolos dari pemeriksaan truthy di `openDatabase_()`. Ketika openById menolak ID tersebut, API menyamarkan error sebagai INTERNAL. Dua regresi gagal sebelum perbaikan untuk nilai whitespace dan ID ber-spasi. Kini nilai null/kosong/whitespace menjadi CONFIG_REQUIRED sebelum membuka Sheets, sedangkan spasi di sekitar ID terisi dipangkas tanpa mengubah nilai tersimpan. Kunci APP_SPREADSHEET_ID dipertahankan; tidak ada fallback demo atau perubahan pemetaan error API.

Mock PropertiesService kini menyimpan nilai per kunci dan mengembalikan null untuk properti yang tidak ada. Tes mencakup helper langsung, RPC baca/tulis (termasuk fitur Tahap 3), nol pembukaan/penulisan database saat konfigurasi kosong, pelepasan lock, dan tidak berubahnya data. Gangguan getScriptProperties, getProperty, openById serta pembacaan Sheets tetap INTERNAL dengan pesan privat disembunyikan.

Validasi perbaikan 24 Oktober 2026: `npm run check` lulus **80 tes backend/build dan 37 tes browser**, nol gagal/dilewati; `npm run build` terpisah berhasil (19 file clasp). Semua tes baseline dipertahankan, dengan satu tes tambahan dan perluasan kasus konfigurasi. Tidak ada perubahan schema, ID, fitur UI, migrasi, clasp push, atau deployment.

## Baseline Tahap 3

Validasi lokal 24 Oktober 2026: `npm run check` lulus **79 tes backend/build + 37 tes browser**, tanpa gagal atau dilewati. `npm run build` terpisah berhasil menghasilkan 19 file clasp. Tidak ada operasi Google produksi yang dijalankan.

Jalankan `npm run check` dan `npm run build` sebelum PR. Suite baru mencakup backup terverifikasi dan migrasi berulang/gagal, kompatibilitas v1, profil/foto/nomor wali, scope role, QR/token/konfirmasi/duplikasi, ukuran PDF kartu menggunakan pdf-lib, parsing Excel asli, QR yang dibaca ZXing, kamera dari stream sintetis, izin ditolak, pelepasan track, dan alur kartu/QR di iframe lintas origin. Lihat [rincian Tahap 3](stage-3.md).

Modul kamera dites dengan getUserMedia yang mengembalikan video canvas sintetis dan decoder QR asli; ini bukan uji kamera fisik atau kebijakan izin Google. Tidak ada Google Sheets produksi atau credential sekolah dalam tes. Pembuatan berkas memakai pustaka yang dibundel tanpa CDN.

Build menyisipkan JS sebagai teks literal melalui callback replace(), agar pola `$&` pada pustaka tidak berubah menjadi marker HTML. Regresi memvalidasi sintaks script hasil preview dan boot browser. Selector status Manual/QR dibedakan agar tab tersembunyi tidak membuat assertion ambigu. Assertion simpan/error yang lama tetap dipertahankan.

Bagian berikut menyimpan cakupan dan baseline tahap 2/navigasi; hasil akhir tahap 3 dicatat pada panduan Tahap 3.

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

Tambahan regresi navigasi: [navigation-htmlservice.md](navigation-htmlservice.md). Suite browser kini juga menguji iframe lintas origin pada URL userCodeAppPanel dengan sandbox dan default `_top`, tanpa menulis URL/history atau membuka tab baru. Jumlah pada bagian hasil tahap 2 di atas adalah baseline sebelum perbaikan navigasi.

Regresi pencarian siswa: suite iframe mengaktifkan MiddleClickAutoscroll Chromium agar perilaku klik tengah tidak berbeda diam-diam antar-OS. Tes menutup autoscroll dengan Escape sebelum klik pencarian, mempertahankan assertion `288 siswa`, memeriksa route/loading, 25 baris, dan payload/total RPC. Tes tambahan mengendalikan respons asinkron dengan promise untuk membuktikan pagination muncul setelah data siap. Kegagalan asli berhasil direproduksi sebelum koreksi dengan fitur autoscroll aktif; lihat rincian pada panduan navigasi.

1. Backup spreadsheet, pertahankan kedua ID dan manifest/kebijakan deployment yang sudah ditinjau. Skema v1 tidak berubah; jangan reset database.
2. Gunakan clasp status untuk meninjau file dist sebelum push yang dilakukan pengembang (16 pada baseline tahap 2; 19 pada tahap 3). Jangan kirim fixture, token siswa nyata, atau data pribadi ke GitHub/Apps Script source.
3. Pada salinan spreadsheet pengembangan atau data nonpribadi yang disetujui, uji kelas baru/edit/nonaktif serta siswa baru/pindah/nonaktif. Periksa baris lama, foreign key, dan AuditLog tetap tersedia.
4. Uji NIS ganda, nama kelas-tahun ganda, tanggal invalid, formula input, dan akun tidak terdaftar; pastikan tidak ada penulisan.
5. Uji Admin, Guru A, Guru B, dan akun nonaktif pada sesi Google terpisah. Coba RPC dengan classId dan subjectId di luar penugasan, bukan hanya memeriksa menu tersembunyi.
6. Verifikasi izin file Sheets langsung sesuai kebijakan sekolah. USER_ACCESSING membutuhkan izin spreadsheet dan tidak mengisolasi data mentah antarguru. Tinjau executeAs/Workspace tanpa mengganti identitas dengan email kiriman klien.
7. Simpan absensi dua kali pada sesi yang sama; pastikan ID/jumlah baris tidak bertambah. Buka dua form, simpan dari yang pertama lalu kedua; yang kedua harus CONFLICT dan tidak menimpa.
8. Uji gangguan layanan hanya pada database pengembangan yang dapat dipulihkan, periksa kompensasi serta langkah pemulihan manual. Jangan menyatakan transaksi atomik.
9. Ukur latensi/kuota pada 100–500 siswa dan histori panjang. Tentukan batas tanggal edit, kebijakan tutup buku, backup, serta retensi sebelum operasional sekolah.

Deployment sebelumnya dikonfirmasi pengguna. Validasi kode tahap 2 di atas tetap lokal sampai langkah Google benar-benar dijalankan dan dicatat. Build, status clasp, atau tes mock tidak membuktikan deployment/integrasi Google berhasil.
