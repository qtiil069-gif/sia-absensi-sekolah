# Tahap 3 — identitas sekolah, data wali, kartu ID, dan absensi QR

Basis: main `2e56b89` setelah merge perbaikan tes pencarian iframe. Pekerjaan dilakukan pada branch `feature/tahap3-kartu-qr-pengaturan`. Tidak ada deployment Google atau perubahan database sekolah nyata yang dijalankan oleh agen.

## Struktur menu dan modul

Sidebar mempertahankan delapan menu sebelumnya dan hanya menambah **Pengaturan Sekolah**, khusus Admin Kepala Sekolah. Tidak ada sidebar Cetak Kartu ID atau Scan QR Code.

| Lokasi | Kemampuan tahap 3 |
| --- | --- |
| Pengaturan Sekolah | Edit nama, logo, alamat, identitas tambahan; kontrol migrasi v1 → v2 dengan backup |
| Data Siswa — form | Nama wali, telepon/WhatsApp, hubungan wali, upload/ganti/hapus foto; CRUD lama tetap tersedia |
| Data Siswa — toolbar | Cetak Kartu ID per kelas melalui popup preview; Unduh data Excel/PDF melalui popup |
| Data Siswa — tindakan baris | Cetak kartu individual untuk siswa aktif dalam cakupan akun |
| Absensi Siswa | Tab Absensi Manual dan Scan QR Code; pilihan kelas/tanggal/jenis/mapel yang sama |
| Scan QR Code | Kamera belakang/depan HP atau kamera laptop/PC, alternatif pembaca USB/tempel kode, validasi backend, popup konfirmasi identitas, simpan Hadir |

Dashboard pastel, router state di memori, fungsi kelas/siswa/absensi manual, dan validasi role server tetap dipakai. Tidak ada pemrosesan biometrik atau pengenalan wajah.

## Pengaturan Sekolah

Admin mengedit nama, logo, alamat, dan identitas tambahan. Nilai disimpan sebagai key pada tab Pengaturan yang sudah ada: `school_name`, `school_logo`, `school_address`, `school_identity`. Key lain, termasuk semester, dipertahankan. Edit memakai revision dan script lock; guru ditolak di server, bukan hanya melalui menu tersembunyi.

Popup kartu selalu membaca pengaturan terbaru. Saat tombol cetak atau PDF ditekan, aplikasi mengambil ulang snapshot kartu/pengaturan sebelum memperbarui preview dan menghasilkan output. Nama/logo tidak di-hardcode ke template kartu. Identitas/alamat yang sangat panjang dibatasi area tampilan kartu agar tidak menimpa QR; data asli tetap tersimpan dan dapat diedit.

## Data wali dan foto

Kolom lama Siswa tetap sama. Data tambahan masuk ke tab baru ProfilSiswa. Field wali bersifat opsional agar data lama tetap dapat digunakan. Nomor wali divalidasi 8–18 digit, dengan kode negara opsional; nol awal dan tanda plus ditampilkan sebagai teks. Hanya Admin yang mengedit data; Guru hanya membaca siswa dalam kelas wali/penugasan aktifnya.

Foto/logo dipilih dari JPEG, PNG, atau WebP maksimal 5 MB di browser lalu diraster ulang/diperkecil sehingga metadata foto tidak disertakan. Foto siswa dikirim sebagai JPEG; logo dikirim sebagai PNG untuk mempertahankan transparansi. Logo lama yang sudah tersimpan sebagai JPEG tidak diubah otomatis; unggah ulang berkas logo transparan asli melalui Pengaturan Sekolah jika diperlukan. Payload backend menerima PNG/JPEG dengan signature yang sesuai, maksimal 28.000 byte dan 40.000 karakter data URL. Foto tidak disimpan sebagai file publik atau URL eksternal: satu sel Sheets menyimpan satu gambar kecil, di bawah batas 50.000 karakter per sel. Ini pilihan untuk skala 100–500 siswa; uji latensi dengan jumlah foto nyata sebelum operasional. Belum ada penyimpanan foto resolusi penuh di Drive.

