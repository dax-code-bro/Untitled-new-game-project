// Style frame F2 - SCENE 1B, Verdor riding grounds, morning (shot list 1B-02 / 1B-04).
//
// "Move back until Remi comes into view beside him, establishing scale through
// an ordinary human action: reaching for a riding strap ... Farther across the
// field, Leaf sits upright. Abby stands in front of the green Nightwing and
// straightens part of her riding equipment ... An unnamed GROUND KEEPER stands
// well outside Charcoal's launch space."  1B-01: "Black scales show texture and
// natural highlights."
//
// Map (shot list verdor_grounds_map): Charcoal and his grounded access rig on screen RIGHT (the
// cleared launch area, toward the sea); Leaf and Abby across the field on screen LEFT in front of
// the stable's dragon door; the ground keeper at the far-left field edge by the keepers' lodge.
//
// Light: the sun is over the sea side, screen RIGHT and a little behind the dragons (the same
// photographed sky and sun as F3: Poly Haven kloofendal_48d_partly_cloudy, 48 degrees up). That
// is a high three-quarter back/side light: it lies along Charcoal's back, neck and the upper curve
// of his flank, so the black scales show their glossy crowns and dusty grooves instead of a
// silhouette, and the side toward the lens sits in soft sky fill with turf bounce from below.
//
// Cinematography: a long lens from far back (50 mm on Super 35 from ~75 m, eye height in the
// grass, T4): the compression stacks Charcoal's hide across the right of frame, his access rig (a
// braced oak tower with a drawbridge gangway lowered onto his back) at his shoulder, and Remi a
// small figure at his foreleg reaching up for the mounting strap that hangs from the riding rig.
// Across the field (left, farther) Leaf sits upright with Abby at his chest fastening the breast
// strap; the keeper waits far left outside the launch space.
//
// Models: creatures (scenes/lib/creatures), people (scenes/lib/humans cast builds: remi, abby,
// keeper1), buildings (scenes/lib/architecture verdor.js: stable, keepers' lodge, access rig).
//   node render/render.mjs --still scenes/lookdev/style-f2-riding-grounds.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../lib/sets/terrain.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { loadHDRI } from '../lib/assets.js';
import { grassField } from '../lib/sets/grass.js';
import { scatter, bushGeometry, foliageMaterial } from '../lib/sets/scatter.js';
import { limbIK, lookAtPoint, bonePos } from '../lib/sets/cast.js';
import { strapRibbon } from '../lib/sets/props.js';
import { createCreature, poses, createSaddle } from '../lib/creatures/index.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { Kit, yawFrame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { stable, keeperHouse, accessRig } from '../lib/architecture/verdor.js';
import { filmFinish } from './finish.js';

// camera axes: looking along F (the sea to the right, beyond the launch area)
const F = new THREE.Vector3(0.687, 0, -0.727).normalize();
const R = new THREE.Vector3(-F.z, 0, F.x);
const GROUND = 9;                 // field height above the sea
// the sun: over the sea side, screen right and a little behind the action (az. 72 deg from the
// lens axis), 48 deg up (the HDRI's own sun elevation)
const SUN_AZ = 1.55;
const SUN_H = new THREE.Vector3().addScaledVector(F, Math.cos(SUN_AZ)).addScaledVector(R, Math.sin(SUN_AZ)).normalize();
const KLOOF_AZ0 = 0.942;          // azimuth (atan2(x, z)) of kloofendal's sun at rotationY 0
const HDRI_ROT = Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0;

export const meta = {
  title: 'Style frame F2 - Verdor riding grounds',
  duration: 8,
  seed: 21,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 2.0, apDistanceScale: 1.3 },
    volumetrics: {
      enabled: true, range: 3000, resolution: [256, 96, 85], noiseFilter: true,
      density: 0.0001, heightFalloff: 0.03, fogBase: 0, anisotropy: 0.75, noiseScale: 0.01, noiseAmount: 0.6,
      banks: [
        // morning mist still lying on the sea and in the far bay
        { center: [1100, 12, -1400], radius: [1600, 30, 900], density: 0.005, noise: 0.8 },
        { center: [500, 6, 200], radius: [500, 14, 600], density: 0.0035, noise: 0.85 },
      ],
      cloudShadows: { coverage: 0.25, scale: 0.0016, speed: [5, 1.5], altitude: 1400, opacity: 0.45, softness: 0.22 },
    },
    shadows: { cascades: 3, maxDistance: 400 },
    ao: { enabled: true, radius: 1.6 },
    dof: { samples: 48 },
    grade: { exposure: 1.75, whiteBalance: 5900, contrast: 1.04, saturation: 1.0 },
  }),
};

