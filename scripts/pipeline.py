"""
Pipeline basis data titik panas – Pantau Api Nanga Lauk
=======================================================

Dijalankan otomatis oleh GitHub Actions setiap 3 jam (lihat .github/workflows/update.yml).

Sumber data (semuanya NASA FIRMS, tanpa diubah nilainya):
  * NRT  – file publik Near Real-Time 7 hari Asia Tenggara (VIIRS S-NPP, NOAA-20, NOAA-21, MODIS).
  * SP   – arsip tahunan per negara (Indonesia) yang dirilis NASA: MODIS 2000–, VIIRS S-NPP 2012–,
           VIIRS NOAA-20 2018–. Bila arsip tahunan untuk suatu tahun terbit, catatan NRT tahun itu
           untuk sensor yang sama otomatis diganti dengan catatan arsip (lebih final).

Setiap catatan diperkaya dengan:
  zona & jarak ke batas Desa Nanga Lauk (UTM 49N), kode petak grid patroli 250 m, kabupaten,
  fungsi kawasan hutan (SK.733/2014 jo. SK.6630/2021), tutupan lahan 2026, kedalaman gambut (Kementan),
  luas piksel deteksi (scan x track; BUKAN luas terbakar), dan ID kejadian api (pengelompokan
  deteksi berjarak <= 1 km dan <= 2 hari).

Keluaran:
  data/archive/YYYY.csv             – basis data induk per tahun
  data/provenance/*.jsonl|json      – jejak audit setiap unduhan (URL, waktu, ukuran, SHA-256)
  data/export/...                   – SHP, KML, GeoJSON, CSV siap pakai
  data/hotspots.json, stats.json, kejadian.json, status.json – untuk website
"""
import csv, io, os, sys, glob, json, math, hashlib, zipfile, datetime, urllib.request
from collections import defaultdict
from shapely.geometry import shape, Point, box, mapping
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree
from pyproj import Transformer
import shapefile  # pyshp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
ARCH = os.path.join(DATA, "archive")
PROV = os.path.join(DATA, "provenance")
EXP = os.path.join(DATA, "export")
for d in (ARCH, PROV, EXP):
    os.makedirs(d, exist_ok=True)

BBOX = (111.45, 0.0, 114.30, 1.70)
UA = {"User-Agent": "titik-api-desa-nanga-lauk (github actions; PRCF Indonesia)"}
NOW = datetime.datetime.now(datetime.timezone.utc)
NOW_S = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")

SENSORS = {
    "VIIRS_SNPP":   {"nama": "VIIRS S-NPP 375 m", "produk": "VNP14IMGTDL / VNP14IMG", "doi": "10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002",
                     "nrt": "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_7d.csv", "sp": "viirs-snpp", "sp_start": 2012},
    "VIIRS_NOAA20": {"nama": "VIIRS NOAA-20 375 m", "produk": "VJ114IMGTDL / VJ114IMG", "doi": "10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002",
                     "nrt": "noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv", "sp": "viirs-jpss1", "sp_start": 2018},
    "VIIRS_NOAA21": {"nama": "VIIRS NOAA-21 375 m", "produk": "VJ214IMGTDL", "doi": "10.5067/VIIRS/VJ214IMG_NRT.002",
                     "nrt": "noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv", "sp": "viirs-jpss2", "sp_start": 2024},
    "MODIS":        {"nama": "MODIS Terra/Aqua 1 km", "produk": "MCD14DL / MCD14ML", "doi": "10.5067/FIRMS/MODIS/MCD14DL.NRT.0061",
                     "nrt": "modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_7d.csv", "sp": "modis", "sp_start": 2000},
}
BASE = "https://firms.modaps.eosdis.nasa.gov/data/"

FIELDS = ["uid", "status_data", "sensor", "produk", "latitude", "longitude", "acq_date", "acq_time", "waktu_wib",
          "satellite", "instrument", "confidence", "frp", "brightness", "bright2", "scan", "track", "daynight",
          "version", "type", "luas_piksel_ha", "zona", "jarak_desa_km", "petak", "kabupaten",
          "fungsi_kawasan", "tutupan_2026", "gambut", "id_kejadian", "diunduh_utc"]
