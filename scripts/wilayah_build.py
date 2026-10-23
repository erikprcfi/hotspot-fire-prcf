"""
Basis data wilayah administrasi untuk deteksi lokasi (desa/kelurahan → kecamatan → kab/kota → provinsi)
=====================================================================================================
Geometri : OCHA COD-AB Indonesia (idn_admin_boundaries, sumber BPS/BIG, valid 2020), https://data.humdata.org/dataset/cod-ab-idn
Nama/kode: Kepmendagri No. 300.2.2-2430 Tahun 2025 (dataset github.com/cahyadsn/wilayah, MIT)
Nama desa/kec/kab dicocokkan ke kode Kemendagri; desa vs kelurahan dari kode Kemendagri (digit pertama: 1 = kelurahan, 2 = desa).
Keluaran: data/wilayah/indeks.json + data/wilayah/<kode_prov>.json (poligon disederhanakan ±30 m, koordinat delta x1e5)
Pemakaian: python scripts/wilayah_build.py <path idn_admin_boundaries.gdb> <path wilayah.sql>
"""
import sys, os, re, json, difflib, collections
import numpy as np
import pyogrio
from shapely.geometry import mapping
from shapely import simplify, make_valid

GDB, SQL = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'wilayah'); os.makedirs(OUT, exist_ok=True)
TOL = 0.0003

ROM = {'i': 'satu', 'ii': 'dua', 'iii': 'tiga', 'iv': 'empat', 'v': 'lima', 'vi': 'enam', 'vii': 'tujuh', 'viii': 'delapan', 'ix': 'sembilan', 'x': 'sepuluh',
       'xi': 'sebelas', 'xii': 'dua belas', 'xiii': 'tiga belas', 'xiv': 'empat belas', 'xv': 'lima belas', 'xvi': 'enam belas', 'xvii': 'tujuh belas', 'xviii': 'delapan belas', 'xix': 'sembilan belas', 'xx': 'dua puluh'}
