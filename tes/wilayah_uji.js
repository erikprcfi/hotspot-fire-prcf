// Wilayah uji sintetis (bukan data pengguna): beberapa bentuk di berbagai pulau, termasuk multipoligon & berlubang.
const kotak=(lat,lon,d)=>[[lon-d,lat-d],[lon+d,lat-d],[lon+d,lat+d],[lon-d,lat+d],[lon-d,lat-d]];
const fc=(geoms)=>JSON.stringify({type:'FeatureCollection',features:geoms.map(g=>({type:'Feature',properties:{},geometry:g}))});
module.exports={
 Riau:fc([{type:'Polygon',coordinates:[kotak(0.25,102.05,0.06)]}]),
 Kalteng_berlubang:fc([{type:'Polygon',coordinates:[kotak(-2.2,113.9,0.08),kotak(-2.2,113.9,0.02).reverse()]}]),
 Sumsel_multi:fc([{type:'MultiPolygon',coordinates:[[kotak(-3.3,104.6,0.03)],[kotak(-3.2,104.75,0.025)]]}]),
 Papua:fc([{type:'Polygon',coordinates:[kotak(-3.6,138.6,0.05)]}]),
};
