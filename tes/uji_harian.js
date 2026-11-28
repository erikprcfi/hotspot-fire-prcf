// UJI HARIAN Pantau Rimbak – dijalankan GitHub Actions tiap hari (juga bisa lokal).
// Web (perilaku produksi) & aplikasi asli (Capacitor tiruan): tamu, akun tanpa kode, admin (ganti Hutan Desa), akun + wilayah SHP.
// Setiap alat dibuka satu per satu; diperiksa: galat JS, teks janggal (NaN/undefined/…), data Hutan Desa PRCF tidak bocor ke mode umum/SHP,
// Dasbor & peta ikut berganti saat memilih Hutan Desa lain.
// Pakai: REPO=<repo> WWW_URL=http://localhost:8800/index.html node tes/uji_harian.js [web,asli]
const {chromium,devices}=require('playwright');const fs=require('fs'),path=require('path');
const REPO=process.env.REPO||path.resolve(__dirname,'..'),BASIS='https://erikprcfi.github.io/hotspot-fire-prcf/';
const WWW=process.env.WWW_URL||'http://localhost:8800/index.html';
const PLAT=(process.argv[2]||'web,asli').split(',');const SHP=require('./wilayah_uji.js');const NSHP=Object.keys(SHP);
const NAMA_HD=/Hutan Desa Nanga Lauk|HD Nanga Lauk|LPHD Lauk Bersatu|Batang Tau|Nyuai Peningun|Pundjung Batara|Bumi Lestari|Bukit Belang|Hutan Desa dampingan PRCF \(/;
const BURUK=/\bNaN\b|undefined|\[object Object\]|Infinity|null ha|TypeError|ReferenceError/;
const PAKET=(()=>{try{return JSON.parse(require('zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'paket_wilayah_uji.json.gz'))).toString());}catch(e){return null;}})();   // paket analisis otomatis wilayah sintetis (scripts/wilayah_umum.py --uji)
const AIDU='00000000-0000-4000-8000-0000000000aa';
const masalah=[];let nAlat=0;const ringkas=[];
const T={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.geojson':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const berkas=(p)=>{const f=path.join(REPO,decodeURIComponent(p));return fs.existsSync(f)&&fs.statSync(f).isFile()?f:null;};
(async()=>{const b=await chromium.launch();
for(const plat of PLAT){
 const sken=plat==='web'?[['tamu',null],['akun-tanpa-kode',''],['admin-ganti-hd','ADMIN'],...NSHP.map(s=>['shp:'+s,s])]:[['tamu',null],['admin-ganti-hd','ADMIN'],['shp:'+NSHP[1],NSHP[1]]];
 for(const [sk,shp] of sken.filter(([n])=>!process.env.SKEN||process.env.SKEN.split(',').includes(n))){
  const c=await b.newContext({...devices['Pixel 5'],serviceWorkers:'block',ignoreHTTPSErrors:true});
  const ADM=shp==='ADMIN',GJ=shp&&!ADM?SHP[shp]:null,NM=GJ?'Wilayah Uji '+shp.split('_')[0]:null;
  await c.addInitScript(([asli,tamu])=>{if(location.protocol==='about:')return;window.FH_AKUN_URL='https://mock.server/exec';try{localStorage.setItem('fh_panduan_v1','1');if(tamu)localStorage.setItem('pr_tamu','1');}catch(e){}
    if(asli)window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{addListener(){return{remove(){}}},minimizeApp(){}},CapacitorUpdater:{notifyAppReady(){},list:async()=>({bundles:[]}),download:async()=>({id:'x'}),next:async()=>{}},Filesystem:{writeFile:async o=>{(window.__fs=window.__fs||[]).push({path:o.path,data:o.data});return {uri:'file:///'+o.path};}},Share:{share:async()=>({})},Perangkat:{status:async()=>({kode:5}),widget:async o=>{window.__wg=o;}},LocalNotifications:{checkPermissions:async()=>({display:'granted'}),requestPermissions:async()=>({display:'granted'}),getPending:async()=>({notifications:(window.__ln||[]).map(n=>({id:n.id}))}),cancel:async o=>{const h=new Set(o.notifications.map(n=>n.id));window.__ln=(window.__ln||[]).filter(n=>!h.has(n.id));},schedule:async o=>{window.__ln=(window.__ln||[]).concat(o.notifications);return {notifications:o.notifications.map(n=>({id:n.id}))};},addListener(){return{remove(){}}}}}};},[plat==='asli',sk==='tamu']);
  const api=r=>{let d={};try{d=JSON.parse(r.request().postData()||'{}')}catch(e){};let o={ok:true,daftar:[],laporan:[],status:{},tim:[]};
    if(d.aksi==='masuk')o={ok:true,id:'11111111-1111-4111-8111-111111111111',token:'tok',admin:ADM,profil:{nama:'Penguji Harian',email:d.email,lahir:'1990-01-01',alamat:'Desa Contoh',hp:'+62 812 3456 7890'}};
    if(d.aksi==='wilayah_ambil')o=GJ?{ok:true,nama:NM,geojson:GJ}:{ok:false,galat:'Kode ID tidak dikenal.'};
    if(d.aksi==='ruang_daftar')o={ok:true,ruang:GJ&&PAKET?[{aid:AIDU,nama:NM,luas:4321,peran:'ketua',pemilik:true}]:[]};
    if(d.aksi==='wilayah_dinamis')o=GJ&&PAKET&&d.aid===AIDU?{ok:true,data:JSON.parse(JSON.stringify(PAKET).split('Wilayah uji').join(NM))}:{ok:false,galat:'Bukan wilayah Anda.'};
    if(d.aksi==='ruang_anggota')o={ok:true,peran:'ketua',anggota:[{email:'penguji@contoh.org',nama:'Penguji Harian',peran:'ketua',pemilik:true,terdaftar:true},{email:'anggota@contoh.org',nama:'',peran:'anggota',pemilik:false,terdaftar:false}]};
    if(d.aksi==='statistik_verifikasi')o={ok:true,total:0,status:{},hasil:{},bulan:{},hd:{},respon_median_jam:null,diperbarui:'2026-11-22 10:00'};
    r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});};
  await c.route('https://pantau.test/**',r=>{const f=berkas(new URL(r.request().url()).pathname);return f?r.fulfill({body:fs.readFileSync(f),contentType:T[path.extname(f)]||'application/octet-stream',headers:{'access-control-allow-origin':'*'}}):r.fulfill({status:404,body:''});});
  await c.route('https://mock.server/**',api);await c.route('https://script.google.com/**',api);
  await c.route(BASIS+'**',r=>{const f=berkas(r.request().url().slice(BASIS.length).split('?')[0]);return f?r.fulfill({body:fs.readFileSync(f),contentType:T[path.extname(f)]||'application/octet-stream'}):r.fulfill({status:404,body:''});});
  await c.grantPermissions(['geolocation']).catch(()=>{});await c.setGeolocation({latitude:0.9,longitude:112.6}).catch(()=>{});
  const p=await c.newPage();const E=[];const om429={n:0};p.on('response',r=>{try{if(r.status()===429&&/open-meteo\.com/.test(r.url()))om429.n++;}catch(e){}});p.on('pageerror',e=>E.push(e.message.slice(0,160)+' '+(e.stack||'').split('\n').slice(1,2).join(' ').slice(0,140)));
  p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR|404|favicon|tile|ERR_NAME|CORS/i.test(m.text()))E.push('console: '+m.text().slice(0,160));});
  const lbl=`${plat} | ${sk}`;const t0=Date.now();
  try{
   await p.goto(plat==='web'?'https://pantau.test/app.html?ujiakun=1':WWW);
   if(sk!=='tamu'){await p.waitForSelector('#ak_email',{timeout:40000});await p.fill('#ak_email',ADM?'erik.prcfi@gmail.com':'penguji@contoh.org');await p.fill('#ak_pw','Hutan2026x');if(GJ)await p.fill('#ak_kid','UJI1');await p.click('#akIn');await p.waitForTimeout(8000);await p.waitForLoadState('load');}
   await p.waitForFunction(()=>window.FHApp&&FHApp.map&&FHApp.map(),null,{timeout:60000});await p.waitForTimeout(3500);
   await p.evaluate(()=>{const f=document.getElementById('fhb');if(f)f.remove();const c=document.getElementById('chooser');if(c)c.classList.add('hide');});
   const st=await p.evaluate(()=>({akses:FHAkun.akses(),hd:!!(window.FHAksesHD&&FHAksesHD()),teks:document.body.innerText}));
   const harap=GJ?'shp':(ADM?'hd':'umum');
   if(ADM?!st.hd:st.akses.mode!==harap)masalah.push(`${lbl}: mode akses ${ADM?(st.hd?'hd':'umum'):st.akses.mode}, seharusnya ${harap}`);
   if(!ADM&&st.hd)masalah.push(`${lbl}: akses Hutan Desa PRCF terbuka di mode ${harap}`);
   if(harap!=='hd'&&NAMA_HD.test(st.teks))masalah.push(`${lbl}: beranda menampilkan data Hutan Desa PRCF → "${st.teks.match(NAMA_HD)[0]}"`);
   if(GJ&&!st.teks.includes(NM))masalah.push(`${lbl}: nama wilayah SHP tidak tampil`);
   if(plat==='asli'&&!ADM){const w=await p.evaluate(()=>window.__wg);if(w&&w.situs)masalah.push(`${lbl}: widget menampilkan Hutan Desa PRCF (${w.situs}) di mode ${harap}`);}
   if(ADM){ // ganti Hutan Desa: Dasbor & peta harus ikut
    await p.evaluate(()=>FHApp.go('dash'));await p.waitForTimeout(1200);
    const ids=await p.evaluate(()=>FHSites().map(s=>s.id));
    for(const id of ids.slice(0,6)){await p.click('.hx-site[data-hub="pilih"]');await p.waitForTimeout(800);const el=await p.$('#chList .sc[data-id="'+id+'"]');if(!el){masalah.push(`${lbl}: pilihan ${id} tidak ada`);continue;}await el.click();await p.waitForTimeout(2200);
     const r=await p.evaluate(id=>{const s=FHSites().find(x=>x.id===id);return {site:FHAkses().site,hero:(document.querySelector('.hx-site[data-hub="pilih"]')||{}).textContent||'',nama:s.hd_nama}},id);
     if(r.site!==id||!r.hero.includes(r.nama.replace(/^Hutan Desa /,'')))masalah.push(`${lbl}: pilih ${id} → Dasbor menampilkan "${r.hero}"`);
     if(plat==='asli'){const w=await p.evaluate(()=>window.__wg);if(!w||w.situs!==id)masalah.push(`${lbl}: widget tidak ikut berganti ke ${id} (${JSON.stringify(w)})`);}}
    const kml=await p.evaluate(()=>{const ok=x=>{const d=new DOMParser().parseFromString(x,'application/xml');return !d.querySelector('parsererror')&&d.getElementsByTagName('Placemark').length;};
      const a=window.FHPatroli&&FHPatroli.kml?ok(FHPatroli.kml('Uji & <tes>',[{jenis:'Api',t:Date.now(),la:.9,lo:112.6,rincian:'a&b <c>'}],[{pts:[{la:.9,lo:112.6},{la:.91,lo:112.61}]}],{Api:'#ff0000'})):-1;
      const b=window.FHSmart&&FHSmart.kml?ok(FHSmart.kml({waypoints:[],track:[[Date.now(),.9,112.6,5,10],[Date.now(),.91,112.61,5,11]],info:{id_kegiatan:'UJI-1',stasiun:'S',tim:'T',pelaksana:['A&B']}})):-1;return [a,b];});
    if(!(kml[0]>=2&&kml[1]>=1))masalah.push(`${lbl}: ekspor KML tidak sah (patroli ${kml[0]}, SMART ${kml[1]})`);
    await p.evaluate(()=>FHApp.go('home'));await p.waitForTimeout(2500);
    const m=await p.evaluate(()=>{const c=FHApp.map().getCenter(),s=FHSites().find(x=>x.id===FHAkses().site);return Math.hypot(c.lat-s.pusat[0],c.lng-s.pusat[1]);});
    if(!(m<0.5))masalah.push(`${lbl}: peta tidak berpindah ke Hutan Desa terpilih (selisih ${m.toFixed(2)}°)`);}
   const keys=await p.evaluate(()=>[...document.querySelectorAll('[data-hub],[data-k]')].map(x=>x.dataset.hub||x.dataset.k).filter((v,i,a)=>v&&a.indexOf(v)===i));
   for(const k of keys){if(['kode','keluar','pilih'].includes(k))continue;nAlat++;const e0=E.length;const u0=p.url();
    try{await p.evaluate(k=>{try{FHApp.closeAll()}catch(e){};FHApp.hubGo(k)},k);await p.waitForTimeout(1600);}catch(e){await p.waitForTimeout(4000);}
    if(!p.url().startsWith(u0.split('#')[0])){await p.goto(u0);await p.waitForTimeout(6000);await p.evaluate(()=>{const f=document.getElementById('fhb');if(f)f.remove();}).catch(()=>{});}
    let t='';try{t=await p.evaluate(()=>{const pg=document.querySelector('#page.on #pageBody, .sheet.on, .ak-sheet, #sec.on');return (pg?pg.innerText:document.body.innerText)||'';});}catch(e){}
    if(E.length>e0)masalah.push(`${lbl} | alat ${k}: galat → ${E.slice(e0).join(' ; ')}`);
    const m=t.match(BURUK);if(m)masalah.push(`${lbl} | alat ${k}: teks janggal "${t.slice(Math.max(0,m.index-50),m.index+30).replace(/\s+/g,' ')}"`);
    if(harap!=='hd'){const h=t.match(NAMA_HD);if(h)masalah.push(`${lbl} | alat ${k}: menampilkan data Hutan Desa PRCF "${h[0]}"`);}}
   if(ADM){ // fitur 2.3: kalender, rawan, rencana (GPX/KML), kartu, perbandingan, laporan tahunan, pengingat
    const f=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),o={};const tx=()=>(document.querySelector('#page.on #pageBody')||{}).innerText||'';
     try{FHApp.closeAll()}catch(e){};await w(400);FHMusimRawan.kalender();await w(2500);o.kal=/Musim api|Fire season/.test(tx())&&document.querySelectorAll('.mr-row').length;
     try{FHApp.closeAll()}catch(e){};await w(400);FHMusimRawan.rawan();await w(2500);o.rawan=document.querySelectorAll('#mrW .mr-li').length;
     try{FHApp.closeAll()}catch(e){};await w(400);FHMusimRawan.rencana();await w(800);document.querySelector('[data-awal]').value='desa';document.querySelector('[data-buat]').click();await w(3000);
     o.rencana=document.querySelectorAll('#mrHasil .mr-li').length;
     const ok=x=>{const d=new DOMParser().parseFromString(x,'application/xml');return !d.querySelector('parsererror');};const U=[{jenis:'titik',pos:[.9,112.6],ket:'a & <b>'},{jenis:'rawan',pos:[.91,112.61],ket:'c'}];
     o.gpx=ok(FHMusimRawan.gpx('Uji & <x>',[.89,112.59],U));o.kml=ok(FHMusimRawan.kml('Uji & <x>',[.89,112.59],U));
     try{FHApp.closeAll()}catch(e){};await w(400);FHKartu.open();await w(4000);const im=document.querySelector('.kp-img');o.kartu=im?+im.dataset.kartu:0;
     try{FHApp.closeAll()}catch(e){};await w(400);FHBanding.open();await w(3000);o.banding=document.querySelectorAll('#kpW table')[0]?document.querySelectorAll('#kpW table')[0].querySelectorAll('tr').length-1:0;
     try{FHApp.closeAll()}catch(e){};await w(400);FHBulanan.open();await w(3000);o.tahunan=document.querySelectorAll('#blTahun .bl-it').length;
     if(window.FH_ASLI){try{FHApp.closeAll()}catch(e){};await w(400);FHPengingat.open();await w(800);const b=document.querySelector('[data-simpan]');if(b){b.click();await w(2500);}o.pengingat=(window.__ln||[]).length;}
     // fitur 2.4: iklim & kesiagaan
     const buka=async(f,ms)=>{try{FHApp.closeAll()}catch(e){};await w(400);f();await w(ms||2500);return document.querySelector('#page.on #pageBody');};
     let pg=await buka(()=>FHIklim.siaga());o.siaga=/Aman|Waspada|Siaga|Awas/.test((pg.querySelector('.ik-hero')||{}).innerText||'')?pg.querySelectorAll('.ik-row').length:0;
     pg=await buka(()=>FHIklim.prakiraan());o.prak=pg.querySelectorAll('.ik-row[data-i]').length;
     pg=await buka(()=>FHIklim.kering());o.kering=/hari|days/.test((pg.querySelector('.ik-hero')||{}).innerText||'');
     pg=await buka(()=>FHIklim.banjir());o.banjir=pg.querySelectorAll('.ik-svg').length&&pg.querySelectorAll('.ik-kv b').length===4;
     pg=await buka(()=>FHIklim.asap());o.asap=!!pg.querySelector('.ik-hero');
     pg=await buka(()=>FHIklim.bekasArsip(),3000);o.bekas=pg.querySelectorAll('.ik-tb tr').length-1;
     pg=await buka(()=>FHIklim.vegetasi());o.veg=pg.querySelectorAll('.ik-svg').length;
     pg=await buka(()=>FHIklim.rekap());o.rekap=pg.querySelectorAll('.ik-tb tr').length-1;
     {const a=pg.querySelector('.ik-tb a[download]');if(a){const r=await fetch(a.getAttribute('href'));const bb=new Uint8Array(await r.arrayBuffer());o.rekapPdf=r.ok&&String.fromCharCode(...bb.slice(0,4))==='%PDF'?bb.length:0;}else o.rekapPdf=0;}
     try{FHApp.closeAll()}catch(e){};await w(400);FHApp.go('dash');await w(3000);o.chip=!!document.querySelector('.hx-sg');
     try{FHApp.closeAll()}catch(e){};await w(500);return o;});
    if(!(f.siaga>=4))masalah.push(`${lbl}: Indeks Siaga Desa tidak lengkap (${f.siaga})`);
    if(f.prak!==6)masalah.push(`${lbl}: prakiraan musim api ${f.prak} bulan, seharusnya 6`);
    if(!f.kering)masalah.push(`${lbl}: halaman kekeringan kosong`);
    if(!f.banjir)masalah.push(`${lbl}: halaman debit sungai & banjir tidak lengkap`);
    if(!f.asap)masalah.push(`${lbl}: halaman arah asap kosong`);
    if(!(f.bekas>=20))masalah.push(`${lbl}: arsip area terbakar ${f.bekas} tahun`);
    if(f.veg!==2)masalah.push(`${lbl}: grafik kesehatan vegetasi ${f.veg}, seharusnya 2`);
    if(!(f.rekap>=10))masalah.push(`${lbl}: rekap musim api ${f.rekap} musim`);
    if(!(f.rekapPdf>20000))masalah.push(`${lbl}: PDF rekap musim api tidak dapat diunduh`);
    if(!f.chip)masalah.push(`${lbl}: status Indeks Siaga Desa tidak tampil di Beranda`);
    const NS=await p.evaluate(()=>FHSites().length);
    if(!f.kal||f.kal!==12)masalah.push(`${lbl}: kalender musim api tidak lengkap (${f.kal})`);
    if(!(f.rawan>0))masalah.push(`${lbl}: titik rawan berulang kosong`);
    if(!(f.rencana>0))masalah.push(`${lbl}: rencana patroli tidak menghasilkan titik tujuan`);
    if(!f.gpx||!f.kml)masalah.push(`${lbl}: GPX/KML rencana patroli tidak sah`);
    if(!(f.kartu>30000))masalah.push(`${lbl}: kartu status tidak terbentuk (${f.kartu} B)`);
    if(f.banding!==NS)masalah.push(`${lbl}: perbandingan Hutan Desa ${f.banding} baris, seharusnya ${NS}`);
    if(!(f.tahunan>0))masalah.push(`${lbl}: laporan tahunan tidak tampil`);
    if(plat==='asli'&&!(f.pengingat>0))masalah.push(`${lbl}: pengingat patroli tidak terjadwal`);
    await p.evaluate(()=>{try{FHApp.closeAll()}catch(e){};FHBulanan.open()});await p.waitForTimeout(2500);
    const n=await p.evaluate(()=>document.querySelectorAll('#blW .bl-it a[download]').length);if(!n)masalah.push(`${lbl}: Laporan bulanan tidak menampilkan PDF`);
    const ok=await p.evaluate(async()=>{const a=document.querySelector('#blW .bl-it a[download]');if(!a)return 0;const r=await fetch(a.getAttribute('href'));const b=new Uint8Array(await r.arrayBuffer());return r.ok&&String.fromCharCode(...b.slice(0,4))==='%PDF'?b.length:0;});
    if(!ok)masalah.push(`${lbl}: berkas PDF laporan bulanan tidak dapat diunduh`);}
   if(GJ&&PAKET){ // wilayah SHP: semua fitur otomatis dari paket wilayah (perlakuan sama dengan Hutan Desa)
    await p.waitForFunction(()=>window.FHWilSaya&&FHWilSaya.aktif(),null,{timeout:30000}).catch(()=>{});
    const f=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),o={aktif:!!(window.FHWilSaya&&FHWilSaya.aktif())};if(!o.aktif)return o;
     const buka=async(f,ms)=>{try{FHApp.closeAll()}catch(e){};await w(400);f();await w(ms||2500);const B=()=>document.querySelector('#page.on #pageBody');for(let i=0;i<16;i++){const b=B();const t=b?b.innerText:'';if(b&&t.length>60&&!/Memuat…|Loading…/.test(t))break;await w(500);}return B()||document.body;};
     const kunci=pg=>/Khusus Hutan Desa|Partner village forests only/.test(pg.innerText);o.kunci=[];
     let pg=await buka(()=>FHApp.hubGo('siaga'));if(kunci(pg))o.kunci.push('siaga');o.siaga=/Aman|Waspada|Siaga|Awas/.test((pg.querySelector('.ik-hero')||{}).innerText||'')?pg.querySelectorAll('.ik-row').length:0;
     pg=await buka(()=>FHApp.hubGo('prakmusim'));if(kunci(pg))o.kunci.push('prakmusim');o.prak=pg.querySelectorAll('.ik-row[data-i]').length;
     pg=await buka(()=>FHApp.hubGo('kering'));if(kunci(pg))o.kunci.push('kering');o.kering=/hari|days/.test((pg.querySelector('.ik-hero')||{}).innerText||'');
     pg=await buka(()=>FHApp.hubGo('banjir'));if(kunci(pg))o.kunci.push('banjir');o.banjir=pg.querySelectorAll('.ik-svg').length&&pg.querySelectorAll('.ik-kv b').length===4;
     pg=await buka(()=>FHApp.hubGo('asap'));if(kunci(pg))o.kunci.push('asap');o.asap=!!pg.querySelector('.ik-hero');
     pg=await buka(()=>FHApp.hubGo('bekasarsip'),3000);if(kunci(pg))o.kunci.push('bekasarsip');o.bekas=pg.querySelectorAll('.ik-tb tr').length-1;
     pg=await buka(()=>FHApp.hubGo('vegetasi'));if(kunci(pg))o.kunci.push('vegetasi');o.veg=pg.querySelectorAll('.ik-svg').length;
     pg=await buka(()=>FHApp.hubGo('rekapmusim'));if(kunci(pg))o.kunci.push('rekapmusim');o.rekap=pg.querySelectorAll('.ik-tb tr').length-1;
     pg=await buka(()=>FHApp.hubGo('musimapi'));if(kunci(pg))o.kunci.push('musimapi');o.kal=document.querySelectorAll('.mr-row').length;
     pg=await buka(()=>FHApp.hubGo('rawan'));if(kunci(pg))o.kunci.push('rawan');o.rawanTeks=pg.innerText.length;
     pg=await buka(()=>FHApp.hubGo('rencana'),800);if(kunci(pg))o.kunci.push('rencana');
     try{FHApp.closeAll()}catch(e){};await w(400);FHApp.go('dash');await w(3000);o.chip=!!document.querySelector('.hx-sg');
     const t=document.querySelector('.hx-t[data-hub="siaga"]');o.ubin=!!t&&!t.classList.contains('hx-lock');o.tim=!!document.querySelector('[data-wl]');
     if(o.tim){document.querySelector('[data-wl]').click();await w(2500);o.lembar=document.querySelectorAll('#wlB .card').length;const b=document.querySelector('#wlB [data-tim]');if(b){b.click();await w(2000);o.anggota=document.querySelectorAll('#wtB [data-hapus]').length;}}
     try{FHApp.closeAll()}catch(e){};await w(500);return o;});
    if(!f.aktif)masalah.push(`${lbl}: paket analisis otomatis wilayah SHP tidak termuat`);
    else{
     if(f.kunci.length)masalah.push(`${lbl}: alat masih terkunci untuk wilayah SHP → ${f.kunci.join(', ')}`);
     if(!(f.siaga>=4))masalah.push(`${lbl}: Indeks Siaga (wilayah SHP) tidak lengkap (${f.siaga})`);
     if(f.prak!==6)masalah.push(`${lbl}: prakiraan musim api (wilayah SHP) ${f.prak} bulan`);
     if(!f.kering)masalah.push(`${lbl}: kekeringan (wilayah SHP) kosong`);
     if(!f.banjir)masalah.push(`${lbl}: banjir (wilayah SHP) tidak lengkap`);
     if(!f.asap)masalah.push(`${lbl}: arah asap (wilayah SHP) kosong`);
     if(!(f.bekas>=20))masalah.push(`${lbl}: arsip area terbakar (wilayah SHP) ${f.bekas} tahun`);
     if(f.veg!==2)masalah.push(`${lbl}: grafik vegetasi (wilayah SHP) ${f.veg}`);
     if(!(f.rekap>=10))masalah.push(`${lbl}: rekap musim (wilayah SHP) ${f.rekap} musim`);
     if(f.kal!==12)masalah.push(`${lbl}: kalender musim api (wilayah SHP) ${f.kal} bulan`);
     if(!f.chip)masalah.push(`${lbl}: Indeks Siaga tidak tampil di Beranda wilayah SHP`);
     if(!f.ubin)masalah.push(`${lbl}: ubin Indeks Siaga masih terkunci di Beranda wilayah SHP`);
     if(!(f.lembar>=1))masalah.push(`${lbl}: lembar Wilayah & tim kosong`);
     if(f.anggota!==1)masalah.push(`${lbl}: daftar anggota tim tidak tampil (${f.anggota})`);
     // alat tambahan wilayah: laporan PDF, riwayat, ekspor, peta luring, banding
     const g=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),o={};const buka=async(f,ms)=>{try{FHApp.closeAll()}catch(e){};await w(400);f();await w(ms||1500);return document.querySelector('#page.on #pageBody')||document.body;};
      o.tombol=!!document.querySelector('[data-wa]');if(!window.FHWilAlat)return o;
      FHWilAlat.menu();await w(800);o.menu=document.querySelectorAll('#waM [data-k]').length;
      let pg=await buka(()=>FHWilAlat.riwayat());o.riwayat=pg.querySelectorAll('.wa-svg').length;o.riwayatBaris=pg.querySelectorAll('.wa-tb tr').length-1;
      pg=await buka(()=>FHWilAlat.ekspor());o.ekspor=pg.querySelectorAll('[data-e]').length;
      pg=await buka(()=>FHWilAlat.luring());o.luring=!!pg.querySelector('#waLS');
      pg=await buka(()=>FHWilAlat.banding());o.banding=pg.innerText.length>20;
      pg=await buka(()=>FHWilAlat.hutan());o.hutan=/Indikasi bukaan|clearing indications|Sedang disiapkan/.test(pg.textContent)&&/Hansen/.test(pg.textContent)&&/Sentinel-1/.test(pg.textContent);o.hutanTeks=[/Hansen/.test(pg.textContent),/Sentinel-1/.test(pg.textContent),pg.textContent.length].join(",");pg=await buka(()=>FHWilAlat.bekas());o.bekasS2=/dNBR/.test(pg.textContent);
      pg=await buka(()=>FHWilAlat.profil());o.gambut=/Lahan gambut|Peatland/.test(pg.textContent)&&/PEATMAP/.test(pg.textContent);o.profilLain=['Global Surface Water','Harmonized Global Biomass','Canopy Height','Global Forest Change'].filter(k=>!pg.textContent.includes(k));
      pg=await buka(()=>FHWilAlat.laporan());o.laporan=!!pg.querySelector('#waPdf');return o;});
     if(!g.tombol)masalah.push(`${lbl}: tombol Laporan & data tidak ada di Beranda wilayah SHP`);
     if(g.menu!==8)masalah.push(`${lbl}: menu Laporan & data ${g.menu} item`);
     if(g.riwayat!==2||!(g.riwayatBaris>=10))masalah.push(`${lbl}: riwayat titik panas tidak lengkap (${g.riwayat} grafik, ${g.riwayatBaris} tahun)`);
     if(!(g.ekspor>=12))masalah.push(`${lbl}: ekspor data hanya ${g.ekspor} tombol`);
     if(!g.luring)masalah.push(`${lbl}: halaman peta luring wilayah tidak lengkap`);
     if(!g.banding)masalah.push(`${lbl}: halaman bandingkan wilayah kosong`);
     if(!g.hutan)masalah.push(`${lbl}: halaman perubahan hutan Sentinel-2 tidak lengkap (${g.hutanTeks})`);if(!g.bekasS2)masalah.push(`${lbl}: halaman bekas terbakar Sentinel-2 tidak lengkap`);
     if(g.profilLain&&g.profilLain.length)masalah.push(`${lbl}: profil lahan kurang bagian: ${g.profilLain.join(', ')}`);
     if(!g.gambut)masalah.push(`${lbl}: profil lahan (gambut) wilayah SHP tidak tampil`);
     if(!g.laporan)masalah.push(`${lbl}: halaman laporan PDF wilayah tidak lengkap`);
     else{ // unduh PDF & ekspor KML sungguhan (web: unduhan peramban; aplikasi: Filesystem + Share bawaan HP)
      const unduh=async(sel,ms)=>{if(plat!=='asli'){const [dlx]=await Promise.all([p.waitForEvent('download',{timeout:ms}),p.click(sel)]);const fp=await dlx.path();return fp?fs.readFileSync(fp):Buffer.alloc(0);}
       const n0=await p.evaluate(()=>(window.__fs||[]).length);await p.click(sel);await p.waitForFunction(n=>(window.__fs||[]).length>n,n0,{timeout:ms});return Buffer.from(await p.evaluate(()=>window.__fs[window.__fs.length-1].data),'base64');};
      for(const [sel,min,nm] of [['#waPdf',15000,'laporan PDF']]){try{const buf=await unduh(sel,60000);const sz=buf.length;const kepala=buf.slice(0,5).toString();if(sz<min||kepala!=='%PDF-')masalah.push(`${lbl}: ${nm} tidak valid (${sz} B)`);}catch(e){masalah.push(`${lbl}: ${nm} gagal diunduh – ${String(e.message).slice(0,80)}`);}}
      await p.evaluate(async()=>{try{FHApp.closeAll()}catch(e){};await new Promise(r=>setTimeout(r,400));FHWilAlat.ekspor();await new Promise(r=>setTimeout(r,1200));});
      for(const e of ['batas|KML','titik|GPX','rawan|GeoJSON','titik|CSV']){try{const t=(await unduh(`[data-e="${e}"]`,20000)).toString('utf8');const ok=e.endsWith('KML')?/<kml[\s\S]*<Placemark>/.test(t):e.endsWith('GPX')?/<gpx[\s\S]*<wpt /.test(t):e.endsWith('GeoJSON')?(()=>{try{return JSON.parse(t).features.length>0}catch(x){return false}})():t.split('\n').length>2;if(!ok)masalah.push(`${lbl}: ekspor ${e} isinya tidak valid`);}catch(x){masalah.push(`${lbl}: ekspor ${e} gagal – ${String(x.message).slice(0,80)}`);}}
      await p.evaluate(()=>{try{FHApp.closeAll()}catch(e){}});}
   }}
   if(!ADM&&sk!=='tamu'&&!(GJ&&PAKET)){const u=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));try{FHApp.closeAll()}catch(e){};await w(400);FHMusimRawan.rencana();await w(1200);const t=((document.querySelector('#abSub')||{}).textContent||'')+' '+((document.querySelector('#page.on #pageBody')||{}).innerText||'');
      try{FHApp.closeAll()}catch(e){};await w(400);FHKartu.open();await w(3500);const k=!!document.querySelector('.kp-img');try{FHApp.closeAll()}catch(e){};await w(400);FHBanding.open();await w(1200);const b=((document.querySelector('#abSub')||{}).textContent||'')+' '+((document.querySelector('#page.on #pageBody')||{}).innerText||'');try{FHApp.closeAll()}catch(e){};await w(400);FHIklim.siaga();await w(1200);const sg=((document.querySelector('#abSub')||{}).textContent||'')+' '+((document.querySelector('#page.on #pageBody')||{}).innerText||'');try{FHApp.closeAll()}catch(e){};return {rencana:/Khusus|only/.test(t),kartu:k,banding:/Khusus admin|Admins only/.test(b),siaga:/Khusus|only/.test(sg)};});
     if(!u.rencana)masalah.push(`${lbl}: rencana patroli terbuka di mode ${harap}`);if(!u.kartu)masalah.push(`${lbl}: kartu status (Indonesia) gagal`);if(!u.banding)masalah.push(`${lbl}: perbandingan Hutan Desa terbuka untuk non-admin`);if(!u.siaga)masalah.push(`${lbl}: Indeks Siaga Desa terbuka di mode ${harap}`);}
   { // status kawasan & izin (Satu Peta – BIG): ringkasan titik & halaman
    const kw=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));if(!window.FHKawasan)return 'FHKawasan tidak termuat';
     const t=await FHKawasan.ringkas(-2.4,113.9);if(t==null)return 'layanan Satu Peta tidak terjangkau';if(!/Taman Nasional|National Park/.test(t)||!/PIPPIB/.test(t))return 'ringkasan salah: '+t;
     try{FHApp.closeAll()}catch(e){};await w(300);FHApp.hubGo('kawasan');await w(800);if(!document.getElementById('kwW')){FHApp.map()&&FHApp.map().setView([-2.4,113.9],10,{animate:false});document.getElementById('kwM').click();}
     for(let i=0;i<60;i++){await w(1000);const x=(document.getElementById('kwB')||{}).textContent||'';if(/Satu Peta – Badan Informasi Geospasial|One Map Policy/.test(x)){try{FHApp.closeAll()}catch(e){};return /gagal dimuat|failed/.test(x)&&!/lapisan tercantum|layers found/.test(x)?'halaman gagal':'';}if(/tidak dapat dihubungi|cannot be reached/.test(x))return 'Satu Peta tidak terjangkau dari halaman';}
     return 'halaman tidak selesai dalam 60 dtk';});
    if(kw)masalah.push(`${lbl}: status kawasan – ${kw}`);}
   { // keanekaragaman hayati (GBIF): wilayah aktif atau pusat peta
    const hy=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));if(!window.FHHayati)return 'FHHayati tidak termuat';try{FHApp.closeAll()}catch(e){};await w(300);
     FHApp.hubGo('hayati');await w(800);const m=document.getElementById('hyM');if(m){FHApp.map()&&FHApp.map().setView([0.83,112.3],10,{animate:false});m.click();}
     for(let i=0;i<120;i++){await w(1000);const t=(document.getElementById('hyB')||{}).innerText||'';if(/Gagal mengambil|Failed to fetch/.test(t))return 'GBIF gagal: '+t.slice(0,120);if(/Spesies tercatat|Species recorded/.test(t)){const n=+(t.match(/Spesies tercatat\s*([\d.]+)/)||[0,'0'])[1].replace(/\./g,'');try{FHApp.closeAll()}catch(e){};return n>0?'':'0 spesies';}}
     return 'tidak selesai dalam 120 dtk';});
    if(hy)masalah.push(`${lbl}: keanekaragaman hayati – ${hy}`);}
   { // lapisan nasional: gambut (nilai titik & lapisan peta)
    const gb=await p.evaluate(async()=>{if(!window.FHLapNas)return 'FHLapNas tidak termuat';const a=await FHLapNas.nilai('gambut',-2.4,113.9),b=await FHLapNas.nilai('gambut',-6.2,106.8);if(a!==1||b!==0)return `nilai gambut salah (${a}, ${b})`;
     const m=FHApp.map();if(!m)return '';const on=FHLapNas.toggle('gambut',m);m.setView([-2.4,113.9],9,{animate:false});await new Promise(r=>setTimeout(r,1500));const n=document.querySelectorAll('img.lapnas').length;FHLapNas.toggle('gambut',m);return on&&n?'':'lapisan gambut tidak tampil di peta';});
    if(gb)masalah.push(`${lbl}: gambut – ${gb}`);}
   { // Cuaca di lokasi saya (GPS): modul FHLokasi harus termuat & menampilkan cuaca
    const lx=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));if(!window.FHLokasi)return 'FHLokasi tidak termuat';try{FHApp.closeAll()}catch(e){};await w(300);FHApp.hubGo('lokasi');for(let i=0;i<30;i++){await w(500);const t=(document.getElementById('lxBody')||{}).innerText||'';if(/°/.test(t))return '';}return 'tidak tampil';});
    if(lx&&!(lx==='tidak tampil'&&om429.n))masalah.push(`${lbl}: Cuaca di lokasi saya – ${lx}`);else if(lx)console.log(`(catatan) ${lbl}: cuaca lokasi tidak tampil karena server Open-Meteo membatasi permintaan (HTTP 429) dari mesin uji – bukan galat aplikasi`);}
   ringkas.push(`${lbl.padEnd(34)} alat ${String(keys.length).padStart(2)} · galat ${E.length} · ${((Date.now()-t0)/1000).toFixed(0)} dtk`);console.log(ringkas[ringkas.length-1]);
  }catch(e){masalah.push(`${lbl}: GAGAL dijalankan – ${e.message.slice(0,160)}`);console.log(lbl,'GAGAL',e.message.slice(0,160));}
  await c.close();}}
await b.close();
const out=[`## Uji harian Pantau Rimbak – ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC`,'',...ringkas.map(x=>'    '+x),'',`Total pembukaan alat: **${nAlat}** · masalah: **${masalah.length}**`,...[...new Set(masalah)].map(x=>'- ✗ '+x)].join('\n');
console.log(out);fs.writeFileSync(path.join(__dirname,'hasil_uji.md'),out+'\n');process.exit(masalah.length?1:0);})();
