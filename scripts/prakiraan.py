"""
Prakiraan cuaca 7 hari & peringatan dini bahaya kebakaran – Fire Hotspot PRCF
=============================================================================

Sumber (semuanya resmi & terbuka):
  * BMKG  – API Prakiraan Cuaca Publik per desa (kode wilayah Kemendagri adm4), ±3 hari, per 3 jam.
            https://api.bmkg.go.id/publik/prakiraan-cuaca  – wajib mencantumkan BMKG sebagai sumber.
  * ECMWF – model IFS 0,25° (European Centre for Medium-Range Weather Forecasts, data terbuka CC BY 4.0),
            7 hari, diakses melalui Open-Meteo. Model yang sama dipakai sistem bahaya kebakaran global
            Copernicus (GWIS/EFFIS).
  * ERA5  – reanalisis ECMWF/Copernicus (Open-Meteo archive) untuk riwayat cuaca harian
            (dipakai menghitung kekeringan bahan bakar sampai hari ini).

Indeks bahaya kebakaran: Canadian Forest Fire Weather Index (Van Wagner 1987) yang menjadi dasar
FDRS Indonesia/Malaysia & BMKG, dihitung dari cuaca pukul 12.00 waktu setempat (suhu, kelembapan,
angin, hujan 24 jam). Penyesuaian khatulistiwa: panjang hari DMC = 9,0 jam (de Groot dkk. 2006)
dan faktor DC = 1,39 (cffdrs, lintang -10..10).
Kelas FDRS Indonesia (de Groot dkk. 2006, Mitig Adapt Strat Glob Change 12:165–180):
  FFMC (mudahnya penyulutan): Rendah 0–72, Sedang 73–77, Tinggi 78–82, Ekstrem 83+
  ISI  (sulitnya pengendalian): Rendah 0–1, Sedang 2–3, Tinggi 4–5, Ekstrem 6+
  DC   (kekeringan dalam/potensi asap gambut): Rendah <140, Sedang 140–260, Tinggi 260–350, Ekstrem >350
Tingkat bahaya harian = kelas tertinggi antara FFMC dan DC.
"""
import os, json, math, time, hashlib, datetime, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PDIR = os.path.join(DATA, "prakiraan")
UA = {"User-Agent": "hotspot-fire-prcf (github actions; PRCF Indonesia)"}
TZ = "Asia%2FJakarta"
ADM4 = {"nangalauk": "61.06.03.2007", "batangtau": "61.06.19.2005", "nyuai": "61.06.19.2009",
        "pundjung": "61.06.19.2007", "bumilestari": "61.06.07.2012", "bukitbelang": "61.06.20.2005"}
KELAS = ["Rendah", "Sedang", "Tinggi", "Ekstrem"]
WMO = {0: "Cerah", 1: "Cerah berawan", 2: "Berawan sebagian", 3: "Berawan", 45: "Berkabut", 48: "Berkabut",
       51: "Gerimis ringan", 53: "Gerimis", 55: "Gerimis lebat", 61: "Hujan ringan", 63: "Hujan sedang", 65: "Hujan lebat",
       80: "Hujan lokal ringan", 81: "Hujan lokal sedang", 82: "Hujan lokal lebat", 95: "Hujan petir", 96: "Hujan petir", 99: "Hujan petir"}

def get(url, tries=4, timeout=90):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                raw = r.read()
                return json.loads(raw), hashlib.sha256(raw).hexdigest()
        except Exception as e:
            last = e; time.sleep(5 * (k + 1))
    raise last

