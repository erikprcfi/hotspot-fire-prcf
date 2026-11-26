/* Pantau Rimbak STUDIO – pusat kelola aplikasi (Pengembang · Admin · Editor · Pemantau)
 * Server: Apps Script v16 (aksi peran, studio_*, lapor_daftar/verifikasi). Bila server masih v15, Studio memakai aksi "dasbor" (hanya baca)
 * dan menandai fitur yang menunggu pembaruan server. Server selalu memeriksa ulang izin setiap tindakan; tampilan hanya mengikuti.
 * Tata letak: laptop – bilah samping + panel rincian; HP – judul + tab geser + lembar rincian dari bawah.
 */
(function () {
'use strict';
const PENGEMBANG = ['erik.prcfi@gmail.com', 'erik@prcfindonesia.org'];
const TK = { pemantau: 1, editor: 2, admin: 3, pengembang: 4 };
const NM = { pengembang: 'Pengembang', admin: 'Admin', editor: 'Editor', pemantau: 'Pemantau' };
const WR = { pengembang: '#F59E0B', admin: '#818CF8', editor: '#34D399', pemantau: '#38BDF8' };
const IZIN = {
  pengembang: 'Semua izin, termasuk menambah & mencabut Admin. Tidak dapat dicabut.',
  admin: 'Kelola pengguna (blokir, hapus), tambah Editor & Pemantau, pengumuman, log aktivitas.',
  editor: 'Verifikasi laporan warga, jalankan ulang analisis, lihat galat aplikasi, tugaskan tindak lanjut.',
  pemantau: 'Melihat dasbor, pengguna, peran, analisis dan laporan (hanya baca).'
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : (+v).toLocaleString('id-ID', { maximumFractionDigits: d });
const ini = n => (String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase();
const AK = () => window.FHAkun, U = () => { const a = AK(); return a && a.masuk && a.masuk() && a.user ? a.user() : null; };
const toast = t => (window.toastMsg || (x => alert(x)))(t);
const LS = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
const lalu = ms => { if (!ms) return '–'; const d = (Date.now() - ms) / 1000; if (d < 90) return 'baru saja'; if (d < 3600) return Math.round(d / 60) + ' mnt lalu'; if (d < 86400) return Math.round(d / 3600) + ' jam lalu'; if (d < 86400 * 30) return Math.round(d / 86400) + ' hari lalu'; return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };

/* ---------------- peran ---------------- */
let PERAN = null;   // { email, peran, versi }
function peranLokal() { const u = U(); if (!u) return ''; const em = String(u.email || '').toLowerCase(); if (PENGEMBANG.includes(em)) return 'pengembang';
  const c = PERAN || LS.get('pr_peran'); return c && c.email === em ? c.peran || '' : ''; }
const tingkat = () => TK[peranLokal()] || 0;
async function api(b, ms = 45000) { if (!window.FHAlat) throw new Error('alat'); return FHAlat.api(b, ms); }
let VERSI_SERVER = 0;
async function segarkanPeran() {
  const u = U(); if (!u || !(AK().endpoint && AK().endpoint())) return;
  try { const j = await api({ aksi: 'peran' }, 20000);
    if (j && j.ok && 'peran' in j) { VERSI_SERVER = j.versi || 16; PERAN = { email: String(u.email || '').toLowerCase(), peran: j.peran || '', t: Date.now() }; LS.set('pr_peran', PERAN); }
    else if (j && j.ok) VERSI_SERVER = 15;
    pasangPintu();
  } catch (e) { }
}

/* ---------------- gaya ---------------- */
function css() {
  if (document.getElementById('st-css')) return; const s = document.createElement('style'); s.id = 'st-css';
  s.textContent = `
#studio{position:fixed;inset:0;z-index:2600;display:flex;background:#070C17;color:#E7ECF5;font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--p:#0E1627;--p2:#131D33;--g:rgba(255,255,255,.08);--g2:rgba(255,255,255,.14);--m:#8D9AB3;--a:#10B981;--a2:#6366F1;--r:#F43F5E;-webkit-font-smoothing:antialiased}
#studio *{box-sizing:border-box}#studio button{font:inherit;color:inherit;cursor:pointer}#studio input,#studio select,#studio textarea{font:inherit;color:#E7ECF5;background:#0A1222;border:1px solid var(--g2);border-radius:10px;padding:9px 11px;outline:none}#studio input:focus,#studio select:focus,#studio textarea:focus{border-color:var(--a)}
.st-side{width:252px;flex:none;background:linear-gradient(180deg,#0B1324,#070C17);border-right:1px solid var(--g);display:flex;flex-direction:column;padding:18px 12px;gap:4px;overflow:auto}
.st-brand{display:flex;align-items:center;gap:10px;padding:4px 8px 16px}.st-brand i{width:36px;height:36px;border-radius:11px;background:conic-gradient(from 200deg,#10B981,#6366F1,#F59E0B,#10B981);display:grid;place-items:center;font-style:normal;font-weight:900;color:#06101F}
.st-brand b{display:block;font-size:15px;letter-spacing:.01em}.st-brand small{color:var(--m);font-size:11.5px}
.st-nav{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:11px;border:0;background:none;text-align:left;color:#B8C3D9;font-weight:600}
.st-nav:hover{background:rgba(255,255,255,.04)}.st-nav.on{background:linear-gradient(90deg,rgba(16,185,129,.16),rgba(99,102,241,.10));color:#fff;box-shadow:inset 2px 0 0 #10B981}
.st-nav svg{width:18px;height:18px;flex:none;opacity:.9}.st-nav em{margin-left:auto;font-style:normal;font-size:11px;background:rgba(244,63,94,.18);color:#FDA4AF;padding:1px 7px;border-radius:99px}
.st-nav .kunci{margin-left:auto;opacity:.45}
.st-me{margin-top:auto;border-top:1px solid var(--g);padding:12px 8px 2px;display:flex;gap:10px;align-items:center}.st-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:12.5px;background:#1E293B;flex:none}
.st-me b{display:block;font-size:13px}.st-me small{font-size:11.5px;color:var(--m)}
.st-main{flex:1;min-width:0;display:flex;flex-direction:column}
.st-top{display:flex;align-items:center;gap:12px;padding:16px 26px;border-bottom:1px solid var(--g);background:rgba(7,12,23,.85);backdrop-filter:blur(10px);position:sticky;top:0;z-index:2}
.st-top h1{font-size:19px;margin:0;font-weight:800;letter-spacing:-.01em}.st-top p{margin:0;color:var(--m);font-size:12.5px}
.st-ic{width:38px;height:38px;border-radius:11px;border:1px solid var(--g2);background:var(--p);display:grid;place-items:center;flex:none}.st-ic svg{width:18px;height:18px}
.st-sp{flex:1}.st-tabs{display:none}
.st-body{flex:1;overflow:auto;padding:22px 26px 60px}
.st-grid{display:grid;gap:14px}.st-g4{grid-template-columns:repeat(4,minmax(0,1fr))}.st-g3{grid-template-columns:repeat(3,minmax(0,1fr))}.st-g2{grid-template-columns:repeat(2,minmax(0,1fr))}.st-g21{grid-template-columns:2fr 1fr}
.st-card{background:linear-gradient(180deg,var(--p2),var(--p));border:1px solid var(--g);border-radius:16px;padding:16px 18px;min-width:0}
.st-card h3{margin:0 0 10px;font-size:13.5px;font-weight:700;color:#CFD8EA;display:flex;align-items:center;gap:8px}.st-card h3 small{margin-left:auto;font-weight:500;color:var(--m);font-size:11.5px}
.st-kpi small{display:block;color:var(--m);font-size:12px}.st-kpi b{display:block;font-size:27px;font-weight:800;letter-spacing:-.02em;margin-top:4px}.st-kpi span{font-size:11.5px;color:#6EE7B7}
.st-kpi{position:relative;overflow:hidden}.st-kpi:after{content:'';position:absolute;right:-30px;top:-30px;width:90px;height:90px;border-radius:50%;background:var(--k,#10B981);opacity:.10}
.st-bar{display:grid;grid-template-columns:minmax(80px,38%) 1fr 44px;gap:10px;align-items:center;font-size:12.5px;margin:7px 0}.st-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C5CFE2}.st-bar i{display:block;height:8px;border-radius:6px;background:var(--c,#10B981)}.st-bar b{text-align:right;font-weight:700}
.st-svg{width:100%;height:auto;display:block}.st-svg text{fill:#8D9AB3;font:10px system-ui}
.st-tool{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}.st-tool input[type=search]{flex:1;min-width:180px}
.st-chip{border:1px solid var(--g2);background:var(--p);border-radius:99px;padding:6px 12px;font-size:12.5px;font-weight:600;color:#C5CFE2}.st-chip.on{background:#10B981;border-color:#10B981;color:#04121A}
.st-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--g2);background:var(--p2);border-radius:10px;padding:9px 14px;font-weight:700;font-size:13px}.st-btn.pri{background:linear-gradient(135deg,#10B981,#059669);border-color:transparent;color:#03140D}.st-btn.ung{background:linear-gradient(135deg,#6366F1,#4F46E5);border-color:transparent;color:#fff}
.st-btn.bah{background:rgba(244,63,94,.12);border-color:rgba(244,63,94,.45);color:#FDA4AF}.st-btn:disabled{opacity:.45;cursor:not-allowed}
.st-tb{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}.st-tb th{position:sticky;top:0;background:#0E1627;text-align:left;font-size:11.5px;color:var(--m);font-weight:700;padding:10px 12px;border-bottom:1px solid var(--g);white-space:nowrap}
.st-tb td{padding:11px 12px;border-bottom:1px solid var(--g);vertical-align:middle}.st-tb tr.klik{cursor:pointer}.st-tb tr.klik:hover td{background:rgba(255,255,255,.025)}
.st-u{display:flex;gap:10px;align-items:center;min-width:0}.st-u b{display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-u small{color:var(--m);font-size:12px;display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.st-tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700;border:1px solid currentColor;white-space:nowrap}
.st-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.st-wrap{background:var(--p);border:1px solid var(--g);border-radius:16px;overflow:auto;max-height:calc(100vh - 220px)}
.st-empty{padding:28px;text-align:center;color:var(--m)}.st-note{color:var(--m);font-size:12px;line-height:1.5}
.st-warn{border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);color:#FCD34D;border-radius:12px;padding:11px 14px;font-size:13px;margin-bottom:14px}
.st-drw{position:fixed;inset:0;z-index:2700;background:rgba(2,6,15,.55);display:flex;justify-content:flex-end;animation:stF .18s ease}
.st-drw>div{width:min(460px,100%);height:100%;background:#0B1324;border-left:1px solid var(--g2);overflow:auto;padding:22px;animation:stS .22s ease}
@keyframes stF{from{opacity:0}}@keyframes stS{from{transform:translateX(24px);opacity:.4}}
.st-kv{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.st-kv div{background:var(--p);border:1px solid var(--g);border-radius:12px;padding:9px 11px}.st-kv small{display:block;color:var(--m);font-size:11.5px}.st-kv b{font-size:14px;word-break:break-word}
.st-zone{border:1px solid rgba(244,63,94,.4);border-radius:14px;padding:14px;margin-top:16px;background:rgba(244,63,94,.05)}.st-zone h4{margin:0 0 6px;color:#FDA4AF}
.st-sk{height:92px;border-radius:16px;background:linear-gradient(90deg,#0E1627,#16223A,#0E1627);background-size:200% 100%;animation:stK 1.2s infinite}@keyframes stK{to{background-position:-200% 0}}
.st-mx{width:100%;border-collapse:collapse;font-size:12.5px}.st-mx td,.st-mx th{border-bottom:1px solid var(--g);padding:8px;text-align:center}.st-mx th:first-child,.st-mx td:first-child{text-align:left}
.st-ok{color:#34D399}.st-no{color:#475569}
@media (max-width:899px){
 #studio{flex-direction:column}.st-side{display:none}.st-top{padding:12px 14px;gap:10px}.st-top h1{font-size:17px}
 .st-tabs{display:flex;gap:6px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--g);background:#0A1120;scrollbar-width:none}.st-tabs::-webkit-scrollbar{display:none}
 .st-tabs button{flex:none;border:1px solid var(--g2);background:var(--p);border-radius:99px;padding:7px 13px;font-size:12.5px;font-weight:700;color:#B8C3D9}.st-tabs button.on{background:#10B981;color:#04121A;border-color:#10B981}
 .st-body{padding:14px 12px 90px}.st-g4{grid-template-columns:repeat(2,minmax(0,1fr))}.st-g3,.st-g2,.st-g21{grid-template-columns:1fr}.st-pr{flex-wrap:wrap}.st-pr .st-prm{flex:1 1 calc(100% - 50px)!important}.st-kpi b{font-size:22px}
 .st-drw{align-items:flex-end}.st-drw>div{height:auto;max-height:92vh;border-left:0;border-top:1px solid var(--g2);border-radius:20px 20px 0 0;animation:stU .22s ease}@keyframes stU{from{transform:translateY(30px)}}
 .st-wrap{max-height:none}.st-hp{display:none}
}
@media (min-width:900px){.st-hponly{display:none}}
.st-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 86px);z-index:2500;width:min(560px,calc(100% - 24px));border-radius:14px;padding:11px 40px 11px 14px;font-size:13.5px;line-height:1.45;box-shadow:0 12px 30px rgba(0,0,0,.25);color:#fff}
.st-banner b{display:block;font-size:12px;opacity:.9;letter-spacing:.04em;text-transform:uppercase}.st-banner button{position:absolute;right:8px;top:8px;border:0;background:rgba(255,255,255,.18);color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer}`;
  document.head.appendChild(s);
}
const IC = {
  ringkas: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>', pengguna: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 11a3 3 0 1 0 0-6M22 21c0-3-1.7-5-4-5.6"/>',
  peran: '<path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>', analisis: '<path d="M4 18l5-12 5 8 3-4 3 8z"/>',
  laporan: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>', galat: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/>', umum: '<path d="M3 11v2l13 5V6z"/><path d="M16 9a3 3 0 0 1 0 6M6 14l1 5h3l-1-4"/>',
  log: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>', sistem: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  tutup: '<path d="M6 6l12 12M18 6L6 18"/>', muat: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', kunci: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unduh: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
};
const svg = (k, w = 18) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k] || ''}</svg>`;
const SEK = [
  ['ringkas', 'Ringkasan', 1], ['pengguna', 'Pengguna', 1], ['peran', 'Peran & akses', 1], ['analisis', 'Analisis SHP', 1], ['laporan', 'Laporan warga', 1],
  ['galat', 'Galat aplikasi', 2], ['umum', 'Pengumuman', 3], ['log', 'Log aktivitas', 3], ['sistem', 'Sistem & data', 1]];

/* ---------------- grafik ---------------- */
function bars(L, c, max = 10) { if (!L || !L.length) return '<p class="st-note">Belum ada data.</p>'; const m = Math.max(1, ...L.map(x => x[1]));
  return L.slice(0, max).map(([k, v]) => `<div class="st-bar" style="--c:${c}"><span title="${esc(k)}">${esc(k)}</span><i style="width:${Math.max(2, v / m * 100)}%"></i><b>${nf(v)}</b></div>`).join(''); }
function kolom(obj, c, label) { const E = Object.entries(obj || {}); if (!E.length) return '<p class="st-note">Belum ada data.</p>';
  const W = 600, H = 150, P = 22, m = Math.max(1, ...E.map(x => x[1])), bw = (W - P) / E.length; let g = '';
  E.forEach(([k, v], i) => { const h = v / m * (H - 34), x = P + i * bw; g += `<rect x="${x + bw * .16}" y="${H - 18 - h}" width="${bw * .68}" height="${Math.max(v ? 2 : 0, h)}" rx="3" fill="${c}"><title>${esc(k)}: ${v}</title></rect>`;
    const tiap = Math.ceil(E.length / 8); if (E.length <= 12 || (i % tiap === 0 && E.length - 1 - i >= tiap / 2) || i === E.length - 1) g += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(label ? label(k) : k)}</text>`; });
  return `<svg class="st-svg" viewBox="0 0 ${W} ${H}"><text x="2" y="12">${nf(m)}</text>${g}</svg>`; }
