"""
"Indonesia hari ini" – ringkasan titik panas per provinsi & kabupaten/kota (Pantau Rimbak · Yayasan PRCF Indonesia)
==================================================================================================================
Masukan : data/titik_id/*.json (salinan resmi NASA FIRMS NRT 7 hari, sudah disaring ke daratan Indonesia oleh pipeline.py)
          data/wilayah/kabupaten.geojson (batas kabupaten/kota OCHA COD-AB / BPS-BIG, dari scripts/batas_kabupaten.py)
Keluaran: data/titik_id/ringkasan.json – jumlah deteksi 24 jam & 7 hari, per hari (WIB), per provinsi dan kabupaten/kota.
Titik di garis pantai yang jatuh sedikit di luar poligon kabupaten (≤ ±5 km) diberikan ke kabupaten terdekat; sisanya dihitung "tidak terpetakan".
Angka = jumlah DETEKSI satelit (satu kebakaran dapat terdeteksi beberapa kali oleh satelit/lintasan berbeda), bukan jumlah kejadian.
"""
import os, json, glob, math, datetime
import numpy as np
from shapely.geometry import shape
from shapely import STRtree, points

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TID = os.path.join(ROOT, "data", "titik_id")

def main():
    I = json.load(open(os.path.join(TID, "indeks.json")))
    K = json.load(open(os.path.join(ROOT, "data", "wilayah", "kabupaten.geojson")))["features"]
    G = [shape(f["geometry"]) for f in K]; tree = STRtree(G)
    rows = []
    for f in glob.glob(os.path.join(TID, "*_*.json")):
        rows += json.load(open(f))
    now_min = datetime.datetime.now(datetime.timezone.utc).timestamp() / 60
    upd = I.get("diperbarui_utc")
    ref = datetime.datetime.strptime(upd, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp() / 60 if upd else now_min
    R = np.array([r[:3] for r in rows], dtype="float64") if rows else np.zeros((0, 3))
    R = R[(ref - R[:, 2]) <= 7 * 1440 + 60] if len(R) else R
    kab = np.full(len(R), -1)
    if len(R):
        P = points(R[:, 1], R[:, 0])
        pi, gi = tree.query(P, predicate="within"); kab[pi] = gi
        sisa = np.where(kab < 0)[0]
        if len(sisa):
            pi2, gi2 = tree.query_nearest(P[sisa], max_distance=0.05, all_matches=False); kab[sisa[pi2]] = gi2
    hari = [datetime.datetime.fromtimestamp((r + 420) * 60, datetime.timezone.utc).strftime("%Y-%m-%d") for r in R[:, 2]] if len(R) else []
    h24 = (ref - R[:, 2]) <= 1440 if len(R) else np.zeros(0, bool)
    hari_set = sorted(set(hari))
    prov = {}
    for i in range(len(R)):
        k = int(kab[i])
        if k < 0: continue
        p = K[k]["properties"]; pv = prov.setdefault(p["kode_prov"], {"kode": p["kode_prov"], "nama": p["prov"], "n24": 0, "n7": 0, "harian": {}, "kab": {}})
        kb = pv["kab"].setdefault(p["kode"], {"kode": p["kode"], "nama": p["kab"], "n24": 0, "n7": 0})
        pv["n7"] += 1; kb["n7"] += 1; pv["harian"][hari[i]] = pv["harian"].get(hari[i], 0) + 1
        if h24[i]: pv["n24"] += 1; kb["n24"] += 1
    W = json.load(open(os.path.join(ROOT, "data", "wilayah", "indeks.json")))
    bbox = {p["kode"]: p["bbox"] for p in W["provinsi"]}
    L = []
    for pv in prov.values():
        pv["kab"] = sorted(pv["kab"].values(), key=lambda x: (-x["n7"], x["nama"]))
        pv["harian"] = {d: pv["harian"].get(d, 0) for d in hari_set}
        pv["bbox"] = bbox.get(pv["kode"]); L.append(pv)
    L.sort(key=lambda x: (-x["n7"], x["nama"]))
    out = {"diperbarui_utc": upd, "dihitung_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "sumber": "NASA FIRMS near real-time (VIIRS S-NPP/NOAA-20/NOAA-21 375 m, MODIS 1 km), 7 hari; batas wilayah OCHA COD-AB (BPS/BIG)",
           "catatan": "Jumlah deteksi satelit, bukan jumlah kejadian: satu kebakaran dapat terdeteksi beberapa kali oleh satelit/lintasan berbeda. Waktu WIB.",
           "total24": int(h24.sum()), "total7": int(len(R)), "tidak_terpetakan": int((kab < 0).sum()),
           "harian": {d: hari.count(d) for d in hari_set}, "provinsi": L}
    json.dump(out, open(os.path.join(TID, "ringkasan.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("ringkasan:", out["total24"], "titik 24 jam,", out["total7"], "titik 7 hari,", len(L), "provinsi; tak terpetakan", out["tidak_terpetakan"])

if __name__ == "__main__":
    main()
