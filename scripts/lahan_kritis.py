"""
LAHAN KRITIS per Hutan Desa & untuk SHP unggahan – Pantau Rimbak PRCF
=====================================================================
Sumber: Peta Lahan Kritis Kabupaten Kapuas Hulu 2022 (kolom `kritis`: Tidak Kritis / Potensial Kritis / Agak Kritis / Kritis / Sangat Kritis;
kolom `bpdas`: wilayah kerja BPDAS), WGS84 – data/sumber/lahan_kritis/ (diserahkan Yayasan PRCF Indonesia, 2 Nov 2026).
Luas dihitung pada WGS 1984 UTM 49N (planimetrik) di dalam batas area. Disilangkan dengan tutupan lahan acuan yang dipakai aplikasi:
peta tahunan lokal ber-groundcheck bila ada (Nanga Lauk: PRCF 2025), selain itu Peta Penutupan Lahan KLHK/Kemenhut terbaru (2025).
Pemakaian:
  python scripts/lahan_kritis.py impor <berkas.shp|zip> <tahun>   → data/lahan_kritis/kapuashulu_<tahun>.geojson.gz (seluruh kabupaten)
  python scripts/lahan_kritis.py                                   → data/lahan_kritis/<lokasi>_<tahun>.geojson + <lokasi>.json untuk 6 Hutan Desa
Fungsi hitung(geom, klhk) dipakai juga oleh scripts/analisis_antrean.py (SHP unggahan) dan scripts/karbon_lahan.py.
"""
import os, sys, json, re, glob, gzip, zipfile, tempfile, datetime
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "lahan_kritis")
KELAS = {"Tidak Kritis": 1, "Potensial Kritis": 2, "Agak Kritis": 3, "Kritis": 4, "Sangat Kritis": 5}
NAMA = {v: k for k, v in KELAS.items()}
HUTAN = {2001, 2002, 2004, 20041, 2005, 20051, 2006}
SUMBER = "Peta Lahan Kritis Kabupaten Kapuas Hulu 2022 (kelas: Tidak Kritis, Potensial Kritis, Agak Kritis, Kritis, Sangat Kritis; atribut BPDAS)"

def _utm():
    import shapely
    from pyproj import Transformer
    TR = Transformer.from_crs(4326, 32649, always_xy=True)
    return lambda g: shapely.transform(g, lambda c: np.column_stack(TR.transform(c[:, 0], c[:, 1])))

def impor(src, tahun):
    import shapefile, shapely
    from shapely.geometry import shape, mapping
    tmp = None
    if src.lower().endswith(".zip"):
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(src).extractall(tmp); src = [os.path.join(r, f) for r, _, fs in os.walk(tmp) for f in fs if f.lower().endswith(".shp")][0]
    prj = open(src[:-4] + ".prj").read(); assert "GCS_WGS_1984" in prj or "WGS 84" in prj, "proyeksi harus WGS84 geografis"
    r = shapefile.Reader(src, encoding="utf-8"); F = []; tak = {}
    for s, rec in zip(r.shapes(), r.records()):
        d = rec.as_dict(); k = str(d.get("kritis", "")).strip()
        if k not in KELAS: tak[k] = tak.get(k, 0) + 1; continue
        g = shape(s.__geo_interface__).buffer(0)
        if g.is_empty: continue
        g = shapely.transform(g, lambda c: np.round(c, 6)).buffer(0)   # koordinat 6 desimal (≈ 0,1 m) agar berkas ringkas
        if g.is_empty: continue
        F.append({"type": "Feature", "properties": {"kode": KELAS[k], "kritis": k, "bpdas": str(d.get("bpdas", "")).strip()}, "geometry": mapping(g)})
    assert not tak, f"kelas tak dikenal: {tak}"
    os.makedirs(OUT, exist_ok=True)
    json.dump({"type": "FeatureCollection", "tahun": tahun, "sumber": SUMBER, "berkas": os.path.basename(src), "features": F}, gzip.open(os.path.join(OUT, f"kapuashulu_{tahun}.geojson.gz"), "wt"), separators=(",", ":"))
    print(len(F), "poligon lahan kritis disimpan")

