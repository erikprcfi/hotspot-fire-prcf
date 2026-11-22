/* Pantau Rimbak – pelengkap untuk rilis publik – Yayasan PRCF Indonesia
 * 1) FHGalat  : catat galat JavaScript secara anonim (tanpa nama/email/lokasi), antre di perangkat, kirim ke database PRCF
 *               (Apps Script v14, aksi log_galat). Bila server belum mendukung, antrean disimpan dan dicoba lagi nanti.
 * 2) FHHemat  : mode hemat data – otomatis saat jaringan lambat / "Penghemat data" HP aktif, atau dinyalakan manual di Profil.
 * 3) FHPanduanAwal : panduan singkat 4 layar saat aplikasi pertama kali dibuka (bisa dibuka lagi dari Profil).
 * Dimuat paling awal di <head> agar galat saat memuat ikut tercatat.
 */
(function () {
'use strict';
const en = () => { try { return window.FHLang && FHLang.get() === 'en'; } catch (e) { return false; } };
const baca = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= 1. LOG GALAT ================= */
const GK = 'fh_galat_antre', GV = '2026.11b';
const URL_ = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec', KUNCI = 'fh-prcf-2026-akun';
const LOKAL = !window.FH_ASLI && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   /* aplikasi asli (https://localhost) tetap mengirim log galat */
const ABAI = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection|AbortError|The user aborted|Load failed|Failed to fetch|NetworkError|cancelled|chrome-extension:|moz-extension:/i;
const perangkat = () => { const u = navigator.userAgent; const a = (u.match(/Android [\d.]+/) || u.match(/iPhone OS [\d_]+/) || u.match(/Windows NT [\d.]+|Mac OS X [\d_]+|Linux/) || ['?'])[0].replace(/_/g, '.');
  const b = (u.match(/(Edg|OPR|SamsungBrowser|Chrome|Firefox|Safari)\/[\d]+/) || ['?'])[0]; return `${a} · ${b} · ${window.FH_ASLI ? 'APK-asli' : window.FHNative && FHNative.aktif ? 'APK' : (matchMedia && matchMedia('(display-mode: standalone)').matches ? 'PWA' : 'web')} · ${innerWidth}px`; };
const halaman = () => { try { const p = document.querySelector('#page.on #pgTitle, .appbar .t b, #abTitle'); return (location.pathname.split('/').pop() || 'index') + (p ? ' · ' + p.textContent.trim().slice(0, 40) : ''); } catch (e) { return location.pathname; } };
function catat(pesan, sumber) {
  pesan = String(pesan || '').slice(0, 300); if (!pesan || ABAI.test(pesan) || ABAI.test(sumber || '')) return;
  const Q = baca(GK, []), kunci = pesan + '|' + (sumber || ''), x = Q.find(q => q.k === kunci && Date.now() - q.t < 864e5);
  if (x) x.n = (x.n || 1) + 1; else Q.push({ k: kunci, pesan, sumber: String(sumber || '').slice(0, 160), hal: halaman(), t: Date.now(), n: 1 });
  tulis(GK, Q.slice(-50)); jadwal();
}
let tm = null; const jadwal = () => { if (!tm) tm = setTimeout(() => { tm = null; kirim(); }, 20000); };
async function kirim() {
  if (LOKAL || navigator.onLine === false) return; const Q = baca(GK, []); if (!Q.length) return;
  const ambil = Q.slice(0, 20); let mode = 'umum'; try { const A = window.FHAkun && FHAkun.akses && FHAkun.akses(); mode = A ? A.mode : 'umum'; if (window.FHAkun && FHAkun.tamu && FHAkun.tamu()) mode = 'tamu'; } catch (e) { }
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ kunci: KUNCI, aksi: 'log_galat', versi: GV, mode, perangkat: perangkat(), item: ambil.map(q => ({ pesan: q.pesan, sumber: q.sumber, hal: q.hal, t: q.t, n: q.n })) }) });
    const j = await r.json(); if (j && j.ok) { const sisa = baca(GK, []).filter(q => !ambil.some(a => a.k === q.k && a.t === q.t)); tulis(GK, sisa); }
    // server lama (belum v14) menjawab galat lain: antrean dibiarkan, dicoba lagi pada pembukaan berikutnya
  } catch (e) { }
}
addEventListener('error', e => { if (e && e.message) catat(e.message, (e.filename || '').split('/').pop() + ':' + (e.lineno || 0)); }, true);
addEventListener('unhandledrejection', e => { const r = e && e.reason; catat(r && (r.message || String(r)), r && r.stack ? String(r.stack).split('\n')[1] || '' : 'promise'); });
addEventListener('load', () => setTimeout(kirim, 8000));
addEventListener('online', () => setTimeout(kirim, 3000));
window.FHGalat = { catat, kirim, antre: () => baca(GK, []).length };

