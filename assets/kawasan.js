/* Pantau Rimbak – Status kawasan, moratorium (PIPPIB), gambut, perhutanan sosial & izin (FHKawasan)
 * Sumber: Kebijakan Satu Peta – Badan Informasi Geospasial (kspservices.big.go.id/satupeta, layanan PUBLIK), berisi
 * Informasi Geospasial Tematik resmi kementerian: penetapan kawasan hutan, PIPPIB (Inpres 5/2019), lahan gambut,
 * Kesatuan Hidrologis Gambut & fungsi ekosistem gambut, zonasi kawasan konservasi, rawan karhutla, persetujuan
 * perhutanan sosial, dan perizinan pemanfaatan hutan. Dipanggil langsung dari HP/peramban (CORS diizinkan Satu Peta).
 * Peta penetapan hanya memuat kawasan yang sudah DITETAPKAN; tidak tercantum ≠ pasti bukan kawasan hutan.
 */
(function () {
'use strict';
const EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => (v == null || !isFinite(+v)) ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d });
const toast = t => (window.toastMsg || (x => alert(x)))(t);
const SP = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/';
const FUNGSI = { '100100': ['Hutan Lindung (HL)', 'Protection Forest (HL)'], '100200': ['Kawasan Suaka/Pelestarian Alam', 'Conservation area (KSA/KPA)'], '100210': ['Cagar Alam', 'Strict Nature Reserve'], '100211': ['Cagar Alam', 'Strict Nature Reserve'],
  '100220': ['Suaka Margasatwa', 'Wildlife Reserve'], '100221': ['Suaka Margasatwa', 'Wildlife Reserve'], '100230': ['Taman Buru', 'Hunting Park'], '100240': ['Taman Nasional', 'National Park'], '100241': ['Taman Nasional (laut)', 'Marine National Park'],
  '100250': ['Taman Wisata Alam', 'Nature Recreation Park'], '100251': ['Taman Wisata Alam (laut)', 'Marine Recreation Park'], '100260': ['Taman Hutan Raya', 'Grand Forest Park (Tahura)'], '100300': ['Hutan Produksi Tetap (HP)', 'Permanent Production Forest (HP)'],
  '100400': ['Hutan Produksi Terbatas (HPT)', 'Limited Production Forest (HPT)'], '100500': ['Hutan Produksi yang dapat Dikonversi (HPK)', 'Convertible Production Forest (HPK)'] };
