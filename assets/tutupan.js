/* Fire Hotspot – TUTUPAN LAHAN per Hutan Desa, satu basis data dengan alat Emisi karbon (assets/model_klhk.js → FHModelKLHK.muat)
 * Sumber (urutan prioritas, dapat dipilih di layar; sumber yang dipakai selalu tertulis di layar & ekspor):
 *  1. Peta tahunan LOKAL yang sudah di-groundcheck (data/tutupan_lokal; kini Hutan Desa Nanga Lauk 2006–2026, Yayasan PRCF Indonesia:
 *     interpretasi visual Landsat 5/7/8 + ArcGIS Imagery, groundcheck lapangan) – luas, perubahan & matriks langsung dari peta tiap tahun.
 *  2. Peta KLHK tahunan (bila kelak tersedia).
 *  3. Model KLHK 2020 + Hansen: Peta Penutupan Lahan KLHK 2020 (1:250.000) + kehilangan tutupan pohon tahunan Hansen GFC v1.13:
 *     HLK Primer → HLK Sekunder (degradasi); HLK Sekunder → Pertanian Lahan Kering Campur Semak (deforestasi);
 *     Hutan Rawa Primer → Hutan Rawa Sekunder (degradasi); Hutan Rawa Sekunder → Belukar Rawa (deforestasi). Kehilangan di kelas bukan hutan tidak mengubah kelas.
 * Periode y0–y1: kondisi awal = tahun y0−1 (untuk peta lokal: peta tahun y0−1, atau peta pertama), kondisi akhir = tahun y1;
 * perubahan = jumlah perubahan tahunan y0..y1 – angka yang sama dipakai alat Emisi karbon (baris D/E/F templat PRCF).
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const NAMA = { 2001: 'Hutan Lahan Kering Primer', 2002: 'Hutan Lahan Kering Sekunder', 2004: 'Hutan Mangrove Primer', 20041: 'Hutan Mangrove Sekunder', 2005: 'Hutan Rawa Primer', 20051: 'Hutan Rawa Sekunder', 2006: 'Hutan Tanaman', 2007: 'Semak Belukar', 20071: 'Belukar Rawa',
  2010: 'Perkebunan', 2012: 'Permukiman', 20121: 'Bandara / Pelabuhan', 20122: 'Transmigrasi', 2014: 'Tanah Terbuka', 20141: 'Pertambangan', 20091: 'Pertanian Lahan Kering', 20092: 'Pertanian Lahan Kering Campur Semak', 20093: 'Sawah', 20094: 'Tambak', 3000: 'Savana / Padang Rumput', 5001: 'Tubuh Air', 50011: 'Rawa', 2500: 'Awan', 5003: 'Laut' };
const WARNA = { 2001: '#0B5D1E', 2002: '#3E9B3A', 2004: '#0E7C66', 20041: '#4FB39A', 2005: '#1E6B52', 20051: '#6BAF7D', 2006: '#8BC34A', 2007: '#C8D96F', 20071: '#9CC9A6', 2010: '#E6A23C', 2012: '#E53935', 20121: '#B71C1C', 20122: '#F48FB1',
  2014: '#D7CCC8', 20141: '#8D6E63', 20091: '#FFE082', 20092: '#F0C05A', 20093: '#FFF59D', 20094: '#80DEEA', 3000: '#DCE775', 5001: '#1E88E5', 50011: '#64B5F6', 2500: '#FFFFFF', 5003: '#0D47A1' };
const HUTAN = new Set([2001, 2002, 2004, 20041, 2005, 20051, 2006]);
const muat = id => fetch(`data/analisis/${id}_hd.json`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
let PB_ = null; const PB = () => PB_ || (PB_ = fetch('data/analisis/pembanding_lulc.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));
const muatPeta = (id, t) => fetch(`data/klhk/${id}_${t}.geojson`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
const nf = (v, d = 2) => X().n1(v, d);
/* ---------- peta tutupan lahan TAHUN Y (vektor) dari data/klhk/tahunan/<id>.geojson (scripts/tutupan_tahunan.py) ----------
 * aturan kelas sama dengan assets/model_klhk.js sehingga luas per kelas = tabel alat ini (selisih kecil hanya karena piksel 30 m vs garis poligon) */
const FREL_T = { 2001: ['HLK Primer', 420.41], 2002: ['HLK Sekunder', 287.55], 2005: ['Hutan Rawa Primer', 347.81], 20051: ['Hutan Rawa Sekunder', 263.17], 20092: ['PLK campur semak (pasca-deforestasi)', 77.56], 20071: ['Belukar rawa (pasca-deforestasi)', 23.91] };
const TH = {}; const muatTh = id => TH[id] || (TH[id] = fetch(`data/klhk/tahunan/${id}.geojson`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null));
function kelasTahun(k, th, Y, t = 2020) {   // → [kode kelas akhir tahun Y, status, tahun perubahan kelas (0 = tidak berubah s.d. Y)]
  const M = window.FHModelKLHK, KE = M ? M.KE : {}, pre = M ? M.pre : () => null;
  if (!th) return [k, 'Tetap', 0];
  if (th <= Y) { if (th >= t) return KE[k] ? [KE[k][0], KE[k][1] === 'deforestasi' ? 'Deforestasi' : 'Degradasi', th] : [k, 'Kehilangan pohon, kelas tetap', 0];
    return pre(k) ? [k, 'Deforestasi', th] : [k, 'Kehilangan pohon, tetap hutan di peta KLHK', 0]; }
  if (th < t) { const p = pre(k); return p ? [p, 'Hutan (hilang ' + th + ')', 0] : [k, 'Tetap', 0]; }
  return [k, 'Tetap', 0];
}
async function petaTahun(s, Y, y0) {
  const D = await muatTh(s.id); if (!D) return null; const HUT = new Set([2001, 2002, 2004, 20041, 2005, 20051, 2006]);
  const per = y0 != null && y0 <= Y;
  const fitur = D.features.map(f => { const p = f.properties, [k, st, tu] = kelasTahun(p.k, p.th, Y, D.tahun_peta || 2020), fr = FREL_T[k];
    return { type: 'Feature', geometry: f.geometry, properties: { HD_NAMA: s.hd_nama, LPHD: s.lphd || '', TAHUN: Y, KODE_PL: k, KELAS: NAMA[k] || String(k), KELOMPOK: HUT.has(k) ? 'Hutan' : 'Bukan hutan',
      TIPE_FREL: fr ? fr[0] : '-', C_TCHA: fr ? +(fr[1] * 0.47).toFixed(4) : null, KODE_REF: p.k, KELAS_REF: NAMA[p.k] || String(p.k), STATUS: st, TH_UBAH: tu,
      UBAH_PER: per && tu && tu >= y0 && tu <= Y ? 'Ya' : 'Tidak', SUMBER: p.src === 'S2' ? 'Sentinel-2 ' + p.th + ' (indikasi)' : p.src === 'GFC' ? 'Hansen GFC v1.13 lossyear ' + p.th : 'KLHK PL2020 1:250.000', LUAS_HA: p.ha } }; });
  return { type: 'FeatureCollection', fitur, D };
}
const KOLOM = [['HD_NAMA', 'C', 60], ['LPHD', 'C', 60], ['TAHUN', 'N', 4, 0], ['KODE_PL', 'N', 6, 0], ['KELAS', 'C', 80], ['KELOMPOK', 'C', 12], ['TIPE_FREL', 'C', 60], ['C_TCHA', 'N', 10, 4],
  ['KODE_REF', 'N', 6, 0], ['KELAS_REF', 'C', 80], ['STATUS', 'C', 60], ['TH_UBAH', 'N', 4, 0], ['UBAH_PER', 'C', 5], ['SUMBER', 'C', 60], ['LUAS_HA', 'N', 14, 4]];
