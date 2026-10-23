/* Laporan verifikasi lapangan titik panas – Fire Hotspot PRCF
 * Tim patroli mencatat hasil cek lapangan (api aktif / bekas terbakar / bukan api …), foto, GPS pelapor & tindakan.
 * Disimpan dulu di HP (IndexedDB, tetap aman tanpa sinyal) lalu dikirim otomatis ke Google Sheets PRCF saat ada internet.
 * Penerima: Google Apps Script (Verifikasi_Lapangan.gs). Ringkasan publik (tanpa data pribadi) untuk tanda "sudah dicek" di peta.
 * Pemakaian: FHVerif.mount(el, { titik, situs, onDone }); FHVerif.sync(); FHVerif.dicek() → {k: hasil}
 */
(function () {
'use strict';
const URL_ = () => window.FH_VERIF_URL || '';
const KUNCI = 'fh-prcf-2026-akun';
const HASIL = ['Api aktif', 'Bekas terbakar baru', 'Bukan kebakaran (sumber panas lain)', 'Tidak ditemukan tanda api', 'Tidak dapat dijangkau'];
const PENYEBAB = ['Pembukaan lahan / ladang', 'Pembakaran sampah / kebun', 'Tidak sengaja (puntung, api unggun)', 'Merambat dari luar', 'Tidak diketahui', 'Lainnya'];
const TUTUP = ['Hutan', 'Semak / belukar', 'Ladang / kebun', 'Lahan gambut', 'Permukiman / industri', 'Lainnya'];
const TINDAK = ['Dipadamkan tim', 'Dilaporkan ke Manggala Agni / MPA / BPBD', 'Dipantau', 'Tidak ada tindakan'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* ---- antrean di HP (IndexedDB) ---- */
let DBP = null;
const db = () => DBP || (DBP = new Promise((ok, no) => { const r = indexedDB.open('fh-verifikasi', 1); r.onupgradeneeded = () => r.result.createObjectStore('lap', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
const tx = async (mode, f) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('lap', mode), s = t.objectStore('lap'), r = f(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); };
const put = v => tx('readwrite', s => s.put(v)), all = () => tx('readonly', s => s.getAll());
let syncing = false; const subs = [];
async function sync() {
  if (syncing || !URL_() || navigator.onLine === false) return; syncing = true;
  try { for (const r of (await all()).filter(x => !x.terkirim)) {
      const res = await fetch(URL_(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ kunci: KUNCI }, r.data)) }).then(x => x.json()).catch(() => null);
      if (res && res.ok) { r.terkirim = new Date().toISOString(); r.data.foto = []; r.nfoto = r.nfoto || 0; await put(r); } else break; } }
  finally { syncing = false; subs.forEach(f => f()); }
}
window.addEventListener('online', () => setTimeout(sync, 1500));
let DICEK = null;
async function dicek(force) {   // {kunci titik: hasil} dari ringkasan publik + laporan di HP ini
  const mine = {}; (await all().catch(() => [])).forEach(r => { if (r.data.k) mine[r.data.k] = r.data.hasil; });
  if (URL_() && (force || !DICEK)) DICEK = fetch(URL_()).then(r => r.json()).then(j => j.titik || {}).catch(() => ({}));
  return Object.assign({}, DICEK ? await DICEK : {}, mine);
}
/* ---- foto: diperkecil di HP (sisi terpanjang 1280 px, JPEG 0,75) ---- */
function shrink(file) { return new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .75)); }; im.onerror = no; im.src = u; }); }
const dist = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742e3 * Math.asin(Math.min(1, Math.sqrt(h))); };
if (!document.getElementById('fhv-css')) {
  const st = document.createElement('style'); st.id = 'fhv-css';
  st.textContent = `.fhv{display:grid;gap:14px}.fhv h5{margin:0 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#667)}.fhv h5 i{color:#D93025;font-style:normal}
  .fhv-chips{display:flex;flex-wrap:wrap;gap:8px}.fhv-chips button{min-height:40px;padding:8px 13px;border-radius:12px;border:1.5px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--fg,#111);font:600 13px var(--f,system-ui);text-align:left;cursor:pointer}
  .fhv-chips button[aria-pressed=true]{border-color:#D93025;background:#FDECEA;color:#9B1C12}
  .fhv-card{background:var(--surface,#fff);border-radius:18px;padding:14px;box-shadow:var(--shadow,0 6px 18px -12px rgba(0,0,0,.35))}
  .fhv input[type=number],.fhv input[type=datetime-local],.fhv textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--line,#ddd);border-radius:12px;padding:10px 12px;background:var(--surface-2,#f6f8f6);color:var(--fg,#111);font:500 14px var(--f,system-ui)}
  .fhv-ph{display:flex;gap:8px;flex-wrap:wrap}.fhv-ph img{width:84px;height:84px;object-fit:cover;border-radius:12px}.fhv-add{width:84px;height:84px;border-radius:12px;border:1.5px dashed var(--line,#bbb);display:grid;place-items:center;color:var(--muted,#667);font:600 11px var(--f,system-ui);text-align:center;cursor:pointer}
  .fhv-gps{font-size:13px;line-height:1.5}.fhv-warn{color:#B3261E;font-weight:700}.fhv-send{width:100%;height:52px;border:0;border-radius:16px;background:#B3261E;color:#fff;font:800 15px var(--f,system-ui);cursor:pointer}.fhv-send:disabled{opacity:.5}
  .fhv-note{font-size:11.5px;color:var(--muted,#667);line-height:1.45;margin:6px 0 0}.fhv-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line,#eee);font-size:13px}.fhv-row:first-child{border:0}`;
  document.head.appendChild(st);
}
function chips(name, L, multi) { return `<div class="fhv-chips" data-n="${name}" data-m="${multi ? 1 : ''}">${L.map(x => `<button type="button" aria-pressed="false">${esc(x)}</button>`).join('')}</div>`; }
function mount(el, o = {}) {
  const p = o.titik || null; let pos = null, wid = null; const fotos = [];
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  el.innerHTML = `<div class="fhv">
   <div class="fhv-card">${p ? `<b>Titik panas ${esc(o.label || '')}</b><div class="fhv-note">${p.la.toFixed(5)}, ${p.lo.toFixed(5)} · ID ${esc(p.k)}</div>` : `<b>Temuan kebakaran baru</b><div class="fhv-note">Untuk api/bekas terbakar yang Anda temukan di lapangan tetapi tidak ada titik satelitnya. Lokasi = GPS Anda.</div>`}
    <div class="fhv-gps" id="vGps" style="margin-top:8px">📡 Mencari posisi GPS Anda…</div></div>
   <div><h5>Hasil cek lapangan <i>*</i></h5>${chips('hasil', HASIL)}</div>
   <div><h5>Penyebab dugaan</h5>${chips('penyebab', PENYEBAB)}</div>
   <div><h5>Tutupan lahan di lokasi</h5>${chips('tutupan', TUTUP)}</div>
   <div><h5>Perkiraan luas terbakar (ha)</h5><input type="number" id="vLuas" min="0" step="0.01" inputmode="decimal" placeholder="mis. 0,5"></div>
   <div><h5>Tindakan</h5>${chips('tindakan', TINDAK, true)}</div>
   <div><h5>Waktu cek</h5><input type="datetime-local" id="vWkt" value="${now}"></div>
   <div><h5>Foto (maks. 3)</h5><div class="fhv-ph" id="vPh"><label class="fhv-add">📷<br>Ambil foto<input type="file" accept="image/*" capture="environment" hidden></label></div></div>
   <div><h5>Catatan</h5><textarea id="vCat" rows="3" maxlength="500" placeholder="Kondisi api, arah menjalar, siapa yang ditemui, dll."></textarea></div>
   <button class="fhv-send" type="button" disabled>Simpan & kirim laporan</button>
   <p class="fhv-note">Laporan disimpan dulu di HP ini, lalu terkirim otomatis ke basis data PRCF (Google Sheets) begitu ada sinyal. Nama & email Anda dari akun aplikasi ikut tercatat sebagai pelapor. Foto diperkecil agar hemat kuota.</p>
   <div class="fhv-card" id="vMine"></div></div>`;
  const $ = s => el.querySelector(s), send = $('.fhv-send');
  el.querySelectorAll('.fhv-chips').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { if (!g.dataset.m) g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); send.disabled = !val('hasil'); }));
  const val = n => [...el.querySelectorAll(`[data-n="${n}"] button[aria-pressed=true]`)].map(b => b.textContent).join('; ');
  const inp = $('#vPh input');
  inp.onchange = async () => { const f = inp.files[0]; inp.value = ''; if (!f || fotos.length >= 3) return; try { const d = await shrink(f); fotos.push(d); const im = document.createElement('img'); im.src = d; $('#vPh').insertBefore(im, $('#vPh label')); if (fotos.length >= 3) $('#vPh label').style.display = 'none'; } catch (e) { } };
  if (navigator.geolocation) wid = navigator.geolocation.watchPosition(g => { const c = g.coords; if (pos && pos.acc < c.accuracy) return; pos = { la: c.latitude, lo: c.longitude, acc: c.accuracy };
    const d = p ? dist(pos.la, pos.lo, p.la, p.lo) : null;
    $('#vGps').innerHTML = `📍 Posisi Anda ${pos.la.toFixed(5)}, ${pos.lo.toFixed(5)} (±${Math.round(pos.acc)} m)${d != null ? `<br>Jarak ke titik: <b>${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km'}</b>${d > 1000 ? ' <span class="fhv-warn">– Anda masih jauh dari titik; laporan tetap boleh dikirim, jarak ikut tercatat.</span>' : ''}` : ''}`;
  }, () => { $('#vGps').textContent = 'GPS tidak tersedia – aktifkan lokasi agar posisi pelapor tercatat.'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  send.onclick = async () => {
    send.disabled = true; send.textContent = 'Menyimpan…';
    const u = window.FHAkun && FHAkun.user ? FHAkun.user() : null, id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    let wil = ''; try { const la = p ? p.la : pos && pos.la, lo = p ? p.lo : pos && pos.lo; if (la != null && window.FHWilayah) { const w = await FHWilayah.lookup(la, lo); wil = w ? FHWilayah.label(w) : ''; } } catch (e) { }
    const data = { id, waktu_cek: $('#vWkt').value, hasil: val('hasil'), penyebab: val('penyebab'), tutupan: val('tutupan'), luas_ha: $('#vLuas').value, tindakan: val('tindakan'), catatan: $('#vCat').value,
      k: p ? p.k : '', satelit: p ? o.satelit || '' : '', waktu_deteksi: p ? `${p.d} ${p.t}` : '', la: p ? p.la : pos && pos.la, lo: p ? p.lo : pos && pos.lo,
      p_la: pos && pos.la, p_lo: pos && pos.lo, p_acc: pos && Math.round(pos.acc), jarak_m: p && pos ? Math.round(dist(pos.la, pos.lo, p.la, p.lo)) : '',
      situs: o.situs || '', wilayah: wil, pelapor: u ? u.nama : '', email: u ? u.email : '', uid: u ? u.id : '', foto: fotos.map(d => d.split(',')[1]), perangkat: navigator.userAgent.slice(0, 120) };
    await put({ id, dibuat: new Date().toISOString(), terkirim: null, nfoto: fotos.length, data });
    if (wid != null) navigator.geolocation.clearWatch(wid);
    await sync(); await mine(); send.textContent = 'Tersimpan ✓'; o.onDone && o.onDone(data);
  };
  async function mine() { const L = (await all().catch(() => [])).sort((a, b) => b.dibuat.localeCompare(a.dibuat)).slice(0, 10);
    $('#vMine').innerHTML = `<h5 style="margin:0 0 6px">Laporan saya di HP ini</h5>` + (L.length ? L.map(r => `<div class="fhv-row"><span>${esc(r.data.hasil)}<br><small style="color:var(--muted,#667)">${new Date(r.dibuat).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${r.nfoto} foto</small></span><b style="color:${r.terkirim ? '#2E7D32' : '#B26A00'}">${r.terkirim ? 'Terkirim ✓' : URL_() ? 'Menunggu sinyal' : 'Tersimpan di HP'}</b></div>`).join('') : '<div class="fhv-note">Belum ada laporan.</div>'); }
  mine(); subs.push(mine); sync();
  return { destroy() { if (wid != null) navigator.geolocation.clearWatch(wid); } };
}
window.FHVerif = { mount, sync, dicek, all, HASIL };
setTimeout(sync, 4000);
})();
