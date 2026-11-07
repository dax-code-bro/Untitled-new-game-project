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
// Three rings of real blades round the camera, all tufts of strands: [outer radius, tuft spacing,
// blades per tuft, blade width scale]. Close up they're thin and packed tight; further out the
// tufts thin out and the blades get wider, so the ground stays covered at every distance.
const PRESET = {
  Low: [[4, 0.16, 8, 1.6], [9, 0.28, 8, 2.8], [18, 0.7, 5, 5]],
  Medium: [[5, 0.14, 10, 1.6], [11, 0.25, 9, 2.8], [26, 0.62, 6, 5]],
  High: [[6, 0.13, 12, 1.6], [13, 0.24, 10, 2.8], [34, 0.55, 6, 5]],
  Ultra: [[7, 0.12, 13, 1.6], [16, 0.22, 10, 2.8], [44, 0.6, 6, 5]],
  Cinematic: [[8, 0.11, 14, 1.6], [18, 0.21, 11, 2.8], [52, 0.6, 7, 5]],
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

// one tuft of real grass: nb thin, tapered strands rooted round a small patch, each leaning and
// curling its own way, plus a seed stalk that most tufts hide. Per vertex: aSeg (how far up the
// blade, which edge); per blade: aB (root x, z, the way it leans, height), aB2 (width at the root
// in metres, lean, curl, a random number: -1 marks the seed stalk).
function tuftGeometry(nb, radius, seed) {
  const rnd = mulberry32(seed);
  const seg = [], b1 = [], b2 = [], idx = [];
  const rows = [0, 0.36, 0.7];
  let v = 0;
  for (let j = 0; j <= nb; j++) {
    const stalk = j === nb;
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius * (stalk ? 0.4 : 1);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const face = stalk ? rnd() * 6.283 : a + (rnd() - 0.5) * 1.6; // most lean away from the middle of the tuft
    const hk = stalk ? 1.45 : 0.5 + Math.pow(rnd(), 0.8) * 0.7;
    const w = stalk ? 0.0028 : 0.0032 + rnd() * 0.0048;          // 3-8 mm across at the root
    const lean = stalk ? 0.06 : 0.06 + Math.pow(rnd(), 1.5) * 0.42;
    const curl = (rnd() - 0.5) * 0.7;
    const rr = stalk ? -1 : rnd();
    const push = (t, side) => { seg.push(t, side); b1.push(bx, bz, face, hk); b2.push(w, lean, curl, rr); };
    for (const t of rows) { push(t, -1); push(t, 1); }
    push(1, 0); // the point
    for (let k = 0; k < rows.length - 1; k++) { const o = v + k * 2; idx.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    const last = v + (rows.length - 1) * 2; idx.push(last, last + 1, v + rows.length * 2);
    v += rows.length * 2 + 1;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(v * 3), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(v * 3), 3));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 2));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(b1, 4));
  g.setAttribute('aB2', new THREE.Float32BufferAttribute(b2, 4));
  g.setIndex(idx);
  return g;
}

