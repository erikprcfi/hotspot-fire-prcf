/* Kompas lapangan – Fire Hotspot PRCF
 * Arah: sensor kompas HP (Android: deviceorientationabsolute; iPhone: webkitCompassHeading), dikoreksi rotasi layar, dihaluskan.
 * Posisi & ketinggian: GPS HP (akurasi tinggi). Wilayah: FHWilayah (BPS/BIG + Kepmendagri 2025).
 * Terbit/terbenam: posisi matahari algoritma NOAA (FHLintas.sunElev), elevasi −0,833°.
 * Arah & jarak ke target (titik panas): rumus great-circle (bearing awal) dari posisi GPS.
 * Pemakaian: const k = FHKompas.mount(elemen, { target:{lat,lon,label}, hotspots:[{la,lo,when}] }); k.destroy()
 */
(function () {
'use strict';
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const CARD = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'], CARDL = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
const cardOf = d => Math.round(((d % 360) + 360) % 360 / 45) % 8;
const N1 = v => Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function bearing(a, b, c, d) { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); return (deg(Math.atan2(y, x)) + 360) % 360; }
function dist(a, b, c, d) { const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); }
function sunTimes(lat, lon) {   // terbit & terbenam hari ini (waktu perangkat), cari perpotongan elevasi −0,833° per menit
  if (!window.FHLintas) return null; const d0 = new Date(); d0.setHours(0, 0, 0, 0); let up = null, dn = null, prev = FHLintas.sunElev(d0, lat, lon);
  for (let m = 1; m <= 1440; m++) { const t = new Date(d0.getTime() + m * 6e4), e = FHLintas.sunElev(t, lat, lon); if (prev < -.833 && e >= -.833 && !up) up = t; if (prev >= -.833 && e < -.833 && up && !dn) dn = t; prev = e; }
  return { up, dn };
}
const hm = t => t ? t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '–';
if (!document.getElementById('fhk-css')) {
  const st = document.createElement('style'); st.id = 'fhk-css';
  st.textContent = `.fhk{display:grid;gap:12px;color:var(--fg,#111)}.fhk-top{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;gap:6px}
  .fhk-top div{background:var(--surface,#fff);border-radius:16px;padding:10px 4px;box-shadow:var(--shadow,0 6px 18px -12px rgba(0,0,0,.35))}.fhk-top b{display:block;font:700 16px var(--f-data,ui-monospace,monospace)}.fhk-top span{font-size:11px;color:var(--muted,#667)}
  .fhk-dialw{position:relative;background:radial-gradient(circle at 50% 45%,#22303C,#141C24);border-radius:28px;padding:16px 10px 18px;color:#fff;overflow:hidden}
  .fhk-hd{text-align:center}.fhk-hd b{font:300 64px/1 var(--f,system-ui);letter-spacing:-.03em}.fhk-hd sup{font-size:16px;font-weight:700;margin-left:4px;vertical-align:top}.fhk-hd small{display:block;font-size:14px;font-weight:700;color:#FF6B5E;letter-spacing:.06em;margin-top:2px}
  .fhk-dial{position:relative;width:min(84vw,330px);aspect-ratio:1;margin:8px auto 0}.fhk-dial svg{position:absolute;inset:0;width:100%;height:100%}.fhk-rose{transition:transform .12s linear}
  .fhk-lub{position:absolute;left:50%;top:-2px;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:16px solid #FF4D3D;transform:translateX(-50%);z-index:2}
  .fhk-tg{position:absolute;inset:0;transition:transform .12s linear}.fhk-tg i{position:absolute;left:50%;top:12%;transform:translateX(-50%);width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:34px solid #FFB020;filter:drop-shadow(0 0 8px rgba(255,176,32,.7))}
  .fhk-card{background:var(--surface,#fff);border-radius:18px;padding:12px 14px;box-shadow:var(--shadow,0 6px 18px -12px rgba(0,0,0,.35))}.fhk-card h4{margin:0 0 6px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#667)}
  .fhk-big{font:700 22px var(--f-data,ui-monospace,monospace)}.fhk-note{font-size:11.5px;color:var(--muted,#667);line-height:1.45;margin:6px 0 0}
  .fhk-btn{width:100%;height:46px;border-radius:14px;border:0;background:#D93025;color:#fff;font:700 14px var(--f,system-ui);cursor:pointer}
  .fhk-coord{display:flex;align-items:center;justify-content:center;gap:8px;margin:12px auto 0;width:max-content;max-width:100%;background:#D93025;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 13.5px var(--f-data,ui-monospace,monospace);cursor:pointer}
  .fhk-addr{text-align:center;font-size:12.5px;opacity:.85;margin-top:8px;line-height:1.4}`;
  document.head.appendChild(st);
}
function rose() {
  let s = '<svg viewBox="0 0 200 200"><g class="fhk-rose">';
  for (let a = 0; a < 360; a += 3) { const big = a % 15 === 0, r1 = big ? 78 : 82; s += `<line x1="100" y1="${100 - r1}" x2="100" y2="${100 - 88}" stroke="${a === 0 ? '#FF4D3D' : '#C9D3DC'}" stroke-width="${big ? 1.4 : .7}" transform="rotate(${a} 100 100)"/>`; }
  for (let a = 0; a < 360; a += 15) if (a % 90) s += `<text x="100" y="${100 - 92}" text-anchor="middle" font-size="7.5" fill="#DCE3EA" font-family="system-ui" transform="rotate(${a} 100 100)">${a}</text>`;
  [['U', 0, '#FF4D3D'], ['T', 90, '#fff'], ['S', 180, '#fff'], ['B', 270, '#fff']].forEach(([t, a, c]) => { s += `<text x="100" y="${100 - 62}" text-anchor="middle" font-size="17" font-weight="800" fill="${c}" font-family="system-ui" transform="rotate(${a} 100 100)">${t}</text>`; });
  s += '<circle cx="100" cy="100" r="34" fill="none" stroke="#C9D3DC" stroke-width=".8"/><line x1="62" y1="100" x2="70" y2="100" stroke="#C9D3DC"/><line x1="130" y1="100" x2="138" y2="100" stroke="#C9D3DC"/>';
  s += '</g><g><path d="M100 46 L108 100 L100 106 L92 100Z" fill="#E5484D"/><path d="M100 154 L108 100 L100 94 L92 100Z" fill="#E8EDF2"/><circle cx="100" cy="100" r="6" fill="#fff" stroke="#22303C" stroke-width="2"/></g></svg>';
  return s;
}
function mount(el, opt = {}) {
  let H = null, sm = null, pos = null, wid = null, absOK = false, dead = false, tgt = opt.target || null;
  el.innerHTML = `<div class="fhk">
    <div class="fhk-top"><div><span>Terbit</span><b class="k-up">–</b></div><div><span>Ketinggian</span><b class="k-alt">–</b></div><div><span>Terbenam</span><b class="k-dn">–</b></div></div>
    <div class="fhk-dialw"><div class="fhk-hd"><b class="k-deg">–</b><sup>°</sup><small class="k-card">Menunggu sensor</small></div>
      <div class="fhk-dial"><div class="fhk-lub"></div>${rose()}<div class="fhk-tg" hidden><i></i></div></div>
      <button class="fhk-coord" type="button"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg><span class="k-ll">Mencari GPS…</span></button>
      <div class="fhk-addr k-addr"></div></div>
    <button class="fhk-btn k-perm" hidden>Aktifkan kompas</button>
    <div class="fhk-card k-tgc" hidden><h4 class="k-tgh">Arah ke titik panas</h4><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="fhk-big k-tgd">–</span><span class="k-tgb" style="font-weight:700"></span></div><p class="fhk-note k-tgl"></p></div>
    <div class="fhk-card"><h4>Catatan ketelitian</h4><p class="fhk-note" style="margin:0">Arah dari sensor magnet HP (utara magnetik; di Indonesia selisih dengan utara sebenarnya kecil, umumnya &lt; 3°). Jauhkan HP dari logam, motor & magnet. Bila arah meleset, gerakkan HP membentuk angka 8 beberapa kali untuk kalibrasi. Ketinggian dari GPS (umumnya ±10–30 m). Terbit/terbenam dihitung dari posisi matahari (NOAA). Panah oranye = arah ke target, dihitung dari koordinat GPS Anda.</p></div></div>`;
  const $ = s => el.querySelector(s);
  const rosEl = $('.fhk-rose'), tgEl = $('.fhk-tg');
  function setHeading(h) {
    if (h == null || isNaN(h)) return; const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0; h = (h + so + 360) % 360;
    if (sm == null) sm = { s: Math.sin(rad(h)), c: Math.cos(rad(h)) }; else { sm.s += .25 * (Math.sin(rad(h)) - sm.s); sm.c += .25 * (Math.cos(rad(h)) - sm.c); }
    H = (deg(Math.atan2(sm.s, sm.c)) + 360) % 360;
  }
  let raf = null, lastH = null;
  function draw() { if (dead) return; raf = requestAnimationFrame(draw); if (H == null || H === lastH) return; lastH = H;
    rosEl.style.transform = `rotate(${-H}deg)`; rosEl.style.transformOrigin = '100px 100px';
    $('.k-deg').textContent = N1(H).replace(',0', ''); $('.k-card').textContent = CARDL[cardOf(H)].toUpperCase();
    if (tgt && pos) { const b = bearing(pos.lat, pos.lon, tgt.lat, tgt.lon); tgEl.hidden = false; tgEl.style.transform = `rotate(${b - H}deg)`; } }
  draw();
  const onAbs = e => { if (e.alpha == null) return; absOK = true; setHeading(360 - e.alpha); };
  const onRel = e => { if (e.webkitCompassHeading != null) { setHeading(e.webkitCompassHeading); if (e.webkitCompassAccuracy > 0) $('.k-card').title = '±' + Math.round(e.webkitCompassAccuracy) + '°'; } else if (!absOK && e.absolute && e.alpha != null) setHeading(360 - e.alpha); };
  function startSensor() {
    window.addEventListener('deviceorientationabsolute', onAbs, true); window.addEventListener('deviceorientation', onRel, true);
    setTimeout(() => { if (H == null && !dead) $('.k-card').textContent = 'Sensor kompas tidak terdeteksi di perangkat ini'; }, 4000);
  }
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {   // iPhone/iPad: izin lewat ketukan
    const b = $('.k-perm'); b.hidden = false; b.onclick = async () => { try { const r = await DeviceOrientationEvent.requestPermission(); if (r === 'granted') { b.hidden = true; startSensor(); } else b.textContent = 'Izin sensor ditolak – aktifkan di Pengaturan Safari'; } catch (e) { b.textContent = 'Sensor tidak tersedia'; } };
  } else startSensor();
  function upTarget() {
    const c = $('.k-tgc');
    if (!tgt && opt.hotspots && opt.hotspots.length && pos) {   // tanpa target: titik panas terdekat 7 hari
      const wk = opt.hotspots.filter(p => Date.now() - p.when <= 7 * 864e5 + 36e5).map(p => ({ p, d: dist(pos.lat, pos.lon, p.la, p.lo) })).sort((a, b) => a.d - b.d)[0];
      if (wk && wk.d <= 300) { tgt = { lat: wk.p.la, lon: wk.p.lo, label: 'Titik panas terdekat (7 hari)' }; }
    }
    if (!tgt || !pos) return; c.hidden = false; const d = dist(pos.lat, pos.lon, tgt.lat, tgt.lon), b = bearing(pos.lat, pos.lon, tgt.lat, tgt.lon);
    $('.k-tgh').textContent = tgt.label || 'Arah ke target'; $('.k-tgd').textContent = d < 1 ? Math.round(d * 1000) + ' m' : N1(d) + ' km';
    $('.k-tgb').textContent = `${Math.round(b)}° · ${CARDL[cardOf(b)]}`; $('.k-tgl').textContent = `Target ${tgt.lat.toFixed(5)}, ${tgt.lon.toFixed(5)} · ikuti panah oranye. Jarak garis lurus, bukan jarak jalan.`;
  }
  let gotAddr = false;
  if (navigator.geolocation) wid = navigator.geolocation.watchPosition(p => {
    const c = p.coords; pos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy };
    $('.k-ll').textContent = `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)} ±${c.accuracy < 1000 ? Math.round(c.accuracy) + ' m' : N1(c.accuracy / 1000) + ' km'}`;
    $('.k-alt').textContent = c.altitude != null ? `${Math.round(c.altitude)} m` : 'n/a'; if (c.altitude != null && c.altitudeAccuracy) $('.k-alt').title = '±' + Math.round(c.altitudeAccuracy) + ' m';
    const st = sunTimes(c.latitude, c.longitude); if (st) { $('.k-up').textContent = hm(st.up); $('.k-dn').textContent = hm(st.dn); }
    if (!gotAddr && window.FHWilayah) { gotAddr = true; FHWilayah.lookup(c.latitude, c.longitude).then(w => { $('.k-addr').textContent = w ? FHWilayah.label(w) : ''; }).catch(() => { }); }
    upTarget();
  }, e => { $('.k-ll').textContent = e.code === 1 ? 'Izin lokasi ditolak' : 'GPS belum tersedia'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  $('.fhk-coord').onclick = async () => { if (!pos) return; const t = `${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}`; try { if (navigator.share) await navigator.share({ title: 'Lokasi saya', text: `${t}\nhttps://www.google.com/maps?q=${pos.lat},${pos.lon}` }); else { await navigator.clipboard.writeText(t); $('.k-ll').textContent = 'Tersalin ✓ ' + t; } } catch (e) { } };
  return { destroy() { dead = true; cancelAnimationFrame(raf); window.removeEventListener('deviceorientationabsolute', onAbs, true); window.removeEventListener('deviceorientation', onRel, true); if (wid != null) navigator.geolocation.clearWatch(wid); }, setTarget(t) { tgt = t; upTarget(); } };
}
window.FHKompas = { mount, bearing, dist };
})();
