// Style frame F2 - SCENE 1B, Verdor riding grounds, morning (shot list 1B-02 / 1B-04).
//
// "Move back until Remi comes into view beside him, establishing scale through
// an ordinary human action: reaching for a riding strap ... Farther across the
// field, Leaf sits upright. Abby stands in front of the green Nightwing and
// straightens part of her riding equipment ... An unnamed GROUND KEEPER stands
// well outside Charcoal's launch space."
//
// Map (shot list conventions): Charcoal and his access rig on screen RIGHT (the
// cleared launch area, toward the sea); Leaf and Abby across the field on
// screen LEFT near a building doorway; the ground keeper at the far-left field
// edge. Sun over the sea side, screen right / behind the action (the same sun
// vector as F3), so the dragons are rim lit and the fronts are in soft sky
// fill; morning haze over the sea is thinning.
//
// Cinematography: a long lens from far back (50 mm on Super 35 from ~70 m,
// eye height in the grass, T4): the compression stacks Charcoal's hide across
// the right two thirds of the frame, bigger than the frame, with Remi a small
// figure at his shoulder reaching up for the mounting strap - the scale is read
// from that ordinary human action. Across the field (left, farther) Leaf sits
// upright with Abby at his chest fastening his breast strap; the ground keeper
// waits far left at the field edge, well outside the launch space. The sun is
// the photographed sun of the HDRI sky (same sky, same sun as F3): over the sea,
// ahead-right and high, so the dragons are rim lit and their near sides sit in
// sky fill; a clear spell between drifting cumulus whose shadows cross the
// field. Charcoal lies with his weight down: belly on the turf, neck in a low S,
// chin near the grass, tail curled round; dust and trampled earth around him.
//   node render/render.mjs --still scenes/lookdev/style-f2-riding-grounds.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../lib/sets/terrain.js';
import { terrainMaterial, worldMaterial } from '../lib/sets/materials.js';
import { loadHDRI } from '../lib/assets.js';
import { grassField } from '../lib/sets/grass.js';
import { buildingKit } from '../lib/sets/buildings.js';
import { loadKit } from '../lib/sets/kitbash.js';
import { scatter, bushGeometry, foliageMaterial } from '../lib/sets/scatter.js';
import { person, placePerson, armIK, OUTFITS } from '../lib/sets/people.js';
import { createCreature, poses, loadHuman, createSaddle } from '../lib/creatures/index.js';
import { filmFinish } from './finish.js';

// the same sun as style-f3-flight.js (over the sea, the island inland at -x): the photographed
// sky's sun (Poly Haven kloofendal_48d_partly_cloudy, 48 degrees up) turned to this azimuth
const SUN = new THREE.Vector3(0.598, 0.743, -0.300).normalize();
const HDRI_ROT = 1.093;
// camera axes: looking along F (sun ahead-right, the sea to the right)
const F = new THREE.Vector3(0.687, 0, -0.727).normalize();
const R = new THREE.Vector3(-F.z, 0, F.x);
const GROUND = 9;                 // field height above the sea

export const meta = {
  title: 'Style frame F2 - Verdor riding grounds',
  duration: 8,
  seed: 21,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 2.0, apDistanceScale: 1.3 },
    volumetrics: {
      enabled: true, range: 3000, resolution: [256, 96, 85], noiseFilter: true,
      density: 0.00012, heightFalloff: 0.03, fogBase: 0, anisotropy: 0.75, noiseScale: 0.01, noiseAmount: 0.6,
      banks: [
        // morning mist still lying on the sea and in the far bay
        { center: [1100, 12, -1400], radius: [1600, 30, 900], density: 0.005, noise: 0.8 },
        { center: [500, 6, 200], radius: [500, 14, 600], density: 0.0035, noise: 0.85 },
      ],
      // the cumulus of the photographed sky casts drifting shadows on the field and the buildings
      cloudShadows: { coverage: 0.32, scale: 0.0016, speed: [5, 1.5], altitude: 1400, opacity: 0.55, softness: 0.22 },
    },
    shadows: { cascades: 3, maxDistance: 400 },
    ao: { enabled: true, radius: 1.6 },
    dof: { samples: 48 },
    grade: { exposure: 0.65, whiteBalance: 5800, contrast: 1.06, saturation: 1.0 },
  }),
};

let S;

// coastline: land where x < coastX(z); a bay opens to the north (-z) with a far headland
function coastX(N, z) { return 120 + 25 * N.fbm(z * 0.006, 1.3, 3) + 900 * smooth(-500, -1500, z) + 60 * smooth(-200, 300, z); }

