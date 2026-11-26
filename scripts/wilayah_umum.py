"""
ANALISIS OTOMATIS WILAYAH SHP PENGGUNA – fitur yang sama dengan Hutan Desa dampingan, untuk wilayah mana pun di Indonesia
=========================================================================================================================

Tiap putaran (GitHub Actions, tiap ± 3 jam):
 1. Ambil daftar wilayah SHP aktif dari server pengguna (Apps Script v16, kunci pekerja) – data PRIBADI, tidak pernah ditulis
    ke repositori publik maupun log (log hanya mencetak nomor urut & jumlah).
 2. Untuk tiap wilayah dibuat "lokasi" setara Hutan Desa: areal = batas SHP, radius 5 km & 25 km dari batas.
 3. Skrip yang SAMA dengan Hutan Desa dampingan dijalankan di folder sementara (PR_DATA):
      prakiraan.py (cuaca, FWI, kualitas udara, prakiraan musiman) · musim_rawan.py (kalender musim api & titik rawan berulang)
      modis_arsip.py (area terbakar MODIS 2001–sekarang & kesehatan vegetasi) · iklim.py (ENSO, hari tanpa hujan, kelembapan tanah,
      prakiraan musim api 6 bulan, Indeks Siaga Desa) · banjir.py (GloFAS) · asap.py (arah asap) · rekap_musim.py (rekap musim api)
    Titik panas: arsip tahunan NASA FIRMS seluruh Indonesia (GitHub Release "arsip-titik-nasional") + FIRMS Area API untuk tahun
    berjalan; sensor sama (VIIRS S-NPP/NOAA-20/NOAA-21 & MODIS).
 4. Paket hasil + cache (agar putaran berikutnya hemat) dikirim ke server: berkas <ID analisis>_dinamis.json, hanya dapat dibaca
    pemilik wilayah & anggota ruang kerjanya.
"""
import contextlib, io, os, sys, io, csv, json, math, time, shutil, hashlib, tempfile, datetime as dt, urllib.request, subprocess, importlib
import numpy as np
os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif,.tiff"   # Sentinel-1 RTC berakhiran .tiff

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PUBLIK = os.path.join(ROOT, "data")
UA = {"User-Agent": "hotspot-fire-prcf wilayah SHP (PRCF Indonesia)"}
KUNCI = os.environ.get("ANALISIS_KEY", "").strip()
FIRMS = os.environ.get("FIRMS_MAP_KEY", "").strip()
RELEASE = "https://github.com/erikprcfi/hotspot-fire-prcf/releases/download/arsip-titik-nasional/"
EPOCH = dt.date(2000, 1, 1)
SENS = ["VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21", "MODIS"]
NOW = dt.datetime.now(dt.timezone.utc); KINI = (NOW + dt.timedelta(hours=7)).date()
MAKS_WILAYAH = int(os.environ.get("WILAYAH_MAKS", "40"))
LOG = lambda *a: print("[wilayah]", *a, flush=True)

def akun_url():
    if os.environ.get("AKUN_URL"): return os.environ["AKUN_URL"]
    import re
    s = open(os.path.join(ROOT, "assets", "akun.js"), encoding="utf-8").read()
    m = re.search(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec", s); return m.group(0)

def http(url, data=None, timeout=180):
    for k in range(4):
        try:
            req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=dict(UA, **({"Content-Type": "text/plain;charset=utf-8"} if data is not None else {})))
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as e:
            if k == 3: raise
            time.sleep(6 * (k + 1))

