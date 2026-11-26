"""
Peta lahan gambut nasional untuk Pantau Rimbak  ->  data/gambut/
==================================================================

Sumber: PEATMAP (Xu, J., Morris, P.J., Liu, J., Holden, J. 2018. PEATMAP: Refining estimates of global
peatland distribution based on a meta-analysis. CATENA 160: 134–140), lapisan Asia Tenggara
(SEA_Peatland), University of Leeds Research Data, lisensi CC BY 4.0
(https://archive.researchdata.leeds.ac.uk/251/).

Poligon gambut (proyeksi World Cylindrical Equal Area, ESRI:54034) diubah ke WGS84 lalu dirasterkan pada kisi
0,0025° (± 280 m) untuk wilayah 94–142° BT, 11° LS–7° LU, dan dipotong per ubin 1° × 1°:
  data/gambut/t_<lat>_<lon>.png   PNG 400×400 palet 2 warna (0 = transparan, 1 = gambut), <lat>/<lon> = sudut barat daya
  data/gambut/ikhtisar.png         seluruh wilayah, kisi 0,02° (untuk peta skala kecil)
  data/gambut/indeks.json          daftar ubin + luas gambut per ubin (ha) + sumber & lisensi
Peta skala nasional ini menunjukkan sebaran gambut indikatif; batas di lapangan dapat berbeda (gunakan peta KHG resmi
KLHK/BRGM untuk keperluan hukum).

Pemakaian: python scripts/gambut_build.py [folder_PEATMAP_Asia]   (sekali; hasil disimpan di repo)
"""
import os, sys, io, json, math, zipfile, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "gambut")
URL = "https://archive.researchdata.leeds.ac.uk/251/5/Asia.zip"
W, E, S, N = 94, 142, -11, 7
R = 400   # piksel per derajat (0,0025°)

def unduh(tmp):
    os.makedirs(tmp, exist_ok=True); z = os.path.join(tmp, "Asia.zip")
    if not os.path.exists(z): urllib.request.urlretrieve(URL, z)
    zipfile.ZipFile(z).extractall(tmp); return os.path.join(tmp, "Asia")

def main():
    import shapefile
    from rasterio import features
    from rasterio.transform import from_origin
    from rasterio.warp import transform_geom
    from PIL import Image
    src = sys.argv[1] if len(sys.argv) > 1 else unduh("/tmp/peatmap")
    rd = shapefile.Reader(os.path.join(src, "SEA_Peatland"))
    geoms = []
    for sh in rd.shapes():
        g = sh.__geo_interface__
        g = {"type": g["type"], "coordinates": g["coordinates"]}
        geoms.append(transform_geom("ESRI:54034", "EPSG:4326", g))
    nx, ny = (E - W) * R, (N - S) * R
    tf = from_origin(W, N, 1 / R, 1 / R)
    A = features.rasterize(((g, 1) for g in geoms), out_shape=(ny, nx), transform=tf, fill=0, dtype="uint8")
    print("piksel gambut:", int(A.sum()))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith("t_") and f.endswith(".png"): os.remove(os.path.join(OUT, f))
    pal = [0, 0, 0, 139, 69, 19] + [0, 0, 0] * 254
    ubin = {}; total = 0.0
    for la in range(S, N):
        for lo in range(W, E):
            r0 = (N - la - 1) * R; c0 = (lo - W) * R
            T = A[r0:r0 + R, c0:c0 + R]
            n = int(T.sum())
            if not n: continue
            # luas piksel (ha) bergantung lintang: (0,0025° × 111,32 km)² × cos(lat)
            ha = n * (111.32 * 1000 / R) ** 2 * math.cos(math.radians(la + 0.5)) / 1e4
            total += ha
            im = Image.fromarray(T, mode="P"); im.putpalette(pal); im.info["transparency"] = 0
            nm = f"t_{la}_{lo}.png"; im.save(os.path.join(OUT, nm), optimize=True, transparency=0)
            ubin[f"{la}_{lo}"] = round(ha)
    # ikhtisar 0,02°
    k = R // 50
    O = A[: (ny // k) * k, : (nx // k) * k].reshape(ny // k, k, nx // k, k).max(axis=(1, 3)).astype("uint8")
    im = Image.fromarray(O, mode="P"); im.putpalette(pal); im.save(os.path.join(OUT, "ikhtisar.png"), optimize=True, transparency=0)
    json.dump({"sumber": "PEATMAP – Xu dkk. (2018) CATENA 160:134–140, lapisan Asia Tenggara; University of Leeds Research Data, CC BY 4.0",
               "url": "https://archive.researchdata.leeds.ac.uk/251/",
               "catatan": "Sebaran gambut indikatif skala nasional (kisi ± 280 m). Bukan peta resmi KHG; untuk keperluan hukum gunakan peta KHG/fungsi ekosistem gambut KLHK.",
               "kisi_derajat": 1 / R, "ubin_derajat": 1, "piksel_ubin": R, "batas": [W, S, E, N], "ikhtisar_derajat": 1 / 50,
               "luas_total_ha": round(total), "ubin": ubin}, open(os.path.join(OUT, "indeks.json"), "w"), separators=(",", ":"))
    print("ubin:", len(ubin), "luas total ha:", round(total))

if __name__ == "__main__":
    main()
