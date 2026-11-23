# Teks listing Google Play – Pantau Rimbak

Bahan siap salin untuk Play Console (Grow > Store presence > Main store listing).
Semua klaim di bawah sesuai fitur yang ada di aplikasi; jangan menambahkan klaim "resmi pemerintah".

## Nama aplikasi (≤ 30 karakter)
Pantau Rimbak

## Deskripsi singkat (≤ 80 karakter)
Pantau titik panas, cuaca & kondisi hutan dengan data NASA, BMKG, Copernicus.

## Deskripsi lengkap (≤ 4.000 karakter)
Pantau Rimbak membantu masyarakat, pendamping perhutanan sosial, dan tim patroli memantau kebakaran hutan dan kondisi hutan di sekitar mereka. Aplikasi ini dikembangkan oleh Yayasan PRCF Indonesia.

FITUR UTAMA
• Titik panas hampir waktu nyata dari satelit NASA FIRMS (VIIRS NOAA-20, NOAA-21 dan MODIS), lengkap dengan peta, tingkat kepercayaan, dan jarak ke lokasi Anda.
• Peringatan dini bahaya kebakaran 7 hari dan prakiraan cuaca (BMKG, ECMWF), serta kualitas udara, asap, dan PM2.5 dari Copernicus (CAMS).
• Riwayat titik panas sejak 2001 dan grafik tahunan.
• Analisis wilayah: unggah batas area (SHP) untuk menghitung kehilangan tutupan pohon (Hansen/UMD), tutupan lahan, stok dan emisi karbon, serta riwayat titik panas. Hasil dapat diunduh sebagai laporan PDF dan tabel.
• Lapisan peta satelit NASA dan Copernicus, angin, lintasan satelit, dan kompas.
• Bara Api, asisten AI untuk pertanyaan perhutanan sosial, peraturan, dan status konservasi satwa. Jawaban soal peraturan dirujuk ke teks resmi peraturan perundang-undangan.
• Untuk tim lapangan: pencatatan patroli yang tetap berjalan tanpa sinyal, ekspor jalur & temuan ke GPX/KML (Google Earth, Avenza, QGIS), dan berbagi lokasi yang sepenuhnya opsional.
• Peringatan perubahan tutupan hutan sepekan sekali dari citra Sentinel-2, serta laporan bulanan PDF otomatis per Hutan Desa dampingan.
• 5 pilihan widget layar utama (jam, ubin status, cuaca & prakiraan, grafik titik panas, bahaya api 7 hari) dengan latar tembus ke wallpaper.
• Tersedia dalam Bahasa Indonesia dan Inggris.

SUMBER DATA
NASA FIRMS, NASA GIBS, BMKG, ECMWF/Open-Meteo, Copernicus (CAMS, Sentinel), University of Maryland (Hansen Global Forest Change, GLAD), ESA WorldCover, dan peta resmi Kementerian Kehutanan bila tersedia. Setiap angka di aplikasi mencantumkan sumbernya.

PENTING
Pantau Rimbak bukan sistem resmi pemerintah. Titik panas adalah deteksi panas dari satelit dan belum tentu kebakaran; selalu periksa di lapangan dan ikuti informasi resmi dari instansi berwenang.

Kebijakan privasi: https://erikprcfi.github.io/hotspot-fire-prcf/kebijakan-privasi.html
Hapus akun: https://erikprcfi.github.io/hotspot-fire-prcf/hapus-akun.html

## Kategori & kontak
- Kategori: Cuaca (alternatif: Alat/Pendidikan)
- Tag: lingkungan, cuaca, peta
- Email kontak pengembang: (isi email resmi PRCF)
- Situs: https://erikprcfi.github.io/hotspot-fire-prcf/

## Aset grafis (folder ini)
- ikon-512.png – ikon aplikasi 512 × 512 px
- grafis-fitur-1024x500.png – grafis fitur 1024 × 500 px
- tangkapan-1 … tangkapan-6 – tangkapan layar ponsel 1080 × 1920 px (9:16)

## Catatan unggah versi 2.2.0 (aplikasi asli, kode 6)
- Berkas: `PantauRimbak-2.2.0-playstore.aab` (sudah ditandatangani kunci distribusi PRCF = kunci unggah); ID `org.prcfindonesia.pantaurimbak`, targetSdk 36.
- Aplikasi berjalan tanpa Chrome dan tanpa sinyal (seluruh kode di dalam APK). Data diambil dari server Pantau Rimbak saat ada sinyal; pembaruan tampilan/fitur (HTML/JS) diunduh dari server resmi dan dipakai saat aplikasi dibuka berikutnya (sesuai kebijakan Google Play untuk kode yang dijalankan di WebView).
- Deklarasi izin di Play Console:
  - **Layanan latar depan jenis lokasi** (aplikasi TIDAK meminta izin lokasi latar belakang): dipakai HANYA saat anggota tim patroli menyalakan "Bagikan lokasi" (notifikasi tampil selama berjalan). Siapkan video singkat: buka Patroli → nyalakan berbagi lokasi → notifikasi muncul → matikan.
  - **Kamera**: foto laporan warga & cek lapangan (opsional).
  - **Notifikasi**: peringatan titik panas di lokasi tersimpan & status berbagi lokasi.
- Keamanan data (Data safety): lokasi (opsional, tim patroli & laporan warga), foto (laporan), email & nama (akun), log galat teknis; semua dienkripsi saat dikirim (HTTPS); pengguna dapat meminta penghapusan akun (hapus-akun.html).
- Akun uji untuk peninjau Google: buat satu akun uji (email + kata sandi, tanpa kode ID) dan cantumkan di "App access".