function cincin(L, warna) { const tot = L.reduce((s, x) => s + x[1], 0) || 1; let a = -Math.PI / 2, g = '';
  L.forEach(([k, v], i) => { const b = a + v / tot * Math.PI * 2, r = 52, cx = 64, cy = 64, l = b - a > Math.PI ? 1 : 0;
    if (v === tot) g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${warna[i % warna.length]}" stroke-width="16"/>`;
    else g += `<path d="M${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} A${r},${r} 0 ${l} 1 ${cx + r * Math.cos(b)},${cy + r * Math.sin(b)}" fill="none" stroke="${warna[i % warna.length]}" stroke-width="16"/>`; a = b; });
  return `<div style="display:flex;gap:16px;align-items:center"><svg viewBox="0 0 128 128" width="118" height="118">${g}<text x="64" y="70" text-anchor="middle" style="fill:#E7ECF5;font:800 18px system-ui">${nf(tot)}</text></svg>
    <div style="flex:1;min-width:0">${L.map(([k, v], i) => `<div style="display:flex;gap:8px;align-items:center;margin:5px 0;font-size:12.5px"><span class="st-dot" style="background:${warna[i % warna.length]}"></span><span style="flex:1;color:#C5CFE2">${esc(k)}</span><b>${nf(v)}</b></div>`).join('')}</div></div>`; }

