"""
Luas bekas terbakar otomatis dari citra Sentinel-2 – Fire Hotspot PRCF
======================================================================

Untuk setiap "musim api" (kejadian api berdekatan waktu, jeda > 75 hari = musim baru) yang
berjarak <= 5 km dari salah satu lokasi Hutan Desa:

  1. Citra Sentinel-2 L2A (ESA Copernicus; arsip COG publik AWS / Element 84 Earth Search):
     komposit SEBELUM (75 hari sebelum api pertama) dan SESUDAH (3–45 hari setelah api terakhir, agar tanda hangus belum tertutup tumbuhan baru),
     median per piksel dari maksimal 4 citra paling sedikit awan; awan, bayangan, & air dibuang
     dengan lapisan klasifikasi SCL.
  2. NBR = (B8A − B12) / (B8A + B12) pada 20 m; dNBR = NBR sebelum − NBR sesudah.
  3. Piksel terbakar: dNBR ≥ 0,27 (kelas keparahan Key & Benson 2006, FIREMON/USGS:
     0,27–0,44 rendah–sedang, 0,44–0,66 sedang–tinggi, ≥ 0,66 tinggi).
  3b. Syarat tambahan per citra sesudah: SWIR2 naik >= 0,02 (membedakan dari bayangan/air), NBR sesudah <= 0,20
      (permukaan hangus), konsisten di >= 2 citra sesudah bila tersedia, sebelum api NBR >= 0,3 (bervegetasi).
  4. Hanya petak yang berada <= 1 km dari deteksi titik api NASA FIRMS pada musim tsb. dan
     luasnya >= 0,5 ha yang dihitung (mengurangi salah deteksi panen/perubahan vegetasi lain).
  5. Bila piksel cerah < 60% wilayah analisa → status "tertutup awan", dicoba ulang pada run berikutnya.

Keluaran: data/bekas_terbakar/indeks.json, bekas_terbakar.geojson (WGS84),
data/export/bekas_terbakar_<lokasi>_shp.zip (UTM 49N), pratinjau sebelum/sesudah (PNG).
Hasil adalah INDIKASI dari citra satelit; perlu verifikasi lapangan.
"""
import os, sys, json, math, time, datetime, zipfile, hashlib, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "bekas_terbakar"); EXP = os.path.join(DATA, "export")
os.makedirs(OUT, exist_ok=True)
STAC = "https://earth-search.aws.element84.com/v1/search"
UA = {"User-Agent": "hotspot-fire-prcf (github actions; PRCF Indonesia)", "Content-Type": "application/json"}
MULAI = "2023-01-01"           # analisa ulang mundur sampai tanggal ini
DNBR_MIN, DIST_M, MIN_HA, CLEAR_MIN, POST_NBR_MAX, POST_DAYS = 0.27, 1000.0, 0.5, 0.60, 0.20, 45
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR"); os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4"); os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "3"); os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")

def stac(bbox, a, b, maxcc=70):
    body = json.dumps({"collections": ["sentinel-2-l2a"], "bbox": bbox, "datetime": f"{a}T00:00:00Z/{b}T23:59:59Z",
                       "limit": 100, "query": {"eo:cloud_cover": {"lt": maxcc}}}).encode()
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(STAC, data=body, headers=UA), timeout=90) as r:
                return json.loads(r.read())["features"]
        except Exception as e:
            err = e; time.sleep(5 * (k + 1))
    raise err

def windows(events, gap=75):  # jeda > 75 hari = musim baru (sama dengan jendela citra "sebelum"; cegah hitung ganda)
    ev = sorted(events, key=lambda e: e["mulai_wib"]); W = []
    for e in ev:
        if W and (datetime.date.fromisoformat(e["mulai_wib"][:10]) - datetime.date.fromisoformat(W[-1]["akhir"])).days <= gap:
            W[-1]["ev"].append(e); W[-1]["akhir"] = max(W[-1]["akhir"], e["selesai_wib"][:10])
        else:
            W.append({"awal": e["mulai_wib"][:10], "akhir": e["selesai_wib"][:10], "ev": [e]})
    return W

