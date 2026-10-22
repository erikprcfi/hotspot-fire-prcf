/* Kualitas udara & asap per desa – Fire Hotspot PRCF
 * Data: Copernicus Atmosphere Monitoring Service (CAMS) global (ECMWF), diolah di data/prakiraan.json
 * Kategori PM2.5 (rata-rata 24 jam) mengikuti BMKG.
 */
(function () {
'use strict';
const KAT = ['Baik', 'Sedang', 'Tidak Sehat', 'Sangat Tidak Sehat', 'Berbahaya'];
const COL = ['#2E9E5B', '#2F7FD1', '#E0A800', '#D93025', '#3A1F4A'];
const SARAN = ['Tingkat mutu udara yang sangat baik, tidak memberikan efek negatif terhadap manusia, hewan, dan tumbuhan.',
  'Tingkat mutu udara masih dapat diterima pada kesehatan manusia, hewan, dan tumbuhan.',
  'Tingkat mutu udara yang bersifat merugikan pada manusia, hewan, dan tumbuhan.',
  'Tingkat mutu udara yang dapat meningkatkan risiko kesehatan pada sejumlah segmen populasi yang terpapar.',
  'Tingkat mutu udara yang dapat merugikan kesehatan serius pada populasi dan perlu penanganan cepat.'];  // penjelasan kategori ISPU, Permen LHK No. 14/2020
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], HR = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const N1 = v => Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), N = v => Number(v).toLocaleString('id-ID');
const dn = s => { const d = new Date(s + 'T00:00:00Z'); return `${HR[d.getUTCDay()]} ${d.getUTCDate()} ${BLN[d.getUTCMonth()]}`; };
if (!document.getElementById('ud-css')) {
  const st = document.createElement('style'); st.id = 'ud-css';
  st.textContent = `.ud{display:grid;gap:12px;min-width:0;overflow:hidden}.ud-now>div:last-child{min-width:0}.ud-now{display:flex;gap:14px;align-items:center;border-radius:18px;padding:14px;color:#fff;position:relative;overflow:hidden}
  .ud-now .g{width:92px;height:92px;flex:none;position:relative}.ud-now .g svg{width:92px;height:92px}.ud-now .g b{position:absolute;inset:0;display:grid;place-items:center;font:700 22px var(--f-data,monospace);line-height:1;text-align:center}
  .ud-now .g b small{display:block;font:600 9.5px var(--f,sans-serif);opacity:.85;margin-top:2px}
  .ud-now h4{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.85}.ud-now .k{font-size:22px;font-weight:800;margin:2px 0}.ud-now p{margin:0;font-size:12.5px;opacity:.95;line-height:1.4}
  .ud-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ud-mini div{background:var(--surface-2,#f6f8f6);border:1px solid var(--line,#e3e8e4);border-radius:12px;padding:8px 10px}
  .ud-mini b{display:block;font:600 16px var(--f-data,monospace)}.ud-mini span{font-size:11px;color:var(--muted,#666);line-height:1.3;display:block}
  .ud-bars{display:flex;gap:4px;align-items:flex-end;height:120px;padding-top:14px}.ud-bars .c{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
  .ud-bars .c i{display:block;width:100%;border-radius:6px 6px 2px 2px;transform-origin:bottom;animation:udg .8s cubic-bezier(.2,.8,.2,1) both}
  .ud-bars .c.f i{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.28) 0 4px,transparent 4px 8px)}
  .ud-bars .c span{font-size:9px;color:var(--muted,#666);white-space:nowrap}.ud-bars .c em{font:600 10px var(--f-data,monospace);font-style:normal}
  @keyframes udg{from{transform:scaleY(0)}to{transform:scaleY(1)}}
  .ud-note{font-size:11.5px;color:var(--muted,#666);margin:0;line-height:1.45}.ud-lg{display:flex;flex-wrap:wrap;gap:6px}.ud-lg span{font-size:10.5px;font-weight:700;color:#fff;padding:3px 8px;border-radius:999px}`;
  document.head.appendChild(st);
}
function gauge(v, k) {
  const pct = Math.min(1, v / 250), a0 = Math.PI * .75, a1 = a0 + Math.PI * 1.5 * pct, r = 40, cx = 46, cy = 46;
  const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)], [x0, y0] = p(a0), [x1, y1] = p(a1), [xe, ye] = p(a0 + Math.PI * 1.5);
  return `<svg viewBox="0 0 92 92"><path d="M${x0} ${y0}A${r} ${r} 0 1 1 ${xe} ${ye}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="9" stroke-linecap="round"/>
    <path d="M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" style="stroke-dasharray:300;stroke-dashoffset:300;animation:uddash 1.2s .1s ease-out forwards"/></svg>
    <style>@keyframes uddash{to{stroke-dashoffset:0}}</style>`;
}
function html(U, opt = {}) {
  if (!U || !U.harian || !U.harian.length) return '<p class="ud-note">Data kualitas udara belum tersedia; akan muncul setelah pembaruan otomatis berikutnya.</p>';
  const now = U.sekarang, k = now.kategori, today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  const H = U.harian, mx = Math.max(60, ...H.map(h => h.pm25));
  const fut = H.filter(h => h.tanggal >= today), worst = fut.reduce((a, b) => b.pm25 > a.pm25 ? b : a, fut[0] || H[H.length - 1]);
  return `<div class="ud"><div class="ud-now" style="background:linear-gradient(135deg,${COL[k]},${COL[k]}cc)"><div class="g">${gauge(now.pm25_24j ?? now.pm25, k)}<b>${Math.round(now.pm25_24j ?? now.pm25)}<small>µg/m³<br>24 jam</small></b></div>
    <div><h4>Kualitas udara · ${now.t.slice(11, 16)} WIB</h4><div class="k">${KAT[k]}</div><p>${SARAN[k]}</p><p style="font-size:11px;opacity:.85;margin-top:4px">PM2.5 jam ini ${Math.round(now.pm25)} µg/m³ · penjelasan kategori ISPU (Permen LHK 14/2020)</p></div></div>
   <div class="ud-mini"><div><b>${N(Math.round(now.co))}</b><span>karbon monoksida permukaan (µg/m³)</span></div><div><b>${N1(now.aod)}</b><span>ketebalan aerosol/asap (AOD 550 nm)</span></div><div><b>${worst ? KAT[worst.kategori] : '–'}</b><span>terburuk hari ini s.d. 5 hari${worst ? ` (${dn(worst.tanggal)})` : ''}</span></div></div>
   <div><div style="font-size:12.5px;font-weight:700">PM2.5 rata-rata harian · 7 hari lalu & prakiraan 5 hari</div>
    <div class="ud-bars">${H.map((h, i) => `<div class="c${h.tanggal >= today ? ' f' : ''}"><em>${Math.round(h.pm25)}</em><i style="height:${Math.max(4, 84 * h.pm25 / mx)}px;background-color:${COL[h.kategori]};animation-delay:${i * 45}ms" title="${dn(h.tanggal)}: ${N1(h.pm25)} µg/m³ (${KAT[h.kategori]})"></i><span>${h.tanggal === today ? 'Kini' : +h.tanggal.slice(8)}</span></div>`).join('')}</div>
    <p class="ud-note">Angka di bawah batang = tanggal; batang bergaris = prakiraan.</p></div>
   <div class="ud-lg">${KAT.map((n, i) => `<span style="background:${COL[i]}">${n}</span>`).join('')}</div>
   <p class="ud-note">Sumber: ${U.sumber}. Kategori: ${U.kategori_batas}; penjelasan kategori menurut ISPU (Permen LHK No. 14/2020). Model berbasis satelit & emisi kebakaran (grid ±40 km), bukan alat ukur di desa; nilai sebenarnya di dekat sumber api bisa lebih tinggi.</p></div>`;
}
window.FHUdara = { html, KAT, COL };
})();
