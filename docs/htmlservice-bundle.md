# Regresi SyntaxError pada bundle HtmlService

Basis perbaikan: main `8de5fac` (merge PR #6), Node v24.19.0. Tidak ada perubahan backend, schema, role, ID, frontend, atau dependensi.

## Temuan dan reproduksi

Bundle Stage 3 lolos `vm.Script` dan browser yang menerima HTML utuh secara langsung, termasuk document.write() tanpa pemrosesan tambahan. Karena itu, tes lama tidak membuktikan ketahanan paket terhadap pemrosesan HTML sebelum browser mengeksekusi script.

Audit dist/Scripts.html menemukan empat pembuka `<?` dan lima penutup `?>` dalam literal XML milik pustaka PDF/Excel, serta 80 karakter kontrol biner mentah pada literal pustaka. Contoh rentan di ExcelJS adalah `h.push("<?xml"),o(h,f),h.push(` diikuti template literal berisi penutup XML. Jika sebuah pemroses HTML menghapus processing instruction di antara kedua delimiter tersebut, ia juga menghapus tanda kutip/kode JavaScript di tengahnya. Bundle yang semula valid menjadi tidak valid, sementara bootstrap belum sempat dijalankan. Dashboard tetap MEMUAT dan menu admin tetap tersembunyi; itu tidak membuktikan kegagalan otorisasi.

Fixture iframe kini memiliki mode documentWriteTransport: setelah include Styles/Scripts diselesaikan, ia memodelkan satu pass penghapusan processing instruction XML, lalu menulis HTML ke dokumen melalui document.open/write/close. Wrapper luar memakai JSON dan escape `<`, sehingga tidak memperkenalkan penutupan script tambahan.

**Sebelum perbaikan**, kedua skenario admin/guru gagal di Chromium dengan pesan persis:

```text
Failed to execute 'write' on 'Document': Invalid or unexpected token
```

**Sesudah perbaikan**, keduanya harus memuat bootstrap/dashboard melalui backend .gs di memori, identitas akun, navigasi Data Siswa, dan menu/form Pengaturan Sekolah hanya untuk admin, tanpa pageerror atau navigasi keluar iframe.

Fixture adalah model pemrosesan transport, bukan implementasi lengkap atau rekaman internal Google. Sumber VM18/HTML respons Versi 6 belum tersedia pada pekerjaan ini. Mekanisme lokal di atas berhasil direproduksi; kecocokan persis dengan perubahan HTML yang dilakukan deployment Google tetap perlu dibandingkan dengan sumber DevTools aktual. URL Web App yang diberikan pengguna dicoba secara read-only, tetapi proxy jaringan menolak CONNECT dengan HTTP 403; Chromium menghasilkan ERR_TUNNEL_CONNECTION_FAILED. Respons aplikasi Google tidak berhasil dibaca, dan tidak ada deployment Google yang dijalankan.

## Perbaikan build

`scripts/htmlservice-script.mjs` menerapkan escaping setelah bundling:

- `<?` menjadi `\u003c?`, dan `?>` menjadi `?\u003e` di sumber JavaScript. Browser mengembalikan nilai karakter semula saat mengeksekusi literal; pemroses HTML tidak melihat delimiter mentah.
- Karakter kontrol C0 selain tab/CR/LF, serta DEL, ditulis sebagai Unicode escape, mempertahankan byte nilai runtime tanpa karakter kontrol mentah dalam HTML.
- Penutup script literal yang dapat memutus elemen HTML ditolak saat build, termasuk variasi kapitalisasi. Esbuild sudah meng-escape penutup script milik vendor; guard juga melindungi source aplikasi yang digabung tanpa bundling.

Source setelah escaping diperiksa kembali dengan vm.Script dan dipakai oleh dist maupun preview. Tidak ada eval, loader baru, CDN, perubahan pustaka, atau modifikasi proses autentikasi. Helper ini ditujukan untuk source bundle yang dihasilkan proyek; jangan menjalankan encoding ulang setelah hasilnya dikirim sebagai HTML.

Tes Node membandingkan nilai XML, regex, karakter biner, dan teks khusus sebelum/sesudah escaping, memeriksa idempotensi, guard penutup script, serta tidak adanya delimiter/kontrol mentah dalam artefak. Suite browser yang sudah ada tetap memeriksa parsing Excel asli, PDF kartu/data, decoding QR, CRUD, absensi manual/QR dan otorisasi.

## Hasil lokal — 24 Oktober 2026

- Regresi sebelum perbaikan: dua tes iframe gagal dengan pesan document.write/SyntaxError persis seperti laporan. Setelah perbaikan: keduanya lulus.
- `npm run check`: **81 tes backend/build dan 39 tes browser lulus**, nol gagal/dilewati. Termasuk ekspor Excel/PDF, kartu ID, QR, role, bootstrap dan navigasi.
- `npm run build` terpisah: berhasil, 19 berkas; Scripts.html tidak mengandung delimiter XML atau kontrol biner mentah dan hanya memiliki satu penutup script.
- `npx clasp status`: dijalankan, gagal dengan `Project settings not found` karena .clasp.json lokal tidak tersedia. Pemeriksaan offline `npx clasp -P .clasp.json.example status` berhasil memilih tepat 19 berkas dist, tanpa berkas lain.
- `git diff --check` bersih. Seluruh source frontend/backend, dev, database, manifest, contoh ID, dependensi/lock dan gambar referensi identik dengan main 8de5fac. Perubahan hanya pada build, tes, dan dokumentasi.
- Tidak ada migrasi, perubahan konfigurasi Google, clasp push, atau deployment yang dijalankan. Pengujian terhadap Web App Google Versi 6 belum dilakukan.

## Pemeriksaan dan pembaruan manual

```sh
npm ci
npm run check
npm run build
npx clasp status
```

Pertahankan .clasp.json lokal dan proyek/Spreadsheet ID yang sudah digunakan. Jika workspace baru tidak memiliki .clasp.json, status default akan gagal; itu tidak membatalkan build. `npx clasp -P .clasp.json.example status` dapat memeriksa daftar berkas secara offline, tetapi bukan bukti koneksi ke proyek Anda. Jangan menimpa konfigurasi lokal dengan contoh ID.

Setelah review, pemilik dapat menjalankan `npx clasp push` secara manual, memeriksa test deployment `/dev`, lalu memperbarui deployment `/exec` yang sama ke versi baru melalui Manage deployments. Uji admin dan guru secara terpisah, periksa Console tanpa SyntaxError, dashboard selesai memuat, serta menu Pengaturan Sekolah hanya untuk admin. Jika masih gagal, simpan sumber VM dan respons HTML yang telah disanitasi dari token/data pribadi untuk membandingkan transformasi transport sebenarnya.

Jangan menjalankan migrasi/initializer/reset atau mengganti ID untuk perbaikan ini. Push source saja tidak memperbarui versi deployment /exec yang dipin. Tidak ada clasp push atau deployment otomatis pada pekerjaan ini.

Untuk mengambil bukti dari Versi 6: buka DevTools → Console, klik tautan VM18:178:1463 pada error untuk membuka Sources, lalu salin sekitar 100–200 karakter sebelum/sesudah kursor. Ambil sebelum menekan pretty-print `{}` agar lokasi tetap cocok. Nomor VM bisa berubah setelah reload; pakai tautan error terbaru. Jangan sertakan token, identitas, atau data pribadi. Bukti ini memungkinkan perbandingan langsung terhadap karakter yang berubah pada transport Google, tanpa operasi database.
