/* Lintasan satelit pendeteksi titik panas berikutnya di suatu titik – Fire Hotspot PRCF
 * Orbit: TLE CelesTrak (data/tle.json, diperbarui otomatis tiap 3 jam oleh GitHub Actions), propagasi SGP4 (satellite.js, MIT).
 * Satelit dianggap "melintas" bila titik berada di dalam lebar sapuan sensor (MODIS 2.330 km, VIIRS 3.060 km);
 * waktu = saat jarak titik ke jejak tanah satelit paling kecil. Siang/malam dari ketinggian matahari (algoritma NOAA).
 * Pemakaian: const P = await FHLintas.next(lat, lon) → [{nama, sensor, t:Date, km, tepi, siang}]
 */
(function () {
'use strict';
const BASE = (document.currentScript && document.currentScript.src ? new URL('../', document.currentScript.src).href : './');
let TLE = null, SATLIB = null;
function lib() {
  if (window.satellite) return Promise.resolve(window.satellite);
  if (!SATLIB) SATLIB = new Promise((ok, no) => { const s = document.createElement('script'); s.src = BASE + 'assets/vendor/satellite.min.js'; s.onload = () => ok(window.satellite); s.onerror = no; document.head.appendChild(s); });
  return SATLIB;
}
async function tle() {
  if (TLE) return TLE;
  TLE = fetch(BASE + 'data/tle.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('TLE HTTP ' + r.status); return r.json(); });
  TLE.catch(() => { TLE = null; }); return TLE;
}
const R = 6371, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function dist(a, b, c, d) { const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
function sunElev(t, lat, lon) { // NOAA solar position (akurasi ±0,5°)
  const jd = t.getTime() / 864e5 + 2440587.5, n = (jd - 2451545) / 36525;
  const L0 = (280.46646 + n * (36000.76983 + n * .0003032)) % 360, M = 357.52911 + n * (35999.05029 - .0001537 * n), e = .016708634 - n * (.000042037 + .0000001267 * n);
  const C = Math.sin(rad(M)) * (1.914602 - n * (.004817 + .000014 * n)) + Math.sin(rad(2 * M)) * (.019993 - .000101 * n) + Math.sin(rad(3 * M)) * .000289;
  const lam = L0 + C - .00569 - .00478 * Math.sin(rad(125.04 - 1934.136 * n)), eps0 = 23 + (26 + (21.448 - n * (46.815 + n * (.00059 - n * .001813))) / 60) / 60, eps = eps0 + .00256 * Math.cos(rad(125.04 - 1934.136 * n));
  const dec = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam)))), y = Math.tan(rad(eps / 2)) ** 2;
  const eq = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - .5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const mins = t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60, tst = (mins + eq + 4 * lon) % 1440, ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  return 90 - deg(Math.acos(Math.sin(rad(lat)) * Math.sin(rad(dec)) + Math.cos(rad(lat)) * Math.cos(rad(dec)) * Math.cos(rad(ha))));
}
async function passes(lat, lon, from = new Date(), hours = 36, back = 0) {
  const [S, T] = await Promise.all([lib(), tle()]); const out = [];
  const t0 = from.getTime() - back * 36e5, t1 = from.getTime() + hours * 36e5;
  for (const s of T.satelit) {
    const rec = S.twoline2satrec(s.l1, s.l2), half = s.sapuan_km / 2;
    const sub = t => { const d = new Date(t), pv = S.propagate(rec, d); if (!pv || !pv.position) return null; const g = S.eciToGeodetic(pv.position, S.gstime(d)); return dist(lat, lon, deg(g.latitude), deg(g.longitude)); };
    let prev2 = null, prev = null;
    for (let t = t0; t <= t1; t += 60e3) {
      const d = sub(t); if (d == null) continue;
      if (prev && prev2 && prev.d <= prev2.d && prev.d <= d && prev.d <= half + 60) { // minimum lokal → perhalus per 5 detik
        let bt = prev.t, bd = prev.d; for (let u = prev.t - 60e3; u <= prev.t + 60e3; u += 5e3) { const x = sub(u); if (x != null && x < bd) { bd = x; bt = u; } }
        if (bd <= half) out.push({ nama: s.nama, sensor: s.sensor, t: new Date(bt), km: Math.round(bd), tepi: bd > half * .8, siang: sunElev(new Date(bt), lat, lon) > 0 });
      }
      prev2 = prev; prev = { t, d };
    }
  }
  return { list: out.sort((a, b) => a.t - b.t), tle: T.diperbarui_utc, sumber: T.sumber };
}
async function next(lat, lon, n = 6) { const P = await passes(lat, lon, new Date(), 36); P.list = P.list.filter(p => p.t > Date.now()).slice(0, n); return P; }
window.FHLintas = { next, passes, sunElev };
})();
