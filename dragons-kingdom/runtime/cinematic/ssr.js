// Screen-space reflections on wet and glossy surfaces (cinematic stack, `ssr.enabled`; the quality
// tiers above final turn it on - runtime/lib/quality.js).
//
// Which surfaces: opaque MeshStandard/MeshPhysical materials whose roughness factor is at most
// ssr.maxRoughness (polished metal, glass, wet gold, a silver dragon, water in a bowl), plus every
// material a library marks with material.userData.dkSSR = true (wet cobbles and stone, puddles -
// their roughness comes from maps or shader code the runtime cannot see). userData.dkSSR = false
// (or object.userData.dkNoSSR) excludes one.
//
// How: after the main pass the runtime keeps copies of the scene's colour and depth (the same
// "late pass" the ocean uses). These surfaces are drawn ONCE MORE, with the same material object
// compiled as a second program variant (DK_SSR_PASS), depth-tested against the scene and added on
// top. The variant runs the material's whole shading (maps, normal maps, wetness patches ...),
// marches the reflected view ray through the depth copy, and outputs only the DIFFERENCE between
// what the reflection really shows and what the environment map predicted:
//
//     delta = (scene colour at the hit - env radiance) * confidence * singleScattering(F, roughness)
//             * specular occlusion            (+ the same for a clearcoat layer)
//
// so where no ray hits (sky, off screen, too rough), the picture is exactly the main pass; where
// one hits, the sky reflection is replaced by the dragon / house / cliff in front of it. Rays are
// traced through a min-depth pyramid (Hi-Z: exact crossings, no stepping noise); glossy (not
// mirror) surfaces read a mip-mapped colour copy at the reflection cone's footprint.
// No temporal accumulation, no noise: a pure function of the frame. Screen-space limits apply:
// only what is on screen can be reflected; reflections fade toward the screen edges and with
// distance, and what hides behind a foreground object keeps the environment's reflection.
import * as THREE from 'three';

export const SSR_LAYER = 29;

const isPhys = (m) => m && m.isMeshStandardMaterial && !m.isShaderMaterial && !m.isRawShaderMaterial;
const opaque = (m) => !m.transparent && (m.opacity ?? 1) >= 1 && !(m.transmission > 0) && m.depthWrite !== false && m.colorWrite !== false && m.visible !== false && !m.wireframe;

