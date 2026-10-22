/* Mode 3D / globe – Fire Hotspot PRCF
 * MapLibre GL (globe + relief medan 3D). Semua data dari sumber resmi:
 *   titik panas  : NASA FIRMS (data/hotspots.json, nilai asli; tinggi kolom = FRP)
 *   relief       : AWS Terrain Tiles (Mapzen; SRTM/GMTED/NED, data terbuka)
 *   citra dasar  : Esri World Imagery
 *   lapisan NASA : GIBS – VIIRS warna asli, CO AIRS, AOD MODIS (tanggal kemarin WIB)
 *   batas        : SK Hutan Desa & peta batas desa (data/geo.json)
 * Pemakaian: FH3D.open({ sites, site, points:[{lat,lon,frp,when,sen}] })
 */
(function () {
'use strict';
const ML_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js';
const ML_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
const iso = d => d.toISOString().slice(0, 10);
const kemarin = () => iso(new Date(Date.now() + 7 * 36e5 - 864e5));
const addDay = (s, n) => iso(new Date(new Date(s + 'T00:00:00Z').getTime() + n * 864e5));
const N = v => Number(v).toLocaleString('id-ID');
const AGE = [[1, '#FF3B1F', '< 24 jam'], [3, '#FF8A00', '1–3 hari'], [7, '#FFC531', '3–7 hari'], [1e9, '#C7B48A', '> 7 hari']];
const NASA = {
  none: null,
  true: { nm: 'Citra harian VIIRS', layers: d => [[`VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, 9]], op: .95 },
  co: { nm: 'Asap CO · AIRS (3 hari)', layers: d => [2, 1, 0].map(k => [`AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day/default/${addDay(d, -k)}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`, 6]), op: .7 },
  aod: { nm: 'Kabut asap AOD · MODIS', layers: d => [[`MODIS_Combined_Value_Added_AOD/default/${d}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`, 6]], op: .7 },
};
let map = null, root = null, raf = 0, spin = false, state = {};

function load() {
  if (window.maplibregl) return Promise.resolve();
  if (!document.querySelector(`link[href="${ML_CSS}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ML_CSS; document.head.appendChild(l); }
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = ML_JS; s.onload = ok; s.onerror = () => no(new Error('MapLibre gagal dimuat')); document.head.appendChild(s); });
}
function css() {
  if (document.getElementById('p3d-css')) return;
  const st = document.createElement('style'); st.id = 'p3d-css';
  st.textContent = `.p3d{position:fixed;inset:0;z-index:4000;background:#05080a;color:#fff;font-family:var(--f,system-ui,sans-serif);animation:p3in .35s ease both}
  @keyframes p3in{from{opacity:0;transform:scale(1.03)}to{opacity:1;transform:none}}
  .p3d #p3map{position:absolute;inset:0}
  .p3d .top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 26px;display:flex;gap:10px;align-items:center;background:linear-gradient(#05080add,#05080a00);pointer-events:none}
  .p3d .top>*{pointer-events:auto}.p3d .x{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:20px;backdrop-filter:blur(8px);flex:none}
  .p3d .tt{min-width:0;flex:1}.p3d .tt b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.p3d .tt span{font-size:11.5px;opacity:.75}
  .p3d .side{position:absolute;right:10px;top:calc(env(safe-area-inset-top,0px) + 66px);display:grid;gap:8px}
  .p3d .side button{width:44px;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(10,16,14,.62);color:#fff;font:700 11px var(--f,sans-serif);backdrop-filter:blur(10px)}
  .p3d .side button.on{background:#E2621B;border-color:#E2621B}
  .p3d .bot{position:absolute;left:0;right:0;bottom:0;padding:22px 12px calc(env(safe-area-inset-bottom,0px) + 12px);background:linear-gradient(#05080a00,#05080ae6);display:grid;gap:9px}
  .p3d .chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.p3d .chips::-webkit-scrollbar{display:none}
  .p3d .chips button{flex:none;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:7px 12px;font:600 12px var(--f,sans-serif)}
  .p3d .chips button.on{background:#fff;color:#12201A;border-color:#fff}
  .p3d .lg{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;opacity:.9;align-items:center}.p3d .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  .p3d .src{font-size:9.5px;opacity:.6;line-height:1.35}
  .p3d .kpi{display:flex;gap:8px}.p3d .kpi div{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px 9px;min-width:0}
  .p3d .kpi b{display:block;font:700 17px var(--f-data,ui-monospace,monospace)}.p3d .kpi span{font-size:10px;opacity:.7}
  .p3d .load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;opacity:.8;pointer-events:none}
  .p3d .maplibregl-popup-content{background:#101a16;color:#fff;border-radius:12px;font-size:12px;padding:9px 11px;box-shadow:0 8px 30px #0008}
  .p3d .maplibregl-popup-tip{border-top-color:#101a16!important;border-bottom-color:#101a16!important}
  .p3d .maplibregl-ctrl-attrib{font-size:9px;background:rgba(0,0,0,.4)!important;color:#ccc}.p3d .maplibregl-ctrl-attrib a{color:#ddd}`;
  document.head.appendChild(st);
}
function column(p) {
  const h = 120 / 111320, w = h / Math.cos(p.lat * Math.PI / 180);
  return [[[p.lon - w, p.lat - h], [p.lon + w, p.lat - h], [p.lon + w, p.lat + h], [p.lon - w, p.lat + h], [p.lon - w, p.lat - h]]];
}
function ptsFC(points, days) {
  const now = Date.now(), f = [];
  for (const p of points) {
    const ageD = (now - p.when) / 864e5; if (days && ageD > days) continue;
    const ai = AGE.findIndex(a => ageD <= a[0]);
    const prop = { frp: +p.frp || 0, h: 350 + Math.min(+p.frp || 0, 250) * 22, c: AGE[ai][1], age: ai, sen: p.sen || '', t: p.when ? new Date(p.when.getTime() + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' ') + ' WIB' : '' };
    f.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: column(p) }, properties: prop });
  }
  return { type: 'FeatureCollection', features: f };
}
function dotsFC(fc) { return { type: 'FeatureCollection', features: fc.features.filter(f => f.properties.age === 0).map(f => { const r = f.geometry.coordinates[0]; return { type: 'Feature', geometry: { type: 'Point', coordinates: [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[2][1]) / 2] }, properties: f.properties }; }) }; }
function setNasa(id) {
  state.nasa = id;
  (state.nasaIds || []).forEach(x => { if (map.getLayer(x)) map.removeLayer(x); if (map.getSource(x)) map.removeSource(x); }); state.nasaIds = [];
  const L = NASA[id]; if (L) L.layers(state.date).forEach(([path, z], i) => { const sid = 'nasa' + i; map.addSource(sid, { type: 'raster', tiles: [GIBS + path], tileSize: 256, maxzoom: z, attribution: 'NASA GIBS' }); map.addLayer({ id: sid, type: 'raster', source: sid, paint: { 'raster-opacity': L.op, 'raster-fade-duration': 300 } }, 'hd-fill'); state.nasaIds.push(sid); });
  root.querySelectorAll('[data-n]').forEach(b => b.classList.toggle('on', b.dataset.n === id));
  root.querySelector('#p3sub').textContent = (L ? L.nm + ' · ' + state.date + ' · ' : '') + 'NASA FIRMS · relief 3D';
}
function setDays(d) {
  state.days = d; const fc = ptsFC(state.points, d);
  map.getSource('hs').setData(fc); map.getSource('hs-dot').setData(dotsFC(fc));
  root.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', +b.dataset.d === d));
  const near = fc.features.length, mx = fc.features.reduce((m, f) => Math.max(m, f.properties.frp), 0);
  root.querySelector('#p3k').innerHTML = `<div><b>${N(near)}</b><span>titik panas ${d === 1 ? '24 jam' : d + ' hari'}</span></div><div><b>${N(fc.features.filter(f => f.properties.age === 0).length)}</b><span>&lt; 24 jam (berdenyut)</span></div><div><b>${N(Math.round(mx))}</b><span>FRP maks (MW)</span></div>`;
}
function pulse(t) {
  if (!map) return; const k = (t % 1600) / 1600;
  if (map.getLayer('hs-dot')) { map.setPaintProperty('hs-dot', 'circle-radius', 6 + 22 * k); map.setPaintProperty('hs-dot', 'circle-opacity', .55 * (1 - k)); }
  if (spin && !state.drag) map.setBearing(map.getBearing() + .06);
  raf = requestAnimationFrame(pulse);
}
function close() { cancelAnimationFrame(raf); if (map) { map.remove(); map = null; } if (root) { root.remove(); root = null; } document.body.style.overflow = state.ov || ''; if (state.onClose) state.onClose(); }

