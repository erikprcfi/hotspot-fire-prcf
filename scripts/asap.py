"""
Perkiraan arah asap dari titik panas baru – Pantau Rimbak PRCF   ->  data/asap/indeks.json
=========================================================================================

Untuk setiap titik panas NASA FIRMS 24 jam terakhir dalam radius 100 km dari batas desa, lintasan asap
dihitung maju 24 jam mengikuti angin 10 m prakiraan ECMWF IFS (data/angin/indonesia.json: kisi 0,5°,
tiap 3 jam; interpolasi bilinear ruang & linear waktu; langkah 15 menit). Bila lintasan melewati wilayah
desa (diperluas 2 km), dicatat perkiraan waktu tibanya.

Titik panas yang berdekatan (sel 0,05°) digabung sebagai satu sumber. Ini perkiraan arah sederhana
(angin permukaan, tanpa naik-turun asap); gunakan bersama prakiraan PM2.5 CAMS di menu Kualitas udara.
"""
import os, sys, json, math, base64, datetime as dt
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("PR_DATA") or os.path.join(ROOT, "data")   # PR_DATA: folder sementara untuk wilayah SHP pengguna (scripts/wilayah_umum.py); OUT = os.path.join(DATA, "asap")
NOW = dt.datetime.now(dt.timezone.utc)
RADIUS_KM, JAM, LANGKAH_MNT, PERLUAS_KM = 100, 24, 15, 2.0
ARAH = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"]

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

class Angin:
    def __init__(self, A):
        self.w, self.s, self.st, self.nx, self.ny = A["w"], A["s"], A["step"], A["nx"], A["ny"]
        dec = lambda b: np.frombuffer(base64.b64decode(b), dtype=np.int8).astype("f4").reshape(self.ny, self.nx) * A["skala"]
        self.U = [dec(b) for b in A["u"]]; self.V = [dec(b) for b in A["v"]]
        self.t = [x / 1000 for x in A["waktu"]]
    def __call__(self, la, lo, ts):
        x = (lo - self.w) / self.st; y = (la - self.s) / self.st
        if not (0 <= x < self.nx - 1 and 0 <= y < self.ny - 1): return None
        i, j = int(x), int(y); fx, fy = x - i, y - j
        if ts <= self.t[0]: k, ft = 0, 0.0
        elif ts >= self.t[-1]: k, ft = len(self.t) - 2, 1.0
        else:
            k = max(n for n in range(len(self.t) - 1) if self.t[n] <= ts); ft = (ts - self.t[k]) / (self.t[k + 1] - self.t[k])
        def bil(G):
            return (G[j, i] * (1 - fx) * (1 - fy) + G[j, i + 1] * fx * (1 - fy) + G[j + 1, i] * (1 - fx) * fy + G[j + 1, i + 1] * fx * fy)
        u = bil(self.U[k]) * (1 - ft) + bil(self.U[k + 1]) * ft
        v = bil(self.V[k]) * (1 - ft) + bil(self.V[k + 1]) * ft
        return float(u), float(v)

def lintasan(W, la, lo, t0):
    pts = [(la, lo, 0.0)]; ts = t0; d = LANGKAH_MNT * 60
    for n in range(int(JAM * 60 / LANGKAH_MNT)):
        uv = W(la, lo, ts)
        if uv is None: break
        u, v = uv
        la += v * d / 111320.0; lo += u * d / (111320.0 * math.cos(math.radians(la))); ts += d
        pts.append((la, lo, (n + 1) * LANGKAH_MNT / 60))
    return pts

