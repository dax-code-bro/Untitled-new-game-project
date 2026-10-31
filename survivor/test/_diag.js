#!/usr/bin/env node
/* Ask the running game what it thinks it is drawing, instead of
 * squinting at a screenshot and guessing. Prints numbers; also renders
 * the same view with one thing disabled at a time, so a dark patch can
 * be attributed to a shadow, an albedo or a light rather than argued
 * about. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/diag';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(8161,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg=await b.newPage({viewport:{width:1100,height:620}});
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
pg.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,200));});
await pg.goto('http://localhost:8161/survivor/index.html',{waitUntil:'load'});
await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
await pg.click('#startBtn');await pg.waitForTimeout(7000);
await pg.evaluate(()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=11*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}
 const v=document.getElementById('vignette');if(v)v.style.display='none';
 const d=document.getElementById('damage');if(d)d.style.display='none';
 S.player.body.coreTempC=37;S.ctx.state.benchOpen=true;});

// Stand in the thickest wood we can find and look level into it.
await pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game;
 const px=S.player.x,pz=S.player.z;let best=null;
 for(let a=0;a<36;a++){const th=a/36*Math.PI*2;let n=0;
  for(const ac of g.actors){if(!/^tree$/.test(ac.name||''))continue;
   const dx=ac.position.x-px,dz=ac.position.z-pz;const d=Math.hypot(dx,dz);
   if(d<120&&Math.abs(Math.atan2(dx,dz)-th)<0.35)n++;}
  if(!best||n>best.n)best={n,th};}
 const y=S.ctx.groundY(px,pz);
 g.lookAt([px,y+1.62,pz],[px+Math.sin(best.th)*10,y+1.5,pz+Math.cos(best.th)*10]);});
await pg.waitForTimeout(1500);

const info=await pg.evaluate(()=>{const S=window.SURVIVOR,g=S.game,r=g.renderer;
 const px=S.player.x,pz=S.player.z;
 const bi=S.ctx.biomeAt(px,pz);
 const out={biome:bi&&bi.id,sun:null,ambient:null,ground:null,grass:null,foliage:null,terrain:null,batches:null};
 const sun=r.sun||g.sun||(r.lights&&r.lights[0]);
 if(sun)out.sun={dir:sun.direction&&[+sun.direction.x.toFixed(2),+sun.direction.y.toFixed(2),+sun.direction.z.toFixed(2)],
   color:sun.color&&[+sun.color.x.toFixed(3),+sun.color.y.toFixed(3),+sun.color.z.toFixed(3)],intensity:sun.intensity};
 if(r.ambient)out.ambient={c:[+r.ambient.x.toFixed(3),+r.ambient.y.toFixed(3),+r.ambient.z.toFixed(3)]};
 if(r.envIntensity!=null)out.envIntensity=r.envIntensity;
 // What colour is the ground actually painted, right here?
 if(S.ctx.groundColour)out.ground=S.ctx.groundColour(px,pz,S.ctx.groundY(px,pz),0).map(v=>+v.toFixed(3));
 if(g.grass)out.grass={low:g.grass.colorLow&&[+g.grass.colorLow.x.toFixed(3),+g.grass.colorLow.y.toFixed(3),+g.grass.colorLow.z.toFixed(3)],
   high:g.grass.colorHigh&&[+g.grass.colorHigh.x.toFixed(3),+g.grass.colorHigh.y.toFixed(3),+g.grass.colorHigh.z.toFixed(3)],
   count:g.grass.count};
 // Material facts for the two things that dominate this view.
 const mats=new Map();
 for(const a of g.actors){if(a.material&&!mats.has(a.name))mats.set(a.name,a.material);}
 const pick=(n)=>{const m=mats.get(n);if(!m)return null;
   return {id:m.id,alphaClip:!!m.alphaClip,hasMaps:!!m.maps,scan:m.scan||null,scanReady:!!m.scanReady,
     uvScale:+(m.uvScale||1).toFixed(3),detailScale:m.detailScale||0,vertexColor:!!m.vertexColor,
     subsurface:+(m.subsurface||0).toFixed(2),
     color:[+m.color.x.toFixed(3),+m.color.y.toFixed(3),+m.color.z.toFixed(3)]};};
 out.foliage=pick('tree');out.terrain=pick('ground');out.names=[...mats.keys()].slice(0,30);
 const bs=g._buildBatches?null:null;
 out.batches={total:g._batchGroups?g._batchGroups.size:0,actors:g.actors.length};
 return out;});
console.log(JSON.stringify(info,null,1));

/* Attribute the darkness. Each variant turns off exactly one thing. */
const variants=[
 ['base',   ()=>{}],
 ['noshadow',()=>{const r=window.SURVIVOR.game.renderer;r.shadowsEnabled=false;if(r.shadows)r.shadows=false;}],
 ['albedo', ()=>{window.SURVIVOR.game.renderer.debugMode=1;}],
 ['nograss',()=>{const g=window.SURVIVOR.game;if(g.grass)g.grass.count=0;}],
];
for(const [name,fn] of variants){
 await pg.evaluate(`(${fn.toString()})()`);
 await pg.waitForTimeout(1800);
 await pg.screenshot({path:path.join(OUT,name+'.png')});
 console.log('  '+name);
 await pg.reload({waitUntil:'load'});
 if(name!=='nograss'){
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
 }
}
await b.close();server.close();})();
