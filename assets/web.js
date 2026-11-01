/* Fire Hotspot – mode WEBSITE (app.html?web=1, juga dibuka dari index.html)
 * Tampilan & alat sama dengan aplikasi HP, tanpa wajib masuk. Fitur yang memerlukan akun (Bara Api, unggah SHP, patroli,
 * tindak lanjut, dasbor admin) memakai MASUK DENGAN EMAIL: akun dibuat di aplikasi HP, di website cukup buktikan email
 * dengan kode 6 angka (Apps Script aksi kode → cek → masuk_web). Pendaftaran akun baru tetap hanya di aplikasi HP.
 * Sesi website disimpan di peramban ini (localStorage 'fh_web_akun', sama dengan modul analisis) dan dapat diakhiri kapan saja.
 * Lokasi GPS TIDAK dikirim dari website.
 */
(function () {
'use strict';
if (!window.FH_WEB || !window.FHAkun) return;
const A = window.FHAkun, KEY = 'fh_web_akun', KUNCI = 'fh-prcf-2026-akun';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.id && v.token ? v : null; } catch (e) { return null; } };
const set = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) { } subs.forEach(f => { try { f(); } catch (e) { } }); };
const subs = [];
const ini = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const user = () => { const v = get(); return v ? { id: v.id, token: v.token, nama: v.nama || v.email, email: v.email, web: true, lokasiSetuju: false, lokasiOn: false } : null; };
async function api(b, ms = 30000) { const ep = A.endpoint(); if (!ep) throw new Error('uji'); const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ kunci: KUNCI }, b)), signal: c.signal }); return await r.json(); } finally { clearTimeout(t); } }

function css() {
  if (document.getElementById('web-css')) return; const s = document.createElement('style'); s.id = 'web-css';
  s.textContent = `.wb-dlg{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(4,12,8,.55);backdrop-filter:blur(4px);animation:wbIn .2s ease}
  @keyframes wbIn{from{opacity:0}}.wb-box{width:min(440px,100%);background:var(--surface);color:var(--fg);border-radius:24px;padding:24px;box-shadow:0 30px 80px -20px rgba(0,0,0,.6);display:grid;gap:12px}
  .wb-box h3{margin:0;font-size:20px;letter-spacing:-.01em}.wb-box p{margin:0;color:var(--muted);font-size:14px;line-height:1.55}
  .wb-in{width:100%;box-sizing:border-box;height:48px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface-2);color:var(--fg);padding:0 14px;font:600 15px var(--f)}
  .wb-btn{height:48px;border-radius:14px;border:0;background:var(--brand-3,#1E7A58);color:#fff;font:800 15px var(--f);cursor:pointer}.wb-btn:disabled{opacity:.55}
  .wb-btn.ghost{background:var(--surface-2);color:var(--fg);border:1px solid var(--line)}.wb-err{color:#D93025;font-size:13px;font-weight:600;min-height:1em}
  .wb-me{display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:var(--surface-2)}.wb-av{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(150deg,#1E7A58,#0B3B2C);color:#fff;font-weight:800}
  #wbLogin{height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;font:700 13px var(--f);cursor:pointer;white-space:nowrap}
  .ak-mini.wb{display:inline-grid;place-items:center;border-radius:50%;background:linear-gradient(150deg,#1E7A58,#0B3B2C);color:#fff;font-weight:800;font-size:13px}`;
  document.head.appendChild(s);
}
function dialog(html) { css(); const d = document.createElement('div'); d.className = 'wb-dlg'; d.innerHTML = `<div class="wb-box" role="dialog" aria-modal="true">${html}</div>`; d.onclick = e => { if (e.target === d) d.remove(); }; document.body.appendChild(d); return d; }

