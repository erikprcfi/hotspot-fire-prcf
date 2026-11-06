/* Pantau Rimbak – TINDAK LANJUT KEJADIAN (v9)
 * Setiap titik panas di sekitar Hutan Desa punya status penanganan:
 *   Terdeteksi → Ditugaskan → Dicek di lapangan → Ditangani → Selesai
 * Disimpan di Google Sheets PRCF (lembar "Tindak Lanjut", Apps Script v9: tindak_set / tindak_daftar) beserta riwayat & waktu tiap tahap,
 * sehingga waktu respons (deteksi satelit → dicek di lapangan) dapat dihitung untuk laporan program.
 * Semua pengguna terverifikasi melihat status; nama petugas & catatan hanya untuk admin dan petugas itu sendiri.
 * Hanya admin yang dapat menugaskan orang lain; anggota tim dapat menugaskan dirinya sendiri & memperbarui status.
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const ST = ['Terdeteksi', 'Ditugaskan', 'Dicek di lapangan', 'Ditangani', 'Selesai'];
const WR = { 'Terdeteksi': ['#FEE2E2', '#991B1B'], 'Ditugaskan': ['#FEF3C7', '#92400E'], 'Dicek di lapangan': ['#DBEAFE', '#1E40AF'], 'Ditangani': ['#E0E7FF', '#3730A3'], 'Selesai': ['#DCFCE7', '#166534'] };
let DATA = null, WAKTU = 0;
async function muat(paksa) {
  const A = X(); if (!A.akun()) return { status: {}, tim: [], admin: false };
  if (!paksa && DATA && Date.now() - WAKTU < 60000) return DATA;
  const j = await A.api({ aksi: 'tindak_daftar' }, 30000); if (!j.ok) throw new Error(j.galat || 'Gagal'); DATA = j; WAKTU = Date.now(); return j;
}
const pill = s => { const c = WR[s] || WR.Terdeteksi; return `<span class="fa-pill" style="background:${c[0]};color:${c[1]}">${esc(s)}</span>`; };
const sat = p => (p.ins === 'MODIS' ? 'MODIS' : 'VIIRS') + (p.sat ? ' ' + ({ N: 'S-NPP', J: 'NOAA-20', N21: 'NOAA-21', T: 'Terra', A: 'Aqua' }[p.sat] || p.sat) : '');

/* formulir ubah status (dipakai dari daftar & dari detail titik di peta) */
function ubah(p, selesai) {
  const A = X(); A.perlu('Masuk dengan akun Pantau Rimbak untuk memperbarui tindak lanjut.', async () => {
    let D = { status: {}, tim: [], admin: false }; try { D = await muat(true); } catch (e) { return A.toast('Tidak ada koneksi. Tindak lanjut memerlukan internet.'); }
    const cur = D.status[p.k] || {}, sNow = cur.s || 'Terdeteksi', u = A.akun();
    const host = document.createElement('div'); host.className = 'wb-dlg tl-dlg'; host.style.cssText = 'position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(4,12,8,.55);backdrop-filter:blur(4px)';
    host.innerHTML = `<div class="fa" style="width:min(520px,100%);max-height:92vh;overflow:auto;background:var(--surface);color:var(--fg);border-radius:24px;padding:20px;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)">
      <div><h4 style="margin:0;font-size:18px">Tindak lanjut titik panas</h4><p class="fa-note">${esc(A.wib(p.when))} · ${esc(sat(p))} · ${p.la.toFixed(5)}, ${p.lo.toFixed(5)}</p><div style="margin-top:6px">Status sekarang: ${pill(sNow)}${cur.p ? ` · petugas <b>${esc(cur.p)}</b>` : ''}</div></div>
      <div><h5>Status baru</h5><div class="fa-chips" data-n="s" style="--c:#9F1239">${ST.slice(1).map(s => `<button type="button" aria-pressed="${s === sNow}">${esc(s)}</button>`).join('')}</div></div>
      <div><h5>Petugas</h5>${D.admin ? `<select id="tlP"><option value="">– tidak diubah –</option>${D.tim.map(t => `<option value="${esc(t.id)}">${esc(t.nama)}</option>`).join('')}</select>` : `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="tlSaya" ${cur.saya ? 'checked disabled' : ''}> Tugaskan ke saya (${esc(u.nama)})</label>`}</div>
      <div><h5>Catatan</h5><textarea id="tlC" rows="3" maxlength="300" placeholder="mis. tim berangkat 14.00, api sudah padam, lahan ladang warga"></textarea></div>
      ${cur.r ? `<details><summary style="cursor:pointer;font-weight:700;font-size:13px">Riwayat</summary><pre style="white-space:pre-wrap;font:12px/1.5 var(--f-data,monospace);margin:8px 0 0">${esc(cur.r)}</pre></details>` : ''}
      <div class="fa-row"><button class="fa-btn" id="tlX">Batal</button><button class="fa-btn pri" style="--c:#9F1239" id="tlOk">Simpan</button></div><p class="fa-err" id="tlE"></p></div>`;
    document.body.appendChild(host); host.onclick = e => { if (e.target === host) host.remove(); };
    const g = host.querySelector('[data-n=s]'); g.querySelectorAll('button').forEach(b => b.onclick = () => g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))));
    host.querySelector('#tlX').onclick = () => host.remove();
    host.querySelector('#tlOk').onclick = async () => {
      const s = (g.querySelector('[aria-pressed=true]') || {}).textContent; if (!s) return host.querySelector('#tlE').textContent = 'Pilih status.';
      const pid = D.admin ? host.querySelector('#tlP').value : (host.querySelector('#tlSaya').checked && !cur.saya ? u.id : '');
      const b = host.querySelector('#tlOk'); b.disabled = true; b.textContent = 'Menyimpan…';
      try { const j = await A.api({ aksi: 'tindak_set', kode: p.k, status: s, petugas_id: pid, catatan: host.querySelector('#tlC').value.trim(), deteksi_ms: +p.when, la: p.la, lo: p.lo, hd: window.FHSiteNama ? FHSiteNama() : '', jenis: 'titik' }, 30000);
        if (!j.ok) { host.querySelector('#tlE').textContent = j.galat || 'Gagal'; b.disabled = false; b.textContent = 'Simpan'; return; }
        DATA = null; host.remove(); A.toast('Tindak lanjut tersimpan ✓'); A.pakai('tindak_ubah'); selesai && selesai(s); }
      catch (e) { host.querySelector('#tlE').textContent = 'Tidak ada koneksi.'; b.disabled = false; b.textContent = 'Simpan'; }
    };
  });
}
/* status ringkas untuk detail titik di peta */
async function status(k) { try { const D = await muat(false); return D.status[k] || null; } catch (e) { return null; } }

