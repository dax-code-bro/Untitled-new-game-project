// One KTX2 (Basis Universal) loader for the whole game: GPU-compressed textures inside the
// models (people, the concept car, the guns) and the tree textures. It transcodes in web workers
// to whatever the GPU takes (BC7 on desktop, ASTC/ETC on phones), so a texture costs a quarter of
// the video memory of a JPEG/PNG and never blocks the main thread on an image decode.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let loader = null, markReady;
const waiting = [];
// models asked for before the renderer exists (the gun catalogue preloads at start-up) wait for this;
// a page that never makes a KTX2 loader still gets its other models after a few seconds
export const ktx2Ready = new Promise((r) => { markReady = r; setTimeout(r, 8000); });
export function initKTX2(renderer) {
  if (loader) return loader;
  loader = new KTX2Loader().setTranscoderPath('vendor/three/addons/libs/basis/').detectSupport(renderer);
  for (const fn of waiting.splice(0)) fn(loader);
  markReady();
  return loader;
}
export const ktx2Loader = () => loader;
// a GLTFLoader that can read KHR_texture_basisu (now, or as soon as the renderer exists)
export function withKTX2(gltfLoader) {
  if (loader) gltfLoader.setKTX2Loader(loader); else waiting.push((l) => gltfLoader.setKTX2Loader(l));
  return gltfLoader;
}

// A texture from `base` + .ktx2 (stored pre-flipped, so it matches TextureLoader's default
// orientation), falling back to the original image (base + ext) if there's no KTX2 copy or this
// browser can't transcode it.
const _tl = new THREE.TextureLoader();
export function loadTexture(base, ext, srgb) {
  const fin = (t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  const image = () => _tl.loadAsync(base + ext).then(fin);
  return loader ? loader.loadAsync(base + '.ktx2').then(fin).catch(image) : image();
}
