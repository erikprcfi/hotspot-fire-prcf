"""
Peta tutupan lahan TAHUNAN (vektor) per Hutan Desa – Pantau Rimbak PRCF
======================================================================
Untuk unduhan SHP alat "Tutupan lahan (KLHK)". Satu berkas per Hutan Desa: data/klhk/tahunan/<lokasi>.geojson berisi
  – bagian TETAP: poligon Peta Penutupan Lahan KLHK TERBARU (tahun t, kini 2025; dahulu 2020) ∩ batas Hutan Desa, dikurangi semua piksel yang berubah (th = 0);
  – PETAK BERUBAH: piksel kehilangan tutupan pohon Hansen/UMD GFC-2025-v1.13 (tajuk 2000 ≥ 30 %, grid 0,00025°, piksel masuk bila
    pusatnya di dalam Hutan Desa – sama persis dengan scripts/analisis_inti.py) dikelompokkan menurut kode kelas KLHK tahun t & tahun hilang;
    ditambah petak perubahan tahun berjalan dari citra Sentinel-2 (data/analisis/citra_tahun_berjalan.geojson, "indikasi").
Aplikasi menyusun peta tahun Y dari berkas ini dengan aturan yang sama dengan assets/model_klhk.js (alat Tutupan lahan & Emisi karbon):
  Y ≥ t: petak hilang tahun t..Y di HLK Primer→HLK Sekunder, HLK Sekunder→PLK Campur Semak, HR Primer→HR Sekunder, HR Sekunder→Belukar Rawa.
  Y < t: petak hilang tahun Y+1..t−1 yang di peta t sudah bukan hutan dikembalikan ke HR Sekunder (kelas basah) / HLK Sekunder (lainnya).
Pemakaian: python scripts/tutupan_tahunan.py [lokasi ...]
"""
import os, sys, json, math, re
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analisis_inti import HAN, _tiles

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "klhk", "tahunan")

def terbaru(lokasi):   # tahun peta KLHK terbaru yang tersedia untuk lokasi (data/klhk/<lokasi>_<tahun>.geojson)
    T = [int(m.group(1)) for f in os.listdir(os.path.join(DATA, "klhk")) for m in [re.match(rf"^{lokasi}_(\d{{4}})\.geojson$", f)] if m]
    return max(T) if T else None

def geod_ha(g):
    from pyproj import Geod
    return abs(Geod(ellps="WGS84").geometry_area_perimeter(g)[0]) / 1e4

def bersih(g, nd=7):
    from shapely import set_precision
    from shapely.geometry import Polygon, MultiPolygon
    g = set_precision(g.buffer(0), 10 ** -nd)
    P = [p for p in (g.geoms if hasattr(g, "geoms") else [g]) if isinstance(p, Polygon) and p.area > 1e-12]
    return MultiPolygon(P) if len(P) > 1 else (P[0] if P else None)

def run(site, citra):
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio import features
    from shapely.geometry import shape, mapping, box
    from shapely.ops import unary_union
    hd = unary_union([shape(f["geometry"]) for f in site["hd"]["features"]]).buffer(0)
    tp = terbaru(site["id"]); K = json.load(open(os.path.join(DATA, "klhk", f"{site['id']}_{tp}.geojson")))
    kl = [(shape(f["geometry"]).buffer(0).intersection(hd), int(f["properties"]["kode"])) for f in K["features"]]
    kl = [(g, k) for g, k in kl if not g.is_empty]
    grup = {}   # (kode, tahun) -> [geom pixel ...]
    for tile, tb in _tiles(hd.bounds):
        g = hd.intersection(box(*tb))
        if g.is_empty: continue
        x0, y0, x1, y1 = g.bounds
        def rd(url):
            with rasterio.open(url) as src:
                f = from_bounds(x0, y0, x1, y1, src.transform)
                c0, r0 = math.floor(f.col_off), math.floor(f.row_off); c1, r1 = math.ceil(f.col_off + f.width), math.ceil(f.row_off + f.height)
                w = rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0).intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                return src.read(1, window=w), src.window_transform(w)
        tc, tr = rd(HAN.format("treecover2000", tile)); ly, t2 = rd(HAN.format("lossyear", tile)); H, W = tc.shape
        assert ly.shape == (H, W) and abs(t2.c - tr.c) < 1e-9 and abs(t2.f - tr.f) < 1e-9
        m = features.rasterize([(mapping(g), 1)], out_shape=(H, W), transform=tr, fill=0, all_touched=False).astype(bool)
        P = [(mapping(pg.intersection(g)), kd) for pg, kd in kl if pg.intersects(g)]
        km = features.rasterize(P, out_shape=(H, W), transform=tr, fill=0, all_touched=False, dtype="int32")
        hl = (tc >= 30) & m & (ly > 0) & (km > 0)
        code = np.where(hl, km * 100 + ly.astype("int32"), 0).astype("int32")
        for geom, v in features.shapes(code, mask=hl, transform=tr):
            v = int(v); grup.setdefault((v // 100, 2000 + v % 100), []).append(shape(geom))
    # tahun berjalan (Sentinel-2): petak citra ∩ kelas KLHK
    cg = [shape(f["geometry"]).buffer(0) for f in (citra or {}).get("features", []) if f["properties"].get("lokasi") == site["id"]]
    cy = max([f["properties"].get("tahun", 0) for f in (citra or {}).get("features", [])] or [0])
    if cg:
        cu = unary_union(cg).intersection(hd)
        for pg, kd in kl:
            x = cu.intersection(pg)
            if not x.is_empty: grup.setdefault((kd, cy), []).append(x)
    feats = []; semua = []
    for (kd, y), L in sorted(grup.items()):
        u = bersih(unary_union(L).intersection(hd))
        if u is None: continue
        semua.append(u); feats.append({"type": "Feature", "properties": {"k": kd, "th": y, "src": "S2" if y > 2025 else "GFC", "ha": round(geod_ha(u), 4)}, "geometry": mapping(u)})
    ubah = unary_union(semua) if semua else None
    tetap = []
    for pg, kd in kl:
        x = pg.difference(ubah) if ubah is not None else pg
        x = bersih(x)
        if x is not None: tetap.append({"type": "Feature", "properties": {"k": kd, "th": 0, "src": "KLHK", "ha": round(geod_ha(x), 4)}, "geometry": mapping(x)})
    os.makedirs(OUT, exist_ok=True)
    out = {"type": "FeatureCollection", "lokasi": site["id"], "hutan_desa": site["hd_nama"], "tahun_peta": tp, "tahun_citra": cy or None,
           "sumber": [f"Peta Penutupan Lahan KLHK {tp} (1:250.000)", "Hansen/UMD/Google/USGS/NASA GFC-2025-v1.13 (lossyear, treecover2000 ≥ 30%)", "Sentinel-2 L2A ESA Copernicus (tahun berjalan, indikasi)"],
           "features": tetap + feats}
    json.dump(out, open(os.path.join(OUT, f"{site['id']}.geojson"), "w"), separators=(",", ":"))
    return len(tetap), len(feats), round(sum(f["properties"]["ha"] for f in out["features"]), 2)

def main():
    geo = json.load(open(os.path.join(DATA, "geo.json"))); pilih = sys.argv[1:]
    pc = os.path.join(DATA, "analisis", "citra_tahun_berjalan.geojson"); citra = json.load(open(pc)) if os.path.exists(pc) else None
    for s in geo["sites"]:
        if pilih and s["id"] not in pilih: continue
        if not terbaru(s["id"]): print(s["id"], "peta KLHK belum ada"); continue
        print(s["id"], *run(s, citra))

if __name__ == "__main__":
    main()
