/* Bake the Meshy statue into a rigged asset.

   The model arrives posed and unrigged, so the pose it came in becomes its
   bind pose: the skeleton is bent to match the statue joint for joint, that
   arrangement is frozen with computeBindPose(), and every clip already
   written then plays as a deviation from it. An inverse bind matrix is
   precisely the record of "what pose was this mesh built in", so once it is
   right the existing walk, run and tear all drive this body unchanged.

   Out the other end: positions, normals, UVs, four bone indices and four
   weights per vertex, plus the rig, as one binary the game fetches. */
const LE=require(require('path').resolve(__dirname,'..','..','site/engine/legend-engine.js'));
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const IN  = process.argv[2] || path.join(ROOT,'site/models/source/hollow-walker.glb');
const OUT_FILE = process.argv[3] || path.join(ROOT,'site/models/walker.bin');
const OUT = path.dirname(OUT_FILE) + '/';
const {Vec3,Quat,Mat4}=LE, H=1.75;

/* Read the GLB. Only POSITION and the index buffer are wanted: these models
   arrive with no normals, no UVs, no materials and no rig, all of which are
   produced below. */
function readGlb(file){
  const f=fs.readFileSync(file);
  let off=12, chunks={};
  while(off<f.length){ const clen=f.readUInt32LE(off), ctype=f.readUInt32LE(off+4);
    chunks[ctype]=[off+8,clen]; off+=8+clen; }
  const j=JSON.parse(f.slice(chunks[0x4E4F534A][0], chunks[0x4E4F534A][0]+chunks[0x4E4F534A][1]).toString('utf8'));
  const bin=chunks[0x004E4942][0];
  const acc=(i)=>{ const a=j.accessors[i], bv=j.bufferViews[a.bufferView];
    const o=bin+(bv.byteOffset||0)+(a.byteOffset||0);
    const nc={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type], n=a.count*nc, out=[];
    for(let k=0;k<n;k++){
      if(a.componentType===5126) out.push(f.readFloatLE(o+k*4));
      else if(a.componentType===5125) out.push(f.readUInt32LE(o+k*4));
      else if(a.componentType===5123) out.push(f.readUInt16LE(o+k*2));
      else out.push(f.readUInt8(o+k));
    }
    return out; };
  const prim=j.meshes[0].primitives[0];
  return { pos: acc(prim.attributes.POSITION), idx: acc(prim.indices) };
}
const W=readGlb(IN);
console.log('read '+IN+': '+(W.pos.length/3)+' verts, '+(W.idx.length/3)+' tris');
let P=[]; for(let i=0;i<W.pos.length;i+=3) P.push([W.pos[i]*H,W.pos[i+1]*H,W.pos[i+2]*H]);
const cen=(p)=>[0,1,2].map(k=>p.reduce((s,q)=>s+q[k],0)/p.length);
const pel=cen(P.filter(p=>Math.abs(p[0])<0.11&&p[1]>-0.06&&p[1]<0.12));
P=P.map(p=>[p[0]-pel[0],p[1]-pel[1],p[2]-pel[2]]);

// ---- measure the joints -------------------------------------------------
function axis(mask,along,N,desc){
  const sel=P.filter(mask), v=sel.map(p=>p[along]);
  const a0=Math.min(...v), a1=Math.max(...v), pts=[];
  for(let k=0;k<N;k++){
    const lo=a0+(a1-a0)*k/N, hi=a0+(a1-a0)*(k+1)/N;
    const sl=sel.filter(p=>p[along]>=lo&&p[along]<hi);
    if(sl.length>=4) pts.push(cen(sl));
  }
  return desc?pts.reverse():pts;
}
function at(pts,f){
  const L=[0];
  for(let i=1;i<pts.length;i++) L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1],pts[i][2]-pts[i-1][2]));
  const want=L[L.length-1]*f;
  for(let i=1;i<L.length;i++) if(L[i]>=want){
    const t=(want-L[i-1])/Math.max(L[i]-L[i-1],1e-6);
    return [0,1,2].map(k=>pts[i-1][k]+(pts[i][k]-pts[i-1][k])*t);
  }
  return pts[pts.length-1];
}
const armL=axis(p=>p[0]>0.14&&p[2]>0.26&&p[1]>0.05,2,14,false);
const armR=axis(p=>p[0]<-0.14&&p[2]>0.26&&p[1]>0.05,2,14,false);
const legL=axis(p=>p[0]>0&&p[1]<-0.02,1,14,true);
const legR=axis(p=>p[0]<=0&&p[1]<-0.02,1,14,true);
const trunk=(y0,y1)=>cen(P.filter(p=>Math.abs(p[0])<0.14&&p[2]<0.26&&p[1]>=y0&&p[1]<y1));
const T={
  hips:[0,0,0], spine:trunk(0.10,0.22), chest:trunk(0.28,0.40),
  neck:trunk(0.44,0.54), head:cen(P.filter(p=>p[1]>0.56)),
  upperArmL:at(armL,0), lowerArmL:at(armL,0.46), handL:at(armL,0.80),
  upperArmR:at(armR,0), lowerArmR:at(armR,0.46), handR:at(armR,0.80),
  upperLegL:at(legL,0), lowerLegL:at(legL,0.48), footL:at(legL,0.88),
  upperLegR:at(legR,0), lowerLegR:at(legR,0.48), footR:at(legR,0.88),
};
T.shoulderL=[0,1,2].map(k=>T.chest[k]+(T.upperArmL[k]-T.chest[k])*0.55);
T.shoulderR=[0,1,2].map(k=>T.chest[k]+(T.upperArmR[k]-T.chest[k])*0.55);

