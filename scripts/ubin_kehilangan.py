"""Lapisan peta "Kehilangan tutupan pohon 2001–2025" milik Fire Hotspot sendiri (ubin XYZ PNG), dibuat dari raster ASLI
Hansen/UMD Global Forest Change v1.13 (University of Maryland · Google · USGS · NASA; CC BY 4.0), diunduh dari server resmi
penerbit (storage.googleapis.com/earthenginepartners-hansen). Tidak bergantung pada server peta pihak lain.

Aturan (sama dengan analisis hutan di aplikasi, data/hutan/kehilangan.json):
  * piksel hutan = tutupan tajuk tahun 2000 >= 30 % (treecover2000);
  * kehilangan = nilai lossyear 1–25 (tahun 2001–2025) pada piksel hutan tersebut.
Cakupan: Kabupaten Kapuas Hulu (kotak batas BIG + 0,05°). Zoom 6–12 (zoom 12 ≈ resolusi asli 30 m; lebih dekat diperbesar).
Pada zoom jauh satu piksel peta mewakili banyak piksel 30 m: warna = tahun kehilangan TERBARU di dalamnya, ketebalan (alfa) =
PROPORSI luas yang hilang (≥ 50 % → warna penuh), sehingga luasan tidak tampak berlebihan. Warna: kuning-oranye (2001) → merah tua (2025).
Keluaran: data/ubin/kehilangan/{z}/{x}/{y}.png + data/ubin/kehilangan/meta.json
"""
import os, sys, json, math, hashlib, datetime
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'ubin', 'kehilangan')
VER = 'GFC-2025-v1.13'
URL = f'https://storage.googleapis.com/earthenginepartners-hansen/{VER}/Hansen_{VER}_{{}}_10N_110E.tif'
W, S, E, N = 111.48, 0.03, 114.28, 1.64      # Kapuas Hulu 111.531–114.223 BT, 0.079–1.585 LU (+0,05°)
ZMIN, ZMAX, AMBANG = 6, 12, 30

def baca(lapis):
    with rasterio.open('/vsicurl/' + URL.format(lapis)) as ds:
        win = from_bounds(W, S, E, N, ds.transform).round_offsets().round_lengths()
        a = ds.read(1, window=win); tr = ds.window_transform(win)
    return a, tr

def warna():
    """Palet 26 warna: 0 transparan; 1..25 = 2001..2025 (kuning-oranye → merah tua)."""
    stops = [(1, (255, 214, 102)), (8, (247, 127, 0)), (16, (214, 40, 40)), (25, (106, 4, 15))]
    pal = [(0, 0, 0)]
    for y in range(1, 26):
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= y <= b:
                t = (y - a) / (b - a); pal.append(tuple(round(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))); break
    return pal

def lon2x(lon, z): return (lon + 180) / 360 * 2 ** z
def lat2y(lat, z): r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z
def x2lon(x, z): return x / 2 ** z * 360 - 180
def y2lat(y, z): n = math.pi - 2 * math.pi * y / 2 ** z; return math.degrees(math.atan(math.sinh(n)))

