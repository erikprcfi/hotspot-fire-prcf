"""
Basis pengetahuan resmi untuk asisten AI "Bara Api" – Fire Hotspot PRCF
Mengunduh teks peraturan dari situs RESMI pemerintah, memecahnya per Pasal, dan menyimpan
data/bara/kb.json (dipakai untuk mencari pasal yang relevan sebelum AI menjawab, lalu dikutip).
Dijalankan GitHub Actions (.github/workflows/kb.yml). Setiap berkas dicatat URL, waktu unduh & SHA-256.
"""
import os, re, json, hashlib, subprocess, urllib.request, datetime, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bara"); os.makedirs(OUT, exist_ok=True)
DOCS = [  # kode, judul resmi, tautan resmi (cermin situs pemerintah, dicoba berurutan; halaman JDIH BPK dibaca untuk mencari tautan PDF-nya)
 ("UU-41-1999", "Undang-Undang Nomor 41 Tahun 1999 tentang Kehutanan",
  ["https://ksdae.kehutanan.go.id/assets/news/peraturan/2.UU_.41-1999_KEHUTANAN_.pdf",
   "https://bbtnlorelindu.ksdae.kehutanan.go.id/wp-content/uploads/2026/04/uu-41-1999-Kehutanan.pdf",
   "https://bdlhkkadipaten.bp2sdm.menlhk.go.id/wp-content/uploads/2022/05/UU-1999-41-Kehutanan.pdf",
   "https://peraturan.bpk.go.id/Details/45373",
   "https://jdih.kemenkeu.go.id/api/download/fulltext/1999/41TAHUN~1999UU.htm",
   "https://phl.menlhk.go.id/bphl/jambi/peraturan/UU_NO_41_1999.PDF"]),
 ("PP-23-2021", "Peraturan Pemerintah Nomor 23 Tahun 2021 tentang Penyelenggaraan Kehutanan",
  ["https://jdih.kemenkeu.go.id/download/4d22fb32-c066-4dec-bba9-7168981bf25f/23TAHUN2021PP.pdf", "https://peraturan.go.id/files/pp23-2021bt.pdf"]),
 ("PermenLHK-9-2021", "Peraturan Menteri LHK Nomor 9 Tahun 2021 tentang Pengelolaan Perhutanan Sosial",
  ["https://jdih.kemenkoinfra.go.id/id/peraturan-menteri-lingkungan-hidup-dan-kehutanan-no-9-tahun-2021",
   "https://phl.menlhk.go.id/bphl/jambi/peraturan/permenlhk-nomor-9-tahun-2021.pdf",
   "https://peraturan.bpk.go.id/Search?keywords=perhutanan+sosial&tentang=&nomor=9&tahun=2021"]),
 ("Perpres-28-2023", "Peraturan Presiden Nomor 28 Tahun 2023 tentang Perencanaan Terpadu Percepatan Pengelolaan Perhutanan Sosial",
  ["https://peraturan.bpk.go.id/Details/249826", "https://jdih.kemenkoinfra.go.id/perpres-no-28-tahun-2023", "https://peraturan.go.id/files/perpres-no-28-tahun-2023.pdf"]),
 ("PermenLHK-32-2016", "Peraturan Menteri LHK Nomor P.32/MENLHK/SETJEN/KUM.1/3/2016 tentang Pengendalian Kebakaran Hutan dan Lahan",
  ["https://peraturan.go.id/files/bn583-2016.pdf", "https://www.peraturan.go.id/files/bn583-2016.pdf",
   "https://jdih.kalteng.go.id/storage/app/uploads/public/67a/af5/c2a/67aaf5c2ae52e988327205.pdf"]),
 ("PermenLHK-106-2018", "Peraturan Menteri LHK Nomor P.106/MENLHK/SETJEN/KUM.1/12/2018 tentang Jenis Tumbuhan dan Satwa yang Dilindungi",
  ["https://jdih.kemenkoinfra.go.id/id/peraturan-menteri-lingkungan-hidup-dan-kehutanan-no-p106menlhksetjenkum1122018-tahun-2018",
   "https://jdih.kemenkoinfra.go.id/en/peraturan-menteri-lingkungan-hidup-dan-kehutanan-no-p106menlhksetjenkum1122018-tahun-2018"]),
 ("UU-32-2009", "Undang-Undang Nomor 32 Tahun 2009 tentang Perlindungan dan Pengelolaan Lingkungan Hidup",
  ["https://jdih.esdm.go.id/storage/document/UU%2032%20Tahun%202009%20(PPLH).pdf", "https://jdih.kemenkeu.go.id/api/download/fulltext/2009/32TAHUN2009UU.htm"]),
 ("PermenLHK-4-2023", "Peraturan Menteri LHK Nomor 4 Tahun 2023 tentang Pengelolaan Perhutanan Sosial pada Kawasan Hutan dengan Pengelolaan Khusus",
  ["https://peraturan.bpk.go.id/Details/253766", "https://jdih.kemenkoinfra.go.id/permen-lhk-no-4-tahun-2023",
   "https://sipops.dlhk.nttprov.go.id/file/regulation/Permen%20LHK%20No.4%20Tahun%202023.pdf"]),
]
CEK = {'UU-41-1999': 'NOMOR\\s+41\\s+TAHUN\\s+1999', 'PP-23-2021': 'NOMOR\\s+23\\s+TAHUN\\s+2021', 'PermenLHK-9-2021': 'NOMOR\\s+9\\s+TAHUN\\s+2021', 'Perpres-28-2023': 'NOMOR\\s+28\\s+TAHUN\\s+2023', 'PermenLHK-32-2016': 'P\\.?\\s*32\\s*/\\s*MENLHK', 'PermenLHK-4-2023': 'NOMOR\\s+4\\s+TAHUN\\s+2023', 'UU-32-2009': 'NOMOR\\s+32\\s+TAHUN\\s+2009', 'PermenLHK-106-2018': 'P\\.?\\s*106\\s*/\\s*MENLHK'}   # identitas wajib ada di awal naskah (mencegah PDF lain ikut terambil)
UA = {"User-Agent": "Mozilla/5.0 (FireHotspot-PRCF kb_build; +https://github.com/erikprcfi/hotspot-fire-prcf)"}
import html as _html, urllib.parse
def _get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
def unduh(url):
    """Kembalikan (bytes, url_akhir, jenis) – jenis 'pdf' atau 'html' (teks lengkap peraturan di halaman resmi)."""
    raw = _get(url)
    if raw[:4] == b"%PDF": return raw, url, "pdf"
    page = raw.decode("utf-8", "ignore")
    # halaman JDIH: cari tautan PDF peraturan di halaman resmi yang sama
    links = re.findall(r'href=["\']([^"\']+?(?:\.pdf|/Download/[^"\']+))["\']', page, re.I)
    for l in links:
        u2 = urllib.parse.urljoin(url, _html.unescape(l))
        if urllib.parse.urlparse(u2).netloc.split(".")[-2:] != ["go", "id"]: continue   # hanya domain pemerintah
        try:
            r2 = _get(u2)
            if r2[:4] == b"%PDF": return r2, u2, "pdf"
        except Exception as e: print("  tautan", u2, e)
    if page.count("Pasal ") > 20: return raw, url, "html"
    raise ValueError("tidak ada PDF/teks peraturan di halaman")
