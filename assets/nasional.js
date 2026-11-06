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
const N0 = n => Math.round(n).toLocaleString('id-ID'), N1 = n => (Math.round(n * 10) / 10).toLocaleString('id-ID');
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const hariWIB = t => new Date(t + 7 * 36e5).toISOString().slice(0, 10);
const rad = x => x * Math.PI / 180;
const km = (a, b, c, d) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const st = { get: (k, d) => { try { const v = localStorage.getItem('fhn_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('fhn_' + k, JSON.stringify(v)); } catch (e) { } } };
const akses = () => (window.FHAkun && FHAkun.akses ? FHAkun.akses() : { mode: 'umum' });
const toast = m => window.toastMsg ? toastMsg(m) : 0;

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
    if (polys.length) return { lat: (y0 + y1) / 2, lon: (x0 + x1) / 2, label: A.nama || 'Wilayah saya', polys, bbox: [x0, y0, x1, y1], shp: true };
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
  return `<div class="card" style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:10px"><span style="font-size:20px">${shp ? '🗺️' : '📍'}</span><span style="flex:1;min-width:0"><small class="muted" style="display:block;font-size:11px">${shp ? 'Wilayah terdaftar Anda' : 'Lokasi yang dihitung'}</small><b style="display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${L ? esc(L.label) : 'Belum dipilih'}</b><small class="muted" style="font-size:11px">${L ? `${L.lat.toFixed(4)}, ${L.lon.toFixed(4)}` : ''}</small></span>
   ${shp ? '' : `<button class="chip" data-nl="gps">GPS</button><button class="chip" data-nl="peta">Tengah peta</button>`}</div>`;
}
function bindLok(ulang) {
  $$('[data-nl]').forEach(b => b.onclick = () => {
    if (b.dataset.nl === 'peta') { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return; const c = m.getCenter(); setLok(c.lat, c.lng, 'peta').then(ulang); return; }
    if (!navigator.geolocation) return toast('GPS tidak tersedia di perangkat ini');
    b.textContent = 'Mencari…'; navigator.geolocation.getCurrentPosition(p => setLok(p.coords.latitude, p.coords.longitude, 'gps').then(ulang), () => { b.textContent = 'GPS'; toast('Izinkan akses lokasi lalu coba lagi'); }, { enableHighAccuracy: true, timeout: 15000 });
  });
}
const perluLok = (ulang) => `${lokBar(null)}<div class="empty">Pilih lokasi dulu: ketuk <b>GPS</b> untuk posisi Anda, atau geser peta ke wilayah yang ingin dipantau lalu ketuk <b>Tengah peta</b>.</div>`;

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
     <div class="seg" style="margin-bottom:10px">${[[1, '24 jam'], [3, '3 hari'], [7, '7 hari']].map(([h, t]) => `<button class="chip" data-h="${h}" aria-pressed="${H === h}">${t}</button>`).join('')}</div>
     ${!D ? '<div class="empty">Memuat titik panas NASA FIRMS…</div>' : err ? `<div class="empty">Data titik panas tidak dapat dimuat (${esc(err)}). Periksa internet lalu coba lagi.</div>` : `
     <div class="stat3"><div class="card"><b>${N0(F.length)}</b><span>titik ${L.shp ? 'di dalam wilayah' : '≤ ' + R + ' km'}</span></div><div class="card"><b>${near ? N1(near.d) : '–'}</b><span>km titik terdekat dari ${L.shp ? 'pusat wilayah' : 'lokasi'}</span></div><div class="card"><b>${F.length ? N1(Math.max(...F.map(p => p.frp || 0))) : '–'}</b><span>FRP tertinggi (MW)</span></div></div>
     <div class="h2">Titik panas per hari (WIB)</div><div class="card chart">${bars(days.map(d => `${+d.slice(8)} ${BLN[+d.slice(5, 7) - 1]}`), perH, { aria: 'titik panas per hari' })}</div>
     <div class="h2">Per satelit</div><div class="group">${Object.keys(sens).length ? Object.entries(sens).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<div class="row"><span class="m"><b>${esc(s)}</b></span><b class="num">${N0(n)}</b></div>`).join('') : '<div class="empty">Tidak ada deteksi pada periode ini.</div>'}</div>
     <div class="h2">Titik terbaru</div><div class="group">${F.slice(0, 60).map((p, i) => { const w = new Date(p.when + 7 * 36e5); return `<button class="row tap" data-p="${i}" style="width:100%;text-align:left"><span class="m"><b>${w.getUTCDate()} ${BLN[w.getUTCMonth()]} · ${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')} WIB</b><small>${esc(p.sensor)} · FRP ${N1(p.frp || 0)} MW · ${p.la.toFixed(4)}, ${p.lo.toFixed(4)}</small></span><b class="num">${N1(p.d)} km</b></button>`; }).join('') || '<div class="empty">Tidak ada titik panas pada periode & jarak ini. 🌿</div>'}</div>
     <p class="small muted" style="margin:12px 4px">Sumber: NASA FIRMS near real-time (VIIRS 375 m & MODIS 1 km), salinan resmi diperbarui ±3 jam, disaring ke daratan Indonesia (batas OCHA COD-AB/BPS-BIG). Pembaruan: ${esc((D.upd || '').replace('T', ' ').slice(0, 16))} UTC. Satu kebakaran bisa terdeteksi beberapa kali oleh satelit berbeda. Riwayat 2016–sekarang: <b>Analisis area</b>.</p>`}`;
    bindLok(muat);
    $$('[data-r]').forEach(b => b.onclick = () => { R = +b.dataset.r; st.set('rad', R); muat(); });
    $$('[data-h]').forEach(b => b.onclick = () => { H = +b.dataset.h; draw(); });
    $$('[data-p]').forEach(b => b.onclick = () => { const p = F[+b.dataset.p]; if (window.FHApp) { FHApp.go('home'); setTimeout(() => FHApp.lihat(p.la, p.lo, 13), 300); } });
  };
  openPage('Titik Panas · Indonesia', 'NASA FIRMS · 7 hari', '', muat);
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
    } catch (e) { err = /limit/i.test(e.message) ? 'batas harian layanan Open-Meteo tercapai, coba lagi besok' : e.message; delete ERA[k]; D = null; }
    if (D && !Y) Y = +D.time[D.time.length - 1].slice(0, 4);
    draw();
  };
  const draw = () => {
    const L = lokasi(), body = $('#pageBody'); if (!body) return;
    if (!L) { body.innerHTML = perluLok(); bindLok(muat); return; }
    if (!D) { body.innerHTML = `${lokBar(L)}${err ? `<div class="empty">Data ERA5 tidak dapat dimuat (${esc(err)}). Periksa internet lalu coba lagi.</div>` : '<div class="empty">Memuat reanalisis ERA5 sejak 2001…</div>'}`; bindLok(muat); return; }
    const t = D.time, p = D.precipitation_sum, tx = D.temperature_2m_max, yrs = [...new Set(t.map(s => +s.slice(0, 4)))];
    const tahun = {}, bulan = {}; t.forEach((s, i) => { if (p[i] == null) return; const y = +s.slice(0, 4), m = +s.slice(5, 7); (tahun[y] = tahun[y] || { p: 0, n: 0 }); tahun[y].p += p[i]; tahun[y].n++; const kk = y + '-' + m; (bulan[kk] = bulan[kk] || { p: 0, hk: 0, tx: 0, n: 0 }); bulan[kk].p += p[i]; if (p[i] < 1) bulan[kk].hk++; if (tx[i] != null) { bulan[kk].tx += tx[i]; bulan[kk].n++; } });
    const normal = m => { const v = yrs.filter(y => y < Y && bulan[y + '-' + m]).map(y => bulan[y + '-' + m].p); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const ms = [...Array(12)].map((_, i) => i + 1), BY = ms.map(m => bulan[Y + '-' + m] ? bulan[Y + '-' + m].p : null), NR = ms.map(normal);
    const yl = yrs.filter(y => tahun[y] && tahun[y].n >= 360);
    body.innerHTML = `${lokBar(L)}
     <div class="seg" style="margin-bottom:10px;flex-wrap:wrap">${yrs.slice(-8).map(y => `<button class="chip" data-y="${y}" aria-pressed="${y === Y}">${y}</button>`).join('')}</div>
     <div class="stat3"><div class="card"><b>${N0(BY.reduce((a, b) => a + (b || 0), 0))}</b><span>mm hujan ${Y}${Y === yrs[yrs.length - 1] ? ' (s.d. ' + esc(t[t.length - 1].slice(8) + ' ' + BLN[+t[t.length - 1].slice(5, 7) - 1]) + ')' : ''}</span></div><div class="card"><b>${N0(ms.reduce((a, m) => a + (bulan[Y + '-' + m] ? bulan[Y + '-' + m].hk : 0), 0))}</b><span>hari kering (&lt;1 mm) ${Y}</span></div><div class="card"><b>${yl.length ? N0(yl.reduce((a, y) => a + tahun[y].p, 0) / yl.length) : '–'}</b><span>mm/tahun rata-rata ${yl[0] || ''}–${yl[yl.length - 1] || ''}</span></div></div>
     <div class="h2">Hujan bulanan ${Y} dibanding rata-rata</div><div class="card chart">${bars(ms.map(m => BLN[m - 1]), BY, { unit: 'mm', col: (v, i) => NR[i] != null && v < NR[i] * .6 ? '#D93025' : v > (NR[i] || 0) * 1.4 ? '#2F7FD1' : '#3B9C6E', aria: 'hujan bulanan' })}
      <div class="legend"><span><i style="background:#D93025"></i>&lt;60% normal (kering)</span><span><i style="background:#3B9C6E"></i>mendekati normal</span><span><i style="background:#2F7FD1"></i>&gt;140% normal (basah)</span></div></div>
     <div class="h2">Rata-rata bulanan ${yrs[0]}–${Y - 1}</div><div class="card chart">${bars(ms.map(m => BLN[m - 1]), NR, { unit: 'mm', col: '#7C9C8A', aria: 'normal bulanan' })}</div>
     <div class="h2">Total hujan per tahun</div><div class="card chart">${bars(yl.map(y => "'" + String(y).slice(2)), yl.map(y => tahun[y].p), { unit: 'mm', col: '#2F7FD1', every: Math.ceil(yl.length / 13), aria: 'hujan tahunan' })}</div>
     <div class="h2">Rekap ${Y}</div><div class="group">${ms.filter(m => bulan[Y + '-' + m]).map(m => { const b = bulan[Y + '-' + m]; return `<div class="row"><span class="m"><b>${BLN[m - 1]} ${Y}</b><small>${b.hk} hari kering · suhu maks. rata-rata ${b.n ? N1(b.tx / b.n) : '–'} °C · normal ${NR[m - 1] != null ? N0(NR[m - 1]) : '–'} mm</small></span><b class="num">${N0(b.p)} mm</b></div>`; }).join('')}</div>
     <p class="small muted" style="margin:12px 4px">Sumber: reanalisis ECMWF ERA5 (Copernicus Climate Change Service, resolusi ±25 km) via Open-Meteo Historical Weather API, harian sejak 2001 hingga ±6 hari lalu, waktu WIB. Reanalisis adalah model berbasis pengamatan, bukan penakar hujan lokal; cocok untuk pola musim dan anomali kekeringan.</p>`;
    bindLok(() => { Y = null; muat(); });
    $$('[data-y]').forEach(b => b.onclick = () => { Y = +b.dataset.y; draw(); });
  };
  openPage('Riwayat Hujan & Suhu', 'ERA5 · sejak 2001', '', muat);
}

