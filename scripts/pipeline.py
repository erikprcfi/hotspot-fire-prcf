"""
Pipeline basis data titik panas – Fire Hotspot Nanga Lauk
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
UA = {"User-Agent": "hotspot-fire-prcf (github actions; PRCF Indonesia)"}
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
          "fungsi_kawasan", "tutupan_2026", "gambut", "id_kejadian", "lokasi_terdekat", "zona_lokasi", "jarak_lokasi_km",
          "diunduh_utc"]
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
# ---- lokasi Hutan Desa yang dipantau (geo.json "sites"); kode per lokasi: -1 = di dalam HD,
#      0 = di dalam desa (atau areal HD+desa), >0 = jarak (km) ke batas areal desa+HD
SITES = geo.get("sites", [])
SITE_IDS = [x["id"] for x in SITES]
ZONES_LOK = ["Hutan Desa", "Desa", "Radius 5 km", "Radius 5-25 km", "Kapuas Hulu", "Luar Kapuas Hulu"]
_S_HD, _S_AREA, _S_BOUND = [], [], []
for _s in SITES:
    _h = union_fc(_s["hd"]); _a = unary_union([_h, union_fc(_s["desa"])])
    _S_HD.append(prep(_h)); _S_AREA.append(prep(_a)); _S_BOUND.append(utm_geom(_a).boundary)
def site_codes(lat, lon):
    pt = Point(lon, lat); x, y = to_utm(lon, lat); out = []
    for i in range(len(SITES)):
        if _S_HD[i].contains(pt): out.append(-1.0)
        elif _S_AREA[i].contains(pt): out.append(0.0)
        else: out.append(max(1.0, math.ceil(Point(x, y).distance(_S_BOUND[i]))) / 1000.0)  # km, dibulatkan ke atas per meter (tidak pernah 0 = di dalam)
    return out
def site_codes_many(recs):
    """Kode per lokasi untuk banyak catatan sekaligus (vektor, cepat)."""
    import numpy as np, shapely
    lon = np.array([float(r["longitude"]) for r in recs]); lat = np.array([float(r["latitude"]) for r in recs])
    xs, ys = _to_utm.transform(lon, lat); pts = shapely.points(xs, ys)
    cols = []
    for i, s in enumerate(SITES):
        h = union_fc(s["hd"]); a = unary_union([h, union_fc(s["desa"])])
        inh = shapely.contains_xy(h, lon, lat); ina = shapely.contains_xy(a, lon, lat)
        d = np.maximum(1.0, np.ceil(shapely.distance(_S_BOUND[i], pts))) / 1000.0  # km, dibulatkan ke atas per meter
        cols.append(np.where(inh, -1.0, np.where(ina, 0.0, d)))
    return np.column_stack(cols) if cols else np.zeros((len(recs), 0))
def zone_of_code(c, kab):
    return 0 if c < 0 else 1 if c == 0 else 2 if c <= 5 else 3 if c <= 25 else (4 if kab == "Kapuas Hulu" else 5)
CODE = {}  # uid -> [kode per lokasi]; diisi di main()
def compute_codes(recs):
    CODE.clear()
    rs = list(recs.values())
    if not SITES or not rs:
        return
    arr = site_codes_many(rs)
    for r, row in zip(rs, arr):
        CODE[r["uid"]] = [float(v) for v in row]
def site_label(i):
    return f'{SITES[i]["hd_nama"]} (Desa {SITES[i]["desa_nama"]})'

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
    lok = {}
    if SITES:
        cs = site_codes(lat, lon); i = min(range(len(cs)), key=lambda k: cs[k])
        lok = {"lokasi_terdekat": site_label(i), "zona_lokasi": ZONES_LOK[zone_of_code(cs[i], kab)], "jarak_lokasi_km": f"{max(cs[i], 0):.2f}"}
    return {**lok, "zona": zona, "jarak_desa_km": f"{dist:.2f}", "petak": lookup(L_GRID, pt) if near else "",
            "kabupaten": kab, "fungsi_kawasan": lookup(L_KWS, pt) if near else "",
            "tutupan_2026": lookup(L_TL, pt) if near else "", "gambut": lookup(L_GB, pt) if near else ""}

# ------------------------------------------------------------------ catatan
def wib(d, t):
    dt = datetime.datetime.strptime(d + t.zfill(4), "%Y-%m-%d%H%M") + datetime.timedelta(hours=7)
    return dt.strftime("%Y-%m-%d %H:%M")

SAT_NORM = {"A": "Aqua", "T": "Terra", "1": "N20", "2": "N21"}   # FIRMS API memakai kode singkat, berkas CSV harian memakai nama
def make_record(r, sid, status):
    modis = sid == "MODIS"
    t = str(r["acq_time"]).zfill(4)
    sat = SAT_NORM.get(str(r["satellite"]).strip(), str(r["satellite"]).strip())   # kode satelit seragam antar-sumber NASA
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
        sp_max = max((r["acq_date"] for r in recs.values() if r["status_data"] == "SP" and r["sensor"] == s["nama"]), default="")
        for r in rows:
            if not in_bbox(r):
                continue
            kept += 1
            if r["acq_date"] <= sp_max:
                continue  # tanggal ini sudah tercakup arsip final (SP) untuk sensor ini
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

# ------------------------------------------------------------------ FIRMS API (MAP_KEY) – mengisi celah tahun berjalan
API = "https://firms.modaps.eosdis.nasa.gov/api/"
API_SRC = {"VIIRS_SNPP": ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"), "VIIRS_NOAA20": ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
           "VIIRS_NOAA21": ("VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"), "MODIS": ("MODIS_SP", "MODIS_NRT")}
def _d(s): return datetime.date.fromisoformat(s)
def ingest_api(recs, prov, key, tahun):
    """Arsip final (SP) bila sudah dirilis NASA, sisanya near real-time (NRT), lewat FIRMS Area API.
    Hanya untuk tahun yang arsip tahunan negaranya belum ada. Nilai disalin apa adanya dari NASA."""
    idx_f = os.path.join(PROV, "api_firms_index.json")
    idx = json.load(open(idx_f)) if os.path.exists(idx_f) else {}
    ar = json.load(open(os.path.join(PROV, "arsip_tahunan_index.json"))) if os.path.exists(os.path.join(PROV, "arsip_tahunan_index.json")) else {}
    raw, _, _ = fetch(f"{API}data_availability/csv/{key}/ALL", 60)
    avail = {r["data_id"]: (r["min_date"], r["max_date"]) for r in csv.DictReader(io.StringIO(raw.decode("utf-8")))}
    bb = ",".join(str(x) for x in BBOX); y0, y1 = datetime.date(tahun, 1, 1), min(datetime.date(tahun, 12, 31), NOW.date())
    total = 0
    for sid, (sp, nrt) in API_SRC.items():
        s = SENSORS[sid]
        if any(u.startswith(f'{BASE}country/{s["sp"]}/{tahun}/') for u in ar):
            continue   # arsip tahunan negara (lebih lengkap) sudah dipakai
        st = idx.setdefault(f"{sid}_{tahun}", {})
        sp_max = min(_d(avail[sp][1]), y1) if sp in avail and _d(avail[sp][1]) >= y0 else None
        rentang = []
        if sp_max:
            a0 = _d(st["sp_sampai"]) + datetime.timedelta(days=1) if st.get("sp_sampai") else y0
            if a0 <= sp_max: rentang.append(("SP", sp, a0, sp_max))
        if nrt in avail:
            n0 = max(_d(avail[nrt][0]), (sp_max + datetime.timedelta(days=1)) if sp_max else y0, y0)
            if st.get("nrt_sampai"): n0 = max(n0, _d(st["nrt_sampai"]) - datetime.timedelta(days=9))   # 10 hari terakhir dicek ulang
            n1 = min(_d(avail[nrt][1]), y1)
            if n0 <= n1: rentang.append(("NRT", nrt, n0, n1))
        for status, src, a, b in rentang:
            rows, h, d, n_call = [], hashlib.sha256(), a, 0
            while d <= b:
                n = min(5, (b - d).days + 1)
                txt = fetch(f"{API}area/csv/{key}/{src}/{bb}/{n}/{d.isoformat()}", 120)[0]
                h.update(txt); n_call += 1
                if not txt.startswith(b"latitude"): raise RuntimeError(f"FIRMS API {src}: {txt[:120]!r}")
                rows += [r for r in csv.DictReader(io.StringIO(txt.decode("utf-8"))) if in_bbox(r) and a.isoformat() <= r["acq_date"] <= b.isoformat()]
                d += datetime.timedelta(days=n)
            if status == "SP":   # arsip final menggantikan NRT sensor ini pada rentang tanggal yang sama
                for u in [u for u, r in recs.items() if r["sensor"] == s["nama"] and r["status_data"] == "NRT" and a.isoformat() <= r["acq_date"] <= b.isoformat()]:
                    del recs[u]
            baru = 0
            for r in rows:
                nr = make_record(r, sid, status)
                if nr["uid"] not in recs: recs[nr["uid"]] = nr; baru += 1
            total += baru
            st["sp_sampai" if status == "SP" else "nrt_sampai"] = b.isoformat()
            prov.append({"jenis": f"FIRMS API {status}", "sensor": sid, "sumber": src, "url": f"{API}area/csv/[MAP_KEY]/{src}/{bb}/…",
                         "rentang": [a.isoformat(), b.isoformat()], "permintaan": n_call, "baris_di_kotak": len(rows), "baru": baru,
                         "sha256": h.hexdigest(), "ok": True, "doi": s["doi"]})
    idx["diperbarui_utc"] = NOW_S
    json.dump(idx, open(idx_f, "w"), indent=1)
    return total

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
        if SITES:
            ls = [min(CODE.get(r["uid"], [99.0] * len(SITES))[i] for r in rs) for i in range(len(SITES))]
            k = min(range(len(ls)), key=lambda i: ls[i]); kab0 = rs[0]["kabupaten"]
            events[-1].update(lokasi_terdekat=site_label(k), zona_lokasi=ZONES_LOK[zone_of_code(ls[k], kab0)],
                              jarak_lokasi_km=round(max(ls[k], 0), 2), _ls=ls)
    events.sort(key=lambda e: e["mulai_wib"])
    return events

# ------------------------------------------------------------------ ekspor
ZCOL = {"Hutan Desa": "ff1d1dc2", "Desa Nanga Lauk": "ff1b62e2", "Radius 5 km": "ff17a3e8", "Radius 5-25 km": "ff1eb2c9",
        "Kapuas Hulu": "ff9e7a8e", "Luar Kapuas Hulu": "ff9ea49a"}  # aabbggrr
SHP_PT = [("UID", "C", 80), ("STATUS", "C", 4), ("SENSOR", "C", 25), ("TGL_UTC", "C", 10), ("JAM_UTC", "C", 4),
          ("WAKTU_WIB", "C", 16), ("SATELIT", "C", 6), ("KEYAKINAN", "C", 8), ("FRP_MW", "N", 10, 2), ("SUHU_K", "N", 8, 2),
          ("SCAN_KM", "N", 6, 2), ("TRACK_KM", "N", 6, 2), ("SIANG_MLM", "C", 1), ("VERSI", "C", 8), ("TIPE", "C", 2),
          ("LUAS_PX_HA", "N", 8, 1), ("ZONA", "C", 20), ("JARAK_KM", "N", 8, 2), ("PETAK", "C", 6), ("KABUPATEN", "C", 25),
          ("KAWASAN", "C", 40), ("TUTUPAN26", "C", 40), ("GAMBUT", "C", 50), ("KEJADIAN", "C", 20), ("LOKASI", "C", 80), ("LAT", "N", 10, 5), ("LON", "N", 11, 5)]
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
            r["tutupan_2026"], r["gambut"], r["id_kejadian"], r.get("lokasi_terdekat", ""), num(r["latitude"]), num(r["longitude"])]
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

def zidx(z):
    if z in ZONES: return ZONES.index(z)
    if z.startswith("Desa"): return 1
    return ZONES_LOK.index(z) if z in ZONES_LOK else 4
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
        out.append(f'<Placemark><name>{esc(name)}</name><styleUrl>#z{zidx(z)}</styleUrl>'
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

def site_view(r, i):
    """Salinan catatan dengan zona & jarak relatif terhadap lokasi ke-i."""
    c = CODE[r["uid"]][i]; z = zone_of_code(c, r["kabupaten"])
    q = dict(r); q["zona"] = ("Desa " + SITES[i]["desa_nama"]) if z == 1 else ZONES_LOK[z]; q["jarak_desa_km"] = f"{max(c, 0):.2f}"
    q["lokasi_terdekat"] = site_label(i)
    return q
def site_event(e, i):
    c = e["_ls"][i]; z = zone_of_code(c, e["kabupaten"].split("; ")[0] if e["kabupaten"] else "")
    q = dict(e); q["zona_terdekat"] = ("Desa " + SITES[i]["desa_nama"]) if z == 1 else ZONES_LOK[z]; q["jarak_min_km"] = round(max(c, 0), 2)
    q.pop("lokasi_terdekat", None); q.pop("zona_lokasi", None); q.pop("jarak_lokasi_km", None)
    return q

def exports(recs, events, years_changed, focus_changed=True):
    pt_geom = lambda w, r: w.point(float(r["longitude"]), float(r["latitude"]))
    if not focus_changed and all(os.path.exists(os.path.join(EXP, f"titik_panas_{x}_radius25km_semua_tahun.csv")) for x in SITE_IDS):
        return _year_exports(recs, years_changed, pt_geom)
    for old in glob.glob(os.path.join(EXP, "*desa_radius25km*")):
        os.remove(old)  # nama lama (sebelum multi-lokasi)
    def poly(w, e):
        g = e["_fp"]; parts = []
        for p in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            parts.append(list(p.exterior.coords)[::-1] if p.exterior.is_ccw else list(p.exterior.coords))
            for h in p.interiors:
                parts.append(list(h.coords) if h.is_ccw else list(h.coords)[::-1])
        w.poly(parts)
    for i, st in enumerate(SITES):
        sid = st["id"]; nm = f'{st["hd_nama"]} / Desa {st["desa_nama"]}'
        focus = sorted([site_view(r, i) for r in recs.values() if CODE[r["uid"]][i] <= 25], key=lambda r: (r["acq_date"], r["acq_time"]))
        ev_focus = [site_event(e, i) for e in events if e.get("_ls") and e["_ls"][i] <= 25]
        # 1) titik panas radius 25 km – semua tahun
        b = f"titik_panas_{sid}_radius25km_semua_tahun"
        write_csv(os.path.join(EXP, b + ".csv"), focus, FIELDS)
        write_geojson(os.path.join(EXP, b + ".geojson"), focus)
        write_kml(os.path.join(EXP, b + ".kml"), f"Titik panas radius 25 km – {nm}", focus)
        write_shp_zip(os.path.join(EXP, b + "_shp.zip"), b, shapefile.POINT, SHP_PT, focus, pt_values, pt_geom, PRJ_WGS)
        # 2) kejadian api radius 25 km (titik pusat + poligon cakupan piksel UTM)
        b = f"kejadian_api_{sid}_radius25km"
        keys = [k for k in (ev_focus[0] if ev_focus else {"id_kejadian": 0}) if not k.startswith("_")]
        write_csv(os.path.join(EXP, b + ".csv"), [{k: v for k, v in e.items() if not k.startswith("_")} for e in ev_focus], keys)
        write_geojson(os.path.join(EXP, b + ".geojson"), ev_focus, True)
        write_kml(os.path.join(EXP, b + ".kml"), f"Kejadian api radius 25 km – {nm}", ev_focus, True)
        write_shp_zip(os.path.join(EXP, b + "_titik_shp.zip"), b + "_titik", shapefile.POINT, SHP_EV, ev_focus, ev_values,
                      lambda w, e: w.point(e["lon"], e["lat"]), PRJ_WGS)
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
WEB_COLS = ["d", "t", "wib", "lat", "lon", "sen", "sat", "conf", "frp", "bt", "dn", "z", "km", "pt", "kw", "tl", "gb", "st", "ev", "ha", "kab", "uid", "ls"]
def coverage(recs):
    """Rentang data per jenis: arsip final (SP) per sensor dan NRT."""
    out = {}
    for r in recs.values():
        k = ("SP " if r["status_data"] == "SP" else "NRT ") + r["sensor"]
        a = out.setdefault(k, [r["acq_date"], r["acq_date"]])
        a[0] = min(a[0], r["acq_date"]); a[1] = max(a[1], r["acq_date"])
    return out

def web_years(recs, years):
    """Data ringkas per tahun untuk pembuat laporan di website (tanpa titik di luar Kapuas Hulu & tipe 1-3)."""
    wd = os.path.join(DATA, "web"); os.makedirs(wd, exist_ok=True)
    by = defaultdict(list)
    for r in recs.values():
        if r["zona"] == "Luar Kapuas Hulu" or r.get("type") in ("1", "2", "3"):
            continue
        by[r["acq_date"][:4]].append(r)
    for y, rows in by.items():
        f = os.path.join(wd, f"{y}.json")
        if y not in years and os.path.exists(f):
            continue
        rows.sort(key=lambda r: (r["acq_date"], r["acq_time"]))
        data = [[r["acq_date"], r["acq_time"], r["waktu_wib"], round(num(r["latitude"]), 5), round(num(r["longitude"]), 5), r["sensor"],
                 r["satellite"], r["confidence"], num(r["frp"]), num(r["brightness"]), r["daynight"], ZONES.index(r["zona"]),
                 round(num(r["jarak_desa_km"]), 2), r["petak"], r["fungsi_kawasan"], r["tutupan_2026"], r["gambut"], r["status_data"],
                 r["id_kejadian"], num(r["luas_piksel_ha"]), r["kabupaten"], r["uid"], CODE.get(r["uid"], [])] for r in rows]
        json.dump({"kolom": WEB_COLS, "zona": ZONES, "lokasi": SITE_IDS, "baris": data}, open(f, "w"), separators=(",", ":"), ensure_ascii=False)

CUACA_URL = ("https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={start}&end_date={end}"
             "&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max&timezone=Asia%2FJakarta")
def weather_targets():
    out = [("cuaca.json", 0.97, 112.62, "Desa Nanga Lauk")]
    for x in SITES:
        if x["id"] != "nangalauk":
            la, lo = x["pusat_wilayah"]; out.append((f'cuaca_{x["id"]}.json', round(la, 2), round(lo, 2), "Desa " + x["desa_nama"]))
    return out
def update_weather(prov):
    """Cuaca harian tiap lokasi (reanalisis ERA5 via Open-Meteo), diperbarui sekali sehari per lokasi."""
    import time
    for k, (fn, la, lo, nm) in enumerate(weather_targets()):
        if k:
            time.sleep(3)
        _update_weather_one(prov, os.path.join(DATA, fn), la, lo, nm)
def _update_weather_one(prov, f, la, lo, nm):
    old = json.load(open(f)) if os.path.exists(f) else None
    if old and old.get("diunduh_utc", "")[:10] == NOW_S[:10]:
        return
    end = (NOW - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    start = "2001-01-01" if not old else (datetime.date.fromisoformat(old["t"][-1]) - datetime.timedelta(days=30)).isoformat()
    url = CUACA_URL.format(lat=la, lon=lo, start=start, end=end)
    try:
        raw, st, lm = fetch(url, 300)
        d = json.loads(raw)["daily"]
    except Exception as e:
        prov.append({"jenis": "Cuaca", "lokasi": nm, "url": url, "ok": False, "galat": str(e)[:200]}); return
    keys = [("hujan", "precipitation_sum"), ("tmaks", "temperature_2m_max"), ("rh", "relative_humidity_2m_mean"), ("angin", "wind_speed_10m_max")]
    ser = {}
    if old:
        for i, t in enumerate(old["t"]):
            ser[t] = [old[k][i] for k, _ in keys]
    for i, t in enumerate(d["time"]):
        vals = [d[api][i] for _, api in keys]
        if vals[0] is not None:
            ser[t] = vals
    ts = sorted(ser)
    out = {"sumber": "Open-Meteo Historical Weather API – reanalisis ECMWF ERA5/ERA5-Land (Copernicus Climate Change Service)",
           "lokasi": f"{la:.2f} LU, {lo:.2f} BT ({nm})", "url_terakhir": url, "diunduh_utc": NOW_S,
           "sha256_unduhan_terakhir": hashlib.sha256(raw).hexdigest(),
           "satuan": {"hujan": "mm/hari", "tmaks": "°C", "rh": "%", "angin": "km/jam"}, "t": ts}
    for j, (k, _) in enumerate(keys):
        out[k] = [ser[t][j] for t in ts]
    json.dump(out, open(f, "w"), separators=(",", ":"), ensure_ascii=False)
    prov.append({"jenis": "Cuaca", "lokasi": nm, "url": url, "ok": True, "ukuran_byte": len(raw), "sha256": out["sha256_unduhan_terakhir"], "hari_baru": len(d["time"])})

def system_health(recs):
    """Bukti operasional: riwayat pembaruan otomatis, keterlambatan data, dan kelengkapan basis data."""
    runs = []
    for f in sorted(glob.glob(os.path.join(PROV, "*.jsonl")))[-3:]:
        for line in open(f, encoding="utf-8"):
            try: j = json.loads(line)
            except Exception: continue
            src = [x for x in j.get("sumber", []) if "ok" in x and x.get("jenis") in (None, "NRT 7 hari")]
            runs.append({"t": j.get("waktu_utc") or j.get("waktu_unduh_utc"), "baru": j.get("titik_baru", 0),
                         "ok": sum(1 for x in src if x.get("ok")), "n": len(src) or 4})
    runs = [r for r in runs if r["t"]][-24:]
    lat = []
    for r in recs.values():
        if r["status_data"] != "NRT" or r["diunduh_utc"] < "2026-10-22T05:00:00Z":
            continue  # hanya titik yang tertangkap saat sistem sudah berjalan rutin (bukan isian awal 7 hari)
        try:
            acq = datetime.datetime.strptime(r["acq_date"] + r["acq_time"], "%Y-%m-%d%H%M").replace(tzinfo=datetime.timezone.utc)
            dl = datetime.datetime.strptime(r["diunduh_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
        except Exception:
            continue
        h = (dl - acq).total_seconds() / 3600
        if 0 <= h <= 24:
            lat.append(h)
    lat.sort()
    idx_f = os.path.join(PROV, "arsip_tahunan_index.json")
    cu = os.path.join(DATA, "cuaca.json")
    return {"riwayat": runs, "jadwal_cron_utc": "17 */3 * * *",
            "latensi_median_jam": round(lat[len(lat) // 2], 1) if len(lat) >= 5 else None, "latensi_n": len(lat),
            "arsip_terverifikasi": len(json.load(open(idx_f))) if os.path.exists(idx_f) else 0,
            "hari_cuaca": len(json.load(open(cu))["t"]) if os.path.exists(cu) else 0,
            "jumlah_pembaruan_tercatat": sum(1 for f in glob.glob(os.path.join(PROV, "*.jsonl")) for _ in open(f, encoding="utf-8"))}

def titik_app(r):
    return {"k": r["uid"], "la": float(r["latitude"]), "lo": float(r["longitude"]), "d": r["acq_date"], "t": r["acq_time"],
            "sat": r["satellite"], "ins": r["instrument"], "c": r["confidence"], "frp": num(r["frp"]), "bt": num(r["brightness"]),
            "dn": r["daynight"], "v": r["version"], "st": r["status_data"], "ty": r.get("type", ""), "z": r["zona"],
            "km": num(r["jarak_desa_km"]), "pt": r["petak"], "kab": r["kabupaten"], "kw": r["fungsi_kawasan"],
            "tl": r["tutupan_2026"], "gb": r["gambut"], "ha": num(r["luas_piksel_ha"]), "ev": r["id_kejadian"],
            "ls": CODE.get(r["uid"], [])}

def titik_tahunan(recs):
    """Arsip titik panas per tahun untuk pencarian periode di aplikasi (data/titik/YYYY.json, format sama dengan hotspots.json).
    Hanya ditulis ulang bila isinya berubah. Nilai NASA tidak diubah."""
    out = os.path.join(DATA, "titik"); os.makedirs(out, exist_ok=True)
    per = defaultdict(list)
    for r in recs.values():
        if r["zona"] != "Luar Kapuas Hulu":
            per[r["acq_date"][:4]].append(titik_app(r))
    idx = {}
    for y, L in sorted(per.items()):
        L.sort(key=lambda p: (p["d"], p["t"]))
        txt = json.dumps({"tahun": y, "lokasi": SITE_IDS, "titik": L}, separators=(",", ":"))
        f = os.path.join(out, f"{y}.json")
        if not os.path.exists(f) or open(f).read() != txt:
            open(f, "w").write(txt)
        idx[y] = {"n": len(L), "awal": L[0]["d"], "akhir": L[-1]["d"], "sha256": hashlib.sha256(txt.encode()).hexdigest()}
    json.dump({"diperbarui_utc": NOW_S, "lokasi": SITE_IDS, "tahun": idx, "sumber": "NASA FIRMS (arsip final SP + near real-time NRT), wilayah Kabupaten Kapuas Hulu"},
              open(os.path.join(out, "indeks.json"), "w"), indent=1)

def site_files(recs, events, prov, archive_years, n_new, sp_changed):
    cutoff = (NOW - datetime.timedelta(days=400)).strftime("%Y-%m-%d")
    pts = [titik_app(r) for r in recs.values() if r["acq_date"] >= cutoff and r["zona"] != "Luar Kapuas Hulu"]
    pts.sort(key=lambda p: (p["d"], p["t"]))
    json.dump({"diperbarui_utc": NOW_S, "lokasi": SITE_IDS, "titik": pts}, open(os.path.join(DATA, "hotspots.json"), "w"), separators=(",", ":"))
    titik_tahunan(recs)
    # statistik tahunan per sensor & zona (tanpa sumber statis/gunung api/lepas pantai)
    ann = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for r in recs.values():
        if r.get("type") in ("1", "2", "3"):
            continue
        fam = "MODIS" if r["instrument"] == "MODIS" else ("VIIRS S-NPP" if "S-NPP" in r["sensor"] else "VIIRS NOAA")
        ann[r["acq_date"][:4]][fam][r["zona"]] += 1
    per = {sid: defaultdict(lambda: defaultdict(lambda: defaultdict(int))) for sid in SITE_IDS}
    for r in recs.values():
        if r.get("type") in ("1", "2", "3"):
            continue
        fam = "MODIS" if r["instrument"] == "MODIS" else ("VIIRS S-NPP" if "S-NPP" in r["sensor"] else "VIIRS NOAA")
        for i, sid in enumerate(SITE_IDS):
            per[sid][r["acq_date"][:4]][fam][ZONES_LOK[zone_of_code(CODE[r["uid"]][i], r["kabupaten"])]] += 1
    stats = {"tahunan": {y: {f: dict(z) for f, z in v.items()} for y, v in sorted(ann.items())}, "zona": ZONES,
             "zona_lokasi": ZONES_LOK, "per_lokasi": {sid: {y: {f: dict(z) for f, z in v.items()} for y, v in sorted(d.items())} for sid, d in per.items()}}
    json.dump(stats, open(os.path.join(DATA, "stats.json"), "w"), separators=(",", ":"))
    EVK = ["id_kejadian", "mulai_wib", "selesai_wib", "jumlah_deteksi", "sensor", "status_data", "frp_maks_mw", "luas_cakupan_piksel_ha",
           "zona_terdekat", "jarak_min_km", "petak", "fungsi_kawasan", "tutupan_2026", "gambut", "lat", "lon", "ls"]
    evf = [[e[k] for k in EVK[:-1]] + [[(-1 if v < 0 else 0 if v == 0 else max(0.001, round(v, 3))) for v in e.get("_ls", [])]] for e in events
           if e["zona_terdekat"] in ZONES[:4] or (e.get("_ls") and min(e["_ls"]) <= 25)]
    json.dump({"kolom": EVK, "lokasi": SITE_IDS, "baris": evf}, open(os.path.join(DATA, "kejadian.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    n_sp = sum(1 for r in recs.values() if r["status_data"] == "SP")
    status = {"terakhir_cek_utc": NOW_S, "titik_baru": n_new, "arsip_tahunan_diperbarui": sp_changed,
              "jumlah_catatan": len(recs), "jumlah_sp": n_sp, "jumlah_nrt": len(recs) - n_sp,
              "rentang": [min(r["acq_date"] for r in recs.values()), max(r["acq_date"] for r in recs.values())],
              "tahun_arsip": archive_years, "sumber": [p for p in prov if p.get("jenis") == "NRT 7 hari"],
              "cakupan": coverage(recs), "sistem": system_health(recs),
              "sumber_doi": {k: v["doi"] for k, v in SENSORS.items()},
              "lokasi": [{k: v for k, v in x.items() if k not in ("hd", "desa", "buf5", "buf25")} for x in SITES],
              "ekspor": sorted(os.path.basename(f) for f in glob.glob(os.path.join(EXP, "*")))}
    json.dump(status, open(os.path.join(DATA, "status.json"), "w"), indent=1, ensure_ascii=False)

# ------------------------------------------------------------------ utama
def main():
    full = "--rebuild" in sys.argv
    recs = load_archive()
    for u in [u for u, r in recs.items() if r.get("satellite") in SAT_NORM]:   # rapikan catatan lama berkode singkat (hindari duplikat)
        r = recs.pop(u); r["satellite"] = SAT_NORM[r["satellite"]]
        bag = u.split("_"); bag[1 if bag[0] == "MODIS" else 2] = r["satellite"]; nu = "_".join(bag)
        r["uid"] = nu
        if nu not in recs: recs[nu] = r
    before = {u: (r["acq_date"][:4]) for u, r in recs.items()}
    prov = []
    if full:  # hitung ulang atribut seluruh catatan (mis. setelah batas diperbarui)
        for r in recs.values():
            r.update(enrich(float(r["latitude"]), float(r["longitude"])))
    n_new = ingest_nrt(recs, prov)
    sp_changed = 0
    if full or NOW.hour < 3 or "--cek-arsip" in sys.argv:  # cek arsip tahunan sekali sehari
        sp_changed = ingest_sp(recs, prov, [NOW.year - 1, NOW.year], force=False)
    n_api, key = 0, os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key and os.environ.get("ANALISIS_KEY") and os.environ.get("AKUN_URL"):   # kunci disimpan di Apps Script PRCF
        try:
            with urllib.request.urlopen(f'{os.environ["AKUN_URL"]}?pekerja={os.environ["ANALISIS_KEY"]}&rahasia=1', timeout=60) as r:
                key = (json.loads(r.read()).get("firms") or "").strip()
        except Exception as e:
            prov.append({"jenis": "FIRMS API", "ok": False, "galat": "kunci tidak dapat dibaca: " + str(e)[:120]})
    if key:
        try:
            n_api = ingest_api(recs, prov, key, NOW.year)
            n_new += n_api
        except Exception as e:
            prov.append({"jenis": "FIRMS API", "ok": False, "galat": str(e).replace(key, "[MAP_KEY]")[:200]})
    compute_codes(recs)
    events = cluster(recs)
    years = save_archive(recs)
    changed_years = {r["acq_date"][:4] for u, r in recs.items() if u not in before} | {y for u, y in before.items() if u not in recs}
    if sp_changed or full or n_api:
        changed_years |= set(years)
    exports(recs, events, changed_years, focus_changed=bool(changed_years) or full)
    update_weather(prov)
    try:  # prakiraan cuaca 7 hari & peringatan dini bahaya kebakaran (BMKG + ECMWF, FDRS)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import prakiraan
        prakiraan.update(SITES, prov)
    except Exception as e:
        prov.append({"jenis": "Prakiraan", "ok": False, "galat": str(e)[:200]})
    with open(os.path.join(PROV, NOW.strftime("%Y-%m") + ".jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"waktu_utc": NOW_S, "titik_baru": n_new, "arsip_tahunan_diperbarui": sp_changed, "sumber": prov},
                            ensure_ascii=False) + "\n")
    web_years(recs, set(years) if (full or sp_changed) else changed_years)
    site_files(recs, events, prov, years, n_new, sp_changed)
    ok = sum(1 for p in prov if p.get("jenis") == "NRT 7 hari" and p.get("ok"))
    print(f"{NOW_S}: {n_new} titik NRT baru, {sp_changed} arsip tahunan diperbarui, {len(recs)} catatan, {len(events)} kejadian, {ok}/4 sumber NRT OK")
    if ok == 0 and not sp_changed:
        sys.exit(1)

if __name__ == "__main__":
    main()
