/* Fire Hotspot – LAHAN KRITIS per Hutan Desa
 * Sumber: Peta Lahan Kritis Kabupaten Kapuas Hulu 2022 (kelas Tidak Kritis, Potensial Kritis, Agak Kritis, Kritis, Sangat Kritis; atribut BPDAS),
 * dipotong tepat di batas Hutan Desa yang sedang dibuka (data/lahan_kritis/<id>_<tahun>.geojson) – unduhan hanya berisi Hutan Desa itu.
 * Ringkasan (data/lahan_kritis/<id>.json, scripts/lahan_kritis.py): luas per kelas (UTM 49N), BPDAS, silang dengan tutupan lahan acuan aplikasi
 * (peta tahunan lokal ber-groundcheck bila ada – Nanga Lauk: PRCF; selain itu Peta Penutupan Lahan KLHK/Kemenhut 2025) dan area prioritas rehabilitasi.
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s), nf = (v, d = 2) => X().n1(v, d), T_ = s => window.FHLang ? FHLang.t(String(s)) : String(s);
const KELAS = ['Tidak Kritis', 'Potensial Kritis', 'Agak Kritis', 'Kritis', 'Sangat Kritis'];
const WARNA = { 'Tidak Kritis': '#1B9E4B', 'Potensial Kritis': '#A6D96A', 'Agak Kritis': '#FDD835', 'Kritis': '#F46D43', 'Sangat Kritis': '#A50026' };
const J = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
const NM = k => (window.FHTutupan && FHTutupan.NAMA && FHTutupan.NAMA[k]) || String(k);
const HUTAN = new Set([2001, 2002, 2004, 20041, 2005, 20051, 2006]);
let MAP = null;
const METODE = R => [`Sumber: ${R.sumber}.`, 'Peta dipotong tepat di batas Hutan Desa; luas dihitung pada WGS 1984 UTM 49N (planimetrik).',
  `Silang dengan tutupan lahan: ${R.silang_tutupan ? R.silang_tutupan.sumber_tutupan : '–'} (tutupan lahan acuan yang sama dengan alat Tutupan lahan & Emisi karbon).`,
  'Prioritas rehabilitasi = lahan Kritis/Sangat Kritis dan Agak Kritis pada tutupan bukan hutan. Lahan Agak Kritis s.d. Sangat Kritis yang masih berhutan umumnya karena lereng & bahaya erosi (penilaian resmi tidak hanya dari tutupan): prioritas perlindungan, bukan penanaman. Tahun & skala kedua peta berbeda, sehingga batas perlu dicek lapangan.',
  'Klasifikasi lahan kritis mengikuti penilaian resmi (penutupan lahan, kemiringan lereng, tingkat bahaya erosi, produktivitas & manajemen) – angka di sini tidak dihitung ulang, hanya dipotong & dijumlahkan per Hutan Desa.'];
function css() { if (document.getElementById('lk-css')) return; const s = document.createElement('style'); s.id = 'lk-css';
  s.textContent = '.lk-bar{display:flex;height:18px;border-radius:9px;overflow:hidden;border:1px solid var(--line);margin:8px 0}.lk-bar i{display:block;height:100%}.lk-lg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px}.lk-lg span{display:inline-flex;align-items:center;gap:6px}.lk-lg i{width:13px;height:13px;border-radius:4px}';
  document.head.appendChild(s); }
async function open() {
  const A = X(); if (!A || !window.openPage) return; css(); if (window.FHKarbon && FHKarbon.css) FHKarbon.css(); A.pakai('lahankritis');
  const s = window.FHSiteObj && FHSiteObj(); if (!s) return A.toast('Pilih Hutan Desa di Beranda.');
  openPage('Lahan kritis', s.hd_nama + ' · peta lahan kritis & prioritas rehabilitasi', '<div class="fa" id="lkW"><div class="fa-card"><p class="fa-note">Memuat data lahan kritis…</p></div></div>', async () => {
    const w = document.getElementById('lkW'), I = await J('data/lahan_kritis/indeks.json'), th = I && I.lokasi && I.lokasi[s.id] && I.lokasi[s.id].tahun;
    const [R, G] = await Promise.all([J(`data/lahan_kritis/${s.id}.json`), th ? J(`data/lahan_kritis/${s.id}_${th}.geojson`) : null]);
    if (!R || !G) { w.innerHTML = '<div class="fa-card"><p class="fa-err">Data lahan kritis belum tersedia untuk Hutan Desa ini.</p></div>'; return; }
    tampil(w, s, R, G);
  });
}
function tampil(w, s, R, G) {
  const A = X(), kh = R.kelas_ha || {}, tot = R.tercakup_ha || 1, K = KELAS.filter(k => kh[k] > 0), P = R.prioritas || {}, SL = (R.silang_tutupan || {}).baris || [];
  const sec = (id, j, sub, isi, buka) => `<div class="kb-sec${buka ? ' open' : ''}"><button type="button" class="kb-h" aria-expanded="${!!buka}"><span><b>${j}</b><small>${sub}</small></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button><div class="kb-acc"><div class="kb-in" id="${id}">${isi}</div></div></div>`;
  const TK = [...new Set(SL.map(x => x[1]))].sort((a, b) => SL.filter(x => x[1] === b).reduce((q, x) => q + x[2], 0) - SL.filter(x => x[1] === a).reduce((q, x) => q + x[2], 0));
  const v = (k, t) => (SL.find(x => x[0] === k && x[1] === t) || [0, 0, 0])[2];
  const tSil = SL.length ? `<table class="kb-t"><tr><th>Lahan kritis \\ tutupan lahan</th>${TK.map(t => `<th>${esc(NM(t))}${HUTAN.has(t) ? ' 🌳' : ''}</th>`).join('')}<th>Jumlah</th></tr>${K.map(k => `<tr><td><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${WARNA[k]};margin-right:6px"></span>${esc(k)}</td>${TK.map(t => { const z = v(k, t); return `<td class="n" style="${z && !HUTAN.has(t) && ['Kritis', 'Sangat Kritis', 'Agak Kritis'].includes(k) ? 'background:#FDE2E1;color:#9F1239;font-weight:700' : ''}">${z ? nf(z) : ''}</td>`; }).join('')}<td class="n"><b>${nf(TK.reduce((q, t) => q + v(k, t), 0))}</b></td></tr>`).join('')}</table>
    <p class="fa-note">Sel merah = prioritas rehabilitasi (Agak Kritis/Kritis/Sangat Kritis pada tutupan bukan hutan). 🌳 = kelas hutan.</p><p class="fa-note"><span>Tutupan lahan:</span> <span>${esc(R.silang_tutupan.sumber_tutupan)}</span></p>` : '<p class="fa-note">Silang dengan tutupan lahan belum tersedia.</p>';
  w.innerHTML = `<div class="fa-card"><h5>Hutan Desa</h5><div style="font-size:18px;font-weight:800">${esc(s.hd_nama)}</div><p class="fa-note">${esc([s.lphd, s.kec ? 'Kec. ' + s.kec : '', 'Kab. Kapuas Hulu'].filter(Boolean).join(' · '))} · peta lahan kritis ${R.tahun} · semua angka & unduhan hanya untuk Hutan Desa ini.</p></div>
    <div class="fa-kpi"><div><small>Luas tercakup peta</small><b>${nf(R.tercakup_ha, 1)} ha</b></div><div><small>Kritis + Sangat Kritis</small><b style="color:#B3261E">${nf((kh['Kritis'] || 0) + (kh['Sangat Kritis'] || 0), 2)} ha</b></div><div><small>Agak Kritis</small><b>${nf(kh['Agak Kritis'] || 0, 2)} ha</b></div><div><small>Tidak + Potensial Kritis</small><b style="color:#1E7A3B">${nf((kh['Tidak Kritis'] || 0) + (kh['Potensial Kritis'] || 0), 2)} ha</b></div></div>
    <div class="fa-kpi"><div><small>Prioritas rehabilitasi (Kritis/Sangat Kritis, bukan hutan)</small><b style="color:#B3261E">${nf(P.kritis_bukan_hutan_ha || 0, 2)} ha</b></div><div><small>Agak Kritis pada bukan hutan</small><b>${nf(P.agak_kritis_bukan_hutan_ha || 0, 2)} ha</b></div><div><small>Agak Kritis–Sangat Kritis yang masih berhutan (lindungi)</small><b>${nf(P.kritis_di_hutan_ha || 0, 2)} ha</b></div></div>
    <div class="fa-card"><div class="lk-bar">${K.map(k => `<i title="${esc(k)}: ${nf(kh[k])} ha" style="width:${kh[k] / tot * 100}%;background:${WARNA[k]}"></i>`).join('')}</div><div class="lk-lg">${K.map(k => `<span><i style="background:${WARNA[k]}"></i>${esc(k)} ${nf(R.kelas_persen[k] || 0, 1)}%</span>`).join('')}</div></div>
    <div class="fa-row"><button class="fa-btn pri" style="--c:#15803D" id="lkXl">Excel (.xlsx)</button><button class="fa-btn pri" style="--c:#1D4ED8" id="lkDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="lkPdf">PDF</button><button class="fa-btn" id="lkCsv">CSV</button><button class="fa-btn pri" style="--c:#7C3AED" id="lkShp">SHP (.zip)</button><button class="fa-btn" id="lkGeo">GeoJSON</button></div>
    ${sec('lkM', 'Peta lahan kritis ' + R.tahun, 'Dipotong di batas Hutan Desa · klik poligon untuk rincian', '<div class="fa-map" id="lkMap"></div>', true)}
    ${sec('lkT', 'Luas per kelas', 'Hektare & persen luas Hutan Desa', `<table class="kb-t"><tr><th>Kelas lahan kritis</th><th>Luas (ha)</th><th>% luas</th></tr>${K.map(k => `<tr><td><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${WARNA[k]};margin-right:6px"></span>${esc(k)}</td><td class="n">${nf(kh[k])}</td><td class="n">${nf(R.kelas_persen[k] || 0, 2)}%</td></tr>`).join('')}<tr class="tot"><td>Jumlah</td><td class="n">${nf(R.tercakup_ha)}</td><td class="n">100%</td></tr></table>
      <p class="fa-note">BPDAS: ${Object.entries(R.bpdas_ha || {}).map(([b, a]) => `${esc(b)} ${nf(a)} ha`).join(' · ')}.</p>`, true)}
    ${sec('lkS', 'Lahan kritis × tutupan lahan', 'Silang dengan tutupan lahan acuan & prioritas rehabilitasi', `<div class="fa-scroll">${tSil}</div>`)}
    ${sec('lkMt', 'Metode & sumber', 'Sumber peta, cara hitung, keterbatasan', METODE(R).map(m => `<p class="fa-note">• ${esc(m)}</p>`).join(''))}`;
  w.querySelectorAll('.kb-sec .kb-h').forEach(b => b.onclick = () => { const x = b.parentElement, op = !x.classList.contains('open'); x.classList.toggle('open', op); b.setAttribute('aria-expanded', op); if (op && x.querySelector('#lkMap') && MAP) setTimeout(() => MAP.invalidateSize(), 320); });
  peta(s, G); const slug = String(s.hd_nama).replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_'), nm = `${A.EN() ? 'critical_land' : 'lahan_kritis'}_${slug}_${R.tahun}`;
  const fitur = () => G.features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: { HD_NAMA: s.hd_nama, LPHD: s.lphd || '', TAHUN: R.tahun, KODE: f.properties.kode, KRITIS: T_(f.properties.kritis), BPDAS: f.properties.bpdas, PRIORITAS: f.properties.kode >= 3 ? T_('Ya – cek tutupan') : T_('Tidak'), SUMBER: T_('Peta Lahan Kritis Kab. Kapuas Hulu ') + R.tahun, LUAS_HA: f.properties.luas_ha } }));
  const KOL = [['HD_NAMA', 'C', 60], ['LPHD', 'C', 60], ['TAHUN', 'N', 4, 0], ['KODE', 'N', 2, 0], ['KRITIS', 'C', 30], ['BPDAS', 'C', 40], ['PRIORITAS', 'C', 30], ['SUMBER', 'C', 80], ['LUAS_HA', 'N', 14, 4]];
  w.querySelector('#lkGeo').onclick = () => { A.dl(new Blob([JSON.stringify({ type: 'FeatureCollection', name: nm, features: fitur() })], { type: 'application/geo+json' }), nm + '.geojson'); A.pakai('lahankritis_unduh'); };
  w.querySelector('#lkShp').onclick = async e => { const bt = e.currentTarget; bt.disabled = true; try { if (!window.FHShp) await A.lib('assets/shp.js?v=62');
      const baca = [`Peta lahan kritis ${s.hd_nama} – ${R.tahun}`, `Dibuat oleh aplikasi Fire Hotspot – Yayasan PRCF Indonesia, ${A.wib(Date.now())}`, '', `Jumlah poligon: ${G.features.length} · luas: ${nf(R.tercakup_ha, 4)} ha · WGS 1984 (EPSG:4326); luas dihitung pada UTM 49N`, '', ...METODE(R),
        '', 'Kolom: HD_NAMA, LPHD, TAHUN, KODE (1 Tidak Kritis … 5 Sangat Kritis), KRITIS, BPDAS, PRIORITAS (kelas Agak Kritis ke atas – cek tutupan lahan), SUMBER, LUAS_HA.'].map(T_).join('\r\n');
      A.dl(await FHShp.zip([{ nama: nm, fitur: fitur(), kolom: KOL }], { [`BACA_${slug}.txt`]: baca }), `${A.EN() ? 'critical_land_SHP' : 'SHP_lahan_kritis'}_${slug}_${R.tahun}.zip`); A.pakai('lahankritis_unduh'); }
    catch (er) { A.toast(er.message); } finally { bt.disabled = false; } };
  const rowsK = () => K.map(k => [k, nf(kh[k]), nf(R.kelas_persen[k] || 0) + '%']), rowsS = () => SL.map(x => [x[0], NM(x[1]), HUTAN.has(x[1]) ? 'Hutan' : 'Bukan hutan', nf(x[2], 4)]);
  const rowsP = () => [['Prioritas rehabilitasi (Kritis/Sangat Kritis, bukan hutan)', nf(P.kritis_bukan_hutan_ha || 0)], ['Agak Kritis pada bukan hutan', nf(P.agak_kritis_bukan_hutan_ha || 0)], ['Agak Kritis–Sangat Kritis yang masih berhutan (prioritas perlindungan)', nf(P.kritis_di_hutan_ha || 0)]];
  w.querySelector('#lkCsv').onclick = () => { const L = [['hutan_desa', 'bagian', 'kelas_lahan_kritis', 'tutupan_lahan', 'luas_ha']]; K.forEach(k => L.push([s.hd_nama, 'luas per kelas', k, '', kh[k].toFixed(4)])); SL.forEach(x => L.push([s.hd_nama, 'silang tutupan', x[0], NM(x[1]), x[2].toFixed(4)]));
    A.dl(new Blob([A.csv(L.map((r, i) => i ? r.map(T_) : r))], { type: 'text/csv' }), nm + '.csv'); };
  w.querySelector('#lkXl').onclick = async () => { try { await A.lib('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); const wb = new ExcelJS.Workbook(); wb.creator = 'Yayasan PRCF Indonesia – Fire Hotspot';
      const sh = (n, h, rows, wd) => { const x = wb.addWorksheet(T_(n)); x.addRow(h.map(T_)); x.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E3D' } }; }); rows.forEach(r => x.addRow(r.map(c => typeof c === 'string' ? T_(c) : c))); x.columns.forEach((c, i) => c.width = (wd && wd[i]) || 18); };
      sh('Luas per kelas', ['Hutan Desa', 'Kelas lahan kritis', 'Luas (ha)', '% luas'], K.map(k => [s.hd_nama, k, +kh[k].toFixed(4), +(R.kelas_persen[k] || 0).toFixed(2)]), [28, 22]);
      sh('Silang tutupan lahan', ['Kelas lahan kritis', 'Tutupan lahan', 'Kelompok', 'Luas (ha)'], SL.map(x => [x[0], NM(x[1]), HUTAN.has(x[1]) ? 'Hutan' : 'Bukan hutan', +x[2].toFixed(4)]), [22, 38, 14]);
      sh('Prioritas', ['Indikator', 'Luas (ha)'], rowsP().map(r => [r[0], +String(r[1]).replace(/\./g, '').replace(',', '.')]), [60]);
      sh('Metode', ['Metode & sumber'], METODE(R).map(m => [m]), [140]);
      A.dl(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nm + '.xlsx'); } catch (e) { A.toast(e.message); } };
  w.querySelector('#lkDoc').onclick = async () => { try { await A.lib(A.DOCX); const d = window.docx, run = (t, o = {}) => new d.TextRun({ text: T_(t), font: 'Arial', size: o.size || 20, bold: o.bold, color: o.color }), p = (t, o = {}) => new d.Paragraph({ children: [run(t, o)], spacing: { after: 120 } });
      const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 17, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1F4E3D' } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 } });
      const tbl = (H, rows) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: H.map(h => cell(h, true)) }), ...(rows.length ? rows : [H.map(() => '–')]).map(r => new d.TableRow({ children: r.map(c => cell(String(c))) }))] });
      const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Fire Hotspot', sections: [{ children: [p('Lahan Kritis ' + s.hd_nama, { bold: true, size: 34, color: '1F4E3D' }), p(`Peta Lahan Kritis Kabupaten Kapuas Hulu ${R.tahun} · ${A.wib(Date.now())}`, { color: '55665D' }),
        p('1. Luas per kelas', { bold: true, size: 26 }), tbl(['Kelas lahan kritis', 'Luas (ha)', '% luas'], rowsK()), p(''), p('2. Prioritas rehabilitasi', { bold: true, size: 26 }), tbl(['Indikator', 'Luas (ha)'], rowsP()), p(''),
        p('3. Lahan kritis × tutupan lahan', { bold: true, size: 26 }), tbl(['Kelas lahan kritis', 'Tutupan lahan', 'Kelompok', 'Luas (ha)'], rowsS()), p(''), p('Metode & sumber', { bold: true, size: 24 }), ...METODE(R).map(m => p('• ' + m, { size: 18, color: '55665D' }))] }] });
      A.dl(await d.Packer.toBlob(doc), nm + '.docx'); } catch (e) { A.toast(e.message); } };
  w.querySelector('#lkPdf').onclick = async () => { try { await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }); if (window.FHLang) FHLang.pdf(doc); const a = t => T_(t).replace(/[–—]/g, '-').replace(/×/g, 'x');
      doc.setFillColor(31, 78, 61); doc.rect(0, 0, 210, 26, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(a('Lahan Kritis ' + s.hd_nama), 16, 12); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(a(`Peta Lahan Kritis Kabupaten Kapuas Hulu ${R.tahun} · ${A.wib(Date.now())}`), 16, 19); doc.setTextColor(20);
      const T = (y, h, b, c) => { doc.autoTable({ startY: y, head: [h.map(a)], body: b.map(r => r.map(a)), theme: 'grid', headStyles: { fillColor: c || [31, 78, 61], fontSize: 8 }, styles: { fontSize: 8 }, margin: { left: 16, right: 16 } }); return doc.lastAutoTable.finalY + 6; };
      let y = T(32, ['Kelas lahan kritis', 'Luas (ha)', '% luas'], rowsK()); y = T(y, ['Indikator', 'Luas (ha)'], rowsP(), [180, 83, 9]); y = T(y, ['Kelas lahan kritis', 'Tutupan lahan', 'Kelompok', 'Luas (ha)'], rowsS(), [71, 85, 105]);
      doc.setFontSize(8); doc.setTextColor(80); METODE(R).map(a).forEach(t => { const L = doc.splitTextToSize(t, 178); if (y + L.length * 3.6 > 285) { doc.addPage(); y = 20; } doc.text(L, 16, y); y += L.length * 3.6 + 1.5; });
      doc.save(nm + '.pdf'); } catch (e) { A.toast(e.message); } };
}
function peta(s, G) {
  const el = document.getElementById('lkMap'); if (!el || !window.L) return; if (MAP) { try { MAP.remove(); } catch (e) { } MAP = null; }
  const m = L.map(el); MAP = m; L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 17, attribution: 'Esri, Maxar' }).addTo(m);
  L.geoJSON(G, { style: f => ({ color: '#222', weight: .5, fillColor: WARNA[f.properties.kritis] || '#999', fillOpacity: .6 }), onEachFeature: (f, l) => l.bindPopup(`<b>${esc(T_(f.properties.kritis))}</b><br>BPDAS ${esc(f.properties.bpdas)}<br>${nf(f.properties.luas_ha, 4)} ha`) }).addTo(m);
  const o = L.geoJSON(s.hd, { style: { color: '#FFD84D', weight: 2.6, fill: false } }).addTo(m); m.fitBounds(o.getBounds(), { padding: [14, 14] }); setTimeout(() => m.invalidateSize(), 300);
}
window.FHLahanKritis = { open, KELAS, WARNA };
})();
