// FX library - the light rig every FX shader reads (shared uniforms, updated once per frame).
//
// FX particles and volumes are custom shaders (they scatter light, they are not surfaces), so
// they cannot use three.js' light loop. The rig finds the scene's lights and turns them into a
// few uniforms in the SAME units the scene's lit materials see:
//   sun:    the first shadow-casting DirectionalLight (or the brightest one): direction toward the
//           light, colour * intensity (irradiance on a surface facing it);
//   sky / ground: radiance of the upper / lower hemisphere: from scene.environment's source
//           equirect (scene.background when it is the same HDRI DataTexture) averaged once,
//           times scene.environmentIntensity; else HemisphereLight / AmbientLight colours;
//   points: up to 4 PointLights (lamps, fire), nearest the effect, with their distance falloff.
// Scenes can override any of it: fx.light.set({ sunDir, sun, sky, ground }).
import * as THREE from 'three';

export const MAX_POINTS = 4;

export function makeLightUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uSunCol: { value: new THREE.Vector3(3, 2.9, 2.7) },
    uSkyCol: { value: new THREE.Vector3(0.35, 0.42, 0.55) },
    uGroundCol: { value: new THREE.Vector3(0.12, 0.11, 0.09) },
    uPointPos: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4(0, -1e5, 0, 1)) },   // xyz, range
    uPointCol: { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4(0, 0, 0, 2)) },       // rgb*intensity, decay
    uExposureHint: { value: 1 },
  };
}

/** GLSL shared by FX shaders: declarations + helpers for the rig. */
export const LIGHT_GLSL = /* glsl */`
uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol;
uniform vec4 uPointPos[${MAX_POINTS}];
uniform vec4 uPointCol[${MAX_POINTS}];
// Henyey-Greenstein phase (per steradian)
float fxHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
// irradiance from the point lights at p (three.js physical falloff: 1/d^2 windowed by the range)
vec3 fxPointIrr(vec3 p, out vec3 dirSum) {
  vec3 e = vec3(0.0); dirSum = vec3(0.0);
  for (int i = 0; i < ${MAX_POINTS}; i++) {
    vec3 d = uPointPos[i].xyz - p; float dl = length(d);
    float range = uPointPos[i].w;
    float w = 1.0 / max(dl * dl, 0.01);
    if (range > 0.0) { float r = dl / range; float c = clamp(1.0 - r * r * r * r, 0.0, 1.0); w *= c * c; }
    vec3 c = uPointCol[i].rgb * w;
    e += c; dirSum += normalize(d) * dot(c, vec3(0.3333));
  }
  return e;
}
`;

function halfToFloat(h) { return THREE.DataUtils.fromHalfFloat(h); }

/** Cosine-weighted mean radiance of the upper and lower hemispheres of an equirect DataTexture. */
export function hemisphereAverages(tex) {
  const img = tex?.image;
  if (!img?.data || !img.width) return null;
  const W = img.width, H = img.height, d = img.data;
  const half = d instanceof Uint16Array, ch = d.length / (W * H);
  if (ch < 3) return null;
  const up = [0, 0, 0], dn = [0, 0, 0];
  let wu = 0, wd = 0;
  const sx = Math.max(1, Math.floor(W / 128)), sy = Math.max(1, Math.floor(H / 64));
  for (let y = 0; y < H; y += sy) {
    // the data rows run top (zenith) to bottom as decoded from the file; flipY only acts on upload
    const v = (y + 0.5) / H;
    const elev = (0.5 - v) * Math.PI;
    const s = Math.sin(elev), c = Math.cos(elev);
    const w = Math.abs(s) * c;           // cos(theta) * solid-angle row weight
    for (let x = 0; x < W; x += sx) {
      const i = (y * W + x) * ch;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (half) { r = halfToFloat(r); g = halfToFloat(g); b = halfToFloat(b); }
      if (!(r < 60000 && g < 60000 && b < 60000)) continue;    // skip the sun if it is still in the map
      if (s >= 0) { up[0] += r * w; up[1] += g * w; up[2] += b * w; wu += w; } else { dn[0] += r * w; dn[1] += g * w; dn[2] += b * w; wd += w; }
    }
  }
  if (wu > 0) for (let k = 0; k < 3; k++) up[k] /= wu;
  if (wd > 0) for (let k = 0; k < 3; k++) dn[k] /= wd;
  return { sky: up, ground: dn };
}