def main():
    ly, tr = baca('lossyear'); tc, tr2 = baca('treecover2000')
    assert ly.shape == tc.shape and tr == tr2, 'jendela raster tidak sejajar'
    L = np.where(tc >= AMBANG, ly, 0).astype(np.uint8)      # tahun kehilangan pada piksel hutan
    L[L > 25] = 0
    rows, cols = L.shape; x0, dx, y0, dy = tr.c, tr.a, tr.f, tr.e
    pal = warna(); flat = [c for rgb in pal for c in rgb] + [0] * (768 - 3 * len(pal))
    alpha = bytes([0] + [235] * 25)
    kosong = None; n_isi = n_kosong = 0
    for z in range(ZMIN, ZMAX + 1):
        tx0, tx1 = int(lon2x(W, z)), int(lon2x(E, z)); ty0, ty1 = int(lat2y(N, z)), int(lat2y(S, z))
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                # tepi tiap piksel peta (256) dalam derajat → indeks piksel sumber
                lons = np.array([x2lon(tx + i / 256, z) for i in range(257)])
                lats = np.array([y2lat(ty + j / 256, z) for j in range(257)])
                ce = np.clip(np.round((lons - x0) / dx).astype(int), 0, cols)
                re_ = np.clip(np.round((lats - y0) / dy).astype(int), 0, rows)
                img = np.zeros((256, 256), np.uint8); frac = np.zeros((256, 256), np.float32)
                okc = ce[1:] > ce[:-1]; okr = re_[1:] > re_[:-1]
                if okc.any() and okr.any():
                    c0, c1 = ce[:-1][okc], ce[1:][okc]; r0, r1 = re_[:-1][okr], re_[1:][okr]
                    blok = L[r0.min():r1.max(), c0.min():c1.max()]
                    if blok.size and blok.any():
                        a1 = np.maximum.reduceat(blok, r0 - r0.min(), axis=0)          # baris
                        a2 = np.maximum.reduceat(a1, c0 - c0.min(), axis=1)            # kolom
                        b1 = np.add.reduceat((blok > 0).astype(np.int32), r0 - r0.min(), axis=0)
                        b2 = np.add.reduceat(b1, c0 - c0.min(), axis=1)
                        nn = np.outer(r1 - r0, c1 - c0)
                        ix = np.ix_(np.where(okr)[0], np.where(okc)[0]); img[ix] = a2; frac[ix] = b2 / np.maximum(nn, 1)
                d = os.path.join(OUT, str(z), str(tx)); os.makedirs(d, exist_ok=True)
                p = os.path.join(d, f'{ty}.png')
                if not img.any():
                    if kosong is None:
                        im = Image.new('P', (1, 1), 0); im.putpalette(flat); im.info['transparency'] = 0
                        import io; b = io.BytesIO(); im.resize((256, 256)).save(b, 'PNG', transparency=0, optimize=True); kosong = b.getvalue()
                    open(p, 'wb').write(kosong); n_kosong += 1; continue
                rgb = np.array(pal, np.uint8)[img]
                a = np.where(img > 0, np.clip(np.round(235 * np.minimum(1, frac / .5)), 60, 235), 0).astype(np.uint8)
                Image.fromarray(np.dstack([rgb, a]), 'RGBA').quantize(64, method=Image.Quantize.FASTOCTREE).save(p, 'PNG', optimize=True); n_isi += 1
    # ringkasan & jejak audit
    lat_c = y0 + dy * (np.arange(rows) + .5)
    luas_px = (6371008.8 * math.radians(abs(dy))) * (6371008.8 * math.radians(dx) * np.cos(np.radians(lat_c))) / 1e4   # ha per piksel tiap baris
    per_tahun = {str(2000 + y): round(float(((L == y) * luas_px[:, None]).sum()), 1) for y in range(1, 26)}
    meta = {'sumber': f'Hansen/UMD/Google/USGS/NASA Global Forest Change {VER} (Hansen dkk. 2013, Science 342:850–853), CC BY 4.0',
            'unduhan': [URL.format('lossyear'), URL.format('treecover2000')], 'ambang_tutupan_2000_persen': AMBANG,
            'cakupan_bbox': [W, S, E, N], 'zoom': [ZMIN, ZMAX], 'warna': {'2001': '#%02x%02x%02x' % pal[1], '2013': '#%02x%02x%02x' % pal[13], '2025': '#%02x%02x%02x' % pal[25]},
            'kehilangan_per_tahun_ha_kotak': per_tahun, 'kehilangan_total_ha_kotak': round(sum(per_tahun.values()), 1),
            'sha256_jendela': {'lossyear': hashlib.sha256(ly.tobytes()).hexdigest(), 'treecover2000': hashlib.sha256(tc.tobytes()).hexdigest()},
            'ubin_berisi': n_isi, 'ubin_kosong': n_kosong, 'dibuat_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')}
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: meta[k] for k in ('kehilangan_total_ha_kotak', 'ubin_berisi', 'ubin_kosong')}))
    return L, tr

if __name__ == '__main__':
    main()
