# Rencana fitur Pantau Rimbak (antrean, disimpan 26 Nov 2026)

Disetujui untuk dikerjakan nanti (urutan saran: 1, 3, 4, 5, 6 tanpa campur tangan pengguna; 2 & 7 satu paket skrip server):

1. Peringatan pembukaan hutan (Sentinel-2, `scripts/peringatan_hutan.py`) untuk wilayah SHP – notifikasi HP & email.
2. Alur kerja lapangan untuk tim wilayah SHP: Cek lapangan, Patroli & temuan, Tindak lanjut kejadian, Posisi tim – data terpisah per ruang kerja (kemungkinan perlu skrip server v17).
3. Luas bekas terbakar Sentinel-2 (`scripts/bekas_terbakar.py`) untuk wilayah SHP.
4. Analisis lahan & karbon wilayah SHP dihitung ulang otomatis tiap tahun.
5. Indikator & laporan bulanan PDF otomatis lewat email untuk wilayah SHP.
6. Unduh peta per tahun (tutupan & perubahan; SHP/GeoJSON) untuk wilayah SHP.
7. Email otomatis ke Pengembang bila ada galat baru / data berhenti diperbarui (skrip server, digabung dengan no. 2).

## 12 alat baru (27 Nov 2026)
Sudah live: gambut nasional, keanekaragaman hayati, peringatan hutan Sentinel-2 SHP, bekas terbakar Sentinel-2 SHP, analisis ulang tahunan, laporan bulanan email, unduh peta per tahun, genangan JRC, biomassa & tinggi tajuk, radar Sentinel-1.
Tertunda:
- Status kawasan & moratorium (PIPPIB): geoportal KLHK tidak terjangkau dari GitHub/kontainer – menunggu hasil "Uji akses layanan peta KLHK" (Studio → Sistem) dari jaringan Indonesia.
- Perkiraan emisi api (CAMS GFAS): perlu akun & kunci gratis Copernicus ADS (secret ADS_KEY).
