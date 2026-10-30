/* Analisis area – Fire Hotspot PRCF (analisis area dengan dataset resmi)
 * - Area dampingan PRCF (6 Hutan Desa + 6 desa): hasil siap pakai di data/analisis/*.json
 * - SHP unggahan (zip: .shp .shx .dbf .prj): dibaca & divalidasi di perangkat, dikirim oleh PENGGUNA TERVERIFIKASI ke database PRCF,
 *   dihitung otomatis di server (GitHub Actions, scripts/analisis_inti.py — cara hitung sama persis dengan area dampingan),
 *   hasilnya hanya dapat dibuka pemiliknya.
 * Isi analisis: tutupan & penggunaan lahan 2000–2020 (GLAD GLCLUC), perubahan hutan 2001–2025 (Hansen/UMD GFC v1.13),
 * emisi/serapan/fluks bersih GRK hutan 2001–2025 & stok karbon 2000 (Harris et al. 2021; Gibbs et al. 2025, versi 20260327),
 * titik panas 2016–2025 (arsip NASA FIRMS), wilayah administrasi (BPS/BIG + Kepmendagri 2025).
 * Pemakaian: FHAnalisis.mount(el, { mode: 'app' | 'web', akun: () => ({id, token, nama}) | null, base: '' })
 */
(function () {
'use strict';
const AKUN_URL = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec';
const KUNCI = 'fh-prcf-2026-akun';
const LIB = { zip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', proj4: 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const N = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const loadJS = (src, g) => new Promise((ok, no) => { if (window[g]) return ok(window[g]); const s = document.createElement('script'); s.src = src; s.onload = () => ok(window[g]); s.onerror = () => no(new Error('Pustaka gagal dimuat (perlu internet)')); document.head.appendChild(s); });
async function api(body, ms = 60000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(AKUN_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ kunci: KUNCI, bahasa: (window.FHLang && FHLang.get()) === 'en' ? 'en' : 'id' }, body)), signal: c.signal }); return await r.json(); } finally { clearTimeout(t); } }

