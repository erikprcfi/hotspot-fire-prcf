/* Pantau Rimbak – PATROLI & TEMUAN (v9)
 * 1) Catat temuan patroli: api, penebangan, perburuan/jerat, perambahan, satwa, tumbuhan, patok, sampah – foto (maks. 3), GPS, waktu.
 *    Disimpan dulu di HP (IndexedDB 'fh-patroli'), lalu terkirim otomatis ke Google Sheets PRCF (lembar "Temuan Patroli") saat ada sinyal.
 * 2) Temuan: daftar & peta temuan sendiri (admin: semua tim) + unduh CSV / GeoJSON.
 * 3) Rekap patroli: dari jejak GPS yang sudah terekam (berbagi lokasi tim, maks. 30 hari) → jarak, durasi, luas jelajah, temuan,
 *    peta jejak; unduh Word, PDF, GPX.  Jarak dihitung dari titik GPS berurutan; titik dengan akurasi > 100 m atau
 *    loncatan > 150 km/jam diabaikan. Luas jelajah = jumlah sel 100 m × 100 m (1 ha) yang dilalui.
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const JENIS = [['Api / bekas terbakar', '#DC2626', '🔥'], ['Penebangan liar', '#92400E', '🪓'], ['Perburuan / jerat', '#7C2D12', '🪤'], ['Perambahan / pembukaan lahan', '#B45309', '🚜'],
  ['Satwa terlihat', '#15803D', '🦧'], ['Tumbuhan penting', '#4D7C0F', '🌿'], ['Patok / batas rusak', '#475569', '📍'], ['Sampah / pencemaran', '#0E7490', '🗑️'], ['Lainnya', '#6B7280', '•']];
const WARNA = Object.fromEntries(JENIS.map(j => [j[0], j[1]]));
const RINCI = {
  'Api / bekas terbakar': ['Api masih menyala', 'Bekas terbakar baru', 'Asap terlihat', 'Bekas terbakar lama'],
  'Penebangan liar': ['Tunggul baru', 'Kayu olahan / papan', 'Alat tebang ditemukan', 'Jalur sarad / jalan baru', 'Penebang ditemui'],
  'Perburuan / jerat': ['Jerat / perangkap', 'Senapan / selongsong', 'Pemburu ditemui', 'Satwa mati / terluka', 'Kamp pemburu'],
  'Perambahan / pembukaan lahan': ['Lahan baru dibuka', 'Tanaman ditanam', 'Pondok / bangunan baru', 'Patok liar'],
  'Satwa terlihat': ['Dilihat langsung', 'Suara', 'Jejak / kotoran', 'Sarang', 'Kamera jebak'],
  'Tumbuhan penting': ['Pohon induk', 'Tumbuhan berbunga / berbuah', 'Jenis dilindungi', 'Tumbuhan obat'],
  'Patok / batas rusak': ['Patok hilang', 'Patok rusak', 'Papan informasi rusak'],
  'Sampah / pencemaran': ['Sampah', 'Pencemaran air', 'Limbah / bahan kimia'],
  'Lainnya': [] };
const TINDAK = ['Didokumentasikan', 'Jerat / alat dibongkar', 'Pelaku ditegur / dibina', 'Dilaporkan ke KPH / BKSDA / aparat', 'Dipadamkan', 'Perlu tindak lanjut', 'Tidak ada tindakan'];
const Q = () => X().antrean('fh-patroli');
let SYNC = false;
async function sync() {
  const A = X(); if (SYNC || !A.akun() || navigator.onLine === false) return; SYNC = true;
  try { for (const r of (await Q().all()).filter(x => !x.terkirim)) {
      const j = await A.api({ aksi: 'patroli_kirim', temuan: r.data }, 60000).catch(() => null);
      if (j && j.ok) { r.terkirim = new Date().toISOString(); r.nfoto = (r.data.foto || []).length; r.data.foto = []; await Q().put(r); } else break; } }
  finally { SYNC = false; }
}
window.addEventListener('online', () => setTimeout(sync, 2000)); setTimeout(sync, 6000);

function chips(n, L, multi, c) { return `<div class="fa-chips" data-n="${n}" data-m="${multi ? 1 : ''}" style="--c:${c || '#B45309'}">${L.map(x => `<button type="button" aria-pressed="false">${esc(x)}</button>`).join('')}</div>`; }
function bindChips(el, cb) { el.querySelectorAll('.fa-chips').forEach(g => { if (g.dataset.b) return; g.dataset.b = 1; g.querySelectorAll('button').forEach(b => b.onclick = () => { if (!g.dataset.m) g.querySelectorAll('button').forEach(x => x !== b && x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); cb && cb(g.dataset.n); }); }); }
const val = (el, n) => [...el.querySelectorAll(`[data-n="${n}"] button[aria-pressed=true]`)].map(b => b.textContent).join('; ');

/* ---------- 1. catat temuan ---------- */
function formTemuan(box) {
  const A = X(); let pos = null, wid = null; const fotos = [];
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  box.innerHTML = `<div class="fa">
   <div class="fa-card"><b>Lokasi temuan</b><div class="fa-note" id="pGps">📡 Mencari posisi GPS…</div></div>
   <div><h5>Jenis temuan <i>*</i></h5>${chips('jenis', JENIS.map(j => j[0]), false, '#B45309')}</div>
   <div id="pRin" hidden><h5>Rincian</h5><div id="pRinC"></div></div>
   <div class="fa-2"><div><h5>Jumlah / ukuran</h5><input id="pJml" maxlength="80" placeholder="mis. 5 tunggul, 2 jerat, ± 0,5 ha"></div>
   <div id="pSpW"><h5>Nama jenis (satwa / tumbuhan)</h5><input id="pSp" maxlength="120" placeholder="mis. Orangutan (Pongo pygmaeus)"></div></div>
   <div><h5>Tindakan</h5>${chips('tindakan', TINDAK, true, '#15803D')}</div>
   <div><h5>Waktu temuan</h5><input type="datetime-local" id="pWkt" value="${now}"></div>
   <div><h5>Foto (maks. 3)</h5><div class="fa-ph" id="pPh"><label class="fa-add">📷<br>Ambil foto<input type="file" accept="image/*" capture="environment" hidden></label></div></div>
   <div><h5>Catatan</h5><textarea id="pCat" rows="3" maxlength="800" placeholder="Kondisi di lapangan, siapa yang ditemui, arah, dll."></textarea></div>
   <button class="fa-btn pri full" id="pKirim" style="--c:#B45309" disabled>Simpan & kirim temuan</button>
   <p class="fa-note">Temuan disimpan dulu di HP ini, lalu terkirim otomatis ke basis data PRCF begitu ada sinyal. Nama & email akun Anda tercatat sebagai pelapor. Lokasi satwa dilindungi hanya dapat dilihat Anda dan admin PRCF.</p></div>`;
  const $ = s => box.querySelector(s), kirim = $('#pKirim');
  const cek = () => { kirim.disabled = !val(box, 'jenis') || !pos; };
  bindChips(box, n => { if (n === 'jenis') { const j = val(box, 'jenis'), R = RINCI[j] || []; $('#pRin').hidden = !R.length; $('#pRinC').innerHTML = R.length ? chips('rincian', R, true, WARNA[j]) : ''; bindChips(box); $('#pSpW').style.opacity = /Satwa|Tumbuhan|Perburuan/.test(j) ? 1 : .55; } cek(); });
  const inp = $('#pPh input');
  inp.onchange = async () => { const f = inp.files[0]; inp.value = ''; if (!f || fotos.length >= 3) return; try { const d = await A.foto(f); fotos.push(d); const im = document.createElement('img'); im.src = d; $('#pPh').insertBefore(im, $('#pPh label')); if (fotos.length >= 3) $('#pPh label').style.display = 'none'; } catch (e) { } };
  if (navigator.geolocation) wid = navigator.geolocation.watchPosition(g => { const c = g.coords; if (pos && pos.ak < c.accuracy && Date.now() - pos.t < 6e4) return; pos = { la: c.latitude, lo: c.longitude, ak: c.accuracy, t: Date.now() };
    $('#pGps').innerHTML = `📍 ${pos.la.toFixed(5)}, ${pos.lo.toFixed(5)} <b>(±${Math.round(pos.ak)} m)</b>${pos.ak > 50 ? ' <span class="fa-err">– tunggu sebentar agar GPS lebih akurat</span>' : ''}`; cek(); },
    () => { $('#pGps').innerHTML = '<span class="fa-err">GPS tidak tersedia – aktifkan lokasi HP untuk mencatat temuan.</span>'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  kirim.onclick = () => A.perlu('Masuk dengan akun Pantau Rimbak untuk mencatat temuan patroli.', async () => {
    kirim.disabled = true; kirim.textContent = 'Menyimpan…';
    let wil = ''; try { if (window.FHWilayah) { const w = await FHWilayah.lookup(pos.la, pos.lo); wil = w ? FHWilayah.label(w) : ''; } } catch (e) { }
    const uid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2), wk = Date.parse($('#pWkt').value) || Date.now();
    const data = { uid, jenis: val(box, 'jenis'), rincian: val(box, 'rincian'), jumlah: $('#pJml').value.trim(), spesies: $('#pSp').value.trim(), tindakan: val(box, 'tindakan'), catatan: $('#pCat').value.trim(),
      la: +pos.la.toFixed(6), lo: +pos.lo.toFixed(6), ak: Math.round(pos.ak), waktu_ms: wk, hd: window.FHSiteNama ? FHSiteNama() : '', wilayah: wil, foto: fotos.map(d => d.split(',')[1]), perangkat: navigator.userAgent.slice(0, 120) };
    await Q().put({ id: uid, dibuat: new Date().toISOString(), terkirim: null, nfoto: fotos.length, data });
    if (wid != null) navigator.geolocation.clearWatch(wid);
    await sync(); X().pakai('patroli_temuan');
    box.innerHTML = `<div class="fa-card" style="text-align:center;padding:26px"><div style="font-size:44px">✅</div><h4>Temuan tersimpan</h4><p class="fa-note">${navigator.onLine === false ? 'Akan terkirim otomatis saat ada sinyal.' : 'Terkirim ke basis data PRCF.'}</p><button class="fa-btn pri" style="--c:#B45309;margin-top:12px" id="pLagi">Catat temuan lain</button></div>`;
    box.querySelector('#pLagi').onclick = () => formTemuan(box);
  });
  return () => { if (wid != null) navigator.geolocation.clearWatch(wid); };
}

/* ---------- 2. daftar & peta temuan ---------- */
let MAPS = [];
function peta(el, garis, titik) {
  if (!window.L) return; const m = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri, Maxar, Earthstar Geographics' }).addTo(m);
  const B = []; (garis || []).forEach(g => { if (g.length > 1) { L.polyline(g, { color: '#FACC15', weight: 4, opacity: .95 }).addTo(m); B.push(...g); } });
  (titik || []).forEach(t => { L.circleMarker([t.la, t.lo], { radius: 8, color: '#fff', weight: 2, fillColor: WARNA[t.jenis] || '#F97316', fillOpacity: 1 }).bindPopup(`<b>${esc(t.jenis)}</b><br>${esc(t.rincian || '')}<br><small>${esc(X().wib(t.t))}${t.pelapor ? ' · ' + esc(t.pelapor) : ''}</small>`).addTo(m); B.push([t.la, t.lo]); });
  if (B.length) m.fitBounds(L.latLngBounds(B).pad(.2), { maxZoom: 16 }); else { const s = window.FHSiteObj && FHSiteObj(); m.setView(s && s.pusat ? s.pusat : [0.96, 112.6], 12); }
  MAPS.push(m); setTimeout(() => m.invalidateSize(), 300); return m;
}
/* temuan milik Hutan Desa yang sedang dibuka: kolom hd sama; temuan lama tanpa kolom hd → Hutan Desa dengan pusat terdekat */
function diHD(t) { const s = window.FHSiteObj && FHSiteObj(); if (!s) return true; if (t.hd) return t.hd === s.hd_nama;
  const S = window.FHSites ? FHSites() : [s], J = x => x.pusat ? X().jarak(t.la, t.lo, x.pusat[0], x.pusat[1]) : 1e9; return S.reduce((a, b) => J(b) < J(a) ? b : a, s).id === s.id; }
async function daftar(box) {
  const A = X(); box.innerHTML = '<div class="fa"><div class="fa-card"><p class="fa-note">Memuat temuan…</p></div></div>';
  const lokal = (await Q().all().catch(() => [])).map(r => Object.assign({ t: r.data.waktu_ms, nfoto: r.nfoto, lokal: !r.terkirim }, r.data));
  let srv = [], admin = false, semua = box.dataset.semua === '1', galat = '';
  if (A.akun()) { try { const j = await A.api({ aksi: 'patroli_daftar', semua: semua ? 1 : 0 }, 30000); if (j.ok) { srv = j.temuan || []; admin = j.admin; } else galat = j.galat; } catch (e) { galat = 'Tidak ada koneksi – menampilkan temuan di HP ini.'; } }
  const peta_ = {}; srv.forEach(t => peta_[t.uid] = t); lokal.forEach(t => { if (!peta_[t.uid] || t.lokal) peta_[t.uid] = Object.assign({}, peta_[t.uid] || {}, t); });
  const HDN = window.FHSiteNama ? FHSiteNama() : '', L_ = Object.values(peta_).filter(diHD).sort((a, b) => b.t - a.t), per = {}; L_.forEach(t => per[t.jenis] = (per[t.jenis] || 0) + 1);
  box.innerHTML = `<div class="fa">
   ${admin ? `<div class="fa-tabs" style="position:static"><button data-s="0" aria-selected="${!semua}">Temuan saya</button><button data-s="1" aria-selected="${semua}">Semua tim (admin)</button></div>` : ''}
   ${galat ? `<p class="fa-err">${esc(galat)}</p>` : ''}
   <p class="fa-note">Hanya temuan di ${esc(HDN || 'Hutan Desa ini')}. Ganti Hutan Desa di Beranda untuk melihat lokasi lain.</p>
   <div class="fa-kpi"><div><small>Total temuan</small><b>${L_.length}</b></div><div><small>30 hari terakhir</small><b>${L_.filter(t => Date.now() - t.t <= 30 * 864e5).length}</b></div><div><small>Menunggu sinyal</small><b>${L_.filter(t => t.lokal).length}</b></div><div><small>Jenis temuan</small><b>${Object.keys(per).length}</b></div></div>
   <div class="fa-map" id="pMap"></div>
   <div class="fa-row"><button class="fa-btn" id="pCsv">Unduh CSV</button><button class="fa-btn" id="pGeo">Unduh GeoJSON</button></div>
   <div class="fa-card"><div class="fa-list">${L_.length ? L_.slice(0, 300).map(t => `<div class="fa-it"><span class="d" style="background:${WARNA[t.jenis] || '#999'}"></span><span class="m"><b>${esc(t.jenis)}</b><small>${esc([t.rincian, t.jumlah, t.spesies].filter(Boolean).join(' · '))}</small><small>${esc(A.wib(t.t))} · ${t.la.toFixed(5)}, ${t.lo.toFixed(5)}${t.pelapor ? ' · ' + esc(t.pelapor) : ''} · ${t.nfoto || 0} foto</small></span><span class="fa-pill" style="background:${t.lokal ? '#FEF3C7' : '#DCFCE7'};color:${t.lokal ? '#92400E' : '#166534'}">${t.lokal ? 'Menunggu sinyal' : 'Terkirim ✓'}</span></div>`).join('') : '<p class="fa-note">Belum ada temuan. Catat temuan pertama di tab "Catat temuan".</p>'}</div></div></div>`;
  box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { box.dataset.semua = b.dataset.s; daftar(box); });
  setTimeout(() => peta(box.querySelector('#pMap'), [], L_), 60);
  const nama = (A.EN() ? 'patrol_findings_' : 'temuan_patroli_') + String(HDN).replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_'), H = ['waktu_wib', 'jenis', 'rincian', 'jumlah', 'nama_jenis', 'tindakan', 'catatan', 'lintang', 'bujur', 'hutan_desa', 'pelapor', 'jumlah_foto'];
  const row = t => [A.wib(t.t), t.jenis, t.rincian, t.jumlah, t.spesies, t.tindakan, t.catatan, t.la, t.lo, t.hd, t.pelapor || '', t.nfoto || 0];
  const tr = v => A.EN() && window.FHLang ? FHLang.t(String(v ?? '')) : v;
  box.querySelector('#pCsv').onclick = () => { A.dl(new Blob([A.csv([H.map(h => A.EN() && window.FHLang ? FHLang.kolom(h) : h), ...L_.map(t => row(t).map(tr))])], { type: 'text/csv' }), nama + '.csv'); A.pakai('patroli_unduh'); };
  box.querySelector('#pGeo').onclick = () => { A.dl(new Blob([JSON.stringify({ type: 'FeatureCollection', features: L_.map(t => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lo, t.la] }, properties: Object.fromEntries(H.map((h, i) => [A.EN() && window.FHLang ? FHLang.kolom(h) : h, tr(row(t)[i])])) })) })], { type: 'application/geo+json' }), nama + '.geojson'); A.pakai('patroli_unduh'); };
}

