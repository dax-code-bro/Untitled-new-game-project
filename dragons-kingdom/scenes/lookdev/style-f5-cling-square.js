// Style frame F5 - SCENE 3B, Cling square, the white dragon in the distance (shot list 3B-02 / 3B-03 / 3B-08).
//
// "A WATCHMAN looks up from the edge of the square. Something white lies
// against the cloud. It appears still because it is coming nearly toward
// him ... The watchman points ... Starlight resolves against the sky. Her
// white scales take color from the daylight ... She is immense."
//
// Map (shot list cling_map, seen from the king's steps, looking north): the
// stone arch on the LEFT (west), the gate to the broad road on the RIGHT
// (east), the vendor stall left-center, the music space right-center, the
// fountain with its central pillar in the middle. The sun is behind the steps
// (south, behind the camera); Starlight comes from the far north sky.
//
// Cinematography: from the top of the king's steps, a high eye over the square
// (24 mm on Super 35, T2.8, focus far): the festival below - stalls, bunting
// in deep swags, banners, the crowd, nearly all of them seen from behind and
// most not yet aware - and at the edge of the crowd the watchman (an adult in
// a hooded wool cape, back to camera) with his arm raised, pointing up past
// the north rooftops. Far beyond the roofs, against the photographed cumulus
// (a CC0 HDRI), Starlight comes nearly head-on - white, hazed by ~640 m of air,
// a size the eye cannot place until it compares her wingspan with the houses.
// A tiny rider sits in her saddle.
//   node render/render.mjs --still scenes/lookdev/style-f5-cling-square.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { applyShake } from 'dk/camera.js';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { heightfield, makeNoise, gradedAxis } from '../lib/sets/terrain.js';
import { buildingKit } from '../lib/sets/buildings.js';
import { townKit, clothMaterial } from '../lib/sets/town.js';
import { person, placePerson, randomOutfit, armIK } from '../lib/sets/people.js';
import { createCreature, poses, loadHuman, createRider, createSaddle, mountRider } from '../lib/creatures/index.js';
import { filmFinish } from './finish.js';

const SHUTTER = 180;
const HDRI_ROT = -1.79;           // puts the photographed sun south-west, behind the camera's left

// where Starlight is: by composition (upper right), ~700 m out
const STAR_NDC = [0.32, 0.66], STAR_DIST = 640;
const CAM_P = [5.9, 3.28, 24.6], CAM_T = [-4, 5.0, -20];
const WATCH = [-1.6, 0, 11.8];

export const meta = {
  title: 'Style frame F5 - Cling square, white in the distance',
  duration: 8,
  seed: 51,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 3.2, apDistanceScale: 2.6 },
    volumetrics: {
      enabled: true, range: 1400, resolution: [192, 108, 72], noiseFilter: true,
      density: 0.00003, heightFalloff: 0.01, fogBase: 0, anisotropy: 0.6, noiseScale: 0.012, noiseAmount: 0.7,
      banks: [],
    },
    shadows: { cascades: 3, maxDistance: 160 },
    ao: { enabled: true, radius: 0.9 },
    dof: { samples: 64 },
    grade: { exposure: 1.1, whiteBalance: 6200, contrast: 1.05, saturation: 1.0 },
  }),
};

