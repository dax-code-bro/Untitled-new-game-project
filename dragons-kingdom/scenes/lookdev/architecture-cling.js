// Architecture - Cling square: hero angles of the set (PROVISIONAL designs). One shot per second:
//   t 0-1  a house row at eye level, three-quarter (north row, north-east)
//   t 1-2  the stone arch (escape route 1) from the square
//   t 2-3  the square from the king's steps (the cling_map view: arch left, gate right)
//   t 3-4  the gate to the broad road, the fountain
//   t 4-5  close detail: masonry, jetty, timber, pegs, plaster
//   t 5-6  the king's steps, low from the square;  t 6-7  the fountain;  t 7-8  up the alley
//   node render/render.mjs --still scenes/lookdev/architecture-cling.js --time 0.5 --preset final --png row.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { heightfield, makeNoise, gradedAxis, smooth } from '../lib/sets/terrain.js';
import { grassField } from '../lib/sets/grass.js';
import { clingSquare, CLING, wallFootPlacer, houseFootSegments } from '../lib/architecture/cling.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const SHOTS = [
  { name: 'row', p: [9.5, 1.62, -5.5], t: [-6.0, 4.6, -19.5], fl: 24, fstop: 5.6 },
  { name: 'arch', p: [-9.0, 1.65, 11.0], t: [-19.6, 3.6, 16.5], fl: 24, fstop: 5.6, exp: 1.9 },
  { name: 'square', p: [5.9, 3.28, 24.6], t: [-4, 5.0, -20], fl: 24, fstop: 5.6 },
  { name: 'gate', p: [6.5, 1.65, 1.0], t: [24.4, 2.2, 5.0], fl: 28, fstop: 5.6 },
  { name: 'detail', p: [1.2, 2.3, -12.6], t: [-2.6, 3.2, -18.2], fl: 35, fstop: 5.6 },
  { name: 'steps', p: [1.0, 1.25, 9.0], t: [4.5, 1.6, 20.0], fl: 24, fstop: 5.6 },
  { name: 'fountain', p: [4.6, 1.6, 3.2], t: [0.0, 1.2, -2.0], fl: 28, fstop: 5.6 },
  { name: 'alley', p: [-7.2, 1.62, -5.0], t: [-8.4, 2.6, -28.0], fl: 32, fstop: 5.6 },
  // a plan view from high above (layout check: the fixed escape geography, nothing overlapping)
  { name: 'plan', p: [0.5, 140, 3.0], t: [0, 0, 2.9], fl: 24, fstop: 11 },
];

