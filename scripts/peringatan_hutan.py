"""
Peringatan kehilangan tutupan hutan terbaru (Sentinel-2) – Fire Hotspot PRCF
============================================================================
Untuk setiap lokasi (Hutan Desa + desa + radius 1 km), sebulan sekali:
  * Hutan acuan = tutupan tajuk 2000 >= 30% dan BELUM hilang s.d. 2025 (Hansen/UMD GFC v1.13).
  * Citra Sentinel-2 L2A (ESA Copernicus, Earth Search AWS): TERKINI = 90 hari terakhir,
    ACUAN = 90 hari yang sama tahun lalu (musim sama, mengurangi efek musiman).
  * Piksel berubah bila, di >= 2 citra terkini (atau 1 bila hanya 1 yang cerah):
      NBR turun >= 0,27 dan SWIR2 naik >= 0,02 (pembukaan/kerusakan tajuk; bayangan & air tidak lolos),
    serta NBR terkini <= 0,30 (tajuk benar-benar terbuka). Petak >= 0,5 ha.
  * Wilayah cerah < 50% → ditandai "tertutup awan".
Hasil adalah INDIKASI perubahan tutupan dari citra 20 m (pembukaan lahan, tebangan, kebakaran,
longsor, dll.) dan memerlukan verifikasi lapangan.
Keluaran: data/hutan/peringatan.json, data/hutan/peringatan.geojson
"""
import os, sys, json, math, time, datetime
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bekas_terbakar as BT  # pakai pembaca citra & STAC yang sama

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "hutan"); os.makedirs(OUT, exist_ok=True)
VER = "GFC-2025-v1.13"; GFC = f"/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/{VER}/Hansen_{VER}_"

