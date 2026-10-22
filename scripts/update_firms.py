"""
Pembaruan data titik panas NASA FIRMS untuk Pantau Api Nanga Lauk.

Dijalankan otomatis oleh GitHub Actions setiap 3 jam.
1. Mengunduh file publik FIRMS Near Real-Time 7 hari (Asia Tenggara) untuk
   VIIRS S-NPP, VIIRS NOAA-20, VIIRS NOAA-21 dan MODIS Terra/Aqua.
2. Mencatat jejak audit (URL, waktu unduh, ukuran, SHA-256 file asli) di
   data/provenance/YYYY-MM.jsonl.
3. Menyaring titik di kotak Kapuas Hulu, menambahkan klasifikasi zona
   (Hutan Desa, Desa, radius 5/25 km, Kapuas Hulu), jarak ke batas desa
   dan kode petak grid patroli, lalu menyimpan ke data/archive/YYYY-MM.csv
   (tanpa duplikat; kolom asli FIRMS dipertahankan apa adanya).
4. Menulis data/hotspots.json (400 hari terakhir) dan data/status.json
   untuk halaman web.
"""
import csv, io, json, os, sys, glob, hashlib, datetime, urllib.request
from shapely.geometry import shape, Point
from shapely.ops import unary_union
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
BBOX = (111.45, 0.0, 114.30, 1.70)  # lon_min, lat_min, lon_max, lat_max
BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/"
SOURCES = [
    {"id": "VIIRS_SNPP",  "nama": "VIIRS S-NPP 375 m",   "produk": "VNP14IMGTDL_NRT",  "doi": "10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002",
     "path": "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_7d.csv"},
    {"id": "VIIRS_NOAA20", "nama": "VIIRS NOAA-20 375 m", "produk": "VJ114IMGTDL_NRT", "doi": "10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002",
     "path": "noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv"},
    {"id": "VIIRS_NOAA21", "nama": "VIIRS NOAA-21 375 m", "produk": "VJ214IMGTDL_NRT", "doi": "10.5067/VIIRS/VJ214IMG_NRT.002",
     "path": "noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv"},
    {"id": "MODIS",       "nama": "MODIS Terra/Aqua 1 km", "produk": "MCD14DL",        "doi": "10.5067/FIRMS/MODIS/MCD14DL.NRT.0061",
     "path": "modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_7d.csv"},
]
FIELDS = ["uid", "sumber", "produk", "latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument",
          "confidence", "frp", "brightness", "bright_t31_or_ti5", "scan", "track", "daynight", "version",
          "zona", "jarak_desa_km", "petak", "kabupaten", "pertama_diunduh_utc"]

# ---------- batas wilayah ----------
geo = json.load(open(os.path.join(DATA, "geo.json")))
to_utm = Transformer.from_crs(4326, 32649, always_xy=True).transform
def fc_union(fc):
    return unary_union([shape(f["geometry"]) for f in fc["features"]])
from shapely.ops import transform as sh_transform
HD = fc_union(geo["hd"]); DESA = fc_union(geo["desa"])
DESA_UTM = sh_transform(to_utm, DESA)
KAB = [(f["properties"]["WADMKK"], shape(f["geometry"])) for f in geo["kab"]["features"]]
GRID = [(f["properties"]["PETAK"], shape(f["geometry"])) for f in geo["grid"]["features"]]

def classify(lat, lon):
    p = Point(lon, lat)
    kab = next((n for n, g in KAB if g.contains(p)), "")
    petak = next((n for n, g in GRID if g.contains(p)), "")
    if HD.contains(p):
        zona, dist = "Hutan Desa", 0.0
    elif DESA.contains(p):
        zona, dist = "Desa Nanga Lauk", 0.0
    else:
        dist = Point(to_utm(lon, lat)).distance(DESA_UTM) / 1000.0
        zona = ("Radius 5 km" if dist <= 5 else "Radius 5-25 km" if dist <= 25
                else "Kapuas Hulu" if kab == "Kapuas Hulu" else "Luar Kapuas Hulu")
    return zona, round(dist, 2), petak, kab

