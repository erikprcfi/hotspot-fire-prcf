# Catatan serah-terima – pembaruan besar "Pantau Rimbak"

Cabang kerja: `pantau-rimbak` (JANGAN langsung ke `main`; `main` = situs live, diperbarui data otomatis tiap jam).
Gabungkan ke `main` hanya setelah tahap teruji. Tanpa force push. Penghapusan file perlu konfirmasi pengguna.

## Permintaan pengguna (Erik Munandar, admin, Yayasan PRCF Indonesia) – 6 Nov 2026
Presentasi ke Gubernur Kalbar (> 1 minggu lagi); rencana rilis publik Play Store (urusan Play Store & kunci APK = pengguna sendiri).
1. Ganti nama **Fire Hotspot → Pantau Rimbak** (MRV: Monitoring · Reporting · Verification), logo lensa + foto hutan (sudah dibuat).
2. **Login**: daftar hanya 1 kali; sistem mengenali email yang sudah terdaftar → cukup login (email + kata sandi) dari perangkat mana pun.
   Disetujui: akun & hash kata sandi dicek di server (Google Sheet PRCF via Apps Script **v12** – pengguna memasang sendiri).
   Halaman masuk tepat saat membuka aplikasi: **email, kata sandi, kode ID (opsional)**.
3. **Kode ID** (opsional): kode 6 HD → HD Lauk Bersatu/Nanga Lauk `HDNL`, HD Nyuai Peningun `Jemah`, HD Batang Tau `Wangi`,
   HD Pundjung Batara `Betung`, HD Bumi Lestari `Raya`, HD Bukit Belang `Tanjung`.
   Tanpa kode → tampilan umum (tanpa data HD), kecuali pengguna mengunggah SHP wilayahnya → semua alat menghitung untuk SHP itu.
   Setelah unggah SHP ada halaman untuk **mendaftarkan kode ID bebas** untuk wilayah itu; disimpan di Drive PRCF (disetujui),
   hanya terbuka dengan email + kata sandi + kode ID pemilik. Masuk lagi → diminta email, kata sandi, kode ID.
   Catatan jujur: kode HD mudah ditebak; data 6 HD sudah publik di repo (disetujui "boleh publik") – kode HD = pembeda tampilan.
4. **Semua filter/lapisan peta harus berfungsi untuk Kalbar & seluruh Indonesia**, data resmi (burned area, asap, angin, PM2.5,
   kehilangan tutupan pohon, dll.). Temuan audit awal:
   - Kehilangan tutupan pohon memakai ubin lokal `data/ubin/kehilangan` (hanya Kapuas Hulu) → ganti/ tambah ubin resmi Hansen
     `https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.13/loss_alpha/{z}/{x}/{y}.png` (v1.13 tersedia, global).
   - Bekas terbakar & peringatan perubahan hutan = poligon lokal ≤5 km HD saja → perlu sumber nasional (cek GIBS / data resmi) atau
     label jelas "hanya HD dampingan".
   - Lapisan NASA GIBS/CAMS (assets/nasa_layers.js) global; AOD kosong di bawah awan (wajar) – uji tiap lapisan di Kalbar.
   - GIBS punya juga: IMERG_Precipitation_Rate, VIIRS_*_NDVI_8Day, *_Land_Surface_Temp_*, SMAP soil moisture, *_Flood_* (kandidat).
5. **Data seluruh Indonesia untuk SHP unggahan**: tutupan lahan KLHK/Kemenhut resmi (disetujui; cadangan ESA WorldCover),
   Hansen/UMD, FIRMS, karbon. 6 HD tetap baseline sekarang (PRCF untuk Nanga Lauk, KLHK 2025 untuk 5 HD) – jangan diubah.
   Catatan: geoportal.menlhk.go.id tidak terjangkau dari kontainer kerja (curl 000) – coba dari GitHub Actions / cari layanan resmi lain.
6. **Desain ulang**: website gaya NASA (peta interaktif, data kompleks) dan HP dengan desain berbeda, fitur/alat/data SAMA.
7. Laporan & ekspor profesional (kop Pantau Rimbak). Uji semua alat, lapisan, navigasi tanpa error.
8. APK: identitas baru `org.prcfindonesia.pantaurimbak` (diusulkan; pengguna mengurus kunci & Play Store).

## Status
- [x] Logo baru: `assets/logo_pr.svg` (lensa + foto hutan), `assets/favicon.svg`, ikon PWA di `assets/icons/` (diganti).
- [x] Teks "Fire Hotspot" → "Pantau Rimbak" di seluruh kode (sed); rujukan logo_fh.svg → logo_pr.svg. BELUM diuji di browser.
- [ ] Android: nama aplikasi, appId, ikon adaptif (mipmap) – belum.
- [ ] Login + kode ID + Apps Script v12 – belum.
- [ ] Audit & perbaikan lapisan peta – baru audit awal (di atas).
- [ ] Data nasional, desain ulang, laporan, uji akhir – belum.

## Cara kerja hemat kuota (paket Pro pengguna)
Satu bagian per sesi/percakapan; uji, commit ke `pantau-rimbak`, perbarui file ini, laporkan singkat dalam bahasa Indonesia.