def arah(dari_la, dari_lo, ke_la, ke_lo):
    b = math.degrees(math.atan2((ke_lo - dari_lo) * math.cos(math.radians(dari_la)), ke_la - dari_la)) % 360
    return ARAH[int((b + 22.5) // 45) % 8]

def main():
    from shapely.geometry import shape, Point, LineString
    from shapely.prepared import prep
    geo = J(os.path.join(DATA, "geo.json")); sites = geo["sites"]
    A = J(os.path.join(DATA, "angin", "indonesia.json"))
    hs = (J(os.path.join(DATA, "hotspots.json")) or {}).get("titik", [])
    if not A: print("asap: data angin tidak ada"); return
    W = Angin(A)
    run = A.get("run_utc")
    lok = {}
    for k, s in enumerate(sites):
        desa = shape(s["desa"]["features"][0]["geometry"]); la0 = desa.centroid.y
        zona = prep(desa.buffer(PERLUAS_KM / 111.32))
        sumber = {}
        for p in hs:
            ls = p.get("ls") or []
            if len(ls) <= k or ls[k] is None or ls[k] > RADIUS_KM: continue
            try: w = dt.datetime.fromisoformat(f'{p["d"]}T{p["t"][:2]}:{p["t"][2:]}:00+00:00')
            except Exception: continue
            if NOW - w > dt.timedelta(hours=24) or w > NOW + dt.timedelta(minutes=5): continue
            c = (round(p["la"] / 0.05), round(p["lo"] / 0.05))
            r = sumber.setdefault(c, {"la": [], "lo": [], "w": w, "jarak": ls[k], "n": 0, "frp": 0.0})
            r["la"].append(p["la"]); r["lo"].append(p["lo"]); r["w"] = min(r["w"], w); r["jarak"] = min(r["jarak"], ls[k]); r["n"] += 1
            try: r["frp"] += float(p.get("frp") or 0)
            except Exception: pass
        hasil = []
        for r in sumber.values():
            la, lo = sum(r["la"]) / len(r["la"]), sum(r["lo"]) / len(r["lo"])
            t0 = max(r["w"].timestamp(), W.t[0])
            pts = lintasan(W, la, lo, t0)
            tiba = None
            for y, x, h in pts:
                if zona.contains(Point(x, y)): tiba = h; break
            di_dalam = r["jarak"] <= 0
            jam_tiba = None if tiba is None else (dt.datetime.fromtimestamp(t0, dt.timezone.utc) + dt.timedelta(hours=tiba) + dt.timedelta(hours=7)).strftime("%d/%m %H.%M")
            hasil.append({"lat": round(la, 4), "lon": round(lo, 4), "n": r["n"], "frp": round(r["frp"], 1), "jarak_km": round(max(0, r["jarak"]), 1),
                          "arah_dari_desa": arah(desa.centroid.y, desa.centroid.x, la, lo), "deteksi_wib": (r["w"] + dt.timedelta(hours=7)).strftime("%d/%m %H.%M"),
                          "menuju_desa": tiba is not None, "di_dalam": di_dalam, "jam_tiba": round(tiba, 1) if tiba is not None else None, "tiba_wib": jam_tiba,
                          "lintasan": [[round(x, 4), round(y, 4)] for y, x, h in pts[::4]] + ([[round(pts[-1][1], 4), round(pts[-1][0], 4)]] if len(pts) % 4 != 1 else [])})
        hasil.sort(key=lambda x: (not x["menuju_desa"], x["jam_tiba"] if x["jam_tiba"] is not None else 99, x["jarak_km"]))
        menuju = [x for x in hasil if x["menuju_desa"]]
        lok[s["id"]] = {"nama": s["hd_nama"], "sumber": hasil[:40], "jumlah_sumber": len(hasil), "menuju_desa": len(menuju),
                        "tercepat_jam": menuju[0]["jam_tiba"] if menuju else None, "tercepat_wib": menuju[0]["tiba_wib"] if menuju else None}
    tulis(os.path.join(OUT, "indeks.json"), {
        "diperbarui_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "angin_run_utc": run,
        "sumber": "Titik panas NASA FIRMS 24 jam terakhir; angin 10 m prakiraan ECMWF IFS open data (CC BY 4.0)",
        "metode": f"Lintasan maju {JAM} jam dari tiap sumber (titik panas digabung per sel 0,05°) dalam radius {RADIUS_KM} km, angin 10 m diinterpolasi bilinear ruang & linear waktu, langkah {LANGKAH_MNT} menit. \"Menuju desa\" bila lintasan masuk wilayah desa diperluas {PERLUAS_KM:g} km. Perkiraan arah sederhana: asap dapat naik, menyebar, atau tertahan lapisan udara; gunakan bersama prakiraan PM2.5 CAMS.",
        "lokasi": lok})
    print("asap:", {k: (v["jumlah_sumber"], v["menuju_desa"]) for k, v in lok.items()})

if __name__ == "__main__":
    main()