const fungsi = k => { const f = FUNGSI[String(k)]; return f ? (EN() ? f[1] : f[0]) : I(`Kawasan hutan (kode ${k})`, `Forest area (code ${k})`); };
const tgl = ms => { try { return ms ? new Date(+ms).toLocaleDateString(EN() ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch (e) { return ''; } };
const v = x => (x == null || x === '-' || x === '' ? '' : String(x));
/* lapisan yang diperiksa: [kunci, layanan, id lapisan, judul, peringkas atribut] */
const L = [
  ['kawasan', 'KEHUTANAN', 0, () => I('Kawasan hutan (penetapan)', 'Forest area (gazetted)'), a => `${fungsi(a.fungsitap)}${v(a.nkws) ? ' · ' + esc(a.nkws) : ''}${v(a.nosktap) ? `<br><small class="muted">SK ${esc(a.nosktap)}${a.tglsktap ? ' · ' + tgl(a.tglsktap) : ''}</small>` : ''}`],
  ['pippib', 'PERIZINAN_DAN_PERTANAHAN', 8, () => I('Moratorium izin baru (PIPPIB)', 'New-permit moratorium (PIPPIB)'), a => esc(a.pippib || I('Masuk PIPPIB', 'In PIPPIB'))],
  ['konservasi', 'SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 33, () => I('Zonasi kawasan konservasi', 'Conservation area zoning'), a => `${esc(a.nkws || '')}${v(a.remark) ? ' · ' + I('zona/blok ', 'zone/block ') + esc(a.remark) : ''}${v(a.fgskws) ? ' · ' + esc(a.fgskws) : ''}${v(a.nupt) ? `<br><small class="muted">${esc(a.nupt)}</small>` : ''}`],
  ['gambut', 'SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 6, () => I('Lahan gambut (Kementan)', 'Peatland (Min. of Agriculture)'), a => `${esc(a.landform || I('Gambut', 'Peat'))}${v(a.usda1) ? `<br><small class="muted">${esc(a.usda1)}</small>` : ''}`],
  ['khg', 'SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 37, () => I('Kesatuan Hidrologis Gambut (KHG)', 'Peat Hydrological Unit (KHG)'), a => esc(a.kode_khg || 'KHG')],
  ['feg', 'SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 48, () => I('Fungsi ekosistem gambut', 'Peat ecosystem function'), a => `${esc(a.feg_50k || a.feg_peat || '')}${v(a.peat_thick) ? ' · ' + I('ketebalan ', 'thickness ') + esc(a.peat_thick) : ''}${v(a.kode_khg) ? `<br><small class="muted">KHG ${esc(a.kode_khg)}</small>` : ''}`],
  ['rawan', 'SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 47, () => I('Kerawanan karhutla (2022)', 'Fire-prone class (2022)'), a => esc(a.kelas || '')],
  ['hd', 'KEHUTANAN', 13, () => I('Persetujuan Hutan Desa', 'Village Forest approval'), a => `${esc(a.nama_ld || a.namobj || '')}${v(a.nama_desa) ? ' · ' + esc(a.nama_desa) : ''}${v(a.no_sk_pphd) ? `<br><small class="muted">SK ${esc(a.no_sk_pphd)}${a.tgl_sk_pphd ? ' · ' + tgl(a.tgl_sk_pphd) : ''}${a.luas_pphd ? ' · ' + nf(a.luas_pphd) + ' ha' : ''}</small>` : ''}`],
  ['hkm', 'KEHUTANAN', 12, () => I('Persetujuan Hutan Kemasyarakatan', 'Community Forest approval'), a => `${esc(a.nama_kelompok || '')}${v(a.nama_desa) ? ' · ' + esc(a.nama_desa) : ''}${v(a.no_sk_pphkm) ? `<br><small class="muted">SK ${esc(a.no_sk_pphkm)}</small>` : ''}`],
  ['adat', 'KEHUTANAN', 3, () => I('Hutan Adat', 'Customary Forest'), a => `${esc(v(a.nama_mha) || v(a.namobj) || I('Hutan Adat', 'Customary forest'))}${v(a.desa) ? ' · ' + esc(a.desa) : ''}${v(a.nomor_sk) ? `<br><small class="muted">SK ${esc(a.nomor_sk)}${a.luas_sk ? ' · ' + nf(a.luas_sk) + ' ha' : ''}</small>` : ''}`],
  ['htr', 'KEHUTANAN', 2, () => I('Hutan Tanaman Rakyat', 'Community Plantation Forest'), a => `${esc(v(a.nama_kelompok) || v(a.namobj) || 'HTR')}${v(a.nama_desa) ? ' · ' + esc(a.nama_desa) : ''}${v(a.no_sk_pphtr) ? `<br><small class="muted">SK ${esc(a.no_sk_pphtr)}</small>` : ''}`],
  ['ha', 'PERIZINAN_DAN_PERTANAHAN', 1, () => I('Izin hutan alam (PBPH-HA/IUPHHK-HA)', 'Natural forest concession (IUPHHK-HA)'), a => `${esc(v(a.namobj) || 'IUPHHK-HA')}${v(a.no_sk) ? `<br><small class="muted">SK ${esc(a.no_sk)}${a.lssk ? ' · ' + nf(a.lssk) + ' ha' : ''}</small>` : ''}`],
  ['hti', 'PERIZINAN_DAN_PERTANAHAN', 2, () => I('Izin hutan tanaman (PBPH-HT/IUPHHK-HTI)', 'Plantation forest concession (IUPHHK-HTI)'), a => `${esc(v(a.namobj) || 'IUPHHK-HTI')}${v(a.no_sk) ? `<br><small class="muted">SK ${esc(a.no_sk)}${a.lssk ? ' · ' + nf(a.lssk) + ' ha' : ''}</small>` : ''}`],
  ['re', 'PERIZINAN_DAN_PERTANAHAN', 3, () => I('Izin restorasi ekosistem (IUPHHK-RE)', 'Ecosystem restoration concession'), a => `${esc(v(a.namobj) || 'IUPHHK-RE')}${v(a.no_sk) ? `<br><small class="muted">SK ${esc(a.no_sk)}${a.lssk ? ' · ' + nf(a.lssk) + ' ha' : ''}</small>` : ''}`],
];
async function J(u, ms = 25000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); if (d.error) throw new Error(d.error.message || 'galat layanan'); return d; } finally { clearTimeout(t); } }
function geomParam(G) {
  if (G.titik) return { geometry: `${G.titik[1]},${G.titik[0]}`, geometryType: 'esriGeometryPoint' };
  return { geometry: JSON.stringify({ rings: G.rings, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon' };
}
async function cek(G, onP) {
  const hasil = {}; let n = 0;
  const satu = async l => {
    const body = new URLSearchParams(Object.assign(geomParam(G), { inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false', resultRecordCount: '20', f: 'json' })).toString();
    if (body.length <= 1800) return J(`${SP}${l[1]}/MapServer/${l[2]}/query?${body}`);
    const c = new AbortController(), t = setTimeout(() => c.abort(), 30000);
    try { const r = await fetch(`${SP}${l[1]}/MapServer/${l[2]}/query`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: c.signal }); const d = await r.json(); if (d.error) throw new Error(d.error.message || 'galat layanan'); return d; } finally { clearTimeout(t); }
  };
  await Promise.all(L.map(async l => {
    let e1;
    for (let k = 0; k < 2; k++) {
      try { const d = await satu(l); hasil[l[0]] = (d.features || []).map(f => f.attributes); e1 = null; break; }
      catch (e) { e1 = e; if (k === 0) await new Promise(r => setTimeout(r, 1200)); }
    }
    /* layanan terjangkau tetapi lapisan menolak kueri (galat di server sumber) → "sumber", bukan galat jaringan */
    if (e1) hasil[l[0]] = /failed to execute query|galat layanan/i.test(String(e1.message)) ? 'sumber' : null;
    n++; onP && onP(n, L.length);
  }));
  return hasil;
}
/* ringkas untuk detail titik panas: fungsi kawasan · PIPPIB · fungsi ekosistem gambut */
async function ringkas(lat, lon) {
  const G = { titik: [lat, lon] }, ambil = async (k) => { const l = L.find(x => x[0] === k); try { const d = await J(`${SP}${l[1]}/MapServer/${l[2]}/query?${new URLSearchParams(Object.assign(geomParam(G), { inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false', f: 'json' }))}`, 15000); return (d.features || []).map(f => f.attributes); } catch (e) { return null; } };
  const [kw, pp, fe] = await Promise.all([ambil('kawasan'), ambil('pippib'), ambil('feg')]);
  if (kw == null && pp == null && fe == null) return null;
  const t = [];
  if (kw && kw.length) t.push(fungsi(kw[0].fungsitap) + (v(kw[0].nkws) ? ' (' + kw[0].nkws + ')' : '')); else if (kw) t.push(I('Tidak tercantum di peta penetapan kawasan hutan', 'Not in the gazetted forest-area map'));
  if (pp && pp.length) t.push(I('PIPPIB: ', 'PIPPIB: ') + (pp[0].pippib || I('ya', 'yes')));
  if (fe && fe.length) t.push(I('Ekosistem gambut: ', 'Peat ecosystem: ') + (fe[0].feg_50k || fe[0].feg_peat || ''));
  return t.join(' · ');
}
function render(B, A, H) {
  const ok = l => Array.isArray(H[l[0]]), ada = L.filter(l => ok(l) && H[l[0]].length), kosong = L.filter(l => ok(l) && !H[l[0]].length), gagal = L.filter(l => H[l[0]] == null), sumber = L.filter(l => H[l[0]] === 'sumber');
  B.innerHTML = `<div class="fa-card"><h4 style="margin:0 0 4px">${esc(A.nama)}</h4><p class="fa-note">${I(`${ada.length} lapisan tercantum · ${kosong.length} tidak tercantum${sumber.length ? ' · ' + sumber.length + ' belum dapat diperiksa' : ''}${gagal.length ? ' · ' + gagal.length + ' gagal dimuat' : ''}`, `${ada.length} layers found · ${kosong.length} not found${sumber.length ? ' · ' + sumber.length + ' unavailable at source' : ''}${gagal.length ? ' · ' + gagal.length + ' failed' : ''}`)}</p></div>
    ${ada.length ? `<div class="fa-card">${ada.map(l => `<div style="padding:9px 0;border-top:1px solid var(--line,#e5e7eb)"><small class="muted" style="display:block;font-weight:700">${l[3]()}</small>${H[l[0]].slice(0, 6).map(a => `<div style="margin-top:3px">${l[4](a)}</div>`).join('')}${H[l[0]].length > 6 ? `<small class="muted">+${H[l[0]].length - 6} ${I('lainnya', 'more')}</small>` : ''}</div>`).join('')}</div>` : ''}
    ${kosong.length ? `<div class="fa-card"><small class="muted"><b>${I('Tidak tercantum', 'Not found')}:</b> ${kosong.map(l => l[3]()).join(' · ')}</small></div>` : ''}
    ${sumber.length ? `<div class="fa-card"><small class="muted"><b>${I('Belum dapat diperiksa', 'Cannot be checked yet')}:</b> ${sumber.map(l => l[3]()).join(' · ')} – ${I('lapisan ini sedang tidak melayani kueri di server Satu Peta BIG (bukan masalah perangkat Anda); akan otomatis terbaca saat sumber pulih.', 'this layer is currently not answering queries on the BIG One Map server (not a problem with your device); it will be read automatically once the source recovers.')}</small></div>` : ''}
    ${gagal.length ? `<div class="fa-card"><small class="fa-err">${I('Gagal dimuat (coba lagi)', 'Failed to load (try again)')}: ${gagal.map(l => l[3]()).join(' · ')}</small></div>` : ''}
    <div class="fa-card"><p class="fa-note"><b>${I('Penting', 'Important')}:</b> ${I('informasi ini untuk penapisan awal, bukan dokumen hukum. Peta penetapan kawasan hutan hanya memuat kawasan yang sudah ditetapkan; lokasi yang tidak tercantum belum tentu bukan kawasan hutan. Untuk kepastian status, gunakan SK dan peta resmi dari Kementerian Kehutanan / BPKH setempat.', 'this is for initial screening, not a legal document. The gazetted forest-area map only contains areas already gazetted; locations not listed are not necessarily outside the forest estate. For certainty, use the official decrees and maps of the Ministry of Forestry / local BPKH.')}</p>
    <p class="fa-note">${I('Sumber', 'Source')}: ${I('Kebijakan Satu Peta – Badan Informasi Geospasial (layanan publik Informasi Geospasial Tematik kementerian/lembaga)', 'One Map Policy – Geospatial Information Agency (public thematic geospatial services of ministries)')}; ${I('diakses', 'accessed')} ${new Date().toLocaleDateString(EN() ? 'en-GB' : 'id-ID')}.</p></div>`;
}
function wilayah() {
  const ring = g => { const fs = g.type === 'FeatureCollection' ? g.features.map(f => f.geometry) : g.type === 'Feature' ? [g.geometry] : [g]; const R = [];
    fs.filter(Boolean).forEach(x => { const P = x.type === 'Polygon' ? [x.coordinates] : x.type === 'MultiPolygon' ? x.coordinates : []; P.forEach(p => { let r = p[0]; if (r.length > 120) { const k = Math.ceil(r.length / 120); r = r.filter((_, i) => i % k === 0); r.push(r[0]); } R.push(r.map(c => [+(+c[0]).toFixed(5), +(+c[1]).toFixed(5)])); }); }); return R; };
  try { if (window.FHWilSaya && FHWilSaya.aktif()) { const s = FHWilSaya.site(); const r = ring(s.hd); if (r.length) return { nama: s.hd_nama, rings: r }; } } catch (e) { }
  try { if (window.FHAksesHD && FHAksesHD() && window.FHSiteObj && FHSiteObj()) { const s = FHSiteObj(); const r = ring(s.hd || s.desa); if (r.length) return { nama: s.hd_nama, rings: r }; } } catch (e) { }
  return null;
}
async function muatDi(B, A) {
  if (navigator.onLine === false) { B.innerHTML = `<div class="fa-card"><p>${I('Perlu internet untuk memeriksa layanan Satu Peta.', 'Internet is needed to query One Map services.')}</p></div>`; return; }
  B.innerHTML = `<div class="fa-card"><p class="fa-note" id="kwP">${I('Memeriksa 14 lapisan Satu Peta…', 'Checking 14 One Map layers…')}</p></div>`;
  const H = await cek(A, (n, t) => { const e = document.getElementById('kwP'); if (e) e.textContent = I(`Memeriksa lapisan ${n}/${t}…`, `Checking layer ${n}/${t}…`); });
  if (L.every(l => H[l[0]] == null)) { B.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Layanan Satu Peta tidak dapat dihubungi saat ini. Coba lagi nanti.', 'One Map services cannot be reached right now. Try again later.')}</p></div>`; return; }
  if (document.body.contains(B)) render(B, A, H);
}
function buka() {
  try { window.FHAlat && FHAlat.pakai('kawasan'); } catch (e) { }
  const W = wilayah();
  openPage(I('Status kawasan & izin', 'Land status & permits'), W ? W.nama : I('Satu titik lokasi', 'A single location'), `<div class="fa"><div class="fa-card"><p class="fa-note">${W ? I('Memeriksa seluruh wilayah (batas poligon).', 'Checking the whole area (polygon boundary).') : I('Pilih titik yang diperiksa:', 'Choose the point to check:')}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${W ? `<button class="btn pri tap" id="kwW" style="padding:9px 14px">${I('Periksa wilayah', 'Check area')}</button>` : ''}<button class="btn ${W ? '' : 'pri '}tap" id="kwG" style="padding:9px 14px">${I('Lokasi saya (GPS)', 'My location (GPS)')}</button><button class="btn tap" id="kwM" style="padding:9px 14px">${I('Pusat peta', 'Map centre')}</button></div></div><div id="kwB"></div></div>`, () => {
    const B = document.getElementById('kwB');
    if (W) { document.getElementById('kwW').onclick = () => muatDi(B, W); muatDi(B, W); }
    document.getElementById('kwM').onclick = () => { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return toast(I('Peta belum siap', 'Map not ready')); const c = m.getCenter(); muatDi(B, { nama: I(`Pusat peta (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`, `Map centre (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`), titik: [c.lat, c.lng] }); };
    document.getElementById('kwG').onclick = () => { if (!navigator.geolocation) return toast(I('GPS tidak tersedia', 'GPS unavailable'));
      B.innerHTML = `<div class="fa-card"><p class="fa-note">${I('Mencari lokasi…', 'Locating…')}</p></div>`;
      navigator.geolocation.getCurrentPosition(p => muatDi(B, { nama: I(`Lokasi saya (${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)})`, `My location (${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)})`), titik: [p.coords.latitude, p.coords.longitude] }),
        () => { B.innerHTML = `<div class="fa-card"><p>${I('Lokasi tidak didapat. Izinkan akses lokasi, atau pakai Pusat peta.', 'Could not get location. Allow location access, or use Map centre.')}</p></div>`; }, { enableHighAccuracy: true, timeout: 15000 }); };
  });
}
/* lapisan peta dinamis Satu Peta (gambar ekspor ArcGIS per ubin) */
const LP = { pippib: ['PERIZINAN_DAN_PERTANAHAN', 8], kawasan: ['KEHUTANAN', 0], feg: ['SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 48], rawan: ['SUMBER_DAYA_ALAM_DAN_LINGKUNGAN', 47] }, AKT = {};
function lapisan(id) {
  const [svc, lid] = LP[id];
  const T = L.TileLayer.extend({ getTileUrl(c) { const n = Math.pow(2, c.z), R = 20037508.342789244, s = 2 * R / n, x0 = -R + c.x * s, y1 = R - c.y * s;
    return `${SP}${svc}/MapServer/export?bbox=${x0},${y1 - s},${x0 + s},${y1}&bboxSR=3857&imageSR=3857&size=256,256&layers=show:${lid}&format=png32&transparent=true&f=image`; } });
  return new T('', { opacity: .6, maxZoom: 19, attribution: 'Kebijakan Satu Peta – BIG', className: 'satupeta' });
}
function toggle(id, map, btn) { if (!map || !LP[id]) return; const l = AKT[id] || (AKT[id] = lapisan(id)); const on = !map.hasLayer(l); on ? l.addTo(map) : map.removeLayer(l); if (btn) btn.setAttribute('aria-pressed', String(on)); return on; }
const aktif = (id, map) => !!(AKT[id] && map && map.hasLayer(AKT[id]));
window.FHKawasan = { buka, cek, ringkas, toggle, aktif, fungsi };
})();