function groundHeight(N) {
  return (x, z) => {
    const d = coastX(N, z) - x;                       // > 0 on land
    const field = GROUND + 0.6 * N.fbm(x * 0.02, z * 0.02, 3) + 0.15 * N.fbm(x * 0.15, z * 0.15, 2);
    const hills = 70 * smooth(150, 900, -(x * F.x + z * F.z) * 0 + (-x + 40)) * (0.6 + 0.4 * N.fbm(x * 0.003, z * 0.003, 3));
    if (d > 0) {
      // the field slopes down to a low rocky shore over the last 60 m
      const toShore = smooth(0, 60, d);
      return GROUND * 0.25 + (field - GROUND * 0.25) * toShore + hills * smooth(60, 400, d) + (1 - toShore) * 1.5 * N.fbm(x * 0.08, z * 0.08, 2);
    }
    return -0.8 * Math.min(-d, 40) * 0.12 - 1.5 + 0.8 * N.fbm(x * 0.05, z * 0.05, 2);
  };
}

export async function setup(ctx) {
  const { scene, camera } = ctx;
  // a photographed morning sky (CC0 HDRI): its sun is extracted into a shadow-casting light with
  // the same energy, the rest lights the scene and is the visible sky
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT, backgroundBlurriness: 0, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  // a clear spell between the clouds: the measured sun of this HDRI is partly veiled; in the
  // gap the direct sun is harder and the sky fill relatively lower (deeper shadows)
  sun.intensity *= 1.5;
  scene.environmentIntensity = 0.85;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const ocean = createOcean(ctx, { windSpeed: 6, windDirection: 200, swell: 0.45, choppiness: 1.1, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05 });
  scene.add(ocean.mesh);

  const N = makeNoise(23);
  const H = groundHeight(N);
  const land = heightfield({
    xs: gradedAxis(-900, 1300, 700, 30, 2.4),
    zs: gradedAxis(-2400, 700, 700, -60, 2.4),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.35, 0.7, 1 - n[1]);
      const shore = 1 - smooth(1.0, 4.0, y);
      // the launch area around Charcoal: worn, trampled earth and torn turf
      const c = S0.charcoal;
      const dl = Math.hypot(x - c.x, z - c.z);
      const worn = (1 - smooth(8, 21, dl + 7 * N.fbm(x * 0.1, z * 0.1, 2) + 3 * N.fbm(x * 0.6, z * 0.6, 2))) * 0.85;
      const turf = (1 - steep) * (1 - shore);
      return [Math.max(steep, shore * 0.7), turf * (1 - worn) * 0.6, turf * (1 - worn) * 0.4, turf * worn + shore * 0.3];
    },
    color: (x, z, y, n) => { const p = N.fbm(x * 0.03 + 4, z * 0.03, 3); const v = 0.85 + 0.35 * p; return [v, v, v * 0.97]; },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 3, tint: [0.62, 0.6, 0.56] },
    { id: 'pbr/acg_ground037', scale: 1.4, tint: [0.26, 0.34, 0.13] },
    { id: 'pbr/acg_ground03', scale: 1.4, tint: [0.3, 0.34, 0.16] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.33, 0.25, 0.16], normalScale: 1.6 },
  ], { macro: 0.5, macroScale: 0.02, detailNear: 60, detailFar: 900, vertexColors: true, minRoughness: 0.82, roughnessScale: 1.3 });
  landMat.envMapIntensity = 0.45;          // turf is not a sheet: little sky sheen at grazing angles
  const island = new THREE.Mesh(land.geometry, landMat);
  island.receiveShadow = true; island.castShadow = true;
  scene.add(island);

  // the field: real blades in clumps (tussocks, not an even carpet) in three layers - short
  // turf, taller darker tussocks, and dry seed stalks - hue and height varying, thinning toward
  // the trampled launch area round Charcoal; the terrain texture takes over far off
  const fieldPlace = (spread, minD, maxD, fadeFrom) => {
    let cx = 0, cz = 0, left = 0;
    return (rng) => {
      if (left <= 0) {
        // uniform per ground area inside the lens' view (+ margin), thinning out far away
        const d = Math.sqrt(minD * minD + rng() * (maxD * maxD - minD * minD));
        if (rng() < Math.max(0, (d - fadeFrom) / (maxD - fadeFrom)) * 0.85) return null;
        const a = (rng() - 0.5) * 0.62;
        const o = at(-2, -2);
        cx = o.x + F.x * d * Math.cos(a) + R.x * d * Math.sin(a); cz = o.z + F.z * d * Math.cos(a) + R.z * d * Math.sin(a);
        left = 2 + Math.floor(rng() * 10);
      }
      left--;
      const rr = Math.sqrt(rng()) * spread, th = rng() * 6.283;
      const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
      const c = S0.charcoal;
      const dc = Math.hypot(x - c.x, z - c.z);
      if (dc < 22 && rng() < 0.9 - 0.7 * Math.max(0, (dc - 12) / 10)) return null;   // trampled launch area
      return [x, H(x, z) - 0.02, z];
    };
  };
  scene.add(grassField({ count: 64000, height: [0.06, 0.22], seed: 5, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place: fieldPlace(0.5, 7, 125, 80) }));
  scene.add(grassField({ count: 10000, height: [0.22, 0.5], seed: 7, blades: 12, width: 1.25, color: [0.035, 0.055, 0.018], dry: [0.22, 0.19, 0.1], dryAmount: 0.65, place: fieldPlace(0.25, 7, 115, 70) }));
  scene.add(grassField({ count: 3500, height: [0.4, 0.75], seed: 11, blades: 3, width: 0.55, color: [0.16, 0.135, 0.065], dry: [0.26, 0.22, 0.12], dryAmount: 0.8, place: fieldPlace(0.6, 7, 90, 60) }));

  // buildings: a stable hall with its great door behind Leaf, a long range and a tower
  const kit = await buildingKit(ctx, { groundY: GROUND, stone: 'pbr/ph_white_sandstone_bricks_03', stoneScale: 3.0, stoneTint: [0.92, 0.9, 0.86], saturation: 0.25, normalScale: 2.0 });
  const yaw = Math.atan2(-F.x, -F.z);                     // facades face the camera
  const placeB = (obj, f, r, yOff = 0, extraYaw = 0) => {
    const x = F.x * f + R.x * r, z = F.z * f + R.z * r;
    obj.position.set(x, H(x, z) - 0.3 + yOff, z); obj.rotation.y = yaw + extraYaw; scene.add(obj); return obj;
  };
  // (the long lens compresses them up behind the dragons: the stable door is behind Leaf)
  const stable = placeB(kit.hall({ w: 26, d: 12, h: 7.5, pitch: 0.8, door: { w: 5.2, h: 6.2, arch: true }, windows: 4 }), 150, -22, 0, 0.18);
  // the stable's dim interior behind the great door (a bounce card: daylight spilling in off the
  // field lights straw, stalls and the back wall faintly - never a black void)
  {
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(9, 7.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.024, 0.017) }));
    inner.position.set(0, 3.6, 12 / 2 - 3.5); stable.add(inner);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.05, 0.03) }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.32, 12 / 2 - 1.8); stable.add(floor);
  }
  placeB(kit.hall({ w: 30, d: 10, h: 6, pitch: 0.75, windows: 5, chimney: true }), 182, -62, 0, 0.3);
  placeB(kit.tower({ r: 3.6, h: 17, capH: 6 }), 176, 4);
  placeB(kit.hall({ w: 14, d: 9, h: 5.5, pitch: 0.8, windows: 2, gableDoor: true }), 196, 30, 0, -0.25);
  // a dry-stone wall along the field edge on the left
  const wallPts = [];
  for (let i = 0; i <= 10; i++) { const f = 28 + i * 9, r = -36 - i * 1.5 + 2 * Math.sin(i); wallPts.push([F.x * f + R.x * r, F.z * f + R.z * r]); }
  scene.add(kit.fieldWall(wallPts, H, { h: 1.15, t: 0.75 }));

  // far headland across the bay: kitbashed photo-scanned cliffs (Poly Haven scans, CC0, via the
  // Babylon.js coastal-cliff composition, CC BY 4.0)
  const ck = await loadKit(ctx, 'model/babylon_coastal_cliff');
  const faces = [];
  for (let z = -1700; z < -1150; z += 70) {
    const x = coastX(N, z) - 20;
    faces.push({ p: [x, -4, z], s: [5.5, 7, 5], r: Math.PI / 2 + 0.6 + 0.3 * Math.sin(z) });
  }
  scene.add(ck.instance('coastal_cliff_01', faces));
  // gorse on the slopes behind the buildings
  const foliage = foliageMaterial({ color: [0.04, 0.065, 0.025], leafScale: 4, flower: [0.55, 0.42, 0.04, 0.4] });
  scene.add(scatter(bushGeometry(2, 3), foliage, 1500, (rng) => {
    const f = 140 + rng() * 500, r = -260 + rng() * 300;
    const x = F.x * f + R.x * r, z = F.z * f + R.z * r, y = H(x, z);
    if (y < 3 || N.fbm(x * 0.02, z * 0.02, 2) < 0) return null;
    const s = 1.5 + rng() * 3;
    return { p: [x, y - 0.3, z], s: [s, s * 0.6, s], c: [0.8 + rng() * 0.4, 1, 0.9] };
  }, 9));

  // ---- the dragons, the riders, the ground keeper (provisional designs)
  const [charcoal, leaf] = await Promise.all([createCreature('charcoal', { quality: 'hero' }), createCreature('leaf', { quality: 'hero' })]);
  scene.add(charcoal.root, leaf.root);
  const rig = createSaddle(charcoal, {});
  // a black membrane passes little light; broad, low sheen (skin, not lacquer)
  for (const c of [charcoal, leaf]) { c.materials.membrane.roughness = 0.9; c.materials.membrane.envMapIntensity = 0.3; }
  charcoal.materials.membrane.userData.dkUniforms.uTransCol.value.multiplyScalar(0.15);
  const human = await loadHuman();
  // riding clothes: Remi in boots, trousers and a belted dark jacket under a muted blue outer
  // layer light enough to read against black Charcoal; the keeper in a short brown work tunic
  const remi = person(human, { ...OUTFITS.remi, jacket: [0.15, 0.2, 0.29], skirt: false }, 'reachUp');
  const abby = person(human, { ...OUTFITS.abby, skirt: false }, 'handsWork');
  const keeper = person(human, { ...OUTFITS.keeper, jacket: [0.16, 0.12, 0.08], skirt: -0.32 }, 'wait', { headYaw: -0.5 });
  scene.add(remi.root, abby.root, keeper.root);
  // Leaf's saddle stays on (Abby is fixing a strap on it)
  const leafTack = createSaddle(leaf, {});
  void leafTack;

  // a mounting strap hanging from the riding rig down the flank (Remi reaches for it), and
  // Leaf's breast strap across his chest (Abby is fastening it)
  const strapMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.03, 0.018), roughness: 0.6 });
  const strap = new THREE.Mesh(new THREE.BufferGeometry(), strapMat);
  strap.castShadow = true; strap.receiveShadow = true; strap.frustumCulled = false;
  const breast = new THREE.Mesh(new THREE.BufferGeometry(), strapMat);
  breast.castShadow = true; breast.receiveShadow = true; breast.frustumCulled = false;
  scene.add(strap, breast);

  camera.near = 0.3; camera.far = 30000;
  S = { sun, ocean, charcoal, leaf, rig, remi, abby, keeper, strap, breast, H, N };
}