let S;

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT, backgroundBlurriness: 0 });
  const sun = sky.apply(scene);
  // the photographed sun (south-west, behind the steps, as the map fixes it) in a clear spell
  // between the clouds: the measured sun of this HDRI is partly veiled, which reads as flat
  // light on pale plaster - the direct sun a little harder, the sky fill a little lower
  sun.intensity *= 1.6;
  scene.environmentIntensity = 0.75;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  // ---- the square: worn paving of pebbles and packed earth, with the land falling away beyond the town
  const N = makeNoise(3);
  const H = (x, z) => 0.04 * N.fbm(x * 0.3, z * 0.3, 3) + (Math.abs(x) > 26 || z < -26 ? 0 : 0);
  const ground = heightfield({
    xs: gradedAxis(-400, 400, 200, 0, 3), zs: gradedAxis(-1400, 120, 260, 0, 3), height: H,
    splat: (x, z) => {
      const inSq = Math.abs(x) < 20 && z > -18 && z < 24;
      const wear = 0.5 + 0.5 * N.fbm(x * 0.12, z * 0.12, 3);
      return inSq ? [0.85 * wear + 0.15, 1 - wear, 0.25, 0] : [0, 0.2, 0, 0.8];
    },
  });
  const groundMat = await terrainMaterial(ctx, [
    { id: 'pbr/ph_floor_pebbles_01', scale: 0.8, tint: [0.5, 0.48, 0.45] },
    { id: 'pbr/acg_ground05', scale: 1.0, tint: [0.5, 0.45, 0.38] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.45, 0.4, 0.34] },
    { id: 'pbr/acg_ground037', scale: 2.0, tint: [0.6, 0.66, 0.5] },
  ], { macro: 0.45, macroScale: 0.05, detailNear: 40, detailFar: 500, minRoughness: 0.75 });
  const gm = new THREE.Mesh(ground.geometry, groundMat); gm.receiveShadow = true; scene.add(gm);

  // ---- buildings around the square
  const kit = await buildingKit(ctx, { groundY: 0, stone: 'pbr/ph_sandstone_blocks_04', stoneTint: [0.6, 0.6, 0.59], saturation: 0.12, slate: { color: [0.085, 0.08, 0.075] } });
  const town = await townKit(ctx, kit, { groundY: 0 });
  let hs = 1;
  const PLASTER = [[1.12, 1.08, 0.98], [1.15, 1.02, 0.84], [1.1, 0.98, 0.92], [1.0, 0.98, 0.94], [1.16, 1.06, 0.88], [1.12, 1.0, 0.95]];
  const fronts = [];                // street face of each house's top storey (banner mounts)
  const row = (x0, z0, dx, dz, n, yaw, opts = {}) => {
    let off = 0;
    for (let i = 0; i < n; i++) {
      const w = 5.5 + ((hs * 7) % 5) * 0.7, d = 8 + (hs % 3);
      const storeys = 1 + (opts.tall && (hs * 5) % 3 === 0 ? 1 : 0);
      const h = town.house({ w, d, storeys, roof: (hs % 3) ? 'front' : 'side', seed: hs++, pitch: 1.0 + (hs % 4) * 0.1, plasterTint: PLASTER[hs % PLASTER.length], ...opts });
      if (opts.skip && opts.skip(i)) { off += w + 0.1; continue; }
      const set = ((hs * 13) % 7) * 0.12 - 0.3;                 // the frontage line is never straight
      h.position.set(x0 + dx * (off + w / 2) + dz * set, 0, z0 + dz * (off + w / 2) - dx * set);
      h.rotation.y = yaw;
      scene.add(h);
      const f = d / 2 + 0.35 * storeys;
      fronts.push({ p: h.position.clone().add(new THREE.Vector3(Math.sin(yaw) * f, 3.4 + 2.8 * storeys - 0.25, Math.cos(yaw) * f)), yaw, w });
      off += w + 0.05;
    }
  };
  row(-21, -18, 1, 0, 7, 0, { tall: true });                                     // north side, facing the camera
  row(-20, 24, 0, -1, 4, Math.PI / 2, { skip: (i) => i === 1 });                 // west side (the arch street at i = 1)
  row(-20, -2, 0, -1, 3, Math.PI / 2);
  row(20, -18, 0, 1, 3, -Math.PI / 2);                                           // east side, the gate gap after
  row(20, 12, 0, 1, 2, -Math.PI / 2);
  // the stone arch on the west side (escape route) and the gate to the broad road on the east side
  {
    const arch = kit.wall(7, 7.5, 1.2, [{ x: 0, y: 0, w: 3.6, h: 5.4, arch: true }]);
    arch.traverse((o) => { if (o.isMesh && o.material === kit.stone) o.material = town.greyStone; });
    arch.position.set(-19.6, 0, 16.5); arch.rotation.y = Math.PI / 2; scene.add(arch);
    for (const z of [3.2, 11.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2, 1.2), town.greyStone); p.position.set(20.5, 2.1, z * 0 + (z < 5 ? -1.9 : 10.5)); p.castShadow = p.receiveShadow = true; scene.add(p); }
  }
  // the fountain with its central pillar (the landmark)
  const fountain = town.fountain({ r: 3.0, pillarH: 3.4 }); fountain.position.set(0, 0, -2); scene.add(fountain);

  // ---- stalls (vendor stall left-centre, others around), music space right-centre
  const wicker = await loadPBR('pbr/khr_wicker', ctx, { repeat: [3, 1] });
  const dyes = [[[0.32, 0.05, 0.03], [0.45, 0.4, 0.3]], [[0.42, 0.3, 0.05], [0.4, 0.36, 0.28]], [[0.06, 0.09, 0.18], [0.42, 0.38, 0.3]], [[0.25, 0.08, 0.03], [0.35, 0.22, 0.06]], [[0.12, 0.16, 0.06], [0.4, 0.36, 0.28]]];
  const stalls = [[-8.5, 3, 0.15], [-13, -7, 0.5], [-5, -11, 0], [9.5, -10, -0.3], [14, -2, -1.2], [-14, 10, 1.4]];
  stalls.forEach(([x, z, r], i) => {
    const s = town.stall({ seed: i + 3, color: dyes[i % 5][0], color2: dyes[i % 5][1], stripe: i % 2 ? 2.5 : 0, goods: { basket: wicker } });
    s.position.set(x, 0, z); s.rotation.y = r; scene.add(s);
  });

  // ---- bunting across the square (deep catenary sag), banners on the houses
  const B = (a, b, sag) => scene.add(town.bunting(new THREE.Vector3(...a), new THREE.Vector3(...b), { sag, every: 0.75, size: 0.32, colors: [[0.24, 0.035, 0.02], [0.3, 0.2, 0.03], [0.035, 0.05, 0.11], [0.3, 0.26, 0.19], [0.07, 0.1, 0.035]] }));
  B([-19, 6.6, -6], [19, 6.8, -12], 3.2); B([-10, 7.0, -17.2], [-19, 6.4, 18], 2.8); B([12, 7.2, -17.2], [19.2, 6.6, 16], 2.8); B([-6, 6.2, 16], [16, 6.6, 6], 2.4);
  // hung from the top storeys of houses round the square (fronts: north row 0-6, west 7-12, east 13-17)
  [[1, -0.22], [3, 0.25], [5, -0.2], [9, 0.2], [14, 0]].forEach(([k, u], i) => {
    const F = fronts[k]; if (!F) return;
    const b = town.banner({ w: 1.1, h: 3.6, color: dyes[i][0], color2: dyes[i][1], stripe: i === 2 ? 3 : 0, seed: i });
    b.position.copy(F.p).add(new THREE.Vector3(Math.cos(F.yaw) * u * F.w, 0, -Math.sin(F.yaw) * u * F.w));
    b.rotation.y = F.yaw; scene.add(b);
  });

  // ---- people: the festival crowd (most have not noticed yet and face away, toward the
  // fountain and the stalls), musicians right-centre
  const human = await loadHuman();
  let a = 12345; const rng = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const people = [];
  const spot = (x, z, action, yaw, scale = 1, opts = {}) => {
    const p = person(human, randomOutfit(rng, opts), action, { headYaw: opts.headYaw ?? (rng() - 0.5) * 0.8, vary: 1, seed: people.length + 7, ...opts });
    placePerson(p, x, H(x, z), z, yaw, scale);
    scene.add(p.root); people.push(p);
    return p;
  };
  const clear = (x, z) => Math.hypot(x, z + 2) > 3.8 && !stalls.some(([sx, sz]) => Math.abs(x - sx) < 2.2 && Math.abs(z - sz) < 1.6) && Math.hypot(x - WATCH[0], z - WATCH[2]) > 2.0;
  for (let i = 0; i < 52; i++) {
    const x = (rng() - 0.5) * 34, z = -15 + rng() * 26;
    if (!clear(x, z)) continue;
    const k = rng();
    const act = k < 0.25 ? 'stand' : k < 0.6 ? 'walk' : k < 0.75 ? 'carry' : k < 0.9 ? 'wait' : 'lookUp';
    spot(x, z, act, (rng() < 0.95 ? Math.PI : 0) + (rng() - 0.5) * 1.6, rng() < 0.12 ? 0.68 : 0.93 + rng() * 0.12);
  }
  // around the vendor stall
  spot(-8.2, 4.6, 'stand', Math.PI, 1.0); spot(-9.6, 4.9, 'carry', Math.PI + 0.4, 0.98); spot(-7.0, 5.2, 'stand', Math.PI - 0.6, 0.7);
  // musicians right-centre, a small ring of listeners
  for (let i = 0; i < 4; i++) spot(7 + Math.cos(i * 1.6) * 1.0, 1.5 + Math.sin(i * 1.6) * 1.0, 'stand', Math.atan2(-Math.cos(i * 1.6), -Math.sin(i * 1.6)), 0.98);
  // (listeners on the near side of the ring only: they face the music, away from the camera)
  for (let i = 0; i < 7; i++) { const an = 0.35 + i * 0.4; spot(7 + Math.cos(an) * 2.8, 1.5 + Math.sin(an) * 2.8, 'stand', Math.atan2(-Math.cos(an), -Math.sin(an)), 0.92 + rng() * 0.1); }
  // a few who have seen it: looking north, up
  for (const [x, z] of [[2.5, 9], [-2, 6.5], [4.2, 6], [-5.5, 12]]) spot(x, z, 'lookUp', Math.PI + (rng() - 0.5) * 0.4, 0.97, { headYaw: (rng() - 0.5) * 0.3 });

  // ---- the watchman below the king's steps, his back to camera, pointing north
  // (an adult in a hooded wool cape over a belted tunic, leather gloves)
  const watchman = person(human, { name: 'watchman', jacket: [0.09, 0.07, 0.05], trousers: [0.05, 0.04, 0.03], boots: [0.025, 0.018, 0.012], gloves: [0.045, 0.03, 0.02], hair: [0.075, 0.06, 0.045], skin: [0.45, 0.29, 0.2], belt: [0.05, 0.03, 0.02], hairMode: 'veil', skirt: -0.42 }, 'point', { seed: 4 });
  scene.add(watchman.root);
  // the king's steps (the camera stands on the top one)
  for (let k = 0; k < 7; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(14, 0.24 * (k + 1), 1.0), town.greyStone); st.position.set(4, 0.12 * (k + 1), 18.5 + k * 1.0); st.castShadow = st.receiveShadow = true; scene.add(st); }

  // ---- Starlight, far to the north, coming head-on (provisional design: albino Nightwing, no glow)
  const star = await createCreature('starlight', { quality: 'standard' });
  scene.add(star.root);
  // Queen Fall in Starlight's saddle (provisional rider and rig)
  const fall = createRider(human, { outfit: { name: 'fall', jacket: [0.62, 0.6, 0.56], trousers: [0.1, 0.1, 0.11], boots: [0.03, 0.025, 0.02], gloves: [0.05, 0.04, 0.03], hair: [0.4, 0.38, 0.34], skin: [0.5, 0.33, 0.24], belt: [0.05, 0.04, 0.03], hairMode: 'bun', skirt: -0.42 }, lean: 0.25 });
  mountRider(star, createSaddle(star, {}), fall);

  camera.near = 0.2; camera.far = 40000;
  S = { sun, star, watchman, H, sunDir: sky.sun.direction.clone() };
}

