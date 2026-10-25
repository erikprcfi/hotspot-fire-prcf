"""
Peringatan dini otomatis – Fire Hotspot PRCF (dijalankan GitHub Actions setelah data diperbarui, tiap 3 jam).
Pemicu (per Hutan Desa yang dipilih pengguna):
  1. Titik panas BARU NASA FIRMS di dalam desa/Hutan Desa atau <= 5 km dari batas desa, terdeteksi <= 36 jam terakhir.
  2. Bahaya kebakaran (FDRS, prakiraan BMKG/ECMWF) TINGGI atau EKSTREM dalam 3 hari ke depan.
Dikirim ke pengguna terverifikasi yang berlangganan: notifikasi HP (Web Push) dan/atau email (lewat Apps Script PRCF).
Setiap peringatan dicatat di data/peringatan/terkirim.json agar tidak terkirim dua kali. Nilai data tidak diubah.
Butuh env: ANALISIS_KEY, AKUN_URL.
"""
import os, sys, json, datetime, urllib.request
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
    return out

KONF = {"id": {"h": "tinggi", "n": "sedang (nominal)", "l": "rendah"}, "en": {"h": "high", "n": "nominal", "l": "low"}}
def konf(c, b):
    c = str(c).strip().lower()
    return KONF[b].get(c[:1], c) if c[:1] in "hnl" else f"{c}%"   # VIIRS: h/n/l, MODIS: 0–100 %
def tgl(d): return f'{d[8:10]}/{d[5:7]}/{d[:4]}'
def angka(x, b): return f"{x:.1f}".replace(".", ",") if b == "id" else f"{x:.1f}"
def teks(e, bhs):
    en = bhs == "en"; url = f'{APP}?lokasi={e["situs"]}'
    if e["jenis"] == "titik":
        n = len(e["titik"]); dek = min(x["jarak"] for x in e["titik"])
        b = "en" if en else "id"
        judul = (f'🔥 {n} new hotspot{"s" if n > 1 else ""} near {e["hd"]}' if en else f'🔥 {n} titik panas baru dekat {e["hd"]}')
        isi = (f'Nearest {angka(dek, b)} km from the village boundary (NASA FIRMS satellite detection). Check in the field and report via the app.' if en else
               f'Terdekat {angka(dek, b)} km dari batas desa (deteksi satelit NASA FIRMS). Mohon cek lapangan dan laporkan lewat aplikasi.')
        rinci = [(f'{x["waktu"]} WIB · {x["sat"]} · {angka(x["jarak"], b)} km · ' + ("confidence" if en else "keyakinan") + f' {konf(x["conf"], b)} · FRP {angka(float(x["frp"]), b)} MW · {x["lat"]:.5f}, {x["lon"]:.5f}') for x in e["titik"]]
    else:
        kl = KELAS["en" if en else "id"][e["level"]]
        judul = (f'⚠️ Fire danger {kl.upper()} at {e["hd"]}' if en else f'⚠️ Bahaya kebakaran {kl.upper()} di {e["hd"]}')
        isi = (f'Forecast fire danger (FDRS, BMKG/ECMWF) reaches {kl} on {tgl(e["tanggal"])}. Avoid burning, prepare patrols and fire-fighting equipment.' if en else
               f'Prakiraan bahaya kebakaran (FDRS, BMKG/ECMWF) mencapai {kl} pada {tgl(e["tanggal"])}. Hindari membakar, siapkan patroli dan alat pemadam.')
        rinci = [f'{tgl(h["tanggal"])}: {KELAS["en" if en else "id"][h["level"]]} (FWI {angka(float(h["fwi"] or 0), "en" if en else "id")})' for h in e["hari"]]
    return judul, isi, rinci, url

def main():
    if not KEY or not URL: print("ANALISIS_KEY/AKUN_URL belum diatur – lewati"); return
    sf = os.path.join(OUT, "terkirim.json")
    state = json.load(open(sf)) if os.path.exists(sf) else {}
    ev = kejadian(state)
    print(len(ev), "peringatan baru")
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