ZONES = ["Hutan Desa", "Desa Nanga Lauk", "Radius 5 km", "Radius 5-25 km", "Kapuas Hulu", "Luar Kapuas Hulu"]
TYPE_TXT = {"0": "kebakaran vegetasi (dugaan)", "1": "gunung api", "2": "sumber panas statis (industri dsb.)", "3": "lepas pantai"}

# ------------------------------------------------------------------ geometri
geo = json.load(open(os.path.join(DATA, "geo.json")))
ctx = json.load(open(os.path.join(DATA, "context.geojson")))
_to_utm = Transformer.from_crs(4326, 32649, always_xy=True)
def to_utm(lon, lat):
    return _to_utm.transform(lon, lat)
def utm_geom(g):
    from shapely import transform as shp_transform
    return shp_transform(g, lambda xy: __import__("numpy").column_stack(_to_utm.transform(xy[:, 0], xy[:, 1])))

def union_fc(fc):
    return unary_union([shape(f["geometry"]) for f in fc["features"]])
HD = prep(union_fc(geo["hd"])); DESA_G = union_fc(geo["desa"]); DESA = prep(DESA_G)
DESA_UTM_BOUND = utm_geom(DESA_G).boundary
def layer(fc, key):
    geoms = [shape(f["geometry"]) for f in fc["features"]]
    return STRtree(geoms), geoms, [key(f["properties"]) for f in fc["features"]]
L_KAB = layer(geo["kab"], lambda p: p["WADMKK"])
L_GRID = layer(geo["grid"], lambda p: p["PETAK"])
L_KWS = layer(ctx["kawasan"], lambda p: f'{p["simbkws"]} ({p["ketkws"]})')
L_TL = layer(ctx["tutupan2026"], lambda p: p["TL2026"])
L_GB = layer(ctx["gambut"], lambda p: f'{p["KEDALAMAN"]} ({p["TIPE"]})')
def lookup(L, pt):
    tree, geoms, vals = L
    for i in tree.query(pt):
        if geoms[i].contains(pt):
            return vals[i]
    return ""

def enrich(lat, lon):
    pt = Point(lon, lat)
    kab = lookup(L_KAB, pt)
    if HD.contains(pt):
        zona, dist = "Hutan Desa", 0.0
    elif DESA.contains(pt):
        zona, dist = "Desa Nanga Lauk", 0.0
    else:
        x, y = to_utm(lon, lat)
        dist = Point(x, y).distance(DESA_UTM_BOUND) / 1000.0
        zona = ("Radius 5 km" if dist <= 5 else "Radius 5-25 km" if dist <= 25
                else "Kapuas Hulu" if kab == "Kapuas Hulu" else "Luar Kapuas Hulu")
    near = dist <= 6
    return {"zona": zona, "jarak_desa_km": f"{dist:.2f}", "petak": lookup(L_GRID, pt) if near else "",
            "kabupaten": kab, "fungsi_kawasan": lookup(L_KWS, pt) if near else "",
            "tutupan_2026": lookup(L_TL, pt) if near else "", "gambut": lookup(L_GB, pt) if near else ""}

# ------------------------------------------------------------------ catatan
def wib(d, t):
    dt = datetime.datetime.strptime(d + t.zfill(4), "%Y-%m-%d%H%M") + datetime.timedelta(hours=7)
    return dt.strftime("%Y-%m-%d %H:%M")

