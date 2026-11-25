"""
Kalender musim api & titik rawan berulang per Hutan Desa – Pantau Rimbak (Yayasan PRCF Indonesia)
=================================================================================================
Sumber: arsip titik panas NASA FIRMS (VIIRS 375 m & MODIS 1 km) data/titik/<tahun>.json, periode 2016–2025
(10 tahun lengkap; sensor VIIRS & MODIS sama-sama aktif), jarak ke batas desa+Hutan Desa = kolom "ls"
(-1 di dalam Hutan Desa, 0 di wilayah desa, >0 km dari batas). Normal hujan bulanan: ERA5/ERA5-Land 2001–2025.

1. KALENDER MUSIM API  -> data/musim/indeks.json
   per bulan: rata-rata, median & maksimum deteksi <= 25 km per tahun, rata-rata <= 5 km,
   peluang (persen tahun dengan >= 1 deteksi) <= 25 km dan <= 5 km, normal hujan, kategori
   (puncak/tinggi/sedang/rendah menurut porsi rata-rata tahunan), bulan musim, bulan mulai bersiap,
   dan jumlah tahun berjalan per bulan untuk perbandingan.
2. TITIK RAWAN BERULANG -> data/rawan/<lokasi>.geojson & data/rawan/indeks.json
   grid 0,01° (± 1,1 km) dalam radius 25 km; sel yang memiliki deteksi pada >= 3 tahun berbeda.
Pemakaian: python scripts/musim_rawan.py
"""
import os, json, math, statistics, datetime as dt
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TAHUN = list(range(2016, 2026))
SEL = 0.01          # derajat (± 1,1 km)
MIN_TAHUN = 3
BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

def J(p):
    with open(os.path.join(DATA, p), encoding="utf-8") as f: return json.load(f)

def titik_tahun(y):
    p = os.path.join(DATA, "titik", f"{y}.json")
    return J(f"titik/{y}.json") if os.path.exists(p) else {"lokasi": [], "titik": []}

def tulis(path, obj, **kw):
    """tulis hanya bila isi (tanpa cap waktu) berubah – mencegah commit data berulang tiap 3 jam"""
    lama = None
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f: lama = json.load(f)
        except Exception: lama = None
    bersih = lambda o: {k: v for k, v in o.items() if k != "diperbarui_utc"} if isinstance(o, dict) else o
    if lama is not None and bersih(lama) == json.loads(json.dumps(bersih(obj))): return False
    with open(path, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, **kw)
    return True

def kategori(porsi):
    return "puncak" if porsi >= 0.15 else "tinggi" if porsi >= 0.08 else "sedang" if porsi >= 0.03 else "rendah"

