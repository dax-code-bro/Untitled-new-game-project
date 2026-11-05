// Procedural buildings: downtown towers, offices, brick blocks, warehouses,
// town houses, lake houses, farms and cabins. One facade shader draws the
// windows (lit at night) so thousands of buildings cost only a few draw calls.
import { createFacades } from './facades.js';
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

// Facade shaders. Buildings are drawn in three groups so each shader stays
// within the 16 textures a GPU lets one shader read:
//   'tower'   glass towers and offices (photographed facades)
//   'masonry' brick blocks and shops (two brick walls, stucco)
//   'frame'   houses and warehouses (painted lap siding, corrugated and rusty steel)
// Every window in all three is a room: the view ray goes through the glass into
// a box behind it (walls, floor, ceiling, a doorway, furniture, pictures, blinds
// or curtains), lit by daylight from the window or by its own lamp at night.
const ROOM_GLSL = /* glsl */ `
vec3 sbRoom(vec3 V, vec3 n, vec3 tng, vec2 f, vec2 cell, float depth, float h, float lit, vec3 lamp, float dayK, float shop){
  vec3 d = vec3(dot(V, tng) / cell.x, V.y / cell.y, max(dot(V, -n), 0.05) / depth);
  vec3 p = vec3(f, 0.0);
  vec3 tb = (step(0.0, d) - p) / d;
  float t = min(min(tb.x, tb.y), tb.z);
  vec3 q = clamp(p + d * t, 0.0, 1.0);
  // the room's colours (one per room)
  vec3 wc = mix(vec3(0.78, 0.74, 0.66), vec3(0.62, 0.7, 0.74), step(0.55, fract(h * 7.3)));
  wc = mix(wc, vec3(0.86, 0.84, 0.8), step(0.7, fract(h * 13.1)));
  wc = mix(wc, vec3(0.72, 0.62, 0.52), step(0.88, fract(h * 3.7)));
  vec3 fc = mix(vec3(0.36, 0.24, 0.15), vec3(0.42, 0.4, 0.38), step(0.5, fract(h * 5.9)));
  // shops: painted or panelled walls in muted colours, a dark polished floor (not white boxes)
  if (shop > 0.5) { wc = mix(vec3(0.58, 0.55, 0.5), vec3(0.42, 0.47, 0.5), step(0.5, fract(h * 4.1))); wc = mix(wc, vec3(0.5, 0.36, 0.26), step(0.75, fract(h * 6.7))); fc = mix(vec3(0.24, 0.22, 0.2), vec3(0.36, 0.3, 0.24), step(0.5, fract(h * 2.9))); }
  vec3 c; float face;
  if (t == tb.z) {            // back wall
    c = wc; face = 0.0;
    float fx = fract(h * 17.0) * 0.4 + 0.1;
    if (shop > 0.5) {         // shelves full of stock along the back wall
      // shelves: boards every quarter of the height, rows of boxes and bottles in many colours
      float row = floor(q.y * 4.0), board = 1.0 - step(0.1, fract(q.y * 4.0));
      vec2 bid = vec2(floor(q.x * 22.0), row);
      float bh = fract(sin(dot(bid + h, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 stock = 0.5 + 0.45 * cos(6.2832 * (bh + vec3(0.0, 0.33, 0.67)));
      stock *= 0.55 + 0.45 * step(fract(q.y * 4.0), 0.55 + 0.35 * bh); // boxes of different heights
      float gap = step(0.08, fract(q.x * 22.0));
      c = q.y < 0.85 ? mix(vec3(0.14), stock * 0.8, gap * (1.0 - board)) : wc * 0.9;
      c = mix(c, vec3(0.62, 0.6, 0.56), board * step(q.y, 0.85));
    } else {
      if (q.y < 0.3 && q.x > fx && q.x < fx + 0.45) c = mix(vec3(0.16, 0.13, 0.12), vec3(0.3, 0.22, 0.18), step(0.5, fract(h * 23.0))) * (q.y > 0.22 ? 1.25 : 1.0);
      if (q.y > 0.48 && q.y < 0.7 && q.x > 0.58 && q.x < 0.8) c = (q.x > 0.6 && q.x < 0.78 && q.y > 0.5 && q.y < 0.68) ? mix(vec3(0.2, 0.3, 0.45), vec3(0.6, 0.4, 0.2), fract(h * 31.0)) : vec3(0.15, 0.1, 0.06);
    }
  } else if (t == tb.y) {     // floor or ceiling
    if (d.y < 0.0) { c = fc * (0.85 + 0.15 * step(0.5, fract(q.x * 9.0))); face = 1.0; }
    else { c = shop > 0.5 ? vec3(0.5, 0.5, 0.48) : vec3(0.9, 0.89, 0.86); face = 2.0;
      float l = length((q.xz - vec2(0.5, 0.45)) * vec2(1.0, 1.4));
      c += lamp * lit * smoothstep(0.12, 0.0, l) * 1.4; }
  } else {                    // side walls, one with a doorway into the hall
    c = wc * 0.88; face = 3.0;
    if (shop < 0.5 && q.z > 0.5 && q.z < 0.78 && q.y < 0.72 && step(0.5, fract(h * 9.0)) > 0.5 == (d.x > 0.0)) c = vec3(0.08, 0.07, 0.07);
  }
  // light: daylight falls off away from the window; at night, the lamp or darkness
  float day = dayK * mix(0.62, 0.2, q.z) * (face == 2.0 ? 0.55 : 1.0) * (face == 1.0 ? 1.15 : 1.0);
  float night = lit * (0.55 + 0.45 * (1.0 - length(q - vec3(0.5, 0.95, 0.45)) * 0.8));
  vec3 rad = c * (day + lamp * night * 0.3) + c * 0.004;
  return rad;
}
`;