/* ---------------- pembaca shapefile (poligon) ---------------- */
function readSHP(buf) {
  const dv = new DataView(buf); if (dv.getInt32(0) !== 9994) throw new Error('Berkas .shp tidak valid.');
  const type = dv.getInt32(32, true); if (![5, 15, 25].includes(type)) throw new Error('SHP harus bertipe POLIGON (bukan titik/garis).');
  const len = dv.getInt32(24) * 2, polys = []; let o = 100;
  while (o < len) {
    const cl = dv.getInt32(o + 4) * 2, st = o + 8, t = dv.getInt32(st, true);
    if (t !== 0) {
      const np = dv.getInt32(st + 36, true), npt = dv.getInt32(st + 40, true), parts = [];
      for (let i = 0; i < np; i++) parts.push(dv.getInt32(st + 44 + 4 * i, true));
      const p0 = st + 44 + 4 * np, rings = [];
      for (let i = 0; i < np; i++) { const a = parts[i], b = i + 1 < np ? parts[i + 1] : npt, r = []; for (let k = a; k < b; k++) r.push([dv.getFloat64(p0 + 16 * k, true), dv.getFloat64(p0 + 16 * k + 8, true)]); if (r.length >= 4) rings.push(r); }
      polys.push(rings);
    }
    o = st + cl;
  }
  if (!polys.length) throw new Error('SHP tidak berisi poligon.');
  return polys;
}
const signedArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; };   // >0 = searah jarum jam
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
function toMulti(recs) {   // aturan shapefile: cincin luar searah jarum jam, lubang berlawanan
  const out = [];
  for (const rings of recs) { const outer = [], holes = [];
    rings.forEach(r => (signedArea(r) >= 0 ? outer : holes).push(r));
    if (!outer.length) { holes.forEach(h => out.push([h.slice().reverse()])); continue; }
    const P = outer.map(r => [r.slice().reverse()]);   // GeoJSON: luar berlawanan jarum jam
    holes.forEach(h => { const p = P.find(q => inRing(h[0], q[0])) || P[0]; p.push(h.slice().reverse()); });
    out.push(...P); }
  return { type: 'MultiPolygon', coordinates: out };
}
function ringAreaHa(r) {   // luas geodesik pendekatan bola (Chamberlain & Duquette 2007)
  const R = 6371007.2, rad = Math.PI / 180; let s = 0;   // jari-jari autalik
  for (let i = 0; i < r.length - 1; i++) s += (r[i + 1][0] - r[i][0]) * rad * (2 + Math.sin(r[i][1] * rad) + Math.sin(r[i + 1][1] * rad));
  return Math.abs(s * R * R / 2) / 1e4;
}
const areaHa = mp => mp.coordinates.reduce((a, p) => a + ringAreaHa(p[0]) - p.slice(1).reduce((b, h) => b + ringAreaHa(h), 0), 0);
function simplify(r, tol) {   // Douglas–Peucker
  if (r.length < 5) return r; const keep = new Uint8Array(r.length); keep[0] = keep[r.length - 1] = 1; const st = [[0, r.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let mx = 0, ix = -1; const [x1, y1] = r[a], [x2, y2] = r[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const t = L ? Math.max(0, Math.min(1, ((r[i][0] - x1) * dx + (r[i][1] - y1) * dy) / L)) : 0, d = Math.hypot(r[i][0] - x1 - t * dx, r[i][1] - y1 - t * dy); if (d > mx) { mx = d; ix = i; } }
    if (mx > tol && ix > 0) { keep[ix] = 1; st.push([a, ix], [ix, b]); } }
  const o = r.filter((_, i) => keep[i]); return o.length >= 4 ? o : r;
}
async function bacaZip(file) {
  if (!/\.zip$/i.test(file.name)) throw new Error('Unggah berkas berformat .zip (berisi .shp, .shx, .dbf, .prj).');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran zip maksimal 5 MB.');
  const JSZip = await loadJS(LIB.zip, 'JSZip'), z = await JSZip.loadAsync(file);
  const names = Object.keys(z.files).filter(n => !z.files[n].dir && !/__MACOSX/.test(n)), shp = names.filter(n => /\.shp$/i.test(n));
  if (shp.length !== 1) throw new Error(shp.length ? 'Zip berisi lebih dari satu .shp. Unggah satu shapefile per zip.' : 'Zip tidak berisi berkas .shp.');
  const base = shp[0].replace(/\.shp$/i, ''), find = ext => names.find(n => n.toLowerCase() === (base + ext).toLowerCase());
  if (!find('.shx') || !find('.dbf')) throw new Error('Shapefile tidak lengkap: wajib ada .shp, .shx dan .dbf.');
  const recs = readSHP(await z.file(shp[0]).async('arraybuffer'));
  const prjF = find('.prj'), prj = prjF ? (await z.file(prjF).async('string')).trim() : '';
  let mp = toMulti(recs); const flat = mp.coordinates.flat(2), xs = flat.map(p => p[0]), ys = flat.map(p => p[1]);
  const geog = Math.max(...xs.map(Math.abs)) <= 180 && Math.max(...ys.map(Math.abs)) <= 90;
  if (prj && !/^GEOGCS/i.test(prj)) {
    const proj4 = await loadJS(LIB.proj4, 'proj4'); let f; try { f = proj4(prj, 'EPSG:4326'); } catch (e) { throw new Error('Sistem koordinat (.prj) tidak dikenali. Simpan ulang SHP dalam WGS 1984 atau UTM.'); }
    mp = { type: 'MultiPolygon', coordinates: mp.coordinates.map(p => p.map(r => r.map(c => f.forward([c[0], c[1]])))) };
  } else if (!prj && !geog) throw new Error('Berkas .prj tidak ada dan koordinat bukan derajat. Sertakan .prj dalam zip.');
  else if (prj && /GEOGCS/i.test(prj) && !/WGS[ _]?(19)?84|D_WGS_1984|DGN95|SRGI/i.test(prj)) throw new Error('Datum geografis tidak didukung. Gunakan WGS 1984 (EPSG:4326) atau UTM WGS 84.');
  const c2 = mp.coordinates.flat(2), bx = [Math.min(...c2.map(p => p[0])), Math.min(...c2.map(p => p[1])), Math.max(...c2.map(p => p[0])), Math.max(...c2.map(p => p[1]))];
  if (bx[0] < 94 || bx[2] > 142 || bx[1] < -12 || bx[3] > 7) throw new Error('Area harus berada di wilayah Indonesia.');
  const ha = areaHa(mp);
  if (!(ha > 0.5)) throw new Error('Luas poligon terlalu kecil (< 0,5 ha) atau tidak valid.');
  if (ha > 250000) throw new Error(`Luas area ${N(ha)} ha melebihi batas 250.000 ha. Bagi menjadi beberapa SHP.`);
  const simp = { type: 'MultiPolygon', coordinates: mp.coordinates.map(p => p.map(r => simplify(r, 0.00003).map(c => [+c[0].toFixed(6), +c[1].toFixed(6)]))) };
  return { geojson: simp, ha, bbox: bx, nRec: recs.length, nama: base.split('/').pop(), prj: prj ? (prj.match(/^\w+\["([^"]+)"/) || [, 'tercantum'])[1] : 'WGS 1984 (tanpa .prj)' };
}

/* ---------------- tampilan ---------------- */
if (!document.getElementById('fhan-css')) {
  const st = document.createElement('style'); st.id = 'fhan-css';
  st.textContent = `.fan{display:grid;gap:14px;color:var(--fg,#111);min-width:0}.fan *{box-sizing:border-box}
  .fan-card{background:var(--surface,#fff);border:1px solid var(--line,#e2e8e4);border-radius:18px;padding:14px;min-width:0}
  .fan h3{margin:0 0 4px;font-size:16px}.fan .mut{color:var(--muted,#66756c);font-size:12.5px;line-height:1.45;margin:4px 0 0}
  .fan-hero{background:linear-gradient(130deg,#0B3B2C,#14563F 55%,#1E7A58);color:#fff;border-radius:20px;padding:16px}.fan-hero h2{margin:0;font-size:19px}.fan-hero p{margin:6px 0 0;opacity:.88;font-size:12.5px;line-height:1.45}
  .fan-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 16px;border-radius:14px;border:0;background:#14563F;color:#fff;font:700 14px var(--f,system-ui);cursor:pointer;width:100%}
  .fan-btn.alt{background:var(--surface-2,#f1f5f2);color:var(--fg,#111);border:1px solid var(--line,#dde3df)}.fan-btn:disabled{opacity:.55}
  .fan-drop{border:2px dashed var(--line,#c9d3cd);border-radius:16px;padding:18px;text-align:center;cursor:pointer;font-size:13px;color:var(--muted,#66756c)}
  .fan-drop b{display:block;color:var(--fg,#111);font-size:14.5px;margin-bottom:4px}
  .fan-list button{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 2px;border:0;border-top:1px solid var(--line,#eee);background:none;color:inherit;font:inherit;cursor:pointer}
  .fan-list button:first-child{border-top:0}.fan-list small{display:block;color:var(--muted,#66756c);font-size:11.5px}.fan-st{flex:none;font-size:11px;font-weight:800;padding:4px 8px;border-radius:999px}
  .fan-per{display:flex;align-items:center;gap:8px;margin:12px 0 6px;font-size:12.5px;font-weight:700;color:var(--muted,#6b766f)}.fan-per select{padding:8px 10px;border-radius:10px;border:1.5px solid var(--line,#dde3df);background:var(--surface,#fff);color:var(--fg,#111);font:600 13px var(--f,system-ui)}.fan-per small{font-weight:500}
  .fan-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.fan-tabs::-webkit-scrollbar{display:none}
  .fan-tabs button{flex:none;height:36px;padding:0 13px;border-radius:999px;border:1px solid var(--line,#dde3df);background:var(--surface,#fff);color:inherit;font:700 12.5px var(--f,system-ui);cursor:pointer}.fan-tabs button[aria-pressed=true]{background:#14563F;border-color:#14563F;color:#fff}
  .fan-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.fan-kpi div{background:var(--surface-2,#f4f7f5);border-radius:14px;padding:10px 12px}.fan-kpi b{display:block;font:700 19px var(--f-data,ui-monospace,monospace)}.fan-kpi span{font-size:11.5px;color:var(--muted,#66756c)}
  .fan-map{height:260px;border-radius:14px;overflow:hidden;background:#0b2a20}
  .fan table{width:100%;border-collapse:collapse;font-size:12.5px}.fan th,.fan td{padding:7px 4px;border-bottom:1px solid var(--line,#eee);text-align:right}.fan th:first-child,.fan td:first-child{text-align:left}
  .fan-sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;border:1px solid rgba(0,0,0,.15)}
  .fan svg text{font-family:var(--f,system-ui)}.fan-src{font-size:11px;color:var(--muted,#66756c);line-height:1.45;margin-top:8px}
  .fan-in{width:100%;height:44px;border-radius:12px;border:1.5px solid var(--line,#dde3df);padding:0 12px;background:var(--surface-2,#f6f8f6);color:var(--fg,#111);font:500 14px var(--f,system-ui)}
  .fan-chk{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.45;color:var(--muted,#66756c)}.fan-chk input{width:20px;height:20px;flex:none;accent-color:#14563F}
  .fan-err{color:#B3261E;font-weight:700;font-size:13px}`;
  document.head.appendChild(st);
}
const ST = { Menunggu: ['#FFF4E5', '#B26A00'], Diproses: ['#E8F1FB', '#1F6FC5'], Selesai: ['#E6F4EA', '#1E7A3B'], Gagal: ['#FDECEA', '#B3261E'] };
function bars(vals, labels, color, unit, h = 150) {   // grafik batang SVG sederhana
  const W = 640, P = 34, mx = Math.max(1e-9, ...vals), bw = (W - P - 6) / vals.length;
  let s = `<svg viewBox="0 0 ${W} ${h + 22}" style="width:100%;height:auto" role="img"><line x1="${P}" y1="${h}" x2="${W}" y2="${h}" stroke="var(--line,#ddd)"/>`;
  [0, .5, 1].forEach(f => { const y = h - (h - 10) * f; s += `<text x="${P - 4}" y="${y + 3}" font-size="10" text-anchor="end" fill="#7a867f">${N(mx * f, mx < 10 ? 1 : 0)}</text>`; });
  vals.forEach((v, i) => { const bh = (h - 10) * v / mx, x = P + 3 + i * bw; s += `<rect x="${x}" y="${h - bh}" width="${Math.max(1, bw - 2)}" height="${bh}" rx="2" fill="${typeof color === 'function' ? color(i) : color}"><title>${labels[i]}: ${N(v, 1)} ${unit}</title></rect>`;
    if (vals.length <= 12 || i % 5 === 0 || i === vals.length - 1) s += `<text x="${x + bw / 2}" y="${h + 14}" font-size="10" text-anchor="middle" fill="#7a867f">${labels[i]}</text>`; });
  return s + '</svg>';
}
function viewer(el, R, back) {
  const K = R.kelas, tl = R.tutupan_lahan_ha, Y = R.tahun_tutupan, H = R.hutan, C = R.karbon, T = R.titik_panas || null, luas = R.luas_ha;
  const kn = k => (K.find(x => x.kode === k) || {}).nama || k, kw = k => (K.find(x => x.kode === k) || {}).warna || '#999';
  const net = C.fluks_bersih_per_tahun_tCO2e, sink = net < 0;
  const yAll = Object.keys(H.kehilangan_per_tahun_ha).sort(); let RY = [yAll[0], yAll[yAll.length - 1]];
  const inR = y => y >= RY[0] && y <= RY[1], rLbl = () => RY[0] === RY[1] ? RY[0] : RY[0] + '–' + RY[1], penuh = () => RY[0] === yAll[0] && RY[1] === yAll[yAll.length - 1];
  el.innerHTML = `<div class="fan">${back ? `<button class="fan-btn alt" data-back style="width:auto">← Kembali</button>` : ''}
   <div class="fan-hero"><h2>${esc(R.nama)}</h2><p>${esc(R.jenis || '')} · ${N(luas, 1)} ha · dihitung ${esc((R.dibuat_utc || '').slice(0, 10))}</p>
    ${R.wilayah && R.wilayah.length ? `<p>${esc([...new Set(R.wilayah.map(w => `${w.kab.replace('Kabupaten ', 'Kab. ')}, ${w.prov}`))].slice(0, 3).join(' · '))}</p>` : ''}</div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="fan-btn" data-pdf>Unduh laporan PDF</button><button class="fan-btn alt" data-csv>Unduh tabel CSV (Excel)</button></div>
   <div class="fan-map" id="fanMap"></div>
   <div class="fan-per"><span>Periode</span><select data-y1>${yAll.map(y => `<option${y === RY[0] ? ' selected' : ''}>${y}</option>`).join('')}</select><span>–</span><select data-y2>${yAll.map(y => `<option${y === RY[1] ? ' selected' : ''}>${y}</option>`).join('')}</select><small>data tahunan</small></div>
   <div class="fan-tabs">${['Ringkasan', 'Tutupan lahan', 'Perubahan hutan', 'Karbon & iklim', 'Titik panas', 'Wilayah & sumber'].map((t, i) => `<button data-t="${i}" aria-pressed="${!i}">${t}</button>`).join('')}</div>
   <div id="fanBody"></div></div>`;
  if (back) el.querySelector('[data-back]').onclick = back;
  el.querySelector('[data-pdf]').onclick = async e => { const b = e.currentTarget, t = b.textContent; b.disabled = true; b.textContent = 'Menyusun PDF…'; try { const n = await pdfHasil(R); b.textContent = `PDF ${n} halaman diunduh ✓`; } catch (x) { b.textContent = 'Gagal: ' + x.message; } setTimeout(() => { b.disabled = false; b.textContent = t; }, 3000); };
  el.querySelector('[data-csv]').onclick = () => { if (!window.FHUnduh || !FHUnduh.analisisCSV) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + FHUnduh.analisisCSV([R])], { type: 'text/csv;charset=utf-8' })); a.download = `${EN() ? 'analysis' : 'analisis'}_${(R.nama || 'area').replace(/\W+/g, '_')}.csv`; a.click(); };
  if (window.L) setTimeout(() => { const m = L.map(el.querySelector('#fanMap'), { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg', { maxNativeZoom: 14, maxZoom: 17, attribution: 'Sentinel-2 cloudless 2025 · EOX (CC BY-NC-SA 4.0)' }).addTo(m);
    const g = L.geoJSON(R.geometri, { style: { color: '#FFD84D', weight: 2.2, fillOpacity: 0 } }).addTo(m); m.fitBounds(g.getBounds(), { padding: [16, 16] }); }, 30);
  const body = el.querySelector('#fanBody');
  const tabs = [
    () => `<div class="fan-card"><div class="fan-kpi">
       <div><b>${N(H.hutan_2000_ha, 1)} ha</b><span>hutan tahun 2000 (tajuk ≥ 30%)</span></div><div><b>${N(H.kehilangan_total_ha, 1)} ha</b><span>kehilangan tutupan pohon 2001–2025 (${N(H.persen_hilang, 1)}%)</span></div>
       <div><b>${N((tl['2020'].pohon || 0) + (tl['2020'].basah_pohon || 0), 1)} ha</b><span>tutupan pohon 2020 (GLAD)</span></div><div><b>${N(C.stok_karbon_total_2000_tC)} tC</b><span>stok karbon total tahun 2000</span></div>
       <div><b>${N(C.emisi_bruto_per_tahun_tCO2e)}</b><span>emisi bruto rata-rata, tCO₂e/tahun</span></div><div><b>${N(C.serapan_bruto_per_tahun_tCO2)}</b><span>serapan bruto rata-rata, tCO₂/tahun</span></div>
       <div><b style="color:${sink ? '#1E7A3B' : '#B3261E'}">${N(net)}</b><span>fluks bersih tCO₂e/tahun → ${sink ? 'PENYERAP karbon bersih' : 'SUMBER emisi bersih'}</span></div>${T ? `<div><b>${N(T.total)}</b><span>titik panas ${T.periode}</span></div>` : ''}</div>
       <p class="mut">Semua angka dihitung langsung dari dataset resmi (lihat tab "Wilayah & sumber"). Kehilangan tutupan pohon mencakup penebangan, kebakaran & kerusakan alami, tidak selalu deforestasi permanen.</p></div>`,
    () => { const ks = K.map(k => k.kode).filter(k => Y.some(y => (tl[String(y)][k] || 0) > 0.05));
      const W = 640, bh = 22; let s = `<svg viewBox="0 0 ${W} ${Y.length * (bh + 8) + 4}" style="width:100%;height:auto">`;
      Y.forEach((y, i) => { let x = 48; s += `<text x="0" y="${i * (bh + 8) + 15}" font-size="12" fill="#7a867f">${y}</text>`; ks.forEach(k => { const w = (W - 50) * (tl[String(y)][k] || 0) / luas; if (w > 0) s += `<rect x="${x}" y="${i * (bh + 8)}" width="${w}" height="${bh}" fill="${kw(k)}"><title>${kn(k)} ${y}: ${N(tl[String(y)][k], 1)} ha</title></rect>`; x += w; }); });
      s += '</svg>';
      const tr = Object.entries(R.perubahan_2000_2020_ha || {}).slice(0, 8);
      return `<div class="fan-card"><h3>Tutupan & penggunaan lahan 2000–2020</h3>${s}
       <table><tr><th>Kelas</th><th>2000 (ha)</th><th>2020 (ha)</th><th>Perubahan</th></tr>${ks.map(k => { const a = tl['2000'][k] || 0, b = tl['2020'][k] || 0; return `<tr><td><span class="fan-sw" style="background:${kw(k)}"></span>${esc(kn(k))}</td><td>${N(a, 1)}</td><td>${N(b, 1)}</td><td style="color:${b - a < 0 ? '#B3261E' : '#1E7A3B'}">${b - a >= 0 ? '+' : ''}${N(b - a, 1)}</td></tr>`; }).join('')}</table>
       ${tr.length ? `<h3 style="margin-top:14px">Perubahan terbesar 2000 → 2020</h3><table>${tr.map(([k, v]) => { const [a, b] = k.split('>'); return `<tr><td>${esc(kn(a))} → ${esc(kn(b))}</td><td>${N(v, 1)} ha</td></tr>`; }).join('')}</table>` : ''}
       <p class="fan-src">GLAD Global Land Cover and Land Use Change 2000–2020 v2 (Potapov et al. 2022), 30 m. Kelas dikelompokkan dari legenda resmi GLAD. Lahan basah = permukaan basah/tergenang musiman (rawa, gambut, tepi sungai).</p></div>`; },
    () => { const yrs = Object.keys(H.kehilangan_per_tahun_ha).filter(inR), v = yrs.map(y => H.kehilangan_per_tahun_ha[y]), sR = v.reduce((a, b) => a + b, 0);
      return `<div class="fan-card"><h3>Kehilangan tutupan pohon per tahun · ${rLbl()}</h3>${bars(v, yrs.map(y => y.slice(2)), '#D9480F', 'ha')}
       ${penuh() ? '' : `<div class="fan-kpi" style="margin-top:10px"><div><b>${N(sR, 1)} ha</b><span>hilang ${rLbl()}</span></div><div><b>${N(H.hutan_2000_ha ? 100 * sR / H.hutan_2000_ha : 0, 2)}%</b><span>dari hutan 2000</span></div></div>`}
       <div class="fan-kpi" style="margin-top:10px"><div><b>${N(H.hutan_2000_ha, 1)} ha</b><span>hutan 2000</span></div><div><b>${N(H.kehilangan_total_ha, 1)} ha</b><span>hilang 2001–2025</span></div><div><b>${N(H.hutan_tersisa_2025_ha, 1)} ha</b><span>tersisa 2025 (tanpa memperhitungkan pertumbuhan kembali)</span></div><div><b>${N(H.persen_hilang, 2)}%</b><span>dari hutan 2000</span></div></div>
       <p class="fan-src">Hansen/UMD/Google/USGS/NASA Global Forest Change v1.13 (2000–2025), piksel 30 m, hutan = tutupan tajuk tahun 2000 ≥ 30% . Luas piksel geodesik.</p></div>`; },
    () => { const e = C.emisi_per_tahun_kehilangan_tCO2e, yrs = Object.keys(e).filter(inR), eR = yrs.reduce((a, y) => a + e[y], 0);
      return `<div class="fan-card"><h3>Karbon hutan & gas rumah kaca (2001–2025)</h3><div class="fan-kpi">
        <div><b>${N(C.emisi_bruto_total_tCO2e)}</b><span>emisi bruto total, tCO₂e</span></div><div><b>${N(C.serapan_bruto_total_tCO2)}</b><span>serapan bruto total, tCO₂</span></div>
        <div><b style="color:${sink ? '#1E7A3B' : '#B3261E'}">${N(C.fluks_bersih_total_tCO2e)}</b><span>fluks bersih total, tCO₂e (negatif = penyerap)</span></div><div><b>${N(net)}</b><span>fluks bersih per tahun, tCO₂e/th</span></div>
        <div><b>${N(C.stok_karbon_atas_tanah_2000_tC)}</b><span>stok karbon di atas tanah 2000, tC</span></div><div><b>${N(C.stok_karbon_total_2000_tC)}</b><span>stok karbon total 2000 (semua pool), tC</span></div>
        <div><b>${N(C.rerata_karbon_total_hutan_2000_tC_ha, 1)}</b><span>rerata karbon total hutan, tC/ha</span></div><div><b>${N(C.rerata_karbon_atas_tanah_hutan_2000_tC_ha, 1)}</b><span>rerata karbon atas tanah hutan, tC/ha</span></div></div>
        ${penuh() ? '' : `<div class="fan-kpi" style="margin-top:10px"><div><b>${N(eR)}</b><span>emisi bruto dari kehilangan hutan ${rLbl()}, tCO₂e</span></div></div>`}
        <h3 style="margin-top:14px">Emisi bruto menurut tahun kehilangan · ${rLbl()}</h3>${bars(yrs.map(y => e[y]), yrs.map(y => y.slice(2)), '#8E2A1E', 'tCO₂e')}
        <p class="mut">Fluks bersih = emisi bruto − serapan bruto (cek konsistensi data: selisih ${N(C.cek_konsistensi_pct, 3)}%). Nilai per tahun = total 25 tahun ÷ 25. 1 tC = 3,667 tCO₂.</p>
        <p class="fan-src">Model fluks karbon hutan Harris et al. 2021 (Nature Climate Change) dengan pembaruan Gibbs et al. 2025 (ESSD), versi 20260327 (data publik WRI, CC BY 4.0); emisi mencakup CO₂, CH₄, N₂O dari biomassa & tanah (termasuk gambut) pada wilayah hutan model. Stok karbon tahun 2000: Harris et al. 2021. Hasil model mengandung ketidakpastian; bukan pengganti inventarisasi karbon lapangan/MRV resmi.</p></div>`; },
    () => { if (!T) return '<div class="fan-card"><p class="mut">Data titik panas tidak tersedia.</p></div>'; const yrs = Object.keys(T.per_tahun).filter(inR), S = Object.keys(T.per_tahun[Object.keys(T.per_tahun)[0]] || {}), col = { 'VIIRS S-NPP': '#E8590C', 'VIIRS NOAA-20': '#F59F00', MODIS: '#C2255C' };
      if (!yrs.length) return `<div class="fan-card"><p class="mut">Tidak ada data titik panas untuk ${rLbl()} (tersedia ${esc(T.periode)}).</p></div>`;
      return `<div class="fan-card"><h3>Titik panas ${penuh() ? T.periode + ' · ' + N(T.total) : rLbl() + ' · ' + N(yrs.reduce((a, y) => a + S.reduce((b, k) => b + T.per_tahun[y][k], 0), 0))} deteksi</h3>${!penuh() && RY[0] < Object.keys(T.per_tahun)[0] ? `<p class="mut">Arsip titik panas untuk analisis ini tersedia ${esc(T.periode)}; tahun sebelumnya tidak dihitung.</p>` : ''}${bars(yrs.map(y => S.reduce((a, s) => a + T.per_tahun[y][s], 0)), yrs, '#E8590C', 'titik')}
       <table><tr><th>Tahun</th>${S.map(s => `<th>${s}</th>`).join('')}</tr>${yrs.map(y => `<tr><td>${y}</td>${S.map(s => `<td>${N(T.per_tahun[y][s])}</td>`).join('')}</tr>`).join('')}</table>
       ${T.terbaru.length ? `<h3 style="margin-top:14px">Deteksi terbaru</h3><table><tr><th>Tanggal (UTC)</th><th>Satelit</th><th>FRP MW</th></tr>${T.terbaru.slice(0, 12).map(r => `<tr><td>${r[0]} ${String(r[1]).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')}</td><td>${esc(r[2])}</td><td>${N(r[6], 1)}</td></tr>`).join('')}</table>` : ''}
       <p class="fan-src">${esc(T.catatan)} Sumber: arsip tahunan resmi NASA FIRMS untuk Indonesia (${T.arsip_dipakai.length} berkas).</p></div>`; },
    () => `<div class="fan-card"><h3>Wilayah administrasi yang tercakup</h3>${R.wilayah && R.wilayah.length ? `<table><tr><th>Desa/Kelurahan</th><th>Kecamatan</th><th>Kab/Kota</th><th>% desa tercakup</th></tr>${R.wilayah.slice(0, 25).map(w => `<tr><td>${esc(w.desa)}</td><td>${esc(w.kec)}</td><td>${esc(w.kab.replace('Kabupaten ', 'Kab. '))}</td><td>${N(w.persen_desa_tercakup, 1)}</td></tr>`).join('')}</table>` : '<p class="mut">Tidak ada data wilayah.</p>'}
       <p class="fan-src">Batas desa BPS/BIG (OCHA COD-AB 2020), nama Kepmendagri No. 300.2.2-2430 Tahun 2025.</p>
       <h3 style="margin-top:14px">Sumber data & metode</h3><ul class="mut" style="padding-left:18px">${Object.values(R.sumber || {}).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
       <p class="mut">Metode: semua raster dibaca pada grid aslinya (0,00025° ≈ 30 m) tanpa resampling; piksel dihitung bila pusatnya di dalam poligon; luas piksel geodesik (elipsoid/bola WGS 84). Analisis area dampingan dan SHP unggahan memakai kode yang sama (scripts/analisis_inti.py, terbuka di GitHub).</p>
       <button class="fan-btn alt" data-dl style="margin-top:8px">Unduh hasil (JSON)</button></div>`];
  const show = i => { body.innerHTML = tabs[i](); el.querySelectorAll('.fan-tabs button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t === i)));
    const d = body.querySelector('[data-dl]'); if (d) d.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(EN() ? FHLang.json(R) : R, null, 1)], { type: 'application/json' })); a.download = `${EN() ? 'analysis' : 'analisis'}_${(R.nama || 'area').replace(/\W+/g, '_')}.json`; a.click(); }; };
  let cur = 0; el.querySelectorAll('.fan-tabs button').forEach(b => b.onclick = () => { cur = +b.dataset.t; show(cur); }); show(0);
  el.querySelectorAll('.fan-per select').forEach(x => x.onchange = () => { const a = el.querySelector('[data-y1]').value, b = el.querySelector('[data-y2]').value; RY = a <= b ? [a, b] : [b, a]; if (cur === 0 || cur === 1 || cur === 5) cur = 2; show(cur); });
}


