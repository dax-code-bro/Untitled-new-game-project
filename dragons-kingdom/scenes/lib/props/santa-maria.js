// The Santa Maria - the story's own ship (PROVISIONAL design): a three-masted carrack-type
// merchant ship with a high sterncastle and a forecastle, built on the CC0 Poly Haven model
// "dutch_ship_medium" (assets-lib/model/ph_dutch_ship_medium, 22 m hull, unmodified source) and
// dressed for the harbour:
//   * the set sails of the source model (with a printed emblem) are hidden; every sail is furled
//     on its yard instead - a lumpy roll of canvas lashed with gaskets (the bible: "sails furled")
//   * the hull's 1k photo texture gets what it lacks at 4K: plank-scale wood detail along the
//     strakes (CC0 scan, projected in the ship's own frame), weathering streaks running down
//     from the wales and scuppers, a wet band and green weed at the waterline (world y = 0)
//   * restrained painted lettering on the stern (open-licensed Liberation Serif, optional)
//   * mooring lines with real sag, rope fenders, a gangplank
//
//   const ship = await santaMaria(ctx, { lettering: true });
//   scene.add(ship.root);           // +x bow, +y up, +z port side?  (see `side`), waterline y = 0
//   ship.moorTo([bollardA, bollardB], kit)  // mooring lines (world points)
import * as THREE from 'three';
import { loadModel, loadPBR } from '../assets.js';
import { Kit, Builder, tube, box, lathe, sagLine, catenary, resample, fp, sub, frame, rng, hash, clamp, fbm } from './core.js';
import { propMaterials, clothMaterial } from './materials.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const HULL_GLSL_V = /* glsl */ `
varying vec3 vSmO; varying vec3 vSmW; varying vec3 vSmN;
`;
const HULL_GLSL_F = /* glsl */ `
varying vec3 vSmO; varying vec3 vSmW; varying vec3 vSmN;
uniform sampler2D smDetA; uniform float smWater;
float smH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float smN(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(smH(i), smH(i + vec2(1, 0)), f.x), mix(smH(i + vec2(0, 1)), smH(i + vec2(1, 1)), f.x), f.y); }
float smDl = 0.22;
vec3 smBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
`;

/**
 * opts: { lettering (true), furl (true), seed, waterline (0: world y of the sea) }
 * Returns { root, hull, rigging, yards: [{a, b}], sideZ: (z of the hull side at x, y), deckY }
 */
export async function santaMaria(ctx, opts = {}) {
  const M = await propMaterials(ctx);
  const model = await loadModel('model/ph_dutch_ship_medium', ctx, { noEmissive: true });
  const root = new THREE.Group(); root.name = 'santa-maria';
  root.add(model.scene);
  let hull = null, rigging = null, sails = null;
  model.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (/hull/.test(o.name) || /hull/.test(o.material?.name || '')) hull = o;
    else if (/sail/.test(o.name) || /sail/.test(o.material?.name || '')) sails = o;
    else if (/rigging/.test(o.name) || /rigging/.test(o.material?.name || '')) rigging = o;
  });
  // ---------------------------------------------------------- hull detail --
  if (hull) {
    const mat = hull.material;
    const det = await loadPBR('pbr/acg_wood35', ctx, { repeat: 1 });
    const U = { smDetA: { value: det.map }, smWater: { value: opts.waterline ?? 0 } };
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HULL_GLSL_V)
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSmO = transformed; vSmW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSmN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HULL_GLSL_F)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  // plank-scale wood: the scan projected along the strakes (x), across them (y) on the sides,
  // along x / across z on decks; streaks of weathering under the wales; waterline
  vec3 n = normalize(vSmN);
  // fine grain along the strakes (the scan squeezed across the grain so only its streaks remain)
  vec2 puv = abs(n.y) > 0.6 ? vec2(vSmO.x / 2.4, vSmO.z / 0.08) : vec2(vSmO.x / 2.4, vSmO.y / 0.08);
  vec3 d = texture2D(smDetA, puv).rgb;
  float dl = dot(d, vec3(0.3, 0.55, 0.15));
  smDl = dl;
  diffuseColor.rgb *= mix(1.0, clamp(dl / 0.22, 0.7, 1.3), 0.3);
  // weathering streaks running down the sides (rain, bilge water from the scuppers)
  float streak = smN(vec2(vSmO.x * 9.0, vSmO.y * 0.5)) * smN(vec2(vSmO.x * 31.0, vSmO.y * 1.5));
  diffuseColor.rgb *= 1.0 - 0.25 * smoothstep(0.3, 0.7, streak) * (1.0 - abs(n.y));
  float under = 1.0 - smoothstep(smWater - 0.02, smWater + 0.02, vSmW.y);
  float splash = 1.0 - smoothstep(smWater, smWater + 0.5 * (0.6 + smN(vSmW.xz * 2.0)), vSmW.y);
  diffuseColor.rgb *= mix(1.0, 0.55, max(under, splash * 0.8));
  float weed = under * smoothstep(0.3, 0.75, smN(vSmW.xz * 7.0 + vSmW.y * 3.0) + 0.4 * smoothstep(smWater - 0.6, smWater, vSmW.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.045, 0.02), clamp(weed, 0.0, 0.85));
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float under = 1.0 - smoothstep(smWater - 0.02, smWater + 0.02, vSmW.y);
  float splash = 1.0 - smoothstep(smWater, smWater + 0.5, vSmW.y);
  roughnessFactor = mix(roughnessFactor, 0.25, max(under, splash) * 0.8);
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = smBump(-vViewPosition, normal, smDl * 0.003);`);
    };
    const pk = mat.customProgramCacheKey?.bind(mat);
    mat.customProgramCacheKey = () => (pk ? pk() : '') + '|sm-hull';
    mat.needsUpdate = true;
    // (tbn exists only with a tangent-space normal map: the source hull has one)
  }
  // ------------------------------------------------------- furled sails --
  const kit = new Kit();
  const yards = [];
  if (sails) {
    sails.visible = opts.furl === false;
    if (opts.furl !== false) {
      const g = sails.geometry;
      const P = g.attributes.position, I = g.index;
      // connected components (each sail), its head (the highest vertices) = the yard line
      const n = P.count, parent = new Int32Array(n).map((_, i) => i);
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      for (let t = 0; t < I.count; t += 3) {
        const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
        for (const [u, v] of [[a, b], [b, c]]) { const ru = find(u), rv = find(v); if (ru !== rv) parent[ru] = rv; }
      }
      const comps = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
      const m = sails.matrixWorld.clone();
      model.scene.updateMatrixWorld(true);
      const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(sails.matrixWorld);
      const rnd = rng(opts.seed ?? 4);
      const canvas = await clothMaterial(ctx, { name: 'sm-furled', scan: 'pbr/acg_fabric37', tile: [0.3, 0.3], color: [0.22, 0.19, 0.145], color2: [0.2, 0.17, 0.13], transmission: 0.06, macro: 0.4, macroF: 1.8, pieceVar: 0.15 });
      const fb = new Builder();
      // a furled sail: a roll of canvas along a..b (shifted by off), tapering to the ends, lumpy
      // where the cloth was gathered, closed at the ends; gaskets (rope turns pulled tight round
      // the roll, biting into it, and up over the spar)
      const furl = (a, b, R, off, overSpar = R * 0.75 + 0.05) => {
        const axis = b.clone().sub(a), L = axis.length(); axis.normalize();
        const ph = rnd() * 6;
        // the gaskets first (irregularly spaced): the roll is cinched at each and bulges between,
        // each bulge its own size; slow lumps where more or less cloth was gathered
        const gk = [];
        for (let s = 0.55; s < L - 0.55; s += 0.62 + rnd() * 0.3) gk.push({ s, bulge: 0.75 + rnd() * 0.5 });
        const bulgeAt = (s) => {
          let best = 1, pinch = 0;
          for (let k = 0; k < gk.length; k++) {
            const d = Math.abs(s - gk[k].s);
            pinch = Math.max(pinch, Math.exp(-(d * d) / 0.0035));
            if (s >= gk[k].s && (k + 1 === gk.length || s < gk[k + 1].s)) best = gk[k].bulge;
          }
          return (1 - 0.16 * pinch) * (1 + 0.1 * (best - 1));
        };
        const rollR = (t) => {
          const s = 0.25 + t * (L - 0.5);
          return R * (0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.6) * bulgeAt(s) * (1 + 0.09 * fbm(s * 1.1 + ph, ph, 0.5, 2) + 0.035 * fbm(s * 4.3, ph * 2, 1.5, 2));
        };
        const at = (s) => a.clone().addScaledVector(axis, s).add(off);
        const roll = [];
        for (let k = 0; k <= 60; k++) roll.push(at(0.25 + (k / 60) * (L - 0.5)));
        tube(fb, roll, (t) => rollR(t), { sides: 16, segments: Math.max(120, Math.round(L * 40)), piece: rnd(), caps: true, ao: (t) => 0.8 + 0.2 * bulgeAt(0.25 + t * (L - 0.5)) });
        let up = V(0, 1, 0).addScaledVector(axis, -axis.y);
        if (up.lengthSq() < 1e-4) up = V(1, 0, 0);
        up.normalize();
        const side = new THREE.Vector3().crossVectors(axis, up).normalize();
        for (const g of gk) {
          const t = (g.s - 0.25) / (L - 0.5);
          const cc = at(g.s);
          const r0 = rollR(clamp(t, 0, 1)) * 0.97;
          const ring = [];
          for (let k = 0; k <= 18; k++) {
            const ang = (k / 18) * Math.PI * 2;
            const over = Math.max(0, Math.cos(ang)) ** 3 * overSpar;
            ring.push(cc.clone().addScaledVector(up, Math.cos(ang) * (r0 + over)).addScaledVector(side, Math.sin(ang) * r0 * (1 - 0.3 * Math.max(0, Math.cos(ang)) ** 2)).addScaledVector(axis, (k / 18) * 0.03));
          }
          tube(kit.get('rope'), ring, 0.008, { sides: 5, closed: true });
        }
      };
      for (const ids of comps.values()) {
        if (ids.length < 50) continue;
        const pts = ids.map((i) => V(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(toRoot));
        let ymax = -1e9; for (const p of pts) ymax = Math.max(ymax, p.y);
        const head = pts.filter((p) => p.y > ymax - 0.12);
        // the yard line: the two head vertices farthest apart across the ship (z)
        let a = head[0], b = head[0];
        for (const p of head) { if (p.z < a.z) a = p; if (p.z > b.z) b = p; }
        let ymin = 1e9; for (const p of pts) ymin = Math.min(ymin, p.y);
        const area = (b.distanceTo(a)) * (ymax - ymin);
        const R = clamp(0.06 + Math.sqrt(area) * 0.045, 0.1, 0.32);
        yards.push({ a, b, R });
        // the roll hangs under and a little before the yard, fatter in the bunt (middle)
        const axis = b.clone().sub(a).normalize();
        const fwd = V(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
        furl(a, b, R, fwd.multiplyScalar(0.1).add(V(0, -R * 0.7 - 0.04, 0)));
      }
      // the source rigging carries two sails of its own already "furled" as flat painted strips
      // (the lateen mizzen along its slanting yard, the spritsail under the bowsprit): cut them
      // out of the rigging and roll them like the others
      if (rigging) {
        const rg = rigging.geometry, RP = rg.attributes.position, RU = rg.attributes.uv, RI = rg.index;
        const rn = RP.count, rp = new Int32Array(rn).map((_, i) => i);
        const rf = (x) => { while (rp[x] !== x) { rp[x] = rp[rp[x]]; x = rp[x]; } return x; };
        for (let t = 0; t < RI.count; t += 3) {
          const i0 = RI.getX(t), i1 = RI.getX(t + 1), i2 = RI.getX(t + 2);
          for (const [u, v] of [[i0, i1], [i1, i2]]) { const ru = rf(u), rv = rf(v); if (ru !== rv) rp[ru] = rv; }
        }
        const rc = new Map();
        for (let i = 0; i < rn; i++) { const r = rf(i); if (!rc.has(r)) rc.set(r, []); rc.get(r).push(i); }
        const toRootR = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(rigging.matrixWorld);
        const drop = new Set();
        for (const [r, ids] of rc) {
          if (ids.length < 120 || !RU) continue;
          let umin = 9, vmin = 9, vmax = -9;
          const lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9);
          for (const i of ids) {
            umin = Math.min(umin, RU.getX(i)); vmin = Math.min(vmin, RU.getY(i)); vmax = Math.max(vmax, RU.getY(i));
            const p = V(RP.getX(i), RP.getY(i), RP.getZ(i)); lo.min(p); hi.max(p);
          }
          // the sail strips: the canvas region of the atlas (u > 0.33, v in 0..0.15), metres long
          if (!(umin > 0.33 && vmin > -0.01 && vmax < 0.15 && hi.distanceTo(lo) > 4)) continue;
          drop.add(r);
          const pts = ids.map((i) => V(RP.getX(i), RP.getY(i), RP.getZ(i)).applyMatrix4(toRootR));
          const c = V(0, 0, 0); pts.forEach((p) => c.add(p)); c.multiplyScalar(1 / pts.length);
          // its axis: from the extreme vertices along its longest extent (a droop in the middle
          // does not tilt it)
          const ext = hi.clone().sub(lo), ax = ext.x > ext.y && ext.x > ext.z ? 'x' : ext.y > ext.z ? 'y' : 'z';
          const getA = { x: (i) => RP.getX(i), y: (i) => RP.getY(i), z: (i) => RP.getZ(i) }[ax];
          let k0 = 0, k1 = 0;
          ids.forEach((i, k) => { if (getA(i) < getA(ids[k0])) k0 = k; if (getA(i) > getA(ids[k1])) k1 = k; });
          const d = pts[k1].clone().sub(pts[k0]).normalize();
          let p0 = 1e9, p1 = -1e9;
          for (const p of pts) { const s2 = p.clone().sub(c).dot(d); p0 = Math.min(p0, s2); p1 = Math.max(p1, s2); }
          const R = clamp(0.05 + (p1 - p0) * 0.012, 0.09, 0.16);
          furl(c.clone().addScaledVector(d, p0), c.clone().addScaledVector(d, p1), R, V(0, -R * 0.35, 0), R * 0.6);
        }
        if (drop.size) {
          const keep = [];
          for (let t = 0; t < RI.count; t += 3) { if (!drop.has(rf(RI.getX(t)))) keep.push(RI.getX(t), RI.getX(t + 1), RI.getX(t + 2)); }
          rg.setIndex(keep);
        }
      }
      const fm = new THREE.Mesh(fb.geometry(), canvas); fm.castShadow = fm.receiveShadow = true; fm.name = 'furled-sails';
      root.add(fm);
    }
  }
  // ------------------------------------------------------------ lettering --
  if (opts.lettering !== false && hull) {
    // painted on the stern below the sterncastle windows: pale ochre letters, weathered
    const W = 1024, Hh = 160;
    const cv = new OffscreenCanvas(W, Hh);
    const g2 = cv.getContext('2d');
    g2.clearRect(0, 0, W, Hh);
    g2.font = '600 104px "Liberation Serif", serif';
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillStyle = 'rgba(214, 184, 120, 1)';
    g2.fillText('SANTA  MARIA', W / 2, Hh / 2 + 4);
    // weathering: knock back random flakes
    const id = g2.getImageData(0, 0, W, Hh);
    for (let i = 0; i < id.data.length; i += 4) {
      const x = (i / 4) % W, y = Math.floor(i / 4 / W);
      const n = hash(Math.floor(x / 3), Math.floor(y / 3)) * 0.6 + hash(Math.floor(x / 11), Math.floor(y / 9)) * 0.4;
      id.data[i + 3] = Math.round(id.data[i + 3] * (n < 0.18 ? 0.15 : n < 0.3 ? 0.6 : 0.9));
    }
    g2.putImageData(id, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const lm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    // find the stern face: the hull's aftmost vertices around y = 3.2
    const P = hull.geometry.attributes.position;
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(hull.matrixWorld);
    let xmin = 1e9;
    const v = V();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(toRoot); if (Math.abs(v.y - (opts.letterY ?? 2.6)) < 0.15 && Math.abs(v.z) < 0.6) xmin = Math.min(xmin, v.x); }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2 * Hh / W), lm);
    plate.position.set(xmin - 0.03, opts.letterY ?? 2.6, 0);
    plate.rotation.y = -Math.PI / 2;
    plate.name = 'lettering';
    root.add(plate);
  }
  const extra = kit.build({ rope: M.rope, ropeTar: M.ropeTar, oak: M.wood.oak, silver: M.wood.silver, iron: M.iron, hessian: M.hessian }, { name: 'sm-extra' });
  root.add(extra);
  // hull half-breadth at (x, y) from the hull vertices (for fenders, gangplank, mooring)
  const hb = new Map();
  if (hull) {
    const P = hull.geometry.attributes.position;
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(hull.matrixWorld);
    const v = V();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(toRoot);
      const key = Math.round(v.x * 2) + ':' + Math.round(v.y * 2);
      hb.set(key, Math.max(hb.get(key) ?? 0, Math.abs(v.z)));
    }
  }
  const sideZ = (x, y) => hb.get(Math.round(x * 2) + ':' + Math.round(y * 2)) ?? 2.4;
  return { root, hull, rigging, yards, sideZ, kit };
}

