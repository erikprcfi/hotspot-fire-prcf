// Uji khusus aplikasi asli (APK): sinyal bagus / tanpa sinyal / sinyal lemah / baru dipasang tanpa sinyal / pembaruan otomatis.
// Pakai: node tes/uji_asli.js (isi APK disajikan di http://localhost:8800 dari aplikasi-android/www)
// Uji isi APK (www) di Chromium dengan Capacitor tiruan: data dari server, tanpa sinyal, sinyal lemah, pembaruan otomatis, tanpa CDN
const {chromium,devices}=require('playwright');const fs=require('fs'),path=require('path');
const REPO=process.env.REPO||require('path').resolve(__dirname,'..'),BASIS='https://erikprcfi.github.io/hotspot-fire-prcf/';
let SIN='bagus',TERBARU={versi:'209901010000',url:'aplikasi/paket/pantau-rimbak-209901010000.zip',sha256:'ab'.repeat(32)};const ok=[],bad=[];const T=(c,m)=>(c?ok:bad).push(m);
const ext=[];
(async()=>{const b=await chromium.launch();
async function konteks(){const c=await b.newContext({...devices['Pixel 5']});
 await c.addInitScript(()=>{try{localStorage.setItem('fh_panduan_v1','1');localStorage.setItem('pr_tamu','1')}catch(e){}
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android',Plugins:{App:{addListener(n,f){(window.__ls=window.__ls||{})[n]=f;return {remove(){}}},minimizeApp(){window.__min=1}},
   CapacitorUpdater:{notifyAppReady(){window.__ready=(window.__ready||0)+1;return Promise.resolve()},list:async()=>({bundles:[]}),download:async o=>{window.__dl=o;if(!o.checksum||!/^[0-9a-f]{64}$/.test(o.checksum))throw new Error('Checksum required');if(!/^https:\/\//.test(o.url))throw new Error('https required');return {id:'b1',version:o.version}},next:async o=>{window.__next=o}},
   Perangkat:{status:async()=>({kode:3,versi:'2.0.0'})}}};});
 await c.route('**/*',async r=>{const u=r.request().url();
  if(u.startsWith('http://localhost:8800/'))return r.continue();
  if(u.startsWith(BASIS)){if(SIN==='mati')return r.abort('internetdisconnected');
    const p=u.slice(BASIS.length).split('?')[0];
    if(p==='aplikasi/paket/terbaru.json')return r.fulfill({contentType:'application/json',body:JSON.stringify(TERBARU)});
    const f=path.join(REPO,p);if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
    if(SIN==='lemah')await new Promise(x=>setTimeout(x,60000));
    return r.fulfill({body:fs.readFileSync(f),contentType:p.endsWith('.json')?'application/json':p.endsWith('.png')?'image/png':'application/octet-stream'});}
  ext.push(u.split('?')[0].slice(0,90));
  if(SIN!=='bagus')return r.abort('internetdisconnected');
  if(/cdnjs|jsdelivr|unpkg|fonts\.googleapis|fonts\.gstatic/.test(u))return r.abort();
  return r.continue();});
 return c;}
const E=[];
async function buka(c,label){const p=await c.newPage();p.on('pageerror',e=>E.push(label+': '+e.message));const t0=Date.now();
 await p.goto('http://localhost:8800/index.html',{waitUntil:'domcontentloaded'});
 let siap=true;try{await p.waitForFunction(()=>{const m=document.querySelector('.hx-meta');return window.FHApp&&FHApp.map&&FHApp.map()&&m&&!/Memuat/.test(m.innerText)},{timeout:45000});}catch(e){siap=false}
 const dt=(Date.now()-t0)/1000;return {p,dt,siap};}
// 1. pertama kali, sinyal bagus
let c=await konteks();let {p,dt,siap}=await buka(c,'online');
T(siap,`pertama kali online: tampil dengan data dalam ${dt.toFixed(1)} dtk`);
T(await p.evaluate(()=>FH_ASLI===true&&FH_BASIS.startsWith('https://erikprcfi')),'mode aplikasi asli aktif');
T(await p.evaluate(()=>!!(L.TileLayer.__asli)),'peta: ubin luring dibaca dari HP');
T(!ext.some(u=>/cdnjs|jsdelivr|unpkg|fonts\.googleapis|fonts\.gstatic/.test(u)),'tanpa CDN/Google Fonts: '+ext.filter(u=>/cdnjs|jsdelivr|unpkg|fonts\./.test(u)).slice(0,3).join(' '));
await p.waitForTimeout(25000);
T(await p.evaluate(()=>window.__ready>=1),'notifyAppReady terpanggil');
T(await p.evaluate(()=>window.__dl&&window.__dl.version==='209901010000'&&window.__dl.checksum==='ab'.repeat(32)&&window.__next&&window.__next.id==='b1'),'pembaruan baru diunduh (dengan checksum sha256) & dijadwalkan untuk pembukaan berikutnya: '+await p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('pr_pembaruan')).tahap}catch(e){return ''}}));
T(await p.evaluate(async()=>(await caches.open('pa-data-asli').then(c=>c.keys())).length>3),'data tersimpan di HP');
T(await p.evaluate(()=>getComputedStyle(document.body).fontFamily.includes('Plus Jakarta')&&document.fonts.check('600 14px "Plus Jakarta Sans"')),'huruf bawaan APK terpasang');
// tombol kembali
await p.evaluate(()=>FHApp.hubGo('lapor'));await p.waitForTimeout(1500);
await p.evaluate(()=>window.__ls.backButton({canGoBack:history.length>1}));await p.waitForTimeout(1200);
T(await p.evaluate(()=>!document.querySelector('#page.on')),'tombol Kembali menutup halaman');
await p.close();
// 2. buka ulang tanpa sinyal
SIN='mati';({p,dt,siap}=await buka(c,'mati-ulang'));T(siap&&dt<8,`tanpa sinyal (pernah online): ${dt.toFixed(1)} dtk`);await p.close();
// 3. sinyal lemah
SIN='lemah';await c.close();c=await konteks();SIN='bagus';({p}=await buka(c,'siapkan'));await p.waitForTimeout(3000);await p.close();
await c.addInitScript(()=>{});await new Promise(r=>setTimeout(r,500));
// paksa salinan 'lama' (>15 menit) agar benar-benar menunggu jaringan
({p}=await buka(c,'tua'));await p.evaluate(async()=>{const c=await caches.open('pa-data-asli');for(const k of await c.keys()){const r=await c.match(k);const h=new Headers(r.headers);h.set('x-pr-t',String(Date.now()-3600e3));await c.put(k,new Response(await r.arrayBuffer(),{headers:h}));}});await p.close();
SIN='lemah';({p,dt,siap}=await buka(c,'lemah'));T(siap&&dt<10,`sinyal lemah: ${dt.toFixed(1)} dtk`);await p.close();await c.close();
// 4. pertama kali dipasang & langsung tanpa sinyal (belum pernah online)
c=await konteks();SIN='mati';({p,dt,siap}=await buka(c,'mati-baru'));
T(siap,`baru dipasang, tanpa sinyal sama sekali: tetap terbuka berisi data bawaan (${dt.toFixed(1)} dtk)`);
const st=await p.evaluate(()=>(document.querySelector('.hx-stage')||{}).innerText||'');T(/Status|Aman|Waspada|Bahaya/.test(st),'beranda berisi status kawasan');

// versi sama → tidak unduh
await p.close();await c.close();c=await konteks();SIN='bagus';TERBARU={versi:'200001010000',url:'x.zip'};({p}=await buka(c,'sama'));await p.waitForTimeout(14000);
T(await p.evaluate(()=>!window.__dl),'versi tidak lebih baru → tidak mengunduh');
// smoke semua menu
const keys=await p.evaluate(()=>[...document.querySelectorAll('[data-hub],[data-k]')].map(x=>x.dataset.hub||x.dataset.k).filter((v,i,a)=>v&&a.indexOf(v)===i));const e0=E.length;
for(const k of keys){if(['kode','keluar'].includes(k))continue;try{await p.evaluate(k=>{try{FHApp.closeAll()}catch(e){}FHApp.hubGo(k)},k);await p.waitForTimeout(900);}catch(e){await p.waitForTimeout(3000);}}
T(E.length===e0,`${keys.length} menu dibuka tanpa galat`);
await b.close();
console.log('LULUS',ok.length);ok.forEach(x=>console.log(' ✓',x));console.log('GAGAL',bad.length);bad.forEach(x=>console.log(' ✗',x));console.log("ERR",[...new Set(E)].slice(0,8));process.exit(bad.length||E.length?1:0);})();
