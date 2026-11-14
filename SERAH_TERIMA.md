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

## Rencana sesi terjadwal (disetujui pengguna; batas ±40% kuota mingguan minggu ini)
Kerjakan bagian PERTAMA yang belum dicentang, satu bagian per sesi:
- [x] Sesi A – Login sekali daftar + kode ID (SELESAI 6 Nov, diuji Playwright dgn server tiruan: umum, HDNL, JEMAH, kode salah, sandi salah, belum daftar, kode wilayah SHP, admin, muat ulang dalam sesi – 0 error): ubah `assets/akun.js` (cek email di server: sudah terdaftar → layar masuk; belum → daftar),
      layar masuk email/kata sandi/kode ID (opsional), gating tampilan HD per kode, halaman daftar kode ID setelah unggah SHP,
      tulis `apps_script/Kode_Database_Pengguna_v12.gs.txt` (turunan v11; aksi: cek_email, masuk, daftar dgn hash, kode_simpan/kode_ambil
      untuk wilayah SHP di Drive). Pengguna memasang v12 sendiri. Uji di Playwright dengan server tiruan.
- [x] Sesi B (SELESAI 6 Nov) – Audit & perbaiki semua lapisan peta (lihat butir 4): uji tiap lapisan menghasilkan ubin di Kalbar & lokasi lain Indonesia
      (mis. Riau, Papua, Aceh); ganti sumber lokal-saja dengan sumber resmi nasional/global atau beri label jelas.
- [x] Sesi C (SELESAI 6 Nov) – Penyegaran tampilan untuk presentasi: beranda & peta lebih profesional (web dan HP berbeda tata letak), nama/ikon Android
      (strings.xml app_name, mipmap adaptif dari assets/logo_pr.svg), kop laporan Pantau Rimbak.
- [x] Sesi D (SELESAI 6 Nov) – Uji menyeluruh semua alat/navigasi (Playwright), perbaiki error, rangkuman siap-gabung untuk pengguna.
- [x] Sesi E (SELESAI 6 Nov, percakapan utama) – Data nasional untuk wilayah SHP pengguna: perluas pipeline analisis (scripts/analisis_antrean.py) agar wilayah di luar Kalbar
      dihitung dari sumber resmi global/nasional (Hansen GFC v1.13 via ubin/COG resmi, NASA FIRMS area API dgn kunci di secret Actions,
      tutupan lahan KLHK resmi bila layanan terjangkau dari Actions, cadangan ESA WorldCover); uji dengan poligon Bengkulu, Papua, Aceh.
- [x] Sesi F (SELESAI 6 Nov, percakapan utama) – Website gaya NASA: halaman peta web layar penuh dgn panel lapisan interaktif, linimasa tanggal, grafik ringkas; tampilan HP tetap terpisah.

## Catatan Sesi A (6 Nov)
- `assets/akun.js`: layar masuk saat aplikasi dibuka (email, kata sandi, kode ID opsional); daftar → cek_email (sudah terdaftar → layar masuk);
  kata sandi diperiksa server (aksi masuk/sandi_set/sandi_reset) – fallback ke pemeriksaan lokal bila server masih v11/tanpa internet.
  Kode HD dicocokkan via sidik SHA-256 ('pantau-rimbak|'+KODE) – kode asli tidak ada di kode sumber. Kode wilayah pengguna: wilayah_simpan/wilayah_ambil.
  `FHAkun.akses()` → {mode:'hd'|'shp'|'umum'}; admin (FHTim.admin) melihat semua HD. Sesi berlaku sampai aplikasi ditutup (sessionStorage).
- `app.html`: aksesApply() (ALLOW = HD yang boleh dilihat; batas HD di peta hanya yang boleh), mode umum (body.pr-umum, hubUmum: hero umum,
  alat HD terkunci 🔒 → umumInfo), mode SHP (batas wilayah biru di peta + Analisis). Hook uji: window.FHAkses().
- `assets/analisis.js`: setelah SHP terkirim → kartu "Daftarkan kode ID untuk wilayah ini".
- Apps Script v12 sudah dikirim ke pengguna (tidak di repo: berisi ID Sheet/folder). Pengguna perlu memasangnya.
- BELUM: data semua alat untuk wilayah SHP (tahap data nasional); titik panas di peta mode umum masih data wilayah Kapuas Hulu & sekitar.
- Risiko Play Store: persetujuan berbagi lokasi GPS ke PRCF masih WAJIB saat masuk/daftar – untuk rilis publik sebaiknya opsional.