# ------------------------------------------------------------------ Fire Weather Index (Van Wagner 1987)
def ffmc_f(f0, t, h, w, r):
    mo = 147.2 * (101 - f0) / (59.5 + f0)
    if r > 0.5:
        rf = r - 0.5
        mo = mo + 42.5 * rf * math.exp(-100 / (251 - mo)) * (1 - math.exp(-6.93 / rf)) + (0.0015 * (mo - 150) ** 2 * math.sqrt(rf) if mo > 150 else 0)
        mo = min(mo, 250)
    ed = 0.942 * h ** 0.679 + 11 * math.exp((h - 100) / 10) + 0.18 * (21.1 - t) * (1 - math.exp(-0.115 * h))
    if mo > ed:
        ko = 0.424 * (1 - (h / 100) ** 1.7) + 0.0694 * math.sqrt(w) * (1 - (h / 100) ** 8)
        m = ed + (mo - ed) * 10 ** (-ko * 0.581 * math.exp(0.0365 * t))
    else:
        ew = 0.618 * h ** 0.753 + 10 * math.exp((h - 100) / 10) + 0.18 * (21.1 - t) * (1 - math.exp(-0.115 * h))
        if mo < ew:
            k1 = 0.424 * (1 - ((100 - h) / 100) ** 1.7) + 0.0694 * math.sqrt(w) * (1 - ((100 - h) / 100) ** 8)
            m = ew - (ew - mo) * 10 ** (-k1 * 0.581 * math.exp(0.0365 * t))
        else:
            m = mo
    return max(0.0, min(101.0, 59.5 * (250 - m) / (147.2 + m)))

def dmc_f(p0, t, h, r, el=9.0):
    t = max(t, -1.1)
    rk = 1.894 * (t + 1.1) * (100 - h) * el * 1e-4
    if r > 1.5:
        rw = 0.92 * r - 1.27
        wmi = 20 + 280 / math.exp(0.023 * p0)
        b = 100 / (0.5 + 0.3 * p0) if p0 <= 33 else (14 - 1.3 * math.log(p0) if p0 <= 65 else 6.2 * math.log(p0) - 17.2)
        wmr = wmi + 1000 * rw / (48.77 + b * rw)
        pr = max(0.0, 43.43 * (5.6348 - math.log(wmr - 20)))
    else:
        pr = p0
    return max(0.0, pr + rk)

def dc_f(d0, t, r, fl=1.39):
    t = max(t, -2.8)
    pe = max(0.0, (0.36 * (t + 2.8) + fl) / 2)
    if r > 2.8:
        rw = 0.83 * r - 1.27
        smi = 800 * math.exp(-d0 / 400)
        dr = max(0.0, d0 - 400 * math.log(1 + 3.937 * rw / smi))
    else:
        dr = d0
    return max(0.0, dr + pe)

def isi_f(f, w):
    fm = 147.2 * (101 - f) / (59.5 + f)
    sf = 19.115 * math.exp(-0.1386 * fm) * (1 + fm ** 5.31 / 4.93e7)
    return sf * math.exp(0.05039 * w)

def bui_f(p, d):
    if p <= 0 and d <= 0:
        return 0.0
    if p <= 0.4 * d:
        return 0.8 * d * p / (p + 0.4 * d)
    return max(0.0, p - (1 - 0.8 * d / (p + 0.4 * d)) * (0.92 + (0.0114 * p) ** 1.7))

def fwi_f(i, b):
    bb = 0.1 * i * (0.626 * b ** 0.809 + 2) if b <= 80 else 0.1 * i * (1000 / (25 + 108.64 * math.exp(-0.023 * b)))
    return bb if bb <= 1 else math.exp(2.72 * (0.434 * math.log(bb)) ** 0.647)

def k_ffmc(v): return 0 if v < 73 else 1 if v < 78 else 2 if v < 83 else 3
def k_isi(v):  return 0 if v < 2 else 1 if v < 4 else 2 if v < 6 else 3
def k_dc(v):   return 0 if v < 140 else 1 if v < 260 else 2 if v <= 350 else 3

def step(state, t, h, w, r):
    f0, p0, d0 = state
    f = ffmc_f(f0, t, h, w, r); p = dmc_f(p0, t, h, r); d = dc_f(d0, t, r)
    i = isi_f(f, w); b = bui_f(p, d); x = fwi_f(i, b)
    return (f, p, d), {"ffmc": round(f, 1), "dmc": round(p, 1), "dc": round(d, 1), "isi": round(i, 1), "bui": round(b, 1), "fwi": round(x, 1),
                       "k_ffmc": k_ffmc(f), "k_isi": k_isi(i), "k_dc": k_dc(d), "level": max(k_ffmc(f), k_dc(d))}

