// Photo-scanned PBR surfaces (ambientCG + Poly Haven, both CC0) in GPU-compressed KTX2.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// name, maps available, real-world size of one texture tile in metres
export const SURF = {
  grass:    { name: 'Grass004', maps: ['color', 'normal', 'rough'], size: 2.4 },
  dry:      { name: 'Ground037', maps: ['color', 'normal', 'rough'], size: 3.0 },
  forest:   { name: 'forest_ground_04', maps: ['color', 'normal', 'rough', 'ao'], size: 3.0 },
  sand:     { name: 'coast_sand_01', maps: ['color', 'normal', 'rough', 'ao'], size: 3.0 },
  rock:     { name: 'Rock030', maps: ['color', 'normal', 'rough'], size: 6.0 },
  asphalt:  { name: 'asphalt_02', maps: ['color', 'normal', 'rough', 'ao'], size: 4.0 },
  concrete: { name: 'Concrete034', maps: ['color', 'normal', 'rough'], size: 2.5 },
  bricks:   { name: 'brick_wall_10', maps: ['color', 'normal', 'rough'], size: 2.5 },
  plaster:  { name: 'plastered_wall_03', maps: ['color', 'normal'], size: 3.0 },
  glass:    { name: 'Facade002', maps: ['color', 'normal', 'rough', 'metal', 'emit'], size: 15.0 },
  office:   { name: 'Facade014', maps: ['color', 'normal', 'emit'], size: 80.0 },
  // second library (CC0: ambientCG, Poly Haven, cgbookcase via the CC0 texture mirror)
  road:     { name: 'Asphalt012', maps: ['color', 'normal', 'rough', 'height'], size: 3.2 },
  pavers:   { name: 'square_concrete_pavers', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 2.4 },
  cobble:   { name: 'Cobblestone01', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 1.6 },
  redbrick: { name: 'red_brick', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 2.2 },
  stucco:   { name: 'StuccoWall01', maps: ['color', 'normal', 'rough', 'ao'], size: 2.6 },
  siding:   { name: 'weathered_plank_siding', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 2.4 },
  shingles: { name: 'RoofingTiles013A', maps: ['color', 'normal', 'rough', 'ao'], size: 2.6 },
  steel:    { name: 'CorrugatedSteel005', maps: ['color', 'normal', 'rough', 'ao', 'metal'], size: 2.2 },
  rusty:    { name: 'RustyCorrugatedMetalPanel01', maps: ['color', 'normal', 'rough', 'ao', 'metal'], size: 2.2 },
  mud:      { name: 'brown_mud', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 3.0 },
  leaves:   { name: 'forest_leaves_02', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 2.6 },
  dirt:     { name: 'Dirt01', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 2.2 },
  gravel:   { name: 'Gravel004', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 1.6 },
  cliff:    { name: 'cliff_side', maps: ['color', 'normal', 'rough', 'ao', 'height'], size: 7.0 },
  woodfloor:{ name: 'WoodFloor007', maps: ['color', 'normal', 'rough', 'ao'], size: 2.0 },
  tiles:    { name: 'BathroomTiles02', maps: ['color', 'normal', 'rough'], size: 1.5 },
};

function flat(r, g, b, srgb) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
const DEFAULTS = { color: [128, 128, 128, true], normal: [128, 128, 255], rough: [230, 230, 230], ao: [255, 255, 255], metal: [0, 0, 0], emit: [0, 0, 0, true], height: [128, 128, 128] };

export async function loadSurfaces(renderer, quality, progress = () => {}) {
  const lite = quality.label === 'Phone';
  const loader = new KTX2Loader().setTranscoderPath('vendor/three/addons/libs/basis/').detectSupport(renderer);
  const out = {};
  const jobs = [];
  for (const [key, s] of Object.entries(SURF)) {
    out[key] = { size: s.size, real: false };
    for (const k of Object.keys(DEFAULTS)) out[key][k] = flat(...DEFAULTS[k]);
    for (const k of s.maps) {
      if (lite && k !== 'color' && k !== 'emit') continue;
      jobs.push([key, s.name, k]);
    }
  }
  let done = 0;
  await Promise.all(jobs.map(([key, name, k]) => loader.loadAsync(`assets/textures/${name}_${k}.ktx2`).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(quality.anisotropy || 4, renderer.capabilities.getMaxAnisotropy()); // the preset's level (it was 16x everywhere)
    t.colorSpace = k === 'color' || k === 'emit' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    out[key][k] = t;
    if (k === 'color') out[key].real = true;
  }).catch((e) => console.warn('texture failed', name, k, e)).finally(() => progress(++done / jobs.length))));
  loader.dispose();
  out.hasNormals = !lite;
  return out;
}
