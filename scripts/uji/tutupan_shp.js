// Uji peta tutupan lahan tahunan (vektor, unduhan SHP) vs model tahunan KLHK (tabel alat) untuk 6 Hutan Desa × 2001–tahun citra.
// Pemakaian: node scripts/uji/tutupan_shp.js <ROOT> [folder_keluaran_shp]
const fs = require('fs'), R0 = process.argv[2], OUTD = process.argv[3];
global.window = global; global.document = { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}) };
global.fetch = async u => { const p = R0 + '/' + u.split('?')[0]; return fs.existsSync(p) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(p)) } : { ok: false }; };
window.FHAlat = { n1: (v, d) => (+v).toFixed(d), esc: s => String(s), wib: () => 'uji', EN: () => false };
require(R0 + '/assets/model_klhk.js'); require(R0 + '/assets/tutupan.js'); require(R0 + '/assets/shp.js');
(async () => {
  const geo = JSON.parse(fs.readFileSync(R0 + '/data/geo.json')), CI = await FHModelKLHK.citra(), hasil = { maks: 0, uji: 0, gagal: [] };
  for (const s of geo.sites) {
    const R = JSON.parse(fs.readFileSync(`${R0}/data/analisis/${s.id}_hd.json`)), M = FHModelKLHK.buat(R.emisi_frel, CI && CI.lokasi && CI.lokasi[s.id]);
    for (let Y = 2001; Y <= M.yMax; Y++) {
      const P = await FHTutupan.petaTahun(s, Y, 2020), k = M.kondisi(Y), v = {};
      P.fitur.forEach(f => v[f.properties.KODE_PL] = (v[f.properties.KODE_PL] || 0) + f.properties.LUAS_HA);
      const tot = Object.values(k).reduce((a, b) => a + b, 0), tv = Object.values(v).reduce((a, b) => a + b, 0), f_ = tv / tot;   // luas poligon vs piksel: skala total sama
      new Set([...Object.keys(k), ...Object.keys(v)]).forEach(c => { const kc = (k[c] || 0) * f_, d = Math.abs((v[c] || 0) - kc), tol = Math.max(0.5, 0.01 * kc); hasil.uji++; hasil.maks = Math.max(hasil.maks, d);
        if (d > tol) hasil.gagal.push(`${s.id} ${Y} kode ${c}: SHP ${(v[c] || 0).toFixed(3)} ha ≠ model ${kc.toFixed(3)} ha`); });
      // perubahan kelas (deforestasi+degradasi) sejak 2020 harus sama dengan model (selisih hanya garis tepi)
      { const ub = P.fitur.filter(f => f.properties.TH_UBAH && f.properties.TH_UBAH <= Y).reduce((a, f) => a + f.properties.LUAS_HA, 0); let mu = 0; for (let y = 2001; y <= Y; y++) M.aktivitas(y).ub.forEach(u => mu += u.ha);
        hasil.uji++; if (Math.abs(ub - mu) > Math.max(1.0, 0.08 * mu)) /* petak di tepi batas HD dipotong garis batas; tabel memakai piksel 30 m utuh */ hasil.gagal.push(`${s.id} ${Y}: perubahan kelas SHP ${ub.toFixed(3)} ≠ model ${mu.toFixed(3)} ha`); }
      if (OUTD && Y === 2023 || OUTD && Y === M.yMax) { const [a, b] = FHShp.shp(P.fitur); fs.mkdirSync(OUTD, { recursive: true }); const n = `${OUTD}/${s.id}_${Y}`;
        fs.writeFileSync(n + '.shp', Buffer.from(a)); fs.writeFileSync(n + '.shx', Buffer.from(b)); fs.writeFileSync(n + '.dbf', Buffer.from(FHShp.dbf(P.fitur, FHTutupan.KOLOM))); fs.writeFileSync(n + '.cpg', 'UTF-8'); }
    }
  }
  console.log(JSON.stringify(hasil));
})();
