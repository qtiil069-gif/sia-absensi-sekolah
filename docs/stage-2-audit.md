# Audit sebelum implementasi tahap 2

Basis: `main` commit `c34951c` (merge fondasi `058ba61`). Checkout cloud sebelumnya berada pada branch fondasi; tidak ada perubahan lokal saat audit. Seluruh struktur src, build, skema, dokumentasi, dan tes diperiksa sebelum perubahan. Gambar `docs/dashboard-reference.jpeg` tetap digunakan, tidak ditimpa.

| Area | Sebelum tahap 2 | Tindakan tahap 2 |
| --- | --- | --- |
| Navigasi | Hash router tersedia untuk semua menu | Router dipakai ulang; tautan internal dicegat agar tetap di iframe HTML Service; perlindungan draft absensi ditambahkan |
| Dashboard | Berfungsi dengan statistik dan grafik | Desain dan renderer dipertahankan; pilihan kelas disegarkan setelah mutasi |
| Data Kelas | Tabel baca, tanpa form | Pencarian/filter, tambah/edit/nonaktif khusus admin |
| Data Siswa | Tabel baca semua baris, tanpa pagination | Pencarian/filter, pagination server, tambah/edit/nonaktif dan perpindahan kelas khusus admin |
| Absensi | Placeholder | Roster aktif, sesi harian/mapel, simpan/edit dengan lock dan pemeriksaan versi |
| Nilai, jurnal, akun guru, laporan | Placeholder | Pesan jelas “Fitur dalam pengembangan”; tanpa penyimpanan palsu |
| API | doGet, getBootstrap, getDashboard, listClasses, listStudents | API lama dipertahankan, endpoint operasional ditambahkan |
| Database | 15 tab, skema v1 | Nama tab, header, urutan kolom, dan versi tidak berubah |
| Otorisasi | Session Google → Pengguna aktif → role; guru kelas wali/penugasan | Dipakai untuk setiap RPC, ID akun duplikat ditolak; mutasi master admin; mapel butuh penugasan yang cocok |
| Penulisan | Hanya initializer manual berakhiran `_` | Validasi, script lock, revision, audit, penulisan bulk, kompensasi kegagalan |
| UI reusable | DOM aman, tabel, grafik, palet pastel, layout mobile | Semuanya digunakan kembali; helper form dan tiga page controller ditambahkan |
| Demo | Fixture browser statis | Backend .gs yang sama melalui runtime Sheets dalam memori, terpisah dari paket clasp |

Tidak ada Script ID atau Spreadsheet ID yang diubah. `.clasp.json` tidak tersedia pada checkout cloud ini dan tidak dibuat. Manifest Apps Script juga dipertahankan. Informasi deployment yang sudah berhasil berasal dari pengguna; integrasi Google nyata untuk kode tahap 2 belum diuji dari lingkungan ini.

Batas yang tetap perlu ditinjau: izin langsung ke file Sheets pada mode USER_ACCESSING, perilaku identitas Google/Workspace, akses perubahan manual di luar script lock, kuota dan histori panjang, serta kegagalan jaringan saat rollback. Mock lokal tidak membuktikan keamanan atau transaksi atomik pada layanan Google.
