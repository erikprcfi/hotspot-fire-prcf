/* Citra satelit dasar – Fire Hotspot PRCF
 *  s2026 : Sentinel-2 L2A (ESA Copernicus) komposit MEDIAN bebas awan dari citra 6 bulan terakhir (hingga hari ini),
 *          10 m, dirender oleh Microsoft Planetary Computer (data terbuka). Selalu citra terbaru tahun berjalan.
 *  eox   : Sentinel-2 cloudless 2025 (EOX IT Services, CC BY-NC-SA 4.0), mosaik tahunan 10 m.
 *  esri  : Esri World Imagery, resolusi tinggi 30–60 cm; tanggal rekam berbeda tiap lokasi (ditampilkan).
 * Pemakaian: const C = FHCitra.leaflet(L); C.s2026.addTo(map); FHCitra.info('esri', lat, lon) → teks tanggal
 */
(function () {
'use strict';
const PC = 'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/';
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const iso = d => d.toISOString().slice(0, 10);
const store = { get(k) { try { return JSON.parse(localStorage.getItem('fh_' + k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('fh_' + k, JSON.stringify(v)); } catch (e) { } } };
function periode() { const b = new Date(), a = new Date(b.getTime() - 182 * 864e5); return [iso(a), iso(b)]; }
function periodeTxt() { const [a, b] = periode(); const A = new Date(a), B = new Date(b); return `${BLN[A.getMonth()]} ${A.getFullYear() === B.getFullYear() ? '' : A.getFullYear() + ' '}– ${BLN[B.getMonth()]} ${B.getFullYear()}`.replace('  ', ' '); }
let REG = null;
async function register() {
  const [a, b] = periode(), c = store.get('s2reg');
  if (c && c.b === b && c.id) return c.id;
  if (REG) return REG;
  REG = fetch(PC + 'register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    'filter-lang': 'cql2-json', filter: { op: 'and', args: [{ op: '=', args: [{ property: 'collection' }, 'sentinel-2-l2a'] },
      { op: 'anyinteracts', args: [{ property: 'datetime' }, { interval: [a + 'T00:00:00Z', b + 'T23:59:59Z'] }] }, { op: '<=', args: [{ property: 'eo:cloud_cover' }, 60] }] },
    sortby: [{ field: 'eo:cloud_cover', direction: 'asc' }] }) })
    .then(r => r.json()).then(j => { const id = j.searchid || j.id; store.set('s2reg', { id, b }); return id; }).finally(() => { REG = null; });
  return REG;
}
const s2url = id => `${PC}${id}/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?collection=sentinel-2-l2a&assets=visual&nodata=0&format=png&pixel_selection=median&items_limit=12`;
const EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTR = {
  s2026: () => `Sentinel-2 komposit ${periodeTxt()} · ESA Copernicus · Microsoft Planetary Computer`,
  eox: 'Sentinel-2 cloudless 2025 · EOX IT Services (CC BY-NC-SA 4.0) · Copernicus',
  esri: 'Esri World Imagery · Maxar, Earthstar Geographics',
};
function leaflet(L) {
  const o = { updateWhenZooming: false, keepBuffer: 3 };
  const s2 = L.tileLayer('', { ...o, maxNativeZoom: 15, maxZoom: 18, attribution: ATTR.s2026(), className: 'fh-s2' });
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  s2.getTileUrl = function (c) { if (!this._url || c.z % 1 !== 0) return BLANK; return L.TileLayer.prototype.getTileUrl.call(this, c); };  // hindari permintaan zoom pecahan / sebelum siap
  register().then(id => s2.setUrl(s2url(id))).catch(() => s2.fire('fh-gagal'));
  return {
    s2026: s2,
    eox: L.tileLayer(EOX, { ...o, maxNativeZoom: 15, maxZoom: 18, attribution: ATTR.eox }),
    esri: L.tileLayer(ESRI, { ...o, maxZoom: 18, attribution: ATTR.esri }),
  };
}
async function maplibreSources() { const id = await register().catch(() => null);
  return { s2026: id ? { type: 'raster', tiles: [s2url(id)], tileSize: 256, maxzoom: 15, attribution: ATTR.s2026() } : null,
    eox: { type: 'raster', tiles: [EOX], tileSize: 256, maxzoom: 15, attribution: ATTR.eox }, esri: { type: 'raster', tiles: [ESRI], tileSize: 256, maxzoom: 18, attribution: ATTR.esri } }; }
const cache = {};
async function esriDate(lat, lon) { // tanggal rekam citra Esri di titik (dari layanan metadata Esri)
  const k = lat.toFixed(2) + ',' + lon.toFixed(2); if (k in cache) return cache[k];
  try { const d = .01, u = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=2&mapExtent=${lon - d},${lat - d},${lon + d},${lat + d}&imageDisplay=400,400,96&returnGeometry=false&f=json`;
    const j = await (await fetch(u)).json(); let best = null;
    for (const r of j.results || []) { const s = r.attributes && (r.attributes.SRC_DATE2 || r.attributes.SRC_DATE); if (s && s !== 'Null') { const m = /^(\d+)\/(\d+)\/(\d{4})/.exec(s); if (m) { const t = new Date(+m[3], +m[1] - 1, +m[2]); if (!best || t > best) best = t; } } }
    return (cache[k] = best ? `${best.getDate()} ${BLN[best.getMonth()]} ${best.getFullYear()}` : null);
  } catch (e) { return (cache[k] = null); }
}
async function info(kind, lat, lon) {
  if (kind === 's2026') return `Sentinel-2 10 m · komposit bebas awan ${periodeTxt()}`;
  if (kind === 'eox') return 'Sentinel-2 10 m · mosaik bebas awan 2025';
  if (kind === 'esri') { const d = await esriDate(lat, lon); return `Esri resolusi tinggi · direkam ${d || 'tanggal tidak tersedia'}`; }
  return '';
}
window.FHCitra = { leaflet, maplibreSources, info, esriDate, periodeTxt, register };
})();
