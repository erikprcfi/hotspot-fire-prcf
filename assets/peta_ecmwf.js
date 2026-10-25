/* Peta prakiraan asap & kualitas udara bergaya ECMWF charts – Fire Hotspot PRCF
 * Peta: layanan WMS publik ECMWF (eccharts.ecmwf.int, token publik) – model Copernicus CAMS, per 3 jam, termasuk prakiraan ±4 hari.
 *       Warna = skala resmi ECMWF; kelas nilai rendah dibuat transparan (bukan diubah) agar citra dasar asli tetap terlihat.
 * Nilai di titik: Open-Meteo Air Quality API (CAMS global) untuk koordinat yang dipilih.
 * Citra dasar: Sentinel-2 cloudless 2025 (EOX, CC BY-NC-SA 4.0) – tanpa pewarnaan.
 * Pemakaian: FHPetaEC.mount(elemen, { lat, lon, label })
 */
(function () {
'use strict';
const WMS = 'https://eccharts.ecmwf.int/wms/?token=public';
const EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';
const AOD_LOW = [[210, 214, 234], [167, 174, 214], [135, 145, 190], [162, 167, 144]], DAQI_LOW = [[49, 254, 0], [49, 206, 0]];
const LY = [
  { id: 'smoke', nm: 'Asap kebakaran', layer: 'composition_bbaod550', style: 'sh_BuYlRd_aod', hide: AOD_LOW, pv: 'aerosol_optical_depth', pu: '', pn: 'AOD total di titik',
    info: 'Ketebalan optik aerosol dari pembakaran biomassa (kebakaran hutan & lahan), 550 nm. Diwarnai mulai 0,36.' },
  { id: 'pm25', nm: 'PM2.5', layer: 'composition_pm2p5', style: 'sh_all_pm2p5_defra_daqi', hide: DAQI_LOW, pv: 'pm2_5', pu: 'µg/m³', pn: 'PM2.5 di titik',
    info: 'Partikel halus PM2.5 di permukaan (µg/m³). Diwarnai mulai 36 µg/m³ (di atas kategori “rendah”).' },
  { id: 'pm10', nm: 'PM10', layer: 'composition_pm10', style: 'sh_all_pm10_defra_daqi', hide: DAQI_LOW, pv: 'pm10', pu: 'µg/m³', pn: 'PM10 di titik',
    info: 'Partikel PM10 di permukaan (µg/m³). Diwarnai mulai 51 µg/m³ (di atas kategori “rendah”).' },
  { id: 'aod', nm: 'Aerosol total', layer: 'composition_aod550', style: 'sh_BuYlRd_aod', hide: AOD_LOW, pv: 'aerosol_optical_depth', pu: '', pn: 'AOD total di titik',
    info: 'Ketebalan optik semua aerosol (asap, debu, garam laut, polusi), 550 nm. Diwarnai mulai 0,36.' },
];
const STEP = 3, BACK = 12, AHEAD = 96;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const isoH = t => new Date(t).toISOString().slice(0, 13) + ':00:00Z';
if (!document.getElementById('fhec-css')) {
  const st = document.createElement('style'); st.id = 'fhec-css';
  st.textContent = `.fhec{border-radius:20px;overflow:hidden;background:var(--surface,#fff);box-shadow:0 14px 34px -20px rgba(8,30,60,.55);border:1px solid var(--line,#dde3e0);min-width:0}
  .fhec-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(120deg,#0B2545,#13315C 60%,#1D4E89);color:#fff}
  .fhec-hd b{font-size:14.5px;letter-spacing:.01em}.fhec-hd small{display:block;font-size:11px;opacity:.78;font-weight:500}.fhec-bdg{margin-left:auto;flex:none;font:800 10px/1 system-ui;letter-spacing:.12em;padding:6px 8px;border:1px solid rgba(255,255,255,.45);border-radius:6px}
  .fhec-tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 12px 8px;background:#0B2545;scrollbar-width:none}.fhec-tabs::-webkit-scrollbar{display:none}
  .fhec-tabs button{flex:none;height:32px;padding:0 13px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.06);color:#DCE7F5;font:700 12.5px system-ui;cursor:pointer}
  .fhec-tabs button[aria-pressed=true]{background:#fff;color:#0B2545;border-color:#fff}
  .fhec-map{height:360px;background:#0B2545;position:relative;isolation:isolate;z-index:0}.fhec-map .leaflet-control-attribution{font-size:9px;max-width:100%;white-space:normal}
  .fhec-vt{position:absolute;z-index:500;left:52px;top:10px;background:rgba(11,37,69,.88);color:#fff;border-radius:10px;padding:6px 10px;font:600 12px system-ui;pointer-events:none;backdrop-filter:blur(4px)}
  .fhec-vt small{display:block;font-weight:500;opacity:.8;font-size:10.5px}
  .fhec-load{position:absolute;z-index:500;right:10px;top:10px;width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:fhecspin .8s linear infinite;display:none}.fhec-load.on{display:block}@keyframes fhecspin{to{transform:rotate(360deg)}}
  .fhec-ctl{display:flex;align-items:center;gap:10px;padding:10px 12px 4px}.fhec-play{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:#13315C;color:#fff;display:grid;place-items:center;cursor:pointer}
  .fhec-ctl input{flex:1;min-width:0;accent-color:#1D4E89}
  .fhec-strip{padding:0 12px}.fhec-strip svg{display:block;width:100%;height:64px}
  .fhec-ft{padding:6px 12px 12px;font-size:11.5px;color:var(--muted,#5b6670);line-height:1.45}.fhec-ft img{display:block;max-width:100%;height:auto;background:#fff;border-radius:6px;margin:6px 0}
  .fhec-pv{display:flex;align-items:baseline;gap:8px;padding:2px 12px 0;font-size:12px;color:var(--muted,#5b6670)}.fhec-pv b{font:700 18px var(--f-data,ui-monospace,monospace);color:var(--fg,#111)}
  .fhec-anim{transition:opacity .35s ease}.fhec-dot{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #E5484D;box-shadow:0 0 0 4px rgba(229,72,77,.3)}`;
  document.head.appendChild(st);
}
function mount(el, o = {}) {
  if (!window.L) { el.innerHTML = '<p class="fhec-ft">Peta tidak dapat dimuat.</p>'; return; }
  const lat = +o.lat, lon = +o.lon;
  const t0 = Math.floor(Date.now() / (STEP * 36e5)) * STEP * 36e5, times = [];
  for (let h = -BACK; h <= AHEAD; h += STEP) times.push(t0 + h * 36e5);
  let li = 0, ti = BACK / STEP, cur = null, want = null, playing = false, ptimer = null, PV = null;
  el.innerHTML = `<div class="fhec"><div class="fhec-hd"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>
    <div style="min-width:0"><b>Peta prakiraan asap &amp; udara</b><small>${esc(o.label || '')}</small></div><span class="fhec-bdg">ECMWF · CAMS</span></div>
    <div class="fhec-tabs">${LY.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === li}">${x.nm}</button>`).join('')}</div>
    <div class="fhec-map"><div class="fhec-vt"></div><div class="fhec-load"></div></div>
    <div class="fhec-pv"></div>
    <div class="fhec-ctl"><button type="button" class="fhec-play" aria-label="Putar"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg></button><input type="range" min="0" max="${times.length - 1}" value="${ti}" aria-label="Waktu prakiraan"></div>
    <div class="fhec-strip"></div>
    <div class="fhec-ft"></div></div>`;
  const $ = s => el.querySelector(s), mapEl = $('.fhec-map');
  const map = L.map(mapEl, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, minZoom: 3, maxZoom: 10, zoomSnap: 1 }).setView([lat, lon], 6);
  L.tileLayer(EOX, { maxZoom: 10, maxNativeZoom: 14, attribution: 'Sentinel-2 cloudless 2025 · EOX (CC BY-NC-SA 4.0)' }).addTo(map);
  map.attributionControl.addAttribution('Copernicus CAMS · ECMWF');
  map.createPane('ec').style.zIndex = 350;
  L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="fhec-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false }).addTo(map);
  setTimeout(() => map.invalidateSize(), 60);
  if ('ResizeObserver' in window) new ResizeObserver(() => map.invalidateSize()).observe(mapEl);
  const Cls = (window.FHNasa && FHNasa.CamsWMS) || L.TileLayer.WMS;
  function frame() {
    const x = LY[li], t = times[ti], load = $('.fhec-load'); load.classList.add('on');
    const nl = new Cls(WMS, { pane: 'ec', layers: x.layer, styles: x.style, format: 'image/png', transparent: true, version: '1.3.0', time: isoH(t), tileSize: 512, hide: x.hide, opacity: 0, updateWhenZooming: false, className: 'fhec-anim' });
    if (want && want !== cur) map.removeLayer(want); want = nl;
    nl.once('load', () => { if (nl !== want) return; nl.setOpacity(.68); load.classList.remove('on'); if (cur && cur !== nl) { const old = cur; setTimeout(() => map.removeLayer(old), 350); } cur = nl; if (playing) ptimer = setTimeout(next, 900); });
    nl.addTo(map); label(); strip();
  }
  const fc = t => t > Date.now() + 36e5 ? 'prakiraan' : t < Date.now() - 3 * 36e5 ? 'analisis' : 'saat ini';
  function label() {
    const t = times[ti], dh = Math.round((t - t0) / 36e5);
    $('.fhec-vt').innerHTML = `${fmtT.format(new Date(t))}<small>${fc(t)} · ${dh >= 0 ? 'T+' : 'T'}${dh} jam · model CAMS</small>`;
    $('.fhec-ft').innerHTML = `<img alt="Legenda" src="${WMS}&request=GetLegend&layers=${LY[li].layer}&styles=${LY[li].style}&width=350&height=50" loading="lazy"><p style="margin:6px 0 0">${esc(LY[li].info)} Nilai lebih rendah dibiarkan transparan sehingga citra satelit asli terlihat. <b>Hasil model</b> (grid ±40 km), bukan alat ukur; asap dari kebakaran yang baru muncul bisa belum tercakup.<br>Sumber: Copernicus Atmosphere Monitoring Service (CAMS) melalui layanan peta publik ECMWF; nilai di titik: CAMS global via Open-Meteo.</p>`;
    pv();
  }
  function pv() {
    const x = LY[li], box = $('.fhec-pv'); if (!PV || !PV[x.pv]) { box.innerHTML = ''; return; }
    const v = PV[x.pv][ti]; box.innerHTML = v == null ? '' : `${x.pn}<b>${x.pu ? Math.round(v) : v.toFixed(2).replace('.', ',')}</b>${x.pu}`;
  }
  function strip() {
    const x = LY[li], s = $('.fhec-strip'); if (!PV || !PV[x.pv]) { s.innerHTML = ''; return; }
    const V = PV[x.pv], W = 600, H = 64, n = V.length, mx = Math.max(1e-6, ...V.filter(v => v != null)) * 1.1, bw = W / n;
    const thr = x.pv === 'pm2_5' ? 36 : x.pv === 'pm10' ? 51 : .36;
    s.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(x.pn)} per 3 jam">${V.map((v, i) => v == null ? '' : `<rect x="${i * bw + 1}" y="${H - 14 - (H - 18) * v / mx}" width="${bw - 2}" height="${(H - 18) * v / mx}" rx="1.5" fill="${v >= thr ? '#E5484D' : '#7FA7D9'}" opacity="${i === ti ? 1 : .75}"/>`).join('')}
      <line x1="${(ti + .5) * bw}" x2="${(ti + .5) * bw}" y1="0" y2="${H - 12}" stroke="#13315C" stroke-width="2"/>
      <line x1="${(BACK / STEP + .5) * bw}" x2="${(BACK / STEP + .5) * bw}" y1="0" y2="${H - 12}" stroke="#13315C" stroke-dasharray="3 3" opacity=".5"/>
      ${times.map((t, i) => { const d = new Date(t); return d.getHours() < STEP && i ? `<text x="${i * bw}" y="${H - 2}" font-size="10" fill="#6b7680">${d.getDate()}/${d.getMonth() + 1}</text>` : ''; }).join('')}</svg>`;
  }
  async function loadPV() {
    try {
      const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=pm2_5,pm10,aerosol_optical_depth&past_days=1&forecast_days=5&timezone=GMT&domains=cams_global`);
      if (!r.ok) return; const j = await r.json(), H = j.hourly, out = {};
      ['pm2_5', 'pm10', 'aerosol_optical_depth'].forEach(k => { out[k] = times.map(t => { const i = H.time.indexOf(new Date(t).toISOString().slice(0, 13) + ':00'); return i >= 0 ? H[k][i] : null; }); });
      PV = out; pv(); strip();
    } catch (e) { }
  }
  function next() { if (!playing) return; ti = (ti + 1) % times.length; $('input[type=range]').value = ti; frame(); }
  function setPlay(on) { playing = on; clearTimeout(ptimer); $('.fhec-play').innerHTML = on ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>'; if (on) next(); }
  $('.fhec-play').onclick = () => setPlay(!playing);
  $('input[type=range]').oninput = e => { setPlay(false); ti = +e.target.value; frame(); };
  el.querySelectorAll('.fhec-tabs button').forEach(b => b.onclick = () => { li = +b.dataset.i; el.querySelectorAll('.fhec-tabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); frame(); });
  frame(); loadPV();
  return { map, destroy: () => { setPlay(false); map.remove(); } };
}
window.FHPetaEC = { mount };
})();
