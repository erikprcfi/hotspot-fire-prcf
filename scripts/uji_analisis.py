"""
Uji mesin analisis SHP Pantau Rimbak tanpa menyentuh antrean produksi.
Menjalankan analisis_antrean.hitung() – fungsi yang SAMA dengan pekerja – untuk setiap GeoJSON di folder masukan,
memeriksa kelengkapan setiap bagian hasil, lalu menulis hasil + ringkasan.
Pemakaian: python scripts/uji_analisis.py <folder_geojson> <folder_hasil>
"""
import os, sys, json, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analisis_antrean import hitung

def isi(v):
    if v is None: return False
    if isinstance(v, (list, dict, str)): return len(v) > 0
    return True

def periksa(r):
    """Daftar bagian hasil yang wajib ada dan berisi (nama bagian, ada?)."""
    kunci = sorted(k for k in r.keys())
    cek = {}
    for k in ("geometri", "luas_geodesik_ha", "sumber", "kelas", "titik_panas", "wilayah", "lahan_kritis"):
        cek[k] = isi(r.get(k))
    # bagian raster (tutupan, perubahan hutan, karbon): nama kunci dari hitung_raster
    raster = [k for k in kunci if k not in ("nama", "jenis", "dibuat_utc", "sumber", "kelas", "tahun_tutupan", "geometri", "luas_geodesik_ha", "titik_panas", "wilayah", "lahan_kritis", "tutupan_2021", "lahan_kritis_indikasi")]
    cek["raster(" + ",".join(raster) + ")"] = bool(raster) and all(isi(r[k]) for k in raster)
    if "tutupan_2021" in r: cek["tutupan_2021"] = isi(r["tutupan_2021"])
    return cek

def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    baris = ["# Hasil uji mesin analisis SHP", "", "| SHP | Luas (ha) | Waktu (dtk) | Bagian lengkap | Catatan |", "|---|---:|---:|---|---|"]
    gagal = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith(".geojson"): continue
        nama = f[:-8]; t0 = time.time()
        try:
            g = json.load(open(os.path.join(src, f)))
            r = hitung(g, nama)
            r = json.loads(json.dumps(r, default=float))
            json.dump(r, open(os.path.join(dst, nama + ".json"), "w"), ensure_ascii=False)
            c = periksa(r); kurang = [k for k, v in c.items() if not v]
            if kurang: gagal += 1
            tp = r.get("titik_panas") or {}
            catat = f"titik panas: {tp.get('total', tp.get('jumlah', '?')) if isinstance(tp, dict) else '?'}; wilayah: {(r.get('wilayah') or {}).get('kabupaten', '') if isinstance(r.get('wilayah'), dict) else ''}"
            baris.append(f"| {nama} | {r.get('luas_geodesik_ha')} | {time.time()-t0:.0f} | {'✓ semua' if not kurang else '✗ kurang: ' + ', '.join(kurang)} | {catat} |")
            print(nama, "OK" if not kurang else "KURANG " + str(kurang), round(time.time() - t0), "dtk")
        except Exception as e:
            gagal += 1; traceback.print_exc()
            baris.append(f"| {nama} | – | {time.time()-t0:.0f} | ✗ galat | {str(e)[:150]} |")
    baris += ["", f"Gagal/kurang: {gagal}"]
    open(os.path.join(dst, "RINGKASAN.md"), "w").write("\n".join(baris) + "\n")
    print("\n".join(baris))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
