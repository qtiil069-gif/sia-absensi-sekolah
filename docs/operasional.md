# Panduan modul operasional tahap 2

## Persiapan pada proyek yang sudah ada

Pertahankan Script ID, `APP_SPREADSHEET_ID`, izin file, dan konfigurasi deployment yang sudah digunakan. **Skema tetap v1 dengan 15 tab; tidak ada migrasi atau initializer yang harus dijalankan ulang.** Jangan mengosongkan database.

Admin perlu memastikan `TahunAjaran` memiliki tahun yang benar dan `aktif=TRUE` sebelum menambah kelas. Isilah data tahun nyata secara manual bila tab tersebut masih kosong; aplikasi tidak menanam tahun atau akun dummy. ID merupakan teks unik (huruf/angka/garis bawah/tanda hubung, maksimal 100 karakter), bukan nomor baris. Tab Pengguna, TahunAjaran, Mapel, dan PenugasanGuru tetap dikelola administrator; halaman akun guru belum diimplementasikan.

## Hak akses

| Kemampuan | Admin Kepala Sekolah | Guru |
| --- | --- | --- |
| Melihat kelas | Semua; filter aktif/nonaktif | Kelas aktif wali/penugasan saja |
| Tambah/edit/nonaktif kelas | Ya | Tidak |
| Melihat siswa | Termasuk tanpa kelas dan nonaktif | Siswa aktif pada kelas aktif wali/penugasan |
| Tambah/edit/nonaktif/pindah siswa | Ya | Tidak |
| Absensi HARIAN | Semua kelas aktif | Kelas aktif wali/penugasan |
| Absensi MAPEL | Semua mapel aktif pada kelas aktif | Memerlukan penugasan aktif kelas + mapel yang cocok |
| Mengedit absensi | Dalam cakupan di atas | Dalam cakupan di atas, termasuk catatan guru lain di kelas/sesi tersebut |

Role, identitas pencatat, ID sesi baru, dan timestamp dibuat/diperiksa server. Frontend tidak menentukan kewenangan. Kebijakan tahap ini mengizinkan pengubahan tanggal historis maupun tanggal kalender valid lain pada kelas yang saat ini diizinkan; belum ada periode tutup buku atau batas hari edit. Tinjau kebijakan ini bersama sekolah sebelum penggunaan nyata.

## Data Kelas

Cari nama kelas, filter tingkat atau status, lalu gunakan Tambah kelas / Edit / Nonaktifkan. Nama kelas unik per tahun ajaran, termasuk kelas nonaktif. Tingkat 1–12. Tahun tujuan baru harus aktif; tahun lama nonaktif boleh dipertahankan pada edit. Wali kelas opsional tetapi harus akun aktif dengan role yang sah jika diisi.

Nonaktif mengubah flag `aktif`, tanpa menghapus baris, siswa, penugasan, atau riwayat. Kelas nonaktif tidak dapat digunakan untuk pencatatan absensi baru. Pengaktifan kembali belum memiliki tombol; jangan menganggap Nonaktifkan sebagai hapus permanen.

## Data Siswa

Cari nama/NIS, pilih kelas/status, dan gunakan pagination 10/25/50/100 baris. Admin dapat mengelola siswa tanpa keanggotaan agar data lama bisa diperbaiki. Guru hanya menerima data dalam cakupan kelasnya.

Nama dan NIS wajib. NIS harus berupa teks (nol awal dipertahankan) dan unik setelah trim/tanpa membedakan kapital, termasuk terhadap siswa nonaktif. NISN opsional; jika diisi harus 10 digit. Pilih satu kelas aktif. Edit untuk memindahkan siswa akan menonaktifkan keanggotaan aktif lama dan menambahkan keanggotaan baru; tidak menghapus histori keanggotaan atau absensi.

Menonaktifkan siswa mempertahankan baris dan keanggotaan untuk histori, tetapi mengeluarkannya dari roster aktif dan daftar guru. Belum ada tombol pengaktifan kembali. Nama yang berisi markup ditampilkan sebagai teks, bukan HTML; teks dengan awalan formula Sheets atau karakter kontrol ditolak pada server.

