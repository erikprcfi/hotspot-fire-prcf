"""
Ringkasan kecil untuk widget layar utama aplikasi Android Pantau Rimbak (data/widget.json, < 3 KB).
Status per Hutan Desa memakai ATURAN YANG SAMA dengan aplikasi (siteStatus di app.html):
  titik panas NASA FIRMS 7 hari terakhir (+1 jam toleransi) – di dalam wilayah (kode <= 0) → Siaga,
  <= 5 km dari batas → Waspada, selain itu Aman; ditambah jumlah <= 25 km dan tingkat bahaya kebakaran hari ini (FWI, menu Prakiraan).
Bagian "nasional" = jumlah deteksi titik panas se-Indonesia 24 jam & 7 hari (data/titik_id/ringkasan.json).
Tanpa data pribadi.
"""
import os, json, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
KELAS = ["Rendah", "Sedang", "Tinggi", "Ekstrem"]

def J(p, d=None):
    f = os.path.join(DATA, p)
    if not os.path.exists(f): return d
    with open(f, encoding="utf-8") as fh: return json.load(fh)

def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    hs = J("hotspots.json", {"lokasi": [], "titik": []}); geo = J("geo.json", {"sites": []}); fc = J("prakiraan.json", {"lokasi": {}})
    batas = now - datetime.timedelta(days=7, hours=1)
    out = {"diperbarui_utc": now.strftime("%Y-%m-%dT%H:%MZ"), "data_titik_utc": hs.get("diperbarui_utc"), "lokasi": {}}
    for s in geo["sites"]:
        if s["id"] not in hs.get("lokasi", []): continue
        k = hs["lokasi"].index(s["id"]); c = []
        for p in hs["titik"]:
            ls = p.get("ls") or []
            if len(ls) <= k: continue
            t = datetime.datetime.strptime(p["d"] + str(p.get("t", "0000")).zfill(4), "%Y-%m-%d%H%M").replace(tzinfo=datetime.timezone.utc)
            if t >= batas: c.append(ls[k])
        dalam = sum(1 for v in c if v <= 0); dekat = sum(1 for v in c if v <= 5); r25 = sum(1 for v in c if v <= 25)
        hari = ((fc.get("lokasi") or {}).get(s["id"]) or {}).get("hari") or []
        lv = hari[0].get("level") if hari else None
        out["lokasi"][s["id"]] = {"nama": s["hd_nama"], "status": "Siaga" if dalam else "Waspada" if dekat else "Aman",
                                  "dalam": dalam, "dekat": dekat, "r25": r25,
                                  "bahaya": KELAS[lv] if isinstance(lv, int) and 0 <= lv < 4 else None, "bahaya_level": lv}
    n = J("titik_id/ringkasan.json", {})
    if n: out["nasional"] = {"total24": n.get("total24"), "total7": n.get("total7"), "diperbarui_utc": n.get("diperbarui_utc")}
    with open(os.path.join(DATA, "widget.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps(out, ensure_ascii=False)[:600])

if __name__ == "__main__":
    main()
