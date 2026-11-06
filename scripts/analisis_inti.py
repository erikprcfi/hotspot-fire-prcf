"""
Inti analisis area (poligon) – Pantau Rimbak PRCF, dataset resmi UMD & WRI
=======================================================================================================
Dipakai untuk 6 Hutan Desa (scripts/karbon_lahan.py) DAN untuk SHP yang diunggah pengguna (scripts/analisis_antrean.py),
sehingga cara hitungnya identik. Semua dihitung langsung dari raster/arsip resmi (tanpa estimasi buatan):
 - Tutupan & penggunaan lahan 2000/2005/2010/2015/2020: GLAD GLCLUC 2000–2020 v2 (Potapov et al. 2022), 30 m
 - Hutan 2000 & kehilangan tutupan pohon 2001–2025: Hansen/UMD GFC-2025-v1.13 (Hansen et al. 2013); hutan = tajuk >= 30 %
 - Emisi bruto, serapan bruto, fluks bersih GRK hutan 2001–2025: Harris et al. 2021 + Gibbs et al. 2025, versi 20260327
 - Stok karbon tahun 2000 (atas tanah & total): Harris et al. 2021, versi 20230222
 - Emisi karbon metode FREL (beda stok, IPCC Tier 2 sesuai FREL Indonesia 2022 / e-Learning KLHK "Menghitung Emisi Karbon Hutan"):
     data aktivitas = kehilangan tutupan pohon Hansen per tahun; kelas awal = GLCLU epoch sebelum tahun kehilangan
     (pohon > 25 m = hutan primer, 3–25 m = hutan sekunder; lahan kering vs lahan basah/rawa);
     kehilangan di hutan primer = degradasi (primer → sekunder), di hutan sekunder = deforestasi (→ PLK bercampur semak / belukar rawa);
     Emisi (tCO2e) = Luas (ha) × (stok awal − stok akhir) (tC/ha) × 44/12. Kepadatan karbon FREL 2022 (AGB+BGB × 0,47; hutan nilai Kalimantan).
 - Titik panas 2016–2025: arsip tahunan resmi NASA FIRMS (VIIRS S-NPP, VIIRS NOAA-20, MODIS) untuk Indonesia
Raster di grid 0,00025° (ubin 10°), jendela dibulatkan ke piksel utuh (tanpa resampling), luas piksel geodesik,
piksel masuk poligon bila pusat piksel di dalam poligon.
"""
import os, datetime, io, csv, json, math, urllib.request
import numpy as np

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR"); os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4"); os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "3")
HAN = "/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/Hansen_GFC-2025-v1.13_{}_{}.tif"
GLC = "/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/GLCLU2000-2020/v2/{}/{}.tif"
CM = "/vsicurl/https://gfw2-data.s3.amazonaws.com/climate/carbon_model/"
FLUX = {"emisi": CM + "gross_emissions/all_drivers/all_gases/biomass_soil/standard/forest_extent/per_pixel/20260327/{}_gross_emis_all_gases_all_drivers_Mg_CO2e_pixel_biomass_soil_forest_extent_2001_25.tif",
        "serapan": CM + "gross_removals_AGCO2_BGCO2_all_forest_types/standard/forest_extent/per_pixel/20260327/{}_gross_removals_AGCO2_BGCO2_Mg_pixel_all_forest_types_forest_extent_2001_25.tif",
        "bersih": CM + "net_flux_all_forest_types_all_drivers/biomass_soil/standard/forest_extent/per_pixel/20260327/{}_net_flux_Mg_CO2e_pixel_biomass_soil_forest_extent_2001_25.tif"}
STOK = {"agc": CM + "carbon_pools/aboveground_carbon/extent_2000/standard/20230222/{}_Mg_AGC_ha_2000.tif",
        "total": CM + "carbon_pools/total_carbon/extent_2000/standard/20230222/{}_Mg_total_C_ha_2000.tif"}
