"""
Arsip titik panas NASA FIRMS seluruh Indonesia (2016–tahun lalu) dalam ubin 1° – bahan analisis wilayah SHP pengguna
===================================================================================================================

Sumber: arsip tahunan resmi NASA FIRMS per negara (Standard Processing), sensor yang sama dengan arsip Kapuas Hulu
Pantau Rimbak: VIIRS S-NPP, VIIRS NOAA-20, VIIRS NOAA-21 (375 m) dan MODIS Terra/Aqua (1 km).
  https://firms.modaps.eosdis.nasa.gov/data/country/<sensor>/<tahun>/<sensor>_<tahun>_Indonesia.csv

Keluaran (ringkas, tanpa data pengguna): satu berkas per ubin 1° "u<lat>_<lon>.npz" berisi array
  la (int32, lintang×1e5), lo (int32, bujur×1e5), hari (uint16, hari sejak 2000-01-01), jam (uint16, HHMM UTC), s (uint8 sensor), frp (float32)
dan "indeks.json" (jumlah per ubin/tahun, URL & SHA-256 tiap unduhan sebagai jejak audit).
Diunggah ke GitHub Release "arsip-titik-nasional" (publik, data NASA terbuka) oleh .github/workflows/arsip-nasional.yml.
"""
import os, sys, csv, io, json, hashlib, datetime, urllib.request, collections, array
import numpy as np

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country/"
SENSOR = [("viirs-snpp", 2012), ("viirs-jpss1", 2018), ("viirs-jpss2", 2024), ("modis", 2000)]
MULAI = int(os.environ.get("ARSIP_MULAI", "2016"))
AKHIR = int(os.environ.get("ARSIP_AKHIR", str(datetime.date.today().year - 1)))
OUT = sys.argv[1] if len(sys.argv) > 1 else "arsip_nasional"
EPOCH = datetime.date(2000, 1, 1)

def unduh(url):
    """Unduh berkas CSV dengan aliran; kembalikan (baris generator, sha256 objek) atau None bila 404."""
    r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hotspot-fire-prcf arsip nasional (PRCF Indonesia)"}), timeout=600)
    return r

def main():
    os.makedirs(OUT, exist_ok=True)
    ubin = collections.defaultdict(lambda: {"la": array.array("i"), "lo": array.array("i"), "hari": array.array("H"), "jam": array.array("H"), "s": array.array("B"), "frp": array.array("f")})   # hemat memori
    jejak = []
    for si, (sp, mulai) in enumerate(SENSOR):
        for y in range(max(MULAI, mulai), AKHIR + 1):
            url = f"{BASE}{sp}/{y}/{sp}_{y}_Indonesia.csv"
            try:
                r = unduh(url)
            except Exception as e:
                print(f"lewati {sp} {y}: {e}"); continue
            h = hashlib.sha256(); n = 0
            class Baca(io.RawIOBase):
                def readable(self): return True
                def readinto(self, b):
                    d = r.read(len(b))
                    if not d: return 0
                    h.update(d); b[:len(d)] = d; return len(d)
            rd = csv.DictReader(io.TextIOWrapper(io.BufferedReader(Baca(), 1 << 20), encoding="utf-8", errors="replace"))
            for row in rd:
                try:
                    la, lo = float(row["latitude"]), float(row["longitude"])
                    d = datetime.date.fromisoformat(row["acq_date"])
                    t = int(str(row.get("acq_time", "0")).strip() or 0)
                    if row.get("type") in ("1", "2", "3"): continue   # gunung api / sumber statis / lepas pantai
                    frp = float(row.get("frp") or 0)
                except Exception:
                    continue
                k = (int(np.floor(la)), int(np.floor(lo))); U = ubin[k]
                U["la"].append(int(round(la * 1e5))); U["lo"].append(int(round(lo * 1e5))); U["hari"].append((d - EPOCH).days)
                U["jam"].append(t); U["s"].append(si); U["frp"].append(frp); n += 1
            jejak.append({"url": url, "sensor": sp, "tahun": y, "baris": n, "sha256": h.hexdigest(), "diunduh_utc": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")})
            print(f"{sp} {y}: {n} titik")
    idx = {"sumber": "NASA FIRMS arsip tahunan per negara (Indonesia), Standard Processing", "sensor": [s for s, _ in SENSOR],
           "tahun": [MULAI, AKHIR], "epoch": "2000-01-01", "dibuat_utc": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "unduhan": jejak, "ubin": {}}
    for (a, b), U in ubin.items():
        nm = f"u{a}_{b}.npz"
        np.savez_compressed(os.path.join(OUT, nm), la=np.array(U["la"], "int32"), lo=np.array(U["lo"], "int32"), hari=np.array(U["hari"], "uint16"),
                            jam=np.array(U["jam"], "uint16"), s=np.array(U["s"], "uint8"), frp=np.array(U["frp"], "float32"))
        idx["ubin"][f"{a}_{b}"] = len(U["la"])
    json.dump(idx, open(os.path.join(OUT, "indeks.json"), "w"), indent=1)
    print("ubin:", len(ubin), "total titik:", sum(idx["ubin"].values()))

if __name__ == "__main__":
    main()
