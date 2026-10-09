// Assemble a creature as three.js objects: a bone hierarchy, a skinned body
// (polygonized SDF sculpt), skinned rigid parts (horns, claws, teeth, dorsal
// spikes, eyes, lids), finger tubes and wing membranes - all on ONE skeleton,
// so posing is just setting bone rotations (see pose.js).
//
//   import { createCreature } from './lib/creatures/index.js';
//   const leaf = await createCreature('leaf', { THREE, quality: 'hero' });
//   scene.add(leaf.root);
//   // in update(t): leaf.setPose(poseSitting(t)); leaf.root.position.set(...)
//
// Everything is generated deterministically in setup (no randomness besides
// fixed hashes), so all render workers build identical creatures.

import * as THREE from 'three';
import { DESIGNS, buildAnatomy } from './anatomy.js';
import { polygonize } from './mesher.js';
import { computeSkin, vertexNoise } from './skin.js';
import { keratin, tubes, eyeball, eyelid, computeNormals } from './parts.js';
import { membrane } from './wing.js';
import { makeMaterials } from './materials.js';
import { applyPose, restPose } from './pose.js';
import * as P from './poses.js';
import { drapeMembrane } from './drape.js';
import { add, sub, scale, norm, cross, dot, len, clamp } from './sdf.js';

const deg = Math.PI / 180;

/**
 * The Episode 1 dragons. Every one is its OWN design (DRAGONS.md, 2026-10-09: no species);
 * `design` names its preset in anatomy.js DESIGNS. Lengths are snout to tail tip (metres):
 * Charcoal ~36 m (provisional), Leaf about 25% of Charcoal (approved: 9.0 m), Starlight the
 * 51 m "on-screen" reading (OPEN QUESTION: the screenplay says "about twice Charcoal's size";
 * 51 m is 1.41x his length, i.e. ~2.8x his mass - see README), the newborn hatchling, the scout.
 */
export const CREATURES = {
  charcoal: { design: 'charcoal', L: 35.8, look: 'charcoal', flapHz: 0.62, flapAmp: 0.7, scaleMul: 0.6, title: 'Charcoal (Remi\'s dragon)' },
  leaf: { design: 'leaf', L: 9.0, look: 'leaf', flapHz: 1.4, flapAmp: 0.85, scaleMul: 0.78, limbScaleMul: 0.72, title: 'Leaf (Abby\'s dragon, not fully grown)' },
  starlight: { design: 'starlight', L: 50.6, look: 'starlight', flapHz: 0.42, flapAmp: 0.62, scaleMul: 0.55, limbScaleMul: 0.72, title: 'Starlight (Queen Fall\'s dragon, albino)' },
  hatchling: { design: 'hatchling', L: 0.42, look: 'gold', flapHz: 0, scaleMul: 0.72, title: 'The gold hatchling (newborn)' },
  scout: { design: 'scout', L: 5.6, look: 'scout', flapHz: 2.6, flapAmp: 0.9, detachableLeftWing: true, title: 'The scout (Episode 1)' },
};

const QUALITY = {
  // base cell size = L / res, head region res x headMul
  draft: { res: 260, headMul: 2.2, membraneRes: 1 / 80, drapeIters: 90 },
  standard: { res: 420, headMul: 2.6, membraneRes: 1 / 120, drapeIters: 120 },
  hero: { res: 560, headMul: 3.0, membraneRes: 1 / 170, drapeIters: 150 },
};

/**
 * createCreature(name | config, { quality: 'draft'|'standard'|'hero', THREE? , log? })
 */
