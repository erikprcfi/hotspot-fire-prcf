/* Pantau Rimbak – KARTU STATUS (gambar untuk WhatsApp), PENGINGAT PATROLI & PERBANDINGAN HUTAN DESA
 * Kartu  : gambar PNG 1080×1350 dari data/widget.json (status & titik panas 7 hari – aturan sama dengan aplikasi, bahaya api,
 *          cuaca BMKG/ECMWF) + data/hutan/peringatan.json. Akun Hutan Desa: kartu Hutan Desa; lainnya: ringkasan Indonesia.
 * Pengingat: notifikasi lokal Android (Capacitor LocalNotifications) pada hari & jam yang dipilih; dijadwalkan 8 pekan ke depan
 *          dan diperbarui tiap aplikasi dibuka; hari dengan bahaya api Tinggi/Ekstrem (prakiraan 7 hari) diberi saran patroli ekstra.
 * Banding: semua Hutan Desa berdampingan (admin): 7 hari terakhir, 2 bulan laporan terakhir, perubahan hutan, laporan warga.
 */
(function () {
'use strict';
const X = () => window.FHAlat, EN = () => !!(window.FHLang && FHLang.get() === 'en'), I = (id, en) => EN() ? en : id;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : (+v).toLocaleString(EN() ? 'en-GB' : 'id-ID', { maximumFractionDigits: d });
const getJ = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
const LV = () => EN() ? ['Low', 'Moderate', 'High', 'Extreme'] : ['Rendah', 'Sedang', 'Tinggi', 'Ekstrem'], LVC = ['#22C55E', '#EAB308', '#F97316', '#EF4444'];
const HARI = () => EN() ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const wibTgl = (ms = Date.now()) => new Date(ms + 7 * 36e5);
function css() {
  if (document.getElementById('kp-css')) return; const s = document.createElement('style'); s.id = 'kp-css';
  s.textContent = '.kp-img{width:100%;border-radius:16px;display:block;box-shadow:0 8px 30px -12px rgba(0,0,0,.45)}.kp-act{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.kp-act .fa-btn{flex:1}' +
    '.kp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.kp-chips button{padding:9px 13px;border-radius:999px;border:1.5px solid var(--line,#dde3df);background:var(--surface,#fff);color:inherit;font:700 13px var(--f,system-ui);cursor:pointer}' +
    '.kp-chips button[aria-pressed="true"]{background:#0B3B2C;border-color:#0B3B2C;color:#fff}.kp-f{display:flex;gap:10px;align-items:center;margin:8px 0;font-size:13.5px;font-weight:600}.kp-f input{padding:9px 10px;border-radius:10px;border:1px solid var(--line,#ddd);font:600 14px var(--f,system-ui);background:var(--surface,#fff);color:inherit}' +
    '.kp-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.kp-tbl th,.kp-tbl td{padding:7px 6px;border-top:1px solid var(--line,#eee);text-align:right;white-space:nowrap}.kp-tbl th:first-child,.kp-tbl td:first-child{text-align:left;white-space:normal}' +
    '.kp-tbl th{font-size:11px;color:var(--muted,#667);font-weight:800}.kp-up{color:#DC2626;font-weight:800}.kp-dn{color:#16A34A;font-weight:800}.kp-scroll{overflow-x:auto}';
  document.head.appendChild(s);
}

/* ================= 1. KARTU STATUS ================= */
function bulat(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function potong(c, t, maks) { if (c.measureText(t).width <= maks) return t; while (t.length > 1 && c.measureText(t + '…').width > maks) t = t.slice(0, -1); return t + '…'; }
async function gambarKartu(W, PH) {
  const F = '"Plus Jakarta Sans", system-ui, sans-serif';
  try { await Promise.all([document.fonts.load(`800 60px ${F}`), document.fonts.load(`600 30px ${F}`)]); } catch (e) { }
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, '#0B3B2C'); g.addColorStop(1, '#14563F'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = 'rgba(255,255,255,.05)'; c.beginPath(); c.arc(980, 120, 260, 0, 7); c.fill();
  const S = (await (window.FHAksesHD && FHAksesHD() ? Promise.resolve(window.FHSiteObj && FHSiteObj()) : Promise.resolve(null)));
  const L = S && W.lokasi && W.lokasi[S.id], tgl = wibTgl().toLocaleDateString(EN() ? 'en-GB' : 'id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  c.fillStyle = '#9FD8BF'; c.font = `800 30px ${F}`; c.fillText('PANTAU RIMBAK', 70, 110);
  c.fillStyle = '#D6EADF'; c.font = `600 30px ${F}`; c.fillText(tgl, 70, 158);
  c.fillStyle = '#fff'; c.font = `800 62px ${F}`; c.fillText(potong(c, L ? L.nama : 'Indonesia', 940), 70, 250);
  const ubin = (x, y, w, h, label, nilai, warna, sub) => { c.fillStyle = 'rgba(255,255,255,.09)'; bulat(c, x, y, w, h, 28); c.fill();
    c.fillStyle = '#B9D9C9'; c.font = `600 27px ${F}`; c.fillText(label, x + 30, y + 52); c.fillStyle = warna || '#fff'; c.font = `800 58px ${F}`; c.fillText(potong(c, String(nilai), w - 60), x + 30, y + 125);
    if (sub) { c.fillStyle = '#D6EADF'; c.font = `600 24px ${F}`; c.fillText(potong(c, sub, w - 60), x + 30, y + 165); } };
  if (L) {
    const st = L.status, wr = st === 'Siaga' ? '#EF4444' : st === 'Waspada' ? '#FACC15' : '#4ADE80', stT = EN() ? (st === 'Siaga' ? 'ALERT' : st === 'Waspada' ? 'WATCH' : 'SAFE') : st.toUpperCase();
    c.fillStyle = 'rgba(255,255,255,.09)'; bulat(c, 70, 300, 940, 200, 36); c.fill();
    c.fillStyle = wr; c.beginPath(); c.arc(150, 400, 38, 0, 7); c.fill();
    c.fillStyle = wr; c.font = `800 92px ${F}`; c.fillText(stT, 220, 432);
    c.fillStyle = '#D6EADF'; c.font = `600 27px ${F}`; c.fillText(potong(c, st === 'Aman' ? I('Tidak ada titik panas ≤ 5 km dalam 7 hari', 'No hotspots ≤ 5 km in 7 days') : I('Ada titik panas dekat – cek lapangan', 'Hotspots nearby – check in the field'), 700), 222, 475);
    ubin(70, 530, 455, 200, I('Titik panas ≤ 5 km', 'Hotspots ≤ 5 km'), nf(L.dekat), L.dekat ? '#FACC15' : '#fff', I('7 hari terakhir', 'last 7 days'));
    ubin(555, 530, 455, 200, I('Titik panas ≤ 25 km', 'Hotspots ≤ 25 km'), nf(L.r25), '#fff', I('7 hari terakhir', 'last 7 days'));
    const cu = L.cuaca || {};
    ubin(70, 760, 455, 200, I('Bahaya api hari ini', 'Fire danger today'), L.bahaya_level != null ? LV()[L.bahaya_level] : '–', L.bahaya_level != null ? LVC[L.bahaya_level] : '#fff', 'FWI · BMKG/ECMWF');
    ubin(555, 760, 455, 200, I('Cuaca hari ini', 'Weather today'), cu.tmaks != null ? `${nf(cu.tmaks)}° · ${nf(cu.hujan, 1)} mm` : '–', '#fff', cu.teks || '');
    c.fillStyle = 'rgba(255,255,255,.09)'; bulat(c, 70, 990, 940, 170, 28); c.fill();
    c.fillStyle = '#B9D9C9'; c.font = `600 27px ${F}`; c.fillText(I('Bahaya api 7 hari ke depan', 'Fire danger next 7 days'), 100, 1040);
    (L.hari || []).slice(0, 7).forEach((h, i) => { const x = 100 + i * 126, d = new Date(h.t + 'T00:00:00Z'); c.fillStyle = h.lv != null ? LVC[h.lv] : '#3F5F52'; bulat(c, x, 1062, 112, 78, 20); c.fill();
      c.fillStyle = '#062419'; c.font = `800 26px ${F}`; c.textAlign = 'center'; c.fillText(i === 0 ? I('Ini', 'Tdy') : HARI()[d.getUTCDay()], x + 56, 1095); c.font = `700 24px ${F}`; c.fillText(h.tmaks != null ? nf(h.tmaks) + '°' : '', x + 56, 1126); c.textAlign = 'left'; });
    const h = PH && PH.lokasi && PH.lokasi[S.id];
    c.fillStyle = '#D6EADF'; c.font = `600 26px ${F}`;
    if (h && h.status === 'selesai') c.fillText(potong(c, (h.luas_baru_ha >= 1 ? I(`🌳 Indikasi bukaan hutan baru ${nf(h.luas_baru_ha, 1)} ha – mohon cek lapangan`, `🌳 New forest clearing indication ${nf(h.luas_baru_ha, 1)} ha – please verify`) : I(`🌳 Perubahan hutan (Sentinel-2): tidak ada bukaan baru ≥ 1 ha`, `🌳 Forest change (Sentinel-2): no new clearing ≥ 1 ha`)), 940), 70, 1205);
  } else {
    const n = W.nasional || {};
    ubin(70, 300, 940, 230, I('Titik panas se-Indonesia, 24 jam terakhir', 'Hotspots in Indonesia, last 24 hours'), nf(n.total24), '#FDBA74', I(`7 hari: ${nf(n.total7)}`, `7 days: ${nf(n.total7)}`));
    c.fillStyle = '#B9D9C9'; c.font = `600 28px ${F}`; c.fillText(I('Provinsi terbanyak (24 jam)', 'Top provinces (24 h)'), 70, 600);
    (n.teratas || []).forEach((p, i) => ubin(70, 630 + i * 190, 940, 165, `${i + 1}. ${p.nama}`, nf(p.n24) + I(' titik', ' hotspots'), '#fff'));
  }
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(70, 1238, 940, 2);
  c.fillStyle = '#fff'; c.font = `800 26px ${F}`; c.fillText('Yayasan PRCF Indonesia', 70, 1282);
  c.fillStyle = '#B9D9C9'; c.font = `600 21px ${F}`; c.fillText(potong(c, I('NASA FIRMS · BMKG/ECMWF · Sentinel-2 · titik panas belum tentu kebakaran', 'NASA FIRMS · BMKG/ECMWF · Sentinel-2 · hotspots are not necessarily fires'), 940), 70, 1316);
  c.textAlign = 'right'; c.fillStyle = '#9FD8BF'; c.font = `700 21px ${F}`; c.fillText('erikprcfi.github.io/hotspot-fire-prcf', 1010, 1282); c.textAlign = 'left';
  return cv;
}
async function kartu() {
  css(); try { X() && X().pakai && X().pakai('kartu'); } catch (e) { }
  const S = window.FHAksesHD && FHAksesHD() ? FHSiteObj() : null;
  openPage(I('Kartu status', 'Status card'), (S ? S.hd_nama : 'Indonesia') + I(' · siap dibagikan ke WhatsApp', ' · ready to share on WhatsApp'), `<div class="fa" id="kpW"><div class="fa-card"><p class="fa-note">${I('Menyusun kartu…', 'Building card…')}</p></div></div>`, async () => {
    const w = document.getElementById('kpW'); let W, PH = null;
    try { W = await getJ('data/widget.json'); } catch (e) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Data belum dapat dimuat. Coba lagi saat ada sinyal.', 'Data could not be loaded. Try again when online.')}</p></div>`; return; }
    try { PH = await getJ('data/hutan/peringatan.json'); } catch (e) { }
    const cv = await gambarKartu(W, PH), blob = await new Promise(r => cv.toBlob(r, 'image/png')), url = URL.createObjectURL(blob);
    const nama = `Status-${(S ? S.hd_nama : 'Indonesia').replace(/\s+/g, '-')}-${wibTgl().toISOString().slice(0, 10)}.png`;
    const asli = !!window.FH_ASLI, file = (() => { try { return new File([blob], nama, { type: 'image/png' }); } catch (e) { return null; } })();
    const bisaShare = !asli && file && navigator.canShare && navigator.canShare({ files: [file] });
    w.innerHTML = `<img class="kp-img" alt="${esc(I('Kartu status', 'Status card'))}" src="${url}" data-kartu="${blob.size}"><div class="kp-act">
      ${bisaShare ? `<button class="fa-btn pri" style="--c:#16A34A" data-bagi>${I('Bagikan', 'Share')}</button>` : ''}<button class="fa-btn${bisaShare ? '' : ' pri'}" style="--c:#16A34A" data-unduh>${asli ? I('Bagikan / simpan', 'Share / save') : I('Unduh gambar', 'Download image')}</button></div>
      <p class="fa-note">${I('Data diperbarui otomatis tiap ± 3 jam; status memakai aturan yang sama dengan beranda aplikasi.', 'Data updates automatically every ±3 hours; status uses the same rule as the app home screen.')}</p>`;
    if (bisaShare) w.querySelector('[data-bagi]').onclick = () => navigator.share({ files: [file], title: nama, text: I('Status Pantau Rimbak hari ini', "Today's Pantau Rimbak status") }).catch(() => { });
    w.querySelector('[data-unduh]').onclick = () => X().dl(blob, nama);
  });
}

/* ================= 2. PENGINGAT PATROLI ================= */
const PK = 'pr_pengingat', ID0 = 880000, baca = () => { try { return JSON.parse(localStorage.getItem(PK)) || null; } catch (e) { return null; } }, tulis = v => { try { localStorage.setItem(PK, JSON.stringify(v)); } catch (e) { } };
const LN = () => window.FH_ASLI && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications;
async function prakiraanLv() { try { const S = window.FHSiteObj && FHSiteObj(), P = await getJ('data/prakiraan.json'), H = (P.lokasi && S && P.lokasi[S.id] && P.lokasi[S.id].hari) || []; const o = {}; H.forEach(h => o[h.tanggal] = h.level); return o; } catch (e) { return {}; } }
async function jadwalkan() {
  const P = LN(), c = baca(); if (!P) return 0;
  try { const ada = await P.getPending(); const lama = ((ada && ada.notifications) || []).filter(n => +n.id >= ID0 && +n.id < ID0 + 1000).map(n => ({ id: +n.id })); if (lama.length) await P.cancel({ notifications: lama }); } catch (e) { }
  if (!c || !c.on || !c.hari || !c.hari.length) return 0;
  const lv = await prakiraanLv(), [hh, mm] = (c.jam || '07:00').split(':').map(Number), N = [], kini = Date.now();
  for (let i = 0; i < 56 && N.length < 60; i++) {   // 8 pekan ke depan
    const d = new Date(kini + 7 * 36e5 + i * 864e5); if (!c.hari.includes(d.getUTCDay())) continue;
    const tgl = d.toISOString().slice(0, 10), at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 7, mm);
    if (at <= kini + 30000) continue;
    const l = lv[tgl], ekstra = l >= 2;
    N.push({ id: ID0 + N.length, title: (ekstra ? '🔥 ' : '🧭 ') + (c.label || I('Jadwal patroli', 'Patrol schedule')),
      body: ekstra ? I(`Bahaya api ${LV()[l].toUpperCase()} hari ini (prakiraan). Lakukan patroli ekstra, siapkan alat pemadam, dan laporkan kejadian lewat aplikasi.`, `Fire danger ${LV()[l].toUpperCase()} today (forecast). Patrol extra, prepare fire tools and report incidents in the app.`)
        : l != null ? I(`Waktunya patroli. Bahaya api hari ini: ${LV()[l]}. Buka Pantau Rimbak untuk rencana patroli.`, `Time to patrol. Fire danger today: ${LV()[l]}. Open Pantau Rimbak for the patrol plan.`)
        : I('Waktunya patroli. Buka Pantau Rimbak untuk melihat titik panas & rencana patroli.', 'Time to patrol. Open Pantau Rimbak for hotspots & the patrol plan.'),
      schedule: { at: new Date(at), allowWhileIdle: true }, extra: { url: '' } });
  }
  if (N.length) await P.schedule({ notifications: N });
  c.terjadwal = N.length; c.sampai = N.length ? new Date(N[N.length - 1].schedule.at).toISOString() : null; tulis(c);
  return N.length;
}
async function pengingat() {
  css(); try { X() && X().pakai && X().pakai('pengingat'); } catch (e) { }
  const S = window.FHAksesHD && FHAksesHD() && window.FHSiteObj ? FHSiteObj() : null;
  if (!LN()) { openPage(I('Pengingat patroli', 'Patrol reminders'), I('Khusus aplikasi Android', 'Android app only'), `<div class="fa"><div class="fa-card"><p>${I('Pengingat jadwal patroli berbunyi di HP walau tanpa sinyal, dan tersedia di <b>aplikasi Android Pantau Rimbak</b>. Unduh aplikasinya di halaman <a href="unduh/">unduhan</a>.', 'Patrol reminders ring on the phone even offline and are available in the <b>Pantau Rimbak Android app</b>. Get it on the <a href="unduh/">download page</a>.')}</p></div></div>`); return; }
  const c = baca() || { on: false, hari: [2], jam: '07:00', label: S ? I('Patroli rutin ', 'Routine patrol ') + S.hd_nama.replace('Hutan Desa ', 'HD ') : I('Patroli rutin', 'Routine patrol') };
  openPage(I('Pengingat patroli', 'Patrol reminders'), I('Berbunyi di HP walau tanpa sinyal', 'Rings on the phone even offline'), `<div class="fa" id="kpW"><div class="fa-card">
    <p style="margin:0 0 4px">${I('Pilih hari dan jam patroli rutin tim. Bila prakiraan bahaya api hari itu <b>Tinggi/Ekstrem</b>, pengingat menyarankan patroli ekstra.', 'Choose the team’s routine patrol days and time. If forecast fire danger that day is <b>High/Extreme</b>, the reminder suggests an extra patrol.')}</p>
    <div class="kp-chips" data-hari>${[1, 2, 3, 4, 5, 6, 0].map(d => `<button data-d="${d}" aria-pressed="${c.hari.includes(d)}">${HARI()[d]}</button>`).join('')}</div>
    <label class="kp-f">${I('Jam', 'Time')} <input type="time" data-jam value="${esc(c.jam)}"></label>
    <label class="kp-f" style="flex-wrap:wrap">${I('Nama', 'Label')} <input type="text" data-label maxlength="60" value="${esc(c.label)}" style="flex:1;min-width:180px"></label>
    <div class="kp-act"><button class="fa-btn" data-coba>${I('Coba bunyi (5 dtk)', 'Test (5 s)')}</button><button class="fa-btn pri" style="--c:#0B3B2C" data-simpan>${I('Simpan & aktifkan', 'Save & enable')}</button></div>
    ${c.on ? `<button class="fa-btn" style="width:100%;margin-top:8px" data-mati>${I('Matikan pengingat', 'Turn off reminders')}</button>` : ''}
    <p class="fa-note" data-msg style="margin-top:10px">${c.on ? I(`Aktif · ${c.terjadwal || 0} pengingat terjadwal`, `On · ${c.terjadwal || 0} reminders scheduled`) : I('Belum aktif', 'Not enabled')}</p>
    <p class="fa-note">${I('Pengingat dijadwalkan 8 pekan ke depan dan diperbarui setiap aplikasi dibuka. Bisa bergeser beberapa menit karena penghematan baterai Android.', 'Reminders are scheduled 8 weeks ahead and refreshed each time the app opens. Android battery saving may shift them by a few minutes.')}</p></div></div>`, () => {
    const w = document.getElementById('kpW'), msg = t => { w.querySelector('[data-msg]').textContent = t; };
    w.querySelectorAll('[data-d]').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
    const izin = async () => { const P = LN(); let s = await P.checkPermissions(); if (s.display !== 'granted') s = await P.requestPermissions(); return s.display === 'granted'; };
    w.querySelector('[data-coba]').onclick = async () => { if (!(await izin())) return msg(I('Izin notifikasi ditolak – aktifkan di Setelan Android.', 'Notification permission denied – enable it in Android Settings.'));
      await LN().schedule({ notifications: [{ id: ID0 + 999, title: '🧭 ' + (w.querySelector('[data-label]').value || I('Jadwal patroli', 'Patrol schedule')), body: I('Contoh pengingat patroli Pantau Rimbak.', 'Sample Pantau Rimbak patrol reminder.'), schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
      msg(I('Pengingat contoh akan berbunyi dalam 5 detik.', 'A sample reminder will ring in 5 seconds.')); };
    w.querySelector('[data-simpan]').onclick = async () => {
      const hari = [...w.querySelectorAll('[data-d][aria-pressed="true"]')].map(b => +b.dataset.d);
      if (!hari.length) return msg(I('Pilih minimal satu hari.', 'Choose at least one day.'));
      if (!(await izin())) return msg(I('Izin notifikasi ditolak – aktifkan di Setelan Android.', 'Notification permission denied – enable it in Android Settings.'));
      tulis({ on: true, hari, jam: w.querySelector('[data-jam]').value || '07:00', label: w.querySelector('[data-label]').value.trim() });
      const n = await jadwalkan(); msg(I(`Tersimpan · ${n} pengingat terjadwal untuk 8 pekan ke depan.`, `Saved · ${n} reminders scheduled for the next 8 weeks.`));
      window.toastMsg && toastMsg(I('Pengingat patroli aktif', 'Patrol reminders on')); };
    const mati = w.querySelector('[data-mati]'); if (mati) mati.onclick = async () => { const v = baca() || {}; v.on = false; tulis(v); await jadwalkan(); msg(I('Pengingat dimatikan.', 'Reminders turned off.')); mati.remove(); };
  });
}
// jadwal diperbarui tiap aplikasi dibuka (prakiraan bahaya api terbaru & jendela 8 pekan bergeser)
setTimeout(() => { const c = baca(); if (c && c.on && LN()) jadwalkan().catch(() => { }); }, 6000);

/* ================= 3. PERBANDINGAN HUTAN DESA ================= */
async function banding() {
  css(); try { X() && X().pakai && X().pakai('banding'); } catch (e) { }
  const SITES = (window.FHSites ? FHSites() : []), boleh = window.FHBolehSitus ? SITES.filter(s => FHBolehSitus(s.id)) : [];
  if (boleh.length < 2) { openPage(I('Perbandingan Hutan Desa', 'Village forest comparison'), I('Khusus admin', 'Admins only'), `<div class="fa"><div class="fa-card"><p>${I('Perbandingan antar-Hutan Desa tersedia untuk admin PRCF yang memiliki akses ke semua Hutan Desa dampingan.', 'The comparison is available to PRCF admins with access to all partner village forests.')}</p></div></div>`); return; }
  openPage(I('Perbandingan Hutan Desa', 'Village forest comparison'), `${boleh.length} Hutan Desa`, `<div class="fa" id="kpW"><div class="fa-card"><p class="fa-note">${I('Memuat…', 'Loading…')}</p></div></div>`, async () => {
    const w = document.getElementById('kpW');
    const [W, B, PH, V] = await Promise.all([getJ('data/widget.json').catch(() => null), getJ('data/laporan_bulanan/indeks.json').catch(() => null), getJ('data/hutan/peringatan.json').catch(() => null),
      (window.FHUmumPost ? FHUmumPost({ aksi: 'statistik_verifikasi' }).catch(() => null) : Promise.resolve(null))]);
    if (!W) { w.innerHTML = `<div class="fa-card"><p class="fa-err">${I('Data belum dapat dimuat. Coba lagi saat ada sinyal.', 'Data could not be loaded. Try again when online.')}</p></div>`; return; }
    const pendek = n => n.replace('Hutan Desa ', ''), panah = (a, b) => a == null || b == null ? '' : a > b ? ` <span class="kp-up">▲${nf(a - b)}</span>` : a < b ? ` <span class="kp-dn">▼${nf(b - a)}</span>` : '';
    const bln = B && B.laporan ? [...new Set(Object.values(B.laporan).flatMap(o => Object.keys(o)))].sort() : [], b1 = bln[bln.length - 1], b0 = bln[bln.length - 2];
    const NB = k => k ? new Date(k + '-01T00:00:00Z').toLocaleDateString(EN() ? 'en-GB' : 'id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–';
    const warga = s => { if (!V || !V.hd) return null; const k = Object.keys(V.hd).find(h => h.toLowerCase().includes(pendek(s.hd_nama).toLowerCase())); return k ? V.hd[k] : null; };
    const st = s => { const L = W.lokasi[s.id] || {}; const c = L.status === 'Siaga' ? '#DC2626' : L.status === 'Waspada' ? '#CA8A04' : '#16A34A'; return `<b style="color:${c}">${esc(EN() ? ({ Siaga: 'Alert', Waspada: 'Watch', Aman: 'Safe' })[L.status] || '–' : L.status || '–')}</b>`; };
    w.innerHTML = `<div class="fa-card"><h4 style="margin:0 0 6px">${I('Sekarang · 7 hari terakhir', 'Now · last 7 days')}</h4><div class="kp-scroll"><table class="kp-tbl"><tr><th>Hutan Desa</th><th>Status</th><th>≤5 km</th><th>≤25 km</th><th>${I('Bahaya api', 'Fire danger')}</th></tr>
      ${boleh.map(s => { const L = W.lokasi[s.id] || {}; return `<tr><td>${esc(pendek(s.hd_nama))}</td><td>${st(s)}</td><td>${nf(L.dekat)}</td><td>${nf(L.r25)}</td><td>${L.bahaya_level != null ? `<b style="color:${LVC[L.bahaya_level]}">${LV()[L.bahaya_level]}</b>` : '–'}</td></tr>`; }).join('')}</table></div></div>
      <div class="fa-card"><h4 style="margin:0 0 6px">${I('Bulanan', 'Monthly')} · ${NB(b1)} ${I('dibanding', 'vs')} ${NB(b0)}</h4><div class="kp-scroll"><table class="kp-tbl"><tr><th>Hutan Desa</th><th>${I('Titik ≤25 km', 'Hotspots ≤25 km')}</th><th>${I('di HD', 'in HD')}</th><th>${I('Hari bahaya tinggi', 'High-danger days')}</th><th>${I('Hujan', 'Rain')}</th></tr>
      ${boleh.map(s => { const R1 = B && B.laporan[s.id] && B.laporan[s.id][b1], R0 = B && B.laporan[s.id] && B.laporan[s.id][b0]; return `<tr><td>${esc(pendek(s.hd_nama))}</td><td>${nf(R1 && R1.titik_25km)}${panah(R1 && R1.titik_25km, R0 && R0.titik_25km)}</td><td>${nf(R1 && R1.titik_hd)}</td><td>${nf(R1 && R1.hari_tinggi_ekstrem)}${panah(R1 && R1.hari_tinggi_ekstrem, R0 && R0.hari_tinggi_ekstrem)}</td><td>${R1 && R1.hujan_mm != null ? nf(R1.hujan_mm) + ' mm' : '–'}</td></tr>`; }).join('')}</table></div>
      <p class="fa-note" style="margin:6px 0 0">${I('▲ naik / ▼ turun dibanding bulan sebelumnya (laporan bulanan otomatis).', '▲ up / ▼ down vs the previous month (automatic monthly reports).')}</p></div>
      <div class="fa-card"><h4 style="margin:0 0 6px">${I('Perubahan hutan & laporan warga', 'Forest change & citizen reports')}</h4><div class="kp-scroll"><table class="kp-tbl"><tr><th>Hutan Desa</th><th>${I('Indikasi (ha)', 'Indication (ha)')}</th><th>${I('Baru (ha)', 'New (ha)')}</th><th>${I('Dicek', 'Checked')}</th><th>${I('Laporan warga', 'Reports')}</th></tr>
      ${boleh.map(s => { const h = PH && PH.lokasi && PH.lokasi[s.id] || {}, v = warga(s); return `<tr><td>${esc(pendek(s.hd_nama))}</td><td>${h.status === 'selesai' ? nf(h.luas_berubah_ha || 0, 1) : '–'}</td><td>${h.status === 'selesai' ? (h.luas_baru_ha >= 1 ? `<span class="kp-up">${nf(h.luas_baru_ha, 1)}</span>` : nf(h.luas_baru_ha || 0, 1)) : '–'}</td><td>${h.dicek_utc ? h.dicek_utc.slice(8, 10) + '/' + h.dicek_utc.slice(5, 7) : '–'}</td><td>${v ? nf(v.n) + ' · ' + nf(v.dicek) + ' ' + I('dicek', 'checked') : '–'}</td></tr>`; }).join('')}</table></div></div>
      <p class="fa-note">${I('Sumber: NASA FIRMS, FWI ERA5 & BMKG/ECMWF, Sentinel-2, laporan warga di aplikasi. Data titik panas diperbarui ± 3 jam.', 'Sources: NASA FIRMS, ERA5 FWI & BMKG/ECMWF, Sentinel-2, citizen reports in the app. Hotspot data updates every ±3 hours.')}</p>`;
  });
}
window.FHKartu = { open: kartu, gambar: gambarKartu };
window.FHPengingat = { open: pengingat, jadwalkan };
window.FHBanding = { open: banding };
})();
