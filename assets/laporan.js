/* Pembuat laporan titik panas – Pantau Api Nanga Lauk
 * Semua laporan dibuat di browser pengguna dari basis data website (data/web/YYYY.json),
 * data cuaca (data/cuaca.json), batas wilayah (data/geo.json) dan kejadian api (data/kejadian.json).
 * Keluaran: pratinjau di layar, PDF (jsPDF + autoTable), Word (docx), dan CSV.
 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const ZONES = ['Hutan Desa', 'Desa Nanga Lauk', 'Radius 5 km', 'Radius 5-25 km', 'Kapuas Hulu', 'Luar Kapuas Hulu'];
const ZCOL = ['#C21D1D', '#E2621B', '#E8A317', '#C9B21E', '#8E7A9E', '#9AA49E'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HEAD = '#22382B', INK = '#1D2A22', MUTED = '#5B6A61', LINE = '#D3DBD5';
const WIL = {
  desa25: { nama: 'Desa Nanga Lauk & radius 25 km', zmax: 3, ext: 'buf25' },
  desa5: { nama: 'Hutan Desa, Desa Nanga Lauk & radius 5 km', zmax: 2, ext: 'buf5' },
  kh: { nama: 'Seluruh Kabupaten Kapuas Hulu', zmax: 4, ext: 'kh' },
};
const CAP_DETAIL = 220, CAP_EVENTS = 40;
let G = null, STATUS = null, EVENTS = null, CUACA = null, IMG = null; const YEARS = {};
let LAST = null;

/* ---------------- util ---------------- */
const fmt = n => Number(n).toLocaleString('id-ID');
const fmt1 = n => Number(n).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const iso = d => d.toISOString().slice(0, 10);
const D = s => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5) + 1;
const tglID = s => `${+s.slice(8, 10)} ${BULAN_P[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const famOf = sen => sen.startsWith('MODIS') ? 'MODIS' : sen.includes('S-NPP') ? 'VIIRS S-NPP' : sen.includes('NOAA-20') ? 'VIIRS NOAA-20' : 'VIIRS NOAA-21';
const confTxt = r => r.sen.startsWith('MODIS') ? r.conf + '%' : ({ l: 'rendah', n: 'nominal', h: 'tinggi' }[r.conf] || r.conf);
function loadScript(src) { return new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Gagal memuat ' + src)); document.head.appendChild(s); }); }
const status = (t, err) => { const el = $('#rpStatus'); el.textContent = t; el.style.color = err ? 'var(--z-hd)' : 'var(--muted)'; };

async function base() {
  if (G) return;
  const j = u => fetch(u + '?' + Date.now()).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
  [G, STATUS, EVENTS, CUACA] = await Promise.all([j('data/geo.json'), j('data/status.json'), j('data/kejadian.json'), j('data/cuaca.json')]);
  IMG = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = 'assets/s2_20260810.jpg'; });
}
async function yearData(y) {
  if (YEARS[y]) return YEARS[y];
  const r = await fetch(`data/web/${y}.json?${Date.now()}`); if (!r.ok) return (YEARS[y] = []);
  const j = await r.json(); const K = j.kolom;
  return (YEARS[y] = j.baris.map(a => Object.fromEntries(K.map((k, i) => [k, a[i]]))));
}

/* ---------------- cakupan data ---------------- */
function coverage() {
  const c = STATUS.cakupan || {}; let spEnd = '2000-10-31', nrtStart = null, nrtEnd = null;
  for (const [k, v] of Object.entries(c)) {
    if (k.startsWith('SP ')) { const yEnd = v[1].slice(0, 4) + '-12-31'; if (yEnd > spEnd) spEnd = yEnd; }
    else { if (!nrtStart || v[0] < nrtStart) nrtStart = v[0]; if (!nrtEnd || v[1] > nrtEnd) nrtEnd = v[1]; }
  }
  return { start: '2000-11-01', spEnd, nrtStart, end: nrtEnd || spEnd };
}
function gapIn(a, b) {
  const cv = coverage(); if (!cv.nrtStart) return null;
  const g0 = addDays(cv.spEnd, 1), g1 = addDays(cv.nrtStart, -1); if (g1 < g0) return null;
  const s = a > g0 ? a : g0, e = b < g1 ? b : g1; return s <= e ? [s, e] : null;
}

/* ---------------- cuaca ---------------- */
function rainStats(a, b) {
  const t = CUACA.t; let i0 = t.findIndex(x => x >= a); if (i0 < 0) return null; let n = 0, sum = 0, wet = 0, rh = 0, tm = -99, dry = 0, maxDry = 0, dryEnd = null;
  for (let i = i0; i < t.length && t[i] <= b; i++) {
    const h = CUACA.hujan[i] ?? 0; n++; sum += h; rh += CUACA.rh[i] ?? 0; tm = Math.max(tm, CUACA.tmaks[i] ?? -99);
    if (h >= 1) { wet++; dry = 0; } else { dry++; if (dry > maxDry) { maxDry = dry; dryEnd = t[i]; } }
  }
  if (!n) return null;
  return { n, sum, wet, rhMean: rh / n, tMax: tm, maxDry, dryEnd, last: t[t.length - 1] };
}
function rainNormal(a, b) {
  const len = daysBetween(a, b); if (len > 366) return null; const vals = [];
  for (let y = 2001; y <= 2025; y++) {
    const dy = +a.slice(0, 4) - y; const a2 = y + a.slice(4); if (isNaN(D(a2))) continue; const e2 = addDays(a2, len - 1);
    if (a2.slice(0, 4) == a.slice(0, 4) && dy === 0) continue;
    const s = rainStats(a2, e2); if (s && s.n === len) vals.push(s.sum);
  }
  return vals.length ? vals.reduce((p, c) => p + c, 0) / vals.length : null;
}
function monthlyRain(ym) { let s = 0, n = 0; CUACA.t.forEach((t, i) => { if (t.startsWith(ym)) { s += CUACA.hujan[i] ?? 0; n++; } }); return n ? s : null; }

/* ---------------- model laporan ---------------- */
async function buildModel(a, b, wilKey, sensor) {
  await base(); const W = WIL[wilKey];
  const years = []; for (let y = +a.slice(0, 4); y <= +b.slice(0, 4); y++) years.push(y);
  const all = (await Promise.all(years.map(yearData))).flat();
  const rows = all.filter(r => r.d >= a && r.d <= b && r.z <= W.zmax && (sensor === 'semua' || (sensor === 'viirs' ? !r.sen.startsWith('MODIS') : r.sen.startsWith('MODIS'))));
  rows.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
  const len = daysBetween(a, b), gap = gapIn(a, b), zc = ZONES.map((_, i) => rows.filter(r => r.z === i).length);
  const near = rows.filter(r => r.z <= 2), fams = ['MODIS', 'VIIRS S-NPP', 'VIIRS NOAA-20', 'VIIRS NOAA-21'];
  const rs = rainStats(a, b), rn = rs ? rainNormal(a, b) : null;
  // pembanding: VIIRS S-NPP periode sama 2013–2025
  let trend = null;
  if (len <= 366 && !gapIn(a, b)) {
    const vs = []; const yA = +a.slice(0, 4);
    for (let y = 2013; y <= 2025; y++) {
      if (y === yA && +b.slice(0, 4) === yA) continue;
      const a2 = y + a.slice(4), b2 = (y + (+b.slice(0, 4) - yA)) + b.slice(4); if (isNaN(D(a2)) || isNaN(D(b2))) continue; const yd = (await Promise.all([y, y + (+b.slice(0, 4) - yA)].filter((v, i, s) => s.indexOf(v) === i).map(yearData))).flat();
      vs.push(yd.filter(r => r.d >= a2 && r.d <= b2 && r.z <= W.zmax && r.sen.includes('S-NPP')).length);
    }
    const cur = rows.filter(r => r.sen.includes('S-NPP')).length;
    if (vs.length) trend = { mean: vs.reduce((p, c) => p + c, 0) / vs.length, min: Math.min(...vs), max: Math.max(...vs), cur, n: vs.length };
  }
  // periode tabel
  const unit = len <= 62 ? 'hari' : len <= 731 ? 'bulan' : 'tahun';
  const keyOf = d => unit === 'hari' ? d : unit === 'bulan' ? d.slice(0, 7) : d.slice(0, 4);
  const keys = []; { let d = a; while (d <= b) { const k = keyOf(d); if (keys[keys.length - 1] !== k) keys.push(k); d = unit === 'tahun' ? (+d.slice(0, 4) + 1) + '-01-01' : unit === 'bulan' ? (d.slice(5, 7) === '12' ? (+d.slice(0, 4) + 1) + '-01-01' : d.slice(0, 5) + String(+d.slice(5, 7) + 1).padStart(2, '0') + '-01') : addDays(d, 1); } }
  const rainOf = k => { const s = unit === 'hari' ? k : unit === 'bulan' ? (k + '-01' < a ? a : k + '-01') : (k + '-01-01' < a ? a : k + '-01-01'); const e0 = unit === 'hari' ? k : unit === 'bulan' ? iso(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0))) : k + '-12-31'; const e = e0 > b ? b : e0; const st = rainStats(s, e); return st && st.n === daysBetween(s, e) ? st.sum : (st ? st.sum : null); };
  const per = keys.map(k => { const rk = rows.filter(r => keyOf(r.d) === k); return { k, z: ZONES.slice(0, W.zmax + 1).map((_, i) => rk.filter(r => r.z === i).length), n: rk.length, rain: rainOf(k) }; });
  // kejadian
  const evMap = new Map(); for (const e of EVENTS) evMap.set(e.id_kejadian, e);
  const evg = new Map(); for (const r of near) if (r.ev) { if (!evg.has(r.ev)) evg.set(r.ev, []); evg.get(r.ev).push(r); }
  const events = [...evg.entries()].map(([id, rr]) => { const e = evMap.get(id) || {}; return { id, mulai: rr[0].wib, selesai: rr[rr.length - 1].wib, n: rr.length, z: Math.min(...rr.map(r => r.z)), pt: [...new Set(rr.map(r => r.pt).filter(Boolean))].join(', '), frp: Math.max(...rr.map(r => r.frp)), ha: e.luas_cakupan_piksel_ha ?? rr.reduce((s, r) => s + r.ha, 0) }; })
    .sort((x, y) => x.z - y.z || y.mulai.localeCompare(x.mulai));
  const petak = {}; for (const r of near) if (r.pt) (petak[r.pt] = petak[r.pt] || []).push(r.wib.slice(0, 10));
  const ctx = k => { const c = {}; for (const r of near) { const v = (r[k] || 'Tidak ada / di luar data').split(' (')[0]; c[v] = (c[v] || 0) + 1; } return Object.entries(c).sort((x, y) => y[1] - x[1]); };
  const M = { a, b, len, W, wilKey, sensor, rows, near, zc, fams, gap, rs, rn, trend, unit, per, events, petak, ctx: { kw: ctx('kw'), tl: ctx('tl'), gb: ctx('gb') }, cov: coverage() };
  M.title = `Laporan Titik Panas ${W.nama}`;
  M.periodeTxt = `${tglID(a)} – ${tglID(b)}`;
  M.summary = summary(M); M.weatherTxt = weatherText(M);
  return M;
}

function summary(M) {
  const s = []; const z = M.zc;
  s.push(`Periode ${M.periodeTxt} (${fmt(M.len)} hari), wilayah ${M.W.nama}, sensor ${M.sensor === 'semua' ? 'VIIRS & MODIS' : M.sensor.toUpperCase()}: ${fmt(M.rows.length)} deteksi titik panas.`);
  const hd = M.rows.filter(r => r.z === 0);
  s.push(`Di dalam Hutan Desa: ${z[0]} deteksi` + (hd.length ? ' (' + hd.slice(0, 6).map(r => `${r.wib} WIB, petak ${r.pt || '-'}`).join('; ') + (hd.length > 6 ? '; …' : '') + ').' : '.'));
  s.push(`Di dalam Desa Nanga Lauk (di luar Hutan Desa): ${z[1]}; radius 0–5 km dari batas desa: ${z[2]}` + (M.W.zmax >= 3 ? `; radius 5–25 km: ${fmt(z[3])}` : '') + (M.W.zmax >= 4 ? `; bagian lain Kapuas Hulu: ${fmt(z[4])}` : '') + '.');
  s.push(`Kejadian api (deteksi berjarak ≤ 1 km dan ≤ 2 hari) di desa dan radius 5 km: ${M.events.length}.`);
  if (M.trend) {
    const t = M.trend, r = t.mean ? t.cur / t.mean : null;
    s.push(`Dibanding periode yang sama tahun 2013–2025 (sensor VIIRS S-NPP, rata-rata ${fmt1(t.mean)} deteksi, rentang ${t.min}–${t.max}), periode ini ${t.cur} deteksi: ` + (r === null ? 'tidak dapat dibandingkan.' : r < 0.5 ? 'jauh di bawah rata-rata.' : r < 0.85 ? 'di bawah rata-rata.' : r <= 1.15 ? 'mendekati rata-rata.' : r <= 2 ? 'di atas rata-rata.' : 'jauh di atas rata-rata.'));
  }
  if (M.gap) s.push(`PERHATIAN: tanggal ${tglID(M.gap[0])} – ${tglID(M.gap[1])} belum memiliki data FIRMS di basis data (menunggu arsip tahunan NASA). Nol deteksi pada rentang ini BUKAN berarti tidak ada titik panas.`);
  return s;
}

function monthStats(ym) { const a = ym + '-01', b = iso(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0))); return rainStats(a, b); }
function monthNormal(m) { let s = 0; const ys = new Set(); CUACA.t.forEach((t, i) => { if (t >= '2001' && t < '2026' && +t.slice(5, 7) === m) { s += CUACA.hujan[i] ?? 0; ys.add(t.slice(0, 4)); } }); return ys.size ? s / ys.size : null; }
function weatherText(M) {
  const rs = M.rs; if (!rs) return ['Data cuaca untuk periode ini belum tersedia.'];
  const out = []; const many = M.zc[0] + M.zc[1] + M.zc[2];
  const gapBig = M.gap && daysBetween(M.gap[0], M.gap[1]) >= M.len * 0.5;
  const mc = {}; for (const r of M.rows) { const m = +r.d.slice(5, 7); mc[m] = (mc[m] || 0) + 1; }
  const topM = Object.entries(mc).sort((x, y) => y[1] - x[1]).slice(0, 3);
  if (M.len > 366) {
    // ---- rentang panjang: pola tahunan
    const yrs = []; for (let y = +M.a.slice(0, 4); y <= +M.b.slice(0, 4); y++) { const full = `${y}-01-01` >= M.a && `${y}-12-31` <= M.b && `${y}-12-31` <= rs.last; if (full) yrs.push(y); }
    const ann = yrs.map(y => ({ y, rain: rainStats(`${y}-01-01`, `${y}-12-31`).sum, dry: rainStats(`${y}-06-01`, `${y}-09-30`), modis: M.rows.filter(r => r.d.startsWith(String(y)) && r.sen.startsWith('MODIS')).length, all: M.rows.filter(r => r.d.startsWith(String(y))).length }));
    if (ann.length) {
      const mean = ann.reduce((p, c) => p + c.rain, 0) / ann.length, jjas = ann.reduce((p, c) => p + c.dry.sum, 0) / ann.length;
      const wet = ann.reduce((p, c) => c.rain > p.rain ? c : p), dryY = ann.reduce((p, c) => c.dry.sum < p.dry.sum ? c : p);
      out.push(`Curah hujan rata-rata ${fmt(Math.round(mean))} mm per tahun (${ann[0].y}–${ann[ann.length - 1].y}); musim kemarau Juni–September rata-rata ${fmt(Math.round(jjas))} mm. Tahun terbasah ${wet.y} (${fmt(Math.round(wet.rain))} mm); kemarau terkering ${dryY.y} (Juni–September ${fmt(Math.round(dryY.dry.sum))} mm, ${Math.round(dryY.dry.sum / jjas * 100)}% dari rata-rata, kering beruntun terpanjang ${dryY.dry.maxDry} hari).`);
      const top = ann.slice().sort((x, y) => y.all - x.all).slice(0, 3);
      out.push(`Tahun dengan titik panas terbanyak: ${top.map(t => `${t.y} (${fmt(t.all)} deteksi; hujan Juni–September ${Math.round(t.dry.sum / jjas * 100)}% dari rata-rata, kering beruntun ${t.dry.maxDry} hari)`).join('; ')}.`);
      const xs = ann.map(a => a.dry.sum), ys = ann.map(a => a.modis); const n = xs.length;
      if (n >= 5 && ys.some(v => v)) { const mx = xs.reduce((p, c) => p + c, 0) / n, my = ys.reduce((p, c) => p + c, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } const r = sxy / Math.sqrt(sxx * syy || 1);
        out.push(`Hubungan curah hujan kemarau dengan jumlah titik panas (MODIS, ${n} tahun penuh): koefisien korelasi r = ${r.toFixed(2).replace('.', ',')}. ` + (r <= -0.5 ? 'Hubungannya kuat dan negatif: semakin kering musim kemarau, semakin banyak titik panas.' : r <= -0.3 ? 'Hubungannya sedang dan negatif: kemarau yang lebih kering cenderung disertai lebih banyak titik panas.' : 'Hubungannya lemah; faktor lain seperti pembukaan ladang dan kegiatan manusia ikut menentukan jumlah titik panas.')); }
    }
  } else {
    const pct = M.rn ? rs.sum / M.rn * 100 : null;
    const kond = pct === null ? null : pct < 60 ? 'jauh lebih kering dari normal' : pct < 85 ? 'lebih kering dari normal' : pct <= 115 ? 'normal' : pct <= 150 ? 'lebih basah dari normal' : 'jauh lebih basah dari normal';
    out.push(`Curah hujan total ${fmt1(rs.sum)} mm dalam ${rs.n} hari (${rs.wet} hari hujan ≥ 1 mm)` + (M.rn ? `; rata-rata periode yang sama 2001–2025: ${fmt1(M.rn)} mm (${Math.round(pct)}% dari normal, kondisi ${kond}).` : '.') +
      ` Periode kering terpanjang (hujan < 1 mm/hari berturut-turut): ${rs.maxDry} hari${rs.maxDry ? ' (berakhir ' + tglID(rs.dryEnd) + ')' : ''}. Kelembapan rata-rata ${fmt1(rs.rhMean)}%, suhu maksimum ${fmt1(rs.tMax)} °C.`);
    if (M.len > 62 && M.rows.length) {
      const ymC = {}; for (const r of M.rows) { const k = r.d.slice(0, 7); ymC[k] = (ymC[k] || 0) + 1; }
      const [pk, pn] = Object.entries(ymC).sort((x, y) => y[1] - x[1])[0]; const st = monthStats(pk), nm = monthNormal(+pk.slice(5, 7));
      if (st) out.push(`Bulan dengan titik panas terbanyak: ${BULAN_P[+pk.slice(5, 7) - 1]} ${pk.slice(0, 4)} (${pn} deteksi). Curah hujan bulan itu ${fmt1(st.sum)} mm` + (nm ? ` (${Math.round(st.sum / nm * 100)}% dari normal ${BULAN_P[+pk.slice(5, 7) - 1]} ${fmt1(nm)} mm)` : '') + `, ${st.wet} hari hujan, kering beruntun terpanjang ${st.maxDry} hari.`);
      const quiet = Object.keys(Object.fromEntries(M.per.map(p => [p.k, 1]))).filter(k => !ymC[k] && k.length === 7);
      if (quiet.length && quiet.length <= 12) { const qr = quiet.map(k => { const st2 = monthStats(k), nm2 = monthNormal(+k.slice(5, 7)); return st2 && nm2 ? st2.sum / nm2 : null; }).filter(v => v !== null); if (qr.length) out.push(`Bulan tanpa titik panas (${quiet.map(k => BULAN[+k.slice(5, 7) - 1]).join(', ')}) rata-rata menerima ${Math.round(qr.reduce((p, c) => p + c, 0) / qr.length * 100)}% curah hujan normalnya.`); }
    }
    if (rs.last < M.b) out.push(`Data cuaca tersedia sampai ${tglID(rs.last)} (reanalisis ERA5 tertunda beberapa hari).`);
    const dryish = (pct !== null && pct < 85) || rs.maxDry >= 10, wetish = (pct !== null && pct > 115) || (rs.maxDry < 5 && rs.wet / rs.n > 0.5);
    let interp;
    if (gapBig) interp = 'Sebagian besar periode belum memiliki data titik panas, sehingga hubungan cuaca dan titik panas belum dapat disimpulkan.';
    else if (many === 0 && wetish) interp = 'Tidak adanya titik panas di desa dan sekitarnya sejalan dengan kondisi basah: hujan sering turun dan periode kering pendek, sehingga vegetasi, serasah, dan gambut tetap lembap dan api sulit menyala atau menyebar.';
    else if (many === 0 && dryish) interp = 'Meskipun cuaca relatif kering, tidak ada titik panas di desa dan sekitarnya. Ini indikasi baik bahwa tidak ada pembakaran atau api berhasil dicegah; tetap waspada karena kondisi kering meningkatkan risiko.';
    else if (many === 0) interp = 'Tidak ada titik panas di desa dan sekitarnya pada kondisi cuaca yang mendekati normal.';
    else if (dryish) interp = `Titik panas muncul bersamaan dengan kondisi kering (periode tanpa hujan ${rs.maxDry} hari). Pola ini umum di Kapuas Hulu pada musim kemarau (Juni–September), saat pembukaan ladang dengan pembakaran dan lahan lebih mudah terbakar; lokasi di dalam desa perlu dicek lapangan.`;
    else if (wetish) interp = 'Secara keseluruhan periode ini basah, namun titik panas tetap muncul, umumnya pada jeda beberapa hari tanpa hujan. Pola ini khas pembakaran terkendali untuk pembukaan ladang; perlu verifikasi lapangan.';
    else interp = 'Titik panas muncul pada kondisi cuaca mendekati normal; perlu verifikasi lapangan untuk memastikan sumber panas (pembakaran ladang, kebakaran, atau sumber lain).';
    out.push(interp);
  }
  if (gapBig && M.len > 366) out.push('Catatan: sebagian periode belum memiliki data titik panas (lihat Ringkasan), sehingga tahun tersebut tidak dipakai dalam perbandingan.');
  out.push('Pola musim Kapuas Hulu (iklim ekuatorial): hujan tinggi hampir sepanjang tahun dengan puncak Oktober–Desember dan Maret–Mei; periode lebih kering umumnya Juni–September, terutama pada tahun El Niño (mis. 2015, 2019, 2023).' + (topM.length ? ` Titik panas pada periode ini paling banyak di bulan ${topM.map(([m, n]) => `${BULAN_P[m - 1]} (${fmt(n)})`).join(', ')}.` : ''));
  return out;
}

/* ---------------- gambar (canvas) ---------------- */
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); return [c, g]; }
function rings(geom) { const P = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'LineString' ? [[geom.coordinates]] : geom.type === 'MultiLineString' ? [geom.coordinates] : []; return P.flat(); }
function bboxOf(fc) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const f of fc.features) for (const r of rings(f.geometry)) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
function drawMap(M, which) {
  const [c, g] = mkCanvas(1400, 1150); const pad = 60;
  let bb = which === 'zoom' ? bboxOf(G.buf5) : M.W.ext === 'kh' ? bboxOf({ features: G.kab.features.filter(f => f.properties.WADMKK === 'Kapuas Hulu') }) : bboxOf(G[M.W.ext]);
  const dx = (bb[2] - bb[0]) * 0.04, dy = (bb[3] - bb[1]) * 0.04; bb = [bb[0] - dx, bb[1] - dy, bb[2] + dx, bb[3] + dy];
  const sc = Math.min((c.width - 2 * pad) / (bb[2] - bb[0]), (c.height - 2 * pad - 40) / (bb[3] - bb[1]));
  const ox = pad + ((c.width - 2 * pad) - sc * (bb[2] - bb[0])) / 2, oy = pad + 40;
  const P = (x, y) => [ox + (x - bb[0]) * sc, oy + (bb[3] - y) * sc];
  g.fillStyle = '#F2F4F1'; g.fillRect(ox, oy, sc * (bb[2] - bb[0]), sc * (bb[3] - bb[1]));
  g.save(); g.beginPath(); g.rect(ox, oy, sc * (bb[2] - bb[0]), sc * (bb[3] - bb[1])); g.clip();
  if (which === 'zoom' && IMG) { const [[la0, lo0], [la1, lo1]] = G.img_bounds; const [x0, y0] = P(lo0, la1), [x1, y1] = P(lo1, la0); g.drawImage(IMG, x0, y0, x1 - x0, y1 - y0); }
  const stroke = (fc, col, w, dash, alpha) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.globalAlpha = alpha ?? 1; for (const f of fc.features) for (const r of rings(f.geometry)) { g.beginPath(); r.forEach(([x, y], i) => { const [px, py] = P(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); } g.setLineDash([]); g.globalAlpha = 1; };
  stroke(G.kab, '#8E9A92', 1.2, [6, 5]); stroke(G.river, '#4A90C8', 1.6, null, 0.85);
  if (which === 'zoom') stroke(G.grid, '#ffffff', 0.6, null, 0.55);
  if (M.W.zmax >= 3 || which === 'zoom') stroke(G.buf5, ZCOL[2], 2, [12, 7]);
  if (which !== 'zoom' && M.W.zmax >= 3) stroke(G.buf25, ZCOL[3], 2, [12, 8]);
  stroke(G.desa, which === 'zoom' ? '#FFE14D' : '#222', 2.6); stroke(G.hd, '#FF3B30', 3.2);
  const pts = which === 'zoom' ? M.near : M.rows;
  for (let zi = M.W.zmax; zi >= 0; zi--) for (const r of pts) if (r.z === zi) { const [px, py] = P(r.lon, r.lat); g.beginPath(); g.arc(px, py, zi <= 1 ? 9 : zi === 2 ? 7 : 5, 0, 7); g.fillStyle = ZCOL[zi]; g.fill(); g.lineWidth = 1.4; g.strokeStyle = which === 'zoom' ? '#fff' : '#000'; g.stroke(); }
  g.restore();
  g.strokeStyle = MUTED; g.lineWidth = 1.5; g.strokeRect(ox, oy, sc * (bb[2] - bb[0]), sc * (bb[3] - bb[1]));
  g.fillStyle = INK; g.font = 'bold 30px Arial'; g.fillText(which === 'zoom' ? `Titik panas di desa & radius 5 km (latar Sentinel-2, 10 Agu 2026)` : `Peta titik panas – ${M.W.nama}`, pad, 44);
  // grid koordinat
  g.font = '20px Arial'; g.fillStyle = MUTED; const step = (bb[2] - bb[0]) > 1 ? 0.5 : (bb[2] - bb[0]) > 0.3 ? 0.1 : 0.05;
  for (let x = Math.ceil(bb[0] / step) * step; x < bb[2]; x += step) { const [px] = P(x, bb[1]); g.fillText(x.toFixed(2) + '°BT', px - 40, oy + sc * (bb[3] - bb[1]) + 26); }
  for (let y = Math.ceil(bb[1] / step) * step; y < bb[3]; y += step) { const [, py] = P(bb[0], y); g.save(); g.translate(ox - 10, py + 40); g.rotate(-Math.PI / 2); g.fillText(y.toFixed(2) + '°LU', 0, 0); g.restore(); }
  // legenda
  const items = [['#FF3B30', 'Hutan Desa', 'l'], [which === 'zoom' ? '#FFE14D' : '#222', 'Desa Nanga Lauk', 'l']];
  for (let zi = 0; zi <= (which === 'zoom' ? 2 : M.W.zmax); zi++) items.push([ZCOL[zi], `${ZONES[zi]} (${(which === 'zoom' ? M.near : M.rows).filter(r => r.z === zi).length})`, 'p']);
  const lx = ox + 14, lh = 30; let ly = oy + 14; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(lx - 8, ly - 8, 400, items.length * lh + 12);
  for (const [col, t, k] of items) { if (k === 'l') { g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(lx, ly + 12); g.lineTo(lx + 30, ly + 12); g.stroke(); } else { g.beginPath(); g.arc(lx + 15, ly + 12, 8, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); } g.fillStyle = INK; g.font = '21px Arial'; g.fillText(t, lx + 42, ly + 19); ly += lh; }
  return c;
}
function drawChart(title, labels, series, opts = {}) {
  // series: [{name, color, values, type:'bar'|'line', axis:'l'|'r'}]
  const [c, g] = mkCanvas(1400, 560); const L = 90, R = opts.right ? 100 : 30, T = 70, B = 90; const W = c.width - L - R, H = c.height - T - B;
  const bars = series.filter(s => s.type !== 'line'), lines = series.filter(s => s.type === 'line');
  const tot = labels.map((_, i) => bars.reduce((p, s) => p + (s.values[i] || 0), 0)); const mx = Math.max(1, ...tot);
  const nice = v => { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
  const top = Math.max(5, nice(mx * 1.12)); const rmx = lines.length ? nice(Math.max(1, ...lines.flatMap(s => s.values.map(v => v || 0))) * 1.1) : 1;
  g.fillStyle = INK; g.font = 'bold 30px Arial'; g.fillText(title, 20, 42);
  g.font = '19px Arial'; for (let i = 0; i <= 5; i++) { const y = T + H * (1 - i / 5); g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + W, y); g.stroke(); g.fillStyle = MUTED; g.textAlign = 'right'; g.fillText(fmt(Math.round(top * i / 5)), L - 10, y + 6); if (opts.right) { g.textAlign = 'left'; g.fillText(fmt(Math.round(rmx * i / 5)), L + W + 10, y + 6); } }
  g.textAlign = 'left'; const bw = W / labels.length;
  if (opts.gap) { opts.gap.forEach((on, i) => { if (!on) return; g.fillStyle = '#ECEEEC'; g.fillRect(L + i * bw, T, bw, H); g.save(); g.translate(L + i * bw + bw / 2, T + H / 2); g.rotate(-Math.PI / 2); g.fillStyle = '#8A948D'; g.font = '17px Arial'; g.textAlign = 'center'; g.fillText('belum ada data titik panas', 0, 6); g.restore(); }); g.textAlign = 'left'; }
  labels.forEach((lab, i) => { let acc = 0; for (const s of bars) { const v = s.values[i] || 0; if (!v) continue; const h = H * v / top; g.fillStyle = s.color; g.fillRect(L + i * bw + bw * 0.12, T + H - H * (acc + v) / top, bw * 0.76, h); acc += v; }
    if (acc && labels.length <= 40) { g.fillStyle = INK; g.font = '17px Arial'; g.textAlign = 'center'; g.fillText(fmt(acc), L + i * bw + bw / 2, T + H - H * acc / top - 6); }
    const every = Math.ceil(labels.length / 24); if (i % every === 0) { g.save(); g.fillStyle = MUTED; g.font = '17px Arial'; g.translate(L + i * bw + bw / 2, T + H + 14); g.rotate(labels.length > 12 ? -Math.PI / 4 : 0); g.textAlign = labels.length > 12 ? 'right' : 'center'; g.fillText(lab, 0, 12); g.restore(); } });
  g.textAlign = 'left';
  for (const s of lines) { g.strokeStyle = s.color; g.lineWidth = 3; g.beginPath(); s.values.forEach((v, i) => { if (v === null || v === undefined) return; const x = L + i * bw + bw / 2, y = T + H - H * v / rmx; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); s.values.forEach((v, i) => { if (v === null) return; g.beginPath(); g.arc(L + i * bw + bw / 2, T + H - H * v / rmx, 4, 0, 7); g.fillStyle = s.color; g.fill(); }); }
  g.font = '19px Arial'; g.fillStyle = MUTED; g.save(); g.translate(24, T + H / 2 + 60); g.rotate(-Math.PI / 2); g.fillText(opts.ylab || 'Jumlah deteksi', 0, 0); g.restore();
  if (opts.right) { g.save(); g.translate(c.width - 20, T + H / 2 - 60); g.rotate(Math.PI / 2); g.fillText(opts.rlab, 0, 0); g.restore(); }
  let lx = L; const ly = c.height - 22; if (opts.gap && opts.gap.some(Boolean)) { g.fillStyle = '#ECEEEC'; g.fillRect(lx, ly - 15, 20, 18); g.strokeStyle = '#8A948D'; g.strokeRect(lx, ly - 15, 20, 18); g.fillStyle = INK; g.font = '19px Arial'; g.fillText('Belum ada data', lx + 26, ly); lx += 32 + g.measureText('Belum ada data').width; }
  for (const s of series) { g.fillStyle = s.color; if (s.type === 'line') { g.fillRect(lx, ly - 8, 28, 4); } else g.fillRect(lx, ly - 15, 20, 18); g.fillStyle = INK; g.fillText(s.name, lx + 34, ly); lx += 44 + g.measureText(s.name).width; }
  return c;
}
function drawContext(M) {
  const [c, g] = mkCanvas(1400, 520); g.fillStyle = INK; g.font = 'bold 30px Arial'; g.fillText('Lokasi titik panas di desa & radius 5 km menurut kawasan, tutupan lahan, dan gambut', 20, 42);
  const sets = [['Fungsi kawasan', M.ctx.kw], ['Tutupan lahan 2026', M.ctx.tl], ['Gambut', M.ctx.gb]];
  sets.forEach(([t, arr], j) => { const x0 = 20 + j * 460, top = 90; g.fillStyle = INK; g.font = 'bold 22px Arial'; g.fillText(t, x0, top); const items = arr.slice(0, 6); const mx = Math.max(1, ...items.map(i => i[1]));
    items.forEach(([k, v], i) => { const y = top + 30 + i * 62; g.font = '18px Arial'; g.fillStyle = MUTED; g.fillText(k.length > 34 ? k.slice(0, 33) + '…' : k, x0, y + 16); g.fillStyle = '#7E9C87'; g.fillRect(x0, y + 24, 320 * v / mx, 22); g.fillStyle = INK; g.fillText(String(v), x0 + 320 * v / mx + 8, y + 42); }); });
  return c;
}

/* ---------------- tabel ---------------- */
function tables(M) {
  const T = {};
  T.zona = [['Zona', ...M.fams, 'Semua']].concat(ZONES.slice(0, M.W.zmax + 1).map((z, i) => [z, ...M.fams.map(f => fmt(M.rows.filter(r => r.z === i && famOf(r.sen) === f).length)), fmt(M.zc[i])]));
  const zn = ['Hutan Desa', 'Desa', '≤ 5 km', '5–25 km', 'Kapuas Hulu lain'].slice(0, M.W.zmax + 1);
  const lab = k => M.unit === 'bulan' ? BULAN[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) : M.unit === 'hari' ? tglID(k) : k;
  const inGap = p => { if (!M.gap) return false; const s0 = M.unit === 'hari' ? p.k : M.unit === 'bulan' ? p.k + '-01' : p.k + '-01-01'; const e0 = M.unit === 'hari' ? p.k : M.unit === 'bulan' ? iso(new Date(Date.UTC(+p.k.slice(0, 4), +p.k.slice(5, 7), 0))) : p.k + '-12-31'; return M.gap[0] <= (s0 < M.a ? M.a : s0) && M.gap[1] >= (e0 > M.b ? M.b : e0); };
  T.periode = [[M.unit[0].toUpperCase() + M.unit.slice(1), ...zn, 'Total', 'Hujan (mm)']].concat(M.per.map(p => inGap(p) ? [lab(p.k), ...p.z.map(() => '–'), 'belum ada data', p.rain === null ? '–' : fmt1(p.rain)] : [lab(p.k), ...p.z.map(String), fmt(p.n), p.rain === null ? '–' : fmt1(p.rain)]));
  if (M.unit === 'hari') T.periode = [T.periode[0]].concat(T.periode.slice(1).filter((r, i) => M.per[i].n > 0 || (M.per[i].rain ?? 0) >= 0));
  T.petak = [['Petak', 'Deteksi', 'Tanggal (WIB)']].concat(Object.entries(M.petak).sort((x, y) => y[1].length - x[1].length).map(([p, d]) => [p, String(d.length), [...new Set(d)].join(', ')]));
  T.ev = [['ID kejadian', 'Mulai (WIB)', 'Selesai (WIB)', 'Deteksi', 'Zona', 'Petak', 'FRP maks (MW)', 'Cakupan piksel (ha)']].concat(M.events.slice(0, CAP_EVENTS).map(e => [e.id, e.mulai, e.selesai, String(e.n), ZONES[e.z], e.pt, fmt1(e.frp), fmt1(e.ha)]));
  const det = M.near.length > CAP_DETAIL ? M.near.filter(r => r.z <= 1).concat(M.near.filter(r => r.z === 2).slice(-Math.max(0, CAP_DETAIL - M.near.filter(r => r.z <= 1).length))) : M.near;
  T.detailNote = M.near.length > CAP_DETAIL ? `Ditampilkan ${det.length} dari ${M.near.length} deteksi (semua di Hutan Desa dan desa, serta deteksi radius 5 km terbaru). Daftar lengkap ada di tombol "Unduh data CSV".` : '';
  T.detail = [['No', 'Waktu (WIB)', 'Sensor', 'Lat', 'Lon', 'Keyakinan', 'FRP', 'Zona', 'Jarak (km)', 'Petak', 'Kawasan', 'Tutupan 2026', 'Gambut', 'Status']].concat(det.map((r, i) => [String(i + 1), r.wib, famOf(r.sen), r.lat.toFixed(5), r.lon.toFixed(5), confTxt(r), fmt1(r.frp), ZONES[r.z], r.km.toFixed(2), r.pt, (r.kw || '').split(' (')[0], r.tl, (r.gb || '').split(' (')[0], r.st]));
  T.kamus = [['Istilah', 'Keterangan'], ['Titik panas', 'Pusat piksel satelit yang terdeteksi jauh lebih panas dari sekitarnya (anomali panas), bukan konfirmasi kebakaran'], ['Waktu (WIB)', 'Waktu lintasan satelit (UTC + 7 jam)'], ['Sensor', 'VIIRS 375 m (S-NPP, NOAA-20, NOAA-21) dan MODIS 1 km (Terra, Aqua)'], ['Keyakinan', 'VIIRS: rendah/nominal/tinggi; MODIS: 0–100%'], ['FRP', 'Fire Radiative Power (MW), kekuatan radiasi panas'], ['Zona & jarak', 'Posisi terhadap Hutan Desa/desa dan jarak ke batas desa (km, UTM 49N)'], ['Petak', 'Kode grid patroli 250 m Hutan Desa'], ['Kejadian api', 'Kumpulan deteksi berjarak ≤ 1 km dan ≤ 2 hari'], ['Cakupan piksel', 'Gabungan luas piksel satelit (scan × track), BUKAN luas terbakar'], ['Status', 'SP = arsip final NASA; NRT = Near Real-Time (sementara)']];
  return T;
}
function sources(M) {
  return [
    ['Titik panas', 'NASA FIRMS (Fire Information for Resource Management System). Arsip tahunan final (SP): MODIS sejak Nov 2000, VIIRS S-NPP sejak 2012, VIIRS NOAA-20 sejak 2018; data terbaru Near Real-Time (VIIRS S-NPP/NOAA-20/NOAA-21, MODIS). DOI: 10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002; 10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002; 10.5067/VIIRS/VJ214IMG_NRT.002; 10.5067/FIRMS/MODIS/MCD14DL.NRT.0061.'],
    ['Cuaca', `${CUACA.sumber}, titik ${CUACA.lokasi}. Data reanalisis (model iklim yang diasimilasi pengamatan, grid ±9–25 km), bukan stasiun di desa: cocok untuk melihat pola basah/kering dan perbandingan dengan normal, tetapi cenderung mencatat lebih banyak hari hujan ringan dibanding alat ukur di lapangan.`],
    ['Batas wilayah', 'Hutan Desa SK.685/Menlhk-PSKL/PKPS/PSL.0/2/2017; batas desa BIG 2020 (1:10.000); grid patroli 250 m PRCF Indonesia; batas kabupaten BIG 2021; fungsi kawasan SK.733/2014 jo. SK.6630/2021; tutupan lahan 2026; gambut Kementan (BBSDLP) 1:50.000.'],
    ['Pengolahan', 'Nilai asli FIRMS tidak diubah. Deteksi tipe gunung api, sumber panas statis (industri), dan lepas pantai tidak dihitung. Tren antar-tahun dibandingkan dalam sensor yang sama (VIIRS lebih peka dari MODIS).'],
    ['Jejak audit', `Setiap unduhan sumber dicatat (URL, waktu, SHA-256) di https://github.com/erikprcfi/titik-api-desa-nanga-lauk/tree/main/data/provenance. Basis data diperbarui ${STATUS.terakhir_cek_utc} (UTC). Setiap titik dapat dicek silang di https://firms.modaps.eosdis.nasa.gov/map.`],
    ['Keterbatasan', 'Satelit mendeteksi panas saat melintas (beberapa kali sehari); api kecil, singkat, atau di bawah tajuk dan saat tertutup awan dapat tidak terdeteksi. Luas terbakar perlu diukur dengan analisa citra (burn scar) atau lapangan.'],
    ['Sitasi', "We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS)."],
  ];
}
function figures(M) {
  const F = {};
  F.map = drawMap(M, 'wide'); F.zoom = drawMap(M, 'zoom');
  const lab = k => M.unit === 'bulan' ? BULAN[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4) : M.unit === 'hari' ? +k.slice(8, 10) + ' ' + BULAN[+k.slice(5, 7) - 1] : k;
  const zser = ZONES.slice(0, M.W.zmax + 1).map((z, i) => ({ name: z, color: ZCOL[i], values: M.per.map(p => p.z[i]) }));
  const gapMask = M.per.map(p => { if (!M.gap) return false; const s0 = M.unit === 'hari' ? p.k : M.unit === 'bulan' ? p.k + '-01' : p.k + '-01-01'; const e0 = M.unit === 'hari' ? p.k : M.unit === 'bulan' ? iso(new Date(Date.UTC(+p.k.slice(0, 4), +p.k.slice(5, 7), 0))) : p.k + '-12-31'; const s1 = s0 < M.a ? M.a : s0, e1 = e0 > M.b ? M.b : e0; return M.gap[0] <= s1 && M.gap[1] >= e1; });
  F.time = drawChart(`Titik panas & curah hujan per ${M.unit}`, M.per.map(p => lab(p.k)), zser.concat([{ name: 'Curah hujan (mm)', color: '#2F6FB0', type: 'line', values: M.per.map(p => p.rain === null ? null : Math.round(p.rain)) }]), { right: true, rlab: 'Curah hujan (mm)', gap: gapMask });
  if (M.unit === 'tahun') {
    const ys = M.per.map(p => p.k); const byF = f => ys.map(y => M.rows.filter(r => r.d.startsWith(y) && famOf(r.sen) === f).length);
    F.sensor = drawChart('Deteksi per tahun menurut sensor (bandingkan tren dalam sensor yang sama)', ys, [{ name: 'MODIS', color: '#8E7A9E', values: byF('MODIS') }, { name: 'VIIRS S-NPP', color: '#C9B21E', values: byF('VIIRS S-NPP') }, { name: 'VIIRS NOAA-20/21', color: '#E2621B', values: ys.map((y, i) => byF('VIIRS NOAA-20')[i] + byF('VIIRS NOAA-21')[i]) }]);
  }
  if (M.len > 120) {
    const cm = Array.from({ length: 12 }, (_, m) => M.rows.filter(r => +r.d.slice(5, 7) === m + 1).length);
    const rnorm = Array.from({ length: 12 }, (_, m) => { let s = 0, n = 0; const yrs = new Set(); CUACA.t.forEach((t, i) => { if (t >= '2001' && t < '2026' && +t.slice(5, 7) === m + 1) { s += CUACA.hujan[i] ?? 0; yrs.add(t.slice(0, 4)); } }); return Math.round(s / Math.max(1, yrs.size)); });
    F.season = drawChart('Pola musim: titik panas per bulan (periode ini) vs curah hujan normal bulanan 2001–2025', BULAN, [{ name: 'Titik panas', color: '#C9B21E', values: cm }, { name: 'Hujan normal (mm/bulan)', color: '#2F6FB0', type: 'line', values: rnorm }], { right: true, rlab: 'Hujan normal (mm)' });
  }
  if (M.near.length) F.ctx = drawContext(M);
  return F;
}