export async function createCreature(which, opts = {}) {
  const cfg = typeof which === 'string' ? { name: which, ...CREATURES[which] } : which;
  if (!cfg || !cfg.design) throw new Error(`unknown creature ${which}`);
  const log = opts.log || (() => {});
  const q = QUALITY[opts.quality || 'standard'];
  const spec = cfg.spec || DESIGNS[cfg.design];
  if (!spec) throw new Error(`unknown design ${cfg.design}`);
  const L = cfg.L;
  // scale size multiplier: a giant reads immense when its scales are fine relative to its body
  const SM = opts.scaleMul ?? cfg.scaleMul ?? 1;
  const t0 = nowMs();
  const anat = buildAnatomy(spec, L, { omitWing: cfg.detachableLeftWing ? { L: true } : {} });
  if (spec.hornScale) for (const k of anat.keratin) if (k.kind === 'horn') {
    const [p0, p1, p2] = k.points;
    k.points = [p0, add(p0, scale(sub(p1, p0), spec.hornScale)), add(p0, scale(sub(p2, p0), spec.hornScale))];
    k.radii = k.radii.map((r) => r * (0.6 + 0.4 * spec.hornScale));
  }

  // ---------------------------------------------------------------- bones
  const boneIndex = {};
  const bones = anat.bones.map((b, i) => { boneIndex[b.name] = i; const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  anat.bones.forEach((b, i) => {
    const bone = bones[i];
    if (b.parent) {
      const pp = anat.bonePos[b.parent];
      bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
      bones[boneIndex[b.parent]].add(bone);
    } else bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
  });
  const rootBone = bones[boneIndex.body];
  const root = new THREE.Group();
  root.name = cfg.name || cfg.design;
  const rig = new THREE.Group();          // root -> rig (ground offset) -> body bone
  rig.name = 'rig';
  root.add(rig);
  rig.add(rootBone);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // ---------------------------------------------------------------- body
  const h = L / q.res;
  const H = anat.head.H, hf = anat.head.frame;
  const headPts = [anat.head.W(0, 0, -0.25), anat.head.W(0, 0, 1.08), anat.head.W(0.35, 0.3, 0.4), anat.head.W(-0.35, -0.35, 0.4), anat.head.W(0, -0.3, 0.9)];
  const hb = boxOf(headPts, H * 0.08);
  const regions = [{ min: hb[0], max: hb[1], h: h / q.headMul }];
  const mesh = polygonize(anat.sdf, { h, regions });
  log(`[creature ${root.name}] mesh ${mesh.stats.vertices} v / ${mesh.stats.triangles} t, grid ${mesh.stats.NX}x${mesh.stats.NY}x${mesh.stats.NZ}, ${mesh.stats.msTotal} ms`);
  const oral = makeOralTest(anat);
  const sk = computeSkin(anat, mesh, boneIndex, {
    scaleSize: { spine: spec.scale.body * L * SM, limb: spec.scale.body * L * 0.85 * SM * (cfg.limbScaleMul ?? 1), toe: spec.scale.body * L * 0.45 * SM, jaw: spec.scale.head * L * SM, skull: spec.scale.head * L * 1.1 * SM },
    eyes: anat.eyes,
    ao: { step: L * 0.004, n: 6 }, oral,
    snoutGranular: snoutRange(anat), chinGranular: chinRange(anat),
  });
  log(`[creature ${root.name}] skin ${nowMs() - t0} ms total so far, chains N=${JSON.stringify(Object.fromEntries(sk.chainNames.map((c, i) => [c, sk.chainN[i]])))}`);

  const mats = makeMaterials(THREE, opts.look ?? cfg.look, { L, anat, spec, eyeRadius: anat.eyes[0].radius, zones: { withersZ: anat.bonePos.neck_0[2], pelvisZ: anat.bonePos.pelvis[2] } });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sk.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(sk.normals, 3));
  geo.setAttribute('tangent', new THREE.BufferAttribute(sk.tangent, 4));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sk.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sk.skinWeight, 4));
  geo.setAttribute('aScale', new THREE.BufferAttribute(sk.scale, 4));
  geo.setAttribute('aMask', new THREE.BufferAttribute(sk.mask, 4));
  geo.setAttribute('aMask2', new THREE.BufferAttribute(sk.mask2, 4));
  geo.setAttribute('aNoise', new THREE.BufferAttribute(sk.noise, 4));
  geo.setAttribute('aWarp', new THREE.BufferAttribute(sk.warp, 2));
  geo.setIndex(new THREE.BufferAttribute(sk.index, 1));
  const body = new THREE.SkinnedMesh(geo, mats.skin);
  body.name = `${root.name}:body`;
  const meshes = [body];

  // ---------------------------------------------------------- rigid parts
  const ker = keratin(anat.keratin.filter((k) => k.kind !== 'tooth' && k.kind !== 'gum'), boneIndex);
  weldNormals(ker);
  meshes.push(partMesh(THREE, ker, mats.keratin, `${root.name}:keratin`, { aKer: ker.extra }));
  const teeth = keratin(anat.keratin.filter((k) => k.kind === 'tooth' || k.kind === 'gum'), boneIndex);
  weldNormals(teeth);
  meshes.push(partMesh(THREE, teeth, mats.teeth, `${root.name}:teeth`, { aKer: teeth.extra }));

  // fingers (skin material, plain tubes; their own small mesh with the skin shader's tube mode)
  const fingerItems = [];
  for (const w of anat.wings) for (const f of w.fingers) fingerItems.push({ points: f.points, radii: f.radii, names: f.names, side: w.side });
  const wingLeftParts = { fingers: [], membrane: null };
  const fing = tubes(fingerItems.filter((f) => !(cfg.detachableLeftWing && f.side === 'L')), boneIndex, { around: 12, segPer: 10 });
  weldNormals(fing);
  meshes.push(skinPartMesh(THREE, fing, mats.finger, `${root.name}:fingers`, 'tube', 0, L));

  // eyes and lids
  const eyeData = [];
  for (const e of anat.eyes) {
    const gz = norm(e.look), gx = norm(cross(e.up, gz)), gy = cross(gz, gx);
    const toWorld = (p) => [e.center[0] + (gx[0] * p[0] + gy[0] * p[1] + gz[0] * p[2]) * e.radius,
      e.center[1] + (gx[1] * p[0] + gy[1] * p[1] + gz[1] * p[2]) * e.radius,
      e.center[2] + (gx[2] * p[0] + gy[2] * p[1] + gz[2] * p[2]) * e.radius];
    const toWorldN = (n) => norm([gx[0] * n[0] + gy[0] * n[1] + gz[0] * n[2], gx[1] * n[0] + gy[1] * n[1] + gz[1] * n[2], gx[2] * n[0] + gy[2] * n[1] + gz[2] * n[2]]);
    eyeData.push({ ...e, gx, gy, gz, toWorld, toWorldN });
  }
  {
    const parts = eyeData.map((e) => {
      const g = eyeball({ cornea: 0.07, capAngle: 0.95 });
      const local = g.positions.slice();
      transformPart(g, e.toWorld, e.toWorldN, boneIndex[e.bone]);
      const n = g.positions.length / 3;
      g.extra = new Float32Array(n * 4); g.ax = new Float32Array(n * 4); g.az = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        g.extra.set([local[i * 3], local[i * 3 + 1], local[i * 3 + 2], e.sd], i * 4);
        g.ax.set([e.gx[0], e.gx[1], e.gx[2], 0], i * 4);
        g.az.set([e.gz[0], e.gz[1], e.gz[2], 0], i * 4);
      }
      return g;
    });
    const eg = mergeParts(parts);
    meshes.push(partMesh(THREE, eg, mats.eye, `${root.name}:eyes`, { aEye: eg.extra, aEyeX: mergeAttr(parts, 'ax', 4), aEyeZ: mergeAttr(parts, 'az', 4) }));
    const lids = [];
    for (const e of eyeData) for (const up of [true, false]) {
      const g = eyelid(up, { rIn: spec.lid?.rIn ?? 1.07, rOut: spec.lid?.rOut ?? 1.25, span: spec.lid?.span ?? 1.32, reach: up ? (spec.lid?.reachU ?? 1.0) : (spec.lid?.reachL ?? 0.88) });
      transformPart(g, e.toWorld, e.toWorldN, boneIndex[up ? e.lidU : e.lidL]);
      lids.push(g);
    }
    const lg = mergeParts(lids);
    meshes.push(skinPartMesh(THREE, lg, mats.lid, `${root.name}:lids`, 'granular', anat.eyes[0].radius * 0.11, L));
  }

  // wing membranes (one mesh per wing: each gets its own folded-drape morph targets)
  const membraneRes = L * q.membraneRes;
  const memMeshes = [];
  for (const w of anat.wings) {
    if (cfg.detachableLeftWing && w.side === 'L') continue;
    const mem = membrane(w, boneIndex, { res: membraneRes });
    const mgeo = partGeometry(THREE, { ...mem, extra: mem.wing }, { aWing: mem.wing, aEdge: mem.edge, aBGrad: mem.bgrad });
    const mm = new THREE.SkinnedMesh(mgeo, mats.membrane);
    mm.name = `${root.name}:membrane${w.side}`;
    mm.userData.side = w.side;
    meshes.push(mm);
    memMeshes.push(mm);
  }

  // detachable LEFT wing (scout): its own SDF arm, fingers and membrane on the same skeleton
  let detachable = null;
  if (cfg.detachableLeftWing) {
    const w = anat.wings.find((x) => x.side === 'L');
    const wmesh = polygonize(w.detachedSDF.compile(), { h: h * 0.8 });
    const wanat = { ...anat, sdf: w.detachedSDF, chains: { [w.prefix]: anat.chains[w.prefix] } };
    const wsk = computeSkin(wanat, wmesh, boneIndex, { scaleSize: { limb: spec.scale.body * L * 0.55 }, ao: { step: L * 0.004, n: 4 } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(wsk.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(wsk.normals, 3));
    g.setAttribute('tangent', new THREE.BufferAttribute(wsk.tangent, 4));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(wsk.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(wsk.skinWeight, 4));
    g.setAttribute('aScale', new THREE.BufferAttribute(wsk.scale, 4));
    g.setAttribute('aMask', new THREE.BufferAttribute(wsk.mask, 4));
    g.setAttribute('aMask2', new THREE.BufferAttribute(wsk.mask2, 4));
    g.setAttribute('aNoise', new THREE.BufferAttribute(wsk.noise, 4));
    g.setAttribute('aWarp', new THREE.BufferAttribute(wsk.warp, 2));
    g.setIndex(new THREE.BufferAttribute(wsk.index, 1));
    const arm = new THREE.SkinnedMesh(g, mats.skin);
    arm.name = `${root.name}:wingL-arm`;
    const fl = tubes(fingerItems.filter((f) => f.side === 'L'), boneIndex, { around: 12, segPer: 10 });
    weldNormals(fl);
    const fm = skinPartMesh(THREE, fl, mats.finger, `${root.name}:wingL-fingers`, 'tube', 0, L);
    // the membrane's body edge rides on the wing root, so the whole membrane tears away with the wing
    const mem = membrane({ ...w, attachBones: [`${w.prefix}_0`, `${w.prefix}_0`, `${w.prefix}_0`] }, boneIndex, { res: membraneRes });
    const mgeo = partGeometry(THREE, { ...mem, extra: mem.wing }, { aWing: mem.wing, aEdge: mem.edge, aBGrad: mem.bgrad });
    const mm = new THREE.SkinnedMesh(mgeo, mats.membrane);
    mm.name = `${root.name}:wingL-membrane`;
    mm.userData.side = 'L';
    memMeshes.push(mm);
    detachable = { side: 'L', meshes: [arm, fm, mm], rootBone: bones[boneIndex[`${w.prefix}_0`]] };
    meshes.push(arm, fm, mm);
  }

  for (const m of meshes) {
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;          // bones move vertices far from the bind pose
    root.add(m);
    m.bind(skeleton, new THREE.Matrix4());
  }
  root.updateMatrixWorld(true);

  const creature = {
    name: root.name, config: cfg, spec, L, root, rig, skeleton, bones, boneIndex, anatomy: anat, materials: mats, meshes, detachable,
    eyes: eyeData, stats: { vertices: sk.positions.length / 3, triangles: sk.index.length / 3, buildMs: nowMs() - t0, mesh: mesh.stats },
    restPos: Object.fromEntries(anat.bones.map((b) => [b.name, b.pos])),
    /** Pose: see pose.js. Pure function of its argument. */
    setPose(p) { applyPose(creature, p); setDrape(memMeshes, p.uniforms && p.uniforms.drape); return creature; },
    membranes: memMeshes,
    /**
     * Detachable LEFT wing (Slitherwing scout). attachWing() puts the wing's
     * bone subtree back on the thorax; detachWing(parent, worldMatrix) moves it
     * under `parent` (usually the scene) with the given world matrix, so it
     * can tumble away on its own. Pure: callers compute the matrix from t.
     */
    attachWing() {
      if (!detachable) return;
      const rb = detachable.rootBone, th = bones[boneIndex.thorax];
      if (rb.parent !== th) th.add(rb);
      const rp = creature.restPos[rb.name], tp = creature.restPos.thorax;
      rb.position.set(rp[0] - tp[0], rp[1] - tp[1], rp[2] - tp[2]);
      mats.setPoseUniforms({ wound: { center: rp, radius: L * 0.03, amount: 0 } });
    },
    detachWing(parent, worldMatrix) {
      if (!detachable) return;
      const rb = detachable.rootBone;
      if (rb.parent !== parent) parent.add(rb);
      parent.updateMatrixWorld(true);
      const local = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(worldMatrix);
      local.decompose(rb.position, rb.quaternion, rb.scale);
      rb.updateMatrixWorld(true);
      mats.setPoseUniforms({ wound: { center: creature.restPos[rb.name], radius: L * 0.03, amount: 1 } });
    },
  };
  // folded-wing drapes: relax each membrane in the standing, sitting and lying folds (drape.js)
  if (opts.drape !== false) {
    const td = nowMs();
    const variants = { stand: (c) => P.stand(c, { t: 0, blink: false, breathe: 0 }), sit: (c) => P.sit(c, { t: 0, blink: false, breathe: 0 }), lie: (c) => P.lie(c, { t: 0, blink: false, breathe: 0 }) };
    const names = Object.keys(variants);
    const res = {};
    for (const mm of memMeshes) res[mm.uuid] = { pos: [], nrm: [] };
    for (const vn of names) {
      applyPose(creature, variants[vn](creature));
      creature.root.updateMatrixWorld(true);
      for (const mm of memMeshes) {
        const d = drapeMembrane(creature, mm, { res: membraneRes, side: mm.userData.side === 'L' ? 1 : -1, ground: 0, iters: q.drapeIters, ...(vn === 'sit' ? { shrink: 0.36, gravity: 0.02 } : { shrink: 0.34, gravity: 0.03 }) });
        res[mm.uuid].pos.push(new THREE.BufferAttribute(d.delta, 3));
        res[mm.uuid].nrm.push(new THREE.BufferAttribute(d.dnormal, 3));
      }
    }
    for (const mm of memMeshes) {
      mm.geometry.morphAttributes.position = res[mm.uuid].pos;
      mm.geometry.morphAttributes.normal = res[mm.uuid].nrm;
      mm.geometry.morphTargetsRelative = true;
      mm.updateMorphTargets();
      mm.userData.drapeNames = names;
    }
    log(`[creature ${root.name}] wing drapes ${nowMs() - td} ms`);
  }
  applyPose(creature, restPose());
  log(`[creature ${root.name}] built in ${creature.stats.buildMs} ms`);
  return creature;
}

// ---------------------------------------------------------------- helpers
/** Folded-wing drape morph influences from a pose's uniforms.drape = { L: [variant, amount], R: [...] }. */
function setDrape(meshes, dr) {
  for (const m of meshes) {
    if (!m.morphTargetInfluences) continue;
    m.morphTargetInfluences.fill(0);
    const e = dr && dr[m.userData.side];
    if (!e) continue;
    const i = m.userData.drapeNames.indexOf(e[0]);
    if (i >= 0) m.morphTargetInfluences[i] = e[1];
  }
}
function nowMs() { return (globalThis.performance && performance.now) ? Math.round(performance.now()) : 0; }

/** arc-length ranges (on the spine and jaw chains) where the snout tip and chin turn to small irregular scales */
function snoutRange(anat) {
  const pts = anat.chains.skull.points;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += len(sub(pts[i], pts[i - 1]));
  const H = anat.head.H;
  return [total - 0.2 * H, total - 0.08 * H];
}
function chinRange(anat) {
  const p = anat.chains.jaw.points;
  const total = len(sub(p[1], p[0]));
  return [total - 0.2 * anat.head.H, total - 0.08 * anat.head.H];
}

function boxOf(pts, pad) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[c] - pad); mx[c] = Math.max(mx[c], p[c] + pad); }
  return [mn, mx];
}