/* ---------- 3. Kualitas udara CAMS 30 hari ---------- */
function udara() {
  const KT = [[15.5, 'Baik', '#2E9E5B'], [55.4, 'Sedang', '#3B6FD1'], [150.4, 'Tidak Sehat', '#E8A317'], [250.4, 'Sangat Tidak Sehat', '#D93025'], [1e9, 'Berbahaya', '#6B1B1B']], kat = v => KT.find(k => v <= k[0]);
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
    if (D === null || !D.length) { body.innerHTML = `${lokBar(L)}<div class="empty">${D === null ? 'Memuat data CAMS…' : 'Data CAMS tidak dapat dimuat' + (err ? ' (' + esc(err) + ')' : '') + '.'}</div>`; bindLok(muat); return; }
    const past = D.filter(x => !x.fc), rata = past.reduce((a, x) => a + x.m, 0) / Math.max(1, past.length), top = past.reduce((a, x) => x.m > a.m ? x : a, past[0] || D[0]);
    body.innerHTML = `${lokBar(L)}
     <div class="stat3"><div class="card"><b>${N1(rata)}</b><span>PM2.5 rata-rata harian 30 hari, µg/m³</span></div><div class="card"><b>${N1(top.m)}</b><span>tertinggi · ${esc(+top.d.slice(8) + ' ' + BLN[+top.d.slice(5, 7) - 1])}</span></div><div class="card"><b style="color:${kat(rata)[2]}">${kat(rata)[1]}</b><span>kategori rata-rata (BMKG)</span></div></div>
     <div class="h2">PM2.5 rata-rata harian · 30 hari + prakiraan</div><div class="card chart">${bars(D.map(x => +x.d.slice(8)), D.map(x => Math.round(x.m * 10) / 10), { unit: 'µg/m³', fmt: N1, col: (v, i) => D[i].fc ? '#B9A6E0' : kat(v)[2], every: 3, aria: 'PM2.5 harian' })}
      <div class="legend">${KT.slice(0, 4).map(k => `<span><i style="background:${k[2]}"></i>${k[1]}</span>`).join('')}<span><i style="background:#B9A6E0"></i>Prakiraan</span></div></div>
     <div class="h2">Jumlah hari per kategori (30 hari)</div><div class="group">${KT.map(k => `<div class="row"><span class="ico-sq" style="background:${k[2]};width:14px;height:14px;border-radius:4px"></span><span class="m"><b>${k[1]}</b></span><b class="num">${past.filter(x => kat(x.m) === k).length} hari</b></div>`).join('')}</div>
     <p class="small muted" style="margin:12px 4px">Sumber: Copernicus Atmosphere Monitoring Service (CAMS) global, ECMWF – via Open-Meteo Air Quality API (model ±40 km, bukan alat ukur lokal). Rata-rata harian dari nilai per jam (≥18 jam), waktu WIB. Kategori PM2.5 mengikuti BMKG.</p>`;
    bindLok(muat);
  };
  openPage('Kualitas Udara', 'Copernicus CAMS', '', muat);
}