def make_record(r, sid, status):
    modis = sid == "MODIS"
    t = str(r["acq_time"]).zfill(4)
    sat = r["satellite"]
    uid = f'{sid}_{sat}_{r["acq_date"]}_{t}_{float(r["latitude"]):.5f}_{float(r["longitude"]):.5f}'
    try:
        area = float(r["scan"]) * float(r["track"]) * 100.0
    except Exception:
        area = 0.0
    rec = {"uid": uid, "status_data": status, "sensor": SENSORS[sid]["nama"], "produk": SENSORS[sid]["produk"],
           "latitude": r["latitude"], "longitude": r["longitude"], "acq_date": r["acq_date"], "acq_time": t,
           "waktu_wib": wib(r["acq_date"], t), "satellite": sat, "instrument": "MODIS" if modis else "VIIRS",
           "confidence": r["confidence"], "frp": r["frp"],
           "brightness": r.get("brightness") if modis else r.get("bright_ti4"),
           "bright2": r.get("bright_t31") if modis else r.get("bright_ti5"),
           "scan": r["scan"], "track": r["track"], "daynight": r["daynight"], "version": r["version"],
           "type": r.get("type", ""), "luas_piksel_ha": f"{area:.1f}", "id_kejadian": "", "diunduh_utc": NOW_S}
    rec.update(enrich(float(r["latitude"]), float(r["longitude"])))
    return rec

def in_bbox(r):
    lo, la = float(r["longitude"]), float(r["latitude"])
    return BBOX[0] <= lo <= BBOX[2] and BBOX[1] <= la <= BBOX[3]

def fetch(url, timeout=600):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.status, r.headers.get("Last-Modified", "")

