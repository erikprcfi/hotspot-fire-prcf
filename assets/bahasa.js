/* Fire Hotspot – pilihan bahasa antarmuka (Bahasa Indonesia / English) – Yayasan PRCF Indonesia
 * Bahasa Indonesia = teks asli. English = terjemahan manual (kamus di bawah, ditulis per kalimat; tidak memakai mesin penerjemah),
 * diterapkan ke teks yang tampil di layar. Nama resmi (Hutan Desa, desa, peraturan, sumber data) dibiarkan sesuai aslinya.
 * Bagian bertanda data-notr (mis. obrolan Bara Api) diatur modulnya sendiri.
 * Pemakaian: FHLang.get() → 'id'|'en'; FHLang.set('en') (memuat ulang aplikasi); FHLang.t('teks'); FHLang.picker(el)
 */
(function () {
'use strict';
const KEY = 'fh_lang';
let L = 'id';
try { L = localStorage.getItem(KEY) || 'id'; } catch (e) { }   // bawaan: Bahasa Indonesia; English dipilih di Profil → Bahasa
if (L !== 'en') L = 'id';
document.documentElement.lang = L;

/* ---------- kamus (kunci: angka diganti '#'; terjemahan memakai '#' berurutan atau {1},{2} untuk urutan lain) ---------- */
const D = {
'Hutan Desa · Kapuas Hulu': 'Village Forests · Kapuas Hulu',
'# deteksi tersinkron ✓': '# detections synced ✓',
'Data satelit NASA FIRMS · prakiraan BMKG & ECMWF': 'NASA FIRMS satellite data · BMKG & ECMWF forecasts',
'Selamat pagi': 'Good morning', 'Selamat siang': 'Good afternoon', 'Selamat sore': 'Good afternoon', 'Selamat malam': 'Good evening', 'Selamat datang': 'Welcome',
'Pilih Hutan Desa yang ingin dipantau. Status dihitung dari titik panas satelit NASA # hari terakhir.': 'Choose the Village Forest to monitor. Status is calculated from NASA satellite hotspots over the last # days.',
'Lihat semua lokasi di peta': 'See all sites on the map',
'Kabupaten Kapuas Hulu · Kalimantan Barat · data NASA FIRMS (VIIRS & MODIS)': 'Kapuas Hulu Regency · West Kalimantan · NASA FIRMS data (VIIRS & MODIS)',
'🛰 Sentinel-# bebas awan # · # m (dekatkan untuk citra resolusi tinggi)': '🛰 Cloud-free Sentinel-# # · # m (zoom in for high-resolution imagery)',
'Offline · data # jam lalu': 'Offline · data from # h ago',
'Hotspot Terbaru': 'Latest Hotspot', 'Tanggal': 'Date', 'Sumber': 'Source', 'Lokasi': 'Location',
'Kapuas Hulu · # km dari desa': 'Kapuas Hulu · # km from the village',
'Aman': 'Safe', 'Waspada': 'Alert', 'Siaga': 'Warning', 'Awas': 'Danger',
'Tidak ada titik di desa & radius # km (# hari). # titik di radius #–# km, terdekat # km.': 'No hotspots in the village & # km radius (# days). # hotspots within #–# km, nearest # km.',
'Bahaya kebakaran # hari:': 'Fire danger, # days:', 'Rendah': 'Low', 'Kualitas udara:': 'Air quality:', 'Sedang': 'Moderate', 'Tinggi': 'High', 'Ekstrem': 'Extreme', 'RENDAH': 'LOW', 'SEDANG': 'MODERATE', 'TINGGI': 'HIGH', 'EKSTREM': 'EXTREME',
'FOKUS': 'FOCUS', 'ANGIN': 'WIND', 'KOMPAS': 'COMPASS',
'NASA · # hari terakhir ▾': 'NASA · last # days ▾', 'Keyakinan': 'Confidence',
'Bara Api · Asisten AI': 'Bara Api · AI Assistant', 'Tanya perhutanan sosial, regulasi & karhutla · bahasa apa pun': 'Ask about social forestry, regulations & forest fires · any language',
'Sebaran Titik Panas': 'Hotspot Distribution', 'Per zona, petak & satelit': 'By zone, patrol block & satellite',
'Hutan Desa': 'Village Forest', '≤ # km dari desa': '≤ # km from the village', '#–# km dari desa': '#–# km from the village',
'Grafik dan Rekap': 'Charts & Summary', 'Tren tahunan #–sekarang': 'Annual trend #–present', 'Rekap Tahunan': 'Annual Summary', 'memuat…': 'loading…', 'Memuat…': 'Loading…',
'Cuaca & Musim Api': 'Weather & Fire Season', 'Hujan # hari: # mm': 'Rain, # days: # mm', 'Hujan # hari': 'Rain, # days',
'Kejadian Api': 'Fire Events', 'Deteksi dikelompokkan per kejadian': 'Detections grouped into events',
'Bekas Terbakar': 'Burned Areas', 'Luas dari citra Sentinel-#': 'Area from Sentinel-# imagery', 'belum ada': 'none yet',
'Analisis Lahan & Karbon': 'Land & Carbon Analysis', 'Tutupan lahan, hutan, emisi karbon · unggah SHP': 'Land cover, forest, carbon emissions · upload SHP',
'Tutupan Hutan': 'Forest Cover', 'Hilang # ha di HD sejak #': '# ha lost in the VF since #', 'Kehilangan pohon': 'Tree cover loss', 'Hutan Desa, #–#': 'Village Forest, #–#',
'Bulan lalu': 'Last month', 'Bulan ini': 'This month', '# bulan terakhir': 'Last # months', 'Tahun lalu': 'Last year', 'Tahun ini': 'This year', 'Semua data': 'All data', 'Kustom': 'Custom',
'Periode': 'Period', '# bulan': '# months', 'Dari': 'From', 'Sampai': 'To', 'Wilayah': 'Area',
'Desa & radius # km': 'Village & # km radius', 'Disarankan untuk laporan rutin': 'Recommended for routine reports', 'Hutan Desa, desa & radius # km': 'Village Forest, village & # km radius',
'Fokus wilayah kelola': 'Focus on the managed area', 'Seluruh Kapuas Hulu': 'All of Kapuas Hulu', 'Gambaran kabupaten': 'Regency overview', 'Sensor satelit': 'Satellite sensor', 'Semua': 'All',
'Lihat pratinjau laporan': 'Preview report',
'Laporan berisi ringkasan, penjelasan cuaca, peta, grafik, tabel rekap, kejadian api dan lampiran detail (± #–# halaman). Dibuat langsung di HP dari basis data terbaru.': 'The report contains a summary, weather explanation, maps, charts, summary tables, fire events and detailed annexes (± #–# pages). Generated on the phone from the latest database.',
'GPS saya': 'My GPS', 'Desa dampingan': 'Assisted villages', 'Lokasi saya': 'My location',
'Peringatan dini bahaya kebakaran · # hari': 'Fire danger early warning · # days',
'tingkat tertinggi sepanjang minggu': 'highest level this week',
'Peluang api mulai menyala rendah. Kondisi musim hujan; kabut asap parah kecil kemungkinannya.': 'Low chance of fires igniting. Rainy-season conditions; severe haze is unlikely.',
'Arti kelas menurut FDRS Indonesia (de Groot dkk. #).': 'Class meaning per the Indonesian FDRS (de Groot et al. #).',
'Penyulutan permukaan (FFMC)': 'Surface ignition (FFMC)', 'Kekeringan dalam / gambut (DC)': 'Deep / peat drought (DC)',
'Diperbarui # WIB · BMKG + ECMWF': 'Updated # WIB · BMKG + ECMWF',
'Peta prakiraan asap & udara': 'Smoke & air forecast map', 'Asap kebakaran': 'Fire smoke', 'Aerosol total': 'Total aerosol',
'saat ini · T+# jam · model CAMS': 'now · T+# h · CAMS model', 'AOD total di titik': 'Total AOD at point',
'Ketebalan optik aerosol dari pembakaran biomassa (kebakaran hutan & lahan), # nm. Diwarnai mulai #. Nilai lebih rendah dibiarkan transparan sehingga citra satelit asli terlihat.': 'Aerosol optical depth from biomass burning (forest & land fires), # nm. Coloured from #. Lower values are left transparent so the original satellite imagery stays visible.',
'Hasil model': 'Model output', '(grid ±# km), bukan alat ukur; asap dari kebakaran yang baru muncul bisa belum tercakup.': '(grid ±# km), not a measuring instrument; smoke from newly started fires may not be included yet.',
'Sumber: Copernicus Atmosphere Monitoring Service (CAMS) melalui layanan peta publik ECMWF; nilai di titik: CAMS global via Open-Meteo.': 'Source: Copernicus Atmosphere Monitoring Service (CAMS) via the ECMWF public map service; point values: global CAMS via Open-Meteo.',
'Meteogram ensemble · # hari': 'Ensemble meteogram · # days', 'Kualitas udara & asap': 'Air quality & smoke', '# jam': '# h', 'Kualitas udara · #:# WIB': 'Air quality · #:# WIB', 'Kualitas udara': 'Air quality',
'Tingkat mutu udara masih dapat diterima pada kesehatan manusia, hewan, dan tumbuhan.': 'Air quality is still acceptable for human, animal and plant health.',
'Tingkat mutu udara yang sangat baik, tidak memberikan efek negatif terhadap manusia, hewan, tumbuhan.': 'Very good air quality, with no negative effects on humans, animals or plants.',
'PM# jam ini # µg/m³ · penjelasan kategori ISPU (Permen LHK #/#)': 'PM# this hour # µg/m³ · category explanation per ISPU (MoEF Reg. #/#)',
'karbon monoksida permukaan (µg/m³)': 'surface carbon monoxide (µg/m³)', 'ketebalan aerosol/asap (AOD # nm)': 'aerosol/smoke depth (AOD # nm)',
'PM# rata-rata harian · # hari lalu & prakiraan # hari': 'PM# daily mean · past # days & # -day forecast', 'Kini': 'Now',
'Angka di bawah batang = tanggal; batang bergaris = prakiraan.': 'Numbers under bars = date; striped bars = forecast.',
'Baik': 'Good', 'Tidak Sehat': 'Unhealthy', 'Sangat Tidak Sehat': 'Very Unhealthy', 'Berbahaya': 'Hazardous',
'# hari ke depan': 'Next # days', 'Hari ini': 'Today', 'Besok': 'Tomorrow', 'Kemarin': 'Yesterday',
'Udara Kabur': 'Haze', 'Hujan Ringan': 'Light Rain', 'Hujan ringan': 'Light rain', 'Hujan Sedang': 'Moderate Rain', 'Hujan sedang': 'Moderate rain', 'Hujan Lebat': 'Heavy Rain', 'Hujan lebat': 'Heavy rain', 'Hujan Petir': 'Thunderstorm', 'Hujan petir': 'Thunderstorm',
'Gerimis': 'Drizzle', 'Gerimis lebat': 'Dense drizzle', 'Gerimis ringan': 'Light drizzle', 'Hujan lokal ringan': 'Light local showers', 'Hujan lokal sedang': 'Moderate local showers', 'Hujan lokal lebat': 'Heavy local showers',
'Cerah': 'Clear', 'Cerah Berawan': 'Partly Cloudy', 'Cerah berawan': 'Partly cloudy', 'Berawan': 'Cloudy', 'Berawan sebagian': 'Partly cloudy', 'Berawan Tebal': 'Overcast', 'Berawan tebal': 'Overcast', 'Kabut': 'Fog', 'Asap': 'Smoke', 'Mendung': 'Overcast',
'keyakinan sedang': 'medium confidence', 'keyakinan lebih rendah': 'lower confidence', 'keyakinan rendah': 'low confidence', 'keyakinan tinggi': 'high confidence', 'kecenderungan': 'tendency', 'Hari #–#': 'Days #–#',
'kelas FDRS Indonesia': 'Indonesian FDRS class', 'Prakiraan resmi BMKG': 'Official BMKG forecast',
'Sumber: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika), prakiraan per # jam untuk kode wilayah #. Hujan dalam mm.': 'Source: BMKG (Indonesian Agency for Meteorology, Climatology and Geophysics), #-hourly forecast for area code #. Rain in mm.',
'Indeks bahaya kebakaran': 'Fire danger index', 'Hari': 'Day', 'penyulutan': 'ignition', 'penjalaran': 'spread', 'kekeringan': 'drought',
'Nilai dari prakiraan ECMWF; baris pudar = hari #–# (keyakinan rendah).': 'Values from the ECMWF forecast; faded rows = days #–# (low confidence).',
': kekeringan serasah & rumput, mudahnya api menyala.': ': dryness of litter & grass, how easily fire ignites.', ': kecepatan menjalar dengan angin.': ': rate of spread with wind.',
': kekeringan lapisan dalam & gambut, potensi asap.': ': dryness of deep layers & peat, smoke potential.', ': intensitas api secara umum.': ': general fire intensity.',
'Prakiraan musiman · # bulan': 'Seasonal forecast · # months', 'Cenderung': 'Tending', 'di bawah normal (lebih kering)': 'below normal (drier)', 'di atas normal (lebih basah)': 'above normal (wetter)', 'normal': 'normal',
'· peluang #%': '· #% chance', 'Di bawah normal': 'Below normal', 'Normal': 'Normal', 'Di atas normal': 'Above normal', 'Prakiraan (median # anggota):': 'Forecast (median of # members):',
', rentang #–# mm (#–#%). Normal ERA# #–#: # mm; batas tersil # dan # mm; terendah #, tertinggi # mm.': ', range #–# mm (#–#%). ERA# normal #–#: # mm; tercile limits # and # mm; lowest #, highest # mm.',
'Tidak ada kecenderungan kuat (tidak ada kategori ≥ #%)': 'No strong tendency (no category ≥ #%)',
'Sumber: ECMWF SEAS# (sistem prakiraan musiman ECMWF/Copernicus C#S), # anggota ensemble, via Open-Meteo Seasonal API; normal = ERA# #–# di titik yang sama. Peluang dihitung dari jumlah anggota ensemble yang jatuh di bawah/di antara/di atas tersil normal ERA#. Belum dikoreksi bias model terhadap ERA#; gunakan sebagai kecenderungan dan bandingkan dengan Prakiraan Hujan Bulanan resmi BMKG. Prakiraan resmi BMKG:': 'Source: ECMWF SEAS# (ECMWF/Copernicus C#S seasonal forecasting system), # ensemble members, via the Open-Meteo Seasonal API; normal = ERA# #–# at the same point. Probabilities are the share of ensemble members below/between/above the ERA# normal terciles. Not bias-corrected against ERA#; use as a tendency and compare with the official BMKG Monthly Rainfall Forecast. Official BMKG forecast:',
'Riwayat cuaca': 'Weather history', '# hari': '# days', '# tahun': '# years', 'Pilih tanggal': 'Choose dates', '# hari data': '# days of data',
'total curah hujan · #% dari normal (lebih kering dari normal)': 'total rainfall · #% of normal (drier than normal)', 'total curah hujan · #% dari normal (lebih basah dari normal)': 'total rainfall · #% of normal (wetter than normal)', 'total curah hujan · #% dari normal (mendekati normal)': 'total rainfall · #% of normal (near normal)',
'hari hujan (≥ # mm) dari # hari': 'rain days (≥ # mm) out of # days', 'kering beruntun terpanjang, berakhir # September #': 'longest dry spell, ended # September #',
'kelembapan rata-rata': 'mean humidity', 'angin maksimum (km/jam)': 'maximum wind (km/h)', 'titik panas ≤ # km pada periode ini': 'hotspots ≤ # km in this period',
'Curah hujan & suhu per hari': 'Daily rainfall & temperature', 'Curah hujan (mm/hari)': 'Rainfall (mm/day)', 'Suhu maksimum rata-rata (°C)': 'Mean maximum temperature (°C)', 'Titik panas ≤ # km': 'Hotspots ≤ # km',
'Bahaya kebakaran harian (FDRS)': 'Daily fire danger (FDRS)', 'Hari per tingkat bahaya:': 'Days per danger level:', 'Rendah #': 'Low #', 'Sedang #': 'Moderate #', 'Tinggi #': 'High #', 'Ekstrem #': 'Extreme #',
'. Garis = FFMC (kekeringan serasah); latar = kelas FDRS.': '. Line = FFMC (litter dryness); background = FDRS class.',
'Tabel harian (# hari)': 'Daily table (# days)', 'Hujan (mm)': 'Rain (mm)', 'Suhu maks (°C)': 'Max temp (°C)', 'Angin maks (km/jam)': 'Max wind (km/h)', 'Unduh CSV (# hari)': 'Download CSV (# days)',
'Kekeringan bahan bakar (FFMC) · # minggu + prakiraan': 'Fuel dryness (FFMC) · # weeks + forecast',
'Garis = FFMC harian; latar warna = kelas Rendah/Sedang/Tinggi/Ekstrem. DC hari ini # (Rendah).': 'Line = daily FFMC; background colour = Low/Moderate/High/Extreme class. DC today # (Low).',
'Semua lokasi · # hari': 'All sites · # days', 'rendah sepanjang minggu': 'low all week', 'sedang sepanjang minggu': 'moderate all week', 'Sumber & metode': 'Sources & method',
'Cuaca #–# hari:': 'Weather, days #–#:', 'prakiraan resmi BMKG per desa (API Prakiraan Cuaca Publik BMKG).': 'official BMKG village-level forecast (BMKG Public Weather Forecast API).', 'Cuaca # hari:': 'Weather, # days:',
'model ECMWF IFS #° (European Centre for Medium-Range Weather Forecasts), juga dipakai sistem bahaya kebakaran global Copernicus.': 'ECMWF IFS #° model (European Centre for Medium-Range Weather Forecasts), also used by the Copernicus global fire danger system.',
'Indeks:': 'Index:', 'Fire Weather Index (Van Wagner #) dari cuaca pukul # dan hujan # jam, dengan riwayat cuaca ERA# # hari terakhir. Kelas mengikuti FDRS Indonesia/Malaysia (de Groot dkk. #), dasar sistem FDRS BMKG.': 'Fire Weather Index (Van Wagner #) from # o\'clock weather and #-hour rain, with ERA# weather history for the last # days. Classes follow the Indonesia/Malaysia FDRS (de Groot et al. #), the basis of the BMKG FDRS system.',
'Tingkat harian': 'Daily level', '= kelas tertinggi antara FFMC dan DC. Bila BMKG dan ECMWF berbeda, dipakai yang lebih tinggi (prinsip kehati-hatian).': '= the higher class of FFMC and DC. If BMKG and ECMWF differ, the higher one is used (precautionary principle).',
'Prakiraan dapat meleset. Peringatan ini alat bantu kewaspadaan, bukan pengganti informasi resmi BMKG/Manggala Agni.': 'Forecasts can be wrong. This warning is an aid to vigilance, not a substitute for official BMKG/Manggala Agni information.',
'Unduh data': 'Download data', 'Jenis data': 'Data type', 'Titik panas (deteksi satelit NASA FIRMS)': 'Hotspots (NASA FIRMS satellite detections)', 'Kejadian api (titik pusat)': 'Fire events (centroids)', 'Kejadian api (poligon cakupan piksel)': 'Fire events (pixel footprint polygons)',
'Bekas terbakar (Sentinel-#, poligon)': 'Burned areas (Sentinel-#, polygons)', 'Peringatan perubahan tutupan hutan (Sentinel-#)': 'Forest cover change alerts (Sentinel-#)', 'Batas wilayah (Hutan Desa, desa, radius # & # km)': 'Boundaries (Village Forest, village, # & # km radius)',
'Titik panas seluruh Kapuas Hulu': 'Hotspots, all of Kapuas Hulu', 'Analisis lahan, hutan & karbon (setara GFW/GNW)': 'Land, forest & carbon analysis (GFW/GNW-equivalent)', 'Arsip asli NASA FIRMS (tanpa olahan)': 'Original NASA FIRMS archive (unprocessed)',
'Hutan Desa & desa saja': 'Village Forest & village only', 'Sampai # km dari batas desa': 'Up to # km from the village boundary', 'Tahun / periode': 'Year / period', 'Semua tahun (#–#)': 'All years (#–#)', 'Format file': 'File format', 'KML (Google Earth)': 'KML (Google Earth)', 'CSV (Excel)': 'CSV (Excel)',
'Satu titik per deteksi satelit (VIIRS # m & MODIS # km): waktu UTC & WIB, sensor, keyakinan, FRP, suhu kecerahan, zona dan jarak ke batas desa, status data (arsip final/NRT), ID kejadian.': 'One point per satellite detection (VIIRS # m & MODIS # km): UTC & WIB time, sensor, confidence, FRP, brightness temperature, zone and distance to the village boundary, data status (final archive/NRT), event ID.',
'Unduh': 'Download', 'Koordinat WGS # (EPSG:#), kecuali poligon cakupan piksel (UTM #N). Jejak audit sumber:': 'Coordinates WGS # (EPSG:#), except pixel footprint polygons (UTM #N). Source audit trail:',
'Atribut lengkap: koordinat, waktu UTC & WIB, satelit, keyakinan, FRP, suhu kecerahan, zona, jarak ke desa, petak, fungsi kawasan, tutupan #, gambut, status data (NRT/SP) dan ID kejadian. Luas piksel bukan luas terbakar.': 'Full attributes: coordinates, UTC & WIB time, satellite, confidence, FRP, brightness temperature, zone, distance to village, patrol block, forest function, # land cover, peat, data status (NRT/SP) and event ID. Pixel area is not burned area.',
'Patroli lapangan': 'Field patrol', 'Laporkan temuan kebakaran baru': 'Report a new fire', 'Untuk titik dari satelit: buka titiknya di peta →': 'For satellite hotspots: open the point on the map →', 'Laporkan hasil cek lapangan': 'Report the field check result',
'. Laporan tersimpan di HP dan terkirim otomatis ke basis data PRCF saat ada sinyal.': '. Reports are stored on the phone and sent automatically to the PRCF database when there is signal.',
'Peta luring (tanpa sinyal)': 'Offline map (no signal)', 'Belum ada peta luring di HP ini.': 'No offline map on this phone yet.',
'Menyimpan citra Sentinel-# # (zoom #–#, radius # km), titik panas, batas wilayah, prakiraan & orbit satelit. Setelah itu peta, titik, kompas & formulir cek lapangan tetap jalan tanpa sinyal. Citra resolusi tinggi (Esri) hanya tersimpan untuk area yang pernah dibuka, karena ketentuan layanannya melarang unduh massal.': 'Saves Sentinel-# # imagery (zoom #–#, # km radius), hotspots, boundaries, forecasts & satellite orbits. After that the map, hotspots, compass & field-check form keep working without signal. High-resolution imagery (Esri) is only kept for areas you have opened, because its terms of service forbid bulk download.',
'Status sistem': 'System status', 'Pembaruan terakhir': 'Last update', '# jam lalu · #/# sumber OK': '# h ago · #/# sources OK', 'Pembaruan berikutnya': 'Next update', 'Riwayat pembaruan otomatis': 'Automatic update history',
'Tiap batang = satu pembaruan otomatis (tinggi = titik baru, hijau = semua sumber NASA berhasil). # pembaruan tercatat.': 'Each bar = one automatic update (height = new hotspots, green = all NASA sources succeeded). # updates recorded.',
'Basis data': 'Database', 'deteksi tersimpan': 'detections stored', 'rentang arsip NASA': 'NASA archive range', 'sensor satelit': 'satellite sensors', 'arsip ber-sidik SHA-#': 'SHA-# fingerprinted archives', 'hari data cuaca': 'days of weather data', 'pembaruan per hari': 'updates per day',
'Sumber NASA hari ini': 'NASA sources today', '# titik di kotak': '# hotspots in the box',
'Tampilan': 'Appearance', 'Otomatis': 'Automatic', 'Terang': 'Light', 'Gelap': 'Dark', 'Tentang': 'About',
'Cara kerja & validitas data': 'How it works & data validity', 'NASA FIRMS, pembaruan # jam, jejak audit': 'NASA FIRMS, #-hour updates, audit trail', 'Zona & tingkat status': 'Zones & status levels', 'Aman, Waspada, Siaga': 'Safe, Alert, Warning',
'Buka versi website': 'Open the website version', 'Tampilan lengkap untuk laptop': 'Full layout for laptops', 'Kode & jejak audit (GitHub)': 'Code & audit trail (GitHub)', 'Semua data dan riwayat terbuka': 'All data and history are open',
'Fire Hotspot · Pemantauan Hutan Desa': 'Fire Hotspot · Village Forest Monitoring', 'Kabupaten Kapuas Hulu, Kalimantan Barat': 'Kapuas Hulu Regency, West Kalimantan',
'Beranda': 'Home', 'Prakiraan': 'Forecast', 'Data': 'Data', 'Laporan': 'Reports', 'Lainnya': 'More', 'Pratinjau laporan': 'Report preview',
'Buat akun Anda': 'Create your account', 'Daftar sekali saja dengan data asli. Email Anda akan diverifikasi.': 'Register once with your real data. Your email will be verified.',
'Biodata': 'Personal details', 'Isi sesuai identitas asli (KTP). Data palsu akan diblokir admin.': 'Fill in as on your official ID (KTP). Fake data will be blocked by the admin.',
'Foto profil (opsional, wajah jelas)': 'Profile photo (optional, clear face)', 'Nama lengkap (sesuai KTP)': 'Full name (as on ID)', 'Tanggal lahir': 'Date of birth', 'Alamat lengkap': 'Full address',
'Email aktif (akan diverifikasi)': 'Active email (will be verified)', 'Nomor HP / WhatsApp aktif': 'Active phone / WhatsApp number', 'Lanjut: verifikasi email': 'Next: verify email', 'Verifikasi email': 'Verify email',
'Membuktikan email ini benar milik Anda.': 'Proves that this email really belongs to you.', 'Ubah biodata': 'Edit details', 'Keamanan akun': 'Account security', 'Email terverifikasi ✓. Buat kata sandi.': 'Email verified ✓. Create a password.',
'Kata sandi': 'Password', 'Ulangi kata sandi': 'Repeat password', 'Biodata dan foto disimpan di HP ini dan dikirim ke': 'Details and photo are stored on this phone and sent to the',
'database pengguna Yayasan PRCF Indonesia': 'Yayasan PRCF Indonesia user database', 'untuk administrasi pengguna aplikasi. Data tidak dibagikan ke pihak lain.': 'for app user administration. Data is not shared with other parties.',
'Kata sandi tidak pernah dikirim': 'Your password is never sent', '; di HP disimpan terenkripsi satu arah.': '; on the phone it is stored one-way encrypted.',
'Saya menyetujui biodata dan foto saya disimpan dan diolah oleh Yayasan PRCF Indonesia untuk administrasi pengguna aplikasi Fire Hotspot, sesuai UU No. # Tahun # tentang Pelindungan Data Pribadi. Saya dapat mengubah atau menghapus akun kapan saja.': 'I agree that my details and photo are stored and processed by Yayasan PRCF Indonesia for Fire Hotspot user administration, in accordance with Law No. # of # on Personal Data Protection. I can change or delete my account at any time.',
'Daftar & masuk': 'Register & sign in', 'Pilih lokasi Hutan Desa': 'Choose a Village Forest', 'Kembali': 'Back', 'Bara Api – asisten AI': 'Bara Api – AI assistant', 'Profil saya': 'My profile', 'Muat ulang data': 'Reload data',
'Sembunyikan kartu info': 'Hide info card', 'Tutup lapisan NASA': 'Close NASA layer', 'Hari sebelumnya': 'Previous day', 'Hari berikutnya': 'Next day', 'Putar pergerakan # hari': 'Play # -day movement',
'Daftar titik panas': 'Hotspot list', 'Filter satelit dan periode': 'Satellite & period filter', 'Lapisan peta': 'Map layers', 'Peta #D dan globe': '#D map and globe', 'Fokus wilayah': 'Focus area', 'Animasi angin': 'Wind animation', 'Kompas': 'Compass',
'Prakiraan & Peringatan Dini': 'Forecast & Early Warning', 'Cari cuaca desa, kecamatan, kota…': 'Search weather for a village, district, city…', 'Cari lokasi': 'Search location', 'Putar': 'Play', 'Waktu prakiraan': 'Forecast time', 'AOD total di titik per # jam': 'Total AOD at point every # h',
'Grafik curah hujan dan suhu': 'Rainfall and temperature chart', 'Unduh data · status sistem · info': 'Download data · system status · info', 'Tutup': 'Close', 'Tambah foto profil': 'Add profile photo',
'Jalan/dusun, desa/kelurahan, kecamatan, kabupaten': 'Street/hamlet, village, district, regency', 'Lihat kata sandi': 'Show password',
'# deteksi ≤ # km sejak #': '# detections ≤ # km since #', '# kejadian di desa & radius # km': '# events in the village & # km radius', '≤ # km dari desa': '≤ # km from the village',
'Meteogram ensemble belum dapat dimuat (HTTP #). Periksa koneksi internet.': 'Ensemble meteogram could not be loaded (HTTP #). Check your internet connection.',
'titik di Kapuas Hulu': 'hotspots in Kapuas Hulu', 'desa & radius # km': 'village & # km radius', 'km titik terdekat': 'km to nearest hotspot', 'Per zona': 'By zone', 'Per satelit': 'By satellite', 'Titik terbaru': 'Latest hotspots',
'# km dari Desa Nanga Lauk': '# km from Nanga Lauk village', 'Semua sensor': 'All sensors', 'Desa & # km': 'Village & # km', 'Sampai # km': 'Up to # km', 'total deteksi #–#': 'total detections #–#', 'tahun tertinggi (#)': 'peak year (#)', 'di Hutan Desa sejak #': 'in the Village Forest since #',
'Deteksi per tahun': 'Detections per year', 'Rekap per tahun': 'Summary per year',
'VIIRS tersedia sejak # (S-NPP) dan # (NOAA-#); MODIS sejak #. Tahun berjalan dapat bertambah.': 'VIIRS available since # (S-NPP) and # (NOAA-#); MODIS since #. The current year may still increase.',
'Bahaya kebakaran hari ini: Rendah': 'Fire danger today: Low', 'Bahaya kebakaran hari ini: Sedang': 'Fire danger today: Moderate', 'Bahaya kebakaran hari ini: Tinggi': 'Fire danger today: High', 'Bahaya kebakaran hari ini: Ekstrem': 'Fire danger today: Extreme',
'Indeks FDRS (Fire Weather Index) dari prakiraan BMKG & ECMWF; arti kelas menurut de Groot dkk. (#). Rincian di menu Prakiraan.': 'FDRS index (Fire Weather Index) from BMKG & ECMWF forecasts; class meaning per de Groot et al. (#). Details in the Forecast menu.',
'mm hujan # hari': 'mm rain, # days', 'suhu maks rata-rata': 'mean max temperature', 'Hujan harian # hari': 'Daily rain, # days', 'Total # mm · data s.d. #-#-#': 'Total # mm · data to #-#-#', 'Musim kebakaran': 'Fire season',
'Deteksi ≤ # km (#–kini)': 'Detections ≤ # km (#–now)', 'Hujan normal (mm/bulan)': 'Normal rainfall (mm/month)',
'Berdasarkan data lokasi ini: deteksi terbanyak pada bulan Agu (#), Jul (#), Sep (#); bulan dengan hujan normal terendah Jul (# mm), Agu (# mm), Jun (# mm).': 'Based on this site\'s data: most detections in Aug (#), Jul (#), Sep (#); months with the lowest normal rainfall Jul (# mm), Aug (# mm), Jun (# mm).',
'Desa': 'Village', '# kejadian. Deteksi berjarak ≤ # km dan ≤ # hari digabung menjadi satu kejadian.': '# events. Detections ≤ # km and ≤ # days apart are merged into one event.', 'deteksi': 'detections', 'FRP maks': 'Max FRP', 'Petak': 'Block',
'Air/Danau/Sungai': 'Water/Lake/River', 'Hutan Rawa Sekunder': 'Secondary Swamp Forest', 'Pertanian Lahan Kering Campur Semak': 'Dryland Agriculture Mixed with Shrub', 'Semak Belukar Rawa': 'Swamp Shrubland', 'Hutan Lahan Kering Sekunder': 'Secondary Dryland Forest',
'Hutan Lahan Kering Primer': 'Primary Dryland Forest', 'Hutan Rawa Primer': 'Primary Swamp Forest', 'Semak Belukar': 'Shrubland', 'Perkebunan': 'Plantation', 'Pertanian Lahan Kering': 'Dryland Agriculture', 'Sawah': 'Rice Field', 'Tanah Terbuka': 'Bare Land', 'Permukiman': 'Settlement', 'Hutan Tanaman': 'Plantation Forest', 'Rawa': 'Swamp',
'Gambut: # cm–# cm (Gambut Topogen Air Tawar)': 'Peat: # cm–# cm (Freshwater Topogenous Peat)', 'Gambut: # cm–# cm (Tepi Kubah Gambut)': 'Peat: # cm–# cm (Peat Dome Edge)', 'Gambut: # cm–# cm (Kubah Gambut)': 'Peat: # cm–# cm (Peat Dome)',
'ha total terdeteksi': 'ha detected in total', 'musim api dianalisa': 'fire seasons analysed', 'menunggu citra / tertutup awan': 'awaiting imagery / cloud covered', '# kejadian api · status:': '# fire events · status:', 'tertutup awan': 'cloud covered', 'selesai': 'done',
'(cerah #%). Dicoba ulang otomatis setiap hari.': '(#% clear). Retried automatically every day.', 'Metode': 'Method', 'dan': 'and',
'Komposit citra Sentinel-# L#A (ESA Copernicus) sebelum & sesudah api; awan/bayangan dibuang (SCL, diperlebar # m). Piksel dihitung terbakar bila NBR turun ≥ # (Key & Benson #)': 'Sentinel-# L#A composites (ESA Copernicus) before & after the fire; clouds/shadows removed (SCL, buffered # m). A pixel counts as burned if NBR drops ≥ # (Key & Benson #)',
'SWIR naik, konsisten di ≥ # citra sesudah bila tersedia, sebelumnya bervegetasi, ≤ # km dari deteksi NASA FIRMS, petak ≥ # ha.': 'SWIR rises, consistent in ≥ # post-fire images where available, previously vegetated, ≤ # km from a NASA FIRMS detection, patch ≥ # ha.',
'Hasil adalah indikasi dari citra satelit # m; perlu verifikasi lapangan. Gambar memakai komposit SWIR-NIR-merah: vegetasi hijau, bekas terbakar cokelat-magenta; area kuning = terdeteksi terbakar.': 'Results are indications from # m satellite imagery; field verification is needed. Images use a SWIR-NIR-red composite: vegetation green, burn scars brown-magenta; yellow area = detected as burned.',
'Analisis area': 'Area analysis', 'Lahan · hutan · karbon · titik panas': 'Land · forest · carbon · hotspots', 'Analisis lahan, hutan & karbon': 'Land, forest & carbon analysis',
'Setara analisis area Global Forest Watch / Global Nature Watch: tutupan lahan #–#, perubahan hutan #–#, emisi & serapan karbon, stok karbon, titik panas. Data resmi, dihitung dari raster aslinya.': 'Equivalent to Global Forest Watch / Global Nature Watch area analysis: land cover #–#, forest change #–#, carbon emissions & removals, carbon stock, hotspots. Official data, computed from the original rasters.',
'Area dampingan PRCF': 'PRCF-assisted areas', 'Unggah SHP area Anda': 'Upload your area SHP', 'Format': 'Format',
'berisi .shp, .shx, .dbf dan .prj (WGS # atau UTM), tipe poligon, luas maks. # ha, di Indonesia. Hanya untuk pengguna dengan email terverifikasi; setiap unggahan tercatat atas nama Anda.': 'containing .shp, .shx, .dbf and .prj (WGS # or UTM), polygon type, max. # ha, within Indonesia. Only for users with a verified email; every upload is recorded under your name.',
'Masuk sebagai': 'Signed in as', 'Pilih berkas SHP (.zip)': 'Choose SHP file (.zip)', 'atau seret ke sini': 'or drag it here', 'Analisis saya': 'My analyses', 'Gagal memuat (perlu internet).': 'Failed to load (internet needed).',
'hutan tersisa # dari # ha (#) di dalam Hutan Desa · hilang # ha (#%)': 'forest remaining # of # ha (#) inside the Village Forest · # ha lost (#%)', 'Kehilangan tutupan pohon per tahun (ha)': 'Tree cover loss per year (ha)', 'Desa (di luar HD)': 'Village (outside the VF)', 'Radius #–# km': 'Radius #–# km',
'Kehilangan terbesar di dalam Hutan Desa: # (# ha).': 'Largest loss inside the Village Forest: # (# ha).', 'Peringatan perubahan terbaru · Sentinel-#': 'Latest change alerts · Sentinel-#', '# ha indikasi perubahan': '# ha of indicated change',
'# petak · # ha di dalam Hutan Desa · #-#-# s.d. #-#-#': '# patches · # ha inside the Village Forest · #-#-# to #-#-#',
'Dibanding periode sama tahun lalu (#-#-# s.d. #-#-#); hutan acuan # ha; wilayah cerah #%. Citra: #-#-#, #-#-#, #-#-#, #-#-#. Indikasi dari citra # m (pembukaan, tebangan, kebakaran, dll.), perlu verifikasi lapangan. Peta: lapisan "Peringatan perubahan hutan".': 'Compared with the same period last year (#-#-# to #-#-#); reference forest # ha; clear area #%. Images: #-#-#, #-#-#, #-#-#, #-#-#. Indications from # m imagery (clearing, logging, fire, etc.), field verification needed. Map: "Forest change alerts" layer.',
'Ringkasan per zona': 'Summary by zone', 'Hutan #: # ha · hilang # ha (#%) · tersisa # ha': 'Forest #: # ha · lost # ha (#%) · remaining # ha', 'Sumber & definisi': 'Sources & definitions',
'Hutan = tutupan tajuk tahun # >= #% (ambang Global Forest Watch). Kehilangan = hilangnya tutupan pohon (penebangan, kebakaran, pembukaan, kerusakan alami); bukan selalu deforestasi permanen.': 'Forest = canopy cover in # >= #% (Global Forest Watch threshold). Loss = removal of tree cover (logging, fire, clearing, natural damage); not always permanent deforestation.',
'Peta: aktifkan lapisan "Kehilangan tutupan pohon (GFW/UMD)" di menu lapisan peta Beranda.': 'Map: turn on the "Tree cover loss (GFW/UMD)" layer in the Home map layers menu.',
'💨 Angin # m · ECMWF': '💨 Wind # m · ECMWF', 'Data angin belum dapat dimuat (periksa internet)': 'Wind data could not be loaded (check internet)', 'Data angin belum dapat dimuat (perlu internet).': 'Wind data could not be loaded (internet needed).', 'km/jam': 'km/h', '# km/jam': '# km/h',
'Model ECMWF IFS #° via Open-Meteo · garis bergerak ke arah tiupan angin': 'ECMWF IFS #° model via Open-Meteo · lines move in the wind direction', 'Jam prakiraan': 'Forecast hour',
'Arah · GPS · matahari': 'Direction · GPS · sun', 'Terbit': 'Sunrise', 'Ketinggian': 'Altitude', 'Terbenam': 'Sunset', 'Menunggu sensor': 'Waiting for sensor', 'Izin lokasi ditolak': 'Location permission denied', 'Aktifkan kompas': 'Enable compass', 'Arah ke titik panas': 'Direction to hotspot', 'Catatan ketelitian': 'Accuracy notes',
'Arah dari sensor magnet HP (utara magnetik; di Indonesia selisih dengan utara sebenarnya kecil, umumnya < #°). Jauhkan HP dari logam, motor & magnet. Bila arah meleset, gerakkan HP membentuk angka # beberapa kali untuk kalibrasi. Ketinggian dari GPS (umumnya ±#–# m). Terbit/terbenam dihitung dari posisi matahari (NOAA). Panah oranye = arah ke target, dihitung dari koordinat GPS Anda.': 'Direction from the phone\'s magnetic sensor (magnetic north; in Indonesia the difference from true north is small, usually < #°). Keep the phone away from metal, motorbikes & magnets. If the direction is off, move the phone in a figure # a few times to calibrate. Altitude from GPS (usually ±#–# m). Sunrise/sunset computed from the sun\'s position (NOAA). Orange arrow = direction to the target, computed from your GPS coordinates.',
'Memuat globe #D…': 'Loading #D globe…', 'NASA FIRMS · relief #D': 'NASA FIRMS · #D relief', 'Perbesar': 'Zoom in', 'Perkecil': 'Zoom out', 'Arah utara': 'North up', 'Tampilan #D / datar': '#D / flat view', 'Mode globe': 'Globe mode', 'Putar otomatis': 'Auto-rotate', 'Kembali ke lokasi': 'Back to site',
'Citra jelas': 'Clear imagery', 'Sentinel-# terbaru': 'Latest Sentinel-#', 'Tanpa lapisan': 'No layer', 'Citra NASA kemarin': 'Yesterday\'s NASA imagery', 'Asap CO': 'CO smoke', 'Kabut asap AOD': 'AOD haze', '< # jam': '< # h', '#–# hari': '#–# days', '> # hari': '> # days', '· tinggi kolom = FRP (MW)': '· column height = FRP (MW)',
'Titik panas: NASA FIRMS (nilai asli). Relief: AWS Terrain Tiles (SRTM). Citra: Sentinel-# komposit terbaru (ESA Copernicus · Microsoft Planetary Computer) atau Esri World Imagery; lapisan harian NASA GIBS. Batas: SK Hutan Desa & peta batas desa. Tinggi relief diperbesar #×.': 'Hotspots: NASA FIRMS (original values). Relief: AWS Terrain Tiles (SRTM). Imagery: latest Sentinel-# composite (ESA Copernicus · Microsoft Planetary Computer) or Esri World Imagery; daily NASA GIBS layers. Boundaries: Village Forest decree & village boundary maps. Relief exaggerated #×.',
'Peta #D': '#D map', 'titik panas # hari': 'hotspots, # days', '< # jam (berdenyut)': '< # h (pulsing)', 'FRP maks (MW)': 'Max FRP (MW)',
'Titik panas terdeteksi': 'Hotspot detected', '# jam lalu': '# h ago', '# hari lalu': '# days ago', '# menit lalu': '# min ago', 'baru saja': 'just now', 'arsip final (SP)': 'final archive (SP)', 'near real-time (NRT)': 'near real-time (NRT)',
'Deteksi': 'Detection', 'Sensor': 'Sensor', 'resolusi piksel # m': 'pixel resolution # m', 'resolusi piksel # km': 'pixel resolution # km', 'Satelit': 'Satellite', 'Tingkat kepercayaan': 'Confidence level', 'Siang atau malam': 'Day or night', 'Siang': 'Day', 'Malam': 'Night',
'Kekuatan radiasi api (FRP)': 'Fire radiative power (FRP)', 'Suhu kecerahan': 'Brightness temperature', 'Waktu satelit (UTC)': 'Satellite time (UTC)', 'Koordinat': 'Coordinates', 'Luas piksel': 'Pixel area', 'bukan luas terbakar': 'not burned area',
'Apa arti warna titik panas?': 'What do hotspot colours mean?', 'Warna =': 'Colour =', 'tingkat kepercayaan': 'confidence level', 'NASA bahwa piksel itu benar api:': 'from NASA that the pixel is really fire:', 'merah': 'red', 'tinggi,': 'high,', 'jingga/kuning': 'orange/yellow', 'sedang (nominal),': 'medium (nominal),', 'kuning muda': 'light yellow',
'rendah. Ikon berdenyut = terdeteksi < # jam. FRP makin besar = api makin kuat. Satu titik mewakili satu piksel (# m), api sebenarnya bisa lebih kecil.': 'low. Pulsing icon = detected < # h ago. Higher FRP = stronger fire. One point represents one pixel (# m); the actual fire may be smaller.',
'Zona': 'Zone', 'Jarak ke desa': 'Distance to village', 'ID kejadian': 'Event ID', 'Angin di lokasi · saat ini': 'Wind at the location · now', 'Memuat ECMWF…': 'Loading ECMWF…', 'Lintasan satelit berikutnya': 'Next satellite passes', 'Menghitung orbit…': 'Computing orbits…',
'Rute': 'Route', 'Angin': 'Wind', 'Verifikasi di NASA FIRMS ↗': 'Verify on NASA FIRMS ↗', 'Verifikasi lapangan': 'Field verification', 'Cek lapangan': 'Field check',
'dalam # j # m · tepi sapuan': 'in # h # m · swath edge', 'dalam # j # m': 'in # h # m', 'dalam # m': 'in # m',
'Dihitung dari orbit satelit (TLE CelesTrak #-#-#T#:#Z UTC, model SGP#) untuk koordinat titik ini, dalam waktu HP Anda. Uji terhadap deteksi FIRMS: selisih #–# menit. Hasil di NASA FIRMS biasanya muncul ±# jam setelah satelit lewat.': 'Computed from satellite orbits (CelesTrak TLE #-#-#T#:#Z UTC, SGP# model) for this point\'s coordinates, in your phone\'s time. Tested against FIRMS detections: #–# minute difference. Results on NASA FIRMS usually appear ±# h after the pass.',
'hembusan #': 'gusts #', 'dari': 'from', 'utara': 'north', 'selatan': 'south', 'timur': 'east', 'barat': 'west', 'timur laut': 'north-east', 'barat laut': 'north-west', 'tenggara': 'south-east', 'barat daya': 'south-west',
'(#°) → asap/api cenderung bergerak ke': '(#°) → smoke/fire tends to move towards',
'Angin # m model ECMWF IFS #° (via Open-Meteo), waktu setempat, km/jam. Panah = arah angin bertiup.': 'Wind # m, ECMWF IFS #° model (via Open-Meteo), local time, km/h. Arrow = direction the wind blows to.',
'Sumber resmi NASA.': 'Official NASA source.', 'Semua titik berasal dari NASA FIRMS (Fire Information for Resource Management System): VIIRS S-NPP, NOAA-#, NOAA-# (# m) dan MODIS Terra/Aqua (# km). Setiap produk memiliki DOI resmi.': 'All hotspots come from NASA FIRMS (Fire Information for Resource Management System): VIIRS S-NPP, NOAA-#, NOAA-# (# m) and MODIS Terra/Aqua (# km). Every product has an official DOI.',
'Otomatis tiap # jam.': 'Automatic every # hours.', 'Server GitHub mengunduh file NASA, mencatat waktu unduh dan sidik SHA-# file asli (jejak audit), lalu menambah titik baru ke basis data tanpa mengubah nilai asli NASA.': 'A GitHub server downloads the NASA files, records the download time and the SHA-# fingerprint of the original file (audit trail), then adds new hotspots to the database without changing NASA\'s original values.',
'Near Real-Time lalu final.': 'Near Real-Time, then final.', 'Titik baru berstatus NRT (± # jam setelah satelit lewat). Saat NASA merilis arsip final tahunan (SP), data diganti otomatis dengan versi final.': 'New hotspots have NRT status (± # h after the pass). When NASA releases the final annual archive (SP), the data is replaced automatically with the final version.',
'Analisis lokal.': 'Local analysis.', 'Setiap titik diberi zona (Hutan Desa, desa, radius #/# km), jarak ke batas desa, petak patroli, fungsi kawasan, tutupan lahan # dan gambut.': 'Each hotspot is given a zone (Village Forest, village, #/# km radius), distance to the village boundary, patrol block, forest function, # land cover and peat.',
'Batasan.': 'Limitations.', 'Titik panas adalah anomali panas, belum tentu kebakaran; perlu cek lapangan. Awan tebal dapat menghalangi deteksi. Luas piksel bukan luas terbakar.': 'A hotspot is a thermal anomaly, not necessarily a fire; a field check is needed. Thick clouds can block detection. Pixel area is not burned area.',
'Cuaca.': 'Weather.', 'Reanalisis ECMWF ERA# (Copernicus) melalui Open-Meteo untuk koordinat desa.': 'ECMWF ERA# reanalysis (Copernicus) via Open-Meteo for the village coordinates.',
'Sumber: Copernicus Atmosphere Monitoring Service (CAMS) global, ECMWF – via Open-Meteo Air Quality API. Kategori: PM# (dihitung dari rata-rata # jam), µg/m³: Baik #–#; Sedang #–#; Tidak Sehat #–#; Sangat Tidak Sehat #–#; Berbahaya ># (rentang kategori BMKG); penjelasan kategori menurut ISPU (Permen LHK No. #/#). Model berbasis satelit & emisi kebakaran (grid ±# km), bukan alat ukur di desa; nilai sebenarnya di dekat sumber api bisa lebih tinggi.': 'Source: global Copernicus Atmosphere Monitoring Service (CAMS), ECMWF – via the Open-Meteo Air Quality API. Categories: PM# (from the #-hour mean), µg/m³: Good #–#; Moderate #–#; Unhealthy #–#; Very Unhealthy #–#; Hazardous ># (BMKG category ranges); category explanations per ISPU (MoEF Reg. No. #/#). A model based on satellites & fire emissions (grid ±# km), not a measurement in the village; actual values near fire sources may be higher.',
'Sumber: Open-Meteo Historical Weather API – reanalisis ECMWF ERA#/ERA#-Land (Copernicus Climate Change Service), titik # LU, # BT (Desa Nanga Lauk). Reanalisis = model iklim yang menggabungkan pengamatan satelit & stasiun (grid ±#–# km), bukan alat ukur di desa. Data tersedia # Januari # – # Oktober #. Normal = rata-rata tanggal yang sama tahun #–# (# tahun).': 'Source: Open-Meteo Historical Weather API – ECMWF ERA#/ERA#-Land reanalysis (Copernicus Climate Change Service), point # N, # E (Nanga Lauk village). Reanalysis = a climate model combining satellite & station observations (grid ±#–# km), not a measurement in the village. Data available # January # – # October #. Normal = mean of the same dates in #–# (# years).',
'Sumber: Open-Meteo Historical Weather API – reanalisis ECMWF ERA#/ERA#-Land (Copernicus Climate Change Service) · lokasi # LU, # BT (Desa Nanga Lauk).': 'Source: Open-Meteo Historical Weather API – ECMWF ERA#/ERA#-Land reanalysis (Copernicus Climate Change Service) · location # N, # E (Nanga Lauk village).',
'Sebaran # kemungkinan cuaca dari model ensemble ECMWF': 'Spread of # possible weather outcomes from the ECMWF ensemble model', 'peluang hujan ≥ # mm hari ini': 'chance of rain ≥ # mm today', 'hari dengan peluang hujan ≥ #%': 'days with ≥ #% chance of rain', 'mm total hujan # hari (median)': 'mm total rain, # days (median)',
'kotak = #–#% anggota · garis tebal = median · kumis = #–#% · titik = min/maks': 'box = #–#% of members · thick line = median · whiskers = #–#% · dots = min/max', 'geser ke kanan untuk hari #–# →': 'swipe right for days #–# →',
'Sumber: ECMWF IFS ENS #° (# anggota: # kontrol + # gangguan), diperbarui #× sehari, via Open-Meteo Ensemble API (CC BY #). Makin lebar kotak, makin tidak pasti prakiraannya. Nilai adalah prakiraan model grid ±# km, bukan pengukuran di tempat.': 'Source: ECMWF IFS ENS #° (# members: # control + # perturbed), updated #× a day, via the Open-Meteo Ensemble API (CC BY #). The wider the box, the more uncertain the forecast. Values are model forecasts on a ±# km grid, not on-site measurements.',
'semua': 'all',
'terburuk hari ini s.d. # hari': 'worst from today to # days', 'suhu maksimum rata-rata; tertinggi #°': 'mean maximum temperature; highest #°',
'Hutan Desa dipantau': 'Village Forests monitored', 'Cuaca saat ini': 'Current weather', '7 hari terakhir': 'last 7 days', 'Mencari lokasi Anda…': 'Finding your location…', 'Pilih Hutan Desa yang dipantau': 'Choose the Village Forest to monitor', 'Titik panas NASA terdekat': 'Nearest NASA hotspot', 'menunggu GPS': 'waiting for GPS',
'Belum dapat dimuat.': 'Could not be loaded yet.', 'Cuaca belum dapat dimuat (perlu internet).': 'Weather could not be loaded (internet needed).', 'Data titik panas sedang dimuat': 'Hotspot data is loading', 'Di luar wilayah administrasi Indonesia yang tercatat': 'Outside recorded Indonesian administrative areas',
'GPS tidak tersedia': 'GPS not available', 'Kapuas Hulu, Kalimantan Barat (lokasi bawaan)': 'Kapuas Hulu, West Kalimantan (default location)', 'Lokasi Anda': 'Your location', 'Tidak ada titik dalam 7 hari (wilayah pantauan Kapuas Hulu)': 'No hotspots in 7 days (Kapuas Hulu monitoring area)', 'izin lokasi belum diberikan': 'location permission not granted', 'lokasi terakhir': 'last location',
'Peta 3D: citra Esri World Imagery & Sentinel-2 cloudless 2025 (EOX), elevasi AWS Terrain Tiles · Cuaca: ECMWF IFS (Open-Meteo) · Udara: Copernicus CAMS · Titik panas: NASA FIRMS · Wilayah: BPS/BIG & Kepmendagri 2025. Lokasi hanya dipakai di HP ini.': '3D map: Esri World Imagery & Sentinel-2 cloudless 2025 (EOX) imagery, AWS Terrain Tiles elevation · Weather: ECMWF IFS (Open-Meteo) · Air: Copernicus CAMS · Hotspots: NASA FIRMS · Areas: BPS/BIG & Ministry of Home Affairs 2025. Location is only used on this phone.',
'Masuk': 'Sign in', 'Keluar': 'Sign out', 'Daftar': 'Register', 'Simpan': 'Save', 'Batal': 'Cancel', 'Hapus': 'Delete', 'Kirim': 'Send', 'Lanjut': 'Next', 'Ya': 'Yes', 'Tidak': 'No', 'Oke': 'OK', 'Coba lagi': 'Try again', 'Lihat': 'View', 'Bagikan': 'Share', 'Salin': 'Copy', 'Tersalin': 'Copied', 'Selesai': 'Done',
'Kirim kode': 'Send code', 'Kirim ulang kode': 'Resend code', 'Kode verifikasi': 'Verification code', 'Lupa kata sandi?': 'Forgot password?', 'Masuk ke akun': 'Sign in to your account', 'Email': 'Email', 'Nomor HP': 'Phone number', 'Nama': 'Name', 'Alamat': 'Address', 'Umur': 'Age',
'Titik panas': 'Hotspots', 'titik panas': 'hotspots', 'titik': 'hotspots', 'Status': 'Status', 'Hutan': 'Forest', 'Kehilangan': 'Loss', 'Tersisa': 'Remaining', 'Emisi': 'Emissions', 'Serapan': 'Removals', 'Karbon': 'Carbon', 'Tahun': 'Year', 'Bulan': 'Month', 'Minggu ini': 'This week',
'Peta': 'Map', 'Grafik': 'Chart', 'Tabel': 'Table', 'Ringkasan': 'Summary', 'Unduh PDF': 'Download PDF', 'Unduh Word': 'Download Word', 'Unduh CSV': 'Download CSV', 'Memuat data…': 'Loading data…', 'Tidak ada data': 'No data', 'Tidak ada titik': 'No hotspots',
'Bara Api': 'Bara Api', 'Asisten AI · perhutanan sosial, regulasi, satwa': 'AI assistant · social forestry, regulations, wildlife', 'Peringatan dini': 'Early warning', "Ringkasan": "Summary", "Alat": "Tools", "Analisis data": "Data analysis", "Status 7 hari": "7-day status", "Bahaya kebakaran": "Fire danger", "PM# · µg/m³": "PM# · µg/m³", "Peringatan": "Alerts", "Analisis SHP": "SHP analysis", "Tutupan hutan": "Forest cover", "Peta luring": "Offline map", "Pusat kendali & analisis": "Control centre & analysis", "Selengkapnya ›": "More ›", "Ringkas ‹": "Less ‹", "Sentinel-# # · # m": "Sentinel-# # · # m", "Titik panas ≤# km": "Hotspots ≤# km", "Pemantauan": "Monitoring", "Cuaca & iklim": "Weather & climate", "Hutan & karbon": "Forest & carbon", "Lapangan & data": "Field & data", "Peta": "Map", "Sebaran titik": "Hotspot spread", "Lintasan satelit": "Satellite passes", "Cuaca & musim api": "Weather & fire season", "Cuaca lokasi saya": "My location weather", "Bekas terbakar": "Burned areas", "Analisis lahan & karbon": "Land & carbon analysis", "Grafik & rekap": "Charts & summary", "Laporan patroli": "Patrol reports", "Laporan PDF": "PDF report", "Status sistem": "System status", "Profil": "Profile", "Akun & pengaturan": "Account & settings", "Notifikasi HP & email": "Phone & email notifications", "CSV · SHP · GeoJSON · KML": "CSV · SHP · GeoJSON · KML", "Temuan & cek lapangan": "Findings & field checks", "Tanpa sinyal": "No signal", "Pembaruan · basis data · sumber NASA": "Updates · database · NASA sources", "Dasbor pemantauan": "Monitoring dashboard", "Memuat data…": "Loading data…", "angin maks # km/jam": "max wind # km/h", "hujan # mm": "rain # mm", 'Kejadian api': 'Fire events', 'Peringatan dini': 'Early warning', 'Cek lapangan': 'Field check', 'Tutupan hutan': 'Forest cover', 'Bahasa': 'Language', 'Bahasa · Language': 'Bahasa · Language',
"Ambil foto": "Take photo",
"Api aktif": "Active fire",
"Bekas terbakar baru": "New burn scar",
"Belum ada laporan.": "No reports yet.",
"Bukan kebakaran (sumber panas lain)": "Not a fire (other heat source)",
"Catatan": "Notes",
"Dilaporkan ke Manggala Agni / MPA / BPBD": "Reported to Manggala Agni / MPA / BPBD",
"Dipadamkan tim": "Extinguished by the team",
"Dipantau": "Monitored",
"Foto (maks. #)": "Photos (max. #)",
"GPS tidak tersedia – aktifkan lokasi agar posisi pelapor tercatat.": "GPS not available – turn on location so the reporter position is recorded.",
"GPS not available – aktifkan lokasi agar posisi pelapor tercatat.": "GPS not available – turn on location so the reporter position is recorded.",
"Hasil cek lapangan": "Field check result",
"Jarak ke titik:": "Distance to hotspot:",
"Ladang / kebun": "Field / garden",
"Lahan gambut": "Peatland",
"Menunggu sinyal": "Waiting for signal",
"Menyimpan…": "Saving…",
"Merambat dari luar": "Spread from outside",
"Pembakaran sampah / kebun": "Burning rubbish / garden waste",
"Pembukaan lahan / ladang": "Land / field clearing",
"Penyebab dugaan": "Suspected cause",
"Perkiraan luas terbakar (ha)": "Estimated burned area (ha)",
"Permukiman / industri": "Settlement / industry",
"Semak / belukar": "Shrub / bush",
"Simpan & kirim laporan": "Save & send report",
"Temuan kebakaran baru": "New fire finding",
"Temuan kebakaran": "Fire finding",
"Terkirim ✓": "Sent ✓",
"Tersimpan di HP": "Saved on phone",
"Tersimpan ✓": "Saved ✓",
"Tidak ada tindakan": "No action",
"Tidak dapat dijangkau": "Not reachable",
"Tidak diketahui": "Unknown",
"Tidak ditemukan tanda api": "No sign of fire found",
"Tidak sengaja (puntung, api unggun)": "Accidental (cigarette butt, campfire)",
"Tindakan": "Action",
"Tutupan lahan di lokasi": "Land cover at the location",
"Waktu cek": "Check time",
"Untuk api/bekas terbakar yang Anda temukan di lapangan tetapi tidak ada titik satelitnya. Lokasi = GPS Anda.": "For fires/burn scars you find in the field that have no satellite hotspot. Location = your GPS.",
"Laporan verifikasi · tersimpan di HP dulu": "Verification reports · saved on the phone first",
"Kondisi api, arah menjalar, siapa yang ditemui, dll.": "Fire condition, direction of spread, who you met, etc.",
"Laporan disimpan dulu di HP ini, lalu terkirim otomatis ke basis data PRCF (Google Sheets) begitu ada sinyal. Nama & email Anda dari akun aplikasi ikut tercatat sebagai pelapor. Foto diperkecil agar hemat kuota.": "Reports are saved on this phone first, then sent automatically to the PRCF database (Google Sheets) as soon as there is signal. Your name & email from the app account are recorded as the reporter. Photos are reduced to save data.",
"Laporan saya di HP ini": "My reports on this phone",
"Unduhan dimulai (file siap pakai dari server).": "Download started (ready-made file from the server).",
"Unduhan dimulai.": "Download started.",
"saat ini": "now",
"Kehilangan tutupan pohon (GFW/UMD)": "Tree cover loss (GFW/UMD)",
"Peringatan perubahan hutan": "Forest change alerts",
"🛰 Esri resolusi tinggi": "🛰 Esri high resolution",
"terburuk hari ini to # hari": "worst from today to # days",
"Ladang": "Field",
"Kebun": "Garden",
"Gambut": "Peat",
"Semak": "Shrub",
"Matahari terbit tanpa pamrih. Mari mulai hari ini dengan hati yang sama tulusnya.": "The sun rises asking nothing in return. Let's start today with a heart just as sincere.",
"Udara pagi ini adalah hadiah dari hutan. Hirup, syukuri, lalu jaga.": "This morning's air is a gift from the forest. Breathe it in, be grateful, then protect it.",
"Setiap pagi, alam memberi kesempatan baru. Gunakan untuk berbuat baik, sekecil apa pun.": "Every morning nature gives a new chance. Use it to do good, however small.",
"Embun tak pernah memilih daun. Begitulah ketulusan: hadir untuk semua.": "Dew never chooses which leaf to rest on. That is sincerity: there for everyone.",
"Hutan yang lestari dimulai dari niat baik yang dijaga setiap pagi.": "A lasting forest begins with good intentions kept every morning.",
"Bersyukurlah: masih ada burung yang bernyanyi dan pohon yang meneduhkan.": "Be grateful: there are still birds singing and trees giving shade.",
"Langkah kecil hari ini adalah warisan besar untuk anak cucu.": "Today's small steps are a great legacy for our grandchildren.",
"Pagi yang cerah adalah titipan. Jaga hutan agar langit tetap biru.": "A bright morning is something entrusted to us. Protect the forest so the sky stays blue.",
"Mulailah hari dengan syukur. Alam sudah lebih dulu memberi tanpa diminta.": "Start the day with gratitude. Nature has already given without being asked.",
"Kerja yang tulus tak selalu terlihat, tapi selalu tumbuh, seperti akar pohon.": "Sincere work is not always seen, but it always grows, like a tree's roots.",
"Di tengah lelah, ingat: setiap usaha menjaga alam tak pernah sia-sia.": "When you are tired, remember: every effort to protect nature is never wasted.",
"Pohon tetap memberi teduh, meski tak pernah diucapkan terima kasih.": "Trees keep giving shade, even though no one ever thanks them.",
"Terik siang mengingatkan kita: hutan adalah payung bagi kehidupan.": "The midday heat reminds us: the forest is an umbrella for life.",
"Rehatlah sejenak. Seperti sungai, kita tetap mengalir walau perlahan.": "Rest for a moment. Like a river, we keep flowing, even if slowly.",
"Satu api yang dicegah hari ini menyelamatkan ribuan kehidupan esok.": "One fire prevented today saves thousands of lives tomorrow.",
"Teruslah melangkah. Alam menghargai mereka yang setia menjaganya.": "Keep going. Nature honours those who faithfully protect it.",
"Syukuri air yang mengalir dan udara yang bersih. Itu kerja hutan setiap saat.": "Be grateful for flowing water and clean air. That is the forest at work every moment.",
"Kebaikan kecil di tengah hari bisa meneduhkan hati banyak orang.": "A small kindness in the middle of the day can bring shade to many hearts.",
"Jaga semangatmu seperti menjaga bara: jangan dibiarkan padam, jangan dibiarkan liar.": "Tend your spirit like an ember: never let it go out, never let it run wild.",
"Hasil terbaik tumbuh dari kesabaran, sama seperti hutan yang tumbuh puluhan tahun.": "The best results grow from patience, just like a forest that grows for decades.",
"Senja datang tanpa tergesa. Hargai setiap proses, termasuk dirimu hari ini.": "Dusk arrives without hurry. Value every process, including yourself today.",
"Terima kasih untuk hari ini. Alam dan sesama sudah memberi banyak hal.": "Thank you for today. Nature and those around you have given so much.",
"Sore yang tenang adalah tanda: kerja baikmu sudah cukup untuk hari ini.": "A calm afternoon is a sign: your good work is enough for today.",
"Seperti burung pulang ke sarang, kembalilah dengan hati yang penuh syukur.": "Like birds returning to the nest, come home with a heart full of gratitude.",
"Hutan tak pernah menghitung jasanya. Belajarlah memberi dengan tulus.": "The forest never counts its favours. Learn to give sincerely.",
"Langit jingga sore ini indah karena ada yang menjaga udara tetap bersih.": "This evening's orange sky is beautiful because someone keeps the air clean.",
"Apa pun hasil hari ini, niat baikmu tetap berarti bagi bumi.": "Whatever today's results, your good intentions still matter to the Earth.",
"Bersyukurlah atas tangan yang bekerja dan alam yang menopang.": "Be grateful for the hands that work and the nature that sustains us.",
"Setiap pohon yang tetap berdiri adalah cerita tentang orang-orang yang peduli.": "Every tree still standing is a story about people who care.",
"Lepaskan lelah bersama angin sore. Esok alam masih menunggumu.": "Let your tiredness go with the evening breeze. Tomorrow nature will still be waiting for you.",
"Istirahatlah. Hutan pun tetap tumbuh dalam diam, begitu juga dirimu.": "Rest now. Even the forest keeps growing in silence, and so do you.",
"Malam yang sejuk adalah napas hutan. Syukuri dan jaga ia untuk esok.": "The cool night is the forest's breath. Be grateful and protect it for tomorrow.",
"Tidurlah dengan tenang: kebaikan yang kamu tanam hari ini sedang bertumbuh.": "Sleep peacefully: the kindness you planted today is growing.",
"Bintang terlihat jelas di langit yang bersih. Itulah hadiah alam yang terjaga.": "Stars shine clearly in a clean sky. That is the gift of nature well protected.",
"Terima kasih telah peduli hari ini. Bumi merasakan ketulusanmu.": "Thank you for caring today. The Earth feels your sincerity.",
"Dalam gelap, kunang-kunang tetap bercahaya. Jadilah terang sekecil apa pun.": "In the dark, fireflies still glow. Be a light, however small.",
"Hening malam mengajarkan syukur: hidup ini titipan yang perlu dijaga.": "The quiet night teaches gratitude: this life is entrusted to us and must be cared for.",
"Esok adalah kesempatan baru untuk mencintai alam dan sesama.": "Tomorrow is a new chance to love nature and one another.",
"Hati yang bersyukur akan selalu menemukan alasan untuk tetap peduli.": "A grateful heart will always find a reason to keep caring.",
"Malam ini, doakan hutan tetap hijau dan semua yang menjaganya diberi kekuatan.": "Tonight, pray that the forest stays green and that all who protect it are given strength."
};
const RX = [   // pola dengan nama tempat/teks dinamis
  [/^Status (.+)$/, m => 'Status ' + m[1]],
  [/^(Selamat (?:pagi|siang|sore|malam))(.*)$/, m => D[m[1]] + m[2]],
  [/^Simpan peta & data (.+) \((.+)\)$/, m => 'Save map & data for ' + m[1] + ' (' + m[2] + ')'],
  [/^Riwayat cuaca · (.+)$/, m => 'Weather history · ' + m[1]],
  [/^Prakiraan resmi BMKG · (.+)$/, m => 'Official BMKG forecast · ' + m[1]],
  [/^Curah hujan (ERA\d) · (.+)$/, m => m[1] + ' rainfall · ' + m[2]],
  [/^Titik panas (VIIRS|MODIS)(.*)$/, m => m[1] + m[2] + ' hotspot'],
  [/^Indikasi luas bekas terbakar ≤ (\S+) km dari (.+) · musim api sejak (\d+)$/, m => 'Indicated burned area ≤ ' + m[1] + ' km from ' + m[2] + ' · fire seasons since ' + m[3]],
  [/^(\S+) km dari Desa (.+)$/, m => m[1] + ' km from ' + m[2] + ' village'],
  [/^Rendah: (.+)$/, m => 'Low: ' + m[1]], [/^Sedang: (.+)$/, m => 'Moderate: ' + m[1]], [/^Tinggi: (.+)$/, m => 'High: ' + m[1]], [/^Ekstrem: (.+)$/, m => 'Extreme: ' + m[1]],
  [/^(BMKG|ECMWF): (.+)$/, m => m[1] + ': ' + (D[m[2]] || m[2])],
  [/^Desa (.+), Kec\. (.+), Kab\. (.+), Prov\. (.+)$/, m => m[1] + ' village, ' + m[2] + ' district, ' + m[3] + ' regency, ' + m[4] + ' province'],
  [/^Masuk sebagai (.+)$/, m => 'Signed in as ' + m[1]],
  [/^direkam (.+)$/, m => 'captured ' + tanggal(m[1])],
];
const HARI = { Senin: 'Monday', Selasa: 'Tuesday', Rabu: 'Wednesday', Kamis: 'Thursday', Jumat: 'Friday', "Jum'at": 'Friday', Sabtu: 'Saturday', Minggu: 'Sunday' };
const HR = { Sen: 'Mon', Sel: 'Tue', Rab: 'Wed', Kam: 'Thu', Jum: 'Fri', Sab: 'Sat', Min: 'Sun' };
const BLN = { Januari: 'January', Februari: 'February', Maret: 'March', April: 'April', Mei: 'May', Juni: 'June', Juli: 'July', Agustus: 'August', September: 'September', Oktober: 'October', November: 'November', Desember: 'December' };
const BL = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', Mei: 'May', Jun: 'Jun', Jul: 'Jul', Agu: 'Aug', Agt: 'Aug', Sep: 'Sep', Okt: 'Oct', Nov: 'Nov', Des: 'Dec' };
function tanggal(s) {   // nama hari/bulan yang menempel pada angka
  let o = s.replace(new RegExp('\\b(' + Object.keys(HARI).join('|') + ')\\b(?=,?\\s)', 'g'), w => HARI[w]);
  o = o.replace(new RegExp('\\b(' + Object.keys(HR).join('|') + ')\\b(?=,?\\s+\\d)', 'g'), w => HR[w]);
  o = o.replace(new RegExp('(\\d\\s+)(' + Object.keys(BLN).join('|') + ')\\b', 'g'), (a, d, w) => d + BLN[w]).replace(new RegExp('\\b(' + Object.keys(BLN).join('|') + ')(?=\\s+\\d{4})', 'g'), w => BLN[w]);
  o = o.replace(new RegExp('(\\d\\s+)(' + Object.keys(BL).join('|') + ')\\b', 'g'), (a, d, w) => d + BL[w]);
  return o.replace(/\bs\.d\.\s/g, 'to ').replace(/\bpukul\b/g, 'at');
}
const NUM = /\d+(?:[.,]\d+)*/g;
function isi(tpl, nums) { if (/\{\d\}/.test(tpl)) return tpl.replace(/\{(\d)\}/g, (a, i) => nums[i - 1] ?? ''); let k = 0; return tpl.replace(/#/g, () => nums[k++] ?? '#'); }
function satu(s, dalam) {
  if (D[s] != null) return D[s];
  const nums = s.match(NUM) || [], key = s.replace(NUM, '#');
  if (nums.length && D[key] != null && /#|\{\d\}/.test(D[key])) return isi(D[key], nums);
  for (const [re, f] of RX) { const m = s.match(re); if (m) return f(m); }
  if (dalam) return null;
  const tg = tanggal(s);
  if (tg !== s) { const r = satu(tg, true); if (r != null) return r; }
  const lead = s.match(/^([·•\-–]\s)(.+)$/); if (lead) { const r = satu(lead[2]); return lead[1] + (r ?? lead[2]); }
  const p = s.match(/^(.*?)\s*\(([^()]+)\)$/); if (p && p[1]) { const a = satu(p[1]), b = satu(p[2]); if (a != null || b != null) return (a ?? tanggal(p[1])) + ' (' + (b ?? tanggal(p[2])) + ')'; }
  const c = s.match(/^(.+?): (.+)$/); if (c) { const a = D[c[1] + ':'] ? D[c[1] + ':'].replace(/:$/, '') : satu(c[1], true), b = satu(c[2]); if (a != null) return a + ': ' + (b ?? c[2]); }
  if (s.includes('; ')) { const parts = s.split('; '), tr = parts.map(x => satu(x)); if (tr.some(x => x != null)) return parts.map((x, i) => tr[i] ?? x).join('; '); }
  return tg !== s ? tg : null;
}
function t(s) {
  if (L !== 'en' || s == null) return s;
  const str = String(s), m = str.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2].replace(/\s+/g, ' ');
  if (!core || !/[A-Za-z]{2}/.test(core)) return str;
  let r = D[core] ?? satu(core, true);
  if (r == null && core.includes(' · ')) { const parts = core.split(' · '); const tr = parts.map(x => satu(x)); if (tr.some(x => x != null)) r = parts.map((x, i) => tr[i] ?? x).join(' · '); }
  if (r == null) r = satu(core);
  if (r == null && core.includes(' – ')) { const parts = core.split(' – '); const tr = parts.map(x => satu(x)); if (tr.some(x => x != null)) r = parts.map((x, i) => tr[i] ?? x).join(' – '); }
  return r == null ? str : m[1] + r + m[3];
}
/* ---------- menerapkan ke layar ---------- */
const SKIP = 'script,style,textarea,code,pre,[data-notr],.leaflet-control-attribution,.maplibregl-ctrl-attrib', SKIPA = 'script,style,[data-notr]';
const ATR = ['placeholder', 'aria-label', 'title', 'data-title', 'data-sub'];
let busy = false;
function node(n) {
  if (n.nodeType === 3) { const p = n.parentElement; if (!p || p.closest(SKIP)) return; const v = t(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
  if (n.nodeType !== 1 || n.closest(SKIPA)) return;
  ATR.forEach(a => { if (n.hasAttribute(a)) { const v = n.getAttribute(a), w = t(v); if (w !== v) n.setAttribute(a, w); } });
  if (n.tagName === 'INPUT' && /^(button|submit)$/.test(n.type) && n.value) { const w = t(n.value); if (w !== n.value) n.value = w; }
  const tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let x; while ((x = tw.nextNode())) {
    if (x.nodeType === 1) { if (x.closest(SKIPA)) continue; ATR.forEach(a => { if (x.hasAttribute(a)) { const v = x.getAttribute(a), w = t(v); if (w !== v) x.setAttribute(a, w); } }); continue; }
    const p = x.parentElement; if (!p || p.closest(SKIP)) continue; const v = t(x.nodeValue); if (v !== x.nodeValue) x.nodeValue = v;
  }
}
function mulai() {
  if (L !== 'en') return;
  node(document.body); document.title = t(document.title);
  new MutationObserver(ms => { if (busy) return; busy = true; try { for (const m of ms) { if (m.type === 'characterData') node(m.target); else if (m.type === 'attributes') node(m.target); else m.addedNodes.forEach(node); } } finally { busy = false; } })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATR });
}
function picker(el) {
  if (!el) return;
  el.innerHTML = `<div class="seg" data-notr style="display:flex;gap:6px;flex-wrap:wrap"><button class="chip" data-l="id" aria-pressed="${L === 'id'}">🇮🇩 Bahasa Indonesia</button><button class="chip" data-l="en" aria-pressed="${L === 'en'}">🇬🇧 English</button></div>
    <p data-notr style="margin:8px 2px 0;font-size:11.5px;line-height:1.45;color:var(--muted,#6b766f)">${L === 'en' ? 'Official names and source data stay in their original language.' : 'Nama resmi dan data sumber tetap dalam bahasa aslinya.'}</p>`;
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => set(b.dataset.l));
}
function set(l) { l = l === 'en' ? 'en' : 'id'; try { localStorage.setItem(KEY, l); } catch (e) { } if (l !== L) location.reload(); }
window.FHLang = { get: () => L, set, t, picker, kamus: D };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();
})();