def run_site(site, today):
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.crs import CRS
    from rasterio.transform import from_origin
    from rasterio import features
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union, transform as stf
    from pyproj import Transformer
    from scipy import ndimage
    to_utm = Transformer.from_crs(4326, 32649, always_xy=True).transform; to_wgs = Transformer.from_crs(32649, 4326, always_xy=True).transform
    area = unary_union([shape(f["geometry"]) for f in site["hd"]["features"]] + [shape(f["geometry"]) for f in site["desa"]["features"]])
    au = stf(to_utm, area).buffer(1000); hdu = stf(to_utm, unary_union([shape(f["geometry"]) for f in site["hd"]["features"]]))
    x0, y0, x1, y1 = au.bounds; res = 20.0; W, H = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res)); tr = from_origin(x0, y1, res, res)
    zone = features.rasterize([(mapping(au), 1)], out_shape=(H, W), transform=tr).astype(bool)
    inhd = features.rasterize([(mapping(hdu), 1)], out_shape=(H, W), transform=tr).astype(bool)
    # hutan acuan (Hansen)
    lo0, la0 = to_wgs(x0, y0); lo1, la1 = to_wgs(x1, y1)
    tile = f"{int(math.ceil(la1 / 10) * 10):02d}N_{int(math.floor(lo0 / 10) * 10):03d}E"
    tc = np.zeros((H, W), "uint8"); ly = np.zeros((H, W), "uint8")
    for nm, arr in (("treecover2000", tc), ("lossyear", ly)):
        with rasterio.open(GFC + f"{nm}_{tile}.tif") as src:
            reproject(rasterio.band(src, 1), arr, dst_transform=tr, dst_crs=CRS.from_epsg(32649), resampling=Resampling.nearest)
    forest = zone & (tc >= 30) & (ly == 0)
    bbox = [lo0, la0, lo1, la1]
    a1, b1 = today - datetime.timedelta(days=90), today
    a0, b0 = a1 - datetime.timedelta(days=365), b1 - datetime.timedelta(days=365)
    cur = sorted(BT.stac(bbox, a1.isoformat(), b1.isoformat()), key=lambda f: f["properties"]["eo:cloud_cover"])[:4]
    ref = sorted(BT.stac(bbox, a0.isoformat(), b0.isoformat()), key=lambda f: f["properties"]["eo:cloud_cover"])[:4]
    base = {"lokasi": site["id"], "hd_nama": site["hd_nama"], "desa": site["desa_nama"], "periode_terkini": [a1.isoformat(), b1.isoformat()], "periode_acuan": [a0.isoformat(), b0.isoformat()],
            "hutan_acuan_ha": round(float(forest.sum()) * res * res / 1e4, 1), "dicek_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    if not cur or not ref:
        return {**base, "status": "belum ada citra"}, []
    P0 = BT.scenes(ref, (H, W), tr); P1 = BT.scenes(cur, (H, W), tr)
    if not P0 or not P1:
        return {**base, "status": "tertutup awan"}, []
    N0 = BT.med([x["nbr"] for x in P0]); S0 = BT.med([x["s2"] for x in P0])
    vn = np.zeros((H, W), "int16"); cn = np.zeros((H, W), "int16")
    for x in P1:
        v = np.isfinite(x["nbr"]) & np.isfinite(N0); vn += v
        cn += v & ((N0 - x["nbr"]) >= 0.27) & ((x["s2"] - S0) >= 0.02) & (x["nbr"] <= 0.30)
    valid = forest & (vn > 0); clear = float(valid.sum() / max(1, forest.sum()))
    base.update({"cerah_persen": round(clear * 100), "citra_terkini": [f["id"] for f in cur], "citra_acuan": [f["id"] for f in ref],
                 "tanggal_terkini": sorted(f["properties"]["datetime"][:10] for f in cur), "tanggal_acuan": sorted(f["properties"]["datetime"][:10] for f in ref)})
    if clear < 0.5:
        return {**base, "status": "tertutup awan"}, []
    ch = valid & (cn >= np.where(vn >= 2, 2, 1))
    ch = ndimage.binary_opening(ch, structure=np.ones((2, 2)))
    lab, n = ndimage.label(ch, structure=np.ones((3, 3)))
    if n:
        sz = ndimage.sum(ch, lab, range(n + 1)); keep = sz * res * res / 1e4 >= 0.5; keep[0] = False; ch = keep[lab]
    feats = []
    for g, v in features.shapes(ch.astype("uint8"), mask=ch, transform=tr):
        gu = shape(g); ha = gu.area / 1e4; c = gu.centroid
        feats.append({"type": "Feature", "geometry": mapping(stf(to_wgs, gu)), "properties": {"lokasi": site["id"], "hd": site["hd_nama"], "desa": site["desa_nama"],
            "luas_ha": round(ha, 2), "di_hutan_desa": bool(hdu.contains(c)), "periode": f"{a1.isoformat()} s.d. {b1.isoformat()}", "dibanding": f"{a0.isoformat()} s.d. {b0.isoformat()}",
            "metode": "Sentinel-2: NBR turun >= 0,27, SWIR2 naik >= 0,02, NBR terkini <= 0,30, di hutan Hansen 2025, >= 0,5 ha"}})
    tot = sum(f["properties"]["luas_ha"] for f in feats); thd = sum(f["properties"]["luas_ha"] for f in feats if f["properties"]["di_hutan_desa"])
    return {**base, "status": "selesai", "luas_berubah_ha": round(tot, 2), "luas_berubah_di_hd_ha": round(thd, 2), "jumlah_petak": len(feats)}, feats

def main():
    geo = json.load(open(os.path.join(DATA, "geo.json")))
    f_idx = os.path.join(OUT, "peringatan.json"); f_gj = os.path.join(OUT, "peringatan.geojson")
    idx = json.load(open(f_idx)) if os.path.exists(f_idx) else {"lokasi": {}}
    gj = json.load(open(f_gj)) if os.path.exists(f_gj) else {"type": "FeatureCollection", "features": []}
    today = datetime.date.today(); force = "--paksa" in sys.argv
    for s in geo["sites"]:
        old = idx["lokasi"].get(s["id"])
        if old and not force:
            age = (today - datetime.date.fromisoformat(old["dicek_utc"][:10])).days
            if (old.get("status") == "selesai" and age < 28) or age < 1:
                continue
        print(s["id"])
        try:
            r, feats = run_site(s, today)
        except Exception as e:
            r, feats = {"lokasi": s["id"], "status": "gagal", "galat": str(e)[:200], "dicek_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}, []
        if r.get("status") == "selesai" or not old or old.get("status") != "selesai":
            idx["lokasi"][s["id"]] = r
            if r.get("status") == "selesai":
                gj["features"] = [f for f in gj["features"] if f["properties"]["lokasi"] != s["id"]] + feats
        print("  ", r.get("status"), r.get("luas_berubah_ha"), "ha;", r.get("luas_berubah_di_hd_ha"), "ha di HD;", r.get("cerah_persen"), "% cerah")
        json.dump(idx, open(f_idx, "w"), indent=1, ensure_ascii=False); json.dump(gj, open(f_gj, "w"), separators=(",", ":"), ensure_ascii=False)
    idx["metode"] = __doc__.strip(); idx["diperbarui_utc"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(idx, open(f_idx, "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    main()
