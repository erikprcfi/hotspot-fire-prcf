/* Pantau Rimbak – alat tambahan untuk wilayah SHP pengguna (FHWilAlat)
 *  - Laporan wilayah PDF (dibuat di HP): status terkini, titik panas bulan pilihan, cuaca bulan itu, riwayat tahunan, rekap musim, area terbakar MODIS
 *  - Riwayat titik panas per tahun (arsip NASA FIRMS 2016– + tahun berjalan) & pola bulanan
 *  - Ekspor data wilayah: GeoJSON (QGIS), KML (Google Earth), GPX (GPS lapangan), CSV
 *  - Peta luring wilayah (citra Sentinel-2 cloudless EOX, zoom 8–14) lewat FHLuring
 *  - Perbandingan wilayah dalam ruang kerja (status 7 hari, Indeks Siaga, banjir, asap, vegetasi, musim api)
 * Semua data berasal dari paket analisis otomatis wilayah (assets/wilayah_umum.js; scripts/wilayah_umum.py) – sumber resmi yang sama dengan Hutan Desa.
 */
(function () {
'use strict';
const EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => (v == null || !isFinite(+v)) ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d });
const BLN = () => EN() ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLNP = () => EN() ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const toast = t => (window.toastMsg || (x => alert(x)))(t);
const W = () => window.FHWilSaya;
const P = () => (W() && W().aktif() ? W().paket() : null);
const slug = s => String(s || 'wilayah').normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'wilayah';
const kini = () => new Date(Date.now() + 7 * 3600e3);   // WIB
function dl(blob, nama) { if (window.FHAlat && FHAlat.dl) return FHAlat.dl(blob, nama); const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nama; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 2500); }
function css() {
  if (document.getElementById('wa-css')) return; const s = document.createElement('style'); s.id = 'wa-css';
  s.textContent = '.wa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.wa-it{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px 14px;border-radius:14px;border:1px solid var(--line,#e5e7eb);background:var(--surface,#fff);font:inherit;color:inherit;cursor:pointer}.wa-it b{font-size:14px}.wa-it small{color:var(--muted,#667);font-size:12px;line-height:1.35}' +
    '.wa-tb{width:100%;border-collapse:collapse;font-size:12.5px}.wa-tb th,.wa-tb td{padding:6px 5px;border-top:1px solid var(--line,#e5e7eb);text-align:right;vertical-align:top}.wa-tb th:first-child,.wa-tb td:first-child{text-align:left}.wa-tb th{font-size:11.5px;color:var(--muted,#667)}.wa-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
    '.wa-svg{width:100%;height:auto;display:block}.wa-svg text{font:10px system-ui,sans-serif;fill:var(--muted,#667)}.wa-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.wa-btns .btn{padding:9px 14px}.wa-tag{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11.5px;font-weight:800;color:#fff}' +
    '.wa-sel{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line,#ddd);font:inherit;background:var(--surface,#fff);color:inherit;margin:6px 0}';
  document.head.appendChild(s);
}
const halaman = (judul, sub, html, after) => { css(); openPage(judul, sub, `<div class="fa">${html}</div>`, after); };
const kartu = (h, isi) => `<div class="fa-card"><h4 style="margin:0 0 8px">${h}</h4>${isi}</div>`;
const WARNA = { Aman: '#16A34A', Waspada: '#CA8A04', Siaga: '#EA580C', Awas: '#DC2626', Normal: '#16A34A' };
const tag = l => l ? `<span class="wa-tag" style="background:${WARNA[l] || '#64748B'}">${esc(l)}</span>` : '–';
const perlu = () => { const p = P(); if (!p || !p.site) { toast(I('Buka wilayah Anda dulu di "Wilayah & tim".', 'Open your area first in "Areas & team".')); return null; } return p; };
const pakai = k => { try { window.FHAlat && FHAlat.pakai(k); } catch (e) { } };

