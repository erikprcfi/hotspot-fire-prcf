"""
Uji otomatis perhitungan emisi karbon FREL – Fire Hotspot PRCF
==============================================================
1. RUMUS: rumus sheet Awal & Manfaat (ditulis ulang di sini secara independen) dibandingkan dengan nilai hasil Excel
   templat "PERHITUNGAN KARBON" PRCF (scripts/uji/templat_karbon_prcf.json, nilai terhitung dari file Excel aslinya).
2. RUMUS APLIKASI: assets/karbon.js (yang dipakai website/aplikasi & ekspor Excel) diuji terhadap templat yang sama (butuh node).
3. DATA: tiap data/analisis/<lokasi>_hd.json → emisi_frel: luas kelas tidak negatif & tidak melebihi luas area;
   degradasi + deforestasi + bukan hutan = kehilangan tutupan pohon Hansen per tahun; periode_2020_2025 sama dengan
   hasil hitung ulang dari data dasar; kepadatan karbon = FREL 2022 × 0,47.
Gagal → keluar dengan kode 1 (alur kerja GitHub berhenti, data tidak disimpan).
"""
import os, sys, json, glob, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = {"hlk_primer": 420.41, "hlk_sekunder": 287.55, "hr_primer": 347.81, "hr_sekunder": 263.17, "plk_semak": 77.56, "belukar_rawa": 23.91}
C = {k: v * 0.47 for k, v in BASE.items()}; KC = 44 / 12
gagal = []
def cek(nama, a, b, tol=1e-6):
    b = 0 if b is None else b
    if abs(a - b) > tol * max(1, abs(b)): gagal.append(f"{nama}: {a} ≠ {b}")

def hd(rows, n, proj, eff=.9, leak=.05, buf=.135):
    I = [C["hlk_primer"] - C["plk_semak"], C["hlk_sekunder"] - C["plk_semak"], C["hr_primer"] - C["belukar_rawa"], C["hr_sekunder"] - C["belukar_rawa"]]
    J = [C["hlk_primer"] - C["hlk_sekunder"], 0, C["hr_primer"] - C["hr_sekunder"], 0]; out = []
    for j, r in enumerate(rows):
        Cend = r["D"] - r["E"] - r["F"] + (rows[j - 1]["F"] if j in (1, 3) else 0)
        out.append({"C": Cend, "G": 0 if r["D"] == 0 else r["E"] / (r["D"] * n), "K": r["E"] * I[j] + r["F"] * J[j]})
    d3 = sum(x["K"] for x in out) * KC; d4 = d3 * (1 - eff); d5 = (d3 - d4) * leak; d6 = d3 - d4 - d5; d7 = d6 * buf; d8 = d6 - d7
    m = {"d3": d3, "c3": d3 * proj, "d4": d4, "c4": d4 * proj, "d5": d5, "c5": d5 * proj, "d6": d6, "c6": d6 * proj, "d7": d7, "c7": d7 * proj, "d8": d8, "c8": d8 * proj,
         "c11": sum(x["C"] for x in out) * eff, "d12": sum(r["E"] for r in rows) * (eff - leak), "d13": sum(r["F"] for r in rows) * (eff - leak)}
    m["c12"] = m["d12"] * proj; m["c13"] = m["d13"] * proj
    return out, m

# 1. rumus vs templat Excel PRCF
T = json.load(open(os.path.join(ROOT, "scripts", "uji", "templat_karbon_prcf.json")))
cols = "CDEFGHIJKL"; Ktot = 0; Ctot = 0; Etot = 0; Ftot = 0
for i, h in enumerate(T["hd"]):
    rows = [{"D": r["D"], "E": r["E"], "F": r["F"]} for r in h["rows"]]; out, m = hd(rows, 6, 6)
    for j, x in enumerate(out): cek(f"HD{i} C{j}", x["C"], h["rows"][j]["C"]); cek(f"HD{i} K{j}", x["K"], h["rows"][j]["K"]); cek(f"HD{i} G{j}", x["G"], h["rows"][j]["G"])
    c, d = cols[2 * i], cols[2 * i + 1]
    for r in (3, 4, 5, 6, 7, 8): cek(f"Manfaat {c}{r}", m[f"c{r}"], T["man"][f"{c}{r}"]); cek(f"Manfaat {d}{r}", m[f"d{r}"], T["man"][f"{d}{r}"])
    cek(f"Manfaat {c}11", m["c11"], T["man"][f"{c}11"])
    for r in (12, 13): cek(f"Manfaat {c}{r}", m[f"c{r}"], T["man"][f"{c}{r}"]); cek(f"Manfaat {d}{r}", m[f"d{r}"], T["man"][f"{d}{r}"])
    Ktot += sum(x["K"] for x in out)
