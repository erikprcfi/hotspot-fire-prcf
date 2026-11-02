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
const TALLY = {
  bio: { nama: 'Keanekaragaman hayati', sub: 'Perjumpaan satwa, tanda satwa, tumbuhan, perburuan & gangguan', warna: '#15803D', ikon: '🦧',
    medan: [['jenis', 'Jenis (nama satwa/tumbuhan)', 'teks'], ['temuan', 'Temuan', 'pilih', ['Perjumpaan langsung', 'Suara', 'Jejak kaki', 'Kotoran', 'Sarang', 'Bekas makan', 'Cakaran / bekas gesekan', 'Kubangan', 'Bulu / rambut', 'Bangkai', 'Tumbuhan', 'Jerat / perangkap', 'Senapan / selongsong', 'Pemburu ditemui', 'Kamp pemburu', 'Gangguan lainnya']],
      ['jumlah', 'Jumlah individu', 'angka'], ['kelamin', 'Jenis kelamin', 'pilih', ['Jantan', 'Betina', 'Jantan & betina', 'Tidak diketahui']], ['jarak', 'Jarak (m)', 'angka'],
      ['keyakinan', 'Keyakinan identifikasi', 'pilih', ['Pasti', 'Mungkin', 'Tidak yakin']], ['ket', 'Keterangan', 'panjang']] },
  defor: { nama: 'Penyebab deforestasi & degradasi', sub: 'Penebangan, perambahan, kebakaran, tambang, dll.', warna: '#B45309', ikon: '🪓',
    medan: [['kategori', 'Kategori – tipe temuan', 'pilih', ['Penebangan liar – tunggul baru', 'Penebangan liar – kayu olahan', 'Penebangan liar – alat tebang', 'Perambahan – pembukaan lahan baru', 'Perambahan – tanaman ditanam', 'Kebakaran – api menyala', 'Kebakaran – bekas terbakar', 'Pertambangan', 'Perkebunan', 'Jalan / jalur sarad baru', 'Pondok / kamp', 'Lainnya']],
      ['luas', 'Luas (ha)', 'angka'], ['alasan', 'Alasan', 'teks'], ['pelaku', 'Pelaku', 'pilih', ['Masyarakat setempat', 'Masyarakat luar', 'Perusahaan', 'Tidak diketahui']],
      ['tingkat', 'Tingkat kerusakan', 'pilih', ['Ringan', 'Sedang', 'Berat']], ['ket', 'Keterangan', 'panjang']] },
  fitur: { nama: 'Fitur', sub: 'Pal batas, lanting & menara pantau', warna: '#1D4ED8', ikon: '📍',
    medan: [['tipe', 'Tipe temuan', 'pilih', ['Pal batas', 'Lanting', 'Menara pantau', 'Papan informasi', 'Pos jaga', 'Lainnya']], ['kondisi', 'Kondisi', 'pilih', ['Baik', 'Rusak ringan', 'Rusak berat', 'Hilang']], ['ket', 'Keterangan', 'panjang']] } };
const JENIS_KEG = ['Patroli rutin', 'Patroli gabungan', 'Patroli kebakaran', 'Survei keanekaragaman hayati', 'Pemantauan batas', 'Lainnya'];
const TRANS = ['Jalan kaki', 'Perahu / speedboat', 'Sepeda motor', 'Mobil', 'Campuran'];
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
  s.textContent = `.sm-st{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sm-st div{background:var(--surface-2,#f3f6f4);border-radius:14px;padding:10px}.sm-st small{display:block;font-size:11px;color:var(--muted)}.sm-st b{font-size:17px}
  .sm-wp{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sm-wp button{border:0;border-radius:16px;padding:14px 8px;color:#fff;font:700 13px var(--f,system-ui);cursor:pointer;min-height:76px}.sm-wp button span{display:block;font-size:22px}
  .sm-f label{display:block;margin:10px 0 4px;font-size:12.5px;font-weight:700}.sm-f input,.sm-f select,.sm-f textarea{width:100%;box-sizing:border-box}.sm-gps{font-size:12.5px;font-weight:700}.sm-gps.ok{color:#15803D}.sm-gps.lemah{color:#B45309}.sm-gps.no{color:#B91C1C}
  .sm-li{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.sm-li:first-child{border-top:0}.sm-li .m{flex:1;min-width:0}.sm-li small{display:block;color:var(--muted);font-size:12px}
  .sm-ft{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.sm-ft img{width:64px;height:64px;object-fit:cover;border-radius:10px}`; document.head.appendChild(s); }