/* ---------------- kerangka ---------------- */
let SEC = 'ringkas', DATA = {}, ROOT = null;
function tagPeran(p) { return p ? `<span class="st-tag" style="color:${WR[p]}">${NM[p]}</span>` : ''; }
function buka(sec) {
  if (!tingkat()) { toast('Studio khusus pengelola Pantau Rimbak.'); return; }
  css(); if (document.getElementById('studio')) { pindah(sec || SEC); return; } SEC = sec || LS.get('st_sec') || 'ringkas'; if (!SEK.some(s => s[0] === SEC && tingkat() >= s[2])) SEC = 'ringkas';
  const u = U(), p = peranLokal();
  ROOT = document.createElement('div'); ROOT.id = 'studio'; ROOT.setAttribute('role', 'dialog'); ROOT.setAttribute('data-norg', '1'); ROOT.setAttribute('aria-label', 'Pantau Rimbak Studio');
  ROOT.innerHTML = `<aside class="st-side"><div class="st-brand"><i>PR</i><span><b>Pantau Rimbak Studio</b><small>Pusat kelola aplikasi</small></span></div>
      ${SEK.map(([k, t, n]) => `<button class="st-nav" data-s="${k}" ${tingkat() < n ? 'disabled title="Butuh peran lebih tinggi"' : ''}>${svg(k)}${t}${tingkat() < n ? `<span class="kunci">${svg('kunci', 14)}</span>` : ''}</button>`).join('')}
      <div class="st-me"><span class="st-av" style="background:${WR[p]};color:#07101F">${esc(ini(u && u.nama))}</span><span style="min-width:0"><b>${esc(u && u.nama || '')}</b><small>${NM[p] || ''} · ${esc(u && u.email || '')}</small></span></div></aside>
    <main class="st-main"><div class="st-top"><button class="st-ic st-hponly" data-x aria-label="Tutup">${svg('tutup')}</button><div style="min-width:0"><h1 id="stJ"></h1><p id="stS"></p></div><span class="st-sp"></span>
      <span class="st-hp">${tagPeran(p)}</span><button class="st-ic" data-r title="Muat ulang">${svg('muat')}</button><button class="st-ic st-hp" data-x title="Tutup Studio">${svg('tutup')}</button></div>
      <nav class="st-tabs">${SEK.filter(s => tingkat() >= s[2]).map(([k, t]) => `<button data-s="${k}">${t}</button>`).join('')}</nav>
      <div class="st-body" id="stB"></div></main>`;
  document.body.appendChild(ROOT); document.documentElement.style.overflow = 'hidden';
  ROOT.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { if (!b.disabled) pindah(b.dataset.s); });
  ROOT.querySelectorAll('[data-x]').forEach(b => b.onclick = () => tutup());
  ROOT.querySelector('[data-r]').onclick = () => { DATA = {}; pindah(SEC); };
  LAPIS = false; try { if (window.FHApp && FHApp.pushLayer) { FHApp.pushLayer(() => tutup(true)); LAPIS = true; } } catch (e) { }
  try { window.FHAlat && FHAlat.pakai && FHAlat.pakai('admin'); } catch (e) { }
  pindah(SEC);
}
let LAPIS = false;
function tutup(diam) { const r = document.getElementById('studio'); if (r) { r.remove(); document.documentElement.style.overflow = ''; } document.querySelectorAll('.st-drw').forEach(x => x.remove());
  if (!diam && LAPIS) { LAPIS = false; try { history.back(); } catch (e) { } } else if (diam) LAPIS = false; }
const JUDUL = { ringkas: ['Ringkasan', 'Kesehatan aplikasi & pengguna'], pengguna: ['Pengguna', 'Kelola akun, status & pelanggaran'], peran: ['Peran & akses', 'Siapa yang dapat mengelola Studio'],
  analisis: ['Analisis SHP', 'Antrean & hasil analisis wilayah pengguna'], laporan: ['Laporan warga', 'Moderasi laporan asap, api & pembukaan lahan'], galat: ['Galat aplikasi', 'Galat dari HP & website (anonim)'],
  umum: ['Pengumuman', 'Pesan yang tampil di aplikasi semua pengguna'], log: ['Log aktivitas', 'Jejak tindakan pengelola'], sistem: ['Sistem & data', 'Kesegaran data otomatis & versi'] };
function pindah(sec) {
  SEC = sec; LS.set('st_sec', sec);
  ROOT.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === sec));
  const t = ROOT.querySelector('.st-tabs [data-s="' + sec + '"]'); if (t) t.scrollIntoView({ inline: 'center', block: 'nearest' });
  ROOT.querySelector('#stJ').textContent = JUDUL[sec][0]; ROOT.querySelector('#stS').textContent = JUDUL[sec][1];
  const B = ROOT.querySelector('#stB'); B.innerHTML = `<div class="st-grid st-g4">${'<div class="st-sk"></div>'.repeat(4)}</div><div class="st-sk" style="height:260px;margin-top:14px"></div>`;
  (HAL[sec] || HAL.ringkas)(B).catch(e => { B.innerHTML = `<div class="st-card"><p>${esc(e && e.message === 'offline-uji' ? 'Mode uji lokal: server tidak dihubungi.' : 'Tidak dapat memuat. Periksa koneksi internet lalu coba lagi.')}</p></div>`; });
}
const perluV16 = B => { B.innerHTML = `<div class="st-warn"><b>Menunggu pembaruan server (Apps Script v16).</b> Bagian ini aktif otomatis setelah Pengembang memasang v16.</div>`; };
async function ambil(aksi, extra) { const j = await api(Object.assign({ aksi }, extra || {})); if (j && j.galat === 'aksi studio tidak dikenal') throw new Error('v15'); return j; }
async function v16(aksi, extra) {   // null bila server masih v15
  const j = await api(Object.assign({ aksi }, extra || {}));
  if (!j || (j.ok && !('tingkat' in j) && !Object.keys(j).some(k => !['ok', 'status'].includes(k)))) return null;   // v15: aksi tak dikenal → jalur profil
  return j;
}

