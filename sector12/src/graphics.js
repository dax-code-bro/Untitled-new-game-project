// Rendering pipeline: quality presets, cascaded shadows, atmospheric sky + clouds + stars,
// image-based lighting from the sky, exponential height fog, and post-processing.
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, csm: 0, shadowSize: 1024, post: false, msaa: 0, smaa: false, bloom: false, grass: 0, texSize: 256, flora: 0.6, clouds: false },
  medium: { label: 'Medium', pixelRatio: 1, csm: 2, shadowSize: 1024, post: true, msaa: 0, smaa: true, bloom: true, grass: 0.55, texSize: 512, flora: 0.8, clouds: true },
  high: { label: 'High', pixelRatio: 1, csm: 3, shadowSize: 2048, post: true, msaa: 4, smaa: false, bloom: true, grass: 1, texSize: 512, flora: 1, clouds: true },
  ultra: { label: 'Ultra', pixelRatio: 2, csm: 4, shadowSize: 4096, post: true, msaa: 4, smaa: true, bloom: true, grass: 1.6, texSize: 1024, flora: 1.25, clouds: true },
};

// ---------------------------------------------------------------- global shader chunks: height fog with sun in-scatter
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef HEIGHT_FOG
    varying vec3 vFogWorld;
  #endif
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef HEIGHT_FOG
    vec4 fogWP = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      fogWP = instanceMatrix * fogWP;
    #endif
    vFogWorld = ( modelMatrix * fogWP ).xyz;
  #endif
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  #ifdef HEIGHT_FOG
    varying vec3 vFogWorld;
    uniform vec3 fogSunDir;
    uniform vec3 fogSunColor;
    uniform float fogHeightK;
    uniform float fogBase;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #if defined( HEIGHT_FOG ) && defined( FOG_EXP2 )
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length( fogRay );
    float fy0 = max( cameraPosition.y - fogBase, -300.0 ), fy1 = max( vFogWorld.y - fogBase, -300.0 );
    float fdy = fy1 - fy0;
    float fogH = abs( fdy ) > 1.0 ? ( exp( -fogHeightK * fy0 ) - exp( -fogHeightK * fy1 ) ) / ( fogHeightK * fdy ) : exp( -fogHeightK * fy0 );
    float fogFactor = 1.0 - exp( - fogDensity * fogDist * clamp( fogH, 0.02, 40.0 ) );
    float fogSun = pow( max( dot( fogRay / max( fogDist, 0.001 ), fogSunDir ), 0.0 ), 10.0 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, fogSunColor, fogSun * 0.7 ), fogFactor );
  #else
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;

