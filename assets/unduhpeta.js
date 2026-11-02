/* Fire Hotspot – UNDUH DATA SPASIAL per Hutan Desa (tahun / periode pilihan)
 * Semua unduhan hanya berisi Hutan Desa yang sedang dibuka (dipotong tepat di batasnya) – tidak pernah satu kabupaten.
 * Data: tutupan lahan tahun Y & perubahan periode (basis data bersama FHModelKLHK: peta lokal ber-groundcheck / Peta KLHK-Kemenhut 2025 + Hansen),
 * lahan kritis (Peta Lahan Kritis Kab. Kapuas Hulu 2022), batas Hutan Desa. Format: SHP (.zip, WGS84, UTF-8), GeoJSON, CSV atribut.
 */
(function () {
'use strict';
const X = () => window.FHAlat, esc = s => X().esc(s), T_ = s => window.FHLang ? FHLang.t(String(s)) : String(s), nf = (v, d = 2) => X().n1(v, d);
const J = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
const DATA = [['tutupan', 'Tutupan lahan – kondisi tahun pilihan'], ['ubah', 'Perubahan tutupan lahan – periode pilihan'], ['kritis', 'Lahan kritis'], ['batas', 'Batas Hutan Desa']];
const SLUG = s => String(s).replace(/^Hutan Desa\s*/, '').replace(/\W+/g, '_');
const tr = f => ({ type: 'Feature', geometry: f.geometry, properties: Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [k, typeof v === 'string' ? T_(v) : v])) });
async function open() {
  const A = X(); if (!A || !window.openPage) return; A.pakai('unduhpeta');
  const s = window.FHSiteObj && FHSiteObj(), MK = window.FHModelKLHK; if (!s) return A.toast('Pilih Hutan Desa di Beranda.');
  openPage('Unduh data spasial', s.hd_nama + ' · pilih data, tahun & format', `<div class="fa" id="udW">
    <div class="fa-card"><h5>Hutan Desa</h5><div style="font-size:18px;font-weight:800">${esc(s.hd_nama)}</div><p class="fa-note">Unduhan hanya berisi Hutan Desa ini (dipotong tepat di batasnya). Ganti Hutan Desa di Beranda untuk lokasi lain.</p>
     <h5 style="margin-top:12px">Data</h5><select id="udD" style="width:100%">${DATA.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select>
     <div id="udSmW"><h5 style="margin-top:12px">Sumber peta tutupan lahan</h5><select id="udSm" style="width:100%"></select></div>
     <div class="fa-row" style="margin-top:10px" id="udYW"><label id="udY0L">Tahun awal<select id="udY0"></select></label><label><span id="udY1T">Tahun</span><select id="udY1"></select></label></div>
     <h5 style="margin-top:12px">Format</h5><div class="fa-chips" id="udF" style="--c:#7C3AED">${[['shp', 'SHP (.zip)'], ['geojson', 'GeoJSON'], ['csv', 'CSV atribut']].map(([k, n], i) => `<button type="button" data-f="${k}" aria-pressed="${!i}">${n}</button>`).join('')}</div>
     <p class="fa-note" id="udInfo"></p><button class="fa-btn pri full" id="udGo" style="--c:#7C3AED;margin-top:12px">Unduh</button></div>
     <div class="fa-card"><h5>Data lain</h5><p class="fa-note">Titik panas, peringatan & laporan lapangan dapat diunduh di menu "Unduh data". Rekap emisi karbon & tutupan lahan lengkap (Excel/Word/PDF) ada di alat Emisi karbon & Tutupan lahan.</p></div></div>`, async () => {
    const w = document.getElementById('udW'), $ = q => w.querySelector(q);
    let SM; try { SM = await MK.daftarSumber(s.id); } catch (e) { SM = [MK.SUMBER_KLHK]; }
    let sid = (SM.find(x => x.id === MK.pilihan(s.id)) || SM[0]).id, M = null, fmt = 'shp';
    $('#udSm').innerHTML = SM.map((x, i) => `<option value="${esc(x.id)}" ${x.id === sid ? 'selected' : ''}>${esc(x.nama)}${i === 0 && SM.length > 1 ? ' – utama' : SM.length > 1 ? ' – pembanding' : ''}</option>`).join('');
    $('#udF').querySelectorAll('button').forEach(b => b.onclick = () => { fmt = b.dataset.f; $('#udF').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    const ui = async () => { const d = $('#udD').value, pakaiTh = d === 'tutupan' || d === 'ubah';
      $('#udSmW').hidden = !pakaiTh; $('#udYW').hidden = !pakaiTh; $('#udY0L').hidden = d !== 'ubah'; $('#udY1T').textContent = T_(d === 'ubah' ? 'Tahun akhir' : 'Tahun');
      if (pakaiTh) { try { M = await MK.muat(s.id, sid); } catch (e) { M = null; }
        if (M) { const lok = !!(M.info && M.info.lokal), y0m = lok ? M.yMin : 2001, Y = []; for (let y = M.yMax; y >= y0m; y--) Y.push(y);
          const k1 = +$('#udY1').value, k0 = +$('#udY0').value;
          $('#udY1').innerHTML = Y.map(y => `<option ${y === (Y.includes(k1) ? k1 : Math.min(M.yMax, 2025)) ? 'selected' : ''}>${y}</option>`).join('');
          $('#udY0').innerHTML = Y.map(y => `<option ${y === (Y.includes(k0) ? k0 : (lok ? M.yMin : 2020)) ? 'selected' : ''}>${y}</option>`).join('');
          $('#udInfo').textContent = T_('Sumber: ') + (M.info.nama || '') + '.'; } }
      else if (d === 'kritis') { const I = await J('data/lahan_kritis/indeks.json'), t = I && I.lokasi && I.lokasi[s.id] && I.lokasi[s.id].tahun; $('#udInfo').textContent = t ? T_('Peta Lahan Kritis Kabupaten Kapuas Hulu ') + t + '.' : T_('Data lahan kritis belum tersedia.'); }
      else $('#udInfo').textContent = T_('Batas areal kerja Hutan Desa: ') + (s.sk || '') + '.'; };
    $('#udD').onchange = ui; $('#udSm').onchange = () => { sid = $('#udSm').value; ui(); }; await ui();
    $('#udGo').onclick = async () => { const bt = $('#udGo'); bt.disabled = true; try { await unduh(s, $('#udD').value, M, +$('#udY0').value, +$('#udY1').value, fmt); } catch (e) { A.toast(e.message || 'Gagal'); } finally { bt.disabled = false; } };
  });
}
async function unduh(s, d, M, y0, y1, fmt) {
  const A = X(), slug = SLUG(s.hd_nama); let fitur = [], kolom = null, nama = '', baca = [];
  if (y0 > y1) [y0, y1] = [y1, y0];
  if (d === 'tutupan' || d === 'ubah') { if (!M) throw new Error(T_('Data tutupan lahan belum tersedia.')); const lok = !!(M.info && M.info.lokal), src = (M.info.id || 'klhk').toUpperCase();
    if (lok) { const ya = d === 'ubah' ? Math.max(M.yMin, y0 - 1) : y1, P = await FHTutupan.petaLokal(s, M, y1, d === 'ubah' ? ya : y1); if (!P) throw new Error(T_('Peta belum tersedia.'));
      if (d === 'tutupan') { fitur = P.fitur; kolom = FHTutupan.KOLOM_L; nama = `tutupan_lahan_${src}_${slug}_${y1}`; } else { fitur = P.ubah; kolom = FHTutupan.KOLOM_UBAH; nama = `perubahan_tutupan_${src}_${slug}_${ya}-${y1}`; } }
    else { const P = await FHTutupan.petaTahun(s, y1, d === 'ubah' ? y0 : y1 + 1); if (!P) throw new Error(T_('Peta belum tersedia.'));
      fitur = d === 'tutupan' ? P.fitur : P.fitur.filter(f => f.properties.UBAH_PER === 'Ya'); kolom = FHTutupan.KOLOM; nama = d === 'tutupan' ? `tutupan_lahan_${src}_${slug}_${y1}` : `perubahan_tutupan_${src}_${slug}_${y0}-${y1}`; }
    baca = [`${d === 'tutupan' ? 'Tutupan lahan' : 'Perubahan tutupan lahan'} ${s.hd_nama} – ${d === 'tutupan' ? y1 : y0 + '–' + y1}`, `Sumber: ${M.info.nama}. ${M.info.sumber || ''}`, `Metode: ${M.info.metode || ''}`]; }
  else if (d === 'kritis') { const I = await J('data/lahan_kritis/indeks.json'), t = I && I.lokasi && I.lokasi[s.id] && I.lokasi[s.id].tahun, G = t && await J(`data/lahan_kritis/${s.id}_${t}.geojson`); if (!G) throw new Error(T_('Data lahan kritis belum tersedia.'));
    fitur = G.features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: { HD_NAMA: s.hd_nama, TAHUN: t, KODE: f.properties.kode, KRITIS: f.properties.kritis, BPDAS: f.properties.bpdas, LUAS_HA: f.properties.luas_ha } }));
    kolom = [['HD_NAMA', 'C', 60], ['TAHUN', 'N', 4, 0], ['KODE', 'N', 2, 0], ['KRITIS', 'C', 30], ['BPDAS', 'C', 40], ['LUAS_HA', 'N', 14, 4]]; nama = `lahan_kritis_${slug}_${t}`; baca = [`Lahan kritis ${s.hd_nama} – ${t}`, `Sumber: Peta Lahan Kritis Kabupaten Kapuas Hulu ${t}; dipotong di batas Hutan Desa; luas UTM 49N.`]; }
  else { fitur = (s.hd.features || []).map(f => ({ type: 'Feature', geometry: f.geometry, properties: { HD_NAMA: s.hd_nama, LPHD: s.lphd || '', SK: s.sk || '', LUAS_HA: s.luas_hd_ha || null, SUMBER: s.sumber_batas || '' } }));
    kolom = [['HD_NAMA', 'C', 60], ['LPHD', 'C', 60], ['SK', 'C', 80], ['LUAS_HA', 'N', 14, 2], ['SUMBER', 'C', 120]]; nama = `batas_${slug}`; baca = [`Batas ${s.hd_nama}`, `SK: ${s.sk || '–'} · sumber batas: ${s.sumber_batas || '–'}`]; }
  if (!fitur.length) throw new Error(T_('Tidak ada poligon untuk pilihan ini (mis. tidak ada perubahan pada periode itu).'));
  const F = fitur.map(tr); baca = baca.concat(['', `Jumlah fitur: ${F.length} · sistem koordinat WGS 1984 (EPSG:4326)`, `Dibuat oleh aplikasi Fire Hotspot – Yayasan PRCF Indonesia, ${A.wib(Date.now())}`]).map(T_);
  if (A.EN()) nama = nama.replace(/^tutupan_lahan/, 'land_cover').replace(/^perubahan_tutupan/, 'land_cover_change').replace(/^lahan_kritis/, 'critical_land').replace(/^batas/, 'boundary');
  if (fmt === 'geojson') A.dl(new Blob([JSON.stringify({ type: 'FeatureCollection', name: nama, features: F })], { type: 'application/geo+json' }), nama + '.geojson');
  else if (fmt === 'csv') { const K = Object.keys(F[0].properties); A.dl(new Blob([A.csv([K, ...F.map(f => K.map(k => f.properties[k]))])], { type: 'text/csv' }), nama + '.csv'); }
  else { if (!window.FHShp) await A.lib('assets/shp.js?v=62'); A.dl(await FHShp.zip([{ nama, fitur: F, kolom }], { [`BACA_${nama}.txt`]: baca.join('\r\n') }), nama + '.zip'); }
  A.pakai('unduhpeta_unduh');
}
window.FHUnduhPeta = { open, unduh };
})();
