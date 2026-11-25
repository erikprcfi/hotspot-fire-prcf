"""
Ringkasan mingguan Pantau Rimbak lewat email – tiap Senin pagi (WIB), sekali per pekan.
Penerima: akun yang mengaktifkan Peringatan dengan email (langganan yang sama dengan scripts/peringatan.py),
untuk Hutan Desa yang mereka pilih. Dikirim lewat jalur email peringatan yang sudah ada (Apps Script "pekerja_peringatan").
Isi per Hutan Desa: titik panas 7 hari (di dalam, <= 5 km, <= 25 km) dibanding 7 hari sebelumnya, bahaya api 7 hari ke depan,
hujan pekan depan, perubahan hutan terakhir, dan catatan musim api bulan ini.
Pemakaian: python scripts/ringkasan_mingguan.py            (hanya Senin 06.00–11.59 WIB, sekali per pekan)
           python scripts/ringkasan_mingguan.py --coba     (cetak isi, tidak mengirim)
"""
import os, sys, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import peringatan as PR

DATA = PR.DATA
NOW = datetime.datetime.now(datetime.timezone.utc); WIB = NOW + datetime.timedelta(hours=7)
KELAS = PR.KELAS
BLN = {"id": ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
       "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]}

def J(p, d=None):
    f = os.path.join(DATA, p)
    if not os.path.exists(f): return d
    with open(f, encoding="utf-8") as fh: return json.load(fh)

def hitung(sid, hs):
    """titik panas 7 hari terakhir & 7 hari sebelumnya (zona: dalam wilayah <= 0, <= 5 km, <= 25 km)"""
    if sid not in hs.get("lokasi", []): return None
    k = hs["lokasi"].index(sid); z = {"ini": [0, 0, 0], "lalu": [0, 0, 0]}
    for p in hs["titik"]:
        ls = p.get("ls") or []
        if len(ls) <= k or ls[k] is None or ls[k] > 25: continue
        t = datetime.datetime.strptime(p["d"] + str(p.get("t", "0000")).zfill(4), "%Y-%m-%d%H%M").replace(tzinfo=datetime.timezone.utc)
        umur = (NOW - t).total_seconds() / 86400
        b = "ini" if umur <= 7 else "lalu" if umur <= 14 else None
        if not b: continue
        z[b][2] += 1
        if ls[k] <= 5: z[b][1] += 1
        if ls[k] <= 0: z[b][0] += 1
    return z

def baris(s, bhs, hs, fc, hut, musim):
    en = bhs == "en"; b = "en" if en else "id"; sid = s["id"]; out = []
    z = hitung(sid, hs)
    if z:
        d = z["ini"][2] - z["lalu"][2]
        arah = (f"up {d} from" if d > 0 else f"down {-d} from" if d < 0 else "same as") if en else (f"naik {d} dari" if d > 0 else f"turun {-d} dari" if d < 0 else "sama dengan")
        out.append((f'Hotspots last 7 days: {z["ini"][2]} within 25 km ({arah} the previous week), {z["ini"][1]} within 5 km, {z["ini"][0]} inside the area.' if en else
                    f'Titik panas 7 hari terakhir: {z["ini"][2]} dalam 25 km ({arah} pekan sebelumnya), {z["ini"][1]} dalam 5 km, {z["ini"][0]} di dalam wilayah.'))
    hari = (((fc.get("lokasi") or {}).get(sid) or {}).get("hari") or [])[:7]
    if hari:
        lv = [h.get("level") for h in hari if isinstance(h.get("level"), int)]
        top = max(lv) if lv else None
        tinggi = [PR.tgl(h["tanggal"]) for h in hari if isinstance(h.get("level"), int) and h["level"] >= 2]
        out.append((f'Fire danger next 7 days: highest {KELAS["en"][top]}' + (f' (High/Extreme on {", ".join(tinggi)})' if tinggi else '') + '.' if en else
                    f'Bahaya api 7 hari ke depan: tertinggi {KELAS["id"][top]}' + (f' (Tinggi/Ekstrem pada {", ".join(tinggi)})' if tinggi else '') + '.') if top is not None else "")
        hj = [h.get("hujan") for h in hari if isinstance(h.get("hujan"), (int, float))]
        lebat = [PR.tgl(h["tanggal"]) for h in hari if isinstance(h.get("hujan"), (int, float)) and h["hujan"] >= 50]
        if hj: out.append((f'Rain next 7 days: {PR.angka(sum(hj), b)} mm in total' + (f'; heavy rain (≥50 mm) on {", ".join(lebat)} – watch for floods.' if lebat else '.') if en else
                           f'Hujan 7 hari ke depan: total {PR.angka(sum(hj), b)} mm' + (f'; hujan lebat (≥50 mm) pada {", ".join(lebat)} – waspada banjir.' if lebat else '.')))
    h = hut.get(sid) or {}
    if h.get("status") == "selesai":
        nb = h.get("luas_baru_ha") or 0
        out.append((f'Forest change (Sentinel-2, checked {PR.tgl(h["dicek_utc"][:10])}): ' + (f'{PR.angka(nb, b)} ha of NEW clearing indications – please verify in the field.' if nb >= 1 else 'no new clearing ≥ 1 ha.') if en else
                    f'Perubahan hutan (Sentinel-2, dicek {PR.tgl(h["dicek_utc"][:10])}): ' + (f'{PR.angka(nb, b)} ha indikasi bukaan BARU – mohon cek lapangan.' if nb >= 1 else 'tidak ada bukaan baru ≥ 1 ha.')))
    M = (musim.get("lokasi") or {}).get(sid)
    if M:
        m = WIB.month; bl = M["bulan"][m - 1]; nm = BLN[b][m - 1]
        if m in M.get("musim", []):
            out.append((f'{nm} is fire season here (on average {PR.angka(bl["rata25"], b)} detections within 25 km; peak {BLN[b][M["puncak"] - 1]}).' if en else
                        f'{nm} termasuk musim api di sini (rata-rata {PR.angka(bl["rata25"], b)} deteksi dalam 25 km; puncak {BLN[b][M["puncak"] - 1]}).'))
        elif M.get("mulai_bersiap") == m:
            out.append((f'Fire season starts next month – prepare patrols and equipment this month.' if en else
                        f'Musim api dimulai bulan depan – siapkan patroli dan peralatan bulan ini.'))
    return [x for x in out if x]

def susun(u, sites, hs, fc, hut, musim):
    bhs = u.get("bahasa", "id"); en = bhs == "en"
    pilih = [s for s in sites if s["id"] in (u.get("situs") or [])]
    if not pilih: return None
    rinci = []
    for s in pilih:
        rinci.append(("■ " + s["hd_nama"]))
        rinci += ["   " + x for x in baris(s, bhs, hs, fc, hut, musim)]
    judul = (f'📋 Pantau Rimbak weekly summary – {PR.tgl(WIB.strftime("%Y-%m-%d"))}' if en else f'📋 Ringkasan mingguan Pantau Rimbak – {PR.tgl(WIB.strftime("%Y-%m-%d"))}')
    isi = (f'Summary for {len(pilih)} village forest(s): hotspots (NASA FIRMS), fire danger & rain forecast (BMKG/ECMWF), forest change (Sentinel-2).' if en else
           f'Ringkasan untuk {len(pilih)} Hutan Desa: titik panas (NASA FIRMS), prakiraan bahaya api & hujan (BMKG/ECMWF), perubahan hutan (Sentinel-2).')
    return {"id": u["id"], "email": u["email"], "nama": u.get("nama", ""), "bahasa": bhs, "judul": judul, "isi": isi, "rinci": rinci,
            "url": PR.APP + (f'?lokasi={pilih[0]["id"]}' if len(pilih) == 1 else '')}

def main():
    coba = "--coba" in sys.argv
    pekan = WIB.strftime("%G-W%V"); sf = os.path.join(PR.OUT, "mingguan.json")
    st = J(os.path.relpath(sf, DATA), {}) or {}
    if not coba:
        if WIB.weekday() != 0 or not (6 <= WIB.hour < 12): print("bukan Senin pagi WIB – lewati"); return
        if st.get("pekan") == pekan: print("ringkasan pekan ini sudah terkirim"); return
        if not PR.KEY or not PR.URL: print("ANALISIS_KEY/AKUN_URL belum diatur – lewati"); return
    sites = J("geo.json")["sites"]; hs = J("hotspots.json", {"lokasi": [], "titik": []}); fc = J("prakiraan.json", {"lokasi": {}})
    hut = (J("hutan/peringatan.json", {}) or {}).get("lokasi") or {}; musim = J("musim/indeks.json", {}) or {}
    if coba:
        for bhs in ("id", "en"):
            sr = susun({"id": "uji", "email": "uji@contoh.org", "bahasa": bhs, "situs": [s["id"] for s in sites[:2]]}, sites, hs, fc, hut, musim)
            print(sr["judul"]); print(sr["isi"]); print("\n".join(sr["rinci"])); print()
        return
    lg = PR.get("langganan=1")
    if not lg.get("ok"): print("langganan tidak dapat dibaca:", lg); return
    surat = [x for x in (susun(u, sites, hs, fc, hut, musim) for u in lg.get("langganan", []) if u.get("email_on") and u.get("email")) if x]
    r = {"ok": True}
    if surat:
        try:
            r = PR.post({"kunci": "fh-prcf-2026-akun", "aksi": "pekerja_peringatan", "pekerja": PR.KEY, "surat": surat, "push_mati": [],
                         "log": [{"jenis": "mingguan", "hd": "semua", "kunci": [f"mingguan|{pekan}"]}], "push_terkirim": 0})
        except Exception as x:
            r = {"ok": False, "galat": str(x)[:200]}
    print("ringkasan mingguan:", len(surat), "email |", r)
    if r.get("ok", True):
        with open(sf, "w", encoding="utf-8") as f: json.dump({"pekan": pekan, "terkirim_utc": NOW.strftime("%Y-%m-%dT%H:%MZ"), "jumlah": len(surat)}, f)

if __name__ == "__main__":
    main()