// ---------------------------------------------------------------- sky shader (shared by the dome and the env-map capture)
const SKY_FRAG = `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 moonDir;
uniform float night; uniform float haze; uniform float time; uniform float sunsetK;
varying vec3 vDir;
float h21(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float up = d.y;
  float hz = 1.0 - clamp(up, 0.0, 1.0);
  vec3 col = mix(zenith, horizon, pow(hz, 4.0));
  // warm band towards the sun near the horizon at sunrise / sunset
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
  col = mix(col, sunColor * 1.15, sunsetK * pow(hz, 6.0) * pow(toward, 3.0));
  if (up < 0.0) col = mix(horizon, ground, clamp(-up * 4.0, 0.0, 1.0));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 6.0) * 0.12 + pow(s, 64.0) * 0.35) * (1.0 - haze * 0.6); // mie glow
  col += sunColor * smoothstep(0.99955, 0.99975, s) * 18.0 * (1.0 - haze);           // sun disc
  // night: stars + moon
  if (night > 0.0 && up > 0.0) {
    vec3 sp = floor(d * 380.0);
    float st = step(0.9975, h21(sp)) * (0.6 + 0.4 * sin(time * 2.0 + h21(sp + 7.0) * 40.0));
    col += vec3(st) * night * (1.0 - haze) * smoothstep(0.0, 0.2, up) * 1.4;
    float m = max(dot(d, moonDir), 0.0);
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99935, 0.9995, m) * 2.5 + pow(m, 60.0) * 0.12) * night;
  }
  col = mix(col, horizon, haze * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

function skyMaterial(uniforms) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
}

// ---------------------------------------------------------------- clouds
const CLOUD_FRAG = `
uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ambient; uniform float cover; uniform float time; uniform vec2 offset; uniform vec3 fogCol; uniform float camY;
varying vec2 vUv; varying vec3 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main(){
  vec2 p = (vW.xz + offset) / 2600.0;
  float base = fbm(p + vec2(time * 0.004, time * 0.002));
  float detail = fbm(p * 3.1 - vec2(time * 0.01, 0.0));
  float d = smoothstep(1.0 - cover, 1.0 - cover + 0.35, base * 0.75 + detail * 0.35);
  if (d < 0.01) discard;
  // fake self-shadow: sample towards the sun
  float toward = fbm(p + sunDir.xz * 0.06 + vec2(time * 0.004, time * 0.002)) * 0.75 + detail * 0.35;
  float shade = clamp(1.0 - (toward - (1.0 - cover)) * 1.4, 0.25, 1.0);
  vec3 lit = ambient * 0.8 + sunColor * shade * max(sunDir.y + 0.15, 0.0) * 1.2;
  float dist = length(vW.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(14000.0, 26000.0, dist);
  vec3 col = mix(lit, fogCol, smoothstep(6000.0, 24000.0, dist) * 0.8);
  gl_FragColor = vec4(col, d * 0.92 * fade);
}`;

export class Graphics {
  constructor(renderer, scene, camera, qualityKey = 'high') {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.q = QUALITY[qualityKey] || QUALITY.high;
    this.qualityKey = qualityKey;
    this.patched = new WeakSet();
    this.time = 0;
    renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.pixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    this.fogUniforms = {
      fogSunDir: { value: new THREE.Vector3(0, 1, 0) }, fogSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      fogHeightK: { value: 0.0016 }, fogBase: { value: 0 },
    };
    scene.fog = new THREE.FogExp2(0xbfd2e2, 0.00012);

    // sky dome + env capture scene
    const C = (h) => new THREE.Color(h);
    this.skyU = {
      zenith: { value: C(0x3f7fcf) }, horizon: { value: C(0xc4d8e8) }, ground: { value: C(0x4a5058) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: C(0xfff1d6) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
      night: { value: 0 }, haze: { value: 0 }, time: { value: 0 }, sunsetK: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(this.skyU));
    this.sky.scale.setScalar(50000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial(this.skyU)));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envT = 0;
    this.envRT = null;
    scene.environmentIntensity = 0.9;

    // clouds
    if (this.q.clouds) {
      this.cloudU = {
        sunDir: this.skyU.sunDir, sunColor: this.skyU.sunColor, ambient: { value: new THREE.Color(0.6, 0.65, 0.7) },
        cover: { value: 0.45 }, time: { value: 0 }, offset: { value: new THREE.Vector2() }, fogCol: this.skyU.horizon, camY: { value: 0 },
      };
      this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), new THREE.ShaderMaterial({
        uniforms: this.cloudU, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: CLOUD_FRAG,
      }));
      this.clouds.rotation.x = -Math.PI / 2;
      this.clouds.renderOrder = -5;
      this.clouds.frustumCulled = false;
      scene.add(this.clouds);
    }

    // lights
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4036, 0.25);
    scene.add(this.hemi);
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    if (this.q.csm) {
      this.csm = new CSM({
        maxFar: 700, cascades: this.q.csm, mode: 'practical', parent: scene, shadowMapSize: this.q.shadowSize,
        lightDirection: this.sunDir.clone().negate(), camera, lightIntensity: 3, lightNear: 1, lightFar: 3000, lightMargin: 200, shadowBias: -0.0002,
      });
      this.csm.fade = true;
      for (const l of this.csm.lights) { l.shadow.normalBias = 0.04; }
    } else {
      this.sun = new THREE.DirectionalLight(0xffffff, 3);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      const sc = this.sun.shadow.camera;
      sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 1; sc.far = 600;
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
      scene.add(this.sun, this.sun.target);
    }

    // post-processing
    this.grade = {
      saturation: { value: 1.05 }, contrast: { value: 1.06 }, warmth: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 },
      time: { value: 0 }, damage: { value: 0 }, cold: { value: 0 }, aberration: { value: 0.0012 },
    };
    if (this.q.post) this.buildComposer();
    this.resize(innerWidth, innerHeight);
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.55, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.gradePass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, ...this.grade },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation, contrast, warmth, vignette, grain, time, damage, cold, aberration; varying vec2 vUv;
        float rnd(vec2 p){ return fract(sin(dot(p + time, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 c = vUv - 0.5;
          float ab = aberration * (1.0 + damage * 4.0) * dot(c, c) * 4.0;
          vec3 col = vec3(texture2D(tDiffuse, vUv + c * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ab).b);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, saturation * (1.0 - cold * 0.5) * (1.0 - damage * 0.6));
          col = (col - 0.18) * contrast + 0.18;
          col *= mix(vec3(1.0), vec3(1.06, 1.0, 0.92), warmth) * mix(vec3(1.0), vec3(0.9, 0.97, 1.08), cold);
          col = max(col, 0.0);
          float v = smoothstep(0.85, 0.2, length(c) * (1.0 + vignette));
          col *= mix(1.0, v, vignette * 1.6);
          col = mix(col, col * vec3(1.4, 0.4, 0.4), damage * smoothstep(0.2, 0.75, length(c)));
          col += (rnd(vUv * 917.0) - 0.5) * grain * (0.4 + l);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
    if (this.q.smaa) this.composer.addPass(new SMAAPass(size.x, size.y));
  }

  resize(w, h) {
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.csm) this.csm.updateFrustums();
  }

  // ---------------------------------------------------------------- material patching (CSM + height fog + custom hooks)
  patch(mat) {
    if (!mat || this.patched.has(mat)) return;
    this.patched.add(mat);
    if (mat.isShaderMaterial || mat.isPointsMaterial || mat.isLineBasicMaterial || mat.isSpriteMaterial) return;
    const hooks = [];
    const own = mat.userData.hooks || [];
    const lit = mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial || mat.isMeshPhysicalMaterial;
    if (lit && this.csm) {
      this.csm.setupMaterial(mat);
      hooks.push(mat.onBeforeCompile);
    }
    if (mat.fog !== false) {
      mat.defines = mat.defines || {};
      mat.defines.HEIGHT_FOG = '';
      const fu = this.fogUniforms;
      hooks.push((s) => Object.assign(s.uniforms, fu));
    }
    hooks.push(...own);
    mat.onBeforeCompile = (s, r) => { for (const h of hooks) h(s, r); };
    const key = (mat.userData.cacheKey || '') + (this.csm ? 'csm' : '') + 'hf';
    mat.customProgramCacheKey = () => key;
    mat.needsUpdate = true;
  }

  // how bright unlit particles (smoke, dust, blood) should be under the current sky
  particleLight() {
    const c = this._pl || (this._pl = new THREE.Color());
    const t = this._plt || (this._plt = new THREE.Color());
    c.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 1.6);
    if (this.sun) { t.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.22); c.add(t); }
    c.r = Math.min(1.25, Math.max(0.04, c.r)); c.g = Math.min(1.25, Math.max(0.04, c.g)); c.b = Math.min(1.25, Math.max(0.05, c.b));
    return c;
  }

  patchScene(root = this.scene) {
    root.traverse((o) => {
      if (!o.material) return;
      if (Array.isArray(o.material)) o.material.forEach((m) => this.patch(m)); else this.patch(o.material);
    });
  }

  // ---------------------------------------------------------------- atmosphere (driven by Environment)
  // a: {sunDir, sunColor, sunI, zenith, horizon, ambient, night, haze, fogDensity, sunsetK, overcast, moonDir}
  setAtmosphere(a, dt, focus) {
    this.time += dt;
    const U = this.skyU;
    U.zenith.value.copy(a.zenith); U.horizon.value.copy(a.horizon); U.sunColor.value.copy(a.sunColor);
    U.sunDir.value.copy(a.sunDir); U.moonDir.value.copy(a.moonDir); U.night.value = a.night; U.haze.value = a.haze;
    U.time.value = this.time; U.sunsetK.value = a.sunsetK;
    U.ground.value.copy(a.horizon).multiplyScalar(0.45);
    this.sky.position.copy(this.camera.position);
    const fog = this.scene.fog;
    fog.color.copy(a.horizon);
    fog.density = a.fogDensity;
    this.fogUniforms.fogSunDir.value.copy(a.sunDir);
    this.fogUniforms.fogSunColor.value.copy(a.sunColor).multiplyScalar(0.9);
    this.fogUniforms.fogHeightK.value = a.fogHeightK;
    this.fogUniforms.fogBase.value = a.fogBase;
    // the light comes from the sun by day and the moon by night
    const lightDir = a.night > 0.5 ? a.moonDir : a.sunDir;
    const ld = lightDir.clone(); ld.y = Math.max(ld.y, 0.08); ld.normalize();
    if (this.csm) {
      this.csm.lightDirection.copy(ld).negate();
      for (const l of this.csm.lights) { l.color.copy(a.lightColor); l.intensity = a.sunI; }
      this.csm.update();
    } else {
      this.sun.position.copy(focus).addScaledVector(ld, 300);
      this.sun.target.position.copy(focus);
      this.sun.color.copy(a.lightColor);
      this.sun.intensity = a.sunI;
    }
    this.hemi.color.copy(a.zenith).lerp(new THREE.Color(1, 1, 1), 0.4);
    this.hemi.groundColor.copy(a.ambientGround);
    this.hemi.intensity = a.hemiI;
    this.scene.environmentIntensity = a.envI;
    // clouds
    if (this.clouds) {
      this.clouds.position.set(this.camera.position.x, 2600, this.camera.position.z);
      this.cloudU.time.value = this.time;
      this.cloudU.cover.value = a.cloudCover;
      this.cloudU.ambient.value.copy(a.zenith).lerp(a.horizon, 0.5);
    }
    // re-capture the sky for reflections every few seconds
    // only when the sky has visibly changed (sun moved, weather rolled in), reusing one target
    this.envT -= dt;
    const sig = a.sunDir.x * 7 + a.sunDir.y * 13 + a.sunDir.z * 17 + a.night * 3 + a.haze * 5 + (a.cloudCover || 0) * 2;
    if (this.envT <= 0 && (this.envSig === undefined || Math.abs(sig - this.envSig) > 0.08)) {
      this.envT = 4;
      this.envSig = sig;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      this.scene.environment = this.envRT.texture;
    }
    this.grade.warmth.value = a.sunsetK * 0.6;
  }

  render() {
    this.grade.time.value = this.time;
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.csm) { this.csm.remove(); this.csm.dispose(); }
    if (this.envRT) this.envRT.dispose();
    this.pmrem.dispose();
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
  }
}
