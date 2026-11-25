// Pemantau kecepatan situs LANGSUNG (produksi) seperti pengguna: sinyal baik & 3G lambat, kunjungan pertama & berikutnya.
// Gagal (exit 1) bila melewati batas – dipakai alur kerja uji harian (issue + email GitHub ke pemilik repositori).
const {chromium,devices}=require('playwright');const fs=require('fs'),path=require('path');
const URL_='https://erikprcfi.github.io/hotspot-fire-prcf/app.html';
const PROFIL=[['Sinyal baik',null,10],['3G lambat (500 kbps, 400 ms)',{offline:false,latency:400,downloadThroughput:62500,uploadThroughput:62500},45]];
(async()=>{const b=await chromium.launch();const H=[],M=[];
for(const [nm,jar,batas] of PROFIL){
 const c=await b.newContext({...devices['Pixel 5']});await c.addInitScript(()=>{try{localStorage.setItem('fh_panduan_v1','1');localStorage.setItem('pr_tamu','1')}catch(e){}});
 const p=await c.newPage();const E=[];p.on('pageerror',e=>E.push(e.message.slice(0,120)));
 if(jar){const s=await c.newCDPSession(p);await s.send('Network.enable');await s.send('Network.emulateNetworkConditions',jar);}
 for(let i=1;i<=2;i++){const t0=Date.now();let siap=null,data=null;
  try{await p.goto(URL_,{waitUntil:'commit',timeout:90000});await p.waitForFunction(()=>window.FHApp&&FHApp.map&&FHApp.map(),null,{timeout:90000,polling:100});siap=(Date.now()-t0)/1000;
   await p.waitForFunction(()=>{const t=document.body.innerText;return /titik panas/i.test(t)&&!/Memuat data/i.test(t)},null,{timeout:60000,polling:200});data=(Date.now()-t0)/1000;}catch(e){}
  const bts=i===1?batas:Math.min(batas,15);
  H.push(`${nm.padEnd(30)} kunjungan ${i}: siap ${siap!=null?siap.toFixed(1)+' dtk':'GAGAL'} · data ${data!=null?data.toFixed(1)+' dtk':'GAGAL'} (batas ${bts} dtk)`);
  if(siap==null||data==null||data>bts)M.push(`${nm} kunjungan ${i}: ${siap==null?'tidak terbuka':data==null?'data tidak tampil':'lambat '+data.toFixed(1)+' dtk'}`);
  if(i===1)await p.waitForTimeout(6000);}
 if(E.length)M.push(`${nm}: galat ${E.slice(0,2).join(' ; ')}`);
 await c.close();}
await b.close();
const out=['## Kecepatan situs langsung','','```',...H,'```',M.length?'Masalah: '+M.join(' · '):'Semua dalam batas ✅'].join('\n');console.log(out);
fs.writeFileSync(path.join(__dirname,'hasil_kecepatan.md'),out+'\n');process.exit(M.length?1:0);})();
