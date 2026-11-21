// Menyusun isi aplikasi Android (folder www) dari kode situs: semua tampilan, kode, pustaka dan huruf dibundel
// di dalam APK (tanpa CDN), ditambah salinan data bawaan agar aplikasi langsung berisi walau dibuka pertama kali tanpa sinyal.
// Pemakaian: node siapkan-www.mjs [--zip keluaran.zip]   (versi = waktu commit terakhir kode, format YYYYMMDDHHmm)
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(DIR, '..'), WWW = path.join(DIR, 'www'), NM = path.join(DIR, 'node_modules');
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };
const cpDir = (a, b, saring = () => true) => { for (const e of fs.readdirSync(a, { withFileTypes: true })) { const s = path.join(a, e.name), d = path.join(b, e.name); if (!saring(s)) continue; e.isDirectory() ? cpDir(s, d, saring) : cp(s, d); } };

fs.rmSync(WWW, { recursive: true, force: true }); fs.mkdirSync(WWW, { recursive: true });

// 1. halaman & kode
cp(path.join(ROOT, 'app.html'), path.join(WWW, 'index.html'));
for (const f of ['kebijakan-privasi.html', 'syarat.html', 'hapus-akun.html']) if (fs.existsSync(path.join(ROOT, f))) cp(path.join(ROOT, f), path.join(WWW, f));
cpDir(path.join(ROOT, 'assets'), path.join(WWW, 'assets'), s => !/\.(md|txt|psd|xcf)$/i.test(s));

// 2. pustaka & huruf lokal (pengganti CDN)
const V = path.join(WWW, 'vendor');
const PUSTAKA = {
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js': ['leaflet/dist/leaflet.js', 'leaflet/leaflet.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css': ['leaflet/dist/leaflet.css', 'leaflet/leaflet.css'],
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js': ['exceljs/dist/exceljs.min.js', 'exceljs.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': ['jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js': ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf.plugin.autotable.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js': ['jszip/dist/jszip.min.js', 'jszip.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js': ['proj4/dist/proj4.js', 'proj4.js'],
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js': ['maplibre-gl/dist/maplibre-gl.js', 'maplibre-gl.js'],
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css': ['maplibre-gl/dist/maplibre-gl.css', 'maplibre-gl.css'],
  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js': ['docx/build/index.umd.js', 'docx.umd.js'],
};
for (const [, [src, dst]] of Object.entries(PUSTAKA)) cp(path.join(NM, src), path.join(V, dst));
cpDir(path.join(NM, 'leaflet/dist/images'), path.join(V, 'leaflet/images'));
// huruf: Plus Jakarta Sans 400–800 & IBM Plex Mono 400–500 (subset latin + latin-ext)
let css = '';
for (const [pk, fam, berat] of [['plus-jakarta-sans', 'Plus Jakarta Sans', [400, 500, 600, 700, 800]], ['ibm-plex-mono', 'IBM Plex Mono', [400, 500]]])
  for (const w of berat) for (const sub of ['latin-ext', 'latin']) {
    const f = `${pk}-${sub}-${w}-normal.woff2`, s = path.join(NM, '@fontsource', pk, 'files', f); if (!fs.existsSync(s)) continue;
    cp(s, path.join(V, 'fonts', f));
    const range = sub === 'latin' ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
      : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
    css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${f}) format('woff2');unicode-range:${range}}\n`;
  }
fs.writeFileSync(path.join(V, 'fonts.css'), css);

// 3. tulis ulang rujukan CDN → lokal (hanya di salinan aplikasi; situs tidak berubah)
const ganti = (s, rel) => {
  for (const [u, [, dst]] of Object.entries(PUSTAKA)) s = s.split(u).join(rel + 'vendor/' + dst);
  s = s.replace(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g, `<link rel="stylesheet" href="${rel}vendor/fonts.css">`).replace(/<link rel="preconnect"[^>]*>\s*/g, '');
  return s;
};
const tulisUlang = f => { const rel = path.relative(path.dirname(f), WWW).split(path.sep).join('/'); const r = rel ? rel + '/' : ''; const a = fs.readFileSync(f, 'utf8'); const b = ganti(a, f.endsWith('.js') ? '' : r); if (a !== b) fs.writeFileSync(f, b); };
// .js memuat pustaka relatif terhadap halaman (index.html di akar), bukan terhadap berkas .js
const semua = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'vendor' ? [] : semua(path.join(d, e.name))) : [path.join(d, e.name)]);
for (const f of semua(WWW)) if (/\.(html|js|css)$/.test(f)) tulisUlang(f);
// aplikasi: tanpa manifest PWA / service worker / pemasangan dari peramban
let idx = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
idx = idx.replace(/<link rel="manifest"[^>]*>\s*/, '').replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '');
fs.writeFileSync(path.join(WWW, 'index.html'), idx);
const sisa = semua(WWW).filter(f => /\.(html|js|css)$/.test(f)).flatMap(f => (fs.readFileSync(f, 'utf8').match(/https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com)[^'"` )]*/g) || []).map(u => path.relative(WWW, f) + ' → ' + u));
if (sisa.length) { console.error('Masih ada rujukan CDN:\n' + sisa.join('\n')); process.exit(1); }

// 4. salinan data bawaan (dipakai bila belum pernah tersambung ke server)
const DATA = ['geo.json', 'hotspots.json', 'status.json', 'prakiraan.json', 'cuaca.json', 'tle.json', 'stats.json', 'kejadian.json',
  'wilayah/indeks.json', 'bekas_terbakar/indeks.json', 'hutan/kehilangan.json', 'titik_id/indeks.json', 'smart/nangalauk_dm.json', 'bara/kb.json'];
let kb = 0;
for (const f of DATA) { const s = path.join(ROOT, 'data', f); if (fs.existsSync(s)) { cp(s, path.join(WWW, 'data', f)); kb += fs.statSync(s).size / 1024; } }

// 5. versi
let versi; try { versi = execSync('git log -1 --format=%cd --date=format:%Y%m%d%H%M -- app.html assets aplikasi-android/siapkan-www.mjs', { cwd: ROOT }).toString().trim(); } catch (e) { }
if (!versi) { const d = new Date(); versi = d.toISOString().replace(/\D/g, '').slice(0, 12); }
fs.writeFileSync(path.join(WWW, 'versi.json'), JSON.stringify({ versi, dibuat: new Date().toISOString() }));
const ukuran = d => semua(d).reduce((a, f) => a + fs.statSync(f).size, 0);
console.log(`www siap · versi ${versi} · ${(ukuran(WWW) / 1048576).toFixed(1)} MB (data bawaan ${(kb / 1024).toFixed(1)} MB)`);

// 6. paket pembaruan (zip) bila diminta
const zi = process.argv.indexOf('--zip');
if (zi > 0) { const out = path.resolve(process.argv[zi + 1]); fs.rmSync(out, { force: true }); execSync(`cd "${WWW}" && zip -qr -9 "${out}" . -x "data/*"`); /* paket pembaruan tanpa data bawaan: data diambil dari server/salinan HP */ console.log('paket:', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB'); }