KELAS = [("pohon", "Tutupan pohon (hutan)", (25, 48), "#2D712D"), ("basah_pohon", "Lahan basah berpohon (rawa/gambut berhutan)", (125, 148), "#3B8686"),
         ("pendek", "Vegetasi pendek (semak, belukar, rumput)", (19, 24), "#B3B30E"), ("basah_pendek", "Lahan basah bervegetasi pendek", (102, 124), "#2E92EB"),
         ("jarang", "Lahan terbuka / vegetasi jarang", (0, 18), "#E4D98A"), ("basah_jarang", "Lahan basah terbuka", (100, 101), "#BFC0C0"),
         ("air", "Perairan (sungai, danau)", (200, 211), "#1964EB"), ("tani", "Lahan pertanian (cropland)", (244, 244), "#FF7D00"),
         ("bangun", "Lahan terbangun / permukiman", (250, 250), "#4FC3C3"), ("es", "Salju/es", (241, 241), "#DDDDDD"), ("laut", "Laut", (254, 254), "#111133")]
TAHUN_LC = [2000, 2005, 2010, 2015, 2020]
# ---- FREL 2022: kepadatan karbon (Mg C/ha = tC/ha) – sama dengan perhitungan emisi 5 Hutan Desa (RC2) PRCF ----
FREL_C = {"hlk_primer": 197.59, "hlk_sekunder": 135.15, "hr_primer": 163.47, "hr_sekunder": 123.69, "plk_semak": 36.45, "belukar_rawa": 11.24}
FREL_NAMA = {"hlk_primer": "Hutan Lahan Kering Primer", "hlk_sekunder": "Hutan Lahan Kering Sekunder", "hr_primer": "Hutan Rawa Primer", "hr_sekunder": "Hutan Rawa Sekunder",
             "plk_semak": "Pertanian Lahan Kering Bercampur Semak", "belukar_rawa": "Belukar Rawa"}
# (kelas awal, kelas akhir, jenis perubahan)
FREL_ATURAN = [("hlk_primer", "hlk_sekunder", "degradasi"), ("hlk_sekunder", "plk_semak", "deforestasi"), ("hr_primer", "hr_sekunder", "degradasi"), ("hr_sekunder", "belukar_rawa", "deforestasi")]
FREL_SUMBER = ["KLHK (2022). Indonesia's Second Forest Reference Level (FREL 2022), Tabel 5 & 6 – kepadatan karbon per kelas penutupan lahan. https://redd.unfccc.int/files/2nd_frl_indonesia_final_submit.pdf",
               "KLHK. e-Learning 'Menghitung Emisi Karbon Hutan' – rumus beda stok: Emisi = Luas × (stok awal − stok akhir) × 44/12.",
               "Hansen, M.C. et al. (2013) Science 342 – Global Forest Change v1.13 (data aktivitas: tahun kehilangan tutupan pohon, tajuk 2000 ≥ 30%).",
               "Potapov, P. et al. (2022) Front. Remote Sens. – GLAD GLCLUC 2000–2020 v2 (kelas awal & tinggi pohon untuk primer/sekunder, lahan kering/basah)."]
def _frel_kelas(v):
    """kode GLCLU → indeks aturan FREL (0..3) atau -1 bila bukan hutan. 48 = pohon lahan kering > 25 m, 25–47 = 3–25 m; 148 / 125–147 = lahan basah."""
    out = np.full(v.shape, -1, np.int8)
    out[v == 48] = 0; out[(v >= 25) & (v <= 47)] = 1; out[v == 148] = 2; out[(v >= 125) & (v <= 147)] = 3
    return out
SUMBER = {"tutupan_lahan": "GLAD Global Land Cover and Land Use Change 2000–2020 v2 (Potapov et al. 2022, Front. Remote Sens.), 30 m, CC BY 4.0",
          "kehilangan_pohon": "Hansen/UMD/Google/USGS/NASA Global Forest Change GFC-2025-v1.13 (Hansen et al. 2013, Science), 30 m, CC BY 4.0",
          "fluks_karbon": "Forest GHG emissions, removals & net flux 2001–2025 (Harris et al. 2021, Nat. Clim. Change; Gibbs et al. 2025, ESSD), versi 20260327, data publik World Resources Institute, CC BY 4.0",
          "stok_karbon": "Stok karbon hutan tahun 2000 (Harris et al. 2021), versi 20230222, CC BY 4.0",
          "emisi_frel": "Emisi karbon metode FREL 2022 KLHK (beda stok, kepadatan karbon FREL 2022 × 44/12) dari kehilangan tutupan pohon Hansen GFC v1.13 & kelas awal GLCLU v2",
          "titik_panas": "NASA FIRMS arsip tahunan (VIIRS S-NPP VNP14IMG, VIIRS NOAA-20 VJ114IMG, MODIS MCD14ML) untuk Indonesia; tahun berjalan dari NASA FIRMS API (Standard Processing/NRT)"}

