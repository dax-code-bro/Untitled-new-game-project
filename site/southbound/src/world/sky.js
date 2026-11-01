// Physical sky, sun/moon lights, image-based lighting, fog, stars, day/night.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../util.js';
import { worldUniforms } from './terrain.js';

// Horizon fog colour through the day (hour -> linear RGB)
const FOG_KEYS = [
  [0, [0.012, 0.016, 0.03]], [5, [0.03, 0.035, 0.06]], [6, [0.55, 0.42, 0.36]],
  [7.5, [0.62, 0.70, 0.80]], [12, [0.62, 0.74, 0.88]], [17, [0.66, 0.68, 0.72]],
  [18.6, [0.80, 0.52, 0.34]], [19.6, [0.12, 0.10, 0.16]], [21, [0.015, 0.02, 0.035]], [24, [0.012, 0.016, 0.03]],
];
function fogColorAt(hour, out) {
  for (let i = 0; i < FOG_KEYS.length - 1; i++) {
    const [h0, c0] = FOG_KEYS[i], [h1, c1] = FOG_KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const t = (hour - h0) / (h1 - h0);
      return out.setRGB(lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t));
    }
  }
  return out.setRGB(0.6, 0.7, 0.85);
}

export function createSky(renderer, scene, quality) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.82;
  scene.add(sky);
  // Night: pull the sky toward deep blue instead of the model's muddy brown
  const skyNight = { value: 0 };
  sky.material.uniforms.uSkyNight = skyNight;
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform float uSkyNight;\nvoid main() {')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', `vec3 nightCol = mix(vec3(0.004,0.007,0.02), vec3(0.02,0.035,0.07), pow(1.0 - max(direction.y, 0.0), 3.0));
			retColor = mix(retColor, nightCol, uSkyNight);
			gl_FragColor = vec4( retColor, 1.0 );`);

  // Separate scene for building the environment (reflection) map
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  envSky.material.uniforms = THREE.UniformsUtils.clone(sky.material.uniforms);
  envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 8, 0, Math.PI * 2, Math.PI / 2 + 0.05, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b1e14, side: THREE.BackSide }));
  envScene.add(envGround);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = quality.shadows > 0;
  sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  const R = quality.shadowRange;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 1200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3020, 0.6);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0x9fb6cc, 0.00022);

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 2500; i++) {
    const v = new THREE.Vector3().randomDirection();
    if (v.y < 0.02) v.y = Math.abs(v.y) + 0.02;
    v.normalize().multiplyScalar(9000);
    sp.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // Moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 12), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false, transparent: true }));
  scene.add(moon);

  const sunDir = new THREE.Vector3();
  const fogCol = new THREE.Color();
  let lastEnvHour = -99, envTimer = 0;

  const state = {
    hour: 9.5, day: 1,
    sun, hemi, sky, sunDir, night: 0,
    update(dt, timeScale, focus) {
      // 1 game hour = 2 real minutes at timeScale 1
      state.hour += (dt * timeScale) / 120;
      if (state.hour >= 24) { state.hour -= 24; state.day++; }
      const h = state.hour;
      const ang = ((h - 6) / 24) * Math.PI * 2;
      sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang), Math.cos(ang) * 0.25 + 0.45).normalize();
      const elev = sunDir.y;
      u.sunPosition.value.copy(sunDir);
      const day = smoothstep(-0.08, 0.12, elev);
      state.night = 1 - smoothstep(-0.12, 0.05, elev);
      worldUniforms.uNight.value = state.night;
      skyNight.value = 1 - smoothstep(-0.2, 0.02, elev);

      // Sun / moon key light
      const moonDir = sunDir.clone().negate();
      const useMoon = elev < -0.05;
      const dir = useMoon ? moonDir : sunDir;
      sun.position.copy(focus).addScaledVector(dir, 600);
      sun.target.position.copy(focus);
      // Snap the shadow camera to texels to stop shimmering
      const texel = (2 * R) / quality.shadowMap;
      sun.target.position.x = Math.round(sun.target.position.x / texel) * texel;
      sun.target.position.z = Math.round(sun.target.position.z / texel) * texel;
      sun.position.x = sun.target.position.x + dir.x * 600;
      sun.position.z = sun.target.position.z + dir.z * 600;
      const warm = smoothstep(0.0, 0.35, elev);
      if (useMoon) {
        sun.color.setRGB(0.55, 0.65, 1.0);
        sun.intensity = 0.6 * smoothstep(-0.05, -0.3, elev);
      } else {
        sun.color.setRGB(1.0, lerp(0.55, 0.96, warm), lerp(0.3, 0.9, warm));
        sun.intensity = 3.2 * day;
      }
      hemi.intensity = lerp(0.35, 0.7, day);
      hemi.color.setRGB(lerp(0.22, 0.75, day), lerp(0.28, 0.85, day), lerp(0.55, 1.0, day));

      fogColorAt(h, fogCol);
      scene.fog.color.copy(fogCol);
      starMat.opacity = state.night;
      moon.position.copy(focus).addScaledVector(moonDir, 8500);
      moon.material.opacity = clamp(moonDir.y * 4, 0, 1);
      stars.position.copy(focus);
      sky.position.copy(focus);

      // Environment map: refresh when the sun has moved enough
      envTimer -= dt;
      if (Math.abs(h - lastEnvHour) > 0.25 && envTimer <= 0) {
        envTimer = quality.envEvery * 0.1;
        lastEnvHour = h;
        envSky.material.uniforms.sunPosition.value.copy(sunDir);
        envGround.material.color.setRGB(0.1 * day + 0.01, 0.1 * day + 0.012, 0.07 * day + 0.01);
        const next = pmrem.fromScene(envScene, 0.02);
        if (envRT) envRT.dispose();
        envRT = next;
        scene.environment = envRT.texture;
        scene.environmentIntensity = lerp(0.06, 0.22, day);
      }
    },
  };
  return state;
}
