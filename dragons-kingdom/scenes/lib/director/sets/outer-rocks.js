// Shot director set - OUTER_ROCKS (scene 1C, the race: X6-01..03, X6-08..18).
//
// SKY_OFF_VERDOR's world (the same coast, sea, sky, sun, scanned rocks: its build() is called as-is) with the outer
// rocks added off the south end of the coast: tall sea stacks (procedural, three.js), white water round their feet,
// a low sea-mist bank against their seaward side (cinematic volumetric banks) and seabirds on the ledges (one
// InstancedMesh, posed per frame from the shot: sitting / lifting off / wheeling).
//
// LAYOUT = the spec's `map` (episodes/s01e01/final/scenes/specs/outer-rocks.spec.js), DEF below is a copy.
// GAP FRAME: u along the gap's axis (heading map.axis = 150, NNW -> SSE: the way Leaf threads it, the seaward exit
// at +u), v to the LEFT of it (ENE = seaward), y up; origin = map.gap (the gap's centre at sea level).
//   A, B  the two tall stacks leaning together: ~7.5 m apart at the water, ~6.6 m at 10 m, ~2.5 m at their tops
//         (A 64 m, on the seaward side; B 56 m) - Leaf (span ~9 m) fits only on his side, Charcoal (~30 m) never
//   C     the lower stack with a FLAT TOP (y map.low.top, ~10 x 9 m: Leaf lands on it, room to spare), SSE of the exit
//   D-G   more stacks round them (birds, depth); boulders at the feet
// set options per shot (spec.set): birds: { lift: s } (shot-local time the birds go up; < -6 = all already up),
//   shadowAt / shadowExtent (as SKY_OFF_VERDOR; default: the rocks).
import * as THREE from 'three';
import { makeNoise, smooth } from '../../sets/terrain.js';
import { worldMaterial } from '../../sets/materials.js';
import { loadKit } from '../../sets/kitbash.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { build as buildSky } from './sky-off-verdor.js';

const D2R = Math.PI / 180;
export const DEF = {
  gap: [700, 0, 3200], axis: 150,
  // stacks: base centre (u, v), top centre (tu, tv), height H, radii [along u, along v] at the base / top
  stacks: {
    A: { u: 0, v: 14.25, tu: 0, tv: 6.25, H: 64, rb: [14, 10.5], rt: [7, 5.5], seed: 1 },
    B: { u: 0, v: -14.25, tu: 0, tv: -7.0, H: 56, rb: [14, 10.5], rt: [7, 5.5], seed: 2 },
    C: { u: 70, v: -20, tu: 70, tv: -20, H: 17, rb: [12.5, 11.5], rt: [10.5, 9.5], flat: true, seed: 3 },
    D: { u: -38, v: 44, tu: -36, tv: 41, H: 46, rb: [10, 9], rt: [5, 4.5], seed: 4 },
    E: { u: 32, v: -46, tu: 31, tv: -44, H: 36, rb: [9, 9], rt: [4.5, 4.5], seed: 5 },
    F: { u: 122, v: -12, tu: 121, tv: -12, H: 26, rb: [8, 7], rt: [5, 4.5], seed: 6 },
    G: { u: -22, v: -52, tu: -22, tv: -51, H: 21, rb: [7, 6], rt: [4, 3.5], seed: 7 },
  },
};

/** gap frame -> world */
export function gapFrame(map = DEF) {
  const h = map.axis * D2R, f = [Math.sin(h), -Math.cos(h)], l = [-Math.cos(h), -Math.sin(h)];
  const [gx, , gz] = map.gap;
  return (u, v, y = 0) => [gx + f[0] * u + l[0] * v, y, gz + f[1] * u + l[1] * v];
}

/** a stack's ring at height y: centre (u, v) and the radius scale at angle a (pure: Node-testable) */
export function stackRing(s, y, N) {
  const k = Math.min(1, Math.max(0, y / s.H)), kl = Math.pow(k, 1.15);
  const cu = s.u + (s.tu - s.u) * kl, cv = s.v + (s.tv - s.v) * kl;
  const ru = s.rb[0] + (s.rt[0] - s.rb[0]) * k, rv = s.rb[1] + (s.rt[1] - s.rb[1]) * k;
  const under = 1 + 0.18 * smooth(0, -25, y);                         // the foot widens under the water
  const scale = (a) => {
    const n = N.fbm(Math.cos(a) * 1.4 + s.seed * 7.1, Math.sin(a) * 1.4 + y * 0.07, 3);
    const s4 = (y / 4.2 + s.seed * 0.37) % 1, lip = 0.05 * smooth(0.7, 0.92, s4) * (1 - smooth(0.92, 1, s4));   // ledges every ~4 m
    return under * (1 + 0.07 * n + lip + 0.025 * Math.sin(a * 9 + s.seed + y * 0.05));
  };
  return { cu, cv, ru, rv, scale };
}