# ---------------------------------------------------------------- geometri
def lokasi_dari(W):
    from shapely.geometry import shape, mapping
    from shapely.ops import transform, unary_union
    from pyproj import Transformer
    g = W["geojson"]
    if isinstance(g, str): g = json.loads(g)
    if g.get("type") == "FeatureCollection": geom = unary_union([shape(f["geometry"]) for f in g["features"] if f.get("geometry")])
    elif g.get("type") == "Feature": geom = shape(g["geometry"])
    else: geom = shape(g)
    geom = geom.buffer(0)
    c = geom.representative_point()
    aeqd = f"+proj=aeqd +lat_0={c.y} +lon_0={c.x} +datum=WGS84 +units=m"
    ke = Transformer.from_crs("EPSG:4326", aeqd, always_xy=True).transform; dari = Transformer.from_crs(aeqd, "EPSG:4326", always_xy=True).transform
    gm = transform(ke, geom)
    def buf(m): return transform(dari, gm.buffer(m, 32).simplify(30))
    fc = lambda x: {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": mapping(x)}]}
    sid = "shp-" + W["aid"].lower()
    nama = W.get("nama") or "Wilayah saya"
    s = {"id": sid, "hd_nama": nama, "desa_nama": nama, "kec": "", "kab": "", "prov": "", "lphd": "", "luas_ha": round(gm.area / 1e4, 1),
         "pusat": [round(c.y, 5), round(c.x, 5)], "pusat_wilayah": [round(c.y, 5), round(c.x, 5)],
         "hd": fc(geom), "desa": fc(geom), "buf5": fc(buf(5000)), "buf25": fc(buf(25000)), "shp": True}
    return s, geom, (ke, gm)

def jarak_km(geom_m, ke, la, lo):
    """-1 di dalam wilayah, selain itu jarak ke batas (km). Vektor numpy."""
    from shapely import points, distance, contains
    x, y = ke(np.asarray(lo, "f8"), np.asarray(la, "f8"))
    P = points(x, y)
    d = distance(geom_m, P) / 1000.0
    d = np.where(contains(geom_m, P), -1.0, d)
    return d

# ---------------------------------------------------------------- titik panas
_UBIN = {}
def ubin_nasional(a, b, tmp):
    k = f"{a}_{b}"
    if k in _UBIN: return _UBIN[k]
    p = os.path.join(tmp, f"u{k}.npz")
    if not os.path.exists(p):
        try:
            open(p, "wb").write(http(RELEASE + f"u{k}.npz", timeout=300))
        except Exception:
            _UBIN[k] = None; return None
    z = np.load(p); _UBIN[k] = {n: z[n] for n in z.files}; return _UBIN[k]

def titik_arsip(site, geom_m, ke, tmp):
    from shapely.geometry import shape
    x0, y0, x1, y1 = shape(site["buf25"]["features"][0]["geometry"]).bounds
    per_th = {}
    for a in range(math.floor(y0), math.floor(y1) + 1):
        for b in range(math.floor(x0), math.floor(x1) + 1):
            U = ubin_nasional(a, b, tmp)
            if U is None or not len(U["la"]): continue
            la, lo = U["la"] / 1e5, U["lo"] / 1e5
            m = (la >= y0) & (la <= y1) & (lo >= x0) & (lo <= x1)
            if not m.any(): continue
            d = jarak_km(geom_m, ke, la[m], lo[m]); ok = d <= 25
            idx = np.nonzero(m)[0][ok]; d = d[ok]
            for i, dd in zip(idx, d):
                tg = EPOCH + dt.timedelta(days=int(U["hari"][i])); t = f'{int(U["jam"][i]):04d}'
                per_th.setdefault(tg.year, []).append({"k": f'{SENS[int(U["s"][i])]}_{tg}_{t}_{la[i]:.5f}_{lo[i]:.5f}', "la": round(float(la[i]), 5), "lo": round(float(lo[i]), 5),
                    "d": tg.isoformat(), "t": t, "ins": "MODIS" if int(U["s"][i]) == 3 else "VIIRS", "sat": SENS[int(U["s"][i])], "frp": round(float(U["frp"][i]), 2), "st": "SP", "ls": [round(float(dd), 3)]})
    return per_th

def titik_tahun_ini(site, geom_m, ke, cache):
    """FIRMS Area API: tahun berjalan (arsip final SP bila ada, sisanya NRT), inkremental dengan cache paket."""
    from shapely.geometry import shape
    if not FIRMS: return cache.get("titik_kini", [])
    x0, y0, x1, y1 = shape(site["buf25"]["features"][0]["geometry"]).bounds
    bb = f"{x0:.3f},{y0:.3f},{x1:.3f},{y1:.3f}"
    lama = {t["k"]: t for t in cache.get("titik_kini", []) if t["d"][:4] == str(KINI.year)}
    mulai = dt.date.fromisoformat(cache["titik_kini_sampai"]) - dt.timedelta(days=9) if cache.get("titik_kini_sampai", "")[:4] == str(KINI.year) else dt.date(KINI.year, 1, 1)
    src = {"VIIRS_SNPP": "VIIRS_SNPP_NRT", "VIIRS_NOAA20": "VIIRS_NOAA20_NRT", "VIIRS_NOAA21": "VIIRS_NOAA21_NRT", "MODIS": "MODIS_NRT"}
    sp = {"VIIRS_SNPP": "VIIRS_SNPP_SP", "VIIRS_NOAA20": "VIIRS_NOAA20_SP", "VIIRS_NOAA21": "VIIRS_NOAA21_SP", "MODIS": "MODIS_SP"}
    try: avail = {r["data_id"]: (r["min_date"], r["max_date"]) for r in csv.DictReader(io.StringIO(http(f"https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{FIRMS}/ALL", timeout=60).decode()))}
    except Exception: return list(lama.values())
    baris = []
    for s in SENS:
        for kode in (sp[s], src[s]):
            if kode not in avail: continue
            a = max(mulai, dt.date.fromisoformat(avail[kode][0])); b = min(KINI, dt.date.fromisoformat(avail[kode][1]))
            if kode == src[s] and sp[s] in avail: a = max(a, dt.date.fromisoformat(avail[sp[s]][1]) + dt.timedelta(days=1))
            d = a
            while d <= b:
                n = min(5, (b - d).days + 1)
                try:
                    txt = http(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS}/{kode}/{bb}/{n}/{d.isoformat()}", timeout=120).decode()
                    if txt.startswith("latitude"): baris += [(s, kode.endswith("_SP"), r) for r in csv.DictReader(io.StringIO(txt))]
                except Exception: pass
                d += dt.timedelta(days=n); time.sleep(0.3)
    if baris:
        la = np.array([float(r["latitude"]) for _, _, r in baris]); lo = np.array([float(r["longitude"]) for _, _, r in baris])
        dd = jarak_km(geom_m, ke, la, lo)
        for (s, final, r), x in zip(baris, dd):
            if x > 25 or r.get("type") in ("1", "2", "3"): continue
            t = f'{int(r.get("acq_time") or 0):04d}'; k = f'{s}_{r["acq_date"]}_{t}_{float(r["latitude"]):.5f}_{float(r["longitude"]):.5f}'
            lama[k] = {"k": k, "la": round(float(r["latitude"]), 5), "lo": round(float(r["longitude"]), 5), "d": r["acq_date"], "t": t,
                       "ins": "MODIS" if s == "MODIS" else "VIIRS", "sat": s, "frp": round(float(r.get("frp") or 0), 2), "c": str(r.get("confidence", "")), "st": "SP" if final else "NRT", "ls": [round(float(x), 3)]}
    cache["titik_kini_sampai"] = KINI.isoformat()
    return sorted(lama.values(), key=lambda t: (t["d"], t["t"]))

# ---------------------------------------------------------------- cuaca ERA5
CUACA = ("https://archive-api.open-meteo.com/v1/archive?latitude={la}&longitude={lo}&start_date={a}&end_date={b}"
         "&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max&timezone=Asia%2FJakarta")
def cuaca(site, cache):
    C = cache.get("cuaca")
    if C and C.get("diunduh_utc", "")[:10] == NOW.strftime("%Y-%m-%d"): return C
    la, lo = round(site["pusat_wilayah"][0], 2), round(site["pusat_wilayah"][1], 2)
    a = "2001-01-01" if not C else (dt.date.fromisoformat(C["t"][-1]) - dt.timedelta(days=30)).isoformat()
    b = (NOW - dt.timedelta(days=1)).strftime("%Y-%m-%d")
    try: d = json.loads(http(CUACA.format(la=la, lo=lo, a=a, b=b), timeout=300))["daily"]
    except Exception as e: LOG("cuaca gagal", str(e)[:80]); return C
    keys = [("hujan", "precipitation_sum"), ("tmaks", "temperature_2m_max"), ("rh", "relative_humidity_2m_mean"), ("angin", "wind_speed_10m_max")]
    ser = {t: [C[k][i] for k, _ in keys] for i, t in enumerate(C["t"])} if C else {}
    for i, t in enumerate(d["time"]):
        v = [d[x][i] for _, x in keys]
        if v[0] is not None: ser[t] = v
    ts = sorted(ser)
    out = {"sumber": "Open-Meteo Historical Weather API – reanalisis ECMWF ERA5/ERA5-Land (Copernicus Climate Change Service)", "lokasi": f"{la:.2f}, {lo:.2f}",
           "diunduh_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "satuan": {"hujan": "mm/hari", "tmaks": "°C", "rh": "%", "angin": "km/jam"}, "t": ts}
    for j, (k, _) in enumerate(keys): out[k] = [ser[t][j] for t in ts]
    return out

# ---------------------------------------------------------------- peringatan dini wilayah SHP (aturan sama dengan Hutan Desa)
LANGGANAN = {}
def peringatan_wilayah(D, sid, cache, radar=None):
    """Kejadian baru (titik panas ≤ 5 km, bahaya kebakaran, hujan lebat, Indeks Siaga naik, banjir, asap menuju wilayah) dihitung dengan
    scripts/peringatan.py pada folder sementara wilayah ini, lalu dikirim ke pelanggan "shp-<aid>" (pemilik & anggota ruang kerja).
    Status terkirim disimpan di paket (privat), bukan di repo. Tidak ditulis ke umpan publik."""
    m = importlib.reload(importlib.import_module("peringatan")); m.DATA = D
    state = cache.get("terkirim") or {}
    ev = m.kejadian(state)
    if radar and radar.get("status") == "selesai" and (radar.get("luas_baru_ha") or 0) >= 1:
        k = f'radar|{sid}|{radar["dicek_utc"][:10]}'
        if k not in state:
            ev.append({"jenis": "hutan", "sensor": "radar", "situs": sid, "hd": m.json.load(open(os.path.join(D, "geo.json")))["sites"][0]["hd_nama"] if hasattr(m, "json") else sid, "kunci": [k],
                       "luas": radar["luas_baru_ha"], "luas_hd": 0, "petak": radar.get("petak_baru") or 0, "periode": [(KINI - dt.timedelta(days=36)).isoformat(), KINI.isoformat()], "cerah": ""})
    n_push, surat, mati = 0, [], []
    if ev and not UJI and KUNCI and m.URL:
        if "lg" not in LANGGANAN:
            try: LANGGANAN["lg"] = m.get("langganan=1")
            except Exception: LANGGANAN["lg"] = {}
        lg = LANGGANAN["lg"] or {}; vp, vk = lg.get("vapid_private"), lg.get("vapid_public")
        for e in ev:
            for u in lg.get("langganan", []):
                if sid not in (u.get("situs") or []): continue
                judul, isi, rinci, url = m.teks(e, u.get("bahasa", "id"))
                for ps in (u.get("push") or []):
                    if not (vp and vk and ps.get("endpoint")): continue
                    try: st = m.webpush.kirim(ps, {"title": judul, "body": isi, "url": url, "tag": e["kunci"][0]}, vp, vk)
                    except Exception: st = 0
                    if st in (404, 410): mati.append({"id": u["id"], "endpoint": ps["endpoint"]})
                    elif 200 <= st < 300: n_push += 1
                if u.get("email_on") and u.get("email"):
                    surat.append({"id": u["id"], "email": u["email"], "nama": u.get("nama", ""), "bahasa": u.get("bahasa", "id"), "judul": judul, "isi": isi, "rinci": rinci, "url": url})
        if surat or mati or n_push:
            try: m.post({"kunci": "fh-prcf-2026-akun", "aksi": "pekerja_peringatan", "pekerja": KUNCI, "surat": surat, "push_mati": mati,
                         "log": [{"jenis": e["jenis"], "hd": sid, "kunci": e["kunci"]} for e in ev], "push_terkirim": n_push})
            except Exception: pass
    for e in ev:
        for k in e["kunci"]: state[k] = NOW.strftime("%Y-%m-%dT%H:%MZ")
    batas = (NOW - dt.timedelta(days=30)).strftime("%Y-%m-%d")
    cache["terkirim"] = {k: v for k, v in state.items() if v >= batas}
    return len(ev), n_push, len(surat)

# ---------------------------------------------------------------- lapisan raster nasional (data/<lapisan>/t_<lat>_<lon>.png, scripts/gambut_build.py)
def raster_wilayah(lapisan, geom, titik=None):
    """Porsi wilayah pada lapisan raster nasional: {ha, persen, ha_kelas{k: ha}} + jumlah titik panas di atas lapisan (bila titik diberi)."""
    from PIL import Image
    from rasterio import features
    from rasterio.transform import from_origin
    D = os.path.join(DATA_PUBLIK, lapisan); X = json.load(open(os.path.join(D, "indeks.json"))); R = X["piksel_ubin"]
    x0, y0, x1, y1 = geom.bounds; ha_px = lambda la: (111.32 * 1000 / R) ** 2 * math.cos(math.radians(la)) / 1e4
    tot = 0.0; isi = {}; cache = {}
    for la in range(math.floor(y0), math.floor(y1) + 1):
        for lo in range(math.floor(x0), math.floor(x1) + 1):
            M = features.rasterize([(geom, 1)], out_shape=(R, R), transform=from_origin(lo, la + 1, 1 / R, 1 / R), fill=0, dtype="uint8")
            if not M.any(): continue
            hp = np.array([ha_px(la + 1 - (r + .5) / R) for r in range(R)])
            tot += float((M * hp[:, None]).sum())
            k = f"{la}_{lo}"
            if k not in X["ubin"]: continue
            T = np.array(Image.open(os.path.join(D, f"t_{k}.png"))); cache[k] = T
            for v in np.unique(T[M > 0]):
                if v: isi[int(v)] = isi.get(int(v), 0.0) + float((((T == v) & (M > 0)) * hp[:, None]).sum())
    def nilai(lat, lon):
        k = f"{math.floor(lat)}_{math.floor(lon)}"
        if k not in X["ubin"]: return 0
        if k not in cache: cache[k] = np.array(Image.open(os.path.join(D, f"t_{k}.png")))
        T = cache[k]; return int(T[min(R - 1, int((math.floor(lat) + 1 - lat) * R)), min(R - 1, int((lon - math.floor(lon)) * R))])
    ha = sum(isi.values())
    out = {"ha": round(ha, 1), "persen": round(100 * ha / tot, 1) if tot else 0, "luas_wilayah_ha": round(tot, 1), "ha_kelas": {str(k): round(v, 1) for k, v in isi.items()}, "sumber": X.get("sumber"), "catatan": X.get("catatan")}
    if titik is not None:
        b7 = (KINI - dt.timedelta(days=7)).isoformat(); dl = [t for t in titik if (t.get("ls") or [99])[0] <= 0]
        out["titik_tahun_ini"] = sum(1 for t in dl if nilai(t["la"], t["lo"])); out["titik_7hari"] = sum(1 for t in dl if t["d"] >= b7 and nilai(t["la"], t["lo"]))
        out["titik_dalam_tahun_ini"] = len(dl)
    return out

# ---------------------------------------------------------------- Sentinel-2: peringatan pembukaan hutan (sepekan sekali) & luas bekas terbakar
S2_BATAS_HA = 300000          # wilayah lebih luas dari ini tidak dianalisis 20 m (beban memori/waktu)
S2_MULAI = time.time()
S2_MENIT = float(os.environ.get("S2_MENIT", "18"))   # anggaran waktu Sentinel-2 seluruh wilayah per putaran
def s2_sisa(): return S2_MENIT * 60 - (time.time() - S2_MULAI)

def hutan_wilayah(site, cache, lama):
    """scripts/peringatan_hutan.py untuk wilayah SHP (hutan acuan Hansen 2025, Sentinel-2 90 hari vs tahun lalu)."""
    import peringatan_hutan as PH
    today = KINI; old = cache.get("hutan")
    if old and old.get("dicek_utc"):
        age = (today - dt.date.fromisoformat(old["dicek_utc"][:10])).days
        if (old.get("status") == "selesai" and age < 7) or age < 1: return lama.get("hutan"), lama.get("hutan_geo")
    if (site.get("luas_ha") or 0) > S2_BATAS_HA: r = {"lokasi": site["id"], "status": "wilayah terlalu luas untuk analisis 20 m", "dicek_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ")}; cache["hutan"] = r; return r, None
    if s2_sisa() < 240: return lama.get("hutan"), lama.get("hutan_geo")
    try: r, feats = PH.run_site(site, today)
    except Exception as e: r, feats = {"lokasi": site["id"], "status": "gagal", "galat": type(e).__name__, "dicek_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ")}, []
    if r.get("status") == "selesai":
        PH.tandai_baru(feats, ((lama.get("hutan_geo") or {}).get("features") or []), r)
        for f in feats: f["properties"]["hd"] = site["hd_nama"]; f["properties"]["desa"] = ""
        cache["hutan"] = {k: r.get(k) for k in ("status", "dicek_utc")}
        return r, {"type": "FeatureCollection", "features": feats}
    if old and old.get("status") == "selesai": return lama.get("hutan"), lama.get("hutan_geo")   # pertahankan hasil terakhir yang selesai
    cache["hutan"] = {k: r.get(k) for k in ("status", "dicek_utc")}; return r, None

