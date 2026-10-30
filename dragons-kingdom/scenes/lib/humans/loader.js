// Loader for characters built offline by scenes/lib/humans/offline/build.py.
//
// A character is two files in scenes/lib/humans/cache/: <id>.json (bones, meshes, materials)
// and <id>.bin (vertex data). Every mesh is stored in its DRAPE pose (the pose its garments
// were cloth-simulated in), which is also the skin bind pose here: the skeleton starts exactly
// in that pose and the runtime only adds small deltas (idle.js) - so the garments keep their
// simulated folds and nothing has to be re-solved at render time.
import * as THREE from 'three';
import { skinMaterial, eyeMaterial, cardMaterial, simpleTexturedMaterial } from './materials.js';
import { skinLook } from './look.js';
import { clothMaterial, hairStrandMaterial, propMaterial } from './cloth.js';

export const CACHE_URL = new URL('./cache/', import.meta.url).href;

const dataCache = new Map();
/** Fetch a character's data (cached per id). */
export function loadCharacterData(id) {
  if (!dataCache.has(id)) {
    dataCache.set(id, (async () => {
      const r = await fetch(CACHE_URL + id + '.json');
      if (!r.ok) throw new Error(`human "${id}" is not built (no ${id}.json in scenes/lib/humans/cache): run the build, see scenes/lib/humans/README.md`);
      const header = await r.json();
      const b = await fetch(CACHE_URL + id + '.bin');
      if (!b.ok) throw new Error(`human "${id}": ${id}.bin missing`);
      const bin = await b.arrayBuffer();
      return { header, bin };
    })());
  }
  return dataCache.get(id);
}

const TYPES = { f32: Float32Array, u16: Uint16Array, u32: Uint32Array, u8: Uint8Array, i16: Int16Array };
function view(bin, d) { return new TYPES[d.type](bin, d.offset, d.count); }

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * Build a THREE object tree for loaded data. opts: { shadows (true), lod } .
 * Returns { id, root, bones, bone(name), skeleton, meshes, mesh(name), header, drape: {q[], p[]} }.
 */
