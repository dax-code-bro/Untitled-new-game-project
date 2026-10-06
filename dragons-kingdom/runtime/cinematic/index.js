// Cinematic realism stack - orchestration (opt-in, see config.js and README).
//
// Per frame (velocity motion blur):
//   update(t - T/2) -> remember poses           (T = shutter time from ctx.lens.shutterAngle)
//   update(t)
//   [depth pre-pass -> GTAO + contact shadows]   (ao.js: feeds the materials' indirect light)
//   [cascaded sun shadows fitted to the camera]  (shadows.js)
//   [sky / aerial-perspective LUTs, froxel fog]  (atmosphere.js, volumetrics.js)
//   main scene -> RGBA32F + depth texture
//   [late objects (ocean) with scene colour/depth copies]
//   moving objects -> motion vectors
//   resolve: aerial perspective + volumetric fog, per-pixel velocity (camera + objects)
//   motion blur reconstruction (+ FXAA where nothing moves)
//   depth of field (half-res gather, bilateral composite)
//   bloom pyramid
//   final: exposure, white balance, vignette, sensor grain, tone map / LUT, grade, CA, distortion
//   -> the standard YUV packer (8 or 10 bit) / RGBA readback
// Accumulate mode replaces the motion blur by N real sub-frames across the
// shutter interval (sub-pixel jitter = supersampling, sun jitter = soft shadows).
import * as THREE from 'three';
import { resolveCinematic, cinematicFor, validateCinematic, CINEMATIC_DEFAULTS } from './config.js';
import * as P from './passes.js';
import { VelocityTracker } from './velocity.js';
import { MaterialPatcher } from './materials.js';
import { AmbientOcclusion } from './ao.js';
import { CascadedShadows } from './shadows.js';
import { Atmosphere } from './atmosphere.js';
import { Volumetrics, makeCloudTexture } from './volumetrics.js';
import { EnvBake } from './envbake.js';
import { sensorSize, focalLengthFromFov, cocScale, exposureMultiplier, exposureTime, LENS_DEFAULTS } from '../lib/camera.js';
import { parseCube } from '../lib/lut.js';
import { bakeGradeLut, LUT_SIZE, SHAPER_MIN_EV, SHAPER_MAX_EV } from './colorlut.js';

export { resolveCinematic, cinematicFor, CINEMATIC_DEFAULTS, LENS_DEFAULTS };

const FLOAT = THREE.FloatType;
export const LATE_LAYER = 30;   // objects with userData.dkLate (the ocean) live here: drawn after the scene

function rt(w, h, o = {}) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: o.type ?? FLOAT, format: THREE.RGBAFormat,
    depthBuffer: !!o.depth, stencilBuffer: false, count: o.count ?? 1,
    minFilter: o.linear ? THREE.LinearFilter : THREE.NearestFilter,
    magFilter: o.linear ? THREE.LinearFilter : THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    generateMipmaps: false, colorSpace: THREE.LinearSRGBColorSpace,
  });
  if (o.depthTexture) {
    t.depthTexture = new THREE.DepthTexture(t.width, t.height, THREE.FloatType);
    t.depthTexture.minFilter = t.depthTexture.magFilter = THREE.NearestFilter;
  }
  return t;
}

// Halton sequence (sub-pixel jitter of the accumulate mode)
function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

export class Cinematic {
  /**
   * host = { renderer, gl, scene, camera, ctx, cfg, renderScene(target, opts), runAt(time, frame, sub), drawPass, makePass, isWarmup }
   */
  constructor(host) {
    this.h = host;
    this.c = host.ctx.cinematic;
    this.vel = null;
    this.state = {};
    this.lensNow = null;
    this.features = {};
  }