/* ---------------- ekspor PDF & CSV hasil analisis (area dampingan maupun SHP unggahan) ---------------- */
const fmtI = v => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmt1 = v => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const EN = () => !!(window.FHLang && FHLang.get() === 'en');
const asc = t => String(window.FHLang ? FHLang.t(String(t ?? '')) : String(t ?? '')).replace(/[–—]/g, '-').replace(/[₂]/g, '2').replace(/[→]/g, '->').replace(/[≥]/g, '>=').replace(/[÷]/g, '/').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ\n]/g, '');
function cekKonsistensi(R) {
  const C = R.karbon, out = [], add = (n, h, ok) => out.push([n, h, ok ? 'Sesuai' : 'Perlu perhatian']);
  add('Emisi bruto - serapan bruto = fluks bersih', `${fmtI(C.emisi_bruto_total_tCO2e - C.serapan_bruto_total_tCO2)} vs ${fmtI(C.fluks_bersih_total_tCO2e)} tCO2e`, Math.abs((C.emisi_bruto_total_tCO2e - C.serapan_bruto_total_tCO2) - C.fluks_bersih_total_tCO2e) <= Math.max(2, Math.abs(C.fluks_bersih_total_tCO2e) * 0.001));
  const lc = Object.values(R.tutupan_lahan_ha['2020']).reduce((p, c) => p + c, 0); add('Jumlah kelas tutupan lahan 2020 = luas area', `${fmt1(lc)} vs ${fmt1(R.luas_ha)} ha`, Math.abs(lc - R.luas_ha) <= Math.max(0.5, R.luas_ha * 0.002));
  const ls = Object.values(R.hutan.kehilangan_per_tahun_ha).reduce((p, c) => p + c, 0); add('Jumlah kehilangan per tahun = total', `${fmt1(ls)} vs ${fmt1(R.hutan.kehilangan_total_ha)} ha`, Math.abs(ls - R.hutan.kehilangan_total_ha) <= 0.2);
  add('Kehilangan hutan <= hutan tahun 2000', `${fmt1(R.hutan.kehilangan_total_ha)} <= ${fmt1(R.hutan.hutan_2000_ha)} ha`, R.hutan.kehilangan_total_ha <= R.hutan.hutan_2000_ha + 0.1);
  const em = Object.values(R.karbon.emisi_per_tahun_kehilangan_tCO2e).reduce((p, c) => p + c, 0); add('Emisi per tahun kehilangan <= emisi bruto total', `${fmtI(em)} <= ${fmtI(C.emisi_bruto_total_tCO2e)} tCO2e`, em <= C.emisi_bruto_total_tCO2e + 2);
  if (R.titik_panas) { const t = Object.values(R.titik_panas.per_tahun).reduce((p, o) => p + Object.values(o).reduce((a, b) => a + b, 0), 0); add('Jumlah titik panas per tahun = total', `${fmtI(t)} = ${fmtI(R.titik_panas.total)}`, t === R.titik_panas.total); }
  if (R.luas_geodesik_ha) add('Luas piksel vs luas poligon geodesik', `${fmt1(R.luas_ha)} vs ${fmt1(R.luas_geodesik_ha)} ha (selisih karena aturan pusat piksel 30 m)`, Math.abs(R.luas_ha - R.luas_geodesik_ha) <= Math.max(1, R.luas_geodesik_ha * 0.03));
  return out;
}
function petaCanvas(R) {   // sketsa batas area (tanpa citra) dengan skala & koordinat
  const c = document.createElement('canvas'); c.width = 900; c.height = 560; const g = c.getContext('2d'); g.fillStyle = '#F4F7F5'; g.fillRect(0, 0, 900, 560);
  const P = R.geometri.type === 'Polygon' ? [R.geometri.coordinates] : R.geometri.coordinates, pts = P.flat(2);
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const kx = Math.cos((y0 + y1) / 2 * Math.PI / 180), s = Math.min(820 / ((x1 - x0) * kx || 1e-9), 480 / ((y1 - y0) || 1e-9)), ox = 450 - (x0 + x1) / 2 * kx * s, oy = 280 + (y0 + y1) / 2 * s;
  const X = x => ox + x * kx * s, Y = y => oy - y * s;
  g.fillStyle = 'rgba(30,122,88,.18)'; g.strokeStyle = '#14563F'; g.lineWidth = 2.5;
  P.forEach(poly => { g.beginPath(); poly.forEach(r => r.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.fill('evenodd'); g.stroke(); });
  g.fillStyle = '#333'; g.font = '16px Arial'; g.fillText(`${y1.toFixed(4)}°, ${x0.toFixed(4)}°`, 12, 22); g.textAlign = 'right'; g.fillText(`${y0.toFixed(4)}°, ${x1.toFixed(4)}°`, 888, 548);
  const km = (x1 - x0) * 111.32 * kx, nice = [0.5, 1, 2, 5, 10, 20, 50, 100].find(v => v >= km / 5) || 100, px = nice / 111.32 * s;
  g.textAlign = 'left'; g.fillStyle = '#333'; g.fillRect(20, 530, px, 5); g.fillText(`${nice} km`, 26 + px, 538); g.font = 'bold 22px Arial'; g.fillText('U ↑', 860 - 30, 50);
  return c;
}
function barCanvas(title, labels, vals, color, unit) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1200, 420);
  const L = 80, T = 50, W = 1090, H = 300, mx = Math.max(1e-9, ...vals), bw = W / vals.length;
  g.fillStyle = '#1d2a22'; g.font = 'bold 22px Arial'; g.fillText(title, 16, 30); g.font = '15px Arial';
  for (let i = 0; i <= 4; i++) { const y = T + H * (1 - i / 4); g.strokeStyle = '#e3e8e4'; g.beginPath(); g.moveTo(L, y); g.lineTo(L + W, y); g.stroke(); g.fillStyle = '#6b766f'; g.textAlign = 'right'; g.fillText(fmt1(mx * i / 4), L - 8, y + 5); }
  vals.forEach((v, i) => { const h = H * v / mx; g.fillStyle = color; g.fillRect(L + i * bw + bw * .12, T + H - h, bw * .76, h); g.fillStyle = '#6b766f'; g.textAlign = 'center'; if (vals.length <= 26) g.fillText(labels[i], L + i * bw + bw / 2, T + H + 20); });
  g.textAlign = 'left'; g.fillText(unit, L, T + H + 50); return c;
}
async function pdfHasil(R) {
  await loadJS('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
  if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable)) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'; s.onload = ok; s.onerror = () => no(new Error('Pustaka PDF gagal dimuat')); document.head.appendChild(s); });
  const { jsPDF } = window.jspdf, doc = window.FHLang ? FHLang.pdf(new jsPDF({ unit: 'mm', format: 'a4' })) : new jsPDF({ unit: 'mm', format: 'a4' }), ML = 16, CW = 178, HEAD = [20, 86, 63]; let y = 0, sec = 0;
  const need = h => { if (y + h > 282) { doc.addPage(); y = 20; } };
  const H1 = t => { need(18); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...HEAD); doc.text(asc(`${++sec}. ${t}`), ML, y); y += 7; };
  const P = (t, sz = 9.3, col = [40, 52, 45]) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(sz); doc.setTextColor(...col); doc.splitTextToSize(asc(t), CW).forEach(l => { need(5); doc.text(l, ML, y); y += sz * .45; }); y += 1.5; };
  const TAB = (rows, fs = 8) => { doc.autoTable({ startY: y, head: [rows[0].map(asc)], body: rows.slice(1).map(r => r.map(asc)), margin: { left: ML, right: ML, top: 18 }, styles: { fontSize: fs, cellPadding: 1.2 }, headStyles: { fillColor: HEAD }, alternateRowStyles: { fillColor: [241, 245, 242] } }); y = doc.lastAutoTable.finalY + 5; };
  const IMG = (c, w) => { const h = w * c.height / c.width; need(h + 3); doc.addImage(c.toDataURL('image/jpeg', .9), 'JPEG', ML + (CW - w) / 2, y, w, h); y += h + 4; };
  const K = R.kelas, kn = k => (K.find(x => x.kode === k) || {}).nama || k, Yr = R.tahun_tutupan.map(String), C = R.karbon, Hh = R.hutan, T = R.titik_panas;
  doc.setFillColor(...HEAD); doc.rect(0, 0, 210, 58, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Yayasan PRCF Indonesia - Fire Hotspot', ML, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('LAPORAN ANALISIS LAHAN, HUTAN, KARBON & TITIK PANAS', ML, 24);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.splitTextToSize(asc(R.nama), CW).slice(0, 2).forEach((l, i) => doc.text(l, ML, 35 + i * 8));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(asc(`${R.jenis || ''} | ${fmt1(R.luas_ha)} ha | dihitung ${String(R.dibuat_utc || '').slice(0, 10)} | dicetak ${new Date().toLocaleDateString('id-ID')}`), ML, 52);
  y = 66; IMG(petaCanvas(R), 120);
  const ck = cekKonsistensi(R), bad = ck.filter(c => c[2] !== 'Sesuai').length;
  H1('Ringkasan'); TAB([['Indikator', 'Nilai'], ['Luas area', fmt1(R.luas_ha) + ' ha'], ['Hutan tahun 2000 (tajuk >= 30%)', fmt1(Hh.hutan_2000_ha) + ' ha'], ['Kehilangan tutupan pohon 2001-2025', `${fmt1(Hh.kehilangan_total_ha)} ha (${fmt1(Hh.persen_hilang)}%)`],
    ['Tutupan pohon 2020 (GLAD)', fmt1((R.tutupan_lahan_ha['2020'].pohon || 0) + (R.tutupan_lahan_ha['2020'].basah_pohon || 0)) + ' ha'], ['Emisi bruto rata-rata', fmtI(C.emisi_bruto_per_tahun_tCO2e) + ' tCO2e/tahun'], ['Serapan bruto rata-rata', fmtI(C.serapan_bruto_per_tahun_tCO2) + ' tCO2/tahun'],
    ['Fluks bersih rata-rata', `${fmtI(C.fluks_bersih_per_tahun_tCO2e)} tCO2e/tahun (${C.fluks_bersih_total_tCO2e < 0 ? 'penyerap karbon bersih' : 'sumber emisi bersih'})`], ['Stok karbon total tahun 2000', fmtI(C.stok_karbon_total_2000_tC) + ' tC'], ...(T ? [[`Titik panas ${T.periode}`, fmtI(T.total) + ' deteksi']] : []),
    ['Verifikasi otomatis', `${ck.length - bad} dari ${ck.length} pemeriksaan sesuai`]]);
  H1('Tutupan & penggunaan lahan 2000-2020'); P(R.sumber.tutupan_lahan, 8.3, [90, 100, 95]);
  const used = K.filter(k => Yr.some(yy => (R.tutupan_lahan_ha[yy][k.kode] || 0) >= 0.05));
  TAB([['Kelas', ...Yr, 'Perubahan'], ...used.map(k => [k.nama, ...Yr.map(yy => fmt1(R.tutupan_lahan_ha[yy][k.kode] || 0)), (v => (v >= 0 ? '+' : '') + fmt1(v))((R.tutupan_lahan_ha['2020'][k.kode] || 0) - (R.tutupan_lahan_ha['2000'][k.kode] || 0))])], 7.6);
  const tr = Object.entries(R.perubahan_2000_2020_ha || {}).slice(0, 10); if (tr.length) TAB([['Perubahan 2000 -> 2020', 'Luas (ha)'], ...tr.map(([k, v]) => { const [a, b] = k.split('>'); return [`${kn(a)} -> ${kn(b)}`, fmt1(v)]; })]);
  H1('Perubahan hutan 2001-2025'); P(R.sumber.kehilangan_pohon, 8.3, [90, 100, 95]);
  const ys = Object.keys(Hh.kehilangan_per_tahun_ha); IMG(barCanvas('Kehilangan tutupan pohon per tahun (ha)', ys.map(v => v.slice(2)), ys.map(v => Hh.kehilangan_per_tahun_ha[v]), '#D9480F', 'ha'), CW);
  TAB([['Tahun', 'Kehilangan (ha)', 'Emisi bruto (tCO2e)'], ...ys.map(v => [v, fmt1(Hh.kehilangan_per_tahun_ha[v]), fmtI(C.emisi_per_tahun_kehilangan_tCO2e[v])]), ['Jumlah', fmt1(Hh.kehilangan_total_ha), fmtI(Object.values(C.emisi_per_tahun_kehilangan_tCO2e).reduce((p, c) => p + c, 0))]], 7.6);
  H1('Karbon hutan & gas rumah kaca'); P(`${R.sumber.fluks_karbon}. ${R.sumber.stok_karbon}. Fluks bersih = emisi bruto - serapan bruto (negatif = penyerap). Nilai per tahun = total 25 tahun / 25. Hasil model global dengan ketidakpastian; bukan pengganti MRV/inventarisasi karbon lapangan.`, 8.3, [90, 100, 95]);
  TAB([['Indikator', 'Total 2001-2025', 'Per tahun'], ['Emisi bruto (tCO2e)', fmtI(C.emisi_bruto_total_tCO2e), fmtI(C.emisi_bruto_per_tahun_tCO2e)], ['Serapan bruto (tCO2)', fmtI(C.serapan_bruto_total_tCO2), fmtI(C.serapan_bruto_per_tahun_tCO2)], ['Fluks bersih (tCO2e)', fmtI(C.fluks_bersih_total_tCO2e), fmtI(C.fluks_bersih_per_tahun_tCO2e)]]);
  TAB([['Stok karbon tahun 2000', 'Nilai'], ['Karbon di atas tanah (tC)', fmtI(C.stok_karbon_atas_tanah_2000_tC)], ['Karbon total, semua pool (tC)', fmtI(C.stok_karbon_total_2000_tC)], ['Rerata karbon total hutan (tC/ha)', fmt1(C.rerata_karbon_total_hutan_2000_tC_ha)], ['Rerata karbon atas tanah hutan (tC/ha)', fmt1(C.rerata_karbon_atas_tanah_hutan_2000_tC_ha)]]);
  if (T) { H1(`Titik panas ${T.periode}`); P(`${T.catatan} Sumber: ${R.sumber.titik_panas}.`, 8.3, [90, 100, 95]); const ty = Object.keys(T.per_tahun), S = Object.keys(T.per_tahun[ty[0]]);
    TAB([['Tahun', ...S, 'Jumlah'], ...ty.map(v => [v, ...S.map(s => fmtI(T.per_tahun[v][s])), fmtI(S.reduce((p, s) => p + T.per_tahun[v][s], 0))])], 7.8);
    if (T.terbaru.length) TAB([['Tanggal (UTC)', 'Jam', 'Satelit', 'Lat', 'Lon', 'Keyakinan', 'FRP (MW)'], ...T.terbaru.slice(0, 25).map(r => [r[0], String(r[1]).padStart(4, '0'), r[2], r[3], r[4], r[5], fmt1(r[6])])], 7.4); }
  if (R.wilayah && R.wilayah.length) { H1('Wilayah administrasi tercakup'); TAB([['Desa/Kelurahan', 'Kecamatan', 'Kab/Kota', 'Provinsi', '% desa'], ...R.wilayah.slice(0, 40).map(w => [w.desa, w.kec, w.kab, w.prov, fmt1(w.persen_desa_tercakup)])], 7.6); }
  H1('Verifikasi data'); TAB([['Pemeriksaan', 'Hasil', 'Status'], ...ck], 8);
  H1('Sumber data & metode'); Object.values(R.sumber).forEach(s => P('- ' + s, 8.6)); P('Metode: raster dibaca pada grid asli 0,00025 derajat (~30 m) tanpa resampling; piksel dihitung bila pusatnya di dalam batas; luas piksel geodesik. Analisis area dampingan dan SHP unggahan memakai kode yang sama: scripts/analisis_inti.py (github.com/erikprcfi/hotspot-fire-prcf).', 8.6);
  const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(asc(`Fire Hotspot - Yayasan PRCF Indonesia | ${R.nama} | Halaman ${i}/${n}`), ML, 292); }
  doc.save(`${EN() ? 'analysis' : 'analisis'}_${(R.nama || 'area').replace(/\W+/g, '_')}.pdf`); return n;
}
/* ---------------- sesi website (masuk dengan email terverifikasi) ---------------- */
const WS = { get() { try { return JSON.parse(localStorage.getItem('fh_web_akun')); } catch (e) { return null; } }, set(v) { try { v ? localStorage.setItem('fh_web_akun', JSON.stringify(v)) : localStorage.removeItem('fh_web_akun'); } catch (e) { } } };
function webLogin(box, done) {
  const wid = crypto.randomUUID();
  box.innerHTML = `<div class="fan-card"><h3>Masuk untuk mengunggah SHP</h3><p class="mut">Gunakan email akun aplikasi HP Fire Hotspot yang sudah terverifikasi. Kode 6 angka akan dikirim ke email Anda.</p>
    <input class="fan-in" type="email" placeholder="email@contoh.com" data-em style="margin-top:10px"><button class="fan-btn" data-k style="margin-top:10px">Kirim kode</button>
    <div data-s2 hidden style="margin-top:10px"><input class="fan-in" inputmode="numeric" maxlength="6" placeholder="Kode 6 angka" data-kd><button class="fan-btn" data-v style="margin-top:10px">Masuk</button></div><p class="fan-err" data-er></p></div>`;
  const $ = s => box.querySelector(s), er = t => $('[data-er]').textContent = t || '';
  $('[data-k]').onclick = async () => { const em = $('[data-em]').value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(em)) return er('Format email belum benar.'); er(''); $('[data-k]').disabled = true;
    try { const j = await api({ aksi: 'kode', email: em, id: wid }); if (!j.ok) { er(j.galat); $('[data-k]').disabled = false; return; } $('[data-s2]').hidden = false; $('[data-k]').textContent = 'Kode terkirim – cek email (juga Spam)'; } catch (e) { er('Gagal mengirim kode. Periksa internet.'); $('[data-k]').disabled = false; } };
  $('[data-v]').onclick = async () => { const em = $('[data-em]').value.trim().toLowerCase(), kd = $('[data-kd]').value.replace(/\D/g, ''); if (kd.length !== 6) return er('Masukkan 6 angka.');
    try { const c = await api({ aksi: 'cek', email: em, id: wid, kode: kd }); if (!c.ok) return er(c.galat);
      const m = await api({ aksi: 'masuk_web', wid, email: em, token: c.token }); if (!m.ok) return er(m.galat);
      WS.set({ id: m.id, token: m.token, nama: m.nama, email: m.email }); done(); } catch (e) { er('Gagal. Periksa internet.'); } };
}

