const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/dollshots';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8133,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1280,height:800}});
pg.on('pageerror',e=>console.log('ERR',e.message));
pg.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
await pg.goto('http://localhost:8133/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(3000);
await pg.screenshot({path:path.join(OUT,'hud.png')});
await pg.keyboard.press('Tab');await pg.waitForTimeout(700);
await pg.screenshot({path:path.join(OUT,'doll.png')});
// put on a coat we conjure into the pack, to prove the loop
const r=await pg.evaluate(()=>{const S=window.SURVIVOR;const G=S.ctx.state.GARMENT;
 for(const id of ['hideCoat','furHat','workGloves','packLarge']){const g=G[id];
  S.player.inventory.add({item:id,quantity:1,stackable:false,massKg:g.massKg,volumeL:g.volumeL});}
 return true;});
await pg.keyboard.press('Tab');await pg.waitForTimeout(200);await pg.keyboard.press('Tab');await pg.waitForTimeout(600);
await pg.screenshot({path:path.join(OUT,'doll-spare.png')});
const put=await pg.evaluate(()=>{const S=window.SURVIVOR;
 for(const id of ['hideCoat','furHat','workGloves','packLarge'])S.ctx.state.wearGarment(id);
 return {clo:S.player.body.clothingClo,wet:S.player.body.clothingWetLoss,cap:S.player.inventory.capacityKg,outfit:S.ctx.state.outfit};});
console.log(JSON.stringify(put));
await pg.keyboard.press('Tab');await pg.waitForTimeout(200);await pg.keyboard.press('Tab');await pg.waitForTimeout(600);
await pg.screenshot({path:path.join(OUT,'doll-dressed.png')});
await pg.keyboard.press('Escape');await pg.waitForTimeout(400);
await pg.evaluate(()=>{const S=window.SURVIVOR;const p=S.game.camera.position;
 S.game.camera.target.set(p.x+0.05,p.y-1.05,p.z+1.0);S.game._camMode='manual';});
await pg.waitForTimeout(900);
await pg.screenshot({path:path.join(OUT,'dressed-body.png')});
await b.close();server.close();})();