# ---------- unduh & arsip ----------
def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    now_s = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.join(DATA, "archive"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "provenance"), exist_ok=True)

    archive = {}  # month -> {uid: row}
    for f in glob.glob(os.path.join(DATA, "archive", "*.csv")):
        m = os.path.basename(f)[:7]
        with open(f, newline="", encoding="utf-8") as fh:
            archive[m] = {r["uid"]: r for r in csv.DictReader(fh)}

    prov = {"waktu_unduh_utc": now_s, "sumber": []}
    new = 0
    for s in SOURCES:
        url = BASE + s["path"]
        rec = {"id": s["id"], "produk": s["produk"], "doi": s["doi"], "url": url}
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "titik-api-desa-nanga-lauk (github actions)"})
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = r.read(); rec["http_status"] = r.status
                rec["last_modified"] = r.headers.get("Last-Modified", "")
        except Exception as e:
            rec.update(ok=False, galat=str(e)[:200]); prov["sumber"].append(rec); continue
        rec.update(ok=True, ukuran_byte=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
        rec["baris_total"] = len(rows)
        kept = 0
        for r in rows:
            lat, lon = float(r["latitude"]), float(r["longitude"])
            if not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
                continue
            kept += 1
            modis = s["id"] == "MODIS"
            uid = f'{s["id"]}_{r["satellite"]}_{r["acq_date"]}_{r["acq_time"].zfill(4)}_{r["latitude"]}_{r["longitude"]}'
            month = r["acq_date"][:7]
            book = archive.setdefault(month, {})
            if uid in book:
                continue
            zona, dist, petak, kab = classify(lat, lon)
            book[uid] = {
                "uid": uid, "sumber": s["nama"], "produk": s["produk"],
                "latitude": r["latitude"], "longitude": r["longitude"],
                "acq_date": r["acq_date"], "acq_time": r["acq_time"].zfill(4),
                "satellite": r["satellite"], "instrument": "MODIS" if modis else "VIIRS",
                "confidence": r["confidence"], "frp": r["frp"],
                "brightness": r["brightness"] if modis else r["bright_ti4"],
                "bright_t31_or_ti5": r["bright_t31"] if modis else r["bright_ti5"],
                "scan": r["scan"], "track": r["track"], "daynight": r["daynight"], "version": r["version"],
                "zona": zona, "jarak_desa_km": dist, "petak": petak, "kabupaten": kab,
                "pertama_diunduh_utc": now_s,
            }
            new += 1
        rec["baris_di_kotak_kapuas_hulu"] = kept
        prov["sumber"].append(rec)
    prov["titik_baru"] = new

    for m, book in archive.items():
        rows = sorted(book.values(), key=lambda r: (r["acq_date"], r["acq_time"], r["uid"]))
        with open(os.path.join(DATA, "archive", f"{m}.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)
    with open(os.path.join(DATA, "provenance", now.strftime("%Y-%m") + ".jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(prov, ensure_ascii=False) + "\n")

    cutoff = (now - datetime.timedelta(days=400)).strftime("%Y-%m-%d")
    pts = []
    for book in archive.values():
        for r in book.values():
            if r["acq_date"] < cutoff:
                continue
            pts.append({"k": r["uid"], "la": float(r["latitude"]), "lo": float(r["longitude"]), "d": r["acq_date"],
                        "t": r["acq_time"], "sat": r["satellite"], "ins": r["instrument"], "c": r["confidence"],
                        "frp": float(r["frp"]), "bt": float(r["brightness"]), "dn": r["daynight"], "v": r["version"],
                        "z": r["zona"], "km": float(r["jarak_desa_km"]), "pt": r["petak"], "kab": r["kabupaten"]})
    pts.sort(key=lambda p: (p["d"], p["t"]))
    json.dump({"diperbarui_utc": now_s, "titik": pts}, open(os.path.join(DATA, "hotspots.json"), "w"), separators=(",", ":"))
    status = {"terakhir_cek_utc": now_s, "titik_baru": new, "sumber": prov["sumber"],
              "bulan_arsip": sorted(archive.keys())}
    json.dump(status, open(os.path.join(DATA, "status.json"), "w"), indent=1, ensure_ascii=False)
    ok = sum(1 for s in prov["sumber"] if s.get("ok"))
    print(f"{now_s}: {new} titik baru, {ok}/{len(SOURCES)} sumber OK")
    if ok == 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
