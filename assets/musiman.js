/* Prakiraan musiman 3 bulan (ECMWF SEAS5) – Fire Hotspot PRCF. Data: data/prakiraan.json → lokasi[id].musiman */
(function () {
'use strict';
const BLNP = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const N = v => Number(v).toLocaleString('id-ID');
if (!document.getElementById('ms-css')) {
  const st = document.createElement('style'); st.id = 'ms-css';
  st.textContent = `.ms{display:grid;gap:10px}.ms-m{border:1px solid var(--line,#e3e8e4);border-radius:14px;padding:12px;background:var(--surface-2,#f6f8f6)}
  .ms-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.ms-top b{font-size:15px}.ms-top span{font:600 13px var(--f-data,monospace)}
  .ms-v{font-size:12.5px;font-weight:700;margin:4px 0 8px}.ms-bar{display:flex;height:22px;border-radius:8px;overflow:hidden;font:700 10.5px var(--f,sans-serif);color:#fff}
  .ms-bar div{display:grid;place-items:center;min-width:0;transition:flex-grow .8s}.ms-l{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted,#666);margin-top:4px}
  .ms-r{font-size:12px;color:var(--muted,#666);margin-top:6px;line-height:1.45}.ms-note{font-size:11.5px;color:var(--muted,#666);margin:0;line-height:1.45}`;
  document.head.appendChild(st);
}
const C = ['#A0522D', '#8A968F', '#2E7FD1'];
function html(M) {
  if (!M || !M.bulan || !M.bulan.length) return '<p class="ms-note">Prakiraan musiman belum tersedia; akan muncul setelah pembaruan otomatis berikutnya.</p>';
  return `<div class="ms">${M.bulan.map(m => {
    const p = [m.peluang_bawah_normal, m.peluang_normal, m.peluang_atas_normal], k = p.indexOf(Math.max(...p));
    const verdict = p[k] >= 50 ? ['Cenderung <span style="color:' + C[0] + '">di bawah normal (lebih kering)</span>', 'Cenderung <span>normal</span>', 'Cenderung <span style="color:' + C[2] + '">di atas normal (lebih basah)</span>'][k] + ` · peluang ${p[k]}%` : 'Tidak ada kecenderungan kuat (tidak ada kategori ≥ 50%)';
    const nm = BLNP[+m.bulan.slice(5) - 1] + ' ' + m.bulan.slice(0, 4);
    return `<div class="ms-m"><div class="ms-top"><b>${nm}</b><span>${N(m.median)} mm</span></div><div class="ms-v">${verdict}</div>
      <div class="ms-bar">${p.map((v, i) => `<div style="flex-grow:${Math.max(v, 0.001)};background:${C[i]}">${v >= 12 ? v + '%' : ''}</div>`).join('')}</div>
      <div class="ms-l"><span>Di bawah normal</span><span>Normal</span><span>Di atas normal</span></div>
      <div class="ms-r">Prakiraan (median ${m.anggota} anggota): <b>${N(m.median)} mm</b>, rentang ${N(m.p10)}–${N(m.p90)} mm (10–90%). Normal ERA5 2001–2025: ${N(m.normal)} mm; batas tersil ${N(m.tersil_bawah)} dan ${N(m.tersil_atas)} mm; terendah ${N(m.normal_min)}, tertinggi ${N(m.normal_maks)} mm.</div></div>`;
  }).join('')}
  <p class="ms-note">Sumber: ${M.sumber}. ${M.catatan} Prakiraan resmi BMKG: <a href="https://www.bmkg.go.id/iklim" target="_blank" rel="noopener">bmkg.go.id/iklim</a>.</p></div>`;
}
window.FHMusiman = { html };
})();