def scenes(items, shape, transform, rgb=False):
    """Baca tiap citra: NBR, SWIR2 (B12) dan (opsional) RGB, dengan masker awan/bayangan SCL diperlebar 60 m."""
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.crs import CRS
    from scipy import ndimage
    dst_crs = CRS.from_epsg(32649); out = []
    for it in items:
        A = it["assets"]
        def read(key, res=Resampling.bilinear, dtype="float32"):
            href = A[key]["href"]; arr = np.zeros(shape, dtype=dtype)
            with rasterio.open(href) as src:
                reproject(rasterio.band(src, 1), arr, dst_transform=transform, dst_crs=dst_crs, resampling=res, src_nodata=0, dst_nodata=0)
            if key == "scl":
                return arr
            rb = (A[key].get("raster:bands") or [{}])[0]  # reflektans = DN x skala + offset (baseline >= 04.00: offset -0,1)
            return np.where(arr > 0, arr * rb.get("scale", 1e-4) + rb.get("offset", 0.0), np.nan).astype("float32")
        try:
            scl = read("scl", Resampling.nearest, "uint8")
            bad = ndimage.binary_dilation(np.isin(scl, [1, 2, 3, 8, 9, 10, 11]), iterations=3)  # awan, bayangan, cacat (+60 m)
            ok = np.isin(scl, [4, 5]) & ~bad                                                # hanya vegetasi & tanah terbuka
            if ok.mean() < 0.05:
                continue
            n = read("nir08"); s2 = read("swir22")
            ok &= np.isfinite(n) & np.isfinite(s2) & (n + s2 > 0.01)
            d = {"id": it["id"], "nbr": np.where(ok, (n - s2) / (n + s2), np.nan), "s2": np.where(ok, s2, np.nan)}
            if rgb:
                d["rgb"] = np.stack([np.where(ok, read(k), np.nan) for k in ("swir22", "nir08", "red")])  # komposit SWIR-NIR-merah
            out.append(d)
        except Exception as e:
            print("  gagal baca", it["id"], str(e)[:120]); continue
    return out

def med(arrs):
    with np.errstate(all="ignore"):
        import warnings; warnings.simplefilter("ignore")
        return np.nanmedian(np.stack(arrs), axis=0)

def png(rgb, path):
    from PIL import Image
    a = np.nan_to_num(rgb, nan=0)
    a = np.clip(a / np.array([.35, .45, .15])[:, None, None], 0, 1) ** (1 / 1.3) * 255  # SWIR-NIR-merah: vegetasi hijau, bekas terbakar cokelat-magenta
    Image.fromarray(np.moveaxis(a.astype("uint8"), 0, -1)).save(path, optimize=True)