export class LightRig {
  constructor(ctx) {
    this.ctx = ctx;
    this.uniforms = makeLightUniforms();
    this.over = {};
    this.extraPoints = [];         // effect-owned lights (fire): { light, weight }
    this.envKey = null;
    this.envAvg = null;
  }
  /** Overrides: { sunDir:[x,y,z] (toward the light), sun:[r,g,b] irradiance, sky:[..], ground:[..] } (null clears) */
  set(o = {}) { Object.assign(this.over, o); return this; }
  addPoint(light) { if (!this.extraPoints.includes(light)) this.extraPoints.push(light); }

  /** Re-read the scene's lights (call once per frame, before FX updates). `focus` = where the effects are. */
  update(focus) {
    const { scene } = this.ctx;
    const u = this.uniforms;
    let sun = null, best = -1, hemi = null, amb = null;
    const points = [];
    scene.traverseVisible((o) => {
      if (!o.isLight) return;
      if (o.isDirectionalLight) {
        const s = (o.castShadow ? 1e6 : 0) + o.intensity;
        if (s > best) { best = s; sun = o; }
      } else if (o.isHemisphereLight) hemi = o;
      else if (o.isAmbientLight) amb = o;
      else if (o.isPointLight && o.intensity > 0) points.push(o);
    });
    // sun
    if (this.over.sunDir) u.uSunDir.value.set(...this.over.sunDir).normalize();
    else if (sun) {
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
      u.uSunDir.value.setFromMatrixPosition(sun.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld)).normalize();
    }
    if (this.over.sun) u.uSunCol.value.set(...this.over.sun);
    else if (sun) u.uSunCol.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
    else u.uSunCol.value.set(0, 0, 0);
    // sky / ground radiance
    let sky = null, ground = null;
    const envSrc = scene.background?.isDataTexture ? scene.background : (scene.environment?.isDataTexture ? scene.environment : null);
    if (envSrc) {
      if (envSrc !== this.envKey) { this.envKey = envSrc; this.envAvg = hemisphereAverages(envSrc); }
      if (this.envAvg) {
        const k = scene.environment ? (scene.environmentIntensity ?? 1) : (scene.backgroundIntensity ?? 1);
        sky = this.envAvg.sky.map((x) => x * k); ground = this.envAvg.ground.map((x) => x * k);
      }
    }
    if (!sky && hemi) {
      const k = hemi.intensity;
      sky = [hemi.color.r * k, hemi.color.g * k, hemi.color.b * k]; ground = [hemi.groundColor.r * k, hemi.groundColor.g * k, hemi.groundColor.b * k];
    }
    if (amb) {
      const a = [amb.color.r * amb.intensity, amb.color.g * amb.intensity, amb.color.b * amb.intensity];
      sky = sky ? sky.map((x, i) => x + a[i]) : a; ground = ground ? ground.map((x, i) => x + a[i]) : a.slice();
    }
    if (!sky) { const s = u.uSunCol.value; sky = [s.x * 0.1, s.y * 0.12, s.z * 0.16]; ground = [s.x * 0.03, s.y * 0.028, s.z * 0.024]; }
    if (this.over.sky) sky = this.over.sky;
    if (this.over.ground) ground = this.over.ground;
    u.uSkyCol.value.set(...sky); u.uGroundCol.value.set(...ground);
    // points: effect lights first, then the nearest scene lights
    const all = [...this.extraPoints.filter((l) => l.visible !== false && l.intensity > 0), ...points.filter((p) => !this.extraPoints.includes(p))];
    const f = focus ? new THREE.Vector3(...focus) : null;
    const wp = new THREE.Vector3();
    const scored = all.map((l) => {
      l.getWorldPosition(wp);
      const d = f ? wp.distanceTo(f) : 0;
      return { l, p: wp.clone(), s: l.intensity / Math.max(1, d * d) };
    }).sort((a, b) => b.s - a.s).slice(0, MAX_POINTS);
    for (let i = 0; i < MAX_POINTS; i++) {
      const e = scored[i];
      if (!e) { u.uPointPos.value[i].set(0, -1e5, 0, 1); u.uPointCol.value[i].set(0, 0, 0, 2); continue; }
      u.uPointPos.value[i].set(e.p.x, e.p.y, e.p.z, e.l.distance || 0);
      u.uPointCol.value[i].set(e.l.color.r * e.l.intensity, e.l.color.g * e.l.intensity, e.l.color.b * e.l.intensity, e.l.decay ?? 2);
    }
  }
}
