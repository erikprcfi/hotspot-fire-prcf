"""Uji analisis SHP di luar Kalbar (Bengkulu, Papua, Aceh) – dijalankan GitHub Actions (uji-nasional.yml); hasil → uji/hasil_nasional.json"""
import os, sys, json, time, datetime, traceback
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import lahan_kritis as LK, tutupan_klhk as TK
from analisis_inti import hitung_raster, hitung_titik_panas, wilayah, muat_klhk
from shapely.geometry import box
UJI = {"Bengkulu (Seluma)": box(102.55, -4.05, 102.60, -4.00), "Papua (Merauke)": box(140.30, -8.20, 140.35, -8.15), "Aceh (Aceh Barat)": box(96.05, 4.30, 96.10, 4.35)}
out = {"dijalankan_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "firms_key": None, "hasil": {}}
from analisis_inti import _firms_key
out["firms_key"] = bool(_firms_key())
t = time.time()
try: out["layanan_klhk"] = TK.cari_layanan()
except Exception as e: out["layanan_klhk"] = f"galat: {e}"
out["detik_layanan"] = round(time.time() - t)
for nm, g in UJI.items():
    t = time.time(); r = {}
    try:
        kd = muat_klhk(bbox=g.bounds); r["klhk_tahun"] = sorted(kd) if kd else []
        h = hitung_raster(g, kd); r["kunci"] = sorted(h); r["ringkas"] = {k: h[k] for k in h if k in ("luas_ha", "tutupan_terbaru", "kehilangan_tutupan", "sumber_tutupan", "catatan_tutupan")}
        r["lahan_kritis"] = LK.untuk_area(g, kd)
        tp = hitung_titik_panas(g, cache=os.environ.get("FIRMS_CACHE", "/tmp/firms_cache")); r["titik_panas"] = {k: tp[k] for k in ("periode", "per_tahun", "total", "arsip_dipakai", "per_bulan")}
        r["wilayah"] = wilayah(g)
    except Exception: r["galat"] = traceback.format_exc()[-1500:]
    r["detik"] = round(time.time() - t); out["hasil"][nm] = r; print(nm, r.get("detik"), "galat" in r)
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil_nasional.json"), "w"), ensure_ascii=False, indent=1, default=str)
