/* Pantau Rimbak – wilayah SHP pengguna umum: semua fitur otomatis (Indeks Siaga, prakiraan musim api, kekeringan, banjir,
 * arah asap, arsip area terbakar MODIS, kesehatan vegetasi, rekap musim, kalender musim api, titik rawan, rencana patroli).
 *
 * Paket analisis dihitung GitHub Actions (scripts/wilayah_umum.py) dengan skrip & sumber data yang SAMA seperti Hutan Desa
 * dampingan, disimpan di server Apps Script (bukan di repo publik) dan hanya terbaca oleh pemilik wilayah & anggota ruang kerjanya.
 * Modul ini: memilih wilayah (ruang kerja) pengguna, mengambil paketnya (wilayah_dinamis), menyimpannya untuk luring,
 * lalu menyajikan data paket ke alat-alat yang sama lewat jalur data/... (shim fetch, hanya aktif di mode wilayah SHP).
 */
(function () {
'use strict';
const EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } } };
const CACHE = 'pr-wilayah-v1';
const OK = ['siaga', 'prakmusim', 'kering', 'banjir', 'asap', 'bekasarsip', 'vegetasi', 'rekapmusim', 'musimapi', 'rawan', 'rencana'];
const BUKA = { siaga: () => FHIklim.siaga(), prakmusim: () => FHIklim.prakiraan(), kering: () => FHIklim.kering(), banjir: () => FHIklim.banjir(), asap: () => FHIklim.asap(),
  bekasarsip: () => FHIklim.bekasArsip(), vegetasi: () => FHIklim.vegetasi(), rekapmusim: () => FHIklim.rekap(), musimapi: () => FHMusimRawan.kalender(), rawan: () => FHMusimRawan.rawan(), rencana: () => FHMusimRawan.rencana() };
const INDEKS = { iklim: 'iklim', banjir: 'banjir', asap: 'asap', vegetasi: 'vegetasi', bekas_modis: 'bekas_modis', musim: 'musim', rekap_musim: 'rekap' };
const STATUS = [['#16A34A', 'Aman', 'Safe'], ['#CA8A04', 'Waspada', 'Watch'], ['#DC2626', 'Siaga', 'Alert']];

let DAFTAR = null, AID = null, PAKET = null, MEMUAT = null, LAPIS = null; const subs = [];
const akun = () => (window.FHAkun && FHAkun.masuk && FHAkun.masuk() && FHAkun.user && FHAkun.user()) || null;
const hd = () => { try { return !!(window.FHAksesHD && FHAksesHD()); } catch (e) { return false; } };
const kunciU = u => 'pr_wil_' + String((u && u.id) || '').slice(0, 12);
const urlCache = (u, aid) => new URL(`__wilayah/${String(u.id).slice(0, 12)}_${aid}.json`, location.href).href;
const aktif = () => !!(PAKET && PAKET.site && akun() && !hd());
const site = () => (aktif() ? PAKET.site : null);
const ubah = () => { subs.forEach(f => { try { f(); } catch (e) { } }); try { if (typeof CUR !== 'undefined' && CUR === 'dash' && typeof hubRender === 'function') hubRender(); } catch (e) { } };

