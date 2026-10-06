// Style frame F1 - PROLOGUE, dawn (shot list P-03 / P-06).
//
// "Fade into a low view just above the water. The pale sky is reflected
// between moving bands of deep blue. The camera travels toward an island whose
// high ground disappears into morning cloud. A wooden vessel crosses the
// foreground, small and unremarkable ... The mist changes shape. Something
// passes beyond it, large enough that the eye initially mistakes the shadow
// for cloud."
//
// Cinematography: camera 2.6 m above a living FFT sea (riding the swell, a
// fresh breeze with whitecaps), 35 mm on Super 35, looking toward a low sun
// half veiled by a cloud bank, its glitter path running down the sea. The
// island is 3D terrain whose high ground disappears into a clumped cloud cap
// (volumetric banks); a small 11th-12th-century trading ship (a one-masted
// knarr, built procedurally: no period ship exists in the free libraries this
// project can reach) crosses the foreground, heeling to the wind, with its
// wake and bow wave. Something vast passes INSIDE the mist above the sea: it
// is never seen - it only casts its shadow through the sunlit fog (a
// shadow-only body in the sun's shadow map cuts a wing-shaped wedge out of the
// light shafts) and darkens the mist where it is (a heavily diffused
// silhouette). The eye reads moving cloud first. Nothing here is a clear dragon.
//
//   node render/render.mjs --still scenes/lookdev/style-f1-prologue.js --time 3 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { filmFinish } from './finish.js';
import { loadHDRI } from '../lib/assets.js';
import { knarr } from '../lib/sets/ship.js';
import { person } from '../lib/sets/people.js';
import { loadHuman } from '../lib/creatures/index.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../lib/sets/terrain.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { createCreature, poses } from '../lib/creatures/index.js';
import { silhouetteCard } from '../lib/sets/fx.js';

// world: camera near the origin looking north (-z); the island lies 1.9 km
// out, the sun is low behind the fog, a little left of the island
const SUN = new THREE.Vector3(-0.009, 0.105, -0.994).normalize();
const ISLAND = { x: 960, z: -2000, rx: 950, rz: 650, peak: 680 };
// the shape: ~600 m out, ~150 m up, inside the mist, a little right of the sun line so its
// shadow wedge crosses the brightest shafts
const SHAPE_AT = new THREE.Vector3(-55, 185, -1350);
const SUN_BANK = new THREE.Vector3().copy(SUN).multiplyScalar(3000);

export const meta = {
  title: 'Style frame F1 - Prologue: dawn sea, island in cloud',
  duration: 8,
  seed: 11,
  cinematic: filmFinish({
    atmosphere: { enabled: true, haze: 2.2, mieG: 0.8, sunDirection: SUN.toArray(), sunIlluminance: 5, apDistanceScale: 1.0, environment: false },
    volumetrics: {
      enabled: true, range: 3400, near: 1, resolution: [256, 96, 85], intensity: 1.5, noiseFilter: true, shadowSoftness: 6,
      density: 0.00022, heightFalloff: 0.02, fogBase: 0, anisotropy: 0.72, noiseScale: 0.006, noiseAmount: 0.75,
      wind: [3, 0, 1],
      banks: [
        // the island's cloud cap: clumped, wrapping the summit, trailing off to leeward
        { center: [ISLAND.x + 250, 560, ISLAND.z - 60], radius: [1300, 220, 900], density: 0.02, noise: 0.85 },
        { center: [ISLAND.x - 300, 380, ISLAND.z + 150], radius: [650, 120, 420], density: 0.012, noise: 0.9 },
        { center: [ISLAND.x + 900, 430, ISLAND.z - 300], radius: [800, 140, 500], density: 0.008, noise: 0.9 },
        // the cloud bank the dawn sun is rising behind: veils its lower half
        { center: [SUN_BANK.x, SUN_BANK.y - 70, SUN_BANK.z], radius: [900, 120, 300], density: 0.01, noise: 0.85 },
        // the mist the shape moves in: a loose, high layer above the sea
        { center: [SHAPE_AT.x + 20, 115, -780], radius: [700, 100, 640], density: 0.0038, noise: 0.55 },
        // sea fog lying on the water in layered banks of different density
        { center: [-300, 7, -1150], radius: [1500, 18, 260], density: 0.006, noise: 0.9 },
        { center: [900, 12, -1500], radius: [1100, 30, 300], density: 0.004, noise: 0.85 },
        { center: [700, 5, -520], radius: [600, 12, 200], density: 0.005, noise: 0.9 },
      ],
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 1.5 },
    dof: { samples: 48 },
    grade: { whiteBalance: 4300, contrast: 1.04, saturation: 1.0, exposure: -0.45 },
  }),
};