def teks_html(raw):
    t = raw.decode("utf-8", "ignore")
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>", "\n", t)
    return _html.unescape(re.sub(r"<[^>]+>", " ", t))
def teks(pdf):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(pdf); f.flush()
        return subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True).stdout
def rapikan(t):
    t = re.sub(r"[ \t]+", " ", t.replace("\f", "\n"))
    t = re.sub(r"\n\s*-\s*\d+\s*-\s*\n", "\n", t)   # nomor halaman "- 12 -"
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
def bagian(t):
    """Pisahkan batang tubuh, PENJELASAN, dan LAMPIRAN agar 'Pasal' di penjelasan/lampiran tidak tertukar dengan pasal batang tubuh."""
    m = re.search(r"Ditetapkan\s+di", t)
    if not m: return [("", t)]
    cut = [(m.start(), "")]
    for rx, lab in ((r"\n\s*PENJELASAN\s*\n?\s*ATAS\b", "Penjelasan "), (r"\n\s*LAMPIRAN\b", "Lampiran – ")):
        for x in re.finditer(rx, t[m.start():]):
            cut.append((m.start() + x.start(), lab)); break
    cut.sort(); segs = [("", t[:cut[0][0]])]; lab = ""
    for k, (pos, l) in enumerate(cut):
        end = cut[k + 1][0] if k + 1 < len(cut) else len(t)
        if l: lab = l
        segs.append((lab, t[pos:end]))
    return segs