# ------------------------------------------------------------------ cuaca siang (12.00 WIB) & hujan 24 jam
def noon_inputs(hourly, before=None):
    """hourly (zona Asia/Jakarta) -> {tanggal: [suhu, rh, angin km/jam, hujan 24 jam s.d. 12.00]}
    before: daftar hujan per jam sebelum jam pertama data (untuk melengkapi 24 jam hari pertama)."""
    ts = hourly["time"]; out = {}
    pre = list(before or [])
    for i, t in enumerate(ts):
        if not t.endswith("T12:00"):
            continue
        if i < 23 and len(pre) < 23 - i:
            continue
        vals = [hourly["temperature_2m"][i], hourly["relative_humidity_2m"][i], hourly["wind_speed_10m"][i]]
        rain = (pre[len(pre) - (23 - i):] if i < 23 else []) + hourly["precipitation"][max(0, i - 23):i + 1]
        if any(v is None for v in vals) or any(v is None for v in rain):
            continue
        out[t[:10]] = [round(vals[0], 2), round(min(100, max(1, vals[1])), 1), round(vals[2], 2), round(sum(rain), 2)]
    return out

def site_inputs(site, prov):
    """Riwayat input siang hari (ERA5 + analisis terbaru), disimpan & ditambah tiap hari."""
    f = os.path.join(PDIR, f'input_{site["id"]}.json')
    old = json.load(open(f)) if os.path.exists(f) else {"hari": {}}
    today = datetime.date.today()
    la, lo = site["pusat_wilayah"]
    have = sorted(old["hari"])
    start = (today - datetime.timedelta(days=400)).isoformat() if len(have) < 300 else (today - datetime.timedelta(days=20)).isoformat()
    end = (today - datetime.timedelta(days=1)).isoformat()
    hv = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
    if old.get("era5_diperbarui", "")[:10] != today.isoformat():
        url = f"https://archive-api.open-meteo.com/v1/archive?latitude={la:.3f}&longitude={lo:.3f}&start_date={start}&end_date={end}&hourly={hv}&timezone={TZ}"
        try:
            d, sha = get(url, timeout=180)
            for k, v in noon_inputs(d["hourly"]).items():
                old["hari"][k] = v + ["ERA5"]
            old["era5_diperbarui"] = today.isoformat()
            prov.append({"jenis": "Prakiraan: ERA5", "lokasi": site["id"], "url": url, "ok": True, "sha256": sha})
        except Exception as e:
            prov.append({"jenis": "Prakiraan: ERA5", "lokasi": site["id"], "url": url, "ok": False, "galat": str(e)[:200]})
    # hari-hari terakhir yang belum ada di ERA5 (ERA5 tertunda ±5 hari): analisis model terbaru
    url = f"https://api.open-meteo.com/v1/forecast?latitude={la:.3f}&longitude={lo:.3f}&hourly={hv}&past_days=10&forecast_days=1&timezone={TZ}"
    try:
        d, sha = get(url)
        for k, v in noon_inputs(d["hourly"]).items():
            if k < today.isoformat() and (k not in old["hari"] or old["hari"][k][-1] != "ERA5"):
                old["hari"][k] = v + ["analisis"]
        H = d["hourly"]; y = (today - datetime.timedelta(days=1)).isoformat()
        old["hujan_kemarin_jam"] = [H["precipitation"][i] or 0 for i, t in enumerate(H["time"]) if t[:10] == y]
    except Exception as e:
        prov.append({"jenis": "Prakiraan: analisis", "lokasi": site["id"], "url": url, "ok": False, "galat": str(e)[:200]})
    keep = (today - datetime.timedelta(days=420)).isoformat()
    old["hari"] = {k: v for k, v in sorted(old["hari"].items()) if k >= keep}
    json.dump(old, open(f, "w"), separators=(",", ":"))
    return old["hari"], old.get("hujan_kemarin_jam", [])

