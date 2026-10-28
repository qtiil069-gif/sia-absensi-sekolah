# Penyempurnaan kartu ID dan notifikasi Tahap 3

Perubahan berasal dari main `1888f05`, pada branch `feature/kartu-id-notifikasi`. Tidak diperlukan migrasi, perubahan Script Properties, penerbitan ulang token QR, atau perubahan hak akses.

## Kartu ID

Kartu tetap portrait 54 × 85,6 mm. Palet biru royal, biru tua, kuning, dan putih hanya diterapkan pada kartu; sidebar hijau pastel dan dashboard tetap dipertahankan. Logo diikuti teks **KARTU ID SISWA**, identitas sekolah, foto, nama siswa, NISN, kelas, QR, dan alamat sekolah. Logo serta teks sekolah dibaca dari Pengaturan Sekolah, bukan diganti dengan gambar/identitas rekaan.

Palet: biru royal `#2354C5`, biru tua `#102B5C`, kuning `#F6C945`, putih `#FFFFFF`, dan biru muda `#EEF3FC` untuk placeholder foto.

Preview dan PDF menggunakan definisi tata letak bersama dalam milimeter dan font Roboto yang sama dari pustaka yang sudah dibundel. Pustaka/font hanya dimuat ketika pengguna meminta preview kartu; Dashboard, Pengaturan Sekolah, dan Absensi Manual tidak memuatnya. Tidak ada CDN/font eksternal baru. PDF tetap satu kartu per halaman; cetak browser menata kartu pada kertas A4. Pilih skala **100% / actual size** saat mencetak.

Nama sekolah/siswa dan identitas utama dipenggal ke baris yang tersedia tanpa membuang karakter. Alamat footer memakai maksimal dua baris dengan ukuran huruf minimum; alamat yang terlalu panjang diringkas dengan elipsis pada kedua output. Alamat lengkap tetap tersimpan dan tersedia sebagai tooltip preview.

Unggahan logo mempertahankan alpha PNG. Aplikasi tidak menghapus warna putih secara otomatis karena dapat mengubah lambang asli. Logo JPEG lama tidak dapat dikembalikan transparansinya hanya melalui CSS; pemilik perlu mengunggah ulang logo PNG transparan asli. Foto siswa tetap JPEG dan batas payload gambar backend tetap berlaku.

## Notifikasi

Toast sukses ditampilkan setelah respons backend berhasil untuk penambahan, pembaruan, penonaktifan, validasi identitas QR, penyimpanan absensi, dan pembaruan sekolah. Kegagalan menampilkan toast merah, tanpa membuat hasil sukses. Validasi QR tidak menyimpan absensi; konfirmasi petugas dan validasi backend tetap wajib.

Hanya satu toast terlihat; pesan identik tidak digandakan. Toast memiliki tombol tutup, berhenti menghitung waktu ketika ditunjuk/fokus, tidak mengambil fokus pengguna, dan masuk ke popup modal yang aktif agar terlihat. Konfirmasi penonaktifan dan pesan inline tetap tersedia. Tidak ada penghapusan permanen, retry tulis otomatis, atau perubahan database/role.

## Pemeriksaan manual setelah review

1. Pada lingkungan pengembangan yang sudah terhubung, buka Pengaturan Sekolah dengan admin yang berwenang. Gunakan logo PNG transparan asli sekolah; tidak perlu mengganti nama/identitas yang sudah benar.
2. Buka Data Siswa → Cetak kartu ID individual, lalu periksa judul di bawah logo, nama, NISN, kelas, foto, dan keterbacaan QR. Bandingkan preview dengan PDF pada skala 100%. Periksa juga cetak massal kelas.
3. Uji simpan/edit/nonaktifkan pada data pengembangan, termasuk membatalkan konfirmasi dan menolak simpan melalui backend. Toast sukses harus mengikuti respons backend; kegagalan mempertahankan data/form yang dapat diperbaiki.
4. Di Absensi, validasi QR lalu konfirmasi secara terpisah. Periksa peringatan absensi ganda dan cakupan kelas Guru tetap berlaku. Ulangi pada HP dan desktop.

Tidak ada merge, migrasi, clasp push, atau deployment otomatis pada perubahan ini. Hasil pengujian lokal dan pemeriksaan visual dicatat setelah implementasi selesai; hasil Google HtmlService nyata dan cetak fisik harus diverifikasi pemilik setelah review.

## Berkas yang berubah

| Area | Berkas |
| --- | --- |
| Layout dan tampilan kartu | `src/frontend/lib/card-layout.js`, `src/frontend/card-styles.css`, `src/frontend/components/student-cards.js` |
| PDF, font, dan transparansi logo | `src/frontend/lib/files.js`, `src/frontend/lib/pdf-vendor.mjs`, `src/frontend/lib/images.js` |
| Komponen toast | `src/frontend/lib/toasts.js`, `src/frontend/toast-styles.css` |
| Integrasi hasil tindakan | `src/frontend/pages/classes.js`, `students.js`, `attendance.js`, `settings.js`, `src/frontend/components/qr-scanner.js` |
| Build | `scripts/build.mjs` |
| Regresi browser | `tests/ui/card-design.spec.mjs`, `tests/ui/notifications.spec.mjs` |
| Dokumentasi | `README.md`, `docs/stage-3.md`, dokumen ini |

## Hasil pengujian 28 Oktober 2026

- `npm run check` lulus: **105 tes backend/build dan 75 tes Playwright**, tanpa kegagalan atau tes dilewati. Build menghasilkan paket clasp 27 file, skema tetap versi 2.
- Empat tes kartu baru memeriksa ukuran fisik, teks judul, palet, posisi/font preview–PDF, PNG alpha sampai image mask PDF, foto landscape yang dicrop portrait, nama panjang/XSS, identitas sekolah terbaru, dan keutuhan token QR. Dua belas tes toast baru memeriksa respons backend yang ditahan, keberhasilan/kegagalan, submit ganda, konfirmasi, QR, mobile, modal, warna, dan teks aman.
- Inspeksi visual dilakukan pada preview dan PDF nyata yang dirender. Perbedaan warna placeholder foto kosong diperbaiki dan diberi assertion khusus; QR pada raster PDF berhasil didekode kembali. Artefak memakai gambar dan identitas sintetis.
- Backend, database/skema, autentikasi, router, mekanisme absensi/QR, manifest, contoh ID, dashboard CSS, dan referensi dashboard tetap identik dengan main. Build tidak menyertakan data uji, credential, atau gambar sekolah asli.

Hasil tersebut merupakan pengujian lokal, bukan verifikasi deployment Google atau cetak fisik. Pull Request belum dibuat pada tahap laporan ini.
