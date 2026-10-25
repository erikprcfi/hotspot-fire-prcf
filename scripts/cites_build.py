"""
Daftar Apendiks CITES resmi untuk asisten AI "Bara Api" – Fire Hotspot PRCF
Sumber: Species+ (UNEP-WCMC & Sekretariat CITES), ekspor publik "CITES Listings" (speciesplus.net/species/exports).
Menyimpan data/bara/cites/{huruf}.json (dipecah per huruf awal genus) + data/bara/cites/indeks.json (sumber, waktu unduh, SHA-256).
Dijalankan GitHub Actions (kb.yml, bulanan) – nilai Apendiks disalin apa adanya, tidak diubah.
"""
import os, csv, io, json, hashlib, datetime, urllib.request, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bara", "cites"); os.makedirs(OUT, exist_ok=True)
URL = "https://speciesplus.net/species/exports/download?data_type=Listings&filters%5Bdesignation%5D=cites&filters%5Bcsv_separator%5D=comma"
def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    raw = open(src, "rb").read() if src else urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "FireHotspot-PRCF cites_build"}), timeout=300).read()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    if len(rows) < 20000 or "Listing" not in rows[0]: raise SystemExit("ekspor CITES tidak lengkap – berkas lama dipertahankan")
    shards = {}
    for r in rows:
        nm = r["Scientific Name"].strip()
        if not nm: continue
        e = {"a": r["Listing"].strip(), "u": r["Listed under"].strip()}
        if r["Party"].strip(): e["p"] = r["Party"].strip()
        if "ID" in r["All_DistributionISOCodes"].split(","): e["id"] = 1
        note = (r["Full note"] or "").strip()
        if note and ("/" in e["a"] or "III" in e["a"]): e["n"] = note[:300]
        e["k"] = r["Class"] or r["Order"]; e["f"] = r["Family"]
        shards.setdefault(nm[0].lower(), {})[nm] = e
    for h, d in shards.items():
        json.dump(d, open(os.path.join(OUT, h + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"sumber": "Species+ (UNEP-WCMC & Sekretariat CITES) – ekspor CITES Listings", "url": URL, "situs": "https://speciesplus.net",
               "diunduh_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sha256": hashlib.sha256(raw).hexdigest(),
               "jumlah_takson": sum(len(d) for d in shards.values()), "berkas": sorted(shards)}, open(os.path.join(OUT, "indeks.json"), "w"), ensure_ascii=False, indent=1)
    print("CITES", sum(len(d) for d in shards.values()), "takson")
if __name__ == "__main__":
    main()
