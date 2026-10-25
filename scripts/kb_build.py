"""
Basis pengetahuan resmi untuk asisten AI "Bara Api" – Fire Hotspot PRCF
Mengunduh teks peraturan dari situs RESMI pemerintah, memecahnya per Pasal, dan menyimpan
data/bara/kb.json (dipakai untuk mencari pasal yang relevan sebelum AI menjawab, lalu dikutip).
Dijalankan GitHub Actions (.github/workflows/kb.yml). Setiap berkas dicatat URL, waktu unduh & SHA-256.
"""
import os, re, json, hashlib, subprocess, urllib.request, datetime, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bara"); os.makedirs(OUT, exist_ok=True)
DOCS = [  # kode, judul resmi, tautan resmi (beberapa cermin resmi pemerintah, dicoba berurutan)
 ("UU-41-1999", "Undang-Undang Nomor 41 Tahun 1999 tentang Kehutanan",
  ["https://phl.menlhk.go.id/bphl/jambi/peraturan/UU_NO_41_1999.PDF", "https://jdih.esdm.go.id/peraturan/uu-41-1999.pdf"]),
 ("PP-23-2021", "Peraturan Pemerintah Nomor 23 Tahun 2021 tentang Penyelenggaraan Kehutanan",
  ["https://peraturan.go.id/files/pp23-2021bt.pdf", "https://jdih.kemenkeu.go.id/download/4d22fb32-c066-4dec-bba9-7168981bf25f/23TAHUN2021PP.pdf"]),
 ("PermenLHK-9-2021", "Peraturan Menteri LHK Nomor 9 Tahun 2021 tentang Pengelolaan Perhutanan Sosial",
  ["https://phl.menlhk.go.id/bphl/jambi/peraturan/permenlhk-nomor-9-tahun-2021.pdf"]),
 ("Perpres-28-2023", "Peraturan Presiden Nomor 28 Tahun 2023 tentang Perencanaan Terpadu Percepatan Pengelolaan Perhutanan Sosial",
  ["https://peraturan.go.id/files/perpres-no-28-tahun-2023.pdf"]),
 ("PermenLHK-32-2016", "Peraturan Menteri LHK Nomor P.32/MENLHK/SETJEN/KUM.1/3/2016 tentang Pengendalian Kebakaran Hutan dan Lahan",
  ["https://peraturan.go.id/files/bn583-2016.pdf"]),
 ("PermenLHK-4-2023", "Peraturan Menteri LHK Nomor 4 Tahun 2023",
  ["https://sipops.dlhk.nttprov.go.id/file/regulation/Permen%20LHK%20No.4%20Tahun%202023.pdf"]),
]
UA = {"User-Agent": "Mozilla/5.0 (FireHotspot-PRCF kb_build; +https://github.com/erikprcfi/hotspot-fire-prcf)"}
def unduh(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
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
                raw = unduh(u)
                if raw[:4] != b"%PDF": raise ValueError("bukan PDF")
                t = rapikan(teks(raw))
                if len(t) < 2000: raise ValueError("teks terlalu sedikit (pindaian gambar?)")
                ch = potong(kode, judul, u, t); kb += ch
                sumber.append({"kode": kode, "judul": judul, "url": u, "sha256": hashlib.sha256(raw).hexdigest(), "ukuran": len(raw), "potongan": len(ch), "jumlah_pasal": len({c["pasal"].split(" (")[0] for c in ch})})
                print("OK", kode, len(ch), "potongan"); ok = True; break
            except Exception as e:
                print("gagal", kode, u, e)
        if not ok: sumber.append({"kode": kode, "judul": judul, "url": urls[0], "galat": "tidak dapat diunduh/dibaca"})
    if len(kb) < 50: print("KB terlalu kecil, berkas lama dipertahankan"); return
    json.dump({"dibuat_utc": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), "sumber": sumber, "potongan": kb}, open(os.path.join(OUT, "kb.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("total potongan", len(kb))
if __name__ == "__main__":
    main()