def _kls(a):
    out = np.full(a.shape, -1, np.int8)
    for i, (_, _, (lo, hi), _) in enumerate(KELAS): out[(a >= lo) & (a <= hi)] = i
    return out

def _tiles(b):
    x0, y0, x1, y1 = b; out = []
    for ty in range(int(math.ceil(y1 / 10) * 10), int(math.floor(y0 / 10) * 10), -10):
        for tx in range(int(math.floor(x0 / 10) * 10), int(math.ceil(x1 / 10) * 10), 10):
            out.append((f"{abs(ty):02d}{'N' if ty >= 0 else 'S'}_{abs(tx):03d}{'E' if tx >= 0 else 'W'}", (tx, ty - 10, tx + 10, ty)))
    return out

KLHK_FREL = {2001: 0, 2002: 1, 2005: 2, 20051: 3}   # kode Penutupan Lahan KLHK → kelas FREL (HLK primer/sekunder, hutan rawa primer/sekunder)
def muat_klhk(lokasi=None, bbox=None):
    """Poligon penutupan lahan KLHK → {tahun: [(geom, kode), ...]}. Dari data/klhk/<lokasi>_<tahun>.geojson (6 Hutan Desa)
    atau langsung dari layanan resmi KLHK untuk bbox (SHP unggahan). Kosong bila tidak tersedia."""
    from shapely.geometry import shape
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "klhk"); out = {}
    try:
        if lokasi:
            for f in sorted(os.listdir(root)):
                m = __import__("re").match(rf"^{lokasi}_(\d{{4}})\.geojson$", f)
                if m: out[int(m.group(1))] = [(shape(x["geometry"]), int(x["properties"]["kode"])) for x in json.load(open(os.path.join(root, f)))["features"]]
        elif bbox:   # SHP unggahan: peta provinsi KLHK yang tersimpan (data/klhk/<prov>_<tahun>.geojson.gz), cadangan layanan KLHK
            import gzip, re as _re
            from shapely.geometry import box as _box
            bb = _box(*bbox)
            for f in sorted(os.listdir(root)):
                m = _re.match(r"^[a-z]+_(\d{4})\.geojson\.gz$", f)
                if not m: continue
                for x in json.load(gzip.open(os.path.join(root, f), "rt"))["features"]:
                    g = shape(x["geometry"])
                    if g.intersects(bb): out.setdefault(int(m.group(1)), []).append((g.buffer(0), int(x["properties"]["kode"])))
            if out: return out
            import tutupan_klhk as T
            for y, url in T.cari_layanan().items():
                F = T.ambil(url, bbox)
                if F: out[y] = [(shape(x["geometry"]).buffer(0), int(x["properties"]["kode"])) for x in F]
    except Exception as e:
        print("  peta KLHK tidak tersedia:", e)
    return out

