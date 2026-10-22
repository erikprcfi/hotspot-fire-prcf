/* Service worker Fire Hotspot Nanga Lauk: aplikasi bisa dipasang & tetap terbuka saat sinyal lemah.
   Data (data/*.json) selalu diambil terbaru dari jaringan; salinan terakhir dipakai saat offline. */
const VERSI = 'pa-v8';
const INTI = ['./', './index.html', './app.html', './assets/laporan.js', './assets/s2_20260810.jpg', './data/geo.json', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/logo_prcf.jpg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSI).then(c => c.addAll(INTI)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSI).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isData = url.origin === location.origin && (url.pathname.includes('/data/') || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('app.html'));
  const isTile = /arcgisonline|tile\.openstreetmap/.test(url.host);
  if (isData) { // jaringan dulu, cadangan cache
    e.respondWith(fetch(req).then(r => { if (r.ok && !url.pathname.includes('/data/export/') && !url.pathname.includes('/data/archive/')) { const c = r.clone(); caches.open(VERSI).then(x => x.put(req.url.split('?')[0], c)); } return r; })
      .catch(() => caches.match(req.url.split('?')[0]).then(r => r || caches.match('./'))));
    return;
  }
  if (isTile) { // ubin peta: cache dulu (hemat kuota), simpan yang baru
    e.respondWith(caches.open('pa-tiles').then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok && (url.origin === location.origin || /cdnjs|jsdelivr|fonts\./.test(url.host))) { const c = r.clone(); caches.open(VERSI).then(x => x.put(req, c)); } return r; })));
});
