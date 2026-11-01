/* Fire Hotspot – TUTUPAN LAHAN (acuan Peta Penutupan Lahan resmi KLHK)
 * Acuan: Peta Penutupan Lahan KLHK skala 1:250.000 (PL_2020_AR_250K Kalimantan Barat, kolom kode_pl), dipotong per Hutan Desa
 * (data/klhk/<lokasi>_<tahun>.geojson; luas per kelas di dalam batas Hutan Desa: data/analisis/<lokasi>_hd.json → emisi_frel.tutupan_klhk_ha).
 * Tutupan lahan tiap tahun dibentuk dari peta acuan + kehilangan tutupan pohon tahunan Hansen GFC v1.13 (sama dengan perhitungan emisi FREL/RC2):
 *   Hutan Lahan Kering Primer → Hutan Lahan Kering Sekunder (degradasi); Hutan Lahan Kering Sekunder → Pertanian Lahan Kering Campur Semak (deforestasi);
 *   Hutan Rawa Primer → Hutan Rawa Sekunder (degradasi); Hutan Rawa Sekunder → Belukar Rawa (deforestasi). Kehilangan di kelas bukan hutan tidak mengubah kelas.
 * Kondisi akhir tahun Y = peta acuan dengan semua kehilangan dari tahun peta s.d. Y diterapkan; kondisi awal periode = s.d. tahun sebelum tahun awal.
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
const muatPeta = (id, t) => fetch(`data/klhk/${id}_${t}.geojson`, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
const nf = (v, d = 2) => X().n1(v, d);
const T_ = s => window.FHLang ? FHLang.t(String(s)) : String(s);

function hitung(R, y0, y1, ci) {
  const M = R && R.emisi_frel && window.FHModelKLHK ? FHModelKLHK.buat(R.emisi_frel, ci) : null; if (!M) return null;
  const awal = M.kondisi(y0 - 1), akhir = M.kondisi(y1), tahun = []; for (let y = y0; y <= y1; y++) tahun.push([y, M.kondisi(y)]);
  const ub = {}; let nh = 0, tetap = 0, citra = null;
  for (let y = y0; y <= y1; y++) { const A = M.aktivitas(y); A.ub.forEach(u => { const k = u.dari + '>' + u.ke; ub[k] = (ub[k] || 0) + u.ha; }); nh += A.nh; tetap += A.tetap; if (A.citra) citra = y; }
  const kode = [...new Set([...Object.keys(awal), ...Object.keys(akhir)].map(Number))].filter(k => (awal[k] || 0) > 0.005 || (akhir[k] || 0) > 0.005).sort((a, b) => (akhir[b] || 0) - (akhir[a] || 0));
  return { t: M.t, M, awal, akhir, tahun, ubah: Object.entries(ub).map(([k, v]) => [+k.split('>')[0], +k.split('>')[1], v]), nh, tetap, citra, kode, luas: R.luas_ha,
    hutanAwal: kode.filter(k => HUTAN.has(k)).reduce((s, k) => s + (awal[k] || 0), 0), hutanAkhir: kode.filter(k => HUTAN.has(k)).reduce((s, k) => s + (akhir[k] || 0), 0) };
}

function css() { if (document.getElementById('tl-css')) return; const s = document.createElement('style'); s.id = 'tl-css';
  s.textContent = `.tl-lg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin-top:8px}.tl-lg span{display:inline-flex;align-items:center;gap:6px}.tl-lg i{width:14px;height:14px;border-radius:4px;border:1px solid rgba(0,0,0,.2)}
  .tl-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:6px 0 2px;border:1px solid var(--line)}.tl-bar i{display:block;height:100%}`; document.head.appendChild(s); }
let MAP = null;
function open() {
  const A = X(); if (!A || !window.openPage) return; css(); if (window.FHKarbon && FHKarbon.css) FHKarbon.css();   // gaya akordeon & tabel dipakai bersama
  A.pakai('tutupan');
  const S = window.FHSites ? FHSites() : [], cur = window.FHSiteObj && FHSiteObj();
  openPage('Tutupan lahan (KLHK)', 'Acuan Peta Penutupan Lahan KLHK · pilih periode', `<div class="fa" id="tuW">
    <div class="fa-card"><h5>Hutan Desa</h5><select id="tuS">${S.map(s => `<option value="${esc(s.id)}" ${cur && cur.id === s.id ? 'selected' : ''}>${esc(s.hd_nama)}</option>`).join('')}<option value="*">Semua 6 Hutan Desa (gabungan)</option></select>
     <h5 style="margin-top:12px">Periode</h5><div class="fa-row"><label>Tahun awal<select id="tuY0"></select></label><label>Tahun akhir<select id="tuY1"></select></label></div>
     <p class="fa-note" id="tuInfo"></p></div><div id="tuOut"></div></div>`, async () => {
    const w = document.getElementById('tuW'), $ = s => w.querySelector(s);
    const DATA = {}; await Promise.all(S.map(async s => { DATA[s.id] = await muat(s.id); })); const CI = (await FHModelKLHK.citra()) || {}, ci = id => (CI.lokasi || {})[id];
    const tAll = S.flatMap(s => { const F = DATA[s.id] && DATA[s.id].emisi_frel; return F && F.tutupan_klhk_ha && F.hilang_kode_ha ? Object.keys(F.tutupan_klhk_ha).map(Number) : []; });
    if (!tAll.length) { $('#tuOut').innerHTML = '<div class="fa-card"><p class="fa-err">Peta Penutupan Lahan KLHK belum tersedia (data dihitung ulang otomatis). Coba lagi nanti.</p></div>'; return; }
    const yc = CI.tahun > 2025 && Object.values(CI.lokasi || {}).some(x => x.status === 'selesai') ? CI.tahun : null, yMin = 2001, yMax = yc || 2025, Y = []; for (let y = yMin; y <= yMax; y++) Y.push(y);
    $('#tuY0').innerHTML = Y.map(y => `<option value="${y}" ${y === 2020 ? 'selected' : ''}>${y}${y === yc ? ' (citra)' : ''}</option>`).join(''); $('#tuY1').innerHTML = Y.map(y => `<option value="${y}" ${y === yMax ? 'selected' : ''}>${y}${y === yc ? ' (citra)' : ''}</option>`).join('');
    $('#tuInfo').textContent = `Acuan: Peta Penutupan Lahan KLHK ${[...new Set(tAll)].sort().join(', ')}. Tahun ${yMin}–2025 dianalisis dengan citra Landsat (Hansen GFC v1.13)${yc ? `, tahun ${yc} dengan citra Sentinel-2` : ''}.`;
    const go = () => { let y0 = +$('#tuY0').value, y1 = +$('#tuY1').value; if (y0 > y1) [y0, y1] = [y1, y0]; const id = $('#tuS').value;
      const ids = id === '*' ? S.map(s => s.id) : [id], hasil = ids.map(i => ({ id: i, nama: (S.find(s => s.id === i) || {}).hd_nama, h: hitung(DATA[i], y0, y1, ci(i)) })).filter(x => x.h && x.h.t != null);
      if (!hasil.length) { $('#tuOut').innerHTML = '<div class="fa-card"><p class="fa-err">Tidak ada peta KLHK untuk periode ini.</p></div>'; return; }
      tampil(w, hasil, y0, y1, id === '*'); A.pakai('tutupan_hitung'); };
    ['#tuS', '#tuY0', '#tuY1'].forEach(s => $(s).onchange = go); go();
  });
}
function gabung(hasil) {   // jumlahkan beberapa Hutan Desa
  const sum = k => { const o = {}; hasil.forEach(x => Object.entries(x.h[k]).forEach(([c, v]) => o[c] = (o[c] || 0) + v)); return o; };
  const awal = sum('awal'), akhir = sum('akhir'), tahun = hasil[0].h.tahun.map(([y], i) => { const o = {}; hasil.forEach(x => Object.entries(x.h.tahun[i][1]).forEach(([c, v]) => o[c] = (o[c] || 0) + v)); return [y, o]; });
  const ub = {}; hasil.forEach(x => x.h.ubah.forEach(([a, b, v]) => { const k = a + '>' + b; ub[k] = (ub[k] || 0) + v; }));
  const kode = [...new Set([...Object.keys(awal), ...Object.keys(akhir)].map(Number))].filter(k => (awal[k] || 0) > 0.005 || (akhir[k] || 0) > 0.005).sort((a, b) => (akhir[b] || 0) - (akhir[a] || 0));
  return { t: hasil[0].h.t, awal, akhir, tahun, ubah: Object.entries(ub).map(([k, v]) => [+k.split('>')[0], +k.split('>')[1], v]), nh: hasil.reduce((s, x) => s + x.h.nh, 0), tetap: hasil.reduce((s, x) => s + x.h.tetap, 0), citra: hasil.map(x => x.h.citra).find(Boolean) || null, kode, luas: hasil.reduce((s, x) => s + x.h.luas, 0),
    hutanAwal: hasil.reduce((s, x) => s + x.h.hutanAwal, 0), hutanAkhir: hasil.reduce((s, x) => s + x.h.hutanAkhir, 0) };
}
function tampil(w, hasil, y0, y1, semua) {
  const A = X(), G = semua ? gabung(hasil) : hasil[0].h, nama = semua ? '6 Hutan Desa' : hasil[0].nama, per = y0 === y1 ? String(y0) : `${y0}–${y1}`, out = w.querySelector('#tuOut');
  const sec = (id, j, s, isi, buka) => `<div class="kb-sec${buka ? ' open' : ''}"><button type="button" class="kb-h" aria-expanded="${!!buka}"><span><b>${j}</b><small>${s}</small></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button><div class="kb-acc"><div class="kb-in" id="${id}">${isi}</div></div></div>`;
  const bar = o => `<div class="tl-bar">${G.kode.map(k => `<i title="${esc(NAMA[k] || k)}: ${nf(o[k] || 0)} ha" style="width:${(o[k] || 0) / G.luas * 100}%;background:${WARNA[k] || '#999'}"></i>`).join('')}</div>`;
  const tRing = `<table class="kb-t"><tr><th>Kelas penutupan lahan (KLHK)</th><th>Kode</th><th>Awal ${y0} (ha)</th><th>Akhir ${y1} (ha)</th><th>Perubahan (ha)</th><th>% luas akhir</th></tr>${G.kode.map(k => { const a = G.awal[k] || 0, b = G.akhir[k] || 0; return `<tr><td><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${WARNA[k] || '#999'};margin-right:6px"></span>${esc(NAMA[k] || k)}</td><td class="n">${k}</td><td class="n">${nf(a)}</td><td class="n">${nf(b)}</td><td class="n" style="color:${b - a < -0.005 ? '#B3261E' : b - a > 0.005 ? '#1E7A3B' : 'inherit'}">${b - a > 0 ? '+' : ''}${nf(b - a)}</td><td class="n">${nf(b / G.luas * 100, 2)}%</td></tr>`; }).join('')}
    <tr class="tot"><td>Jumlah</td><td></td><td class="n">${nf(G.kode.reduce((s, k) => s + (G.awal[k] || 0), 0))}</td><td class="n">${nf(G.kode.reduce((s, k) => s + (G.akhir[k] || 0), 0))}</td><td></td><td class="n">100%</td></tr></table>`;
  const tTh = `<table class="kb-t"><tr><th>Kelas</th><th>Awal ${y0}</th>${G.tahun.map(([y]) => `<th>${y}</th>`).join('')}</tr>${G.kode.map(k => `<tr><td>${esc(NAMA[k] || k)}</td><td class="n">${nf(G.awal[k] || 0)}</td>${G.tahun.map(([, o]) => `<td class="n">${nf(o[k] || 0)}</td>`).join('')}</tr>`).join('')}</table>`;
  const tUb = G.ubah.length ? `<table class="kb-t"><tr><th>Dari</th><th>Menjadi</th><th>Jenis</th><th>Luas ${per} (ha)</th></tr>${G.ubah.map(([a, b, v]) => `<tr><td>${esc(NAMA[a])}</td><td>${esc(NAMA[b])}</td><td>${[2001, 2005].includes(a) && b !== 20092 && b !== 20071 ? 'Degradasi' : 'Deforestasi'}</td><td class="n">${nf(v, 4)}</td></tr>`).join('')}</table>` : '<p class="fa-note">Tidak ada perubahan kelas hutan pada periode ini.</p>';
  out.innerHTML = `<div class="fa-kpi"><div><small>Luas ${esc(nama)}</small><b>${nf(G.luas, 1)} ha</b></div><div><small>Hutan awal ${y0}</small><b>${nf(G.hutanAwal, 1)} ha</b></div><div><small>Hutan akhir ${y1}</small><b>${nf(G.hutanAkhir, 1)} ha</b></div><div><small>Perubahan hutan ${per}</small><b style="color:${G.hutanAkhir < G.hutanAwal ? '#B3261E' : 'inherit'}">${nf(G.hutanAkhir - G.hutanAwal, 2)} ha</b></div></div>
    <div class="fa-card"><small style="font-weight:700;color:var(--muted)">Komposisi awal ${y0}</small>${bar(G.awal)}<small style="font-weight:700;color:var(--muted)">Komposisi akhir ${y1}</small>${bar(G.akhir)}<div class="tl-lg">${G.kode.map(k => `<span><i style="background:${WARNA[k] || '#999'}"></i>${esc(NAMA[k] || k)}</span>`).join('')}</div></div>
    <div class="fa-row"><button class="fa-btn pri" style="--c:#15803D" id="tuXl">Excel (.xlsx)</button><button class="fa-btn pri" style="--c:#1D4ED8" id="tuDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="tuPdf">PDF</button><button class="fa-btn" id="tuCsv">CSV</button><button class="fa-btn" id="tuGeo">GeoJSON peta acuan</button></div>
    ${sec('tuMapS', 'Peta penutupan lahan KLHK ' + G.t + ' (acuan)', 'Peta acuan resmi KLHK skala 1:250.000', '<div class="fa-map" id="tuMap"></div>', true)}
    ${sec('tuS1', 'Tutupan lahan awal & akhir periode', `Luas per kelas KLHK, ${per}`, `<div class="fa-scroll">${tRing}</div>`, true)}
    ${sec('tuS2', 'Tutupan lahan per tahun', 'Kondisi akhir tiap tahun (ha)', `<div class="fa-scroll">${tTh}</div>`)}
    ${sec('tuS3', 'Perubahan kelas', 'Degradasi & deforestasi dari data kehilangan tutupan pohon', `<div class="fa-scroll">${tUb}</div><p class="fa-note">Kehilangan tutupan pohon di areal bukan hutan KLHK (ladang/semak, dll.) ${per}: <b>${nf(G.nh, 4)} ha</b> – tidak mengubah kelas dan tidak dihitung sebagai emisi.</p>${G.tetap > 0.0001 ? `<p class="fa-note">Kehilangan sebelum 2020 di areal yang tetap dipetakan hutan oleh KLHK 2020: <b>${nf(G.tetap, 4)} ha</b> – tidak dihitung berubah.</p>` : ''}${G.citra ? `<p class="fa-note" style="color:#B45309">Tahun ${G.citra}: perubahan dari citra Sentinel-2 (indikasi), menunggu rilis data tahunan Hansen.</p>` : ''}`)}
    ${sec('tuS4', 'Metode & sumber', 'Peta acuan, aturan perubahan kelas', METODE.map(m => `<p class="fa-note">• ${esc(m)}</p>`).join(''))}
    ${semua ? '' : '<div class="fa-card"><button class="fa-btn full" id="tuKb">Hitung emisi karbon dari tutupan lahan ini →</button></div>'}`;
  out.querySelectorAll('.kb-sec .kb-h').forEach(b => b.onclick = () => { const s = b.parentElement, op = !s.classList.contains('open'); s.classList.toggle('open', op); b.setAttribute('aria-expanded', op); if (op && s.querySelector('#tuMap') && MAP) setTimeout(() => MAP.invalidateSize(), 320); });
  peta(hasil, G.t);
  const kb = out.querySelector('#tuKb'); if (kb) kb.onclick = () => window.FHKarbon && FHKarbon.open();
  const B = () => ({ nama, per, y0, y1, G, hasil, semua });
  out.querySelector('#tuCsv').onclick = () => { const R = [['hutan_desa', 'kode_klhk', 'kelas', 'tahun', 'luas_ha']]; (semua ? hasil : [{ nama, h: G }]).forEach(x => { x.h.kode.forEach(k => { R.push([x.nama, k, NAMA[k], 'awal ' + y0, (x.h.awal[k] || 0).toFixed(4)]); x.h.tahun.forEach(([y, o]) => R.push([x.nama, k, NAMA[k], y, (o[k] || 0).toFixed(4)])); }); });
    A.dl(new Blob([A.csv(R.map((r, i) => i ? r.map(v => T_(v)) : r.map(h => A.EN() && window.FHLang ? FHLang.kolom(h) : h)))], { type: 'text/csv' }), fn(B(), 'csv')); };
  out.querySelector('#tuGeo').onclick = async () => { const fs = []; for (const x of hasil) { const g = await muatPeta(x.id, G.t); if (g) g.features.forEach(f => fs.push({ type: 'Feature', geometry: f.geometry, properties: { hutan_desa: x.nama, kode_klhk: f.properties.kode, kelas: T_(f.properties.kelas), tahun: G.t, sumber: 'KLHK PL_' + G.t + '_AR_250K' } })); }
    A.dl(new Blob([JSON.stringify({ type: 'FeatureCollection', features: fs })], { type: 'application/geo+json' }), fn(B(), 'geojson')); };
  out.querySelector('#tuXl').onclick = () => excel(B()).catch(e => A.toast(e.message));
  out.querySelector('#tuDoc').onclick = () => word(B()).catch(e => A.toast(e.message));
  out.querySelector('#tuPdf').onclick = () => pdf(B()).catch(e => A.toast(e.message));
}
async function peta(hasil, t) {
  const el = document.getElementById('tuMap'); if (!el || !window.L) return; if (MAP) { try { MAP.remove(); } catch (e) { } MAP = null; }
  const m = L.map(el, { zoomControl: true }); MAP = m; L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 17, attribution: 'Esri, Maxar · KLHK' }).addTo(m);
  const B = []; for (const x of hasil) { const g = await muatPeta(x.id, t); if (g) L.geoJSON(g, { style: f => ({ color: '#222', weight: .6, fillColor: WARNA[f.properties.kode] || '#999', fillOpacity: .62 }), onEachFeature: (f, l) => l.bindPopup(`<b>${esc(T_(NAMA[f.properties.kode] || f.properties.kelas))}</b><br>KLHK ${f.properties.kode} · ${t}`) }).addTo(m);
    const s = (window.FHSites ? FHSites() : []).find(q => q.id === x.id); if (s && s.hd) { const o = L.geoJSON(s.hd, { style: { color: '#FFD84D', weight: 2.6, fill: false } }).addTo(m); B.push(o.getBounds()); } }
  if (B.length) m.fitBounds(B.reduce((a, b) => a.extend(b)), { padding: [14, 14] }); setTimeout(() => m.invalidateSize(), 300);
}
const METODE = ['Tahun sebelum 2020: acuan KLHK 2020 dengan piksel yang hilang sesudah tahun itu dikembalikan ke hutan sekunder (lahan kering atau rawa sesuai kelas acuan); piksel yang hilang sebelum 2020 tetapi masih dipetakan hutan oleh KLHK 2020 tidak diubah. Tahun berjalan (mis. 2026): perubahan dari citra Sentinel-2 20 m (indikasi), menunggu rilis data tahunan Hansen.', 'Acuan tutupan lahan: Peta Penutupan Lahan resmi KLHK (Direktorat IPSDH, Ditjen PKTL) skala 1:250.000 – PL_2020_AR_250K Provinsi Kalimantan Barat, kolom kode_pl; luas dihitung di dalam batas Hutan Desa pada grid 30 m (luas piksel geodesik).',
  'Perubahan tahunan: kehilangan tutupan pohon Hansen/UMD Global Forest Change v1.13 (tajuk tahun 2000 ≥ 30%). Kehilangan di Hutan Lahan Kering Primer → Hutan Lahan Kering Sekunder dan Hutan Rawa Primer → Hutan Rawa Sekunder (degradasi); di Hutan Lahan Kering Sekunder → Pertanian Lahan Kering Campur Semak dan Hutan Rawa Sekunder → Belukar Rawa (deforestasi).',
  'Kehilangan di kelas bukan hutan (ladang, semak, perkebunan, dll.) tidak mengubah kelas. Kondisi akhir tahun Y = peta acuan dengan semua perubahan dari tahun peta s.d. Y; kondisi awal periode = s.d. tahun sebelum tahun awal.',
  'Peta 1:250.000 lebih kasar daripada piksel 30 m (unit pemetaan minimum KLHK ±6,25 ha), sehingga batas kelas di tepi poligon bersifat perkiraan. Tutupan lahan yang sama dipakai untuk perhitungan emisi karbon FREL.'];
const fn = (B, ext) => `${X().EN() ? 'land_cover_KLHK' : 'tutupan_lahan_KLHK'}_${B.semua ? '6_HD' : String(B.nama).replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_')}_${B.per.replace('–', '-')}.${ext}`;
const rowsRing = G => G.kode.map(k => [NAMA[k] || String(k), String(k), nf(G.awal[k] || 0), nf(G.akhir[k] || 0), nf((G.akhir[k] || 0) - (G.awal[k] || 0)), nf((G.akhir[k] || 0) / G.luas * 100) + '%']);
async function excel(B) {
  const A = X(); await A.lib('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); const wb = new window.ExcelJS.Workbook(); wb.creator = 'Yayasan PRCF Indonesia – Fire Hotspot';
  const HD = { font: { name: 'Segoe UI Semibold', color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E3D' } }, alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' } };
  const sheet = (nm, head, rows, w) => { const s = wb.addWorksheet(nm); s.addRow(head.map(T_)); s.getRow(1).eachCell(c => Object.assign(c, HD)); s.getRow(1).height = 32; rows.forEach(r => s.addRow(r.map(v => typeof v === 'string' ? T_(v) : v))); s.columns.forEach((c, i) => { c.width = (w && w[i]) || 16; }); s.eachRow((r, i) => r.eachCell(c => { c.font = Object.assign({ name: 'Segoe UI', size: 10 }, i === 1 ? { name: 'Segoe UI Semibold', color: { argb: 'FFFFFFFF' } } : {}); c.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } }; if (typeof c.value === 'number') c.numFmt = '#,##0.00'; })); return s; };
  const L_ = B.semua ? B.hasil.map(x => ({ nama: x.nama, h: x.h })) : [{ nama: B.nama, h: B.G }];
  sheet('Ringkasan', ['Hutan Desa', 'Kelas penutupan lahan (KLHK)', 'Kode KLHK', `Awal ${B.y0} (ha)`, `Akhir ${B.y1} (ha)`, 'Perubahan (ha)'], L_.flatMap(x => x.h.kode.map(k => [x.nama, NAMA[k] || String(k), k, +(x.h.awal[k] || 0).toFixed(4), +(x.h.akhir[k] || 0).toFixed(4), +((x.h.akhir[k] || 0) - (x.h.awal[k] || 0)).toFixed(4)])), [30, 38, 11, 15, 15, 15]);
  sheet('Per Tahun', ['Hutan Desa', 'Kelas penutupan lahan (KLHK)', `Awal ${B.y0}`, ...B.G.tahun.map(([y]) => String(y))], L_.flatMap(x => x.h.kode.map(k => [x.nama, NAMA[k] || String(k), +(x.h.awal[k] || 0).toFixed(4), ...x.h.tahun.map(([, o]) => +(o[k] || 0).toFixed(4))])), [30, 38]);
  sheet('Perubahan', ['Hutan Desa', 'Dari', 'Menjadi', 'Jenis', `Luas ${B.per} (ha)`], L_.flatMap(x => x.h.ubah.map(([a, b, v]) => [x.nama, NAMA[a], NAMA[b], [2001, 2005].includes(a) ? 'Degradasi' : 'Deforestasi', +v.toFixed(4)])), [30, 32, 38, 14, 16]);
  sheet('Metode', ['Metode & sumber'], METODE.map(m => [m]), [150]);
  A.dl(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fn(B, 'xlsx'));
}
async function word(B) {
  const A = X(); await A.lib(A.DOCX); const d = window.docx, run = (t, o = {}) => new d.TextRun({ text: T_(t), font: 'Arial', size: o.size || 20, bold: o.bold, color: o.color }), p = (t, o = {}) => new d.Paragraph({ children: [run(t, o)], spacing: { after: 120 } });
  const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 17, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1F4E3D' } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 } });
  const tbl = (H, R) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: H.map(h => cell(h, true)) }), ...(R.length ? R : [H.map(() => '–')]).map(r => new d.TableRow({ children: r.map(c => cell(String(c))) }))] });
  const L_ = B.semua ? B.hasil : [{ nama: B.nama, h: B.G }];
  const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Fire Hotspot', sections: [{ children: [p('Tutupan Lahan Hutan Desa (acuan KLHK)', { bold: true, size: 34, color: '1F4E3D' }), p(`${B.nama} · periode ${B.per} · peta acuan KLHK ${B.G.t}`, { color: '55665D' }),
    ...L_.flatMap(x => [p(x.nama, { bold: true, size: 26 }), tbl(['Kelas (KLHK)', 'Kode', `Awal ${B.y0} (ha)`, `Akhir ${B.y1} (ha)`, 'Perubahan (ha)', '% luas'], rowsRing(x.h)), p(''),
      tbl(['Dari', 'Menjadi', 'Jenis', 'Luas (ha)'], x.h.ubah.map(([a, b, v]) => [NAMA[a], NAMA[b], [2001, 2005].includes(a) ? 'Degradasi' : 'Deforestasi', nf(v, 4)])), p('')]),
    p('Metode & sumber', { bold: true, size: 24 }), ...METODE.map(m => p('• ' + m, { size: 18, color: '55665D' })), p(`Fire Hotspot · Yayasan PRCF Indonesia · ${A.wib(Date.now())}`, { size: 16, color: '888888' })] }] });
  A.dl(await d.Packer.toBlob(doc), fn(B, 'docx'));
}
async function pdf(B) {
  const A = X(); await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }); if (window.FHLang) FHLang.pdf(doc);
  const a = s => String(s).replace(/[–—]/g, '-').replace(/→/g, '->');
  doc.setFillColor(31, 78, 61); doc.rect(0, 0, 210, 28, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Tutupan Lahan Hutan Desa (acuan KLHK)', 16, 12); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(a(`${B.nama} · periode ${B.per} · peta acuan KLHK ${B.G.t}`), 16, 20); doc.setTextColor(20);
  let y = 36; const L_ = B.semua ? B.hasil : [{ nama: B.nama, h: B.G }];
  for (const x of L_) { if (y > 240) { doc.addPage(); y = 20; } doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text(a(x.nama), 16, y); y += 3;
    doc.autoTable({ startY: y, head: [['Kelas (KLHK)', 'Kode', `Awal ${B.y0} (ha)`, `Akhir ${B.y1} (ha)`, 'Perubahan (ha)', '% luas']], body: rowsRing(x.h).map(r => r.map(a)), theme: 'grid', headStyles: { fillColor: [31, 78, 61], fontSize: 8 }, styles: { fontSize: 8 }, margin: { left: 16, right: 16 } }); y = doc.lastAutoTable.finalY + 6;
    if (x.h.ubah.length) { doc.autoTable({ startY: y, head: [['Dari', 'Menjadi', 'Jenis', 'Luas (ha)']], body: x.h.ubah.map(([p_, q, v]) => [NAMA[p_], NAMA[q], [2001, 2005].includes(p_) ? 'Degradasi' : 'Deforestasi', nf(v, 4)].map(a)), theme: 'striped', headStyles: { fillColor: [180, 83, 9], fontSize: 8 }, styles: { fontSize: 8 }, margin: { left: 16, right: 16 } }); y = doc.lastAutoTable.finalY + 8; } }
  doc.setFontSize(8); doc.setTextColor(80); METODE.map(a).forEach(t => { const Ls = doc.splitTextToSize(t, 178); if (y + Ls.length * 3.6 > 285) { doc.addPage(); y = 20; } doc.text(Ls, 16, y); y += Ls.length * 3.6 + 1.5; });
  doc.save(fn(B, 'pdf'));
}
window.FHTutupan = { open, hitung, NAMA };
})();