/* ---------------- halaman ---------------- */
const HAL = {};
HAL.ringkas = async B => {
  let D = await v16('studio_ringkas'), lama = false;
  if (!D) { D = await api({ aksi: 'dasbor' }); lama = true; }
  if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat || 'Gagal memuat')}</p></div>`; return; }
  DATA.ringkas = D; const P = D.pengguna || {};
  const kpi = (t, v, s, c) => `<div class="st-card st-kpi" style="--k:${c}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  const anl = D.analisis_status || {}, lw = D.laporan_warga || {};
  const ftr = (D.fitur || []).map(([k, v]) => [window.FHAdminNama && FHAdminNama[k] || (window.FHLang ? FHLang.t(k) : k), v]);
  B.innerHTML = `${lama ? '<div class="st-warn">Server masih v15: ringkasan dasar & pengguna (hanya baca). Pasang Apps Script v16 untuk semua alat Studio.</div>' : ''}
    ${D.pengumuman ? `<div class="st-card" style="margin-bottom:14px;border-color:rgba(99,102,241,.5)"><h3>Pengumuman aktif</h3><p style="margin:0">${esc(D.pengumuman.teks)}</p></div>` : ''}
    <div class="st-grid st-g4">${kpi('Akun aktif', nf(P.aktif), `${nf(P.online)} online sekarang`, '#10B981')}${kpi('Aktif 7 hari', nf(P.a7), `${nf(P.a1)} dalam 24 jam`, '#6366F1')}
      ${kpi('Analisis SHP', nf(D.analisis_total ?? D.analisis30), D.analisis_total != null ? `${nf(anl.Menunggu || 0)} menunggu · ${nf(anl.Gagal || 0)} gagal` : '30 hari terakhir', '#F59E0B')}
      ${kpi('Laporan warga', nf((lw.Menunggu || 0) + (lw.Terverifikasi || 0) + (lw.Ditolak || 0)), `${nf(lw.Menunggu || 0)} menunggu verifikasi`, '#F43F5E')}</div>
    <div class="st-grid st-g4" style="margin-top:14px">${kpi('Aktif 30 hari', nf(P.a30), '', '#38BDF8')}${kpi('Total buka aplikasi', nf(P.buka), '', '#A78BFA')}
      ${kpi('Wilayah SHP terdaftar', nf(D.wilayah_shp), `${nf(D.langganan)} langganan peringatan`, '#22D3EE')}${kpi('Galat 7 hari', nf(D.galat7), `${nf(P.diblokir)} diblokir · ${nf(P.dihapus)} dihapus`, '#FB7185')}</div>
    <div class="st-grid st-g21" style="margin-top:14px"><div class="st-card"><h3>${D.daftar_harian ? 'Pendaftar baru 30 hari' : 'Pendaftar per bulan'}</h3>${kolom(D.daftar_harian || D.daftar_bulanan, '#10B981', k => k.length > 7 ? k.slice(8) + '/' + k.slice(5, 7) : k.slice(5) + '/' + k.slice(2, 4))}</div>
      <div class="st-card"><h3>Perangkat</h3>${cincin((D.perangkat || []).slice(0, 5), ['#10B981', '#6366F1', '#F59E0B', '#38BDF8', '#F43F5E'])}</div></div>
    <div class="st-grid st-g2" style="margin-top:14px"><div class="st-card"><h3>Fitur paling sering dibuka <small>30 hari</small></h3>${bars(ftr, '#6366F1', 12)}</div>
      <div class="st-card"><h3>Aktivitas harian <small>fitur dibuka</small></h3>${kolom(D.fitur_harian, '#38BDF8', k => k.slice(8))}
        <h3 style="margin-top:14px">Versi aplikasi</h3>${bars(D.versi || [], '#94A3B8', 6)}</div></div>
    <div class="st-grid st-g3" style="margin-top:14px"><div class="st-card"><h3>Wilayah dipantau</h3>${bars(D.hutan_desa || [], '#34D399', 8)}</div>
      <div class="st-card"><h3>Tindak lanjut kejadian</h3>${bars(Object.entries(D.tindak || {}), '#F43F5E', 6)}<p class="st-note">${D.respon_jam ? `Waktu respons median ${nf(D.respon_jam.median, 1)} jam (${D.respon_jam.n} kejadian).` : 'Waktu respons belum tersedia.'}</p></div>
      <div class="st-card"><h3>Lapangan & AI</h3><div class="st-kv" style="margin:0"><div><small>Temuan patroli</small><b>${nf(D.temuan && D.temuan.total)}</b></div><div><small>Temuan 30 hari</small><b>${nf(D.temuan && D.temuan.h30)}</b></div>
        <div><small>Tanya Bara Api 30 hari</small><b>${nf(D.bara30)}</b></div><div><small>Analisis 30 hari</small><b>${nf(D.analisis30)}</b></div></div></div></div>
    <p class="st-note" style="margin-top:14px">Diperbarui ${new Date(D.dibuat || Date.now()).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB · pemakaian fitur dihitung tanpa identitas pengguna (UU 27/2022).</p>`;
};

