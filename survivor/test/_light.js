#!/usr/bin/env node
/* The lighting numbers the renderer is actually running on, plus the two
 * halves of the shading separated out. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const sharp=require('/tmp/imgtools/node_modules/sharp');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/light';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8183,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:900,height:520}});
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
await pg.goto('http://localhost:8183/survivor/index.html',{waitUntil:'load'});
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
await pg.waitForTimeout(1500);
const nums=await pg.evaluate(()=>{const r=window.SURVIVOR.game.renderer;
 const v3=(o)=>o?[+o.x.toFixed(3),+o.y.toFixed(3),+o.z.toFixed(3)]:null;
 return {sun:{int:r.sun&&+r.sun.intensity.toFixed(2),col:v3(r.sun&&r.sun.color),dir:v3(r.sun&&r.sun.direction)},
  sky:{int:r.sky&&+r.sky.intensity.toFixed(3),zenith:v3(r.sky&&r.sky.zenith),horizon:v3(r.sky&&r.sky.horizon),ground:v3(r.sky&&r.sky.ground)},
  post:r.post&&{exposure:r.post.exposure,contrast:r.post.contrast,saturation:r.post.saturation,vignette:r.post.vignette,bloom:r.post.bloomStrength},
  fog:r.fog&&{density:r.fog.density,color:v3(r.fog.color)}};});
console.log(JSON.stringify(nums,null,1));
const stat=async(f)=>{const {data,info}=await sharp(fs.readFileSync(f)).raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,ch=info.channels;let s=0,n=0;
 for(let y=Math.floor(H*0.62);y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*ch;
  s+=(data[i]*0.21+data[i+1]*0.72+data[i+2]*0.07)/255;n++;}
 return +(s/n).toFixed(3);};
for(const [name,mode] of [['beauty',0],['shadow',1],['ao',6],['ambient',7],['albedo',8]]){
 await pg.evaluate((m)=>{window.SURVIVOR.game.renderer.debugMode=m;},mode);
 await pg.waitForTimeout(1400);
 const f=path.join(OUT,name+'.png');await pg.screenshot({path:f});
 console.log('  '+name.padEnd(8)+' near-ground mean '+await stat(f));
}
await b.close();server.close();})();
