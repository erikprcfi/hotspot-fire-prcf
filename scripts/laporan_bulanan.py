"""
Laporan bulanan otomatis per Hutan Desa – Pantau Rimbak (Yayasan PRCF Indonesia)
================================================================================
Untuk setiap Hutan Desa dampingan dan setiap bulan yang SUDAH LEWAT, membuat satu PDF berisi:
  * titik panas NASA FIRMS (VIIRS & MODIS) di dalam Hutan Desa, di desa, <= 5 km dan <= 25 km,
    dibanding bulan sebelumnya, bulan yang sama tahun lalu dan rata-rata 2016–2025;
  * hari per tingkat bahaya kebakaran (FWI dari reanalisis ERA5, metode yang sama dengan menu Prakiraan);
  * cuaca bulanan (hujan, hari kering, suhu maksimum) dibanding normal 2001–2025 (ERA5/ERA5-Land);
  * indikasi perubahan tutupan hutan terakhir (Sentinel-2) bila ada;
  * peta & grafik harian, tabel titik panas terdekat.
Semua angka dihitung dari berkas data yang sama dengan yang dipakai aplikasi (data/*). Tidak ada angka perkiraan manual.

Keluaran: data/laporan_bulanan/<lokasi>/<YYYY-MM>.pdf dan data/laporan_bulanan/indeks.json
Pemakaian: python scripts/laporan_bulanan.py            -> bulan lalu (WIB), lewati yang sudah ada
           python scripts/laporan_bulanan.py --bulan 2026-10 [--paksa]
           python scripts/laporan_bulanan.py --mundur 3  -> 3 bulan terakhir yang sudah lewat
"""
import os, sys, json, glob, argparse, datetime as dt, calendar, io, hashlib
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data"); OUT = os.path.join(DATA, "laporan_bulanan")
BLN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
LEVEL = ["Rendah", "Sedang", "Tinggi", "Ekstrem"]
HIJAU, HIJAU2, ABU, MERAH = "#0B3B2C", "#1E7A58", "#46564E", "#C2410C"
ZONA = [("Di dalam Hutan Desa", lambda c: c < 0), ("Di wilayah desa", lambda c: c == 0),
        ("≤ 5 km dari batas", lambda c: 0 < c <= 5), ("5–25 km dari batas", lambda c: 5 < c <= 25)]

def J(p):
    with open(os.path.join(DATA, p), encoding="utf-8") as f:
        return json.load(f)

def fmt(n, d=0):
    if n is None: return "–"
    s = f"{n:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")

def ym_add(y, m, k):
    m0 = y * 12 + (m - 1) + k
    return m0 // 12, m0 % 12 + 1

# ---------------------------------------------------------------- data
_TITIK = {}
def titik_tahun(y):
    if y not in _TITIK:
        p = os.path.join(DATA, "titik", f"{y}.json")
        _TITIK[y] = J(f"titik/{y}.json") if os.path.exists(p) else {"lokasi": [], "titik": []}
    return _TITIK[y]

def titik_bulan(y, m, idx_id):
    """titik panas bulan y-m dengan kode jarak ke lokasi idx_id (<= 25 km). Gabungan arsip tahunan + data terbaru."""
    pre = f"{y:04d}-{m:02d}"; seen = {};
    sumber = [titik_tahun(y)]
    try:
        h = J("hotspots.json"); sumber.append({"lokasi": h["lokasi"], "titik": h["titik"]})
    except Exception:
        pass
    for s in sumber:
        if idx_id not in s.get("lokasi", []): continue
        i = s["lokasi"].index(idx_id)
        for t in s["titik"]:
            if not str(t.get("d", "")).startswith(pre): continue
            ls = t.get("ls") or []
            if len(ls) <= i: continue
            c = ls[i]
            if c is None or c > 25: continue
            seen[t["k"]] = dict(t, _c=c)
    return sorted(seen.values(), key=lambda t: (t["d"], t.get("t", "")))

def hitung_zona(ts):
    z = {}
    for nama, f in ZONA: z[nama] = sum(1 for t in ts if f(t["_c"]))
    z["≤ 25 km (total)"] = len(ts)
    return z

def cuaca_lokasi(sid):
    p = f"cuaca_{sid}.json"
    return J(p) if os.path.exists(os.path.join(DATA, p)) else J("cuaca.json")