/* ---------------- pratinjau ---------------- */
function htmlTable(t, max) { const rows = max ? t.slice(0, max + 1) : t; return `<div class="tw"><table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` + (max && t.length - 1 > max ? `<p class="rp-note">… ${t.length - 1 - max} baris lainnya ada di file PDF/Word/CSV.</p>` : ''); }
function preview(M, F, T) {
  const img = c => `<img src="${c.toDataURL('image/png')}" alt="" style="width:100%;max-width:900px;border:1px solid var(--line);margin:6px 0">`;
  $('#rpPreview').innerHTML = `<div class="rp-doc"><h3>${esc(M.title)}</h3><p class="rp-note">Periode ${esc(M.periodeTxt)} · dibuat ${new Date().toLocaleString('id-ID')} · sumber NASA FIRMS & ERA5</p>
  <h4>1. Ringkasan</h4><ul>${M.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  <h4>2. Cuaca dan kaitannya dengan titik panas</h4>${M.weatherTxt.map(s => `<p>${esc(s)}</p>`).join('')}
  <h4>3. Peta</h4>${img(F.map)}${img(F.zoom)}
  <h4>4. Grafik</h4>${img(F.time)}${F.sensor ? img(F.sensor) : ''}${F.season ? img(F.season) : ''}${F.ctx ? img(F.ctx) : ''}
  <h4>5. Rekapitulasi</h4><p class="rp-note">Tabel 1. Deteksi per zona dan sensor</p>${htmlTable(T.zona)}<p class="rp-note">Tabel 2. Deteksi dan curah hujan per ${M.unit}</p>${htmlTable(T.periode, 40)}${T.petak.length > 1 ? `<p class="rp-note">Tabel 3. Petak patroli dengan titik panas</p>${htmlTable(T.petak)}` : ''}
  <h4>6. Kejadian api di desa & radius 5 km (${M.events.length})</h4>${T.ev.length > 1 ? htmlTable(T.ev, 15) : '<p>Tidak ada kejadian.</p>'}
  <h4>Lampiran A. Detail deteksi di desa & radius 5 km (${M.near.length})</h4>${T.detail.length > 1 ? htmlTable(T.detail, 30) : '<p>Tidak ada deteksi.</p>'}
  <h4>Lampiran B–C. Kamus data, sumber data & jejak audit</h4><p class="rp-note">Lihat file PDF/Word.</p></div>`;
}