HEAD = re.compile(r"^\s*Pasal\s*([0-9lLIiOo|]{1,4}(?: [0-9lLIiOo|]{1,2})?)\s*([A-Z])?\s*$")
def angka(tok):
    t = tok.translate(str.maketrans("lLIi|Oo", "1111100")).replace(" ", "")
    return int(t) if t.isdigit() else None
def pecah_pasal(seg):
    """Pecah per judul 'Pasal N' yang berdiri sendiri di satu baris. Tahan salah-baca OCR (l/I→1, O→0, spasi di tengah angka)
    dan hanya menerima nomor yang berurutan wajar, agar label pasal tidak tertukar."""
    out, cur, buf, last = [], None, [], 0
    for line in seg.split("\n"):
        m = HEAD.match(line)
        n = angka(m.group(1)) if m else None
        suf = (m.group(2) or "") if m else ""
        if n is not None and ((last < n <= last + 6) or (suf and n == last)):
            out.append((cur, "\n".join(buf))); cur, buf, last = f"Pasal {n}{suf}", [], n
        else:
            buf.append(line)
    out.append((cur, "\n".join(buf)))
    return out
def potong(kode, judul, url, t):
    out = []
    for pref, seg in bagian(t):
        if pref.startswith("Lampiran"):   # lampiran = format/contoh dokumen atau daftar, tidak dipecah per pasal
            out.append(("Lampiran", seg.strip())); continue
        for ps, body in pecah_pasal("\n" + seg):
            body = body.strip()
            if not body: continue
            if ps is None: out.append((pref + "bagian umum" if pref else ("Pembukaan & ketentuan awal" if not out else "Penutup"), body))
            else: out.append((pref + ps, body))
    res = []
    for ps, body in out:
        body = re.sub(r"\s*\n\s*", " ", body)
        for k in range(0, len(body), 1800):   # pasal panjang dibagi per ±1.800 karakter
            seg = body[k:k + 1800]
            if len(seg) > 40: res.append({"doc": kode, "judul": judul, "url": url, "pasal": ps + (f" (bagian {k // 1800 + 1})" if len(body) > 1800 else ""), "teks": seg})
    return res
def main():
    kb, sumber = [], []
    for kode, judul, urls in DOCS:
        ok = False
        for u in urls:
            try:
                raw, u, jenis = unduh(u)
                t = rapikan(teks(raw) if jenis == "pdf" else teks_html(raw))
                if len(t) < 2000: raise ValueError("teks terlalu sedikit (pindaian gambar?)")
                if not re.search(CEK[kode], re.sub(r"\s+", " ", t[:6000]).upper()): raise ValueError("naskah bukan " + kode)
                ch = potong(kode, judul, u, t); kb += ch
                sumber.append({"kode": kode, "judul": judul, "url": u, "sha256": hashlib.sha256(raw).hexdigest(), "ukuran": len(raw), "jenis": jenis, "potongan": len(ch), "jumlah_pasal": len({c["pasal"].split(" (")[0] for c in ch if c["pasal"].startswith("Pasal")})})
                print("OK", kode, len(ch), "potongan"); ok = True; break
            except Exception as e:
                print("gagal", kode, u, e)
        if not ok: sumber.append({"kode": kode, "judul": judul, "url": urls[0], "galat": "tidak dapat diunduh/dibaca"})
    if len(kb) < 50: print("KB terlalu kecil, berkas lama dipertahankan"); return
    json.dump({"dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sumber": sumber, "potongan": kb}, open(os.path.join(OUT, "kb.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("total potongan", len(kb))
if __name__ == "__main__":
    main()
