/* Pantau Rimbak · Peta website gaya NASA Worldview (hanya versi website/laptop – HP tetap memakai tampilan aplikasi).
 * - Panel lapisan di kiri: titik panas se-Indonesia (NASA FIRMS 7 hari), lapisan satelit NASA GIBS & model Copernicus CAMS, transparansi, legenda resmi.
 * - Linimasa di bawah: pilih tanggal (harian) atau jam (CAMS per 3 jam), putar animasi, dan grafik jumlah titik panas per hari
 *   di area peta yang sedang terlihat (data/titik_id: salinan resmi NASA FIRMS NRT, disaring ke daratan Indonesia).
 * Tidak ada angka yang dibuat-buat: bila data tidak ada untuk suatu hari, batang ditampilkan kosong dengan keterangan.
 */
(function () {
'use strict';
if (!window.FH_WEB) return;
const BASE = (document.currentScript && document.currentScript.src ? new URL('../', document.currentScript.src).href : './');
const $ = s => document.querySelector(s), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EN = () => document.documentElement.lang === 'en';
const T = (id, en) => EN() ? en : id;
const GRUP = [
  [T('Api & citra satelit', 'Fire & satellite imagery'), ['fire', 'true']],
  [T('Asap & kualitas udara', 'Smoke & air quality'), ['smoke', 'pm25', 'aod', 'ai', 'co']],
  [T('Gangguan vegetasi', 'Vegetation disturbance'), ['dist', 'distann']]
];
const SUMBER = { fire: 'NASA FIRMS · GIBS', true: 'NASA GIBS · VIIRS', co: 'NASA GIBS · AIRS', aod: 'NASA GIBS · VIIRS', smoke: 'Copernicus CAMS · ECMWF', pm25: 'Copernicus CAMS · ECMWF', ai: 'NASA GIBS · OMPS', dist: 'NASA OPERA · HLS', distann: 'NASA OPERA · HLS' };
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const iso = d => d.toISOString().slice(0, 10);
const addDay = (s, n) => iso(new Date(new Date(s + 'T00:00:00Z').getTime() + n * 864e5));
const pad = n => String(n).padStart(2, '0');
const N0 = n => Number(n).toLocaleString(EN() ? 'en-US' : 'id-ID');

let MAP, NASA, IDX = null, HOT = null, HOTON = false, OPA = {}, TL = [], tSel = -1;
const tiles = {};
const idx = () => IDX || (IDX = fetch(BASE + 'data/titik_id/indeks.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));
const petak = k => tiles[k] || (tiles[k] = fetch(BASE + 'data/titik_id/' + k + '.json').then(r => r.ok ? r.json() : []).catch(() => []));

function css() {
  const st = document.createElement('style'); st.id = 'wp-css';
  st.textContent = `
html.web .nasabar{display:none!important}
html.web #v-home .topcards{left:auto;right:84px;top:16px;width:372px;flex-direction:column}
html.web #v-home .topcards .tc-stack{display:flex;flex-direction:column;gap:8px;width:100%}
html.web #v-home .imgchip{left:356px;bottom:150px}
html.web #v-home .fabs{bottom:150px;right:16px}
html.web #v-home #windPanel{left:356px;right:84px;bottom:150px}
html.web #v-home .focuslbl{left:calc(50% + 170px)}
.wp-panel{position:absolute;z-index:540;left:16px;top:16px;bottom:16px;width:324px;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;
  background:rgba(8,22,16,.86);-webkit-backdrop-filter:blur(16px) saturate(1.3);backdrop-filter:blur(16px) saturate(1.3);border:1px solid rgba(255,255,255,.1);color:#EAF2ED;
  box-shadow:0 18px 50px -18px rgba(0,0,0,.6);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.wp-panel.tutup{transform:translateX(calc(-100% + 46px))}
.wp-panel.tutup .wp-scroll,.wp-panel.tutup .wp-hd>div{visibility:hidden}
.wp-hd{display:flex;align-items:center;gap:10px;padding:14px 12px 12px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.wp-hd img{width:30px;height:30px;border-radius:50%}
.wp-hd>div{flex:1;min-width:0}.wp-hd b{display:block;font-size:15px;letter-spacing:-.01em}.wp-hd small{display:block;font-size:11.5px;opacity:.65;margin-top:1px}
.wp-tg{width:30px;height:30px;border-radius:9px;border:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:15px;flex:none}
.wp-tg:hover{background:rgba(255,255,255,.18)}
.wp-scroll{flex:1;overflow-y:auto;padding:6px 10px 14px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent}
.wp-h4{margin:14px 6px 6px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8FD6B4}
.wp-ly{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;padding:9px 10px;border-radius:12px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;cursor:pointer}
.wp-ly:hover{background:rgba(255,255,255,.06)}
.wp-ly[aria-pressed="true"]{background:rgba(242,104,60,.14);border-color:rgba(242,104,60,.55)}
.wp-ly i{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.45);margin-top:1px;position:relative}
.wp-ly[aria-pressed="true"] i{border-color:#F2683C}.wp-ly[aria-pressed="true"] i::after{content:"";position:absolute;inset:3px;border-radius:50%;background:#F2683C}
.wp-ly.cb i{border-radius:5px}.wp-ly.cb[aria-pressed="true"] i::after{inset:2px;border-radius:2px}
.wp-ly span{flex:1;min-width:0}.wp-ly b{display:block;font-size:13px;font-weight:700;line-height:1.3}.wp-ly small{display:block;font-size:11px;opacity:.6;margin-top:2px}
.wp-det{margin:2px 4px 8px 38px;font-size:11.5px;line-height:1.5;color:rgba(234,242,237,.78)}
.wp-det img{display:block;width:100%;margin-top:8px;border-radius:6px;background:#fff}
.wp-op{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px}.wp-op input{flex:1;accent-color:#F2683C}
.wp-note{margin:4px 6px 0 38px;font-size:11px;color:#FFC98F;line-height:1.45}
.wp-more{display:flex;align-items:center;gap:8px;width:100%;margin-top:4px;padding:10px 12px;border-radius:12px;border:1px dashed rgba(255,255,255,.22);background:transparent;color:#EAF2ED;font:600 12.5px inherit;cursor:pointer}
.wp-more:hover{background:rgba(255,255,255,.06)}
.wp-panel .sumpanel{position:static!important;margin:4px 0 0;background:rgba(255,255,255,.05);border-radius:14px;border:1px solid rgba(255,255,255,.08);-webkit-backdrop-filter:none;backdrop-filter:none;padding:10px}
.wp-panel .sp-grid{grid-template-columns:1fr 1fr!important;gap:8px 10px!important}
.wp-panel .sp-foot2{font-size:10.5px}
.wp-src{margin:16px 6px 0;font-size:10.5px;line-height:1.5;opacity:.55}
.wp-time{position:absolute;z-index:540;left:356px;right:84px;bottom:16px;height:118px;border-radius:18px;padding:10px 14px 8px;display:flex;flex-direction:column;
  background:rgba(8,22,16,.86);-webkit-backdrop-filter:blur(16px) saturate(1.3);backdrop-filter:blur(16px) saturate(1.3);border:1px solid rgba(255,255,255,.1);color:#EAF2ED;box-shadow:0 18px 50px -18px rgba(0,0,0,.6)}
.wp-tlh{display:flex;align-items:center;gap:10px;font-size:12.5px;min-height:28px}
.wp-tlh b{font-size:13px}.wp-tlh .wp-dt{font:700 12.5px var(--f-data,ui-monospace,monospace);color:#FFB36B}
.wp-tlh .sp{flex:1}
.wp-btn{height:28px;min-width:30px;padding:0 9px;border-radius:9px;border:0;background:rgba(255,255,255,.1);color:#fff;font:700 12px inherit;cursor:pointer}
.wp-btn:hover{background:rgba(255,255,255,.18)}.wp-btn.pri{background:#E4572E}.wp-btn.pri:hover{background:#F2683C}.wp-btn[disabled]{opacity:.35;cursor:default}
.wp-bars{flex:1;display:grid;gap:3px;align-items:end;margin-top:6px;position:relative}
.wp-bar{position:relative;height:100%;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer;border-radius:6px;padding:0 1px}
.wp-bar:hover{background:rgba(255,255,255,.06)}
.wp-bar u{display:block;border-radius:3px 3px 1px 1px;background:linear-gradient(180deg,#FF7A45,#C8361A);min-height:2px;text-decoration:none;transition:height .4s}
.wp-bar.kosong u{background:rgba(255,255,255,.12)}
.wp-bar em{font:600 9.5px var(--f-data,ui-monospace,monospace);font-style:normal;text-align:center;opacity:.55;margin-top:3px;white-space:nowrap;overflow:visible;min-height:13px;display:flex;justify-content:center}
.wp-bar.on{background:rgba(242,104,60,.18);outline:1.5px solid #F2683C}
.wp-bar.on em{opacity:1;color:#FFB36B}
.wp-bar.off{cursor:default;opacity:.45}
.wp-bar .tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#fff;color:#14201a;font:600 11px system-ui;padding:4px 7px;border-radius:6px;white-space:nowrap;z-index:2;pointer-events:none}
.wp-bar:hover .tip{display:block}
.wp-ft{display:flex;justify-content:space-between;gap:10px;font-size:10.5px;opacity:.6;margin-top:3px;white-space:nowrap;overflow:hidden}
.wp-pop b{display:block;margin-bottom:2px}.wp-pop{font:12px/1.5 system-ui}
`;
  document.head.appendChild(st);
}

/* ---------- Titik panas se-Indonesia di tampilan peta ---------- */
function kunciView(pad1 = 0) {
  const b = MAP.getBounds(), ks = [];
  const s = Math.floor(b.getSouth()) - pad1, n = Math.floor(b.getNorth()) + pad1, w = Math.floor(b.getWest()) - pad1, e = Math.floor(b.getEast()) + pad1;
  for (let la = Math.max(s, -12); la <= Math.min(n, 7); la++) for (let lo = Math.max(w, 94); lo <= Math.min(e, 142); lo++) ks.push(`${la}_${lo}`);
  return ks;
}
const warnaUmur = m => { const j = (Date.now() / 6e4 - m) / 60; return j <= 24 ? '#FF2D2D' : j <= 72 ? '#FF8C1A' : '#FFD23F'; };
async function gambarTitik() {
  if (!HOT) { MAP.createPane('wpHot').style.zIndex = 452; HOT = L.layerGroup().addTo(MAP); }
  HOT.clearLayers(); const note = $('#wpHotNote'); if (note) note.textContent = '';
  if (!HOTON) return;
  const I = await idx(); if (!I) { if (note) note.textContent = T('Data titik panas se-Indonesia belum tersedia.', 'Indonesia-wide hotspot data unavailable.'); return; }
  const ks = kunciView().filter(k => I.ubin[k]);
  if (ks.reduce((a, k) => a + I.ubin[k], 0) > 25000) { if (note) note.textContent = T(`Perbesar peta untuk menampilkan titik (${N0(ks.reduce((a, k) => a + I.ubin[k], 0))} deteksi di area ini).`, `Zoom in to show points (${N0(ks.reduce((a, k) => a + I.ubin[k], 0))} detections in view).`); return; }
  const rend = L.canvas({ pane: 'wpHot' }), b = MAP.getBounds().pad(.05);
  for (const P of await Promise.all(ks.map(petak))) for (const r of P) {
    if (!b.contains([r[0], r[1]])) continue;
    L.circleMarker([r[0], r[1]], { renderer: rend, pane: 'wpHot', radius: 3.6, weight: .8, color: '#2a0a00', fillColor: warnaUmur(r[2]), fillOpacity: .95 })
      .bindPopup(() => { const w = new Date(r[2] * 6e4 + 7 * 36e5); return `<div class="wp-pop"><b>${T('Titik panas', 'Hotspot')} · ${esc((I.sensor || [])[r[3]] || '')}</b>${w.getUTCDate()} ${BULAN[w.getUTCMonth()]} ${w.getUTCFullYear()}, ${pad(w.getUTCHours())}.${pad(w.getUTCMinutes())} WIB<br>${r[0].toFixed(4)}, ${r[1].toFixed(4)} · FRP ${r[4]} MW<br><small>NASA FIRMS NRT</small></div>`; })
      .addTo(HOT);
  }
}

/* ---------- Grafik titik panas per hari (tanggal WIB) di area terlihat ---------- */
async function hitungHarian() {
  const I = await idx(); if (!I) return null;
  const ks = kunciView().filter(k => I.ubin[k]), c = {};
  if (ks.length <= 40) {   // tepat: hanya titik di dalam batas tampilan
    const b = MAP.getBounds();
    for (const P of await Promise.all(ks.map(petak))) for (const r of P) { if (!b.contains([r[0], r[1]])) continue; const d = iso(new Date(r[2] * 6e4 + 7 * 36e5)); c[d] = (c[d] || 0) + 1; }
    return { c, tepat: true, upd: I.diperbarui_utc };
  }
  if (!I.per_hari_wib) return null;   // tampilan luas: per petak 1°×1° yang tersentuh tampilan
  for (const k of ks) for (const [d, n] of Object.entries(I.per_hari_wib[k] || {})) c[d] = (c[d] || 0) + n;
  return { c, tepat: false, upd: I.diperbarui_utc };
}

/* ---------- Linimasa ---------- */
function slots() {
  const L0 = NASA.layer;
  if (L0 && L0.hourly) {   // CAMS: 24 jam lalu s.d. 48 jam ke depan, per 3 jam (WIB ditampilkan)
    const now = new Date(), h3 = Math.floor(now.getUTCHours() / 3) * 3, t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h3) - 24 * 36e5, S = [];
    for (let k = 0; k <= 24; k++) { const t = new Date(t0 + k * 3 * 36e5), w = new Date(t.getTime() + 7 * 36e5); S.push({ d: iso(t), h: t.getUTCHours(), lab: w.getUTCHours() % 12 === 1 ? `${w.getUTCDate()}/${w.getUTCMonth() + 1} ${pad(w.getUTCHours())}` : '', jam: `${pad(w.getUTCHours())}.00`, sub: `${w.getUTCDate()}/${w.getUTCMonth() + 1}`, fut: t.getTime() > Date.now() }); }
    return S;
  }
  const max = L0 && NASA.maxDate ? NASA.maxDate() : iso(new Date(Date.now() + 7 * 36e5)), S = [];
  for (let k = 13; k >= 0; k--) { const d = addDay(max, -k), D = new Date(d + 'T00:00:00Z'); S.push({ d, lab: `${D.getUTCDate()}`, sub: `${HARI[D.getUTCDay()]}`, bln: D.getUTCDate() === 1 || k === 13 ? BULAN[D.getUTCMonth()] : '' }); }
  return S;
}
let HARIAN = null;
async function gambarLinimasa(hitungUlang) {
  const box = $('#wpBars'); if (!box) return;
  const L0 = NASA.layer; TL = slots();
  if (hitungUlang || !HARIAN) HARIAN = await hitungHarian();
  const hourly = !!(L0 && L0.hourly), C = HARIAN ? HARIAN.c : {}, mx = Math.max(1, ...TL.map(s => C[s.d] || 0));
  const curKey = L0 ? (hourly ? `${NASA.date}|${(NASA.timeLabel || '')}` : NASA.date) : null;
  box.style.gridTemplateColumns = `repeat(${TL.length},minmax(0,1fr))`;
  tSel = -1;
  box.innerHTML = TL.map((s, i) => {
    let on = false;
    if (L0 && !hourly && s.d === NASA.date) on = true;
    if (L0 && hourly) { const w = new Date(new Date(`${s.d}T${pad(s.h)}:00:00Z`).getTime() + 7 * 36e5); on = (NASA.timeLabel || '').startsWith(`${iso(w)} ${pad(w.getUTCHours())}.00`); }
    if (on) tSel = i;
    if (hourly) return `<div class="wp-bar${on ? ' on' : ''}" data-i="${i}"><u style="height:4px;${s.fut ? 'background:rgba(255,179,107,.5)' : ''}"></u><em>${s.lab}</em><span class="tip">${s.sub} ${s.jam} WIB${s.fut ? T(' · prakiraan', ' · forecast') : ''}</span></div>`;
    const n = C[s.d], ada = n != null;
    const tip = ada ? `${N0(n)} ${T('titik panas', 'hotspots')} · ${s.d}` : `${s.d} · ${T('di luar jendela data 7 hari', 'outside the 7-day data window')}`;
    return `<div class="wp-bar${on ? ' on' : ''}${ada ? '' : ' kosong'}" data-i="${i}"><u style="height:${ada ? Math.max(3, Math.round(n / mx * 46)) : 2}px"></u><em>${s.bln ? s.bln + ' ' : ''}${s.lab}</em><span class="tip">${tip}</span></div>`;
  }).join('');
  box.querySelectorAll('.wp-bar').forEach(el => el.onclick = () => pilihSlot(+el.dataset.i));
  const ft = $('#wpFt');
  if (ft) ft.innerHTML = hourly
    ? `<span>${T('Model Copernicus CAMS per 3 jam (WIB) · kolom oranye = prakiraan', 'Copernicus CAMS model every 3 h (WIB) · orange = forecast')}</span><span>ECMWF</span>`
    : `<span>${T('Batang = jumlah titik panas per hari (WIB) di area peta yang terlihat', 'Bars = hotspots per day (WIB) in the visible map area')}${HARIAN && !HARIAN.tepat ? T(' · dihitung per petak 1°', ' · counted per 1° tile') : ''}</span><span>NASA FIRMS NRT · ${HARIAN && HARIAN.upd ? HARIAN.upd.slice(0, 16).replace('T', ' ') + ' UTC' : ''}</span>`;
  const nm = $('#wpTlName'), dt = $('#wpTlDate');
  if (nm) nm.textContent = L0 ? NASA.label : T('Titik panas harian · pilih tanggal untuk menampilkan citra NASA', 'Daily hotspots · pick a date to show NASA imagery');
  if (dt) dt.textContent = L0 ? (hourly ? NASA.timeLabel : NASA.date) : '';
  $('#wpPlay').textContent = NASA.playing ? '⏸' : '▶';
  ['#wpPrev', '#wpNext', '#wpPlay'].forEach(s => { const b = $(s); if (b) b.disabled = !L0 || !!L0.fixed; });
}
function pilihSlot(i) {
  const s = TL[i]; if (!s) return;
  if (!NASA.layer) NASA.set('fire');
  const L0 = NASA.layer; if (L0.fixed) return;
  if (L0.hourly) { if (tSel < 0) { NASA.set(L0.id); return; } NASA.step(i - tSel); return; }
  NASA.setDate(s.d);
}

/* ---------- Panel lapisan ---------- */
function panel() {
  const v = $('#v-home'); if (!v || $('#wpPanel')) return;
  const P = document.createElement('aside'); P.className = 'wp-panel'; P.id = 'wpPanel';
  P.innerHTML = `<div class="wp-hd"><img src="${BASE}assets/logo_pr_256.png" alt=""><div><b>${T('Lapisan peta', 'Map layers')}</b><small>${T('Seluruh Indonesia · sumber resmi', 'All of Indonesia · official sources')}</small></div><button class="wp-tg" id="wpTg" aria-label="${T('Lipat panel', 'Collapse panel')}">‹</button></div>
    <div class="wp-scroll">
      <div class="wp-h4">${T('Titik panas', 'Hotspots')}</div>
      <button class="wp-ly cb" id="wpHot" aria-pressed="false"><i></i><span><b>${T('Titik panas Indonesia · 7 hari', 'Indonesia hotspots · 7 days')}</b><small>NASA FIRMS NRT · VIIRS & MODIS · ${T('merah ≤24 jam, oranye ≤3 hari, kuning ≤7 hari', 'red ≤24 h, orange ≤3 d, yellow ≤7 d')}</small></span></button>
      <div class="wp-note" id="wpHotNote"></div>
      ${GRUP.map(([g, ids]) => `<div class="wp-h4">${g}</div>${ids.map(id => { const l = FHNasa.LAYERS.find(x => x.id === id); return l ? `<button class="wp-ly" data-ly="${id}" aria-pressed="false"><i></i><span><b>${esc(l.nm)}</b><small>${SUMBER[id] || ''}</small></span></button><div class="wp-det" data-det="${id}" hidden></div>` : ''; }).join('')}`).join('')}
      <div class="wp-h4">${T('Lapisan lain', 'More layers')}</div>
      <button class="wp-more" id="wpMore">▤ ${T('Peta dasar, tutupan hutan, batas wilayah…', 'Basemap, forest cover, boundaries…')}</button>
      <div class="wp-h4">${T('Ringkasan titik panas', 'Hotspot summary')}</div>
      <div id="wpSum"></div>
      <p class="wp-src">${T('Sumber: NASA FIRMS & GIBS (Earthdata), NASA OPERA, Copernicus CAMS/ECMWF. Tanggal citra NASA dalam UTC; jam CAMS dalam WIB.', 'Sources: NASA FIRMS & GIBS (Earthdata), NASA OPERA, Copernicus CAMS/ECMWF. NASA image dates are UTC; CAMS hours are WIB.')}</p>
    </div>`;
  v.appendChild(P);
  const sp = $('#sumpanel'); if (sp) $('#wpSum').appendChild(sp);
  ['mousedown', 'dblclick', 'wheel', 'touchstart', 'pointerdown'].forEach(e => P.addEventListener(e, ev => ev.stopPropagation()));
  $('#wpTg').onclick = () => { const t = P.classList.toggle('tutup'); $('#wpTg').textContent = t ? '›' : '‹'; try { localStorage.setItem('wp_tutup', t ? '1' : ''); } catch (e) { } };
  try { if (localStorage.getItem('wp_tutup')) { P.classList.add('tutup'); $('#wpTg').textContent = '›'; } } catch (e) { }
  $('#wpMore').onclick = () => { const b = $('#fabLayer'); if (b) b.click(); };
  $('#wpHot').onclick = () => { HOTON = !HOTON; $('#wpHot').setAttribute('aria-pressed', HOTON); try { localStorage.setItem('wp_hot', HOTON ? '1' : ''); } catch (e) { } gambarTitik(); };
  P.querySelectorAll('[data-ly]').forEach(b => b.onclick = () => NASA.set(NASA.id === b.dataset.ly ? null : b.dataset.ly));

  const Tm = document.createElement('div'); Tm.className = 'wp-time'; Tm.id = 'wpTime';
  Tm.innerHTML = `<div class="wp-tlh"><b id="wpTlName"></b><span class="wp-dt" id="wpTlDate"></span><span class="sp"></span>
      <button class="wp-btn" id="wpPrev" aria-label="${T('Sebelumnya', 'Previous')}">‹</button><button class="wp-btn pri" id="wpPlay" aria-label="${T('Putar', 'Play')}">▶</button><button class="wp-btn" id="wpNext" aria-label="${T('Berikutnya', 'Next')}">›</button></div>
    <div class="wp-bars" id="wpBars"></div><div class="wp-ft" id="wpFt"></div>`;
  v.appendChild(Tm);
  ['mousedown', 'dblclick', 'wheel', 'touchstart', 'pointerdown'].forEach(e => Tm.addEventListener(e, ev => ev.stopPropagation()));
  $('#wpPrev').onclick = () => NASA.step(-1); $('#wpNext').onclick = () => NASA.step(1);
  $('#wpPlay').onclick = () => NASA.playing ? NASA.stop() : NASA.play(7);
}
function sinkronPanel() {
  const id = NASA.id;
  document.querySelectorAll('#wpPanel [data-ly]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ly === id));
  document.querySelectorAll('#wpPanel [data-det]').forEach(d => {
    const on = d.dataset.det === id; d.hidden = !on; if (!on) { d.innerHTML = ''; return; }
    if (d.innerHTML) return;
    const l = NASA.layer, op = OPA[id] != null ? OPA[id] : l.op;
    d.innerHTML = `${esc(l.desc || '')}${l.legend ? `<img src="${esc(l.legend)}" alt="${T('Legenda', 'Legend')} ${esc(l.short)}">` : ''}<label class="wp-op">${T('Transparansi', 'Opacity')}<input type="range" min="15" max="100" value="${Math.round(op * 100)}"></label>`;
    const r = d.querySelector('input'); r.oninput = () => { OPA[id] = r.value / 100; aturOpa(); };
  });
  aturOpa();
}
function aturOpa() { const id = NASA.id, p = MAP.getPane('nasa'); if (p && id && OPA[id] != null) p.style.opacity = OPA[id]; }

let tmr = 0;
function mulai() {
  css(); panel();
  NASA.onChange(() => { sinkronPanel(); gambarLinimasa(false); });
  MAP.on('moveend', () => { clearTimeout(tmr); tmr = setTimeout(() => { gambarLinimasa(true); gambarTitik(); }, 350); });
  try { HOTON = !!localStorage.getItem('wp_hot'); } catch (e) { }
  $('#wpHot').setAttribute('aria-pressed', HOTON);
  sinkronPanel(); gambarLinimasa(true); gambarTitik();
  setInterval(() => { IDX = null; for (const k in tiles) delete tiles[k]; gambarLinimasa(true); gambarTitik(); }, 30 * 6e4);   // data diperbarui pipeline tiap 3 jam
}
(function tunggu(n) {
  const A = window.FHApp, m = A && A.map && A.map(), a = A && A.api && A.api();
  if (m && a && window.FHNasa) { MAP = m; NASA = a; return mulai(); }
  if (n < 240) setTimeout(() => tunggu(n + 1), 250);
})(0);
window.FHWebPeta = { muatUlang: () => { gambarLinimasa(true); gambarTitik(); } };
})();
