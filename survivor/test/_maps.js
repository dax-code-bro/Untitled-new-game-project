#!/usr/bin/env node
/* Measure the photographed maps as the GPU will see them: how far the
 * normal map actually tilts, and what range the roughness channel really
 * occupies. A map that reads flat here is flat on every surface in the
 * game, and no amount of lighting work will fix that. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{await new Promise(r=>server.listen(8171,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:600,height:400}});
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
await pg.goto('http://localhost:8171/survivor/index.html',{waitUntil:'load'});
await pg.waitForFunction(()=>typeof window.LegendEngine!=='undefined'||typeof window.loadScan==='function'||typeof window.SURVIVOR!=='undefined',{timeout:120000});
const out=await pg.evaluate(async()=>{
 const LE=window.LegendEngine||window.LE||{};
 const load=window.loadScan||LE.loadScan;
 const ids=(window.scanIds||LE.scanIds||(()=>[]))();
 if(!load||!ids.length)return {error:'no loadScan',keys:Object.keys(LE).slice(0,40)};
 const rows=[];
 for(const id of ids){
  const s=await load(id);
  if(!s){rows.push({id,err:'decode failed'});continue;}
  const n=s.normal.data,o=s.orm.data,a=s.albedo.data;
  let sx=0,sy=0,cnt=0,gmin=255,gmax=0,gsum=0,rmin=255,rmax=0,rsum=0,amin=255,amax=0,asum=0;
  for(let i=0;i<n.length;i+=4){
   const x=(n[i]-128)/128,y=(n[i+1]-128)/128;
   sx+=x*x;sy+=y*y;cnt++;
   const g=o[i+1];gsum+=g;if(g<gmin)gmin=g;if(g>gmax)gmax=g;
   const r=o[i];rsum+=r;if(r<rmin)rmin=r;if(r>rmax)rmax=r;
   const al=a[i+3];asum+=al;if(al<amin)amin=al;if(al>amax)amax=al;
  }
  // RMS tangent-space tilt, in degrees, which is the thing you can see.
  const rms=Math.sqrt((sx+sy)/cnt);
  rows.push({id,size:s.normal.size,
   tiltDeg:+(Math.atan(rms)*180/Math.PI).toFixed(2),
   rough:{min:+(gmin/255).toFixed(2),mean:+(gsum/cnt/255).toFixed(2),max:+(gmax/255).toFixed(2)},
   ao:{min:+(rmin/255).toFixed(2),mean:+(rsum/cnt/255).toFixed(2),max:+(rmax/255).toFixed(2)},
   alpha:{min:+(amin/255).toFixed(2),mean:+(asum/cnt/255).toFixed(2),max:+(amax/255).toFixed(2)}});
 }
 return {rows};
});
if(out.error){console.log(JSON.stringify(out));}
else{
 console.log('id                tilt°   rough(min/mean/max)   ao(min/mean/max)   alpha mean');
 for(const r of out.rows){
  if(r.err){console.log(r.id.padEnd(18)+'  '+r.err);continue;}
  console.log(r.id.padEnd(18)+String(r.tiltDeg).padStart(5)+'   '
   +`${r.rough.min}/${r.rough.mean}/${r.rough.max}`.padEnd(22)
   +`${r.ao.min}/${r.ao.mean}/${r.ao.max}`.padEnd(19)+r.alpha.mean);
 }
}
await b.close();server.close();})();