/* ================= 2. MODE HEMAT DATA ================= */
const HK = 'fh_hemat';   // 'auto' | 'on' | 'off'
const lambat = () => { const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection; return !!(c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || '') || (c.effectiveType === '3g' && (c.downlink || 9) < 0.8))); };
const setelan = () => { const v = baca(HK, 'auto'); return ['auto', 'on', 'off'].includes(v) ? v : 'auto'; };
const aktif = () => { const s = setelan(); return s === 'on' || (s === 'auto' && lambat()); };
const subsH = [];
function terapkan() { const a = aktif(); document.documentElement.classList.toggle('hemat', a); subsH.forEach(f => { try { f(a); } catch (e) { } }); }
if (!document.getElementById('fh-hemat-css')) {
  const st = document.createElement('style'); st.id = 'fh-hemat-css';
  st.textContent = `html.hemat .hx-img{animation:none!important}html.hemat .hx-img.f1,html.hemat .hx-img.f2,html.hemat .hx-img.f3{background-image:none!important;opacity:0!important}
  html.hemat video{display:none!important}.fh-hemat-pill{display:inline-flex;align-items:center;gap:6px;font:700 11px var(--f,system-ui);padding:3px 9px;border-radius:99px;background:#FFF4E5;color:#8A5300}`;
  (document.head || document.documentElement).appendChild(st);
}
terapkan();
// HP ringan (RAM ≤ 4 GB atau ≤ 4 inti): matikan efek kaca buram & animasi latar yang berat agar tampilan tetap lancar
try { const ram = navigator.deviceMemory || 8, inti = navigator.hardwareConcurrency || 8;
  if (ram <= 4 || inti <= 4 || String(baca('fh_ringan', '')) === '1') { document.documentElement.classList.add('ringan');
    const st = document.createElement('style'); st.id = 'fh-ringan-css';
    st.textContent = `html.ringan *{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}html.ringan .glass{background:rgba(12,32,24,.9)!important}html.ringan .hx-glass{background:rgba(10,30,22,.72)!important}html.ringan .hx-img{animation:none!important;will-change:auto!important}html.ringan .hx-img.f1,html.ringan .hx-img.f2,html.ringan .hx-img.f3{display:none!important}`;
    (document.head || document.documentElement).appendChild(st); } } catch (e) { }
try { const c = navigator.connection; c && c.addEventListener && c.addEventListener('change', terapkan); } catch (e) { }
// Ubin peta: saat hemat, ubin di luar layar tidak disimpan (keepBuffer 0) dan baru dimuat setelah peta berhenti digeser
function petaHemat(map) { if (!map || map._fhHemat) return; map._fhHemat = 1;
  const atur = l => { if (!l || !l.options || l.options.keepBuffer == null) return; if (l._fhKB == null) l._fhKB = l.options.keepBuffer; l.options.keepBuffer = aktif() ? 0 : l._fhKB; };
  map.on('layeradd', e => atur(e.layer)); subsH.push(() => map.eachLayer(atur)); map.eachLayer(atur); }
window.FHHemat = { aktif, setelan, set: v => { tulis(HK, v); terapkan(); }, lambat, onChange: f => subsH.push(f), peta: petaHemat };