/* ---------------- PDF ---------------- */
const pdfTxt = s => String(s ?? '').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/…/g, '...').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
async function exportPDF(M, F, T) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const PW = 210, ML = 16, CW = PW - 2 * ML; let y = 18;
  const need = h => { if (y + h > 280) { doc.addPage(); y = 18; } };
  const H1 = t => { need(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(HEAD); doc.text(pdfTxt(t), ML, y); y += 7; };
  const P = (t, size = 9.5, col = INK, style = 'normal') => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(col); const lines = doc.splitTextToSize(pdfTxt(t), CW); for (const l of lines) { need(5); doc.text(l, ML, y); y += size * 0.46; } y += 1.5; };
  const IMGp = (c, wmm) => { const h = wmm * c.height / c.width; need(h + 2); doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', ML + (CW - wmm) / 2, y, wmm, h); y += h + 3; };
  const TAB = (t, fs = 7.5, opts = {}) => { doc.autoTable({ startY: y, head: [t[0].map(pdfTxt)], body: t.slice(1).map(r => r.map(pdfTxt)), margin: { left: ML, right: ML }, styles: { fontSize: fs, cellPadding: 1.2, textColor: INK, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: HEAD, textColor: 255 }, alternateRowStyles: { fillColor: [241, 244, 241] }, ...opts }); y = doc.lastAutoTable.finalY + 5; };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(HEAD); doc.splitTextToSize(pdfTxt(M.title), CW).forEach(l => { doc.text(l, ML, y); y += 7.5; });
  P(`Periode: ${M.periodeTxt}  |  Dibuat: ${new Date().toLocaleString('id-ID')}  |  Sumber: NASA FIRMS, ERA5 (Open-Meteo)`, 8.5, MUTED);
  H1('1. Ringkasan'); M.summary.forEach(s => P('• ' + s));
  H1('2. Cuaca dan kaitannya dengan titik panas'); M.weatherTxt.forEach(s => P(s));
  H1('3. Peta'); IMGp(F.map, 150); IMGp(F.zoom, 150);
  H1('4. Grafik'); IMGp(F.time, CW); if (F.sensor) IMGp(F.sensor, CW); if (F.season) IMGp(F.season, CW); if (F.ctx) IMGp(F.ctx, CW);
  H1('5. Rekapitulasi'); P('Tabel 1. Deteksi per zona dan sensor', 8.5, MUTED); TAB(T.zona, 8);
  P(`Tabel 2. Deteksi dan curah hujan per ${M.unit}`, 8.5, MUTED); TAB(T.periode, 7.5);
  if (T.petak.length > 1) { P('Tabel 3. Petak patroli dengan titik panas', 8.5, MUTED); TAB(T.petak, 7.5, { columnStyles: { 2: { cellWidth: 120 } } }); }
  H1(`6. Kejadian api di desa & radius 5 km (${M.events.length})`);
  if (T.ev.length > 1) { if (M.events.length > CAP_EVENTS) P(`Ditampilkan ${CAP_EVENTS} kejadian (diurutkan dari zona terdekat). Seluruh kejadian ada di file CSV.`, 8.5, MUTED); TAB(T.ev, 7); } else P('Tidak ada kejadian pada periode ini.');
  doc.addPage('a4', 'landscape'); y = 16; const ML2 = 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(HEAD); doc.text(pdfTxt(`Lampiran A. Detail deteksi di Hutan Desa, desa & radius 5 km (${M.near.length})`), ML2, y); y += 5;
  if (T.detailNote) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(MUTED); doc.text(pdfTxt(T.detailNote), ML2, y + 2); y += 6; }
  if (T.detail.length > 1) { doc.autoTable({ startY: y + 2, head: [T.detail[0].map(pdfTxt)], body: T.detail.slice(1).map(r => r.map(pdfTxt)), margin: { left: ML2, right: ML2 }, styles: { fontSize: 6.8, cellPadding: 1, textColor: INK, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: HEAD, textColor: 255 }, alternateRowStyles: { fillColor: [241, 244, 241] } }); y = doc.lastAutoTable.finalY + 6; }
  else { doc.setFontSize(9.5); doc.text('Tidak ada deteksi pada periode ini.', ML2, y + 6); y += 12; }
  doc.addPage('a4', 'portrait'); y = 18;
  H1('Lampiran B. Kamus data'); TAB(T.kamus, 8, { columnStyles: { 0: { cellWidth: 35 } } });
  H1('Lampiran C. Sumber data, metode & jejak audit'); sources(M).forEach(([k, v]) => P(`${k}. ${v}`, 8.8));
  const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight(); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(MUTED); doc.text(pdfTxt(`${M.title} | ${M.periodeTxt}`), 12, h - 8); doc.text(`Halaman ${i} dari ${n}`, w - 12, h - 8, { align: 'right' }); }
  doc.save(fname(M, 'pdf')); return n;
}