/** Mouth-interior test in head space: on the cut faces of the mouth wedge, medial to the tooth rows. */
function makeOralTest(anat) {
  const { frame, H, gape0, U, J } = anat.head;
  const hinge = anat.spec.headShape.hinge;
  // (head coordinates in the mapped space; the snout mapping is undone after un-rotating the jaw)
  const zInv = anat.head.zInv || ((z) => z);
  const toHead = (p) => { const d = sub(p, frame.origin); return [dot(d, frame.ex) / H, dot(d, frame.ey) / H, dot(d, frame.ez) / H]; };
  const soft = (x, w) => clamp(x / w, 0, 1);
  return (p, tag) => {
    if (tag === 'tongue') return 1;
    const q = toHead(p);
    // closed-configuration coordinates for jaw vertices
    let y = q[1], z = q[2];
    if (tag === 'jaw' || tag === 'throat' || tag === 'mouth') {
      const c = Math.cos(-gape0), s = Math.sin(-gape0);
      const dy = q[1] - hinge[1], dz = q[2] - hinge[2];
      const yy = hinge[1] + dy * c - dz * s, zz = hinge[2] + dy * s + dz * c;
      if (tag !== 'mouth' || yy < hinge[1] + (zz - hinge[2]) * 0) { y = yy; z = zz; }
      if (tag === 'mouth') { y = q[1]; z = q[2]; }
    }
    z = zInv(z);
    if (z < 0.12 || z > 1.0) return 0;
    // the lip plane is y = hinge.y in closed coordinates; oral if close to it and medial
    const w = Math.max(U(z)[0], J(z)[0]) * 0.66;
    return soft(0.03 - Math.abs(y - hinge[1]) + 0.012, 0.012) * soft(w - Math.abs(q[0]), 0.03);
  };
}

