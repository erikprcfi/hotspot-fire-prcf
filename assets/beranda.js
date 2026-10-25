/* Layar pembuka (dashboard sapaan) – Fire Hotspot PRCF
 * Sapaan + kalimat penyemangat, peta 3D berputar di lokasi pengguna (citra Sentinel-2 cloudless 2025 EOX + elevasi AWS Terrain Tiles),
 * jam setempat (WIB/WITA/WIT), lokasi GPS (desa/kec/kab – BPS/BIG + Kepmendagri 2025), cuaca saat ini (ECMWF IFS via Open-Meteo),
 * kualitas udara PM2.5 (Copernicus CAMS) & titik panas NASA terdekat. Tombol lanjut ke pemilihan Hutan Desa.
 * Pemakaian: FHBeranda.show({ sapa: () => 'Selamat malam, Erik', pesan: () => '…', hotspots: () => [...], ringkas: () => ({n, aman, dekat}), onNext })
 */
(function () {
'use strict';
const ML_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js', ML_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css';
const EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg', DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const WMO = { 0: 'Cerah', 1: 'Cerah berawan', 2: 'Berawan sebagian', 3: 'Berawan', 45: 'Berkabut', 48: 'Berkabut', 51: 'Gerimis ringan', 53: 'Gerimis', 55: 'Gerimis lebat', 61: 'Hujan ringan', 63: 'Hujan sedang', 65: 'Hujan lebat', 80: 'Hujan lokal ringan', 81: 'Hujan lokal sedang', 82: 'Hujan lokal lebat', 95: 'Hujan petir', 96: 'Hujan petir', 99: 'Hujan petir' };
const KAT = ['Baik', 'Sedang', 'Tidak Sehat', 'Sangat Tidak Sehat', 'Berbahaya'], KC = ['#2E9E5B', '#2F7FD1', '#E0A800', '#D93025', '#6B2A8A'];
const ispu = v => v <= 15.5 ? 0 : v <= 55.4 ? 1 : v <= 150.4 ? 2 : v <= 250.4 ? 3 : 4;
const N1 = v => Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ARAH = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
const DEF = { lat: 1.0252, lon: 112.6353, label: 'Kapuas Hulu, Kalimantan Barat (lokasi bawaan)' };
function css() {
  if (document.getElementById('fhb-css')) return; const st = document.createElement('style'); st.id = 'fhb-css';
  st.textContent = `#fhb{position:fixed;inset:0;z-index:87;background:#06140F;color:#EEF6F1;overflow-y:auto;-webkit-overflow-scrolling:touch;transition:opacity .45s ease,transform .45s ease}
  #fhb.out{opacity:0;transform:scale(1.03);pointer-events:none}
  .fhb-map{position:fixed;inset:0;z-index:0}.fhb-map canvas{outline:none}
  .fhb-fade{position:fixed;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(4,16,11,.72) 0%,rgba(4,16,11,.18) 30%,rgba(4,16,11,.05) 46%,rgba(4,16,11,.78) 70%,#06140F 100%)}
  .fhb-in{position:relative;z-index:2;min-height:100%;display:flex;flex-direction:column;padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(18px + env(safe-area-inset-bottom,0px))}
  .fhb-top{display:flex;align-items:center;gap:10px}.fhb-top img{height:38px;border-radius:6px}.fhb-top b{font-size:17px;white-space:nowrap;font-weight:800;letter-spacing:-.02em;flex:1}
  .fhb-clock{text-align:right;font:700 13px var(--f-data,ui-monospace,monospace);line-height:1.25;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:6px 9px;backdrop-filter:blur(8px)}
  .fhb-clock small{display:block;font:500 10px var(--f,system-ui);opacity:.8}
  .fhb-hi{margin:22px 0 0;font-size:28px;line-height:1.12;font-weight:800;letter-spacing:-.025em;text-shadow:0 2px 14px rgba(0,0,0,.6)}
  .fhb-msg{margin:10px 0 0;font-size:14.5px;font-style:italic;line-height:1.5;padding:10px 12px;border-left:3px solid #8FD3A8;background:rgba(6,20,15,.55);border-radius:0 12px 12px 0;max-width:46ch;backdrop-filter:blur(6px)}
  .fhb-sp{flex:1;min-height:30vh}
  .fhb-pin{position:relative;width:18px;height:18px;border-radius:50%;background:#FFD84D;border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,216,77,.35)}
  .fhb-pin::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:2px solid #FFD84D;animation:fhbp 2s ease-out infinite}@keyframes fhbp{from{transform:scale(.4);opacity:1}to{transform:scale(1.4);opacity:0}}
  .fhb-loc{display:flex;gap:10px;align-items:flex-start;background:rgba(6,20,15,.62);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:12px 14px;backdrop-filter:blur(10px)}
  .fhb-loc svg{flex:none;margin-top:2px;color:#FFD84D}.fhb-loc b{display:block;font-size:14.5px;line-height:1.35}.fhb-loc small{display:block;font:500 11.5px var(--f-data,ui-monospace,monospace);opacity:.82;margin-top:3px}
  .fhb-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  .fhb-c{background:rgba(6,20,15,.62);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:12px;backdrop-filter:blur(10px);min-width:0}
  .fhb-c h4{margin:0 0 4px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;opacity:.75}.fhb-big{font:700 26px var(--f-data,ui-monospace,monospace);line-height:1.1}.fhb-c p{margin:4px 0 0;font-size:12px;opacity:.88;line-height:1.4}
  .fhb-pill{display:inline-block;font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;color:#fff;margin-top:4px}
  .fhb-go{margin-top:14px;width:100%;height:56px;border:0;border-radius:18px;background:linear-gradient(135deg,#F2A93B,#E2621B);color:#fff;font:800 16px var(--f,system-ui);display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 14px 30px -12px rgba(226,98,27,.8);cursor:pointer}
  .fhb-src{margin-top:10px;font-size:10.5px;opacity:.6;line-height:1.45;text-align:center}
  .fhb-sk{display:inline-block;width:70px;height:20px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(255,255,255,.2),rgba(255,255,255,.08));background-size:200% 100%;animation:fhbs 1.2s infinite}@keyframes fhbs{to{background-position:-200% 0}}
  #fhb .maplibregl-ctrl-attrib{font-size:9px;background:rgba(0,0,0,.35)!important;color:#ccc}#fhb .maplibregl-ctrl-attrib a{color:#ddd}`;
  document.head.appendChild(st);
}
function loadML() {
  if (window.maplibregl) return Promise.resolve();
  if (!document.querySelector(`link[href="${ML_CSS}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ML_CSS; document.head.appendChild(l); }
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = ML_JS; s.onload = ok; s.onerror = () => no(new Error('MapLibre')); document.head.appendChild(s); });
}
function zona() { const o = -new Date().getTimezoneOffset() / 60; return o === 7 ? 'WIB' : o === 8 ? 'WITA' : o === 9 ? 'WIT' : 'UTC' + (o >= 0 ? '+' : '') + o; }
function dist(a, b, c, d) { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(h))); }
let MAP = null, RAF = 0, TICK = 0, WID = null;
function show(o = {}) {
  css(); if (document.getElementById('fhb')) return;
  const el = document.createElement('div'); el.id = 'fhb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Beranda');
  el.innerHTML = `<div class="fhb-map"><div id="fhbMap" style="position:absolute;inset:0;width:100%;height:100%"></div></div><div class="fhb-fade"></div>
   <div class="fhb-in">
    <div class="fhb-top"><img src="assets/logo_prcf.jpg" alt="Yayasan PRCF Indonesia"><span class="ab-logo" style="width:38px;height:38px"><img src="assets/logo_fh.svg" alt="" style="width:100%;height:100%;border-radius:0"></span><b>Fire Hotspot</b><div class="fhb-clock" id="fhbClock">–</div></div>
    <h1 class="fhb-hi">${esc(o.sapa ? o.sapa() : 'Selamat datang')}</h1>
    <p class="fhb-msg">${esc(o.pesan ? o.pesan() : '')}</p>
    <div class="fhb-sp"></div>
    <div class="fhb-loc"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg><div style="min-width:0"><b id="fhbPlace">Mencari lokasi Anda…</b><small id="fhbCoord">menunggu GPS</small></div></div>
    <div class="fhb-grid">
     <div class="fhb-c"><h4>Cuaca saat ini</h4><div style="display:flex;align-items:center;gap:6px"><span id="fhbIc"></span><div class="fhb-big" id="fhbT"><span class="fhb-sk"></span></div></div><p id="fhbW"></p></div>
     <div class="fhb-c"><h4>Kualitas udara</h4><div class="fhb-big" id="fhbPM"><span class="fhb-sk"></span></div><p id="fhbPMt"></p></div>
     <div class="fhb-c"><h4>Titik panas NASA terdekat</h4><div class="fhb-big" id="fhbHS">–</div><p id="fhbHSt">7 hari terakhir</p></div>
     <div class="fhb-c"><h4>Hutan Desa dipantau</h4><div class="fhb-big" id="fhbHD">–</div><p id="fhbHDt"></p></div>
    </div>
    <button class="fhb-go" id="fhbGo">Pilih Hutan Desa yang dipantau <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg></button>
    <p class="fhb-src">Peta 3D: Sentinel-2 cloudless 2025 (EOX) & elevasi AWS Terrain Tiles · Cuaca: ECMWF IFS (Open-Meteo) · Udara: Copernicus CAMS · Titik panas: NASA FIRMS · Wilayah: BPS/BIG & Kepmendagri 2025. Lokasi hanya dipakai di HP ini.</p>
   </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const tick = () => { const d = new Date(); $('#fhbClock').innerHTML = `${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':')} ${zona()}<small>${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>`; };
  tick(); TICK = setInterval(tick, 1000);
  const R = o.ringkas ? o.ringkas() : null; if (R) { $('#fhbHD').textContent = R.n; $('#fhbHDt').textContent = `${R.aman} berstatus aman · ${R.dekat} titik ≤ 25 km (7 hari)`; }
  $('#fhbGo').onclick = () => close(o.onNext);
  // peta 3D
  let center = DEF, marker = null;
  loadML().then(() => {
    MAP = new maplibregl.Map({ container: 'fhbMap', center: [DEF.lon, DEF.lat], zoom: 11.2, pitch: 64, bearing: -20, maxPitch: 75, interactive: false, attributionControl: { compact: true }, fadeDuration: 0,
      style: { version: 8, sources: { eox: { type: 'raster', tiles: [EOX], tileSize: 256, maxzoom: 14, attribution: 'Sentinel-2 cloudless 2025 © EOX (CC BY-NC-SA 4.0)' }, dem: { type: 'raster-dem', tiles: [DEM], tileSize: 256, encoding: 'terrarium', maxzoom: 13, attribution: 'AWS Terrain Tiles' } },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b2a20' } }, { id: 'eox', type: 'raster', source: 'eox' }, { id: 'hs', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#04140d' } }],
        terrain: { source: 'dem', exaggeration: 1.8 }, sky: { 'sky-color': '#0d2e45', 'horizon-color': '#9cc9e6', 'fog-color': '#0b2a20', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6 } } });
    MAP.setPadding({ top: 140, bottom: Math.round(innerHeight * 0.48), left: 0, right: 0 });   // titik lokasi tampil di area kosong, di atas kartu informasi
    const pin = document.createElement('div'); pin.className = 'fhb-pin'; marker = new maplibregl.Marker({ element: pin }).setLngLat([center.lon, center.lat]).addTo(MAP);
    const spin = () => { if (!MAP) return; MAP.setBearing((MAP.getBearing() + 0.06) % 360); RAF = requestAnimationFrame(spin); };
    MAP.once('load', () => { RAF = requestAnimationFrame(spin); });
    if (center !== DEF) MAP.jumpTo({ center: [center.lon, center.lat] });
  }).catch(() => { $('#fhbMap').style.background = 'radial-gradient(120% 90% at 20% 10%,#1E7A58,#06140F)'; });
  // lokasi
  const pakai = async (lat, lon, acc, src) => {
    center = { lat, lon }; if (MAP) { MAP.easeTo({ center: [lon, lat], duration: 1600 }); if (marker) marker.setLngLat([lon, lat]); }
    $('#fhbCoord').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}${acc != null ? ' · GPS ±' + (acc < 1000 ? Math.round(acc) + ' m' : N1(acc / 1000) + ' km') : ''}${src ? ' · ' + src : ''}`;
    if (window.FHWilayah) FHWilayah.lookup(lat, lon).then(w => { $('#fhbPlace').textContent = w ? FHWilayah.label(w) : 'Di luar wilayah administrasi Indonesia yang tercatat'; }).catch(() => { $('#fhbPlace').textContent = 'Lokasi Anda'; });
    else $('#fhbPlace').textContent = 'Lokasi Anda';
    cuaca(lat, lon); udara(lat, lon); titik(lat, lon);
  };
  const cuaca = async (lat, lon) => { try { const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&models=ecmwf_ifs025&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`)).json(), c = j.current;
      $('#fhbIc').innerHTML = window.FHLokasi ? FHLokasi.icon(c.weather_code, c.is_day, 40) : ''; $('#fhbT').textContent = Math.round(c.temperature_2m) + '°C';
      $('#fhbW').textContent = `${WMO[c.weather_code] || ''} · terasa ${Math.round(c.apparent_temperature)}° · RH ${Math.round(c.relative_humidity_2m)}% · angin ${N1(c.wind_speed_10m)} km/j dari ${ARAH[Math.round(c.wind_direction_10m / 45) % 8]}`; }
    catch (e) { if (!cuaca.n) { cuaca.n = 1; return setTimeout(() => cuaca(lat, lon), 4000); } $('#fhbT').textContent = '–'; $('#fhbW').textContent = 'Cuaca belum dapat dimuat (perlu internet).'; } };
  const udara = async (lat, lon) => { try { const j = await (await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=pm2_5&hourly=pm2_5&past_days=1&forecast_days=1&timezone=auto&domains=cams_global`)).json();
      const H = j.hourly, nowL = j.current.time.slice(0, 13), i = Math.max(0, H.time.findIndex(t => t.slice(0, 13) >= nowL)), v = H.pm2_5.slice(Math.max(0, i - 23), i + 1).filter(x => x != null), m = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), k = ispu(m);
      $('#fhbPM').innerHTML = `${Math.round(m)}<small style="font-size:12px;font-weight:500"> µg/m³</small>`; $('#fhbPMt').innerHTML = `PM2.5 rata-rata 24 jam<br><span class="fhb-pill" style="background:${KC[k]}">${KAT[k]}</span>`; }
    catch (e) { if (!udara.n) { udara.n = 1; return setTimeout(() => udara(lat, lon), 4000); } $('#fhbPM').textContent = '–'; $('#fhbPMt').textContent = 'Belum dapat dimuat.'; } };
  const titik = (lat, lon) => { const H = (o.hotspots ? o.hotspots() : []) || []; const wk = H.filter(p => Date.now() - p.when <= 7 * 864e5 + 36e5).map(p => dist(lat, lon, p.la, p.lo)).sort((a, b) => a - b);
    if (!H.length) { $('#fhbHS').textContent = '–'; $('#fhbHSt').textContent = 'Data titik panas sedang dimuat'; setTimeout(() => titik(lat, lon), 3000); return; }
    if (!wk.length) { $('#fhbHS').textContent = 'Nihil'; $('#fhbHSt').textContent = 'Tidak ada titik dalam 7 hari (wilayah pantauan Kapuas Hulu)'; return; }
    $('#fhbHS').innerHTML = `${wk[0] < 100 ? N1(wk[0]) : Math.round(wk[0]).toLocaleString('id-ID')}<small style="font-size:12px;font-weight:500"> km</small>`; $('#fhbHSt').textContent = `${wk.filter(d => d <= 25).length} titik ≤ 25 km · 7 hari · wilayah pantauan Kapuas Hulu`; };
  let saved = null; try { saved = JSON.parse(localStorage.getItem('fh_beranda_loc')); } catch (e) { }
  if (saved && saved.lat) pakai(saved.lat, saved.lon, saved.acc ?? null, 'lokasi terakhir');
  if (navigator.geolocation) { let best = null; const t0 = Date.now();
    WID = navigator.geolocation.watchPosition(p => { if (best && p.coords.accuracy >= best.coords.accuracy) return; best = p; const c = p.coords; pakai(c.latitude, c.longitude, c.accuracy, '');
      try { localStorage.setItem('fh_beranda_loc', JSON.stringify({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, src: 'gps', t: Date.now() })); } catch (e) { }
      if (c.accuracy <= 30 || Date.now() - t0 > 15000) { navigator.geolocation.clearWatch(WID); WID = null; } },
      () => { if (!saved) { pakai(DEF.lat, DEF.lon, null, 'izin lokasi belum diberikan'); $('#fhbPlace').textContent = DEF.label; } }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  } else if (!saved) pakai(DEF.lat, DEF.lon, null, 'GPS tidak tersedia');
}
function close(next) {
  const el = document.getElementById('fhb'); if (!el) return; clearInterval(TICK); cancelAnimationFrame(RAF); if (WID != null) { navigator.geolocation.clearWatch(WID); WID = null; }
  el.classList.add('out'); if (next) next();
  setTimeout(() => { try { if (MAP) MAP.remove(); } catch (e) { } MAP = null; el.remove(); }, 500);
}
window.FHBeranda = { show, close };
})();