/* ---------- menu ---------- */
function menu() {
  const p = perlu(); if (!p) return;
  const L = (W().daftar() || []);
  openSheet(`<h3>${I('Laporan & data wilayah', 'Area reports & data')}</h3><p class="sub">${esc(p.site.hd_nama)}</p>
    <div class="wa-grid" id="waM">
      <button class="wa-it tap" data-k="profil"><b>🧭 ${I('Profil lahan wilayah', 'Area land profile')}</b><small>${I('Gambut & analisis lahan nasional', 'Peat & national land analyses')}</small></button>
      <button class="wa-it tap" data-k="hutan"><b>🌳 ${I('Perubahan hutan', 'Forest change')}</b><small>${I('Indikasi bukaan baru · Sentinel-2 mingguan', 'New clearing indications · weekly Sentinel-2')}</small></button>
      <button class="wa-it tap" data-k="bekas"><b>🔥 ${I('Bekas terbakar 20 m', 'Burned area 20 m')}</b><small>${I('Luas per musim api · Sentinel-2', 'Area per fire season · Sentinel-2')}</small></button>
      <button class="wa-it tap" data-k="laporan"><b>📄 ${I('Laporan PDF', 'PDF report')}</b><small>${I('Bulanan + rekap musim api, siap cetak', 'Monthly + fire-season recap, print-ready')}</small></button>
      <button class="wa-it tap" data-k="riwayat"><b>📊 ${I('Riwayat titik panas', 'Hotspot history')}</b><small>${I('Per tahun sejak 2016 & pola bulanan', 'Per year since 2016 & monthly pattern')}</small></button>
      <button class="wa-it tap" data-k="ekspor"><b>⬇️ ${I('Ekspor data', 'Export data')}</b><small>KML · GeoJSON · GPX · CSV</small></button>
      <button class="wa-it tap" data-k="luring"><b>📴 ${I('Peta luring', 'Offline map')}</b><small>${I('Simpan citra wilayah untuk lapangan tanpa sinyal', 'Save area imagery for no-signal fieldwork')}</small></button>
      <button class="wa-it tap" data-k="banding"><b>⚖️ ${I('Bandingkan wilayah', 'Compare areas')}</b><small>${L.length > 1 ? I(`${L.length} wilayah di daftar Anda`, `${L.length} areas in your list`) : I('Perlu ≥ 2 wilayah / ruang kerja', 'Needs ≥ 2 areas / workspaces')}</small></button>
    </div><p class="muted" style="font-size:12px;margin-top:12px">${I('Ringkasan mingguan dikirim tiap Senin pagi ke email pelanggan peringatan wilayah ini (Profil → Peringatan, aktifkan email).', 'A weekly summary is emailed every Monday morning to this area’s alert subscribers (Profile → Alerts, enable email).')}</p>`);
  document.querySelectorAll('#waM [data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; try { history.back(); } catch (e) { } setTimeout(() => API[k](), 320); });
}

/* ---------- riwayat titik panas ---------- */
function grafikTahun(R) {
  const th = Object.keys(R).sort(), mx = Math.max(1, ...th.map(y => R[y].r25)), w = 340, h = 170, x0 = 42, y0 = 12, bw = (w - x0 - 6) / th.length;
  const yy = v => y0 + (h - y0 - 22) * (1 - v / mx);
  let s = `<svg class="wa-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${I('Titik panas per tahun', 'Hotspots per year')}">`;
  [0, .5, 1].forEach(f => { const v = Math.round(mx * f); s += `<line x1="${x0}" x2="${w - 4}" y1="${yy(v)}" y2="${yy(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="${x0 - 4}" y="${yy(v) + 3}" text-anchor="end">${nf(v)}</text>`; });
  th.forEach((y, i) => { const r = R[y], x = x0 + i * bw + 2, ww = Math.max(2, bw - 4);
    [['r25', '#FDBA74'], ['r5', '#F97316'], ['hd', '#B91C1C']].forEach(([k, c]) => { const v = r[k]; if (v > 0) s += `<rect x="${x}" y="${yy(v)}" width="${ww}" height="${h - 22 - yy(v)}" fill="${c}" rx="1.5"><title>${y}: ${nf(v)}</title></rect>`; });
    if (th.length <= 12 || i % 2 === 0) s += `<text x="${x + ww / 2}" y="${h - 8}" text-anchor="middle">${String(y).slice(2)}</text>`; });
  return s + '</svg>';
}
function riwayat() {
  const p = perlu(); if (!p) return; pakai('wriwayat');
  const R = p.riwayat || {}, th = Object.keys(R).sort();
  if (!th.length) return halaman(I('Riwayat titik panas', 'Hotspot history'), p.site.hd_nama, kartu(I('Belum tersedia', 'Not available yet'), `<p>${I('Riwayat per tahun dihitung pada putaran analisis otomatis berikutnya (± 3 jam).', 'The yearly history is computed in the next automatic analysis run (about 3 hours).')}</p>`));
  const ty = String(kini().getUTCFullYear()), lengkap = th.filter(y => y !== ty), rata = lengkap.length ? lengkap.reduce((a, y) => a + R[y].r25, 0) / lengkap.length : 0;
  const puncak = lengkap.slice().sort((a, b) => R[b].r25 - R[a].r25)[0];
  const tabel = `<div class="wa-wrap"><table class="wa-tb"><tr><th>${I('Tahun', 'Year')}</th><th>${I('Di dalam', 'Inside')}</th><th>≤ 5 km</th><th>≤ 25 km</th></tr>${th.slice().reverse().map(y => `<tr${y === ty ? ' style="font-weight:700"' : ''}><td>${y}${y === ty ? ' *' : ''}</td><td>${nf(R[y].hd)}</td><td>${nf(R[y].r5)}</td><td>${nf(R[y].r25)}</td></tr>`).join('')}</table></div><p class="fa-note">* ${I('tahun berjalan, sampai hari ini', 'current year, to date')}</p>`;
  halaman(I('Riwayat titik panas', 'Hotspot history'), p.site.hd_nama,
    kartu(I('Per tahun', 'Per year'), `<p class="fa-note">${I(`Rata-rata ${nf(rata)} deteksi/tahun dalam 25 km` + (puncak ? `; tertinggi ${puncak} (${nf(R[puncak].r25)}).` : '.'), `Average ${nf(rata)} detections/year within 25 km` + (puncak ? `; highest ${puncak} (${nf(R[puncak].r25)}).` : '.'))}</p>${grafikTahun(R)}
      <p class="fa-note"><span style="color:#B91C1C">■</span> ${I('di dalam wilayah', 'inside the area')} · <span style="color:#F97316">■</span> ≤ 5 km · <span style="color:#FDBA74">■</span> ≤ 25 km ${I('dari batas', 'of the boundary')}</p>`) +
    kartu(I('Pola bulanan', 'Monthly pattern'), `<select class="wa-sel" id="waY">${th.slice().reverse().map(y => `<option${y === (th.slice().reverse().find(k => R[k].r25 > 0) || ty) ? ' selected' : ''}>${y}</option>`).join('')}</select><div id="waB"></div>`) +
    kartu(I('Tabel', 'Table'), tabel) +
    `<p class="fa-note">${I('Sumber: NASA FIRMS (VIIRS S-NPP/NOAA-20/NOAA-21 & MODIS), arsip 2016– dan data hampir waktu nyata tahun berjalan. Satu kebakaran dapat terdeteksi beberapa kali; angka adalah jumlah deteksi, bukan luas terbakar.', 'Source: NASA FIRMS (VIIRS S-NPP/NOAA-20/NOAA-21 & MODIS), 2016– archive and near-real-time data for the current year. One fire can be detected several times; figures are detections, not burned area.')}</p>`,
    () => { const sel = document.getElementById('waY'), B = document.getElementById('waB');
      const gambar = () => { const b = (R[sel.value] || {}).bulan || [], mx = Math.max(1, ...b); if (!b.some(v => v > 0)) { B.innerHTML = `<p class="fa-note">${I(`Tidak ada deteksi titik panas dalam 25 km pada ${sel.value}.`, `No hotspot detections within 25 km in ${sel.value}.`)}</p>`; return; }
        B.innerHTML = `<svg class="wa-svg" viewBox="0 0 340 120">${b.map((v, i) => { const hh = 84 * v / mx, x = 8 + i * 27.5; return `<rect x="${x}" y="${94 - hh}" width="22" height="${hh}" rx="2" fill="#F97316"><title>${BLN()[i]}: ${v}</title></rect><text x="${x + 11}" y="${90 - hh}" text-anchor="middle">${v || ''}</text><text x="${x + 11}" y="110" text-anchor="middle">${BLN()[i]}</text>`; }).join('')}</svg><p class="fa-note">${I('Deteksi ≤ 25 km dari batas wilayah per bulan', 'Detections ≤ 25 km of the boundary per month')}</p>`; };
      sel.onchange = gambar; gambar(); });
}

/* ---------- ekspor ---------- */
const xml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
function kmlGeom(g) {
  const ring = r => `<LinearRing><coordinates>${r.map(c => c[0] + ',' + c[1]).join(' ')}</coordinates></LinearRing>`;
  const poly = P => `<Polygon><outerBoundaryIs>${ring(P[0])}</outerBoundaryIs>${P.slice(1).map(r => `<innerBoundaryIs>${ring(r)}</innerBoundaryIs>`).join('')}</Polygon>`;
  if (!g) return ''; if (g.type === 'Point') return `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>`;
  if (g.type === 'Polygon') return poly(g.coordinates); if (g.type === 'MultiPolygon') return `<MultiGeometry>${g.coordinates.map(poly).join('')}</MultiGeometry>`;
  if (g.type === 'GeometryCollection') return `<MultiGeometry>${g.geometries.map(kmlGeom).join('')}</MultiGeometry>`; return '';
}
function kml(nama, fc, warna) {
  const st = `<Style id="s"><LineStyle><color>ff${warna}</color><width>2</width></LineStyle><PolyStyle><color>40${warna}</color></PolyStyle><IconStyle><color>ff${warna}</color><scale>0.8</scale></IconStyle></Style>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(nama)}</name>${st}${(fc.features || []).map(f => `<Placemark><name>${xml(f.properties && (f.properties.nama || f.properties.tanggal || f.properties.peringkat || ''))}</name><styleUrl>#s</styleUrl><ExtendedData>${Object.entries(f.properties || {}).filter(([, v]) => v == null || typeof v !== 'object').map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join('')}</ExtendedData>${kmlGeom(f.geometry)}</Placemark>`).join('')}</Document></kml>`;
}
function gpx(nama, pts) { return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Pantau Rimbak" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(nama)}</name></metadata>${pts.map(p => `<wpt lat="${p.lat}" lon="${p.lon}"><name>${xml(p.nama)}</name><desc>${xml(p.ket || '')}</desc></wpt>`).join('')}</gpx>`; }
function csvTeks(rows) { return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); }
function batasFC(p) { const g = p.site.hd; const fc = g && g.type === 'FeatureCollection' ? g : { type: 'FeatureCollection', features: [g && g.type === 'Feature' ? g : { type: 'Feature', geometry: g, properties: {} }] };
  return { type: 'FeatureCollection', features: fc.features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: { nama: p.site.hd_nama, luas_ha: Math.round(p.site.luas_ha || 0) } })) }; }
