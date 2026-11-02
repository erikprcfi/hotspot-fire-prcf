/* Fire Hotspot – PATROLI ala SMART Mobile (bekerja TANPA SINYAL)
 * Alur: Mulai patroli (Info umum tallysheet) → rekam TRACK GPS (APK: tetap merekam saat layar mati) → ambil WAYPOINT dengan
 * formulir tallysheet PRCF: (1) keanekaragaman hayati – perjumpaan satwa, tanda satwa, tumbuhan, perburuan & gangguan;
 * (2) penyebab deforestasi & degradasi hutan; (3) fitur – pal batas, lanting, menara pantau → Selesai.
 * GPS tidak butuh internet. Semua tersimpan di HP (IndexedDB 'fh-smart'); terkirim otomatis ke database PRCF saat ada sinyal.
 * Ekspor: GPX 1.1 (track + waypoint, untuk SMART Desktop / Garmin / QGIS), Excel tallysheet (tata letak lembar PRCF),
 * CSV, SHP (titik waypoint + garis track), PDF, dan XML patroli SMART (memakai kunci Data Model SMART yang dipasang admin).
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s), T_ = s => window.FHLang ? FHLang.t(String(s)) : String(s);
const nf = (v, d = 2) => X().n1(v, d), Q = () => X().antrean('fh-smart');
/* Data Model SMART Nanga Lauk (ekspor SMART Desktop) – menu pilihan memakai kunci SMART apa adanya */
let DMD = null; const WARNA = [['#15803D', '🦧'], ['#B45309', '🪓'], ['#1D4ED8', '📍'], ['#7C3AED', '•']];
async function muatDM() { if (DMD) return DMD; try { const u = localStorage.getItem('sm_dm'); if (u) return DMD = JSON.parse(u); } catch (e) { }
  const r = await fetch('data/smart/nangalauk_dm.json'); if (!r.ok) throw new Error(T_('Data Model SMART belum tersedia.')); return DMD = await r.json(); }
const KAT = k => DMD.kategori.find(c => c.key === k) || { key: k, nama: k, akar: k, atribut: [] };
const AKAR = () => DMD.kategori.filter(c => !c.induk);
const RUPA = w => { const i = Math.max(0, AKAR().findIndex(c => c.key === KAT(w.kat).akar)); return WARNA[Math.min(i, 3)]; };
const daunPohon = (P, j = [], n = []) => P.flatMap(x => x.anak ? daunPohon(x.anak, j.concat(x.key), n.concat(x.nama)) : [{ key: j.concat(x.key).join('.'), nama: x.nama, grup: n.join(' › ') }]);
const lab = (ak, v) => { const a = DMD.atribut[ak]; if (!a || v == null || v === '') return v ?? '';
  if (a.tipe === 'LIST') return (a.item.find(i => i.key === v) || { nama: v }).nama; if (a.tipe === 'TREE') return (daunPohon(a.pohon).find(i => i.key === v) || { nama: v }).nama; return v; };
const atribut = w => KAT(w.kat).atribut.filter(k => w.d[k] != null && w.d[k] !== '').map(k => [DMD.atribut[k].nama, lab(k, w.d[k]), k]);
let AKTIF = null, W = null, WN = null, FIX = null, LOCK = null, TICK = null, SYNC = false;
const rad = x => x * Math.PI / 180, jarak = (a, b) => 2 * 6371000 * Math.asin(Math.sqrt(Math.sin(rad(b[2] - a[2]) / 2) ** 2 + Math.cos(rad(a[2])) * Math.cos(rad(b[2])) * Math.sin(rad(b[3] - a[3]) / 2) ** 2));
const panjang = tr => { let d = 0; for (let i = 1; i < tr.length; i++) d += jarak([0, 0, tr[i - 1][1], tr[i - 1][2]], [0, 0, tr[i][1], tr[i][2]]); return d; };
const wib = t => X().wib(t), iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'), pad = (n, k = 3) => String(n).padStart(k, '0');
const NAT = () => !!(window.FHNative && FHNative.aktif && FHNative.plugin('BackgroundGeolocation'));
const simpan = p => Q().put(JSON.parse(JSON.stringify(p)));

/* ---------- GPS: tidak butuh internet ---------- */
function onFix(t, la, lo, ak, alt, v) {
  FIX = { t, la, lo, ak, alt }; const p = AKTIF; if (!p || p.status !== 'aktif' || p.jeda) return ui();
  const L = p.track[p.track.length - 1];
  if (ak <= 50 && (!L || jarak([0, 0, L[1], L[2]], [0, 0, la, lo]) >= Math.max(8, ak / 2) || t - L[0] >= 6e4)) { p.track.push([t, +la.toFixed(7), +lo.toFixed(7), Math.round(ak), alt == null ? null : Math.round(alt * 10) / 10]); if (p.track.length % 5 === 0) simpan(p); }
  ui();
}
function gpsMulai() {
  if (W != null || WN != null) return;
  if (NAT()) { const BG = FHNative.plugin('BackgroundGeolocation');
    WN = 'menunggu'; Promise.resolve(BG.addWatcher({ backgroundTitle: 'Patroli Fire Hotspot', backgroundMessage: 'Merekam track patroli (GPS, tanpa internet)', requestPermissions: true, stale: false, distanceFilter: 5 },
      (l, e) => { if (l) onFix(l.time || Date.now(), l.latitude, l.longitude, l.accuracy || 99, l.altitude, l.speed); })).then(id => WN = id).catch(() => { WN = null; webGps(); }); }
  else webGps();
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => LOCK = l).catch(() => { }); } catch (e) { }
}
function webGps() { if (!navigator.geolocation) return; W = navigator.geolocation.watchPosition(p => onFix(p.timestamp || Date.now(), p.coords.latitude, p.coords.longitude, p.coords.accuracy || 99, p.coords.altitude, p.coords.speed), () => { }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 60000 }); }
function gpsStop() { if (W != null) { try { navigator.geolocation.clearWatch(W); } catch (e) { } W = null; } if (WN && WN !== 'menunggu') { try { FHNative.plugin('BackgroundGeolocation').removeWatcher({ id: WN }); } catch (e) { } } WN = null; try { LOCK && LOCK.release(); } catch (e) { } LOCK = null; }

/* ---------- sinkron ke database PRCF saat ada sinyal ---------- */
async function sync() {
  const A = X(); if (SYNC || !A || !A.akun() || navigator.onLine === false) return; SYNC = true;
  try { for (const p of (await Q().all()).filter(x => x.status === 'selesai' && !x.terkirim)) {
      const r = await A.api({ aksi: 'smart_simpan', patroli: p }, 120000).catch(() => null);
      if (r && r.ok) { p.terkirim = Date.now(); p.url_server = r.url || ''; await simpan(p); } else break; } }
  finally { SYNC = false; }
}
window.addEventListener('online', () => setTimeout(sync, 2000)); setInterval(() => sync(), 5 * 6e4); setTimeout(sync, 8000);