let BOX = null, MAP = null, LYR = null;
function open(tab) {
  const A = X(); if (!A || !window.openPage) return; css(); A.pakai('smart');
  openPage('Patroli (SMART)', 'Track & waypoint · bekerja tanpa sinyal', '<div class="fa" id="smW"><div class="fa-tabs" style="position:static"><button data-t="aktif">Patroli</button><button data-t="daftar">Daftar & ekspor</button><button data-t="lama">Temuan lama</button></div><div id="smB"></div></div>', async () => {
    const w = document.getElementById('smW'); BOX = w.querySelector('#smB');
    const go = t => { w.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t))); if (t === 'aktif') layarAktif(); else if (t === 'daftar') daftar(); else if (window.FHPatroli) FHPatroli.open('daftar'); };
    w.querySelectorAll('[data-t]').forEach(b => b.onclick = () => go(b.dataset.t));
    if (!AKTIF) { const L = (await Q().all().catch(() => [])).filter(p => p.status === 'aktif'); if (L.length) { AKTIF = L[0]; gpsMulai(); } }
    go(tab || 'aktif');
  });
}
function layarAktif() {
  if (!BOX) return; const A = X(), s = window.FHSiteObj && FHSiteObj(), u = A.akun && A.akun();
  if (!AKTIF) {
    const tg = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
    BOX.innerHTML = `<div class="fa-card"><h4>Mulai patroli baru</h4><p class="fa-note">Tallysheet informasi umum kegiatan patroli. GPS bekerja tanpa internet; data tersimpan di HP dan terkirim otomatis saat ada sinyal.</p>
      <div class="sm-f"><label>ID kegiatan</label><input id="iId" placeholder="otomatis bila kosong"><label>Transportasi</label><select id="iTr">${TRANS.map(x => `<option>${esc(x)}</option>`).join('')}</select>
      <label>Nama tim</label><input id="iTim" value="${esc(localStorage.getItem('sm_tim') || '')}"><label>Lokasi</label><input id="iLok" value="${esc(s ? s.hd_nama : '')}">
      <label>Jenis kegiatan</label><select id="iJk">${JENIS_KEG.map(x => `<option>${esc(x)}</option>`).join('')}</select><label>Tanggal</label><input id="iTg" type="date" value="${tg}">
      <label>Pelaksana (satu nama per baris, maks. 10)</label><textarea id="iPl" rows="4">${esc(localStorage.getItem('sm_pl') || (u && u.nama) || '')}</textarea>
      <label>Tujuan dan catatan penting kegiatan patroli</label><textarea id="iTj" rows="3"></textarea></div>
      <button class="fa-btn pri full" id="smMulai" style="--c:#15803D;margin-top:14px">▶ Mulai patroli & rekam track</button></div>`;
    BOX.querySelector('#smMulai').onclick = async () => { const v = id => BOX.querySelector(id).value.trim(), now = Date.now(), d = new Date(now + 7 * 36e5);
      const id = v('#iId') || `PTR-${d.toISOString().slice(0, 10).replace(/-/g, '')}-${d.toISOString().slice(11, 16).replace(':', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const pl = v('#iPl').split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 10);
      try { localStorage.setItem('sm_tim', v('#iTim')); localStorage.setItem('sm_pl', pl.join('\n')); } catch (e) { }
      AKTIF = { id, status: 'aktif', mulai: now, selesai: null, jeda: false, lokasi_id: s ? s.id : '', info: { id_kegiatan: id, transportasi: v('#iTr'), tim: v('#iTim'), lokasi: v('#iLok'), jenis_kegiatan: v('#iJk'), tanggal: v('#iTg'), pelaksana: pl, tujuan: v('#iTj') },
        track: [], waypoints: [], dibuat_oleh: u ? { id: u.id, nama: u.nama, email: u.email } : null, perangkat: navigator.userAgent.slice(0, 120), versi: 1 };
      await simpan(AKTIF); gpsMulai(); X().pakai('smart_mulai'); layarAktif(); };
    return;
  }
  const p = AKTIF;
  BOX.innerHTML = `<div class="fa-card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b>${esc(p.info.id_kegiatan)}</b><small style="display:block;color:var(--muted)">${esc(p.info.lokasi)} · ${esc(p.info.tim)}</small></div><span class="sm-gps" id="smGps">GPS…</span></div>
      <div class="sm-st" style="margin-top:10px"><div><small>Durasi</small><b id="smDur">–</b></div><div><small>Jarak</small><b id="smJr">–</b></div><div><small>Titik track</small><b id="smTk">–</b></div><div><small>Waypoint</small><b id="smWn">–</b></div></div></div>
    <div class="fa-card"><h4>Ambil waypoint</h4><div class="sm-wp">${Object.entries(TALLY).map(([k, t]) => `<button data-w="${k}" style="background:${t.warna}"><span>${t.ikon}</span>${esc(t.nama)}</button>`).join('')}</div>
      <p class="fa-note">Koordinat diambil dari GPS saat tombol ditekan (tanpa internet). Tunggu akurasi ≤ 15 m bila memungkinkan.</p></div>
    <div class="fa-map" id="smMap" style="height:300px"></div>
    <div class="fa-card" id="smWl"></div>
    <div class="fa-row"><button class="fa-btn" id="smJd">${p.jeda ? '▶ Lanjutkan track' : '⏸ Jeda track'}</button><button class="fa-btn pri" id="smSl" style="--c:#B3261E">■ Selesai patroli</button></div>`;
  BOX.querySelectorAll('[data-w]').forEach(b => b.onclick = () => formWp(b.dataset.w));
  BOX.querySelector('#smJd').onclick = async () => { p.jeda = !p.jeda; await simpan(p); layarAktif(); };
  BOX.querySelector('#smSl').onclick = async () => { if (!confirmUI()) return; p.status = 'selesai'; p.selesai = Date.now(); p.jeda = false; await simpan(p); gpsStop(); const id = p.id; AKTIF = null; X().pakai('smart_selesai'); sync(); detail(id); };
  peta(); daftarWp(); ui(); if (!TICK) TICK = setInterval(ui, 5000);
}
function confirmUI() { return window.confirm ? true : true; }
function ui() {
  if (!BOX || !AKTIF) return; const g = BOX.querySelector('#smGps'); if (!g) return; const p = AKTIF;
  g.className = 'sm-gps ' + (!FIX ? 'no' : FIX.ak <= 15 ? 'ok' : 'lemah'); g.textContent = !FIX ? T_('Mencari GPS…') : `GPS ±${Math.round(FIX.ak)} m${p.jeda ? ' · ' + T_('jeda') : ''}`;
  const dur = (Date.now() - p.mulai) / 6e4; BOX.querySelector('#smDur').textContent = `${Math.floor(dur / 60)} j ${Math.round(dur % 60)} m`;
  BOX.querySelector('#smJr').textContent = nf(panjang(p.track) / 1000, 2) + ' km'; BOX.querySelector('#smTk').textContent = p.track.length; BOX.querySelector('#smWn').textContent = p.waypoints.length;
  if (MAP && LYR) { LYR.clearLayers(); if (p.track.length > 1) L.polyline(p.track.map(x => [x[1], x[2]]), { color: '#F59E0B', weight: 4 }).addTo(LYR);
    p.waypoints.forEach(w => L.circleMarker([w.la, w.lo], { radius: 7, color: '#fff', weight: 2, fillColor: TALLY[w.tally].warna, fillOpacity: 1 }).bindTooltip('WPT ' + pad(w.no)).addTo(LYR));
    if (FIX) L.circleMarker([FIX.la, FIX.lo], { radius: 6, color: '#2563EB', fillColor: '#60A5FA', fillOpacity: 1 }).addTo(LYR); }
}
function peta() {
  const el = BOX.querySelector('#smMap'); if (!el || !window.L) return; if (MAP) { try { MAP.remove(); } catch (e) { } }
  MAP = L.map(el); L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri' }).addTo(MAP); LYR = L.layerGroup().addTo(MAP);
  const s = window.FHSiteObj && FHSiteObj(); if (s && s.hd) { const o = L.geoJSON(s.hd, { style: { color: '#FFD84D', weight: 2, fill: false } }).addTo(MAP); MAP.fitBounds(o.getBounds()); } else MAP.setView([0.96, 112.6], 12);
  if (FIX) MAP.setView([FIX.la, FIX.lo], 15); setTimeout(() => MAP.invalidateSize(), 300);
}
function daftarWp() {
  const el = BOX && BOX.querySelector('#smWl'); if (!el || !AKTIF) return; const W_ = AKTIF.waypoints.slice().reverse();
  el.innerHTML = `<h4>Waypoint (${W_.length})</h4>` + (W_.length ? W_.map(w => `<div class="sm-li"><span style="font-size:20px">${TALLY[w.tally].ikon}</span><span class="m"><b>WPT ${pad(w.no)} · ${esc(ringkas(w))}</b><small>${esc(wib(w.t))} · ${w.la.toFixed(6)}, ${w.lo.toFixed(6)} · ±${Math.round(w.ak)} m · ${w.foto.length} foto</small></span><button class="fa-btn" data-e="${w.no}">${T_('Ubah')}</button></div>`).join('') : '<p class="fa-note">Belum ada waypoint.</p>');
  el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => formWp(null, AKTIF.waypoints.find(w => w.no === +b.dataset.e)));
}
const ringkas = w => w.tally === 'bio' ? [w.d.jenis, w.d.temuan].filter(Boolean).join(' – ') : w.tally === 'defor' ? [w.d.kategori, w.d.luas ? w.d.luas + ' ha' : ''].filter(Boolean).join(' – ') : [w.d.tipe, w.d.kondisi].filter(Boolean).join(' – ');
function formWp(tally, lama) {
  const p = AKTIF; if (!p) return; const t = TALLY[lama ? lama.tally : tally], fx = lama ? { la: lama.la, lo: lama.lo, ak: lama.ak, alt: lama.alt, t: lama.t } : FIX;
  if (!fx) return X().toast(T_('GPS belum mendapat posisi. Tunggu sebentar di tempat terbuka.'));
  const d = lama ? lama.d : {}, foto = lama ? lama.foto.slice() : [];
  const ov = document.createElement('div'); ov.className = 'tl-dlg'; ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  ov.innerHTML = `<div class="fa-card sm-f" style="width:min(640px,100%);max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;margin:0"><h4>${t.ikon} ${esc(t.nama)} · WPT ${pad(lama ? lama.no : p.waypoints.length + 1)}</h4>
    <p class="fa-note">${fx.la.toFixed(6)}, ${fx.lo.toFixed(6)} · ±${Math.round(fx.ak)} m · ${esc(wib(fx.t))}</p>
    ${t.medan.map(([k, l, tp, op]) => `<label>${esc(l)}</label>${tp === 'pilih' ? `<select data-k="${k}"><option value=""></option>${op.map(o => `<option ${d[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : tp === 'panjang' ? `<textarea data-k="${k}" rows="3">${esc(d[k] || '')}</textarea>` : `<input data-k="${k}" ${tp === 'angka' ? 'type="number" step="any" inputmode="decimal"' : ''} value="${esc(d[k] ?? '')}">`}`).join('')}
    <label>Foto (maks. 4)</label><input type="file" accept="image/*" capture="environment" multiple id="wpF"><div class="sm-ft" id="wpFt"></div>
    <div class="fa-row" style="margin-top:14px"><button class="fa-btn" id="wpBt">${T_('Batal')}</button>${lama ? `<button class="fa-btn" id="wpHp" style="color:#B91C1C">${T_('Hapus')}</button>` : ''}<button class="fa-btn pri" id="wpOk" style="--c:${t.warna}">${T_('Simpan waypoint')}</button></div></div>`;
  document.body.appendChild(ov);
  const ft = () => { ov.querySelector('#wpFt').innerHTML = foto.map((f, i) => `<img src="${f}" data-i="${i}" title="ketuk untuk hapus">`).join(''); ov.querySelectorAll('#wpFt img').forEach(im => im.onclick = () => { foto.splice(+im.dataset.i, 1); ft(); }); }; ft();
  ov.querySelector('#wpF').onchange = async e => { for (const f of [...e.target.files].slice(0, 4 - foto.length)) { try { foto.push(await X().foto(f)); } catch (er) { } } ft(); };
  ov.querySelector('#wpBt').onclick = () => ov.remove();
  if (lama) ov.querySelector('#wpHp').onclick = async () => { p.waypoints = p.waypoints.filter(w => w !== lama); await simpan(p); ov.remove(); daftarWp(); ui(); };
  ov.querySelector('#wpOk').onclick = async () => { const nd = {}; ov.querySelectorAll('[data-k]').forEach(i => { const v = i.value.trim(); if (v !== '') nd[i.dataset.k] = i.type === 'number' ? +v : v; });
    if (lama) { lama.d = nd; lama.foto = foto; lama.diubah = Date.now(); }
    else { const no = (p.waypoints.reduce((m, w) => Math.max(m, w.no), 0)) + 1; p.waypoints.push({ no, tally, t: fx.t, la: +fx.la.toFixed(7), lo: +fx.lo.toFixed(7), ak: Math.round(fx.ak), alt: fx.alt == null ? null : Math.round(fx.alt * 10) / 10, d: nd, foto }); }
    await simpan(p); ov.remove(); daftarWp(); ui(); X().pakai('smart_wpt'); };
}

/* ---------- daftar & ekspor ---------- */
async function daftar() {
  const L_ = (await Q().all().catch(() => [])).sort((a, b) => b.mulai - a.mulai);
  BOX.innerHTML = `<div class="fa-card"><h4>Patroli di HP ini (${L_.length})</h4>${L_.length ? L_.map(p => `<div class="sm-li"><span class="m"><b>${esc(p.info.id_kegiatan)}</b><small>${esc(p.info.lokasi)} · ${esc(wib(p.mulai))} · ${nf(panjang(p.track) / 1000, 2)} km · ${p.waypoints.length} WPT · ${p.status === 'aktif' ? '🔴 ' + T_('sedang berjalan') : p.terkirim ? '✓ ' + T_('terkirim ke server') : '⏳ ' + T_('menunggu sinyal')}</small></span><button class="fa-btn" data-d="${esc(p.id)}">${T_('Buka')}</button></div>`).join('') : '<p class="fa-note">Belum ada patroli.</p>'}</div>
    <div class="fa-card"><h4>Data Model SMART</h4><p class="fa-note" id="smDm"></p><input type="file" accept=".xml" id="smDmF"><p class="fa-note">Unggah berkas XML hasil ekspor Data Model dari SMART Desktop (Conservation Area → Data Model → Export) agar ekspor XML patroli memakai kunci kategori & atribut milik Conservation Area Bapak/Ibu. Disimpan di HP ini.</p></div>`;
  BOX.querySelectorAll('[data-d]').forEach(b => b.onclick = () => detail(b.dataset.d));
  const dm = DM(); BOX.querySelector('#smDm').textContent = dm ? T_('Terpasang: ') + dm.nama + ` (${dm.kategori.length} ${T_('kategori')})` : T_('Belum ada Data Model SMART.');
  BOX.querySelector('#smDmF').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const t = await f.text(), d = bacaDM(t); localStorage.setItem('sm_dm', JSON.stringify(d)); X().toast(T_('Data Model SMART terpasang.')); daftar(); } catch (er) { X().toast(er.message); } };
}
async function detail(id) {
  const p = (await Q().all()).find(x => x.id === id); if (!p || !BOX) return; const A = X(), n = { bio: 0, defor: 0, fitur: 0 }; p.waypoints.forEach(w => n[w.tally]++);
  BOX.innerHTML = `<div class="fa-card"><h4>${esc(p.info.id_kegiatan)}</h4><p class="fa-note">${esc(p.info.lokasi)} · ${esc(p.info.jenis_kegiatan)} · ${esc(p.info.transportasi)} · ${esc(wib(p.mulai))} – ${p.selesai ? esc(wib(p.selesai)) : '…'}<br>${T_('Tim')}: ${esc(p.info.tim)} · ${T_('Pelaksana')}: ${esc(p.info.pelaksana.join(', '))}</p>
      <div class="sm-st"><div><small>Jarak</small><b>${nf(panjang(p.track) / 1000, 2)} km</b></div><div><small>Keanekaragaman hayati</small><b>${n.bio}</b></div><div><small>Deforestasi/degradasi</small><b>${n.defor}</b></div><div><small>Fitur</small><b>${n.fitur}</b></div></div></div>
    <div class="fa-row"><button class="fa-btn pri" style="--c:#7C3AED" data-x="gpx">GPX</button><button class="fa-btn pri" style="--c:#0F766E" data-x="smart">XML SMART</button><button class="fa-btn pri" style="--c:#15803D" data-x="xlsx">Excel tallysheet</button><button class="fa-btn pri" style="--c:#B3261E" data-x="pdf">PDF</button><button class="fa-btn" data-x="shp">SHP</button><button class="fa-btn" data-x="csv">CSV</button><button class="fa-btn" data-x="json">JSON</button></div>
    <div class="fa-map" id="smMap" style="height:300px"></div><div class="fa-card" id="smWl2"></div>
    <div class="fa-row"><button class="fa-btn" id="smKb">← ${T_('Daftar patroli')}</button>${p.status === 'selesai' && !p.terkirim ? `<button class="fa-btn" id="smKr">${T_('Kirim sekarang')}</button>` : ''}<button class="fa-btn" id="smHp" style="color:#B91C1C">${T_('Hapus dari HP')}</button></div>`;
  BOX.querySelector('#smWl2').innerHTML = `<h4>Waypoint</h4>` + (p.waypoints.length ? p.waypoints.map(w => `<div class="sm-li"><span style="font-size:20px">${TALLY[w.tally].ikon}</span><span class="m"><b>WPT ${pad(w.no)} · ${esc(ringkas(w))}</b><small>${esc(wib(w.t))} · ${w.la.toFixed(6)}, ${w.lo.toFixed(6)} · ±${w.ak} m</small>${w.foto.length ? `<div class="sm-ft">${w.foto.map(f => `<img src="${f}">`).join('')}</div>` : ''}</span></div>`).join('') : '<p class="fa-note">–</p>');
  const el = BOX.querySelector('#smMap'); if (el && window.L) { if (MAP) { try { MAP.remove(); } catch (e) { } } MAP = L.map(el); L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri' }).addTo(MAP);
    const G = L.featureGroup().addTo(MAP); if (p.track.length > 1) L.polyline(p.track.map(x => [x[1], x[2]]), { color: '#F59E0B', weight: 4 }).addTo(G);
    p.waypoints.forEach(w => L.circleMarker([w.la, w.lo], { radius: 7, color: '#fff', weight: 2, fillColor: TALLY[w.tally].warna, fillOpacity: 1 }).bindPopup(`<b>WPT ${pad(w.no)}</b><br>${esc(ringkas(w))}`).addTo(G));
    if (G.getLayers().length) MAP.fitBounds(G.getBounds().pad(.2)); else MAP.setView([0.96, 112.6], 12); setTimeout(() => MAP.invalidateSize(), 300); }
  BOX.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { b.disabled = true; try { await ekspor(p, b.dataset.x); A.pakai('smart_ekspor_' + b.dataset.x); } catch (e) { A.toast(e.message || 'Gagal'); } finally { b.disabled = false; } });
  BOX.querySelector('#smKb').onclick = daftar; const kr = BOX.querySelector('#smKr'); if (kr) kr.onclick = async () => { await sync(); detail(id); };
  BOX.querySelector('#smHp').onclick = async () => { if (!p.terkirim && p.status === 'selesai' && !window.__smYakin) { window.__smYakin = 1; return A.toast(T_('Patroli belum terkirim ke server. Tekan Hapus sekali lagi untuk tetap menghapus.')); } window.__smYakin = 0; await Q().del(p.id); daftar(); };
}
const nm = p => `patroli_${String(p.info.id_kegiatan).replace(/\W+/g, '_')}`;
const xe = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const atribut = w => TALLY[w.tally].medan.filter(([k]) => w.d[k] != null && w.d[k] !== '').map(([k, l]) => [l, w.d[k]]);
const idFoto = (p, w) => w.foto.map((_, i) => `${p.info.id_kegiatan}_WPT${pad(w.no)}_${i + 1}.jpg`);
function gpx(p) {
  const wp = p.waypoints.map(w => `  <wpt lat="${w.la}" lon="${w.lo}">${w.alt != null ? `<ele>${w.alt}</ele>` : ''}<time>${iso(w.t)}</time><name>WPT${pad(w.no)}</name>
    <cmt>${xe(TALLY[w.tally].nama + ': ' + ringkas(w))}</cmt><desc>${xe(atribut(w).map(([l, v]) => `${l}: ${v}`).join('; '))}</desc><sym>${w.tally === 'bio' ? 'Animal Tracks' : w.tally === 'defor' ? 'Danger Area' : 'Flag, Blue'}</sym><type>${xe(TALLY[w.tally].nama)}</type>
    <extensions><fh:tallysheet>${w.tally}</fh:tallysheet><fh:akurasi_m>${w.ak}</fh:akurasi_m>${atribut(w).map(([l, v], i) => `<fh:atribut nama="${xe(l)}">${xe(v)}</fh:atribut>`).join('')}${idFoto(p, w).map(f => `<fh:foto>${xe(f)}</fh:foto>`).join('')}</extensions></wpt>`).join('\n');
  const tk = p.track.map(x => `      <trkpt lat="${x[1]}" lon="${x[2]}">${x[4] != null ? `<ele>${x[4]}</ele>` : ''}<time>${iso(x[0])}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fire Hotspot – Yayasan PRCF Indonesia" xmlns="http://www.topografix.com/GPX/1/1" xmlns:fh="https://erikprcfi.github.io/hotspot-fire-prcf/gpx" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata><name>${xe(p.info.id_kegiatan)}</name><desc>${xe(`${p.info.jenis_kegiatan} · ${p.info.lokasi} · tim ${p.info.tim} · pelaksana: ${p.info.pelaksana.join(', ')} · transportasi: ${p.info.transportasi} · ${p.info.tujuan}`)}</desc><time>${iso(p.mulai)}</time></metadata>
${wp}
  <trk><name>${xe(p.info.id_kegiatan)}</name><type>${xe(p.info.transportasi)}</type><trkseg>
${tk}
  </trkseg></trk>
</gpx>`;
}
async function ekspor(p, f) {
  const A = X(), base = nm(p);
  if (f === 'gpx') return A.dl(new Blob([gpx(p)], { type: 'application/gpx+xml' }), base + '.gpx');
  if (f === 'json') return A.dl(new Blob([JSON.stringify(p)], { type: 'application/json' }), base + '.json');
  if (f === 'smart') { const dm = DM(); if (!dm) throw new Error(T_('Pasang dulu Data Model SMART (menu Daftar & ekspor) agar XML memakai kunci Conservation Area Anda. Sementara itu gunakan GPX.')); return A.dl(new Blob([smartXml(p, dm)], { type: 'application/xml' }), base + '_SMART.xml'); }
  const rows = p.waypoints.map(w => ({ w, a: Object.fromEntries(atribut(w)) }));
  if (f === 'csv') { const K = ['no_wpt', 'tallysheet', 'waktu_wib', 'x_bujur', 'y_lintang', 'akurasi_m', 'ketinggian_m', 'id_foto', ...new Set(Object.values(TALLY).flatMap(t => t.medan.map(m => m[1])))];
    return A.dl(new Blob([A.csv([K, ...rows.map(({ w, a }) => [pad(w.no), TALLY[w.tally].nama, wib(w.t), w.lo, w.la, w.ak, w.alt, idFoto(p, w).join(' '), ...K.slice(8).map(k => a[k] ?? '')])])], { type: 'text/csv' }), base + '_waypoint.csv'); }
  if (f === 'shp') { if (!window.FHShp) await A.lib('assets/shp.js?v=63');
    const wp = rows.map(({ w, a }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lo, w.la] }, properties: { NO_WPT: w.no, TALLY: TALLY[w.tally].nama, WAKTU: wib(w.t), AKURASI: w.ak, URAIAN: ringkas(w), ATRIBUT: atribut(w).map(([l, v]) => `${l}: ${v}`).join('; '), ID_FOTO: idFoto(p, w).join(' '), ID_KEG: p.info.id_kegiatan } }));
    const tk = p.track.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: p.track.map(x => [x[2], x[1]]) }, properties: { ID_KEG: p.info.id_kegiatan, MULAI: wib(p.mulai), SELESAI: p.selesai ? wib(p.selesai) : '', PANJANG_KM: +(panjang(p.track) / 1000).toFixed(3), TIM: p.info.tim } }] : [];
    const Lr = []; if (wp.length) Lr.push({ nama: base + '_waypoint', fitur: wp, kolom: [['NO_WPT', 'N', 5, 0], ['TALLY', 'C', 40], ['WAKTU', 'C', 30], ['AKURASI', 'N', 6, 0], ['URAIAN', 'C', 120], ['ATRIBUT', 'C', 254], ['ID_FOTO', 'C', 200], ['ID_KEG', 'C', 60]] });
    if (tk.length) Lr.push({ nama: base + '_track', fitur: tk, kolom: [['ID_KEG', 'C', 60], ['MULAI', 'C', 30], ['SELESAI', 'C', 30], ['PANJANG_KM', 'N', 10, 3], ['TIM', 'C', 60]] });
    if (!Lr.length) throw new Error(T_('Belum ada track atau waypoint.'));
    const extra = {}; p.waypoints.forEach(w => w.foto.forEach((fo, i) => extra[idFoto(p, w)[i]] = Uint8Array.from(atob(fo.split(',')[1]), c => c.charCodeAt(0))));
    return A.dl(await FHShp.zip(Lr, extra), base + '_SHP.zip'); }
  if (f === 'xlsx') return excel(p);
  if (f === 'pdf') return pdfLap(p);
}
async function excel(p) {
  const A = X(); await A.lib('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'); const wb = new ExcelJS.Workbook(); wb.creator = 'Yayasan PRCF Indonesia – Fire Hotspot';
  const TH = { style: 'thin', color: { argb: 'FF000000' } }, BD = { top: TH, left: TH, bottom: TH, right: TH };
  const lembar = (judul, sub, kol, isi, lebar) => { const s = wb.addWorksheet(judul.slice(0, 31)); const n = kol.length;
    s.mergeCells(1, 1, 1, n); s.getCell(1, 1).value = judul; s.getCell(1, 1).font = { bold: true, size: 13 }; s.getCell(1, 1).alignment = { horizontal: 'center' };
    if (sub) { s.mergeCells(2, 1, 2, n); s.getCell(2, 1).value = sub; s.getCell(2, 1).alignment = { horizontal: 'center', wrapText: true }; }
    const r0 = 4; kol.forEach((k, i) => { const c = s.getCell(r0, i + 1); c.value = k; c.font = { bold: true }; c.border = BD; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }; });
    let r = r0 + 1; isi.forEach(row => { s.getCell(r, 2).value = 'x: ' + row.x; s.getCell(r + 1, 2).value = 'y: ' + row.y;
      row.v.forEach((v, i) => { const col = i === 0 ? 1 : i + 2; s.mergeCells(r, col, r + 1, col); const c = s.getCell(r, col); c.value = v; c.alignment = { vertical: 'middle', wrapText: true }; });
      for (let cI = 1; cI <= n; cI++) { s.getCell(r, cI).border = BD; s.getCell(r + 1, cI).border = BD; } r += 2; });
    lebar.forEach((w, i) => s.getColumn(i + 1).width = w); return s; };
  const by = k => p.waypoints.filter(w => w.tally === k);
  const xy = w => ({ x: w.lo.toFixed(6), y: w.la.toFixed(6) });
  lembar('Tallysheet indikator keanekeragaman hayati', '(Perjumpaan satwa liar, tanda satwa, tumbuhan, perburuan dan gangguan lainnya terhadap satwa liar)', ['No WPT', 'WPT', 'ID Foto', 'Jenis', 'Temuan', 'Jenis Kelamin', 'Jarak', 'Keyakinan Identifikasi', 'Keterangan'],
    by('bio').map(w => Object.assign(xy(w), { v: [pad(w.no), idFoto(p, w).join('\n'), w.d.jenis || '', w.d.temuan || '', w.d.kelamin || '', w.d.jarak != null ? w.d.jarak + ' m' : '', w.d.keyakinan || '', [w.d.jumlah != null ? 'Jumlah: ' + w.d.jumlah : '', w.d.ket || ''].filter(Boolean).join('; ')] })), [9, 18, 26, 22, 22, 12, 9, 14, 34]);
  lembar('Tallysheet penyebab deforestasi dan degradasi hutan', '', ['No WPT', 'WPT', 'ID Foto', 'Kategori-tipe temuan', 'Luas (Ha)', 'Alasan', 'Pelaku', 'Tingkat Kerusakan', 'Keterangan'],
    by('defor').map(w => Object.assign(xy(w), { v: [pad(w.no), idFoto(p, w).join('\n'), w.d.kategori || '', w.d.luas ?? '', w.d.alasan || '', w.d.pelaku || '', w.d.tingkat || '', w.d.ket || ''] })), [9, 18, 26, 30, 10, 22, 18, 14, 34]);
  lembar('Tallysheet fitur', '(Pal batas, lanting dan menara pantau)', ['No WPT', 'WPT', 'ID Foto', 'Tipe temuan', 'Keterangan'],
    by('fitur').map(w => Object.assign(xy(w), { v: [pad(w.no), idFoto(p, w).join('\n'), w.d.tipe || '', [w.d.kondisi ? 'Kondisi: ' + w.d.kondisi : '', w.d.ket || ''].filter(Boolean).join('; ')] })), [9, 18, 30, 26, 46]);
  const iu = wb.addWorksheet('Informasi umum'); iu.mergeCells('A1:D1'); iu.getCell('A1').value = 'Tallysheet informasi umum kegiatan patroli'; iu.getCell('A1').font = { bold: true, size: 13 };
  [['ID Kegiatan', p.info.id_kegiatan], ['Transportasi', p.info.transportasi], ['Nama Tim', p.info.tim], ['Lokasi', p.info.lokasi], ['Jenis Kegiatan', p.info.jenis_kegiatan], ['Tanggal/Bulan/tahun', p.info.tanggal], ['Mulai – selesai (WIB)', `${wib(p.mulai)} – ${p.selesai ? wib(p.selesai) : ''}`], ['Panjang track (km)', +(panjang(p.track) / 1000).toFixed(3)]]
    .forEach(([k, v], i) => { iu.getCell(3 + i, 1).value = k; iu.getCell(3 + i, 2).value = ':'; iu.getCell(3 + i, 3).value = v; });
  iu.getCell(12, 1).value = 'Pelaksana'; iu.getCell(12, 2).value = ':'; for (let i = 0; i < 10; i++) { iu.getCell(12 + (i % 5), i < 5 ? 3 : 4).value = `${i + 1}. ${p.info.pelaksana[i] || ''}`; }
  iu.getCell(18, 1).value = 'Tujuan dan catatan penting kegiatan patroli:'; iu.mergeCells('A19:D24'); iu.getCell('A19').value = p.info.tujuan; iu.getCell('A19').alignment = { wrapText: true, vertical: 'top' };
  [24, 3, 40, 40].forEach((w, i) => iu.getColumn(i + 1).width = w);
  const tk = wb.addWorksheet('Track GPS'); tk.addRow(['No', 'Waktu (WIB)', 'x (bujur)', 'y (lintang)', 'Akurasi (m)', 'Ketinggian (m)']); tk.getRow(1).font = { bold: true }; p.track.forEach((x, i) => tk.addRow([i + 1, wib(x[0]), x[2], x[1], x[3], x[4]]));
  [6, 22, 14, 14, 12, 14].forEach((w, i) => tk.getColumn(i + 1).width = w);
  wb.addWorksheet('Catatan').addRow(['Koordinat WPT: x = bujur, y = lintang, derajat desimal WGS 1984 (EPSG:4326), dari GPS HP. ID Foto = nama berkas foto di ekspor SHP. Dibuat oleh Fire Hotspot – Yayasan PRCF Indonesia, ' + wib(Date.now())]);
  A.dl(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nm(p) + '_tallysheet.xlsx');
}
async function pdfLap(p) {
  const A = X(); await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }); if (window.FHLang) FHLang.pdf(doc); const a = s => T_(s).replace(/[–—]/g, '-');
  doc.setFillColor(11, 59, 44); doc.rect(0, 0, 297, 24, 'F'); doc.setTextColor(255); doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(a('Laporan Patroli ' + p.info.id_kegiatan), 12, 11); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(a(`${p.info.lokasi} · ${p.info.jenis_kegiatan} · ${p.info.transportasi} · ${wib(p.mulai)} – ${p.selesai ? wib(p.selesai) : ''} · ${nf(panjang(p.track) / 1000, 2)} km`), 12, 18); doc.setTextColor(20);
  let y = 30; doc.text(doc.splitTextToSize(a(`Tim: ${p.info.tim} · Pelaksana: ${p.info.pelaksana.join(', ')} · Tujuan: ${p.info.tujuan}`), 272), 12, y); y += 10;
  for (const k of Object.keys(TALLY)) { const R = p.waypoints.filter(w => w.tally === k); if (!R.length) continue; const t = TALLY[k], K = t.medan.map(m => m[1]);
    doc.autoTable({ startY: y, head: [['No WPT', 'x / y', ...K].map(a)], body: R.map(w => [pad(w.no), `${w.lo.toFixed(6)}\n${w.la.toFixed(6)}`, ...t.medan.map(([kk]) => w.d[kk] ?? '')].map(v => a(String(v)))), theme: 'grid', headStyles: { fillColor: [31, 78, 61], fontSize: 7.5 }, styles: { fontSize: 7.5 }, margin: { left: 12, right: 12 }, didDrawPage: () => { } });
    y = doc.lastAutoTable.finalY + 8; }
  doc.save(nm(p) + '.pdf');
}

/* ---------- Data Model SMART (XML ekspor SMART Desktop) → kunci kategori & atribut ---------- */
const DM = () => { try { return JSON.parse(localStorage.getItem('sm_dm') || 'null'); } catch (e) { return null; } };
function bacaDM(t) {
  const d = new DOMParser().parseFromString(t, 'application/xml'); if (d.querySelector('parsererror')) throw new Error(T_('Berkas bukan XML yang sah.'));
  const nama = el => { const n = [...el.children].find(c => /^name(s)?$/i.test(c.localName)); return n ? (n.getAttribute('value') || n.textContent || '').trim() : (el.getAttribute('name') || ''); };
  const kat = [], atr = {};
  [...d.getElementsByTagNameNS('*', 'attribute')].forEach(a => { const k = a.getAttribute('key'); if (k && !atr[k]) atr[k] = { key: k, nama: nama(a), tipe: a.getAttribute('type') || '', item: [...a.getElementsByTagNameNS('*', 'item'), ...a.getElementsByTagNameNS('*', 'listItem')].map(i => ({ key: i.getAttribute('key'), nama: nama(i) })).filter(i => i.key) }; });
  const jalan = (el, jalur) => [...el.children].filter(c => c.localName === 'category').forEach(c => { const k = c.getAttribute('key'), j = jalur.concat(k); kat.push({ key: j.join('.'), nama: nama(c), atribut: [...c.children].filter(x => /attribute/i.test(x.localName)).map(x => x.getAttribute('attributeKey') || x.getAttribute('key')).filter(Boolean) }); jalan(c, j); });
  const root = d.getElementsByTagNameNS('*', 'categories')[0] || d.documentElement; jalan(root, []);
  if (!kat.length) throw new Error(T_('Tidak menemukan kategori di berkas ini. Pastikan berkas adalah ekspor Data Model SMART.'));
  return { nama: d.documentElement.getAttribute('name') || d.documentElement.localName, kategori: kat, atribut: Object.values(atr), peta: {} };
}
function smartXml(p, dm) {   // kerangka XML patroli SMART; pemetaan kategori ↔ tallysheet memakai kecocokan nama (disimpan di dm.peta)
  const cari = (teks, L, f) => { const t = String(teks || '').toLowerCase(); return L.find(x => f(x).toLowerCase() === t) || L.find(x => t && f(x).toLowerCase().includes(t)) || null; };
  const ob = w => { const cat = cari(w.d.jenis || w.d.kategori || w.d.tipe, dm.kategori, x => x.nama) || cari(TALLY[w.tally].nama, dm.kategori, x => x.nama);
    const at = atribut(w).map(([l, v]) => { const a = cari(l, dm.atribut, x => x.nama); if (!a) return ''; const it = a.item.length ? cari(v, a.item, x => x.nama) : null;
      return it ? `<attributes attributeKey="${xe(a.key)}"><itemKey>${xe(it.key)}</itemKey></attributes>` : typeof v === 'number' ? `<attributes attributeKey="${xe(a.key)}"><dValue>${v}</dValue></attributes>` : `<attributes attributeKey="${xe(a.key)}"><sValue>${xe(v)}</sValue></attributes>`; }).join('');
    return `<observations categoryKey="${xe(cat ? cat.key : '')}">${at}</observations>`; };
  const hari = [...new Set([...p.track.map(x => x[0]), ...p.waypoints.map(w => w.t)].map(t => new Date(t + 7 * 36e5).toISOString().slice(0, 10)))].sort();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Dibuat oleh Fire Hotspot (Yayasan PRCF Indonesia) memakai Data Model "${xe(dm.nama)}". Periksa pemetaan kategori sebelum impor. -->
<ns2:patrol xmlns:ns2="http://www.smartconservationsoftware.org/xml/1.0/patrol" id="${xe(p.info.id_kegiatan)}" patrolType="GROUND" isArmed="false" startDate="${new Date(p.mulai + 7 * 36e5).toISOString().slice(0, 10)}" endDate="${new Date((p.selesai || p.mulai) + 7 * 36e5).toISOString().slice(0, 10)}">
  <objective><description>${xe(p.info.tujuan)}</description></objective>
  <legs id="1" startDate="${hari[0] || ''}" endDate="${hari[hari.length - 1] || ''}"><transportType>${xe(p.info.transportasi)}</transportType>
${p.info.pelaksana.map((n, i) => `    <members employeeId="${xe(n)}" isLeader="${i === 0}"/>`).join('\n')}
${hari.map(h => `    <days date="${h}">
      <track>${p.track.filter(x => new Date(x[0] + 7 * 36e5).toISOString().slice(0, 10) === h).map(x => `${x[2]} ${x[1]} ${x[0]}`).join(',')}</track>
${p.waypoints.filter(w => new Date(w.t + 7 * 36e5).toISOString().slice(0, 10) === h).map(w => `      <waypoints id="${w.no}" x="${w.lo}" y="${w.la}" time="${new Date(w.t + 7 * 36e5).toISOString().slice(11, 19)}"><comment>${xe(w.d.ket || '')}</comment>${ob(w)}</waypoints>`).join('\n')}
    </days>`).join('\n')}
  </legs>
</ns2:patrol>`;
}
window.FHSmart = { open, sync, gpx, ekspor, TALLY };
})();
