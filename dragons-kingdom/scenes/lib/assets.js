// Scene-side access to the downloaded asset library (dragons-kingdom/assets-lib).
//
//   import { loadHDRI, loadPBR, loadModel } from './lib/assets.js';
//
//   const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
//   sky.apply(ctx.scene);                       // environment + background (+ returns the sun light)
//   const turf = await loadPBR('pbr/acg_ground037', ctx, { worldSize: 40 });  // UV 0..1 spans 40 m
//   const cliff = await loadModel('model/babylon_coastal_cliff', ctx);
//   ctx.scene.add(cliff.scene);
//
// Every file goes through three.js loaders (HDRLoader, TextureLoader, GLTFLoader
// with Draco/KTX2/meshopt, OBJLoader) or fetch(), so the runtime's asset-wait
// covers them and the job fingerprint includes exactly the files a scene used.
// An asset must have been downloaded first (node assets-lib/fetch.mjs); its
// <id>/asset.json (written by fetch.mjs) says which maps it has and how they
// are encoded (normal-map convention, packed channels, tile size in metres).
//
// Colour spaces: albedo/base colour maps are sRGB; normal, roughness, AO,
// height, metalness and packed maps are linear data (NoColorSpace); HDRIs are
// linear. Normal maps in DirectX convention get normalScale.y = -1.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** URL of the library root (dragons-kingdom/assets-lib/). */
export const LIB_URL = new URL('../../assets-lib/', import.meta.url).href;
// decoders come from the runtime's own three.js install (served at /three/, same as the import map)
const THREE_LIBS = new URL('/three/examples/jsm/libs/', import.meta.url).href;
export const libUrl = (p) => new URL(p, LIB_URL).href;

const infoCache = new Map();
/** The asset's asset.json (kind, params, files). Throws a readable error if it is not downloaded. */
export function assetInfo(id) {
  if (!infoCache.has(id)) {
    infoCache.set(id, fetch(libUrl(`${id}/asset.json`)).then(async (r) => {
      if (!r.ok) throw new Error(`asset "${id}" is not downloaded (no ${id}/asset.json): run  node assets-lib/fetch.mjs --only ${id}`);
      return r.json();
    }));
  }
  return infoCache.get(id);
}

// ------------------------------------------------------------------ HDRI --
/**
 * Load an equirectangular HDRI.
 * opts.extractSun (default false): find the sun (the brightest pixels), remove
 *   its energy from the HDRI above `sunThreshold` (default 30, in HDRI units) and
 *   return it as `sun` {direction, color, intensity, solidAngle} so a shadowed
 *   DirectionalLight can carry it instead (VFX "sun extraction": sharp shadows,
 *   no double-counted sun). The light gets exactly the removed energy, so total
 *   lighting is unchanged.
 * opts.rotationY (radians): rotates background, environment and sun together.
 * opts.envIntensity / opts.backgroundIntensity / opts.backgroundBlurriness.
 * Returns { texture (equirect, for background), envMap (PMREM), sun, apply(scene, {background, environment, sunLight}) }.
 */