/* ---------- tampilan ---------- */
function css() { if (document.getElementById('sm-css')) return; const s = document.createElement('style'); s.id = 'sm-css';
  s.textContent = `#smB{display:grid;gap:16px}#smB>*{margin:0}.fa#smW{gap:16px;padding-bottom:calc(120px + env(safe-area-inset-bottom,0px))}.sm-act{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.sm-act .fa-btn{min-height:52px}#smMap{border-radius:18px;overflow:hidden}.sm-st{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:560px){.sm-st{grid-template-columns:repeat(4,1fr)}}.sm-st div{background:var(--surface-2,#f3f6f4);border-radius:14px;padding:10px}.sm-st small{display:block;font-size:11px;color:var(--muted)}.sm-st b{font-size:17px}
  .sm-wp{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sm-wp button{border:0;border-radius:16px;padding:14px 8px;color:#fff;font:700 13px var(--f,system-ui);cursor:pointer;min-height:76px}.sm-wp button span{display:block;font-size:22px}
  .sm-f label{display:block;margin:10px 0 4px;font-size:12.5px;font-weight:700}.sm-f input,.sm-f select,.sm-f textarea{width:100%;box-sizing:border-box}.sm-gps{font-size:12.5px;font-weight:700}.sm-gps.ok{color:#15803D}.sm-gps.lemah{color:#B45309}.sm-gps.no{color:#B91C1C}
  .sm-li{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.sm-li:first-child{border-top:0}.sm-li .m{flex:1;min-width:0}.sm-li small{display:block;color:var(--muted);font-size:12px}
  .sm-ft{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.sm-ft img{width:64px;height:64px;object-fit:cover;border-radius:10px}`; document.head.appendChild(s); }
let BOX = null, MAP = null, LYR = null;
const bisa = () => { const s = window.FHSiteObj && FHSiteObj(); return !!(s && s.id === 'nangalauk'); };   // menu lengkap hanya HD Nanga Lauk (Data Model SMART Nanga Lauk)
const TIPE_P = [['MARINE', 'Perairan (sampan / speedboat)'], ['GROUND', 'Darat (jalan kaki / kendaraan)']];
function tanya(msg, ok) { const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px';
  ov.innerHTML = `<div class="fa-card" style="max-width:420px"><p style="margin:0 0 14px">${esc(T_(msg))}</p><div class="fa-row"><button class="fa-btn" data-n>${T_('Batal')}</button><button class="fa-btn pri" style="--c:#B3261E" data-y>${T_('Ya')}</button></div></div>`;
  document.body.appendChild(ov); ov.querySelector('[data-n]').onclick = () => ov.remove(); ov.querySelector('[data-y]').onclick = () => { ov.remove(); ok(); }; }
