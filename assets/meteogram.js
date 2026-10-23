/* Meteogram ensemble ECMWF (gaya ECMWF ENS meteogram) – Fire Hotspot PRCF
 * Data: ECMWF IFS ENS 0,25° – 51 anggota ensemble (1 kontrol + 50 gangguan), 15 hari, via Open-Meteo Ensemble API (CC BY 4.0).
 * Tiap kotak = sebaran 51 kemungkinan: kotak 25–75%, garis tengah median, kumis 10–90%, titik min/maks.
 * Pemakaian: FHMeteogram.mount(elemen, lat, lon)
 */
(function () {
'use strict';
const HR = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const N1 = v => Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const cache = {};
async function load(lat, lon) {
  const k = lat.toFixed(2) + ',' + lon.toFixed(2); if (cache[k] && Date.now() - cache[k].t < 30 * 6e4) return cache[k].d;
  const u = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&models=ecmwf_ifs025&hourly=temperature_2m,precipitation,wind_speed_10m&forecast_days=15&timezone=auto`;
  let e; for (let t = 0; t < 3; t++) { try { const ac = new AbortController(), to = setTimeout(() => ac.abort(), 25000); const r = await fetch(u, { signal: ac.signal }); clearTimeout(to); if (r.ok) { const d = await r.json(); cache[k] = { t: Date.now(), d }; return d; } e = new Error('HTTP ' + r.status); } catch (x) { e = x; } await new Promise(o => setTimeout(o, 900 * (t + 1))); }
  throw e;
}
function daily(d) {
  const H = d.hourly, T = H.time, mem = v => Object.keys(H).filter(k => k === v || k.startsWith(v + '_member'));
  const P = mem('precipitation'), TT = mem('temperature_2m'), W = mem('wind_speed_10m');
  const days = [...new Set(T.map(t => t.slice(0, 10)))];
  const out = [];
  for (const day of days) {
    const idx = T.map((t, i) => t.startsWith(day) ? i : -1).filter(i => i >= 0); if (idx.length < 20) continue;
    const pr = P.map(k => idx.reduce((s, i) => s + (H[k][i] ?? 0), 0)).filter(Number.isFinite);
    const tmax = TT.map(k => Math.max(...idx.map(i => H[k][i]).filter(v => v != null))).filter(Number.isFinite);
    const tmin = TT.map(k => Math.min(...idx.map(i => H[k][i]).filter(v => v != null))).filter(Number.isFinite);
    const wmax = W.map(k => Math.max(...idx.map(i => H[k][i]).filter(v => v != null))).filter(Number.isFinite);
    const st = a => a.length ? { min: Math.min(...a), p10: q(a, .1), p25: q(a, .25), p50: q(a, .5), p75: q(a, .75), p90: q(a, .9), max: Math.max(...a) } : null;
    out.push({ day, n: pr.length, pr: st(pr), tmax: st(tmax), tmin: st(tmin), w: st(wmax),
      p1: Math.round(100 * pr.filter(v => v >= 1).length / pr.length), p10: Math.round(100 * pr.filter(v => v >= 10).length / pr.length), p20: Math.round(100 * pr.filter(v => v >= 20).length / pr.length) });
  }
  return out;
}
function panel(D, key, o) {
  const cw = 62, L = 44, W = L + D.length * cw + 8, H = o.h || 150, top = 26, bot = 22, ih = H - top - bot;
  const keys = o.pair || [key];
  const vals = D.flatMap(x => keys.flatMap(k => x[k] ? (o.zero ? [x[k].p90] : [x[k].min, x[k].max]) : []));
  let lo = o.zero ? 0 : Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals, o.minHi || 0) + (o.zero ? 0 : 1));
  if (o.zero) { const nice = [5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200]; hi = nice.find(v => v >= Math.max(o.minHi || 0, ...vals) * 1.1) || hi; }
  const yr = v => top + ih * (1 - (v - lo) / (hi - lo || 1)), y = v => Math.max(top, yr(v));
  const ticks = []; const step = (hi - lo) <= 6 ? 1 : (hi - lo) <= 12 ? 2 : (hi - lo) <= 30 ? 5 : (hi - lo) <= 60 ? 10 : (hi - lo) <= 120 ? 25 : 50;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="mg-svg"><rect x="${L}" y="${top}" width="${D.length * cw}" height="${ih}" class="mg-bg"/>`;
  D.forEach((x, i) => { if (i % 2) s += `<rect x="${L + i * cw}" y="${top}" width="${cw}" height="${ih}" class="mg-alt"/>`; if (i === 7) s += `<line x1="${L + i * cw}" x2="${L + i * cw}" y1="${top}" y2="${top + ih}" class="mg-sep"/><text x="${L + i * cw + 4}" y="${top + 11}" class="mg-tiny">keyakinan lebih rendah →</text>`; });
  ticks.forEach(v => { s += `<line x1="${L}" x2="${L + D.length * cw}" y1="${y(v)}" y2="${y(v)}" class="mg-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="mg-ax">${v}</text>`; });
  s += `<text x="${L}" y="15" class="mg-title">${o.title}</text>`;
  const box = (st, i, col, off = 0, bw = 22) => { if (!st) return ''; const cx = L + i * cw + cw / 2 + off;
    return `<g class="mg-box" style="animation-delay:${i * 35}ms"><line x1="${cx}" x2="${cx}" y1="${y(st.p90)}" y2="${y(st.p10)}" stroke="${col}" stroke-width="1.6"/><line x1="${cx - 6}" x2="${cx + 6}" y1="${y(st.p90)}" y2="${y(st.p90)}" stroke="${col}" stroke-width="1.6"/><line x1="${cx - 6}" x2="${cx + 6}" y1="${y(st.p10)}" y2="${y(st.p10)}" stroke="${col}" stroke-width="1.6"/>
      <rect x="${cx - bw / 2}" y="${y(st.p75)}" width="${bw}" height="${Math.max(1.5, y(st.p25) - y(st.p75))}" fill="${col}" fill-opacity=".28" stroke="${col}" stroke-width="1.6" rx="2"/><line x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${y(st.p50)}" y2="${y(st.p50)}" stroke="${col}" stroke-width="2.6"/>
      ${st.max > hi ? `<path d="M${cx - 4} ${top + 7}l4-6 4 6z" fill="${col}"><title>maks ${N1(st.max)}</title></path>` : `<circle cx="${cx}" cy="${y(st.max)}" r="1.9" fill="${col}"/>`}<circle cx="${cx}" cy="${y(st.min)}" r="1.9" fill="${col}"/>
      <title>${o.tip(st)}</title></g>`; };
  D.forEach((x, i) => { if (o.pair) { s += box(x[o.pair[0]], i, o.col[0], -12, 18) + box(x[o.pair[1]], i, o.col[1], 12, 18); } else s += box(x[key], i, o.col); });
  D.forEach((x, i) => { const d = new Date(x.day + 'T00:00:00Z'); s += `<text x="${L + i * cw + cw / 2}" y="${H - 6}" text-anchor="middle" class="mg-ax${d.getUTCDay() === 0 ? ' mg-sun' : ''}">${HR[d.getUTCDay()]} ${d.getUTCDate()}</text>`; });
  return s + '</svg>';
}
function probRow(D) {
  const cw = 62, L = 44, W = L + D.length * cw + 8, rows = [['p1', '≥ 1 mm'], ['p10', '≥ 10 mm'], ['p20', '≥ 20 mm']], H = 22 + rows.length * 18;
  const col = v => v >= 80 ? '#08306B' : v >= 60 ? '#2171B5' : v >= 40 ? '#6BAED6' : v >= 20 ? '#C6DBEF' : v >= 5 ? '#EEF4FA' : 'transparent';
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="mg-svg"><text x="${L}" y="14" class="mg-title">Peluang hujan harian (% dari 51 anggota)</text>`;
  rows.forEach(([k, n], r) => { const yy = 20 + r * 18; s += `<text x="${L - 6}" y="${yy + 12}" text-anchor="end" class="mg-ax">${n}</text>`;
    D.forEach((x, i) => { const v = x[k]; s += `<rect x="${L + i * cw + 2}" y="${yy}" width="${cw - 4}" height="16" rx="3" fill="${col(v)}" class="mg-cell"/><text x="${L + i * cw + cw / 2}" y="${yy + 12}" text-anchor="middle" class="mg-cv" style="fill:${v >= 60 ? '#fff' : 'var(--fg,#123)'}">${v}%</text>`; }); });
  return s + '</svg>';
}
function css() {
  if (document.getElementById('mg-css')) return; const st = document.createElement('style'); st.id = 'mg-css';
  st.textContent = `.mg{min-width:0}.mg-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;scrollbar-width:thin}.mg-scroll svg{display:block}
  .mg-svg{font-family:var(--f-data,ui-monospace,monospace)}.mg-bg{fill:var(--surface-2,#F6F8FA)}.mg-alt{fill:rgba(127,140,150,.07)}.mg-grid{stroke:rgba(127,140,150,.25);stroke-width:1}
  .mg-sep{stroke:rgba(127,140,150,.6);stroke-dasharray:3 3}.mg-ax{font-size:10.5px;fill:var(--muted,#667)}.mg-sun{fill:#D93025}.mg-tiny{font-size:9px;fill:var(--muted,#667)}
  .mg-title{font:700 11.5px var(--f,sans-serif);fill:var(--fg,#123);letter-spacing:.02em}.mg-cv{font-size:10px;font-weight:700}
  .mg-box{animation:mgin .6s cubic-bezier(.2,.8,.2,1) both;transform-box:fill-box;transform-origin:center}@keyframes mgin{from{opacity:0;transform:scaleY(.4)}}
  .mg-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--muted,#667);margin:6px 2px 0;align-items:center}.mg-legend svg{vertical-align:middle}
  .mg-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.mg-sum div{background:var(--surface-2,#F6F8FA);border:1px solid var(--line,#e3e8e4);border-radius:12px;padding:8px 10px}
  .mg-sum b{display:block;font:700 18px var(--f-data,monospace)}.mg-sum span{font-size:11px;color:var(--muted,#667);line-height:1.3;display:block}
  .mg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.mg-badge{font:700 10.5px var(--f,sans-serif);letter-spacing:.06em;padding:3px 8px;border-radius:999px;background:#0B3B6F;color:#fff;white-space:nowrap}
  .mg-skel{height:180px;border-radius:14px;background:linear-gradient(100deg,var(--surface-2,#eee) 30%,var(--line,#ddd) 50%,var(--surface-2,#eee) 70%);background-size:300% 100%;animation:mgsk 1.4s ease infinite}@keyframes mgsk{to{background-position:-150% 0}}
  .mg-note{font-size:11.5px;color:var(--muted,#667);line-height:1.45;margin:8px 0 0}`;
  document.head.appendChild(st);
}
async function mount(el, lat, lon) {
  css(); el.innerHTML = '<div class="mg-skel"></div>';
  try {
    const D = daily(await load(lat, lon)); if (!D.length) throw new Error('data kosong');
    const d0 = D[0], wk = D.slice(0, 7), rainy = wk.filter(x => x.p1 >= 50).length, wet = wk.reduce((a, x) => a + x.pr.p50, 0);
    const boxLeg = c => `<svg width="34" height="16"><line x1="17" x2="17" y1="1" y2="15" stroke="${c}" stroke-width="1.6"/><rect x="9" y="4" width="16" height="8" fill="${c}" fill-opacity=".28" stroke="${c}" stroke-width="1.6"/><line x1="9" x2="25" y1="8" y2="8" stroke="${c}" stroke-width="2.4"/></svg>`;
    el.innerHTML = `<div class="mg"><div class="mg-head"><div style="font-size:12.5px;color:var(--muted,#667)">Sebaran 51 kemungkinan cuaca dari model ensemble ECMWF</div><span class="mg-badge">ECMWF ENS</span></div>
      <div class="mg-sum"><div><b>${d0.p1}%</b><span>peluang hujan ≥ 1 mm hari ini</span></div><div><b>${rainy}/7</b><span>hari dengan peluang hujan ≥ 50%</span></div><div><b>${N1(wet)}</b><span>mm total hujan 7 hari (median)</span></div></div>
      <div class="mg-scroll">${panel(D, 'pr', { title: 'Curah hujan (mm/hari)', col: '#2F6FB0', zero: true, minHi: 5, tip: s => `median ${N1(s.p50)} mm · 10–90%: ${N1(s.p10)}–${N1(s.p90)} mm · maks ${N1(s.max)} mm` })}
      ${probRow(D)}
      ${panel(D, 'tmax', { title: 'Suhu 2 m (°C) · maks merah, min biru', pair: ['tmax', 'tmin'], col: ['#D9534F', '#3B7DD8'], h: 170, tip: s => `median ${N1(s.p50)}° · 10–90%: ${N1(s.p10)}–${N1(s.p90)}°` })}
      ${panel(D, 'w', { title: 'Kecepatan angin maks 10 m (km/jam)', col: '#2E9E5B', zero: true, minHi: 10, h: 140, tip: s => `median ${N1(s.p50)} km/jam · 90%: ${N1(s.p90)}` })}</div>
      <div class="mg-legend"><span>${boxLeg('#556')} kotak = 25–75% anggota · garis tebal = median · kumis = 10–90% · titik = min/maks</span><span>geser ke kanan untuk hari 8–15 →</span></div>
      <p class="mg-note">Sumber: ECMWF IFS ENS 0,25° (51 anggota: 1 kontrol + 50 gangguan), diperbarui 4× sehari, via Open-Meteo Ensemble API (CC BY 4.0). Makin lebar kotak, makin tidak pasti prakiraannya. Nilai adalah prakiraan model grid ±25 km, bukan pengukuran di tempat.</p></div>`;
  } catch (e) { el.innerHTML = `<p class="mg-note">Meteogram ensemble belum dapat dimuat (${String(e.message || e)}). Periksa koneksi internet.</p>`; }
}
window.FHMeteogram = { mount, load, daily };
})();
