/* Fire Hotspot – titik panas NASA FIRMS terdekat dari lokasi mana pun di Indonesia (7 hari terakhir).
 * Data: data/titik_id/*.json, dipecah per petak 1°×1° oleh pipeline dari berkas resmi NASA FIRMS near real-time Asia Tenggara
 * (diperbarui otomatis tiap 3 jam). HP hanya memuat petak di sekitar pengguna.
 * FHTitikID.terdekat(lat, lon, {hari:7}) → { jarak_km, n5, n25, titik:{la,lo,when,sensor,frp}, diperbarui_utc } | null
 */
(function () {
'use strict';
const BASE = (document.currentScript && document.currentScript.src ? new URL('../', document.currentScript.src).href : './');
let IDX = null; const T = {};
const idx = () => IDX || (IDX = fetch(BASE + 'data/titik_id/indeks.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('indeks'); return r.json(); }).catch(e => { IDX = null; throw e; }));
const petak = k => T[k] || (T[k] = fetch(BASE + 'data/titik_id/' + k + '.json').then(r => r.ok ? r.json() : []).catch(() => []));
const rad = x => x * Math.PI / 180;
const jarak = (a, b, c, d) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
async function terdekat(lat, lon, o = {}) {
  const I = await idx(), now = Date.now(), batas = (o.hari || 7) * 864e5 + 36e5, la0 = Math.floor(lat), lo0 = Math.floor(lon);
  let best = null; const semua = [];
  for (let r = 0; r <= 8; r++) {
    const ks = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dy), Math.abs(dx)) === r && I.ubin[`${la0 + dy}_${lo0 + dx}`]) ks.push(`${la0 + dy}_${lo0 + dx}`);
    for (const L of await Promise.all(ks.map(petak))) for (const b of L) {
      const when = b[2] * 6e4; if (now - when > batas) continue;
      const x = { la: b[0], lo: b[1], when, sensor: (I.sensor || [])[b[3]] || '', frp: b[4], d: jarak(lat, lon, b[0], b[1]) };
      semua.push(x); if (!best || x.d < best.d) best = x;
    }
    if (r >= 1 && best && best.d <= r * 105) break;   // titik di luar cincin ini pasti lebih jauh
  }
  return { jarak_km: best ? best.d : null, n5: semua.filter(x => x.d <= 5).length, n25: semua.filter(x => x.d <= 25).length, titik: best, diperbarui_utc: I.diperbarui_utc };
}
window.FHTitikID = { terdekat };
})();
