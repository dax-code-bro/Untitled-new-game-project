// Loads the CC0 model packs (Quaternius people + animations, Kenney cars) and
// prepares them: animations are retargeted once per skeleton family.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeClips, UAL_TO_MODULAR } from './retarget.js';

export const PEOPLE_ALL = ['m_casual', 'm_casual2', 'm_suit', 'm_worker', 'm_punk', 'm_beach', 'f_casual', 'f_formal', 'f_suit', 'f_worker', 'f_punk', 'm_swat'];
export const PEOPLE_LITE = ['m_casual', 'm_suit', 'f_casual', 'f_formal', 'm_swat'];

// Real-world lengths + handling for each Kenney vehicle
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

export async function loadLibrary(quality, progress = () => {}) {
  const loader = new GLTFLoader();
  const base = 'assets/';
  const people = quality.label === 'Phone' || quality.label === 'Low' ? PEOPLE_LITE : PEOPLE_ALL;
  const carIds = Object.keys(VEHICLES);
  const total = people.length + carIds.length + 1;
  let done = 0;
  const step = (what) => progress(++done / total, what);

  const lib = { people: {}, cars: {}, clips: {}, peopleIds: people.filter((p) => p !== 'm_swat') };

  const anims = await loader.loadAsync(base + 'anims/ual.glb');
  step('Loading animations');
  await Promise.all(carIds.map(async (id) => {
    const g = await loader.loadAsync(`${base}cars/${id}.glb`);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        // Kenney cars use one colour-map atlas; give them a bit of gloss.
        o.material.roughness = 0.45; o.material.metalness = 0.15;
      }
    });
    lib.cars[id] = g.scene;
    step('Loading vehicles');
  }));
  await Promise.all(people.map(async (id) => {
    const g = await loader.loadAsync(`${base}people/${id}.glb`);
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    lib.people[id] = { scene: g.scene, family: id[0] === 'f' ? 'women' : 'men' };
    step('Loading people');
  }));
  // Retarget the animation library once per skeleton family
  for (const fam of ['men', 'women']) {
    const sample = Object.values(lib.people).find((p) => p.family === fam);
    if (!sample) continue;
    const clips = bakeClips(anims.scene, anims.animations, sample.scene, UAL_TO_MODULAR);
    lib.clips[fam] = Object.fromEntries(clips.map((c) => [c.name, c]));
  }
  return lib;
}
