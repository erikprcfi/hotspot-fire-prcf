"""
Analisis lahan, hutan, karbon & titik panas untuk 6 Hutan Desa dampingan – Fire Hotspot PRCF
Memakai scripts/analisis_inti.py (cara hitung identik dengan analisis SHP unggahan pengguna, setara GFW/GNW).
Keluaran: data/analisis/<lokasi>_hd.json (Hutan Desa) dan data/analisis/<lokasi>_desa.json (wilayah desa) + data/analisis/indeks.json
Pemakaian: python scripts/karbon_lahan.py
"""
import os, sys, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analisis_inti import hitung_raster, hitung_titik_panas, wilayah, SUMBER, KELAS, TAHUN_LC
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "analisis"); os.makedirs(OUT, exist_ok=True)

def paket(nama, geom, jenis):
    r = {"nama": nama, "jenis": jenis, "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "sumber": SUMBER, "kelas": [{"kode": k, "nama": n, "warna": c} for k, n, _, c in KELAS], "tahun_tutupan": TAHUN_LC,
         "geometri": mapping(geom.simplify(0.0002, preserve_topology=True))}
    r.update(hitung_raster(geom)); r["titik_panas"] = hitung_titik_panas(geom); r["wilayah"] = wilayah(geom)
    return r

def main():
    geo = json.load(open(os.path.join(ROOT, "data", "geo.json"))); idx = []
    for s in geo["sites"]:
        hd = unary_union([shape(f["geometry"]) for f in s["hd"]["features"]]).buffer(0)
        ds = unary_union([shape(f["geometry"]) for f in s["desa"]["features"]]).buffer(0)
        for suf, nm, g in [("hd", s["hd_nama"], hd), ("desa", "Desa " + s["desa_nama"], ds)]:
            r = paket(nm, g, "Hutan Desa dampingan PRCF" if suf == "hd" else "Wilayah desa dampingan PRCF")
            json.dump(r, open(os.path.join(OUT, f"{s['id']}_{suf}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
            idx.append({"id": f"{s['id']}_{suf}", "nama": nm, "lokasi": s["id"], "luas_ha": r["luas_ha"]})
            print(s["id"], suf, r["luas_ha"], r["hutan"]["kehilangan_total_ha"], r["karbon"]["fluks_bersih_total_tCO2e"], r["titik_panas"]["total"])
    json.dump({"diperbarui_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "area": idx}, open(os.path.join(OUT, "indeks.json"), "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
