"""
Rekap MUSIM API otomatis per Hutan Desa – Pantau Rimbak (Yayasan PRCF Indonesia)
================================================================================

Musim api tiap Hutan Desa diambil dari kalender musim api (data/musim/indeks.json): dari bulan "mulai
bersiap" sampai satu bulan setelah bulan musim terakhir (contoh: musim Jul–Sep → rekap Juni–Oktober).
Rekap suatu tahun dibuat otomatis 7 hari setelah periode itu berakhir, dan dibandingkan dengan musim
2016–tahun itu:
  * titik panas NASA FIRMS per zona, hari tersibuk, peringkat dibanding musim lain;
  * hujan (ERA5) vs normal 2001–2025 dan hari tanpa hujan beruntun terpanjang;
  * hari bahaya kebakaran (FWI) bila tersedia;
  * fase ENSO (ONI Jul–Sep, NOAA);
  * area terbakar MODIS MCD64A1 (500 m) & bekas terbakar Sentinel-2 bila sudah dianalisis.
Keluaran: data/rekap_musim/indeks.json (semua musim 2016–sekarang) + PDF 3 musim terakhir:
data/rekap_musim/<lokasi>/<YYYY>.pdf
"""
import os, sys, json, io, hashlib, statistics, datetime as dt, calendar
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import laporan_bulanan as LB

DATA = LB.DATA; OUT = os.path.join(DATA, "rekap_musim")
J, fmt, BLN = LB.J, LB.fmt, LB.BLN
HIJAU, HIJAU2, ABU, MERAH = LB.HIJAU, LB.HIJAU2, LB.ABU, LB.MERAH
KINI = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=7)).date()
PDF_TERAKHIR = int(os.environ.get("PR_PDF", "3"))   # wilayah SHP: 0 (tanpa PDF)

def Jx(p, d=None):
    try: return J(p)
    except Exception: return d

def periode(M):
    """bulan-bulan rekap (tahun relatif 0/-1) dari kalender: mulai bersiap s.d. 1 bulan setelah musim."""
    ms = M.get("musim") or []
    if not ms: return None
    s = set(ms); p = M["puncak"] if M["puncak"] in s else ms[0]
    a = p
    while ((a - 2) % 12) + 1 in s and ((a - 2) % 12) + 1 != p: a = ((a - 2) % 12) + 1
    b = p
    while (b % 12) + 1 in s and (b % 12) + 1 != p: b = (b % 12) + 1
    mulai = M.get("mulai_bersiap") or ((a - 2) % 12) + 1
    akhir = (b % 12) + 1
    bl, m = [], mulai
    while True:
        bl.append(m)
        if m == akhir or len(bl) > 12: break
        m = (m % 12) + 1
    # tahun relatif: bulan sesudah "pembungkus" Desember→Januari termasuk tahun musim (offset 0), sebelumnya −1
    wrap = any(bl[i] < bl[i - 1] for i in range(1, len(bl)))
    rel = []
    seen_wrap = False
    for i, m in enumerate(bl):
        if i and m < bl[i - 1]: seen_wrap = True
        rel.append((m, 0 if (seen_wrap or not wrap) else -1))
    return rel

def nama_periode(rel):
    return f"{BLN[rel[0][0]]}–{BLN[rel[-1][0]]}"

