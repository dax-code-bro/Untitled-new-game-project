// The landscape shader for the nature library: ONE material for the cliff tiles, the platform, the
// beach, the sea bed and the land behind the coast (so the baked 3D band and the heightfield beyond
// it shade identically where they meet).
//
//   const mat = await landscapeMaterial(ctx, { world: W });   // W: createVerdorWorld()
//   mesh geometry needs: position, normal, aAO (0..1 sky visibility), aCav (0..1 crevice)
//
// What a real pale limestone coast shows, and what this shader does about it:
//   * the rock: a scanned pale weathered rock (ambientCG Rock26) at two scales, tinted per BED from
//     the same strata table the cliff geometry was carved from (cream / pale grey / buff beds, thin
//     dark shaly partings), with a bump from each bed's weathering recess (grooves finer than the mesh);
//   * zonation by height above the sea: wet dark rock and wrack weed / barnacles / green algae in the
//     intertidal; the black lichen band (Verrucaria) just above high water; orange-yellow lichen
//     (Xanthoria / Caloplaca) in the splash zone; grey crustose lichen and moss higher up;
//   * water: rain streaks down faces, dark seeps under shaly beds, whitewash under seabird ledges;
//   * cover: turf on tops and broad ledges (above the spray), soil and grass on the head slopes,
//     scree on the talus aprons, shingle berm + sand on the beach, sand and weed on the sea bed;
//   * light: the bake's sky visibility (caves, notches, joints) darkens only the sky light, the
//     crevice term darkens the albedo a little (dirt and damp collect there).
import * as THREE from 'three';
import { textureLayers } from './texarray.js';
import { worldVaryings, GLSL_NOISE } from '../sets/materials.js';

export const LAYERS = ['pbr/acg_rock26', 'pbr/acg_ground037', 'pbr/acg_ground03', 'pbr/acg_ground05', 'pbr/acg_ground27', 'pbr/ph_floor_pebbles_01', 'pbr/acg_ground28', 'pbr/acg_ground13', 'pbr/acg_ground36'];
// layer roles
const L = { rock: 0, turf: 1, turf2: 2, soil: 3, sand: 4, shingle: 5, scree: 6, dry: 7, heath: 8 };

/** The strata table as a texture: s = y + dipH(x, z) -> r tint, g hardness, b recess/4, a parting */
export function bedTexture(W) {
  const s0 = W.beds[0].b0, s1 = W.beds[W.beds.length - 1].b1, ds = 0.1;
  const n = Math.ceil((s1 - s0) / ds), w = Math.ceil(Math.sqrt(n));
  const data = new Uint8Array(w * w * 4);
  for (let i = 0; i < n; i++) {
    const s = s0 + (i + 0.5) * ds, k = W.bedAt(s), b = W.beds[k];
    const thin = b.bole !== undefined ? (b.bole && s > b.b1 - 1.2 ? 1 : 0) : ((b.b1 - b.b0) < 0.45 && b.hard < 0.35 ? 1 : 0);
    data[i * 4] = Math.round(b.tint * 255);
    data[i * 4 + 1] = Math.round(W.hardAt(s) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, W.recessAt(s) / 4) * 255);
    data[i * 4 + 3] = thin * 255;
  }
  const t = new THREE.DataTexture(data, w, w, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return { texture: t, range: new THREE.Vector4(s0, ds, w, n) };
}

const GLSL = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray nkAlb; uniform sampler2DArray nkNrm; uniform sampler2DArray nkDat;
uniform float nkTile[9];
uniform sampler2D nkBeds; uniform vec4 nkBedR;
uniform vec4 nkSea;        // tide high, tide low, splash height, beach bay z
uniform vec4 nkDipLin;     // linear dip (x, z, offset, 1 = use it instead of Verdor's fold)
uniform vec4 nkLook;       // lichen amount, streaks, guano, turf height offset
uniform vec3 nkPoint;      // the point (outer rocks) x, z, radius of the bird colony
uniform sampler2D nkCover; uniform vec4 nkCoverXf; uniform float nkHasCover;   // land cover: heath, gorse, bracken, scrub
varying float vNkAO; varying float vNkCav;

