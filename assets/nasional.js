/* Pantau Rimbak · alat data seluruh Indonesia untuk mode umum & wilayah SHP pengguna (di luar 6 Hutan Desa dampingan PRCF).
 * Lokasi yang dihitung: wilayah SHP terdaftar (mode SHP), atau titik pilihan pengguna (GPS / pencarian / tengah peta).
 * Sumber (semua resmi, diambil langsung):
 *   - Titik panas 7 hari: NASA FIRMS NRT (VIIRS S-NPP/NOAA-20/NOAA-21, MODIS) – salinan data/titik_id, disaring ke daratan Indonesia, diperbarui ±3 jam
 *   - Riwayat hujan & suhu sejak 2001: reanalisis ECMWF ERA5 (Copernicus) via Open-Meteo Historical API
 *   - Kualitas udara: Copernicus CAMS global (ECMWF) via Open-Meteo Air Quality API; kategori PM2.5 BMKG
 *   - Cuaca & bahaya kebakaran hari ini/14 hari: modul "Lokasi saya" (ECMWF IFS, CAMS, FWI/FDRS)
 *   - Hutan, tutupan lahan, karbon, riwayat titik panas 2016–sekarang, laporan & unduhan: Analisis area (server PRCF: Hansen GFC, GLAD, GFW, FIRMS)
 * Tidak ada angka yang dibuat-buat; bila sumber tidak menjangkau, ditulis apa adanya.
 */
