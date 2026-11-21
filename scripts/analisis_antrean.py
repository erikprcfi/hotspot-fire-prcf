"""
Pekerja antrean ANALISIS SHP – Pantau Rimbak PRCF (dijalankan GitHub Actions tiap ±5 menit)
Mengambil SHP (GeoJSON WGS84) yang diunggah pengguna terverifikasi dari Google Apps Script PRCF, menghitungnya dengan
scripts/analisis_inti.py (cara yang sama dengan 6 Hutan Desa), lalu mengirim hasil kembali (privat, hanya pemilik).
Butuh env: ANALISIS_KEY (kunci pekerja dari Apps Script), AKUN_URL (URL aplikasi web Apps Script database pengguna).
"""
import os, sys, json, datetime, urllib.request, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lahan_kritis as LK
import terbuka_nasional as TN
from analisis_inti import hitung_raster, hitung_titik_panas, wilayah, muat_klhk, SUMBER, KELAS, TAHUN_LC
from shapely.geometry import shape, mapping
from shapely.validation import make_valid
from shapely.ops import unary_union
from pyproj import Geod

KEY, URL = os.environ.get("ANALISIS_KEY", ""), os.environ.get("AKUN_URL", "")
def post(o):
    req = urllib.request.Request(URL, data=json.dumps(o).encode(), headers={"Content-Type": "text/plain;charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())

def terbuka(g, lk_resmi):   # data terbuka nasional: tutupan 2021 (ESA WorldCover 10 m) + indikasi lahan kritis bila peta resmi tidak menjangkau
    out = {}
    try: out["tutupan_2021"] = TN.tutupan_worldcover(g)
    except Exception as e: print("  WorldCover gagal:", e)
    if not lk_resmi:
        try: out["lahan_kritis_indikasi"] = TN.indikasi_lahan_kritis(g)
        except Exception as e: print("  indikasi lahan kritis gagal:", e)
    return out

def gabung_poligon(geojson):
    """GeoJSON (Multi)Polygon → satu geometri sah. Poligon yang berbagi tepi/bertumpuk (grid, kelas tutupan lahan) digabung
    per bagian lalu di-union, sehingga tidak ada bagian yang terbuang oleh perbaikan geometri (make_valid pada MultiPolygon
    berisi poligon bersentuhan menghasilkan GeometryCollection, dan buffer(0) atas koleksi itu kehilangan sebagian luas)."""
    g0 = shape(geojson)
    bagian = list(g0.geoms) if hasattr(g0, "geoms") else [g0]
    poli = []
    for b in bagian:
        v = make_valid(b)
        if v.geom_type in ("Polygon", "MultiPolygon"): poli.append(v)
        elif hasattr(v, "geoms"): poli += [x for x in v.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
    if not poli: raise ValueError("geometri bukan poligon yang sah")
    g = unary_union(poli)
    return g if g.geom_type in ("Polygon", "MultiPolygon") else make_valid(g).buffer(0)

def hitung(geojson, nama=None):
    """Hitung semua analisis untuk satu poligon (dipakai pekerja antrean & uji)."""
    g = gabung_poligon(geojson)
    if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"): raise ValueError("geometri bukan poligon yang sah")
    luas_geo = abs(Geod(ellps="WGS84").geometry_area_perimeter(g)[0]) / 1e4
    if luas_geo > 260000: raise ValueError(f"luas {luas_geo:.0f} ha melebihi batas 250.000 ha")
    x0, y0, x1, y1 = g.bounds
    if x0 < 94 or x1 > 142 or y0 < -12 or y1 > 7: raise ValueError("area harus berada di wilayah Indonesia")
    r = {"nama": nama or "Area unggahan", "jenis": "SHP unggahan pengguna", "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "sumber": SUMBER, "kelas": [{"kode": k, "nama": n, "warna": c} for k, n, _, c in KELAS], "tahun_tutupan": TAHUN_LC,
         "geometri": mapping(g.simplify(0.0002, preserve_topology=True)), "luas_geodesik_ha": round(luas_geo, 1)}
    kd = muat_klhk(bbox=g.bounds); r.update(hitung_raster(g, kd)); r["lahan_kritis"] = LK.untuk_area(g, kd); r.update(terbuka(g, r["lahan_kritis"])); r["sumber"] = dict(r["sumber"], **{k: v["sumber"] for k, v in (("tutupan_2021", r.get("tutupan_2021")), ("lahan_kritis_indikasi", r.get("lahan_kritis_indikasi"))) if v}); r["titik_panas"] = hitung_titik_panas(g, cache=os.environ.get("FIRMS_CACHE", "/tmp/firms_cache")); r["wilayah"] = wilayah(g)
    return r

def main():
    if not KEY or not URL: print("ANALISIS_KEY/AKUN_URL belum diatur – lewati"); return
    q = json.loads(urllib.request.urlopen(f"{URL}?pekerja={KEY}", timeout=120).read())
    if not q.get("ok"): print("antrean ditolak:", q); return
    for t in q.get("tugas", []):
        aid = t["aid"]; print("analisis", aid, t.get("nama"))
        try:
            r = hitung(t["geojson"], t.get("nama"))
            print(post({"aksi": "pekerja_hasil", "kunci": "fh-prcf-2026-akun", "kunci_pekerja": KEY, "aid": aid, "hasil": json.loads(json.dumps(r, default=float))}))
        except Exception as e:
            traceback.print_exc()
            print(post({"aksi": "pekerja_hasil", "kunci": "fh-prcf-2026-akun", "kunci_pekerja": KEY, "aid": aid, "galat": str(e)[:280]}))

if __name__ == "__main__":
    main()