## Catatan Sesi B (6 Nov) – hasil uji ubin per lapisan di Kalbar, Riau, Papua, Aceh (Playwright, 0 error halaman)
- Semua lapisan NASA/CAMS berfungsi di 4 lokasi: fire (WMS FIRMS), true color, CO, AOD (sebagian 404 = tidak ada data/awan, wajar), smoke & PM2.5 (CAMS), indeks aerosol OMPS.
- Perbaikan: OMPS & OPERA tertunda beberapa hari di GIBS → `terbaru()` di nasa_layers.js mencari tanggal terbaru yang benar-benar ada (≤20 hari).
- BARU (seluruh Indonesia): 'dist' NASA OPERA DIST-ALERT (gangguan vegetasi 30 m, gabungan 8 hari) & 'distann' OPERA DIST-ANN (tahunan, produk 2025-01-01);
  piksel "tidak ada gangguan" (18,18,18) dibuat transparan (HideTile). Colormap resmi: gibs.earthdata.nasa.gov/colormaps/v1.3/OPERA_Vegetation_Disturbance_Status.xml
- Kehilangan tutupan pohon: ubin resmi Hansen GFC v1.13 global (storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.13/loss_alpha) + ubin per-tahun lokal Kapuas Hulu di atasnya.
- Bekas terbakar & peringatan perubahan hutan = analisis PRCF untuk HD dampingan → diberi label jelas & disembunyikan di mode umum; nasional diarahkan ke OPERA.
- Mode umum otomatis menyalakan lapisan titik api NASA FIRMS (seluruh dunia). Angin (Open-Meteo ECMWF) memang global.
- Apps Script v12 SUDAH dipasang pengguna (diverifikasi: layanan "Pantau Rimbak – database pengguna v12", cek_email berfungsi).
- Daftar titik panas & statistik masih dari data FIRMS wilayah Kapuas Hulu (pipeline) → nasional = tahap data nasional.