const BACA = (s, Y, per, n, tot, t) => [`Peta tutupan lahan ${s.hd_nama} – kondisi akhir tahun ${Y}` + (per ? ` (periode ${per})` : ''), `Dibuat oleh aplikasi Fire Hotspot – Yayasan PRCF Indonesia, ${X().wib(Date.now())}`, '',
  `Jumlah poligon: ${n} · total luas: ${nf(tot, 4)} ha · sistem koordinat: WGS 1984 (EPSG:4326)`, '',
  'Sumber: Peta Penutupan Lahan KLHK 2020 (1:250.000) sebagai acuan; perubahan per tahun dari Hansen/UMD/Google/USGS/NASA Global Forest Change GFC-2025-v1.13 (lossyear, tajuk 2000 ≥ 30%, piksel 30 m); tahun berjalan dari citra Sentinel-2 L2A (indikasi, menunggu rilis tahunan Hansen).',
  'Aturan: tahun ≥ 2020 – kehilangan tutupan pohon di HLK Primer → HLK Sekunder (degradasi), HLK Sekunder → Pertanian Lahan Kering Campur Semak (deforestasi), Hutan Rawa Primer → Hutan Rawa Sekunder (degradasi), Hutan Rawa Sekunder → Belukar Rawa (deforestasi); kelas lain tidak berubah. Tahun < 2020 – piksel yang hilang sesudah tahun itu dan di peta 2020 sudah bukan hutan dikembalikan ke Hutan Rawa Sekunder (kelas basah) atau HLK Sekunder (lainnya).', '',
  'Kolom atribut:', 'HD_NAMA nama Hutan Desa · LPHD lembaga pengelola · TAHUN tahun kondisi (akhir tahun) · KODE_PL / KELAS kode & nama kelas penutupan lahan KLHK pada tahun itu · KELOMPOK hutan / bukan hutan',
  'TIPE_FREL tipe kelas pada rumus FREL · C_TCHA cadangan karbon (tC/ha = biomassa FREL 2022 × 0,47; hanya kelas yang dipakai rumus FREL) · KODE_REF / KELAS_REF kelas di peta acuan KLHK 2020',
  'STATUS keadaan poligon pada tahun itu (Tetap / Degradasi / Deforestasi / Hutan sebelum hilang / Kehilangan pohon tanpa perubahan kelas) · TH_UBAH tahun perubahan kelas (0 = tidak berubah)',
  'UBAH_PER Ya bila kelas berubah di dalam periode yang dipilih · SUMBER sumber geometri/perubahan · LUAS_HA luas geodesik poligon (ha, elipsoid WGS84)', '',
  'Catatan: luas pada tabel aplikasi dihitung dari piksel 30 m (pusat piksel di dalam batas), luas poligon SHP dihitung dari garis batas, sehingga dapat berbeda sedikit (umumnya < 0,5%). Data resmi, tidak ada angka buatan.'].map(x => TX(x, t)).join('\r\n');
/* teks metode untuk peta acuan KLHK tahun t (kini 2025; teks dasar ditulis untuk 2020) */
const TX = (s, t) => !t || t === 2020 ? s : s.replace(/PL_2020_AR_250K Provinsi Kalimantan Barat/g, `Penutupan Lahan ${t} Kabupaten Kapuas Hulu (Kementerian Kehutanan); peta KLHK 2020 dipakai sebagai pembanding`).replace(/(KLHK|peta|Peta acuan|acuan|sebelum|sesudah|Tahun <|tahun ≥|tahun <|Tahun ≥|setelah) 2020/g, `$1 ${t}`).replace(/PL 2021–2024/g, `PL ${t + 1} dst.`);
const T_ = s => window.FHLang ? FHLang.t(String(s)) : String(s);

const JENIS = { deforestasi: 'Deforestasi', degradasi: 'Degradasi', regenerasi: 'Regenerasi', suksesi: 'Suksesi', 'antar hutan': 'Antar kelas hutan', 'bukan hutan': 'Antar kelas bukan hutan', tetap: 'Tetap' };
/* M = model dari FHModelKLHK (muat/buat/lokal) → ringkasan periode y0–y1 */
function hitung(M, y0, y1) {
  if (!M || !M.kondisi) return null;
  const lok = !!(M.info && M.info.lokal), ya = lok ? Math.max(M.yMin, y0 - 1) : y0 - 1;
  const awal = M.kondisi(ya), akhir = M.kondisi(y1), tahun = []; for (let y = y0; y <= y1; y++) tahun.push([y, M.kondisi(y)]);
  const ub = {}, akt = []; let nh = 0, tetap = 0, citra = null, tumbuh = 0, suksesi = 0, lain = 0;
  for (let y = y0; y <= y1; y++) {
    const A = M.aktivitas(y), def = A.ub.filter(u => u.jenis === 'deforestasi').reduce((s, u) => s + u.ha, 0), deg = A.ub.filter(u => u.jenis === 'degradasi').reduce((s, u) => s + u.ha, 0);
    (A.semua || A.ub).forEach(u => { const k = u.dari + '>' + u.ke; ub[k] = (ub[k] || 0) + u.ha; });
    nh += A.nh || 0; tetap += A.tetap || 0; tumbuh += A.tumbuh || 0; suksesi += A.suksesi || 0; lain += A.lain || 0; if (A.citra) citra = y;
    akt.push({ y, def, deg, reg: A.tumbuh || 0, suk: A.suksesi || 0, lain: A.lain || 0, nh: (A.nh || 0) + (A.tetap || 0), tot: def + deg + (A.nh || 0) + (A.tetap || 0) });
  }
  const kode = [...new Set([...Object.keys(awal), ...Object.keys(akhir), ...tahun.flatMap(([, o]) => Object.keys(o))].map(Number))].filter(k => (awal[k] || 0) > 0.005 || (akhir[k] || 0) > 0.005 || tahun.some(([, o]) => (o[k] || 0) > 0.005)).sort((a, b) => (akhir[b] || 0) - (akhir[a] || 0));
  const J = window.FHModelKLHK ? FHModelKLHK.jenis : () => '', luas = Object.values(akhir).reduce((s, v) => s + Math.max(0, v), 0);
  return { t: M.t, M, lok, ya, awal, akhir, tahun, akt, ubah: Object.entries(ub).map(([k, v]) => { const a = +k.split('>')[0], b = +k.split('>')[1]; return [a, b, v, J(a, b)]; }).sort((p, q) => q[2] - p[2]),
    mat: lok && M.matriks && ya < y1 ? M.matriks(ya, y1) : null, nh, tetap, tumbuh, suksesi, lain, citra, kode, luas,
    hutanAwal: kode.filter(k => HUTAN.has(k)).reduce((s, k) => s + (awal[k] || 0), 0), hutanAkhir: kode.filter(k => HUTAN.has(k)).reduce((s, k) => s + (akhir[k] || 0), 0) };
}
const SLUG = s => String(s).replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_');

function css() { if (document.getElementById('tl-css')) return; const s = document.createElement('style'); s.id = 'tl-css';
  s.textContent = `.tl-lg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin-top:8px}.tl-lg span{display:inline-flex;align-items:center;gap:6px}.tl-lg i{width:14px;height:14px;border-radius:4px;border:1px solid rgba(0,0,0,.2)}
  .tl-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:6px 0 2px;border:1px solid var(--line)}.tl-bar i{display:block;height:100%}`; document.head.appendChild(s); }
