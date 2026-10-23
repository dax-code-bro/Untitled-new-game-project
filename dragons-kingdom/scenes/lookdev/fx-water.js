// FX lookdev - water (F8, 1F-25..1F-27, X6-12, X8-09): the scout (a 6.8 m body, here a dark
// stand-in) hitting the sea at 30 m/s at a shallow angle - crown, drops, mist, the jet, foam and a
// broken trail across the surface - then churning weakly with a red stain spreading round its torn
// shoulder; and a 36 m dragon's downwash flattening the water into a pale ring with spray thrown out.
//
// Views: 0 (0-8 s) the impact from a boat 60 m off   1 (8-16) from above and far (1F-26)
//        2 (16-24) the struggle, close (1F-27)          3 (24-32) downwash ring from 120 m
//
//   node render/render.mjs --still scenes/lookdev/fx-water.js --time 1.0 --preset draft --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - water',
  duration: 32,
  seed: 9,
  cinematic: {
    atmosphere: { enabled: true, haze: 1.6, sunDirection: [-0.5, 0.35, -0.8], sunIlluminance: 6 },
    ao: { enabled: false },
    dof: { enabled: false },
    grade: { exposure: 0.0 },
  },
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(-50, 35, -80); sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 40, swell: 0.3, choppiness: 1.0, seed: 5 });
  scene.add(ocean.mesh);
  // the scout stand-in: dark body skimming in from +x at a shallow angle, hitting at t = 0.8 (x = 0)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 4.5, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.6 }));
  body.rotation.z = Math.PI / 2; body.castShadow = true; scene.add(body);
  const height = (x, z) => ocean.heightAt(x, z);
  const path = (t) => {
    if (t < 0.8) return [(0.8 - t) * 30, 0.6 + (0.8 - t) * 9, 0];            // diving in at ~17 deg
    const a = t - 0.8;                                                            // skidding, slowing
    return [-(1 - Math.exp(-a / 0.9)) * 22, -0.2, 0];
  };
  const fx = await createFx(ctx, { ground: 0, wind: [2.5, 0, 1.0], tier: ctx.meta.fxTier });
  fx.water.splash({ at: [0, 0, 0], t0: 0.8, size: 4, speed: 30, dir: [-0.95, -0.3, 0], height, seed: 2 });
  fx.water.trail({ path: (t) => path(t), t0: 0.85, t1: 4.5, width: 2.2, height, life: 14, seed: 3 });
  fx.water.spray({ at: (t) => path(t), t0: 0.95, duration: 1.4, dir: [-0.6, 0.6, 0], spread: 0.6, speed: 9, count: 500, height, seed: 4, mistSize: 0.8 });
  fx.water.churn({ at: [-22, 0, 0], t0: 4.5, t1: 40, radius: 2.2, rate: 2.5, strength: 0.6, height, seed: 5 });
  fx.blood.water({ at: [-22.6, 0, 0.4], t0: 5.0, radius: 6, tau: 10, height: (x, z) => ocean.heightAt(x, z), seed: 6 });
  // downwash ring: a dragon hovering 15 m over the water at (200, 0, -100), three downstrokes
  fx.water.downwash({ at: [200, 0, -100], t0: 24.3, bursts: [0, 1.2, 2.4], radius: 28, height, seed: 7 });
  S = { fx, ocean, body, path };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(3, Math.floor(t / 8));
  cam.near = 0.2; cam.far = 6000;
  ctx.lens.sensor = 'super35'; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  const tt = view === 3 ? t : t - view * 8 + (view === 2 ? 8 : 0);       // view 2 shows t+8 (the struggle), view 3 the absolute time
  S.ocean.update(t);
  if (view === 0) { cam.position.set(5, 2.5, 60); cam.lookAt(-4, 2, 0); ctx.lens.focalLength = 50; }
  else if (view === 1) { cam.position.set(30, 140, 90); cam.lookAt(-10, 0, 0); ctx.lens.focalLength = 35; }
  else if (view === 2) { cam.position.set(-14, 3.5, 18); cam.lookAt(-22, 0, 0); ctx.lens.focalLength = 50; }
  else { cam.position.set(260, 18, 20); cam.lookAt(200, 6, -100); ctx.lens.focalLength = 35; }
  const p = S.path(tt);
  S.body.position.set(p[0], p[1] + (tt > 0.8 ? S.ocean.heightAt(p[0], p[2]) : 0), p[2]);
  S.body.rotation.set(0, 0, Math.PI / 2 + (tt < 0.8 ? 0.3 : 0.05 * Math.sin(tt * 2)));
  S.fx.update(tt);
}
