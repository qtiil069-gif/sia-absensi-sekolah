# Perbaikan navigasi iframe HtmlService

Basis pekerjaan: `main` commit `5bbff37`, setelah merge PR #2. Backend operasional, skema v1, kedua ID, dan manifest dipertahankan.

## Hasil audit

Sebelumnya seluruh menu/sidebar, logo, CTA dashboard, tombol kembali, dan hasil pencarian merupakan anchor `href="#..."`. Template memakai `<base target="_top">`. Handler click memang memanggil preventDefault pada klik biasa, tetapi router kemudian tetap mengubah `location.hash` dari iframe dan bergantung pada hashchange. Pembatalan navigasi absensi juga memanggil history.replaceState pada URL iframe. Skip link masih berupa anchor dengan default target yang sama.

Dalam HtmlService, dokumen aplikasi berjalan pada endpoint internal `script.googleusercontent.com/userCodeAppPanel?createOAuthDialog=true`, bukan pada URL Web App `/exec` yang dibuka pengguna. Mengubah fragmen di sana memperlakukan URL panel sebagai URL route. Jika anchor ditangani browser sebagai navigasi native, default `_top` menargetkan dokumen induk; klik yang tidak ditangkap handler juga tetap memiliki jalur navigasi tersebut. Ini sesuai dengan URL panel berakhiran `#kelas` pada laporan halaman putih. Controller kelas/siswa/absensi sendiri tidak memerlukan URL atau reload untuk menampilkan halaman.

Tes lokal sebelumnya hanya menjalankan aplikasi sebagai halaman utama pada server demo. Ia tidak memeriksa URL iframe/induk, target `_top`, tab baru, atau navigasi lintas origin. Karena itu tes tersebut tidak cukup untuk menangkap masalah integrasi ini. Halaman putih pada deployment Google dilaporkan pengguna; pekerjaan ini memvalidasi perbaikan melalui simulasi browser, bukan deployment atau akun Google nyata.

## Perubahan

- Semua kontrol route menjadi `button type="button" data-route="..."`, termasuk hasil pencarian dinamis. Tidak ada href/target pada kontrol navigasi internal; Enter dan Space ditangani native sebagai aktivasi tombol.
- `src/frontend/lib/router.js` menyimpan route di memori, memvalidasi allowlist, dan memanggil renderer yang sudah ada. Ia tidak mengakses parent/top, menulis location/hash, memakai History API, window.open, atau google.script.history.
- `app.js` tetap menghubungkan kelas, siswa, dan absensi ke page controller operasional dan adapter google.script.run yang sama. Indikator menu aktif memakai data-route. Navigation guard dijalankan **sebelum** route berubah; pembatalan tidak memerlukan history.replaceState.
- `<base target="_top">` dihapus. Skip control memfokuskan main secara langsung. Palet dan bentuk dashboard tetap dipakai dengan reset CSS tombol yang terbatas.
- Fragmen awal yang valid boleh dibaca sekali sebagai petunjuk untuk kompatibilitas pengujian/demo; klik menu selanjutnya tidak menulis URL. Reload membuka dashboard kecuali ada petunjuk awal tersebut. Router tidak membuat entri browser Back/Forward untuk menu.

Tidak ada perubahan backend, CRUD, kebijakan role, spreadsheet, schema, atau kredensial. Mengubah route tidak memberikan kewenangan tambahan; semua RPC tetap memeriksa akun dan cakupan pada server.

## Regresi iframe

`tests/ui/iframe-navigation.spec.mjs` menyajikan paket dist HTML Service di iframe lintas origin pada URL panel yang dilaporkan, dibungkus halaman `/exec` sintetis. Sandbox mengizinkan script/form/modal/pop-up dan top-navigation-by-user-activation seperti kondisi yang perlu diuji. Fixture sengaja menambahkan base target `_top` kembali untuk memastikan kontrol tetap aman meskipun default target berasal dari host.

Probe memastikan URL induk dan iframe tidak berubah, dokumen iframe yang sama dipertahankan, tidak ada hashchange atau panggilan pushState/replaceState, dan jumlah tab tetap satu. RPC fixture memakai backend .gs asli dengan Sheets sintetis dalam memori.

Cakupan: seluruh menu admin, desktop/mobile, klik ikon SVG, keyboard, Ctrl/middle click, CTA/logo/kembali/pencarian/skip, tambah kelas dan siswa serta simpan absensi di iframe, pembatalan draft, dan penolakan kelas lain untuk guru. Tes CRUD serta backend tahap 2 tetap dijalankan.

Hasil lokal pada 23 Oktober 2026: `npm run check` berhasil dengan **63 tes backend/build dan 24 tes browser lulus**, 0 gagal, 0 dilewati. Empat tes browser baru khusus iframe. `npm run build` terpisah berhasil dan clasp status memilih 16 file dist. Screenshot dashboard ditinjau kembali; desain pastel dipertahankan. Tidak ada push/deployment atau pengujian akun Google nyata pada pekerjaan ini.

## Menerapkan setelah review

Pertahankan `.clasp.json` lokal yang sudah benar, Script ID, APP_SPREADSHEET_ID, dan konfigurasi deployment. Dari checkout branch yang telah ditinjau:

```sh
npm ci
npm run check
npm run build
npm run clasp:status
npm run clasp:push
```

Status harus hanya memilih 16 file dist; router dikemas ke Scripts.html. Tidak perlu initializer/migrasi. Jangan menyalin konfigurasi contoh di atas file ID yang sudah ada.

`clasp push` memperbarui source, **bukan versi deployment `/exec` yang sudah dipin**. Untuk menguji tanpa mengganti deployment produksi, gunakan test deployment `/dev` proyek yang sama sesuai izin Google. Setelah review dan pengujian akun nyata, pemilik dapat memperbarui deployment yang ada secara manual melalui **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Memperbarui deployment yang sama mempertahankan URL Web App; jangan membuka URL userCodeAppPanel secara langsung sebagai URL aplikasi. Tidak ada langkah push/deploy Google yang dijalankan otomatis pada pekerjaan ini.

Pada pengujian Google, klik semua menu dari URL Web App, periksa judul/menu aktif dan CRUD dengan data pengembangan, batalkan perpindahan saat absensi belum disimpan, lalu ulangi sebagai Guru dan pada mobile. Pastikan URL aplikasi tidak berubah menjadi URL panel. Tes lokal tidak menggantikan verifikasi integrasi Google ini.
