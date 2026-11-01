/* Fire Hotspot – pembantu bersama modul lapangan (patroli, tindak lanjut, dasbor admin, indikator)
 * FHAlat.api(body) → kirim ke database PRCF (Apps Script v9) dengan akun yang sedang masuk (aplikasi HP atau website)
 * FHAlat.akun() → {id, token, nama, email} | null ;  FHAlat.perlu(alasan, f) → jalankan f bila sudah masuk, bila belum minta masuk
 * FHAlat.dl(blob, nama) unduh berkas · FHAlat.lib(url) muat pustaka · FHAlat.foto(file) perkecil foto · FHAlat.jarak(...) meter
 */
(function () {
'use strict';
const KUNCI = 'fh-prcf-2026-akun';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const A = () => window.FHAkun;
const akun = () => { const a = A(), u = a && a.masuk && a.masuk() && a.user(); return u && u.id && u.token ? u : null; };
const EN = () => !!(window.FHLang && FHLang.get() === 'en');
const T = s => window.FHLang ? FHLang.t(s) : s;
async function api(body, ms = 30000) {
  const a = A(), ep = a && a.endpoint && a.endpoint(); if (!ep) throw new Error('offline-uji');
  const u = akun(), b = Object.assign({ kunci: KUNCI }, u ? { id: u.id, token: u.token } : {}, body);
  if (window.FHNative && FHNative.aktif && FHNative.http) { try { return await FHNative.http(ep, b, ms); } catch (e) { } }
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b), signal: c.signal }); return await r.json(); }
  finally { clearTimeout(t); }
}
function perlu(alasan, f) {
  if (akun()) return f();
  const a = A(); if (!a) return;
  if (a.perlu) return a.perlu(alasan, f);           // website: masuk dengan email
  toast(alasan || 'Masuk dengan akun Fire Hotspot terlebih dahulu.'); a.openProfile && a.openProfile();
}
const toast = t => (window.toastMsg || (x => alert(x)))(t);
function dl(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 2500); }
const LIB = {};
function lib(src) { return LIB[src] || (LIB[src] = new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`) && (src.includes('jspdf') ? window.jspdf : src.includes('docx') ? window.docx : true)) return ok();
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete LIB[src]; no(new Error('Gagal memuat pustaka (perlu internet).')); }; document.head.appendChild(s); })); }
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', DOCX = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
function foto(file) { return new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .75)); }; im.onerror = no; im.src = u; }); }
const jarak = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742e3 * Math.asin(Math.min(1, Math.sqrt(h))); };
function csv(rows) { return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); }
const n1 = (x, d = 1) => (+x).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d });
const wib = ms => new Date(ms).toLocaleString(EN() ? 'en-GB' : 'id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
const tgl = ms => new Date(ms).toLocaleDateString(EN() ? 'en-GB' : 'id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
/* antrean sederhana di IndexedDB (tetap aman tanpa sinyal) */
function antrean(nama) {
  let P = null; const db = () => P || (P = new Promise((ok, no) => { const r = indexedDB.open(nama, 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const tx = async (m, f) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('q', m), s = t.objectStore('q'), r = f(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); };
  return { put: v => tx('readwrite', s => s.put(v)), all: () => tx('readonly', s => s.getAll()), del: id => tx('readwrite', s => s.delete(id)) };
}
/* pemakaian fitur (tanpa identitas): dihitung per hari di HP, dikirim sekali-sekali ke dasbor admin */
const PK = 'fh_pakai';
function pakai(k) { try { const t = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10), o = JSON.parse(localStorage.getItem(PK) || '{}'); o[t] = o[t] || {}; o[t][k] = (o[t][k] || 0) + 1; localStorage.setItem(PK, JSON.stringify(o)); } catch (e) { } }
async function kirimPakai() {
  if (!akun() || navigator.onLine === false) return; let o = {}; try { o = JSON.parse(localStorage.getItem(PK) || '{}'); } catch (e) { return; }
  for (const t of Object.keys(o)) { try { const j = await api({ aksi: 'pakai', tanggal: t, fitur: o[t] }, 20000); if (!j || !j.ok) break; const now = JSON.parse(localStorage.getItem(PK) || '{}'); delete now[t]; localStorage.setItem(PK, JSON.stringify(now)); } catch (e) { break; } }
}
setTimeout(kirimPakai, 15000); setInterval(kirimPakai, 15 * 6e4);
/* gaya bersama */
if (!document.getElementById('fa-css')) { const st = document.createElement('style'); st.id = 'fa-css';
  st.textContent = `.fa{display:grid;gap:14px}.fa-card{background:var(--surface,#fff);border:1px solid var(--line,#e5e7eb);border-radius:18px;padding:14px 16px}
  .fa-card h4{margin:0 0 8px;font-size:15px}.fa h5{margin:0 0 8px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#667)}.fa h5 i{color:#D93025;font-style:normal}
  .fa-tabs{display:flex;gap:6px;padding:4px;border-radius:14px;background:var(--surface-2,#f1f5f3);position:sticky;top:0;z-index:5}.fa-tabs button{flex:1;height:40px;border:0;border-radius:11px;background:none;color:var(--muted,#667);font:700 13px var(--f,system-ui);cursor:pointer}
  .fa-tabs button[aria-selected=true]{background:var(--surface,#fff);color:var(--fg,#111);box-shadow:0 2px 8px -4px rgba(0,0,0,.3)}
  .fa-chips{display:flex;flex-wrap:wrap;gap:8px}.fa-chips button{min-height:40px;padding:8px 13px;border-radius:12px;border:1.5px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--fg,#111);font:600 13px var(--f,system-ui);text-align:left;cursor:pointer}
  .fa-chips button[aria-pressed=true]{border-color:var(--c,#B45309);background:color-mix(in srgb,var(--c,#B45309) 12%,transparent);color:var(--fg,#111)}
  .fa input:not([type=checkbox]):not([type=file]),.fa select,.fa textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--line,#ddd);border-radius:12px;padding:10px 12px;background:var(--surface-2,#f6f8f6);color:var(--fg,#111);font:500 14px var(--f,system-ui)}
  .fa-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 16px;border-radius:14px;border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--fg,#111);font:700 14px var(--f,system-ui);cursor:pointer}
  .fa-btn.pri{background:var(--c,#B45309);border-color:var(--c,#B45309);color:#fff}.fa-btn:disabled{opacity:.5}.fa-btn.full{width:100%}
  .fa-row{display:flex;gap:10px;flex-wrap:wrap}.fa-row>*{flex:1}
  .fa-note{font-size:12px;color:var(--muted,#667);line-height:1.5;margin:6px 0 0}.fa-err{color:#B3261E;font-weight:700;font-size:13px}
  .fa-ph{display:flex;gap:8px;flex-wrap:wrap}.fa-ph img{width:84px;height:84px;object-fit:cover;border-radius:12px}.fa-add{width:84px;height:84px;border-radius:12px;border:1.5px dashed var(--line,#bbb);display:grid;place-items:center;color:var(--muted,#667);font:600 11px var(--f,system-ui);text-align:center;cursor:pointer}
  .fa-list{display:grid}.fa-it{display:flex;gap:12px;align-items:flex-start;padding:11px 2px;border-top:1px solid var(--line,#eee)}.fa-it:first-child{border-top:0}
  .fa-it .d{flex:none;width:10px;height:10px;border-radius:50%;margin-top:5px}.fa-it .m{flex:1;min-width:0}.fa-it b{display:block;font-size:14px}.fa-it small{display:block;color:var(--muted,#667);font-size:12px;line-height:1.45}
  .fa-pill{flex:none;font:800 11px var(--f,system-ui);padding:4px 9px;border-radius:999px;white-space:nowrap}
  .fa-kpi{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.fa-kpi div{background:var(--surface-2,#f1f5f3);border-radius:14px;padding:11px 12px}.fa-kpi small{display:block;font-size:11.5px;color:var(--muted,#667);font-weight:700}.fa-kpi b{display:block;font-size:22px;letter-spacing:-.01em;margin-top:2px}
  .fa-map{height:300px;border-radius:16px;overflow:hidden;border:1px solid var(--line,#ddd);background:#0d1a14}
  .fa-bar{display:flex;align-items:center;gap:8px;font-size:12.5px;margin:5px 0}.fa-bar span{flex:0 0 42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fa-bar i{height:10px;border-radius:5px;background:var(--c,#1E7A58);min-width:3px}.fa-bar b{font-size:12px}
  .fa-tbl{width:100%;border-collapse:collapse;font-size:13px}.fa-tbl th,.fa-tbl td{text-align:left;padding:7px 8px;border-top:1px solid var(--line,#eee);vertical-align:top}.fa-tbl th{color:var(--muted,#667);font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.fa-tbl td.n{text-align:right;font-variant-numeric:tabular-nums}
  .fa-scroll{overflow-x:auto}
  @media (min-width:900px){.fa-kpi{grid-template-columns:repeat(4,1fr)}.fa-map{height:420px}.fa-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}}`;
  document.head.appendChild(st); }
window.FHAlat = { esc, api, akun, perlu, toast, dl, lib, JSPDF, AUTOTABLE, DOCX, foto, jarak, csv, n1, wib, tgl, antrean, pakai, EN, T };
})();
