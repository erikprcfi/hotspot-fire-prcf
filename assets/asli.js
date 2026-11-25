/* Pantau Rimbak – lapisan aplikasi Android ASLI (Capacitor, kode dibundel di dalam APK).
 * Di browser biasa berkas ini hanya mendefinisikan FH_BASIS = '' dan tidak melakukan apa pun.
 *
 * Di aplikasi:
 *  - Seluruh tampilan & kode ada di dalam APK → aplikasi terbuka walau tanpa sinyal.
 *  - Data (data/*.json) diambil dari server data Pantau Rimbak; bila sinyal lemah/tidak ada dipakai salinan terakhir di HP,
 *    lalu salinan bawaan APK. Data yang datang terlambat tetap disimpan untuk pembukaan berikutnya.
 *  - Ubin peta yang disimpan lewat "Peta luring" dibaca dari penyimpanan HP.
 *  - Tombol Kembali Android menutup lembar/halaman; di beranda aplikasi diminimalkan.
 *  - Pembaruan kode diunduh diam-diam dan dipakai saat aplikasi dibuka berikutnya; bila versi baru gagal, otomatis kembali.
 */
(function () {
'use strict';
const C = window.Capacitor;
const ASLI = !!(C && C.isNativePlatform && C.isNativePlatform());
const BASIS = 'https://erikprcfi.github.io/hotspot-fire-prcf/';
window.FH_ASLI = ASLI;
window.FH_BASIS = ASLI ? BASIS : '';
if (!ASLI) return;
const P = n => (C.Plugins && C.Plugins[n]) || null;
document.documentElement.classList.add('fh-native', 'fh-asli');

/* ---------- 1. DATA: server → salinan HP → salinan bawaan APK ---------- */
const CN = 'pa-data-asli', f0 = window.fetch.bind(window);
const STATIS = /^\/data\/(geo\.json|context\.geojson|wilayah\/|tutupan_lokal\/|hutan\/|klasifikasi\/|klhk\/|lahan_kritis\/|sumber\/|provenance\/|ubin\/)/;
const BESAR = /^\/data\/(export|archive|titik|bara)\//;
function jalurData(u) { try { const x = new URL(u, location.href); if (x.origin === location.origin && x.pathname.startsWith('/data/')) return x; } catch (e) { } return null; }
const bawaan = x => f0(x.pathname, { cache: 'no-store' }).then(r => r.ok ? r : null).catch(() => null);
const simpanan = k => caches.open(CN).then(c => c.match(k)).catch(() => null);
function dariServer(url, kunci) {   // isi dibaca utuh agar batas waktu juga berlaku untuk unduhan yang mengalir pelan
  return f0(url, { cache: 'no-store' }).then(async r => {
    if (!r.ok) return r;
    const isi = await r.arrayBuffer(), h = new Headers(r.headers); h.set('x-pr-t', String(Date.now()));
    caches.open(CN).then(c => c.put(kunci, new Response(isi.slice(0), { status: 200, headers: h }))).catch(() => { });
    return new Response(isi, { status: r.status, statusText: r.statusText, headers: h });
  });
}
const luring = () => new Response('{"galat":"luring"}', { status: 504, statusText: 'Luring', headers: { 'Content-Type': 'application/json' } });
const tunggu = (p, ms) => Promise.race([p.catch(() => null), new Promise(res => setTimeout(() => res(null), ms))]);
async function ambilData(x) {
  const path = x.pathname, url = BASIS + path.slice(1) + (x.search || ''), kunci = BASIS + path.slice(1);
  const segar = x.searchParams.has('segar');
  if (BESAR.test(path)) { const r = await tunggu(dariServer(url, kunci), 30000); return r || (await simpanan(kunci)) || luring(); }
  const net = dariServer(url, kunci); net.catch(() => { });   // tandai tertangani sejak awal (pemeriksaan salinan HP berjalan lebih dulu)
  if (!segar && STATIS.test(path)) { const h = (await simpanan(kunci)) || (await bawaan(x)); if (h) { net.catch(() => { }); return h; } return net.catch(luring); }
  let h = null;
  if (!segar) { h = await simpanan(kunci); const t = h && +h.headers.get('x-pr-t'); if (h && t && Date.now() - t < 15 * 6e4) { net.catch(() => { }); return h; } }
  /* sudah ada salinan (di HP atau bawaan APK) → tunggu server paling lama 1,5 dtk; data yang datang belakangan tetap disimpan
     dan dimuat ulang otomatis oleh pemeriksaan status, jadi pengguna tidak menatap layar kosong saat sinyal lemah */
  const cad = segar ? null : (h || await bawaan(x));
  const r = await tunggu(net, segar ? 20000 : (cad ? 1500 : 3000));
  if (r && r.ok) return r;
  return (await simpanan(kunci)) || cad || (await bawaan(x)) || net.catch(luring);
}
window.fetch = function (input, init) {
  const u = typeof input === 'string' ? input : (input && input.url);
  const x = u && jalurData(u);
  if (!x || (init && init.method && init.method.toUpperCase() !== 'GET')) return f0(input, init);
  return ambilData(x);
};
window.FH_DATA_URL = u => /^data\//.test(u) ? BASIS + u : u;

/* ---------- 2. PETA: ubin luring dari penyimpanan HP; ubin data/ dari server ---------- */
const UBIN_LURING = /arcgisonline|tile\.openstreetmap|tiles\.maps\.eox\.at/;
function tambalLeaflet(L) {
  if (!L || !L.TileLayer || L.TileLayer.__asli) return; L.TileLayer.__asli = true;
  L.TileLayer.prototype.createTile = function (coords, done) {
    const tile = document.createElement('img');
    L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));
    if (this.options.crossOrigin || this.options.crossOrigin === '') tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
    if (typeof this.options.referrerPolicy === 'string') tile.referrerPolicy = this.options.referrerPolicy;
    tile.alt = ''; tile.setAttribute('role', 'presentation');
    let url = this.getTileUrl(coords); const x = jalurData(url); if (x) url = BASIS + x.pathname.slice(1) + x.search;
    if (UBIN_LURING.test(url) && 'caches' in window) {
      caches.open('pa-tiles').then(c => c.match(url)).then(h => h ? h.blob() : null).then(b => {
        if (b && b.size) { const o = URL.createObjectURL(b); tile.addEventListener('load', () => URL.revokeObjectURL(o), { once: true }); tile.src = o; }
        else tile.src = url;
      }).catch(() => { tile.src = url; });
    } else tile.src = url;
    return tile;
  };
}
let _L = window.L;
try { Object.defineProperty(window, 'L', { configurable: true, enumerable: true, get() { return _L; }, set(v) { _L = v; try { tambalLeaflet(v); } catch (e) { } } }); } catch (e) { }
if (_L) tambalLeaflet(_L);

