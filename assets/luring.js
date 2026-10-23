/* Mode luring (tanpa sinyal) untuk patroli – Fire Hotspot PRCF
 * Menyimpan di HP: citra Sentinel-2 cloudless 2025 (EOX, CC BY-NC-SA 4.0 – boleh disimpan untuk pemakaian non-komersial
 * dengan atribusi) zoom 8–14 di sekitar lokasi dampingan, serta data titik panas, batas wilayah, prakiraan & orbit satelit.
 * Citra resolusi tinggi Esri & OpenStreetMap TIDAK diunduh massal (dilarang ketentuan layanan mereka); hanya yang sudah dilihat tersimpan otomatis.
 * Pemakaian: FHLuring.perkiraan(lat, lon, km) → {n, mb};  FHLuring.simpan(lat, lon, km, onProgress, berkasData) → Promise
 */
(function () {
'use strict';
const EOX = (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`;
const Z0 = 8, Z1 = 14;
const t2 = (lat, lon, z) => { const n = 2 ** z, x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); return [x, y]; };
function tiles(lat, lon, km) {
  const dl = km / 110.574, dg = km / (111.32 * Math.cos(lat * Math.PI / 180)), out = [];
  for (let z = Z0; z <= Z1; z++) { const [x0, y0] = t2(lat + dl, lon - dg, z), [x1, y1] = t2(lat - dl, lon + dg, z); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(EOX(z, x, y)); }
  return out;
}
const perkiraan = (lat, lon, km) => { const n = tiles(lat, lon, km).length; return { n, mb: Math.round(n * 17 / 1024 * 10) / 10 }; };
async function simpan(lat, lon, km, onP, dataFiles = []) {
  if (!('caches' in window)) throw new Error('Peramban tidak mendukung penyimpanan luring');
  const L = tiles(lat, lon, km), c = await caches.open('pa-tiles'); let done = 0, fail = 0;
  const total = L.length + dataFiles.length;
  for (const f of dataFiles) { try { await fetch(f, { cache: 'no-cache' }); } catch (e) { fail++; } done++; onP && onP(done, total, fail); }
  let i = 0; const kerja = async () => { while (i < L.length) { const u = L[i++]; try { if (!(await c.match(u))) { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); else fail++; } } catch (e) { fail++; } done++; if (done % 10 === 0 || done === total) onP && onP(done, total, fail); } };
  await Promise.all([kerja(), kerja(), kerja(), kerja()]);
  const info = { lat, lon, km, n: L.length, gagal: fail, t: new Date().toISOString() };
  try { localStorage.setItem('fh_luring', JSON.stringify(info)); } catch (e) { }
  return info;
}
async function hapus() { try { await caches.delete('pa-tiles'); localStorage.removeItem('fh_luring'); } catch (e) { } }
const info = () => { try { return JSON.parse(localStorage.getItem('fh_luring')); } catch (e) { return null; } };
async function ukuran() { try { const e = await navigator.storage.estimate(); return { pakai: e.usage, kuota: e.quota }; } catch (x) { return null; } }
window.FHLuring = { perkiraan, simpan, hapus, info, ukuran };
})();
