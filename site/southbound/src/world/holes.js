// Bullet holes, drawn per pixel so they hold up close.
//
// Drywall: torn paper fringe, the white gypsum core at the edge, and behind it
// the wall cavity - the back of the far panel, pink insulation in outside
// walls, or the wood stud when the hole lands on one (studs sit 16 inches
// apart, so holes along a wall find them where a real wall has them). Holes
// close together merge and grow until you can see the framing. Exit holes
// blow out wider. Brick chips to fresh red clay, concrete to grey with a
// dark pit, metal punches clean with a bright rim and chipped paint, wood
// splinters, and glass stars out in radial cracks.
//
// One instanced mesh for every hole in the world: one draw call.
import * as THREE from 'three';

export const HOLE = { drywall: 0, drywallExit: 1, wood: 2, frame: 3, brick: 4, concrete: 5, metal: 6, glass: 7 };
const HALF = [2.4, 2.6, 2.2, 2.4, 2.2, 2.2, 1.6, 6.5]; // quad half-size in hole radii (dust ring, cracks)
const STUD = 0.4064, STUD_W = 0.038; // 16 in on centre, 1.5 in wide

const GLSL = /* glsl */ `
varying vec4 vHole; varying vec2 vHP;
float hh(float n){ return fract(sin(n) * 43758.5453); }
float hn(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hh(i), hh(i + 1.0), f); }
float hn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hh(i.x + i.y * 57.0), b = hh(i.x + 1.0 + i.y * 57.0), c = hh(i.x + (i.y + 1.0) * 57.0), d = hh(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
vec4 holeColor(){
  int type = int(vHole.x + 0.5); float seed = vHole.y, R = vHole.z, stud = vHole.w;
  float half_ = type == 7 ? 6.5 : type == 6 ? 1.6 : type == 1 ? 2.6 : type == 0 || type == 3 ? 2.4 : 2.2;
  vec2 q = vHP * R * half_; float r = length(q), a = atan(q.y, q.x);
  float wob = hn(a * 2.2 + seed * 7.0) * 0.55 + hn(a * 6.5 + seed * 3.0) * 0.45;
  vec3 col = vec3(0.0); float al = 0.0;
  if (type == 0 || type == 1 || type == 3) {
    float rr = R * (type == 1 ? 1.45 : 1.0) * (0.82 + 0.36 * wob);
    if (r < rr * 0.8) {
      // the cavity: the stud, insulation, or the back of the far panel, in the wall's shadow
      float sh = 0.35 + 0.65 * smoothstep(rr * 0.8, rr * 0.15, r);
      if (abs(q.x - stud) < ${(STUD_W / 2).toFixed(4)}) {
        float grain = 0.82 + 0.18 * sin(q.y * 520.0 + hn(q.x * 300.0 + seed) * 6.0);
        col = vec3(0.62, 0.46, 0.28) * grain * (abs(q.x - stud) > ${(STUD_W / 2 - 0.004).toFixed(4)} ? 0.6 : 1.0);
      } else if (type == 3) col = vec3(0.86, 0.56, 0.55) * (0.65 + 0.35 * hn2(q * 900.0 + seed));
      else col = vec3(0.3, 0.285, 0.26) * (0.75 + 0.25 * hn2(q * 400.0 + seed));
      col *= sh; al = 1.0;
    } else if (r < rr) { col = vec3(0.93, 0.92, 0.89) * (0.85 + 0.15 * hn2(q * 1500.0)); al = 1.0; }
    else if (r < rr * 1.28) { col = vec3(0.97, 0.96, 0.94); al = 0.55 * step(0.35, hn(a * 18.0 + seed * 11.0)); }
    float dust = (1.0 - smoothstep(0.0, R * half_, r)) * (type == 1 ? 0.45 : 0.3);
    if (al < dust) { col = vec3(0.95, 0.94, 0.92); al = dust; }
  } else if (type == 2) {
    float rr = R * 0.55 * (0.85 + 0.3 * wob);
    float spl = smoothstep(0.55, 0.9, hn(a * 9.0 + seed * 5.0));
    if (r < rr) { col = vec3(0.025, 0.018, 0.012); al = 1.0; }
    else if (r < R * (1.0 + spl * 0.9)) { col = vec3(0.72, 0.56, 0.36) * (0.8 + 0.2 * hn(r * 900.0)); al = 1.0 - smoothstep(R * 0.8, R * (1.0 + spl * 0.9), r) * 0.6; }
  } else if (type == 4 || type == 5) {
    float rr = R * 1.7 * (0.7 + 0.5 * wob);
    vec3 fresh = type == 4 ? vec3(0.62, 0.3, 0.2) : vec3(0.6, 0.6, 0.58);
    if (r < R * 0.35) { col = fresh * 0.18; al = 1.0; }
    else if (r < rr) { float d = r / rr; col = fresh * (0.55 + 0.45 * d) * (0.85 + 0.15 * hn2(q * 1200.0 + seed)); al = 1.0; }
    float dust = (1.0 - smoothstep(rr, R * half_, r)) * 0.35;
    if (al < dust) { col = fresh * 1.1; al = dust; }
    // hairline cracks off the crater
    float cr = abs(fract(a / 6.2832 * 7.0 + hn(seed) ) - 0.5);
    if (r > rr && r < rr * 1.9 && cr < 0.012 * R / max(r, 1e-4) * 6.0) { col = fresh * 0.3; al = max(al, 0.7); }
  } else if (type == 6) {
    float rr = R * 0.5;
    if (r < rr) { col = vec3(0.01); al = 1.0; }
    else if (r < rr * 1.25) { col = vec3(0.78, 0.78, 0.8); al = 1.0; }
    else if (r < R * (0.8 + 0.35 * wob)) { col = vec3(0.42, 0.43, 0.45) * (0.85 + 0.15 * hn(a * 30.0)); al = 1.0; }
  } else {
    // glass: a small hole, a ring of crushed glass and long radial cracks
    float rr = R * 0.35;
    if (r < rr) { col = vec3(0.03); al = 0.9; }
    else if (r < R * 1.1) { col = vec3(0.9); al = 0.55 * hn2(q * 2600.0 + seed); }
    float n = 9.0 + floor(hh(seed) * 5.0);
    float k = fract(a / 6.2832 * n + hn(r * 40.0 + seed) * 0.15);
    float len = R * half_ * (0.45 + 0.55 * hh(floor(a / 6.2832 * n) + seed));
    if (abs(k - 0.5) < 0.012 * R * 3.0 / max(r, R * 0.5) && r < len) { col = vec3(0.92); al = max(al, 0.8 * (1.0 - r / len)); }
    float ring = abs(r - R * 2.4 * (0.9 + 0.2 * wob));
    if (ring < 0.0012) { col = vec3(0.9); al = max(al, 0.6); }
  }
  return vec4(col, al);
}
`;

