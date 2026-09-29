#!/usr/bin/env node
/* Extract the MakeHuman base mesh (hm08) -- the whole figure -- its skin
   weights mapped onto the engine's 19-bone humanoid, the joints the fit
   needs, and a set of its morph targets, into engine/src/94e-mh-data.js.

   The base mesh, the targets, the default skeleton (default.mhskel) and its
   weights (default_weights.mhw) were all released as CC0 by the MakeHuman
   team (stated in each file). Fetch into one folder:
     makehuman/data/3dobjs/base.obj
     makehuman/data/rigs/default.mhskel, makehuman/data/rigs/default_weights.mhw
     makehuman/data/targets/<dir>/<name>.target   saved as <dir>_<name>.target
   from https://raw.githubusercontent.com/makehumancommunity/makehuman/master/
   and run:  node tools/mh/extract_figure.js <folder> engine/src/94e-mh-data.js

   Output (little-endian base64):
     V   Float32 xyz, MakeHuman units (~1 dm), the body's vertices then the eye-joint helpers
     Q   Uint16 faces of the body, 4 indices each (a triangle repeats its last)
     J   { name: [local vertex indices] } joint markers (centre = mean), including eyeL / eyeR
     B   the engine's bone names; W  Uint8 [bone, weight x 255] x 4 per body vertex
     T   { name: [count, base64(Uint16 local index..., Int16 dx,dy,dz x 1/5000 unit...)] }
         male / female           the mean of the three ancestries at each sex (the whole body)
         <anc>-<sex>             that ancestry's difference from the mean, head and neck only
         build-*                 muscle and weight, from the universal macro targets
         everything else         MakeHuman's head, nose, chin, mouth, cheek, brow targets */
const fs = require('fs');
const path = require('path');
const [dir, out] = process.argv.slice(2);
const obj = fs.readFileSync(path.join(dir, 'base.obj'), 'utf8').split('\n');
const P = [], VT = [];
const groups = {}, groupsT = {};
let g = null;
for (const l of obj) {
  if (l.startsWith('v ')) { const a = l.split(/\s+/); P.push([+a[1], +a[2], +a[3]]); }
  else if (l.startsWith('vt ')) { const a = l.split(/\s+/); VT.push([+a[1], +a[2]]); }
  else if (l.startsWith('g ')) { g = l.slice(2).trim(); groups[g] = groups[g] || []; groupsT[g] = groupsT[g] || []; }
  else if (l.startsWith('f ') && g) {
    const c = l.split(/\s+/).slice(1).filter(Boolean);
    groups[g].push(c.map((s) => parseInt(s, 10) - 1));
    groupsT[g].push(c.map((s) => parseInt(s.split('/')[1], 10) - 1));
  }
}
const skel = JSON.parse(fs.readFileSync(path.join(dir, 'default.mhskel'), 'utf8'));
const wts = JSON.parse(fs.readFileSync(path.join(dir, 'default_weights.mhw'), 'utf8')).weights;

const used = new Map();
const local = (i) => { if (!used.has(i)) used.set(i, used.size); return used.get(i); };
const Q = [];
for (const f of groups.body) { const q = f.map(local); while (q.length < 4) q.push(q[q.length - 1]); Q.push(...q.slice(0, 4)); }
const nBody = used.size;
/* MakeHuman's own texture layout, for a skin and a cloth whose surface detail follows the body: the
   faces again over split vertices (one per position and texture coordinate), each split vertex's
   original, and its coordinate. */
const splitKey = new Map(), O = [], UV = [], QS = [];
groups.body.forEach((f, fi) => {
  const q = f.map((vi, k) => {
    const ti = groupsT.body[fi][k], key = vi * 65536 + ti;
    if (!splitKey.has(key)) { splitKey.set(key, O.length); O.push(used.get(vi)); UV.push(VT[ti][0], VT[ti][1]); }
    return splitKey.get(key);
  });
  while (q.length < 4) q.push(q[q.length - 1]);
  QS.push(...q.slice(0, 4));
});