export function buildCharacter(data, opts = {}) {
  const { header, bin } = data;
  const root = new THREE.Group();
  root.name = `human:${header.id}`;
  // ---- skeleton at the drape pose
  const bones = header.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  const worldQ = header.bones.map((b) => new THREE.Quaternion(b.q[1], b.q[2], b.q[3], b.q[0]));
  const worldP = header.bones.map((b) => new THREE.Vector3(...b.p));
  header.bones.forEach((b, i) => {
    const o = bones[i];
    if (b.parent >= 0) {
      const pq = worldQ[b.parent].clone().invert();
      o.quaternion.copy(pq).multiply(worldQ[i]);
      o.position.copy(worldP[i]).sub(worldP[b.parent]).applyQuaternion(pq);
      bones[b.parent].add(o);
    } else {
      o.quaternion.copy(worldQ[i]);
      o.position.copy(worldP[i]);
      root.add(o);
    }
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = Object.fromEntries(header.bones.map((b, i) => [b.name, i]));
  const drape = { q: bones.map((b) => b.quaternion.clone()), p: bones.map((b) => b.position.clone()) };

  // ---- meshes
  const meshes = [];
  // one uniform per character: how far the mouth is open (0..1), set by the face rig (face.js);
  // the mouth cavity, teeth and tongue darken with depth behind the lips (see mouthDepth)
  const mouthU = { value: 0 };
  const mouth = mouthFrame(header, bones, index);
  // one uniform per character: the head's forward axis in VIEW space, set before each draw of the
  // skin / teeth / tongue (headFwdUpdater): the lips and the inside of the mouth take no direct light
  // from behind the face. The shadow maps cannot resolve the head occluding them - a back light drew
  // a cold blue line along the inside of the lower lip and lit the teeth from inside the head.
  const headU = { value: new THREE.Vector3(0, 0, 1) };
  const headFwd = mouth ? headFwdUpdater(headU, bones[index.head], mouth.f) : null;
  for (const m of header.meshes) {
    const g = new THREE.BufferGeometry();
    for (const [name, d] of Object.entries(m.attrs)) {
      const arr = view(bin, d);
      g.setAttribute(name, new THREE.BufferAttribute(arr, d.itemSize, !!d.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(view(bin, m.index), 1));
    const mnames = Object.keys(m.morphs || {});
    if (mnames.length) {
      g.morphAttributes.position = mnames.map((n) => { const a = new THREE.BufferAttribute(view(bin, m.morphs[n]), 3); a.name = n; return a; });
      g.morphTargetsRelative = true;
    }
    // attributes every material expects
    const n = g.attributes.position.count;
    if (!g.attributes.ao) g.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    else if (m.name === 'caruncle') {
      // the baked AO in the inner corner of the eye is ~0 (rays hit the lids): a black dot
      const ao = g.attributes.ao.array.slice();
      for (let i = 0; i < n; i++) ao[i] = Math.max(ao[i], 0.65);
      g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    }
    if (m.kind === 'skin') {
      if (!g.attributes.thick) g.setAttribute('thick', new THREE.BufferAttribute(new Float32Array(n).fill(0.3), 1));
      if (!g.attributes.aux) g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      if (!g.attributes.aux2) g.setAttribute('aux2', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      if (!g.attributes.aux3) g.setAttribute('aux3', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      if (!g.attributes.albg) g.setAttribute('albg', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    if (m.kind === 'lash' || m.kind === 'brow' || m.kind === 'haircard') {
      // lw = 1 on the lower lash row (below the eye centre, drape pose = bind pose)
      const lw = new Float32Array(n);
      if (m.kind === 'lash') {
        const eyes = ['eye.L', 'eye.R'].filter((b) => index[b] !== undefined).map((b) => bones[index[b]].getWorldPosition(new THREE.Vector3()));
        const pos = g.attributes.position;
        for (let i = 0; i < n; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          let best = null, bd = 1e9;
          for (const e of eyes) { const d = Math.abs(e.x - x); if (d < bd) { bd = d; best = e; } }
          if (best) lw[i] = Math.min(1, Math.max(0, (best.y - 0.001 - y) / 0.002));
        }
      }
      g.setAttribute('lw', new THREE.BufferAttribute(lw, 1));
    }
    if (mouth && (m.kind === 'skin' || m.name === 'teeth' || m.kind === 'tongue')) {
      const md = mouthDepth(g, mouth, m.kind === 'skin');
      if (m.kind === 'skin') eyeZone(g, md, bones, index);
      g.setAttribute('mdepth', new THREE.BufferAttribute(md, 1));
    }
    // the lips' own colour zone (vermilion) from the skin photo's UV layout (data/lipmask-uv.json)
    if (mouth && m.kind === 'skin' && opts.lipMask !== false) applyLipMask(g, m, mouth, opts.lipMask || LIPMASK_DATA);
    if (g.attributes.skinIndex && opts.rebind !== false) rebindWorn(g, m, header, bones, index);
    g.computeBoundingSphere();
    const mat = materialFor(m, header, { ...opts, mouthU, headU, lipM: mouth?.M, lipUp: mouth?.up });
    let mesh;
    if (g.attributes.skinIndex) {
      mesh = new THREE.SkinnedMesh(g, mat);
      root.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
    } else {
      mesh = new THREE.Mesh(g, mat);
      // static parts ride on a bone if the build says so
      if (m.bone && index[m.bone] !== undefined) {
        const b = bones[index[m.bone]];
        b.updateMatrixWorld(true);
        _m.copy(b.matrixWorld).invert();
        mesh.applyMatrix4(_m);
        b.add(mesh);
      } else root.add(mesh);
    }
    if (mnames.length) {
      mesh.morphTargetDictionary = Object.fromEntries(mnames.map((nm, i) => [nm, i]));
      mesh.morphTargetInfluences = mnames.map(() => 0);
    }
    mesh.name = `${root.name}:${m.name}`;
    if (headFwd && ['skin', 'teeth', 'tongue', 'eye', 'lash'].includes(m.kind)) mesh.onBeforeRender = headFwd;
    // lashes and brows are too fine for a shadow map: at a grazing sun they print long dark
    // streaks across the cheek; their contact shading comes from the baked AO
    mesh.castShadow = opts.shadows !== false && m.material?.castShadow !== false && m.kind !== 'lash' && m.kind !== 'brow';
    mesh.receiveShadow = true;
    // the bind pose IS the drape pose (idle motion only adds small deltas), so the bounding
    // spheres are valid for culling; opts.cull === false turns it off
    mesh.frustumCulled = opts.cull !== false;
    mesh.userData.kind = m.kind;
    meshes.push(mesh);
  }
  const ch = {
    id: header.id, header, root, bones, index, skeleton, meshes, drape, mouthU,
    bone: (name) => bones[index[name]],
    mesh: (name) => meshes.find((x) => x.name.endsWith(':' + name)),
    meta: header.meta || {},
  };
  return ch;
}

// Worn things never follow a hand that happened to rest on them in the drape pose: the offline
// skinning gave a belt under a "hand on the belt" pose (and its buckle, purse, scabbard) weights on
// the hand and forearm bones, so when the performance layer moved that arm the belt tongue stretched
// to the hand as a long black strap; a purse at the hip had thigh weights and swung out level with
// the striding leg). A braid lying over the shoulder had upper-arm weights (it swung with the arm).
// At load time (the drape pose is the bind pose, so nothing changes at rest):
//   worn props: arm / hand / leg weights go to the vertex's other bones (or the nearest torso bone)
//   hair:       arm weights go to the clavicle of the same side (the shoulder top it lies on)
const WORN = /^(belt|buckle|pouch|buttons|chain|circlet|sword_|kettle_hat|beltsash)/;
const ARM = /^(shoulder01|upperarm|lowerarm|wrist|metacarpal|finger|thumb)/;
// a purse or scabbard hangs from the belt: thigh weights swung it out level with the striding leg
const LEG = /^(upperleg|lowerleg|foot|toe)/;
const TORSO = /^(root|spine0\d|pelvis\.|neck0\d|head|clavicle\.)/;
const rebound = new WeakMap();
function rebindWorn(g, m, header, bones, index) {
  const worn = m.kind === 'prop' && WORN.test(m.name);
  const hair = m.kind === 'hair';
  if (!worn && !hair) return;
  // the arrays are views into the shared (cached) data: fix them once per data set
  let done = rebound.get(header);
  if (!done) { done = new Set(); rebound.set(header, done); }
  if (done.has(m.name)) return;
  done.add(m.name);
  const names = header.bones.map((b) => b.name);
  const isArm = names.map((n) => ARM.test(n) || (worn && LEG.test(n)));
  if (!isArm.some(Boolean)) return;
  const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, pos = g.attributes.position.array;
  const torso = names.map((n, i) => (TORSO.test(n) ? i : -1)).filter((i) => i >= 0);
  const tp = torso.map((i) => bones[i].getWorldPosition(new THREE.Vector3()));
  const clav = { L: index['clavicle.L'], R: index['clavicle.R'] };
  for (let v = 0; v < si.length / 4; v++) {
    let armW = 0;
    for (let k = 0; k < 4; k++) if (sw[v * 4 + k] > 0 && isArm[si[v * 4 + k]]) armW += sw[v * 4 + k];
    if (armW <= 0) continue;
    if (hair) {
      for (let k = 0; k < 4; k++) {
        const b = si[v * 4 + k];
        if (sw[v * 4 + k] > 0 && isArm[b]) { const c = clav[names[b].endsWith('.L') ? 'L' : 'R']; if (c !== undefined) si[v * 4 + k] = c; }
      }
      continue;
    }
    const rest = 1 - armW;
    if (rest > 0.2) {
      for (let k = 0; k < 4; k++) {
        if (isArm[si[v * 4 + k]]) sw[v * 4 + k] = 0;
        else sw[v * 4 + k] /= rest;
      }
    } else {
      // nothing else holds it: the nearest torso bone takes it all
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let best = torso[0], bd = 1e9;
      for (let j = 0; j < torso.length; j++) { const d = (tp[j].x - x) ** 2 + (tp[j].y - y) ** 2 + (tp[j].z - z) ** 2; if (d < bd) { bd = d; best = torso[j]; } }
      si[v * 4] = best; sw[v * 4] = 1;
      for (let k = 1; k < 4; k++) { si[v * 4 + k] = 0; sw[v * 4 + k] = 0; }
    }
  }
}

function materialFor(m, header, opts) {
  const mt = m.material || {};
  switch (m.kind) {
    case 'skin': return skinMaterial({ ...skinLook(header.id), ...mt, seed: hashStr(header.id) % 997, mouthU: opts.mouthU, headU: opts.headU, lipM: opts.lipM, lipUp: opts.lipUp });
    case 'eye': return eyeMaterial({ ...mt, headU: opts.headU });
    case 'brow': case 'lash': case 'haircard': return cardMaterial({ ...mt, colorMap: m.kind === 'haircard', cut: m.kind === 'brow' ? [0.0, 0.03] : [0.06, 0.3], front: m.kind === 'lash', headU: opts.headU });
    case 'hair': return hairStrandMaterial(mt);
    case 'teeth': case 'tongue': return simpleTexturedMaterial({ ...mt, mouthU: opts.mouthU, headU: opts.headU, mouth: m.name === 'teeth' || m.kind === 'tongue', teeth: m.name === 'teeth' });
    case 'cloth': return clothMaterial({ ...mt, wrinkle: mt.wrinkle ?? (m.name === 'shirt' ? 1 : 0) });
    default: return propMaterial(mt);
  }
}

/**
 * An onBeforeRender callback that puts the head's forward axis (fBind: in the drape pose, world) into
 * headU in the view space of the camera about to draw (the shader's light directions are in view
 * space). Cheap: one matrix column transform per draw.
 */
function headFwdUpdater(headU, headBone, fBind) {
  headBone.updateWorldMatrix(true, false);
  const local = fBind.clone().transformDirection(_m.copy(headBone.matrixWorld).invert());   // in the head bone's frame
  const w = new THREE.Vector3();
  return (renderer, scene, camera) => {
    w.copy(local).transformDirection(headBone.matrixWorld).transformDirection(camera.matrixWorldInverse);
    headU.value.copy(w);
  };
}

/**
 * The mouth in the drape (bind) pose: lip front point F and the head's forward axis f. The lips meet
 * between the upper-lip bone (oris05) and the lower-lip bone (oris01); F is the frontmost skin point
 * on that axis. null when the skeleton has no face bones.
 */
function mouthFrame(header, bones, index) {
  const need = ['head', 'oris05', 'oris01'];
  if (need.some((n) => index[n] === undefined)) return null;
  const P = (n) => bones[index[n]].getWorldPosition(new THREE.Vector3());
  const M = P('oris05').add(P('oris01')).multiplyScalar(0.5);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(bones[index.head].getWorldQuaternion(new THREE.Quaternion())).normalize();
  const body = header.meshes.find((m) => m.kind === 'skin');
  // up across the lips (lower -> upper lip bone, square to f)
  const up = P('oris05').sub(P('oris01'));
  up.addScaledVector(f, -up.dot(f));
  if (up.lengthSq() < 1e-10) up.set(0, 1, 0); else up.normalize();
  return { M, f, up, F: null, body };
}

/**
 * Per-vertex depth behind the lip front (m) for the mouth cavity, teeth and tongue: 0 outside the
 * mouth. Skin counts as cavity when, seen along the head's forward axis, it is hidden more than 3 mm
 * behind other skin (the closed lips cover the whole cavity in the drape pose), lies within 3.5 cm of
 * the mouth axis, and does not face away from it (the underside of the lower lip, the chin and the
 * skin under the nose stay skin). The renderer's shadow maps cannot resolve a mouth: the cavity is
 * darkened by this depth instead (materials.js). The lips' own outer skin gets LIP_ZONE (0.2 mm: below
 * every cavity threshold) so the shader can keep back light off the whole mouth.
 */
const LIP_ZONE = 0.0002;
/** The skin of the eye sockets (within 2.2 cm of an eyeball's centre: lids, lid margins) gets the same
 *  front-of-face marker as the lips: no back light there either (sparkles along the lower lids). */
function eyeZone(g, out, bones, index) {
  const eyes = ['eye.L', 'eye.R'].filter((b) => index[b] !== undefined).map((b) => bones[index[b]].getWorldPosition(new THREE.Vector3()));
  if (!eyes.length) return;
  const pos = g.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (out[i] > 0) continue;
    p.fromBufferAttribute(pos, i);
    for (const e of eyes) if (p.distanceToSquared(e) < 0.022 * 0.022) { out[i] = LIP_ZONE; break; }
  }
}
function mouthDepth(g, mo, isSkin) {
  const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
  const out = new Float32Array(n);
  const { M, f } = mo;
  const p = new THREE.Vector3(), a = new THREE.Vector3(), l = new THREE.Vector3(), nn = new THREE.Vector3();
  // an orthonormal frame (u, v) across the mouth axis
  const u = new THREE.Vector3(1, 0, 0).addScaledVector(f, -f.x).normalize();
  const v = new THREE.Vector3().crossVectors(f, u);
  if (!mo.F && !isSkin) mo.F = M.clone().addScaledVector(f, 0.006);
  if (!mo.F) {
    // lip front: the frontmost body vertex within 1 cm of the mouth axis (computed on the skin first)
    let best = 0;
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i); a.copy(p).sub(M);
      const d = a.dot(f); l.copy(a).addScaledVector(f, -d);
      if (l.length() < 0.01 && d > best && d < 0.05) best = d;
    }
    mo.F = M.clone().addScaledVector(f, best);
  }
  const cand = [];
  const front = new Map();
  const CELL = 0.002;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i); a.copy(p).sub(mo.F);
    const d = -a.dot(f);
    if (d > 0.11 || d < -0.03) continue;
    l.copy(a).addScaledVector(f, d);
    const r = l.length();
    if (r > 0.037) continue;
    const key = Math.round(l.dot(u) / CELL) * 4096 + Math.round(l.dot(v) / CELL);
    if (isSkin) { const fr = front.get(key); if (fr === undefined || d < fr) front.set(key, d); }
    // the lips' outer surface (within 3 cm of the mouth axis, up to 2.5 cm behind the lip front):
    // a tiny marker depth that changes no cavity shading but tells the skin shader it is mouth skin
    // (no back light: materials.js RE_Direct_Skin)
    if (isSkin && r < 0.03 && d > -0.003 && d < 0.025) out[i] = LIP_ZONE;
    if (d > 0.0005 && r < 0.035) cand.push(i, d, r, key);
  }
  for (let k = 0; k < cand.length; k += 4) {
    const i = cand[k], d = cand[k + 1], r = cand[k + 2], key = cand[k + 3];
    if (isSkin) {
      const fr = front.get(key);
      if (fr === undefined || d - fr < 0.003) continue;                  // nothing in front: outer skin
      p.fromBufferAttribute(pos, i); a.copy(p).sub(mo.F); l.copy(a).addScaledVector(f, d);
      nn.fromBufferAttribute(nrm, i);
      const toAxis = r > 1e-5 ? -nn.dot(l) / r : 1;
      if (toAxis < -0.2 && d < 0.02) continue;                           // faces away from the mouth
      if (r > 0.012 && d < 0.015 + (r - 0.012) * 0.5) continue;          // under the nose / beside the corners
    }
    out[i] = d;
  }
  return out;
}

// ------------------------------------------------------------------ lips --
// The build's lip mask (aux.r) is centred on MakeHuman's 'joint-mouth' helper, ~7 cm behind the lips
// at the jaw joint, so almost no skin vertex got it (alexandria 3 of 55784) - and the face de-lighting
// (albg) then evened the lips out like skin: in the 4K close-ups the lips read as a crack in a smooth
// face. Every MakeHuman skin photo shares one UV layout, so the vermilion is a fixed region in UV
// space (tools/lipmask_uv.py measured it per texture from the photo's redness: data/lipmask-uv.json).
// Here every skin vertex within 4 cm of the lips samples that mask at its UV: aux.r (the lip weight
// the skin shader reads) and the de-lighting gain lifted back to 1 (the photo's own lip colour).
// The redness masks of the dark-skinned photos are noisy (lips barely redder than the skin): those
// use the mean of the light-skinned photos' masks (the same UV layout, clean outlines).
export const LIPMASK_URL = new URL('./data/lipmask-uv.json', import.meta.url).href;
let LIPMASK_DATA = null;
/** Load the lip mask data once (loadCharacter does; buildCharacter uses it when loaded). */
export async function loadLipMask(url = LIPMASK_URL) {
  if (LIPMASK_DATA) return LIPMASK_DATA;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    LIPMASK_DATA = decodeLipMask(await r.json());
  } catch { LIPMASK_DATA = null; }
  return LIPMASK_DATA;
}
/** Decode the base64 grids of data/lipmask-uv.json (Node: pass the parsed JSON). */
export function decodeLipMask(doc) {
  const atobX = (b) => (typeof atob === 'function' ? Uint8Array.from(atob(b), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(b, 'base64')));
  const tex = {};
  for (const [name, t] of Object.entries(doc.textures || {})) tex[name] = { ...t, grid: atobX(t.mask) };
  return { doc, tex, light: Object.keys(tex).filter((n) => /lightskinned/.test(n)) };
}
export function setLipMask(d) { LIPMASK_DATA = d; }
const UP = new THREE.Vector3(0, 1, 0);
function sampleLipGrid(t, u, v) {
  const [u0, v0, u1, v1] = t.box;
  const x = ((u - u0) / (u1 - u0)) * t.w - 0.5, y = ((v - v0) / (v1 - v0)) * t.h - 0.5;
  if (x < -0.5 || y < -0.5 || x > t.w - 0.5 || y > t.h - 0.5) return 0;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const at = (i, j) => (i < 0 || j < 0 || i >= t.w || j >= t.h ? 0 : t.grid[j * t.w + i] / 255);
  return (at(xi, yi) * (1 - fx) + at(xi + 1, yi) * fx) * (1 - fy) + (at(xi, yi + 1) * (1 - fx) + at(xi + 1, yi + 1) * fx) * fy;
}
function applyLipMask(g, m, mo, LM) {
  if (!LM || !g.attributes.uv || !g.attributes.aux) return 0;
  const name = String(m.material?.map || '').split('/').pop().replace(/\.[a-z]+$/i, '');
  const own = LM.tex[name] && !/darkskinned/.test(name) ? LM.tex[name] : null;
  const light = LM.light.map((n) => LM.tex[n]);
  if (!light.length && !own) return 0;
  const pos = g.attributes.position, uv = g.attributes.uv, aux = g.attributes.aux, albg = g.attributes.albg;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  // 1. the mask at every skin vertex of the lips' region: within 3.2 cm of the mouth, 1.2 cm below to
  //    0.9 cm above the lip line (the nostrils are as red in the photo)
  const W = new Map();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    d.copy(p).sub(mo.M);
    const h = d.dot(mo.up || UP);
    if (d.lengthSq() > 0.032 * 0.032 || h > 0.009 || h < -0.012) {
      // the build's own lip mask round MakeHuman's jaw-joint helper marked a few vertices deep in the
      // head (alexandria: 3): not lips
      if (aux.getX(i) > 0) aux.setX(i, 0);
      continue;
    }
    const u = uv.getX(i), v = uv.getY(i);
    // the character's own photo (light skin) half, the mean of the light-skinned photos half: one
    // photo's mask can be patchy (a pale lower lip in the shoot's light)
    let wl = 0;
    for (const t of light) wl += sampleLipGrid(t, u, v);
    wl /= Math.max(1, light.length);
    W.set(i, own ? 0.5 * sampleLipGrid(own, u, v) + 0.5 * wl : wl);
  }
  if (!W.size) return 0;
  // 2. a CLOSING over the mesh (3 rings dilated, then 3 eroded): fills the pale gaps of the lower lip
  //    (the shoot's highlight) without growing the outline; then one ring of smoothing
  const nb = new Map();
  const idx = g.index ? g.index.array : null;
  if (idx) {
    const link = (a, b) => { if (!W.has(a) || !W.has(b)) return; let s = nb.get(a); if (!s) nb.set(a, (s = new Set())); s.add(b); };
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k], b = idx[k + 1], c = idx[k + 2];
      link(a, b); link(b, a); link(b, c); link(c, b); link(a, c); link(c, a);
    }
  }
  // vertices at the same place (UV seams, split normals) share one value
  const step = (src, f) => {
    const out = new Map();
    for (const [i, w] of src) { let v = w; for (const j of nb.get(i) || []) v = f(v, src.get(j)); out.set(i, v); }
    return out;
  };
  let C = W;
  for (let k = 0; k < 3; k++) C = step(C, Math.max);
  for (let k = 0; k < 3; k++) C = step(C, Math.min);
  const S = new Map();
  for (const [i, w] of C) { let s = w * 2, n = 2; for (const j of nb.get(i) || []) { s += C.get(j); n++; } S.set(i, s / n); }
  // 3. aux.r (the lip weight of the skin shader), the de-lighting gain back to 1 (the photo's own lip
  //    colour); a soft edge from the grid's own 1-2 texel blur, no stray specks below 0.12
  let n = 0;
  for (const [i, w0] of S) {
    const w = Math.max(0, Math.min(1, (w0 - 0.12) / 0.55));
    if (w <= 0) continue;
    aux.setX(i, Math.max(aux.getX(i), w));
    if (albg) for (let k = 0; k < 3; k++) albg.setComponent(i, k, albg.getComponent(i, k) + (1 - albg.getComponent(i, k)) * w);
    n++;
  }
  aux.needsUpdate = true;
  if (albg) albg.needsUpdate = true;
  return n;
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
