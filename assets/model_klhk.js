/* Fire Hotspot – MODEL TUTUPAN LAHAN TAHUNAN berbasis Peta Penutupan Lahan KLHK (acuan) + citra satelit tiap tahun
 * Dipakai bersama oleh alat "Tutupan lahan (KLHK)" dan "Emisi karbon (FREL)" sehingga angkanya selalu sama.
 *
 * Acuan: Peta Penutupan Lahan KLHK tahun t (saat ini PL 2020, 1:250.000). Peta tahun t = kondisi AWAL tahun t (konvensi RC2:
 * kehilangan tahun t diterapkan ke depan). Data aktivitas per tahun = luas kehilangan tutupan pohon menurut KODE kelas KLHK di lokasi piksel:
 *   – 2001–2025: Hansen/UMD GFC v1.13 (citra Landsat tahunan)        – tahun berjalan (mis. 2026): citra Sentinel-2 (indikasi, menunggu Hansen)
 * Tahun ≥ t (ke depan): HLK Primer → HLK Sekunder (degradasi) · HLK Sekunder → PLK Campur Semak (deforestasi) ·
 *                       Hutan Rawa Primer → Hutan Rawa Sekunder (degradasi) · Hutan Rawa Sekunder → Belukar Rawa (deforestasi) · kelas lain: tidak berubah.
 * Tahun < t (ke belakang): piksel yang hilang SETELAH tahun Y masih berhutan pada tahun Y. Bila di peta acuan piksel itu sudah bukan hutan,
 *   kelas sebelumnya = Hutan Rawa Sekunder (bila kelas acuan rawa/belukar rawa/tubuh air/tambak) atau HLK Sekunder (lainnya) → deforestasi;
 *   bila di peta acuan masih hutan, KLHK tetap memetakannya hutan → tidak dihitung berubah (dicatat terpisah).
 */
(function () {
'use strict';
const KE = { 2001: [2002, 'degradasi'], 2002: [20092, 'deforestasi'], 2005: [20051, 'degradasi'], 20051: [20071, 'deforestasi'] };
const HUTAN = new Set([2001, 2002, 2004, 20041, 2005, 20051, 2006]), BASAH = new Set([20071, 50011, 5001, 20094]);
const pre = c => HUTAN.has(c) ? null : (BASAH.has(c) ? 20051 : 2002);
/* F = emisi_frel dari data/analisis/<id>_hd.json ; C = entri lokasi dari citra_tahun_berjalan.json (boleh null) */
function buat(F, C) {
  if (!F || !F.tutupan_klhk_ha || !F.hilang_kode_ha) return null;
  const t = Math.max(...Object.keys(F.tutupan_klhk_ha).map(Number)), base = {}, H = F.hilang_kode_ha[String(t)] || {};
  Object.entries(F.tutupan_klhk_ha[String(t)]).forEach(([k, v]) => base[+k] = v);
  const yc = C && C.status === 'selesai' && C.hilang_kode_ha && C.tahun > 2025 ? +C.tahun : null;
  const loss = y => { const o = y === yc ? C.hilang_kode_ha : H[String(y)]; const r = {}; Object.entries(o || {}).forEach(([k, v]) => r[+k] = v); return r; };
  const yMax = yc || 2025;
  function kondisi(Y) {   // luas per kode KLHK pada AKHIR tahun Y
    const a = Object.assign({}, base);
    if (Y >= t) { for (let y = t; y <= Y; y++) Object.entries(loss(y)).forEach(([c, v]) => { c = +c; const k = KE[c]; if (k) { a[c] = (a[c] || 0) - v; a[k[0]] = (a[k[0]] || 0) + v; } }); }
    else { for (let y = Y + 1; y <= t - 1; y++) Object.entries(loss(y)).forEach(([c, v]) => { c = +c; const p = pre(c); if (p) { a[c] = (a[c] || 0) - v; a[p] = (a[p] || 0) + v; } }); }
    Object.keys(a).forEach(k => { if (Math.abs(a[k]) < 1e-9) a[k] = 0; }); return a;
  }
  function aktivitas(y) {   // perubahan kelas akibat kehilangan tutupan pohon tahun y
    const ub = [], L = loss(y); let nh = 0, tetap = 0;
    Object.entries(L).forEach(([c, v]) => { c = +c;
      if (y >= t) { const k = KE[c]; if (k) ub.push({ dari: c, ke: k[0], jenis: k[1], ha: v }); else nh += v; }
      else { const p = pre(c); if (p) ub.push({ dari: p, ke: c, jenis: 'deforestasi', ha: v }); else tetap += v; } });
    return { ub, nh, tetap, citra: y === yc };
  }
  /* baris sheet "Awal" templat PRCF untuk periode y0–y1: [HLK primer, HLK sekunder, HR primer, HR sekunder] */
  function awal(y0, y1) {
    const k0 = kondisi(y0 - 1), D = [2001, 2002, 2005, 20051].map(c => Math.max(0, k0[c] || 0)), E = [0, 0, 0, 0], tahun = []; let nh = 0, tetap = 0;
    for (let y = y0; y <= y1; y++) { const A = aktivitas(y), row = [y, 0, 0, 0, 0, A.nh + A.tetap];
      A.ub.forEach(u => { const j = [2001, 2002, 2005, 20051].indexOf(u.dari); if (j >= 0) { E[j] += u.ha; row[1 + j] += u.ha; } });
      nh += A.nh; tetap += A.tetap; tahun.push(row); }
    return { epoch: t, sumber: 'KLHK', tutupan: k0, nh: nh + tetap, tahun, citra: yc && y1 >= yc ? yc : null,
      rows: [{ D: D[0], E: 0, F: E[0] }, { D: D[1], E: E[1], F: 0 }, { D: D[2], E: 0, F: E[2] }, { D: D[3], E: E[3], F: 0 }] };
  }
  return { t, yMin: 2001, yMax, yCitra: yc, kondisi, aktivitas, awal };
}
let CITRA = null;
const citra = () => CITRA || (CITRA = fetch('data/analisis/citra_tahun_berjalan.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));
window.FHModelKLHK = { buat, citra, KE, HUTAN, pre };
})();
