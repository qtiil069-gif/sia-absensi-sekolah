# HtmlService: isolasi bootstrap dan integritas pustaka

Untuk laporan /dev yang tetap gagal setelah PR #10, gunakan [diagnostik rendering opt-in](render-diagnostics.md). Mode admin ini menyediakan build ID serta laporan sumber/template/browser tanpa menempel JavaScript ke Console; tidak menyatakan hipotesis sourceURL sudah terbukti pada Google.

Investigasi terbaru `Unexpected identifier 'Pustaka'`: [lokasi tepat, reproduksi sourceURL dan batas bukti](htmlservice-pustaka.md). Suffix debug opsional dihapus, guard build menolak anotasi mentah, dan seluruh kode aset di DOM kini dibandingkan langsung dengan hash manifest.

Untuk dua kegagalan hash setelah merge PR #8, lihat [audit newline checkout dan document.write](htmlservice-line-endings.md). Build kini mengkanoniskan newline inline ke LF agar sumber build identik dengan script DOM pada checkout LF maupun CRLF; pemeriksaan integritas tetap persis.

Basis perubahan: main `8ea873c` (PR #7). Tidak ada perubahan Spreadsheet ID, Script Properties, schema, autentikasi, role, desain, atau data sekolah. Tidak menjalankan migrasi, clasp push, atau deployment.

## Akar kegagalan yang dibuktikan

Bundle lama mencampur DOM utilities, seluruh PDF/Excel/QR dan app.js dalam satu elemen script. Karena JavaScript mem-parsing seluruh elemen sebelum mengeksekusinya, SyntaxError di pustaka mencegah boot() sama sekali. Reproduksi pada artefak lama dengan literal ICC sengaja dipotong menghasilkan pesan document.write/Invalid or unexpected token, status MEMUAT dan window.SIA yang belum terbentuk. Inilah ketergantungan bootstrap yang diperbaiki, bukan autentikasi atau database.

Lokasi lama **baris 178 kolom 1463** tepat pada tanda kutip pembuka `iccProfileBase64` dari PDFKit dalam `pdfmake/build/pdfmake.js` (sekitar baris sumber 34855). Awal Base64 `AAAL0AAAAAACAAAAbW50clJHQi` adalah **profil warna ICC**, bukan font. Literal asli lengkap, 4.032 karakter Base64 / 3.024 byte. SHA-256 teks Base64: `9ca350b14a642343a3037850836d3b738fd6068d4029a4d2bd94e7d96fe3e6c6`.

Font Roboto pada `pdfmake/build/vfs_fonts.js` berisi empat string berukuran 209.612–217.592 karakter, total sekitar 854 KB Base64. PDFmake juga membawa kamus Brotli 69.000 karakter. Tes membandingkan ICC serta keempat string font dengan dependensi upstream, termasuk penutup tanda kutip: semuanya utuh sesudah bundling.

Artefak lama Scripts.html berukuran 3.340.452 byte, SHA-256 `2ae70a3fb8c14e4421b0dcd7bc9e786d0ab999e86b5349b8fac1929ab2b391e7`; body script 3.340.435 byte, SHA-256 `1782dac06e3868b4c5f1245d8595cfd6b1430f6959a3ba2cae46fb242139557f`. Sintaks lokal valid, dan baris terpanjang 942.662 karakter. Tidak ada bukti minifikasi memotong data atau batas ukuran HtmlService tertentu menyebabkan pemotongan. Salinan DevTools yang gagal parser belum membuktikan respons asli Google juga terpotong.

Hipotesis penghapusan XML pada investigasi sebelumnya belum dibuktikan pada Google. Fixture yang menghapus XML secara buatan diganti pengujian output utuh. Escaper untuk core dipertahankan; tidak ada transformasi XML rekaan dalam tes transport baru.

## Perubahan pemuatan

Scripts.html awal kini sekitar **71 KB**, baris terpanjang 541 karakter; tidak lagi mengandung vendor atau literal font/ICC. Dashboard, navigasi, Pengaturan Sekolah, CRUD dan absensi manual tidak memuat pustaka tersebut.

| Kelompok | Kapan dimuat | Byte JavaScript | Batch RPC pertama |
| --- | --- | ---: | ---: |
| QR | Preview kartu atau Mulai kamera | 641.072 | 4 |
| PDF | Unduh PDF kartu/data | 1.672.229 | 9 |
| Excel | Unduh Excel | 946.834 | 5 |

Build menghasilkan Asset_qr.html, Asset_pdf.html dan Asset_excel.html berisi data Base64 inert; **tidak disisipkan melalui include/template HTML awal**. Manifest kecil berisi byte/hash/ukuran bagian dipin pada core dan 00_BrowserAssets.gs. Paket pemisahan vendor berisi **24 file: 17 .gs, 6 .html, 1 manifest**; diagnostik opt-in terbaru menambah tiga file menjadi **27**. Total data transfer pustaka memakai overhead Base64, bukan klaim seluruh paket lebih kecil; penghematan terutama pada inisialisasi dan fitur yang tidak digunakan.

RPC getBrowserAsset memakai respond_/authorize_ yang sudah ada, hanya menerima whitelist tiga ID dan versi hash yang tepat. Setiap bagian paling banyak 32.768 karakter Base64; satu panggilan mengambil paling banyak delapan bagian, dua batch paralel per pustaka. Nama file tidak pernah diambil dari input pengguna. Panggilan ini read-only, tanpa penulisan Sheets, perubahan role, atau scope baru.

Browser memeriksa ID, versi, urutan/rentang, panjang bagian, panjang byte dan SHA-256 yang **dipin di core**, lalu mendecode UTF-8 secara fatal. Kode baru ditambahkan lewat script.textContent setelah verifikasi; literal vendor tidak melewati tokenizer HTML/document.write. Tidak memakai eval, Blob URL, CDN, layanan font, credential baru atau penyimpanan persisten. Semua font dan fitur PDF/Excel/QR dipertahankan. Permintaan bersamaan berbagi satu promise dan pustaka disimpan hanya dalam memori halaman; kegagalan menghapus promise agar tindakan dapat dicoba ulang.

Respons hilang, terpotong, berubah dengan panjang sama, bagian tertukar atau versi berbeda ditolak sebelum eksekusi. Error muncul pada fitur terkait; Dashboard, Pengaturan dan absensi manual tetap dapat dipakai. Kamera tidak diminta sebelum QR lolos pemeriksaan dan tidak menyala terlambat setelah pengguna meninggalkan halaman scan.

## Bukti pengujian

- Sebelum pemisahan, literal ICC yang sengaja dipotong menghentikan seluruh bootstrap. Sesudah pemisahan, kerusakan payload PDF ditolak sebelum eksekusi sementara Dashboard/menu tetap berjalan, lalu pemuatan ulang berhasil.
- Output build aktual dimasukkan lewat document.open/write/close dalam iframe lintas origin. SHA-256 body script di DOM harus sama persis dengan hasil build. Respons fixture menyatakan UTF-8, tanpa menghapus XML atau mengubah bundle.
- Ketiga pustaka yang direkonstruksi melalui RPC dibandingkan byte/hash dengan kode yang benar-benar disisipkan ke DOM. ICC, font, Unicode dan tanda kutip tetap utuh; tidak hanya menguji sintaks Node.
- Suite lama tetap memeriksa file PDF/Excel sebenarnya, ukuran kartu, QR decoder/kamera sintetis, otorisasi, CRUD dan absensi. Uji baru mencakup integritas, versi, path/rentang, deduplikasi, retry, dan pembatalan kamera.

Tidak mengklaim penyebab pemotongan pada Google telah dibuktikan, atau deployment produksi sudah pulih. Akses read-only ke script.google.com dari cloud ditolak proxy HTTP 403/CONNECT; sumber VM/network deployment aktual belum diperoleh.

Hasil final 26 Oktober 2026: **93 tes backend/build dan 49 tes Playwright lulus**, nol gagal/dilewati. `npm run build` terpisah berhasil, core Scripts.html **71.068 byte**. `npx clasp -P .clasp.json.example status` memilih tepat 24 file, tanpa melakukan koneksi/push ke proyek Google nyata. Tool audit menyatakan keempat sumber JavaScript valid dan hash/byte ketiga aset cocok manifest. `git diff --check` bersih; database, konfigurasi contoh ID, manifest/scopes, backend autentikasi, dashboard/HTML/CSS dan referensi desain tetap identik dengan main.

## Membandingkan salinan VM dengan artefak

```sh
npm run build
node scripts/audit-htmlservice.mjs
node scripts/audit-htmlservice.mjs /path/VM18.js
```

Tool hanya membaca dan memeriksa sintaks, tidak mengeksekusi kode salinan. Laporan menampilkan byte, SHA-256, UTF-8, sintaks, kesamaan persis/prefix/suffix dan offset perbedaan; tidak mencetak source atau pesan parser yang dapat mengandung data sensitif. Cocokkan dengan build/commit yang benar; identitas pustaka tersedia pada atribut data-sia-asset dan data-sha256. Suffix debug sourceURL dihapus pada investigasi Versi 9 agar marker tersebut tidak berada di literal core. Salinan yang cocok hanya sebagian menunjukkan perbedaan file, bukan dengan sendirinya membuktikan server memotongnya. Bandingkan ukuran/source browser asli sebelum copy dan hasil file sesudah copy.

## Verifikasi manual Google setelah review

1. Pertahankan .clasp.json, Script ID, APP_SPREADSHEET_ID, Script Properties, manifest/scopes dan hak akses yang sudah digunakan. Jalankan npm ci, npm run check, npm run build dan clasp status. Pastikan **semua 27 file**, termasuk tiga Asset_*.html, 00_BrowserAssets.gs dan file diagnostik, masuk paket; jangan hanya mengirim Scripts.html. Tidak ada migrasi/reset yang diperlukan.
2. Pemilik menjalankan clasp push secara manual setelah review. Buka /dev dengan akun editor yang berwenang. Pilih execution context iframe aplikasi pada DevTools; pastikan Console tanpa SyntaxError, status GOOGLE SHEETS, identitas dan statistik nyata termuat, serta Pengaturan Sekolah tersedia bagi admin dan tersembunyi bagi guru. object window.SIA.vendors awalnya kosong.
3. Uji Data Kelas, Data Siswa, dan absensi manual. Pada data uji yang disetujui, coba preview kartu, PDF kartu/data, Excel, dan kamera QR. Mulai scan tidak menyimpan kehadiran; periksa identitas lalu batalkan bila hanya memverifikasi. Periksa script[data-sia-asset] dan hash pada window.SIA.assetManifest. Uji kamera fisik HP/PC dan kebijakan iframe/CSP nyata; tes lokal tidak membuktikan izin tersebut.
4. Bila aset gagal, catat pesan fitur/Console (termasuk kemungkinan CSP), coba ulang, dan pastikan Dashboard/menu/manual tetap berfungsi. Konflik versi meminta reload, bukan mengganti ID atau memperluas izin. Panggilan pertama lebih lambat karena transfer/verifikasi; panggilan berikutnya pada halaman yang sama memakai pustaka yang sudah dimuat.
5. Setelah /dev lolos, pemilik memperbarui versi pada deployment /exec yang sama secara manual. Reload penuh dan ulangi pemeriksaan admin/guru serta ekspor/QR. Push tidak otomatis memperbarui versi /exec yang dipin.
6. Jika SyntaxError masih muncul, klik tautan sumber error sebelum pretty-print dan simpan potongan di sekitar baris/kolom, byte/hash script asli serta file salinan, commit lokal, versi Node dan deployment. Jangan membagikan cookie/token/HAR penuh/data pribadi. Jalankan tool audit pada file salinan, lalu bandingkan dengan sumber browser untuk menentukan di tahap mana perbedaan terjadi.