// GLSL: hierarchical-depth (Hi-Z) ray traversal in (screen uv, depth) space, after the scheme of
// AMD FidelityFX SSSR's hierarchical raymarch (MIT): the ray skips whole cells of a min-depth
// pyramid it passes in front of and descends where it might meet a surface, so it finds the
// exact crossing without fixed steps (no stepping noise, no missed thin poles). A ray that ends
// up BEHIND a surface by more than the thickness (it passed behind an object's silhouette) is
// no hit: the environment map's reflection stays.
const TRACE = /* glsl */ `
uniform sampler2D dkSsrColor;      // mip-mapped copy of the scene colour (half float)
uniform highp sampler2D dkSsrHiz;  // min-depth pyramid, all levels in one atlas (level 0 = the depth buffer)
uniform ivec4 dkSsrLv[16];         // per level: atlas x, y, width, height
uniform int dkSsrLevels;
uniform vec2 dkSsrSize;            // render size
uniform vec2 dkSsrNearFar;
uniform mat4 dkSsrProj;            // the camera's projection (with this sub-frame's jitter)
uniform mat4 dkSsrInvProj;
uniform vec4 dkSsrP;               // max roughness, thickness (m), max distance (m), colour mip levels
uniform float dkSsrDebug;          // 1: output why each ray ended (cinematic.debug = 'ssr')
int dkSsrCode = 0;                 // 1 toward camera, 2 left the screen / depth range, 3 out of iterations, 4 self, 5 passed behind, 6 too far, 7 hit
float dkSsrViewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * dkSsrNearFar.x * dkSsrNearFar.y / ((dkSsrNearFar.y + dkSsrNearFar.x) - z * (dkSsrNearFar.y - dkSsrNearFar.x)); }
float dkHizLoad(vec2 mp, int lv) { ivec4 L = dkSsrLv[lv]; ivec2 q = clamp(ivec2(floor(mp)), ivec2(0), L.zw - 1); return texelFetch(dkSsrHiz, L.xy + q, 0).r; }
// o: (uv, depth) of the start, d: direction in the same space. Returns (uv, depth, 1) at the hit, or 0.
vec4 dkHizTrace(vec3 o, vec3 d) {
  vec3 invD = vec3(abs(d.x) > 1e-12 ? 1.0 / d.x : 1e30, abs(d.y) > 1e-12 ? 1.0 / d.y : 1e30, abs(d.z) > 1e-12 ? 1.0 / d.z : 1e30);
  int lv = 0, top = dkSsrLevels - 1;
  vec2 res = dkSsrSize, rinv = 1.0 / dkSsrSize;
  vec2 uvOff = vec2(d.x < 0.0 ? -0.005 : 0.005, d.y < 0.0 ? -0.005 : 0.005) / dkSsrSize;
  vec2 fo = vec2(d.x < 0.0 ? 0.0 : 1.0, d.y < 0.0 ? 0.0 : 1.0);
  vec2 xy = (floor(res * o.xy) + fo) * rinv + uvOff;
  vec2 t2 = (xy - o.xy) * invD.xy;
  float t = min(t2.x, t2.y);
  vec3 p = o + t * d;
  for (int i = 0; i < DK_SSR_STEPS; i++) {
    if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z >= 1.0 || p.z <= 0.0) { dkSsrCode = 2; return vec4(0.0); }
    vec2 mp = res * p.xy;
    float sz = dkHizLoad(mp, lv);
    xy = (floor(mp) + fo) * rinv + uvOff;
    vec3 bt = (vec3(xy, sz) - o) * invD;
    bt.z = d.z > 0.0 ? bt.z : 1e30;
    float tmin = min(min(bt.x, bt.y), bt.z);
    bool above = sz > p.z;
    bool skipped = floatBitsToUint(tmin) != floatBitsToUint(bt.z) && above;
    t = above ? tmin : t;
    p = o + t * d;
    if (skipped) { if (lv < top) { lv++; res *= 0.5; rinv *= 2.0; } }
    else { lv--; res *= 2.0; rinv *= 0.5; }
    if (lv < 0) return vec4(p, 1.0);
  }
  dkSsrCode = 3;
  return vec4(0.0);
}
// P: view-space position, R: reflected direction (view space), rough: GGX roughness.
// Returns rgb radiance + confidence.
vec4 dkSsrTrace(vec3 P, vec3 R, float rough) {
  if (R.z > 0.35) { dkSsrCode = 1; return vec4(0.0); }      // toward the camera: what it would hit is behind us
  float maxD = dkSsrP.z, near = dkSsrNearFar.x;
  float L = maxD;
  if (R.z > 1e-4) L = min(L, (-near * 1.02 - P.z) / R.z);   // stay in front of the near plane
  if (L <= 0.0) return vec4(0.0);
  vec4 c1 = dkSsrProj * vec4(P + R * L, 1.0);
  vec3 e = c1.xyz / c1.w * 0.5 + 0.5;
  vec3 o = vec3(gl_FragCoord.xy / dkSsrSize, gl_FragCoord.z);
  vec4 h = dkHizTrace(o, e - o);
  if (h.w < 0.5) return vec4(0.0);
  vec2 hp = h.xy * dkSsrSize;
  if (dot(hp - gl_FragCoord.xy, hp - gl_FragCoord.xy) < 2.25) { dkSsrCode = 4; return vec4(0.0); }   // the surface itself
  float zr = dkSsrViewZ(h.z), zs = dkSsrViewZ(dkHizLoad(hp, 0));
  if (zr - zs > dkSsrP.y + 0.01 * zs) { dkSsrCode = 5; return vec4(0.0); }   // passed behind an object, not a crossing
  vec4 hv = dkSsrInvProj * vec4(vec3(h.xy, h.z) * 2.0 - 1.0, 1.0);
  vec3 H = hv.xyz / hv.w;
  float b = length(H - P);
  if (b > maxD) { dkSsrCode = 6; return vec4(0.0); }
  dkSsrCode = 7;
  // glossy: the reflection cone's footprint at the hit, in pixels -> mip level of the colour copy
  float alpha = max(rough * rough, 0.001);
  float px = b * alpha * dkSsrProj[1][1] * 0.5 * dkSsrSize.y / max(-H.z, 0.05);
  float lod = clamp(log2(max(px, 1.0)), 0.0, dkSsrP.w);
  vec3 col = textureLod(dkSsrColor, h.xy, lod).rgb;
  vec2 ed = smoothstep(vec2(0.0), vec2(0.06), h.xy) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - h.xy);
  float conf = ed.x * ed.y * (1.0 - smoothstep(0.6 * maxD, maxD, b)) * (1.0 - smoothstep(0.1, 0.35, R.z));
  return vec4(max(col, vec3(0.0)), conf);
}
`;

