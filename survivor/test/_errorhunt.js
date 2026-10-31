#!/usr/bin/env node
/* Drive every screen and every weapon, and write down everything the
 * browser complains about. A console warning in a game nobody reads is
 * a bug nobody has found yet.
 *   node survivor/test/_errorhunt.js
 */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{
await new Promise(r=>server.listen(8151,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1280,height:720}});
const seen=new Map();
const note=(k,s)=>{const key=(k+' '+s).slice(0,220);seen.set(key,(seen.get(key)||0)+1);};
pg.on('pageerror',e=>note('PAGEERROR',e.message+' | '+String(e.stack||'').split('\n')[1]));
pg.on('console',m=>{const t=m.type();if(t==='error'||t==='warning')note(t.toUpperCase(),m.text());});
pg.on('requestfailed',r=>note('REQFAIL',r.url().slice(-80)+' '+(r.failure()||{}).errorText));
await pg.goto('http://localhost:8151/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');
await pg.waitForTimeout(7000);

// Every screen the game can open.
const keys=['Tab','m','c','n','x','v','Escape','Shift+C','Shift+V','Shift+I','Shift+K','i','g','f','Shift+G','b','r','y','h','p','t','q','j','u','l','z','Shift+Z','Shift+L'];
for(const k of keys){
  try{await pg.keyboard.press(k);}catch(e){note('KEYFAIL',k+' '+e.message);}
  await pg.waitForTimeout(260);
  await pg.keyboard.press('Escape').catch(()=>{});
  await pg.waitForTimeout(120);
}
// Every weapon, worked and fired.
for(const n of ['1','2','3','4','5']){
  await pg.keyboard.press(n);await pg.waitForTimeout(1400);
  await pg.keyboard.press('l');await pg.waitForTimeout(500);
  await pg.keyboard.press('z');await pg.waitForTimeout(600);
  await pg.mouse.down();await pg.waitForTimeout(350);await pg.mouse.up();
  await pg.waitForTimeout(700);
}
// Walk, run, crouch, jump — the movement paths.
for(const [k,ms] of [['w',1800],['a',700],['s',700],['d',700]]){
  await pg.keyboard.down(k);await pg.waitForTimeout(ms);await pg.keyboard.up(k);
}
await pg.keyboard.down('Shift');await pg.keyboard.down('w');await pg.waitForTimeout(2200);
await pg.keyboard.up('w');await pg.keyboard.up('Shift');
await pg.keyboard.press('Space');await pg.waitForTimeout(900);
// Time passing, so the day/night and weather paths run.
await pg.evaluate(()=>{window.SURVIVOR.world.clock.simSeconds+=6*3600;});
await pg.waitForTimeout(2500);
await pg.evaluate(()=>{window.SURVIVOR.world.clock.simSeconds+=10*3600;});
await pg.waitForTimeout(2500);

const gl=await pg.evaluate(()=>{
  const S=window.SURVIVOR;const c=document.querySelector('canvas');
  const g=c&&(c.getContext('webgl2')||null);
  return {actors:S.game.actors.length,
   fps:Math.round(S.game.fps||0),
   glError:g?g.getError():'no ctx',
   scansReady:S.game.actors.filter(a=>a.material&&a.material.scan&&a.material.scanReady).length,
   scansTotal:S.game.actors.filter(a=>a.material&&a.material.scan).length};
});
console.log('STATE',JSON.stringify(gl));
console.log('--- distinct complaints:',seen.size,'---');
for(const [k,n] of [...seen.entries()].sort((a,b)=>b[1]-a[1])) console.log(String(n).padStart(5),k);
await b.close();server.close();})();
