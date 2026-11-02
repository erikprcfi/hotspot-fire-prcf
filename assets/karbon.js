/* Fire Hotspot – EMISI KARBON (FREL) per Hutan Desa, periode & tahun pilihan
 * Rumus & tata letak SAMA dengan templat "PERHITUNGAN KARBON" PRCF (sheet Parameter – Awal – Manfaat):
 *   Parameter : kepadatan karbon FREL 2022 (biomassa AGB+BGB × 0,47; hutan = nilai Kalimantan, non-hutan = nasional),
 *               keefektifan proyek 90%, kebocoran 5%, penyangga risiko 13,5%, faktor konversi C→CO2 = 44/12
 *   Awal      : per kelas hutan: luas awal (D), deforestasi (E), degradasi (F), luas akhir C = D−E−F (+F primer pada baris sekunder),
 *               % tahunan G = E/(D×periode), H = F/(D×periode), pengurangan cadangan C: I = stok hutan − stok lahan terdeforestasi,
 *               J = stok primer − stok sekunder, K = E×I + F×J
 *   Manfaat   : D3 = ΣK × 44/12, C3 = D3 × periode proyek, D4 = D3×(1−keefektifan), D5 = (D3−D4)×kebocoran, D6 = D3−D4−D5,
 *               D7 = D6×penyangga, D8 = D6−D7; luas terlindungi = ΣC×keefektifan; luas dicegah = ΣE (atau ΣF)×(keefektifan−kebocoran);
 *               per hektare: Awal = K/C×44/12, Proyek = Awal×(1−keef.), Kebocoran = (Awal−Proyek)×kebocoran, Manfaat, Penyangga, Dapat dijual.
 * Data aktivitas (luas awal D, deforestasi E, degradasi F) berasal dari BASIS DATA TUTUPAN LAHAN yang sama dengan alat Tutupan lahan
 * (assets/model_klhk.js → FHModelKLHK.muat): peta tahunan lokal yang sudah di-groundcheck (mis. PRCF Nanga Lauk 2006–2026) bila ada,
 * selain itu model KLHK 2020 + Hansen GFC v1.13. Sumber yang dipakai tertulis di layar & semua ekspor. Tidak ada angka yang dikarang.
 * Ekspor: Excel (.xlsx, rumus hidup, tata letak templat), Word & PDF. Ringkasannya juga dapat disertakan di laporan umum (FHKarbon.ringkas).
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const BASE = { hlk_primer: 420.41, hlk_sekunder: 287.55, hr_primer: 347.81, hr_sekunder: 263.17, plk_semak: 77.56, belukar_rawa: 23.91 };   // biomassa FREL 2022 (t/ha)
const FK = 0.47, KC = 44 / 12;
const KELAS = ['Hutan Lahan Kering Primer', 'Hutan Lahan Kering Sekunder', 'Hutan Rawa Primer', 'Hutan Rawa Sekunder'];
const EPOCH = [2000, 2005, 2010, 2015, 2020], Y_MIN = 2001; let Y_MAX = 2025;
const CACHE = {};
const muat = id => CACHE[id] || (CACHE[id] = fetch(`data/analisis/${id}_hd.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(id); return r.json(); }));

/* ---------- inti perhitungan (identik dengan rumus Excel) ---------- */
function param(o) {
  const C = {}; Object.keys(BASE).forEach(k => C[k] = BASE[k] * FK);
  return { n: o.y1 - o.y0 + 1, proj: o.proj || (o.y1 - o.y0 + 1), C, eff: o.eff, leak: o.leak, buf: o.buf, kc: KC };
}
function awalHD(R, y0, y1, ci) {   // → 4 baris {D, E, F}: model tutupan lahan KLHK (acuan) + citra tiap tahun; cadangan: data dasar FREL lama
  if (window.FHModelKLHK && R.emisi_frel && R.emisi_frel.hilang_kode_ha) { const M = window.FHModelKLHK.buat(R.emisi_frel, ci); if (M) return M.awal(y0, y1); }
  const F = R.emisi_frel; if (!F || !F.dasar) return null;
  let klhk = F.sumber_kelas === 'KLHK', DS = F.dasar;
  let cand = Object.keys(DS).map(Number).sort((a, b) => a - b).filter(t => klhk ? t <= y0 : t <= y0 - 1);
  if (klhk && !cand.length && F.dasar_glclu) { klhk = false; DS = F.dasar_glclu; cand = Object.keys(DS).map(Number).sort((a, b) => a - b).filter(t => t <= y0 - 1); }   // belum ada peta KLHK ≤ tahun awal
  if (!cand.length) cand = Object.keys(DS).map(Number).sort((a, b) => a - b).slice(0, 1);
  const e = cand[cand.length - 1], B = DS[String(e)]; if (!B) return null;
  const L = B.hilang_ha || {}, sumL = (j, a, b) => { let s = 0; for (let y = a; y <= b; y++) s += ((L[String(y)] || [])[j] || 0); return s; };
  const D = [0, 1, 2, 3].map(j => Math.max(0, B.luas_ha[j] - sumL(j, e + 1, y0 - 1)));
  const loss = [0, 1, 2, 3].map(j => sumL(j, y0, y1)), nh = sumL(4, y0, y1);
  const tahun = []; for (let y = y0; y <= y1; y++) tahun.push([y, ...[0, 1, 2, 3, 4].map(j => (L[String(y)] || [])[j] || 0)]);
  // primer (0, 2): kehilangan = degradasi (kolom F); sekunder (1, 3): kehilangan = deforestasi (kolom E)
  return { epoch: e, sumber: klhk ? 'KLHK' : 'GLCLU', tutupan: F.tutupan_klhk_ha && F.tutupan_klhk_ha[String(e)] || null, nh, tahun, rows: [{ D: D[0], E: 0, F: loss[0] }, { D: D[1], E: loss[1], F: 0 }, { D: D[2], E: 0, F: loss[2] }, { D: D[3], E: loss[3], F: 0 }] };
}
function hitungHD(a, P) {
  const C = P.C, I = [C.hlk_primer - C.plk_semak, C.hlk_sekunder - C.plk_semak, C.hr_primer - C.belukar_rawa, C.hr_sekunder - C.belukar_rawa], J = [C.hlk_primer - C.hlk_sekunder, 0, C.hr_primer - C.hr_sekunder, 0];
  const r = a.rows.map((x, j) => { const Cend = x.D - x.E - x.F + (j === 1 ? a.rows[0].F : j === 3 ? a.rows[2].F : 0);
    return { ...x, C: Cend, G: x.D === 0 ? 0 : x.E / (x.D * P.n), H: x.D === 0 ? 0 : x.F / (x.D * P.n), I: I[j], J: J[j], K: x.E * I[j] + x.F * J[j] }; });
  const sK = r.reduce((s, x) => s + x.K, 0), m = {};
  m.d3 = sK * P.kc; m.c3 = m.d3 * P.proj; m.d4 = m.d3 * (1 - P.eff); m.c4 = m.d4 * P.proj; m.d5 = (m.d3 - m.d4) * P.leak; m.c5 = m.d5 * P.proj;
  m.d6 = m.d3 - m.d4 - m.d5; m.c6 = m.d6 * P.proj; m.d7 = m.d6 * P.buf; m.c7 = m.d7 * P.proj; m.d8 = m.d6 - m.d7; m.c8 = m.d8 * P.proj;
  m.c11 = r.reduce((s, x) => s + x.C, 0) * P.eff; m.d12 = r.reduce((s, x) => s + x.E, 0) * (P.eff - P.leak); m.c12 = m.d12 * P.proj; m.d13 = r.reduce((s, x) => s + x.F, 0) * (P.eff - P.leak); m.c13 = m.d13 * P.proj;
  const ha = r.map(x => { const aw = x.C ? x.K / x.C * P.kc : 0, pr = aw * (1 - P.eff), kb = (aw - pr) * P.leak, mf = aw - pr - kb, pg = mf * P.buf; return [aw, pr, kb, mf, pg, mf - pg]; });
  return { r, m, ha, sK };
}
function total(H, P) {   // kolom TOTAL (rumus templat: M3 = periode proyek × 44/12 × K total, dst.)
  const K = H.reduce((s, h) => s + h.sK, 0), C = H.reduce((s, h) => s + h.r.reduce((a, x) => a + x.C, 0), 0), E = H.reduce((s, h) => s + h.r.reduce((a, x) => a + x.E, 0), 0), F = H.reduce((s, h) => s + h.r.reduce((a, x) => a + x.F, 0), 0);
  const t = {}; t.m3 = P.proj * P.kc * K; t.n3 = t.m3 / P.proj; t.m4 = t.m3 * (1 - P.eff); t.n4 = t.m4 / P.proj; t.m5 = (t.m3 - t.m4) * P.leak; t.n5 = t.m5 / P.proj;
  t.m6 = t.m3 - t.m4 - t.m5; t.n6 = t.m6 / P.proj; t.m7 = t.m6 * P.buf; t.n7 = t.m7 / P.proj; t.m8 = t.m6 - t.m7; t.n8 = t.m8 / P.proj;
  t.m11 = C * P.eff; t.m12 = E * P.proj * (P.eff - P.leak); t.n12 = t.m12 / P.proj; t.m13 = F * P.proj * (P.eff - P.leak); t.n13 = t.m13 / P.proj; t.K = K; t.C = C; t.E = E; t.F = F;
  return t;
}
/* o = { lokasi: [id], y0, y1, eff, leak, buf, proj?, sumber? } – sumber = id sumber tutupan lahan (bawaan: sumber utama Hutan Desa itu) */
async function hitung(o) {
  const S = (window.FHSites ? FHSites() : []).filter(s => o.lokasi.includes(s.id)), MK = window.FHModelKLHK;
  const HD = await Promise.all(S.map(async s => {
    let M = null; try { M = MK ? await MK.muat(s.id, o.sumber) : null; } catch (e) { M = null; }
    if (M && M.info && M.info.lokal && !o.sumber && o.y1 < M.yMin + 1) { try { M = await MK.muat(s.id, 'klhk'); } catch (e) { } }   // periode di luar cakupan peta lokal → sumber pembanding
    if (M) { const lok = !!(M.info && M.info.lokal), y0 = Math.min(M.yMax, Math.max(lok ? M.yMin + 1 : Y_MIN, o.y0)), y1 = Math.min(M.yMax, Math.max(y0, o.y1));
      if (y0 !== o.y0 || y1 !== o.y1) { o.y0 = y0; o.y1 = y1; o.disesuaikan = true; }
      const a = M.awal(o.y0, o.y1); a.info = M.info; a.M = M; return { id: s.id, nama: s.hd_nama, a, info: M.info, M }; }
    const R = await muat(s.id).catch(() => null), a = R && awalHD(R, o.y0, o.y1); return a ? { id: s.id, nama: s.hd_nama, a, info: MK ? MK.SUMBER_KLHK : null } : { id: s.id, nama: s.hd_nama, kosong: true }; }));
  const P = param(o); HD.forEach(x => { if (!x.kosong) x.h = hitungHD(x.a, P); });
  const ok = HD.filter(x => !x.kosong);
  return { o, P, HD: ok, info: ok[0] && ok[0].info, kosong: HD.filter(x => x.kosong).map(x => x.nama), T: total(ok.map(x => x.h), P) };
}

