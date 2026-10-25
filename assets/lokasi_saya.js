/* "Lokasi saya" – cuaca saat ini, per jam, 14 hari, kualitas udara & bahaya kebakaran di titik pengguna
 * Fire Hotspot PRCF. Semua data dari sumber resmi, diambil langsung oleh HP pengguna:
 *   ECMWF IFS 0,25° (via Open-Meteo, CC BY 4.0) – cuaca saat ini (analisis model), per jam, harian 14 hari
 *   Copernicus CAMS (via Open-Meteo Air Quality) – PM2.5, CO, AOD; kategori PM2.5 BMKG, penjelasan ISPU (Permen LHK 14/2020)
 *   Fire Weather Index (Van Wagner 1987), kelas FDRS Indonesia (de Groot dkk. 2006)
 *   Lokasi: GPS HP (akurasi tinggi, tanpa cache); wilayah desa/kelurahan–kecamatan–kab/kota–provinsi dari batas COD-AB (BPS/BIG)
 *   dan nama Kepmendagri 2025 (assets/wilayah.js), cadangan di luar Indonesia: OpenStreetMap Nominatim; pencarian kota: Open-Meteo Geocoding
 * Pemakaian: FHLokasi.render(elemen, { onMap: (lat, lon) => {...}, hotspots: [...] })
 */
