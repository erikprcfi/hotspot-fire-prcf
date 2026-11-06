"""
Perubahan tutupan hutan TAHUN BERJALAN dari citra Sentinel-2 (untuk tahun yang belum ada data tahunan Hansen) – Pantau Rimbak PRCF
==================================================================================================================================
Acuan kelas: Peta Penutupan Lahan resmi KLHK TERBARU (data/klhk/<lokasi>_<tahun>.geojson; kini 2025).
Hutan acuan: tajuk 2000 ≥ 30% dan BELUM hilang s.d. 2025 menurut Hansen GFC v1.13 (jadi kehilangan 2001–2025 tidak terhitung dua kali).
Citra: Sentinel-2 L2A (ESA Copernicus, Earth Search AWS), 20 m. TERKINI = 150 hari terakhir tahun berjalan (4 citra paling cerah),
ACUAN = 150 hari yang sama tahun sebelumnya (musim sama). Piksel berubah bila NBR turun ≥ 0,27, SWIR2 naik ≥ 0,02 dan NBR terkini ≤ 0,30
(metode sama dengan Peringatan Hutan), petak ≥ 0,5 ha. Setiap piksel berubah diberi kode kelas KLHK terbaru → dipakai alat Tutupan Lahan
dan Emisi Karbon FREL untuk tahun berjalan (diberi tanda "indikasi citra", menunggu rilis data tahunan resmi).
Keluaran: data/analisis/citra_tahun_berjalan.json  (+ data/analisis/citra_tahun_berjalan.geojson)
"""
import os, sys, json, math, datetime
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bekas_terbakar as BT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "analisis")
VER = "GFC-2025-v1.13"; GFC = f"/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/{VER}/Hansen_{VER}_"
TAHUN_HANSEN = 2025