_C = {}
def muat(bbox=None):
    """→ (tahun, [(geom, kode, bpdas)]) dari peta lahan kritis terbaru (dipotong bbox bila diberikan)."""
    from shapely.geometry import shape, box
    from shapely.strtree import STRtree
    fs = sorted(glob.glob(os.path.join(OUT, "*_*.geojson.gz")))
    if not fs: return None, []
    f = fs[-1]; y = int(re.search(r"_(\d{4})\.geojson\.gz$", f).group(1))
    if f not in _C:
        G = json.load(gzip.open(f, "rt"))["features"]; L = [(shape(x["geometry"]), x["properties"]["kode"], x["properties"]["bpdas"]) for x in G]
        _C[f] = (L, STRtree([g for g, _, _ in L]))
    L, T = _C[f]
    if bbox is None: return y, L
    return y, [L[i] for i in T.query(box(*bbox))]

def hitung(geom, klhk=None, lokal=None):
    """geom WGS84 → ringkasan lahan kritis; klhk = [(geom, kode)] peta tutupan lahan acuan (WGS84); lokal = nama sumber tutupan."""
    from shapely.ops import unary_union
    y, L = muat(geom.bounds)
    if not L: return None
    U = _utm(); gu = U(geom); per = {}; bp = {}; parts = {}
    for g, k, b in L:
        if not g.intersects(geom): continue
        x = U(g.intersection(geom))
        if x.is_empty or x.area <= 0: continue
        per[k] = per.get(k, 0) + x.area / 1e4; bp[b] = bp.get(b, 0) + x.area / 1e4; parts.setdefault(k, []).append(x)
    tot = gu.area / 1e4; cov = sum(per.values())
    out = {"tahun": y, "sumber": SUMBER, "luas_area_ha": round(tot, 4), "tercakup_ha": round(cov, 4),
           "kelas_ha": {NAMA[k]: round(v, 4) for k, v in sorted(per.items())}, "kelas_persen": {NAMA[k]: round(v / cov * 100, 2) for k, v in sorted(per.items())} if cov else {},
           "bpdas_ha": {k: round(v, 4) for k, v in bp.items()}, "metode": "Luas pada WGS 1984 UTM 49N (planimetrik) di dalam batas area."}
    if klhk:
        KG = {}
        for g, kd in klhk:
            if g.intersects(geom):
                x = U(g.intersection(geom))
                if not x.is_empty: KG[kd] = unary_union([KG[kd], x]) if kd in KG else x
        PK = {k: unary_union(v) for k, v in parts.items()}; silang = []
        for k, gk in PK.items():
            for kd, gt in KG.items():
                if gk.intersects(gt):
                    a = gk.intersection(gt).area / 1e4
                    if a >= 0.0001: silang.append([NAMA[k], kd, round(a, 4)])
        out["silang_tutupan"] = {"sumber_tutupan": lokal or "Peta Penutupan Lahan KLHK", "baris": sorted(silang, key=lambda z: -z[2])}
        pr = lambda f: round(sum(a for kk, kd, a in silang if f(kk, kd)), 4)
        out["prioritas"] = {"kritis_bukan_hutan_ha": pr(lambda kk, kd: kk in ("Kritis", "Sangat Kritis") and kd not in HUTAN),
                            "agak_kritis_bukan_hutan_ha": pr(lambda kk, kd: kk == "Agak Kritis" and kd not in HUTAN),
                            "kritis_di_hutan_ha": pr(lambda kk, kd: kk in ("Agak Kritis", "Kritis", "Sangat Kritis") and kd in HUTAN),
                            "keterangan": "Prioritas rehabilitasi = lahan Kritis/Sangat Kritis dan Agak Kritis pada tutupan bukan hutan. Lahan Agak Kritis s.d. Sangat Kritis yang masih berhutan umumnya dipengaruhi lereng & bahaya erosi (penilaian resmi tidak hanya dari tutupan) – prioritas perlindungan, bukan penanaman; perbedaan tahun & skala peta dicek lapangan."}
    return out

