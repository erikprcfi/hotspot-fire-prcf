"""
Perbandingan peta tahunan LOKAL (sudah di-groundcheck) dengan Peta Penutupan Lahan RESMI KLHK/Kementerian Kehutanan pada tahun yang sama
=====================================================================================================================================
Untuk setiap Hutan Desa yang punya data/tutupan_lokal/<id>.json dan setiap tahun peta KLHK resmi (data/klhk/<id>_<tahun>.geojson):
luas per kelas di kedua peta, matriks tumpang-susun (lokal → KLHK), kesesuaian kelas per lokasi, kesesuaian 3 kelompok
(hutan / lahan basah bukan hutan / lahan kering bukan hutan) dan kesesuaian hutan–bukan hutan. Luas pada WGS 1984 UTM 49N, di dalam batas Hutan Desa.
Keluaran: data/tutupan_lokal/<id>_banding.json   Pemakaian: python scripts/banding_sumber.py
"""
import os, json, re, glob, datetime
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DATA = os.path.join(ROOT, "data")
HUTAN = {2001, 2002, 2004, 20041, 2005, 20051, 2006}; BASAH = {5001, 50011, 20071, 20094}
KEL = lambda k: "hutan" if k in HUTAN else "basah" if k in BASAH else "kering"

def main():
    import shapely
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from pyproj import Transformer
    TR = Transformer.from_crs(4326, 32649, always_xy=True)
    U = lambda g: shapely.transform(g, lambda c: np.column_stack(TR.transform(c[:, 0], c[:, 1])))
    geo = {s["id"]: s for s in json.load(open(os.path.join(DATA, "geo.json")))["sites"]}
    for fj in glob.glob(os.path.join(DATA, "tutupan_lokal", "*.json")):
        lok = os.path.basename(fj)[:-5]
        if lok not in geo: continue
        L = json.load(open(fj)); s = geo[lok]
        hd = U(unary_union([shape(f["geometry"]) for f in s["hd"]["features"]]).buffer(0))
        def muat(p):
            d = {}
            for f in json.load(open(p))["features"]:
                g = U(shape(f["geometry"]).buffer(0)).intersection(hd); k = int(f["properties"]["kode"])
                if not g.is_empty: d[k] = unary_union([d[k], g]) if k in d else g
            return d
        out = {"lokasi": lok, "sumber_lokal": L.get("nama"), "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "metode": __doc__.strip(), "tahun": {}}
        for f in sorted(glob.glob(os.path.join(DATA, "klhk", f"{lok}_*.geojson"))):
            m = re.match(rf"^{lok}_(\d{{4}})\.geojson$", os.path.basename(f))
            if not m: continue
            y = int(m.group(1)); pl = os.path.join(DATA, "tutupan_lokal", f"{lok}_{y}.geojson")
            if not os.path.exists(pl): continue
            P, K = muat(pl), muat(f); tot = sum(g.area for g in P.values())
            mat = [[a, b, round(ga.intersection(gb).area / 1e4, 4)] for a, ga in P.items() for b, gb in K.items() if ga.intersects(gb) and ga.intersection(gb).area / 1e4 >= 0.01]
            grp = lambda D: {k: unary_union([g for c, g in D.items() if KEL(c) == k]) for k in ("hutan", "basah", "kering") if any(KEL(c) == k for c in D)}
            PG, KG = grp(P), grp(K)
            out["tahun"][str(y)] = {"luas_lokal": {str(k): round(g.area / 1e4, 4) for k, g in P.items()}, "luas_klhk": {str(k): round(g.area / 1e4, 4) for k, g in K.items()}, "matriks": mat,
                "sesuai_kelas_persen": round(sum(x[2] for x in mat if x[0] == x[1]) * 1e4 / tot * 100, 1),
                "sesuai_kelompok_persen": round(sum(PG[k].intersection(KG[k]).area for k in PG if k in KG) / tot * 100, 1),
                "sesuai_hutan_persen": round((tot - (PG.get("hutan", shapely.Polygon()).symmetric_difference(KG.get("hutan", shapely.Polygon()))).area) / tot * 100, 1),
                "hutan_lokal_ha": round(PG["hutan"].area / 1e4, 4) if "hutan" in PG else 0, "hutan_klhk_ha": round(KG["hutan"].area / 1e4, 4) if "hutan" in KG else 0}
            print(lok, y, {k: v for k, v in out["tahun"][str(y)].items() if k.startswith("sesuai") or k.startswith("hutan")})
        json.dump(out, open(os.path.join(DATA, "tutupan_lokal", f"{lok}_banding.json"), "w"), ensure_ascii=False, separators=(",", ":"))

if __name__ == "__main__":
    main()