def bekas_s2_wilayah(site, titik, cache, lama, tmp):
    """scripts/bekas_terbakar.py untuk wilayah SHP: musim api (titik panas <= 5 km sejak 2023, jeda > 75 hari = musim baru)."""
    import bekas_terbakar as BT
    BT.OUT = tmp
    idx = dict(((lama.get("bekas_s2") or {}).get("musim")) or {}); geo = list(((lama.get("bekas_s2_geo") or {}).get("features")) or [])
    if (site.get("luas_ha") or 0) > S2_BATAS_HA: return {"musim": idx, "catatan": "wilayah terlalu luas untuk analisis 20 m"}, {"type": "FeatureCollection", "features": geo}
    ev = []; sel = {}
    for t in titik:
        if t["d"] < BT.MULAI or (t.get("ls") or [99])[0] > 5: continue
        k = (t["d"], round(t["la"] / 0.005), round(t["lo"] / 0.005))
        if k in sel: continue
        sel[k] = 1; ev.append({"lat": t["la"], "lon": t["lo"], "mulai_wib": t["d"], "selesai_wib": t["d"], "jumlah_deteksi": 1, "id_kejadian": f'{t["d"]}_{k[1]}_{k[2]}'})
    dikerjakan = 0
    for w in BT.windows(ev):
        wid = f'{site["id"]}_{w["awal"]}'; old = idx.get(wid)
        if old and old.get("status") == "selesai" and old.get("akhir") == w["akhir"]: continue
        if old and old.get("dicoba_utc", "")[:10] == KINI.isoformat(): continue
        if old and old.get("status") in ("tertutup awan", "belum ada citra", "belum ada citra sebelum", "belum ada citra sesudah") and old.get("akhir") == w["akhir"] and (KINI - dt.date.fromisoformat(w["akhir"])).days > BT.POST_DAYS + 15: continue
        if dikerjakan >= 1 or s2_sisa() < 300: break   # satu musim per wilayah per putaran
        w["ev"] = w["ev"][:400]
        try: r = BT.analyse(site, w, old)
        except Exception as e: r = {"status": "gagal", "galat": type(e).__name__}
        dikerjakan += 1
        polys = r.pop("_polys", [])
        r.update({"awal": w["awal"], "akhir": w["akhir"], "n_deteksi": len(w["ev"]), "dicoba_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ")})
        idx[wid] = r
        geo = [f for f in geo if f["properties"].get("musim") != wid]
        for g, v, ha, _ in polys:
            geo.append({"type": "Feature", "geometry": g, "properties": {"musim": wid, "awal_api": w["awal"], "akhir_api": w["akhir"], "keparahan": ["", "rendah–sedang", "sedang–tinggi", "tinggi"][v], "luas_ha": ha,
                        "metode": "Sentinel-2: dNBR >= 0,27 (Key & Benson 2006), SWIR2 naik >= 0,02, NBR sesudah <= 0,20 di >= 2 citra, <= 1 km dari NASA FIRMS, >= 0,5 ha"}})
    return {"musim": idx, "metode": "Sentinel-2 L2A (Element 84 Earth Search): dNBR pra/pasca musim api, 20 m"}, {"type": "FeatureCollection", "features": geo}

