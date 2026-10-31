#!/usr/bin/env node
/* A fixed tour of the island for looking at. Same shots every run, so
 * two runs can be put side by side and the difference is the change
 * rather than the weather. Also captures the near/far detail ladder at
 * both ends, which is the thing hardest to judge from one frame. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/tour';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});

const BOOT=()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=10.5*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}
 const v=document.getElementById('vignette');if(v)v.style.display='none';
 const d=document.getElementById('damage');if(d)d.style.display='none';
 S.player.body.coreTempC=37;S.ctx.state.benchOpen=true;};

/* Walk to the first point matching a predicate on the biome, by sampling
   a spiral out from where we started. Teleports: this is a camera, not
   a playthrough. */
const GOTO=(arg)=>{const [wantIds,eyeH,pitch]=arg;const S=window.SURVIVOR,g=S.game;
 const want=new Set(wantIds);
 if(!window.__origin)window.__origin=[S.player.x,S.player.z];
 const [ox,oz]=window.__origin;
 let found=null;
 for(let r=0;r<2600&&!found;r+=20){
  for(let a=0;a<32;a++){
   const t=a/32*Math.PI*2, x=ox+Math.cos(t)*r, z=oz+Math.sin(t)*r;
   const b=S.ctx.biomeAt(x,z);
   if(b&&want.has(b.id)&&S.ctx.groundY(x,z)>0.6){found=[x,z];break;}
  }
 }
 const hit=!!found;
 if(!found)found=[ox,oz];
 const [x,z]=found;
 /* Move the AVATAR, not the player record. stepPlayer() copies
    avatar.position into player.x/z on every tick, so writing player.x
    directly is undone before the next frame — the camera obeyed it
    (lookAt is set straight on the engine) while the simulation quietly
    snapped back to the spawn, which is how a tour of five biomes came
    out standing in the same dune five times with the camera pointed
    somewhere else. */
 const av=S.ctx&&S.ctx.avatar;
 if(av&&av.controller&&av.controller.teleport)av.controller.teleport([x,S.ctx.groundY(x,z)+1.2,z]);
 else if(av&&av.setPosition)av.setPosition([x,S.ctx.groundY(x,z)+1.2,z]);
 S.player.x=x;S.player.z=z;
 const y=S.ctx.groundY(x,z);
 // Face whichever way has the most to look at.
 let best=null;
 for(let a=0;a<24;a++){const t=a/24*Math.PI*2;let n=0;
  for(const ac of g.actors){const dx=ac.position.x-x,dz=ac.position.z-z;const dd=Math.hypot(dx,dz);
   if(dd<140&&dd>6&&Math.abs(Math.atan2(dx,dz)-t)<0.4)n++;}
  if(!best||n>best.n)best={n,t};}
 g.lookAt([x,y+eyeH,z],[x+Math.sin(best.t)*10,y+eyeH+(pitch||0),z+Math.cos(best.t)*10]);
 return {x:Math.round(x),z:Math.round(z),hit,biome:(S.ctx.biomeAt(x,z)||{}).id};};

const SHOTS=[
 ['01-wood',       ['deepForest','pineForest','woodland'], 1.62, -0.2],
 ['02-meadow',     ['meadow','prairie'],                   1.62,  0.3],
 ['03-shore',      ['beach','dune'],                       1.62,  0.4],
 ['04-hills',      ['rockyHill','scree','alpine'],         1.62,  0.6],
 ['05-marsh',      ['saltMarsh','freshMarsh','riverbank'], 1.62,  0.2],
 ['06-underfoot',  ['meadow','prairie','woodland'],        0.55, -1.4],
];
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1000,height:580}});
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
await pg.goto(`http://localhost:${PORT}/survivor/index.html`,{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(7000);
await pg.evaluate(BOOT);
const only=process.argv.slice(2);
for(const [name,ids,eye,pitch] of SHOTS.filter(x=>!only.length||only.some(o=>x[0].includes(o)))){
 const at=await pg.evaluate(GOTO,[ids,eye,pitch]);
  await pg.waitForTimeout(2600);
 await pg.evaluate(GOTO,[ids,eye,pitch]);   // re-aim now the cell has loaded
  await pg.waitForTimeout(1900);
 try{await pg.screenshot({path:path.join(OUT,name+'.png'),timeout:120000});}catch(e){console.log('  '+name+' SHOT FAILED '+e.message.split('\n')[0]);}
 console.log('  '+name.padEnd(14)+(at.hit?'':'NOT FOUND, fell back  ')+at.biome+'  at '+at.x+','+at.z);
}
if(only.length&&!only.includes('ladder')){await b.close();server.close();return;}
/* The ladder, at both ends, from one spot. */
await pg.evaluate(GOTO,[['deepForest','pineForest','woodland'],1.62,-0.1]);
await pg.waitForTimeout(3000);
for(const [n,bias] of [['07-ladder-on',1],['07-ladder-off',1e6]]){
 await pg.evaluate((x)=>{window.SURVIVOR.game.lodBias=x;},bias);
 await pg.waitForTimeout(2600);
 try{await pg.screenshot({path:path.join(OUT,n+'.png'),timeout:120000});}catch(e){console.log('  '+n+' SHOT FAILED');}
 console.log('  '+n);
}
await pg.evaluate(()=>{window.SURVIVOR.game.lodBias=1;});
// Does the canopy cast a shadow with holes in it, or a solid cone?
await pg.evaluate(()=>{window.SURVIVOR.game.renderer.debugMode=1;});
await pg.waitForTimeout(2200);
try{await pg.screenshot({path:path.join(OUT,'08-shadowmask.png'),timeout:120000});}catch(e){console.log('  08 SHOT FAILED');}
console.log('  08-shadowmask');
await b.close();server.close();})();
