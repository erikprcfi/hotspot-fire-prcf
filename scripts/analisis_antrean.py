"""
Pekerja antrean ANALISIS SHP – Fire Hotspot PRCF (dijalankan GitHub Actions tiap ±5 menit)
Mengambil SHP (GeoJSON WGS84) yang diunggah pengguna terverifikasi dari Google Apps Script PRCF, menghitungnya dengan
scripts/analisis_inti.py (cara yang sama dengan 6 Hutan Desa), lalu mengirim hasil kembali (privat, hanya pemilik).
Butuh env: ANALISIS_KEY (kunci pekerja dari Apps Script), AKUN_URL (URL aplikasi web Apps Script database pengguna).
"""
import os, sys, json, datetime, urllib.request, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analisis_inti import hitung_raster, hitung_titik_panas, wilayah, SUMBER, KELAS, TAHUN_LC
from shapely.geometry import shape, mapping
from shapely.validation import make_valid
from pyproj import Geod

KEY, URL = os.environ.get("ANALISIS_KEY", ""), os.environ.get("AKUN_URL", "")
def post(o):
    req = urllib.request.Request(URL, data=json.dumps(o).encode(), headers={"Content-Type": "text/plain;charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())

def main():
    if not KEY or not URL: print("ANALISIS_KEY/AKUN_URL belum diatur – lewati"); return
    q = json.loads(urllib.request.urlopen(f"{URL}?pekerja={KEY}", timeout=120).read())
    if not q.get("ok"): print("antrean ditolak:", q); return
    for t in q.get("tugas", []):
        aid = t["aid"]; print("analisis", aid, t.get("nama"))
        try:
            g = make_valid(shape(t["geojson"])); g = g if g.geom_type in ("Polygon", "MultiPolygon") else g.buffer(0)
            if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"): raise ValueError("geometri bukan poligon yang sah")
            luas_geo = abs(Geod(ellps="WGS84").geometry_area_perimeter(g)[0]) / 1e4
            if luas_geo > 260000: raise ValueError(f"luas {luas_geo:.0f} ha melebihi batas 250.000 ha")
            x0, y0, x1, y1 = g.bounds
            if x0 < 94 or x1 > 142 or y0 < -12 or y1 > 7: raise ValueError("area harus berada di wilayah Indonesia")
            r = {"nama": t.get("nama") or "Area unggahan", "jenis": "SHP unggahan pengguna", "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "sumber": SUMBER, "kelas": [{"kode": k, "nama": n, "warna": c} for k, n, _, c in KELAS], "tahun_tutupan": TAHUN_LC,
                 "geometri": mapping(g.simplify(0.0002, preserve_topology=True)), "luas_geodesik_ha": round(luas_geo, 1)}
            r.update(hitung_raster(g)); r["titik_panas"] = hitung_titik_panas(g, cache=os.environ.get("FIRMS_CACHE", "/tmp/firms_cache")); r["wilayah"] = wilayah(g)
            print(post({"aksi": "pekerja_hasil", "kunci": "fh-prcf-2026-akun", "kunci_pekerja": KEY, "aid": aid, "hasil": json.loads(json.dumps(r, default=float))}))
        except Exception as e:
            traceback.print_exc()
            print(post({"aksi": "pekerja_hasil", "kunci": "fh-prcf-2026-akun", "kunci_pekerja": KEY, "aid": aid, "galat": str(e)[:280]}))

if __name__ == "__main__":
    main()
