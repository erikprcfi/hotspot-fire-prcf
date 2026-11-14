/* Pantau Rimbak – PANTAU LOKASI SAYA: notifikasi titik panas baru di sekitar lokasi yang disimpan pengguna (tahap 1, tanpa server push)
 * - Hingga 3 lokasi (GPS / tengah peta) dengan radius 5–50 km; berlaku juga untuk mode tamu (tanpa akun).
 * - Data: salinan NASA FIRMS NRT se-Indonesia (data/titik_id, via FHNasional.titik), diperbarui ±1,5–3 jam.
 * - Diperiksa saat aplikasi dibuka, setiap 15 menit selama terbuka, dan saat kembali ke aplikasi.
 *   Notifikasi: aplikasi Android → notifikasi lokal; browser/PWA → Notification API (bila diizinkan); selain itu kartu di aplikasi.
 * Pemakaian: FHLokasiSaya.mount(el)
 */
(function () {
'use strict';
const en = () => { try { return window.FHLang && FHLang.get() === 'en'; } catch (e) { return false; } };
const I = (a, b) => en() ? b : a;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const baca = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const LK = 'fh_lok_saya', SK = 'fh_lok_lihat', NK = 'fh_lok_notif', MAX = 3, RAD = [5, 10, 25, 50];
const daftar = () => baca(LK, []).filter(x => x && isFinite(x.lat) && isFinite(x.lon)).slice(0, MAX);
const wib = ms => new Date(ms + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' ') + ' WIB';
const NAT = () => !!(window.FHNative && FHNative.aktif), LN = () => NAT() && FHNative.plugin('LocalNotifications');
const toast = t => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#14211c;color:#fff;padding:10px 16px;border-radius:12px;font:600 13px var(--f,system-ui);z-index:9600;max-width:90%;text-align:center'; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); };

async function izin() {
  if (LN()) { const P = LN(); let s = await P.checkPermissions(); if (s.display !== 'granted') s = await P.requestPermissions(); return s.display === 'granted'; }
  if ('Notification' in window) { if (Notification.permission === 'granted') return true; if (Notification.permission === 'denied') return false; return (await Notification.requestPermission()) === 'granted'; }
  return false;
}
let nid = 0;
async function beriTahu(judul, isi) {
  try {
    if (LN()) { await LN().schedule({ notifications: [{ id: (Date.now() % 1e9) + (nid++), title: judul, body: isi, extra: { url: location.href.split('#')[0] } }] }); return true; }
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration().catch(() => null);
      if (reg && reg.showNotification) await reg.showNotification(judul, { body: isi, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: 'lokasi-saya' }); else new Notification(judul, { body: isi, icon: 'assets/icons/icon-192.png' });
      return true;
    }
  } catch (e) { }
  return false;
}
let SUDAH = null, kartu = [];
async function cek(diam) {
  const L = daftar(); if (!L.length || !window.FHNasional || !FHNasional.titik) return { n: 0, per: [] };
  const lihat = new Set(baca(SK, [])), awal = !baca('fh_lok_awal', 0), batas = Date.now() - 24 * 36e5, per = []; let total = 0;
  for (const x of L) {
    let R; try { R = await FHNasional.titik({ lat: x.lat, lon: x.lon }, x.r || 10); } catch (e) { continue; }
    const P = (R.P || []).filter(p => p.when >= batas), baru = P.filter(p => !lihat.has(`${p.la},${p.lo},${p.when}`));
    P.forEach(p => lihat.add(`${p.la},${p.lo},${p.when}`));
    per.push({ x, n24: P.length, baru: baru.length, dekat: P.length ? Math.min(...P.map(p => p.d)) : null, akhir: P.length ? P[0].when : null, upd: R.upd });
    if (baru.length && !awal && !diam) { total += baru.length;
      const j = I(`🔥 ${baru.length} titik panas baru dekat ${x.nama}`, `🔥 ${baru.length} new hotspot(s) near ${x.nama}`), dmin = Math.min(...baru.map(p => p.d));
      const s = I(`Terdekat ±${dmin.toFixed(1)} km, terdeteksi ${wib(Math.max(...baru.map(p => p.when)))}. Data NASA FIRMS – periksa di lapangan.`, `Nearest ±${dmin.toFixed(1)} km, detected ${wib(Math.max(...baru.map(p => p.when)))}. NASA FIRMS data – verify in the field.`);
      const ok = baca(NK, true) && await beriTahu(j, s); if (!ok) kartu.push({ j, s, t: Date.now() }); }
  }
  tulis(SK, [...lihat].slice(-3000)); if (awal) tulis('fh_lok_awal', Date.now());
  SUDAH = { t: Date.now(), per }; if (kartu.length) tampilKartu(); render(); return { n: total, per };
}
function tampilKartu() {   // tanpa izin notifikasi: tampilkan kartu di dalam aplikasi
  const k = kartu.shift(); if (!k) return; const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(64px + env(safe-area-inset-top));z-index:9400;max-width:460px;margin:0 auto;background:#fff;color:#14211c;border-left:5px solid #C2410C;border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-family:var(--f,system-ui)';
  d.innerHTML = `<b style="display:block;font-size:14px">${esc(k.j)}</b><span style="font-size:13px;color:#4f5d56">${esc(k.s)}</span><button style="float:right;margin-top:6px;border:0;background:#1E7A58;color:#fff;border-radius:10px;padding:7px 12px;font:700 12.5px var(--f,system-ui)">OK</button>`;
  d.querySelector('button').onclick = () => { d.remove(); tampilKartu(); }; document.body.appendChild(d);
}
async function tambah(lat, lon, src) {
  const L = daftar(); if (L.length >= MAX) return toast(I(`Maksimal ${MAX} lokasi. Hapus salah satu dulu.`, `Up to ${MAX} locations. Remove one first.`));
  let nama = src === 'gps' ? I('Lokasi saya', 'My location') : I('Lokasi peta', 'Map location');
  try { if (window.FHWilayah) { const w = await FHWilayah.lookup(lat, lon); if (w) nama = FHWilayah.label(w, false); } } catch (e) { }
  L.push({ id: Date.now().toString(36), nama: String(nama).slice(0, 60), lat: +lat.toFixed(5), lon: +lon.toFixed(5), r: 10 }); tulis(LK, L);
  if (baca(NK, true)) izin().catch(() => { }); await cek(true); mulai(); toast(I('Lokasi disimpan. Titik panas baru di sekitarnya akan diberitahukan.', 'Location saved. You will be notified of new hotspots nearby.'));
}
let EL = null;
function render() {
  if (!EL || !EL.isConnected) return; const L = daftar(), on = baca(NK, true);
  const st = id => SUDAH && SUDAH.per.find(p => p.x.id === id);
  EL.innerHTML = `<div style="padding:16px">
   <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="font-size:22px">📍</span><b style="flex:1;font-size:15px">${I('Pantau lokasi saya', 'Watch my locations')}</b>${window.FHHemat && FHHemat.aktif() ? `<span class="fh-hemat-pill">${I('Hemat data', 'Data saver')}</span>` : ''}</div>
   <p class="small muted" style="margin:0 0 12px;font-size:13px;line-height:1.5">${I('Simpan hingga 3 lokasi. Aplikasi memberi tahu bila ada titik panas baru NASA FIRMS di dalam radius yang dipilih (diperiksa saat aplikasi dibuka dan setiap 15 menit selama terbuka). Tidak perlu akun.', 'Save up to 3 locations. The app notifies you of new NASA FIRMS hotspots within the chosen radius (checked when the app opens and every 15 minutes while open). No account needed.')}</p>
   ${L.map(x => { const s = st(x.id); return `<div style="border:1px solid var(--line,#e1e7e3);border-radius:14px;padding:12px;margin-bottom:10px">
     <div style="display:flex;gap:8px;align-items:flex-start"><b style="flex:1;font-size:14px">${esc(x.nama)}</b><button data-ls-del="${x.id}" aria-label="${I('Hapus', 'Remove')}" style="border:0;background:none;color:#B3261E;font:700 12.5px var(--f,system-ui);cursor:pointer">${I('Hapus', 'Remove')}</button></div>
     <small class="muted" style="display:block;margin:2px 0 8px">${x.lat.toFixed(4)}, ${x.lon.toFixed(4)}</small>
     <div style="display:flex;flex-wrap:wrap;gap:6px">${RAD.map(r => `<button data-ls-r="${x.id}|${r}" aria-pressed="${(x.r || 10) === r}" style="padding:6px 11px;border-radius:99px;border:1.5px solid ${(x.r || 10) === r ? '#1E7A58' : 'var(--line,#dde3df)'};background:${(x.r || 10) === r ? '#1E7A58' : 'transparent'};color:${(x.r || 10) === r ? '#fff' : 'inherit'};font:700 12px var(--f,system-ui);cursor:pointer">${r} km</button>`).join('')}</div>
     ${s ? `<div style="margin-top:9px;font-size:12.5px;font-weight:600;color:${s.n24 ? '#B3261E' : '#1E7A58'}">${s.n24 ? I(`${s.n24} titik panas dalam 24 jam terakhir · terdekat ±${s.dekat.toFixed(1)} km`, `${s.n24} hotspot(s) in the last 24 h · nearest ±${s.dekat.toFixed(1)} km`) : I('Tidak ada titik panas dalam 24 jam terakhir', 'No hotspots in the last 24 hours')}</div>` : ''}</div>`; }).join('')}
   ${L.length < MAX ? `<div style="display:flex;gap:8px;margin-bottom:12px"><button data-ls-add="gps" class="btn tap" style="flex:1;padding:11px;border-radius:12px;border:1.5px solid #1E7A58;background:#E6F2EC;color:#14533B;font:700 13px var(--f,system-ui);cursor:pointer">＋ ${I('Lokasi GPS saya', 'My GPS location')}</button><button data-ls-add="peta" class="btn tap" style="flex:1;padding:11px;border-radius:12px;border:1.5px solid var(--line,#dde3df);background:transparent;color:inherit;font:700 13px var(--f,system-ui);cursor:pointer">＋ ${I('Tengah peta', 'Map centre')}</button></div>` : ''}
   <label style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line,#e3e8e4)"><span style="flex:1;font-size:14px;font-weight:600">${I('Notifikasi di perangkat ini', 'Notifications on this device')}<small class="muted" style="display:block;font-weight:500;font-size:12px">${I('Bila izin ditolak, peringatan tampil sebagai kartu di aplikasi.', 'If permission is denied, alerts appear as an in-app card.')}</small></span><input type="checkbox" id="lsNotif" ${on ? 'checked' : ''} style="width:22px;height:22px"></label>
   ${L.length ? `<button id="lsCek" style="width:100%;margin-top:6px;padding:11px;border-radius:12px;border:0;background:var(--accent-soft,#e6f2ec);color:#14533B;font:700 13px var(--f,system-ui);cursor:pointer">${I('Periksa sekarang', 'Check now')}</button>` : ''}
   <p class="small muted" style="margin:10px 0 0;font-size:11.5px">${SUDAH ? I('Terakhir diperiksa ', 'Last checked ') + wib(SUDAH.t) + (SUDAH.per[0] && SUDAH.per[0].upd ? ' · ' + I('data FIRMS ', 'FIRMS data ') + esc(String(SUDAH.per[0].upd).replace('T', ' ').slice(0, 16)) + ' UTC' : '') : ''}. ${I('Notifikasi saat aplikasi tertutup penuh akan tersedia pada pembaruan berikutnya.', 'Notifications while the app is fully closed will come in a later update.')}</p></div>`;
  EL.querySelectorAll('[data-ls-del]').forEach(b => b.onclick = () => { tulis(LK, daftar().filter(x => x.id !== b.dataset.lsDel)); if (SUDAH) SUDAH.per = SUDAH.per.filter(p => p.x.id !== b.dataset.lsDel); render(); });
  EL.querySelectorAll('[data-ls-r]').forEach(b => b.onclick = () => { const [id, r] = b.dataset.lsR.split('|'); tulis(LK, daftar().map(x => x.id === id ? Object.assign(x, { r: +r }) : x)); cek(true); });
  EL.querySelectorAll('[data-ls-add]').forEach(b => b.onclick = () => {
    if (b.dataset.lsAdd === 'peta') { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return toast(I('Buka peta dulu', 'Open the map first')); const c = m.getCenter(); return tambah(c.lat, c.lng, 'peta'); }
    if (!navigator.geolocation) return toast(I('GPS tidak tersedia di perangkat ini', 'GPS is not available on this device'));
    b.disabled = true; b.textContent = I('Mencari lokasi…', 'Locating…');
    navigator.geolocation.getCurrentPosition(p => tambah(p.coords.latitude, p.coords.longitude, 'gps'), () => { b.disabled = false; render(); toast(I('Izinkan akses lokasi lalu coba lagi', 'Allow location access and try again')); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
  const n = EL.querySelector('#lsNotif'); if (n) n.onchange = async () => { tulis(NK, n.checked); if (n.checked && !(await izin())) toast(I('Izin notifikasi ditolak – peringatan tampil sebagai kartu di aplikasi.', 'Notification permission denied – alerts will appear as an in-app card.')); };
  const c = EL.querySelector('#lsCek'); if (c) c.onclick = async () => { c.disabled = true; c.textContent = I('Memeriksa…', 'Checking…'); const r = await cek(false); toast(r.n ? I(`${r.n} titik panas baru`, `${r.n} new hotspot(s)`) : I('Tidak ada titik panas baru', 'No new hotspots')); };
}
function mount(el) { EL = el; render(); if (!SUDAH && daftar().length) cek(true); }
let LOOP = false;
function mulai() { if (LOOP || !daftar().length) return; LOOP = true; setInterval(() => cek(false), 15 * 6e4); document.addEventListener('visibilitychange', () => { if (!document.hidden && (!SUDAH || Date.now() - SUDAH.t > 5 * 6e4)) cek(false); }); }
setTimeout(() => { if (!daftar().length) return; cek(false); mulai(); }, 9000);
window.FHLokasiSaya = { mount, cek, daftar, tambah };
})();