async function open(opt) {
  css(); if (root) close();
  state = { points: opt.points || [], date: kemarin(), days: 7, nasa: 'none', onClose: opt.onClose, ov: document.body.style.overflow };
  const S = opt.site, sites = opt.sites || [];
  root = document.createElement('div'); root.className = 'p3d'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Peta 3D');
  root.innerHTML = `<div id="p3map"></div><div class="load" id="p3load">Memuat globe 3D…</div>
   <div class="top"><button class="x" id="p3x" aria-label="Tutup">✕</button><div class="tt"><b>${S ? S.hd_nama : 'Kapuas Hulu'} · 3D</b><span id="p3sub">NASA FIRMS · relief 3D</span></div></div>
   <div class="side"><button id="p3g" title="Globe">🌏</button><button id="p3s" title="Putar otomatis">⟳</button><button id="p3p" title="Sudut pandang">3D</button><button id="p3h" title="Kembali ke lokasi">◎</button></div>
   <div class="bot"><div class="kpi" id="p3k"></div>
    <div class="chips">${[[1, '24 jam'], [3, '3 hari'], [7, '7 hari'], [30, '30 hari'], [0, 'Semua']].map(([d, n]) => `<button data-d="${d}">${n}</button>`).join('')}<span style="width:8px;flex:none"></span>
     ${[['none', 'Citra dasar'], ['true', 'Citra NASA kemarin'], ['co', 'Asap CO'], ['aod', 'Kabut asap AOD']].map(([k, n]) => `<button data-n="${k}">${n}</button>`).join('')}</div>
    <div class="lg">${AGE.map(a => `<span><i style="background:${a[1]}"></i>${a[2]}</span>`).join('')}<span>· tinggi kolom = FRP (MW)</span><span><i style="background:#FF4D4D"></i>Hutan Desa</span><span><i style="background:#FFA24A"></i>Desa</span></div>
    <div class="src">Titik panas: NASA FIRMS (nilai asli). Relief: AWS Terrain Tiles (SRTM). Citra: Esri World Imagery; lapisan harian NASA GIBS. Batas: SK Hutan Desa & peta batas desa. Tinggi relief diperbesar 1,6×.</div></div>`;
  document.body.appendChild(root); document.body.style.overflow = 'hidden';
  root.querySelector('#p3x').onclick = close;
  try { await load(); } catch (e) { root.querySelector('#p3load').textContent = 'Mode 3D memerlukan koneksi internet.'; return; }
  const c = S ? S.pusat_wilayah || S.pusat : [0.85, 112.3]; const center = [c[1], c[0]];
  map = new maplibregl.Map({ container: 'p3map', center, zoom: 1.6, pitch: 0, bearing: 0, maxPitch: 80, attributionControl: { compact: true },
    style: { version: 8, projection: { type: 'globe' },
      sky: { 'sky-color': '#0b1d33', 'horizon-color': '#6f8fb3', 'fog-color': '#c9d6e2', 'sky-horizon-blend': .6, 'horizon-fog-blend': .6, 'fog-ground-blend': .7, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 7, .6, 11, 0] },
      sources: {
        esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Esri, Maxar, Earthstar Geographics' },
        dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 13, attribution: 'AWS Terrain Tiles (Mapzen)' },
        dem2: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 13 } },
      layers: [{ id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-saturation': -.15, 'raster-contrast': .08 } },
        { id: 'shade', type: 'hillshade', source: 'dem2', paint: { 'hillshade-exaggeration': .35, 'hillshade-shadow-color': '#0a1410' } }] } });
  map.on('load', () => {
    root.querySelector('#p3load').remove();
    map.setTerrain({ source: 'dem', exaggeration: 1.6 });
    const fc = k => ({ type: 'FeatureCollection', features: sites.flatMap(s => (s[k] && s[k].features) || []) });
    map.addSource('hd', { type: 'geojson', data: fc('hd') }); map.addSource('desa', { type: 'geojson', data: fc('desa') });
    if (S) { map.addSource('b5', { type: 'geojson', data: S.buf5 }); map.addSource('b25', { type: 'geojson', data: S.buf25 }); }
    map.addLayer({ id: 'hd-fill', type: 'fill', source: 'hd', paint: { 'fill-color': '#FF4D4D', 'fill-opacity': .16 } });
    map.addLayer({ id: 'desa-line', type: 'line', source: 'desa', paint: { 'line-color': '#FFA24A', 'line-width': 1.6 } });
    map.addLayer({ id: 'hd-line', type: 'line', source: 'hd', paint: { 'line-color': '#FF4D4D', 'line-width': 2.4 } });
    if (S) { map.addLayer({ id: 'b5', type: 'line', source: 'b5', paint: { 'line-color': '#FFD54A', 'line-width': 1.2, 'line-dasharray': [3, 2] } }); map.addLayer({ id: 'b25', type: 'line', source: 'b25', paint: { 'line-color': '#E6D36A', 'line-width': 1, 'line-dasharray': [4, 3], 'line-opacity': .7 } }); }
    map.addSource('hs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }); map.addSource('hs-dot', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'hs-dot', type: 'circle', source: 'hs-dot', paint: { 'circle-color': '#FF3B1F', 'circle-radius': 8, 'circle-opacity': .5, 'circle-blur': .4, 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'hs', type: 'fill-extrusion', source: 'hs', paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 5, ['*', ['get', 'h'], 6], 9, ['*', ['get', 'h'], 1.6], 12, ['get', 'h']], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .92, 'fill-extrusion-vertical-gradient': true } });
    setDays(7); setNasa('none');
    map.on('click', 'hs', e => { const p = e.features[0].properties; new maplibregl.Popup({ offset: 8 }).setLngLat(e.lngLat).setHTML(`<b>${p.t}</b><br>${p.sen}<br>FRP ${N(Math.round(p.frp * 10) / 10)} MW<br><span style="opacity:.7">NASA FIRMS</span>`).addTo(map); });
    map.on('mouseenter', 'hs', () => map.getCanvas().style.cursor = 'pointer'); map.on('mouseleave', 'hs', () => map.getCanvas().style.cursor = '');
    setTimeout(() => map && map.flyTo({ center, zoom: S ? 10.2 : 8, pitch: 64, bearing: -24, duration: 6500, essential: true, curve: 1.6 }), 500);
    raf = requestAnimationFrame(pulse);
  });
  map.on('dragstart', () => state.drag = true); map.on('dragend', () => state.drag = false);
  root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => map && map.getSource('hs') && setDays(+b.dataset.d));
  root.querySelectorAll('[data-n]').forEach(b => b.onclick = () => map && map.isStyleLoaded() && setNasa(b.dataset.n));
  const g = root.querySelector('#p3g'); g.classList.add('on');
  g.onclick = () => { const on = !g.classList.contains('on'); g.classList.toggle('on', on); map.setProjection({ type: on ? 'globe' : 'mercator' }); };
  const sp = root.querySelector('#p3s'); sp.onclick = () => { spin = !spin; sp.classList.toggle('on', spin); };
  const pb = root.querySelector('#p3p'); pb.classList.add('on'); pb.onclick = () => { const on = map.getPitch() < 20; pb.classList.toggle('on', on); map.easeTo({ pitch: on ? 64 : 0, duration: 900 }); };
  root.querySelector('#p3h').onclick = () => map.flyTo({ center, zoom: S ? 10.2 : 8, pitch: 64, bearing: -24, duration: 2500 });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
}
window.FH3D = { open, close, isOpen: () => !!root };
})();
