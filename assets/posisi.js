/* Fire Hotspot – berbagi lokasi tim lapangan (hanya pengguna yang menyetujui saat masuk/daftar).
 * Selama aplikasi dibuka: GPS akurasi tinggi (watchPosition). Titik disimpan ke antrean bila berpindah ≥ max(25 m, akurasi)
 * atau tiap 5 menit, lalu dikirim ke database PRCF tiap 60 detik (sinyal hidup tiap 2 menit). Tanpa sinyal → antrean
 * tetap di HP dan dikirim saat online. Aplikasi ditutup/disembunyikan → GPS berhenti dan status "offline" dikirim.
 * Simbol pin di bilah atas: hijau berdenyut = lokasi sedang dibagikan, kuning = mencari GPS, abu-abu dicoret = tidak dibagikan.
 */
(function () {
'use strict';
const QK = 'fh_posq', MAXQ = 2000;
let LAGI = false, W = null, FIX = null, LASTQ = null, GPS = 'mencari', TM = null, SENDING = false, LASTSEND = 0, BAT = null, DOT = null;
const A = () => window.FHAkun;
const rad = x => x * Math.PI / 180;
const jarak = (a, b) => 2 * 6371000 * Math.asin(Math.sqrt(Math.sin(rad(b.la - a.la) / 2) ** 2 + Math.cos(rad(a.la)) * Math.cos(rad(b.la)) * Math.sin(rad(b.lo - a.lo) / 2) ** 2));
const qGet = () => { try { return JSON.parse(localStorage.getItem(QK) || '[]'); } catch (e) { return []; } };
const qSet = q => { try { localStorage.setItem(QK, JSON.stringify(q.slice(-MAXQ))); } catch (e) { } };
const boleh = () => { const a = A(), u = a && a.user(); return !!(a && a.masuk() && u && u.token && u.lokasiSetuju && u.lokasiOn !== false && a.endpoint()); };

/* ---------- simbol di bilah atas (tanpa tulisan) ---------- */
function dot() {
  if (DOT && document.body.contains(DOT)) return DOT;
  const me = document.getElementById('abMe'); if (!me) return null;
  if (!document.getElementById('geo-css')) { const s = document.createElement('style'); s.id = 'geo-css';
    s.textContent = `#geoDot{position:relative;width:24px;height:30px;margin:0 -2px;display:grid;place-items:center;flex:none;border-radius:50%;color:#fff}
    #geoDot svg{width:19px;height:19px;position:relative;z-index:1}#geoDot::before{content:"";position:absolute;inset:3px;border-radius:50%;background:currentColor;opacity:0}
    #geoDot.on{color:#34D399}#geoDot.on::before{animation:geoP 2.2s ease-out infinite}#geoDot.cari{color:#FACC15}#geoDot.cari svg{animation:geoB 1s ease-in-out infinite alternate}#geoDot.off{color:rgba(255,255,255,.45)}
    @keyframes geoP{0%{opacity:.45;transform:scale(.5)}100%{opacity:0;transform:scale(1.35)}}@keyframes geoB{to{opacity:.35}}
    @media (prefers-reduced-motion:reduce){#geoDot::before,#geoDot svg{animation:none!important}}`; document.head.appendChild(s); }
  DOT = document.createElement('button'); DOT.id = 'geoDot'; DOT.type = 'button'; DOT.className = 'tap off'; DOT.hidden = true;
  DOT.onclick = () => { const a = A(); if (!a) return; if (GPS === 'ditolak') { tip('⚠ GPS'); return; } if (FIX) tip('±' + Math.round(FIX.ak) + ' m'); else if (!boleh()) a.openProfile(); };
  me.parentNode.insertBefore(DOT, me); return DOT;
}
function tip(t) { const d = document.createElement('div'); d.className = 'ak-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
const PIN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s7.5-6.6 7.5-12.2A7.5 7.5 0 0 0 4.5 9.8C4.5 15.4 12 22 12 22z"/><circle cx="12" cy="9.8" r="2.8" fill="#0B3B2C"/></svg>';
const PINX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7.5-6.6 7.5-12.2A7.5 7.5 0 0 0 4.5 9.8C4.5 15.4 12 22 12 22z"/><path d="M3 3l18 18" stroke-linecap="round"/></svg>';
function ui() {
  const d = dot(); if (!d) return; const a = A(), u = a && a.user();
  if (!u || !a.masuk()) { d.hidden = true; return; } d.hidden = false;
  const st = !boleh() || GPS === 'ditolak' || GPS === 'tidak' ? 'off' : FIX && GPS === 'ok' ? 'on' : 'cari';
  if (d.dataset.st !== st) { d.dataset.st = st; d.className = 'tap ' + st; d.innerHTML = st === 'off' ? PINX : PIN; }
  d.setAttribute('aria-label', st === 'on' ? 'Lokasi dibagikan' : st === 'cari' ? 'Mencari GPS' : 'Lokasi tidak dibagikan');
}

/* ---------- GPS ---------- */
function onFix(p) {
  const c = p.coords, f = { t: p.timestamp || Date.now(), la: c.latitude, lo: c.longitude, ak: c.accuracy || 9999, v: c.speed != null && c.speed >= 0 ? c.speed * 3.6 : null };
  if (FIX && f.ak > 2 * FIX.ak && f.t - FIX.t < 6e4 && jarak(FIX, f) < f.ak) return;   // bacaan lebih kasar sesaat setelah bacaan bagus: abaikan
  const first = !FIX; FIX = f; GPS = 'ok';
  if (!LASTQ || (jarak(LASTQ, f) >= Math.max(25, Math.min(f.ak, 100)) && f.t - LASTQ.t >= 2e4) || f.t - LASTQ.t >= 3e5) {
    const q = qGet(); q.push({ t: Math.round(f.t), la: +f.la.toFixed(6), lo: +f.lo.toFixed(6), ak: Math.round(f.ak), v: f.v == null ? null : +f.v.toFixed(1) }); qSet(q); LASTQ = f;
  }
  ui(); if (first || Date.now() - LASTSEND > 6e4) kirim();
}
function onErr(e) { GPS = e && e.code === 1 ? 'ditolak' : e && e.code === 2 ? 'tidak' : GPS === 'ok' ? 'ok' : 'mencari'; ui(); if (e && e.code === 1) kirim(); }
function mulai() {
  ui(); if (!boleh() || document.hidden) return;
  if (W == null && navigator.geolocation) { GPS = FIX ? GPS : 'mencari'; W = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 60000 }); }
  else if (!navigator.geolocation) GPS = 'tidak';
  if (!TM) TM = setInterval(() => { if (!boleh()) return berhenti(true); const q = qGet(); if (q.length || Date.now() - LASTSEND >= 115e3) kirim(); }, 6e4);
  try { navigator.getBattery && navigator.getBattery().then(b => { BAT = Math.round(b.level * 100); b.onlevelchange = () => BAT = Math.round(b.level * 100); }).catch(() => { }); } catch (e) { }
  kirim(); ui();
}
function berhenti(kirimOff) {
  if (W != null) { try { navigator.geolocation.clearWatch(W); } catch (e) { } W = null; }
  clearInterval(TM); TM = null; if (kirimOff) beacon(); ui();
}
function muatan(status) {
  const a = A(), u = a.user(), q = qGet().slice(0, 300);
  return { aksi: 'posisi', id: u.id, token: u.token, status, gps: u.lokasiOn === false ? 'mati' : GPS, titik: q, baterai: BAT, hd: (window.FHSiteNama && window.FHSiteNama()) || '', perangkat: a.perangkat(), setuju_t: u.lokasiSetujuT || '' };
}
async function kirim() {
  if (SENDING) { LAGI = true; return; } if (!boleh() || navigator.onLine === false) return; SENDING = true; LAGI = false;
  try { const b = muatan('online'), n = b.titik.length, j = await A().api(b, 25000);
    if (j && j.ok) { LASTSEND = Date.now(); if (n) { const q = qGet(); qSet(q.slice(n)); } }
  } catch (e) { } finally { SENDING = false; if (LAGI) { LAGI = false; if (qGet().length) setTimeout(kirim, 500); } }
}
function beacon() {   // aplikasi ditutup/disembunyikan: kirim titik tersisa + status offline
  const a = A(), u = a && a.user(); if (!u || !u.token || !u.lokasiSetuju || !a.endpoint()) return;
  try { const b = muatan('offline'); if (u.lokasiOn === false) b.gps = 'mati'; b.kunci = 'fh-prcf-2026-akun';
    if (navigator.sendBeacon(a.endpoint(), new Blob([JSON.stringify(b)], { type: 'text/plain;charset=utf-8' })) && b.titik.length) qSet(qGet().slice(b.titik.length)); } catch (e) { }
}
let SUDAH = false;
function init() {
  const a = A(); if (!a || SUDAH) return; SUDAH = true;
  let was = null;
  a.onChange(() => { const now = boleh(); if (now && !was) mulai(); else if (!now && was) { const u = a.user(); if (u && u.lokasiOn === false) { GPS = 'mati'; beacon(); } berhenti(false); } was = now; ui(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) berhenti(true); else mulai(); });
  window.addEventListener('pagehide', () => berhenti(true));
  window.addEventListener('online', () => kirim());
  was = boleh(); if (was) mulai(); else ui();
}
window.FHPosisi = { init, sekarang: () => FIX, status: () => GPS };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