float nkDip(vec2 p) { if (nkDipLin.w > 0.5) return nkDipLin.x * p.x + nkDipLin.y * p.y + nkDipLin.z; return 0.034 * p.y + 7.0 * sin(p.y * 0.0021 + 0.9) - 9.0 * exp(-pow((p.y - 700.0) / 500.0, 2.0)) + 0.006 * p.x; }
vec4 nkBed(float s) {
  float i = clamp(floor((s - nkBedR.x) / nkBedR.y), 0.0, nkBedR.w - 1.0);
  vec2 uv = (vec2(mod(i, nkBedR.z), floor(i / nkBedR.z)) + 0.5) / nkBedR.z;
  return texture2D(nkBeds, uv);
}
// one layer, one planar projection: albedo (rgb) + height (a); world normal; roughness
void nkTap(int Lr, int ax, vec3 P, vec3 n, float scale, out vec4 alb, out vec3 nw, out float rough) {
  vec2 uv; vec3 T, B;
  dkProj(ax, P * nkTile[Lr] * scale, n, uv, T, B);
  // smooth domain warp: breaks the photo's repeat grid without seams. Large and slow: the warp's
  // gradient stretches the photo locally, and a strong one (it was 1.2 tiles every 4 tiles) smears
  // the grain into swirling hair-like streaks; keep the local stretch under ~25 %
  uv += (vec2(dkVN2(uv * 0.07 + float(Lr) * 3.1), dkVN2(uv * 0.07 + 17.3)) - 0.5) * 0.9
      + (vec2(dkVN2(uv * 0.29 + 5.7), dkVN2(uv * 0.29 + 11.1)) - 0.5) * 0.14;
  vec3 a = texture(nkAlb, vec3(uv, float(Lr))).rgb;
  vec4 d = texture(nkDat, vec3(uv, float(Lr)));
  vec3 tn = texture(nkNrm, vec3(uv, float(Lr))).xyz * 2.0 - 1.0;
  alb = vec4(a, d.g);
  nw = normalize(T * tn.x + B * tn.y + n * max(tn.z, 0.15));
  rough = d.r;
}
// triplanar (sharpened weights; small weights skipped)
void nkTri(int Lr, vec3 P, vec3 n, float scale, out vec4 alb, out vec3 nw, out float rough) {
  vec3 w = pow(abs(n), vec3(5.0)); w /= (w.x + w.y + w.z);
  alb = vec4(0.0); nw = vec3(0.0); rough = 0.0;
  for (int ax = 0; ax < 3; ax++) {
    float wi = ax == 0 ? w.x : ax == 1 ? w.y : w.z;
    if (wi < 0.02) continue;
    vec4 a; vec3 nn; float r;
    nkTap(Lr, ax, P, n, scale, a, nn, r);
    alb += a * wi; nw += nn * wi; rough += r * wi;
  }
  nw = normalize(nw);
}
// ground layers: top projection on the flat, triplanar on slopes (a top projection smears into
// streaks down the fall line of head slopes, banks and talus)
void nkGround(int Lr, vec3 P, vec3 n, float scale, out vec4 alb, out vec3 nw, out float rough) {
  if (n.y > 0.9) nkTap(Lr, 1, P, n, scale, alb, nw, rough);
  else nkTri(Lr, P, n, scale, alb, nw, rough);
}
// pixel footprint in metres (set per fragment); an octave of procedural noise fades to its mean once
// its period approaches the footprint - unfiltered value noise above Nyquist aliases into moire
// streaks and swirls on oblique ground
float nkFp = 0.01;
float nkAA(float f) { return 1.0 - smoothstep(0.22, 0.6, f * nkFp); }
float nkN3(vec3 p, float f) { return mix(0.5, dkVN3(p * f), nkAA(f)); }
vec3 nkRockN; float nkRough; float nkWetness; float nkAOv;
`;

let blank = null;
const blankCover = () => blank || (blank = Object.assign(new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat), { needsUpdate: true }));

export async function landscapeMaterial(ctx, opts = {}) {
  const W = opts.world;
  const T = await textureLayers(ctx, LAYERS, { size: opts.textureSize ?? 1024 });
  const beds = bedTexture(W);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  mat.name = 'nature:landscape';
  const tiles = LAYERS.map((id) => 1 / (T.tile[T.index[id]] || 2));
  const U = {
    nkAlb: { value: T.albedo }, nkNrm: { value: T.normal }, nkDat: { value: T.data },
    nkTile: { value: tiles },
    nkBeds: { value: beds.texture }, nkBedR: { value: beds.range },
    nkSea: { value: new THREE.Vector4(W.VERDOR.tide.high, W.VERDOR.tide.low, 4.5, W.VERDOR.beachBay.z) },
    nkDipLin: { value: new THREE.Vector4(...(opts.dipLinear || [0, 0, 0, 0])) },
    nkLook: { value: new THREE.Vector4(opts.lichen ?? 1, opts.streaks ?? 1, opts.guano ?? 1, opts.turfOffset ?? 0) },
    nkPoint: { value: new THREE.Vector3(W.xc(W.VERDOR.point.z) + 120, W.VERDOR.point.z + 30, 260) },
    nkCover: { value: blankCover() }, nkCoverXf: { value: new THREE.Vector4(0, 0, 1, 1) }, nkHasCover: { value: 0 },
  };
  mat.userData.nkUniforms = U;
  /** the plants' land-cover map (plants.js landCover): the ground under each community */
  mat.userData.setCover = (cover) => { U.nkCover.value = cover.texture; U.nkCoverXf.value.copy(cover.xf); U.nkHasCover.value = 1; };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    worldVaryings(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; attribute float aCav; varying float vNkAO; varying float vNkCav;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNkAO = aAO; vNkCav = aCav;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${opts.rockOnly ? '#define NK_ROCK_ONLY' : ''}
${opts.profile === 'basalt' ? '#define NK_BASALT' : ''}
varying vec3 vDkW; varying vec3 vDkN;
${GLSL_NOISE}
void dkProj(int ax, vec3 p, vec3 n, out vec2 uv, out vec3 T, out vec3 B) {
  if (ax == 0) { float s = n.x >= 0.0 ? 1.0 : -1.0; uv = vec2(-s * p.z, p.y); T = vec3(0.0, 0.0, -s); }
  else if (ax == 1) { float s = n.y >= 0.0 ? 1.0 : -1.0; uv = vec2(p.x, -s * p.z); T = vec3(1.0, 0.0, 0.0); }
  else { float s = n.z >= 0.0 ? 1.0 : -1.0; uv = vec2(s * p.x, p.y); T = vec3(s, 0.0, 0.0); }
  T = normalize(T - n * dot(n, T)); B = cross(n, T);
}
${GLSL}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(nkRough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(nkRockN, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= nkAOv; reflectedLight.indirectSpecular *= nkAOv * nkAOv;`);
  };
  mat.customProgramCacheKey = () => `nature-landscape-v15${opts.rockOnly ? '-rock' : ''}${opts.profile || ''}`;
  return mat;
}

