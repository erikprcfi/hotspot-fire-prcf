"""
Laporan TAHUNAN otomatis per Hutan Desa – Pantau Rimbak (Yayasan PRCF Indonesia)
Untuk setiap Hutan Desa dan setiap tahun yang SUDAH SELESAI (WIB): satu PDF berisi
  * titik panas NASA FIRMS per zona (di dalam Hutan Desa, desa, <= 5 km, 5–25 km) dibanding tahun sebelumnya & rata-rata 2016–2025,
    grafik tahunan 2016–tahun laporan dan grafik bulanan (tahun ini vs rata-rata);
  * cuaca tahunan (hujan, hari kering, kering beruntun terpanjang, suhu maksimum) vs normal 2001–2025 (ERA5/ERA5-Land);
  * hari per tingkat bahaya kebakaran (FWI ERA5) – hanya bagian tahun yang tersedia;
  * kehilangan tutupan pohon Hansen/UMD GFC untuk tahun itu dan tren;
  * luas bekas terbakar Sentinel-2 musim kebakaran tahun itu (bila citra cukup cerah);
  * 10 titik rawan berulang teratas.
Perhitungan memakai fungsi yang sama dengan laporan bulanan (scripts/laporan_bulanan.py).
Keluaran: data/laporan_tahunan/<lokasi>/<YYYY>.pdf + data/laporan_tahunan/indeks.json
Pemakaian: python scripts/laporan_tahunan.py            -> tahun lalu (WIB), lewati yang sudah ada
           python scripts/laporan_tahunan.py --tahun 2025 [--paksa]
"""
import os, sys, json, io, argparse, hashlib, datetime as dt, statistics
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import laporan_bulanan as LB

DATA = LB.DATA; OUT = os.path.join(DATA, "laporan_tahunan")
J, fmt, BLN, LEVEL, ZONA = LB.J, LB.fmt, LB.BLN, LB.LEVEL, LB.ZONA
HIJAU, HIJAU2, ABU, MERAH = LB.HIJAU, LB.HIJAU2, LB.ABU, LB.MERAH

def titik_tahun(y, sid):
    out = []
    for m in range(1, 13): out += LB.titik_bulan(y, m, sid)
    return out

def cuaca_tahun(cu, y):
    bl = [LB.cuaca_bulan(cu, y, m) for m in range(1, 13)]
    if not all(bl): return None
    hj = sum(b["hujan"] for b in bl); harian = [v for b in bl for v in b["harian_hujan"]]
    run = best = 0
    for v in harian: run = run + 1 if v < 1 else 0; best = max(best, run)
    tm = [b["tmaks_rata"] for b in bl if b["tmaks_rata"] is not None]
    return {"hujan": hj, "kering": sum(b["kering"] for b in bl), "kering_beruntun": best, "tmaks": sum(tm) / len(tm) if tm else None,
            "tmaks_max": max(b["tmaks_max"] for b in bl if b["tmaks_max"] is not None), "bulanan": [b["hujan"] for b in bl]}

def normal_tahun(cu):
    n = [LB.cuaca_normal(cu, m) for m in range(1, 13)]
    return {"hujan": sum(x["hujan"] for x in n if x["hujan"]), "bulanan": [x["hujan"] for x in n], "tmaks": statistics.mean(x["tmaks"] for x in n if x["tmaks"])}

def gambar_tahunan(per_tahun, y):
    plt = LB._plt(); th = sorted(per_tahun); fig, ax = plt.subplots(figsize=(7.2, 2.2), dpi=200)
    ax.bar([str(t) for t in th], [per_tahun[t] for t in th], color=[MERAH if t == y else "#9AA8A0" for t in th], width=.65)
    for i, t in enumerate(th): ax.text(i, per_tahun[t], fmt(per_tahun[t]), ha="center", va="bottom", fontsize=6.5, color=ABU)
    ax.set_ylabel("Deteksi ≤ 25 km"); ax.tick_params(axis="x", labelsize=7)
    b = io.BytesIO(); fig.tight_layout(pad=.3); fig.savefig(b, format="png"); plt.close(fig); b.seek(0); return b