function mount(el, o = {}) {
  const base = o.base || '';
  const akun = () => o.mode === 'web' ? WS.get() : (o.akun ? o.akun() : null);
  el.innerHTML = `<div class="fan"><div class="fan-hero"><h2>Analisis lahan, hutan & karbon</h2><p>Analisis area dengan data resmi University of Maryland (Hansen/GLAD) &amp; Harris dkk.: tutupan lahan 2000–2020, perubahan hutan 2001–2025, emisi & serapan karbon, stok karbon, titik panas. Data resmi, dihitung dari raster aslinya.</p></div>
    <div class="fan-card"><h3>Area dampingan PRCF</h3><div class="fan-list" data-pr><p class="mut">Memuat…</p></div></div>
    <div class="fan-card"><h3>Unggah SHP area Anda</h3><p class="mut">Format <b>.zip</b> berisi .shp, .shx, .dbf dan .prj (WGS 1984 atau UTM), tipe poligon, luas maks. 250.000 ha, di Indonesia. Hanya untuk pengguna dengan email terverifikasi; setiap unggahan tercatat atas nama Anda.</p><div data-up style="margin-top:10px"></div></div>
    <div class="fan-card"><h3>Analisis saya</h3><div class="fan-list" data-my><p class="mut">Masuk untuk melihat.</p></div></div>
    <div data-vw hidden></div></div>`;
  const $ = s => el.querySelector(s), main = el.querySelector('.fan');
  const open = R => { const v = $('[data-vw]'); [...main.children].forEach(c => { if (c !== v) c.hidden = true; }); v.hidden = false; viewer(v, R, () => { v.hidden = true; v.innerHTML = ''; [...main.children].forEach(c => { if (c !== v) c.hidden = false; }); el.scrollIntoView({ block: 'start' }); }); el.scrollIntoView({ block: 'start' }); };
  fetch(base + 'data/analisis/indeks.json', { cache: 'no-cache' }).then(r => r.json()).then(J => {
    $('[data-pr]').innerHTML = J.area.map(a => `<button data-id="${esc(a.id)}"><span><b>${esc(a.nama)}</b><small>${N(a.luas_ha, 1)} ha</small></span><span>›</span></button>`).join('');
    $('[data-pr]').querySelectorAll('button').forEach(b => b.onclick = async () => { b.disabled = true; try { open(await (await fetch(base + `data/analisis/${b.dataset.id}.json`)).json()); } catch (e) { alert('Gagal memuat (perlu internet).'); } b.disabled = false; });
  }).catch(() => { $('[data-pr]').innerHTML = '<p class="mut">Gagal memuat daftar (perlu internet).</p>'; });
  async function myList() {
    const a = akun(), box = $('[data-my]'); if (!a || !a.token) { box.innerHTML = '<p class="mut">Masuk dengan akun terverifikasi untuk melihat analisis Anda.</p>'; return; }
    box.innerHTML = '<p class="mut">Memuat…</p>';
    try { const j = await api({ aksi: 'analisis_daftar', id: a.id, token: a.token }); if (!j.ok) { box.innerHTML = `<p class="fan-err">${esc(j.galat)}</p>`; return; }
      box.innerHTML = j.daftar.length ? j.daftar.map(x => { const c = ST[x.status] || ST.Menunggu; return `<button data-aid="${esc(x.aid)}" ${x.status !== 'Selesai' ? 'data-wait="1"' : ''}><span><b>${esc(x.nama)}</b><small>${N(x.luas_ha, 1)} ha · ${esc(String(x.diterima).slice(0, 10))}${x.catatan ? ' · ' + esc(x.catatan) : ''}</small></span><span class="fan-st" style="background:${c[0]};color:${c[1]}">${esc(x.status)}</span></button>`; }).join('') + '<p class="mut">Analisis biasanya selesai 5–20 menit setelah dikirim; email pemberitahuan dikirim saat selesai.</p>' : '<p class="mut">Belum ada analisis.</p>';
      box.querySelectorAll('button').forEach(b => b.onclick = async () => { if (b.dataset.wait) return myList(); b.disabled = true; try { const r = await api({ aksi: 'analisis_hasil', id: a.id, token: a.token, aid: b.dataset.aid }); if (r.ok && r.hasil) open(r.hasil); else alert(r.galat || ('Status: ' + r.status)); } catch (e) { alert('Gagal memuat hasil.'); } b.disabled = false; });
      if (j.daftar.some(x => x.status === 'Menunggu' || x.status === 'Diproses')) setTimeout(() => { if (document.body.contains(box)) myList(); }, 60000);
    } catch (e) { box.innerHTML = '<p class="fan-err">Gagal memuat (perlu internet).</p>'; }
  }
  function upload() {
    const box = $('[data-up]'), a = akun();
    if (!a || !a.token) { if (o.mode === 'web') return webLogin(box, () => { upload(); myList(); }); box.innerHTML = '<p class="fan-err">Masuk/daftar dengan akun terverifikasi di aplikasi untuk mengunggah.</p>'; return; }
    box.innerHTML = `<p class="mut" style="margin:0 0 8px">Masuk sebagai <b>${esc(a.nama || '')}</b>${o.mode === 'web' ? ' · <a href="#" data-out>keluar</a>' : ''}</p>
      <label class="fan-drop"><input type="file" accept=".zip,application/zip" hidden><b>Pilih berkas SHP (.zip)</b>atau seret ke sini</label><div data-pv></div>`;
    const out = box.querySelector('[data-out]'); if (out) out.onclick = e => { e.preventDefault(); WS.set(null); upload(); myList(); };
    const inp = box.querySelector('input'), drop = box.querySelector('.fan-drop'), pv = box.querySelector('[data-pv]');
    drop.ondragover = e => e.preventDefault(); drop.ondrop = e => { e.preventDefault(); if (e.dataTransfer.files[0]) go(e.dataTransfer.files[0]); };
    inp.onchange = () => inp.files[0] && go(inp.files[0]);
    async function go(file) {
      pv.innerHTML = '<p class="mut">Membaca & memeriksa SHP…</p>';
      let S; try { S = await bacaZip(file); } catch (e) { pv.innerHTML = `<p class="fan-err">${esc(e.message)}</p>`; return; }
      pv.innerHTML = `<div class="fan-map" style="height:220px;margin-top:10px" data-m></div>
        <div class="fan-kpi" style="margin-top:10px"><div><b>${N(S.ha, 1)} ha</b><span>perkiraan luas (dihitung pasti di server)</span></div><div><b>${S.nRec}</b><span>fitur poligon</span></div><div><b style="font-size:13px">${esc(S.prj)}</b><span>sistem koordinat</span></div></div>
        <input class="fan-in" data-nm maxlength="100" value="${esc(S.nama)}" style="margin-top:10px" aria-label="Nama area">
        <label class="fan-chk" style="margin-top:10px"><input type="checkbox" data-ok><span>Saya menyatakan batas area ini sah untuk saya gunakan, dan setuju berkas serta hasil analisisnya disimpan oleh Yayasan PRCF Indonesia atas nama akun saya.</span></label>
        <button class="fan-btn" data-send style="margin-top:10px">Kirim untuk dianalisis</button><p data-msg class="mut"></p>`;
      if (window.L) { const m = L.map(pv.querySelector('[data-m]'), { scrollWheelZoom: false }); L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg', { maxNativeZoom: 14, maxZoom: 17, attribution: 'Sentinel-2 cloudless 2025 · EOX' }).addTo(m); const g = L.geoJSON(S.geojson, { style: { color: '#FFD84D', weight: 2 } }).addTo(m); m.fitBounds(g.getBounds(), { padding: [12, 12] }); }
      pv.querySelector('[data-send]').onclick = async e => {
        const b = e.currentTarget, msg = pv.querySelector('[data-msg]'); if (!pv.querySelector('[data-ok]').checked) { msg.innerHTML = '<span class="fan-err">Centang pernyataan terlebih dahulu.</span>'; return; }
        b.disabled = true; b.textContent = 'Mengirim…';
        try { const zip = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
          const j = await api({ aksi: 'analisis_kirim', id: a.id, token: a.token, nama_area: pv.querySelector('[data-nm]').value.trim() || S.nama, nama_file: file.name, luas_ha: S.ha, geojson: JSON.stringify(S.geojson), zip }, 120000);
          if (!j.ok) { msg.innerHTML = `<span class="fan-err">${esc(j.galat)}</span>`; b.disabled = false; b.textContent = 'Kirim untuk dianalisis'; return; }
          pv.innerHTML = '<p style="color:#1E7A3B;font-weight:700">✓ Terkirim. Analisis berjalan otomatis (± 5–20 menit). Hasil muncul di "Analisis saya" dan pemberitahuan dikirim ke email Anda.</p>'; myList();
        } catch (x) { msg.innerHTML = '<span class="fan-err">Gagal mengirim. Periksa internet lalu coba lagi.</span>'; b.disabled = false; b.textContent = 'Kirim untuk dianalisis'; }
      };
    }
  }
  upload(); myList();
}
window.FHAnalisis = { mount, viewer, bacaZip, pdfHasil, cekKonsistensi };
})();
