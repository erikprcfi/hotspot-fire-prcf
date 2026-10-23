/* Akun pengguna aplikasi HP – Fire Hotspot PRCF
 * Daftar sekali di aplikasi; setelah itu langsung masuk tanpa login. Profil: nama, tanggal lahir, alamat,
 * email, nomor HP, foto profil.
 * Data disimpan HANYA di perangkat ini (IndexedDB) – tidak dikirim ke server mana pun.
 * Kata sandi tidak disimpan; yang disimpan hanya sidik PBKDF2-SHA-256 (210.000 iterasi) dengan garam acak.
 * Pemakaian: FHAkun.init({ pushLayer, back }); FHAkun.gate(lanjut); FHAkun.openProfile(); FHAkun.avatar(px)
 */
(function () {
'use strict';
const DBN = 'fh-akun', ST = 'kv', ITER = 210000;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglID = s => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} ${BLN[m - 1]} ${y}`; };
let U = null, OPT = {}; const subs = [];

/* ---------- penyimpanan ---------- */
function db() { return new Promise((ok, no) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function get(k) { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(ST).objectStore(ST).get(k); t.onsuccess = () => ok(t.result); t.onerror = () => no(t.error); }); }
async function put(k, v) { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); }); }
async function del(k) { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).delete(k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); }); }
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hashPw(pw, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return { salt: b64(salt), hash: b64(bits), iter: ITER };
}
const notify = () => subs.forEach(f => { try { f(U); } catch (e) { } });

/* ---------- validasi ---------- */
const V = {
  nama: v => v.trim().length >= 3 ? '' : 'Isi nama lengkap (minimal 3 huruf).',
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Format email belum benar, contoh: nama@gmail.com.',
  hp: v => /^(\+62|62|0)8\d{7,12}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'Nomor HP Indonesia, contoh: 0812 3456 7890.',
  lahir: v => !v ? 'Pilih tanggal lahir.' : (v > new Date().toISOString().slice(0, 10) ? 'Tanggal lahir tidak boleh di masa depan.' : (v < '1900-01-01' ? 'Tanggal lahir tidak valid.' : '')),
  alamat: v => v.trim().length >= 5 ? '' : 'Isi alamat (desa/kelurahan, kecamatan, kabupaten).',
  pw: v => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) ? '' : 'Minimal 8 karakter, berisi huruf dan angka.',
};
const normHP = v => { let s = v.replace(/[\s-]/g, ''); if (s.startsWith('+62')) s = '0' + s.slice(3); else if (s.startsWith('62')) s = '0' + s.slice(2); return s; };
const fmtHP = s => s ? s.replace(/^(\d{4})(\d{4})(\d+)$/, '$1 $2 $3') : '';
const umur = s => { if (!s) return ''; const d = new Date(s), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; };

/* ---------- gaya ---------- */
function css() {
  if (document.getElementById('akun-css')) return; const s = document.createElement('style'); s.id = 'akun-css';
  s.textContent = `
  .ak{position:fixed;inset:0;z-index:9000;background:var(--bg);color:var(--fg);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:akin .35s ease both}
  @keyframes akin{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  .ak-hero{position:relative;padding:calc(env(safe-area-inset-top,0px) + 28px) 22px 70px;color:#E9F2ED;background:radial-gradient(130% 120% at 0% 0%,#1E7A58 0%,#0B3B2C 55%,#062419 100%);overflow:hidden}
  .ak-hero::after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,138,43,.35),transparent 70%)}
  .ak-hero .lg{display:flex;align-items:center;gap:12px;position:relative;z-index:1}.ak-hero .lg img{width:52px;height:52px;border-radius:14px;box-shadow:0 8px 22px rgba(0,0,0,.35)}
  .ak-hero .lg b{display:block;font-size:19px;letter-spacing:-.01em}.ak-hero .lg small{opacity:.75;font-size:12px}
  .ak-hero.tall{padding-bottom:120px}.ak-hero h1{position:relative;z-index:1;margin:26px 0 6px;font-size:26px;line-height:1.15;letter-spacing:-.02em}.ak-hero p{position:relative;z-index:1;margin:0;opacity:.85;font-size:14px;max-width:34ch}
  .ak-card{position:relative;margin:-48px 14px 24px;background:var(--surface);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:18px 16px}
  .ak-step{display:flex;gap:6px;margin-bottom:14px}.ak-step i{flex:1;height:4px;border-radius:4px;background:var(--line)}.ak-step i.on{background:var(--brand-3,#1E7A58)}
  .ak h2{margin:0 0 2px;font-size:18px}.ak .mut{color:var(--muted);font-size:13px;margin:0 0 14px}
  .ak-f{display:grid;gap:12px}.ak-l{display:grid;gap:5px;font-size:12.5px;font-weight:700;color:var(--muted)}
  .ak-l .w{position:relative}.ak-l .w svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--faint);pointer-events:none}
  .ak-l input,.ak-l textarea{width:100%;font:500 15px var(--f);color:var(--fg);background:var(--surface-2);border:1.5px solid var(--line);border-radius:13px;padding:12px 12px 12px 40px;outline:none;-webkit-appearance:none;appearance:none}
  .ak-l textarea{min-height:76px;resize:vertical;padding-top:12px}.ak-l input[type=date]{min-height:47px}
  .ak-l input:focus,.ak-l textarea:focus{border-color:var(--brand-3,#1E7A58);box-shadow:0 0 0 3px rgba(30,122,88,.18)}
  .ak-l.bad input,.ak-l.bad textarea{border-color:var(--crit)}.ak-l .er{color:var(--crit);font-weight:600;font-size:12px;min-height:0}
  .ak-l .eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:36px;height:36px;display:grid;place-items:center;color:var(--muted)}.ak-l .eye svg{position:static;transform:none}
  .ak-pw{display:flex;gap:4px;margin-top:2px}.ak-pw i{flex:1;height:4px;border-radius:3px;background:var(--line)}
  .ak-btn{width:100%;height:50px;border-radius:15px;font:700 15.5px var(--f);color:#fff;background:linear-gradient(150deg,#1E7A58,#0B3B2C);box-shadow:0 10px 24px -10px rgba(11,59,44,.7);display:flex;align-items:center;justify-content:center;gap:8px}
  .ak-btn:disabled{opacity:.6}.ak-btn.alt{background:var(--surface-2);color:var(--fg);border:1.5px solid var(--line);box-shadow:none}.ak-btn.red{background:var(--crit-soft);color:var(--crit);box-shadow:none}
  .ak-link{display:block;text-align:center;margin-top:14px;font-weight:700;font-size:13.5px;color:var(--brand-3,#1E7A58)}
  .ak-chk{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--muted);line-height:1.45}.ak-chk input{width:20px;height:20px;flex:none;margin:1px 0 0;accent-color:#1E7A58}
  .ak-note{display:flex;gap:10px;align-items:flex-start;background:var(--ok-soft);color:var(--fg);border-radius:14px;padding:11px 12px;font-size:12.5px;line-height:1.45}.ak-note svg{flex:none;color:var(--ok);margin-top:1px}
  .ak-av{position:relative;width:104px;height:104px;margin:0 auto}.ak-av .ph{width:104px;height:104px;border-radius:50%;overflow:hidden;background:linear-gradient(150deg,#1E7A58,#0B3B2C);display:grid;place-items:center;color:#fff;font:800 36px var(--f);box-shadow:0 0 0 4px var(--surface),0 10px 26px -8px rgba(0,0,0,.45)}
  .ak-av .ph img{width:100%;height:100%;object-fit:cover}.ak-av button{position:absolute;right:-2px;bottom:2px;width:36px;height:36px;border-radius:50%;background:#E4572E;color:#fff;display:grid;place-items:center;box-shadow:0 0 0 3px var(--surface),0 6px 14px rgba(0,0,0,.3)}
  .ak-top{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px;background:var(--brand);color:#E9F2ED}
  .ak-top button{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1)}.ak-top b{font-size:17px}
  .ak-pf{background:radial-gradient(130% 120% at 0% 0%,#1E7A58 0%,#0B3B2C 60%,#062419 100%);padding:22px 16px 60px;text-align:center;color:#E9F2ED}
  .ak-pf h2{margin:14px 0 2px;font-size:21px}.ak-pf .em{opacity:.8;font-size:13.5px}.ak-pf .since{display:inline-block;margin-top:8px;font-size:11.5px;font-weight:700;letter-spacing:.04em;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.12)}
  .ak-pf .ak-av .ph{box-shadow:0 0 0 4px rgba(255,255,255,.25),0 10px 26px -8px rgba(0,0,0,.5)}.ak-pf .ak-av button{box-shadow:0 0 0 3px #0B3B2C}
  .ak-sec{margin:-40px 14px 14px;display:grid;gap:14px;padding-bottom:calc(30px + env(safe-area-inset-bottom,0px))}
  .ak-grp{background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}
  .ak-grp h3{margin:0;padding:13px 16px 4px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .ak-row{display:flex;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);min-height:56px;width:100%;text-align:left}.ak-grp h3+.ak-row{border-top:0}
  .ak-row .ic{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;flex:none;background:var(--surface-2);color:var(--brand-3,#1E7A58)}.ak-row .ic svg{width:19px;height:19px}
  .ak-row .m{flex:1;min-width:0}.ak-row .m small{display:block;color:var(--muted);font-size:11.5px;font-weight:600}.ak-row .m b{display:block;font-size:14.5px;font-weight:600;word-break:break-word}.ak-row .m b.empty{color:var(--faint);font-style:italic;font-weight:500}
  .ak-row .ch{color:var(--faint)}
  .ak-prog{padding:12px 16px 14px}.ak-prog .bar{height:8px;border-radius:6px;background:var(--surface-2);overflow:hidden}.ak-prog .bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#1E7A58,#43B886);transition:width .6s}
  .ak-prog p{margin:8px 0 0;font-size:12.5px;color:var(--muted)}
  .ak-sheet{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;animation:akf .2s both}@keyframes akf{from{opacity:0}}
  .ak-sheet .in{width:100%;max-height:92vh;overflow-y:auto;background:var(--surface);border-radius:22px 22px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom,0px));animation:aku .28s cubic-bezier(.2,.85,.25,1) both}@keyframes aku{from{transform:translateY(100%)}}
  .ak-sheet .gr{width:40px;height:5px;border-radius:3px;background:var(--line);margin:0 auto 12px}
  .ak-crop{position:relative;width:min(78vw,320px);aspect-ratio:1;margin:6px auto 12px;border-radius:18px;overflow:hidden;background:#000;touch-action:none}
  .ak-crop canvas{width:100%;height:100%;display:block}.ak-crop::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 999px rgba(0,0,0,.5);pointer-events:none}
  .ak-zoom{display:flex;align-items:center;gap:10px;margin:0 6px 14px;color:var(--muted)}.ak-zoom input{flex:1;accent-color:#1E7A58}
  .ak-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ak-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9600;background:#0E1A14;color:#fff;padding:10px 16px;border-radius:12px;font-size:13.5px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:akin .25s both}
  .ak-mini{width:34px;height:34px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:linear-gradient(150deg,#1E7A58,#0B3B2C);color:#fff;font:800 13px var(--f);box-shadow:0 0 0 2px rgba(255,255,255,.35);flex:none}
  .ak-mini img{width:100%;height:100%;object-fit:cover}`;
  document.head.appendChild(s);
}
const IC = {
  user: '<path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM3.5 21a8.5 8.5 0 0 1 17 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  cam: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9.5" r="1.8" fill="currentColor"/><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  chev: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
};
const svg = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${IC[k]}</svg>`;
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatarInner = (u) => u && u.foto ? `<img src="${u.foto}" alt="Foto profil">` : esc(initials(u && u.nama));
function toast(t) { const d = document.createElement('div'); d.className = 'ak-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
function field(id, label, icon, type = 'text', val = '', extra = '') {
  const isPw = type === 'password', ta = type === 'textarea';
  return `<label class="ak-l" data-f="${id}">${label}<span class="w">${svg(icon)}${ta ? `<textarea id="ak_${id}" ${extra}>${esc(val)}</textarea>` : `<input id="ak_${id}" type="${type}" value="${esc(val)}" ${extra}>`}${isPw ? `<button type="button" class="eye" data-eye="ak_${id}" aria-label="Lihat kata sandi">${svg('eye', 18)}</button>` : ''}</span><span class="er"></span></label>`;
}
function bindEyes(root) { root.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = root.querySelector('#' + b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; }); }
function setErr(root, id, msg) { const l = root.querySelector(`[data-f="${id}"]`); if (!l) return; l.classList.toggle('bad', !!msg); l.querySelector('.er').textContent = msg || ''; }
function check(root, ids) { let ok = true, first = null; for (const id of ids) { const el = root.querySelector('#ak_' + id); const m = V[id === 'pw2' ? 'pw' : id](el.value); setErr(root, id, m); if (m) { ok = false; first = first || el; } } if (first) first.focus(); return ok; }
function pwMeter(root, id) { const i = root.querySelector('#ak_' + id), l = root.querySelector(`[data-f="${id}"]`); const m = document.createElement('div'); m.className = 'ak-pw'; m.innerHTML = '<i></i><i></i><i></i><i></i>'; l.insertBefore(m, l.querySelector('.er'));
  i.addEventListener('input', () => { const v = i.value; const sc = (v.length >= 8) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + /\d/.test(v) + (/[^A-Za-z0-9]/.test(v) || v.length >= 12); const col = ['#C42B2B', '#E5A93A', '#2F7FD1', '#1F8A5B'][Math.max(0, sc - 1)]; m.querySelectorAll('i').forEach((x, k) => x.style.background = k < sc ? col : ''); }); }

/* ---------- foto profil: pilih → potong lingkaran → 512 px JPEG ---------- */
function pickPhoto(capture) {
  return new Promise(ok => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (capture) inp.capture = 'user';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return ok(null); if (!/^image\//.test(f.type)) { toast('File harus berupa gambar'); return ok(null); } if (f.size > 25e6) { toast('Foto terlalu besar (maks. 25 MB)'); return ok(null); } ok(f); };
    inp.click(); });
}
function cropSheet(file) {
  return new Promise(done => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); toast('Gambar tidak dapat dibaca'); done(null); };
    img.onload = () => {
      const sh = document.createElement('div'); sh.className = 'ak-sheet ak';
      sh.innerHTML = `<div class="in"><div class="gr"></div><h2>Atur foto profil</h2><p class="mut">Geser untuk memposisikan, gunakan penggeser untuk memperbesar.</p>
        <div class="ak-crop"><canvas width="640" height="640"></canvas></div>
        <div class="ak-zoom">${svg('img', 16)}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="Perbesar">${svg('img', 22)}</div>
        <div class="ak-two"><button class="ak-btn alt" data-x>Batal</button><button class="ak-btn" data-ok>Gunakan foto</button></div></div>`;
      document.body.appendChild(sh);
      const cv = sh.querySelector('canvas'), g = cv.getContext('2d'), Z = sh.querySelector('input[type=range]');
      const base = 640 / Math.min(img.width, img.height); let z = 1, ox = 0, oy = 0;
      const clamp = () => { const s = base * z, w = img.width * s, h = img.height * s; ox = Math.min(Math.max(ox, (640 - w) / 2), (w - 640) / 2); oy = Math.min(Math.max(oy, (640 - h) / 2), (h - 640) / 2); };
      const draw = (c = g, S = 640) => { const k = S / 640, s = base * z * k, w = img.width * s, h = img.height * s; c.fillStyle = '#000'; c.fillRect(0, 0, S, S); c.drawImage(img, (S - w) / 2 + ox * k, (S - h) / 2 + oy * k, w, h); };
      draw();
      let p0 = null; const box = sh.querySelector('.ak-crop'), sc = () => 640 / box.clientWidth;
      box.onpointerdown = e => { p0 = [e.clientX, e.clientY, ox, oy]; box.setPointerCapture(e.pointerId); };
      box.onpointermove = e => { if (!p0) return; ox = p0[2] + (e.clientX - p0[0]) * sc(); oy = p0[3] + (e.clientY - p0[1]) * sc(); clamp(); draw(); };
      box.onpointerup = box.onpointercancel = () => p0 = null;
      Z.oninput = () => { z = +Z.value; clamp(); draw(); };
      const end = v => { URL.revokeObjectURL(url); sh.remove(); done(v); };
      sh.querySelector('[data-x]').onclick = () => end(null);
      sh.querySelector('[data-ok]').onclick = () => { const o = document.createElement('canvas'); o.width = o.height = 512; draw(o.getContext('2d'), 512); end(o.toDataURL('image/jpeg', .86)); };
    };
    img.src = url;
  });
}
function photoMenu() {
  return new Promise(done => {
    const sh = document.createElement('div'); sh.className = 'ak-sheet ak';
    sh.innerHTML = `<div class="in"><div class="gr"></div><h2>Foto profil</h2><p class="mut">Ambil foto baru atau pilih dari galeri.</p>
      <div class="ak-grp" style="box-shadow:none"><button class="ak-row" data-c><span class="ic">${svg('cam')}</span><span class="m"><b>Ambil dengan kamera</b></span></button>
      <button class="ak-row" data-g><span class="ic">${svg('img')}</span><span class="m"><b>Pilih dari galeri</b></span></button>
      ${U && U.foto ? `<button class="ak-row" data-d style="color:var(--crit)"><span class="ic" style="color:var(--crit)">${svg('trash')}</span><span class="m"><b>Hapus foto</b></span></button>` : ''}</div>
      <button class="ak-btn alt" style="margin-top:12px" data-x>Batal</button></div>`;
    document.body.appendChild(sh);
    const fin = v => { sh.remove(); done(v); };
    sh.onclick = e => { if (e.target === sh) fin(undefined); };
    sh.querySelector('[data-x]').onclick = () => fin(undefined);
    const go = async cap => { sh.remove(); const f = await pickPhoto(cap); done(f ? await cropSheet(f) : undefined); };
    sh.querySelector('[data-c]').onclick = () => go(true); sh.querySelector('[data-g]').onclick = () => go(false);
    const d = sh.querySelector('[data-d]'); if (d) d.onclick = () => fin(null);
  });
}

/* ---------- layar: selamat datang / daftar / masuk ---------- */
function screen(html) { const d = document.createElement('div'); d.className = 'ak'; d.setAttribute('role', 'dialog'); d.innerHTML = html; document.body.appendChild(d); bindEyes(d); return d; }
const hero = (h, p, cls = '') => `<div class="ak-hero ${cls}"><div class="lg"><img src="assets/logo_fh.svg" alt=""><div><b>Fire Hotspot</b><small>Yayasan PRCF Indonesia</small></div></div><h1>${h}</h1><p>${p}</p></div>`;
const privacy = `<div class="ak-note">${svg('shield', 18)}<span>Data akun dan foto disimpan <b>hanya di HP ini</b>, tidak dikirim ke server mana pun. Kata sandi disimpan dalam bentuk terenkripsi satu arah.</span></div>`;

function registerScreen(onDone) {
  let foto = null;
  const d = screen(hero('Buat akun Anda', 'Daftar sekali saja. Setelah itu aplikasi langsung terbuka tanpa perlu login lagi.') +
    `<div class="ak-card"><div class="ak-step"><i class="on"></i><i></i></div>
     <div data-s="1"><h2>Biodata</h2><p class="mut">Lengkapi data diri Anda.</p>
      <div class="ak-av" style="margin-bottom:6px"><div class="ph" id="akPh">${svg('user', 44)}</div><button type="button" id="akFoto" aria-label="Tambah foto profil">${svg('cam', 18)}</button></div>
      <p class="mut" style="text-align:center;margin:4px 0 14px">Foto profil (opsional)</p>
      <div class="ak-f">${field('nama', 'Nama lengkap', 'user', 'text', '', 'autocomplete="name" autocapitalize="words"')}${field('lahir', 'Tanggal lahir', 'cal', 'date', '', `max="${new Date().toISOString().slice(0, 10)}" min="1900-01-01"`)}
       ${field('alamat', 'Alamat', 'pin', 'textarea', '', 'autocomplete="street-address" placeholder="Jalan/dusun, desa, kecamatan, kabupaten"')}
       ${field('email', 'Email', 'mail', 'email', '', 'autocomplete="email" inputmode="email" autocapitalize="off"')}${field('hp', 'Nomor HP', 'phone', 'tel', '', 'autocomplete="tel" inputmode="tel" placeholder="0812 3456 7890"')}
       <button class="ak-btn" id="akN1">Lanjut</button></div></div>
     <div data-s="2" hidden><h2>Keamanan akun</h2><p class="mut">Buat kata sandi untuk melindungi profil Anda.</p>
      <div class="ak-f">${field('pw', 'Kata sandi', 'lock', 'password', '', 'autocomplete="new-password"')}${field('pw2', 'Ulangi kata sandi', 'lock', 'password', '', 'autocomplete="new-password"')}
       ${privacy}<label class="ak-chk"><input type="checkbox" id="akOk"><span>Saya menyetujui data di atas disimpan di perangkat ini untuk keperluan profil aplikasi Fire Hotspot.</span></label>
       <button class="ak-btn" id="akDaftar">Daftar &amp; masuk</button><button class="ak-btn alt" id="akB1">Kembali</button></div></div></div>`);
  pwMeter(d, 'pw');
  d.querySelector('#akFoto').onclick = async () => { const r = await photoMenu(); if (r === undefined) return; foto = r; d.querySelector('#akPh').innerHTML = foto ? `<img src="${foto}" alt="">` : svg('user', 44); };
  const step = n => { d.querySelectorAll('[data-s]').forEach(x => x.hidden = x.dataset.s !== String(n)); d.querySelectorAll('.ak-step i').forEach((x, k) => x.classList.toggle('on', k < n)); d.scrollTo({ top: 0, behavior: 'smooth' }); };
  d.querySelector('#akN1').onclick = () => { if (check(d, ['nama', 'lahir', 'alamat', 'email', 'hp'])) step(2); };
  d.querySelector('#akB1').onclick = () => step(1);
  d.querySelector('#akDaftar').onclick = async () => {
    if (!check(d, ['pw'])) return;
    if (d.querySelector('#ak_pw2').value !== d.querySelector('#ak_pw').value) { setErr(d, 'pw2', 'Kata sandi tidak sama.'); return; } setErr(d, 'pw2', '');
    if (!d.querySelector('#akOk').checked) { toast('Centang persetujuan penyimpanan data'); return; }
    const b = d.querySelector('#akDaftar'); b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const h = await hashPw(d.querySelector('#ak_pw').value), v = id => d.querySelector('#ak_' + id).value.trim();
      U = { nama: v('nama'), lahir: v('lahir'), alamat: v('alamat'), email: v('email').toLowerCase(), hp: normHP(v('hp')), foto, dibuat: new Date().toISOString(), diubah: new Date().toISOString(), pw: h };
      await put('akun', U); await put('sesi', { masuk: true, t: Date.now() }); try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
      d.remove(); notify(); toast(`Selamat datang, ${U.nama.split(' ')[0]}!`); onDone();
    } catch (e) { console.error(e); b.disabled = false; b.textContent = 'Daftar & masuk'; toast('Gagal menyimpan: ' + e.message); }
  };
}
function loginScreen(onDone) {
  const d = screen(hero(`Halo, ${esc((U.nama || '').split(' ')[0])}`, 'Masuk kembali dengan kata sandi akun Anda.', 'tall') +
    `<div class="ak-card"><div class="ak-av" style="margin:-70px auto 10px"><div class="ph">${avatarInner(U)}</div></div>
     <div class="ak-f">${field('email', 'Email', 'mail', 'email', U.email, 'autocomplete="username" inputmode="email" autocapitalize="off"')}${field('pw', 'Kata sandi', 'lock', 'password', '', 'autocomplete="current-password"')}
     <button class="ak-btn" id="akIn">Masuk</button></div><button class="ak-link" id="akLupa">Lupa kata sandi?</button></div>`);
  const go = async () => {
    const em = d.querySelector('#ak_email').value.trim().toLowerCase(), pw = d.querySelector('#ak_pw').value, b = d.querySelector('#akIn');
    setErr(d, 'email', ''); setErr(d, 'pw', '');
    if (em !== U.email) { setErr(d, 'email', 'Email tidak terdaftar di perangkat ini.'); return; }
    b.disabled = true; b.textContent = 'Memeriksa…';
    const h = await hashPw(pw, U.pw.salt);
    if (h.hash !== U.pw.hash) { setErr(d, 'pw', 'Kata sandi salah.'); b.disabled = false; b.textContent = 'Masuk'; return; }
    await put('sesi', { masuk: true, t: Date.now() }); d.remove(); notify(); onDone();
  };
  d.querySelector('#akIn').onclick = go; d.querySelector('#ak_pw').onkeydown = e => { if (e.key === 'Enter') go(); };
  d.querySelector('#akLupa').onclick = () => confirmSheet('Atur ulang akun?', 'Akun hanya tersimpan di HP ini, sehingga kata sandi tidak dapat dipulihkan. Anda dapat menghapus akun di perangkat ini lalu mendaftar ulang. Data pemantauan tidak terpengaruh.', 'Hapus & daftar ulang', async () => { await del('akun'); await del('sesi'); U = null; d.remove(); notify(); registerScreen(onDone); });
}
function confirmSheet(title, text, okTxt, onOk) {
  const sh = document.createElement('div'); sh.className = 'ak-sheet ak';
  sh.innerHTML = `<div class="in"><div class="gr"></div><h2>${esc(title)}</h2><p class="mut" style="font-size:14px">${esc(text)}</p><div class="ak-two"><button class="ak-btn alt" data-x>Batal</button><button class="ak-btn red" data-ok>${esc(okTxt)}</button></div></div>`;
  document.body.appendChild(sh); sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.querySelector('[data-x]').onclick = () => sh.remove(); sh.querySelector('[data-ok]').onclick = () => { sh.remove(); onOk(); };
}

/* ---------- halaman profil ---------- */
let PF = null;
function openProfile() {
  if (!U) return; if (PF) PF.remove();
  const d = screen(''); PF = d; d.style.zIndex = 8000;
  const render = () => {
    const items = [['nama', 'Nama lengkap', 'user', U.nama], ['lahir', 'Tanggal lahir', 'cal', U.lahir ? `${tglID(U.lahir)} · ${umur(U.lahir)} tahun` : ''], ['alamat', 'Alamat', 'pin', U.alamat], ['email', 'Email', 'mail', U.email], ['hp', 'Nomor HP', 'phone', fmtHP(U.hp)]];
    const fill = [U.nama, U.lahir, U.alamat, U.email, U.hp, U.foto].filter(Boolean).length, pct = Math.round(100 * fill / 6);
    d.innerHTML = `<div class="ak-top"><button id="pfBack" aria-label="Kembali">${svg('back', 22)}</button><b>Profil saya</b></div>
      <div class="ak-pf"><div class="ak-av"><div class="ph">${avatarInner(U)}</div><button id="pfFoto" aria-label="Ganti foto profil">${svg('cam', 18)}</button></div>
       <h2>${esc(U.nama)}</h2><div class="em">${esc(U.email)}</div><span class="since">Anggota sejak ${tglID(U.dibuat.slice(0, 10))}</span></div>
      <div class="ak-sec">
       <div class="ak-grp"><div class="ak-prog"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700"><span>Kelengkapan profil</span><span>${pct}%</span></div><div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div><p>${pct < 100 ? (U.foto ? 'Lengkapi biodata Anda.' : 'Tambahkan foto profil agar profil Anda lengkap.') : 'Profil Anda sudah lengkap.'}</p></div></div>
       <div class="ak-grp"><h3>Biodata</h3>${items.map(([k, l, ic, v]) => `<button class="ak-row" data-ed="${k}"><span class="ic">${svg(ic)}</span><span class="m"><small>${l}</small><b class="${v ? '' : 'empty'}">${esc(v || 'Belum diisi')}</b></span><span class="ch">${svg('edit', 18)}</span></button>`).join('')}</div>
       <div class="ak-grp"><h3>Keamanan</h3><button class="ak-row" id="pfPw"><span class="ic">${svg('lock')}</span><span class="m"><b>Ubah kata sandi</b><small>Terakhir diubah ${tglID((U.pwDiubah || U.dibuat).slice(0, 10))}</small></span><span class="ch">${svg('chev', 18)}</span></button>
        <div class="ak-row" style="align-items:flex-start"><span class="ic">${svg('shield')}</span><span class="m"><b>Privasi data</b><small style="font-weight:500;margin-top:2px;line-height:1.45">Biodata dan foto hanya tersimpan di HP ini dan tidak dikirim ke server. Menghapus data aplikasi atau browser akan menghapus akun ini.</small></span></div></div>
       <div class="ak-grp"><button class="ak-row" id="pfOut"><span class="ic">${svg('out')}</span><span class="m"><b>Keluar</b><small>Perlu kata sandi untuk masuk lagi</small></span></button>
        <button class="ak-row" id="pfDel" style="color:var(--crit)"><span class="ic" style="color:var(--crit);background:var(--crit-soft)">${svg('trash')}</span><span class="m"><b>Hapus akun dari perangkat</b></span></button></div>
       <p class="mut" style="text-align:center;font-size:11.5px;margin:4px 0 0">Fire Hotspot · Yayasan PRCF Indonesia</p></div>`;
    d.querySelector('#pfBack').onclick = () => closeProfile(true);
    d.querySelector('#pfFoto').onclick = async () => { const r = await photoMenu(); if (r === undefined) return; U.foto = r; U.diubah = new Date().toISOString(); await put('akun', U); notify(); render(); toast(r ? 'Foto profil diperbarui' : 'Foto profil dihapus'); };
    d.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editSheet(b.dataset.ed, render));
    d.querySelector('#pfPw').onclick = () => pwSheet(render);
    d.querySelector('#pfOut').onclick = () => confirmSheet('Keluar dari akun?', 'Anda perlu memasukkan kata sandi untuk masuk kembali.', 'Keluar', async () => { await put('sesi', { masuk: false, t: Date.now() }); closeProfile(true); notify(); loginScreen(() => { }); });
    d.querySelector('#pfDel').onclick = () => confirmSheet('Hapus akun dari perangkat?', 'Biodata, foto dan kata sandi di HP ini akan dihapus permanen. Data pemantauan kebakaran tidak terpengaruh.', 'Hapus akun', async () => { await del('akun'); await del('sesi'); U = null; closeProfile(true); notify(); registerScreen(() => { }); });
  };
  render();
  if (OPT.pushLayer) OPT.pushLayer(() => closeProfile(false));
}
function closeProfile(viaBtn) { if (!PF) return; const d = PF; PF = null; d.remove(); if (viaBtn && OPT.back) OPT.back(); }
function editSheet(k, after) {
  const L = { nama: ['Nama lengkap', 'user', 'text', 'autocomplete="name" autocapitalize="words"'], lahir: ['Tanggal lahir', 'cal', 'date', `max="${new Date().toISOString().slice(0, 10)}" min="1900-01-01"`], alamat: ['Alamat', 'pin', 'textarea', ''], email: ['Email', 'mail', 'email', 'inputmode="email" autocapitalize="off"'], hp: ['Nomor HP', 'phone', 'tel', 'inputmode="tel"'] }[k];
  const sh = document.createElement('div'); sh.className = 'ak-sheet ak';
  sh.innerHTML = `<div class="in"><div class="gr"></div><h2>Ubah ${L[0].toLowerCase()}</h2><p class="mut">Perubahan langsung tersimpan di perangkat ini.</p><div class="ak-f">${field(k, L[0], L[1], L[2], k === 'hp' ? fmtHP(U[k]) : U[k] || '', L[3])}<div class="ak-two"><button class="ak-btn alt" data-x>Batal</button><button class="ak-btn" data-ok>Simpan</button></div></div></div>`;
  document.body.appendChild(sh); setTimeout(() => sh.querySelector('#ak_' + k).focus(), 250);
  sh.onclick = e => { if (e.target === sh) sh.remove(); }; sh.querySelector('[data-x]').onclick = () => sh.remove();
  sh.querySelector('[data-ok]').onclick = async () => { if (!check(sh, [k])) return; let v = sh.querySelector('#ak_' + k).value.trim(); if (k === 'hp') v = normHP(v); if (k === 'email') v = v.toLowerCase();
    U[k] = v; U.diubah = new Date().toISOString(); await put('akun', U); sh.remove(); notify(); after(); toast('Tersimpan'); };
}
function pwSheet(after) {
  const sh = document.createElement('div'); sh.className = 'ak-sheet ak';
  sh.innerHTML = `<div class="in"><div class="gr"></div><h2>Ubah kata sandi</h2><p class="mut">Masukkan kata sandi lama, lalu kata sandi baru.</p><div class="ak-f">${field('lama', 'Kata sandi lama', 'lock', 'password', '', 'autocomplete="current-password"')}${field('pw', 'Kata sandi baru', 'lock', 'password', '', 'autocomplete="new-password"')}${field('pw2', 'Ulangi kata sandi baru', 'lock', 'password', '', 'autocomplete="new-password"')}<div class="ak-two"><button class="ak-btn alt" data-x>Batal</button><button class="ak-btn" data-ok>Simpan</button></div></div></div>`;
  document.body.appendChild(sh); bindEyes(sh); pwMeter(sh, 'pw');
  sh.onclick = e => { if (e.target === sh) sh.remove(); }; sh.querySelector('[data-x]').onclick = () => sh.remove();
  sh.querySelector('[data-ok]').onclick = async () => {
    const old = await hashPw(sh.querySelector('#ak_lama').value, U.pw.salt); if (old.hash !== U.pw.hash) { setErr(sh, 'lama', 'Kata sandi lama salah.'); return; } setErr(sh, 'lama', '');
    if (!check(sh, ['pw'])) return; if (sh.querySelector('#ak_pw2').value !== sh.querySelector('#ak_pw').value) { setErr(sh, 'pw2', 'Kata sandi tidak sama.'); return; }
    U.pw = await hashPw(sh.querySelector('#ak_pw').value); U.pwDiubah = new Date().toISOString(); await put('akun', U); sh.remove(); after(); toast('Kata sandi diperbarui');
  };
}

/* ---------- API ---------- */
async function gate(next) {
  css();
  let sesi = null; try { U = await get('akun'); sesi = await get('sesi'); } catch (e) { console.warn('Penyimpanan akun tidak tersedia', e); return next(); }
  notify();
  if (!U) return registerScreen(next);
  if (!sesi || !sesi.masuk) return loginScreen(next);
  next();
}
function avatar(px = 34) { return `<span class="ak-mini" style="width:${px}px;height:${px}px">${U ? avatarInner(U) : svg('user', Math.round(px * .55))}</span>`; }
window.FHAkun = { init: o => { OPT = o || {}; css(); }, gate, openProfile, avatar, user: () => U, onChange: f => subs.push(f), firstName: () => U ? U.nama.split(' ')[0] : '' };
})();
