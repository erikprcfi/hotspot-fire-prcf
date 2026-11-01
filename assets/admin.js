/* Fire Hotspot – DASBOR ADMIN (v9, khusus admin PRCF)
 * Pengguna aktif (24 jam / 7 / 30 hari), pendaftar per bulan, perangkat, versi aplikasi, Hutan Desa yang dipantau,
 * fitur yang paling sering dibuka (30 hari, tanpa identitas pengguna), temuan patroli, status tindak lanjut & waktu respons,
 * pertanyaan Bara Api & analisis SHP 30 hari. Sumber: Google Sheets PRCF (Apps Script v9 aksi "dasbor"; server memeriksa ulang admin).
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s);
const NAMA = { peta: 'Peta', p3d: 'Peta 3D', sebaran: 'Sebaran titik', kejadian: 'Kejadian api', angin: 'Angin', kompas: 'Kompas', satelit: 'Lintasan satelit', ai: 'Bara Api', cuaca: 'Prakiraan', hujan: 'Cuaca & musim api',
  udara: 'Kualitas udara', lokasi: 'Cuaca lokasi saya', hutan: 'Tutupan hutan', bekas: 'Bekas terbakar', analisis: 'Analisis lahan & karbon', grafik: 'Grafik & rekap', indikator: 'Indikator program', tutupan: 'Tutupan lahan (KLHK)', karbon: 'Emisi karbon (FREL)', peringatan: 'Peringatan dini',
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
  w.querySelector('#adR').onclick = () => { w.innerHTML = '<div class="fa-card"><p class="fa-note">Memuat…</p></div>'; isi(w); };
}
window.FHAdmin = { open };
})();