/* Masuk website: email terdaftar di aplikasi HP → kode 6 angka → sesi */
function login(alasan, done) {
  const wid = crypto.randomUUID ? crypto.randomUUID() : 'w' + Date.now() + Math.random().toString(16).slice(2);
  const d = dialog(`<h3>Masuk ke Fire Hotspot</h3><p>${esc(alasan || 'Masuk dengan email akun aplikasi HP Fire Hotspot yang sudah terverifikasi.')} Kode 6 angka dikirim ke email Anda.</p>
    <input class="wb-in" type="email" autocomplete="email" placeholder="email@contoh.com" data-em><button class="wb-btn" data-k>Kirim kode</button>
    <div data-s2 hidden style="display:grid;gap:10px"><input class="wb-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Kode 6 angka" data-kd><button class="wb-btn" data-v>Masuk</button></div>
    <div class="wb-err" data-er></div><p style="font-size:12.5px">Belum punya akun? Akun dibuat sekali di <a href="pasang.html">aplikasi HP Fire Hotspot</a>, lalu bisa dipakai juga di website.</p>
    <button class="wb-btn ghost" data-x>Batal</button>`);
  const $ = s => d.querySelector(s), er = t => { $('[data-er]').textContent = t || ''; };
  $('[data-x]').onclick = () => d.remove();
  $('[data-k]').onclick = async () => { const em = $('[data-em]').value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(em)) return er('Format email belum benar.'); er(''); $('[data-k]').disabled = true;
    try { const j = await api({ aksi: 'kode', email: em, id: wid, bahasa: document.documentElement.lang === 'en' ? 'en' : 'id' }); if (!j.ok) { er(j.galat); $('[data-k]').disabled = false; return; }
      $('[data-s2]').hidden = false; $('[data-k]').textContent = 'Kode terkirim – cek email (juga folder Spam)'; $('[data-kd]').focus(); } catch (e) { er('Gagal mengirim kode. Periksa internet.'); $('[data-k]').disabled = false; } };
  $('[data-v]').onclick = async () => { const em = $('[data-em]').value.trim().toLowerCase(), kd = $('[data-kd]').value.replace(/\D/g, ''); if (kd.length !== 6) return er('Masukkan 6 angka.'); $('[data-v]').disabled = true;
    try { const c = await api({ aksi: 'cek', email: em, id: wid, kode: kd }); if (!c.ok) { er(c.galat); $('[data-v]').disabled = false; return; }
      const m = await api({ aksi: 'masuk_web', wid, email: em, token: c.token }); if (!m.ok) { er(m.galat); $('[data-v]').disabled = false; return; }
      set({ id: m.id, token: m.token, nama: m.nama, email: m.email }); d.remove(); (window.toastMsg || (() => { }))('Selamat datang, ' + String(m.nama || '').split(' ')[0] + '!'); done && done(); }
    catch (e) { er('Gagal. Periksa internet.'); $('[data-v]').disabled = false; } };
  setTimeout(() => $('[data-em]').focus(), 50);
}
function profil() {
  const u = user(); if (!u) return login();
  const d = dialog(`<h3>Akun website</h3><div class="wb-me"><span class="wb-av">${esc(ini(u.nama))}</span><span style="min-width:0"><b style="display:block">${esc(u.nama)}</b><small style="color:var(--muted)">${esc(u.email)}</small></span></div>
    <p>Anda masuk di peramban ini. Profil, foto dan biodata diubah dari aplikasi HP. Lokasi GPS tidak dikirim dari website.</p>
    <button class="wb-btn ghost" data-o>Keluar dari website</button><button class="wb-btn" data-x>Tutup</button>`);
  d.querySelector('[data-x]').onclick = () => d.remove();
  d.querySelector('[data-o]').onclick = () => { set(null); d.remove(); };
}
/* jembatan ke FHAkun: semua modul (Bara Api, patroli, tindak lanjut, admin, analisis) memakai akun website ini */
A.gate = next => next && next();
A.user = user; A.masuk = () => !!get();
A.openProfile = profil; A.login = login;
A.avatar = px => { const u = user(); return u ? `<span class="ak-mini wb" style="width:${px}px;height:${px}px">${esc(ini(u.nama))}</span>` : ''; };
A.firstName = () => { const u = user(); return u ? String(u.nama).split(' ')[0] : ''; };
A.onChange = f => subs.push(f);
A.perlu = (alasan, f) => { if (get()) return f(); login(alasan, f); };   // dipakai fitur yang wajib akun
window.addEventListener('storage', e => { if (e.key === KEY) subs.forEach(f => { try { f(); } catch (x) { } }); });
/* tombol Masuk di bilah atas */
function tombol() { css(); const me = document.getElementById('abMe'); if (!me) return; let b = document.getElementById('wbLogin');
  if (!b) { b = document.createElement('button'); b.id = 'wbLogin'; b.type = 'button'; b.textContent = 'Masuk'; b.onclick = () => login(); me.parentNode.insertBefore(b, me); }
  b.hidden = !!get(); }
subs.push(tombol); document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', tombol) : tombol();
window.FHWeb = { login, profil, user, keluar: () => set(null) };
})();