## Absensi Siswa

1. Pilih kelas, tanggal, jenis sesi, dan mapel bila diperlukan; klik **Tampilkan siswa**.
2. Periksa roster siswa aktif. Status yang belum tercatat adalah **Belum diisi**, bukan otomatis H atau A.
3. Isi H/S/I/A untuk semua siswa. Tombol **Isi yang belum diisi: Hadir** hanya mengisi status kosong, tidak menimpa S/I/A yang sudah dipilih. Catatan opsional maksimal 500 karakter.
4. Periksa ringkasan, lalu klik **Simpan absensi**. Tombol dan pilihan dikunci saat request berlangsung.
5. Muat sesi yang sama untuk mengedit. ID sesi/absensi dipertahankan; server memperbarui baris yang sama dan mencatat aktor pada AuditLog.

Sesi HARIAN unik per `(class_id, tanggal, HARIAN, subject_id kosong)`. MAPEL unik per `(class_id, tanggal, MAPEL, subject_id)`: **satu sesi per mapel per hari**. Beberapa jam/pertemuan mapel yang sama pada hari yang sama belum didukung karena skema belum memiliki slot. Jangan memakai nama/ID mapel rekaan untuk menyiasati batas ini.

Mengganti pilihan tidak menyimpan roster lama ke kelas/tanggal baru. Input lama dinonaktifkan sampai **Tampilkan siswa** dipilih. Perubahan yang belum disimpan diperingatkan saat meninggalkan halaman atau memuat ulang roster.

Catatan lama milik siswa yang pindah/nonaktif tetap disimpan. Form menampilkan jumlah catatan historis di luar roster tanpa mengirim identitas/nama mereka ke guru; catatan tersebut tidak diedit di form roster aktif. Ringkasan form menghitung roster aktif. Dashboard menghitung seluruh catatan siswa-sesi yang sudah disimpan, sehingga dapat mencakup catatan historis tersebut.

## Konflik dan kegagalan Sheets

Semua mutasi mengambil script lock, lalu memvalidasi ulang identitas, role, data, dan revision. Revision mencegah dua form lama menimpa hasil simpan yang lebih baru; bukan token otorisasi. Double click dibatasi UI, dan retry dengan revision lama ditolak. Tidak ada retry tulis otomatis.

- `CONFLICT`: muat ulang, bandingkan data terbaru, dan isi kembali perubahan yang memang diperlukan. Form absensi mempertahankan draft tetapi memblokir simpan berulang.
- `BUSY`: script lock belum tersedia; tunggu sebentar lalu muat ulang.
- `WRITE_FAILED` / `INTERNAL`: jangan menganggap belum ada data tersimpan. Muat ulang Sheets/aplikasi sebelum mencoba lagi; request dapat gagal setelah server menerima sebagian/seluruh penulisan.
- `RECOVERY_REQUIRED`: hentikan input. Administrator harus memeriksa tab terkait, duplikasi, referensi, dan AuditLog terhadap backup sebelum melanjutkan.

Sheets tidak menyediakan transaksi SpreadsheetApp lintas tab. Implementasi menyiapkan snapshot rentang terdampak, menulis hanya baris berubah, melakukan flush, lalu mengompensasi rentang yang telah dicoba bila penulisan gagal. Audit ikut dalam rencana yang sama. Pemulihan masih bisa gagal atau hasil jaringan tidak terkonfirmasi; ini **bukan jaminan transaksi atomik**. Kapasitas baris kosong yang ditambahkan tidak dihapus saat rollback. Edit manual atau script lain tidak tunduk pada script lock proyek ini.

## Yang belum tersedia

Nilai/leger, jurnal, manajemen akun guru, laporan/ekspor, pengaktifan kembali, periode tutup absensi, sesi multi-slot, histori keanggotaan dengan tanggal efektif, dan pembatasan akses mentah pada file Sheets belum diimplementasikan. Menu terkait menampilkan **Fitur dalam pengembangan**. Pengujian integrasi akun nyata, kuota Google, dan pemulihan layanan tetap perlu dilakukan sebelum persetujuan operasional sekolah.