// Hi-Z pyramid: level 0 copies the depth buffer, level k = min over the 3x3 texels of level k-1
// that its 2x2 block (plus the odd edge) covers - conservative, so no surface is ever skipped.
const VERT = `in vec3 position;\nvoid main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
function hizMaterial(level0) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    fragmentShader: `precision highp float;\nprecision highp int;\nuniform highp sampler2D tSrc;\nuniform ivec4 uSrc;\nout vec4 o;\nvoid main() {\n` + (level0
      ? `  o = vec4(texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).r, 0.0, 0.0, 1.0);\n}`
      : `  ivec2 b = ivec2(gl_FragCoord.xy) * 2;\n  float m = 1.0;\n  for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) m = min(m, texelFetch(tSrc, uSrc.xy + min(b + ivec2(x, y), uSrc.zw - 1), 0).r);\n  o = vec4(m, 0.0, 0.0, 1.0);\n}`),
    uniforms: { tSrc: { value: null }, uSrc: { value: new THREE.Vector4() } },
  });
}

export class SurfaceSSR {
  constructor(host, cin) {
    this.h = host; this.cin = cin; this.c = cin.c.ssr;
    this.state = { on: false };
    this.mats = new WeakMap();          // material -> eligible (bool)
    this.wrapped = new WeakSet();
    this.list = [];
    this.count = 0;
    const steps = Math.max(8, Math.min(256, this.c.steps | 0 || 32));   // Hi-Z traversal iterations
    this.steps = steps;
    this.uniforms = {
      dkSsrColor: { value: null }, dkSsrHiz: { value: null }, dkSsrSize: { value: new THREE.Vector2(1, 1) },
      dkSsrLv: { value: new Int32Array(64) }, dkSsrLevels: { value: 1 },        // ivec4[16]: three uploads it as-is (uniform4iv)
      dkSsrNearFar: { value: new THREE.Vector2(0.1, 1000) }, dkSsrProj: { value: new THREE.Matrix4() }, dkSsrInvProj: { value: new THREE.Matrix4() },
      dkSsrP: { value: new THREE.Vector4(this.c.maxRoughness ?? 0.35, this.c.thickness ?? 0.35, this.c.maxDistance ?? 250, 8) },
      dkSsrDebug: { value: cin.c.debug === 'ssr' ? 1 : 0 },
    };
  }

  eligibleMaterial(m) {
    let e = this.mats.get(m);
    if (e === undefined) {
      const flag = m?.userData?.dkSSR;
      e = isPhys(m) && opaque(m) && flag !== false && flag !== 0 && (flag ? true : (m.roughness ?? 1) <= (this.c.maxRoughness ?? 0.35));
      this.mats.set(m, e);
      if (e) this.wrap(m);
    }
    return e;
  }

  /** Second program variant of the same material (keeps every patch the scene / libraries made). */
  wrap(m) {
    if (this.wrapped.has(m)) return;
    this.wrapped.add(m);
    const self = this, st = this.state;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = function dkSsrPatch(shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      // both variants: identical positions (the overlay is depth-tested against the main pass)
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\ninvariant gl_Position;');
      if (!st.on) return;
      Object.assign(shader.uniforms, self.uniforms);
      shader.defines = { ...(shader.defines || {}), DK_SSR_PASS: 1, DK_SSR_STEPS: self.steps };
      let fs = shader.fragmentShader;
      fs = fs.replace('#include <common>', '#include <common>\n' + TRACE);
      // after the image-based light: radiance = what the environment map predicts for this pixel
      const hook = '#include <lights_fragment_end>';
      if (!fs.includes(hook)) return;   // not a lit standard shader we know: the variant draws black (adds nothing)
      fs = fs.replace(hook, /* glsl */ `
