// Dragons Kingdom in-page runtime.
//
// Runs inside headless Chromium. Owns the WebGLRenderer, the camera, tone
// mapping, the post chain, deterministic time and the frame transport.
// Scenes only build objects (setup) and pose them for a time t (update).
//
// Determinism contract
// --------------------
//  * Scene state is a pure function of t = frameIndex / fps. There is no
//    requestAnimationFrame and no wall clock anywhere in the render path.
//  * Math.random is replaced by a fixed-seed generator at page load so three.js
//    internals (UUIDs) are reproducible. Scenes must NOT call Math.random,
//    ctx.rng (a stateful generator meant for setup), Date.now or
//    performance.now in update(); they get ctx.hash()/ctx.makeRng() for
//    per-frame randomness. Such calls inside update() are counted and
//    reported, because they would make different workers disagree.
//  * Things three.js caches lazily (bounding spheres used for frustum
//    culling) are refreshed by the runtime whenever the data they were
//    computed from changed, so they never depend on which frame a browser
//    happened to render first (see "culling determinism" below).
//  * init() waits until every asset load started in setup() has finished, so
//    the first frame of every worker sees the same textures/models.
//  * Simulation-style scenes can opt into meta.mode = 'chunk-warmup': the
//    runtime calls scene.reset(ctx) at the start of every chunk and then runs
//    update() for every frame from (chunkStart - meta.warmupFrames) in order
//    (meta.warmupFrames = 'all' simulates from frame 0: exact across chunks).

import * as THREE from 'three';
import * as POST from './post.js';

export const RUNTIME_VERSION = '1.1.0';   // part of every job fingerprint: bump when pictures change

