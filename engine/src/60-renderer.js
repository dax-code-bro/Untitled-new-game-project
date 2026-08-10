/* ============================================================
   RENDERER — HDR forward PBR with cascaded shadows, screen-space
   fluid, particles and a filmic post chain.
   ============================================================ */

class Camera {
  constructor(opts = {}) {
    this.position = Vec3.from(opts.position || [0, 4, 10]);
    this.target = Vec3.from(opts.target || [0, 1, 0]);
    this.up = new Vec3(0, 1, 0);
    this.fov = (opts.fov || 55) * DEG;
    this.near = opts.near || 0.1;
    this.far = opts.far || 500;
    this.aspect = 1;
    this.view = new Mat4();
    this.proj = new Mat4();
    this.viewProj = new Mat4();
    this.invViewProj = new Mat4();
    this.invProj = new Mat4();
    this.invView = new Mat4();
    this.forward = new Vec3(0, 0, -1);
    this.right = new Vec3(1, 0, 0);
    this.trueUp = new Vec3(0, 1, 0);
  }

  update(aspect) {
    this.aspect = aspect;
    this.view.lookAt(this.position, this.target, this.up);
    this.proj.perspective(this.fov, aspect, this.near, this.far);
    this.viewProj.mulMatrices(this.proj, this.view);
    this.invViewProj.copy(this.viewProj).invert();
    this.invProj.copy(this.proj).invert();
    this.invView.copy(this.view).invert();
    this.forward.subVectors(this.target, this.position).normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    this.trueUp.crossVectors(this.right, this.forward).normalize();
    return this;
  }

  /* Frustum planes for culling, extracted from the view-projection.
     Stored as [nx, ny, nz, d] with normals pointing inward. */
  extractPlanes(out) {
    const m = this.viewProj.e;
    const set = (i, a, b, c, d) => {
      const len = Math.sqrt(a * a + b * b + c * c) || 1;
      out[i * 4] = a / len; out[i * 4 + 1] = b / len; out[i * 4 + 2] = c / len; out[i * 4 + 3] = d / len;
    };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);   // left
    set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);   // right
    set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);   // bottom
    set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);   // top
    set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);  // near
    set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);  // far
    return out;
  }
}

/* Quality presets. Phones and laptops differ by more than an order of
   magnitude, so the engine picks a tier from the device rather than
   shipping one setting that is wrong for most players. */
const QUALITY = {
  low: { shadowRes: 1024, cascades: 1, bloom: true, bloomIters: 2, fluidScale: 0.5, fxaa: false, msaa: 0, maxGrass: 6000, renderScale: 0.75 },
  medium: { shadowRes: 1536, cascades: 2, bloom: true, bloomIters: 3, fluidScale: 0.75, fxaa: true, msaa: 0, maxGrass: 20000, renderScale: 1 },
  high: { shadowRes: 2048, cascades: 2, bloom: true, bloomIters: 3, fluidScale: 1, fxaa: true, msaa: 0, maxGrass: 60000, renderScale: 1 },
  ultra: { shadowRes: 4096, cascades: 2, bloom: true, bloomIters: 4, fluidScale: 1, fxaa: true, msaa: 0, maxGrass: 150000, renderScale: 1 },
};

function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  if (mobile) return (mem >= 6 && cores >= 6) ? 'medium' : 'low';
  if (mem >= 8 && cores >= 8) return 'high';
  if (mem >= 4 && cores >= 4) return 'medium';
  return 'low';
}