/* ---------- 3. rekap patroli dari jejak GPS ---------- */
function olah(P, temuan) {
  const pts = P.map(p => ({ t: p[0], la: p[1], lo: p[2], ak: p[3] })).filter(p => p.ak == null || p.ak <= 100).sort((a, b) => a.t - b.t);
  const trip = []; let cur = null;
  pts.forEach(p => { if (!cur || p.t - cur.pts[cur.pts.length - 1].t > 30 * 6e4) { cur = { pts: [] }; trip.push(cur); } const q = cur.pts[cur.pts.length - 1];
    if (q) { const d = X().jarak(q.la, q.lo, p.la, p.lo), h = (p.t - q.t) / 36e5; if (h > 0 && d / 1000 / h > 150) return; } cur.pts.push(p); });
  const sel = new Set(); let km = 0, dur = 0;
  const T = trip.filter(t => t.pts.length > 1).map(t => { let d = 0; for (let i = 1; i < t.pts.length; i++) d += X().jarak(t.pts[i - 1].la, t.pts[i - 1].lo, t.pts[i].la, t.pts[i].lo);
    t.pts.forEach(p => sel.add(Math.floor(p.la / 0.0009) + ':' + Math.floor(p.lo / 0.0009)));
    const ms = t.pts[t.pts.length - 1].t - t.pts[0].t; km += d / 1000; dur += ms; return { mulai: t.pts[0].t, selesai: t.pts[t.pts.length - 1].t, km: d / 1000, jam: ms / 36e5, n: t.pts.length, pts: t.pts }; });
  const per = {}; (temuan || []).forEach(t => per[t.jenis] = (per[t.jenis] || 0) + 1);
  return { trip: T, km, jam: dur / 36e5, ha: sel.size, hari: new Set(T.map(t => new Date(t.mulai + 7 * 36e5).toISOString().slice(0, 10))).size, npts: pts.length, temuan: temuan || [], per };
}
async function rekap(box) {
  const A = X(); if (!A.akun()) { box.innerHTML = `<div class="fa"><div class="fa-card"><h4>Masuk untuk melihat rekap</h4><p class="fa-note">Rekap dihitung dari jejak GPS akun Anda (fitur berbagi lokasi tim).</p><button class="fa-btn pri" style="--c:#B45309;margin-top:10px" id="pMasuk">Masuk</button></div></div>`; box.querySelector('#pMasuk').onclick = () => A.perlu('Masuk untuk melihat rekap patroli.', () => rekap(box)); return; }
  const isoD = d => new Date(d - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), today = isoD(Date.now());
  box.innerHTML = `<div class="fa"><div class="fa-card"><h5>Periode</h5><div class="fa-chips" id="rPre" style="--c:#B45309">${[['1', 'Hari ini'], ['7', '7 hari'], ['30', '30 hari']].map(([v, t], i) => `<button type="button" data-d="${v}" aria-pressed="${i === 1}">${t}</button>`).join('')}</div>
    <div class="fa-row" style="margin-top:10px"><label>Dari<input type="date" id="rDari" max="${today}"></label><label>Sampai<input type="date" id="rSmp" max="${today}" value="${today}"></label></div>
    <div id="rSiapa"></div><button class="fa-btn pri full" id="rHit" style="--c:#B45309;margin-top:12px">Hitung rekap</button>
    <p class="fa-note">Jejak tersimpan maksimal 30 hari (UU 27/2022) dan hanya tercatat bila "Bagikan lokasi ke tim" aktif di Profil saat patroli.</p></div><div id="rOut"></div></div>`;
  const $ = s => box.querySelector(s); const setD = n => { $('#rDari').value = isoD(Date.now() - (n - 1) * 864e5); $('#rSmp').value = today; }; setD(7);
  $('#rPre').querySelectorAll('button').forEach(b => b.onclick = () => { $('#rPre').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); setD(+b.dataset.d); });
  let TIM = [];
  try { const j = await A.api({ aksi: 'tindak_daftar' }, 25000); if (j.ok && j.admin && j.tim.length) { TIM = j.tim; $('#rSiapa').innerHTML = `<h5 style="margin-top:12px">Anggota tim (admin)</h5><select id="rU">${j.tim.map(u => `<option value="${esc(u.id)}" ${u.id === A.akun().id ? 'selected' : ''}>${esc(u.nama)}</option>`).join('')}</select>`; } } catch (e) { }
  $('#rHit').onclick = async () => {
    const dari = Date.parse($('#rDari').value + 'T00:00:00+07:00'), smp = Date.parse($('#rSmp').value + 'T23:59:59+07:00'), u = A.akun(), target = $('#rU') ? $('#rU').value : u.id;
    if (!(dari <= smp)) return A.toast('Periode belum benar.');
    const out = $('#rOut'); out.innerHTML = '<div class="fa-card"><p class="fa-note">Menghitung…</p></div>'; $('#rHit').disabled = true;
    try { const [j, t] = await Promise.all([A.api({ aksi: 'posisi_jalur', target, dari, sampai: smp }, 60000), A.api({ aksi: 'patroli_daftar', dari, sampai: smp, semua: target !== u.id ? 1 : 0 }, 30000).catch(() => null)]);
      if (!j.ok) { out.innerHTML = `<div class="fa-card"><p class="fa-err">${esc(j.galat || 'Gagal')}</p></div>`; return; }
      const nama = target === u.id ? u.nama : (TIM.find(x => x.id === target) || {}).nama || '';
      const tem = t && t.ok ? (t.temuan || []).filter(x => (target === u.id || x.pelapor === nama) && diHD(x)) : [];
      const R = Object.assign(olah(j.titik || [], tem), { nama, dari, smp, hd: window.FHSiteNama ? FHSiteNama() : '' });
      tampil(out, R); A.pakai('patroli_rekap');
    } catch (e) { out.innerHTML = '<div class="fa-card"><p class="fa-err">Tidak ada koneksi. Rekap memerlukan internet.</p></div>'; }
    finally { $('#rHit').disabled = false; }
  };
}
function tampil(out, R) {
  const A = X(), n1 = A.n1, jam = h => `${Math.floor(h)} j ${Math.round(h % 1 * 60)} m`;
  out.innerHTML = `<div class="fa">
   <div class="fa-card"><h4>Rekap patroli ${esc(R.nama)}</h4><p class="fa-note">${esc(A.tgl(R.dari))} – ${esc(A.tgl(R.smp))}${R.hd ? ' · ' + esc(R.hd) : ''}</p></div>
   <div class="fa-kpi"><div><small>Jarak tempuh</small><b>${n1(R.km, 2)} km</b></div><div><small>Durasi patroli</small><b>${jam(R.jam)}</b></div><div><small>Hari patroli</small><b>${R.hari}</b></div><div><small>Luas jelajah</small><b>${n1(R.ha, 0)} ha</b></div></div>
   <div class="fa-kpi"><div><small>Perjalanan</small><b>${R.trip.length}</b></div><div><small>Titik GPS</small><b>${n1(R.npts, 0)}</b></div><div><small>Temuan</small><b>${R.temuan.length}</b></div><div><small>Kecepatan rata-rata</small><b>${R.jam ? n1(R.km / R.jam, 1) : 0} km/jam</b></div></div>
   ${R.trip.length ? '' : '<p class="fa-err">Tidak ada jejak GPS pada periode ini. Pastikan "Bagikan lokasi ke tim" aktif saat patroli.</p>'}
   <div class="fa-map" id="rMap"></div>
   <div class="fa-row"><button class="fa-btn pri" style="--c:#1D4ED8" id="rDoc">Word</button><button class="fa-btn pri" style="--c:#B3261E" id="rPdf">PDF</button><button class="fa-btn" id="rGpx">GPX</button></div>
   <div class="fa-2"><div class="fa-card"><h4>Perjalanan</h4><div class="fa-scroll"><table class="fa-tbl"><tr><th>Mulai</th><th>Durasi</th><th>Jarak</th></tr>${R.trip.map(t => `<tr><td>${esc(A.wib(t.mulai))}</td><td>${jam(t.jam)}</td><td class="n">${n1(t.km, 2)} km</td></tr>`).join('') || '<tr><td colspan="3">–</td></tr>'}</table></div></div>
   <div class="fa-card"><h4>Temuan</h4>${Object.entries(R.per).map(([k, v]) => `<div class="fa-bar"><span>${esc(k)}</span><i style="width:${v / Math.max(...Object.values(R.per)) * 50}%;background:${WARNA[k]}"></i><b>${v}</b></div>`).join('') || '<p class="fa-note">Tidak ada temuan tercatat.</p>'}</div></div>
   <p class="fa-note">Metode: jarak = jumlah jarak antartitik GPS berurutan (rumus haversine); titik dengan akurasi > 100 m dan loncatan > 150 km/jam diabaikan; jeda > 30 menit memisahkan perjalanan. Luas jelajah = jumlah sel ±100 m × 100 m yang dilalui. Sumber: jejak GPS aplikasi Pantau Rimbak.</p></div>`;
  setTimeout(() => peta(out.querySelector('#rMap'), R.trip.map(t => t.pts.map(p => [p.la, p.lo])), R.temuan), 60);
  out.querySelector('#rGpx').onclick = () => { const g = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Pantau Rimbak – Yayasan PRCF Indonesia" xmlns="http://www.topografix.com/GPX/1/1">\n${R.temuan.map(t => `<wpt lat="${t.la}" lon="${t.lo}"><time>${new Date(t.t).toISOString()}</time><name>${esc(t.jenis)}</name><desc>${esc([t.rincian, t.jumlah, t.spesies].filter(Boolean).join(' · '))}</desc></wpt>`).join('\n')}\n${R.trip.map((t, i) => `<trk><name>Patroli ${i + 1}</name><trkseg>${t.pts.map(p => `<trkpt lat="${p.la}" lon="${p.lo}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('')}</trkseg></trk>`).join('\n')}\n</gpx>`;
    A.dl(new Blob([g], { type: 'application/gpx+xml' }), fn(R, 'gpx')); };
  out.querySelector('#rPdf').onclick = () => pdf(R).catch(e => A.toast(e.message));
  out.querySelector('#rDoc').onclick = () => word(R).catch(e => A.toast(e.message));
}
const fn = (R, ext) => `${X().EN() ? 'patrol_summary' : 'rekap_patroli'}_${String(R.nama || 'tim').replace(/\W+/g, '_')}_${new Date(R.dari + 7 * 36e5).toISOString().slice(0, 10)}_${new Date(R.smp + 7 * 36e5).toISOString().slice(0, 10)}.${ext}`;
function baris(R) { const A = X(), n1 = A.n1;
  return { ring: [['Jarak tempuh', n1(R.km, 2) + ' km'], ['Durasi patroli', `${Math.floor(R.jam)} j ${Math.round(R.jam % 1 * 60)} m`], ['Hari patroli', String(R.hari)], ['Jumlah perjalanan', String(R.trip.length)], ['Luas jelajah (sel 1 ha)', n1(R.ha, 0) + ' ha'], ['Titik GPS', n1(R.npts, 0)], ['Jumlah temuan', String(R.temuan.length)]],
    trip: R.trip.map((t, i) => [String(i + 1), A.wib(t.mulai), A.wib(t.selesai), n1(t.km, 2) + ' km', String(t.n)]),
    tem: R.temuan.map(t => [A.wib(t.t), t.jenis, [t.rincian, t.jumlah, t.spesies].filter(Boolean).join(' · '), t.tindakan || '', `${t.la.toFixed(5)}, ${t.lo.toFixed(5)}`]) }; }