m3 = 6 * KC * Ktot; cek("Manfaat M3", m3, T["man"]["M3"]); cek("Manfaat N3", m3 / 6, T["man"]["N3"])
print(f"1. Rumus vs templat Excel PRCF: {'LULUS' if not gagal else 'GAGAL'}")

# 2. assets/karbon.js vs templat
n0 = len(gagal)
js = r"""
global.window={};global.document={getElementById:()=>1,head:{appendChild(){}},createElement:()=>({})};
require(process.argv[1]+'/assets/karbon.js');const K=window.FHKarbon,T=require(process.argv[1]+'/scripts/uji/templat_karbon_prcf.json'),P=K.param({y0:2020,y1:2025,eff:.9,leak:.05,buf:.135});
let bad=[];const cmp=(n,a,b)=>{b=b==null?0:b;if(Math.abs(a-b)>1e-6*Math.max(1,Math.abs(b)))bad.push(n+': '+a+' vs '+b);};
const H=T.hd.map(h=>K.hitungHD({rows:h.rows.map(r=>({D:r.D,E:r.E,F:r.F}))},P));
H.forEach((h,i)=>h.r.forEach((x,j)=>{cmp(`C${i}${j}`,x.C,T.hd[i].rows[j].C);cmp(`K${i}${j}`,x.K,T.hd[i].rows[j].K);}));
const cs='CDEFGHIJKL';H.forEach((h,i)=>{const c=cs[2*i],d=cs[2*i+1];[3,4,5,6,7,8].forEach(r=>{cmp(c+r,h.m['c'+r],T.man[c+r]);cmp(d+r,h.m['d'+r],T.man[d+r]);});cmp(c+11,h.m.c11,T.man[c+11]);});
const t=K.total(H,P);[3,4,5,6,7,8].forEach(r=>{cmp('M'+r,t['m'+r],T.man['M'+r]);cmp('N'+r,t['n'+r],T.man['N'+r]);});cmp('M11',t.m11,T.man.M11);
H[0].ha.forEach((v,j)=>v.forEach((x,k)=>cmp(`ha${j}${k}`,x,T.ha[j][k])));console.log(JSON.stringify(bad));
"""
try:
    r = subprocess.run(["node", "-e", js, ROOT], capture_output=True, text=True, timeout=60)
    bad = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else ["node error: " + r.stderr[:300]]
    gagal += ["karbon.js " + b for b in bad]
    print(f"2. Rumus aplikasi (assets/karbon.js) vs templat: {'LULUS' if len(gagal) == n0 else 'GAGAL'}")
except FileNotFoundError:
    print("2. node tidak tersedia – dilewati")

