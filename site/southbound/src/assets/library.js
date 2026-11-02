// Loads the CC0 model packs (MakeHuman people, Quaternius animations), builds the
// procedural vehicles, and
// prepares them: animations are retargeted once per skeleton family.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeClips, UAL_TO_MH } from './retarget.js';
import { buildCar } from './carbuilder.js';

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
  const carIds = Object.keys(VEHICLES);
  const total = people.length + carIds.length + 1;
  let done = 0;
  const step = (what) => progress(++done / total, what);

  const lib = { people: {}, cars: {}, clips: {}, peopleIds: people.filter((p) => p !== 'mh_cop') };

  const anims = await loader.loadAsync(base + 'anims/ual.glb');
  step('Loading animations');
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