export async function loadHDRI(id, ctx, opts = {}) {
  const info = await assetInfo(id);
  if (info.kind !== 'hdri') throw new Error(`${id} is a ${info.kind}, not an hdri`);
  const file = info.files.find((f) => /\.(hdr|exr)$/i.test(f.path));
  // Half float tops out at 65504 and real suns are brighter (kloofendal: ~7.5e4), so
  // for sun extraction the file is read as 32-bit float, the sun is measured and
  // removed exactly, and only then is the image converted to half float for the GPU.
  const loader = new HDRLoader();
  if (opts.extractSun) loader.setDataType(THREE.FloatType);
  const texture = await loader.loadAsync(libUrl(file.path));   // linear, flipY
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.name = id;

  let sun = null;
  if (opts.extractSun) {
    sun = extractSun(texture, opts.sunThreshold ?? 30);
    const f = texture.image.data, h = new Uint16Array(f.length);
    for (let i = 0; i < f.length; i++) h[i] = THREE.DataUtils.toHalfFloat(f[i]);
    texture.image.data = h;
    texture.type = THREE.HalfFloatType;
    texture.needsUpdate = true;
  }
  if (opts.horizonFill) fillHorizon(texture, opts.horizonFill);
  const rotY = opts.rotationY ?? 0;
  if (sun && rotY) sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);

  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  const envRT = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  const envMap = envRT.texture;

  return {
    id, texture, envMap, sun, info,
    /** Sets scene.environment/background (+ rotation/intensity) and returns a DirectionalLight for the sun (not added to the scene). */
    apply(scene, { background = true, environment = true, sunLight = !!sun } = {}) {
      if (environment) {
        scene.environment = envMap;
        scene.environmentIntensity = opts.envIntensity ?? 1;
        scene.environmentRotation.set(0, rotY, 0);
      }
      if (background) {
        scene.background = texture;
        scene.backgroundIntensity = opts.backgroundIntensity ?? opts.envIntensity ?? 1;
        scene.backgroundBlurriness = opts.backgroundBlurriness ?? 0;
        scene.backgroundRotation.set(0, rotY, 0);
      }
      if (!sunLight || !sun) return null;
      const light = new THREE.DirectionalLight(sun.color, sun.intensity * (opts.envIntensity ?? 1));
      light.name = `${id}:sun`;
      light.position.copy(sun.direction).multiplyScalar(100);
      return light;
    },
  };
}

/**
 * Matte-paint the horizon band of an equirect HDRI: rows between `below` and `above`
 * degrees of elevation take the colour of the sky just above the band (per column), with a
 * smooth blend over `blend` degrees. Removes the photographer's horizon (trees, hills, roofs)
 * where a scene's own sea or land meets the sky. opts: { above: 3, below: -1.5, blend: 1.5 }.
 */
export function fillHorizon(texture, o = {}) {
  const { data, width: W, height: Hh } = texture.image;
  const half = texture.type === THREE.HalfFloatType;
  const get = half ? (i) => THREE.DataUtils.fromHalfFloat(data[i]) : (i) => data[i];
  const set = half ? (i, v) => { data[i] = THREE.DataUtils.toHalfFloat(v); } : (i, v) => { data[i] = v; };
  const stride = data.length / (W * Hh);
  const above = o.above ?? 3, below = o.below ?? -1.5, blend = o.blend ?? 1.5;
  const rowOf = (deg) => Math.round((0.5 - deg / 180) * Hh - 0.5);   // HDRLoader rows run top (+90) to bottom
  // the fill colour: the sky row just above the band, averaged over a wide window per column
  // (a soft horizon haze - copying one row straight down would leave vertical streaks)
  const src = rowOf(above + blend * 0.5);
  const R = Math.max(1, Math.round(W / 48));
  const fill = new Float32Array(W * 3);
  {
    const acc = [0, 0, 0];
    for (let x = -R; x <= R; x++) { const j = (src * W + ((x % W) + W) % W) * stride; for (let c = 0; c < 3; c++) acc[c] += get(j + c); }
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) fill[x * 3 + c] = acc[c] / (2 * R + 1);
      const jo = (src * W + ((x - R) % W + W) % W) * stride, ji = (src * W + (x + R + 1) % W) * stride;
      for (let c = 0; c < 3; c++) acc[c] += get(ji + c) - get(jo + c);
    }
  }
  for (let y = rowOf(above + blend); y <= rowOf(below); y++) {
    if (y < 0 || y >= Hh) continue;
    const deg = (0.5 - (y + 0.5) / Hh) * 180;
    const k = deg > above ? 1 - (deg - above) / blend : deg < below + blend ? (deg - below) / blend : 1;
    const w = Math.min(1, Math.max(0, k));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * stride;
      for (let c = 0; c < 3; c++) set(i + c, get(i + c) * (1 - w) + fill[x * 3 + c] * w);
    }
  }
  texture.needsUpdate = true;
}

