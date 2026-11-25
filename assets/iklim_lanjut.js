/* Pantau Rimbak – IKLIM, KESIAGAAN, BANJIR, ASAP, ARSIP AREA TERBAKAR, VEGETASI & REKAP MUSIM API (per Hutan Desa)
 * Data (dibuat otomatis tiap 3 jam / sekali sehari di GitHub Actions):
 *   data/iklim/indeks.json      – scripts/iklim.py      (ENSO NOAA, hari tanpa hujan, kelembapan tanah ERA5-Land, prakiraan musim api, Indeks Siaga Desa)
 *   data/banjir/indeks.json     – scripts/banjir.py     (GloFAS Copernicus: debit sungai 30 hari & ambang periode ulang)
 *   data/asap/indeks.json       – scripts/asap.py       (lintasan asap 24 jam dari titik panas FIRMS, angin ECMWF)
 *   data/bekas_modis/*          – scripts/modis_arsip.py (NASA MCD64A1 area terbakar 2001–sekarang)
 *   data/vegetasi/indeks.json   – scripts/modis_arsip.py (NASA MOD13Q1/MYD13Q1 NDVI & NBR vs normal 2016–2025)
 *   data/rekap_musim/*          – scripts/rekap_musim.py (rekap & PDF musim api)
 * Khusus akun Hutan Desa dampingan & admin (FHAksesHD); mode umum/SHP mendapat penjelasan.
 */