// ------------------------------------------------------------ randomness --
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless hash of any number of integers -> float in [0, 1).
export function hash(...ints) {
  let h = 0x811c9dc5 | 0;
  for (const v of ints) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

const pageRandom = mulberry32(0x5EED1234);
let inUpdate = false;
let updateSerial = 0;            // +1 for every update() call
// non-deterministic calls made inside update(), reported after every chunk
const misuse = { random: 0, rng: 0, clock: 0 };
Math.random = function dkRandom() {
  // three.js uses Math.random only for object UUIDs (generateUUID): creating
  // a helper Object3D/Vector... in update() is harmless for the pictures, so
  // it is not reported (the stack is only looked at inside update())
  if (inUpdate && !/\bgenerateUUID\b/.test(new Error().stack)) misuse.random++;
  return pageRandom();
};
// wall clocks: fine for the runtime's own timing, a bug inside update()
{
  const perfNow = performance.now.bind(performance);
  performance.now = function dkPerfNow() { if (inUpdate) misuse.clock++; return perfNow(); };
  const dateNow = Date.now;
  Date.now = function dkDateNow() { if (inUpdate) misuse.clock++; return dateNow(); };
}

/**
 * A seeded generator that reports being used in update() when it was not
 * created in that same update() call: its state then depends on which frames
 * this browser rendered before (only chunk-warmup scenes may do that, they
 * replay update() from reset() in order).
 */
function guardedRng(seed) {
  const r = mulberry32(seed);
  const born = inUpdate ? updateSerial : -1;
  return function rng() {
    if (inUpdate && born !== updateSerial && S.meta?.mode !== 'chunk-warmup') misuse.rng++;
    return r();
  };
}

// ---------------------------------------------------- pending asset loads --
// Every three.js loader reports to a LoadingManager (itemStart / itemEnd).
// Wrapping every manager - the default one and any a scene creates - lets
// init() wait until all loads started in setup() are done, even the ones the
// scene did not await (new TextureLoader().load(url) returns immediately).
const pendingLoads = new Map();   // url -> count
let pendingFetches = 0;
const trackedManagers = new WeakSet();
function trackManager(m) {
  if (!m || typeof m.itemStart !== 'function' || trackedManagers.has(m)) return m;
  trackedManagers.add(m);
  const start = m.itemStart, end = m.itemEnd;
  m.itemStart = function (url) { pendingLoads.set(url, (pendingLoads.get(url) || 0) + 1); return start.call(this, url); };
  m.itemEnd = function (url) {
    const n = (pendingLoads.get(url) || 0) - 1;
    if (n > 0) pendingLoads.set(url, n); else pendingLoads.delete(url);
    return end.call(this, url);
  };
  return m;
}

trackManager(THREE.DefaultLoadingManager);
// Loader's constructor does "this.manager = manager || DefaultLoadingManager":
// an accessor on the prototype sees every manager any loader is given.
Object.defineProperty(THREE.Loader.prototype, 'manager', {
  configurable: true,
  get() { return this._dkManager; },
  set(m) { this._dkManager = trackManager(m); },
});
// fetch(): the promise resolves when the HEADERS arrive; the body (a 40 MB
// JSON...) can take much longer. So a fetch stays "pending" until its body has
// been read (json/text/arrayBuffer/blob/bytes/formData), or - if the scene
// never reads the body - for FETCH_BODY_GRACE_MS after the headers.
const FETCH_BODY_GRACE_MS = 1000;
const HEADER_HOLD = Symbol('dkHeaderHold');
{
  for (const m of ['arrayBuffer', 'blob', 'bytes', 'formData', 'json', 'text']) {
    const orig = Response.prototype[m];
    if (typeof orig !== 'function') continue;
    Response.prototype[m] = function dkBodyRead(...a) {
      pendingFetches++;
      let done = false;
      const settle = () => { if (!done) { done = true; pendingFetches--; } };
      let p;
      try { p = orig.apply(this, a); } catch (e) { settle(); throw e; }
      p.then(settle, settle);
      this[HEADER_HOLD]?.();          // the body read is counted from here on
      return p;
    };
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = function dkFetch(...args) {
    pendingFetches++;
    let done = false;
    const settle = () => { if (!done) { done = true; pendingFetches--; } };
    return realFetch(...args).then((r) => {
      try { r[HEADER_HOLD] = settle; } catch { settle(); }
      setTimeout(settle, FETCH_BODY_GRACE_MS);
      return r;
    }, (e) => { settle(); throw e; });
  };
}

async function waitForAssets(timeoutMs = 180000) {
  const t0 = performance.now();
  let idle = 0;
  // idle 3 checks in a row: lets onLoad callbacks that start further loads
  // (a model that then loads its textures) register before we give up waiting
  while (idle < 3) {
    await new Promise((r) => setTimeout(r, 20));
    if (pendingLoads.size === 0 && pendingFetches === 0) idle++; else idle = 0;
    if (performance.now() - t0 > timeoutMs) {
      fail(`assets still loading after ${Math.round(timeoutMs / 1000)} s: ${[...pendingLoads.keys()].slice(0, 5).join(', ') || `${pendingFetches} fetch() call(s)`}`);
    }
  }
  return Math.round(performance.now() - t0);
}

// ---------------------------------------------------- culling determinism --
// three.js computes the bounding sphere it uses for frustum culling lazily,
// the first time an object is tested, and never again. If update() moves the
// vertices of a geometry (a waving flag) or the instances of an InstancedMesh
// (a flock), that sphere stays at whatever pose the browser's FIRST rendered
// frame had - so whether the object is drawn at frame N would depend on which
// frame the browser started with (different chunks, resumes, workers).
// The runtime therefore remembers, for every bounding sphere, the version of
// the data it was computed from, and after update() recomputes every sphere
// whose data changed since (unless update() itself just set the sphere).
// SkinnedMesh (bone pose has no version) and BatchedMesh are refreshed every
// frame. Objects with frustumCulled = false are not touched.
const boundsState = new WeakMap();      // geometry | object -> { v, s }
const dataIds = new WeakMap();
let nextDataId = 1;
let frameSerial = 0;
function verOf(a) {
  const d = a.isInterleavedBufferAttribute ? a.data : a;
  let id = dataIds.get(d);
  if (!id) { id = nextDataId++; dataIds.set(d, id); }
  return id + '.' + d.version;
}
function geomVersion(g) {
  const p = g.attributes.position;
  if (!p) return null;
  let v = verOf(p);
  const m = g.morphAttributes && g.morphAttributes.position;
  if (m) for (const a of m) v += ',' + verOf(a);
  return v;
}
function snap(sp) { return sp ? [sp.center.x, sp.center.y, sp.center.z, sp.radius] : null; }
function sameSnap(a, b) {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
function itemVersion(target, isGeom) {
  if (isGeom) return geomVersion(target);
  if (target.isInstancedMesh) {
    // three's InstancedMesh sphere covers only the first .count instances
    const gs = snap(target.geometry.boundingSphere);
    return verOf(target.instanceMatrix) + '|' + target.count + '|' + geomVersion(target.geometry) + '|' + (gs ? gs.join(',') : '-');
  }
  return 'frame' + frameSerial;          // SkinnedMesh / BatchedMesh: always stale
}
function sphereOf(target) { return target.boundingSphere; }
function refreshSphere(target, isGeom) {
  if (isGeom) target.computeBoundingSphere();
  else if (target.isSkinnedMesh) target.boundingSphere = null;   // needs this frame's bone matrices: three recomputes it during render
  else target.computeBoundingSphere();
}
function forEachBounds(fn) {
  S.scene.traverse((o) => {
    if (!o.frustumCulled || !o.geometry || !o.geometry.isBufferGeometry || !o.geometry.attributes.position) return;
    fn(o.geometry, true);
    if (o.boundingSphere !== undefined) fn(o, false);
  });
}
/** Record what every sphere was computed from (after setup / after a render). */
function recordBounds() {
  forEachBounds((target, isGeom) => boundsState.set(target, { v: itemVersion(target, isGeom), s: snap(sphereOf(target)) }));
}
/** After update(): refresh every sphere whose data changed since it was computed. */
function refreshStaleBounds() {
  frameSerial++;
  let refreshed = 0;
  forEachBounds((target, isGeom) => {
    const cur = snap(sphereOf(target));
    const st = boundsState.get(target);
    const v = itemVersion(target, isGeom);
    if (st && !sameSnap(cur, st.s)) { boundsState.set(target, { v, s: cur }); return; }   // update() set it itself
    if (st ? v === st.v : cur === null) return;                                         // up to date / computed lazily from current data
    // stale - or first seen during update() (added to the scene after setup)
    // with a sphere computed from some earlier pose: recompute from this frame's data
    refreshSphere(target, isGeom);
    refreshed++;
    boundsState.set(target, { v: itemVersion(target, isGeom), s: snap(sphereOf(target)) });
  });
  return refreshed;
}

// ----------------------------------------------------------------- state --
const S = {
  cfg: null,
  renderer: null,
  gl: null,
  scene: null,
  camera: null,
  mod: null,
  ctx: null,
  rt: {},
  pass: {},
  bufPool: [],
  pbos: [],
  shadowCaches: new Map(),
  shadow: null,
  simFrame: -1,
  contextLost: false,
  info: null,
};

function fail(msg) { throw new Error('[dk-runtime] ' + msg); }

function makeRT(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: opts.type ?? THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: !!opts.depth,
    stencilBuffer: false,
    samples: opts.samples ?? 0,
    minFilter: opts.linear ? THREE.LinearFilter : THREE.NearestFilter,
    magFilter: opts.linear ? THREE.LinearFilter : THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  return rt;
}

// Soft-shadow filter for the sun (renderer.shadowMap.type = PCFSoftShadowMap).
//  'pcf-soft' : three.js default, 17 depth fetches per pixel
//  'tent9'    : 3x3 texels with tent weights (= four bilinear PCF lookups), 9 fetches  [default]
//  'bilinear4': 2x2 bilinear PCF, 4 fetches (crisper, cheapest)
// Measured at 4K on SwiftShader the 17-tap filter alone costs ~350 ms per frame.
const PCF_SOFT_BEGIN = '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )';
const PCF_SOFT_END = '#elif defined( SHADOWMAP_TYPE_VSM )';
let originalShadowChunk = null;
function patchShadowFilter(mode) {
  const C = THREE.ShaderChunk;
  if (originalShadowChunk === null) originalShadowChunk = C.shadowmap_pars_fragment;
  const src = originalShadowChunk;
  if (mode === 'pcf-soft') { C.shadowmap_pars_fragment = src; return; }
  const a = src.indexOf(PCF_SOFT_BEGIN), b = src.indexOf(PCF_SOFT_END);
  if (a < 0 || b < 0) { console.warn('[dk] could not patch shadow filter (three.js changed?)'); return; }
  const T = (dx, dy, w) => `${w} * texture2DCompare( shadowMap, base + vec2( ${dx}.0, ${dy}.0 ) * texelSize, shadowCoord.z )`;
  let body;
  if (mode === 'bilinear4') {
    body = `
      vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
      vec2 tc = shadowCoord.xy * shadowMapSize - 0.5;
      vec2 g = fract( tc );
      vec2 base = ( floor( tc ) + 0.5 ) * texelSize;
      vec2 wx = vec2( 1.0 - g.x, g.x ), wy = vec2( 1.0 - g.y, g.y );
      shadow = ${T(0, 0, 'wx.x * wy.x')} + ${T(1, 0, 'wx.y * wy.x')} + ${T(0, 1, 'wx.x * wy.y')} + ${T(1, 1, 'wx.y * wy.y')};
    `;
  } else if (mode === 'tent9') {
    const terms = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) terms.push(T(i, j, `w${i}.x * w${j}.y`));
    body = `
      vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
      vec2 tc = shadowCoord.xy * shadowMapSize;
      vec2 g = fract( tc );
      vec2 base = ( floor( tc ) - 0.5 ) * texelSize;     // centre of texel floor(tc) - 1
      vec2 w0 = ( 1.0 - g ) * 0.5, w1 = vec2( 0.5 ), w2 = g * 0.5;
      shadow = ${terms.join(' +\n        ')};
    `;
  } else throw new Error(`unknown shadowFilter "${mode}"`);
  C.shadowmap_pars_fragment = src.slice(0, a) + PCF_SOFT_BEGIN + '\n' + body + '\n' + src.slice(b);
}

function makePass(material) {
  const mesh = new THREE.Mesh(S.fsGeom, material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * init(cfg) - create renderer, load + set up the scene, build the post chain.
 * cfg = {
 *   sceneUrl, width, height,             // output size
 *   renderWidth, renderHeight,           // internal render size (== output unless upscaling)
 *   fps, preset, quality: {...},
 *   aa: 'none'|'fxaa'|'fxaa-hq'|'msaa2'|'msaa4'|'msaa8',
 *   dither: true, sharpness: 0.5, readback: 'async'|'sync', maxInFlight: 3,
 *   bitDepth: 8|10 (output; 8 lets final-fast keep its graded image in dithered 8 bit),
 *   toneMapping?: override, exposure?: override, seed?: number,
 *   assetTimeoutMs?: 180000, shadowCache?: true (false: ignore ctx.shadows.key, redraw every frame)
 * }
 */
export async function init(cfg) {
  const t0 = performance.now();
  S.cfg = cfg = { aa: 'none', dither: true, sharpness: 0.5, readback: 'async', maxInFlight: 3, ...cfg };
  const W = cfg.width, H = cfg.height, RW = cfg.renderWidth ?? W, RH = cfg.renderHeight ?? H;
  if (W % 8 || H % 4) fail(`output size ${W}x${H}: width must be a multiple of 8 and height of 4 (yuv420p packing)`);

  const canvas = document.createElement('canvas');
  canvas.width = RW; canvas.height = RH;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.contextLost = true; console.error('[dk] WebGL context lost'); });
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(RW, RH, false);
  renderer.toneMapping = THREE.NoToneMapping;          // tone mapping happens in our grade pass
  renderer.outputColorSpace = THREE.SRGBColorSpace;     // unused (we never draw to the canvas)
  renderer.shadowMap.enabled = cfg.quality?.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.debug.checkShaderErrors = true;
  installShadowCache(renderer);
  const gl = renderer.getContext();
  S.renderer = renderer; S.gl = gl;

  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (Math.max(W, H, RW, RH) > Math.min(maxRb, maxTex)) fail(`GPU limit ${Math.min(maxRb, maxTex)} < requested size`);
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) fail('half-float render targets not supported');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const glRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  // ---- scene module
  const mod = await import(cfg.sceneUrl);
  if (typeof mod.setup !== 'function' || typeof mod.update !== 'function') fail('scene must export setup(ctx) and update(t, ctx)');
  const meta = { title: 'Untitled', duration: 10, mode: 'pure', warmupFrames: 0, ...(mod.meta || {}) };
  if (meta.mode === 'chunk-warmup' && typeof mod.reset !== 'function') fail("meta.mode 'chunk-warmup' requires export function reset(ctx)");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 20000);
  const seed = (cfg.seed ?? meta.seed ?? 1) >>> 0;
  const post = {
    toneMapping: cfg.toneMapping ?? meta.toneMapping ?? 'aces',
    exposure: cfg.exposure ?? meta.exposure ?? 1.0,
    vignette: meta.vignette ?? 0.0,
  };
  // ctx.rng is one stable function whose generator restarts at every reset()
  // of a chunk-warmup scene (so simulations may use it and stay reproducible)
  let rngImpl = guardedRng(seed);
  const ctx = {
    THREE, renderer, scene, camera,
    width: W, height: H, renderWidth: RW, renderHeight: RH,
    fps: cfg.fps, preset: cfg.preset, quality: { shadowMapSize: 2048, shadows: true, detail: 1, ...(cfg.quality || {}) },
    meta,
    rng: () => rngImpl(),
    makeRng: (s) => guardedRng((s ^ seed) >>> 0),
    hash,
    post,
    // Shadow-map cache, see installShadowCache(). key null (default): every
    // shadow map is re-rendered every frame. key set: the maps of everything
    // NOT listed in `dynamic` are rendered once per key value and reused;
    // only the `dynamic` objects (and their children) are drawn every frame.
    shadows: { key: null, dynamic: [] },
    frame: 0, t: 0,
  };
  S.resetRng = () => { rngImpl = guardedRng(seed); };
  S.scene = scene; S.camera = camera; S.mod = mod; S.ctx = ctx; S.meta = meta;

  const tSetup = performance.now();
  await mod.setup(ctx);
  // loads the scene started but did not await (TextureLoader().load(url), ...)
  const assetWaitMs = await waitForAssets(cfg.assetTimeoutMs);
  const setupMs = performance.now() - tSetup;
  // shader chunks are only read when programs compile (below / first frame),
  // so the filter can still be chosen here: CLI > scene meta > default
  const shadowFilter = cfg.quality?.shadowFilter ?? meta.shadowFilter ?? 'tent9';
  patchShadowFilter(shadowFilter);
  if (!POST.TONE_MAPPINGS.includes(post.toneMapping)) fail(`toneMapping "${post.toneMapping}" not one of ${POST.TONE_MAPPINGS}`);

  // ---- render targets
  const msaa = /^msaa(\d+)$/.exec(cfg.aa);
  const samples = msaa ? Math.min(+msaa[1], gl.getParameter(gl.MAX_SAMPLES)) : 0;
  const upscale = RW !== W || RH !== H;
  const fusedAA = cfg.aa === 'fxaa';
  S.rt.scene = makeRT(RW, RH, { depth: true, samples, linear: fusedAA });
  // final-fast (upscaling) with 8-bit output: the graded image the upscaler
  // reads is stored as dithered 8-bit instead of half-float. On SwiftShader a
  // filtered half-float fetch costs far more than an 8-bit one: the upscale
  // pass drops from ~400 to ~245 ms per 4K frame (~11% of a final-fast frame).
  // The +-0.5 code dither written into it keeps smooth skies free of banding
  // (measured on clean 4K gradients: 16x16-block error 0.019 vs 0.013 code
  // values for half-float, 0.07 without that dither; slightly more grain:
  // rms 0.47 vs 0.41). 10-bit output keeps the half-float path.
  const grade8 = upscale && (cfg.bitDepth ?? 8) === 8;
  S.grade8 = grade8;
  S.rt.grade = makeRT(RW, RH, { linear: true, type: grade8 ? THREE.UnsignedByteType : undefined });
  if (cfg.aa === 'fxaa-hq') S.rt.fxaa = makeRT(RW, RH, { linear: true });
  if (upscale) S.rt.up = makeRT(W, H, { linear: true });
  S.rt.yuv = makeRT(W / 4, H * 3 / 2, { type: THREE.UnsignedByteType });
  S.rt.yuv10 = null; // created on first use
  S.rt.rgba = null; // created on first use

  // ---- passes
  S.fsGeom = POST.makeFullscreenGeometry();
  S.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  S.pass.grade = makePass(fusedAA ? POST.makeGradeFxaaMaterial(post.toneMapping) : POST.makeGradeMaterial(post.toneMapping));
  S.pass.grade.material.uniforms.uInvSize.value.set(1 / RW, 1 / RH);
  if (cfg.aa === 'fxaa-hq') {
    S.pass.fxaa = makePass(POST.makeFxaaMaterial());
    S.pass.fxaa.material.uniforms.resolution.value.set(1 / RW, 1 / RH);
  }
  if (upscale) {
    S.pass.up = makePass(POST.makeUpscaleMaterial());
    const u = S.pass.up.material.uniforms;
    u.uSrcSize.value.set(RW, RH); u.uDstSize.value.set(W, H); u.uSharpness.value = cfg.sharpness;
  }
  S.pass.yuv = makePass(POST.makePackYuvMaterial(8));
  S.pass.yuv.material.uniforms.uSize.value.set(W, H);
  S.pass.yuv10 = makePass(POST.makePackYuvMaterial(10));
  S.pass.yuv10.material.uniforms.uSize.value.set(W, H);
  S.pass.rgba = makePass(POST.makePackRgbaMaterial());
  S.pass.rgba.material.uniforms.uSize.value.set(W, H);

  // compile everything and upload every texture up-front so the first frame
  // is not an outlier
  renderer.compile(scene, camera);
  const seenTex = new Set();
  const upload = (v) => { if (v && v.isTexture && !seenTex.has(v)) { seenTex.add(v); renderer.initTexture(v); } };
  upload(scene.background); upload(scene.environment);
  scene.traverse((o) => {
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const v of Object.values(m)) upload(v);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) upload(u && u.value);
    }
  });
  // baseline for the culling-determinism guard: what every bounding sphere
  // was computed from at the end of setup (identical in every browser)
  recordBounds();

  S.info = {
    runtime: RUNTIME_VERSION, three: THREE.REVISION, glRenderer,
    width: W, height: H, renderWidth: RW, renderHeight: RH, samples, aa: cfg.aa, upscale,
    meta: { title: meta.title, duration: meta.duration, mode: meta.mode, warmupFrames: meta.warmupFrames },
    toneMapping: post.toneMapping, shadowFilter, setupMs: Math.round(setupMs), assetWaitMs, textures: seenTex.size,
    initMs: Math.round(performance.now() - t0),
  };
  return S.info;
}

