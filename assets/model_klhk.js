/* Pantau Rimbak – MODEL TUTUPAN LAHAN TAHUNAN berbasis Peta Penutupan Lahan KLHK (acuan) + citra satelit tiap tahun
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
  // peta acuan = peta KLHK TERBARU yang menutup seluruh area (≥ 98% luas peta terlengkap) – mis. PL 2025 Kapuas Hulu hanya dipakai bila area di dalam Kapuas Hulu
  const SZ = y => Object.values(F.tutupan_klhk_ha[y] || {}).reduce((a, b) => a + b, 0), Ys = Object.keys(F.tutupan_klhk_ha).map(Number), mx = Math.max(...Ys.map(SZ));
  const t = Math.max(...Ys.filter(y => SZ(y) >= 0.98 * mx)), base = {}, H = F.hilang_kode_ha[String(t)] || {};
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
/* ===================== BASIS DATA TUTUPAN LAHAN BERSAMA (satu sumber untuk alat Tutupan lahan, Emisi karbon, Indikator & Laporan) =====================
 * Urutan sumber per Hutan Desa: (1) peta tahunan LOKAL yang sudah di-groundcheck (data/tutupan_lokal, mis. PRCF Nanga Lauk 2006–2026)
 *   → (2) peta KLHK tahunan bila tersedia → (3) model KLHK 2020 + Hansen GFC v1.13 (+ Sentinel-2 tahun berjalan).
 * Setiap model memberi antarmuka yang sama: kondisi(Y) luas per kode KLHK pada tahun Y, aktivitas(y) perubahan kelas tahun y,
 * awal(y0, y1) baris sheet "Awal" templat karbon PRCF – sehingga luas, perubahan & emisi selalu sama di semua alat. */
const PRIMER = { 2001: 2002, 2005: 20051, 2004: 20041 };   // primer → sekundernya (degradasi)
const BARIS = { 2001: 0, 2002: 1, 2005: 2, 20051: 3 };      // baris templat: HLK primer, HLK sekunder, HR primer, HR sekunder
const VEG = new Set([2007, 20071, 20092, 20091, 2010, 20093]), TERBUKA = new Set([5001, 50011, 2014, 20094, 20141]);
function jenis(a, b) {   // jenis perubahan kelas a → b
  if (HUTAN.has(a) && !HUTAN.has(b)) return 'deforestasi';
  if (PRIMER[a] && b === PRIMER[a]) return 'degradasi';
  if (!HUTAN.has(a) && HUTAN.has(b)) return 'regenerasi';
  if (HUTAN.has(a) && HUTAN.has(b)) return 'antar hutan';
  if (TERBUKA.has(a) && VEG.has(b)) return 'suksesi';
  return 'bukan hutan';
}
function lokal(L) {   // L = data/tutupan_lokal/<id>.json (peta tahunan per tahun, transisi tahunan y-1→y)
  const yMin = L.tahun_min, yMax = L.tahun_maks, num = o => { const r = {}; Object.entries(o || {}).forEach(([k, v]) => r[+k] = v); return r; };
  function kondisi(Y) { Y = Math.max(yMin, Math.min(yMax, Y)); return num(L.luas[String(Y)]); }   // sebelum peta pertama = peta pertama
  function aktivitas(y) {
    const T = y > yMin && y <= yMax ? (L.transisi_tahunan[String(y)] || []) : [], ub = [], semua = [];
    let tumbuh = 0, suksesi = 0, lain = 0;
    T.forEach(([a, b, ha]) => { const j = jenis(a, b); semua.push({ dari: a, ke: b, jenis: j, ha });
      if (j === 'deforestasi' || j === 'degradasi') ub.push({ dari: a, ke: b, jenis: j, ha }); else if (j === 'regenerasi') tumbuh += ha; else if (j === 'suksesi') suksesi += ha; else lain += ha; });
    return { ub, nh: 0, tetap: 0, citra: false, semua, tumbuh, suksesi, lain };
  }
  function awal(y0, y1) {
    const k0 = kondisi(y0 - 1), D = [2001, 2002, 2005, 20051].map(c => Math.max(0, k0[c] || 0)), E = [0, 0, 0, 0], Fd = [0, 0, 0, 0], tahun = []; let tumbuh = 0, lain = 0;
    for (let y = y0; y <= y1; y++) { const A = aktivitas(y), row = [y, 0, 0, 0, 0, 0];
      A.ub.forEach(u => { const j = BARIS[u.dari]; if (j == null) { lain += u.ha; return; } if (u.jenis === 'degradasi') { Fd[j] += u.ha; row[1 + j] += u.ha; } else { E[j] += u.ha; row[1 + j] += u.ha; } });
      tumbuh += A.tumbuh; tahun.push(row); }
    return { epoch: yMin, sumber: 'PRCF', tutupan: k0, nh: 0, tahun, citra: null, tumbuh, lain,
      rows: [0, 1, 2, 3].map(j => ({ D: D[j], E: E[j], F: Fd[j] })) };
  }
  return { t: yMin, yMin, yMax, yCitra: null, kondisi, aktivitas, awal, matriks: (a, b) => (L.matriks[`${a}-${b}`] || []).map(([x, y, ha]) => ({ dari: x, ke: y, ha, jenis: x === y ? 'tetap' : jenis(x, y) })) };
}
const J_ = u => { try { return fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null); } catch (e) { return Promise.resolve(null); } };
let IDX = null; const indeks = () => IDX || (IDX = J_('data/tutupan_lokal/indeks.json').then(x => x || { lokasi: {} }));
let IDX_ = null; indeks().then(x => IDX_ = x);   // dimuat lebih awal agar lokalAda() bisa dipanggil sinkron
const lokalAda = id => !!(IDX_ && IDX_.lokasi && IDX_.lokasi[id]) ? IDX_.lokasi[id] : null;
/* teks sumber dalam bahasa tampilan (English bila aplikasi berbahasa Inggris): nilai *_en dipakai, aslinya disimpan di *_id */
function EN_(o) { const en = (() => { try { return !!(window.FHAlat && window.FHAlat.EN && window.FHAlat.EN()); } catch (e) { return false; } })();
  ['nama', 'singkat', 'sumber', 'metode', 'groundcheck'].forEach(k => { if (o[k + '_id'] == null) o[k + '_id'] = o[k]; o[k] = en && o[k + '_en'] ? o[k + '_en'] : o[k + '_id']; }); return o; }