// Joints: the bone heads (and a few tails) the fit reads, plus the eyeball centres.
const JN = {
  hips: 'spine05____head', spineA: 'spine03____head', spineB: 'spine02____head', chest: 'spine01____head',
  neck: 'neck01____head', head: 'head____head', headTop: 'head____tail',
};
for (const [s, S] of [['L', 'L'], ['R', 'R']]) {
  Object.assign(JN, {
    ['shoulder' + s]: `clavicle.${S}____head`, ['upperArm' + s]: `upperarm01.${S}____head`,
    ['lowerArm' + s]: `lowerarm01.${S}____head`, ['hand' + s]: `wrist.${S}____head`, ['finger' + s]: `finger3-1.${S}____head`,
    ['upperLeg' + s]: `upperleg01.${S}____head`, ['lowerLeg' + s]: `lowerleg01.${S}____head`,
    ['foot' + s]: `foot.${S}____head`, ['toe' + s]: `toe3-1.${S}____head`,
  });
}
const J = {};
for (const k in JN) J[k] = skel.joints[JN[k]].map(local);
J.eyeL = [...new Set(groups['joint-l-eye'].flat())].map(local);
J.eyeR = [...new Set(groups['joint-r-eye'].flat())].map(local);

/* Skin weights onto the engine's bones. Every MakeHuman bone goes to the
   engine bone that does its job: the five spine bones split between hips,
   spine and chest, the three neck bones to the neck, the face and jaw to the
   head, the fingers to the hand, the toes to the foot. */
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'lowerArmL', 'handL',
  'shoulderR', 'upperArmR', 'lowerArmR', 'handR', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
const mapBone = (b) => {
  const side = /\.L$/.test(b) ? 'L' : /\.R$/.test(b) ? 'R' : '';
  if (b === 'root' || b === 'spine05' || /^pelvis/.test(b)) return 'hips';
  if (b === 'spine04' || b === 'spine03') return 'spine';
  if (b === 'spine02' || b === 'spine01' || /^breast/.test(b)) return 'chest';
  if (/^neck/.test(b)) return 'neck';
  if (/^clavicle|^shoulder/.test(b)) return 'shoulder' + side;
  if (/^upperarm/.test(b)) return 'upperArm' + side;
  if (/^lowerarm/.test(b)) return 'lowerArm' + side;
  if (/^wrist|^finger|^metacarpal/.test(b)) return 'hand' + side;
  if (/^upperleg/.test(b)) return 'upperLeg' + side;
  if (/^lowerleg/.test(b)) return 'lowerLeg' + side;
  if (/^foot|^toe/.test(b)) return 'foot' + side;
  return 'head';                       // head, jaw, eyes, tongue, the face's own bones
};
const acc = Array.from({ length: nBody }, () => new Map());
for (const b in wts) {
  const e = BONES.indexOf(mapBone(b));
  for (const [gi, w] of wts[b]) { if (!used.has(gi)) continue; const li = used.get(gi); if (li >= nBody) continue; acc[li].set(e, (acc[li].get(e) || 0) + w); }
}
const W = new Uint8Array(nBody * 8);
let unweighted = 0;
for (let v = 0; v < nBody; v++) {
  const top = [...acc[v]].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, x) => s + x[1], 0);
  if (!sum) { unweighted++; W[v * 8] = 0; W[v * 8 + 1] = 255; continue; }
  top.forEach(([bi, w], k) => { W[v * 8 + k * 2] = bi; W[v * 8 + k * 2 + 1] = Math.round(w / sum * 255); });
}

const V = new Float32Array(used.size * 3);
for (const [gi, li] of used) for (let k = 0; k < 3; k++) V[li * 3 + k] = P[gi][k];