/**
 * Finds the sun in an equirect Float or HalfFloat DataTexture, clamps it to
 * `threshold` in place and returns what was removed as a directional light.
 * Direction convention = three.js equirectUv (u = atan(z, x)/2pi + 0.5, v = asin(y)/pi + 0.5);
 * HDRLoader rows run top (v = 1) to bottom.
 */
export function extractSun(texture, threshold = 30) {
  const { data, width: W, height: H } = texture.image;
  const half = texture.type === THREE.HalfFloatType;
  const get = half ? (i) => THREE.DataUtils.fromHalfFloat(data[i]) : (i) => data[i];
  const set = half ? (i, v) => { data[i] = THREE.DataUtils.toHalfFloat(v); } : (i, v) => { data[i] = v; };
  const stride = data.length / (W * H);           // 4 (RGBA)
  // 1) brightest pixel
  let best = -1, bestL = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * stride;
    const L = 0.2126 * get(i) + 0.7152 * get(i + 1) + 0.0722 * get(i + 2);
    if (L > bestL) { bestL = L; best = p; }
  }
  if (bestL <= threshold) return null;            // no sun above threshold (overcast HDRI)
  // 2) integrate everything above the threshold within ~6 degrees of it
  const bx = best % W, by = Math.floor(best / W);
  const r = Math.ceil(6 / 360 * W);
  const dPhi = 2 * Math.PI / W, dTheta = Math.PI / H;
  const sum = new THREE.Vector3(), dirSum = new THREE.Vector3(), d = new THREE.Vector3();
  let omega = 0;
  for (let y = Math.max(0, by - r); y <= Math.min(H - 1, by + r); y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    const dOmega = dPhi * dTheta * Math.cos(lat);
    for (let xx = bx - r; xx <= bx + r; xx++) {
      const x = ((xx % W) + W) % W, i = (y * W + x) * stride;
      const c = [get(i), get(i + 1), get(i + 2)];
      const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      if (L <= threshold) continue;
      const k = threshold / L;                    // clamp keeping the hue
      const removed = c.map((v) => v * (1 - k) * dOmega);
      sum.x += removed[0]; sum.y += removed[1]; sum.z += removed[2];
      const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      d.set(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat));
      dirSum.addScaledVector(d, L * dOmega);
      omega += dOmega;
      for (let ch = 0; ch < 3; ch++) set(i + ch, c[ch] * k);
    }
  }
  texture.needsUpdate = true;
  const intensity = Math.max(sum.x, sum.y, sum.z);
  return {
    direction: dirSum.normalize(),
    color: new THREE.Color(sum.x / intensity, sum.y / intensity, sum.z / intensity),   // linear
    intensity,                                    // irradiance in HDRI units (= DirectionalLight intensity)
    solidAngle: omega,
    peak: bestL,
  };
}

// ------------------------------------------------------------------- PBR --
const texLoader = new THREE.TextureLoader();
const texCache = new Map();     // file -> Promise<Texture>; materials get clones sharing one image
function loadTex(path, colorSpace, o) {
  if (!texCache.has(path)) texCache.set(path, texLoader.loadAsync(libUrl(path)));
  return texCache.get(path).then((base) => {
    const t = base.clone();     // shares base.source: decoded and uploaded once per file and settings
    t.colorSpace = colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(o.repeat[0], o.repeat[1]);
    t.anisotropy = o.anisotropy;
    t.name = path;
    t.needsUpdate = true;
    return t;
  });
}

const CH = { R: 'r', G: 'g', B: 'b', A: 'a' };
/** GLSL for "value of channel spec" where spec is 'R'|'G'|'B'|'A'|'1-A' etc. */
const chan = (texel, spec) => (spec.startsWith('1-') ? `(1.0 - ${texel}.${CH[spec.slice(2)]})` : `${texel}.${CH[spec]}`);

