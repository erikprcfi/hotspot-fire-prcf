/* Pencarian lokasi untuk menu Prakiraan – Fire Hotspot PRCF
 * Indonesia : seluruh desa/kelurahan (±81 ribu), kecamatan & kab/kota – nama Kepmendagri No. 300.2.2-2430 Tahun 2025,
 *             titik dari batas desa OCHA COD-AB (BPS/BIG) → data/wilayah/cari.json (luring, dimuat sekali saat pertama mencari)
 * Seluruh dunia: Open-Meteo Geocoding API (data GeoNames, CC BY 4.0)
 * Pemakaian: FHCari.box(elemen, { onPick: loc => {...}, onGps: () => {...} })   loc = { lat, lon, label, src:'cari' }
 */
(function () {
'use strict';
const BASE = (document.currentScript && document.currentScript.src ? new URL('../data/wilayah/', document.currentScript.src).href : 'data/wilayah/');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\b(sungai|sui|sei|s)\b/g, 'sungai').replace(/\bkabupaten\b/g, 'kab').replace(/\s+/g, ' ').trim() + ' ';
const STOP = new Set(['desa', 'kelurahan', 'kel', 'kecamatan', 'kec', 'kab', 'kota', 'prov', 'provinsi', 'di']);
const kabS = s => s.replace(/^Kabupaten\s+/i, 'Kab. ');
let DB = null;
function loadDB() {
  if (DB) return DB;
  DB = fetch(BASE + 'cari.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(J => {
    const E = [];
    J.kab.forEach((k, i) => E.push({ t: 'kab', n: k[0], lat: k[2], lon: k[3], sub: J.prov[k[1]], hay: norm(k[0] + ' ' + J.prov[k[1]]), nn: norm(k[0].replace(/^Kabupaten\s+|^Kota\s+/i, '')),
      lab: `${kabS(k[0])}, Prov. ${J.prov[k[1]]}` }));
    J.kec.forEach(c => { const k = J.kab[c[1]]; E.push({ t: 'kec', n: c[0], lat: c[2], lon: c[3], sub: `${kabS(k[0])}, ${J.prov[k[1]]}`, hay: norm(c[0] + ' ' + k[0] + ' ' + J.prov[k[1]]), nn: norm(c[0]),
      lab: `Kec. ${c[0]}, ${kabS(k[0])}, Prov. ${J.prov[k[1]]}` }); });
    J.d.forEach(d => { const c = J.kec[d[1]], k = J.kab[c[1]], tp = d[2] === 1 ? 'Kelurahan' : d[2] === 2 ? 'Desa' : 'Desa/Kel.';
      E.push({ t: 'desa', tp, n: d[0], lat: d[3], lon: d[4], sub: `Kec. ${c[0]}, ${kabS(k[0])}, ${J.prov[k[1]]}`, hay: norm(d[0] + ' ' + c[0] + ' ' + k[0] + ' ' + J.prov[k[1]]), nn: norm(d[0]),
        lab: `${tp} ${d[0]}, Kec. ${c[0]}, ${kabS(k[0])}, Prov. ${J.prov[k[1]]}` }); });
    return E;
  });
  DB.catch(() => { DB = null; });
  return DB;
}
const RANK = { kab: 0, kec: 1, desa: 2 };
async function local(q) {
  const E = await loadDB(); const toks = norm(q).trim().split(' ').filter(t => t && !STOP.has(t)); if (!toks.length) return [];
  const full = ' ' + toks.join(' ') + ' ', out = [];
  for (const e of E) {
    if (!toks.every(t => e.hay.includes(' ' + t))) continue;
    let s = e.nn === full ? 0 : e.nn.startsWith(full) || e.nn.startsWith(' ' + toks.join(' ')) ? 10 : e.nn.includes(' ' + toks[0]) ? 20 : 40;
    s += RANK[e.t] * 2; out.push([s, e]);
    if (out.length > 4000) break;
  }
  return out.sort((a, b) => a[0] - b[0] || a[1].n.length - b[1].n.length).slice(0, 10).map(x => x[1]);
}
async function world(q) {
  try { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=id&format=json`); if (!r.ok) return [];
    const j = await r.json(); return (j.results || []).filter(x => x.country_code !== 'ID').map(x => ({ t: 'dunia', n: x.name, lat: x.latitude, lon: x.longitude, sub: [x.admin1, x.country].filter(Boolean).join(', '), lab: [x.name, x.admin1, x.country].filter(Boolean).join(', ') }));
  } catch (e) { return []; }
}
const TAG = { kab: 'Kab/Kota', kec: 'Kecamatan', desa: '', dunia: 'Luar negeri' };
if (!document.getElementById('fhc-css')) {
  const st = document.createElement('style'); st.id = 'fhc-css';
  st.textContent = `.fhc{position:relative;min-width:0}.fhc-in{display:flex;align-items:center;gap:8px;height:50px;padding:0 6px 0 14px;border-radius:16px;background:var(--surface,#fff);border:1.5px solid var(--line,#d9e0dc);box-shadow:0 8px 24px -16px rgba(11,40,70,.5);transition:border-color .2s,box-shadow .2s}
  .fhc-in:focus-within{border-color:#1F6FC5;box-shadow:0 0 0 4px rgba(31,111,197,.14)}.fhc-in svg{flex:none;color:#1F6FC5}
  .fhc-in input{flex:1;min-width:0;height:100%;border:0;outline:0;background:none;color:var(--fg,#111);font:500 15px var(--f,system-ui)}
  .fhc-gps{flex:none;height:38px;padding:0 12px;border-radius:12px;border:0;background:#E8F1FB;color:#1F6FC5;font:700 12.5px var(--f,system-ui);cursor:pointer;display:flex;align-items:center;gap:6px}
  .fhc-list{position:absolute;z-index:1200;left:0;right:0;top:56px;max-height:min(60vh,420px);overflow:auto;color:var(--fg,#111);background:var(--surface,#fff);border:1px solid var(--line,#dde3df);border-radius:16px;box-shadow:0 24px 50px -20px rgba(0,0,0,.45);padding:6px}
  .fhc-list[hidden]{display:none}.fhc-it{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:10px;border:0;border-radius:12px;background:none;color:inherit;font:inherit;cursor:pointer}
  .fhc-it:hover,.fhc-it.on{background:var(--surface-2,#F1F5F3)}.fhc-it i{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:#E8F1FB;color:#1F6FC5;font-style:normal;font-size:15px}
  .fhc-it b{display:block;font-size:14px}.fhc-it small{display:block;font-size:11.5px;color:var(--muted,#667)}.fhc-it .tg{margin-left:auto;flex:none;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#667)}
  .fhc-msg{padding:12px;font-size:12.5px;color:var(--muted,#667)}.fhc-src{padding:6px 10px 4px;font-size:10.5px;color:var(--muted,#667);border-top:1px solid var(--line,#eee);margin-top:4px}`;
  document.head.appendChild(st);
}
function box(el, opt = {}) {
  el.innerHTML = `<div class="fhc"><label class="fhc-in"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(opt.placeholder || 'Cari desa, kecamatan, kota… di mana saja')}" aria-label="Cari lokasi">
    ${opt.onGps ? `<button type="button" class="fhc-gps"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3L3 10.5l7.2 2.3L12.5 20z"/></svg>GPS saya</button>` : ''}</label>
    <div class="fhc-list" hidden></div></div>`;
  const inp = el.querySelector('input'), list = el.querySelector('.fhc-list'); let seq = 0, items = [], sel = -1, tm = null;
  if (opt.onGps) el.querySelector('.fhc-gps').onclick = e => { e.preventDefault(); list.hidden = true; opt.onGps(); };
  const paint = (msg) => {
    list.hidden = false;
    list.innerHTML = (items.length ? items.map((x, i) => `<button type="button" class="fhc-it${i === sel ? ' on' : ''}" data-i="${i}"><i>${x.t === 'dunia' ? '🌐' : x.t === 'kab' ? '🏙' : x.t === 'kec' ? '🗺' : '📍'}</i><span style="min-width:0"><b>${esc(x.t === 'desa' ? x.tp + ' ' + x.n : x.n)}</b><small>${esc(x.sub)}</small></span><span class="tg">${TAG[x.t]}</span></button>`).join('') : '')
      + (msg ? `<div class="fhc-msg">${msg}</div>` : '') + `<div class="fhc-src">Indonesia: nama Kepmendagri 2025 & batas desa BPS/BIG · luar negeri: GeoNames (Open-Meteo)</div>`;
    list.querySelectorAll('.fhc-it').forEach(b => b.onclick = () => pick(items[+b.dataset.i]));
  };
  const pick = x => { list.hidden = true; inp.value = x.t === 'desa' ? `${x.tp} ${x.n}` : x.n; inp.blur(); opt.onPick && opt.onPick({ lat: x.lat, lon: x.lon, label: x.lab, src: 'cari' }); };
  const run = async () => {
    const q = inp.value.trim(), my = ++seq; if (q.length < 2) { list.hidden = true; return; }
    items = []; sel = -1; paint('Mencari…');
    const [A, B] = await Promise.all([local(q).catch(() => []), q.length >= 3 ? world(q) : Promise.resolve([])]);
    if (my !== seq) return; items = [...A, ...B.slice(0, A.length >= 6 ? 2 : 6)];
    paint(items.length ? '' : 'Tidak ditemukan. Coba ejaan lain, mis. “Sei”/“Sungai”, atau tambahkan nama kabupaten.');
  };
  inp.oninput = () => { clearTimeout(tm); tm = setTimeout(run, 220); };
  inp.onfocus = () => { loadDB(); if (items.length) list.hidden = false; };
  inp.onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(''); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items.length) pick(items[Math.max(0, sel)]); else run(); } else if (e.key === 'Escape') list.hidden = true; };
  document.addEventListener('click', e => { if (!el.contains(e.target)) list.hidden = true; });
  return { focus: () => inp.focus(), set: v => { inp.value = v; } };
}
window.FHCari = { box, local, world, load: loadDB };
})();