# 3. konsistensi data
n0 = len(gagal); nfile = 0
for f in sorted(glob.glob(os.path.join(ROOT, "data", "analisis", "*_hd.json"))):
    R = json.load(open(f)); F = R.get("emisi_frel"); nm = os.path.basename(f)
    if not F: gagal.append(f"{nm}: emisi_frel tidak ada"); continue
    nfile += 1
    for k, v in F["kepadatan_karbon_tC_ha"].items(): cek(f"{nm} kepadatan {k}", v["tC_ha"], round(BASE[k] * 0.47, 4), 1e-3)
    loss = R["hutan"]["kehilangan_per_tahun_ha"]
    for t, B in list(F["dasar"].items()) + list((F.get("dasar_glclu") or {}).items()):
        if any(x < -1e-6 for x in B["luas_ha"]): gagal.append(f"{nm} {t}: luas negatif")
        if sum(B["luas_ha"]) > R["luas_ha"] * 1.001 + 0.5: gagal.append(f"{nm} {t}: luas kelas hutan {sum(B['luas_ha'])} > luas area {R['luas_ha']}")
        for y, v in B["hilang_ha"].items(): cek(f"{nm} {t} kehilangan {y}", sum(v), loss.get(y, 0), 0.02)
        for y, v in loss.items():
            if v > 0.01 and y not in B["hilang_ha"]: gagal.append(f"{nm} {t}: kehilangan {y} ({v} ha) tidak terbagi ke kelas")
    # periode 2020–2025 dihitung ulang dari data dasar
    kl = F.get("sumber_kelas") == "KLHK"; DS = F["dasar"]; c = sorted(t for t in map(int, DS) if (t <= 2020 if kl else t <= 2019))
    if kl and not c and F.get("dasar_glclu"): DS = F["dasar_glclu"]; c = sorted(t for t in map(int, DS) if t <= 2019)
    e = c[-1] if c else sorted(map(int, DS))[0]; B = DS[str(e)]
    L = lambda j, y: (B["hilang_ha"].get(str(y)) or [0] * 5)[j]
    E = [sum(L(j, y) for y in range(2020, 2026)) for j in range(5)]
    em = (E[1] * (C["hlk_sekunder"] - C["plk_semak"]) + E[3] * (C["hr_sekunder"] - C["belukar_rawa"]) + E[0] * (C["hlk_primer"] - C["hlk_sekunder"]) + E[2] * (C["hr_primer"] - C["hr_sekunder"])) * KC
    P = F["periode_2020_2025"]; cek(f"{nm} emisi 2020–2025", em, P["emisi_tCO2e"], 1e-3); cek(f"{nm} deforestasi 2020–2025", E[1] + E[3], P["deforestasi_ha"], 1e-3); cek(f"{nm} degradasi 2020–2025", E[0] + E[2], P["degradasi_ha"], 1e-3)
    print(f"   {nm}: kelas {F.get('sumber_kelas')} · 2020–2025 deforestasi {P['deforestasi_ha']:.2f} ha, degradasi {P['degradasi_ha']:.2f} ha, emisi {P['emisi_tCO2e']:.1f} tCO2e")
print(f"3. Konsistensi data {nfile} Hutan Desa: {'LULUS' if len(gagal) == n0 else 'GAGAL'}")

# 4. model tutupan lahan tahunan KLHK (acuan PL 2020 + citra tiap tahun): Python independen vs assets/model_klhk.js + assets/karbon.js
n0 = len(gagal)
KE = {2001: 2002, 2002: 20092, 2005: 20051, 20051: 20071}; HUT = {2001, 2002, 2004, 20041, 2005, 20051, 2006}; BAS = {20071, 50011, 5001, 20094}
pre = lambda c: None if c in HUT else (20051 if c in BAS else 2002)
CIf = os.path.join(ROOT, "data", "analisis", "citra_tahun_berjalan.json"); CI = json.load(open(CIf)) if os.path.exists(CIf) else {}
def model(F, ci):
    t = max(map(int, F["tutupan_klhk_ha"])); base = {int(k): v for k, v in F["tutupan_klhk_ha"][str(t)].items()}; H = F["hilang_kode_ha"][str(t)]
    yc = CI.get("tahun") if ci and ci.get("status") == "selesai" and CI.get("tahun", 0) > 2025 else None
    loss = lambda y: {int(k): v for k, v in ((ci or {}).get("hilang_kode_ha", {}) if y == yc else H.get(str(y), {})).items()}
    def kondisi(Y):
        a = dict(base)
        if Y >= t:
            for y in range(t, Y + 1):
                for c, v in loss(y).items():
                    if c in KE: a[c] = a.get(c, 0) - v; a[KE[c]] = a.get(KE[c], 0) + v
        else:
            for y in range(Y + 1, t):
                for c, v in loss(y).items():
                    p = pre(c)
                    if p: a[c] = a.get(c, 0) - v; a[p] = a.get(p, 0) + v
        return a
    def awal(y0, y1):
        k0 = kondisi(y0 - 1); D = [max(0, k0.get(c, 0)) for c in (2001, 2002, 2005, 20051)]; E = [0] * 4
        for y in range(y0, y1 + 1):
            for c, v in loss(y).items():
                d = c if (y >= t and c in KE) else (pre(c) if y < t else None)
                if d in (2001, 2002, 2005, 20051): E[[2001, 2002, 2005, 20051].index(d)] += v
        return [{"D": D[0], "E": 0, "F": E[0]}, {"D": D[1], "E": E[1], "F": 0}, {"D": D[2], "E": 0, "F": E[2]}, {"D": D[3], "E": E[3], "F": 0}]
    return t, yc or 2025, kondisi, awal
