"""
Impor PETA TUTUPAN LAHAN TAHUNAN LOKAL (sudah di-groundcheck) per Hutan Desa – Fire Hotspot PRCF
==================================================================================================
Sumber: data/sumber/prcf_nanga_lauk/TL_HD<tahun>Final.shp (Yayasan PRCF Indonesia, Landcover Analysis 2006–2026 – interpretasi visual
Landsat 5/7/8 + ArcGIS Imagery, groundcheck lapangan; lihat SUMBER.md). Proyeksi asli WGS 1984 UTM 49N (EPSG:32649); LUAS DIHITUNG DI UTM 49N
(planimetrik) persis seperti laporan PRCF, geometri disimpan dalam WGS84 untuk peta & SHP aplikasi.
Keluaran (dipakai bersama alat Tutupan lahan, Emisi karbon, Indikator & Laporan lewat assets/model_klhk.js → FHModelKLHK.muat):
  data/tutupan_lokal/<lokasi>_<tahun>.geojson   peta per tahun (kode KLHK, kelas, luas_ha)
  data/tutupan_lokal/ubah/<lokasi>_<a>_<b>.geojson  poligon perubahan untuk setiap pasangan tahun a<b (dari, ke, luas_ha)
  data/tutupan_lokal/<lokasi>.json              luas per kelas per tahun, transisi tahunan (y-1→y), matriks tiap pasangan tahun
Pemakaian: python scripts/impor_prcf.py   (uji otomatis terhadap Tabel 1 & 2 laporan ada di scripts/uji_karbon.py)
"""
import os, json, glob, re, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "sumber", "prcf_nanga_lauk"); OUT = os.path.join(ROOT, "data", "tutupan_lokal")
KODE = {"Hutan Lahan Kering Sekunder": 2002, "Hutan Rawa Sekunder": 20051, "Semak Belukar Rawa": 20071, "Pertanian Lahan Kering Campur Semak": 20092,
        "Lahan Terbuka": 2014, "Air/Danau/Sungai": 5001}
NAMA = {2002: "Hutan Lahan Kering Sekunder", 20051: "Hutan Rawa Sekunder", 20071: "Belukar Rawa (Semak Belukar Rawa)", 20092: "Pertanian Lahan Kering Campur Semak",
        2014: "Lahan Terbuka", 5001: "Tubuh Air (Air/Danau/Sungai)"}
LOKASI = "nangalauk"