# ---------------------------------------------------------------- peta tahunan unduhan: hutan 2000 & kehilangan tutupan pohon per tahun (Hansen GFC, 30 m)
def peta_tahunan(geom, site, cache, lama):
    """GeoTIFF 2 pita (1 = tajuk 2000 %, 2 = tahun kehilangan 1–25 → 2001–2025) dipotong ke wilayah, base64; + GeoJSON petak kehilangan per tahun.
    Dihitung sekali per versi data Hansen (sidik di cache)."""
    import peringatan_hutan as PH, rasterio, base64
    from rasterio.io import MemoryFile
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_origin
    from rasterio import features
    from shapely.geometry import shape as shp, mapping
    v = PH.VER
    if cache.get("peta_tahunan") == v and lama.get("peta_tahunan"): return lama.get("peta_tahunan")
    if (site.get("luas_ha") or 0) > S2_BATAS_HA or s2_sisa() < 180: return lama.get("peta_tahunan")
    x0, y0, x1, y1 = geom.bounds; r = 1 / 4000   # 0,00025° ≈ 28 m (kisi asli Hansen)
    W, H = int(math.ceil((x1 - x0) / r)), int(math.ceil((y1 - y0) / r)); tr = from_origin(x0, y1, r, r)
    if W * H > 40e6: return lama.get("peta_tahunan")
    tc = np.zeros((H, W), "uint8"); ly = np.zeros((H, W), "uint8")
    for tile in PH.ubin_hansen(x0, y0, x1, y1):
        for nm, arr in (("treecover2000", tc), ("lossyear", ly)):
            with rasterio.open(PH.GFC + f"{nm}_{tile}.tif") as src:
                reproject(rasterio.band(src, 1), arr, dst_transform=tr, dst_crs="EPSG:4326", resampling=Resampling.nearest, init_dest_nodata=False, src_nodata=None, dst_nodata=None)
    M = features.rasterize([(geom, 1)], out_shape=(H, W), transform=tr, fill=0, dtype="uint8").astype(bool)
    tc[~M] = 255; ly[~M] = 255
    prof = {"driver": "GTiff", "width": W, "height": H, "count": 2, "dtype": "uint8", "crs": "EPSG:4326", "transform": tr, "nodata": 255, "compress": "deflate", "predictor": 2, "tiled": True}
    with MemoryFile() as mf:
        with mf.open(**prof) as d:
            d.write(tc, 1); d.write(ly, 2); d.set_band_description(1, "treecover2000_persen"); d.set_band_description(2, "lossyear_1_25_=_2001_2025")
            d.update_tags(sumber="Hansen/UMD/Google/USGS/NASA Global Forest Change " + v + " (CC BY 4.0)", wilayah=site["hd_nama"])
        tif = mf.read()
    ha_px = lambda la: (111320 * r) ** 2 * math.cos(math.radians(la)) / 1e4
    per = {}; feats = []
    for y in range(1, 26):
        m = M & (ly == y) & (tc >= 30)
        if not m.any(): continue
        rows = np.nonzero(m)[0]; per[str(2000 + y)] = round(float(sum(ha_px(y1 - (rr + .5) * r) for rr in rows)), 2)
        from shapely.ops import unary_union
        gg = unary_union([shp(g) for g, _ in features.shapes(m.astype("uint8"), mask=m, transform=tr)]).simplify(r * 0.75, preserve_topology=True)
        if not gg.is_empty:
            gm = json.loads(json.dumps(mapping(gg)), parse_float=lambda x: round(float(x), 5))
            feats.append({"type": "Feature", "geometry": gm, "properties": {"tahun": 2000 + y, "luas_ha": per[str(2000 + y)]}})
    hutan2000 = round(float(sum(ha_px(y1 - (rr + .5) * r) for rr in np.nonzero(M & (tc >= 30) & (tc != 255))[0])), 1)
    pilih, total = [], 0   # GeoJSON: tahun terbaru lebih dulu sampai ± 0,5 MB (GeoTIFF selalu memuat semua tahun)
    for f in sorted(feats, key=lambda f: -f["properties"]["tahun"]):
        n = len(json.dumps(f, separators=(",", ":")))
        if total + n <= 0.5e6: pilih.append(f); total += n
    gj = {"type": "FeatureCollection", "features": sorted(pilih, key=lambda f: f["properties"]["tahun"])}; s = json.dumps(gj, separators=(",", ":"))
    out = {"versi": v, "sumber": "Hansen/UMD/Google/USGS/NASA Global Forest Change " + v + " (Hansen dkk. 2013, Science), 30 m, CC BY 4.0",
           "hutan_2000_ha": hutan2000, "hilang_per_tahun_ha": per, "geotiff_b64": base64.b64encode(tif).decode() if len(tif) < 1.2e6 else None,
           "kehilangan_geojson": gj if gj["features"] else None, "geojson_tahun": [f["properties"]["tahun"] for f in gj["features"]]}
    cache["peta_tahunan"] = v
    return out

# ---------------------------------------------------------------- genangan (JRC GSW), biomassa (HGB), tinggi tajuk (Meta/WRI) – profil lahan wilayah
MPC_TOKEN = {}
def mpc_token(col):
    t = MPC_TOKEN.get(col)
    if not t or t[1] - time.time() < 600:
        j = json.loads(http(f"https://planetarycomputer.microsoft.com/api/sas/v1/token/{col}", timeout=60))
        MPC_TOKEN[col] = t = (j["token"], dt.datetime.fromisoformat(j["msft:expiry"].replace("Z", "+00:00")).timestamp())
    return t[0]
def mpc_items(col, bbox):
    req = urllib.request.Request("https://planetarycomputer.microsoft.com/api/stac/v1/search", data=json.dumps({"collections": [col], "bbox": list(bbox), "limit": 50}).encode(), headers=dict(UA, **{"Content-Type": "application/json"}))
    return json.loads(urllib.request.urlopen(req, timeout=90).read())["features"]
def grid(geom, r):
    from rasterio.transform import from_origin
    from rasterio import features
    x0, y0, x1, y1 = geom.bounds; W, H = max(1, int(math.ceil((x1 - x0) / r))), max(1, int(math.ceil((y1 - y0) / r))); tr = from_origin(x0, y1, r, r)
    M = features.rasterize([(geom, 1)], out_shape=(H, W), transform=tr, fill=0, dtype="uint8").astype(bool)
    ha = np.array([(111320 * r) ** 2 * math.cos(math.radians(y1 - (i + .5) * r)) / 1e4 for i in range(H)])[:, None] * np.ones((1, W))
    return tr, (H, W), M, ha
def baca(url, tr, shape, resampling="nearest", dtype="float32", nodata=None, overview=None):
    import rasterio
    from rasterio.warp import reproject, Resampling
    out = np.full(shape, np.nan, dtype)
    with rasterio.open(url, **({"overview_level": overview} if overview is not None else {})) as src:
        reproject(rasterio.band(src, 1), out, dst_transform=tr, dst_crs="EPSG:4326", resampling=getattr(Resampling, resampling), src_nodata=nodata if nodata is not None else src.nodata, dst_nodata=np.nan, init_dest_nodata=False)
    return out

def genangan_wilayah(geom):
    """JRC Global Surface Water v1.3 (Pekel dkk. 2016): frekuensi keberadaan air 1984–2020, 30 m."""
    tr, sh, M, ha = grid(geom, 0.00025); occ = np.full(sh, np.nan, "float32"); tok = mpc_token("jrc-gsw")
    for f in mpc_items("jrc-gsw", geom.bounds):
        a = baca(f["assets"]["occurrence"]["href"] + "?" + tok, tr, sh, dtype="float32", nodata=255); occ = np.where(np.isnan(occ), a, occ)
    v = M & np.isfinite(occ); luas = float(ha[M].sum())
    k = lambda m: round(float(ha[v & m].sum()), 1)
    return {"luas_wilayah_ha": round(luas, 1), "permanen_ha": k(occ >= 75), "musiman_ha": k((occ > 0) & (occ < 75)), "pernah_ha": k(occ > 0), "sering_ha": k(occ >= 25),
            "persen_pernah": round(100 * k(occ > 0) / max(luas, 1e-9), 1),
            "sumber": "JRC Global Surface Water v1.3 (Pekel dkk. 2016, Nature 540) – frekuensi air permukaan 1984–2020, Landsat 30 m; via Microsoft Planetary Computer",
            "kelas": "permanen = air ≥ 75 % pengamatan; musiman/sesekali = 1–74 %; pernah tergenang = > 0 %"}

def biomassa_wilayah(geom):
    """Harmonized Global Biomass 2010 (Spawn dkk. 2020): kepadatan KARBON biomassa atas & bawah permukaan (Mg C/ha; nilai berkas × 0,1), 300 m."""
    tr, sh, M, ha = grid(geom, 0.0027); tok = mpc_token("hgb"); it = mpc_items("hgb", geom.bounds)[0]["assets"]
    agb = baca(it["aboveground"]["href"] + "?" + tok, tr, sh, "bilinear") * 0.1; bgb = baca(it["belowground"]["href"] + "?" + tok, tr, sh, "bilinear") * 0.1
    v = M & np.isfinite(agb) & (agb >= 0); A = float((agb[v] * ha[v]).sum()); Bt = float((np.nan_to_num(bgb[v]) * ha[v]).sum()); luas = float(ha[v].sum())
    return {"c_atas_rata_mgc_ha": round(A / max(luas, 1e-9), 1), "c_bawah_rata_mgc_ha": round(Bt / max(luas, 1e-9), 1), "c_atas_total_tc": round(A), "c_bawah_total_tc": round(Bt),
            "karbon_total_tc": round(A + Bt), "co2e_total_t": round((A + Bt) * 44 / 12), "tahun": 2010,
            "sumber": "Harmonized Global Biomass Carbon Density 2010 (Spawn, Sullivan, Lark & Gibbs 2020, Scientific Data 7:112; ORNL DAAC ds 1763), 300 m; via Microsoft Planetary Computer",
            "metode": "Kepadatan karbon biomassa (Mg C/ha) langsung dari peta (nilai berkas × 0,1); CO₂e = karbon × 44/12. Kondisi tahun 2010 – perubahan sesudahnya lihat kehilangan tutupan pohon."}

META = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/"
def site_luas(geom):
    from pyproj import Geod
    return abs(Geod(ellps="WGS84").geometry_area_perimeter(geom)[0]) / 1e4
def tajuk_wilayah(geom):
    """Meta & WRI High Resolution Canopy Height (Tolan dkk. 2024), 1 m – dirata-rata ke ± 11 m."""
    import rasterio
    from shapely.geometry import shape as shp
    idx = "/tmp/meta_tiles.geojson"
    if not os.path.exists(idx): open(idx, "wb").write(http(META + "tiles.geojson", timeout=300))
    T = [f["properties"]["tile"] for f in json.load(open(idx))["features"] if shp(f["geometry"]).intersects(geom)]
    if not T or (site_luas(geom) > 100000): return None   # 1 m tanpa overview: dibatasi 100.000 ha
    tr, sh, M, ha = grid(geom, 0.0001); H = np.full(sh, np.nan, "float32")
    for q in T[:12]:
        url = META + f"chm/{q}.tif"
        a = baca(url, tr, sh, "average"); H = np.where(np.isnan(H), a, H)
    v = M & np.isfinite(H); luas = float(ha[v].sum())
    if luas <= 0: return None
    kl = [(0, 2), (2, 5), (5, 10), (10, 20), (20, 30), (30, 99)]
    hist = {f"{a}-{b if b < 99 else ''}".rstrip("-"): round(float(ha[v & (H >= a) & (H < b)].sum()), 1) for a, b in kl}
    t5 = v & (H >= 5)
    return {"rata_tajuk_m": round(float((H[t5] * ha[t5]).sum() / max(ha[t5].sum(), 1e-9)), 1) if t5.any() else 0, "persen_tajuk_5m": round(100 * float(ha[t5].sum()) / luas, 1),
            "p90_m": round(float(np.nanpercentile(H[v], 90)), 1), "kelas_ha": hist, "luas_terbaca_ha": round(luas, 1),
            "sumber": "Meta & World Resources Institute – High Resolution Canopy Height Maps (Tolan dkk. 2024, Remote Sensing of Environment 300), 1 m, citra 2018–2020, CC BY 4.0",
            "catatan": "Dirata-rata ke ± 10 m; tinggi tajuk = rata-rata piksel ≥ 5 m."}

