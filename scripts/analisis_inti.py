"""
Inti analisis area (poligon) – Fire Hotspot PRCF, setara Global Forest Watch / Global Nature Watch (WRI)
=======================================================================================================
Dipakai untuk 6 Hutan Desa (scripts/karbon_lahan.py) DAN untuk SHP yang diunggah pengguna (scripts/analisis_antrean.py),
sehingga cara hitungnya identik. Semua dihitung langsung dari raster/arsip resmi (tanpa estimasi buatan):
 - Tutupan & penggunaan lahan 2000/2005/2010/2015/2020: GLAD GLCLUC 2000–2020 v2 (Potapov et al. 2022), 30 m
 - Hutan 2000 & kehilangan tutupan pohon 2001–2025: Hansen/UMD GFC-2025-v1.13 (Hansen et al. 2013); hutan = tajuk >= 30 %
 - Emisi bruto, serapan bruto, fluks bersih GRK hutan 2001–2025: Harris et al. 2021 + Gibbs et al. 2025, versi 20260327 (= GFW/GNW)
 - Stok karbon tahun 2000 (atas tanah & total): Harris et al. 2021, versi 20230222
 - Titik panas 2016–2025: arsip tahunan resmi NASA FIRMS (VIIRS S-NPP, VIIRS NOAA-20, MODIS) untuk Indonesia
Raster di grid 0,00025° (ubin 10°), jendela dibulatkan ke piksel utuh (tanpa resampling), luas piksel geodesik,
piksel masuk poligon bila pusat piksel di dalam poligon (aturan rasterisasi yang sama dengan GFW).
"""
import os, io, csv, json, math, urllib.request
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
SUMBER = {"tutupan_lahan": "GLAD Global Land Cover and Land Use Change 2000–2020 v2 (Potapov et al. 2022, Front. Remote Sens.), 30 m, CC BY 4.0",
          "kehilangan_pohon": "Hansen/UMD/Google/USGS/NASA Global Forest Change GFC-2025-v1.13 (Hansen et al. 2013, Science), 30 m, CC BY 4.0",
          "fluks_karbon": "Forest GHG emissions, removals & net flux 2001–2025 (Harris et al. 2021, Nat. Clim. Change; Gibbs et al. 2025, ESSD), versi 20260327 – sama dengan Global Forest Watch/Global Nature Watch, CC BY 4.0",
          "stok_karbon": "Stok karbon hutan tahun 2000 (Harris et al. 2021), versi 20230222, CC BY 4.0",
          "titik_panas": "NASA FIRMS arsip tahunan (VIIRS S-NPP VNP14IMG, VIIRS NOAA-20 VJ114IMG, MODIS MCD14ML) untuk Indonesia"}

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

def hitung_raster(geom):
    """geom: shapely (Multi)Polygon WGS84. Mengembalikan tutupan lahan, kehilangan hutan & karbon."""
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio import features
    from shapely.geometry import box, mapping
    nk = len(KELAS)
    A = {"luas": 0.0, "lc": {y: np.zeros(nk) for y in TAHUN_LC}, "mat": np.zeros((nk, nk)), "h2000": 0.0, "loss": np.zeros(26),
         "emis": np.zeros(26), "emis_tot": 0.0, "ser": 0.0, "net": 0.0, "agc": 0.0, "tot": 0.0, "agc_f": 0.0, "tot_f": 0.0}
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
        lc = {}
        for y in TAHUN_LC:
            lc[y] = _kls(chk(*rd(GLC.format(y, tile)), f"GLCLU {y}"))
            for i in range(nk): A["lc"][y][i] += float((pm * (lc[y] == i)).sum())
        a0, a1 = lc[2000][m], lc[2020][m]; pw = pix[m]
        ok = (a0 >= 0) & (a1 >= 0); np.add.at(A["mat"], (a0[ok], a1[ok]), pw[ok])
        fl = {k: np.nan_to_num(chk(*rd(u.format(tile)), k).astype("float64")) * m for k, u in FLUX.items()}
        A["emis_tot"] += float(fl["emisi"].sum()); A["ser"] += float(fl["serapan"].sum()); A["net"] += float(fl["bersih"].sum())
        for y in range(1, 26): A["emis"][y] += float(fl["emisi"][ly == y].sum())
        st = {k: np.nan_to_num(chk(*rd(u.format(tile)), k).astype("float64")) for k, u in STOK.items()}
        A["agc"] += float((st["agc"] * pm).sum()); A["tot"] += float((st["total"] * pm).sum())
        A["agc_f"] += float((st["agc"] * pm * forest).sum()); A["tot_f"] += float((st["total"] * pm * forest).sum())
    loss = {str(2000 + y): round(A["loss"][y], 2) for y in range(1, 26)}; lt = sum(loss.values())
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
                   "rerata_karbon_total_hutan_2000_tC_ha": round(A["tot_f"] / A["h2000"], 1) if A["h2000"] else None}}

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

def hitung_titik_panas(geom, tahun=range(2016, 2026), cache="/tmp/firms_cache"):
    from shapely import prepared
    from shapely.geometry import Point
    os.makedirs(cache, exist_ok=True); pg = prepared.prep(geom); x0, y0, x1, y1 = geom.bounds
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
    contoh.sort(reverse=True)
    return {"periode": f"{min(tahun)}–{max(tahun)}", "per_tahun": per, "per_bulan": dict(sorted(bulan.items())), "terbaru": contoh[:50],
            "total": sum(sum(v.values()) for v in per.values()), "arsip_dipakai": tersedia,
            "catatan": "Hanya deteksi tipe 0 (dugaan kebakaran vegetasi). Satu kebakaran bisa terdeteksi oleh beberapa satelit/lintasan, jadi jumlah titik ≠ jumlah kejadian. Arsip tahunan NASA untuk tahun berjalan belum terbit."}

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