def main():
    import shapefile
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union, transform as stf
    from shapely import set_precision
    from pyproj import Transformer
    import numpy as np, shapely
    from shapely.geometry import Polygon, MultiPolygon, GeometryCollection
    TR = Transformer.from_crs(32649, 4326, always_xy=True)
    def poli(g):   # hanya bagian poligon (hasil irisan bisa berisi garis/titik)
        P = []
        for x in (g.geoms if hasattr(g, "geoms") else [g]):
            if isinstance(x, Polygon) and not x.is_empty: P.append(x)
            elif isinstance(x, (MultiPolygon, GeometryCollection)): P += [q for q in poli(x).geoms] if not poli(x).is_empty else []
        return MultiPolygon(P) if len(P) != 1 else P[0] if P else MultiPolygon([])
    def wgs(g):    # UTM 49N → WGS84, koordinat 7 desimal (±1 cm), tetap valid
        x = shapely.transform(poli(g), lambda c: np.round(np.column_stack(TR.transform(c[:, 0], c[:, 1])), 7))
        return mapping(poli(shapely.make_valid(x)))
    peta = {}
    for f in sorted(glob.glob(os.path.join(SRC, "TL_HD*Final.shp"))):
        y = int(re.search(r"TL_HD(\d{4})Final", f).group(1)); r = shapefile.Reader(f, encoding="utf-8")
        prj = open(f[:-4] + ".prj").read(); assert "UTM_Zone_49N" in prj, f + ": proyeksi bukan UTM 49N"
        d = {}
        for s, rec in zip(r.shapes(), r.records()):
            nm = str(rec[0]).strip(); assert nm in KODE, f"{f}: kelas tak dikenal '{nm}'"
            g = shape(s.__geo_interface__).buffer(0); k = KODE[nm]; d[k] = unary_union([d[k], g]) if k in d else g
        peta[y] = d
    T = sorted(peta); os.makedirs(OUT, exist_ok=True)
    luas = {str(y): {str(k): round(g.area / 1e4, 4) for k, g in sorted(peta[y].items())} for y in T}
    for y in T:
        fs = [{"type": "Feature", "properties": {"kode": k, "kelas": NAMA[k], "tahun": y, "luas_ha": round(g.area / 1e4, 4)},
               "geometry": wgs(g)} for k, g in sorted(peta[y].items())]
        json.dump({"type": "FeatureCollection", "lokasi": LOKASI, "tahun": y, "sumber": "PRCF", "features": fs}, open(os.path.join(OUT, f"{LOKASI}_{y}.geojson"), "w"), separators=(",", ":"))
    def silang(a, b):   # → [(dari, ke, geom UTM)] semua sel matriks a→b (termasuk diagonal)
        out = []
        for ka, ga in peta[a].items():
            for kb, gb in peta[b].items():
                if not ga.intersects(gb): continue
                x = poli(ga.intersection(gb))
                if x.area > 0.01: out.append((ka, kb, x))   # > 0,01 m² (sisa digitasi diabaikan)
        return out
    matriks, ubah = {}, []
    for i, a in enumerate(T):
        for b in T[i + 1:]:
            S = silang(a, b); matriks[f"{a}-{b}"] = [[ka, kb, round(x.area / 1e4, 4)] for ka, kb, x in S if x.area / 1e4 >= 0.00005]
            for ka, kb, x in S:
                if ka != kb and x.area / 1e4 >= 0.0001:
                    ubah.append({"type": "Feature", "properties": {"a": a, "b": b, "dari": ka, "ke": kb, "luas_ha": round(x.area / 1e4, 4)}, "geometry": wgs(x)})
    du = os.path.join(OUT, "ubah"); os.makedirs(du, exist_ok=True)   # satu berkas per pasangan tahun (dimuat hanya saat ekspor SHP)
    for f in glob.glob(os.path.join(du, f"{LOKASI}_*.geojson")): os.remove(f)
    for i, a in enumerate(T):
        for b in T[i + 1:]:
            json.dump({"type": "FeatureCollection", "lokasi": LOKASI, "a": a, "b": b, "features": [x for x in ubah if x["properties"]["a"] == a and x["properties"]["b"] == b]},
                      open(os.path.join(du, f"{LOKASI}_{a}_{b}.geojson"), "w"), separators=(",", ":"))
    tahunan = {str(b): [x for x in matriks[f"{b - 1}-{b}"] if x[0] != x[1]] for b in T[1:] if f"{b - 1}-{b}" in matriks}
    meta = {"lokasi": LOKASI, "hutan_desa": "Hutan Desa Nanga Lauk", "id": "prcf", "nama": "Peta tahunan PRCF 2006–2026 (interpretasi Landsat + groundcheck)",
            "sumber": "Yayasan PRCF Indonesia – Nanga Lauk Village Forest Conservation Project (Rimbak Pakai Pengidup), Landcover Analysis 2006–2026 (final)",
            "metode": "Interpretasi visual (digitasi layar: rona, warna, bentuk, ukuran, tekstur, pola, bayangan, situs, asosiasi) citra Landsat 5/7/8 30 m (pan-sharpening 15 m) "
                      "dengan detail ArcGIS Imagery resolusi tinggi; diverifikasi ArcGIS Imagery & groundcheck lapangan (foto per kelas). Sistem kelas sama tiap tahun. Luas pada WGS 1984 UTM 49N.",
            "groundcheck": "Suksesi danau → semak belukar rawa didominasi Putat (pakan lebah madu); lahan pertanian masyarakat (kratom, timun, sayuran) pada bekas hutan rawa sekunder.",
            "nama_en": "PRCF annual maps 2006–2026 (Landsat interpretation + ground check)", "singkat": "Peta tahunan PRCF", "singkat_en": "PRCF annual maps",
            "sumber_en": "Yayasan PRCF Indonesia – Nanga Lauk Village Forest Conservation Project (Rimbak Pakai Pengidup), Landcover Analysis 2006–2026 (final)",
            "metode_en": "Visual interpretation (on-screen digitising: tone, colour, shape, size, texture, pattern, shadow, site, association) of Landsat 5/7/8 30 m imagery (15 m pan-sharpening) "
                         "with high-resolution ArcGIS Imagery for detail; verified with ArcGIS Imagery and field ground checks (photos per class). Same class system every year. Areas in WGS 1984 UTM 49N.",
            "groundcheck_en": "Lake succession → swamp shrub dominated by Putat (bee forage); community farmland (kratom, cucumber, vegetables) on former secondary swamp forest.",
            "kelas_asli": {str(v): k for k, v in KODE.items()}, "nama_kelas": {str(k): v for k, v in NAMA.items()},
            "tahun_min": T[0], "tahun_maks": T[-1], "luas": luas, "transisi_tahunan": tahunan, "matriks": matriks,
            "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    json.dump(meta, open(os.path.join(OUT, f"{LOKASI}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"lokasi": {LOKASI: {"id": "prcf", "nama": meta["nama"], "nama_en": meta["nama_en"], "singkat": meta["singkat"], "singkat_en": meta["singkat_en"], "tahun_min": T[0], "tahun_maks": T[-1]}}}, open(os.path.join(OUT, "indeks.json"), "w"), ensure_ascii=False, indent=1)
    print(T[0], "–", T[-1], "tahun:", len(T), "| poligon perubahan:", len(ubah), "| 2006:", luas[str(T[0])], "| 2026:", luas[str(T[-1])])

if __name__ == "__main__":
    main()