/* ---------- 4. Alat yang dihitung lewat Analisis area (server) ---------- */
const VIA_ANALISIS = {
  hutan: ['Kehilangan & tutupan hutan', 'Hansen/UMD Global Forest Change v1.13 (2001–2025) untuk wilayah Anda.'],
  tutupan: ['Tutupan & penggunaan lahan', 'GLAD/University of Maryland 2000–2020 (30 m) dan ESA WorldCover 2021 (10 m) untuk wilayah Anda; peta KLHK dipakai bila tersedia.'],
  karbon: ['Emisi & stok karbon', 'Model fluks karbon hutan GFW (Harris dkk. 2021) dan metode FREL untuk wilayah Anda.'],
  kejadian: ['Riwayat titik panas', 'Arsip resmi NASA FIRMS untuk Indonesia sejak 2016 + tahun berjalan, dihitung di dalam batas wilayah Anda.'],
  grafik: ['Grafik titik panas tahunan', 'Arsip resmi NASA FIRMS sejak 2016, per tahun & per bulan, di dalam batas wilayah Anda.'],
  bekas: ['Perubahan & gangguan lahan', 'Kehilangan tutupan pohon tahunan (Hansen) di wilayah Anda; gangguan vegetasi terbaru juga tampil di peta (lapisan NASA OPERA).'],
  lahankritis: ['Lahan kritis', 'Peta Lahan Kritis resmi dipakai untuk Kabupaten Kapuas Hulu. Di wilayah lain dihitung INDIKASI lahan kritis dari data terbuka (penutupan tajuk ESA WorldCover 2021 + kemiringan lereng Copernicus DEM, skoring Kemenhut) – bukan peta resmi.'],
  laporan: ['Laporan PDF', 'Laporan lengkap analisis wilayah Anda (PDF) dibuat dari halaman Analisis area.'],
  unduh: ['Unduh data', 'Hasil analisis wilayah Anda dapat diunduh sebagai laporan PDF dan tabel CSV (Excel) dari halaman Analisis area.']
};
function lewatAnalisis(k) {
  const [jd, ket] = VIA_ANALISIS[k], A = akses(), shp = A.mode === 'shp';
  window.openSheet(`<h3>${esc(jd)}</h3><p class="sub">${esc(ket)}</p><p class="sub">${shp ? `Wilayah <b>${esc(A.nama)}</b> sudah terdaftar – hasilnya ada di <b>Analisis area</b>.` : 'Untuk wilayah mana pun di Indonesia: unggah batas wilayah (SHP/GeoJSON/KML) di <b>Analisis area</b>. Perhitungan memakai data resmi yang sama dengan 6 Hutan Desa dampingan PRCF.'}</p>
   <button class="btn pri full tap" id="nlAn">${shp ? 'Buka analisis wilayah saya' : 'Analisis wilayah (unggah SHP)'}</button>`);
  $('#nlAn').onclick = () => { history.back(); setTimeout(() => window.FHApp && FHApp.hubGo('analisis'), 120); };
}