function open(tab) {
  const A = X(); if (!A || !window.openPage) return; if (!bisa()) return window.FHPatroli && FHPatroli.open(); css(); A.pakai('smart');
  openPage('Patroli (SMART)', 'HD Nanga Lauk · track & waypoint · tanpa sinyal', '<div class="fa" id="smW"><div class="fa-tabs" style="position:static"><button data-t="aktif">Patroli</button><button data-t="daftar">Daftar & ekspor</button><button data-t="lama">Temuan lama</button></div><div id="smB"></div></div>', async () => {
    const w = document.getElementById('smW'); BOX = w.querySelector('#smB');
    try { await muatDM(); } catch (e) { BOX.innerHTML = `<p class="fa-err">${esc(e.message)}</p>`; return; }
    const go = t => { w.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t))); if (t === 'aktif') layarAktif(); else if (t === 'daftar') daftar(); else if (window.FHPatroli) FHPatroli.open(); };
    w.querySelectorAll('[data-t]').forEach(b => b.onclick = () => go(b.dataset.t));
    if (!AKTIF) { const L_ = (await Q().all().catch(() => [])).filter(p => p.status === 'aktif'); if (L_.length) { AKTIF = L_[0]; gpsMulai(); } }
    go(tab || 'aktif');
  });
}
const LS = (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
function layarAktif() {
  if (!BOX) return; const A = X(), s = window.FHSiteObj && FHSiteObj(), u = A.akun && A.akun();
  if (!AKTIF) {
    const tg = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
    BOX.innerHTML = `<div class="fa-card"><h4>Mulai patroli baru</h4><p class="fa-note">Informasi umum patroli (sama dengan isian patroli SMART). GPS bekerja tanpa internet; data tersimpan di HP dan terkirim otomatis saat ada sinyal.</p>
      <div class="sm-f"><label>ID patroli</label><input id="iId" placeholder="otomatis bila kosong"><label>Jenis patroli</label><select id="iPt">${TIPE_P.map(([k, n]) => `<option value="${k}" ${LS('sm_pt', 'MARINE') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <label>Transportasi</label><input id="iTr" list="smTrL" value="${esc(LS('sm_tr', 'Sampan'))}"><datalist id="smTrL"><option>Sampan</option><option>Speedboat</option><option>Jalan kaki</option><option>Sepeda motor</option></datalist>
      <label>Tim</label><input id="iTim" list="smTmL" value="${esc(LS('sm_tim'))}"><datalist id="smTmL"><option>Tim 1</option><option>Tim 2</option><option>Tim 3</option></datalist>
      <label>Stasiun</label><input id="iSt" value="${esc(LS('sm_st', 'HD Nanga Lauk'))}"><label>Mandat</label><input id="iMd" value="${esc(LS('sm_md', 'Patroli Hutan Desa'))}">
      <label>Anggota patroli – satu per baris: ID pegawai SMART ; nama depan ; nama belakang (baris pertama = ketua)</label><textarea id="iPl" rows="5" placeholder="NL_00 ; Nama ; Keluarga">${esc(LS('sm_pl'))}</textarea>
      <label>ID pegawai pengemudi / motoris (opsional)</label><input id="iPil" value="${esc(LS('sm_pil'))}">
      <p class="fa-note">ID pegawai, tim, stasiun, mandat & transportasi harus sama persis dengan yang terdaftar di SMART Desktop agar impor berhasil. Isian ini diingat di HP ini saja.</p>
      <label>Tujuan dan catatan penting kegiatan patroli</label><textarea id="iTj" rows="3"></textarea><input id="iTg" type="hidden" value="${tg}"></div>
      <button class="fa-btn pri full" id="smMulai" style="--c:#15803D;margin-top:14px">▶ Mulai patroli & rekam track</button></div>`;
    BOX.querySelector('#smMulai').onclick = async () => { const v = id => BOX.querySelector(id).value.trim(), now = Date.now(), d = new Date(now + 7 * 36e5);
      const ag = v('#iPl').split(/\n+/).map(x => x.split(/[;,\t]/).map(y => y.trim())).filter(x => x[0]).map((x, i) => ({ id: x[0], depan: x[1] || '', belakang: x[2] || '', ketua: i === 0, pilot: x[0] === v('#iPil') }));
      if (!ag.length) return A.toast(T_('Isi minimal satu anggota patroli (ID pegawai SMART).'));
      const bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const id = v('#iId') || `FH_${v('#iTim') || 'Tim'}_HD ${d.getUTCDate()} ${bln[d.getUTCMonth()]} ${d.getUTCFullYear()} ${d.toISOString().slice(11, 16).replace(':', '')}`;
      try { [['sm_pt', '#iPt'], ['sm_tr', '#iTr'], ['sm_tim', '#iTim'], ['sm_st', '#iSt'], ['sm_md', '#iMd'], ['sm_pl', '#iPl'], ['sm_pil', '#iPil']].forEach(([k, q]) => localStorage.setItem(k, v(q))); } catch (e) { }
      AKTIF = { id, status: 'aktif', mulai: now, selesai: null, jeda: false, lokasi_id: s ? s.id : '',
        info: { id_kegiatan: id, jenis_patroli: v('#iPt'), transportasi: v('#iTr'), tim: v('#iTim'), stasiun: v('#iSt'), mandat: v('#iMd'), lokasi: s ? s.hd_nama : '', tanggal: v('#iTg'), anggota: ag, pelaksana: ag.map(m => [m.depan, m.belakang].filter(Boolean).join(' ') || m.id), tujuan: v('#iTj') },
        track: [], waypoints: [], dibuat_oleh: u ? { id: u.id, nama: u.nama, email: u.email } : null, versi: 2 };
      await simpan(AKTIF); gpsMulai(); A.pakai('smart_mulai'); layarAktif(); };
    return;
  }
  const p = AKTIF;
  BOX.innerHTML = `<div class="fa-card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b>${esc(p.info.id_kegiatan)}</b><small style="display:block;color:var(--muted)">${esc(p.info.stasiun || p.info.lokasi)} · ${esc(p.info.tim)}</small></div><span class="sm-gps" id="smGps">GPS…</span></div>
      <div class="sm-st" style="margin-top:10px"><div><small>Durasi</small><b id="smDur">–</b></div><div><small>Jarak</small><b id="smJr">–</b></div><div><small>Titik track</small><b id="smTk">–</b></div><div><small>Waypoint</small><b id="smWn">–</b></div></div>
      <div class="sm-act"><button class="fa-btn" id="smJd">${p.jeda ? '▶ Lanjutkan track' : '⏸ Jeda track'}</button><button class="fa-btn pri" id="smSl" style="--c:#B3261E">■ Selesai patroli</button></div></div>
    <div class="fa-card"><h4>Ambil waypoint</h4><div class="sm-wp">${AKAR().map((c, i) => `<button data-w="${esc(c.key)}" style="background:${WARNA[Math.min(i, 3)][0]}"><span>${WARNA[Math.min(i, 3)][1]}</span>${esc(c.nama.replace(/^Indikator /, ''))}</button>`).join('')}</div>
      <p class="fa-note">Koordinat diambil dari GPS saat tombol ditekan (tanpa internet). Tunggu akurasi ≤ 15 m bila memungkinkan.</p></div>
    <div class="fa-map" id="smMap" style="height:300px"></div>
    <div class="fa-card" id="smWl"></div>`;
  BOX.querySelectorAll('[data-w]').forEach(b => b.onclick = () => formWp(b.dataset.w));
  BOX.querySelector('#smJd').onclick = async () => { p.jeda = !p.jeda; await simpan(p); layarAktif(); };
  BOX.querySelector('#smSl').onclick = () => tanya('Selesaikan patroli ini? Perekaman track akan berhenti.', async () => { p.status = 'selesai'; p.selesai = Date.now(); p.jeda = false; await simpan(p); gpsStop(); const id = p.id; AKTIF = null; X().pakai('smart_selesai'); sync(); detail(id); });
  peta(); daftarWp(); ui(); if (!TICK) TICK = setInterval(ui, 5000);
}
function ui() {
  if (!BOX || !AKTIF) return; const g = BOX.querySelector('#smGps'); if (!g) return; const p = AKTIF;
  g.className = 'sm-gps ' + (!FIX ? 'no' : FIX.ak <= 15 ? 'ok' : 'lemah'); g.textContent = !FIX ? T_('Mencari GPS…') : `GPS ±${Math.round(FIX.ak)} m${p.jeda ? ' · ' + T_('jeda') : ''}`;
  const dur = (Date.now() - p.mulai) / 6e4; BOX.querySelector('#smDur').textContent = `${Math.floor(dur / 60)} j ${Math.round(dur % 60)} m`;
  BOX.querySelector('#smJr').textContent = nf(panjang(p.track) / 1000, 2) + ' km'; BOX.querySelector('#smTk').textContent = p.track.length; BOX.querySelector('#smWn').textContent = p.waypoints.length;
  if (MAP && LYR) { LYR.clearLayers(); if (p.track.length > 1) L.polyline(p.track.map(x => [x[1], x[2]]), { color: '#F59E0B', weight: 4 }).addTo(LYR);
    p.waypoints.forEach(w => L.circleMarker([w.la, w.lo], { radius: 7, color: '#fff', weight: 2, fillColor: RUPA(w)[0], fillOpacity: 1 }).bindTooltip('WPT ' + pad(w.no)).addTo(LYR));
    if (FIX) { L.circleMarker([FIX.la, FIX.lo], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563EB', fillOpacity: 1 }).bindTooltip(T_('Posisi saya')).addTo(LYR); if (!MAP._fhIkut) { MAP._fhIkut = 1; MAP.setView([FIX.la, FIX.lo], 16); } } }
}
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
function peta() {
  const el = BOX.querySelector('#smMap'); if (!el || !window.L) return; if (MAP) { try { MAP.remove(); } catch (e) { } }
  MAP = L.map(el); L.tileLayer(ESRI, { maxZoom: 18, attribution: 'Esri' }).addTo(MAP); LYR = L.layerGroup().addTo(MAP);
  const s = window.FHSiteObj && FHSiteObj(); if (s && s.hd) { const o = L.geoJSON(s.hd, { style: { color: '#FFD84D', weight: 2, fill: false } }).addTo(MAP); MAP.fitBounds(o.getBounds()); } else MAP.setView([0.96, 112.6], 12);
  if (FIX) MAP.setView([FIX.la, FIX.lo], 15); setTimeout(() => MAP.invalidateSize(), 300);
}
const ringkas = w => [KAT(w.kat).nama, ...atribut(w).filter(a => a[2] !== 'keterangan').slice(0, 2).map(a => a[1])].filter(Boolean).join(' – ');
function daftarWp() {
  const el = BOX && BOX.querySelector('#smWl'); if (!el || !AKTIF) return; const W_ = AKTIF.waypoints.slice().reverse();
  el.innerHTML = `<h4>Waypoint (${W_.length})</h4>` + (W_.length ? W_.map(w => `<div class="sm-li"><span style="font-size:20px">${RUPA(w)[1]}</span><span class="m"><b>WPT ${pad(w.no)} · ${esc(ringkas(w))}</b><small>${esc(wib(w.t))} · ${w.la.toFixed(6)}, ${w.lo.toFixed(6)} · ±${Math.round(w.ak)} m · ${w.foto.length} foto</small></span><button class="fa-btn" data-e="${w.no}">${T_('Ubah')}</button></div>`).join('') : '<p class="fa-note">Belum ada waypoint.</p>');
  el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => formWp(null, AKTIF.waypoints.find(w => w.no === +b.dataset.e)));
}
function medan(k, v, kat) {   // satu atribut Data Model → isian (pilihan / angka / teks)
  const a = DMD.atribut[k], L_ = `<label>${esc(a.nama)}${a.wajib ? ' *' : ''}</label>`;
  if (a.tipe === 'LIST') return L_ + `<select data-k="${k}"><option value=""></option>${a.item.map(i => `<option value="${esc(i.key)}" ${v === i.key ? 'selected' : ''}>${esc(i.nama)}</option>`).join('')}</select>`;
  if (a.tipe === 'TREE') { let P = a.pohon;
    if (k === 'tipetemuan') { const nmK = new Set(DMD.kategori.map(c => c.nama.toLowerCase())), cocok = P.filter(g => g.nama.toLowerCase() === kat.nama.toLowerCase()); P = cocok.length ? cocok : P.filter(g => !nmK.has(g.nama.toLowerCase())); }
    const D = daunPohon(P), G = [...new Set(D.map(d => d.grup))];
    return L_ + (D.length > 15 ? `<input type="search" data-cari="${k}" placeholder="${T_('Cari nama…')}" style="margin-bottom:6px">` : '') + `<select data-k="${k}"><option value=""></option>${G.map(g => { const o = D.filter(d => d.grup === g).map(d => `<option value="${esc(d.key)}" ${v === d.key ? 'selected' : ''}>${esc(d.nama)}</option>`).join(''); return g ? `<optgroup label="${esc(g)}">${o}</optgroup>` : o; }).join('')}</select>`; }
  if (a.tipe === 'NUMERIC') return L_ + `<input data-k="${k}" type="number" step="any" inputmode="decimal" value="${esc(v ?? '')}">`;
  return L_ + (k === 'keterangan' ? `<textarea data-k="${k}" rows="3">${esc(v || '')}</textarea>` : `<input data-k="${k}" value="${esc(v ?? '')}">`);
}
function formWp(akar, lama) {
  const p = AKTIF; if (!p) return; const fx = lama ? { la: lama.la, lo: lama.lo, ak: lama.ak, alt: lama.alt, t: lama.t } : FIX;
  if (!fx) return X().toast(T_('GPS belum mendapat posisi. Tunggu sebentar di tempat terbuka.'));
  const K = DMD.kategori.filter(c => c.daun && c.akar === (lama ? KAT(lama.kat).akar : akar)), foto = lama ? lama.foto.slice() : [];
  let kat = lama ? KAT(lama.kat) : K[0], d = lama ? Object.assign({}, lama.d) : {};
  const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  ov.innerHTML = `<div class="fa fa-card sm-f" style="width:min(640px,100%);max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;margin:0;display:block"><h4>${RUPA({ kat: kat.key })[1]} ${esc(DMD.kategori.find(c => c.key === kat.akar).nama)} · WPT ${pad(lama ? lama.no : p.waypoints.reduce((m, w) => Math.max(m, w.no), 0) + 1)}</h4>
    <p class="fa-note">${fx.la.toFixed(6)}, ${fx.lo.toFixed(6)} · ±${Math.round(fx.ak)} m · ${esc(wib(fx.t))}</p>
    ${K.length > 1 ? `<label>${T_('Kategori')}</label><select id="wpK">${K.map(c => `<option value="${esc(c.key)}" ${c.key === kat.key ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}</select>` : ''}<div id="wpM"></div>
    <label>Foto (maks. 4)</label><input type="file" accept="image/*" capture="environment" multiple id="wpF"><div class="sm-ft" id="wpFt"></div>
    <div class="fa-row" style="margin-top:14px"><button class="fa-btn" id="wpBt">${T_('Batal')}</button>${lama ? `<button class="fa-btn" id="wpHp" style="color:#B91C1C">${T_('Hapus')}</button>` : ''}<button class="fa-btn pri" id="wpOk" style="--c:${RUPA({ kat: kat.key })[0]}">${T_('Simpan waypoint')}</button></div></div>`;
  document.body.appendChild(ov);
  const baca = () => { const nd = {}; ov.querySelectorAll('[data-k]').forEach(i => { const v = i.value.trim(); if (v !== '') nd[i.dataset.k] = i.type === 'number' ? +v : v; }); return nd; };
  const isi = () => { ov.querySelector('#wpM').innerHTML = kat.atribut.map(k => medan(k, d[k], kat)).join('');
    ov.querySelectorAll('[data-cari]').forEach(c => c.oninput = () => { const q = c.value.toLowerCase(), sel = ov.querySelector(`select[data-k="${c.dataset.cari}"]`); let pertama = null;
      sel.querySelectorAll('option').forEach(o => { const ok = !o.value || o.textContent.toLowerCase().includes(q) || (o.parentNode.label || '').toLowerCase().includes(q); o.hidden = !ok; if (ok && o.value && !pertama) pertama = o; });
      if (q && pertama && (!sel.value || sel.selectedOptions[0].hidden)) sel.value = pertama.value; }); };
  isi(); const wk = ov.querySelector('#wpK'); if (wk) wk.onchange = () => { d = Object.assign(d, baca()); kat = KAT(wk.value); isi(); };
  const ft = () => { ov.querySelector('#wpFt').innerHTML = foto.map((f, i) => `<img src="${f}" data-i="${i}" title="ketuk untuk hapus">`).join(''); ov.querySelectorAll('#wpFt img').forEach(im => im.onclick = () => { foto.splice(+im.dataset.i, 1); ft(); }); }; ft();
  ov.querySelector('#wpF').onchange = async e => { for (const f of [...e.target.files].slice(0, 4 - foto.length)) { try { foto.push(await X().foto(f)); } catch (er) { } } ft(); };
  ov.querySelector('#wpBt').onclick = () => ov.remove();
  if (lama) ov.querySelector('#wpHp').onclick = () => tanya('Hapus waypoint ini?', async () => { p.waypoints = p.waypoints.filter(w => w !== lama); await simpan(p); ov.remove(); daftarWp(); ui(); });
  ov.querySelector('#wpOk').onclick = async () => { const nd = baca(), kurang = kat.atribut.filter(k => DMD.atribut[k].wajib && (nd[k] == null || nd[k] === ''));
    if (kurang.length) return X().toast(T_('Wajib diisi: ') + kurang.map(k => DMD.atribut[k].nama).join(', '));
    if (lama) { lama.kat = kat.key; lama.d = nd; lama.foto = foto; lama.diubah = Date.now(); }
    else { const no = p.waypoints.reduce((m, w) => Math.max(m, w.no), 0) + 1; p.waypoints.push({ no, kat: kat.key, t: fx.t, la: +fx.la.toFixed(7), lo: +fx.lo.toFixed(7), ak: Math.round(fx.ak), alt: fx.alt == null ? null : Math.round(fx.alt * 10) / 10, d: nd, foto }); }
    await simpan(p); ov.remove(); daftarWp(); ui(); X().pakai('smart_wpt'); };
}

/* ---------- daftar & ekspor ---------- */
async function daftar() {
  const L_ = (await Q().all().catch(() => [])).sort((a, b) => b.mulai - a.mulai);
  BOX.innerHTML = `<div class="fa-card"><h4>Patroli di HP ini (${L_.length})</h4>${L_.length ? L_.map(p => `<div class="sm-li"><span class="m"><b>${esc(p.info.id_kegiatan)}</b><small>${esc(wib(p.mulai))} · ${nf(panjang(p.track) / 1000, 2)} km · ${p.waypoints.length} WPT · ${p.status === 'aktif' ? '🔴 ' + T_('sedang berjalan') : p.terkirim ? '✓ ' + T_('terkirim ke server') : '⏳ ' + T_('menunggu sinyal')}</small></span><button class="fa-btn" data-d="${esc(p.id)}">${T_('Buka')}</button></div>`).join('') : '<p class="fa-note">Belum ada patroli.</p>'}</div>
    <div class="fa-card"><h4>Data Model SMART</h4><p class="fa-note">${esc(DMD.nama)} · ${DMD.kategori.length} ${T_('kategori')}</p><p class="fa-note">Bila Data Model di SMART Desktop diubah: Conservation Area → Data Model → Export, lalu unggah berkasnya di sini.</p><input type="file" accept=".xml" id="smDmF"></div>`;
  BOX.querySelectorAll('[data-d]').forEach(b => b.onclick = () => detail(b.dataset.d));
  BOX.querySelector('#smDmF').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = bacaDM(await f.text()); localStorage.setItem('sm_dm', JSON.stringify(d)); DMD = d; X().toast(T_('Data Model SMART terpasang.')); daftar(); } catch (er) { X().toast(er.message); } };
}
async function detail(id) {
  const p = (await Q().all()).find(x => x.id === id); if (!p || !BOX) return; const A = X(), n = {}; p.waypoints.forEach(w => n[KAT(w.kat).akar] = (n[KAT(w.kat).akar] || 0) + 1);
  BOX.innerHTML = `<div class="fa-card"><h4>${esc(p.info.id_kegiatan)}</h4><p class="fa-note">${esc(p.info.stasiun || p.info.lokasi)} · ${esc(p.info.mandat || '')} · ${esc(p.info.transportasi)} · ${esc(wib(p.mulai))} – ${p.selesai ? esc(wib(p.selesai)) : '…'}<br>${T_('Tim')}: ${esc(p.info.tim)} · ${T_('Anggota')}: ${esc(p.info.pelaksana.join(', '))}</p>
      <div class="sm-st"><div><small>Jarak</small><b>${nf(panjang(p.track) / 1000, 2)} km</b></div>${AKAR().map(c => `<div><small>${esc(c.nama.replace(/^Indikator /, ''))}</small><b>${n[c.key] || 0}</b></div>`).join('')}</div></div>
    <div class="fa-card"><h4>Ekspor</h4><div class="fa-row"><button class="fa-btn pri" style="--c:#0F766E" data-x="smart">SMART (.xml)</button><button class="fa-btn pri" style="--c:#7C3AED" data-x="gpx">GPX</button><button class="fa-btn pri" style="--c:#15803D" data-x="xlsx">Excel tallysheet</button></div>
      <div class="fa-row" style="margin-top:8px"><button class="fa-btn" data-x="pdf">PDF</button><button class="fa-btn" data-x="shp">SHP</button><button class="fa-btn" data-x="csv">CSV</button><button class="fa-btn" data-x="json">JSON</button></div>
      <p class="fa-note">SMART (.xml): di SMART Desktop pilih Import Patrols → Add → pilih berkas → Assign New Patrol IDs → Import. Track, waypoint & observasi masuk sekaligus.</p></div>
    <div class="fa-map" id="smMap" style="height:300px"></div><div class="fa-card" id="smWl2"></div>
    <div class="fa-row"><button class="fa-btn" id="smKb">← ${T_('Daftar patroli')}</button>${p.status === 'selesai' && !p.terkirim ? `<button class="fa-btn" id="smKr">${T_('Kirim sekarang')}</button>` : ''}<button class="fa-btn" id="smHp" style="color:#B91C1C">${T_('Hapus dari HP')}</button></div>`;
  BOX.querySelector('#smWl2').innerHTML = `<h4>Waypoint</h4>` + (p.waypoints.length ? p.waypoints.map(w => `<div class="sm-li"><span style="font-size:20px">${RUPA(w)[1]}</span><span class="m"><b>WPT ${pad(w.no)} · ${esc(ringkas(w))}</b><small>${esc(wib(w.t))} · ${w.la.toFixed(6)}, ${w.lo.toFixed(6)} · ±${w.ak} m</small>${w.foto.length ? `<div class="sm-ft">${w.foto.map(f => `<img src="${f}">`).join('')}</div>` : ''}</span></div>`).join('') : '<p class="fa-note">–</p>');
  const el = BOX.querySelector('#smMap'); if (el && window.L) { if (MAP) { try { MAP.remove(); } catch (e) { } } MAP = L.map(el); L.tileLayer(ESRI, { maxZoom: 18, attribution: 'Esri' }).addTo(MAP);
    const G = L.featureGroup().addTo(MAP); if (p.track.length > 1) L.polyline(p.track.map(x => [x[1], x[2]]), { color: '#F59E0B', weight: 4 }).addTo(G);
    p.waypoints.forEach(w => L.circleMarker([w.la, w.lo], { radius: 7, color: '#fff', weight: 2, fillColor: RUPA(w)[0], fillOpacity: 1 }).bindPopup(`<b>WPT ${pad(w.no)}</b><br>${esc(ringkas(w))}`).addTo(G));
    if (G.getLayers().length) MAP.fitBounds(G.getBounds().pad(.2)); else MAP.setView([0.96, 112.6], 12); setTimeout(() => MAP.invalidateSize(), 300); }
  BOX.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { b.disabled = true; try { await ekspor(p, b.dataset.x); A.pakai('smart_ekspor_' + b.dataset.x); } catch (e) { A.toast(e.message || 'Gagal'); } finally { b.disabled = false; } });
  BOX.querySelector('#smKb').onclick = daftar; const kr = BOX.querySelector('#smKr'); if (kr) kr.onclick = async () => { await sync(); detail(id); };
  BOX.querySelector('#smHp').onclick = () => tanya(p.terkirim ? 'Hapus patroli ini dari HP? (salinan di server tetap ada)' : 'Patroli ini BELUM terkirim ke server. Tetap hapus dari HP?', async () => { await Q().del(p.id); daftar(); });
}
const nm = p => `patroli_${String(p.info.id_kegiatan).replace(/\W+/g, '_')}`;
const xe = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const idFoto = (p, w) => w.foto.map((_, i) => `${nm(p)}_WPT${pad(w.no)}_${i + 1}.jpg`);
function gpx(p) {
  const wp = p.waypoints.map(w => `  <wpt lat="${w.la}" lon="${w.lo}">${w.alt != null ? `<ele>${w.alt}</ele>` : ''}<time>${iso(w.t)}</time><name>WPT${pad(w.no)}</name>
    <cmt>${xe(ringkas(w))}</cmt><desc>${xe(atribut(w).map(([l, v]) => `${l}: ${v}`).join('; '))}</desc><type>${xe(KAT(w.kat).nama)}</type>
    <extensions><fh:kategori_smart>${xe(w.kat)}</fh:kategori_smart><fh:akurasi_m>${w.ak}</fh:akurasi_m>${idFoto(p, w).map(f => `<fh:foto>${xe(f)}</fh:foto>`).join('')}</extensions></wpt>`).join('\n');
  const tk = p.track.map(x => `      <trkpt lat="${x[1]}" lon="${x[2]}">${x[4] != null ? `<ele>${x[4]}</ele>` : ''}<time>${iso(x[0])}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fire Hotspot – Yayasan PRCF Indonesia" xmlns="http://www.topografix.com/GPX/1/1" xmlns:fh="https://erikprcfi.github.io/hotspot-fire-prcf/gpx" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata><name>${xe(p.info.id_kegiatan)}</name><desc>${xe(`${p.info.stasiun || ''} · ${p.info.tim} · ${p.info.pelaksana.join(', ')} · ${p.info.transportasi} · ${p.info.tujuan}`)}</desc><time>${iso(p.mulai)}</time></metadata>
${wp}
  <trk><name>${xe(p.info.id_kegiatan)}</name><trkseg>
${tk}
  </trkseg></trk>
</gpx>`;
}
/* kolom tallysheet per kelompok (kategori akar Data Model): Kategori + atribut sesuai urutan Data Model, Keterangan terakhir */
const kolomAkar = ak => { const K = []; DMD.kategori.filter(c => c.akar === ak && c.daun).forEach(c => c.atribut.forEach(k => { if (!K.includes(k)) K.push(k); })); return K.filter(k => k !== 'keterangan').concat(K.includes('keterangan') ? ['keterangan'] : []); };
async function ekspor(p, f) {
  const A = X(), base = nm(p);
  if (f === 'gpx') return A.dl(new Blob([gpx(p)], { type: 'application/gpx+xml' }), base + '.gpx');
  if (f === 'json') return A.dl(new Blob([JSON.stringify(p)], { type: 'application/json' }), base + '.json');
  if (f === 'smart') { if (p.status !== 'selesai') throw new Error(T_('Selesaikan patroli dulu sebelum ekspor ke SMART.')); return A.dl(new Blob([smartXml(p)], { type: 'application/xml' }), String(p.info.id_kegiatan).replace(/[^\w ]+/g, '_') + '.xml'); }
  if (f === 'csv') { const AK = [...new Set(DMD.kategori.flatMap(c => c.atribut))], K = ['no_wpt', 'kategori', 'waktu_wib', 'x_bujur', 'y_lintang', 'akurasi_m', 'ketinggian_m', 'id_foto', ...AK.map(k => DMD.atribut[k].nama)];
    return A.dl(new Blob([A.csv([K, ...p.waypoints.map(w => [pad(w.no), KAT(w.kat).nama, wib(w.t), w.lo, w.la, w.ak, w.alt, idFoto(p, w).join(' '), ...AK.map(k => lab(k, w.d[k]))])])], { type: 'text/csv' }), base + '_waypoint.csv'); }
  if (f === 'shp') { if (!window.FHShp) await A.lib('assets/shp.js?v=63');
    const wp = p.waypoints.map(w => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lo, w.la] }, properties: { NO_WPT: w.no, KATEGORI: KAT(w.kat).nama, WAKTU: wib(w.t), AKURASI: w.ak, URAIAN: ringkas(w), ATRIBUT: atribut(w).map(([l, v]) => `${l}: ${v}`).join('; '), ID_FOTO: idFoto(p, w).join(' '), ID_PATROLI: p.info.id_kegiatan } }));
    const tk = p.track.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: p.track.map(x => [x[2], x[1]]) }, properties: { ID_PATROLI: p.info.id_kegiatan, MULAI: wib(p.mulai), SELESAI: p.selesai ? wib(p.selesai) : '', PANJANG_KM: +(panjang(p.track) / 1000).toFixed(3), TIM: p.info.tim } }] : [];
    const Lr = []; if (wp.length) Lr.push({ nama: base + '_waypoint', fitur: wp, kolom: [['NO_WPT', 'N', 5, 0], ['KATEGORI', 'C', 60], ['WAKTU', 'C', 30], ['AKURASI', 'N', 6, 0], ['URAIAN', 'C', 150], ['ATRIBUT', 'C', 254], ['ID_FOTO', 'C', 200], ['ID_PATROLI', 'C', 80]] });
    if (tk.length) Lr.push({ nama: base + '_track', fitur: tk, kolom: [['ID_PATROLI', 'C', 80], ['MULAI', 'C', 30], ['SELESAI', 'C', 30], ['PANJANG_KM', 'N', 10, 3], ['TIM', 'C', 60]] });
    if (!Lr.length) throw new Error(T_('Belum ada track atau waypoint.'));
    const extra = {}; p.waypoints.forEach(w => w.foto.forEach((fo, i) => extra[idFoto(p, w)[i]] = Uint8Array.from(atob(fo.split(',')[1]), c => c.charCodeAt(0))));
    return A.dl(await FHShp.zip(Lr, extra), base + '_SHP.zip'); }
  if (f === 'xlsx') return excel(p);
  if (f === 'pdf') return pdfLap(p);
}
async function excel(p) {
  const A = X(); await A.lib('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); const wb = new ExcelJS.Workbook(); wb.creator = 'Yayasan PRCF Indonesia – Fire Hotspot';
  const TH = { style: 'thin', color: { argb: 'FF000000' } }, BD = { top: TH, left: TH, bottom: TH, right: TH };
  AKAR().forEach(ak => { const KA = kolomAkar(ak.key), kol = ['No WPT', 'WPT', 'ID Foto', 'Kategori', ...KA.map(k => DMD.atribut[k].nama)], n = kol.length, s = wb.addWorksheet(ak.nama.replace(/^Indikator /, '').slice(0, 31));
    s.mergeCells(1, 1, 1, n); s.getCell(1, 1).value = 'Tallysheet ' + ak.nama.toLowerCase(); s.getCell(1, 1).font = { bold: true, size: 13 }; s.getCell(1, 1).alignment = { horizontal: 'center' };
    s.mergeCells(2, 1, 2, n); s.getCell(2, 1).value = `${p.info.id_kegiatan} · ${p.info.stasiun || ''} · ${p.info.tim}`; s.getCell(2, 1).alignment = { horizontal: 'center' };
    kol.forEach((k, i) => { const c = s.getCell(4, i + 1); c.value = k; c.font = { bold: true }; c.border = BD; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }; });
    let r = 5; p.waypoints.filter(w => KAT(w.kat).akar === ak.key).forEach(w => { s.getCell(r, 2).value = 'x: ' + w.lo.toFixed(6); s.getCell(r + 1, 2).value = 'y: ' + w.la.toFixed(6);
      [pad(w.no), null, idFoto(p, w).join('\n'), KAT(w.kat).nama, ...KA.map(k => lab(k, w.d[k]))].forEach((v, i) => { if (i === 1) return; s.mergeCells(r, i + 1, r + 1, i + 1); const c = s.getCell(r, i + 1); c.value = v; c.alignment = { vertical: 'middle', wrapText: true }; });
      for (let cI = 1; cI <= n; cI++) { s.getCell(r, cI).border = BD; s.getCell(r + 1, cI).border = BD; } r += 2; });
    kol.forEach((k, i) => s.getColumn(i + 1).width = i === 1 ? 18 : k === 'Keterangan' ? 34 : Math.max(10, Math.min(30, k.length + 4))); });
  const iu = wb.addWorksheet('Informasi umum'); iu.mergeCells('A1:D1'); iu.getCell('A1').value = 'Tallysheet informasi umum kegiatan patroli'; iu.getCell('A1').font = { bold: true, size: 13 };
  [['ID Kegiatan', p.info.id_kegiatan], ['Transportasi', p.info.transportasi], ['Nama Tim', p.info.tim], ['Lokasi', p.info.stasiun || p.info.lokasi], ['Jenis Kegiatan', p.info.mandat || ''], ['Tanggal/Bulan/tahun', p.info.tanggal], ['Mulai – selesai (WIB)', `${wib(p.mulai)} – ${p.selesai ? wib(p.selesai) : ''}`], ['Panjang track (km)', +(panjang(p.track) / 1000).toFixed(3)]]
    .forEach(([k, v], i) => { iu.getCell(3 + i, 1).value = k; iu.getCell(3 + i, 2).value = ':'; iu.getCell(3 + i, 3).value = v; });
  iu.getCell(12, 1).value = 'Pelaksana'; iu.getCell(12, 2).value = ':'; for (let i = 0; i < 10; i++) iu.getCell(12 + (i % 5), i < 5 ? 3 : 4).value = `${i + 1}. ${p.info.pelaksana[i] || ''}`;
  iu.getCell(18, 1).value = 'Tujuan dan catatan penting kegiatan patroli:'; iu.mergeCells('A19:D24'); iu.getCell('A19').value = p.info.tujuan; iu.getCell('A19').alignment = { wrapText: true, vertical: 'top' };
  [24, 3, 40, 40].forEach((w, i) => iu.getColumn(i + 1).width = w);
  const tk = wb.addWorksheet('Track GPS'); tk.addRow(['No', 'Waktu (WIB)', 'x (bujur)', 'y (lintang)', 'Akurasi (m)', 'Ketinggian (m)']); tk.getRow(1).font = { bold: true }; p.track.forEach((x, i) => tk.addRow([i + 1, wib(x[0]), x[2], x[1], x[3], x[4]]));
  [6, 22, 14, 14, 12, 14].forEach((w, i) => tk.getColumn(i + 1).width = w);
  wb.addWorksheet('Catatan').addRow(['Koordinat: x = bujur, y = lintang, derajat desimal WGS 1984 (EPSG:4326), dari GPS HP. Kategori & pilihan mengikuti Data Model SMART Nanga Lauk. Dibuat oleh Fire Hotspot – Yayasan PRCF Indonesia, ' + wib(Date.now())]);
  A.dl(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nm(p) + '_tallysheet.xlsx');
}
async function pdfLap(p) {
  const A = X(); await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }); if (window.FHLang) FHLang.pdf(doc); const a = s => T_(String(s)).replace(/[–—›]/g, '-');
  doc.setFillColor(11, 59, 44); doc.rect(0, 0, 297, 24, 'F'); doc.setTextColor(255); doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(a('Laporan Patroli ' + p.info.id_kegiatan), 12, 11); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(a(`${p.info.stasiun || ''} · ${p.info.transportasi} · ${wib(p.mulai)} – ${p.selesai ? wib(p.selesai) : ''} · ${nf(panjang(p.track) / 1000, 2)} km`), 12, 18); doc.setTextColor(20);
  let y = 30; doc.text(doc.splitTextToSize(a(`Tim: ${p.info.tim} · Anggota: ${p.info.pelaksana.join(', ')} · Tujuan: ${p.info.tujuan}`), 272), 12, y); y += 10;
  for (const ak of AKAR()) { const R = p.waypoints.filter(w => KAT(w.kat).akar === ak.key); if (!R.length) continue; const KA = kolomAkar(ak.key);
    doc.setFont('helvetica', 'bold'); doc.text(a(ak.nama), 12, y); doc.setFont('helvetica', 'normal'); y += 2;
    doc.autoTable({ startY: y, head: [['No WPT', 'x / y', 'Kategori', ...KA.map(k => DMD.atribut[k].nama)].map(a)], body: R.map(w => [pad(w.no), `${w.lo.toFixed(6)}\n${w.la.toFixed(6)}`, KAT(w.kat).nama, ...KA.map(k => lab(k, w.d[k]))].map(v => a(v ?? ''))), theme: 'grid', headStyles: { fillColor: [31, 78, 61], fontSize: 7.5 }, styles: { fontSize: 7.5 }, margin: { left: 12, right: 12 } });
    y = doc.lastAutoTable.finalY + 8; }
  doc.save(nm(p) + '.pdf');
}