(function () {
'use strict';
const HR = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const N1 = v => Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), N0 = v => Math.round(v).toLocaleString('id-ID');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WMO = { 0: 'Cerah', 1: 'Cerah berawan', 2: 'Berawan sebagian', 3: 'Berawan', 45: 'Berkabut', 48: 'Berkabut', 51: 'Gerimis ringan', 53: 'Gerimis', 55: 'Gerimis lebat', 61: 'Hujan ringan', 63: 'Hujan sedang', 65: 'Hujan lebat', 80: 'Hujan lokal ringan', 81: 'Hujan lokal sedang', 82: 'Hujan lokal lebat', 95: 'Hujan petir', 96: 'Hujan petir', 99: 'Hujan petir' };
const ARAH = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
const LVN = ['Rendah', 'Sedang', 'Tinggi', 'Ekstrem'], LVC = ['#2F7FD1', '#2E9E5B', '#E0A800', '#D93025'];
const FFM = ['Peluang api mulai menyala rendah.', 'Peluang api mulai menyala sedang di tempat yang mengering.', 'Rumput kering mulai mudah tersulut.', 'Rumput kering sangat mudah terbakar; peluang api menyala sangat tinggi.'];
const DCM = ['Kondisi musim hujan; kabut asap parah kecil kemungkinannya.', 'Kondisi kemarau normal; pembakaran perlu diatur dan dipantau.', 'Puncak kemarau; pembakaran di lahan gambut perlu dibatasi.', 'Kekeringan mendekati bencana; kabut asap parah sangat mungkin, larangan pembakaran total perlu diberlakukan.'];
const KAT = ['Baik', 'Sedang', 'Tidak Sehat', 'Sangat Tidak Sehat', 'Berbahaya'], KC = ['#2E9E5B', '#2F7FD1', '#E0A800', '#D93025', '#3A1F4A'];
const ispu = v => v <= 15.5 ? 0 : v <= 55.4 ? 1 : v <= 150.4 ? 2 : v <= 250.4 ? 3 : 4;
const store = { get(k, d) { try { const v = localStorage.getItem('fh_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('fh_' + k, JSON.stringify(v)); } catch (e) { } } };

/* ---------- FWI (Van Wagner 1987) ---------- */
function ffmcF(f0, t, h, w, r) { let mo = 147.2 * (101 - f0) / (59.5 + f0); if (r > .5) { const rf = r - .5; mo = mo + 42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf)) + (mo > 150 ? .0015 * (mo - 150) ** 2 * Math.sqrt(rf) : 0); mo = Math.min(mo, 250); }
  const ed = .942 * h ** .679 + 11 * Math.exp((h - 100) / 10) + .18 * (21.1 - t) * (1 - Math.exp(-.115 * h)); let m;
  if (mo > ed) { const ko = .424 * (1 - (h / 100) ** 1.7) + .0694 * Math.sqrt(w) * (1 - (h / 100) ** 8); m = ed + (mo - ed) * 10 ** (-ko * .581 * Math.exp(.0365 * t)); }
  else { const ew = .618 * h ** .753 + 10 * Math.exp((h - 100) / 10) + .18 * (21.1 - t) * (1 - Math.exp(-.115 * h)); if (mo < ew) { const k1 = .424 * (1 - ((100 - h) / 100) ** 1.7) + .0694 * Math.sqrt(w) * (1 - ((100 - h) / 100) ** 8); m = ew - (ew - mo) * 10 ** (-k1 * .581 * Math.exp(.0365 * t)); } else m = mo; }
  return Math.max(0, Math.min(101, 59.5 * (250 - m) / (147.2 + m))); }
function dmcF(p0, t, h, r) { t = Math.max(t, -1.1); const rk = 1.894 * (t + 1.1) * (100 - h) * 9 * 1e-4; let pr = p0;
  if (r > 1.5) { const rw = .92 * r - 1.27, wmi = 20 + 280 / Math.exp(.023 * p0), b = p0 <= 33 ? 100 / (.5 + .3 * p0) : p0 <= 65 ? 14 - 1.3 * Math.log(p0) : 6.2 * Math.log(p0) - 17.2, wmr = wmi + 1000 * rw / (48.77 + b * rw); pr = Math.max(0, 43.43 * (5.6348 - Math.log(wmr - 20))); }
  return Math.max(0, pr + rk); }
function dcF(d0, t, r) { t = Math.max(t, -2.8); const pe = Math.max(0, (.36 * (t + 2.8) + 1.39) / 2); let dr = d0; if (r > 2.8) { const rw = .83 * r - 1.27, smi = 800 * Math.exp(-d0 / 400); dr = Math.max(0, d0 - 400 * Math.log(1 + 3.937 * rw / smi)); } return Math.max(0, dr + pe); }
function isiF(f, w) { const fm = 147.2 * (101 - f) / (59.5 + f); return 19.115 * Math.exp(-.1386 * fm) * (1 + fm ** 5.31 / 4.93e7) * Math.exp(.05039 * w); }
const kF = v => v < 73 ? 0 : v < 78 ? 1 : v < 83 ? 2 : 3, kD = v => v < 140 ? 0 : v < 260 ? 1 : v <= 350 ? 2 : 3;

/* ---------- ikon cuaca animasi ---------- */
function icon(code, day = 1, size = 64) {
  const c = +code, sun = `<g class="lx-sun"><circle cx="24" cy="22" r="9" fill="#FFC83D"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="24" y1="6" x2="24" y2="2" stroke="#FFC83D" stroke-width="2.6" stroke-linecap="round" transform="rotate(${a} 24 22)"/>`).join('')}</g>`;
  const moon = `<path d="M30 10a12 12 0 1 0 10 18 10 10 0 0 1-10-18z" fill="#E8EDF7"/>`;
  const cloud = (x = 0, o = 1) => `<g class="lx-cloud" style="opacity:${o}" transform="translate(${x} 0)"><path d="M18 44h26a9 9 0 0 0 .8-18 13 13 0 0 0-25 3.2A7.5 7.5 0 0 0 18 44z" fill="#EEF3F8"/></g>`;
  const rain = n => `<g class="lx-rain">${[...Array(n)].map((_, i) => `<line x1="${22 + i * 8}" y1="48" x2="${19 + i * 8}" y2="56" stroke="#5AB0FF" stroke-width="2.6" stroke-linecap="round" style="animation-delay:${i * .18}s"/>`).join('')}</g>`;
  let g;
  if (c === 0) g = day ? sun : moon; else if (c <= 2) g = (day ? sun : moon) + cloud(6, .95); else if (c <= 48) g = cloud(0) + cloud(-10, .7);
  else if (c >= 95) g = cloud(0) + `<path class="lx-bolt" d="M32 44l-6 9h6l-4 9 11-13h-6l4-5z" fill="#FFD43B"/>`; else g = cloud(0) + rain(c >= 63 && c !== 80 ? 3 : 2);
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" class="lx-ic">${g}</svg>`;
}
if (!document.getElementById('lx-css')) {
  const st = document.createElement('style'); st.id = 'lx-css';
  st.textContent = `.lx{display:grid;gap:14px;min-width:0;grid-template-columns:minmax(0,1fr)}.lx>*{min-width:0}
  .lx-hero{position:relative;overflow:hidden;border-radius:26px;padding:18px 18px 16px;color:#fff;box-shadow:0 18px 40px -18px rgba(10,40,80,.55)}
  .lx-hero::before{content:"";position:absolute;inset:-40%;background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.22),transparent 45%);animation:lxglow 9s ease-in-out infinite alternate}
  @keyframes lxglow{to{transform:translate(12%,8%)}}
  .lx-hero>*{position:relative}.lx-place{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;opacity:.95}.lx-place small{font-weight:500;opacity:.8}
  .lx-main{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
  .lx-temp{font:200 76px/1 var(--f,sans-serif);letter-spacing:-.04em}.lx-temp sup{font-size:30px;font-weight:300;vertical-align:top;margin-left:2px}
  .lx-desc{font-size:16px;font-weight:700}.lx-sub{font-size:12.5px;opacity:.88}
  .lx-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:14px}.lx-stats div{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:8px 6px;text-align:center;backdrop-filter:blur(6px)}
  .lx-stats b{display:block;font:600 15px var(--f-data,monospace)}.lx-stats span{font-size:10.5px;opacity:.85}
  .lx-ic .lx-sun{transform-origin:24px 22px;animation:lxspin 22s linear infinite}@keyframes lxspin{to{transform:rotate(360deg)}}
  .lx-ic .lx-cloud{animation:lxdrift 6s ease-in-out infinite alternate}@keyframes lxdrift{to{transform:translateX(4px)}}
  .lx-ic .lx-rain line{animation:lxrain 1s linear infinite}@keyframes lxrain{0%{opacity:0;transform:translateY(-4px)}40%{opacity:1}100%{opacity:0;transform:translateY(6px)}}
  .lx-ic .lx-bolt{animation:lxbolt 2.4s steps(1) infinite}@keyframes lxbolt{0%,70%,100%{opacity:1}72%,78%{opacity:.15}}
  .lx-card{min-width:0;overflow:hidden;background:var(--surface,#fff);border-radius:20px;padding:14px;box-shadow:var(--shadow,0 6px 20px -12px rgba(0,0,0,.3))}
  .lx-card h4{margin:0 0 10px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#666)}
  .lx-hours{display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;scroll-snap-type:x proximity}.lx-h{flex:none;width:54px;text-align:center;scroll-snap-align:start;font-size:11px;color:var(--muted,#666)}
  .lx-h b{display:block;color:var(--fg,#111);font:600 13px var(--f-data,monospace)}.lx-h .r{color:#2F7FD1;font-weight:700;font-size:10.5px;min-height:13px}
  .lx-hline{width:100%;height:60px;display:block}
  .lx-day{display:grid;grid-template-columns:58px 32px minmax(0,1fr) 84px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--line,#eee);font-size:13px}
  .lx-day:first-of-type{border-top:0}.lx-day .d b{display:block}.lx-day .d small{color:var(--muted,#666);font-size:11px}
  .lx-day .rr{color:#2F7FD1;font-size:11px;font-weight:700}.lx-day.far{opacity:.72}
  .lx-range{position:relative;height:6px;border-radius:3px;background:var(--line,#e5e9e6)}.lx-range i{position:absolute;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#57B5FF,#FFC83D,#FF7A45);animation:lxgrow .9s cubic-bezier(.2,.8,.2,1) both}
  @keyframes lxgrow{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
  .lx-t{display:flex;justify-content:space-between;font:600 12px var(--f-data,monospace)}
  .lx-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.lx-gauge>div{min-width:0}.lx-pill{display:inline-block;color:#fff;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
  .lx-big{font:700 30px var(--f-data,monospace);line-height:1.1;margin:6px 0 2px}.lx-note{font-size:11.5px;color:var(--muted,#666);line-height:1.45;margin:6px 0 0}
  .lx-actions{display:flex;gap:8px;flex-wrap:wrap}.lx-btn{flex:1;min-width:130px;height:44px;border-radius:14px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f6f8f6);color:inherit;font:700 13px var(--f,sans-serif);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
  .lx-btn.pri{background:#14563F;border-color:#14563F;color:#fff}
  .lx-search{display:flex;gap:8px}.lx-search input{flex:1;height:44px;border-radius:14px;border:1px solid var(--line,#ddd);background:var(--surface-2,#f6f8f6);color:inherit;padding:0 12px;font:500 14px var(--f,sans-serif)}
  .lx-res button{display:block;width:100%;text-align:left;padding:10px 4px;border:0;border-top:1px solid var(--line,#eee);background:none;color:inherit;font:inherit;cursor:pointer}
  .lx-skel{height:220px;border-radius:26px;background:linear-gradient(100deg,var(--surface-2,#eee) 30%,var(--line,#ddd) 50%,var(--surface-2,#eee) 70%);background-size:300% 100%;animation:lxsk 1.4s ease infinite}@keyframes lxsk{to{background-position:-150% 0}}
  .lx-warn{margin-top:8px;font-size:12px;line-height:1.4;background:rgba(255,200,61,.22);border:1px solid rgba(255,200,61,.5);border-radius:12px;padding:8px 10px}
  .lx-gauge{display:flex;align-items:center;gap:12px}
  .lx-radar{position:relative;width:86px;height:86px;margin:4px auto 6px}.lx-radar i{position:absolute;inset:0;border-radius:50%;border:2px solid #2F7FD1;animation:lxpulse 2s ease-out infinite;opacity:0}.lx-radar i+i{animation-delay:1s}.lx-radar b{position:absolute;left:35px;top:35px;width:16px;height:16px;border-radius:50%;background:#2F7FD1;box-shadow:0 0 0 4px rgba(47,127,209,.25)}@keyframes lxpulse{0%{transform:scale(.25);opacity:.9}100%{transform:scale(1);opacity:0}}.lx-gauge svg{flex:none}`;
  document.head.appendChild(st);
}

/* ---------- data ---------- */
async function J(u, tries = 3, ms = 20000) { let e; for (let k = 0; k < tries; k++) { const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms); try { const r = await fetch(u, { signal: ac.signal }); clearTimeout(to); if (r.ok) return await r.json(); e = new Error('HTTP ' + r.status); } catch (x) { clearTimeout(to); e = x.name === 'AbortError' ? new Error('waktu habis') : x; } await new Promise(o => setTimeout(o, 800 * (k + 1))); } throw e; }
function noon(H, extra) { // {tgl:[t,rh,w,r24]} dari data per jam (zona lokal)
  const ts = H.time, out = {};
  for (let i = 0; i < ts.length; i++) { if (!ts[i].endsWith('T12:00') || i < 23) continue; const r = H.precipitation.slice(i - 23, i + 1); if ([H.temperature_2m[i], H.relative_humidity_2m[i], H.wind_speed_10m[i], ...r].some(v => v == null)) continue;
    out[ts[i].slice(0, 10)] = [H.temperature_2m[i], Math.min(100, Math.max(1, H.relative_humidity_2m[i])), H.wind_speed_10m[i], r.reduce((a, b) => a + b, 0)]; }
  return out;
}
function merge(Hp, He, today) { // analisis (sebelum hari ini) + ECMWF (mulai hari ini)
  const T = [], V = { temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], precipitation: [] };
  const push = (H, i) => { T.push(H.time[i]); for (const k in V) V[k].push(H[k][i]); };
  Hp.time.forEach((t, i) => { if (t < today) push(Hp, i); }); He.time.forEach((t, i) => { if (t >= today) push(He, i); });
  return { time: T, ...V };
}
async function load(lat, lon) {
  const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=auto`;
  const hv = 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation';
  const [E, P, A, W] = await Promise.all([
    J(`https://api.open-meteo.com/v1/forecast?${q}&models=ecmwf_ifs025&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day&hourly=${hv},weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset&forecast_days=15`),
    J(`https://api.open-meteo.com/v1/forecast?${q}&hourly=${hv}&past_days=92&forecast_days=1`, 2, 25000).catch(() => null),
    J(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=pm2_5,carbon_monoxide,aerosol_optical_depth&past_days=1&forecast_days=5&domains=cams_global`).catch(() => null),
    (window.FHWilayah ? FHWilayah.lookup(lat, lon).catch(() => null) : Promise.resolve(null))]);
  let R = null; if (!W) R = await J(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=id`, 1, 8000).catch(() => null);
  return { E, P, A, W, R, lat, lon };
}