def analyse(site, win, idx_old):
    from pyproj import Transformer
    from rasterio.transform import from_origin
    from rasterio import features
    from shapely.geometry import shape as shp, Point, mapping
    from shapely.ops import unary_union, transform as stf
    to_utm = Transformer.from_crs(4326, 32649, always_xy=True).transform
    to_wgs = Transformer.from_crs(32649, 4326, always_xy=True).transform
    pts = [to_utm(e["lon"], e["lat"]) for e in win["ev"]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0, x1, y1 = min(xs) - 1500, min(ys) - 1500, max(xs) + 1500, max(ys) + 1500
    res = 20.0; Wd, Hd = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
    tr = from_origin(x0, y1, res, res)
    lo0, la0 = to_wgs(x0, y0); lo1, la1 = to_wgs(x1, y1); bbox = [lo0, la0, lo1, la1]
    a, b = datetime.date.fromisoformat(win["awal"]), datetime.date.fromisoformat(win["akhir"])
    today = datetime.date.today()
    if (b + datetime.timedelta(days=3)) > today:
        return {"status": "menunggu citra sesudah api"}
    pre = sorted(stac(bbox, (a - datetime.timedelta(days=75)).isoformat(), (a - datetime.timedelta(days=1)).isoformat()), key=lambda f: f["properties"]["eo:cloud_cover"])[:4]
    post = sorted(stac(bbox, (b + datetime.timedelta(days=3)).isoformat(), min(today, b + datetime.timedelta(days=POST_DAYS)).isoformat()), key=lambda f: f["properties"]["eo:cloud_cover"])[:4]
    if not pre or not post:
        return {"status": "belum ada citra" + (" sebelum" if not pre else "") + (" sesudah" if not post else "")}
    P0 = scenes(pre, (Hd, Wd), tr, rgb=True); P1 = scenes(post, (Hd, Wd), tr, rgb=True)
    if not P0 or not P1:
        return {"status": "tertutup awan"}
    Npre = med([x["nbr"] for x in P0]); S2pre = med([x["s2"] for x in P0])
    valid_n = np.zeros((Hd, Wd), "int16"); burn_n = np.zeros((Hd, Wd), "int16")
    for x in P1:  # syarat tiap citra sesudah: NBR turun >= 0,27 DAN SWIR2 naik >= 0,02 (bayangan membuat SWIR2 turun)
        v = np.isfinite(x["nbr"]) & np.isfinite(Npre)
        valid_n += v
        burn_n += v & ((Npre - x["nbr"]) >= DNBR_MIN) & ((x["s2"] - S2pre) >= 0.02) & (x["nbr"] <= POST_NBR_MAX)
    Npost = med([x["nbr"] for x in P1])
    valid = (valid_n > 0) & np.isfinite(Npre); clear = float(valid.mean())
    if clear < CLEAR_MIN:
        return {"status": "tertutup awan", "cerah_persen": round(clear * 100)}
    need = np.where(valid_n >= 2, 2, 1)              # konsisten di >= 2 citra sesudah bila tersedia
    dn = np.where(valid, Npre - Npost, np.nan)
    burn = valid & (burn_n >= need) & (Npre >= 0.3) & (dn >= DNBR_MIN)  # sebelumnya bervegetasi
    from scipy import ndimage as _nd
    burn = _nd.binary_opening(burn, structure=np.ones((2, 2)))       # buang bintik 1 piksel
    Rpre = med([x["rgb"] for x in P0]); Rpost = med([x["rgb"] for x in P1])
    # petak terhubung dekat deteksi api
    near = np.zeros_like(burn)
    for (px, py) in pts:
        c0, r0 = int((px - x0) / res), int((y1 - py) / res); rr = int(DIST_M / res)
        yy, xx = np.ogrid[max(0, r0 - rr):min(Hd, r0 + rr + 1), max(0, c0 - rr):min(Wd, c0 + rr + 1)]
        m = (yy - r0) ** 2 + (xx - c0) ** 2 <= rr ** 2
        near[max(0, r0 - rr):min(Hd, r0 + rr + 1), max(0, c0 - rr):min(Wd, c0 + rr + 1)] |= m
    from scipy import ndimage
    lab, n = ndimage.label(burn, structure=np.ones((3, 3)))
    keep = np.zeros(n + 1, bool)
    if n:
        sizes = ndimage.sum(burn, lab, range(n + 1)); touch = ndimage.maximum(near, lab, range(n + 1))
        keep = (sizes * res * res / 1e4 >= MIN_HA) & (touch > 0); keep[0] = False
    final = keep[lab] & burn
    sev = np.zeros(final.shape, "uint8"); sev[final & (dn < 0.44)] = 1; sev[final & (dn >= 0.44) & (dn < 0.66)] = 2; sev[final & (dn >= 0.66)] = 3
    polys = []
    for geom, v in features.shapes(sev, mask=sev > 0, transform=tr):
        g = shp(geom)
        if g.area > 0: polys.append((g, int(v)))
    px_ha = res * res / 1e4
    luas = {k: round(float((sev == k).sum() * px_ha), 2) for k in (1, 2, 3)}
    wid = f'{site["id"]}_{win["awal"]}'
    # pratinjau sebelum/sesudah (true color, 20 m)
    if Rpre is not None and Rpost is not None and final.any():
        png(Rpre, os.path.join(OUT, f"{wid}_sebelum.png")); png(Rpost, os.path.join(OUT, f"{wid}_sesudah.png"))
        from PIL import Image
        m = Image.fromarray((final * 255).astype("uint8")); m.save(os.path.join(OUT, f"{wid}_masker.png"), optimize=True)
    return {"status": "selesai", "id": wid, "cerah_persen": round(clear * 100), "luas_ha": round(sum(luas.values()), 2),
            "luas_rendah_sedang_ha": luas[1], "luas_sedang_tinggi_ha": luas[2], "luas_tinggi_ha": luas[3],
            "bbox_wgs84": [round(v, 5) for v in bbox], "citra_sebelum": [f["id"] for f in pre], "citra_sesudah": [f["id"] for f in post],
            "tanggal_sebelum": sorted(f["properties"]["datetime"][:10] for f in pre), "tanggal_sesudah": sorted(f["properties"]["datetime"][:10] for f in post),
            "_polys": [(mapping(stf(to_wgs, g)), v, round(g.area / 1e4, 3), g) for g, v in polys]}

def main():
    geo = json.load(open(os.path.join(DATA, "geo.json"))); S = geo["sites"]
    kj = json.load(open(os.path.join(DATA, "kejadian.json"))); K = kj["kolom"]; ids = kj["lokasi"]
    E = [dict(zip(K, r)) for r in kj["baris"]]
    idx_f = os.path.join(OUT, "indeks.json")
    idx = json.load(open(idx_f)) if os.path.exists(idx_f) else {"musim": {}}
    gj_f = os.path.join(OUT, "bekas_terbakar.geojson")
    gj = json.load(open(gj_f)) if os.path.exists(gj_f) else {"type": "FeatureCollection", "features": []}
    budget = float(sys.argv[sys.argv.index("--menit") + 1]) * 60 if "--menit" in sys.argv else 25 * 60; t0 = time.time()
    only = sys.argv[sys.argv.index("--lokasi") + 1] if "--lokasi" in sys.argv else None
    for i, site in enumerate(S):
        if only and site["id"] != only:
            continue
        k = ids.index(site["id"])
        ev = [e for e in E if e["ls"] and e["ls"][k] <= 5 and e["mulai_wib"][:10] >= MULAI]
        for w in windows(ev):
            wid = f'{site["id"]}_{w["awal"]}'
            old = idx["musim"].get(wid)
            if old and old.get("status") == "selesai" and old.get("akhir") == w["akhir"] and old.get("n_kejadian") == len(w["ev"]):
                continue
            if old and old.get("dicoba_utc", "")[:10] == datetime.date.today().isoformat():
                continue
            if old and old.get("status") in ("tertutup awan", "belum ada citra") and old.get("akhir") == w["akhir"] and \
               (datetime.date.today() - datetime.date.fromisoformat(w["akhir"])).days > POST_DAYS + 15:
                continue  # jendela citra sesudah api sudah lewat: tidak akan ada citra baru
            if time.time() - t0 > budget:
                print("batas waktu tercapai; dilanjutkan pada run berikutnya"); break
            print(wid, w["awal"], "–", w["akhir"], len(w["ev"]), "kejadian")
            try:
                r = analyse(site, w, old)
            except Exception as e:
                r = {"status": "gagal", "galat": str(e)[:200]}
            polys = r.pop("_polys", [])
            r.update({"lokasi": site["id"], "hd_nama": site["hd_nama"], "desa": site["desa_nama"], "awal": w["awal"], "akhir": w["akhir"],
                      "n_kejadian": len(w["ev"]), "n_deteksi": sum(e["jumlah_deteksi"] for e in w["ev"]),
                      "kejadian": [e["id_kejadian"] for e in w["ev"]], "dicoba_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
            idx["musim"][wid] = r
            gj["features"] = [f for f in gj["features"] if f["properties"]["musim"] != wid]
            for g, v, ha, _ in polys:
                gj["features"].append({"type": "Feature", "geometry": g, "properties": {"musim": wid, "lokasi": site["id"], "hd": site["hd_nama"], "desa": site["desa_nama"],
                    "awal_api": w["awal"], "akhir_api": w["akhir"], "keparahan": ["", "rendah–sedang", "sedang–tinggi", "tinggi"][v], "luas_ha": ha,
                    "metode": "dNBR Sentinel-2 >= 0,27 (Key & Benson 2006), <= 1 km dari deteksi NASA FIRMS, >= 0,5 ha"}})
            print("  ", r.get("status"), r.get("luas_ha"), "ha", r.get("cerah_persen"), "% cerah")
            json.dump(idx, open(idx_f, "w"), indent=1, ensure_ascii=False)
            json.dump(gj, open(gj_f, "w"), separators=(",", ":"), ensure_ascii=False)
    idx["diperbarui_utc"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    idx["metode"] = __doc__.strip()
    json.dump(idx, open(idx_f, "w"), indent=1, ensure_ascii=False)
    write_shp(gj, S)

def write_shp(gj, S):
    import shapefile
    from shapely.geometry import shape as shp
    from shapely.ops import transform as stf
    from pyproj import Transformer
    to_utm = Transformer.from_crs(4326, 32649, always_xy=True).transform
    prj = 'PROJCS["WGS_1984_UTM_Zone_49N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",111.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
    for site in S:
        F = [f for f in gj["features"] if f["properties"]["lokasi"] == site["id"]]
        base = f'bekas_terbakar_{site["id"]}'; tmp = os.path.join("/tmp", base)
        w = shapefile.Writer(tmp, shapeType=shapefile.POLYGON, encoding="utf-8")
        for fd in [("MUSIM", "C", 40), ("HD", "C", 60), ("DESA", "C", 40), ("AWAL_API", "C", 10), ("AKHIR_API", "C", 10), ("KEPARAHAN", "C", 20), ("LUAS_HA", "N", 12, 3), ("METODE", "C", 120)]:
            w.field(*fd)
        for f in F:
            g = stf(to_utm, shp(f["geometry"])); parts = []
            for p in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
                parts.append(list(p.exterior.coords)[::-1] if p.exterior.is_ccw else list(p.exterior.coords))
                for h in p.interiors:
                    parts.append(list(h.coords) if h.is_ccw else list(h.coords)[::-1])
            w.poly(parts); pr = f["properties"]
            w.record(pr["musim"], pr["hd"], pr["desa"], pr["awal_api"], pr["akhir_api"], pr["keparahan"], pr["luas_ha"], pr["metode"])
        w.close()
        with zipfile.ZipFile(os.path.join(EXP, base + "_UTM49N_shp.zip"), "w", zipfile.ZIP_DEFLATED) as z:
            for ext in ("shp", "shx", "dbf"):
                zi = zipfile.ZipInfo(f"{base}.{ext}", date_time=(2026, 1, 1, 0, 0, 0)); z.writestr(zi, open(f"{tmp}.{ext}", "rb").read())
            z.writestr(zipfile.ZipInfo(f"{base}.prj", date_time=(2026, 1, 1, 0, 0, 0)), prj); z.writestr(zipfile.ZipInfo(f"{base}.cpg", date_time=(2026, 1, 1, 0, 0, 0)), "UTF-8")

if __name__ == "__main__":
    main()
