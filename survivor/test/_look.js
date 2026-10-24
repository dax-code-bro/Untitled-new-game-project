#!/usr/bin/env node
/* Point the camera at the things that matter and photograph each one.
 * This is the loop the whole visual pass runs on: change, render, look.
 *   node survivor/test/_look.js [name ...]
 */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/look';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
const only=process.argv.slice(2);
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8143,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1280,height:720}});
const errs=[];pg.on('pageerror',e=>errs.push('ERR '+e.message));
pg.on('console',m=>{if(m.type()==='error')errs.push('CON '+m.text().slice(0,140));});
await pg.goto('http://localhost:8143/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(6500);
await pg.evaluate(()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=10.5*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar'])
   {const e=document.getElementById(id);if(e)e.hidden=true;}
 document.getElementById('vignette').style.display='none';
 document.getElementById('damage').style.display='none';
 // Keep the body out of scenery shots, and stop the cold killing the
 // subject halfway through the session.
 S.player.body.coreTempC=37; S.player.body.wet=0;
 S.ctx.state.benchOpen=true;});
await pg.waitForTimeout(1200);

/* Fly the camera to a named kind of actor and frame it. */
const frame=async(name,pick,dist,lift)=>{
 return pg.evaluate(({pick,dist,lift})=>{
  const S=window.SURVIVOR,g=S.game;
  const re=new RegExp(pick);
  const px=S.player.x,pz=S.player.z;
  const cands=g.actors.filter(a=>re.test(a.name||'')).map(a=>({a,d:Math.hypot(a.position.x-px,a.position.z-pz)}))
    .filter(x=>x.d>1).sort((x,y)=>x.d-y.d);
  if(!cands.length)return 'none';
  const t=cands[0].a.position;
  g.lookAt([t.x+dist*0.8,t.y+lift,t.z+dist*0.6],[t.x,t.y,t.z]);
  return cands[0].a.name+' @'+cands[0].d.toFixed(0)+'m';
 },{pick,dist,lift});
};
const shot=async(n,fn)=>{if(only.length&&!only.includes(n))return;
 const r=fn?await fn():'';await pg.waitForTimeout(1100);
 await pg.screenshot({path:path.join(OUT,n+'.png')});console.log('  ',n,r||'');};

await shot('01-wide',()=>pg.evaluate(()=>{const S=window.SURVIVOR;S.game._camMode='first';
 const p=S.game.camera.position;S.game.camera.target.set(p.x,p.y-0.12,p.z+1);S.game._camMode='manual';}));
await shot('02-ground',()=>pg.evaluate(()=>{const S=window.SURVIVOR;const p=S.game.camera.position;
 S.game.lookAt([p.x,p.y-0.5,p.z],[p.x+0.6,p.y-1.6,p.z+1.1]);}));
await shot('03-tree',()=>frame('03-tree','^veg:(tree|trunk)|tree','3.0',1.2));
await shot('04-rock',()=>frame('04-rock','rock','2.2',0.6));
await shot('05-shore',()=>pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game,m=S.world.map;
 const half=m.worldSizeM/2;let best=null;
 for(let a=0;a<48;a++){const th=a/48*Math.PI*2;
  for(let r=40;r<half;r+=40){const x=S.player.x+Math.cos(th)*r,z=S.player.z+Math.sin(th)*r;
   const h=m.heightAtWorld(x,z);if(h>-0.2&&h<0.8){const d=Math.hypot(x-S.player.x,z-S.player.z);
    if(!best||d<best.d)best={x,z,h,d};}}}
 if(!best)return 'none';g.lookAt([best.x,best.h+1.7,best.z-26],[best.x,best.h+0.6,best.z+14]);
 return 'shore @'+best.d.toFixed(0)+'m';}));
await shot('06-canopy',()=>pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game;
 const t=g.actors.filter(a=>/veg:/.test(a.name||''))[0];if(!t)return 'none';
 g.lookAt([t.position.x+9,t.position.y+1.5,t.position.z+9],[t.position.x,t.position.y+9,t.position.z]);return 'canopy';}));
const home=async()=>pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game;
 const y=S.ctx.groundY(S.player.x,S.player.z);
 g.camera.position.set(S.player.x,y+1.62,S.player.z);g._camMode='first';});
await shot('07-arm',async()=>{await home();return pg.evaluate(()=>{const S=window.SURVIVOR;S.ctx.state.benchOpen=false;S.game._camMode='first';
 const p=S.game.camera.position;S.game.camera.target.set(p.x+0.05,p.y-1.0,p.z+1.0);S.game._camMode='manual';});});
await shot('08-rifle',async()=>{await home();await pg.evaluate(()=>{window.SURVIVOR.ctx.state.benchOpen=false;window.dispatchEvent(new KeyboardEvent('keydown',{key:'1'}));});
 await pg.waitForTimeout(2600);
 return pg.evaluate(()=>{const S=window.SURVIVOR;S.game._camMode='first';const p=S.game.camera.position;
  S.game.camera.target.set(p.x+0.35,p.y-0.5,p.z+1.0);S.game._camMode='manual';return 'rifle';});});
console.log(errs.length?errs.slice(0,4).join('\n'):'no console errors');
await b.close();server.close();})();
