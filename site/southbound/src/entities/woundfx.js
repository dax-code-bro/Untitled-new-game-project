// Wounds on bodies (G13): where someone is actually hit, their skin or clothes show it, and it moves
// with them: a bullet hole with blood soaking out round it and a run of blood down the body (longer the
// longer they bleed); a cut, a thin line welling up red; a bruise, purple-blue, going green-yellow as it
// heals; a scrape (road rash from a fall or a car); a burn. The player's heal over game days.
//
// No extra draw calls: the first time a person is hurt they get their own copy of their skin, clothes
// and shoes materials, with up to 8 wounds as uniforms in the bind pose (the body's rest shape, the
// vertex `position` before skinning), so a wound stays on the same patch of skin however they move.
// Where a hit lands in the bind pose: the nearest vertex of the posed body to the hit point
// (SkinnedMesh.getVertexPosition, sampled; ~1-2 ms, only for people near the camera).
import * as THREE from 'three';

const MAX = 8;
export const WOUND = { bullet: 0, cut: 1, bruise: 2, scrape: 3, burn: 4 };
const SIZE = [0.045, 0.06, 0.075, 0.09, 0.1];

const PARS = /* glsl */ `
uniform vec4 uSbW[${MAX}];   // xyz: where (bind pose), w: size (m)
uniform vec4 uSbWK[${MAX}];  // x: kind, y: healed 0..1, z: how far blood has run (m), w: seed
uniform int uSbWN;
varying vec3 vSbWP;
float sbWHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void sbWounds(inout vec3 col, inout float rough) {
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uSbWN) break;
    vec3 d = vSbWP - uSbW[i].xyz; float r = uSbW[i].w; float k = uSbWK[i].x; float heal = uSbWK[i].y; float seed = uSbWK[i].w;
    float dist = length(d);
    if (dist > r * 4.0 + uSbWK[i].z) continue;
    float rag = sbWHash(floor(vSbWP * 160.0) + seed) * 0.35; // ragged edges
    float fresh = 1.0 - heal;
    if (k < 0.5) {
      // bullet: a dark hole, a soaked ring, and a run of blood down the body
      float hole = smoothstep(r * 0.3, r * 0.1, dist);
      float soak = smoothstep(r * (1.15 + rag), r * 0.3, dist);
      float L = uSbWK[i].z, run = 0.0;
      if (d.y < 0.0 && -d.y < L) { float w = r * (0.42 - 0.22 * (-d.y / L)); run = smoothstep(w, w * 0.35, length(d.xz)); }
      float b = max(soak, run * 0.9) * fresh;
      #ifdef SB_WSKIN
        col = mix(col, vec3(0.22, 0.012, 0.009), b * 0.9);
      #else
        // blood in cloth reads as a dark wet stain more than as red
        col = mix(col, mix(vec3(0.11, 0.006, 0.004), vec3(0.05, 0.003, 0.002), smoothstep(r * 0.6, 0.0, dist)), b * 0.94);
      #endif
      col = mix(col, vec3(0.03, 0.002, 0.002), hole * (1.0 - heal * 0.7));
      rough = mix(rough, 0.32, b * fresh * 0.8); // fresh blood is wet
    } else if (k < 1.5) {
      // cut: a thin line, welling up red along it
      float a = seed * 6.2831;
      vec3 ax = normalize(vec3(cos(a), 0.35 * sin(a * 1.7), sin(a)));
      float t = dot(d, ax), perp = length(d - ax * t), along = step(abs(t), r * 1.4);
      float line = smoothstep(r * 0.06, r * 0.015, perp) * along;
      float well = smoothstep(r * (0.35 + rag), r * 0.04, perp) * along;
      #ifdef SB_WSKIN
        col = mix(col, vec3(0.26, 0.015, 0.01), well * 0.85 * fresh);
      #else
        col = mix(col, vec3(0.1, 0.006, 0.004), well * 0.9 * fresh);
      #endif
      col = mix(col, vec3(0.08, 0.005, 0.004), line * (1.0 - heal * 0.5));
      rough = mix(rough, 0.25, well * fresh * 0.7);
    } else if (k < 2.5) {
      // bruise: a soft purple-blue blotch, green-yellow as it heals (on skin; clothes hide it)
      #ifndef SB_WSKIN
        continue;
      #endif
      float b = smoothstep(r, r * 0.15, dist + rag * r * 0.5);
      vec3 tint = mix(vec3(0.42, 0.22, 0.48), vec3(0.75, 0.72, 0.38), heal);
      col = mix(col, col * tint * 1.6, b * (1.0 - heal * heal) * 0.8);
    } else if (k < 3.5) {
      // scrape: raw red, streaked
      float b = smoothstep(r, r * 0.3, dist) * (0.55 + 0.45 * sbWHash(floor(vSbWP * 380.0) + seed));
      col = mix(col, vec3(0.45, 0.07, 0.05), b * fresh * 0.82);
      rough = mix(rough, 0.4, b * fresh * 0.5);
    } else {
      // burn: blackened, blistered red at the edge
      float b = smoothstep(r, r * 0.2, dist + rag * r);
      float edge = smoothstep(r * 1.3, r, dist) * (1.0 - b);
      col = mix(col, vec3(0.07, 0.05, 0.04), b * fresh * 0.88);
      col = mix(col, vec3(0.5, 0.12, 0.08), edge * fresh * 0.5);
    }
  }
}
`;