function makeFacadeMaterial(surf, group = 'tower') {
  const real = surf && surf.glass.real ? 1 : 0;
  const S = (k) => (surf ? surf[k].size : 3).toFixed(2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.fragmentShader = 'uniform float uWet;\n' + shader.fragmentShader;
    const T = (k, m) => ({ value: surf ? surf[k][m] : null });
    const tex = {
      tower: { tGlassC: T('glass', 'color'), tGlassN: T('glass', 'normal'), tGlassR: T('glass', 'rough'), tGlassM: T('glass', 'metal'), tGlassE: T('glass', 'emit'), tOffC: T('office', 'color'), tOffN: T('office', 'normal'), tOffE: T('office', 'emit'), tConC: T('concrete', 'color') },
      masonry: { tRbC: T('redbrick', 'color'), tRbN: T('redbrick', 'normal'), tRbH: T('redbrick', 'height'), tRbA: T('redbrick', 'ao'), tBrickC: T('bricks', 'color'), tBrickN: T('bricks', 'normal'), tStC: T('stucco', 'color'), tStN: T('stucco', 'normal'), tConC: T('concrete', 'color') },
      frame: { tSdC: T('siding', 'color'), tSdN: T('siding', 'normal'), tSdH: T('siding', 'height'), tSdA: T('siding', 'ao'), tStlC: T('steel', 'color'), tStlN: T('steel', 'normal'), tRuC: T('rusty', 'color'), tRuN: T('rusty', 'normal'), tConC: T('concrete', 'color') },
    }[group];
    Object.assign(shader.uniforms, tex);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec3 vWPos; varying vec3 vWNrm; flat varying vec4 vInfo; varying vec3 vSize; varying float vTopY;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vInfo = aInfo;
mat4 sbIM = modelMatrix * instanceMatrix;
vWPos = (sbIM * vec4(transformed,1.0)).xyz;
vWNrm = normalize(mat3(sbIM) * objectNormal);
vSize = vec3(length(sbIM[0].xyz), length(sbIM[1].xyz), length(sbIM[2].xyz));
vTopY = sbIM[3].y + vSize.y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; flat varying vec4 vInfo; varying vec3 vSize; varying float vTopY;
uniform float uNight;
uniform sampler2D ${Object.keys(tex).join(', ')};
${GLSL_NOISE}
${ROOM_GLSL}
float sbRough; float sbMetal; vec3 sbEmit; vec3 sbNt; vec3 sbT; float sbAO; float sbWinK = 0.0;
// parallax: shift the texture lookup along the view by the surface height (bricks stand proud of the mortar)
vec2 sbPara(sampler2D hm, vec2 uv, vec3 vt, float depth){ float hh = texture2D(hm, uv).r; return uv + vt.xy / max(vt.z, 0.35) * (hh - 0.5) * depth; }
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float style = vInfo.x; float baseY = vInfo.y; float seed = vInfo.z;
  vec3 base = diffuseColor.rgb;
  vec3 n = normalize(vWNrm);
  sbRough = 0.85; sbMetal = 0.0; sbEmit = vec3(0.0); sbNt = vec3(0.0, 0.0, 1.0); sbAO = 1.0;
  sbT = abs(n.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  bool useTex = ${real}.0 > 0.5;
  vec3 Vc = normalize(cameraPosition - vWPos);
  // view direction in the wall's tangent space (for parallax)
  vec3 vt = vec3(dot(Vc, sbT), Vc.y, dot(Vc, n));
  if (n.y > 0.5) {
    vec3 con = useTex ? texture2D(tConC, vWPos.xz / ${S('concrete')}).rgb : vec3(0.5);
    diffuseColor.rgb = (style > 3.5 && style < 4.5) ? base * (0.7 + 0.4 * con.r) : con * vec3(0.42, 0.41, 0.4);
    sbRough = 0.92;
  } else if (n.y < -0.5) {
    diffuseColor.rgb = base * 0.3;
  } else {
    float u = abs(n.x) > 0.5 ? vWPos.z : vWPos.x;
    float v = vWPos.y - baseY;
    vec2 uvm = vec2(u, v);
    // shops on the ground floor, on walls that face a street (not up on a setback, not on an alley)
    float wbit = n.z > 0.5 ? 0.0 : n.z < -0.5 ? 1.0 : n.x > 0.5 ? 2.0 : 3.0;
    bool streetWall = mod(floor(floor(vInfo.w / 2.0) / pow(2.0, wbit) + 0.001), 2.0) > 0.5;
    bool shop = (style < 2.5 || style > 4.5) && v < 4.4 && v > 0.25 && mod(vInfo.w, 2.0) < 0.5 && streetWall;
    bool done = false;
${group === 'tower' ? `
    if (useTex && style < 0.5 && !shop) {
      vec2 uv = uvm / vec2(${S('glass')}, ${S('glass')} * 1.2);
      // the photo has some offices lit (warm squares); by day those are dark glass like the rest
      vec3 ge = texture2D(tGlassE, uv).rgb;
      vec3 gc = texture2D(tGlassC, uv).rgb;
      // the photo's cream blinds read as lights left on in broad daylight: make them grey blinds
      float gl = dot(gc, vec3(0.299, 0.587, 0.114));
      gc = mix(gc, vec3(gl * 0.72), smoothstep(0.28, 0.5, gl) * clamp((gc.r - gc.b) * 5.0, 0.0, 1.0) * 0.9);
      diffuseColor.rgb = mix(gc, vec3(0.09, 0.115, 0.14), clamp(dot(ge, vec3(0.333)) * 1.6, 0.0, 0.9) * (1.0 - uNight));
      sbRough = texture2D(tGlassR, uv).g;
      sbMetal = texture2D(tGlassM, uv).g;
      sbNt = texture2D(tGlassN, uv).xyz * 2.0 - 1.0;
      // lit offices at night: warm lamps or cool fluorescent tubes, never paper-white
      vec3 offTint = mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.88, 1.0), step(0.55, fract(sin(dot(floor(uv * 6.0) + seed, vec2(12.99, 78.23))) * 43758.5)));
      sbEmit = ge * offTint * uNight * 0.85;
      done = true;
    } else if (useTex && style < 1.5 && !shop) {
      vec2 uv = uvm / ${S('office')} + vec2(seed * 0.37, 0.0);
      vec3 oc = texture2D(tOffC, uv).rgb;
      vec3 oe = texture2D(tOffE, uv).rgb;
      float litW = clamp(dot(oe, vec3(0.333)) * 1.6, 0.0, 0.9);
      // offices the photo shows lit read as dark glass by day; their lamps come on at dusk
      oc = mix(oc, vec3(0.1, 0.12, 0.14), litW * (1.0 - uNight));
      float ol = dot(oc, vec3(0.299, 0.587, 0.114));
      oc = mix(oc, vec3(ol * 0.72), smoothstep(0.28, 0.5, ol) * clamp((oc.r - oc.b) * 5.0, 0.0, 1.0) * 0.9); // cream blinds -> grey
      float detail = dot(texture2D(tConC, uvm / ${S('concrete')}).rgb, vec3(0.333));
      diffuseColor.rgb = oc * (0.85 + 0.3 * detail);
      sbRough = mix(0.55, 0.12, litW);
      sbNt = texture2D(tOffN, uv).xyz * 2.0 - 1.0;
      vec3 offTint = mix(vec3(1.0, 0.82, 0.6), vec3(0.8, 0.88, 1.0), step(0.55, fract(sin(dot(floor(uv * 6.0) + seed, vec2(12.99, 78.23))) * 43758.5)));
      sbEmit = oe * offTint * uNight * 1.3;
      done = true;
    }` : ''}
    if (!done) {
      // the wall itself
      vec3 wall = base;
${group === 'masonry' ? `
      if (useTex && style > 1.5 && style < 2.5) {
        // brick: two kinds of brick, chosen per building, with real depth in the mortar joints
        if (fract(seed * 3.7) < 0.55) {
          vec2 uv = sbPara(tRbH, uvm / ${S('redbrick')}, vt, 0.035);
          wall = texture2D(tRbC, uv).rgb * mix(vec3(1.0), base * 1.8, 0.25);
          sbNt = texture2D(tRbN, uv).xyz * 2.0 - 1.0; sbAO = texture2D(tRbA, uv).r;
        } else {
          vec2 uv = uvm / ${S('bricks')};
          wall = texture2D(tBrickC, uv).rgb * mix(vec3(1.0), base * 1.8, 0.35);
          sbNt = texture2D(tBrickN, uv).xyz * 2.0 - 1.0;
        }
        sbRough = 0.88;
      } else if (useTex) {
        // stucco, painted the building's colour
        vec2 uv = uvm / ${S('stucco')};
        float st = dot(texture2D(tStC, uv).rgb, vec3(0.333));
        wall = base * (0.62 + 0.62 * st);
        sbNt = texture2D(tStN, uv).xyz * 2.0 - 1.0; sbRough = 0.9;
      }` : ''}
${group === 'frame' ? `
      if (useTex && style > 3.5 && style < 4.5) {
        // painted lap siding: the boards' grain and shadow lines through the paint
        vec2 uv = sbPara(tSdH, uvm / ${S('siding')}, vt, 0.03);
        float sd = dot(texture2D(tSdC, uv).rgb, vec3(0.333));
        wall = base * (0.58 + 0.7 * sd);
        sbNt = texture2D(tSdN, uv).xyz * 2.0 - 1.0; sbAO = texture2D(tSdA, uv).r; sbRough = 0.82;
      } else if (useTex) {
        // corrugated steel sheds: painted, or rusting through
        vec2 uv = uvm / ${S('steel')};
        if (fract(seed * 5.3) < 0.35) { wall = texture2D(tRuC, uv).rgb; sbNt = texture2D(tRuN, uv).xyz * 2.0 - 1.0; sbRough = 0.8; sbMetal = 0.2; }
        else { wall = texture2D(tStlC, uv).rgb * base * 1.7; sbNt = texture2D(tStlN, uv).xyz * 2.0 - 1.0; sbRough = 0.55; sbMetal = 0.45; }
      }` : ''}
      // below the ground floor on the downhill side: a poured-concrete foundation, not siding or brick
      if (v < 0.02) {
        float fn = fract(sin(dot(floor(vec2(u * 0.8, v * 2.0)), vec2(12.99, 78.23))) * 43758.55);
        wall = vec3(0.52, 0.51, 0.48) * (0.88 + 0.12 * fn) * (0.8 + 0.2 * smoothstep(-2.0, 0.0, v));
        sbNt = vec3(0.0, 0.0, 1.0); sbRough = 0.95; sbMetal = 0.0;
      }
      // windows: each one a room
      vec2 cellSz = style < 2.5 ? vec2(3.2, 3.4) : style < 3.5 ? vec2(9.0, 6.0) : style < 4.5 ? vec2(3.6, 3.0) : vec2(4.0, 4.0);
      vec2 winSz  = style < 2.5 ? vec2(0.42, 0.5) : style < 3.5 ? vec2(0.3, 0.18) : style < 4.5 ? vec2(0.32, 0.42) : vec2(0.75, 0.55);
      vec2 g = vec2(u, v - (style < 3.5 ? 1.0 : 0.6)) / cellSz;
      vec2 cid = floor(g); vec2 f = fract(g);
      vec2 d = abs(f - 0.5) - winSz * 0.5;
      float isWin = step(max(d.x, d.y), 0.0) * step(0.0, g.y) * step(v, vTopY - baseY - 0.8);
      float frame = isWin * (1.0 - step(max(d.x, d.y), -0.03));
      float h = sbHash(cid + seed * 13.1);
      // a mullion down the middle of some windows, a transom across others
      if (!shop && h > 0.45) frame = max(frame, isWin * step(abs(f.x - 0.5), 0.012));
      if (!shop && h < 0.25) frame = max(frame, isWin * step(abs(f.y - 0.5 - winSz.y * 0.2), 0.012));
      float shopId = floor(u / 6.0);
      vec2 rf = f, rcell = cellSz; float rdepth = cellSz.x * 1.1;
      if (shop) {
        float sf = fract(u / 6.0);
        isWin = step(0.06, sf) * step(sf, 0.94) * step(v, 3.7);
        float mull = step(abs(fract(u / 1.5) - 0.5), 0.02) + step(abs(v - 2.9), 0.04);
        frame = isWin * clamp(mull, 0.0, 1.0);
        rf = vec2(sf, clamp(v / 4.0, 0.0, 1.0)); rcell = vec2(6.0, 4.0); rdepth = 9.0; h = sbHash(vec2(shopId, seed));
      }
      // too fine to draw: the upper-floor window grid far off. A shopfront's 6 m bays only go when
      // they're tiny on screen, and then as dark glass, not as the wall colour
      float aliasFade = shop ? smoothstep(0.4, 0.9, max(fwidth(u / 6.0), fwidth(v / 4.0))) : smoothstep(0.25, 0.6, max(fwidth(g.x), fwidth(g.y)));
      float lit = step(0.72, sbHash(cid * 1.7 + seed));
      vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.8, sbHash(cid + 3.3)));
      if (shop) { lit = step(0.35, h); warm = mix(vec3(1.0, 0.86, 0.66), vec3(0.88, 0.93, 1.0), step(0.6, h)); }
      // the room behind the glass
      // by day a room seen through glass is far darker than the sunlit street outside it (the old
      // levels made every shop window read as a pale panel)
      vec3 room = sbRoom(-Vc, n, sbT * (abs(n.x) > 0.5 ? 1.0 : 1.0), rf, rcell, rdepth, h, lit * uNight + (shop ? 0.08 * (1.0 - uNight) * lit : 0.0), warm, (1.0 - uNight) * (shop ? 0.06 : 0.16), shop ? 1.0 : 0.0);
      // blinds or curtains in some windows (drawn at the glass)
      vec2 wl = (f - 0.5) / winSz + 0.5;
      float blind = 0.0, curtain = 0.0;
      if (!shop) {
        float bh = sbHash(cid * 3.1 + seed); 
        if (bh > 0.55) blind = step(1.0 - (bh - 0.55) * 1.6, wl.y);
        else if (bh < 0.22) curtain = step(wl.x, 0.16 + bh * 0.4) + step(1.0 - 0.16 - bh * 0.4, wl.x);
      }
      vec3 blindC = mix(vec3(0.82, 0.8, 0.74), vec3(0.75, 0.78, 0.8), step(0.5, fract(h * 11.0))) * (0.85 + 0.15 * step(0.5, fract(wl.y * 28.0)));
      vec3 curtC = mix(vec3(0.55, 0.18, 0.15), vec3(0.3, 0.38, 0.5), step(0.5, fract(h * 19.0)));
      float cover = clamp(blind + curtain, 0.0, 1.0);
      vec3 coverC = blind > 0.5 ? blindC : curtC;
      // Fresnel: edge-on glass shows the sky instead of the room
      float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(Vc, n), 0.0, 1.0), 5.0);
      float winMix = isWin * (1.0 - aliasFade);
      diffuseColor.rgb = mix(wall, vec3(0.02, 0.022, 0.025), winMix);
      diffuseColor.rgb = mix(diffuseColor.rgb, coverC * 0.75, winMix * cover);
      diffuseColor.rgb = mix(diffuseColor.rgb, shop ? vec3(0.12) : vec3(0.78, 0.77, 0.74), frame * (1.0 - aliasFade));
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(wall, vec3(0.05, 0.06, 0.07), shop ? 0.85 : winSz.x * winSz.y * 0.9), aliasFade);
      sbRough = mix(sbRough, mix(0.04, 0.7, cover), isWin);
      sbMetal = mix(sbMetal, 0.0, isWin);
      if (isWin > 0.5) { sbNt = vec3(0.0, 0.0, 1.0); sbAO = 1.0; }
      vec3 roomLight = room * (1.0 - F) * (1.0 - cover) * (1.0 - frame);
      // the glass reflects the street and sky: brighter edge-on, broken into streaks by the panes
      vec3 R = reflect(-Vc, n);
      // what the glass sees: the pavement below, the buildings across the street at eye level, sky above
      float across = 0.65 + 0.7 * sbHash(vec2(floor((u + R.x * 7.0 + R.z * 7.0) / 4.0), seed));
      vec3 streetR = mix(vec3(0.06, 0.06, 0.065), vec3(0.15, 0.145, 0.14) * across, smoothstep(-0.25, 0.02, R.y));
      // down on the street, a ray reflected off a shop window has to climb steeply to clear the
      // buildings across the road: it sees their facades, only rarely sky (the sky made every pane pale)
      vec3 skyR = mix(streetR, vec3(0.42, 0.52, 0.68), shop ? smoothstep(0.6, 0.95, R.y) : smoothstep(0.05, 0.45, R.y + (vWPos.y - baseY) * 0.004)) * (1.0 - uNight * 0.93);
      float streak = 0.85 + 0.15 * sin(u * 3.1 + v * 0.7 + seed);
      roomLight += skyR * ((shop ? 0.14 : 0.06) + F * 0.8) * streak * isWin * (1.0 - cover * 0.6) * (1.0 - frame);
      // lit blinds glow at night
      roomLight += coverC * warm * lit * uNight * cover * 0.12 * (1.0 - frame);
      // far away the window grid is too fine to draw: fall back to an average glow
      vec3 farGlow = warm * winSz.x * winSz.y * 0.16 * uNight * (shop ? 0.5 : 0.8);
      sbEmit = mix(roomLight * isWin, farGlow, aliasFade);
      if (shop) sbEmit *= 0.85;
      // the glass's reflection is drawn above (street, buildings across, sky): the sky probe would
      // otherwise wash every pane out to a flat pale grey when looked at along the street
      sbWinK = isWin * (1.0 - frame) * (1.0 - aliasFade) * (1.0 - cover);
    }
  }
  diffuseColor.rgb *= mix(1.0, sbAO, 0.8);
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
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sbEmit;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectSpecular *= 1.0 - 0.7 * sbWinK;');
  };
  mat.customProgramCacheKey = () => 'sbfacade-' + group;
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
    const cb = collision.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y - 2, y + h, { building: true, surf: ['masonry', 'masonry', 'brick', 'metal', 'frame', 'block'][style] || 'masonry' });
    Object.defineProperty(B[B.length - 1], 'col', { value: cb, enumerable: false, writable: true });
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
      if (!tall && !mid && rnd() < 0.3) props.push({ x: lx, y: top, z: lz, w: 2.6, h: 4, d: 2.6, color: 0x6b4a33, tower: true }); // water tower (drawn round in facades.js)
    }
  }

  // Port: a concrete yard from the last street down to the quay (it was a grass field), then
  // warehouses + container stacks on it
  {
    const x0 = CITY.x0 + 6, x1 = CITY.x0 + CITY.nx * CITY.pitch - 6, z0 = CITY.z0 + CITY.nz * CITY.pitch + 9, z1 = z0 + 69;
    const nx = Math.ceil((x1 - x0) / 4), nz = Math.ceil((z1 - z0) / 4);
    const g = new THREE.PlaneGeometry(1, 1, nx, nz).rotateX(-Math.PI / 2);
    const P = g.attributes.position, U = g.attributes.uv;
    for (let k = 0; k < P.count; k++) {
      const x = x0 + (P.getX(k) + 0.5) * (x1 - x0);
      const z = Math.min(z0 + (P.getZ(k) + 0.5) * (z1 - z0), coastZ(x) - 8);
      P.setXYZ(k, x, hm.height(x, z) + 0.03, z);
      U.setXY(k, x / 5, z / 5);
    }
    g.computeVertexNormals();
    const cm = surf && surf.concrete && surf.concrete.real
      ? new THREE.MeshStandardMaterial({ map: surf.concrete.color, normalMap: surf.concrete.normal || null, color: 0xb9b6ae, roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 0.92 });
    const yard = new THREE.Mesh(g, cm);
    yard.receiveShadow = true; yard.userData.surf = 'concrete';
    scene.add(yard);
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
    props.push({ x: x + 34, y: Math.min(y, hm.height(x + 34, z - 6)) - 0.5, z: z - 6, w: 4.5, h: 14, d: 4.5, color: 0xb9b9b4 }); // silo, standing on its own ground
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
    collision.query(x, z, r, (it) => { if (it.t === 3 && !it.lane) { const d = distToSeg(x, z, it.ax, it.az, it.bx, it.bz).d - it.hw; if (d < best) best = d; } });
    return best;
  };
  const freeLot = (x, z, w, d) => {
    let ok = true;
    collision.query(x, z, Math.max(w, d) + 4, (it) => {
      if (!ok) return;
      if (it.t === 0 && x + w / 2 + 2.5 > it.minX && x - w / 2 - 2.5 < it.maxX && z + d / 2 + 2.5 > it.minZ && z - d / 2 - 2.5 < it.maxZ) ok = false;
      else if (it.t === 3 && !it.lane && distToSeg(x, z, it.ax, it.az, it.bx, it.bz).d < it.hw + Math.max(w, d) / 2 + 2.5) ok = false;
    });
    return ok;
  };
  // older lots read the ground as it was before the outer-neighbourhood streets (same lots as ever)
  const flatAt = (x, z, w, d) => { const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => (hm.heightBase || hm.height).call(hm, x + a * w / 2, z + b * d / 2)); return { y: Math.min(...ys), dy: Math.max(...ys) - Math.min(...ys) }; };
  const flatNow = (x, z, w, d) => { const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => hm.height(x + a * w / 2, z + b * d / 2)); return { y: Math.min(...ys), dy: Math.max(...ys) - Math.min(...ys) }; };
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

  // ---- the outer neighbourhoods (north and east, on the `lane` streets from layout.js):
  // right past the shops on the edge strip, two- to four-storey brick and stucco walk-ups
  // with a corner store; then houses with yards; then the poor end: tired houses, garages,
  // sheds and trailers, junk and chain-link. Its own random stream and appended after
  // everything else, so the rest of the map (and saved homes) is unchanged.
  if (graph) {
    const rr = mulberry32(5150);
    const pk = (a) => a[(rr() * a.length) | 0];
    const cx0 = CITY.x0, cx1 = CITY.x0 + CITY.nx * CITY.pitch, cz0 = CITY.z0, cz1 = CITY.z0 + CITY.nz * CITY.pitch;
    const outOf = (x, z) => Math.max(cx0 - x, x - cx1, cz0 - z, z - cz1);
    // a lot is clear when it overlaps no building box and stays off every road (sampled along the road)
    const lotClear = (x, z, w, d, margin) => {
      let ok = true;
      collision.query(x, z, Math.max(w, d) + 14, (it) => {
        if (!ok) return;
        if (it.t === 0) { if (x + w / 2 + margin > it.minX && x - w / 2 - margin < it.maxX && z + d / 2 + margin > it.minZ && z - d / 2 - margin < it.maxZ) ok = false; return; }
        if (it.t !== 3) return;
        const L = Math.hypot(it.bx - it.ax, it.bz - it.az), n = Math.max(1, Math.ceil(L / 2));
        for (let k = 0; k <= n && ok; k++) {
          const px = it.ax + (it.bx - it.ax) * k / n, pz = it.az + (it.bz - it.az) * k / n;
          const dx = Math.max(Math.abs(px - x) - w / 2, 0), dz = Math.max(Math.abs(pz - z) - d / 2, 0);
          if (Math.hypot(dx, dz) < it.hw + 1.2) ok = false;
        }
      });
      return ok;
    };
    let placed = 0;
    for (const e of graph.edges) {
      if (!e.lane) continue;
      const [ax, az] = e.pts[0], [bx, bz] = e.pts[e.pts.length - 1];
      const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      const alongX = Math.abs(tx) > 0.5; // the street runs east-west: lots face north/south
      for (const side of [-1, 1]) {
        const nx = -tz * side, nz = tx * side;
        let s = 6;
        while (s < L - 6) {
          const px = ax + tx * s, pz = az + tz * s, out = outOf(px, pz);
          const e01 = Math.min(1, Math.max(0, (out - 34) / 190)); // 0 at the edge strip .. 1 far out
          let kind;
          if (out < 34) { s += 8; continue; }                    // the shops' strip along the city edge (they sit within ~28 m)
          if (e01 < 0.25) kind = rr() < 0.75 ? 'walkup' : 'corner';
          else if (e01 < 0.6) kind = rr() < 0.8 ? 'house' : pk(['corner', 'garage', 'house2']);
          else kind = pk(['house', 'house', 'shed', 'trailer', 'garage', 'house']);
          const gapP = e01 < 0.25 ? 0.08 : e01 < 0.6 ? 0.2 : 0.45;      // empty lots get commoner further out
          const dims = {
            walkup: [12 + rr() * 6, 12 + rr() * 4, 7 + rr() * 7, rr() < 0.6 ? 2 : 5],
            corner: [11 + rr() * 4, 10 + rr() * 3, 4.6 + rr() * 1.4, 5],
            house: [8.5 + rr() * 2.5, 8.5 + rr() * 3, rr() < 0.3 ? 6.2 : 3.6, 4],
            house2: [9 + rr() * 2, 10 + rr() * 2, 6.2, 4],
            garage: [7, 7, 3.4, 3], shed: [5, 4, 3, 3], trailer: [12, 4, 3, 4],
          }[kind];
          const [front, deep, h, style] = dims;
          const w = alongX ? front : deep, d = alongX ? deep : front;
          const setback = e.width / 2 + (kind === 'walkup' || kind === 'corner' ? 3.5 : 6 + rr() * 3);
          const x = px + nx * (setback + (alongX ? d : w) / 2), z = pz + nz * (setback + (alongX ? d : w) / 2);
          s += front + (e01 < 0.25 ? 1.5 + rr() * 2 : 4 + rr() * (6 + e01 * 14));
          if (rr() < gapP) { s += 6 + rr() * 10; continue; }
          const f = flatNow(x, z, w, d);
          // walk-ups and corner stores step into the hillside like terraced streets (the uphill wall is buried)
          if (f.dy > (style === 2 || style === 5 ? 4.5 : 2.4) || f.y < hm.waterLevel(x, z) + 0.6 || !lotClear(x, z, w, d, 1.5)) continue;
          const poor = e01 > 0.55;
          const color = poor ? pk(POOR[style] || PALETTES[style]) : pk(PALETTES[style]);
          add(x, z, w, d, h, f.y + 0.05, style, color);
          B[B.length - 1].extra = true;
          placed++;
          if (style === 4 || kind === 'garage' || kind === 'shed') {
            // gable roof with the ridge along the street
            roofs.push({ x, z, w: w + 0.8, d: d + 0.8, h: kind === 'shed' ? 1.4 : 2.2 + rr() * 0.8, y: f.y + 0.05 + h, rot: alongX ? 0 : Math.PI / 2, color: pk([0x3b3b3e, 0x5a3a2c, 0x4d5560, 0x6b4636, 0x2f3a2a]) });
          }
          if (e01 > 0.3) {
            for (let k = 0; k < (poor ? 2 + ((rr() * 3) | 0) : (rr() < 0.4 ? 1 : 0)); k++)
              junk.push({ x: x + (rr() - 0.5) * (w + 6), z: z + (rr() - 0.5) * (d + 6), kind: rr() < 0.5 ? 'trash' : rr() < 0.5 ? 'pile' : 'tyre' });
            if (rr() < (poor ? 0.45 : 0.25)) {
              // a fenced yard behind the house (chain-link out here)
              const yw = w + 6, yd = d + 6, bx2 = x + nx * 3, bz2 = z + nz * 3;
              for (const [fx, fz, sw, sd] of [[bx2, bz2 - yd / 2, yw, 0.06], [bx2, bz2 + yd / 2, yw, 0.06], [bx2 - yw / 2, bz2, 0.06, yd], [bx2 + yw / 2, bz2, 0.06, yd]]) {
                // leave the street side open
                if ((alongX && Math.sign(fz - bz2) === -Math.sign(nz)) || (!alongX && Math.sign(fx - bx2) === -Math.sign(nx))) continue;
                fences.push({ x: fx, y: hm.height(fx, fz), z: fz, w: sw, h: 1.8, d: sd });
              }
            }
          }
        }
      }
    }
    void placed;
  }

  // ---- tidy-up once everything is placed: no house buried to its eaves in a hillside,
  // nothing standing on a road, no two buildings inside each other
  {
    const elevated = (b) => b.y - hm.height(b.x, b.z) > 3;
    const reinsert = (b) => {
      const c = b.col; if (!c) return;
      c.minX = b.x - b.w / 2; c.maxX = b.x + b.w / 2; c.minZ = b.z - b.d / 2; c.maxZ = b.z + b.d / 2; c.y0 = b.y - 2; c.y1 = b.y + b.h;
      collision._insert(c.minX, c.minZ, c.maxX, c.maxZ, c);
    };
    // move a building and whatever sits on it (its roof, rooftop units)
    const shift = (b, dx, dy, dz) => {
      const top = b.y + b.h, on = (o) => Math.abs(o.x - b.x) < b.w / 2 + 0.6 && Math.abs(o.z - b.z) < b.d / 2 + 0.6 && Math.abs(o.y - top) < 0.6;
      for (const r of roofs) if (on(r)) { r.x += dx; r.y += dy; r.z += dz; }
      for (const pr of props) if (on(pr)) { pr.x += dx; pr.y += dy; pr.z += dz; }
      b.x += dx; b.y += dy; b.z += dz;
      reinsert(b);
    };
    const corners = (b) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => hm.height(b.x + a * b.w / 2, b.z + c * b.d / 2));
    const roadUnder = (b) => {
      let seg = null;
      collision.query(b.x, b.z, Math.max(b.w, b.d) + 14, (it) => {
        if (seg || it.t !== 3) return;
        for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const x = b.x + a * b.w / 2, z = b.z + c * b.d / 2;
          if (distToSeg(x, z, it.ax, it.az, it.bx, it.bz).d < it.hw + 0.4) { seg = it; return; }
        }
      });
      return seg;
    };
    const hitsBuilding = (b) => B.some((o) => o !== b && Math.abs(o.x - b.x) < (o.w + b.w) / 2 + 0.5 && Math.abs(o.z - b.z) < (o.d + b.d) / 2 + 0.5 && o.y < b.y + b.h && o.y + o.h > b.y);
    for (const b of B) {
      if (elevated(b)) continue;
      // 1. off the road: step away from it, square to the road
      const seg = roadUnder(b);
      if (seg) {
        const r = distToSeg(b.x, b.z, seg.ax, seg.az, seg.bx, seg.bz);
        const px = seg.ax + (seg.bx - seg.ax) * r.t, pz = seg.az + (seg.bz - seg.az) * r.t;
        let nx = b.x - px, nz = b.z - pz; const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
        const ox = b.x, oz = b.z;
        let moved = false;
        for (let step = 1; step <= 24 && !moved; step++) {
          shift(b, nx, 0, nz);
          if (!roadUnder(b) && !hitsBuilding(b)) moved = true;
        }
        if (!moved) shift(b, ox - b.x, 0, oz - b.z);
        else { const cs = corners(b), lo = Math.min(...cs); shift(b, 0, lo + 0.05 - b.y, 0); }
      }
      // 2. small buildings dug into a slope: lift the uphill side out (a foundation wall shows downhill)
      if (b.h < 9) {
        const cs = corners(b), hi = Math.max(...cs);
        if (hi - b.y > 1.6) shift(b, 0, hi - 0.4 - b.y, 0);
      }
    }
    // 3. overlaps: trim the later building back from the earlier one
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], o = B[j];
      const ox = Math.min(a.x + a.w / 2, o.x + o.w / 2) - Math.max(a.x - a.w / 2, o.x - o.w / 2);
      const oz = Math.min(a.z + a.d / 2, o.z + o.d / 2) - Math.max(a.z - a.d / 2, o.z - o.d / 2);
      const oy = Math.min(a.y + a.h, o.y + o.h) - Math.max(a.y, o.y);
      if (ox <= 0.05 || oz <= 0.05 || oy <= 0.3) continue;
      if (o.y >= a.y + a.h - 0.6 || a.y >= o.y + o.h - 0.6) continue; // one stands on the other (tower setbacks)
      const cut = Math.min(ox, oz) + 0.5, alongX = ox <= oz;
      const top = o.y + o.h, on = (q2) => Math.abs(q2.x - o.x) < o.w / 2 + 0.6 && Math.abs(q2.z - o.z) < o.d / 2 + 0.6 && Math.abs(q2.y - top) < 0.6;
      const sgn = alongX ? Math.sign(o.x - a.x) || 1 : Math.sign(o.z - a.z) || 1;
      for (const r of roofs) if (on(r)) { if (alongX) { r.w -= cut; r.x += sgn * cut / 2; } else { r.d -= cut; r.z += sgn * cut / 2; } }
      if (alongX) { o.w -= cut; o.x += sgn * cut / 2; } else { o.d -= cut; o.z += sgn * cut / 2; }
      reinsert(o);
    }
  }

  // street junk never lands on a road or inside a building
  for (let k = junk.length - 1; k >= 0; k--) {
    const j = junk[k]; if (j.kind === 'sign') continue;
    let bad = false;
    collision.query(j.x, j.z, 16, (it) => {
      if (bad) return;
      if (it.t === 0 && j.x > it.minX - 0.6 && j.x < it.maxX + 0.6 && j.z > it.minZ - 0.6 && j.z < it.maxZ + 0.6) bad = true;
      else if (it.t === 3 && distToSeg(j.x, j.z, it.ax, it.az, it.bx, it.bz).d < it.hw + 1.2) bad = true;
    });
    if (bad) junk.splice(k, 1);
  }

  // which walls face a street (bit 0 +z, 1 -z, 2 +x, 3 -x): shopfronts only go on those;
  // side walls over a gap to the next building and back walls on an alley get windows
  if (graph) {
    const segs = [];
    for (const e of graph.edges) for (let i = 1; i < e.pts.length; i++) segs.push([e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1], e.width / 2]);
    const SC = 48, sgrid = new Map();
    segs.forEach((sg, k) => {
      for (let gx = Math.floor((Math.min(sg[0], sg[2]) - 30) / SC); gx <= Math.floor((Math.max(sg[0], sg[2]) + 30) / SC); gx++)
        for (let gz = Math.floor((Math.min(sg[1], sg[3]) - 30) / SC); gz <= Math.floor((Math.max(sg[1], sg[3]) + 30) / SC); gz++) {
          const key = gx + ',' + gz; if (!sgrid.has(key)) sgrid.set(key, []); sgrid.get(key).push(k);
        }
    });
    const nearRoad = (x, z, pad) => {
      for (const k of sgrid.get(Math.floor(x / SC) + ',' + Math.floor(z / SC)) || []) if (distToSeg(x, z, segs[k][0], segs[k][1], segs[k][2], segs[k][3]).d < segs[k][4] + pad) return true;
      return false;
    };
    // buildings by cell, to stop a wall's line of sight at the next building
    const BC = 32, bgrid = new Map();
    B.forEach((o, k) => {
      for (let gx = Math.floor((o.x - o.w / 2) / BC); gx <= Math.floor((o.x + o.w / 2) / BC); gx++)
        for (let gz = Math.floor((o.z - o.d / 2) / BC); gz <= Math.floor((o.z + o.d / 2) / BC); gz++) {
          const key = gx + ',' + gz; if (!bgrid.has(key)) bgrid.set(key, []); bgrid.get(key).push(k);
        }
    });
    const blockedBy = (x, z, self) => {
      for (const k of bgrid.get(Math.floor(x / BC) + ',' + Math.floor(z / BC)) || []) {
        const o = B[k]; if (o === self) continue;
        if (o.y > self.y + 3 || o.y + o.h < self.y + 1) continue; // a block up on a roof, or one far below
        if (Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) return true;
      }
      return false;
    };
    for (const b of B) {
      let mask = 0;
      const W4 = [[0, 1, b.d / 2, b.w], [0, -1, b.d / 2, b.w], [1, 0, b.w / 2, b.d], [-1, 0, b.w / 2, b.d]];
      W4.forEach(([nx, nz, half, len], bit) => {
        let hit = false;
        // walk out from the wall: the street has to be in view, not behind the next building
        for (let t = -0.4; t <= 0.41 && !hit; t += 0.2) for (const out of [0.8, 2.5, 4, 6.5, 9, 12, 15]) {
          const x = b.x + nx * (half + out) + (nz !== 0 ? t * len : 0), z = b.z + nz * (half + out) + (nx !== 0 ? t * len : 0);
          if (blockedBy(x, z, b)) break;
          if (out >= 4 && nearRoad(x, z, 2)) { hit = true; break; }
        }
        if (hit) mask |= 1 << bit;
      });
      b.street = mask;
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  // three facade shaders (see makeFacadeMaterial); instOf[bi] = { mesh, i } for one building
  const GROUP = (st) => (st <= 1 ? 'tower' : st === 2 || st === 5 ? 'masonry' : 'frame');
  const instOf = new Array(B.length);
  const meshes = {};
  for (const grp of ['tower', 'masonry', 'frame']) {
    const list = [];
    B.forEach((b, bi) => { if (GROUP(b.style) === grp) list.push(bi); });
    if (!list.length) continue;
    const bbox = box.clone();
    const gm = new THREE.InstancedMesh(bbox, makeFacadeMaterial(surf, grp), list.length);
    const info = new Float32Array(list.length * 4);
    list.forEach((bi, i) => {
      const b = B[bi];
      // walls carry on into the ground (a foundation): no gap under the low corner on a slope
      const lo = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => hm.height(b.x + a * b.w / 2, b.z + c * b.d / 2)));
      const drop = b.y - hm.height(b.x, b.z) > 3 ? 0 : Math.max(0.5, b.y - lo + 0.4);
      Object.defineProperty(b, 'found', { value: drop, enumerable: false, writable: true, configurable: true });
      m4.compose(p.set(b.x, b.y - drop, b.z), q.identity(), s.set(b.w, b.h + drop, b.d));
      gm.setMatrixAt(i, m4);
      gm.setColorAt(i, col.setHex(b.color));
      // w: up on a lower block (a tower's setback): no shopfront up there
      // w: 1 = up on a lower block (no shopfront up there) + 2 x the street-facing wall mask
      info.set([b.style, b.y, rnd() * 100, (b.y - hm.height(b.x, b.z) > 1.2 ? 1 : 0) + 2 * (b.street ?? 15)], i * 4);
      instOf[bi] = { mesh: gm, i };
    });
    bbox.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    gm.castShadow = quality.shadows > 0;
    gm.receiveShadow = true;
    gm.computeBoundingSphere();
    gm.name = 'buildings-' + grp;
    scene.add(gm);
    meshes[grp] = gm;
  }
  const mesh = meshes.tower || meshes.masonry || meshes.frame; // (kept for older callers)

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
  // asphalt shingles laid in courses along the ridge, tinted per roof
  const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
  if (surf && surf.shingles && surf.shingles.real) {
    const SH = surf.shingles;
    roofMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tShC: { value: SH.color }, tShN: { value: SH.normal }, tShA: { value: SH.ao }, tShR: { value: SH.rough }, uWet: worldUniforms.uWet });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRfW; varying vec3 vRidge;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vRidge = normalize(mat3(modelMatrix * instanceMatrix) * vec3(1.0, 0.0, 0.0));');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRfW; varying vec3 vRidge; uniform sampler2D tShC, tShN, tShA, tShR; uniform float uWet; vec2 sbRuv; float sbShR;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 rg = normalize(vec3(vRidge.x, 0.0, vRidge.z) + vec3(1e-5, 0.0, 0.0));
          sbRuv = vec2(dot(vRfW.xz, rg.xz), dot(vRfW.xz, vec2(-rg.z, rg.x)) * 1.15 - vRfW.y * 0.6) / ${SH.size.toFixed(2)};
          vec3 shc = texture2D(tShC, sbRuv).rgb * mix(1.0, texture2D(tShA, sbRuv).r, 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, shc, 0.55) * (0.65 + 0.7 * dot(shc, vec3(0.333)));
          sbShR = texture2D(tShR, sbRuv).g;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(sbShR, sbShR * 0.5, uWet); diffuseColor.rgb *= 1.0 - uWet * 0.25;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 nt = texture2D(tShN, sbRuv).xyz * 2.0 - 1.0; vec3 T = (viewMatrix * vec4(normalize(vec3(vRidge.x, 0.0, vRidge.z) + vec3(1e-5, 0.0, 0.0)), 0.0)).xyz;
            // on the gable ends the ridge runs along the normal: no tangent there, so no bump (a NaN here blacks out the whole screen through bloom)
            vec3 Tp = T - normal * dot(normal, T);
            if (dot(Tp, Tp) > 1e-4) { T = normalize(Tp); vec3 B = cross(normal, T); normal = normalize(normal + (T * nt.x + B * nt.y) * 0.8); } }`);
    };
    roofMat.customProgramCacheKey = () => 'sbroof';
  }
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, roofs.length);
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

  // rooftop units never stand inside a taller block (the setback of a tower sits on the same roof):
  // slide each one out onto the terrace round it, or leave it off if the terrace is too narrow
  {
    const inside = (x, z, w, h, d, y) => B.find((o) => x + w / 2 > o.x - o.w / 2 && x - w / 2 < o.x + o.w / 2 && z + d / 2 > o.z - o.d / 2 && z - d / 2 < o.z + o.d / 2 && y < o.y + o.h - 0.05 && y + h > o.y + 0.05);
    for (let k = props.length - 1; k >= 0; k--) {
      const pr = props[k];
      const o = inside(pr.x, pr.z, pr.w, pr.h, pr.d, pr.y);
      if (!o) continue;
      const base = B.find((b) => Math.abs(b.y + b.h - pr.y) < 0.3 && Math.abs(pr.x - b.x) < b.w / 2 && Math.abs(pr.z - b.z) < b.d / 2);
      let ok = false;
      if (base) {
        const tries = [
          [o.x + o.w / 2 + pr.w / 2 + 0.4, pr.z], [o.x - o.w / 2 - pr.w / 2 - 0.4, pr.z],
          [pr.x, o.z + o.d / 2 + pr.d / 2 + 0.4], [pr.x, o.z - o.d / 2 - pr.d / 2 - 0.4],
        ].sort((a, b2) => Math.hypot(a[0] - pr.x, a[1] - pr.z) - Math.hypot(b2[0] - pr.x, b2[1] - pr.z));
        for (const [x, z] of tries) {
          // inside the parapet (0.25 m) with a little clearance, and clear of every other block
          if (Math.abs(x - base.x) + pr.w / 2 > base.w / 2 - 0.5 || Math.abs(z - base.z) + pr.d / 2 > base.d / 2 - 0.5) continue;
          if (inside(x, z, pr.w, pr.h, pr.d, pr.y)) continue;
          pr.x = x; pr.z = z; ok = true; break;
        }
      }
      if (!ok) props.splice(k, 1);
    }
  }
  const allProps = props.slice();
  props.splice(0, props.length, ...props.filter((pr) => !pr.tower));
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
    // chain-link comes in panels between posts: step each panel to the ground under it (no
    // hovering ends on a slope) and leave a gap where a run would cross a road or a building
    const panels = [];
    for (const f of fences) {
      const along = f.w > f.d, L = along ? f.w : f.d, n = Math.max(1, Math.ceil(L / 2.5)), pl = L / n;
      for (let k = 0; k < n; k++) {
        const c = -L / 2 + pl * (k + 0.5), x = along ? f.x + c : f.x, z = along ? f.z : f.z + c;
        let clear = true;
        collision.query(x, z, pl + 8, (it) => {
          if (!clear) return;
          if (it.t === 0) {
            // the whole panel, end to end, stays out of the building
            for (let u = -0.5; u <= 0.51 && clear; u += 0.25) {
              const sx = along ? x + u * pl : x, sz = along ? z : z + u * pl;
              if (sx > it.minX - 0.3 && sx < it.maxX + 0.3 && sz > it.minZ - 0.3 && sz < it.maxZ + 0.3) clear = false;
            }
          }
          else if (it.t === 3) {
            const dx = it.bx - it.ax, dz = it.bz - it.az, L2 = dx * dx + dz * dz || 1;
            const t = Math.max(0, Math.min(1, ((x - it.ax) * dx + (z - it.az) * dz) / L2));
            if (Math.hypot(it.ax + dx * t - x, it.az + dz * t - z) < it.hw + 0.6 + pl / 2) clear = false;
          }
        });
        if (!clear) continue;
        const ya = hm.height(along ? x - pl / 2 : x, along ? z : z - pl / 2), yb = hm.height(along ? x + pl / 2 : x, along ? z : z + pl / 2);
        panels.push({ x, z, y: Math.min(ya, yb) - 0.05, h: f.h + Math.abs(ya - yb), L: pl, along });
      }
    }
    fences.panels = panels;
    const fg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const fmesh = new THREE.InstancedMesh(fg, fm, Math.max(1, panels.length));
    const rail = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0), new THREE.MeshStandardMaterial({ color: 0x8e9498, roughness: 0.4, metalness: 0.8 }), Math.max(1, panels.length));
    const postsL = [];
    fmesh.count = rail.count = 0;
    let fi = 0;
    for (const f of panels) {
      if (fi >= fmesh.instanceMatrix.count) break;
      m4.compose(p.set(f.x, f.y, f.z), q.identity(), s.set(f.along ? f.L : 0.02, f.h, f.along ? 0.02 : f.L)); fmesh.setMatrixAt(fi, m4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.along ? 0 : -Math.PI / 2);
      m4.compose(p.set(f.along ? f.x - f.L / 2 : f.x, f.y + f.h, f.along ? f.z : f.z - f.L / 2), q, s.set(f.L, 1, 1)); rail.setMatrixAt(fi, m4);
      for (const t of [-f.L / 2, f.L / 2]) postsL.push([f.along ? f.x + t : f.x, f.y, f.along ? f.z : f.z + t, f.h]);
      fi++;
    }
    fmesh.count = rail.count = fi;
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
  // real 3D architecture on the boxes: cornices, parapets, shopfronts, window sills and heads
  const facades = createFacades(B, { scene, quality, surf, roofOf, roofs, hm, graph, props: allProps });
  return { buildings: B, cityBlocks, lakeHouses, junk, count: B.length, mesh, meshes, instOf, roofMesh, roofs, roofOf, gutterMesh, gutterRanges, facades, props: allProps, fences };
}
