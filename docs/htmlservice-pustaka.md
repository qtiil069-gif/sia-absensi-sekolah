# Investigasi Unexpected identifier Pustaka — Versi 9

Basis: main `6a8cbd0` (merge PR #9). Tidak ada perubahan database, data sekolah, ID, autentikasi, role, schema, desain, migrasi, clasp push atau deployment.

## Inventaris dan lokasi

Ada dua kemunculan `Pustaka` di frontend, keduanya pada lib/asset-loader.js: pesan pustaka tidak dikenal (baris 68), dan template pesan gagal memuat/verifikasi (baris 73). Backend 91_BrowserAssets.gs juga memiliki satu pesan Pustaka, tetapi tidak disisipkan ke JavaScript frontend. Config/template Index/Styles tidak memiliki kata tersebut. Data sekolah tidak menjadi sumber kata ini.

Sebelum perubahan, template pesan frontend baris 73 menjadi dist/Scripts.html baris 283 kolom 34. Setelah envelope `<script>\n` dilepas, posisinya **baris 282 kolom 34**, tepat seperti laporan VM31. Kolom 33 adalah backtick U+0060, kolom 34 adalah P U+0050. Pesan ini merupakan literal aplikasi, bukan bukti handler kegagalan download sudah dijalankan: SyntaxError terjadi sebelum bootstrap dapat mulai.

Output build asli sebelum perbaikan valid pada Node dan Chromium document.write. Scripts.html: 71.068 byte, SHA-256 `637ffd3f0f59967cef626397d88af6d654e5e3858d200eaa94b2ebc966ec2b77`; body 71.051 byte, SHA-256 `7e31ceea446f97b1876ac510a6a0f8738be7481a950c4f8b3366e3a209ed7589`.

## Mekanisme yang berhasil direproduksi

Baris VM sekitar 269 berisi anotasi debug sourceURL di dalam template literal:

```js
script.textContent = source + `\n//# sourceURL=sia-asset-${asset}-${meta.sha256.slice(0, 12)}.js\n`;
```

Pass penghapusan anotasi yang mencari marker `//# sourceURL` hingga akhir baris tanpa memahami batas string akan turut menghapus penutup backtick/semicolon. Literal pada baris 269 menjadi tidak tertutup. Backtick sebelum Pustaka pada baris 282 lalu menutup literal sebelumnya, sehingga **Pustaka menjadi identifier di luar string**.

Reproduksi memakai HTML hasil build aktual dan document.write dalam iframe, dengan satu pass penghapusan anotasi yang dinyatakan eksplisit. Sebelum perbaikan, tes admin dan guru gagal dengan pesan persis:

```text
Failed to execute 'write' on 'Document': Unexpected identifier 'Pustaka'
```

Tidak ada penghapusan kata Pustaka, perubahan pesan aplikasi, data, atau otorisasi. Lokasi serta jenis error cocok dengan laporan. Namun, **ini membuktikan mekanisme fault model, bukan membuktikan Google benar-benar menjalankan pass tersebut**. VM31/response Google asli belum tersedia; akses cloud sebelumnya terhalang proxy. Jangan menganggap uji ini rekaman implementasi internal HtmlService.

## Perubahan minimal

- Hapus suffix debug opsional; gunakan `script.textContent = source`. Identitas/hash aset tetap ada di data-sia-asset dan data-sha256, dan fungsi kartu/PDF/Excel/QR tidak berubah.
- Helper build menolak marker sourceURL/sourceMappingURL mentah, termasuk di dalam literal string, agar pola rentan tidak masuk core lagi. Newline/escaping/hash tetap dipertahankan.
- Core tidak lagi memiliki marker tersebut; pass penghapusan anotasi sekarang tidak mengubah satu byte pun pada core. Assertion hash iframe tetap membandingkan seluruh body tanpa trim/normalisasi.
- Tes aset sekarang membandingkan **seluruh** teks script DOM dengan hasil decode/pinned hash, tanpa membuang suffix debug. Ini memperketat pemeriksaan byte.

## Hasil lokal

Dua tes browser baru dan satu tes Node baru gagal sebelum perubahan, lalu lulus sesudahnya. `npm run check`: **96 tes backend/build dan 54 tes Playwright lulus**, nol gagal/dilewati. Termasuk bootstrap admin/guru, menu Pengaturan Sekolah, integritas, retry, PDF/Excel nyata, kartu, QR dan seluruh fitur lama. Build terpisah menghasilkan 24 file.

Scripts.html baru: 70.996 byte, SHA-256 `2e1237cd288d692b46c2898a505aab260bf0d832f1638d902320bf3a4a729c55`; body 70.979 byte, SHA-256 `11eb3093f95dc0dd3e87ef10e04ca70bcf8cda35a844325f33fd24ddc596a09d`. Dua pesan Pustaka tetap ada; marker anotasi mentah nol. Data/dependensi vendor tidak diubah, dan semua byte aset di DOM cocok dengan manifest.

## Bukti tambahan untuk konfirmasi Google

Buka error VM31:282:34 pada Console agar Sources menampilkan kode yang gagal. **Sebelum pretty-print**, kirim seluruh baris 266–285, khususnya:

1. Penugasan `script.textContent = source + ...` sekitar baris 269, termasuk seluruh akhir baris/backtick/semicolon.
2. Baris `new Error(...Pustaka...)` sekitar 282, beserta beberapa baris sebelum/sesudahnya.

Nomor VM bisa berubah setelah reload. Periksa apakah anotasi dan penutup literal pada 269 hilang atau berubah. Jika baris tersebut utuh, mekanisme yang diuji belum menjelaskan transformasi nyata dan perlu diperiksa sumber sebelumnya. Sertakan commit build, versi deployment dan apakah sumber diambil sebelum pretty-print/copy; jangan sertakan token, cookie atau data pribadi.

Gunakan `node scripts/audit-htmlservice.mjs /path/VM31.js` untuk membandingkan ukuran/hash/sintaks tanpa mengeksekusi kode salinan. Salinan yang tidak cocok atau terpotong tetap perlu dibandingkan dengan source browser aslinya. Sampai bukti itu tersedia dan Web App diuji pemilik, tidak menyatakan deployment Google Versi 9 sudah pulih.