function titikFC(p) {
  const T = p.titik_kini || (p.hotspots && p.hotspots.titik) || [];
  return { type: 'FeatureCollection', features: T.map(t => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lo, t.la] }, properties: { tanggal: t.d, jam_utc: String(t.t).slice(0, 2) + ':' + String(t.t).slice(2, 4), satelit: t.sat || '', keyakinan: t.c || '', frp_mw: t.frp ?? '', jarak_km: (t.ls || [null])[0] <= 0 ? 0 : (t.ls || [null])[0] } })) };
}
function rawanFC(p) { const R = p.rawan || { features: [] }; return { type: 'FeatureCollection', features: (R.features || []).map(f => ({ type: 'Feature', geometry: f.geometry, properties: Object.assign({}, f.properties, { tahun: (f.properties.tahun || []).join(' '), lokasi: /Hutan Desa|desa/.test(f.properties.lokasi || '') ? 'di dalam wilayah' : f.properties.lokasi, pusat: undefined }) })) }; }
function ekspor() {
  const p = perlu(); if (!p) return; pakai('wekspor');
  const T = titikFC(p), R = rawanFC(p), BM = p.bekas_modis_geo && p.bekas_modis_geo.features ? p.bekas_modis_geo : null;
  const baris = (id, judul, ket, fmt) => `<div class="fa-card" style="margin-bottom:10px"><b>${judul}</b><p class="fa-note" style="margin:4px 0">${ket}</p><div class="wa-btns">${fmt.map(f => `<button class="btn tap" data-e="${id}|${f}">${f}</button>`).join('')}</div></div>`;
  halaman(I('Ekspor data wilayah', 'Export area data'), p.site.hd_nama,
    baris('batas', I('Batas wilayah', 'Area boundary'), I(`${nf(p.site.luas_ha)} ha · WGS84`, `${nf(p.site.luas_ha)} ha · WGS84`), ['KML', 'GeoJSON']) +
    baris('titik', I('Titik panas tahun ini', 'Hotspots this year'), I(`${nf(T.features.length)} deteksi NASA FIRMS dalam 25 km sejak 1 Januari`, `${nf(T.features.length)} NASA FIRMS detections within 25 km since 1 January`), ['KML', 'GeoJSON', 'GPX', 'CSV']) +
    baris('rawan', I('Titik rawan berulang', 'Recurring hotspot cells'), I(`${nf(R.features.length)} sel ± 1 km yang terbakar ≥ 3 tahun (2016–2025)`, `${nf(R.features.length)} ~1 km cells burned in ≥ 3 years (2016–2025)`), ['KML', 'GeoJSON', 'GPX', 'CSV']) +
    (p.peta_tahunan ? baris('tahunan', I('Hutan 2000 & kehilangan tutupan pohon per tahun', 'Forest 2000 & tree cover loss per year'), I(`Hansen GFC 30 m · GeoTIFF 2 pita (tajuk 2000, tahun kehilangan 2001–2025)${p.peta_tahunan.geojson_tahun && p.peta_tahunan.geojson_tahun.length ? ' · GeoJSON tahun ' + p.peta_tahunan.geojson_tahun[0] + '–' + p.peta_tahunan.geojson_tahun.slice(-1)[0] : ''} · CSV luas per tahun`, `Hansen GFC 30 m · 2-band GeoTIFF (2000 canopy, loss year 2001–2025)${p.peta_tahunan.geojson_tahun && p.peta_tahunan.geojson_tahun.length ? ' · GeoJSON years ' + p.peta_tahunan.geojson_tahun[0] + '–' + p.peta_tahunan.geojson_tahun.slice(-1)[0] : ''} · CSV area per year`), [...(p.peta_tahunan.geotiff_b64 ? ['GeoTIFF'] : []), ...(p.peta_tahunan.kehilangan_geojson ? ['GeoJSON', 'KML'] : []), 'CSV']) : '') +
    (p.hutan_geo && p.hutan_geo.features && p.hutan_geo.features.length ? baris('hutan', I('Indikasi perubahan hutan (Sentinel-2)', 'Forest change indications (Sentinel-2)'), I(`${nf(p.hutan_geo.features.length)} petak, pemeriksaan terakhir`, `${nf(p.hutan_geo.features.length)} patches, latest check`), ['KML', 'GeoJSON', 'GPX', 'CSV']) : '') +
    (p.bekas_s2_geo && p.bekas_s2_geo.features && p.bekas_s2_geo.features.length ? baris('bks2', I('Bekas terbakar Sentinel-2', 'Sentinel-2 burned area'), I(`${nf(p.bekas_s2_geo.features.length)} poligon sejak 2023`, `${nf(p.bekas_s2_geo.features.length)} polygons since 2023`), ['KML', 'GeoJSON', 'CSV']) : '') +
    (BM ? baris('bekas', I('Area terbakar MODIS (piksel 500 m)', 'MODIS burned area (500 m pixels)'), I(`${nf(BM.features.length)} titik pusat piksel, 2001–sekarang`, `${nf(BM.features.length)} pixel centres, 2001–present`), ['GeoJSON', 'CSV']) : '') +
    `<p class="fa-note">${I('KML untuk Google Earth/Avenza, GeoJSON untuk QGIS/ArcGIS, GPX untuk GPS lapangan (Garmin, OsmAnd), CSV untuk Excel. Koordinat WGS84 (EPSG:4326).', 'KML for Google Earth/Avenza, GeoJSON for QGIS/ArcGIS, GPX for field GPS (Garmin, OsmAnd), CSV for Excel. WGS84 coordinates (EPSG:4326).')}</p>`,
    () => document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      if (b.dataset.e.startsWith('tahunan|')) { const PT = p.peta_tahunan, f = b.dataset.e.split('|')[1], nm2 = slug(p.site.hd_nama);
        if (f === 'GeoTIFF') { const bin = atob(PT.geotiff_b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dl(new Blob([u8], { type: 'image/tiff' }), `${nm2}_hansen_hutan2000_kehilangan.tif`); }
        else if (f === 'CSV') dl(new Blob([csvTeks([[I('tahun', 'year'), I('kehilangan_ha', 'loss_ha')], ...Object.entries(PT.hilang_per_tahun_ha)])], { type: 'text/csv' }), `${nm2}_kehilangan_per_tahun.csv`);
        else if (f === 'GeoJSON') dl(new Blob([JSON.stringify(PT.kehilangan_geojson)], { type: 'application/geo+json' }), `${nm2}_kehilangan_per_tahun.geojson`);
        else dl(new Blob([kml(`${p.site.hd_nama} – ${I('kehilangan tutupan pohon', 'tree cover loss')}`, PT.kehilangan_geojson, '1c1cd7')], { type: 'application/vnd.google-earth.kml+xml' }), `${nm2}_kehilangan_per_tahun.kml`);
        return toast(I('Berkas disiapkan', 'File ready')); }
      const [id, f] = b.dataset.e.split('|'), nm = slug(p.site.hd_nama), FC = id === 'batas' ? batasFC(p) : id === 'titik' ? T : id === 'rawan' ? R : id === 'hutan' ? p.hutan_geo : id === 'bks2' ? p.bekas_s2_geo : BM;
      const jud = { batas: I('Batas wilayah', 'Area boundary'), titik: I('Titik panas', 'Hotspots'), rawan: I('Titik rawan', 'Recurring hotspots'), bekas: I('Area terbakar MODIS', 'MODIS burned area'), hutan: I('Perubahan hutan', 'Forest change'), bks2: I('Bekas terbakar Sentinel-2', 'Sentinel-2 burned area') }[id];
      const pusat = g => { if (g.type === 'Point') return g.coordinates; const c = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]); return [c.reduce((a, x) => a + x[0], 0) / c.length, c.reduce((a, x) => a + x[1], 0) / c.length]; };
      let blob, ext;
      if (f === 'GeoJSON') { blob = new Blob([JSON.stringify(FC)], { type: 'application/geo+json' }); ext = 'geojson'; }
      else if (f === 'KML') { blob = new Blob([kml(`${p.site.hd_nama} – ${jud}`, FC, id === 'batas' ? 'f8bd38' : id === 'rawan' ? '2626dc' : '1673f9')], { type: 'application/vnd.google-earth.kml+xml' }); ext = 'kml'; }
      else if (f === 'GPX') { blob = new Blob([gpx(`${p.site.hd_nama} – ${jud}`, FC.features.map((x, i) => { const c = pusat(x.geometry); return { lat: (+c[1]).toFixed(6), lon: (+c[0]).toFixed(6), nama: id === 'hutan' ? `Hutan ${i + 1} (${x.properties.luas_ha} ha)` : id === 'rawan' ? `Rawan ${x.properties.peringkat || i + 1}` : `${x.properties.tanggal || ''} ${x.properties.jam_utc || ''}`.trim(), ket: id === 'rawan' ? `${x.properties.n_tahun} tahun: ${x.properties.tahun}` : `${x.properties.satelit || ''} FRP ${x.properties.frp_mw || ''}` }; }))], { type: 'application/gpx+xml' }); ext = 'gpx'; }
      else { const ks = [...new Set(FC.features.flatMap(x => Object.keys(x.properties || {})))].filter(k => FC.features.every(x => x.properties[k] == null || typeof x.properties[k] !== 'object'));
        blob = new Blob([csvTeks([['lintang', 'bujur', ...ks], ...FC.features.map(x => { const c = pusat(x.geometry); return [(+c[1]).toFixed(6), (+c[0]).toFixed(6), ...ks.map(k => x.properties[k])]; })])], { type: 'text/csv' }); ext = 'csv'; }
      if (!FC.features.length && id !== 'batas') return toast(I('Tidak ada data untuk diekspor', 'No data to export'));
      dl(blob, `${nm}_${id}.${ext}`); toast(I('Berkas disiapkan', 'File ready'));
    }));
}

/* ---------- peta luring ---------- */
function luring() {
  const p = perlu(); if (!p) return; pakai('wluring');
  if (!window.FHLuring) return toast(I('Fitur peta luring tidak tersedia di perangkat ini', 'Offline maps are not available on this device'));
  const c = p.site.pusat_wilayah || p.site.pusat, km = Math.min(60, Math.max(8, Math.ceil(Math.sqrt((p.site.luas_ha || 100) / 100) / 2 + 6)));
  const E = FHLuring.perkiraan(c[0], c[1], km), info = FHLuring.info();
  const sama = info && Math.abs(info.lat - c[0]) < 1e-4 && Math.abs(info.lon - c[1]) < 1e-4;
  halaman(I('Peta luring wilayah', 'Offline area map'), p.site.hd_nama,
    kartu(I('Simpan peta untuk lapangan', 'Save map for fieldwork'), `<p>${I(`Citra satelit Sentinel-2 bebas awan (EOX, 2025) zoom 8–14, radius ± ${km} km dari pusat wilayah: <b>${nf(E.n)} ubin ≈ ${nf(E.mb, 1)} MB</b>. Simpan saat ada Wi-Fi; setelah itu peta dan data wilayah tetap terbuka tanpa sinyal.`, `Cloud-free Sentinel-2 imagery (EOX, 2025) zoom 8–14, about ${km} km around the area centre: <b>${nf(E.n)} tiles ≈ ${nf(E.mb, 1)} MB</b>. Save on Wi-Fi; afterwards the map and area data open without signal.`)}</p>
      ${info ? `<p class="fa-note">${sama ? I('✓ Sudah tersimpan untuk wilayah ini', '✓ Already saved for this area') : I('Peta luring yang tersimpan sekarang untuk lokasi lain; menyimpan wilayah ini akan menambah ubin.', 'The saved offline map is for another location; saving this area adds tiles.')} · ${new Date(info.t).toLocaleDateString(EN() ? 'en-GB' : 'id-ID')}${info.gagal ? ' · ' + nf(info.gagal) + ' ' + I('ubin gagal', 'tiles failed') : ''}</p>` : ''}
      <div class="wa-btns"><button class="btn pri tap" id="waLS">${sama ? I('Perbarui peta luring', 'Update offline map') : I('Simpan peta luring', 'Save offline map')}</button>${info ? `<button class="btn tap" id="waLH">${I('Hapus peta luring', 'Delete offline map')}</button>` : ''}</div>`) +
    `<p class="fa-note">${I('Citra: Sentinel-2 cloudless 2025 © EOX IT Services GmbH (CC BY-NC-SA 4.0), data Copernicus. Hanya untuk pemakaian non-komersial.', 'Imagery: Sentinel-2 cloudless 2025 © EOX IT Services GmbH (CC BY-NC-SA 4.0), Copernicus data. Non-commercial use only.')}</p>`,
    () => { const b = document.getElementById('waLS'), h = document.getElementById('waLH');
      b.onclick = async () => { if (navigator.onLine === false) return toast(I('Perlu internet untuk menyimpan', 'Internet needed to save')); b.disabled = true;
        try { await FHLuring.simpan(c[0], c[1], km, (d, t) => { b.textContent = `${I('Menyimpan…', 'Saving…')} ${Math.round(d / t * 100)}%`; }, []); toast(I('Peta luring tersimpan', 'Offline map saved')); luring(); }
        catch (e) { b.disabled = false; b.textContent = I('Gagal – coba lagi', 'Failed – try again'); } };
      if (h) h.onclick = async () => { await FHLuring.hapus(); toast(I('Peta luring dihapus', 'Offline map deleted')); luring(); }; });
}

