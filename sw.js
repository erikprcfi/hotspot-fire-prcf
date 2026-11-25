/* Service worker Pantau Rimbak Nanga Lauk: aplikasi bisa dipasang & tetap terbuka saat sinyal lemah.
   Kode dibuka langsung dari HP lalu diperbarui di belakang; halaman & data diambil dari jaringan dengan batas waktu, salinan terakhir dipakai saat sinyal lemah/tanpa sinyal. */
const VERSI = 'pa-v89';
const INTI = ['./', './index.html', './app.html', './assets/laporan.js', './assets/s2_20260810.jpg', './data/geo.json', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/logo_prcf.jpg', './assets/nasa_layers.js', './assets/riwayat_cuaca.js', './assets/udara.js', './assets/musiman.js', './assets/lokasi_saya.js', './assets/peta3d.js', './assets/logo_pr.svg', './assets/unduh.js', './assets/akun.js', './assets/citra.js', './assets/wilayah.js', './assets/meteogram.js', './assets/cari_lokasi.js', './assets/peta_ecmwf.js', './assets/lintasan.js', './assets/angin.js', './assets/kompas.js', './assets/vendor/satellite.min.js', './assets/verifikasi.js', './assets/luring.js', './assets/analisis.js', './assets/bahasa.js', './assets/kamus_en.js', './assets/beranda.js', './assets/bara.js', './assets/titik_id.js', './assets/web_peta.js', './assets/nasional.js', './assets/ikon3d.js', './kebijakan-privasi.html', './hapus-akun.html', './assets/native.js', './assets/posisi.js', './assets/tim.js', './assets/peringatan.js', './assets/web.js', './assets/alat.js', './assets/patroli.js', './assets/smart.js', './data/smart/nangalauk_dm.json', './assets/tindak.js', './assets/lapor.js', './assets/fitur_umum.js', './assets/admin.js', './assets/indikator.js', './assets/model_klhk.js', './assets/karbon.js', './assets/tutupan.js', './assets/shp.js', './assets/lahankritis.js', './assets/bulanan.js', './assets/musim_rawan.js', './assets/kartu_pengingat.js', './assets/unduhpeta.js', './syarat.html', './assets/latar_hutan_900.webp', './assets/latar_sungai_900.webp', './assets/latar_danau_900.webp', './assets/latar_menara_900.webp', './data/bara/kb.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
const KODE = 'pa-kode';   // cache kode tetap lintas versi: aplikasi langsung terbuka dari HP, lalu diperbarui diam-diam
// pasang tahan gangguan: satu berkas gagal tidak menggagalkan pembaruan aplikasi
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(VERSI).then(c => Promise.all(INTI.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok ? c.put(u, r) : null).catch(() => null))))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSI && x !== 'pa-tiles' && x !== KODE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
const tanpaQ = u => u.split('?')[0];
const cocok = req => caches.match(req).then(h => h || caches.match(tanpaQ(req.url || req)));
// jaringan dengan batas waktu: sinyal lemah tidak membuat aplikasi menunggu; jawaban yang datang terlambat tetap disimpan untuk berikutnya
function jaringanDulu(e, req, ms, simpanKe, kunci) {
  // isi dibaca utuh dulu: jawaban yang mengalir pelan (sinyal lemah) ikut kena batas waktu
  const net = fetch(req, { cache: 'no-cache' }).then(async r => { if (!r.ok) return r; const isi = await r.arrayBuffer(); const h = new Headers(r.headers); h.set('x-sw-t', String(Date.now()));
    caches.open(simpanKe).then(x => x.put(kunci, new Response(isi.slice(0), { status: r.status, statusText: r.statusText, headers: h }))); return new Response(isi, { status: r.status, statusText: r.statusText, headers: h }); });
  e.waitUntil(net.catch(() => null));
  const batas = new Promise(res => setTimeout(() => res(null), ms));
  return Promise.race([net.catch(() => null), batas]).then(r => r || cocok(kunci).then(h => h || net));
}
// kode: dari HP dulu (instan), perbarui di belakang; entri versi lama berkas yang sama dibuang
function hpDulu(e, req) {
  const upd = fetch(req).then(r => { if (r.ok) { const c = r.clone(); e.waitUntil(caches.open(KODE).then(async x => { await x.put(req, c); const p0 = tanpaQ(req.url); for (const k of await x.keys()) if (k.url !== req.url && tanpaQ(k.url) === p0) await x.delete(k); })); } return r; });
  e.waitUntil(upd.catch(() => null));
  return caches.open(KODE).then(x => x.match(req)).then(h => h || caches.match(req)).then(h => h || upd.catch(() => caches.match(tanpaQ(req.url))));
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sama = url.origin === location.origin;
  const isHalaman = sama && (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html'));
  const isData = sama && url.pathname.includes('/data/');
  const isTile = /arcgisonline|tile\.openstreetmap|tiles\.maps\.eox\.at/.test(url.host);
  if (isHalaman) { e.respondWith(jaringanDulu(e, req, 2500, VERSI, tanpaQ(req.url)).catch(() => caches.match('./app.html').then(h => h || caches.match('./')))); return; }
  if (isData) {   // data terbaru bila sinyal bagus; bila lambat >5 dtk pakai salinan terakhir (diperbarui begitu jaringan menjawab)
    if (url.pathname.includes('/data/export/') || url.pathname.includes('/data/archive/')) { e.respondWith(fetch(req).catch(() => cocok(req))); return; }
    const kunci = tanpaQ(req.url);
    if (/\/data\/(geo\.json|context\.geojson|wilayah\/|tutupan_lokal\/|hutan\/|klasifikasi\/|klhk\/|lahan_kritis\/|sumber\/|provenance\/|ubin\/)/.test(url.pathname)) {   // data jarang berubah: dari HP, diperbarui di belakang
      e.respondWith(cocok(kunci).then(h => { const j = jaringanDulu(e, req, 60000, VERSI, kunci); return h || j; })); return; }
    // data dinamis: salinan ≤15 menit dipakai langsung; selebihnya jaringan maks. 3 dtk lalu salinan terakhir
    if (url.searchParams.has('segar')) { e.respondWith(jaringanDulu(e, req, 20000, VERSI, kunci)); return; }   // tombol muat ulang: tunggu lebih lama demi data terbaru
    e.respondWith(cocok(kunci).then(h => { const t = h && +h.headers.get('x-sw-t'); if (h && t && Date.now() - t < 15 * 6e4) { e.waitUntil(jaringanDulu(e, req, 60000, VERSI, kunci).catch(() => null)); return h; } return jaringanDulu(e, req, 3000, VERSI, kunci); })); return;
  }
  if (isTile) { // ubin peta: cache dulu (hemat kuota), simpan yang baru
    e.respondWith(caches.open('pa-tiles').then(c => c.match(req.url).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit))));
    return;
  }
  if (sama) { e.respondWith(hpDulu(e, req)); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok && /cdnjs|jsdelivr|fonts\./.test(url.host)) { const c = r.clone(); caches.open(KODE).then(x => x.put(req, c)); } return r; })));
});

// peringatan dini: notifikasi dari server PRCF (Web Push, terenkripsi)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Pantau Rimbak', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pantau Rimbak', { body: d.body || '', icon: './assets/icons/icon-192.png', badge: './assets/icons/icon-192.png',
    tag: d.tag || 'fh', renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 300], data: { url: d.url || './app.html' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './app.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if (c.url.includes('app.html') && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