class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const attrs = {
      alpha: false,
      antialias: false,          // we resolve with FXAA after tonemapping
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      failIfMajorPerformanceCaveat: false,
    };
    const gl = canvas.getContext('webgl2', attrs);
    if (!gl) throw new Error('[LegendEngine] WebGL2 is not available on this device.');
    this.gl = gl;

    // Float render targets are required for HDR; without them we fall back
    // to 8-bit and lose bloom headroom rather than failing outright.
    this.floatBuffers = !!gl.getExtension('EXT_color_buffer_float');
    this.floatLinear = !!gl.getExtension('OES_texture_float_linear');

    this.qualityName = opts.quality && QUALITY[opts.quality] ? opts.quality : detectQuality();
    this.quality = Object.assign({}, QUALITY[this.qualityName], opts.qualityOverrides || {});
    this.maxPixelRatio = opts.maxPixelRatio || 2;

    this.width = 1; this.height = 1;
    this.time = 0;
    this.shaders = new Map();
    this.fullscreen = new FullscreenTri(gl);

    /* --- environment --- */
    this.sun = {
      direction: new Vec3(0.45, 0.72, 0.53).normalize(),
      color: new Vec3(1.0, 0.94, 0.84),
      intensity: 3.4,
    };
    this.sky = {
      zenith: new Vec3(0.16, 0.33, 0.66),
      horizon: new Vec3(0.62, 0.74, 0.88),
      ground: new Vec3(0.26, 0.24, 0.22),
      intensity: 1.0,
      clouds: 0.4,
    };
    this.fog = {
      color: new Vec3(0.62, 0.72, 0.85),
      density: 0.008,
      height: 0,
      falloff: 0.08,
    };
    this.shadows = { enabled: true, distance: 60, strength: 0.86, split: 14 };
    this.post = {
      exposure: 1.0,
      bloom: 0.55,
      bloomThreshold: 1.1,
      vignette: 0.55,
      chromatic: 0.0018,
      saturation: 1.08,
      contrast: 1.04,
      grain: 0.012,
    };
    this.water = {
      color: new Vec3(0.16, 0.55, 0.68),
      deep: new Vec3(0.02, 0.12, 0.20),
    };

    this.lights = [];
    this._lightPos = new Float32Array(32);
    this._lightColor = new Float32Array(32);

    this._shadowMats = [new Mat4(), new Mat4()];
    this._planes = new Float32Array(24);
    this._instanceScratch = new Float32Array(20 * 1024);

    this._initTargets();
    this._initShadowMaps();
    this.stats = { draws: 0, tris: 0, instances: 0 };
    // 0 off, 1 shadow, 2 normal, 3 albedo, 4 roughness, 5 depth
    this.debugMode = 0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  /* ---------------- shader cache ---------------- */

  program(name, vert, frag, defines = []) {
    const key = `${name}|${defines.join(',')}`;
    let sh = this.shaders.get(key);
    if (!sh) {
      sh = new Shader(this.gl, vert, frag, key, defines);
      this.shaders.set(key, sh);
    }
    return sh;
  }

  _initTargets() {
    const gl = this.gl;
    const hdr = this.floatBuffers
      ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this._hdrSpec = hdr;
    this.hdrA = new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: true });
    this.hdrB = new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: false });
    this.bloomChain = [];
    for (let i = 0; i < 4; i++) {
      this.bloomChain.push({
        a: new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: false }),
        b: new Framebuffer(gl, { width: 4, height: 4, colors: [hdr], depth: false }),
      });
    }
    this.ldr = new Framebuffer(gl, { width: 4, height: 4, colors: [{}], depth: false });

    const rSpec = this.floatBuffers
      ? { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this._rSpec = rSpec;
    this.fluidDepth = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: true });
    this.fluidBlurA = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: false });
    this.fluidBlurB = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: false });
    this.fluidThick = new Framebuffer(gl, { width: 4, height: 4, colors: [rSpec], depth: false });
  }

  _initShadowMaps() {
    const gl = this.gl;
    const res = this.quality.shadowRes;
    this.shadowMaps = [];
    for (let i = 0; i < this.quality.cascades; i++) {
      this.shadowMaps.push(new Framebuffer(gl, {
        width: res, height: res, depthOnly: true, depthTexture: true, compare: true, depth: true,
      }));
    }
  }

  resize(cssWidth, cssHeight, pixelRatio) {
    const dpr = Math.min(pixelRatio || window.devicePixelRatio || 1, this.maxPixelRatio);
    const scale = this.quality.renderScale;
    const w = Math.max(2, Math.floor(cssWidth * dpr * scale));
    const h = Math.max(2, Math.floor(cssHeight * dpr * scale));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.hdrA.resize(w, h);
    this.hdrB.resize(w, h);
    this.ldr.resize(w, h);
    for (let i = 0; i < this.bloomChain.length; i++) {
      const s = 1 << (i + 1);
      const bw = Math.max(2, w >> (i + 1)), bh = Math.max(2, h >> (i + 1));
      this.bloomChain[i].a.resize(bw, bh);
      this.bloomChain[i].b.resize(bw, bh);
    }
    // Fluid depth must match the main buffer so the scene depth can be
    // blitted into it for correct occlusion.
    this.fluidDepth.resize(w, h);
    const fw = Math.max(2, Math.floor(w * this.quality.fluidScale));
    const fh = Math.max(2, Math.floor(h * this.quality.fluidScale));
    this.fluidBlurA.resize(fw, fh);
    this.fluidBlurB.resize(fw, fh);
    this.fluidThick.resize(fw, fh);
  }

  /* ---------------- uniform blocks ---------------- */

  _bindEnv(sh) {
    sh.v3('uSkyZenith', this.sky.zenith);
    sh.v3('uSkyHorizon', this.sky.horizon);
    sh.v3('uGroundColor', this.sky.ground);
    sh.v3('uSunDir', this.sun.direction);
    sh.v3('uSunColor', this.sun.color);
    sh.f('uSunIntensity', this.sun.intensity);
    sh.f('uSkyIntensity', this.sky.intensity);
    sh.v3('uFogColor', this.fog.color);
    sh.f('uFogDensity', this.fog.density);
    sh.f('uFogHeight', this.fog.height);
    sh.f('uFogHeightFalloff', this.fog.falloff);
    sh.f('uTime', this.time);
  }

  _bindShadows(sh) {
    sh.m4('uShadowMat0', this._shadowMats[0]);
    sh.m4('uShadowMat1', this._shadowMats[this.shadowMaps.length > 1 ? 1 : 0]);
    sh.f('uCascadeSplit', this.shadows.split);
    sh.v2('uShadowTexel', 1 / this.quality.shadowRes, 1 / this.quality.shadowRes);
    sh.f('uShadowStrength', this.shadows.enabled ? this.shadows.strength : 0);
    sh.tex('uShadowMap0', this.shadowMaps[0].depthTexture);
    sh.tex('uShadowMap1', this.shadowMaps[this.shadowMaps.length > 1 ? 1 : 0].depthTexture);
  }

  _bindLights(sh) {
    const n = Math.min(this.lights.length, 8);
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      this._lightPos[i * 4] = l.position.x;
      this._lightPos[i * 4 + 1] = l.position.y;
      this._lightPos[i * 4 + 2] = l.position.z;
      this._lightPos[i * 4 + 3] = l.radius;
      this._lightColor[i * 4] = l.color.x;
      this._lightColor[i * 4 + 1] = l.color.y;
      this._lightColor[i * 4 + 2] = l.color.z;
      this._lightColor[i * 4 + 3] = l.intensity;
    }
    sh.i('uLightCount', n);
    if (n > 0) {
      sh.v4v('uLightPos', this._lightPos);
      sh.v4v('uLightColor', this._lightColor);
    }
  }

  _bindMaterial(sh, mat) {
    sh.v3('uBaseColor', mat.color);
    sh.f('uRoughness', mat.roughness);
    sh.f('uMetalness', mat.metalness);
    sh.v3f('uEmissive',
      mat.emissive.x * mat.emissiveStrength,
      mat.emissive.y * mat.emissiveStrength,
      mat.emissive.z * mat.emissiveStrength);
    sh.f('uOpacity', mat.opacity);
    sh.f('uUvScale', mat.uvScale);
    sh.f('uNormalStrength', mat.normalStrength);
    sh.f('uSubsurface', mat.subsurface);
    sh.i('uReceiveShadow', mat.receiveShadow ? 1 : 0);
    sh.i('uHasMaps', mat.maps ? 1 : 0);
    if (mat.maps) {
      sh.tex('uAlbedoMap', mat.maps.albedo);
      sh.tex('uNormalMap', mat.maps.normal);
      sh.tex('uOrmMap', mat.maps.orm);
    }
  }

  /* ---------------- cascaded shadow fitting ---------------- */

  /* Fit an orthographic light frustum around one slice of the view frustum.
     A bounding sphere (rather than a box) keeps the fit rotation-invariant,
     so the shadow map does not resize as the camera turns — which is what
     causes the classic crawling-edge shimmer. */
  _fitCascade(camera, nearD, farD, out) {
    const tanHalf = Math.tan(camera.fov / 2);
    const corners = _shadowCorners;
    let ci = 0;
    for (const d of [nearD, farD]) {
      const hh = tanHalf * d, hw = hh * camera.aspect;
      for (const sy of [-1, 1]) {
        for (const sx of [-1, 1]) {
          corners[ci++].copy(camera.position)
            .addScaled(camera.forward, d)
            .addScaled(camera.right, hw * sx)
            .addScaled(camera.trueUp, hh * sy);
        }
      }
    }
    const center = _v[10].set(0, 0, 0);
    for (let i = 0; i < 8; i++) center.add(corners[i]);
    center.scale(1 / 8);
    let radius = 0;
    for (let i = 0; i < 8; i++) radius = Math.max(radius, center.distanceTo(corners[i]));
    radius = Math.ceil(radius * 16) / 16;

    const res = this.quality.shadowRes;
    const texelSize = (radius * 2) / res;
    // Snap the centre to whole texels along the light's own axes.
    const eye = _v[11].copy(center).addScaled(this.sun.direction, radius * 2.2 + 8);
    const lightView = _shadowView.lookAt(eye, center, Math.abs(this.sun.direction.y) > 0.99 ? _axisZ : Vec3.UP);
    const lc = _v[12].copy(center).applyMat4(lightView);
    lc.x = Math.floor(lc.x / texelSize) * texelSize;
    lc.y = Math.floor(lc.y / texelSize) * texelSize;
    const snapped = _v[13].copy(lc).applyMat4(_shadowViewInv.copy(lightView).invert());
    const eye2 = _v[14].copy(snapped).addScaled(this.sun.direction, radius * 2.2 + 8);
    lightView.lookAt(eye2, snapped, Math.abs(this.sun.direction.y) > 0.99 ? _axisZ : Vec3.UP);

    _shadowProj.ortho(-radius, radius, -radius, radius, 0.5, radius * 4.4 + 20);
    out.mulMatrices(_shadowProj, lightView);
    return out;
  }

  renderShadows(batches, camera) {
    if (!this.shadows.enabled || !this.shadowMaps.length) return;
    const gl = this.gl;
    const n = this.shadowMaps.length;
    const near = camera.near;
    const split = Math.min(this.shadows.split, this.shadows.distance);
    const ranges = n === 1
      ? [[near, this.shadows.distance]]
      : [[near, split], [split * 0.92, this.shadows.distance]];

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Render the faces that FACE the light (normal back-face culling).
    //
    // The tempting alternative — culling front faces so acne lands on
    // surfaces the camera cannot see — breaks the most common case in any
    // game: an object resting on the ground. Back-face culling stores the
    // occluder's *underside*, which sits at exactly the receiver's depth, so
    // the ground compares against a depth equal to its own and every contact
    // shadow disappears.
    //
    // Storing front faces means the occluder's lit surface is stored well
    // above the receiver, and acne is handled by polygon offset plus the
    // slope-scaled bias in the shader.
    gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.8, 4.0);

    for (let i = 0; i < n; i++) {
      this._fitCascade(camera, ranges[i][0], ranges[i][1], this._shadowMats[i]);
      const fb = this.shadowMaps[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.handle);
      gl.viewport(0, 0, fb.width, fb.height);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      for (const batch of batches) {
        if (!batch.count || !batch.material.castShadow) continue;
        if (batch.material.transparent && batch.material.opacity < 0.6) continue;
        const defines = [];
        if (batch.instanced) defines.push('INSTANCED');
        if (batch.skinned) defines.push('SKINNED');
        if (batch.grass) defines.push('GRASS');
        const sh = this.program('shadow', GLSL.shadowVert, GLSL.shadowFrag, defines).use();
        sh.m4('uViewProj', this._shadowMats[i]);
        sh.f('uTime', this.time);
        sh.v3('uCameraPos', camera.position);
        if (batch.grass) {
          sh.v3('uWindDir', this.wind ? this.wind.direction : _defaultWind);
          sh.f('uWindStrength', this.wind ? this.wind.strength : 0.25);
        }
        this._drawBatch(sh, batch);
      }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _drawBatch(sh, batch) {
    if (batch.skinned && batch.boneTexture) {
      sh.tex('uBoneTex', batch.boneTexture);
      sh.f('uBoneCount', batch.boneCount || 0);
    }
    if (batch.instanced) {
      batch.mesh.uploadInstances(batch.instances, batch.count);
      batch.mesh.drawInstanced(batch.count);
      this.stats.draws++;
      this.stats.instances += batch.count;
      this.stats.tris += (batch.mesh.indexCount / 3) * batch.count;
    } else {
      sh.m4('uModel', batch.model);
      sh.v4('uParams', batch.params[0], batch.params[1], batch.params[2], batch.params[3]);
      batch.mesh.draw();
      this.stats.draws++;
      this.stats.tris += batch.mesh.indexCount / 3;
    }
  }

  /* ---------------- main pass ---------------- */

  renderScene(batches, camera) {
    const gl = this.gl;
    this.hdrA.bind(true, 0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const opaque = [];
    const transparent = [];
    for (const b of batches) {
      if (!b.count) continue;
      (b.material.transparent ? transparent : opaque).push(b);
    }

    for (const batch of opaque) this._drawPbr(batch, camera);

    this._drawSky(camera);

    // Transparent last, sorted back to front, with depth writes off so
    // overlapping surfaces blend instead of occluding each other.
    if (transparent.length) {
      transparent.sort((a, b) => b.sortKey - a.sortKey);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const batch of transparent) this._drawPbr(batch, camera);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  _drawPbr(batch, camera) {
    const gl = this.gl;
    const defines = [];
    if (batch.instanced) defines.push('INSTANCED');
    if (batch.skinned) defines.push('SKINNED');
    if (batch.grass) defines.push('GRASS');
    if (batch.alphaClip) defines.push('ALPHA_CLIP');
    const sh = this.program('pbr', GLSL.pbrVert, GLSL.pbrFrag, defines).use();

    sh.m4('uViewProj', camera.viewProj);
    sh.v3('uCameraPos', camera.position);
    this._bindEnv(sh);
    this._bindShadows(sh);
    this._bindLights(sh);
    this._bindMaterial(sh, batch.material);
    sh.i('uDebugMode', this.debugMode);
    if (batch.grass) {
      sh.v3('uWindDir', this.wind ? this.wind.direction : _defaultWind);
      sh.f('uWindStrength', this.wind ? this.wind.strength : 0.25);
    }

    if (batch.material.doubleSided) gl.disable(gl.CULL_FACE);
    this._drawBatch(sh, batch);
    if (batch.material.doubleSided) gl.enable(gl.CULL_FACE);
  }

  _drawSky(camera) {
    const gl = this.gl;
    const sh = this.program('sky', GLSL.skyVert, GLSL.skyFrag).use();
    sh.m4('uInvViewProj', camera.invViewProj);
    sh.v3('uCameraPos', camera.position);
    sh.f('uCloudAmount', this.sky.clouds);
    this._bindEnv(sh);
    // Drawn at the far plane after opaque geometry: no overdraw, and the
    // depth test rejects every pixel the world already covers.
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    this.fullscreen.draw();
    gl.depthMask(true);
    this.stats.draws++;
  }

  /* ---------------- fluid ---------------- */

  renderFluid(fluid, camera) {
    if (!fluid || !fluid.count) return;
    const gl = this.gl;

    // 1. Particle spheres into a view-depth buffer, occluded by the scene.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.hdrA.handle);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fluidDepth.handle);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fluidDepth.handle);
    gl.viewport(0, 0, this.fluidDepth.width, this.fluidDepth.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    const dsh = this.program('fluidDepth', GLSL.fluidDepthVert, GLSL.fluidDepthFrag).use();
    dsh.m4('uViewProj', camera.viewProj);
    dsh.m4('uView', camera.view);
    dsh.m4('uProj', camera.proj);
    dsh.v3('uCameraRight', camera.right);
    dsh.v3('uCameraUp', camera.trueUp);
    fluid.drawParticles();
    this.stats.draws++;

    // 2. Thickness, accumulated additively with depth testing off so
    //    every particle along the ray contributes.
    this.fluidThick.bind(true, 0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const tsh = this.program('fluidThick', GLSL.fluidThickVert, GLSL.fluidThickFrag).use();
    tsh.m4('uViewProj', camera.viewProj);
    tsh.v3('uCameraRight', camera.right);
    tsh.v3('uCameraUp', camera.trueUp);
    fluid.drawParticles();
    gl.disable(gl.BLEND);
    this.stats.draws++;

    // 3. Bilateral blur, separable.
    const bsh = this.program('fluidBlur', FULLSCREEN_VS, GLSL.fluidBlurFrag);
    const passes = [
      { src: this.fluidDepth.color, dst: this.fluidBlurA, dir: [1, 0] },
      { src: this.fluidBlurA.color, dst: this.fluidBlurB, dir: [0, 1] },
    ];
    for (const p of passes) {
      p.dst.bind(true, 0, 0, 0, 0);
      bsh.use();
      bsh.tex('uDepthTex', p.src);
      bsh.v2('uTexel', 1 / p.dst.width, 1 / p.dst.height);
      bsh.v2('uDir', p.dir[0], p.dir[1]);
      // Wide enough that adjacent particles fuse into one surface. Too small
      // and a settled pool still reads as a heap of individual spheres.
      bsh.f('uRadius', 1.7);
      this.fullscreen.draw();
      this.stats.draws++;
    }

    // 4. Shade into hdrB reading hdrA, then blit the result back so later
    //    passes keep working against a single scene target.
    this.hdrB.bind(false);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    const ssh = this.program('fluidShade', FULLSCREEN_VS, GLSL.fluidShadeFrag).use();
    ssh.tex('uDepthTex', this.fluidBlurB.color);
    ssh.tex('uSceneTex', this.hdrA.color);
    ssh.tex('uThickTex', this.fluidThick.color);
    ssh.m4('uInvProj', camera.invProj);
    ssh.m4('uInvView', camera.invView);
    ssh.v2('uTexel', 1 / this.fluidBlurB.width, 1 / this.fluidBlurB.height);
    ssh.v3('uCameraPos', camera.position);
    ssh.v3('uWaterColor', this.water.color);
    ssh.v3('uDeepColor', this.water.deep);
    this._bindEnv(ssh);
    this.fullscreen.draw();
    this.stats.draws++;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.hdrB.handle);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.hdrA.handle);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrA.handle);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.DEPTH_TEST);
  }

  /* ---------------- particles ---------------- */

  renderParticles(system, camera) {
    if (!system || !system.count) return;
    const gl = this.gl;
    this.hdrA.bind(false);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    // Premultiplied alpha: one blend mode covers both additive sparks and
    // occluding smoke, chosen per-particle by its alpha.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const sh = this.program('particle', GLSL.particleVert, GLSL.particleFrag).use();
    sh.m4('uViewProj', camera.viewProj);
    sh.v3('uCameraRight', camera.right);
    sh.v3('uCameraUp', camera.trueUp);
    sh.f('uTime', this.time);
    system.draw();
    this.stats.draws++;
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  /* ---------------- post ---------------- */

  present() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let bloom0 = null, bloom1 = null, bloom2 = null;
    const iters = Math.min(this.quality.bloomIters, this.bloomChain.length);
    if (this.quality.bloom && this.post.bloom > 0 && iters > 0) {
      const bright = this.program('bright', FULLSCREEN_VS, GLSL.brightFrag).use();
      this.bloomChain[0].a.bind(true, 0, 0, 0, 1);
      bright.tex('uTex', this.hdrA.color);
      bright.f('uThreshold', this.post.bloomThreshold);
      bright.f('uSoftKnee', 0.6);
      this.fullscreen.draw();

      const blur = this.program('blur', FULLSCREEN_VS, GLSL.blurFrag);
      let src = this.bloomChain[0].a;
      const results = [];
      for (let i = 0; i < iters; i++) {
        const lvl = this.bloomChain[i];
        if (i > 0) {
          // Downsample by copying into the smaller level first.
          const copy = this.program('copy', FULLSCREEN_VS, GLSL.copyFrag).use();
          lvl.a.bind(true, 0, 0, 0, 1);
          copy.tex('uTex', src.color);
          this.fullscreen.draw();
        }
        blur.use();
        lvl.b.bind(true, 0, 0, 0, 1);
        blur.tex('uTex', lvl.a.color);
        blur.v2('uTexel', 1 / lvl.a.width, 1 / lvl.a.height);
        blur.v2('uDir', 1, 0);
        this.fullscreen.draw();

        blur.use();
        lvl.a.bind(true, 0, 0, 0, 1);
        blur.tex('uTex', lvl.b.color);
        blur.v2('uTexel', 1 / lvl.b.width, 1 / lvl.b.height);
        blur.v2('uDir', 0, 1);
        this.fullscreen.draw();

        results.push(lvl.a.color);
        src = lvl.a;
      }
      bloom0 = results[0];
      bloom1 = results[1] || results[0];
      bloom2 = results[2] || bloom1;
      this.stats.draws += iters * 3;
    }

    const useFxaa = this.quality.fxaa;
    const target = useFxaa ? this.ldr : null;
    if (target) target.bind(true, 0, 0, 0, 1);
    else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
    }

    const comp = this.program('composite', FULLSCREEN_VS, GLSL.compositeFrag).use();
    comp.tex('uScene', this.hdrA.color);
    comp.tex('uBloom0', bloom0 || this.hdrA.color);
    comp.tex('uBloom1', bloom1 || this.hdrA.color);
    comp.tex('uBloom2', bloom2 || this.hdrA.color);
    comp.f('uBloomStrength', bloom0 ? this.post.bloom : 0);
    comp.f('uExposure', this.post.exposure);
    comp.f('uVignette', this.post.vignette);
    comp.f('uChromatic', this.post.chromatic);
    comp.f('uSaturation', this.post.saturation);
    comp.f('uContrast', this.post.contrast);
    comp.f('uGrain', this.post.grain);
    comp.f('uTime', this.time);
    this.fullscreen.draw();
    this.stats.draws++;

    if (useFxaa) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      const fx = this.program('fxaa', FULLSCREEN_VS, GLSL.fxaaFrag).use();
      fx.tex('uTex', this.ldr.color);
      fx.v2('uTexel', 1 / this.width, 1 / this.height);
      this.fullscreen.draw();
      this.stats.draws++;
    }
  }

  beginFrame(dt) {
    this.time += dt;
    this.stats.draws = 0;
    this.stats.tris = 0;
    this.stats.instances = 0;
  }
}

const _shadowCorners = [];
for (let i = 0; i < 8; i++) _shadowCorners.push(new Vec3());
const _shadowView = new Mat4();
const _shadowViewInv = new Mat4();
const _shadowProj = new Mat4();
const _axisZ = new Vec3(0, 0, 1);
const _defaultWind = new Vec3(1, 0, 0.3).normalize();
