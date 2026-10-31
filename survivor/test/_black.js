#!/usr/bin/env node
/* What, exactly, is the black? Picks the darkest pixels out of the
 * frame, fires a ray through each one, and names the actor it hits —
 * then renders the albedo and normal channels of the same view. No
 * more squinting. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/black';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
const setup=async(pg)=>{
 await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
 await pg.click('#startBtn');await pg.waitForTimeout(7000);
 await pg.evaluate(()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=11*3600;
  for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}
  const v=document.getElementById('vignette');if(v)v.style.display='none';
  const d=document.getElementById('damage');if(d)d.style.display='none';
  S.player.body.coreTempC=37;S.ctx.state.benchOpen=true;
  const g=S.game,px=S.player.x,pz=S.player.z;let best=null;
  for(let a=0;a<36;a++){const th=a/36*Math.PI*2;let n=0;
   for(const ac of g.actors){if(!/^tree$/.test(ac.name||''))continue;
    const dx=ac.position.x-px,dz=ac.position.z-pz;const dd=Math.hypot(dx,dz);
    if(dd<120&&Math.abs(Math.atan2(dx,dz)-th)<0.35)n++;}
   if(!best||n>best.n)best={n,th};}
  const y=S.ctx.groundY(px,pz);
  g.lookAt([px,y+1.62,pz],[px+Math.sin(best.th)*10,y+1.5,pz+Math.cos(best.th)*10]);});
 await pg.waitForTimeout(1800);
};
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8167,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1100,height:620}});
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
await pg.goto('http://localhost:8167/survivor/index.html',{waitUntil:'load'});
await setup(pg);

const report=await pg.evaluate(()=>{
 const S=window.SURVIVOR,g=S.game,r=g.renderer;
 const cv=g.canvas||document.querySelector('canvas');
 // Read the frame back through a 2D canvas so we can find the dark pixels.
 const t=document.createElement('canvas');t.width=cv.width;t.height=cv.height;
 const c2=t.getContext('2d',{willReadFrequently:true});c2.drawImage(cv,0,0);
 const im=c2.getImageData(0,0,t.width,t.height).data;
 const hits=new Map();const samples=[];
 const W=t.width,H=t.height;
 for(let y=Math.floor(H*0.45);y<H;y+=9){
  for(let x=0;x<W;x+=9){
   const i=(y*W+x)*4,lum=(im[i]*0.21+im[i+1]*0.72+im[i+2]*0.07)/255;
   if(lum>0.05)continue;
   // Normalised device coords -> a world ray, then ask the engine.
   const ndx=(x/W)*2-1, ndy=1-(y/H)*2;
   let name='(no hit)';
   try{
    const rr=g.raycastScreen?g.raycastScreen(ndx,ndy):null;
    if(rr&&rr.actor)name=rr.actor.name||'(unnamed)';
   }catch(e){name='(raycast threw) '+e.message;}
   hits.set(name,(hits.get(name)||0)+1);
   if(samples.length<6)samples.push({x,y,rgb:[im[i],im[i+1],im[i+2]]});
  }
 }
 // Independent of raycasting: what fraction of the lower frame is near-black?
 let dark=0,tot=0;
 for(let y=Math.floor(H*0.45);y<H;y+=4)for(let x=0;x<W;x+=4){
  const i=(y*W+x)*4;tot++;
  if((im[i]*0.21+im[i+1]*0.72+im[i+2]*0.07)/255<0.05)dark++;}
 // Facts about the surfaces in play.
 const byName={};
 for(const a of g.actors){
  const n=a.name||'?';if(byName[n])continue;
  const m=a.material;if(!m)continue;
  byName[n]={mat:m.id,scan:m.scan||null,ready:!!m.scanReady,ao:null,
   vertexColor:!!m.vertexColor,alphaClip:!!m.alphaClip,
   detailScale:m.detailScale||0,uv:+(m.uvScale||1).toFixed(2),
   color:[+m.color.x.toFixed(2),+m.color.y.toFixed(2),+m.color.z.toFixed(2)]};
 }
 const px=S.player.x,pz=S.player.z;
 return {darkFrac:+(dark/tot).toFixed(3),hits:[...hits.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8),
  samples,
  biome:(S.ctx.biomeAt(px,pz)||{}).id,
  groundCol:S.ctx.groundColour?S.ctx.groundColour(px,pz,S.ctx.groundY(px,pz),0).map(v=>+v.toFixed(3)):null,
  sun:{int:r.sunIntensity,col:r.sunColor&&[+r.sunColor.x.toFixed(2),+r.sunColor.y.toFixed(2),+r.sunColor.z.toFixed(2)],
       dir:r.sunDirection&&[+r.sunDirection.x.toFixed(2),+r.sunDirection.y.toFixed(2),+r.sunDirection.z.toFixed(2)]},
  sky:{turbidity:r.sky&&r.sky.turbidity,exposure:r.exposure,envInt:r.envIntensity},
  surfaces:{ground:byName.ground,tree:byName.tree,shrub:byName.shrub,treeBark:byName.treeBark,
            terrainDetail:byName.terrainDetail}};
});
console.log(JSON.stringify(report,null,1));

for(const [name,mode] of [['albedo',3],['normal',2],['rough',4],['depth',5]]){
 await pg.evaluate((m)=>{window.SURVIVOR.game.renderer.debugMode=m;},mode);
 await pg.waitForTimeout(1500);
 await pg.screenshot({path:path.join(OUT,name+'.png')});
}
await pg.evaluate(()=>{window.SURVIVOR.game.renderer.debugMode=0;});
await pg.waitForTimeout(1200);
await pg.screenshot({path:path.join(OUT,'beauty.png')});
console.log('shots in '+OUT);
await b.close();server.close();})();