// copy a person's material so this one person can carry their own wounds (keeping the skin/cloth shading)
function ownCopy(m, U) {
  const c = m.clone();
  c.defines = { ...(m.defines || {}) }; // (clone() resets defines: SB_SKIN etc. must come along)
  if (/skin|body/i.test(m.name || '') || m.defines?.OF_SKIN !== undefined) c.defines.SB_WSKIN = '';
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
  c.onBeforeCompile = function (sh, r) {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(this, sh, r);
    if (sh.vertexShader.includes('vSbWP')) return; // (already done)
    sh.uniforms.uSbW = U.uSbW; sh.uniforms.uSbWK = U.uSbWK; sh.uniforms.uSbWN = U.uSbWN;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbWP;');
    // (outfit materials, entities/clothing.js, rewrite begin_vertex and keep the rest-pose point as vOfP)
    sh.vertexShader = sh.vertexShader.includes('#include <begin_vertex>') ? sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbWP = position;')
      : sh.vertexShader.replace('vOfP = position;', 'vOfP = position; vSbWP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <lights_physical_fragment>', 'sbWounds(diffuseColor.rgb, roughnessFactor);\n#include <lights_physical_fragment>');
  };
  c.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|sbwound';
  c.userData = { ...m.userData, woundOf: m };
  return c;
}

// give this person their own wound-carrying materials (once)
export function woundable(h) {
  if (h.wound) return h.wound;
  const U = { uSbW: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, uSbWK: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, uSbWN: { value: 0 } };
  const W = { list: [], U, mats: [], meshes: [], dirty: false };
  h.model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const swap = (m) => { if (!m || /hair|eye|brow|lash|teeth|tongue/i.test(m.name || '')) return m; const c = ownCopy(m, U); W.mats.push(c); return c; };
    const before = o.material;
    o.material = Array.isArray(before) ? before.map(swap) : swap(before);
    if (o.material !== before) W.meshes.push(o);
  });
  const dispose = h.dispose.bind(h);
  h.dispose = () => { dispose(); for (const m of W.mats) m.dispose(); W.mats.length = 0; };
  h.wound = W;
  return W;
}