HAL.pengguna = async B => {
  let D = await v16('studio_pengguna'), lama = false;
  if (!D) { const d = await api({ aksi: 'dasbor' }); lama = true; D = { ok: d.ok, galat: d.galat, pengguna: (d.daftar_pengguna || []).map(x => Object.assign({ id: '', peran: '' }, x)) }; }
  if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat || 'Gagal memuat')}</p></div>`; return; }
  DATA.pengguna = D.pengguna;
  let q = '', f = 'semua', urut = 'aktif';
  const F = [['semua', 'Semua'], ['online', 'Online'], ['aktif7', 'Aktif 7 hari'], ['baru', 'Baru 30 hari'], ['diblokir', 'Diblokir'], ['staf', 'Pengelola'], ['shp', 'Punya analisis']];
  B.innerHTML = `${lama ? '<div class="st-warn">Server masih v15: daftar hanya baca. Blokir, hapus & rincian aktif setelah Apps Script v16.</div>' : ''}
    <div class="st-tool"><input type="search" id="stQ" placeholder="Cari nama, email, wilayah, perangkat…" aria-label="Cari pengguna">
      <select id="stO" aria-label="Urutkan"><option value="aktif">Terakhir aktif</option><option value="daftar">Terbaru daftar</option><option value="nama">Nama A–Z</option><option value="buka">Paling sering buka</option></select>
      ${tingkat() >= 3 && !lama ? `<button class="st-btn" id="stCsv">${svg('unduh', 15)} CSV</button>` : ''}</div>
    <div class="st-tool" id="stF">${F.map(([k, t]) => `<button class="st-chip${k === f ? ' on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
    <div class="st-wrap"><table class="st-tb"><thead><tr><th>Pengguna</th><th class="st-hp">Peran</th><th>Status</th><th class="st-hp">Terakhir aktif</th><th class="st-hp">Perangkat</th><th class="st-hp">Wilayah</th><th class="st-hp" style="text-align:right">Buka</th></tr></thead><tbody id="stT"></tbody></table></div>
    <p class="st-note" id="stN" style="margin-top:10px"></p>`;
  const now = Date.now();
  const lolos = x => { const s = (x.nama + ' ' + x.email + ' ' + x.hd + ' ' + x.perangkat + ' ' + x.versi + ' ' + (NM[x.peran] || '')).toLowerCase();
    if (q && !s.includes(q)) return false;
    return f === 'semua' || (f === 'online' && x.online) || (f === 'aktif7' && now - (x.aktif_ms || 0) < 7 * 864e5) || (f === 'baru' && now - (x.daftar_ms || 0) < 30 * 864e5) ||
      (f === 'diblokir' && x.status === 'Diblokir') || (f === 'staf' && (x.peran || PENGEMBANG.includes(x.email))) || (f === 'shp' && x.analisis > 0); };
  const gambar = () => {
    const L = D.pengguna.filter(lolos).sort((a, b) => urut === 'nama' ? a.nama.localeCompare(b.nama) : urut === 'daftar' ? (b.daftar_ms || 0) - (a.daftar_ms || 0) : urut === 'buka' ? b.buka - a.buka : (b.aktif_ms || 0) - (a.aktif_ms || 0));
    B.querySelector('#stT').innerHTML = L.length ? L.map(x => { const p = x.peran || (PENGEMBANG.includes(x.email) ? 'pengembang' : '');
      return `<tr class="klik" data-id="${esc(x.id || x.email)}"><td><div class="st-u"><span class="st-av" style="${p ? `background:${WR[p]};color:#07101F` : ''}">${esc(ini(x.nama))}</span><span style="min-width:0"><b>${esc(x.nama || '(tanpa nama)')}${x.online ? ' <span class="st-dot" style="background:#10B981" title="online"></span>' : ''}</b><small>${esc(x.email)}</small></span></div></td>
        <td class="st-hp">${tagPeran(p) || '<span class="st-note">Pengguna</span>'}</td><td>${x.status === 'Diblokir' ? '<span class="st-tag" style="color:#FB7185">Diblokir</span>' : '<span class="st-tag" style="color:#34D399">Aktif</span>'}</td>
        <td class="st-hp">${esc(lalu(x.aktif_ms))}</td><td class="st-hp">${esc(x.perangkat || '–')}</td><td class="st-hp" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.hd || '–')}</td><td class="st-hp" style="text-align:right">${nf(x.buka)}</td></tr>`; }).join('')
      : `<tr><td colspan="7" class="st-empty">Tidak ada pengguna yang cocok.</td></tr>`;
    B.querySelector('#stN').textContent = `${L.length} dari ${D.pengguna.length} akun${D.dihapus ? ` · ${D.dihapus} akun telah dihapus` : ''}. Ketuk baris untuk rincian & tindakan.`;
    B.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => rincianPengguna(D.pengguna.find(x => (x.id || x.email) === tr.dataset.id), lama, () => HAL.pengguna(B)));
  };
  B.querySelector('#stQ').oninput = e => { q = e.target.value.trim().toLowerCase(); gambar(); };
  B.querySelector('#stO').onchange = e => { urut = e.target.value; gambar(); };
  B.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; B.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); gambar(); });
  const c = B.querySelector('#stCsv'); if (c) c.onclick = () => {
    const K = ['nama', 'email', 'hp', 'peran', 'status', 'daftar', 'aktif', 'buka', 'hd', 'perangkat', 'versi', 'analisis', 'temuan', 'laporan', 'catatan'];
    const s = '﻿' + K.join(';') + '\n' + D.pengguna.map(x => K.map(k => '"' + String(x[k] ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = 'pengguna-pantau-rimbak.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    catatLokal('Ekspor CSV pengguna'); };
  gambar();
};
function catatLokal() { }
function laci(html) { const d = document.createElement('div'); d.className = 'st-drw'; d.innerHTML = `<div role="dialog">${html}</div>`; document.getElementById('studio').appendChild(d);
  d.onclick = e => { if (e.target === d) d.remove(); }; d.querySelectorAll('[data-tl]').forEach(b => b.onclick = () => d.remove()); return d; }
function rincianPengguna(x, lama, segar) {
  if (!x) return; const T = tingkat(), p = x.peran || (PENGEMBANG.includes(x.email) ? 'pengembang' : ''), tp = TK[p] || 0, bisa = !lama && T >= 3 && tp < T && !PENGEMBANG.includes(x.email) && x.email !== String((U() || {}).email || '').toLowerCase();
  const d = laci(`<div style="display:flex;gap:12px;align-items:center"><span class="st-av" style="width:52px;height:52px;font-size:17px;${p ? `background:${WR[p]};color:#07101F` : ''}">${esc(ini(x.nama))}</span>
      <div style="flex:1;min-width:0"><b style="font-size:17px">${esc(x.nama || '(tanpa nama)')}</b><div class="st-note" style="word-break:break-all">${esc(x.email)}</div><div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">${tagPeran(p)}${x.status === 'Diblokir' ? '<span class="st-tag" style="color:#FB7185">Diblokir</span>' : '<span class="st-tag" style="color:#34D399">Aktif</span>'}${x.online ? '<span class="st-tag" style="color:#34D399">● Online</span>' : ''}</div></div>
      <button class="st-ic" data-tl aria-label="Tutup">${svg('tutup')}</button></div>
    <div class="st-kv"><div><small>Terdaftar</small><b>${esc(x.daftar || '–')}</b></div><div><small>Terakhir aktif</small><b>${esc(lalu(x.aktif_ms))}</b></div>
      <div><small>Membuka aplikasi</small><b>${nf(x.buka)}×</b></div><div><small>Perangkat</small><b>${esc(x.perangkat || '–')}</b></div><div><small>Versi aplikasi</small><b>${esc(x.versi || '–')}</b></div><div><small>Wilayah dipantau</small><b>${esc(x.hd || '–')}</b></div>
      ${lama ? '' : `<div><small>Analisis SHP</small><b>${nf(x.analisis)}</b></div><div><small>Temuan patroli</small><b>${nf(x.temuan)}</b></div><div><small>Laporan warga</small><b>${nf(x.laporan)}</b></div>${x.umur ? `<div><small>Umur</small><b>${nf(x.umur)} th</b></div>` : ''}`}</div>
    ${x.hp ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="st-btn" style="text-decoration:none" href="${esc(x.wa)}" target="_blank" rel="noopener">WhatsApp ${esc(x.hp)}</a><a class="st-btn" style="text-decoration:none" href="mailto:${esc(x.email)}">Kirim email</a></div>` : ''}
    ${x.perangkat_rinci ? `<p class="st-note">${esc(x.perangkat_rinci)}</p>` : ''}
    ${bisa ? `<h4 style="margin:18px 0 6px">Catatan admin</h4><textarea id="stC" rows="3" style="width:100%" maxlength="300" placeholder="Catatan internal (terlihat juga oleh pengguna bila akun diblokir)">${esc(x.catatan || '')}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="st-btn" id="stCs">Simpan catatan</button>${x.status === 'Diblokir' ? '<button class="st-btn pri" id="stAk">Aktifkan kembali</button>' : '<button class="st-btn bah" id="stBl">Blokir akun</button>'}</div>
      ${T >= 3 && !p ? `<h4 style="margin:18px 0 6px">Jadikan pengelola</h4><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="stPr">${T >= 4 ? '<option value="admin">Admin</option>' : ''}<option value="editor">Editor</option><option value="pemantau">Pemantau</option></select><button class="st-btn ung" id="stPrB">Tetapkan peran</button></div>` : ''}
      <div class="st-zone"><h4>Hapus pengguna</h4><p class="st-note" style="margin:0 0 8px">Untuk pelanggaran penggunaan. Biodata, kata sandi, foto, wilayah SHP, unggahan, hasil analisis, posisi & langganan peringatan dihapus permanen dan <b>tidak dapat dibatalkan</b>. Temuan patroli tetap disimpan tanpa nama.</p>
        <input id="stAl" placeholder="Alasan (mis. data palsu, penyalahgunaan)" style="width:100%;margin-bottom:8px" maxlength="300"><input id="stKf" placeholder="Ketik email pengguna untuk konfirmasi" style="width:100%" autocomplete="off">
        <label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px"><input type="checkbox" id="stBt" checked style="width:auto"> Beri tahu pengguna lewat email</label>
        <button class="st-btn bah" id="stHp" disabled>Hapus pengguna permanen</button></div>`
    : lama ? '' : `<p class="st-note" style="margin-top:16px">${PENGEMBANG.includes(x.email) ? 'Akun Pengembang tidak dapat diubah dari Studio.' : T < 3 ? 'Peran Anda hanya dapat melihat. Tindakan pengguna memerlukan Admin.' : 'Akun ini setara atau lebih tinggi dari peran Anda.'}</p>`}`);
  const kirim = async (b, isi, ok) => { const t = b.textContent; b.disabled = true; b.textContent = 'Memproses…';
    try { const j = await api(isi); if (j && j.ok) { toast(ok); d.remove(); DATA = {}; segar(); } else { toast(j && j.galat || 'Gagal'); b.disabled = false; b.textContent = t; } } catch (e) { toast('Tidak ada koneksi'); b.disabled = false; b.textContent = t; } };
  const q = s => d.querySelector(s);
  if (q('#stCs')) q('#stCs').onclick = () => kirim(q('#stCs'), { aksi: 'studio_pengguna_set', target: x.id, catatan: q('#stC').value }, 'Catatan disimpan');
  if (q('#stBl')) q('#stBl').onclick = () => { if (confirm('Blokir ' + (x.nama || x.email) + '? Pengguna tidak dapat masuk sampai diaktifkan kembali.')) kirim(q('#stBl'), { aksi: 'studio_pengguna_set', target: x.id, status: 'Diblokir', catatan: q('#stC').value }, 'Akun diblokir'); };
  if (q('#stAk')) q('#stAk').onclick = () => kirim(q('#stAk'), { aksi: 'studio_pengguna_set', target: x.id, status: 'Aktif', catatan: q('#stC').value }, 'Akun diaktifkan kembali');
  if (q('#stPrB')) q('#stPrB').onclick = () => kirim(q('#stPrB'), { aksi: 'studio_peran_set', email: x.email, peran: q('#stPr').value }, 'Peran ditetapkan & email pemberitahuan dikirim');
  if (q('#stKf')) { q('#stKf').oninput = e => { q('#stHp').disabled = e.target.value.trim().toLowerCase() !== x.email; };
    q('#stHp').onclick = () => kirim(q('#stHp'), { aksi: 'studio_pengguna_hapus', target: x.id, konfirmasi: q('#stKf').value.trim(), alasan: q('#stAl').value.trim(), beri_tahu: q('#stBt').checked }, 'Pengguna dihapus'); }
}

HAL.peran = async B => {
  const D = await v16('studio_peran_daftar'); if (!D) return perluV16(B);
  if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat)}</p></div>`; return; }
  const T = tingkat();
  const urut = ['pengembang', 'admin', 'editor', 'pemantau'];
  const L = D.peran.slice().sort((a, b) => urut.indexOf(a.peran) - urut.indexOf(b.peran));
  const hit = k => L.filter(x => x.peran === k).length;
  B.innerHTML = `<div class="st-grid st-g4">${urut.map(k => `<div class="st-card st-kpi" style="--k:${WR[k]}"><small>${NM[k]}</small><b>${hit(k)}</b><span style="color:${WR[k]}">${k === 'pengembang' ? 'tetap' : 'aktif'}</span></div>`).join('')}</div>
    <div class="st-grid st-g21" style="margin-top:14px"><div class="st-card"><h3>Tim pengelola <small>${L.length} orang</small></h3>
      ${L.map(x => { const ubah = T >= 3 && !x.tetap && (TK[x.peran] || 0) < T;
        return `<div class="st-pr" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--g)"><span class="st-av" style="background:${WR[x.peran]};color:#07101F">${esc(ini(x.nama || x.email))}</span>
        <span class="st-prm" style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(x.nama || x.email)}</b><small class="st-note">${esc(x.email)}${x.terdaftar ? '' : ' · <span style="color:#FCD34D">belum punya akun</span>'}${x.oleh ? ' · oleh ' + esc(x.oleh) : ''}</small></span>
        ${ubah ? `<select data-ub="${esc(x.email)}" aria-label="Ubah peran">${(T >= 4 ? ['admin', 'editor', 'pemantau'] : ['editor', 'pemantau']).map(k => `<option value="${k}"${k === x.peran ? ' selected' : ''}>${NM[k]}</option>`).join('')}</select><button class="st-btn bah" data-cb="${esc(x.email)}" title="Cabut peran">Cabut</button>` : tagPeran(x.peran)}</div>`; }).join('')}</div>
      <div class="st-card"><h3>Tambah pengelola</h3>${T >= 3 ? `<label class="st-note">Email</label><input id="stE" type="email" placeholder="nama@contoh.org" style="width:100%;margin:4px 0 10px">
        <label class="st-note">Peran</label><select id="stP" style="width:100%;margin:4px 0 10px">${T >= 4 ? '<option value="admin">Admin</option>' : ''}<option value="editor" selected>Editor</option><option value="pemantau">Pemantau</option></select>
        <input id="stCt" placeholder="Catatan (opsional, mis. staf GIS)" style="width:100%;margin-bottom:10px" maxlength="200"><button class="st-btn pri" id="stAdd" style="width:100%">Tambahkan & kirim email</button>
        <p class="st-note">Orang tersebut menerima email undangan. Begitu masuk ke aplikasi dengan email itu, menu <b>Studio</b> muncul di Profil dengan dasbor sesuai perannya.</p>` : '<p class="st-note">Hanya Admin dan Pengembang yang dapat menambah pengelola.</p>'}</div></div>
    <div class="st-card" style="margin-top:14px;overflow:auto"><h3>Izin setiap peran</h3><table class="st-mx"><tr><th>Kemampuan</th>${urut.map(k => `<th style="color:${WR[k]}">${NM[k]}</th>`).join('')}</tr>
      ${[['Lihat ringkasan, pengguna, analisis, laporan', 1], ['Verifikasi laporan warga & jalankan ulang analisis', 2], ['Lihat galat aplikasi', 2], ['Blokir / hapus pengguna', 3], ['Tambah Editor & Pemantau', 3], ['Pengumuman & log aktivitas', 3], ['Tambah / cabut Admin', 4]]
        .map(([t, n]) => `<tr><td>${t}</td>${urut.map(k => `<td>${TK[k] >= n ? '<span class="st-ok">●</span>' : '<span class="st-no">○</span>'}</td>`).join('')}</tr>`).join('')}</table>
      <p class="st-note">${urut.map(k => `<b style="color:${WR[k]}">${NM[k]}</b>: ${IZIN[k]}`).join('<br>')}</p></div>`;
  const kirim = async (b, isi, ok) => { b.disabled = true; try { const j = await api(isi); toast(j && j.ok ? ok : (j && j.galat) || 'Gagal'); if (j && j.ok) HAL.peran(B); else b.disabled = false; } catch (e) { toast('Tidak ada koneksi'); b.disabled = false; } };
  const add = B.querySelector('#stAdd'); if (add) add.onclick = () => { const em = B.querySelector('#stE').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em)) { toast('Email tidak valid'); return; }
    kirim(add, { aksi: 'studio_peran_set', email: em, peran: B.querySelector('#stP').value, catatan: B.querySelector('#stCt').value }, 'Pengelola ditambahkan & email undangan dikirim'); };
  B.querySelectorAll('[data-ub]').forEach(s => s.onchange = () => kirim(s, { aksi: 'studio_peran_set', email: s.dataset.ub, peran: s.value }, 'Peran diubah'));
  B.querySelectorAll('[data-cb]').forEach(b => b.onclick = () => { if (confirm('Cabut peran ' + b.dataset.cb + '? Orang ini kembali menjadi pengguna biasa.')) kirim(b, { aksi: 'studio_peran_hapus', email: b.dataset.cb }, 'Peran dicabut'); });
};

HAL.analisis = async B => {
  const D = await v16('studio_analisis'); if (!D) return perluV16(B); if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat)}</p></div>`; return; }
  let f = 'semua'; const W = { Selesai: '#34D399', Menunggu: '#FCD34D', Diproses: '#38BDF8', Gagal: '#FB7185' };
  const st = {}; D.analisis.forEach(x => st[x.status] = (st[x.status] || 0) + 1);
  B.innerHTML = `<div class="st-grid st-g4">${['Selesai', 'Menunggu', 'Diproses', 'Gagal'].map(k => `<div class="st-card st-kpi" style="--k:${W[k]}"><small>${k}</small><b>${nf(st[k] || 0)}</b></div>`).join('')}</div>
    <div class="st-tool" style="margin-top:14px">${['semua', 'Selesai', 'Menunggu', 'Diproses', 'Gagal'].map(k => `<button class="st-chip${k === f ? ' on' : ''}" data-f="${k}">${k === 'semua' ? 'Semua' : k}</button>`).join('')}</div>
    <div class="st-wrap"><table class="st-tb"><thead><tr><th>Wilayah</th><th class="st-hp">Pengguna</th><th style="text-align:right">Luas (ha)</th><th>Status</th><th class="st-hp">Diterima</th><th></th></tr></thead><tbody id="stT"></tbody></table></div>`;
  const gb = () => { const L = D.analisis.filter(x => f === 'semua' || x.status === f);
    B.querySelector('#stT').innerHTML = L.length ? L.map(x => `<tr><td><b>${esc(x.area)}</b>${x.catatan ? `<small class="st-note" style="display:block">${esc(x.catatan)}</small>` : ''}</td><td class="st-hp">${esc(x.nama_pengguna)}<small class="st-note" style="display:block">${esc(x.email)}</small></td>
      <td style="text-align:right">${nf(x.luas, 1)}</td><td><span class="st-tag" style="color:${W[x.status] || '#94A3B8'}">${esc(x.status)}</span></td><td class="st-hp">${esc(String(x.diterima).slice(0, 16))}</td>
      <td>${tingkat() >= 2 && x.status !== 'Menunggu' && x.status !== 'Diproses' ? `<button class="st-btn" data-ul="${esc(x.aid)}">Jalankan ulang</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="st-empty">Tidak ada analisis.</td></tr>';
    B.querySelectorAll('[data-ul]').forEach(b => b.onclick = async () => { b.disabled = true; const j = await api({ aksi: 'studio_analisis_ulang', aid: b.dataset.ul }); toast(j.ok ? 'Masuk antrean, diproses ±5–15 menit' : j.galat); if (j.ok) HAL.analisis(B); else b.disabled = false; }); };
  B.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; B.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); gb(); }); gb();
};

