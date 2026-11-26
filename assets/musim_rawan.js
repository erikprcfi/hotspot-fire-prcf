/* Pantau Rimbak – KALENDER MUSIM API, TITIK RAWAN BERULANG & RENCANA PATROLI OTOMATIS (per Hutan Desa)
 * Data: data/musim/indeks.json & data/rawan/<lokasi>.geojson (scripts/musim_rawan.py, arsip NASA FIRMS 2016–2025),
 *       titik panas terbaru (FHAll), peringatan perubahan hutan Sentinel-2 (data/hutan/peringatan.geojson).
 * Khusus akun Hutan Desa dampingan & admin (FHAksesHD); mode umum/SHP mendapat penjelasan.
 */
(function () {
'use strict';
const X = () => window.FHAlat, EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const BLN = () => EN() ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const KAT = { puncak: ['#B91C1C', 'Puncak', 'Peak'], tinggi: ['#EA580C', 'Tinggi', 'High'], sedang: ['#CA8A04', 'Sedang', 'Moderate'], rendah: ['#16A34A', 'Rendah', 'Low'] };
const getJ = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
function css() {
  if (document.getElementById('mr-css')) return; const s = document.createElement('style'); s.id = 'mr-css';
  s.textContent = '.mr-hero{border-radius:18px;padding:14px 16px;background:linear-gradient(135deg,#0B3B2C,#1E7A58);color:#fff}.mr-hero b{font-size:17px}.mr-hero p{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:#D6EADF}' +
    '.mr-row{display:grid;grid-template-columns:78px 1fr 64px;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line,#eee);font-size:12.5px}.mr-row.ini{background:rgba(30,122,88,.10);border-radius:10px;padding:6px}' +
    '.mr-bar{height:16px;border-radius:6px;min-width:3px}.mr-row small{display:block;color:var(--muted,#667);font-size:11.5px}.mr-tag{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:800;color:#fff}' +
    '.mr-li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line,#eee)}.mr-li:first-child{border-top:0}.mr-no{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:12px;color:#fff}' +
    '.mr-li .m{flex:1;min-width:0}.mr-li .m b{display:block;font-size:13.5px}.mr-li .m small{display:block;color:var(--muted,#667);font-size:12px;line-height:1.4}.mr-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
    '.mr-chk{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.mr-chk label{display:flex;gap:6px;align-items:center;padding:8px 10px;border:1px solid var(--line,#ddd);border-radius:12px;font-size:13px;font-weight:600}';
  document.head.appendChild(s);
}
/* situs aktif: Hutan Desa (kode HD/admin) atau wilayah SHP pengguna yang sudah dianalisis otomatis (assets/wilayah_umum.js) */
const situs = () => (window.FHAksesHD && FHAksesHD() && window.FHSiteObj && FHSiteObj()) || (window.FHWilSaya && FHWilSaya.aktif() ? FHWilSaya.site() : null);
function hanyaHD(judul) {
  if (situs()) return false;
  openPage(judul, I('Khusus Hutan Desa dampingan', 'Partner village forests only'), `<div class="fa"><div class="fa-card"><p>${I('Alat ini memakai arsip titik panas 2016–2025 di sekitar Hutan Desa dampingan PRCF. Untuk wilayah Anda sendiri gunakan menu <b>Analisis lahan & karbon</b> (unggah SHP).', 'This tool uses the 2016–2025 hotspot archive around PRCF partner village forests. For your own area use <b>Land & carbon analysis</b> (upload a shapefile).')}</p></div></div>`);
  return true;
}

/* ================= 1. KALENDER MUSIM API ================= */
async function kalender() {
  css(); const J0 = I('Kalender musim api', 'Fire-season calendar'); if (hanyaHD(J0)) return; const s = situs();
  try { X() && X().pakai && X().pakai('musimapi'); } catch (e) { }
  openPage(J0, s.hd_nama, `<div class="fa" id="mrW"><div class="fa-card"><p class="fa-note">${I('Memuat…', 'Loading…')}</p></div></div>`, async () => {
    const w = document.getElementById('mrW'); let D;
    try { D = await getJ('data/musim/indeks.json'); } catch (e) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Data kalender belum dapat dimuat. Coba lagi saat ada sinyal.', 'Calendar data could not be loaded. Try again when online.')}</p></div>`; return; }
    const M = D.lokasi && D.lokasi[s.id]; if (!M) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Belum ada data untuk Hutan Desa ini.', 'No data for this village forest yet.')}</p></div>`; return; }
    const B = BLN(), now = new Date(Date.now() + 7 * 36e5), m0 = now.getUTCMonth() + 1, bl = M.bulan[m0 - 1];
    const musimTxt = M.musim.length ? M.musim.map(m => B[m - 1]).join(', ') : I('tidak ada bulan menonjol', 'no prominent month');
    const maks = Math.max(...M.bulan.map(b => b.rata25), 1), kat = k => KAT[k] || KAT.rendah;
    const statusIni = M.musim.includes(m0) ? I(`<b>${B[m0 - 1]} termasuk musim api.</b> Lakukan patroli rutin, pantau Peringatan dini, dan jangan membakar lahan.`, `<b>${B[m0 - 1]} is fire season.</b> Patrol regularly, follow early warnings and avoid burning.`)
      : M.mulai_bersiap === m0 ? I(`<b>Musim api dimulai bulan depan.</b> Bulan ini waktunya menyiapkan peralatan, regu, dan sosialisasi larangan membakar.`, `<b>Fire season starts next month.</b> Prepare equipment, crews and burning-ban outreach this month.`)
      : I(`${B[m0 - 1]} biasanya bukan musim api (peluang titik panas ≤ 5 km: ${bl.peluang5}% tahun). Tetap pantau Peringatan dini.`, `${B[m0 - 1]} is usually not fire season (chance of a hotspot ≤ 5 km: ${bl.peluang5}% of years). Keep following early warnings.`);
    w.innerHTML = `<div class="mr-hero"><b>${I('Musim api', 'Fire season')}: ${esc(musimTxt)}</b><p>${I('Puncak', 'Peak')}: <b style="color:#fff">${B[M.puncak - 1]}</b> · ${I('mulai bersiap', 'start preparing')}: <b style="color:#fff">${M.mulai_bersiap ? B[M.mulai_bersiap - 1] : '–'}</b><br>${statusIni}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('Rata-rata deteksi titik panas ≤ 25 km per bulan', 'Average hotspot detections ≤ 25 km per month')} (${D.tahun[0]}–${D.tahun[1]})</h4>
      <p class="fa-note" style="margin:0 0 6px">${I('Angka kanan: rata-rata per tahun. Peluang = persen tahun dengan ≥ 1 deteksi.', 'Right: average per year. Chance = % of years with ≥ 1 detection.')}</p>
      ${M.bulan.map(b => `<div class="mr-row${b.bulan === m0 ? ' ini' : ''}"><div><b>${B[b.bulan - 1].slice(0, EN() ? 3 : 3)}</b> <span class="mr-tag" style="background:${kat(b.kategori)[0]}">${EN() ? kat(b.kategori)[2] : kat(b.kategori)[1]}</span></div>
        <div><div class="mr-bar" style="width:${Math.max(2, b.rata25 / maks * 100)}%;background:${kat(b.kategori)[0]}"></div><small>${I('peluang', 'chance')} ≤ 25 km ${b.peluang25}% · ≤ 5 km ${b.peluang5}% · ${I('hujan normal', 'normal rain')} ${nf(b.hujan_normal)} mm${b.tahun_ini != null ? ` · ${now.getUTCFullYear()}: ${nf(b.tahun_ini)}` : ''}</small></div>
        <div style="text-align:right"><b>${nf(b.rata25, 1)}</b><small>${I('maks', 'max')} ${nf(b.maks25)}${b.tahun_maks ? ` (${b.tahun_maks})` : ''}</small></div></div>`).join('')}</div>
      <div class="fa-card"><h4 style="margin:0 0 6px">${I('Persiapan yang disarankan', 'Suggested preparation')}</h4>
      <div class="mr-li"><span class="mr-no" style="background:#CA8A04">1</span><span class="m"><b>${M.mulai_bersiap ? B[M.mulai_bersiap - 1] : '–'} · ${I('bersiap', 'prepare')}</b><small>${I('Periksa alat pemadam & pompa, susun jadwal patroli, sosialisasi larangan membakar ke warga.', 'Check pumps & fire tools, set the patrol schedule, outreach on the burning ban.')}</small></span></div>
      <div class="mr-li"><span class="mr-no" style="background:#B91C1C">2</span><span class="m"><b>${esc(musimTxt)} · ${I('musim api', 'fire season')}</b><small>${I('Patroli rutin terutama ke titik rawan berulang, aktifkan Peringatan dini, laporkan kejadian lewat aplikasi.', 'Regular patrols especially to recurring hotspot sites, enable early warnings, report incidents in the app.')}</small></span></div>
      <div class="mr-li"><span class="mr-no" style="background:#16A34A">3</span><span class="m"><b>${I('Setelah musim', 'After the season')}</b><small>${I('Evaluasi kejadian & bekas terbakar, perbaiki alat, catat pelajaran untuk tahun berikutnya.', 'Review incidents & burn scars, repair equipment, record lessons for next year.')}</small></span></div>
      <div class="mr-act"><button class="fa-btn" data-k="rawan">${I('Lihat titik rawan berulang', 'Recurring hotspot sites')}</button><button class="fa-btn" data-k="rencana">${I('Buat rencana patroli', 'Make a patrol plan')}</button></div></div>
      <p class="fa-note">${esc(D.metode)} ${I('Kategori menurut porsi rata-rata tahunan: puncak ≥ 15%, tinggi ≥ 8%, sedang ≥ 3%.', 'Category by share of the annual average: peak ≥ 15%, high ≥ 8%, moderate ≥ 3%.')}</p>`;
    w.querySelectorAll('[data-k]').forEach(b => b.onclick = () => (b.dataset.k === 'rawan' ? rawan() : rencana()));
  });
}

/* ================= 2. TITIK RAWAN BERULANG ================= */
let LAPIS = null;
const warnaR = n => n >= 6 ? '#B91C1C' : n >= 4 ? '#EA580C' : '#EAB308';
function lapisPeta(gj, tampil) {
  const MAP = window.FHApp && FHApp.map && FHApp.map(); if (!MAP || !window.L) return;
  if (LAPIS) { MAP.removeLayer(LAPIS); LAPIS = null; }
  if (!tampil) return;
  LAPIS = L.geoJSON(gj, { style: f => ({ color: warnaR(f.properties.n_tahun), weight: 1.2, fillColor: warnaR(f.properties.n_tahun), fillOpacity: .45 }),
    onEachFeature: (f, l) => { const p = f.properties; l.bindPopup(`<b>${I('Rawan', 'Recurring')} #${p.peringkat}</b><br>${I('Terbakar', 'Burned')} ${p.n_tahun} ${I('tahun', 'years')}: ${p.tahun.join(', ')}<br>${esc(p.lokasi)} · ${I('terakhir', 'last')} ${esc(p.terakhir)}`); } }).addTo(MAP);
}
async function rawan() {
  css(); const J0 = I('Titik rawan berulang', 'Recurring hotspot sites'); if (hanyaHD(J0)) return; const s = situs();
  try { X() && X().pakai && X().pakai('rawan'); } catch (e) { }
  openPage(J0, s.hd_nama, `<div class="fa" id="mrW"><div class="fa-card"><p class="fa-note">${I('Memuat…', 'Loading…')}</p></div></div>`, async () => {
    const w = document.getElementById('mrW'); let G;
    try { G = await getJ(`data/rawan/${encodeURIComponent(s.id)}.geojson`); } catch (e) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Data titik rawan belum dapat dimuat. Coba lagi saat ada sinyal.', 'Could not load data. Try again when online.')}</p></div>`; return; }
    const F = G.features || [], dekat = F.filter(f => f.properties.jarak_km <= 5);
    w.innerHTML = `<div class="mr-hero"><b>${nf(F.length)} ${I('lokasi terbakar berulang', 'recurring burn sites')}</b><p>${I(`Sel ± 1 km dalam radius 25 km yang memiliki titik panas pada ≥ 3 tahun berbeda (2016–2025). <b style="color:#fff">${nf(dekat.length)}</b> di antaranya di dalam wilayah atau ≤ 5 km dari batas – prioritas patroli.`, `±1 km cells within 25 km with hotspots in ≥ 3 different years (2016–2025). <b style="color:#fff">${nf(dekat.length)}</b> are inside or ≤ 5 km from the boundary – patrol priority.`)}</p></div>
      <div class="fa-card"><div class="mr-act" style="margin:0 0 8px"><button class="fa-btn pri" style="--c:#B91C1C" data-peta>${I('Tampilkan di peta', 'Show on map')}</button><button class="fa-btn" data-rencana>${I('Buat rencana patroli', 'Make a patrol plan')}</button></div>
      <p class="fa-note" style="margin:0 0 4px">${I('Warna: kuning 3 tahun · oranye 4–5 tahun · merah ≥ 6 tahun. Ketuk untuk melihat di peta.', 'Colour: yellow 3 years · orange 4–5 · red ≥ 6. Tap to view on the map.')}</p>
      ${(dekat.length ? dekat : F).slice(0, 25).map(f => { const p = f.properties; return `<div class="mr-li" data-la="${p.pusat[0]}" data-lo="${p.pusat[1]}" style="cursor:pointer"><span class="mr-no" style="background:${warnaR(p.n_tahun)}">${p.n_tahun}</span><span class="m"><b>${esc(p.lokasi)}</b><small>${I('Terbakar', 'Burned')}: ${p.tahun.join(', ')} · ${nf(p.deteksi)} ${I('deteksi', 'detections')} · ${I('terakhir', 'last')} ${esc(p.terakhir)}<br>${p.pusat[0].toFixed(5)}, ${p.pusat[1].toFixed(5)}</small></span></div>`; }).join('') || `<p class="fa-note">${I('Tidak ada lokasi berulang.', 'No recurring sites.')}</p>`}
      ${dekat.length && F.length > dekat.length ? `<p class="fa-note">${I(`Ditampilkan ${Math.min(25, dekat.length)} lokasi terdekat; ${nf(F.length - dekat.length)} lokasi lain berada 5–25 km (lihat di peta).`, `Showing the ${Math.min(25, dekat.length)} nearest; ${nf(F.length - dekat.length)} more are 5–25 km away (see map).`)}</p>` : ''}</div>
      <p class="fa-note">${I('Lokasi titik panas memiliki ketidakpastian ± 375 m (VIIRS) sampai ± 1 km (MODIS). Lokasi rawan perlu dicek lapangan.', 'Hotspot positions are uncertain by ± 375 m (VIIRS) to ± 1 km (MODIS). Verify sites in the field.')}</p>`;
    w.querySelector('[data-peta]').onclick = () => { lapisPeta(G, true); try { FHApp.closeAll(); } catch (e) { } FHApp.go('home'); setTimeout(() => { try { const b = L.geoJSON({ type: 'FeatureCollection', features: dekat.length ? dekat : F }).getBounds(); FHApp.map().invalidateSize(); FHApp.map().fitBounds(b, { padding: [30, 30] }); } catch (e) { } }, 350); };
    w.querySelector('[data-rencana]').onclick = () => rencana();
    w.querySelectorAll('[data-la]').forEach(el => el.onclick = () => { lapisPeta(G, true); try { FHApp.closeAll(); } catch (e) { } FHApp.go('home'); setTimeout(() => { FHApp.map().invalidateSize(); FHApp.lihat(+el.dataset.la, +el.dataset.lo, 14); }, 350); });
  });
}

/* ================= 3. RENCANA PATROLI OTOMATIS ================= */
const R = 6371;
function jarak(a, b) { const t = x => x * Math.PI / 180, d1 = t(b[0] - a[0]), d2 = t(b[1] - a[1]); const h = Math.sin(d1 / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(d2 / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function arah(a, b) { const t = x => x * Math.PI / 180, y = Math.sin(t(b[1] - a[1])) * Math.cos(t(b[0])), x = Math.cos(t(a[0])) * Math.sin(t(b[0])) - Math.sin(t(a[0])) * Math.cos(t(b[0])) * Math.cos(t(b[1] - a[1])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
const MATA = () => EN() ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['U', 'TL', 'T', 'Tg', 'S', 'BD', 'B', 'BL'];
const JENIS = { titik: ['#DC2626', 'Titik panas baru', 'New hotspot'], hutan: ['#DB2777', 'Indikasi bukaan hutan', 'Forest clearing indication'], rawan: ['#EA580C', 'Titik rawan berulang', 'Recurring hotspot site'] };
const xe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function centroid(g) { const r = (g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : [g.coordinates]); let a = 0, b = 0; r.forEach(p => { a += p[1]; b += p[0]; }); return [a / r.length, b / r.length]; }
async function kumpulTarget(s, pakai) {
  const W = !(window.FHAksesHD && FHAksesHD()) && window.FHWilSaya && FHWilSaya.aktif();   // wilayah SHP: titik panas dari paket analisis wilayah itu sendiri
  const T = [], si = W ? 0 : window.FHSiteIdx ? FHSiteIdx() : 0, now = Date.now();
  if (pakai.titik) {   // titik panas 7 hari terakhir di dalam wilayah / <= 5 km, digabung bila berjarak < 400 m
    const P = (W ? FHWilSaya.titik() : window.FHAll ? FHAll() : []).filter(p => p.ls && p.ls[si] != null && p.ls[si] <= 5 && now - p.when < 7 * 864e5).sort((a, b) => b.when - a.when);
    for (const p of P) { if (T.some(t => t.jenis === 'titik' && jarak(t.pos, [p.la, p.lo]) < 0.4)) continue;
      T.push({ jenis: 'titik', pos: [p.la, p.lo], ket: `${p.d} ${String(p.t).slice(0, 2)}.${String(p.t).slice(2)} UTC · ${p.ins || ''} ${p.sat || ''} · ${p.ls[si] <= 0 ? I('di dalam wilayah', 'inside the area') : nf(p.ls[si], 1) + ' km ' + I('dari batas', 'from boundary')}` }); }
  }
  if (pakai.hutan) {
    try { const G = await getJ('data/hutan/peringatan.geojson');
      (G.features || []).filter(f => f.properties.lokasi === s.id).sort((a, b) => (b.properties.baru ? 1 : 0) - (a.properties.baru ? 1 : 0) || b.properties.luas_ha - a.properties.luas_ha).slice(0, 15)
        .forEach(f => T.push({ jenis: 'hutan', pos: centroid(f.geometry), ket: `${nf(f.properties.luas_ha, 1)} ha${f.properties.di_hutan_desa ? ' · ' + I('di dalam Hutan Desa', 'inside the village forest') : ''}${f.properties.baru ? ' · ' + I('BARU', 'NEW') : ''}${f.properties.pertama_terdeteksi ? ' · ' + I('sejak', 'since') + ' ' + f.properties.pertama_terdeteksi : ''}` })); } catch (e) { }
  }
  if (pakai.rawan) {
    try { const G = await getJ(`data/rawan/${encodeURIComponent(s.id)}.geojson`);
      (G.features || []).filter(f => f.properties.jarak_km <= 5).slice(0, 15).forEach(f => T.push({ jenis: 'rawan', pos: f.properties.pusat, ket: `${I('terbakar', 'burned')} ${f.properties.n_tahun} ${I('tahun', 'years')} (${f.properties.tahun.slice(-3).join(', ')}…) · ${f.properties.lokasi}` })); } catch (e) { }
  }
  return T;
}
function urutkan(awal, T, maks) {   // tetangga terdekat dari titik awal (garis lurus)
  const sisa = T.slice(), out = []; let cur = awal, tot = 0;
  while (sisa.length && out.length < maks) { let bi = 0, bd = Infinity; sisa.forEach((t, i) => { const d = jarak(cur, t.pos); if (d < bd) { bd = d; bi = i; } });
    const t = sisa.splice(bi, 1)[0]; t.dari = bd; t.arah = arah(cur, t.pos); tot += bd; out.push(t); cur = t.pos; }
  return { urut: out, total: tot };
}
function gpx(nama, awal, U) {
  const w = U.map((t, i) => `<wpt lat="${t.pos[0].toFixed(6)}" lon="${t.pos[1].toFixed(6)}"><name>${i + 1}. ${xe(EN() ? JENIS[t.jenis][2] : JENIS[t.jenis][1])}</name><desc>${xe(t.ket)}</desc><sym>Flag, Red</sym></wpt>`).join('\n');
  const r = [`<rtept lat="${awal[0].toFixed(6)}" lon="${awal[1].toFixed(6)}"><name>${xe(I('Mulai', 'Start'))}</name></rtept>`].concat(U.map((t, i) => `<rtept lat="${t.pos[0].toFixed(6)}" lon="${t.pos[1].toFixed(6)}"><name>${i + 1}</name></rtept>`)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Pantau Rimbak – Yayasan PRCF Indonesia" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${xe(nama)}</name><time>${new Date().toISOString()}</time></metadata>\n${w}\n<rte><name>${xe(nama)}</name>${r}</rte>\n</gpx>`;
}
function kml(nama, awal, U) {
  const W = { titik: 'ff2626dc', hutan: 'ff7727db', rawan: 'ff0c58ea' };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xe(nama)}</name><description>Pantau Rimbak – Yayasan PRCF Indonesia</description>` +
    Object.entries(W).map(([k, c]) => `<Style id="${k}"><IconStyle><color>${c}</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`).join('') +
    '<Style id="rute"><LineStyle><color>ff2563eb</color><width>3</width></LineStyle></Style>' +
    U.map((t, i) => `<Placemark><name>${i + 1}. ${xe(EN() ? JENIS[t.jenis][2] : JENIS[t.jenis][1])}</name><styleUrl>#${t.jenis}</styleUrl><description>${xe(t.ket)}</description><Point><coordinates>${t.pos[1]},${t.pos[0]},0</coordinates></Point></Placemark>`).join('') +
    `<Placemark><name>${xe(I('Urutan kunjungan (garis lurus)', 'Visit order (straight line)'))}</name><styleUrl>#rute</styleUrl><LineString><tessellate>1</tessellate><coordinates>${[awal].concat(U.map(t => t.pos)).map(p => `${p[1]},${p[0]},0`).join(' ')}</coordinates></LineString></Placemark></Document></kml>`;
}
const posisiSaya = () => new Promise(res => { if (!navigator.geolocation) return res(null); const t = setTimeout(() => res(null), 7000);
  navigator.geolocation.getCurrentPosition(p => { clearTimeout(t); res([p.coords.latitude, p.coords.longitude]); }, () => { clearTimeout(t); res(null); }, { enableHighAccuracy: true, timeout: 6500, maximumAge: 120000 }); });
async function rencana() {
  css(); const J0 = I('Rencana patroli', 'Patrol plan'); if (hanyaHD(J0)) return; const s = situs();
  try { X() && X().pakai && X().pakai('rencana'); } catch (e) { }
  openPage(J0, s.hd_nama + I(' · disusun otomatis', ' · generated automatically'), `<div class="fa" id="mrW">
    <div class="fa-card"><h4 style="margin:0 0 4px">${I('Sasaran yang dimasukkan', 'Targets to include')}</h4>
    <div class="mr-chk"><label><input type="checkbox" data-p="titik" checked> ${I('Titik panas 7 hari (≤ 5 km)', 'Hotspots 7 days (≤ 5 km)')}</label><label><input type="checkbox" data-p="hutan" checked> ${I('Indikasi bukaan hutan', 'Forest clearing')}</label><label><input type="checkbox" data-p="rawan" checked> ${I('Titik rawan berulang (≤ 5 km)', 'Recurring sites (≤ 5 km)')}</label></div>
    <div class="mr-chk"><label>${I('Titik awal', 'Start')}: <select data-awal><option value="gps">${I('Posisi saya (GPS)', 'My position (GPS)')}</option><option value="desa">${I('Pusat desa', 'Village centre')}</option></select></label>
    <label>${I('Maks.', 'Max')} <select data-maks><option>10</option><option selected>15</option><option>25</option></select> ${I('titik', 'points')}</label></div>
    <button class="fa-btn pri" style="--c:#0B3B2C;width:100%" data-buat>${I('Susun rencana', 'Build plan')}</button></div><div id="mrHasil"></div></div>`, () => {
    const w = document.getElementById('mrW'), H = document.getElementById('mrHasil');
    w.querySelector('[data-buat]').onclick = async () => {
      const pakai = {}; w.querySelectorAll('[data-p]').forEach(c => pakai[c.dataset.p] = c.checked);
      H.innerHTML = `<div class="fa-card"><p class="fa-note">${I('Menyusun rencana…', 'Building plan…')}</p></div>`;
      let awal = null, ket = I('pusat desa', 'village centre');
      if (w.querySelector('[data-awal]').value === 'gps') { awal = await posisiSaya(); if (awal) ket = I('posisi Anda', 'your position'); }
      if (!awal) awal = (s.pusat_wilayah || s.pusat).slice(0, 2);
      const T = await kumpulTarget(s, pakai);
      if (!T.length) { H.innerHTML = `<div class="fa-card"><p>${I('Tidak ada sasaran untuk kategori yang dipilih saat ini – tidak ada titik panas baru ≤ 5 km dan tidak ada indikasi perubahan hutan. Pertimbangkan patroli rutin ke titik rawan berulang.', 'No targets for the selected categories right now. Consider a routine patrol to recurring sites.')}</p></div>`; return; }
      const { urut: U, total } = urutkan(awal, T, +w.querySelector('[data-maks]').value), M = MATA();
      const nama = `${I('Rencana patroli', 'Patrol plan')} ${s.hd_nama} ${new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10)}`;
      H.innerHTML = `<div class="fa-card"><h4 style="margin:0 0 2px">${nf(U.length)} ${I('titik tujuan', 'destinations')} · ± ${nf(total, 1)} km ${I('garis lurus', 'straight line')}</h4>
        <p class="fa-note" style="margin:0 0 6px">${I(`Mulai dari ${ket}; diurutkan dari yang terdekat. Jarak sebenarnya lebih jauh mengikuti jalan, sungai, dan medan.`, `Starting from ${ket}; ordered nearest-first. Real distance is longer along roads, rivers and terrain.`)}</p>
        ${U.map((t, i) => `<div class="mr-li"><span class="mr-no" style="background:${JENIS[t.jenis][0]}">${i + 1}</span><span class="m"><b>${EN() ? JENIS[t.jenis][2] : JENIS[t.jenis][1]}</b><small>${esc(t.ket)}<br>${nf(t.dari, 1)} km ${I('arah', 'heading')} ${M[Math.round(t.arah / 45) % 8]} (${Math.round(t.arah)}°) ${I('dari titik sebelumnya', 'from previous point')} · ${t.pos[0].toFixed(5)}, ${t.pos[1].toFixed(5)}</small></span>
          <button class="fa-btn" style="min-height:36px;padding:0 10px" data-i="${i}">${I('Arah', 'Go')}</button></div>`).join('')}
        <div class="mr-act"><button class="fa-btn pri" style="--c:#2563EB" data-x="gpx">GPX</button><button class="fa-btn pri" style="--c:#7C3AED" data-x="kml">KML</button><button class="fa-btn" data-x="peta">${I('Lihat di peta', 'View on map')}</button></div>
        <div id="mrKompas"></div></div>`;
      const fnm = nama.replace(/[^\w.-]+/g, '_');
      H.querySelector('[data-x="gpx"]').onclick = () => X().dl(new Blob([gpx(nama, awal, U)], { type: 'application/gpx+xml' }), fnm + '.gpx');
      H.querySelector('[data-x="kml"]').onclick = () => X().dl(new Blob([kml(nama, awal, U)], { type: 'application/vnd.google-earth.kml+xml' }), fnm + '.kml');
      H.querySelector('[data-x="peta"]').onclick = () => { const MAP = FHApp.map(); try { FHApp.closeAll(); } catch (e) { } FHApp.go('home');
        setTimeout(() => { MAP.invalidateSize(); if (window._mrRute) MAP.removeLayer(window._mrRute); window._mrRute = L.layerGroup([L.polyline([awal].concat(U.map(t => t.pos)), { color: '#2563EB', weight: 3, dashArray: '6 6' }),
          ...U.map((t, i) => L.circleMarker(t.pos, { radius: 9, color: '#fff', weight: 2, fillColor: JENIS[t.jenis][0], fillOpacity: 1 }).bindTooltip(String(i + 1), { permanent: true, direction: 'center', className: 'mr-tt' }))]).addTo(MAP);
          MAP.fitBounds(L.latLngBounds([awal].concat(U.map(t => t.pos))), { padding: [40, 40] }); }, 350); };
      H.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const t = U[+b.dataset.i], k = document.getElementById('mrKompas');
        if (window.FHKompas) { try { window._mrK && window._mrK.destroy && window._mrK.destroy(); } catch (e) { } window._mrK = FHKompas.mount(k, { target: { lat: t.pos[0], lon: t.pos[1], label: (+b.dataset.i + 1) + '. ' + (EN() ? JENIS[t.jenis][2] : JENIS[t.jenis][1]) } }); k.scrollIntoView({ behavior: 'smooth' }); } });
    };
  });
}
window.FHMusimRawan = { kalender, rawan, rencana, gpx, kml, urutkan, jarak };
})();
