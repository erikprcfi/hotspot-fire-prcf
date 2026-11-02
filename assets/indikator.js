/* Fire Hotspot – INDIKATOR PROGRAM per Hutan Desa (v10)
 * Ringkasan satu halaman untuk Hutan Desa yang sedang dibuka (bukan total 6 Hutan Desa), siap dilampirkan ke laporan program.
 * Semua angka dibaca dari berkas data resmi yang sudah ada di situs ini – tidak ada angka yang dikarang:
 *   - titik panas di dalam Hutan Desa per tahun: NASA FIRMS arsip VIIRS S-NPP (data/analisis/<id>_hd.json → titik_panas)
 *   - titik panas ≤ 5 km / di dalam HD 12 bulan terakhir: NASA FIRMS NRT/SP (data/hotspots.json, dimuat aplikasi)
 *   - hutan & kehilangan tutupan pohon: Hansen/UMD GFC-2025-v1.13 (data/analisis → hutan)
 *   - tutupan lahan & emisi FREL: BASIS DATA TUTUPAN LAHAN BERSAMA (FHModelKLHK.muat – sumber utama Hutan Desa: peta tahunan lokal yang
 *     sudah di-groundcheck bila ada, selain itu model KLHK 2020 + Hansen) & FHKarbon.ringkas – angka sama dengan alat Tutupan lahan & Emisi karbon
 *   - emisi, serapan & fluks karbon bersih: Harris dkk. 2021 / Gibbs dkk. 2025, WRI (data/analisis → karbon)
 *   - bekas terbakar terpetakan: Sentinel-2 dNBR otomatis Fire Hotspot, radius ≤ 5 km (data/bekas_terbakar/indeks.json)
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const J = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
const SUM = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
const KLHK = { 2001: 'Hutan Lahan Kering Primer', 2002: 'Hutan Lahan Kering Sekunder', 2005: 'Hutan Rawa Primer', 20051: 'Hutan Rawa Sekunder', 2007: 'Semak Belukar', 20071: 'Belukar Rawa', 20092: 'Pertanian Lahan Kering Campur Semak',
  20091: 'Pertanian Lahan Kering', 20093: 'Sawah', 2010: 'Perkebunan', 2012: 'Permukiman', 2014: 'Tanah Terbuka', 5001: 'Tubuh Air', 50011: 'Rawa', 20094: 'Tambak', 2006: 'Hutan Tanaman', 2004: 'Hutan Mangrove Primer', 20041: 'Hutan Mangrove Sekunder', 20122: 'Bandara/Pelabuhan', 20141: 'Pertambangan' };
const NM = c => (window.FHTutupan && FHTutupan.NAMA && FHTutupan.NAMA[c]) || KLHK[c] || String(c);
async function kumpul(s, k) {
  const ALL = window.FHAll ? FHAll() : [], now = Date.now();
  const [BT, A] = await Promise.all([J('data/bekas_terbakar/indeks.json').catch(() => null), J(`data/analisis/${s.id}_hd.json`)]);
  const H = A.hutan || {}, K = A.karbon || {}, F = A.emisi_frel || {}, TP = (A.titik_panas || {}).per_tahun || {};
  const tpY = Object.fromEntries(Object.entries(TP).map(([y, v]) => [y, v['VIIRS S-NPP'] || 0]));
  const bt = {}; Object.values((BT && BT.musim) || {}).forEach(m => { if (m.lokasi === s.id && m.status === 'selesai' && m.luas_ha != null) { const y = m.awal.slice(0, 4); bt[y] = (bt[y] || 0) + m.luas_ha; } });
  const y12 = p => now - p.when <= 365 * 864e5, near = ALL.filter(p => p.ls && p.ls[k] <= 5 && y12(p)).length, inside = ALL.filter(p => p.ls && p.ls[k] <= 0 && y12(p)).length;
  const lossY = H.kehilangan_per_tahun_ha || {}, thn = ['2021', '2022', '2023', '2024', '2025'];
  let M = null, frel = [], tk = {}, tkTahun = '', src = 'KLHK 2020 + Hansen', srcNama = '';
  try { M = await FHModelKLHK.muat(s.id); const lok = !!(M.info && M.info.lokal), yEnd = lok ? M.yMax : Math.min(M.yMax, 2025); src = M.info.singkat || src; srcNama = M.info.nama || '';
    tkTahun = String(yEnd); tk = M.kondisi(yEnd);
    const per = [[2020, Math.min(2025, M.yMax)], [lok ? M.yMin + 1 : 2001, yEnd]].filter(([a, b], i, L) => a <= b && (i === 0 || a !== L[0][0] || b !== L[0][1]));
    frel = (await Promise.all(per.map(([a, b]) => window.FHKarbon ? FHKarbon.ringkas(s.id, a, b).catch(() => null) : null))).filter(Boolean)
      .map(x => ({ periode: x.periode, deforestasi_ha: x.defo, degradasi_ha: x.degr, emisi_tCO2e: x.emisi_thn, tumbuh: x.tumbuh })); } catch (e) { }
  return { id: s.id, nama: s.hd_nama, lphd: s.lphd || '', kec: s.kec || '', luas: A.luas_ha || s.luas_hd_ha, tpY, tp5: thn.reduce((a, y) => a + (tpY[y] || 0), 0), tpTot: SUM(tpY), near, inside,
    hutan2000: H.hutan_2000_ha, hutan2025: H.hutan_tersisa_2025_ha, hilang: H.persen_hilang, lossY, loss5: thn.reduce((a, y) => a + (lossY[y] || 0), 0), lossTot: SUM(lossY),
    fluks: K.fluks_bersih_per_tahun_tCO2e, emisi: K.emisi_bruto_per_tahun_tCO2e, serap: K.serapan_bruto_per_tahun_tCO2, stok: K.stok_karbon_total_2000_tC, bt, btTot: SUM(bt),
    frel, tk, tkTahun, src, srcNama, lok: !!(M && M.info && M.info.lokal) };
}
function baris(r) { const n1 = X().n1, v = (x, d) => x == null ? '–' : n1(x, d);
  return [['Luas Hutan Desa', v(r.luas, 2), 'ha', 'Batas SK Hutan Desa (data/geo.json)'],
    ['Hutan tahun 2000 (tajuk ≥30%)', v(r.hutan2000, 2), 'ha', 'Hansen GFC v1.13'], ['Hutan tersisa 2025', v(r.hutan2025, 2), 'ha', 'Hansen GFC v1.13'],
    ['Kehilangan tutupan pohon sejak 2000', v(r.hilang, 2), '%', 'Hansen GFC v1.13'], ['Kehilangan tutupan pohon 2001–2025', v(r.lossTot, 2), 'ha', 'Hansen GFC v1.13'], ['Kehilangan tutupan pohon 2021–2025', v(r.loss5, 2), 'ha', 'Hansen GFC v1.13'],
    ...r.frel.map(p => [`Deforestasi ${p.periode}`, v(p.deforestasi_ha, 2), 'ha', r.src]),
    ...r.frel.map(p => [`Degradasi ${p.periode}`, v(p.degradasi_ha, 2), 'ha', r.src]),
    ...(r.lok ? r.frel.map(p => [`Regenerasi (bukan hutan → hutan) ${p.periode}`, v(p.tumbuh, 2), 'ha', r.src]) : []),
    ...r.frel.map(p => [`Emisi FREL ${p.periode}`, v(p.emisi_tCO2e, 0), 'tCO₂e', 'Rumus FREL templat PRCF · ' + r.src]),
    ['Titik panas di dalam HD 2021–2025', v(r.tp5, 0), 'titik', 'NASA FIRMS VIIRS S-NPP'], ['Titik panas di dalam HD 12 bulan terakhir', v(r.inside, 0), 'titik', 'NASA FIRMS NRT'],
    ['Titik panas ≤5 km 12 bulan terakhir', v(r.near, 0), 'titik', 'NASA FIRMS NRT'], ['Bekas terbakar terpetakan ≤5 km', v(r.btTot, 2), 'ha', 'Sentinel-2 dNBR'],
    ['Emisi bruto karbon hutan', v(r.emisi, 0), 'tCO₂e/thn', 'Harris dkk. 2021'], ['Serapan bruto karbon hutan', v(r.serap, 0), 'tCO₂/thn', 'Harris dkk. 2021'],
    ['Fluks karbon bersih', v(r.fluks, 0), 'tCO₂e/thn', 'Harris dkk. 2021'], ['Stok karbon total 2000', v(r.stok, 0), 'tC', 'Harris dkk. 2021']]; }
function tahunan(r) { const ys = []; for (let y = 2016; y <= 2025; y++) ys.push(String(y)); return ys.map(y => [y, r.lossY[y] || 0, r.tpY[y] || 0, r.bt[y] || 0]); }
const SUMBER = ['Titik panas: NASA FIRMS (VIIRS S-NPP 375 m arsip SP; NRT untuk 12 bulan terakhir).', 'Hutan & kehilangan tutupan pohon: Hansen/UMD/Google/USGS/NASA Global Forest Change GFC-2025-v1.13, 30 m, CC BY 4.0. Hutan = tutupan tajuk 2000 ≥ 30%.',
  'Tutupan lahan, deforestasi/degradasi & emisi FREL: basis data tutupan lahan yang sama dengan alat Tutupan lahan & Emisi karbon – peta tahunan lokal yang sudah di-groundcheck bila ada (Nanga Lauk: peta tahunan PRCF 2006–2026), selain itu Peta Penutupan Lahan KLHK 2020 (1:250.000) + Hansen GFC v1.13; emisi dengan rumus templat PRCF (kepadatan karbon per tipe hutan × 0,47 × 44/12).',
  'Karbon: Harris dkk. 2021 (Nat. Clim. Change) & Gibbs dkk. 2025 (ESSD), data publik World Resources Institute, CC BY 4.0. Fluks bersih negatif = hutan menyerap lebih banyak daripada melepas.',
  'Bekas terbakar: indeks dNBR citra Sentinel-2 L2A (ESA Copernicus) yang dihitung otomatis Fire Hotspot untuk musim api ≤ 5 km dari Hutan Desa; musim tertutup awan tidak dihitung.'];
async function open() {
  const A = X(); if (!A || !window.openPage) return; A.pakai('indikator');
  const s = window.FHSiteObj && FHSiteObj(), k = window.FHSiteIdx ? FHSiteIdx() : 0;
  if (!s) return A.toast('Pilih Hutan Desa di Beranda.');
  openPage('Indikator program', s.hd_nama + ' · sumber data resmi', '<div class="fa" id="inW"><div class="fa-card"><p class="fa-note">Menghitung dari data resmi…</p></div></div>', async () => {
    const w = document.getElementById('inW'); let r; try { r = await kumpul(s, k); } catch (e) { w.innerHTML = '<div class="fa-card"><p class="fa-err">Data belum dapat dimuat (perlu internet).</p></div>'; return; }
    const n1 = A.n1, B = baris(r), T = tahunan(r), f0 = r.frel[0], tr = v => A.EN() && window.FHLang ? FHLang.t(String(v ?? '')) : String(v ?? '');
    const TK = Object.entries(r.tk).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]), tkL = SUM(r.tk) || 1;
    const mL = Math.max(.01, ...T.map(x => x[1])), mT = Math.max(1, ...T.map(x => x[2])), mB = Math.max(.01, ...T.map(x => x[3]));
    const bar = (lbl, v, m, c, u) => `<div class="fa-bar" style="--c:${c}"><span>${lbl}</span><i style="width:${(v || 0) / m * 50}%"></i><b>${n1(v || 0, u)}</b></div>`;
    w.innerHTML = `<div class="fa-card"><h5>Hutan Desa</h5><div style="font-size:18px;font-weight:800">${esc(r.nama)}</div><p class="fa-note">${esc([r.lphd, r.kec ? 'Kec. ' + r.kec : '', 'Kab. Kapuas Hulu'].filter(Boolean).join(' · '))} · semua angka & ekspor di halaman ini hanya untuk Hutan Desa ini.</p></div>
     <div class="fa-kpi"><div><small>Luas Hutan Desa</small><b>${n1(r.luas, 0)} ha</b></div><div><small>Hutan tersisa 2025</small><b>${r.hutan2025 == null ? '–' : n1(r.hutan2025, 0) + ' ha'}</b></div>
      <div><small>Titik panas di dalam HD 2021–2025</small><b>${n1(r.tp5, 0)}</b></div><div><small>Emisi FREL ${esc(f0 ? f0.periode : '')}</small><b>${f0 ? n1(f0.emisi_tCO2e, 0) : '–'}<span style="font-size:12px"> tCO₂e</span></b></div></div>
     <div class="fa-row"><button class="fa-btn pri" style="--c:#1D4ED8" id="inDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="inPdf">PDF</button><button class="fa-btn" id="inCsv">CSV</button></div>
     <div class="fa-card fa-scroll"><h4>Indikator</h4><table class="fa-tbl"><tr><th>Indikator</th><th>Nilai</th><th>Satuan</th><th>Sumber</th></tr>${B.map(b => `<tr><td>${esc(b[0])}</td><td class="n"><b>${esc(b[1])}</b></td><td>${esc(b[2])}</td><td style="color:var(--muted)">${esc(b[3])}</td></tr>`).join('')}</table></div>
     <div class="fa-card"><h4>Rincian per tahun</h4><div class="fa-2"><div><h5>Kehilangan tutupan pohon (ha)</h5>${T.map(x => bar(x[0], x[1], mL, '#DC2626', 2)).join('')}</div><div><h5>Titik panas di dalam Hutan Desa (VIIRS S-NPP)</h5>${T.map(x => bar(x[0], x[2], mT, '#F97316', 0)).join('')}
        <h5 style="margin-top:12px">Bekas terbakar terpetakan ≤5 km (ha)</h5>${Object.keys(r.bt).length ? Object.keys(r.bt).sort().map(y => bar(y, r.bt[y], mB, '#9A3412', 2)).join('') : '<p class="fa-note">Belum ada musim api yang dapat dipetakan (tertutup awan / tidak ada kejadian).</p>'}</div></div></div>
     <div class="fa-card"><h4>Tutupan lahan ${esc(r.tkTahun)}</h4><p class="fa-note">Sumber: ${esc(r.srcNama)} (kelas dipadankan dengan kode KLHK).</p>${TK.length ? TK.map(([c, v]) => bar(esc(NM(c)), v, TK[0][1], '#15803D', 2)).join('') + `<p class="fa-note">Total ${n1(tkL, 2)} ha. Rincian per periode & peta ada di alat "Tutupan lahan (KLHK)".</p>` : '<p class="fa-note">Peta KLHK belum tersedia untuk Hutan Desa ini.</p>'}</div>
     <div class="fa-card"><h4>Sumber & metode</h4>${SUMBER.map(x => `<p class="fa-note">• ${esc(x)}</p>`).join('')}<p class="fa-note">Data patroli & tindak lanjut tersedia di menu "Patroli & temuan" dan "Tindak lanjut kejadian".</p></div>`;
    const slug = String(r.nama).replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_'), nm = (A.EN() ? 'programme_indicators_' : 'indikator_program_') + slug, judul = 'Indikator Program – ' + r.nama;
    const sub = [r.lphd, 'Kabupaten Kapuas Hulu, Kalimantan Barat', 'dibuat ' + A.wib(Date.now())].filter(Boolean).join(' · ');
    const H1 = ['Indikator', 'Nilai', 'Satuan', 'Sumber'], H2 = ['Tahun', 'Kehilangan tutupan pohon (ha)', 'Titik panas di dalam HD', 'Bekas terbakar ≤5 km (ha)'], H3 = ['Kelas tutupan lahan (kode KLHK)', 'Kode', 'Luas (ha)', '% luas'];
    const T2 = () => T.map(x => [x[0], n1(x[1], 2), n1(x[2], 0), n1(x[3], 2)]), T3 = () => TK.map(([c, v]) => [NM(c), c, n1(v, 2), n1(v / tkL * 100, 2)]);
    w.querySelector('#inCsv').onclick = () => { const R = [['hutan_desa', 'bagian', 'indikator', 'nilai', 'satuan', 'sumber']];
      B.forEach(b => R.push([r.nama, 'indikator', b[0], b[1], b[2], b[3]])); T.forEach(x => { R.push([r.nama, 'tahunan', 'kehilangan tutupan pohon ' + x[0], +x[1].toFixed(4), 'ha', 'Hansen GFC v1.13'], [r.nama, 'tahunan', 'titik panas di dalam HD ' + x[0], x[2], 'titik', 'NASA FIRMS VIIRS S-NPP'], [r.nama, 'tahunan', 'bekas terbakar ≤5 km ' + x[0], +x[3].toFixed(4), 'ha', 'Sentinel-2 dNBR']); });
      TK.forEach(([c, v]) => R.push([r.nama, 'tutupan lahan ' + r.tkTahun, NM(c) + ' (' + c + ')', v, 'ha', r.src]));
      A.dl(new Blob([A.csv(R.map(x => x.map(tr)))], { type: 'text/csv' }), nm + '.csv'); };
    w.querySelector('#inPdf').onclick = async () => { try { await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }); if (window.FHLang) FHLang.pdf(doc);
      doc.setFillColor(11, 59, 44); doc.rect(0, 0, 210, 26, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(judul, 14, 12); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(sub, 14, 19);
      doc.setTextColor(20); const tb = (y, h, b) => { doc.autoTable({ startY: y, head: [h], body: b, theme: 'grid', headStyles: { fillColor: [30, 122, 88], fontSize: 8 }, styles: { fontSize: 8 }, margin: { left: 14, right: 14 } }); return doc.lastAutoTable.finalY + 6; };
      let y = tb(32, H1, B); y = tb(y, H2, T2()); if (TK.length) y = tb(y, H3, T3());
      if (y > 260) { doc.addPage(); y = 20; } doc.setFontSize(8); doc.setTextColor(80); SUMBER.forEach(x => { const L = doc.splitTextToSize(x, 182); if (y + L.length * 3.6 > 285) { doc.addPage(); y = 20; } doc.text(L, 14, y); y += L.length * 3.6 + 1.5; });
      doc.save(nm + '.pdf'); A.pakai('indikator_pdf'); } catch (e) { A.toast(e.message); } };
    w.querySelector('#inDoc').onclick = async () => { try { await A.lib(A.DOCX); const d = window.docx, run = (t, o = {}) => new d.TextRun({ text: tr(t), font: 'Arial', size: o.size || 18, bold: o.bold, color: o.color });
      const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 16, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1E7A58' } : undefined, margins: { top: 50, bottom: 50, left: 70, right: 70 } });
      const tbl = (h, b) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: h.map(x => cell(x, true)) }), ...b.map(x => new d.TableRow({ children: x.map(c => cell(c)) }))] });
      const hd = t => new d.Paragraph({ children: [run(t, { bold: true, size: 24 })], spacing: { before: 240, after: 100 } });
      const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Fire Hotspot', sections: [{ children: [
        new d.Paragraph({ children: [run(judul, { bold: true, size: 32, color: '0B3B2C' })], spacing: { after: 100 } }), new d.Paragraph({ children: [run(sub, { color: '55665D' })], spacing: { after: 200 } }),
        hd('1. Indikator'), tbl(H1, B), hd('2. Rincian per tahun'), tbl(H2, T2()), ...(TK.length ? [hd('3. Tutupan lahan ' + r.tkTahun + ' – ' + r.src), tbl(H3, T3())] : []),
        hd('Sumber & metode'), ...SUMBER.map(x => new d.Paragraph({ children: [run('• ' + x, { size: 16, color: '55665D' })], spacing: { after: 60 } }))] }] });
      A.dl(await d.Packer.toBlob(doc), nm + '.docx'); A.pakai('indikator_word'); } catch (e) { A.toast(e.message); } };
  });
}
window.FHIndikator = { open, kumpul };
})();
