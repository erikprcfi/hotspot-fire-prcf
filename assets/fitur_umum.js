/* Pantau Rimbak – alat publik tambahan (gelombang 2)
 *  FHEkspor      : unduh titik panas NASA FIRMS di sekitar lokasi + laporan warga terverifikasi (CSV · GeoJSON · KML), tanpa data pribadi
 *  FHVerifStat   : statistik verifikasi lapangan (agregat publik dari Apps Script v15: statistik_verifikasi)
 *  FHLuringUmum  : simpan peta citra & titik panas di sekitar lokasi pilihan untuk dipakai tanpa sinyal
 */
(function () {
'use strict';
const X = () => window.FHAlat, NS = () => window.FHNasional;
const en = () => { try { return window.FHLang && FHLang.get() === 'en'; } catch (e) { return false; } };
const I = (a, b) => en() ? b : a;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const N0 = n => (n == null || !isFinite(n)) ? '–' : Math.round(n).toLocaleString(en() ? 'en-US' : 'id-ID');
const URL_ = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec', KUNCI = 'fh-prcf-2026-akun';
const post = async (body, ms = 25000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(URL_, { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ kunci: KUNCI }, body)) }); return await r.json(); } finally { clearTimeout(t); } };
const wibS = ms => { const d = new Date(ms + 7 * 36e5); return d.toISOString().slice(0, 16).replace('T', ' '); };
const page = (t, s, html, after) => window.openPage && openPage(t, s, `<div class="fa" id="fuW">${html}</div>`, after);
const $w = sel => document.querySelector('#fuW ' + sel);

/* lokasi pusat: lokasi pilihan (FHNasional) atau tengah peta */
function pusat() {
  const L = NS() && NS().lokasi(); if (L) return L;
  const m = window.FHApp && FHApp.map && FHApp.map(); if (m) { const c = m.getCenter(); return { lat: c.lat, lon: c.lng, label: `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)} (${I('tengah peta', 'map centre')})` }; }
  return null;
}
const lokBar = L => `<div class="fa-card" style="display:flex;gap:10px;align-items:center;padding:10px 12px"><span style="font-size:20px">${L && L.shp ? '🗺️' : '📍'}</span><span style="flex:1;min-width:0"><small style="display:block;opacity:.65;font-size:11.5px">${I('Lokasi', 'Location')}</small><b style="font-size:13.5px">${L ? esc(L.label) : I('Belum dipilih', 'Not chosen')}</b></span>${L && L.shp ? '' : `<button class="fa-btn" data-fl="gps" style="min-height:36px">GPS</button><button class="fa-btn" data-fl="peta" style="min-height:36px">${I('Tengah peta', 'Map centre')}</button>`}</div>`;
function bindLok(ulang) {
  document.querySelectorAll('#fuW [data-fl]').forEach(b => b.onclick = () => {
    if (b.dataset.fl === 'peta') { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return; const c = m.getCenter(); NS().setLok(c.lat, c.lng, 'peta').then(ulang); return; }
    if (!navigator.geolocation) return X().toast(I('GPS tidak tersedia', 'GPS unavailable'));
    b.textContent = '…'; navigator.geolocation.getCurrentPosition(p => NS().setLok(p.coords.latitude, p.coords.longitude, 'gps').then(ulang), () => { b.textContent = 'GPS'; X().toast(I('Izinkan akses lokasi lalu coba lagi', 'Allow location access and try again')); }, { enableHighAccuracy: true, timeout: 15000 });
  });
}

