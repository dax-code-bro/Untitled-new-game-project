const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/scanshots';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8141,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1280,height:720}});
const errs=[];
pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text().slice(0,160));});
await pg.goto('http://localhost:8141/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(6000);
const info=await pg.evaluate(()=>{
 const S=window.SURVIVOR;
 const mats=new Map();
 for(const a of S.game.actors){const m=a.material;if(m&&m.scan)mats.set(m.scan,(mats.get(m.scan)||0)+(m.scanReady?1:0));}
 return {scanIds:(window.LE.scanIds?window.LE.scanIds():[]).length,
   inUse:[...mats.entries()].map(([k,v])=>k+':'+v).join(' '),
   actors:S.game.actors.length};
});
console.log(JSON.stringify(info));
await pg.evaluate(()=>{window.SURVIVOR.world.clock.simSeconds=11*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt']){const e=document.getElementById(id);if(e)e.hidden=true;}});
await pg.waitForTimeout(1500);
await pg.screenshot({path:path.join(OUT,'world.png')});
await pg.evaluate(()=>{const S=window.SURVIVOR;const p=S.game.camera.position;
 S.game.camera.target.set(p.x+0.4,p.y-2.2,p.z+1.0);S.game._camMode='manual';});
await pg.waitForTimeout(1200);
await pg.screenshot({path:path.join(OUT,'ground.png')});
console.log(errs.length?errs.slice(0,5).join('\n'):'no console errors');
await b.close();server.close();})();
