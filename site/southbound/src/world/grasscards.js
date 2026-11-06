// Dense, detailed 3D grass for the wild parts of the map (meadows, field edges, the dry plains).
//
// Real games don't model every blade: they paint dozens of detailed blades into a texture and
// stand it up on crossed cards. Here the texture is painted at load time: ~150 thin, tapered,
// curving blades per card, each with its own green, a lighter midrib, darker edges, sun-bleached
// tips, a few dry blades and seed heads. Clumps of three crossed (slightly splayed) cards stand
// a hand-span apart round the player, closer still near the camera, so there's grass behind
// grass and no bare ground between; the ground under them is darkened to the grass's own shaded
// depths (terrain.js), so any gap reads as more grass in shadow. The edges stay crisp at any
// distance (alpha sharpened against its own mip level), the grass sways in the wind and parts
// round the player. Not on mown lawns, pavement, sand, forest floor or steep rock.
import * as THREE from 'three';
import { worldUniforms, GRASS_MASK_GLSL } from './terrain.js';
import { coverUniforms } from './grass.js';
import { mulberry32 } from '../util.js';

// near ring radius / spacing, far ring radius / spacing (metres)
const PRESET = {
  Low: { r1: 9, s1: 0.34, R: 18, s2: 0.7 },
  Medium: { r1: 11, s1: 0.31, R: 26, s2: 0.62 },
  High: { r1: 13, s1: 0.28, R: 34, s2: 0.58 },
  Ultra: { r1: 16, s1: 0.26, R: 44, s2: 0.54 },
  Cinematic: { r1: 18, s1: 0.24, R: 52, s2: 0.5 },
};

