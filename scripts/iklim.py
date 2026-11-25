"""
Iklim & kesiagaan per Hutan Desa – Pantau Rimbak PRCF   ->  data/iklim/indeks.json, data/iklim/enso.json
=========================================================================================================

1. ENSO (El Niño / La Niña): Oceanic Niño Index (ONI) resmi NOAA CPC (rata-rata 3 bulan anomali suhu
   muka laut Niño 3.4, ERSSTv5) + anomali mingguan Niño 3.4 (OISST v2.1). Ambang NOAA: El Niño ONI ≥ +0,5;
   La Niña ≤ −0,5. Kekuatan: lemah 0,5–0,9; sedang 1,0–1,4; kuat 1,5–1,9; sangat kuat ≥ 2,0.
   Hubungan lokal dihitung dari arsip sendiri: area terbakar MODIS MCD64A1 2001–2025 dan titik panas
   FIRMS 2016–2025 dalam radius 25 km, dikelompokkan menurut fase ENSO musim Jul–Sep (JAS) tahun itu.

2. HARI TANPA HUJAN (HTH): hari berturut-turut dengan hujan < 1 mm (definisi & kelas BMKG: 1–5 sangat
   pendek, 6–10 pendek, 11–20 menengah, 21–30 panjang, 31–60 sangat panjang, > 60 kekeringan ekstrem),
   dari hujan harian ERA5/ERA5-Land (data/cuaca*.json) lalu dilanjutkan dengan prakiraan hujan harian aplikasi.

3. KELEMBAPAN TANAH: ERA5-Land (Copernicus C3S) lapisan 7–28 cm, rata-rata harian, dibanding normal
   2011–2025 pada ±10 hari dari tanggal yang sama (persentil). ERA5-Land terbit ±5 hari kemudian.

4. PRAKIRAAN MUSIM API 6 BULAN: pola bulanan (kalender musim api, data/musim/indeks.json) disesuaikan dengan
   prakiraan hujan musiman ECMWF SEAS5 (3 bulan, data/prakiraan.json) dan fase ENSO terkini. Aturan tertulis
   di "metode"; setiap bulan mencantumkan alasannya.

5. INDEKS SIAGA DESA: satu status harian (Aman / Waspada / Siaga / Awas) dari poin: bahaya kebakaran FWI
   hari ini–3 hari, HTH, kekeringan tanah, titik panas 72 jam, kekeringan vegetasi MODIS, dan prakiraan
   musim api bulan ini. Rincian poin selalu ditampilkan.
"""
import os, sys, json, math, time, datetime as dt, urllib.request, bisect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "iklim")
UA = {"User-Agent": "hotspot-fire-prcf (github actions; PRCF Indonesia)"}
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
WK_URL = "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for"
TANAH_URL = ("https://archive-api.open-meteo.com/v1/archive?latitude={la:.3f}&longitude={lo:.3f}&start_date={a}&end_date={b}"
             "&hourly=soil_moisture_7_to_28cm&models=era5_land&timezone=Asia%2FJakarta")
TANAH_MULAI = "2011-01-01"
NOW = dt.datetime.now(dt.timezone.utc); KINI = NOW + dt.timedelta(hours=7); HARI_INI = KINI.date()
BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
LEVEL_MUSIM = ["rendah", "sedang", "tinggi", "sangat tinggi", "ekstrem"]
LEVEL_SIAGA = ["Aman", "Waspada", "Siaga", "Awas"]

def J(p, d=None):
    try: return json.load(open(p if os.path.isabs(p) else os.path.join(DATA, p), encoding="utf-8"))
    except Exception: return d

def tulis(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lama = J(path)
    bersih = lambda o: {k: v for k, v in o.items() if k not in ("diperbarui_utc",)} if isinstance(o, dict) else o
    if lama is not None and bersih(lama) == json.loads(json.dumps(bersih(obj))): return False
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path); return True

def ambil(url, timeout=90, json_=False):
    for k in range(4):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
            return json.loads(r) if json_ else r.decode("utf-8", "replace")
        except Exception as e:
            if k == 3: raise
            time.sleep(6 * (k + 1))