let S;

// coastline: land where x < coastX(z); a bay opens to the north (-z) with a far headland
function coastX(N, z) { return 235 + 25 * N.fbm(z * 0.006, 1.3, 3) + 900 * smooth(-500, -1500, z) + 60 * smooth(-200, 300, z); }

// layout in the camera frame (F ahead, R right), metres from the camera's foot
const at = (f, r) => new THREE.Vector3(F.x * f + R.x * r, 0, F.z * f + R.z * r);
const CAM = at(-2, -2);
const L = {
  charcoal: at(60, 6),
  leaf: at(118, -24),
  stable: at(176, -35),
  lodge: at(170, -62),
  keeper: at(140, -38),
};

function groundHeight(N) {
  const yard = [L.stable, L.lodge, L.leaf];
  return (x, z) => {
    const d = coastX(N, z) - x;                       // > 0 on land
    let field = GROUND + 0.25 * N.fbm(x * 0.02, z * 0.02, 3) + 0.1 * N.fbm(x * 0.15, z * 0.15, 2);
    // the yard in front of the buildings is level (the buildings stand on it)
    let flat = 0;
    for (const p of yard) flat = Math.max(flat, smooth(40, 22, Math.hypot(x - p.x, z - p.z)));
    field = field + (GROUND - field) * flat;
    const hills = 70 * smooth(150, 900, -x + 40) * (0.6 + 0.4 * N.fbm(x * 0.003, z * 0.003, 3));
    if (d > 0) {
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
  // a clear spell between the clouds: the direct sun a little harder than the HDRI's veiled one
  sun.intensity *= 1.45;
  scene.environmentIntensity = 0.9;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  const SUN = sky.sun.direction.clone();

  const ocean = createOcean(ctx, { windSpeed: 6, windDirection: 200, swell: 0.45, choppiness: 1.1, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05 });
  scene.add(ocean.mesh);

  const N = makeNoise(23);
  const H = groundHeight(N);
  const C0 = L.charcoal;
  const land = heightfield({
    xs: gradedAxis(-900, 1300, 700, 30, 2.4),
    zs: gradedAxis(-2400, 700, 700, -60, 2.4),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.35, 0.7, 1 - n[1]);
      const shore = 1 - smooth(1.0, 4.0, y);
      // the launch area round Charcoal: worn, trampled earth and torn turf; trodden mud before
      // the stable door and round the rig's stair foot
      const dl = Math.hypot(x - C0.x, z - C0.z);
      const worn = (1 - smooth(8, 22, dl + 7 * N.fbm(x * 0.1, z * 0.1, 2) + 3 * N.fbm(x * 0.6, z * 0.6, 2))) * 0.85;
      const door = (1 - smooth(4, 13, Math.hypot(x - L.leaf.x, z - L.leaf.z) + 5 * N.fbm(x * 0.2, z * 0.2, 2))) * 0.7;
      const w = Math.max(worn, door);
      const turf = (1 - steep) * (1 - shore);
      return [Math.max(steep, shore * 0.7), turf * (1 - w) * 0.6, turf * (1 - w) * 0.4, turf * w + shore * 0.3];
    },
    color: (x, z) => { const p = N.fbm(x * 0.03 + 4, z * 0.03, 3); const v = 0.85 + 0.35 * p; return [v, v, v * 0.97]; },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 3, tint: [0.62, 0.6, 0.56] },
    { id: 'pbr/acg_ground037', scale: 1.4, tint: [0.26, 0.34, 0.13] },
    { id: 'pbr/acg_ground03', scale: 1.4, tint: [0.3, 0.34, 0.16] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.33, 0.25, 0.16], normalScale: 1.6 },
  ], { macro: 0.5, macroScale: 0.02, detailNear: 60, detailFar: 900, vertexColors: true, minRoughness: 0.82, roughnessScale: 1.3 });
  landMat.envMapIntensity = 0.45;
  const island = new THREE.Mesh(land.geometry, landMat);
  island.receiveShadow = true; island.castShadow = true;
  scene.add(island);

  // the field: real blades in clumps in three layers, thinning toward the trampled launch area
  const fieldPlace = (spread, minD, maxD, fadeFrom) => {
    let cx = 0, cz = 0, left = 0;
    return (rng) => {
      if (left <= 0) {
        const d = Math.sqrt(minD * minD + rng() * (maxD * maxD - minD * minD));
        if (rng() < Math.max(0, (d - fadeFrom) / (maxD - fadeFrom)) * 0.85) return null;
        const a = (rng() - 0.5) * 0.62;
        cx = CAM.x + F.x * d * Math.cos(a) + R.x * d * Math.sin(a); cz = CAM.z + F.z * d * Math.cos(a) + R.z * d * Math.sin(a);
        left = 2 + Math.floor(rng() * 10);
      }
      left--;
      const rr = Math.sqrt(rng()) * spread, th = rng() * 6.283;
      const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
      const dc = Math.hypot(x - C0.x, z - C0.z);
      if (dc < 23 && rng() < 0.92 - 0.7 * Math.max(0, (dc - 13) / 10)) return null;
      if (Math.hypot(x - L.leaf.x, z - L.leaf.z) < 9 && rng() < 0.7) return null;
      return [x, H(x, z) - 0.02, z];
    };
  };
  scene.add(grassField({ count: 64000, height: [0.06, 0.22], seed: 5, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place: fieldPlace(0.5, 7, 125, 80) }));
  scene.add(grassField({ count: 10000, height: [0.22, 0.5], seed: 7, blades: 12, width: 1.25, color: [0.035, 0.055, 0.018], dry: [0.22, 0.19, 0.1], dryAmount: 0.65, place: fieldPlace(0.25, 7, 70, 40) }));
  scene.add(grassField({ count: 3500, height: [0.4, 0.75], seed: 11, blades: 3, width: 0.55, color: [0.16, 0.135, 0.065], dry: [0.26, 0.22, 0.12], dryAmount: 0.8, place: fieldPlace(0.6, 7, 60, 35) }));

  // ---- buildings (architecture library): the stable with its dragon door behind Leaf, the
  // keepers' lodge at the far-left field edge, Charcoal's access rig at his shoulder
  const M = await archMaterials(ctx);
  const faceCam = Math.atan2(-F.x, -F.z);                    // local +z (the fronts) toward the lens
  const yard = new Kit(0);
  stable(yard, yawFrame([L.stable.x, 0, L.stable.z], faceCam + 0.16), { lod: 'mid', open: 0.7 });
  keeperHouse(yard, yawFrame([L.lodge.x, 0, L.lodge.z], faceCam + 0.35), { lod: 'mid' });
  const yardG = yard.build(M, { name: 'verdor-yard' });
  yardG.position.y = GROUND - 0.05;
  scene.add(yardG);

  // gorse on the slopes behind the buildings
  const foliage = foliageMaterial({ color: [0.04, 0.065, 0.025], leafScale: 4, flower: [0.55, 0.42, 0.04, 0.4] });
  scene.add(scatter(bushGeometry(2, 3), foliage, 1500, (rng) => {
    const f = 175 + rng() * 480, r = -260 + rng() * 300;
    const x = CAM.x + F.x * f + R.x * r, z = CAM.z + F.z * f + R.z * r, y = H(x, z);
    if (y < 3 || N.fbm(x * 0.02, z * 0.02, 2) < 0) return null;
    const s = 1.5 + rng() * 3;
    return { p: [x, y - 0.3, z], s: [s, s * 0.6, s], c: [0.8 + rng() * 0.4, 1, 0.9] };
  }, 9));

  // ---- the dragons (provisional designs)
  const [charcoal, leaf] = await Promise.all([createCreature('charcoal', { quality: 'hero' }), createCreature('leaf', { quality: 'hero' })]);
  scene.add(charcoal.root, leaf.root);
  const rig = createSaddle(charcoal, {});
  createSaddle(leaf, {});                                    // Abby is fixing a strap on it

  // Charcoal's pose is fixed for the frame: lying with his weight down, chin near the grass
  const cdir = new THREE.Vector3().addScaledVector(R, -0.88).addScaledVector(F, -0.47).normalize();
  const cyaw = Math.atan2(cdir.x, cdir.z);
  const lp0 = poses.lie(charcoal, { t: 2, raise: -0.62, headDown: 0.32, look: [0.3, 0.02], lidRelax: 0.42 });
  lp0.groundBones = [];
  charcoal.setPose(lp0);
  charcoal.root.position.set(C0.x, H(C0.x, C0.z) - 0.35, C0.z);
  charcoal.root.rotation.set(0, cyaw, 0);
  charcoal.root.updateMatrixWorld(true);
  const seatW = () => {
    const bi = charcoal.bones.indexOf(rig.seatBone);
    return rig.seatPoint.clone().applyMatrix4(charcoal.skeleton.boneInverses[bi]).applyMatrix4(rig.seatBone.matrixWorld);
  };
  const seat0 = seatW();
  // the access rig on the near side of his shoulder: its gangway (hinged at the deck, 6 m) comes
  // down onto his back beside the seat; the rig's own frame: gangway along +z, stair on -x
  const toCam = new THREE.Vector3(CAM.x - C0.x, 0, CAM.z - C0.z).normalize();
  const side = new THREE.Vector3(-cdir.z, 0, cdir.x);       // across his body
  const nearSide = side.dot(toCam) > 0 ? side : side.clone().negate();
  // the rig stands on his FAR side: its tower is hidden behind his body, the deck, the posts and
  // the gangway show above his back (the gangway runs from the deck toward him, i.e. toward camera)
  const gz = nearSide.clone();
  // where the gangway's leather bolster rests: on his back beside the seat, on the near side; the
  // hide's height there is found by a ray down onto the posed body mesh
  const landing = seat0.clone().addScaledVector(nearSide, -1.3).addScaledVector(cdir, 0.6);
  let hideY = seat0.y - 0.6;
  {
    const ray = new THREE.Raycaster(landing.clone().setY(seat0.y + 6), new THREE.Vector3(0, -1, 0), 0, 20);
    const body = [];
    charcoal.root.traverse((o) => { if (o.isSkinnedMesh && o.geometry.attributes.position.count > 50000) body.push(o); });
    const hit = ray.intersectObjects(body, false)[0];
    if (hit) hideY = hit.point.y;
  }
  const GL = 8, DROP = 0.9;
  const deckD = 3.4 * (1 - 0.035) + 0.6;
  const reach = deckD / 2 + Math.sqrt(GL * GL - DROP * DROP) + 0.1;
  const rigO = landing.clone().addScaledVector(gz, -reach);
  const rigGround = H(rigO.x, rigO.z) - 0.05;
  const rigH = hideY + 0.17 + 0.02 - 0.1 + DROP - rigGround;   // the bolster (r 0.17) sits on the hide
  const rk = new Kit(0);
  accessRig(rk, yawFrame([rigO.x, 0, rigO.z], Math.atan2(gz.x, gz.z)), { H: rigH, gangway: GL, gangwayDrop: DROP, lod: 'mid' });
  const rigG = rk.build(M, { name: 'access-rig' });
  rigG.position.y = rigGround;
  scene.add(rigG);

  // ---- people (humans library cast builds, provisional looks)
  const [remi, abby, keeper] = await Promise.all([loadCharacter('remi'), loadCharacter('abby'), loadCharacter('keeper1')]);
  scene.add(remi.root, abby.root, keeper.root);

  // a mounting strap: a broad leather strap from the riding rig down over his shoulder, its end
  // hanging free beside the foreleg where Remi can reach it
  const strapMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.045, 0.028, 0.017), roughness: 0.62 });
  const strap = new THREE.Mesh(new THREE.BufferGeometry(), strapMat);
  strap.castShadow = true; strap.receiveShadow = true; strap.frustumCulled = false;
  const breast = new THREE.Mesh(new THREE.BufferGeometry(), strapMat);
  breast.castShadow = true; breast.receiveShadow = true; breast.frustumCulled = false;
  scene.add(strap, breast);

  camera.near = 0.3; camera.far = 30000;
  S = { sun, SUN, ocean, charcoal, leaf, rig, seatW, remi, abby, keeper, strap, breast, H, cdir, nearSide, toCam };
  console.warn('[f2] sun', SUN.toArray().map((v) => v.toFixed(3)).join(','), 'rigH', rigH.toFixed(2), 'seat', seat0.toArray().map((v) => v.toFixed(2)).join(','));
}

