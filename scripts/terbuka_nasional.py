"""
Data terbuka nasional untuk analisis SHP di mana pun di Indonesia (Pantau Rimbak · Yayasan PRCF Indonesia)
=========================================================================================================
1. tutupan_worldcover(geom) – Tutupan lahan 2021 resolusi 10 m: ESA WorldCover 10 m 2021 v200 (Zanaga dkk. 2022, CC BY 4.0),
   dibaca langsung dari COG resmi di AWS Open Data (s3://esa-worldcover). Luas per kelas dihitung geodesik per baris piksel.
2. indikasi_lahan_kritis(geom) – INDIKASI lahan kritis dari data terbuka, mengikuti cara skoring lahan kritis Kementerian
   Kehutanan (Perdirjen RLPS No. P.4/V-SET/2013 – kawasan hutan lindung: skor = Σ bobot × nilai, rentang 100–500)
   tetapi HANYA dengan 2 dari 4 kriteria yang tersedia sebagai data terbuka nasional:
     - penutupan tajuk (bobot 50): persentase piksel pohon/mangrove ESA WorldCover 2021 (10 m) dalam jendela 90 × 90 m;
       kelas >80 % = 5, 61–80 = 4, 41–60 = 3, 21–40 = 2, ≤20 = 1
     - kemiringan lereng (bobot 20): Copernicus DEM GLO-30 (ESA/Airbus, AWS Open Data);
       kelas <8 % = 5, 8–15 = 4, 16–25 = 3, 26–40 = 2, >40 % = 1
   Kriteria tingkat bahaya erosi (20) dan manajemen (10) tidak tersedia → bobot yang ada dinormalkan ke skala 100–500.
   Kelas: 451–500 tidak kritis, 361–450 potensial kritis, 271–360 agak kritis, 181–270 kritis, ≤180 sangat kritis.
   Hasilnya INDIKASI untuk penapisan awal, bukan Peta Lahan Kritis resmi (yang resmi: BPDAS/Kemenhut).
"""
import math
import numpy as np

WC = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
DEM = "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{0}_00_{1}_00_DEM/Copernicus_DSM_COG_10_{0}_00_{1}_00_DEM.tif"
HAN = "/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/Hansen_GFC-2025-v1.13_{}_{}.tif"
WC_KELAS = {10: ("Tutupan pohon", "#006400"), 20: ("Semak belukar", "#FFBB22"), 30: ("Padang rumput", "#FFFF4C"), 40: ("Lahan pertanian", "#F096FF"),
            50: ("Lahan terbangun", "#FA0000"), 60: ("Lahan terbuka / vegetasi jarang", "#B4B4B4"), 70: ("Salju & es", "#F0F0F0"),
            80: ("Badan air permanen", "#0064C8"), 90: ("Lahan basah herba", "#0096A0"), 95: ("Mangrove", "#00CF75"), 100: ("Lumut & lumut kerak", "#FAE6A0")}
LK_KELAS = [(451, "Tidak kritis", "#1A9850"), (361, "Potensial kritis", "#A6D96A"), (271, "Agak kritis", "#FEE08B"), (181, "Kritis", "#F46D43"), (0, "Sangat kritis", "#A50026")]
SUMBER_WC = "ESA WorldCover 10 m 2021 v200 (Zanaga dkk. 2022, doi:10.5281/zenodo.7254221), CC BY 4.0 – AWS Open Data"
SUMBER_LK = ("Indikasi PRCF dari data terbuka: ESA WorldCover 2021 10 m (penutupan tajuk) dan Copernicus DEM GLO-30 "
             "(kemiringan lereng), skoring mengikuti Perdirjen RLPS P.4/V-SET/2013 (kawasan hutan lindung) dengan 2 dari 4 kriteria")

def _env():
    import os
    for k, v in (("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR"), ("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif"), ("GDAL_HTTP_MAX_RETRY", "4"), ("GDAL_HTTP_RETRY_DELAY", "3")):
        os.environ.setdefault(k, v)

