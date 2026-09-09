const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const url = require('url');
const SITE = '/home/user/Untitled-new-game-project/site';
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.md':'text/plain' };
const server = http.createServer((req,res)=>{let p=path.join(SITE,decodeURIComponent(url.parse(req.url).pathname));if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);return res.end('x');}res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b);});});
(async()=>{
 await new Promise(r=>server.listen(8103,r));
 const br = await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
 const page = await br.newPage({viewport:{width:800,height:500}});
 page.on('pageerror',e=>console.log('ERR',e.message));
 await page.goto('http://localhost:8103/survivor/index.html',{waitUntil:'load'});
 await page.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
 await page.click('#startBtn'); await page.waitForTimeout(7000);
 const out0 = await page.evaluate(()=>{
   const S=window.SURVIVOR;
   // put the player in a wood at noon and report what the tree actors look like
   const w=S.world, m=w.map, S2=m.size; let best=null,bd=1e9;
   for(let r=4;r<S2-4;r+=7)for(let c=4;c<S2-4;c+=7){ if(w.classified.at(c,r).id!=='deepForest')continue;
     const wx=(c/(S2-1)-0.5)*m.worldSizeM, wz=(r/(S2-1)-0.5)*m.worldSizeM; const d=Math.hypot(wx,wz); if(d<bd){bd=d;best=[wx,wz];}}
   if(best){const y=m.heightAtWorld(best[0],best[1]);S.ctx.avatar.setPosition([best[0],y+1.4,best[1]]);S.player.x=best[0];S.player.z=best[1];}
   w.clock.simSeconds=12*3600;
   return best;
 });
 await page.waitForTimeout(12000);
 const treeInfo = await page.evaluate(()=>{
   const S=window.SURVIVOR;
   const t = S.game.actors.filter(a=>a.name==='tree'||(a.userData&&a.userData.kind==='tree'));
   const a = t[0];
   if(!a) return {found:0, names:[...new Set(S.game.actors.map(x=>x.name))].slice(0,25)};
   const m = a.material || (a.mesh&&a.mesh.material);
   return {found:t.length, name:a.name,
     mat: m ? {color:m.color&&[m.color.x,m.color.y,m.color.z], vertexColor:m.vertexColor, texture:m.texture&&m.texture.name,
       receiveShadow:m.receiveShadow, castShadow:m.castShadow, subsurface:m.subsurface, roughness:m.roughness} : null,
     keys: m ? Object.keys(m).slice(0,30) : []};
 });
 console.log('trees:', JSON.stringify(treeInfo));
 await page.screenshot({path:'/tmp/claude-0/tour/probe-forest.png'});

 async function variant(name, fn){
   await page.evaluate(fn);
   await page.waitForTimeout(3000);
   await page.screenshot({path:'/tmp/claude-0/tour/probe-'+name+'.png'});
   console.log('  variant', name);
 }
 for (const [n, mode] of [['dbg-shadow',1],['dbg-normal',2],['dbg-albedo',3]]) {
   await page.evaluate((m)=>{ window.SURVIVOR.game.renderer.debugMode = m; }, mode);
   await page.waitForTimeout(2500);
   await page.screenshot({path:'/tmp/claude-0/tour/probe-'+n+'.png'});
 }
 await page.evaluate(()=>{ window.SURVIVOR.game.renderer.debugMode = 0; });
 await page.waitForTimeout(1500);

 await variant('noshadow', ()=>{
   const S=window.SURVIVOR;
   for(const a of S.game.actors){ if(a.name!=='tree') continue; const m=a.material||(a.mesh&&a.mesh.material); if(m) m.receiveShadow=false; }
 });
 await variant('flatcolor', ()=>{
   const S=window.SURVIVOR;
   for(const a of S.game.actors){ if(a.name!=='tree') continue; const m=a.material||(a.mesh&&a.mesh.material);
     if(m){ m.vertexColor=false; m.color.set(0.28,0.52,0.18); } }
 });
 await variant('notexture', ()=>{
   const S=window.SURVIVOR;
   for(const a of S.game.actors){ if(a.name!=='tree') continue; const m=a.material||(a.mesh&&a.mesh.material);
     if(m){ m.texture=null; m.maps=null; } }
 });
 const out = await page.evaluate(()=>{
   const S=window.SURVIVOR; S.world.clock.simSeconds = 12*3600;
   const r=S.game.renderer;
   return {sun:{d:[r.sun.direction.x,r.sun.direction.y,r.sun.direction.z],i:r.sun.intensity,c:[r.sun.color.x,r.sun.color.y,r.sun.color.z]},
     sky:{z:[r.sky.zenith.x,r.sky.zenith.y,r.sky.zenith.z],h:[r.sky.horizon.x,r.sky.horizon.y,r.sky.horizon.z],g:[r.sky.ground.x,r.sky.ground.y,r.sky.ground.z],i:r.sky.intensity},
     post:{exposure:r.post.exposure,sat:r.post.saturation,vig:r.post.vignette},
     shadows:{...r.shadows}, fog:{d:r.fog.density,c:[r.fog.color.x,r.fog.color.y,r.fog.color.z]},
     alt: S.world.clock.sun().altitudeDeg, light: S.world.clock.lightLevel()};
 });
 await page.waitForTimeout(2500);
 console.log(JSON.stringify(out,null,1));
 const out2 = await page.evaluate(()=>{const r=window.SURVIVOR.game.renderer;return {skyI:r.sky.intensity,sunI:r.sun.intensity,z:[r.sky.zenith.x,r.sky.zenith.y,r.sky.zenith.z],h:[r.sky.horizon.x,r.sky.horizon.y,r.sky.horizon.z],g:[r.sky.ground.x,r.sky.ground.y,r.sky.ground.z],exp:r.post.exposure};});
 console.log('after a frame:',JSON.stringify(out2));
 await br.close(); server.close();
})();