def hitung_raster(geom, klhk=None):
    """geom: shapely (Multi)Polygon WGS84. Mengembalikan tutupan lahan, kehilangan hutan & karbon."""
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio import features
    from shapely.geometry import box, mapping
    nk = len(KELAS)
    A = {"luas": 0.0, "lc": {y: np.zeros(nk) for y in TAHUN_LC}, "mat": np.zeros((nk, nk)), "h2000": 0.0, "loss": np.zeros(26),
         "emis": np.zeros(26), "frelA": {e: np.zeros(4) for e in TAHUN_LC}, "frelL": {e: np.zeros((5, 26)) for e in TAHUN_LC},
         "kA": {t: np.zeros(4) for t in (klhk or {})}, "kL": {t: np.zeros((5, 26)) for t in (klhk or {})}, "kT": {t: {} for t in (klhk or {})}, "kC": {t: {} for t in (klhk or {})}, "emis_tot": 0.0, "ser": 0.0, "net": 0.0, "agc": 0.0, "tot": 0.0, "agc_f": 0.0, "tot_f": 0.0}
    for tile, tb in _tiles(geom.bounds):
        g = geom.intersection(box(*tb))
        if g.is_empty: continue
        x0, y0, x1, y1 = g.bounds
        def rd(url):
            with rasterio.open(url) as src:
                f = from_bounds(x0, y0, x1, y1, src.transform)   # jendela piksel utuh yang menutup seluruh poligon (tanpa resampling)
                c0, r0 = math.floor(f.col_off), math.floor(f.row_off); c1, r1 = math.ceil(f.col_off + f.width), math.ceil(f.row_off + f.height)
                w = rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0).intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                return src.read(1, window=w), src.window_transform(w)
        tc, tr = rd(HAN.format("treecover2000", tile)); H, W = tc.shape
        def chk(a, t, nm):
            assert a.shape == (H, W) and abs(t.c - tr.c) < 1e-9 and abs(t.f - tr.f) < 1e-9, f"grid tidak sejajar: {nm}"; return a
        ly = chk(*rd(HAN.format("lossyear", tile)), "lossyear")
        R = 6371008.8; dlon = math.radians(abs(tr.a)); dlat = abs(tr.e); rows = np.arange(H)
        pix = (R * R * dlon * np.abs(np.sin(np.radians(tr.f - rows * dlat)) - np.sin(np.radians(tr.f - (rows + 1) * dlat))) / 1e4)[:, None] * np.ones((1, W))
        m = features.rasterize([(mapping(g), 1)], out_shape=(H, W), transform=tr, fill=0, all_touched=False).astype(bool)
        pm = pix * m; forest = tc >= 30
        A["luas"] += float(pm.sum()); A["h2000"] += float((pm * forest).sum())
        for y in range(1, 26): A["loss"][y] += float((pm * (forest & (ly == y))).sum())
        lc = {}; fk = {}
        for y in TAHUN_LC:
            raw = chk(*rd(GLC.format(y, tile)), f"GLCLU {y}")
            lc[y] = _kls(raw); fk[y] = _frel_kelas(raw)
            for i in range(nk): A["lc"][y][i] += float((pm * (lc[y] == i)).sum())
        for e in TAHUN_LC:   # FREL: luas tiap kelas hutan pada epoch e + kehilangan per tahun menurut kelas epoch e (indeks 4 = bukan hutan)
            k0 = fk[e]
            for j in range(4): A["frelA"][e][j] += float((pm * (k0 == j)).sum())
            hl = forest & m & (ly > 0)
            if hl.any():
                kk = np.where(k0 >= 0, k0, 4)[hl]; yy = ly[hl].astype(int); np.add.at(A["frelL"][e], (kk, yy), pix[hl])
        for t, polys in (klhk or {}).items():   # FREL dengan kelas Penutupan Lahan RESMI KLHK tahun t
            P = [(mapping(pg.intersection(g)), int(kd)) for pg, kd in polys if pg.intersects(g)]
            if not P: continue
            km = features.rasterize(P, out_shape=(H, W), transform=tr, fill=0, all_touched=False, dtype="int32")
            for kd in np.unique(km[m]):
                if kd: A["kT"][t][int(kd)] = A["kT"][t].get(int(kd), 0.0) + float((pm * (km == kd)).sum())
            k0 = np.full((H, W), -1, np.int8)
            for kd, j in KLHK_FREL.items(): k0[km == kd] = j
            for j in range(4): A["kA"][t][j] += float((pm * (k0 == j)).sum())
            hl = forest & m & (ly > 0)
            if hl.any():
                kk = np.where(k0 >= 0, k0, 4)[hl]; yy = ly[hl].astype(int); np.add.at(A["kL"][t], (kk, yy), pix[hl])
                kc, pc = km[hl], pix[hl]   # kehilangan per tahun menurut KODE KLHK (untuk tutupan lahan tahunan sebelum/sesudah tahun peta)
                for kd in np.unique(kc):
                    if not kd: continue
                    arr = A["kC"][t].setdefault(int(kd), np.zeros(26)); sel = kc == kd; np.add.at(arr, yy[sel], pc[sel])
        a0, a1 = lc[2000][m], lc[2020][m]; pw = pix[m]
        ok = (a0 >= 0) & (a1 >= 0); np.add.at(A["mat"], (a0[ok], a1[ok]), pw[ok])
        fl = {k: np.nan_to_num(chk(*rd(u.format(tile)), k).astype("float64")) * m for k, u in FLUX.items()}
        A["emis_tot"] += float(fl["emisi"].sum()); A["ser"] += float(fl["serapan"].sum()); A["net"] += float(fl["bersih"].sum())
        for y in range(1, 26): A["emis"][y] += float(fl["emisi"][ly == y].sum())
        st = {k: np.nan_to_num(chk(*rd(u.format(tile)), k).astype("float64")) for k, u in STOK.items()}
        A["agc"] += float((st["agc"] * pm).sum()); A["tot"] += float((st["total"] * pm).sum())
        A["agc_f"] += float((st["agc"] * pm * forest).sum()); A["tot_f"] += float((st["total"] * pm * forest).sum())
    loss = {str(2000 + y): round(A["loss"][y], 2) for y in range(1, 26)}; lt = sum(loss.values())
    k44 = 44 / 12
    KL = bool(A["kA"]); SA, SL = (A["kA"], A["kL"]) if KL else (A["frelA"], A["frelL"])
    def pilih(y0):   # peta KLHK tahun awal (atau tahun terdekat sebelumnya); bila belum ada peta KLHK ≤ tahun awal → GLCLU epoch sebelum tahun awal
        k = [t for t in sorted(A["kA"]) if t <= y0]
        if k: return k[-1], A["kA"], A["kL"], "KLHK"
        g = [t for t in TAHUN_LC if t <= y0 - 1] or [TAHUN_LC[0]]
        return g[-1], A["frelA"], A["frelL"], "GLCLU"
    def periode(y0, y1):   # sama dengan sheet "Awal" templat perhitungan karbon PRCF
        e, SA_, SL_, src = pilih(y0); L = SL_[e]
        D = [SA_[e][j] - sum(L[j][y] for y in range(1, 26) if e < 2000 + y < y0) for j in range(4)]
        E = [sum(L[j][y - 2000] for y in range(y0, y1 + 1)) for j in range(4)]
        nh = sum(L[4][y - 2000] for y in range(y0, y1 + 1))
        defo = E[1] + E[3]; degr = E[0] + E[2]
        K = (E[1] * (FREL_C["hlk_sekunder"] - FREL_C["plk_semak"]) + E[3] * (FREL_C["hr_sekunder"] - FREL_C["belukar_rawa"])
             + E[0] * (FREL_C["hlk_primer"] - FREL_C["hlk_sekunder"]) + E[2] * (FREL_C["hr_primer"] - FREL_C["hr_sekunder"]))
        return {"periode": f"{y0}–{y1}", "epoch_kelas": e, "sumber_kelas": src, "deforestasi_ha": round(defo, 4), "degradasi_ha": round(degr, 4), "bukan_hutan_ha": round(nh, 4),
                "emisi_tCO2e": round(K * k44, 2)}
    frel = {"metode": "FREL 2022 – beda stok (stock-difference): Emisi (tCO2e) = Luas (ha) × (stok kelas awal − stok kelas akhir) (tC/ha) × 44/12. "
                      + ("Kelas awal periode: Peta Penutupan Lahan resmi KLHK (1:250.000) tahun awal periode (atau tahun terdekat sebelumnya); luas awal = luas kelas pada peta itu dikurangi kehilangan antara tahun peta dan tahun awal. " if KL else "")
                      + "Bila peta KLHK tidak tersedia: GLCLU epoch terakhir sebelum tahun awal periode (pohon > 25 m = primer, 3–25 m = sekunder; lahan kering / rawa); luas awal = luas kelas pada epoch itu dikurangi kehilangan sebelum tahun awal. "
                      "Kehilangan di hutan primer = degradasi (→ sekunder); di hutan sekunder = deforestasi (→ PLK bercampur semak / belukar rawa). "
                      "Kehilangan di piksel yang bukan hutan menurut GLCLU dicatat terpisah dan tidak dihitung sebagai emisi.",
            "kepadatan_karbon_tC_ha": {k: {"nama": FREL_NAMA[k], "tC_ha": v} for k, v in FREL_C.items()},
            "faktor_emisi": [{"awal": FREL_NAMA[a], "akhir": FREL_NAMA[b], "jenis": jn, "selisih_tC_ha": round(FREL_C[a] - FREL_C[b], 2), "tCO2e_ha": round((FREL_C[a] - FREL_C[b]) * k44, 2)} for a, b, jn in FREL_ATURAN],
            "sumber_kelas": "KLHK" if KL else "GLCLU",
            "aturan_tahun_peta": "tahun_awal" if KL else "sebelum_tahun_awal",
            "dasar": {str(e): {"luas_ha": [round(float(v), 4) for v in SA[e]],
                               "hilang_ha": {str(2000 + y): [round(float(SL[e][j][y]), 4) for j in range(5)] for y in range(1, 26) if SL[e][:, y].sum() > 0}} for e in sorted(SA)},
            "dasar_glclu": {str(e): {"luas_ha": [round(float(v), 4) for v in A["frelA"][e]],
                               "hilang_ha": {str(2000 + y): [round(float(A["frelL"][e][j][y]), 4) for j in range(5)] for y in range(1, 26) if A["frelL"][e][:, y].sum() > 0}} for e in TAHUN_LC} if KL else None,
            "hilang_kode_ha": {str(t): {str(2000 + y): {str(kd): round(float(v[y]), 4) for kd, v in A["kC"][t].items() if v[y] > 0} for y in range(1, 26) if any(v[y] > 0 for v in A["kC"][t].values())} for t in sorted(A["kC"])} if KL else None,
            "tutupan_klhk_ha": {str(t): {str(k): round(v, 2) for k, v in sorted(A["kT"][t].items(), key=lambda kv: -kv[1])} for t in sorted(A["kT"])} if KL else None,
            "urutan_kelas": ["hlk_primer", "hlk_sekunder", "hr_primer", "hr_sekunder", "bukan_hutan"],
            "periode_2020_2025": periode(2020, 2025), "periode_2001_2025": periode(2001, 2025),
            "keterbatasan": ["Estimasi penginderaan jauh, bukan pengukuran lapangan; padanan kelas GLCLU → KLHK memakai proksi tinggi pohon, bukan peta penutupan lahan resmi KLHK.",
                             "Kelas setelah kehilangan tidak terpetakan tahunan; dipakai aturan degradasi/deforestasi di atas.",
                             "Tidak mencakup emisi dekomposisi/kebakaran gambut, degradasi ringan di bawah tajuk, dan serapan dari pertumbuhan kembali.",
                             "Untuk angka resmi, kelas awal/akhir dapat diganti dengan peta Penutupan Lahan KLHK (SIGAP)."],
            "sumber": FREL_SUMBER}
    mat = {f"{KELAS[i][0]}>{KELAS[j][0]}": round(float(A["mat"][i, j]), 1) for i in range(nk) for j in range(nk) if i != j and A["mat"][i, j] >= 0.5}
    return {
        "luas_ha": round(A["luas"], 1),
        "tutupan_lahan_ha": {str(y): {KELAS[i][0]: round(float(A["lc"][y][i]), 1) for i in range(nk)} for y in TAHUN_LC},
        "perubahan_2000_2020_ha": dict(sorted(mat.items(), key=lambda kv: -kv[1])),
        "hutan": {"hutan_2000_ha": round(A["h2000"], 1), "kehilangan_per_tahun_ha": loss, "kehilangan_total_ha": round(lt, 1),
                  "hutan_tersisa_2025_ha": round(A["h2000"] - lt, 1), "persen_hilang": round(100 * lt / A["h2000"], 2) if A["h2000"] else None},
        "karbon": {"periode": "2001–2025", "emisi_bruto_total_tCO2e": round(A["emis_tot"]), "serapan_bruto_total_tCO2": round(A["ser"]), "fluks_bersih_total_tCO2e": round(A["net"]),
                   "emisi_bruto_per_tahun_tCO2e": round(A["emis_tot"] / 25), "serapan_bruto_per_tahun_tCO2": round(A["ser"] / 25), "fluks_bersih_per_tahun_tCO2e": round(A["net"] / 25),
                   "emisi_per_tahun_kehilangan_tCO2e": {str(2000 + y): round(float(A["emis"][y]), 1) for y in range(1, 26)},
                   "cek_konsistensi_pct": round(100 * abs((A["emis_tot"] - A["ser"]) - A["net"]) / max(1.0, abs(A["net"])), 3),
                   "stok_karbon_atas_tanah_2000_tC": round(A["agc"]), "stok_karbon_total_2000_tC": round(A["tot"]),
                   "rerata_karbon_atas_tanah_hutan_2000_tC_ha": round(A["agc_f"] / A["h2000"], 1) if A["h2000"] else None,
                   "rerata_karbon_total_hutan_2000_tC_ha": round(A["tot_f"] / A["h2000"], 1) if A["h2000"] else None},
        "emisi_frel": frel}