const METODE = 'Metode: jarak = jumlah jarak antartitik GPS berurutan (haversine); titik dengan akurasi > 100 m dan loncatan > 150 km/jam diabaikan; jeda > 30 menit memisahkan perjalanan. Luas jelajah = jumlah sel ±100 m × 100 m yang dilalui. Sumber: jejak GPS aplikasi Pantau Rimbak (disimpan maks. 30 hari, UU 27/2022) dan temuan patroli yang dicatat tim.';
async function pdf(R) {
  const A = X(); await A.lib(A.JSPDF); await A.lib(A.AUTOTABLE); const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }); if (window.FHLang) FHLang.pdf(doc);
  const B = baris(R); let y = 18;
  doc.setFillColor(11, 59, 44); doc.rect(0, 0, 210, 30, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Rekap Patroli', 16, 14); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`${R.nama} · ${A.tgl(R.dari)} – ${A.tgl(R.smp)}${R.hd ? ' · ' + R.hd : ''}`, 16, 22); doc.setTextColor(20); y = 40;
  doc.autoTable({ startY: y, head: [['Indikator', 'Nilai']], body: B.ring, theme: 'grid', headStyles: { fillColor: [30, 122, 88] }, styles: { fontSize: 9.5 }, margin: { left: 16, right: 16 } }); y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Perjalanan', 16, y); y += 3;
  doc.autoTable({ startY: y, head: [['No', 'Mulai', 'Selesai', 'Jarak', 'Titik GPS']], body: B.trip.length ? B.trip : [['–', '–', '–', '–', '–']], theme: 'striped', headStyles: { fillColor: [30, 122, 88] }, styles: { fontSize: 8.5 }, margin: { left: 16, right: 16 } }); y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Temuan patroli', 16, y); y += 3;
  doc.autoTable({ startY: y, head: [['Waktu', 'Jenis', 'Rincian', 'Tindakan', 'Koordinat']], body: B.tem.length ? B.tem : [['–', '–', '–', '–', '–']], theme: 'striped', headStyles: { fillColor: [180, 83, 9] }, styles: { fontSize: 8 }, margin: { left: 16, right: 16 } }); y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(doc.splitTextToSize(METODE, 178), 16, Math.min(y, 270));
  const np = doc.getNumberOfPages(); for (let i = 1; i <= np; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(`Pantau Rimbak · Yayasan PRCF Indonesia · dibuat ${A.wib(Date.now())} · ${i}/${np}`, 16, 290); }
  doc.save(fn(R, 'pdf'));
}
async function word(R) {
  const A = X(); await A.lib(A.DOCX); const d = window.docx, B = baris(R), TR = s => window.FHLang ? FHLang.t(String(s ?? '')) : String(s ?? '');
  const run = (t, o = {}) => new d.TextRun({ text: TR(t), font: 'Arial', size: o.size || 20, bold: o.bold, color: o.color });
  const p = (t, o = {}) => new d.Paragraph({ children: [run(t, o)], spacing: { after: 120 }, heading: o.h });
  const cell = (t, h) => new d.TableCell({ children: [new d.Paragraph({ children: [run(t, { bold: h, size: 18, color: h ? 'FFFFFF' : undefined })] })], shading: h ? { fill: '1E7A58' } : undefined, margins: { top: 60, bottom: 60, left: 90, right: 90 } });
  const tbl = (H, rows) => new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [new d.TableRow({ tableHeader: true, children: H.map(h => cell(h, true)) }), ...(rows.length ? rows : [H.map(() => '–')]).map(r => new d.TableRow({ children: r.map(c => cell(c)) }))] });
  const doc = new d.Document({ creator: 'Yayasan PRCF Indonesia – Pantau Rimbak', title: TR('Rekap Patroli'), sections: [{ children: [
    p('Rekap Patroli', { bold: true, size: 36, color: '0B3B2C', h: d.HeadingLevel.TITLE }), p(`${R.nama} · ${A.tgl(R.dari)} – ${A.tgl(R.smp)}${R.hd ? ' · ' + R.hd : ''}`, { color: '55665D' }),
    p('Ringkasan', { bold: true, size: 26, h: d.HeadingLevel.HEADING_1 }), tbl(['Indikator', 'Nilai'], B.ring),
    p('Perjalanan', { bold: true, size: 26, h: d.HeadingLevel.HEADING_1 }), tbl(['No', 'Mulai', 'Selesai', 'Jarak', 'Titik GPS'], B.trip),
    p('Temuan patroli', { bold: true, size: 26, h: d.HeadingLevel.HEADING_1 }), tbl(['Waktu', 'Jenis', 'Rincian', 'Tindakan', 'Koordinat'], B.tem),
    p(''), p(METODE, { size: 16, color: '55665D' }), p(`Pantau Rimbak · Yayasan PRCF Indonesia · dibuat ${A.wib(Date.now())}`, { size: 16, color: '888888' })] }] });
  A.dl(await d.Packer.toBlob(doc), fn(R, 'docx'));
}