/* ---------- bandingkan wilayah ---------- */
async function banding() {
  const p = perlu(); if (!p) return; pakai('wbanding');
  const L = W().daftar() || [];
  if (L.length < 2) return halaman(I('Bandingkan wilayah', 'Compare areas'), '', kartu(I('Perlu ≥ 2 wilayah', 'Needs ≥ 2 areas'), `<p>${I('Unggah wilayah lain di Analisis lahan & karbon, atau minta diundang ke ruang kerja tim lain.', 'Upload another area in Land & carbon analysis, or ask to be invited to another team workspace.')}</p>`));
  halaman(I('Bandingkan wilayah', 'Compare areas'), I(`${L.length} wilayah`, `${L.length} areas`), `<div class="fa-card" id="waBd"><p class="fa-note">${I('Memuat data setiap wilayah…', 'Loading each area…')}</p></div>`, async () => {
    const B = document.getElementById('waBd'); const rows = [];
    for (const x of L.slice(0, 12)) { let q = null; try { q = await W().paketAid(x.aid); } catch (e) { } rows.push({ x, q }); if (!document.body.contains(B)) return; }
    const m = (q, f) => { try { return f(q); } catch (e) { return null; } };
    const urut = rows.slice().sort((a, b) => (m(b.q, q => q.iklim.siaga.skor) ?? -1) - (m(a.q, q => q.iklim.siaga.skor) ?? -1) || (m(b.q, q => q.status.r25) ?? -1) - (m(a.q, q => q.status.r25) ?? -1));
    B.innerHTML = `<div class="wa-wrap"><table class="wa-tb"><tr><th>${I('Wilayah', 'Area')}</th><th>${I('Indeks Siaga', 'Alert index')}</th><th>${I('Titik 7 hr', 'Hotspots 7 d')}</th><th>${I('Banjir', 'Flood')}</th><th>${I('Asap menuju', 'Smoke heading')}</th><th>${I('Vegetasi', 'Vegetation')}</th><th>${I('Musim api', 'Fire season')}</th></tr>
      ${urut.map(({ x, q }) => !q || !q.site ? `<tr><td>${esc(x.nama)}</td><td colspan="6" style="text-align:left" class="muted">${I('data otomatis sedang disiapkan', 'automatic data being prepared')}</td></tr>` :
        `<tr${x.aid === W().aidAktif() ? ' style="font-weight:700"' : ''}><td>${esc(x.nama)}<br><small class="muted">${nf(q.site.luas_ha)} ha</small></td><td>${tag(m(q, q => q.iklim.siaga.label))}<br><small class="muted">${m(q, q => q.iklim.siaga.skor) ?? '–'}/${m(q, q => q.iklim.siaga.maks) ?? 12}</small></td>
        <td>${nf(m(q, q => q.status.di_dalam))} / ${nf(m(q, q => q.status.r5))} / ${nf(m(q, q => q.status.r25))}</td><td>${tag(m(q, q => q.banjir.label))}</td><td>${nf(m(q, q => q.asap.menuju_desa) ?? 0)}</td>
        <td>${esc(m(q, q => q.vegetasi.terkini.status) || '–')}</td><td>${esc((m(q, q => q.musim.musim) || []).map(b => BLN()[b - 1]).join(', ') || '–')}</td></tr>`).join('')}</table></div>
      <p class="fa-note">${I('Titik 7 hr = di dalam / ≤ 5 km / ≤ 25 km dari batas. Diurutkan dari skor Indeks Siaga tertinggi. Baris tebal = wilayah yang sedang dibuka.', 'Hotspots 7 d = inside / ≤ 5 km / ≤ 25 km of the boundary. Sorted by highest Alert Index score. Bold row = the area currently open.')}</p>`;
  });
}