/* ---------------- Word ---------------- */
async function exportDOCX(M, F, T) {
  await loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js');
  const d = window.docx; const run = (t, o = {}) => new d.TextRun({ text: String(t ?? ''), font: 'Arial', size: o.size || 20, bold: o.bold, color: o.color });
  const P = (t, o = {}) => new d.Paragraph({ children: [run(t, o)], spacing: { after: 100 }, bullet: o.bullet ? { level: 0 } : undefined });
  const H = (t, lvl = 1) => new d.Paragraph({ children: [run(t, { bold: true, size: lvl === 0 ? 34 : 25, color: '22382B' })], spacing: { before: 220, after: 120 } });
  const img = async (c, wcm) => { const blob = await new Promise(ok => c.toBlob(ok, 'image/png')); const buf = await blob.arrayBuffer(); const wpx = wcm * 37.8; return new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.ImageRun({ data: buf, transformation: { width: wpx, height: wpx * c.height / c.width } })] }); };
  const TB = (t, size = 15) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: t.map((r, i) => new d.TableRow({ tableHeader: i === 0, children: r.map(v => new d.TableCell({ shading: i === 0 ? { fill: '22382B', type: d.ShadingType.CLEAR, color: 'auto' } : i % 2 === 0 ? { fill: 'F1F4F1', type: d.ShadingType.CLEAR, color: 'auto' } : undefined, margins: { top: 30, bottom: 30, left: 60, right: 60 }, children: [new d.Paragraph({ children: [run(v, { size, bold: i === 0, color: i === 0 ? 'FFFFFF' : undefined })] })] })) })) });
  const main = [H(M.title, 0), P(`Periode: ${M.periodeTxt} · Dibuat: ${new Date().toLocaleString('id-ID')} · Sumber: NASA FIRMS, ERA5 (Open-Meteo)`, { size: 17, color: '5B6A61' }),
    H('1. Ringkasan'), ...M.summary.map(s => P(s, { bullet: true })), H('2. Cuaca dan kaitannya dengan titik panas'), ...M.weatherTxt.map(s => P(s)),
    H('3. Peta'), await img(F.map, 15), await img(F.zoom, 15), H('4. Grafik'), await img(F.time, 16.5)];
  if (F.sensor) main.push(await img(F.sensor, 16.5)); if (F.season) main.push(await img(F.season, 16.5)); if (F.ctx) main.push(await img(F.ctx, 16.5));
  main.push(H('5. Rekapitulasi'), P('Tabel 1. Deteksi per zona dan sensor', { size: 17, color: '5B6A61' }), TB(T.zona), P(''), P(`Tabel 2. Deteksi dan curah hujan per ${M.unit}`, { size: 17, color: '5B6A61' }), TB(T.periode));
  if (T.petak.length > 1) main.push(P(''), P('Tabel 3. Petak patroli dengan titik panas', { size: 17, color: '5B6A61' }), TB(T.petak));
  main.push(H(`6. Kejadian api di desa & radius 5 km (${M.events.length})`));
  if (T.ev.length > 1) { if (M.events.length > CAP_EVENTS) main.push(P(`Ditampilkan ${CAP_EVENTS} kejadian (zona terdekat lebih dulu). Seluruh kejadian ada di file CSV.`, { size: 17, color: '5B6A61' })); main.push(TB(T.ev, 14)); } else main.push(P('Tidak ada kejadian pada periode ini.'));
  const app = [H(`Lampiran A. Detail deteksi di Hutan Desa, desa & radius 5 km (${M.near.length})`)]; if (T.detailNote) app.push(P(T.detailNote, { size: 17, color: '5B6A61' }));
  app.push(T.detail.length > 1 ? TB(T.detail, 13) : P('Tidak ada deteksi pada periode ini.'));
  const end = [H('Lampiran B. Kamus data'), TB(T.kamus, 16), H('Lampiran C. Sumber data, metode & jejak audit'), ...sources(M).map(([k, v]) => new d.Paragraph({ spacing: { after: 100 }, children: [run(k + '. ', { bold: true, size: 18 }), run(v, { size: 18 })] }))];
  const pg = { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } };
  const docx = new d.Document({ creator: 'Pantau Api Nanga Lauk', title: M.title, sections: [{ properties: { page: pg }, children: main }, { properties: { page: { ...pg, size: { orientation: d.PageOrientation.LANDSCAPE } } }, children: app }, { properties: { page: pg }, children: end }] });
  const blob = await d.Packer.toBlob(docx); dl(blob, fname(M, 'docx'));
}