# ------------------------------------------------------------------ BMKG
def bmkg(site, prov):
    code = ADM4.get(site["id"])
    if not code:
        return None
    url = f"https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={code}"
    try:
        d, sha = get(url, timeout=60)
    except Exception as e:
        prov.append({"jenis": "Prakiraan: BMKG", "lokasi": site["id"], "url": url, "ok": False, "galat": str(e)[:200]}); return None
    items = [x for day in d["data"][0]["cuaca"] for x in day]
    jam = [{"t": x["local_datetime"], "suhu": x.get("t"), "rh": x.get("hu"), "angin": x.get("ws"), "arah": x.get("wd"),
            "hujan": x.get("tp"), "awan": x.get("tcc"), "cuaca": x.get("weather_desc"), "ikon": x.get("image")} for x in items]
    analysis = items[0].get("analysis_date", "") if items else ""
    harian = {}
    for j in jam:
        dd = j["t"][:10]; h = harian.setdefault(dd, {"tanggal": dd, "tmin": 99, "tmaks": -99, "hujan": 0.0, "rh": [], "cuaca": {}, "n": 0})
        if j["suhu"] is not None: h["tmin"] = min(h["tmin"], j["suhu"]); h["tmaks"] = max(h["tmaks"], j["suhu"])
        h["hujan"] += j["hujan"] or 0; h["n"] += 1
        if j["rh"] is not None: h["rh"].append(j["rh"])
        if j["cuaca"]: h["cuaca"][j["cuaca"]] = h["cuaca"].get(j["cuaca"], 0) + 1
    hh = []
    for h in harian.values():
        hh.append({"tanggal": h["tanggal"], "tmin": h["tmin"], "tmaks": h["tmaks"], "hujan": round(h["hujan"], 1),
                   "rh": round(sum(h["rh"]) / len(h["rh"])) if h["rh"] else None, "n_jam": h["n"],
                   "cuaca": max(h["cuaca"], key=h["cuaca"].get) if h["cuaca"] else ""})
    prov.append({"jenis": "Prakiraan: BMKG", "lokasi": site["id"], "url": url, "ok": True, "sha256": sha})
    lok = d.get("lokasi", {})
    return {"adm4": code, "desa": lok.get("desa"), "kecamatan": lok.get("kecamatan"), "analisis_utc": analysis, "url": url,
            "harian": hh, "jam": jam}

def bmkg_noon(jam):
    """Input siang dari BMKG: data jam 13.00 WIB (terdekat dari 12.00) & hujan 24 jam sebelumnya."""
    out = {}
    for i, j in enumerate(jam):
        if j["t"][11:13] != "13" or None in (j["suhu"], j["rh"], j["angin"]):
            continue
        t0 = datetime.datetime.fromisoformat(j["t"]) - datetime.timedelta(hours=24)
        prev = [x for x in jam if t0 < datetime.datetime.fromisoformat(x["t"]) <= datetime.datetime.fromisoformat(j["t"])]
        if len(prev) < 8:
            continue  # butuh 24 jam penuh (8 x 3 jam)
        out[j["t"][:10]] = [j["suhu"], j["rh"], j["angin"], sum(x["hujan"] or 0 for x in prev)]
    return out

# ------------------------------------------------------------------ kualitas udara (Copernicus CAMS)
ISPU = [(15.5, "Baik"), (55.4, "Sedang"), (150.4, "Tidak Sehat"), (250.4, "Sangat Tidak Sehat"), (1e9, "Berbahaya")]  # PM2.5 µg/m³, kategori BMKG
def ispu(v):
    for i, (lim, nm) in enumerate(ISPU):
        if v <= lim:
            return i
    return 4

