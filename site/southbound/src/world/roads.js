// Road surfaces, intersections, sidewalks, bridges and street lights.
import * as THREE from 'three';
import { CITY, TOWN } from './layout.js';
import { mulberry32 } from '../util.js';
import { worldUniforms } from './terrain.js';
import { reflUniforms } from './water.js';

function canvasTex(w, h, draw, anisotropy) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function asphalt(ctx, w, h, rnd) {
  ctx.fillStyle = '#2b2b2d';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.08; i++) {
    const v = 30 + rnd() * 40;
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // tyre wear bands
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (const f of [0.18, 0.32, 0.68, 0.82]) ctx.fillRect(w * f - w * 0.04, 0, w * 0.08, h);
  // cracks / patches
  ctx.strokeStyle = 'rgba(15,15,15,0.5)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rnd() * w, y = rnd() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

export const TOWN_WALK = 3; // Mill Creek's sidewalk width (lawns behind it)

export function createRoads(graph, hm, quality, scene, collision, surf) {
  const rnd = mulberry32(77);
  const group = new THREE.Group();
  group.name = 'roads';
  const an = quality.anisotropy;

  // Markings are painted on a transparent canvas and laid over photo-scanned asphalt.
  const real = surf && surf.asphalt.real;
  const base = (ctx, w, h) => { if (!real) asphalt(ctx, w, h, rnd); };
  const wear = (ctx, w, h) => { // scuffed paint
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.5})`; ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
    ctx.globalCompositeOperation = 'source-over';
  };
  const hwTex = canvasTex(256, 512, (ctx, w, h) => {
    base(ctx, w, h);
    ctx.fillStyle = '#e4e2da';
    ctx.fillRect(w * 0.035, 0, w * 0.02, h);
    ctx.fillRect(w * 0.945, 0, w * 0.02, h);
    ctx.fillStyle = '#e0a51c';
    ctx.fillRect(w * 0.488, 0, w * 0.012, h);
    ctx.fillRect(w * 0.506, 0, w * 0.012, h);
    wear(ctx, w, h);
  }, an);
  const stTex = canvasTex(256, 512, (ctx, w, h) => {
    base(ctx, w, h);
    ctx.fillStyle = '#e0a51c';
    ctx.fillRect(w * 0.494, 0, w * 0.012, h * 0.5);
    ctx.fillStyle = '#dcdcd4';
    ctx.fillRect(w * 0.06, 0, w * 0.012, h);
    ctx.fillRect(w * 0.928, 0, w * 0.012, h);
    wear(ctx, w, h);
  }, an);
  // city streets (16 m): a lane each way inside double yellow, and a parking lane along each curb
  // behind a white line, with a tick between stalls
  const ctTex = canvasTex(512, 512, (ctx, w, h) => {
    base(ctx, w, h);
    const m = w / 16; // pixels per metre across
    ctx.fillStyle = '#e0a51c';
    ctx.fillRect(w / 2 - 0.22 * m, 0, 0.12 * m, h);
    ctx.fillRect(w / 2 + 0.1 * m, 0, 0.12 * m, h);
    ctx.fillStyle = '#dcdcd4';
    for (const sd of [-1, 1]) {
      const x = w / 2 + sd * 5.2 * m;
      ctx.fillRect(x - 0.06 * m, 0, 0.12 * m, h);
      for (const v of [0, 0.5]) ctx.fillRect(sd > 0 ? x : x - 0.7 * m, v * h, 0.7 * m, 0.1 * (h / 16));
    }
    wear(ctx, w, h);
  }, an);
  const ixTex = canvasTex(256, 256, (ctx, w, h) => {
    base(ctx, w, h);
    // zebra crosswalks on all four sides of the intersection
    ctx.fillStyle = '#e6e4dc';
    const band = h * 0.16, stripe = w * 0.045;
    for (let k = 0; k < 8; k++) {
      const x = w * 0.12 + k * stripe * 1.75;
      ctx.fillRect(x, 0, stripe, band); ctx.fillRect(x, h - band, stripe, band);
      ctx.fillRect(0, x, band, stripe); ctx.fillRect(w - band, x, band, stripe);
    }
    wear(ctx, w, h);
  }, an);
  const roadMat = (marks, lanes = 2) => {
    const m = new THREE.MeshStandardMaterial({ map: marks, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (!real) return m;
    const A = surf.asphalt, sz = A.size.toFixed(2);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tAsph = { value: A.color }; sh.uniforms.tAsphN = { value: A.normal };
      sh.uniforms.tAsphR = { value: A.rough }; sh.uniforms.tAsphAO = { value: A.ao };
      sh.uniforms.tRoadC = { value: surf.road ? surf.road.color : A.color }; sh.uniforms.uLanes = { value: lanes };
      sh.uniforms.uWet = worldUniforms.uWet; sh.uniforms.uRain = worldUniforms.uRain; sh.uniforms.uTime = worldUniforms.uTime;
      Object.assign(sh.uniforms, reflUniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
        // world position (intersection tiles and parking lots are instanced: include the instance transform,
        // or every tile samples the same metre of asphalt blown up to 16 m)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRW; uniform sampler2D tAsph; uniform sampler2D tAsphN; uniform sampler2D tAsphR; uniform sampler2D tAsphAO; float sbPaint;
uniform sampler2D tRoadC; uniform float uLanes; float sbWear;
uniform float uWet; uniform float uRain; uniform float uTime; float sbPud; vec3 sbRN = vec3(0.0, 1.0, 0.0);
// raindrop ripples: expanding rings in a jittered grid, each with its own phase
vec2 sbRipple(vec2 p){
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++){
    vec2 q = p * (k == 0 ? 2.2 : 3.1) + float(k) * 7.3;
    vec2 i = floor(q), f = fract(q);
    float h = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 c = vec2(fract(h * 7.1), fract(h * 13.7)) * 0.6 + 0.2;
    float t = fract(uTime * 1.3 + h);
    vec2 d = f - c; float r = length(d);
    float ring = sin((r - t * 0.45) * 60.0) * smoothstep(0.0, 0.05, t * 0.45 - r + 0.05) * (1.0 - t) * smoothstep(0.45, 0.0, r);
    g += d / max(r, 1e-3) * ring;
  }
  return g;
}
uniform sampler2D tReflect; uniform float uReflectOn; uniform mat4 uReflMatrix; uniform float uReflY;
float sbVN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }`)
        .replace('#include <map_fragment>', `
          vec2 auv = vRW.xz / ${sz};
          vec3 asph = texture2D(tAsph, auv).rgb * texture2D(tAsphAO, auv).r;
          sbWear = 0.0;
          if (uLanes > 0.5) {
            // repair patches: rectangles of newer, darker asphalt cut into the old, cracked surface
            vec2 pc = vec2(vMapUv.x * uLanes * 2.0, vMapUv.y * 1.3);
            vec2 pid = floor(pc); float ph = fract(sin(dot(pid, vec2(91.3, 17.7))) * 4375.85);
            vec2 pf = fract(pc);
            float patchM = step(0.84, ph) * step(0.07, pf.x) * step(pf.x, 0.93) * step(0.05, pf.y) * step(pf.y, 0.95);
            vec3 fresh = texture2D(tRoadC, vRW.xz / 3.2).rgb;
            asph = mix(asph, fresh * 0.85, patchM);
            // the seam around a patch: a black line of crack sealer
            float seam = patchM > 0.5 ? 0.0 : step(0.84, ph) * (1.0 - step(0.012, min(min(abs(pf.x - 0.07), abs(pf.x - 0.93)), min(abs(pf.y - 0.05), abs(pf.y - 0.95)) * 3.0)));
            asph *= 1.0 - seam * 0.6;
            // tyre paths worn smooth and pale; oil dripped down the middle of every lane
            float lane = fract(vMapUv.x * uLanes);
            float tyre = smoothstep(0.11, 0.0, abs(lane - 0.27)) + smoothstep(0.11, 0.0, abs(lane - 0.73));
            float oil = smoothstep(0.1, 0.0, abs(lane - 0.5)) * smoothstep(0.42, 0.78, sbVN(vRW.xz * 1.1) * 0.7 + sbVN(vRW.xz * 4.0) * 0.3);
            asph *= (1.0 + tyre * 0.1) * (1.0 - oil * 0.5);
            sbWear = tyre * 0.12 + oil * 0.3;
          }
          vec4 mk = texture2D(map, vMapUv);
          sbPaint = mk.a;
          diffuseColor.rgb *= mix(asph, mk.rgb * (0.75 + 0.25 * asph.g * 2.0), mk.a);
          // rain: darker asphalt, standing water in the low spots
          sbPud = uWet * smoothstep(0.58, 0.68, sbVN(vRW.xz * 0.22) * 0.7 + sbVN(vRW.xz * 0.9) * 0.3 + (1.0 - asph.g) * 0.25);
          diffuseColor.rgb *= 1.0 - uWet * 0.45 - sbPud * 0.25;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(texture2D(tAsphR, auv).g - sbWear, 0.6, sbPaint), 0.16, uWet * 0.85); roughnessFactor = mix(roughnessFactor, 0.02, sbPud);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 nt = texture2D(tAsphN, auv).xyz * 2.0 - 1.0;
            nt.xy *= (1.0 - sbPaint * 0.6) * (1.0 - sbPud);
            // drops ring the standing water; on plain wet asphalt they barely show
            if (uRain > 0.02) nt.xy += sbRipple(vRW.xz) * uRain * (0.025 + sbPud * 0.45);
            vec3 nw = normalize(vec3(nt.x, max(nt.z, 0.2), nt.y));
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
            sbRN = nw;
          }`)
        .replace('#include <opaque_fragment>', `
          if (uReflectOn > 0.5 && uWet > 0.02 && abs(vRW.y - uReflY) < 0.8) {
            vec4 rp = uReflMatrix * vec4(vRW, 1.0);
            // a slight ripple from the asphalt grain; much more and the reflection breaks up into blobs
            vec2 ruv = rp.xy / rp.w + sbRN.xz * (0.012 - sbPud * 0.008);
            // wet asphalt smears reflections into vertical streaks; puddles stay sharp
            float sm = 0.012 * (1.0 - sbPud);
            vec3 refl = texture2D(tReflect, clamp(ruv, 0.001, 0.999)).rgb * 0.36
              + (texture2D(tReflect, clamp(ruv + vec2(0.0, sm), 0.001, 0.999)).rgb + texture2D(tReflect, clamp(ruv - vec2(0.0, sm), 0.001, 0.999)).rgb) * 0.22
              + (texture2D(tReflect, clamp(ruv + vec2(sm * 0.25, sm * 2.2), 0.001, 0.999)).rgb + texture2D(tReflect, clamp(ruv - vec2(sm * 0.25, sm * 2.2), 0.001, 0.999)).rgb) * 0.1;
            vec3 V = normalize(cameraPosition - vRW);
            float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
            outgoingLight = mix(outgoingLight, refl, clamp(F * (uWet * 0.42 + sbPud * 0.6) + sbPud * 0.22, 0.0, 0.85));
          }
          #include <opaque_fragment>`);
    };
    m.transparent = false;
    return m;
  };
  const hwMat = roadMat(hwTex, 4), stMat = roadMat(stTex, 2), ctMat = roadMat(ctTex, 2);
  const ixMat = roadMat(ixTex, 0);

  const ribbon = (pts, ys, width, trimStart, trimEnd, lift) => {
    const pos = [], uv = [], idx = [];
    let v = 0, count = 0;
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = acc[acc.length - 1];
    for (let i = 0; i < pts.length; i++) {
      if (acc[i] < trimStart - 0.01 || acc[i] > total - trimEnd + 0.01) continue;
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dz = q[1] - o[1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz, nz = dx, hw = width / 2, y = ys[i] + lift;
      pos.push(p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw);
      v = acc[i] / width;
      uv.push(0, v, 1, v);
      if (count > 0) { const a = (count - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      count++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const lights = [];
  const hwGeos = [], stGeos = [], ctGeos = [];
  for (const e of graph.edges) {
    const isHw = e.kind === 'highway';
    // Street ribbons stop short of intersections; intersections get their own tile.
    const gridTrim = (id) => (id[0] === 'c' ? CITY.street / 2 : id[0] === 't' ? TOWN.street / 2 : 0);
    const g = ribbon(e.pts, e.ys, e.width, gridTrim(e.a), gridTrim(e.b), 0.1);
    if (collision && collision.addRoad) collision.addRoad(e.pts, e.ys, e.width, !!e.lane);
    (isHw ? hwGeos : e.width >= 14 ? ctGeos : stGeos).push(g);
    // street lights every ~40 m on alternating sides
    const step = isHw ? 6 : 5;
    for (let i = 2; i < e.pts.length - 1; i += step) {
      const p = e.pts[i], q = e.pts[i + 1];
      let dx = q[0] - p[0], dz = q[1] - p[1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const side = (i / step) % 2 ? 1 : -1;
      const off = e.width / 2 + 1.2;
      lights.push({ x: p[0] - dz * off * side, z: p[1] + dx * off * side, y: e.ys[i], rot: Math.atan2(dx, dz), side });
    }
  }
  const merge = (geos) => {
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2); nrm.set(g.attributes.normal.array, vo * 3);
      const gi = g.index.array;
      for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      vo += g.attributes.position.count; io += gi.length;
      g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    m.computeBoundingSphere();
    return m;
  };
  const hwMesh = new THREE.Mesh(merge(hwGeos), hwMat);
  const stMesh = new THREE.Mesh(merge(stGeos), stMat);
  hwMesh.receiveShadow = stMesh.receiveShadow = true;
  group.add(hwMesh, stMesh);
  if (ctGeos.length) { const ctMesh = new THREE.Mesh(merge(ctGeos), ctMat); ctMesh.receiveShadow = true; group.add(ctMesh); }

  // Intersection tiles for street grids
  const ixGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ixNodes = [...graph.nodes.values()].filter((n) => n.id[0] === 'c' || n.id[0] === 't');
  const ix = new THREE.InstancedMesh(ixGeo, ixMat, ixNodes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  ixNodes.forEach((n, i) => {
    const G = n.id[0] === 'c' ? CITY : TOWN;
    m4.compose(p.set(n.x, G.height + 0.1, n.z), q.identity(), s.set(G.street, 1, G.street));
    ix.setMatrixAt(i, m4);
  });
  ix.receiveShadow = true;
  group.add(ix);

  // Sidewalk slabs for each city/town block
  const slabs = [];
  for (const G of [CITY, TOWN]) {
    for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.nz; j++) {
      const x = G.x0 + i * G.pitch + G.pitch / 2, z = G.z0 + j * G.pitch + G.pitch / 2, W = G.pitch - G.street;
      if (G === TOWN) {
        // a small town: a sidewalk along the streets and lawns behind it, not a paved block
        const r = TOWN_WALK;
        slabs.push({ x, z: z - W / 2 + r / 2, w: W, d: r, y: G.height }, { x, z: z + W / 2 - r / 2, w: W, d: r, y: G.height },
          { x: x - W / 2 + r / 2, z, w: r, d: W - 2 * r, y: G.height }, { x: x + W / 2 - r / 2, z, w: r, d: W - 2 * r, y: G.height });
      } else slabs.push({ x, z, w: W, d: W, y: G.height });
    }
  }
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x9a968f, roughness: 0.9 });
  if (surf && surf.concrete.real) {
    const PV = surf.pavers && surf.pavers.real ? surf.pavers : null;
    slabMat.onBeforeCompile = (sh) => {
      sh.uniforms.tCon = { value: surf.concrete.color };
      sh.uniforms.tPvC = { value: PV ? PV.color : surf.concrete.color }; sh.uniforms.tPvN = { value: PV ? PV.normal : surf.concrete.normal };
      sh.uniforms.tPvA = { value: PV ? PV.ao : surf.concrete.ao }; sh.uniforms.tPvR = { value: PV ? PV.rough : surf.concrete.rough };
      sh.uniforms.uWet = worldUniforms.uWet;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vSN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSW; varying vec3 vSN; uniform sampler2D tCon, tPvC, tPvN, tPvA, tPvR; uniform float uWet; float sbR; vec3 sbPN;
float sbH2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          sbR = 0.85; sbPN = vec3(0.0, 0.0, 1.0);
          vec2 sw = vSW.xz;
          if (vSN.y > 0.5) {
            // ${PV ? 'square concrete pavers' : 'concrete slabs'}: stained, a few dark gum spots, grime where people walk
            vec2 uv = sw / ${PV ? PV.size.toFixed(2) : '2.5'};
            vec3 pv = texture2D(tPvC, uv).rgb * mix(1.0, texture2D(tPvA, uv).r, 0.8);
            float stain = smoothstep(0.55, 0.85, sbH2(floor(sw * 0.7)) * 0.6 + texture2D(tCon, sw / 9.0).r * 0.6);
            vec2 gp = fract(sw * 1.7) - 0.5; float gum = step(0.985, sbH2(floor(sw * 1.7))) * smoothstep(0.06, 0.03, length(gp));
            diffuseColor.rgb *= pv * 1.15 * (1.0 - stain * 0.18) * (1.0 - gum * 0.6);
            sbR = texture2D(tPvR, uv).g; sbPN = texture2D(tPvN, uv).xyz * 2.0 - 1.0;
          } else {
            // the slab's edge: concrete
            vec3 con = texture2D(tCon, vec2(sw.x + sw.y, vSW.y) / 2.5).rgb;
            diffuseColor.rgb *= con * 0.95;
          }`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(sbR, sbR * 0.45, uWet); diffuseColor.rgb *= 1.0 - uWet * 0.25;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (vSN.y > 0.5) { vec3 nw = normalize(vec3(sbPN.x, max(sbPN.z, 0.2), sbPN.y)); normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`);
    };
    slabMat.customProgramCacheKey = () => 'sbslab';
  }
  const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), slabMat, slabs.length);
  slabs.forEach((b, i) => { m4.compose(p.set(b.x, b.y - 0.1, b.z), q.identity(), s.set(b.w, 0.32, b.d)); slab.setMatrixAt(i, m4); });
  slab.receiveShadow = true;
  group.add(slab);
  // A curb rim (darker, slightly taller ring) gives blocks a crisp edge
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8a8781, roughness: 0.85 });
  if (surf && surf.concrete.real) {
    curbMat.onBeforeCompile = (sh) => {
      sh.uniforms.tCon = { value: surf.concrete.color };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW; uniform sampler2D tCon;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          // poured concrete curb, grimy where the gutter water runs along its foot
          vec3 con = texture2D(tCon, vec2(vCW.x + vCW.z, vCW.y * 1.0) / 1.8).rgb;
          float foot = fract(vCW.y + 100.0);
          diffuseColor.rgb *= con * 1.1;`);
    };
    curbMat.customProgramCacheKey = () => 'sbcurb';
  }
  const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), curbMat, slabs.length);
  slabs.forEach((b, i) => { m4.compose(p.set(b.x, b.y - 0.12, b.z), q.identity(), s.set(b.w + 0.4, 0.3, b.d + 0.4)); curb.setMatrixAt(i, m4); });
  group.add(curb);

  // Bridges: deck, side walls, pillars
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const bridgeParts = [];
  for (const b of hm.bridges) {
    const dx = b.bx - b.ax, dz = b.bz - b.az, L = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2, my = (b.ya + b.yb) / 2;
    const pitch = Math.atan2(b.yb - b.ya, L);
    bridgeParts.push({ x: mx, y: my - 0.55, z: mz, sx: b.hw * 2 + 1.5, sy: 1.1, sz: L + 0.6, ry: ang, rx: -pitch });
    for (const side of [-1, 1]) {
      const ox = Math.cos(ang) * (b.hw + 0.6) * side, oz = -Math.sin(ang) * (b.hw + 0.6) * side;
      bridgeParts.push({ x: mx + ox, y: my + 0.5, z: mz + oz, sx: 0.4, sy: 1.0, sz: L + 0.6, ry: ang, rx: -pitch });
    }
    const g = hm.height(mx, mz);
    if (my - g > 2) bridgeParts.push({ x: mx, y: (my + g) / 2 - 1, z: mz, sx: 3.0, sy: my - g + 1, sz: 2.2, ry: ang, rx: 0 });
    collision.addBridge(b);
  }
  if (bridgeParts.length) {
    const bm = new THREE.InstancedMesh(box, deckMat, bridgeParts.length);
    const e = new THREE.Euler();
    bridgeParts.forEach((b, i) => {
      e.set(b.rx, b.ry, 0, 'YXZ');
      m4.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e), s.set(b.sx, b.sy, b.sz));
      bm.setMatrixAt(i, m4);
    });
    bm.castShadow = bm.receiveShadow = true;
    group.add(bm);
  }

  // Street lights: pole + arm + glowing head
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc77a, emissiveIntensity: 0 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 8, 6).translate(0, 4, 0), poleMat, lights.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), headMat, lights.length);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.0), poleMat, lights.length);
  lights.forEach((l, i) => {
    const r = l.rot + (l.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
    m4.compose(p.set(l.x, l.y, l.z), q, s.set(1, 1, 1)); poles.setMatrixAt(i, m4);
    const fx = Math.sin(r), fz = Math.cos(r);
    m4.compose(p.set(l.x + fx * 1.0, l.y + 7.9, l.z + fz * 1.0), q, s.set(1, 1, 1)); arms.setMatrixAt(i, m4);
    m4.compose(p.set(l.x + fx * 1.9, l.y + 7.8, l.z + fz * 1.9), q, s.set(1, 1, 1)); heads.setMatrixAt(i, m4);
    collision.addCircle(l.x, l.z, 0.25);
  });
  poles.castShadow = quality.shadows >= 2;
  for (const m of [poles, heads, arms]) { m.userData.hitStatic = true; m.userData.surf = 'steel'; }
  group.add(poles, heads, arms);

  // Light pools on the ground under each lamp (additive, night only)
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,200,130,1)'); gr.addColorStop(0.45, 'rgba(255,180,100,0.45)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, lights.length);
  lights.forEach((l, i) => {
    const r = l.rot + (l.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const x = l.x + Math.sin(r) * 2.6, z = l.z + Math.cos(r) * 2.6;
    m4.compose(p.set(x, Math.max(l.y, hm.height(x, z)) + 0.2, z), q.identity(), s.set(16, 1, 16));
    pools.setMatrixAt(i, m4);
  });
  pools.renderOrder = 2;
  group.add(pools);

  // Wet roads: each lamp's reflection stretched toward the camera
  const streakGeo = new THREE.InstancedBufferGeometry();
  streakGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  streakGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const lampAttr = [];
  lights.forEach((l) => {
    const r = l.rot + (l.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const x = l.x + Math.sin(r) * 1.9, z = l.z + Math.cos(r) * 1.9;
    lampAttr.push(x, Math.max(l.y, hm.height(x, z)) + 0.06, z, l.y + 7.8 - Math.max(l.y, hm.height(x, z)));
  });
  streakGeo.setAttribute('aLamp', new THREE.InstancedBufferAttribute(new Float32Array(lampAttr), 4));
  streakGeo.instanceCount = lights.length;
  const streakMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `attribute vec4 aLamp; varying vec2 vQ; varying float vF;
      void main(){
        vec2 d = cameraPosition.xz - aLamp.xz; float dist = length(d); d /= max(dist, 1e-3);
        float camH = max(cameraPosition.y - aLamp.y, 0.3);
        float rp = dist * aLamp.w / (aLamp.w + camH);          // mirror point of the lamp on the road
        float len = clamp(dist * 0.45, 3.0, 22.0);
        vec2 side = vec2(-d.y, d.x);
        vec2 c = aLamp.xz + d * (rp - len * 0.35 + position.y * len);
        vec2 xz = c + side * position.x * 0.7;
        vQ = vec2(position.x, position.y); vF = smoothstep(260.0, 120.0, dist) * smoothstep(1.0, 6.0, dist);
        gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, aLamp.y, xz.y, 1.0);
      }`,
    fragmentShader: `uniform float uOpacity; varying vec2 vQ; varying float vF;
      void main(){
        float a = exp(-vQ.x * vQ.x * 5.0) * smoothstep(0.0, 0.35, vQ.y) * smoothstep(1.0, 0.45, vQ.y) * vF * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.68, 0.34) * a * 1.6, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const streaks = new THREE.Mesh(streakGeo, streakMat);
  streaks.frustumCulled = false; streaks.renderOrder = 3; streaks.userData.noReflect = true; streaks.userData.noHit = true;
  group.add(streaks);

  scene.add(group);
  return {
    group, lights,
    // park blocks: a ring of pavement round a mown lawn crossed by two paths, with benches
    // (the block was a solid paved slab with trees growing out of it)
    parkify(blocks) {
      // parking-lot blocks: asphalt with painted stalls inside the pavement ring (they were bare paving)
      const lots = blocks.filter((b) => b.type === 'parking');
      this.lotStalls = [];
      if (lots.length) {
        const W = CITY.pitch - CITY.street, ring = 3.5, I = W - ring * 2, ppm = 14;
        // rows across the lot: [start, depth, facing] - stalls 2.7 m wide, 5.5 m deep, 7 m aisles
        const rows = [];
        let z = 1.0;
        rows.push([z, 1]); z += 5.5;                                                                  // a row along the edge
        while (z + 7 + 11 <= I - 1) { z += 7; rows.push([z, -1]); z += 5.5; rows.push([z, 1]); z += 5.5; } // aisle, then a double row
        if (z + 7 + 5.5 <= I - 1) { z += 7; rows.push([z, -1]); z += 5.5; }
        const lotTex = canvasTex(Math.round(I * ppm), Math.round(I * ppm), (ctx, w, h) => {
          base(ctx, w, h);
          ctx.fillStyle = '#dcdcd4';
          for (const [z0] of rows) {
            ctx.fillRect(0.6 * ppm, z0 * ppm, (I - 1.2) * ppm, 0.1 * ppm); // the end line of the row
            ctx.fillRect(0.6 * ppm, (z0 + 5.5) * ppm, (I - 1.2) * ppm, 0.1 * ppm);
            for (let x = 0.6; x <= I - 0.6; x += 2.7) ctx.fillRect(x * ppm, z0 * ppm, 0.1 * ppm, 5.5 * ppm);
          }
          wear(ctx, w, h);
        }, an);
        const lotMat = roadMat(lotTex, 0);
        const g = new THREE.PlaneGeometry(I, I).rotateX(-Math.PI / 2);
        const lm = new THREE.InstancedMesh(g, lotMat, lots.length);
        lots.forEach((b, i) => {
          lm.setMatrixAt(i, m4.compose(p.set(b.cx, CITY.height + 0.225, b.cz), q.identity(), s.set(1, 1, 1)));
          for (const [z0, f] of rows) for (let x = 0.6 + 1.35; x < I - 0.6; x += 2.7) {
            this.lotStalls.push({ x: b.cx - I / 2 + x, z: b.cz - I / 2 + z0 + 2.75, y: CITY.height + 0.22, heading: f > 0 ? 0 : Math.PI });
          }
        });
        lm.receiveShadow = true;
        group.add(lm);
      }
      const parks = blocks.filter((b) => b.type === 'park');
      if (!parks.length) return [];
      if (collision) collision.parks = new Set(parks.map((b) => b.i + ',' + b.j));
      const W = CITY.pitch - CITY.street, ring = 3.5, path = 3, y = CITY.height;
      const pieces = [];
      for (const b of parks) {
        const k = b.i * CITY.nz + b.j;
        // hide the full slab and its curb box
        slab.setMatrixAt(k, m4.makeScale(0, 0, 0)); curb.setMatrixAt(k, m4.makeScale(0, 0, 0));
        // the pavement ring (with its curb) and the two paths across the lawn
        for (const [cx, cz, w, d, top] of [
          [b.cx, b.cz - W / 2 + ring / 2, W, ring, 0.22], [b.cx, b.cz + W / 2 - ring / 2, W, ring, 0.22],
          [b.cx - W / 2 + ring / 2, b.cz, ring, W - ring * 2, 0.22], [b.cx + W / 2 - ring / 2, b.cz, ring, W - ring * 2, 0.22],
          [b.cx, b.cz, path, W - ring * 2, 0.08], [b.cx - (W - ring * 2) / 4 - path / 4, b.cz, (W - ring * 2) / 2 - path / 2, path, 0.08], [b.cx + (W - ring * 2) / 4 + path / 4, b.cz, (W - ring * 2) / 2 - path / 2, path, 0.08],
        ]) pieces.push({ cx, cz, w, d, top });
        // lawn instead of paving in the splat (grass grows, the terrain shows its grass)
        const n = hm.n, cell = hm.cell, half = hm.half;
        const i0 = Math.ceil((b.cx - W / 2 + ring + half) / cell), i1 = Math.floor((b.cx + W / 2 - ring + half) / cell);
        const j0 = Math.ceil((b.cz - W / 2 + ring + half) / cell), j1 = Math.floor((b.cz + W / 2 - ring + half) / cell);
        for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
          const x = -half + ii * cell, z = -half + jj * cell;
          // the paths are slabs over the lawn (the grass keeps off them by its own exact mask)
          const kk = (jj * n + ii) * 4; hm.splat[kk + 3] = 0; hm.splat[kk + 2] = 0;
        }
      }
      slab.instanceMatrix.needsUpdate = true; curb.instanceMatrix.needsUpdate = true;
      if (worldUniforms.uSplatTex.value) worldUniforms.uSplatTex.value.needsUpdate = true;
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), slabMat, pieces.length);
      const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), curbMat, pieces.length);
      pieces.forEach((pc, i) => {
        pm.setMatrixAt(i, m4.compose(p.set(pc.cx, y - 0.1, pc.cz), q.identity(), s.set(pc.w, pc.top + 0.1, pc.d)));
        cm.setMatrixAt(i, pc.top > 0.1 ? m4.compose(p.set(pc.cx, y - 0.12, pc.cz), q.identity(), s.set(pc.w + 0.2, 0.3, pc.d + 0.2)) : m4.makeScale(0, 0, 0));
      });
      pm.receiveShadow = cm.receiveShadow = true;
      group.add(pm, cm);
      // park benches facing the paths
      const benches = [];
      for (const b of parks) for (const [dx, dz, ry] of [[-14, 2.4, Math.PI], [14, 2.4, Math.PI], [-24, -2.4, 0], [24, -2.4, 0], [2.4, -14, -Math.PI / 2], [-2.4, 16, Math.PI / 2]]) benches.push([b.cx + dx, b.cz + dz, ry]);
      const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.7 });
      const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0), wood, benches.length);
      const back = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.4, 0.05).translate(0, 0.72, -0.22), wood, benches.length);
      const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.45, 0.45).translate(-0.8, 0.225, 0).toNonIndexed(), iron, benches.length * 2);
      const qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      benches.forEach(([x, z, ry], i) => {
        qq.setFromAxisAngle(up, ry);
        seat.setMatrixAt(i, m4.compose(p.set(x, y, z), qq, s.set(1, 1, 1)));
        back.setMatrixAt(i, m4);
        legs.setMatrixAt(i * 2, m4);
        const ox = Math.cos(ry) * 1.6, oz = -Math.sin(ry) * 1.6;
        legs.setMatrixAt(i * 2 + 1, m4.compose(p.set(x + ox, y, z + oz), qq, s.set(1, 1, 1)));
        const ax = Math.abs(Math.cos(ry)) > 0.5 ? 0.92 : 0.3, az = ax > 0.5 ? 0.3 : 0.92, mx = x + ox / 2, mz = z + oz / 2;
        if (collision) collision.addBox(mx - ax, mz - az, mx + ax, mz + az, y, y + 0.5, null);
      });
      for (const m of [seat, back, legs]) { m.castShadow = m.receiveShadow = true; m.userData.hitStatic = true; m.userData.surf = 'wood'; group.add(m); }
      return parks.map((b) => ({ cx: b.cx, cz: b.cz, W, ring }));
    },
    update(night) { headMat.emissiveIntensity = night * 6; poolMat.opacity = night * 0.55 * (1 - worldUniforms.uWet.value * 0.3); pools.visible = night > 0.02;
      streakMat.uniforms.uOpacity.value = night * worldUniforms.uWet.value; streaks.visible = streakMat.uniforms.uOpacity.value > 0.01; },
  };
}
