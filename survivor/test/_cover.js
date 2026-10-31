#!/usr/bin/env node
/* How much of the ground is actually covered by grass?
 *
 * Points the camera straight down at the ground and renders the same
 * patch twice, once with the field drawn and once with it suppressed,
 * then counts the pixels that changed. That fraction IS the coverage —
 * no judgement, no squinting at a screenshot and calling it "patchy".
 * Also reports the field's real density in blades per square metre at
 * each quality tier, which is the number that decides the answer.
 */
const fs=require('fs'),path=require('path'),http=require('http'),url=require('url');
const sharp=require('/tmp/imgtools/node_modules/sharp');
const {chromium}=require('playwright');
const SITE=path.join(__dirname,'..','..','site');
const OUT=process.env.SHOT_DIR||'/tmp/claude-0/cover';
const MIME={'.html':'text/html','.js':'text/javascript'};
const server=http.createServer((q,r)=>{let p=path.join(SITE,decodeURIComponent(url.parse(q.url).pathname));
 if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,b)=>{if(e){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});

const BOOT=()=>{const S=window.SURVIVOR;S.world.clock.simSeconds=12*3600;
 for(const id of ['hud','help','tutorial','compass','crosshair','prompt','hotbar']){const e=document.getElementById(id);if(e)e.hidden=true;}
 const v=document.getElementById('vignette');if(v)v.style.display='none';
 const d=document.getElementById('damage');if(d)d.style.display='none';
 S.player.body.coreTempC=37;S.ctx.state.benchOpen=true;
 /* Kill every per-frame perturbation before measuring anything by
    comparing two frames. The composite adds film grain seeded on
    fract(uTime), so two frames of an identical scene differ in every
    single pixel — a difference count run against that reports fifty
    per cent ground cover for a field with no blades in view at all,
    which is what it did. Trapped rather than assigned: the grade is
    re-applied from the sky preset on every tick. */
 const r=S.game.renderer;
 for(const k of ['grain','chromatic'])
   Object.defineProperty(r.post,k,{get:()=>0,set(){},configurable:true});
 /* And still the wind: blades and crowns sway on uTime, so a
    difference count between two frames picks up every leaf that moved
    as though it were ground newly covered. Under a canopy that was
    worth forty points of apparent coverage. */
 if(r.wind)Object.defineProperty(r.wind,'strength',{get:()=>0,set(){},configurable:true});};

/* Stand in open grassland away from trees, and look down. Looking down
   is the only honest view for this: from eye level a sparse field hides
   behind its own perspective foreshortening and looks far denser than
   it is. */
const GOTO=(arg)=>{const [wantIds,pitchDown]=arg;
 const S=window.SURVIVOR,g=S.game,want=new Set(wantIds);
 if(!window.__origin)window.__origin=[S.player.x,S.player.z];
 const [ox,oz]=window.__origin;
 let found=null;
 for(let r=0;r<2600&&!found;r+=20){
  for(let a=0;a<32;a++){
   const t=a/32*Math.PI*2,x=ox+Math.cos(t)*r,z=oz+Math.sin(t)*r;
   const b=S.ctx.biomeAt(x,z);
   if(!b||!want.has(b.id))continue;
   if(S.ctx.groundY(x,z)<0.6)continue;
   // Open ground: no trunk within fifteen metres.
   let clear=true;
   for(const ac of g.actors){
    if(!/^(tree|trunk|treeBark|shrub)$/.test(ac.name||''))continue;
    if(Math.hypot(ac.position.x-x,ac.position.z-z)<15){clear=false;break;}
   }
   if(clear){found=[x,z];break;}
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
 const eye=1.62,d=pitchDown||1.0;
 g.lookAt([x,y+eye,z],[x+0.01,y+eye-d,z]);
 window.__eye=[x,y+eye,z];
 return {hit,x:Math.round(x),z:Math.round(z),biome:(S.ctx.biomeAt(x,z)||{}).id};};

const FIELD=()=>{const g=window.SURVIVOR.game,gr=g.grass;
 if(!gr)return {err:'no grass field'};
 /* Put the field under the camera before counting it. moveGrass only
    recenters from the player's position on its own schedule, and a
    measurement taken while the field is still sitting two kilometres
    away at the spawn is a measurement of bare terrain. */
 const S=window.SURVIVOR;
 gr.recenter([S.player.x,S.ctx.groundY(S.player.x,S.player.z),S.player.z],{minMoveM:0});
 const _a=S.ctx&&S.ctx.avatar;const av=_a?_a.position:null;
 const where={player:[Math.round(S.player.x),Math.round(S.player.z)],
  avatar:av?[Math.round(av.x),Math.round(av.z)]:null,
  hasController:!!(_a&&_a.controller),
  fieldCentre:[Math.round(gr.center.x),Math.round(gr.center.z)],
  biomeAtPlayer:(S.ctx.biomeAt(S.player.x,S.player.z)||{}).id,
  biomeAtAvatar:av?(S.ctx.biomeAt(av.x,av.z)||{}).id:null};
 /* Ask the scatter for a specific number and see what it delivers.
    The gap between the two is the acceptance rate of all the rejection
    stages put together, which is the number that decides whether this
    field is sparse because of its cap or because of its own filters. */
 const probe=[];
 for(const want of [20000,60000,200000]){
  const t0=performance.now();
  const got=gr.scatter({count:want,center:gr.center});
  const ms=performance.now()-t0;
  probe.push(want+'->'+got+' in '+ms.toFixed(0)+'ms ('+(1000*ms/Math.max(1,got)).toFixed(2)+'us/blade)');
 }
 /* The density law, verified rather than assumed: bucket every
    instance into one-metre rings and divide by the ring's area. The
    contract is rho(r) = rho0 * min(1, rNear/r), so a ring that is
    flat where it should be falling means the distance taper never
    ran, and a ring far under target means the tiles are not emitting
    what the arithmetic thinks they are. Tufts count as TUFT_EQ
    blades. */
 const RINGS=14, ring=new Array(RINGS).fill(0);
 const px0=S.player.x, pz0=S.player.z;
 const bucket=(buf,n,wgt)=>{for(let i=0;i<n;i++){
   const d=Math.hypot(buf[i*20+12]-px0, buf[i*20+14]-pz0);
   const k=Math.floor(d); if(k<RINGS) ring[k]+=wgt;}};
 bucket(gr.instances,gr.count,1);
 bucket(gr.tuftInstances,gr.tuftCount,7);
 const prof=ring.map((v,k)=>{
   const area=Math.PI*((k+1)*(k+1)-k*k);
   const want=(gr.rho0||0)*Math.min(1,(gr.rNear||2.7)/Math.max(0.5,k+0.5))*(gr.coverMul||1);
   return `${k}-${k+1}m ${Math.round(v/area)}/${Math.round(want)}`;
 }).join('  ');

 /* Variance, counted rather than admired. Four growth forms should
    be present in any sample, the packed per-instance floats should
    all be non-constant, and the seed-head culms should be standing
    clear of the canopy rather than lost in it. */
 let aMin=9,aMax=-9,sMin=9,sMax=-9,gMin=9,gMax=-9,hMin=9,hMax=-9,tall=0;
 for(let i=0;i<gr.count;i++){
  const o=i*20;
  const a=gr.instances[o+3],st=gr.instances[o+7],ag=gr.instances[o+11];
  // column 1 of the matrix is the scaled Y axis; its length is height
  const hy=Math.hypot(gr.instances[o+4],gr.instances[o+5],gr.instances[o+6]);
  if(a<aMin)aMin=a; if(a>aMax)aMax=a;
  if(st<sMin)sMin=st; if(st>sMax)sMax=st;
  if(ag<gMin)gMin=ag; if(ag>gMax)gMax=ag;
  if(hy<hMin)hMin=hy; if(hy>hMax)hMax=hy;
  if(hy>1.45)tall++;
 }
 const variance=`arch ${aMin.toFixed(2)}-${aMax.toFixed(2)}  stiff ${sMin.toFixed(2)}-${sMax.toFixed(2)}`
  +`  age ${gMin.toFixed(2)}-${gMax.toFixed(2)}  heightx ${hMin.toFixed(2)}-${hMax.toFixed(2)}`
  +`  tall(culm) ${(100*tall/Math.max(1,gr.count)).toFixed(0)}%`;

 // How many of them are within six metres — the patch the shot covers.
 let near=0;const cx=S.player.x,cz=S.player.z;
 for(let i=0;i<gr.count;i++){
  const bx=gr.instances[i*20+12],bz=gr.instances[i*20+14];
  if(Math.hypot(bx-cx,bz-cz)<6)near++;
 }
 /* What colour are the blades actually, versus what the biome table
    says they should be? These are separate questions: moveGrass only
    rewrites colorLow/High when the biome id changes, and a blade's
    colour is baked into the instance buffer at scatter time. */
 const lum=(v)=>0.2126*v[0]+0.7152*v[1]+0.0722*v[2];
 let br=0,bg=0,bb=0;
 for(let i=0;i<gr.count;i++){br+=gr.instances[i*20+16];bg+=gr.instances[i*20+17];bb+=gr.instances[i*20+18];}
 const k=Math.max(1,gr.count);
 /* No sRGB decode here. Everything on this path is ALREADY linear:
    parseColor decodes the table once on the way in, and scatter copies
    colorLow/High straight into the instance buffer, which the shader
    uses as linear albedo. Decoding again here reported a correctly
    calibrated 0.16 blade as 0.038 and would have sent me looking for
    a bug in the fix I had just made. */
 const blade=[br/k,bg/k,bb/k];
 const want=[gr.colorLow,gr.colorHigh].map(c=>c?[c.x,c.y,c.z]:null);
 return {count:gr.count,tufts:gr.tuftCount,max:gr.max,area:+(gr.radiusDrawn||gr.area).toFixed(1),
  rho0:Math.round(gr.rho0||0),rSwap:+(gr.rSwap||0).toFixed(1),probe:probe.join('  '),near,prof,variance,
  bladeLum:+lum(blade).toFixed(3),
  bladeRgb:blade.map(v=>+v.toFixed(3)).join(','),
  where:JSON.stringify(where),
  lowRgb:want[0]?want[0].map(v=>+v.toFixed(3)).join(','):null,
  highRgb:want[1]?want[1].map(v=>+v.toFixed(3)).join(','):null,
  lowLum:want[0]?+lum(want[0]).toFixed(3):null,
  highLum:want[1]?+lum(want[1]).toFixed(3):null,
  perM2:+(gr.count/(gr.area*gr.area)).toFixed(1),
  spacingCm:+(100*Math.sqrt((gr.area*gr.area)/Math.max(1,gr.count))).toFixed(1),
  tier:g.renderer.qualityName,maxGrass:g.renderer.quality.maxGrass,
  bladeH:gr.bladeHeight,bladeW:gr.bladeWidth,
  preset:gr.P&&gr.P.preset,variant:gr.P&&gr.P.variant};};

/* Suppress the field with a property trap, not an assignment: the game
   re-scatters and re-counts on its own schedule, and a plain write is
   undone before the next draw. */
const HIDE=()=>{const gr=window.SURVIVOR.game.grass;
 if(!gr)return 0;
 /* Both populations. The field is two buffers now — single blades
    near the camera and nine-blade tufts beyond, with the prostrate
    litter riding in the tuft buffer — and hiding only the blades
    leaves the tufts in both frames of the comparison, so the diff
    reports the blades' contribution alone and calls a closed sward
    twenty per cent covered. */
 if(window.__savedCount===undefined){window.__savedCount=gr.count;window.__savedTuft=gr.tuftCount;}
 Object.defineProperty(gr,'count',{get:()=>0,set(){},configurable:true});
 Object.defineProperty(gr,'tuftCount',{get:()=>0,set(){},configurable:true});
 return 1;};
/* Put the real count back as a plain writable property. `delete` is
   not the inverse of defineProperty here: it removes the accessor and
   leaves nothing behind, so count reads undefined, the batch draws
   nothing, and the "grass on" half of the next comparison is a frame
   with no grass in it — which measures as zero cover and looks exactly
   like a field that failed to get denser. */
const SHOW=()=>{const gr=window.SURVIVOR.game.grass;
 if(!gr||window.__savedCount===undefined)return 0;
 Object.defineProperty(gr,'count',{value:window.__savedCount,writable:true,configurable:true});
 Object.defineProperty(gr,'tuftCount',{value:window.__savedTuft,writable:true,configurable:true});
 window.__savedCount=undefined;
 return 1;};

/* Cover in horizontal bands of the frame. For a level-ish view the row
   of a ground pixel maps monotonically to its distance, so banding by
   row gives cover against distance without any projection maths —
   enough to see whether density is holding up as the ground recedes,
   which is the whole question. */
const bands=async(a,b)=>{
 const A=await sharp(fs.readFileSync(a)).raw().toBuffer({resolveWithObject:true});
 const B=await sharp(fs.readFileSync(b)).raw().toBuffer({resolveWithObject:true});
 const W=A.info.width,H=A.info.height,ch=A.info.channels;
 const out=[];
 for(let k=0;k<4;k++){
  const y0=Math.floor(H*(0.55+k*0.1125)),y1=Math.floor(H*(0.55+(k+1)*0.1125));
  let ch2=0,tot=0;
  for(let y=y0;y<y1;y++)for(let x=0;x<W;x++){
   const i=(y*W+x)*ch;tot++;
   const d=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
   if(d>12)ch2++;
  }
  out.push(Math.round(100*ch2/tot));
 }
 // Far band first: that is the distant ground, nearest the horizon.
 return out.reverse().join('% / ')+'%';};

/* The unambiguous cover measurement: paint every blade magenta and
   count magenta pixels.

   A differential pixel count between grass-on and grass-off is only
   as good as the contrast between the blades and the ground behind
   them — and the sward is now deliberately tinted a third of the way
   toward the soil it grows out of, precisely so the gaps read as
   shadow rather than as holes. That makes the two frames agree where
   the grass is doing its job best, so the diff reports a closed field
   as two-thirds covered. Magenta has no such problem: nothing else in
   the scene is magenta, so every magenta pixel is a blade and every
   pixel that is not is ground, sky or a tree. */
const PAINT=()=>{const gr=window.SURVIVOR.game.grass;
 if(!gr)return 0;
 const paint=(buf,n,mesh,ver)=>{
  for(let i=0;i<n;i++){buf[i*20+16]=1;buf[i*20+17]=0;buf[i*20+18]=1;}
  mesh.uploadInstances(buf.subarray(0,n*20),n,ver);
 };
 paint(gr.instances,gr.count,gr.mesh,-1);
 if(gr.tuftCount)paint(gr.tuftInstances,gr.tuftCount,gr.tuftMesh,-2);
 // Stop the field rebuilding and repainting itself in natural colours.
 gr.update=()=>false; gr.recenter=()=>false; gr._rebuild=()=>0;
 return 1;};

const magentaBands=async(f)=>{
 const A=await sharp(fs.readFileSync(f)).raw().toBuffer({resolveWithObject:true});
 const W=A.info.width,H=A.info.height,ch=A.info.channels;
 const out=[];
 for(let k=0;k<4;k++){
  const y0=Math.floor(H*(0.55+k*0.1125)),y1=Math.floor(H*(0.55+(k+1)*0.1125));
  let hit=0,tot=0;
  for(let y=y0;y<y1;y++)for(let x=0;x<W;x++){
   const i=(y*W+x)*ch,r=A.data[i],g=A.data[i+1],b=A.data[i+2];
   tot++;
   if(r>18&&b>18&&g<0.62*Math.min(r,b))hit++;
  }
  out.push(Math.round(100*hit/tot));
 }
 return out.reverse().join('% / ')+'%';};

const diff=async(a,b)=>{
 const A=await sharp(fs.readFileSync(a)).raw().toBuffer({resolveWithObject:true});
 const B=await sharp(fs.readFileSync(b)).raw().toBuffer({resolveWithObject:true});
 const n=Math.min(A.data.length,B.data.length),ch=A.info.channels;
 let changed=0,total=0;
 for(let i=0;i<n;i+=ch){
  total++;
  const d=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
  if(d>12)changed++;
 }
 return +(100*changed/total).toFixed(1);};

(async()=>{fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
 args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
/* Looking LEVEL from standing height, which is the view that decides
   whether a field reads as closed. Straight down is the wrong test for
   a vertical blade: from above, a 14 mm blade presents 14 mm x its
   lean, about a thousandth of a square metre, so a field that looks
   solid from the eye measures as bare ground from a helicopter. What
   closes a sward is occlusion along a grazing sightline, where a blade
   blocks a path proportional to its HEIGHT. Both views are kept — the
   down-view is the right test for prostrate litter — but the level one
   is the number to move. */
const LEVEL=(arg)=>{const S=window.SURVIVOR,g=S.game;
 const e=window.__eye;
 g.lookAt(e,[e[0]+10,e[1]-0.9,e[2]]);};
const SPOTS=[['meadow',['meadow','prairie']],['woodland',['woodland','riverbank','freshMarsh']]];
for(const [name,ids] of SPOTS){
 const pg=await b.newPage({viewport:{width:900,height:620}});
 pg.on('pageerror',e=>console.log('  PAGEERROR',e.message));
 await pg.goto(`http://localhost:${PORT}/survivor/index.html`,{waitUntil:'load'});
 await pg.waitForSelector('#startBtn:not([hidden])',{timeout:300000});
 await pg.click('#startBtn');await pg.waitForTimeout(7000);
 await pg.evaluate(BOOT);
 const at=await pg.evaluate(GOTO,[ids,1.05]);
 await pg.waitForTimeout(3000);
 await pg.evaluate(GOTO,[ids,1.05]);
 await pg.waitForTimeout(2200);
 const f=await pg.evaluate(FIELD);
 const on=path.join(OUT,name+'-on.png'),off=path.join(OUT,name+'-off.png');
 try{await pg.screenshot({path:on,timeout:120000});}catch(e){console.log('  shot failed');}
 await pg.evaluate(HIDE);
 await pg.waitForTimeout(1800);
 try{await pg.screenshot({path:off,timeout:120000});}catch(e){console.log('  shot failed');}
 const cov=await diff(on,off);
 // And again, level, which is the view that matters.
 await pg.evaluate(SHOW);
 await pg.evaluate(LEVEL);await pg.waitForTimeout(1600);
 const lon=path.join(OUT,name+'-level-on.png'),loff=path.join(OUT,name+'-level-off.png');
 try{await pg.screenshot({path:lon,timeout:120000});}catch(e){}
 await pg.evaluate(HIDE);await pg.waitForTimeout(1600);
 try{await pg.screenshot({path:loff,timeout:120000});}catch(e){}
 const lv=await bands(lon,loff);
 // Then the magenta pass, which is the number to trust.
 await pg.evaluate(SHOW);
 await pg.evaluate(PAINT);
 await pg.waitForTimeout(1700);
 const mg=path.join(OUT,name+'-magenta.png');
 try{await pg.screenshot({path:mg,timeout:120000});}catch(e){}
 const mb=await magentaBands(mg);
 console.log(`${name.padEnd(10)} ${at.biome||'?'}${at.hit?'':' (fallback)'}  `
  +`tier ${f.tier} cap ${f.maxGrass}  ${f.count} blades over ${f.area}m sq  `
  +`${f.count}+${f.tufts} inst, R ${f.area}m, rho0 ${f.rho0}/m2, swap ${f.rSwap}m   down-view ${cov}%`);
 console.log(`${''.padEnd(10)} level diff   far->near: ${lv}`);
 console.log(`${''.padEnd(10)} MAGENTA COVER far->near: ${mb}`);
 console.log(`${''.padEnd(10)} density got/want: ${f.prof}`);
 console.log(`${''.padEnd(10)} variance: ${f.variance}`);
 console.log(`${''.padEnd(10)} field max ${f.max}  blades within 6m of camera: ${f.near}`
  +`   scatter asked->got:  ${f.probe}`);
 console.log(`${''.padEnd(10)} blade colour linear ${f.bladeRgb} lum ${f.bladeLum}  fieldLow ${f.lowRgb} fieldHigh ${f.highRgb}`
  +`   biome table wants lum ${f.lowLum} to ${f.highLum}`);
 console.log(`${''.padEnd(10)} ${f.where}`);
 await pg.close();
}
await b.close();server.close();})();
