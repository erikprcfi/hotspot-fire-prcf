"""
Data Model SMART (ekspor XML SMART Desktop: Conservation Area → Data Model → Export) → JSON untuk menu Patroli (SMART) di aplikasi
==================================================================================================================================
Menyalin apa adanya: kunci & nama kategori (berjenjang), atribut (TEXT / NUMERIC / LIST / TREE / BOOLEAN / DATE), nilai daftar & pohon,
serta status aktif. Tidak ada jenis/temuan yang ditambahkan di luar Data Model.
Pemakaian: python scripts/smart_dm.py <DataModel.xml> <id_lokasi>   → data/smart/<id_lokasi>_dm.json
"""
import sys, os, json, datetime, hashlib
import xml.etree.ElementTree as ET
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main(src, lok):
    raw = open(src, "rb").read(); r = ET.fromstring(raw)
    ns = r.tag[1:].split("}")[0] if r.tag.startswith("{") else ""
    q = lambda t: f"{{{ns}}}{t}" if ns else t
    nama = lambda e: " ".join((e.find(q("names")).get("value") if e.find(q("names")) is not None else e.get("key")).split())
    aktif = lambda e: e.get("isactive", "true") != "false"
    atr = {}
    for a in r.find(q("attributes")).findall(q("attribute")):
        d = {"nama": nama(a), "tipe": a.get("type"), "wajib": a.get("isrequired") == "true"}
        if a.get("type") == "LIST":
            d["item"] = [{"key": v.get("key"), "nama": nama(v)} for v in a.findall(q("values")) if aktif(v)]
        if a.get("type") == "TREE":
            def pohon(e):
                out = []
                for c in e:
                    if c.tag in (q("tree"), q("children")) and aktif(c):
                        n = {"key": c.get("key"), "nama": nama(c)}; anak = pohon(c)
                        if anak: n["anak"] = anak
                        out.append(n)
                return out
            d["pohon"] = pohon(a)
        atr[a.get("key")] = d
    kat = []
    def jalan(e, jalur, induk):
        for c in e.findall(q("category")):
            if not aktif(c): continue
            j = jalur + [c.get("key")]; sub = [x for x in c.findall(q("category")) if aktif(x)]
            kat.append({"key": ".".join(j), "nama": nama(c), "induk": induk, "akar": j[0], "daun": not sub,
                        "atribut": [x.get("attributekey") for x in c.findall(q("attribute")) if aktif(x) and x.get("attributekey") in atr]})
            jalan(c, j, nama(c))
    jalan(r.find(q("categories")), [], None)
    out = {"lokasi": lok, "nama": f"Data Model SMART {os.path.basename(src)}", "bahasa": [l.get("code") for l in r.iter(q("language"))],
           "sha1_xml": hashlib.sha1(raw).hexdigest(), "dibuat_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "kategori": kat, "atribut": atr}
    os.makedirs(os.path.join(ROOT, "data", "smart"), exist_ok=True)
    p = os.path.join(ROOT, "data", "smart", f"{lok}_dm.json"); json.dump(out, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    n = lambda P: sum(1 + n(x.get("anak", [])) for x in P)
    print(p, len(kat), "kategori;", {k: (v["tipe"], len(v.get("item", [])) or n(v.get("pohon", []))) for k, v in atr.items()})

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