// where a world point lands on the body's rest shape: the nearest (sampled) vertex of the posed body
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4(), _loc = new THREE.Vector3();
function bindPointOf(meshes, world) {
  let best = null, bd = 0.25 * 0.25; // within 25 cm of the body
  for (const m of meshes) {
    const pos = m.geometry.attributes.position; if (!pos) continue;
    m.updateMatrixWorld();
    _inv.copy(m.matrixWorld).invert(); _loc.copy(world).applyMatrix4(_inv);
    const n = pos.count, step = Math.max(1, Math.floor(n / 1800));
    let bi = -1, bdd = Infinity;
    for (let i = 0; i < n; i += step) { m.getVertexPosition(i, _v); const d = _v.distanceToSquared(_loc); if (d < bdd) { bdd = d; bi = i; } }
    // (the scale of the mesh's local space: back to metres)
    const s = m.matrixWorld.getMaxScaleOnAxis(); const dm = bdd * s * s;
    if (bi >= 0 && dm < bd) { bd = dm; best = new THREE.Vector3(pos.getX(bi), pos.getY(bi), pos.getZ(bi)); best.scale = s; }
  }
  return best;
}

function sync(W) {
  const n = Math.min(MAX, W.list.length);
  for (let i = 0; i < n; i++) {
    const w = W.list[W.list.length - n + i];
    W.U.uSbW.value[i].set(w.p.x, w.p.y, w.p.z, w.r);
    W.U.uSbWK.value[i].set(w.k, Math.min(1, w.heal), w.run, w.seed);
  }
  W.U.uSbWN.value = n;
  W.dirty = false;
}

// A wound where `point` (world) touches this person. kind: 'bullet' | 'cut' | 'bruise' | 'scrape' | 'burn'
export function addWound(h, point, kind = 'bullet', opts = {}) {
  const W = woundable(h);
  if (!W.meshes.length) return null;
  const p = bindPointOf(W.meshes, point);
  if (!p) return null;
  const k = WOUND[kind] ?? 0, sc = 1 / (p.scale || 1); // sizes in the mesh's own units
  // a second hit right on top of an earlier one makes that one bigger instead of a new one
  const same = W.list.find((w) => w.k === k && w.p.distanceTo(p) < w.r * 0.8);
  if (same) { same.r = Math.min(same.r * 1.25, SIZE[k] * sc * 2.2); same.heal = 0; same.run = Math.max(same.run, 0.02 * sc); W.dirty = true; sync(W); return same; }
  const r0 = (opts.size ?? SIZE[k]) * sc * (0.85 + Math.random() * 0.3);
  const w = { p, r: r0 * (k === 0 ? 0.8 : 1), rMax: k === 0 ? r0 * (2.4 + Math.random() * 0.8) : r0, k, heal: 0, run: k === 0 ? 0.015 * sc : 0, runMax: (0.12 + Math.random() * 0.2) * sc, seed: Math.random() * 97, bleeding: k <= 1, age: 0 };
  W.list.push(w);
  if (W.list.length > MAX) W.list.shift(); // the oldest goes
  sync(W);
  return w;
}

// blood keeps running from fresh bullet wounds while they bleed; the player's wounds heal over game days
export function tickWounds(h, dt, opts = {}) {
  const W = h.wound; if (!W || !W.list.length) return;
  for (const w of W.list) {
    w.age += dt;
    if (w.k === 0 && w.bleeding && w.run < w.runMax) { w.run = Math.min(w.runMax, w.run + dt * w.runMax / 25); W.dirty = true; }
    if (w.k === 0 && w.bleeding && w.r < w.rMax) { w.r = Math.min(w.rMax, w.r + dt * w.rMax / 40); W.dirty = true; } // the stain spreads
    if (opts.healDays) { w.heal += (opts.gameHours || 0) / 24 / opts.healDays[w.k]; W.dirty = true; }
  }
  if (opts.healDays) { const n = W.list.length; W.list = W.list.filter((w) => w.heal < 1); if (W.list.length !== n) W.dirty = true; }
  if (W.dirty) sync(W);
}
export const woundCount = (h) => (h.wound ? h.wound.list.length : 0);
export function clearWounds(h) { if (h.wound) { h.wound.list.length = 0; sync(h.wound); } }