export function createHoles(scene, cap = 220) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aHole', attr);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aHole; varying vec4 vHole; varying vec2 vHP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHole = aHole; vHP = position.xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec4 hc = holeColor(); if (hc.a < 0.02) discard; diffuseColor = vec4(hc.rgb, hc.a); }');
  };
  mat.customProgramCacheKey = () => 'sbholes';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 3;
  mesh.userData.noHit = true; mesh.userData.noReflect = true;
  scene.add(mesh);
  const list = []; // {p, n, t, R, type, i}
  let next = 0;
  const m4 = new THREE.Matrix4(), X = new THREE.Vector3(), Yb = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), pos = new THREE.Vector3();

  function tangent(n, out) {
    out.crossVectors(up, n);
    if (out.lengthSq() < 1e-4) out.set(1, 0, 0); // floors and ceilings
    return out.normalize();
  }
  function write(h) {
    const n = h.n, t = tangent(n, X), b = Yb.crossVectors(n, t).normalize();
    const s = h.R * HALF[h.type];
    m4.makeBasis(t, b, n);
    m4.scale(sc.set(s, s, 1));
    m4.setPosition(pos.copy(h.p).addScaledVector(n, 0.003));
    mesh.setMatrixAt(h.i, m4);
    // where the nearest stud is, along the wall, relative to the hole
    let stud = 9;
    if (h.type <= 1 || h.type === 3) { const along = h.p.dot(t) / STUD; stud = (Math.round(along) - along) * STUD; }
    attr.setXYZW(h.i, h.type, h.seed, h.R, stud);
    mesh.instanceMatrix.needsUpdate = true; attr.needsUpdate = true;
    mesh.count = Math.max(mesh.count, h.i + 1);
  }
  return {
    mesh,
    // R: hole radius in metres (calibre and what it hit decide it)
    add(point, normal, type, R = 0.012) {
      const n = normal.clone().normalize();
      // drywall holes close together tear into one bigger hole
      if (type <= 1 || type === 3) {
        for (const h of list) {
          if (h.type > 3 || h.type === 2 || h.n.dot(n) < 0.95) continue;
          const d = h.p.distanceTo(point);
          if (d < h.R * 1.5 + 0.03 && Math.abs(_d.subVectors(point, h.p).dot(n)) < 0.03) {
            h.R = Math.min(0.24, h.R + 0.012 + (type === 1 ? 0.01 : 0));
            h.p.lerp(point, 0.25);
            if (type === 1) h.type = 1;
            write(h);
            return h;
          }
        }
      }
      let h = list.find((x) => x.i === next);
      if (h) { h.p.copy(point); h.n.copy(n); h.type = type; h.R = R; h.seed = Math.random() * 100; }
      else { h = { p: point.clone(), n, type, R, seed: Math.random() * 100, i: next }; list.push(h); }
      next = (next + 1) % cap;
      write(h);
      return h;
    },
    clear() { list.length = 0; next = 0; mesh.count = 0; },
    get count() { return list.length; },
  };
}
const _d = new THREE.Vector3();