def gambar_bulanan(ini, rata, hj, hjn, y):
    plt = LB._plt(); fig, ax = plt.subplots(figsize=(7.2, 2.3), dpi=200); x = list(range(12)); lb = [b[:3] for b in BLN[1:]]
    ax.bar([i - .2 for i in x], ini, width=.4, color=MERAH, label=f"Titik panas {y}")
    ax.bar([i + .2 for i in x], rata, width=.4, color="#F4A97F", label="Rata-rata 2016–2025")
    ax.set_xticks(x); ax.set_xticklabels(lb); ax.set_ylabel("Deteksi ≤ 25 km")
    if hj:
        a2 = ax.twinx(); a2.spines["top"].set_visible(False)
        a2.plot(x, hj, color="#2563EB", lw=1.4, marker="o", ms=2.5, label=f"Hujan {y} (mm)"); a2.plot(x, hjn, color="#93C5FD", lw=1.2, ls="--", label="Hujan normal")
        a2.set_ylabel("Hujan (mm)"); a2.set_ylim(bottom=0)
        h1, l1 = ax.get_legend_handles_labels(); h2, l2 = a2.get_legend_handles_labels(); ax.legend(h1 + h2, l1 + l2, loc="lower left", bbox_to_anchor=(0, 1.0), fontsize=6.3, frameon=False, ncol=4)
    else: ax.legend(fontsize=6.5, frameon=False)
    b = io.BytesIO(); fig.tight_layout(pad=.3); fig.savefig(b, format="png"); plt.close(fig); b.seek(0); return b