const SUMBER_KLHK = { id: 'klhk', nama: 'Peta resmi KLHK + Hansen GFC v1.13 (perubahan tahun berjalan: Sentinel-2)', singkat: 'KLHK + Hansen',
  nama_en: 'Official KLHK map + Hansen GFC v1.13 (current-year changes: Sentinel-2)', singkat_en: 'KLHK + Hansen',
  sumber: 'Peta Penutupan Lahan resmi KLHK/Kementerian Kehutanan (1:250.000); Hansen/UMD GFC-2025-v1.13; Sentinel-2 L2A (tahun berjalan, indikasi)',
  sumber_en: 'Official KLHK/Ministry of Forestry Land Cover Map (1:250,000); Hansen/UMD GFC-2025-v1.13; Sentinel-2 L2A (current year, indicative)',
  metode: 'Kelas acuan dari peta KLHK terbaru; perubahan tiap tahun dari kehilangan tutupan pohon Hansen (30 m) menurut kelas KLHK di lokasi piksel. Hanya hutan yang hilang yang terdeteksi.',
  metode_en: 'Reference classes from the latest KLHK map; yearly changes from Hansen tree cover loss (30 m) by the KLHK class at each pixel. Only forest loss is detected.' };
function infoKLHK(t, tahun) {   // nama & sumber dengan tahun peta acuan (peta terbaru) dan peta lain sebagai pembanding
  const lain = (tahun || []).filter(y => y !== t), L = lain.length ? `; peta ${lain.join(', ')} sebagai pembanding` : '', Le = lain.length ? `; ${lain.join(', ')} map(s) for comparison` : '';
  return { nama_id: `Peta resmi KLHK ${t} + Hansen GFC v1.13 (perubahan tahun berjalan: Sentinel-2)`, nama_en: `Official KLHK ${t} map + Hansen GFC v1.13 (current-year changes: Sentinel-2)`, singkat_id: `KLHK ${t} + Hansen`, singkat_en: `KLHK ${t} + Hansen`,
    sumber_id: `Peta Penutupan Lahan resmi KLHK/Kementerian Kehutanan ${t} (1:250.000)${L}; Hansen/UMD GFC-2025-v1.13; Sentinel-2 L2A (tahun berjalan, indikasi)`, sumber_en: `Official KLHK/Ministry of Forestry Land Cover Map ${t} (1:250,000)${Le}; Hansen/UMD GFC-2025-v1.13; Sentinel-2 L2A (current year, indicative)`,
    metode_id: `Kelas acuan dari peta KLHK ${t}; tahun sebelum ${t} direkonstruksi mundur dan tahun sesudahnya maju dengan kehilangan tutupan pohon Hansen (30 m) menurut kelas KLHK di lokasi piksel. Hanya hutan yang hilang yang terdeteksi.`,
    metode_en: `Reference classes from the ${t} KLHK map; years before ${t} are reconstructed backwards and later years forwards with Hansen tree cover loss (30 m) by KLHK class at each pixel. Only forest loss is detected.` };
}