def _baca(url, geom, all_touched=False):
    """Potongan raster di kotak batas geom + masker di dalam poligon. → (array, transform, mask) atau None."""
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.features import geometry_mask
    try:
        with rasterio.open(url) as r:
            b = r.bounds; x0, y0, x1, y1 = geom.bounds
            x0, y0, x1, y1 = max(x0, b.left), max(y0, b.bottom), min(x1, b.right), min(y1, b.top)
            if x0 >= x1 or y0 >= y1: return None
            w = from_bounds(x0, y0, x1, y1, r.transform).round_offsets().round_lengths()
            if w.width < 1 or w.height < 1: return None
            a = r.read(1, window=w); t = r.window_transform(w)
            m = geometry_mask([geom], out_shape=a.shape, transform=t, invert=True, all_touched=all_touched)
            return a, t, m
    except Exception as e:
        if "404" in str(e) or "does not exist" in str(e) or "not recognized" in str(e): return None   # ubin laut / tidak ada
        raise

def _luas_baris(t, n):   # luas piksel (ha) per baris untuk grid derajat (WGS84, aproksimasi bola – selisih < 0,3 % terhadap elipsoid)
    R = 6371008.8; dx, dy = abs(t.a), abs(t.e); y = t.f - dy * (np.arange(n) + .5)
    return (R * R * math.radians(dx) * (np.sin(np.radians(y + dy / 2)) - np.sin(np.radians(y - dy / 2)))) / 1e4

def _ubin_wc(b):
    x0, y0, x1, y1 = b; out = []
    for la in range(int(math.floor(y0 / 3) * 3), int(math.ceil(y1 / 3) * 3), 3):
        for lo in range(int(math.floor(x0 / 3) * 3), int(math.ceil(x1 / 3) * 3), 3):
            out.append(f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}")
    return out

def tutupan_worldcover(geom):
    _env(); ha = {}; tot = 0.0; ok = 0
    for k in _ubin_wc(geom.bounds):
        R = _baca(WC.format(k), geom)
        if R is None: continue
        a, t, m = R; ok += 1; lb = _luas_baris(t, a.shape[0])
        for v in np.unique(a[m]):
            if int(v) == 0: continue
            luas = float((((a == v) & m) * lb[:, None]).sum()); ha[int(v)] = ha.get(int(v), 0) + luas; tot += luas
    if not ok or tot <= 0: return None
    return {"tahun": 2021, "resolusi_m": 10, "sumber": SUMBER_WC, "tercakup_ha": round(tot, 2),
            "kelas": [{"kode": k, "nama": WC_KELAS.get(k, (str(k), "#999"))[0], "warna": WC_KELAS.get(k, ("", "#999"))[1], "ha": round(v, 2), "persen": round(v / tot * 100, 2)}
                      for k, v in sorted(ha.items(), key=lambda x: -x[1])],
            "metode": "Luas = jumlah piksel × luas piksel geodesik per baris (WGS84), hanya piksel yang pusatnya di dalam batas area."}

def _nilai_tajuk(c):   # % tajuk → nilai 1–5
    return np.select([c > 80, c > 60, c > 40, c > 20], [5, 4, 3, 2], 1)
def _nilai_lereng(s):   # % lereng → nilai 1–5
    return np.select([s < 8, s <= 15, s <= 25, s <= 40], [5, 4, 3, 2], 1)

