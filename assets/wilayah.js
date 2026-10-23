/* Deteksi wilayah administrasi dari koordinat (luring, tanpa layanan pihak ketiga) – Fire Hotspot PRCF
 * Desa/kelurahan → kecamatan → kabupaten/kota → provinsi.
 * Batas: OCHA COD-AB Indonesia (BPS/BIG); nama & kode: Kepmendagri No. 300.2.2-2430 Tahun 2025.
 * Pemakaian: const w = await FHWilayah.lookup(lat, lon); FHWilayah.label(w)
 */
(function () {
'use strict';
const BASE = (document.currentScript && document.currentScript.src ? new URL('../data/wilayah/', document.currentScript.src).href : 'data/wilayah/');
let IDX = null; const FILES = {};
const getJ = u => fetch(u).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
function decode(ring) { const out = new Float64Array(ring.length); let x = 0, y = 0; for (let i = 0; i < ring.length; i += 2) { x += ring[i]; y += ring[i + 1]; out[i] = x / 1e5; out[i + 1] = y / 1e5; } return out; }
function inside(rings, lon, lat) { let c = false; for (const r of rings) { for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } } return c; }
function distM(rings, lon, lat) { // jarak terdekat ke tepi poligon (meter, pendekatan ekuirektangular)
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574; let best = Infinity;
  for (const r of rings) for (let i = 2; i < r.length; i += 2) { const ax = (r[i - 2] - lon) * kx, ay = (r[i - 1] - lat) * ky, bx = (r[i] - lon) * kx, by = (r[i + 1] - lat) * ky; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const px = ax + t * dx, py = ay + t * dy; best = Math.min(best, Math.hypot(px, py)); }
  return best;
}
async function prov(file) { if (!FILES[file]) FILES[file] = getJ(BASE + file).then(j => { j.desa.forEach(d => d.r = null); return j; }); return FILES[file]; }
async function lookup(lat, lon) {
  if (!IDX) IDX = await getJ(BASE + 'indeks.json');
  const cands = IDX.provinsi.filter(p => lon >= p.bbox[0] - .05 && lon <= p.bbox[2] + .05 && lat >= p.bbox[1] - .05 && lat <= p.bbox[3] + .05);
  let near = null;
  for (const p of cands) {
    const P = await prov(p.file);
    for (const d of P.desa) {
      const b = d[4]; if (lon < b[0] - .05 || lon > b[2] + .05 || lat < b[1] - .05 || lat > b[3] + .05) continue;
      if (!d.r) d.r = d[5].map(decode);
      const inBox = lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
      if (inBox && inside(d.r, lon, lat)) return build(P, d, 0);
      const m = distM(d.r, lon, lat); if (!near || m < near.m) near = { P, d, m };
    }
  }
  return near && near.m <= 3000 ? build(near.P, near.d, near.m) : null;
}
function build(P, d, m) {
  const kec = P.kec[d[2]] || ['', ''], kab = P.kab[kec[1]] || ['', P.prov];
  return { desa: d[1], tipe: d[3] === 1 ? 'Kelurahan' : d[3] === 2 ? 'Desa' : 'Desa/Kel.', kode: d[0] || null, kec: kec[0], kab: kab[0], prov: kab[1] || P.prov, jarak_m: Math.round(m), dekat: m > 0 };
}
const kabS = s => s.replace(/^Kabupaten\s+/i, 'Kab. ');
function label(w, long = true) {
  if (!w) return '';
  const a = `${w.dekat ? 'dekat ' : ''}${w.tipe} ${w.desa}`, b = `Kec. ${w.kec}`, c = kabS(w.kab), d = `Prov. ${w.prov}`;
  return long ? [a, b, c, d].join(', ') : [a, c].join(', ');
}
window.FHWilayah = { lookup, label, kabS };
})();
