# Diagnostik rendering /dev tanpa JavaScript di Console

Analisis laporan pengguna yang sudah diterima tersedia di [Analisis laporan render b304f050da18](render-evidence-b304f050.md). Laporan itu menjelaskan selisih core 1.388 byte melalui normalisasi komentar yang menghasilkan hash persis sama; penyebab error pada jalur normal tetap memerlukan sumber VM normal yang gagal.

Basis investigasi: main `fc5a01d` (merge PR #10). Bukti pengguna menunjukkan /dev masih MEMUAT dengan Unexpected identifier Pustaka; karena itu deployment /exec lama bukan penjelasan yang memadai. **Penyebab transformasi pada Google belum terbukti.** SourceURL sudah dihapus pada main; uji filter sourceURL sebelumnya tetap merupakan model lokal, bukan rekaman HtmlService.

## Audit jalur dan asal teks

Jalur normal tetap doGet → HtmlService.createTemplateFromFile('Index').evaluate() → force-print include_('Styles'/'Scripts') → HtmlService.createHtmlOutputFromFile(...).getContent() → renderer/wrapper Google → parsing browser/document.write. Normal doGet dan include whitelist tetap dipakai; tidak ada perubahan pada kode operasional, desain, autentikasi, hak akses, ID, properties, atau schema.

Core frontend memiliki dua literal Pustaka pada asset-loader.js: pesan pustaka tidak dikenal dan template pesan gagal memuat/verifikasi. Ada satu pesan backend-only pada 91_BrowserAssets.gs. Index/Styles/config tidak menyisipkan kata tersebut. Probe baru juga memakai kata Pustaka sebagai token pencarian/klasifikasi; probe hanya dimuat dalam mode diagnostik, bukan core normal.

Core main saat ini valid secara sintaks, tanpa marker sourceURL mentah, delimiter XML mentah, penutup script prematur, atau kontrol biner. Scripts.html normal tetap 70.996 byte, SHA-256 `2e1237cd288d692b46c2898a505aab260bf0d832f1638d902320bf3a4a729c55`; body 70.979 byte, SHA-256 `11eb3093f95dc0dd3e87ef10e04ca70bcf8cda35a844325f33fd24ddc596a09d`. Posisi template error berkaitan dengan VM sekitar baris 282 kolom 34, tetapi nomor VM/offset dapat berubah akibat wrapper atau newline; tidak diasumsikan identik tanpa source browser.

Tidak ditemukan kesalahan sintaks baru yang terbukti pada source tersebut. Tidak dilakukan perubahan lain pada pesan Pustaka/backtick hanya agar lokasi error berpindah. Diagnostik berikut mengumpulkan bukti sebelum menentukan perbaikan lanjutan.

## Empat tahap bukti

1. **Build lokal:** 00_RenderBuild.gs dan .preview/render-build.json memuat identitas build deterministik, ukuran/SHA-256 Index, Styles, Scripts, RenderProbe serta body core. ID juga dipengaruhi source backend, manifest dan schema, tanpa Git refs, waktu, credentials atau environment. Output npm run build menampilkan renderBuildId untuk dibandingkan dengan server.
2. **Sumber yang dibaca server:** mode diagnostik membaca empat file lewat HtmlService.getContent dan membandingkan ukuran/hash dengan manifest build. ID atau hash yang tidak cocok menunjukkan artefak yang berbeda; itu belum membuktikan sebabnya (misalnya paket campuran, normalisasi layanan, atau jalur sumber berbeda).
3. **Hasil template:** server mengevaluasi Index melalui include_ yang sama dan mencatat fingerprint HTML/core. Jika core hilang, eksternal, atau ambigu, diagnostik tidak memilih script terakhir secara sembarang; laporan server mandiri tetap tersedia.
4. **Browser:** probe kecil independen sebelum/sesudah core mengukur teks script yang benar-benar ada di DOM. Core diberi id hanya pada halaman diagnostik; body-nya tidak diubah. Probe membandingkan ukuran/hash, offset perbedaan pertama serta code unit/posisi quote di sekitar Pustaka. Report mengklasifikasikan error dan menyimpan baris/kolom, tanpa message/stack/URL mentah.

HTML diagnostik menambahkan panel/probe dan dibungkus sebagai HtmlOutput. Karena instrumentasi ini dapat memengaruhi perilaku renderer, perbedaan browser berarti ada perbedaan antara hasil template dan DOM **pada jalur diagnostik**; jangan langsung mengatribusi perubahan itu kepada satu komponen internal Google. Jika diagnostik sehat tetapi /dev normal gagal, ambil source VM dari halaman normal dan bandingkan konteks/frame/artefaknya.

## Batas aman

Mode hanya aktif untuk query `diagnostic=render`, memakai admin_(authorize_()) yang sudah ada. Halaman normal tidak memiliki panel/probe, tidak melakukan hashing tambahan, dan mempertahankan markup/core yang sama. Diagnostik baca-saja; tidak menulis Sheets, mengubah role/properties, menjalankan migrasi, menyimpan log, atau mengirim laporan ke pihak lain.

Report tidak membaca document.innerHTML, tabel, nama akun, email, atau data siswa. Report hanya berisi metadata build/core: hash/ukuran, jumlah quote/marker, code unit pada posisi perbedaan, dan kategori error numerik. Code pembanding static core disediakan dalam Base64 tersembunyi, bukan isi report unduhan. Script statis ini bukan data hasil bootstrap. Probe tidak bergantung pada window.SIA/vendor dan memakai sintaks ES5/ASCII, tanpa template literal/sourceURL.

Panel berisi ID build dan JSON server sebagai HTML statis; tetap bisa disalin bila probe/core gagal. Probe yang berjalan menyediakan tombol unduh JSON dan refresh. Tidak perlu memasang ekstensi atau menempel JavaScript ke Console. Jika iframe/CSP membatasi download, pilih dan salin isi kotak laporan. Menonaktifkan mode cukup dengan membuka /dev tanpa query; tidak ada perubahan konfigurasi persisten.

## Langkah pemilik pada /dev

Kode diagnostik belum dipasang ke Google oleh agen. Setelah review dan pemasangan manual oleh pemilik pada proyek yang sama:

1. Jalankan npm run build lokal, catat renderBuildId. Paket sekarang **27 file** (19 .gs, 7 .html, 1 manifest), termasuk 92_RenderDiagnostics.gs, 00_RenderBuild.gs dan RenderProbe.html. Gunakan konfigurasi/ID yang sudah ada; jangan menjalankan initializer/migrasi/reset atau mengganti hak akses.
2. Buka URL /dev yang baru saja diuji dengan akun Google admin yang sudah terdaftar. Tambahkan `?diagnostic=render` (atau `&diagnostic=render` jika URL sudah memiliki query). Tidak perlu membuat deployment /exec baru untuk membaca /dev.
3. Cari judul **Diagnostik rendering** dan ID build. Cocokkan dengan renderBuildId lokal. Jika panel sama sekali tidak muncul, catat bahwa request diagnostik belum ditangani oleh source yang dilayani; periksa query/path/proyek sumber dengan bukti tersebut, bukan langsung mengganti ID. Jika hanya pesan tidak tersedia, pastikan akun admin yang sudah berwenang serta paket file lengkap; halaman itu tidak membocorkan rincian akses atau exception.
4. Tunggu status laporan browser siap, klik **Perbarui laporan**, lalu **Unduh laporan JSON**. Jika probe tidak berjalan/status tetap menunggu, pilih kotak **Laporan diagnostik**, tekan Ctrl+A lalu Ctrl+C saat fokus di kotak itu, dan kirim teksnya. Ini menyalin metadata, bukan kode Console atau data sekolah.
5. Buka /dev normal tanpa query di tab terpisah. Catat apakah error yang sama masih muncul dan kirim JSON diagnostik beserta renderBuildId lokal. Jangan mengklik tindakan simpan/migrasi hanya untuk mengumpulkan laporan ini.

## Membaca hasil

| Temuan | Arti yang dapat dibuktikan |
| --- | --- |
| Build ID server berbeda dari output lokal | Paket/identitas build yang dilayani berbeda; belum tahu penyebabnya |
| server.retrievedCore.matchesBuild false | Core yang dibaca lewat HtmlService tidak sama dengan core yang dipin build |
| server.evaluated.coreMatchesRetrieved false | Core hasil evaluasi template berbeda dari sumber yang dibaca |
| browser.status complete dan browser.matchesEvaluatedCore false | Core DOM diagnostik berbeda dari hasil template; firstDifference memberi posisi/code unit pertama |
| Semua core cocok tetapi /dev normal gagal | Belum ada bukti core diagnostik rusak; periksa source VM/frame halaman normal dan efek instrumentasi |
| Report browser pending/tidak tersedia tetapi laporan server ada | Probe tidak berjalan/selesai; fingerprint server masih dapat dipakai |
| Core ambigu atau tidak ada | Halaman mandiri melaporkan kondisi itu tanpa menjalankan kandidat yang tidak pasti |

Nilai null pada pembandingan berarti belum dapat dipastikan (misalnya API hash tidak tersedia), bukan mismatch. Perbedaan Index/Styles saja dapat disebabkan representasi HTML/newline; tidak otomatis menunjukkan JavaScript rusak. Gunakan perbandingan body core, bukan hanya hash seluruh halaman. Fingerprint DOM berlaku untuk script yang diberi marker, bukan semua VM/skrip host Google.

## Bukti tambahan bila masih diperlukan

Dari tab /dev normal yang gagal: buka DevTools → Console, klik tautan error VM (tanpa menempel kode). Pada Sources sebelum pretty-print, salin baris sekitar 266–285, khususnya penugasan script.textContent sekitar 269 dan new Error(...Pustaka...) sekitar 282, termasuk seluruh penutup quote/baris. Jika lokasi berubah, ambil 15–20 baris sebelum error dan beberapa setelahnya. Jangan menyalin cookie, token, HAR penuh atau data pribadi.

`node scripts/audit-htmlservice.mjs /path/VM.js` memeriksa ukuran/hash/sintaks file salinan tanpa mengeksekusinya. Kegagalan file salinan masih harus dibandingkan dengan sumber browser asli; proses copy juga bisa mengubah/potong teks. Network response Content-Type/charset dan identitas execution frame juga membantu jika source berbeda, tetapi report tidak mengumpulkan URL/session otomatis.

## Pengujian lokal dan batas bukti

Tes backend memeriksa gate admin, default doGet tidak berubah, fingerprint, perubahan source/evaluasi, core ambigu/eksternal/hilang, UTF-8/escaping dan nol penulisan data. Tes browser memeriksa unduhan tanpa data akun, perbedaan sumber vs transformasi DOM, laporan yang tetap hidup saat core sengaja diberi SyntaxError Pustaka, dan laporan statis saat semua JavaScript dimatikan.

Template HtmlService dan RPC Google pada tes memakai runtime mock dan data sintetis. Keberhasilan Playwright **bukan bukti HtmlService Google telah berfungsi**. Tidak ada klaim pemulihan /dev atau penyebab final sebelum laporan/sumber aktual diperoleh. Tidak ada merge, clasp push, migrasi atau deployment otomatis pada pekerjaan ini.

Validasi 27 Oktober 2026: `npm run check` lulus **105 tes backend/build dan 59 tes Playwright**, nol gagal/dilewati. Build terpisah berhasil, dan status clasp offline memakai konfigurasi contoh memilih tepat 27 file. Source core/Index/Styles normal tetap identik dengan main. Hasil itu memverifikasi alat diagnostik lokal, bukan memperbaiki atau membuktikan jalur Google yang belum diamati.
