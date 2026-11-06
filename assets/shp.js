/* Pantau Rimbak – PENULIS SHAPEFILE (ESRI .shp/.shx/.dbf/.prj/.cpg) untuk poligon, tanpa server
 * FHShp.zip([{ nama, fitur: GeoJSON Feature[] (Point / LineString / Polygon – satu jenis per lapisan), kolom: [[NAMA, 'C'|'N', lebar, desimal], ...] }], { 'BACA.txt': '...' }) → Promise<Blob .zip>
 * Koordinat WGS 1984 (EPSG:4326). Cincin luar searah jarum jam, lubang berlawanan (spesifikasi ESRI). Teks atribut UTF-8 (.cpg).
 */
(function () {
'use strict';
const PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const luas = r => { let s = 0; for (let i = 0, n = r.length; i < n - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };   // >0 = berlawanan jarum jam
const tutup = r => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] ? r : r.concat([a]); };
function cincin(g) {   // GeoJSON Polygon/MultiPolygon → daftar cincin terorientasi ESRI
  const P = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [], out = [];
  P.forEach(poly => poly.forEach((r, i) => { r = tutup(r); const ccw = luas(r) > 0; out.push((i === 0) === ccw ? r.slice().reverse() : r); }));
  return out;
}
function shp(F) {   // jenis berkas mengikuti fitur pertama: Point (1), PolyLine (3) atau Polygon (5)
  const g0 = F.length ? F[0].geometry.type : 'Polygon', TIPE = /Point/.test(g0) ? 1 : /LineString/.test(g0) ? 3 : 5;
  const rec = F.map(f => { const g = f.geometry;
    if (TIPE === 1) { const [x, y] = g.type === 'Point' ? g.coordinates : g.coordinates[0]; return { pt: [x, y], bb: [x, y, x, y], len: 20 }; }
    const R = TIPE === 3 ? (g.type === 'LineString' ? [g.coordinates] : g.coordinates) : cincin(g), np = R.reduce((a, r) => a + r.length, 0); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    R.forEach(r => r.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; })); return { R, np, bb: [x0, y0, x1, y1], len: 44 + 4 * R.length + 16 * np }; });
  const tot = 100 + rec.reduce((a, r) => a + 8 + r.len, 0), B = new DataView(new ArrayBuffer(tot)), S = new DataView(new ArrayBuffer(100 + 8 * rec.length));
  const bb = rec.reduce((a, r) => [Math.min(a[0], r.bb[0]), Math.min(a[1], r.bb[1]), Math.max(a[2], r.bb[2]), Math.max(a[3], r.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  [[B, tot], [S, 100 + 8 * rec.length]].forEach(([v, L]) => { v.setInt32(0, 9994); v.setInt32(24, L / 2); v.setInt32(28, 1000, true); v.setInt32(32, TIPE, true); bb.forEach((x, i) => v.setFloat64(36 + 8 * i, isFinite(x) ? x : 0, true)); });
  let o = 100; rec.forEach((r, i) => { S.setInt32(100 + 8 * i, o / 2); S.setInt32(104 + 8 * i, r.len / 2);
    B.setInt32(o, i + 1); B.setInt32(o + 4, r.len / 2); o += 8; B.setInt32(o, TIPE, true);
    if (TIPE === 1) { B.setFloat64(o + 4, r.pt[0], true); B.setFloat64(o + 12, r.pt[1], true); o += r.len; return; }
    r.bb.forEach((x, j) => B.setFloat64(o + 4 + 8 * j, x, true)); B.setInt32(o + 36, r.R.length, true); B.setInt32(o + 40, r.np, true);
    let k = 0, p = o + 44; r.R.forEach(c => { B.setInt32(p, k, true); p += 4; k += c.length; }); r.R.forEach(c => c.forEach(([x, y]) => { B.setFloat64(p, x, true); B.setFloat64(p + 8, y, true); p += 16; })); o += r.len; });
  return [B.buffer, S.buffer];
}
function dbf(F, K) {
  const enc = new TextEncoder(), nf = K.length, hl = 32 + 32 * nf + 1, rl = 1 + K.reduce((a, k) => a + k[2], 0), buf = new Uint8Array(hl + rl * F.length + 1), v = new DataView(buf.buffer), d = new Date();
  v.setUint8(0, 3); v.setUint8(1, d.getFullYear() - 1900); v.setUint8(2, d.getMonth() + 1); v.setUint8(3, d.getDate()); v.setUint32(4, F.length, true); v.setUint16(8, hl, true); v.setUint16(10, rl, true);
  K.forEach(([n, t, w, dc], i) => { const b = 32 + 32 * i; enc.encode(n.slice(0, 10)).forEach((c, j) => buf[b + j] = c); buf[b + 11] = t.charCodeAt(0); buf[b + 16] = w; buf[b + 17] = dc || 0; });
  buf[hl - 1] = 0x0D;
  F.forEach((f, r) => { let p = hl + r * rl; buf[p++] = 0x20;
    K.forEach(([n, t, w, dc]) => { const x = f.properties[n]; let s;
      if (t === 'N') { s = x == null || x === '' || !isFinite(+x) ? '' : (+x).toFixed(dc || 0); s = s.length > w ? s.slice(0, w) : s.padStart(w, ' '); const e = enc.encode(s); buf.set(e, p); }
      else { let e = enc.encode(String(x ?? '')); if (e.length > w) { let q = String(x); while (enc.encode(q).length > w) q = q.slice(0, -1); e = enc.encode(q); } buf.fill(0x20, p, p + w); buf.set(e, p); }
      p += w; }); });
  buf[buf.length - 1] = 0x1A; return buf;
}
async function zip(L, extra) {
  const A = window.FHAlat; if (!window.JSZip) await A.lib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const z = new JSZip();
  L.forEach(l => { const F = l.fitur.filter(f => f.geometry && /Polygon|LineString|Point/.test(f.geometry.type)); const [a, b] = shp(F);
    z.file(l.nama + '.shp', a); z.file(l.nama + '.shx', b); z.file(l.nama + '.dbf', dbf(F, l.kolom)); z.file(l.nama + '.prj', PRJ); z.file(l.nama + '.cpg', 'UTF-8'); });
  Object.entries(extra || {}).forEach(([n, t]) => z.file(n, t));
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
window.FHShp = { zip, shp, dbf, cincin };
})();
