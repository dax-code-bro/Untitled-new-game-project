// Cinematic realism stack - look-development / reference scene (README, "Cinematic realism stack").
//
// A morning coast: FFT sea with shore foam around a rocky headland, a physical
// sky with a low sun, aerial perspective, a sea-mist bank lit by the sun
// (shadow-mapped light shafts), moving cloud shadows, a placeholder dragon
// crossing the frame (velocity motion blur, cascaded shadows), filmed from a
// small boat (vehicle shake) on a 40 mm lens at T2.8 with a focus pull onto
// the dragon. Procedural only: no downloaded assets.
//
//   node render/render.mjs --still scenes/cinematic-lookdev.js --time 4 --preset final --png out.png
//   node render/render.mjs scenes/cinematic-lookdev.js --preset draft
//   node render/render.mjs scenes/cinematic-lookdev.js --preset final --cinematic hero   (8 sub-frames)
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { createDragon } from './lib/dragon.js';

export const meta = {
  title: 'Cinematic look development - morning coast',
  duration: 8,
  seed: 7,
  cinematic: {
    atmosphere: { enabled: true, haze: 1.8, sunDirection: [-0.42, 0.16, -0.89], sunIlluminance: 6 },
    volumetrics: {
      enabled: true, range: 700, density: 0.0007, heightFalloff: 0.05, noiseAmount: 0.7, anisotropy: 0.7,
      banks: [
        { center: [-90, 5, -330], radius: [140, 12, 60], density: 0.03, noise: 0.85 },
        { center: [160, 4, -520], radius: [220, 9, 70], density: 0.02, noise: 0.9 },
      ],
      cloudShadows: { coverage: 0.42, scale: 0.0011, speed: [9, 3], altitude: 1400 },
    },
    shadows: { cascades: 3, maxDistance: 600 },
    dof: { samples: 48 },
  },
};

let S;

function rock(THREE, rng, r, detail = 4) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const ph = [rng() * 6, rng() * 6, rng() * 6];
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const n = 1 + 0.18 * Math.sin(x * 0.35 + ph[0]) * Math.cos(z * 0.31 + ph[1]) + 0.07 * Math.sin(y * 1.3 + x * 0.9 + ph[2]) + 0.03 * Math.sin(x * 3.1 + z * 2.7);
    p.setXYZ(k, x * n, y * n * 0.75, z * n);
  }
  g.computeVertexNormals();
  return g;
}

export async function setup(ctx) {
  const { THREE, scene, camera, rng, quality } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  scene.add(sun); scene.add(sun.target);

  const ocean = createOcean(ctx, { windSpeed: 8, windDirection: 65, swell: 0.45, choppiness: 1.1, seed: 11 });
  scene.add(ocean.mesh);

  // rocky headland on the left, sea stacks in the distance, a shoal under the surface
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b5650, roughness: 0.93 });
  const head = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(rock(THREE, rng, 10 + rng() * 22), rockMat);
    m.position.set(-75 - rng() * 70 - i * 3, -6 + rng() * 14, -150 - i * 26 - rng() * 20);
    m.rotation.set(rng(), rng() * 6, rng());
    m.castShadow = m.receiveShadow = true;
    head.add(m);
  }
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(rock(THREE, rng, 6 + rng() * 6), rockMat);
    m.scale.y = 2.2 + rng() * 1.5;
    m.position.set(60 + i * 70 + rng() * 30, 0, -600 - rng() * 300);
    m.castShadow = m.receiveShadow = true;
    head.add(m);
  }
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(rock(THREE, rng, 1.5 + rng() * 2.5, 3), rockMat);
    m.position.set(-46 + i * 11 + rng() * 6, -0.4 + rng() * 0.6, -62 - rng() * 25);
    m.castShadow = m.receiveShadow = true;
    head.add(m);
  }
  const shoal = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0xa8956f, roughness: 1 }));
  shoal.rotation.x = -Math.PI / 2; shoal.position.set(-20, -2.2, -70); shoal.receiveShadow = true;
  head.add(shoal);
  scene.add(head);

  const dragon = createDragon(THREE, { scale: 1 });
  dragon.root.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  scene.add(dragon.root);

  camera.near = 0.3; camera.far = 30000;
  S = { ocean, dragon, m: new THREE.Matrix4(), up: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3(), q: new THREE.Vector3() };
}

// the dragon's path: a gentle descending arc from the right across the headland
function dragonAt(t, out) {
  return out.set(92 - t * 28, 31 - t * 1.2 + Math.sin(t * 0.7) * 2.5, -205 + t * 8);
}

export function update(t, ctx) {
  const { ocean, dragon, m, up, p, q } = S;
  ocean.update(t);
  dragonAt(t, p);
  dragonAt(t + 0.05, q);
  m.lookAt(q, p, up);                         // +z of the dragon toward its direction of travel
  dragon.root.position.copy(p);
  dragon.root.quaternion.setFromRotationMatrix(m);
  dragon.root.rotateZ(0.18 + 0.05 * Math.sin(t * 1.1));
  dragon.root.updateMatrixWorld(true);
  dragon.pose(t);

  // camera on a small boat: slow drift + bobbing on the swell (vehicle shake)
  const cam = ctx.camera;
  const bob = ocean.heightAt(0, 8);
  cam.position.set(-6 + t * 0.9, 2.4 + bob * 0.6, 8);
  cam.lookAt(-10 + t * 2.0, 18 - t * 0.6, -200);
  applyShake(cam, t, { kind: 'vehicle', amount: 0.35, seed: 3 });

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 40;
  ctx.lens.fstop = 2.8;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 800;
  ctx.lens.focusTarget = dragon.root;        // the focus puller follows the dragon
}