def run_site(site, today, hari=150):
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
    hd = unary_union([shape(f["geometry"]) for f in site["hd"]["features"]]); hdu = stf(to_utm, hd)
    x0, y0, x1, y1 = hdu.buffer(100).bounds; res = 20.0; W, H = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res)); tr = from_origin(x0, y1, res, res)
    inhd = features.rasterize([(mapping(hdu), 1)], out_shape=(H, W), transform=tr).astype(bool)
    import re as _re
    T_ = [int(m.group(1)) for f in os.listdir(os.path.join(DATA, "klhk")) for m in [_re.match(rf"^{site['id']}_(\d{{4}})\.geojson$", f)] if m]
    pk = os.path.join(DATA, "klhk", f"{site['id']}_{max(T_) if T_ else 2020}.geojson")
    if not os.path.exists(pk): return {"status": "peta KLHK belum ada"}, []
    K = json.load(open(pk)); km = features.rasterize([(mapping(stf(to_utm, shape(f["geometry"]))), int(f["properties"]["kode"])) for f in K["features"]], out_shape=(H, W), transform=tr, fill=0, dtype="int32")
    lo0, la0 = to_wgs(x0, y0); lo1, la1 = to_wgs(x1, y1)
    tile = f"{int(math.ceil(la1 / 10) * 10):02d}N_{int(math.floor(lo0 / 10) * 10):03d}E"
    tc = np.zeros((H, W), "uint8"); ly = np.zeros((H, W), "uint8")
    for nm, arr in (("treecover2000", tc), ("lossyear", ly)):
        with rasterio.open(GFC + f"{nm}_{tile}.tif") as src:
            reproject(rasterio.band(src, 1), arr, dst_transform=tr, dst_crs=CRS.from_epsg(32649), resampling=Resampling.nearest)
    forest = inhd & (tc >= 30) & (ly == 0)
    a1, b1 = max(datetime.date(today.year, 1, 1), today - datetime.timedelta(days=hari)), today
    a0, b0 = a1.replace(year=a1.year - 1), b1.replace(year=b1.year - 1)
    bbox = [lo0, la0, lo1, la1]
    cur = sorted(BT.stac(bbox, a1.isoformat(), b1.isoformat()), key=lambda f: f["properties"]["eo:cloud_cover"])[:4]
    ref = sorted(BT.stac(bbox, a0.isoformat(), b0.isoformat()), key=lambda f: f["properties"]["eo:cloud_cover"])[:4]
    base = {"tahun": today.year, "periode_terkini": [a1.isoformat(), b1.isoformat()], "periode_acuan": [a0.isoformat(), b0.isoformat()],
            "hutan_acuan_ha": round(float(forest.sum()) * res * res / 1e4, 2), "dicek_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    if not cur or not ref: return {**base, "status": "belum ada citra"}, []
    P0 = BT.scenes(ref, (H, W), tr); P1 = BT.scenes(cur, (H, W), tr)
    if not P0 or not P1: return {**base, "status": "tertutup awan"}, []
    N0 = BT.med([x["nbr"] for x in P0]); S0 = BT.med([x["s2"] for x in P0])
    vn = np.zeros((H, W), "int16"); cn = np.zeros((H, W), "int16")
    for x in P1:
        v = np.isfinite(x["nbr"]) & np.isfinite(N0); vn += v
        cn += v & ((N0 - x["nbr"]) >= 0.27) & ((x["s2"] - S0) >= 0.02) & (x["nbr"] <= 0.30)
    valid = forest & (vn > 0); clear = float(valid.sum() / max(1, forest.sum()))
    base.update({"cerah_persen": round(clear * 100), "citra_terkini": [f["id"] for f in cur], "citra_acuan": [f["id"] for f in ref]})
    if clear < 0.5: return {**base, "status": "tertutup awan"}, []
    ch = valid & (cn >= np.where(vn >= 2, 2, 1)); ch = ndimage.binary_opening(ch, structure=np.ones((2, 2)))
    lab, n = ndimage.label(ch, structure=np.ones((3, 3)))
    if n:
        sz = ndimage.sum(ch, lab, range(n + 1)); keep = sz * res * res / 1e4 >= 0.5; keep[0] = False; ch = keep[lab]
    pha = res * res / 1e4; kode = {}
    for kd in np.unique(km[ch]):
        if kd: kode[str(int(kd))] = round(float((ch & (km == kd)).sum()) * pha, 4)
    feats = [{"type": "Feature", "geometry": mapping(stf(to_wgs, shape(g))), "properties": {"lokasi": site["id"], "tahun": today.year, "luas_ha": round(shape(g).area / 1e4, 2)}}
             for g, v in features.shapes(ch.astype("uint8"), mask=ch, transform=tr)]
    return {**base, "status": "selesai", "hilang_kode_ha": kode, "luas_berubah_ha": round(float(ch.sum()) * pha, 2), "jumlah_petak": len(feats)}, feats

def main():
    today = datetime.date.today()
    if today.year <= TAHUN_HANSEN: print("Tahun berjalan sudah tercakup data Hansen."); return
    geo = json.load(open(os.path.join(DATA, "geo.json"))); f = os.path.join(OUT, "citra_tahun_berjalan.json")
    out = json.load(open(f)) if os.path.exists(f) else {}
    if out.get("tahun") != today.year: out = {"tahun": today.year, "lokasi": {}}
    out["metode"] = __doc__.strip(); gj = {"type": "FeatureCollection", "features": []}
    for s in geo["sites"]:
        try: r, feats = run_site(s, today)
        except Exception as e: r, feats = {"status": "gagal", "galat": str(e)[:200]}, []
        old = out["lokasi"].get(s["id"])
        if r.get("status") == "selesai" or not old or old.get("status") != "selesai": out["lokasi"][s["id"]] = r
        gj["features"] += feats
        print(s["id"], r.get("status"), r.get("luas_berubah_ha"), r.get("cerah_persen"), r.get("hilang_kode_ha"))
    out["diperbarui_utc"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(out, open(f, "w"), ensure_ascii=False, indent=1); json.dump(gj, open(f.replace(".json", ".geojson"), "w"), separators=(",", ":"))

if __name__ == "__main__":
    main()
