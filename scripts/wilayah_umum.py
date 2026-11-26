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
import os, sys, io, csv, json, math, time, shutil, hashlib, tempfile, datetime as dt, urllib.request, subprocess, importlib
import numpy as np

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
        if cache.get("arsip_v") != 1:
            arsip = titik_arsip(site, gm, ke, tmp_ubin); cache["arsip"] = {str(y): v for y, v in arsip.items()}; cache["arsip_v"] = 1
        for y, v in (cache.get("arsip") or {}).items(): jl(f"titik/{y}.json", {"tahun": int(y), "lokasi": [sid], "titik": v})
        kini = titik_tahun_ini(site, gm, ke, cache); cache["titik_kini"] = kini
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
                jalankan(L[0], L[1], *L[2:]); hasil_langkah[L[0]] = True
            except Exception as e:
                hasil_langkah[L[0]] = False; LOG(no, L[0], "gagal:", type(e).__name__, str(e)[:120].replace(W.get("nama", "") or "§", "…"))
            finally: sys.argv = saved
        P = jb("prakiraan.json", {}).get("lokasi", {}).get(sid)
        # status titik panas 7 hari (aturan yang sama dengan Hutan Desa)
        b7 = (KINI - dt.timedelta(days=7)).isoformat()
        dlm = sum(1 for t in kini if t["d"] >= b7 and t["ls"][0] <= 0); r5 = sum(1 for t in kini if t["d"] >= b7 and 0 < t["ls"][0] <= 5); r25 = sum(1 for t in kini if t["d"] >= b7 and t["ls"][0] <= 25)
        status = {"level": 2 if dlm else 1 if r5 else 0, "label": ["Aman", "Waspada", "Siaga"][2 if dlm else 1 if r5 else 0], "di_dalam": dlm, "r5": r5, "r25": r25, "hari": 7}
        L = lambda p: (jb(p, {}).get("lokasi") or {}).get(sid)
        paket = {"versi": 1, "dibuat_utc": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "aid": W["aid"], "site": {k: v for k, v in site.items()},
                 "status": status, "langkah": hasil_langkah, "hotspots": jb("hotspots.json"), "titik_tahun_ini": len(kini),
                 "prakiraan": P, "fdrs": jb(f"prakiraan/fdrs_{sid}.json"), "musim": L("musim/indeks.json"), "rawan": jb(f"rawan/{sid}.geojson"),
                 "bekas_modis": L("bekas_modis/indeks.json"), "bekas_modis_geo": jb(f"bekas_modis/{sid}.geojson"), "vegetasi": L("vegetasi/indeks.json"),
                 "iklim": L("iklim/indeks.json"), "banjir": L("banjir/indeks.json"), "asap": L("asap/indeks.json"), "rekap": L("rekap_musim/indeks.json"),
                 "metode": {k: (jb(p, {}) or {}).get("metode") for k, p in (("iklim", "iklim/indeks.json"), ("banjir", "banjir/indeks.json"), ("asap", "asap/indeks.json"), ("vegetasi", "vegetasi/indeks.json"), ("bekas_modis", "bekas_modis/indeks.json"))}}
        # cache untuk putaran berikutnya
        for p, k in (("iklim/tanah_" + sid + ".json", "tanah"), ("bekas_modis/_olah.json", "modis_bekas"), ("vegetasi/_olah.json", "modis_veg"), ("vegetasi/_jalan.json", "modis_jalan"),
                     ("banjir/sungai.json", "sungai"), ("iklim/siaga_riwayat.json", "siaga_riwayat"), ("prakiraan/fdrs_" + sid + ".json", "fdrs")):
            v = jb(p)
            if v is not None: cache[k] = v
        if P: cache["prakiraan"] = P
        paket["_cache"] = cache
        s = json.dumps(paket, ensure_ascii=False, separators=(",", ":"))
        if len(s) > 4.4e6:   # batas server: buang piksel peta & titik arsip lama dari cache bila terlalu besar
            paket["bekas_modis_geo"] = None; cache.pop("arsip", None); cache["arsip_v"] = 0; s = json.dumps(paket, ensure_ascii=False, separators=(",", ":"))
        if UJI: open(UJI_OUT, "w").write(s); r = {"disimpan": 1}
        else: r = json.loads(http(akun_url(), {"aksi": "pekerja_dinamis", "kunci_pekerja": KUNCI, "data": [{"aid": W["aid"], "data": paket}]}, timeout=180))
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
