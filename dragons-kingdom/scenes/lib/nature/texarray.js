// Photo-texture layers packed into WebGL2 texture arrays (one sampler per map kind for any number
// of layers), so one landscape shader can blend rock, turf, soil, sand, shingle, scree... next to the
// cinematic stack's own samplers (shadow cascades, AO, clouds, environment) without running out
// of texture units.
//
//   const T = await textureLayers(ctx, ['pbr/acg_rock26', 'pbr/acg_ground037', ...], { size: 1024 });
//   T.albedo (sRGB), T.normal (OpenGL convention for every layer), T.data (r = roughness, g = height,
//   b = AO), T.tile[i] (metres per texture repeat), T.index[id]
import * as THREE from 'three';
import { pbrMaps } from '../sets/materials.js';
import { assetInfo, libUrl } from '../assets.js';

const cache = new Map();
const canvasOf = (size) => {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  return c.getContext('2d', { willReadFrequently: true });
};
function pixels(img, size, g) {
  g.clearRect(0, 0, size, size);
  g.drawImage(img, 0, 0, size, size);
  return g.getImageData(0, 0, size, size).data;
}
const chanIdx = { R: 0, G: 1, B: 2, A: 3 };

export function textureLayers(ctx, ids, opts = {}) {
  const size = opts.size ?? 1024;
  const key = `${size}|${ids.join(',')}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const maps = await Promise.all(ids.map((id) => pbrMaps(ctx, id)));
    const infos = await Promise.all(ids.map((id) => assetInfo(id)));
    const n = ids.length, layer = size * size * 4;
    const alb = new Uint8Array(layer * n), nrm = new Uint8Array(layer * n), dat = new Uint8Array(layer * n);
    const g = canvasOf(size);
    for (let L = 0; L < n; L++) {
      const M = maps[L], P = infos[L].params;
      const o = L * layer;
      if (M.alb) alb.set(pixels(M.alb.image, size, g), o); else alb.fill(160, o, o + layer);
      if (M.nrm) {
        const px = pixels(M.nrm.image, size, g);
        const flip = M.nrmY < 0;
        for (let i = 0; i < size * size; i++) { nrm[o + i * 4] = px[i * 4]; nrm[o + i * 4 + 1] = flip ? 255 - px[i * 4 + 1] : px[i * 4 + 1]; nrm[o + i * 4 + 2] = px[i * 4 + 2]; nrm[o + i * 4 + 3] = 255; }
      } else for (let i = 0; i < size * size; i++) { nrm[o + i * 4] = 128; nrm[o + i * 4 + 1] = 128; nrm[o + i * 4 + 2] = 255; nrm[o + i * 4 + 3] = 255; }
      // data: roughness, height, AO
      for (let i = 0; i < size * size; i++) { dat[o + i * 4] = 200; dat[o + i * 4 + 1] = 128; dat[o + i * 4 + 2] = 255; dat[o + i * 4 + 3] = 255; }
      if (M.rgh) {
        const px = pixels(M.rgh.image, size, g), e = M.rghExpr || 'G';
        const inv = e.startsWith('1-'), c = chanIdx[inv ? e.slice(2) : e] ?? 1;
        for (let i = 0; i < size * size; i++) dat[o + i * 4] = inv ? 255 - px[i * 4 + c] : px[i * 4 + c];
      }
      // height: an explicit height map, or a packed channel
      const hPath = P.maps.height;
      let himg = null;
      if (hPath) himg = await new THREE.TextureLoader().loadAsync(libUrl(hPath)).then((t) => t.image).catch(() => null);
      if (himg) { const px = pixels(himg, size, g); for (let i = 0; i < size * size; i++) dat[o + i * 4 + 1] = px[i * 4]; }
      else if (P.maps.packed && P.packed_channels?.height && M.rgh) { const px = pixels(M.rgh.image, size, g), c = chanIdx[P.packed_channels.height]; for (let i = 0; i < size * size; i++) dat[o + i * 4 + 1] = px[i * 4 + c]; }
      else if (M.alb) { const px = pixels(M.alb.image, size, g); for (let i = 0; i < size * size; i++) dat[o + i * 4 + 1] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) | 0; }
      if (M.ao) {
        const px = pixels(M.ao.image, size, g), e = M.aoExpr || 'R', c = chanIdx[e] ?? 0;
        for (let i = 0; i < size * size; i++) dat[o + i * 4 + 2] = px[i * 4 + c];
      }
    }
    const mk = (data, srgb) => {
      const t = new THREE.DataArrayTexture(data, size, size, n);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
      return t;
    };
    const out = { albedo: mk(alb, true), normal: mk(nrm, false), data: mk(dat, false), count: n, ids, tile: maps.map((m) => m.tile), index: Object.fromEntries(ids.map((id, i) => [id, i])) };
    return out;
  })();
  cache.set(key, p);
  return p;
}