  async init() {
    const { gl, ctx, cfg } = this.h;
    const c = validateCinematic(this.c);
    gl.getExtension('EXT_float_blend');           // blending into RGBA32F (transparent objects)
    gl.getExtension('OES_texture_float_linear');
    const RW = cfg.renderWidth ?? cfg.width, RH = cfg.renderHeight ?? cfg.height;
    this.RW = RW; this.RH = RH;
    const warm = this.h.meta.mode === 'chunk-warmup';
    if (c.motionBlur.mode === 'accumulate' && warm) {
      console.warn('[dk] cinematic: chunk-warmup scenes cannot render sub-frames (update() must run once per frame, in order) - using velocity motion blur');
      c.motionBlur.mode = 'velocity';
    }
    this.mode = c.motionBlur.mode;

    // A material that fails to compile is skipped silently by three.js (the
    // object just disappears from the shot). Record it and fail the frame instead.
    this.shaderErrors = [];
    this.shaderErrorsSeen = 0;
    this.h.renderer.debug.onShaderError = (glc, program, vs, fs) => {
      const lines = [];
      for (const [kind, sh] of [['vertex', vs], ['fragment', fs]]) {
        const log = (glc.getShaderInfoLog(sh) || '').trim();
        if (!log) continue;
        const src = (glc.getShaderSource(sh) || '').split('\n');
        const m = /ERROR: \d+:(\d+)/.exec(log);
        const ln = m ? +m[1] : 0;
        lines.push(`${kind}: ${log}` + (ln ? '\n' + src.slice(Math.max(0, ln - 3), ln + 2).map((l, i) => `  ${ln - 2 + i}: ${l}`).join('\n') : ''));
      }
      if (!lines.length) lines.push((glc.getProgramInfoLog(program) || 'link failed').trim());
      const msg = lines.join('\n');
      this.shaderErrors.push(msg);
      console.error('[dk] cinematic: shader program failed to compile/link:\n' + msg);
    };

    // LUT: a URL/path string (relative to the scene) or a parsed LUT object
    if (c.grade.lut) await this.loadLut(c.grade.lut);

    // ---- targets
    this.sceneRT = rt(RW, RH, { depth: true, depthTexture: true, linear: true });
    if (this.mode === 'accumulate') this.accRT = rt(RW, RH, { linear: true });
    this.resolveRT = rt(RW, RH, { count: this.mode === 'velocity' ? 2 : 1, linear: true });
    if (this.mode === 'velocity') {
      this.resolveRT.textures[1].minFilter = this.resolveRT.textures[1].magFilter = THREE.NearestFilter;
      this.dynVelRT = rt(RW, RH, { depth: true });
      this.K = Math.max(8, Math.round(RW / 192));            // velocity tile size (20 px at 4K)
      this.tileRT = rt(Math.ceil(RW / this.K), Math.ceil(RH / this.K));
      this.nbRT = rt(Math.ceil(RW / this.K), Math.ceil(RH / this.K));
      this.vel = new VelocityTracker(this.h);
    }
    this.mbRT = rt(RW, RH, { linear: true });
    const HW = Math.ceil(RW / 2), HH = Math.ceil(RH / 2);
    this.halfRT = rt(HW, HH, { linear: true });
    this.dofRT = rt(HW, HH, { linear: true });
    this.cocTileRT = rt(Math.ceil(HW / 8), Math.ceil(HH / 8));
    this.cocDilRT = rt(Math.ceil(HW / 8), Math.ceil(HH / 8));
    this.bloomDown = []; this.bloomUp = [];
    let bw = HW, bh = HH;
    for (let i = 0; i < 6; i++) {
      bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2));
      this.bloomDown.push(rt(bw, bh, { linear: true }));
      this.bloomUp.push(rt(bw, bh, { linear: true }));
    }
    this.out8 = (cfg.bitDepth ?? 8) === 8;
    this.noiseTex = P.makeNoiseTexture();
    this.gradeTex = new THREE.Data3DTexture(new Float32Array(LUT_SIZE ** 3 * 4), LUT_SIZE, LUT_SIZE, LUT_SIZE);
    Object.assign(this.gradeTex, { format: THREE.RGBAFormat, type: THREE.FloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, unpackAlignment: 1 });
    this.gradeTex.wrapS = this.gradeTex.wrapT = this.gradeTex.wrapR = THREE.ClampToEdgeWrapping;
    this.updateGradeLut();
    this.finalRT = rt(RW, RH, { type: this.out8 ? THREE.UnsignedByteType : FLOAT, linear: true });

    // ---- lighting features that live inside the materials (AO, contact/cloud shadows, cascades)
    this.sun = this.findSun();
    if (c.shadows.cascades > 0) {
      if (this.sun) { this.csm = new CascadedShadows(this.h, this); this.csm.init(this.sun); }
      else console.warn('[dk] cinematic.shadows.cascades: no shadow-casting DirectionalLight found');
    }
    if (c.ao.enabled) { this.ao = new AmbientOcclusion(this.h, this); this.aoTex = this.ao.init(RW, RH); }
    if (c.atmosphere.enabled) {
      this.atmosphere = new Atmosphere(this.h, this).init();
      this.atmoActive = !!c.atmosphere.aerialPerspective;
    }
    if (c.volumetrics.cloudShadows) this.cloudTex = makeCloudTexture();
    if (c.volumetrics.enabled) { this.volumetrics = new Volumetrics(this.h, this).init(this.cloudTex); this.volActive = true; }
    const clouds = !!(c.volumetrics.cloudShadows && c.volumetrics.cloudShadows.surfaces !== false);
    this.patcher = new MaterialPatcher();
    const fastIBL = c.ibl !== 'exact';
    if (fastIBL) this.envBake = new EnvBake(this.h);
    this.patcher.configure({ ssao: !!this.ao, contact: !!(this.ao && c.ao.contactShadows && this.sun), csm: this.csm ? this.csm.N : 0, clouds, sunLights: this.csm ? this.csm.N : 1, fastIBL });
    this.patchOn = !!(this.ao || this.csm || clouds || fastIBL);
    this.collectLate();
    if (this.patchOn) this.patcher.patchScene(this.h.scene);

    // ---- passes
    const mk = (m) => this.h.makePass(m);
    this.pass = {
      acc: mk(P.makeAccumulateMaterial()),
      tile: mk(P.makeTileMaxMaterial()),
      nb: mk(P.makeNeighborMaxMaterial()),
      cocTile: mk(P.makeCocTileMaterial()),
      cocDil: mk(P.makeCocDilateMaterial()),
      gather: mk(P.makeDofGatherMaterial()),
      down: mk(P.makeDownsampleMaterial()),
      up: mk(P.makeUpsampleMaterial()),
    };
    this.pass.acc.material.blending = THREE.CustomBlending;
    this.rebuildVariants(true);
    this.features = this.describe();
    return this.features;
  }

  async loadLut(spec) {
    const g = this.c.grade;
    let lut = spec;
    if (typeof spec === 'string') {
      const url = new URL(spec, this.h.sceneUrl).href;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`cinematic.grade.lut: ${spec}: HTTP ${r.status}`);
      lut = parseCube(await r.text(), spec);
    }
    if (!(lut && lut.data && lut.size)) throw new Error('cinematic.grade.lut must be a .cube URL/path or a LUT parsed with dk/lut.js');
    this.lut = lut;
    this.lutSpec = spec;
  }

  /** (Re)build the shader variants whose #defines depend on settings that may change per frame. */
  rebuildVariants(force = false) {
    const c = this.c;
    const mbVel = this.mode === 'velocity';
    const resolveKey = JSON.stringify({ mb: mbVel, atmo: !!this.atmoActive, vol: !!this.volActive });
    if (force || resolveKey !== this.resolveKey) {
      this.pass.resolve?.material.dispose();
      this.pass.resolve = this.h.makePass(P.makeResolveMaterial({ mb: mbVel, atmo: !!this.atmoActive, vol: !!this.volActive }));
      this.resolveKey = resolveKey;
    }
    const mbKey = JSON.stringify({ mb: mbVel, fxaa: c.aa === 'fxaa' });
    if (force || mbKey !== this.mbKey) {
      this.pass.mb?.material.dispose();
      this.pass.mb = this.h.makePass(P.makeMotionBlurMaterial({ mb: mbVel, fxaa: c.aa === 'fxaa' }));
      this.mbKey = mbKey;
    }
    const depthIsLinear = mbVel;
    const preKey = JSON.stringify({ depthIsLinear });
    if (force || preKey !== this.preKey) {
      this.pass.pre?.material.dispose();
      this.pass.pre = this.h.makePass(P.makeDofPrefilterMaterial({ depthIsLinear }));
      this.preKey = preKey;
    }
    const fin = {
      dof: c.dof.enabled, bloom: c.bloom.intensity > 0 || c.bloom.halation > 0,
      ca: c.lensFx.chromaticAberration > 0, distortion: c.lensFx.distortion !== 0, depthIsLinear,
    };
    const finKey = JSON.stringify(fin);
    if (force || finKey !== this.finKey) {
      this.pass.final?.material.dispose();
      this.pass.final = this.h.makePass(P.makeFinalMaterial(fin));
      this.finKey = finKey; this.fin = fin;
    }
  }

  describe() {
    const c = this.c;
    return {
      preset: c.preset, motionBlur: this.mode, aa: this.mode === 'accumulate' ? `jitter x${c.motionBlur.accumulateSamples}` : c.aa,
      dof: c.dof.enabled, bloom: c.bloom.intensity, grade: `${c.grade.toneMapping}/${c.grade.look}${this.lut ? ' + LUT' : ''}`,
      grain: c.grain.amount, ao: !!this.ao, atmosphere: !!this.atmoActive, volumetrics: !!this.volActive,
    };
  }

  // ------------------------------------------------------------- lens --
  /** ctx.lens -> camera fov; returns this frame's derived lens values. */
  applyLens() {
    const { camera, ctx } = this.h;
    const L = { ...LENS_DEFAULTS, ...(ctx.lens || {}) };
    const aspect = this.RW / this.RH;
    const sensor = sensorSize(L.sensor, aspect);
    if (L.focalLength) {
      camera.filmGauge = sensor.width;
      camera.setFocalLength(L.focalLength);      // updates fov + projection
    }
    const focal = L.focalLength || focalLengthFromFov(camera.fov, L.sensor, aspect);
    this.lensNow = { ...L, sensor, focal };
    return this.lensNow;
  }

  focusDistance() {
    const { camera } = this.h;
    const L = this.lensNow;
    if (L.focusTarget) {
      const p = L.focusTarget.isObject3D ? L.focusTarget.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3().copy(L.focusTarget);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      const cp = camera.getWorldPosition(new THREE.Vector3());
      return Math.max(camera.near * 2, p.sub(cp).dot(fwd));
    }
    return L.focus;
  }

  shutterTime() { return exposureTime(this.lensNow?.shutterAngle ?? 180, this.h.cfg.fps); }

  // --------------------------------------------------------- time hooks --
  /** Pure scenes, velocity motion blur: pose the scene at shutter-open time and remember it. */
  beforeUpdate(frame) {
    if (this.mode !== 'velocity') return;
    const { ctx } = this.h;
    const L = { ...LENS_DEFAULTS, ...(ctx.lens || {}) };
    const T = exposureTime(L.shutterAngle, this.h.cfg.fps);
    if (!(T > 0)) { this.vel.hasPrev = false; return; }
    const t = frame / this.h.cfg.fps;
    this.h.runAt(t - T / 2, frame, { index: -1, count: 0, kind: 'shutter-open' });
    this.applyLens();
    this.vel.snapshot();
    this.velScale = 2;          // pose at t - T/2: the motion over the whole interval is twice that
  }
  /** Chunk-warmup scenes: called after update() of every simulated frame; remembers frame-1. */
  afterSimFrame(f, target) {
    if (this.mode !== 'velocity') return;
    if (f === target - 1) { this.applyLens(); this.vel.snapshot(); this.velScale = (this.lensNow.shutterAngle ?? 180) / 360; }
  }
  resetSim() { if (this.vel) this.vel.hasPrev = false; }

  // ------------------------------------------------------------- render --
  /**
   * Render the current frame (scene already updated to t). mark(name, rt)
   * is the runtime's timing hook. Returns the texture the packer reads.
   */
  render(mark) {
    const h = this.h, c = this.c, { renderer, camera, ctx } = h;
    const RW = this.RW, RH = this.RH;
    this.applyLens();
    this.rebuildVariants();
    const frame = ctx.frame | 0;
    let color, depthTex;

    // ---- sky + sun light from the atmosphere, cascades, material uniforms, then the depth pre-pass + GTAO
    if (this.atmosphere) { this.atmosphere.update(); mark('sky-luts', this.atmosphere.apRT); }
    this.prepareLighting();
    if (this.ao) {
      this.ao.prepass();
      mark('prepass', this.ao.preRT);
      this.ao.compute(this.sunDirection());
      mark('gtao', this.ao.outRT);
    }

    // ---- main scene (or N sub-frames)
    if (this.mode === 'accumulate') {
      this.renderAccumulated(frame);
      color = this.accRT.texture; depthTex = this.sceneRT.depthTexture;
    } else {
      this.lateDrawn = false;
      this.renderSceneAndLate(this.sceneRT, undefined, mark);
      color = this.sceneRT.texture; depthTex = this.sceneRT.depthTexture;
    }
    mark(this.lateDrawn ? 'late' : 'scene', this.mode === 'accumulate' ? this.accRT : this.sceneRT);
    camera.updateMatrixWorld();

    // ---- volumetric fog (needs this frame's shadow maps)
    if (this.volumetrics) {
      this.volumetrics.render(frame / h.cfg.fps, { sun: this.sun, sunDir: this.sunDirection(), cascades: this.csm?.lights, atmosphere: this.atmosphere });
      mark('volumetrics', this.volumetrics.result);
    }

    // ---- motion vectors of moving objects
    const mbVel = this.mode === 'velocity';
    let velDepth = null;
    if (mbVel) {
      this.vel.collectDynamic();
      this.vel.render(this.dynVelRT, { sceneDepth: depthTex, width: RW, height: RH, velScale: this.vel.hasPrev ? this.velScale : 0 });
      mark('velocity', this.dynVelRT);
    }

    // ---- resolve: atmosphere + per-pixel velocity
    const needResolve = mbVel || this.atmoActive || this.volActive;
    if (needResolve) {
      const u = this.pass.resolve.material.uniforms;
      u.tColor.value = color; u.tDepth.value = depthTex; u.tDynVel.value = this.dynVelRT?.texture ?? null;
      u.uSize.value.set(RW, RH); u.uNear.value = camera.near; u.uFar.value = camera.far;
      u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld);
      if (mbVel) {
        u.uPrevViewProj.value.copy(this.vel.hasPrev ? this.vel.prevViewProj : new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        u.uVelScale.value = this.vel.hasPrev ? this.velScale : 0;
        u.uMaxVel.value = c.motionBlur.maxBlur * RW;
      }
      this.atmosphere?.bindResolve(u);
      this.volumetrics?.bindResolve(u);
      if (u.uFogOnly) u.uFogOnly.value = c.debug === 'fog' ? 1 : 0;
      h.drawPass(this.pass.resolve, this.resolveRT);
      color = this.resolveRT.textures[0];
      if (mbVel) velDepth = this.resolveRT.textures[1];
      mark('resolve', this.resolveRT);
    }

    // ---- motion blur reconstruction (+ FXAA where nothing moves)
    let sharp = color;
    if (this.mode !== 'accumulate' && (mbVel || c.aa === 'fxaa')) {
      if (mbVel) {
        const tu = this.pass.tile.material.uniforms;
        tu.tVel.value = velDepth; tu.uK.value = this.K; tu.uSize.value.set(RW, RH);
        h.drawPass(this.pass.tile, this.tileRT);
        this.pass.nb.material.uniforms.tTile.value = this.tileRT.texture;
        h.drawPass(this.pass.nb, this.nbRT);
        mark('mb-tiles', this.nbRT);
      }
      const mu = this.pass.mb.material.uniforms;
      mu.tColor.value = color; mu.tVelDepth.value = velDepth; mu.tNeighbor.value = this.nbRT?.texture ?? null;
      mu.uK.value = this.K ?? 20; mu.uInvSize.value.set(1 / RW, 1 / RH);
      mu.uMaxSamples.value = c.motionBlur.samples; mu.uFrameSeed.value = frame % 64;
      h.drawPass(this.pass.mb, this.mbRT);
      sharp = this.mbRT.texture;
      mark(mbVel ? 'motionblur' : 'fxaa', this.mbRT);
    }

    // ---- depth of field
    const L = this.lensNow;
    const focus = this.focusDistance();
    const depthSrc = velDepth ?? depthTex;
    let cocK = 0;
    if (c.dof.enabled && focus != null && focus > 0) {
      cocK = cocScale({ focalLength: L.focal, fstop: L.fstop, focus, sensorWidth: L.sensor.width, imageWidth: RW });
    }
    const maxCoc = c.dof.maxCoC * RW;
    const dofOn = c.dof.enabled && cocK > 0.3;
    const bloomOn = c.bloom.intensity > 0 || c.bloom.halation > 0;
    if (dofOn || bloomOn) {
      const pu = this.pass.pre.material.uniforms;
      pu.tColor.value = sharp; pu.tDepth.value = depthSrc; pu.uNear.value = camera.near; pu.uFar.value = camera.far;
      pu.uCocK.value = dofOn ? cocK : 0; pu.uFocus.value = focus ?? 1; pu.uMaxCoc.value = maxCoc;
      h.drawPass(this.pass.pre, this.halfRT);
      mark('half', this.halfRT);
    }
    if (dofOn) {
      this.pass.cocTile.material.uniforms.tHalf.value = this.halfRT.texture;
      h.drawPass(this.pass.cocTile, this.cocTileRT);
      const du = this.pass.cocDil.material.uniforms;
      du.tTile.value = this.cocTileRT.texture;
      du.uR.value = Math.min(3, Math.max(1, Math.ceil(maxCoc / 2 / 16)));
      h.drawPass(this.pass.cocDil, this.cocDilRT);
      const gu = this.pass.gather.material.uniforms;
      gu.tHalf.value = this.halfRT.texture; gu.tTiles.value = this.cocDilRT.texture;
      gu.uHalfSize.value.set(this.halfRT.width, this.halfRT.height);
      gu.uSamples.value = c.dof.samples; gu.uMaxCoc.value = maxCoc; gu.uCatsEye.value = c.dof.catsEye; gu.uAspect.value = RW / RH;
      h.drawPass(this.pass.gather, this.dofRT);
      mark('dof', this.dofRT);
    }

    // ---- bloom pyramid (from the half-res picture)
    if (bloomOn) {
      let src = this.halfRT;
      for (let i = 0; i < this.bloomDown.length; i++) {
        const du = this.pass.down.material.uniforms;
        du.tSrc.value = src.texture; du.uSrcInv.value.set(1 / src.width, 1 / src.height);
        h.drawPass(this.pass.down, this.bloomDown[i]);
        src = this.bloomDown[i];
      }
      let low = this.bloomDown[this.bloomDown.length - 1];
      for (let i = this.bloomDown.length - 2; i >= 0; i--) {
        const uu = this.pass.up.material.uniforms;
        uu.tLow.value = low.texture; uu.tHigh.value = this.bloomDown[i].texture;
        uu.uLowInv.value.set(1 / low.width, 1 / low.height); uu.uMix.value = 0.5;
        h.drawPass(this.pass.up, this.bloomUp[i]);
        low = this.bloomUp[i];
      }
      mark('bloom', this.bloomUp[0]);
    }

    // ---- final: camera + grade + lens
    if (c.debug) return this.drawDebug(c.debug, { velDepth, dofOn });
    this.setFinalUniforms({ sharp, depthSrc, cocK, focus, maxCoc, dofOn, frame });
    h.drawPass(this.pass.final, this.finalRT);
    mark('final', this.finalRT);
    if (this.shaderErrors.length > this.shaderErrorsSeen) {
      const e = this.shaderErrors.slice(this.shaderErrorsSeen);
      this.shaderErrorsSeen = this.shaderErrors.length;
      throw new Error(`[dk] cinematic: ${e.length} shader program(s) failed to compile - objects would be missing from frame ${frame}:\n${e[0].slice(0, 1500)}`);
    }
    return this.finalRT;
  }

  drawDebug(mode, { velDepth }) {
    if (!this.pass.debug) this.pass.debug = this.h.makePass(P.makeDebugMaterial());
    const u = this.pass.debug.material.uniforms;
    const views = {
      ao: [0, this.ao?.outRT.texture, 1], contact: [1, this.ao?.outRT.texture, 1],
      velocity: [2, velDepth, 1 / Math.max(1, this.c.motionBlur.maxBlur * this.RW * 0.25)],
      coc: [3, this.halfRT.texture, 1 / 20], depth: [4, velDepth ?? this.ao?.aoRT.texture, 1],
      dof: [5, this.dofRT.texture, 1], bloom: [5, this.bloomUp[0].texture, 1], scene: [5, this.sceneRT.texture, 1],
      fog: [5, this.resolveRT.textures[0], 1],
    };
    const v = views[mode];
    if (!v || !v[1]) throw new Error(`cinematic.debug = '${mode}' is not available with these settings (${P.DEBUG_VIEWS.join(', ')})`);
    u.uMode.value = v[0]; u.tA.value = v[1]; u.uScale.value = v[2]; u.uSize.value.set(this.RW, this.RH);
    this.h.drawPass(this.pass.debug, this.finalRT);
    return this.finalRT;
  }

  /** Re-bake the colour pipeline LUT when a grade setting changed (deterministic JS, ~0.1-0.3 s). */
  updateGradeLut() {
    const g = this.c.grade;
    const key = JSON.stringify([g.toneMapping, g.look, g.contrast, g.saturation, g.cdl, g.lift, g.gamma, g.gain, g.lutSpace, g.lutIntensity, this.lutSpec && typeof this.lutSpec === 'string' ? this.lutSpec : !!this.lut]);
    if (key === this.gradeKey) return false;
    const look = P.LOOKS[g.look] || P.LOOKS.base;
    this.gradeTex.image.data.set(bakeGradeLut(g, look, this.lut || null, LUT_SIZE));
    this.gradeTex.needsUpdate = true;
    this.gradeKey = key;
    return true;
  }

  setFinalUniforms({ sharp, depthSrc, cocK, focus, maxCoc, dofOn, frame }) {
    const c = this.c, h = this.h, u = this.pass.final.material.uniforms, L = this.lensNow;
    const RW = this.RW, RH = this.RH;
    u.tSharp.value = sharp; u.tDepth.value = depthSrc;
    u.tDof.value = this.dofRT.texture; u.tDofHalf.value = this.halfRT.texture; u.tDofTiles.value = this.cocDilRT.texture;
    u.tBloom.value = this.bloomUp[0].texture; u.tBloomSmall.value = this.bloomDown[1].texture;
    u.uSize.value.set(RW, RH); u.uNear.value = h.camera.near; u.uFar.value = h.camera.far;
    u.uCocK.value = dofOn ? cocK : 0; u.uFocus.value = focus ?? 1; u.uMaxCoc.value = maxCoc;
    u.uDofOn.value = dofOn ? 1 : 0;
    const g = c.grade;
    u.uExposure.value = (h.ctx.post?.exposure ?? 1) * exposureMultiplier(L) * Math.pow(2, g.exposure || 0);
    const wbKey = `${g.whiteBalance}|${g.tint}`;
    if (wbKey !== this.wbKey) {
      const M = P.whiteBalanceMatrix(g.whiteBalance, g.tint);
      u.uWB.value.set(M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2], M[2][0], M[2][1], M[2][2]);
      this.wbKey = wbKey;
    }
    this.updateGradeLut();
    u.tGrade.value = this.gradeTex; u.uLutN.value = LUT_SIZE;
    u.uShaper.value.set(SHAPER_MIN_EV, 1 / (SHAPER_MAX_EV - SHAPER_MIN_EV));
    const b = c.bloom;
    u.uBloom.value = b.intensity; u.uHalation.value = b.halation; u.uHalationThreshold.value = b.halationThreshold;
    u.uHalationTint.value.fromArray(b.halationTint);
    u.uVignette.value = c.lensFx.vignette;
    const halfDiag = 0.5 * Math.hypot(L.sensor.width, L.sensor.height);
    u.uVigK.value = (halfDiag / L.focal) ** 2;          // tan^2 of the corner field angle
    u.uCA.value = c.lensFx.chromaticAberration * (RW / 3840);
    u.uDistortion.value = c.lensFx.distortion;
    const gr = c.grain, iso = (L.iso ?? 800) / 800;
    u.tNoise.value = this.noiseTex;
    u.uGrain.value = gr.amount; u.uGrainCell.value = gr.size * (RW / 3840); u.uGrainChroma.value = gr.chroma;
    // sensor noise model: variance = shot * L + read (scene-linear, mid grey = 0.18), scaled by the ISO gain
    u.uGrainNoise.value.set(2.6e-5 * iso, 1.5e-7 * iso * iso);
    // a different grain pattern every frame: offset / mirror / transpose of the noise tile from the frame index
    const hf = (k) => { let x = Math.imul((frame >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35); x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; return x >>> 0; };
    u.uNoiseXf.value.set(hf(1) & 1023, hf(2) & 1023, hf(3) & 7);
    u.uDither8.value = this.out8 && h.cfg.dither ? 1 : 0;
  }

  /** Accumulate mode: N sub-frames across the shutter interval, centre last (its depth is kept). */
  renderAccumulated(frame) {
    const h = this.h, c = this.c, { renderer, camera, ctx } = h;
    const N = c.motionBlur.accumulateSamples;
    const fps = h.cfg.fps;
    const t = frame / fps;
    const T = this.shutterTime();
    const centre = Math.floor(N / 2);
    const order = [...Array(N).keys()].filter((i) => i !== centre).concat([centre]);
    const sun = c.motionBlur.softShadows ? this.findSun() : null;
    const au = this.pass.acc.material.uniforms;
    renderer.setRenderTarget(this.accRT);
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setClearColor(cc, ca);
    const sunSave = sun ? { pos: sun.position.clone(), tgt: sun.target.position.clone() } : null;
    for (const i of order) {
      const ti = t + ((i + 0.5) / N - 0.5) * T;
      if (N > 1) { h.runAt(ti, frame, { index: i, count: N, kind: 'accumulate' }); h.refreshBounds(); }
      this.applyLens();
      camera.updateProjectionMatrix();
      // sub-pixel jitter (box filter over the pixel = supersampling)
      if (c.motionBlur.jitterAA && N > 1) {
        const jx = halton(i + 1, 2) - 0.5, jy = halton(i + 1, 3) - 0.5;
        const e = camera.projectionMatrix.elements;
        e[8] += (2 * jx) / this.RW; e[9] += (2 * jy) / this.RH;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }
      // sun jitter inside its disk (0.53 deg) -> real penumbrae after averaging
      let noCache = false;
      if (sun && N > 1) {
        const dir = sun.position.clone().sub(sun.target.position);
        const dist = dir.length(); dir.normalize();
        const a = (i + 0.5) / N, r = Math.sqrt(a) * 0.004625, phi = i * 2.39996323;   // radius in radians (0.265 deg)
        const u1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const v1 = new THREE.Vector3().crossVectors(dir, u1);
        dir.addScaledVector(u1, r * Math.cos(phi)).addScaledVector(v1, r * Math.sin(phi)).normalize();
        sun.position.copy(sun.target.position).addScaledVector(dir, dist);
        sun.updateMatrixWorld();
        noCache = true;
      }
      this.prepareLighting();
      this.renderSceneAndLate(this.sceneRT, { noShadowCache: noCache });
      if (sunSave) { sun.position.copy(sunSave.pos); sun.target.position.copy(sunSave.tgt); sun.updateMatrixWorld(); }
      camera.updateProjectionMatrix();
      au.tSrc.value = this.sceneRT.texture; au.uWeight.value = 1 / N;
      h.drawPass(this.pass.acc, this.accRT);
    }
    camera.updateMatrixWorld();
  }

  sunDirection() {
    const s = this.sun;
    if (!s) return null;
    s.updateMatrixWorld(); s.target.updateMatrixWorld();
    return new THREE.Vector3().setFromMatrixPosition(s.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(s.target.matrixWorld)).normalize();
  }

  /** Everything the patched materials need for this frame (call again when the camera changes). */
  prepareLighting() {
    const { camera, scene } = this.h;
    camera.updateMatrixWorld();
    if (this.csm) this.csm.update();
    if (!this.patchOn) return;
    this.patcher.patchScene(scene);                 // materials created after setup
    const u = this.patcher.uniforms;
    u.dkViewInverse.value.copy(camera.matrixWorld);
    u.dkScreenInv.value.set(1 / this.RW, 1 / this.RH);
    if (this.ao) { u.dkAOTex.value = this.aoTex; u.dkAOStrength.value = 1; u.dkContactStrength.value = 1; }
    if (this.csm) this.csm.bind(u);
    if (this.envBake && this.envBake.update(scene)) this.envBake.bind(u);
    const sd = this.sunDirection();
    if (sd) u.dkSunDirW.value.copy(sd);
    const cs = this.c.volumetrics.cloudShadows;
    if (cs && this.cloudTex) {
      const t = (this.h.ctx.frame | 0) / this.h.cfg.fps, sc = cs.scale ?? 0.0012, sp = cs.speed || [8, 0];
      u.dkCloudTex.value = this.cloudTex;
      u.dkCloud.value.set(cs.coverage ?? 0.5, cs.softness ?? 0.2, cs.opacity ?? 0.85, cs.altitude ?? 1500);
      u.dkCloudXf.value.set(sc, sp[0] * t * sc, sp[1] * t * sc, 1);
    }
  }

  /** Objects marked userData.dkLate move to the late layer (excluded from the main / pre / shadow passes). */
  collectLate() {
    const late = [];
    this.h.scene.traverse((o) => {
      if (!o.userData?.dkLate) return;
      if (!o.userData.dkLateLayered) { o.layers.set(LATE_LAYER); o.userData.dkLateLayered = true; }
      if (o.visible) late.push(o);
    });
    this.late = late;
    return late;
  }

  /** Main pass, then the late objects with copies of the scene's colour + depth. */
  renderSceneAndLate(target, opts, mark = null) {
    const h = this.h, { renderer, scene, camera, gl } = h;
    h.renderScene(target, opts);
    const late = this.collectLate();
    if (!late.length) return;
    mark?.('scene', target);
    if (!this.lateDepthRT) {
      this.lateDepthRT = rt(this.RW, this.RH, { depth: true, depthTexture: true, type: THREE.UnsignedByteType });
      this.lateColorRT = rt(this.RW, this.RH, { linear: true });
      renderer.initRenderTarget(this.lateDepthRT); renderer.initRenderTarget(this.lateColorRT);
    }
    // copy colour + depth (one blit each)
    const src = renderer.properties.get(target).__webglFramebuffer;
    const blit = (dst, bits) => {
      renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
      renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, renderer.properties.get(dst).__webglFramebuffer);
      gl.blitFramebuffer(0, 0, this.RW, this.RH, 0, 0, this.RW, this.RH, bits, gl.NEAREST);
    };
    renderer.state.setScissorTest(false);
    blit(this.lateDepthRT, gl.DEPTH_BUFFER_BIT);
    blit(this.lateColorRT, gl.COLOR_BUFFER_BIT);
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    mark?.('late-copy', this.lateColorRT);
    for (const o of late) {
      const u = o.userData.dkOcean?.uniforms || o.material?.userData?.dkLateUniforms;
      if (!u) continue;
      u.dkSceneDepth.value = this.lateDepthRT.depthTexture; u.dkSceneColor.value = this.lateColorRT.texture;
      u.dkLateOn.value = 1; u.dkLateSize.value.set(this.RW, this.RH); u.dkLateNearFar.value.set(camera.near, camera.far);
      if (u.dkProj11) u.dkProj11.value = camera.projectionMatrix.elements[5];
      if (u.dkProjM) u.dkProjM.value.copy(camera.projectionMatrix);
      if (u.dkAmbTex && this.atmosphere && this.c.atmosphere.sky === 'physical') { u.dkAmbTex.value = this.atmosphere.ambRT.texture; u.dkAmbFromTex.value = 1; }
    }
    const mask = camera.layers.mask, bg = scene.background, auto = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
    camera.layers.set(LATE_LAYER); scene.background = null; renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
    try { renderer.setRenderTarget(target); renderer.render(scene, camera); }
    finally { camera.layers.mask = mask; scene.background = bg; renderer.shadowMap.autoUpdate = auto; renderer.autoClear = ac; }
    this.lateDrawn = true;
  }

  /** NaN / Inf / range of every float buffer of the last frame (tests, debugging). */
  debugStats() {
    const { renderer } = this.h;
    const out = { shaderErrors: this.shaderErrors.length };
    const targets = {
      scene: this.mode === 'accumulate' ? this.accRT : this.sceneRT, resolve: this.resolveRT, motionblur: this.mbRT,
      half: this.halfRT, dof: this.dofRT, bloom: this.bloomUp[0], ao: this.ao?.aoRT,
      volume: this.volumetrics?.result, apLut: this.atmosphere?.apRT, skyView: this.atmosphere?.skyRT,
    };
    for (const [name, t] of Object.entries(targets)) {
      if (!t || t.texture.type !== THREE.FloatType) continue;
      const n = t.width * t.height * 4, buf = new Float32Array(n);
      renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
      let nan = 0, inf = 0, neg = 0, min = Infinity, max = -Infinity, sum = 0;
      for (let i = 0; i < n; i++) {
        const v = buf[i];
        if (Number.isNaN(v)) { nan++; continue; }
        if (!Number.isFinite(v)) { inf++; continue; }
        if (v < min) min = v; if (v > max) max = v;
        if (v < -1e-3 && (i & 3) < 3 && name !== 'resolve') neg++;
        sum += v;
      }
      out[name] = { nan, inf, negative: neg, min, max, mean: sum / n };
    }
    return out;
  }

  findSun() {
    if (this.c.shadows.sun) return this.c.shadows.sun;
    let sun = null;
    this.h.scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.castShadow) sun = o; });
    return sun;
  }
}

export async function createCinematic(host) {
  const c = new Cinematic(host);
  await c.init();
  return c;
}