def hitung(site, Y, rel, modis_butir, enso, bekas_s2):
    sid = site["id"]
    bulan = [(Y + o, m) for m, o in rel]
    ts = []
    for y, m in bulan: ts += LB.titik_bulan(y, m, sid)
    z = LB.hitung_zona(ts)
    harian = Counter(t["d"] for t in ts)
    cu = LB.cuaca_lokasi(sid)
    cb = [LB.cuaca_bulan(cu, y, m) for y, m in bulan]
    hujan = sum(c["hujan"] for c in cb if c) if all(cb) else None
    harian_hj = [v for c in cb if c for v in c["harian_hujan"]]
    run = best = 0
    for v in harian_hj: run = run + 1 if v < 1 else 0; best = max(best, run)
    normal = sum((LB.cuaca_normal(cu, m)["hujan"] or 0) for y, m in bulan)
    fd = [LB.fdrs_bulan(sid, y, m) for y, m in bulan]; fd = [f for f in fd if f]
    lv = [sum(f["level"][k] for f in fd) for k in range(4)] if fd else None
    oni = ((enso or {}).get("jas") or {}).get(str(Y))
    # MODIS per bulan
    pref = {f"{y}-{m:02d}" for y, m in bulan}; ada = set(); mod = {"hd": 0.0, "desa": 0.0, "buf5": 0.0, "buf25": 0.0}
    for r in modis_butir.values():
        if r["bulan"] in pref and sid in r["zona"]:
            ada.add(r["bulan"])
            for k in mod: mod[k] += r["zona"][sid].get(k, [0])[0] * 21.4659
    terakhir = max((r["bulan"] for r in modis_butir.values()), default="")
    hilang = sorted(pref - ada)
    modis = ({k: round(v, 1) for k, v in mod.items()} | {"bulan_belum_terbit": [b for b in hilang if b > terakhir], "bulan_tidak_tersedia": [b for b in hilang if b <= terakhir]}) if ada else None
    s2 = [v for v in bekas_s2.values() if v.get("lokasi") == sid and any(str(v.get("awal", "")).startswith(f"{y}-{m:02d}") for y, m in bulan)]
    s2_ha = sum(v.get("luas_ha") or 0 for v in s2 if v.get("status") == "selesai") if any(v.get("status") == "selesai" for v in s2) else None
    return {"periode": nama_periode(rel), "mulai": f"{bulan[0][0]}-{bulan[0][1]:02d}", "akhir": f"{bulan[-1][0]}-{bulan[-1][1]:02d}",
            "titik": {"hd": z["Di dalam Hutan Desa"], "desa": z["Di wilayah desa"], "r5": z["≤ 5 km dari batas"], "r25": z["≤ 25 km (total)"]},
            "hari_tersibuk": max(harian.items(), key=lambda kv: kv[1]) if harian else None, "hari_ada_titik": len(harian),
            "per_bulan": [sum(1 for t in ts if t["d"].startswith(f"{y}-{m:02d}")) for y, m in bulan],
            "hujan_mm": round(hujan) if hujan is not None else None, "hujan_normal_mm": round(normal) if normal else None,
            "hth_terpanjang": best if harian_hj else None, "fwi_hari": lv, "oni_jas": oni,
            "fase": None if oni is None else "El Niño" if oni >= 0.5 else "La Niña" if oni <= -0.5 else "Netral",
            "modis_ha": modis, "s2_ha": round(s2_ha, 1) if s2_ha is not None else None, "_ts": ts, "_bulan": bulan}

def gambar(semua, Y):
    plt = LB._plt(); th = sorted(semua); fig, ax = plt.subplots(figsize=(7.2, 2.2), dpi=200)
    ax.bar([str(t) for t in th], [semua[t]["titik"]["r25"] for t in th], color=[MERAH if t == Y else "#9AA8A0" for t in th], width=.65)
    for i, t in enumerate(th):
        ax.text(i, semua[t]["titik"]["r25"], fmt(semua[t]["titik"]["r25"]), ha="center", va="bottom", fontsize=6.5, color=ABU)
        if semua[t]["fase"] == "El Niño": ax.text(i, 0, "EN", ha="center", va="bottom", fontsize=6, color="white", fontweight="bold")
    ax.set_ylabel("Deteksi ≤ 25 km"); ax.tick_params(axis="x", labelsize=7)
    b = io.BytesIO(); fig.tight_layout(pad=.3); fig.savefig(b, format="png"); plt.close(fig); b.seek(0); return b

def gambar_harian(R, rata_bl):
    plt = LB._plt(); fig, ax = plt.subplots(figsize=(7.2, 2.0), dpi=200)
    lb = [BLN[m][:3] for (y, m) in R["_bulan"]]; x = list(range(len(lb)))
    ax.bar([i - .2 for i in x], R["per_bulan"], width=.4, color=MERAH, label="Musim ini")
    ax.bar([i + .2 for i in x], rata_bl, width=.4, color="#F4A97F", label="Rata-rata 2016–2025")
    ax.set_xticks(x); ax.set_xticklabels(lb); ax.set_ylabel("Deteksi ≤ 25 km"); ax.legend(fontsize=6.5, frameon=False)
    b = io.BytesIO(); fig.tight_layout(pad=.3); fig.savefig(b, format="png"); plt.close(fig); b.seek(0); return b