// ---- build the rig in that pose -----------------------------------------
const CHILD={hips:'spine',spine:'chest',chest:'neck',neck:'head',
  shoulderL:'upperArmL',upperArmL:'lowerArmL',lowerArmL:'handL',
  shoulderR:'upperArmR',upperArmR:'lowerArmR',lowerArmR:'handR',
  upperLegL:'lowerLegL',lowerLegL:'footL',upperLegR:'lowerLegR',lowerLegR:'footR'};
const sk=LE.makeHumanoidSkeleton(1);
sk.update();
// Canonical rig: every local rotation is identity, so a bone's canonical
// world direction is just its (normalised) offset to its child.
const canon={}, cw={};
for(const b of sk.bones) cw[b.name]=b.worldMatrix.getTranslation(new Vec3());
for(const n in CHILD){
  const d=new Vec3().subVectors(cw[CHILD[n]],cw[n]);
  if(d.lengthSq()>1e-9) d.normalize();
  canon[n]=d;
}
const worldRot={};
for(const b of sk.bones){
  const c=CHILD[b.name];
  if(!c||!T[c]||!T[b.name]){ worldRot[b.name]=new Quat(); continue; }
  const d=new Vec3(T[c][0]-T[b.name][0],T[c][1]-T[b.name][1],T[c][2]-T[b.name][2]);
  if(d.lengthSq()<1e-9){ worldRot[b.name]=new Quat(); continue; }
  d.normalize();
  worldRot[b.name]=new Quat().setFromUnitVectors(canon[b.name],d);
}
// A bone with no measured child (hands, feet, head) simply keeps its parent's
// orientation rather than snapping back to the canonical one.
for(const b of sk.bones) if(!CHILD[b.name]&&b.parent>=0) worldRot[b.name]=worldRot[sk.bones[b.parent].name].clone();

const _m=new Mat4(), _q=new Quat();
for(let i=0;i<sk.bones.length;i++){
  const b=sk.bones[i];
  const pr=b.parent>=0?sk.bones[b.parent]:null;
  b.localRotation.copy(pr ? _q.copy(worldRot[pr.name]).conjugate().mul(worldRot[b.name]) : worldRot[b.name]);
  const tp=T[b.name];
  if(tp){
    if(pr){ _m.copy(pr.worldMatrix).invert(); b.localPosition.copy(new Vec3(tp[0],tp[1],tp[2]).applyMat4(_m)); }
    else b.localPosition.set(tp[0],tp[1],tp[2]);
  }
  sk.update();       // parent world is needed before the next child
}
sk.update();
sk.computeBindPose();

let worst=0;
for(const n in T){
  const w=sk.bones[sk.index(n)].worldMatrix.getTranslation(new Vec3());
  const d=Math.hypot(w.x-T[n][0],w.y-T[n][1],w.z-T[n][2]);
  worst=Math.max(worst,d);
  console.log('  '+n.padEnd(11)+'placed within '+(d*1000).toFixed(1)+' mm');
}
console.log('worst joint placement error: '+(worst*1000).toFixed(1)+' mm');
fs.mkdirSync(OUT,{recursive:true});
void 0 && fs.writeFileSync('/dev/null', JSON.stringify({
  bones: sk.bones.map(b=>({name:b.name,parent:b.parent,
    p:[b.localPosition.x,b.localPosition.y,b.localPosition.z],
    q:[b.localRotation.x,b.localRotation.y,b.localRotation.z,b.localRotation.w]})),
  joints: T,
},null,1));
console.log('wrote rig.json');

