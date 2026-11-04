// Real 3D architecture on top of the facade shader, so buildings stop reading
// as boxes with pictures on them once you get close or look along a wall.
//
// Always there (instanced, a few draw calls for the whole city):
//  - cornices and parapet walls with a coping on every flat roof, a fascia and
//    corner boards on houses, a chimney on some
//  - plinths at street level, string courses between floors on brick and
//    stucco blocks, stone quoins on brick corners, metal corner trims and caps
//    on the glass and office towers
//  - real shopfronts on the ground floor: piers between the bays, a sign band,
//    a granite stall riser under the glass, and canvas awnings over some bays
// Near the camera (rebuilt as you move):
//  - every window gets a sill and a head (stone on brick, painted casings on
//    houses and stucco), placed exactly on the shader's window grid
//  - shopfront mullions and transoms
import * as THREE from 'three';

// the facade shader's window grid (buildings.js): cell size, window size as a share of the cell, first row offset
export function windowGrid(style) {
  if (style < 2.5) return { cs: [3.2, 3.4], ws: [0.42, 0.5], off: 1.0 };
  if (style < 3.5) return { cs: [9.0, 6.0], ws: [0.3, 0.18], off: 1.0 };
  if (style < 4.5) return { cs: [3.6, 3.0], ws: [0.32, 0.42], off: 0.6 };
  return { cs: [4.0, 4.0], ws: [0.75, 0.55], off: 0.6 };
}
const SHOP_STYLE = (st) => st < 2.5 || st > 4.5; // ground floor is shops (shader: v 0.25..4.4)
const SHOP_TOP = 4.4, SHOP_GLASS = 3.7, BAY = 6;

function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }

// a material whose texture is mapped by world position (no stretching on long, thin pieces)
function worldMapped(params, tex, size, key) {
  const m = new THREE.MeshStandardMaterial(params);
  if (!tex || !tex.color) return m;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tTrimC = { value: tex.color };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
mat4 tIM = modelMatrix;
#ifdef USE_INSTANCING
tIM = modelMatrix * instanceMatrix;
#endif
vTW = (tIM * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(tIM) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN; uniform sampler2D tTrimC; vec2 tUV;')
      .replace('#include <map_fragment>', `
vec3 tAn = abs(normalize(vTN));
tUV = (tAn.x > 0.5 ? vTW.zy : tAn.y > 0.5 ? vTW.xz : vTW.xy) / ${size.toFixed(2)};
diffuseColor.rgb *= texture2D(tTrimC, tUV).rgb * 1.7;`);
  };
  m.customProgramCacheKey = () => 'sbtrim-' + key;
  return m;
}