// ---- the blade texture
function paintBlades(seed) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  const blades = [];
  for (let i = 0; i < 240; i++) blades.push({ depth: rnd() });
  blades.sort((a, b) => a.depth - b.depth); // the ones behind first, darker
  for (const b of blades) {
    const x0 = 6 + rnd() * (W - 12), hb = H * (0.42 + Math.pow(rnd(), 0.7) * 0.56);
    const w0 = 4.5 + rnd() * 7.5;                        // 5-13 mm across at the base
    const lean = (rnd() - 0.5) * 0.42 * hb, droop = rnd() < 0.22 ? (rnd() - 0.5) * 0.5 * hb : 0;
    const p0 = [x0, H + 2], p1 = [x0 + lean * 0.15, H - hb * 0.42], p2 = [x0 + lean * 0.7, H - hb * 0.82], p3 = [x0 + lean + droop, H - hb + Math.abs(droop) * 0.45];
    const at = (t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
    const N = 22, L = [], R = [], mid = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N, p = at(t), q = at(Math.min(1, t + 0.01)), r = at(Math.max(0, t - 0.01));
      let tx = q[0] - r[0], ty = q[1] - r[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = w0 * (t < 0.18 ? 0.82 + t : 1.0) * Math.pow(1 - t, 0.85) * 0.5; // a little fuller low down, then to a point
      L.push([p[0] - ty * w, p[1] + tx * w]); R.push([p[0] + ty * w, p[1] - tx * w]); mid.push(p);
    }
    const dry = rnd() < 0.09, dk = 0.55 + b.depth * 0.45;  // blades at the back sit in the shade
    const hue = dry ? 38 + rnd() * 10 : 70 + rnd() * 32, sat = dry ? 26 + rnd() * 18 : 26 + rnd() * 22; // real grass is a muted green
    const lit = (dry ? 46 : 26 + rnd() * 14) * dk;
    const g = x.createLinearGradient(p0[0], p0[1], p3[0], p3[1]);
    g.addColorStop(0, hsl(hue - 6, sat * 0.7, lit * 0.45));
    g.addColorStop(0.35, hsl(hue, sat, lit * 0.95));
    g.addColorStop(0.8, hsl(hue + 4, sat, lit * 1.12));
    g.addColorStop(1, rnd() < 0.5 ? hsl(48, 38, lit * 1.25) : hsl(hue + 6, sat * 0.9, lit * 1.2)); // bleached tips on half of them
    x.beginPath(); x.moveTo(L[0][0], L[0][1]);
    for (const pt of L) x.lineTo(pt[0], pt[1]);
    for (let k = R.length - 1; k >= 0; k--) x.lineTo(R[k][0], R[k][1]);
    x.closePath(); x.fillStyle = g; x.fill();
    // darker edges, and the lighter midrib down the middle
    x.strokeStyle = hsl(hue, sat, lit * 0.55, 0.5); x.lineWidth = 0.8; x.stroke();
    x.beginPath(); x.moveTo(mid[1][0], mid[1][1]);
    for (let k = 2; k < N - 2; k++) x.lineTo(mid[k][0], mid[k][1]);
    x.strokeStyle = hsl(hue + 8, sat * 0.7, Math.min(80, lit * 1.6), 0.45); x.lineWidth = Math.max(0.6, w0 * 0.12); x.stroke();
    // fine veins either side of it on the wider blades
    if (w0 > 8) for (const sd of [-0.28, 0.28]) {
      x.beginPath();
      for (let k = 2; k < N - 4; k++) { const a = mid[k], l = L[k]; const px = a[0] + (l[0] - a[0]) * sd * 2, py = a[1] + (l[1] - a[1]) * sd * 2; if (k === 2) x.moveTo(px, py); else x.lineTo(px, py); }
      x.strokeStyle = hsl(hue, sat, lit * 0.8, 0.35); x.lineWidth = 0.5; x.stroke();
    }
    // the odd seed head: spikelets along the last stretch of the stem
    if (!dry && rnd() < 0.04) {
      for (let k = 0; k < 9; k++) {
        const t = 0.8 + k * 0.022, p = at(Math.min(1, t)), sd = k % 2 ? 1 : -1;
        x.beginPath(); x.ellipse(p[0] + sd * 2.6, p[1], 1.7, 4.2 + rnd() * 1.5, sd * (0.4 + rnd() * 0.3), 0, Math.PI * 2);
        x.fillStyle = hsl(44, 34, 52 * dk); x.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

// one clump: three crossed cards, each splayed a little outward, in three bendable rows
function clumpGeometry(width) {
  const pos = [], card = [], idx = [];
  let v = 0;
  for (let q = 0; q < 3; q++) {
    const a = q * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a), splay = q === 1 ? 0.22 : -0.16;
    for (const yv of [0, 0.34, 0.68, 1]) for (const u of [-0.5, 0.5]) {
      // tilt the card about its own long axis so a view from above still lands on blades
      const lx = u * width, ly = yv, lz = yv * splay;
      pos.push(lx * ca - lz * sa, ly, lx * sa + lz * ca);
      card.push(u + 0.5, yv, q);
    }
    for (let r = 0; r < 3; r++) { const o = v + r * 2; idx.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    v += 8;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(card, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  return g;
}

function makeMaterial(surf, tex, ring) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  const gC = surf?.grass?.color || null, dC = surf?.dry?.color || null;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, coverUniforms, {
      tCard: { value: tex }, tGrassC: { value: gC }, tDryC: { value: dC }, uTexS: { value: surf?.grass?.size || 2.4 }, uTexD: { value: surf?.dry?.size || 3 },
      uSize: { value: ring.size }, uHN: { value: ring.hn }, uR0: { value: ring.r0 }, uR1: { value: ring.r1 }, uW: { value: ring.width },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aOff; attribute vec3 aCard;
uniform vec3 uCam; uniform float uSize; uniform float uHN; uniform float uR0; uniform float uR1; uniform float uW;
uniform vec4 uPush; uniform vec4 uPush2; uniform float uTime; uniform float uWindK;
uniform sampler2D uHeightTex; uniform sampler2D uSplatTex; uniform sampler2D tGrassC; uniform float uTexS; uniform sampler2D tDryC; uniform float uTexD;
uniform float uWorldHalf; uniform sampler2D uLawn; uniform vec4 uCityB;
${GRASS_MASK_GLSL}
varying vec2 vCUv; varying float vV; varying float vDry; varying vec3 vTint; varying vec3 vGW; varying float vFade; varying vec3 vGround;
vec2 gcUV(vec2 xz){ return ((xz + uWorldHalf) / (2.0*uWorldHalf) * (uHN - 1.0) + 0.5) / uHN; }
vec3 gcPos;`)
      .replace('#include <beginnormal_vertex>', `
vec2 wxz = uCam.xz + mod(aOff.xy - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
vec2 huv = gcUV(wxz);
float gy = texture(uHeightTex, huv).r;
vec4 sp = texture(uSplatTex, huv);
float e = 2.0 * uWorldHalf / (uHN - 1.0);
float slope = length(vec2(texture(uHeightTex, gcUV(wxz + vec2(e, 0.0))).r - gy, texture(uHeightTex, gcUV(wxz + vec2(0.0, e))).r - gy)) / e;
float dens = sbGrassMask(wxz, sp, slope * 0.7);
float d = length(wxz - uCam.xz);
// this ring's band (near cards inside, bigger far cards outside), cross-faded by height
float band = (uR0 > 0.0 ? smoothstep(uR0 * 0.85, uR0, d) : 1.0) * (1.0 - smoothstep(uR1 * 0.82, uR1, d));
// the two rings hand over by thinning out (dithered per clump), not by shrinking
float keep = step(aOff.w, dens * 1.15) * step(fract(aOff.w * 13.73), band);
// height: knee-high in the meadows, taller and drier on the plains, shorter near paths and lawns
float hN = gmNoise(wxz * 0.09) * 0.6 + gmNoise(wxz * 0.37) * 0.4;
float h = mix(0.26, 0.6, hN) + sp.b * 0.32;
h *= mix(0.55, 1.0, smoothstep(0.0, 0.5, dens)) * keep;
float q = aCard.z, ang = aOff.z, t = aCard.y;
// the card in its clump: across (width), up (height) and splayed outward in proportion to its
// height, so a clump the mask removes (h = 0) vanishes rather than lying flat on the ground
float qa = ang + q * 1.0472, splay = (q > 0.5 && q < 1.5) ? 0.22 : -0.16;
float lx = (aCard.x - 0.5) * uW, lz = t * splay * h;
vec3 lp = vec3(lx * cos(qa) - lz * sin(qa), t * h, lx * sin(qa) + lz * cos(qa));
// wind: rolling gusts plus a flutter, stronger at the tips; the player and their vehicle part it
vec2 wdir = normalize(vec2(0.86, 0.5));
float gust = gmNoise(wxz * 0.03 - wdir * uTime * 0.4) * 0.6 + sin(dot(wxz, wdir) * 0.35 - uTime * 1.8) * 0.25;
vec2 bendV = wdir * gust * uWindK * 0.35 + vec2(sin(uTime * 3.1 + aOff.w * 30.0), cos(uTime * 2.7 + aOff.w * 21.0)) * 0.04;
vec2 pd = wxz - uPush.xz; float pl = length(pd);
bendV += pd / max(pl, 0.01) * (1.0 - smoothstep(uPush.w * 0.2, uPush.w * 0.8, pl)) * step(abs(uPush.y - gy), 2.5) * 0.45; // leans aside, doesn't open a hole
vec2 pd2 = wxz - uPush2.xz; float pl2 = length(pd2);
bendV += pd2 / max(pl2, 0.01) * (1.0 - smoothstep(uPush2.w * 0.4, uPush2.w + 0.6, pl2)) * step(abs(uPush2.y - gy), 3.0) * 1.2;
float k2 = t * t;
lp.xz += bendV * h * k2;
lp.y *= 1.0 - 0.25 * min(length(bendV), 1.0) * k2;
lp *= step(0.001, h);
gcPos = vec3(wxz.x, gy - 0.03, wxz.y) + lp;
// which slice of the painted card this clump shows
vCUv = vec2(fract(aOff.w * 17.31 + q * 0.37) + aCard.x * 0.55 * (uW / 0.6), t);
vV = t;
vFade = smoothstep(uR1, uR1 * 0.75, d);
// colour: the ground's own grass hue at this spot (so the blades match the scanned ground), drier on the plains
vec3 cg = textureLod(tGrassC, wxz / uTexS, 5.0).rgb;
vTint = cg / max(dot(cg, vec3(0.333)), 0.05) * (0.92 + fract(aOff.w * 41.7) * 0.16);
vDry = clamp(sp.b * 1.2 + (gmNoise(wxz * 0.05) - 0.5) * 0.5, 0.0, 1.0);
// the ground's own average colour here (what the scanned terrain shows past the grass)
vGround = mix(cg * vec3(0.9, 1.0, 1.03), textureLod(tDryC, wxz / uTexD, 5.0).rgb, smoothstep(0.15, 0.85, sp.b));
vGW = gcPos;
// lighting: mostly from above (a soft, full field), a little of the card's facing
vec2 cd = vec2(cos(ang + q * 1.0472), sin(ang + q * 1.0472));
vec3 objectNormal = normalize(vec3(-cd.y, 0.0, cd.x) * 0.45 + vec3(0.0, 1.0, 0.0));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = gcPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tCard; uniform vec3 uSunDirG; uniform vec3 uSunColG;
varying vec2 vCUv; varying float vV; varying float vDry; varying vec3 vTint; varying vec3 vGW; varying float vFade; varying vec3 vGround;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec4 tc = texture2D(tCard, vCUv);
  // keep the blades' coverage as the texture shrinks into its mips, then a crisp, anti-aliased cut
  vec2 tsz = vec2(1024.0, 512.0);
  vec2 dx = dFdx(vCUv * tsz), dy = dFdy(vCUv * tsz);
  float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
  float a = tc.a * (1.0 + mip * 0.28);
  a = (a - 0.5) / max(fwidth(a), 1e-4) + 0.5;
  if (a < 0.5 || vFade < 0.01) discard;
  vec3 col = tc.rgb;
  // the scanned ground's hue, and straw-gold where it is dry
  col *= mix(vec3(1.0), vTint, 0.55);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  // dry grass: straw and gold, not mud
  col = mix(col, vec3(0.6, 0.5, 0.28) * (0.55 + lum * 1.9), vDry * 0.85);
  // the depths of the clump are in shade (less so far off, where it must match the open ground)
  col *= mix(mix(0.42, 1.0, smoothstep(0.0, 0.6, vV)), 1.0, 1.0 - vFade);
  // towards the edge of the grass, take on the scanned ground's colour so there's no line where it ends
  col = mix(col, vGround * (0.85 + 0.3 * vV), (1.0 - vFade) * 0.75);
  diffuseColor.rgb = col;
}`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // sunlight through thin blades when it's behind them
  vec3 vd = normalize(vGW - cameraPosition);
  float back = pow(max(dot(vd, uSunDirG), 0.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * uSunColG * (0.04 + back * 0.45) * vV;
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= mix(0.45, 1.0, vV);`);
  };
  mat.customProgramCacheKey = () => 'sbgrasscards';
  return mat;
}

function makeRing(surf, tex, hn, R, step, r0, r1, width, seed, quality) {
  const rnd = mulberry32(seed);
  const geo = clumpGeometry(0.6);
  const size = R * 2, G = Math.ceil(size / step), cell = size / G;
  const off = new Float32Array(G * G * 4);
  let i = 0;
  for (let gz = 0; gz < G; gz++) for (let gx = 0; gx < G; gx++, i++) off.set([(gx + 0.1 + rnd() * 0.8) * cell, (gz + 0.1 + rnd() * 0.8) * cell, rnd() * Math.PI * 2, rnd()], i * 4);
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = G * G;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mesh = new THREE.Mesh(geo, makeMaterial(surf, tex, { size, hn, r0, r1, width }));
  mesh.frustumCulled = false;
  mesh.receiveShadow = quality.shadows > 0;
  mesh.castShadow = false;
  mesh.userData.noReflect = true; mesh.userData.noHit = true;
  mesh.renderOrder = -1;
  return mesh;
}

export function createGrassCards(hm, quality, scene, surf) {
  const P = PRESET[quality.label];
  if (!P) return null;
  const tex = paintBlades(31);
  const group = new THREE.Group(); group.name = 'grass';
  // near: small cards packed tight; far: wider cards further apart, out to the edge
  group.add(makeRing(surf, tex, hm.n, P.r1 + 2, P.s1, 0, P.r1, 0.6, 7, quality));
  group.add(makeRing(surf, tex, hm.n, P.R, P.s2, P.r1, P.R, 1.05, 9, quality));
  scene.add(group);
  worldUniforms.uGrassR.value = P.R;
  return {
    group, tex,
    setVisible(on) { group.visible = on; worldUniforms.uGrassR.value = on ? P.R : 0; },
  };
}