/* ---------- 5. Lintasan satelit pendeteksi titik panas di lokasi ---------- */
function satelit() {
  let P = null, err = '';
  const muat = async () => { const L = lokasi(); P = null; err = ''; draw(); if (!L || !window.FHLintas) return; try { const X = await FHLintas.next(L.lat, L.lon, 12); P = (X && X.list) || (Array.isArray(X) ? X : []); } catch (e) { err = e.message || String(e); P = []; } draw(); };
  const draw = () => {
    const L = lokasi(), body = $('#pageBody'); if (!body) return;
    if (!L) { body.innerHTML = perluLok(); bindLok(muat); return; }
    const jam = t => { const w = new Date(t.getTime() + 7 * 36e5); return `${w.getUTCDate()} ${BLN[w.getUTCMonth()]} · ${String(w.getUTCHours()).padStart(2, '0')}.${String(w.getUTCMinutes()).padStart(2, '0')} WIB`; };
    body.innerHTML = `${lokBar(L)}${P === null ? '<div class="empty">Menghitung lintasan satelit…</div>' : !P.length ? `<div class="empty">Lintasan tidak dapat dihitung${err ? ' (' + esc(err) + ')' : ''}.</div>` : `
     <div class="h2">Satelit pendeteksi titik panas berikutnya</div><div class="group">${P.slice(0, 12).map(x => `<div class="row"><span class="m"><b>${esc(x.nama)} · ${esc(x.sensor)}</b><small>${jam(x.t)} · ${x.siang ? 'siang' : 'malam'} · ${N0(x.km)} km dari jejak orbit${x.tepi ? ' (tepi sapuan)' : ''}</small></span></div>`).join('')}</div>
     <p class="small muted" style="margin:12px 4px">Orbit dari TLE CelesTrak (diperbarui otomatis tiap 3 jam), propagasi SGP4. Satelit dihitung melintas bila lokasi berada di dalam lebar sapuan sensor (MODIS 2.330 km, VIIRS 3.060 km). Titik panas biasanya muncul di NASA FIRMS ±3 jam setelah lintasan.</p>`}`;
    bindLok(muat);
  };
  openPage('Lintasan Satelit', 'Jadwal satelit lewat · SGP4', '', muat);
}

const ALAT = { sebaran, hujan, udara, satelit, cuaca: () => window.FHApp && FHApp.hubGo('lokasi') };
Object.keys(VIA_ANALISIS).forEach(k => ALAT[k] = () => lewatAnalisis(k));
window.FHNasional = { punya: k => !!ALAT[k], buka: k => ALAT[k](), lokasi, setLok, titik };
})();