/* ---------- paket: server → cache (luring) ---------- */
async function simpanCache(u, aid, p) { try { if (!window.caches) return; const c = await caches.open(CACHE); await c.put(urlCache(u, aid), new Response(JSON.stringify(p), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { } }
async function bacaCache(u, aid) { try { if (!window.caches) return null; const c = await caches.open(CACHE), r = await c.match(urlCache(u, aid)); return r ? await r.json() : null; } catch (e) { return null; } }
function rapikan(p) {   // cache pekerja tidak diperlukan di HP, kecuali deret cuaca (grafik hujan)
  if (!p || typeof p !== 'object') return null; const c = p._cache || {}; const o = Object.assign({}, p); delete o._cache; o.cuaca = c.cuaca || null; o.titik_kini = c.titik_kini || null; return o;
}
function pilihAid(L, A) {
  if (!L || !L.length) return null;
  const sim = LS.get(kunciU(akun()));
  if (A && A.mode === 'shp' && A.nama) {   // mode kode wilayah: analisis dengan nama area yang sama
    const n = String(A.nama).trim().toLowerCase(), m = L.filter(x => x.pemilik && String(x.nama).trim().toLowerCase() === n);
    if (m.length) return (m.find(x => x.aid === sim) || m[0]).aid;
  }
  if (sim && L.some(x => x.aid === sim)) return sim;
  if (A && A.mode === 'shp') { const own = L.filter(x => x.pemilik); if (own.length === 1) return own[0].aid; }
  return null;   // mode umum: ruang kerja dibuka sendiri oleh pengguna (Wilayah & tim)
}
async function muat(paksa) {
  if (MEMUAT && !paksa) return MEMUAT;
  MEMUAT = (async () => {
    const u = akun(); if (!u || !u.id || !u.token) { PAKET = null; DAFTAR = null; tandai(); return null; }
    const A = window.FHAkun.akses ? FHAkun.akses() : { mode: 'umum' };
    try { DAFTAR = JSON.parse(LS.get(kunciU(u) + '_d') || 'null'); } catch (e) { DAFTAR = null; }
    if (navigator.onLine !== false) {
      try { const j = await FHAkun.api({ aksi: 'ruang_daftar', id: u.id, token: u.token }, 30000); if (j && j.ok) { DAFTAR = j.ruang || []; LS.set(kunciU(u) + '_d', JSON.stringify(DAFTAR)); } } catch (e) { }
    }
    AID = pilihAid(DAFTAR, A);
    if (!AID) { PAKET = null; tandai(); return null; }
    const lama = await bacaCache(u, AID); if (lama) { PAKET = lama; tandai(); }
    if (navigator.onLine !== false) {
      try { const j = await FHAkun.api({ aksi: 'wilayah_dinamis', id: u.id, token: u.token, aid: AID }, 60000);
        if (j && j.ok && j.data) { PAKET = rapikan(j.data); await simpanCache(u, AID, PAKET); }
        else if (j && j.ok && !j.data && !lama) PAKET = { menunggu: true, aid: AID };
      } catch (e) { }
    }
    tandai(); return PAKET;
  })();
  try { return await MEMUAT; } finally { MEMUAT = null; }
}
async function paketAid(aid) {   // paket wilayah lain di daftar (untuk perbandingan) – tanpa mengganti wilayah aktif
  const u = akun(); if (!u) return null; if (aid === AID && PAKET && PAKET.site) return PAKET;
  const lama = await bacaCache(u, aid);
  if (navigator.onLine !== false) { try { const j = await FHAkun.api({ aksi: 'wilayah_dinamis', id: u.id, token: u.token, aid }, 60000); if (j && j.ok && j.data) { const p = rapikan(j.data); await simpanCache(u, aid, p); return p; } } catch (e) { } }
  return lama;
}
async function pilih(aid) { const u = akun(); if (!u) return; LS.set(kunciU(u), aid || null); PAKET = null; await muat(true); }

/* ---------- tampilan: lapisan batas wilayah di peta + render ulang beranda ---------- */
function tandai() {
  try { const MAP = window.FHApp && FHApp.map && FHApp.map();
    if (MAP && window.L) { if (LAPIS) { MAP.removeLayer(LAPIS); LAPIS = null; }
      const A = window.FHAkun && FHAkun.akses ? FHAkun.akses() : {};
      if (aktif() && A.mode !== 'shp') LAPIS = L.geoJSON(PAKET.site.hd, { style: { color: '#38BDF8', weight: 2.4, fillColor: '#38BDF8', fillOpacity: .08 }, interactive: false }).addTo(MAP); }
  } catch (e) { }
  ubah();
}
function titik() {
  const T = (aktif() && PAKET.hotspots && PAKET.hotspots.titik) || [];
  return T.map(p => Object.assign({}, p, { when: new Date(Date.UTC(+p.d.slice(0, 4), +p.d.slice(5, 7) - 1, +p.d.slice(8, 10), +String(p.t).slice(0, 2), +String(p.t).slice(2, 4))) }));
}
const waktu = t => { try { return new Date(t).toLocaleString(EN() ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'; } catch (e) { return t || ''; } };

function hub(el) {   // dipanggil dari hubUmum (mode umum / kode wilayah)
  if (!el) return; const h = el.querySelector('.hx-hero'); if (!h) return;
  const cta = h.querySelector('.hx-cta');
  if (cta && akun() && !cta.querySelector('[data-wl]')) { const b = document.createElement('button'); b.className = 'hx-btn'; b.dataset.wl = '1'; b.textContent = I('Wilayah & tim', 'Areas & team'); b.onclick = () => lembar(); cta.insertBefore(b, cta.children[1] || null); }
  if (cta && aktif() && window.FHWilAlat && !cta.querySelector('[data-wa]')) { const b = document.createElement('button'); b.className = 'hx-btn'; b.dataset.wa = '1'; b.textContent = I('Laporan & data', 'Reports & data'); b.onclick = () => FHWilAlat.menu(); cta.appendChild(b); }
  if (PAKET && PAKET.menunggu) {
    const st = h.querySelector('.hx-status small'); if (st) st.textContent = I('Analisis otomatis semua fitur untuk wilayah ini sedang disiapkan (± 3 jam setelah analisis lahan selesai).', 'Automatic analysis of all features for this area is being prepared (about 3 hours after the land analysis finishes).');
    return;
  }
  if (!aktif()) return;
  const P = PAKET, S = P.status || { level: 0, r25: 0, r5: 0, di_dalam: 0 }, c = STATUS[S.level] || STATUS[0];
  const nm = h.querySelector('.hx-site'); if (nm) nm.textContent = P.site.hd_nama;
  const mt = h.querySelector('.hx-meta'); if (mt) mt.textContent = I(`Wilayah Anda · ${Math.round(P.site.luas_ha || 0).toLocaleString('id-ID')} ha · dianalisis otomatis ${waktu(P.dibuat_utc)}`, `Your area · ${Math.round(P.site.luas_ha || 0).toLocaleString('en-GB')} ha · auto-analysed ${waktu(P.dibuat_utc)}`);
  const st = h.querySelector('.hx-status');
  if (st) { st.style.setProperty('--sc', c[0]);
    st.innerHTML = `<span class="hx-ring"><i></i></span><span><b>${EN() ? c[2] : c[1]} · ${I('titik panas 7 hari', 'hotspots 7 days')}</b><small>${S.di_dalam} ${I('di dalam wilayah', 'inside the area')} · ${S.r5} ${I('≤ 5 km', '≤ 5 km')} · ${S.r25} ${I('≤ 25 km dari batas', '≤ 25 km of the boundary')}</small></span>`; }
  const sub = (k, t) => { if (!t) return; el.querySelectorAll(`[data-sub="${k}"]`).forEach(e => { e.textContent = t; e.classList.add('v'); }); };
  el.querySelectorAll('.hx-t[data-hub]').forEach(t => { if (OK.includes(t.dataset.hub)) { t.classList.remove('hx-lock'); t.title = ''; } });
  const SUB = { siaga: I('Status risiko api hari ini', 'Fire risk today'), prakmusim: I('6 bulan · El Niño/La Niña', '6 months · El Niño/La Niña'), kering: I('Hari tanpa hujan & tanah', 'Dry days & soil'), banjir: I('Prakiraan 30 hari · GloFAS', '30-day forecast · GloFAS'),
    asap: I('Lintasan asap 24 jam', '24-h smoke paths'), bekasarsip: I('MODIS 2001–sekarang', 'MODIS 2001–now'), vegetasi: I('Kehijauan & kekeringan daun', 'Greenness & leaf dryness'), rekapmusim: I('Ringkasan per musim', 'Per-season summary'),
    musimapi: I('Bulan rawan & kapan bersiap', 'Risky months & when to prepare'), rawan: I('Lokasi terbakar ≥ 3 tahun', 'Burned in ≥ 3 years'), rencana: I('Titik tujuan + GPX/KML', 'Targets + GPX/KML') };
  Object.entries(SUB).forEach(([k, t]) => sub(k, t));
  if (P.musim && P.musim.musim && P.musim.musim.length) sub('musimapi', I('Rawan: ', 'Risky: ') + P.musim.musim.map(m => (EN() ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'])[m - 1]).join(', '));
  try { window.FHIklim && FHIklim.beranda(h, sub); } catch (e) { }
}

/* ---------- lembar "Wilayah & tim": pilih ruang kerja, kelola anggota ---------- */
async function lembar() {
  const u = akun(); if (!u) return window.FHAkun && FHAkun.layarMasuk && FHAkun.layarMasuk();
  openSheet(`<h3>${I('Wilayah & tim', 'Areas & team')}</h3><p class="sub">${I('Wilayah hasil unggah SHP Anda dan ruang kerja tim yang Anda ikuti. Semua fitur dihitung otomatis untuk wilayah yang dipilih.', 'Areas from your shapefile uploads and team workspaces you belong to. All features are computed automatically for the selected area.')}</p><div id="wlB"><p class="muted">${I('Memuat…', 'Loading…')}</p></div>`);
  const B = document.getElementById('wlB');
  if (navigator.onLine !== false) { try { await muat(true); } catch (e) { } }
  const L = DAFTAR || [];
  if (!L.length) { B.innerHTML = `<p>${I('Belum ada wilayah. Unggah batas wilayah (SHP) di <b>Analisis lahan & karbon</b>; setelah analisis selesai, semua fitur dihitung otomatis.', 'No areas yet. Upload an area boundary (shapefile) in <b>Land & carbon analysis</b>; once analysed, all features are computed automatically.')}</p><button class="btn pri full tap" data-an>${I('Unggah SHP', 'Upload shapefile')}</button>`;
    B.querySelector('[data-an]').onclick = () => { try { history.back(); } catch (e) { } setTimeout(() => window.FHApp && FHApp.hubGo('analisis'), 350); }; return; }
  B.innerHTML = L.map(x => `<div class="card" style="padding:12px 14px;margin:0 0 10px;${x.aid === AID ? 'border:2px solid #38BDF8' : ''}">
      <div style="display:flex;gap:10px;align-items:center"><div style="flex:1;min-width:0"><b style="display:block">${esc(x.nama)}</b><small class="muted">${Math.round(x.luas || 0).toLocaleString('id-ID')} ha · ${x.pemilik ? I('milik Anda', 'yours') : I('ruang kerja', 'workspace') + (x.pemilik_nama ? ' ' + esc(x.pemilik_nama) : '')} · ${x.peran === 'ketua' ? I('ketua', 'lead') : I('anggota', 'member')}</small></div>
      ${x.aid === AID ? `<span style="font-size:12px;font-weight:800;color:#0284C7">${I('Aktif', 'Active')}</span>` : `<button class="btn tap" style="padding:8px 14px" data-pilih="${esc(x.aid)}">${I('Buka', 'Open')}</button>`}</div>
      ${x.peran === 'ketua' ? `<button class="btn full tap" style="margin-top:8px;padding:10px 14px" data-tim="${esc(x.aid)}">${I('Anggota tim', 'Team members')}</button>` : ''}</div>`).join('') +
    (AID && !(FHAkun.akses && FHAkun.akses().mode === 'shp') ? `<button class="btn full tap" style="padding:10px 14px" data-tutup>${I('Tutup wilayah (kembali ke mode umum)', 'Close area (back to general mode)')}</button>` : '');
  if (aktif() && window.FHWilAlat) { const d = document.createElement('div'); d.innerHTML = `<button class="btn pri full tap" style="padding:11px 14px;margin:0 0 12px" data-wa2>${I('Laporan & data wilayah aktif', 'Reports & data for the active area')}</button>`; B.prepend(d.firstChild); B.querySelector('[data-wa2]').onclick = () => { try { history.back(); } catch (e) { } setTimeout(() => FHWilAlat.menu(), 320); }; }
  B.querySelectorAll('[data-pilih]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = I('Membuka…', 'Opening…'); await pilih(b.dataset.pilih); lembar(); toastMsg(PAKET && PAKET.site ? I('Wilayah dibuka', 'Area opened') : I('Data otomatis wilayah ini sedang disiapkan', 'Automatic data for this area is being prepared')); });
  B.querySelectorAll('[data-tim]').forEach(b => b.onclick = () => tim(b.dataset.tim));
  const t = B.querySelector('[data-tutup]'); if (t) t.onclick = async () => { const u2 = akun(); LS.set(kunciU(u2), '__umum'); AID = null; PAKET = null; tandai(); lembar(); };
}
async function tim(aid) {
  const u = akun(), x = (DAFTAR || []).find(r => r.aid === aid) || { nama: '' };
  openSheet(`<h3>${I('Anggota tim', 'Team members')}</h3><p class="sub">${esc(x.nama)} · ${I('anggota dapat membuka semua data otomatis wilayah ini dengan akunnya sendiri.', 'members can open all automatic data of this area with their own account.')}</p>
    <div id="wtB"><p class="muted">${I('Memuat…', 'Loading…')}</p></div>
    <div class="card" style="padding:12px 14px;margin-top:10px"><b>${I('Tambah anggota', 'Add member')}</b>
      <input id="wtE" type="email" inputmode="email" autocomplete="off" placeholder="email@contoh.org" style="width:100%;margin:8px 0;padding:10px;border-radius:10px;border:1px solid var(--line,#ddd);font:inherit">
      <select id="wtP" style="width:100%;margin:0 0 8px;padding:10px;border-radius:10px;border:1px solid var(--line,#ddd);font:inherit"><option value="anggota">${I('Anggota', 'Member')}</option><option value="ketua">${I('Ketua (dapat mengatur anggota)', 'Lead (can manage members)')}</option></select>
      <button class="btn pri full tap" id="wtT">${I('Tambahkan & kirim undangan', 'Add & send invitation')}</button></div>`);
  const B = document.getElementById('wtB');
  const daftar = async () => {
    try { const j = await FHAkun.api({ aksi: 'ruang_anggota', id: u.id, token: u.token, aid }, 30000);
      if (!j.ok) { B.innerHTML = `<p class="fa-err">${esc(j.galat || I('Gagal memuat', 'Failed to load'))}</p>`; return; }
      B.innerHTML = (j.anggota || []).map(m => `<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line,#eee)"><div style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(m.nama || m.email)}</b><small class="muted">${esc(m.email)} · ${m.pemilik ? I('pemilik', 'owner') : m.peran === 'ketua' ? I('ketua', 'lead') : I('anggota', 'member')}${m.terdaftar ? '' : ' · ' + I('belum mendaftar', 'not registered yet')}</small></div>${m.pemilik ? '' : `<button class="btn tap" data-hapus="${esc(m.email)}">${I('Keluarkan', 'Remove')}</button>`}</div>`).join('');
      B.querySelectorAll('[data-hapus]').forEach(b => b.onclick = async () => {
        if (b.dataset.yakin !== '1') { b.dataset.yakin = '1'; b.textContent = I('Yakin?', 'Sure?'); return; }
        b.disabled = true; const r = await FHAkun.api({ aksi: 'ruang_anggota_hapus', id: u.id, token: u.token, aid, email: b.dataset.hapus }, 30000).catch(() => null);
        toastMsg(r && r.ok ? I('Anggota dikeluarkan', 'Member removed') : (r && r.galat) || I('Gagal', 'Failed')); daftar(); });
    } catch (e) { B.innerHTML = `<p class="fa-err">${I('Perlu internet untuk mengatur tim.', 'Internet is needed to manage the team.')}</p>`; }
  };
  daftar();
  document.getElementById('wtT').onclick = async () => {
    const em = document.getElementById('wtE').value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return toastMsg(I('Email tidak valid', 'Invalid email'));
    const b = document.getElementById('wtT'); b.disabled = true;
    const r = await FHAkun.api({ aksi: 'ruang_anggota_set', id: u.id, token: u.token, aid, email: em, peran: document.getElementById('wtP').value }, 30000).catch(() => null);
    b.disabled = false; toastMsg(r && r.ok ? I('Anggota ditambahkan & diundang lewat email', 'Member added & invited by email') : (r && r.galat) || I('Gagal – periksa internet', 'Failed – check connection'));
    if (r && r.ok) { document.getElementById('wtE').value = ''; daftar(); }
  };
}

/* ---------- shim data/...: alat yang sama membaca paket wilayah (hanya saat wilayah SHP aktif) ---------- */
const asli = window.fetch.bind(window);
const jawab = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
window.fetch = async function (input, init) {
  try {
    if (aktif()) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const path = new URL(url, location.href).pathname, P = PAKET, sid = P.site.id;
      let m = path.match(/\/data\/(iklim|banjir|asap|vegetasi|bekas_modis|musim|rekap_musim)\/indeks\.json$/);
      if (m) {
        const k = INDEKS[m[1]]; let o = {};
        try { const r = await asli(input, init); if (r.ok) o = await r.json(); } catch (e) { }
        o = Object.assign({}, o, { lokasi: P[k] ? { [sid]: P[k] } : {}, diperbarui_utc: P.dibuat_utc });
        if (P.metode && P.metode[k] && typeof o.metode !== 'object') o.metode = P.metode[k];
        return jawab(o);
      }
      if (/\/data\/prakiraan\.json$/.test(path)) { let o = {}; try { const r = await asli(input, init); if (r.ok) o = await r.json(); } catch (e) { } return jawab(Object.assign({}, o, { lokasi: P.prakiraan ? { [sid]: P.prakiraan } : {} })); }
      if (path.indexOf(sid) >= 0 || path.indexOf(encodeURIComponent(sid)) >= 0) {
        if (/\/data\/rawan\//.test(path)) return P.rawan ? jawab(P.rawan) : new Response('', { status: 404 });
        if (/\/data\/bekas_modis\//.test(path)) return P.bekas_modis_geo ? jawab(P.bekas_modis_geo) : new Response('', { status: 404 });
        if (/\/data\/prakiraan\/fdrs_/.test(path)) return P.fdrs ? jawab(P.fdrs) : new Response('', { status: 404 });
        if (/\/data\/cuaca_/.test(path)) return P.cuaca ? jawab(P.cuaca) : new Response('', { status: 404 });
        return new Response('', { status: 404 });   // berkas Hutan Desa lain tidak ada untuk wilayah SHP
      }
    }
  } catch (e) { }
  return asli(input, init);
};

/* ---------- mulai ---------- */
function mulai() {
  if (!window.FHAkun) return;
  let tanda = '';   // muat ulang hanya bila akun / kode wilayah berubah
  const cek = () => { const u = akun(), A = FHAkun.akses ? FHAkun.akses() : {}; const t = (u ? u.id : '') + '|' + (A.mode || '') + '|' + (A.nama || '') + '|' + (A.situs || '');
    if (t !== tanda) { const awal = !tanda; tanda = t; if (!awal) muat(true).catch(() => { }); } };
  try { FHAkun.onChange(() => setTimeout(cek, 50)); } catch (e) { }
  cek();
  setTimeout(() => muat().catch(() => { }), 1200);
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false) muat(true).catch(() => { }); }, 30 * 60 * 1000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();

window.FHWilSaya = { aktif, site, paket: () => PAKET, titik, muat, pilih, lembar, hub, bisa: k => aktif() && OK.includes(k), buka: k => BUKA[k] && BUKA[k](), daftar: () => DAFTAR, aidAktif: () => AID, paketAid, onChange: f => subs.push(f) };
})();