/* ---------- Data Model SMART (unggahan XML) → struktur yang sama dengan scripts/smart_dm.py ---------- */
function bacaDM(t) {
  const d = new DOMParser().parseFromString(t, 'application/xml'); if (d.querySelector('parsererror') || d.documentElement.localName !== 'DataModel') throw new Error(T_('Berkas bukan ekspor Data Model SMART.'));
  const ch = (e, n) => [...e.children].filter(c => c.localName === n), aktif = e => e.getAttribute('isactive') !== 'false';
  const nama = e => { const n = ch(e, 'names')[0]; return (n ? n.getAttribute('value') : e.getAttribute('key') || '').replace(/\s+/g, ' ').trim(); };
  const atr = {}; ch(ch(d.documentElement, 'attributes')[0], 'attribute').forEach(a => { const o = { nama: nama(a), tipe: a.getAttribute('type'), wajib: a.getAttribute('isrequired') === 'true' };
    if (o.tipe === 'LIST') o.item = ch(a, 'values').filter(aktif).map(v => ({ key: v.getAttribute('key'), nama: nama(v) }));
    if (o.tipe === 'TREE') { const pohon = e => [...e.children].filter(c => (c.localName === 'tree' || c.localName === 'children') && aktif(c)).map(c => { const n = { key: c.getAttribute('key'), nama: nama(c) }, an = pohon(c); if (an.length) n.anak = an; return n; }); o.pohon = pohon(a); }
    atr[a.getAttribute('key')] = o; });
  const kat = [], jalan = (e, j, induk) => ch(e, 'category').filter(aktif).forEach(c => { const jj = j.concat(c.getAttribute('key')); kat.push({ key: jj.join('.'), nama: nama(c), induk, akar: jj[0], daun: !ch(c, 'category').filter(aktif).length, atribut: ch(c, 'attribute').filter(aktif).map(x => x.getAttribute('attributekey')).filter(k => atr[k]) }); jalan(c, jj, nama(c)); });
  jalan(ch(d.documentElement, 'categories')[0], [], null); if (!kat.length) throw new Error(T_('Tidak menemukan kategori di berkas ini.'));
  return { lokasi: 'nangalauk', nama: 'Data Model SMART (unggahan)', kategori: kat, atribut: atr };
}

