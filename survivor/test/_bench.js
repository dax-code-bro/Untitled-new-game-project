#!/usr/bin/env node
/* What the frame actually costs, and whether level of detail is earning
 * its keep. Measures with the ladder on and with it switched off, from
 * the same viewpoints, so the number is a comparison and not a boast.
 *   node survivor/test/_bench.js
 */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{
await new Promise(r=>server.listen(8153,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1280,height:720}});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('http://localhost:8153/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(7000);
await pg.evaluate(()=>{window.SURVIVOR.world.clock.simSeconds=11*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}});

/* Stand somewhere with a lot in front of you and hold still. */
const view=async(pitch)=>pg.evaluate((pitch)=>{const S=window.SURVIVOR,g=S.game;
 const y=S.ctx.groundY(S.player.x,S.player.z);
 g.lookAt([S.player.x,y+1.62,S.player.z],[S.player.x,y+1.62+pitch,S.player.z+1]);},pitch);

const sample=async(label,bias)=>{
 await pg.evaluate((b)=>{window.SURVIVOR.game.renderer&&(window.SURVIVOR.game.lodBias=b);},bias);
 await pg.waitForTimeout(3500);
 const r=await pg.evaluate(()=>{const S=window.SURVIVOR;
  return {fps:S.game.stats.fps,draws:S.game.stats.draws,actors:S.game.stats.actors,
          drawn:S.game.actors.filter(a=>a._lodOn!==false&&a.visible&&a.mesh).length,
          shadowOff:S.game.actors.filter(a=>a._lodShadow===false).length,
          hidden:S.game.actors.filter(a=>a._lodOn===false).length};});
 console.log(label.padEnd(22), JSON.stringify(r));
 return r;
};
for(const [name,pitch] of [['level',-0.05],['down',-0.9]]){
 await view(pitch);
 await sample(name+' lod on',1);
 await sample(name+' lod off',1e6);
}
await b.close();server.close();})();
