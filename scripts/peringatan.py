"""
Peringatan dini otomatis – Pantau Rimbak PRCF (dijalankan GitHub Actions setelah data diperbarui, tiap 3 jam).
Pemicu (per Hutan Desa yang dipilih pengguna):
  1. Titik panas BARU NASA FIRMS di dalam desa/Hutan Desa atau <= 5 km dari batas desa, terdeteksi <= 36 jam terakhir.
  2. Bahaya kebakaran (FDRS, prakiraan BMKG/ECMWF) TINGGI atau EKSTREM dalam 3 hari ke depan.
  3. Indikasi pembukaan/kerusakan hutan BARU dari citra Sentinel-2 (scripts/peringatan_hutan.py, sepekan sekali) >= 1 ha.
  4. Hujan LEBAT (>= 50 mm/hari, kategori BMKG: lebat 50–100, sangat lebat 100–150, ekstrem > 150) diprakirakan 1–3 hari ke depan –
     waspada banjir & longsor (prakiraan BMKG/ECMWF yang sama dengan menu Prakiraan; satu peringatan per lokasi per tanggal).
Dikirim ke pengguna terverifikasi yang berlangganan: notifikasi HP (Web Push) dan/atau email (lewat Apps Script PRCF).
Setiap peringatan dicatat di data/peringatan/terkirim.json agar tidak terkirim dua kali. Nilai data tidak diubah.
Butuh env: ANALISIS_KEY, AKUN_URL.
"""
import re, os, sys, json, datetime, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import webpush
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "peringatan"); os.makedirs(OUT, exist_ok=True)
KEY, URL = os.environ.get("ANALISIS_KEY", ""), os.environ.get("AKUN_URL", "")
APP = "https://erikprcfi.github.io/hotspot-fire-prcf/app.html"
NOW = datetime.datetime.now(datetime.timezone.utc)
KELAS = {"id": ["Rendah", "Sedang", "Tinggi", "Ekstrem"], "en": ["Low", "Moderate", "High", "Extreme"]}
SAT = {"N": "VIIRS S-NPP", "N20": "VIIRS NOAA-20", "N21": "VIIRS NOAA-21", "T": "MODIS Terra", "A": "MODIS Aqua", "Terra": "MODIS Terra", "Aqua": "MODIS Aqua"}

def get(q):
    with urllib.request.urlopen(f"{URL}?pekerja={KEY}&{q}", timeout=60) as r: return json.loads(r.read())
