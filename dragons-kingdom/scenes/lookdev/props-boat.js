// Props - hero angle: the prologue vessel at water level, 3/4 from ahead, the sail backlit by a
// low morning sun (PROVISIONAL design). A small double-ended clinker boat under her square wool
// sail on a broad reach in a moderate breeze: buoyant on the FFT sea (four-point floating, heel
// to leeward, pitch with the swell), a wake and bow wave, two crew from the humans library for
// scale (one at the tiller). Camera: a small chase boat, 0.9 m above the water, 25 mm on
// Super 35, T5.6.
//
//   node render/render.mjs --still scenes/lookdev/props-boat.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { loadHDRI } from '../lib/assets.js';
import { prologueBoat } from '../lib/props/boat.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Props - prologue vessel, water level, backlit sail (PROVISIONAL)',
  duration: 6,
  seed: 5,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 2.0, apDistanceScale: 1.0 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 48 },
    grade: { exposure: -0.2, whiteBalance: 5200, contrast: 1.04, saturation: 0.95 },
  }),
};

const CREW = true;
const HDRI = 'white_cliff_top';
// world: the boat sails along +x' = heading; the camera ahead of her bow, to port
const HEADING = 0.35;            // radians: boat yaw (bow toward +x rotated)
const SUN_SIDE = 0.12;           // the sun this far (rad) to the side of the line camera -> boat

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/' + HDRI, ctx, { extractSun: true, sunThreshold: 20, horizonFill: HDRI === 'umhlanga_sunrise' ? undefined : { above: 4, below: -2, blend: 2.5 } });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const ocean = createOcean(ctx, { windSpeed: 6.5, windDirection: 20, swell: 0.35, choppiness: 1.2, seed: 9, fetch: 30000, foamAmount: 0.7, foamThreshold: 0.66, mipFilter: 'trilinear', roughness: 0.06, absorption: [1.1, 0.42, 0.32], turbidity: 0.5, scatterColor: [0.02, 0.07, 0.07], shoreFoam: 1.0, shoreFoamWidth: 0.25, surf: 0.25, ssr: true });
  scene.add(ocean.mesh);
  const crew = [];
  if (CREW) {
    const [a, b] = await Promise.all([loadCharacter('sailor1'), loadCharacter('sailor2')]);
    crew.push(a, b);
  }
  const boat = await prologueBoat(ctx, { brace: -0.42, crew: [] });
  if (CREW) {
    // the helmsman stands aft at the tiller, a hand stands by the sheet amidships
    const p0 = boat.standAt(-3.1, 0.25), p1 = boat.standAt(-0.4, -0.35);
    placeCharacter(crew[0], p0.x, p0.y, p0.z, Math.PI / 2 + 0.25);
    placeCharacter(crew[1], p1.x, p1.y, p1.z, Math.PI / 2 - 0.9);
    for (const c of crew) boat.root.add(c.root);
  }
  scene.add(boat.root);
  boat.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // the sun from the HDRI (azimuth from the photograph) turned to sit behind the sail
  const sunDir0 = sky.sun.direction.clone();
  S = { sun, sunDir0, ocean, boat, crew };
  console.warn('[props-boat] sun elevation', (Math.asin(sunDir0.y) * 180 / Math.PI).toFixed(1), 'deg; boat tris', boat.root.userData.tris);
}

const _e = new THREE.Euler();
export function update(t, ctx) {
  const { ocean, boat, sun, sunDir0 } = S;
  ocean.update(t);
  // the boat at ~3.5 knots
  const hx = Math.cos(HEADING), hz = -Math.sin(HEADING);
  const sx = (t - 2) * 1.8 * hx, sz = (t - 2) * 1.8 * hz;
  const bow = ocean.heightAt(sx + 4 * hx, sz + 4 * hz), stern = ocean.heightAt(sx - 4 * hx, sz - 4 * hz);
  const port = ocean.heightAt(sx + 1.2 * hz, sz - 1.2 * hx), stbd = ocean.heightAt(sx - 1.2 * hz, sz + 1.2 * hx);
  boat.root.position.set(sx, (bow + stern + port + stbd) * 0.25 - 0.05, sz);
  // heel to leeward (the wind is on the port quarter: she heels to starboard), pitch with the sea
  _e.set(Math.atan2(port - stbd, 2.4) * 0.7 + 0.1, HEADING, Math.atan2(bow - stern, 8) * 0.8, 'YXZ');
  boat.root.quaternion.setFromEuler(_e);
  boat.root.updateMatrixWorld(true);
  ocean.setWake(0, { x: sx - 4.6 * hx, z: sz - 4.6 * hz, heading: [hx, hz], hullLength: 9.6, beam: 2.7, strength: 0.7, length: 45 });

  // camera: ahead and to port of the boat, low over the water (a chase boat)
  const cam = ctx.camera;
  const ang = HEADING + 0.62;                         // bearing from the boat to the camera
  const cx = sx + Math.cos(ang) * 15.5, cz = sz - Math.sin(ang) * 15.5;
  const h = ocean.heightAt(cx, cz);
  cam.position.set(cx, 0.95 + h * 0.6, cz);
  cam.lookAt(sx - 0.4 * hx, 3.1, sz - 0.4 * hz);
  applyShake(cam, t, { kind: 'vehicle', amount: 0.15, seed: 3 });
  cam.near = 0.1; cam.far = 20000;
  cam.updateMatrixWorld();
  // the sun behind the boat as seen from the camera, a little to the side
  const look = new THREE.Vector3(sx - cx, 0, sz - cz).normalize();
  const az = Math.atan2(look.z, look.x) + SUN_SIDE;
  const az0 = Math.atan2(sunDir0.z, sunDir0.x);
  const rot = az0 - az;
  ctx.scene.environmentRotation.set(0, rot, 0);
  ctx.scene.backgroundRotation.set(0, rot, 0);
  const sd = sunDir0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.target.position.set(sx, 2, sz);
  sun.position.copy(sun.target.position).addScaledVector(sd, 80);
  const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 50; sc.far = 120; sc.updateProjectionMatrix();

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 25;
  ctx.lens.fstop = 5.6;
  ctx.lens.focus = 15.5;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
}
