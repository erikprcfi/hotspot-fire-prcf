"""
KLASIFIKASI TUTUPAN LAHAN dari citra Sentinel-2 (dilatih dari Peta Penutupan Lahan KLHK/Kemenhut 2025 + peta PRCF ber-groundcheck)
==============================================================================================================================
Tujuan: mesin belajar rona/warna (reflektans 6 kanal), indeks vegetasi/air/kelembapan, tekstur (keragaman & rerata lokal 5×5 piksel)
dan bentang (ketinggian & lereng Copernicus DEM 30 m) tiap kelas tutupan lahan, lalu memetakan tutupan lahan tiap tahun secara mandiri.
Hasilnya PEMBANDING independen untuk peta resmi (bukan pengganti) – akurasi diuji pada blok wilayah yang tidak dipakai melatih.

Data:
 - Citra: Sentinel-2 L2A (ESA Copernicus, Earth Search AWS), grid 20 m UTM 49N, median semua citra cerah dalam setahun
   (masker awan/bayangan SCL diperlebar 60 m; dipakai piksel SCL vegetasi/tanah/air).
 - Label latih: Peta Penutupan Lahan 2025 Kab. Kapuas Hulu (data/klhk/kapuashulu_2025.geojson.gz) di wilayah 6 Hutan Desa + penyangga 3 km;
   di dalam Hutan Desa Nanga Lauk dipakai peta PRCF 2025 (lebih rinci, ber-groundcheck). Poligon dikikis 60 m agar sampel tidak di tepi kelas.
 - Model: Random Forest (scikit-learn, 300 pohon, bobot kelas seimbang). Validasi: blok 2 km × 2 km dibagi acak 70% latih / 30% uji
   (validasi spasial – sampel uji tidak bertetangga dengan sampel latih). Dilaporkan akurasi keseluruhan, kappa, akurasi pembuat & pengguna per kelas.
Keluaran: data/klasifikasi/model.json (metrik, matriks kesalahan, jumlah sampel), data/klasifikasi/<lokasi>.json (luas kelas di dalam
Hutan Desa per tahun + persen piksel cerah). Pemakaian: python scripts/klasifikasi_citra.py [tahun_latih=2025] [tahun_lain ...]
"""
import os, sys, json, math, gzip, datetime, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bekas_terbakar as BT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "klasifikasi")
RES = 20.0; BUF = 3000.0; NAMAF = ["biru", "hijau", "merah", "nir", "swir1", "swir2", "ndvi", "ndwi", "mndwi", "nbr", "ndmi", "tinggi", "lereng", "sd_ndvi", "sd_nir", "rt_ndvi"]
BAND = ["blue", "green", "red", "nir08", "swir16", "swir22"]

def grid(site):
    from shapely.geometry import shape
    from shapely.ops import unary_union
    import shapely
    from pyproj import Transformer
    from rasterio.transform import from_origin
    T = Transformer.from_crs(4326, 32649, always_xy=True)
    hd = unary_union([shape(f["geometry"]) for f in site["hd"]["features"]]).buffer(0)
    hu = shapely.transform(hd, lambda c: np.column_stack(T.transform(c[:, 0], c[:, 1])))
    x0, y0, x1, y1 = hu.buffer(BUF).bounds; W, H = int(math.ceil((x1 - x0) / RES)), int(math.ceil((y1 - y0) / RES))
    return hd, hu, (H, W), from_origin(x0, y1, RES, RES)

