// Style frame F4 - SCENE 1A, the birthing chamber (shot list 1A-12 / 1A-17).
//
// "The chamber is warm, practical, and carefully maintained. Lamps provide subdued light; daylight
// enters high above ... Soft prepared bedding surrounds the egg. Bowls of water and folded cloth ...
// The hatchling emerges awkwardly. It is wet, unsteady, and exhausted. Gold catches the warm light
// along its scales ... Its body does not emit light ... The hatchling tries to lift itself and slips
// against the broken shell. Alexandria supports it with a folded cloth."
//
// Set: the architecture library's birthing chamber (scenes/lib/architecture/interiors.js: washed
// rubble walls, a joisted ceiling, the high window in the east wall, lamp niches, the plank-framed
// straw nest with the cloth-simulated linen). Light (shot list 1A): warm low lamps plus a COOL
// DAYLIGHT SHAFT from the high opening - the sun through the east window, made visible by the dust in
// the air (volumetrics, shadowed by the window reveal), landing on the linen where the hatchling lies.
//
// Cinematography (1A-17 insert): a close shot low over the nest, 55 mm on Super 35 at T5.6, looking north
// along the bed toward the window wall. Key: a clay oil lamp low at frame left rakes the wet gold
// scales warm; the cool shaft falls through the dusty air behind and onto the linen. Alexandria's
// hands enter from screen RIGHT (her side of the nest in the chamber map) and hold a folded linen
// cloth under the hatchling's chest; her face stays out of frame. Models: the gold hatchling
// (creatures), Alexandria (humans cast build, arms placed by IK), the chamber (architecture).
//
//   node render/render.mjs --still scenes/lookdev/style-f4-birthing-chamber.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { loadPBR } from '../lib/assets.js';
import { limbIK, lookAtPoint, rotateBone, relaxHand } from '../lib/sets/cast.js';
import { createCreature, poses } from '../lib/creatures/index.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { Kit, frame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { birthingChamber, loadArchCache, NEST } from '../lib/architecture/interiors.js';
import { filmFinish } from './finish.js';

// daylight through the chamber's high east window: the shaft lands on the bedding just behind the
// hatchling and the shell (the hatchling itself is in the lamp's warm light)
const SUN = new THREE.Vector3(0.72, 0.685, 0.06).normalize();
const NEST_C = [-0.6, 0, 0.3];                                     // the chamber's nest centre (world)
const HATCH = new THREE.Vector3(0.33, 0, 0.02);                    // where the hatchling lies on the linen

export const meta = {
  title: 'Style frame F4 - The birthing chamber',
  duration: 8,
  seed: 41,
  cinematic: filmFinish({
    volumetrics: {
      enabled: true, range: 14, near: 0.05, resolution: [192, 108, 64], noiseFilter: true,
      density: 0.14, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.2, noiseScale: 0.9, noiseAmount: 0.55, wind: [0.03, 0.01, 0.0], shadowSoftness: 0.05,
      ambient: [0.0003, 0.00025, 0.0002], intensity: 1.0,
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.08, maxRadiusPx: 0.03, contactShadows: true, contactLength: 0.03, contactMaxDistance: 4 },
    dof: { samples: 96, maxCoC: 0.024 },
    grade: { exposure: 1.3, whiteBalance: 4700, contrast: 1.05, saturation: 1.0 },
    grain: { amount: 3.8 },
    lensFx: { vignette: 0.85 },
  }),
};

let S;

function lathe(THREE, prof, seg = 48) {
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** The egg: an ellipsoid shell; the broken-open end is cut in the shader (smooth, irregular crack line). */
function eggShell(rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 128, 96);
  g.rotateX(Math.PI / 2);                    // poles on +-z (the egg's long axis)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // a real egg is blunter at one end
    const k = z > 0 ? 1.0 : 1.0 - 0.1 * z * z;
    p.setXYZ(i, x * rx * k, y * ry * k, z * rz);
  }
  g.computeVertexNormals();
  return g;
}

