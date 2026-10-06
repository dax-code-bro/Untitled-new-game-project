// Cinematic stack fixture 2: FFT ocean (late pass: shallow water + shore
// foam), physical sky + aerial perspective, volumetric fog with a mist bank,
// shadow-mapped god rays and cloud shadows, cascaded shadows, a flying box.
// Kept small so the tests stay quick at 320x180.
import { createOcean } from 'dk/ocean.js';

export const meta = {
  title: 'Cinematic sea fixture', duration: 4,
  cinematic: {
    atmosphere: { enabled: true, haze: 2, sunDirection: [0.4, 0.22, -0.89] },
    volumetrics: {
      enabled: true, range: 300, resolution: [32, 18, 16], density: 0.002, heightFalloff: 0.08,
      banks: [{ center: [0, 3, -80], radius: [60, 6, 25], density: 0.03 }],
      cloudShadows: { coverage: 0.5, scale: 0.004, speed: [12, 0], altitude: 900 },
    },
    shadows: { cascades: 2, maxDistance: 150 },
  },
};

let S;
export async function setup(ctx) {
  const { THREE, scene, camera } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 4);
  sun.castShadow = true;
  scene.add(sun); scene.add(sun.target);
  const ocean = createOcean(ctx, { resolution: 64, cascades: [400, 60], segments: 96, windSpeed: 8, seed: 2 });
  scene.add(ocean.mesh);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.9 });
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 2), rockMat);
  rock.position.set(-6, 0.5, -30); rock.castShadow = rock.receiveShadow = true;
  scene.add(rock);
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xb8a47c, roughness: 1 }));
  seabed.rotation.x = -Math.PI / 2; seabed.position.set(20, -2.5, -40); seabed.receiveShadow = true;
  scene.add(seabed);
  // every lit material kind the stack patches (Lambert/Phong/Toon declare their varyings later than Standard)
  [THREE.MeshLambertMaterial, THREE.MeshPhongMaterial, THREE.MeshToonMaterial].forEach((M, i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 12), new M({ color: [0x8a5a3a, 0x3a5a8a, 0x8a8a3a][i] }));
    post.position.set(2 + i * 3, 0.5, -22 - i * 4); post.castShadow = post.receiveShadow = true;
    scene.add(post);
  });
  const flyer = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x302820, roughness: 0.6 }));
  flyer.castShadow = true;
  scene.add(flyer);
  camera.near = 0.3; camera.far = 20000;
  S = { ocean, flyer };
}

export function update(t, ctx) {
  S.ocean.update(t);
  S.flyer.position.set(-20 + t * 12, 9 + Math.sin(t * 2) * 1.5, -40);
  S.flyer.rotation.set(0, 0, Math.sin(t * 3) * 0.3);
  ctx.camera.position.set(-2 + t * 0.5, 3, 6);
  ctx.camera.lookAt(0, 2, -40);
  ctx.lens.focalLength = 30; ctx.lens.fstop = 2.8; ctx.lens.focusTarget = S.flyer;
}
