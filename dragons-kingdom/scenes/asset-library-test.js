// Asset library check: every downloaded PBR set on a 1 m ball, lit only by a
// real HDRI (Poly Haven "kloofendal_48d_partly_cloudy": its sun is extracted
// into a shadow-casting DirectionalLight with exactly the removed energy),
// with the classic VFX lookdev references (18% grey ball, chrome ball), a
// scanned coastal-cliff composition behind them, and a MakeHuman body and a
// fish for scale. Proves the loaders in scenes/lib/assets.js: colour spaces,
// normal-map conventions, packed maps, tiling in metres, glTF with
// Draco/KTX2/instancing, OBJ.
//
//   node assets-lib/fetch.mjs     (once: downloads the library)
//   node render/render.mjs --still scenes/asset-library-test.js --time 0 --preset final --png output/asset-library-test-4k.png
import * as THREE from 'three';
import { loadHDRI, loadPBR, loadModel } from './lib/assets.js';

export const meta = {
  title: 'Asset library check (HDRI-lit material balls)',
  duration: 1,
  toneMapping: 'aces',
  exposure: 0.65,   // 18% card under this HDRI's sun+sky (E ~ 4.8 on the ground) ~ a 0.18 card at exposure 1
  vignette: 0.1,
  seed: 1,
};

// [asset id, label, extra loadPBR options]
const BALLS = [
  ['pbr/acg_ground037', 'Ground037 moss grass'], ['pbr/acg_ground03', 'Ground03 grass+dirt'], ['pbr/acg_ground13', 'Ground13 sparse grass'],
  ['pbr/acg_ground24', 'Ground24 mossy dirt'], ['pbr/acg_ground36', 'Ground36 dark mud'], ['pbr/acg_ground05', 'Ground05 dry dirt'],
  ['pbr/acg_ground27', 'Ground27 pale sand'], ['pbr/acg_ground25', 'Ground25 rippled sand'], ['pbr/acg_ground28', 'Ground28 shingle'],
  ['pbr/acg_rock26', 'Rock26 pale rock'], ['pbr/ph_white_sandstone_bricks_03', 'PH white sandstone bricks'], ['pbr/ph_sandstone_blocks_04', 'PH sandstone blocks'],
  ['pbr/ph_floor_pebbles_01', 'PH floor pebbles'], ['pbr/acg_wood35', 'Wood35 weathered'], ['pbr/acg_planks21', 'Planks21'],
  ['pbr/acg_leather05', 'Leather05 red-brown'], ['pbr/acg_leather26', 'Leather26 black'], ['pbr/acg_metal26', 'Metal26 rusted iron'],
  ['pbr/acg_fabric36', 'Fabric36 linen', { sheen: { color: 0xd8d2c4, roughness: 0.7 } }], ['pbr/acg_fabric40', 'Fabric40 red cloth', { sheen: { color: 0x804030, roughness: 0.7 } }],
  ['pbr/acg_fabric37', 'Fabric37 green cloth', { sheen: { color: 0x305030, roughness: 0.7 } }], ['pbr/khr_wicker', 'Khronos wicker'],
];
const R = 0.5, COLS = 6, DX = 1.45, DZ = 1.9;
const stepY = (row) => 0.3 + row * 0.85;          // rows stand on stepped stone plinths

/** Box geometry whose UVs are in metres (planar per face), so loadPBR(..., { worldSize: 1 }) tiles at real scale. */
function meterBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, p.getZ(i) * Math.sign(n.getX(i)), p.getY(i));
    else if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i) * -Math.sign(n.getY(i)));
    else uv.setXY(i, p.getX(i) * Math.sign(n.getZ(i)), p.getY(i));
  }
  return g;
}

function label(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#e8e8e8'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.155), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.55, 0.55, 0.55) }));
  return m;
}