# ------------------------------------------------------------------ 1. ENSO
SEAS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]
def fase(v):
    if v is None: return "netral"
    return "el_nino" if v >= 0.5 else "la_nina" if v <= -0.5 else "netral"
def kekuatan(v):
    a = abs(v or 0)
    return None if a < 0.5 else "lemah" if a < 1.0 else "sedang" if a < 1.5 else "kuat" if a < 2.0 else "sangat kuat"

def enso(lama):
    try:
        rows = []
        for ln in ambil(ONI_URL).splitlines()[1:]:
            p = ln.split()
            if len(p) == 4 and p[0] in SEAS: rows.append({"musim": p[0], "tahun": int(p[1]), "oni": float(p[3])})
        if len(rows) < 100: raise ValueError("ONI terlalu pendek")
    except Exception as e:
        print("ONI gagal:", e, file=sys.stderr); return lama
    wk = None
    try:
        L = [l for l in ambil(WK_URL).splitlines() if len(l.split()) == 9 and l.split()[0][:2].isdigit()]
        p = L[-1].split(); wk = {"minggu": p[0], "nino34_sst": float(p[5]), "nino34_anom": float(p[6])}
    except Exception as e:
        print("Niño 3.4 mingguan gagal:", e, file=sys.stderr)
    akhir = rows[-1]
    jas = {r["tahun"]: r["oni"] for r in rows if r["musim"] == "JAS"}
    return {"sumber": "NOAA Climate Prediction Center – Oceanic Niño Index (ONI, ERSSTv5) & anomali mingguan Niño 3.4 (OISST v2.1)",
            "url": [ONI_URL, WK_URL], "terkini": {"musim": akhir["musim"], "tahun": akhir["tahun"], "oni": akhir["oni"], "fase": fase(akhir["oni"]), "kekuatan": kekuatan(akhir["oni"])},
            "mingguan": wk, "deret": rows[-24:], "jas": {str(y): v for y, v in jas.items() if y >= 2001},
            "ambang": "El Niño bila ONI ≥ +0,5 °C, La Niña bila ≤ −0,5 °C (NOAA). Kekuatan: lemah 0,5–0,9; sedang 1,0–1,4; kuat 1,5–1,9; sangat kuat ≥ 2,0."}

def hubungan(E, sid, modis, musim):
    """Rata-rata area terbakar (MODIS) & titik panas per fase ENSO JAS."""
    if not E: return None
    jas = {int(y): v for y, v in E["jas"].items()}
    out = {}
    m = ((modis or {}).get("lokasi") or {}).get(sid) or {}
    th = {int(y): v for y, v in (m.get("tahun") or {}).items() if v.get("bulan", 0) >= 12 and 2001 <= int(y) <= 2025}
    for f in ("el_nino", "netral", "la_nina"):
        ys = [y for y in th if fase(jas.get(y)) == f]
        out[f] = {"tahun": sorted(ys), "terbakar25_ha": round(sum(th[y]["buf25"] for y in ys) / len(ys), 1) if ys else None,
                  "terbakar5_ha": round(sum(th[y]["buf5"] for y in ys) / len(ys), 1) if ys else None}
    pt = ((musim or {}).get("lokasi") or {}).get(sid, {}).get("per_tahun25") or {}
    for f in out:
        ys = [int(y) for y in pt if fase(jas.get(int(y))) == f]
        out[f]["titik25"] = round(sum(pt[str(y)] for y in ys) / len(ys), 1) if ys else None
        out[f]["tahun_titik"] = sorted(ys)
    e, n = out["el_nino"].get("terbakar25_ha"), out["netral"].get("terbakar25_ha")
    out["kali_lipat_terbakar"] = round(e / n, 1) if e and n else None
    e, n = out["el_nino"].get("titik25"), out["netral"].get("titik25")
    out["kali_lipat_titik"] = round(e / n, 1) if e and n else None
    return out

# ------------------------------------------------------------------ 2. HTH
def hth_kelas(n):
    return ("tanpa" if n == 0 else "sangat pendek" if n <= 5 else "pendek" if n <= 10 else "menengah" if n <= 20 else
            "panjang" if n <= 30 else "sangat panjang" if n <= 60 else "kekeringan ekstrem")

