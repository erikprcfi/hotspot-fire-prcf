/* Pantau Rimbak – LAPORAN BULANAN per Hutan Desa (PDF dibuat otomatis tiap awal bulan oleh scripts/laporan_bulanan.py)
 * Daftar dari data/laporan_bulanan/indeks.json · unduh/bagikan PDF (di aplikasi HP: menu Simpan/Bagikan Android).
 * Hanya untuk akun Hutan Desa dampingan (mode "hd"); mode umum/SHP mendapat penjelasan.
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EN = () => !!(window.FHLang && FHLang.get() === 'en');
const BLN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nama = k => { const [y, m] = k.split('-').map(Number); return (EN() ? BLN_EN : BLN)[m] + ' ' + y; };
const nf = v => v == null ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: 1 });
const I = (id, en) => EN() ? en : id;
function css() { if (document.getElementById('bl-css')) return; const s = document.createElement('style'); s.id = 'bl-css';
  s.textContent = '.bl-it{display:flex;gap:12px;align-items:center;padding:12px 2px;border-bottom:1px solid var(--line)}.bl-it:last-child{border-bottom:0}' +
    '.bl-ic{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#F472B6,#9D174D);color:#fff;font-weight:800;font-size:12px}' +
    '.bl-m{flex:1;min-width:0}.bl-m b{display:block}.bl-m small{display:block;color:var(--mut);font-size:12.5px;line-height:1.35}' +
    '.bl-a{flex:none;display:flex;gap:6px}.bl-a a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border-radius:10px;font-weight:700;font-size:13px;text-decoration:none;background:var(--card2,#1d2a24);color:var(--txt)}' +
    '.bl-a a.pri{background:#0B3B2C;color:#fff}';
  document.head.appendChild(s); }
async function open() {
  if (!window.openPage) return; css();
  try { X() && X().pakai && X().pakai('bulanan'); } catch (e) { }
  const ak = window.FHAkun && FHAkun.akses ? FHAkun.akses() : { mode: 'hd' };
  const s = window.FHSiteObj && FHSiteObj();
  if (ak.mode !== 'hd' || !s) {
    openPage(I('Laporan bulanan', 'Monthly report'), I('Khusus Hutan Desa dampingan', 'Partner village forests only'),
      `<div class="fa"><div class="fa-card"><p>${I('Laporan bulanan otomatis (titik panas, bahaya kebakaran, cuaca dan perubahan hutan) tersedia untuk Hutan Desa dampingan PRCF. Untuk wilayah Anda sendiri, gunakan menu <b>Analisis lahan & karbon</b> dengan mengunggah SHP – hasilnya juga dapat diunduh sebagai PDF.',
        'Automatic monthly reports (hotspots, fire danger, weather and forest change) are available for PRCF partner village forests. For your own area use <b>Land & carbon analysis</b> by uploading a shapefile – its results can also be downloaded as PDF.')}</p></div></div>`);
    return;
  }
  openPage(I('Laporan bulanan', 'Monthly report'), s.hd_nama + I(' · PDF otomatis tiap awal bulan', ' · automatic PDF each month'),
    `<div class="fa" id="blW"><div class="fa-card"><p class="fa-note">${I('Memuat daftar laporan…', 'Loading reports…')}</p></div></div>`, async () => {
      const w = document.getElementById('blW');
      let idx = null; try { const r = await fetch('data/laporan_bulanan/indeks.json', { cache: 'no-cache' }); idx = r.ok ? await r.json() : null; } catch (e) { }
      const L = idx && idx.laporan && idx.laporan[s.id];
      if (!L || !Object.keys(L).length) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Belum ada laporan bulanan untuk Hutan Desa ini. Laporan dibuat otomatis tiap tanggal 1.', 'No monthly report yet for this village forest. Reports are generated automatically on the 1st of each month.')}</p></div>`; return; }
      const k = Object.keys(L).sort().reverse();
      w.innerHTML = `<div class="fa-card"><p class="fa-note" style="margin:0 0 6px">${I('Ringkasan titik panas NASA FIRMS, hari bahaya kebakaran (FWI), cuaca dibanding normal, dan indikasi perubahan hutan Sentinel-2 – siap dilampirkan ke laporan program.', 'Summary of NASA FIRMS hotspots, fire-danger days (FWI), weather versus normal, and Sentinel-2 forest-change indications – ready to attach to programme reports.')}</p>` +
        k.map(b => { const r = L[b], f = `Laporan-Bulanan-${s.hd_nama.replace(/\s+/g, '-')}-${b}.pdf`;
          return `<div class="bl-it"><span class="bl-ic">${b.slice(5)}<br>${b.slice(2, 4)}</span><span class="bl-m"><b>${esc(nama(b))}</b><small>${I('Titik panas ≤25 km', 'Hotspots ≤25 km')}: ${nf(r.titik_25km)} · ${I('di Hutan Desa', 'in forest')}: ${nf(r.titik_hd)} · ${I('hari bahaya tinggi', 'high-danger days')}: ${nf(r.hari_tinggi_ekstrem)} · ${I('hujan', 'rain')} ${nf(r.hujan_mm)} mm</small></span>` +
            `<span class="bl-a"><a class="pri" href="${esc('data/' + r.berkas)}" download="${esc(f)}">PDF</a></span></div>`; }).join('') +
        `<p class="fa-note" style="margin:10px 0 0">${I('Dibuat otomatis dari data yang sama dengan aplikasi. Titik panas adalah deteksi panas satelit dan belum tentu kebakaran.', 'Generated automatically from the same data as the app. Hotspots are satellite heat detections, not necessarily fires.')}</p></div>`;
    });
}
window.FHBulanan = { open };
})();
