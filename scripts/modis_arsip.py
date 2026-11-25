"""
Arsip satelit MODIS (NASA) per Hutan Desa – Pantau Rimbak PRCF
==============================================================

1. AREA TERBAKAR 2001–sekarang  -> data/bekas_modis/indeks.json, data/bekas_modis/<lokasi>.geojson
   Produk resmi NASA MCD64A1 v6.1 (Burned Area bulanan, 500 m, Terra+Aqua; Giglio dkk. 2018).
   Piksel dengan Burn_Date 1–366 = terbakar pada hari ke-n tahun itu. Luas per piksel = 463,3127² m²
   (proyeksi sinusoidal MODIS bersifat sama-luas) = 21,47 ha. Dihitung per zona: areal Hutan Desa,
   wilayah desa, radius 5 km dan 25 km (batas yang sama dengan aplikasi).
   Catatan: piksel 500 m tidak menangkap api kecil (< ~20 ha); data terbit ±2–3 bulan setelah bulan berjalan.

2. KESEHATAN & KEKERINGAN VEGETASI  -> data/vegetasi/indeks.json
   Produk resmi NASA MOD13Q1 & MYD13Q1 v6.1 (indeks vegetasi 16 hari, 250 m; Terra & Aqua bergantian
   sehingga ada data tiap 8 hari). Hanya piksel kualitas baik/cukup (pixel_reliability 0–1).
   - NDVI (kehijauan daun) langsung dari produk.
   - NBR = (NIR − SWIR 2,1 µm) / (NIR + SWIR 2,1 µm), dari pita NIR & MIR produk yang sama;
     turun bila daun/serasah mengering atau terbakar.
   Rata-rata di areal Hutan Desa dibandingkan dengan NORMAL periode yang sama (hari-ke-n yang sama)
   2016–2025: median, persentil 10/25/75/90.

Sumber data: NASA LP DAAC, disalin sebagai COG oleh Microsoft Planetary Computer (akses publik, token SAS anonim).
Hasil hanya ditulis bila isinya berubah. Inkremental: hanya butir citra yang belum diolah.
"""
import os, sys, json, time, datetime, urllib.request, concurrent.futures as cf
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs"
UA = {"User-Agent": "hotspot-fire-prcf (github actions; PRCF Indonesia)", "Content-Type": "application/json"}
PIX_HA_500 = 463.312716528 ** 2 / 1e4
NORMAL = (2016, 2025)
ZONA = ("hd", "desa", "buf5", "buf25")
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR"); os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "3"); os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")

def J(p, d=None):
    try: return json.load(open(p))
    except Exception: return d