/* ---------- 3. Tanpa service worker (kode sudah di dalam APK) ---------- */
try {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => new Promise(() => { });
    navigator.serviceWorker.getRegistrations && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => { });
  }
} catch (e) { }

/* ---------- 4. Tampilan aplikasi: sembunyikan tautan khusus situs ---------- */
const st = document.createElement('style');
st.textContent = 'html.fh-asli a[href^="index.html?web"],html.fh-asli a[href^="pasang.html"],html.fh-asli .hanya-web{display:none!important}html.fh-asli #rowVersi{display:flex!important}';
(document.head || document.documentElement).appendChild(st);

/* ---------- 5. Tombol Kembali Android ---------- */
const App = P('App');
if (App && App.addListener) App.addListener('backButton', ev => {
  const sheet = document.querySelector('.ak-sheet');
  if (sheet && !document.querySelector('.ak:not(.ak-sheet)')) { sheet.remove(); return; }
  if (ev && ev.canGoBack) { history.back(); return; }
  App.minimizeApp ? App.minimizeApp() : App.exitApp();
});

/* ---------- 6. Pembaruan kode otomatis (paket diperiksa saat ada sinyal) ---------- */
const UP = P('CapacitorUpdater');
let VERSI = null;
const versiKini = () => VERSI ? Promise.resolve(VERSI) : f0('versi.json', { cache: 'no-store' }).then(r => r.json()).then(j => (VERSI = j)).catch(() => ({ versi: '0' }));
let ST = { tahap: 'belum diperiksa' }, SIAP_ID = null, JALAN = null;
const fmtV = v => { v = String(v || ''); return v.length === 12 ? `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)} ${v.slice(8, 10)}.${v.slice(10, 12)} UTC` : v; };
function catat(o) { ST = Object.assign({}, ST, o, { waktu: Date.now() }); try { localStorage.setItem('pr_pembaruan', JSON.stringify(ST)); } catch (e) { } tulisVersi(); }
function tulisVersi() {
  const el = document.getElementById('verTxt'); if (!el) return;
  versiKini().then(k => { el.textContent = `2.0 · isi ${fmtV(k.versi)} · ${ST.tahap}`; });
}
const toast = m => { try { window.toastMsg ? window.toastMsg(m) : 0; } catch (e) { } };
window.FHAsli = { versi: versiKini, periksa: () => periksaPembaruan(true), status: () => ST, pasang: () => pasangSekarang() };
function siap() { try { UP && UP.notifyAppReady && UP.notifyAppReady(); } catch (e) { } }
async function pasangSekarang() {   // pakai versi baru sekarang juga (aplikasi dimuat ulang ±1 dtk)
  if (!UP || !SIAP_ID) return false;
  try { await UP.set({ id: SIAP_ID }); return true; } catch (e) { catat({ tahap: 'gagal memasang: ' + (e && e.message || e) }); return false; }
}
function periksaPembaruan(manual) { if (!JALAN) JALAN = periksa_(manual).finally(() => { JALAN = null; }); return JALAN; }
async function periksa_(manual) {
  if (!UP) { catat({ tahap: 'pembaruan otomatis tidak tersedia' }); return; }
  if (navigator.onLine === false) { catat({ tahap: 'menunggu sinyal' }); return; }
  try {
    const kini = await versiKini();
    catat({ tahap: 'memeriksa…' });
    const r = await tunggu(f0(BASIS + 'aplikasi/paket/terbaru.json?t=' + Date.now(), { cache: 'no-store' }), 15000);
    if (!r || !r.ok) { catat({ tahap: 'server pembaruan tidak terjangkau' }); return; }
    const j = await r.json();
    if (!j || !j.versi || !j.url || !(+j.versi > +kini.versi)) { catat({ tahap: 'sudah versi terbaru' }); if (manual) toast('Aplikasi sudah versi terbaru'); return; }
    const pi = P('Perangkat') && P('Perangkat').status ? await P('Perangkat').status().catch(() => ({})) : {};
    if (j.min_kode && pi.kode && +pi.kode < +j.min_kode) { catat({ tahap: 'perlu memasang APK terbaru' }); return; }   // perlu versi APK lebih baru
    let id = null;
    try { const lst = await UP.list(); const b = (lst.bundles || []).find(b => b.version === String(j.versi) && b.status !== 'error'); if (b) id = b.id; } catch (e) { }
    if (!id) {
      catat({ tahap: 'mengunduh pembaruan ' + fmtV(j.versi) + '…' });
      const u = /^https?:/.test(j.url) ? j.url : BASIS + j.url, opsi = { url: u, version: String(j.versi), checksum: String(j.sha256 || '').toLowerCase() };   // checksum (sha256) wajib bagi komponen pembaruan
      let b = null, galat = null;
      for (let k = 0; k < 3 && !b; k++) {   // sinyal putus-putus: coba lagi hingga 3 kali
        try { b = await UP.download(opsi); } catch (e) { galat = e; if (k < 2) await new Promise(r => setTimeout(r, 8000 * (k + 1))); }
      }
      if (!b && galat) throw galat;
      id = b && b.id;
    }
    if (!id) { catat({ tahap: 'unduhan pembaruan gagal' }); return; }
    await UP.next({ id }); SIAP_ID = id;
    catat({ tahap: 'pembaruan siap – terpasang saat aplikasi dibuka lagi', siap: j.versi });
    toast('Pembaruan aplikasi siap · ketuk Profil → Versi aplikasi untuk memasang sekarang');
  } catch (e) { catat({ tahap: 'pembaruan ditunda: ' + [e && e.message || e, e && e.data && e.data.message, e && e.code].filter(Boolean).join(' · ').replace(/https?:\/\/\S+/g, '(paket)').slice(0, 160) }); console.warn('Pembaruan aplikasi ditunda:', e && e.message); }
}
document.addEventListener('click', ev => {
  const b = ev.target && ev.target.closest && ev.target.closest('#rowVersi'); if (!b) return;
  if (SIAP_ID) { toast('Memasang pembaruan…'); setTimeout(pasangSekarang, 300); return; }
  toast('Memeriksa pembaruan…'); periksaPembaruan(true);
});
document.addEventListener('DOMContentLoaded', tulisVersi);
// "aplikasi siap" dikirim begitu inti aplikasi (FHApp) berjalan – tidak menunggu semua gambar/peta, agar HP lambat tidak memicu pembatalan pembaruan
(function tungguSiap(n) { if (window.FHApp) { siap(); return; } if (n < 140) setTimeout(() => tungguSiap(n + 1), 100); })(0);   /* tanpa FHApp dalam 14 dtk = versi rusak → biarkan dibatalkan otomatis */
addEventListener('load', () => setTimeout(periksaPembaruan, 4000));
addEventListener('online', () => setTimeout(periksaPembaruan, 5000));
if (App && App.addListener) App.addListener('resume', () => setTimeout(periksaPembaruan, 4000));
})();
