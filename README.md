# Pantau Api Nanga Lauk

Website pemantauan titik panas (hotspot) satelit untuk **Desa dan Hutan Desa Nanga Lauk**, Kecamatan Embaloh Hilir, Kabupaten Kapuas Hulu, Kalimantan Barat.
Dikelola oleh Yayasan PRCF Indonesia dan LPHD Lauk Bersatu untuk program SCCM Rimbak Pakai Pengidup.

**Website:** https://erikprcfi.github.io/titik-api-desa-nanga-lauk/

## Cara kerja
- GitHub Actions (`.github/workflows/update.yml`) berjalan **setiap 3 jam**, menjalankan `scripts/update_firms.py`.
- Skrip mengunduh file publik **NASA FIRMS Near Real-Time** 7 hari (Asia Tenggara): VIIRS S-NPP, VIIRS NOAA-20, VIIRS NOAA-21 (375 m) dan MODIS Terra/Aqua (1 km).
- Titik di sekitar Kapuas Hulu disimpan ke `data/archive/YYYY-MM.csv` dengan kolom asli FIRMS, ditambah zona, jarak ke batas desa (UTM 49N) dan kode petak grid patroli.
- Setiap unduhan dicatat di `data/provenance/YYYY-MM.jsonl` (URL, waktu UTC, ukuran, SHA-256 file asli) sebagai jejak audit.

## Sumber data dan sitasi
| Produk | DOI |
|---|---|
| VIIRS S-NPP 375 m (VNP14IMGTDL_NRT) | 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002 |
| VIIRS NOAA-20 375 m (VJ114IMGTDL_NRT) | 10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002 |
| VIIRS NOAA-21 375 m (VJ214IMGTDL_NRT) | 10.5067/VIIRS/VJ214IMG_NRT.002 |
| MODIS C6.1 (MCD14DL) | 10.5067/FIRMS/MODIS/MCD14DL.NRT.0061 |

We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS).

Batas wilayah: Hutan Desa SK.685/Menlhk-PSKL/PKPS/PSL.0/2/2017; Batas Desa BIG 2020 (1:10.000); grid patroli 250 m PRCF Indonesia; batas kabupaten BIG 2021. Latar opsional: Sentinel-2 L2A 10 Agustus 2026 (Copernicus/ESA), Esri World Imagery, OpenStreetMap.

## Catatan
Titik panas adalah deteksi anomali panas oleh satelit, bukan konfirmasi kebakaran. Verifikasi lapangan tetap diperlukan. Data NRT dapat diganti produk Standard (SP) NASA setelah ±2–3 bulan.