/* ---------------- CSV ---------------- */
function exportCSV(M) {
  const cols = ['waktu_wib', 'tanggal_utc', 'jam_utc', 'latitude', 'longitude', 'sensor', 'satelit', 'keyakinan', 'frp_mw', 'suhu_kecerahan_k', 'siang_malam', 'zona', 'jarak_desa_km', 'petak', 'fungsi_kawasan', 'tutupan_2026', 'gambut', 'status_data', 'id_kejadian', 'luas_piksel_ha_bukan_luas_terbakar', 'kabupaten', 'uid'];
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [cols.join(',')].concat(M.rows.map(r => [r.wib, r.d, r.t, r.lat, r.lon, r.sen, r.sat, r.conf, r.frp, r.bt, r.dn, ZONES[r.z], r.km, r.pt, r.kw, r.tl, r.gb, r.st, r.ev, r.ha, r.kab, r.uid].map(q).join(',')));
  dl(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), fname(M, 'csv'));
}
function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 2000); }
function fname(M, ext) { return `laporan_titik_panas_${M.wilKey}_${M.a}_sd_${M.b}.${ext}`.replace('laporan_titik_panas', ext === 'csv' ? 'data_titik_panas' : 'laporan_titik_panas'); }

/* ---------------- UI ---------------- */
function presetRange(p) {
  const now = new Date(Date.now() + 7 * 36e5); const y = now.getUTCFullYear(), m = now.getUTCMonth(); const today = iso(now);
  const first = (yy, mm) => iso(new Date(Date.UTC(yy, mm, 1))), last = (yy, mm) => iso(new Date(Date.UTC(yy, mm + 1, 0)));
  switch (p) {
    case 'bulan_lalu': return [first(y, m - 1), last(y, m - 1)];
    case 'bulan_ini': return [first(y, m), today];
    case '3_bulan': return [first(y, m - 2), today];
    case 'tahun_lalu': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case 'tahun_ini': return [`${y}-01-01`, today];
    case '12_bulan': return [iso(new Date(Date.UTC(y - 1, m, now.getUTCDate() + 1))), today];
    case 'semua': return ['2001-01-01', today];
  }
  return null;
}
async function run(kind) {
  const a = $('#rpFrom').value, b = $('#rpTo').value;
  if (!a || !b || a > b) return status('Isi tanggal mulai dan selesai dengan benar (mulai tidak boleh setelah selesai).', true);
  const btns = document.querySelectorAll('#rpForm button'); btns.forEach(x => x.disabled = true);
  try {
    status('Mengambil data dan menyusun laporan…');
    const key = [a, b, $('#rpWil').value, $('#rpSen').value].join('|');
    if (!LAST || LAST.key !== key) { const M = await buildModel(a, b, $('#rpWil').value, $('#rpSen').value); const F = figures(M), T = tables(M); LAST = { key, M, F, T }; preview(M, F, T); }
    const { M, F, T } = LAST;
    if (kind === 'pdf') { status('Membuat PDF…'); const n = await exportPDF(M, F, T); status(`PDF selesai (${n} halaman) dan sudah diunduh.`); }
    else if (kind === 'docx') { status('Membuat Word…'); await exportDOCX(M, F, T); status('File Word selesai dan sudah diunduh.'); }
    else if (kind === 'csv') { exportCSV(M); status(`CSV berisi ${fmt(M.rows.length)} baris sudah diunduh.`); }
    else status(`Laporan siap: ${fmt(M.rows.length)} deteksi. Periksa pratinjau di bawah, lalu unduh PDF/Word/CSV.`);
    if (kind === 'lihat') $('#rpPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error(e); status('Gagal membuat laporan: ' + e.message + '. Coba muat ulang halaman.', true); }
  finally { btns.forEach(x => x.disabled = false); }
}
function init() {
  const sel = $('#rpPreset'); if (!sel) return;
  const apply = () => { const r = presetRange(sel.value); if (r) { $('#rpFrom').value = r[0] < '2001-01-01' ? '2001-01-01' : r[0]; $('#rpTo').value = r[1]; } LAST = null; };
  sel.addEventListener('change', apply); ['#rpFrom', '#rpTo', '#rpWil', '#rpSen'].forEach(s => $(s).addEventListener('change', () => { if (s === '#rpFrom' || s === '#rpTo') sel.value = 'kustom'; LAST = null; }));
  apply();
  $('#rpLihat').addEventListener('click', () => run('lihat')); $('#rpPdf').addEventListener('click', () => run('pdf'));
  $('#rpDocx').addEventListener('click', () => run('docx')); $('#rpCsv').addEventListener('click', () => run('csv'));
  $('#rpTo').max = iso(new Date(Date.now() + 7 * 36e5));
}
window.PantauLaporan = { buildModel, figures, tables, exportPDF, exportDOCX, presetRange };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
