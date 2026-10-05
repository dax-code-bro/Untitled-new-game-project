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
//    internals (UUIDs) are reproducible. Scenes must NOT call Math.random in
//    update(); they get ctx.rng (seeded) for setup and ctx.hash()/ctx.makeRng()
//    for per-frame randomness. Calls to Math.random inside update() are detected
//    and reported, because they would make different workers disagree.
//  * Simulation-style scenes can opt into meta.mode = 'chunk-warmup': the
//    runtime calls scene.reset(ctx) at the start of every chunk and then runs
//    update() for every frame from (chunkStart - meta.warmupFrames) in order
//    (meta.warmupFrames = 'all' simulates from frame 0: exact across chunks).

import * as THREE from 'three';
import * as POST from './post.js';

export const RUNTIME_VERSION = '1.0.0';

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
let randomInUpdate = 0;
Math.random = function dkRandom() {
  if (inUpdate) randomInUpdate++;
  return pageRandom();
};

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
 *   toneMapping?: override, exposure?: override, seed?: number
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
  const ctx = {
    THREE, renderer, scene, camera,
    width: W, height: H, renderWidth: RW, renderHeight: RH,
    fps: cfg.fps, preset: cfg.preset, quality: { shadowMapSize: 2048, shadows: true, detail: 1, ...(cfg.quality || {}) },
    meta,
    rng: mulberry32(seed),
    makeRng: (s) => mulberry32((s ^ seed) >>> 0),
    hash,
    post,
    frame: 0, t: 0,
  };
  S.scene = scene; S.camera = camera; S.mod = mod; S.ctx = ctx; S.meta = meta;

  const tSetup = performance.now();
  await mod.setup(ctx);
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
  S.rt.grade = makeRT(RW, RH, { linear: true });
  if (cfg.aa === 'fxaa-hq') S.rt.fxaa = makeRT(RW, RH, { linear: true });
  if (upscale) S.rt.up = makeRT(W, H, { linear: true });
  S.rt.yuv = makeRT(W / 4, H * 3 / 2, { type: THREE.UnsignedByteType });
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
  S.pass.yuv = makePass(POST.makePackYuvMaterial());
  S.pass.yuv.material.uniforms.uSize.value.set(W, H);
  S.pass.rgba = makePass(POST.makePackRgbaMaterial());
  S.pass.rgba.material.uniforms.uSize.value.set(W, H);

  // compile everything up-front so the first frame is not an outlier
  renderer.compile(scene, camera);

  S.info = {
    runtime: RUNTIME_VERSION, three: THREE.REVISION, glRenderer,
    width: W, height: H, renderWidth: RW, renderHeight: RH, samples, aa: cfg.aa, upscale,
    meta: { title: meta.title, duration: meta.duration, mode: meta.mode, warmupFrames: meta.warmupFrames },
    toneMapping: post.toneMapping, shadowFilter, setupMs: Math.round(setupMs), initMs: Math.round(performance.now() - t0),
  };
  return S.info;
}

// ------------------------------------------------------------ rendering --
function stepScene(frame) {
  const { ctx, mod, meta } = S;
  const fps = S.cfg.fps;
  const run = (f) => {
    ctx.frame = f; ctx.t = f / fps;
    inUpdate = true;
    try { mod.update(ctx.t, ctx); } finally { inUpdate = false; }
  };
  if (meta.mode === 'chunk-warmup') {
    if (frame <= S.simFrame) fail(`chunk-warmup scene asked to go back in time (${frame} <= ${S.simFrame}); frames must be rendered in order after reset`);
    while (S.simFrame < frame) run(++S.simFrame);
  } else {
    run(frame);
  }
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
  renderer.autoClear = true;
  renderer.setRenderTarget(rt.scene);
  const tSubmit = timing ? performance.now() : 0;
  renderer.render(S.scene, S.camera);
  if (timing) { timing.submit = performance.now() - tSubmit; timing.calls = renderer.info.render.calls; timing.triangles = renderer.info.render.triangles; }
  lastRT = rt.scene;
  mark('scene');
  renderer.autoClear = false;

  const g = pass.grade.material.uniforms;
  g.tSrc.value = rt.scene.texture;
  g.toneMappingExposure.value = ctx.post.exposure;
  g.uVignette.value = ctx.post.vignette;
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
  let target;
  if (capture === 'rgba') {
    if (!rt.rgba) rt.rgba = makeRT(cfg.width, cfg.height, { type: THREE.UnsignedByteType });
    const u = pass.rgba.material.uniforms;
    u.tSrc.value = src.texture; u.uDither.value = cfg.dither ? 1 : 0;
    drawPass(pass.rgba, rt.rgba);
    target = rt.rgba;
  } else {
    const u = pass.yuv.material.uniforms;
    u.tSrc.value = src.texture; u.uDither.value = cfg.dither ? 1 : 0;
    drawPass(pass.yuv, rt.yuv);
    target = rt.yuv;
  }
  lastRT = target;
  mark('pack');
  renderer.setRenderTarget(target);   // leave the packed target bound for readPixels
  return { target, timing };
}

function captureSize(capture) {
  const { width: W, height: H } = S.cfg;
  return capture === 'rgba' ? { w: W, h: H, bytes: W * H * 4 } : { w: W / 4, h: H * 3 / 2, bytes: W * H * 3 / 2 };
}

function getBuffer(i, bytes) {
  let b = S.bufPool[i];
  if (!b || b.byteLength !== bytes) b = S.bufPool[i] = new Uint8Array(bytes);
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

// Start reading the bound target. Returns a function that resolves to the bytes.
function startReadback(capture, buf, slot) {
  const gl = S.gl;
  const { w, h, bytes } = captureSize(capture);
  if (S.cfg.readback === 'sync') {
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
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
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return buf;
  };
}

/**
 * renderFrames(opts) - render a list of frame indices and POST each frame's
 * bytes to `${opts.postBase}/${frameIndex}` (raw body, no base64).
 * opts = { postBase, frames: [int...], capture: 'yuv'|'rgba', chunkStart?, maxInFlight? }
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
  randomInUpdate = 0;

  if (S.meta.mode === 'chunk-warmup') {
    // warmupFrames: number of frames simulated before the chunk starts, or
    // 'all' = always simulate from frame 0 (exact continuity across chunks)
    const wf = S.meta.warmupFrames === 'all' ? Infinity : (S.meta.warmupFrames | 0);
    const start = Math.max(0, (opts.chunkStart ?? frames[0]) - wf);
    S.mod.reset(S.ctx);
    S.simFrame = start - 1;
  }

  const posts = [];          // in-flight POST promises (FIFO)
  let firstError = null;
  const send = async (frame, buf) => {
    while (posts.length >= maxInFlight) await posts.shift();
    const p = fetch(`${opts.postBase}/${frame}`, {
      method: 'POST', body: buf, headers: { 'content-type': 'application/octet-stream' },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`frame ${frame}: server said ${r.status} ${await r.text()}`);
    });
    p.catch((e) => { firstError = firstError || e; });
    posts.push(p);
  };

  const t0 = performance.now();
  let pending = null;
  const timings = [];
  for (let i = 0; i < frames.length; i++) {
    if (S.contextLost) fail('WebGL context lost');
    if (firstError) throw firstError;
    const f = frames[i];
    const tu = performance.now();
    stepScene(f);
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
  await Promise.all(posts);
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
  return { frames: frames.length, ms: Math.round(ms), msPerFrame: Math.round(ms / Math.max(1, frames.length)), randomInUpdate, breakdown };
}

export function info() { return S.info; }
