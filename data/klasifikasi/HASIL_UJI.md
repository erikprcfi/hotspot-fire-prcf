# Uji coba klasifikasi citra Sentinel-2 (2 Nov 2026) – TIDAK ditampilkan di aplikasi

Skrip: `scripts/klasifikasi_citra.py`. Label latih: Peta Penutupan Lahan KLHK/Kemenhut 2025 Kab. Kapuas Hulu (6 Hutan Desa + penyangga 3 km) dan peta PRCF 2025 (dalam HD Nanga Lauk); fitur: 6 kanal Sentinel-2 L2A (median 10 citra cerah 2025, 20 m), NDVI/NDWI/MNDWI/NBR/NDMI, tekstur 5×5, ketinggian & lereng Copernicus DEM; Random Forest 300 pohon; validasi spasial blok 2 km (30% blok untuk uji). Metrik lengkap: `model.json`.

| Ukuran (uji wilayah terpisah) | Hasil |
|---|---|
| Akurasi kelas rinci (12 kelas KLHK) | 51,4% (kappa 0,45) |
| Akurasi 4 kelompok (hutan / lahan basah / air / lahan kering) | 86,3% |
| Akurasi hutan vs bukan hutan | 91,1% |
| Akurasi pada label PRCF (Nanga Lauk) | 94,3% |
| Akurasi pada label KLHK | 48,5% |

Mengapa tidak dipakai di aplikasi:
1. Kelas rinci terlalu rendah akurasinya (semak, pertanian campur semak, permukiman, tanah terbuka, pertambangan sering tertukar) – label KLHK 1:250.000 kasar.
2. Model 2025 tidak stabil bila diterapkan ke tahun lain (2019/2021 memberi hasil tidak masuk akal, mis. kelas pertambangan ratusan ha di Nanga Lauk) – perlu harmonisasi radiometrik antar-tahun dan sampel lapangan per tahun.
3. Luas kelompok hutan Nanga Lauk 2025 dari model (±270 ha) jauh di bawah peta PRCF ber-groundcheck (544 ha).

Syarat agar layak dipakai kelak: sampel lapangan (GPS + foto) per kelas di setiap Hutan Desa, label rinci seperti peta PRCF untuk HD lain, dan harmonisasi citra antar-tahun. Sampai itu tersedia, aplikasi hanya memakai peta resmi KLHK/Kemenhut 2025 + Hansen dan peta PRCF.
