/* Bara Api – asisten AI aplikasi Fire Hotspot (Yayasan PRCF Indonesia)
 * Jawaban peraturan berpijak pada basis pengetahuan resmi (data/bara/kb.json: teks peraturan dari situs pemerintah, per pasal).
 * Alur: perangkat mencari pasal paling relevan (BM25) → mengirim NOMOR potongan + pertanyaan ke server PRCF (Apps Script, akun
 * terverifikasi saja) → server mengambil teks pasal dari basis pengetahuan (tidak bisa dipalsukan perangkat), memanggil Google Gemini,
 * dan mengembalikan jawaban + rujukan pasal. Riwayat obrolan disimpan di HP ini.
 * Pemakaian: FHBara.mount(el, { akun: () => ({id, token, nama}) | null, konteks: () => 'teks data aplikasi' })
 */
(function () {
'use strict';
const URL_ = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec', KUNCI = 'fh-prcf-2026-akun';
const BASE = (document.currentScript && document.currentScript.src ? new URL('../', document.currentScript.src).href : './');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STOP = new Set('yang dan di ke dari untuk dengan pada adalah ini itu atau dalam oleh sebagai juga tidak akan dapat bisa apa apakah bagaimana berapa siapa kapan dimana mana saja tentang terkait serta para kami kita saya anda mohon tolong jelaskan sebutkan the of and to in is what how a an for are'.split(' '));
const SIN = { hd: 'hutan desa', hkm: 'hutan kemasyarakatan', htr: 'hutan tanaman rakyat', lphd: 'lembaga pengelola hutan desa', ps: 'perhutanan sosial', karhutla: 'kebakaran hutan lahan', kph: 'kesatuan pengelolaan hutan', rkps: 'rencana kelola perhutanan sosial', rkt: 'rencana kerja tahunan', kulin: 'kemitraan kehutanan', hhbk: 'hasil hutan bukan kayu', sk: 'keputusan persetujuan', izin: 'persetujuan', fire: 'kebakaran', forest: 'hutan', social: 'sosial', village: 'desa', permit: 'persetujuan', burning: 'pembakaran', community: 'masyarakat' };
const stem = w => { if (w.length < 6 || /\d/.test(w)) return w; w = w.replace(/(nya|lah|kah)$/, ''); w = w.replace(/(kan|an|i)$/, m => w.length - m.length >= 4 ? '' : m);
  return w.replace(/^(meng|meny|mem|men|me|peng|peny|per|pem|pen|pe|ber|be|di|ke|ter|se)(?=[a-z]{3})/, ''); };
const tok = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).map(stem);
let KB = null, IDX = null;
async function loadKB() {
  if (KB) return KB;
  const j = await (await fetch(BASE + 'data/bara/kb.json', { cache: 'no-cache' })).json();
  const docs = j.potongan.map(c => tok(c.judul + ' ' + c.pasal + ' ' + c.teks)), df = {}, N = docs.length; let avg = 0;
  docs.forEach(d => { avg += d.length; new Set(d).forEach(w => df[w] = (df[w] || 0) + 1); }); avg /= N;
  IDX = { docs: docs.map(d => { const tf = {}; d.forEach(w => tf[w] = (tf[w] || 0) + 1); return { tf, len: d.length }; }), df, N, avg };
  return (KB = j);
}
function cari(q, k = 8) {
  const qs = []; tok(q).forEach(w => { qs.push(w); if (SIN[w]) qs.push(...tok(SIN[w])); });
  const { docs, df, N, avg } = IDX, k1 = 1.4, b = .75, sc = [];
  docs.forEach((d, i) => { let s = 0; for (const w of new Set(qs)) { const f = d.tf[w]; if (!f) continue; const idf = Math.log(1 + (N - df[w] + .5) / (df[w] + .5)); s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.len / avg)); } if (s > 0) sc.push([s, i]); });
  sc.sort((a, c) => c[0] - a[0]); return sc.slice(0, k).map(x => x[1]);
}
const H = { get() { try { return JSON.parse(localStorage.getItem('fh_bara')) || []; } catch (e) { return []; } }, set(v) { try { localStorage.setItem('fh_bara', JSON.stringify(v.slice(-40))); } catch (e) { } } };
function md(t) {   // markdown sederhana → HTML aman
  const L = esc(t).split('\n'); let html = '', inList = false;
  for (const l of L) { const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)/.exec(l);
    if (m) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${m[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    html += l.trim() ? `<p>${l}</p>` : ''; }
  if (inList) html += '</ul>';
  return html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/^#{1,3}\s*/gm, '').replace(/\[(\d{1,2})\]/g, '<sup class="bara-n">$1</sup>');
}
if (!document.getElementById('fhbara-css')) {
  const st = document.createElement('style'); st.id = 'fhbara-css';
  st.textContent = `.bara{display:flex;flex-direction:column;height:100%;min-height:calc(100vh - 140px);color:var(--fg,#111)}
  .bara-hd{display:flex;gap:12px;align-items:center;padding:14px;border-radius:20px;background:linear-gradient(135deg,#3A1404,#8E2A0E 55%,#E2621B);color:#fff}
  .bara-av{flex:none;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:rgba(255,255,255,.14)}
  .bara-hd b{display:block;font-size:18px}.bara-hd small{display:block;font-size:12px;opacity:.85;line-height:1.4}
  .bara-log{flex:1;display:flex;flex-direction:column;gap:10px;padding:14px 2px}
  .bara-m{max-width:88%;padding:10px 13px;border-radius:18px;font-size:14.5px;line-height:1.5;word-wrap:break-word}
  .bara-m p{margin:0 0 6px}.bara-m p:last-child{margin:0}.bara-m ul{margin:4px 0 6px;padding-left:18px}.bara-m li{margin:2px 0}
  .bara-u{align-self:flex-end;background:#14563F;color:#fff;border-bottom-right-radius:6px}
  .bara-a{align-self:flex-start;background:var(--surface,#fff);border:1px solid var(--line,#e3e8e4);border-bottom-left-radius:6px}
  .bara-src{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.bara-src a{font-size:11.5px;font-weight:700;padding:5px 9px;border-radius:999px;background:#FFF1E6;color:#9A3412;text-decoration:none}
  .bara-n{font-size:10px;font-weight:800;color:#9A3412;background:#FFF1E6;border-radius:6px;padding:0 4px;margin-left:1px}.bara-meta{font-size:10.5px;color:var(--muted,#6b766f);margin-top:6px}
  .bara-typing{align-self:flex-start;display:flex;gap:5px;padding:12px 14px;border-radius:18px;background:var(--surface,#fff);border:1px solid var(--line,#e3e8e4)}.bara-typing i{width:7px;height:7px;border-radius:50%;background:#E2621B;animation:bt 1.2s infinite}.bara-typing i:nth-child(2){animation-delay:.2s}.bara-typing i:nth-child(3){animation-delay:.4s}@keyframes bt{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
  .bara-sg{display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.bara-sg::-webkit-scrollbar{display:none}.bara-sg button{flex:none;max-width:260px;text-align:left;padding:9px 12px;border-radius:14px;border:1px solid var(--line,#dde3df);background:var(--surface,#fff);color:inherit;font:600 12.5px var(--f,system-ui);cursor:pointer;white-space:normal}
  .bara-in{position:sticky;bottom:0;display:flex;gap:8px;align-items:flex-end;padding:10px 0 calc(6px + env(safe-area-inset-bottom,0px));background:var(--bg,#f4f6f4)}
  .bara-in textarea{flex:1;min-height:46px;max-height:140px;resize:none;border-radius:16px;border:1.5px solid var(--line,#dde3df);padding:12px 14px;background:var(--surface,#fff);color:var(--fg,#111);font:500 14.5px var(--f,system-ui)}
  .bara-in button{flex:none;width:48px;height:48px;border-radius:16px;border:0;background:linear-gradient(135deg,#F2A93B,#E2621B);color:#fff;display:grid;place-items:center;cursor:pointer}.bara-in button:disabled{opacity:.5}
  .bara-note{font-size:11px;color:var(--muted,#6b766f);line-height:1.45;margin:8px 2px 0}.bara-x{margin-left:auto;background:rgba(255,255,255,.16);border:0;color:#fff;border-radius:10px;padding:7px 10px;font:700 11.5px var(--f,system-ui);cursor:pointer}`;
  document.head.appendChild(st);
}
const IKON = '<svg width="28" height="28" viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5c.7 3.7 3 5.6 5 7.8 1.9 2.1 3.2 4.5 3.2 7.3A8.2 8.2 0 0 1 12 24.8a8.2 8.2 0 0 1-8.2-8.2c0-2.7 1.2-4.7 2.7-6.3.2 1.6 1 2.9 2.3 3.6-.4-4.2 1-8.5 3.2-12.4z" fill="#FFB547"/><path d="M12 13.4c.5 1.6 1.9 2.5 1.9 4.3a2.2 2.2 0 0 1-1.9 2.4 2.3 2.3 0 0 1-2.3-2.3c0-1.7 1.1-2.8 2.3-4.4z" fill="#FFF3C4"/></svg>';
const T = {
  id: { sub: 'Asisten AI Fire Hotspot · perhutanan sosial, regulasi, karhutla, status satwa (IUCN/CITES) · semua bahasa', baru: 'Obrolan baru', ph: 'Tanya Bara Api… (bahasa apa pun)', kirim: 'Kirim',
    note: d => `Jawaban soal peraturan diambil dari teks resmi yang diunduh dari situs pemerintah${d} dan disertai rujukan pasal; status satwa/tumbuhan dari IUCN Red List, CITES (Species+) & Permen LHK P.106/2018. AI tetap bisa keliru: periksa rujukannya dan konfirmasi ke instansi resmi untuk keputusan penting. Jangan menulis data pribadi: pesan diproses layanan Google Gemini dan dicatat oleh PRCF untuk menjaga mutu & keamanan (UU PDP 27/2022).`,
    upd: 'diperbarui', masuk: 'Masuk dengan akun terverifikasi untuk memakai Bara Api.', off: 'Bara Api perlu koneksi internet.', gagal: 'Gagal terhubung. Coba lagi.', sisa: n => ` · sisa ${n} pesan (per 6 jam)`,
    saran: ['Bagaimana kondisi titik panas & cuaca di Hutan Desa saya minggu ini?', 'Apa syarat mengajukan persetujuan Hutan Desa?', 'Apa kewajiban pemegang persetujuan Hutan Desa?', 'Bolehkah membuka lahan dengan cara membakar?', 'Apa status IUCN, CITES & perlindungan orangutan kalimantan dan rangkong gading?', 'Berapa emisi & serapan karbon Hutan Desa saya?'] },
  en: { sub: 'Fire Hotspot AI assistant · social forestry, regulations, forest fires, species status (IUCN/CITES) · any language', baru: 'New chat', ph: 'Ask Bara Api… (any language)', kirim: 'Send',
    note: d => `Answers on regulations are drawn from official texts downloaded from Indonesian government websites${d}, with article citations; species status comes from the IUCN Red List, CITES (Species+) and Ministerial Regulation P.106/2018. AI can still make mistakes: check the citations and confirm with the authorities before important decisions. Do not type personal data: messages are processed by Google Gemini and logged by PRCF for quality & safety (Indonesian PDP Law 27/2022).`,
    upd: 'updated', masuk: 'Sign in with a verified account to use Bara Api.', off: 'Bara Api needs an internet connection.', gagal: 'Connection failed. Please try again.', sisa: n => ` · ${n} messages left (per 6 h)`,
    saran: ['How are hotspots and weather around my Village Forest this week?', 'What are the requirements to apply for a Village Forest (Hutan Desa) permit?', 'What are the obligations of a Village Forest permit holder?', 'Is it allowed to clear land by burning?', 'What are the IUCN, CITES and Indonesian protection status of the Bornean orangutan and helmeted hornbill?', 'How much carbon does my Village Forest emit and absorb?'] } };
const lang = () => (window.FHLang && FHLang.get()) === 'en' ? 'en' : 'id';
const chip = x => lang() !== 'en' ? x : String(x).replace('Apendiks', 'Appendix').replace('tidak tercantum', 'not listed').replace('dilindungi', 'protected').replace(/^Pasal/, 'Article').replace(/^Lampiran/, 'Annex').replace(/^Penjelasan Pasal/, 'Elucidation of Article').replace('bagian', 'part');
const tr = x =>(window.FHLang && FHLang.t) ? FHLang.t(x) : x;
const nf = (x, d = 1) => x == null || isNaN(x) ? '-' : (+x).toLocaleString(lang() === 'en' ? 'en-GB' : 'id-ID', { maximumFractionDigits: d });
function sapaan(r) {   // sapaan otomatis dari data aplikasi (tanpa AI, tanpa kuota)
  const en = lang() === 'en', nm = r.nama ? ', <b>' + esc(r.nama) + '</b>' : '';
  const L = [];
  if (r.situs) L.push(en ? `<b>${esc(r.situs)}</b>: status <b>${esc(tr(r.status || '-'))}</b> — ${r.inside} hotspot(s) inside the village/Village Forest, ${r.r25} within 25 km (last 7 days).` : `<b>${esc(r.situs)}</b>: status <b>${esc(r.status || '-')}</b> — ${r.inside} titik di dalam desa/HD, ${r.r25} titik ≤25 km (7 hari).`);
  L.push(en ? `All of Kapuas Hulu: ${r.n7} hotspots in 7 days${r.last ? '; latest detection ' + esc(tr(r.last)) : ''} (NASA FIRMS).` : `Seluruh Kapuas Hulu: ${r.n7} titik panas dalam 7 hari${r.last ? '; deteksi terakhir ' + esc(r.last) : ''} (NASA FIRMS).`);
  if (r.cuaca) L.push(en ? `Weather today: ${esc(tr(r.cuaca))}, ${nf(r.tmin)}–${nf(r.tmaks)} °C, rain ${nf(r.hujan)} mm; fire danger this week: <b>${esc(tr(r.bahaya || '-'))}</b> (ECMWF · FDRS).` : `Cuaca hari ini: ${esc(r.cuaca)}, ${nf(r.tmin)}–${nf(r.tmaks)} °C, hujan ${nf(r.hujan)} mm; bahaya kebakaran sepekan: <b>${esc(r.bahaya || '-')}</b> (ECMWF · FDRS).`);
  if (r.pm25 != null) L.push(en ? `Air: PM2.5 ${nf(r.pm25)} µg/m³ (${esc(tr(r.udara || '-'))}, CAMS).` : `Udara: PM2.5 ${nf(r.pm25)} µg/m³ (${esc(r.udara || '-')}, CAMS).`);
  const hi = en ? ({ 'Selamat pagi': 'Good morning', 'Selamat siang': 'Good afternoon', 'Selamat sore': 'Good afternoon', 'Selamat malam': 'Good evening' }[r.sapa] || 'Hello') : (r.sapa || 'Halo');
  return `<div class="bara-m bara-a bara-hi"><p>${hi}${nm}! 🔥 ${en ? "I'm <b>Bara Api</b>, the Fire Hotspot AI assistant. Here's the situation right now:" : 'Saya <b>Bara Api</b>, asisten AI Fire Hotspot. Sekilas kondisi saat ini:'}</p><ul>${L.map(x => '<li>' + x + '</li>').join('')}</ul><p>${en ? 'Ask me about this data, social-forestry & forestry regulations (with article citations), wildlife/plant conservation status (IUCN, CITES, Indonesian protected species), or forest-fire prevention. Where shall we start?' : 'Tanyakan data ini, peraturan perhutanan sosial & kehutanan (dengan pasal), status konservasi satwa/tumbuhan (IUCN, CITES, dilindungi RI), atau pencegahan karhutla. Mau mulai dari mana?'}</p></div>`;
}
function mount(el, o = {}) {
  const X = T[lang()];
  el.innerHTML = `<div class="bara" data-notr><div class="bara-hd"><div class="bara-av">${IKON}</div><div style="min-width:0"><b>Bara Api</b><small>${X.sub}</small></div><button class="bara-x" data-clr>${X.baru}</button></div>
    <p class="bara-note" data-note>${X.note('')}</p>
    <div class="bara-log" data-log></div><div class="bara-sg" data-sg></div>
    <div class="bara-in"><textarea rows="1" placeholder="${X.ph}" aria-label="${X.ph}" maxlength="2000"></textarea><button data-send aria-label="${X.kirim}"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></div></div>`;
  const $ = s => el.querySelector(s), log = $('[data-log]'), ta = el.querySelector('textarea'), btn = $('[data-send]');
  let hist = H.get(), busy = false, DATA = null, hi = '';
  const draw = () => {
    log.innerHTML = (hi || `<div class="bara-typing"><i></i><i></i><i></i></div>`) +
      hist.map(m => m.r === 'u' ? `<div class="bara-m bara-u">${esc(m.t).replace(/\n/g, '<br>')}</div>` : `<div class="bara-m bara-a">${md(m.t)}${m.src && m.src.length ? `<div class="bara-src">${m.src.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.judul)}">${s.n ? '[' + s.n + '] ' : ''}${esc(s.singkat)} · ${esc(chip(s.pasal))}</a>`).join('')}</div>` : ''}${m.err ? '' : `<div class="bara-meta">${esc(m.w || '')}</div>`}</div>`).join('') + (busy ? '<div class="bara-typing"><i></i><i></i><i></i></div>' : '');
    $('[data-sg]').innerHTML = hist.length ? '' : X.saran.map(s => `<button>${esc(s)}</button>`).join('');
    $('[data-sg]').querySelectorAll('button').forEach(b => b.onclick = () => kirim(b.textContent));
    if (hist.length) requestAnimationFrame(() => { const sc = el.closest('.page') || document.getElementById('page') || document.scrollingElement; sc.scrollTop = sc.scrollHeight; });
  };
  const muatData = async () => { try { DATA = o.data ? await o.data() : null; } catch (e) { DATA = null; } return DATA; };
  async function kirim(t) {
    t = String(t || ta.value).trim(); if (!t || busy) return; ta.value = ''; ta.style.height = 'auto';
    const a = o.akun ? o.akun() : null;
    hist.push({ r: 'u', t }); busy = true; btn.disabled = true; draw();
    let ans;
    try {
      if (!a || !a.token) throw new Error(X.masuk);
      if (navigator.onLine === false) throw new Error(X.off);
      await loadKB(); await muatData(); const prev = hist.slice(-7, -1).map(m => m.r === 'u' ? m.t : '').join(' ');
      const ids = cari(t + ' ' + prev.slice(-300), 8);
      const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ kunci: KUNCI, aksi: 'bara', id: a.id, token: a.token, pesan: t, potongan: ids, versi: KB.dibuat_utc,
        riwayat: hist.slice(-9, -1).map(m => ({ r: m.r, t: m.t.slice(0, 1500) })), data_aplikasi: DATA ? String(DATA.teks).slice(0, 14000) : '', bahasa_app: lang(), bahasa: navigator.language || 'id' }) }).then(x => x.json());
      if (!r.ok) throw new Error(r.galat || X.gagal);
      ans = { r: 'a', t: r.jawaban, src: r.rujukan || [], w: `Gemini · ${new Date().toLocaleTimeString(lang() === 'en' ? 'en-GB' : 'id-ID', { hour: '2-digit', minute: '2-digit' })}${r.sisa != null ? X.sisa(r.sisa) : ''}` };
    } catch (e) { ans = { r: 'a', t: '⚠️ ' + (e.message || X.gagal), err: true }; }
    hist.push(ans); busy = false; btn.disabled = false; H.set(hist.filter(m => !m.err || m.r === 'u')); draw();
  }
  btn.onclick = () => kirim(); ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(); } };
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  $('[data-clr]').onclick = () => { hist = []; H.set(hist); draw(); };
  draw();
  muatData().then(d => { hi = sapaan(Object.assign({ n7: 0 }, d && d.ringkas, !d || !d.ringkas || !d.ringkas.nama ? { nama: o.akun && o.akun() && o.akun().nama ? o.akun().nama.split(' ')[0] : '' } : {})); draw(); });
  loadKB().then(k => { $('[data-note]').textContent = X.note(': ' + k.sumber.filter(x => !x.galat).map(x => x.judul.replace(/ tentang .*/, '').replace('Peraturan Menteri LHK', 'Permen LHK').replace('Peraturan Pemerintah', 'PP').replace('Peraturan Presiden', 'Perpres').replace('Undang-Undang', 'UU')).join(', ') + ' (' + X.upd + ' ' + k.dibuat_utc.slice(0, 10) + ')'); }).catch(() => { });
}
window.FHBara = { mount, cari, loadKB };
})();