def cuaca_bulan(cu, y, m):
    pre = f"{y:04d}-{m:02d}"; idx = [i for i, t in enumerate(cu["t"]) if t.startswith(pre)]
    if not idx: return None
    hj = [cu["hujan"][i] for i in idx if cu["hujan"][i] is not None]
    tm = [cu["tmaks"][i] for i in idx if cu["tmaks"][i] is not None]
    rh = [cu["rh"][i] for i in idx if cu.get("rh") and cu["rh"][i] is not None]
    # hari kering beruntun terpanjang (< 1 mm)
    run = best = 0
    for v in hj:
        run = run + 1 if v < 1 else 0; best = max(best, run)
    return {"hari": len(idx), "hujan": sum(hj), "kering": sum(1 for v in hj if v < 1), "kering_beruntun": best,
            "tmaks_rata": sum(tm) / len(tm) if tm else None, "tmaks_max": max(tm) if tm else None,
            "rh_rata": sum(rh) / len(rh) if rh else None, "harian_hujan": hj, "harian_t": [cu["t"][i] for i in idx]}

def cuaca_normal(cu, m, th0=2001, th1=2025):
    tot, tm = [], []
    for y in range(th0, th1 + 1):
        c = cuaca_bulan(cu, y, m)
        if c and c["hari"] >= 28:
            tot.append(c["hujan"]); tm.append(c["tmaks_rata"])
    return {"hujan": sum(tot) / len(tot) if tot else None, "tmaks": sum(tm) / len(tm) if tm else None, "n": len(tot)}

def fdrs_bulan(sid, y, m):
    p = os.path.join(DATA, "prakiraan", f"fdrs_{sid}.json")
    if not os.path.exists(p): return None
    f = J(f"prakiraan/fdrs_{sid}.json"); pre = f"{y:04d}-{m:02d}"
    idx = [i for i, t in enumerate(f["t"]) if t.startswith(pre) and (not f.get("sumber") or f["sumber"][i] == "ERA5")]
    if not idx: return None
    lv = Counter(f["level"][i] for i in idx)
    return {"hari": len(idx), "level": [lv.get(k, 0) for k in range(4)], "fwi_max": max(f["fwi"][i] for i in idx),
            "harian_t": [f["t"][i] for i in idx], "harian_fwi": [f["fwi"][i] for i in idx], "harian_lv": [f["level"][i] for i in idx]}

# ---------------------------------------------------------------- gambar
def _plt():
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8, "axes.spines.top": False, "axes.spines.right": False,
                         "axes.edgecolor": "#9AA8A0", "axes.labelcolor": ABU, "xtick.color": ABU, "ytick.color": ABU})
    return plt