vec3 dkSsrDelta = vec3(0.0);
#ifdef USE_CLEARCOAT
vec3 dkSsrCcDelta = vec3(0.0);
#endif
{
  vec3 dkP = - vViewPosition;
  vec3 dkR = reflect( - geometryViewDir, geometryNormal );
  float dkRough = material.roughness;
  float dkFade = 1.0 - smoothstep( dkSsrP.x * 0.6, dkSsrP.x, dkRough );
  if ( dkFade > 0.0 ) {
    vec4 dkHit = dkSsrTrace( dkP, dkR, dkRough );
    dkSsrDelta = ( dkHit.rgb - radiance ) * dkHit.a * dkFade;
#ifdef USE_CLEARCOAT
    vec4 dkHitC = dkSsrTrace( dkP, reflect( - geometryViewDir, geometryClearcoatNormal ), material.clearcoatRoughness );
    dkSsrCcDelta = ( dkHitC.rgb - clearcoatRadiance ) * dkHitC.a * ( 1.0 - smoothstep( dkSsrP.x * 0.6, dkSsrP.x, material.clearcoatRoughness ) );
#endif
  }
}
${hook}
// DK_SSR_PASS: only the correction of the indirect specular light leaves this program
reflectedLight.directDiffuse = vec3( 0.0 ); reflectedLight.directSpecular = vec3( 0.0 ); reflectedLight.indirectDiffuse = vec3( 0.0 );
{
  vec3 dkSS = vec3( 0.0 ), dkMS = vec3( 0.0 );
  computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, dkSS, dkMS );
  reflectedLight.indirectSpecular = dkSsrDelta * dkSS;
}
#ifdef USE_CLEARCOAT
clearcoatSpecularDirect = vec3( 0.0 );
clearcoatSpecularIndirect = dkSsrCcDelta * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
#endif
#ifdef USE_SHEEN
sheenSpecularDirect = vec3( 0.0 ); sheenSpecularIndirect = vec3( 0.0 );
#endif
totalEmissiveRadiance = vec3( 0.0 );
if ( dkSsrDebug > 0.5 ) {
  // debug view: red = left the screen, yellow = out of iterations, magenta = itself, blue = passed behind,
  // cyan = too far, green = hit, grey = toward the camera / too rough
  vec3 dkC[8] = vec3[8]( vec3( 0.15 ), vec3( 0.3 ), vec3( 1.0, 0.0, 0.0 ), vec3( 1.0, 1.0, 0.0 ), vec3( 1.0, 0.0, 1.0 ), vec3( 0.0, 0.2, 1.0 ), vec3( 0.0, 1.0, 1.0 ), vec3( 0.0, 1.0, 0.0 ) );
  reflectedLight.indirectSpecular = dkC[ dkSsrCode ] * 4.0;
}
`);
      // no fog / dithering on a correction term (fog would be added twice)
      fs = fs.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n#undef USE_FOG\n#undef DITHERING\ngl_FragColor.a = 1.0;');
      shader.fragmentShader = fs;
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|dkssrw' + (st.on ? `|ssr${self.steps}` : ''); };
    m.needsUpdate = true;
  }

  /** Eligible visible meshes of the scene (marks them with SSR_LAYER). */
  collect(scene) {
    const list = [];
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || !o.material || o.userData?.dkLate || o.userData?.dkNoSSR || o.layers.isEnabled(30)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let any = false;
      for (const m of mats) if (this.eligibleMaterial(m)) any = true;
      if (!any) return;
      o.layers.enable(SSR_LAYER);
      list.push(o);
    });
    this.list = list;
    this.count = list.length;
    return list;
  }

  /** Mip-mapped half-float copy of the scene colour (the late pass' full-float copy has no mips). */
  colorCopy(srcRT) {
    const { renderer, gl } = this.h;
    const W = srcRT.width, H = srcRT.height;
    if (!this.colorRT || this.colorRT.width !== W || this.colorRT.height !== H) {
      this.colorRT?.dispose();
      this.colorRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      this.colorRT.texture.generateMipmaps = true;
      renderer.initRenderTarget(this.colorRT);
      this.uniforms.dkSsrP.value.w = Math.floor(Math.log2(Math.max(W, H)));
    }
    const src = renderer.properties.get(srcRT).__webglFramebuffer;
    renderer.state.setScissorTest(false);
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, renderer.properties.get(this.colorRT).__webglFramebuffer);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    const tex = renderer.properties.get(this.colorRT.texture).__webglTexture;
    renderer.state.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    renderer.state.bindTexture(gl.TEXTURE_2D, null);
    return this.colorRT.texture;
  }

  /** Build the min-depth pyramid of this pass' depth copy into one atlas (levels side by side). */
  buildHiZ(depthTex, W, H) {
    const { renderer, gl } = this.h;
    if (!this.hiz || this.hizW !== W || this.hizH !== H) {
      this.hiz?.dispose(); (this.hizTmp || []).forEach((r) => r.dispose());
      const lv = [{ x: 0, y: 0, w: W, h: H }];
      let y = 0, w = W, h = H;
      while ((w > 1 || h > 1) && lv.length < 16) {
        w = Math.ceil(w / 2); h = Math.ceil(h / 2);
        lv.push({ x: W, y, w, h }); y += h;
      }
      this.levels = lv;
      const mk = (w2, h2) => new THREE.WebGLRenderTarget(w2, h2, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.hiz = mk(W + lv[1].w, Math.max(H, y));
      this.hizTmp = lv.slice(1).map((l) => mk(l.w, l.h));
      this.hizW = W; this.hizH = H;
      this.pass0 = this.pass0 || this.h.makePass(hizMaterial(true));
      this.passK = this.passK || this.h.makePass(hizMaterial(false));
      renderer.initRenderTarget(this.hiz); this.hizTmp.forEach((r) => renderer.initRenderTarget(r));
      lv.forEach((l, i) => this.uniforms.dkSsrLv.value.set([l.x, l.y, l.w, l.h], 4 * i));
      this.uniforms.dkSsrLevels.value = lv.length;
    }
    // level 0: the depth buffer into the atlas' left part
    this.hiz.viewport.set(0, 0, W, H);
    this.pass0.material.uniforms.tSrc.value = depthTex;
    this.h.drawPass(this.pass0, this.hiz);
    this.hiz.viewport.set(0, 0, this.hiz.width, this.hiz.height);
    // level k from level k-1 (read the atlas, write a small target, copy it into the atlas)
    const dst = renderer.properties.get(this.hiz).__webglFramebuffer;
    for (let k = 1; k < this.levels.length; k++) {
      const src = this.levels[k - 1], l = this.levels[k], tmp = this.hizTmp[k - 1];
      const u = this.passK.material.uniforms;
      u.tSrc.value = this.hiz.texture; u.uSrc.value.set(src.x, src.y, src.w, src.h);
      this.h.drawPass(this.passK, tmp);
      renderer.state.setScissorTest(false);
      renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, renderer.properties.get(tmp).__webglFramebuffer);
      renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
      gl.blitFramebuffer(0, 0, l.w, l.h, l.x, l.y, l.x + l.w, l.y + l.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }
    return this.hiz.texture;
  }

  /**
   * Draw the correction of every eligible object into `target` (the scene target, depth attached).
   * colorRT / depthRT: the late pass' copies of this pass' colour and depth.
   */
  render(target, colorRT, depthRT) {
    const list = this.list;
    if (!list.length) return;
    const { renderer, scene, camera } = this.h;
    const u = this.uniforms;
    u.dkSsrColor.value = this.colorCopy(colorRT);
    u.dkSsrHiz.value = this.buildHiZ(depthRT.depthTexture, target.width, target.height);
    u.dkSsrSize.value.set(target.width, target.height);
    u.dkSsrNearFar.value.set(camera.near, camera.far);
    u.dkSsrProj.value.copy(camera.projectionMatrix);
    u.dkSsrInvProj.value.copy(camera.projectionMatrix).invert();
    // materials of the drawn objects: eligible ones switch to the SSR program variant, the others hide
    const mats = new Set(), hidden = [];
    for (const o of list) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (mats.has(m)) continue;
      mats.add(m);
      if (!this.eligibleMaterial(m) && m.visible) { m.visible = false; hidden.push(m); }
    }
    const saved = [];
    for (const m of mats) {
      if (!this.mats.get(m)) continue;
      saved.push([m, m.blending, m.blendSrc, m.blendDst, m.blendEquation, m.depthWrite, m.depthFunc, m.blendSrcAlpha, m.blendDstAlpha]);
      m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
      m.depthWrite = false; m.depthFunc = THREE.LessEqualDepth;
      m.needsUpdate = true;
    }
    this.state.on = true;
    const mask = camera.layers.mask, bg = scene.background, auto = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
    camera.layers.set(SSR_LAYER); scene.background = null; renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
    try { renderer.setRenderTarget(target); renderer.render(scene, camera); }
    finally {
      this.state.on = false;
      camera.layers.mask = mask; scene.background = bg; renderer.shadowMap.autoUpdate = auto; renderer.autoClear = ac;
      for (const [m, b, s, d, e, dw, df, sa, da] of saved) {
        m.blending = b; m.blendSrc = s; m.blendDst = d; m.blendEquation = e; m.depthWrite = dw; m.depthFunc = df; m.blendSrcAlpha = sa; m.blendDstAlpha = da;
        m.needsUpdate = true;
      }
      for (const m of hidden) m.visible = true;
    }
  }
}