/* ---------- tampilan ---------- */
function placeName(R, fb, W) { if (W && window.FHWilayah) return FHWilayah.label(W); if (!R || !R.address) return fb || 'Lokasi Anda'; const a = R.address; const p = a.village || a.suburb || a.town || a.city_district || a.city || a.county || a.state; const q = a.city || a.county || a.regency || a.state; return p && q && p !== q ? `${p}, ${q}` : (p || q || fb || 'Lokasi Anda'); }
function heroBg(code, day) { const c = +code; if (!day) return 'linear-gradient(160deg,#0B1636,#1E2C5C 55%,#3B3F7A)'; if (c >= 95) return 'linear-gradient(160deg,#2B3442,#4A5568 60%,#6B7486)'; if (c >= 51) return 'linear-gradient(160deg,#2C5A85,#4A7FAF 60%,#7BA7CC)'; if (c >= 3) return 'linear-gradient(160deg,#3E6E9A,#6C9BC3 60%,#A7C6E0)'; return 'linear-gradient(160deg,#0E6BD8,#3AA0F5 55%,#7CCBFF)'; }
function hoursHTML(E) {
  const H = E.hourly, now = E.current.time.slice(0, 13); let i0 = H.time.findIndex(t => t.slice(0, 13) >= now); if (i0 < 0) i0 = 0;
  const idx = [...Array(36)].map((_, k) => i0 + k).filter(i => i < H.time.length && H.temperature_2m[i] != null);
  const T = idx.map(i => H.temperature_2m[i]), mn = Math.min(...T) - 1, mx = Math.max(...T) + 1, W = idx.length * 58, Hh = 60;
  const pts = idx.map((i, k) => `${k * 58 + 29},${Hh - 8 - (Hh - 22) * (H.temperature_2m[i] - mn) / (mx - mn)}`).join(' ');
  return `<div class="lx-hours"><div style="position:relative;width:${W}px;flex:none"><svg class="lx-hline" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}"><defs><linearGradient id="lxg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FF9F45" stop-opacity=".35"/><stop offset="1" stop-color="#FF9F45" stop-opacity="0"/></linearGradient></defs>
    <polygon points="29,${Hh} ${pts} ${(idx.length - 1) * 58 + 29},${Hh}" fill="url(#lxg)"/><polyline points="${pts}" fill="none" stroke="#FF8A3D" stroke-width="2.4" stroke-linejoin="round" style="stroke-dasharray:${W * 2};stroke-dashoffset:${W * 2};animation:lxdraw 1.6s ease-out forwards"/></svg>
    <style>@keyframes lxdraw{to{stroke-dashoffset:0}}</style>
    <div style="display:flex">${idx.map((i, k) => `<div class="lx-h">${k ? H.time[i].slice(11, 16) : 'Kini'}${icon(H.weather_code[i], H.is_day[i], 34)}<b>${Math.round(H.temperature_2m[i])}°</b><div class="r">${H.precipitation[i] >= .1 ? N1(H.precipitation[i]) : ''}</div></div>`).join('')}</div></div></div>`;
}
function daysHTML(E) {
  const D = E.daily, lo = Math.min(...D.temperature_2m_min.filter(v => v != null)), hi = Math.max(...D.temperature_2m_max.filter(v => v != null));
  return D.time.map((t, i) => { if (D.temperature_2m_max[i] == null) return ''; const d = new Date(t + 'T00:00:00Z'); const a = (D.temperature_2m_min[i] - lo) / (hi - lo) * 100, b = (D.temperature_2m_max[i] - lo) / (hi - lo) * 100;
    return `<div class="lx-day${i >= 7 ? ' far' : ''}"><div class="d"><b>${i ? HR[d.getUTCDay()].slice(0, 3) : 'Hari ini'}</b><small>${d.getUTCDate()} ${BLN[d.getUTCMonth()]}</small></div>${icon(D.weather_code[i], 1, 32)}
      <div><div class="lx-t"><span>${Math.round(D.temperature_2m_min[i])}°</span><span class="rr">${D.precipitation_sum[i] >= .1 ? N1(D.precipitation_sum[i]) + ' mm' : ''}</span><span>${Math.round(D.temperature_2m_max[i])}°</span></div><div class="lx-range"><i style="left:${a}%;right:${100 - b}%;animation-delay:${i * 50}ms"></i></div></div>
      <div style="font-size:11.5px;color:var(--muted,#666);text-align:right">${WMO[D.weather_code[i]] || ''}${i >= 7 ? '<br><span style="font-size:10px">kecenderungan</span>' : ''}</div></div>`; }).join('');
}
function fdrs(X) {
  if (!X.P) return null; const today = X.E.daily.time[0]; const H = merge(X.P.hourly, X.E.hourly, today); const nn = noon(H); const days = Object.keys(nn).sort();
  if (days.filter(d => d < today).length < 60) return null;
  let f = 85, p = 6, d = 15; const out = [];
  for (const k of days) { const [t, h, w, r] = nn[k]; f = ffmcF(f, t, h, w, r); p = dmcF(p, t, h, r); d = dcF(d, t, r); if (k >= today) out.push({ k, f, d, isi: isiF(f, w), lv: Math.max(kF(f), kD(d)), kf: kF(f), kd: kD(d) }); }
  return { out, n: days.filter(x => x < today).length };
}
function aqHTML(A) {
  if (!A || !A.hourly) return '<p class="lx-note">Kualitas udara belum dapat dimuat.</p>';
  const H = A.hourly, now = new Date(Date.now()).toISOString(); let i = H.time.length - 1; const loc = A.current_time;
  const tz = A.utc_offset_seconds || 0, nowL = new Date(Date.now() + tz * 1000).toISOString().slice(0, 13);
  i = Math.max(0, H.time.findIndex(t => t.slice(0, 13) >= nowL)); const last = H.pm2_5.slice(Math.max(0, i - 23), i + 1).filter(v => v != null);
  const m24 = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length), k = ispu(m24), pct = Math.min(1, m24 / 250);
  return `<div class="lx-gauge">${gauge(pct, KC[k], Math.round(m24))}<div><span class="lx-pill" style="background:${KC[k]}">${KAT[k]}</span>
    <div class="lx-note" style="color:inherit;font-size:12.5px;margin-top:6px">PM2.5 rata-rata 24 jam ${N1(m24)} µg/m³ · jam ini ${N1(H.pm2_5[i] ?? 0)} µg/m³ · CO ${N0(H.carbon_monoxide[i] ?? 0)} µg/m³ · AOD ${N1(H.aerosol_optical_depth[i] ?? 0)}</div></div></div>
    <p class="lx-note">${['Tingkat mutu udara yang sangat baik, tidak memberikan efek negatif terhadap manusia, hewan, dan tumbuhan.', 'Tingkat mutu udara masih dapat diterima pada kesehatan manusia, hewan, dan tumbuhan.', 'Tingkat mutu udara yang bersifat merugikan pada manusia, hewan, dan tumbuhan.', 'Tingkat mutu udara yang dapat meningkatkan risiko kesehatan pada sejumlah segmen populasi yang terpapar.', 'Tingkat mutu udara yang dapat merugikan kesehatan serius pada populasi dan perlu penanganan cepat.'][k]} (penjelasan ISPU, Permen LHK 14/2020)</p>`;
}
function gauge(pct, col, txt, unit = 'µg/m³') {
  const r = 32, c = 2 * Math.PI * r * .75;
  return `<svg width="84" height="84" viewBox="0 0 84 84"><g transform="rotate(135 42 42)"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line,#e5e9e6)" stroke-width="9" stroke-dasharray="${c} 999" stroke-linecap="round"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * pct} 999" style="animation:lxg2 1.3s cubic-bezier(.2,.8,.2,1) both"/></g>
    <text x="42" y="46" text-anchor="middle" style="font:700 ${String(txt).length > 4 ? 12 : 18}px var(--f-data,monospace);fill:var(--fg,#111)">${txt}</text><text x="42" y="60" text-anchor="middle" style="font:9px sans-serif;fill:var(--muted,#666)">${unit}</text>
    <style>@keyframes lxg2{from{stroke-dasharray:0 999}}</style></svg>`;
}
function fireHTML(F) {
  if (!F || !F.out.length) return '<p class="lx-note">Indeks bahaya kebakaran belum dapat dihitung (riwayat cuaca kurang).</p>';
  const T = F.out.slice(0, 7), mx = Math.max(...T.map(x => x.lv)), t0 = T[0];
  return `<div class="lx-gauge">${gauge((t0.lv + 1) / 4, LVC[t0.lv], LVN[t0.lv], 'FDRS')}<div><span class="lx-pill" style="background:${LVC[t0.lv]}">Hari ini: ${LVN[t0.lv]}</span>
    <div class="lx-note" style="color:inherit;font-size:12.5px;margin-top:6px">${FFM[t0.kf]} ${DCM[t0.kd]}</div></div></div>
    <div style="display:flex;gap:4px;margin-top:10px">${T.map(x => { const d = new Date(x.k + 'T00:00:00Z'); return `<div style="flex:1;text-align:center;font-size:10.5px;color:var(--muted,#666)"><div style="height:30px;border-radius:8px;background:${LVC[x.lv]};opacity:.9"></div>${HR[d.getUTCDay()].slice(0, 3)}</div>`; }).join('')}</div>
    <p class="lx-note">Tertinggi 7 hari: <b style="color:${LVC[mx]}">${LVN[mx]}</b>. FFMC hari ini ${N1(t0.f)}, DC ${N0(t0.d)}. Fire Weather Index (Van Wagner 1987) dari cuaca pukul 12.00 waktu setempat; riwayat ${F.n} hari analisis model + prakiraan ECMWF; kelas FDRS Indonesia (de Groot dkk. 2006).</p>`;
}
function view(el, X, opt) {
  const C = X.E.current, name = X.label || placeName(X.R, '', X.W), dirI = Math.round((C.wind_direction_10m || 0) / 45) % 8;
  const D = X.E.daily, sr = D.sunrise && D.sunrise[0] ? D.sunrise[0].slice(11) : '', ss = D.sunset && D.sunset[0] ? D.sunset[0].slice(11) : '';
  const F = fdrs(X);
  let near = window.FHTitikID ? '<div class="lx-card" id="lxNear"><h4>Titik panas di sekitar Anda · 7 hari</h4><p class="lx-note">Memuat data NASA FIRMS…</p></div>' : '';
  if (!window.FHTitikID && opt.hotspots && opt.hotspots.length) { const R = 6371, rad = x => x * Math.PI / 180; const dist = p => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(p.la - X.lat) / 2) ** 2 + Math.cos(rad(X.lat)) * Math.cos(rad(p.la)) * Math.sin(rad(p.lo - X.lon) / 2) ** 2));
    const inBox = X.lon >= 111.45 && X.lon <= 114.3 && X.lat >= 0 && X.lat <= 1.7;
    if (inBox) { const wk = opt.hotspots.filter(p => Date.now() - p.when <= 7 * 864e5 + 36e5).map(p => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d);
      near = `<div class="lx-card"><h4>Titik panas di sekitar Anda · 7 hari</h4><div class="lx-two"><div><div class="lx-big">${wk.filter(x => x.d <= 25).length}</div><div class="lx-note" style="margin:0">titik ≤ 25 km</div></div><div><div class="lx-big">${wk.length ? N1(wk[0].d) : '–'}<small style="font-size:14px"> km</small></div><div class="lx-note" style="margin:0">titik terdekat</div></div></div><p class="lx-note">Basis data NASA FIRMS Fire Hotspot (Kapuas Hulu).</p></div>`; }
  }
  el.innerHTML = `<div class="lx">
   <div class="lx-hero" style="background:${heroBg(C.weather_code, C.is_day)}">
    <div class="lx-place"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3L3 10.5l7.2 2.3L12.5 20z"/></svg>${esc(name)}</div>
    <div class="lx-sub">${X.lat.toFixed(5)}, ${X.lon.toFixed(5)}${X.acc != null ? ` · GPS ±${X.acc < 1000 ? Math.round(X.acc) + ' m' : N1(X.acc / 1000) + ' km'}` : X.src === 'cari' ? ' · lokasi dicari' : ''} · ${C.time.slice(11, 16)} waktu setempat</div>
    ${X.acc != null && X.acc > 500 ? `<div class="lx-warn">Lokasi kurang akurat (±${N1(X.acc / 1000)} km): HP memakai lokasi jaringan, bukan satelit GPS. Aktifkan GPS/“Akurasi lokasi Google” di pengaturan lalu ketuk <b>Perbarui lokasi</b> di luar ruangan.</div>` : ''}
    <div class="lx-main"><div><div class="lx-temp">${Math.round(C.temperature_2m)}<sup>°C</sup></div><div class="lx-desc">${WMO[C.weather_code] || ''}</div><div class="lx-sub">Terasa ${Math.round(C.apparent_temperature)}° · hari ini ${Math.round(D.temperature_2m_min[0])}°–${Math.round(D.temperature_2m_max[0])}°</div></div>${icon(C.weather_code, C.is_day, 110)}</div>
    <div class="lx-stats"><div><b>${Math.round(C.relative_humidity_2m)}%</b><span>kelembapan</span></div><div><b>${N1(C.wind_speed_10m)}</b><span>km/jam dari ${ARAH[dirI]}</span></div><div><b>${N1(D.precipitation_sum[0] || 0)}</b><span>mm hujan hari ini</span></div><div><b>${Math.round(C.cloud_cover)}%</b><span>awan</span></div></div>
    ${sr ? `<div class="lx-sub" style="margin-top:10px">Matahari terbit ${sr} · terbenam ${ss}</div>` : ''}
   </div>
   <div class="lx-card"><h4>Per jam · 36 jam ke depan</h4>${hoursHTML(X.E)}</div>
   <div class="lx-ec"></div>
   <div class="lx-card"><h4>14 hari ke depan</h4>${daysHTML(X.E)}<p class="lx-note">Hari 8–14 ditampilkan pudar: kecenderungan, keyakinan lebih rendah.</p></div>
   <div class="lx-card"><h4>Meteogram ensemble ECMWF · 15 hari</h4><div class="lx-mg"></div></div>
   <div class="lx-two" style="grid-template-columns:1fr"><div class="lx-card"><h4>Bahaya kebakaran di lokasi Anda</h4>${fireHTML(F)}</div>
   <div class="lx-card"><h4>Kualitas udara & asap</h4>${aqHTML(X.A)}</div></div>
   ${near}
   <div class="lx-actions"><button class="lx-btn pri" data-a="map"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/></svg>Titik api NASA di sekitar</button><button class="lx-btn" data-a="gps">Perbarui lokasi</button><button class="lx-btn" data-a="cari">Cari lokasi lain</button></div>
   <p class="lx-note">Sumber: cuaca saat ini, per jam & 14 hari = model ECMWF IFS 0,25° (European Centre for Medium-Range Weather Forecasts, CC BY 4.0) via Open-Meteo, berupa analisis/prakiraan model (grid ±25 km), bukan alat ukur di tempat Anda. Kualitas udara = Copernicus CAMS; kategori PM2.5 BMKG. Wilayah: batas desa/kelurahan BPS/BIG (OCHA COD-AB) dengan nama & kode Kepmendagri 2025; di luar Indonesia © OpenStreetMap. Lokasi Anda hanya dipakai di HP ini dan tidak disimpan di server.</p></div>`;
  if (window.FHMeteogram) FHMeteogram.mount(el.querySelector('.lx-mg'), X.lat, X.lon);
  if (window.FHPetaEC) FHPetaEC.mount(el.querySelector('.lx-ec'), { lat: X.lat, lon: X.lon, label: name });
  el.querySelector('[data-a=map]').onclick = () => opt.onMap && opt.onMap(X.lat, X.lon);
  el.querySelector('[data-a=gps]').onclick = () => gps(el, opt, true);
  el.querySelector('[data-a=cari]').onclick = () => search(el, opt);
  const nb = el.querySelector('#lxNear'); if (nb) FHTitikID.terdekat(X.lat, X.lon, { hari: 7 }).then(r => {
    nb.innerHTML = `<h4>Titik panas di sekitar Anda · 7 hari</h4><div class="lx-two"><div><div class="lx-big">${r.n25}</div><div class="lx-note" style="margin:0">titik ≤ 25 km</div></div><div><div class="lx-big">${r.jarak_km == null ? '–' : r.jarak_km < 100 ? N1(r.jarak_km) : Math.round(r.jarak_km).toLocaleString('id-ID')}<small style="font-size:14px"> km</small></div><div class="lx-note" style="margin:0">titik terdekat${r.titik ? ' · ' + esc(r.titik.sensor) : ''}</div></div></div><p class="lx-note">NASA FIRMS near real-time, seluruh Indonesia (diperbarui otomatis tiap 3 jam).</p>`;
  }).catch(() => { nb.innerHTML = '<h4>Titik panas di sekitar Anda · 7 hari</h4><p class="lx-note">Data belum dapat dimuat (perlu internet).</p>'; });
}
function search(el, opt) {
  if (opt.searchEl && window.FHCari) { opt.searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = opt.searchEl.querySelector('input'); if (i) setTimeout(() => i.focus(), 300); return; }
  el.innerHTML = `<div class="lx"><div class="lx-card"><h4>Cari lokasi</h4><div class="lx-sbox"></div><div class="lx-search" style="display:none"><input type="search"><button></button></div><div class="lx-res"></div>
    <button class="lx-btn" style="margin-top:10px;width:100%" data-a="gps">Pakai GPS HP saya</button><p class="lx-note">Indonesia: seluruh desa/kelurahan, kecamatan & kab/kota (Kepmendagri 2025). Luar negeri: Open-Meteo Geocoding (GeoNames).</p></div></div>`;
  el.querySelector('[data-a=gps]').onclick = () => gps(el, opt, true);
  if (window.FHCari) { FHCari.box(el.querySelector('.lx-sbox'), { onPick: loc => at(el, opt, loc) }).focus(); return; }
  const sb = el.querySelector('.lx-search'); sb.style.display = ''; el.querySelector('.lx-search button').textContent = 'Cari';
  const inp = el.querySelector('input'), res = el.querySelector('.lx-res');
  const go = async () => { const q = inp.value.trim(); if (q.length < 2) return; res.innerHTML = '<p class="lx-note">Mencari…</p>';
    try { const r = await J(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=id&format=json`, 2); const L0 = (r.results || []);
      res.innerHTML = L0.length ? L0.map((x, i) => `<button data-i="${i}"><b>${esc(x.name)}</b> <span class="lx-note">${esc([x.admin2, x.admin1, x.country].filter(Boolean).join(', '))}</span></button>`).join('') : '<p class="lx-note">Tidak ditemukan.</p>';
      res.querySelectorAll('button').forEach(b => b.onclick = () => { const x = L0[+b.dataset.i]; at(el, opt, { lat: x.latitude, lon: x.longitude, label: '', src: 'cari' }); }); }
    catch (e) { res.innerHTML = '<p class="lx-note">Pencarian gagal. Periksa koneksi internet.</p>'; } };
  sb.querySelector('button').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
}
function at(el, opt, loc) { const L0 = Object.assign({ src: 'cari' }, loc); if (opt.remember !== false) store.set('lokasi', L0); return show(el, opt, L0); }
async function show(el, opt, loc) {
  el.innerHTML = '<div class="lx"><div class="lx-skel"></div><div class="lx-skel" style="height:120px"></div></div>';
  try { const X = await load(loc.lat, loc.lon); X.label = loc.label; X.acc = loc.acc ?? null; X.src = loc.src || ''; view(el, X, opt); }
  catch (e) { el.innerHTML = `<div class="lx-card"><p class="lx-note">Data cuaca belum dapat dimuat (${esc(e.message || e)}). Periksa koneksi internet lalu coba lagi.</p><button class="lx-btn pri" style="margin-top:8px">Coba lagi</button></div>`; el.querySelector('button').onclick = () => show(el, opt, loc); }
}
function gps(el, opt, force) {
  const saved = store.get('lokasi', null);
  if (!force && saved && saved.src === 'cari') return show(el, opt, saved);   // lokasi yang dipilih manual tetap dipakai
  if (!navigator.geolocation) return search(el, opt);
  el.innerHTML = `<div class="lx"><div class="lx-card" style="text-align:center"><div class="lx-radar"><i></i><i></i><b></b></div><div style="font-size:15px;font-weight:700;margin:6px 0">Mencari posisi GPS Anda…</div><div class="lx-note" id="lxAcc" style="font-size:13px">Menunggu sinyal satelit</div><p class="lx-note">Izinkan akses lokasi bila diminta. Di luar ruangan lebih cepat & akurat. Lokasi hanya dipakai di HP ini.</p><button class="lx-btn" style="margin-top:10px;width:100%">Atau cari kota secara manual</button></div></div>`;
  let best = null, done = false, wid = null; const t0 = Date.now();
  const finish = () => { if (done) return; done = true; if (wid !== null) navigator.geolocation.clearWatch(wid); clearTimeout(tm);
    if (best) { const loc = { lat: best.coords.latitude, lon: best.coords.longitude, acc: best.coords.accuracy, src: 'gps', t: Date.now() }; store.set('lokasi', loc); show(el, opt, loc); }
    else if (saved) show(el, opt, Object.assign({}, saved, { label: '' }));
    else search(el, opt); };
  el.querySelector('button').onclick = () => { done = true; if (wid !== null) navigator.geolocation.clearWatch(wid); clearTimeout(tm); search(el, opt); };
  const tm = setTimeout(finish, 20000);
  wid = navigator.geolocation.watchPosition(p => {
    if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
    const a = el.querySelector('#lxAcc'); if (a) a.textContent = `Akurasi saat ini ±${best.coords.accuracy < 1000 ? Math.round(best.coords.accuracy) + ' m' : N1(best.coords.accuracy / 1000) + ' km'}`;
    if (best.coords.accuracy <= 25 || (best.coords.accuracy <= 100 && Date.now() - t0 > 6000)) finish();
  }, err => { if (err.code === 1) { done = true; clearTimeout(tm); el.innerHTML = `<div class="lx"><div class="lx-card"><h4>Akses lokasi ditolak</h4><p class="lx-note" style="font-size:13px">Untuk melihat cuaca di lokasi Anda, izinkan akses lokasi untuk aplikasi/peramban ini (Pengaturan → Aplikasi → Chrome/Fire Hotspot → Izin → Lokasi), lalu ketuk Coba lagi. Anda juga bisa mencari kota secara manual.</p><div class="lx-actions" style="margin-top:10px"><button class="lx-btn pri" data-a="re">Coba lagi</button><button class="lx-btn" data-a="cari">Cari kota</button></div></div></div>`; el.querySelector('[data-a=re]').onclick = () => gps(el, opt, true); el.querySelector('[data-a=cari]').onclick = () => search(el, opt); } },
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}
window.FHLokasi = { render: (el, opt = {}) => gps(el, opt, false), refresh: (el, opt = {}) => gps(el, opt, true), search, at, icon };
})();
