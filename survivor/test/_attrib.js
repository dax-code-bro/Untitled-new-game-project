#!/usr/bin/env node
/* Attribute the darkness, numerically. Renders the same view with one
 * class of object removed at a time and prints the mean brightness of
 * the lower half of the frame for each, so "the ground is black"
 * becomes a number with a cause attached instead of an impression. */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const sharp=require('/tmp/imgtools/node_modules/sharp');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/attrib';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
const AIM=()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=11*3600;
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
 g.lookAt([px,y+1.62,pz],[px+Math.sin(best.th)*10,y+1.5,pz+Math.cos(best.th)*10]);};
/* Each variant returns how many things it actually changed.

   An earlier version of this set r.shadowsEnabled and material.aoStrength,
   neither of which exists on anything here, so three variants rendered
   byte-identical frames and the harness reported them as "the same" —
   which reads exactly like "this makes no difference" and is in fact
   "nothing was switched off". A probe that cannot tell those two apart
   is worse than no probe, so every lever now has to prove it moved
   something or the run says so in the output. */
const VARIANTS={
 base:()=>0,
 nograss:()=>{const g=window.SURVIVOR.game;let n=0;
   if(g.grass){g.grass.count=0;if(g.grass.actor){g.grass.actor.visible=false;}n++;}
   for(const a of g.actors)if(/grass/i.test(a.name||'')){a.visible=false;n++;}
   return n;},
 notrees:()=>{let n=0;
   for(const a of window.SURVIVOR.game.actors)
     if(/^(tree|treeBark|trunk|shrub)$/.test(a.name||'')){a.visible=false;n++;}
   return n;},
 noshadow:()=>{const r=window.SURVIVOR.game.renderer;let n=0;
   // The real lever: the renderer reads its cascade count from quality.
   if(r.quality&&r.quality.cascades){r.quality.cascades=0;n++;}
   for(const a of window.SURVIVOR.game.actors)
     if(a.material&&a.material.castShadow){a.material.castShadow=false;n++;}
   return n;},
 /* Pinned every frame, not set once. The survivor's own lighting pass
    rewrites sky.intensity from the world clock on every tick, so a
    single assignment here lasts microseconds and the variant renders
    identically to base — reporting "ambient makes no difference",
    which would be a conclusion drawn from a write that was undone
    before anything was drawn. Anything the game owns per-frame has to
    be held down, not nudged. */
 noambient:()=>{const r=window.SURVIVOR.game.renderer;
   if(!r.sky)return 0;
   /* A trap, not an assignment, and not a per-frame pin either. The
      game updates its lighting and renders inside one animation-frame
      callback, so anything scheduled alongside that callback runs
      after the draw it was meant to affect and is overwritten before
      the next one — a pin here measured byte-identical to base, which
      would read as "ambient contributes nothing" when the truth was
      "the write never reached a draw call". Make the property refuse
      to hold any other value and the game's own assignment becomes a
      no-op wherever it happens to sit. */
   Object.defineProperty(r.sky,'intensity',{get:()=>0,set(){},configurable:true});
   const z=r.sky.ground;
   for(const k of ['x','y','z'])Object.defineProperty(z,k,{get:()=>0,set(){},configurable:true});
   return 1;},
};
const stat=async(f)=>{const {data,info}=await sharp(f).raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,ch=info.channels;
 const band=(y0,y1)=>{let s=0,n=0,dark=0;
  for(let y=Math.floor(H*y0);y<Math.floor(H*y1);y++)for(let x=0;x<W;x++){
   const i=(y*W+x)*ch;const l=(data[i]*0.21+data[i+1]*0.72+data[i+2]*0.07)/255;
   s+=l;n++;if(l<0.06)dark++;}
  return {mean:+(s/n).toFixed(3),darkPct:+(100*dark/n).toFixed(1)};};
 return {lower:band(0.55,1.0),upper:band(0.0,0.45)};};
(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const names=process.argv.slice(2).filter(a=>VARIANTS[a]);
const list=names.length?names:Object.keys(VARIANTS);
for(const name of list){
 const pg=await b.newPage({viewport:{width:900,height:520}});
 pg.on('pageerror',e=>console.log('  PAGEERROR',e.message));
 await pg.goto(`http://localhost:${server.address().port}/survivor/index.html`,{waitUntil:'load'});
 await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
 await pg.click('#startBtn');await pg.waitForTimeout(7000);
 await pg.evaluate(AIM);
 await pg.waitForTimeout(1200);
 const changed=await pg.evaluate(`(${VARIANTS[name].toString()})()`);
 if(name!=='base'&&!changed)console.log('  !! '+name+' switched nothing off — the lever does not exist');
 await pg.waitForTimeout(1800);
 const f=path.join(OUT,name+'.png');
 await pg.screenshot({path:f});
 const st=await stat(f);
 console.log(name.padEnd(10),'lower half mean',String(st.lower.mean).padStart(5),
  ' near-black',String(st.lower.darkPct).padStart(5)+'%','   upper mean',st.upper.mean);
 await pg.close();
}
await b.close();server.close();})();
