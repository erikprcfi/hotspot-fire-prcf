/* Lapisan satelit harian NASA GIBS (Global Imagery Browse Services) – Fire Hotspot PRCF
 * Tanpa kunci API. https://nasa-gibs.github.io/gibs-api-docs/
 * Dipakai app.html & index.html:  const ctl = FHNasa.create(map); ctl.set('co'); ctl.setDate('2026-10-21')
 */
(function () {
'use strict';
const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
const LAYERS = [
  { id: 'fire', nm: 'Titik api satelit NASA (VIIRS & MODIS)', short: 'Titik api NASA FIRMS', wms: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,MODIS_Combined_Thermal_Anomalies_All', op: 1, days: 2, today: true,
    desc: 'Deteksi titik api/titik panas resmi NASA FIRMS dari semua satelit VIIRS dan MODIS, untuk seluruh dunia (hari terpilih dan hari sebelumnya). Berguna untuk lokasi di luar Kapuas Hulu.', since: '2025-10-01', legend: null },
  { id: 'true', nm: 'Citra satelit harian (warna asli)', short: 'Citra harian VIIRS', gibs: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', m: 'GoogleMapsCompatible_Level9', ext: 'jpg', z: 9, op: 1,
    desc: 'Foto satelit hari itu (VIIRS NOAA-20; sebelum 2018: MODIS Terra): asap, awan, dan bekas terbakar besar terlihat langsung. Resolusi ±250–375 m.', since: '2000-02-24', legend: null,
    pick: d => d < '2018-01-01' ? { gibs: 'MODIS_Terra_CorrectedReflectance_TrueColor', short: 'Citra harian MODIS Terra' } : null },
  { id: 'co', nm: 'Karbon monoksida (CO) dari asap', short: 'CO · AIRS 500 hPa', gibs: 'AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day', m: 'GoogleMapsCompatible_Level6', ext: 'png', z: 6, op: .72,
    desc: 'Gas CO di ketinggian ±5,5 km dari satelit AIRS (Aqua), seperti tampilan NASA Eyes on the Earth. Gabungan 3 hari pengamatan (sampai tanggal terpilih) agar celah lintasan satelit tertutup. Merah/ungu = asap kebakaran tebal. Resolusi ±45 km.', since: '2002-09-01', days: 3,
    legend: 'https://gibs.earthdata.nasa.gov/legends/AIRS_Carbon_Monoxide_Volume_Mixing_Ratio_H.svg' },
  { id: 'aod', nm: 'Ketebalan kabut asap (AOD)', short: 'Asap · AOD MODIS', gibs: 'MODIS_Combined_Value_Added_AOD', m: 'GoogleMapsCompatible_Level6', ext: 'png', z: 6, op: .72,
    desc: 'Aerosol Optical Depth MODIS Terra+Aqua: semakin tinggi, semakin pekat kabut asap/partikel di udara. Resolusi ±10 km.', since: '2017-04-19',
    legend: 'https://gibs.earthdata.nasa.gov/legends/MODIS_Combined_Value_Added_AOD_H.svg' },
  { id: 'ai', nm: 'Indeks aerosol asap (OMPS)', short: 'Asap · Indeks aerosol', gibs: 'OMPS_Aerosol_Index', m: 'GoogleMapsCompatible_Level6', ext: 'png', z: 6, op: .72,
    desc: 'Indeks aerosol ultraungu OMPS (Suomi NPP): mendeteksi asap dan debu, termasuk di atas awan. Gabungan 2 hari. Resolusi ±50 km.', since: '2012-02-01', days: 2,
    legend: 'https://gibs.earthdata.nasa.gov/legends/OMPS_Aerosol_Index_H.svg' },
];
const iso = d => d.toISOString().slice(0, 10);
const yesterdayWIB = () => iso(new Date(Date.now() + 7 * 36e5 - 864e5));
const addDay = (s, n) => iso(new Date(new Date(s + 'T00:00:00Z').getTime() + n * 864e5));

function create(map, opt = {}) {
  const pane = map.getPane('nasa') || map.createPane('nasa'); pane.style.zIndex = 355;
  let cur = null, date = yesterdayWIB(), layer = null; const subs = [];
  const fire = () => subs.forEach(f => f(api));
  let anim = null;
  function draw() {
    stopAnim(true);
    if (layer) { map.removeLayer(layer); layer = null; }
    const L0 = LAYERS.find(l => l.id === cur); if (!L0) return fire();
    const alt = L0.pick ? L0.pick(date) : null, id = (alt && alt.gibs) || L0.gibs;
    pane.style.opacity = L0.op;  // transparansi diterapkan pada gabungan, bukan per hari
    const days = L0.days || 1; layer = L.layerGroup();
    for (let k = days - 1; k >= 0; k--) {  // hari paling baru digambar paling atas
      const d = addDay(date, -k);
      const att = k === 0 ? `NASA GIBS · ${(alt && alt.short) || L0.short} · ${days > 1 ? addDay(date, 1 - days) + ' s.d. ' : ''}${date}` : '';
      if (L0.wms) L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', { layers: L0.wms, format: 'image/png', transparent: true, version: '1.3.0', time: d, pane: 'nasa', attribution: att, tileSize: 512, updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 3 }).addTo(layer);
      else L.tileLayer(`${BASE}${id}/default/${d}/${L0.m}/{z}/{y}/{x}.${L0.ext}`, { pane: 'nasa', maxNativeZoom: L0.z, maxZoom: 18, tileSize: 256, attribution: att, updateWhenZooming: false, keepBuffer: 3 }).addTo(layer);
    }
    layer.addTo(map); fire();
  }
  /* Animasi pergerakan asap/awan: memutar citra harian NASA beberapa hari terakhir (data asli per hari, bukan efek buatan) */
  function stopAnim(silent) { if (!anim) return; clearInterval(anim.t); anim.frames.forEach(g => map.removeLayer(g)); const d = anim.end; anim = null; if (!silent) { date = d; draw(); } }
  function play(n = 7, ms = 1100) {
    const L0 = LAYERS.find(l => l.id === cur); if (!L0) return; if (anim) return stopAnim();
    if (layer) { map.removeLayer(layer); layer = null; }
    pane.style.opacity = L0.op; const end = date, alt0 = L0.pick ? L0.pick(end) : null, id = (alt0 && alt0.gibs) || L0.gibs, win = L0.days || 1;
    const frames = [], dates = [];
    for (let k = n - 1; k >= 0; k--) {
      const fd = addDay(end, -k); if (fd < L0.since) continue; dates.push(fd); const g = L.layerGroup();
      for (let j = win - 1; j >= 0; j--) { const d = addDay(fd, -j);
        const tl = L0.wms ? L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', { layers: L0.wms, format: 'image/png', transparent: true, version: '1.3.0', time: d, pane: 'nasa', tileSize: 512, opacity: 0, className: 'fh-anim' })
          : L.tileLayer(`${BASE}${id}/default/${d}/${L0.m}/{z}/{y}/{x}.${L0.ext}`, { pane: 'nasa', maxNativeZoom: L0.z, maxZoom: 18, tileSize: 256, opacity: 0, className: 'fh-anim' });
        tl.addTo(g); }
      g.addTo(map); frames.push(g);
    }
    if (!frames.length) return;
    anim = { frames, dates, i: frames.length - 1, end, t: 0 };
    const showF = i => { frames.forEach((g, k) => g.eachLayer(t => t.setOpacity(k === i ? 1 : 0))); date = dates[i]; fire(); };
    showF(0); anim.i = 0;
    anim.t = setInterval(() => { if (!anim) return; anim.i = (anim.i + 1) % frames.length; showF(anim.i); }, ms);
    fire();
  }
  const api = {
    LAYERS, get id() { return cur; }, get date() { return date; }, get layer() { return LAYERS.find(l => l.id === cur) || null; }, get label() { const L0 = LAYERS.find(l => l.id === cur); if (!L0) return ''; const alt = L0.pick ? L0.pick(date) : null; return (alt && alt.short) || L0.short; },
    set(id) { if (anim) stopAnim(true); cur = id || null; const L0 = LAYERS.find(l => l.id === cur); if (L0 && L0.today && date === yesterdayWIB()) date = iso(new Date(Date.now() + 7 * 36e5)); if (L0 && !L0.today && date > yesterdayWIB()) date = yesterdayWIB(); if (L0 && date < L0.since) date = L0.since; try { localStorage.setItem('fh_nasa', JSON.stringify({ id: cur })); } catch (e) { } draw(); },
    setDate(d) { const L0 = LAYERS.find(l => l.id === cur); const max = L0 && L0.today ? iso(new Date(Date.now() + 7 * 36e5)) : yesterdayWIB(); if (d > max) d = max; if (L0 && d < L0.since) d = L0.since; date = d; draw(); },
    step(n) { if (anim) stopAnim(true); api.setDate(addDay(date, n)); }, play, stop: () => stopAnim(), get playing() { return !!anim; }, get animInfo() { return anim ? { i: anim.i, n: anim.frames.length, from: anim.dates[0], to: anim.dates[anim.dates.length - 1] } : null; }, maxDate: () => { const L0 = LAYERS.find(l => l.id === cur); return L0 && L0.today ? iso(new Date(Date.now() + 7 * 36e5)) : yesterdayWIB(); }, onChange(f) { subs.push(f); }
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
    const sync = () => { pb.textContent = api.playing ? `⏸ Hentikan · ${api.date}` : '▶ Putar pergerakan 7 hari'; sel.value = api.id || ''; inp.value = api.date; inp.max = api.maxDate(); const L0 = api.layer; d.classList.toggle('on', !!L0);
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
window.FHNasa = { create, control, LAYERS };
})();