def hth(sid, prak):
    cu = J(f"cuaca_{sid}.json") if os.path.exists(os.path.join(DATA, f"cuaca_{sid}.json")) else J("cuaca.json")
    if not cu: return None
    n = 0; akhir = None; maks_th = {}; cur = 0
    for t, r in zip(cu["t"], cu["hujan"]):
        if r is None: continue
        cur = cur + 1 if r < 1 else 0
        maks_th[t[:4]] = max(maks_th.get(t[:4], 0), cur); akhir = t
    n = cur
    # lanjutkan dengan prakiraan (hari setelah data ERA5 terakhir)
    proj = n; hari_p = []
    for h in (prak or []):
        if akhir and h["tanggal"] <= akhir: continue
        if not isinstance(h.get("hujan"), (int, float)): break
        hari_p.append({"tanggal": h["tanggal"], "hujan": h["hujan"]})
        proj = proj + 1 if h["hujan"] < 1 else 0
        if h["tanggal"] >= (HARI_INI + dt.timedelta(days=7)).isoformat(): break
    norm = sorted(v for y, v in maks_th.items() if "2001" <= y <= "2025")
    pct = round(100 * bisect.bisect_left(norm, n) / len(norm)) if norm else None
    hj30 = [r for t, r in zip(cu["t"][-30:], cu["hujan"][-30:]) if r is not None]
    return {"hari": n, "kelas": hth_kelas(n), "sampai": akhir, "proyeksi": proj, "kelas_proyeksi": hth_kelas(proj), "hari_prakiraan": hari_p,
            "maks_tahunan_median": norm[len(norm) // 2] if norm else None, "maks_tahunan_tertinggi": norm[-1] if norm else None,
            "tahun_ini_maks": maks_th.get(str(HARI_INI.year)), "persentil_vs_maks_tahunan": pct,
            "hujan_30hari": round(sum(hj30), 1), "hari_hujan_30": sum(1 for r in hj30 if r >= 1)}

# ------------------------------------------------------------------ 3. kelembapan tanah ERA5-Land
def tanah(s, kuota):
    sid = s["id"]; p = os.path.join(OUT, f"tanah_{sid}.json")
    C = J(p, {"sumber": "ERA5-Land (Copernicus C3S/ECMWF) via Open-Meteo Historical Weather API – kelembapan tanah 7–28 cm (m³/m³), rata-rata harian WIB",
              "t": [], "v": []})
    la, lo = s["pusat_wilayah"]
    akhir = C["t"][-1] if C["t"] else None
    mulai = (dt.date.fromisoformat(akhir) - dt.timedelta(days=10)).isoformat() if akhir else TANAH_MULAI
    batas = (HARI_INI - dt.timedelta(days=1)).isoformat()
    while mulai <= batas and kuota[0] > 0:
        b = min(batas, (dt.date.fromisoformat(mulai) + dt.timedelta(days=5 * 366)).isoformat())
        try:
            d = ambil(TANAH_URL.format(la=la, lo=lo, a=mulai, b=b), timeout=180, json_=True); kuota[0] -= 1
        except Exception as e:
            print(f"tanah {sid} gagal: {e}", file=sys.stderr); break
        if d.get("error"): print(f"tanah {sid}: {d.get('reason')}", file=sys.stderr); break
        H = d["hourly"]; per = {}
        for t, v in zip(H["time"], H["soil_moisture_7_to_28cm"]):
            if v is not None: per.setdefault(t[:10], []).append(v)
        harian = {k: round(sum(v) / len(v), 4) for k, v in per.items() if len(v) >= 20}
        lama = dict(zip(C["t"], C["v"])); lama.update(harian)
        k = sorted(lama); C["t"], C["v"] = k, [lama[x] for x in k]
        mulai = (dt.date.fromisoformat(b) + dt.timedelta(days=1)).isoformat()
        if not harian: break
    tulis(p, C)
    if len(C["t"]) < 365 * 5: return None
    t_akhir = C["t"][-1]; v_akhir = C["v"][-1]
    d0 = dt.date.fromisoformat(t_akhir).timetuple().tm_yday
    def dekat(t):
        d = dt.date.fromisoformat(t).timetuple().tm_yday; a = abs(d - d0); return min(a, 366 - a) <= 10
    norm = sorted(v for t, v in zip(C["t"], C["v"]) if "2011" <= t[:4] <= "2025" and dekat(t))
    pct = round(100 * bisect.bisect_left(norm, v_akhir) / len(norm)) if norm else None
    kat = None if pct is None else "sangat kering" if pct < 10 else "kering" if pct < 25 else "basah" if pct > 75 else "normal"
    i30 = max(0, len(C["t"]) - 60)
    return {"tanggal": t_akhir, "nilai": v_akhir, "persentil": pct, "kategori": kat,
            "normal_median": norm[len(norm) // 2] if norm else None, "normal_p10": norm[int(.1 * (len(norm) - 1))] if norm else None,
            "deret60": [[t, v] for t, v in zip(C["t"][i30:], C["v"][i30:])]}

# ------------------------------------------------------------------ 4. prakiraan musim api
def musim_api(sid, musim, musiman, E):
    M = ((musim or {}).get("lokasi") or {}).get(sid)
    if not M: return None
    e = (E or {}).get("terkini") or {}; ph = e.get("fase"); kk = e.get("kekuatan")
    sm = {b["bulan"]: b for b in ((musiman or {}).get("bulan") or [])}
    KAT = {"rendah": 0, "sedang": 1, "tinggi": 2, "puncak": 3}
    out = []
    for k in range(6):
        y, m = HARI_INI.year + (HARI_INI.month - 1 + k) // 12, (HARI_INI.month - 1 + k) % 12 + 1
        b = M["bulan"][m - 1]; base = KAT.get(b["kategori"], 0); lv = base; alasan = []
        alasan.append(f'Pola 2016–2025: {b["kategori"]} (rata-rata {str(b["rata25"]).replace(".", ",")} titik panas ≤ 25 km; {b["peluang25"]}% tahun ada titik panas)')
        s = sm.get(f"{y}-{m:02d}")
        if s:
            if s["peluang_bawah_normal"] >= 50:
                lv += 1; alasan.append(f'Hujan diprakirakan di bawah normal (peluang {s["peluang_bawah_normal"]}%, ECMWF SEAS5) → naik 1')
            elif s["peluang_atas_normal"] >= 50:
                lv -= 1; alasan.append(f'Hujan diprakirakan di atas normal (peluang {s["peluang_atas_normal"]}%, ECMWF SEAS5) → turun 1')
            else:
                alasan.append(f'Hujan diprakirakan sekitar normal (median {s["median"]} mm vs normal {s["normal"]} mm, ECMWF SEAS5)')
        else:
            alasan.append("Prakiraan hujan musiman ECMWF tidak mencakup bulan berjalan" if k == 0 else "Di luar jangkauan prakiraan hujan musiman (3 bulan); memakai pola & ENSO saja")
        if ph == "el_nino" and base >= 1:
            lv += 1; alasan.append(f'El Niño {kk} sedang berlangsung (ONI {e["oni"]:+.1f}) → naik 1'.replace('.', ','))
        elif ph == "la_nina" and base >= 1:
            lv -= 1; alasan.append(f'La Niña {kk} sedang berlangsung (ONI {e["oni"]:+.1f}) → turun 1'.replace('.', ','))
        elif ph in ("el_nino", "la_nina"):
            alasan.append(("El Niño" if ph == "el_nino" else "La Niña") + f' {kk} berlangsung (ONI {e["oni"]:+.1f}), tetapi tidak mengubah level pada bulan yang polanya rendah'.replace('.', ','))
        lv = max(0, min(4, lv))
        out.append({"bulan": f"{y}-{m:02d}", "nama": f"{BLN[m - 1]} {y}", "pola": b["kategori"], "level": lv, "label": LEVEL_MUSIM[lv],
                    "hujan_seas5": {k_: s[k_] for k_ in ("median", "normal", "peluang_bawah_normal", "peluang_normal", "peluang_atas_normal")} if s else None,
                    "rata25": b["rata25"], "alasan": alasan})
    tinggi = [x for x in out if x["level"] >= 2]
    return {"bulan": out, "puncak": max(out, key=lambda x: (x["level"], -out.index(x)))["nama"] if out else None,
            "mulai_siaga": tinggi[0]["nama"] if tinggi else None, "mulai_bersiap_pola": BLN[M["mulai_bersiap"] - 1] if M.get("mulai_bersiap") else None}

# ------------------------------------------------------------------ 5. Indeks Siaga Desa
def siaga(k, s, prak_hari, H, T, hs, veg, mapi):
    komp = []
    def tambah(nama, nilai, poin, maks, ket): komp.append({"nama": nama, "nilai": nilai, "poin": poin, "maks": maks, "ket": ket})
    h3 = [h for h in (prak_hari or [])[:4] if isinstance(h.get("level"), int)]
    if h3:
        top = max(h3, key=lambda h: h["level"]); lv = top["level"]
        tambah("Bahaya kebakaran (FWI) hari ini–3 hari", ["Rendah", "Sedang", "Tinggi", "Ekstrem"][min(3, lv)] + (f' ({top["tanggal"][8:10]}/{top["tanggal"][5:7]})' if top is not h3[0] else ""), min(3, lv), 3,
               "Sistem Peringkat Bahaya Kebakaran Kanada (FWI) dari prakiraan cuaca ECMWF")
    if H:
        n = max(H["hari"], H["proyeksi"]); p = 0 if n <= 5 else 1 if n <= 10 else 2 if n <= 20 else 3
        tambah("Hari tanpa hujan berturut-turut", f'{n} hari ({hth_kelas(n)})', p, 3, "Hujan < 1 mm/hari (kelas BMKG); ERA5 + prakiraan")
    if T and T.get("persentil") is not None and (HARI_INI - dt.date.fromisoformat(T["tanggal"])).days <= 14:
        pc = T["persentil"]; p = 2 if pc < 10 else 1 if pc < 25 else 0
        tambah("Kelembapan tanah 7–28 cm", f'persentil {pc} ({T["kategori"]})', p, 2, "ERA5-Land dibanding normal 2011–2025")
    # titik panas 72 jam
    dek = None
    for q in hs:
        ls = q.get("ls") or []
        if len(ls) <= k or ls[k] is None or ls[k] > 25: continue
        try: w = dt.datetime.fromisoformat(f'{q["d"]}T{q["t"][:2]}:{q["t"][2:]}:00+00:00')
        except Exception: continue
        if NOW - w > dt.timedelta(hours=72): continue
        dek = ls[k] if dek is None else min(dek, ls[k])
    p = 0 if dek is None else 3 if dek <= 0 else 2 if dek <= 5 else 1
    tambah("Titik panas 72 jam terakhir", "tidak ada ≤ 25 km" if dek is None else ("di dalam desa/Hutan Desa" if dek <= 0 else f"terdekat {dek:.1f} km"), p, 3, "NASA FIRMS (VIIRS & MODIS)")
    if veg and veg.get("umur_hari") is not None and veg["umur_hari"] <= 45:
        p = 1 if veg["status"] == "kering" else 0
        tambah("Kekeringan vegetasi (MODIS)", {"kering": "kering", "agak_kering": "agak kering", "normal": "normal"}.get(veg["status"], veg["status"]), p, 1, f'Citra {veg["tanggal"]}')
    if mapi and mapi.get("bulan"):
        b = mapi["bulan"][0]; p = 1 if b["level"] >= 3 else 0
        tambah("Prakiraan musim api bulan ini", b["label"], p, 1, "Pola bulanan + ECMWF SEAS5 + ENSO")
    skor = sum(c["poin"] for c in komp); maks = sum(c["maks"] for c in komp)
    lv = 0 if skor <= 2 else 1 if skor <= 5 else 2 if skor <= 8 else 3
    # titik panas di dalam desa/HD selalu minimal Siaga
    if dek is not None and dek <= 0: lv = max(lv, 2)
    return {"tanggal": HARI_INI.isoformat(), "skor": skor, "maks": maks, "level": lv, "label": LEVEL_SIAGA[lv], "komponen": komp}

def main():
    os.makedirs(OUT, exist_ok=True)
    geo = J("geo.json"); sites = geo["sites"]
    prak = J("prakiraan.json", {"lokasi": {}}); musim = J("musim/indeks.json"); modis = J("bekas_modis/indeks.json")
    veg = J("vegetasi/indeks.json", {"lokasi": {}}); hs = (J("hotspots.json") or {}).get("titik", [])
    E_lama = J(os.path.join(OUT, "enso.json"))
    E = E_lama if E_lama and E_lama.get("diambil", "")[:10] == HARI_INI.isoformat() else enso(E_lama)
    if E is not E_lama and E: E["diambil"] = NOW.strftime("%Y-%m-%dT%H:%M:%SZ"); tulis(os.path.join(OUT, "enso.json"), E)
    kuota = [int(os.environ.get("TANAH_KUOTA", "4"))]   # batasi permintaan berat ERA5-Land per putaran (isi arsip bertahap)
    riw_p = os.path.join(OUT, "siaga_riwayat.json"); RIW = J(riw_p, {})
    lok = {}
    for k, s in enumerate(sites):
        sid = s["id"]; P = (prak.get("lokasi") or {}).get(sid) or {}
        H = hth(sid, P.get("hari")); T = tanah(s, kuota)
        mapi = musim_api(sid, musim, P.get("musiman"), E)
        V = ((veg.get("lokasi") or {}).get(sid) or {}).get("terkini")
        S = siaga(k, s, P.get("hari"), H, T, hs, V, mapi)
        r = RIW.setdefault(sid, {}); r[S["tanggal"]] = [S["skor"], S["level"]]
        for t in sorted(r)[:-120]: r.pop(t)
        lok[sid] = {"nama": s["hd_nama"], "siaga": S, "riwayat": [[t, *r[t]] for t in sorted(r)][-60:], "hth": H, "tanah": T,
                    "musim_api": mapi, "enso_lokal": hubungan(E, sid, modis, musim)}
    tulis(riw_p, RIW)
    tulis(os.path.join(OUT, "indeks.json"), {
        "diperbarui_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "enso": {k: (E or {}).get(k) for k in ("terkini", "mingguan", "deret", "sumber", "ambang")},
        "metode": {
            "siaga": "Poin: bahaya kebakaran FWI tertinggi hari ini–3 hari (Rendah 0 · Sedang 1 · Tinggi 2 · Ekstrem 3); hari tanpa hujan (≤5: 0 · 6–10: 1 · 11–20: 2 · >20: 3); kelembapan tanah ERA5-Land (persentil <10: 2 · <25: 1); titik panas 72 jam (≤25 km: 1 · ≤5 km: 2 · di dalam desa/Hutan Desa: 3); vegetasi MODIS kering: 1; prakiraan musim api bulan ini sangat tinggi/ekstrem: 1. Jumlah 0–2 Aman · 3–5 Waspada · 6–8 Siaga · ≥9 Awas. Titik panas di dalam desa/Hutan Desa selalu minimal Siaga.",
            "musim_api": "Level awal dari pola bulanan titik panas 2016–2025 (rendah 0 · sedang 1 · tinggi 2 · puncak 3). Naik 1 bila peluang hujan di bawah normal ≥ 50 % (ECMWF SEAS5), turun 1 bila peluang di atas normal ≥ 50 %. Naik 1 saat El Niño (ONI ≥ +0,5) atau turun 1 saat La Niña (ONI ≤ −0,5) untuk bulan yang polanya sedang ke atas. Skala: rendah · sedang · tinggi · sangat tinggi · ekstrem.",
            "hth": "Hari tanpa hujan berturut-turut (hujan < 1 mm/hari; kelas BMKG) dari reanalisis ERA5 lalu prakiraan 7 hari. Reanalisis cenderung mencatat gerimis kecil, sehingga HTH di sini bisa lebih pendek dari pengamatan stasiun BMKG.",
            "tanah": "ERA5-Land kelembapan tanah 7–28 cm, persentil terhadap hari-hari ±10 hari dari tanggal yang sama tahun 2011–2025."},
        "lokasi": lok})
    print("iklim: selesai", {sid: v["siaga"]["label"] for sid, v in lok.items()})

if __name__ == "__main__":
    main()