def gambar_peta(site, ts):
    plt = _plt(); from shapely.geometry import shape
    fig, ax = plt.subplots(figsize=(3.6, 3.6), dpi=200)
    def gambar(fc, **kw):
        for f in fc.get("features", []):
            g = shape(f["geometry"]); gs = getattr(g, "geoms", [g])
            for p in gs:
                if p.geom_type != "Polygon": continue
                x, y = p.exterior.xy; ax.fill(x, y, **kw)
    gambar(site["desa"], facecolor="#EEF3EF", edgecolor="#9AA8A0", linewidth=.6)
    gambar(site["hd"], facecolor="#CFE7D8", edgecolor=HIJAU2, linewidth=1.1)
    c = site["pusat"]
    if ts:
        warna = [MERAH if t["_c"] <= 0 else "#EA580C" if t["_c"] <= 5 else "#F59E0B" for t in ts]
        ax.scatter([t["lo"] for t in ts], [t["la"] for t in ts], s=9, c=warna, edgecolors="white", linewidths=.3, zorder=3)
    # bingkai: seluruh wilayah + semua titik, persegi, ditambah tepi
    import math
    from shapely.ops import unary_union
    bb = unary_union([shape(f["geometry"]) for fc in (site["desa"], site["hd"]) for f in fc.get("features", [])]).bounds
    xs = [bb[0], bb[2]] + [t["lo"] for t in ts]; ys = [bb[1], bb[3]] + [t["la"] for t in ts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2; k = math.cos(math.radians(cy))
    r = max((max(xs) - min(xs)) * k, max(ys) - min(ys)) / 2 * 1.12 + 0.01
    ax.set_xlim(cx - r / k, cx + r / k); ax.set_ylim(cy - r, cy + r); ax.set_aspect(1 / k)
    c = (cy, cx); dl = r; dg = r / k
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_visible(True); s.set_color("#C9D6CD")
    km = 10 if r * 111 > 12 else 2
    ax.plot([c[1] - dg * .9, c[1] - dg * .9 + km / (111.32 * k)], [c[0] - dl * .9] * 2, color=ABU, lw=1.5)
    ax.text(c[1] - dg * .9, c[0] - dl * .84, f"{km} km", fontsize=6.5, color=ABU)
    b = io.BytesIO(); fig.tight_layout(pad=.2); fig.savefig(b, format="png"); plt.close(fig); b.seek(0); return b

def gambar_harian(y, m, ts, fd, cb):
    plt = _plt(); n = calendar.monthrange(y, m)[1]; hari = list(range(1, n + 1))
    jml = Counter(int(t["d"][8:10]) for t in ts)
    fig, ax = plt.subplots(figsize=(7.2, 2.3), dpi=200)
    if cb:
        hj = {int(t[8:10]): v for t, v in zip(cb["harian_t"], cb["harian_hujan"])}
        ax.bar(hari, [hj.get(d, 0) for d in hari], color="#93C5FD", width=.8, label="Hujan (mm)")
    ax.set_ylabel("Hujan (mm)"); ax.set_xlim(.4, n + .6); ax.set_xticks(hari[::2])
    ax2 = ax.twinx(); ax2.spines["top"].set_visible(False)
    if ts: ax2.bar(hari, [jml.get(d, 0) for d in hari], color=MERAH, width=.35, label="Titik panas ≤25 km")
    if fd:
        fw = {int(t[8:10]): v for t, v in zip(fd["harian_t"], fd["harian_fwi"])}
        ax2.plot([d for d in hari if d in fw], [fw[d] for d in hari if d in fw], color="#B45309", lw=1.3, label="FWI")
    ax2.set_ylabel("Titik panas / FWI"); ax2.set_ylim(bottom=0)
    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="lower left", bbox_to_anchor=(0, 1.0), fontsize=6.5, frameon=False, ncol=3, borderaxespad=0.2)
    ax.set_xlabel(f"Tanggal ({BLN[m]} {y})")
    b = io.BytesIO(); fig.tight_layout(pad=.3); fig.savefig(b, format="png"); plt.close(fig); b.seek(0); return b