// ------------------------------------------------------------ rendering --
// A long chunk-warmup replay (warmupFrames 'all' late in an episode can be
// tens of thousands of update() calls) reports that it is alive every
// HEARTBEAT_MS through heartbeat(done, total), so the job's stall watchdog
// does not take it for a hang. It also yields to the event loop then (the
// scene's state does not depend on that, only on the order of update() calls).
const HEARTBEAT_MS = 1000;
async function stepScene(frame, heartbeat) {
  const { ctx, mod, meta } = S;
  const fps = S.cfg.fps;
  const run = (f) => {
    ctx.frame = f; ctx.t = f / fps;
    updateSerial++;
    inUpdate = true;
    try { mod.update(ctx.t, ctx); } finally { inUpdate = false; }
  };
  if (meta.mode === 'chunk-warmup') {
    if (frame <= S.simFrame) fail(`chunk-warmup scene asked to go back in time (${frame} <= ${S.simFrame}); frames must be rendered in order after reset`);
    const from = S.simFrame;
    let last = performance.now();
    while (S.simFrame < frame) {
      run(++S.simFrame);
      if (heartbeat && performance.now() - last > HEARTBEAT_MS) {
        heartbeat(S.simFrame - from, frame - from);
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
  } else {
    run(frame);
  }
  // after update(): culling bounds must match this frame's data (see above)
  refreshStaleBounds();
}

// ------------------------------------------------------------ shadow cache --
// Re-rendering the 4096x4096 sun shadow map every frame redraws every tree and
// wall although usually only characters move (~105 ms per frame in the test
// scene). A scene can declare:
//
//   ctx.shadows.key = 'castle-day'           // any value; change it when the static set or a light changes
//   ctx.shadows.dynamic = [dragon.root, flag] // things that move and cast shadows
//
// Then the shadow maps of everything else ("static casters") are rendered once
// per key and cached (colour = packed depth, and the depth buffer). Every
// frame the cache is copied back with one GPU blit and only the dynamic
// objects are drawn on top, depth-tested. A depth-tested draw keeps the
// nearest surface no matter in which order things are drawn, so the result is
// bit-identical to drawing everything every frame (checked by npm test).
// Contract: for equal keys the static casters and the shadow-casting lights
// must be identical. With dynamic = [] nothing is redrawn while the key stays.
const DYN_LAYER = 31;
/** Copy colour + depth of rect r ({x0,y0,x1,y1} in texels, null = all) from src to dst. */
function blitRT(src, dst, r = null) {
  const { renderer, gl } = S;
  if (r && (r.x1 <= r.x0 || r.y1 <= r.y0)) return;
  const sp = renderer.properties.get(src), dp = renderer.properties.get(dst);
  const { x0, y0, x1, y1 } = r || { x0: 0, y0: 0, x1: src.width, y1: src.height };
  renderer.state.setScissorTest(false);
  renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, sp.__webglFramebuffer);
  renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dp.__webglFramebuffer);
  gl.blitFramebuffer(x0, y0, x1, y1, x0, y0, x1, y1, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
}
// World-space bounding spheres of everything the dynamic objects draw into
// shadow maps. They decide which texels are restored from the cache, so they
// must never be too small: each is computed fresh from THIS frame's data
// (vertices, instance matrices, instance count, bones - the cached spheres may
// be stale, e.g. for frustumCulled = false objects) and merged with the cached
// one (which may be bigger on purpose, e.g. for vertex-shader displacement).
// The cached spheres themselves are left untouched.
const _sph = new THREE.Sphere(), _bv = new THREE.Vector3();
function freshSphere(o) {
  const g = o.geometry;
  const oldG = g.boundingSphere, oldO = o.boundingSphere;
  let fresh;
  try {
    g.boundingSphere = null;
    g.computeBoundingSphere();
    if (oldO !== undefined) { o.boundingSphere = null; o.computeBoundingSphere(); fresh = o.boundingSphere; }
    else fresh = g.boundingSphere;
  } finally {
    g.boundingSphere = oldG;
    if (oldO !== undefined) o.boundingSphere = oldO;
  }
  const cached = oldO !== undefined ? oldO : oldG;
  const sp = fresh.clone();
  if (cached && !cached.isEmpty()) sp.union(cached);
  return sp;
}
function dynamicSpheres(dynamic) {
  const out = [];
  for (const root of dynamic) {
    root.traverseVisible((o) => {
      if (!o.castShadow || !(o.isMesh || o.isLine || o.isPoints) || !o.geometry || !o.geometry.attributes.position) return;
      const sp = freshSphere(o);
      if (!sp.isEmpty()) out.push(sp.applyMatrix4(o.matrixWorld));   // empty: e.g. an InstancedMesh with count 0
    });
  }
  return out;
}
/**
 * Texel rectangle of a light's shadow map that the dynamic objects can write
 * to (conservative: the projected bounding boxes of their bounding spheres,
 * +2 texels). null = unknown/large -> the whole map is restored.
 */
function shadowRect(light, spheres) {
  if (!(light.isDirectionalLight || light.isSpotLight)) return null;
  const sh = light.shadow, ext = sh.getFrameExtents();
  const W = sh.mapSize.x * ext.x, H = sh.mapSize.y * ext.y;   // = map size (the map itself may not exist yet)
  sh.updateMatrices(light);
  const e = sh.matrix.elements;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of spheres) {
    for (let i = 0; i < 8; i++) {
      _bv.set(s.center.x + (i & 1 ? s.radius : -s.radius), s.center.y + (i & 2 ? s.radius : -s.radius), s.center.z + (i & 4 ? s.radius : -s.radius));
      const w = e[3] * _bv.x + e[7] * _bv.y + e[11] * _bv.z + e[15];
      if (!(w > 1e-6)) return null;            // behind a spot light: give up, restore everything
      _bv.applyMatrix4(sh.matrix);
      x0 = Math.min(x0, _bv.x); y0 = Math.min(y0, _bv.y); x1 = Math.max(x1, _bv.x); y1 = Math.max(y1, _bv.y);
    }
  }
  if (!spheres.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const r = {
    x0: Math.max(0, Math.floor(x0 * W) - 2), y0: Math.max(0, Math.floor(y0 * H) - 2),
    x1: Math.min(W, Math.ceil(x1 * W) + 2), y1: Math.min(H, Math.ceil(y1 * H) + 2),
  };
  if (r.x1 <= r.x0 || r.y1 <= r.y0) return { x0: 0, y0: 0, x1: 0, y1: 0 };   // entirely outside the map
  if ((r.x1 - r.x0) * (r.y1 - r.y0) > 0.5 * W * H) return null;
  return r;
}
const unionRect = (a, b) => (!a || !b ? null
  : a.x1 <= a.x0 || a.y1 <= a.y0 ? b : b.x1 <= b.x0 || b.y1 <= b.y0 ? a
    : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
function shadowCacheFor(light) {
  const map = light.shadow.map;
  let c = S.shadowCaches.get(light);
  if (!c || c.width !== map.width || c.height !== map.height) {
    c?.dispose();
    c = new THREE.WebGLRenderTarget(map.width, map.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    S.renderer.initRenderTarget(c);
    S.shadowCaches.set(light, c);
  }
  return c;
}
/** Called before the scene render: what should the shadow pass do this frame? */
function planShadows() {
  const sh = S.ctx.shadows;
  const key = sh && S.cfg.shadowCache !== false ? sh.key ?? null : null;
  if (key === null) { S.shadowPlan = null; S.shadow = null; return; }
  const dynamic = (Array.isArray(sh.dynamic) ? sh.dynamic : []).filter(Boolean);
  for (const root of dynamic) root.traverse((o) => o.layers.enable(DYN_LAYER));
  S.shadowPlan = { key, dynamic };
}
/**
 * Replaces renderer.shadowMap.render. three calls it inside render(), after
 * culling and before drawing (the only place a shadow pass can run).
 */
function installShadowCache(renderer) {
  const sm = renderer.shadowMap;
  const threeRender = sm.render;
  const run = (lights, scene, camera, needsUpdate) => {
    const auto = sm.autoUpdate;
    sm.autoUpdate = false; sm.needsUpdate = needsUpdate;
    try { threeRender.call(sm, lights, scene, camera); } finally { sm.autoUpdate = auto; sm.needsUpdate = false; }
  };
  sm.render = function dkShadowRender(lights, scene, camera) {
    const plan = S.shadowPlan;
    if (!plan || scene !== S.scene || !lights.length || !sm.enabled) return threeRender.call(sm, lights, scene, camera);
    const prev = S.shadow;
    const sameLights = prev && prev.lights.length === lights.length && prev.lights.every((l, i) => l === lights[i]);
    const valid = sameLights && prev.key === plan.key;
    if (!plan.dynamic.length || sm.type === THREE.VSMShadowMap) {
      // nothing that casts a shadow moves (or VSM, whose blur cannot be split): once per key
      if (!valid || prev.split) { run(lights, scene, camera, true); S.shadow = { key: plan.key, split: false, lights: [...lights], rects: new Map() }; }
      return;
    }
    const spheres = dynamicSpheres(plan.dynamic);
    const rects = new Map(lights.map((l) => [l, shadowRect(l, spheres)]));
    if (!valid || !prev.split) {
      // 1. the static casters only, then keep a copy of every map (colour + depth)
      const vis = plan.dynamic.map((o) => o.visible);
      plan.dynamic.forEach((o) => { o.visible = false; });
      try { run(lights, scene, camera, true); } finally { plan.dynamic.forEach((o, i) => { o.visible = vis[i]; }); }
      for (const l of lights) blitRT(l.shadow.map, shadowCacheFor(l));
    } else {
      // undo last frame's dynamic casters and clear the space for this frame's:
      // copy back only the texels either of them can touch (a full 4096x4096
      // colour + depth copy costs ~250 ms on SwiftShader, more than it saves)
      for (const l of lights) blitRT(shadowCacheFor(l), l.shadow.map, unionRect(prev.rects.get(l), rects.get(l)));
    }
    S.shadow = { key: plan.key, split: true, lights: [...lights], rects };
    // 2. the dynamic casters on top of it: no clear, depth-tested against the
    //    static depth. A proxy camera that only "sees" DYN_LAYER selects them.
    if (!S.dynCam) S.dynCam = camera.clone();
    S.dynCam.copy(camera, false);
    S.dynCam.layers.set(DYN_LAYER);
    const clear = renderer.clear;
    renderer.clear = () => {};
    try { run(lights, scene, S.dynCam, true); } finally { renderer.clear = clear; }
  };
}

function drawPass(mesh, target) {
  S.renderer.setRenderTarget(target);
  S.renderer.render(mesh, S.postCam);
}

function renderPipeline(capture) {
  const { renderer, rt, pass, ctx, cfg } = S;
  const timing = cfg.timing ? {} : null;
  // timing mode: a 1-pixel readback forces the GPU to finish the stage (gl.finish() does not block in Chrome)
  const px = new Uint16Array(4), px8 = new Uint8Array(4);
  let lastRT = null;
  const mark = timing ? (k) => {
    if (lastRT) renderer.readRenderTargetPixels(lastRT, 0, 0, 1, 1, lastRT.texture.type === THREE.UnsignedByteType ? px8 : px);
    timing[k] = performance.now();
  } : () => {};
  mark('start');
  planShadows();
  renderer.autoClear = true;
  renderer.setRenderTarget(rt.scene);
  const tSubmit = timing ? performance.now() : 0;
  try { renderer.render(S.scene, S.camera); } finally { S.shadowPlan = null; }
  if (timing) { timing.submit = performance.now() - tSubmit; timing.calls = renderer.info.render.calls; timing.triangles = renderer.info.render.triangles; }
  // remember what the (lazily computed) bounding spheres were computed from
  recordBounds();
  lastRT = rt.scene;
  mark('scene');
  renderer.autoClear = false;

  const g = pass.grade.material.uniforms;
  g.tSrc.value = rt.scene.texture;
  g.toneMappingExposure.value = ctx.post.exposure;
  g.uVignette.value = ctx.post.vignette;
  g.uDither8.value = S.grade8 && cfg.dither ? 1 : 0;
  drawPass(pass.grade, rt.grade);
  let src = rt.grade;
  if (pass.fxaa) {
    pass.fxaa.material.uniforms.tDiffuse.value = src.texture;
    drawPass(pass.fxaa, rt.fxaa);
    src = rt.fxaa;
  }
  lastRT = src;
  mark('grade');
  if (pass.up) {
    pass.up.material.uniforms.tSrc.value = src.texture;
    drawPass(pass.up, rt.up);
    src = rt.up;
    lastRT = src;
    mark('upscale');
  }
  const { w, h } = captureSize(capture);
  let target, packer;
  if (capture === 'rgba') {
    if (!rt.rgba) rt.rgba = makeRT(w, h, { type: THREE.UnsignedByteType });
    target = rt.rgba; packer = pass.rgba;
  } else if (capture === 'yuv10') {
    if (!rt.yuv10) rt.yuv10 = makeRT(w, h, { type: THREE.UnsignedByteType });
    target = rt.yuv10; packer = pass.yuv10;
  } else {
    target = rt.yuv; packer = pass.yuv;
  }
  const u = packer.material.uniforms;
  u.tSrc.value = src.texture; u.uDither.value = cfg.dither ? 1 : 0;
  drawPass(packer, target);
  lastRT = target;
  mark('pack');
  renderer.setRenderTarget(target);   // leave the packed target bound for readPixels
  return { target, timing };
}

export const CAPTURES = ['yuv', 'yuv10', 'rgba'];
/** Size of the packed target (RGBA8 texels) and of one raw frame in bytes. */
function captureSize(capture) {
  const { width: W, height: H } = S.cfg;
  if (capture === 'rgba') return { w: W, h: H, bytes: W * H * 4 };          // rgba
  if (capture === 'yuv10') return { w: W / 2, h: H * 3 / 2, bytes: W * H * 3 };   // yuv420p10le
  if (capture === 'yuv') return { w: W / 4, h: H * 3 / 2, bytes: W * H * 3 / 2 }; // yuv420p
  fail(`unknown capture "${capture}" (${CAPTURES.join(', ')})`);
}

// Frame buffers carry a 4-byte header (frame index, little endian) in front
// of the pixels, so a frame goes out as ONE WebSocket message without copying.
const HEADER = 4;
function getBuffer(i, bytes) {
  let b = S.bufPool[i];
  if (!b || b.byteLength !== bytes + HEADER) b = S.bufPool[i] = new Uint8Array(bytes + HEADER);
  return b;
}

function waitSync(sync) {
  const gl = S.gl;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (S.contextLost) return reject(new Error('WebGL context lost'));
      const r = gl.clientWaitSync(sync, 0, 0);
      if (r === gl.WAIT_FAILED) return reject(new Error('clientWaitSync failed'));
      if (r === gl.TIMEOUT_EXPIRED) return setTimeout(poll, 2);
      resolve();
    };
    poll();
  });
}