// Targets.
const readT = (f) => {
  const m = new Map();
  for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!l || l[0] === '#') continue;
    const a = l.trim().split(/\s+/); const gi = +a[0];
    if (used.has(gi)) m.set(used.get(gi), [+a[1], +a[2], +a[3]]);
  }
  return m;
};
const T = {};
let entries = 0;
const pack = (name, m, thr = 8) => {
  const idx = [], d = [];
  for (const [li, v] of [...m].sort((a, b) => a[0] - b[0])) {
    const q = v.map((x) => Math.max(-32767, Math.min(32767, Math.round(x * 5000))));
    if (Math.max(Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])) < thr) continue;
    idx.push(li); d.push(...q);
  }
  if (!idx.length) return;
  T[name] = [idx.length, Buffer.concat([Buffer.from(new Uint16Array(idx).buffer), Buffer.from(new Int16Array(d).buffer)]).toString('base64')];
  entries += idx.length;
};
const files = fs.readdirSync(dir).filter((n) => n.endsWith('.target'));
// Sex: the mean of the three ancestries; ancestry: the difference, faded out down the neck.
const neckY = (() => { const c = J.neck.reduce((s, i) => s + V[i * 3 + 1], 0) / J.neck.length; return c; })();
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (const sex of ['male', 'female']) {
  const R = ['african', 'asian', 'caucasian'].map((r) => readT(`macrodetails_${r}-${sex}-young.target`));
  const mean = new Map();
  for (const m of R) for (const [li, v] of m) { const a = mean.get(li) || [0, 0, 0]; mean.set(li, [a[0] + v[0] / 3, a[1] + v[1] / 3, a[2] + v[2] / 3]); }
  pack(sex, mean);
  ['african', 'asian', 'caucasian'].forEach((r, ri) => {
    const d = new Map();
    for (const [li, mv] of mean) {
      const v = R[ri].get(li) || [0, 0, 0], f = ss(neckY - 0.30, neckY + 0.15, V[li * 3 + 1]);
      if (f > 0) d.set(li, [(v[0] - mv[0]) * f, (v[1] - mv[1]) * f, (v[2] - mv[2]) * f]);
    }
    pack(`${r}-${sex}`, d);
  });
}
const BUILD = { 'build-male-muscle': 'universal-male-young-maxmuscle-averageweight', 'build-male-heavy': 'universal-male-young-averagemuscle-maxweight',
  'build-male-thin': 'universal-male-young-averagemuscle-minweight', 'build-female-heavy': 'universal-female-young-averagemuscle-maxweight',
  'build-female-thin': 'universal-female-young-averagemuscle-minweight' };
for (const k in BUILD) pack(k, readT(`macrodetails_${BUILD[k]}.target`), 12);
for (const f of files.filter((n) => !/^macrodetails_|head-scale-/.test(n)).sort()) pack(f.replace(/\.target$/, '').replace(/^[a-z]+_/, ''), readT(f));

const b64 = (ta) => Buffer.from(ta.buffer).toString('base64');
const src = `/* ─────────── generated by tools/mh/extract_figure.js -- do not edit ───────────
   The MakeHuman base mesh (hm08), whole, with its default skeleton's skin
   weights mapped onto the engine's humanoid and ${Object.keys(T).length} morph targets. The
   mesh, targets, skeleton and weights were released by the MakeHuman team as
   CC0 (public domain): "This asset was explicitly released as CC0".
   ${nBody} body vertices, ${Q.length / 4} faces, ${entries} target entries. */
const MH_FIG = {
  nBody: ${nBody},
  V: '${b64(V)}',
  Q: '${b64(new Uint16Array(Q))}',
  QS: '${b64(new Uint16Array(QS))}',
  O: '${b64(new Uint16Array(O))}',
  UV: '${b64(new Float32Array(UV))}',
  J: ${JSON.stringify(J)},
  B: ${JSON.stringify(BONES)},
  W: '${b64(W)}',
  T: ${JSON.stringify(T)},
};
`;
fs.writeFileSync(out, src);
console.log(`${O.length} split verts, ${nBody} body verts (+${used.size - nBody} helpers), ${Q.length / 4} faces, ${Object.keys(T).length} targets, ${entries} entries, ${unweighted} unweighted, ${(src.length / 1024).toFixed(0)} KB`);
