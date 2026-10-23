// FX lookdev - the Cling roofline coming down (F6 in assets-delta.md: 3C-11 first impact,
// 3C-12 the stall swept into the square, 3C-27 / R16-01 debris and boards over the paving,
// R15-01 the arm under the timbers, 3D / X27 / X28 the after-state). Built ON the set: two
// Cling townhouses from scenes/lib/architecture (the right one built with a hole in its roof
// through fx.debris.damageCapture), the vendor's stall from scenes/lib/props; the FX puts the
// missing tiles back, holds them until the strike, then brings them down.
//
// Views (8 s each; the strike is at 0.6 s into every view):
//   0 wide from the square      1 low across the paving (stall, boards)     2 the after-state
//   (the same cues evaluated 100 s later: where everything lies in 3D)       3 the roof itself
//   (held tiles before the strike, the sheets sliding off)    4 both roofs after (the holes)
//
//   node render/render.mjs --still scenes/lookdev/fx-cling.js --time 1.4 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { Kit, frame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { house } from '../lib/architecture/house.js';
import { createFx } from '../lib/fx/index.js';
import { hash01 } from '../lib/fx/core/util.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'FX lookdev - Cling roofline destruction',
  duration: 40,
  seed: 5,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.1 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.5 },
    dof: { enabled: false },
    grade: { exposure: 0.35, whiteBalance: 5900 },
  }),
};

const HA = [-3.6, 0, -6];         // clay-tiled house, clipped first (left)
const HB = [3.6, 0, -6];          // the struck house, stone slates (eaves to the square)
const STRIKE = 0.6;
// the hole: a ragged patch at the eaves, left of the middle (where the white body clipped it)
const hole = (x, y, z) => {
  const dx = (x - 2.3) / 2.0, dy = (y - 6.9) / 1.25, dz = (z + 2.6) / 1.6;
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const rag = 0.18 * (hash01(Math.floor(x * 4), Math.floor(y * 4), 7) - 0.5) + 0.12 * Math.sin(x * 3.1 + y * 2.3);
  return r < 1 + rag;
};