def untuk_area(geom, klhk):
    """SHP unggahan / wilayah desa: lahan kritis + silang dengan peta KLHK terbaru yang menutup area (klhk = {tahun: [(geom, kode)]} dari muat_klhk)."""
    try:
        if not klhk: return hitung(geom)
        from pyproj import Geod
        G = Geod(ellps="WGS84"); A = abs(G.geometry_area_perimeter(geom)[0])
        cov = {y: sum(abs(G.geometry_area_perimeter(g.intersection(geom))[0]) for g, _ in P if g.intersects(geom)) for y, P in klhk.items()}
        ok = [y for y, c in cov.items() if c >= 0.98 * max(cov.values())]; y = max(ok) if ok else max(klhk)
        return hitung(geom, klhk[y], f"Peta Penutupan Lahan KLHK/Kemenhut {y}")
    except Exception as e:
        print("  lahan kritis gagal:", e); return None

def tutupan_acuan(lok):
    """Tutupan lahan acuan untuk silang: peta lokal tahun terbaru (data/tutupan_lokal) atau peta KLHK terbaru (data/klhk)."""
    from shapely.geometry import shape
    idx = os.path.join(DATA, "tutupan_lokal", "indeks.json"); I = json.load(open(idx)).get("lokasi", {}) if os.path.exists(idx) else {}
    if lok in I:
        y = min(I[lok]["tahun_maks"], 2025); f = os.path.join(DATA, "tutupan_lokal", f"{lok}_{y}.geojson")
        return [(shape(x["geometry"]).buffer(0), int(x["properties"]["kode"])) for x in json.load(open(f))["features"]], f"{I[lok]['nama']} – peta {y}", y
    T = sorted(int(m.group(1)) for f in os.listdir(os.path.join(DATA, "klhk")) for m in [re.match(rf"^{lok}_(\d{{4}})\.geojson$", f)] if m)
    if not T: return None, None, None
    f = os.path.join(DATA, "klhk", f"{lok}_{T[-1]}.geojson")
    return [(shape(x["geometry"]).buffer(0), int(x["properties"]["kode"])) for x in json.load(open(f))["features"]], f"Peta Penutupan Lahan KLHK/Kemenhut {T[-1]}", T[-1]

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "impor": impor(sys.argv[2], int(sys.argv[3])); return
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    geo = json.load(open(os.path.join(DATA, "geo.json"))); U = _utm(); os.makedirs(OUT, exist_ok=True); idx = {"sumber": SUMBER, "lokasi": {}}
    for s in geo["sites"]:
        hd = unary_union([shape(f["geometry"]) for f in s["hd"]["features"]]).buffer(0); y, L = muat(hd.bounds)
        fs = []
        for g, k, b in L:
            if not g.intersects(hd): continue
            x = g.intersection(hd)
            if x.is_empty or U(x).area < 1: continue
            fs.append({"type": "Feature", "properties": {"kode": k, "kritis": NAMA[k], "bpdas": b, "luas_ha": round(U(x).area / 1e4, 4)}, "geometry": mapping(x)})
        json.dump({"type": "FeatureCollection", "lokasi": s["id"], "tahun": y, "sumber": SUMBER, "features": fs}, open(os.path.join(OUT, f"{s['id']}_{y}.geojson"), "w"), separators=(",", ":"))
        kl, nm, ty = tutupan_acuan(s["id"]); r = hitung(hd, kl, nm); r.update({"lokasi": s["id"], "hutan_desa": s["hd_nama"], "tahun_tutupan": ty, "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
        json.dump(r, open(os.path.join(OUT, f"{s['id']}.json"), "w"), ensure_ascii=False, indent=1); idx["lokasi"][s["id"]] = {"tahun": y, "poligon": len(fs)}
        print(s["id"], y, len(fs), r["kelas_ha"], r.get("prioritas", {}).get("kritis_bukan_hutan_ha"))
    json.dump(idx, open(os.path.join(OUT, "indeks.json"), "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