function makeMaterial(surf, tex, ring, blades = false) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  const gC = surf?.grass?.color || null, dC = surf?.dry?.color || null;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, coverUniforms, {
      tCard: { value: tex }, tGrassC: { value: gC }, tDryC: { value: dC }, uTexS: { value: surf?.grass?.size || 2.4 }, uTexD: { value: surf?.dry?.size || 3 },
      uSize: { value: ring.size }, uHN: { value: ring.hn }, uR0: { value: ring.r0 }, uR1: { value: ring.r1 }, uW: { value: ring.width },
      uBW: { value: ring.bw || 1 }, uOuter: { value: ring.outer ? 1 : 0 },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aOff; ${blades ? 'attribute vec2 aSeg; attribute vec4 aB; attribute vec4 aB2; varying float vSide; varying float vBR; varying float vStalk;' : 'attribute vec3 aCard;'}
uniform vec3 uCam; uniform float uSize; uniform float uHN; uniform float uR0; uniform float uR1; uniform float uW; uniform float uBW; uniform float uOuter;
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
// mown lawns (G12): short, dense grass on the yards and round the buildings, not a flat green picture
float lawnK = smoothstep(0.2, 0.8, texture(uLawn, (wxz + uWorldHalf) / (2.0 * uWorldHalf)).r) * (1.0 - smoothstep(0.04, 0.3, sp.a)) * (1.0 - smoothstep(0.25, 0.6, sp.r)) * (1.0 - smoothstep(0.32, 0.6, slope));
dens = max(dens, lawnK);
float d = length(wxz - uCam.xz);
// this ring's band (near cards inside, bigger far cards outside), cross-faded by height
float band = (uR0 > 0.0 ? smoothstep(uR0 * 0.85, uR0, d) : 1.0) * (1.0 - smoothstep(uR1 * 0.82, uR1, d));
// the two rings hand over by thinning out (dithered per clump), not by shrinking
// at the edge of a meadow the grass gets shorter rather than sparser (a thin scatter of tall
// strands looks patchy); it only thins out right at the rim
float keep = step(aOff.w, smoothstep(0.0, 0.22, dens) * 1.15) * step(fract(aOff.w * 13.73), band);
// height: knee-high in the meadows, taller and drier on the plains, shorter near paths and lawns
float hN = gmNoise(wxz * 0.09) * 0.6 + gmNoise(wxz * 0.37) * 0.4;
float h = mix(0.26, 0.6, hN) + sp.b * 0.32;
h *= mix(0.3, 1.0, smoothstep(0.08, 0.7, dens)) * keep;
h = mix(h, (0.06 + hN * 0.04) * keep, lawnK); // a lawn: ankle-high at most
${blades ? `float ang = aOff.z, t = aSeg.x, side = aSeg.y, q = 0.0;
// one strand: rooted in the tuft (turned with it), leaning out along its facing and curling a
// little sideways, more towards the tip; tapering to a point. A tuft the mask removes (h = 0)
// vanishes rather than lying flat. The seed stalk shows in about one tuft in six.
float stalk = step(aB2.w, -0.5);
float bh = h * aB.w * mix(1.0, step(fract(aOff.w * 7.13), 0.09) * (1.0 + sp.b * 0.35), stalk);
float ca = cos(ang), sa = sin(ang);
vec2 root = vec2(aB.x * ca - aB.y * sa, aB.x * sa + aB.y * ca) * uW;
float fa = aB.z + ang; vec2 fdir = vec2(cos(fa), sin(fa)), perp = vec2(-fdir.y, fdir.x);
float wdt = aB2.x * mix(uBW * pow(1.0 - t * 0.98, 0.75), 1.0 + smoothstep(0.5, 0.7, t) * 1.6, stalk);
vec2 out2 = (fdir * aB2.y + perp * aB2.z * 0.35) * t * t * bh;
vec3 lp = vec3(root.x + out2.x + perp.x * side * wdt * 0.5, t * bh * (1.0 - 0.3 * aB2.y * t), root.y + out2.y + perp.y * side * wdt * 0.5);
float h0 = h; h = bh;
vSide = side; vBR = aB2.w; vStalk = stalk;` : `float q = aCard.z, ang = aOff.z, t = aCard.y;
// the card in its clump: across (width), up (height) and splayed outward in proportion to its
// height, so a clump the mask removes (h = 0) vanishes rather than lying flat on the ground
float qa = ang + q * 1.0472, splay = (q > 0.5 && q < 1.5) ? 0.22 : -0.16;
float lx = (aCard.x - 0.5) * uW, lz = t * splay * h;
vec3 lp = vec3(lx * cos(qa) - lz * sin(qa), t * h, lx * sin(qa) + lz * cos(qa));`}
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
${blades ? 'vCUv = vec2(0.0);' : 'vCUv = vec2(fract(aOff.w * 17.31 + q * 0.37) + aCard.x * 0.55 * (uW / 0.6), t);'}
vV = t;
vFade = uOuter > 0.5 ? smoothstep(uR1, uR1 * 0.75, d) : 1.0;
// colour: the ground's own grass hue at this spot (so the blades match the scanned ground), drier on the plains
vec3 cg = textureLod(tGrassC, wxz / uTexS, 5.0).rgb;
vTint = cg / max(dot(cg, vec3(0.333)), 0.05) * (0.92 + fract(aOff.w * 41.7) * 0.16);
vDry = clamp(sp.b * 1.2 + (gmNoise(wxz * 0.05) - 0.5) * 0.5, 0.0, 1.0);
// the ground's own average colour here (what the scanned terrain shows past the grass)
vGround = mix(cg * vec3(0.9, 1.0, 1.03), textureLod(tDryC, wxz / uTexD, 5.0).rgb, smoothstep(0.15, 0.85, sp.b));
vGW = gcPos;
// lighting: mostly from above (a soft, full field), a little of the card's facing
${blades ? `vec3 objectNormal = normalize(vec3(fdir.x, 0.0, fdir.y) * 0.5 + vec3(perp.x, 0.0, perp.y) * side * 0.38 + vec3(0.0, 0.8, 0.0));` : `vec2 cd = vec2(cos(ang + q * 1.0472), sin(ang + q * 1.0472));
vec3 objectNormal = normalize(vec3(-cd.y, 0.0, cd.x) * 0.45 + vec3(0.0, 1.0, 0.0));`}
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = gcPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tCard; uniform vec3 uSunDirG; uniform vec3 uSunColG;
varying vec2 vCUv; varying float vV; varying float vDry; varying vec3 vTint; varying vec3 vGW; varying float vFade; varying vec3 vGround;
${blades ? 'varying float vSide; varying float vBR; varying float vStalk;' : ''}`)
      .replace('#include <color_fragment>', blades ? `#include <color_fragment>
{
  if (vFade < 0.01) discard;
  // each strand its own muted green; darker at the root, lighter up the blade; a pale midrib and
  // darker edges; bleached tips on some, a few dead straw blades, the seed stalks straw-gold
  float r = fract(vBR * 7.31 + 0.17), r2 = fract(vBR * 13.7), r3 = fract(vBR * 29.3);
  vec3 col = mix(vec3(0.05, 0.095, 0.02), vec3(0.15, 0.2, 0.048), r);
  col *= mix(0.42, 1.18, smoothstep(0.0, 0.92, vV));
  col *= 0.8 + 0.34 * (1.0 - abs(vSide));
  col = mix(col, vec3(0.42, 0.38, 0.2) * (0.6 + vV * 0.5), smoothstep(0.72, 1.0, vV) * step(0.55, r2) * 0.55);
  float dead = max(step(0.93, r3), vStalk);
  col = mix(col, vec3(0.5, 0.42, 0.22) * (0.5 + vV * 0.7), dead * 0.9);
  // the scanned ground's hue, and straw-gold where it is dry
  col *= mix(vec3(1.0), vTint, 0.5);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(0.6, 0.5, 0.28) * (0.55 + lum * 1.9), vDry * 0.85);
  // the depths of the tuft are in shade; at the edge of the grass, the ground's own colour
  col *= mix(mix(0.5, 1.0, smoothstep(0.0, 0.55, vV)), 1.0, 1.0 - vFade);
  col = mix(col, vGround * (0.85 + 0.3 * vV), (1.0 - vFade) * 0.75);
  diffuseColor.rgb = col;
}` : `#include <color_fragment>
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
  totalEmissiveRadiance += diffuseColor.rgb * uSunColG * (0.04 + back * 0.45) * vV * sbCloudShade(vGW); // through the blades, also under a cloud's shadow
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= mix(0.45, 1.0, vV);`);
  };
  mat.customProgramCacheKey = () => blades ? 'sbgrassblades' : 'sbgrasscards';
  return mat;
}

function makeRing(surf, tex, hn, R, step, r0, r1, width, seed, quality, nb = 0, bw = 1, outer = true) {
  const rnd = mulberry32(seed);
  // near: tufts of real blades rooted over a patch a little wider than the spacing, so they
  // overlap and there's no bare ground between them; far: the painted cards
  const geo = nb ? tuftGeometry(nb, 1, seed * 3 + 1) : clumpGeometry(0.6);
  const size = R * 2, G = Math.ceil(size / step), cell = size / G;
  const off = new Float32Array(G * G * 4);
  let i = 0;
  for (let gz = 0; gz < G; gz++) for (let gx = 0; gx < G; gx++, i++) off.set([(gx + 0.1 + rnd() * 0.8) * cell, (gz + 0.1 + rnd() * 0.8) * cell, rnd() * Math.PI * 2, rnd()], i * 4);
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = G * G;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mesh = new THREE.Mesh(geo, makeMaterial(surf, tex, { size, hn, r0, r1, width, bw, outer }, !!nb));
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
  // each ring: tufts rooted over a patch a little wider than their spacing, so they overlap
  let r0 = 0;
  P.forEach(([r1, step, nb, bw], i) => {
    group.add(makeRing(surf, tex, hm.n, r1 + 2, step, r0, r1, step * 0.8, 7 + i * 2, quality, nb, bw, i === P.length - 1));
    r0 = r1;
  });
  scene.add(group);
  const Rmax = P[P.length - 1][0];
  worldUniforms.uGrassR.value = Rmax;
  return {
    group, tex,
    setVisible(on) { group.visible = on; worldUniforms.uGrassR.value = on ? Rmax : 0; },
  };
}
