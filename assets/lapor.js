/* Pantau Rimbak – LAPORAN MASYARAKAT (Apps Script v15: lapor_kirim / lapor_daftar / lapor_publik / lapor_verifikasi)
 * - Akun terverifikasi melaporkan asap, api, atau pembukaan lahan dengan foto (maks. 3) dan lokasi GPS.
 * - Laporan masuk antrean admin; hanya yang sudah DIVERIFIKASI admin yang tampil ke publik (peta & daftar),
 *   tanpa nama/email/foto pelapor dan dengan koordinat dibulatkan ±100 m.
 * - Tanpa sinyal: laporan disimpan di HP (IndexedDB) dan terkirim otomatis saat ada sinyal.
 * Pemakaian: FHLapor.mount(el) · FHLapor.peta(map)
 */
(function () {
'use strict';
const X = () => window.FHAlat;
const en = () => { try { return window.FHLang && FHLang.get() === 'en'; } catch (e) { return false; } };
const I = (a, b) => en() ? b : a;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const JENIS = [['Asap', '💨', 'Smoke'], ['Api / kebakaran', '🔥', 'Fire'], ['Pembukaan lahan', '🪓', 'Land clearing'], ['Lainnya', '📌', 'Other']];
const JN = j => { const x = JENIS.find(k => k[0] === j); return x ? (en() ? x[2] : x[0]) : j; }, JI = j => (JENIS.find(k => k[0] === j) || ['', '📌'])[1];
const STW = { 'Menunggu': ['#FEF3C7', '#92400E', 'Waiting'], 'Terverifikasi': ['#DCFCE7', '#166534', 'Verified'], 'Ditolak': ['#FEE2E2', '#991B1B', 'Rejected'] };
const pill = s => { const c = STW[s] || STW.Menunggu; return `<span class="fa-pill" style="background:${c[0]};color:${c[1]};padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700">${esc(en() ? c[2] : s)}</span>`; };
const URL_ = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec', KUNCI = 'fh-prcf-2026-akun';
const Q = () => X().antrean('fh-lapor');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

async function publik(paksa) {   // laporan terverifikasi (tanpa akun)
  if (!paksa && PUB && Date.now() - PUB.t < 10 * 6e4) return PUB.L;
  try { const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ kunci: KUNCI, aksi: 'lapor_publik' }) });
    const j = await r.json(); if (!j.ok || !Array.isArray(j.laporan)) throw new Error(j.galat || 'server'); PUB = { t: Date.now(), L: j.laporan, ok: true }; }
  catch (e) { PUB = { t: Date.now(), L: (PUB && PUB.L) || [], ok: false }; }
  return PUB.L;
}
let PUB = null;
async function kirimAntrean() {
  if (!X() || !X().akun() || navigator.onLine === false) return 0; let n = 0;
  for (const it of await Q().all().catch(() => [])) { try { const j = await X().api({ aksi: 'lapor_kirim', laporan: it }, 60000); if (j && j.ok) { await Q().del(it.id || it.uid); n++; } else break; } catch (e) { break; } }
  return n;
}
addEventListener('online', () => setTimeout(kirimAntrean, 4000)); setTimeout(kirimAntrean, 20000);