FIRMS = {"VIIRS S-NPP": ("viirs-snpp", 2012), "VIIRS NOAA-20": ("viirs-jpss1", 2018), "MODIS": ("modis", 2001)}
def _firms_csv(sp, y, cache):
    p = os.path.join(cache, f"{sp}_{y}.csv")
    if not os.path.exists(p):
        url = f"https://firms.modaps.eosdis.nasa.gov/data/country/{sp}/{y}/{sp}_{y}_Indonesia.csv"
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FireHotspot-PRCF"}), timeout=180).read()
        except Exception:
            return None
        open(p, "wb").write(raw)
    return p

FIRMS_NRT = {"VIIRS S-NPP": ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"), "VIIRS NOAA-20": ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"), "MODIS": ("MODIS_SP", "MODIS_NRT")}  # SP (standar) dulu, NRT untuk minggu-minggu terakhir
_KEY = []
def _firms_key():   # secret Actions FIRMS_MAP_KEY, atau kunci yang disimpan di Apps Script PRCF (sama dengan pipeline.py)
    if not _KEY:
        k = os.environ.get("FIRMS_MAP_KEY", "").strip()
        if not k and os.environ.get("ANALISIS_KEY") and os.environ.get("AKUN_URL"):
            try: k = (json.loads(urllib.request.urlopen(f'{os.environ["AKUN_URL"]}?pekerja={os.environ["ANALISIS_KEY"]}&rahasia=1', timeout=60).read()).get("firms") or "").strip()
            except Exception: k = ""
        _KEY.append(k)
    return _KEY[0]

