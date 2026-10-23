/* Animasi angin 10 m di peta + angin di satu titik – Fire Hotspot PRCF
 * Data: model ECMWF IFS 0,25° (European Centre for Medium-Range Weather Forecasts, CC BY 4.0) via Open-Meteo,
 *       kecepatan & arah angin 10 m per jam, analisis + prakiraan 3 hari, untuk grid titik di area peta yang terlihat.
 * Partikel bergerak searah angin (arah ke mana angin bertiup); warna = kecepatan sebenarnya. Tidak ada pewarnaan citra dasar.
 * Pemakaian: const W = FHAngin.layer(map); W.on(); W.panel(elemen); W.off();   FHAngin.at(lat, lon) → angin di titik
 */
(function () {
'use strict';
const API = 'https://api.open-meteo.com/v1/forecast';
const ARAH = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
const arahTxt = d => ARAH[Math.round(((d % 360) + 360) % 360 / 45) % 8];
const SCALE = [[0, '#9EC9FF'], [2, '#5FD1C6'], [4, '#7BE07A'], [6, '#F2E35B'], [9, '#F7A541'], [12, '#F05D4D'], [16, '#C23BD4']]; // m/s
const colOf = s => { let c = SCALE[0][1]; for (const [v, k] of SCALE) if (s >= v) c = k; return c; };
const fmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const cache = {};
async function grid(b, z) {
  const span = Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth());
  let step = Math.max(.25, Math.ceil(span / 12 / .25) * .25);
  const w = Math.floor((b.getWest() - step) / step) * step, e = Math.ceil((b.getEast() + step) / step) * step, s = Math.max(-85, Math.floor((b.getSouth() - step) / step) * step), n = Math.min(85, Math.ceil((b.getNorth() + step) / step) * step);
  const nx = Math.round((e - w) / step) + 1, ny = Math.round((n - s) / step) + 1;
  const key = [w, s, nx, ny, step].join(','); if (cache[key]) return cache[key];
  const la = [], lo = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { la.push((s + j * step).toFixed(2)); lo.push((((w + i * step + 540) % 360) - 180).toFixed(2)); }
  cache[key] = fetch(`${API}?latitude=${la.join(',')}&longitude=${lo.join(',')}&hourly=wind_speed_10m,wind_direction_10m&models=ecmwf_ifs025&wind_speed_unit=ms&timezone=GMT&past_days=0&forecast_days=3`)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(J => {
      const A = Array.isArray(J) ? J : [J], time = A[0].hourly.time.map(t => Date.parse(t + 'Z'));
      const U = time.map(() => new Float32Array(nx * ny)), V = time.map(() => new Float32Array(nx * ny));
      A.forEach((r, k) => r.hourly.time.forEach((_, h) => { const sp = r.hourly.wind_speed_10m[h], di = r.hourly.wind_direction_10m[h]; if (sp == null || di == null) return; U[h][k] = -sp * Math.sin(di * Math.PI / 180); V[h][k] = -sp * Math.cos(di * Math.PI / 180); }));
      return { w, s, step, nx, ny, time, U, V };
    });
  cache[key].catch(() => delete cache[key]);
  return cache[key];
}
function sample(G, h, lat, lon) {
  let x = (lon - G.w) / G.step, y = (lat - G.s) / G.step; if (x < 0 || y < 0 || x > G.nx - 1 || y > G.ny - 1) return null;
  const i = Math.min(G.nx - 2, Math.floor(x)), j = Math.min(G.ny - 2, Math.floor(y)), fx = x - i, fy = y - j, k = j * G.nx + i, U = G.U[h], V = G.V[h];
  const bl = (A) => A[k] * (1 - fx) * (1 - fy) + A[k + 1] * fx * (1 - fy) + A[k + G.nx] * (1 - fx) * fy + A[k + G.nx + 1] * fx * fy;
  return [bl(U), bl(V)];
}
if (!document.getElementById('fha-css')) {
  const st = document.createElement('style'); st.id = 'fha-css';
  st.textContent = `.fha-pane canvas{pointer-events:none}.fha-p{display:grid;gap:6px;background:rgba(11,37,69,.92);color:#fff;border-radius:16px;padding:10px 12px;box-shadow:0 12px 28px -12px rgba(0,0,0,.6);backdrop-filter:blur(8px);font:500 12px system-ui}
  .fha-row{display:flex;align-items:center;gap:10px}.fha-p button{flex:none;width:34px;height:34px;border-radius:50%;border:0;background:#fff;color:#0B2545;display:grid;place-items:center;cursor:pointer}
  .fha-p input{flex:1;min-width:0;accent-color:#7BE07A}.fha-t{font-weight:700}.fha-lg{display:flex;height:8px;border-radius:4px;overflow:hidden}.fha-lg i{flex:1}.fha-lgt{display:flex;justify-content:space-between;font-size:10px;opacity:.8}
  .fha-x{margin-left:auto;background:none!important;color:#fff!important;width:28px!important;height:28px!important;font-size:18px}`;
  document.head.appendChild(st);
}
function layer(map, opt = {}) {
  const pane = map.getPane('angin') || map.createPane('angin'); pane.style.zIndex = opt.z || 450; pane.classList.add('fha-pane');
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d'); let on = false, G = null, h = 0, raf = null, P = [], field = null, W = 0, H = 0, panelEl = null, play = null, seq = 0;
  const subs = [];
  function hourNow() { if (!G) return 0; const n = Date.now(); let b = 0; G.time.forEach((t, i) => { if (Math.abs(t - n) < Math.abs(G.time[b] - n)) b = i; }); return b; }
  function build() {   // medan vektor di ruang layar (tiap 5 px), dihitung ulang tiap peta selesai digeser/zoom
    const sz = map.getSize(); W = sz.x; H = sz.y; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    L.DomUtil.setPosition(cv, map.containerPointToLayerPoint([0, 0]));
    if (!G) return; const S = 5, cx = Math.ceil(W / S) + 1, cy = Math.ceil(H / S) + 1, F = new Float32Array(cx * cy * 3);
    const z = map.getZoom(), k = .32 * Math.pow(1.12, Math.max(0, 9 - z)) / 3;
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { const ll = map.containerPointToLatLng([i * S, j * S]), v = sample(G, h, ll.lat, ll.lng), o = (j * cx + i) * 3;
      if (!v) { F[o + 2] = -1; continue; } F[o] = v[0] * k * 3; F[o + 1] = -v[1] * k * 3; F[o + 2] = Math.hypot(v[0], v[1]); }
    field = { F, cx, S };
    const n = Math.round(Math.min(2600, W * H / 260)); P = []; for (let q = 0; q < n; q++) P.push(spawn());
    ctx.clearRect(0, 0, W, H);
  }
  const spawn = () => ({ x: Math.random() * W, y: Math.random() * H, a: Math.floor(Math.random() * 80) });
  function at(x, y) { if (!field) return null; const i = Math.round(x / field.S), j = Math.round(y / field.S), o = (j * field.cx + i) * 3; if (o < 0 || o >= field.F.length || field.F[o + 2] < 0) return null; return [field.F[o], field.F[o + 1], field.F[o + 2]]; }
  function frame() {
    if (!on) return; raf = requestAnimationFrame(frame);
    ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0,0,0,.93)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    if (!field) return; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const groups = {};
    for (const p of P) { const v = at(p.x, p.y); if (!v || p.a-- <= 0) { Object.assign(p, spawn(), { a: 40 + Math.random() * 60 }); continue; }
      const nx = p.x + v[0], ny = p.y + v[1], c = colOf(v[2]); (groups[c] = groups[c] || []).push(p.x, p.y, nx, ny); p.x = nx; p.y = ny;
      if (nx < 0 || ny < 0 || nx > W || ny > H) Object.assign(p, spawn()); }
    for (const c in groups) { const g = groups[c]; ctx.strokeStyle = c; ctx.beginPath(); for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i], g[i + 1]); ctx.lineTo(g[i + 2], g[i + 3]); } ctx.stroke(); }
  }
  async function load() {
    const my = ++seq; try { const g = await grid(map.getBounds(), map.getZoom()); if (my !== seq || !on) return; const first = !G; G = g; if (first) h = hourNow(); build(); paint(); }
    catch (e) { if (panelEl) panelEl.querySelector('.fha-t').textContent = 'Data angin belum dapat dimuat (periksa internet)'; }
  }
  const onMoveStart = () => { field = null; ctx.clearRect(0, 0, W, H); };
  const onMoveEnd = () => { build(); load(); };
  function paint() {
    if (!panelEl || !G) return; const t = G.time[h], now = Date.now();
    panelEl.querySelector('.fha-t').textContent = `${fmt.format(new Date(t))} · ${t > now + 36e5 ? 'prakiraan' : 'saat ini'}`;
    const r = panelEl.querySelector('input'); r.max = G.time.length - 1; r.value = h; subs.forEach(f => f(t));
  }
  function setHour(i) { if (!G) return; h = Math.max(0, Math.min(G.time.length - 1, i)); build(); paint(); }
  function setPlay(v) { clearInterval(play); play = null; if (panelEl) panelEl.querySelector('.fha-pl').innerHTML = v ? '❚❚' : '▶'; if (v) play = setInterval(() => setHour((h + 1) % G.time.length), 1300); }
  const api = {
    on() { if (on) return api; on = true; pane.appendChild(cv); map.on('movestart zoomstart', onMoveStart); map.on('moveend', onMoveEnd); build(); load(); frame(); return api; },
    off() { on = false; setPlay(false); cancelAnimationFrame(raf); map.off('movestart zoomstart', onMoveStart); map.off('moveend', onMoveEnd); cv.remove(); if (panelEl) panelEl.hidden = true; return api; },
    isOn: () => on, setHour, onTime: f => subs.push(f),
    panel(el, onClose) {
      panelEl = el; el.hidden = false;
      el.innerHTML = `<div class="fha-p"><div class="fha-row"><b>💨 Angin 10 m · ECMWF</b><span class="fha-t" style="font-weight:500;opacity:.9">memuat…</span><button class="fha-x" aria-label="Tutup">×</button></div>
        <div class="fha-row"><button class="fha-pl" aria-label="Putar">▶</button><input type="range" min="0" max="71" value="0" aria-label="Jam prakiraan"></div>
        <div class="fha-lg">${SCALE.map(x => `<i style="background:${x[1]}"></i>`).join('')}</div><div class="fha-lgt">${SCALE.map(x => `<span>${Math.round(x[0] * 3.6)}</span>`).join('')}<span>km/jam</span></div>
        <div style="font-size:10px;opacity:.75">Model ECMWF IFS 0,25° via Open-Meteo · garis bergerak ke arah tiupan angin</div></div>`;
      el.querySelector('.fha-pl').onclick = () => setPlay(!play);
      el.querySelector('input').oninput = e => { setPlay(false); setHour(+e.target.value); };
      el.querySelector('.fha-x').onclick = () => { api.off(); onClose && onClose(); };
      paint(); return api;
    }
  };
  return api;
}
async function atPoint(lat, lon) {   // angin di satu titik: saat ini + 12 jam ke depan
  const r = await fetch(`${API}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&models=ecmwf_ifs025&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=wind_speed_10m,wind_direction_10m&forecast_hours=13&timezone=auto`);
  if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(), c = j.current;
  return { kmj: c.wind_speed_10m, dari: c.wind_direction_10m, ke: (c.wind_direction_10m + 180) % 360, hembus: c.wind_gusts_10m, dariTxt: arahTxt(c.wind_direction_10m), keTxt: arahTxt(c.wind_direction_10m + 180), waktu: c.time,
    jam: j.hourly.time.map((t, i) => ({ t, kmj: j.hourly.wind_speed_10m[i], dari: j.hourly.wind_direction_10m[i] })) };
}
window.FHAngin = { layer, at: atPoint, arahTxt, colOf };
})();