/* ---------- lapisan peta: laporan terverifikasi ---------- */
let LG = null;
async function peta(map) {
  if (!map || !window.L) return; if (!LG) { LG = L.layerGroup().addTo(map); map._fhLapor = LG; }
  const ico = j => L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div title="${esc(JN(j))}" style="width:26px;height:26px;border-radius:8px;transform:rotate(45deg);background:#B45309;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center"><span style="transform:rotate(-45deg);font-size:13px">${JI(j)}</span></div>` });
  const L0 = await publik(); LG.clearLayers();
  L0.forEach(r => { if (!isFinite(r.la) || !isFinite(r.lo)) return;
    L.marker([r.la, r.lo], { icon: ico(r.jenis), zIndexOffset: 400 }).bindPopup(`<b>${JI(r.jenis)} ${esc(JN(r.jenis))}</b><br><small>${esc(X().wib(r.t))}${r.wil ? '<br>' + esc(r.wil) : ''}</small>${r.catatan ? `<p style="margin:6px 0 0">${esc(r.catatan)}</p>` : ''}<p style="margin:6px 0 0;font-size:11px;color:#667">${I('Laporan warga · diverifikasi PRCF. Lokasi dibulatkan ±100 m.', 'Community report · verified by PRCF. Location rounded to ±100 m.')}</p>`).addTo(LG); });
}
setInterval(() => { const m = window.FHApp && FHApp.map && FHApp.map(); if (m && LG) peta(m); }, 15 * 6e4);

/* ---------- tampilan alat ---------- */
let EL = null, POS = null, FOTO = [];
function mount(el) { EL = el; render(); }
async function render() {
  if (!EL) return; const A = X(), u = A && A.akun(); const tamu = window.FHAkun && FHAkun.tamu && FHAkun.tamu();
  const antre = await Q().all().catch(() => []);
  EL.innerHTML = `<div class="fa" style="padding:2px">
   <div class="fa-card"><h4>📣 ${I('Lapor kejadian', 'Report an incident')}</h4><p class="fa-note" style="margin:0;font-size:13px;line-height:1.5">${I('Laporkan asap, api, atau pembukaan lahan yang Anda lihat langsung. Laporan diperiksa admin PRCF sebelum tampil di peta publik; nama dan email Anda tidak pernah ditampilkan.', 'Report smoke, fire or land clearing you have seen yourself. Reports are checked by PRCF admins before appearing on the public map; your name and email are never shown.')}</p>
   ${antre.length ? `<p style="margin:8px 0 0;font-size:12.5px;font-weight:700;color:#92400E">⏳ ${antre.length} ${I('laporan menunggu sinyal untuk dikirim', 'report(s) waiting for signal to be sent')}</p>` : ''}</div>
   ${u ? form() : `<div class="fa-card"><p style="margin:0 0 10px;font-size:13.5px">${I('Masuk dengan akun terverifikasi untuk mengirim laporan. Ini mencegah laporan palsu.', 'Sign in with a verified account to send a report. This prevents false reports.')}</p><button class="fa-btn pri full" id="lpMasuk" style="--c:#1E7A58">${I('Masuk / Daftar', 'Sign in / Register')}</button></div>`}
   <div id="lpSaya"></div><div id="lpAdm"></div>
   <div class="fa-card"><h4>${I('Laporan terverifikasi (180 hari)', 'Verified reports (180 days)')}</h4><div id="lpPub" class="fa-note">${I('Memuat…', 'Loading…')}</div></div></div>`;
  const m = EL.querySelector('#lpMasuk'); if (m) m.onclick = () => window.FHAkun && (tamu ? FHAkun.layarMasuk() : X().perlu(I('Masuk untuk melapor.', 'Sign in to report.'), render));
  if (u) { bindForm(); daftarSaya(); }
  daftarPublik();
}
function form() {
  return `<div class="fa-card" id="lpForm"><h5>${I('Apa yang Anda lihat?', 'What did you see?')} <i>*</i></h5>
   <div class="fa-chips" data-n="j" style="--c:#B45309">${JENIS.map(j => `<button type="button" data-v="${esc(j[0])}" aria-pressed="false">${j[1]} ${esc(en() ? j[2] : j[0])}</button>`).join('')}</div>
   <h5 style="margin-top:14px">${I('Lokasi', 'Location')} <i>*</i></h5><div id="lpPos" class="fa-note" style="font-size:13px">${I('Mencari lokasi GPS…', 'Getting GPS location…')}</div>
   <div class="fa-row" style="margin-top:8px"><button type="button" class="fa-btn" id="lpGps">📍 ${I('GPS saya', 'My GPS')}</button><button type="button" class="fa-btn" id="lpPeta">🗺️ ${I('Tengah peta', 'Map centre')}</button></div>
   <h5 style="margin-top:14px">${I('Waktu kejadian', 'Time seen')}</h5><input type="datetime-local" id="lpW" style="width:100%;padding:10px;border-radius:12px;border:1.5px solid var(--line,#ddd);background:var(--surface,#fff);color:inherit;font:600 14px var(--f,system-ui)">
   <h5 style="margin-top:14px">${I('Keterangan', 'Description')}</h5><textarea id="lpK" rows="3" maxlength="600" style="width:100%;padding:10px;border-radius:12px;border:1.5px solid var(--line,#ddd);background:var(--surface,#fff);color:inherit;font:500 14px var(--f,system-ui)" placeholder="${I('mis. asap tebal dari arah sungai sejak pagi, luas ±2 ha', 'e.g. thick smoke from the river side since morning, ±2 ha')}"></textarea>
   <h5 style="margin-top:14px">${I('Foto (maks. 3)', 'Photos (max 3)')}</h5><input type="file" id="lpF" accept="image/*" capture="environment" multiple><div id="lpFv" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>
   <p class="fa-note" style="font-size:11.5px;margin:10px 0">${I('Jangan memotret wajah orang. Dengan mengirim, Anda menyatakan laporan ini benar sesuai yang Anda lihat.', 'Do not photograph people’s faces. By sending, you confirm this report is true to what you saw.')}</p>
   <button class="fa-btn pri full" id="lpKirim" style="--c:#B45309">${I('Kirim laporan', 'Send report')}</button><p class="fa-err" id="lpE" style="color:#B3261E;font-size:13px;margin:6px 0 0"></p></div>`;
}
function bindForm() {
  const g = EL.querySelector('[data-n=j]'); g.querySelectorAll('button').forEach(b => b.onclick = () => g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))));
  const w = EL.querySelector('#lpW'); const now = new Date(Date.now() + 7 * 36e5); w.value = now.toISOString().slice(0, 16); w.max = w.value;
  const tulisPos = () => { const e = EL.querySelector('#lpPos'); if (!e) return; e.innerHTML = POS ? `<b>${POS.la.toFixed(5)}, ${POS.lo.toFixed(5)}</b>${POS.ak ? ` · ±${Math.round(POS.ak)} m` : ''} · ${POS.src === 'gps' ? 'GPS' : I('tengah peta', 'map centre')}${POS.wil ? '<br>' + esc(POS.wil) : ''}` : I('Lokasi belum ditentukan.', 'Location not set.'); };
  const setPos = async (la, lo, ak, src) => { POS = { la, lo, ak, src }; tulisPos(); try { if (window.FHWilayah) { const x = await FHWilayah.lookup(la, lo); if (x) { POS.wil = FHWilayah.label(x, false); tulisPos(); } } } catch (e) { } };
  const gps = () => { if (!navigator.geolocation) return; EL.querySelector('#lpPos').textContent = I('Mencari lokasi GPS…', 'Getting GPS location…');
    navigator.geolocation.getCurrentPosition(p => setPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy, 'gps'), () => { EL.querySelector('#lpPos').textContent = I('GPS tidak tersedia – izinkan lokasi atau pakai tengah peta.', 'GPS unavailable – allow location or use map centre.'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }); };
  EL.querySelector('#lpGps').onclick = gps;
  EL.querySelector('#lpPeta').onclick = () => { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return X().toast(I('Buka peta dulu', 'Open the map first')); const c = m.getCenter(); setPos(c.lat, c.lng, null, 'peta'); };
  if (POS) tulisPos(); else gps();
  const fv = EL.querySelector('#lpFv'), drawF = () => { fv.innerHTML = FOTO.map((f, i) => `<div style="position:relative"><img src="${f}" style="width:76px;height:76px;object-fit:cover;border-radius:10px"><button data-i="${i}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:0;background:#B3261E;color:#fff;font-weight:800;cursor:pointer">×</button></div>`).join(''); fv.querySelectorAll('button').forEach(b => b.onclick = () => { FOTO.splice(+b.dataset.i, 1); drawF(); }); };
  drawF();
  EL.querySelector('#lpF').onchange = async e => { for (const f of [...e.target.files].slice(0, 3 - FOTO.length)) { try { FOTO.push(await X().foto(f)); } catch (x) { } } e.target.value = ''; drawF(); };
  EL.querySelector('#lpKirim').onclick = async () => {
    const E = EL.querySelector('#lpE'), j = (g.querySelector('[aria-pressed=true]') || {}).dataset; E.textContent = '';
    if (!j || !j.v) return E.textContent = I('Pilih jenis kejadian.', 'Choose what you saw.');
    if (!POS) return E.textContent = I('Tentukan lokasi (GPS atau tengah peta).', 'Set the location (GPS or map centre).');
    if (POS.la < -11.5 || POS.la > 6.5 || POS.lo < 94 || POS.lo > 141.5) return E.textContent = I('Lokasi harus di wilayah Indonesia.', 'Location must be in Indonesia.');
    const tms = w.value ? Date.parse(w.value + ':00Z') - 7 * 36e5 : Date.now();
    const it = { uid: uid(), jenis: j.v, la: POS.la, lo: POS.lo, ak: POS.ak, wilayah: POS.wil || '', keterangan: EL.querySelector('#lpK').value.trim(), waktu_ms: Math.min(tms, Date.now()), foto: FOTO.map(f => f.split(',')[1]), perangkat: navigator.userAgent.slice(0, 120) };
    const b = EL.querySelector('#lpKirim'); b.disabled = true; b.textContent = I('Mengirim…', 'Sending…');
    let ok = false, galat = '';
    if (navigator.onLine !== false) { try { const r = await X().api({ aksi: 'lapor_kirim', laporan: it }, 60000); ok = !!(r && r.ok); galat = r && r.galat || ''; } catch (e) { } }
    if (!ok && galat && !/tidak dikenal|akun tidak ditemukan/i.test(galat)) { b.disabled = false; b.textContent = I('Kirim laporan', 'Send report'); return E.textContent = galat; }
    if (!ok) { await Q().put(Object.assign({ id: it.uid }, it)); X().toast(I('Belum terkirim – disimpan di HP dan dikirim otomatis saat ada sinyal.', 'Not sent yet – saved on this phone and sent automatically when online.')); }
    else X().toast(I('Laporan terkirim ✓ Admin PRCF akan memeriksanya.', 'Report sent ✓ PRCF admins will review it.'));
    X().pakai && X().pakai('lapor_kirim'); FOTO = []; render();
  };
}
async function daftarSaya() {
  const host = EL && EL.querySelector('#lpSaya'); if (!host) return; let j;
  try { j = await X().api({ aksi: 'lapor_daftar' }, 30000); } catch (e) { return; }
  if (!j || !j.ok) { if (j && /tidak dikenal|akun tidak ditemukan/i.test(j.galat || '')) host.innerHTML = `<div class="fa-card fa-note" style="font-size:12.5px">${I('Server laporan belum diperbarui (perlu Apps Script v15). Laporan tetap tersimpan di HP dan dikirim otomatis setelahnya.', 'The report server is not updated yet (needs Apps Script v15). Reports are kept on the phone and sent automatically later.')}</div>`; return; }
  const L0 = j.laporan || [], saya = j.admin ? [] : L0;
  if (saya.length) host.innerHTML = `<div class="fa-card"><h4>${I('Laporan saya', 'My reports')}</h4>${saya.slice(0, 20).map(r => `<div style="padding:9px 0;border-top:1px solid var(--line,#eee)"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1;font-size:13.5px">${JI(r.jenis)} ${esc(JN(r.jenis))}</b>${pill(r.status)}</div><small class="muted">${esc(X().wib(r.t))}${r.wil ? ' · ' + esc(r.wil) : ''}</small>${r.catatan ? `<div style="font-size:12.5px;margin-top:4px">${esc(r.catatan)}</div>` : ''}</div>`).join('')}</div>`;
  if (j.admin) adminUI(L0);
}
function adminUI(L0) {
  const host = EL.querySelector('#lpAdm'); if (!host) return; const tunggu = L0.filter(r => r.status === 'Menunggu');
  host.innerHTML = `<div class="fa-card" style="border-color:#B45309"><h4>🛡️ ${I('Antrean verifikasi (admin)', 'Verification queue (admin)')} · ${tunggu.length}</h4>
   ${L0.slice(0, 40).map(r => `<div style="padding:11px 0;border-top:1px solid var(--line,#eee)" data-u="${esc(r.uid)}">
     <div style="display:flex;gap:8px;align-items:center"><b style="flex:1;font-size:13.5px">${JI(r.jenis)} ${esc(JN(r.jenis))}</b>${pill(r.status)}</div>
     <small class="muted" style="display:block">${esc(X().wib(r.t))} · ${r.la.toFixed(5)}, ${r.lo.toFixed(5)}${r.wil ? ' · ' + esc(r.wil) : ''}</small>
     <small style="display:block;margin-top:2px">${I('Pelapor', 'Reporter')}: <b>${esc(r.pelapor)}</b> · ${esc(r.email)}</small>
     ${r.ket ? `<div style="font-size:13px;margin-top:4px">${esc(r.ket)}</div>` : ''}
     ${r.foto && r.foto.length ? `<div style="margin-top:4px;font-size:12.5px">${r.foto.map((f, i) => `<a href="${esc(f)}" target="_blank" rel="noopener">${I('Foto', 'Photo')} ${i + 1}</a>`).join(' · ')}</div>` : ''}
     <input class="lpC" maxlength="300" value="${esc(r.catatan)}" placeholder="${I('Catatan untuk publik (opsional), mis. dicek tim 15 Nov, api sudah padam', 'Public note (optional)')}" style="width:100%;margin-top:8px;padding:9px;border-radius:10px;border:1.5px solid var(--line,#ddd);background:var(--surface,#fff);color:inherit;font:500 13px var(--f,system-ui)">
     <div class="fa-row" style="margin-top:8px"><button class="fa-btn lpV" data-s="Terverifikasi" style="min-height:38px;color:#166534">✓ ${I('Verifikasi', 'Verify')}</button><button class="fa-btn lpV" data-s="Ditolak" style="min-height:38px;color:#991B1B">✕ ${I('Tolak', 'Reject')}</button><button class="fa-btn lpGo" style="min-height:38px">🗺️</button></div></div>`).join('') || `<p class="fa-note">${I('Belum ada laporan.', 'No reports yet.')}</p>`}</div>`;
  host.querySelectorAll('[data-u]').forEach(row => {
    const r = L0.find(x => x.uid === row.dataset.u);
    row.querySelector('.lpGo').onclick = () => { const m = window.FHApp && FHApp.map && FHApp.map(); if (!m) return; FHApp.closeAll && FHApp.closeAll(); setTimeout(() => { m.setView([r.la, r.lo], 15); L.circleMarker([r.la, r.lo], { radius: 12, color: '#B45309', weight: 3 }).addTo(m).bindPopup(esc(JN(r.jenis))).openPopup(); }, 450); };
    row.querySelectorAll('.lpV').forEach(b => b.onclick = async () => { b.disabled = true;
      try { const j = await X().api({ aksi: 'lapor_verifikasi', uid: r.uid, status: b.dataset.s, catatan: row.querySelector('.lpC').value.trim() }, 30000);
        if (!j.ok) { X().toast(j.galat || 'Gagal'); b.disabled = false; return; } X().toast(I('Tersimpan ✓', 'Saved ✓')); PUB = null; render(); const m = window.FHApp && FHApp.map && FHApp.map(); if (m) peta(m); }
      catch (e) { X().toast(I('Tidak ada koneksi.', 'No connection.')); b.disabled = false; } });
  });
}
async function daftarPublik() {
  const host = EL && EL.querySelector('#lpPub'); if (!host) return; const L0 = await publik(true);
  if (!PUB.ok && !L0.length) { host.textContent = I('Daftar laporan terverifikasi akan tampil setelah server diperbarui.', 'The verified report list will appear once the server is updated.'); return; }
  host.innerHTML = L0.length ? L0.slice(0, 25).map(r => `<div style="padding:8px 0;border-top:1px solid var(--line,#eee)"><b style="font-size:13px">${JI(r.jenis)} ${esc(JN(r.jenis))}</b> <small class="muted">· ${esc(X().wib(r.t))}</small><br><small>${esc(r.wil || (r.la + ', ' + r.lo))}</small>${r.catatan ? `<div style="font-size:12.5px;margin-top:2px">${esc(r.catatan)}</div>` : ''}</div>`).join('') + `<p class="fa-note" style="font-size:11.5px;margin-top:8px">${I('Ditandai belah ketupat oranye di peta.', 'Shown as orange diamonds on the map.')}</p>` : I('Belum ada laporan terverifikasi.', 'No verified reports yet.');
}
window.FHLapor = { mount, peta, publik, kirimAntrean };
})();