Data kontak wali termasuk data pribadi. Pembacaan/export mengikuti cakupan akun. Model sharing file Sheets masih harus ditinjau: USER_ACCESSING dapat memberi pengguna izin langsung pada file, di luar pembatasan UI aplikasi. Jangan mempublikasikan spreadsheet, backup, kartu, atau hasil ekspor secara sembarangan.

## Kartu ID

- Ukuran portrait **54 × 85,6 mm** pada CSS cetak dan ukuran setiap halaman PDF.
- Desain kartu memakai biru royal, biru tua, kuning, dan putih. Teks **KARTU ID SISWA** berada tepat di bawah area logo. Nama, logo, alamat, dan identitas sekolah tetap berasal dari Pengaturan Sekolah.
- Berisi logo/nama sekolah, foto siswa, nama, NISN, kelas, QR unik, serta alamat/identitas sekolah dalam area footer/header.
- Foto atau NISN yang belum diisi diberi penanda jelas pada preview, bukan data siswa rekaan. Petugas perlu melengkapi/memeriksa sebelum mencetak.
- Cetak individual dari baris siswa, atau massal satu kelas aktif dari toolbar. Guru hanya dapat menyiapkan kartu siswa aktif di kelas yang diizinkan; siswa nonaktif/kelas di luar cakupan ditolak.
- Popup preview tampil sebelum cetak/download. PDF memiliki satu kartu per halaman ukuran ID; browser print menata kartu pada kertas A4 dengan ukuran kartu tetap. Gunakan skala cetak **100% / actual size**, tanpa fit-to-page.
- PDF dibuat dengan pdfmake dan font Roboto yang dibundel. Excel menggunakan ExcelJS; QR menggunakan qrcode. Seluruh proses berjalan lokal di browser tanpa layanan pembuat QR/PDF/CDN/font eksternal. Font Roboto memiliki batas cakupan aksara; periksa nama dengan aksara khusus pada output sebelum cetak resmi.

Token QR acak UUID dibuat server dan disimpan pada profil. Payload `SIA-ID:1:<token>` tidak berisi nama/NISN/nomor wali. Token tetap sama saat cetak ulang. QR adalah pengenal siswa, **bukan autentikasi petugas atau bukti kehadiran**. Salinan kartu dapat disalin orang lain; konfirmasi petugas tetap wajib. Penggantian/revokasi token melalui UI belum disediakan.

## Notifikasi tindakan

Data Kelas dan Data Siswa menampilkan toast berbeda untuk penambahan, pembaruan, dan penonaktifan yang telah dikonfirmasi backend. Penonaktifan tetap memerlukan konfirmasi dan tidak menghapus riwayat. Absensi Manual/QR serta pembaruan Pengaturan Sekolah juga menampilkan hasil backend. Validasi QR hanya mengonfirmasi identitas; toast absensi baru muncul setelah petugas mengonfirmasi dan backend menyimpan kehadiran. Siswa yang sudah tercatat tetap mendapat peringatan duplikasi, tanpa toast sukses baru.

Toast sukses berwarna hijau lembut dengan ikon centang; kegagalan berwarna merah lembut. Satu toast tampil pada satu waktu, pesan identik yang masih terlihat tidak digandakan, dan pengguna dapat menutupnya. Toast juga terlihat di dalam popup konfirmasi, tidak memindahkan fokus, serta disembunyikan saat cetak. Pesan inline lama tetap tersedia untuk pemeriksaan lebih lama; teks dinamis tidak diproses sebagai HTML. Tidak ada retry tulis otomatis atau perubahan otorisasi/validasi backend.

## Ekspor Excel/PDF

Tombol Unduh data Excel/PDF membuka popup data sesuai pencarian, kelas, status, dan role; bukan hanya halaman pagination yang terlihat. Maksimal 500 siswa. Excel asli `.xlsx` mempertahankan NIS/NISN/nomor wali sebagai teks, bukan angka atau formula. PDF tabel berorientasi landscape dan memakai identitas sekolah. Ekspor tidak menyertakan token QR atau data foto base64. Download hanya dilakukan setelah tombol dipilih pengguna, bukan pengiriman ke pihak lain.