(function () {
'use strict';
const BASE = (document.currentScript && document.currentScript.src ? new URL('../', document.currentScript.src).href : './');
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const N0 = n => Math.round(n).toLocaleString(LOC()), N1 = n => (Math.round(n * 10) / 10).toLocaleString(LOC());
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const hariWIB = t => new Date(t + 7 * 36e5).toISOString().slice(0, 10);
const rad = x => x * Math.PI / 180;
const km = (a, b, c, d) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const st = { get: (k, d) => { try { const v = localStorage.getItem('fhn_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('fhn_' + k, JSON.stringify(v)); } catch (e) { } } };
const akses = () => (window.FHAkun && FHAkun.akses ? FHAkun.akses() : { mode: 'umum' });
const toast = m => window.toastMsg ? toastMsg(m) : 0;
const EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const BLN_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], B = m => (EN() ? BLN_EN : BLN)[m];
const LOC = () => EN() ? 'en-US' : 'id-ID';

/* ---------- lokasi yang dihitung ---------- */
function ringsOf(g) { if (!g) return []; if (g.type === 'Feature') return ringsOf(g.geometry); if (g.type === 'FeatureCollection') return g.features.flatMap(ringsOf); if (g.type === 'Polygon') return [g.coordinates]; if (g.type === 'MultiPolygon') return g.coordinates; return []; }
function inPoly(lo, la, polys) {
  for (const P of polys) { let ins = false; for (let r = 0; r < P.length; r++) { const R = P[r]; let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, yi] = R[i], [xj, yj] = R[j]; if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c; } if (r === 0) ins = c; else if (c) ins = false; } if (ins) return true; }
  return false;
}
function lokasi() {
  const A = akses();
  if (A.mode === 'shp' && A.geojson) {
    const polys = ringsOf(A.geojson); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    polys.forEach(P => P[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    if (polys.length) return { lat: (y0 + y1) / 2, lon: (x0 + x1) / 2, label: A.nama || I('Wilayah saya', 'My area'), polys, bbox: [x0, y0, x1, y1], shp: true };
  }
  const L0 = st.get('lok', null) || (() => { try { const s = JSON.parse(localStorage.getItem('fh_lokasi') || 'null'); return s && s.lat ? s : null; } catch (e) { return null; } })();
  return L0 && L0.lat != null ? { lat: L0.lat, lon: L0.lon, label: L0.label || `${L0.lat.toFixed(3)}, ${L0.lon.toFixed(3)}` } : null;
}
async function setLok(lat, lon, src) {
  let label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try { if (window.FHWilayah) { const w = await FHWilayah.lookup(lat, lon); if (w) label = FHWilayah.label(w, false); } } catch (e) { }
  st.set('lok', { lat, lon, label, src }); return lokasi();
}
function lokBar(L, ulang) {
  const shp = L && L.shp;
  return `<div class="card" style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:10px"><span style="font-size:20px">${shp ? '🗺️' : '📍'}</span><span style="flex:1;min-width:0"><small class="muted" style="display:block;font-size:11px">${shp ? I('Wilayah terdaftar Anda', 'Your registered area') : I('Lokasi yang dihitung', 'Location analysed')}</small><b style="display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${L ? esc(L.label) : I('Belum dipilih', 'Not selected yet')}</b><small class="muted" style="font-size:11px">${L ? `${L.lat.toFixed(4)}, ${L.lon.toFixed(4)}` : ''}</small></span>
   ${shp ? '' : `<button class="chip" data-nl="gps">GPS</button><button class="chip" data-nl="peta">${I('Tengah peta', 'Map centre')}</button>`}</div>`;
}
function bindLok(ulang) {
  $$('[data-nl]').forEach(b => b.onclick = () => {
    if (b.dataset.nl === 'peta') { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return; const c = m.getCenter(); setLok(c.lat, c.lng, 'peta').then(ulang); return; }
    if (!navigator.geolocation) return toast(I('GPS tidak tersedia di perangkat ini', 'GPS is not available on this device'));
    b.textContent = I('Mencari…', 'Locating…'); navigator.geolocation.getCurrentPosition(p => setLok(p.coords.latitude, p.coords.longitude, 'gps').then(ulang), () => { b.textContent = 'GPS'; toast(I('Izinkan akses lokasi lalu coba lagi', 'Allow location access and try again')); }, { enableHighAccuracy: true, timeout: 15000 });
  });
}
const perluLok = (ulang) => `${lokBar(null)}<div class="empty">${I('Pilih lokasi dulu: ketuk <b>GPS</b> untuk posisi Anda, atau geser peta ke wilayah yang ingin dipantau lalu ketuk <b>Tengah peta</b>.', 'Choose a location first: tap <b>GPS</b> for your position, or move the map to the area you want to monitor and tap <b>Map centre</b>.')}</div>`;

/* ---------- grafik batang sederhana ---------- */
function bars(lbl, val, o = {}) {
  const W = innerWidth < 600 ? 360 : 640, H = o.h || (innerWidth < 600 ? 150 : 180), n = val.length, mx = Math.max(1, ...val.filter(v => v != null)), bw = W / n, ev = o.every || 1;
  return `<svg viewBox="0 0 ${W} ${H + 26}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(o.aria || 'grafik')}">
   ${[.25, .5, .75, 1].map(f => `<line x1="0" x2="${W}" y1="${H - f * H}" y2="${H - f * H}" stroke="currentColor" stroke-opacity=".08"/>`).join('')}
   <text x="2" y="11" font-size="11" fill="currentColor" fill-opacity=".55">${esc(o.fmt ? o.fmt(mx) : N0(mx))}${o.unit ? ' ' + o.unit : ''}</text>
   ${val.map((v, i) => v == null ? '' : `<rect x="${i * bw + bw * .14}" y="${H - v / mx * H}" width="${bw * .72}" height="${Math.max(1, v / mx * H)}" rx="2" fill="${o.col ? (typeof o.col === 'function' ? o.col(v, i) : o.col) : '#E4572E'}"><title>${esc(lbl[i])}: ${esc(o.fmt ? o.fmt(v) : N0(v))}${o.unit ? ' ' + o.unit : ''}</title></rect>`).join('')}
   ${lbl.map((l, i) => i % ev ? '' : `<text x="${i * bw + bw / 2}" y="${H + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity=".6">${esc(l)}</text>`).join('')}</svg>`;
}

/* ---------- 1. Titik panas 7 hari (sebaran / grafik singkat) ---------- */
let IDX = null; const TL = {};
const idx = () => IDX || (IDX = fetch(BASE + 'data/titik_id/indeks.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error('indeks'))).catch(e => { IDX = null; throw e; }));
const petak = k => TL[k] || (TL[k] = fetch(BASE + 'data/titik_id/' + k + '.json').then(r => r.ok ? r.json() : []).catch(() => []));
async function titik(L, rkm) {
  const I = await idx(); let x0, y0, x1, y1;
  if (L.shp) [x0, y0, x1, y1] = L.bbox; else { const d = rkm / 111, dl = rkm / (111 * Math.cos(rad(L.lat))); x0 = L.lon - dl; x1 = L.lon + dl; y0 = L.lat - d; y1 = L.lat + d; }
  const ks = []; for (let la = Math.floor(y0); la <= Math.floor(y1); la++) for (let lo = Math.floor(x0); lo <= Math.floor(x1); lo++) if (I.ubin[`${la}_${lo}`]) ks.push(`${la}_${lo}`);
  const out = [];
  for (const P of await Promise.all(ks.map(petak))) for (const r of P) {
    if (r[1] < x0 || r[1] > x1 || r[0] < y0 || r[0] > y1) continue;
    const d = km(L.lat, L.lon, r[0], r[1]);
    if (L.shp ? !inPoly(r[1], r[0], L.polys) : d > rkm) continue;
    out.push({ la: r[0], lo: r[1], when: r[2] * 6e4, sensor: (I.sensor || [])[r[3]] || '', frp: r[4], d });
  }
  return { P: out.sort((a, b) => b.when - a.when), upd: I.diperbarui_utc };
}
function sebaran(opt = {}) {
  let R = st.get('rad', 25), H = 7, D = null, err = '';
  const muat = async () => { const L = lokasi(); D = null; err = ''; draw(); if (!L) return; try { D = await titik(L, R); } catch (e) { err = e.message; D = { P: [] }; } draw(); };
  const draw = () => {
    const L = lokasi(), body = $('#pageBody'); if (!body) return;
    if (!L) { body.innerHTML = perluLok(); bindLok(muat); return; }
    const now = Date.now(), F = D ? D.P.filter(p => now - p.when <= H * 864e5 + 36e5) : [];
    const days = []; for (let k = 6; k >= 0; k--) days.push(hariWIB(now - k * 864e5));
    const perH = days.map(d => F.filter(p => hariWIB(p.when) === d).length), sens = {}; F.forEach(p => sens[p.sensor] = (sens[p.sensor] || 0) + 1);
    const near = F.length ? F.reduce((a, b) => a.d < b.d ? a : b) : null;
    body.innerHTML = `${lokBar(L)}
     ${L.shp ? '' : `<div class="seg" style="margin-bottom:8px">${[5, 25, 50, 100].map(r => `<button class="chip" data-r="${r}" aria-pressed="${R === r}">≤ ${r} km</button>`).join('')}</div>`}
     <div class="seg" style="margin-bottom:10px">${[[1, I('24 jam', '24 hours')], [3, I('3 hari', '3 days')], [7, I('7 hari', '7 days')]].map(([h, t]) => `<button class="chip" data-h="${h}" aria-pressed="${H === h}">${t}</button>`).join('')}</div>
     ${!D ? `<div class="empty">${I('Memuat titik panas NASA FIRMS…', 'Loading NASA FIRMS hotspots…')}</div>` : err ? `<div class="empty">${I('Data titik panas tidak dapat dimuat', 'Hotspot data could not be loaded')} (${esc(err)}). ${I('Periksa internet lalu coba lagi.', 'Check your connection and try again.')}</div>` : `
     <div class="stat3"><div class="card"><b>${N0(F.length)}</b><span>${I('titik', 'hotspots')} ${L.shp ? I('di dalam wilayah', 'inside the area') : '≤ ' + R + ' km'}</span></div><div class="card"><b>${near ? N1(near.d) : '–'}</b><span>${I('km titik terdekat dari ' + (L.shp ? 'pusat wilayah' : 'lokasi'), 'km to nearest hotspot from the ' + (L.shp ? 'area centre' : 'location'))}</span></div><div class="card"><b>${F.length ? N1(Math.max(...F.map(p => p.frp || 0))) : '–'}</b><span>${I('FRP tertinggi (MW)', 'Highest FRP (MW)')}</span></div></div>
     <div class="h2">${I('Titik panas per hari (WIB)', 'Hotspots per day (WIB)')}</div><div class="card chart">${bars(days.map(d => `${+d.slice(8)} ${B(+d.slice(5, 7) - 1)}`), perH, { aria: I('titik panas per hari', 'hotspots per day') })}</div>
     <div class="h2">${I('Per satelit', 'By satellite')}</div><div class="group">${Object.keys(sens).length ? Object.entries(sens).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<div class="row"><span class="m"><b>${esc(s)}</b></span><b class="num">${N0(n)}</b></div>`).join('') : `<div class="empty">${I('Tidak ada deteksi pada periode ini.', 'No detections in this period.')}</div>`}</div>
     ${tombolBagikan('nlShareS')}
     <div class="h2">${I('Titik terbaru', 'Latest hotspots')}</div><div class="group">${F.slice(0, 60).map((p, i) => { const w = new Date(p.when + 7 * 36e5); return `<button class="row tap" data-p="${i}" style="width:100%;text-align:left"><span class="m"><b>${w.getUTCDate()} ${B(w.getUTCMonth())} · ${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')} WIB</b><small>${esc(p.sensor)} · FRP ${N1(p.frp || 0)} MW · ${p.la.toFixed(4)}, ${p.lo.toFixed(4)}</small></span><b class="num">${N1(p.d)} km</b></button>`; }).join('') || `<div class="empty">${I('Tidak ada titik panas pada periode & jarak ini.', 'No hotspots in this period and distance.')} 🌿</div>`}</div>
     <p class="small muted" style="margin:12px 4px">${I('Sumber: NASA FIRMS near real-time (VIIRS 375 m & MODIS 1 km), salinan resmi diperbarui ±3 jam, disaring ke daratan Indonesia (batas OCHA COD-AB/BPS-BIG). Pembaruan', 'Source: NASA FIRMS near real-time (VIIRS 375 m & MODIS 1 km), official copy updated every ~3 hours, filtered to Indonesian land (OCHA COD-AB/BPS-BIG boundaries). Updated')}: ${esc((D.upd || '').replace('T', ' ').slice(0, 16))} UTC. ${I('Satu kebakaran bisa terdeteksi beberapa kali oleh satelit berbeda. Riwayat 2016–sekarang: <b>Analisis area</b>.', 'One fire can be detected several times by different satellites. History 2016–present: <b>Area analysis</b>.')}</p>`}`;
    bindLok(muat);
    $$('[data-r]').forEach(b => b.onclick = () => { R = +b.dataset.r; st.set('rad', R); muat(); });
    $$('[data-h]').forEach(b => b.onclick = () => { H = +b.dataset.h; draw(); });
    const sb = $('#nlShareS'); if (sb) sb.onclick = () => bagikan(`🔥 ${I('Titik panas', 'Hotspots')} ${L.shp ? I('di', 'in') + ' ' + L.label : '≤ ' + R + ' km ' + I('dari', 'from') + ' ' + L.label} · ${H === 1 ? I('24 jam', '24 h') : H + ' ' + I('hari', 'days')}: ${N0(F.length)} ${I('deteksi', 'detections')}${near ? '; ' + I('terdekat', 'nearest') + ' ' + N1(near.d) + ' km' : ''}\n${I('Sumber: NASA FIRMS · Pantau Rimbak', 'Source: NASA FIRMS · Pantau Rimbak')}`, SITUS);
    $$('[data-p]').forEach(b => b.onclick = () => { const p = F[+b.dataset.p]; if (window.FHApp) { FHApp.go('home'); setTimeout(() => FHApp.lihat(p.la, p.lo, 13), 300); } });
  };
  openPage(I('Titik Panas · Indonesia', 'Hotspots · Indonesia'), I('NASA FIRMS · 7 hari', 'NASA FIRMS · 7 days'), '', muat);
}

/* ---------- 2. Riwayat hujan & suhu ERA5 sejak 2001 ---------- */
const ERA = {};
function hujan() {
  let Y = null, D = null, err = '';
  const muat = async () => {
    const L = lokasi(); D = null; err = ''; draw(); if (!L) return;
    const k = `${L.lat.toFixed(2)},${L.lon.toFixed(2)}`, end = hariWIB(Date.now() - 6 * 864e5);
    try {
      D = ERA[k] || st.get('era_' + k + '_' + end, null) || (ERA[k] = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${L.lat.toFixed(4)}&longitude=${L.lon.toFixed(4)}&start_date=2001-01-01&end_date=${end}&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FJakarta&models=era5`).then(r => r.json()).then(j => { if (j.error) throw new Error(j.reason || 'galat'); return j.daily; })); ERA[k] = D; try { Object.keys(localStorage).filter(x => x.startsWith('fhn_era_')).forEach(x => localStorage.removeItem(x)); } catch (e) { } st.set('era_' + k + '_' + end, D);
    } catch (e) { err = /limit/i.test(e.message) ? I('batas harian layanan Open-Meteo tercapai, coba lagi besok', 'Open-Meteo daily limit reached, try again tomorrow') : e.message; delete ERA[k]; D = null; }
    if (D && !Y) Y = +D.time[D.time.length - 1].slice(0, 4);
    draw();
  };
  const draw = () => {
    const L = lokasi(), body = $('#pageBody'); if (!body) return;
    if (!L) { body.innerHTML = perluLok(); bindLok(muat); return; }
    if (!D) { body.innerHTML = `${lokBar(L)}${err ? `<div class="empty">${I('Data ERA5 tidak dapat dimuat', 'ERA5 data could not be loaded')} (${esc(err)}). ${I('Periksa internet lalu coba lagi.', 'Check your connection and try again.')}</div>` : `<div class="empty">${I('Memuat reanalisis ERA5 sejak 2001…', 'Loading ERA5 reanalysis since 2001…')}</div>`}`; bindLok(muat); return; }
    const t = D.time, p = D.precipitation_sum, tx = D.temperature_2m_max, yrs = [...new Set(t.map(s => +s.slice(0, 4)))];
    const tahun = {}, bulan = {}; t.forEach((s, i) => { if (p[i] == null) return; const y = +s.slice(0, 4), m = +s.slice(5, 7); (tahun[y] = tahun[y] || { p: 0, n: 0 }); tahun[y].p += p[i]; tahun[y].n++; const kk = y + '-' + m; (bulan[kk] = bulan[kk] || { p: 0, hk: 0, tx: 0, n: 0 }); bulan[kk].p += p[i]; if (p[i] < 1) bulan[kk].hk++; if (tx[i] != null) { bulan[kk].tx += tx[i]; bulan[kk].n++; } });
    const lengkap = yrs.filter(y => tahun[y] && tahun[y].n >= 360), normal = m => { const v = lengkap.filter(y => y !== Y && bulan[y + '-' + m]).map(y => bulan[y + '-' + m].p); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const ms = [...Array(12)].map((_, i) => i + 1), BY = ms.map(m => bulan[Y + '-' + m] ? bulan[Y + '-' + m].p : null), NR = ms.map(normal);
    const yl = yrs.filter(y => tahun[y] && tahun[y].n >= 360);
    body.innerHTML = `${lokBar(L)}
     <div class="seg" style="margin-bottom:10px;flex-wrap:wrap">${yrs.slice(-8).map(y => `<button class="chip" data-y="${y}" aria-pressed="${y === Y}">${y}</button>`).join('')}</div>
     <div class="stat3"><div class="card"><b>${N0(BY.reduce((a, b) => a + (b || 0), 0))}</b><span>${I('mm hujan', 'mm rainfall')} ${Y}${Y === yrs[yrs.length - 1] ? ' (' + I('s.d.', 'to') + ' ' + esc(t[t.length - 1].slice(8) + ' ' + B(+t[t.length - 1].slice(5, 7) - 1)) + ')' : ''}</span></div><div class="card"><b>${N0(ms.reduce((a, m) => a + (bulan[Y + '-' + m] ? bulan[Y + '-' + m].hk : 0), 0))}</b><span>${I('hari kering', 'dry days')} (&lt;1 mm) ${Y}</span></div><div class="card"><b>${yl.length ? N0(yl.reduce((a, y) => a + tahun[y].p, 0) / yl.length) : '–'}</b><span>${I('mm/tahun rata-rata', 'mm/year average')} ${yl[0] || ''}–${yl[yl.length - 1] || ''}</span></div></div>
     <div class="h2">${I('Hujan bulanan', 'Monthly rainfall')} ${Y} ${I('dibanding rata-rata', 'vs average')}</div><div class="card chart">${bars(ms.map(m => B(m - 1)), BY, { unit: 'mm', col: (v, i) => NR[i] != null && v < NR[i] * .6 ? '#D93025' : v > (NR[i] || 0) * 1.4 ? '#2F7FD1' : '#3B9C6E', aria: I('hujan bulanan', 'monthly rainfall') })}
      <div class="legend"><span><i style="background:#D93025"></i>&lt;60% ${I('normal (kering)', 'of normal (dry)')}</span><span><i style="background:#3B9C6E"></i>${I('mendekati normal', 'near normal')}</span><span><i style="background:#2F7FD1"></i>&gt;140% ${I('normal (basah)', 'of normal (wet)')}</span></div></div>
     <div class="h2">${I('Rata-rata bulanan', 'Monthly average')} ${lengkap[0]}–${lengkap[lengkap.length - 1]}${lengkap.includes(Y) ? ' ' + I('(tanpa ' + Y + ')', '(excl. ' + Y + ')') : ''}</div><div class="card chart">${bars(ms.map(m => B(m - 1)), NR, { unit: 'mm', col: '#7C9C8A', aria: I('normal bulanan', 'monthly normal') })}</div>
     <div class="h2">${I('Total hujan per tahun', 'Total rainfall per year')}</div><div class="card chart">${bars(yl.map(y => "'" + String(y).slice(2)), yl.map(y => tahun[y].p), { unit: 'mm', col: '#2F7FD1', every: Math.ceil(yl.length / 13), aria: I('hujan tahunan', 'annual rainfall') })}</div>
     <div class="h2">${I('Rekap', 'Summary')} ${Y}</div><div class="group">${ms.filter(m => bulan[Y + '-' + m]).map(m => { const b = bulan[Y + '-' + m]; return `<div class="row"><span class="m"><b>${B(m - 1)} ${Y}</b><small>${b.hk} ${I('hari kering · suhu maks. rata-rata', 'dry days · mean max. temperature')} ${b.n ? N1(b.tx / b.n) : '–'} °C · normal ${NR[m - 1] != null ? N0(NR[m - 1]) : '–'} mm</small></span><b class="num">${N0(b.p)} mm</b></div>`; }).join('')}</div>
     <p class="small muted" style="margin:12px 4px">${I('Sumber: reanalisis ECMWF ERA5 (Copernicus Climate Change Service, resolusi ±25 km) via Open-Meteo Historical Weather API, harian sejak 2001 hingga ±6 hari lalu, waktu WIB. Reanalisis adalah model berbasis pengamatan, bukan penakar hujan lokal; cocok untuk pola musim dan anomali kekeringan.', 'Source: ECMWF ERA5 reanalysis (Copernicus Climate Change Service, ~25 km resolution) via the Open-Meteo Historical Weather API, daily since 2001 up to ~6 days ago, WIB time. Reanalysis is an observation-based model, not a local rain gauge; suitable for seasonal patterns and drought anomalies.')}</p>`;
    bindLok(() => { Y = null; muat(); });
    $$('[data-y]').forEach(b => b.onclick = () => { Y = +b.dataset.y; draw(); });
  };
  openPage(I('Riwayat Hujan & Suhu', 'Rainfall & Temperature History'), I('ERA5 · sejak 2001', 'ERA5 · since 2001'), '', muat);
}

/* ---------- 3. Kualitas udara CAMS 30 hari ---------- */
function udara() {
  const KT = [[15.5, I('Baik', 'Good'), '#2E9E5B'], [55.4, I('Sedang', 'Moderate'), '#3B6FD1'], [150.4, I('Tidak Sehat', 'Unhealthy'), '#E8A317'], [250.4, I('Sangat Tidak Sehat', 'Very unhealthy'), '#D93025'], [1e9, I('Berbahaya', 'Hazardous'), '#6B1B1B']], kat = v => KT.find(k => v <= k[0]);
  let D = null, err = '';
  const muat = async () => {
    const L = lokasi(); D = null; err = ''; draw(); if (!L) return;
    try {
      const j = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${L.lat.toFixed(4)}&longitude=${L.lon.toFixed(4)}&hourly=pm2_5,aerosol_optical_depth&timezone=Asia%2FJakarta&domains=cams_global&past_days=30&forecast_days=4`).then(r => r.json());
      if (j.error) throw new Error(j.reason || 'galat');
      const g = {}; j.hourly.time.forEach((t, i) => { const v = j.hourly.pm2_5[i]; if (v == null) return; const d = t.slice(0, 10); (g[d] = g[d] || { d, s: 0, n: 0, mx: 0 }); g[d].s += v; g[d].n++; g[d].mx = Math.max(g[d].mx, v); });
      const today = hariWIB(Date.now()); D = Object.values(g).filter(x => x.n >= 18).map(x => ({ d: x.d, m: x.s / x.n, mx: x.mx, fc: x.d > today }));
    } catch (e) { err = e.message; D = []; }
    draw();
  };
  const draw = () => {
    const L = lokasi(), body = $('#pageBody'); if (!body) return;
    if (!L) { body.innerHTML = perluLok(); bindLok(muat); return; }
    if (D === null || !D.length) { body.innerHTML = `${lokBar(L)}<div class="empty">${D === null ? I('Memuat data CAMS…', 'Loading CAMS data…') : I('Data CAMS tidak dapat dimuat', 'CAMS data could not be loaded') + (err ? ' (' + esc(err) + ')' : '') + '.'}</div>`; bindLok(muat); return; }
    const past = D.filter(x => !x.fc), rata = past.reduce((a, x) => a + x.m, 0) / Math.max(1, past.length), top = past.reduce((a, x) => x.m > a.m ? x : a, past[0] || D[0]);
    body.innerHTML = `${lokBar(L)}
     <div class="stat3"><div class="card"><b>${N1(rata)}</b><span>${I('PM2.5 rata-rata harian 30 hari, µg/m³', 'PM2.5 30-day mean of daily values, µg/m³')}</span></div><div class="card"><b>${N1(top.m)}</b><span>${I('tertinggi', 'highest')} · ${esc(+top.d.slice(8) + ' ' + B(+top.d.slice(5, 7) - 1))}</span></div><div class="card"><b style="color:${kat(rata)[2]}">${kat(rata)[1]}</b><span>${I('kategori rata-rata (BMKG)', 'average category (BMKG)')}</span></div></div>
     <div class="h2">${I('PM2.5 rata-rata harian · 30 hari + prakiraan', 'Daily mean PM2.5 · 30 days + forecast')}</div><div class="card chart">${bars(D.map(x => +x.d.slice(8)), D.map(x => Math.round(x.m * 10) / 10), { unit: 'µg/m³', fmt: N1, col: (v, i) => D[i].fc ? '#B9A6E0' : kat(v)[2], every: 3, aria: I('PM2.5 harian', 'daily PM2.5') })}
      <div class="legend">${KT.slice(0, 4).map(k => `<span><i style="background:${k[2]}"></i>${k[1]}</span>`).join('')}<span><i style="background:#B9A6E0"></i>${I('Prakiraan', 'Forecast')}</span></div></div>
     <div class="h2">${I('Jumlah hari per kategori (30 hari)', 'Days per category (30 days)')}</div><div class="group">${KT.map(k => `<div class="row"><span class="ico-sq" style="background:${k[2]};width:14px;height:14px;border-radius:4px"></span><span class="m"><b>${k[1]}</b></span><b class="num">${past.filter(x => kat(x.m) === k).length} ${I('hari', 'days')}</b></div>`).join('')}</div>
     <p class="small muted" style="margin:12px 4px">${I('Sumber: Copernicus Atmosphere Monitoring Service (CAMS) global, ECMWF – via Open-Meteo Air Quality API (model ±40 km, bukan alat ukur lokal). Rata-rata harian dari nilai per jam (≥18 jam), waktu WIB. Kategori PM2.5 mengikuti BMKG.', 'Source: Copernicus Atmosphere Monitoring Service (CAMS) global, ECMWF – via the Open-Meteo Air Quality API (~40 km model, not a local sensor). Daily means from hourly values (≥18 hours), WIB time. PM2.5 categories follow BMKG (Indonesia).')}</p>`;
    bindLok(muat);
  };
  openPage(I('Kualitas Udara', 'Air Quality'), 'Copernicus CAMS', '', muat);
}

/* ---------- 4. Alat yang dihitung lewat Analisis area (server) ---------- */
const VIA_ANALISIS = {
  hutan: [['Kehilangan & tutupan hutan', 'Forest loss & cover'], ['Hansen/UMD Global Forest Change v1.13 (2001–2025) untuk wilayah Anda.', 'Hansen/UMD Global Forest Change v1.13 (2001–2025) for your area.']],
  tutupan: [['Tutupan & penggunaan lahan', 'Land cover & land use'], ['GLAD/University of Maryland 2000–2020 (30 m) dan ESA WorldCover 2021 (10 m) untuk wilayah Anda – data terbuka resmi.', 'GLAD/University of Maryland 2000–2020 (30 m) and ESA WorldCover 2021 (10 m) for your area – official open data.']],
  karbon: [['Emisi & stok karbon', 'Carbon emissions & stocks'], ['Model fluks karbon hutan GFW (Harris dkk. 2021) dan metode FREL untuk wilayah Anda.', 'GFW forest carbon flux model (Harris et al. 2021) and the FREL method for your area.']],
  kejadian: [['Riwayat titik panas', 'Hotspot history'], ['Arsip resmi NASA FIRMS untuk Indonesia sejak 2016 + tahun berjalan, dihitung di dalam batas wilayah Anda.', 'Official NASA FIRMS archive for Indonesia since 2016 + the current year, counted inside your area boundary.']],
  grafik: [['Grafik titik panas tahunan', 'Annual hotspot charts'], ['Arsip resmi NASA FIRMS sejak 2016, per tahun & per bulan, di dalam batas wilayah Anda.', 'Official NASA FIRMS archive since 2016, per year & month, inside your area boundary.']],
  bekas: [['Perubahan & gangguan lahan', 'Land change & disturbance'], ['Kehilangan tutupan pohon tahunan (Hansen) di wilayah Anda; gangguan vegetasi terbaru juga tampil di peta (lapisan NASA OPERA).', 'Annual tree cover loss (Hansen) in your area; recent vegetation disturbance is also shown on the map (NASA OPERA layer).']],
  lahankritis: [['Lahan kritis', 'Critical land'], ['Peta Lahan Kritis resmi dipakai untuk Kabupaten Kapuas Hulu. Di wilayah lain dihitung INDIKASI lahan kritis dari data terbuka (penutupan tajuk ESA WorldCover 2021 + kemiringan lereng Copernicus DEM, skoring Kemenhut) – bukan peta resmi.', 'The official Critical Land Map is used for Kapuas Hulu Regency. Elsewhere an INDICATION of critical land is computed from open data (ESA WorldCover 2021 canopy + Copernicus DEM slope, Ministry of Forestry scoring) – not an official map.']],
  laporan: [['Laporan PDF', 'PDF report'], ['Laporan lengkap analisis wilayah Anda (PDF) dibuat dari halaman Analisis area.', 'A full analysis report for your area (PDF) is generated from the Area analysis page.']],
  unduh: [['Unduh data', 'Download data'], ['Hasil analisis wilayah Anda dapat diunduh sebagai laporan PDF dan tabel CSV (Excel) dari halaman Analisis area.', 'Your area analysis can be downloaded as a PDF report and a CSV (Excel) table from the Area analysis page.']]
};
function lewatAnalisis(k) {
  const [[jd0, jd1], [k0, k1]] = VIA_ANALISIS[k], jd = I(jd0, jd1), ket = I(k0, k1), A = akses(), shp = A.mode === 'shp';
  window.openSheet(`<h3>${esc(jd)}</h3><p class="sub">${esc(ket)}</p><p class="sub">${shp ? I(`Wilayah <b>${esc(A.nama)}</b> sudah terdaftar – hasilnya ada di <b>Analisis area</b>.`, `Area <b>${esc(A.nama)}</b> is registered – results are in <b>Area analysis</b>.`) : I('Untuk wilayah mana pun di Indonesia: unggah batas wilayah (SHP/GeoJSON/KML) di <b>Analisis area</b>. Perhitungan memakai data resmi yang sama dengan 6 Hutan Desa dampingan PRCF.', 'For any area in Indonesia: upload a boundary (SHP/GeoJSON/KML) in <b>Area analysis</b>. Calculations use the same official data as the 6 Village Forests supported by PRCF.')}</p>
   <button class="btn pri full tap" id="nlAn">${shp ? I('Buka analisis wilayah saya', 'Open my area analysis') : I('Analisis wilayah (unggah SHP)', 'Analyse an area (upload SHP)')}</button>`);
  $('#nlAn').onclick = () => { history.back(); setTimeout(() => window.FHApp && FHApp.hubGo('analisis'), 120); };
}

/* ---------- 5. Lintasan satelit pendeteksi titik panas di lokasi ---------- */
function satelit() {
  let P = null, err = '';
  const muat = async () => { const L = lokasi(); P = null; err = ''; draw(); if (!L || !window.FHLintas) return; try { const X = await FHLintas.next(L.lat, L.lon, 12); P = (X && X.list) || (Array.isArray(X) ? X : []); } catch (e) { err = e.message || String(e); P = []; } draw(); };
  const draw = () => {
    const L = lokasi(), body = $('#pageBody'); if (!body) return;
    if (!L) { body.innerHTML = perluLok(); bindLok(muat); return; }
    const jam = t => { const w = new Date(t.getTime() + 7 * 36e5); return `${w.getUTCDate()} ${B(w.getUTCMonth())} · ${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')} WIB`; };
    body.innerHTML = `${lokBar(L)}${P === null ? `<div class="empty">${I('Menghitung lintasan satelit…', 'Computing satellite passes…')}</div>` : !P.length ? `<div class="empty">${I('Lintasan tidak dapat dihitung', 'Passes could not be computed')}${err ? ' (' + esc(err) + ')' : ''}.</div>` : `
     <div class="h2">${I('Satelit pendeteksi titik panas berikutnya', 'Next hotspot-detecting satellites')}</div><div class="group">${P.slice(0, 12).map(x => `<div class="row"><span class="m"><b>${esc(x.nama)} · ${esc(x.sensor)}</b><small>${jam(x.t)} · ${x.siang ? I('siang', 'day') : I('malam', 'night')} · ${N0(x.km)} ${I('km dari jejak orbit', 'km from ground track')}${x.tepi ? I(' (tepi sapuan)', ' (swath edge)') : ''}</small></span></div>`).join('')}</div>
     <p class="small muted" style="margin:12px 4px">${I('Orbit dari TLE CelesTrak (diperbarui otomatis tiap 3 jam), propagasi SGP4. Satelit dihitung melintas bila lokasi berada di dalam lebar sapuan sensor (MODIS 2.330 km, VIIRS 3.060 km). Titik panas biasanya muncul di NASA FIRMS ±3 jam setelah lintasan.', 'Orbits from CelesTrak TLEs (updated automatically every 3 hours), SGP4 propagation. A satellite counts as passing when the location is inside the sensor swath (MODIS 2,330 km, VIIRS 3,060 km). Hotspots usually appear in NASA FIRMS ~3 hours after the pass.')}</p>`}`;
    bindLok(muat);
  };
  openPage(I('Lintasan Satelit', 'Satellite Passes'), I('Jadwal satelit lewat · SGP4', 'Pass schedule · SGP4'), '', muat);
}

/* ---------- 6. Bagikan (WhatsApp / bagikan bawaan HP / salin tautan) ---------- */
const SITUS = 'https://erikprcfi.github.io/hotspot-fire-prcf/';
async function bagikan(teks, url) {
  const t = teks + (url ? '\n' + url : '');
  try { if (navigator.share) { await navigator.share({ title: 'Pantau Rimbak', text: teks, url: url || SITUS }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  window.openSheet(`<h3>${I('Bagikan', 'Share')}</h3><p class="sub" style="white-space:pre-line">${esc(t)}</p>
   <div style="display:grid;gap:10px"><a class="btn pri full tap" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t)}">WhatsApp</a><button class="btn full tap" id="nlCopy">${I('Salin teks', 'Copy text')}</button></div>`);
  $('#nlCopy').onclick = async () => { try { await navigator.clipboard.writeText(t); toast(I('Tersalin', 'Copied')); } catch (e) { toast(I('Tidak dapat menyalin', 'Could not copy')); } };
}
const tombolBagikan = id => `<button class="btn full tap" id="${id}" style="margin-top:14px">📤 ${I('Bagikan', 'Share')}</button>`;

/* ---------- 7. Indonesia hari ini: titik panas per provinsi & kabupaten (data/titik_id/ringkasan.json) ---------- */
function ringkas() {
  let D = null, err = '', buka = null;
  const muat = async () => { try { D = await fetch(BASE + 'data/titik_id/ringkasan.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); } catch (e) { err = e.message; D = null; } draw(); };
  const draw = () => {
    const body = $('#pageBody'); if (!body) return;
    if (!D) { body.innerHTML = `<div class="empty">${err ? I('Ringkasan belum dapat dimuat', 'Summary could not be loaded') + ' (' + esc(err) + ').' : I('Memuat ringkasan nasional…', 'Loading national summary…')}</div>`; return; }
    const P = D.provinsi || [], days = Object.keys(D.harian || {}), w = new Date(Date.parse(D.diperbarui_utc) + 7 * 36e5);
    const jam = isNaN(w) ? '' : `${w.getUTCDate()} ${B(w.getUTCMonth())} ${w.getUTCFullYear()}, ${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')} WIB`;
    const top = P.slice(0, 10), mx = Math.max(1, ...top.map(p => p.n7));
    body.innerHTML = `<div class="stat3"><div class="card"><b>${N0(D.total24)}</b><span>${I('deteksi 24 jam terakhir', 'detections, last 24 h')}</span></div><div class="card"><b>${N0(D.total7)}</b><span>${I('deteksi 7 hari', 'detections, 7 days')}</span></div><div class="card"><b>${P.filter(p => p.n24 > 0).length}</b><span>${I('provinsi dengan titik panas 24 jam', 'provinces with hotspots, 24 h')}</span></div></div>
     <div class="h2">${I('Deteksi per hari · seluruh Indonesia (WIB)', 'Detections per day · all of Indonesia (WIB)')}</div><div class="card chart">${bars(days.map(d => `${+d.slice(8)} ${B(+d.slice(5, 7) - 1)}`), days.map(d => D.harian[d]), { aria: I('deteksi per hari', 'detections per day') })}
      <p class="small muted" style="margin:6px 2px 0">${I('Hari pertama dan terakhir belum lengkap (jendela 7 hari bergeser; data masuk tiap ±3 jam).', 'The first and last days are incomplete (rolling 7-day window; data arrives every ~3 hours).')}</p></div>
     <div class="h2">${I('10 provinsi terbanyak · 7 hari', 'Top 10 provinces · 7 days')}</div><div class="card" style="padding:12px 14px">${top.map(p => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;margin:6px 0"><span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.nama)}</span><b style="font-size:13px">${N0(p.n7)}</b><span style="grid-column:1/3;height:8px;border-radius:4px;background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:${Math.max(2, p.n7 / mx * 100)}%;background:#E4572E;border-radius:4px"></i></span></div>`).join('')}</div>
     <div class="h2">${I('Semua provinsi', 'All provinces')}</div><div class="group">${P.map((p, i) => `<button class="row tap" data-pv="${i}" style="width:100%;text-align:left;flex-wrap:wrap"><span class="m"><b>${esc(p.nama)}</b><small>${N0(p.n24)} ${I('dalam 24 jam', 'in 24 h')} · ${p.kab.length} ${I('kab/kota', 'regencies')}</small></span><b class="num">${N0(p.n7)}</b>
       ${buka === i ? `<div style="flex-basis:100%;margin-top:8px">${p.kab.slice(0, 15).map(k => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:3px 0;border-top:1px solid var(--line)"><span>${esc(k.nama)}</span><span>${N0(k.n24)} / <b>${N0(k.n7)}</b></span></div>`).join('')}${p.kab.length > 15 ? `<div class="small muted">+${p.kab.length - 15} ${I('kab/kota lain', 'more')}</div>` : ''}
         <div style="display:flex;gap:8px;margin-top:8px"><span class="chip" data-peta="${i}">🗺️ ${I('Lihat di peta', 'Show on map')}</span></div></div>` : ''}</button>`).join('')}</div>
     <p class="small muted" style="margin:12px 4px">${I('Angka per kabupaten: 24 jam / 7 hari.', 'Regency figures: 24 h / 7 days.')} ${esc(I(D.catatan, 'Satellite detections, not the number of fires: one fire can be detected several times by different satellites/passes. Times in WIB.'))} ${I('Sumber', 'Source')}: ${esc(D.sumber)}. ${I('Diperbarui', 'Updated')}: ${esc(jam)}.</p>
     ${tombolBagikan('nlShareR')}`;
    $$('[data-pv]').forEach(b => b.onclick = e => { if (e.target.closest('[data-peta]')) return; const i = +b.dataset.pv; buka = buka === i ? null : i; draw(); });
    $$('[data-peta]').forEach(b => b.onclick = e => { e.stopPropagation(); const p = P[+b.dataset.peta], bb = p.bbox; if (!bb || !window.FHApp) return; FHApp.go('home'); setTimeout(() => { const m = FHApp.map && FHApp.map(); if (m) m.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]]); try { const A = FHApp.api && FHApp.api(); if (A && !A.id) A.set('fire'); } catch (er) { } }, 300); });
    $('#nlShareR').onclick = () => bagikan(`🔥 ${I('Titik panas Indonesia', 'Indonesia hotspots')} – ${jam}\n${I('24 jam', '24 h')}: ${N0(D.total24)} ${I('deteksi', 'detections')}; ${I('7 hari', '7 days')}: ${N0(D.total7)}\n${I('Terbanyak (7 hari)', 'Most (7 days)')}: ${P.slice(0, 3).map(p => p.nama + ' ' + N0(p.n7)).join(', ')}\n${I('Sumber: NASA FIRMS · Pantau Rimbak (Yayasan PRCF Indonesia)', 'Source: NASA FIRMS · Pantau Rimbak (Yayasan PRCF Indonesia)')}`, SITUS);
  };
  openPage(I('Indonesia Hari Ini', 'Indonesia Today'), I('Titik panas per provinsi & kabupaten', 'Hotspots by province & regency'), '', muat);
}

/* ---------- 8. Panduan: membaca data & mencegah kebakaran (tautan resmi, tanpa nomor yang tidak terverifikasi) ---------- */
function panduan() {
  const S = (j, isi) => `<div class="h2">${j}</div><div class="card" style="padding:14px 16px;line-height:1.6">${isi}</div>`;
  const L = (u, t) => `<a href="${u}" target="_blank" rel="noopener" style="color:var(--brand-3,#1E7A58);font-weight:700">${t}</a>`;
  openPage(I('Panduan', 'Guide'), I('Membaca data & mencegah kebakaran', 'Reading the data & preventing fires'), `<div class="pad">
   ${S(I('Apa itu titik panas?', 'What is a hotspot?'), I('Titik panas adalah piksel citra satelit yang jauh lebih panas dari sekitarnya, dideteksi sensor VIIRS (375 m) dan MODIS (1 km) milik NASA/NOAA. Titik panas <b>belum tentu kebakaran hutan</b> – bisa juga pembakaran lahan, cerobong industri atau gas suar. Satu kebakaran bisa terdeteksi beberapa kali oleh satelit berbeda. Awan tebal dan asap dapat menutupi api sehingga tidak terdeteksi.', 'A hotspot is a satellite image pixel much hotter than its surroundings, detected by the NASA/NOAA VIIRS (375 m) and MODIS (1 km) sensors. A hotspot is <b>not necessarily a forest fire</b> – it can also be land clearing, an industrial stack or a gas flare. One fire can be detected several times by different satellites. Thick cloud and smoke can hide fires from the satellites.'))}
   ${S(I('Keyakinan & FRP', 'Confidence & FRP'), I('<b>Keyakinan</b> (rendah/nominal/tinggi) menunjukkan seberapa yakin algoritma NASA bahwa piksel itu api aktif. <b>FRP</b> (Fire Radiative Power, megawatt) adalah energi panas yang dipancarkan: makin besar, makin kuat api saat satelit lewat. Titik dengan keyakinan tinggi dan FRP besar, terutama yang berulang beberapa hari, sebaiknya diprioritaskan untuk dicek lapangan.', '<b>Confidence</b> (low/nominal/high) shows how sure the NASA algorithm is that the pixel is an active fire. <b>FRP</b> (Fire Radiative Power, megawatts) is the radiated heat: the larger it is, the stronger the fire when the satellite passed. Points with high confidence and large FRP, especially repeated over several days, should be prioritised for field checks.'))}
   ${S(I('Kualitas udara (PM2.5)', 'Air quality (PM2.5)'), I('PM2.5 adalah partikel halus asap. Kategori di aplikasi mengikuti BMKG: Baik, Sedang, Tidak Sehat, Sangat Tidak Sehat, Berbahaya. Saat kategori <b>Tidak Sehat</b> atau lebih buruk: kurangi aktivitas di luar ruangan, pakai masker yang rapat (mis. N95/KN95), tutup jendela, dan lindungi anak, lansia, ibu hamil serta penderita penyakit pernapasan.', 'PM2.5 is fine smoke particulate. Categories in the app follow BMKG: Good, Moderate, Unhealthy, Very unhealthy, Hazardous. At <b>Unhealthy</b> or worse: reduce outdoor activity, wear a well-fitting mask (e.g. N95/KN95), close windows, and protect children, the elderly, pregnant women and people with respiratory illness.'))}
   ${S(I('Mencegah kebakaran hutan & lahan', 'Preventing forest & land fires'), I('<ul style="margin:0;padding-left:18px"><li>Jangan membakar untuk membuka atau membersihkan lahan, terutama di lahan gambut – api gambut bisa menjalar di bawah tanah dan sulit dipadamkan.</li><li>Pastikan api unggun, puntung rokok dan sisa pembakaran benar-benar padam.</li><li>Waspadai musim kemarau dan hari dengan bahaya kebakaran tinggi (lihat Prakiraan).</li><li>Bila melihat api atau asap mencurigakan, jangan memadamkan sendiri bila berbahaya – segera laporkan ke perangkat desa, Masyarakat Peduli Api, BPBD atau Manggala Agni setempat.</li></ul>', '<ul style="margin:0;padding-left:18px"><li>Do not burn to clear or clean land, especially on peat – peat fires can spread underground and are hard to extinguish.</li><li>Make sure campfires, cigarette butts and burning debris are fully out.</li><li>Be alert in the dry season and on days of high fire danger (see Forecast).</li><li>If you see a fire or suspicious smoke, do not fight it alone if it is dangerous – report it to the village office, the local fire-care community (MPA), BPBD or Manggala Agni.</li></ul>'))}
   ${S(I('Informasi resmi', 'Official information'), `<div style="display:grid;gap:8px">${L('https://sipongi.menlhk.go.id/', 'SiPongi – Karhutla Monitoring System (Kemenhut)')}${L('https://bnpb.go.id/', 'BNPB – Badan Nasional Penanggulangan Bencana')}${L('https://www.bmkg.go.id/', 'BMKG – cuaca & kualitas udara')}${L('https://firms.modaps.eosdis.nasa.gov/map/', 'NASA FIRMS – peta titik panas dunia')}</div><p class="small muted" style="margin:10px 0 0">${I('Nomor darurat setempat (BPBD, pemadam kebakaran) berbeda di tiap daerah – simpan nomor resmi dari pemerintah daerah Anda.', 'Local emergency numbers (BPBD, fire brigade) differ by region – save the official numbers from your local government.')}</p>`)}
   ${tombolBagikan('nlShareP')}</div>`, () => { $('#nlShareP').onclick = () => bagikan(I('Pantau Rimbak – pantau titik panas, asap, angin & hutan di seluruh Indonesia dari data satelit resmi (NASA, ECMWF, Copernicus).', 'Pantau Rimbak – monitor hotspots, smoke, wind & forests across Indonesia from official satellite data (NASA, ECMWF, Copernicus).'), SITUS); });
}

const ALAT = { sebaran, hujan, udara, satelit, ringkas, panduan, cuaca: () => window.FHApp && FHApp.hubGo('lokasi') };
Object.keys(VIA_ANALISIS).forEach(k => ALAT[k] = () => lewatAnalisis(k));
window.FHNasional = { punya: k => !!ALAT[k], buka: k => ALAT[k](), lokasi, setLok, titik, bagikan };
})();
