// Loads the CC0 model packs (MakeHuman people, Quaternius animations), builds the
// procedural vehicles, and
// prepares them: animations are retargeted once per skeleton family.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeClips, UAL_TO_MH } from './retarget.js';
import { buildCar } from './carbuilder.js';
import { loadOpen, K } from './open.js';

// Realistic people built from CC0 MakeHuman assets (tools/southbound/build-human.py)
export const PEOPLE_ALL = ['mh_m1', 'mh_m2', 'mh_m3', 'mh_m4', 'mh_f1', 'mh_f2', 'mh_cop'];
export const PEOPLE_LITE = ['mh_m2', 'mh_f1', 'mh_cop'];

// Real-world lengths + handling for each vehicle (bodies come from carbuilder.js)
export const VEHICLES = {
  sedan: { name: 'Meridian Sedan', len: 4.7, accel: 9, top: 50, grip: 7.5, weight: 6 },
  'sedan-sports': { name: 'Vantor GT', len: 4.6, accel: 13, top: 72, grip: 9, weight: 2 },
  'hatchback-sports': { name: 'Rivet Hatch', len: 4.2, accel: 12, top: 62, grip: 9, weight: 2 },
  suv: { name: 'Brazos Trailhand', len: 4.9, accel: 8, top: 46, grip: 6.5, weight: 4 },
  'suv-luxury': { name: 'Brazos Platinum', len: 5.0, accel: 9.5, top: 54, grip: 7, weight: 2 },
  taxi: { name: 'Calvera Cab', len: 4.8, accel: 9, top: 50, grip: 7.5, weight: 2 },
  van: { name: 'Coastline Hauler', len: 5.0, accel: 7, top: 40, grip: 6, weight: 2 },
  delivery: { name: 'Gulf Parcel Van', len: 5.8, accel: 6.5, top: 36, grip: 5.5, weight: 1.5 },
  truck: { name: 'Ranchero 2500', len: 5.5, accel: 8, top: 46, grip: 6.2, weight: 3 },
  police: { name: 'Calvera PD Cruiser', len: 5.0, accel: 12.5, top: 64, grip: 8.5, weight: 0 },
  ambulance: { name: 'Mercy Ambulance', len: 6.2, accel: 7.5, top: 44, grip: 6, weight: 0.4 },
  firetruck: { name: 'CFD Engine 9', len: 8.8, accel: 6, top: 36, grip: 5, weight: 0.2 },
  'garbage-truck': { name: 'City Sanitation', len: 8.2, accel: 5.5, top: 32, grip: 5, weight: 0.4 },
};

// The body types built at load time (catalog models are built on first use)
export const BASE_CAR_IDS = Object.keys(VEHICLES);
// open-model vehicles (not procedural)
VEHICLES['rusty-pickup'] = { name: 'Rusty \'89 Pickup', len: 5.2, accel: 6.5, top: 38, grip: 6, weight: 0 };

// Quaternius Zombie Apocalypse Kit pickup (CC0): wheel pivots, nose to +z, rusty paint
function preparePickup(scene) {
  const root = new THREE.Group();
  root.add(scene);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const c = (n) => { const o = scene.getObjectByName(n); return o ? box.setFromObject(o).getCenter(new THREE.Vector3()) : null; };
  const f = c('FrontWheel_L'), b = c('BackWheels');
  if (f && b && f.z < b.z) { scene.rotation.y = Math.PI; root.updateMatrixWorld(true); }
  for (const [n, name] of [['FrontWheel_L', 'wheel-front-left'], ['FrontWheel_R', 'wheel-front-right'], ['BackWheels', 'wheel-back-left']]) {
    const o = scene.getObjectByName(n);
    if (!o) continue;
    const pivot = new THREE.Group(); pivot.name = name;
    pivot.position.copy(box.setFromObject(o).getCenter(new THREE.Vector3()));
    root.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(o);
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (o.material && o.material.name === 'Atlas') { o.material = o.material.clone(); o.material.color.setRGB(0.8, 0.66, 0.52); o.material.roughness = 0.88; o.material.metalness = 0.12; }
  });
  return root;
}