def _lereng_persen(geom):
    """Kemiringan lereng (%) Copernicus DEM GLO-30 untuk kotak area (gabungan ubin 1°). → (lereng, transform) atau None."""
    import rasterio
    from rasterio.merge import merge
    x0, y0, x1, y1 = geom.bounds; pad = 0.002; srcs = []
    try:
        for la in range(int(math.floor(y0 - pad)), int(math.floor(y1 + pad)) + 1):
            for lo in range(int(math.floor(x0 - pad)), int(math.floor(x1 + pad)) + 1):
                u = DEM.format(f"{'N' if la >= 0 else 'S'}{abs(la):02d}", f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}")
                try: srcs.append(rasterio.open(u))
                except Exception: pass   # ubin laut tidak ada
        if not srcs: return None
        z, t = merge(srcs, bounds=(x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    finally:
        for s in srcs: s.close()
    z = z[0].astype("float64"); dyd, dxd = abs(t.e), abs(t.a)
    lat = t.f - dyd * (np.arange(z.shape[0]) + .5)
    dy = dyd * 111320.0; dx = dxd * 111320.0 * np.cos(np.radians(lat))[:, None]
    gy, gx = np.gradient(z); s = np.hypot(gx / dx, gy / dy) * 100.0
    return s, t

def _rata_kotak(a, k):   # rata-rata jendela k×k (k ganjil) dengan jumlah kumulatif, tepi memakai jendela terpotong
    p = k // 2; A = np.pad(a.astype("float32"), p, mode="constant"); N = np.pad(np.ones(a.shape, "float32"), p, mode="constant")
    def kot(X):
        c = X.cumsum(0).cumsum(1); c = np.pad(c, ((1, 0), (1, 0)))
        return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return kot(A) / np.maximum(kot(N), 1)

def indikasi_lahan_kritis(geom):
    _env()
    from rasterio.transform import rowcol
    L = _lereng_persen(geom)
    if L is None: return None
    S, ts = L; ha = {n: 0.0 for _, n, _ in LK_KELAS}; tot = 0.0; tajuk = {}; lereng = {}
    for k in _ubin_wc(geom.bounds):
        R = _baca(WC.format(k), geom.buffer(0.0006))   # penyangga ±60 m agar jendela tajuk di tepi area utuh
        if R is None: continue
        a, t, _ = R
        from rasterio.features import geometry_mask
        m = geometry_mask([geom], out_shape=a.shape, transform=t, invert=True)
        if not m.any(): continue
        c = _rata_kotak(np.isin(a, (10, 95)), 9) * 100.0   # % piksel pohon/mangrove dalam jendela 90 m × 90 m
        lb = _luas_baris(t, a.shape[0]); rr, cc = np.nonzero(m)
        xs = t.c + (cc + .5) * t.a; ys = t.f + (rr + .5) * t.e
        r2, c2 = rowcol(ts, xs, ys); r2 = np.clip(np.asarray(r2), 0, S.shape[0] - 1); c2 = np.clip(np.asarray(c2), 0, S.shape[1] - 1)
        nt = _nilai_tajuk(c[rr, cc]); nl = _nilai_lereng(S[r2, c2]); luas = lb[rr]
        skor = (50 * nt + 20 * nl) / 70.0 * 100.0   # bobot dinormalkan ke skala 100–500
        sisa = np.ones(skor.shape, bool)
        for batas, n, _ in LK_KELAS:
            sel = sisa & (np.ceil(skor - 1e-9) >= batas); ha[n] += float(luas[sel].sum()); sisa &= ~sel
        tot += float(luas.sum())
        for v in (1, 2, 3, 4, 5):
            tajuk[v] = tajuk.get(v, 0) + float(luas[nt == v].sum()); lereng[v] = lereng.get(v, 0) + float(luas[nl == v].sum())
    if tot <= 0: return None
    return {"jenis": "indikasi", "sumber": SUMBER_LK, "tercakup_ha": round(tot, 2),
            "kelas": [{"nama": n, "warna": w, "ha": round(ha[n], 2), "persen": round(ha[n] / tot * 100, 2)} for _, n, w in LK_KELAS],
            "tajuk_ha": {lbl: round(tajuk.get(v, 0), 2) for v, lbl in ((5, ">80 %"), (4, "61–80 %"), (3, "41–60 %"), (2, "21–40 %"), (1, "≤20 %"))},
            "lereng_ha": {lbl: round(lereng.get(v, 0), 2) for v, lbl in ((5, "<8 %"), (4, "8–15 %"), (3, "16–25 %"), (2, "26–40 %"), (1, ">40 %"))},
            "catatan": "Indikasi untuk penapisan awal, BUKAN Peta Lahan Kritis resmi. Hanya kriteria penutupan tajuk (bobot 50) dan kemiringan lereng (bobot 20); "
                       "kriteria tingkat bahaya erosi dan manajemen tidak tersedia sebagai data terbuka nasional, sehingga bobot dinormalkan ke skala 100–500. "
                       "Penutupan tajuk = persentase piksel pohon/mangrove ESA WorldCover 2021 (10 m) dalam jendela 90 × 90 m; kebun berpohon (mis. sawit, karet) terhitung bertajuk. "
                       "Verifikasi lapangan dan Peta Lahan Kritis BPDAS setempat tetap menjadi acuan resmi."}

def _tiles_han(b):
    x0, y0, x1, y1 = b; out = []
    for ty in range(int(math.ceil(y1 / 10) * 10), int(math.floor(y0 / 10) * 10), -10):
        for tx in range(int(math.floor(x0 / 10) * 10), int(math.ceil(x1 / 10) * 10), 10):
            out.append((f"{abs(ty):02d}{'N' if ty >= 0 else 'S'}_{abs(tx):03d}{'E' if tx >= 0 else 'W'}", (tx, ty - 10, tx + 10, ty)))
    return out
