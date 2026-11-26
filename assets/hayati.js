/* Pantau Rimbak – Keanekaragaman hayati wilayah (FHHayati)
 * Sumber: GBIF (Global Biodiversity Information Facility, api.gbif.org) – catatan perjumpaan yang dipublikasikan museum,
 * herbarium, lembaga riset, dan pengamatan warga terverifikasi; status IUCN dari GBIF (Daftar Merah IUCN);
 * Apendiks CITES dari Species+ (data/bara/cites); status dilindungi Permen LHK P.106/2018 (data/hayati/dilindungi.json).
 * Wilayah: wilayah SHP aktif → Hutan Desa yang dibuka → radius dari lokasi GPS / pusat peta.
 * Perlindungan: koordinat catatan TIDAK ditampilkan sama sekali; spesies CR/EN/VU, CITES I, atau dilindungi nasional ditandai sensitif.
 * "Tidak ada catatan" ≠ "tidak ada spesies": banyak wilayah belum pernah disurvei.
 */
(function () {
'use strict';
const EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => (v == null || !isFinite(+v)) ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d });
const API = 'https://api.gbif.org/v1/';
const IUCN = { CR: ['Kritis', 'Critically Endangered', '#B91C1C'], EN: ['Genting', 'Endangered', '#EA580C'], VU: ['Rentan', 'Vulnerable', '#CA8A04'], NT: ['Hampir terancam', 'Near Threatened', '#65A30D'], LC: ['Risiko rendah', 'Least Concern', '#16A34A'], DD: ['Kurang data', 'Data Deficient', '#64748B'], NE: ['Belum dievaluasi', 'Not Evaluated', '#94A3B8'] };
const KELAS = { Aves: ['Burung', 'Birds'], Mammalia: ['Mamalia', 'Mammals'], Reptilia: ['Reptil', 'Reptiles'], Amphibia: ['Amfibi', 'Amphibians'], Actinopterygii: ['Ikan', 'Fish'], Insecta: ['Serangga', 'Insects'], Magnoliopsida: ['Tumbuhan berbunga (dikotil)', 'Flowering plants (dicots)'], Liliopsida: ['Tumbuhan berbunga (monokotil)', 'Flowering plants (monocots)'], Polypodiopsida: ['Paku-pakuan', 'Ferns'], Pinopsida: ['Tumbuhan berdaun jarum', 'Conifers'], Arachnida: ['Laba-laba & kalajengking', 'Arachnids'], Gastropoda: ['Siput', 'Snails'], Agaricomycetes: ['Jamur', 'Fungi'] };
const toast = t => (window.toastMsg || (x => alert(x)))(t);
const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
async function J(u, ms = 30000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } }
const JL = u => fetch(u, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
let DIL = null; const dilindungi = async () => DIL || (DIL = JL('data/hayati/dilindungi.json').then(j => new Set((j && j.nama) || [])));
const CIT = {}; async function cites(nm) { const h = String(nm || '').charAt(0).toLowerCase(); if (!/[a-z]/.test(h)) return null; const d = await (CIT[h] || (CIT[h] = JL(`data/bara/cites/${h}.json`))); const r = d && d[nm]; return r ? String(r.a || '') : null; }

/* ---------- geometri: WKT poligon (berlawanan arah jarum jam, ≤ 80 titik) ---------- */
function cincinTerbesar(g) {
  const fs = g.type === 'FeatureCollection' ? g.features.map(f => f.geometry) : g.type === 'Feature' ? [g.geometry] : [g]; let best = null, ba = -1;
  const luas = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
  fs.filter(Boolean).forEach(x => { const P = x.type === 'Polygon' ? [x.coordinates] : x.type === 'MultiPolygon' ? x.coordinates : []; P.forEach(p => { const a = Math.abs(luas(p[0])); if (a > ba) { ba = a; best = p[0]; } }); });
  if (!best) return null; let r = best.slice(); if (luas(r) < 0) r.reverse();
  const n = r.length; if (n > 80) { const k = Math.ceil(n / 80); r = r.filter((_, i) => i % k === 0); r.push(r[0]); }
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
  return 'POLYGON((' + r.map(c => (+c[0]).toFixed(4) + ' ' + (+c[1]).toFixed(4)).join(',') + '))';
}
function wilayah() {
  try { if (window.FHWilSaya && FHWilSaya.aktif()) { const s = FHWilSaya.site(); const w = cincinTerbesar(s.hd); if (w) return { nama: s.hd_nama, wkt: w, jenis: 'shp', id: s.id }; } } catch (e) { }
  try { if (window.FHAksesHD && FHAksesHD() && window.FHSiteObj && FHSiteObj()) { const s = FHSiteObj(); const w = cincinTerbesar(s.hd || s.desa); if (w) return { nama: s.hd_nama, wkt: w, jenis: 'hd', id: s.id }; } } catch (e) { }
  return null;
}
const geoParam = A => A.wkt ? 'geometry=' + encodeURIComponent(A.wkt) : `geoDistance=${A.lat.toFixed(4)},${A.lon.toFixed(4)},${A.r}km`;

/* ---------- ambil & rangkum ---------- */
async function rangkum(A, onP) {
  const kunci = 'pr_hayati_' + (A.wkt ? A.id : `${A.lat.toFixed(2)}_${A.lon.toFixed(2)}_${A.r}`);
  try { const c = JSON.parse(LS.get(kunci) || 'null'); if (c && Date.now() - c.t < 7 * 864e5 && c.v === 3) return c.d; } catch (e) { }
  const dasar = `occurrence/search?${geoParam(A)}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT`;
  onP && onP(I('Menghitung catatan…', 'Counting records…'));
  const F = await J(`${API}${dasar}&limit=0&facet=speciesKey&facet=iucnRedListCategory&facet=basisOfRecord&facet=year&facetLimit=1000&facetMincount=1`);
  const fac = n => ((F.facets || []).find(f => f.field === n) || { counts: [] }).counts;
  const SP = {}; fac('SPECIES_KEY').forEach(c => SP[c.name] = { key: c.name, n: c.count });
  // contoh catatan untuk nama, kelas, status (maks. 1.500 catatan, terbaru lebih dulu tidak dijamin oleh GBIF)
  const halaman = Math.min(5, Math.ceil(F.count / 300));
  for (let i = 0; i < halaman; i++) {
    onP && onP(I(`Membaca catatan ${i * 300 + 1}–${Math.min(F.count, (i + 1) * 300)} dari ${nf(F.count)}…`, `Reading records ${i * 300 + 1}–${Math.min(F.count, (i + 1) * 300)} of ${nf(F.count)}…`));
    const R = await J(`${API}${dasar}&limit=300&offset=${i * 300}`);
    (R.results || []).forEach(o => { if (!o.speciesKey) return; const s = SP[o.speciesKey] || (SP[o.speciesKey] = { key: String(o.speciesKey), n: 1 });
      s.nama = s.nama || o.species; s.kelas = s.kelas || o.class; s.kerajaan = s.kerajaan || o.kingdom; s.famili = s.famili || o.family; if (o.iucnRedListCategory) s.iucn = o.iucnRedListCategory;
      if (o.year && (!s.th || o.year > s.th)) s.th = o.year; });
  }
  // spesies terancam: daftar lengkap lewat faset status IUCN, nama & tahun terakhir per spesies
  onP && onP(I('Memeriksa spesies terancam…', 'Checking threatened species…'));
  const T = await J(`${API}${dasar}&limit=0&iucnRedListCategory=CR&iucnRedListCategory=EN&iucnRedListCategory=VU&facet=speciesKey&facetLimit=200&facetMincount=1`);
  const tk = ((T.facets || [])[0] || { counts: [] }).counts.map(c => c.name).slice(0, 80);
  for (const k of tk) { const s = SP[k] || (SP[k] = { key: k, n: 0 });
    try { if (!s.nama || !s.iucn) { const d = await J(`${API}species/${k}`); s.nama = s.nama || d.species || d.canonicalName; s.kelas = s.kelas || d.class; s.kerajaan = s.kerajaan || d.kingdom; s.famili = s.famili || d.family; }
      if (!s.iucn) { const r = await J(`${API}species/${k}/iucnRedListCategory`).catch(() => null); if (r && r.code) s.iucn = r.code; }
      const Y = await J(`${API}${dasar}&speciesKey=${k}&limit=0&facet=year&facetLimit=200`); const ys = ((Y.facets || [])[0] || { counts: [] }).counts.map(c => +c.name).filter(Boolean); if (ys.length) s.th = Math.max(...ys);
    } catch (e) { } }
  const D = await dilindungi(); const L = Object.values(SP).filter(s => s.nama);
  for (const s of L) { s.cites = await cites(s.nama); s.dil = D.has(s.nama); }
  // status IUCN terkini dari daftar periksa IUCN di GBIF untuk spesies dilindungi/CITES yang catatannya belum berstatus (NE/kosong)
  const cek = L.filter(s => (s.dil || s.cites) && (!s.iucn || s.iucn === 'NE')).slice(0, 80);
  if (cek.length) onP && onP(I('Memeriksa status IUCN…', 'Checking IUCN status…'));
  await Promise.all(cek.map(async s => { try { const r = await J(`${API}species/${s.key}/iucnRedListCategory`); if (r && r.code) s.iucn = r.code; } catch (e) { } }));
  const RANK = { CR: 0, EN: 1, VU: 2 };
  for (const s of L) { s.sens = s.iucn in RANK || s.cites === 'I' || s.dil; s.rk = s.iucn in RANK ? RANK[s.iucn] : s.cites === 'I' ? 3 : s.dil ? 4 : 9; }
  const thn = fac('YEAR').map(c => +c.name).filter(Boolean);
  const hasil = { total: F.count, spesies: fac('SPECIES_KEY').length, terbaca: L.length, iucn: Object.fromEntries(fac('IUCN_RED_LIST_CATEGORY').map(c => [c.name, c.count])),
    dasar: Object.fromEntries(fac('BASIS_OF_RECORD').map(c => [c.name, c.count])), th0: thn.length ? Math.min(...thn) : null, th1: thn.length ? Math.max(...thn) : null,
    sejak2015: fac('YEAR').filter(c => +c.name >= 2015).reduce((a, c) => a + c.count, 0), daftar: L.sort((a, b) => (a.rk - b.rk) || (b.n - a.n)).slice(0, 400), t: new Date().toISOString() };
  LS.set(kunci, JSON.stringify({ t: Date.now(), v: 3, d: hasil }));
  return hasil;
}

/* ---------- tampilan ---------- */
const tag = (t, c) => `<span style="display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:800;color:#fff;background:${c};margin:2px 4px 0 0">${t}</span>`;
function baris(s) {
  const iu = IUCN[s.iucn]; const k = KELAS[s.kelas];
  return `<div style="padding:9px 0;border-top:1px solid var(--line,#e5e7eb)"><div style="display:flex;gap:8px;align-items:baseline"><i style="flex:1;font-weight:700">${esc(s.nama)}</i><small class="muted">${nf(s.n)} ${I('catatan', 'records')}</small></div>
    <small class="muted">${esc(k ? (EN() ? k[1] : k[0]) : (s.kelas || s.kerajaan || ''))}${s.famili ? ' · ' + esc(s.famili) : ''}${s.th ? ' · ' + I('terakhir', 'last') + ' ' + s.th : ''}</small><br>
    ${iu ? tag('IUCN ' + s.iucn + ' · ' + (EN() ? iu[1] : iu[0]), iu[2]) : ''}${s.cites ? tag('CITES ' + esc(s.cites), '#7C3AED') : ''}${s.dil ? tag(I('Dilindungi (P.106/2018)', 'Protected (P.106/2018)'), '#0F766E') : ''}
    <a href="https://www.gbif.org/species/${encodeURIComponent(s.key)}" target="_blank" rel="noopener" style="font-size:12px">GBIF ›</a></div>`;
}
function render(B, A, H) {
  const sens = H.daftar.filter(s => s.sens), kel = {}; H.daftar.forEach(s => { const k = s.kelas || s.kerajaan || '–'; kel[k] = (kel[k] || 0) + 1; });
  const kk = Object.entries(kel).sort((a, b) => b[1] - a[1]).slice(0, 8);
  B.innerHTML = `<div class="fa-card"><h4 style="margin:0 0 6px">${esc(A.nama)}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">
        <div><small class="muted">${I('Catatan perjumpaan', 'Occurrence records')}</small><br><b style="font-size:20px">${nf(H.total)}</b></div>
        <div><small class="muted">${I('Spesies tercatat', 'Species recorded')}</small><br><b style="font-size:20px">${nf(H.spesies)}</b></div>
        <div><small class="muted">${I('Terancam (CR/EN/VU)', 'Threatened (CR/EN/VU)')}</small><br><b style="font-size:20px;color:#B91C1C">${nf(H.daftar.filter(s => ['CR', 'EN', 'VU'].includes(s.iucn)).length)}</b></div>
        <div><small class="muted">${I('Dilindungi nasional', 'Nationally protected')}</small><br><b style="font-size:20px;color:#0F766E">${nf(H.daftar.filter(s => s.dil).length)}</b></div></div>
      <p class="fa-note" style="margin-top:8px">${I(`Catatan ${H.th0 || '–'}–${H.th1 || '–'}; ${nf(H.sejak2015)} catatan sejak 2015.`, `Records ${H.th0 || '–'}–${H.th1 || '–'}; ${nf(H.sejak2015)} records since 2015.`)} ${kk.map(([k, n]) => esc(KELAS[k] ? (EN() ? KELAS[k][1] : KELAS[k][0]) : k) + ' ' + n).join(' · ')}</p></div>
    ${H.total ? '' : `<div class="fa-card"><p>${I('Belum ada catatan GBIF di wilayah ini. Ini <b>bukan</b> berarti tidak ada satwa/tumbuhan – kemungkinan wilayah ini belum pernah disurvei atau datanya belum dipublikasikan. Data patroli & temuan tim Anda adalah sumber terbaik.', 'No GBIF records in this area yet. This does <b>not</b> mean there is no wildlife – the area may never have been surveyed or data not published. Your team’s patrol & finding data are the best source.')}</p></div>`}
    ${sens.length ? `<div class="fa-card"><h4 style="margin:0 0 4px">${I('Spesies terancam & dilindungi', 'Threatened & protected species')} (${sens.length})</h4><p class="fa-note">${I('Lokasi catatan tidak ditampilkan untuk melindungi satwa/tumbuhan dari perburuan dan pengambilan liar.', 'Record locations are not shown to protect wildlife/plants from poaching and illegal collection.')}</p>${sens.map(baris).join('')}</div>` : ''}
    ${H.daftar.length > sens.length ? `<div class="fa-card"><details><summary><b>${I('Spesies lain', 'Other species')} (${H.daftar.length - sens.length}${H.spesies > H.terbaca ? ' ' + I('dari contoh catatan', 'from sampled records') : ''})</b></summary>${H.daftar.filter(s => !s.sens).slice(0, 300).map(baris).join('')}</details></div>` : ''}
    <div class="fa-card"><p class="fa-note"><b>${I('Cara membaca', 'How to read')}:</b> ${I('daftar ini adalah spesies yang <b>pernah tercatat</b> (spesimen museum/herbarium, survei, pengamatan warga terverifikasi, kamera jebak) – bukan bukti spesies masih ada sekarang. Catatan lama dan koordinat yang dibulatkan dapat meleset beberapa km. Tidak tercatat ≠ tidak ada.', 'this list shows species that have <b>been recorded</b> (museum/herbarium specimens, surveys, verified citizen observations, camera traps) – not proof they are present today. Old records and rounded coordinates can be off by several km. Not recorded ≠ absent.')}</p>
    <p class="fa-note">${I('Sumber', 'Sources')}: GBIF.org (${I('diakses', 'accessed')} ${new Date(H.t).toLocaleDateString(EN() ? 'en-GB' : 'id-ID')}); ${I('status IUCN dari Daftar Merah IUCN via GBIF', 'IUCN status from the IUCN Red List via GBIF')}; CITES Species+ (UNEP-WCMC); ${I('Permen LHK P.106/2018 tentang Jenis Tumbuhan dan Satwa yang Dilindungi', 'Indonesian Ministerial Regulation P.106/2018 on protected species')}.</p>
    <p class="fa-note">${A.jenis === 'hd' ? I('Data lapangan tim Anda: buka <b>Patroli & temuan</b>.', 'Your team’s field data: open <b>Patrols & findings</b>.') : ''}</p></div>`;
}
async function muatDi(B, A) {
  B.innerHTML = `<div class="fa-card"><p class="fa-note" id="hyP">${I('Menghubungi GBIF…', 'Contacting GBIF…')}</p></div>`;
  if (navigator.onLine === false) { B.innerHTML = `<div class="fa-card"><p>${I('Perlu internet untuk mengambil data GBIF.', 'Internet is needed to fetch GBIF data.')}</p></div>`; return; }
  try { const H = await rangkum(A, t => { const e = document.getElementById('hyP'); if (e) e.textContent = t; }); if (document.body.contains(B)) render(B, A, H); }
  catch (e) { B.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Gagal mengambil data GBIF', 'Failed to fetch GBIF data')} (${esc(e && e.message || e)}). ${I('Coba lagi nanti.', 'Please try again later.')}</p></div>`; }
}
function buka() {
  try { window.FHAlat && FHAlat.pakai('hayati'); } catch (e) { }
  const W = wilayah();
  openPage(I('Keanekaragaman hayati', 'Biodiversity'), W ? W.nama : I('Sekitar lokasi', 'Around a location'), `<div class="fa">${W ? '' : `<div class="fa-card"><p class="fa-note">${I('Pilih pusat pencarian dan radius:', 'Choose the search centre and radius:')}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn pri tap" id="hyG" style="padding:9px 14px">${I('Lokasi saya (GPS)', 'My location (GPS)')}</button><button class="btn tap" id="hyM" style="padding:9px 14px">${I('Pusat peta', 'Map centre')}</button>
      <select id="hyR" style="padding:9px;border-radius:10px;border:1px solid var(--line,#ddd);font:inherit"><option value="5">5 km</option><option value="10" selected>10 km</option><option value="25">25 km</option></select></div></div>`}<div id="hyB"></div></div>`, () => {
    const B = document.getElementById('hyB'); if (W) return muatDi(B, W);
    const r = () => +document.getElementById('hyR').value;
    document.getElementById('hyM').onclick = () => { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return toast(I('Peta belum siap', 'Map not ready')); const c = m.getCenter(); muatDi(B, { nama: I(`Radius ${r()} km dari pusat peta`, `${r()} km around map centre`), lat: c.lat, lon: c.lng, r: r() }); };
    document.getElementById('hyG').onclick = () => { if (!navigator.geolocation) return toast(I('GPS tidak tersedia', 'GPS unavailable'));
      B.innerHTML = `<div class="fa-card"><p class="fa-note">${I('Mencari lokasi…', 'Locating…')}</p></div>`;
      navigator.geolocation.getCurrentPosition(p => muatDi(B, { nama: I(`Radius ${r()} km dari lokasi Anda`, `${r()} km around your location`), lat: p.coords.latitude, lon: p.coords.longitude, r: r() }),
        () => { B.innerHTML = `<div class="fa-card"><p>${I('Lokasi tidak didapat. Izinkan akses lokasi, atau pakai Pusat peta.', 'Could not get location. Allow location access, or use Map centre.')}</p></div>`; }, { enableHighAccuracy: true, timeout: 15000 }); };
  });
}
window.FHHayati = { buka, rangkum, wilayah };
})();