(function () {
'use strict';
const X = () => window.FHAlat, EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const getJ = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
const BLN = () => EN() ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = t => { if (!t) return '–'; const [y, m, d] = String(t).slice(0, 10).split('-'); return `${+d} ${BLN()[+m - 1]} ${y}`; };
const SIAGA = [['#16A34A', 'Aman', 'Safe'], ['#CA8A04', 'Waspada', 'Watch'], ['#EA580C', 'Siaga', 'Alert'], ['#B91C1C', 'Awas', 'Danger']];
const MUSIM = [['#16A34A', 'rendah', 'low'], ['#CA8A04', 'sedang', 'moderate'], ['#EA580C', 'tinggi', 'high'], ['#B91C1C', 'sangat tinggi', 'very high'], ['#7F1D1D', 'ekstrem', 'extreme']];
const BANJIR = [['#16A34A', 'Normal', 'Normal'], ['#CA8A04', 'Waspada', 'Watch'], ['#EA580C', 'Siaga', 'Alert'], ['#B91C1C', 'Awas', 'Danger']];
const FASE = { el_nino: ['#DC2626', 'El Niño', 'El Niño'], la_nina: ['#2563EB', 'La Niña', 'La Niña'], netral: ['#64748B', 'Netral', 'Neutral'] };
const KUAT = { 'lemah': 'weak', 'sedang': 'moderate', 'kuat': 'strong', 'sangat kuat': 'very strong' };

function css() {
  if (document.getElementById('ik-css')) return; const s = document.createElement('style'); s.id = 'ik-css';
  s.textContent = '.ik-hero{border-radius:18px;padding:14px 16px;color:#fff;background:linear-gradient(135deg,var(--a,#0B3B2C),var(--b,#1E7A58))}.ik-hero b.big{display:block;font-size:26px;line-height:1.15;margin:2px 0}.ik-hero small{display:block;opacity:.9;font-size:12.5px}.ik-hero p{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.92)}' +
    '.ik-row{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line,#e5e7eb)}.ik-row:first-of-type{border-top:0}.ik-dot{flex:none;width:12px;height:12px;border-radius:50%;margin-top:4px}.ik-row .m{flex:1;min-width:0}.ik-row .m b{display:block;font-size:14px}.ik-row .m small{display:block;color:var(--muted,#667);font-size:12px;line-height:1.45}' +
    '.ik-tag{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:800;color:#fff;vertical-align:middle}.ik-pt{flex:none;text-align:right;font-weight:800;font-size:13px;min-width:44px}.ik-bar{height:6px;border-radius:4px;background:var(--line,#e5e7eb);margin-top:5px;overflow:hidden}.ik-bar i{display:block;height:100%;border-radius:4px}' +
    '.ik-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:8px 0}.ik-kv div{border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:8px 10px}.ik-kv small{display:block;color:var(--muted,#667);font-size:11.5px}.ik-kv b{font-size:17px}' +
    '.ik-strip{display:flex;gap:2px;margin:6px 0}.ik-strip i{flex:1;height:16px;border-radius:3px;min-width:3px}.ik-svg{width:100%;height:auto;display:block}.ik-svg text{font:10px system-ui,sans-serif;fill:var(--muted,#667)}' +
    '.ik-tb{width:100%;border-collapse:collapse;font-size:12.5px}.ik-tb th,.ik-tb td{padding:6px 5px;border-top:1px solid var(--line,#e5e7eb);text-align:right}.ik-tb th:first-child,.ik-tb td:first-child{text-align:left}.ik-tb th{font-size:11.5px;color:var(--muted,#667);font-weight:700}.ik-tb tr.ini td{background:rgba(30,122,88,.10);font-weight:700}.ik-tb td{white-space:nowrap}.ik-why[hidden]{display:none!important}' +
    '.ik-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.ik-chip{display:inline-block;padding:3px 8px;border-radius:8px;font-size:11.5px;margin:2px 4px 2px 0;border:1px solid var(--line,#e5e7eb)}' +
    '.hx-sg{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.22);color:#fff;font:inherit;font-size:13px;cursor:pointer;width:100%;text-align:left}.hx-sg i{width:10px;height:10px;border-radius:50%;flex:none}.hx-sg b{font-weight:800}.hx-sg span{opacity:.85;margin-left:auto;font-size:12px}';
  document.head.appendChild(s);
}
function hanyaHD(judul, ket) {
  if (window.FHAksesHD && FHAksesHD() && window.FHSiteObj && FHSiteObj()) return false;
  openPage(judul, I('Khusus Hutan Desa dampingan', 'Partner village forests only'), `<div class="fa"><div class="fa-card"><p>${ket || I('Alat ini dihitung otomatis untuk Hutan Desa dampingan PRCF. Untuk wilayah Anda sendiri gunakan menu <b>Analisis lahan & karbon</b> (unggah SHP).', 'This tool is computed automatically for PRCF partner village forests. For your own area use <b>Land & carbon analysis</b> (upload a shapefile).')}</p></div></div>`);
  return true;
}
const muat = (judul, sub, fn) => openPage(judul, sub, `<div class="fa" id="ikW"><div class="fa-card"><p class="fa-note">${I('Memuat…', 'Loading…')}</p></div></div>`, async () => {
  const w = document.getElementById('ikW');
  try { await fn(w); } catch (e) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Data belum dapat dimuat. Coba lagi saat ada sinyal.', 'Data could not be loaded. Try again when online.')}</p></div>`; try { console.warn('[iklim]', e); } catch (_) { } }
});
const kosong = (w, t) => { w.innerHTML = `<div class="fa-card"><p class="fa-err">${t || I('Belum ada data untuk Hutan Desa ini. Data dihitung otomatis; coba lagi nanti.', 'No data for this village forest yet. Data is computed automatically; try again later.')}</p></div>`; };
const pakai = k => { try { X() && X().pakai && X().pakai(k); } catch (e) { } };
const keMenu = (w) => w.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { try { FHApp.hubGo(b.dataset.go); } catch (e) { } });
const bulanNama = ym => { const [y, m] = ym.split('-'); return `${BLN()[+m - 1]} ${y}`; };

/* garis sederhana SVG */
function grafik(seri, o = {}) {
  const W = 340, H = o.h || 150, P = { l: 34, r: 8, t: 8, b: 20 };
  const xs = seri.flatMap(s => s.d.map(p => p[0])), ys = seri.flatMap(s => s.d.flatMap(p => p.slice(1).filter(v => v != null))).concat(o.garis ? o.garis.map(g => g.v) : []);
  if (!xs.length) return '';
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = o.y0 ?? Math.min(...ys), y1 = Math.max(...ys) * (o.atas || 1.05) || 1;
  const X_ = v => P.l + (v - x0) / Math.max(1e-9, x1 - x0) * (W - P.l - P.r), Y_ = v => H - P.b - (v - y0) / Math.max(1e-9, y1 - y0) * (H - P.t - P.b);
  let g = '';
  [0, .5, 1].forEach(f => { const v = y0 + f * (y1 - y0); g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y_(v)}" y2="${Y_(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="${P.l - 4}" y="${Y_(v) + 3}" text-anchor="end">${nf(v, o.dy ?? 0)}</text>`; });
  (o.garis || []).forEach(l => { g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y_(l.v)}" y2="${Y_(l.v)}" stroke="${l.c}" stroke-dasharray="4 3" stroke-width="1.2"/><text x="${W - P.r - 2}" y="${Y_(l.v) - 3}" text-anchor="end" style="fill:${l.c}">${esc(l.t)}</text>`; });
  seri.forEach(s => {
    if (s.pita) { const atas = s.d.filter(p => p[1] != null && p[2] != null); if (atas.length > 1) g += `<path d="M${atas.map(p => `${X_(p[0])},${Y_(p[2])}`).join('L')}L${atas.slice().reverse().map(p => `${X_(p[0])},${Y_(p[1])}`).join('L')}Z" fill="${s.c}" fill-opacity=".18" stroke="none"/>`; return; }
    const d = s.d.filter(p => p[1] != null); if (!d.length) return;
    g += `<path d="M${d.map(p => `${X_(p[0])},${Y_(p[1])}`).join('L')}" fill="none" stroke="${s.c}" stroke-width="${s.w || 1.8}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
    if (s.titik) d.forEach(p => { g += `<circle cx="${X_(p[0])}" cy="${Y_(p[1])}" r="2" fill="${s.c}"/>`; });
  });
  if (o.kini != null) g += `<line x1="${X_(o.kini)}" x2="${X_(o.kini)}" y1="${P.t}" y2="${H - P.b}" stroke="currentColor" stroke-opacity=".45" stroke-dasharray="2 2"/><text x="${X_(o.kini) + 3}" y="${P.t + 9}">${I('hari ini', 'today')}</text>`;
  (o.labelX || []).forEach(([v, t]) => { const x = X_(v), an = x > W - 40 ? 'end' : x < P.l + 20 ? 'start' : 'middle'; g += `<text x="${x}" y="${H - 5}" text-anchor="${an}">${esc(t)}</text>`; });
  return `<svg class="ik-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
}
function batang(L, o = {}) {   // L: [[label, nilai, warna]]
  const W = 340, H = o.h || 140, P = { l: 30, r: 4, t: 12, b: 18 }, mx = Math.max(1, ...L.map(x => x[1] || 0)), bw = (W - P.l - P.r) / L.length;
  let g = `<text x="${P.l - 4}" y="${P.t + 3}" text-anchor="end">${nf(mx)}</text><line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" stroke="currentColor" stroke-opacity=".2"/>`;
  L.forEach(([t, v, c], i) => { const h = (v || 0) / mx * (H - P.t - P.b), x = P.l + i * bw;
    g += `<rect x="${x + bw * .15}" y="${H - P.b - h}" width="${bw * .7}" height="${Math.max(h, v ? 1 : 0)}" rx="2" fill="${c}"><title>${esc(t)}: ${nf(v, 1)}</title></rect>`;
    if (o.tiap ? i % o.tiap === 0 || (i === L.length - 1 && i % o.tiap > o.tiap / 2) : true) g += `<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${esc(t)}</text>`; });
  return `<svg class="ik-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
}
const hari = t => Date.parse(String(t).slice(0, 10) + 'T00:00:00Z') / 864e5;

/* ================= 1. PRAKIRAAN MUSIM API 6 BULAN + ENSO ================= */
async function prakiraan() {
  css(); const J0 = I('Prakiraan musim api', 'Fire-season outlook'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('prakmusim');
  muat(J0, s.hd_nama + I(' · 6 bulan', ' · 6 months'), async w => {
    const D = await getJ('data/iklim/indeks.json'), L = D.lokasi && D.lokasi[s.id], M = L && L.musim_api;
    if (!M) return kosong(w);
    const E = (D.enso || {}).terkini || {}, wk = (D.enso || {}).mingguan, F = FASE[E.fase] || FASE.netral, EL = L.enso_lokal || {};
    const kk = E.kekuatan ? (EN() ? KUAT[E.kekuatan] || E.kekuatan : E.kekuatan) : '';
    const fT = E.fase ? `${EN() ? F[2] : F[1]}${kk ? ' ' + kk : ''}` : '–';
    const deret = ((D.enso || {}).deret || []).slice(-12);
    const tinggi = M.bulan.filter(b => b.level >= 2);
    w.innerHTML = `<div class="ik-hero" style="--a:${F[0]};--b:#0B3B2C"><small>${I('Status ENSO terkini (NOAA)', 'Current ENSO status (NOAA)')}</small><b class="big">${esc(fT)}</b>
      <p>ONI ${esc(E.musim || '')} ${E.tahun || ''}: <b style="color:#fff">${E.oni != null ? (E.oni > 0 ? '+' : '') + nf(E.oni, 2) : '–'} °C</b>${wk ? ` · Niño 3.4 ${I('minggu', 'week')} ${esc(wk.minggu)}: ${(wk.nino34_anom > 0 ? '+' : '') + nf(wk.nino34_anom, 1)} °C` : ''}<br>
      ${tinggi.length ? I(`Waspada mulai <b style="color:#fff">${esc(tinggi[0].nama)}</b>: prakiraan musim api tinggi atau lebih.`, `Be alert from <b style="color:#fff">${esc(tinggi[0].nama)}</b>: high or higher fire-season outlook.`) : I('Enam bulan ke depan diperkirakan bukan puncak musim api. Tetap ikuti peringatan dini.', 'The next six months are not expected to be peak fire season. Keep following early warnings.')}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('Prakiraan 6 bulan', '6-month outlook')}</h4><p class="fa-note" style="margin:0 0 4px">${I('Ketuk bulan untuk melihat alasannya.', 'Tap a month to see why.')}</p>
      ${M.bulan.map((b, i) => { const c = MUSIM[b.level] || MUSIM[0]; return `<div class="ik-row" data-i="${i}" style="cursor:pointer"><span class="ik-dot" style="background:${c[0]}"></span><span class="m"><b>${esc(b.nama)} <span class="ik-tag" style="background:${c[0]}">${EN() ? c[2] : c[1]}</span></b>
        <small>${I('Pola', 'Pattern')}: ${esc(b.pola)} · ${I('rata-rata', 'average')} ${nf(b.rata25, 1)} ${I('titik panas ≤ 25 km', 'hotspots ≤ 25 km')}${b.hujan_seas5 ? ` · ${I('hujan', 'rain')} ${nf(b.hujan_seas5.median)} mm (${I('normal', 'normal')} ${nf(b.hujan_seas5.normal)})` : ''}</small>
        <small class="ik-why" hidden>${b.alasan.map(a => '• ' + esc(a)).join('<br>')}</small></span></div>`; }).join('')}</div>
      ${EL && EL.el_nino ? `<div class="fa-card"><h4 style="margin:0 0 6px">${I('Pengaruh El Niño di sekitar Hutan Desa ini', 'El Niño impact around this village forest')}</h4>
        <div class="ik-kv"><div><small>${I('Area terbakar ≤ 25 km · tahun El Niño', 'Burned ≤ 25 km · El Niño years')}</small><b>${nf(EL.el_nino.terbakar25_ha)} ha</b></div><div><small>${I('… tahun netral', '… neutral years')}</small><b>${nf(EL.netral.terbakar25_ha)} ha</b></div><div><small>${I('… tahun La Niña', '… La Niña years')}</small><b>${nf(EL.la_nina.terbakar25_ha)} ha</b></div></div>
        <p class="fa-note" style="margin:0">${EL.kali_lipat_terbakar ? I(`Rata-rata per tahun 2001–2025 (MODIS): di tahun El Niño area terbakar <b>${nf(EL.kali_lipat_terbakar, 1)}×</b> tahun netral.`, `Yearly average 2001–2025 (MODIS): in El Niño years burned area is <b>${nf(EL.kali_lipat_terbakar, 1)}×</b> neutral years.`) : ''} ${I('Tahun El Niño', 'El Niño years')}: ${(EL.el_nino.tahun || []).join(', ') || '–'}.</p></div>` : ''}
      ${deret.length ? `<div class="fa-card"><h4 style="margin:0 0 4px">${I('Oceanic Niño Index 12 musim terakhir', 'Oceanic Niño Index, last 12 seasons')}</h4>${grafik([{ d: deret.map((r, i) => [i, r.oni]), c: '#DC2626', titik: 1 }], { y0: Math.min(-1, ...deret.map(r => r.oni)), garis: [{ v: .5, c: '#DC2626', t: 'El Niño +0,5' }, { v: -.5, c: '#2563EB', t: 'La Niña −0,5' }], dy: 1, labelX: deret.map((r, i) => [i, i % 3 === 0 || i === deret.length - 1 ? r.musim + String(r.tahun).slice(2) : '']).filter(x => x[1]), aria: 'ONI' })}</div>` : ''}
      <div class="ik-act"><button class="fa-btn" data-go="musimapi">${I('Kalender musim api', 'Fire-season calendar')}</button><button class="fa-btn" data-go="siaga">${I('Indeks Siaga Desa', 'Village Alert Index')}</button></div>
      <p class="fa-note">${esc(D.metode && D.metode.musim_api)} ${I('Sumber', 'Source')}: ${esc((D.enso || {}).sumber || '')}; ECMWF SEAS5. ${I('Bandingkan dengan prakiraan resmi BMKG.', 'Compare with official BMKG forecasts.')}</p>`;
    w.querySelectorAll('[data-i]').forEach(r => r.onclick = () => { const k = r.querySelector('.ik-why'); k.hidden = !k.hidden; });
    keMenu(w);
  });
}

/* ================= 2. KEKERINGAN: HARI TANPA HUJAN & KELEMBAPAN TANAH ================= */
const HTHK = { 'tanpa': '#16A34A', 'sangat pendek': '#65A30D', 'pendek': '#CA8A04', 'menengah': '#EA580C', 'panjang': '#DC2626', 'sangat panjang': '#B91C1C', 'kekeringan ekstrem': '#7F1D1D' };
const HTHE = { 'tanpa': 'none', 'sangat pendek': 'very short', 'pendek': 'short', 'menengah': 'medium', 'panjang': 'long', 'sangat panjang': 'very long', 'kekeringan ekstrem': 'extreme drought' };
const TNK = { 'sangat kering': ['#B91C1C', 'very dry'], 'kering': ['#EA580C', 'dry'], 'normal': ['#16A34A', 'normal'], 'basah': ['#2563EB', 'wet'] };
async function kering() {
  css(); const J0 = I('Kekeringan & hari tanpa hujan', 'Drought & dry days'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('kering');
  muat(J0, s.hd_nama, async w => {
    const D = await getJ('data/iklim/indeks.json'), L = D.lokasi && D.lokasi[s.id]; if (!L || !L.hth) return kosong(w);
    const H = L.hth, T = L.tanah, kh = HTHK[H.kelas] || '#16A34A', kp = HTHK[H.kelas_proyeksi] || kh, KL = k => EN() ? HTHE[k] || k : k;
    w.innerHTML = `<div class="ik-hero" style="--a:${kh};--b:#0B3B2C"><small>${I('Hari tanpa hujan berturut-turut (hujan < 1 mm)', 'Consecutive dry days (rain < 1 mm)')}</small><b class="big">${nf(H.hari)} ${I('hari', 'days')} · ${esc(KL(H.kelas))}</b>
        <p>${I('Sampai', 'Up to')} ${tgl(H.sampai)} (ERA5). ${I('Dengan prakiraan 7 hari', 'With the 7-day forecast')}: <b style="color:#fff">${nf(H.proyeksi)} ${I('hari', 'days')} (${esc(KL(H.kelas_proyeksi))})</b>.<br>${I(`Hujan 30 hari terakhir ${nf(H.hujan_30hari)} mm dalam ${nf(H.hari_hujan_30)} hari hujan.`, `Last 30 days: ${nf(H.hujan_30hari)} mm on ${nf(H.hari_hujan_30)} rainy days.`)}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('Dibanding tahun-tahun sebelumnya', 'Compared with past years')}</h4>
        <div class="ik-kv"><div><small>${I('Kering beruntun terpanjang tahun ini', 'Longest dry spell this year')}</small><b>${nf(H.tahun_ini_maks)} ${I('hari', 'days')}</b></div><div><small>${I('Biasanya per tahun (median 2001–2025)', 'Typical per year (median 2001–2025)')}</small><b>${nf(H.maks_tahunan_median)} ${I('hari', 'days')}</b></div><div><small>${I('Terpanjang 2001–2025', 'Longest 2001–2025')}</small><b>${nf(H.maks_tahunan_tertinggi)} ${I('hari', 'days')}</b></div></div>
        ${(H.hari_prakiraan || []).length ? `<p class="fa-note" style="margin:4px 0 2px">${I('Prakiraan hujan harian', 'Daily rain forecast')}:</p>${H.hari_prakiraan.map(h => `<span class="ik-chip" style="${h.hujan < 1 ? 'background:rgba(234,88,12,.12)' : ''}">${tgl(h.tanggal).replace(/ \d{4}$/, '')}: ${nf(h.hujan, 1)} mm</span>`).join('')}` : ''}
        <p class="fa-note" style="margin:8px 0 0">${I('Kelas BMKG', 'BMKG classes')}: 1–5 ${I('sangat pendek', 'very short')} · 6–10 ${I('pendek', 'short')} · 11–20 ${I('menengah', 'medium')} · 21–30 ${I('panjang', 'long')} · 31–60 ${I('sangat panjang', 'very long')} · >60 ${I('kekeringan ekstrem', 'extreme drought')}.</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('Kelembapan tanah 7–28 cm (ERA5-Land)', 'Soil moisture 7–28 cm (ERA5-Land)')}</h4>
        ${T && T.persentil != null ? `<p style="margin:4px 0"><span class="ik-tag" style="background:${(TNK[T.kategori] || TNK.normal)[0]}">${EN() ? (TNK[T.kategori] || [0, T.kategori])[1] : esc(T.kategori)}</span> ${I('persentil', 'percentile')} <b>${nf(T.persentil)}</b> ${I(`pada ${tgl(T.tanggal)} – artinya lebih kering dari ${100 - T.persentil}% hari serupa 2011–2025.`, `on ${tgl(T.tanggal)} – drier than ${100 - T.persentil}% of similar days in 2011–2025.`)}</p>
          ${grafik([{ d: (T.deret60 || []).map(p => [hari(p[0]), p[1]]), c: '#2563EB', w: 2 }], { garis: [T.normal_median != null ? { v: T.normal_median, c: '#16A34A', t: I('normal (median)', 'normal (median)') } : null, T.normal_p10 != null ? { v: T.normal_p10, c: '#DC2626', t: I('sangat kering (p10)', 'very dry (p10)') } : null].filter(Boolean), dy: 2, aria: 'soil moisture' })}
          <p class="fa-note" style="margin:0">${I('m³/m³ · 60 hari terakhir. ERA5-Land terbit ± 5 hari kemudian.', 'm³/m³ · last 60 days. ERA5-Land is published ~5 days later.')}</p>`
        : `<p class="fa-note">${I('Arsip kelembapan tanah sedang dikumpulkan otomatis (bertahap). Bagian ini akan terisi dalam 1–2 hari.', 'The soil-moisture archive is being collected automatically. This section will fill within 1–2 days.')}</p>`}</div>
      <div class="ik-act"><button class="fa-btn" data-go="siaga">${I('Indeks Siaga Desa', 'Village Alert Index')}</button><button class="fa-btn" data-go="hujan">${I('Cuaca & musim api', 'Weather & fire season')}</button></div>
      <p class="fa-note">${esc(D.metode && D.metode.hth)} ${esc(D.metode && D.metode.tanah)}</p>`;
    keMenu(w);
  });
}

/* ================= 3. INDEKS SIAGA DESA ================= */
async function siaga() {
  css(); const J0 = I('Indeks Siaga Desa', 'Village Alert Index'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('siaga');
  muat(J0, s.hd_nama + I(' · diperbarui tiap 3 jam', ' · updated every 3 hours'), async w => {
    const D = await getJ('data/iklim/indeks.json'), L = D.lokasi && D.lokasi[s.id], S = L && L.siaga; if (!S) return kosong(w);
    const c = SIAGA[S.level] || SIAGA[0];
    const saran = [I('Kondisi aman. Tetap ikuti peringatan dini dan laporkan bila melihat asap.', 'Safe. Keep following early warnings and report any smoke.'),
      I('Waspada: hindari membakar lahan/sampah, periksa alat pemadam, dan pantau titik panas.', 'Watch: avoid burning, check fire tools and monitor hotspots.'),
      I('Siaga: perkuat patroli terutama ke titik rawan berulang, siapkan regu & pompa, sosialisasi larangan membakar.', 'Alert: strengthen patrols especially to recurring sites, prepare crews & pumps, outreach on burning ban.'),
      I('Awas: patroli harian, regu pemadam siaga di lokasi, koordinasi dengan Manggala Agni/BPBD dan desa sekitar.', 'Danger: daily patrols, fire crews on standby, coordinate with Manggala Agni/BPBD and neighbouring villages.')][S.level];
    const NM = { 'Bahaya kebakaran (FWI) hari ini–3 hari': 'Fire danger (FWI) today–3 days', 'Hari tanpa hujan berturut-turut': 'Consecutive dry days', 'Kelembapan tanah 7–28 cm': 'Soil moisture 7–28 cm', 'Titik panas 72 jam terakhir': 'Hotspots in last 72 h', 'Kekeringan vegetasi (MODIS)': 'Vegetation dryness (MODIS)', 'Prakiraan musim api bulan ini': 'Fire-season outlook this month' };
    const R = L.riwayat || [];
    w.innerHTML = `<div class="ik-hero" style="--a:${c[0]};--b:#0B3B2C"><small>${I('Status hari ini', "Today's status")} · ${tgl(S.tanggal)}</small><b class="big">${EN() ? c[2] : c[1]}</b>
        <p>${I('Skor', 'Score')} <b style="color:#fff">${nf(S.skor)}</b> ${I('dari', 'of')} ${nf(S.maks)} · ${saran}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('Penyusun skor', 'Score components')}</h4>
        ${S.komponen.map(k => { const f = k.maks ? k.poin / k.maks : 0, col = f >= .67 ? '#B91C1C' : f >= .34 ? '#EA580C' : f > 0 ? '#CA8A04' : '#16A34A';
          return `<div class="ik-row"><span class="ik-dot" style="background:${col}"></span><span class="m"><b>${esc(EN() ? NM[k.nama] || k.nama : k.nama)}</b><small>${esc(k.nilai)} · ${esc(k.ket)}</small><div class="ik-bar"><i style="width:${Math.max(3, f * 100)}%;background:${col}"></i></div></span><span class="ik-pt">+${k.poin}<small style="display:block;font-weight:400;color:var(--muted,#667)">/${k.maks}</small></span></div>`; }).join('')}</div>
      ${R.length > 1 ? `<div class="fa-card"><h4 style="margin:0 0 2px">${I(`Riwayat ${R.length} hari`, `Last ${R.length} days`)}</h4><div class="ik-strip">${R.map(r => `<i title="${tgl(r[0])}: ${(SIAGA[r[2]] || SIAGA[0])[EN() ? 2 : 1]} (${r[1]})" style="background:${(SIAGA[r[2]] || SIAGA[0])[0]}"></i>`).join('')}</div><p class="fa-note" style="margin:0">${tgl(R[0][0])} – ${tgl(R[R.length - 1][0])}</p></div>` : ''}
      <div class="fa-card"><h4 style="margin:0 0 6px">${I('Tingkat', 'Levels')}</h4>${SIAGA.map((x, i) => `<span class="ik-chip"><span class="ik-tag" style="background:${x[0]}">${EN() ? x[2] : x[1]}</span> ${['0–2', '3–5', '6–8', '≥ 9'][i]}</span>`).join('')}
        <div class="ik-act"><button class="fa-btn pri" style="--c:#B91C1C" data-go="peringatan">${I('Aktifkan notifikasi', 'Enable notifications')}</button><button class="fa-btn" data-go="kering">${I('Kekeringan', 'Drought')}</button><button class="fa-btn" data-go="prakmusim">${I('Prakiraan musim api', 'Fire-season outlook')}</button></div></div>
      <p class="fa-note">${esc(D.metode && D.metode.siaga)} ${I('Notifikasi dikirim saat status naik ke Siaga atau Awas.', 'A notification is sent when the status rises to Alert or Danger.')}</p>`;
    keMenu(w);
  });
}

/* ================= 4. DEBIT SUNGAI & BANJIR ================= */
let LAPIS_SG = null;
async function banjir() {
  css(); const J0 = I('Debit sungai & banjir', 'River flow & floods'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('banjir');
  muat(J0, s.hd_nama + I(' · 30 hari', ' · 30 days'), async w => {
    const D = await getJ('data/banjir/indeks.json'), B = D.lokasi && D.lokasi[s.id]; if (!B) return kosong(w);
    const S = B.sungai, c = BANJIR[B.level] || BANJIR[0], kini = hari(new Date(Date.now() + 7 * 36e5).toISOString());
    const h = B.hari || [], ket = B.level ? I(`Debit diprakirakan melewati ambang banjir mulai <b style="color:#fff">${tgl(B.pertama_lewat)}</b>.`, `Flow is forecast to exceed the flood threshold from <b style="color:#fff">${tgl(B.pertama_lewat)}</b>.`)
      : B.mungkin ? I('Sebagian prakiraan (≥ 25 % anggota) menunjukkan debit bisa melewati ambang banjir 2 tahunan. Pantau terus.', 'Some forecasts (≥ 25 % of members) show flow could exceed the 2-year flood level. Keep watching.')
      : I('Debit diprakirakan tetap di bawah ambang banjir 2 tahunan selama 30 hari ke depan.', 'Flow is forecast to stay below the 2-year flood level for the next 30 days.');
    w.innerHTML = `<div class="ik-hero" style="--a:${c[0]};--b:#0B3B2C"><small>${I('Sungai utama desa (model GloFAS 5 km)', 'Main village river (GloFAS 5 km model)')}</small><b class="big">${EN() ? c[2] : c[1]}${B.mungkin && !B.level ? I(' · mungkin naik', ' · may rise') : ''}</b>
        <p>${I('Debit sekarang', 'Flow now')} <b style="color:#fff">${nf(B.kini, 0)} m³/s</b> (${nf(B.persen_rp2)}% ${I('ambang 2 tahunan', 'of 2-year level')}) · ${I('puncak 30 hari', '30-day peak')} ${B.puncak ? nf(B.puncak.med) + ' m³/s ' + I('pada', 'on') + ' ' + tgl(B.puncak.t) : '–'}<br>${ket}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('30 hari lalu & 30 hari ke depan', 'Past 30 & next 30 days')}</h4>
        ${grafik([{ d: h.map(x => [hari(x.t), x.p25, x.p75]), c: '#2563EB', pita: 1 }, { d: h.map(x => [hari(x.t), x.t < new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10) ? x.q : x.med]), c: '#2563EB', w: 2 }],
          { y0: 0, kini, garis: [{ v: S.rp2, c: '#CA8A04', t: I('2 tahunan', '2-year') }, { v: S.rp5, c: '#EA580C', t: I('5 tahunan', '5-year') }, { v: S.rp20, c: '#B91C1C', t: I('20 tahunan', '20-year') }], h: 170, aria: 'discharge',
            labelX: h.filter((x, i) => i % 15 === 0).map(x => [hari(x.t), tgl(x.t).replace(/ \d{4}$/, '')]) })}
        <p class="fa-note" style="margin:0">${I('Garis: median ensemble · pita biru: 50 % anggota di tengah · m³/s.', 'Line: ensemble median · blue band: middle 50 % of members · m³/s.')}</p>
        <div class="ik-kv"><div><small>${I('Ambang 2 tahunan', '2-year level')}</small><b>${nf(S.rp2)}</b></div><div><small>${I('5 tahunan', '5-year')}</small><b>${nf(S.rp5)}</b></div><div><small>${I('20 tahunan', '20-year')}</small><b>${nf(S.rp20)}</b></div><div><small>${I('Debit harian biasa (median)', 'Typical daily flow (median)')}</small><b>${nf(S.median_harian)}</b></div></div>
        <div class="ik-act"><button class="fa-btn" data-peta>${I('Lihat titik sungai di peta', 'Show river point on map')}</button><button class="fa-btn" data-go="cuaca">${I('Prakiraan hujan', 'Rain forecast')}</button></div></div>
      <p class="fa-note">${esc(D.metode)} ${I('Titik sungai', 'River point')}: ${nf(S.lat, 3)}, ${nf(S.lon, 3)} (${nf(S.jarak_km, 1)} km ${I('dari pusat desa', 'from village centre')}); ${I('normal dari reanalisis', 'normals from reanalysis')} ${S.tahun ? S.tahun.join('–') : ''}. ${esc(D.sumber)}</p>`;
    w.querySelector('[data-peta]').onclick = () => { const MAP = FHApp.map(); try { FHApp.closeAll(); } catch (e) { } FHApp.go('home');
      setTimeout(() => { if (!MAP || !window.L) return; MAP.invalidateSize(); if (LAPIS_SG) MAP.removeLayer(LAPIS_SG);
        LAPIS_SG = L.circleMarker([S.lat, S.lon], { radius: 10, color: '#fff', weight: 2, fillColor: c[0], fillOpacity: 1 }).bindPopup(`<b>${I('Titik sungai GloFAS', 'GloFAS river point')}</b><br>${nf(B.kini)} m³/s · ${EN() ? c[2] : c[1]}`).addTo(MAP).openPopup();
        MAP.setView([S.lat, S.lon], 11); }, 350); };
    keMenu(w);
  });
}

/* ================= 5. ARAH ASAP ================= */
let LAPIS_ASAP = null;
async function asap() {
  css(); const J0 = I('Arah asap', 'Smoke direction'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('asap');
  muat(J0, s.hd_nama + I(' · 24 jam', ' · 24 hours'), async w => {
    const D = await getJ('data/asap/indeks.json'), A = D.lokasi && D.lokasi[s.id]; if (!A) return kosong(w);
    let U = null; try { const P = await getJ('data/prakiraan.json'); U = ((P.lokasi || {})[s.id] || {}).udara; } catch (e) { }
    const now = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 13), depan = U && U.jam ? U.jam.filter(x => x.t.slice(0, 13) >= now).slice(0, 48) : [];
    const pmMax = depan.length ? Math.max(...depan.map(x => x.pm25 || 0)) : null, kat = U && U.sekarang ? (U.kategori_nama || [])[U.sekarang.kategori] : null;
    const S = A.sumber || [], M = S.filter(x => x.menuju_desa), ARAH_EN = { 'utara': 'north', 'timur laut': 'north-east', 'timur': 'east', 'tenggara': 'south-east', 'selatan': 'south', 'barat daya': 'south-west', 'barat': 'west', 'barat laut': 'north-west' };
    const col = M.length ? '#B91C1C' : S.length ? '#CA8A04' : '#16A34A';
    w.innerHTML = `<div class="ik-hero" style="--a:${col};--b:#0B3B2C"><small>${I('Titik panas 24 jam dalam radius 100 km', 'Hotspots in 24 h within 100 km')}</small>
        <b class="big">${M.length ? I(`${M.length} sumber asap menuju desa`, `${M.length} smoke source(s) heading to the village`) : S.length ? I(`${S.length} sumber, tidak menuju desa`, `${S.length} source(s), not heading to the village`) : I('Tidak ada sumber asap', 'No smoke sources')}</b>
        <p>${M.length ? I(`Tercepat tiba ± <b style="color:#fff">${nf(A.tercepat_jam, 1)} jam</b> lagi (${esc(A.tercepat_wib)} WIB).`, `Earliest arrival in about <b style="color:#fff">${nf(A.tercepat_jam, 1)} h</b> (${esc(A.tercepat_wib)} WIB).`) : ''}
        ${U && U.sekarang ? I(`PM2.5 sekarang ${nf(U.sekarang.pm25, 1)} µg/m³ (${esc(kat || '')})`, `PM2.5 now ${nf(U.sekarang.pm25, 1)} µg/m³ (${esc(kat || '')})`) + (pmMax != null ? I(` · tertinggi 48 jam ke depan ${nf(pmMax, 1)} µg/m³ (CAMS)`, ` · highest in next 48 h ${nf(pmMax, 1)} µg/m³ (CAMS)`) : '') : ''}</p></div>
      ${S.length ? `<div class="fa-card"><div class="ik-act" style="margin:0 0 6px"><button class="fa-btn pri" style="--c:#B91C1C" data-peta>${I('Tampilkan lintasan di peta', 'Show trajectories on map')}</button></div>
        ${S.slice(0, 20).map(x => `<div class="ik-row"><span class="ik-dot" style="background:${x.menuju_desa ? '#B91C1C' : '#94A3B8'}"></span><span class="m"><b>${nf(x.jarak_km, 1)} km ${I('arah', 'to the')} ${esc(EN() ? ARAH_EN[x.arah_dari_desa] || x.arah_dari_desa : x.arah_dari_desa)} · ${nf(x.n)} ${I('titik', 'hotspot(s)')}</b>
          <small>${I('Terdeteksi', 'Detected')} ${esc(x.deteksi_wib)} WIB · FRP ${nf(x.frp, 1)} MW · ${x.di_dalam ? I('di dalam desa/Hutan Desa', 'inside village/forest') : x.menuju_desa ? I(`asap diperkirakan tiba ± ${nf(x.jam_tiba, 1)} jam (${esc(x.tiba_wib)} WIB)`, `smoke may arrive in ~${nf(x.jam_tiba, 1)} h (${esc(x.tiba_wib)} WIB)`) : I('asap diperkirakan tidak melewati desa', 'smoke not expected over the village')}</small></span></div>`).join('')}</div>`
        : `<div class="fa-card"><p>${I('Tidak ada titik panas dalam radius 100 km selama 24 jam terakhir, sehingga tidak ada lintasan asap yang dihitung.', 'No hotspots within 100 km in the last 24 hours, so no smoke trajectories were computed.')}</p></div>`}
      <div class="ik-act"><button class="fa-btn" data-go="udara">${I('Kualitas udara', 'Air quality')}</button><button class="fa-btn" data-go="angin">${I('Peta angin', 'Wind map')}</button></div>
      <p class="fa-note">${esc(D.metode)} ${I('Angin', 'Wind')}: ECMWF run ${esc(D.angin_run_utc || '')}.</p>`;
    const bP = w.querySelector('[data-peta]');
    if (bP) bP.onclick = () => { const MAP = FHApp.map(); try { FHApp.closeAll(); } catch (e) { } FHApp.go('home');
      setTimeout(() => { if (!MAP || !window.L) return; MAP.invalidateSize(); if (LAPIS_ASAP) MAP.removeLayer(LAPIS_ASAP);
        const g = []; S.forEach(x => { const ll = x.lintasan.map(p => [p[1], p[0]]); g.push(L.polyline(ll, { color: x.menuju_desa ? '#B91C1C' : '#64748B', weight: 3, opacity: .85, dashArray: x.menuju_desa ? null : '5 5' }));
          g.push(L.circleMarker([x.lat, x.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#F97316', fillOpacity: 1 }).bindPopup(`${nf(x.n)} ${I('titik panas', 'hotspot(s)')} · ${esc(x.deteksi_wib)} WIB`));
          const e = ll[ll.length - 1]; if (e) g.push(L.circleMarker(e, { radius: 3, color: x.menuju_desa ? '#B91C1C' : '#64748B', fillOpacity: 1 }).bindTooltip(I('+24 jam', '+24 h'))); });
        LAPIS_ASAP = L.featureGroup(g).addTo(MAP); try { MAP.fitBounds(LAPIS_ASAP.getBounds(), { padding: [30, 30] }); } catch (e) { } }, 350); };
    keMenu(w);
  });
}

/* ================= 6. ARSIP AREA TERBAKAR MODIS 2001–SEKARANG ================= */
let LAPIS_BA = null;
async function bekasArsip() {
  css(); const J0 = I('Arsip area terbakar', 'Burned-area archive'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('bekasarsip');
  muat(J0, s.hd_nama + ' · 2001–' + new Date().getFullYear(), async w => {
    const D = await getJ('data/bekas_modis/indeks.json'), L = D.lokasi && D.lokasi[s.id]; if (!L) return kosong(w);
    let jas = null; try { jas = (await getJ('data/iklim/enso.json')).jas; } catch (e) { }
    const th = Object.keys(L.tahun).filter(y => +y >= 2001).sort(), Z = { hd: I('Hutan Desa', 'Village forest'), desa: I('Desa', 'Village'), buf5: '≤ 5 km', buf25: '≤ 25 km' };
    let zona = 'buf25';
    const gambar = () => batang(th.map(y => [y.slice(2), L.tahun[y][zona], jas && jas[y] >= .5 ? '#DC2626' : '#F59E0B']), { tiap: 4, h: 150, aria: 'burned area' });
    const tb = th.slice().reverse().map(y => { const r = L.tahun[y]; return `<tr><td>${y}${jas && jas[y] >= .5 ? ' <span class="ik-tag" style="background:#DC2626">EN</span>' : ''}</td><td>${nf(r.hd)}</td><td>${nf(r.desa)}</td><td>${nf(r.buf5)}</td><td>${nf(r.buf25)}</td><td style="color:var(--muted,#667)">${r.bulan_hilang && r.bulan_hilang.length ? r.bulan_hilang.map(m => BLN()[m - 1]).join(',') : (r.bulan < 12 ? r.bulan + '/12' : '')}</td></tr>`; }).join('');
    w.innerHTML = `<div class="ik-hero" style="--a:#C2410C;--b:#0B3B2C"><small>${I('Total area terbakar 2001–sekarang (MODIS)', 'Total burned area 2001–present (MODIS)')}</small><b class="big">${nf(L.total_2001.buf25)} ha ≤ 25 km</b>
        <p>${I('Di Hutan Desa', 'In village forest')} ${nf(L.total_2001.hd)} ha · ${I('desa', 'village')} ${nf(L.total_2001.desa)} ha · ≤ 5 km ${nf(L.total_2001.buf5)} ha<br>${I('Tahun terbesar', 'Largest year')}: <b style="color:#fff">${esc(L.tahun_terbesar_buf25 || '–')}</b> · ${I('rata-rata 2016–2025', '2016–2025 average')} ${nf(L.rata_2016_2025.buf25)} ha/${I('tahun', 'year')} (≤ 25 km)</p></div>
      <div class="fa-card"><div class="ik-act" style="margin:0 0 6px">${Object.entries(Z).map(([k, t]) => `<button class="fa-btn${k === zona ? ' pri' : ''}" style="--c:#C2410C" data-z="${k}">${t}</button>`).join('')}</div>
        <div id="ikG">${gambar()}</div><p class="fa-note" style="margin:0">${I('ha per tahun · merah = tahun El Niño (ONI Jul–Sep ≥ +0,5)', 'ha per year · red = El Niño year (ONI Jul–Sep ≥ +0.5)')}</p>
        <div class="ik-act"><button class="fa-btn pri" style="--c:#C2410C" data-peta>${I('Tampilkan di peta', 'Show on map')}</button><select data-th style="min-height:38px;border-radius:10px;padding:0 8px"><option value="">${I('Semua tahun', 'All years')}</option>${th.slice().reverse().map(y => `<option>${y}</option>`).join('')}</select></div></div>
      <div class="fa-card" style="overflow-x:auto"><table class="ik-tb"><tr><th>${I('Tahun', 'Year')}</th><th>${I('Hutan Desa', 'Forest')}</th><th>${I('Desa', 'Village')}</th><th>≤ 5 km</th><th>≤ 25 km</th><th>${I('Bulan hilang', 'Missing')}</th></tr>${tb}</table><p class="fa-note" style="margin:6px 0 0">ha · ${I('data sampai', 'data up to')} ${esc(bulanNama(D.bulan_terakhir || '2000-01'))}</p></div>
      <div class="ik-act"><button class="fa-btn" data-go="bekas">${I('Bekas terbakar Sentinel-2 (rinci)', 'Sentinel-2 burn scars (detailed)')}</button><button class="fa-btn" data-go="rekapmusim">${I('Rekap musim api', 'Fire-season recap')}</button></div>
      <p class="fa-note">${esc(D.metode)} ${esc(D.sumber)}</p>`;
    w.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { zona = b.dataset.z; w.querySelectorAll('[data-z]').forEach(x => x.classList.toggle('pri', x === b)); w.querySelector('#ikG').innerHTML = gambar(); });
    w.querySelector('[data-peta]').onclick = async () => {
      const pilih = w.querySelector('[data-th]').value; let G; try { G = await getJ(`data/bekas_modis/${encodeURIComponent(s.id)}.geojson`); } catch (e) { toastMsg && toastMsg(I('Peta belum dapat dimuat', 'Map could not be loaded')); return; }
      const F = (G.features || []).filter(f => !pilih || String(f.properties.th) === pilih);
      const MAP = FHApp.map(); try { FHApp.closeAll(); } catch (e) { } FHApp.go('home');
      setTimeout(() => { if (!MAP || !window.L) return; MAP.invalidateSize(); if (LAPIS_BA) MAP.removeLayer(LAPIS_BA);
        if (!F.length) { toastMsg && toastMsg(I('Tidak ada piksel terbakar untuk pilihan ini', 'No burned pixels for this selection')); return; }
        const tahunMax = Math.max(...F.map(f => f.properties.th)), tahunMin = Math.min(...F.map(f => f.properties.th));
        LAPIS_BA = L.featureGroup(F.map(f => { const [lo, la] = f.geometry.coordinates, d = .00208, t = (f.properties.th - tahunMin) / Math.max(1, tahunMax - tahunMin);
          return L.rectangle([[la - d, lo - d], [la + d, lo + d]], { color: f.properties.zona === 'hd' ? '#7F1D1D' : '#C2410C', weight: f.properties.zona === 'luar' ? .5 : 1.5, fillColor: `hsl(${40 - t * 40},90%,${55 - t * 15}%)`, fillOpacity: .55 })
            .bindPopup(`<b>${I('Terbakar', 'Burned')} ${tgl(f.properties.tgl)}</b><br>MODIS MCD64A1 · ± 21 ha<br>${f.properties.zona === 'hd' ? I('di dalam Hutan Desa', 'inside village forest') : f.properties.zona === 'desa' ? I('di wilayah desa', 'in village area') : I('di luar desa', 'outside village')}`); })).addTo(MAP);
        try { MAP.fitBounds(LAPIS_BA.getBounds(), { padding: [30, 30] }); } catch (e) { } }, 350); };
    keMenu(w);
  });
}

/* ================= 7. KESEHATAN & KEKERINGAN VEGETASI ================= */
const VK = { kering: ['#B91C1C', 'Lebih kering dari normal', 'Drier than normal'], agak_kering: ['#EA580C', 'Agak di bawah normal', 'Slightly below normal'], normal: ['#16A34A', 'Normal', 'Normal'], belum_cukup: ['#64748B', 'Normal belum cukup', 'Not enough history'] };
const KATV = { sangat_rendah: ['#B91C1C', 'sangat rendah', 'very low'], rendah: ['#EA580C', 'rendah', 'low'], normal: ['#16A34A', 'normal', 'normal'], tinggi: ['#2563EB', 'tinggi', 'high'], tanpa_normal: ['#64748B', '–', '–'] };
async function vegetasi() {
  css(); const J0 = I('Kesehatan vegetasi', 'Vegetation health'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('vegetasi');
  muat(J0, s.hd_nama + ' · MODIS 250 m', async w => {
    const D = await getJ('data/vegetasi/indeks.json'), L = D.lokasi && D.lokasi[s.id], T = L && L.terkini; if (!T) return kosong(w);
    const v = VK[T.status] || VK.normal, lama = T.umur_hari > 45, kv = k => KATV[k] || KATV.tanpa_normal, dr = L.deret || [];
    const g = f => grafik([{ d: dr.filter(x => x[f + '_n']).map(x => [hari(x.t), x[f + '_n'][0], x[f + '_n'][2]]), c: '#16A34A', pita: 1 }, { d: dr.filter(x => x[f + '_n']).map(x => [hari(x.t), x[f + '_n'][1]]), c: '#16A34A', w: 1, dash: '3 3' }, { d: dr.map(x => [hari(x.t), x[f]]), c: f === 'ndvi' ? '#15803D' : '#B45309', w: 2, titik: 1 }],
      { dy: 2, aria: f, labelX: dr.length ? [0, 1, 2, 3].map(k => { const a = hari(dr[0].t), b = hari(dr[dr.length - 1].t), v = a + (b - a) * k / 3, d = new Date(v * 864e5); return [v, BLN()[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2)]; }) : [] });
    w.innerHTML = `<div class="ik-hero" style="--a:${v[0]};--b:#0B3B2C"><small>${I('Citra terbaru yang cukup cerah', 'Latest clear-enough image')}: ${tgl(T.tanggal)} · ${nf(T.cerah_persen)}% ${I('areal cerah', 'area clear')}</small><b class="big">${EN() ? v[2] : v[1]}</b>
        <p>NDVI ${nf(T.ndvi, 3)} (${EN() ? kv(T.kategori_ndvi)[2] : kv(T.kategori_ndvi)[1]}) · NBR ${nf(T.nbr, 3)} (${EN() ? kv(T.kategori_nbr)[2] : kv(T.kategori_nbr)[1]})${lama ? '<br>' + I(`Citra terakhir sudah ${T.umur_hari} hari karena tertutup awan; kondisi sekarang bisa berbeda.`, `Latest image is ${T.umur_hari} days old due to clouds; conditions may differ now.`) : ''}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 2px">${I('NDVI – kehijauan daun', 'NDVI – leaf greenness')}</h4>${g('ndvi')}
        <h4 style="margin:10px 0 2px">${I('NBR – kebasahan / tanda hangus', 'NBR – moisture / burn signal')}</h4>${g('nbr')}
        <p class="fa-note" style="margin:0">${I('Garis tebal: Hutan Desa ini · pita hijau: rentang normal 2016–2025 (persentil 10–90) · putus-putus: median normal.', 'Bold line: this village forest · green band: normal 2016–2025 range (10th–90th percentile) · dashed: normal median.')}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 4px">${I('Cara membaca', 'How to read')}</h4><p class="fa-note" style="margin:0">${I('Nilai di bawah pita normal berarti daun kurang hijau atau lebih kering dari biasanya pada waktu yang sama – bisa karena kemarau panjang, kebakaran, atau penebangan. Cek lapangan bila turun tajam di satu tempat.', 'Values below the normal band mean leaves are less green or drier than usual for the time of year – from drought, fire or clearing. Check in the field if it drops sharply.')}</p>
        <div class="ik-act"><button class="fa-btn" data-go="tutupan">${I('Tutupan lahan', 'Land cover')}</button><button class="fa-btn" data-go="hutan">${I('Tutupan hutan', 'Forest cover')}</button><button class="fa-btn" data-go="kering">${I('Kekeringan', 'Drought')}</button></div></div>
      <p class="fa-note">${esc(D.metode)} ${esc(D.sumber)}</p>`;
    keMenu(w);
  });
}

/* ================= 8. REKAP MUSIM API ================= */
async function rekap() {
  css(); const J0 = I('Rekap musim api', 'Fire-season recap'); if (hanyaHD(J0)) return; const s = FHSiteObj(); pakai('rekapmusim');
  muat(J0, s.hd_nama, async w => {
    const D = await getJ('data/rekap_musim/indeks.json'), L = D.lokasi && D.lokasi[s.id]; if (!L || !L.musim || !Object.keys(L.musim).length) return kosong(w, I('Rekap dibuat otomatis 7 hari setelah musim api berakhir.', 'The recap is generated automatically 7 days after the fire season ends.'));
    const th = Object.keys(L.musim).sort().reverse(), R = L.musim[th[0]];
    const sel = R.hujan_mm != null && R.hujan_normal_mm ? Math.round((R.hujan_mm - R.hujan_normal_mm) / R.hujan_normal_mm * 100) : null;
    w.innerHTML = `<div class="ik-hero" style="--a:${R.peringkat <= 2 ? '#B91C1C' : '#C2410C'};--b:#0B3B2C"><small>${I('Musim api', 'Fire season')} ${th[0]} · ${esc(L.periode)}</small><b class="big">${nf(R.titik.r25)} ${I('titik panas ≤ 25 km', 'hotspots ≤ 25 km')}</b>
        <p>${I(`Peringkat <b style="color:#fff">${R.peringkat} dari ${R.dari}</b> musim sejak 2016 (rata-rata ${nf(L.rata_r25_2016_2025, 1)}).`, `Rank <b style="color:#fff">${R.peringkat} of ${R.dari}</b> seasons since 2016 (average ${nf(L.rata_r25_2016_2025, 1)}).`)} ${I('Di Hutan Desa', 'In village forest')}: ${nf(R.titik.hd)} · ${I('desa', 'village')}: ${nf(R.titik.desa)} · ≤ 5 km: ${nf(R.titik.r5)}<br>
        ${R.hujan_mm != null ? I(`Hujan ${nf(R.hujan_mm)} mm (${sel >= 0 ? '+' : ''}${sel}% dari normal)`, `Rain ${nf(R.hujan_mm)} mm (${sel >= 0 ? '+' : ''}${sel}% vs normal)`) : ''}${R.fase ? ' · ENSO: ' + esc(R.fase) : ''}</p></div>
      <div class="fa-card">${batang(th.slice().reverse().map(y => [y.slice(2), L.musim[y].titik.r25, y === th[0] ? '#B91C1C' : L.musim[y].fase === 'El Niño' ? '#F97316' : '#94A3B8']), { h: 130, aria: 'seasons' })}
        <p class="fa-note" style="margin:0">${I('Titik panas ≤ 25 km per musim · oranye = tahun El Niño', 'Hotspots ≤ 25 km per season · orange = El Niño year')}</p></div>
      <div class="fa-card" style="overflow-x:auto"><table class="ik-tb"><tr><th>${I('Musim', 'Season')}</th><th>≤ 25 km</th><th>HD</th><th>${I('Hujan', 'Rain')}</th><th>${I('Kering', 'Dry')}</th><th>ENSO</th><th>MODIS ≤ 25 km</th><th>PDF</th></tr>
        ${th.map((y, i) => { const r = L.musim[y]; return `<tr class="${i === 0 ? 'ini' : ''}"><td>${y}</td><td>${nf(r.titik.r25)}</td><td>${nf(r.titik.hd)}</td><td>${nf(r.hujan_mm)}</td><td>${r.hth_terpanjang ?? '–'}</td><td>${esc(r.fase ? (EN() ? { 'Netral': 'Neutral' }[r.fase] || r.fase : r.fase) : '–')}</td><td>${r.modis_ha ? nf(r.modis_ha.buf25) + ((r.modis_ha.bulan_belum_terbit || []).length || (r.modis_ha.bulan_tidak_tersedia || []).length ? '*' : '') : '–'}</td>
          <td>${r.berkas ? `<a href="${esc('data/' + r.berkas)}" download="${esc(`Rekap-Musim-Api-${s.hd_nama.replace(/\s+/g, '-')}-${y}.pdf`)}">PDF</a>` : ''}</td></tr>`; }).join('')}</table>
        <p class="fa-note" style="margin:6px 0 0">${I('Hujan dalam mm · Kering = hari tanpa hujan beruntun terpanjang · * sebagian bulan MODIS belum terbit/tidak tersedia · PDF untuk 3 musim terakhir.', 'Rain in mm · Dry = longest dry spell (days) · * some MODIS months not yet published/unavailable · PDF for the last 3 seasons.')}</p></div>
      <div class="ik-act"><button class="fa-btn" data-go="bulanan">${I('Laporan bulanan & tahunan', 'Monthly & annual reports')}</button><button class="fa-btn" data-go="bekasarsip">${I('Arsip area terbakar', 'Burned-area archive')}</button></div>
      <p class="fa-note">${esc(D.metode)}</p>`;
    keMenu(w);
  });
}

/* ---------- status Siaga di Beranda & subjudul kartu ---------- */
async function beranda(el, sub) {
  try {
    if (!(window.FHAksesHD && FHAksesHD())) return; const s = FHSiteObj(); if (!s) return; css();
    const [D, B] = await Promise.all([getJ('data/iklim/indeks.json').catch(() => null), getJ('data/banjir/indeks.json').catch(() => null)]);
    const L = D && D.lokasi && D.lokasi[s.id];
    if (L && L.siaga && el && !el.querySelector('.hx-sg')) {
      const S = L.siaga, c = SIAGA[S.level] || SIAGA[0], st = el.querySelector('.hx-status');
      if (st) { const b = document.createElement('button'); b.className = 'hx-sg'; b.type = 'button';
        b.innerHTML = `<i style="background:${c[0]}"></i>${I('Indeks Siaga Desa', 'Village Alert Index')}: <b>${EN() ? c[2] : c[1]}</b><span>${I('skor', 'score')} ${S.skor} ›</span>`;
        b.onclick = () => siaga(); st.insertAdjacentElement('afterend', b); }
    }
    if (sub && L) {
      if (L.siaga) sub('siaga', `${(SIAGA[L.siaga.level] || SIAGA[0])[EN() ? 2 : 1]} · ${I('skor', 'score')} ${L.siaga.skor}`);
      if (L.hth) sub('kering', I(`${L.hth.hari} hari tanpa hujan`, `${L.hth.hari} dry days`));
      const m = L.musim_api && L.musim_api.bulan && L.musim_api.bulan.find(x => x.level >= 2); sub('prakmusim', m ? I('tinggi mulai ', 'high from ') + m.nama : (D.enso && D.enso.terkini ? (FASE[D.enso.terkini.fase] || FASE.netral)[EN() ? 2 : 1] + ' · ONI ' + nf(D.enso.terkini.oni, 1) : ''));
    }
    const b = B && B.lokasi && B.lokasi[s.id]; if (sub && b) sub('banjir', `${(BANJIR[b.level] || BANJIR[0])[EN() ? 2 : 1]} · ${nf(b.kini)} m³/s`);
  } catch (e) { }
}
window.FHIklim = { prakiraan, kering, siaga, banjir, asap, bekasArsip, vegetasi, rekap, beranda, grafik, batang };
})();
