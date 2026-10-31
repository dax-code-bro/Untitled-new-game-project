#!/usr/bin/env node
/* Read the adaptation buffer back and report the average scene
 * luminance, so post.autoKey can be set to a measured number rather
 * than a guess. Prints it for an open daylight frame and for a frame
 * inside a wood, which is the pair the whole feature exists for. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/expose';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8187,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:900,height:520}});
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
await pg.goto('http://localhost:8187/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(7000);
await pg.evaluate(()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=11*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}
 const v=document.getElementById('vignette');if(v)v.style.display='none';
 const d=document.getElementById('damage');if(d)d.style.display='none';
 S.player.body.coreTempC=37;S.ctx.state.benchOpen=true;
 // Turn the passes on so there is something to read.
 S.game.renderer.post.autoKey=0.0001;});
const read=()=>pg.evaluate(()=>{const r=window.SURVIVOR.game.renderer,gl=r.gl;
 if(!r.autoExposure)return {err:'no float targets'};
 const fb=r.adapt[r._adaptIdx];
 gl.bindFramebuffer(gl.FRAMEBUFFER,fb.handle);
 const px=new Float32Array(4);
 gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,px);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 return {logLum:px[0],lum:Math.exp(px[0])};});
const look=(dir)=>pg.evaluate((d)=>{const S=window.SURVIVOR,g=S.game;
 const y=S.ctx.groundY(S.player.x,S.player.z);
 g.lookAt([S.player.x,y+1.62,S.player.z],[S.player.x+Math.sin(d)*10,y+1.5+(d<0?3:0),S.player.z+Math.cos(d)*10]);},dir);
// Thickest wood, then the opposite way (open ground).
const th=await pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game;const px=S.player.x,pz=S.player.z;let best=null;
 for(let a=0;a<36;a++){const t=a/36*Math.PI*2;let n=0;
  for(const ac of g.actors){if(!/^tree$/.test(ac.name||''))continue;
   const dx=ac.position.x-px,dz=ac.position.z-pz;const dd=Math.hypot(dx,dz);
   if(dd<120&&Math.abs(Math.atan2(dx,dz)-t)<0.35)n++;}
  if(!best||n>best.n)best={n,t};}return best.t;});
for(const [name,dir] of [['into the wood',th],['away, open ground',th+Math.PI]]){
 await look(dir); await pg.waitForTimeout(3000);
 const r=await read();
 console.log(name.padEnd(20), r.err||('avg scene luminance '+r.lum.toFixed(4)+'   (log '+r.logLum.toFixed(3)+')'));
 await pg.screenshot({path:path.join(OUT,name.replace(/[^a-z]+/g,'_')+'.png')});
}
await b.close();server.close();})();
