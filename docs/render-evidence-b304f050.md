# Analisis laporan render b304f050da18

Laporan pengguna `sia-render-b304f050da18.json` berasal dari `/dev?diagnostic=render`, build `b304f050da1899ec845c751a3df3bc864d3623f1a0fd963af7403cc10549128b`. Laporan berisi metadata statis, bukan salinan seluruh JavaScript browser. **Selisih ukuran core dapat direproduksi secara persis dengan normalisasi komentar; penyebab error pada halaman `/dev` normal belum terbukti.** Tidak dilakukan perubahan runtime aplikasi berdasarkan dugaan tersebut.

## Bukti ukuran, hash, dan sintaks

| Tahap | Byte UTF-8 | SHA-256 |
| --- | ---: | --- |
| Core build | 70.979 | `11eb3093f95dc0dd3e87ef10e04ca70bcf8cda35a844325f33fd24ddc596a09d` |
| Core setelah normalisasi komentar lokal | 69.591 | `4bbb6fcb90b45b1a6d434930ab5af06ac339c85bf83492d2c4d362188cd33b83` |
| Core dibaca server, hasil template, dan DOM diagnostik | 69.591 | `4bbb6fcb90b45b1a6d434930ab5af06ac339c85bf83492d2c4d362188cd33b83` |

Kandidat lokal mengganti komentar blok multiline dengan satu LF, komentar blok satu baris dengan spasi, dan menghapus teks komentar `//` dengan mempertahankan newline sesudahnya. Core snapshot ini memiliki 10 komentar blok, termasuk satu komentar tiga baris, serta 9 komentar baris. Hasilnya berkurang tepat **1.388 byte** dan hash-nya sama dengan tiga tahap pada laporan. Rekonstruksi ini memakai pola yang terbatas pada snapshot tersebut; hasil parsing ulang oleh esbuild juga harus sama dengan sumber asli. Ini bukan sanitizer umum untuk JavaScript, karena regex dapat salah mengenali penanda komentar dalam string atau regular expression.

Kecocokan hash dan hasil parsing menjelaskan seluruh selisih core tanpa memerlukan pemotongan string/Base64 atau hilangnya kode aplikasi. Pencocokan ini mengidentifikasi representasi yang teramati; implementasi internal Google tidak diamati langsung.

Fingerprint ketiga berkas statis lain juga dapat direkonstruksi secara persis:

| Berkas | Byte build → retrieved | Representasi yang menghasilkan ukuran dan SHA-256 laporan |
| --- | ---: | --- |
| Index | 11.089 → 11.095 | Versi build dengan newline CRLF; dua token `<?` menjadi `&lt;?` ketika dibaca sebagai HtmlOutput |
| Styles | 23.234 → 23.083 | Isi CSS sumber dengan CRLF dan wrapper LF; normalisasi komentar blok |
| RenderProbe | 8.045 → 7.966 | Satu komentar blok sepanjang 80 karakter menjadi satu spasi |

Dengan demikian, perbedaan Index/Styles terhadap checkout LF lokal dan penambahan enam byte pada Index tidak perlu dianggap sebagai JavaScript terpotong. Rekonstruksi CRLF menjelaskan representasi yang cocok dengan metadata build pengguna, bukan bukti langsung sistem operasi pengguna. Escaping `<?` pada Index yang dibaca sebagai HtmlOutput juga tidak menunjukkan bagaimana `HtmlTemplate.evaluate()` memproses scriptlet template; hasil core evaluasinya sudah diukur secara terpisah.

JavaScript kandidat tersebut lulus kompilasi Node.js tanpa dieksekusi. Template literal pesan `Pustaka` pada baris 282 tetap memiliki pembuka/penutup backtick dan interpolasi yang valid. Kemunculan sebelumnya berada pada baris 277 dalam string petik tunggal. Posisi 282 kolom 34 cocok dengan lokasi yang dilaporkan pengguna, tetapi posisi yang sama juga ada pada kandidat yang valid; nomor baris bukan bukti kerusakan literal itu.

Laporan mencatat `browser.status: complete`, `errors: []`, `coreNamespacePresent: true`, dan ketiga fingerprint server/browser di atas sama. Tidak ada carriage return maupun anotasi debug pada core diagnostik. `firstDifference: null` berarti **retrieved → DOM diagnostik** tidak berbeda; field itu tidak membandingkan build dengan retrieved. `matchesBuildCore: false` tetap benar untuk perbandingan byte mentah dan tidak dilemahkan hanya karena komentar menjelaskan selisihnya.

## Hal yang belum dapat disimpulkan