/**
 * Harbour dressing for a moored ship: mooring lines from the ship (local points) to bollards
 * (world points), rope fenders over the side, a gangplank to the quay. Returns a Group (world).
 * o: { lines: [[shipLocal Vector3, bollard Vector3], ...], fenders: [[x, y] ship-local], side (+1 / -1 z),
 *      plank: [shipLocal, quay Vector3] }
 */
export async function mooring(ctx, ship, o = {}) {
  const M = await propMaterials(ctx);
  const kit = new Kit();
  ship.root.updateMatrixWorld(true);
  const W = (p) => p.clone().applyMatrix4(ship.root.matrixWorld);
  for (const [a, b] of o.lines || []) {
    const A = W(a), B = b.clone();
    const L = A.distanceTo(B) * 1.012;
    const pts = resample(catenary(A, B, L, 40), 60);
    tube(kit.get('rope'), pts, 0.022, { sides: 8, seg: 0.05 });
    // the eye round the bollard
    const ring = [];
    for (let k = 0; k <= 16; k++) { const ang = (k / 16) * Math.PI * 2; ring.push(B.clone().add(V(Math.cos(ang) * 0.24, 0.02 * Math.sin(ang * 2), Math.sin(ang) * 0.24))); }
    tube(kit.get('rope'), ring, 0.022, { sides: 8, closed: true });
  }
  const side = o.side ?? 1;
  for (const [x, y] of o.fenders || []) {
    // a rope fender: a hard roll of old rope, hung over the rail on a lanyard
    const z = ship.sideZ(x, y) * side + side * 0.14;
    const top = W(V(x, y + 1.2, ship.sideZ(x, y + 1.2) * side));
    const c = W(V(x, y, z));
    tube(kit.get('rope'), [top, c.clone().add(V(0, 0.28, 0))], 0.012, { sides: 5 });
    const prof = [[0, -0.32], [0.09, -0.3], [0.14, -0.2], [0.15, 0], [0.14, 0.2], [0.09, 0.3], [0, 0.32]];
    lathe(kit.get('ropeTar'), frame(c, [1, 0, 0], [0, 1, 0]), prof, { seg: 14, rFn: (r, yy, ang) => r * (1 + 0.06 * Math.sin(yy * 60 + ang * 3)) });
  }
  if (o.plank) {
    const [a, b] = o.plank;
    const A = W(a), B = b.clone();
    const dir = B.clone().sub(A); const L = dir.length(); dir.normalize();
    const Fp = { o: A.clone().add(B).multiplyScalar(0.5), x: dir, y: V(0, 1, 0).addScaledVector(dir, -dir.y).normalize(), z: null };
    Fp.z = new THREE.Vector3().crossVectors(Fp.x, Fp.y);
    box(kit.get('silver'), Fp, [L, 0.06, 0.55], { grain: 'x', bevel: 0.01, seg: 0.3, piece: 0.4 });
    for (let s = -L / 2 + 0.3; s < L / 2 - 0.2; s += 0.35) box(kit.get('silver'), sub(Fp, [s, 0.045, 0]), [0.04, 0.03, 0.5], { grain: 'z', bevel: 0.006, piece: hash(Math.round(s * 10)) });
  }
  const g = kit.build({ rope: M.rope, ropeTar: M.ropeTar, silver: M.wood.silver }, { name: 'mooring' });
  return g;
}
