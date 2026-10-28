"""
Kehilangan tutupan pohon tahunan 2001–2025 per lokasi – Fire Hotspot PRCF
==========================================================================
Sumber: Hansen/UMD/Google/USGS/NASA Global Forest Change v1.13 (2000–2025), Hansen et al. 2013, Science 342:850–853.
https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/download.html  (data terbuka, CC BY 4.0)
  treecover2000 : % tutupan tajuk tahun 2000; hutan = tutupan >= 30% (ambang baku Global Forest Watch)
  lossyear      : 1–25 = tahun kehilangan 2001–2025, 0 = tidak ada kehilangan
Luas piksel dihitung geodesik (30 m busur ±0,077 ha di khatulistiwa). Zona: Hutan Desa, desa di luar HD, cincin 0–5 km.
Keluaran: data/hutan/kehilangan.json
"""
import os, json, math, datetime
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "hutan"); os.makedirs(OUT, exist_ok=True)
VER = "GFC-2025-v1.13"; BASE = f"/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/{VER}/Hansen_{VER}_"
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")

def main():
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio import features
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    geo = json.load(open(os.path.join(DATA, "geo.json")))
    res = {"sumber": f"Hansen/UMD/Google/USGS/NASA Global Forest Change {VER} (Hansen et al. 2013, Science 342:850–853), CC BY 4.0",
           "definisi": "Hutan = tutupan tajuk tahun 2000 >= 30%. Kehilangan = hilangnya tutupan pohon (penebangan, kebakaran, pembukaan, kerusakan alami); bukan selalu deforestasi permanen.",
           "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "lokasi": {}}
    for s in geo["sites"]:
        hd = unary_union([shape(f["geometry"]) for f in s["hd"]["features"]]).buffer(0)
        ds = unary_union([shape(f["geometry"]) for f in s["desa"]["features"]]).buffer(0)
        b5 = unary_union([shape(f["geometry"]) for f in s["buf5"]["features"]])
        area = unary_union([hd, ds]); ring = b5.difference(area); desa_only = ds.difference(hd)
        x0, y0, x1, y1 = b5.bounds
        tile = f"{int(math.ceil(y1 / 10) * 10):02d}N_{int(math.floor(x0 / 10) * 10):03d}E"
        with rasterio.open(BASE + f"treecover2000_{tile}.tif") as src:
            w = from_bounds(x0, y0, x1, y1, src.transform).round_offsets().round_lengths(); tc = src.read(1, window=w); tr = src.window_transform(w)   # jendela piksel utuh, tanpa resampling
        with rasterio.open(BASE + f"lossyear_{tile}.tif") as src:
            ly = src.read(1, window=w)
        H, W = tc.shape
        R = 6371008.8; dlon = math.radians(abs(tr.a)); lat_top = tr.f; dlat = abs(tr.e)
        rows = np.arange(H); la1 = np.radians(lat_top - rows * dlat); la2 = np.radians(lat_top - (rows + 1) * dlat)
        pix_ha = (R * R * dlon * np.abs(np.sin(la1) - np.sin(la2)) / 1e4)[:, None] * np.ones((1, W))
        forest = tc >= 30
        out = {}
        for nm, g in [("hutan_desa", hd), ("desa_di_luar_hd", desa_only), ("radius_0_5km", ring)]:
            m = features.rasterize([(mapping(g), 1)], out_shape=(H, W), transform=tr, fill=0, all_touched=False).astype(bool)
            f0 = float((pix_ha * (m & forest)).sum())
            per = {str(2000 + y): round(float((pix_ha * (m & forest & (ly == y))).sum()), 2) for y in range(1, 26)}
            tot = sum(per.values())
            out[nm] = {"luas_wilayah_ha": round(float((pix_ha * m).sum()), 1), "hutan_2000_ha": round(f0, 1), "kehilangan_per_tahun_ha": per,
                       "kehilangan_total_ha": round(tot, 1), "hutan_tersisa_2025_ha": round(f0 - tot, 1), "persen_hilang": round(100 * tot / f0, 2) if f0 else None}
        res["lokasi"][s["id"]] = {"hd_nama": s["hd_nama"], "desa": s["desa_nama"], "ubin": tile, **out}
        print(s["id"], {k: (v["hutan_2000_ha"], v["kehilangan_total_ha"]) for k, v in out.items()})
    json.dump(res, open(os.path.join(OUT, "kehilangan.json"), "w"), indent=1, ensure_ascii=False)

if __name__ == "__main__":
    main()