def komposit(hd, shape_, tr, tahun, maks=10):
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.crs import CRS
    from scipy import ndimage
    from pyproj import Transformer
    Ti = Transformer.from_crs(32649, 4326, always_xy=True); H, W = shape_
    lo0, la0 = Ti.transform(tr.c, tr.f - H * RES); lo1, la1 = Ti.transform(tr.c + W * RES, tr.f)
    it = sorted(BT.stac([lo0, la0, lo1, la1], f"{tahun}-01-01", f"{tahun}-12-31", maxcc=60), key=lambda f: f["properties"]["eo:cloud_cover"])
    st = {b: [] for b in BAND}; dst = CRS.from_epsg(32649); n = 0
    for f in it:
        if n >= maks: break
        A = f["assets"]
        def rd(k, res=Resampling.bilinear, dt="float32"):
            arr = np.zeros(shape_, dt)
            with rasterio.open(A[k]["href"]) as src: reproject(rasterio.band(src, 1), arr, dst_transform=tr, dst_crs=dst, resampling=res, src_nodata=0, dst_nodata=0)
            if k == "scl": return arr
            rb = (A[k].get("raster:bands") or [{}])[0]; return np.where(arr > 0, arr * rb.get("scale", 1e-4) + rb.get("offset", 0.0), np.nan).astype("float32")
        try:
            scl = rd("scl", Resampling.nearest, "uint8"); bad = ndimage.binary_dilation(np.isin(scl, [0, 1, 2, 3, 8, 9, 10, 11]), iterations=3); ok = np.isin(scl, [4, 5, 6]) & ~bad
            if ok.mean() < 0.10: continue
            for b in BAND: st[b].append(np.where(ok, rd(b), np.nan))
            n += 1
        except Exception as e: print("   lewati", f["id"], str(e)[:80])
    if not n: return None, 0, 0
    with np.errstate(all="ignore"):
        import warnings; warnings.simplefilter("ignore")
        M = {b: np.nanmedian(np.stack(st[b]), axis=0) for b in BAND}
    cerah = float(np.isfinite(M["red"]).mean()); return M, n, cerah

DEMC = {}
def dem(shape_, tr):
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.crs import CRS
    from pyproj import Transformer
    H, W = shape_; Ti = Transformer.from_crs(32649, 4326, always_xy=True)
    lo0, la0 = Ti.transform(tr.c, tr.f - H * RES); lo1, la1 = Ti.transform(tr.c + W * RES, tr.f); z = np.full(shape_, np.nan, "float32")
    for la in range(int(math.floor(la0)), int(math.floor(la1)) + 1):
        for lo in range(int(math.floor(lo0)), int(math.floor(lo1)) + 1):
            nm = f"Copernicus_DSM_COG_10_{'N' if la >= 0 else 'S'}{abs(la):02d}_00_{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00_DEM"
            a = np.full(shape_, np.nan, "float32")
            try:
                with rasterio.open(f"/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/{nm}/{nm}.tif") as src:
                    reproject(rasterio.band(src, 1), a, dst_transform=tr, dst_crs=CRS.from_epsg(32649), resampling=Resampling.bilinear, dst_nodata=np.nan)
                z = np.where(np.isfinite(a), a, z)
            except Exception as e: print("   DEM", nm, str(e)[:60])
    gy, gx = np.gradient(np.nan_to_num(z, nan=np.nanmean(z)), RES); return z, np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")

def fitur(M, z, sl):
    from scipy import ndimage
    b, g, r, n, s1, s2 = (M[k] for k in BAND)
    with np.errstate(all="ignore"):
        nd = lambda a, c: (a - c) / (a + c)
        ndvi, ndwi, mndwi, nbr, ndmi = nd(n, r), nd(g, n), nd(g, s1), nd(n, s2), nd(n, s1)
    def lok(a):   # rerata & simpangan baku lokal 5×5 (tekstur), abaikan NaN
        v = np.isfinite(a); a0 = np.where(v, a, 0); k = np.ones((5, 5))
        c = ndimage.convolve(v.astype("float32"), k, mode="nearest"); s = ndimage.convolve(a0, k, mode="nearest"); q = ndimage.convolve(a0 * a0, k, mode="nearest")
        with np.errstate(all="ignore"): m = s / c; sd = np.sqrt(np.maximum(q / c - m * m, 0))
        return np.where(v, m, np.nan), np.where(v, sd, np.nan)
    rt_ndvi, sd_ndvi = lok(ndvi); _, sd_nir = lok(n)
    return np.stack([b, g, r, n, s1, s2, ndvi, ndwi, mndwi, nbr, ndmi, z, sl, sd_ndvi, sd_nir, rt_ndvi]).astype("float32")