// Start reading the bound target into buf (after its header). Returns a
// function that resolves to buf once the pixels are there.
function startReadback(capture, buf, slot) {
  const gl = S.gl;
  const { w, h, bytes } = captureSize(capture);
  const pixels = buf.subarray(HEADER);
  if (S.cfg.readback === 'sync') {
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return async () => buf;
  }
  // async: readPixels into a pixel-pack buffer, fence, and only copy to the
  // CPU once the GPU has finished. Meanwhile JS can already queue the next frame.
  let pbo = S.pbos[slot];
  if (!pbo || pbo.bytes !== bytes) {
    if (pbo) gl.deleteBuffer(pbo.buf);
    pbo = S.pbos[slot] = { buf: gl.createBuffer(), bytes };
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
  } else {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.buf);
  }
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return async () => {
    await waitSync(sync);
    gl.deleteSync(sync);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return buf;
  };
}

/**
 * Frame transport: one binary WebSocket per renderFrames() call. Each message
 * is [uint32 LE frame index][raw frame bytes]; the server answers every frame
 * with a small JSON ack {"f": n} (or {"f": n, "e": "error"}) once the bytes
 * went into ffmpeg's stdin - that is the backpressure.
 * Why not fetch(POST)? Under Playwright the DevTools network domain is on, and
 * Chrome then base64-copies every POST body into a DevTools event that
 * Playwright decodes and keeps (last 100 requests per page): ~0.7 CPU-seconds
 * and ~1 GB of RAM per worker for 4K frames. WebSocket messages are not kept.
 */
function openFrameSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const waiting = new Map();          // frame -> { resolve, reject }
    let closedError = null;
    const failAll = (e) => {
      closedError = closedError || e;
      for (const w of waiting.values()) w.reject(closedError);
      waiting.clear();
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      const w = waiting.get(m.f);
      if (!w) return;
      waiting.delete(m.f);
      if (m.e) w.reject(new Error(`frame ${m.f}: server said: ${m.e}`)); else w.resolve();
    };
    ws.onerror = () => {};              // details arrive with onclose
    ws.onclose = (ev) => {
      const e = new Error(`frame connection closed (${ev.code}${ev.reason ? ' ' + ev.reason : ''})`);
      failAll(e);
      reject(e);                        // no-op once open
    };
    ws.onopen = () => resolve({
      /** send buf (header + pixels); resolves when the server accepted the frame */
      send(frame, buf) {
        if (closedError) return Promise.reject(closedError);
        new DataView(buf.buffer, buf.byteOffset, HEADER).setUint32(0, frame, true);
        const p = new Promise((res, rej) => waiting.set(frame, { resolve: res, reject: rej }));
        ws.send(buf);                   // the browser copies the bytes: buf may be reused right away
        return p;
      },
      /** small "still alive" message (chunk-warmup replay), no ack */
      heartbeat(done, total) { if (!closedError) { try { ws.send(JSON.stringify({ hb: done, of: total })); } catch {} } },
      close() { try { ws.close(1000, 'done'); } catch {} },
    });
  });
}