// the first clip: a smaller hole in the clay roof on the left, near its eaves
const holeA = (x, y, z) => {
  const dx = (x + 2.2) / 1.2, dy = (y - 6.4) / 0.8, dz = (z + 2.4) / 1.2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < 1 + 0.2 * (hash01(Math.floor(x * 5), Math.floor(y * 5), 9) - 0.5);
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -0.6 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), await groundMaterial('pbr/ph_floor_pebbles_01', ctx, [80, 80], { tint: [0.95, 0.93, 0.9] }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);

  const fx = await createFx(ctx, { ground: 0, wind: [0.5, 0, 0.15], tier: ctx.meta.fxTier });
  // the row: a gabled house (left) and the struck house with its eaves to the square (right)
  const M = await archMaterials(ctx);
  const cap = fx.debris.damageCapture(hole, { toWorld: (p) => [p[0] + HB[0], p[1] + HB[1], p[2] + HB[2]] });
  const capA = fx.debris.damageCapture(holeA, { toWorld: (p) => [p[0] + HA[0], p[1] + HA[1], p[2] + HA[2]] });
  const kit = new Kit(0);
  house(kit, frame(HA), { w: 7.2, d: 8.5, storeys: 1, roof: 'side', cover: 'clay', seed: 11, lod: 'hero', chimney: 'right', party: { left: false, right: true }, damage: capA.damage });
  const hb = house(kit, frame(HB), { w: 7.0, d: 8.5, storeys: 1, roof: 'side', seed: 25, lod: 'hero', chimney: 'left', party: { left: true, right: false }, shop: { x: 4.6, w: 1.6 }, door: { x: 2.0 }, damage: cap.damage });
  const set = kit.build(M, { name: 'cling-row' });
  scene.add(set);

  // the vendor's stall in the square
  let stall = null;
  try {
    const { festivalKit } = await import('../lib/props/festival.js');
    const { frame: pframe } = await import('../lib/props/core.js');
    const api = await festivalKit(ctx);
    stall = await api.stall(pframe([4.6, 0, 3.4]), 'bread', { seed: 7, size: '24' });
    stall.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(stall);
  } catch (e) { console.warn('[fx-cling] no props stall:', e.message); }

  // scale: a 1.8 m post and a grey ball (albedo 0.4)
  const grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.4), roughness: 0.8 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 24), grey);
  ball.position.set(-2.5, 0.4, 4.5); ball.castShadow = ball.receiveShadow = true; scene.add(ball);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 16), grey);
  post.position.set(-0.8, 0.9, 6.0); post.castShadow = post.receiveShadow = true; scene.add(post);

  // the house fronts: faces the debris bounces off
  const walls = [{ p: [0, 0, -1.75], n: [0, 0, 1], width: 14.4, height: 5.2 }];
  const t0 = performance.now();
  const roofA = await fx.debris.roofline({ capture: capA, set, t0: STRIKE - 0.3, impact: [-2.2, 6.2, -1.9], dir: [0.6, -0.4, 0.7], speed: 7, blast: 0.9, runSpeed: 6, walls, seed: 9, dust: { curtains: 3, haze: false } });
  const roof = await fx.debris.roofline({ capture: cap, set, t0: STRIKE, impact: [2.0, 6.3, -1.7], dir: [0.55, -0.3, 0.75], speed: 9, blast: 1.6, runSpeed: 8, walls, seed: 3 });
  const tRoof = performance.now() - t0;
  // the blast that follows the body sweeps the stall into the square (3C-12)
  const sweep = stall ? fx.debris.sweep({ object: stall, t0: STRIKE + 0.9, dir: [0.15, 0.3, 1], speed: 7.5, e: 0.15, mu: 0.6, seed: 4 }) : null;
  const thrown = sweep ? sweep.effects[0] : null;
  // the music stage's boards scything across the paving (R16-01)
  await fx.debris.boards({ at: [-5.5, 0.7, 1.8], dir: [1, 0.1, 0.35], t0: STRIKE + 1.1, count: 5, speed: 11, seed: 5, walls });
  console.warn('[fx-cling] ' + JSON.stringify({ roofA: { tiles: roofA.tiles, runs: roofA.runs }, roofTiles: roof.tiles, pieces: roof.pieces.length, runs: roof.runs, roofMs: Math.round(tRoof), shattered: roof.pieces.filter((p) => p.shard).length, hb: { ridge: hb.ridge } }));
  if (sweep) console.warn('[fx-cling] sweep ' + JSON.stringify({ parts: sweep.parts.length, thrown: sweep.effects.length, sizes: sweep.parts.slice(0, 12).map((p) => +p.userData.size.toFixed(2)) }));
  S = { fx, roof, thrown };
}

const VIEWS = [
  { pos: [3.0, 1.7, 21.0], look: [2.4, 4.4, -2.0], f: 24 },
  { pos: [-3.5, 0.45, 7.5], look: [3.0, 0.5, 0.5], f: 28 },
  { pos: [-0.2, 1.7, 5.0], look: [2.6, 0.2, -0.6], f: 28, after: 100 },
  { pos: [1.2, 5.2, 4.2], look: [2.4, 6.6, -2.4], f: 35 },
  { pos: [0.0, 4.2, 9.0], look: [0.0, 6.6, -3.0], f: 28, after: 100 },
];
export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(VIEWS.length - 1, Math.floor(t / 8)), tt = t - view * 8;
  const V = VIEWS[view];
  cam.position.set(...V.pos); cam.lookAt(...V.look);
  cam.near = 0.05; cam.far = 2000;
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = V.f; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  const sun = ctx.scene.children.find((c) => c.isDirectionalLight);
  if (sun) {
    const d = sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.set(1, 0, -1); sun.position.copy(sun.target.position).addScaledVector(d, 60);
    const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
  }
  S.fx.update(tt + (V.after || 0));
  ctx.shadows.dynamic = S.fx.dynamic;
}