function open() {
  const A = X(); if (!A || !window.openPage) return; A.pakai('tindak');
  openPage('Tindak lanjut kejadian', 'Status penanganan titik panas', '<div class="fa" id="tlW"><div class="fa-card"><p class="fa-note">Memuat…</p></div></div>', () => tampil(document.getElementById('tlW')));
}
async function tampil(w, filt) {
  const A = X(); filt = filt || { s: 'aktif', r: 5, h: 30 };
  if (!A.akun()) { w.innerHTML = `<div class="fa-card"><h4>Masuk untuk melihat tindak lanjut</h4><p class="fa-note">Status penanganan tersimpan di basis data PRCF dan hanya untuk pengguna terverifikasi.</p><button class="fa-btn pri" style="--c:#9F1239;margin-top:10px" id="tlM">Masuk</button></div>`; w.querySelector('#tlM').onclick = () => A.perlu('Masuk untuk melihat tindak lanjut kejadian.', () => tampil(w, filt)); return; }
  let D; try { D = await muat(true); } catch (e) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${esc(e.message === 'offline-uji' ? 'Mode uji lokal: basis data tidak dihubungi.' : 'Tidak ada koneksi. Tindak lanjut memerlukan internet.')}</p></div>`; return; }
  const ALL = window.FHAll ? FHAll() : [], si = window.FHSiteIdx ? FHSiteIdx() : 0, now = Date.now();
  const titik = ALL.filter(p => p.ls && p.ls[si] <= filt.r && now - p.when <= filt.h * 864e5).sort((a, b) => b.when - a.when);
  const S = k => (D.status[k] || {}).s || 'Terdeteksi';
  const L = titik.filter(p => filt.s === 'semua' ? true : filt.s === 'aktif' ? S(p.k) !== 'Selesai' : S(p.k) === filt.s);
  const hit = {}; ST.forEach(s => hit[s] = 0); titik.forEach(p => hit[S(p.k)]++);
  const resp = Object.values(D.status).map(v => { const c = v.w && (v.w.cek || v.w.tangani); const t = c ? Date.parse(c.replace(' ', 'T') + '+07:00') : NaN; return v.dt && t > v.dt ? (t - v.dt) / 36e5 : null; }).filter(v => v != null).sort((a, b) => a - b);
  const med = resp.length ? resp[Math.floor(resp.length / 2)] : null;
  w.innerHTML = `<div class="fa-kpi">${ST.map(s => `<div><small>${esc(s)}</small><b>${hit[s]}</b></div>`).join('')}<div><small>Median waktu respons</small><b>${med == null ? '–' : (med < 48 ? A.n1(med, 1) + ' jam' : A.n1(med / 24, 1) + ' hari')}</b></div></div>
   <div class="fa-card"><h5>Tampilkan</h5><div class="fa-chips" id="tlF" style="--c:#9F1239">${[['aktif', 'Belum selesai'], ['semua', 'Semua'], ...ST.map(s => [s, s])].map(([v, t]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${filt.s === v}">${esc(t)}</button>`).join('')}</div>
    <div class="fa-row" style="margin-top:10px"><label>Jarak dari Hutan Desa<select id="tlR">${[[0, 'Di dalam Hutan Desa'], [5, '≤ 5 km'], [25, '≤ 25 km']].map(([v, t]) => `<option value="${v}" ${filt.r == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Periode<select id="tlH">${[[7, '7 hari'], [30, '30 hari'], [90, '90 hari'], [400, '12 bulan']].map(([v, t]) => `<option value="${v}" ${filt.h == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div></div>
   <div class="fa-row"><button class="fa-btn" id="tlCsv">Unduh CSV</button></div>
   <div class="fa-card"><div class="fa-list">${L.length ? L.slice(0, 300).map(p => { const v = D.status[p.k] || {}; return `<div class="fa-it" data-k="${esc(p.k)}" style="cursor:pointer"><span class="d" style="background:${(WR[S(p.k)] || WR.Terdeteksi)[1]}"></span><span class="m"><b>${esc(A.wib(p.when))}</b><small>${esc(sat(p))} · ${p.ls[si] <= 0 ? 'di dalam Hutan Desa' : A.n1(p.ls[si], 1) + ' km dari Hutan Desa'} · FRP ${A.n1(p.frp, 1)} MW</small>${v.p ? `<small>Petugas: ${esc(v.p)}${v.c ? ' · ' + esc(v.c) : ''}</small>` : ''}</span>${pill(S(p.k))}</div>`; }).join('') : `<p class="fa-note">Tidak ada titik panas ${filt.r ? '≤ ' + filt.r + ' km' : 'di dalam Hutan Desa'} dalam ${filt.h} hari terakhir dengan status ini.</p>`}</div></div>
   <p class="fa-note">Waktu respons = selisih waktu deteksi satelit dengan status "Dicek di lapangan" (atau "Ditangani"). Sumber titik: NASA FIRMS. Ketuk titik untuk memperbarui status.</p>`;
  w.querySelectorAll('#tlF button').forEach(b => b.onclick = () => tampil(w, Object.assign({}, filt, { s: b.dataset.v })));
  w.querySelector('#tlR').onchange = e => tampil(w, Object.assign({}, filt, { r: +e.target.value }));
  w.querySelector('#tlH').onchange = e => tampil(w, Object.assign({}, filt, { h: +e.target.value }));
  w.querySelectorAll('[data-k]').forEach(el => el.onclick = () => { const p = L.find(x => x.k === el.dataset.k); if (p) ubah(p, () => tampil(w, filt)); });
  w.querySelector('#tlCsv').onclick = () => { const H = ['waktu_deteksi_wib', 'satelit', 'lintang', 'bujur', 'jarak_hutan_desa_km', 'status', 'petugas', 'ditugaskan_wib', 'dicek_wib', 'ditangani_wib', 'selesai_wib', 'catatan'];
    const tr = v => A.EN() && window.FHLang ? FHLang.t(String(v ?? '')) : v;
    const R = L.map(p => { const v = D.status[p.k] || {}, w2 = v.w || {}; return [A.wib(p.when), sat(p), p.la, p.lo, p.ls[si], S(p.k), v.p || '', w2.tugas || '', w2.cek || '', w2.tangani || '', w2.selesai || '', v.c || ''].map(tr); });
    A.dl(new Blob([A.csv([H.map(h => A.EN() && window.FHLang ? FHLang.kolom(h) : h), ...R])], { type: 'text/csv' }), (A.EN() ? 'fire_follow_up_' : 'tindak_lanjut_') + String(window.FHSiteNama ? FHSiteNama() : '').replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_') + '.csv'); };
}
window.FHTindak = { open, ubah, status, ST };
})();
