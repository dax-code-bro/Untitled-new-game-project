// Weather: clear / cloudy / overcast / rain / storm.
// Drives cloud cover, light, fog, rain streaks, road wetness and lightning.
import * as THREE from 'three';
import { worldUniforms } from './terrain.js';
import { clamp, lerp } from '../util.js';

export const WEATHER = {
  clear: { cover: 0.3, rain: 0, dark: 0, fog: 1.0, w: 35 },
  cloudy: { cover: 0.56, rain: 0, dark: 0.1, fog: 1.0, w: 30 },
  overcast: { cover: 0.82, rain: 0, dark: 0.45, fog: 1.4, w: 12 },
  rain: { cover: 0.88, rain: 0.65, dark: 0.6, fog: 2.0, w: 15 },
  storm: { cover: 0.97, rain: 1.0, dark: 0.75, fog: 2.6, w: 8 },
};

function makeRain(count) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmount: { value: 0 },
      uFall: { value: new THREE.Vector3(1.5, -11, 0.8) }, uBox: { value: new THREE.Vector3(36, 22, 36) },
      uColor: { value: new THREE.Color(0.5, 0.52, 0.55) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform vec3 uCam, uFall, uBox; uniform float uTime, uAmount;
      varying vec2 vQ; varying float vA;
      void main(){
        vec3 p = aSeed.xyz * uBox + uFall * uTime * (0.85 + aSeed.w * 0.3);
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
        vec3 v = normalize(uFall);
        vec3 toCam = normalize(uCam - p);
        float d = length(uCam - p);
        vec3 side = normalize(cross(v, toCam)) * (0.0055 + d * 0.0008);
        vec3 wp = p + v * position.y * (0.55 + aSeed.w * 0.4) + side * position.x;
        vQ = position.xy;
        vA = step(aSeed.w, uAmount) * smoothstep(18.0, 5.0, d) * smoothstep(0.6, 2.0, d);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying vec2 vQ; varying float vA;
      void main(){
        float a = (1.0 - abs(vQ.x)) * (1.0 - abs(vQ.y) * 2.0) * vA * 0.42;
        if (a <= 0.003) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.userData.noReflect = true;
  return mesh;
}

export function createWeather(scene, quality) {
  const count = { phone: 2500, low: 3500, medium: 6000, high: 9000, ultra: 14000 }[quality.key] || 6000;
  const rain = makeRain(count);
  scene.add(rain);
  const ru = rain.material.uniforms;
  const cur = { ...WEATHER.cloudy };
  const state = {
    kind: 'cloudy', target: WEATHER.cloudy, cover: cur.cover, rain: 0, dark: cur.dark, fog: 1, flash: 0,
    nextChange: 3 + Math.random() * 4, // game hours
    set(kind) { if (WEATHER[kind]) { state.kind = kind; state.target = WEATHER[kind]; } },
    snap() { Object.assign(cur, state.target); worldUniforms.uWet.value = state.target.rain > 0 ? 0.9 : 0; },
    update(dt, gameHours, camera, auto = true) {
      // pick the next weather every few game hours
      if (auto) {
        state.nextChange -= gameHours;
        if (state.nextChange <= 0) {
          state.nextChange = 3 + Math.random() * 5;
          const list = Object.entries(WEATHER);
          let t = Math.random() * list.reduce((a, [, w]) => a + w.w, 0);
          for (const [k, w] of list) if ((t -= w.w) <= 0) { state.set(k); break; }
        }
      }
      // ease toward the target over ~40 s
      const k = Math.min(1, dt / 40);
      for (const key of ['cover', 'rain', 'dark', 'fog']) cur[key] = lerp(cur[key], state.target[key], k);
      state.cover = cur.cover; state.rain = cur.rain; state.dark = cur.dark; state.fog = cur.fog;
      // roads soak in a minute of rain and take several to dry
      const wet = worldUniforms.uWet;
      wet.value = clamp(wet.value + (cur.rain > 0.05 ? dt / 60 : -dt / 400), 0, 1);
      // lightning in storms
      state.flash = Math.max(0, state.flash - dt * 4);
      state.thunder = false;
      if (state.kind === 'storm' && Math.random() < dt * 0.12) { state.flash = 1; state.thunder = true; }
      // rain streaks follow the camera
      ru.uCam.value.copy(camera.position);
      ru.uTime.value += dt;
      ru.uAmount.value = cur.rain;
      ru.uColor.value.setRGB(0.5, 0.52, 0.55).multiplyScalar(1 - worldUniforms.uNight.value * 0.75);
      rain.visible = cur.rain > 0.01 && !state.indoors;
    },
  };
  return state;
}