/* ================= 3. PANDUAN SINGKAT PERTAMA BUKA ================= */
const PK = 'fh_panduan_v1';
const SL = () => en() ? [
  ['👋', 'Welcome to Pantau Rimbak', 'Monitor hotspots, weather, air quality and forest condition around you. All figures come from official sources (NASA, BMKG, ECMWF, Copernicus, University of Maryland) and show their source.'],
  ['🔥', 'A hotspot is not always a fire', 'Satellites detect unusually hot pixels (375 m for VIIRS, 1 km for MODIS). It may be a fire, a burning field or a hot surface. Confidence (high / nominal / low) tells how certain the detection is – always verify in the field.'],
  ['🗺️', 'Reading the map', 'Each symbol shape is a satellite; colour shows confidence. Tap a point for time (WIB), distance and satellite. Use the layer button for smoke, air quality and satellite imagery.'],
  ['🔔', 'Alerts & saving data', 'Save up to 3 locations under Profile → Early warning to be notified of new hotspots nearby. On weak signal, Data saver mode loads lighter maps. Pantau Rimbak is not an official government system.']
] : [
  ['👋', 'Selamat datang di Pantau Rimbak', 'Pantau titik panas, cuaca, kualitas udara, dan kondisi hutan di sekitar Anda. Semua angka berasal dari sumber resmi (NASA, BMKG, ECMWF, Copernicus, University of Maryland) dan selalu mencantumkan sumbernya.'],
  ['🔥', 'Titik panas belum tentu kebakaran', 'Satelit mendeteksi piksel yang lebih panas dari sekitarnya (375 m untuk VIIRS, 1 km untuk MODIS). Bisa api kebakaran, pembakaran lahan, atau permukaan yang sangat panas. Tingkat keyakinan (tinggi/sedang/rendah) menunjukkan seberapa pasti deteksinya – selalu periksa di lapangan.'],
  ['🗺️', 'Membaca peta', 'Bentuk simbol menunjukkan satelit, warna menunjukkan tingkat keyakinan. Ketuk titik untuk melihat waktu (WIB), jarak, dan satelitnya. Tombol lapisan menampilkan asap, kualitas udara, dan citra satelit.'],
  ['🔔', 'Peringatan & hemat data', 'Simpan hingga 3 lokasi di Profil → Peringatan dini agar diberi tahu bila ada titik panas baru di dekatnya. Saat sinyal lemah, Mode hemat data memuat peta yang lebih ringan. Pantau Rimbak bukan sistem resmi pemerintah.']
];
function buka(paksa) {
  if (!paksa && baca(PK, 0)) return; if (document.getElementById('fhPa')) return;
  const L = SL(); let i = 0;
  const d = document.createElement('div'); d.id = 'fhPa'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<style>#fhPa{position:fixed;inset:0;z-index:9500;background:rgba(6,20,15,.62);display:flex;align-items:flex-end;justify-content:center;font-family:var(--f,system-ui)}
  #fhPa .bx{background:#fff;color:#14211c;width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:26px 22px calc(20px + var(--safe-area-inset-bottom,env(safe-area-inset-bottom)));box-shadow:0 -10px 40px rgba(0,0,0,.25)}
  @media(min-width:700px){#fhPa{align-items:center}#fhPa .bx{border-radius:24px}}
  #fhPa .em{font-size:44px;line-height:1}#fhPa h3{margin:14px 0 8px;font-size:20px;color:#14211c}#fhPa p{margin:0;font-size:14.5px;line-height:1.55;color:#4f5d56;min-height:5.2em}
  #fhPa .dt{display:flex;gap:6px;margin:18px 0}#fhPa .dt i{width:8px;height:8px;border-radius:9px;background:#cfd8d3}#fhPa .dt i.on{width:22px;background:#1E7A58}
  #fhPa .ac{display:flex;gap:10px}#fhPa button{flex:1;padding:13px;border-radius:14px;border:0;font:700 15px var(--f,system-ui);cursor:pointer}
  #fhPa .lw{background:transparent;color:#5b6660}#fhPa .nx{background:#1E7A58;color:#fff}</style>
  <div class="bx"><div class="em"></div><h3></h3><p></p><div class="dt"></div><div class="ac"><button class="lw"></button><button class="nx"></button></div></div>`;
  document.body.appendChild(d);
  const selesai = () => { tulis(PK, Date.now()); d.remove(); };
  const draw = () => { const s = L[i]; d.querySelector('.em').textContent = s[0]; d.querySelector('h3').textContent = s[1]; d.querySelector('p').textContent = s[2];
    d.querySelector('.dt').innerHTML = L.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    d.querySelector('.lw').textContent = i ? (en() ? 'Back' : 'Kembali') : (en() ? 'Skip' : 'Lewati');
    d.querySelector('.nx').textContent = i === L.length - 1 ? (en() ? 'Start' : 'Mulai') : (en() ? 'Next' : 'Lanjut'); };
  d.querySelector('.lw').onclick = () => { if (i) { i--; draw(); } else selesai(); };
  d.querySelector('.nx').onclick = () => { if (i < L.length - 1) { i++; draw(); } else selesai(); };
  draw(); setTimeout(() => d.querySelector('.nx').focus(), 50);
}
window.FHPanduanAwal = { buka: () => buka(true), mungkin: () => buka(false), sudah: () => !!baca(PK, 0) };
})();