/**
 * Build a MeshStandardMaterial (MeshPhysicalMaterial with opts.physical or
 * opts.sheen) from a PBR set.
 * opts.repeat: number | [x, y]  - texture repeats per UV unit, or
 * opts.worldSize: number | [x, y] - metres covered by UV 0..1 (repeat = worldSize / tile_m)
 * opts.anisotropy (default 16, clamped to the device maximum), opts.aoIntensity (1), opts.normalScale (1),
 * opts.displacementScale (metres; 0 = no displacement, the default: needs dense geometry),
 * opts.color (multiplies albedo, e.g. to grade a texture), opts.roughnessScale (1),
 * opts.sheen ({color, roughness}) for cloth.
 */
export async function loadPBR(id, ctx, opts = {}) {
  const info = await assetInfo(id);
  if (info.kind !== 'pbr') throw new Error(`${id} is a ${info.kind}, not a pbr set`);
  const P = info.params, M = P.maps;
  let repeat = opts.repeat ?? 1;
  if (opts.worldSize != null) {
    const ws = Array.isArray(opts.worldSize) ? opts.worldSize : [opts.worldSize, opts.worldSize];
    const tile = P.tile_m || 1;
    repeat = [ws[0] / tile, ws[1] / tile];
  }
  const o = {
    repeat: Array.isArray(repeat) ? repeat : [repeat, repeat],
    anisotropy: Math.min(opts.anisotropy ?? 16, ctx.renderer.capabilities.getMaxAnisotropy()),
  };
  const lin = THREE.NoColorSpace;
  const [albedo, normal, rough, ao, height, metal, packed] = await Promise.all([
    M.albedo ? loadTex(M.albedo, THREE.SRGBColorSpace, o) : null,
    M.normal ? loadTex(M.normal, lin, o) : null,
    M.roughness ? loadTex(M.roughness, lin, o) : null,
    M.ao ? loadTex(M.ao, lin, o) : null,
    M.height && opts.displacementScale ? loadTex(M.height, lin, o) : null,
    M.metalness ? loadTex(M.metalness, lin, o) : null,
    M.packed ? loadTex(M.packed, lin, o) : null,
  ]);
  const Mat = opts.physical || opts.sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({ name: id, color: opts.color ?? 0xffffff, roughness: opts.roughnessScale ?? 1, metalness: 0 });
  if (albedo) mat.map = albedo;
  if (normal) {
    mat.normalMap = normal;
    const s = opts.normalScale ?? 1;
    mat.normalScale.set(s, P.normal_convention === 'dx' ? -s : s);
  }
  if (rough) mat.roughnessMap = rough;
  if (ao) { mat.aoMap = ao; mat.aoMapIntensity = opts.aoIntensity ?? 1; }
  if (metal) { mat.metalnessMap = metal; mat.metalness = 1; }
  if (height) { mat.displacementMap = height; mat.displacementScale = opts.displacementScale; mat.displacementBias = -opts.displacementScale / 2; }
  if (opts.sheen) {
    mat.sheen = 1;
    mat.sheenColor = new THREE.Color(opts.sheen.color ?? 0xffffff);
    mat.sheenRoughness = opts.sheen.roughness ?? 0.6;
  }

  // packed maps: three reads AO from .r, roughness from .g, metalness from .b
  if (packed) {
    const pc = P.packed_channels || {};
    if (pc.ao) { mat.aoMap = packed; mat.aoMapIntensity = opts.aoIntensity ?? 1; }
    if (pc.roughness) mat.roughnessMap = packed;
    if (pc.metalness) { mat.metalnessMap = packed; mat.metalness = 1; }
    const std = pc.ao === 'R' && (!pc.roughness || pc.roughness === 'G') && (!pc.metalness || pc.metalness === 'B');
    if (!std) {
      const key = `dk-packed:${pc.ao || '-'}:${pc.roughness || '-'}:${pc.metalness || '-'}`;
      const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat);
      mat.onBeforeCompile = (shader, renderer) => {
        if (prev) prev.call(mat, shader, renderer);
        let fs = shader.fragmentShader;
        if (pc.ao) fs = fs.replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv ).r', chan('texture2D( aoMap, vAoMapUv )', pc.ao)));
        if (pc.roughness) fs = fs.replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace('roughnessFactor *= texelRoughness.g;', `roughnessFactor *= ${chan('texelRoughness', pc.roughness)};`));
        if (pc.metalness) fs = fs.replace('#include <metalnessmap_fragment>', THREE.ShaderChunk.metalnessmap_fragment.replace('metalnessFactor *= texelMetalness.b;', `metalnessFactor *= ${chan('texelMetalness', pc.metalness)};`));
        shader.fragmentShader = fs;
      };
      mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|' + key;
    }
  }
  mat.userData.asset = { id, tile_m: P.tile_m, license: info.license, author: info.author };
  return mat;
}