PER = [(2020, 2025), (2001, 2025), (2017, 2017), (2015, 2022), (2025, 2025)]
hasilpy = {}
for f in sorted(glob.glob(os.path.join(ROOT, "data", "analisis", "*_hd.json"))):
    R = json.load(open(f)); F = R["emisi_frel"]; nm = os.path.basename(f); lok = nm.replace("_hd.json", "")
    if not F.get("hilang_kode_ha"): gagal.append(f"{nm}: hilang_kode_ha tidak ada"); continue
    ci = (CI.get("lokasi") or {}).get(lok); t, ymax, kondisi, awal = model(F, ci)
    for Y in range(2000, ymax + 1):
        k = kondisi(Y); cek(f"{nm} jumlah kelas akhir {Y} = luas", sum(k.values()), sum(F["tutupan_klhk_ha"][str(t)].values()), 1e-6)
        if any(v < -1e-6 for v in k.values()): gagal.append(f"{nm} {Y}: luas kelas negatif")
    for c, v in F["tutupan_klhk_ha"][str(t)].items(): cek(f"{nm} kondisi awal {t} = peta KLHK kode {c}", kondisi(t - 1).get(int(c), 0), v)
    for y, d in F["hilang_kode_ha"][str(t)].items(): cek(f"{nm} kehilangan per kode {y} = Hansen", sum(d.values()), R["hutan"]["kehilangan_per_tahun_ha"].get(y, 0), 0.02)
    per = PER + ([(ymax, ymax), (2020, ymax)] if ymax > 2025 else [])
    for y0, y1 in per:
        rows = awal(y0, y1); _, m = hd(rows, y1 - y0 + 1, y1 - y0 + 1); hasilpy[f"{lok}|{y0}|{y1}"] = m["d3"]
        k1 = kondisi(y1); cek(f"{nm} {y0}-{y1} luas akhir HLK sekunder", rows[1]["D"] - rows[1]["E"] + rows[0]["F"], max(0, k1.get(2002, 0)), 1e-6)
js2 = r"""
global.window={};global.document={getElementById:()=>1,head:{appendChild(){}},createElement:()=>({})};const fs=require('fs'),R0=process.argv[1];
require(R0+'/assets/model_klhk.js');require(R0+'/assets/karbon.js');const K=window.FHKarbon,CI=fs.existsSync(R0+'/data/analisis/citra_tahun_berjalan.json')?JSON.parse(fs.readFileSync(R0+'/data/analisis/citra_tahun_berjalan.json')):{};
const out={};for(const k of JSON.parse(process.argv[2])){const[l,a,b]=k.split('|');const R=JSON.parse(fs.readFileSync(R0+'/data/analisis/'+l+'_hd.json'));const A=K.awalHD(R,+a,+b,(CI.lokasi||{})[l]);const P=K.param({y0:+a,y1:+b,eff:.9,leak:.05,buf:.135});out[k]=K.hitungHD(A,P).m.d3;}console.log(JSON.stringify(out));
"""
try:
    r = subprocess.run(["node", "-e", js2, ROOT, json.dumps(list(hasilpy))], capture_output=True, text=True, timeout=120)
    J = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else {}
    if r.returncode: gagal.append("node: " + r.stderr[:300])
    for k, v in hasilpy.items(): cek(f"emisi {k} Python vs aplikasi", J.get(k, -1), v, 1e-9)
except FileNotFoundError: pass
print(f"4. Model tutupan lahan tahunan KLHK + emisi per periode ({len(hasilpy)} kombinasi lokasi×periode): {'LULUS' if len(gagal) == n0 else 'GAGAL'}")
if gagal:
    print("\n".join(gagal[:50])); sys.exit(1)
print("SEMUA UJI LULUS")
