/* Fire Hotspot – Tim lapangan (khusus admin): peta posisi pengguna yang menyetujui berbagi lokasi.
 * Sumber: lembar "Posisi Terakhir" & "Riwayat Posisi" di database pengguna PRCF (Apps Script v6, aksi posisi_tim / posisi_jalur).
 * Server memeriksa ulang bahwa peminta adalah admin; aplikasi hanya menampilkan.
 * Online  = terhubung ≤ 5 menit terakhir (aplikasi mengirim sinyal tiap 1–2 menit selama dibuka).
 * Offline = aplikasi ditutup / tanpa sinyal → titik & waktu terakhir ditampilkan.
 */
(function () {
'use strict';
const ADMIN = ['erik.prcfi@gmail.com'];
const ON_MS = 5 * 6e4, REF_MS = 20000;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ini = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const A = () => window.FHAkun;
const admin = () => { const a = A(), u = a && a.user(); return !!(u && a.masuk() && ADMIN.includes(String(u.email || '').toLowerCase())); };
const rad = x => x * Math.PI / 180;
const jarak = (a, b, c, d) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const COL = { on: '#22C55E', gps: '#F59E0B', off: '#94A3B8' };
let MAP = null, LY = null, TRK = null, ACC = null, TIM = [], OFS = 0, SEL = null, FIL = 'all', TM = null, BUSY = false, FIRST = true;

function rel(ms) { if (!ms) return '–'; const s = Math.max(0, (Date.now() + OFS - ms) / 1000);
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt'; if (s < 86400) return Math.floor(s / 3600) + ' j ' + Math.floor(s % 3600 / 60) + ' m'; return Math.floor(s / 86400) + ' hr'; }
const jam = ms => ms ? new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '–';
function st(p) { const baru = p.terhubung && Date.now() + OFS - p.terhubung <= ON_MS;
  if (p.status === 'Online' && baru) return p.gps === 'Aktif' ? 'on' : 'gps'; return 'off'; }
const akTxt = ak => ak == null ? '' : '±' + (ak >= 1000 ? (ak / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' km' : Math.round(ak) + ' m');
const akKelas = ak => ak == null ? '' : ak <= 20 ? 'g' : ak <= 100 ? 'y' : 'r';

function css() {
  if (document.getElementById('tim-css')) return; const s = document.createElement('style'); s.id = 'tim-css';
  s.textContent = `.tm-wrap{display:grid;gap:10px;padding-bottom:20px}
  .tm-kpi{display:flex;gap:8px}.tm-kpi button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;height:42px;border-radius:13px;background:var(--surface);border:1.5px solid var(--line);font:800 16px var(--f);color:var(--fg)}
  .tm-kpi button.on{border-color:var(--brand-3,#1E7A58);box-shadow:0 0 0 3px rgba(30,122,88,.15)}.tm-kpi i{width:11px;height:11px;border-radius:50%;display:inline-block}
  .tm-map{position:relative;height:56vh;min-height:320px;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#0b1a13}
  #tmMap{position:absolute;inset:0}.tm-ctl{position:absolute;right:10px;top:10px;z-index:500;display:grid;gap:8px}
  .tm-ctl button{width:40px;height:40px;border-radius:12px;background:rgba(10,20,15,.78);color:#fff;display:grid;place-items:center;backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.3)}
  .tm-upd{position:absolute;left:10px;top:10px;z-index:500;padding:5px 10px;border-radius:999px;background:rgba(10,20,15,.72);color:#fff;font:700 11.5px var(--f);display:flex;align-items:center;gap:6px}
  .tm-upd i{width:7px;height:7px;border-radius:50%;background:#22C55E;animation:tmP 1.6s infinite}@keyframes tmP{50%{opacity:.25}}
  .tm-mk{position:relative;width:38px;height:38px}.tm-mk b{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;font:800 13px var(--f);color:#fff;background:linear-gradient(150deg,#1E7A58,#0B3B2C);border:3px solid var(--c);box-shadow:0 4px 12px rgba(0,0,0,.45)}
  .tm-mk.off b{filter:grayscale(.85) brightness(.85)}.tm-mk.on::before{content:"";position:absolute;inset:-6px;border-radius:50%;border:3px solid var(--c);animation:tmR 2s ease-out infinite}
  .tm-mk.sel b{transform:scale(1.18);box-shadow:0 0 0 4px #fff,0 6px 18px rgba(0,0,0,.5)}@keyframes tmR{from{opacity:.8;transform:scale(.7)}to{opacity:0;transform:scale(1.5)}}
  .tm-list{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}
  .tm-row{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:10px 13px;border-top:1px solid var(--line)}.tm-row:first-child{border-top:0}.tm-row.sel{background:var(--surface-2)}
  .tm-av{position:relative;width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;font:800 14px var(--f);color:#fff;background:linear-gradient(150deg,#1E7A58,#0B3B2C)}
  .tm-av i{position:absolute;right:-1px;bottom:-1px;width:13px;height:13px;border-radius:50%;border:2.5px solid var(--surface)}
  .tm-row .m{flex:1;min-width:0}.tm-row b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tm-row small{display:flex;flex-wrap:wrap;gap:4px 9px;color:var(--muted);font-size:11.5px;font-weight:600;margin-top:2px}
  .tm-row .t{flex:none;text-align:right;font:700 12px var(--f);color:var(--muted)}
  .tm-ak.g{color:#16A34A}.tm-ak.y{color:#D97706}.tm-ak.r{color:#DC2626}
  .tm-det{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:13px 14px;display:grid;gap:10px}
  .tm-det h3{margin:0;font-size:16px;display:flex;align-items:center;gap:8px}.tm-det h3 i{width:10px;height:10px;border-radius:50%}
  .tm-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tm-g div{background:var(--surface-2);border-radius:12px;padding:8px 10px}.tm-g small{display:block;color:var(--muted);font-size:11px;font-weight:700}.tm-g b{font-size:14px}
  .tm-seg{display:flex;gap:6px}.tm-seg button{flex:1;height:38px;border-radius:11px;border:1.5px solid var(--line);font:700 13px var(--f);color:var(--fg);background:var(--surface-2)}.tm-seg button.on{background:#1D4ED8;border-color:#1D4ED8;color:#fff}
  .tm-empty{padding:22px 16px;text-align:center;color:var(--muted);font-size:13.5px}`;
  document.head.appendChild(s);
}
const ICN = {
  fit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  lyr: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  ref: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  nav: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l7 19-7-4-7 4z"/></svg>',
};

async function ambil() {
  if (BUSY) return; BUSY = true; const a = A(), u = a.user();
  try { const j = await a.api({ aksi: 'posisi_tim', id: u.id, token: u.token }, 25000);
    if (!j || !j.ok) { toast(j && j.galat ? j.galat : 'Gagal memuat posisi tim'); return; }
    OFS = (j.sekarang || Date.now()) - Date.now(); TIM = j.tim || []; gambar(); }
  catch (e) { toast('Tidak ada koneksi'); } finally { BUSY = false; const u2 = document.getElementById('tmUpd'); if (u2) u2.innerHTML = `<i></i>${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; }
}
function toast(t) { if (window.toastMsg) return window.toastMsg(t); const d = document.createElement('div'); d.className = 'ak-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
function urut() { const o = { on: 0, gps: 1, off: 2 }; return TIM.slice().sort((a, b) => o[st(a)] - o[st(b)] || (b.terhubung || 0) - (a.terhubung || 0)); }
function gambar() {
  const box = document.getElementById('tmBox'); if (!box || !MAP) return;
  const L = window.L, n = { on: 0, off: 0 }; TIM.forEach(p => st(p) === 'off' ? n.off++ : n.on++);
  box.querySelector('[data-f=all] span').textContent = TIM.length; box.querySelector('[data-f=on] span').textContent = n.on; box.querySelector('[data-f=off] span').textContent = n.off;
  const vis = urut().filter(p => FIL === 'all' || (FIL === 'on' ? st(p) !== 'off' : st(p) === 'off'));
  LY.clearLayers(); const pts = [];
  vis.forEach(p => { if (p.la == null) return; const s = st(p);
    const m = L.marker([p.la, p.lo], { icon: L.divIcon({ className: '', html: `<div class="tm-mk ${s}${SEL === p.id ? ' sel' : ''}" style="--c:${COL[s]}"><b>${esc(ini(p.nama))}</b></div>`, iconSize: [38, 38], iconAnchor: [19, 19] }), zIndexOffset: s === 'off' ? 0 : 500, title: p.nama });
    m.on('click', () => pilih(p.id, true)); m.addTo(LY); pts.push([p.la, p.lo]); });
  const li = box.querySelector('#tmList');
  li.innerHTML = vis.length ? vis.map(p => { const s = st(p);
    return `<button class="tm-row${SEL === p.id ? ' sel' : ''}" data-id="${esc(p.id)}"><span class="tm-av">${esc(ini(p.nama))}<i style="background:${COL[s]}"></i></span>
      <span class="m"><b>${esc(p.nama)}</b><small>${p.hd ? `<span>${esc(p.hd)}</span>` : ''}${p.ak != null ? `<span class="tm-ak ${akKelas(p.ak)}">${akTxt(p.ak)}</span>` : ''}${p.bat != null ? `<span>🔋${p.bat}%</span>` : ''}${s === 'gps' || (s === 'off' && /ditolak|Dimatikan/.test(p.gps)) ? '<span>⚠ GPS</span>' : ''}${p.la == null && s !== 'gps' ? '<span>⚠ GPS</span>' : ''}</small></span>
      <span class="t">${s === 'off' ? rel(p.terhubung) : `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COL[s]};box-shadow:0 0 0 4px ${COL[s]}33"></i>`}</span></button>`; }).join('') : '<div class="tm-empty">Belum ada anggota tim yang terhubung.</div>';
  li.querySelectorAll('[data-id]').forEach(b => b.onclick = () => pilih(b.dataset.id, true));
  if (FIRST && pts.length) { FIRST = false; MAP.fitBounds(pts, { padding: [50, 50], maxZoom: 15 }); }
  if (SEL) detail(false);
}
function pilih(id, terbang) {
  SEL = id; const p = TIM.find(x => x.id === id); if (TRK) { TRK.remove(); TRK = null; }
  gambar(); detail(true);
  if (p && p.la != null && terbang) { MAP.flyTo([p.la, p.lo], Math.max(MAP.getZoom(), 16), { duration: .8 }); document.getElementById('tmMapBox').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function detail(baru) {
  const el = document.getElementById('tmDet'), p = TIM.find(x => x.id === SEL), L = window.L; if (!el) return;
  if (ACC) { ACC.remove(); ACC = null; }
  if (!p) { el.hidden = true; return; } const s = st(p); el.hidden = false;
  if (p.la != null && p.ak != null) ACC = L.circle([p.la, p.lo], { radius: p.ak, color: COL[s], weight: 1.5, fillOpacity: .12, interactive: false }).addTo(MAP);
  if (!baru && el.dataset.id === p.id) { el.querySelector('[data-k=t]').textContent = s === 'off' ? rel(p.terhubung) : 'Online'; return; }
  el.dataset.id = p.id;
  el.innerHTML = `<h3><i style="background:${COL[s]}"></i>${esc(p.nama)}</h3>
    <div class="tm-g"><div><small>Status</small><b data-k="t">${s === 'off' ? rel(p.terhubung) : 'Online'}</b></div><div><small>Posisi diambil</small><b>${jam(p.t)}</b></div>
      <div><small>Ketelitian GPS</small><b class="tm-ak ${akKelas(p.ak)}">${akTxt(p.ak) || '–'}</b></div><div><small>Koordinat</small><b style="font-size:12.5px">${p.la != null ? p.la.toFixed(5) + ', ' + p.lo.toFixed(5) : '–'}</b></div>
      <div><small>Baterai · kecepatan</small><b>${p.bat != null ? p.bat + '%' : '–'} · ${p.v != null ? p.v.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' km/j' : '–'}</b></div><div><small>GPS</small><b>${esc(p.gps || '–')}</b></div></div>
    <div class="tm-seg" id="tmSeg"><button data-h="1">Jalur 24 j</button><button data-h="7">7 hr</button><button data-h="30">30 hr</button></div>
    <div id="tmJal" class="muted" style="font-size:12.5px;font-weight:600"></div>
    ${p.la != null ? `<a class="ak-btn alt" style="height:44px;text-decoration:none" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.la},${p.lo}">${ICN.nav} Arahkan ke lokasi</a>` : ''}`;
  el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => jalur(p, +b.dataset.h, b));
}
async function jalur(p, hari, btn) {
  const a = A(), u = a.user(), L = window.L, info = document.getElementById('tmJal');
  document.querySelectorAll('#tmSeg button').forEach(x => x.classList.toggle('on', x === btn)); info.textContent = 'Memuat…';
  try { const now = Date.now() + OFS, j = await a.api({ aksi: 'posisi_jalur', id: u.id, token: u.token, target: p.id, dari: now - hari * 864e5, sampai: now }, 45000);
    if (!j || !j.ok) { info.textContent = (j && j.galat) || 'Gagal memuat'; return; }
    if (TRK) TRK.remove(); TRK = L.layerGroup().addTo(MAP); const T = (j.titik || []).filter(x => x[3] == null || x[3] <= 150);
    if (!T.length) { info.textContent = 'Tidak ada riwayat pada periode ini.'; return; }
    const segs = []; let cur = [];   // putus garis bila jeda > 30 menit (aplikasi ditutup)
    T.forEach((x, k) => { if (k && x[0] - T[k - 1][0] > 18e5) { segs.push(cur); cur = []; } cur.push([x[1], x[2]]); }); segs.push(cur);
    segs.forEach(sg => { L.polyline(sg, { color: '#000', weight: 7, opacity: .35 }).addTo(TRK); L.polyline(sg, { color: '#38BDF8', weight: 4 }).addTo(TRK); });
    L.circleMarker([T[0][1], T[0][2]], { radius: 7, color: '#fff', weight: 2, fillColor: '#22C55E', fillOpacity: 1 }).bindTooltip('Mulai · ' + jam(T[0][0])).addTo(TRK);
    let km = 0; for (let k = 1; k < T.length; k++) if (T[k][0] - T[k - 1][0] <= 18e5) km += jarak(T[k - 1][1], T[k - 1][2], T[k][1], T[k][2]);
    MAP.fitBounds(L.polyline(T.map(x => [x[1], x[2]])).getBounds(), { padding: [40, 40], maxZoom: 17 });
    info.innerHTML = `${T.length.toLocaleString('id-ID')} titik · ${km.toLocaleString('id-ID', { maximumFractionDigits: 2 })} km · ${jam(T[0][0])} – ${jam(T[T.length - 1][0])}`;
  } catch (e) { info.textContent = 'Tidak ada koneksi'; }
}
function open() {
  if (!admin()) { toast('Khusus admin'); return; }
  css(); FIRST = true; SEL = null; FIL = 'all';
  window.openPage('Tim lapangan', 'Posisi real time · khusus admin', `<div class="tm-wrap" id="tmBox">
    <div class="tm-kpi"><button data-f="all" class="on">👥 <span>–</span></button><button data-f="on"><i style="background:${COL.on}"></i><span>–</span></button><button data-f="off"><i style="background:${COL.off}"></i><span>–</span></button></div>
    <div class="tm-map" id="tmMapBox"><div id="tmMap"></div><span class="tm-upd" id="tmUpd"><i></i>…</span>
      <div class="tm-ctl"><button data-c="fit" aria-label="Tampilkan semua">${ICN.fit}</button><button data-c="lyr" aria-label="Ganti peta dasar">${ICN.lyr}</button><button data-c="ref" aria-label="Muat ulang">${ICN.ref}</button></div></div>
    <div class="tm-det" id="tmDet" hidden></div><div class="tm-list" id="tmList"><div class="tm-empty">Memuat…</div></div></div>`, () => {
    const L = window.L; MAP = L.map('tmMap', { zoomControl: false, attributionControl: true }).setView([0.2, 112.6], 7);
    const C = window.FHCitra ? FHCitra.leaflet(L) : null, osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const sat = C ? C.terbaik : osm; sat.addTo(MAP); let pakai = sat; L.control.scale({ imperial: false }).addTo(MAP);
    LY = L.layerGroup().addTo(MAP);
    const box = document.getElementById('tmBox');
    box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { FIL = b.dataset.f; box.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); FIRST = true; gambar(); });
    box.querySelector('[data-c=fit]').onclick = () => { const pts = TIM.filter(p => p.la != null).map(p => [p.la, p.lo]); if (pts.length) MAP.fitBounds(pts, { padding: [50, 50], maxZoom: 15 }); };
    box.querySelector('[data-c=lyr]').onclick = () => { MAP.removeLayer(pakai); pakai = pakai === sat ? osm : sat; pakai.addTo(MAP); };
    box.querySelector('[data-c=ref]').onclick = () => ambil();
    setTimeout(() => MAP.invalidateSize(), 120); ambil();
    clearInterval(TM); TM = setInterval(() => { if (!document.getElementById('tmBox')) { tutup(); return; } if (!document.hidden && document.getElementById('page').classList.contains('on')) ambil(); else if (!document.getElementById('page').classList.contains('on')) tutup(); }, REF_MS);
  });
}
function tutup() { clearInterval(TM); TM = null; if (MAP) { try { MAP.remove(); } catch (e) { } MAP = null; } TRK = ACC = null; }
window.FHTim = { open, admin };
})();
