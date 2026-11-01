"""
Impor Peta Penutupan Lahan KLHK dari berkas SHP/ZIP (mis. PL_2020_AR_250K Kalimantan Barat) → data/klhk/<lokasi>_<tahun>.geojson
Dipakai bila layanan peta KLHK tidak dapat dijangkau otomatis. Kelas dibaca dari kolom kode baku KLHK (PL20_ID, PL2020_ID, KODE, ...).
Pemakaian: python scripts/impor_klhk.py <berkas.zip|berkas.shp> <tahun>
Lalu: python scripts/karbon_lahan.py && python scripts/uji_karbon.py
"""
import os, sys, json, zipfile, tempfile, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tutupan_klhk import KODE, _kode, potong, OUT, ROOT

def baca(path):
    import shapefile   # pyshp
    from pyproj import CRS, Transformer
    from shapely.geometry import shape
    from shapely.ops import transform
    tmp = None
    if path.lower().endswith(".zip"):
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(path).extractall(tmp)
        shp = [os.path.join(r, f) for r, _, fs in os.walk(tmp) for f in fs if f.lower().endswith(".shp")]
        if not shp: raise SystemExit("ZIP tidak berisi .shp")
        path = shp[0]
    prj = path[:-4] + ".prj"; tr = None
    if os.path.exists(prj):
        crs = CRS.from_wkt(open(prj).read())
        if crs.to_epsg() != 4326: tr = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform
    r = shapefile.Reader(path); flds = [f[0] for f in r.fields[1:]]; out = []
    for sr in r.iterShapeRecords():
        c = _kode(dict(zip(flds, sr.record)))
        if c is None: continue
        g = shape(sr.shape.__geo_interface__)
        if tr: g = transform(tr, g)
        out.append({"type": "Feature", "properties": {"kode": c, "kelas": KODE[c]}, "geometry": g.buffer(0).__geo_interface__})
    return out

def main():
    if len(sys.argv) < 3: raise SystemExit(__doc__)
    from shapely.geometry import shape, box
    from shapely.ops import unary_union
    src, y = sys.argv[1], int(sys.argv[2]); F = baca(src); print(len(F), "poligon berkode KLHK dibaca")
    os.makedirs(OUT, exist_ok=True); ip = os.path.join(OUT, "indeks.json")
    idx = json.load(open(ip)) if os.path.exists(ip) else {"sumber": "Peta Penutupan Lahan KLHK (Direktorat IPSDH, Ditjen PKTL), skala 1:250.000", "lokasi": {}}
    idx.setdefault("berkas", {})[str(y)] = os.path.basename(src); idx["diimpor_utc"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    geo = json.load(open(os.path.join(ROOT, "data", "geo.json")))
    for s in geo["sites"]:
        hd = unary_union([shape(f["geometry"]) for f in s["hd"]["features"]]).buffer(0); x0, y0, x1, y1 = hd.bounds; d = 0.01
        area = box(x0 - d, y0 - d, x1 + d, y1 + d); P = potong([f for f in F if shape(f["geometry"]).intersects(area)], area)
        if not P: print(" ", s["id"], "tidak tercakup peta ini"); continue
        json.dump({"type": "FeatureCollection", "tahun": y, "sumber": os.path.basename(src), "features": P}, open(os.path.join(OUT, f"{s['id']}_{y}.geojson"), "w"), separators=(",", ":"))
        idx["lokasi"].setdefault(s["id"], {})[str(y)] = len(P); print(" ", s["id"], y, len(P), "poligon")
    json.dump(idx, open(ip, "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
