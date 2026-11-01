// Photo-scanned PBR surfaces (ambientCG, CC0) in GPU-compressed KTX2.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

export const SURF = {
  grass: 'Grass004', dry: 'Ground037', forest: 'Ground068', sand: 'Ground054', rock: 'Rock030',
  asphalt: 'Asphalt010', concrete: 'Concrete034', bricks: 'Bricks090',
};

// A 1x1 placeholder so shaders always have something bound
function flat(r, g, b, srgb) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function loadSurfaces(renderer, quality, progress = () => {}) {
  const lite = quality.label === 'Phone';
  const kinds = lite ? ['color'] : ['color', 'normal', 'rough'];
  const loader = new KTX2Loader().setTranscoderPath('vendor/three/addons/libs/basis/').detectSupport(renderer);
  const out = {};
  const jobs = [];
  let done = 0, total = Object.keys(SURF).length * kinds.length;
  for (const [key, name] of Object.entries(SURF)) {
    out[key] = { color: flat(128, 128, 128, true), normal: flat(128, 128, 255), rough: flat(220, 220, 220), real: false };
    for (const k of kinds) {
      jobs.push(loader.loadAsync(`assets/textures/${name}_${k}.ktx2`).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());
        t.colorSpace = k === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        out[key][k] = t;
        out[key].real = true;
        progress(++done / total, 'Loading surfaces');
      }).catch((e) => { console.warn('texture failed', name, k, e); progress(++done / total, 'Loading surfaces'); }));
    }
  }
  await Promise.all(jobs);
  loader.dispose();
  out.hasNormals = !lite;
  return out;
}