def buat_pdf(site, Y, R, semua, rata, path):
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
    S = lambda **k: ParagraphStyle("x", fontName=k.pop("f", "DV"), fontSize=k.pop("s", 9), leading=k.pop("l", 12.5), textColor=colors.HexColor(k.pop("c", "#0E1A14")), **k)
    sJ, sH, sP, sK = S(f="DVB", s=17, l=21, c=HIJAU), S(f="DVB", s=11.5, l=15, c=HIJAU, spaceBefore=10, spaceAfter=4, keepWithNext=1), S(), S(s=7.5, l=10, c=ABU)
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=1.7 * cm, rightMargin=1.7 * cm, topMargin=1.5 * cm, bottomMargin=1.6 * cm,
                            title=f"Rekap Musim Api {site['hd_nama']} – {Y}", author="Pantau Rimbak – Yayasan PRCF Indonesia")
    W = A4[0] - 3.4 * cm
    def tabel(rows, cols, kanan=(1,)):
        t = Table(rows, colWidths=cols, repeatRows=1)
        st = [("FONT", (0, 0), (-1, -1), "DV", 8.3), ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#C9D6CD")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
              ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(HIJAU)),
              ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONT", (0, 0), (-1, 0), "DVB", 8.3)] + [("ALIGN", (c, 0), (c, -1), "RIGHT") for c in kanan]
        t.setStyle(TableStyle(st)); return t
    urut = sorted(semua, key=lambda t: -semua[t]["titik"]["r25"]); pk = urut.index(Y) + 1
    el = [Paragraph("REKAP MUSIM API · PANTAU RIMBAK", S(f="DVB", s=8, c=HIJAU2)), Paragraph(site["hd_nama"], sJ),
          Paragraph(f"Musim api {Y} ({R['periode']}) · Desa {site['desa_nama']}, Kec. {site.get('kec', '')}, Kab. Kapuas Hulu", S(c=ABU)), Spacer(1, 8)]
    kal = [f"Selama {R['periode']} {Y} tercatat <b>{fmt(R['titik']['r25'])}</b> deteksi titik panas dalam radius 25 km "
           f"(rata-rata musim 2016–2025: {fmt(rata, 1)}) – peringkat <b>{pk} dari {len(semua)}</b> musim sejak 2016. "
           f"Di dalam Hutan Desa: <b>{fmt(R['titik']['hd'])}</b>; di wilayah desa: {fmt(R['titik']['desa'])}; radius 5 km: {fmt(R['titik']['r5'])}."]
    if R["hujan_mm"] is not None and R["hujan_normal_mm"]:
        sel = (R["hujan_mm"] - R["hujan_normal_mm"]) / R["hujan_normal_mm"] * 100
        kal.append(f"Hujan {fmt(R['hujan_mm'])} mm ({'+' if sel >= 0 else ''}{fmt(sel)}% dari normal), hari tanpa hujan beruntun terpanjang {R['hth_terpanjang']} hari.")
    if R["fase"]: kal.append(f"Fase ENSO Jul–Sep: {R['fase']} (ONI " + f"{R['oni_jas']:+.1f}".replace(".", ",") + ").")
    el.append(Table([[Paragraph(" ".join(kal), S(l=13.5))]], colWidths=[W], style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F7F3")),
               ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(HIJAU2)), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])))
    el.append(Paragraph("1. Titik panas dibanding musim lain (NASA FIRMS, VIIRS & MODIS)", sH))
    el.append(Image(gambar(semua, Y), width=W, height=W * 2.2 / 7.2))
    el.append(Paragraph("EN = tahun El Niño (ONI Jul–Sep ≥ +0,5).", sK))
    M = (Jx("musim/indeks.json", {}).get("lokasi") or {}).get(site["id"]) or {}
    rata_bl = [M["bulan"][m - 1]["rata25"] for (y, m) in R["_bulan"]] if M.get("bulan") else [0] * len(R["_bulan"])
    el.append(Image(gambar_harian(R, rata_bl), width=W, height=W * 2.0 / 7.2))
    el.append(Paragraph("2. Ringkasan per musim", sH))
    sTh = S(f="DVB", s=7.6, l=9.2, c="#FFFFFF")
    rows = [[Paragraph(h, sTh) for h in ("Musim", "Titik ≤ 25 km", "Titik ≤ 5 km + desa", "Titik di Hutan Desa", "Hujan (mm)", "Kering beruntun (hari)", "ENSO", "Terbakar MODIS ≤ 25 km")]]
    for t in sorted(semua, reverse=True):
        r = semua[t]
        rows.append([str(t), fmt(r["titik"]["r25"]), fmt(r["titik"]["r5"] + r["titik"]["desa"]), fmt(r["titik"]["hd"]), fmt(r["hujan_mm"]), str(r["hth_terpanjang"] or "–"),
                     r["fase"] or "–", ((fmt(r["modis_ha"]["buf25"]) + " ha" + (" *" if r["modis_ha"]["bulan_belum_terbit"] or r["modis_ha"]["bulan_tidak_tersedia"] else "")) if r["modis_ha"] else "belum terbit")])
    el.append(tabel(rows, [1.7 * cm, 1.9 * cm, 2.1 * cm, 2 * cm, 1.8 * cm, 2 * cm, 1.8 * cm, W - 13.3 * cm], kanan=(1, 2, 3, 4, 5)))
    el.append(Paragraph("* sebagian bulan belum terbit atau tidak tersedia di arsip MODIS; angka adalah jumlah bulan yang ada.", sK))
    el.append(Paragraph("3. Cuaca, bahaya kebakaran & area terbakar musim ini", sH))
    r3 = [["Indikator", "Nilai", "Keterangan"]]
    if R["hujan_mm"] is not None: r3.append(["Curah hujan", f"{fmt(R['hujan_mm'])} mm", f"normal {fmt(R['hujan_normal_mm'])} mm (ERA5 2001–2025)"])
    if R["hth_terpanjang"] is not None: r3.append(["Hari tanpa hujan beruntun terpanjang", f"{R['hth_terpanjang']} hari", "hujan < 1 mm/hari"])
    if R["fwi_hari"]: r3.append(["Hari bahaya Tinggi / Ekstrem (FWI)", f"{R['fwi_hari'][2]} / {R['fwi_hari'][3]}", f"dari {sum(R['fwi_hari'])} hari tersedia"])
    if R["hari_tersibuk"]: r3.append(["Hari dengan deteksi terbanyak", f"{R['hari_tersibuk'][0][8:10]}/{R['hari_tersibuk'][0][5:7]}/{R['hari_tersibuk'][0][:4]}", f"{R['hari_tersibuk'][1]} deteksi ≤ 25 km"])
    if R["modis_ha"]:
        mh = R["modis_ha"]; cat = []
        if mh["bulan_belum_terbit"]: cat.append("belum terbit: " + ", ".join(BLN[int(b[5:])][:3] for b in mh["bulan_belum_terbit"]))
        if mh["bulan_tidak_tersedia"]: cat.append("tidak tersedia di arsip: " + ", ".join(BLN[int(b[5:])][:3] for b in mh["bulan_tidak_tersedia"]))
        r3.append(["Area terbakar MODIS (500 m)", f"{fmt(mh['buf25'])} ha ≤ 25 km", Paragraph(f"Hutan Desa {fmt(mh['hd'])} ha · desa {fmt(mh['desa'])} ha · ≤ 5 km {fmt(mh['buf5'])} ha" + (f" ({'; '.join(cat)})" if cat else ""), S(s=8.3, l=10.5))])
    else: r3.append(["Area terbakar MODIS (500 m)", "belum terbit", "NASA menerbitkan ±2–3 bulan setelah bulan berjalan"])
    if R["s2_ha"] is not None: r3.append(["Bekas terbakar Sentinel-2 (20 m)", f"{fmt(R['s2_ha'], 1)} ha", "dNBR, sekitar kejadian api ≤ 5 km"])
    el.append(tabel(r3, [6.3 * cm, 3.4 * cm, W - 9.7 * cm]))
    el.append(Spacer(1, 10))
    el.append(KeepTogether([Paragraph("Sumber & catatan", S(f="DVB", s=9.5, c=HIJAU2)), Paragraph(
        "Titik panas: NASA FIRMS (VIIRS & MODIS), semua tingkat keyakinan. Cuaca: ECMWF ERA5/ERA5-Land (Copernicus) via Open-Meteo. ENSO: NOAA CPC Oceanic Niño Index. "
        "Area terbakar: NASA MODIS MCD64A1 v6.1 (500 m; api kecil < ~20 ha sering tidak terpetakan). Bekas terbakar: Sentinel-2 L2A (ESA Copernicus). "
        "Periode musim mengikuti kalender musim api Pantau Rimbak (pola titik panas 2016–2025). Titik panas adalah deteksi panas satelit dan belum tentu kebakaran. "
        "Pantau Rimbak bukan sistem resmi pemerintah.", sK), Spacer(1, 4),
        Paragraph(f"Dibuat otomatis oleh Pantau Rimbak – Yayasan PRCF Indonesia, {dt.datetime.now(dt.timezone.utc):%d-%m-%Y %H.%M} UTC.", sK)]))
    def kaki(c, d):
        c.saveState(); c.setFont("DV", 7); c.setFillColor(colors.HexColor(ABU))
        c.drawString(1.7 * cm, 1 * cm, f"Pantau Rimbak · {site['hd_nama']} · Rekap Musim Api {Y}"); c.drawRightString(A4[0] - 1.7 * cm, 1 * cm, f"hlm. {d.page}"); c.restoreState()
    doc.build(el, onFirstPage=kaki, onLaterPages=kaki)