let S;
const DEBUG_CARD = false;
const DEBUG_SHIP = false;
const DEBUG_FOG = false;

function islandHeight(N) {
  return (x, z) => {
    const dx = (x - ISLAND.x) / ISLAND.rx, dz = (z - ISLAND.z) / ISLAND.rz;
    const ang = Math.atan2(dz, dx);
    const r = Math.hypot(dx, dz) * (1 + 0.18 * N.fbm(Math.cos(ang) * 1.3 + 3, Math.sin(ang) * 1.3, 4) + 0.06 * N.fbm(x * 0.004, z * 0.004, 3));
    const land = 1 - smooth(0.82, 1.0, r);                 // shoreline
    if (land <= 0) return -40 * smooth(1.0, 1.25, r) - 2;
    const cliff = smooth(0.0, 0.08, 1 - r) * (95 + 50 * N.fbm(x * 0.006, z * 0.006, 3));   // sea cliffs
    const mass = Math.pow(Math.max(0, 1 - r), 1.35) * ISLAND.peak;
    const ridges = N.ridged(x * 0.0016 + 4, z * 0.0016, 5) * 0.55 + 0.45;
    const gullies = 1 - 0.18 * Math.abs(N.fbm(x * 0.012, z * 0.012, 4));
    const rough = (N.fbm(x * 0.03 + 7, z * 0.03, 4) * 7 + N.fbm(x * 0.09, z * 0.09 - 3, 3) * 2.5) * smooth(0.0, 0.1, 1 - r);
    return cliff * land + mass * ridges * gullies * land + rough * land - 2 * (1 - land);
  };
}