## Catatan Sesi C (6 Nov)
- Android: applicationId & appId `org.prcfindonesia.pantaurimbak` (namespace Java tetap org.prcfindonesia.firehotspot), ikon peluncur & adaptif
  dari logo lensa (latar #DDF1E4), splash baru. APK BELUM dibangun ulang (pengguna mengurus kunci tanda tangan & Play Store).
- Laporan PDF/Word: logo Pantau Rimbak di sampul & kop halaman, subjudul "Monitoring, Reporting & Verification Hutan Desa" (diuji: PDF & DOCX terunduh, 0 error).
- Website (html.web): semua kelompok alat terbuka sebagai kisi 4 kolom (HP tetap akordeon). Layar masuk diperiksa di HP.

## Catatan Sesi D (6 Nov) – siap digabung ke main (MENUNGGU PERSETUJUAN PENGGUNA)
- 31 alat dibuka satu per satu di tampilan HP (400 px) & web (1440 px): 0 error JavaScript. Pesan UI yang muncul hanya yang wajar di uji lokal
  (Analisis: perlu akun terverifikasi; Admin: mode uji lokal tidak menghubungi basis data).
- Login: 9 skenario lulus (server tiruan) + server v12 asli menjawab cek_email. Lapisan peta: lulus di 4 provinsi. Laporan PDF/DOCX: lulus.
- Setelah digabung: APK lama (Fire Hotspot) otomatis menampilkan Pantau Rimbak (memuat app.html live); APK baru dgn identitas pantaurimbak dibangun pengguna.

## Cara kerja hemat kuota (paket Pro pengguna)
Satu bagian per sesi/percakapan; uji, commit ke `pantau-rimbak`, perbarui file ini, laporkan singkat dalam bahasa Indonesia.

## Catatan Sesi E & F (6 Nov, percakapan utama)
- Analisis SHP nasional diuji di GitHub Actions (uji/uji_nasional.py → uji/hasil_nasional.json) untuk Bengkulu (Seluma), Papua (Merauke), Aceh Barat:
  Hansen, GLAD, karbon GFW, arsip FIRMS 2016–2025 dan nama desa/kab berjalan tanpa galat (±45–90 dtk/area).
- Titik panas tahun berjalan: NASA FIRMS Area API (SP dulu, NRT untuk hari terakhir), kunci dari secret FIRMS_MAP_KEY atau Apps Script (rahasia=1, sama dgn pipeline).
  Tahun tanpa berkas data tidak ditampilkan sebagai nol. Cache Actions harian `firms-indonesia-v2-<tanggal>`.
- Layanan KLHK (geoportal/sigap.menlhk.go.id) TIDAK terjangkau dari GitHub Actions (uji 6 Nov: daftar layanan kosong). Di luar Kalbar tutupan lahan memakai
  GLAD (dilabeli "proksi – peta KLHK tidak mencakup area ini"). Lahan kritis hanya Kapuas Hulu – ditulis apa adanya.
- Titik panas nasional (data/titik_id) kini disaring ke daratan Indonesia (data/wilayah/indonesia_darat.geojson dari scripts/batas_indonesia.py, OCHA COD-AB);
  indeks memuat per_hari_wib per petak 1° untuk grafik.
- assets/nasional.js: di mode umum/SHP alat Sebaran titik panas (7 hari, radius 5–100 km atau poligon SHP), Riwayat hujan ERA5 sejak 2001, Kualitas udara CAMS
  30 hari + prakiraan berjalan untuk lokasi mana pun di Indonesia (GPS/tengah peta/wilayah SHP). Hutan, tutupan, karbon, riwayat titik panas, laporan & unduh
  diarahkan ke Analisis area (server). Alat program HD (patroli, tindak, indikator, peringatan, cek, tim, admin, unduh peta HD) tetap perlu kode ID.
- assets/web_peta.js (hanya website): panel lapisan kiri (titik panas Indonesia 7 hari, NASA GIBS/OPERA, CAMS, transparansi, legenda), linimasa bawah
  (14 hari / CAMS per 3 jam, putar animasi) dengan grafik titik panas per hari di area peta yang terlihat. HP tidak berubah.

## Catatan 6 Nov malam – kepatuhan Play Store & data terbuka nasional
- Berbagi lokasi OPSIONAL (akun.js), penjelasan sebelum menyalakan dari Profil, izin REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dihapus, hapus-akun.html,
  kebijakan privasi diperbarui. Apps Script v13 (di luar repo, dikirim ke pengguna): hapus akun ikut menghapus sidik kata sandi, wilayah SHP + kode ID, unggahan & hasil analisis.
- scripts/terbuka_nasional.py: tutupan lahan 2021 ESA WorldCover 10 m (semua SHP) + indikasi lahan kritis (WorldCover tajuk + Copernicus DEM lereng, skoring
  P.4/V-SET/2013 dgn 2 dari 4 kriteria, air & terbangun tidak dinilai) bila peta resmi tidak menjangkau. Uji Kapuas Hulu vs peta resmi: tidak kritis 80/70 %, kritis 1,4/4,7 %.
- nasional.js: + Lintasan satelit untuk lokasi mana pun. app.html: perbaikan closeAll (history.go(-n) hanya memicu satu popstate).
- Panduan rilis Play Store (Word) dikirim ke pengguna.

## Catatan 7 Nov dini hari (sesi terjadwal 02.10)
- Website wajib masuk sama dengan HP: assets/web.js tidak dimuat lagi; layar masuk/daftar akun.js dipakai di website (tampil terpusat ≤520 px di desktop).
  Diuji: 9 skenario masuk (umum, HDNL, Jemah, kode salah, sandi salah, belum daftar, SHP, admin) di app.html?web=1 tanpa error.
- Bahasa Inggris: nasional.js, web_peta.js, kartu WorldCover/indikasi lahan kritis + PDF di analisis.js.
- Tutupan lahan di luar Kalbar hanya data terbuka (GLAD UMD + ESA WorldCover); probe layanan KLHK dihapus dari muat_klhk.

## Catatan 7 Nov pagi – mode umum tanpa data HD (temuan Erik)
- Mode umum/SHP: Laporan diganti kartu (umum → unggah SHP / kode ID; SHP → buka analisis & unduh PDF), Prakiraan langsung "Lokasi saya",
  peta tanpa kartu/titik/petak Nanga Lauk dan dibuka di seluruh Indonesia (SHP: batas wilayah pengguna), 3D & kompas tanpa data HD,
  Profil tanpa Unduh/Peringatan HD, Bara Api tanpa konteks HD, subjudul kartu beranda netral. Diuji Playwright: tidak ada teks Nanga Lauk/Kapuas Hulu
  di Beranda/Laporan/Prakiraan/Peta/Profil/Bara Api mode umum; mode HD tetap lengkap.
- Angin: grid nasional ECMWF open data (scripts/angin_nasional.py → data/angin/indonesia.json, langkah update.yml).
- Deploy Pages: dicoba ulang sekali bila >10 menit.
- Ekspor diuji: titik panas CSV/SHP/GeoJSON/KML (jumlah sama, SHP terbaca pyshp, prj WGS84), unduh data spasial tutupan/perubahan/lahan kritis/batas SHP & GeoJSON (Nanga Lauk & Batang Tau), laporan PDF/Word HD, PDF analisis.

## Catatan 7 Nov pagi – fitur publik baru
- "Indonesia hari ini" (alat 'ringkas'): scripts/ringkas_nasional.py → data/titik_id/ringkasan.json (deteksi 24 jam/7 hari per provinsi & kabupaten,
  batas data/wilayah/kabupaten.geojson dari scripts/batas_kabupaten.py). Dijalankan update.yml setiap run.
- Panduan (alat 'panduan'): arti titik panas/keyakinan/FRP, PM2.5, pencegahan, tautan resmi (tanpa nomor telepon yang tidak terverifikasi).
- Tombol Bagikan (navigator.share → WhatsApp/salin) di Indonesia hari ini, Sebaran titik panas, Panduan.
- update.yml: pipeline FIRMS kini juga jalan saat push (run push menggantikan run terjadwal yang tertunda, sehingga data sempat beku 16:47Z–).

## Catatan 13 Nov 2026 – pemeliharaan rutin
- Suomi NPP berhenti beroperasi 2 Nov 2026 (NASA/NOAA). Lapisan indeks aerosol OMPS kini memakai NOAA-20 (`OMPS_NOAA20_NadirMapper_AerosolIndex_380`,
  palet sama dengan OMPS_Aerosol_Index sehingga legenda lama tetap berlaku); tanggal < 2 Nov 2026 tetap Suomi NPP. AOD VIIRS kini NOAA-20 + NOAA-21
  (< Mar 2023: S-NPP + NOAA-20). Suomi NPP dihapus dari daftar lintasan satelit (scripts/tle.py). Arsip FIRMS S-NPP lama tetap dipakai apa adanya.
  Catatan: indikator Plan Vivo "titik panas di dalam HD per tahun" memakai VIIRS S-NPP → tahun 2026 dan seterusnya perlu diputuskan pindah ke NOAA-20.
- Jadwal GitHub sangat tertunda (FIRMS "tiap 3 jam" nyatanya 5–9 jam; analisis "tiap 5 menit" nyatanya 4–8 jam):
  update.yml + jadwal tambahan "47 1-23/3"; analisis.yml menunggu antrean ±25 menit lalu menjalankan ulang dirinya (workflow_dispatch, actions: write).

## Catatan 14 Nov 2026 – pemeliharaan total & persiapan Play Store
- analisis.yml: langkah "Jaga kesegaran data FIRMS" memicu update.yml bila pembaruan terakhir > 150 menit (jadwal GitHub tetap tertunda hingga 7–8 jam).
- app.html: kolom S-NPP di panel peta hanya tampil bila periode masih berisi data S-NPP.
- aplikasi-android/play-store/: ikon 512, grafis fitur 1024×500, 6 tangkapan layar 1080×1920, teks listing.
- APK di unduh/ masih identitas lama org.prcfindonesia.firehotspot (berisi izin REQUEST_IGNORE_BATTERY_OPTIMIZATIONS & SCHEDULE_EXACT_ALARM).
  Untuk Play Store: bangun AAB baru (org.prcfindonesia.pantaurimbak, versionCode ≥ 3) dengan kunci unggah pengguna.