/* ---------- tampilan ---------- */
const nf = (v, d = 2) => X().n1(v, d);
function sec(id, judul, sub, isi, buka) { return `<div class="kb-sec${buka ? ' open' : ''}" id="${id}"><button type="button" class="kb-h" aria-expanded="${!!buka}"><span><b>${judul}</b><small>${sub}</small></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button><div class="kb-acc"><div class="kb-in">${isi}</div></div></div>`; }
function css() { if (document.getElementById('kb-css')) return; const s = document.createElement('style'); s.id = 'kb-css';
  s.textContent = `.kb-sec{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}.kb-h{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;background:none;color:var(--fg);text-align:left;cursor:pointer;font:inherit}
  .kb-h span{flex:1;min-width:0}.kb-h b{display:block;font-size:15px}.kb-h small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.kb-h svg{flex:none;width:22px;height:22px;transition:transform .25s;color:var(--muted)}.kb-sec.open .kb-h svg{transform:rotate(180deg)}
  .kb-acc{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}.kb-sec.open .kb-acc{grid-template-rows:1fr}.kb-in{overflow:hidden;min-height:0}.kb-sec.open .kb-in{padding:0 16px 16px;overflow:auto}
  .kb-t{border-collapse:collapse;font-size:12.5px;min-width:100%}.kb-t th,.kb-t td{border:1px solid var(--line);padding:6px 8px;vertical-align:middle}.kb-t th{background:color-mix(in srgb,#1E7A58 14%,var(--surface));font-weight:800;font-size:11.5px;text-align:center}
  .kb-t td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.kb-t td.in{color:#7030A0;font-weight:700}.kb-t tr.tot td{font-weight:800;background:var(--surface-2)}.kb-t td.hl{background:#FEF9C3;color:#111}
  .kb-lok{display:flex;flex-wrap:wrap;gap:8px}.kb-lok label{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:12px;border:1.5px solid var(--line);font-size:13px;font-weight:600;cursor:pointer}.kb-lok input{width:18px;height:18px;accent-color:#1E7A58}`;
  document.head.appendChild(s); }
