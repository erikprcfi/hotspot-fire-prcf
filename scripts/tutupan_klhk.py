"""
Peta Penutupan Lahan RESMI KLHK (skala 1:250.000) untuk perhitungan emisi karbon FREL – Fire Hotspot PRCF
==========================================================================================================
Mengambil poligon penutupan lahan KLHK langsung dari layanan peta resmi Kementerian LHK (Geoportal KLHK / SIGAP,
ArcGIS REST "Time_Series"), dipotong pada kotak sekitar setiap Hutan Desa (+ 1 km), untuk semua tahun yang tersedia.
Kelas memakai kode baku KLHK (mis. 2001 Hutan Lahan Kering Primer, 2002 Sekunder, 2005 Hutan Rawa Primer, 20051 Sekunder,
20092 Pertanian Lahan Kering Campur Semak, 20071 Belukar Rawa, ...).

Keluaran:
  data/klhk/<lokasi>_<tahun>.geojson   (poligon terpotong, properti: kode, kelas)
  data/klhk/indeks.json               (layanan sumber, tahun tersedia, jumlah poligon, waktu unduh)
Pemakaian:  python scripts/tutupan_klhk.py          (dipanggil otomatis oleh .github/workflows/karbon.yml)
            fungsi ambil(bbox, tahun) juga dipakai analisis SHP unggahan pengguna.
"""
import os, re, sys, json, time, datetime, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "klhk")
BASES = ["https://geoportal.menlhk.go.id/server/rest/services", "https://sigap.menlhk.go.id/server/rest/services"]
UA = {"User-Agent": "FireHotspot-PRCF/1.0 (+https://erikprcfi.github.io/hotspot-fire-prcf/)"}
KODE = {2001: "Hutan Lahan Kering Primer", 2002: "Hutan Lahan Kering Sekunder", 2004: "Hutan Mangrove Primer", 20041: "Hutan Mangrove Sekunder",
        2005: "Hutan Rawa Primer", 20051: "Hutan Rawa Sekunder", 2006: "Hutan Tanaman", 2007: "Semak Belukar", 20071: "Belukar Rawa",
        2010: "Perkebunan", 2012: "Permukiman", 20121: "Bandara / Pelabuhan", 20122: "Transmigrasi", 2014: "Tanah Terbuka", 20141: "Pertambangan",
        20091: "Pertanian Lahan Kering", 20092: "Pertanian Lahan Kering Campur Semak", 20093: "Sawah", 20094: "Tambak", 3000: "Savana / Padang Rumput",
        5001: "Tubuh Air", 50011: "Rawa", 2500: "Awan", 5003: "Laut"}

def get(url, tries=4, timeout=90):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            err = e; time.sleep(3 * (k + 1))
    raise RuntimeError(f"gagal {url[:140]}: {err}")

def cari_layanan():
    """→ {tahun: url_layer} dari direktori layanan resmi KLHK (folder Time_Series dan sejenisnya)."""
    hasil = {}
    for base in BASES:
        try: root = get(base + "?f=json", tries=2, timeout=60)
        except Exception as e: print("  tidak terjangkau:", base, e); continue
        folders = [f for f in root.get("folders", []) if re.search(r"time|series|pl|tutupan|penutupan|sigap|klhk", f, re.I)] or root.get("folders", [])
        svcs = list(root.get("services", []))
        for f in folders:
            try: svcs += get(f"{base}/{f}?f=json", tries=2, timeout=60).get("services", [])
            except Exception: pass
        for s in svcs:
            nm, tp = s.get("name", ""), s.get("type", "")
            if tp not in ("MapServer", "FeatureServer"): continue
            last = nm.split("/")[-1]
            m = re.match(r"^(?:PL|Penutupan_?Lahan|Tutupan_?Lahan|PL_TS)_?(\d{4})$", last, re.I)
            if not m: continue
            y = int(m.group(1))
            if y < 1990 or y > 2100 or y in hasil: continue
            try:
                info = get(f"{base}/{nm}/{tp}?f=json", tries=2, timeout=60)
                lyr = next((l for l in info.get("layers", []) if not l.get("subLayerIds")), None)
                if lyr is None: continue
                hasil[y] = f"{base}/{nm}/{tp}/{lyr['id']}"
            except Exception as e: print("  lewati", nm, e)
        if hasil: break
    return dict(sorted(hasil.items()))

