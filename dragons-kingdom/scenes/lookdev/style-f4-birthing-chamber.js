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
// Cinematography (1A-17 insert): a close shot from above the nest's edge, 55 mm on Super 35 at T4, looking north
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
      density: 0.085, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.35, noiseScale: 0.9, noiseAmount: 0.55, wind: [0.03, 0.01, 0.0], shadowSoftness: 0.05,
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

/**
 * A folded linen cloth: one strip folded back on itself in `layers` layers (an S-fold seen
 * from the side), with rounded folds, a slight sag and creases, a hem darker along the free
 * edges (vertex colour). Size w (across) x d (folded depth), cloth thickness t.
 */
function foldedLinen(w, d, layers = 3, t = 0.0035) {
  const gap = t * 1.8, R = gap / 2;
  const seg = [];                                         // the strip's centre line in x (depth) / y (up)
  for (let L = 0; L < layers; L++) {
    const dir = L % 2 === 0 ? 1 : -1, y = L * gap;
    const x0 = dir > 0 ? -d / 2 : d / 2;
    for (let i = 0; i <= 24; i++) seg.push([x0 + dir * d * i / 24, y]);
    if (L < layers - 1) for (let i = 1; i < 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; seg.push([dir * (d / 2 + R * Math.cos(a)), y + R + R * Math.sin(a)]); }
  }
  const NZ = 28, pos = [], idx = [], col = [];
  let acc = 0;
  const arc = seg.map((p, i) => (i ? (acc += Math.hypot(p[0] - seg[i - 1][0], p[1] - seg[i - 1][1])) : 0));
  const total = acc;
  seg.forEach(([x, y], i) => {
    for (let k = 0; k <= NZ; k++) {
      const z = (k / NZ - 0.5) * w;
      const crease = 0.0012 * Math.sin(arc[i] * 90 + z * 40) * Math.sin(z * 25 + 1.3) + 0.0008 * Math.sin(arc[i] * 230 - z * 70);
      const sag = -0.004 * Math.pow(Math.abs(2 * z / w), 3) * (1 - y / (layers * gap + 1e-6));
      pos.push(x + 0.002 * Math.sin(z * 60 + arc[i] * 20), y + crease + sag, z);
      const edge = Math.min(Math.abs(Math.abs(z) - w / 2), arc[i], total - arc[i]);
      const hem = edge < 0.006 ? 0.72 : 1;
      col.push(hem, hem, hem * 0.97);
    }
  });
  for (let i = 0; i < seg.length - 1; i++) for (let k = 0; k < NZ; k++) {
    const a = i * (NZ + 1) + k, b = a + 1, c = a + NZ + 1, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = []; seg.forEach((_, i) => { for (let k = 0; k <= NZ; k++) uv.push(arc[i] / 0.15, k / NZ * w / 0.15); });
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
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
  const sun = new THREE.DirectionalLight(new THREE.Color(0.9, 0.94, 1.0), 1.7);
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
  const clothMat = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [3, 3], color: new THREE.Color(1.15, 1.12, 1.05), sheen: { color: 0xffffff, roughness: 0.45 } });
  clothMat.vertexColors = true; clothMat.side = THREE.DoubleSide;
  const fcloth = new THREE.Mesh(foldedLinen(0.24, 0.26, 4, 0.0045), clothMat);
  fcloth.castShadow = fcloth.receiveShadow = true;
  scene.add(fcloth);

  // birth fluid: a few glistening strands from the shell lip to the hatchling
  const strandMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.55, 0.42, 0.22), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.55, depthWrite: false });
  const strands = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), strandMat); m.frustumCulled = false; scene.add(m); return m; });

  camera.near = 0.02; camera.far = 60;
  S = { hatch, egg, frags, alex, fcloth, sun, strands, NY, linenY };
}

// fixed screen geometry: the camera looks along VIEW (north, along the nest: the shaft from the east
// window crosses the background from upper right to lower left); the hatchling's head points
// screen-left and a little toward camera; Alexandria kneels at screen right (east)
const VIEW = new THREE.Vector3(0.12, 0, -1).normalize();
const CAM_R = new THREE.Vector3(-VIEW.z, 0, VIEW.x);                 // screen right (horizontal)
const FWD = CAM_R.clone().multiplyScalar(-0.55).addScaledVector(VIEW, -0.83).normalize();