# ---------------------------------------------------------------- radar Sentinel-1 (tembus awan): indikasi hilangnya tajuk hutan
def radar_wilayah(geom, site, cache, lama):
    """Sentinel-1 RTC (gamma0, 10 m → 20 m) orbit yang sama: median VH 36 hari terakhir dibanding median VH musim yang sama tahun lalu.
    Piksel hutan acuan (Hansen tajuk 2000 >= 30 %, belum hilang s.d. 2025) ditandai bila median VH turun >= 3 dB DAN setiap citra terkini
    turun >= 2 dB (konsisten, mengurangi derau speckle), petak >= 1 ha. Sepekan sekali. Hasil = INDIKASI (tebangan, pembukaan, kebakaran, genangan)."""
    import peringatan_hutan as PH
    from rasterio import features
    from scipy import ndimage
    from shapely.geometry import shape as shp, mapping
    old = cache.get("radar")
    if old and old.get("dicek_utc"):
        age = (KINI - dt.date.fromisoformat(old["dicek_utc"][:10])).days
        if (old.get("status") == "selesai" and age < 7) or age < 1: return lama.get("radar"), lama.get("radar_geo")
    if site_luas(geom) > 150000 or s2_sisa() < 240: return lama.get("radar"), lama.get("radar_geo")
    tr, sh, M, ha = grid(geom.buffer(0.009), 0.0002)
    x0, y0, x1, y1 = geom.buffer(0.009).bounds
    tc = np.zeros(sh, "uint8"); ly = np.zeros(sh, "uint8")
    import rasterio
    from rasterio.warp import reproject, Resampling
    for tile in PH.ubin_hansen(x0, y0, x1, y1):
        for nm, arr in (("treecover2000", tc), ("lossyear", ly)):
            with rasterio.open(PH.GFC + f"{nm}_{tile}.tif") as src:
                reproject(rasterio.band(src, 1), arr, dst_transform=tr, dst_crs="EPSG:4326", resampling=Resampling.nearest, init_dest_nodata=False, src_nodata=None, dst_nodata=None)
    hutan = M & (tc >= 30) & (ly == 0)
    base = {"dicek_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "hutan_acuan_ha": round(float(ha[hutan].sum()), 1)}
    if not hutan.any(): r = {**base, "status": "tidak ada hutan acuan"}; cache["radar"] = r; return r, None
    tok = mpc_token("sentinel-1-rtc")
    def cari(a, b):
        req = urllib.request.Request("https://planetarycomputer.microsoft.com/api/stac/v1/search", data=json.dumps({"collections": ["sentinel-1-rtc"], "bbox": [x0, y0, x1, y1], "datetime": f"{a}/{b}", "limit": 100}).encode(), headers=dict(UA, **{"Content-Type": "application/json"}))
        return json.loads(urllib.request.urlopen(req, timeout=90).read())["features"]
    kini_it = cari((KINI - dt.timedelta(days=36)).isoformat(), KINI.isoformat())
    if not kini_it: r = {**base, "status": "belum ada citra radar"}; cache["radar"] = r; return r, None
    from collections import Counter
    orb = Counter(f["properties"].get("sat:relative_orbit") for f in kini_it).most_common(1)[0][0]
    kini_it = [f for f in kini_it if f["properties"].get("sat:relative_orbit") == orb][:4]
    acuan_it = [f for f in cari((KINI - dt.timedelta(days=365 + 36)).isoformat(), (KINI - dt.timedelta(days=365)).isoformat()) if f["properties"].get("sat:relative_orbit") == orb][:4]
    if len(acuan_it) < 1 or len(kini_it) < 2: r = {**base, "status": "citra radar orbit yang sama belum cukup"}; cache["radar"] = r; return r, None
    def db(f):
        a = baca(f["assets"]["vh"]["href"] + "?" + tok, tr, sh, "average", nodata=-32768)
        a[(a <= 0) | ~np.isfinite(a)] = np.nan; return 10 * np.log10(a)
    K = [db(f) for f in kini_it]; A = [db(f) for f in acuan_it]
    with np.errstate(all="ignore"):
        mk = np.nanmedian(np.stack(K), 0); ma = np.nanmedian(np.stack(A), 0)
        turun = (mk - ma) <= -3.0
        for x in K: turun &= (x - ma) <= -2.0
    ch = hutan & turun & np.isfinite(mk) & np.isfinite(ma)
    ch = ndimage.binary_opening(ch, structure=np.ones((2, 2)))
    lab, n = ndimage.label(ch, structure=np.ones((3, 3)))
    if n:
        luas_p = ndimage.sum(ha, lab, range(n + 1)); keep = luas_p >= 1.0; keep[0] = False; ch = keep[lab]
    feats = []
    for g, _ in features.shapes(ch.astype("uint8"), mask=ch, transform=tr):
        gg = shp(g); la = gg.centroid.y; luas_g = gg.area * (111320 ** 2) * math.cos(math.radians(la)) / 1e4
        feats.append({"type": "Feature", "geometry": mapping(gg), "properties": {"luas_ha": round(luas_g, 2), "periode": f"{(KINI - dt.timedelta(days=36)).isoformat()} s.d. {KINI.isoformat()}",
                      "dibanding": f"{(KINI - dt.timedelta(days=401)).isoformat()} s.d. {(KINI - dt.timedelta(days=365)).isoformat()}", "metode": "Sentinel-1 VH turun ≥ 3 dB (median) & ≥ 2 dB tiap citra, hutan Hansen, ≥ 1 ha"}})
    r = {**base, "status": "selesai", "luas_ha": round(sum(f["properties"]["luas_ha"] for f in feats), 2), "jumlah_petak": len(feats), "orbit": orb,
         "tanggal_terkini": sorted(f["properties"]["datetime"][:10] for f in kini_it), "tanggal_acuan": sorted(f["properties"]["datetime"][:10] for f in acuan_it)}
    lamaf = ((lama.get("radar_geo") or {}).get("features") or [])
    L = [(shp(f["geometry"]).buffer(0.0002), f["properties"].get("pertama_terdeteksi") or KINI.isoformat()) for f in lamaf]
    for f in feats:
        g = shp(f["geometry"]); cc = [t for gg, t in L if gg.intersects(g)]
        f["properties"]["baru"] = not cc; f["properties"]["pertama_terdeteksi"] = min(cc) if cc else KINI.isoformat()
    nb = [f["properties"] for f in feats if f["properties"]["baru"]]
    r.update({"petak_baru": len(nb), "luas_baru_ha": round(sum(p["luas_ha"] for p in nb), 2)})
    cache["radar"] = {"status": "selesai", "dicek_utc": r["dicek_utc"]}
    return r, {"type": "FeatureCollection", "features": feats}

# ---------------------------------------------------------------- analisis lahan & karbon dihitung ulang saat data tahunan berganti
ANALISIS_ULANG = {"n": 0}
def versi_data_analisis():
    """Sidik versi sumber data analisis lahan & karbon (Hansen GFC, KLHK, kepadatan karbon) – berubah saat data tahunan baru dipasang."""
    import analisis_inti as AI
    return hashlib.sha256(json.dumps([AI.HAN, AI.TAHUN_LC, AI.SUMBER], sort_keys=True, default=str).encode()).hexdigest()[:12]
def analisis_tahunan(W, cache):
    v = versi_data_analisis()
    if not cache.get("analisis_versi"): cache["analisis_versi"] = v; return "awal"   # analisis yang ada dibuat dengan data saat ini
    if cache["analisis_versi"] == v: return None
    if UJI or not KUNCI or ANALISIS_ULANG["n"] >= 1: return "menunggu"   # satu wilayah per putaran
    import analisis_antrean as AA
    ANALISIS_ULANG["n"] += 1
    r = AA.hitung(W["geojson"], W.get("nama"))
    hasil = http(akun_url(), {"aksi": "pekerja_hasil", "kunci": "fh-prcf-2026-akun", "kunci_pekerja": KUNCI, "aid": W["aid"], "hasil": json.loads(json.dumps(r, default=float))}, timeout=180)
    if json.loads(hasil).get("ok"): cache["analisis_versi"] = v; cache["analisis_diperbarui"] = NOW.strftime("%Y-%m-%dT%H:%M:%SZ"); return "diperbarui"
    return "gagal"

# ---------------------------------------------------------------- riwayat titik panas per tahun (arsip nasional 2016– + tahun berjalan)
def riwayat_tahunan(arsip, kini):
    """{tahun: {hd: di dalam wilayah, r5: ≤ 5 km, r25: ≤ 25 km dari batas, bulan: [12 × ≤ 25 km]}} – jumlah deteksi NASA FIRMS (VIIRS & MODIS)."""
    semua = {str(k): v for k, v in arsip.items()}; semua[str(KINI.year)] = kini; out = {}
    for y, L in sorted(semua.items()):
        r = {"hd": 0, "r5": 0, "r25": 0, "bulan": [0] * 12}
        for t in L or []:
            d = (t.get("ls") or [99])[0]
            if d is None or d > 25: continue
            r["r25"] += 1; r["bulan"][int(t["d"][5:7]) - 1] += 1
            if d <= 5: r["r5"] += 1
            if d <= 0: r["hd"] += 1
        out[str(y)] = r
    return out

# ---------------------------------------------------------------- ringkasan mingguan email wilayah SHP (Senin pagi WIB, sekali per pekan)
def mingguan_wilayah(D, site, paket, cache):
    WIB = NOW + dt.timedelta(hours=7); pekan = WIB.strftime("%G-W%V")
    if not UJI and (WIB.weekday() != 0 or not (6 <= WIB.hour < 12)): return None
    if cache.get("mingguan") == pekan and not UJI: return None
    PR = importlib.reload(importlib.import_module("peringatan")); PR.DATA = D
    RM = importlib.reload(importlib.import_module("ringkasan_mingguan")); RM.DATA = D
    sid = site["id"]; hs = RM.J("hotspots.json", {"lokasi": [], "titik": []}); fc = RM.J("prakiraan.json", {"lokasi": {}}); musim = RM.J("musim/indeks.json", {}) or {}
    def susun(u):
        bhs = u.get("bahasa", "id"); en = bhs == "en"
        rinci = ["■ " + site["hd_nama"]] + ["   " + x for x in RM.baris(site, bhs, hs, fc, {}, musim)]
        sg = ((paket.get("iklim") or {}).get("siaga") or {})
        if sg.get("label"): rinci.append("   " + (f'Village Alert Index today: {sg["label"]} ({sg.get("skor")}/{sg.get("maks")}).' if en else f'Indeks Siaga hari ini: {sg["label"]} (skor {sg.get("skor")}/{sg.get("maks")}).'))
        bj = paket.get("banjir") or {}
        if bj.get("label"): rinci.append("   " + (f'Main river (GloFAS 30 days): {bj["label"]}.' if en else f'Sungai utama (GloFAS 30 hari): {bj["label"]}' + (f', mulai {PR.tgl(bj["pertama_lewat"])}' if bj.get("pertama_lewat") else '') + '.'))
        judul = (f'📋 Weekly summary – {site["hd_nama"]} – {PR.tgl(WIB.strftime("%Y-%m-%d"))}' if en else f'📋 Ringkasan mingguan – {site["hd_nama"]} – {PR.tgl(WIB.strftime("%Y-%m-%d"))}')
        isi = ('Your area: hotspots (NASA FIRMS), fire danger & rain forecast (ECMWF), Village Alert Index and river discharge (GloFAS).' if en else
               'Wilayah Anda: titik panas (NASA FIRMS), prakiraan bahaya api & hujan (ECMWF), Indeks Siaga dan debit sungai (GloFAS).')
        return {"id": u["id"], "email": u["email"], "nama": u.get("nama", ""), "bahasa": bhs, "judul": judul, "isi": isi, "rinci": rinci, "url": PR.APP + f"?lokasi={sid}"}
    if UJI:
        sr = susun({"id": "uji", "email": "uji@contoh.org", "bahasa": "id"}); print(sr["judul"]); print("\n".join(sr["rinci"])); return 0
    if not (KUNCI and PR.URL): return None
    if "lg" not in LANGGANAN:
        try: LANGGANAN["lg"] = PR.get("langganan=1")
        except Exception: LANGGANAN["lg"] = {}
    surat = [susun(u) for u in (LANGGANAN["lg"] or {}).get("langganan", []) if u.get("email_on") and u.get("email") and sid in (u.get("situs") or [])]
    if surat:
        PR.post({"kunci": "fh-prcf-2026-akun", "aksi": "pekerja_peringatan", "pekerja": KUNCI, "surat": surat, "push_mati": [],
                 "log": [{"jenis": "mingguan", "hd": sid, "kunci": [f"mingguan|{sid}|{pekan}"]}], "push_terkirim": 0})
    cache["mingguan"] = pekan
    return len(surat)

# ---------------------------------------------------------------- laporan bulanan email wilayah SHP (tanggal 1–3 tiap bulan, pagi WIB, sekali per bulan)
def bulanan_wilayah(site, paket, titik, cache):
    WIB = NOW + dt.timedelta(hours=7); bln = (WIB.date().replace(day=1) - dt.timedelta(days=1)); kunci = bln.strftime("%Y-%m")
    if not UJI and (WIB.day > 3 or not (6 <= WIB.hour < 12) or cache.get("bulanan") == kunci): return None
    PR = importlib.reload(importlib.import_module("peringatan")); sid = site["id"]
    BLN = {"id": ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
           "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]}
    def hitung(y, m):
        T = [t for t in titik if t["d"][:7] == f"{y}-{m:02d}"]; d = lambda t: (t.get("ls") or [99])[0]
        return sum(1 for t in T if d(t) <= 0), sum(1 for t in T if d(t) <= 5), sum(1 for t in T if d(t) <= 25)
    ini, lalu = hitung(bln.year, bln.month), hitung(bln.year - 1, bln.month)
    C = paket.get("cuaca") or (cache.get("cuaca") or {}); hj = None
    try:
        ix = [i for i, t in enumerate(C.get("t") or []) if t[:7] == kunci]; v = [C["hujan"][i] for i in ix if C["hujan"][i] is not None]
        if v: hj = (round(sum(v)), sum(1 for x in v if x >= 1), len(v))
    except Exception: pass
    R = (paket.get("riwayat") or {}); rata = [R[y]["bulan"][bln.month - 1] for y in R if y.isdigit() and int(y) < bln.year]
    h = paket.get("hutan") or {}; g = ((paket.get("profil") or {}).get("gambut") or {})
    def susun(u):
        b = u.get("bahasa", "id"); en = b == "en"; nm = BLN[b][bln.month - 1]
        rinci = ["■ " + site["hd_nama"] + f" – {nm} {bln.year}"]
        rinci.append((f"Hotspots: {ini[0]} inside the area, {ini[1]} within 5 km, {ini[2]} within 25 km (same month last year: {lalu[0]} / {lalu[1]} / {lalu[2]})." if en else
                      f"Titik panas: {ini[0]} di dalam wilayah, {ini[1]} dalam 5 km, {ini[2]} dalam 25 km (bulan yang sama tahun lalu: {lalu[0]} / {lalu[1]} / {lalu[2]})."))
        if rata: rinci.append((f"Average for {nm} 2016–{bln.year - 1}: {PR.angka(sum(rata) / len(rata), b)} detections within 25 km." if en else f"Rata-rata {nm} 2016–{bln.year - 1}: {PR.angka(sum(rata) / len(rata), b)} deteksi dalam 25 km."))
        if hj: rinci.append((f"Rain (ERA5): {hj[0]} mm, {hj[1]} rainy days ({hj[2]} days of data)." if en else f"Hujan (ERA5): {hj[0]} mm, {hj[1]} hari hujan ({hj[2]} hari data)."))
        if h.get("status") == "selesai": rinci.append((f"Forest change (Sentinel-2, {h['dicek_utc'][:10]}): {PR.angka(h.get('luas_baru_ha') or 0, b)} ha new indications." if en else f"Perubahan hutan (Sentinel-2, {h['dicek_utc'][:10]}): {PR.angka(h.get('luas_baru_ha') or 0, b)} ha indikasi baru."))
        if g.get("ha"): rinci.append((f"Peat: {PR.angka(g['ha'], b)} ha ({g['persen']}% of the area)." if en else f"Gambut: {PR.angka(g['ha'], b)} ha ({g['persen']}% wilayah)."))
        rinci.append(("Full PDF report: open the app → Reports & data → PDF report." if en else "Laporan PDF lengkap: buka aplikasi → Laporan & data → Laporan PDF."))
        judul = (f"📊 Monthly report {nm} {bln.year} – {site['hd_nama']}" if en else f"📊 Laporan bulanan {nm} {bln.year} – {site['hd_nama']}")
        isi = ("Monthly summary of your area from official satellite & weather data." if en else "Ringkasan bulanan wilayah Anda dari data satelit & cuaca resmi.")
        return {"id": u["id"], "email": u["email"], "nama": u.get("nama", ""), "bahasa": b, "judul": judul, "isi": isi, "rinci": rinci, "url": PR.APP + f"?lokasi={sid}"}
    if UJI:
        sr = susun({"id": "uji", "email": "uji@contoh.org", "bahasa": "id"}); print(sr["judul"]); print("\n".join(sr["rinci"])); return 0
    if not (KUNCI and PR.URL): return None
    if "lg" not in LANGGANAN:
        try: LANGGANAN["lg"] = PR.get("langganan=1")
        except Exception: LANGGANAN["lg"] = {}
    surat = [susun(u) for u in (LANGGANAN["lg"] or {}).get("langganan", []) if u.get("email_on") and u.get("email") and sid in (u.get("situs") or [])]
    if surat:
        PR.post({"kunci": "fh-prcf-2026-akun", "aksi": "pekerja_peringatan", "pekerja": KUNCI, "surat": surat, "push_mati": [],
                 "log": [{"jenis": "bulanan", "hd": sid, "kunci": [f"bulanan|{sid}|{kunci}"]}], "push_terkirim": 0})
    cache["bulanan"] = kunci
    return len(surat)

# ---------------------------------------------------------------- satu wilayah
def jalankan(mod, fn="main", *args):
    """Muat ulang modul skrip agar membaca PR_DATA terbaru, lalu jalankan fungsinya."""
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    m = importlib.import_module(mod); m = importlib.reload(m)
    return getattr(m, fn)(*args)

def satu(W, tmp_ubin, no):
    site, geom, (ke, gm) = lokasi_dari(W); sid = site["id"]
    lama = {}
    if UJI: lama = json.load(open(UJI_OUT)) if os.path.exists(UJI_OUT) else {}
    else:
        try: lama = json.loads(http(akun_url() + f"?pekerja={KUNCI}&dinamis={W['aid']}", timeout=120)).get("data") or {}
        except Exception as e: LOG(no, "paket lama tidak terbaca")
    cache = lama.get("_cache") or {}
    D = tempfile.mkdtemp(prefix="pr_"); os.environ["PR_DATA"] = D
    try:
        jl = lambda p, o: (os.makedirs(os.path.dirname(os.path.join(D, p)), exist_ok=True), json.dump(o, open(os.path.join(D, p), "w"), ensure_ascii=False, separators=(",", ":")))
        jb = lambda p, d=None: json.load(open(os.path.join(D, p))) if os.path.exists(os.path.join(D, p)) else d
        jl("geo.json", {"sites": [site]})
        # titik panas: arsip nasional (2016–tahun lalu) + tahun berjalan
        cache.pop("arsip", None); cache.pop("arsip_v", None)   # arsip dihitung ulang tiap putaran dari ubin nasional (paket tetap kecil)
        arsip = titik_arsip(site, gm, ke, tmp_ubin)
        for y, v in arsip.items(): jl(f"titik/{y}.json", {"tahun": int(y), "lokasi": [sid], "titik": v})
        kini = titik_tahun_ini(site, gm, ke, cache); cache["titik_kini"] = kini
        riwayat = riwayat_tahunan(arsip, kini)
        try:
            au = analisis_tahunan(W, cache)
            if au: LOG(no, "analisis lahan & karbon:", au)
        except Exception as e: LOG(no, "analisis ulang gagal:", type(e).__name__)
        try: hutan_r, hutan_geo = hutan_wilayah(site, cache, lama)
        except Exception as e: hutan_r, hutan_geo = lama.get("hutan"), lama.get("hutan_geo"); LOG(no, "hutan S2 gagal:", type(e).__name__)
        semua_titik = [t for v in arsip.values() for t in v] + kini
        try:
            bks, bks_geo = bekas_s2_wilayah(site, semua_titik, cache, lama, os.path.join(D, "_bt"))
        except Exception as e: bks, bks_geo = lama.get("bekas_s2"), lama.get("bekas_s2_geo"); LOG(no, "bekas S2 gagal:", type(e).__name__)
        if hutan_r: jl("hutan/peringatan.json", {"lokasi": {sid: hutan_r}})
        try: radar_r, radar_geo = radar_wilayah(geom, site, cache, lama)
        except Exception as e: radar_r, radar_geo = lama.get("radar"), lama.get("radar_geo"); LOG(no, "radar gagal:", type(e).__name__, *([str(e)[:160]] if UJI else []))
        try: peta_th = peta_tahunan(geom, site, cache, lama)
        except Exception as e: peta_th = lama.get("peta_tahunan"); LOG(no, "peta tahunan gagal:", type(e).__name__)
        profil = {}
        try: profil["gambut"] = raster_wilayah("gambut", geom, kini)
        except Exception as e: LOG(no, "gambut gagal:", type(e).__name__)
        lp = lama.get("profil") or {}
        for k, fn in (("genangan", genangan_wilayah), ("biomassa", biomassa_wilayah), ("tajuk", tajuk_wilayah)):   # data statis: dihitung sekali
            if lp.get(k) and (site.get("luas_ha") or 0) <= S2_BATAS_HA: profil[k] = lp[k]; continue
            if (site.get("luas_ha") or 0) > S2_BATAS_HA: continue
            try: profil[k] = fn(geom)
            except Exception as e: LOG(no, k, "gagal:", type(e).__name__, *([str(e)[:120]] if UJI else []))
        jl(f"titik/{KINI.year}.json", {"tahun": KINI.year, "lokasi": [sid], "titik": kini})
        batas14 = (KINI - dt.timedelta(days=14)).isoformat()
        jl("hotspots.json", {"lokasi": [sid], "titik": [t for t in kini if t["d"] >= batas14], "diperbarui_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ")})
        # data publik pendukung
        for p in ("angin/indonesia.json", "iklim/enso.json"):
            if os.path.exists(os.path.join(DATA_PUBLIK, p)): os.makedirs(os.path.dirname(os.path.join(D, p)), exist_ok=True); shutil.copy(os.path.join(DATA_PUBLIK, p), os.path.join(D, p))
        # cuaca ERA5 & cache skrip
        C = cuaca(site, cache)
        if C: cache["cuaca"] = C; jl(f"cuaca_{sid}.json", C)
        for p, k in (("iklim/tanah_" + sid + ".json", "tanah"), ("bekas_modis/_olah.json", "modis_bekas"), ("vegetasi/_olah.json", "modis_veg"), ("vegetasi/_jalan.json", "modis_jalan"),
                     ("banjir/sungai.json", "sungai"), ("iklim/siaga_riwayat.json", "siaga_riwayat"), ("prakiraan/fdrs_" + sid + ".json", "fdrs")):
            if cache.get(k) is not None: jl(p, cache[k])
        if cache.get("prakiraan"): jl("prakiraan.json", {"lokasi": {sid: cache["prakiraan"]}})
        os.environ["PR_PDF"] = "0"; os.environ["TANAH_KUOTA"] = "4"
        langkah = [("prakiraan", "update", [site], []), ("musim_rawan", "main"), ("modis_arsip", "main"), ("iklim", "main"), ("banjir", "main"), ("asap", "main"), ("rekap_musim", "main")]
        hasil_langkah = {}
        for L in langkah:
            try:
                saved = sys.argv; sys.argv = [L[0] + ".py"] + (["--paksa"] if L[0] == "banjir" else [])
                if UJI: jalankan(L[0], L[1], *L[2:])
                else:   # log Actions publik: keluaran skrip (nama/koordinat wilayah pengguna) tidak dicetak – UU PDP
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): jalankan(L[0], L[1], *L[2:])
                hasil_langkah[L[0]] = True
            except Exception as e:
                hasil_langkah[L[0]] = False; LOG(no, L[0], "gagal:", type(e).__name__, *( [str(e)[:120]] if UJI else []))
            finally: sys.argv = saved
        P = jb("prakiraan.json", {}).get("lokasi", {}).get(sid)
        # status titik panas 7 hari (aturan yang sama dengan Hutan Desa)
        b7 = (KINI - dt.timedelta(days=7)).isoformat()
        dlm = sum(1 for t in kini if t["d"] >= b7 and t["ls"][0] <= 0); r5 = sum(1 for t in kini if t["d"] >= b7 and 0 < t["ls"][0] <= 5); r25 = sum(1 for t in kini if t["d"] >= b7 and t["ls"][0] <= 25)
        status = {"level": 2 if dlm else 1 if r5 else 0, "label": ["Aman", "Waspada", "Siaga"][2 if dlm else 1 if r5 else 0], "di_dalam": dlm, "r5": r5, "r25": r25, "hari": 7}
        L = lambda p: (jb(p, {}).get("lokasi") or {}).get(sid)
        paket = {"versi": 1, "dibuat_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "aid": W["aid"], "site": {k: v for k, v in site.items()},
                 "status": status, "langkah": hasil_langkah, "riwayat": riwayat, "profil": profil, "hutan": hutan_r, "hutan_geo": hutan_geo, "peta_tahunan": peta_th, "radar": radar_r, "radar_geo": radar_geo, "bekas_s2": bks, "bekas_s2_geo": bks_geo, "hotspots": jb("hotspots.json"), "titik_tahun_ini": len(kini),
                 "prakiraan": P, "fdrs": jb(f"prakiraan/fdrs_{sid}.json"), "musim": L("musim/indeks.json"), "rawan": jb(f"rawan/{sid}.geojson"),
                 "bekas_modis": L("bekas_modis/indeks.json"), "bekas_modis_geo": jb(f"bekas_modis/{sid}.geojson"), "vegetasi": L("vegetasi/indeks.json"),
                 "iklim": L("iklim/indeks.json"), "banjir": L("banjir/indeks.json"), "asap": L("asap/indeks.json"), "rekap": L("rekap_musim/indeks.json"),
                 "metode": {k: (jb(p, {}) or {}).get("metode") for k, p in (("iklim", "iklim/indeks.json"), ("banjir", "banjir/indeks.json"), ("asap", "asap/indeks.json"), ("vegetasi", "vegetasi/indeks.json"), ("bekas_modis", "bekas_modis/indeks.json"))}}
        for f in ((paket.get("rawan") or {}).get("features") or []):   # istilah wilayah SHP (bukan Hutan Desa / desa)
            pr = f.get("properties") or {}
            if pr.get("lokasi") in ("di dalam Hutan Desa", "di wilayah desa"): pr["lokasi"] = "di dalam wilayah"
        for k in ("bekas_modis", "bekas_modis_geo", "vegetasi", "musim", "rawan", "rekap", "banjir", "prakiraan", "fdrs"):   # langkah yang dilewati/gagal: pakai hasil sebelumnya
            if paket.get(k) is None and lama.get(k) is not None: paket[k] = lama[k]
        # cache untuk putaran berikutnya
        for p, k in (("iklim/tanah_" + sid + ".json", "tanah"), ("bekas_modis/_olah.json", "modis_bekas"), ("vegetasi/_olah.json", "modis_veg"), ("vegetasi/_jalan.json", "modis_jalan"),
                     ("banjir/sungai.json", "sungai"), ("iklim/siaga_riwayat.json", "siaga_riwayat"), ("prakiraan/fdrs_" + sid + ".json", "fdrs")):
            v = jb(p)
            if v is not None: cache[k] = v
        if P: cache["prakiraan"] = P
        try:
            if UJI: pw = peringatan_wilayah(D, sid, cache, radar_r)
            else:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): pw = peringatan_wilayah(D, sid, cache, radar_r)
            LOG(no, "peringatan: kejadian %d · push %d · email %d" % pw)
        except Exception as e: LOG(no, "peringatan gagal:", type(e).__name__)
        try:
            if UJI: mg = mingguan_wilayah(D, site, paket, cache)
            else:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): mg = mingguan_wilayah(D, site, paket, cache)
            if mg is not None: LOG(no, "ringkasan mingguan: email %d" % mg)
        except Exception as e: LOG(no, "ringkasan mingguan gagal:", type(e).__name__)
        try:
            if UJI: mb = bulanan_wilayah(site, paket, semua_titik, cache)
            else:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): mb = bulanan_wilayah(site, paket, semua_titik, cache)
            if mb is not None: LOG(no, "laporan bulanan: email %d" % mb)
        except Exception as e: LOG(no, "laporan bulanan gagal:", type(e).__name__)
        paket["_cache"] = cache
        s = json.dumps(paket, ensure_ascii=False, separators=(",", ":"))
        if len(s) > 4.4e6:   # batas server: buang piksel peta & titik arsip lama dari cache bila terlalu besar
            paket["bekas_modis_geo"] = None; cache.pop("modis_veg", None); s = json.dumps(paket, ensure_ascii=False, separators=(",", ":"))
        if len(s) > 4.4e6:
            paket["bekas_s2_geo"] = None; paket["hutan_geo"] = None; paket["radar_geo"] = None; s = json.dumps(paket, ensure_ascii=False, separators=(",", ":"))
        if len(s) > 4.4e6 and paket.get("peta_tahunan"):
            paket["peta_tahunan"] = dict(paket["peta_tahunan"], kehilangan_geojson=None); s = json.dumps(paket, ensure_ascii=False, separators=(",", ":"))
        if UJI: open(UJI_OUT, "w").write(s); r = {"disimpan": 1}
        else: r = json.loads(http(akun_url(), {"kunci": "fh-prcf-2026-akun", "aksi": "pekerja_dinamis", "kunci_pekerja": KUNCI, "data": [{"aid": W["aid"], "data": paket}]}, timeout=180))
        LOG(no, "selesai", {k: ("ok" if v else "gagal") for k, v in hasil_langkah.items()}, f"{len(s) / 1e6:.2f} MB", "tersimpan" if r.get("disimpan") else "TIDAK tersimpan")
        return bool(r.get("disimpan"))
    finally:
        shutil.rmtree(D, ignore_errors=True); os.environ.pop("PR_DATA", None)