export function createFacades(B, { scene, quality, surf, roofOf, roofs, hm, graph, props = [] }) {
  const lite = quality.label === 'Phone';
  const nearR = lite ? 0 : quality.label === 'Low' ? 70 : quality.label === 'Medium' ? 110 : 160;
  const shadows = quality.shadows > 0;

  const MATS = {
    stone: worldMapped({ color: 0xffffff, roughness: 0.86 }, surf && surf.concrete && surf.concrete.real ? surf.concrete : null, 1.6, 'stone'),
    paint: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.85 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    brick: worldMapped({ color: 0xffffff, roughness: 0.9 }, surf && surf.redbrick && surf.redbrick.real ? surf.redbrick : (surf && surf.bricks && surf.bricks.real ? surf.bricks : null), 2.2, 'brick'),
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const col = new THREE.Color();

  // ---- piece lists: [x, y, z, ry, rx, sx, sy, sz, rz] + rgb
  const makeList = () => ({ f: [], c: [] });
  const add = (L, x, y, z, ry, rx, sx, sy, sz, rgb, rz = 0) => { L.f.push(x, y, z, ry, rx, sx, sy, sz, rz); L.c.push(rgb); };

  const ground = (b) => b.y - (hm ? hm.height(b.x, b.z) : b.y) < 1.2;
  // the four walls: outward normal, the axis the shader's u runs along, where the wall is
  const walls = (b) => [
    { nx: 0, nz: 1, ax: 'x', c: b.z + b.d / 2, u0: b.x - b.w / 2, u1: b.x + b.w / 2, ry: 0 },
    { nx: 0, nz: -1, ax: 'x', c: b.z - b.d / 2, u0: b.x - b.w / 2, u1: b.x + b.w / 2, ry: 0 },
    { nx: 1, nz: 0, ax: 'z', c: b.x + b.w / 2, u0: b.z - b.d / 2, u1: b.z + b.d / 2, ry: Math.PI / 2 },
    { nx: -1, nz: 0, ax: 'z', c: b.x - b.w / 2, u0: b.z - b.d / 2, u1: b.z + b.d / 2, ry: Math.PI / 2 },
  ];
  // a piece on a wall: u along the wall (world coordinate), y its centre, `along` x `tall` x `deep`, standing `gap` off the wall
  // rz turns the piece in the wall's plane (rake boards on a gable)
  const onWall = (L, W, u, y, along, tall, deep, rgb, gap = 0, rx = 0, rz = 0) => {
    const o = gap + deep / 2;
    if (W.ax === 'x') add(L, u, y, W.c + W.nz * o, W.ry, rx * W.nz, along, tall, deep, rgb, rz);
    else add(L, W.c + W.nx * o, y, u, W.ry, rx * W.nx, along, tall, deep, rgb, rz);
  };
  // the wall that faces the street (where the front door is, as estate.js decides)
  const front = (b) => {
    let best = null, bd = Infinity;
    if (graph) for (const e of graph.edges) {
      const P = e.pts;
      for (let i = 1; i < P.length; i++) {
        const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / L2));
        const px = ax + dx * t, pz = az + dz * t, d = (px - b.x) ** 2 + (pz - b.z) ** 2;
        if (d < bd) { bd = d; best = [px, pz]; }
      }
    }
    if (!best) return 0;
    const dx = best[0] - b.x, dz = best[1] - b.z;
    if (Math.abs(dx) / b.w > Math.abs(dz) / b.d) return dx > 0 ? 2 : 3;
    return dz >= 0 ? 0 : 1;
  };

  const TRIM = { 2: [0xd9d2c3, 0xcfc6b2, 0xe3ddd0], 4: [0xf4f1ea, 0xece8de, 0xffffff, 0x2e3a33, 0x4a3a2c], 5: [0xe9e2d2, 0xd8cdb6, 0xf2ece0], 3: [0x8a8c88, 0x6f7a7f], 1: [0xbdb8ae], 0: [0x6a7078] };
  const AWNING = [0x23472f, 0x7a1f1f, 0x1f2f4f, 0x5a4a2a, 0x2a2a2a, 0x8a5a1a, 0x3a5a6a];
  const SIGN = [0x1d1f22, 0x24302a, 0x3a2020, 0x1f2a3a, 0x2c2c2c, 0x4a3a28];
  const pickC = (arr, h) => arr[Math.floor(h * arr.length) % arr.length];

  // ---- the static architecture
  const S = { stone: makeList(), paint: makeList(), metal: makeList(), canvas: makeList(), brick: makeList() };
  const ranges = new Map(); // bi -> { stone: [a, n], ... } for hiding a building
  B.forEach((b, bi) => {
    const st = b.style, seed = hash(b.x, b.z), top = b.y + b.h;
    const gable = roofOf && roofOf.has(bi);
    const start = {}; for (const k in S) start[k] = S[k].c.length;
    const trim = pickC(TRIM[st] || TRIM[1], seed);
    const atGround = ground(b);
    const W4 = walls(b);
    if (st === 4) {
      // houses: foundation skirt, corner boards, fascia under the eaves, sometimes a brick chimney
      for (const W of W4) {
        onWall(S.stone, W, (W.u0 + W.u1) / 2, b.y + 0.25, W.u1 - W.u0 + 0.1, 0.5, 0.06, 0x9a958c);
        for (const u of [W.u0 + 0.07, W.u1 - 0.07]) onWall(S.paint, W, u, b.y + b.h / 2, 0.16, b.h, 0.04, trim);
        onWall(S.paint, W, (W.u0 + W.u1) / 2, top - 0.12, W.u1 - W.u0 + 0.12, 0.24, 0.05, trim);
      }
      if (gable && seed > 0.45) {
        const cx = b.x + (seed - 0.7) * b.w * 0.6, cz = b.z + (hash(b.z, b.x) - 0.5) * b.d * 0.5;
        add(S.brick, cx, top + 1.6, cz, 0, 0, 0.7, 3.4, 0.7, 0xb07a66);
        add(S.stone, cx, top + 3.35, cz, 0, 0, 0.82, 0.1, 0.82, 0x8a8680);
      }
      // the front door, facing the street, with its casing, a step, and on most houses a porch
      const F = W4[front(b)], mid = (F.u0 + F.u1) / 2, flen = F.u1 - F.u0;
      const doorC = pickC([0x3b2a1e, 0x6a1f1f, 0x1f3a2a, 0x24324a, 0x2a2a2a, 0xe9e4d8], hash(seed, 5.5));
      onWall(S.paint, F, mid, b.y + 0.3 + 1.05, 0.98, 2.1, 0.05, doorC);
      onWall(S.paint, F, mid, b.y + 0.3 + 2.18, 1.3, 0.16, 0.06, trim);
      for (const s2 of [-1, 1]) onWall(S.paint, F, mid + s2 * 0.57, b.y + 0.3 + 1.05, 0.12, 2.2, 0.06, trim);
      onWall(S.metal, F, mid + 0.36, b.y + 0.3 + 1.0, 0.04, 0.16, 0.08, 0xc9b27a); // the handle
      if (seed < 0.72 && flen >= 6) {
        const pl = Math.min(flen * 0.72, 7.5), pd = 2.2, ph = 2.55;
        onWall(S.paint, F, mid, b.y + 0.17, pl, 0.34, pd, 0x8c7a66);                                   // deck
        onWall(S.stone, F, mid, b.y + 0.09, 1.5, 0.18, 0.4, 0x9a958c, pd);                            // steps
        onWall(S.stone, F, mid, b.y + 0.04, 1.7, 0.08, 0.45, 0x9a958c, pd + 0.32);
        const posts = pl > 5 ? [-1, -0.33, 0.33, 1] : [-1, 1];
        for (const k of posts) onWall(S.paint, F, mid + k * (pl / 2 - 0.12), b.y + 0.34 + ph / 2, 0.14, ph, 0.14, trim, pd - 0.2);
        onWall(S.paint, F, mid, b.y + 0.34 + ph + 0.06, pl + 0.1, 0.16, 0.18, trim, pd - 0.25);        // beam
        onWall(S.paint, F, mid, b.y + 0.34 + ph + 0.22, pl + 0.4, 0.08, pd + 0.35, 0x4d4a46, -0.1, 0.12); // porch roof
        for (const sd of [-1, 1]) {                                                                   // rails either side of the steps
          const a = mid + sd * (pl / 2 - 0.12), z = mid + sd * 0.85, len = Math.abs(a - z);
          if (len > 0.4) {
            onWall(S.paint, F, (a + z) / 2, b.y + 1.25, len, 0.07, 0.07, trim, pd - 0.2);
            onWall(S.paint, F, (a + z) / 2, b.y + 0.48, len, 0.06, 0.06, trim, pd - 0.2);
          }
        }
      }
    } else {
      // plinth at the street
      if (atGround && !SHOP_STYLE(st)) for (const W of W4) onWall(S.stone, W, (W.u0 + W.u1) / 2, b.y + 0.35, W.u1 - W.u0 + 0.16, 0.7, 0.08, 0x8f8b84);
      if (!gable) {
        // cornice: a slab overhanging the walls just under the roof line, then a parapet with a coping
        const over = st <= 1 ? 0.25 : st === 3 ? 0.18 : 0.45, ct = st <= 1 ? 0.35 : st === 3 ? 0.25 : 0.55;
        const corMat = st <= 1 ? S.metal : st === 3 ? S.paint : S.stone;
        const corC = st <= 1 ? 0x3c4046 : st === 3 ? 0x6d716e : trim;
        add(corMat, b.x, top - ct / 2 - 0.03, b.z, 0, 0, b.w + over * 2, ct, b.d + over * 2, corC);
        if (st === 2 || st === 5) add(S.stone, b.x, top - ct - 0.12, b.z, 0, 0, b.w + over, 0.18, b.d + over, corC); // a second step (dentil course)
        const ph = st <= 1 ? 1.1 : st === 3 ? 0.6 : 0.95, pt = 0.25;
        const pMat = st === 2 ? S.brick : st <= 1 ? S.metal : S.stone;
        const pC = st === 2 ? 0xffffff : st <= 1 ? 0x50565e : (st === 3 ? 0x7d807b : b.color);
        add(pMat, b.x, top + ph / 2, b.z + b.d / 2 - pt / 2, 0, 0, b.w, ph, pt, pC);
        add(pMat, b.x, top + ph / 2, b.z - b.d / 2 + pt / 2, 0, 0, b.w, ph, pt, pC);
        add(pMat, b.x + b.w / 2 - pt / 2, top + ph / 2, b.z, 0, 0, pt, ph, b.d - pt * 2, pC);
        add(pMat, b.x - b.w / 2 + pt / 2, top + ph / 2, b.z, 0, 0, pt, ph, b.d - pt * 2, pC);
        const cc = st <= 1 ? 0x2e3237 : 0xb9b4aa, cm = st <= 1 ? S.metal : S.stone;
        add(cm, b.x, top + ph + 0.04, b.z + b.d / 2 - pt / 2, 0, 0, b.w + 0.1, 0.08, pt + 0.12, cc);
        add(cm, b.x, top + ph + 0.04, b.z - b.d / 2 + pt / 2, 0, 0, b.w + 0.1, 0.08, pt + 0.12, cc);
        add(cm, b.x + b.w / 2 - pt / 2, top + ph + 0.04, b.z, 0, 0, pt + 0.12, 0.08, b.d - pt * 2, cc);
        add(cm, b.x - b.w / 2 + pt / 2, top + ph + 0.04, b.z, 0, 0, pt + 0.12, 0.08, b.d - pt * 2, cc);
      }
      // corners: metal trims on the towers, stone quoins on brick
      for (const W of W4.slice(0, 2)) {
        for (const u of [W.u0, W.u1]) {
          if (st <= 1) {
            add(S.metal, u, b.y + b.h / 2, W.c, 0, 0, 0.36, b.h, 0.36, 0x40464d);
          } else if (st === 2 && b.h < 36) {
            const q0 = atGround && SHOP_STYLE(st) ? SHOP_TOP : 0;
            for (let y = b.y + q0 + 0.2, k = 0; y < top - 0.6; y += 0.62, k++) {
              const long = k % 2 === 0;
              add(S.stone, u + (u > b.x ? -1 : 1) * (long ? 0.3 : 0.18) + (u > b.x ? 0.06 : -0.06), y + 0.25, W.c + W.nz * 0.06, 0, 0, long ? 0.72 : 0.48, 0.5, 0.12, trim);
              add(S.stone, u + (u > b.x ? 0.06 : -0.06), y + 0.25, W.c + W.nz * 0.06 - W.nz * (long ? 0.18 : 0.3), Math.PI / 2, 0, long ? 0.48 : 0.72, 0.5, 0.12, trim);
            }
          }
        }
      }
      // string courses between floors (brick and stucco blocks)
      if (st === 2 || st === 5) {
        const G = windowGrid(st), every = st === 2 ? 2 : 1;
        for (let j = 0, v = G.off; b.y + v < top - 1.5; j++, v += G.cs[1]) {
          if (j % every || v < 0.5) continue;
          const y = b.y + v - 0.05;
          for (const W of W4) onWall(S.stone, W, (W.u0 + W.u1) / 2, y, W.u1 - W.u0 + 0.1, 0.16, 0.07, trim);
        }
      }
      // shopfronts
      if (atGround && SHOP_STYLE(st)) {
        const sign = pickC(SIGN, hash(seed, 3.1));
        const pier = st === 2 ? S.brick : st <= 1 ? S.metal : S.stone;
        const pierC = st === 2 ? 0xffffff : st <= 1 ? 0x2f3338 : trim;
        for (const W of W4) {
          const len = W.u1 - W.u0, mid = (W.u0 + W.u1) / 2;
          onWall(S.paint, W, mid, b.y + (SHOP_GLASS + SHOP_TOP) / 2, len + 0.3, SHOP_TOP - SHOP_GLASS, 0.22, sign);           // sign band
          onWall(S.stone, W, mid, b.y + SHOP_TOP + 0.06, len + 0.4, 0.12, 0.34, 0xb6b0a4);                                  // its cap
          onWall(S.stone, W, mid, b.y + 0.17, len + 0.02, 0.34, 0.05, 0x2a2b2d);                                            // granite stall riser
          for (let k = Math.ceil(W.u0 / BAY); k * BAY <= W.u1 + 0.01; k++) {
            const u = k * BAY;
            if (u < W.u0 + 0.3 || u > W.u1 - 0.3) continue;
            onWall(pier, W, u, b.y + SHOP_GLASS / 2, 0.72, SHOP_GLASS, 0.14, pierC);
          }
          for (const u of [W.u0 + 0.25, W.u1 - 0.25]) onWall(pier, W, u, b.y + SHOP_TOP / 2, 0.5, SHOP_TOP, 0.16, pierC);
          // canvas awnings over some bays, sloping out from the sign band
          for (let k = Math.floor(W.u0 / BAY); k * BAY < W.u1; k++) {
            const a = k * BAY + 0.36, z = (k + 1) * BAY - 0.36;
            if (a < W.u0 + 0.4 || z > W.u1 - 0.4) continue;
            const h = hash(k + seed * 31, W.nx * 7 + W.nz * 13);
            if (h > 0.42) continue;
            const depth = 1.3, drop = 0.75, slope = Math.atan2(drop, depth), L = Math.hypot(depth, drop);
            onWall(S.canvas, W, (a + z) / 2, b.y + SHOP_GLASS - 0.05 - drop / 2, z - a, 0.04, L, pickC(AWNING, h * 2.3), -L / 2 + depth / 2 + 0.02, slope);
            onWall(S.canvas, W, (a + z) / 2, b.y + SHOP_GLASS - drop - 0.12, z - a, 0.26, 0.03, pickC(AWNING, h * 2.3), depth); // valance
          }
        }
      }
    }
    const r = {}; for (const k in S) r[k] = [start[k], S[k].c.length - start[k]]; ranges.set(bi, r);
  });

  const Cone = { f: [], c: [] };
  // gable roofs: a ridge cap, fascia boards along the eaves and rake boards up the gable ends
  const roofTrim = new Map();
  if (roofs) roofs.forEach((r, ri) => {
    const alongZ = Math.abs(Math.sin(r.rot || 0)) > 0.5;
    const L = alongZ ? r.d : r.w, Sp = alongZ ? r.w : r.d, hs = Sp / 2;
    const a0 = S.paint.c.length, b0 = S.stone.c.length;
    const ry = alongZ ? Math.PI / 2 : 0;
    const P = (along, across, y) => alongZ ? [r.x + across, y, r.z + along] : [r.x + along, y, r.z + across];
    // ridge cap
    { const [x, y, z] = P(0, 0, r.y + r.h + 0.04); add(S.stone, x, y, z, ry, 0, L + 0.06, 0.12, 0.34, 0x3a3836); }
    // eave fascia
    for (const sd of [-1, 1]) { const [x, y, z] = P(0, sd * (hs + 0.03), r.y - 0.1); add(S.paint, x, y, z, ry, 0, L + 0.06, 0.22, 0.05, 0xe9e5dc); }
    // rakes: up each slope at both gable ends
    const slope = Math.atan2(r.h, hs), len = Math.hypot(hs, r.h);
    for (const e of [-1, 1]) for (const sd of [-1, 1]) {
      const [x, y, z] = P(e * (L / 2 + 0.03), sd * hs / 2, r.y + r.h / 2 - 0.04);
      add(S.paint, x, y, z, ry + Math.PI / 2, 0, len + 0.05, 0.2, 0.05, 0xe9e5dc, sd * slope);
    }
    roofTrim.set(ri, { paint: [a0, S.paint.c.length - a0], stone: [b0, S.stone.c.length - b0] });
  });
  if (roofOf) for (const [bi, ri] of roofOf) {
    const r = ranges.get(bi), t = roofTrim.get(ri);
    if (r && t) { r.roofPaint = t.paint; r.roofStone = t.stone; }
  }
  // rooftop units: fans on the AC boxes; water towers as round tanks on legs
  const C = { f: [], c: [] };
  for (const pr of props) {
    if (pr.color === 0x77787a) {
      const n = pr.w * pr.d > 9 ? 2 : 1, rr = Math.min(pr.w / n, pr.d) * 0.36;
      for (let k = 0; k < n; k++) {
        const fx = pr.x + (n === 2 ? (k - 0.5) * pr.w / 2 : 0);
        add(C, fx, pr.y + pr.h + 0.12, pr.z, 0, 0, rr * 2, 0.24, rr * 2, 0x55585a);
        add(S.metal, fx, pr.y + pr.h + 0.25, pr.z, 0, 0, rr * 1.9, 0.03, 0.05, 0x2a2c2e);
        add(S.metal, fx, pr.y + pr.h + 0.25, pr.z, Math.PI / 2, 0, rr * 1.9, 0.03, 0.05, 0x2a2c2e);
      }
      for (const sd of [-1, 1]) for (let y = 0.25; y < pr.h - 0.2; y += 0.22) add(S.metal, pr.x, pr.y + y, pr.z + sd * (pr.d / 2 + 0.02), 0, 0, pr.w * 0.8, 0.05, 0.05, 0x5c5f61);
    } else if (pr.tower) {
      const R = 1.5, H = 3.2, legs = 3.0;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(S.metal, pr.x + lx * R * 0.7, pr.y + legs / 2, pr.z + lz * R * 0.7, 0, 0, 0.16, legs, 0.16, 0x3a3836);
      add(C, pr.x, pr.y + legs + H / 2, pr.z, 0, 0, R * 2, H, R * 2, 0x6b4a33);
      for (let y = 0.4; y < H; y += 0.8) add(C, pr.x, pr.y + legs + y, pr.z, 0, 0, R * 2 + 0.06, 0.07, R * 2 + 0.06, 0x2c2a28);
      add(Cone, pr.x, pr.y + legs + H + 0.55, pr.z, 0, 0, R * 2.2, 1.1, R * 2.2, 0x4a4440);
    }
  }

  const m4 = new THREE.Matrix4(), qY = new THREE.Quaternion(), qX = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const AY = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
  const write = (mesh, L, i0, n, dst = 0) => {
    for (let i = 0; i < n; i++) {
      const o = (i0 + i) * 9;
      qY.setFromAxisAngle(AY, L.f[o + 3]);
      if (L.f[o + 4]) qY.multiply(qX.setFromAxisAngle(AX, L.f[o + 4]));
      if (L.f[o + 8]) qY.multiply(qX.setFromAxisAngle(AZ, L.f[o + 8]));
      m4.compose(p.set(L.f[o], L.f[o + 1], L.f[o + 2]), qY, s.set(L.f[o + 5], L.f[o + 6], L.f[o + 7]));
      mesh.setMatrixAt(dst + i, m4);
      mesh.setColorAt(dst + i, col.setHex(L.c[i0 + i]));
    }
  };
  const statics = {};
  for (const k in S) {
    const L = S[k], n = L.c.length;
    if (!n) continue;
    const mesh = new THREE.InstancedMesh(box, MATS[k], n);
    write(mesh, L, 0, n);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    mesh.userData.noHit = true;
    mesh.computeBoundingSphere();
    mesh.name = 'facade-' + k;
    scene.add(mesh);
    statics[k] = mesh;
  }

  for (const [name, L, geo, mat] of [['cyl', C, new THREE.CylinderGeometry(0.5, 0.5, 1, 20), MATS.paint], ['cone', Cone, new THREE.ConeGeometry(0.5, 1, 20), MATS.paint]]) {
    if (!L.c.length) continue;
    const mesh = new THREE.InstancedMesh(geo, name === 'cyl' ? MATS.wood : mat, L.c.length);
    write(mesh, L, 0, L.c.length);
    mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.userData.noHit = true;
    mesh.computeBoundingSphere(); mesh.name = 'facade-' + name;
    scene.add(mesh);
  }

  // ---- near the camera: window sills, heads and casings; shopfront mullions
  const NEAR = { stone: makeList(), paint: makeList(), metal: makeList() };
  const nearCap = { stone: 20000, paint: 16000, metal: 8000 };
  const near = {};
  if (nearR > 0) {
    for (const k in NEAR) {
      const mesh = new THREE.InstancedMesh(box, MATS[k], nearCap[k]);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nearCap[k] * 3).fill(1), 3);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = shadows && quality.shadows >= 3; mesh.receiveShadow = true;
      mesh.userData.noHit = true; mesh.name = 'facade-near-' + k;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      near[k] = mesh;
    }
  }
  const hidden = new Set();
  const nearPieces = (b, bi) => {
    const st = b.style;
    if (st <= 1 && !ground(b)) return; // tower faces are photographed curtain walls
    const seed = hash(b.x, b.z), G = windowGrid(st), trim = pickC(TRIM[st] || TRIM[1], seed);
    const shopFloor = SHOP_STYLE(st) && ground(b);
    for (const W of walls(b)) {
      // windows exactly where the shader draws them, whole ones only
      if (st >= 2) {
        const ww = G.ws[0] * G.cs[0], wh = G.ws[1] * G.cs[1];
        for (let i = Math.floor(W.u0 / G.cs[0]); (i + 0.5) * G.cs[0] < W.u1; i++) {
          const uc = (i + 0.5) * G.cs[0];
          if (uc - ww / 2 < W.u0 + 0.2 || uc + ww / 2 > W.u1 - 0.2) continue;
          for (let j = 0; ; j++) {
            const vc = G.off + (j + 0.5) * G.cs[1], vb = vc - wh / 2, vt = vc + wh / 2;
            if (vt > b.h - 0.8) break;
            if (shopFloor && vb < SHOP_TOP) continue;
            const y0 = b.y + vb, y1 = b.y + vt;
            if (st === 2) { // brick: stone sill and a stone lintel
              onWall(NEAR.stone, W, uc, y0 - 0.05, ww + 0.22, 0.1, 0.12, trim);
              onWall(NEAR.stone, W, uc, y1 + 0.11, ww + 0.3, 0.22, 0.05, trim);
            } else if (st === 4 || st === 5) { // painted casings and a sill (shutters on some houses)
              if (st === 4 && seed > 0.55) for (const sd of [-1, 1]) onWall(NEAR.paint, W, uc + sd * (ww / 2 + 0.1 + ww * 0.24), (y0 + y1) / 2, ww * 0.46, wh + 0.06, 0.035, pickC([0x1f3328, 0x222426, 0x3b2a22, 0x2a3446, 0x5a1f1c], hash(seed, 9.1)));
              onWall(NEAR.paint, W, uc, y0 - 0.04, ww + 0.24, 0.07, 0.09, trim);
              onWall(NEAR.paint, W, uc, y1 + 0.07, ww + 0.2, 0.14, 0.035, trim);
              onWall(NEAR.paint, W, uc - ww / 2 - 0.045, (y0 + y1) / 2, 0.09, wh, 0.03, trim);
              onWall(NEAR.paint, W, uc + ww / 2 + 0.045, (y0 + y1) / 2, 0.09, wh, 0.03, trim);
            } else if (st === 3) { // warehouse: a metal drip over the high windows
              onWall(NEAR.metal, W, uc, y1 + 0.04, ww + 0.2, 0.05, 0.12, 0x6a6e70);
            }
          }
        }
      }
      // shopfront glazing bars: a mullion every 1.5 m, a transom at 2.9 m (as the shader draws them)
      if (shopFloor) {
        for (let k = Math.ceil((W.u0 - 0.75) / 1.5); 0.75 + k * 1.5 < W.u1; k++) {
          const u = 0.75 + k * 1.5;
          if (u < W.u0 + 0.5 || u > W.u1 - 0.5) continue;
          const sf = ((u / BAY) % 1 + 1) % 1;
          if (sf < 0.06 || sf > 0.94) continue;
          onWall(NEAR.metal, W, u, b.y + 0.34 + (SHOP_GLASS - 0.34) / 2, 0.06, SHOP_GLASS - 0.34, 0.07, 0x2a2d31);
        }
        onWall(NEAR.metal, W, (W.u0 + W.u1) / 2, b.y + 2.9, W.u1 - W.u0 - 0.6, 0.07, 0.07, 0x2a2d31);
        onWall(NEAR.metal, W, (W.u0 + W.u1) / 2, b.y + SHOP_GLASS - 0.03, W.u1 - W.u0 - 0.6, 0.06, 0.06, 0x2a2d31);
      }
    }
    void bi;
  };
  // buildings on a coarse grid so a refresh only looks at what's close
  const CELL = 64, grid = new Map();
  B.forEach((b, bi) => {
    const r = Math.hypot(b.w, b.d) / 2;
    for (let gx = Math.floor((b.x - r) / CELL); gx <= Math.floor((b.x + r) / CELL); gx++)
      for (let gz = Math.floor((b.z - r) / CELL); gz <= Math.floor((b.z + r) / CELL); gz++) {
        const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(bi);
      }
  });
  const last = new THREE.Vector3(1e9, 0, 1e9);
  let timer = 0;
  function refresh(cam) {
    for (const k in NEAR) { NEAR[k].f.length = 0; NEAR[k].c.length = 0; }
    const seen = new Set();
    const g0x = Math.floor((cam.x - nearR) / CELL), g1x = Math.floor((cam.x + nearR) / CELL);
    const g0z = Math.floor((cam.z - nearR) / CELL), g1z = Math.floor((cam.z + nearR) / CELL);
    const list = [];
    for (let gx = g0x; gx <= g1x; gx++) for (let gz = g0z; gz <= g1z; gz++) {
      for (const bi of grid.get(gx + ',' + gz) || []) {
        if (seen.has(bi) || hidden.has(bi)) continue;
        seen.add(bi);
        const b = B[bi];
        const dx = Math.max(Math.abs(cam.x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(cam.z - b.z) - b.d / 2, 0);
        const d = Math.hypot(dx, dz);
        if (d < nearR) list.push([d, bi]);
      }
    }
    list.sort((a, b) => a[0] - b[0]); // closest first, so the caps cut off far ones
    for (const [, bi] of list) nearPieces(B[bi], bi);
    for (const k in near) {
      const L = NEAR[k], n = Math.min(L.c.length, nearCap[k]);
      write(near[k], L, 0, n);
      near[k].count = n;
      near[k].instanceMatrix.needsUpdate = true;
      if (near[k].instanceColor) near[k].instanceColor.needsUpdate = true;
    }
  }

  // every piece, including every window sill and head on every building (for the Unity carryover)
  function exportPieces() {
    const saved = {}; for (const k in NEAR) saved[k] = { f: NEAR[k].f.slice(), c: NEAR[k].c.slice() };
    for (const k in NEAR) { NEAR[k].f.length = 0; NEAR[k].c.length = 0; }
    B.forEach((b, bi) => { if (!hidden.has(bi)) nearPieces(b, bi); });
    const out = { stride: 9, layout: 'x,y,z,ry,rx,sx,sy,sz,rz (three.js space; rotation order Y then X then Z), rgb', kinds: {} };
    const put = (name, shape, L) => { if (L.c.length) out.kinds[name] = { shape, f: Array.from(L.f, (v) => Math.round(v * 1000) / 1000), c: L.c.slice() }; };
    for (const k in S) put(k, 'box', S[k]);
    put('wood', 'cylinder', C);
    put('roofcone', 'cone', Cone);
    for (const k in NEAR) put('near-' + k, 'box', NEAR[k]);
    for (const k in NEAR) { NEAR[k].f = saved[k].f; NEAR[k].c = saved[k].c; }
    return out;
  }

  return {
    statics, near, exportPieces,
    count: () => Object.values(statics).reduce((a, m) => a + m.count, 0),
    update(cam, dt = 1 / 60) {
      if (!nearR) return;
      timer -= dt;
      if ((timer <= 0 && cam.distanceToSquared(last) > 4) || cam.distanceToSquared(last) > 100) { refresh(cam); last.copy(cam); timer = 0.4; }
    },
    // take a building's details away (burnt down) or put them back
    show(bi, on) {
      if (on) hidden.delete(bi); else hidden.add(bi);
      const r = ranges.get(bi);
      if (r) for (const [k, rk] of [['stone', 'stone'], ['paint', 'paint'], ['metal', 'metal'], ['canvas', 'canvas'], ['brick', 'brick'], ['paint', 'roofPaint'], ['stone', 'roofStone']]) {
        const [a, n] = r[rk] || [0, 0];
        if (!n || !statics[k]) continue;
        if (on) write(statics[k], S[k], a, n, a);
        else for (let i = 0; i < n; i++) statics[k].setMatrixAt(a + i, m4.makeScale(0, 0, 0));
        statics[k].instanceMatrix.needsUpdate = true;
      }
      last.set(1e9, 0, 1e9);
    },
  };
}