def head(url):
    req = urllib.request.Request(url, headers=UA, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.headers.get("Content-Length", ""), r.headers.get("Last-Modified", "")
    except Exception:
        return 0, "", ""

# ------------------------------------------------------------------ arsip
def load_archive():
    recs = {}
    for f in glob.glob(os.path.join(ARCH, "*.csv")):
        with open(f, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                recs[r["uid"]] = r
    return recs

def save_archive(recs):
    by = defaultdict(list)
    for r in recs.values():
        by[r["acq_date"][:4]].append(r)
    for y, rows in by.items():
        rows.sort(key=lambda r: (r["acq_date"], r["acq_time"], r["uid"]))
        with open(os.path.join(ARCH, f"{y}.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
    return sorted(by)

def ingest_nrt(recs, prov):
    new = 0
    for sid, s in SENSORS.items():
        url = BASE + "active_fire/" + s["nrt"]
        rec = {"jenis": "NRT 7 hari", "sensor": sid, "url": url, "doi": s["doi"]}
        try:
            raw, st, lm = fetch(url, 180)
        except Exception as e:
            rec.update(ok=False, galat=str(e)[:200]); prov.append(rec); continue
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
        rec.update(ok=True, http_status=st, last_modified=lm, ukuran_byte=len(raw),
                   sha256=hashlib.sha256(raw).hexdigest(), baris_total=len(rows))
        kept = 0
        sp_years = {r["acq_date"][:4] for r in recs.values() if r["status_data"] == "SP" and r["sensor"] == s["nama"]}
        for r in rows:
            if not in_bbox(r):
                continue
            kept += 1
            if r["acq_date"][:4] in sp_years:
                continue  # tahun ini sudah ada arsip final (SP) untuk sensor ini
            nr = make_record(r, sid, "NRT")
            if nr["uid"] not in recs:
                recs[nr["uid"]] = nr; new += 1
        rec["baris_di_kotak"] = kept
        prov.append(rec)
    return new

def ingest_sp(recs, prov, years, force=False):
    """Cek arsip tahunan NASA; bila ada versi baru, ganti catatan tahun-sensor tsb."""
    idx_f = os.path.join(PROV, "arsip_tahunan_index.json")
    idx = json.load(open(idx_f)) if os.path.exists(idx_f) else {}
    changed = 0
    for sid, s in SENSORS.items():
        for y in years:
            if y < s["sp_start"]:
                continue
            url = f'{BASE}country/{s["sp"]}/{y}/{s["sp"]}_{y}_Indonesia.csv'
            st, ln, lm = head(url)
            if st != 200:
                continue
            key = f"{ln}|{lm}"
            if not force and idx.get(url, {}).get("kunci") == key:
                continue
            try:
                raw, st2, lm2 = fetch(url)
            except Exception as e:
                prov.append({"jenis": "Arsip tahunan", "sensor": sid, "url": url, "ok": False, "galat": str(e)[:200]}); continue
            rows = [r for r in csv.DictReader(io.StringIO(raw.decode("utf-8"))) if in_bbox(r)]
            name = s["nama"]
            for u in [u for u, r in recs.items() if r["sensor"] == name and r["acq_date"][:4] == str(y)]:
                del recs[u]
            for r in rows:
                nr = make_record(r, sid, "SP"); recs[nr["uid"]] = nr
            sha = hashlib.sha256(raw).hexdigest()
            idx[url] = {"kunci": key, "sha256": sha, "baris_di_kotak": len(rows), "diunduh_utc": NOW_S}
            prov.append({"jenis": "Arsip tahunan", "sensor": sid, "tahun": y, "url": url, "ok": True, "last_modified": lm2,
                         "ukuran_byte": len(raw), "sha256": sha, "baris_di_kotak": len(rows), "doi": s["doi"]})
            changed += 1
    json.dump(idx, open(idx_f, "w"), indent=1)
    return changed

# ------------------------------------------------------------------ kejadian api
def cluster(recs, dist_m=1000.0, days=2):
    pts = []
    for r in recs.values():
        if r.get("type") in ("1", "2", "3"):
            r["id_kejadian"] = ""; continue
        x, y = to_utm(float(r["longitude"]), float(r["latitude"]))
        t = datetime.datetime.strptime(r["acq_date"] + r["acq_time"], "%Y-%m-%d%H%M")
        pts.append((t, x, y, r))
    pts.sort(key=lambda p: p[0])
    parent = list(range(len(pts)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    grid = defaultdict(list); win = datetime.timedelta(days=days)
    for i, (t, x, y, r) in enumerate(pts):
        cx, cy = int(x // dist_m), int(y // dist_m)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                lst = grid.get((cx + dx, cy + dy))
                if not lst:
                    continue
                while lst and t - pts[lst[0]][0] > win:
                    lst.pop(0)
                for j in lst:
                    if math.hypot(pts[j][1] - x, pts[j][2] - y) <= dist_m:
                        a, b = find(i), find(j)
                        if a != b:
                            parent[a] = b
        grid[(cx, cy)].append(i)
    groups = defaultdict(list)
    for i in range(len(pts)):
        groups[find(i)].append(i)
    events = []
    for g in groups.values():
        g.sort(key=lambda i: pts[i][0])
        first = pts[g[0]]
        eid = "KJ-" + first[0].strftime("%Y%m%d") + "-" + hashlib.sha1(first[3]["uid"].encode()).hexdigest()[:5].upper()
        rs = [pts[i][3] for i in g]
        for r in rs:
            r["id_kejadian"] = eid
        zrank = min(ZONES.index(r["zona"]) for r in rs)
        fp = unary_union([box(pts[i][1] - float(pts[i][3]["scan"] or 0) * 500, pts[i][2] - float(pts[i][3]["track"] or 0) * 500,
                              pts[i][1] + float(pts[i][3]["scan"] or 0) * 500, pts[i][2] + float(pts[i][3]["track"] or 0) * 500) for i in g])
        cx = sum(pts[i][1] for i in g) / len(g); cy = sum(pts[i][2] for i in g) / len(g)
        lon, lat = Transformer.from_crs(32649, 4326, always_xy=True).transform(cx, cy)
        frps = [float(r["frp"] or 0) for r in rs]
        events.append({"id_kejadian": eid, "mulai_wib": rs[0]["waktu_wib"], "selesai_wib": rs[-1]["waktu_wib"],
                       "durasi_hari": round((pts[g[-1]][0] - first[0]).total_seconds() / 86400, 2),
                       "jumlah_deteksi": len(g), "sensor": "; ".join(sorted({r["sensor"] for r in rs})),
                       "status_data": "; ".join(sorted({r["status_data"] for r in rs})),
                       "frp_maks_mw": round(max(frps), 2), "frp_total_mw": round(sum(frps), 2),
                       "luas_cakupan_piksel_ha": round(fp.area / 1e4, 1),
                       "zona_terdekat": ZONES[zrank], "jarak_min_km": round(min(float(r["jarak_desa_km"]) for r in rs), 2),
                       "petak": "; ".join(sorted({r["petak"] for r in rs if r["petak"]})),
                       "fungsi_kawasan": "; ".join(sorted({r["fungsi_kawasan"] for r in rs if r["fungsi_kawasan"]})),
                       "tutupan_2026": "; ".join(sorted({r["tutupan_2026"] for r in rs if r["tutupan_2026"]})),
                       "gambut": "; ".join(sorted({r["gambut"] for r in rs if r["gambut"]})),
                       "kabupaten": "; ".join(sorted({r["kabupaten"] for r in rs if r["kabupaten"]})),
                       "lat": round(lat, 5), "lon": round(lon, 5), "_fp": fp})
    events.sort(key=lambda e: e["mulai_wib"])
    return events

# ------------------------------------------------------------------ ekspor
ZCOL = {"Hutan Desa": "ff1d1dc2", "Desa Nanga Lauk": "ff1b62e2", "Radius 5 km": "ff17a3e8", "Radius 5-25 km": "ff1eb2c9",
        "Kapuas Hulu": "ff9e7a8e", "Luar Kapuas Hulu": "ff9ea49a"}  # aabbggrr
SHP_PT = [("UID", "C", 80), ("STATUS", "C", 4), ("SENSOR", "C", 25), ("TGL_UTC", "C", 10), ("JAM_UTC", "C", 4),
          ("WAKTU_WIB", "C", 16), ("SATELIT", "C", 6), ("KEYAKINAN", "C", 8), ("FRP_MW", "N", 10, 2), ("SUHU_K", "N", 8, 2),
          ("SCAN_KM", "N", 6, 2), ("TRACK_KM", "N", 6, 2), ("SIANG_MLM", "C", 1), ("VERSI", "C", 8), ("TIPE", "C", 2),
          ("LUAS_PX_HA", "N", 8, 1), ("ZONA", "C", 20), ("JARAK_KM", "N", 8, 2), ("PETAK", "C", 6), ("KABUPATEN", "C", 25),
          ("KAWASAN", "C", 40), ("TUTUPAN26", "C", 40), ("GAMBUT", "C", 50), ("KEJADIAN", "C", 20), ("LAT", "N", 10, 5), ("LON", "N", 11, 5)]
SHP_EV = [("KEJADIAN", "C", 20), ("MULAI_WIB", "C", 16), ("SELESAI", "C", 16), ("DURASI_HR", "N", 7, 2), ("N_DETEKSI", "N", 6, 0),
          ("SENSOR", "C", 80), ("STATUS", "C", 10), ("FRP_MAKS", "N", 10, 2), ("FRP_TOTAL", "N", 12, 2), ("LUAS_PX_HA", "N", 10, 1),
          ("ZONA", "C", 20), ("JARAK_MIN", "N", 8, 2), ("PETAK", "C", 120), ("KAWASAN", "C", 80), ("TUTUPAN26", "C", 120),
          ("GAMBUT", "C", 120), ("KABUPATEN", "C", 60), ("LAT", "N", 10, 5), ("LON", "N", 11, 5)]
PRJ_WGS = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
PRJ_UTM = 'PROJCS["WGS_1984_UTM_Zone_49N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",111.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
def num(v, d=0.0):
    try: return float(v)
    except Exception: return d
def pt_values(r):
    return [r["uid"], r["status_data"], r["sensor"], r["acq_date"], r["acq_time"], r["waktu_wib"], r["satellite"], r["confidence"],
            num(r["frp"]), num(r["brightness"]), num(r["scan"]), num(r["track"]), r["daynight"], r["version"], r.get("type", ""),
            num(r["luas_piksel_ha"]), r["zona"], num(r["jarak_desa_km"]), r["petak"], r["kabupaten"], r["fungsi_kawasan"],
            r["tutupan_2026"], r["gambut"], r["id_kejadian"], num(r["latitude"]), num(r["longitude"])]
def ev_values(e):
    return [e["id_kejadian"], e["mulai_wib"], e["selesai_wib"], e["durasi_hari"], e["jumlah_deteksi"], e["sensor"][:80],
            e["status_data"], e["frp_maks_mw"], e["frp_total_mw"], e["luas_cakupan_piksel_ha"], e["zona_terdekat"], e["jarak_min_km"],
            e["petak"][:120], e["fungsi_kawasan"][:80], e["tutupan_2026"][:120], e["gambut"][:120], e["kabupaten"][:60], e["lat"], e["lon"]]

def write_shp_zip(path, base, kind, fields, items, values, geom, prj):
    tmp = os.path.join("/tmp", base)
    w = shapefile.Writer(tmp, shapeType=kind, encoding="utf-8")
    for f in fields:
        w.field(*f)
    for it in items:
        geom(w, it); w.record(*values(it))
    w.close()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        def add(name, data):
            zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, data)
        for ext in ("shp", "shx", "dbf"):
            add(f"{base}.{ext}", open(f"{tmp}.{ext}", "rb").read())
        add(f"{base}.prj", prj); add(f"{base}.cpg", "UTF-8")
    for ext in ("shp", "shx", "dbf"):
        try: os.remove(f"{tmp}.{ext}")
        except OSError: pass

def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def write_kml(path, title, items, is_event=False):
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
           f"<name>{esc(title)}</name>"]
    for z, c in ZCOL.items():
        sid = "z" + str(ZONES.index(z))
        out.append(f'<Style id="{sid}"><IconStyle><color>{c}</color><scale>{1.1 if is_event else 0.8}</scale>'
                   '<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>')
    for it in items:
        if is_event:
            z = it["zona_terdekat"]; lat, lon = it["lat"], it["lon"]
            name = f'{it["id_kejadian"]} ({it["jumlah_deteksi"]} deteksi)'
            desc = "".join(f"<b>{k}</b>: {esc(v)}<br/>" for k, v in it.items() if not k.startswith("_"))
        else:
            z = it["zona"]; lat, lon = it["latitude"], it["longitude"]
            name = f'{it["waktu_wib"]} WIB'
            desc = "".join(f"<b>{k}</b>: {esc(it[k])}<br/>" for k in FIELDS if it.get(k, "") != "")
        kv = ([(k, v) for k, v in it.items() if not k.startswith("_")] if is_event else [(k, it.get(k, "")) for k in FIELDS])
        ext = "".join(f'<Data name="{k}"><value>{esc(v)}</value></Data>' for k, v in kv)
        out.append(f'<Placemark><name>{esc(name)}</name><styleUrl>#z{ZONES.index(z)}</styleUrl>'
                   f'<description><![CDATA[{desc}]]></description><ExtendedData>{ext}</ExtendedData>'
                   f'<Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>')
    out.append("</Document></kml>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))

def write_geojson(path, items, is_event=False):
    feats = []
    for it in items:
        if is_event:
            props = {k: v for k, v in it.items() if not k.startswith("_")}; lon, lat = it["lon"], it["lat"]
        else:
            props = {k: it.get(k, "") for k in FIELDS}; lon, lat = float(it["longitude"]), float(it["latitude"])
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props})
    json.dump({"type": "FeatureCollection", "features": feats}, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

def write_csv(path, items, fields):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore"); w.writeheader(); w.writerows(items)

def exports(recs, events, years_changed, focus_changed=True):
    focus = sorted([r for r in recs.values() if r["zona"] in ZONES[:4]], key=lambda r: (r["acq_date"], r["acq_time"]))
    ev_focus = [e for e in events if e["zona_terdekat"] in ZONES[:4]]
    pt_geom = lambda w, r: w.point(float(r["longitude"]), float(r["latitude"]))
    if not focus_changed and os.path.exists(os.path.join(EXP, "titik_panas_desa_radius25km_semua_tahun.csv")):
        focus = None
    # 1) radius 25 km desa – semua tahun
    b = "titik_panas_desa_radius25km_semua_tahun"
    if focus is None:
        return _year_exports(recs, years_changed, pt_geom)
    write_csv(os.path.join(EXP, b + ".csv"), focus, FIELDS)
    write_geojson(os.path.join(EXP, b + ".geojson"), focus)
    write_kml(os.path.join(EXP, b + ".kml"), "Titik panas radius 25 km Desa Nanga Lauk", focus)
    write_shp_zip(os.path.join(EXP, b + "_shp.zip"), b, shapefile.POINT, SHP_PT, focus, pt_values, pt_geom, PRJ_WGS)
    # 2) kejadian api – radius 25 km (titik pusat + poligon cakupan piksel UTM)
    b = "kejadian_api_desa_radius25km"
    write_csv(os.path.join(EXP, b + ".csv"), [{k: v for k, v in e.items() if not k.startswith("_")} for e in ev_focus],
              [k for k in (ev_focus[0] if ev_focus else {"id_kejadian": 0}) if not k.startswith("_")])
    write_geojson(os.path.join(EXP, b + ".geojson"), ev_focus, True)
    write_kml(os.path.join(EXP, b + ".kml"), "Kejadian api radius 25 km Desa Nanga Lauk", ev_focus, True)
    write_shp_zip(os.path.join(EXP, b + "_titik_shp.zip"), b + "_titik", shapefile.POINT, SHP_EV, ev_focus, ev_values,
                  lambda w, e: w.point(e["lon"], e["lat"]), PRJ_WGS)
    def poly(w, e):
        g = e["_fp"]; parts = []
        for p in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            parts.append(list(p.exterior.coords)[::-1] if p.exterior.is_ccw else list(p.exterior.coords))
            for h in p.interiors:
                parts.append(list(h.coords) if h.is_ccw else list(h.coords)[::-1])
        w.poly(parts)
    write_shp_zip(os.path.join(EXP, b + "_cakupan_piksel_UTM49N_shp.zip"), b + "_cakupan_piksel", shapefile.POLYGON, SHP_EV,
                  ev_focus, ev_values, poly, PRJ_UTM)
    _year_exports(recs, years_changed, pt_geom)

def _year_exports(recs, years_changed, pt_geom):
    # 3) per tahun – seluruh kotak Kapuas Hulu (hanya tahun yang berubah)
    by = defaultdict(list)
    for r in recs.values():
        by[r["acq_date"][:4]].append(r)
    for y, rows in by.items():
        f = os.path.join(EXP, f"titik_panas_kapuashulu_{y}_shp.zip")
        if y in years_changed or not os.path.exists(f):
            rows.sort(key=lambda r: (r["acq_date"], r["acq_time"]))
            write_shp_zip(f, f"titik_panas_kapuashulu_{y}", shapefile.POINT, SHP_PT, rows, pt_values, pt_geom, PRJ_WGS)

# ------------------------------------------------------------------ website
def site_files(recs, events, prov, archive_years, n_new, sp_changed):
    cutoff = (NOW - datetime.timedelta(days=400)).strftime("%Y-%m-%d")
    pts = [{"k": r["uid"], "la": float(r["latitude"]), "lo": float(r["longitude"]), "d": r["acq_date"], "t": r["acq_time"],
            "sat": r["satellite"], "ins": r["instrument"], "c": r["confidence"], "frp": num(r["frp"]), "bt": num(r["brightness"]),
            "dn": r["daynight"], "v": r["version"], "st": r["status_data"], "ty": r.get("type", ""), "z": r["zona"],
            "km": num(r["jarak_desa_km"]), "pt": r["petak"], "kab": r["kabupaten"], "kw": r["fungsi_kawasan"],
            "tl": r["tutupan_2026"], "gb": r["gambut"], "ha": num(r["luas_piksel_ha"]), "ev": r["id_kejadian"]}
           for r in recs.values() if r["acq_date"] >= cutoff and r["zona"] != "Luar Kapuas Hulu"]
    pts.sort(key=lambda p: (p["d"], p["t"]))
    json.dump({"diperbarui_utc": NOW_S, "titik": pts}, open(os.path.join(DATA, "hotspots.json"), "w"), separators=(",", ":"))
    # statistik tahunan per sensor & zona (tanpa sumber statis/gunung api/lepas pantai)
    ann = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for r in recs.values():
        if r.get("type") in ("1", "2", "3"):
            continue
        fam = "MODIS" if r["instrument"] == "MODIS" else ("VIIRS S-NPP" if "S-NPP" in r["sensor"] else "VIIRS NOAA")
        ann[r["acq_date"][:4]][fam][r["zona"]] += 1
    stats = {"tahunan": {y: {f: dict(z) for f, z in v.items()} for y, v in sorted(ann.items())}, "zona": ZONES}
    json.dump(stats, open(os.path.join(DATA, "stats.json"), "w"), separators=(",", ":"))
    evf = [{k: v for k, v in e.items() if not k.startswith("_")} for e in events if e["zona_terdekat"] in ZONES[:4]]
    json.dump(evf, open(os.path.join(DATA, "kejadian.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    n_sp = sum(1 for r in recs.values() if r["status_data"] == "SP")
    status = {"terakhir_cek_utc": NOW_S, "titik_baru": n_new, "arsip_tahunan_diperbarui": sp_changed,
              "jumlah_catatan": len(recs), "jumlah_sp": n_sp, "jumlah_nrt": len(recs) - n_sp,
              "rentang": [min(r["acq_date"] for r in recs.values()), max(r["acq_date"] for r in recs.values())],
              "tahun_arsip": archive_years, "sumber": [p for p in prov if p.get("jenis") == "NRT 7 hari"],
              "sumber_doi": {k: v["doi"] for k, v in SENSORS.items()},
              "ekspor": sorted(os.path.basename(f) for f in glob.glob(os.path.join(EXP, "*")))}
    json.dump(status, open(os.path.join(DATA, "status.json"), "w"), indent=1, ensure_ascii=False)

# ------------------------------------------------------------------ utama
def main():
    full = "--rebuild" in sys.argv
    recs = load_archive()
    before = {u: (r["acq_date"][:4]) for u, r in recs.items()}
    prov = []
    if full:  # hitung ulang atribut seluruh catatan (mis. setelah batas diperbarui)
        for r in recs.values():
            r.update(enrich(float(r["latitude"]), float(r["longitude"])))
    n_new = ingest_nrt(recs, prov)
    sp_changed = 0
    if full or NOW.hour < 3 or "--cek-arsip" in sys.argv:  # cek arsip tahunan sekali sehari
        sp_changed = ingest_sp(recs, prov, [NOW.year - 1, NOW.year], force=False)
    events = cluster(recs)
    years = save_archive(recs)
    changed_years = {r["acq_date"][:4] for u, r in recs.items() if u not in before} | {y for u, y in before.items() if u not in recs}
    if sp_changed or full:
        changed_years |= set(years)
    exports(recs, events, changed_years, focus_changed=bool(changed_years) or full)
    with open(os.path.join(PROV, NOW.strftime("%Y-%m") + ".jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"waktu_utc": NOW_S, "titik_baru": n_new, "arsip_tahunan_diperbarui": sp_changed, "sumber": prov},
                            ensure_ascii=False) + "\n")
    site_files(recs, events, prov, years, n_new, sp_changed)
    ok = sum(1 for p in prov if p.get("jenis") == "NRT 7 hari" and p.get("ok"))
    print(f"{NOW_S}: {n_new} titik NRT baru, {sp_changed} arsip tahunan diperbarui, {len(recs)} catatan, {len(events)} kejadian, {ok}/4 sumber NRT OK")
    if ok == 0 and not sp_changed:
        sys.exit(1)

if __name__ == "__main__":
    main()