def post(o):
    req = urllib.request.Request(URL, data=json.dumps(o).encode(), headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
def wib(d, t):
    dt = datetime.datetime.strptime(d + t.zfill(4), "%Y-%m-%d%H%M")
    return dt.replace(tzinfo=datetime.timezone.utc), (dt + datetime.timedelta(hours=7)).strftime("%d/%m/%Y %H:%M")

def kejadian(state):
    geo = json.load(open(os.path.join(DATA, "geo.json"))); sites = geo["sites"]
    hs = json.load(open(os.path.join(DATA, "hotspots.json")))["titik"]
    fc = json.load(open(os.path.join(DATA, "prakiraan.json"))) if os.path.exists(os.path.join(DATA, "prakiraan.json")) else {"lokasi": {}}
    fh = os.path.join(DATA, "hutan", "peringatan.json"); hutan = (json.load(open(fh)).get("lokasi") or {}) if os.path.exists(fh) else {}
    def jl(p):
        try: return json.load(open(os.path.join(DATA, p))).get("lokasi") or {}
        except Exception: return {}
    iklim, banjir, asap = jl("iklim/indeks.json"), jl("banjir/indeks.json"), jl("asap/indeks.json")
    out = []
    for k, s in enumerate(sites):
        baru = []
        for p in hs:
            if not p.get("ls") or len(p["ls"]) <= k or p["ls"][k] > 5: continue
            t, w = wib(p["d"], p["t"])
            if NOW - t > datetime.timedelta(hours=36): continue   # jendela 36 jam: tetap tertangkap walau satu putaran terlewat; tidak terkirim ganda (terkirim.json)
            kunci = f'titik|{s["id"]}|{p["k"]}'
            if kunci in state: continue
            baru.append((kunci, p, w))
        if baru:
            out.append({"jenis": "titik", "situs": s["id"], "hd": s["hd_nama"], "kunci": [b[0] for b in baru],
                        "titik": [{"waktu": w, "jarak": round(max(0, p["ls"][k]), 1), "sat": SAT.get(p["sat"], p["sat"]), "conf": p["c"], "frp": p["frp"],
                                   "lat": p["la"], "lon": p["lo"]} for _, p, w in baru]})
        hari = (fc.get("lokasi", {}).get(s["id"], {}) or {}).get("hari") or []
        h3 = [h for h in hari[:3] if (h.get("level") or 0) >= 2]
        if h3:
            top = max(h3, key=lambda h: h["level"]); kunci = f'fdrs|{s["id"]}|{top["tanggal"]}|{top["level"]}'
            if kunci not in state:
                out.append({"jenis": "bahaya", "situs": s["id"], "hd": s["hd_nama"], "kunci": [kunci], "level": top["level"], "tanggal": top["tanggal"],
                            "hari": [{"tanggal": h["tanggal"], "level": h["level"], "fwi": h.get("fwi")} for h in h3]})
        hh = [x for x in (((fc.get("lokasi") or {}).get(s["id"]) or {}).get("hari") or [])[1:4] if isinstance(x.get("hujan"), (int, float))]
        lebat = [x for x in hh if x["hujan"] >= 50]
        if lebat:
            top = max(lebat, key=lambda x: x["hujan"]); kunci = f'hujan|{s["id"]}|{top["tanggal"]}'
            if kunci not in state:
                out.append({"jenis": "hujan", "situs": s["id"], "hd": s["hd_nama"], "kunci": [kunci], "mm": top["hujan"], "tanggal": top["tanggal"],
                            "hari": [{"tanggal": x["tanggal"], "mm": x["hujan"]} for x in hh]})
        # Indeks Siaga Desa naik ke Siaga/Awas (data/iklim/indeks.json)
        I = (iklim.get(s["id"]) or {})
        S = I.get("siaga") or {}; riw = I.get("riwayat") or []
        if (S.get("level") or 0) >= 2 and S.get("tanggal"):
            lalu = [r for r in riw if r[0] < S["tanggal"]]
            if not lalu or lalu[-1][2] < S["level"]:
                kunci = f'siaga|{s["id"]}|{S["tanggal"]}|{S["level"]}'
                if kunci not in state:
                    out.append({"jenis": "siaga", "situs": s["id"], "hd": s["hd_nama"], "kunci": [kunci], "level": S["level"], "label": S["label"], "skor": S["skor"],
                                "komponen": [c for c in S.get("komponen", []) if c["poin"] > 0]})
        # debit sungai melewati ambang banjir (data/banjir/indeks.json)
        B = banjir.get(s["id"]) or {}
        if (B.get("level") or 0) >= 1 and B.get("pertama_lewat"):
            kunci = f'banjir|{s["id"]}|{B["pertama_lewat"]}|{B["level"]}'
            if kunci not in state:
                out.append({"jenis": "banjir", "situs": s["id"], "hd": s["hd_nama"], "kunci": [kunci], "level": B["level"], "label": B["label"],
                            "tanggal": B["pertama_lewat"], "puncak": B.get("puncak"), "rp2": B["sungai"]["rp2"], "rp5": B["sungai"]["rp5"]})
        # asap dari titik panas diperkirakan menuju desa (data/asap/indeks.json)
        A = [x for x in ((asap.get(s["id"]) or {}).get("sumber") or []) if x.get("menuju_desa") and not x.get("di_dalam")]
        A = [(f'asap|{s["id"]}|{x["lat"]:.2f}|{x["lon"]:.2f}|{x["deteksi_wib"][:5]}', x) for x in A]
        A = [(k_, x) for k_, x in A if k_ not in state]
        if A:
            out.append({"jenis": "asap", "situs": s["id"], "hd": s["hd_nama"], "kunci": [k_ for k_, _ in A], "sumber": [x for _, x in A][:5]})
        h = hutan.get(s["id"]) or {}
        if h.get("status") == "selesai" and (h.get("luas_baru_ha") or 0) >= 1:
            kunci = f'hutan|{s["id"]}|{h["dicek_utc"][:10]}'
            if kunci not in state and NOW - datetime.datetime.fromisoformat(h["dicek_utc"].replace("Z", "+00:00")) <= datetime.timedelta(days=8):
                out.append({"jenis": "hutan", "situs": s["id"], "hd": s["hd_nama"], "kunci": [kunci], "luas": h["luas_baru_ha"], "luas_hd": h.get("luas_baru_di_hd_ha") or 0,
                            "petak": h.get("petak_baru") or 0, "periode": h.get("periode_terkini") or [], "cerah": h.get("cerah_persen")})
    return out

KONF = {"id": {"h": "tinggi", "n": "sedang (nominal)", "l": "rendah"}, "en": {"h": "high", "n": "nominal", "l": "low"}}
def konf(c, b):
    c = str(c).strip().lower()
    return KONF[b].get(c[:1], c) if c[:1] in "hnl" else f"{c}%"   # VIIRS: h/n/l, MODIS: 0–100 %
def tgl(d): return f'{d[8:10]}/{d[5:7]}/{d[:4]}'
def angka(x, b): return f"{x:.1f}".replace(".", ",") if b == "id" else f"{x:.1f}"
def teks(e, bhs):
    en = bhs == "en"; url = f'{APP}?lokasi={e["situs"]}'
    if en: e = dict(e, hd=re.sub(r"^Hutan Desa (.+)$", r"\1 Village Forest", e["hd"]))
    if e["jenis"] == "titik":
        n = len(e["titik"]); dek = min(x["jarak"] for x in e["titik"])
        b = "en" if en else "id"
        judul = (f'🔥 {n} new hotspot{"s" if n > 1 else ""} near {e["hd"]}' if en else f'🔥 {n} titik panas baru dekat {e["hd"]}')
        isi = (f'Nearest {angka(dek, b)} km from the village boundary (NASA FIRMS satellite detection). Check in the field and report via the app.' if en else
               f'Terdekat {angka(dek, b)} km dari batas desa (deteksi satelit NASA FIRMS). Mohon cek lapangan dan laporkan lewat aplikasi.')
        rinci = [(f'{x["waktu"]} WIB · {x["sat"]} · {angka(x["jarak"], b)} km · ' + ("confidence" if en else "keyakinan") + f' {konf(x["conf"], b)} · FRP {angka(float(x["frp"]), b)} MW · {x["lat"]:.5f}, {x["lon"]:.5f}') for x in e["titik"]]
    elif e["jenis"] == "hujan":
        b = "en" if en else "id"; mm = e["mm"]
        kat = (("extreme" if mm > 150 else "very heavy" if mm >= 100 else "heavy") if en else ("ekstrem" if mm > 150 else "sangat lebat" if mm >= 100 else "lebat"))
        judul = (f'🌧️ {kat.capitalize()} rain forecast at {e["hd"]}' if en else f'🌧️ Hujan {kat} diprakirakan di {e["hd"]}')
        isi = (f'About {angka(mm, b)} mm of rain forecast on {tgl(e["tanggal"])} (BMKG/ECMWF). Watch for floods and landslides; secure equipment and avoid river crossings.' if en else
               f'Prakiraan hujan ± {angka(mm, b)} mm pada {tgl(e["tanggal"])} (BMKG/ECMWF). Waspadai banjir dan longsor; amankan peralatan dan hindari menyeberang sungai saat arus deras.')
        rinci = [f'{tgl(x["tanggal"])}: {angka(x["mm"], b)} mm' for x in e["hari"]]
    elif e["jenis"] == "siaga":
        b = "en" if en else "id"; LBL = {"id": ["Aman", "Waspada", "Siaga", "Awas"], "en": ["Safe", "Watch", "Alert", "Danger"]}
        lb = LBL[b][e["level"]]
        judul = (f'🚨 Village Alert Index {lb.upper()} at {e["hd"]}' if en else f'🚨 Indeks Siaga Desa {lb.upper()} di {e["hd"]}')
        isi = (f'Score {e["skor"]}: dry weather, fire danger and/or hotspots point to elevated fire risk. Strengthen patrols, avoid burning and prepare fire-fighting equipment.' if en else
               f'Skor {e["skor"]}: cuaca kering, bahaya kebakaran dan/atau titik panas menunjukkan risiko api meningkat. Perkuat patroli, hindari membakar, siapkan alat pemadam.')
        NM = {"Bahaya kebakaran (FWI) hari ini–3 hari": "Fire danger (FWI) today–3 days", "Hari tanpa hujan berturut-turut": "Consecutive dry days",
              "Kelembapan tanah 7–28 cm": "Soil moisture 7–28 cm", "Titik panas 72 jam terakhir": "Hotspots in last 72 h",
              "Kekeringan vegetasi (MODIS)": "Vegetation dryness (MODIS)", "Prakiraan musim api bulan ini": "Fire-season outlook this month"}
        rinci = [f'{NM.get(c["nama"], c["nama"]) if en else c["nama"]}: {c["nilai"]} (+{c["poin"]})' for c in e["komponen"]]
    elif e["jenis"] == "banjir":
        b = "en" if en else "id"; p = e.get("puncak") or {}
        lb = {"id": ["Normal", "Waspada", "Siaga", "Awas"], "en": ["Normal", "Watch", "Alert", "Danger"]}[b][e["level"]]
        ul = {1: 2, 2: 5, 3: 20}[e["level"]]
        judul = (f'🌊 River flood {lb.upper()} near {e["hd"]}' if en else f'🌊 Banjir sungai {lb.upper()} di sekitar {e["hd"]}')
        isi = (f'River discharge is forecast to exceed the {ul}-year flood level from {tgl(e["tanggal"])} (GloFAS, Copernicus). Secure boats and equipment; avoid crossing during strong currents.' if en else
               f'Debit sungai diprakirakan melewati ambang banjir {ul} tahunan mulai {tgl(e["tanggal"])} (GloFAS, Copernicus). Amankan perahu & peralatan; hindari menyeberang saat arus deras.')
        rinci = [(f'Peak {angka(float(p.get("med") or 0), b)} m³/s on {tgl(p["t"])} · 2-year level {angka(e["rp2"], b)} m³/s' if en else
                  f'Puncak {angka(float(p.get("med") or 0), b)} m³/s pada {tgl(p["t"])} · ambang 2 tahunan {angka(e["rp2"], b)} m³/s')] if p.get("t") else []
    elif e["jenis"] == "asap":
        b = "en" if en else "id"; x0 = e["sumber"][0]
        judul = (f'💨 Smoke may reach {e["hd"]}' if en else f'💨 Asap diperkirakan menuju {e["hd"]}')
        isi = ((f'Wind may carry smoke from {len(e["sumber"])} hotspot source(s) toward the village; the earliest in about {angka(x0["jam_tiba"], b)} hours. Reduce outdoor activity when smoky and use masks.') if en else
               (f'Angin diperkirakan membawa asap dari {len(e["sumber"])} sumber titik panas ke arah desa; tercepat ± {angka(x0["jam_tiba"], b)} jam lagi. Kurangi kegiatan di luar saat berasap dan gunakan masker.'))
        AR = {"utara": "north", "timur laut": "north-east", "timur": "east", "tenggara": "south-east", "selatan": "south", "barat daya": "south-west", "barat": "west", "barat laut": "north-west"}
        rinci = [(f'{x["jarak_km"]} km to the {AR.get(x["arah_dari_desa"], x["arah_dari_desa"])} · {x["n"]} hotspot(s) · arrival ~{x["tiba_wib"]} WIB' if en else
                  f'{angka(x["jarak_km"], b)} km arah {x["arah_dari_desa"]} · {x["n"]} titik · tiba ± {x["tiba_wib"]} WIB') for x in e["sumber"]]
    elif e["jenis"] == "hutan":
        b = "en" if en else "id"; di = e["luas_hd"] > 0
        judul = (f'🌳 New forest clearing indication near {e["hd"]}' if en else f'🌳 Indikasi pembukaan hutan baru di sekitar {e["hd"]}')
        isi = ((f'{angka(e["luas"], b)} ha in {e["petak"]} patch(es)' + (f', {angka(e["luas_hd"], b)} ha inside the village forest' if di else '') + ' (Sentinel-2 satellite imagery). Please verify in the field.') if en else
               (f'{angka(e["luas"], b)} ha dalam {e["petak"]} petak' + (f', {angka(e["luas_hd"], b)} ha di dalam Hutan Desa' if di else '') + ' (citra satelit Sentinel-2). Mohon cek lapangan.'))
        per = e.get("periode") or ["", ""]
        rinci = [(f'Imagery {tgl(per[0])} – {tgl(per[1])} compared with the same period a year earlier · {e.get("cerah")}% of the area cloud-free' if en else
                  f'Citra {tgl(per[0])} – {tgl(per[1])} dibanding periode yang sama tahun sebelumnya · {e.get("cerah")}% wilayah tampak cerah')] if per[0] else []
    else:
        kl = KELAS["en" if en else "id"][e["level"]]
        judul = (f'⚠️ Fire danger {kl.upper()} at {e["hd"]}' if en else f'⚠️ Bahaya kebakaran {kl.upper()} di {e["hd"]}')
        isi = (f'Forecast fire danger (FDRS, BMKG/ECMWF) reaches {kl} on {tgl(e["tanggal"])}. Avoid burning, prepare patrols and fire-fighting equipment.' if en else
               f'Prakiraan bahaya kebakaran (FDRS, BMKG/ECMWF) mencapai {kl} pada {tgl(e["tanggal"])}. Hindari membakar, siapkan patroli dan alat pemadam.')
        rinci = [f'{tgl(h["tanggal"])}: {KELAS["en" if en else "id"][h["level"]]} (FWI {angka(float(h["fwi"] or 0), "en" if en else "id")})' for h in e["hari"]]
    return judul, isi, rinci, url

def umpan(ev):   # umpan publik untuk notifikasi lokal aplikasi Android (tanpa data pribadi): 14 hari terakhir, maks. 100
    fp = os.path.join(OUT, "feed.json"); F = json.load(open(fp)) if os.path.exists(fp) else {"peringatan": []}
    ada = {e["kunci"] for e in F["peringatan"]}
    for e in ev:
        k = "|".join(e["kunci"]); 
        if k in ada: continue
        ji, ii, _, url = teks(e, "id"); je, ie, _, _ = teks(e, "en")
        F["peringatan"].append({"kunci": k, "situs": e["situs"], "jenis": e["jenis"], "waktu": NOW.strftime("%Y-%m-%dT%H:%MZ"), "url": url, "id": {"judul": ji, "isi": ii}, "en": {"judul": je, "isi": ie}})
    batas = (NOW - datetime.timedelta(days=14)).strftime("%Y-%m-%d")
    F["peringatan"] = [e for e in F["peringatan"] if e["waktu"] >= batas][-100:]; F["diperbarui_utc"] = NOW.strftime("%Y-%m-%dT%H:%MZ")
    json.dump(F, open(fp, "w"), ensure_ascii=False, separators=(",", ":"))

def main():
    if not KEY or not URL: print("ANALISIS_KEY/AKUN_URL belum diatur – lewati"); return
    sf = os.path.join(OUT, "terkirim.json")
    state = json.load(open(sf)) if os.path.exists(sf) else {}
    ev = kejadian(state)
    print(len(ev), "peringatan baru")
    umpan(ev)
    if not ev: return
    lg = get("langganan=1")
    if not lg.get("ok"): print("langganan tidak dapat dibaca:", lg); return
    vp, vk = lg.get("vapid_private"), lg.get("vapid_public")
    surat, mati, n_push = [], [], 0
    for e in ev:
        for u in lg.get("langganan", []):
            if e["situs"] not in (u.get("situs") or []): continue
            judul, isi, rinci, url = teks(e, u.get("bahasa", "id"))
            for ps in (u.get("push") or []):
                if not (vp and vk and ps.get("endpoint")): continue
                st = webpush.kirim(ps, {"title": judul, "body": isi, "url": url, "tag": e["kunci"][0]}, vp, vk)
                if st in (404, 410): mati.append({"id": u["id"], "endpoint": ps["endpoint"]})
                elif 200 <= st < 300: n_push += 1
            if u.get("email_on") and u.get("email"):
                surat.append({"id": u["id"], "email": u["email"], "nama": u.get("nama", ""), "bahasa": u.get("bahasa", "id"), "judul": judul, "isi": isi, "rinci": rinci, "url": url})
    try:   # email dikirim Apps Script; notifikasi HP sudah terkirim, jadi status tetap disimpan walau langkah ini gagal (cegah kiriman ganda)
        r = post({"kunci": "fh-prcf-2026-akun", "aksi": "pekerja_peringatan", "pekerja": KEY, "surat": surat, "push_mati": mati,
                  "log": [{"jenis": e["jenis"], "hd": e["hd"], "kunci": e["kunci"]} for e in ev], "push_terkirim": n_push})
    except Exception as x:
        r = {"ok": False, "galat": str(x)[:200]}
    print("push terkirim", n_push, "| email", len(surat), "|", r)
    for e in ev:
        for k in e["kunci"]: state[k] = NOW.strftime("%Y-%m-%dT%H:%MZ")
    batas = (NOW - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    state = {k: v for k, v in state.items() if v >= batas}
    json.dump(state, open(sf, "w"), indent=0, sort_keys=True)

if __name__ == "__main__":
    main()
