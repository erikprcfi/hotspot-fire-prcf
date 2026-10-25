/* Service worker Fire Hotspot Nanga Lauk: aplikasi bisa dipasang & tetap terbuka saat sinyal lemah.
   Data (data/*.json) selalu diambil terbaru dari jaringan; salinan terakhir dipakai saat offline. */
const VERSI = 'pa-v41';
const INTI = ['./', './index.html', './app.html', './assets/laporan.js', './assets/s2_20260810.jpg', './data/geo.json', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/logo_prcf.jpg', './assets/nasa_layers.js', './assets/riwayat_cuaca.js', './assets/udara.js', './assets/musiman.js', './assets/lokasi_saya.js', './assets/peta3d.js', './assets/logo_fh.svg', './assets/unduh.js', './assets/akun.js', './assets/citra.js', './assets/wilayah.js', './assets/meteogram.js', './assets/cari_lokasi.js', './assets/peta_ecmwf.js', './assets/lintasan.js', './assets/angin.js', './assets/kompas.js', './assets/vendor/satellite.min.js', './assets/verifikasi.js', './assets/luring.js', './assets/analisis.js', './assets/beranda.js', './assets/bara.js', './assets/peringatan.js', './assets/bahasa.js', './data/bara/kb.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
// pasang tahan gangguan: satu berkas gagal tidak menggagalkan pembaruan aplikasi
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(VERSI).then(c => Promise.all(INTI.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok ? c.put(u, r) : null).catch(() => null))))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSI && x !== 'pa-tiles').map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isData = url.origin === location.origin && (url.pathname.includes('/data/') || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('app.html'));
  const isTile = /arcgisonline|tile\.openstreetmap|tiles\.maps\.eox\.at/.test(url.host);
  if (isData) { // jaringan dulu, cadangan cache
    e.respondWith(fetch(req).then(r => { if (r.ok && !url.pathname.includes('/data/export/') && !url.pathname.includes('/data/archive/')) { const c = r.clone(); caches.open(VERSI).then(x => x.put(req.url.split('?')[0], c)); } return r; })
      .catch(() => caches.match(req.url.split('?')[0]).then(r => r || caches.match('./'))));
    return;
  }
  if (isTile) { // ubin peta: cache dulu (hemat kuota), simpan yang baru
    e.respondWith(caches.open('pa-tiles').then(c => c.match(req.url).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit))));
    return;
  }
  if (url.origin === location.origin) {   // kode aplikasi: jaringan dulu (selalu versi terbaru), cadangan cache bila tanpa sinyal
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSI).then(x => x.put(req, c)); } return r; }).catch(() => caches.match(req).then(h => h || caches.match(req.url.split('?')[0]))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok && (url.origin === location.origin || /cdnjs|jsdelivr|fonts\./.test(url.host))) { const c = r.clone(); caches.open(VERSI).then(x => x.put(req, c)); } return r; })));
});

// peringatan dini: notifikasi dari server PRCF (Web Push, terenkripsi)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Fire Hotspot', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Fire Hotspot', { body: d.body || '', icon: './assets/icons/icon-192.png', badge: './assets/icons/icon-192.png',
    tag: d.tag || 'fh', renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 300], data: { url: d.url || './app.html' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './app.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if (c.url.includes('app.html') && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