def main():
    sites = J("geo.json")["sites"]; ids = [s["id"] for s in sites]
    now = dt.datetime.now(dt.timezone.utc); kini = now + dt.timedelta(hours=7)
    # kumpulkan titik per lokasi (kunci unik)
    per = {i: {} for i in ids}
    for y in TAHUN + [kini.year]:
        t = titik_tahun(y); L = t.get("lokasi", [])
        for p in t.get("titik", []):
            ls = p.get("ls") or []
            for i in ids:
                if i not in L: continue
                k = L.index(i)
                if len(ls) > k and ls[k] is not None and ls[k] <= 25: per[i][p["k"]] = (p, ls[k])
    musim = {"metode": "Arsip titik panas NASA FIRMS (VIIRS & MODIS) 2016–2025 dalam radius 25 km dari batas desa & Hutan Desa; satu kebakaran dapat terdeteksi beberapa kali. Normal hujan ERA5/ERA5-Land 2001–2025.",
             "tahun": [TAHUN[0], TAHUN[-1]], "diperbarui_utc": now.strftime("%Y-%m-%dT%H:%MZ"), "lokasi": {}}
    rawan_idx = {"metode": f"Sel grid {SEL}° (± 1,1 km) dalam radius 25 km yang memiliki deteksi titik panas NASA FIRMS pada >= {MIN_TAHUN} tahun berbeda (2016–2025).",
                 "diperbarui_utc": musim["diperbarui_utc"], "lokasi": {}}
    os.makedirs(os.path.join(DATA, "musim"), exist_ok=True); os.makedirs(os.path.join(DATA, "rawan"), exist_ok=True)
    for s in sites:
        sid = s["id"]; P = per[sid].values()
        # ---------- kalender ----------
        n25 = {(y, m): 0 for y in TAHUN for m in range(1, 13)}; n5 = dict(n25); thn_ini = [0] * 12
        for p, c in P:
            y, m = int(p["d"][:4]), int(p["d"][5:7])
            if y == kini.year: thn_ini[m - 1] += 1
            if y not in TAHUN: continue
            n25[(y, m)] += 1
            if c <= 5: n5[(y, m)] += 1
        rata = [statistics.mean(n25[(y, m)] for y in TAHUN) for m in range(1, 13)]
        tot = sum(rata) or 1
        cu_p = f"cuaca_{sid}.json" if os.path.exists(os.path.join(DATA, f"cuaca_{sid}.json")) else "cuaca.json"
        cu = J(cu_p); hj = defaultdict(list)
        for t, v in zip(cu["t"], cu["hujan"]):
            if v is None or not ("2001" <= t[:4] <= "2025"): continue
            hj[(t[:4], int(t[5:7]))].append(v)
        normal = [statistics.mean(sum(v) for (yy, mm), v in hj.items() if mm == m and len(v) >= 28) for m in range(1, 13)]
        bulan = []
        for m in range(1, 13):
            v25 = [n25[(y, m)] for y in TAHUN]; v5 = [n5[(y, m)] for y in TAHUN]
            ymax = max(TAHUN, key=lambda y: n25[(y, m)])
            bulan.append({"bulan": m, "rata25": round(rata[m - 1], 1), "median25": statistics.median(v25), "maks25": max(v25), "tahun_maks": ymax if max(v25) else None,
                          "rata5": round(statistics.mean(v5), 1), "peluang25": round(100 * sum(1 for v in v25 if v) / len(TAHUN)), "peluang5": round(100 * sum(1 for v in v5 if v) / len(TAHUN)),
                          "porsi": round(rata[m - 1] / tot, 3), "kategori": kategori(rata[m - 1] / tot), "hujan_normal": round(normal[m - 1]), "tahun_ini": thn_ini[m - 1] if m <= kini.month or kini.year > TAHUN[-1] else None})
        ms = [b["bulan"] for b in bulan if b["kategori"] in ("puncak", "tinggi")]
        # bulan mulai bersiap: bulan sebelum bulan musim pertama dalam rangkaian terpanjang (melingkar)
        mulai = None
        if ms:
            s_ = set(ms); awal = [m for m in ms if ((m - 2) % 12) + 1 not in s_]
            panjang = lambda a: next(k for k in range(1, 13) if ((a - 1 + k) % 12) + 1 not in s_) if len(s_) < 12 else 12
            a = max(awal, key=panjang) if awal else ms[0]; mulai = ((a - 2) % 12) + 1
        puncak = max(bulan, key=lambda b: b["rata25"])["bulan"]
        musim["lokasi"][sid] = {"nama": s["hd_nama"], "bulan": bulan, "musim": ms, "puncak": puncak, "mulai_bersiap": mulai,
                                "rata_tahunan25": round(tot, 1), "per_tahun25": {str(y): sum(n25[(y, m)] for m in range(1, 13)) for y in TAHUN}}
        # ---------- rawan berulang ----------
        sel = {}
        for p, c in P:
            y = int(p["d"][:4])
            if y not in TAHUN: continue
            gy, gx = math.floor(p["la"] / SEL), math.floor(p["lo"] / SEL)
            r = sel.setdefault((gy, gx), {"tahun": set(), "n": 0, "c": 99.0, "akhir": ""})
            r["tahun"].add(y); r["n"] += 1; r["c"] = min(r["c"], c); r["akhir"] = max(r["akhir"], p["d"])
        rawan = [(k, r) for k, r in sel.items() if len(r["tahun"]) >= MIN_TAHUN]
        rawan.sort(key=lambda kr: (-len(kr[1]["tahun"]), kr[1]["c"], -kr[1]["n"]))
        feats = []
        for i, ((gy, gx), r) in enumerate(rawan, 1):   # semua sel berulang (± 100–140 KB per lokasi)
            y0, x0 = gy * SEL, gx * SEL
            feats.append({"type": "Feature", "properties": {"peringkat": i, "n_tahun": len(r["tahun"]), "tahun": sorted(r["tahun"]), "deteksi": r["n"],
                          "jarak_km": round(max(r["c"], 0), 1), "lokasi": "di dalam Hutan Desa" if r["c"] < 0 else "di wilayah desa" if r["c"] == 0 else f"{r['c']:.1f} km dari batas",
                          "terakhir": r["akhir"], "pusat": [round(y0 + SEL / 2, 5), round(x0 + SEL / 2, 5)]},
                          "geometry": {"type": "Polygon", "coordinates": [[[round(x0, 5), round(y0, 5)], [round(x0 + SEL, 5), round(y0, 5)], [round(x0 + SEL, 5), round(y0 + SEL, 5)], [round(x0, 5), round(y0 + SEL, 5)], [round(x0, 5), round(y0, 5)]]]}})
        tulis(os.path.join(DATA, "rawan", f"{sid}.geojson"), {"type": "FeatureCollection", "features": feats}, separators=(",", ":"))
        rawan_idx["lokasi"][sid] = {"nama": s["hd_nama"], "sel": len(rawan), "ditampilkan": len(feats),
                                    "dalam_5km": sum(1 for _, r in rawan if r["c"] <= 5), "maks_tahun": max((len(r["tahun"]) for _, r in rawan), default=0)}
        print(f"{sid:12} musim {ms} puncak {BLN[puncak - 1]} bersiap {BLN[mulai - 1] if mulai else '-'} · rawan {len(rawan)} sel (≤5 km {rawan_idx['lokasi'][sid]['dalam_5km']})")
    print("tulis:", tulis(os.path.join(DATA, "musim", "indeks.json"), musim, separators=(",", ":")), tulis(os.path.join(DATA, "rawan", "indeks.json"), rawan_idx, indent=1))

if __name__ == "__main__":
    main()