let MAP = null;
function open(opsi) {
  const A = X(); if (!A || !window.openPage) return; css(); if (window.FHKarbon && FHKarbon.css) FHKarbon.css();   // gaya akordeon & tabel dipakai bersama
  A.pakai('tutupan'); opsi = opsi || {};
  const cur = window.FHSiteObj && FHSiteObj(), MK = window.FHModelKLHK;
  if (!cur) return A.toast('Pilih Hutan Desa di Beranda.');
  openPage('Tutupan lahan', cur.hd_nama + ' · pilih sumber peta & periode', `<div class="fa" id="tuW">
    <div class="fa-card"><h5>Hutan Desa</h5><div style="font-size:18px;font-weight:800">${esc(cur.hd_nama)}</div><p class="fa-note">Semua angka, peta, laporan & ekspor di halaman ini hanya untuk Hutan Desa ini. Ganti Hutan Desa di Beranda untuk melihat lokasi lain.</p>
     <h5 style="margin-top:12px">Sumber peta</h5><select id="tuSm" style="width:100%"></select><p class="fa-note" id="tuSmI"></p>
     <h5 style="margin-top:12px">Periode</h5><div class="fa-row"><label>Tahun awal<select id="tuY0"></select></label><label>Tahun akhir<select id="tuY1"></select></label></div>
     <p class="fa-note" id="tuInfo"></p></div><div id="tuOut"></div></div>`, async () => {
    const w = document.getElementById('tuW'), $ = s => w.querySelector(s);
    let SM; try { SM = await MK.daftarSumber(cur.id); } catch (e) { SM = [MK.SUMBER_KLHK]; }
    const pil = opsi.sumber || MK.pilihan(cur.id); let sid = (SM.find(x => x.id === pil) || SM[0]).id;
    $('#tuSm').innerHTML = SM.map((x, i) => `<option value="${esc(x.id)}" ${x.id === sid ? 'selected' : ''}>${esc(x.nama)}${i === 0 && SM.length > 1 ? ' – utama' : SM.length > 1 ? ' – pembanding' : ''}</option>`).join('');
    let M = null;
    const isiTahun = (keep) => { const yMin = M.info && M.info.lokal ? M.yMin : 2001, yMax = M.yMax, Y = []; for (let y = yMin; y <= yMax; y++) Y.push(y);
      const o0 = keep ? +$('#tuY0').value : opsi.y0, o1 = keep ? +$('#tuY1').value : opsi.y1, d0 = Y.includes(o0) ? o0 : (M.info && M.info.lokal ? yMin : 2020), d1 = Y.includes(o1) ? o1 : yMax;
      const lbl = y => `${y}${y === M.yCitra ? ' (citra)' : ''}`;
      $('#tuY0').innerHTML = Y.map(y => `<option value="${y}" ${y === d0 ? 'selected' : ''}>${lbl(y)}</option>`).join(''); $('#tuY1').innerHTML = Y.map(y => `<option value="${y}" ${y === d1 ? 'selected' : ''}>${lbl(y)}</option>`).join('');
      const I = M.info || {}; $('#tuSmI').textContent = I.lokal ? `${I.sumber}. ${I.metode}` : `${I.sumber || MK.SUMBER_KLHK.sumber}. ${I.metode || MK.SUMBER_KLHK.metode}`;
      $('#tuInfo').textContent = I.lokal ? `Peta tahunan ${M.yMin}–${M.yMax}. Kondisi awal periode = peta tahun sebelum tahun awal (atau peta ${M.yMin}); perubahan = selisih peta tiap tahun.` : `Acuan: Peta Penutupan Lahan KLHK ${M.t}. Tahun 2001–2025 dianalisis dengan citra Landsat (Hansen GFC v1.13)${M.yCitra ? `, tahun ${M.yCitra} dengan citra Sentinel-2` : ''}.`; };
    const go = () => { if (!M) return; let y0 = +$('#tuY0').value, y1 = +$('#tuY1').value; if (y0 > y1) [y0, y1] = [y1, y0];
      const h = hitung(M, y0, y1); if (!h) { $('#tuOut').innerHTML = '<div class="fa-card"><p class="fa-err">Data tutupan lahan untuk periode ini belum tersedia.</p></div>'; return; }
      tampil(w, { id: cur.id, nama: cur.hd_nama, h }, y0, y1); A.pakai('tutupan_hitung'); };
    const ganti = async (keep) => { $('#tuOut').innerHTML = '<div class="fa-card"><p class="fa-note">Memuat data tutupan lahan…</p></div>';
      try { M = await MK.muat(cur.id, sid); } catch (e) { $('#tuOut').innerHTML = `<div class="fa-card"><p class="fa-err">${esc(e.message || 'Data tutupan lahan belum tersedia.')}</p></div>`; return; }
      isiTahun(keep); go(); };
    $('#tuSm').onchange = () => { sid = $('#tuSm').value; MK.simpanPilihan(cur.id, sid); ganti(true); };
    ['#tuY0', '#tuY1'].forEach(s => $(s).onchange = go); ganti(false);
  });
}
/* baris perubahan tahunan sesuai sumber */
function barisAkt(G) {
  const R = [['Deforestasi (hutan → bukan hutan)', 'def'], ['Degradasi (hutan primer → sekunder)', 'deg']];
  if (G.lok) R.push(['Regenerasi (bukan hutan → hutan)', 'reg'], ['Suksesi (air / lahan terbuka → semak & vegetasi)', 'suk'], ['Perubahan lain antar kelas', 'lain']);
  else R.push(['Kehilangan tutupan pohon tanpa perubahan kelas (lahan bukan hutan / tetap hutan di peta KLHK)', 'nh'], ['Total kehilangan tutupan pohon (Hansen GFC v1.13 / citra)', 'tot']);
  return R;
}
function tampil(w, x, y0, y1) {
  const A = X(), G = x.h, nama = x.nama, per = y0 === y1 ? String(y0) : `${y0}–${y1}`, out = w.querySelector('#tuOut'), I = G.M.info || {}, lok = G.lok, ya = G.ya;
  const sec = (id, j, s, isi, buka) => `<div class="kb-sec${buka ? ' open' : ''}"><button type="button" class="kb-h" aria-expanded="${!!buka}"><span><b>${j}</b><small>${s}</small></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button><div class="kb-acc"><div class="kb-in" id="${id}">${isi}</div></div></div>`;
  const bar = o => `<div class="tl-bar">${G.kode.map(k => `<i title="${esc(NAMA[k] || k)}: ${nf(o[k] || 0)} ha" style="width:${(o[k] || 0) / G.luas * 100}%;background:${WARNA[k] || '#999'}"></i>`).join('')}</div>`;
  const tRing = `<table class="kb-t"><tr><th>Kelas penutupan lahan (kode KLHK)</th><th>Kode</th><th>Awal (${ya}) (ha)</th><th>Akhir ${y1} (ha)</th><th>Perubahan (ha)</th><th>% luas akhir</th></tr>${G.kode.map(k => { const a = G.awal[k] || 0, b = G.akhir[k] || 0; return `<tr><td><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${WARNA[k] || '#999'};margin-right:6px"></span>${esc(NAMA[k] || k)}</td><td class="n">${k}</td><td class="n">${nf(a)}</td><td class="n">${nf(b)}</td><td class="n" style="color:${b - a < -0.005 ? '#B3261E' : b - a > 0.005 ? '#1E7A3B' : 'inherit'}">${b - a > 0 ? '+' : ''}${nf(b - a)}</td><td class="n">${nf(b / G.luas * 100, 2)}%</td></tr>`; }).join('')}
    <tr class="tot"><td>Jumlah</td><td></td><td class="n">${nf(G.kode.reduce((s, k) => s + (G.awal[k] || 0), 0))}</td><td class="n">${nf(G.kode.reduce((s, k) => s + (G.akhir[k] || 0), 0))}</td><td></td><td class="n">100%</td></tr></table>`;
  const BA = barisAkt(G);
  const tTh = `<table class="kb-t"><tr><th>Kelas</th><th>Awal (${ya})</th>${G.tahun.map(([y]) => `<th>${y}</th>`).join('')}</tr>${G.kode.map(k => `<tr><td>${esc(NAMA[k] || k)}</td><td class="n">${nf(G.awal[k] || 0)}</td>${G.tahun.map(([, o]) => `<td class="n">${nf(o[k] || 0)}</td>`).join('')}</tr>`).join('')}
    <tr><td colspan="${G.tahun.length + 2}" style="font-weight:800;padding-top:10px">Perubahan per tahun (ha)</td></tr>
    ${BA.map(([l, k]) => `<tr><td>${esc(l)}</td><td class="n">–</td>${G.akt.map(a => `<td class="n">${nf(a[k])}</td>`).join('')}</tr>`).join('')}</table>
    <p class="fa-note">${lok ? 'Perubahan tahun y = selisih peta tahun y−1 dan y (tumpang-susun poligon). Tahun tanpa perubahan berarti peta tahun itu sama dengan tahun sebelumnya menurut interpretasi citra & groundcheck.' : 'Kelas KLHK hanya berubah bila pohon hilang di kelas hutan. Pohon yang hilang di ladang/semak/rawa (sudah bukan hutan) tetap tercatat, tetapi tidak mengubah luas kelas – karena itu tabel kelas bisa tampak datar pada tahun tertentu. Pertumbuhan kembali (regenerasi) dan perubahan antar-kelas bukan hutan belum terekam peta KLHK 2020.'}</p>`;
  const tUb = G.ubah.length ? `<table class="kb-t"><tr><th>Dari</th><th>Menjadi</th><th>Jenis</th><th>Luas ${per} (ha)</th></tr>${G.ubah.map(([a, b, v, j]) => `<tr><td>${esc(NAMA[a] || a)}</td><td>${esc(NAMA[b] || b)}</td><td>${esc(JENIS[j] || j)}</td><td class="n">${nf(v, 4)}</td></tr>`).join('')}</table><p class="fa-note">Jumlah perubahan tiap tahun dalam periode (dipakai sebagai data aktivitas emisi karbon).</p>` : '<p class="fa-note">Tidak ada perubahan kelas pada periode ini.</p>';
  const tMat = G.mat && G.mat.length ? (() => { const D = [...new Set(G.mat.map(m => m.dari))], K = [...new Set(G.mat.map(m => m.ke))], v = (a, b) => (G.mat.find(m => m.dari === a && m.ke === b) || {}).ha || 0;
    return `<table class="kb-t"><tr><th>${ya} \\ ${y1}</th>${K.map(k => `<th>${esc(NAMA[k] || k)}</th>`).join('')}<th>Jumlah ${ya}</th></tr>${D.map(a => `<tr><td>${esc(NAMA[a] || a)}</td>${K.map(b => { const z = v(a, b), j = a === b ? '' : FHModelKLHK.jenis(a, b); return `<td class="n" style="${z && j === 'deforestasi' ? 'background:#FDE2E1;color:#9F1239;font-weight:700' : z && j === 'regenerasi' ? 'background:#DCFCE7;color:#166534;font-weight:700' : z && j === 'suksesi' ? 'background:#ECFCCB' : ''}">${z ? nf(z) : ''}</td>`; }).join('')}<td class="n"><b>${nf(K.reduce((s, b) => s + v(a, b), 0))}</b></td></tr>`).join('')}</table>
      <p class="fa-note">Matriks perubahan bersih ${ya} → ${y1} dari tumpang-susun peta kedua tahun. Merah = deforestasi, hijau = regenerasi, hijau muda = suksesi.</p>`; })() : '';
  const kpiR = lok ? `<div class="fa-kpi"><div><small>Deforestasi ${per}</small><b style="color:#B3261E">${nf(G.akt.reduce((s, a) => s + a.def, 0), 2)} ha</b></div><div><small>Degradasi ${per}</small><b>${nf(G.akt.reduce((s, a) => s + a.deg, 0), 2)} ha</b></div><div><small>Regenerasi ${per}</small><b style="color:#1E7A3B">${nf(G.tumbuh, 2)} ha</b></div><div><small>Suksesi alami ${per}</small><b>${nf(G.suksesi, 2)} ha</b></div></div>` : '';
  out.innerHTML = `<div class="fa-card" style="border-left:4px solid ${lok ? '#15803D' : '#B45309'}"><small style="font-weight:800;color:var(--muted)">SUMBER DATA</small><div style="font-weight:800">${esc(I.nama || '')}</div>${lok && I.groundcheck ? `<p class="fa-note">Groundcheck: ${esc(I.groundcheck)}</p>` : ''}</div>
    <div class="fa-kpi"><div><small>Luas ${esc(nama)}</small><b>${nf(G.luas, 1)} ha</b></div><div><small>Hutan awal (${ya})</small><b>${nf(G.hutanAwal, 1)} ha</b></div><div><small>Hutan akhir ${y1}</small><b>${nf(G.hutanAkhir, 1)} ha</b></div><div><small>Perubahan hutan bersih</small><b style="color:${G.hutanAkhir < G.hutanAwal ? '#B3261E' : G.hutanAkhir > G.hutanAwal ? '#1E7A3B' : 'inherit'}">${G.hutanAkhir - G.hutanAwal > 0 ? '+' : ''}${nf(G.hutanAkhir - G.hutanAwal, 2)} ha</b></div></div>${kpiR}
    <div class="fa-card"><small style="font-weight:700;color:var(--muted)">Komposisi awal (${ya})</small>${bar(G.awal)}<small style="font-weight:700;color:var(--muted)">Komposisi akhir ${y1}</small>${bar(G.akhir)}<div class="tl-lg">${G.kode.map(k => `<span><i style="background:${WARNA[k] || '#999'}"></i>${esc(NAMA[k] || k)}</span>`).join('')}</div></div>
    <div class="fa-row"><button class="fa-btn pri" style="--c:#15803D" id="tuXl">Excel (.xlsx)</button><button class="fa-btn pri" style="--c:#1D4ED8" id="tuDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="tuPdf">PDF</button><button class="fa-btn" id="tuCsv">CSV</button><button class="fa-btn pri" style="--c:#7C3AED" id="tuShp">SHP tahun ${y1} (.zip)</button><button class="fa-btn" id="tuGeo">GeoJSON tahun ${y1}</button></div>
    ${sec('tuMapS', 'Peta penutupan lahan ' + y1, lok ? `${esc(I.singkat || '')} · garis merah = berubah ${ya}–${y1}` : 'Acuan KLHK ' + G.t + ' (1:250.000) + perubahan citra per tahun · garis merah = berubah dalam periode', '<div class="fa-map" id="tuMap"></div>', true)}
    ${sec('tuS1', 'Tutupan lahan awal & akhir periode', `Luas per kelas, ${per}`, `<div class="fa-scroll">${tRing}</div>`, true)}
    ${sec('tuS2', 'Tutupan lahan per tahun', 'Luas tiap tahun & perubahan tahunan (ha)', `<div class="fa-scroll">${tTh}</div>`)}
    ${sec('tuS3', 'Perubahan kelas', lok ? 'Deforestasi, degradasi, regenerasi, suksesi & matriks perubahan' : 'Degradasi & deforestasi dari data kehilangan tutupan pohon', `<div class="fa-scroll">${tUb}</div>${tMat ? `<div class="fa-scroll" style="margin-top:10px">${tMat}</div>` : ''}${lok ? '' : `<p class="fa-note">Kehilangan tutupan pohon di areal bukan hutan KLHK (ladang/semak, dll.) ${per}: <b>${nf(G.nh, 4)} ha</b> – tidak mengubah kelas dan tidak dihitung sebagai emisi.</p>${G.tetap > 0.0001 ? `<p class="fa-note">Kehilangan sebelum 2020 di areal yang tetap dipetakan hutan oleh KLHK 2020: <b>${nf(G.tetap, 4)} ha</b> – tidak dihitung berubah.</p>` : ''}`}${G.citra ? `<p class="fa-note" style="color:#B45309">Tahun ${G.citra}: perubahan dari citra Sentinel-2 (indikasi), menunggu rilis data tahunan Hansen.</p>` : ''}`)}
    ${lok ? sec('tuS6', 'Perbandingan dengan peta resmi KLHK', 'Peta lokal vs Peta Penutupan Lahan KLHK/Kemenhut pada tahun yang sama', '<div id="tuBd"><p class="fa-note">Memuat…</p></div>') : ''}
    ${sec('tuS7', 'Klasifikasi citra Sentinel-2 (pembanding mandiri)', 'Model belajar dari peta KLHK 2025 & PRCF · akurasi diuji pada wilayah terpisah', '<div id="tuKl"><p class="fa-note">Memuat…</p></div>')}
    ${sec('tuS5', 'Pembanding independen (Sentinel-2 10 m)', 'Peta tutupan lahan tahunan terpisah 2017–2023 untuk cek silang tren', '<div id="tuPb"><p class="fa-note">Memuat…</p></div>')}
    ${sec('tuS4', 'Metode & sumber', 'Sumber peta, aturan perubahan kelas, keterbatasan', metode(G).map(m => `<p class="fa-note">• ${esc(m)}</p>`).join(''))}
    <div class="fa-card"><button class="fa-btn full" id="tuKb">Hitung emisi karbon dari tutupan lahan ini (sumber & periode sama) →</button></div>`;
  out.querySelectorAll('.kb-sec .kb-h').forEach(b => b.onclick = () => { const s = b.parentElement, op = !s.classList.contains('open'); s.classList.toggle('open', op); b.setAttribute('aria-expanded', op); if (op && s.querySelector('#tuMap') && MAP) setTimeout(() => MAP.invalidateSize(), 320); });
  const cur = (window.FHSites ? FHSites() : []).find(q => q.id === x.id), slug = SLUG(nama), src = (I.id || 'klhk').toUpperCase();
  peta(x.id, G, y1, y0);
  if (lok) fetch(`data/tutupan_lokal/${x.id}_banding.json`, { cache: 'no-cache' }).then(r_ => r_.ok ? r_.json() : null).catch(() => null).then(J => { const el = out.querySelector('#tuBd'); if (!el) return;
    if (!J || !Object.keys(J.tahun || {}).length) { el.innerHTML = '<p class="fa-note">Belum ada peta KLHK resmi pada tahun yang sama untuk dibandingkan.</p>'; return; }
    el.innerHTML = Object.entries(J.tahun).map(([y, B]) => { const K = [...new Set([...Object.keys(B.luas_lokal), ...Object.keys(B.luas_klhk)])].sort((a, b) => ((B.luas_lokal[b] || 0) + (B.luas_klhk[b] || 0)) - ((B.luas_lokal[a] || 0) + (B.luas_klhk[a] || 0)));
      return `<h5 style="margin:10px 0 6px">Tahun ${y}</h5><div class="fa-kpi"><div><small>Kelas sama persis</small><b>${nf(B.sesuai_kelas_persen, 1)}%</b></div><div><small>Kelompok sama (hutan / lahan basah / lahan kering)</small><b>${nf(B.sesuai_kelompok_persen, 1)}%</b></div><div><small>Hutan vs bukan hutan sama</small><b>${nf(B.sesuai_hutan_persen, 1)}%</b></div><div><small>Luas hutan: lokal / KLHK</small><b>${nf(B.hutan_lokal_ha, 1)} / ${nf(B.hutan_klhk_ha, 1)} ha</b></div></div>
        <div class="fa-scroll"><table class="kb-t"><tr><th>Kelas (kode KLHK)</th><th>${esc(I.singkat || 'Lokal')} ${y} (ha)</th><th>KLHK ${y} (ha)</th><th>Selisih (ha)</th></tr>${K.map(k => { const a = B.luas_lokal[k] || 0, b = B.luas_klhk[k] || 0; return `<tr><td>${esc(NAMA[k] || k)}</td><td class="n">${nf(a)}</td><td class="n">${nf(b)}</td><td class="n">${a - b > 0 ? '+' : ''}${nf(a - b)}</td></tr>`; }).join('')}</table></div>
        <div class="fa-scroll" style="margin-top:8px"><table class="kb-t"><tr><th>Peta lokal</th><th>Peta KLHK</th><th>Luas (ha)</th></tr>${B.matriks.filter(m => m[2] >= 0.5).sort((p, q) => q[2] - p[2]).map(m => `<tr><td>${esc(NAMA[m[0]] || m[0])}</td><td>${esc(NAMA[m[1]] || m[1])}</td><td class="n" style="${m[0] === m[1] ? 'color:#166534;font-weight:700' : ''}">${nf(m[2])}</td></tr>`).join('')}</table></div>`; }).join('') +
      `<p class="fa-note">Tumpang-susun kedua peta di dalam batas Hutan Desa (UTM 49N). Peta KLHK berskala 1:250.000 (unit pemetaan minimum ±6,25 ha), sedangkan peta lokal didigitasi rinci dari citra 30 m + citra resolusi tinggi dan dicek lapangan; karena itu peta lokal dipakai sebagai sumber utama untuk Hutan Desa ini dan peta KLHK sebagai pembanding.</p>`; });
  Promise.all([fetch('data/klasifikasi/model.json', { cache: 'no-cache' }).then(r_ => r_.ok ? r_.json() : null).catch(() => null), fetch(`data/klasifikasi/${x.id}.json`, { cache: 'no-cache' }).then(r_ => r_.ok ? r_.json() : null).catch(() => null)]).then(([Mo, Kl]) => {
    const el = out.querySelector('#tuKl'); if (!el) return; if (!Mo || !Kl) { el.innerHTML = '<p class="fa-note">Hasil klasifikasi citra belum tersedia.</p>'; return; }
    const Y = Object.keys(Kl.tahun).filter(y => Kl.tahun[y].status === 'selesai').sort(), K = [...new Set(Y.flatMap(y => Object.keys(Kl.tahun[y].luas_ha)))].sort((a, b) => (Kl.tahun[Y[Y.length - 1]].luas_ha[b] || 0) - (Kl.tahun[Y[Y.length - 1]].luas_ha[a] || 0));
    const pct = v => v == null ? '–' : nf(v * 100, 1) + '%';
    el.innerHTML = `<div class="fa-kpi"><div><small>Akurasi keseluruhan (uji wilayah terpisah)</small><b>${pct(Mo.akurasi_keseluruhan)}</b></div><div><small>Kappa</small><b>${nf(Mo.kappa, 2)}</b></div><div><small>Akurasi hutan vs bukan hutan</small><b>${pct(Mo.akurasi_hutan_bukan_hutan)}</b></div><div><small>Sampel latih / uji</small><b>${nf(Mo.sampel_latih, 0)} / ${nf(Mo.sampel_uji, 0)}</b></div></div>
      ${Object.keys(Mo.akurasi_per_sumber_label || {}).length ? `<p class="fa-note">Akurasi per sumber label: ${Object.entries(Mo.akurasi_per_sumber_label).map(([k, v]) => `${esc(k)} ${pct(v.akurasi)} (${nf(v.n_uji, 0)} piksel uji)`).join(' · ')}.</p>` : ''}
      <div class="fa-scroll"><table class="kb-t"><tr><th>Kelas (kode KLHK)</th>${Y.map(y => `<th>${y} (ha)</th>`).join('')}<th>Akurasi pembuat</th><th>Akurasi pengguna</th></tr>${K.map(k => `<tr><td>${esc(NAMA[k] || k)}</td>${Y.map(y => `<td class="n">${nf(Kl.tahun[y].luas_ha[k] || 0)}</td>`).join('')}<td class="n">${pct(Mo.akurasi_pembuat[k])}</td><td class="n">${pct(Mo.akurasi_pengguna[k])}</td></tr>`).join('')}
        <tr class="tot"><td>Terpetakan (tanpa awan)</td>${Y.map(y => `<td class="n">${nf(Kl.tahun[y].cerah_persen, 1)}%</td>`).join('')}<td></td><td></td></tr></table></div>
      <p class="fa-note">Model Random Forest dilatih dari ${nf(Mo.sampel_latih, 0)} piksel sampel (rona 6 kanal Sentinel-2, indeks vegetasi/air/kelembapan, tekstur 5×5, ketinggian & lereng) yang diambil dari bagian dalam poligon Peta Penutupan Lahan KLHK 2025 dan peta PRCF 2025 (Nanga Lauk). Akurasi dihitung pada blok wilayah 2 km yang tidak dipakai melatih. Angka ini pembanding mandiri dari citra – bukan pengganti peta resmi; kelas yang mirip secara spektral (mis. semak vs pertanian campur semak) paling sering tertukar.</p>`; });
  PB().then(J => { const el = out.querySelector('#tuPb'), L = J && J.lokasi && J.lokasi[x.id]; if (!el) return; if (!L) { el.innerHTML = '<p class="fa-note">Data pembanding belum tersedia.</p>'; return; }
    const Y = Object.keys(L.tahun).sort(), K = [...new Set(Y.flatMap(y => Object.keys(L.tahun[y])))].filter(k => Y.some(y => L.tahun[y][k] > 0.5)).sort((a, b) => (L.tahun[Y[Y.length - 1]][b] || 0) - (L.tahun[Y[Y.length - 1]][a] || 0));
    el.innerHTML = `<div class="fa-scroll"><table class="kb-t"><tr><th>Kelas (9 kelas global)</th>${Y.map(y => `<th>${y}</th>`).join('')}<th>Perubahan ${Y[0]}–${Y[Y.length - 1]}</th></tr>${K.map(k => { const a = L.tahun[Y[0]][k] || 0, b = L.tahun[Y[Y.length - 1]][k] || 0; return `<tr><td>${esc(k)}</td>${Y.map(y => `<td class="n">${nf(L.tahun[y][k] || 0, 1)}</td>`).join('')}<td class="n">${b - a > 0 ? '+' : ''}${nf(b - a, 1)}</td></tr>`; }).join('')}</table></div>
      <p class="fa-note">Sumber: Impact Observatory, Microsoft & Esri – 10m Annual Land Use Land Cover V2 (Sentinel-2, CC BY 4.0). Peta ini dibuat ulang setiap tahun secara terpisah sehingga dapat dipakai memeriksa silang tren di atas. Kelasnya berbeda dengan KLHK (mis. ladang bera/semak berpohon dihitung "Pohon"), dan angka per tahun dapat naik-turun karena awan atau banjir musiman (air ↔ vegetasi tergenang di rawa) – bukan berarti lahan berubah. Akurasi global ±75–85%; dipakai sebagai pembanding, bukan pengganti peta resmi KLHK.</p>`; });
  out.querySelector('#tuKb').onclick = () => window.FHKarbon && FHKarbon.open({ sumber: I.id, y0, y1 });
  const B = () => ({ nama, per, y0, y1, G, src, slug, info: I });
  out.querySelector('#tuCsv').onclick = () => { const R = [['hutan_desa', 'sumber_peta', 'bagian', 'kode_klhk', 'kelas', 'tahun', 'luas_ha']];
    G.kode.forEach(k => { R.push([nama, I.nama, 'luas', k, NAMA[k], 'awal ' + ya, (G.awal[k] || 0).toFixed(4)]); G.tahun.forEach(([y, o]) => R.push([nama, I.nama, 'luas', k, NAMA[k], y, (o[k] || 0).toFixed(4)])); });
    G.akt.forEach(a => BA.forEach(([l, k]) => R.push([nama, I.nama, 'perubahan tahunan', '', l, a.y, a[k].toFixed(4)])));
    G.ubah.forEach(([a, b, v, j]) => R.push([nama, I.nama, 'perubahan ' + per, a + '>' + b, (NAMA[a] || a) + ' → ' + (NAMA[b] || b) + ' (' + (JENIS[j] || j) + ')', per, v.toFixed(4)]));
    A.dl(new Blob([A.csv(R.map((r, i) => i ? r.map(v => T_(v)) : r.map(h => A.EN() && window.FHLang ? FHLang.kolom(h) : h)))], { type: 'text/csv' }), fn(B(), 'csv')); };
  const peta_ = () => lok ? petaLokal(cur, G.M, y1, ya) : petaTahun(cur, y1, y0);
  const trp = f => ({ type: 'Feature', geometry: f.geometry, properties: Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [k, typeof v === 'string' ? T_(v) : v])) });
  out.querySelector('#tuGeo').onclick = async () => { const P = cur && await peta_(); if (!P) return A.toast('Peta tahunan belum tersedia.');
    A.dl(new Blob([JSON.stringify({ type: 'FeatureCollection', name: `tutupan_${slug}_${y1}`, features: P.fitur.map(trp) })], { type: 'application/geo+json' }), `${A.EN() ? 'land_cover' : 'tutupan_lahan'}_${src}_${slug}_${y1}.geojson`); A.pakai('tutupan_geojson'); };
  out.querySelector('#tuShp').onclick = async e => { const bt = e.currentTarget; bt.disabled = true; try { const P = cur && await peta_(); if (!P) return A.toast('Peta tahunan belum tersedia.'); if (!window.FHShp) await A.lib('assets/shp.js?v=61');
      const F = P.fitur.map(trp), tot = P.fitur.reduce((a, f) => a + f.properties.LUAS_HA, 0), nm = `tutupan_lahan_${slug}_${y1}`, L_ = [{ nama: nm, fitur: F, kolom: P.kolom || KOLOM }];
      const U = P.ubah ? P.ubah.map(trp) : F.filter((f, i) => P.fitur[i].properties.UBAH_PER === 'Ya'); if (U.length) L_.push({ nama: `perubahan_${slug}_${ya === y1 ? y1 : (lok ? ya : y0) + '-' + y1}`, fitur: U, kolom: P.ubah ? KOLOM_UBAH : KOLOM });
      const ring = ['kode_klhk;kelas;luas_poligon_ha;luas_tabel_aplikasi_ha'].concat(G.kode.map(k => [k, NAMA[k], P.fitur.filter(f => f.properties.KODE_PL === k).reduce((a, f) => a + f.properties.LUAS_HA, 0).toFixed(4), (G.akhir[k] || 0).toFixed(4)].join(';'))).join('\r\n');
      A.dl(await FHShp.zip(L_, { [`BACA_${slug}_${y1}.txt`]: lok ? BACA_L(cur, G, y1, per, F.length, tot) : BACA(cur, y1, per, F.length, tot, G.t), [`ringkasan_luas_${slug}_${y1}.csv`]: ring }), `${A.EN() ? 'land_cover_SHP' : 'SHP_tutupan_lahan'}_${src}_${slug}_${y1}.zip`); A.pakai('tutupan_shp'); }
    catch (er) { A.toast(er.message); } finally { bt.disabled = false; } };
  out.querySelector('#tuXl').onclick = () => excel(B()).catch(e => A.toast(e.message));
  out.querySelector('#tuDoc').onclick = () => word(B()).catch(e => A.toast(e.message));
  out.querySelector('#tuPdf').onclick = () => pdf(B()).catch(e => A.toast(e.message));
}
/* ---------- peta lokal tahun Y + poligon perubahan ya→Y (data/tutupan_lokal) ---------- */
const KOLOM_L = [['HD_NAMA', 'C', 60], ['LPHD', 'C', 60], ['TAHUN', 'N', 4, 0], ['KODE_PL', 'N', 6, 0], ['KELAS', 'C', 80], ['KELAS_ASLI', 'C', 60], ['KELOMPOK', 'C', 12], ['TIPE_FREL', 'C', 60], ['C_TCHA', 'N', 10, 4], ['SUMBER', 'C', 80], ['LUAS_HA', 'N', 14, 4]];
const KOLOM_UBAH = [['HD_NAMA', 'C', 60], ['TH_AWAL', 'N', 4, 0], ['TH_AKHIR', 'N', 4, 0], ['KODE_DARI', 'N', 6, 0], ['KELAS_DARI', 'C', 80], ['KODE_KE', 'N', 6, 0], ['KELAS_KE', 'C', 80], ['JENIS', 'C', 30], ['SUMBER', 'C', 80], ['LUAS_HA', 'N', 14, 4]];
async function petaLokal(s, M, Y, ya) {
  const [P, U] = await Promise.all([M.peta(Y), ya < Y ? M.ubah(ya, Y) : null]); if (!P) return null; const I = M.info || {}, ka = I.kelas_asli || {}, src = I.singkat || I.nama || '';
  const fitur = P.features.map(f => { const k = f.properties.kode, fr = FREL_T[k];
    return { type: 'Feature', geometry: f.geometry, properties: { HD_NAMA: s.hd_nama, LPHD: s.lphd || '', TAHUN: Y, KODE_PL: k, KELAS: NAMA[k] || String(k), KELAS_ASLI: ka[k] || '', KELOMPOK: HUTAN.has(k) ? 'Hutan' : 'Bukan hutan',
      TIPE_FREL: fr ? fr[0] : '-', C_TCHA: fr ? +(fr[1] * 0.47).toFixed(4) : null, SUMBER: src, LUAS_HA: f.properties.luas_ha } }; });
  const ubah = U ? U.features.map(f => { const p = f.properties; return { type: 'Feature', geometry: f.geometry, properties: { HD_NAMA: s.hd_nama, TH_AWAL: p.a, TH_AKHIR: p.b, KODE_DARI: p.dari, KELAS_DARI: NAMA[p.dari] || String(p.dari), KODE_KE: p.ke, KELAS_KE: NAMA[p.ke] || String(p.ke),
    JENIS: JENIS[FHModelKLHK.jenis(p.dari, p.ke)] || '', SUMBER: src, LUAS_HA: p.luas_ha } }; }) : [];
  return { fitur, ubah, kolom: KOLOM_L };
}
const BACA_L = (s, G, Y, per, n, tot) => { const I = G.M.info || {}; return [`Peta tutupan lahan ${s.hd_nama} – tahun ${Y}` + (per ? ` (periode ${per}; perubahan dibandingkan peta ${G.ya})` : ''), `Dibuat oleh aplikasi Fire Hotspot – Yayasan PRCF Indonesia, ${X().wib(Date.now())}`, '',
  `Jumlah poligon: ${n} · total luas: ${nf(tot, 4)} ha · sistem koordinat: WGS 1984 (EPSG:4326); luas dihitung pada WGS 1984 UTM 49N`, '', `Sumber: ${I.sumber || ''}.`, `Metode: ${I.metode || ''}`, I.groundcheck ? `Groundcheck: ${I.groundcheck}` : '', '',
  'Kolom lapisan tutupan_lahan: HD_NAMA, LPHD, TAHUN, KODE_PL / KELAS (kode & nama kelas penutupan lahan KLHK padanannya), KELAS_ASLI (nama kelas pada peta sumber), KELOMPOK (hutan / bukan hutan), TIPE_FREL & C_TCHA (tipe & cadangan karbon tC/ha rumus FREL), SUMBER, LUAS_HA.',
  'Kolom lapisan perubahan: TH_AWAL, TH_AKHIR, KODE_DARI / KELAS_DARI, KODE_KE / KELAS_KE, JENIS (Deforestasi / Degradasi / Regenerasi / Suksesi / Antar kelas bukan hutan), SUMBER, LUAS_HA.', '',
  'Luas sama dengan tabel aplikasi dan dengan alat Emisi karbon (satu basis data).'].filter(x => x !== null).join('\r\n'); };
async function peta(id, G, Y, y0) {
  const el = document.getElementById('tuMap'); if (!el || !window.L) return; if (MAP) { try { MAP.remove(); } catch (e) { } MAP = null; }
  const m = L.map(el, { zoomControl: true }); MAP = m; L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 17, attribution: G.lok ? 'Esri, Maxar · PRCF' : 'Esri, Maxar · KLHK' }).addTo(m);
  const sx = (window.FHSites ? FHSites() : []).find(q => q.id === id), Bs = [];
  if (G.lok) { const PT = sx ? await petaLokal(sx, G.M, Y, G.ya) : null;
    if (PT) { L.geoJSON({ type: 'FeatureCollection', features: PT.fitur }, { style: f => ({ color: '#222', weight: .5, fillColor: WARNA[f.properties.KODE_PL] || '#999', fillOpacity: .62 }),
        onEachFeature: (f, l) => { const p = f.properties; l.bindPopup(`<b>${esc(T_(p.KELAS))}</b><br>${esc(p.KELAS_ASLI)} · ${Y}<br>${nf(p.LUAS_HA, 4)} ha<br><small>${esc(T_(p.SUMBER))}</small>`); } }).addTo(m);
      if (PT.ubah.length) L.geoJSON({ type: 'FeatureCollection', features: PT.ubah }, { style: () => ({ color: '#FF1F1F', weight: 2, fill: false }), onEachFeature: (f, l) => { const p = f.properties; l.bindPopup(`<b>${esc(T_(p.JENIS))}</b><br>${esc(T_(p.KELAS_DARI))} → ${esc(T_(p.KELAS_KE))}<br>${p.TH_AWAL}–${p.TH_AKHIR} · ${nf(p.LUAS_HA, 4)} ha`); } }).addTo(m); } }
  else { const PT = Y && sx ? await petaTahun(sx, Y, y0) : null;
    if (PT) L.geoJSON({ type: 'FeatureCollection', features: PT.fitur }, { style: f => ({ color: f.properties.UBAH_PER === 'Ya' ? '#FF1F1F' : '#222', weight: f.properties.UBAH_PER === 'Ya' ? 2 : .5, fillColor: WARNA[f.properties.KODE_PL] || '#999', fillOpacity: .62 }),
      onEachFeature: (f, l) => { const p = f.properties; l.bindPopup(`<b>${esc(T_(p.KELAS))}</b><br>KLHK ${p.KODE_PL} · ${T_('akhir')} ${Y}<br>${esc(T_(p.STATUS))}${p.TH_UBAH ? ' · ' + p.TH_UBAH : ''}<br>${nf(p.LUAS_HA, 4)} ha<br><small>${esc(T_(p.SUMBER))}</small>`); } }).addTo(m);
    else { const g = await muatPeta(id, G.t); if (g) L.geoJSON(g, { style: f => ({ color: '#222', weight: .6, fillColor: WARNA[f.properties.kode] || '#999', fillOpacity: .62 }), onEachFeature: (f, l) => l.bindPopup(`<b>${esc(T_(NAMA[f.properties.kode] || f.properties.kelas))}</b><br>KLHK ${f.properties.kode} · ${G.t}`) }).addTo(m); } }
  if (sx && sx.hd) { const o = L.geoJSON(sx.hd, { style: { color: '#FFD84D', weight: 2.6, fill: false } }).addTo(m); Bs.push(o.getBounds()); }
  if (Bs.length) m.fitBounds(Bs[0], { padding: [14, 14] }); setTimeout(() => m.invalidateSize(), 300);
}
const METODE_KLHK = ['Keterbatasan: kelas KLHK hanya berubah bila tutupan pohon hilang di kelas hutan (data Hansen). Kehilangan pohon di lahan yang sudah bukan hutan (ladang, semak, rawa) dicatat terpisah per tahun tetapi tidak mengubah kelas; pertumbuhan kembali (regenerasi) dan perubahan antar-kelas bukan hutan (mis. ladang → kebun) belum terekam karena acuan resmi yang tersedia baru Peta KLHK 2020. Peta KLHK tahunan (PL 2021–2024) akan dipakai langsung bila tersedia. Pembanding independen: peta tahunan Sentinel-2 10 m Impact Observatory/Esri (2017–2023).', 'Tahun sebelum 2020: acuan KLHK 2020 dengan piksel yang hilang sesudah tahun itu dikembalikan ke hutan sekunder (lahan kering atau rawa sesuai kelas acuan); piksel yang hilang sebelum 2020 tetapi masih dipetakan hutan oleh KLHK 2020 tidak diubah. Tahun berjalan (mis. 2026): perubahan dari citra Sentinel-2 20 m (indikasi), menunggu rilis data tahunan Hansen.', 'Acuan tutupan lahan: Peta Penutupan Lahan resmi KLHK (Direktorat IPSDH, Ditjen PKTL) skala 1:250.000 – PL_2020_AR_250K Provinsi Kalimantan Barat, kolom kode_pl; luas dihitung di dalam batas Hutan Desa pada grid 30 m (luas piksel geodesik).',
  'Perubahan tahunan: kehilangan tutupan pohon Hansen/UMD Global Forest Change v1.13 (tajuk tahun 2000 ≥ 30%). Kehilangan di Hutan Lahan Kering Primer → Hutan Lahan Kering Sekunder dan Hutan Rawa Primer → Hutan Rawa Sekunder (degradasi); di Hutan Lahan Kering Sekunder → Pertanian Lahan Kering Campur Semak dan Hutan Rawa Sekunder → Belukar Rawa (deforestasi).',
  'Kehilangan di kelas bukan hutan (ladang, semak, perkebunan, dll.) tidak mengubah kelas. Kondisi akhir tahun Y = peta acuan dengan semua perubahan dari tahun peta s.d. Y; kondisi awal periode = s.d. tahun sebelum tahun awal.',
  'Peta 1:250.000 lebih kasar daripada piksel 30 m (unit pemetaan minimum KLHK ±6,25 ha), sehingga batas kelas di tepi poligon bersifat perkiraan. Tutupan lahan yang sama dipakai untuk perhitungan emisi karbon FREL.'];
function metode(G) {
  const I = (G.M && G.M.info) || {};
  if (!G.lok) return [`Sumber peta: ${I.nama || 'Peta resmi KLHK + Hansen'}.`].concat(METODE_KLHK.map(x => TX(x, G.t)));
  return [`Sumber peta: ${I.nama}. ${I.sumber}.`, `Metode pemetaan: ${I.metode}`, I.groundcheck ? `Groundcheck lapangan: ${I.groundcheck}` : null,
    `Kelas peta sumber dipadankan dengan kode Penutupan Lahan KLHK: ${Object.entries(I.kelas_asli || {}).map(([k, v]) => `${v} = ${k} (${NAMA[k] || k})`).join('; ')}.`,
    'Perubahan tahun y = tumpang-susun (overlay) peta tahun y−1 dan y. Deforestasi = hutan → bukan hutan; degradasi = hutan primer → sekunder; regenerasi = bukan hutan → hutan; suksesi = air / lahan terbuka → semak & vegetasi. Matriks periode = tumpang-susun peta awal & akhir (perubahan bersih).',
    'Data aktivitas yang sama (luas awal, deforestasi, degradasi per tahun) dipakai alat Emisi karbon FREL, sehingga tutupan lahan & emisi selalu sejalan. Regenerasi dilaporkan terpisah dan tidak mengurangi emisi.',
    `Keterbatasan: interpretasi visual citra 30 m (perubahan di bawah ±0,1 ha dapat tidak terpetakan); tahun sebelum ${G.M.yMin} tidak tersedia pada sumber ini – gunakan sumber pembanding (model KLHK 2020 + Hansen) untuk tahun lebih awal.`].filter(Boolean);
}
const fn = (B, ext) => `${X().EN() ? 'land_cover' : 'tutupan_lahan'}_${B.src}_${B.slug}_${B.per.replace('–', '-')}.${ext}`;
const rowsRing = G => G.kode.map(k => [NAMA[k] || String(k), String(k), nf(G.awal[k] || 0), nf(G.akhir[k] || 0), nf((G.akhir[k] || 0) - (G.awal[k] || 0)), nf((G.akhir[k] || 0) / G.luas * 100) + '%']);
const rowsUb = G => G.ubah.map(([a, b, v, j]) => [NAMA[a] || String(a), NAMA[b] || String(b), JENIS[j] || j, nf(v, 4)]);
const rowsMat = G => (G.mat || []).filter(m => m.dari !== m.ke).map(m => [NAMA[m.dari] || String(m.dari), NAMA[m.ke] || String(m.ke), JENIS[m.jenis] || m.jenis, nf(m.ha, 4)]);
async function excel(B) {
  const A = X(), G = B.G; await A.lib('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); wb.creator = 'Yayasan PRCF Indonesia – Fire Hotspot';
  const HD = { font: { name: 'Segoe UI Semibold', color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E3D' } }, alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' } };
  const sheet = (nm, head, rows, w) => { const s = wb.addWorksheet(nm); s.addRow(head.map(T_)); s.getRow(1).eachCell(c => Object.assign(c, HD)); s.getRow(1).height = 32; rows.forEach(r => s.addRow(r.map(v => typeof v === 'string' ? T_(v) : v))); s.columns.forEach((c, i) => { c.width = (w && w[i]) || 16; }); s.eachRow((r, i) => r.eachCell(c => { c.font = Object.assign({ name: 'Segoe UI', size: 10 }, i === 1 ? { name: 'Segoe UI Semibold', color: { argb: 'FFFFFFFF' } } : {}); c.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } }; if (typeof c.value === 'number') c.numFmt = '#,##0.0000'; })); return s; };
  sheet('Ringkasan', ['Hutan Desa', 'Sumber peta', 'Kelas penutupan lahan (kode KLHK)', 'Kode KLHK', `Awal (${G.ya}) (ha)`, `Akhir ${B.y1} (ha)`, 'Perubahan (ha)'], G.kode.map(k => [B.nama, B.info.nama, NAMA[k] || String(k), k, +(G.awal[k] || 0).toFixed(4), +(G.akhir[k] || 0).toFixed(4), +((G.akhir[k] || 0) - (G.awal[k] || 0)).toFixed(4)]), [28, 40, 38, 11, 15, 15, 15]);
  sheet('Per Tahun', ['Kelas / perubahan', `Awal (${G.ya})`, ...G.tahun.map(([y]) => String(y))], G.kode.map(k => [NAMA[k] || String(k), +(G.awal[k] || 0).toFixed(4), ...G.tahun.map(([, o]) => +(o[k] || 0).toFixed(4))]).concat(barisAkt(G).map(([l, k]) => [l + ' (ha)', '', ...G.akt.map(a => +a[k].toFixed(4))])), [44]);
  sheet('Perubahan', ['Dari', 'Menjadi', 'Jenis', `Jumlah perubahan tahunan ${B.per} (ha)`], G.ubah.map(([a, b, v, j]) => [NAMA[a] || String(a), NAMA[b] || String(b), JENIS[j] || j, +v.toFixed(4)]), [34, 38, 22, 22]);
  if (G.mat) sheet('Matriks', [`${G.ya} → ${B.y1}: dari`, 'menjadi', 'Jenis', 'Luas (ha)'], G.mat.map(m => [NAMA[m.dari] || String(m.dari), NAMA[m.ke] || String(m.ke), JENIS[m.jenis] || m.jenis, +m.ha.toFixed(4)]), [34, 38, 22, 14]);
  sheet('Metode', ['Metode & sumber'], metode(G).map(m => [m]), [150]);
  A.dl(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fn(B, 'xlsx'));
}
async function word(B) {
  const A = X(), G = B.G; await A.lib(A.DOCX); const d = window.docx, run = (t, o = {}) => new d.TextRun({ text: T_(t), font: 'Arial', size: o.size || 20, bold: o.bold, color: o.color }), p = (t, o = {}) => new d.Paragraph({ children: [run(t, o)], spacing: { after: 120 } });
  const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 17, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1F4E3D' } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 } });
  const tbl = (H, R) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: H.map(h => cell(h, true)) }), ...(R.length ? R : [H.map(() => '–')]).map(r => new d.TableRow({ children: r.map(c => cell(String(c))) }))] });
  const yrs = G.akt.map(a => [String(a.y), ...barisAkt(G).map(([, k]) => nf(a[k], 4))]);
  const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Fire Hotspot', sections: [{ children: [p('Tutupan Lahan ' + B.nama, { bold: true, size: 34, color: '1F4E3D' }), p(`Periode ${B.per} · sumber peta: ${B.info.nama}`, { color: '55665D' }),
    p('1. Luas per kelas', { bold: true, size: 26 }), tbl(['Kelas (kode KLHK)', 'Kode', `Awal (${G.ya}) (ha)`, `Akhir ${B.y1} (ha)`, 'Perubahan (ha)', '% luas'], rowsRing(G)), p(''),
    p('2. Perubahan per tahun (ha)', { bold: true, size: 26 }), tbl(['Tahun', ...barisAkt(G).map(([l]) => l)], yrs), p(''),
    p('3. Perubahan kelas (jumlah tahunan)', { bold: true, size: 26 }), tbl(['Dari', 'Menjadi', 'Jenis', 'Luas (ha)'], rowsUb(G)), p(''),
    ...(G.mat ? [p(`4. Matriks perubahan bersih ${G.ya} → ${B.y1}`, { bold: true, size: 26 }), tbl(['Dari', 'Menjadi', 'Jenis', 'Luas (ha)'], rowsMat(G)), p('')] : []),
    p('Metode & sumber', { bold: true, size: 24 }), ...metode(G).map(m => p('• ' + m, { size: 18, color: '55665D' })), p(`Fire Hotspot · Yayasan PRCF Indonesia · ${A.wib(Date.now())}`, { size: 16, color: '888888' })] }] });
  A.dl(await d.Packer.toBlob(doc), fn(B, 'docx'));
}
async function pdf(B) {
  const A = X(), G = B.G; await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }); if (window.FHLang) FHLang.pdf(doc);
  const a = s => String(s).replace(/[–—]/g, '-').replace(/→/g, '->');
  doc.setFillColor(31, 78, 61); doc.rect(0, 0, 210, 28, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(a('Tutupan Lahan ' + B.nama), 16, 12); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(doc.splitTextToSize(a(`Periode ${B.per} · sumber peta: ${B.info.nama}`), 180), 16, 19); doc.setTextColor(20);
  const T = (y, h, b, c) => { doc.autoTable({ startY: y, head: [h.map(a)], body: b.map(r => r.map(a)), theme: 'grid', headStyles: { fillColor: c || [31, 78, 61], fontSize: 7.5 }, styles: { fontSize: 7.5 }, margin: { left: 16, right: 16 } }); return doc.lastAutoTable.finalY + 6; };
  let y = T(34, ['Kelas (kode KLHK)', 'Kode', `Awal (${G.ya}) (ha)`, `Akhir ${B.y1} (ha)`, 'Perubahan (ha)', '% luas'], rowsRing(G));
  y = T(y, ['Tahun', ...barisAkt(G).map(([l]) => l)], G.akt.map(r => [String(r.y), ...barisAkt(G).map(([, k]) => nf(r[k], 4))]), [71, 85, 105]);
  if (G.ubah.length) y = T(y, ['Dari', 'Menjadi', 'Jenis', 'Luas (ha)'], rowsUb(G), [180, 83, 9]);
  if (G.mat) y = T(y, [`${G.ya} -> ${B.y1}: dari`, 'Menjadi', 'Jenis', 'Luas (ha)'], rowsMat(G), [21, 128, 61]);
  doc.setFontSize(8); doc.setTextColor(80); metode(G).map(a).forEach(t => { const Ls = doc.splitTextToSize(t, 178); if (y + Ls.length * 3.6 > 285) { doc.addPage(); y = 20; } doc.text(Ls, 16, y); y += Ls.length * 3.6 + 1.5; });
  doc.save(fn(B, 'pdf'));
}
window.FHTutupan = { open, hitung, NAMA, petaTahun, petaLokal, kelasTahun, KOLOM, KOLOM_L, KOLOM_UBAH, metode };
})();
