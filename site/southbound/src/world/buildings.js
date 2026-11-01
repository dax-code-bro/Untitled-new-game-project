// Procedural buildings: downtown towers, offices, brick blocks, warehouses,
// town houses, lake houses, farms and cabins. One facade shader draws the
// windows (lit at night) so thousands of buildings cost only a few draw calls.
import * as THREE from 'three';
import { CITY, TOWN, LAKE, PLAINS, FOREST, lakeRadius, coastZ } from './layout.js';
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

function makeFacadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec3 vWPos; varying vec3 vWNrm; varying vec4 vInfo; varying vec3 vSize;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vInfo = aInfo;
mat4 sbIM = modelMatrix * instanceMatrix;
vWPos = (sbIM * vec4(transformed,1.0)).xyz;
vWNrm = normalize(mat3(sbIM) * objectNormal);
vSize = vec3(length(sbIM[0].xyz), length(sbIM[1].xyz), length(sbIM[2].xyz));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; varying vec4 vInfo; varying vec3 vSize;
uniform float uNight;
${GLSL_NOISE}
float sbRough; float sbMetal; vec3 sbEmit;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float style = vInfo.x; float baseY = vInfo.y; float seed = vInfo.z;
  vec3 base = diffuseColor.rgb;
  vec3 n = normalize(vWNrm);
  sbRough = 0.85; sbMetal = 0.0; sbEmit = vec3(0.0);
  float grime = sbFbm(vWPos.xz*0.05 + vWPos.y*0.03);
  if (n.y > 0.5) {
    // roof
    diffuseColor.rgb = (style > 3.5 && style < 4.5) ? base : mix(vec3(0.20,0.20,0.21), vec3(0.32,0.31,0.30), grime);
  } else if (n.y < -0.5) {
    diffuseColor.rgb = base*0.4;
  } else {
    float u = abs(n.x) > 0.5 ? vWPos.z : vWPos.x;
    float v = vWPos.y - baseY;
    // window grid per style
    vec2 cellSz = style < 0.5 ? vec2(1.6, 3.6) : style < 1.5 ? vec2(3.0, 3.6) : style < 2.5 ? vec2(3.2, 3.3) : style < 3.5 ? vec2(9.0, 6.0) : style < 4.5 ? vec2(3.6, 3.0) : vec2(4.0, 4.0);
    vec2 winSz  = style < 0.5 ? vec2(0.92, 0.88) : style < 1.5 ? vec2(0.62, 0.55) : style < 2.5 ? vec2(0.42, 0.5) : style < 3.5 ? vec2(0.3, 0.18) : style < 4.5 ? vec2(0.32, 0.42) : vec2(0.75, 0.55);
    vec2 g = vec2(u, v - (style < 3.5 ? 1.0 : 0.6)) / cellSz;
    vec2 cid = floor(g); vec2 f = fract(g);
    vec2 w = step(abs(f - 0.5), winSz*0.5);
    float isWin = w.x*w.y * step(0.0, g.y);
    // ground-floor shopfronts in the city
    bool shop = (style < 2.5 || style > 4.5) && v < 4.2 && v > 0.3;
    if (shop) { float sf = fract(u/6.0); isWin = step(0.08, sf)*step(sf, 0.92)*step(v, 3.6); }
    // keep windows off the very top of each wall
    isWin *= step(v, vSize.y - 0.8);
    float aliasFade = smoothstep(0.25, 0.6, max(fwidth(g.x), fwidth(g.y)));
    isWin = mix(isWin, winSz.x*winSz.y, aliasFade);
    float facade = 0.85 + 0.15*sbNoise(vec2(u, v)*0.7) - grime*0.12;
    // brick courses
    if (style > 1.5 && style < 2.5) facade *= 0.92 + 0.08*step(0.5, fract(v*6.0 + step(0.5, fract(u*2.0))*0.5));
    // siding boards
    if (style > 3.5 && style < 4.5) facade *= 0.9 + 0.1*smoothstep(0.0, 0.1, fract(v*4.0));
    // horizontal floor bands on towers/offices
    if (style < 1.5) facade *= 0.85 + 0.15*step(0.12, fract(v/3.6));
    vec3 wall = base * facade;
    float h = sbHash(cid + seed*13.1);
    vec3 glass = mix(vec3(0.05,0.07,0.09), vec3(0.14,0.18,0.22), h);
    if (style < 0.5) glass = mix(vec3(0.10,0.16,0.22), vec3(0.22,0.30,0.36), h);
    diffuseColor.rgb = mix(wall, glass, isWin);
    sbRough = mix(0.88, 0.08, isWin);
    sbMetal = isWin * (style < 0.5 ? 0.85 : 0.5);
    float lit = step(0.74, sbHash(cid*1.7 + seed));
    vec3 warm = mix(vec3(1.0,0.72,0.42), vec3(0.85,0.9,1.0), step(0.8, sbHash(cid+3.3)));
    if (shop) { lit = 1.0; warm = vec3(1.0, 0.85, 0.6); }
    float litWin = mix(isWin * lit * (0.6 + 0.4*sbHash(cid+seed*2.0)), winSz.x*winSz.y*0.3, aliasFade);
    sbEmit = warm * litWin * uNight * (shop ? 0.9 : (style < 0.5 ? 0.3 : 0.45));
  }
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sbRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = sbMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sbEmit;');
  };
  return mat;
}

export function createBuildings(hm, quality, scene, collision) {
  const rnd = mulberry32(2026);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const B = []; // {x,z,w,d,h,y,style,color}
  const roofs = []; // gable roofs {x,z,w,d,h,y,rot,color}
  const props = []; // small boxes {x,y,z,w,h,d,color}
  const add = (x, z, w, d, h, y, style, color) => {
    B.push({ x, z, w, d, h, y, style, color: color ?? pick(PALETTES[style]) });
    collision.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y - 2, y + h, { building: true });
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
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const facade = makeFacadeMaterial();
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

  return { buildings: B, cityBlocks, lakeHouses, count: B.length };
}
