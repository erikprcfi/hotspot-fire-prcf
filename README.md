# Fire Hotspot PRCF

Website pemantauan titik panas (hotspot) satelit untuk **Desa dan Hutan Desa Nanga Lauk**, Kecamatan Embaloh Hilir, Kabupaten Kapuas Hulu, Kalimantan Barat.
Dikelola oleh Yayasan PRCF Indonesia dan LPHD Lauk Bersatu untuk program SCCM Rimbak Pakai Pengidup.

**Website:** https://erikprcfi.github.io/hotspot-fire-prcf/

## Cara kerja
- GitHub Actions (`.github/workflows/update.yml`) menjalankan `scripts/pipeline.py` **setiap 3 jam**.
- **Arsip final NASA (SP)** 2000–2025 (MODIS sejak Nov 2000, VIIRS S-NPP sejak 2012, VIIRS NOAA-20 sejak 2018) dimuat dari arsip tahunan FIRMS per negara. Sekali sehari pipeline mengecek apakah NASA menerbitkan arsip tahunan baru; bila ada, catatan NRT tahun itu diganti versi final.
- **Near Real-Time (NRT)**: file publik 7 hari Asia Tenggara (VIIRS S-NPP, NOAA-20, NOAA-21, MODIS).
- Setiap deteksi diperkaya: zona dan jarak ke batas Desa Nanga Lauk (UTM 49N), petak grid patroli 250 m, kabupaten, fungsi kawasan hutan, tutupan lahan 2026, kedalaman gambut, luas piksel deteksi (scan × track; **bukan luas terbakar**), dan ID kejadian api (deteksi berjarak ≤ 1 km dan ≤ 2 hari).
- Jejak audit di `data/provenance/` (URL, waktu unduh, ukuran, SHA-256 setiap file asli NASA).

## Isi data
| Lokasi | Isi |
|---|---|
| `data/archive/YYYY.csv` | Basis data induk per tahun (kotak Kapuas Hulu) |
| `data/export/` | SHP, KML, GeoJSON, CSV: titik panas radius 25 km desa (semua tahun), kejadian api, SHP per tahun Kapuas Hulu |
| `data/provenance/` | Jejak audit unduhan |
| `data/geo.json`, `data/context.geojson` | Batas wilayah dan lapisan konteks |

Kolom penting: `status_data` (SP = arsip final NASA, NRT = sementara), `type` (0 dugaan kebakaran vegetasi, 1 gunung api, 2 sumber panas statis, 3 lepas pantai; 1–3 tidak dihitung di statistik), `luas_piksel_ha` (luas piksel satelit, bukan luas terbakar).

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
