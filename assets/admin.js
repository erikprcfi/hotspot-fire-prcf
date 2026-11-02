/* Fire Hotspot – DASBOR ADMIN (v9, khusus admin PRCF)
 * Pengguna aktif (24 jam / 7 / 30 hari), pendaftar per bulan, perangkat, versi aplikasi, Hutan Desa yang dipantau,
 * fitur yang paling sering dibuka (30 hari, tanpa identitas pengguna), temuan patroli, status tindak lanjut & waktu respons,
 * pertanyaan Bara Api & analisis SHP 30 hari. Sumber: Google Sheets PRCF (Apps Script v9 aksi "dasbor"; server memeriksa ulang admin).
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const NAMA = { peta: 'Peta', p3d: 'Peta 3D', sebaran: 'Sebaran titik', kejadian: 'Kejadian api', angin: 'Angin', kompas: 'Kompas', satelit: 'Lintasan satelit', ai: 'Bara Api', cuaca: 'Prakiraan', hujan: 'Cuaca & musim api',
  udara: 'Kualitas udara', lokasi: 'Cuaca lokasi saya', hutan: 'Tutupan hutan', bekas: 'Bekas terbakar', analisis: 'Analisis lahan & karbon', grafik: 'Grafik & rekap', indikator: 'Indikator program', tutupan: 'Tutupan lahan', lahankritis: 'Lahan kritis', unduhpeta: 'Unduh data spasial', lahankritis_unduh: 'Lahan kritis diunduh', unduhpeta_unduh: 'Data spasial diunduh', karbon: 'Emisi karbon (FREL)', peringatan: 'Peringatan dini',
  cek: 'Cek lapangan', patroli: 'Patroli & temuan', tindak: 'Tindak lanjut kejadian', laporan: 'Laporan PDF', unduh: 'Unduh data', luring: 'Peta luring', sistem: 'Status sistem', tim: 'Tim lapangan', admin: 'Dasbor admin',
  patroli_temuan: 'Temuan patroli dicatat', patroli_rekap: 'Rekap patroli dibuat', patroli_unduh: 'Temuan diunduh', tindak_ubah: 'Status tindak lanjut diubah', v_dash: 'Beranda', v_home: 'Tab Peta', v_fc: 'Tab Prakiraan', v_ai: 'Tab Bara Api', v_lap: 'Tab Laporan', v_info: 'Tab Profil' };
function bars(L, c, nm) { const m = Math.max(1, ...L.map(x => x[1])); return L.length ? L.map(([k, v]) => `<div class="fa-bar" style="--c:${c}"><span title="${esc(nm ? nm(k) : k)}">${esc(nm ? nm(k) : k)}</span><i style="width:${v / m * 50}%"></i><b>${X().n1(v, 0)}</b></div>`).join('') : '<p class="fa-note">Belum ada data.</p>'; }
function kolom(obj, c) { const E = Object.entries(obj || {}); if (!E.length) return '<p class="fa-note">Belum ada data.</p>'; const m = Math.max(1, ...E.map(x => x[1]));
  return `<div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin-top:8px">${E.map(([k, v]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end" title="${esc(k)}: ${v}"><small style="font-size:10px;color:var(--muted)">${v || ''}</small><i style="width:100%;max-width:26px;height:${Math.max(2, v / m * 90)}%;background:${c};border-radius:4px 4px 0 0"></i><small style="font-size:9.5px;color:var(--faint)">${esc(k.slice(5))}</small></div>`).join('')}</div>`; }
async function open() {
  const A = X(); if (!A || !window.openPage) return;
  openPage('Dasbor admin', 'Pengguna · pemakaian · lapangan', '<div class="fa" id="adW"><div class="fa-card"><p class="fa-note">Memuat…</p></div></div>', () => isi(document.getElementById('adW')));
}
async function isi(w) {
  const A = X();
  let D; try { D = await A.api({ aksi: 'dasbor' }, 45000); } catch (e) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${e.message === 'offline-uji' ? 'Mode uji lokal: basis data tidak dihubungi.' : 'Tidak ada koneksi. Dasbor admin memerlukan internet.'}</p></div>`; return; }
  if (!D.ok) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${esc(D.galat || 'Gagal')}</p><p class="fa-note">Dasbor admin memerlukan Apps Script v9 dan akun admin PRCF.</p></div>`; return; }
  const P = D.pengguna, n1 = A.n1, r = D.respon_jam;
  w.innerHTML = `<div class="fa-kpi"><div><small>Akun aktif</small><b>${n1(P.aktif, 0)}</b></div><div><small>Aktif 24 jam</small><b>${n1(P.a1, 0)}</b></div><div><small>Aktif 7 hari</small><b>${n1(P.a7, 0)}</b></div><div><small>Aktif 30 hari</small><b>${n1(P.a30, 0)}</b></div></div>
   <div class="fa-kpi"><div><small>Online sekarang</small><b>${n1(P.online, 0)}</b></div><div><small>Total membuka aplikasi</small><b>${n1(P.buka, 0)}</b></div><div><small>Akun diblokir</small><b>${n1(P.diblokir, 0)}</b></div><div><small>Akun dihapus pengguna</small><b>${n1(P.dihapus, 0)}</b></div></div>
   <div class="fa-card" id="adU"></div>
   <div class="fa-2"><div class="fa-card"><h4>Pendaftar per bulan</h4>${kolom(D.daftar_bulanan, '#1E7A58')}</div><div class="fa-card"><h4>Fitur dibuka per hari (30 hari)</h4>${kolom(D.fitur_harian, '#6366F1')}</div></div>
   <div class="fa-2"><div class="fa-card"><h4>Fitur paling sering dipakai (30 hari)</h4>${bars((D.fitur || []).slice(0, 15), '#6366F1', k => NAMA[k] || k)}</div>
    <div class="fa-card"><h4>Perangkat</h4>${bars(D.perangkat || [], '#0EA5E9')}<h4 style="margin-top:14px">Versi aplikasi</h4>${bars(D.versi || [], '#64748B')}</div></div>
   <div class="fa-2"><div class="fa-card"><h4>Hutan Desa yang dipantau pengguna</h4>${bars(D.hutan_desa || [], '#16A34A', k => window.FHLang ? FHLang.t(k) : k)}</div>
    <div class="fa-card"><h4>Lapangan</h4><div class="fa-kpi" style="grid-template-columns:repeat(2,1fr)"><div><small>Temuan patroli (total)</small><b>${n1(D.temuan.total, 0)}</b></div><div><small>Temuan 30 hari</small><b>${n1(D.temuan.h30, 0)}</b></div></div>
     <div style="margin-top:10px">${bars(D.temuan.jenis || [], '#B45309')}</div>
     <h4 style="margin-top:14px">Tindak lanjut kejadian</h4>${bars(Object.entries(D.tindak || {}), '#9F1239')}
     <p class="fa-note">${r ? `Waktu respons (deteksi → dicek): median ${n1(r.median, 1)} jam, tercepat ${n1(r.min, 1)} jam, terlama ${n1(r.maks, 1)} jam (${r.n} kejadian).` : 'Waktu respons belum tersedia.'}</p></div></div>
   <div class="fa-kpi"><div><small>Pertanyaan Bara Api (30 hari)</small><b>${n1(D.bara30, 0)}</b></div><div><small>Analisis SHP (30 hari)</small><b>${n1(D.analisis30, 0)}</b></div></div>
   <p class="fa-note">Diperbarui ${esc(A.wib(D.dibuat))}. Pemakaian fitur dihitung per hari tanpa identitas pengguna (UU 27/2022). Data lengkap ada di Google Sheets database pengguna PRCF.</p>
   <button class="fa-btn" id="adR">Muat ulang</button>`;
  akun(w.querySelector('#adU'), D);
  w.querySelector('#adR').onclick = () => { w.innerHTML = '<div class="fa-card"><p class="fa-note">Memuat…</p></div>'; isi(w); };
}
/* v10: siapa saja akun aktif – nama, email, Hutan Desa dipantau, terakhir aktif, online, perangkat, versi (tanpa tanggal lahir, alamat & nomor HP) */
function akun(box, D) {
  const A = X(), L = D.daftar_pengguna;
  if (!L) { box.innerHTML = '<h4>Daftar akun</h4><p class="fa-note">Nama akun tampil setelah kode Apps Script v10 ditempel (Deploy → Kelola deployment → Edit → Versi baru).</p>'; return; }
  const now = Date.now(), H = 864e5, F = { semua: () => true, a1: u => u.status === 'Aktif' && now - u.aktif_ms <= H, a7: u => u.status === 'Aktif' && now - u.aktif_ms <= 7 * H, a30: u => u.status === 'Aktif' && now - u.aktif_ms <= 30 * H, online: u => u.online, blokir: u => u.status === 'Diblokir' };
  const NM = { semua: 'Semua akun aktif', a1: 'Aktif 24 jam', a7: 'Aktif 7 hari', a30: 'Aktif 30 hari', online: 'Online sekarang', blokir: 'Diblokir' };
  let f = 'semua', q = '';
  const lama = t => { if (!t) return '–'; const m = (now - t) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' menit lalu' : m < 1440 ? Math.round(m / 60) + ' jam lalu' : Math.round(m / 1440) + ' hari lalu'; };
  const pilih = () => L.filter(u => (f === 'semua' ? u.status === 'Aktif' : F[f](u)) && (!q || (u.nama + ' ' + u.email + ' ' + u.hd).toLowerCase().includes(q)));
  const gambar = () => { const R = pilih();
    box.querySelector('#adUL').innerHTML = R.length ? `<table class="fa-tbl"><tr><th>#</th><th>Nama</th><th>Email</th><th>Hutan Desa dipantau</th><th>Terakhir aktif</th><th>Perangkat</th><th>Versi</th><th>Buka aplikasi</th><th>Terdaftar</th></tr>${R.map((u, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(u.nama || '–')}</b>${u.online ? ' <span class="fa-pill" style="background:#16A34A;color:#fff">online</span>' : ''}${u.status === 'Diblokir' ? ' <span class="fa-pill" style="background:#B91C1C;color:#fff">diblokir</span>' : ''}</td><td>${esc(u.email)}${u.verif === 'Ya' ? '' : ' <small style="color:#B45309">(belum verifikasi)</small>'}</td><td>${esc(window.FHLang ? FHLang.t(u.hd || '–') : (u.hd || '–'))}</td><td title="${esc(u.aktif)} WIB">${esc(lama(u.aktif_ms))}</td><td>${esc(u.perangkat || '–')}</td><td>${esc(u.versi || '–')}</td><td class="n">${A.n1(u.buka, 0)}</td><td>${esc(u.daftar.slice(0, 10))}</td></tr>`).join('')}</table>` : '<p class="fa-note">Tidak ada akun pada pilihan ini.</p>';
    box.querySelector('#adUn').textContent = R.length + ' akun'; box.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-selected', b.dataset.f === f)); };
  box.innerHTML = `<h4>Daftar akun · <span id="adUn"></span></h4><div class="fa-tabs" style="position:static;flex-wrap:wrap">${Object.keys(NM).map(k => `<button data-f="${k}">${NM[k]} (${L.filter(u => k === 'semua' ? u.status === 'Aktif' : F[k](u)).length})</button>`).join('')}</div>
    <div class="fa-row" style="margin:8px 0"><input id="adUq" placeholder="Cari nama, email atau Hutan Desa" style="flex:1;min-width:180px"><button class="fa-btn" id="adUcsv">Unduh CSV</button></div><div class="fa-scroll" id="adUL"></div>
    <p class="fa-note">Hanya untuk admin PRCF. Ditampilkan data seperlunya (tanpa tanggal lahir, alamat & nomor HP); akun yang dihapus pemiliknya tidak ditampilkan (UU 27/2022).</p>`;
  box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; gambar(); });
  box.querySelector('#adUq').oninput = e => { q = e.target.value.trim().toLowerCase(); gambar(); };
  box.querySelector('#adUcsv').onclick = () => { const H_ = ['nama', 'email', 'email_terverifikasi', 'hutan_desa', 'terakhir_aktif_wib', 'online', 'perangkat', 'versi', 'jumlah_buka', 'terdaftar_wib', 'status'];
    A.dl(new Blob([A.csv([H_, ...pilih().map(u => [u.nama, u.email, u.verif, u.hd, u.aktif, u.online ? 'ya' : 'tidak', u.perangkat, u.versi, u.buka, u.daftar, u.status])])], { type: 'text/csv' }), 'akun_fire_hotspot_' + f + '.csv'); };
  gambar();
}
window.FHAdmin = { open };
})();