export function update(t, ctx) {
  const { hatch, egg, frags, alex, fcloth, strands, NY } = S;
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
      lift = Math.max(lift, S.linenY(b.x, b.z) + clear - b.y);
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
  // the folded linen pad lies under its chest and runs out to screen right, where Alexandria's right
  // hand has slid under its end (palm up, thumb over the top): she is lifting the cloth to support
  // the hatchling as it tries to rise. She kneels at screen right, out of frame; her left hand
  // steadies the pad's far corner.
  const axisP = chest.clone().addScaledVector(CAM_R, 0.06).addScaledVector(VIEW, -0.01);
  axisP.y = S.linenY(axisP.x, axisP.z) + 0.004;
  const lift = 0.16;                                                 // radians: the right end rides up
  const xAx = CAM_R.clone().add(new THREE.Vector3(0, Math.tan(lift), 0)).normalize();
  const zAx = xAx.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const yUp = zAx.clone().cross(xAx).normalize();
  fcloth.position.copy(axisP);
  // foldedLinen: x = folded depth (toward screen right), y = layers (up), z = width
  fcloth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yUp, zAx));
  const endR = axisP.clone().addScaledVector(xAx, 0.12);

  alex.update(t);
  placeCharacter(alex, 0, -0.74, 0, Math.atan2(-CAM_R.x, -CAM_R.z));
  alex.update(t);
  {
    const shC = new THREE.Vector3().setFromMatrixPosition(alex.bone('upperarm01.L').matrixWorld).add(new THREE.Vector3().setFromMatrixPosition(alex.bone('upperarm01.R').matrixWorld)).multiplyScalar(0.5);
    const goal = endR.clone().addScaledVector(CAM_R, 0.4).addScaledVector(VIEW, 0.08).add(new THREE.Vector3(0, 0.27, 0));
    alex.root.position.add(goal.sub(shC));
    alex.root.updateMatrixWorld(true);
  }
  const under = endR.clone().addScaledVector(xAx, 0.07).addScaledVector(yUp, -0.014).addScaledVector(VIEW, -0.015);
  const steady = endR.clone().addScaledVector(xAx, 0.02).addScaledVector(VIEW, 0.12).addScaledVector(yUp, 0.03);
  const pole = endR.clone().addScaledVector(CAM_R, 0.3).add(new THREE.Vector3(0, -0.3, 0));
  limbIK(alex, 'arm', 'R', under, pole.clone().addScaledVector(VIEW, -0.35));
  limbIK(alex, 'arm', 'L', steady, pole.clone().addScaledVector(VIEW, 0.45));
  relaxHand(alex, 'R', { fingers: CAM_R.clone().negate().add(new THREE.Vector3(0, 0.1, 0)).normalize(), palm: new THREE.Vector3(0, 1, 0), curl: 0.12, spread: 0.0 });
  relaxHand(alex, 'L', { fingers: CAM_R.clone().negate().addScaledVector(VIEW, -0.3).normalize(), palm: new THREE.Vector3(0, -1, 0), curl: 0.16, spread: 0.01 });
  lookAtPoint(alex, chest, 0.8);

  // birth-fluid strands from the shell lip to the hatchling's hip and tail, sagging
  {
    egg.updateMatrixWorld(true);
    const tgts = ['lumbar', 'tail_0', 'tail_1'].map((n) => hatch.boneIndex[n] !== undefined ? new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex[n]].matrixWorld) : hip);
    strands.forEach((m, i) => {
      const th = 0.6 + i * 1.7;
      const a = egg.localToWorld(new THREE.Vector3(Math.cos(th) * 0.092, Math.sin(th) * 0.092, 0.14 * 0.36));
      const b = tgts[i].clone().add(new THREE.Vector3(0, 0.012 - 0.004 * i, 0));
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.025 + 0.01 * i;
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, -0.006, 0)), mid, b]), 24, 0.0012 - 0.0003 * i, 5, false);
    });
  }

  // camera: just above the bedding, close on the hatchling's face, looking along VIEW
  const cam = ctx.camera;
  const head = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.head].matrixWorld);
  const aim = head.clone().lerp(endR, 0.42).addScaledVector(VIEW, 0.05).add(new THREE.Vector3(0, 0.0, 0));
  cam.position.copy(aim).addScaledVector(VIEW, -0.95).addScaledVector(CAM_R, 0.22).add(new THREE.Vector3(0, 0.52, 0));
  cam.lookAt(aim.clone().add(new THREE.Vector3(0, 0.03, 0)));
  if (Math.round(T0) === 101) { cam.position.copy(aim).addScaledVector(VIEW, -1.6).addScaledVector(CAM_R, 0.9).add(new THREE.Vector3(0, 1.1, 0)); cam.lookAt(aim); }
  if (Math.round(T0) === 102) { cam.position.set(-2.6, 1.7, 2.2); cam.lookAt(1.5, 1.6, -0.6); }
  cam.updateMatrixWorld(true);
  if (T0 === 2) console.warn('[f4] NY', NY.toFixed(3), 'head', head.toArray().map((v) => v.toFixed(3)).join(','), 'cam', cam.position.toArray().map((v) => v.toFixed(3)).join(','), 'egg', egg.position.toArray().map((v) => v.toFixed(3)).join(','));
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 55;
  ctx.lens.fstop = 4;
  // focus between its eye and her hands (both hold focus at T4)
  ctx.lens.focus = cam.position.distanceTo(head.clone().lerp(endR, 0.35));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 1600;
}
