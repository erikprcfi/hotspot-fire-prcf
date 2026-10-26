/* Fire Hotspot – penyesuaian saat berjalan di aplikasi Android (Capacitor). Di browser biasa berkas ini tidak melakukan apa pun.
 * - Unduhan (CSV, SHP, PDF, JSON) → disimpan ke HP lalu menu "Bagikan/Simpan" Android dibuka (WebView tidak bisa mengunduh blob).
 * - navigator.share → menu bagikan Android.
 * - FHNative.http(): kirim data lewat jaringan asli (tidak diperlambat Android saat aplikasi di latar belakang).
 */
(function () {
'use strict';
const C = window.Capacitor;
const NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());
const P = n => NATIVE && C.Plugins ? C.Plugins[n] : null;
window.FHNative = { aktif: NATIVE, plugin: P };
if (!NATIVE) return;
document.documentElement.classList.add('fh-native');

const toB64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
const bersih = s => String(s || 'berkas').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
async function simpan(href, nama) {
  const FS = P('Filesystem'), SH = P('Share'); if (!FS || !SH) return false;
  try {
    const blob = await (await fetch(href)).blob(), data = await toB64(blob), path = 'unduhan/' + bersih(nama);
    const w = await FS.writeFile({ path, data, directory: 'CACHE', recursive: true });
    await SH.share({ title: nama, files: [w.uri], dialogTitle: 'Simpan atau bagikan ' + nama }).catch(() => SH.share({ title: nama, url: w.uri }));
  } catch (e) { if (!/cancel/i.test(String(e && e.message))) console.warn('Unduhan gagal', e); }
  return true;
}
const kena = a => a && a.hasAttribute && a.hasAttribute('download') && a.href && /^(blob:|data:|https?:)/.test(a.href);
const klik0 = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () { if (kena(this)) { simpan(this.href, this.getAttribute('download') || this.href.split('/').pop()); return; } return klik0.call(this); };
HTMLAnchorElement.prototype.dispatchEvent = function (ev) { if (ev && ev.type === 'click' && kena(this)) { simpan(this.href, this.getAttribute('download') || 'berkas'); return false; } return EventTarget.prototype.dispatchEvent.call(this, ev); };
document.addEventListener('click', e => { const a = e.target && e.target.closest && e.target.closest('a[download]'); if (kena(a)) { e.preventDefault(); e.stopPropagation(); simpan(a.href, a.getAttribute('download') || 'berkas'); } }, true);

if (P('Share')) navigator.share = o => P('Share').share({ title: o && o.title, text: o && o.text, url: o && o.url });

window.FHNative.http = async (url, body, ms = 25000) => {
  const H = P('CapacitorHttp'); if (!H) throw new Error('http');
  const r = await H.post({ url, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data: JSON.stringify(body), connectTimeout: ms, readTimeout: ms });
  let d = r.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  return d && typeof d === 'object' ? d : { ok: r.status >= 200 && r.status < 400, mentah: true };
};
})();
