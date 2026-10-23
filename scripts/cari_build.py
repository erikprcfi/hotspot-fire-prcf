"""
Indeks pencarian lokasi (desa/kelurahan, kecamatan, kab/kota) untuk menu Prakiraan – Fire Hotspot PRCF
Sumber: data/wilayah/<prov>.json (batas OCHA COD-AB/BPS-BIG, nama Kepmendagri 2025) yang dibuat scripts/wilayah_build.py.
Titik tiap desa = titik representatif di dalam poligon desa (shapely.point_on_surface).
Keluaran: data/wilayah/cari.json  {prov:[nama], kab:[[nama, iprov, lat, lon]], kec:[[nama, ikab, lat, lon]], d:[[nama, ikec, tipe, lat, lon]]}
Pemakaian: python scripts/cari_build.py
"""
import json, os
from shapely.geometry import Polygon
from shapely.ops import unary_union
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'wilayah')
idx = json.load(open(os.path.join(D, 'indeks.json')))
def dec(r):
    x = y = 0; out = []
    for i in range(0, len(r), 2):
        x += r[i]; y += r[i + 1]; out.append((x / 1e5, y / 1e5))
    return out
P, K, C, Ds = [], [], [], []
for p in idx['provinsi']:
    J = json.load(open(os.path.join(D, p['file'])))
    ip = len(P); P.append(J['prov'])
    kabI, kecI, kabPts, kecPts = {}, {}, {}, {}
    for key, (nm, prov) in J['kab'].items():
        kabI[key] = len(K); K.append([nm, ip, 0, 0])
    for key, (nm, kk) in J['kec'].items():
        kecI[key] = len(C); C.append([nm, kabI[kk], 0, 0])
    for code, nm, kk, typ, b, rings in J['desa']:
        polys = []
        for r in rings:
            pts = dec(r)
            if len(pts) >= 4:
                pg = Polygon(pts)
                if pg.is_valid and pg.area > 0: polys.append(pg)
        if polys:
            big = max(polys, key=lambda g: g.area); pt = big.representative_point(); lat, lon = pt.y, pt.x
        else:
            lat, lon = (b[1] + b[3]) / 2, (b[0] + b[2]) / 2
        Ds.append([nm, kecI[kk], typ, round(lat, 4), round(lon, 4)])
        kecPts.setdefault(kk, []).append((lat, lon))
    for kk, pts in kecPts.items():
        i = kecI[kk]; C[i][2] = round(sum(a for a, _ in pts) / len(pts), 4); C[i][3] = round(sum(b for _, b in pts) / len(pts), 4)
        kabPts.setdefault(J['kec'][kk][1], []).extend(pts)
    for kk, pts in kabPts.items():
        i = kabI[kk]; K[i][2] = round(sum(a for a, _ in pts) / len(pts), 4); K[i][3] = round(sum(b for _, b in pts) / len(pts), 4)
    print(J['prov'], len(J['desa']))
out = {'sumber': 'Nama: Kepmendagri No. 300.2.2-2430 Tahun 2025; titik: batas desa OCHA COD-AB (BPS/BIG 2020)', 'prov': P, 'kab': K, 'kec': C, 'd': Ds}
json.dump(out, open(os.path.join(D, 'cari.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(K), 'kab', len(C), 'kec', len(Ds), 'desa', os.path.getsize(os.path.join(D, 'cari.json')) / 1e6, 'MB')