# ---------------------------------------------------------------- PDF
def buat_pdf(site, y, m, path):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import matplotlib
    fd_ = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
    if "DV" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DV", os.path.join(fd_, "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DVB", os.path.join(fd_, "DejaVuSans-Bold.ttf")))
    sid = site["id"]
    ts = titik_bulan(y, m, sid); z = hitung_zona(ts)
    py, pm = ym_add(y, m, -1); zp = hitung_zona(titik_bulan(py, pm, sid))
    zl = hitung_zona(titik_bulan(y - 1, m, sid))
    rata = [len(titik_bulan(yy, m, sid)) for yy in range(2016, 2026)]
    rata25 = sum(rata) / len(rata)
    cu = cuaca_lokasi(sid); cb = cuaca_bulan(cu, y, m); cn = cuaca_normal(cu, m); fd = fdrs_bulan(sid, y, m)
    ph = (J("hutan/peringatan.json").get("lokasi") or {}).get(sid) if os.path.exists(os.path.join(DATA, "hutan", "peringatan.json")) else None

    S = lambda **k: ParagraphStyle("x", fontName=k.pop("f", "DV"), fontSize=k.pop("s", 9), leading=k.pop("l", 12.5), textColor=colors.HexColor(k.pop("c", "#0E1A14")), **k)
    sJ, sH, sH2, sP, sK = S(f="DVB", s=17, l=21, c=HIJAU), S(f="DVB", s=11.5, l=15, c=HIJAU, spaceBefore=10, spaceAfter=4, keepWithNext=1), S(f="DVB", s=9.5, c=HIJAU2), S(), S(s=7.5, l=10, c=ABU)
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=1.7 * cm, rightMargin=1.7 * cm, topMargin=1.5 * cm, bottomMargin=1.6 * cm,
                            title=f"Laporan Bulanan {site['hd_nama']} – {BLN[m]} {y}", author="Pantau Rimbak – Yayasan PRCF Indonesia")
    W = A4[0] - 3.4 * cm
    def tabel(rows, cols, head=True, z=False, kanan=None):
        t = Table(rows, colWidths=cols, repeatRows=1 if head else 0)
        st = [("FONT", (0, 0), (-1, -1), "DV", 8.3), ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0E1A14")),
              ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#C9D6CD")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
              ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5), ] + ([("ALIGN", (c, 0), (c, -1), "RIGHT") for c in kanan] if isinstance(kanan, (list, tuple)) else [("ALIGN", (1, 0), (kanan if kanan is not None else -1, -1), "RIGHT")])
        if head: st += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(HIJAU)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONT", (0, 0), (-1, 0), "DVB", 8.3)]
        if z: st += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F1F5F2")), ("FONT", (0, -1), (-1, -1), "DVB", 8.3)]
        t.setStyle(TableStyle(st)); return t
    el = []
    el.append(Paragraph("LAPORAN BULANAN · PANTAU RIMBAK", S(f="DVB", s=8, c=HIJAU2)))
    el.append(Paragraph(f"{site['hd_nama']}", sJ))
    el.append(Paragraph(f"{BLN[m]} {y} · {site.get('lphd') or ''}{' · ' if site.get('lphd') else ''}Desa {site['desa_nama']}, Kec. {site.get('kec', '')}, Kab. Kapuas Hulu · luas Hutan Desa {fmt(site.get('luas_hd_ha'), 1)} ha", S(c=ABU)))
    el.append(Spacer(1, 8))
    # ringkasan
    lv = fd["level"] if fd else None
    kal = []
    kal.append(f"Pada {BLN[m]} {y} tercatat <b>{fmt(z['≤ 25 km (total)'])}</b> deteksi titik panas dalam radius 25 km, "
               f"<b>{fmt(z['Di dalam Hutan Desa'])}</b> di antaranya di dalam Hutan Desa dan <b>{fmt(z['≤ 5 km dari batas'] + z['Di wilayah desa'])}</b> di wilayah desa atau ≤ 5 km dari batas.")
    kal.append(f"Bulan sebelumnya {fmt(zp['≤ 25 km (total)'])}, bulan yang sama tahun lalu {fmt(zl['≤ 25 km (total)'])}, rata-rata {BLN[m]} 2016–2025 {fmt(rata25, 1)}.")
    if lv: kal.append(f"Bahaya kebakaran (FWI) tinggi atau ekstrem selama <b>{lv[2] + lv[3]}</b> dari {fd['hari']} hari.")
    if cb and cn["hujan"]:
        sel = (cb["hujan"] - cn["hujan"]) / cn["hujan"] * 100
        kal.append(f"Curah hujan {fmt(cb['hujan'])} mm ({'+' if sel >= 0 else ''}{fmt(sel)}% dari normal), {cb['kering']} hari tanpa hujan, terpanjang {cb['kering_beruntun']} hari berturut-turut.")
    el.append(Table([[Paragraph(" ".join(kal), S(l=13.5))]], colWidths=[W], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F7F3")),
               ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(HIJAU2)), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])))
    # titik panas
    el.append(Paragraph("1. Titik panas (NASA FIRMS, VIIRS & MODIS)", sH))
    rows = [["Zona", f"{BLN[m][:3]} {y}", f"{BLN[pm][:3]} {py}", f"{BLN[m][:3]} {y - 1}"]]
    for k in [n for n, _ in ZONA] + ["≤ 25 km (total)"]: rows.append([k, fmt(z[k]), fmt(zp[k]), fmt(zl[k])])
    peta = Image(gambar_peta(site, ts), width=6.2 * cm, height=6.2 * cm)
    kanan = [tabel(rows, [4.3 * cm, 1.9 * cm, 1.9 * cm, 1.9 * cm], z=True), Spacer(1, 6),
             Paragraph(f"Rata-rata {BLN[m]} 2016–2025 (≤ 25 km): <b>{fmt(rata25, 1)}</b> deteksi. Satu kebakaran dapat terdeteksi beberapa kali oleh satelit berbeda.", sK),
             Spacer(1, 4), Paragraph("Peta: batas Hutan Desa (hijau), desa (abu), titik panas bulan ini – merah di dalam wilayah, oranye ≤ 5 km, kuning 5–25 km.", sK)]
    el.append(Table([[peta, kanan]], colWidths=[6.6 * cm, W - 6.6 * cm], style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)])))
    el.append(Spacer(1, 6)); el.append(Image(gambar_harian(y, m, ts, fd, cb), width=W, height=W * 2.3 / 7.2))
    # bahaya & cuaca
    el.append(Paragraph("2. Bahaya kebakaran & cuaca", sH))
    r2 = [["Indikator", "Nilai", "Keterangan"]]
    if fd:
        r2.append(["Hari bahaya Rendah / Sedang", f"{lv[0]} / {lv[1]}", f"dari {fd['hari']} hari (FWI harian, ERA5)"])
        r2.append(["Hari bahaya Tinggi / Ekstrem", f"{lv[2]} / {lv[3]}", f"FWI tertinggi {fmt(fd['fwi_max'], 1)}"])
    if cb:
        r2.append(["Curah hujan", f"{fmt(cb['hujan'])} mm", f"normal {fmt(cn['hujan'])} mm ({cn['n']} tahun, 2001–2025)" if cn["hujan"] else "–"])
        r2.append(["Hari tanpa hujan (< 1 mm)", f"{cb['kering']} hari", f"terpanjang {cb['kering_beruntun']} hari berturut-turut"])
        r2.append(["Suhu maksimum rata-rata", f"{fmt(cb['tmaks_rata'], 1)} °C", f"normal {fmt(cn['tmaks'], 1)} °C · tertinggi {fmt(cb['tmaks_max'], 1)} °C"])
        if cb["rh_rata"] is not None: r2.append(["Kelembapan rata-rata", f"{fmt(cb['rh_rata'])}%", ""])
    if len(r2) == 1: r2.append(["Data cuaca bulan ini belum tersedia", "", ""])
    el.append(tabel(r2, [5 * cm, 3 * cm, W - 8 * cm], kanan=[1]))
    # hutan
    el.append(Paragraph("3. Indikasi perubahan tutupan hutan (Sentinel-2)", sH))
    if ph and ph.get("status") == "selesai":
        el.append(Paragraph(f"Pemeriksaan terakhir {ph['dicek_utc'][:10]} membandingkan citra {ph['periode_terkini'][0]} s.d. {ph['periode_terkini'][1]} dengan periode yang sama tahun sebelumnya "
                            f"({ph.get('cerah_persen', '–')}% wilayah tampak cerah). Terdeteksi <b>{fmt(ph.get('jumlah_petak') or 0)}</b> petak indikasi perubahan seluas <b>{fmt(ph.get('luas_berubah_ha') or 0, 1)} ha</b> "
                            f"di sekitar desa, <b>{fmt(ph.get('luas_berubah_di_hd_ha') or 0, 1)} ha</b> di antaranya di dalam Hutan Desa. Indikasi perlu dicek lapangan.", sP))
    else:
        el.append(Paragraph("Belum ada hasil pemeriksaan citra yang cukup cerah untuk periode ini.", sP))
    # tabel titik terdekat
    dekat = sorted([t for t in ts if t["_c"] <= 5], key=lambda t: (min(t["_c"], 0.5) if t["_c"] <= 0 else 1, t["d"], t.get("t", "")))   # di dalam HD & desa lebih dulu
    if dekat:
        el.append(Paragraph(f"4. Daftar titik panas di dalam Hutan Desa, wilayah desa & ≤ 5 km ({len(dekat)})", sH))
        r4 = [["Tanggal", "Jam WIB", "Satelit", "Keyakinan", "FRP MW", "Lokasi"]]
        for t in dekat[:40]:
            jam = t.get("t", "0000"); hh = (int(jam[:2]) + 7) % 24
            ky = {"h": "tinggi", "n": "nominal", "l": "rendah"}.get(str(t.get("c")), str(t.get("c")))
            lok = "di dalam Hutan Desa" if t["_c"] < 0 else "di wilayah desa" if t["_c"] == 0 else f"{fmt(t['_c'], 1)} km dari batas"
            r4.append([t["d"], f"{hh:02d}.{jam[2:4]}", f"{t.get('ins', '')} {t.get('sat', '')}", ky, fmt(t.get("frp"), 1), lok])
        el.append(tabel(r4, [2.3 * cm, 1.7 * cm, 2.6 * cm, 2.1 * cm, 1.7 * cm, W - 10.4 * cm], kanan=[1, 4]))
        if len(dekat) > 40: el.append(Paragraph(f"…dan {len(dekat) - 40} titik lainnya (lihat aplikasi).", sK))
    # sumber
    el.append(Spacer(1, 10))
    el.append(KeepTogether([Paragraph("Sumber & catatan", sH2), Paragraph(
        "Titik panas: NASA FIRMS (VIIRS S-NPP, NOAA-20, NOAA-21; MODIS Terra/Aqua), semua tingkat keyakinan. Jarak dihitung ke batas gabungan Hutan Desa dan desa. "
        "Bahaya kebakaran: Fire Weather Index (Van Wagner 1987) dari reanalisis ECMWF ERA5. Cuaca: Open-Meteo Historical Weather API (ECMWF ERA5/ERA5-Land, Copernicus). "
        "Perubahan tutupan: Sentinel-2 L2A (ESA Copernicus) di atas hutan acuan Hansen/UMD GFC. "
        "Titik panas adalah deteksi panas satelit dan belum tentu kebakaran; indikasi perubahan hutan perlu verifikasi lapangan. Pantau Rimbak bukan sistem resmi pemerintah.", sK),
        Spacer(1, 4), Paragraph(f"Dibuat otomatis oleh Pantau Rimbak – Yayasan PRCF Indonesia, {dt.datetime.now(dt.timezone.utc).replace(tzinfo=None):%d-%m-%Y %H.%M} UTC.", sK)]))
    def kaki(c, d):
        c.saveState(); c.setFont("DV", 7); c.setFillColor(colors.HexColor(ABU))
        c.drawString(1.7 * cm, 1 * cm, f"Pantau Rimbak · {site['hd_nama']} · {BLN[m]} {y}"); c.drawRightString(A4[0] - 1.7 * cm, 1 * cm, f"hlm. {d.page}"); c.restoreState()
    doc.build(el, onFirstPage=kaki, onLaterPages=kaki)
    return {"titik_25km": z["≤ 25 km (total)"], "titik_hd": z["Di dalam Hutan Desa"], "titik_5km": z["≤ 5 km dari batas"] + z["Di wilayah desa"],
            "hari_tinggi_ekstrem": (lv[2] + lv[3]) if lv else None, "hujan_mm": round(cb["hujan"], 1) if cb else None}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--bulan"); ap.add_argument("--mundur", type=int, default=1); ap.add_argument("--paksa", action="store_true")
    a = ap.parse_args()
    kini = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=7)
    if a.bulan: daftar = [tuple(map(int, a.bulan.split("-")))]
    else: daftar = [ym_add(kini.year, kini.month, -k) for k in range(a.mundur, 0, -1)]
    for y, m in daftar:
        if (y, m) >= (kini.year, kini.month): sys.exit(f"{y}-{m:02d} belum selesai – laporan hanya untuk bulan yang sudah lewat")
    sites = J("geo.json")["sites"]; os.makedirs(OUT, exist_ok=True)
    ip = os.path.join(OUT, "indeks.json")
    idx = json.load(open(ip, encoding="utf-8")) if os.path.exists(ip) else {"laporan": {}}
    n = 0
    for y, m in daftar:
        for s in sites:
            rel = f"laporan_bulanan/{s['id']}/{y:04d}-{m:02d}.pdf"; p = os.path.join(DATA, rel)
            if os.path.exists(p) and not a.paksa: continue
            os.makedirs(os.path.dirname(p), exist_ok=True)
            ring = buat_pdf(s, y, m, p); n += 1
            sha = hashlib.sha256(open(p, "rb").read()).hexdigest()
            idx["laporan"].setdefault(s["id"], {})[f"{y:04d}-{m:02d}"] = dict(ring, berkas=rel, kb=round(os.path.getsize(p) / 1024), sha256=sha,
                                                                              dibuat_utc=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%dT%H:%MZ"))
            print(f"  {s['id']:12} {y}-{m:02d}  {ring}")
    idx["diperbarui_utc"] = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%dT%H:%MZ")
    idx["metode"] = "Titik panas NASA FIRMS, FWI ERA5, cuaca ERA5/ERA5-Land, perubahan hutan Sentinel-2. Dibuat otomatis tiap awal bulan."
    with open(ip, "w", encoding="utf-8") as f: json.dump(idx, f, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"Laporan dibuat: {n}")

if __name__ == "__main__":
    main()