def udara(site, prov):
    la, lo = site["pusat_wilayah"]
    url = (f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={la:.3f}&longitude={lo:.3f}"
           f"&hourly=pm2_5,pm10,carbon_monoxide,aerosol_optical_depth&past_days=7&forecast_days=5&timezone={TZ}&domains=cams_global")
    try:
        d, sha = get(url)
    except Exception as e:
        prov.append({"jenis": "Kualitas udara: CAMS", "lokasi": site["id"], "url": url, "ok": False, "galat": str(e)[:200]}); return None
    h = d["hourly"]; now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime("%Y-%m-%dT%H:00")
    by = {}
    for i, t in enumerate(h["time"]):
        if h["pm2_5"][i] is None:
            continue
        o = by.setdefault(t[:10], {"pm": [], "pm10": [], "co": [], "aod": []})
        o["pm"].append(h["pm2_5"][i]); o["pm10"].append(h["pm10"][i] or 0); o["co"].append(h["carbon_monoxide"][i] or 0); o["aod"].append(h["aerosol_optical_depth"][i] or 0)
    harian = []
    for k, o in sorted(by.items()):
        if len(o["pm"]) < 18:
            continue
        m = sum(o["pm"]) / len(o["pm"])
        harian.append({"tanggal": k, "pm25": round(m, 1), "pm25_maks": round(max(o["pm"]), 1), "pm10": round(sum(o["pm10"]) / len(o["pm10"]), 1),
                       "co": round(sum(o["co"]) / len(o["co"])), "aod": round(max(o["aod"]), 2), "kategori": ispu(m)})
    i_now = max([i for i, t in enumerate(h["time"]) if t <= now] or [0])
    jam = [{"t": h["time"][i], "pm25": h["pm2_5"][i]} for i in range(max(0, i_now - 48), len(h["time"])) if h["pm2_5"][i] is not None]
    prov.append({"jenis": "Kualitas udara: CAMS", "lokasi": site["id"], "url": url, "ok": True, "sha256": sha})
    return {"sumber": "Copernicus Atmosphere Monitoring Service (CAMS) global, ECMWF – via Open-Meteo Air Quality API",
            "kategori_nama": [n for _, n in ISPU], "kategori_batas": "PM2.5 (dihitung dari rata-rata 24 jam), µg/m³: Baik 0–15,5; Sedang 15,6–55,4; Tidak Sehat 55,5–150,4; Sangat Tidak Sehat 150,5–250,4; Berbahaya >250,5 (rentang kategori BMKG)",
            "sekarang": {"t": h["time"][i_now], "pm25": h["pm2_5"][i_now], "pm10": h["pm10"][i_now], "co": h["carbon_monoxide"][i_now], "aod": h["aerosol_optical_depth"][i_now],
                         "pm25_24j": round(sum(v for v in h["pm2_5"][max(0, i_now - 23):i_now + 1] if v is not None) / max(1, len([v for v in h["pm2_5"][max(0, i_now - 23):i_now + 1] if v is not None])), 1),
                         "kategori": ispu(sum(v for v in h["pm2_5"][max(0, i_now - 23):i_now + 1] if v is not None) / max(1, len([v for v in h["pm2_5"][max(0, i_now - 23):i_now + 1] if v is not None])))},
            "harian": harian, "jam": jam}