## Absensi QR dan kamera

Pilih kelas, tanggal, HARIAN/MAPEL dan mapel bila diperlukan, lalu Tampilkan siswa. Tab Manual tetap mendukung seluruh H/S/I/A, catatan, simpan/edit, konflik dan lock seperti tahap 2. Draft manual harus disimpan atau dimuat ulang sebelum masuk ke tab QR agar hasil scan tidak menimpa perubahan yang belum disimpan.

Scan menggunakan ZXing QR reader dengan decoder cadangan jsQR pada pixel lokal pada video getUserMedia, dengan preferensi kamera belakang/utama atau depan. Kamera hanya diminta setelah pengguna menekan Mulai kamera. Stream dihentikan ketika QR terbaca, pengguna menghentikan kamera, pindah tab/halaman, dokumen disembunyikan, atau halaman ditutup. Callback kamera yang selesai terlambat juga dilepas. Penolakan izin menampilkan pesan dan mempertahankan alternatif USB/kode serta Absensi Manual.

Hasil scan memanggil backend untuk memvalidasi token, akun, siswa aktif, keanggotaan kelas, tanggal dan jenis sesi. Guru MAPEL tetap memerlukan penugasan kelas-mapel yang sesuai. Identitas/foto/NISN/kelas ditampilkan di popup. **Validasi saja tidak menulis absensi.** Setelah petugas menekan Konfirmasi Hadir, server memvalidasi ulang identitas, scope, snapshot, status dan duplikasi di bawah script lock, lalu menambahkan satu catatan Hadir beserta audit. Siswa yang sudah tercatat tidak ditimpa oleh QR; koreksi dilakukan melalui tab Manual. Sesi harian/mapel tetap unik menurut aturan tahap 2.

Perubahan tanggal, roster, identitas yang dikonfirmasi, atau catatan bersamaan dapat menolak konfirmasi lama. Tidak ada retry tulis otomatis. Penulisan memakai snapshot/kompensasi yang sama; SpreadsheetApp tetap bukan transaksi atomik lintas tab. Error RECOVERY_REQUIRED memerlukan pemeriksaan administrator.

Kamera memerlukan HTTPS, izin browser/perangkat, dan delegasi kamera oleh iframe host Google. Jika kebijakan host menolak kamera, kode di dalam iframe tidak dapat memberikan izin sendiri. Implementasi serta error handling diuji lokal dengan video sintetis dan decoder asli; kamera fisik HP/PC dan kebijakan kamera deployment Google belum diverifikasi dari cloud ini. Tidak ada tautan userCodeAppPanel atau navigasi keluar iframe untuk menyiasatinya.

## Migrasi aman v1 → v2

Skema lama disimpan pada `database/migrations/001-schema.json`. Skema v2 hanya menambah:

```text
ProfilSiswa:
student_id | wali_nama | wali_telepon | wali_hubungan | foto_data_url | qr_token | updated_at
```

Seluruh 15 tab lama, nama/header/urutan kolomnya tetap identik. Tidak ada ALTER/clear/reset/delete pada data lama. Kelas, dashboard, baca siswa dan CRUD dasar tanpa field profil tetap berjalan sebelum migrasi. Fitur profil/kartu/QR meminta MIGRATION_REQUIRED bila tab baru belum disiapkan.

Migrasi dijalankan **manual oleh Admin dari Pengaturan Sekolah → Siapkan database Tahap 3**, setelah klik konfirmasi:

1. Ambil script lock dan validasi akun admin serta header tab lama.
2. Buat salinan **seluruh spreadsheet** dengan nama Cadangan SIA sebelum Tahap 3 dan waktu proses; ID sumber tidak diubah.
3. Verifikasi daftar tab serta hash values/formulas tiap tab terhadap salinan. Jika gagal, hentikan sebelum menambahkan header baru. Formula volatil dapat membuat hasil values berbeda dan migrasi ditolak; jangan mengabaikan verifikasi.
4. Tambahkan tab/header ProfilSiswa hanya jika belum berisi data; tidak menimpa tab dengan header salah. Flush dan laporkan nama backup.
5. Pemanggilan ulang pada v2 valid menjadi no-op; tidak membuat backup/data dummy baru. Kegagalan parsial perlu diperiksa, bukan dipulihkan dengan menghapus tab lama.

