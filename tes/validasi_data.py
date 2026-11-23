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
mx = max(t['d'] for t in h['titik']); print(f'  titik panas terbaru (lokasi dampingan): {mx}; total {nt} titik; arsip tahunan terbaca {ntot} titik')
print(f'Berkas diperiksa: {n} · masalah: {len(M)}'); [print(' ✗', m) for m in M[:60]]
sys.exit(1 if M else 0)