/**
 * renderFrames(opts) - render a list of frame indices and send each frame's
 * bytes to the sink at opts.sinkUrl (ws://.../ws/<sink>), raw, no base64.
 * opts = { sinkUrl, frames: [int...], capture: 'yuv'|'yuv10'|'rgba', chunkStart?, maxInFlight? }
 * Resolves once every frame has been accepted by the server (which only
 * answers after the bytes went into ffmpeg's stdin = backpressure).
 */
export async function renderFrames(opts) {
  if (!S.renderer) fail('init() first');
  const capture = opts.capture || 'yuv';
  const frames = opts.frames;
  const maxInFlight = Math.max(1, opts.maxInFlight ?? S.cfg.maxInFlight);
  const { bytes } = captureSize(capture);
  const poolSize = maxInFlight + 2;
  misuse.random = misuse.rng = misuse.clock = 0;

  if (S.meta.mode === 'chunk-warmup') {
    // warmupFrames: number of frames simulated before the chunk starts, or
    // 'all' = always simulate from frame 0 (exact continuity across chunks).
    // The first frame to render can lie before chunkStart (--twos with an odd
    // start renders the even frame just before it), so start from the earlier.
    const wf = S.meta.warmupFrames === 'all' ? Infinity : (S.meta.warmupFrames | 0);
    const first = Math.min(opts.chunkStart ?? frames[0], frames[0]);
    const start = Math.max(0, first - wf);
    S.resetRng();
    S.mod.reset(S.ctx);
    S.simFrame = start - 1;
  }

  const sock = await openFrameSocket(opts.sinkUrl);
  const posts = [];          // in-flight frames (FIFO of ack promises)
  let firstError = null;
  const send = async (frame, buf) => {
    while (posts.length >= maxInFlight) await posts.shift().catch(() => {});
    if (firstError) throw firstError;
    const p = sock.send(frame, buf);
    p.catch((e) => { firstError = firstError || e; });
    posts.push(p);
  };

  try {
    const t0 = performance.now();
    let pending = null;
    const timings = [];
    for (let i = 0; i < frames.length; i++) {
      if (S.contextLost) fail('WebGL context lost');
      if (firstError) throw firstError;
      const f = frames[i];
      const tu = performance.now();
      await stepScene(f, sock.heartbeat);
      const tu1 = performance.now();
      const { timing } = renderPipeline(capture);
      const read = startReadback(capture, getBuffer(i % poolSize, bytes), i % 2);
      const tr0 = performance.now();
      let tr1 = tr0, ts1 = tr0;
      if (pending) { const buf = await pending.read(); tr1 = performance.now(); await send(pending.f, buf); ts1 = performance.now(); }
      if (timing) { timing.update = tu1 - tu; timing.readWait = tr1 - tr0; timing.sendWait = ts1 - tr1; timing.total = performance.now() - tu; timings.push(timing); }
      pending = { f, read };
    }
    if (pending) await send(pending.f, await pending.read());
    await Promise.allSettled(posts);
    if (firstError) throw firstError;
    const ms = performance.now() - t0;

    let breakdown = null;
    if (timings.length) {
      breakdown = {};
      for (const tm of timings) {
        let prev = tm.start;
        for (const [k, v] of Object.entries(tm)) {
          if (k === 'start') continue;
          if (['update', 'readWait', 'sendWait', 'submit', 'calls', 'triangles', 'total'].includes(k)) { breakdown[k] = (breakdown[k] || 0) + v / timings.length; continue; }
          breakdown[k] = (breakdown[k] || 0) + (v - prev) / timings.length; prev = v;
        }
      }
      for (const k in breakdown) breakdown[k] = Math.round(breakdown[k]);
    }
    return {
      frames: frames.length, ms: Math.round(ms), msPerFrame: Math.round(ms / Math.max(1, frames.length)),
      randomInUpdate: misuse.random, rngInUpdate: misuse.rng, clockInUpdate: misuse.clock, breakdown,
    };
  } finally {
    sock.close();
  }
}

export function info() { return S.info; }