HAL.laporan = async B => {
  const D = await api({ aksi: 'lapor_daftar' }); if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat)}</p></div>`; return; }
  const bolehUbah = tingkat() >= 2 && D.editor !== false; let f = 'Menunggu';
  const W = { Menunggu: '#FCD34D', Terverifikasi: '#34D399', Ditolak: '#FB7185' }; const st = {}; D.laporan.forEach(x => st[x.status] = (st[x.status] || 0) + 1);
  B.innerHTML = `<div class="st-tool">${['Menunggu', 'Terverifikasi', 'Ditolak', 'semua'].map(k => `<button class="st-chip${k === f ? ' on' : ''}" data-f="${k}">${k === 'semua' ? 'Semua' : k} ${k === 'semua' ? D.laporan.length : st[k] || 0}</button>`).join('')}</div><div class="st-grid st-g2" id="stL"></div>`;
  const gb = () => { const L = D.laporan.filter(x => f === 'semua' || x.status === f);
    B.querySelector('#stL').innerHTML = L.length ? L.map(x => `<div class="st-card"><h3><span class="st-tag" style="color:${W[x.status]}">${esc(x.status)}</span> ${esc(x.jenis)}<small>${new Date(x.t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}</small></h3>
      <p style="margin:0 0 6px">${esc(x.ket || '–')}</p><p class="st-note" style="margin:0">${esc(x.wil || '')} · <a style="color:#7DD3FC" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${x.la},${x.lo}">${nf(x.la, 5)}, ${nf(x.lo, 5)}</a>${x.pelapor ? ' · ' + esc(x.pelapor) : ''}${x.nfoto ? ` · ${x.nfoto} foto` : ''}</p>
      ${(x.foto || []).length ? `<p style="margin:6px 0 0">${x.foto.map((u, i) => `<a class="st-chip" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(u)}">Foto ${i + 1}</a>`).join(' ')}</p>` : ''}
      ${bolehUbah ? `<input data-cat="${esc(x.uid)}" placeholder="Catatan publik (opsional)" value="${esc(x.catatan)}" style="width:100%;margin-top:10px" maxlength="300"><div style="display:flex;gap:8px;margin-top:8px">${x.status !== 'Terverifikasi' ? `<button class="st-btn pri" data-v="${esc(x.uid)}" data-s="Terverifikasi">Verifikasi</button>` : ''}${x.status !== 'Ditolak' ? `<button class="st-btn bah" data-v="${esc(x.uid)}" data-s="Ditolak">Tolak</button>` : ''}</div>` : ''}</div>`).join('')
      : '<div class="st-card st-empty">Tidak ada laporan di kategori ini.</div>';
    B.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => { b.disabled = true; const c = B.querySelector(`[data-cat="${b.dataset.v}"]`);
      const j = await api({ aksi: 'lapor_verifikasi', uid: b.dataset.v, status: b.dataset.s, catatan: c ? c.value : '' }); toast(j.ok ? 'Status laporan diperbarui' : j.galat); if (j.ok) HAL.laporan(B); else b.disabled = false; }); };
  B.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; B.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); gb(); }); gb();
};

HAL.galat = async B => {
  const D = await v16('studio_galat'); if (!D) return perluV16(B); if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat)}</p></div>`; return; }
  const grup = {}; D.galat.forEach(x => { const k = x.pesan + '|' + x.sumber.replace(/:\d+(:\d+)?$/, ''); const g = grup[k] = grup[k] || { pesan: x.pesan, sumber: x.sumber, n: 0, akhir: x.t, versi: new Set(), mode: new Set() }; g.n += x.n; g.versi.add(x.versi); g.mode.add(x.mode); });
  const L = Object.values(grup).sort((a, b) => b.n - a.n);
  B.innerHTML = `<div class="st-grid st-g3"><div class="st-card st-kpi" style="--k:#FB7185"><small>Kejadian galat</small><b>${nf(D.galat.reduce((s, x) => s + x.n, 0))}</b><span>500 catatan terakhir</span></div><div class="st-card st-kpi" style="--k:#F59E0B"><small>Jenis galat unik</small><b>${nf(L.length)}</b></div><div class="st-card st-kpi" style="--k:#38BDF8"><small>Terakhir</small><b style="font-size:16px">${esc(D.galat[0] ? String(D.galat[0].t).slice(0, 16) : '–')}</b></div></div>
    <div class="st-wrap" style="margin-top:14px"><table class="st-tb"><thead><tr><th>Pesan galat</th><th style="text-align:right">Jumlah</th><th class="st-hp">Versi</th><th class="st-hp">Terakhir</th></tr></thead><tbody>
    ${L.length ? L.map(g => `<tr><td><b style="font-family:ui-monospace,monospace;font-size:12.5px;word-break:break-word">${esc(g.pesan)}</b><small class="st-note" style="display:block;word-break:break-all">${esc(g.sumber)} · ${esc([...g.mode].join(', '))}</small></td><td style="text-align:right">${nf(g.n)}</td><td class="st-hp">${esc([...g.versi].slice(0, 3).join(', '))}</td><td class="st-hp">${esc(String(g.akhir).slice(0, 16))}</td></tr>`).join('') : '<tr><td colspan="4" class="st-empty">Tidak ada galat tercatat. 🎉</td></tr>'}</tbody></table></div>
    <p class="st-note">Galat dikirim otomatis tanpa nama/email/lokasi. Galat yang sama digabung.</p>`;
};