const MAP_FRAGMENT = /* glsl */ `
vec3 P = vDkW;
vec3 N0 = normalize(vDkN) * (gl_FrontFacing ? 1.0 : -1.0);
float up = N0.y;
float y = P.y;
float camD = length(P - cameraPosition);
nkFp = max(length(dFdx(P)), length(dFdy(P)));
float tideH = nkSea.x, tideL = nkSea.y;
// --- large-scale variation fields
float m1 = dkFbm3(P * 0.021), m2 = dkFbm3(P * 0.09 + 7.0), m3 = dkVN3(P * 0.45 + 3.0);
// --- strata
float sB = y + nkDip(P.xz);
vec4 bed = nkBed(sB);
// --- zone weights
float bay = exp(-pow((P.z - nkSea.w) / 170.0, 2.0));
float turfLine = 7.0 + 5.0 * m1 - 3.0 * bay + nkLook.w;
float gentle = smoothstep(0.24, 0.52, up + 0.18 * (m2 - 0.5));
float midSlope = smoothstep(0.32, 0.6, up + 0.15 * (m3 - 0.5));
float aboveSpray = smoothstep(turfLine, turfLine + 4.0, y);
// ledges on the face (sky partly hidden by the face above) carry turf only in places
float ledge = 1.0 - smoothstep(0.72, 0.93, vNkAO);
float wTurf = gentle * aboveSpray * (1.0 - ledge * smoothstep(0.35, 0.6, m3 + 0.3 * m2));
float turfBump = 0.0;
float wSoil = midSlope * (1.0 - gentle) * aboveSpray * 0.6;
float wShingle = bay * smoothstep(0.5, 0.8, up) * smoothstep(1.4, 2.6, y + m3) * (1.0 - smoothstep(5.5, 8.0, y));
float wSand = bay * smoothstep(0.55, 0.85, up) * (1.0 - smoothstep(1.6, 2.8, y + m3));
float talusZ = smoothstep(1.0, 2.5, y) * (1.0 - smoothstep(14.0, 22.0, y)) * smoothstep(0.42, 0.72, up) * (1.0 - bay);
float wScree = talusZ * (1.0 - wTurf) * smoothstep(0.25, 0.6, m2 + 0.3);
float wSea = smoothstep(0.55, 0.85, up) * (1.0 - smoothstep(-2.2, -1.0, y)) * (1.0 - bay);
float wRock = 1.0;
// --- rock (always computed: it is the base everything else sits on)
vec4 aR; vec3 nR; float rR;
nkTri(0, P, N0, 1.0, aR, nR, rR);
{
  vec4 a2; vec3 n2; float r2;
  nkTri(0, P.zyx * vec3(1.0, 1.0, -1.0) + 31.0, N0.zyx * vec3(1.0, 1.0, -1.0), 0.27, a2, n2, r2);
  n2 = n2.zyx * vec3(-1.0, 1.0, 1.0);
  float mixw = 0.45;
  aR = mix(aR, a2, mixw); nR = normalize(mix(nR, n2, 0.35)); rR = mix(rR, r2, mixw);
}
// limestone palette per bed: pale grey, cream, buff, blue-grey; detail from the scan's luminance
float lumR = dot(aR.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3 cream = vec3(0.58, 0.55, 0.47), pgrey = vec3(0.52, 0.52, 0.50), buff = vec3(0.57, 0.50, 0.40), bgrey = vec3(0.44, 0.47, 0.48);
float t = bed.r;
#ifdef NK_BASALT
// stacked lava flows: dark grey-brown basalt, paler weathered tops, red-brown bole between flows
vec3 bedC = mix(vec3(0.15, 0.14, 0.13), vec3(0.24, 0.22, 0.2), t) * (0.85 + 0.3 * m1);
vec3 rock = bedC * pow(lumR / 0.58, 1.25);
rock = mix(rock, vec3(0.33, 0.17, 0.1) * (0.7 + 0.6 * lumR), bed.a * 0.85);
#else
vec3 bedC = t < 0.35 ? mix(pgrey, cream, t / 0.35) : t < 0.7 ? mix(cream, bgrey, (t - 0.35) / 0.35) : mix(bgrey, buff, (t - 0.7) / 0.3);
bedC = mix(bedC, pgrey, 0.25 + 0.2 * m1);
// (the scan's luminance compressed: its dark veins and creases at full contrast read as marble or
// crumpled paper on a pale limestone)
vec3 rock = bedC * pow(lumR / 0.58, 0.8) * mix(vec3(1.0), aR.rgb / max(lumR, 0.05), 0.15);
// thin shaly partings: darker, browner
rock = mix(rock, rock * vec3(0.55, 0.52, 0.48), bed.a * 0.8);
#endif
// macro variation (sun-bleached faces, stains)
rock *= 0.92 + 0.22 * m1 + 0.1 * (m2 - 0.5);
// bedding bump: the face steps back where the recess grows upward
{
  float r0 = nkBed(sB - 0.1).b, r1 = nkBed(sB + 0.1).b;
  float dR = (r1 - r0) * 4.0 / 0.2;
  vec3 hz = normalize(vec3(N0.x, 0.0, N0.z) + 1e-4);
  float vert = 1.0 - abs(up);
  nR = normalize(nR + vec3(0.0, 1.0, 0.0) * clamp(dR, -2.0, 2.0) * 0.45 * vert);
}
// --- weathering of the rock by height above the sea
float hS = y - tideH;
float expoN = 0.6 + 0.8 * m1;
// wet rock (intertidal) and damp spray zone
float wet = 1.0 - smoothstep(-0.2, 0.7, hS + 0.3 * m3);
float damp = 1.0 - smoothstep(0.5, 4.0 * expoN, hS);
// black lichen band just above high water
float blackTop = 2.2 + 3.2 * expoN + 1.2 * (m2 - 0.5);
float blk = smoothstep(-0.6, 0.3, hS) * (1.0 - smoothstep(blackTop - 0.6, blackTop + 0.5, hS));
blk *= smoothstep(0.25, 0.55, m3 + 0.25) * nkLook.x;
rock = mix(rock, vec3(0.045, 0.045, 0.04) * (0.8 + 0.4 * m3), blk * 0.88);
// orange / yellow lichens in the splash zone: rosettes and speckle clustered in zones (seen from
// afar only as a warm cast), grey-white crustose lichen and moss higher up
{
  float zone = smoothstep(blackTop - 1.0, blackTop + 1.5, hS) * (1.0 - smoothstep(12.0, 24.0, hS));
  float cluster = smoothstep(0.42, 0.62, dkFbm3(P * 0.28 + 11.0) + 0.2 * up);
  float spots = smoothstep(0.6, 0.7, nkN3(P, 11.0)) + 0.6 * smoothstep(0.62, 0.7, nkN3(P + 0.111, 27.0));
  float far = smoothstep(25.0, 120.0, camD);
  float amt = zone * cluster * mix(clamp(spots, 0.0, 1.0), 0.33, far) * nkLook.x;
  vec3 lich = mix(vec3(0.78, 0.45, 0.08), vec3(0.82, 0.66, 0.2), m3) * (0.6 + 0.5 * lumR);
  rock = mix(rock, lich, amt * 0.45);
  float hi = smoothstep(7.0, 16.0, hS);
  float gspots = smoothstep(0.55, 0.66, nkN3(P + 0.34, 5.0));
  float grey = hi * smoothstep(0.45, 0.65, dkFbm3(P * 0.22 + 5.0)) * mix(gspots, 0.4, far) * nkLook.x;
  rock = mix(rock, vec3(0.72, 0.72, 0.68) * (0.85 + 0.3 * lumR), grey * 0.5);
  float moss = hi * smoothstep(0.62, 0.8, dkFbm3(P * 0.35 + 23.0) + 0.45 * vNkCav + 0.25 * max(up, 0.0)) * (0.5 + 0.5 * smoothstep(0.0, -0.8, N0.z));
  rock = mix(rock, vec3(0.07, 0.09, 0.035), moss * 0.6);
}
// rain streaks down the faces, seeps below shaly beds, whitewash under the seabird ledges
{
  float vert = smoothstep(0.85, 0.3, abs(up));
  vec2 tg = normalize(vec2(-N0.z, N0.x) + 1e-4);
  float u = dot(P.xz, tg);
  float st = smoothstep(0.55, 0.85, dkVN2(vec2(u * 0.8, y * 0.045))) * mix(0.5, smoothstep(0.35, 0.8, dkVN2(vec2(u * 2.7, y * 0.11 + 3.0))), nkAA(2.7));
  rock *= 1.0 - vert * st * 0.45 * nkLook.y;
  float seep = smoothstep(0.25, 0.75, dkVN2(vec2(u * 0.35, sB * 0.6))) * smoothstep(0.6, 0.2, bed.g) * vert;
  rock = mix(rock, rock * vec3(0.42, 0.46, 0.38), seep * 0.5 * nkLook.y * (1.0 - damp));
  float col = exp(-dot(P.xz - nkPoint.xy, P.xz - nkPoint.xy) / (nkPoint.z * nkPoint.z));
  float gu = col * smoothstep(5.0, 9.0, hS) * (1.0 - smoothstep(30.0, 45.0, hS)) * smoothstep(0.6, 0.85, dkVN2(vec2(u * 1.7, y * 0.07 + 1.0)));
  // on ledges and stack tops: splashes and crusts in patches, never a white cap like snow
  float spl = smoothstep(0.45, 0.75, nkN3(P + 3.08, 1.3)) * smoothstep(0.55, 0.8, m3);
  gu = max(gu, col * smoothstep(0.75, 1.0, up) * smoothstep(5.0, 8.0, hS) * spl * 0.55);
  rock = mix(rock, vec3(0.8, 0.8, 0.76), gu * 0.65 * nkLook.z);
}
// intertidal: barnacles, wrack weed, green algae; wet darkening
{
  float inter = smoothstep(tideL - 0.5, tideL + 0.3, y) * (1.0 - smoothstep(tideH - 0.3, tideH + 0.4, y));
  float fineFade = 1.0 - smoothstep(20.0, 80.0, camD);
  float barn = inter * smoothstep(0.45, 0.7, nkN3(P, 6.0)) * smoothstep(0.3, 0.6, m3 + 0.2);
  rock = mix(rock, vec3(0.62, 0.62, 0.58), barn * mix(0.3, 0.65, fineFade));
  float wrack = smoothstep(tideL - 0.8, tideL, y) * (1.0 - smoothstep(0.2, 1.1, y + 0.6 * (m2 - 0.5))) * smoothstep(-0.2, 0.5, up + 0.4) * smoothstep(0.35, 0.6, m2 + 0.25 * m3);
  rock = mix(rock, vec3(0.09, 0.075, 0.03) * (0.7 + 0.6 * m3), wrack * 0.92);
  float alg = inter * smoothstep(0.65, 0.85, up) * smoothstep(0.62, 0.78, dkFbm3(P * 0.5 + 9.0));
  rock = mix(rock, vec3(0.13, 0.30, 0.06), alg * 0.8);
}
rock *= mix(1.0, 0.82, vNkCav);                // grime in the crevices
// rock that is not a sheer wall, above the spray (the lip under the turf, steps in the head slope,
// pavement, outcrops in the turf) holds soil, lichen and moss: it weathers to a dull mid grey, never
// the fresh cream of a new rockfall scar
{
  float lie = smoothstep(0.22, 0.6, up) * smoothstep(10.0, 18.0, hS);
  vec3 grey = rock * vec3(0.56, 0.58, 0.54) + vec3(0.012, 0.016, 0.006) * (0.6 + 0.8 * m3);
  rock = mix(rock, grey, lie * (0.75 + 0.25 * m2));
}
// --- other layers (top projection), height-blended over the rock
vec3 col = rock; vec3 nrm = nR; float rgh = mix(rR * 0.95 + 0.05, 0.85, 0.3);
float hRock = aR.a;
float wsum = 0.0;
// turf / soil / shingle / sand / scree / sea bed
#ifndef NK_ROCK_ONLY
if (wTurf + wSoil + wShingle + wSand + wScree + wSea > 0.01) {
  vec4 a; vec3 n; float r;
  vec3 acc = vec3(0.0); vec3 nacc = vec3(0.0); float racc = 0.0; float wacc = 0.0;
  if (wTurf > 0.01) {
    vec4 a2; vec3 n2; float r2;
    // slopes (head slopes, banks) take the turf triplanar: a top projection smears down the fall line
    nkGround(1, P, N0, 1.0, a, n, r); nkGround(7, P + 17.0, N0, 0.8, a2, n2, r2);
    float dry = smoothstep(0.35, 0.75, m1 + 0.3 * m2);
    vec3 c = mix(a.rgb * vec3(0.52, 0.6, 0.36), a2.rgb * vec3(0.62, 0.6, 0.42), dry * 0.55);
    c *= 0.75 + 0.4 * m2;
    c = mix(c, c * vec3(0.8, 0.9, 0.7), smoothstep(0.55, 0.8, dkFbm3(P * 0.05 + 2.0)));
    // mottling at the scales of tussocks, grazing and soil depth: what keeps turf from reading as felt
    float mt = nkN3(P + 1.875, 1.6) * 0.35 + nkN3(P + 21.4, 0.42) * 0.4 + dkVN3(P * 0.11 + 1.0) * 0.25;
    c *= 0.62 + 0.75 * mt;
    // tussock scale (0.2-0.6 m): tufts and the shadowed gaps between them; dead straw in the tops;
    // what still reads at 5-10 cm a pixel, where the photo texture has averaged out to felt
    float fadeT = 1.0 - smoothstep(150.0, 600.0, camD);
    float tu = nkN3(P + 0.42, 3.1) * 0.6 + nkN3(P + 0.56, 7.3) * 0.4;
    c *= mix(1.0, 0.72 + 0.5 * smoothstep(0.25, 0.75, tu), fadeT);
    float straw = smoothstep(0.58, 0.82, nkN3(P + 8.56, 0.9) * 0.6 + tu * 0.4) * smoothstep(0.35, 0.65, m2);
    c = mix(c, vec3(0.36, 0.33, 0.2) * (0.8 + 0.4 * tu), straw * 0.35);
    // the green is a muted olive, not a lawn
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.18);
    c = mix(c, c * vec3(1.25, 1.12, 0.7), smoothstep(0.62, 0.8, dkVN2(P.xz * 0.06 + 5.0)) * 0.6);   // sun-scorched thin soil
    turfBump = 1.0;
    vec4 cov = nkHasCover > 0.5 ? texture2D(nkCover, (P.xz - nkCoverXf.xy) * nkCoverXf.zw) : vec4(0.0);
    float heath = nkHasCover > 0.5 ? cov.r : smoothstep(0.52, 0.66, dkFbm3(vec3(P.x, 0.0, P.z) * 0.008 + 4.0) + 0.15 * m2);
    // the ground under gorse and scrub (litter, shade) and under bracken (last year's fronds)
    c = mix(c, c * vec3(0.55, 0.5, 0.42), max(cov.g, cov.a) * 0.7);
    c = mix(c, vec3(0.2, 0.14, 0.06) * (0.8 + 0.4 * m3), cov.b * 0.45);
    if (heath > 0.01) {
      vec4 a3; vec3 n3; float r3;
      nkGround(8, P + 9.0, N0, 1.0, a3, n3, r3);
      c = mix(c, a3.rgb * vec3(0.5, 0.46, 0.3) * (0.8 + 0.4 * m3) + vec3(0.012, 0.016, 0.004), heath * 0.85);
    }
    float w = wTurf * (1.0 + (a.a - 0.5) * 0.6);
    acc += c * w; nacc += normalize(mix(n, n2, 0.5)) * w; racc += 0.92 * w; wacc += w;
  }
  if (wSoil > 0.01) {
    nkGround(2, P, N0, 1.0, a, n, r);
    vec4 a2; vec3 n2; float r2;
    nkGround(3, P + 5.0, N0, 1.0, a2, n2, r2);
    vec3 c = mix(a.rgb * vec3(0.62, 0.68, 0.5), a2.rgb * vec3(0.55, 0.5, 0.42), smoothstep(0.55, 0.8, m3) * 0.6);
    float w = wSoil * (1.0 + (a.a - 0.5));
    acc += c * w; nacc += n * w; racc += 0.9 * w; wacc += w;
  }
  if (wShingle > 0.01) {
    nkGround(5, P, N0, 1.4, a, n, r);
    float w = wShingle * (1.0 + (a.a - 0.5) * 1.5);
    acc += a.rgb * vec3(0.95, 0.95, 0.92) * w; nacc += n * w; racc += r * w; wacc += w;
  }
  if (wSand > 0.01) {
    nkGround(4, P, N0, 1.0, a, n, r);
    float wetS = 1.0 - smoothstep(-0.4, 1.4, y);
    vec3 c = a.rgb * mix(vec3(1.0), vec3(0.62, 0.6, 0.55), wetS);
    float w = wSand;
    acc += c * w; nacc += n * w; racc += mix(r, 0.25, wetS) * w; wacc += w;
  }
  if (wScree > 0.01) {
    nkGround(6, P, N0, 1.0, a, n, r);
    float w = wScree * (1.0 + (a.a - 0.5) * 1.2);
    acc += a.rgb * vec3(1.02, 1.0, 0.95) * w; nacc += n * w; racc += r * w; wacc += w;
  }
  if (wSea > 0.01) {
    nkGround(4, P, N0, 0.7, a, n, r);
    vec3 c = mix(a.rgb * 0.75, vec3(0.10, 0.09, 0.04), smoothstep(0.5, 0.7, m2) * 0.8);
    float w = wSea;
    acc += c * w; nacc += n * w; racc += 0.6 * w; wacc += w;
  }
  // height blend against the rock: crisp, natural edges (rock knobs poke through turf, pebbles crown)
  float cover = clamp(wacc, 0.0, 1.0);
  float hb = smoothstep(0.0, 1.0, clamp((cover - 0.5) * 2.2 + 0.5 + (0.5 - hRock) * 0.8, 0.0, 1.0));
  if (wacc > 0.0) {
    col = mix(col, acc / wacc, hb);
    nrm = normalize(mix(nrm, nacc / wacc, hb));
    rgh = mix(rgh, racc / wacc, hb);
  }
}
#endif
// tussocks and hummocks in the turf: a procedural bump the photo texture is too fine to give at range
#ifndef NK_ROCK_ONLY
if (turfBump > 0.0) {
  float e = 0.35;
  float h0 = dkFbm3(vec3(P.x, 0.0, P.z) * 0.55), hx = dkFbm3(vec3(P.x + e, 0.0, P.z) * 0.55), hz = dkFbm3(vec3(P.x, 0.0, P.z + e) * 0.55);
  float h1 = dkVN2(P.xz * 2.2), h1x = dkVN2((P.xz + vec2(e, 0.0)) * 2.2), h1z = dkVN2((P.xz + vec2(0.0, e)) * 2.2);
  vec3 bump = vec3(-(hx - h0) - 0.35 * nkAA(2.2) * (h1x - h1), 0.0, -(hz - h0) - 0.35 * nkAA(2.2) * (h1z - h1)) / e * 0.45 * mix(0.4, 1.0, nkAA(0.55));
  nrm = normalize(nrm + bump * smoothstep(0.6, 0.9, up));
}
#endif
// wetness: dark, glossy
float wetAll = max(wet, damp * 0.35);
col *= mix(1.0, 0.55, wet) * mix(1.0, 0.88, damp * (1.0 - wet));
rgh = mix(rgh, 0.22, wet * 0.85);
nkRockN = nrm;
nkRough = rgh;
nkAOv = mix(1.0, vNkAO, 0.92);
diffuseColor.rgb *= col;
`;
