# Audit SyntaxError HtmlService — 26 Oktober 2026

Basis audit: main `8ea873c` (merge PR #7), Node v24.19.0. **SyntaxError pada /exec belum berhasil direproduksi dari output build utuh. Root cause produksi belum diketahui.** Tidak ada perubahan pada build, escaper, source aplikasi, database, role, ID, desain, dependensi, atau deployment dalam audit ini.

## Koreksi terhadap reproduksi sebelumnya

PR #7 menguji fixture yang menghapus processing instruction XML secara buatan sebelum document.write. Penghapusan tersebut menghasilkan SyntaxError pada bundle lama, tetapi belum dibuktikan dilakukan oleh Google. Karena itu, hasil tes tersebut tidak membuktikan akar masalah deployment pengguna. Escaping XML/kontrol yang sudah ada dipertahankan; tidak ada alasan terverifikasi untuk mengubahnya lagi.

Fixture sekarang memasukkan output Index/Styles/Scripts aktual, hanya menyelesaikan include template seperti backend, menambahkan shim RPC lokal, dan melindungi string milik wrapper penulis. String HTML yang diberikan kepada document.write tidak dihapus, dipotong, atau di-normalisasi. Skenario admin/guru tetap berjalan di iframe lintas origin; backend memakai .gs asli dengan Sheets sintetis di memori, bukan OAuth/Sheets Google nyata.

## Temuan audit artefak aktual

| Artefak | Byte | SHA-256 |
| --- | ---: | --- |
| Index.html | 11010 | `9d7814bd025c085bc31011991d70659daf6d7e0696178e7df9872562e8a69d2c` |
| Scripts.html | 3340452 | `2ae70a3fb8c14e4421b0dcd7bc9e786d0ab999e86b5349b8fac1929ab2b391e7` |
| Styles.html | 23217 | `3c77516c8597bd7728d05f97d6d1ddfab19b991b2f5ee4ab7c35cf92aca3d15c` |

Ketiga berkas valid UTF-8, tanpa BOM, karakter pengganti U+FFFD, kontrol biner mentah, atau pemisah U+2028/U+2029. Body Scripts lolos vm.Script; tidak mengandung delimiter XML mentah dan berakhir lengkap sampai boot()/penutupan IIFE. Hanya ada satu penutup script HTML. Satu pembuka `<script>` tambahan berada di literal milik vendor; browser tetap mempertahankan seluruh body script secara identik, sehingga temuan itu sendiri bukan bukti pemotongan HTML.

Frontend tidak memanggil document.write/eval atau menyisipkan innerHTML untuk bootstrap. Template Index menyisipkan Styles/Scripts melalui include_ yang sudah ada; tidak ada perubahan pada autentikasi atau routing. Baris 178 kolom 1463 pada Scripts lokal berada dekat literal base64 milik vendor dan lolos parser. Lokasi VM18 tidak otomatis sama dengan nomor baris berkas dist: VM adalah nama dinamis dari Chrome untuk script yang dibuat saat runtime. Diperlukan sumber VM aktual untuk menyamakan offset.

## Perubahan pengujian

- Tes admin/guru kini menjalankan hasil build utuh lewat document.open/write/close, tanpa transformasi XML rekaan.
- SHA-256 body script yang dibaca dari DOM browser harus sama dengan body Scripts.html asli. Selain itu, tes menunggu bootstrap/dashboard, identitas, navigasi siswa, serta Pengaturan Sekolah yang hanya tersedia bagi admin.
- Pemeriksaan hash menemukan masalah fixture: wrapper yang disajikan tanpa charset membaca UTF-8 sebagai Windows-1252 (misalnya elipsis menjadi mojibake). Kedua respons fixture kini menyatakan `text/html; charset=utf-8`. Assertion hash gagal sebelum koreksi charset dan lulus setelahnya. **Itu masalah fixture, bukan root cause SyntaxError Google yang telah terbukti.**
- Satu uji kontrol negatif sengaja memotong string panjang pada bundle aktual sambil mempertahankan penutup script. Chromium menghasilkan pesan persis `Failed to execute 'write' on 'Document': Invalid or unexpected token`; UI tetap MEMUAT, menu admin tersembunyi, dan bootstrap tidak dimulai. Ini membuktikan tes mendeteksi kelas kegagalan tersebut, bukan membuktikan Google memotong bundle.

Tidak ada reproduksi gagal-sebelum/lulus-sesudah untuk bug produksi, sehingga audit ini tidak mengklaim bug /exec sudah diperbaiki. Tes build tentang escaping, nilai XML/regex/biner, dan penutup script tetap dijalankan.

## Hasil pengujian — 26 Oktober 2026

- `npm run check`: **81 tes backend/build dan 40 tes browser lulus**, nol gagal/dilewati.
- `npm run build` terpisah: berhasil, 19 berkas (15 .gs, 3 .html, 1 manifest).
- `git diff --check` bersih. Source aplikasi/backend, build/escaper, database, dev, manifest, dependensi/lock, contoh ID dan referensi dashboard tetap identik dengan main 8ea873c. Perubahan hanya pada satu berkas tes iframe dan dua dokumentasi.
- Tidak ada clasp push, perubahan Google Sheets, migrasi, perubahan autentikasi/desain, atau deployment. Akses read-only ke URL Web App terhalang jaringan cloud.

## Bukti browser yang diperlukan

URL Web App yang diberikan sebelumnya dicoba kembali read-only pada 26 Oktober; proxy jaringan menghasilkan ERR_TUNNEL_CONNECTION_FAILED, sehingga respons Google dan sumber VM tidak dapat dibaca dari cloud ini.

1. Buka /exec yang gagal, lalu DevTools → Console. Klik tautan error terbaru seperti VM18:178:1463 untuk membuka Sources.
2. Sebelum menekan pretty-print `{}`, salin sekitar 200 karakter sebelum/sesudah kursor. Sertakan pesan error lengkap serta baris/kolom. Nomor VM dapat berubah setelah reload.
3. Dari folder yang benar-benar dipakai untuk push, kirim `git rev-parse HEAD`, `node --version`, serta ukuran/hash tiga berkas HTML. Perintah Node berikut bekerja tanpa koneksi Google dan tidak membaca credential:

```sh
node -e "const fs=require('node:fs'),c=require('node:crypto');for(const n of ['Index.html','Scripts.html','Styles.html']){const b=fs.readFileSync('dist/'+n);console.log(n,b.length,c.createHash('sha256').update(b).digest('hex'))}"
```

4. Jika tersedia, catat header Content-Type/charset respons userCodeAppPanel pada Network dan nomor versi deployment yang dipakai. Jangan membagikan cookie, token, HAR penuh, atau data pribadi.

Potongan VM membedakan kode terpotong, escape yang berubah, karakter tersisip, atau artefak deployment yang berbeda. Hash lokal membedakan hasil build/commit yang berbeda. Tanpa bukti tersebut, perubahan tambahan pada source/build hanya menjadi dugaan. Tidak perlu menjalankan migrasi, reset database, mengganti ID/role, atau melakukan deployment baru untuk mengambil bukti ini.
