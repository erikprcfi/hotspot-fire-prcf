"""
Angin 10 m seluruh Indonesia untuk animasi peta (Pantau Rimbak · Yayasan PRCF Indonesia)
======================================================================================
Sumber: ECMWF IFS 0,25° open data (European Centre for Medium-Range Weather Forecasts, CC BY 4.0), parameter 10u & 10v,
prakiraan run terbaru, langkah 0–48 jam per 3 jam. Diambil langsung dari portal resmi data.ecmwf.int (paket ecmwf-opendata).
Dipotong ke 88–150° BT, 18° LS–12° LU dan diambil tiap 0,5° (setiap titik ke-2 grid asli, tanpa interpolasi).
Disimpan ringkas: komponen u/v dibulatkan 0,25 m/s sebagai int8 (rentang ±31,75 m/s), base64 per langkah waktu.
Keluaran: data/angin/indonesia.json – dibaca assets/angin.js sehingga peta tidak perlu meminta ratusan titik ke Open-Meteo
(yang sering terkena batas 429 saat peta digeser).
"""
import os, sys, json, base64, datetime
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "angin", "indonesia.json")
W, E, S, N, STEP = 88.0, 150.0, -18.0, 12.0, 0.5
LANGKAH = list(range(0, 49, 3))
SKALA = 0.25

def main():
    from ecmwf.opendata import Client
    import eccodes
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "angin_uv.grib2")
    r = Client(source="ecmwf").retrieve(type="fc", step=LANGKAH, param=["10u", "10v"], target=tmp)
    run = r.datetime   # waktu analisis (UTC)
    lons = np.arange(W, E + 1e-9, STEP); lats = np.arange(S, N + 1e-9, STEP); nx, ny = len(lons), len(lats)
    U, V = {}, {}
    with open(tmp, "rb") as f:
        while True:
            h = eccodes.codes_grib_new_from_file(f)
            if h is None: break
            try:
                sn = eccodes.codes_get(h, "shortName"); st = int(eccodes.codes_get(h, "step"))
                Ni, Nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
                la0, lo0 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees"), eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees")
                di, dj = eccodes.codes_get(h, "iDirectionIncrementInDegrees"), eccodes.codes_get(h, "jDirectionIncrementInDegrees")
                a = eccodes.codes_get_values(h).reshape(Nj, Ni)   # baris utara → selatan
                ii = np.round(((lons - lo0) % 360) / di).astype(int) % Ni
                jj = np.round((la0 - lats) / dj).astype(int)
                sub = a[np.ix_(jj, ii)]                          # baris selatan → utara (sesuai assets/angin.js)
                (U if sn == "10u" else V)[st] = sub
            finally:
                eccodes.codes_release(h)
    steps = [s for s in LANGKAH if s in U and s in V]
    if len(steps) < 5: raise SystemExit(f"langkah tidak lengkap: {steps}")
    enc = lambda a: base64.b64encode(np.clip(np.round(a / SKALA), -127, 127).astype(np.int8).tobytes()).decode()
    t0 = run.replace(tzinfo=datetime.timezone.utc)
    out = {"sumber": "ECMWF IFS 0,25° open data (CC BY 4.0) – angin 10 m (10u, 10v), diambil tiap 0,5°",
           "run_utc": t0.strftime("%Y-%m-%dT%H:%MZ"), "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "w": W, "s": S, "step": STEP, "nx": nx, "ny": ny, "skala": SKALA,
           "waktu": [int((t0 + datetime.timedelta(hours=s)).timestamp() * 1000) for s in steps],
           "u": [enc(U[s]) for s in steps], "v": [enc(V[s]) for s in steps]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(OUT, os.path.getsize(OUT), "byte;", len(steps), "langkah; run", out["run_utc"], "; maks |u|", float(np.max(np.abs(U[steps[0]]))))

if __name__ == "__main__":
    main()
