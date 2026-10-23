"""
Elemen orbit (TLE) satelit pendeteksi titik panas NASA FIRMS – untuk menghitung lintasan satelit berikutnya di aplikasi.
Sumber: CelesTrak (celestrak.org, data GP dari U.S. Space Force / 18th Space Defense Squadron). Diperbarui tiap run GitHub Actions.
Keluaran: data/tle.json
"""
import json, os, sys, time, urllib.request, datetime
SAT = [  # nama, NORAD, sensor, lebar sapuan (km)
    ('Terra', 25994, 'MODIS', 2330), ('Aqua', 27424, 'MODIS', 2330),
    ('Suomi NPP', 37849, 'VIIRS', 3060), ('NOAA-20', 43013, 'VIIRS', 3060), ('NOAA-21', 54234, 'VIIRS', 3060)]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'tle.json')
res = []
for nm, nid, sen, sw in SAT:
    for k in range(3):
        try:
            req = urllib.request.Request(f'https://celestrak.org/NORAD/elements/gp.php?CATNR={nid}&FORMAT=TLE', headers={'User-Agent': 'FireHotspot-PRCF/1.0 (github.com/erikprcfi/hotspot-fire-prcf)'})
            t = urllib.request.urlopen(req, timeout=30).read().decode().strip().splitlines()
            l1 = next(x for x in t if x.startswith('1 ')); l2 = next(x for x in t if x.startswith('2 '))
            res.append({'nama': nm, 'norad': nid, 'sensor': sen, 'sapuan_km': sw, 'l1': l1.strip(), 'l2': l2.strip()}); break
        except Exception as e:
            print(nm, 'gagal', e); time.sleep(5)
if len(res) < 3:
    print('TLE kurang dari 3 satelit; file lama dipertahankan'); sys.exit(0)
json.dump({'diperbarui_utc': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), 'sumber': 'CelesTrak GP (celestrak.org), data 18th Space Defense Squadron', 'satelit': res}, open(OUT, 'w'), indent=1)
print('OK', [r['nama'] for r in res])
