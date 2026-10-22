"""Sekali jalan: memasukkan arsip tahunan NASA FIRMS (sudah diunduh & disaring ke kotak Kapuas Hulu)
ke basis data, beserta jejak auditnya. Pemakaian: python scripts/backfill_arsip.py <folder_hasil_unduh>"""
import sys, os, csv, json, glob
sys.argv=[sys.argv[0]]+sys.argv[1:]
src=sys.argv[1]
import importlib.util
spec=importlib.util.spec_from_file_location("pl",os.path.join(os.path.dirname(__file__),"pipeline.py")); pl=importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
recs=pl.load_archive()
prov=json.load(open(os.path.join(src,"provenance_backfill.json")))
SPMAP={v["sp"]:k for k,v in pl.SENSORS.items()}
idx_f=os.path.join(pl.PROV,"arsip_tahunan_index.json"); idx=json.load(open(idx_f)) if os.path.exists(idx_f) else {}
for p in prov:
    s=p["url"].split("/country/")[1].split("/")[0]; y=p["url"].split("/")[-2]; sid=SPMAP[s]
    fn=os.path.join(src,f"{s}_{y}_kapuashulu.csv")
    rows=list(csv.DictReader(open(fn))) if os.path.exists(fn) else []
    for r in rows:
        nr=pl.make_record(r,sid,"SP"); nr["diunduh_utc"]=p["waktu_unduh_utc"]; recs[nr["uid"]]=nr
    st,ln,lm=pl.head(p["url"])
    idx[p["url"]]={"kunci":f"{ln}|{lm}","sha256":p["sha256"],"baris_di_kotak":len(rows),"diunduh_utc":p["waktu_unduh_utc"]}
    p.update(jenis="Arsip tahunan",sensor=sid,tahun=int(y),last_modified=lm,doi=pl.SENSORS[sid]["doi"])
json.dump(idx,open(idx_f,"w"),indent=1)
json.dump(prov,open(os.path.join(pl.PROV,"arsip_tahunan_unduhan_awal.json"),"w"),indent=1)
pl.save_archive(recs)
print(len(recs),"catatan")
