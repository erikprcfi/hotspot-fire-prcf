/* Fire Hotspot – langganan PERINGATAN DINI otomatis (notifikasi HP + email) – Yayasan PRCF Indonesia
 * Pemicu (diperiksa server tiap 3 jam): titik panas baru NASA FIRMS di desa/HD atau ≤5 km dari batas desa,
 * dan bahaya kebakaran FDRS (BMKG/ECMWF) Tinggi/Ekstrem dalam 3 hari ke depan. Hanya untuk pengguna terverifikasi.
 * Pemakaian: FHPeringatan.mount(el, { akun: () => ({id, token, email}) | null, situs: [{id, nama}], aktif: 'nangalauk' })
 */
(function () {
'use strict';
const URL_ = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec', KUNCI = 'fh-prcf-2026-akun';
const VAPID = 'BKjXTnbQTsAbJDWuBmUNyJA23jNEIKvMVb-ecTA_Z-wwr0mpBRwZAQfaRqGjY9d8c73X4mvOzjIeYTde8_ZoJqk';
const en = () => window.FHLang && FHLang.get() === 'en';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const T = () => en() ? {
  judul: 'Automatic early warning', sub: 'Get notified without opening the app',
  info: 'The PRCF server checks every 3 hours and alerts you when: (1) a new NASA FIRMS hotspot appears inside the village/Village Forest or within 5 km of the village boundary; (2) forecast fire danger (FDRS, BMKG/ECMWF) reaches High or Extreme within 3 days.',
  pilih: 'Village Forests to watch', hp: 'Notifications on this phone', mail: 'Email to', simpan: 'Save', coba: 'Test notification',
  masuk: 'Sign in with a verified account to subscribe.', ok: 'Saved ✓ Early warnings are active.', off: 'Saved ✓ Early warnings are off.', gagal: 'Failed to save. Check your internet and try again.',
  izin: 'Notification permission was denied. Allow notifications for this app in your phone settings, then try again.', tidak: 'This browser does not support push notifications. Email alerts still work.',
  ios: 'On iPhone, notifications only work after adding the app to the Home Screen (Share → Add to Home Screen, iOS 16.4+).', minimal: 'Choose at least one Village Forest.',
  ujiJ: '🔥 Test – Fire Hotspot', ujiI: 'Notifications work on this phone. Real alerts come from the PRCF server.', memuat: 'Loading subscription…', status: n => `${n} device(s) receiving notifications`
} : {
  judul: 'Peringatan dini otomatis', sub: 'Diberi tahu tanpa perlu membuka aplikasi',
  info: 'Server PRCF memeriksa setiap 3 jam dan memberi tahu bila: (1) ada titik panas baru NASA FIRMS di dalam desa/Hutan Desa atau ≤5 km dari batas desa; (2) prakiraan bahaya kebakaran (FDRS, BMKG/ECMWF) mencapai Tinggi atau Ekstrem dalam 3 hari ke depan.',
  pilih: 'Hutan Desa yang dipantau', hp: 'Notifikasi di HP ini', mail: 'Email ke', simpan: 'Simpan', coba: 'Coba notifikasi',
  masuk: 'Masuk dengan akun terverifikasi untuk berlangganan.', ok: 'Tersimpan ✓ Peringatan dini aktif.', off: 'Tersimpan ✓ Peringatan dini dimatikan.', gagal: 'Gagal menyimpan. Periksa internet lalu coba lagi.',
  izin: 'Izin notifikasi ditolak. Izinkan notifikasi untuk aplikasi ini di pengaturan HP, lalu coba lagi.', tidak: 'Peramban ini tidak mendukung notifikasi push. Peringatan lewat email tetap berjalan.',
  ios: 'Di iPhone, notifikasi baru berfungsi setelah aplikasi ditambahkan ke Layar Utama (Bagikan → Tambah ke Layar Utama, iOS 16.4+).', minimal: 'Pilih minimal satu Hutan Desa.',
  ujiJ: '🔥 Uji coba – Fire Hotspot', ujiI: 'Notifikasi berfungsi di HP ini. Peringatan sungguhan dikirim server PRCF.', memuat: 'Memuat langganan…', status: n => `${n} perangkat menerima notifikasi`
};
const bisaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia && matchMedia('(display-mode: standalone)').matches) && !navigator.standalone;
function kunciB(s) { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); }
const api = o => fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ kunci: KUNCI }, o)) }).then(r => r.json());
async function langgananHP() { if (!bisaPush()) return null; const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
if (!document.getElementById('fhpr-css')) {
  const st = document.createElement('style'); st.id = 'fhpr-css';
  st.textContent = `.pr{padding:16px}.pr p{margin:0 0 10px;font-size:13px;line-height:1.5;color:var(--muted,#5b6660)}.pr h4{margin:14px 0 8px;font-size:13px}
  .pr-chips{display:flex;flex-wrap:wrap;gap:8px}.pr-chips button{padding:9px 12px;border-radius:999px;border:1.5px solid var(--line,#dde3df);background:var(--surface,#fff);color:inherit;font:600 12.5px var(--f,system-ui);cursor:pointer}
  .pr-chips button[aria-pressed="true"]{background:#B3170E;border-color:#B3170E;color:#fff}
  .pr-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line,#e3e8e4)}.pr-row:first-of-type{border-top:0}.pr-row span{flex:1;font-size:14px;font-weight:600}.pr-row small{display:block;font-weight:500;font-size:12px;color:var(--muted,#6b766f);word-break:break-all}
  .pr-sw{position:relative;width:48px;height:28px;flex:none}.pr-sw input{opacity:0;width:0;height:0}.pr-sw i{position:absolute;inset:0;border-radius:99px;background:#9aa5a0;transition:.2s}.pr-sw i::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s}
  .pr-sw input:checked+i{background:#1E7A58}.pr-sw input:checked+i::after{transform:translateX(20px)}
  .pr-act{display:flex;gap:10px;margin-top:12px}.pr-act button{flex:1;padding:12px;border-radius:14px;border:0;font:700 14px var(--f,system-ui);cursor:pointer}.pr-act .ya{background:#B3170E;color:#fff}.pr-act .uji{background:var(--accent-soft,#e6f2ec);color:var(--accent,#1E7A58)}
  .pr-msg{margin-top:10px;font-size:12.5px;font-weight:600;min-height:1em}.pr-note{font-size:11.5px!important;color:var(--muted,#6b766f)!important}`;
  document.head.appendChild(st);
}
function mount(el, o = {}) {
  const X = T(), a = o.akun ? o.akun() : null;
  if (!a || !a.token) { el.innerHTML = `<div class="pr" data-notr><b>${X.judul}</b><p style="margin-top:6px">${X.masuk}</p></div>`; return; }
  let pilih = new Set(o.aktif ? [o.aktif] : []);
  el.innerHTML = `<div class="pr" data-notr><b style="font-size:15px">🔔 ${X.judul}</b><p style="margin-top:4px">${X.info}</p>
    <h4>${X.pilih}</h4><div class="pr-chips" data-chips></div>
    <div style="margin-top:12px"><label class="pr-row"><span>${X.hp}<small data-st></small></span><span class="pr-sw" style="flex:none"><input type="checkbox" data-hp><i></i></span></label>
    <label class="pr-row"><span>${X.mail}<small>${esc(a.email || '')}</small></span><span class="pr-sw" style="flex:none"><input type="checkbox" data-mail><i></i></span></label></div>
    ${!bisaPush() ? `<p class="pr-note">${X.tidak}</p>` : ''}${ios() ? `<p class="pr-note">${X.ios}</p>` : ''}
    <div class="pr-act"><button class="uji" data-uji>${X.coba}</button><button class="ya" data-ok>${X.simpan}</button></div><div class="pr-msg" data-msg>${X.memuat}</div></div>`;
  const $ = s => el.querySelector(s), msg = (t, c) => { $('[data-msg]').textContent = t; $('[data-msg]').style.color = c || ''; };
  const chips = () => { $('[data-chips]').innerHTML = (o.situs || []).map(s => `<button data-id="${esc(s.id)}" aria-pressed="${pilih.has(s.id)}">${esc(s.nama)}</button>`).join('');
    $('[data-chips]').querySelectorAll('button').forEach(b => b.onclick = () => { pilih.has(b.dataset.id) ? pilih.delete(b.dataset.id) : pilih.add(b.dataset.id); chips(); }); };
  chips(); if (!bisaPush()) $('[data-hp]').disabled = true;
  (async () => {
    try {
      const [r, sub] = await Promise.all([api({ aksi: 'langganan_ambil', id: a.id, token: a.token }), langgananHP().catch(() => null)]);
      if (r.ok) { if (r.situs.length) pilih = new Set(r.situs); chips(); $('[data-mail]').checked = !!r.email_on;
        $('[data-hp]').checked = !!(sub && (r.endpoints || []).includes(sub.endpoint) && Notification.permission === 'granted');
        if ((r.endpoints || []).length) $('[data-st]').textContent = X.status(r.endpoints.length); }
      msg('');
    } catch (e) { msg(''); }
  })();
  $('[data-uji]').onclick = async () => {
    if (!bisaPush()) return msg(X.tidak, '#B3170E');
    const p = await Notification.requestPermission(); if (p !== 'granted') return msg(X.izin, '#B3170E');
    const reg = await navigator.serviceWorker.ready; reg.showNotification(X.ujiJ, { body: X.ujiI, icon: './assets/icons/icon-192.png', tag: 'fh-uji', vibrate: [200, 100, 200] });
  };
  $('[data-ok]').onclick = async () => {
    const hp = $('[data-hp]').checked, mail = $('[data-mail]').checked;
    if ((hp || mail) && !pilih.size) return msg(X.minimal, '#B3170E');
    $('[data-ok]').disabled = true; msg('…');
    try {
      let push = null, hapus = null;
      if (hp && bisaPush()) {
        const p = await Notification.requestPermission(); if (p !== 'granted') { $('[data-ok]').disabled = false; $('[data-hp]').checked = false; return msg(X.izin, '#B3170E'); }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciB(VAPID) });
        push = sub.toJSON();
      } else { const sub = await langgananHP().catch(() => null); if (sub) { hapus = sub.endpoint; sub.unsubscribe().catch(() => { }); } }
      const r = await api({ aksi: 'langganan_simpan', id: a.id, token: a.token, situs: [...pilih], email_on: mail, push, hapus_push: hapus, bahasa: en() ? 'en' : 'id' });
      if (!r.ok) throw new Error(r.galat);
      $('[data-st]').textContent = r.n_push ? X.status(r.n_push) : '';
      msg(hp || mail ? X.ok : X.off, '#1E7A58');
    } catch (e) { msg((e && e.message) || X.gagal, '#B3170E'); }
    $('[data-ok]').disabled = false;
  };
}
window.FHPeringatan = { mount };
})();