// ---------------------------------------------------------------- models --
let gltfLoader = null;
function getGLTFLoader(renderer) {
  if (!gltfLoader) {
    const draco = new DRACOLoader().setDecoderPath(THREE_LIBS + 'draco/gltf/');
    const ktx2 = new KTX2Loader().setTranscoderPath(THREE_LIBS + 'basis/').detectSupport(renderer);
    gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoader;
}

/**
 * Load a model. Returns { scene: Object3D, animations, gltf, info }.
 * opts.shadows (default true): castShadow/receiveShadow on every mesh.
 * opts.noEmissive: zero emissive on every material (daylight props; "no glow").
 * OBJ files (MakeHuman) are scaled to metres from params.units when it says decimetres;
 * MakeHuman's helper and joint proxy meshes are hidden unless opts.showHelpers.
 * OBJ meshes get welded, smooth normals unless opts.flat.
 */
export async function loadModel(id, ctx, opts = {}) {
  const info = await assetInfo(id);
  if (info.kind !== 'model' && info.kind !== 'human') throw new Error(`${id} is a ${info.kind}, not a model`);
  const entry = libUrl(info.params.entry);
  let root, gltf = null;
  if (/\.obj$/i.test(info.params.entry)) {
    root = await new OBJLoader().loadAsync(entry);
    if (/decimet/i.test(info.params.units || '')) root.scale.setScalar(0.1);
    // OBJLoader builds unindexed triangles, so normals come out faceted: weld by
    // position+uv and recompute smooth normals (opts.flat keeps the facets)
    if (!opts.flat) root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.deleteAttribute('normal');
      o.geometry = mergeVertices(o.geometry, 1e-5);
      o.geometry.computeVertexNormals();
    });
  } else {
    gltf = await getGLTFLoader(ctx.renderer).loadAsync(entry);
    root = gltf.scene;
  }
  root.name = id;
  if (info.params.scale_to_m) root.scale.multiplyScalar(info.params.scale_to_m);
  const shadows = opts.shadows ?? true;
  // Determinism: GLTFLoader creates meshes and materials in the order its async
  // decodes finish, so three's internal ids (the sort's last tie-breakers) differ
  // from run to run and overlapping surfaces (moss on rock) could resolve
  // differently in different browsers. A distinct renderOrder per mesh, in
  // scene-graph order, makes the draw order independent of those ids.
  let nth = 0;
  const baseOrder = opts.renderOrder ?? 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.renderOrder = baseOrder + ++nth * 1e-6;
    // MakeHuman base.obj carries proxy geometry (joint cubes, helper clothes/hair): hidden unless asked for
    if (info.kind === 'human' && !opts.showHelpers && /^(helper|joint)-/.test(o.name)) { o.visible = false; return; }
    o.castShadow = o.receiveShadow = shadows;
    if (opts.noEmissive) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.emissive?.setScalar(0); m.emissiveMap = null; }
  });
  return { scene: root, animations: gltf?.animations ?? [], gltf, info };
}