// close-up checks (not part of the frame): --time 101 Leaf + Abby, 102 Remi, 103 the rig
const DEBUG = { 101: 'leaf', 102: 'remi', 103: 'rig' };

export function update(t, ctx) {
  const DEBUG_CAM = DEBUG[Math.round(t)] || null;
  if (DEBUG_CAM) t = 2;
  const { sun, SUN, ocean, charcoal, leaf, remi, abby, keeper, strap, breast, H, cdir, nearSide, toCam } = S;
  ocean.update(t);
  // Charcoal breathes (the pose's breathing only; he lies still)
  const lp0 = poses.lie(charcoal, { t, raise: -0.62, headDown: 0.32, look: [0.3, 0.02], lidRelax: 0.42 });
  lp0.groundBones = [];
  charcoal.setPose(lp0);
  charcoal.root.updateMatrixWorld(true);
  const cp = L.charcoal;

  // Remi beside the foreleg on the near side, reaching up for the hanging strap end
  const seat = S.seatW();
  const shoulder = cp.clone().addScaledVector(cdir, 7.6).addScaledVector(nearSide, 5.4);
  const ry = H(shoulder.x, shoulder.z);
  const faceDir = cp.clone().addScaledVector(cdir, 7.0).sub(shoulder).setY(0).normalize();
  remi.update(t);
  placeCharacter(remi, shoulder.x, ry, shoulder.z, Math.atan2(faceDir.x, faceDir.z) - 0.35);
  remi.update(t);
  const grip = shoulder.clone().addScaledVector(faceDir, 0.42).setY(ry + 2.12).addScaledVector(nearSide, -0.05);
  limbIK(remi, 'arm', 'R', grip, grip.clone().addScaledVector(faceDir, -0.6).add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(nearSide, 0.4));
  lookAtPoint(remi, grip.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.8);
  // the strap: from the seat over the shoulder, down the flank, its end just above his hand
  {
    const top = seat.clone().addScaledVector(nearSide, 1.6).add(new THREE.Vector3(0, -0.3, 0));
    const hand = bonePos(remi, 'wrist.R');
    const mid = top.clone().lerp(hand, 0.45).addScaledVector(nearSide, 1.6);
    const pts = [seat.clone().addScaledVector(nearSide, 0.6), top, mid, hand.clone().add(new THREE.Vector3(0, 0.05, 0)), hand.clone().add(new THREE.Vector3(0, -0.35, 0)).addScaledVector(nearSide, 0.05)];
    strap.geometry.dispose();
    strap.geometry = strapRibbon(new THREE.CatmullRomCurve3(pts), 0.075, 0.008, 64, nearSide);
  }

  // Leaf sitting upright in front of the stable door, three-quarters to camera, wings folded
  const lp = L.leaf;
  const ldir = new THREE.Vector3().addScaledVector(F, -0.75).addScaledVector(R, 0.66).normalize();
  const lside = new THREE.Vector3(ldir.z, 0, -ldir.x);
  leaf.setPose(poses.sit(leaf, { t, look: [0.5, 0.1], foldVariant: 'sitFlank', wingComp: 0, wingAdduct: 0.18 }));
  const gy = H(lp.x, lp.z);
  leaf.root.position.set(lp.x, gy - 0.05, lp.z);
  leaf.root.rotation.set(0, Math.atan2(ldir.x, ldir.z), 0);
  leaf.root.updateMatrixWorld(true);
  // his breast strap, and Abby at his chest fastening it with both hands
  {
    const th = new THREE.Vector3().setFromMatrixPosition(leaf.bones[leaf.boneIndex.thorax].matrixWorld);
    const rad = 0.068 * leaf.L;
    const sy = Math.min(th.y, gy + 1.45);
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = -1.75 + 3.5 * i / 16;
      const front = Math.cos(a);
      pts.push(new THREE.Vector3().copy(th).addScaledVector(ldir, Math.cos(a) * rad * 1.04).addScaledVector(lside, Math.sin(a) * rad * 1.04).setY(th.y + (sy - th.y) * Math.max(0, front)));
    }
    breast.geometry.dispose();
    breast.geometry = strapRibbon(new THREE.CatmullRomCurve3(pts), 0.06, 0.008, 48, null);
    const fp = th.clone().addScaledVector(ldir, rad * 1.05).setY(sy);
    const ab = fp.clone().addScaledVector(ldir, 0.5);
    abby.update(t);
    placeCharacter(abby, ab.x, H(ab.x, ab.z), ab.z, Math.atan2(-ldir.x, -ldir.z));
    abby.update(t);
    for (const [sd, k] of [['L', -1], ['R', 1]]) {
      const tgt = fp.clone().addScaledVector(lside, k * 0.12).addScaledVector(ldir, 0.06);
      limbIK(abby, 'arm', sd, tgt, tgt.clone().addScaledVector(ldir, 0.5).addScaledVector(lside, k * 0.5).add(new THREE.Vector3(0, -0.6, 0)));
    }
    lookAtPoint(abby, fp, 0.7);
  }
  // the ground keeper at the far-left field edge, well outside the launch space, watching Charcoal
  const kp = L.keeper;
  keeper.update(t);
  const tk = new THREE.Vector3(cp.x - kp.x, 0, cp.z - kp.z).normalize();
  placeCharacter(keeper, kp.x, H(kp.x, kp.z), kp.z, Math.atan2(tk.x, tk.z) - 0.4);
  keeper.update(t);

  // camera: eye height in the grass far back, a long lens, a slow drift (the end of the pull-back)
  const cam = ctx.camera;
  const c0 = at(-2 - t * 0.2, -2);
  cam.position.set(c0.x, H(c0.x, c0.z) + 2.6, c0.z);
  const look = at(60, -3);
  cam.lookAt(look.x, H(look.x, look.z) + 3.6, look.z);
  applyShake(cam, t, { kind: 'handheld', amount: 0.12, seed: 2 });
  if (DEBUG_CAM === 'leaf') { const q = lp.clone().addScaledVector(ldir, 4).addScaledVector(lside, -9); cam.position.set(q.x, gy + 2.2, q.z); cam.lookAt(lp.x, gy + 1.6, lp.z); }
  if (DEBUG_CAM === 'remi') { const q = shoulder.clone().addScaledVector(toCam, 9); cam.position.set(q.x, ry + 1.8, q.z); cam.lookAt(shoulder.x, ry + 1.6, shoulder.z); }
  if (DEBUG_CAM === 'rig') { const q = cp.clone().addScaledVector(toCam, 40).addScaledVector(cdir, 10); cam.position.set(q.x, ry + 6, q.z); cam.lookAt(cp.x, ry + 6, cp.z); }
  cam.updateMatrixWorld(true);
  if (t === 2) {
    cam.updateProjectionMatrix();
    const scr = (o) => { const v = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(cam); return [+(0.5 + v.x / 2).toFixed(3), +(0.5 - v.y / 2).toFixed(3)]; };
    console.warn('[f2] screen', JSON.stringify({ leaf: scr(leaf.root), abby: scr(abby.root), remi: scr(remi.root), keeper: scr(keeper.root) }));
  }

  sun.target.position.set(cp.x - 10, 0, cp.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 500);

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = DEBUG_CAM ? 35 : 50;
  ctx.lens.fstop = 4;
  ctx.lens.focusTarget = DEBUG_CAM === 'leaf' ? leaf.root : remi.root;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
}