# ------------------------------------------------------------------ utama
def update(sites, prov):
    os.makedirs(PDIR, exist_ok=True)
    out = {"diperbarui_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "sumber": {"bmkg": "BMKG – Badan Meteorologi, Klimatologi, dan Geofisika, API Prakiraan Cuaca Publik (data.bmkg.go.id)",
                      "ecmwf": "ECMWF IFS 0,25° (European Centre for Medium-Range Weather Forecasts), data terbuka CC BY 4.0, via Open-Meteo",
                      "era5": "ECMWF ERA5 reanalisis (Copernicus Climate Change Service), via Open-Meteo",
                      "fdrs": "Fire Weather Index (Van Wagner 1987); kelas FDRS Indonesia/Malaysia (de Groot dkk. 2006)"},
           "kelas": KELAS, "lokasi": {}}
    old_f = os.path.join(DATA, "prakiraan.json")
    try:
        OLD = json.load(open(old_f)) if os.path.exists(old_f) else {}
    except Exception:
        OLD = {}
    for s in sites:
        try:
            hist, kemarin = site_inputs(s, prov)
            la, lo = s["pusat_wilayah"]
            url = (f"https://api.open-meteo.com/v1/forecast?latitude={la:.3f}&longitude={lo:.3f}&models=ecmwf_ifs025"
                   f"&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
                   f"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=15&timezone={TZ}")
            fc, sha = get(url)
            prov.append({"jenis": "Prakiraan: ECMWF", "lokasi": s["id"], "url": url, "ok": True, "sha256": sha})
            fnoon = noon_inputs(fc["hourly"], before=kemarin if len(kemarin) == 24 else None)
            # hujan 24 jam hari pertama prakiraan memerlukan jam sebelumnya: ambil dari riwayat bila perlu
            today = datetime.date.today().isoformat()
            days = [k for k in sorted(hist) if k < today]
            state = (85.0, 6.0, 15.0); riwayat = []
            for k in days:
                t, h, w, r = hist[k][:4]
                state, idx = step(state, t, h, w, r); riwayat.append({"tanggal": k, "hujan": round(r, 1), **idx, "sumber": hist[k][4]})
            base_state = state
            D = fc["daily"]; hari = []
            st = base_state
            for i, k in enumerate(D["time"][:15]):
                if k < today:
                    continue
                v = fnoon.get(k)
                if v is None or D["precipitation_sum"][i] is None:  # di luar jangkauan model
                    continue
                st, idx = step(st, *v)
                n_ke = len(hari) + 1
                hari.append({"tanggal": k, "keyakinan": "tinggi" if n_ke <= 3 else "sedang" if n_ke <= 7 else "rendah", "cuaca": WMO.get(D["weather_code"][i], ""), "kode_cuaca": D["weather_code"][i],
                             "tmin": D["temperature_2m_min"][i], "tmaks": D["temperature_2m_max"][i], "hujan": D["precipitation_sum"][i],
                             "angin_maks": D["wind_speed_10m_max"][i], "siang": {"suhu": v[0], "rh": v[1], "angin": v[2], "hujan24": round(v[3], 1)}, **idx})
            bm = bmkg(s, prov)
            if not bm:  # BMKG tidak terjangkau: pakai data BMKG terakhir bila masih mencakup hari ini
                ob = (OLD.get("lokasi", {}).get(s["id"]) or {}).get("bmkg")
                if ob and ob.get("harian") and ob["harian"][-1]["tanggal"] >= today:
                    bm = {**ob, "basi": True}
            if bm and not bm.get("basi"):
                st = base_state; fd = []
                for k, v in sorted(bmkg_noon(bm["jam"]).items()):
                    if k < today:
                        continue
                    st, idx = step(st, *v); fd.append({"tanggal": k, **idx})
                bm["fdrs"] = fd
            if len(days) < 60:
                raise RuntimeError(f"riwayat cuaca baru {len(days)} hari (perlu >= 60 hari untuk indeks kekeringan)")
            # riwayat indeks lengkap (±400 hari) untuk menu riwayat cuaca – berkas terpisah agar ringan
            json.dump({"t": [r["tanggal"] for r in riwayat], "hujan": [r["hujan"] for r in riwayat], "ffmc": [r["ffmc"] for r in riwayat],
                       "dc": [r["dc"] for r in riwayat], "isi": [r["isi"] for r in riwayat], "fwi": [r["fwi"] for r in riwayat],
                       "level": [r["level"] for r in riwayat], "sumber": [r["sumber"] for r in riwayat]},
                      open(os.path.join(PDIR, f'fdrs_{s["id"]}.json'), "w"), separators=(",", ":"))
            ud = udara(s, prov)
            if not ud:
                ud = (OLD.get("lokasi", {}).get(s["id"]) or {}).get("udara")
            out["lokasi"][s["id"]] = {"udara": ud, "hari": hari[:14], "riwayat": riwayat[-45:], "bmkg": bm,
                                      "titik": [round(la, 4), round(lo, 4)], "hari_riwayat": len(riwayat)}
        except Exception as e:
            prov.append({"jenis": "Prakiraan", "lokasi": s["id"], "ok": False, "galat": str(e)[:200]})
        time.sleep(1)
    if os.path.exists(old_f):  # pertahankan lokasi yang gagal diperbarui
        try:
            old = json.load(open(old_f))
            for k, v in old.get("lokasi", {}).items():
                if k not in out["lokasi"]:
                    out["lokasi"][k] = {**v, "basi": True}
        except Exception:
            pass
    json.dump(out, open(old_f, "w"), separators=(",", ":"), ensure_ascii=False)
    return out

if __name__ == "__main__":
    geo = json.load(open(os.path.join(DATA, "geo.json")))
    prov = []
    o = update(geo["sites"], prov)
    for k, v in o["lokasi"].items():
        print(k, [(h["tanggal"][5:], KELAS[h["level"]], h["ffmc"], h["dc"], h["hujan"]) for h in v["hari"]])
        if v.get("bmkg"): print("   BMKG", [(h["tanggal"][5:], h["cuaca"], h["hujan"]) for h in v["bmkg"]["harian"]], [(x["tanggal"][5:], KELAS[x["level"]]) for x in v["bmkg"]["fdrs"]])
    print([p for p in prov if not p.get("ok")])
