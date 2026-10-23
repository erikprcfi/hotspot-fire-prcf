/* Lapisan satelit harian NASA GIBS (Global Imagery Browse Services) – Fire Hotspot PRCF
 * Tanpa kunci API. https://nasa-gibs.github.io/gibs-api-docs/
 * Dipakai app.html & index.html:  const ctl = FHNasa.create(map); ctl.set('co'); ctl.setDate('2026-10-21')
 */
(function () {
'use strict';
const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
const CAMS = 'https://eccharts.ecmwf.int/wms/?token=public';
const hh3 = () => { const n = new Date(); const h = Math.floor(n.getUTCHours() / 3) * 3; return { d: n.toISOString().slice(0, 10), h }; };
const pad = n => String(n).padStart(2, '0');
const LAYERS = [
  { id: 'fire', nm: 'Titik api satelit NASA (VIIRS & MODIS)', short: 'Titik api NASA FIRMS', wms: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,MODIS_Combined_Thermal_Anomalies_All', op: 1, days: 2, today: true,
    desc: 'Deteksi titik api/titik panas resmi NASA FIRMS dari semua satelit VIIRS dan MODIS, untuk seluruh dunia (hari terpilih dan hari sebelumnya). Berguna untuk lokasi di luar Kapuas Hulu.', since: '2025-10-01', legend: null },
  { id: 'true', nm: 'Citra satelit harian (warna asli)', short: 'Citra harian VIIRS', gibs: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', m: 'GoogleMapsCompatible_Level9', ext: 'jpg', z: 9, op: 1,
    desc: 'Foto satelit hari itu (VIIRS NOAA-20; sebelum 2018: MODIS Terra): asap, awan, dan bekas terbakar besar terlihat langsung. Resolusi ±250–375 m.', since: '2000-02-24', legend: null,
    pick: d => d < '2018-01-01' ? { gibs: 'MODIS_Terra_CorrectedReflectance_TrueColor', short: 'Citra harian MODIS Terra' } : null },
  { id: 'co', nm: 'Karbon monoksida (CO) dari asap', short: 'CO · AIRS 500 hPa', gibs: 'AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day', m: 'GoogleMapsCompatible_Level6', ext: 'png', z: 6, op: .72,
    desc: 'Gas CO di ketinggian ±5,5 km dari satelit AIRS (Aqua), seperti tampilan NASA Eyes on the Earth. Gabungan 3 hari pengamatan (sampai tanggal terpilih) agar celah lintasan satelit tertutup. Merah/ungu = asap kebakaran tebal. Resolusi ±45 km.', since: '2002-09-01', days: 3,
    legend: 'https://gibs.earthdata.nasa.gov/legends/AIRS_Carbon_Monoxide_Volume_Mixing_Ratio_H.svg' },
  { id: 'aod', nm: 'Ketebalan kabut asap (AOD) · VIIRS', short: 'Asap · AOD VIIRS', gibs: 'VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean', multi: ['VIIRS_SNPP_AOD_Deep_Blue_Land_Ocean', 'VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean'], m: 'GoogleMapsCompatible_Level6', ext: 'png', z: 6, op: .75,
    desc: 'Aerosol Optical Depth hasil pengamatan satelit VIIRS (S-NPP & NOAA-20, algoritma Deep Blue), gabungan 2 lintasan. Makin merah = makin pekat asap/partikel. Catatan: asap yang sangat tebal atau tertutup awan kadang tidak terbaca satelit (tampak kosong); gunakan lapisan CAMS di bawah untuk peta tanpa celah.', since: '2018-02-24',
    legend: 'https://gibs.earthdata.nasa.gov/legends/MODIS_VIIRS_AOD_H.svg' },
  { id: 'smoke', nm: 'Asap kebakaran (AOD biomassa) · CAMS/ECMWF', short: 'Asap kebakaran · CAMS', cams: 'composition_bbaod550', style: 'sh_BuYlRd_aod', op: .62, hourly: true,
    hide: [[210, 214, 234], [167, 174, 214], [135, 145, 190], [162, 167, 144]],
    desc: 'Ketebalan aerosol dari pembakaran biomassa (kebakaran hutan & lahan) menurut model Copernicus CAMS (ECMWF), per 3 jam, termasuk prakiraan 4–5 hari ke depan. Hanya nilai ≥ 0,36 (asap nyata) yang diwarnai, sisanya dibiarkan transparan agar citra satelit asli tetap terlihat. Hasil model (grid ±40 km), bukan pengamatan langsung.', since: '',
    legend: 'https://eccharts.ecmwf.int/wms/?token=public&request=GetLegend&layers=composition_bbaod550&styles=sh_BuYlRd_aod&width=350&height=50' },
  { id: 'pm25', nm: 'PM2.5 permukaan · CAMS/ECMWF', short: 'PM2.5 · CAMS', cams: 'composition_pm2p5', style: 'sh_all_pm2p5_defra_daqi', op: .62, hourly: true,
    hide: [[49, 254, 0], [49, 206, 0]],
    desc: 'Konsentrasi partikel halus PM2.5 di permukaan (µg/m³) menurut model Copernicus CAMS (ECMWF), per 3 jam, termasuk prakiraan. Hanya nilai ≥ 36 µg/m³ (di atas kategori “rendah” DAQI) yang diwarnai, sisanya transparan agar citra asli terlihat. Hasil model, bukan alat ukur.', since: '',
    legend: 'https://eccharts.ecmwf.int/wms/?token=public&request=GetLegend&layers=composition_pm2p5&styles=sh_all_pm2p5_defra_daqi&width=350&height=50' },
  { id: 'ai', nm: 'Indeks aerosol asap (OMPS)', short: 'Asap · Indeks aerosol', gibs: 'OMPS_Aerosol_Index', m: 'GoogleMapsCompatible_Level6', ext: 'png', z: 6, op: .72,
    desc: 'Indeks aerosol ultraungu OMPS (Suomi NPP): mendeteksi asap dan debu, termasuk di atas awan. Gabungan 2 hari. Resolusi ±50 km.', since: '2012-02-01', days: 2,
    legend: 'https://gibs.earthdata.nasa.gov/legends/OMPS_Aerosol_Index_H.svg' },
];
const iso = d => d.toISOString().slice(0, 10);
const yesterdayWIB = () => iso(new Date(Date.now() + 7 * 36e5 - 864e5));
const addDay = (s, n) => iso(new Date(new Date(s + 'T00:00:00Z').getTime() + n * 864e5));

// Ubin CAMS: warna kelas rendah dijadikan transparan (warna lain TIDAK diubah) → citra dasar tetap asli
const CamsWMS = L.TileLayer.WMS.extend({
  createTile(c, done) {
    const cv = document.createElement('canvas'), s = this.getTileSize(); cv.width = s.x; cv.height = s.y;
    const im = new Image(); im.crossOrigin = 'anonymous'; const hide = this.options.hide || [];
    im.onload = () => { try { const g = cv.getContext('2d'); g.drawImage(im, 0, 0, s.x, s.y);
        if (hide.length) { const D = g.getImageData(0, 0, s.x, s.y), a = D.data;
          for (let i = 0; i < a.length; i += 4) { if (!a[i + 3]) continue; for (const k of hide) if (Math.abs(a[i] - k[0]) < 9 && Math.abs(a[i + 1] - k[1]) < 9 && Math.abs(a[i + 2] - k[2]) < 9) { a[i + 3] = 0; break; } }
          g.putImageData(D, 0, 0); } } catch (e) { } done(null, cv); };
    im.onerror = e => done(e, cv); im.src = this.getTileUrl(c); return cv;
  }
});
function tiles(L0, d, h, extra = {}) {  // satu bingkai lapisan untuk tanggal d (dan jam UTC h untuk CAMS)
  const o = { pane: 'nasa', updateWhenZooming: false, keepBuffer: 3, ...extra };
  if (L0.cams) return new CamsWMS(CAMS, { hide: L0.hide, layers: L0.cams, styles: L0.style || '', format: 'image/png', transparent: true, version: '1.3.0', time: `${d}T${pad(h)}:00:00Z`, tileSize: 512, attribution: 'Copernicus Atmosphere Monitoring Service (CAMS) · ECMWF', ...o });
  if (L0.wms) return L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', { layers: L0.wms, format: 'image/png', transparent: true, version: '1.3.0', time: d, tileSize: 512, updateWhenIdle: true, ...o });
  const alt = L0.pick ? L0.pick(d) : null, ids = L0.multi || [(alt && alt.gibs) || L0.gibs];
  const g = L.layerGroup(ids.map((id, k) => L.tileLayer(`${BASE}${id}/default/${d}/${L0.m}/{z}/{y}/{x}.${L0.ext}`, { maxNativeZoom: L0.z, maxZoom: 18, tileSize: 256, attribution: k ? '' : `NASA GIBS · ${L0.short} · ${d}`, ...o })));
  g.setOpacity = v => g.eachLayer(t => t.setOpacity(v)); return g;
}
function create(map, opt = {}) {
  const pane = map.getPane('nasa') || map.createPane('nasa'); pane.style.zIndex = 355;
  let cur = null, date = yesterdayWIB(), hour = 6, layer = null; const subs = [];
  const fire = () => subs.forEach(f => f(api));
  let anim = null;
  function draw() {
    stopAnim(true);
    if (layer) { map.removeLayer(layer); layer = null; }
    const L0 = LAYERS.find(l => l.id === cur); if (!L0) return fire();
    pane.style.opacity = L0.op;  // transparansi diterapkan pada gabungan, bukan per hari
    if (L0.hourly) { layer = tiles(L0, date, hour); layer.addTo(map); return fire(); }
    const days = L0.days || 1; layer = L.layerGroup();
    for (let k = days - 1; k >= 0; k--) tiles(L0, addDay(date, -k), 0).addTo(layer);  // hari paling baru digambar paling atas
    layer.addTo(map); fire();
  }
  /* Animasi pergerakan asap/awan: memutar citra harian NASA beberapa hari terakhir (data asli per hari, bukan efek buatan) */
  function stopAnim(silent) { if (!anim) return; clearInterval(anim.t); anim.frames.forEach(g => map.removeLayer(g)); const d = anim.end, h = anim.endH; anim = null; if (!silent) { date = d; hour = h; draw(); } }
  function play(n = 7, ms = 1100) {
    const L0 = LAYERS.find(l => l.id === cur); if (!L0) return; if (anim) return stopAnim();
    if (layer) { map.removeLayer(layer); layer = null; }
    pane.style.opacity = L0.op; const end = date, endH = hour, win = L0.days || 1, frames = [], stamps = [];
    if (L0.hourly) {   // CAMS: jam ini sampai +48 jam, per 3 jam (prakiraan pergerakan asap)
      let t = new Date(`${date}T${pad(hour)}:00:00Z`).getTime();
      for (let k = 0; k <= 16; k++, t += 3 * 36e5) { const D = new Date(t), d = iso(D), h = D.getUTCHours(); const f = tiles(L0, d, h, { opacity: 0, className: 'fh-anim' }); f.addTo(map); frames.push(f); stamps.push([d, h]); }
    } else {
      for (let k = n - 1; k >= 0; k--) { const fd = addDay(end, -k); if (L0.since && fd < L0.since) continue; const g = L.layerGroup();
        for (let j = win - 1; j >= 0; j--) tiles(L0, addDay(fd, -j), 0, { opacity: 0, className: 'fh-anim' }).addTo(g);
        g.setOpacity = v => g.eachLayer(t => t.setOpacity(v)); g.addTo(map); frames.push(g); stamps.push([fd, 0]); }
    }
    if (!frames.length) return;
    anim = { frames, stamps, i: 0, end, endH, t: 0, hourly: !!L0.hourly };
    const showF = i => { frames.forEach((g, k) => g.setOpacity(k === i ? 1 : 0)); date = stamps[i][0]; hour = stamps[i][1]; fire(); };
    showF(0);
    anim.t = setInterval(() => { if (!anim) return; anim.i = (anim.i + 1) % frames.length; showF(anim.i); }, L0.hourly ? 900 : ms);
  }
  const api = {
    LAYERS, get id() { return cur; }, get date() { return date; }, get layer() { return LAYERS.find(l => l.id === cur) || null; }, get label() { const L0 = LAYERS.find(l => l.id === cur); if (!L0) return ''; const alt = L0.pick ? L0.pick(date) : null; return (alt && alt.short) || L0.short; },
    set(id) { if (anim) stopAnim(true); cur = id || null; const L0 = LAYERS.find(l => l.id === cur); if (L0 && L0.hourly) { const t = hh3(); date = t.d; hour = t.h; try { localStorage.setItem('fh_nasa', JSON.stringify({ id: cur })); } catch (e) { } return draw(); } if (L0 && L0.today && date === yesterdayWIB()) date = iso(new Date(Date.now() + 7 * 36e5)); if (L0 && !L0.today && date > yesterdayWIB()) date = yesterdayWIB(); if (L0 && date < L0.since) date = L0.since; try { localStorage.setItem('fh_nasa', JSON.stringify({ id: cur })); } catch (e) { } draw(); },
    setDate(d) { const L0 = LAYERS.find(l => l.id === cur); if (L0 && L0.hourly) { date = d; return draw(); } const max = L0 && L0.today ? iso(new Date(Date.now() + 7 * 36e5)) : yesterdayWIB(); if (d > max) d = max; if (L0 && d < L0.since) d = L0.since; date = d; draw(); },
    step(n) { if (anim) stopAnim(true); const L0 = LAYERS.find(l => l.id === cur); if (L0 && L0.hourly) { const t = new Date(new Date(`${date}T${pad(hour)}:00:00Z`).getTime() + n * 3 * 36e5); date = iso(t); hour = t.getUTCHours(); return draw(); } api.setDate(addDay(date, n)); },
    get timeLabel() { const L0 = LAYERS.find(l => l.id === cur); if (!L0 || !L0.hourly) return date; const w = new Date(new Date(`${date}T${pad(hour)}:00:00Z`).getTime() + 7 * 36e5); const now = Date.now(); const tt = new Date(`${date}T${pad(hour)}:00:00Z`).getTime(); return `${iso(w)} ${pad(w.getUTCHours())}.00 WIB${tt > now ? ' (prakiraan)' : ''}`; }, play, stop: () => stopAnim(), get playing() { return !!anim; }, get animInfo() { if (!anim) return null; const lab = ([d, h]) => anim.hourly ? (() => { const w = new Date(new Date(`${d}T${pad(h)}:00:00Z`).getTime() + 7 * 36e5); return `${w.getUTCDate()}/${w.getUTCMonth() + 1} ${pad(w.getUTCHours())}.00`; })() : d; return { i: anim.i, n: anim.frames.length, from: lab(anim.stamps[0]), to: lab(anim.stamps[anim.stamps.length - 1]), hourly: anim.hourly }; }, maxDate: () => { const L0 = LAYERS.find(l => l.id === cur); if (L0 && L0.hourly) return addDay(iso(new Date()), 4); return L0 && L0.today ? iso(new Date(Date.now() + 7 * 36e5)) : yesterdayWIB(); }, onChange(f) { subs.push(f); }
  };
  return api;
}

/* Kontrol siap pakai (website): pilih lapisan, tanggal, legenda */
function control(map, api, position = 'topleft') {
  const C = L.control({ position });
  C.onAdd = () => {
    const d = L.DomUtil.create('div', 'nasa-ctl');
    d.innerHTML = `<div class="nasa-h"><img src="https://gibs.earthdata.nasa.gov/favicon.ico" alt="" onerror="this.remove()"><b>Satelit NASA harian</b></div>
      <select class="nasa-sel"><option value="">— tidak ditampilkan —</option>${LAYERS.map(l => `<option value="${l.id}">${l.nm}</option>`).join('')}</select>
      <div class="nasa-date"><button type="button" data-s="-1" title="Hari sebelumnya">◀</button><input type="date"><button type="button" data-s="1" title="Hari berikutnya">▶</button></div>
      <button type="button" class="nasa-play">▶ Putar pergerakan 7 hari</button><div class="nasa-info"></div>`;
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    const sel = d.querySelector('select'), inp = d.querySelector('input'), info = d.querySelector('.nasa-info');
    const sync = () => { pb.textContent = api.playing ? `⏸ Hentikan · ${api.timeLabel}` : (api.layer && api.layer.hourly ? '▶ Putar prakiraan 48 jam' : '▶ Putar pergerakan 7 hari'); sel.value = api.id || ''; inp.value = api.date; inp.max = api.maxDate(); const L0 = api.layer; d.classList.toggle('on', !!L0);
      info.innerHTML = L0 ? `${L0.legend ? `<img class="nasa-lg" src="${L0.legend}" alt="Legenda ${L0.short}">` : ''}<p>${L0.desc}</p>` : ''; };
    sel.onchange = () => api.set(sel.value); inp.onchange = () => inp.value && api.setDate(inp.value);
    d.querySelectorAll('[data-s]').forEach(b => b.onclick = () => api.step(+b.dataset.s));
    const pb = d.querySelector('.nasa-play'); pb.onclick = () => api.playing ? api.stop() : api.play(7);
    api.onChange(sync); sync(); return d;
  };
  C.addTo(map); return C;
}

if (!document.getElementById('nasa-css')) {
  const st = document.createElement('style'); st.id = 'nasa-css';
  st.textContent = `.nasa-ctl{background:rgba(255,255,255,.96);color:#14201a;border-radius:12px;padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,.25);width:240px;font:12.5px/1.4 system-ui,sans-serif}
  .nasa-h{display:flex;align-items:center;gap:6px;margin-bottom:6px}.nasa-h img{width:16px;height:16px}
  .nasa-sel,.nasa-date input{width:100%;height:32px;border:1px solid #cfd8d2;border-radius:8px;padding:0 6px;font:inherit;background:#fff;color:#14201a}
  .nasa-date{display:none;grid-template-columns:30px 1fr 30px;gap:4px;margin-top:6px}.nasa-ctl.on .nasa-date{display:grid}
  .nasa-date button{height:32px;border:1px solid #cfd8d2;border-radius:8px;background:#f4f6f4;cursor:pointer}
  .nasa-info p{margin:6px 0 0;color:#4d5b53;font-size:11.5px}.fh-anim{transition:opacity .7s ease}.nasa-play{margin-top:6px;width:100%;height:32px;border:0;border-radius:8px;background:#0B3B2C;color:#fff;font:700 12px system-ui;cursor:pointer;display:none}.nasa-ctl.on .nasa-play{display:block}.nasa-lg{width:100%;margin-top:6px;background:#fff;border-radius:4px}`;
  document.head.appendChild(st);
}
window.FHNasa = { create, control, LAYERS, CamsWMS, CAMS };
})();