/* ---------- laporan PDF ---------- */
function laporan() {
  const p = perlu(); if (!p) return; pakai('wlaporan');
  const n = kini(), opsi = []; for (let k = 0; k < Math.min(12, n.getUTCMonth() + 1); k++) opsi.push(n.getUTCMonth() - k);
  halaman(I('Laporan wilayah (PDF)', 'Area report (PDF)'), p.site.hd_nama,
    kartu(I('Isi laporan', 'Report contents'), `<p class="fa-note">${I('Status terkini (titik panas 7 hari, Indeks Siaga, banjir, asap, vegetasi) · titik panas & cuaca bulan pilihan · riwayat titik panas per tahun · rekap musim api · area terbakar MODIS · kalender musim api · sumber & metode.', 'Current status (7-day hotspots, Alert Index, flood, smoke, vegetation) · hotspots & weather in the chosen month · yearly hotspot history · fire-season recap · MODIS burned area · fire-season calendar · sources & methods.')}</p>
      <label class="fa-note">${I('Bulan', 'Month')}</label><select class="wa-sel" id="waBl">${opsi.map(m => `<option value="${m}">${BLNP()[m]} ${n.getUTCFullYear()}</option>`).join('')}</select>
      <div class="wa-btns"><button class="btn pri tap" id="waPdf">${I('Unduh laporan PDF', 'Download PDF report')}</button></div>`),
    () => { const b = document.getElementById('waPdf');
      b.onclick = async () => { b.disabled = true; const t0 = b.textContent; b.textContent = I('Menyusun PDF…', 'Building PDF…');
        try { await buatPdf(p, +document.getElementById('waBl').value); toast(I('Laporan PDF disiapkan', 'PDF report ready')); }
        catch (e) { toast((e && e.message) || I('Gagal membuat PDF', 'Failed to build PDF')); }
        b.disabled = false; b.textContent = t0; }; });
}
async function buatPdf(p, bulan) {
  const A = window.FHAlat; if (!A) throw new Error('FHAlat');
  await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE);
  const { jsPDF } = window.jspdf, doc0 = new jsPDF({ unit: 'mm', format: 'a4' }), Wd = 210, M = 16; let y = 18;
  const san = t => String(t ?? '').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x00-\xFF–—…•€]/g, '');   // font standar PDF (WinAnsi)
  const doc = new Proxy(doc0, { get: (o, k) => k === 'text' ? (t, ...a) => o.text(Array.isArray(t) ? t.map(san) : san(t), ...a) : k === 'splitTextToSize' ? (t, ...a) => o.splitTextToSize(san(t), ...a) : k === 'autoTable' ? (opt) => o.autoTable(Object.assign({}, opt, { head: (opt.head || []).map(r => r.map(san)), body: (opt.body || []).map(r => r.map(san)) })) : typeof o[k] === 'function' ? o[k].bind(o) : o[k] });
  const tahun = kini().getUTCFullYear(), mm = String(bulan + 1).padStart(2, '0'), s = p.site, en = EN();
  const H = (t) => { if (y > 255) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(11, 59, 44); doc.text(t, M, y); y += 6; doc.setTextColor(20); };
  const Pg = (t, sz = 9.5) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(sz); const L = doc.splitTextToSize(t, Wd - 2 * M); L.forEach(l => { if (y > 280) { doc.addPage(); y = 18; } doc.text(l, M, y); y += sz * 0.45; }); y += 1.5; };
  const Tb = (head, body) => { doc.autoTable({ startY: y, head: [head], body, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: [11, 59, 44] }, theme: 'grid' }); y = doc.lastAutoTable.finalY + 6; };
  // judul
  doc.setFillColor(11, 59, 44); doc.rect(0, 0, Wd, 30, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(en ? 'Area report' : 'Laporan wilayah', M, 13); doc.setFontSize(11); doc.text(doc.splitTextToSize(s.hd_nama, Wd - 2 * M)[0], M, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`${BLNP()[bulan]} ${tahun} · ${nf(s.luas_ha)} ha · ${en ? 'generated' : 'dibuat'} ${kini().toISOString().slice(0, 16).replace('T', ' ')} WIB · Pantau Rimbak`, M, 26); y = 40; doc.setTextColor(20);
  // 1 status terkini
  H(en ? '1. Current status' : '1. Status terkini');
  const st = p.status || {}, sg = (p.iklim || {}).siaga || {}, bj = p.banjir || {}, as = p.asap || {}, vg = ((p.vegetasi || {}).terkini) || {};
  Tb([en ? 'Indicator' : 'Indikator', en ? 'Value' : 'Nilai', en ? 'Note' : 'Keterangan'], [
    [en ? 'Hotspots last 7 days' : 'Titik panas 7 hari', `${st.label || '–'}`, `${nf(st.di_dalam)} ${en ? 'inside' : 'di dalam'} · ${nf(st.r5)} ≤ 5 km · ${nf(st.r25)} ≤ 25 km`],
    [en ? 'Village Alert Index' : 'Indeks Siaga', `${sg.label || '–'}`, sg.skor != null ? `${en ? 'score' : 'skor'} ${sg.skor}/${sg.maks} (${sg.tanggal || ''})` : ''],
    [en ? 'Main river (GloFAS)' : 'Sungai utama (GloFAS)', `${bj.label || '–'}`, bj.kini != null ? `${nf(bj.kini)} m³/s · ${nf(bj.persen_rp2)}% ${en ? 'of 2-year flood' : 'ambang 2 tahunan'}` : ''],
    [en ? 'Smoke heading to area' : 'Asap menuju wilayah', `${nf(as.menuju_desa ?? 0)} ${en ? 'sources' : 'sumber'}`, as.tercepat_wib ? `${en ? 'earliest' : 'tercepat'} ${as.tercepat_wib} WIB` : ''],
    ...(((p.profil || {}).gambut) ? [[en ? 'Peatland (PEATMAP)' : 'Lahan gambut (PEATMAP)', `${nf(p.profil.gambut.ha)} ha (${nf(p.profil.gambut.persen, 1)}%)`, `${nf(p.profil.gambut.titik_tahun_ini)} ${en ? 'hotspots on peat this year' : 'titik panas di gambut tahun ini'}`]] : []),
    ...(((p.profil || {}).biomassa) ? [[en ? 'Biomass carbon (HGB 2010)' : 'Karbon biomassa (HGB 2010)', `${nf(p.profil.biomassa.karbon_total_tc)} t C`, `${nf(p.profil.biomassa.c_atas_rata_mgc_ha, 1)} + ${nf(p.profil.biomassa.c_bawah_rata_mgc_ha, 1)} t C/ha`]] : []),
    ...(((p.profil || {}).tajuk) ? [[en ? 'Canopy height (Meta/WRI)' : 'Tinggi tajuk (Meta/WRI)', `${nf(p.profil.tajuk.rata_tajuk_m, 1)} m`, `${nf(p.profil.tajuk.persen_tajuk_5m, 1)}% ${en ? 'canopy >= 5 m' : 'bertajuk >= 5 m'}`]] : []),
    ...(((p.profil || {}).genangan) ? [[en ? 'Surface water 1984–2020 (JRC)' : 'Genangan 1984–2020 (JRC)', `${nf(p.profil.genangan.pernah_ha)} ha`, `${nf(p.profil.genangan.permanen_ha)} ha ${en ? 'permanent' : 'permanen'}`]] : []),
    ...((p.radar && p.radar.status === 'selesai') ? [[en ? 'Forest change (Sentinel-1 radar)' : 'Perubahan hutan (radar Sentinel-1)', `${nf(p.radar.luas_baru_ha, 1)} ha ${en ? 'new' : 'baru'}`, `${nf(p.radar.luas_ha, 1)} ha ${en ? 'in 36 days' : 'dalam 36 hari'}`]] : []),
    ...((p.hutan && p.hutan.status === 'selesai') ? [[en ? 'Forest change (Sentinel-2)' : 'Perubahan hutan (Sentinel-2)', `${nf(p.hutan.luas_baru_ha, 1)} ha ${en ? 'new' : 'baru'}`, `${nf(p.hutan.luas_berubah_ha, 1)} ha ${en ? 'in 90 days' : 'dalam 90 hari'} (${p.hutan.dicek_utc ? p.hutan.dicek_utc.slice(0, 10) : ''})`]] : []),
    [en ? 'Vegetation (MODIS)' : 'Vegetasi (MODIS)', `${vg.status || '–'}`, vg.ndvi != null ? `NDVI ${nf(vg.ndvi, 2)} · NBR ${nf(vg.nbr, 2)} (${vg.tanggal || ''})` : '']]);
  // 2 bulan pilihan
  H(`2. ${en ? 'Hotspots' : 'Titik panas'} – ${BLNP()[bulan]} ${tahun}`);
  const T = (p.titik_kini || []).filter(t => t.d.slice(0, 7) === `${tahun}-${mm}`), d0 = x => (x.ls || [99])[0];
  Pg(en ? `${T.length} NASA FIRMS detections within 25 km: ${T.filter(t => d0(t) <= 0).length} inside the area, ${T.filter(t => d0(t) > 0 && d0(t) <= 5).length} within 5 km.` : `${T.length} deteksi NASA FIRMS dalam 25 km: ${T.filter(t => d0(t) <= 0).length} di dalam wilayah, ${T.filter(t => d0(t) > 0 && d0(t) <= 5).length} dalam 5 km.`);
  if (T.length) Tb([en ? 'Date' : 'Tanggal', en ? 'Time (WIB)' : 'Jam (WIB)', en ? 'Satellite' : 'Satelit', en ? 'Distance' : 'Jarak', 'FRP (MW)', en ? 'Lat, lon' : 'Lintang, bujur'],
    T.slice().sort((a, b) => d0(a) - d0(b) || (a.d < b.d ? -1 : 1)).slice(0, 40).map(t => { const h = (+String(t.t).slice(0, 2) + 7) % 24; return [t.d, String(h).padStart(2, '0') + '.' + String(t.t).slice(2, 4), t.sat || '', d0(t) <= 0 ? (en ? 'inside' : 'di dalam') : nf(d0(t), 1) + ' km', t.frp ?? '', `${(+t.la).toFixed(4)}, ${(+t.lo).toFixed(4)}`]; }));
  if (T.length > 40) Pg(en ? `(40 nearest of ${T.length} shown; full list via Export data → CSV.)` : `(ditampilkan 40 terdekat dari ${T.length}; daftar lengkap lewat Ekspor data → CSV.)`, 8.5);
  const C = p.cuaca; if (C && C.t) { const ix = C.t.map((t, i) => t.slice(0, 7) === `${tahun}-${mm}` ? i : -1).filter(i => i >= 0);
    if (ix.length) { const hj = ix.map(i => C.hujan[i]).filter(v => v != null), tm = ix.map(i => C.tmaks[i]).filter(v => v != null); let hth = 0, run = 0; ix.forEach(i => { if ((C.hujan[i] ?? 0) < 1) { run++; hth = Math.max(hth, run); } else run = 0; });
      Pg(en ? `Weather (ERA5 reanalysis, ${ix.length} days available): rain ${nf(hj.reduce((a, b) => a + b, 0))} mm, ${hj.filter(v => v >= 1).length} rainy days, longest dry spell ${hth} days, mean max temperature ${nf(tm.reduce((a, b) => a + b, 0) / (tm.length || 1), 1)} °C.` :
        `Cuaca (reanalisis ERA5, ${ix.length} hari tersedia): hujan ${nf(hj.reduce((a, b) => a + b, 0))} mm, ${hj.filter(v => v >= 1).length} hari hujan, hari tanpa hujan terpanjang ${hth} hari, suhu maksimum rata-rata ${nf(tm.reduce((a, b) => a + b, 0) / (tm.length || 1), 1)} °C.`); } }
  // 3 riwayat
  const R = p.riwayat || {}; if (Object.keys(R).length) { H(en ? '3. Hotspot history per year' : '3. Riwayat titik panas per tahun');
    Tb([en ? 'Year' : 'Tahun', en ? 'Inside' : 'Di dalam', '≤ 5 km', '≤ 25 km', en ? 'Peak month' : 'Bulan puncak'], Object.keys(R).sort().map(k => { const b = R[k].bulan || [], i = b.indexOf(Math.max(...b)); return [k + (k === String(tahun) ? ' *' : ''), nf(R[k].hd), nf(R[k].r5), nf(R[k].r25), Math.max(...b) > 0 ? BLNP()[i] : '–']; })); }
  // 4 rekap musim
  const RK = (p.rekap || {}).musim || {}; if (Object.keys(RK).length) { H(en ? '4. Fire-season recap' : '4. Rekap musim api');
    Pg(en ? `Season ${(p.rekap || {}).periode || ''}; long-term average ${nf((p.rekap || {}).rata_r25_2016_2025)} detections ≤ 25 km.` : `Musim ${(p.rekap || {}).periode || ''}; rata-rata jangka panjang ${nf((p.rekap || {}).rata_r25_2016_2025)} deteksi ≤ 25 km.`, 9);
    Tb([en ? 'Season' : 'Musim', en ? 'Inside' : 'Di dalam', '≤ 25 km', en ? 'Rain (mm)' : 'Hujan (mm)', en ? 'Normal (mm)' : 'Normal (mm)', en ? 'Longest dry' : 'HTH terpanjang', 'ONI'],
      Object.keys(RK).sort().reverse().map(k => { const r = RK[k]; return [k, nf((r.titik || {}).hd), nf((r.titik || {}).r25), nf(r.hujan_mm), nf(r.hujan_normal_mm), r.hth_terpanjang != null ? r.hth_terpanjang + (en ? ' d' : ' hr') : '–', r.oni_jas ?? '–']; })); }
  // 5 MODIS
  const BM = (p.bekas_modis || {}).tahun || {}; if (Object.keys(BM).length) { H(en ? '5. Burned area (MODIS MCD64A1)' : '5. Area terbakar (MODIS MCD64A1)');
    Tb([en ? 'Year' : 'Tahun', en ? 'Inside (ha)' : 'Di dalam (ha)', '≤ 5 km (ha)', '≤ 25 km (ha)', en ? 'Months' : 'Bulan data'], Object.keys(BM).sort().reverse().filter(k => BM[k].buf25 > 0 || +k >= tahun - 5).map(k => [k, nf(BM[k].hd), nf(BM[k].buf5), nf(BM[k].buf25), String(BM[k].bulan)])); }
  // 6 kalender
  const MU = p.musim || {}; if (MU.bulan) { H(en ? '6. Fire-season calendar (2016–2025)' : '6. Kalender musim api (2016–2025)');
    Pg(en ? `Fire-season months: ${(MU.musim || []).map(m => BLNP()[m - 1]).join(', ') || '–'}${MU.puncak ? '; peak ' + BLNP()[MU.puncak - 1] : ''}.` : `Bulan musim api: ${(MU.musim || []).map(m => BLNP()[m - 1]).join(', ') || '–'}${MU.puncak ? '; puncak ' + BLNP()[MU.puncak - 1] : ''}.`);
    Tb([en ? 'Month' : 'Bulan', en ? 'Mean ≤25 km' : 'Rata-rata ≤25 km', en ? 'Chance ≤25 km' : 'Peluang ≤25 km', en ? 'Category' : 'Kategori', en ? 'Normal rain (mm)' : 'Hujan normal (mm)'], MU.bulan.map(b => [BLNP()[b.bulan - 1], nf(b.rata25, 1), b.peluang25 + '%', b.kategori || '', nf(b.hujan_normal)])); }
  // sumber
  H(en ? 'Sources & methods' : 'Sumber & metode');
  Pg(en ? 'Hotspots: NASA FIRMS (VIIRS & MODIS), distance to the area boundary; one fire may be detected several times. Weather: ECMWF ERA5/ERA5-Land reanalysis (Copernicus C3S) via Open-Meteo. Fire danger: Canadian Fire Weather Index from ECMWF forecasts. Flood: GloFAS (Copernicus EMS). Smoke: 24-h forward trajectories with ECMWF 10 m wind. Vegetation: MODIS MOD13Q1/MYD13Q1. Burned area: MODIS MCD64A1 (NASA). Figures are model/satellite estimates – verify in the field.' :
    'Titik panas: NASA FIRMS (VIIRS & MODIS), jarak ke batas wilayah; satu kebakaran dapat terdeteksi beberapa kali. Cuaca: reanalisis ECMWF ERA5/ERA5-Land (Copernicus C3S) via Open-Meteo. Bahaya kebakaran: Fire Weather Index Kanada dari prakiraan ECMWF. Banjir: GloFAS (Copernicus EMS). Asap: lintasan maju 24 jam dengan angin 10 m ECMWF. Vegetasi: MODIS MOD13Q1/MYD13Q1. Area terbakar: MODIS MCD64A1 (NASA). Angka adalah perkiraan model/satelit – pastikan dengan pengecekan lapangan.', 8.5);
  const nH = doc.getNumberOfPages(); for (let i = 1; i <= nH; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Pantau Rimbak · ${s.hd_nama.slice(0, 60)} · ${en ? 'page' : 'hal.'} ${i}/${nH}`, M, 291); }
  dl(doc.output('blob'), `Laporan_${slug(s.hd_nama)}_${tahun}-${mm}.pdf`);
}

/* ---------- profil lahan wilayah (lapisan nasional) ---------- */
const bagian = {};   // diisi per lapisan: bagian.gambut = (p) => html
bagian.gambut = p => { const g = (p.profil || {}).gambut; if (!g) return '';
  return kartu(I('Lahan gambut', 'Peatland'), `<div class="ik-kv" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
      <div class="fa-card" style="margin:0;padding:10px"><small class="muted">${I('Luas gambut', 'Peat area')}</small><br><b style="font-size:18px">${nf(g.ha)} ha</b></div>
      <div class="fa-card" style="margin:0;padding:10px"><small class="muted">${I('Porsi wilayah', 'Share of area')}</small><br><b style="font-size:18px">${nf(g.persen, 1)}%</b></div>
      <div class="fa-card" style="margin:0;padding:10px"><small class="muted">${I('Titik panas di gambut (tahun ini)', 'Hotspots on peat (this year)')}</small><br><b style="font-size:18px">${nf(g.titik_tahun_ini)}</b><small class="muted"> / ${nf(g.titik_dalam_tahun_ini)} ${I('di wilayah', 'in area')}</small></div>
      <div class="fa-card" style="margin:0;padding:10px"><small class="muted">${I('Titik panas di gambut (7 hari)', 'Hotspots on peat (7 days)')}</small><br><b style="font-size:18px;color:${g.titik_7hari ? '#B91C1C' : 'inherit'}">${nf(g.titik_7hari)}</b></div></div>
    ${g.persen >= 1 ? `<p style="margin:8px 0 0">${I('Api di gambut dapat menjalar di bawah permukaan dan menghasilkan asap pekat; prioritaskan pencegahan & sekat kanal pada bagian gambut wilayah ini.', 'Peat fires can smoulder below ground and produce dense smoke; prioritise prevention & canal blocking on the peat part of this area.')}</p>` : `<p style="margin:8px 0 0">${I('Menurut peta nasional, wilayah ini praktis tidak berada di lahan gambut.', 'According to the national map, this area is practically not on peat.')}</p>`}
    <div class="wa-btns"><button class="btn tap" data-peta="gambut">${I('Tampilkan lapisan gambut di peta', 'Show peat layer on map')}</button></div>
    <p class="fa-note">${I('Sumber', 'Source')}: ${esc(g.sumber || '')}. ${esc(g.catatan || '')}</p>`); };
bagian.tahunan = p => { const T = p.peta_tahunan; if (!T) return ''; const th = Object.keys(T.hilang_per_tahun_ha || {}).sort(), mx = Math.max(1, ...th.map(y => T.hilang_per_tahun_ha[y])), tot = th.reduce((a, y) => a + T.hilang_per_tahun_ha[y], 0);
  return kartu(I('Hutan 2000 & kehilangan tutupan pohon', 'Forest 2000 & tree cover loss'), `<p class="fa-note">${I(`Hutan (tajuk ≥ 30 %) tahun 2000: <b>${nf(T.hutan_2000_ha)} ha</b>; hilang 2001–2025: <b>${nf(tot)} ha</b> (${nf(100 * tot / Math.max(1, T.hutan_2000_ha), 1)}%).`, `Forest (canopy ≥ 30 %) in 2000: <b>${nf(T.hutan_2000_ha)} ha</b>; lost 2001–2025: <b>${nf(tot)} ha</b> (${nf(100 * tot / Math.max(1, T.hutan_2000_ha), 1)}%).`)}</p>
    <svg class="wa-svg" viewBox="0 0 340 120">${th.map((y, i) => { const v = T.hilang_per_tahun_ha[y], h = 86 * v / mx, w = 330 / Math.max(25, th.length), x = 6 + i * w; return `<rect x="${x}" y="${96 - h}" width="${w - 2}" height="${h}" fill="#DC2626" rx="1"><title>${y}: ${nf(v, 1)} ha</title></rect>${i % 4 === 0 ? `<text x="${x + w / 2}" y="110" text-anchor="middle">${y.slice(2)}</text>` : ''}`; }).join('')}</svg>
    <p class="fa-note">${esc(T.sumber)}. ${I('Unduh peta lengkap lewat Ekspor data.', 'Download full maps via Export data.')}</p>`); };
const kotak = (l, v, w) => `<div class="fa-card" style="margin:0;padding:10px"><small class="muted">${l}</small><br><b style="font-size:18px${w ? ';color:' + w : ''}">${v}</b></div>`;
const grid4 = x => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">${x}</div>`;
bagian.genangan = p => { const g = (p.profil || {}).genangan; if (!g) return '';
  return kartu(I('Riwayat genangan air (1984–2020)', 'Surface water history (1984–2020)'), grid4(kotak(I('Air permanen', 'Permanent water'), nf(g.permanen_ha) + ' ha') + kotak(I('Sering tergenang (≥ 25 %)', 'Often flooded (≥ 25 %)'), nf(g.sering_ha) + ' ha') + kotak(I('Pernah tergenang', 'Ever flooded'), nf(g.pernah_ha) + ' ha') + kotak(I('Porsi wilayah pernah tergenang', 'Share ever flooded'), nf(g.persen_pernah, 1) + '%', '#0369A1')) +
    `<p class="fa-note">${I('Permanen = air di ≥ 75 % pengamatan Landsat; musiman/sesekali = 1–74 %. Berguna untuk perencanaan sekat kanal, gambut basah, dan risiko banjir.', 'Permanent = water in ≥ 75 % of Landsat observations; seasonal/occasional = 1–74 %. Useful for canal blocking, rewetting and flood risk planning.')} ${I('Sumber', 'Source')}: ${esc(g.sumber)}.</p>`); };
bagian.biomassa = p => { const b = (p.profil || {}).biomassa; if (!b) return '';
  return kartu(I('Stok karbon biomassa (2010)', 'Biomass carbon stock (2010)'), grid4(kotak(I('Karbon atas permukaan', 'Aboveground carbon'), nf(b.c_atas_rata_mgc_ha, 1) + ' t C/ha') + kotak(I('Karbon bawah permukaan', 'Belowground carbon'), nf(b.c_bawah_rata_mgc_ha, 1) + ' t C/ha') + kotak(I('Total karbon biomassa', 'Total biomass carbon'), nf(b.karbon_total_tc) + ' t C') + kotak(I('Setara CO₂', 'CO₂ equivalent'), nf(b.co2e_total_t) + ' t CO₂e', '#15803D')) +
    `<p class="fa-note">${esc(b.metode)} ${I('Tidak termasuk karbon tanah/gambut. Untuk perhitungan resmi gunakan analisis lahan & karbon (metode FREL KLHK).', 'Excludes soil/peat carbon. For official accounting use the land & carbon analysis (KLHK FREL method).')} ${I('Sumber', 'Source')}: ${esc(b.sumber)}.</p>`); };
bagian.tajuk = p => { const t = (p.profil || {}).tajuk; if (!t) return ''; const K = t.kelas_ha || {}, tot = Object.values(K).reduce((a, b) => a + b, 0) || 1;
  const W = { '0-2': '#E5E7EB', '2-5': '#D9F99D', '5-10': '#86EFAC', '10-20': '#22C55E', '20-30': '#15803D', '30': '#14532D' };
  return kartu(I('Tinggi tajuk pohon', 'Tree canopy height'), grid4(kotak(I('Rata-rata tinggi tajuk (≥ 5 m)', 'Mean canopy height (≥ 5 m)'), nf(t.rata_tajuk_m, 1) + ' m') + kotak(I('Wilayah bertajuk ≥ 5 m', 'Area with canopy ≥ 5 m'), nf(t.persen_tajuk_5m, 1) + '%', '#15803D') + kotak(I('Persentil 90', '90th percentile'), nf(t.p90_m, 1) + ' m')) +
    `<div style="display:flex;height:18px;border-radius:6px;overflow:hidden;margin:10px 0 4px">${Object.entries(K).map(([k, v]) => `<i title="${k} m: ${nf(v)} ha" style="flex:${v / tot};background:${W[k] || '#999'}"></i>`).join('')}</div>
    <p class="fa-note">${Object.entries(K).map(([k, v]) => `<span style="color:${W[k]};font-weight:900">■</span> ${k === '30' ? '≥ 30' : k} m ${nf(100 * v / tot, 1)}%`).join(' · ')}</p>
    <p class="fa-note">${esc(t.catatan)} ${I('Sumber', 'Source')}: ${esc(t.sumber)}.</p>`); };
function profil() {
  const p = perlu(); if (!p) return; pakai('wprofil');
  const isi = Object.keys(bagian).map(k => { try { return bagian[k](p); } catch (e) { return ''; } }).join('');
  halaman(I('Profil lahan wilayah', 'Area land profile'), p.site.hd_nama, isi || kartu(I('Sedang disiapkan', 'Being prepared'), `<p>${I('Profil lahan dihitung pada putaran analisis otomatis berikutnya (± 3 jam).', 'The land profile is computed in the next automatic analysis run (about 3 hours).')}</p>`),
    () => document.querySelectorAll('[data-peta]').forEach(b => b.onclick = () => { const M = window.FHApp && FHApp.map && FHApp.map(); try { FHApp.closeAll(); } catch (e) { } setTimeout(() => { try { FHApp.hubGo('peta'); } catch (e) { } setTimeout(() => { const m = M || (FHApp.map && FHApp.map()); if (m && window.FHLapNas && !FHLapNas.aktif(b.dataset.peta, m)) FHLapNas.toggle(b.dataset.peta, m); try { const c = p.site.pusat_wilayah || p.site.pusat; FHApp.lihat(c[0], c[1], 10); } catch (e) { } }, 400); }, 350); }));
}
/* ---------- Sentinel-2: perubahan hutan & bekas terbakar (lapisan peta dari paket) ---------- */
let LAP = {};
function kePeta(nama, fc, gaya, klik) {
  const M = window.FHApp && FHApp.map && FHApp.map(); if (!fc || !fc.features || !fc.features.length) return toast(I('Tidak ada petak untuk ditampilkan', 'No polygons to show'));
  try { FHApp.closeAll(); } catch (e) { }
  setTimeout(() => { try { FHApp.hubGo('peta'); } catch (e) { } setTimeout(() => { const m = M || FHApp.map(); if (!m) return; if (LAP[nama]) { try { m.removeLayer(LAP[nama]); } catch (e) { } }
    LAP[nama] = L.geoJSON(fc, { style: gaya, onEachFeature: (f, l) => l.on('click', () => klik(f.properties)) }).addTo(m); try { m.fitBounds(LAP[nama].getBounds(), { maxZoom: 13, padding: [20, 20] }); } catch (e) { } }, 400); }, 350);
}
const tgl = s => { try { return new Date(s).toLocaleDateString(EN() ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s || ''; } };
function ikatRadar(p) {
  const rb = document.getElementById('waRP'); if (rb) rb.onclick = () => kePeta('radar', p.radar_geo, f => f.properties.baru ? { color: '#7C3AED', weight: 2.5, fillColor: '#8B5CF6', fillOpacity: .6 } : { color: '#A78BFA', weight: 1.5, fillColor: '#C4B5FD', fillOpacity: .45 },
        q => openSheet(`<h3>${I('Indikasi radar (tembus awan)', 'Radar indication (through clouds)')}</h3><p class="sub">${esc(p.site.hd_nama)}</p><dl class="kv"><dt>${I('Luas petak', 'Patch area')}</dt><dd>${nf(q.luas_ha, 2)} ha</dd><dt>${I('Pertama terdeteksi', 'First detected')}</dt><dd>${esc(q.pertama_terdeteksi || '')}${q.baru ? ' · <b style="color:#7C3AED">' + I('baru', 'new') + '</b>' : ''}</dd><dt>${I('Periode', 'Period')}</dt><dd>${esc(q.periode)}</dd><dt>${I('Dibanding', 'Compared with')}</dt><dd>${esc(q.dibanding)}</dd></dl><p class="small muted">${I('Penurunan hamburan balik radar Sentinel-1 (VH); perlu verifikasi lapangan.', 'Drop in Sentinel-1 radar backscatter (VH); needs field verification.')}</p>`));
}
function radarHtml(p) { const r = p.radar; if (!r) return '';
  const st = r.status === 'selesai';
  return kartu(I('Radar Sentinel-1 (tembus awan)', 'Sentinel-1 radar (through clouds)'), st ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
      <div><small class="muted">${I('Indikasi BARU', 'NEW indications')}</small><br><b style="font-size:20px;color:${r.luas_baru_ha >= 1 ? '#7C3AED' : 'inherit'}">${nf(r.luas_baru_ha, 1)} ha</b><small class="muted"> · ${nf(r.petak_baru)} ${I('petak', 'patches')}</small></div>
      <div><small class="muted">${I('Seluruh indikasi 36 hari', 'All indications, 36 days')}</small><br><b style="font-size:20px">${nf(r.luas_ha, 1)} ha</b></div>
      <div><small class="muted">${I('Hutan acuan', 'Reference forest')}</small><br><b style="font-size:20px">${nf(r.hutan_acuan_ha)} ha</b></div></div>
    <p class="fa-note">${I(`Citra radar ${esc((r.tanggal_terkini || []).join(', '))} dibanding ${esc((r.tanggal_acuan || []).join(', '))} (orbit ${r.orbit}).`, `Radar images ${esc((r.tanggal_terkini || []).join(', '))} vs ${esc((r.tanggal_acuan || []).join(', '))} (orbit ${r.orbit}).`)}</p>
    <div class="wa-btns"><button class="btn tap" id="waRP">${I('Lihat petak radar di peta', 'Show radar patches on map')}</button></div>` : `<p>${esc(r.status)}</p>`) +
    `<p class="fa-note">${I('Radar menembus awan dan asap, melengkapi citra optik saat musim hujan. Metode: median hamburan balik VH Sentinel-1 (RTC, 20 m) 36 hari terakhir dibanding musim yang sama tahun lalu pada orbit yang sama; ditandai bila turun ≥ 3 dB dan ≥ 2 dB di setiap citra terkini, di hutan acuan Hansen, ≥ 1 ha. Ini INDIKASI (tebangan, pembukaan, kebakaran, atau genangan) – perlu cek lapangan.', 'Radar sees through clouds and haze, complementing optical imagery in the rainy season. Method: median Sentinel-1 VH backscatter (RTC, 20 m) of the last 36 days vs the same season last year on the same orbit; flagged when it drops ≥ 3 dB and ≥ 2 dB in every current image, within Hansen reference forest, ≥ 1 ha. These are INDICATIONS (logging, clearing, fire or flooding) – check in the field.')}</p>`; }
function hutan() {
  const p = perlu(); if (!p) return; pakai('whutan');
  const r = p.hutan, fc = p.hutan_geo;
  if (!r) return halaman(I('Perubahan hutan', 'Forest change'), p.site.hd_nama, kartu(I('Sedang disiapkan', 'Being prepared'), `<p>${I('Pemeriksaan citra Sentinel-2 dijalankan otomatis sepekan sekali; hasil pertama muncul pada putaran analisis berikutnya. Metode memakai hutan acuan Hansen.', 'The Sentinel-2 check runs automatically once a week; the first result appears in a coming analysis run. Uses Hansen reference forest.')}</p>`) + radarHtml(p), () => ikatRadar(p));
  const st = r.status === 'selesai';
  halaman(I('Perubahan hutan', 'Forest change'), p.site.hd_nama,
    kartu(st ? I(`Pemeriksaan ${tgl(r.dicek_utc)}`, `Check of ${tgl(r.dicek_utc)}`) : I('Status pemeriksaan', 'Check status'), st ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
        <div><small class="muted">${I('Indikasi bukaan BARU', 'NEW clearing indications')}</small><br><b style="font-size:20px;color:${r.luas_baru_ha >= 1 ? '#B91C1C' : 'inherit'}">${nf(r.luas_baru_ha, 1)} ha</b><small class="muted"> · ${nf(r.petak_baru)} ${I('petak', 'patches')}</small></div>
        <div><small class="muted">${I('Seluruh indikasi 90 hari', 'All indications, 90 days')}</small><br><b style="font-size:20px">${nf(r.luas_berubah_ha, 1)} ha</b><small class="muted"> · ${nf(r.jumlah_petak)} ${I('petak', 'patches')}</small></div>
        <div><small class="muted">${I('Hutan acuan', 'Reference forest')}</small><br><b style="font-size:20px">${nf(r.hutan_acuan_ha)} ha</b></div>
        <div><small class="muted">${I('Wilayah cerah', 'Cloud-free')}</small><br><b style="font-size:20px">${nf(r.cerah_persen)}%</b></div></div>
      <p class="fa-note">${I(`Citra terkini ${esc((r.tanggal_terkini || []).join(', '))} dibanding ${esc((r.tanggal_acuan || []).join(', '))} (musim yang sama tahun lalu).`, `Current imagery ${esc((r.tanggal_terkini || []).join(', '))} vs ${esc((r.tanggal_acuan || []).join(', '))} (same season last year).`)}</p>
      <div class="wa-btns"><button class="btn pri tap" id="waHP">${I('Lihat petak di peta', 'Show patches on map')}</button></div>` : `<p>${esc(r.status)}${r.status === 'tertutup awan' ? I(' – wilayah tertutup awan; dicoba lagi besok.', ' – area cloud-covered; retried tomorrow.') : ''}</p>`) +
    `<p class="fa-note">${I('Metode: hutan acuan = tutupan tajuk 2000 ≥ 30 % yang belum hilang s.d. 2025 (Hansen/UMD GFC v1.13). Petak berubah bila NBR turun ≥ 0,27 dan SWIR2 naik ≥ 0,02 di ≥ 2 citra Sentinel-2 (20 m), ≥ 0,5 ha. Ini INDIKASI (pembukaan lahan, tebangan, kebakaran, longsor) yang perlu dicek di lapangan. Merah = petak baru sejak pemeriksaan sebelumnya.', 'Method: reference forest = 2000 canopy cover ≥ 30 % not lost by 2025 (Hansen/UMD GFC v1.13). A patch changes when NBR drops ≥ 0.27 and SWIR2 rises ≥ 0.02 in ≥ 2 Sentinel-2 images (20 m), ≥ 0.5 ha. These are INDICATIONS (clearing, logging, fire, landslide) to be checked in the field. Red = new since the previous check.')}</p>` + radarHtml(p),
    () => { ikatRadar(p);
      const b = document.getElementById('waHP'); if (b) b.onclick = () => kePeta('hutan', fc, f => f.properties.baru ? { color: '#DC2626', weight: 2.5, fillColor: '#EF4444', fillOpacity: .6 } : { color: '#FF2EBD', weight: 1.5, fillColor: '#FF2EBD', fillOpacity: .45 },
      q => openSheet(`<h3>${I('Indikasi perubahan hutan', 'Forest change indication')}</h3><p class="sub">${esc(p.site.hd_nama)}</p><dl class="kv"><dt>${I('Luas petak', 'Patch area')}</dt><dd>${nf(q.luas_ha, 2)} ha</dd><dt>${I('Pertama terdeteksi', 'First detected')}</dt><dd>${esc(q.pertama_terdeteksi || '')}${q.baru ? ' · <b style="color:#DC2626">' + I('baru', 'new') + '</b>' : ''}</dd><dt>${I('Periode', 'Period')}</dt><dd>${esc(q.periode)}</dd><dt>${I('Dibanding', 'Compared with')}</dt><dd>${esc(q.dibanding)}</dd></dl><p class="small muted">${I('Indikasi dari citra Sentinel-2; perlu verifikasi lapangan.', 'Indication from Sentinel-2; needs field verification.')}</p>`)); });
}
function bekas() {
  const p = perlu(); if (!p) return; pakai('wbekas');
  const B = p.bekas_s2, fc = p.bekas_s2_geo, M = Object.entries((B || {}).musim || {}).sort((a, b) => a[0] < b[0] ? 1 : -1);
  if (!B) return halaman(I('Bekas terbakar (Sentinel-2)', 'Burned area (Sentinel-2)'), p.site.hd_nama, kartu(I('Sedang disiapkan', 'Being prepared'), `<p>${I('Analisis citra per musim api dijalankan otomatis; hasil muncul bertahap.', 'Per-season imagery analysis runs automatically; results appear gradually.')}</p>`));
  const C = { 'rendah–sedang': '#FFB000', 'sedang–tinggi': '#FF6A00', 'tinggi': '#D7191C' };
  halaman(I('Bekas terbakar (Sentinel-2)', 'Burned area (Sentinel-2)'), p.site.hd_nama,
    kartu(I('Per musim api (titik panas ≤ 5 km, sejak 2023)', 'Per fire season (hotspots ≤ 5 km, since 2023)'), M.length ? `<div class="wa-wrap"><table class="wa-tb"><tr><th>${I('Musim', 'Season')}</th><th>${I('Status', 'Status')}</th><th>${I('Luas', 'Area')}</th><th>${I('Tinggi', 'High')}</th></tr>${M.map(([k, r]) => `<tr><td>${esc(r.awal)} – ${esc(r.akhir)}</td><td style="text-align:left">${esc(r.status)}</td><td>${r.status === 'selesai' ? nf(r.luas_ha, 1) + ' ha' : '–'}</td><td>${r.status === 'selesai' ? nf(r.luas_tinggi_ha, 1) + ' ha' : '–'}</td></tr>`).join('')}</table></div>
      <div class="wa-btns"><button class="btn pri tap" id="waBP">${I('Lihat poligon di peta', 'Show polygons on map')}</button></div>` : `<p>${I('Belum ada musim api dengan titik panas ≤ 5 km sejak 2023.', 'No fire season with hotspots ≤ 5 km since 2023.')}</p>`) +
    `<p class="fa-note">${I('Metode: komposit Sentinel-2 L2A sebelum (75 hari) dan sesudah api (3–45 hari); dNBR ≥ 0,27 (Key & Benson 2006), SWIR2 naik ≥ 0,02, konsisten di ≥ 2 citra, ≤ 1 km dari deteksi NASA FIRMS, ≥ 0,5 ha. Keparahan: rendah–sedang < 0,44 · sedang–tinggi < 0,66 · tinggi ≥ 0,66. Indikasi dari citra; perlu verifikasi lapangan.', 'Method: Sentinel-2 L2A composites before (75 days) and after the fire (3–45 days); dNBR ≥ 0.27 (Key & Benson 2006), SWIR2 rise ≥ 0.02, consistent in ≥ 2 images, ≤ 1 km from NASA FIRMS detections, ≥ 0.5 ha. Severity: low–moderate < 0.44 · moderate–high < 0.66 · high ≥ 0.66. Image-based indication; needs field verification.')}</p>`,
    () => { const b = document.getElementById('waBP'); if (b) b.onclick = () => kePeta('bekas', fc, f => ({ color: C[f.properties.keparahan] || '#FF6A00', weight: 1, fillOpacity: .55, fillColor: C[f.properties.keparahan] || '#FF6A00' }),
      q => openSheet(`<h3>${I('Bekas terbakar', 'Burned area')}</h3><p class="sub">${esc(p.site.hd_nama)}</p><dl class="kv"><dt>${I('Luas petak', 'Patch area')}</dt><dd>${nf(q.luas_ha, 2)} ha</dd><dt>${I('Keparahan (dNBR)', 'Severity (dNBR)')}</dt><dd>${esc(q.keparahan)}</dd><dt>${I('Musim api', 'Fire season')}</dt><dd>${esc(q.awal_api)} – ${esc(q.akhir_api)}</dd></dl><p class="small muted">${I('Indikasi dari citra Sentinel-2; perlu verifikasi lapangan.', 'Indication from Sentinel-2; needs field verification.')}</p>`)); });
}
const API = { menu, laporan, riwayat, ekspor, luring, banding, profil, hutan, bekas };
window.FHWilAlat = API;
})();
