# Audit kelayakan dan rancangan login User ID/Password — 30 Oktober 2026

Status: DESAIN SAJA; belum ada perubahan kode operasional, database, manifest, atau deployment. Basis: branch main saat pembuatan branch ini. Platform tetap Google Apps Script HtmlService + Google Sheets.

## Temuan terverifikasi dari pembacaan sumber
- `src/backend/20_Auth.gs`: `authorize_()` bergantung pada `Session.getActiveUser().getEmail()` dan baris `Pengguna`; belum mendukung sesi User ID.
- `src/backend/90_Api.gs`: `respond_(callback, write)` memanggil `authorize_()`; RPC operasional memakai wrapper ini, dengan script lock untuk operasi write. Semua jalur publik termasuk asset/diagnostic perlu inventaris dan pengujian terpisah.
- `src/backend/01_Config.gs`: spreadsheet ID dari Script Properties; tidak ada kredensial password aplikasi pada sumber ini.
- `src/appsscript.json`: webapp `executeAs: USER_ACCESSING`, `access: MYSELF`; tidak sesuai begitu saja untuk login lokal banyak guru. Deployment aktif belum diverifikasi.
- `src/frontend/services/api.js`: allowlist nama RPC di browser, bukan kontrol keamanan server.
- `src/backend/25_CardsQr.gs`: QR berisi token UUID, tanpa NISN; validasi dan simpan dipisah, tetapi token kartu tidak dapat dicabut melalui UI.
- `src/backend/11_Writes.gs`: kompensasi penulisan Sheets, bukan transaksi atomik; ada AuditLog.
- `src/backend/02_Validation.gs`: validasi karakter dan penolakan awalan formula untuk teks umum.

## Penilaian kelayakan
Bersyarat. Apps Script HtmlService dapat menyediakan form login dan RPC, tetapi tidak memberikan kemampuan pengelolaan cookie HttpOnly/SameSite/Set-Cookie yang setara backend HTTP khusus. Web app yang berjalan sebagai pemilik berpotensi memungkinkan akses database tanpa membagikan Sheets kepada guru, tetapi juga membuat otorisasi sesi pada setiap endpoint mutlak. Opsi akses web app dan identitas yang benar harus diuji dengan akun Google nyata: login aplikasi sendiri tidak menghapus autentikasi/izin platform Google yang mungkin diminta. Jangan menjanjikan akses tanpa akun Google sebelum pengujian nyata.

## Rancangan keamanan yang disyaratkan
1. Pertahankan login lama sebagai fallback di deployment lama selama prototipe. Jangan memodifikasi `main`, Script ID, APP_SPREADSHEET_ID, atau data asli.
2. Buat staging terisolasi dengan Apps Script project, spreadsheet dummy, dan Script Properties terpisah. Gunakan akses minimum dan tidak mempublikasikan data pribadi.
3. Pisahkan tabel `AkunAplikasi`, `SesiAplikasi`, `LogKeamanan` pada spreadsheet staging saja; username unik, ID immutable, role ADMIN_KEPALA_SEKOLAH/GURU, status aktif, assignment kelas terpisah, version sesi, timestamp. Jangan menyimpan password plaintext, password reset plaintext, atau token sesi mentah.
4. Password: gunakan KDF khusus password yang telah ditinjau dan benar-benar tersedia/layak di runtime Apps Script (misalnya PBKDF2-HMAC-SHA256 dengan salt unik dan cost terkalibrasi). Jangan mengklaim Argon2 tersedia secara native. Verifikasi implementasi terhadap test vector, timing, dan kuota sebelum pemakaian.
5. Sesi: token acak kriptografis; simpan hanya hash token di server; TTL pendek, idle timeout, rotasi setelah login/aksi sensitif, logout/revoke, invalidasi saat reset/nonaktif. Jangan masukkan token ke URL, log, laporan, atau QR siswa. Penyimpanan token browser tanpa HttpOnly adalah risiko residual serius; evaluasi kelayakan secara eksplisit dan jangan menyatakan aman bila tidak ada mitigasi memadai.
6. Backend: setiap RPC nonpublik wajib menerima/mengecek sesi dan melakukan lookup role/kelas terbaru pada server; jangan percaya role, user_id, atau class scope dari klien. Batasi endpoint login, status, logout, dan reset; gunakan respons error generik untuk login.
7. Super Admin: bootstrap akun awal secara manual hanya di staging melalui editor terbatas, bukan username/password default hardcoded; wajib ganti password saat login awal; reset menghasilkan token sekali pakai, kedaluwarsa, dan dicatat; cegah penghapusan/penonaktifan admin aktif terakhir; audit semua perubahan role/akun; pertimbangkan autentikasi ulang untuk operasi sensitif.
8. Anti-brute-force: pembatasan percobaan berdasarkan username serta sinyal lain yang benar-benar tersedia, jeda progresif, log tanpa password, anti-enumerasi; jangan mengandalkan IP yang mungkin tidak tersedia di Apps Script.
9. Privasi: batasi hak akses spreadsheet dan backup; uji XSS, injeksi formula, file foto, export, akses lintas kelas, QR hilang/dicuri, concurrency, dan log tanpa PII/rahasia.
10. Rilis hanya setelah uji browser HP/PC, akun nyata, batas kuota, dan review keamanan; bila kebutuhan sesi aman tidak terpenuhi, pertahankan Google identity atau gunakan layanan autentikasi terkelola sebagai alternatif. Jangan melemahkan keamanan hanya untuk menghilangkan email pada UI.

## Matriks uji minimum (staging, data sintetis)
- Akun valid/salah, username tak terdaftar, akun nonaktif, password lemah, reset expired/reused, sesi logout/expired/revoked, perubahan role saat sesi aktif.
- RPC langsung tanpa sesi, sesi milik akun lain, role guru mengakses siswa kelas lain, bypass allowlist browser, parameter role/class dimanipulasi.
- Login brute-force, login bersamaan, race session rotation, kebocoran token melalui URL/log/browser, XSS mencuri sesi, CSRF/embedded iframe sesuai kemampuan platform.
- Scan QR palsu/duplikat/di-revoke, lock concurrent, recovery Sheets, ekspor dengan formula dan data wali.
- Pengujian deployment `/dev` dan `/exec` dengan akun Google berbeda, tanpa akses edit spreadsheet, termasuk izin/consent Google yang tampil.

## Gerbang keputusan
A. Audit source lengkap dan inventaris seluruh RPC.
B. Prototipe login di staging dengan database dummy, tes KDF dan sesi.
C. Threat model + tes negatif + pengujian akun Google nyata.
D. Review hasil, risiko residual, dan persetujuan pemilik sebelum PR atau merge.
E. Backup terverifikasi dan rencana rollback sebelum migrasi data produksi.

Tidak menjalankan `clasp push`, deploy, migrasi, reset, atau modifikasi `main` pada tahap ini.