export async function setup(ctx) {
  const { scene, camera, renderer } = ctx;
  let a = 77; const rng = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };

  // reflections: gold mirrors its surroundings, so the environment must BE this room - a small
  // environment scene (warm lamp-lit lime-washed walls, the lamp flames, the cool high window, the
  // pale linen below) rendered into a PMREM once; the image-based light is otherwise kept faint (it
  // is not occluded by the walls)
  {
    const es = new THREE.Scene();
    const wallE = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.032, 0.018), side: THREE.BackSide });
    es.add(new THREE.Mesh(new THREE.BoxGeometry(7.2, 5.6, 6.2), wallE).translateY(2.6));
    const add = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0.3, 0.5, 0.1); es.add(m); };
    add(new THREE.PlaneGeometry(1.8, 1.2), [0.5, 0.3, 0.15], -1.2, 1.0, -2.9);         // the lamplit north wall
    add(new THREE.SphereGeometry(0.05, 12, 8), [40, 18, 5], -0.55, 0.55, -0.45);       // key lamp flame
    add(new THREE.SphereGeometry(0.04, 12, 8), [25, 11, 3], -1.0, 0.65, -2.6);
    add(new THREE.PlaneGeometry(1.1, 1.6), [1.6, 1.8, 2.1], 3.5, 3.95, -0.35);          // the high window
    add(new THREE.PlaneGeometry(1.2, 1.2), [0.24, 0.19, 0.13], 0.3, 0.0, 0.1);          // linen and straw below
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0, 0.05, 30).texture;
    pm.dispose();
    scene.environmentIntensity = 0.4;
  }
  scene.background = new THREE.Color(0, 0, 0);

  // the sun through the high east window (its shadow map covers the room: the walls and the window
  // reveal cut the shaft)
  const sun = new THREE.DirectionalLight(new THREE.Color(0.86, 0.92, 1.0), 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 5; sc.far = 40;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.012;
  sun.target.position.set(0, 0, 0.1);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 20);
  scene.add(sun, sun.target);

  // ---- the chamber (architecture library) with the baked nest linen
  const M = await archMaterials(ctx);
  const kit = new Kit(0);
  const cloth = await loadArchCache('nest_cloth');
  const ch = birthingChamber(kit, frame([0, 0, 0]), { seed: 3, cloth, nest: NEST_C });
  scene.add(kit.build(M, { name: 'chamber' }));
  for (const l of ch.lights) { l.intensity *= 0.6; scene.add(l); }
  // the height of the linen surface (the cloth bake, nest-local): the hatchling and the egg lie on it
  const linenY = (x, z) => {
    if (!cloth) return NEST.TOP + 0.13;
    const { nx, ny, positions: P } = cloth;
    let best = 1e9, y = 0.45;
    for (let k = 0; k < (nx + 1) * (ny + 1); k++) { const d = (P[k * 3] - (x - NEST_C[0])) ** 2 + (P[k * 3 + 2] - (z - NEST_C[2])) ** 2; if (d < best) { best = d; y = P[k * 3 + 1]; } }
    return y + 0.004;
  };
  const NY = linenY(HATCH.x, HATCH.z);

  const rx0 = 0.1, ry0 = 0.1, rz0 = 0.14;
  const shellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.035, 0.03, 0.026), roughness: 0.68, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6, side: THREE.DoubleSide });
  shellMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vEP;
