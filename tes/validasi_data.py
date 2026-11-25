# Validasi menyeluruh data Pantau Rimbak: semua JSON terbaca, tanpa NaN/Infinity, koordinat titik panas di Indonesia,
# tanggal sah & tidak di masa depan, kunci unik, kesegaran data, konsistensi status vs hotspots.
import json, os, glob, math, datetime as dt, sys
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(R, 'data'); now = dt.datetime.now(dt.timezone.utc); M = []; n = 0
def err(m): M.append(m)
def chk_num(o, f, p=''):
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)): err(f'{f}: nilai NaN/Inf di {p}')
    elif isinstance(o, dict): [chk_num(v, f, p + '.' + str(k)) for k, v in o.items()]
    elif isinstance(o, list): [chk_num(v, f, p + f'[{i}]') for i, v in enumerate(o[:20000])]
def bad_const(s): raise ValueError('konstanta ' + s)
for f in sorted(glob.glob(D + '/**/*.json', recursive=True) + glob.glob(D + '/**/*.geojson', recursive=True)):
    n += 1; rel = os.path.relpath(f, R)
    try: o = json.load(open(f, encoding='utf-8'), parse_constant=bad_const)
    except Exception as e: err(f'{rel}: tidak terbaca – {e}'); continue
    if os.path.getsize(f) < 15: err(f'{rel}: kosong/terlalu kecil')
    if os.path.getsize(f) < 5_000_000: chk_num(o, rel)
def tgl(s): return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
def titik(lst, sumber):
    seen = set()
    for t in lst:
        la, lo = t.get('la'), t.get('lo')
        if not (isinstance(la, (int, float)) and -11.5 <= la <= 6.5 and 94 <= lo <= 141.5): err(f'{sumber}: koordinat di luar Indonesia {t.get("k")}')
        try:
            d = dt.date.fromisoformat(t['d'])
            if d > now.date() + dt.timedelta(days=1): err(f'{sumber}: tanggal masa depan {t["k"]}')
        except Exception: err(f'{sumber}: tanggal tidak sah {t.get("k")}')
        if t.get('k') in seen: err(f'{sumber}: kunci ganda {t.get("k")}')
        seen.add(t.get('k'))
        if 'frp' in t and t['frp'] is not None and t['frp'] < 0: err(f'{sumber}: FRP negatif {t["k"]}')
    return len(lst)
h = json.load(open(D + '/hotspots.json')); nt = titik(h['titik'], 'hotspots.json')
ntot = 0
for f in sorted(glob.glob(D + '/titik/*.json')):
    o = json.load(open(f)); l = o if isinstance(o, list) else o.get('titik', o.get('t', []))
    if isinstance(l, list) and l and isinstance(l[0], dict) and 'la' in l[0]: ntot += titik(l, os.path.relpath(f, R))
segar = [('hotspots.json', h['diperbarui_utc'], 9), ('status.json', json.load(open(D + '/status.json'))['terakhir_cek_utc'], 9),
         ('prakiraan.json', json.load(open(D + '/prakiraan.json'))['diperbarui_utc'], 30), ('cuaca.json', json.load(open(D + '/cuaca.json'))['diunduh_utc'], 50)]
for nm, t, jam in segar:
    u = (now - tgl(t)).total_seconds() / 3600
    print(f'  {nm:16} diperbarui {t} ({u:.1f} jam lalu, batas {jam})'); 
    if u > jam: err(f'{nm}: basi {u:.1f} jam')
# fitur 2.4: iklim, banjir, asap, arsip MODIS, vegetasi, rekap musim
SID = [x['id'] for x in json.load(open(D + '/geo.json'))['sites']]
def jj(r):
    try: return json.load(open(f'{D}/{r}'))
    except Exception as e: err(f'{r}: tidak terbaca ({e})'); return {}