export const meta = {
  title: 'Architecture - Cling square (PROVISIONAL)',
  duration: SHOTS.length,
  seed: 7,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2, apDistanceScale: 1.5 },
    shadows: { cascades: 3, maxDistance: 120, bias: -0.0003, normalBias: 2.5 },
    ao: { enabled: true, radius: 0.6 },
    dof: { samples: 48 },
    grade: { exposure: 0.9, whiteBalance: 6000, contrast: 1.04, saturation: 1.0 },
    motionBlur: { accumulateSamples: 5 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.79 });
  const sun = sky.apply(scene);
  sun.intensity *= 1.5;
  scene.environmentIntensity = 0.8;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  // the square: worn pebble paving and packed earth, grass beyond the town
  const N = makeNoise(3);
  const H = (x, z) => 0.03 * N.fbm(x * 0.3, z * 0.3, 3);
  const GATE = [20.4, 4.75];
  const ground = heightfield({
    xs: gradedAxis(-300, 300, 220, 0, 2), zs: gradedAxis(-300, 300, 220, 0, 2), height: H,
    splat: (x, z) => {
      const inSq = Math.abs(x) < 23 && z > -21 && z < 30;
      // the broad road east from the gate: rutted earth, grass verges
      const roadD = x > GATE[0] - 2 ? Math.abs(z - GATE[1] - 0.02 * (x - GATE[0]) - 1.5 * N.fbm(x * 0.02, 1, 2)) : 99;
      const road = 1 - smooth(3.2, 5.0, roadD);
      // two wheel ruts (dark, wet) worn along it, hoof-churned between them
      const rc = x > GATE[0] - 2 ? (z - GATE[1] - 0.02 * (x - GATE[0]) - 1.5 * N.fbm(x * 0.02, 1, 2)) : 99;
      const ruts = Math.exp(-(((Math.abs(rc) - 0.72) / 0.16) ** 2)) * road;
      const town = 1 - smooth(55, 75, Math.hypot(x, z - 2));
      if (!inSq) {
        // in the town: trodden earth and mud, a little grass in the corners; the road; fields beyond
        const g = smooth(0.1, 0.5, N.fbm(x * 0.12 + 7, z * 0.12, 3)) * 0.6;
        const earth = Math.max(town * (1 - g), road);
        return [0, earth * 0.25 * (1 - ruts), earth * (0.75 + 0.25 * ruts), (1 - earth)];
      }
      // the square: earth between the cobbles (the cobbles are geometry), damp round the fountain
      const damp = Math.max(smooth(5.6, 3.4, Math.hypot(x, z + 2)) * 0.9, 0.4 * smooth(0.3, 0.6, N.fbm(x * 0.2 + 9, z * 0.2, 3)));
      return [0.15, 0.55 * (1 - damp), 0.3 + damp, 0];
    },
  });
  const gm = new THREE.Mesh(ground.geometry, await terrainMaterial(ctx, [
    { id: 'pbr/ph_floor_pebbles_01', scale: 0.8, tint: [0.42, 0.4, 0.37] },
    { id: 'pbr/acg_ground05', scale: 1.0, tint: [0.42, 0.37, 0.3] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.36, 0.31, 0.25] },
    { id: 'pbr/acg_ground037', scale: 2.0, tint: [0.6, 0.66, 0.5] },
  ], { macro: 0.6, macroScale: 0.05, detailNear: 40, detailFar: 500, minRoughness: 0.75 }));
  gm.receiveShadow = true; scene.add(gm);
  const set = await clingSquare(ctx, { focus: [[-9.5, -18], [-19.6, 16.5], [-7.4, -18], [4, 18], [0, -2]], heroR: 9, far: 40 });
  scene.add(set.group);
  console.warn(`[arch-cling] tris ${set.tris}, houses ${set.houses.length}`);
  // weeds at the foot of the walls
  scene.add(grassField({ count: 4000, height: [0.05, 0.26], seed: 4, color: [0.05, 0.075, 0.025], dry: [0.22, 0.19, 0.1], dryAmount: 0.5, place: wallFootPlacer(houseFootSegments(set.houses)) }));
  // the plan view's markers (only in that shot): the fixed escape geography, coloured, with a pole
  // each (labelled afterwards from their projected positions - see README 'Cling map check')
  const markers = new THREE.Group();
  const C = CLING;
  const marks = [['arch', C.arch, 0xd02020], ['gate', C.gate, 0x2050e0], ['fountain', C.fountain, 0x20c0d0], ['support', C.support, 0xf0d020], ['steps', C.steps, 0xf08020], ['stall', C.stall, 0xd020d0], ['music', C.music, 0x20b040], ['alley', C.alley, 0xffffff], ['watchman', C.watchman, 0x8040c0]];
  for (const [name, m, col] of marks) {
    const mat = new THREE.MeshBasicMaterial({ color: col });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 24), mat); disc.position.set(m.x, 6, m.z); markers.add(disc);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), mat); pole.position.set(m.x, 3, m.z); markers.add(pole);
    markers.userData[name] = [m.x, 6, m.z];
  }
  markers.visible = false;
  scene.add(markers);
  camera.near = 0.1; camera.far = 4000;
  S = { sun, sunDir: sky.sun.direction.clone(), M: set.materials, markers };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  cam.position.set(...sh.p); cam.lookAt(...sh.t);
  cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = sh.fl;
  ctx.lens.fstop = sh.fstop;
  ctx.lens.focus = new THREE.Vector3(...sh.p).distanceTo(new THREE.Vector3(...sh.t));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400 * (sh.exp || 1);
  S.markers.visible = sh.name === 'plan';
  if (sh.name === 'plan' && ctx.lens) {
    // the markers' positions on the picture (for the map labels, drawn afterwards)
    cam.updateProjectionMatrix();
    const out = {};
    for (const [k, p] of Object.entries(S.markers.userData)) { const v = new THREE.Vector3(...p).project(cam); out[k] = [+(0.5 + v.x / 2).toFixed(4), +(0.5 - v.y / 2).toFixed(4)]; }
    console.warn('[arch-cling-plan] ' + JSON.stringify(out));
  }
  // the fountain's water runs (pure in t)
  for (const k of ['pool', 'jet', 'foam', 'puddle']) { const u = S.M[k]?.userData?.dkUniforms?.akTime; if (u) u.value = t; }
  const { sun, sunDir } = S;
  sun.target.position.set(0, 0, 0);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
}
