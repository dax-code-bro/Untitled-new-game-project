// Props - hero angle: the Santa Maria moored at a Verdor quay (PROVISIONAL design). The story's
// ship (built on the CC0 Poly Haven "dutch_ship_medium", sails furled on their yards, hull
// detail and waterline added, painted name on the stern) lies alongside the architecture
// library's harbour quay against its fender piles: bow and stern lines and a spring to the stone
// bollards, rope fenders over the side, a gangplank, the crew's supplies on the quay (barrels,
// crates, grain sacks, coiled hawsers, a handcart). Calm harbour water (FFT sea, screen-space
// reflections). Morning sun, partly cloudy. Camera on the quay, 28 mm, T5.6.
//
//   node render/render.mjs --still scenes/lookdev/props-santa-maria.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../lib/assets.js';
import { Kit as ArchKit, yawFrame as archYaw } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { harbor } from '../lib/architecture/verdor.js';
import { santaMaria, mooring } from '../lib/props/santa-maria.js';
import { festivalKit } from '../lib/props/festival.js';
import { Kit, rng, sub, yawFrame, frame } from '../lib/props/core.js';
import { barrel, crate, handcart, basket } from '../lib/props/containers.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Props - the Santa Maria at the quay (PROVISIONAL)',
  duration: 4,
  seed: 9,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2, apDistanceScale: 1.0 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 48 },
    grade: { exposure: -0.25, whiteBalance: 5800, contrast: 1.03 },
  }),
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SHIP = V(10.5, 0, 3.05);
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 2.75 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 300; sc.updateProjectionMatrix();
  sun.target.position.set(8, 3, 0); sun.position.copy(sun.target.position).addScaledVector(sky.sun.direction, 120);
  scene.add(sun, sun.target);
  // the sea: a calm harbour, murky green-grey water, reflections of the hull
  const ocean = createOcean(ctx, { windSpeed: 3.0, windDirection: 200, swell: 0.08, choppiness: 0.9, seed: 4, fetch: 2000, foamAmount: 0.2, foamThreshold: 0.8, mipFilter: 'trilinear', roughness: 0.05, absorption: [1.2, 0.5, 0.6], turbidity: 0.8, scatterColor: [0.02, 0.06, 0.05], deepColor: [0.008, 0.016, 0.014], shoreFoam: 0.6, shoreFoamWidth: 0.25, surf: 0.0, ssr: true });
  scene.add(ocean.mesh);
  // the quay (architecture library)
  const AM = await archMaterials(ctx);
  const ak = new ArchKit(0);
  harbor(ak, archYaw([0, 0, 0], 0), { water: false, town: false, dressing: false, buildings: true, hinterland: 30, seed: 8 });
  scene.add(ak.build(AM, { name: 'harbor' }));
  // the ship
  const ship = await santaMaria(ctx, { lettering: true });
  ship.root.position.copy(SHIP);
  scene.add(ship.root);
  ship.root.updateMatrixWorld(true);
  // lines: bow line and stern line to the bollards, a spring; fenders against the piles; gangplank
  const sideZ = -1;
  const moor = await mooring(ctx, ship, {
    side: sideZ,
    lines: [
      [V(9.2, 3.6, -1.6), V(17.5, 3.25, -0.95)],
      [V(-8.6, 4.6, -1.3), V(2.5, 3.25, -0.95)],
      [V(2.0, 3.3, -2.3), V(10.0, 3.2, -0.95)],
    ],
    fenders: [[-4.5, 1.2], [0.5, 1.1], [5.0, 1.2]],
    plank: [V(-1.2, 3.05, -2.25), V(8.8, 2.82, -1.6)],
  });
  scene.add(moor);
  // the crew's supplies on the quay
  const fk = await festivalKit(ctx);
  const k = new Kit();
  const r = rng(31);
  const Q = 2.8;
  const at = (x, z, yaw = 0) => yawFrame([x, Q, z], yaw);
  barrel(k, at(6.2, -2.0), r, { h: 0.85, r: 0.27 }); barrel(k, at(6.85, -2.25), r, { h: 0.85, r: 0.27, hoops: 'withy' }); barrel(k, at(6.5, -2.75), r, { h: 0.85, r: 0.27 });
  barrel(k, frame(V(7.3, Q + 0.315, -3.2), [0, 1, 0], [Math.cos(0.4), 0, Math.sin(0.4)]), r, { h: 0.85, r: 0.27 });
  crate(k, at(4.9, -2.1, 0.2), r, { lid: 'on', slats: false, mat: 'pale' }); crate(k, sub(at(4.9, -2.1, 0.2), [0.02, 0.4, 0], 0.15), r, { lid: 'on', slats: false, w: 0.5, d: 0.38, h: 0.3 });
  crate(k, at(4.0, -2.6, -0.3), r, {});
  for (const [x, z, yw] of [[8.3, -2.6, 0.4], [8.7, -2.2, 1.6], [8.6, -3.0, 2.4]]) fk.sack(k, at(x, z, yw), r, { kind: 'full' });
  fk.sack(k, at(9.3, -2.9, 0.8), r, { kind: 'lying' });
  fk.ropeCoil(k, at(12.6, -1.9), r, { r: 0.42, turns: 9, rope: 0.022 });
  fk.ropeCoil(k, at(3.2, -1.7), r, { r: 0.32, turns: 7, rope: 0.018 });
  handcart(k, at(13.8, -3.6, 2.6), r, {});
  const bk = basket(k, at(5.6, -3.3), r, { r: 0.22, rb: 0.17, h: 0.3, handle: 'ears' });
  scene.add(fk.build(k, 'quay-supplies'));
  // two hands for scale
  try {
    const [a, b] = await Promise.all([loadCharacter('sailor1'), loadCharacter('sailor2')]);
    placeCharacter(a, 7.6, Q, -2.0, 0.6); scene.add(a.root);
    placeCharacter(b, 11.4, Q, -2.4, -2.3); scene.add(b.root);
  } catch (e) { console.warn('[props-santa-maria] no crew', e.message); }
  scene.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; if (o.castShadow === undefined) o.castShadow = true; } });
  S = { ocean, ship };
}

export function update(t, ctx) {
  S.ocean.update(t);
  // the ship rises and falls a little against her lines
  const h = S.ocean.heightAt(SHIP.x, SHIP.z);
  S.ship.root.position.y = h * 0.3;
  S.ship.root.rotation.x = Math.sin(t * 0.5) * 0.006;
  const cam = ctx.camera;
  cam.position.set(-1.8, 4.45, -5.4);
  cam.lookAt(10.5, 5.2, 2.4);
  cam.near = 0.1; cam.far = 3000;
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 24;
  ctx.lens.fstop = 5.6;
  ctx.lens.focus = 11;
  ctx.lens.shutterAngle = 180;
}