export async function setup(ctx) {
  const { scene, camera, quality } = ctx;

  // sun: low, behind the fog; its shadow map covers the near sea, the ship and the high mist bank
  const sun = new THREE.DirectionalLight(0xffffff, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -1100; sc.right = 1100; sc.top = 700; sc.bottom = -700; sc.near = 10; sc.far = 4200;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  sun.target.position.set(-150, 60, -650);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 2000);
  scene.add(sun, sun.target);

  // reflections and sky fill from a real misty dawn (CC0 HDRI, Poly Haven kloppenheim_01),
  // turned so its veiled sun sits where this scene's sun is: the sea mirrors a pale, foggy
  // sky (the physical sky model has no fog in it)
  {
    const env = await loadHDRI('hdri/kloppenheim_01', ctx, { extractSun: true, sunThreshold: 30 });
    env.apply(scene, { background: false, environment: true, sunLight: false });
    const az0 = env.sun ? Math.atan2(env.sun.direction.z, env.sun.direction.x) : 0;
    scene.environmentRotation.set(0, az0 - Math.atan2(SUN.z, SUN.x), 0);
    scene.environmentIntensity = 0.32;
  }

  // the sea: a fresh morning breeze (Beaufort 5) - whitecaps, wind streaks, a short chop on the swell
  const ocean = createOcean(ctx, { windSpeed: 8.5, windDirection: 110, swell: 0.45, choppiness: 1.35, seed: 21, fetch: 60000, foamAmount: 1.0, foamThreshold: 0.62, foamColor: [0.74, 0.72, 0.68], shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.9, mipFilter: 'trilinear', roughness: 0.06, reflectionTint: [1.35, 1.08, 0.78], deepColor: [0.006, 0.012, 0.014] });
  scene.add(ocean.mesh);

  // the island: 3D terrain, rock cliffs, dark heath above
  const N = makeNoise(5);
  const H = islandHeight(N);
  const land = heightfield({
    xs: gradedAxis(ISLAND.x - ISLAND.rx * 1.35, ISLAND.x + ISLAND.rx * 1.35, 768),
    zs: gradedAxis(ISLAND.z - ISLAND.rz * 1.35, ISLAND.z + ISLAND.rz * 1.35, 520),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.62, 0.86, 1 - n[1]);
      const low = 1 - smooth(4, 30, y);
      const heath = (1 - steep) * (1 - low);
      return [Math.max(steep, low * 0.6), heath * 0.65, heath * 0.35, 0];
    },
    // macro colour: dark heath and scrub in patches, paler bare rock and screes, damp dark shore
    color: (x, z, y, n) => {
      const patch = N.fbm(x * 0.006 + 11, z * 0.006 - 4, 4), fine = N.fbm(x * 0.03, z * 0.03 + 9, 3);
      const steep = smooth(0.55, 0.9, 1 - n[1]);
      const v = Math.max(0.25, 0.9 + 1.1 * patch + 0.4 * fine + 0.35 * steep - 0.3 * (1 - smooth(2, 12, y)));
      return [v * 0.98, v, v * 0.97];
    },
    skip: (a, b, c, d) => Math.max(a, b, c, d) < -6,
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 6, tint: [0.42, 0.42, 0.43] },
    { id: 'pbr/acg_ground13', scale: 8, tint: [0.45, 0.48, 0.38] },
    { id: 'pbr/acg_ground24', scale: 8, tint: [0.5, 0.5, 0.45] },
  ], { macro: 0.55, macroScale: 0.004, detailNear: 400, detailFar: 2500, vertexColors: true });
  const island = new THREE.Mesh(land.geometry, landMat);
  island.castShadow = false; island.receiveShadow = true;
  scene.add(island);

  // the vessel: a small one-masted trading ship of the period (procedural knarr), three crew
  const human = await loadHuman();
  const crew = [
    person(human, { name: 'steersman', jacket: [0.1, 0.08, 0.06], trousers: [0.05, 0.04, 0.03], boots: [0.03, 0.02, 0.015], gloves: [0.4, 0.26, 0.18], hair: [0.12, 0.1, 0.08], skin: [0.4, 0.26, 0.18], belt: [0.04, 0.03, 0.02], hairMode: 'cap', skirt: -0.42 }, 'wait', { headYaw: 0.4 }),
    person(human, { name: 'sailor', jacket: [0.2, 0.17, 0.12], trousers: [0.06, 0.05, 0.04], boots: [0.03, 0.02, 0.015], gloves: [0.4, 0.26, 0.18], hair: [0.05, 0.035, 0.02], skin: [0.42, 0.27, 0.19], belt: [0.04, 0.03, 0.02], hairMode: 'cap', skirt: -0.42 }, 'stand', { headYaw: -0.3 }),
    person(human, { name: 'sailor2', jacket: [0.08, 0.09, 0.1], trousers: [0.06, 0.05, 0.04], boots: [0.03, 0.02, 0.015], gloves: [0.4, 0.26, 0.18], hair: [0.03, 0.02, 0.015], skin: [0.36, 0.22, 0.15], belt: [0.04, 0.03, 0.02], hairMode: 'cap', skirt: -0.42 }, 'lookUp', { headYaw: 0.2 }),
  ];
  crew[0].root.position.set(-6.2, 0.3 + 0.88, 1.0); crew[0].root.rotation.y = Math.PI / 2 + 0.3;
  crew[1].root.position.set(2.6, -0.1 + 0.88, -0.6); crew[1].root.rotation.y = Math.PI / 2 - 0.4;
  crew[2].root.position.set(5.4, 0.35 + 0.88, 0.4); crew[2].root.rotation.y = -0.6;
  const ship = await knarr(ctx, { sailFill: 1.15, brace: -0.6, crew: crew.map((c) => c.root) });
  ship.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const shipRoot = ship.root;
  scene.add(shipRoot);

  // the shape in the mist. A giant winged body (provisional generic build, scaled up) glides
  // inside the high mist layer. (1) Its body is invisible but casts into the sun's shadow map:
  // in the backlit fog that cuts a dark wing-shaped wedge out of the light shafts, reaching
  // toward the camera - the "shadow mistaken for cloud". (2) Where it is, the mist darkens a
  // little (a silhouette card, blurred the way mist diffuses an edge). Never a clear creature.
  const shape = await createCreature('charcoal', { quality: 'draft' });
  shape.root.scale.setScalar(3.6);
  shape.setPose(poses.glide(shape, { t: 0, bank: -0.25, dihedral: 0.18 }));
  shape.root.position.copy(SHAPE_AT);
  shape.root.rotation.set(0.05, -Math.PI / 2 - 0.35, 0);
  const card = silhouetteCard(ctx, shape.root, new THREE.Vector3(0, 2.6, -4), { size: [1024, 512], blur: 40, opacity: DEBUG_CARD ? 1 : 0.26, color: DEBUG_CARD ? [50, 0, 0] : [0.0, 0.0, 0.0], pad: 1.6 });
  scene.add(card.mesh);
  scene.add(shape.root);
  shape.root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    if (!DEBUG_FOG) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.colorWrite = false; m.depthWrite = false; }
  });

  camera.near = 0.3; camera.far = 40000;
  ctx.shadows.key = null;
  if (DEBUG_FOG) {
    ctx.cinematic.debug = 'fog';
  }
  S = { sun, ocean, ship, shipRoot, card, shape, H };
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();