/* ---------- halaman ---------- */
function open(tab) {
  const A = X(); if (!A || !window.openPage) return; A.pakai('patroli');
  MAPS.forEach(m => { try { m.remove(); } catch (e) { } }); MAPS = [];
  openPage('Patroli & temuan', 'Catat temuan · rekap jejak patroli', `<div class="fa" id="paW"><div class="fa-tabs" role="tablist"><button data-t="catat">Catat temuan</button><button data-t="daftar">Temuan</button><button data-t="rekap">Rekap patroli</button></div>
    <div id="paBox"></div><div class="fa-card"><b>Ada api / bekas terbakar di titik satelit?</b><p class="fa-note">Untuk titik panas dari satelit, buka titiknya di peta → <b>Laporkan hasil cek lapangan</b>. Untuk api tanpa titik satelit:</p><button class="fa-btn" style="margin-top:8px" id="paApi">Laporkan temuan kebakaran baru</button></div></div>`, () => {
    let stop = null; const box = document.getElementById('paBox');
    const pilih = t => { if (stop) { stop(); stop = null; } MAPS.forEach(m => { try { m.remove(); } catch (e) { } }); MAPS = [];
      document.querySelectorAll('#paW .fa-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
      if (t === 'catat') stop = formTemuan(box); else if (t === 'daftar') daftar(box); else rekap(box); };
    document.querySelectorAll('#paW .fa-tabs button').forEach(b => b.onclick = () => pilih(b.dataset.t));
    document.getElementById('paApi').onclick = () => window.openVerif && openVerif(null);
    pilih(tab || 'catat'); sync();
  });
}
window.FHPatroli = { open, sync, JENIS };
})();