def _firms_nrt(src, akhir, hari, cache, bb):   # NASA FIRMS Area API (resmi, kotak batas area) – tahun berjalan, belum ada di arsip tahunan; kunci MAP_KEY dari secret
    key = _firms_key()
    if not key: return None
    p = os.path.join(cache, f"api_{src}_{bb.replace(',', '_')}_{akhir}_{hari}.csv")
    if not os.path.exists(p):
        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{bb}/{hari}/{akhir}"
        try: raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "PantauRimbak-PRCF"}), timeout=180).read()
        except Exception as e: print("  FIRMS API galat:", src, str(e).replace(key, "[MAP_KEY]")[:120]); return None
        if not raw.startswith(b"latitude"): print("  FIRMS API:", src, raw[:100]); return None
        open(p, "wb").write(raw)
    return p

def hitung_titik_panas(geom, tahun=None, cache="/tmp/firms_cache"):
    from shapely import prepared
    from shapely.geometry import Point
    os.makedirs(cache, exist_ok=True); pg = prepared.prep(geom); x0, y0, x1, y1 = geom.bounds
    if tahun is None: tahun = range(2016, datetime.date.today().year + 1)
    per = {str(y): {k: 0 for k in FIRMS} for y in tahun}; bulan = {}; tersedia = []; contoh = []
    for k, (sp, y0s) in FIRMS.items():
        for y in tahun:
            if y < y0s: continue
            p = _firms_csv(sp, y, cache)
            if not p: continue
            tersedia.append(f"{k} {y}")
            with open(p, encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    la, lo = float(r["latitude"]), float(r["longitude"])
                    if not (x0 <= lo <= x1 and y0 <= la <= y1) or r.get("type", "0") not in ("0", ""): continue
                    if not pg.contains(Point(lo, la)): continue
                    per[str(y)][k] += 1; mk = r["acq_date"][:7]; bulan[mk] = bulan.get(mk, 0) + 1
                    contoh.append([r["acq_date"], r["acq_time"], k, round(la, 5), round(lo, 5), r.get("confidence", ""), float(r.get("frp") or 0)])
    # tahun yang belum punya arsip tahunan (tahun berjalan): FIRMS NRT per 5 hari sampai kemarin
    sudah = {t.split()[-1] for t in tersedia}
    bb = f"{math.floor(x0 * 100) / 100},{math.floor(y0 * 100) / 100},{math.ceil(x1 * 100) / 100},{math.ceil(y1 * 100) / 100}"
    for y in tahun:
        if str(y) in sudah: continue
        d0, d1 = datetime.date(y, 1, 1), min(datetime.date(y, 12, 31), datetime.date.today() - datetime.timedelta(days=1))
        for k, srcs in FIRMS_NRT.items():
            d = d0; ok = False
            while d <= d1:
                n = min(5, (d1 - d).days + 1); tgl_sudah = set()
                for src in srcs:   # per tanggal: pakai sumber pertama (SP) yang punya data; tanggal yang belum ada di SP diisi NRT
                    p = _firms_nrt(src, d.isoformat(), n, cache, bb)
                    if not p: continue
                    ok = True; tgl_ini = set()
                    with open(p, encoding="utf-8") as f:
                        for r in csv.DictReader(f):
                            t = r.get("acq_date", "")
                            if t in tgl_sudah or not t.startswith(str(y)): continue
                            tgl_ini.add(t)
                            la, lo = float(r["latitude"]), float(r["longitude"])
                            if not (x0 <= lo <= x1 and y0 <= la <= y1) or r.get("type", "0") not in ("0", ""): continue
                            if not pg.contains(Point(lo, la)): continue
                            per[str(y)][k] += 1; mk = t[:7]; bulan[mk] = bulan.get(mk, 0) + 1
                            contoh.append([t, r["acq_time"], k, round(la, 5), round(lo, 5), r.get("confidence", ""), float(r.get("frp") or 0)])
                    tgl_sudah |= tgl_ini
                d += datetime.timedelta(days=n)
            if ok: tersedia.append(f"{k} {y} (FIRMS API SP/NRT s.d. {d1.isoformat()})")
    contoh.sort(reverse=True)
    ada = sorted({int(w) for t in tersedia for w in t.replace("(", " ").split() if w.isdigit() and len(w) == 4 and int(w) in set(tahun)})
    per = {y: v for y, v in per.items() if int(y) in ada}   # tahun tanpa berkas data tidak ditampilkan sebagai nol
    if not ada: return None
    return {"periode": f"{min(ada)}–{max(ada)}", "per_tahun": per, "per_bulan": dict(sorted(bulan.items())), "terbaru": contoh[:50],
            "total": sum(sum(v.values()) for v in per.values()), "arsip_dipakai": tersedia,
            "catatan": "Hanya deteksi tipe 0 (dugaan kebakaran vegetasi). Satu kebakaran bisa terdeteksi oleh beberapa satelit/lintasan, jadi jumlah titik ≠ jumlah kejadian. Tahun berjalan diambil dari NASA FIRMS API (Standard Processing, lalu NRT untuk hari-hari terakhir) karena arsip tahunannya belum terbit."}

def wilayah(geom):
    """Desa/kecamatan/kabupaten yang beririsan (dari data/wilayah, BPS/BIG + Kepmendagri 2025)."""
    from shapely.geometry import Polygon, box
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "wilayah")
    idx = json.load(open(os.path.join(root, "indeks.json"))); b = geom.bounds; out = []
    for p in idx["provinsi"]:
        pb = p["bbox"]
        if pb[0] > b[2] or pb[2] < b[0] or pb[1] > b[3] or pb[3] < b[1]: continue
        J = json.load(open(os.path.join(root, p["file"])))
        for d in J["desa"]:
            db = d[4]
            if db[0] > b[2] or db[2] < b[0] or db[1] > b[3] or db[3] < b[1]: continue
            rings = []
            for r in d[5]:
                x = y = 0; pts = []
                for i in range(0, len(r), 2): x += r[i]; y += r[i + 1]; pts.append((x / 1e5, y / 1e5))
                rings.append(pts)
            try:
                poly = Polygon(rings[0]).buffer(0)
                inter = poly.intersection(geom).area
            except Exception:
                continue
            if inter > 0 and inter / max(poly.area, 1e-12) > 0.001:
                kec = J["kec"].get(d[2], ["", ""]); kab = J["kab"].get(kec[1], ["", J["prov"]])
                out.append({"desa": d[1], "kec": kec[0], "kab": kab[0], "prov": kab[1] or J["prov"], "persen_desa_tercakup": round(100 * inter / poly.area, 1)})
    return sorted(out, key=lambda r: -r["persen_desa_tercakup"])[:60]
