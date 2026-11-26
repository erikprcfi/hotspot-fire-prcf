/* Pantau Rimbak – lapisan raster nasional ringan (FHLapNas)
 * Ubin PNG palet 1° × 1° (data/<lapisan>/t_<lat>_<lon>.png, sudut barat daya) + ikhtisar seluruh Indonesia + indeks.json.
 * Dipakai untuk: menampilkan lapisan di peta, membaca nilai di satu titik (titik panas, lokasi pengguna), dan
 * menghitung porsi suatu wilayah. Ubin yang sudah dibuka tersimpan oleh service worker (bisa luring).
 *   gambut  – PEATMAP (Xu dkk. 2018, CC BY 4.0), kisi ± 280 m
 */
(function () {
'use strict';
const EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const DEF = {
  gambut: { dir: 'data/gambut', warna: [[139, 69, 19]], kelas: [I('Gambut', 'Peat')], op: .55,
    nama: () => I('Lahan gambut (PEATMAP)', 'Peatland (PEATMAP)'), ket: () => I('Sebaran gambut indikatif skala nasional · Xu dkk. 2018, CC BY 4.0', 'Indicative national peat extent · Xu et al. 2018, CC BY 4.0') },
};
const IDX = {}, UBIN = new Map();
const J = u => fetch(u, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
const indeks = id => IDX[id] || (IDX[id] = J(DEF[id].dir + '/indeks.json').then(j => { if (!j) delete IDX[id]; return j; }));
function gambar(src) { return new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = no; im.src = src; }); }
async function ubin(id, la, lo) {
  const k = `${id}|${la}_${lo}`; if (UBIN.has(k)) return UBIN.get(k);
  const p = (async () => {
    const X = await indeks(id); if (!X) return undefined;               // indeks tak terbaca → tidak diketahui
    if (!X.ubin || !(`${la}_${lo}` in X.ubin)) return null;            // ubin kosong → nilai 0
    const im = await gambar(`${DEF[id].dir}/t_${la}_${lo}.png`), n = X.piksel_ubin || im.width;
    const c = document.createElement('canvas'); c.width = n; c.height = n; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    return { n, d: g.getImageData(0, 0, n, n).data };
  })().catch(() => undefined);
  UBIN.set(k, p); if (UBIN.size > 60) UBIN.delete(UBIN.keys().next().value);
  return p;
}
/* nilai kelas di titik: 0 = tidak termasuk, 1.. = indeks kelas, null = tidak diketahui (data gagal dimuat / di luar cakupan) */
async function nilai(id, lat, lon) {
  if (!DEF[id] || !isFinite(lat) || !isFinite(lon)) return null;
  const X = await indeks(id); if (!X) return null; const [W, S, E, N] = X.batas;
  if (lon < W || lon >= E || lat < S || lat >= N) return null;
  const la = Math.floor(lat), lo = Math.floor(lon), T = await ubin(id, la, lo);
  if (T === undefined) return null; if (T === null) return 0;
  const x = Math.min(T.n - 1, Math.floor((lon - lo) * T.n)), y = Math.min(T.n - 1, Math.floor((la + 1 - lat) * T.n)), i = (y * T.n + x) * 4;
  if (!T.d[i + 3]) return 0;
  const W2 = DEF[id].warna; let best = 1, bd = 1e9;
  W2.forEach((c, k) => { const d = Math.abs(c[0] - T.d[i]) + Math.abs(c[1] - T.d[i + 1]) + Math.abs(c[2] - T.d[i + 2]); if (d < bd) { bd = d; best = k + 1; } });
  return best;
}
/* lapisan peta: ikhtisar saat zoom kecil, ubin 1° saat zoom ≥ 8 */
function lapisan(id, map) {
  const G = L.layerGroup(), ON = new Map(); let ikh = null;
  const css = () => { if (document.getElementById('lapnas-css')) return; const s = document.createElement('style'); s.id = 'lapnas-css'; s.textContent = '.lapnas{image-rendering:pixelated;image-rendering:crisp-edges}'; document.head.appendChild(s); };
  async function draw() {
    if (!map.hasLayer(G)) return; const X = await indeks(id); if (!X) return; const [W, S, E, N] = X.batas, z = map.getZoom(), op = DEF[id].op;
    if (z < 8) { ON.forEach(l => G.removeLayer(l)); ON.clear(); if (!ikh) { ikh = L.imageOverlay(`${DEF[id].dir}/ikhtisar.png`, [[S, W], [N, E]], { opacity: op, className: 'lapnas', interactive: false, attribution: DEF[id].ket() }); G.addLayer(ikh); } return; }
    if (ikh) { G.removeLayer(ikh); ikh = null; }
    const b = map.getBounds().pad(.2), want = new Set();
    for (let la = Math.max(S, Math.floor(b.getSouth())); la <= Math.min(N - 1, Math.floor(b.getNorth())); la++)
      for (let lo = Math.max(W, Math.floor(b.getWest())); lo <= Math.min(E - 1, Math.floor(b.getEast())); lo++) { const k = `${la}_${lo}`; if (k in X.ubin) want.add(k); }
    ON.forEach((l, k) => { if (!want.has(k)) { G.removeLayer(l); ON.delete(k); } });
    want.forEach(k => { if (ON.has(k)) return; const [la, lo] = k.split('_').map(Number); const l = L.imageOverlay(`${DEF[id].dir}/t_${k}.png`, [[la, lo], [la + 1, lo + 1]], { opacity: op, className: 'lapnas', interactive: false, attribution: DEF[id].ket() }); ON.set(k, l); G.addLayer(l); });
  }
  G.on('add', () => { css(); map.on('moveend zoomend', draw); draw(); });
  G.on('remove', () => { map.off('moveend zoomend', draw); });
  return G;
}
const AKTIF = {};
function toggle(id, map, btn) {
  if (!map) return; const L0 = AKTIF[id] || (AKTIF[id] = lapisan(id, map)); const on = !map.hasLayer(L0);
  on ? L0.addTo(map) : map.removeLayer(L0); if (btn) btn.setAttribute('aria-pressed', String(on)); return on;
}
const aktif = (id, map) => !!(AKTIF[id] && map && map.hasLayer(AKTIF[id]));
/* baris detail titik: "Gambut: ya/tidak menurut PEATMAP" */
async function isiGambut(el, lat, lon) {
  if (!el) return; const v = await nilai('gambut', lat, lon);
  el.textContent = v == null ? I('tidak diketahui', 'unknown') : v ? I('Ya – lahan gambut (PEATMAP)', 'Yes – peatland (PEATMAP)') : I('Bukan gambut menurut PEATMAP', 'Not peat according to PEATMAP');
  if (v) el.style.color = '#8B4513';
}
window.FHLapNas = { DEF, indeks, nilai, lapisan, toggle, aktif, isiGambut };
})();