def label(hu, hd, shape_, tr, lok):
    """raster label: KLHK 2025 (dikikis 60 m); di dalam HD Nanga Lauk: peta PRCF 2025 (dikikis 40 m). sumber: 1 = KLHK, 2 = PRCF."""
    import shapely
    from shapely.geometry import shape, box
    from rasterio import features
    from pyproj import Transformer
    T = Transformer.from_crs(4326, 32649, always_xy=True); U = lambda g: shapely.transform(g, lambda c: np.column_stack(T.transform(c[:, 0], c[:, 1])))
    H, W = shape_; bb = box(tr.c, tr.f - H * RES, tr.c + W * RES, tr.f); P = []
    for f in KLHK_ALL:
        g = f[0]
        if g.intersects(BBW[lok]):
            gu = U(g).intersection(bb).buffer(-60)
            if not gu.is_empty: P.append((shapely.geometry.mapping(gu), f[1]))
    lab = features.rasterize(P, out_shape=shape_, transform=tr, fill=0, dtype="int32") if P else np.zeros(shape_, "int32"); src = np.where(lab > 0, 1, 0).astype("uint8")
    pl = os.path.join(DATA, "tutupan_lokal", f"{lok}_2025.geojson")
    if os.path.exists(pl):
        inside = features.rasterize([(shapely.geometry.mapping(hu), 1)], out_shape=shape_, transform=tr, fill=0, dtype="uint8").astype(bool)
        Q = [(shapely.geometry.mapping(U(shape(x["geometry"]).buffer(0)).buffer(-40)), int(x["properties"]["kode"])) for x in json.load(open(pl))["features"]]
        Q = [(g, k) for g, k in Q if g and g.get("coordinates")]
        lp = features.rasterize(Q, out_shape=shape_, transform=tr, fill=0, dtype="int32")
        lab = np.where(inside, lp, lab); src = np.where(inside & (lp > 0), 2, np.where(inside, 0, src)).astype("uint8")
    return lab, src