// ---- geometry: normals, UVs, part tags, skin weights --------------------
const g=new LE.Geometry();
for(const p of P) g.vert(p[0],p[1],p[2], 0,1,0, 0,0);
for(let i=0;i<W.idx.length;i+=3) g.tri(W.idx[i],W.idx[i+1],W.idx[i+2]);
g.finalize(); g.computeWeldGroups(); LE.smoothNormals(g);

/* UVs. The model came with none, and the procedural materials need
   something to sample, so the body is unwrapped cylindrically about its own
   vertical axis — good enough for rot and cloth noise, which have no
   features that need to land in a particular place. */
{
  const uvs=g.uvs;
  for(let i=0;i<g.positions.length/3;i++){
    const x=g.positions[i*3], y=g.positions[i*3+1], z=g.positions[i*3+2];
    uvs[i*2]  = (Math.atan2(z,x)/(Math.PI*2)+0.5)*2.4;
    uvs[i*2+1]= (y+0.95)*1.4;
  }
}

/* Two passes. The first binds with no restrictions to find out which bone
   each vertex really belongs to; that answer becomes the part tag, and the
   second pass uses the tags so no vertex can be captured across the body by
   a bone that merely passes nearby in some future pose. */
LE.solveSkinWeights(g, sk);
const BONE_PART={};
for(const b of sk.bones){
  const n=b.name;
  BONE_PART[sk.index(n)] = /ArmL$|shoulderL/.test(n)?1 : /ArmR$|shoulderR/.test(n)?2
    : /LegL$|footL/.test(n)?3 : /LegR$|footR/.test(n)?4 : /neck|head/.test(n)?5 : 0;
}
const nv=g.positions.length/3;
g.parts=new Array(nv);
for(let i=0;i<nv;i++){
  let bi=g.joints[i*4], bw=g.weights[i*4];
  for(let k=1;k<4;k++) if(g.weights[i*4+k]>bw){ bw=g.weights[i*4+k]; bi=g.joints[i*4+k]; }
  g.parts[i]=BONE_PART[bi]||0;
}
const hist={}; for(const v of g.parts) hist[v]=(hist[v]||0)+1;
console.log('part tags (0 body,1 armL,2 armR,3 legL,4 legR,5 neck):', JSON.stringify(hist));
LE.solveSkinWeights(g, sk);

// ---- write the asset ----------------------------------------------------
const idx=new Uint16Array(W.idx);
const head=Buffer.alloc(16);
head.writeUInt32LE(0x314B4C57,0);          // "WLK1"
head.writeUInt32LE(nv,4); head.writeUInt32LE(idx.length,8); head.writeUInt32LE(sk.bones.length,12);
const jb=new Uint8Array(nv*4), wb=new Uint8Array(nv*4);
for(let i=0;i<nv*4;i++){ jb[i]=g.joints[i]; wb[i]=Math.round(Math.max(0,Math.min(1,g.weights[i]))*255); }
const rig=Buffer.from(JSON.stringify(sk.bones.map(b=>({n:b.name,p:b.parent,
  t:[+b.localPosition.x.toFixed(6),+b.localPosition.y.toFixed(6),+b.localPosition.z.toFixed(6)],
  q:[+b.localRotation.x.toFixed(6),+b.localRotation.y.toFixed(6),+b.localRotation.z.toFixed(6),+b.localRotation.w.toFixed(6)]}))),'utf8');
const rlen=Buffer.alloc(4); rlen.writeUInt32LE(rig.length,0);
const buf=Buffer.concat([head,
  Buffer.from(new Float32Array(g.positions).buffer),
  Buffer.from(new Float32Array(g.normals).buffer),
  Buffer.from(new Float32Array(g.uvs).buffer),
  Buffer.from(jb.buffer), Buffer.from(wb.buffer),
  Buffer.from(idx.buffer), rlen, rig]);
fs.writeFileSync(OUT_FILE, buf);
console.log('wrote '+OUT_FILE+'  '+(buf.length/1024).toFixed(1)+' KB  ('+nv+' verts, '+(idx.length/3)+' tris, '+sk.bones.length+' bones)');