HAL.umum = async B => {
  const R = DATA.ringkas || await v16('studio_ringkas'); if (!R) return perluV16(B);
  const P = R.pengumuman;
  B.innerHTML = `<div class="st-grid st-g2"><div class="st-card"><h3>Tulis pengumuman</h3><textarea id="stT" rows="4" maxlength="400" style="width:100%" placeholder="Contoh: Pemeliharaan server Sabtu 22.00–23.00 WIB. Data tetap tersedia luring.">${esc(P ? P.teks : '')}</textarea>
      <div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap"><select id="stJ2"><option value="info">Info</option><option value="penting">Penting</option><option value="pemeliharaan">Pemeliharaan</option></select><select id="stH"><option value="1">1 hari</option><option value="3">3 hari</option><option value="7" selected>7 hari</option><option value="14">14 hari</option><option value="30">30 hari</option></select></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="st-btn pri" id="stPs">Pasang pengumuman</button>${P ? '<button class="st-btn bah" id="stHp">Hapus pengumuman</button>' : ''}</div>
      <p class="st-note">Tampil sebagai pita di atas aplikasi & website untuk semua pengguna, bisa ditutup pengguna. Tercatat di log aktivitas.</p></div>
    <div class="st-card"><h3>Pratinjau</h3><div id="stPv" style="position:relative;min-height:90px"></div>${P ? `<p class="st-note">Aktif sejak ${esc(P.waktu)} oleh ${esc(P.oleh)} · berakhir ${new Date(P.sampai).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</p>` : '<p class="st-note">Belum ada pengumuman aktif.</p>'}</div></div>`;
  if (P) B.querySelector('#stJ2').value = P.jenis;
  const pv = () => { B.querySelector('#stPv').innerHTML = pita({ teks: B.querySelector('#stT').value || 'Tulis pesan…', jenis: B.querySelector('#stJ2').value }, true); };
  B.querySelector('#stT').oninput = pv; B.querySelector('#stJ2').onchange = pv; pv();
  const kirim = async (b, teks) => { b.disabled = true; const j = await api({ aksi: 'studio_pengumuman_set', teks, jenis: B.querySelector('#stJ2').value, hari: B.querySelector('#stH').value }); toast(j.ok ? (teks ? 'Pengumuman dipasang' : 'Pengumuman dihapus') : j.galat);
    if (j.ok) { DATA.ringkas = null; HAL.umum(B); } else b.disabled = false; };
  B.querySelector('#stPs').onclick = e => { const t = B.querySelector('#stT').value.trim(); if (!t) { toast('Tulis pesan dulu'); return; } kirim(e.target, t); };
  const h = B.querySelector('#stHp'); if (h) h.onclick = () => kirim(h, '');
};

HAL.log = async B => {
  const D = await v16('studio_log'); if (!D) return perluV16(B); if (!D.ok) { B.innerHTML = `<div class="st-card"><p>${esc(D.galat)}</p></div>`; return; }
  let q = '';
  B.innerHTML = `<div class="st-tool"><input type="search" id="stQ" placeholder="Cari pelaku, aksi atau sasaran…"></div><div class="st-wrap"><table class="st-tb"><thead><tr><th>Waktu (WIB)</th><th>Pelaku</th><th>Aksi</th><th class="st-hp">Sasaran</th><th class="st-hp">Rincian</th></tr></thead><tbody id="stT"></tbody></table></div>`;
  const gb = () => { const L = D.log.filter(x => !q || (x.oleh + x.aksi + x.sasaran + x.rinci).toLowerCase().includes(q));
    B.querySelector('#stT').innerHTML = L.length ? L.map(x => `<tr><td style="white-space:nowrap">${esc(String(x.t).slice(0, 16))}</td><td>${esc(x.oleh)}<small class="st-note" style="display:block">${esc(NM[x.peran] || x.peran)}</small></td><td><b>${esc(x.aksi)}</b><small class="st-note st-hponly" style="display:block">${esc(x.sasaran)}</small></td><td class="st-hp">${esc(x.sasaran)}</td><td class="st-hp">${esc(x.rinci)}</td></tr>`).join('') : '<tr><td colspan="5" class="st-empty">Belum ada aktivitas.</td></tr>'; };
  B.querySelector('#stQ').oninput = e => { q = e.target.value.toLowerCase(); gb(); }; gb();
};

HAL.sistem = async B => {
  const J = u => fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const [hs, pk, ik, bj, vg, ot] = await Promise.all([J('data/hotspots.json'), J('data/prakiraan.json'), J('data/iklim/indeks.json'), J('data/banjir/indeks.json'), J('data/vegetasi/indeks.json'), J('aplikasi/paket/terbaru.json')]);
  let srv = VERSI_SERVER; if (!srv) { await segarkanPeran(); srv = VERSI_SERVER; }
  const umur = t => { const ms = Date.parse(t); return isFinite(ms) ? (Date.now() - ms) / 36e5 : null; };
  const baris = (nm, t, batas, ket) => { const u = umur(t), ok = u != null && u <= batas; return `<tr><td><b>${nm}</b><small class="st-note" style="display:block">${ket}</small></td><td>${u == null ? '–' : u < 1 ? Math.round(u * 60) + ' mnt lalu' : nf(u, 1) + ' jam lalu'}</td><td><span class="st-tag" style="color:${ok ? '#34D399' : '#FB7185'}">${ok ? 'Segar' : 'Perlu dicek'}</span></td></tr>`; };
  let sw = '–'; try { const r = await fetch('sw.js', { cache: 'no-store' }); sw = ((await r.text()).match(/pa-v\d+/) || ['–'])[0]; } catch (e) { }
  B.innerHTML = `<div class="st-grid st-g4"><div class="st-card st-kpi" style="--k:#10B981"><small>Server pengguna</small><b>${srv ? 'v' + srv : '–'}</b><span>${srv >= 16 ? 'Studio lengkap' : 'pasang v16 untuk Studio lengkap'}</span></div>
      <div class="st-card st-kpi" style="--k:#6366F1"><small>Versi website</small><b style="font-size:20px">${esc(sw)}</b></div>
      <div class="st-card st-kpi" style="--k:#F59E0B"><small>Paket pembaruan aplikasi</small><b style="font-size:20px">${esc(ot ? ot.versi : '–')}</b><span>${ot ? nf(ot.ukuran / 1e6, 1) + ' MB · checksum SHA-256' : ''}</span></div>
      <div class="st-card st-kpi" style="--k:#38BDF8"><small>Versi isi terpasang di perangkat ini</small><b style="font-size:20px">${esc((window.FHNative && FHNative.versiIsi && FHNative.versiIsi()) || 'web')}</b></div></div>
    <div class="st-wrap" style="margin-top:14px"><table class="st-tb"><thead><tr><th>Data otomatis</th><th>Diperbarui</th><th>Status</th></tr></thead><tbody>
      ${baris('Titik panas NASA FIRMS', hs && hs.diperbarui_utc, 9, 'tiap ± 3 jam')}${baris('Prakiraan cuaca & bahaya kebakaran', pk && pk.diperbarui_utc, 30, 'ECMWF · BMKG')}
      ${baris('Iklim & Indeks Siaga Desa', ik && ik.diperbarui_utc, 30, 'ENSO NOAA · ERA5-Land')}${baris('Debit sungai & banjir', bj && bj.diperbarui_utc, 50, 'GloFAS harian')}${baris('Vegetasi MODIS', vg && vg.diperbarui_utc, 24 * 20, 'citra 8–16 harian')}</tbody></table></div>
    <p class="st-note">Pemantauan otomatis juga berjalan tiap 6 jam dan uji menyeluruh tiap malam; masalah dilaporkan ke email Pengembang.</p>`;
};

/* ---------------- pengumuman untuk semua pengguna ---------------- */
function pita(P, pratinjau) { const W = { info: '#2563EB', penting: '#B91C1C', pemeliharaan: '#B45309' }, J = { info: 'Info', penting: 'Penting', pemeliharaan: 'Pemeliharaan' };
  return `<div class="st-banner" style="background:${W[P.jenis] || W.info};${pratinjau ? 'position:relative;left:auto;top:auto;transform:none;width:100%' : ''}"><b>${J[P.jenis] || 'Info'} · Pantau Rimbak</b>${esc(P.teks)}<button aria-label="Tutup">×</button></div>`; }
async function pengumuman() {
  try { const a = AK(), ep = a && a.endpoint && a.endpoint(); if (!ep || navigator.onLine === false) return;
    const r = await fetch(ep + (ep.includes('?') ? '&' : '?') + 'pengumuman=1', { cache: 'no-store' }); const j = await r.json(); const P = j && j.pengumuman; if (!P || !P.teks) return;
    const k = 'pr_umum_' + (P.waktu || P.teks.slice(0, 20)); if (LS.get(k)) return; css();
    const d = document.createElement('div'); d.innerHTML = pita(P); const el = d.firstChild; el.setAttribute('data-norg', '1'); document.body.appendChild(el);
    el.querySelector('button').onclick = () => { LS.set(k, 1); el.remove(); };
  } catch (e) { }
}

/* ---------------- pintu masuk (Profil & ubin) ---------------- */
function pasangPintu() {
  const t = tingkat(), box = document.getElementById('pfCard'); let el = document.getElementById('pfStudio');
  if (!t) { if (el) el.remove(); return; }
  if (!box) return;
  if (!el) { el = document.createElement('button'); el.id = 'pfStudio'; el.className = 'group tap'; el.type = 'button'; el.style.cssText = 'display:flex;gap:14px;align-items:center;padding:14px;width:100%;text-align:left;margin-bottom:12px;background:linear-gradient(135deg,#0B1324,#1E1B4B);color:#fff;border:0'; box.insertAdjacentElement('afterend', el); }
  const p = peranLokal();
  el.innerHTML = `<span style="width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:conic-gradient(from 200deg,#10B981,#6366F1,#F59E0B,#10B981);color:#06101F;font-weight:900;flex:none">PR</span><span style="flex:1;min-width:0"><b style="display:block;font-size:15.5px">Pantau Rimbak Studio</b><small style="opacity:.8">${NM[p] || ''} · kelola pengguna, peran & data</small></span><span style="opacity:.7">›</span>`;
  el.onclick = () => buka();
}
function init() {
  pasangPintu(); setTimeout(segarkanPeran, 2500); setTimeout(pengumuman, 4000);
  try { AK() && AK().onChange && AK().onChange(() => { PERAN = null; pasangPintu(); setTimeout(segarkanPeran, 500); }); } catch (e) { }
  try { if (/[?&]studio=1/.test(location.search)) setTimeout(() => tingkat() ? buka() : toast('Masuk dengan akun pengelola untuk membuka Studio.'), 3500); } catch (e) { }
  window.addEventListener('popstate', () => { if (document.getElementById('studio') && !(window.FHApp && FHApp.pushLayer)) tutup(true); });
}
window.FHStudio = { open: buka, tutup, tingkat, peran: peranLokal, segarkan: segarkanPeran, pasangPintu, pengumuman };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