/* ---------- XML patroli SMART 6 (namespace xml/1.2/patrol) – susunan disalin dari ekspor SMART Desktop 6.3.0 Nanga Lauk ----------
 * Waktu = jam lokal WIB. Track per hari = EWKB hex big-endian MultiLineString Z, Z = waktu (ms, jam lokal). Jarak track dalam km.
 * Kunci kategori & pohon diakhiri titik ("fitur.", "bangunan.lanting."); kunci daftar tanpa titik ("yakin"). */
function wkbTrack(T) {
  const n = T.length, b = new DataView(new ArrayBuffer(9 + 9 + 24 * n)); let o = 0;
  const u8 = v => b.setUint8(o++, v), u32 = v => { b.setUint32(o, v); o += 4; }, f64 = v => { b.setFloat64(o, v); o += 8; };
  u8(0); u32(0x80000005); u32(1); u8(0); u32(0x80000002); u32(n); T.forEach(x => { f64(x[2]); f64(x[1]); f64(x[0] + 7 * 36e5); });
  return [...new Uint8Array(b.buffer)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const lok = t => new Date(t + 7 * 36e5).toISOString(), tglL = t => lok(t).slice(0, 10), jamL = t => lok(t).slice(11, 19);
const kom = t => { const s = lok(t); return `${s.slice(0, 10)} ${+s.slice(11, 13)}:${s.slice(14, 19)}`; };
const dval = v => { const s = String(+v); return /[.e]/.test(s) ? s : s + '.0'; };
function smartXml(p) {
  const I = p.info, ag = I.anggota || [], hari = [...new Set([...p.track.map(x => tglL(x[0])), ...p.waypoints.map(w => tglL(w.t)), tglL(p.mulai)])].sort();
  const obs = w => `                <ns2:observations categoryKey="${xe(w.kat)}.">
${KAT(w.kat).atribut.filter(k => w.d[k] != null && w.d[k] !== '').map(k => { const a = DMD.atribut[k], v = w.d[k];
    const isi = a.tipe === 'TREE' ? `<ns2:itemKey>${xe(v)}.</ns2:itemKey>` : a.tipe === 'LIST' ? `<ns2:itemKey>${xe(v)}</ns2:itemKey>` : a.tipe === 'NUMERIC' ? `<ns2:dValue>${dval(v)}</ns2:dValue>` : a.tipe === 'BOOLEAN' ? `<ns2:bValue>${!!v}</ns2:bValue>` : `<ns2:sValue>${xe(v)}</ns2:sValue>`;
    return `                    <ns2:attributes attributeKey="${xe(k)}">\n                        ${isi}\n                    </ns2:attributes>`; }).join('\n')}
                </ns2:observations>`;
  const hariXml = h => { const T = p.track.filter(x => tglL(x[0]) === h), W_ = p.waypoints.filter(w => tglL(w.t) === h).sort((a, b) => a.t - b.t);
    const ts = [...T.map(x => x[0]), ...W_.map(w => w.t)]; if (h === tglL(p.mulai)) ts.push(p.mulai); if (p.selesai && h === tglL(p.selesai)) ts.push(p.selesai);
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    return `        <ns2:days date="${h}" startTime="${jamL(t0)}" endTime="${jamL(t1)}" restMinutes="0.0">
${W_.map(w => `            <ns2:waypoints id="${w.no}" x="${w.lo}" y="${w.la}" time="${jamL(w.t)}">
                <ns2:comment>${xe(kom(w.t))}</ns2:comment>
${obs(w)}
            </ns2:waypoints>`).join('\n')}${T.length > 1 ? `\n            <ns2:track geom="${wkbTrack(T)}" distance="${panjang(T) / 1000}"/>` : ''}
        </ns2:days>`; };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns2:patrol xmlns:ns2="http://www.smartconservationsoftware.org/xml/1.2/patrol" patrolType="${xe(I.jenis_patroli || 'GROUND')}" startDate="${hari[0]}" endDate="${hari[hari.length - 1]}" isArmed="false" id="${xe(I.id_kegiatan)}">
    <ns2:objective>
        <ns2:description>${xe(I.tujuan)}</ns2:description>
    </ns2:objective>
    <ns2:team languageCode="in" value="${xe(I.tim)}"/>
    <ns2:station languageCode="in" value="${xe(I.stasiun || '')}"/>
    <ns2:legs startDate="${hari[0]}" endDate="${hari[hari.length - 1]}" id="1">
        <ns2:transportType languageCode="in" value="${xe(I.transportasi)}"/>
${ag.map(m => `        <ns2:members givenName="${xe(m.depan)}" familyName="${xe(m.belakang)}" employeeId="${xe(m.id)}" isPilot="${!!m.pilot}" isLeader="${!!m.ketua}"/>`).join('\n')}
${hari.map(hariXml).join('\n')}
        <ns2:mandate languageCode="in" value="${xe(I.mandat || '')}"/>
    </ns2:legs>
    <ns2:comment>${xe('Dibuat dengan aplikasi Fire Hotspot – Yayasan PRCF Indonesia')}</ns2:comment>
</ns2:patrol>
`;
}
window.FHSmart = { open, sync, gpx, ekspor, smartXml, wkbTrack, bisa, muatDM, _set: d => DMD = d };
})();