function transformPart(g, toWorld, toWorldN, bone) {
  const n = g.positions.length / 3;
  for (let i = 0; i < n; i++) {
    const p = toWorld([g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]]);
    g.positions[i * 3] = p[0]; g.positions[i * 3 + 1] = p[1]; g.positions[i * 3 + 2] = p[2];
    const nn = toWorldN([g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]]);
    g.normals[i * 3] = nn[0]; g.normals[i * 3 + 1] = nn[1]; g.normals[i * 3 + 2] = nn[2];
    g.skinIndex[i * 4] = bone; g.skinWeight[i * 4] = 1; g.skinWeight[i * 4 + 1] = g.skinWeight[i * 4 + 2] = g.skinWeight[i * 4 + 3] = 0;
  }
}

/** Average normals of vertices sharing a position (tube seams). */
function weldNormals(g) {
  const map = new Map(), p = g.positions, nr = g.normals;
  const key = (i) => `${Math.round(p[i * 3] * 1e5)},${Math.round(p[i * 3 + 1] * 1e5)},${Math.round(p[i * 3 + 2] * 1e5)}`;
  computeNormals(g);
  for (let i = 0; i < p.length / 3; i++) { const k = key(i); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  for (const list of map.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of list) { x += nr[i * 3]; y += nr[i * 3 + 1]; z += nr[i * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of list) { nr[i * 3] = x / l; nr[i * 3 + 1] = y / l; nr[i * 3 + 2] = z / l; }
  }
}

function mergeAttr(parts, key, comp) {
  const total = parts.reduce((s, p) => s + p[key].length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) { out.set(p[key], o); o += p[key].length; }
  return out;
}

function mergeParts(parts) {
  let nV = 0, nI = 0;
  for (const p of parts) { nV += p.positions.length / 3; nI += p.index.length; }
  const out = { positions: new Float32Array(nV * 3), normals: new Float32Array(nV * 3), index: new Uint32Array(nI), skinIndex: new Uint16Array(nV * 4), skinWeight: new Float32Array(nV * 4), extra: new Float32Array(nV * 4) };
  let ov = 0, oi = 0;
  for (const p of parts) {
    const n = p.positions.length / 3;
    out.positions.set(p.positions, ov * 3); out.normals.set(p.normals, ov * 3);
    out.skinIndex.set(p.skinIndex, ov * 4); out.skinWeight.set(p.skinWeight, ov * 4);
    if (p.extra) out.extra.set(p.extra, ov * 4);
    for (let i = 0; i < p.index.length; i++) out.index[oi + i] = p.index[i] + ov;
    ov += n; oi += p.index.length;
  }
  return out;
}

function partGeometry(THREE, g, extra = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(g.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(g.skinWeight, 4));
  for (const [k, v] of Object.entries(extra)) geo.setAttribute(k, new THREE.BufferAttribute(v, 4));
  if (g.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(g.index, 1));
  return geo;
}

/**
 * Skin-material part (finger tubes, eyelids): same attribute set as the body.
 * 'tube': chain coordinates around/along the tube (N = 8 scale columns).
 * 'granular': all-granular skin (size = granule size in metres).
 */
function skinPartMesh(THREE, g, mat, name, mode, size = 0, Lc = 1) {
  const n = g.positions.length / 3;
  const sc = new Float32Array(n * 4), mk = new Float32Array(n * 4), m2 = new Float32Array(n * 4);
  let tan = g.tangent;
  if (mode === 'tube') {
    const N = 8;
    for (let i = 0; i < n; i++) {
      const arc = g.extra[i * 4 + 1], r = Math.max(g.extra[i * 4 + 3], 1e-4), around = g.uvs[i * 2];
      const w = 2 * Math.PI * r / N;
      sc.set([arc / w, (around - 0.5) * N, Math.abs(around - 0.5) * N, N / 2], i * 4);
      m2.set([1, 0, w, 6], i * 4);
    }
  } else {
    tan = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // eyelids: the margin and the inner surface are wet mucosa (a glistening rim on the eye)
      const part = g.extra ? g.extra[i * 4 + 1] : 0, k = g.extra ? g.extra[i * 4] : 0;
      const wet = part >= 1 ? 0.9 : Math.max(0, (k - 0.93) / 0.07) * 0.6;
      mk.set([1, 0, 0, 0], i * 4); m2.set([0.85 - 0.25 * wet, wet, size / 0.55, 7], i * 4); tan.set([1, 0, 0, 1], i * 4);
    }
  }
  const geo = partGeometry(THREE, g, { aScale: sc, aMask: mk, aMask2: m2 });
  geo.setAttribute('tangent', new THREE.BufferAttribute(tan, 4));
  const vn = vertexNoise(g.positions, Lc);
  geo.setAttribute('aNoise', new THREE.BufferAttribute(vn.noise, 4));
  geo.setAttribute('aWarp', new THREE.BufferAttribute(vn.warp, 2));
  const m = new THREE.SkinnedMesh(geo, mat);
  m.name = name;
  return m;
}

function partMesh(THREE, g, mat, name, extra) {
  const m = new THREE.SkinnedMesh(partGeometry(THREE, g, extra), mat);
  m.name = name;
  return m;
}