export function update(t, ctx) {
  const { ocean, ship, shipRoot, card, shape } = S;
  ocean.update(t);

  // the ship crosses left to right ~110 m out at ~5 knots, heeled to the breeze, riding the
  // swell (four-point buoyancy, pitch and roll follow the water)
  const yaw = 0.28;
  const hx = Math.cos(yaw), hz = -Math.sin(yaw);
  const sx = -19 + (t - 3) * 2.6 * hx, sz = -122 + (t - 3) * 2.6 * hz;
  const bow = ocean.heightAt(sx + 7 * hx, sz + 7 * hz), stern = ocean.heightAt(sx - 7 * hx, sz - 7 * hz);
  const port = ocean.heightAt(sx + 2.2 * hz, sz - 2.2 * hx), stbd = ocean.heightAt(sx - 2.2 * hz, sz + 2.2 * hx);
  shipRoot.position.set(sx, (bow + stern + port + stbd) * 0.25 - 0.1, sz);
  _e.set(Math.atan2(port - stbd, 4.4) * 0.8 + 0.11, yaw, Math.atan2(bow - stern, 14) * 0.8, 'YXZ');
  shipRoot.quaternion.setFromEuler(_e);
  shipRoot.updateMatrixWorld(true);
  ocean.setWake(0, { x: sx - 8 * hx, z: sz - 8 * hz, heading: [hx, hz], hullLength: 16, beam: 4.4, strength: 1.0, length: 90 });

  // the shape glides slowly right to left inside the high mist
  const drift = (t - 3) * 9;
  shape.root.position.set(SHAPE_AT.x - drift, SHAPE_AT.y, SHAPE_AT.z);
  card.mesh.position.set(card.center.x - drift, card.center.y, card.center.z);

  // camera: a small boat's height above the water, drifting toward the island
  const cam = ctx.camera;
  const cx = 0, cz = 0 - t * 1.2;
  const h = ocean.heightAt(cx, cz);
  cam.position.set(cx, 3.1 + h * 0.8, cz);
  cam.lookAt(cx + 30, 2.6 + 34, cz - 600);
  applyShake(cam, t, { kind: 'vehicle', amount: 0.25, seed: 5 });
  if (DEBUG_SHIP) { cam.position.set(sx - 10, 30, sz + 60); cam.lookAt(sx - 20, 0, sz); }
  cam.updateMatrixWorld();
  card.face(cam.position);

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 35;
  ctx.lens.fstop = 5.6;
  ctx.lens.focus = 120;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 800;
}