def main():
    paksa = "--paksa" in sys.argv
    sites = J("geo.json")["sites"]; musim = Jx("musim/indeks.json", {})
    modis = (Jx("bekas_modis/_olah.json", {}) or {}).get("butir", {}); enso = Jx("iklim/enso.json", {})
    s2 = (Jx("bekas_terbakar/indeks.json", {}) or {}).get("musim", {})
    ip = os.path.join(OUT, "indeks.json"); lama = Jx("rekap_musim/indeks.json", {"lokasi": {}}) or {"lokasi": {}}
    out = {"lokasi": {}}; n = 0
    for s in sites:
        sid = s["id"]; M = (musim.get("lokasi") or {}).get(sid)
        if not M: continue
        rel = periode(M)
        if not rel: continue
        semua = {}
        for Y in range(2016, KINI.year + 1):
            ya, ma = Y + rel[-1][1], rel[-1][0]
            selesai = dt.date(ya, ma, calendar.monthrange(ya, ma)[1]) + dt.timedelta(days=7)
            if selesai > KINI: continue
            semua[Y] = hitung(s, Y, rel, modis, enso, s2)
        if not semua: continue
        rata = statistics.mean(semua[t]["titik"]["r25"] for t in semua if 2016 <= t <= 2025) if any(2016 <= t <= 2025 for t in semua) else None
        L = {"nama": s["hd_nama"], "periode": nama_periode(rel), "rata_r25_2016_2025": round(rata, 1) if rata is not None else None, "musim": {}}
        urut = sorted(semua, key=lambda t: -semua[t]["titik"]["r25"])
        for Y, R in semua.items():
            d = {k: v for k, v in R.items() if not k.startswith("_")}
            d["peringkat"] = urut.index(Y) + 1; d["dari"] = len(semua)
            if Y in (sorted(semua)[-PDF_TERAKHIR:] if PDF_TERAKHIR else []):
                rel_p = f"rekap_musim/{sid}/{Y}.pdf"; p = os.path.join(DATA, rel_p)
                lm = ((lama.get("lokasi") or {}).get(sid) or {}).get("musim", {}).get(str(Y)) or {}
                sama = {k: v for k, v in lm.items() if k not in ("berkas", "kb", "sha256", "dibuat_utc")} == json.loads(json.dumps(d))
                if paksa or not os.path.exists(p) or not sama:
                    os.makedirs(os.path.dirname(p), exist_ok=True); buat_pdf(s, Y, R, semua, rata or 0, p); n += 1
                    lm = {"berkas": rel_p, "kb": round(os.path.getsize(p) / 1024), "sha256": hashlib.sha256(open(p, "rb").read()).hexdigest(),
                          "dibuat_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")}
                d.update({k: lm[k] for k in ("berkas", "kb", "sha256", "dibuat_utc") if k in lm})
            L["musim"][str(Y)] = d
        # hapus PDF lama di luar 3 musim terakhir
        dsid = os.path.join(OUT, sid)
        if os.path.isdir(dsid):
            for f in os.listdir(dsid):
                if f.endswith(".pdf") and int(f[:4]) not in (sorted(semua)[-PDF_TERAKHIR:] if PDF_TERAKHIR else []): os.remove(os.path.join(dsid, f))
        out["lokasi"][sid] = L
    out["metode"] = "Periode musim = bulan mulai bersiap s.d. 1 bulan setelah bulan musim terakhir menurut kalender musim api (pola 2016–2025). Rekap dibuat 7 hari setelah periode berakhir. Peringkat menurut deteksi titik panas ≤ 25 km."
    os.makedirs(OUT, exist_ok=True)
    bersih = lambda o: {k: v for k, v in o.items() if k != "diperbarui_utc"}
    if bersih(lama) != json.loads(json.dumps(out)) or n:
        out["diperbarui_utc"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
        with open(ip, "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"rekap musim: PDF dibuat {n}; lokasi {len(out['lokasi'])}")

if __name__ == "__main__":
    main()
