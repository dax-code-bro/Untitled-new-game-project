#!/usr/bin/env node
/* The same view with the detail ladder on and off. If the pair are hard
 * to tell apart, the ladder is set right; if the far trees melt, it is
 * too aggressive. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/lod';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8155,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1100,height:620}});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('http://localhost:8155/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(7000);
await pg.evaluate(()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=11*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}
 document.getElementById('vignette').style.display='none';document.getElementById('damage').style.display='none';
 S.player.body.coreTempC=37;S.ctx.state.benchOpen=true;});
/* Face the thickest stand of trees we can find, so the comparison is
   about the thing the ladder actually touches. */
await pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game;
 const px=S.player.x,pz=S.player.z;let best=null;
 for(let a=0;a<36;a++){const th=a/36*Math.PI*2;let n=0;
  for(const ac of g.actors){if(!/^tree$/.test(ac.name||''))continue;
   const dx=ac.position.x-px,dz=ac.position.z-pz;const d=Math.hypot(dx,dz);
   if(d<120&&Math.abs(Math.atan2(dx,dz)-th)<0.35)n++;}
  if(!best||n>best.n)best={n,th};}
 const y=S.ctx.groundY(px,pz);
 g.lookAt([px,y+1.62,pz],[px+Math.sin(best.th)*10,y+1.5,pz+Math.cos(best.th)*10]);
 return best.n;});
for(const [name,bias] of [['on',1],['off',1e6]]){
 await pg.evaluate((b)=>{window.SURVIVOR.game.lodBias=b;},bias);
 await pg.waitForTimeout(2600);
 await pg.screenshot({path:path.join(OUT,'trees-'+name+'.png')});
 console.log('  trees-'+name);
}
await b.close();server.close();})();
