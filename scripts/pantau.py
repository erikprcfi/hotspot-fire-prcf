"""Pemantauan otomatis Fire Hotspot – Yayasan PRCF Indonesia.
Memeriksa situs langsung (GitHub Pages), kesegaran data NASA FIRMS / prakiraan / cuaca, server database pengguna (Apps Script)
dan file APK. Hasil ditulis ke laporan Markdown; kode keluar 1 bila ada masalah (workflow lalu membuka/memperbarui issue
"Pemantauan sistem" sehingga admin GitHub menerima email). Tidak memakai kunci rahasia apa pun.
"""
import json, sys, time, urllib.request, datetime as dt

SITUS = 'https://erikprcfi.github.io/hotspot-fire-prcf/'
SERVER = 'https://script.google.com/macros/s/AKfycbxlGnyedmPby29Fu_UFnJR_sW2GPQ-RuaV7LWcqfAU3X0VOrVvN4xahwLWH6nsTYiph/exec'
SEKARANG = dt.datetime.now(dt.timezone.utc)
HASIL = []

def ambil(url, n=3):
    galat = None
    for k in range(n):
        try:
            req = urllib.request.Request(url + ('&' if '?' in url else '?') + 'cek=' + str(int(time.time())), headers={'User-Agent': 'FireHotspot-Pemantau/1.0'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.read(), r.headers.get('Content-Type', '')
        except Exception as e:
            galat = e; time.sleep(10 * (k + 1))
    raise galat

def cek(nama, fungsi):
    try:
        ok, ket = fungsi()
    except Exception as e:
        ok, ket = False, f'gagal diakses: {e}'
    HASIL.append((ok, nama, ket)); print(('OK   ' if ok else 'GAGAL'), nama, '–', ket)

def umur_jam(iso):
    t = dt.datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return (SEKARANG - t).total_seconds() / 3600

def data_segar(path, kunci, maks_jam):
    def f():
        s, b, _ = ambil(SITUS + path); d = json.loads(b); j = umur_jam(d[kunci])
        return j <= maks_jam, f'diperbarui {d[kunci]} ({j:.1f} jam lalu; batas {maks_jam} jam)'
    return f

def halaman():
    s, b, _ = ambil(SITUS + 'app.html'); t = b.decode('utf-8', 'ignore')
    return s == 200 and 'Fire Hotspot' in t and 'assets/posisi.js' in t, f'HTTP {s}, {len(b)//1024} KB'

def versi_sw():
    s, b, _ = ambil(SITUS + 'sw.js'); hidup = b.decode().split("VERSI = '")[1].split("'")[0]
    lokal = open('sw.js', encoding='utf-8').read().split("VERSI = '")[1].split("'")[0]
    return hidup == lokal, f'situs {hidup}, repositori {lokal}'

def server():
    s, b, _ = ambil(SERVER); d = json.loads(b)
    return bool(d.get('ok')) and 'database pengguna' in d.get('layanan', ''), d.get('layanan', str(d))

def apk():
    s, b, ct = ambil(SITUS + 'unduh/FireHotspot-PRCF.apk', 2)
    return s == 200 and len(b) > 1_000_000 and b[:2] == b'PK', f'HTTP {s}, {len(b)/1e6:.1f} MB'

def kb():
    s, b, _ = ambil(SITUS + 'data/bara/kb.json'); d = json.loads(b)
    n, m = len(d.get('sumber', [])), len(d.get('potongan', []))
    return s == 200 and n >= 5 and m >= 500, f'{n} peraturan, {m} potongan pasal'

cek('Halaman aplikasi', halaman)
cek('Versi aplikasi di situs = repositori', versi_sw)
cek('Titik panas NASA FIRMS (lokasi dampingan)', data_segar('data/hotspots.json', 'diperbarui_utc', 9))
cek('Titik panas NASA FIRMS (se-Indonesia)', data_segar('data/titik_id/indeks.json', 'diperbarui_utc', 9))
cek('Prakiraan bahaya kebakaran & cuaca', data_segar('data/prakiraan.json', 'diperbarui_utc', 30))
cek('Riwayat cuaca ERA5', data_segar('data/cuaca.json', 'diunduh_utc', 50))
cek('Server database pengguna (Apps Script)', server)
cek('File APK Android', apk)
cek('Basis peraturan Bara Api', kb)

gagal = [h for h in HASIL if not h[0]]
waktu = SEKARANG.astimezone(dt.timezone(dt.timedelta(hours=7))).strftime('%d %b %Y %H:%M WIB')
with open('laporan_pantau.md', 'w', encoding='utf-8') as f:
    f.write(f'Hasil pemeriksaan otomatis {waktu}\n\n| | Bagian | Keterangan |\n|---|---|---|\n')
    for ok, n, k in HASIL: f.write(f"| {'✅' if ok else '❌'} | {n} | {k} |\n")
    if gagal:
        f.write('\nPetunjuk: lihat Buku Panduan Teknis Fire Hotspot, bab "Bila terjadi masalah". '
                'Issue ini ditutup otomatis setelah semua pemeriksaan kembali normal.\n')
sys.exit(1 if gagal else 0)
