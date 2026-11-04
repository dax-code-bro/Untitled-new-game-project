// Procedural buildings: downtown towers, offices, brick blocks, warehouses,
// town houses, lake houses, farms and cabins. One facade shader draws the
// windows (lit at night) so thousands of buildings cost only a few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TOWN, LAKE, PLAINS, FOREST, lakeRadius, coastZ, REGIONS } from './layout.js';
import { distToSeg } from '../util.js';
import { mulberry32, GLSL_NOISE } from '../util.js';
import { worldUniforms } from './terrain.js';

// style: 0 glass tower, 1 office, 2 brick, 3 warehouse/barn, 4 house siding, 5 shop
const PALETTES = {
  0: [0x8fa3b5, 0x6d7f8f, 0xa6b2ba, 0x5d6a76],
  1: [0xb8b0a2, 0xcfc6b5, 0x9f9a91, 0xd8d2c4, 0x8e8a83],
  2: [0x8a4a36, 0x9b5a40, 0x7a3e30, 0xa36b4c, 0x6e3b2c],
  3: [0x9a9c9a, 0x7d8a8f, 0xa53a2c, 0xb7b29f, 0x6f7a63],
  4: [0xe8e2d0, 0xd9cfae, 0xb9cbd6, 0xe0c9b8, 0xc8d4b9, 0xf0ece0, 0x9fb6a7],
  5: [0xd8c7a2, 0xc09a74, 0xe2d6c0, 0x9eb3ae],
};