function stackGeometry(s, W, N, segA, dy) {
  const ys = [];
  for (let y = -32; y < s.H; y += dy) ys.push(y);
  ys.push(s.H);
  const pos = [], idx = [];
  for (const y of ys) {
    const r = stackRing(s, y, N);
    for (let i = 0; i < segA; i++) {
      const a = (i / segA) * Math.PI * 2, sc = r.scale(a);
      const p = W(r.cu + Math.cos(a) * r.ru * sc, r.cv + Math.sin(a) * r.rv * sc, y);
      pos.push(p[0], p[1], p[2]);
    }
  }
  const R = ys.length;
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < segA; i++) {
    const a = j * segA + i, b = j * segA + ((i + 1) % segA), c = a + segA, d = b + segA;
    idx.push(a, c, b, b, c, d);
  }
  // the top: flat (C, Leaf lands on it) or a rough dome
  const top = stackRing(s, s.H, N), cTop = W(top.cu, top.cv, s.H + (s.flat ? 0 : 0.18 * Math.min(top.ru, top.rv)));
  const ci = pos.length / 3; pos.push(...cTop);
  for (let i = 0; i < segA; i++) idx.push(ci, (R - 1) * segA + ((i + 1) % segA), (R - 1) * segA + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a ring of foam / white water round a stack's foot (uv.x round, uv.y outward) */
function foamRing(s, W, N, segA, width) {
  const r = stackRing(s, 0, N), pos = [], uv = [], idx = [];
  for (let i = 0; i <= segA; i++) {
    const a = (i / segA) * Math.PI * 2, sc = r.scale(a) * 0.97;
    for (let k = 0; k < 2; k++) {
      const ext = k === 0 ? 0 : width;
      const p = W(r.cu + Math.cos(a) * (r.ru * sc + ext), r.cv + Math.sin(a) * (r.rv * sc + ext), 0);
      pos.push(p[0], 0, p[2]); uv.push((i / segA) * Math.round((r.ru + r.rv) / 3), k);
    }
  }
  for (let i = 0; i < segA; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function foamTexture(seed) {
  const W = 256, H = 64, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), im = g.createImageData(W, H), N = makeNoise(seed);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = j / (H - 1);
    const n = 0.5 + 0.5 * N.fbm(i / 18, j / 9, 4), m = 0.5 + 0.5 * N.fbm(i / 5 + 40, j / 4, 2);
    const a = Math.max(0, Math.min(1, (n * 1.25 - 0.25 - v * 0.9) * 1.6)) * (0.55 + 0.45 * m) * (1 - smooth(0.7, 1, v));
    const o = (j * W + i) * 4;
    im.data[o] = im.data[o + 1] = im.data[o + 2] = 255; im.data[o + 3] = Math.round(255 * a);
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** a seabird (gannet-sized: span ~1.1 m x k 1.45-1.8): body + two wings in a V; scaling y flaps the wings */
function birdGeometry() {
  const P = [
    // body
    0, 0.0, 0.32, 0.06, 0, -0.05, -0.06, 0, -0.05,
    0, 0.0, 0.32, -0.06, 0, -0.05, 0, -0.04, -0.3,
    0, 0.0, 0.32, 0, -0.04, -0.3, 0.06, 0, -0.05,
    // wings (tips up 0.14: the y scale flaps them)
    0.05, 0, 0.1, 0.55, 0.14, -0.06, 0.05, 0, -0.1,
    -0.05, 0, 0.1, -0.05, 0, -0.1, -0.55, 0.14, -0.06,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, sky: 'physical', haze: 2.0, mieG: 0.8, sunDirection: null, sunIlluminance: 6, apDistanceScale: 1.3, environment: true },
    volumetrics: {
      enabled: true, range: 4000, near: 1, resolution: [200, 96, 64], noiseFilter: true, intensity: 1.0,
      density: 0.00005, heightFalloff: 0.012, fogBase: 0, anisotropy: 0.75, noiseScale: 0.004, noiseAmount: 0.6, wind: [1.5, 0, -0.5],
      banks: [
        // the last mist far out over the water (continuity 1C), the low bank lying against the stacks' seaward side
        // and the gap's exit (X6-01/03/09/15), and a thinner low sheet further out to sea
        { center: [2400, 25, 1600], radius: [900, 45, 2600], density: 0.0025, noise: 0.85 },
        { center: [752, 7, 3215], radius: [56, 11, 72], density: 0.012, noise: 0.85 },
        { center: [900, 9, 3230], radius: [170, 14, 230], density: 0.0035, noise: 0.9 },
      ],
      cloudShadows: { coverage: 0.2, scale: 0.0011, speed: [6, 2], altitude: 1600, opacity: 0.35 },
    },
    shadows: { cascades: 0 },
    ao: { enabled: false },
    dof: { samples: 40 },
    grade: { exposure: 0, whiteBalance: 6000, contrast: 1.1, saturation: 0.97 },
  });
}

export async function build(ctx, { spec } = {}) {
  const { scene } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const MAP = { ...DEF, ...(spec?.map || {}) };
  const W = gapFrame(MAP);
  const base = await buildSky(ctx);              // coast, sea, sky, sun, scanned rocks (SKY_OFF_VERDOR, unchanged)
  const N = makeNoise(41);
  const S = MAP.stacks;

  // ---- the stacks: the coast's pale limestone (acg_rock26, as the cliffs), box-projected
  const rockMat = await worldMaterial(ctx, 'pbr/acg_rock26', { mode: 'box', scale: 6, tint: [0.95, 0.86, 0.72], saturation: 0.85, normalScale: 1.1, macro: 0.55, antiTile: 0.5, grime: { height: 3.5, strength: 0.55, streaks: 0.6, base: 0 }, seed: 3 });
  for (const s of Object.values(S)) {
    const m = new THREE.Mesh(stackGeometry(s, W, N, draft ? 56 : 96, draft ? 1.6 : 0.9), rockMat);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  // boulders at the feet (the coast's scanned rocks)
  const kit = await loadKit(ctx, 'model/babylon_coastal_cliff');
  { const list = [];
    let a = 4242; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (const s of Object.values(S)) for (let i = 0; i < 4; i++) {
      const ang = r() * 6.28, ring = stackRing(s, 0, N), d = 1.0 + 0.35 * r();
      if (s === S.A || s === S.B) { if (Math.abs(Math.sin(ang)) > 0.55) continue; }   // keep the gap clear
      const p = W(s.u + Math.cos(ang) * ring.ru * d, s.v + Math.sin(ang) * ring.rv * d, -1.5);
      const k = 2.5 + r() * 3.5;
      list.push({ p, s: [k, k * 0.7, k], r: r() * 6.28, tilt: [(r() - 0.5) * 0.4, (r() - 0.5) * 0.4] });
    }
    scene.add(kit.instance('rock_moss_set_02', list)); }

  // ---- a dark weed / rock bed round the stacks: SKY_OFF_VERDOR's sandy shelf is only ~4-5 m down out here and read
  // tropical turquoise round the rocks (r1) - this darkens it to a cold green-blue, fading out at its edge
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const bed = new THREE.Mesh(new THREE.CircleGeometry(520, 64), new THREE.MeshStandardMaterial({ color: 0x18221c, roughness: 1, alphaMap: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    bed.rotation.x = -Math.PI / 2; const c = W(30, 0, 0); bed.position.set(c[0], -2.4, c[2]); bed.receiveShadow = true;
    scene.add(bed); }

  // ---- white water round the feet: foam collars (stand-in; the sea's own shore foam adds lines in the late pass)
  const foamTex = foamTexture(77);
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f6, map: foamTex, alphaMap: null, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  foamMat.alphaTest = 0.02;
  const foam = [];
  for (const s of Object.values(S)) {
    for (const [w, y] of [[6, 0.75], [13, 0.5]]) {
      const m = new THREE.Mesh(foamRing(s, W, N, draft ? 64 : 128, w), foamMat);
      m.position.y = y; m.renderOrder = 2; m.receiveShadow = true;
      scene.add(m); foam.push(m);
    }
  }

  // ---- seabirds: sitting on the ledges (A, B, D, E, F, G), a few always in the air
  const nB = draft ? 700 : 1300;
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.8, side: THREE.DoubleSide });
  const birds = new THREE.InstancedMesh(birdGeometry(), birdMat, nB);
  birds.castShadow = false; birds.frustumCulled = false;
  const B = [];
  { let a = 9090; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    const hosts = ['A', 'A', 'A', 'B', 'B', 'B', 'D', 'D', 'E', 'E', 'F', 'G', 'C'];
    const G = W(0, 10, 0);
    for (let i = 0; i < nB; i++) {
      const s = S[hosts[Math.floor(r() * hosts.length)]];
      const y = s.flat ? s.H : Math.max(3, Math.floor((2 + r() * (s.H - 3)) / 4.2) * 4.2 + 3.3 - (s.seed * 0.37 % 1) * 4.2);
      const ring = stackRing(s, Math.min(y, s.H), N), ang = r() * 6.28, sc = ring.scale(ang) * (s.flat ? 0.6 * r() : 1);
      const p = W(ring.cu + Math.cos(ang) * (ring.ru * sc + 0.7), ring.cv + Math.sin(ang) * (ring.rv * sc + 0.7), Math.min(y, s.H) + 0.3);
      const out = [p[0] - W(ring.cu, ring.cv)[0], p[2] - W(ring.cu, ring.cv)[2]], ol = Math.hypot(...out) || 1;
      B.push({
        p, out: [out[0] / ol, out[1] / ol], yaw0: Math.atan2(out[0], out[1]) + (r() - 0.5),
        air: r() < 0.08, delay: r() * 1.1, R: 35 + r() * 95, h: 18 + r() * 80, w: (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.22),
        ph: Math.atan2(p[0] - G[0], p[2] - G[2]), fl: r() * 6.28, hz: 2.6 + r() * 1.0, k: 1.45 + r() * 0.35,
      });
    }
    B.centre = G; }
  scene.add(birds);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V3 = new THREE.Vector3(), SC = new THREE.Vector3();
  /** a bird's world position `since` s after it lifted (< 0: on its ledge) */
  const birdAt = (b, since) => {
    if (since <= 0) return b.p;
    const C = B.centre, ang = b.ph + b.w * since;
    const circ = [C[0] + Math.sin(ang) * b.R, b.h + 6 * Math.sin(since * 0.4 + b.fl), C[2] + Math.cos(ang) * b.R];
    const up = [b.p[0] + b.out[0] * 7 * since, b.p[1] + 5 * since, b.p[2] + b.out[1] * 7 * since];
    const k = smooth(0, 4, since);
    return [up[0] + (circ[0] - up[0]) * k, up[1] + (circ[1] - up[1]) * k, up[2] + (circ[2] - up[2]) * k];
  };
  function poseBirds(local, st) {
    const lift = st.birds?.lift ?? Infinity;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const since = b.air ? 60 + local : local - lift - b.delay;
      if (since <= 0) {
        // sitting: wings folded along the body, a small head bob
        E.set(0, b.yaw0, 0); Q.setFromEuler(E);
        SC.set(0.4 * b.k, 0.4 * b.k, 0.9 * b.k);
        M4.compose(V3.set(b.p[0], b.p[1], b.p[2]), Q, SC);
      } else {
        const p = birdAt(b, since), q = birdAt(b, since + 0.05);
        const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
        const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
        E.set(pitch, yaw, -b.w * 0.6, 'YXZ'); Q.setFromEuler(E);
        // flapping hard for the first seconds, then soaring with the odd beat
        const hard = 1 - smooth(2, 5, since), amp = 0.35 + 0.85 * hard;
        const flap = Math.sin(since * b.hz * 6.283 + b.fl) * amp * (hard > 0.05 ? 1 : (Math.sin(since * 0.7 + b.fl) > 0.6 ? 1 : 0.15));
        SC.set(b.k, b.k * (0.2 + 1.6 * flap), b.k);
        M4.compose(V3.set(p[0], p[1], p[2]), Q, SC);
      }
      birds.setMatrixAt(i, M4);
    }
    birds.instanceMatrix.needsUpdate = true;
  }

  // the ground: the flat top of the low stack C (Leaf lands on it), else the base set's
  const C = S.C, cTop = stackRing(C, C.H, N), cW = W(cTop.cu, cTop.cv);
  const h = MAP.axis * D2R, fx = [Math.sin(h), -Math.cos(h)], lx = [-Math.cos(h), -Math.sin(h)];
  const onC = (x, z) => {
    const dx = x - cW[0], dz = z - cW[2];
    const u = dx * fx[0] + dz * fx[1], v = dx * lx[0] + dz * lx[1];
    return (u / (cTop.ru * 0.93)) ** 2 + (v / (cTop.rv * 0.93)) ** 2 <= 1;
  };
  const ground = (x, z) => (onC(x, z) ? C.H : base.ground(x, z));

  const marks = {
    ...base.marks,
    gap: W(0, 0, 9), gapIn: W(-16, 0, 9), gapOut: W(16, 0, 9), lowTop: [cW[0], C.H, cW[2]],
    topA: W(S.A.tu, S.A.tv, S.A.H), topB: W(S.B.tu, S.B.tv, S.B.H),
  };
  return {
    marks,
    objects: {},
    ground,
    coastX: base.coastX,
    /** the gap frame (u along the axis, v seaward) -> world (spec helpers) */
    W,
    applyShot(info) {
      const st = info.spec.set || {};
      // the base set's shadow box: the rocks unless the shot says otherwise
      const set2 = { ...st, shadowAt: st.shadowAt || [725, 20, 3235], shadowExtent: st.shadowExtent ?? 170 };
      base.applyShot({ ...info, spec: { ...info.spec, set: set2 } });
      foamTex.offset.x = (info.t * 0.004) % 1;
      poseBirds(info.local, st);
    },
  };
}