/* ================= 1. EKSPOR ================= */
const xml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
function baris(P, W) {   // satu tabel datar untuk semua format
  const R = P.map(p => ({ jenis: 'titik_panas', waktu_utc: new Date(p.when).toISOString().slice(0, 16).replace('T', ' '), waktu_wib: wibS(p.when), lintang: +p.la.toFixed(5), bujur: +p.lo.toFixed(5), satelit: p.sensor || '', frp_mw: p.frp != null ? p.frp : '', jarak_km: p.d != null ? +p.d.toFixed(2) : '', keterangan: '', sumber: 'NASA FIRMS NRT' }));
  W.forEach(r => R.push({ jenis: 'laporan_warga_terverifikasi', waktu_utc: new Date(r.t).toISOString().slice(0, 16).replace('T', ' '), waktu_wib: wibS(r.t), lintang: r.la, bujur: r.lo, satelit: '', frp_mw: '', jarak_km: r.d != null ? +r.d.toFixed(2) : '', keterangan: [r.jenis, r.catatan].filter(Boolean).join(' – '), sumber: 'Laporan warga, diverifikasi PRCF (lokasi ±100 m)' }));
  return R;
}
const KOL = ['jenis', 'waktu_utc', 'waktu_wib', 'lintang', 'bujur', 'satelit', 'frp_mw', 'jarak_km', 'keterangan', 'sumber'];
function keCSV(R) { const q = v => { v = String(v ?? ''); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; return '﻿' + [KOL.join(','), ...R.map(r => KOL.map(k => q(r[k])).join(','))].join('\r\n'); }
function keGeoJSON(R, meta) { return JSON.stringify({ type: 'FeatureCollection', name: meta.nama, keterangan: meta.ket, features: R.map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.bujur, r.lintang] }, properties: Object.fromEntries(KOL.filter(k => k !== 'lintang' && k !== 'bujur').map(k => [k, r[k]])) })) }); }
function keKML(R, meta) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(meta.nama)}</name><description>${xml(meta.ket)}</description>
<Style id="tp"><IconStyle><color>ff2e57e4</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/firedept.png</href></Icon></IconStyle></Style>
<Style id="lw"><IconStyle><color>ff0953b4</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>
${R.map(r => `<Placemark><name>${xml(r.jenis === 'titik_panas' ? 'Titik panas ' + r.waktu_wib + ' WIB' : 'Laporan warga ' + r.waktu_wib + ' WIB')}</name><styleUrl>#${r.jenis === 'titik_panas' ? 'tp' : 'lw'}</styleUrl><ExtendedData>${KOL.map(k => `<Data name="${k}"><value>${xml(r[k])}</value></Data>`).join('')}</ExtendedData><TimeStamp><when>${r.waktu_utc.replace(' ', 'T')}:00Z</when></TimeStamp><Point><coordinates>${r.bujur},${r.lintang},0</coordinates></Point></Placemark>`).join('\n')}
</Document></kml>`;
}
const jarak = (a, b, c, d) => { const R = 6371, t = x => x * Math.PI / 180, x = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const EK = { r: 25, h: 7, fmt: 'csv', lw: true };
function ekspor() {
  if (!window.openPage) return;
  page(I('Unduh data', 'Download data'), I('CSV · GeoJSON · KML – tanpa data pribadi', 'CSV · GeoJSON · KML – no personal data'), '<div class="fa-card"><p class="fa-note">…</p></div>', drawE);
}
async function drawE() {
  const W = document.getElementById('fuW'); if (!W) return; const L = pusat();
  W.innerHTML = `${lokBar(L && NS().lokasi() ? L : null)}
   <div class="fa-card"><h5>${I('Radius', 'Radius')}</h5><div class="fa-chips" data-g="r" style="--c:#0F766E">${[5, 25, 50, 100].map(r => `<button data-v="${r}" aria-pressed="${EK.r === r}">≤ ${r} km</button>`).join('')}</div>
   <h5 style="margin-top:12px">${I('Periode', 'Period')}</h5><div class="fa-chips" data-g="h" style="--c:#0F766E">${[[1, I('24 jam', '24 h')], [3, I('3 hari', '3 days')], [7, I('7 hari', '7 days')]].map(([h, t]) => `<button data-v="${h}" aria-pressed="${EK.h === h}">${t}</button>`).join('')}</div>
   <h5 style="margin-top:12px">${I('Format', 'Format')}</h5><div class="fa-chips" data-g="fmt" style="--c:#0F766E">${[['csv', 'CSV (Excel)'], ['geojson', 'GeoJSON'], ['kml', 'KML (Google Earth)']].map(([f, t]) => `<button data-v="${f}" aria-pressed="${EK.fmt === f}">${t}</button>`).join('')}</div>
   <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13.5px"><input type="checkbox" id="ekLw" ${EK.lw ? 'checked' : ''}> ${I('Sertakan laporan warga terverifikasi', 'Include verified community reports')}</label>
   <button class="fa-btn pri full" id="ekGo" style="--c:#0F766E;margin-top:14px" ${L && NS().lokasi() ? '' : 'disabled'}>${I('Unduh', 'Download')}</button><p class="fa-note" id="ekS" style="font-size:12.5px;margin:8px 0 0">${L && NS().lokasi() ? '' : I('Pilih lokasi dulu: GPS atau tengah peta.', 'Choose a location first: GPS or map centre.')}</p></div>
   <p class="fa-note" style="font-size:12px;margin:10px 4px">${I('Isi berkas: koordinat, waktu UTC & WIB, satelit, FRP dan jarak dari lokasi (NASA FIRMS near real-time, ±7 hari terakhir). Laporan warga hanya yang sudah diverifikasi admin PRCF, tanpa nama, email, atau foto pelapor, dengan lokasi dibulatkan ±100 m. Titik panas adalah deteksi panas dari satelit, belum tentu kebakaran.', 'Contents: coordinates, UTC & WIB time, satellite, FRP and distance from the location (NASA FIRMS near real-time, last ±7 days). Community reports are only those verified by PRCF admins, without reporter name, email or photo, with location rounded to ±100 m. Hotspots are satellite heat detections, not necessarily fires.')}</p>`;
  bindLok(drawE);
  W.querySelectorAll('[data-g]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { const k = g.dataset.g; EK[k] = k === 'fmt' ? b.dataset.v : +b.dataset.v; g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  W.querySelector('#ekLw').onchange = e => EK.lw = e.target.checked;
  const go = W.querySelector('#ekGo'); if (go) go.onclick = async () => {
    const Lx = NS().lokasi(), S = W.querySelector('#ekS'); if (!Lx) return; go.disabled = true; S.textContent = I('Mengambil data…', 'Fetching data…');
    try {
      const D = await NS().titik(Lx, EK.r), now = Date.now(), P = D.P.filter(p => now - p.when <= EK.h * 864e5 + 36e5);
      let Wl = [];
      if (EK.lw && window.FHLapor) { const A = await FHLapor.publik(); Wl = A.map(r => Object.assign({}, r, { d: jarak(Lx.lat, Lx.lon, r.la, r.lo) })).filter(r => Lx.shp ? true : r.d <= EK.r).filter(r => now - r.t <= Math.max(EK.h, 30) * 864e5); }
      const R = baris(P, Wl), tg = wibS(now).slice(0, 10), nama = `pantau-rimbak_${tg}_${EK.r}km_${EK.h}h`;
      const meta = { nama, ket: `Pantau Rimbak – ${Lx.label} – radius ${EK.r} km – ${EK.h} hari – NASA FIRMS (diperbarui ${D.upd || '-'} UTC)` };
      const blob = EK.fmt === 'csv' ? new Blob([keCSV(R)], { type: 'text/csv;charset=utf-8' }) : EK.fmt === 'geojson' ? new Blob([keGeoJSON(R, meta)], { type: 'application/geo+json' }) : new Blob([keKML(R, meta)], { type: 'application/vnd.google-earth.kml+xml' });
      X().dl(blob, nama + '.' + EK.fmt); S.textContent = `✓ ${N0(P.length)} ${I('titik panas', 'hotspots')} · ${N0(Wl.length)} ${I('laporan warga', 'community reports')}`; X().pakai && X().pakai('ekspor_' + EK.fmt);
    } catch (e) { S.textContent = I('Gagal mengambil data: ', 'Failed: ') + e.message; }
    go.disabled = false;
  };
}

/* ================= 2. STATISTIK VERIFIKASI ================= */
const HWARNA = { 'Api / kebakaran aktif': '#DC2626', 'Bekas terbakar': '#9A3412', 'Pembakaran lahan terkendali': '#D97706', 'Bukan api (sumber panas lain)': '#2563EB', 'Tidak dapat dicek': '#6B7280' };
const HEN = { 'Api / kebakaran aktif': 'Active fire', 'Bekas terbakar': 'Burn scar', 'Pembakaran lahan terkendali': 'Controlled land burning', 'Bukan api (sumber panas lain)': 'Not fire (other heat source)', 'Tidak dapat dicek': 'Could not be checked' };
const hN = h => en() ? (HEN[h] || h) : h;
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], BLNE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const bl = k => { const m = /^(\d{4})-(\d{2})$/.exec(k); return m ? (en() ? BLNE : BLN)[+m[2] - 1] + ' ' + m[1].slice(2) : k; };
function statistik() { page(I('Statistik verifikasi lapangan', 'Field verification statistics'), I('Hasil cek lapangan titik panas', 'Hotspot ground-check results'), '<div class="fa-card"><p class="fa-note">' + I('Memuat…', 'Loading…') + '</p></div>', muatS); }
async function muatS() {
  const W = document.getElementById('fuW'); if (!W) return; let j = null;
  try { j = await post({ aksi: 'statistik_verifikasi' }); } catch (e) { j = { ok: false, galat: 'koneksi' }; }
  if (!j || !j.ok) { W.innerHTML = `<div class="fa-card"><p style="margin:0;font-size:13.5px">${/koneksi/.test(j && j.galat) ? I('Tidak ada koneksi internet. Coba lagi saat ada sinyal.', 'No internet connection. Try again when online.') : I('Statistik akan tampil setelah server basis data diperbarui ke versi 15.', 'Statistics will appear once the database server is updated to version 15.')}</p></div>`; return; }
  const hasilT = Object.values(j.hasil || {}).reduce((a, b) => a + b, 0), dicek = Object.values(j.bulan || {}).reduce((a, b) => a + b.dicek, 0);
  const H = Object.entries(j.hasil || {}).sort((a, b) => b[1] - a[1]), mx = Math.max(1, ...H.map(x => x[1]));
  const B = Object.entries(j.bulan || {}).filter(([k]) => /^\d{4}-\d{2}$/.test(k)).sort().slice(-12), mb = Math.max(1, ...B.map(x => x[1].n));
  const api = (j.hasil || {})['Api / kebakaran aktif'] || 0, bekas = (j.hasil || {})['Bekas terbakar'] || 0, bukan = (j.hasil || {})['Bukan api (sumber panas lain)'] || 0;
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
  W.innerHTML = `<div class="fa-card"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
     ${[[N0(j.total), I('kejadian dipantau', 'events tracked')], [N0(dicek), I('dicek di lapangan', 'checked on the ground')], [pct(api + bekas, hasilT), I('terkonfirmasi api/bekas terbakar', 'confirmed fire/burn scar')], [j.respon_median_jam != null ? (j.respon_median_jam < 48 ? j.respon_median_jam + ' ' + I('jam', 'h') : Math.round(j.respon_median_jam / 24 * 10) / 10 + ' ' + I('hari', 'days')) : '–', I('median waktu respons', 'median response time')]].map(([v, t]) => `<div style="padding:10px;border-radius:12px;background:color-mix(in srgb,#0F766E 9%,transparent)"><b style="font-size:22px;display:block">${v}</b><small style="font-size:12px;opacity:.75">${t}</small></div>`).join('')}</div>
     ${hasilT ? `<p class="fa-note" style="font-size:12.5px;margin:10px 0 0">${I(`Dari ${N0(hasilT)} titik yang hasilnya dicatat, ${pct(bukan, hasilT)} ternyata bukan api. Angka ini membantu menilai seberapa sering titik panas satelit benar-benar kebakaran di wilayah dampingan.`, `Of ${N0(hasilT)} hotspots with a recorded result, ${pct(bukan, hasilT)} were not fire. This helps judge how often satellite hotspots are real fires in the supported areas.`)}</p>` : ''}</div>
   <div class="fa-card"><h4>${I('Hasil verifikasi', 'Verification result')}</h4>${H.length ? H.map(([h, n]) => `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(hN(h))}</span><b>${N0(n)}</b></div><div style="height:9px;border-radius:9px;background:color-mix(in srgb,currentColor 8%,transparent);overflow:hidden"><div style="height:100%;width:${n / mx * 100}%;background:${HWARNA[h] || '#64748B'}"></div></div></div>`).join('') : `<p class="fa-note" style="margin:0">${I('Belum ada hasil verifikasi yang dicatat. Tim lapangan mengisi hasil di menu Tindak lanjut kejadian.', 'No verification results recorded yet. Field teams record results in the Incident follow-up menu.')}</p>`}</div>
   ${B.length ? `<div class="fa-card"><h4>${I('Per bulan (12 bulan terakhir)', 'Monthly (last 12 months)')}</h4><svg viewBox="0 0 ${B.length * 40} 150" style="width:100%;height:auto" role="img" aria-label="${I('kejadian per bulan', 'events per month')}">${B.map(([k, v], i) => `<rect x="${i * 40 + 6}" y="${120 - v.n / mb * 110}" width="28" height="${Math.max(1, v.n / mb * 110)}" rx="3" fill="#99F6E4"><title>${bl(k)}: ${v.n}</title></rect><rect x="${i * 40 + 6}" y="${120 - v.dicek / mb * 110}" width="28" height="${Math.max(0, v.dicek / mb * 110)}" rx="3" fill="#0F766E"><title>${bl(k)} ${I('dicek', 'checked')}: ${v.dicek}</title></rect><text x="${i * 40 + 20}" y="140" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity=".65">${bl(k)}</text>`).join('')}</svg><p class="fa-note" style="font-size:12px;margin:4px 0 0"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#99F6E4"></span> ${I('kejadian', 'events')} &nbsp; <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#0F766E"></span> ${I('dicek di lapangan', 'ground-checked')}</p></div>` : ''}
   ${Object.keys(j.hd || {}).length ? `<div class="fa-card"><h4>${I('Per wilayah dampingan', 'By supported area')}</h4>${Object.entries(j.hd).sort((a, b) => b[1].n - a[1].n).map(([h, v]) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid var(--line,#eee);font-size:13px"><span>${esc(h)}</span><span>${N0(v.n)} · <b>${N0(v.dicek)}</b> ${I('dicek', 'checked')}</span></div>`).join('')}</div>` : ''}
   <p class="fa-note" style="font-size:11.5px;margin:10px 4px">${I('Sumber: catatan tindak lanjut tim lapangan Hutan Desa dampingan PRCF (agregat, tanpa data pribadi). Waktu respons = selisih waktu deteksi satelit dan waktu dicek di lapangan. Diperbarui', 'Source: PRCF-supported Village Forest field team follow-up records (aggregate, no personal data). Response time = time between satellite detection and ground check. Updated')} ${esc(j.diperbarui || '')} WIB.</p>`;
}