DIG = {'1': 'satu', '2': 'dua', '3': 'tiga', '4': 'empat', '5': 'lima', '6': 'enam', '7': 'tujuh', '8': 'delapan', '9': 'sembilan', '10': 'sepuluh', '11': 'sebelas', '12': 'dua belas'}
def norm(s):
    s = (s or '').lower().replace('.', ' ').replace('-', ' ').replace("'", '').replace('`', '')
    s = re.sub(r'\b(desa|kelurahan|kel|kecamatan|kec|kabupaten|kab)\b', ' ', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    w = [ROM.get(t, DIG.get(t, t)) for t in s.split()]
    s = ' '.join(w)
    s = s.replace('sungai', 'sei').replace('sui ', 'sei ').replace('kampung', 'kp').replace('tanjong', 'tanjung')
    return re.sub(r'\s+', '', s)
def best(name, cands):  # cands: {code: name}
    n = norm(name); m = {c: norm(v) for c, v in cands.items()}
    ex = [c for c, v in m.items() if v == n]
    if ex: return ex[0], 1.0
    sc = sorted(((difflib.SequenceMatcher(None, n, v).ratio(), c) for c, v in m.items()), reverse=True)
    return (sc[0][1], sc[0][0]) if sc else (None, 0)

# --- Kemendagri ---
K = {}
for m in re.finditer(r"\('([0-9.]+)','((?:[^'\\]|\\.|'')*)'\)", open(SQL, encoding='utf-8').read()):
    K[m.group(1)] = m.group(2).replace("''", "'").replace("\\'", "'")
prov = {c: n for c, n in K.items() if len(c) == 2}
kab = {c: n for c, n in K.items() if len(c) == 5}
kec = {c: n for c, n in K.items() if len(c) == 8}
des = {c: n for c, n in K.items() if len(c) == 13}
child = collections.defaultdict(dict)
for d in (kab, kec, des):
    for c, n in d.items(): child[c.rsplit('.', 1)[0]][c] = n
print('Kemendagri:', len(prov), 'prov', len(kab), 'kab', len(kec), 'kec', len(des), 'desa/kel')

def tidy(s):  # nama COD-AB → rapi (cadangan bila tak cocok)
    s = re.sub(r'\.(?=\S)', ' ', s or '').strip()
    return ' '.join(w.upper() if re.fullmatch(r'[ivxIVX]+', w) and len(w) <= 4 and w.lower() in ROM else (w[:1].upper() + w[1:].lower() if w.isupper() or w.islower() else w) for w in s.split())

df = pyogrio.read_dataframe(GDB, layer='idn_admin4', columns=['adm4_name', 'adm4_pcode', 'adm3_name', 'adm3_pcode', 'adm2_name', 'adm2_pcode', 'adm1_name', 'adm1_pcode'])
print('COD-AB desa:', len(df))
stat = collections.Counter(); index = []
for p1, g in df.groupby('adm1_pcode'):
    pname = g.adm1_name.iloc[0]
    pc, ps = best(pname, prov)
    if norm(pname) == norm('DKI Jakarta'): pc, ps = '31', 1.0
    cand_prov = [pc] if ps >= .9 else []
    if 'papua' in norm(pname): cand_prov = [c for c, n in prov.items() if 'papua' in norm(n)]
    kabs_all = {c: n for c, n in kab.items() if c[:2] in cand_prov} or kab
    kabmap, kecmap = {}, {}
    out_kab, out_kec, rows = {}, {}, []
    for _, r in g.iterrows():
        k2 = r.adm2_pcode
        if k2 not in kabmap:
            nm = r.adm2_name; nm2 = nm if nm.lower().startswith('kota') else 'Kabupaten ' + nm
            c, s = best(nm2, kabs_all); kabmap[k2] = c if s >= .85 else None; stat['kab_ok' if kabmap[k2] else 'kab_x'] += 1
        kc = kabmap[k2]
        k3 = r.adm3_pcode
        if k3 not in kecmap:
            c, s = best(r.adm3_name, child[kc]) if kc else (None, 0); kecmap[k3] = c if s >= .8 else None; stat['kec_ok' if kecmap[k3] else 'kec_x'] += 1
        cc = kecmap[k3]
        dc, s = best(r.adm4_name, child[cc]) if cc else (None, 0)
        dc = dc if s >= .8 else None; stat['desa_ok' if dc else 'desa_x'] += 1
        kabkey = kc or ('x' + k2); keckey = cc or ('x' + k3)
        if kabkey not in out_kab:
            out_kab[kabkey] = [kab[kc] if kc else (r.adm2_name if r.adm2_name.lower().startswith('kota') else 'Kabupaten ' + r.adm2_name), prov[kc[:2]] if kc else (prov[cand_prov[0]] if len(cand_prov) == 1 else tidy(pname))]
        out_kec[keckey] = [kec[cc] if cc else tidy(r.adm3_name), kabkey]
        isKota = out_kab[kabkey][0].lower().startswith('kota')
        typ = (1 if dc.split('.')[-1].startswith('1') else 2) if dc else (1 if isKota else 0)
        name = des[dc] if dc else tidy(r.adm4_name)
        geom = make_valid(r.geometry)
        geom = simplify(geom, TOL, preserve_topology=True)
        polys = [geom] if geom.geom_type == 'Polygon' else [x for x in getattr(geom, 'geoms', []) if x.geom_type == 'Polygon']
        rings = []
        for P in polys:
            for ring in [P.exterior] + list(P.interiors):
                a = np.round(np.asarray(ring.coords)[:, :2] * 1e5).astype(np.int64)
                if len(a) < 4: continue
                d = np.vstack([a[:1], np.diff(a, axis=0)])
                rings.append(d.flatten().tolist())
        if not rings: continue
        b = geom.bounds
        rows.append([dc or '', name, keckey, typ, [round(b[0], 5), round(b[1], 5), round(b[2], 5), round(b[3], 5)], rings])
    prov_name = prov[cand_prov[0]] if len(cand_prov) == 1 else pname
    code = (cand_prov[0] if len(cand_prov) == 1 else p1.replace('ID', ''))
    fn = f'{code}.json'
    json.dump({'prov': prov_name, 'kab': out_kab, 'kec': out_kec, 'desa': rows}, open(os.path.join(OUT, fn), 'w'), separators=(',', ':'), ensure_ascii=False)
    gb = g.total_bounds
    index.append({'kode': code, 'nama': prov_name, 'file': fn, 'bbox': [round(x, 3) for x in gb], 'n': len(rows)})
    print(f'{prov_name:28s} {len(rows):6d} desa  {os.path.getsize(os.path.join(OUT, fn)) / 1e6:6.2f} MB')
json.dump({'sumber_geometri': 'OCHA COD-AB Indonesia (BPS/BIG, 2020) – data.humdata.org/dataset/cod-ab-idn',
           'sumber_nama': 'Kepmendagri No. 300.2.2-2430 Tahun 2025 (kode & nama wilayah)', 'toleransi_derajat': TOL, 'provinsi': index},
          open(os.path.join(OUT, 'indeks.json'), 'w'), indent=1, ensure_ascii=False)
print(dict(stat))