export async function setup(ctx) {
  const { scene, camera, quality } = ctx;

  // ------------------------------------------------- light: the HDRI only
  // measured sun azimuth 36 deg in the HDRI -> rotate by -1.58 rad: key light from camera front-left
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.58 });
  const sun = sky.apply(scene);
  console.log('[asset-test] sun', JSON.stringify({ dir: sky.sun.direction.toArray().map((v) => +v.toFixed(3)), intensity: +sky.sun.intensity.toFixed(2), color: sky.sun.color.toArray().map((v) => +v.toFixed(3)), peak: Math.round(sky.sun.peak), solidAngle: sky.sun.solidAngle }));
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  const target = new THREE.Vector3(0, 0, -3.4);
  sun.position.copy(target).addScaledVector(sky.sun.direction, 60);
  sun.target.position.copy(target);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 20, far: 110 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- ground
  const groundMat = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 80 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------------------------------------------------- material balls
  const sphere = new THREE.SphereGeometry(R, 96, 64);
  const n = BALLS.length + 2;
  const rows = Math.ceil(n / COLS);
  const place = (i) => {
    const row = Math.floor(i / COLS), col = i % COLS;
    return new THREE.Vector3((col - (COLS - 1) / 2) * DX, stepY(row) + R, -row * DZ);
  };
  const mats = await Promise.all(BALLS.map(([id, , o]) => loadPBR(id, ctx, { worldSize: [2 * Math.PI * R, Math.PI * R], ...(o || {}) })));
  const refs = [
    ['18% grey (sRGB 118)', new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.18, 0.18, 0.18), roughness: 0.9, metalness: 0 })],
    ['chrome', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1 })],
  ];
  const all = [...refs.map(([l, m]) => [l, m]), ...BALLS.map(([, l], k) => [l, mats[k]])];
  all.forEach(([text, mat], i) => {
    const p = place(i);
    const ball = new THREE.Mesh(sphere, mat);
    ball.position.copy(p);
    ball.rotation.y = 0.5;
    ball.castShadow = ball.receiveShadow = true;
    scene.add(ball);
    const l = label(text);
    const row = Math.floor(i / COLS);
    l.position.set(p.x, stepY(row) + 0.07, p.z + R + 0.3);   // name card on the tread, leaning back
    l.rotation.x = -1.0;
    scene.add(l);
  });
  const stone = await loadPBR('pbr/ph_sandstone_blocks_04', ctx, { worldSize: 1 });
  for (let row = 0; row < rows; row++) {
    const h = stepY(row);
    const step = new THREE.Mesh(meterBox(COLS * DX + 0.6, h, DZ), stone);
    step.position.set(0, h / 2, -row * DZ);
    step.castShadow = step.receiveShadow = true;
    scene.add(step);
  }

  // ------------------------------------------------- scans and scale refs
  const cliff = await loadModel('model/babylon_coastal_cliff', ctx);
  cliff.scene.rotation.y = Math.PI;               // its weathered face looks along -z in the file
  cliff.scene.updateMatrixWorld(true);
  const cb = new THREE.Box3().setFromObject(cliff.scene), cc = cb.getCenter(new THREE.Vector3());
  cliff.scene.position.set(-cc.x + 4, -cb.min.y - 0.4, -48 - cc.z);
  scene.add(cliff.scene);
  console.log('[asset-test] cliff bounds (m):', cb.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(1)).join(' x '));

  const lantern = await loadModel('model/khr_lantern', ctx, { noEmissive: true });
  lantern.scene.position.set(-(COLS / 2) * DX - 1.6, 0, -2.2 * DZ);
  lantern.scene.rotation.y = 0.6;
  scene.add(lantern.scene);

  const human = await loadModel('human/makehuman_base', ctx);
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.45, 0.45, 0.45), roughness: 0.8 });
  human.scene.traverse((o) => { if (o.isMesh) o.material = skin; });
  const box = new THREE.Box3().setFromObject(human.scene);
  human.scene.position.set((COLS / 2) * DX + 1.1, -box.min.y, 1.3);
  human.scene.rotation.y = -0.3;
  scene.add(human.scene);
  const hb = new THREE.Box3().setFromObject(human.scene);
  console.log('[asset-test] MakeHuman height (m):', (hb.max.y - hb.min.y).toFixed(3));

  const fish = await loadModel('model/khr_barramundifish', ctx);
  fish.scene.position.set(-(COLS / 2) * DX - 0.9, 0, 1.6);
  fish.scene.rotation.y = 0.9;
  scene.add(fish.scene);

  // ---------------------------------------------------------------- camera
  camera.fov = 40;
  camera.near = 0.1; camera.far = 2000;
  camera.position.set(0.3, 3.7, 10.4);
  camera.lookAt(0.3, 1.75, -3.2);
  camera.updateProjectionMatrix();

  ctx.shadows.key = 'static';
  ctx.shadows.dynamic = [];
  console.log('[asset-test] rows', rows, 'balls', n);
}

let logged = false;
export function update(t, ctx) {
  // diagnostics only (no effect on the picture): what the GPU holds after the runtime's upload
  if (!logged) { logged = true; const m = ctx.renderer.info.memory; console.log(`[asset-test] gpu textures ${m.textures}, geometries ${m.geometries}`); }
}