def buat_pdf(site, y, path):
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
        pdfmetrics.registerFont(TTFont("DV", os.path.join(fd_, "DejaVuSans.ttf"))); pdfmetrics.registerFont(TTFont("DVB", os.path.join(fd_, "DejaVuSans-Bold.ttf")))
    sid = site["id"]
    ts = titik_tahun(y, sid); z = LB.hitung_zona(ts); zp = LB.hitung_zona(titik_tahun(y - 1, sid))
    per_tahun = {t: len(titik_tahun(t, sid)) for t in range(2016, y + 1)}
    rata10 = statistics.mean(per_tahun[t] for t in range(2016, 2026) if t in per_tahun)
    musim = (J("musim/indeks.json").get("lokasi") or {}).get(sid) if os.path.exists(os.path.join(DATA, "musim", "indeks.json")) else None
    ini_bl = [sum(1 for t in ts if int(t["d"][5:7]) == m) for m in range(1, 13)]
    rata_bl = [b["rata25"] for b in musim["bulan"]] if musim else [0] * 12
    cu = LB.cuaca_lokasi(sid); ct = cuaca_tahun(cu, y); cn = normal_tahun(cu)
    fd = [LB.fdrs_bulan(sid, y, m) for m in range(1, 13)]; fd = [f for f in fd if f]
    lv = [sum(f["level"][k] for f in fd) for k in range(4)] if fd else None; nh = sum(f["hari"] for f in fd) if fd else 0
    kh = ((J("hutan/kehilangan.json").get("lokasi") or {}).get(sid) or {}).get("hutan_desa") or {}
    kpt = kh.get("kehilangan_per_tahun_ha") or {}
    bekas = [v for v in (J("bekas_terbakar/indeks.json").get("musim") or {}).values() if v.get("lokasi") == sid and str(v.get("awal", "")).startswith(str(y))]
    rawan = J(f"rawan/{sid}.geojson")["features"][:10] if os.path.exists(os.path.join(DATA, "rawan", f"{sid}.geojson")) else []

    S = lambda **k: ParagraphStyle("x", fontName=k.pop("f", "DV"), fontSize=k.pop("s", 9), leading=k.pop("l", 12.5), textColor=colors.HexColor(k.pop("c", "#0E1A14")), **k)
    sJ, sH, sP, sK = S(f="DVB", s=17, l=21, c=HIJAU), S(f="DVB", s=11.5, l=15, c=HIJAU, spaceBefore=10, spaceAfter=4, keepWithNext=1), S(), S(s=7.5, l=10, c=ABU)
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=1.7 * cm, rightMargin=1.7 * cm, topMargin=1.5 * cm, bottomMargin=1.6 * cm,
                            title=f"Laporan Tahunan {site['hd_nama']} – {y}", author="Pantau Rimbak – Yayasan PRCF Indonesia")
    W = A4[0] - 3.4 * cm
    def tabel(rows, cols, kanan=(1,), z_=False):
        t = Table(rows, colWidths=cols, repeatRows=1)
        st = [("FONT", (0, 0), (-1, -1), "DV", 8.3), ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#C9D6CD")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
              ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(HIJAU)),
              ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONT", (0, 0), (-1, 0), "DVB", 8.3)] + [("ALIGN", (c, 0), (c, -1), "RIGHT") for c in kanan]
        if z_: st += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F1F5F2")), ("FONT", (0, -1), (-1, -1), "DVB", 8.3)]
        t.setStyle(TableStyle(st)); return t
    el = [Paragraph("LAPORAN TAHUNAN · PANTAU RIMBAK", S(f="DVB", s=8, c=HIJAU2)), Paragraph(site["hd_nama"], sJ),
          Paragraph(f"Tahun {y} · {site.get('lphd') or ''}{' · ' if site.get('lphd') else ''}Desa {site['desa_nama']}, Kec. {site.get('kec', '')}, Kab. Kapuas Hulu · luas Hutan Desa {fmt(site.get('luas_hd_ha'), 1)} ha", S(c=ABU)), Spacer(1, 8)]
    kal = [f"Sepanjang {y} tercatat <b>{fmt(z['≤ 25 km (total)'])}</b> deteksi titik panas dalam radius 25 km (tahun sebelumnya {fmt(zp['≤ 25 km (total)'])}; rata-rata 2016–2025 {fmt(rata10, 1)}), "
           f"<b>{fmt(z['Di dalam Hutan Desa'])}</b> di antaranya di dalam Hutan Desa."]
    if any(ini_bl): kal.append(f"Bulan dengan deteksi terbanyak: {BLN[ini_bl.index(max(ini_bl)) + 1]} ({fmt(max(ini_bl))}).")
    if ct and cn["hujan"]:
        sel = (ct["hujan"] - cn["hujan"]) / cn["hujan"] * 100
        kal.append(f"Curah hujan {fmt(ct['hujan'])} mm ({'+' if sel >= 0 else ''}{fmt(sel)}% dari normal), kering beruntun terpanjang {ct['kering_beruntun']} hari.")
    if str(y) in kpt: kal.append(f"Kehilangan tutupan pohon di Hutan Desa (Hansen/UMD) {fmt(kpt[str(y)], 2)} ha.")
    el.append(Table([[Paragraph(" ".join(kal), S(l=13.5))]], colWidths=[W], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F7F3")),
               ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(HIJAU2)), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])))
    el.append(Paragraph("1. Titik panas (NASA FIRMS, VIIRS & MODIS)", sH))
    rows = [["Zona", str(y), str(y - 1)]] + [[k, fmt(z[k]), fmt(zp[k])] for k in [n for n, _ in ZONA] + ["≤ 25 km (total)"]]
    el.append(Table([[tabel(rows, [4.6 * cm, 2 * cm, 2 * cm], kanan=(1, 2), z_=True), Image(LB.gambar_peta(site, ts), width=5.6 * cm, height=5.6 * cm)]], colWidths=[W - 6 * cm, 6 * cm],
                    style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)])))
    el.append(Spacer(1, 4)); el.append(Paragraph(f"Deteksi titik panas ≤ 25 km per tahun, 2016–{y}", S(f="DVB", s=8.5, c=HIJAU2)))
    el.append(Image(gambar_tahunan(per_tahun, y), width=W, height=W * 2.2 / 7.2))
    el.append(Paragraph(f"Per bulan: {y} dibanding rata-rata 2016–2025, dengan curah hujan", S(f="DVB", s=8.5, c=HIJAU2)))
    el.append(Image(gambar_bulanan(ini_bl, rata_bl, ct["bulanan"] if ct else None, cn["bulanan"], y), width=W, height=W * 2.3 / 7.2))
    el.append(Paragraph("2. Cuaca & bahaya kebakaran", sH))
    r2 = [["Indikator", "Nilai", "Keterangan"]]
    if ct:
        r2 += [["Curah hujan tahunan", f"{fmt(ct['hujan'])} mm", f"normal {fmt(cn['hujan'])} mm (2001–2025)"], ["Hari tanpa hujan (< 1 mm)", f"{ct['kering']} hari", f"terpanjang {ct['kering_beruntun']} hari berturut-turut"],
               ["Suhu maksimum rata-rata", f"{fmt(ct['tmaks'], 1)} °C", f"normal {fmt(cn['tmaks'], 1)} °C · tertinggi {fmt(ct['tmaks_max'], 1)} °C"]]
    if lv: r2 += [["Hari bahaya Rendah / Sedang", f"{lv[0]} / {lv[1]}", f"dari {nh} hari yang tersedia (FWI ERA5)"], ["Hari bahaya Tinggi / Ekstrem", f"{lv[2]} / {lv[3]}", "tersedia sejak Oktober 2025" if nh < 360 else ""]]
    if len(r2) == 1: r2.append(["Data cuaca tahun ini belum lengkap", "", ""])
    el.append(tabel(r2, [5 * cm, 3 * cm, W - 8 * cm]))
    el.append(Paragraph("3. Tutupan hutan & bekas terbakar", sH))
    if kpt:
        th = [t for t in sorted(kpt) if int(t) >= y - 4 and int(t) <= y]
        if th: el.append(tabel([["Tahun"] + th, [Paragraph("Kehilangan tutupan pohon di Hutan Desa (ha)", S(s=8.3, l=10))] + [fmt(kpt[t], 2) for t in th]], [5.2 * cm] + [(W - 5.2 * cm) / len(th)] * len(th), kanan=tuple(range(1, len(th) + 1))))
        el.append(Paragraph(f"Total kehilangan 2001–2025: {fmt(kh.get('kehilangan_total_ha'), 1)} ha ({fmt(kh.get('persen_hilang'), 2)}% dari hutan tahun 2000). Hansen/UMD Global Forest Change, Landsat 30 m.", sK))
    if bekas:
        for v in bekas:
            if v.get("status") == "selesai":
                el.append(Paragraph(f"Bekas terbakar musim {v['awal']} s.d. {v['akhir']} (Sentinel-2, dNBR): <b>{fmt(v.get('luas_ha'), 1)} ha</b>, keparahan tinggi {fmt(v.get('luas_tinggi_ha'), 1)} ha; {v.get('n_kejadian')} kejadian api.", sP))
            else:
                el.append(Paragraph(f"Musim kebakaran {v['awal']} s.d. {v['akhir']}: luas bekas terbakar belum dapat dihitung ({v.get('status')}).", sK))
    else: el.append(Paragraph("Tidak ada musim kebakaran yang dianalisis untuk tahun ini.", sK))
    if rawan:
        el.append(Paragraph("4. Titik rawan berulang (terbakar pada ≥ 3 tahun berbeda, 2016–2025)", sH))
        r4 = [["#", "Tahun terbakar (20..)", "Thn", "Lokasi", "Koordinat (lat, lon)"]]
        for f in rawan:
            p = f["properties"]; r4.append([str(p["peringkat"]), ", ".join(str(t)[2:] for t in p["tahun"]), str(p["n_tahun"]), p["lokasi"], f"{p['pusat'][0]:.4f}, {p['pusat'][1]:.4f}"])
        el.append(tabel(r4, [.7 * cm, 5.6 * cm, 1.1 * cm, 3.6 * cm, W - 11 * cm], kanan=(2,)))
    el.append(Spacer(1, 10))
    el.append(KeepTogether([Paragraph("Sumber & catatan", S(f="DVB", s=9.5, c=HIJAU2)), Paragraph(
        "Titik panas: NASA FIRMS (VIIRS S-NPP/NOAA-20/NOAA-21, MODIS Terra/Aqua), semua tingkat keyakinan; jarak ke batas gabungan Hutan Desa dan desa. Cuaca: Open-Meteo Historical Weather API (ECMWF ERA5/ERA5-Land, Copernicus). "
        "Bahaya kebakaran: Fire Weather Index dari ERA5. Tutupan pohon: Hansen/UMD/Google/USGS/NASA GFC (CC BY 4.0). Bekas terbakar: Sentinel-2 L2A (ESA Copernicus). "
        "Titik panas adalah deteksi panas satelit dan belum tentu kebakaran. Pantau Rimbak bukan sistem resmi pemerintah.", sK), Spacer(1, 4),
        Paragraph(f"Dibuat otomatis oleh Pantau Rimbak – Yayasan PRCF Indonesia, {dt.datetime.now(dt.timezone.utc):%d-%m-%Y %H.%M} UTC.", sK)]))
    def kaki(c, d):
        c.saveState(); c.setFont("DV", 7); c.setFillColor(colors.HexColor(ABU))
        c.drawString(1.7 * cm, 1 * cm, f"Pantau Rimbak · {site['hd_nama']} · Laporan Tahunan {y}"); c.drawRightString(A4[0] - 1.7 * cm, 1 * cm, f"hlm. {d.page}"); c.restoreState()
    doc.build(el, onFirstPage=kaki, onLaterPages=kaki)
    return {"titik_25km": z["≤ 25 km (total)"], "titik_hd": z["Di dalam Hutan Desa"], "titik_5km": z["≤ 5 km dari batas"] + z["Di wilayah desa"],
            "hujan_mm": round(ct["hujan"]) if ct else None, "kehilangan_ha": kpt.get(str(y))}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--tahun", type=int); ap.add_argument("--paksa", action="store_true"); a = ap.parse_args()
    kini = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=7)
    if not a.tahun and kini.month == 1 and kini.day < 2: print("1 Januari: tunggu data hari terakhir tahun lalu lengkap"); return
    daftar = [a.tahun] if a.tahun else [kini.year - 1]
    for y in daftar:
        if y >= kini.year: sys.exit(f"{y} belum selesai – laporan tahunan hanya untuk tahun yang sudah lewat")
    sites = J("geo.json")["sites"]; os.makedirs(OUT, exist_ok=True); ip = os.path.join(OUT, "indeks.json")
    idx = json.load(open(ip, encoding="utf-8")) if os.path.exists(ip) else {"laporan": {}}; n = 0
    for y in daftar:
        for s in sites:
            rel = f"laporan_tahunan/{s['id']}/{y}.pdf"; p = os.path.join(DATA, rel)
            if os.path.exists(p) and not a.paksa: continue
            os.makedirs(os.path.dirname(p), exist_ok=True); ring = buat_pdf(s, y, p); n += 1
            idx["laporan"].setdefault(s["id"], {})[str(y)] = dict(ring, berkas=rel, kb=round(os.path.getsize(p) / 1024), sha256=hashlib.sha256(open(p, "rb").read()).hexdigest(),
                                                                  dibuat_utc=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))
            print(f"  {s['id']:12} {y}  {ring}")
    if n:
        idx["diperbarui_utc"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
        with open(ip, "w", encoding="utf-8") as f: json.dump(idx, f, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"Laporan tahunan dibuat: {n}")

if __name__ == "__main__":
    main()