def _kode(props):
    for k, v in props.items():
        if re.match(r"^(PL\d{2,4}_ID|ID_PL\d*|KODE_PL|PL_ID|KODE|kode|gridcode|GRIDCODE)$", k, re.I):
            try:
                c = int(float(v))
                if c in KODE: return c
            except Exception: pass
    for v in props.values():   # cadangan: nilai bilangan yang termasuk kode baku KLHK
        try:
            c = int(float(v))
            if c in KODE: return c
        except Exception: pass
    return None

def _esri2geo(g):
    rings = g.get("rings") or []
    return {"type": "Polygon", "coordinates": rings} if len(rings) == 1 else {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}

def ambil(url, bbox):
    """Semua poligon yang berpotongan dengan bbox (lon0, lat0, lon1, lat1), WGS84, dengan paginasi."""
    feats, off = [], 0
    while True:
        q = {"where": "1=1", "geometry": ",".join(f"{v:.6f}" for v in bbox), "geometryType": "esriGeometryEnvelope", "inSR": "4326", "outSR": "4326",
             "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "returnGeometry": "true", "f": "json", "resultOffset": off, "resultRecordCount": 1000}
        j = get(url + "/query?" + urllib.parse.urlencode(q), timeout=180)
        if "error" in j: raise RuntimeError(j["error"])
        fs = j.get("features", [])
        for f in fs:
            c = _kode(f.get("attributes", {}))
            if c is None or not f.get("geometry"): continue
            feats.append({"type": "Feature", "properties": {"kode": c, "kelas": KODE[c]}, "geometry": _esri2geo(f["geometry"])})
        if not j.get("exceededTransferLimit") or not fs: break
        off += len(fs)
    return feats

def potong(feats, geom):
    from shapely.geometry import shape, mapping
    out = []
    for f in feats:
        try:
            g = shape(f["geometry"]).buffer(0).intersection(geom)
            if not g.is_empty and g.area > 0: out.append({"type": "Feature", "properties": f["properties"], "geometry": mapping(g)})
        except Exception: pass
    return out

def main():
    from shapely.geometry import shape, box
    from shapely.ops import unary_union
    os.makedirs(OUT, exist_ok=True)
    L = cari_layanan()
    print("Layanan penutupan lahan KLHK ditemukan:", {k: v.split('/services/')[-1] for k, v in L.items()})
    if not L:
        print("PERINGATAN: layanan KLHK tidak terjangkau / tidak ditemukan – data lama (bila ada) dipertahankan."); return 0
    geo = json.load(open(os.path.join(ROOT, "data", "geo.json"))); idx = {"sumber": "Peta Penutupan Lahan KLHK (Direktorat IPSDH, Ditjen PKTL), skala 1:250.000 – layanan resmi " + BASES[0],
        "diunduh_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "layanan": {str(k): v for k, v in L.items()}, "lokasi": {}}
    for s in geo["sites"]:
        hd = unary_union([shape(f["geometry"]) for f in s["hd"]["features"]]).buffer(0)
        x0, y0, x1, y1 = hd.bounds; d = 0.01; bb = (x0 - d, y0 - d, x1 + d, y1 + d); area = box(*bb)
        idx["lokasi"][s["id"]] = {}
        for y, url in L.items():
            try:
                F = potong(ambil(url, bb), area)
                if not F: continue
                json.dump({"type": "FeatureCollection", "tahun": y, "sumber": url, "features": F}, open(os.path.join(OUT, f"{s['id']}_{y}.geojson"), "w"), separators=(",", ":"))
                idx["lokasi"][s["id"]][str(y)] = len(F); print(" ", s["id"], y, len(F), "poligon")
            except Exception as e: print("  gagal", s["id"], y, e)
    json.dump(idx, open(os.path.join(OUT, "indeks.json"), "w"), ensure_ascii=False, indent=1)
    return 0

if __name__ == "__main__":
    sys.exit(main())
