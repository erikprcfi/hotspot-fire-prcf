/* Fire Hotspot – INDIKATOR PROGRAM (v9)
 * Ringkasan satu halaman untuk 6 Hutan Desa dampingan PRCF, siap dilampirkan ke laporan program (mis. pemantauan Plan Vivo).
 * Semua angka dibaca dari berkas data resmi yang sudah ada di situs ini – tidak ada angka yang dikarang:
 *   - titik panas di dalam Hutan Desa per tahun: NASA FIRMS arsip VIIRS S-NPP (data/analisis/<id>_hd.json → titik_panas)
 *   - titik panas ≤ 5 km 12 bulan terakhir: NASA FIRMS NRT/SP (data/hotspots.json)
 *   - hutan & kehilangan tutupan pohon: Hansen/UMD GFC-2025-v1.13 (data/analisis → hutan)
 *   - emisi, serapan & fluks karbon bersih: Harris dkk. 2021 / Gibbs dkk. 2025, WRI (data/analisis → karbon)
 *   - bekas terbakar terpetakan: Sentinel-2 dNBR otomatis Fire Hotspot, radius ≤ 5 km (data/bekas_terbakar/indeks.json)
 *   - patroli & tindak lanjut (bila masuk): basis data PRCF (Apps Script v9)
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const J = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
const SUM = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
async function kumpul() {
  const S = window.FHSites ? FHSites() : [], ALL = window.FHAll ? FHAll() : [], now = Date.now();
  const [BT, ...AN] = await Promise.all([J('data/bekas_terbakar/indeks.json').catch(() => null), ...S.map(s => J(`data/analisis/${s.id}_hd.json`).catch(() => null))]);
  const thn = []; for (let y = 2021; y <= 2025; y++) thn.push(String(y));
  return S.map((s, k) => { const A = AN[k] || {}, H = A.hutan || {}, K = A.karbon || {}, TP = (A.titik_panas || {}).per_tahun || {};
    const tpY = Object.fromEntries(Object.entries(TP).map(([y, v]) => [y, v['VIIRS S-NPP'] || 0]));
    const bt = {}; Object.values((BT && BT.musim) || {}).forEach(m => { if (m.lokasi === s.id && m.status === 'selesai' && m.luas_ha != null) { const y = m.awal.slice(0, 4); bt[y] = (bt[y] || 0) + m.luas_ha; } });
    const near = ALL.filter(p => p.ls && p.ls[k] <= 5 && now - p.when <= 365 * 864e5).length, inside = ALL.filter(p => p.ls && p.ls[k] <= 0 && now - p.when <= 365 * 864e5).length;
    return { id: s.id, nama: s.hd_nama, lphd: s.lphd || '', luas: A.luas_ha || s.luas_hd_ha, tpY, tp5: thn.reduce((a, y) => a + (tpY[y] || 0), 0), tpTot: SUM(tpY), near, inside,
      hutan2000: H.hutan_2000_ha, hutan2025: H.hutan_tersisa_2025_ha, hilang: H.persen_hilang, lossY: H.kehilangan_per_tahun_ha || {}, loss5: thn.reduce((a, y) => a + ((H.kehilangan_per_tahun_ha || {})[y] || 0), 0),
      fluks: K.fluks_bersih_per_tahun_tCO2e, emisi: K.emisi_bruto_per_tahun_tCO2e, serap: K.serapan_bruto_per_tahun_tCO2, stok: K.stok_karbon_total_2000_tC, bt, btTot: SUM(bt), sumber: A.sumber || {} };
  });
}
function kol(R) { const n1 = X().n1;
  return [['Hutan Desa', r => r.nama], ['Luas (ha)', r => n1(r.luas, 1)], ['Hutan 2000 (ha)', r => r.hutan2000 == null ? '–' : n1(r.hutan2000, 1)], ['Hutan tersisa 2025 (ha)', r => r.hutan2025 == null ? '–' : n1(r.hutan2025, 1)],
    ['Kehilangan sejak 2000 (%)', r => r.hilang == null ? '–' : n1(r.hilang, 2)], ['Kehilangan 2021–2025 (ha)', r => n1(r.loss5, 2)], ['Titik panas di dalam HD 2021–2025', r => n1(r.tp5, 0)],
    ['Titik panas ≤5 km 12 bulan', r => n1(r.near, 0)], ['Bekas terbakar terpetakan ≤5 km (ha)', r => n1(r.btTot, 2)], ['Fluks karbon bersih (tCO₂e/thn)', r => r.fluks == null ? '–' : n1(r.fluks, 0)],
    ['Stok karbon total 2000 (tC)', r => r.stok == null ? '–' : n1(r.stok, 0)]]; }
const SUMBER = ['Titik panas: NASA FIRMS (VIIRS S-NPP 375 m arsip SP; NRT untuk 12 bulan terakhir).', 'Hutan & kehilangan tutupan pohon: Hansen/UMD/Google/USGS/NASA Global Forest Change GFC-2025-v1.13, 30 m, CC BY 4.0. Hutan = tutupan tajuk 2000 ≥ 30%.',
  'Karbon: Harris dkk. 2021 (Nat. Clim. Change) & Gibbs dkk. 2025 (ESSD), data publik World Resources Institute, CC BY 4.0. Fluks bersih negatif = hutan menyerap lebih banyak daripada melepas.',
  'Bekas terbakar: indeks dNBR citra Sentinel-2 L2A (ESA Copernicus) yang dihitung otomatis Fire Hotspot untuk musim api ≤ 5 km dari Hutan Desa; musim tertutup awan tidak dihitung.'];
async function open() {
  const A = X(); if (!A || !window.openPage) return; A.pakai('indikator');
  openPage('Indikator program', '6 Hutan Desa · sumber data resmi', '<div class="fa" id="inW"><div class="fa-card"><p class="fa-note">Menghitung dari data resmi…</p></div></div>', async () => {
    const w = document.getElementById('inW'); let R; try { R = await kumpul(); } catch (e) { w.innerHTML = '<div class="fa-card"><p class="fa-err">Data belum dapat dimuat (perlu internet).</p></div>'; return; }
    const n1 = A.n1, K = kol(R), tot = (f) => R.reduce((a, r) => a + (+f(r) || 0), 0);
    const cur = window.FHSiteObj && FHSiteObj(), sel = R.find(r => cur && r.id === cur.id) || R[0];
    w.innerHTML = `<div class="fa-kpi"><div><small>Luas 6 Hutan Desa</small><b>${n1(tot(r => r.luas), 0)} ha</b></div><div><small>Hutan tersisa 2025</small><b>${n1(tot(r => r.hutan2025), 0)} ha</b></div>
      <div><small>Titik panas di dalam HD 2021–2025</small><b>${n1(tot(r => r.tp5), 0)}</b></div><div><small>Fluks karbon bersih</small><b>${n1(tot(r => r.fluks), 0)}<span style="font-size:12px"> tCO₂e/thn</span></b></div></div>
     <div class="fa-row"><button class="fa-btn pri" style="--c:#1D4ED8" id="inDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="inPdf">PDF</button><button class="fa-btn" id="inCsv">CSV</button></div>
     <div class="fa-card fa-scroll"><table class="fa-tbl"><tr>${K.map(k => `<th>${esc(k[0])}</th>`).join('')}</tr>${R.map(r => `<tr>${K.map((k, i) => `<td class="${i ? 'n' : ''}">${i ? esc(k[1](r)) : `<b>${esc(k[1](r))}</b>`}</td>`).join('')}</tr>`).join('')}</table></div>
     <div class="fa-card"><h4>Rincian per tahun</h4><select id="inSel">${R.map(r => `<option value="${esc(r.id)}" ${r === sel ? 'selected' : ''}>${esc(r.nama)}</option>`).join('')}</select><div id="inDet" style="margin-top:12px"></div></div>
     <div class="fa-card"><h4>Sumber & metode</h4>${SUMBER.map(s => `<p class="fa-note">• ${esc(s)}</p>`).join('')}<p class="fa-note">Data patroli & tindak lanjut tersedia di menu "Patroli & temuan" dan "Tindak lanjut kejadian".</p></div>`;
    const det = id => { const r = R.find(x => x.id === id); const ys = Object.keys(r.lossY).filter(y => +y >= 2016); const mL = Math.max(.01, ...ys.map(y => r.lossY[y] || 0)), mT = Math.max(1, ...ys.map(y => r.tpY[y] || 0)), mB = Math.max(.01, ...ys.map(y => r.bt[y] || 0));
      const bar = (lbl, v, m, c, u) => `<div class="fa-bar" style="--c:${c}"><span>${lbl}</span><i style="width:${(v || 0) / m * 50}%"></i><b>${n1(v || 0, u)}</b></div>`;
      w.querySelector('#inDet').innerHTML = `<div class="fa-2"><div><h5>Kehilangan tutupan pohon (ha)</h5>${ys.map(y => bar(y, r.lossY[y], mL, '#DC2626', 2)).join('')}</div><div><h5>Titik panas di dalam Hutan Desa (VIIRS S-NPP)</h5>${ys.map(y => bar(y, r.tpY[y], mT, '#F97316', 0)).join('')}
        <h5 style="margin-top:12px">Bekas terbakar terpetakan ≤5 km (ha)</h5>${Object.keys(r.bt).length ? Object.keys(r.bt).sort().map(y => bar(y, r.bt[y], mB, '#9A3412', 2)).join('') : '<p class="fa-note">Belum ada musim api yang dapat dipetakan (tertutup awan / tidak ada kejadian).</p>'}</div></div>`; };
    w.querySelector('#inSel').onchange = e => det(e.target.value); det(sel.id);
    const nm = A.EN() ? 'programme_indicators' : 'indikator_program', tr = v => A.EN() && window.FHLang ? FHLang.t(String(v ?? '')) : String(v ?? '');
    const rows = () => R.map(r => K.map(k => k[1](r)));
    w.querySelector('#inCsv').onclick = () => { const raw = R.map(r => [r.nama, r.luas, r.hutan2000, r.hutan2025, r.hilang, +r.loss5.toFixed(2), r.tp5, r.near, +r.btTot.toFixed(2), r.fluks, r.stok]);
      A.dl(new Blob([A.csv([K.map(k => tr(k[0])), ...raw.map(x => x.map(tr))])], { type: 'text/csv' }), nm + '.csv'); };
    w.querySelector('#inPdf').onclick = async () => { try { await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }); if (window.FHLang) FHLang.pdf(doc);
      doc.setFillColor(11, 59, 44); doc.rect(0, 0, 297, 26, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Indikator Program – 6 Hutan Desa dampingan Yayasan PRCF Indonesia', 14, 12); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('Kabupaten Kapuas Hulu, Kalimantan Barat · dibuat ' + A.wib(Date.now()), 14, 19);
      doc.setTextColor(20); doc.autoTable({ startY: 32, head: [K.map(k => k[0])], body: rows(), theme: 'grid', headStyles: { fillColor: [30, 122, 88], fontSize: 7.5 }, styles: { fontSize: 8 }, margin: { left: 14, right: 14 } });
      let y = doc.lastAutoTable.finalY + 8; doc.setFontSize(8); doc.setTextColor(80); SUMBER.forEach(s => { const L = doc.splitTextToSize(s, 268); doc.text(L, 14, y); y += L.length * 3.6 + 1.5; });
      doc.save(nm + '.pdf'); } catch (e) { A.toast(e.message); } };
    w.querySelector('#inDoc').onclick = async () => { try { await A.lib(A.DOCX); const d = window.docx, run = (t, o = {}) => new d.TextRun({ text: tr(t), font: 'Arial', size: o.size || 18, bold: o.bold, color: o.color });
      const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 16, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1E7A58' } : undefined, margins: { top: 50, bottom: 50, left: 70, right: 70 } });
      const t = new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: K.map(k => cell(k[0], true)) }), ...rows().map(r => new d.TableRow({ children: r.map(c => cell(c)) }))] });
      const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Fire Hotspot', sections: [{ properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } }, children: [
        new d.Paragraph({ children: [run('Indikator Program – 6 Hutan Desa dampingan Yayasan PRCF Indonesia', { bold: true, size: 32, color: '0B3B2C' })], spacing: { after: 100 } }),
        new d.Paragraph({ children: [run('Kabupaten Kapuas Hulu, Kalimantan Barat · dibuat ' + A.wib(Date.now()), { color: '55665D' })], spacing: { after: 200 } }), t,
        new d.Paragraph({ children: [run('Sumber & metode', { bold: true, size: 24 })], spacing: { before: 240, after: 100 } }), ...SUMBER.map(s => new d.Paragraph({ children: [run('• ' + s, { size: 16, color: '55665D' })], spacing: { after: 60 } }))] }] });
      A.dl(await d.Packer.toBlob(doc), nm + '.docx'); } catch (e) { A.toast(e.message); } };
  });
}
window.FHIndikator = { open, kumpul };
})();