/* ================= 3. PETA LURING UMUM ================= */
function luring() { page(I('Peta luring', 'Offline map'), I('Tanpa sinyal', 'No signal'), '<div class="fa-card"><p class="fa-note">…</p></div>', drawL); }
async function drawL() {
  const W = document.getElementById('fuW'); if (!W || !window.FHLuring) return; const L = NS() && NS().lokasi(), Inf = FHLuring.info(), R = 25, E = L ? FHLuring.perkiraan(L.lat, L.lon, R) : null;
  W.innerHTML = `${lokBar(L)}<div class="fa-card"><p style="margin:0 0 10px;font-size:13.5px">${Inf ? `<b style="color:#2E7D32">✓ ${I('Tersimpan', 'Saved')}</b> · ${N0(Inf.n)} ${I('ubin citra', 'image tiles')} · ${new Date(Inf.t).toLocaleString(en() ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${Inf.gagal ? ` · ${Inf.gagal} ${I('gagal', 'failed')}` : ''}` : I('Belum ada peta luring di HP ini.', 'No offline map on this phone yet.')}</p>
   <button class="fa-btn pri full" id="luGoU" style="--c:#A16207" ${L ? '' : 'disabled'}>${L ? I(`Simpan peta & titik panas radius ${R} km (±${E.mb} MB)`, `Save map & hotspots within ${R} km (±${E.mb} MB)`) : I('Pilih lokasi dulu', 'Choose a location first')}</button>
   ${Inf ? `<button class="fa-btn full" id="luDelU" style="margin-top:8px">${I('Hapus peta luring', 'Delete offline map')}</button>` : ''}
   <p class="fa-note" style="font-size:12px;margin:10px 0 0">${I('Menyimpan citra satelit Sentinel-2 cloudless (EOX, zoom 8–14), titik panas terbaru di sekitar lokasi, batas wilayah, prakiraan dan orbit satelit. Setelah itu peta, titik panas dan kompas tetap bisa dibuka tanpa sinyal. Perbarui lagi saat ada sinyal agar titik panas tidak usang. Citra resolusi tinggi (Esri) hanya tersimpan untuk area yang pernah dibuka karena ketentuan layanannya melarang unduh massal.', 'Saves Sentinel-2 cloudless satellite imagery (EOX, zoom 8–14), the latest hotspots around the location, boundaries, forecasts and satellite orbits. The map, hotspots and compass then work without signal. Refresh when online so hotspots stay current. High-resolution imagery (Esri) is only kept for areas already viewed, as its terms forbid bulk download.')}</p></div>`;
  bindLok(drawL);
  const g = W.querySelector('#luGoU'); if (g) g.onclick = async () => { g.disabled = true;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist().catch(() => { });
      const files = ['data/titik_id/indeks.json', 'data/status.json', 'data/tle.json', 'data/wilayah/indeks.json', 'data/hotspots.json'];
      try { const ix = await fetch('data/titik_id/indeks.json', { cache: 'no-cache' }).then(r => r.json()); const d = R / 111, dl = R / (111 * Math.cos(L.lat * Math.PI / 180));
        for (let la = Math.floor(L.lat - d); la <= Math.floor(L.lat + d); la++) for (let lo = Math.floor(L.lon - dl); lo <= Math.floor(L.lon + dl); lo++) if (ix.ubin && ix.ubin[`${la}_${lo}`]) files.push(`data/titik_id/${la}_${lo}.json`); } catch (e) { }
      try { if (window.FHWilayah) await FHWilayah.lookup(L.lat, L.lon); } catch (e) { }
      await FHLuring.simpan(L.lat, L.lon, R, (d, t) => { g.textContent = `${I('Menyimpan…', 'Saving…')} ${Math.round(d / t * 100)}%`; }, files);
      X().pakai && X().pakai('luring_umum'); drawL();
    } catch (e) { g.textContent = I('Gagal: ', 'Failed: ') + e.message; g.disabled = false; } };
  const dl = W.querySelector('#luDelU'); if (dl) dl.onclick = async () => { await FHLuring.hapus(); drawL(); };
}

/* ================= 4. LAPOR (halaman) ================= */
function lapor() { page(I('Lapor kejadian', 'Report an incident'), I('Asap · api · pembukaan lahan', 'Smoke · fire · land clearing'), '<div id="lpHost"></div>', () => window.FHLapor && FHLapor.mount(document.getElementById('lpHost'))); }

window.FHEkspor = { open: ekspor, _test: { baris, keCSV, keGeoJSON, keKML } };
window.FHVerifStat = { open: statistik };
window.FHLuringUmum = { open: luring };
window.FHLaporPage = { open: lapor };
})();
