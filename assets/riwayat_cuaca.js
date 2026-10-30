/* Riwayat cuaca per lokasi – Fire Hotspot PRCF
 * Sumber: reanalisis ECMWF ERA5 (Copernicus) harian sejak 2001 (data/cuaca*.json) dan
 * indeks bahaya kebakaran FDRS ±400 hari terakhir (data/prakiraan/fdrs_<lokasi>.json).
 * Dipakai bersama oleh app.html dan index.html:  FHRiwayat.render(elemen, {site, hotspots})
 */
(function () {
'use strict';
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLNP = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const LVN = ['Rendah', 'Sedang', 'Tinggi', 'Ekstrem'], LVC = ['#2F7FD1', '#2E9E5B', '#E0A800', '#D93025'];
const N = v => Number(v).toLocaleString('id-ID'), N1 = v => Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const iso = d => d.toISOString().slice(0, 10), D0 = s => new Date(s + 'T00:00:00Z');
const add = (s, n) => iso(new Date(D0(s).getTime() + n * 864e5));
const tgl = s => `${+s.slice(8, 10)} ${BLNP[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
const cache = {}, ST = {};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || null;
function J(u) { return cache[u] || (cache[u] = fetch(u + '?' + Math.floor(Date.now() / 6e5)).then(r => { if (!r.ok) throw new Error(u); return r.json(); }).catch(e => { delete cache[u]; throw e; })); }

if (!document.getElementById('rc-css')) {
  const st = document.createElement('style'); st.id = 'rc-css';
  st.textContent = `.rc-ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.rc-ctl button{height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f6f8f6);color:inherit;font:600 13px inherit;cursor:pointer}
  .rc-ctl button[aria-pressed=true]{background:var(--brand-2,#14563F);border-color:var(--brand-2,#14563F);color:#fff}
  .rc-dates{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:flex-end}.rc-dates label{font-size:12px;color:var(--muted,#666);font-weight:600;display:flex;flex-direction:column;gap:3px}
  .rc-dates input{height:38px;border-radius:10px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f6f8f6);color:inherit;padding:0 8px;font:500 14px inherit}
  .rc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:12px}.rc-grid div{background:var(--surface-2,#f6f8f6);border:1px solid var(--line,#e3e8e4);border-radius:12px;padding:9px 10px}
  .rc-grid b{display:block;font:600 18px var(--f-data,monospace)}.rc-grid span{font-size:11.5px;color:var(--muted,#666);line-height:1.3;display:block}
  .rc-chart svg{width:100%;max-width:820px;height:auto;display:block}.rc-chart text{font:10px sans-serif;fill:var(--muted,#666)}
  .rc-lg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted,#666);margin-top:4px}.rc-lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  .rc-note{font-size:12px;color:var(--muted,#666);margin:8px 0 0}.rc-h{font-size:13px;font-weight:700;margin:16px 0 6px}
  .rc-tw{max-height:300px;overflow:auto;border:1px solid var(--line,#e3e8e4);border-radius:10px;margin-top:8px}.rc-tw table{border-collapse:collapse;width:100%;font-size:12px}
  .rc-tw th{position:sticky;top:0;background:var(--brand,#0B3B2C);color:#fff;padding:6px;text-align:right;font-weight:600}.rc-tw th:first-child,.rc-tw td:first-child{text-align:left}
  .rc-tw td{padding:5px 6px;border-top:1px solid var(--line,#e3e8e4);text-align:right;font-family:var(--f-data,monospace)}
  .rc-btn{margin-top:10px;height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f6f8f6);color:inherit;font:600 13px inherit;cursor:pointer}`;
  document.head.appendChild(st);
}

function stats(C, a, b) {
  let n = 0, sum = 0, wet = 0, dry = 0, maxDry = 0, dryEnd = null, tmx = [], rh = [], ang = [], hot = null;
  C.t.forEach((t, i) => {
    if (t < a || t > b) return; const r = C.hujan[i]; if (r == null) return;
    n++; sum += r; if (r >= 1) { wet++; dry = 0; } else { dry++; if (dry > maxDry) { maxDry = dry; dryEnd = t; } }
    if (C.tmaks[i] != null) { tmx.push(C.tmaks[i]); if (!hot || C.tmaks[i] > hot[1]) hot = [t, C.tmaks[i]]; }
    if (C.rh[i] != null) rh.push(C.rh[i]); if (C.angin[i] != null) ang.push(C.angin[i]);
  });
  const avg = a => a.length ? a.reduce((p, c) => p + c, 0) / a.length : null;
  return { n, sum, wet, maxDry, dryEnd, tmax: avg(tmx), hot, rh: avg(rh), angin: ang.length ? Math.max(...ang) : null };
}
function normal(C, a, b) { // rata-rata jangka panjang 2001–2025 untuk tanggal yang sama (hanya bila ≤ 366 hari)
  const len = Math.round((D0(b) - D0(a)) / 864e5) + 1; if (len > 366) return null; const v = [];
  for (let y = 2001; y <= 2025; y++) { const a2 = y + a.slice(4); if (isNaN(D0(a2))) continue; if (a2.slice(0, 4) === a.slice(0, 4)) continue; const b2 = add(a2, len - 1); const s = stats(C, a2, b2); if (s.n === len) v.push(s.sum); }
  return v.length >= 10 ? { mean: v.reduce((p, c) => p + c, 0) / v.length, n: v.length } : null;
}
function series(C, a, b) {
  const len = Math.round((D0(b) - D0(a)) / 864e5) + 1;
  const unit = len <= 62 ? 'hari' : len <= 400 ? 'minggu' : len <= 3700 ? 'bulan' : 'tahun';
  const key = t => unit === 'hari' ? t : unit === 'bulan' ? t.slice(0, 7) : unit === 'tahun' ? t.slice(0, 4) : iso(new Date(D0(t).getTime() - ((D0(t).getUTCDay() + 6) % 7) * 864e5));
  const m = new Map();
  C.t.forEach((t, i) => { if (t < a || t > b || C.hujan[i] == null) return; const k = key(t); const o = m.get(k) || { k, r: 0, tx: [], n: 0 }; o.r += C.hujan[i]; o.n++; if (C.tmaks[i] != null) o.tx.push(C.tmaks[i]); m.set(k, o); });
  return { unit, pts: [...m.values()].map(o => ({ k: o.k, r: o.r, tx: o.tx.length ? o.tx.reduce((p, c) => p + c, 0) / o.tx.length : null })) };
}
function lab(k, unit) { if (unit === 'hari' || unit === 'minggu') return `${+k.slice(8, 10)} ${BLN[+k.slice(5, 7) - 1]}`; if (unit === 'bulan') return `${BLN[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`; return k; }
function chart(S, hot) {
  const P = S.pts; if (!P.length) return '<p class="rc-note">Tidak ada data.</p>';
  const W = 640, H = 220, l = 40, r = 36, t = 10, b = 26, n = P.length, bw = (W - l - r) / n;
  const mx = Math.max(5, ...P.map(p => p.r)), step = Math.pow(10, Math.floor(Math.log10(mx))), top = Math.ceil(mx / (step / 2)) * (step / 2);
  const tx = P.map(p => p.tx).filter(v => v != null), t0 = Math.floor(Math.min(...tx) - 1), t1 = Math.ceil(Math.max(...tx) + 1);
  const y = v => t + (H - b - t) * (1 - v / top), yT = v => t + (H - b - t) * (1 - (v - t0) / Math.max(1, t1 - t0));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik curah hujan dan suhu">`;
  for (let i = 0; i <= 4; i++) { const yy = t + (H - b - t) * (1 - i / 4); s += `<line x1="${l}" x2="${W - r}" y1="${yy}" y2="${yy}" stroke="${css('--line') || '#e3e8e4'}"/><text x="${l - 4}" y="${yy + 3}" text-anchor="end">${N(Math.round(top * i / 4))}</text><text x="${W - r + 4}" y="${yy + 3}">${Math.round(t0 + (t1 - t0) * i / 4)}°</text>`; }
  const every = Math.max(1, Math.ceil(n / 9));
  P.forEach((p, i) => { const x = l + i * bw; const h = (H - b - t) * p.r / top; s += `<rect x="${x + bw * .12}" y="${H - b - h}" width="${Math.max(1, bw * .76)}" height="${h}" fill="#2F7FD1" rx="1"><title>${lab(p.k, S.unit)}: ${N1(p.r)} mm</title></rect>`;
    if (hot && hot[p.k]) s += `<circle cx="${x + bw / 2}" cy="${t + 4}" r="${Math.min(6, 2 + Math.sqrt(hot[p.k]))}" fill="#D93025"><title>${hot[p.k]} titik panas</title></circle>`;
    if (i % every === 0) s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${lab(p.k, S.unit)}</text>`; });
  s += `<polyline fill="none" stroke="#E4572E" stroke-width="2" points="${P.map((p, i) => p.tx == null ? '' : `${l + i * bw + bw / 2},${yT(p.tx)}`).join(' ')}"/>`;
  return s + `</svg><div class="rc-lg"><span><i style="background:#2F7FD1"></i>Curah hujan (mm/${S.unit})</span><span><i style="background:#E4572E"></i>Suhu maksimum rata-rata (°C)</span>${hot ? '<span><i style="background:#D93025;border-radius:50%"></i>Titik panas ≤ 25 km</span>' : ''}</div>`;
}
function fdrsChart(F, a, b) {
  const idx = F.t.map((t, i) => i).filter(i => F.t[i] >= a && F.t[i] <= b); if (idx.length < 2) return '';
  const W = 640, H = 120, l = 40, r = 36, t = 8, bb = 22, n = idx.length, x = k => l + (W - l - r) * k / (n - 1), y = v => t + (H - bb - t) * (1 - v / 100);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;[[0, 73, 0], [73, 78, 1], [78, 83, 2], [83, 100, 3]].forEach(([p, q, k]) => { s += `<rect x="${l}" y="${y(q)}" width="${W - l - r}" height="${y(p) - y(q)}" fill="${LVC[k]}" opacity=".14"/>`; });
  [0, 50, 73, 83, 100].forEach(v => { s += `<text x="${l - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`; });
  s += `<polyline fill="none" stroke="${css('--fg') || '#222'}" stroke-width="1.6" points="${idx.map((i, k) => `${x(k)},${y(F.ffmc[i])}`).join(' ')}"/>`;
  const ev = Math.max(1, Math.ceil(n / 8)); idx.forEach((i, k) => { if (k % ev === 0) s += `<text x="${x(k)}" y="${H - 6}" text-anchor="middle">${lab(F.t[i], 'hari')}</text>`; });
  const lv = [0, 0, 0, 0]; idx.forEach(i => lv[F.level[i]]++);
  return s + `</svg><p class="rc-note">Hari per tingkat bahaya: ${lv.map((c, k) => `<b style="color:${LVC[k]}">${LVN[k]} ${c}</b>`).join(' · ')}. Garis = FFMC (kekeringan serasah); latar = kelas FDRS.</p>`;
}

function render(el, opt) {
  const site = opt.site; if (!el || !site) return;
  const fileC = site.id === 'nangalauk' ? 'data/cuaca.json' : `data/cuaca_${site.id}.json`;
  const sk = (el.id || 'rc') + ':' + site.id, st = ST[sk] || (ST[sk] = { p: '30' });
  el.innerHTML = '<p class="rc-note">Memuat riwayat cuaca…</p>';
  Promise.all([J(fileC), J(`data/prakiraan/fdrs_${site.id}.json`).catch(() => null)]).then(([C, F]) => {
    const last = C.t[C.t.length - 1], first = C.t[0];
    const pre = { '7': 7, '30': 30, '90': 90, '365': 365 };
    let a, b;
    if (st.p === 'k') { a = st.a || add(last, -29); b = st.b || last; } else if (st.p === 'th') { a = (+last.slice(0, 4) - 1) + '-01-01'; b = (+last.slice(0, 4) - 1) + '-12-31'; } else { b = last; a = add(last, -(pre[st.p] - 1)); }
    if (a < first) a = first; if (b > last) b = last; if (a > b) [a, b] = [b, a];
    const S = stats(C, a, b), Nm = normal(C, a, b), SR = series(C, a, b);
    let hot = null, nHot = null;
    if (opt.hotspots && opt.hotspots.length && opt.si != null) { const minD = opt.hotspots.reduce((m, p) => p.d < m ? p.d : m, '9999'); if (a >= minD) { hot = {}; nHot = 0; const key = t => SR.unit === 'hari' ? t : SR.unit === 'bulan' ? t.slice(0, 7) : SR.unit === 'tahun' ? t.slice(0, 4) : iso(new Date(D0(t).getTime() - ((D0(t).getUTCDay() + 6) % 7) * 864e5)); for (const p of opt.hotspots) { const w = iso(new Date(p.when.getTime() + 7 * 36e5)); if (w >= a && w <= b && p.ls && p.ls[opt.si] <= 25) { const k = key(w); hot[k] = (hot[k] || 0) + 1; nHot++; } } } }
    const pct = Nm ? S.sum / Nm.mean * 100 : null, kond = pct == null ? '' : pct < 60 ? 'jauh lebih kering dari normal' : pct < 85 ? 'lebih kering dari normal' : pct <= 115 ? 'normal' : pct <= 150 ? 'lebih basah dari normal' : 'jauh lebih basah dari normal';
    const rows = []; C.t.forEach((t, i) => { if (t >= a && t <= b) rows.push([t, C.hujan[i], C.tmaks[i], C.rh[i], C.angin[i]]); });
    el.innerHTML = `<div class="rc-ctl" role="group" aria-label="Periode">${[['7', '7 hari'], ['30', '30 hari'], ['90', '3 bulan'], ['365', '1 tahun'], ['th', 'Tahun lalu'], ['k', 'Pilih tanggal']].map(([k, t]) => `<button type="button" data-p="${k}" aria-pressed="${st.p === k}">${t}</button>`).join('')}</div>
      ${st.p === 'k' ? `<div class="rc-dates"><label>Dari<input type="date" class="rcA" min="${first}" max="${last}" value="${a}"></label><label>Sampai<input type="date" class="rcB" min="${first}" max="${last}" value="${b}"></label><button type="button" class="rc-btn rcGo">Tampilkan</button></div>` : ''}
      <p class="rc-note"><b>${tgl(a)} – ${tgl(b)}</b> · Desa ${esc(site.desa_nama)} · ${N(S.n)} hari data</p>
      <div class="rc-grid"><div><b>${N1(S.sum)} mm</b><span>total curah hujan${pct != null ? ` · ${Math.round(pct)}% dari normal (${kond})` : ''}</span></div>
       <div><b>${N(S.wet)}</b><span>hari hujan (≥ 1 mm) dari ${N(S.n)} hari</span></div>
       <div><b>${N(S.maxDry)} hari</b><span>kering beruntun terpanjang${S.dryEnd ? `, berakhir ${tgl(S.dryEnd)}` : ''}</span></div>
       <div><b>${S.tmax != null ? N1(S.tmax) + '°' : '–'}</b><span>suhu maksimum rata-rata${S.hot ? `; tertinggi ${N1(S.hot[1])}° (${tgl(S.hot[0])})` : ''}</span></div>
       <div><b>${S.rh != null ? Math.round(S.rh) + '%' : '–'}</b><span>kelembapan rata-rata</span></div>
       <div><b>${S.angin != null ? N1(S.angin) : '–'}</b><span>angin maksimum (km/jam)</span></div>
       ${nHot != null ? `<div><b>${N(nHot)}</b><span>titik panas ≤ 25 km pada periode ini</span></div>` : ''}</div>
      <div class="rc-h">Curah hujan & suhu per ${SR.unit}</div><div class="rc-chart">${chart(SR, hot)}</div>
      ${F ? (() => { const c = fdrsChart(F, a, b); return c ? `<div class="rc-h">Bahaya kebakaran harian (FDRS)</div><div class="rc-chart">${c}</div>` : `<p class="rc-note">Indeks bahaya kebakaran harian tersedia mulai ${tgl(F.t[0])}.</p>`; })() : ''}
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Tabel harian (${N(rows.length)} hari)</summary><div class="rc-tw"><table><thead><tr><th>Tanggal</th><th>Hujan (mm)</th><th>Suhu maks (°C)</th><th>RH (%)</th><th>Angin maks (km/jam)</th></tr></thead><tbody>${rows.slice().reverse().slice(0, 400).map(r => `<tr><td>${r[0]}</td><td>${r[1] == null ? '–' : N1(r[1])}</td><td>${r[2] == null ? '–' : N1(r[2])}</td><td>${r[3] == null ? '–' : Math.round(r[3])}</td><td>${r[4] == null ? '–' : N1(r[4])}</td></tr>`).join('')}</tbody></table></div>${rows.length > 400 ? '<p class="rc-note">Tabel menampilkan 400 hari terakhir; unduh CSV untuk semua hari.</p>' : ''}</details>
      <button type="button" class="rc-btn rcCsv">Unduh CSV (${N(rows.length)} hari)</button>
      <p class="rc-note">Sumber: ${esc(C.sumber)}, titik ${esc(C.lokasi)}. Reanalisis = model iklim yang menggabungkan pengamatan satelit & stasiun (grid ±9–25 km), bukan alat ukur di desa. Data tersedia ${tgl(first)} – ${tgl(last)}.${Nm ? ` Normal = rata-rata tanggal yang sama tahun 2001–2025 (${Nm.n} tahun).` : ''}</p>`;
    el.querySelectorAll('.rc-ctl button').forEach(btn => btn.onclick = () => { st.p = btn.dataset.p; if (st.p === 'k') { st.a = a; st.b = b; } render(el, opt); });
    const go = el.querySelector('.rcGo'); if (go) go.onclick = () => { st.a = el.querySelector('.rcA').value; st.b = el.querySelector('.rcB').value; render(el, opt); };
    el.querySelector('.rcCsv').onclick = () => { const en = window.FHLang && FHLang.get() === 'en', tt = v => (en ? FHLang.t(v) : v); const L = [en ? 'date,rain_mm,max_temp_c,humidity_percent,max_wind_kmh' : 'tanggal,hujan_mm,suhu_maks_c,kelembapan_persen,angin_maks_kmjam'].concat(rows.map(r => r.map(v => v == null ? '' : v).join(','))); const u = URL.createObjectURL(new Blob(['﻿' + L.join('\n') + (en ? `\n# Source: ${tt(C.sumber)}; point ${tt(C.lokasi)}` : `\n# Sumber: ${C.sumber}; titik ${C.lokasi}`)], { type: 'text/csv' })); const x = document.createElement('a'); x.href = u; x.download = en ? `weather_${site.id}_${a}_to_${b}.csv` : `cuaca_${site.id}_${a}_sd_${b}.csv`; document.body.appendChild(x); x.click(); setTimeout(() => { URL.revokeObjectURL(u); x.remove(); }, 1500); };
  }).catch(() => { el.innerHTML = '<p class="rc-note">Riwayat cuaca belum dapat dimuat. Periksa koneksi internet.</p>'; });
}
window.FHRiwayat = { render };
})();
