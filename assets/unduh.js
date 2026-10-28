/* Unduh data terpilih – Fire Hotspot PRCF
 * Pengguna memilih: jenis data, wilayah, tahun, format → satu file.
 * File siap pakai dari server dipakai bila cocok (semua tahun, radius 25 km); selain itu file disusun
 * langsung di browser dari basis data yang sama (data/web/TAHUN.json, data/kejadian.json, dll.).
 * SHP ditulis sendiri (SHP+SHX+DBF+PRJ+CPG, WGS 1984, UTF-8) lalu dikemas ZIP (JSZip).
 * Pemakaian: FHUnduh.mount(el, { site: () => SITE, si: () => SI, status: () => STATUS })
 */
(function () {
'use strict';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const xesc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const N = v => Number(v).toLocaleString('id-ID');
const J = {}; const getJ = u => J[u] || (J[u] = fetch(u + '?' + Date.now()).then(r => { if (!r.ok) throw new Error('Gagal memuat ' + u); return r.json(); }).catch(e => { delete J[u]; throw e; }));
const loadJS = src => new Promise((ok, no) => { if (window.JSZip) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Pustaka ZIP gagal dimuat (perlu internet)')); document.head.appendChild(s); });
const zoneName = (c, kab, desa) => c < 0 ? 'Hutan Desa' : c === 0 ? 'Desa ' + desa : c <= 5 ? 'Radius 0-5 km' : c <= 25 ? 'Radius 5-25 km' : kab === 'Kapuas Hulu' ? 'Kapuas Hulu (> 25 km)' : 'Luar Kapuas Hulu';
const famOf = s => s.startsWith('MODIS') ? 'MODIS' : s.includes('S-NPP') ? 'VIIRS S-NPP' : s.includes('NOAA-20') ? 'VIIRS NOAA-20' : 'VIIRS NOAA-21';
const confTxt = r => r.sen.startsWith('MODIS') ? String(r.conf) : ({ l: 'rendah', n: 'nominal', h: 'tinggi' }[r.conf] || r.conf);

/* ---------- definisi data ---------- */
const WIL = [['0', 'Hutan Desa & desa saja'], ['5', 'Sampai 5 km dari batas desa'], ['25', 'Sampai 25 km dari batas desa']];
const DATA = {
  titik: { nm: 'Titik panas (deteksi satelit NASA FIRMS)', fmt: ['shp', 'kml', 'geojson', 'csv'], wil: true, tahun: 'semua', geom: 'Point',
    ket: 'Satu titik per deteksi satelit (VIIRS 375 m & MODIS 1 km): waktu UTC & WIB, sensor, keyakinan, FRP, suhu kecerahan, zona dan jarak ke batas desa, status data (arsip final/NRT), ID kejadian.' },
  kejadian: { nm: 'Kejadian api (titik pusat)', fmt: ['shp', 'kml', 'geojson', 'csv'], wil: true, tahun: 'semua', geom: 'Point',
    ket: 'Satu titik per kejadian api (gabungan deteksi berjarak ≤ 1 km dan ≤ 2 hari): mulai, selesai, jumlah deteksi, FRP maksimum, zona, jarak ke batas desa.' },
  kejadian_poligon: { nm: 'Kejadian api (poligon cakupan piksel)', fmt: ['shp'], wil: false, tahun: 'tetap', tetap: 'Semua tahun · radius 25 km', geom: 'Polygon',
    ket: 'Poligon gabungan piksel satelit setiap kejadian (UTM 49N). Ini BUKAN luas terbakar. Tersedia sebagai satu file semua tahun, radius 25 km.' },
  bekas: { nm: 'Bekas terbakar (Sentinel-2, poligon)', fmt: ['shp', 'kml', 'geojson'], wil: false, tahun: 'bekas', geom: 'Polygon',
    ket: 'Indikasi bekas terbakar dari citra Sentinel-2 (dNBR, sejak 2023) per musim kebakaran: luas (ha), tingkat keparahan, periode api. Perlu verifikasi lapangan.' },
  hutan: { nm: 'Peringatan perubahan tutupan hutan (Sentinel-2)', fmt: ['shp', 'kml', 'geojson'], wil: false, tahun: 'tetap', tetap: '90 hari terakhir', geom: 'Polygon',
    ket: 'Petak hutan yang tajuknya berubah dalam 90 hari terakhir dibanding periode sama tahun lalu (Sentinel-2, di hutan Hansen 2025). Indikasi, perlu verifikasi lapangan.' },
  batas: { nm: 'Batas wilayah (Hutan Desa, desa, radius 5 & 25 km)', fmt: ['shp', 'kml', 'geojson'], wil: false, tahun: 'tetap', tetap: 'Batas resmi terkini', geom: 'Polygon',
    ket: 'Poligon Hutan Desa (sesuai SK), batas desa, dan cincin radius 5 km & 25 km dari batas desa yang dipakai untuk menghitung zona.' },
  kh: { nm: 'Titik panas seluruh Kapuas Hulu', fmt: ['shp', 'kml', 'geojson', 'csv'], wil: false, tahun: 'tahun', geom: 'Point',
    ket: 'Semua deteksi di Kabupaten Kapuas Hulu untuk tahun terpilih, dengan atribut lengkap.' },
  analisis: { nm: 'Analisis lahan, hutan & karbon (data Hansen/UMD & Harris dkk.)', fmt: ['csv', 'shp', 'geojson', 'kml'], wil: false, tahun: 'tetap', tetap: 'Data tahunan resmi: lahan 2000–2020, hutan & karbon 2001–2025, titik panas 2016–2025', geom: 'Polygon',
    ket: 'CSV: tabel lengkap per indikator (tutupan lahan per kelas & tahun, kehilangan hutan & emisi per tahun, serapan, fluks bersih, stok karbon, titik panas per tahun & sensor, wilayah) untuk Hutan Desa dan wilayah desa. SHP/GeoJSON/KML: poligon Hutan Desa & desa dengan atribut ringkasan. Sumber: GLAD GLCLUC, Hansen GFC v1.13, Harris/Gibbs (versi GFW 20260327), NASA FIRMS.' },
  arsip: { nm: 'Arsip asli NASA FIRMS (tanpa olahan)', fmt: ['csv'], wil: false, tahun: 'tahun', geom: null,
    ket: 'File CSV asli NASA FIRMS per tahun untuk kotak Kapuas Hulu, persis seperti diunduh (sidik SHA-256 tercatat di jejak audit).' },
};
const FMT = { shp: 'SHP (zip)', kml: 'KML (Google Earth)', geojson: 'GeoJSON', csv: 'CSV (Excel)' };

/* ---------- penyusun fitur ---------- */
async function rowsYears(years) { const out = []; for (const y of years) { const j = await getJ(`data/web/${y}.json`); const K = j.kolom; for (const a of j.baris) { const o = {}; K.forEach((k, i) => o[k] = a[i]); out.push(o); } } return out; }
function titikFeature(r, ctx) {
  const c = r.ls && r.ls.length > ctx.si ? r.ls[ctx.si] : null;
  const p = { waktu_wib: r.wib, tgl_utc: r.d, jam_utc: r.t, lat: r.lat, lon: r.lon, sensor: r.sen, satelit: r.sat, keyakinan: confTxt(r), frp_mw: r.frp, suhu_k: r.bt, siang_mlm: r.dn === 'D' ? 'siang' : 'malam',
    zona: c === null ? '' : zoneName(c, r.kab, ctx.desa), jarak_km: c === null ? null : Math.round(Math.max(0, c) * 100) / 100, status: r.st === 'SP' ? 'SP (arsip final)' : 'NRT (sementara)', id_kejadi: r.ev || '', luas_pk_ha: r.ha, kabupaten: r.kab || '', uid: r.uid };
  if (ctx.nl) Object.assign(p, { petak: r.pt || '', kawasan: r.kw || '', tutupan: r.tl || '', gambut: r.gb || '' });
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: p };
}
async function build(sel, ctx) {
  const D = DATA[sel.data], yr = sel.tahun, rg = yr === 'rentang';
  const years = rg ? ctx.years.filter(y => y >= +sel.dari.slice(0, 4) - (sel.dari.slice(5) === '01-01' ? 1 : 0) && y <= +sel.sampai.slice(0, 4)) : yr === 'semua' ? ctx.years : [yr];
  const okTgl = d => !rg || (d >= sel.dari && d <= sel.sampai);   // tanggal WIB
  if (sel.data === 'titik') {
    const rows = await rowsYears(years); const lim = +sel.wil;
    return rows.filter(r => r.ls && r.ls.length > ctx.si && r.ls[ctx.si] <= lim && okTgl(String(r.wib).slice(0, 10))).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t)).map(r => titikFeature(r, ctx));
  }
  if (sel.data === 'kh') { const rows = await rowsYears(years); return rows.filter(r => r.kab === 'Kapuas Hulu' && okTgl(String(r.wib).slice(0, 10))).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t)).map(r => titikFeature(r, ctx)); }
  if (sel.data === 'kejadian') {
    const k = await getJ('data/kejadian.json'), K = k.kolom, si = k.lokasi.indexOf(ctx.id), lim = +sel.wil, out = [];
    for (const a of k.baris) { const o = {}; K.forEach((n, i) => o[n] = a[i]); const c = o.ls && o.ls[si]; if (c === undefined || c === null || c > lim) continue; if (rg ? !okTgl(o.mulai_wib.slice(0, 10)) : yr !== 'semua' && o.mulai_wib.slice(0, 4) !== String(yr)) continue;
      const p = { id_kejadi: o.id_kejadian, mulai_wib: o.mulai_wib, selesai_wb: o.selesai_wib, n_deteksi: o.jumlah_deteksi, sensor: o.sensor, status: o.status_data, frp_maks: o.frp_maks_mw, luas_pk_ha: o.luas_cakupan_piksel_ha,
        zona: zoneName(c, c > 25 ? 'Kapuas Hulu' : '', ctx.desa), jarak_km: Math.round(Math.max(0, c) * 100) / 100, lat: o.lat, lon: o.lon };
      if (ctx.nl) Object.assign(p, { petak: o.petak || '', kawasan: o.fungsi_kawasan || '', tutupan: o.tutupan_2026 || '', gambut: o.gambut || '' });
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [o.lon, o.lat] }, properties: p }); }
    return out.sort((a, b) => a.properties.mulai_wib.localeCompare(b.properties.mulai_wib));
  }
  if (sel.data === 'analisis') {
    const A = await Promise.all(['hd', 'desa'].map(k => getJ(`data/analisis/${ctx.id}_${k}.json`)));
    return A.map((a, i) => ({ type: 'Feature', geometry: a.geometri, properties: { area: i ? 'Wilayah desa' : 'Hutan Desa', nama: a.nama, luas_ha: a.luas_ha, hutan00_ha: a.hutan.hutan_2000_ha, hilang_ha: a.hutan.kehilangan_total_ha, hilang_pct: a.hutan.persen_hilang,
      emisi_th: a.karbon.emisi_bruto_per_tahun_tCO2e, serap_th: a.karbon.serapan_bruto_per_tahun_tCO2, bersih_th: a.karbon.fluks_bersih_per_tahun_tCO2e, stok_tc: a.karbon.stok_karbon_total_2000_tC, agc_tc: a.karbon.stok_karbon_atas_tanah_2000_tC,
      pohon20_ha: Math.round(((a.tutupan_lahan_ha['2020'].pohon || 0) + (a.tutupan_lahan_ha['2020'].basah_pohon || 0)) * 10) / 10, tpanas1625: a.titik_panas.total, dihitung: a.dibuat_utc.slice(0, 10) }, _src: a }));
  }
  if (sel.data === 'bekas') {
    const g = await getJ('data/bekas_terbakar/bekas_terbakar.geojson');
    return g.features.filter(f => f.properties.lokasi === ctx.id && (yr === 'semua' || f.properties.awal_api.slice(0, 4) === String(yr))).map(f => ({ type: 'Feature', geometry: f.geometry,
      properties: { musim: f.properties.musim, hutan_desa: f.properties.hd, desa: f.properties.desa, awal_api: f.properties.awal_api, akhir_api: f.properties.akhir_api, keparahan: f.properties.keparahan, luas_ha: f.properties.luas_ha, sumber: 'Sentinel-2 L2A (ESA Copernicus)', catatan: 'indikasi, perlu verifikasi lapangan' } }));
  }
  if (sel.data === 'hutan') {
    const g = await getJ('data/hutan/peringatan.geojson');
    return g.features.filter(f => f.properties.lokasi === ctx.id).map(f => ({ type: 'Feature', geometry: f.geometry,
      properties: { hutan_desa: f.properties.hd, desa: f.properties.desa, luas_ha: f.properties.luas_ha, di_hd: f.properties.di_hutan_desa ? 'ya' : 'tidak', periode: f.properties.periode, dibanding: f.properties.dibanding, sumber: 'Sentinel-2 L2A; hutan acuan Hansen GFC v1.13', catatan: 'indikasi, perlu verifikasi lapangan' } }));
  }
  if (sel.data === 'batas') {
    const S = ctx.site, out = [], add = (fc, jenis, ket) => (fc && fc.features || []).forEach(f => out.push({ type: 'Feature', geometry: f.geometry, properties: { jenis, nama: jenis === 'Hutan Desa' ? S.hd_nama : 'Desa ' + S.desa_nama, keterangan: ket } }));
    add(S.hd, 'Hutan Desa', (S.sk || '') + (S.sk_tgl ? ', ' + S.sk_tgl : '')); add(S.desa, 'Desa', 'batas desa'); add(S.buf5, 'Radius 5 km', 'dari batas desa'); add(S.buf25, 'Radius 25 km', 'dari batas desa');
    return out;
  }
  return [];
}

