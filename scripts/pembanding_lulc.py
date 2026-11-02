"""
Pembanding INDEPENDEN tutupan lahan tahunan per Hutan Desa – Fire Hotspot PRCF
==============================================================================
Sumber: Impact Observatory, Microsoft & Esri – "10m Annual Land Use Land Cover (9-class) V2" (io-lulc-annual-v02),
klasifikasi citra Sentinel-2 10 m per tahun (2017–tahun terakhir yang dirilis), lisensi CC BY 4.0, dibaca dari Microsoft Planetary Computer.
Gunanya: memeriksa silang tren alat "Tutupan lahan (KLHK)" (acuan KLHK 2020 + kehilangan tutupan pohon Hansen) dengan peta yang dibuat
setiap tahun secara terpisah. Kelasnya berbeda dengan KLHK (9 kelas global), dan hasil per tahun dapat naik-turun karena awan/banjir musiman
(akurasi global ±75–85%), jadi dipakai sebagai pembanding, bukan pengganti peta resmi KLHK. Luas dihitung dari piksel 10 m (UTM) yang
pusatnya di dalam batas Hutan Desa.
Keluaran: data/analisis/pembanding_lulc.json
"""
import os, json, urllib.request, datetime
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COL = "io-lulc-annual-v02"; PC = "https://planetarycomputer.microsoft.com/api"
NAMA = {1: "Air", 2: "Pohon", 4: "Vegetasi tergenang", 5: "Tanaman pertanian", 7: "Terbangun", 8: "Tanah terbuka", 9: "Salju/es", 10: "Awan", 11: "Semak/padang rumput"}

def main():
    import rasterio
    from rasterio.mask import mask
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    from shapely import transform as stf
    from pyproj import Transformer
    tok = json.load(urllib.request.urlopen(f"{PC}/sas/v1/token/{COL}", timeout=60))["token"]
    geo = json.load(open(os.path.join(ROOT, "data", "geo.json"))); out = {"sumber": "Impact Observatory, Microsoft & Esri – 10m Annual Land Use Land Cover (9-class) V2, Sentinel-2 10 m, CC BY 4.0 (Microsoft Planetary Computer: io-lulc-annual-v02)",
        "metode": __doc__.strip(), "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "kelas": NAMA, "lokasi": {}}
    for s in geo["sites"]:
        hd = unary_union([shape(f["geometry"]) for f in s["hd"]["features"]])
        q = json.dumps({"collections": [COL], "intersects": mapping(hd), "limit": 100}).encode()
        it = json.load(urllib.request.urlopen(urllib.request.Request(f"{PC}/stac/v1/search", q, {"Content-Type": "application/json"}), timeout=120))["features"]
        R = {}
        for f in it:
            y = f["properties"]["start_datetime"][:4]
            with rasterio.open(f["assets"]["data"]["href"] + "?" + tok) as src:
                tr = Transformer.from_crs(4326, src.crs, always_xy=True)
                g = stf(hd, lambda c: np.column_stack(tr.transform(c[:, 0], c[:, 1])))
                try: a, _ = mask(src, [mapping(g)], crop=True, filled=True, nodata=0, all_touched=False)
                except ValueError: continue
                px = abs(src.res[0] * src.res[1]) / 1e4
                for v, c in zip(*np.unique(a[0], return_counts=True)):
                    if v: k = NAMA.get(int(v), str(int(v))); R.setdefault(y, {}); R[y][k] = round(R[y].get(k, 0) + float(c) * px, 2)
        out["lokasi"][s["id"]] = {"hutan_desa": s["hd_nama"], "tahun": {y: R[y] for y in sorted(R)}}
        print(s["id"], {y: R[y].get("Pohon") for y in sorted(R)})
    json.dump(out, open(os.path.join(ROOT, "data", "analisis", "pembanding_lulc.json"), "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