// layout (computed once, pure): positions in the camera frame (F ahead, R right)
const at = (f, r) => new THREE.Vector3(F.x * f + R.x * r, 0, F.z * f + R.z * r);
const S0 = {
  charcoal: at(70, 9),
  leaf: at(122, -15),
};

const DEBUG_CAM = null;   // 'leaf' | 'remi' for close-up checks

export function update(t, ctx) {
  const { sun, ocean, charcoal, leaf, rig, remi, abby, keeper, strap, breast, H } = S;
  ocean.update(t);

  // Charcoal resting on the field with his weight down: belly on the turf, neck in a low S,
  // chin near the grass, head toward screen-left and a little toward camera, watching Leaf
  const cdir = new THREE.Vector3().addScaledVector(R, -0.95).addScaledVector(F, -0.32).normalize();
  const cp = S0.charcoal;
  const lp0 = poses.lie(charcoal, { t, raise: -0.62, headDown: 0.32, look: [0.32, 0.02], lidRelax: 0.42 });
  lp0.groundBones = [];          // rest the chest and belly on the ground (the folded legs sink into the turf)
  charcoal.setPose(lp0);
  charcoal.root.position.set(cp.x, H(cp.x, cp.z) - 0.35, cp.z);
  charcoal.root.rotation.set(0, Math.atan2(cdir.x, cdir.z), 0);
  charcoal.root.updateMatrixWorld(true);

  // Remi at Charcoal's near shoulder, reaching up for the mounting strap
  const toCam = new THREE.Vector3(-cp.x, 0, -cp.z).normalize();
  const shoulder = cp.clone().addScaledVector(cdir, 7.0).addScaledVector(toCam, 4.6);
  placePerson(remi, shoulder.x, H(shoulder.x, shoulder.z), shoulder.z, Math.atan2(-toCam.x, -toCam.z) + 0.5);
  // the strap: from the side of the riding rig, over the shoulder, down to just above Remi's raised hand
  {
    remi.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3().setFromMatrixPosition(remi.bones[remi.index['wrist.R']].matrixWorld);
    const bi = charcoal.bones.indexOf(rig.seatBone);
    const seat = rig.seatPoint.clone().applyMatrix4(charcoal.skeleton.boneInverses[bi]).applyMatrix4(rig.seatBone.matrixWorld);
    const top = seat.clone().addScaledVector(toCam, 1.6);
    const mid = top.clone().lerp(hand, 0.5).addScaledVector(toCam, 2.4);
    const curve = new THREE.CatmullRomCurve3([seat.clone().addScaledVector(toCam, 0.8), top, mid, hand.clone().add(new THREE.Vector3(0, 0.12, 0))]);
    strap.geometry.dispose();
    strap.geometry = new THREE.TubeGeometry(curve, 48, 0.045, 6, false);
  }

  // Leaf sitting upright across the field in front of the stable door, turned three-quarters
  // to camera, his wings folded flat along his flanks
  const lp = S0.leaf;
  const ldir = new THREE.Vector3().addScaledVector(F, -0.75).addScaledVector(R, 0.66).normalize();
  const lside = new THREE.Vector3(ldir.z, 0, -ldir.x);
  leaf.setPose(poses.sit(leaf, { t, look: [0.5, 0.1], foldVariant: 'sitFlank', wingComp: 0, wingAdduct: 0.18 }));
  const gy = H(lp.x, lp.z);
  leaf.root.position.set(lp.x, gy - 0.05, lp.z);
  leaf.root.rotation.set(0, Math.atan2(ldir.x, ldir.z), 0);
  leaf.root.updateMatrixWorld(true);
  // his breast strap, and Abby standing at his chest fastening it with both hands
  {
    const th = new THREE.Vector3().setFromMatrixPosition(leaf.bones[leaf.boneIndex.thorax].matrixWorld);
    const rad = 0.068 * leaf.L;
    const sy = Math.min(th.y, gy + 1.45);                     // where the collar crosses in front: chest low
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = -1.75 + 3.5 * i / 16;
      const front = Math.cos(a);
      pts.push(new THREE.Vector3().copy(th).addScaledVector(ldir, Math.cos(a) * rad * 1.04).addScaledVector(lside, Math.sin(a) * rad * 1.04).setY(th.y + (sy - th.y) * Math.max(0, front)));
    }
    breast.geometry.dispose();
    breast.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 6, false);
    const fp = th.clone().addScaledVector(ldir, rad * 1.05).setY(sy);
    const ab = fp.clone().addScaledVector(ldir, 0.42);
    placePerson(abby, ab.x, H(ab.x, ab.z), ab.z, Math.atan2(-ldir.x, -ldir.z));
    const sh = new THREE.Vector3().setFromMatrixPosition(abby.bones[abby.index['upperarm01.R']].matrixWorld);
    for (const [sd, k] of [['L', -1], ['R', 1]]) {
      const tgt = fp.clone().addScaledVector(lside, k * 0.13).addScaledVector(ldir, 0.03);
      armIK(abby, sd, tgt, tgt.clone().addScaledVector(ldir, 0.5).addScaledVector(lside, k * 0.4).add(new THREE.Vector3(0, -0.5, 0)), { wristPitch: 0.3 });
    }
    void sh;
  }
  // the ground keeper at the far-left field edge, well outside the launch space
  const kp = at(132, -27);
  placePerson(keeper, kp.x, H(kp.x, kp.z), kp.z, Math.atan2(R.x, R.z) - 0.2);

  // camera: eye height in the grass far back, a long lens, a slow drift (the end of the pull-back)
  const cam = ctx.camera;
  const c0 = at(-2 - t * 0.2, -2);
  cam.position.set(c0.x, H(c0.x, c0.z) + 1.4, c0.z);
  const look = at(70, -1);
  cam.lookAt(look.x, H(look.x, look.z) + 5.2, look.z);
  applyShake(cam, t, { kind: 'handheld', amount: 0.12, seed: 2 });
  if (DEBUG_CAM === 'leaf') { const q = lp.clone().addScaledVector(ldir, 3).addScaledVector(lside, -11); cam.position.set(q.x, gy + 2.5, q.z); cam.lookAt(lp.x, gy + 2, lp.z); }
  if (DEBUG_CAM === 'remi') { const q = shoulder.clone().addScaledVector(toCam, 12); cam.position.set(q.x, H(q.x, q.z) + 2, q.z); cam.lookAt(shoulder.x, H(shoulder.x, shoulder.z) + 2.5, shoulder.z); }
  cam.updateMatrixWorld(true);

  sun.target.position.set(cp.x - 10, 0, cp.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 500);

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = DEBUG_CAM ? 35 : 50;
  ctx.lens.fstop = 4;
  ctx.lens.focusTarget = DEBUG_CAM === 'leaf' ? leaf.root : remi.root;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
}