/* ---------- penulis format ---------- */
function analisisCSV(L) {   // format panjang: satu baris per area × kategori × indikator × tahun
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, R = [['area', 'kategori', 'indikator', 'tahun', 'nilai', 'satuan', 'sumber']];
  for (const a of L) { const S = a.sumber, nm = a.nama, kn = k => (a.kelas.find(x => x.kode === k) || {}).nama || k;
    R.push([nm, 'Area', 'Luas (piksel 30 m di dalam batas)', '', a.luas_ha, 'ha', 'perhitungan']);
    for (const y of a.tahun_tutupan) for (const k of Object.keys(a.tutupan_lahan_ha[y])) if (a.tutupan_lahan_ha[y][k]) R.push([nm, 'Tutupan lahan', kn(k), y, a.tutupan_lahan_ha[y][k], 'ha', S.tutupan_lahan]);
    for (const [k, v] of Object.entries(a.perubahan_2000_2020_ha || {})) { const [x, y] = k.split('>'); R.push([nm, 'Perubahan lahan 2000-2020', `${kn(x)} -> ${kn(y)}`, '2000-2020', v, 'ha', S.tutupan_lahan]); }
    R.push([nm, 'Hutan', 'Hutan tahun 2000 (tajuk >= 30%)', '2000', a.hutan.hutan_2000_ha, 'ha', S.kehilangan_pohon]);
    for (const [y, v] of Object.entries(a.hutan.kehilangan_per_tahun_ha)) R.push([nm, 'Hutan', 'Kehilangan tutupan pohon', y, v, 'ha', S.kehilangan_pohon]);
    R.push([nm, 'Hutan', 'Kehilangan tutupan pohon total', '2001-2025', a.hutan.kehilangan_total_ha, 'ha', S.kehilangan_pohon]);
    for (const [y, v] of Object.entries(a.karbon.emisi_per_tahun_kehilangan_tCO2e)) R.push([nm, 'Karbon', 'Emisi bruto (menurut tahun kehilangan)', y, v, 'tCO2e', S.fluks_karbon]);
    [['Emisi bruto total', 'emisi_bruto_total_tCO2e', 'tCO2e'], ['Serapan bruto total', 'serapan_bruto_total_tCO2', 'tCO2'], ['Fluks bersih total', 'fluks_bersih_total_tCO2e', 'tCO2e'], ['Emisi bruto per tahun', 'emisi_bruto_per_tahun_tCO2e', 'tCO2e/tahun'], ['Serapan bruto per tahun', 'serapan_bruto_per_tahun_tCO2', 'tCO2/tahun'], ['Fluks bersih per tahun', 'fluks_bersih_per_tahun_tCO2e', 'tCO2e/tahun']].forEach(([n, k, u]) => R.push([nm, 'Karbon', n, '2001-2025', a.karbon[k], u, S.fluks_karbon]));
    [['Stok karbon atas tanah', 'stok_karbon_atas_tanah_2000_tC', 'tC'], ['Stok karbon total (semua pool)', 'stok_karbon_total_2000_tC', 'tC'], ['Rerata karbon total hutan', 'rerata_karbon_total_hutan_2000_tC_ha', 'tC/ha'], ['Rerata karbon atas tanah hutan', 'rerata_karbon_atas_tanah_hutan_2000_tC_ha', 'tC/ha']].forEach(([n, k, u]) => R.push([nm, 'Karbon', n, '2000', a.karbon[k], u, S.stok_karbon]));
    for (const [y, o] of Object.entries(a.titik_panas.per_tahun)) for (const [sen, v] of Object.entries(o)) R.push([nm, 'Titik panas', 'Deteksi ' + sen, y, v, 'titik', S.titik_panas]);
    for (const w of a.wilayah || []) R.push([nm, 'Wilayah', `${w.desa}, Kec. ${w.kec}, ${w.kab}, ${w.prov}`, '', w.persen_desa_tercakup, '% desa tercakup', 'BPS/BIG (COD-AB 2020), Kepmendagri 2025']);
  }
  return R.map(r => r.map(q).join(',')).join('\n');
}
function toCSV(F) {
  if (!F.length) return '';
  const cols = Object.keys(F[0].properties); const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cols.join(',')].concat(F.map(f => cols.map(c => q(f.properties[c])).join(','))).join('\n');
}
function toKML(F, name) {
  const pm = f => { const p = f.properties, g = f.geometry;
    const ed = '<ExtendedData>' + Object.entries(p).map(([k, v]) => `<Data name="${xesc(k)}"><value>${xesc(v)}</value></Data>`).join('') + '</ExtendedData>';
    const ring = r => `<LinearRing><coordinates>${r.map(c => c[0] + ',' + c[1]).join(' ')}</coordinates></LinearRing>`;
    const poly = P => `<Polygon><outerBoundaryIs>${ring(P[0])}</outerBoundaryIs>${P.slice(1).map(h => `<innerBoundaryIs>${ring(h)}</innerBoundaryIs>`).join('')}</Polygon>`;
    const geom = g.type === 'Point' ? `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>` : g.type === 'Polygon' ? poly(g.coordinates) : `<MultiGeometry>${g.coordinates.map(poly).join('')}</MultiGeometry>`;
    const nm = p.waktu_wib || p.id_kejadi || p.musim || p.jenis || p.hutan_desa || '';
    return `<Placemark><name>${xesc(nm)}</name><styleUrl>#${g.type === 'Point' ? 'p' : 'g'}</styleUrl>${ed}${geom}</Placemark>`; };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xesc(name)}</name>` +
    '<Style id="p"><IconStyle><color>ff1e5ae4</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>' +
    '<Style id="g"><LineStyle><color>ff2e57e4</color><width>2</width></LineStyle><PolyStyle><color>552e57e4</color></PolyStyle></Style>' + F.map(pm).join('') + '</Document></kml>';
}
/* SHP + SHX + DBF (UTF-8) */
function shpParts(F, type) {
  const enc = new TextEncoder();
  const polys = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const area2 = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s; };
  const orient = (r, cw) => { const a = area2(r); return (cw ? a > 0 : a < 0) ? r.slice().reverse() : r; };  // SHP: luar searah jarum jam, lubang berlawanan
  const recs = F.map(f => {
    if (type === 1) { const [x, y] = f.geometry.coordinates; const b = new ArrayBuffer(20), v = new DataView(b); v.setInt32(0, 1, true); v.setFloat64(4, x, true); v.setFloat64(12, y, true); return { b, box: [x, y, x, y] }; }
    const rings = []; for (const P of polys(f)) P.forEach((r, i) => rings.push(orient(r, i === 0)));
    const np = rings.reduce((s, r) => s + r.length, 0), len = 44 + 4 * rings.length + 16 * np, b = new ArrayBuffer(len), v = new DataView(b);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; rings.forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
    v.setInt32(0, 5, true); [x0, y0, x1, y1].forEach((n, i) => v.setFloat64(4 + 8 * i, n, true)); v.setInt32(36, rings.length, true); v.setInt32(40, np, true);
    let o = 44, k = 0; rings.forEach(r => { v.setInt32(o, k, true); o += 4; k += r.length; }); rings.forEach(r => r.forEach(([x, y]) => { v.setFloat64(o, x, true); v.setFloat64(o + 8, y, true); o += 16; }));
    return { b, box: [x0, y0, x1, y1] };
  });
  const box = recs.reduce((B, r) => [Math.min(B[0], r.box[0]), Math.min(B[1], r.box[1]), Math.max(B[2], r.box[2]), Math.max(B[3], r.box[3])], [1e9, 1e9, -1e9, -1e9]);
  const head = (lenBytes) => { const b = new ArrayBuffer(100), v = new DataView(b); v.setInt32(0, 9994, false); v.setInt32(24, lenBytes / 2, false); v.setInt32(28, 1000, true); v.setInt32(32, type, true); box.forEach((n, i) => v.setFloat64(36 + 8 * i, recs.length ? n : 0, true)); return new Uint8Array(b); };
  const shpLen = 100 + recs.reduce((s, r) => s + 8 + r.b.byteLength, 0), shp = new Uint8Array(shpLen), shx = new Uint8Array(100 + 8 * recs.length);
  shp.set(head(shpLen)); shx.set(head(shx.length));
  let off = 100; const sv = new DataView(shp.buffer), xv = new DataView(shx.buffer);
  recs.forEach((r, i) => { sv.setInt32(off, i + 1, false); sv.setInt32(off + 4, r.b.byteLength / 2, false); shp.set(new Uint8Array(r.b), off + 8); xv.setInt32(100 + 8 * i, off / 2, false); xv.setInt32(104 + 8 * i, r.b.byteLength / 2, false); off += 8 + r.b.byteLength; });
  // DBF
  const cols = F.length ? Object.keys(F[0].properties) : ['id'];
  const fields = cols.map(c => { const vals = F.map(f => f.properties[c]); const num = vals.every(v => v === null || v === undefined || v === '' || typeof v === 'number');
    if (num) { const dec = Math.min(6, Math.max(0, ...vals.filter(v => typeof v === 'number').map(v => (String(v).split('.')[1] || '').length))); const w = Math.min(19, Math.max(4, ...vals.filter(v => typeof v === 'number').map(v => v.toFixed(dec).length)) + 1); return { c, t: 'N', w, dec }; }
    const w = Math.min(254, Math.max(1, ...vals.map(v => enc.encode(String(v ?? '')).length))); return { c, t: 'C', w, dec: 0 }; });
  const recLen = 1 + fields.reduce((s, f) => s + f.w, 0), hLen = 32 + 32 * fields.length + 1, dbf = new Uint8Array(hLen + recLen * F.length + 1), dv = new DataView(dbf.buffer), now = new Date();
  dbf[0] = 3; dbf[1] = now.getFullYear() - 1900; dbf[2] = now.getMonth() + 1; dbf[3] = now.getDate(); dv.setInt32(4, F.length, true); dv.setInt16(8, hLen, true); dv.setInt16(10, recLen, true); dbf[29] = 0;
  fields.forEach((f, i) => { const o = 32 + 32 * i; dbf.set(enc.encode(f.c.slice(0, 10)), o); dbf[o + 11] = f.t.charCodeAt(0); dbf[o + 16] = f.w; dbf[o + 17] = f.dec; });
  dbf[hLen - 1] = 0x0d;
  F.forEach((ft, i) => { let o = hLen + recLen * i; dbf[o++] = 0x20;
    for (const f of fields) { const v = ft.properties[f.c]; let bytes;
      if (f.t === 'N') { const s = v === null || v === undefined || v === '' ? '' : Number(v).toFixed(f.dec); bytes = enc.encode(s.padStart(f.w, ' ').slice(-f.w)); }
      else { let b = enc.encode(String(v ?? '')); if (b.length > f.w) { let n = f.w; while (n > 0 && (b[n] & 0xc0) === 0x80) n--; b = b.slice(0, n); } bytes = new Uint8Array(f.w).fill(0x20); bytes.set(b); }
      dbf.set(bytes, o); o += f.w; } });
  dbf[dbf.length - 1] = 0x1a;
  return { shp, shx, dbf };
}
async function toSHPzip(F, base, type) {
  await loadJS(JSZIP); const z = new JSZip(), p = shpParts(F, type);
  z.file(base + '.shp', p.shp); z.file(base + '.shx', p.shx); z.file(base + '.dbf', p.dbf); z.file(base + '.prj', PRJ); z.file(base + '.cpg', 'UTF-8');
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
function save(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 3000); }

/* ---------- antarmuka ---------- */
function css() {
  if (document.getElementById('dlx-css')) return; const s = document.createElement('style'); s.id = 'dlx-css';
  s.textContent = `.dlx{display:grid;gap:14px}.dlx-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
  .dlx label{display:grid;gap:6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#667)}
  .dlx select{appearance:none;-webkit-appearance:none;width:100%;font:600 14.5px var(--f,inherit);color:var(--fg,#111);background:var(--surface-2,#f6f8f6) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23889' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;border:1.5px solid var(--line,#dde);border-radius:12px;padding:11px 36px 11px 12px;text-transform:none;letter-spacing:0}
  .dlx select:focus{outline:none;border-color:var(--brand-2,#14563F);box-shadow:0 0 0 3px rgba(30,107,79,.18)}.dlx select:disabled{opacity:.55}
  .dlx-info{background:var(--surface-2,#f6f8f6);border:1px solid var(--line,#dde);border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;color:var(--fg,#111)}
  .dlx-info b{display:block;margin-bottom:2px}.dlx-info small{display:block;color:var(--muted,#667);margin-top:6px;font-size:12px;word-break:break-all}
  .dlx-go{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.dlx-go button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:12px;padding:12px 18px;font:700 14.5px var(--f,inherit);background:linear-gradient(150deg,#1E7A58,#0B3B2C);color:#fff;cursor:pointer}
  .dlx-go button:disabled{opacity:.6;cursor:wait}.dlx-go span{font-size:12.5px;color:var(--muted,#667)}.dlx-go span.err{color:#C0392B}
  .dlx-more{font-size:12.5px;color:var(--muted,#667)}.dlx-more a{color:inherit}`;
  document.head.appendChild(s);
}
function mount(el, opt) {
  css(); const thisYear = new Date(Date.now() + 7 * 36e5).getUTCFullYear(); const hariIni = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10); const st = { data: 'titik', wil: '25', tahun: 'semua', fmt: 'shp', dari: hariIni.slice(0, 8) + '01', sampai: hariIni };
  el.innerHTML = `<div class="dlx"><div class="dlx-g">
    <label>Jenis data<select data-k="data">${Object.entries(DATA).map(([k, d]) => `<option value="${k}">${esc(d.nm)}</option>`).join('')}</select></label>
    <label>Wilayah<select data-k="wil"></select></label>
    <label>Tahun / periode<select data-k="tahun"></select></label>
    <label>Format file<select data-k="fmt"></select></label></div>
    <div class="dlx-g" id="dlxR" hidden><label>Dari tanggal<input type="date" data-r="dari"></label><label>Sampai tanggal<input type="date" data-r="sampai"></label></div>
    <div class="dlx-info" id="dlxInfo"></div>
    <div class="dlx-go"><button type="button" id="dlxBtn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 19.5h16"/></svg>Unduh</button><span id="dlxMsg" role="status" aria-live="polite"></span></div>
    <div class="dlx-more">Koordinat WGS 1984 (EPSG:4326), kecuali poligon cakupan piksel (UTM 49N). Jejak audit sumber: <a href="https://github.com/erikprcfi/hotspot-fire-prcf/tree/main/data/provenance" target="_blank" rel="noopener">data/provenance ↗</a></div></div>`;
  const $ = s => el.querySelector(s), sel = k => el.querySelector(`select[data-k="${k}"]`);
  const ctx = () => { const S = opt.site(), STATUS = opt.status() || {}; const ys = (STATUS.tahun_arsip || []).map(Number).filter(Boolean); const years = ys.length ? ys : Array.from({ length: thisYear - 2000 }, (_, i) => 2001 + i);
    return { site: S, id: S.id, si: opt.si(), desa: S.desa_nama, nl: S.id === 'nangalauk', years, ekspor: STATUS.ekspor || [] }; };
  const fname = (c) => { const D = DATA[st.data], w = { 0: 'desa', 5: 'radius5km', 25: 'radius25km' }[st.wil], t = st.tahun === 'semua' ? 'semua_tahun' : st.tahun === 'rentang' ? `${st.dari}_sd_${st.sampai}` : st.tahun, ext = st.fmt === 'shp' ? 'zip' : st.fmt;
    const b = { titik: `titik_panas_${c.id}_${w}_${t}`, kejadian: `kejadian_api_${c.id}_${w}_${t}`, bekas: `bekas_terbakar_${c.id}_${st.tahun === 'semua' ? 'semua_musim' : 'musim_' + st.tahun}`, hutan: `peringatan_hutan_${c.id}_90hari`, batas: `batas_wilayah_${c.id}`, kh: `titik_panas_kapuashulu_${t}`, arsip: `firms_arsip_${t}`, analisis: `analisis_lahan_karbon_${c.id}` }[st.data];
    return { base: b, name: `${b}${st.fmt === 'shp' ? '_shp' : ''}.${ext}` }; };
  const prebuilt = c => { // file siap pakai di server bila cocok persis
    if (st.data === 'kejadian_poligon') return `kejadian_api_${c.id}_radius25km_cakupan_piksel_UTM49N_shp.zip`;
    if (st.data === 'arsip' || st.data === 'analisis') return null;
    if (st.data === 'kh' && st.fmt === 'shp') { const f = `titik_panas_kapuashulu_${st.tahun}_shp.zip`; return c.ekspor.includes(f) ? f : null; }
    if (st.tahun !== 'semua' || st.wil !== '25') return null;
    const f = st.data === 'titik' ? `titik_panas_${c.id}_radius25km_semua_tahun${st.fmt === 'shp' ? '_shp.zip' : '.' + st.fmt}` : st.data === 'kejadian' ? `kejadian_api_${c.id}_radius25km${st.fmt === 'shp' ? '_titik_shp.zip' : '.' + st.fmt}` : null;
    return f && c.ekspor.includes(f) ? f : null; };
  function refresh() {
    const c = ctx(), D = DATA[st.data];
    const w = sel('wil'); w.innerHTML = D.wil ? WIL.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('') : `<option value="">${st.data === 'kh' || st.data === 'arsip' ? 'Seluruh Kapuas Hulu' : esc(c.site.hd_nama)}</option>`; w.disabled = !D.wil; if (D.wil) w.value = st.wil;
    const t = sel('tahun'); let yo = [];
    if (D.tahun === 'semua') yo = [['semua', `Semua tahun (${c.years[0]}–${c.years[c.years.length - 1]})`], ...c.years.slice().reverse().map(y => [String(y), String(y)])];
    else if (D.tahun === 'tahun') yo = c.years.slice().reverse().map(y => [String(y), String(y)]);
    else if (D.tahun === 'bekas') yo = [['semua', 'Semua musim (sejak 2023)'], ...c.years.filter(y => y >= 2023).reverse().map(y => [String(y), 'Musim ' + y])];
    else yo = [['semua', D.tetap]];
    if (['titik', 'kejadian', 'kh'].includes(st.data)) yo.push(['rentang', st.tahun === 'rentang' ? `${st.dari} s.d. ${st.sampai}` : 'Pilih tanggal…']);
    t.innerHTML = yo.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join(''); t.disabled = yo.length < 2;
    if (!yo.some(o => o[0] === st.tahun)) st.tahun = yo[0][0]; t.value = st.tahun;
    const R = $('#dlxR'), mn = c.years[0] + '-01-01'; R.hidden = st.tahun !== 'rentang'; R.querySelectorAll('input').forEach(i => { i.min = mn; i.max = hariIni; i.value = st[i.dataset.r]; });
    const f = sel('fmt'); f.innerHTML = D.fmt.map(k => `<option value="${k}">${FMT[k]}</option>`).join(''); if (!D.fmt.includes(st.fmt)) st.fmt = D.fmt[0]; f.value = st.fmt; f.disabled = D.fmt.length < 2;
    const nm = fname(c).name, pre = prebuilt(c);
    $('#dlxInfo').innerHTML = `<b>${esc(D.nm)}</b>${esc(D.ket)}${st.data === 'titik' && st.tahun === String(thisYear) ? ' Tahun berjalan berisi data Near Real-Time; sebagian bulan menunggu arsip final NASA.' : ''}${(st.data === 'titik' || st.data === 'kejadian') && !c.nl ? ' Petak patroli, fungsi kawasan, tutupan lahan dan gambut hanya tersedia untuk Nanga Lauk.' : ''}<small>Nama file: ${esc(st.data === 'arsip' ? st.tahun + '.csv' : pre || nm)}</small>`;
    $('#dlxMsg').textContent = ''; $('#dlxMsg').className = '';
  }
  el.querySelectorAll('select').forEach(s => s.onchange = () => { st[s.dataset.k] = s.value; refresh(); });
  el.querySelectorAll('[data-r]').forEach(i => i.onchange = () => { if (!/^\d{4}-\d{2}-\d{2}$/.test(i.value)) return; st[i.dataset.r] = i.value; if (st.dari > st.sampai) [st.dari, st.sampai] = [st.sampai, st.dari]; refresh(); });
  $('#dlxBtn').onclick = async () => {
    const c = ctx(), btn = $('#dlxBtn'), msg = $('#dlxMsg'); msg.className = ''; btn.disabled = true;
    try {
      if (st.data === 'arsip') { const a = document.createElement('a'); a.href = `data/archive/${st.tahun}.csv`; a.download = `firms_arsip_kapuashulu_${st.tahun}.csv`; document.body.appendChild(a); a.click(); a.remove(); msg.textContent = 'Unduhan dimulai.'; return; }
      const pre = prebuilt(c); if (pre) { const a = document.createElement('a'); a.href = 'data/export/' + pre; a.download = pre; document.body.appendChild(a); a.click(); a.remove(); msg.textContent = 'Unduhan dimulai (file siap pakai dari server).'; return; }
      msg.textContent = 'Menyusun data…';
      const F = await build(st, c); const { base, name } = fname(c);
      if (!F.length) { msg.textContent = 'Tidak ada data untuk pilihan ini (0 fitur). Coba wilayah atau tahun lain.'; return; }
      let blob;
      if (st.fmt === 'csv' && st.data === 'analisis') blob = new Blob(['\ufeff' + analisisCSV(F.map(f => f._src))], { type: 'text/csv;charset=utf-8' });
      else if (st.fmt === 'csv') blob = new Blob([toCSV(F)], { type: 'text/csv;charset=utf-8' });
      else if (st.fmt === 'geojson') blob = new Blob([JSON.stringify({ type: 'FeatureCollection', name: base, crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }, features: F.map(({ _src, ...f }) => f) })], { type: 'application/geo+json' });
      else if (st.fmt === 'kml') blob = new Blob([toKML(F, base)], { type: 'application/vnd.google-earth.kml+xml' });
      else blob = await toSHPzip(F, base, DATA[st.data].geom === 'Point' ? 1 : 5);
      save(blob, name); msg.textContent = `Selesai: ${N(F.length)} fitur · ${name}`;
    } catch (e) { console.error(e); msg.className = 'err'; msg.textContent = 'Gagal: ' + e.message; }
    finally { btn.disabled = false; }
  };
  refresh();
  return { refresh };
}
window.FHUnduh = { mount, analisisCSV, _test: { build, shpParts, toKML, toCSV, analisisCSV } };
})();