float eh(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float eh1(float x){return fract(sin(x*127.1)*43758.5453);}
float evn(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(eh1(i),eh1(i+1.0),f);}
float dkShellD;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ vec3 u = vEP / vec3(${rx0.toFixed(4)}, ${ry0.toFixed(4)}, ${rz0.toFixed(4)});
  float a = (atan(u.y, u.x) / 6.2831853 + 0.5) * 9.0;
  // an irregular fracture: a few big lobes, angular facets, and deep notches where cracks ran
  float jag = 0.6 + 0.36 * (evn(a * 0.55 + 2.0) - 0.5) + 0.18 * (evn(a * 1.9 + 11.0) - 0.5);
  float facet = fract(a * 1.3 + evn(a * 0.7) * 1.7);
  jag += 0.07 * (abs(facet - 0.5) * 2.0 - 0.5) + 0.03 * (evn(a * 9.0 + 3.0) - 0.5);
  float nq = fract(a * 0.29 + 0.17);
  jag -= 0.2 * max(0.0, 1.0 - abs(nq - 0.5) * 16.0) * evn(a * 0.29 + 5.0);
  dkShellD = (1.0 - u.z) - jag;
  if (dkShellD < 0.0) discard; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ // fine pitted, leathery shell surface
  vec3 q = vEP * 90.0; vec3 i = floor(q); vec3 f = smoothstep(0.0, 1.0, fract(q));
  float h = mix(mix(mix(eh(i), eh(i + vec3(1,0,0)), f.x), mix(eh(i + vec3(0,1,0)), eh(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(eh(i + vec3(0,0,1)), eh(i + vec3(1,0,1)), f.x), mix(eh(i + vec3(0,1,1)), eh(i + vec3(1,1,1)), f.x), f.y), f.z);
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.0015); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float sp = step(0.93, eh(floor(vEP * 260.0))) * 0.6 + 0.4 * eh(floor(vEP * 60.0));
  diffuseColor.rgb *= 0.8 + 0.5 * sp;
  // the broken edge: a pale band of the shell's cross-section (~2 mm) shows along the fracture
  float rim = 1.0 - smoothstep(0.012, 0.024, dkShellD);
  if (!gl_FrontFacing) {
    // inside: the pale inner membrane, wrinkled, a little torn back from the edge, darker deep in
    float wr = eh(floor(vEP * 140.0)) * 0.25 + 0.75;
    vec3 mem = vec3(0.5, 0.45, 0.35) * wr;
    float deep = smoothstep(0.0, 0.9, dkShellD);
    diffuseColor.rgb = mix(mem, mem * 0.55, deep);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.56, 0.44), rim); }`);
  };
  shellMat.customProgramCacheKey = () => 'dk-eggshell';
  const egg = new THREE.Mesh(eggShell(rx0, ry0, rz0), shellMat);
  egg.castShadow = egg.receiveShadow = true;
  scene.add(egg);
  const frags = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.SphereGeometry(0.13, 10, 8, rng() * 6, 0.35 + rng() * 0.4, 0.8 + rng() * 0.6, 0.3 + rng() * 0.35);
    const f = new THREE.Mesh(g, shellMat);
    f.castShadow = f.receiveShadow = true; scene.add(f); frags.push(f);
  }

  // ---- the hatchling (provisional design: 24-karat-gold look, wet, no glow)
  const hatch = await createCreature('hatchling', { quality: 'hero' });
  scene.add(hatch.root);

  // ---- the key: a clay oil lamp on the nest's frame at frame left, low and close; warm
  const clay = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.17, 0.09), roughness: 0.75 });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 4.2, 1.2) });
  const lamp = (x, y, z, intensity, shadow) => {
    const body = new THREE.Mesh(lathe(THREE, [[0, 0], [0.05, 0], [0.075, 0.03], [0.06, 0.05], [0.015, 0.06], [0.0, 0.06]], 32), clay);
    body.scale.set(1, 1, 1.4); body.position.set(x, y, z); body.castShadow = true; scene.add(body);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), flameMat); fl.scale.set(1, 2.6, 1); fl.position.set(x, y + 0.085, z + 0.07); scene.add(fl);
    const L = new THREE.PointLight(new THREE.Color(1.0, 0.52, 0.2), intensity, 0, 2);
    L.position.set(x, y + 0.09, z + 0.07);
    if (shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.004; L.shadow.normalBias = 0.01; L.shadow.camera.near = 0.03; L.shadow.camera.far = 12; L.shadow.radius = 4; }
    scene.add(L);
    return L;
  };
  lamp(-0.5, NEST.TOP + 0.002, 1.24, 1.1, true);                  // on the nest's south board, frame left
  lamp(-0.95, 0.62, -2.55, 0.5, false);                              // on the bench by the north wall (bokeh)

  // ---- Alexandria (humans cast build): kneeling at the south side of the nest, her hands under
  // a folded linen cloth that supports the hatchling's chest
  const alex = await loadCharacter('alexandria');
  scene.add(alex.root);
  // a fresh, bleached linen cloth (whiter than the used bedding linen under it)
  const clothMat = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [3, 3], color: new THREE.Color(0.86, 0.83, 0.77), sheen: { color: 0xffffff, roughness: 0.45 } });
  clothMat.vertexColors = true; clothMat.side = THREE.DoubleSide;
  // the cloth she supports it with: a folded linen cloth (two layers, a fold along its left edge
  // under the hatchling's chest) laid over her hands - its shape is draped every frame over the bed
  // and over her hands (see drapeCloth), so her fingers are under the cloth, never through it
  clothMat.vertexColors = false;
  const CU = 64, CV = 48;
  const fcloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, CU, CV), clothMat);
  fcloth.castShadow = fcloth.receiveShadow = true; fcloth.frustumCulled = false;
  fcloth.userData.grid = [CU, CV];
  scene.add(fcloth);


  camera.near = 0.02; camera.far = 60;
  S = { hatch, egg, frags, alex, fcloth, sun, NY, linenY };
}

/**
 * Drape the cloth grid (PlaneGeometry 1x1, CU x CV) as a folded linen cloth centred at c, w wide
 * along `across` and d deep along `along`: its height is the bed (linenY) or, where her hands are,
 * the top of the hands (one smooth pad per hand, wrist to fingertips) plus the cloth's thickness, relaxed a few
 * times so it drapes between them instead of tenting; soft creases; the left edge (under the
 * hatchling's chest) is the fold. Everything from the current pose (pure in t).
 */
function drapeCloth(mesh, c, across, along, w, d, ch, linenY, hatch) {
  const [CU, CV] = mesh.userData.grid;
  ch.root.updateMatrixWorld(true);
  const bp = (n) => { const b = ch.bone(n); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  // each hand under the cloth is one smooth pad (palm + fingers together, as cloth spans the
  // knuckles instead of wrapping every finger): an ellipsoid from the wrist to the fingertips
  const pads = [];
  for (const sd of ['L', 'R']) {
    const w = bp(`wrist.${sd}`), k = bp(`finger3-1.${sd}`), tip = bp(`finger3-3.${sd}`);
    if (!w || !k || !tip) continue;
    const end = tip.clone().addScaledVector(tip.clone().sub(k), 0.35);
    pads.push({ a: w, b: end, r: 0.045, h: 0.028 });
  }
  // the hatchling's chest rests on it: the cloth never comes up through the body (its belly
  // presses it to the bed) - the body's lowest points are below the cloth anyway
  void hatch;
  const g = mesh.geometry, P = g.attributes.position;
  const H = new Float32Array((CU + 1) * (CV + 1)), H0 = new Float32Array(H.length);
  const X = [], Z = [];
  for (let j = 0; j <= CV; j++) for (let i = 0; i <= CU; i++) {
    const u = i / CU - 0.5, v = j / CV - 0.5;
    const p = c.clone().addScaledVector(across, u * w).addScaledVector(along, v * d);
    let y = linenY(p.x, p.z) + 0.006;
    for (const { a, b, r, h } of pads) {
      // distance from p to the wrist->fingertip segment (in plan), the pad's height along it
      const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
      const tt = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / L2));
      const dd = Math.hypot(p.x - (a.x + abx * tt), p.z - (a.z + abz * tt));
      if (dd < r) y = Math.max(y, a.y + (b.y - a.y) * tt + h * Math.sqrt(1 - (dd / r) ** 2) * (1 - 0.5 * tt));
    }
    const k = j * (CU + 1) + i;
    H[k] = H0[k] = y; X.push(p.x); Z.push(p.z);
  }
  // relax: the cloth spans between the knuckles and slopes down to the bed (never below its support)
  for (let it = 0; it < 24; it++) {
    const T = H.slice();
    for (let j = 1; j < CV; j++) for (let i = 1; i < CU; i++) {
      const k = j * (CU + 1) + i;
      const m = (T[k - 1] + T[k + 1] + T[k - CU - 1] + T[k + CU + 1]) / 4;
      H[k] = Math.max(H0[k], m - 0.0009);
    }
  }
  for (let j = 0; j <= CV; j++) for (let i = 0; i <= CU; i++) {
    const k = j * (CU + 1) + i, u = i / CU, v = j / CV;
    // creases running out from the hands, a rolled fold along the left edge
    const crease = 0.0025 * Math.sin(v * 37 + u * 9) * Math.sin(u * 13 + 1.7) + 0.0015 * Math.sin(u * 51 - v * 23);
    const fold = 0.006 * Math.exp(-u * 40);
    P.setXYZ(k, X[k], H[k] + crease * (H[k] - H0[k] > 0.004 ? 1 : 0.4) + fold, Z[k]);
  }
  P.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

// fixed screen geometry: the camera looks along VIEW (north, along the nest: the shaft from the east
// window crosses the background from upper right to lower left); the hatchling's head points
// screen-left and a little toward camera; Alexandria kneels at screen right (east)
const VIEW = new THREE.Vector3(0.12, 0, -1).normalize();
const CAM_R = new THREE.Vector3(-VIEW.z, 0, VIEW.x);                 // screen right (horizontal)
const FWD = CAM_R.clone().multiplyScalar(-0.55).addScaledVector(VIEW, -0.83).normalize();

export function update(t, ctx) {
  const { hatch, egg, frags, alex, fcloth, NY } = S;
  const T0 = t; if (Math.round(t) > 100) t = 2;
  // the hatchling: half out of the shell, exhausted - head low on the cloth, eyes half closed, one
  // foreleg slipped forward, breathing hard
  const p = poses.lie(hatch, { t, raise: -0.1, headDown: 0.16, look: [0.3, -0.04], lidRelax: 0.5, breathe: 0.55 });
  if (p.bones['fl_L_0']) { p.bones['fl_L_0'][0] += 0.55; p.bones['fl_L_0'][2] += 0.25; }
  if (p.bones['fl_L_1']) p.bones['fl_L_1'][0] -= 0.9;
  p.groundBones = [];
  hatch.setPose(p);
  const yaw = Math.atan2(FWD.x, FWD.z);
  hatch.root.position.set(HATCH.x, NY - 0.035, HATCH.z);
  hatch.root.rotation.set(0, yaw, 0.08);
  hatch.root.updateMatrixWorld(true);
  // it lies ON the linen: lift it until its head, chest and hips clear the draped cloth
  {
    let lift = 0;
    for (const [n, clear] of [['head', 0.03], ['thorax', 0.045], ['lumbar', 0.04]]) {
      const b = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex[n]].matrixWorld);
      lift = Math.max(lift, S.linenY(b.x, b.z) + 0.008 + clear - b.y);
    }
    hatch.root.position.y += lift;
    hatch.root.updateMatrixWorld(true);
  }
  const fwd = FWD;
  const sideA = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const far = sideA.dot(VIEW) > 0 ? sideA : sideA.clone().negate();   // the hatchling's side away from camera
  // the shell lies on its side around the hindquarters, its broken end toward the head
  const hip = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.lumbar].matrixWorld);
  egg.position.copy(hip).addScaledVector(fwd, -0.1).addScaledVector(VIEW, 0.16).addScaledVector(CAM_R, -0.1);
  egg.position.y = S.linenY(egg.position.x, egg.position.z) + 0.08;
  egg.lookAt(egg.position.clone().add(fwd).add(new THREE.Vector3(0, 0.25, 0)));
  egg.rotateZ(0.9);
  frags.forEach((f, i) => {
    const ang = yaw + 2.2 + i * 0.6, r = 0.17 + (i % 3) * 0.05;
    f.position.set(egg.position.x + Math.sin(ang) * r, NY + 0.004, egg.position.z + Math.cos(ang) * r);
    f.rotation.set(1.2 + i, i * 2.1, 0.4 * i);
  });
  // the folded cloth under its chest and forelegs, its near-right end lifted on Alexandria's fingers
  const chest = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.thorax].matrixWorld);
  // Alexandria kneels at screen right, out of frame; both hands, palms up, slide under the
  // hatchling's chest from the right with the folded cloth over them: she lifts it on the cloth
  // so it rests instead of slipping against the shell. (The build's fingers keep their own shape;
  // the cloth is draped over them, so they never show through it.)
  alex.update(t);
  placeCharacter(alex, 0, -0.74, 0, Math.atan2(-CAM_R.x, -CAM_R.z));
  alex.update(t);
  const across = new THREE.Vector3(CAM_R.x, 0, CAM_R.z).normalize();          // toward her (screen right)
  const along = across.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();  // away from the camera
  const base = chest.clone(); base.y = S.linenY(base.x, base.z);
  {
    const shC = new THREE.Vector3().setFromMatrixPosition(alex.bone('upperarm01.L').matrixWorld).add(new THREE.Vector3().setFromMatrixPosition(alex.bone('upperarm01.R').matrixWorld)).multiplyScalar(0.5);
    const goal = base.clone().addScaledVector(across, 0.6).add(new THREE.Vector3(0, 0.3, 0));
    alex.root.position.add(goal.sub(shC));
    alex.root.updateMatrixWorld(true);
  }
  const wA = base.clone().addScaledVector(across, 0.22).addScaledVector(along, -0.065).add(new THREE.Vector3(0, 0.035, 0));
  const wB = base.clone().addScaledVector(across, 0.22).addScaledVector(along, 0.065).add(new THREE.Vector3(0, 0.035, 0));
  const aIsR = wA.clone().sub(wB).dot(along) < 0;                     // nearer the camera
  const pole = base.clone().addScaledVector(across, 0.45).add(new THREE.Vector3(0, -0.3, 0));
  limbIK(alex, 'arm', aIsR ? 'R' : 'L', aIsR ? wA : wB, pole.clone().addScaledVector(along, -0.35));
  limbIK(alex, 'arm', aIsR ? 'L' : 'R', aIsR ? wB : wA, pole.clone().addScaledVector(along, 0.35));
  const under = across.clone().negate().add(new THREE.Vector3(0, -0.12, 0)).normalize();
  for (const sd of ['L', 'R']) relaxHand(alex, sd, { fingers: under, palm: new THREE.Vector3(0, 1, 0), keepFingers: true });
  // the cloth ends over her knuckles: the backs of her hands and the wrists show at its right edge
  drapeCloth(fcloth, base.clone().addScaledVector(across, 0.055), across, along, 0.27, 0.3, alex, S.linenY, hatch);
  const endR = base.clone().addScaledVector(across, 0.22).add(new THREE.Vector3(0, 0.035, 0));     // her hands
  lookAtPoint(alex, chest, 0.8);

  // camera: just above the bedding, close on the hatchling's face, looking along VIEW
  const cam = ctx.camera;
  const head = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.head].matrixWorld);
  const aim = head.clone().lerp(endR, 0.42).addScaledVector(VIEW, 0.05).add(new THREE.Vector3(0, 0.0, 0));
  cam.position.copy(aim).addScaledVector(VIEW, -0.9).addScaledVector(CAM_R, 0.18).add(new THREE.Vector3(0, 0.22, 0));
  cam.lookAt(aim.clone().add(new THREE.Vector3(0, 0.07, 0)));
  if (Math.round(T0) === 101) { cam.position.copy(aim).addScaledVector(VIEW, -1.6).addScaledVector(CAM_R, 0.9).add(new THREE.Vector3(0, 1.1, 0)); cam.lookAt(aim); }
  if (Math.round(T0) === 102) { cam.position.set(-2.6, 1.7, 2.2); cam.lookAt(1.5, 1.6, -0.6); }
  cam.updateMatrixWorld(true);
  if (T0 === 2) console.warn('[f4] NY', NY.toFixed(3), 'head', head.toArray().map((v) => v.toFixed(3)).join(','), 'cam', cam.position.toArray().map((v) => v.toFixed(3)).join(','), 'egg', egg.position.toArray().map((v) => v.toFixed(3)).join(','));
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 55;
  ctx.lens.fstop = 5.6;
  // focus between its eye and her hands (both hold focus at T4)
  ctx.lens.focus = cam.position.distanceTo(head.clone().lerp(endR, 0.35));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 1600;
}
