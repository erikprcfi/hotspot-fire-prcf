"""Batas kabupaten/kota se-Indonesia (gabungan poligon desa OCHA COD-AB / BPS-BIG di data/wilayah) → data/wilayah/kabupaten.geojson
Dipakai scripts/ringkas_nasional.py untuk menghitung titik panas per provinsi & kabupaten. Disederhanakan 0,003° (±300 m). Dijalankan sekali."""
import os, json
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "wilayah")
idx = json.load(open(os.path.join(root, "indeks.json"))); F = []
for p in idx["provinsi"]:
    J = json.load(open(os.path.join(root, p["file"]))); K = {}
    for d in J["desa"]:
        kab = J["kec"].get(d[2], [None, None])[1]
        if not kab: continue
        for r in d[5]:
            x = y = 0; pts = []
            for i in range(0, len(r), 2): x += r[i]; y += r[i + 1]; pts.append((x / 1e5, y / 1e5))
            if len(pts) >= 3:
                try: K.setdefault(kab, []).append(Polygon(pts).buffer(0))
                except Exception: pass
    for kab, P in K.items():
        g = unary_union(P).buffer(0.001, 2).buffer(-0.001, 2).simplify(0.003)
        nm, prov = J["kab"].get(kab, [kab, J["prov"]])
        F.append({"type": "Feature", "properties": {"kode": kab, "kab": nm, "prov": prov or J["prov"], "kode_prov": p["kode"]}, "geometry": mapping(g)})
    print(p["nama"], len(K))
json.dump({"type": "FeatureCollection", "sumber": idx["sumber_geometri"] + " – gabungan poligon desa per kabupaten/kota, disederhanakan 0,003°", "features": F},
          open(os.path.join(root, "kabupaten.geojson"), "w"), separators=(",", ":"))
print("selesai", len(F), os.path.getsize(os.path.join(root, "kabupaten.geojson")))