Initializer lama kini menolak database v1 yang sudah berisi data agar tidak melewati backup. Untuk database benar-benar kosong, initializer pengembangan tetap tersedia. Backup adalah file salinan pada akun pelaksana; tinjau izin dan retensinya. Backup tidak berisi kredensial aplikasi dan tidak pernah dimasukkan ke Git.

## Menerapkan setelah review

Pertahankan `.clasp.json`, Script ID, APP_SPREADSHEET_ID, manifest/scopes dan kebijakan deployment yang sudah dipakai. Tidak ada credential baru yang diperlukan. Dari branch yang ditinjau:

```sh
npm ci
npm run check
npm run build
npm run clasp:status
npm run clasp:push
```

Paket memiliki 19 file (15 .gs termasuk schema, 3 .html, 1 manifest). Pustaka browser masuk Scripts.html; dev/seed, tests, database snapshot dan node_modules tidak dikirim ke Google. Jalankan test deployment pada data pengembangan, kemudian Admin melakukan migrasi melalui UI. Tidak perlu mengganti spreadsheet, membuat proyek baru, atau menjalankan reset/initializer pada database lama.

Uji backup/pemulihan, hak akses akun nyata, foto, kartu dan ukuran fisik cetak, berkas Excel/PDF, serta kamera pada URL Web App Google sebelum persetujuan operasional. Pembaruan versi `/exec` dilakukan pemilik secara manual setelah review/uji; tidak otomatis pada pekerjaan ini.

## Pengembangan lokal

`npm run dev` menggunakan backend .gs asli dengan Sheets sintetis di memori. `?demo=teacher` menampilkan cakupan guru; `?demo=legacy` mensimulasikan v1 untuk menguji migrasi dan kompatibilitas CRUD. Tidak ada data dummy yang ditulis ke Google. Token/foto pada tes adalah data sintetis, bukan data pribadi siswa sekolah.

## Regresi yang ditambahkan selama implementasi

Satu payload QR sintetis berpola padat ditemukan tidak terbaca oleh jalur deteksi ZXing tertentu walaupun QR valid. Decoder independen jsQR memverifikasi payload tersebut; adapter kamera kini mencoba jsQR pada frame yang sama bila decoder utama gagal. Fixture publik `tests/fixtures/qr-dense-payload.txt` memuat pengenal sintetis untuk regresi ini, bukan token siswa nyata. Generator memakai quiet zone empat modul dan skala pixel bulat. QR, foto, dan frame tetap diproses lokal.

Pesan status Manual, QR, Data Siswa, Kelas, dan Sekolah memiliki scope selector terpisah. Assertion lama tentang sukses/error tetap dijalankan; tes tidak memilih pesan sementara pada editor atau tab tersembunyi.

## Hasil validasi lokal — 24 Oktober 2026

- `npm run check`: **79 tes backend/build dan 37 tes browser lulus**, nol gagal atau dilewati.
- `npm run build` terpisah berhasil: 19 file untuk clasp; schemaVersion 2. `clasp status` dengan konfigurasi contoh hanya memilih berkas dist, tanpa menghubungi proyek Google nyata.
- Preview kartu ditinjau; ukuran PDF 54 × 85,6 mm, jumlah halaman cetak massal, isi Excel, QR yang dapat didekode, dan alur iframe diperiksa oleh tes.
- Seluruh 15 header tab lama, manifest, contoh konfigurasi ID, referensi dashboard, dan router SPA dibandingkan dengan main `2e56b89` dan tetap identik. `git diff --check` bersih.
- Tidak ada migrasi, penulisan Google Sheets, clasp push, atau deployment produksi yang dijalankan. Hasil ini tidak mencakup kamera fisik, OAuth/izin iframe Google nyata, performa dengan foto sekolah, atau pengujian cetak fisik.
