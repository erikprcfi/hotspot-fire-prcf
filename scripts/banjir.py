"""
Prakiraan debit sungai & banjir 30 hari per Hutan Desa – Pantau Rimbak PRCF  ->  data/banjir/indeks.json
======================================================================================================

Sumber: GloFAS (Global Flood Awareness System, Copernicus Emergency Management Service / ECMWF) via
Open-Meteo Flood API – debit sungai harian (m³/s) pada kisi 5 km: prakiraan ensemble 30 hari
(median, p25, p75, minimum, maksimum anggota) dan reanalisis GloFAS sejak 1984 untuk normal.

Sungai yang dipantau: sel kisi GloFAS (0,05°) dengan debit median terbesar di dalam wilayah desa diperluas
3 km (= sungai utama desa menurut model), ditetapkan sekali dan dicek ulang tiap 30 hari.

Ambang banjir = debit puncak tahunan dengan periode ulang 2, 5 dan 20 tahun (distribusi Gumbel, metode
momen) dari debit maksimum tahunan reanalisis. Status (dari median ensemble): Normal · Waspada (≥ 2 tahunan)
· Siaga (≥ 5 tahunan) · Awas (≥ 20 tahunan). Bila ≥ 25 % anggota ensemble (persentil 75) melewati
ambang 2 tahunan, ditandai "mungkin".
Model 5 km menggambarkan sungai utama; banjir lokal anak sungai kecil dapat berbeda – utamakan pengamatan lapangan.
"""
import os, sys, json, math, time, datetime as dt, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "banjir")
UA = {"User-Agent": "hotspot-fire-prcf (github actions; PRCF Indonesia)"}
API = "https://flood-api.open-meteo.com/v1/flood"
NOW = dt.datetime.now(dt.timezone.utc); HARI = (NOW + dt.timedelta(hours=7)).date()
LEVEL = ["Normal", "Waspada", "Siaga", "Awas"]

def J(p, d=None):
    try: return json.load(open(p, encoding="utf-8"))
    except Exception: return d

def tulis(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lama = J(path)
    bersih = lambda o: {k: v for k, v in o.items() if k != "diperbarui_utc"} if isinstance(o, dict) else o
    if lama is not None and bersih(lama) == json.loads(json.dumps(bersih(obj))): return False
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path); return True

def ambil(q):
    url = API + "?" + q
    for k in range(4):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())
            if d.get("error"): raise RuntimeError(d.get("reason"))
            return d, url
        except Exception as e:
            if k == 3: raise
            time.sleep(8 * (k + 1))

def gumbel(x, T):
    n = len(x); mu = sum(x) / n; sd = math.sqrt(sum((v - mu) ** 2 for v in x) / (n - 1))
    a = sd * math.sqrt(6) / math.pi; u = mu - 0.5772 * a
    return u - a * math.log(-math.log(1 - 1 / T))