def main():
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import confusion_matrix, cohen_kappa_score
    from shapely.geometry import shape
    import shapely
    from rasterio import features
    global KLHK_ALL, BBW
    th_latih = int(sys.argv[1]) if len(sys.argv) > 1 else 2025; th_lain = [int(x) for x in sys.argv[2:]]
    geo = json.load(open(os.path.join(DATA, "geo.json")))["sites"]; os.makedirs(OUT, exist_ok=True)
    KLHK_ALL = [(shape(x["geometry"]).buffer(0), int(x["properties"]["kode"])) for x in json.load(gzip.open(os.path.join(DATA, "klhk", "kapuashulu_2025.geojson.gz"), "rt"))["features"]]
    REG = {}; BBW = {}; rng = np.random.default_rng(42); Xs, ys, bs, ss = [], [], [], []
    for s in geo:
        hd, hu, shp_, tr = grid(s); H, W = shp_
        from pyproj import Transformer
        Ti = Transformer.from_crs(32649, 4326, always_xy=True); BBW[s["id"]] = shapely.box(*Ti.transform(tr.c, tr.f - H * RES), *Ti.transform(tr.c + W * RES, tr.f))
        t0 = time.time(); M, n, cerah = komposit(hd, shp_, tr, th_latih); z, sl = dem(shp_, tr)
        print(s["id"], th_latih, "citra", n, "cerah", round(cerah * 100), "%", round(time.time() - t0), "dtk", flush=True)
        if M is None: continue
        F = fitur(M, z, sl); lab, src = label(hu, hd, shp_, tr, s["id"])
        inside = features.rasterize([(shapely.geometry.mapping(hu), 1)], out_shape=shp_, transform=tr, fill=0, dtype="uint8").astype(bool)
        REG[s["id"]] = (hd, hu, shp_, tr, inside, z, sl, n, cerah)
        ok = (lab > 0) & np.all(np.isfinite(F), axis=0); yy, xx = np.nonzero(ok)
        blk = (yy * RES // 2000).astype(int) * 10000 + (xx * RES // 2000).astype(int) + hash(s["id"]) % 1000 * 10 ** 7
        for k in np.unique(lab[ok]):   # sampel acak per kelas per wilayah (maks 2500)
            ix = np.nonzero(lab[yy, xx] == k)[0]; ix = rng.choice(ix, min(len(ix), 2500), replace=False)
            Xs.append(F[:, yy[ix], xx[ix]].T); ys.append(np.full(len(ix), k)); bs.append(blk[ix]); ss.append(src[yy[ix], xx[ix]])
    X = np.concatenate(Xs); y = np.concatenate(ys); B = np.concatenate(bs); S = np.concatenate(ss)
    cnt = {int(k): int((y == k).sum()) for k in np.unique(y)}; keep = np.isin(y, [k for k, v in cnt.items() if v >= 150])
    X, y, B, S = X[keep], y[keep], B[keep], S[keep]; ub = np.unique(B); uji_b = set(rng.choice(ub, int(len(ub) * 0.3), replace=False).tolist()); uji = np.isin(B, list(uji_b))
    rf = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced_subsample", n_jobs=-1, random_state=42).fit(X[~uji], y[~uji])
    pr = rf.predict(X[uji]); K = sorted(np.unique(y)); cm = confusion_matrix(y[uji], pr, labels=K)
    def met(m):
        tot = m.sum(); oa = np.trace(m) / tot if tot else 0
        pa = {int(K[i]): round(float(m[i, i] / m[i].sum()), 3) if m[i].sum() else None for i in range(len(K))}; ua = {int(K[i]): round(float(m[i, i] / m[:, i].sum()), 3) if m[:, i].sum() else None for i in range(len(K))}
        return round(float(oa), 3), pa, ua
    oa, pa, ua = met(cm); kap = float(cohen_kappa_score(y[uji], pr))
    per_src = {}
    for sv, nm in ((1, "KLHK 2025"), (2, "PRCF 2025 (Nanga Lauk)")):
        mm = uji & (S == sv)
        if mm.sum(): per_src[nm] = {"n_uji": int(mm.sum()), "akurasi": round(float((rf.predict(X[mm]) == y[mm]).mean()), 3)}
    HUT = {2001, 2002, 2004, 20041, 2005, 20051, 2006}; hf = np.isin(y[uji], list(HUT)) == np.isin(pr, list(HUT))
    info = {"dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "metode": __doc__.strip(), "tahun_latih": th_latih, "fitur": NAMAF,
            "kelas": [int(k) for k in K], "sampel_per_kelas": {int(k): int((y == k).sum()) for k in K}, "sampel_latih": int((~uji).sum()), "sampel_uji": int(uji.sum()),
            "akurasi_keseluruhan": oa, "kappa": round(kap, 3), "akurasi_hutan_bukan_hutan": round(float(hf.mean()), 3), "akurasi_pembuat": pa, "akurasi_pengguna": ua,
            "matriks_kesalahan": {"kelas": [int(k) for k in K], "baris_acuan_kolom_prediksi": cm.tolist()}, "akurasi_per_sumber_label": per_src,
            "kepentingan_fitur": {NAMAF[i]: round(float(v), 4) for i, v in sorted(enumerate(rf.feature_importances_), key=lambda z: -z[1])}}
    json.dump(info, open(os.path.join(OUT, "model.json"), "w"), ensure_ascii=False, indent=1)
    print("akurasi", oa, "kappa", round(kap, 3), "hutan/bukan", info["akurasi_hutan_bukan_hutan"], per_src, flush=True)
    for s in geo:   # peta tiap tahun di dalam Hutan Desa
        if s["id"] not in REG: continue
        hd, hu, shp_, tr, inside, z, sl, n0, c0 = REG[s["id"]]; fo = os.path.join(OUT, f"{s['id']}.json")
        R = json.load(open(fo)) if os.path.exists(fo) else {"lokasi": s["id"], "hutan_desa": s["hd_nama"], "tahun": {}}
        for th in [th_latih] + th_lain:
            M, n, cerah = komposit(hd, shp_, tr, th) if th != th_latih or True else (None, 0, 0)
            if M is None: R["tahun"][str(th)] = {"status": "tidak ada citra cerah"}; continue
            F = fitur(M, z, sl); v = inside & np.all(np.isfinite(F), axis=0); P = np.zeros(shp_, "int32")
            if v.any(): P[v] = rf.predict(F[:, v].T)
            ha = RES * RES / 1e4; area = {int(k): round(float((P[v] == k).sum() * ha), 2) for k in np.unique(P[v])}
            R["tahun"][str(th)] = {"status": "selesai", "citra": n, "cerah_persen": round(float(v.sum() / max(1, inside.sum())) * 100, 1), "luas_ha": area, "tak_terpetakan_ha": round(float((inside & ~v).sum() * ha), 2)}
            print(" ", s["id"], th, "citra", n, "terpetakan", R["tahun"][str(th)]["cerah_persen"], "%", area, flush=True)
        R["model"] = {"akurasi_keseluruhan": oa, "kappa": round(kap, 3), "tahun_latih": th_latih}; json.dump(R, open(fo, "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