def tulis(path, obj):
    """Tulis hanya bila isi berubah (abaikan stempel waktu)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lama = J(path)
    bersih = lambda o: {k: v for k, v in o.items() if k != "diperbarui_utc"} if isinstance(o, dict) else o
    if lama is not None and bersih(lama) == bersih(obj): return False
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    tmp = path + ".tmp"; open(tmp, "w").write(s); os.replace(tmp, path); return True

def req(url, body=None, timeout=60):
    for k in range(4):
        try:
            r = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=UA)
            return json.load(urllib.request.urlopen(r, timeout=timeout))
        except Exception as e:
            if k == 3: raise
            time.sleep(5 * (k + 1))

_TOK = {"t": None, "w": 0}
def token():
    if not _TOK["t"] or time.time() - _TOK["w"] > 1800:
        _TOK["t"] = req(TOKEN_URL)["token"]; _TOK["w"] = time.time()
    return _TOK["t"]

def cari(koleksi, bbox, mulai, akhir):
    out, body = [], {"collections": [koleksi], "bbox": bbox, "datetime": f"{mulai}T00:00:00Z/{akhir}T23:59:59Z", "limit": 500}
    url = STAC
    while True:
        d = req(url, body)
        out += d.get("features", [])
        nxt = [l for l in d.get("links", []) if l.get("rel") == "next"]
        if not nxt: break
        n = nxt[0]; url = n["href"]; body = n.get("body") or body
        if n.get("method", "POST") == "GET": body = None
    return out

def tanggal_item(it):
    a = it["id"].split(".")[1]   # A2026305
    return datetime.date(int(a[1:5]), 1, 1) + datetime.timedelta(days=int(a[5:8]) - 1)

class Kisi:
    """Masker zona per lokasi pada jendela raster (dibuat sekali per ubin & resolusi)."""
    def __init__(self, r, sites, zona):
        from rasterio.warp import transform_geom
        from rasterio.windows import from_bounds
        from rasterio.features import geometry_mask
        from shapely.geometry import shape
        from shapely.ops import unary_union
        geoms = {}
        for s in sites:
            for z in zona:
                g = s[z]["features"][0]["geometry"]
                geoms[(s["id"], z)] = transform_geom("EPSG:4326", r.crs, g)
        u = unary_union([shape(g) for g in geoms.values()]).bounds
        L, B, R, T = r.bounds
        b = (max(u[0], L), max(u[1], B), min(u[2], R), min(u[3], T))
        self.kosong = b[0] >= b[2] or b[1] >= b[3]
        if self.kosong: return
        self.win = from_bounds(*b, r.transform).round_offsets().round_lengths()
        self.tr = r.window_transform(self.win); self.shape = (int(self.win.height), int(self.win.width))
        self.m = {k: ~geometry_mask([g], self.shape, self.tr) for k, g in geoms.items()}
        self.crs = r.crs

def baca(href, kisi_cache, kunci, sites, zona):
    import rasterio
    url = href + "?" + token()
    for k in range(3):
        try:
            with rasterio.open(url) as r:
                kk = (kunci, r.transform.c, r.transform.f, r.width)
                if kk not in kisi_cache: kisi_cache[kk] = Kisi(r, sites, zona)
                K = kisi_cache[kk]
                if K.kosong: return None, K
                return r.read(1, window=K.win, boundless=True, fill_value=r.nodata or 0), K
        except Exception as e:
            if k == 2: raise
            time.sleep(4 * (k + 1)); url = href + "?" + token()

# ------------------------------------------------------------------ 1. area terbakar MCD64A1
def bekas(sites, bbox):
    out_dir = os.path.join(DATA, "bekas_modis"); idx_p = os.path.join(out_dir, "indeks.json")
    cache_p = os.path.join(out_dir, "_olah.json"); C = J(cache_p, {"butir": {}})
    items = cari("modis-64A1-061", bbox, "2000-11-01", datetime.date.today().isoformat())
    baru = [it for it in items if it["id"] not in C["butir"]]
    print(f"MCD64A1: {len(items)} butir, {len(baru)} baru")
    kisi = {}
    def olah(it):
        a, K = baca(it["assets"]["Burn_Date"]["href"], kisi, "bd", sites, ZONA)
        bln = tanggal_item(it)
        res = {"bulan": bln.strftime("%Y-%m"), "zona": {}, "piksel": []}
        if a is None: return it["id"], res
        terbakar = (a >= 1) & (a <= 366)
        tak = (a == -1)   # tak terpetakan (awan/tanpa data)
        for (sid, z), m in K.m.items():
            res["zona"].setdefault(sid, {})[z] = [int((terbakar & m).sum()), int((tak & m).sum()), int(m.sum())]
        # pusat piksel terbakar dalam radius 25 km (untuk peta)
        ys, xs = np.nonzero(terbakar & np.any([m for (sid, z), m in K.m.items() if z == "buf25"], axis=0))
        if len(xs):
            from pyproj import Transformer
            T = Transformer.from_crs(K.crs, "EPSG:4326", always_xy=True)
            X = K.tr.c + (xs + .5) * K.tr.a; Y = K.tr.f + (ys + .5) * K.tr.e
            lo, la = T.transform(X, Y)
            for x, y, d in zip(lo, la, a[ys, xs]):
                res["piksel"].append([round(float(x), 5), round(float(y), 5), int(d)])
        return it["id"], res
    with cf.ThreadPoolExecutor(8) as ex:
        for k, (iid, res) in enumerate(ex.map(olah, baru)):
            C["butir"][iid] = res
            if k % 40 == 39: print(f"  {k + 1}/{len(baru)}"); tulis(cache_p, C)
    tulis(cache_p, C)
    # ringkas per tahun
    pertahun = {s["id"]: {} for s in sites}; bulan_terakhir = None; piksel = {s["id"]: [] for s in sites}; bulan_ada = set()
    from shapely.geometry import shape, Point
    from shapely.prepared import prep
    buf = {s["id"]: prep(shape(s["buf25"]["features"][0]["geometry"])) for s in sites}
    hd = {s["id"]: prep(shape(s["hd"]["features"][0]["geometry"])) for s in sites}
    desa = {s["id"]: prep(shape(s["desa"]["features"][0]["geometry"])) for s in sites}
    for iid, r in sorted(C["butir"].items(), key=lambda kv: kv[1]["bulan"]):
        y = r["bulan"][:4]; bulan_terakhir = max(bulan_terakhir or "", r["bulan"])
        if r["bulan"] in bulan_ada: tambah_bulan = False
        else: bulan_ada.add(r["bulan"]); tambah_bulan = True
        for sid, zz in r["zona"].items():
            if sid not in pertahun: continue
            T = pertahun[sid].setdefault(y, {z: 0.0 for z in ZONA} | {"bulan": 0, "tak_terpetakan_buf5_maks": 0.0})
            for z in ZONA:
                if z in zz: T[z] += zz[z][0] * PIX_HA_500
            if tambah_bulan: T["bulan"] += 1
            if "buf5" in zz and zz["buf5"][2]: T["tak_terpetakan_buf5_maks"] = max(T["tak_terpetakan_buf5_maks"], round(100 * zz["buf5"][1] / zz["buf5"][2]))
        for lo, la, d in r["piksel"]:
            p = Point(lo, la)
            for sid in buf:
                if buf[sid].contains(p):
                    dd = datetime.date(int(r["bulan"][:4]), 1, 1) + datetime.timedelta(days=d - 1)
                    piksel[sid].append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lo, la]},
                                        "properties": {"tgl": dd.isoformat(), "th": dd.year, "zona": "hd" if hd[sid].contains(p) else "desa" if desa[sid].contains(p) else "luar"}})
    lok = {}
    for s in sites:
        P = pertahun[s["id"]]
        tahun = {y: {z: round(v[z], 1) for z in ZONA} | {"bulan": v["bulan"], "tak_terpetakan_buf5_maks_persen": v["tak_terpetakan_buf5_maks"],
                     "bulan_hilang": [m for m in range(1, 13) if f"{y}-{m:02d}" not in bulan_ada and f"{y}-{m:02d}" <= (bulan_terakhir or "") and f"{y}-{m:02d}" >= "2000-11"]} for y, v in sorted(P.items())}
        lengkap = [y for y, v in tahun.items() if v["bulan"] >= 12]
        n = lambda z: [tahun[y][z] for y in lengkap if NORMAL[0] <= int(y) <= NORMAL[1]]
        lok[s["id"]] = {"nama": s["hd_nama"], "tahun": tahun,
                        "rata_2016_2025": {z: round(sum(n(z)) / max(1, len(n(z))), 1) for z in ZONA},
                        "total_2001": {z: round(sum(v[z] for v in tahun.values()), 1) for z in ZONA},
                        "tahun_terbesar_buf25": max(tahun, key=lambda y: tahun[y]["buf25"]) if tahun else None,
                        "piksel": len(piksel[s["id"]])}
        tulis(os.path.join(out_dir, f'{s["id"]}.geojson'), {"type": "FeatureCollection", "features": piksel[s["id"]]})
    tulis(idx_p, {"diperbarui_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "sumber": "NASA MODIS MCD64A1 v6.1 Burned Area bulanan 500 m (Terra+Aqua; Giglio dkk. 2018), via Microsoft Planetary Computer",
                  "metode": "Jumlah piksel Burn_Date 1–366 per zona × 21,47 ha (proyeksi sinusoidal sama-luas). Zona: areal Hutan Desa, wilayah desa, radius 5 km, radius 25 km dari batas desa. Api kecil < ~20 ha sering tidak terpetakan; data terbit ±2–3 bulan kemudian. Beberapa bulan tidak tersedia di salinan arsip (bulan_hilang) – rata-rata 2016–2025 hanya memakai tahun lengkap.",
                  "bulan_terakhir": bulan_terakhir, "lokasi": lok})

# ------------------------------------------------------------------ 2. vegetasi MOD13Q1/MYD13Q1
def vegetasi(sites, bbox):
    out_dir = os.path.join(DATA, "vegetasi"); cache_p = os.path.join(out_dir, "_olah.json")
    C = J(cache_p, {"butir": {}})
    items = []
    for kol in ("modis-13Q1-061",):
        items += cari(kol, bbox, f"{NORMAL[0]}-01-01", datetime.date.today().isoformat())
    baru = [it for it in items if it["id"] not in C["butir"]]
    print(f"MOD13Q1/MYD13Q1: {len(items)} butir, {len(baru)} baru")
    kisi = {}
    def olah(it):
        A = it["assets"]; ref = {}
        rel, K = baca(A["250m_16_days_pixel_reliability"]["href"], kisi, "v", sites, ("hd",))
        if rel is None: return it["id"], None
        ndvi, _ = baca(A["250m_16_days_NDVI"]["href"], kisi, "v", sites, ("hd",))
        nir, _ = baca(A["250m_16_days_NIR_reflectance"]["href"], kisi, "v", sites, ("hd",))
        mir, _ = baca(A["250m_16_days_MIR_reflectance"]["href"], kisi, "v", sites, ("hd",))
        ok = (rel >= 0) & (rel <= 1) & (ndvi > -2000) & (nir > 0) & (mir > 0)
        res = {"tgl": tanggal_item(it).isoformat(), "sat": it["id"][:3], "lokasi": {}}
        nbr = (nir.astype("f8") - mir) / np.maximum(1, nir.astype("f8") + mir)
        for (sid, z), m in K.m.items():
            v = ok & m; n = int(v.sum()); tot = int(m.sum())
            res["lokasi"][sid] = [round(float(ndvi[v].mean()) / 1e4, 4) if n else None, round(float(nbr[v].mean()), 4) if n else None, n, tot]
        return it["id"], res
    with cf.ThreadPoolExecutor(8) as ex:
        for k, (iid, res) in enumerate(ex.map(olah, baru)):
            if res is not None: C["butir"][iid] = res
            if k % 40 == 39: print(f"  {k + 1}/{len(baru)}"); tulis(cache_p, C)
    tulis(cache_p, C)
    lok = {}
    for s in sites:
        sid = s["id"]; seri = []
        for r in C["butir"].values():
            v = r["lokasi"].get(sid)
            if v and v[3] and v[0] is not None and v[2] / v[3] >= 0.4:   # ≥40 % areal Hutan Desa bebas awan
                seri.append({"t": r["tgl"], "ndvi": v[0], "nbr": v[1], "cerah": round(100 * v[2] / v[3])})
        seri.sort(key=lambda x: x["t"])
        def normal(t, f):
            d0 = datetime.date.fromisoformat(t).timetuple().tm_yday
            vals = sorted(x[f] for x in seri if NORMAL[0] <= int(x["t"][:4]) <= NORMAL[1]
                          and min(abs(datetime.date.fromisoformat(x["t"]).timetuple().tm_yday - d0), 366 - abs(datetime.date.fromisoformat(x["t"]).timetuple().tm_yday - d0)) <= 12)
            if len(vals) < 6: return None
            q = lambda p: vals[min(len(vals) - 1, max(0, int(round(p * (len(vals) - 1)))))]
            return {"p10": q(.1), "p25": q(.25), "median": q(.5), "p75": q(.75), "p90": q(.9), "n": len(vals)}
        def kat(x, N):
            if not N: return "tanpa_normal"
            return ("sangat_rendah" if x < N["p10"] else "rendah" if x < N["p25"] else "tinggi" if x > N["p90"] else "normal")
        akhir = seri[-1] if seri else None
        ringkas = None
        if akhir:
            Nn, Nb = normal(akhir["t"], "ndvi"), normal(akhir["t"], "nbr")
            kn, kb = kat(akhir["ndvi"], Nn), kat(akhir["nbr"], Nb)
            urut = ["sangat_rendah", "rendah", "normal", "tinggi", "tanpa_normal"]
            status = "kering" if "sangat_rendah" in (kn, kb) else "agak_kering" if "rendah" in (kn, kb) else "normal" if "tanpa_normal" not in (kn, kb) else "belum_cukup"
            ringkas = {"tanggal": akhir["t"], "cerah_persen": akhir["cerah"], "ndvi": akhir["ndvi"], "nbr": akhir["nbr"],
                       "normal_ndvi": Nn, "normal_nbr": Nb, "kategori_ndvi": kn, "kategori_nbr": kb, "status": status,
                       "umur_hari": (datetime.date.today() - datetime.date.fromisoformat(akhir["t"])).days}
        # deret 24 bulan terakhir + pita normal
        batas = (datetime.date.today() - datetime.timedelta(days=730)).isoformat()
        deret = [dict(x, n_ndvi=normal(x["t"], "ndvi"), n_nbr=normal(x["t"], "nbr")) for x in seri if x["t"] >= batas]
        deret = [{"t": x["t"], "ndvi": x["ndvi"], "nbr": x["nbr"], "cerah": x["cerah"],
                  "ndvi_n": [x["n_ndvi"]["p10"], x["n_ndvi"]["median"], x["n_ndvi"]["p90"]] if x["n_ndvi"] else None,
                  "nbr_n": [x["n_nbr"]["p10"], x["n_nbr"]["median"], x["n_nbr"]["p90"]] if x["n_nbr"] else None} for x in deret]
        lok[sid] = {"nama": s["hd_nama"], "terkini": ringkas, "deret": deret, "jumlah_pengamatan": len(seri)}
    tulis(os.path.join(out_dir, "indeks.json"), {
        "diperbarui_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sumber": "NASA MODIS MOD13Q1 & MYD13Q1 v6.1 (indeks vegetasi 16 hari, 250 m), via Microsoft Planetary Computer",
        "metode": "Rata-rata piksel kualitas baik/cukup (pixel_reliability 0–1) di areal Hutan Desa; pengamatan dipakai bila ≥40 % areal bebas awan. NDVI = kehijauan daun; NBR = (NIR − SWIR 2,1 µm)/(NIR + SWIR 2,1 µm), turun bila vegetasi mengering atau terbakar. Normal = pengamatan 2016–2025 dalam ±12 hari dari tanggal yang sama. Status: kering bila salah satu indeks di bawah persentil 10 normal; agak kering bila di bawah persentil 25.",
        "lokasi": lok})

def main():
    geo = J(os.path.join(DATA, "geo.json")); sites = geo["sites"]
    from shapely.geometry import shape
    from shapely.ops import unary_union
    b = unary_union([shape(s["buf25"]["features"][0]["geometry"]) for s in sites]).bounds
    bbox = [round(b[0], 3), round(b[1], 3), round(b[2], 3), round(b[3], 3)]
    st_p = os.path.join(DATA, "vegetasi", "_jalan.json"); st = J(st_p, {})
    hari = datetime.date.today().isoformat()
    paksa = "--paksa" in sys.argv
    if not paksa and st.get("hari") == hari:
        print("modis_arsip: sudah dijalankan hari ini"); return
    ok = True
    for nama, f in (("bekas", bekas), ("vegetasi", vegetasi)):
        if len(sys.argv) > 1 and sys.argv[1] in ("bekas", "vegetasi") and sys.argv[1] != nama: continue
        try: f(sites, bbox)
        except Exception as e:
            ok = False; print(f"GALAT {nama}: {e}", file=sys.stderr)
    if ok: tulis(st_p, {"hari": hari})

if __name__ == "__main__":
    main()
