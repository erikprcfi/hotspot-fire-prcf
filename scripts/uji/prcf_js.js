// Hitung semua periode Nanga Lauk (sumber peta tahunan PRCF) dengan modul aplikasi: FHModelKLHK (basis bersama), FHTutupan.hitung, FHKarbon.hitungHD.
const fs = require('fs'), R0 = process.argv[2];
global.window = global; global.document = { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}) }; global.localStorage = { getItem: () => null, setItem() {} };
global.fetch = async u => { const p = R0 + '/' + u.split('?')[0]; return fs.existsSync(p) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(p)) } : { ok: false }; };
window.FHAlat = { n1: (v, d) => (+v).toFixed(d), esc: s => String(s) };
require(R0 + '/assets/model_klhk.js'); require(R0 + '/assets/tutupan.js'); require(R0 + '/assets/karbon.js');
(async () => {
  const S = await FHModelKLHK.daftarSumber('nangalauk'), M = await FHModelKLHK.muat('nangalauk'), out = { utama: S[0].id, yMin: M.yMin, yMax: M.yMax, luas: {}, per: {} };
  for (let y = M.yMin; y <= M.yMax; y++) out.luas[y] = M.kondisi(y);
  for (let a = M.yMin + 1; a <= M.yMax; a++) for (let b = a; b <= M.yMax; b++) {
    const A = M.awal(a, b), P = FHKarbon.param({ y0: a, y1: b, eff: .9, leak: .05, buf: .135 }), H = FHKarbon.hitungHD(A, P), T = FHTutupan.hitung(M, a, b);
    out.per[a + '|' + b] = { D: A.rows.map(r => r.D), E: A.rows.map(r => r.E), F: A.rows.map(r => r.F), d3: H.m.d3, d8: H.m.d8, tumbuh: A.tumbuh,
      t_def: T.akt.reduce((s, x) => s + x.def, 0), t_deg: T.akt.reduce((s, x) => s + x.deg, 0), t_hutan_awal: T.hutanAwal, t_reg: T.tumbuh };
  }
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e.stack); process.exit(1); });