async function daftarSumber(id) {   // urutan prioritas; [0] = bawaan
  const I = await indeks(), L = I.lokasi && I.lokasi[id], out = [];
  if (L) out.push(EN_({ id: L.id, nama: L.nama, nama_en: L.nama_en, singkat: L.singkat || 'Peta tahunan ' + (L.id || '').toUpperCase(), singkat_en: L.singkat_en, lokal: true, tahun_min: L.tahun_min, tahun_maks: L.tahun_maks }));
  out.push(EN_(Object.assign({}, SUMBER_KLHK))); return out;
}
const MODEL = {};
function muat(id, sid) {   // → Promise<model> dengan .info (id, nama, sumber, metode), .peta(Y), .ubah(a, b)
  const k = id + '|' + (sid || '');
  return MODEL[k] || (MODEL[k] = (async () => {
    const S = await daftarSumber(id), info = S.find(x => x.id === sid) || S[0];
    if (info.lokal) { const L = await J_(`data/tutupan_lokal/${id}.json`); if (!L) throw new Error('Data ' + info.nama + ' belum dapat dimuat.');
      const M = lokal(L); M.info = EN_(Object.assign({}, info, { sumber: L.sumber, metode: L.metode, groundcheck: L.groundcheck, sumber_en: L.sumber_en, metode_en: L.metode_en, groundcheck_en: L.groundcheck_en, kelas_asli: L.kelas_asli }));
      M.peta = Y => J_(`data/tutupan_lokal/${id}_${Math.max(M.yMin, Math.min(M.yMax, Y))}.geojson`);
      M.ubah = (a, b) => a >= b ? Promise.resolve({ type: 'FeatureCollection', features: [] }) : J_(`data/tutupan_lokal/ubah/${id}_${Math.max(M.yMin, a)}_${Math.min(M.yMax, b)}.geojson`);
      return M; }
    const [R, C] = await Promise.all([J_(`data/analisis/${id}_hd.json`), citra()]);
    const M = R && R.emisi_frel ? buat(R.emisi_frel, C && C.lokasi && C.lokasi[id]) : null; if (!M) throw new Error('Data tutupan lahan belum tersedia.');
    const ik = infoKLHK(M.t, Object.keys(R.emisi_frel.tutupan_klhk_ha || {}).map(Number).sort());
    M.info = Object.assign({}, info, ik, { nama: ik.nama_id, singkat: ik.singkat_id, sumber: ik.sumber_id, metode: ik.metode_id }); EN_(M.info); M.R = R; return M;
  })().catch(e => { delete MODEL[k]; throw e; }));
}
const PILIH = 'fh_sumber_tutupan_';
function pilihan(id) { try { return localStorage.getItem(PILIH + id) || null; } catch (e) { return null; } }
function simpanPilihan(id, sid) { try { localStorage.setItem(PILIH + id, sid); } catch (e) { } }
let CITRA = null;
const citra = () => CITRA || (CITRA = fetch('data/analisis/citra_tahun_berjalan.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));
window.FHModelKLHK = { buat, citra, KE, HUTAN, pre, lokal, jenis, daftarSumber, muat, pilihan, simpanPilihan, SUMBER_KLHK, lokalAda };
})();