Jalur normal mengembalikan `HtmlService.createTemplateFromFile('Index').evaluate()` secara langsung. Jalur diagnostik mengambil hasil `.getContent()`, menambahkan panel/probe dan penanda script, kemudian membungkusnya kembali melalui `HtmlService.createHtmlOutput(...)`. Karena jalurnya berbeda, keberhasilan parsing diagnostik tidak membuktikan bahwa wrapper/render halaman normal menerima JavaScript yang sama.

`afterCoreReached` berarti script setelah core dijalankan; nilainya sendiri tidak membuktikan core berhasil karena browser dapat melanjutkan setelah SyntaxError. Gabungan namespace yang hadir dan tidak adanya error mendukung keberhasilan parsing core pada halaman diagnostik. Laporan tidak merekam selesainya RPC bootstrap maupun kesiapan Dashboard, sehingga keduanya belum dinyatakan berhasil.

Laporan belum menyertakan kode VM normal yang gagal. Karena itu belum ada bukti untuk menyalahkan `document.write()`, template literal, escaping, pemotongan, atau transformasi tertentu pada jalur normal. Tidak ada perubahan pada database, konfigurasi, autentikasi, fitur, desain, maupun mekanisme render normal.

## Verifikasi offline

Sesudah `npm run build`, analisis metadata laporan terhadap output build yang tersedia:

```sh
node scripts/analyze-render-report.mjs /path/sia-render-b304f050da18.json
```

Untuk salinan JavaScript VM yang diambil dari browser:

```sh
node scripts/audit-htmlservice.mjs /path/VM.js
```

Audit membandingkan kandidat `core` asli dan `core-comments-normalized`, memeriksa sintaks tanpa menjalankan kode, serta melaporkan hash/ukuran/perbedaan byte. Ketidakcocokan salinan masih perlu dibandingkan dengan sumber pada browser: salinan DevTools dapat terpotong atau mengalami perubahan saat disimpan. Pencocokan kandidat komentar tidak membuktikan semua transformasi lain aman dan tidak menggantikan pemeriksaan sumber VM yang gagal.

## Bukti berikutnya dari /dev normal

Tidak perlu menempel JavaScript ke Console, melakukan deployment, maupun mengubah data untuk langkah ini.

1. Buka `/dev` normal **tanpa** `diagnostic=render`, muat ulang, dan pastikan error `Unexpected identifier 'Pustaka'` masih muncul pada pemuatan itu. Pisahkan dari tab diagnostik agar VM yang diperiksa berasal dari halaman gagal.
2. Buka DevTools → **Console**, lalu klik tautan `VM…:282` pada error tersebut. Pada **Sources**, jangan menekan tombol pretty-print `{}` terlebih dahulu.
3. Salin baris **260–285**, termasuk seluruh isi baris dan penutup kutip/backtick. Sertakan khusus penugasan `script.textContent` dan `new Error(...Pustaka...)`. Jika posisi bergeser, ambil 20 baris sebelum error dan beberapa baris setelahnya.
4. Bila tersedia, simpan sumber JavaScript VM tersebut melalui menu konteks Sources → **Save as…**, lalu jalankan audit offline di atas. Simpan sebagai JavaScript, bukan tangkapan layar atau HTML halaman.
5. Kirim potongan sumber, keluaran audit metadata, dan konfirmasi apakah Dashboard pada tab diagnostik juga masih MEMUAT. Jangan mengirim cookie, token, HAR lengkap, email, atau data sekolah/siswa.

Perbandingan sumber normal itu dengan kandidat hash yang valid diperlukan untuk menemukan perbedaan nyata sebelum membuat perbaikan runtime minimal. Tidak ada merge, `clasp push`, migrasi, ataupun deployment otomatis dalam investigasi ini.

## Hasil pengujian

Validasi 28 Oktober 2026: `npm run check` berhasil menjalankan build, **110 tes backend/build dan 61 tes Playwright**, tanpa kegagalan atau tes dilewati. Tes baru memeriksa representasi komentar pada output build aktual, keutuhan template literal `Pustaka`, penolakan perubahan isi string/pemotongan, dan `document.write()` Admin/Guru dengan hash DOM yang tetap diperiksa persis. Bootstrap, navigasi modul operasional, dan visibilitas Pengaturan Sekolah sesuai role lulus pada fixture lokal; pengujian hash output build asli tetap dipertahankan.

CLI analisis laporan pengguna menghasilkan `EXACT_COMMENT_NORMALIZATION_REPRODUCED` untuk seluruh fingerprint. Pemeriksaan parsed-form JavaScript sebelum/sesudah normalisasi juga sama. Tidak ada perubahan pada `src/`, database, build produksi, atau dependensi. Hasil lokal ini menjelaskan laporan yang dilampirkan, tetapi belum mereproduksi error di jalur Google `/dev` normal.