// Wrap the concept car: wheels under pivots named like the game expects, nose toward +z
function prepareConcept(scene) {
  const root = new THREE.Group();
  const model = scene;
  root.add(model);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const center = (name) => { const n = model.getObjectByName(name); return n ? box.setFromObject(n).getCenter(new THREE.Vector3()) : null; };
  const head = center('BodyHeadlights'), tail = center('BodyTaillights');
  if (head && tail && head.z < tail.z) { model.rotation.y = Math.PI; root.updateMatrixWorld(true); }
  for (const [k, name] of [['FrontL', 'wheel-front-left'], ['FrontR', 'wheel-front-right'], ['RearL', 'wheel-back-left'], ['RearR', 'wheel-back-right']]) {
    const tire = model.getObjectByName('Wheel' + k);
    if (!tire) continue;
    const c = box.setFromObject(tire).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.copy(c);
    root.add(pivot); pivot.updateMatrixWorld(true);
    for (const part of ['', 'Rim', 'BrakeDisc']) { const n = model.getObjectByName('Wheel' + k + part); if (n) pivot.attach(n); }
  }
  // door pivots on the front hinge, so the doors can swing open when you get in
  root.updateMatrixWorld(true);
  for (const side of ['L', 'R']) {
    const parts = [];
    root.traverse((o) => { if (o.isMesh && new RegExp(`Door${side}`).test(o.name)) parts.push(o); });
    if (!parts.length) continue;
    const b = new THREE.Box3();
    parts.forEach((o) => b.expandByObject(o));
    const c = b.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.set(c.x > 0 ? b.max.x - 0.05 : b.min.x + 0.05, c.y, b.max.z - 0.05);
    root.add(pivot); pivot.updateMatrixWorld(true);
    parts.forEach((o) => pivot.attach(o));
    pivot.name = c.x > 0 ? 'door-drv' : 'door-pass'; // the car's left (+x) is the driver's side
    pivot.userData.open = c.x > 0 ? -1.1 : 1.1;
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    // physical transmission re-renders the whole scene every frame; tinted glass looks the same on a car
    const m = o.material;
    if (m && m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.32; m.roughness = Math.min(m.roughness, 0.05); m.depthWrite = false; }
  });
  root.userData.hasLights = true; root.userData.paintable = true;
  return root;
}

function tunePerson(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    if (m.name === 'skin') m.roughness = 0.5;
    if (m.name === 'eyes') m.roughness = 0.05;
    if (m.alphaTest > 0) { m.alphaTest = 0.4; m.side = THREE.DoubleSide; }
  });
}

export async function loadLibrary(quality, progress = () => {}) {
  const loader = new GLTFLoader();
  const base = 'assets/';
  const people = quality.label === 'Phone' || quality.label === 'Low' ? PEOPLE_LITE : PEOPLE_ALL;
  const carIds = BASE_CAR_IDS;
  const total = people.length + carIds.length + 1;
  let done = 0;
  const step = (what) => progress(++done / total, what);

  const lib = { people: {}, cars: {}, clips: {}, peopleIds: people.filter((p) => p !== 'mh_cop'), quality };

  const anims = await loader.loadAsync(base + 'anims/ual.glb');
  step('Loading animations');
  // the realistic concept car (Khronos glTF sample, CC-BY 4.0 / CC0 base) on PC
  if (quality.key !== 'phone' && quality.key !== 'low') {
    const g = await loadOpen(K('CarConcept'));
    if (g) lib.cars.concept = prepareConcept(g.scene);
  }
  // Rico's rusty pickup is a procedural body now (carbuilder.js), built on first use
  void preparePickup;
  for (const id of carIds) {
    lib.cars[id] = buildCar(id, quality);
    step('Building vehicles');
    await new Promise((r) => setTimeout(r, 0)); // let the loading bar repaint
  }
  await Promise.all(people.map(async (id) => {
    const g = await loader.loadAsync(`${base}people/${id}.glb`);
    tunePerson(g.scene);
    if (id === 'mh_cop') {
      // police uniform: dark navy shirt and trousers
      g.scene.traverse((o) => { if (o.isMesh && o.material.name === 'suit') { o.material = o.material.clone(); o.material.color.set(0x34405a); } });
    }
    lib.people[id] = { scene: g.scene, family: id.startsWith('mh_f') ? 'mh_f' : 'mh_m' };
    step('Loading people');
  }));
  // The player
  const hero = await loader.loadAsync(base + 'people/hero.glb');
  tunePerson(hero.scene);
  lib.people.hero = { scene: hero.scene, family: 'mh_m' };
  // Retarget the animation library once per body type (men/women differ in height)
  for (const fam of ['mh_m', 'mh_f']) {
    const sample = Object.values(lib.people).find((p) => p.family === fam);
    if (!sample) continue;
    lib.clips[fam] = Object.fromEntries(bakeClips(anims.scene, anims.animations, sample.scene, UAL_TO_MH).map((c) => [c.name, c]));
  }
  return lib;
}
