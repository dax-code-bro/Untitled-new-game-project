// Sky dome + matching aerial-perspective fog (import from 'dk/atmosphere.js').
//
// One set of uniforms drives both the sky and the fog that is mixed into every
// lit material, so distant mountains melt into exactly the colour of the sky
// behind them (including the warm glow around the sun). All colours are linear
// HDR values (the runtime tone-maps later).
//
//   const atmo = createAtmosphere(THREE, { sunDirection, ... });
//   scene.add(atmo.sky);
//   ... build the world ...
//   atmo.apply(scene);           // patch fog into every material (call at end of setup)
//   atmo.uniforms.dkTime.value = t;   // in update(t): drifts the clouds

export const ATMOSPHERE_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 dkSunDir;
uniform vec3 dkSunColor;
uniform vec3 dkZenith;
uniform vec3 dkHorizon;
uniform vec3 dkGroundHaze;
uniform float dkFogDensity;
uniform float dkFogFalloff;
uniform float dkFogBase;
uniform float dkCloudCover;
uniform float dkTime;
uniform sampler2D dkNoiseTex;
`;

export const ATMOSPHERE_GLSL = /* glsl */ `
// hash without sine (Dave Hoskins) - identical results on every GPU / SwiftShader
float dkHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float dkValueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dkHash12(i), dkHash12(i + vec2(1.0, 0.0)), u.x),
             mix(dkHash12(i + vec2(0.0, 1.0)), dkHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// 5-octave fbm, pre-baked into a tileable texture (one texture tap is far
// cheaper than 20 hash evaluations on a CPU rasteriser); a second, rotated tap
// at ~4.3x frequency adds fine detail where the sky is magnified.
float dkFbm(vec2 p) {
  float a = texture(dkNoiseTex, p * 0.25).r;
  float b = texture(dkNoiseTex, mat2(0.8, 0.6, -0.6, 0.8) * p * 1.07 + 0.37).r;
  return a * 0.85 + (b - 0.5) * 0.2 + 0.06;
}
// sky without sun disk and clouds: also used as the fog colour
vec3 dkAerial(vec3 d) {
  float y = max(d.y, 0.0);
  float iy = 1.0 - y, iy2 = iy * iy;
  float hz = iy2 * iy2 * iy;                                  // (1-y)^5 without pow()
  vec3 col = mix(dkZenith, dkHorizon, hz);
  col = mix(col, dkGroundHaze, 1.0 - smoothstep(-0.12, 0.0, d.y));
  float mu = max(dot(d, dkSunDir), 0.0);
  float mu2 = mu * mu, mu6 = mu2 * mu2 * mu2, mu12 = mu6 * mu6, mu48 = mu12 * mu12 * mu12 * mu12;
  col += dkSunColor * (0.06 * mu6 + 0.12 * mu48) * (0.35 + 0.65 * hz);
  return col;
}
// sky with clouds, without the sun disk (reflections add their own highlight)
vec3 dkSkyNoSun(vec3 d) {
  vec3 col = dkAerial(d);
  float mu = dot(d, dkSunDir);
  // clouds on a virtual plane
  if (d.y > 0.0 && dkCloudCover > 0.0) {
    vec2 p = d.xz / (d.y + 0.08) * 1.6 + vec2(dkTime * 0.012, dkTime * 0.004);
    float n = dkFbm(p);
    float cov = smoothstep(1.0 - dkCloudCover, 1.0 - dkCloudCover + 0.35, n);
    float fade = smoothstep(0.0, 0.18, d.y);
    // light the cloud: a second sample toward the sun gives cheap self-shadowing
    float n2 = dkFbm(p + dkSunDir.xz * 0.35);
    float lit = clamp(0.55 + (n - n2) * 2.5, 0.0, 1.0);
    vec3 cloudCol = mix(dkHorizon * 0.55 + dkZenith * 0.15, dkSunColor * 0.16 + dkHorizon * 0.5, lit);
    cloudCol += dkSunColor * 0.25 * pow(max(mu, 0.0), 12.0) * (1.0 - cov * 0.6); // silver lining
    col = mix(col, cloudCol, cov * fade * 0.92);
  }
  return col;
}
vec3 dkSky(vec3 d) {
  // sun disk with soft limb
  float disk = smoothstep(0.99955, 0.99975, dot(d, dkSunDir));
  return dkSkyNoSun(d) + dkSunColor * disk * 18.0;
}
// fraction of light lost to fog between the camera and a world point
float dkFogAmount(vec3 camPos, vec3 worldPos) {
  vec3 ray = worldPos - camPos;
  float dist = length(ray);
  float k = dkFogFalloff;
  float t = k * ray.y;
  float integ = abs(t) > 1e-3 ? (1.0 - exp(-t)) / t : 1.0 - 0.5 * t;
  float od = dkFogDensity * exp(-k * (camPos.y - dkFogBase)) * dist * integ;
  return 1.0 - exp(-max(od, 0.0));
}
vec3 dkApplyFog(vec3 color, vec3 camPos, vec3 worldPos) {
  vec3 dir = normalize(worldPos - camPos);
  return mix(color, dkAerial(dir), dkFogAmount(camPos, worldPos));
}
`;

export function createAtmosphere(THREE, opts = {}) {
  const sunDir = (opts.sunDirection || new THREE.Vector3(0.5, 0.3, -0.6)).clone().normalize();
  const uniforms = {
    dkSunDir: { value: sunDir },
    dkSunColor: { value: new THREE.Color(...(opts.sunColor || [10, 8.2, 6.2])) },
    dkZenith: { value: new THREE.Color(...(opts.zenith || [0.16, 0.32, 0.72])) },
    dkHorizon: { value: new THREE.Color(...(opts.horizon || [0.78, 0.82, 0.88])) },
    dkGroundHaze: { value: new THREE.Color(...(opts.groundHaze || [0.45, 0.5, 0.55])) },
    dkFogDensity: { value: opts.fogDensity ?? 0.0012 },
    dkFogFalloff: { value: opts.fogFalloff ?? 0.012 },
    dkFogBase: { value: opts.fogBase ?? 0 },
    dkCloudCover: { value: opts.cloudCover ?? 0.45 },
    dkTime: { value: 0 },
  };

  uniforms.dkNoiseTex = { value: makeNoiseTexture(THREE, opts.noiseSeed ?? 1) };
  const radius = opts.radius ?? 9000;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 32),
    new THREE.ShaderMaterial({
      name: 'DKSky',
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;   // on the far plane
        }`,
      fragmentShader: ATMOSPHERE_UNIFORMS_GLSL + ATMOSPHERE_GLSL + /* glsl */ `
        varying vec3 vDir;
        void main() { gl_FragColor = vec4(dkSky(normalize(vDir)), 1.0); }`,
    }),
  );
  sky.name = 'dk-sky';
  sky.frustumCulled = false;
  sky.renderOrder = 10000;     // drawn after all opaque geometry: only uncovered pixels pay for the sky shader
  sky.onBeforeRender = (renderer, scene, camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };

  // Patch fog into a built-in material (MeshStandardMaterial etc.).
  function patchMaterial(m) {
    if (!m || m.userData.dkAtmo || m === sky.material || m.fog === false) return;
    if (m.isShaderMaterial || m.isRawShaderMaterial) return; // custom shaders include ATMOSPHERE_GLSL themselves
    m.userData.dkAtmo = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev?.call(m, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vDkWorld;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvDkWorld = cameraPosition + (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec3 vDkWorld;\n' + ATMOSPHERE_UNIFORMS_GLSL + ATMOSPHERE_GLSL)
        .replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb = dkApplyFog(gl_FragColor.rgb, cameraPosition, vDkWorld);\n#endif');
    };
    const prevKey = m.customProgramCacheKey?.bind(m);
    m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|dk-atmo';
    m.needsUpdate = true;
  }

  function apply(scene) {
    // three only defines USE_FOG when scene.fog is set; the colour/density there are unused.
    if (!scene.fog) scene.fog = new THREE.FogExp2(0x000000, 0.0);
    scene.traverse((o) => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(patchMaterial);
    });
  }

  return { uniforms, sky, apply, patchMaterial, sunDirection: sunDir };
}

// Tileable 5-octave value-noise fbm (base lattice period 4 per tile), 256x256 R8.
function makeNoiseTexture(THREE, seed) {
  const N = 256;
  const hash = (x, y, o) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(o + seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const f = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, amp = 0.5;
    for (let o = 0; o < 5; o++) {
      const P = 4 << o;                       // lattice cells across the tile
      const fx = (x / N) * P, fy = (y / N) * P;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const ux = fx - ix, uy = fy - iy;
      const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const v00 = hash(ix % P, iy % P, o), v10 = hash((ix + 1) % P, iy % P, o);
      const v01 = hash(ix % P, (iy + 1) % P, o), v11 = hash((ix + 1) % P, (iy + 1) % P, o);
      s += amp * ((v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy);
      amp *= 0.5;
    }
    f[y * N + x] = s;
  }
  // stretch to 0.08..0.92 (averaging octaves squeezes value noise toward the middle)
  let lo = Infinity, hi = -Infinity;
  for (const v of f) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const data = new Uint8Array(N * N);
  for (let i = 0; i < f.length; i++) data[i] = Math.round((0.08 + 0.84 * (f[i] - lo) / (hi - lo)) * 255);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