ik = jj('iklim/indeks.json')
for sid in SID:
    L = (ik.get('lokasi') or {}).get(sid) or {}; S = L.get('siaga') or {}
    if S.get('level') not in (0, 1, 2, 3): err(f'iklim {sid}: level siaga tidak sah {S.get("level")}')
    elif sum(c['poin'] for c in S['komponen']) != S['skor'] or any(not 0 <= c['poin'] <= c['maks'] for c in S['komponen']): err(f'iklim {sid}: skor siaga tidak konsisten')
    if len(((L.get('musim_api') or {}).get('bulan') or [])) != 6: err(f'iklim {sid}: prakiraan musim api bukan 6 bulan')
    if not isinstance((L.get('hth') or {}).get('hari'), int): err(f'iklim {sid}: hari tanpa hujan kosong')
if ik.get('diperbarui_utc') and (now - tgl(ik['diperbarui_utc'])).total_seconds() > 30 * 3600: err('iklim/indeks.json: basi > 30 jam')
bj = jj('banjir/indeks.json')
for sid in SID:
    B = (bj.get('lokasi') or {}).get(sid)
    if not B: err(f'banjir {sid}: tidak ada'); continue
    g = B['sungai']
    if not (0 < g['rp2'] < g['rp5'] < g['rp20']): err(f'banjir {sid}: ambang periode ulang tidak berurutan')
    if len(B.get('hari') or []) < 40: err(f'banjir {sid}: deret prakiraan pendek')
if bj.get('diperbarui_utc') and (now - tgl(bj['diperbarui_utc'])).total_seconds() > 50 * 3600: err('banjir/indeks.json: basi > 50 jam')
asp = jj('asap/indeks.json')
for sid in SID:
    for x in ((asp.get('lokasi') or {}).get(sid) or {}).get('sumber', []):
        if not (-11.5 <= x['lat'] <= 6.5 and 94 <= x['lon'] <= 141.5) or len(x['lintasan']) < 2: err(f'asap {sid}: sumber/lintasan tidak sah')
bm = jj('bekas_modis/indeks.json')
for sid in SID:
    T = ((bm.get('lokasi') or {}).get(sid) or {}).get('tahun') or {}
    if len(T) < 20: err(f'bekas_modis {sid}: tahun {len(T)}')
    for y, v in T.items():
        if not (0 <= v['hd'] <= v['buf25'] + 1e-6 and v['buf5'] <= v['buf25'] + 1e-6): err(f'bekas_modis {sid} {y}: luas zona tidak konsisten')
vg = jj('vegetasi/indeks.json')
for sid in SID:
    t = ((vg.get('lokasi') or {}).get(sid) or {}).get('terkini') or {}
    if not (-0.2 <= (t.get('ndvi') or -9) <= 1 and -1 <= (t.get('nbr') or -9) <= 1): err(f'vegetasi {sid}: NDVI/NBR di luar rentang')
rk = jj('rekap_musim/indeks.json')
for sid in SID:
    for y, r in (((rk.get('lokasi') or {}).get(sid) or {}).get('musim') or {}).items():
        if r.get('berkas'):
            f = f'{D}/{r["berkas"]}'
            if not os.path.exists(f) or open(f, 'rb').read(4) != b'%PDF': err(f'rekap_musim {sid} {y}: PDF hilang/rusak')
print(f'  fitur 2.4: iklim {len(ik.get("lokasi") or {})}, banjir {len(bj.get("lokasi") or {})}, asap {len(asp.get("lokasi") or {})}, MODIS {len(bm.get("lokasi") or {})}, vegetasi {len(vg.get("lokasi") or {})}, rekap {len(rk.get("lokasi") or {})} lokasi')
mx = max(t['d'] for t in h['titik']); print(f'  titik panas terbaru (lokasi dampingan): {mx}; total {nt} titik; arsip tahunan terbaca {ntot} titik')
print(f'Berkas diperiksa: {n} · masalah: {len(M)}'); [print(' ✗', m) for m in M[:60]]
sys.exit(1 if M else 0)