function makeFacadeMaterial(surf) {
  const real = surf && surf.glass.real ? 1 : 0;
  const S = (k) => (surf ? surf[k].size : 3).toFixed(2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.fragmentShader = 'uniform float uWet;\n' + shader.fragmentShader;
    const T = (k, m) => ({ value: surf ? surf[k][m] : null });
    Object.assign(shader.uniforms, {
      tGlassC: T('glass', 'color'), tGlassN: T('glass', 'normal'), tGlassR: T('glass', 'rough'), tGlassM: T('glass', 'metal'), tGlassE: T('glass', 'emit'),
      tOffC: T('office', 'color'), tOffN: T('office', 'normal'), tOffE: T('office', 'emit'),
      tBrickC: T('bricks', 'color'), tBrickN: T('bricks', 'normal'),
      tConC: T('concrete', 'color'), tPlasC: T('plaster', 'color'),
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec3 vWPos; varying vec3 vWNrm; flat varying vec4 vInfo; varying vec3 vSize;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vInfo = aInfo;
mat4 sbIM = modelMatrix * instanceMatrix;
vWPos = (sbIM * vec4(transformed,1.0)).xyz;
vWNrm = normalize(mat3(sbIM) * objectNormal);
vSize = vec3(length(sbIM[0].xyz), length(sbIM[1].xyz), length(sbIM[2].xyz));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; flat varying vec4 vInfo; varying vec3 vSize;
uniform float uNight;
uniform sampler2D tGlassC, tGlassN, tGlassR, tGlassM, tGlassE, tOffC, tOffN, tOffE, tBrickC, tBrickN, tConC, tPlasC;
${GLSL_NOISE}
float sbRough; float sbMetal; vec3 sbEmit; vec3 sbNt; vec3 sbT;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float style = vInfo.x; float baseY = vInfo.y; float seed = vInfo.z;
  vec3 base = diffuseColor.rgb;
  vec3 n = normalize(vWNrm);
  sbRough = 0.85; sbMetal = 0.0; sbEmit = vec3(0.0); sbNt = vec3(0.0, 0.0, 1.0);
  sbT = abs(n.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  bool useTex = ${real}.0 > 0.5;
  if (n.y > 0.5) {
    // roofs: weathered concrete / tar
    vec3 con = useTex ? texture2D(tConC, vWPos.xz / ${S('concrete')}).rgb : vec3(0.5);
    diffuseColor.rgb = (style > 3.5 && style < 4.5) ? base * (0.7 + 0.4 * con.r) : con * vec3(0.42, 0.41, 0.4);
    sbRough = 0.92;
  } else if (n.y < -0.5) {
    diffuseColor.rgb = base * 0.3;
  } else {
    float u = abs(n.x) > 0.5 ? vWPos.z : vWPos.x;
    float v = vWPos.y - baseY;
    vec2 uvm = vec2(u, v);
    // ground-floor shopfronts in the city (styles 0-2 and shops)
    bool shop = (style < 2.5 || style > 4.5) && v < 4.4 && v > 0.25;
    if (useTex && style < 0.5 && !shop) {
      // photographed glass curtain wall
      vec2 uv = uvm / vec2(${S('glass')}, ${S('glass')} * 1.2);
      diffuseColor.rgb = texture2D(tGlassC, uv).rgb;
      sbRough = texture2D(tGlassR, uv).g;
      sbMetal = texture2D(tGlassM, uv).g;
      sbNt = texture2D(tGlassN, uv).xyz * 2.0 - 1.0;
      sbEmit = texture2D(tGlassE, uv).rgb * uNight * 1.4;
    } else if (useTex && style < 1.5 && !shop) {
      // photographed office facade (windows lit at night from its emission map)
      vec2 uv = uvm / ${S('office')} + vec2(seed * 0.37, 0.0);
      vec3 oc = texture2D(tOffC, uv).rgb;
      float detail = dot(texture2D(tConC, uvm / ${S('concrete')}).rgb, vec3(0.333));
      diffuseColor.rgb = oc * (0.85 + 0.3 * detail);
      sbRough = 0.55;
      sbNt = texture2D(tOffN, uv).xyz * 2.0 - 1.0;
      sbEmit = texture2D(tOffE, uv).rgb * uNight * 2.2;
    } else {
      // brick / concrete / plaster walls with real window openings
      vec3 wall = base;
      if (useTex) {
        if (style > 1.5 && style < 2.5) { wall = texture2D(tBrickC, uvm / ${S('bricks')}).rgb; sbNt = texture2D(tBrickN, uvm / ${S('bricks')}).xyz * 2.0 - 1.0; }
        else if (style > 2.5 && style < 3.5) wall = texture2D(tConC, uvm / ${S('concrete')}).rgb * base * 1.6;
        else wall = texture2D(tPlasC, uvm / ${S('plaster')}).rgb * base * 1.35;
      }
      vec2 cellSz = style < 2.5 ? vec2(3.2, 3.4) : style < 3.5 ? vec2(9.0, 6.0) : style < 4.5 ? vec2(3.6, 3.0) : vec2(4.0, 4.0);
      vec2 winSz  = style < 2.5 ? vec2(0.42, 0.5) : style < 3.5 ? vec2(0.3, 0.18) : style < 4.5 ? vec2(0.32, 0.42) : vec2(0.75, 0.55);
      vec2 g = vec2(u, v - (style < 3.5 ? 1.0 : 0.6)) / cellSz;
      vec2 cid = floor(g); vec2 f = fract(g);
      vec2 d = abs(f - 0.5) - winSz * 0.5;
      float isWin = step(max(d.x, d.y), 0.0) * step(0.0, g.y) * step(v, vSize.y - 0.8);
      float frame = isWin * (1.0 - step(max(d.x, d.y), -0.03));
      float shopId = floor(u / 6.0);
      if (shop) {
        float sf = fract(u / 6.0);
        isWin = step(0.06, sf) * step(sf, 0.94) * step(v, 3.7);
        // mullions every 1.5 m and a transom bar
        float mull = step(abs(fract(u / 1.5) - 0.5), 0.02) + step(abs(v - 2.9), 0.04);
        frame = isWin * clamp(mull, 0.0, 1.0);
      }
      float aliasFade = smoothstep(0.25, 0.6, max(fwidth(g.x), fwidth(g.y)));
      isWin = mix(isWin, winSz.x * winSz.y, aliasFade);
      float h = sbHash(cid + seed * 13.1);
      vec3 glass = mix(vec3(0.03, 0.04, 0.05), vec3(0.1, 0.12, 0.14), h);
      if (shop) glass = mix(vec3(0.05, 0.05, 0.05), vec3(0.16, 0.14, 0.12), sbHash(vec2(shopId, seed)));
      diffuseColor.rgb = mix(wall, glass, isWin);
      diffuseColor.rgb = mix(diffuseColor.rgb, shop ? vec3(0.12) : vec3(0.75), frame);
      sbRough = mix(0.9, 0.06, isWin);
      sbMetal = isWin * 0.4;
      if (isWin > 0.5) sbNt = vec3(0.0, 0.0, 1.0);
      float lit = step(0.72, sbHash(cid * 1.7 + seed));
      vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.8, sbHash(cid + 3.3)));
      if (shop) {
        float sh = sbHash(vec2(shopId * 3.1, seed));
        lit = step(0.35, sh);  // about a third of shops are closed at night
        warm = mix(vec3(1.0, 0.82, 0.58), vec3(0.85, 0.92, 1.0), step(0.75, sh));
        warm *= 0.55 + 0.45 * smoothstep(3.6, 0.6, v) * (0.8 + 0.2 * sbNoise(vec2(u * 0.8, v)));
      }
      float litWin = mix(isWin * lit * (0.6 + 0.4 * sbHash(cid + seed * 2.0)), winSz.x * winSz.y * 0.28, aliasFade);
      sbEmit = warm * litWin * (1.0 - frame) * uNight * (shop ? 0.22 : 0.4);
    }
  }
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(sbRough, sbRough * 0.6, uWet); diffuseColor.rgb *= 1.0 - uWet * 0.22;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = sbMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 N = normalize(vWNrm);
  if (abs(N.y) < 0.5) {
    vec3 nw = normalize(sbT * sbNt.x + vec3(0.0, 1.0, 0.0) * sbNt.y + N * max(sbNt.z, 0.2));
    normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
  }
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sbEmit;');
  };
  return mat;
}

export function createBuildings(hm, quality, scene, collision, surf, graph = null) {
  const rnd = mulberry32(2026);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const B = []; // {x,z,w,d,h,y,style,color}
  const roofs = []; // gable roofs {x,z,w,d,h,y,rot,color}
  const props = []; // small boxes {x,y,z,w,h,d,color}
  const fences = []; // chain-link runs {x,y,z,w,h,d}
  const add = (x, z, w, d, h, y, style, color) => {
    B.push({ x, z, w, d, h, y, style, color: color ?? pick(PALETTES[style]) });
    collision.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y - 2, y + h, { building: true, surf: ['masonry', 'masonry', 'brick', 'metal', 'frame', 'block'][style] || 'masonry' });
  };

  // ---- Port Calvera
  const [dtx, dtz] = CITY.downtown;
  const blockW = CITY.pitch - CITY.street;
  const cityBlocks = [];
  for (let i = 0; i < CITY.nx; i++) for (let j = 0; j < CITY.nz; j++) {
    const cx = CITY.x0 + i * CITY.pitch + CITY.pitch / 2, cz = CITY.z0 + j * CITY.pitch + CITY.pitch / 2;
    const d = Math.hypot(cx - dtx, cz - dtz);
    const r = rnd();
    let type = 'build';
    if (r < 0.07 && d > 150) type = 'park';
    else if (r < 0.12 && d > 120) type = 'parking';
    cityBlocks.push({ cx, cz, d, type, i, j });
    const y = CITY.height + 0.22;
    const inner = blockW - 5;
    if (type !== 'build') continue;
    const tall = d < 230;
    const mid = d < 430;
    const div = tall ? (rnd() < 0.5 ? 1 : 2) : mid ? 2 + ((rnd() * 2) | 0) : 3;
    const lot = inner / div;
    for (let a = 0; a < div; a++) for (let b = 0; b < div; b++) {
      if (!tall && rnd() < 0.08) continue;
      const lx = cx - inner / 2 + lot * (a + 0.5), lz = cz - inner / 2 + lot * (b + 0.5);
      const fw = lot - 2 - rnd() * (tall ? 4 : 6), fd = lot - 2 - rnd() * (tall ? 4 : 6);
      let h, style;
      if (tall) { h = 70 + rnd() * 120 * (1 - d / 300); style = rnd() < 0.6 ? 0 : 1; }
      else if (mid) { h = 16 + rnd() * 40 * (1 - d / 600); style = pick([1, 1, 2, 2, 0]); }
      else { h = 7 + rnd() * 16; style = pick([2, 2, 5, 1, 3]); }
      add(lx, lz, fw, fd, h, y, style);
      // setbacks on tall towers
      if (tall && h > 90) {
        const h2 = h * (0.25 + rnd() * 0.25);
        add(lx, lz, fw * 0.7, fd * 0.7, h2, y + h, style);
        if (rnd() < 0.6) props.push({ x: lx, y: y + h + h2, z: lz, w: 1.2, h: 14 + rnd() * 18, d: 1.2, color: 0x888888 });
      }
      // rooftop clutter
      const top = y + h;
      const nprops = 1 + ((rnd() * 3) | 0);
      for (let k = 0; k < nprops; k++) props.push({ x: lx + (rnd() - 0.5) * fw * 0.6, y: top, z: lz + (rnd() - 0.5) * fd * 0.6, w: 2 + rnd() * 3, h: 1.2 + rnd() * 2, d: 2 + rnd() * 3, color: 0x77787a });
      if (!tall && !mid && rnd() < 0.3) props.push({ x: lx, y: top, z: lz, w: 2.6, h: 4, d: 2.6, color: 0x6b4a33 }); // water tower
    }
  }

  // Port: warehouses + container stacks between the city and the shore
  for (let x = CITY.x0 + 20; x < CITY.x0 + CITY.nx * CITY.pitch - 20; x += 46 + rnd() * 20) {
    const zc = CITY.z0 + CITY.nz * CITY.pitch + 40;
    const shore = coastZ(x);
    if (shore - zc < 40) continue;
    const y = hm.height(x, zc);
    if (y < 1.5) continue;
    if (rnd() < 0.55) add(x, zc, 32 + rnd() * 10, 22, 9 + rnd() * 5, y, 3);
    else {
      const colors = [0xa13c2a, 0x2c5f8a, 0x2f7a4a, 0xc58c2a, 0x6a6f74, 0x8a2f5f];
      for (let a = 0; a < 3; a++) for (let s = 0; s < 1 + ((rnd() * 3) | 0); s++)
        props.push({ x: x - 8 + a * 8, y: y + s * 2.6, z: zc, w: 2.5, h: 2.6, d: 12, color: pick(colors) });
      collision.addBox(x - 12, zc - 6, x + 12, zc + 6, y - 1, y + 8, null);
    }
  }

  // ---- Mill Creek
  const ty = TOWN.height + 0.22;
  const tInner = TOWN.pitch - TOWN.street - 4;
  for (let i = 0; i < TOWN.nx; i++) for (let j = 0; j < TOWN.nz; j++) {
    const cx = TOWN.x0 + i * TOWN.pitch + TOWN.pitch / 2, cz = TOWN.z0 + j * TOWN.pitch + TOWN.pitch / 2;
    if (j === 1) {
      // Main Street: shops shoulder to shoulder on both sides
      for (let k = 0; k < 4; k++) {
        const lx = cx - tInner / 2 + tInner / 4 * (k + 0.5);
        for (const side of [-1, 1]) add(lx, cz + side * (tInner / 2 - 6), tInner / 4 - 1, 11, 6 + rnd() * 5, ty, pick([5, 2, 5]));
      }
      continue;
    }
    if (i === 3 && j === 0) { // church
      add(cx, cz, 14, 24, 9, ty, 4, 0xf2efe6);
      roofs.push({ x: cx, z: cz, w: 14, d: 24, h: 6, y: ty + 9, rot: Math.PI / 2, color: 0x4a3b33 });
      add(cx, cz - 14, 5, 5, 22, ty, 4, 0xf2efe6);
      props.push({ x: cx, y: ty + 22, z: cz - 14, w: 1.8, h: 6, d: 1.8, color: 0xf2efe6 });
      continue;
    }
    // houses on a 3x2 lot grid
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
      if (rnd() < 0.12) continue;
      const lx = cx - tInner / 2 + tInner / 3 * (a + 0.5), lz = cz - tInner / 2 + tInner / 2 * (b + 0.5);
      const w = 8 + rnd() * 3, d = 9 + rnd() * 3, h = rnd() < 0.3 ? 6 : 3.4;
      const color = pick(PALETTES[4]);
      add(lx, lz, w, d, h, ty, 4, color);
      roofs.push({ x: lx, z: lz, w: w + 0.8, d: d + 0.8, h: 2.4 + rnd(), y: ty + h, rot: rnd() < 0.5 ? 0 : Math.PI / 2, color: pick([0x3b3b3e, 0x5a3a2c, 0x4d5560, 0x6b4636]) });
    }
  }
  // Gas station on Route 9 just outside town
  {
    const gx = -960, gz = -60, gy = hm.height(gx, gz) + 0.1;
    add(gx, gz + 10, 16, 9, 4, gy, 5, 0xe8e2d0);
    props.push({ x: gx, y: gy + 5, z: gz - 4, w: 14, h: 0.6, d: 9, color: 0xc8352a });
    for (const px of [-5, 5]) props.push({ x: gx + px, y: gy, z: gz - 4, w: 0.4, h: 5, d: 0.4, color: 0xdddddd });
  }

  // ---- Lake houses around Lake Arden (future buyable homes)
  const lakeHouses = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    if (a > 1.1 && a < 2.0) continue; // leave the river outlet clear
    const r = lakeRadius(a) * 1.28;
    const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
    const y = hm.height(x, z);
    if (y < LAKE.level + 0.3) continue;
    const w = 10 + rnd() * 4, d = 9 + rnd() * 3, h = rnd() < 0.5 ? 6.5 : 3.6;
    add(x, z, w, d, h, y, 4, pick([0x6b4f3a, 0x8a6a4c, 0xd9cfae, 0x55606a]));
    roofs.push({ x, z, w: w + 1, d: d + 1, h: 3, y: y + h, rot: Math.abs(Math.cos(a)) > 0.7 ? Math.PI / 2 : 0, color: 0x3b3b3e });
    // dock out into the water
    const dx = -Math.cos(a), dz = -Math.sin(a);
    const len = 22;
    props.push({ x: x + dx * (r - lakeRadius(a)) * 0.4 + dx * len * 0.5, y: LAKE.level + 0.35, z: z + dz * (r - lakeRadius(a)) * 0.4 + dz * len * 0.5, w: Math.abs(dz) > 0.5 ? 2.2 : len, h: 0.25, d: Math.abs(dz) > 0.5 ? len : 2.2, color: 0x7a5a3c });
    lakeHouses.push({ x, z });
  }

  // ---- Farms on Redgrass Plains, cabins in Pinewood Hollow
  for (let k = 0; k < 9; k++) {
    const x = PLAINS.x + (rnd() - 0.5) * PLAINS.r * 1.3, z = PLAINS.z + (rnd() - 0.5) * PLAINS.r * 1.3;
    const y = hm.height(x, z);
    if (hm.splatAt(x, z, 3) > 0.2 || y < hm.waterLevel(x, z) + 1) continue;
    add(x, z, 9, 11, 5.5, y - 0.5, 4, 0xece6d6);
    roofs.push({ x, z, w: 10, d: 12, h: 3, y: y + 5, rot: 0, color: 0x4a4a4a });
    add(x + 22, z + 6, 14, 20, 7, y - 0.5, 3, 0xa53a2c);
    roofs.push({ x: x + 22, z: z + 6, w: 15, d: 21, h: 5, y: y + 6.5, rot: Math.PI / 2, color: 0x5b5b5b });
    props.push({ x: x + 34, y: y - 0.5, z: z - 6, w: 4.5, h: 14, d: 4.5, color: 0xb9b9b4 });
  }
  for (let k = 0; k < 8; k++) {
    const x = FOREST.x + (rnd() - 0.5) * FOREST.r, z = FOREST.z + (rnd() - 0.5) * FOREST.r;
    const y = hm.height(x, z);
    if (y < hm.waterLevel(x, z) + 1) continue;
    add(x, z, 7, 8, 3.2, y - 0.4, 4, 0x6b4f3a);
    roofs.push({ x, z, w: 8, d: 9, h: 2.4, y: y + 2.8, rot: 0, color: 0x2f3a2a });
  }

  // ---- Build the instanced meshes
  // ---- the city thins out: poorer, emptier and grassier the further you go
  const junk = []; // spots for street junk (filled with open models later)
  const roadDist = (x, z, r) => {
    let best = 1e9;
    collision.query(x, z, r, (it) => { if (it.t === 3) { const d = distToSeg(x, z, it.ax, it.az, it.bx, it.bz).d - it.hw; if (d < best) best = d; } });
    return best;
  };
  const freeLot = (x, z, w, d) => {
    let ok = true;
    collision.query(x, z, Math.max(w, d) + 4, (it) => {
      if (!ok) return;
      if (it.t === 0 && x + w / 2 + 2.5 > it.minX && x - w / 2 - 2.5 < it.maxX && z + d / 2 + 2.5 > it.minZ && z - d / 2 - 2.5 < it.maxZ) ok = false;
      else if (it.t === 3 && distToSeg(x, z, it.ax, it.az, it.bx, it.bz).d < it.hw + Math.max(w, d) / 2 + 2.5) ok = false;
    });
    return ok;
  };
  const flatAt = (x, z, w, d) => { const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => hm.height(x + a * w / 2, z + b * d / 2)); return { y: Math.min(...ys), dy: Math.max(...ys) - Math.min(...ys) }; };
  const POOR = { 2: [0x6e4a3c, 0x5e463a, 0x7a5444], 3: [0x7d7f78, 0x6a6e66, 0x8a7c66, 0x5f6a5a], 4: [0xb8ab92, 0xa49a86, 0x9aa6a0, 0xc2b49a, 0x8f8a7e, 0xa8968a], 5: [0xa89272, 0x9a8a78, 0x8e9a90] };
  const placeLot = (x, z, e) => {
    // e: 0 at the city edge .. 1 far out
    const kind = e < 0.3 ? pick(['shop', 'brick', 'ware', 'house']) : e < 0.65 ? pick(['house', 'house', 'garage', 'ware']) : pick(['house', 'shed', 'trailer']);
    const dims = { shop: [12, 10, 4.5 + rnd() * 4, 5], brick: [14, 12, 7 + rnd() * 6, 2], ware: [20, 14, 6 + rnd() * 3, 3], house: [9, 9, rnd() < 0.3 ? 6.2 : 3.6, 4], garage: [7, 7, 3.4, 3], shed: [5, 4, 3, 3], trailer: [12, 4, 3, 4] }[kind];
    let [w, d, h, style] = dims;
    if (rnd() < 0.5) [w, d] = [d, w];
    const f = flatAt(x, z, w, d);
    if (f.dy > 1.6 || f.y < hm.waterLevel(x, z) + 0.6 || !freeLot(x, z, w, d)) return false;
    add(x, z, w, d, h, f.y + 0.05, style, pick(POOR[style] || PALETTES[style]));
    // the lot around it: junk, an old car spot, sometimes a chain-link fence
    for (let k = 0; k < 2 + ((rnd() * 4) | 0); k++) junk.push({ x: x + (rnd() - 0.5) * (w + 8), z: z + (rnd() - 0.5) * (d + 8), kind: rnd() < 0.5 ? 'trash' : rnd() < 0.5 ? 'pile' : 'tyre' });
    if (rnd() < 0.35) {
      const fw = w + 10, fd = d + 10;
      for (const [fx, fz, sw, sd] of [[x, z - fd / 2, fw, 0.06], [x, z + fd / 2, fw * 0.4, 0.06], [x - fw / 2, z, 0.06, fd], [x + fw / 2, z, 0.06, fd]]) {
        fences.push({ x: fx, y: hm.height(fx, fz), z: fz, w: sw, h: 1.8, d: sd });
      }
    }
    return true;
  };
  {
    const x0 = CITY.x0 - CITY.street, x1 = CITY.x0 + CITY.nx * CITY.pitch + CITY.street, z0 = CITY.z0 - CITY.street, z1 = CITY.z0 + CITY.nz * CITY.pitch;
    let placed = 0;
    const want = quality.label === 'Phone' ? 70 : 120;
    for (let k = 0; k < 2600 && placed < want; k++) {
      const e = Math.pow(rnd(), 1.5); // more lots close to the city
      const out = 18 + e * 380, side = (rnd() * 3) | 0, t = rnd();
      let x, z;
      if (side === 0) { x = x0 - out; z = z0 + t * (z1 - z0 + 120) - 60; } else if (side === 1) { x = x1 + out; z = z0 + t * (z1 - z0 + 120) - 60; } else { z = z0 - out; x = x0 - 60 + t * (x1 - x0 + 120); }
      if (z > coastZ(x) - 40) continue;
      const rd = roadDist(x, z, 50);
      if (rd > 38 || rd < 6) continue; // lots face a road
      if (rnd() > 1 - e * 0.75) continue; // thinner the further out
      if (placeLot(x, z, e)) placed++;
    }
  }
  // ---- two small settlements out in the country, each at a road junction
  if (graph) {
    const nodes = [...graph.nodes.values()].filter((n) => n.edges && n.edges.length >= 3 && n.id[0] !== 'c' && n.id[0] !== 't');
    const far = (n) => Math.min(Math.hypot(n.x - (CITY.x0 + 400), n.z - (CITY.z0 + 300)), Math.hypot(n.x - (TOWN.x0 + 140), n.z - (TOWN.z0 + 100)));
    const cand = nodes.filter((n) => far(n) > 700).sort((a, b) => far(b) - far(a));
    const names = [['Sabine Crossing', 'Crossroads village'], ['Cypress Bend', 'Roadside hamlet']];
    const used = [];
    for (const n of cand) {
      if (used.length >= names.length) break;
      if (used.some((u) => Math.hypot(u.x - n.x, u.z - n.z) < 900)) continue;
      let built = 0;
      for (let k = 0; k < 220 && built < 16; k++) {
        const a = rnd() * Math.PI * 2, r = 22 + rnd() * 110;
        const x = n.x + Math.cos(a) * r, z = n.z + Math.sin(a) * r;
        const rd = roadDist(x, z, 40);
        if (rd > 30 || rd < 6) continue;
        if (placeLot(x, z, 0.25 + (r / 130) * 0.5)) built++;
      }
      if (built >= 6) {
        const [name, sub] = names[used.length];
        used.push({ x: n.x, z: n.z, name });
        REGIONS.splice(2, 0, { name, sub, test: (px, pz) => Math.hypot(px - n.x, pz - n.z) < 170 });
      }
    }
    for (const u of used) junk.push({ x: u.x + 8, z: u.z + 8, kind: 'sign', name: u.name });
  }

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const facade = makeFacadeMaterial(surf);
  const bbox = box.clone();
  const mesh = new THREE.InstancedMesh(bbox, facade, B.length);
  const info = new Float32Array(B.length * 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  B.forEach((b, i) => {
    m4.compose(p.set(b.x, b.y, b.z), q.identity(), s.set(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(b.color));
    info.set([b.style, b.y, rnd() * 100, 0], i * 4);
  });
  bbox.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  mesh.castShadow = quality.shadows > 0;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);

  // Gable roofs: triangular prism, ridge along X
  const roofGeo = new THREE.BufferGeometry();
  {
    const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, 0.5];
    const prism = [
      0, 3, 1, 1, 3, 2, // north slope
      4, 5, 3, 5, 2, 3, // south slope
      0, 4, 3, 1, 2, 5, // gable ends
      0, 1, 4, 1, 5, 4, // bottom
    ];
    const pos = [];
    for (const k of prism) pos.push(v[k * 3], v[k * 3 + 1], v[k * 3 + 2]);
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roofGeo.computeVertexNormals();
  }
  const roofMesh = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), roofs.length);
  roofs.forEach((r, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot);
    const swap = Math.abs(Math.sin(r.rot)) > 0.5;
    m4.compose(p.set(r.x, r.y, r.z), q, s.set(swap ? r.d : r.w, r.h, swap ? r.w : r.d));
    roofMesh.setMatrixAt(i, m4);
    roofMesh.setColorAt(i, col.setHex(r.color));
  });
  roofMesh.castShadow = quality.shadows > 0;
  roofMesh.receiveShadow = true;
  scene.add(roofMesh);

  const propMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), props.length);
  props.forEach((b, i) => {
    m4.compose(p.set(b.x, b.y, b.z), q.identity(), s.set(b.w, b.h, b.d));
    propMesh.setMatrixAt(i, m4);
    propMesh.setColorAt(i, col.setHex(b.color));
  });
  propMesh.castShadow = quality.shadows > 0;
  propMesh.receiveShadow = true;
  scene.add(propMesh);

  // chain-link fences: galvanised diamond mesh you can see through, a top rail and posts every 3 m
  if (fences.length) {
    const fm = new THREE.MeshStandardMaterial({ color: 0xb4babd, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
    fm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; uniform float uBase;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          float hgt = vFW.y; float u = (vFW.x + vFW.z) * 16.0, v = hgt * 16.0;
          float d1 = abs(fract((u + v) * 0.5) - 0.5), d2 = abs(fract((u - v) * 0.5) - 0.5);
          float wire = min(d1, d2);
          float fw = fwidth(u);
          // up close the diamonds are drawn; once they're smaller than a pixel the mesh turns
          // into a sparse screen door, the way chain-link reads as a faint haze from across a lot
          if (fw > 0.3) { if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > 0.22) discard; }
          else if (wire > 0.06 + fw * 0.6) discard;
        }`);
    };
    const fg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const fmesh = new THREE.InstancedMesh(fg, fm, fences.length);
    const rail = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshStandardMaterial({ color: 0x8e9498, roughness: 0.4, metalness: 0.8 }), fences.length);
    const postsL = [];
    fences.forEach((f, i) => {
      const along = f.w > f.d, L = along ? f.w : f.d;
      m4.compose(p.set(f.x, f.y, f.z), q.identity(), s.set(along ? f.w : 0.02, f.h, along ? 0.02 : f.d)); fmesh.setMatrixAt(i, m4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), along ? 0 : -Math.PI / 2);
      m4.compose(p.set(along ? f.x - f.w / 2 : f.x, f.y + f.h, along ? f.z : f.z - f.d / 2), q, s.set(L, 1, 1)); rail.setMatrixAt(i, m4);
      for (let t = -L / 2; t <= L / 2 + 0.01; t += Math.max(1.5, L / Math.ceil(L / 3))) postsL.push([along ? f.x + t : f.x, f.y, along ? f.z : f.z + t, f.h]);
    });
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8).translate(0, 0.5, 0), rail.material, postsL.length);
    postsL.forEach(([x, y, z, h], i) => { m4.compose(p.set(x, y, z), q.identity(), s.set(1, h + 0.05, 1)); posts.setMatrixAt(i, m4); });
    for (const im of [fmesh, rail, posts]) { im.castShadow = quality.shadows > 0; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); }
    fmesh.castShadow = false; // the wire is mostly holes; a solid shadow would give it away
  }

  // gutters and downspouts on houses and low buildings (one merged mesh; each
  // building's vertex range is kept so one house's gutters can be taken down and put back)
  let gutterMesh = null;
  const gutterRanges = new Map();
  {
    const parts = [];
    const pipe = (x, y0, y1, z) => parts.push(new THREE.CylinderGeometry(0.05, 0.05, y1 - y0, 6).translate(x, (y0 + y1) / 2, z));
    let vtx = 0;
    for (let bi = 0; bi < B.length; bi++) {
      const b = B[bi];
      if (b.h > 13) continue;
      const p0 = parts.length;
      const top = b.y + b.h - 0.05, x0 = b.x - b.w / 2 - 0.06, x1 = b.x + b.w / 2 + 0.06, z0 = b.z - b.d / 2 - 0.06, z1 = b.z + b.d / 2 + 0.06;
      // gutters along the two long sides, a downspout at each end of them
      const alongX = b.w >= b.d;
      for (const s of [0, 1]) {
        if (alongX) { const z = s ? z1 : z0; parts.push(new THREE.BoxGeometry(b.w + 0.1, 0.1, 0.12).translate(b.x, top, z)); pipe(x0, b.y, top, z); pipe(x1, b.y, top, z); }
        else { const x = s ? x1 : x0; parts.push(new THREE.BoxGeometry(0.12, 0.1, b.d + 0.1).translate(x, top, b.z)); pipe(x, b.y, top, z0); pipe(x, b.y, top, z1); }
      }
      let n = 0; for (let k = p0; k < parts.length; k++) n += parts[k].attributes.position.count;
      gutterRanges.set(bi, [vtx, n]); vtx += n;
      if (parts.length > 9000) break;
    }
    if (parts.length) {
      const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5, metalness: 0.4 }));
      m.castShadow = true; m.receiveShadow = true; m.userData.noHit = true;
      scene.add(m);
      gutterMesh = m;
    }
  }
  // roofs that sit on a building (for taking one house down and rebuilding it)
  const roofOf = new Map();
  roofs.forEach((r, ri) => {
    const bi = B.findIndex((b) => Math.abs(b.x - r.x) < b.w / 2 && Math.abs(b.z - r.z) < b.d / 2 && Math.abs(b.y + b.h - r.y) < 1.5);
    if (bi >= 0) roofOf.set(bi, ri);
  });
  return { buildings: B, cityBlocks, lakeHouses, junk, count: B.length, mesh, roofMesh, roofs, roofOf, gutterMesh, gutterRanges };
}