function ui(w, H) {
  const P = H.P, o = H.o, T = H.T, per = o.y0 === o.y1 ? String(o.y0) : `${o.y0}–${o.y1}`;
  const tParam = `<table class="kb-t"><tr><th>Parameter</th><th>Nilai</th></tr><tr><td>Lama periode acuan (${per})</td><td class="n in">${P.n}</td></tr><tr><td>Lama periode proyek</td><td class="n in">${P.proj}</td></tr>
    <tr><th>Tipe hutan dan kelas topografi</th><th>Kepadatan karbon (Mg C ha⁻¹)</th></tr>${[['Hutan Lahan Kering Primer', 'hlk_primer'], ['Hutan Lahan Kering Sekunder', 'hlk_sekunder'], ['Hutan Rawa Primer', 'hr_primer'], ['Hutan Rawa Sekunder', 'hr_sekunder'], ['Lahan yang terdeforestasi – lahan kering (PLK Bercampur Semak)', 'plk_semak'], ['Lahan yang terdeforestasi – rawa (Belukar Rawa)', 'belukar_rawa']].map(([n, k]) => `<tr><td>${n}</td><td class="n in">${nf(P.C[k], 2)} <small style="color:var(--muted)">(${nf(BASE[k], 2)} × 0,47)</small></td></tr>`).join('')}
    <tr><td>Keefektifan Proyek</td><td class="n in">${nf(P.eff * 100, 1)}%</td></tr><tr><td>Perkiraan Kebocoran</td><td class="n in">${nf(P.leak * 100, 1)}%</td></tr><tr><td>Penyangga Risiko</td><td class="n in">${nf(P.buf * 100, 1)}%</td></tr><tr><td>Faktor Konversi C ke CO₂</td><td class="n in">${nf(KC, 2)}</td></tr></table>`;
  const tAwal = `<table class="kb-t"><tr><th rowspan="2">Hutan Desa</th><th rowspan="2">Tipe hutan dan kelas topografi</th><th colspan="2">Area proyek (ha)</th><th colspan="2">Area Proyek (ha)</th><th colspan="2">Area Proyek</th><th colspan="2">Pengurangan cadangan C (Mg C ha⁻¹)</th><th>Pengurangan cadangan C awal tahunan (Mg C)</th></tr>
    <tr><th>${o.y1}</th><th>${o.y0}</th><th>Deforestasi ${per}</th><th>Degradasi ${per}</th><th>% Deforestasi tahunan</th><th>% Degradasi tahunan</th><th>Deforestasi</th><th>Degradasi</th><th></th></tr>
    ${H.HD.map(d => d.h.r.map((x, j) => `<tr>${j ? '' : `<td rowspan="4"><b>${esc(d.nama)}</b></td>`}<td>${KELAS[j]}</td><td class="n">${nf(x.C)}</td><td class="n">${nf(x.D, 4)}</td><td class="n">${nf(x.E, 4)}</td><td class="n">${nf(x.F, 4)}</td><td class="n">${nf(x.G * 100, 4)}%</td><td class="n">${nf(x.H * 100, 4)}%</td><td class="n">${nf(x.I, 0)}</td><td class="n">${j % 2 ? '' : nf(x.J, 0)}</td><td class="n">${nf(x.K)}</td></tr>`).join('')).join('')}
    <tr class="tot"><td colspan="2">Total</td><td class="n">${nf(T.C)}</td><td class="n">${nf(H.HD.reduce((s, d) => s + d.h.r.reduce((a, x) => a + x.D, 0), 0), 4)}</td><td class="n">${nf(T.E, 4)}</td><td class="n">${nf(T.F, 4)}</td><td class="n">${nf(H.HD.reduce((s, d) => s + d.h.r.reduce((a, x) => a + x.G, 0), 0) * 100, 4)}%</td><td class="n">${nf(H.HD.reduce((s, d) => s + d.h.r.reduce((a, x) => a + x.H, 0), 0) * 100, 4)}%</td><td></td><td></td><td class="n">${nf(T.K)}</td></tr></table>`;
  const RW = [['Perkiraan emisi skenario awal dari deforestasi dan degradasi hutan selama periode proyek', 'c3', 'd3', 'm3', 'n3'], ['Perkiraan emisi skenario proyek dari deforestasi dan degradasi hutan selama periode proyek', 'c4', 'd4', 'm4', 'n4'],
    ['Perkiraan emisi kebocoran sebagai hasil dari pemindahan deforestasi dan degradasi selama periode proyek', 'c5', 'd5', 'm5', 'n5'], ['Perkiraan manfaat iklim dari pengurangan deforestasi dan degradasi hutan sebagai hasil dari kegiatan-kegiatan proyek selama periode proyek', 'c6', 'd6', 'm6', 'n6'],
    ['Sertifikat yang dibuat selama periode proyek yang ditahan sebagai penyangga risiko', 'c7', 'd7', 'm7', 'n7'], ['Sertifikat Plan Vivo yang dapat dijual yang dibuat selama periode proyek', 'c8', 'd8', 'm8', 'n8']];
  const tMan = `<table class="kb-t"><tr><th></th>${H.HD.map(d => `<th colspan="2">${esc(d.nama.replace('Hutan Desa', 'HD'))}</th>`).join('')}<th colspan="2">TOTAL</th></tr><tr><th></th>${H.HD.map(() => '<th>Mg CO₂</th><th>Mg CO₂ thn⁻¹</th>').join('')}<th>Mg CO₂</th><th>Mg CO₂ thn⁻¹</th></tr>
    ${RW.map(([l, c, d, m, n]) => `<tr><td>${l}</td>${H.HD.map(x => `<td class="n">${nf(x.h.m[c], 0)}</td><td class="n">${nf(x.h.m[d], 0)}</td>`).join('')}<td class="n">${nf(T[m], 0)}</td><td class="n">${nf(T[n], 0)}</td></tr>`).join('')}
    <tr><th></th>${H.HD.map(() => '<th>ha</th><th>ha thn⁻¹</th>').join('')}<th>ha</th><th>ha thn⁻¹</th></tr>
    <tr><td>Luas hutan yang terlindungi</td>${H.HD.map(x => `<td class="n">${nf(x.h.m.c11)}</td><td></td>`).join('')}<td class="n hl">${nf(T.m11)}</td><td></td></tr>
    <tr><td>Luas deforestasi yang dapat dicegah selama periode proyek</td>${H.HD.map(x => `<td class="n">${nf(x.h.m.c12)}</td><td class="n">${nf(x.h.m.d12)}</td>`).join('')}<td class="n">${nf(T.m12)}</td><td class="n">${nf(T.n12)}</td></tr>
    <tr><td>Luas degradasi yang dapat dicegah selama periode proyek</td>${H.HD.map(x => `<td class="n">${nf(x.h.m.c13)}</td><td class="n">${nf(x.h.m.d13)}</td>`).join('')}<td class="n">${nf(T.m13)}</td><td class="n">${nf(T.n13)}</td></tr></table>`;
  const tHa = H.HD.map(d => `<h5 style="margin:14px 0 6px">Tipe hutan – ${esc(d.nama)}</h5><table class="kb-t"><tr><th rowspan="2">Tipe hutan</th><th colspan="3">Emisi GRK Tahunan per hektare (Mg CO₂ ha⁻¹)</th><th colspan="3">Pengurangan emisi tahunan per hektare (Mg CO₂ ha⁻¹)</th></tr><tr><th>Awal</th><th>Proyek</th><th>Kebocoran</th><th>Manfaat</th><th>Penyangga Risiko</th><th>Dapat Dijual</th></tr>
    ${d.h.ha.map((v, j) => `<tr><td>${KELAS[j]}</td>${v.map(x => `<td class="n">${nf(x, 4)}</td>`).join('')}</tr>`).join('')}</table>`).join('');
  const lok = !!(H.info && H.info.lokal);
  const tTh = `<table class="kb-t"><tr><th>Hutan Desa</th><th>Tahun</th>${KELAS.map(k => `<th>${k} (ha)</th>`).join('')}<th>${lok ? 'Regenerasi bukan hutan → hutan (ha, tidak dihitung)' : 'Kehilangan pohon di bukan hutan (ha)'}</th><th>Emisi (tCO₂e)</th></tr>${H.HD.map(d => d.a.tahun.map(t => { const e = emisiTahun(t, P);
      return `<tr><td>${esc(d.nama)}</td><td>${t[0]}</td>${t.slice(1, 5).map(v => `<td class="n">${nf(v, 4)}</td>`).join('')}<td class="n">${nf(lok && d.M ? d.M.aktivitas(t[0]).tumbuh || 0 : t[5], 4)}</td><td class="n">${nf(e, 1)}</td></tr>`; }).join('')).join('')}</table>`;
  const I = H.info || {};
  w.querySelector('#kbOut').innerHTML = `<div class="fa-card" style="border-left:4px solid ${lok ? '#15803D' : '#B45309'}"><small style="font-weight:800;color:var(--muted)">SUMBER DATA TUTUPAN LAHAN</small><div style="font-weight:800">${esc(I.nama || '')}</div><p class="fa-note">Data aktivitas sama dengan alat Tutupan lahan (satu basis data).${o.disesuaikan ? ` Periode disesuaikan dengan ketersediaan peta: <b>${per}</b>${lok ? ` (peta ${o.y0 - 1} = kondisi awal)` : ''}.` : ''}</p></div>
    <div class="fa-kpi"><div><small>Emisi skenario awal ${per}</small><b>${nf(T.m3 / P.proj * 1, 0)}</b><small>Mg CO₂ (ΣK × 44/12)</small></div><div><small>Manfaat iklim (Mg CO₂ thn⁻¹)</small><b>${nf(T.n6, 0)}</b></div><div><small>Sertifikat dapat dijual (Mg CO₂ thn⁻¹)</small><b>${nf(T.n8, 0)}</b></div><div><small>Luas hutan terlindungi</small><b>${nf(T.m11, 1)} ha</b></div></div>
    ${H.kosong.length ? `<p class="fa-err">Data FREL belum tersedia untuk: ${esc(H.kosong.join(', '))}.</p>` : ''}
    <div class="fa-row"><button class="fa-btn pri" style="--c:#15803D" id="kbXl">Excel (.xlsx)</button><button class="fa-btn pri" style="--c:#1D4ED8" id="kbDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="kbPdf">PDF</button></div>
    ${sec('kbS0', 'Tutupan lahan (dasar perhitungan)', 'Kelas awal tiap Hutan Desa – dihitung lebih dulu sebelum emisi', tutupan(H))}
    ${sec('kbS1', 'Parameter', 'Kepadatan karbon FREL 2022 & asumsi proyek', tParam)}
    ${sec('kbS2', 'Awal', 'Luas, deforestasi, degradasi & pengurangan cadangan karbon', `<div class="fa-scroll">${tAwal}</div>`, true)}
    ${sec('kbS3', 'Manfaat', 'Emisi awal, proyek, kebocoran, manfaat & sertifikat', `<div class="fa-scroll">${tMan}</div>`)}
    ${sec('kbS4', 'Per hektare', 'Emisi & pengurangan emisi tahunan per hektare', `<div class="fa-scroll">${tHa}</div>`)}
    ${sec('kbS5', 'Rincian per tahun', 'Kehilangan tutupan pohon menurut kelas & emisi tiap tahun', `<div class="fa-scroll">${tTh}</div>`)}
    ${sec('kbS6', 'Metode & sumber', 'Rumus, data & keterbatasan', `<p class="fa-note"><b>Rumus:</b> Emisi (Mg CO₂) = Σ [Luas deforestasi × (stok hutan − stok lahan terdeforestasi) + Luas degradasi × (stok primer − stok sekunder)] × 44/12 (metode beda stok, FREL 2022 / e-Learning KLHK "Menghitung Emisi Karbon Hutan").</p>${metodeK(H).map(m => `<p class="fa-note">• ${esc(m)}</p>`).join('')}`)}
    <div class="fa-card"><button class="fa-btn full" id="kbTu">Lihat tutupan lahan (sumber & periode sama) →</button></div>`;
  w.querySelector('#kbTu').onclick = () => window.FHTutupan && FHTutupan.open({ sumber: I.id, y0: o.y0, y1: o.y1 });
  w.querySelectorAll('.kb-sec .kb-h').forEach(b => b.onclick = () => { const s = b.parentElement, op = !s.classList.contains('open'); s.classList.toggle('open', op); b.setAttribute('aria-expanded', op); });
  w.querySelector('#kbXl').onclick = () => excel(H).catch(e => X().toast(e.message));
  w.querySelector('#kbDoc').onclick = () => word(H).catch(e => X().toast(e.message));
  w.querySelector('#kbPdf').onclick = () => pdf(H).catch(e => X().toast(e.message));
}
const KLHK_NAMA = { 2001: 'Hutan Lahan Kering Primer', 2002: 'Hutan Lahan Kering Sekunder', 2004: 'Hutan Mangrove Primer', 20041: 'Hutan Mangrove Sekunder', 2005: 'Hutan Rawa Primer', 20051: 'Hutan Rawa Sekunder', 2006: 'Hutan Tanaman', 2007: 'Semak Belukar', 20071: 'Belukar Rawa', 2010: 'Perkebunan', 2012: 'Permukiman', 20121: 'Bandara / Pelabuhan', 20122: 'Transmigrasi', 2014: 'Tanah Terbuka', 20141: 'Pertambangan', 20091: 'Pertanian Lahan Kering', 20092: 'Pertanian Lahan Kering Campur Semak', 20093: 'Sawah', 20094: 'Tambak', 3000: 'Savana / Padang Rumput', 5001: 'Tubuh Air', 50011: 'Rawa', 2500: 'Awan', 5003: 'Laut' };
function emisiTahun(t, P) { const C = P.C; return (t[1] * (C.hlk_primer - C.hlk_sekunder) + t[2] * (C.hlk_sekunder - C.plk_semak) + t[3] * (C.hr_primer - C.hr_sekunder) + t[4] * (C.hr_sekunder - C.belukar_rawa)) * KC; }
function tutupan(H) {
  return H.HD.map(d => { const a = d.a, I = d.info || {}, lok = !!I.lokal, ya = H.o.y0 - 1;
    const sumber = lok ? `${I.nama} – peta tahun ${ya}` : a.sumber === 'KLHK' ? `acuan Peta Penutupan Lahan KLHK ${a.epoch}; kondisi awal ${H.o.y0} dibentuk dari citra satelit tiap tahun` : `GLAD GLCLU ${a.epoch} (proksi kelas KLHK – peta resmi KLHK belum tersedia untuk lokasi ini)`;
    const rows = a.tutupan ? Object.entries(a.tutupan).filter(([, v]) => v > 0.005).sort((x, y) => y[1] - x[1]).map(([k, v]) => [KLHK_NAMA[k] || k, v]) : KELAS.map((k, j) => [k, a.rows[j].D]);
    return `<h5 style="margin:12px 0 6px">${esc(d.nama)}</h5><p class="fa-note">Sumber kelas: <b>${esc(sumber)}</b>${lok || a.sumber === 'KLHK' ? '' : ' <span class="fa-err">– bukan peta resmi KLHK</span>'}</p>
      ${a.citra ? `<p class="fa-note" style="color:#B45309">Tahun ${a.citra}: data aktivitas dari citra Sentinel-2 (indikasi), menunggu rilis data tahunan Hansen.</p>` : ''}<table class="kb-t"><tr><th>Kelas penutupan lahan (awal periode, ${ya})</th><th>Luas (ha)</th></tr>${rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${nf(v)}</td></tr>`).join('')}</table>
      ${lok && a.tumbuh > 0 ? `<p class="fa-note" style="color:#166534">Regenerasi (bukan hutan → hutan) ${H.o.y0}–${H.o.y1}: <b>${nf(a.tumbuh, 4)} ha</b> – dicatat terpisah; templat FREL tidak memuat serapan, sehingga tidak mengurangi emisi.</p>` : ''}`; }).join(''); }
/* teks metode untuk peta acuan KLHK tahun t (kini 2025; teks dasar ditulis untuk 2020) */
const TX = (s, t) => !t || t === 2020 ? s : s.replace(/PL_2020_AR_250K Provinsi Kalimantan Barat/g, `Penutupan Lahan ${t} Kabupaten Kapuas Hulu (Kementerian Kehutanan); peta KLHK 2020 dipakai sebagai pembanding`).replace(/(KLHK|peta|Peta acuan|acuan|sebelum|sesudah|Tahun <|tahun ≥|tahun <|Tahun ≥|setelah) 2020/g, `$1 ${t}`).replace(/PL 2021–2024/g, `PL ${t + 1} dst.`);
function metodeK(H) {
  const I = H.info || {}, t = H.HD[0] && H.HD[0].a && H.HD[0].a.epoch;
  if (!I.lokal) return METODE.map(x => TX(x, t));
  return [METODE[0], `Tutupan lahan & data aktivitas: ${I.nama} – ${I.sumber}. ${I.metode}`, I.groundcheck ? `Groundcheck lapangan: ${I.groundcheck}` : null,
    'Luas awal (kolom tahun awal) = luas kelas hutan pada peta tahun sebelum tahun awal periode. Deforestasi = jumlah perubahan tahunan kelas hutan → bukan hutan (tumpang-susun peta tahun y−1 dan y); degradasi = hutan primer → hutan sekunder. Kelas peta dipadankan dengan kode Penutupan Lahan KLHK (Hutan Lahan Kering Sekunder 2002, Hutan Rawa Sekunder 20051, dst.).',
    'Regenerasi (bukan hutan → hutan) dan suksesi alami dicatat di alat Tutupan lahan dan di sini sebagai informasi; templat FREL tidak memuat serapan sehingga tidak mengurangi emisi.',
    'Data aktivitas sama persis dengan alat Tutupan lahan (satu basis data), sehingga luas & perubahan di kedua alat selalu sama.',
    'Tidak mencakup emisi dekomposisi/kebakaran gambut, degradasi ringan di bawah tajuk, dan serapan dari pertumbuhan kembali.', METODE[METODE.length - 1]].filter(Boolean);
}
const METODE = ['Kepadatan karbon: FREL 2022 (FRL ke-2 Indonesia, KLHK), biomassa AGB+BGB × fraksi karbon 0,47; kelas hutan = nilai Kalimantan, non-hutan = nilai nasional.',
  'Data aktivitas: kehilangan tutupan pohon tahunan dari citra satelit – Hansen/UMD Global Forest Change v1.13 (citra Landsat, 2001–2025, piksel ±30 m, tajuk tahun 2000 ≥ 30%); tahun berjalan (mis. 2026) dari citra Sentinel-2 20 m (perubahan NBR/SWIR terhadap musim yang sama tahun lalu, indikasi sampai data Hansen terbit). Luas piksel geodesik.',
  'Tutupan lahan tiap tahun: acuan Peta Penutupan Lahan KLHK 2020; tahun sesudah 2020 = acuan + perubahan dari citra tahun itu (HLK Primer → Sekunder, HLK Sekunder → PLK Campur Semak, Hutan Rawa Primer → Sekunder, Hutan Rawa Sekunder → Belukar Rawa); tahun sebelum 2020 = acuan dengan piksel yang hilang sesudah tahun itu dikembalikan ke hutan sekunder (lahan kering atau rawa sesuai kelas acuan). Piksel yang hilang sebelum 2020 tetapi masih dipetakan hutan oleh KLHK 2020 tidak dihitung berubah.',
  'Kelas awal (tutupan lahan, dihitung lebih dulu): Peta Penutupan Lahan resmi KLHK skala 1:250.000 tahun awal periode (atau tahun terdekat sebelumnya). Bila peta KLHK belum tersedia untuk suatu lokasi, dipakai GLAD GLCLUC v2 sebagai proksi (pohon > 25 m = primer, 3–25 m = sekunder; lahan kering vs rawa) dan ditandai jelas di tabel tutupan lahan.',
  'Kehilangan di hutan primer = degradasi (→ hutan sekunder); di hutan sekunder = deforestasi (→ PLK bercampur semak / belukar rawa). Kehilangan di areal bukan hutan tidak dihitung sebagai emisi.',
  'Luas awal (kolom tahun awal) = luas kelas pada epoch GLCLU dikurangi kehilangan tutupan pohon antara epoch dan tahun awal periode.',
  'Tidak mencakup emisi dekomposisi/kebakaran gambut, degradasi ringan di bawah tajuk, dan serapan dari pertumbuhan kembali. Data tahun berjalan menunggu rilis tahunan Hansen.',
  'Parameter proyek (keefektifan 90%, kebocoran 5%, penyangga risiko 13,5%) mengikuti templat perhitungan karbon PRCF dan dapat diubah.'];

/* ---------- Excel: tata letak & rumus templat ---------- */
async function excel(H) {
  const A = X(); await A.lib('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(), P = H.P, o = H.o, n = H.HD.length;
  wb.creator = 'Yayasan PRCF Indonesia – Fire Hotspot'; const per = o.y0 === o.y1 ? String(o.y0) : `${o.y0}–${o.y1}`;
  const TH = { style: 'thin', color: { argb: 'FFBFBFBF' } }, BD = { top: TH, left: TH, bottom: TH, right: TH };
  const put = (ws, a, v, st = {}) => { const c = ws.getCell(a); c.value = v; c.font = Object.assign({ name: 'Segoe UI', size: 10 }, st.font || {}); c.border = BD; if (st.fmt) c.numFmt = st.fmt; c.alignment = Object.assign({ vertical: 'middle', wrapText: !!st.wrap }, st.al || {}); if (st.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } }; return c; };
  const IN = { font: { color: { argb: 'FF7030A0' } } }, FO = { font: { color: { argb: 'FF002060' } } }, HD_ = { font: { name: 'Segoe UI Semibold' }, al: { horizontal: 'center' }, wrap: true };
  const f = (formula, result) => ({ formula, result: Number.isFinite(result) ? result : 0 });
  /* Parameter */
  const p = wb.addWorksheet('Parameter'); p.columns = [{ width: 58 }, { width: 5.79 }, { width: 27.73 }, { width: 9.2 }];
  put(p, 'C1', 'Tahun', HD_); put(p, 'A2', `Lama periode acuan (${per})`, { wrap: true }); put(p, 'C2', P.n, IN); put(p, 'A3', 'Lama periode proyek', { wrap: true }); put(p, 'C3', P.proj, IN);
  put(p, 'A5', 'Tipe hutan dan kelas topografi', { wrap: true }); put(p, 'C5', 'Kepadatan karbon (Mg C ha-1)', { wrap: true });
  [['Hutan Lahan Kering Primer', 'hlk_primer'], ['Hutan Lahan Kering Sekunder', 'hlk_sekunder'], ['Hutan Rawa Primer', 'hr_primer'], ['Hutan Rawa Sekunder', 'hr_sekunder'], ['Lahan yang terdeforestasi – lahan kering (PLK Bercampur Semak)', 'plk_semak'], ['Lahan yang terdeforestasi – rawa (Belukar Rawa)', 'belukar_rawa']]
    .forEach(([nm, k], i) => { put(p, 'A' + (6 + i), nm, { wrap: true }); put(p, 'C' + (6 + i), f(`${BASE[k]}*0.47`, P.C[k]), Object.assign({ fmt: '0.00' }, IN)); });
  put(p, 'A13', 'Keefektifan Proyek'); put(p, 'C13', P.eff, Object.assign({ fmt: '0%' }, IN)); put(p, 'A14', 'Perkiraan Kebocoran'); put(p, 'C14', P.leak, Object.assign({ fmt: '0%' }, IN));
  put(p, 'A15', 'Penyangga Risiko'); put(p, 'C15', P.buf, Object.assign({ fmt: '0.0%' }, IN)); put(p, 'A17', 'Faktor Konversi C ke CO2 '); put(p, 'C17', f('44/12', KC), Object.assign({ fmt: '0.00' }, IN));
  p.getCell('A19').value = 'Sumber kepadatan karbon: FREL 2022 (FRL ke-2 Indonesia, KLHK), biomassa AGB+BGB × fraksi karbon 0,47; hutan = nilai Kalimantan, non-hutan = nilai nasional.';
  const I = H.info || {};
  p.getCell('A20').value = I.lokal ? `Tutupan lahan & data aktivitas: ${I.nama} – ${I.sumber}. Lahan terdeforestasi = PLK bercampur semak (lahan kering) / belukar rawa (rawa).` : 'Tutupan lahan: Peta Penutupan Lahan KLHK 2020 (1:250.000) + kehilangan tutupan pohon tahunan Hansen GFC v1.13 (tahun berjalan: Sentinel-2). Lahan terdeforestasi = PLK bercampur semak (lahan kering) / belukar rawa (rawa).';
  p.getCell('A21').value = `Data aktivitas ${per} sama dengan alat Tutupan lahan (satu basis data). Dibuat otomatis oleh Fire Hotspot – Yayasan PRCF Indonesia, ${A.wib(Date.now())}.`;
  /* Awal */
  const a = wb.addWorksheet('Awal'); [24.53, 27.06, 15.47, 9.26, 9.2, 9.2, 12.06, 13.2, 9.86, 10.53, 48.2].forEach((w, i) => a.getColumn(i + 1).width = w);
  a.mergeCells('A1:A2'); a.mergeCells('B1:B2'); a.mergeCells('C1:D1'); a.mergeCells('E1:F1'); a.mergeCells('G1:H1'); a.mergeCells('I1:J1'); a.mergeCells('E2:F2');
  put(a, 'A1', 'Hutan Desa', HD_); put(a, 'B1', 'Tipe hutan dan kelas topografi', HD_); put(a, 'C1', 'Area proyek (ha)', HD_); put(a, 'E1', 'Area Proyek (ha)', HD_); put(a, 'G1', 'Area Proyek ', HD_);
  put(a, 'I1', 'Pengurangan cadangan C (Mg C ha-1)', HD_); put(a, 'K1', 'Pengurangan cadangan C awal tahunan (Mg C)', HD_);
  put(a, 'C2', o.y1, HD_); put(a, 'D2', o.y0, HD_); put(a, 'E2', `${o.y0} - ${o.y1}`, HD_); put(a, 'G2', '% Deforestasi tahunan', HD_); put(a, 'H2', '% Degradasi tahunan', HD_); put(a, 'I2', 'Deforestasi', HD_); put(a, 'J2', 'Degradasi', HD_);
  a.getRow(1).height = 34.5; a.getRow(2).height = 33;
  const iF = ['Parameter!$C$6-Parameter!$C$10', 'Parameter!$C$7-Parameter!$C$10', 'Parameter!$C$8-Parameter!$C$11', 'Parameter!$C$9-Parameter!$C$11'], jF = ['Parameter!$C$6-Parameter!$C$7', null, 'Parameter!$C$8-Parameter!$C$9', null];
  H.HD.forEach((d, i) => { const r0 = 4 + i * 4; a.mergeCells(`A${r0}:A${r0 + 3}`); put(a, 'A' + r0, d.nama, { wrap: true });
    d.h.r.forEach((x, j) => { const r = r0 + j; put(a, 'B' + r, KELAS[j], { wrap: true });
      put(a, 'C' + r, f(j % 2 ? `D${r}-E${r}-F${r}+F${r - 1}` : `D${r}-E${r}-F${r}`, x.C), { fmt: '#,##0.00', font: { color: { argb: 'FF000000' } } });
      put(a, 'D' + r, +x.D.toFixed(4), { fmt: '#,##0.00' }); put(a, 'E' + r, +x.E.toFixed(4), { fmt: '#,##0.00' }); put(a, 'F' + r, +x.F.toFixed(4), { fmt: '#,##0.00' });
      put(a, 'G' + r, f(`IF(D${r}=0,0,E${r}/(D${r}*Parameter!$C$2))`, x.G), Object.assign({ fmt: '0.0%' }, FO)); put(a, 'H' + r, f(`IF(D${r}=0,0,F${r}/(D${r}*Parameter!$C$2))`, x.H), Object.assign({ fmt: '0.00%' }, FO));
      put(a, 'I' + r, f(iF[j], x.I), Object.assign({ fmt: '#,##0' }, FO)); if (jF[j]) put(a, 'J' + r, f(jF[j], x.J), Object.assign({ fmt: '#,##0' }, FO)); else put(a, 'J' + r, null);
      put(a, 'K' + r, f(`E${r}*I${r}+F${r}*J${r}`, x.K), Object.assign({ fmt: '#,##0.00' }, FO)); }); });
  const tr = 4 + n * 4, last = tr - 1, T = H.T, sum = (c, fn) => H.HD.reduce((s, d) => s + d.h.r.reduce((q, x) => q + fn(x), 0), 0);
  put(a, 'A' + tr, 'Total', { font: { name: 'Segoe UI Semibold' } }); put(a, 'B' + tr, null);
  [['C', x => x.C, '#,##0.00'], ['D', x => x.D, '#,##0.00'], ['E', x => x.E, '#,##0.00'], ['F', x => x.F, '#,##0.00'], ['G', x => x.G, '0.00%'], ['H', x => x.H, '0.00%'], ['K', x => x.K, '#,##0.00']]
    .forEach(([c, fn, fm]) => put(a, c + tr, f(`SUM(${c}4:${c}${last})`, sum(c, fn)), { fmt: fm, font: { name: 'Segoe UI Semibold', color: { argb: 'FF002060' } } }));
  a.getCell('A' + (tr + 2)).value = I.lokal ? 'Deforestasi = perubahan kelas hutan → bukan hutan antar peta tahunan. Degradasi = hutan primer → hutan sekunder.' : 'Deforestasi = kehilangan tutupan pohon di hutan sekunder (→ lahan terdeforestasi). Degradasi = kehilangan di hutan primer (→ hutan sekunder).';
  a.getCell('A' + (tr + 3)).value = I.lokal ? `Regenerasi (bukan hutan → hutan) ${per}: ${H.HD.reduce((q, d) => q + (d.a.tumbuh || 0), 0).toFixed(4)} ha – dicatat terpisah, tidak mengurangi emisi.` : 'Kehilangan tutupan pohon di areal bukan hutan (ladang/semak) tidak dihitung sebagai deforestasi maupun degradasi.';
  /* Manfaat */
  const m = wb.addWorksheet('Manfaat'); m.getColumn(1).width = 55.58; m.getColumn(2).width = 4.6; for (let c = 3; c <= 4 + 2 * n; c++) m.getColumn(c).width = 13;
  const col = k => { let s = '', x = k; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); } return s; };
  H.HD.forEach((d, i) => { const c1 = col(3 + 2 * i), c2 = col(4 + 2 * i); m.mergeCells(`${c1}1:${c2}1`); put(m, c1 + '1', d.nama.replace('Hutan Desa', 'HD'), Object.assign({}, HD_, { font: { name: 'Segoe UI Semibold', bold: true } })); put(m, c1 + '2', 'Mg CO2', HD_); put(m, c2 + '2', 'Mg CO2 thn-1', HD_); put(m, c1 + '10', 'ha', HD_); put(m, c2 + '10', 'ha thn-1', HD_); });
  const tc1 = col(3 + 2 * n), tc2 = col(4 + 2 * n); m.mergeCells(`${tc1}1:${tc2}1`); put(m, tc1 + '1', 'TOTAL', Object.assign({}, HD_, { font: { name: 'Segoe UI Semibold', bold: true } })); put(m, tc1 + '2', 'Mg CO2', HD_); put(m, tc2 + '2', 'Mg CO2 thn-1', HD_); put(m, tc1 + '10', 'ha', HD_); put(m, tc2 + '10', 'ha thn-1', HD_);
  const LBL = ['Perkiraan emisi skenario awal dari deforestasi dan degradasi hutan selama periode proyek', 'Perkiraan emisi skenario proyek dari deforestasi dan degradasi hutan selama periode proyek', 'Perkiraan emisi kebocoran sebagai hasil dari pemindahan deforestasi dan degradasi selama periode proyek',
    'Perkiraan manfaat iklim dari pengurangan deforestasi dan degradasi hutan sebagai hasil dari kegiatan-kegiatan proyek selama periode proyek', 'Sertifikat yang dibuat selama periode proyek yang ditahan sebagai penyangga risiko ', 'Sertifikat Plan Vivo yang dapat dijual yang dibuat selama periode proyek'];
  LBL.forEach((l, k) => put(m, 'A' + (3 + k), l, { wrap: true })); put(m, 'A11', 'Luas hutan yang terlindungi', { wrap: true }); put(m, 'A12', 'Luas deforestasi yang dapat dicegah selama periode proyek', { wrap: true }); put(m, 'A13', 'Luas degradasi yang dapat dicegah selama periode proyek', { wrap: true });
  const NUM = Object.assign({ fmt: '#,##0' }, FO, { wrap: true }), NUM2 = Object.assign({ fmt: '#,##0.00' }, FO, { wrap: true });
  H.HD.forEach((d, i) => { const C = col(3 + 2 * i), D = col(4 + 2 * i), r0 = 4 + i * 4, r1 = r0 + 3, M = d.h.m;
    put(m, D + '3', f(`SUM(Awal!K${r0}:K${r1})*Parameter!$C$17`, M.d3), NUM); put(m, C + '3', f(`${D}3*Parameter!$C$3`, M.c3), NUM);
    put(m, D + '4', f(`${D}3*(1-Parameter!$C$13)`, M.d4), NUM); put(m, C + '4', f(`${D}4*Parameter!$C$3`, M.c4), NUM);
    put(m, D + '5', f(`(${D}3-${D}4)*Parameter!$C$14`, M.d5), NUM); put(m, C + '5', f(`${D}5*Parameter!$C$3`, M.c5), NUM);
    put(m, D + '6', f(`${D}3-${D}4-${D}5`, M.d6), NUM); put(m, C + '6', f(`${D}6*Parameter!$C$3`, M.c6), NUM);
    put(m, D + '7', f(`${D}6*Parameter!$C$15`, M.d7), NUM); put(m, C + '7', f(`${D}7*Parameter!$C$3`, M.c7), NUM);
    put(m, D + '8', f(`${D}6-${D}7`, M.d8), NUM); put(m, C + '8', f(`${D}8*Parameter!$C$3`, M.c8), NUM);
    put(m, C + '11', f(`SUM(Awal!C${r0}:C${r1})*Parameter!$C$13`, M.c11), NUM2); put(m, D + '11', null);
    put(m, D + '12', f(`SUM(Awal!E${r0}:E${r1})*(Parameter!$C$13-Parameter!$C$14)`, M.d12), NUM2); put(m, C + '12', f(`${D}12*Parameter!$C$3`, M.c12), NUM2);
    put(m, D + '13', f(`SUM(Awal!F${r0}:F${r1})*(Parameter!$C$13-Parameter!$C$14)`, M.d13), NUM2); put(m, C + '13', f(`${D}13*Parameter!$C$3`, M.c13), NUM2); });
  const tm = tc1, tn = tc2;
  put(m, tm + '3', f(`Parameter!$C$3*44/12*Awal!K${tr}`, T.m3), NUM); put(m, tn + '3', f(`${tm}3/Parameter!$C$3`, T.n3), NUM);
  put(m, tm + '4', f(`${tm}3*(1-Parameter!$C$13)`, T.m4), NUM); put(m, tn + '4', f(`${tm}4/Parameter!$C$3`, T.n4), NUM);
  put(m, tm + '5', f(`(${tm}3-${tm}4)*Parameter!$C$14`, T.m5), NUM); put(m, tn + '5', f(`${tm}5/Parameter!$C$3`, T.n5), NUM);
  put(m, tm + '6', f(`${tm}3-${tm}4-${tm}5`, T.m6), NUM); put(m, tn + '6', f(`${tm}6/Parameter!$C$3`, T.n6), NUM);
  put(m, tm + '7', f(`${tm}6*Parameter!$C$15`, T.m7), NUM); put(m, tn + '7', f(`${tm}7/Parameter!$C$3`, T.n7), NUM);
  put(m, tm + '8', f(`${tm}6-${tm}7`, T.m8), NUM); put(m, tn + '8', f(`${tm}8/Parameter!$C$3`, T.n8), NUM);
  put(m, tm + '11', f(`Awal!C${tr}*Parameter!$C$13`, T.m11), Object.assign({}, NUM2, { fill: 'FFFFFF00' })); put(m, tn + '11', null);
  put(m, tm + '12', f(`Awal!E${tr}*Parameter!$C$3*(Parameter!$C$13-Parameter!$C$14)`, T.m12), NUM2); put(m, tn + '12', f(`${tm}12/Parameter!$C$3`, T.n12), NUM2);
  put(m, tm + '13', f(`Awal!F${tr}*Parameter!$C$3*(Parameter!$C$13-Parameter!$C$14)`, T.m13), NUM2); put(m, tn + '13', f(`${tm}13/Parameter!$C$3`, T.n13), NUM2);
  m.getRow(3).height = 30.75; m.getRow(4).height = 30.75;
  H.HD.forEach((d, i) => { const b = 16 + 8 * i, r0 = 4 + i * 4;
    m.mergeCells(`A${b}:A${b + 2}`); m.mergeCells(`B${b}:B${b + 2}`); m.mergeCells(`C${b}:E${b}`); m.mergeCells(`F${b}:H${b}`);
    put(m, 'A' + b, 'Tipe hutan – ' + d.nama, { font: { name: 'Segoe UI Semibold', bold: true }, al: { horizontal: 'left' }, wrap: true });
    put(m, 'C' + b, 'Emisi GRK Tahunan per hektare\n(Mg CO2 ha-1)', HD_); put(m, 'F' + b, 'Pengurangan emisi tahunan per hektare\n(Mg CO2 ha-1)', HD_); m.getRow(b).height = 30;
    ['Awal', 'Proyek', 'Kebocoran', 'Manfaat', 'Pengangga Risiko', 'Dapat Dijual'].forEach((t, k) => put(m, col(3 + k) + (b + 1), t, HD_));
    d.h.ha.forEach((v, j) => { const r = b + 3 + j, ar = r0 + j; put(m, 'A' + r, KELAS[j]);
      const F4 = { fmt: '0.0000', font: { name: 'Calibri', size: 11, color: { argb: 'FF002060' } } };
      put(m, 'C' + r, f(`IFERROR(Awal!K${ar}/Awal!C${ar}*Parameter!$C$17,0)`, v[0]), F4); put(m, 'D' + r, f(`C${r}*(1-Parameter!$C$13)`, v[1]), F4); put(m, 'E' + r, f(`(C${r}-D${r})*Parameter!$C$14`, v[2]), F4);
      put(m, 'F' + r, f(`C${r}-D${r}-E${r}`, v[3]), F4); put(m, 'G' + r, f(`F${r}*Parameter!$C$15`, v[4]), F4); put(m, 'H' + r, f(`F${r}-G${r}`, v[5]), F4); }); });
  wb.calcProperties = { fullCalcOnLoad: true };
  const buf = await wb.xlsx.writeBuffer(); A.dl(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fn(H, 'xlsx')); A.pakai('karbon_excel');
}
const fn = (H, ext) => `PERHITUNGAN_KARBON_${H.HD.map(d => d.nama.replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_')).join('_')}_${((H.info && H.info.id) || 'klhk').toUpperCase()}_${H.o.y0 === H.o.y1 ? H.o.y0 : H.o.y0 + '-' + H.o.y1}.${ext}`;
function tabelLaporan(H) { const nf0 = v => X().n1(v, 0), T = H.T;
  return { ring: [['Emisi skenario awal (Mg CO2/thn) – ΣK × 44/12', nf0(T.n3)], ['Emisi skenario awal selama periode proyek (Mg CO2)', nf0(T.m3)], ['Emisi skenario proyek (Mg CO2/thn)', nf0(T.n4)], ['Kebocoran (Mg CO2/thn)', nf0(T.n5)], ['Manfaat iklim (Mg CO2/thn)', nf0(T.n6)], ['Penyangga risiko (Mg CO2/thn)', nf0(T.n7)], ['Sertifikat Plan Vivo dapat dijual (Mg CO2/thn)', nf0(T.n8)], ['Luas hutan terlindungi (ha)', nf(T.m11)], ['Luas deforestasi dicegah (ha)', nf(T.m12)], ['Luas degradasi dicegah (ha)', nf(T.m13)]],
    awal: H.HD.flatMap(d => d.h.r.map((x, j) => [j ? '' : d.nama, KELAS[j], nf(x.D, 2), nf(x.E, 4), nf(x.F, 4), nf(x.C, 2), nf(x.K, 2)])),
    hd: H.HD.map(d => [d.nama, nf0(d.h.m.d3), nf0(d.h.m.d6), nf0(d.h.m.d8), nf(d.h.m.c11)]) }; }
async function word(H) {
  const A = X(); await A.lib(A.DOCX); const d = window.docx, B = tabelLaporan(H), TR = s => window.FHLang ? FHLang.t(String(s ?? '')) : String(s ?? ''), per = H.o.y0 === H.o.y1 ? String(H.o.y0) : `${H.o.y0}–${H.o.y1}`;
  const run = (t, o = {}) => new d.TextRun({ text: TR(t), font: 'Arial', size: o.size || 20, bold: o.bold, color: o.color });
  const p = (t, o = {}) => new d.Paragraph({ children: [run(t, o)], spacing: { after: 120 } });
  const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 17, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1F4E3D' } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 } });
  const tbl = (Hd, rows) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: Hd.map(h => cell(h, true)) }), ...rows.map(r => new d.TableRow({ children: r.map(c => cell(c)) }))] });
  const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Fire Hotspot', sections: [{ children: [
    p('Perhitungan Emisi Karbon Hutan Desa', { bold: true, size: 36, color: '1F4E3D' }), p(`Periode ${per} · ${H.HD.map(x => x.nama).join(', ')} · sumber tutupan lahan: ${(H.info && H.info.nama) || ''}`, { color: '55665D' }),
    p('1. Ringkasan', { bold: true, size: 26 }), tbl(['Indikator', 'Nilai'], B.ring),
    p(''), p('2. Per Hutan Desa', { bold: true, size: 26 }), tbl(['Hutan Desa', 'Emisi awal (Mg CO2/thn)', 'Manfaat (Mg CO2/thn)', 'Dapat dijual (Mg CO2/thn)', 'Hutan terlindungi (ha)'], B.hd),
    p(''), p('3. Luas & pengurangan cadangan karbon (sheet Awal)', { bold: true, size: 26 }), tbl(['Hutan Desa', 'Tipe hutan', `Luas ${H.o.y0} (ha)`, 'Deforestasi (ha)', 'Degradasi (ha)', `Luas ${H.o.y1} (ha)`, 'Pengurangan C (Mg C)'], B.awal),
    p(''), p('4. Rumus & metode', { bold: true, size: 26 }), p('Emisi (Mg CO2) = Σ [Luas deforestasi × (stok hutan − stok lahan terdeforestasi) + Luas degradasi × (stok primer − stok sekunder)] × 44/12.'),
    ...metodeK(H).map(x => p('• ' + x, { size: 18, color: '55665D' })), p(`Fire Hotspot · Yayasan PRCF Indonesia · dibuat ${A.wib(Date.now())}`, { size: 16, color: '888888' })] }] });
  A.dl(await d.Packer.toBlob(doc), fn(H, 'docx'));
}
async function pdf(H) {
  const A = X(); await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }); if (window.FHLang) FHLang.pdf(doc);
  const B = tabelLaporan(H), per = H.o.y0 === H.o.y1 ? String(H.o.y0) : `${H.o.y0}-${H.o.y1}`, a = s => String(s).replace(/[–—]/g, '-').replace(/→/g, '->').replace(/Σ/g, 'Sum ').replace(/×/g, 'x').replace(/−/g, '-');
  doc.setFillColor(31, 78, 61); doc.rect(0, 0, 210, 30, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Perhitungan Emisi Karbon Hutan Desa', 16, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(doc.splitTextToSize(a(`Periode ${per} · ${H.HD.map(x => x.nama).join(', ')} · sumber tutupan lahan: ${(H.info && H.info.nama) || ''}`), 178), 16, 20); doc.setTextColor(20);
  const T = (y, head, body, fs = 8.5, c = [31, 78, 61]) => { doc.autoTable({ startY: y, head: [head.map(a)], body: body.map(r => r.map(a)), theme: 'grid', headStyles: { fillColor: c, fontSize: fs }, styles: { fontSize: fs, cellPadding: 1.4 }, margin: { left: 16, right: 16 } }); return doc.lastAutoTable.finalY + 7; };
  let y = T(38, ['Indikator', 'Nilai'], B.ring); y = T(y, ['Hutan Desa', 'Emisi awal (Mg CO2/thn)', 'Manfaat (Mg CO2/thn)', 'Dapat dijual (Mg CO2/thn)', 'Hutan terlindungi (ha)'], B.hd, 8);
  y = T(y, ['Hutan Desa', 'Tipe hutan', `Luas ${H.o.y0}`, 'Deforestasi', 'Degradasi', `Luas ${H.o.y1}`, 'Pengurangan C (Mg C)'], B.awal, 7.4);
  if (y > 240) { doc.addPage(); y = 20; } doc.setFontSize(8); doc.setTextColor(70);
  [a('Rumus: Emisi (Mg CO2) = Sum [Luas deforestasi x (stok hutan - stok lahan terdeforestasi) + Luas degradasi x (stok primer - stok sekunder)] x 44/12.'), ...metodeK(H).map(a)].forEach(t => { const L = doc.splitTextToSize(t, 178); if (y + L.length * 3.6 > 285) { doc.addPage(); y = 20; } doc.text(L, 16, y); y += L.length * 3.6 + 1.5; });
  const np = doc.getNumberOfPages(); for (let i = 1; i <= np; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(`Fire Hotspot · Yayasan PRCF Indonesia · ${A.wib(Date.now())} · ${i}/${np}`, 16, 290); }
  doc.save(fn(H, 'pdf'));
}
/* ringkasan untuk laporan umum, indikator, dll.: satu Hutan Desa, periode pilihan, sumber tutupan lahan utama (atau sid) */
async function ringkas(id, y0, y1, sid) {
  const H = await hitung({ lokasi: [id], y0, y1, eff: 0.9, leak: 0.05, buf: 0.135, sumber: sid }); if (!H.HD.length) return null;
  const d = H.HD[0], o = H.o; return { periode: o.y0 === o.y1 ? String(o.y0) : `${o.y0}–${o.y1}`, y0: o.y0, y1: o.y1, nama: d.nama, defo: d.h.r.reduce((s, x) => s + x.E, 0), degr: d.h.r.reduce((s, x) => s + x.F, 0), nh: d.a.nh || 0, tumbuh: d.a.tumbuh || 0,
    emisi_thn: d.h.m.d3, emisi_proj: d.h.m.c3, manfaat_thn: d.h.m.d6, jual_thn: d.h.m.d8, terlindungi: d.h.m.c11, baris: d.h.r.map((x, j) => [KELAS[j], x.D, x.E, x.F, x.C, x.K]),
    sumber: (H.info && H.info.nama) || '', sumber_id: (H.info && H.info.id) || 'klhk', metode: metodeK(H) };
}
/* ---------- halaman alat ---------- */
function open(opsi) {
  const A = X(); if (!A || !window.openPage) return; css(); A.pakai('karbon'); opsi = opsi || {};
  const cur = window.FHSiteObj && FHSiteObj(), MK = window.FHModelKLHK;
  if (!cur) return A.toast('Pilih Hutan Desa di Beranda.');
  openPage('Emisi karbon (FREL)', cur.hd_nama + ' · sumber tutupan lahan & periode', `<div class="fa" id="kbW">
    <div class="fa-card"><h5>Hutan Desa</h5><div style="font-size:18px;font-weight:800">${esc(cur.hd_nama)}</div><p class="fa-note">${esc([cur.lphd, cur.kec ? 'Kec. ' + cur.kec : '', 'Kab. Kapuas Hulu'].filter(Boolean).join(' · '))} · semua angka, laporan & ekspor di halaman ini hanya untuk Hutan Desa ini. Ganti Hutan Desa di Beranda untuk melihat lokasi lain.</p>
     <h5 style="margin-top:14px">Sumber tutupan lahan</h5><select id="kbSm" style="width:100%"></select><p class="fa-note">Sama dengan alat Tutupan lahan – luas & perubahan di kedua alat selalu sama.</p>
     <h5 style="margin-top:14px">Periode</h5><div class="fa-chips" id="kbPre" style="--c:#15803D"></div>
     <div class="fa-row" style="margin-top:10px"><label>Tahun awal<select id="kbY0"></select></label><label>Tahun akhir<select id="kbY1"></select></label></div>
     <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px">Parameter proyek (templat PRCF)</summary><div class="fa-row" style="margin-top:10px">
      <label>Keefektifan proyek (%)<input type="number" id="kbEff" value="90" min="0" max="100" step="0.1"></label><label>Kebocoran (%)<input type="number" id="kbLeak" value="5" min="0" max="100" step="0.1"></label>
      <label>Penyangga risiko (%)<input type="number" id="kbBuf" value="13.5" min="0" max="100" step="0.1"></label><label>Lama periode proyek (thn)<input type="number" id="kbProj" placeholder="= periode acuan" min="1" max="100"></label></div></details>
     <button class="fa-btn pri full" id="kbGo" style="--c:#15803D;margin-top:14px">Hitung emisi karbon</button></div><div id="kbOut"></div></div>`, async () => {
    const w = document.getElementById('kbW'), $ = s => w.querySelector(s);
    let SM; try { SM = await MK.daftarSumber(cur.id); } catch (e) { SM = [MK.SUMBER_KLHK]; }
    let sid = (SM.find(x => x.id === (opsi.sumber || MK.pilihan(cur.id))) || SM[0]).id, M = null;
    $('#kbSm').innerHTML = SM.map((x, i) => `<option value="${esc(x.id)}" ${x.id === sid ? 'selected' : ''}>${esc(x.nama)}${i === 0 && SM.length > 1 ? ' – utama' : SM.length > 1 ? ' – pembanding' : ''}</option>`).join('');
    const isi = keep => { const lok = !!(M && M.info && M.info.lokal), yMin = lok ? M.yMin + 1 : Y_MIN, yMax = M ? M.yMax : Y_MAX, Y = []; for (let y = yMax; y >= yMin; y--) Y.push(y);
      const o0 = keep ? +$('#kbY0').value : opsi.y0 != null ? Math.max(yMin, opsi.y0) : null, o1 = keep ? +$('#kbY1').value : opsi.y1;
      const d1 = Y.includes(o1) ? o1 : (lok ? yMax : Math.min(yMax, 2025)), d0 = Y.includes(o0) ? o0 : Math.max(yMin, Math.min(d1, 2020));
      const lbl = y => `${y}${M && y === M.yCitra ? ' (citra)' : ''}`;
      $('#kbY0').innerHTML = Y.map(y => `<option value="${y}" ${y === d0 ? 'selected' : ''}>${lbl(y)}</option>`).join(''); $('#kbY1').innerHTML = Y.map(y => `<option value="${y}" ${y === d1 ? 'selected' : ''}>${lbl(y)}</option>`).join('');
      const PR = (lok ? [[2020, 2025, '2020–2025'], [yMax - 4, yMax, '5 tahun terakhir'], [yMax - 9, yMax, '10 tahun terakhir'], [yMin, yMax, `seluruh peta (${yMin - 1}–${yMax})`]] : [[2020, 2025, '2020–2025'], [2025, 2025, '2025'], [2021, 2025, '5 tahun terakhir'], [2016, 2025, '10 tahun terakhir'], [2001, 2025, '2001–2025']]).filter(([a, b]) => a >= yMin && b <= yMax && a <= b);
      $('#kbPre').innerHTML = PR.map(([a, b, t]) => `<button type="button" data-a="${a}" data-b="${b}" aria-pressed="${a === d0 && b === d1}">${t}</button>`).join('');
      $('#kbPre').querySelectorAll('button').forEach(b => b.onclick = () => { $('#kbPre').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#kbY0').value = b.dataset.a; $('#kbY1').value = b.dataset.b; go(); }); };
    const go = async () => { let y0 = +$('#kbY0').value, y1 = +$('#kbY1').value; if (y0 > y1) [y0, y1] = [y1, y0];
      const pr = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v / 100 : d; };
      $('#kbOut').innerHTML = '<div class="fa-card"><p class="fa-note">Menghitung…</p></div>';
      try { const H = await hitung({ lokasi: [cur.id], y0, y1, sumber: sid, eff: pr('#kbEff', .9), leak: pr('#kbLeak', .05), buf: pr('#kbBuf', .135), proj: parseInt($('#kbProj').value) || 0 }); window.__kb = H; ui(w, H); }
      catch (e) { $('#kbOut').innerHTML = '<div class="fa-card"><p class="fa-err">Data belum dapat dimuat (perlu internet).</p></div>'; } };
    const ganti = async keep => { try { M = await MK.muat(cur.id, sid); } catch (e) { M = null; } isi(keep); go(); };
    $('#kbSm').onchange = () => { sid = $('#kbSm').value; MK.simpanPilihan(cur.id, sid); ganti(true); };
    $('#kbGo').onclick = go; ganti(false);
  });
}
window.FHKarbon = { css, excel, open, hitung, ringkas, awalHD, hitungHD, param, total, BASE, emisiTahun, metodeK };
})();
