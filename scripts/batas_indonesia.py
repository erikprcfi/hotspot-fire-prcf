"""Batas daratan Indonesia (gabungan seluruh poligon desa OCHA COD-AB / BPS-BIG di data/wilayah) → data/wilayah/indonesia_darat.geojson
Dipakai pipeline untuk menyaring titik panas FIRMS agar hanya yang berada di wilayah Indonesia (bukan Malaysia/Brunei/Timor-Leste/PNG).
Penyangga 0,01° (±1 km) agar deteksi di garis pantai/tepi sungai tidak terbuang; disederhanakan 0,005°. Dijalankan sekali bila data/wilayah berubah."""
import os, json
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "wilayah")
idx = json.load(open(os.path.join(root, "indeks.json"))); parts = []
for p in idx["provinsi"]:
    J = json.load(open(os.path.join(root, p["file"]))); P = []
    for d in J["desa"]:
        for r in d[5]:
            x = y = 0; pts = []
            for i in range(0, len(r), 2): x += r[i]; y += r[i + 1]; pts.append((x / 1e5, y / 1e5))
            if len(pts) >= 3:
                try: P.append(Polygon(pts).buffer(0))
                except Exception: pass
    u = unary_union(P).buffer(0.01, 4).simplify(0.005); parts.append(u); print(p["nama"], len(P), u.geom_type)
g = unary_union(parts)
json.dump({"type": "Feature", "properties": {"sumber": idx["sumber_geometri"] + " – gabungan poligon desa, penyangga 0,01°, disederhanakan 0,005°"}, "geometry": mapping(g)},
          open(os.path.join(root, "indonesia_darat.geojson"), "w"), separators=(",", ":"))
print("selesai", os.path.getsize(os.path.join(root, "indonesia_darat.geojson")))
