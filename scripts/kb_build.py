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
  ["https://peraturan.go.id/files/bn583-2016.pdf", "https://www.peraturan.go.id/files/bn583-2016.pdf"]),
 ("PermenLHK-4-2023", "Peraturan Menteri LHK Nomor 4 Tahun 2023 tentang Pengelolaan Perhutanan Sosial pada Kawasan Hutan dengan Pengelolaan Khusus",
  ["https://peraturan.bpk.go.id/Details/253766", "https://jdih.kemenkoinfra.go.id/permen-lhk-no-4-tahun-2023",
   "https://sipops.dlhk.nttprov.go.id/file/regulation/Permen%20LHK%20No.4%20Tahun%202023.pdf"]),
]
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
def potong(kode, judul, url, t):
    parts = re.split(r"\n\s*(Pasal\s+\d+[A-Z]?)\s*\n", "\n" + t)
    out = []
    head = parts[0].strip()
    if head: out.append(("Pembukaan & ketentuan awal", head))
    for i in range(1, len(parts) - 1, 2):
        out.append((parts[i].replace("  ", " "), parts[i + 1].strip()))
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
                ch = potong(kode, judul, u, t); kb += ch
                sumber.append({"kode": kode, "judul": judul, "url": u, "sha256": hashlib.sha256(raw).hexdigest(), "ukuran": len(raw), "jenis": jenis, "potongan": len(ch), "jumlah_pasal": len({c["pasal"].split(" (")[0] for c in ch})})
                print("OK", kode, len(ch), "potongan"); ok = True; break
            except Exception as e:
                print("gagal", kode, u, e)
        if not ok: sumber.append({"kode": kode, "judul": judul, "url": urls[0], "galat": "tidak dapat diunduh/dibaca"})
    if len(kb) < 50: print("KB terlalu kecil, berkas lama dipertahankan"); return
    json.dump({"dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sumber": sumber, "potongan": kb}, open(os.path.join(OUT, "kb.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("total potongan", len(kb))
if __name__ == "__main__":
    main()
