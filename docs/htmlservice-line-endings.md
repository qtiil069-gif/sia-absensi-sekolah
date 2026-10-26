# Hash document.write dan line ending checkout

Basis: main `1c0b9a4` (merge PR #8). Dua kegagalan hash direproduksi pada checkout CRLF terpisah; tidak ditemukan kerusakan JavaScript atau SyntaxError dalam reproduksi ini.

## Reproduksi dan perbedaan pertama

Checkout main dengan LF: kedua tes `document.write executes the unmodified generated bundle...` lulus sebelum perubahan. Salinan Git terisolasi di /tmp memakai `core.autocrlf=true`, checkout commit fitur `d6ea5af`, lalu menjalankan `git merge --no-edit origin/main` dengan origin/main menunjuk `1c0b9a4`. Merge menjadi fast-forward, sama seperti sinkronisasi cabang fitur yang sudah masuk main. Ini mereproduksi workflow merge dan isi main; hash commit atau perubahan lokal tambahan milik pelapor tidak tersedia dan tidak diasumsikan identik.

Tidak menjalankan reset, renormalize atau menimpa pekerjaan pada checkout pengguna. Pengaturan autocrlf hanya berlaku pada salinan uji.

Sumber frontend CRLF dibaca apa adanya oleh build, lalu dimasukkan ke elemen script. Parser HTML menormalisasi CRLF dan lone CR menjadi LF **sebelum** JavaScript dieksekusi dan sebelum textContent dibaca. JSON escaping pada wrapper document.write mempertahankan CRLF pada string yang ditulis; perubahan terjadi ketika HTML itu diparsing, bukan ketika JSON.stringify/replace dipanggil. Escaper sebelumnya membiarkan CR/LF tetap mentah.

| Pengukuran sebelum perbaikan | Body build CRLF | Body script DOM |
| --- | ---: | ---: |
| Byte UTF-8 | 72.300 | 71.051 |
| CR | 1.249 | 0 |
| SHA-256 | `f41f21c82c17b9add3d0bc69b2e213a8c7d58cb6f09ef1e5ec0190d5300c8c56` | `7e31ceea446f97b1876ac510a6a0f8738be7481a950c4f8b3366e3a209ed7589` |

Perbedaan pertama berada di **offset byte 71 (nol), baris 2**: byte build 0D/CR diganti byte DOM 0A/LF, tepat setelah komentar awal `...always text nodes. */`. Membandingkan seluruh isi menunjukkan `source.replace(/\r\n?/g, '\n') === rendered`; tidak ada perbedaan isi lain. Kedua tes gagal pada assertion hash baris 74, setelah bootstrap/statistik Admin dan Guru sudah berhasil; tidak ada pageerror/SyntaxError.

Ini adalah transformasi newline standar parser HTML, bukan bukti HtmlService memotong data. Assertion integritas memang mendeteksi representasi yang berbeda. Perbaikannya menghasilkan representasi HTML yang kanonis saat build, bukan mengendurkan pembandingan.

## Perubahan

`escapeHtmlServiceScript()` sekarang mengubah CRLF maupun lone CR fisik menjadi LF sebelum escaping XML/kontrol. Ini mencakup script core dan preview/demo karena build melewatkan keduanya melalui helper yang sama. Tidak mengubah skrip pustaka RPC, payload Base64, manifest integritas, atau fungsi frontend/backend.

Literal escape dua karakter `\r`/`\n` tidak diubah. Nilai runtime normal/tagged template, line continuation, Unicode, kutip, Base64 dan XML tetap sama. ECMAScript/HTML memang menormalisasi newline fisik pada template; tes memeriksa hasil runtime, bukan hanya sintaks.

`tests/ui/iframe-navigation.spec.mjs` tidak diubah: sumber yang diharapkan tetap body script hasil build dan dibandingkan SHA-256 persis dengan script DOM, tanpa trim/replace/normalisasi pada assertion. Build test juga menolak CR mentah pada core. Dua tes Node dan tiga tes browser baru melindungi kasus LF, CRLF dan lone CR serta mempertahankan deteksi perubahan konten/trailing byte. Tes pemotongan dan korupsi pustaka sebelumnya tetap dijalankan.

## Hasil dan batasan

Sesudah perbaikan, Scripts.html lengkap dari checkout LF dan CRLF **identik byte-per-byte**, ukuran 71.068 byte, SHA-256 `637ffd3f0f59967cef626397d88af6d654e5e3858d200eaa94b2ebc966ec2b77`. Body-nya 71.051 byte, hash `7e31ceea446f97b1876ac510a6a0f8738be7481a950c4f8b3366e3a209ed7589`.

Validasi 26 Oktober 2026: `npm run check` dijalankan penuh pada kedua checkout, masing-masing **95 tes backend/build dan 52 tes browser lulus**, nol gagal/dilewati. Dua kegagalan hash asli dan dua tes Node baru gagal sebelum perbaikan, lalu lulus setelahnya. Build terpisah juga berhasil menghasilkan 24 file. Pemeriksaan diff memastikan assertion iframe, src frontend/backend, database, dependensi, manifest dan konfigurasi contoh ID tetap identik dengan main.

Tidak perlu mengganti core.autocrlf pada mesin pengguna atau melakukan checkout/reset untuk mendapatkan hasil build yang benar. Tidak ada perubahan database/schema/ID/role, kartu ID, QR, PDF, Excel, desain, migrasi, clasp push atau deployment pada pekerjaan ini. Perbaikan ini menyelesaikan ketidakcocokan hash yang direproduksi; tidak membuktikan pemulihan deployment Google tertentu yang belum diuji langsung.