def pilih_sungai(s):
    """Sel GloFAS (kisi 0,05°) dengan debit median terbesar di dalam wilayah desa diperluas ±3 km = sungai utama desa."""
    from shapely.geometry import shape, Point
    g = shape(s["desa"]["features"][0]["geometry"]).buffer(0.027)
    x0, y0, x1, y1 = g.bounds
    titik = []
    y = math.floor(y0 / 0.05) * 0.05 + 0.025
    while y <= y1:
        x = math.floor(x0 / 0.05) * 0.05 + 0.025
        while x <= x1:
            if g.contains(Point(x, y)): titik.append((round(y, 3), round(x, 3)))
            x += 0.05
        y += 0.05
    if not titik: titik = [tuple(s["pusat_wilayah"])]
    best = None
    for la, lo in titik[:30]:
        d, _ = ambil(f"latitude={la:.3f}&longitude={lo:.3f}&daily=river_discharge&past_days=92&forecast_days=1")
        v = [x for x in d["daily"]["river_discharge"] if x is not None]
        if not v: continue
        med = sorted(v)[len(v) // 2]
        if not best or med > best[2]: best = (d["latitude"], d["longitude"], med)
    return best

def normal(la, lo):
    d, url = ambil(f"latitude={la:.4f}&longitude={lo:.4f}&daily=river_discharge&start_date=1984-01-01&end_date=2025-12-31")
    per = {}
    for t, v in zip(d["daily"]["time"], d["daily"]["river_discharge"]):
        if v is not None: per.setdefault(t[:4], []).append(v)
    maks = {y: max(v) for y, v in per.items() if len(v) >= 330}
    x = list(maks.values())
    if len(x) < 10: return None
    semua = sorted(v for vv in per.values() for v in vv)
    return {"tahun": [min(maks), max(maks)], "n_tahun": len(x), "maks_tahunan": {y: round(v, 1) for y, v in maks.items()},
            "rp2": round(gumbel(x, 2), 1), "rp5": round(gumbel(x, 5), 1), "rp20": round(gumbel(x, 20), 1),
            "median_harian": round(semua[len(semua) // 2], 1), "url": url}

def main():
    geo = J(os.path.join(DATA, "geo.json")); sites = geo["sites"]
    cache_p = os.path.join(OUT, "sungai.json"); C = J(cache_p, {})
    idx_lama = J(os.path.join(OUT, "indeks.json"), {})
    if "--paksa" not in sys.argv and (idx_lama.get("diperbarui_utc") or "")[:10] == NOW.strftime("%Y-%m-%d") and len(idx_lama.get("lokasi") or {}) == len(sites):
        print("banjir: sudah diambil hari ini (GloFAS diperbarui harian)"); return
    lok = {}
    for s in sites:
        sid = s["id"]; la, lo = s["pusat_wilayah"]
        try:
            c = C.get(sid)
            if not c or (dt.date.today() - dt.date.fromisoformat(c["dipilih"])).days > 30:
                b = pilih_sungai(s)
                if not b: print(f"banjir {sid}: tidak ada sel sungai"); continue
                N = normal(b[0], b[1])
                if not N: print(f"banjir {sid}: reanalisis kurang"); continue
                jarak = math.hypot((b[0] - la) * 111.32, (b[1] - lo) * 111.32 * math.cos(math.radians(la)))
                c = C[sid] = {"lat": b[0], "lon": b[1], "jarak_km": round(jarak, 1), "dipilih": dt.date.today().isoformat(), **N}
            d, url = ambil(f"latitude={c['lat']:.4f}&longitude={c['lon']:.4f}&daily=river_discharge,river_discharge_median,river_discharge_max,river_discharge_min,river_discharge_p25,river_discharge_p75&past_days=30&forecast_days=30&ensemble=true")
        except Exception as e:
            print(f"banjir {sid} gagal: {e}", file=sys.stderr)
            if (idx_lama.get("lokasi") or {}).get(sid): lok[sid] = idx_lama["lokasi"][sid]
            continue
        D = d["daily"]; hari = []
        for i, t in enumerate(D["time"]):
            g = lambda k: (D.get(k) or [None] * len(D["time"]))[i]
            hari.append({"t": t, "q": g("river_discharge"), "med": g("river_discharge_median"), "p25": g("river_discharge_p25"),
                         "p75": g("river_discharge_p75"), "min": g("river_discharge_min"), "maks": g("river_discharge_max")})
        depan = [h for h in hari if h["t"] >= HARI.isoformat() and h["med"] is not None]
        lalu = [h for h in hari if h["t"] < HARI.isoformat() and h["q"] is not None]
        def lv(v):
            return 0 if v is None else 3 if v >= c["rp20"] else 2 if v >= c["rp5"] else 1 if v >= c["rp2"] else 0
        level = max([lv(h["med"]) for h in depan] or [0])
        puncak = max(depan, key=lambda h: h["med"]) if depan else None
        mungkin = level == 0 and any((h["p75"] or 0) >= c["rp2"] for h in depan)   # ≥ 25 % anggota ensemble
        lewat = [h["t"] for h in depan if lv(h["med"]) >= 1]
        kini = lalu[-1]["q"] if lalu else (depan[0]["med"] if depan else None)
        lok[sid] = {"nama": s["hd_nama"], "sungai": {k: c[k] for k in ("lat", "lon", "jarak_km", "tahun", "n_tahun", "rp2", "rp5", "rp20", "median_harian")},
                    "kini": kini, "persen_rp2": round(100 * kini / c["rp2"]) if kini and c["rp2"] else None,
                    "level": level, "label": LEVEL[level], "mungkin": mungkin,
                    "puncak": {"t": puncak["t"], "med": puncak["med"], "maks": puncak["maks"]} if puncak else None,
                    "hari_lewat_ambang": lewat, "pertama_lewat": lewat[0] if lewat else None, "hari": hari, "url": url}
    tulis(cache_p, C)
    tulis(os.path.join(OUT, "indeks.json"), {
        "diperbarui_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sumber": "GloFAS – Copernicus Emergency Management Service (ECMWF), debit sungai harian kisi 5 km: prakiraan ensemble 30 hari & reanalisis sejak 1984, via Open-Meteo Flood API",
        "metode": "Sungai utama desa = sel kisi GloFAS (0,05°) dengan debit median terbesar di dalam wilayah desa diperluas 3 km. Ambang = debit puncak tahunan periode ulang 2, 5, 20 tahun (Gumbel, metode momen) dari reanalisis GloFAS. Status dari median ensemble: Normal · Waspada (≥ 2 tahunan) · Siaga (≥ 5 tahunan) · Awas (≥ 20 tahunan); \"mungkin\" bila ≥ 25 % anggota ensemble (persentil 75) melewati ambang 2 tahunan. Model 5 km menggambarkan sungai utama; anak sungai kecil dapat berbeda.",
        "lokasi": lok})
    print("banjir:", {k: (v["label"], v["kini"], v["sungai"]["rp2"]) for k, v in lok.items()})

if __name__ == "__main__":
    main()