UJI = "--uji" in sys.argv; UJI_OUT = os.environ.get("UJI_OUT", "/tmp/paket_uji.json")
def main():
    if UJI:   # uji lokal: python scripts/wilayah_umum.py --uji wilayah.geojson  (tanpa server; paket ditulis ke UJI_OUT)
        g = json.load(open(sys.argv[sys.argv.index("--uji") + 1])); tmp = tempfile.mkdtemp(prefix="ubin_")
        satu({"aid": "00000000-0000-4000-8000-000000000001", "nama": "Wilayah uji", "geojson": g}, tmp, 1); return
    if not KUNCI: LOG("ANALISIS_KEY tidak ada – dilewati"); return
    try: W = json.loads(http(akun_url() + f"?pekerja={KUNCI}&wilayah=1", timeout=180))
    except Exception as e: LOG("daftar wilayah gagal:", type(e).__name__); return
    if not W.get("ok"): LOG("server belum v16 atau kunci ditolak"); return
    L = W.get("wilayah") or []
    LOG(f"{len(L)} wilayah SHP aktif")
    tmp = tempfile.mkdtemp(prefix="ubin_"); ok = 0
    try:
        for i, w in enumerate(L[:MAKS_WILAYAH], 1):
            try: ok += satu(w, tmp, i)
            except Exception as e: LOG(i, "gagal:", type(e).__name__)
    finally: shutil.rmtree(tmp, ignore_errors=True)
    LOG(f"tersimpan {ok}/{min(len(L), MAKS_WILAYAH)}")

if __name__ == "__main__":
    main()