export function update(t, ctx) {
  const { sun, star, watchman } = S;
  // camera: on the top of the king's steps behind the watchman's shoulder, looking
  // north-north-west over the square toward the sky above the north rooftops
  const cam = ctx.camera;
  cam.filmGauge = 24.89; cam.setFocalLength(24);      // the lens is set here too, so the composition maths below sees it
  cam.position.set(...CAM_P);
  cam.lookAt(...CAM_T);
  applyShake(cam, t, { kind: 'handheld', amount: 0.1, seed: 6 });
  cam.updateMatrixWorld(true);
  // Starlight: placed by composition (upper right), ~700 m out, coming nearly head-on out of the
  // cloud, gliding, a slight bank; she grows slowly as she approaches
  const dir = new THREE.Vector3(STAR_NDC[0], STAR_NDC[1], 0.5).unproject(cam).sub(cam.position).normalize();
  const dist = STAR_DIST - (t - 2) * 20;
  star.setPose(poses.glide(star, { t, bank: -0.12, dihedral: 0.16, look: [0.05, -0.1] }));
  star.root.position.copy(cam.position).addScaledVector(dir, dist);
  star.root.rotation.set(0.24, Math.atan2(-dir.x, -dir.z) + 0.1, 0, 'YXZ');      // nose down toward the camera: nearly head-on
  star.root.updateMatrixWorld(true);
  // the watchman: at the edge of the crowd below the steps, left of centre, his back to us,
  // pointing up at her (a small figure: the gesture reads, the mannequin does not)
  const wp = new THREE.Vector3(...WATCH);
  const toStar = star.root.position.clone().sub(wp).setY(0).normalize();
  placePerson(watchman, wp.x, wp.y, wp.z, Math.atan2(toStar.x, toStar.z) - 0.25);
  {
    const sh = new THREE.Vector3().setFromMatrixPosition(watchman.bones[watchman.index['upperarm01.R']].matrixWorld);
    const aim = star.root.position.clone().sub(sh).normalize();
    const tgt = sh.clone().addScaledVector(aim, 0.62);
    armIK(watchman, 'R', tgt, sh.clone().add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(aim, -0.2), { wristPitch: 0.0 });
  }
  sun.target.position.set(0, 0, 0);
  sun.position.copy(sun.target.position).addScaledVector(S.sunDir, 200);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 24;
  ctx.lens.fstop = 2.8;
  ctx.lens.focusTarget = star.root;
  ctx.lens.shutterAngle = SHUTTER;
  ctx.lens.iso = 400;
}
