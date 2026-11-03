// Physical sky, sun/moon lights, image-based lighting, fog, stars, day/night.
import * as THREE from 'three';
import { createCloudSky, createSkyDome } from './clouds.js';
import { clamp, lerp, smoothstep } from '../util.js';
import { worldUniforms } from './terrain.js';
import { fogParams } from './atmosphere.js';

// Horizon fog colour through the day (hour -> linear RGB)
const FOG_KEYS = [
  [0, [0.012, 0.016, 0.03]], [5, [0.03, 0.035, 0.06]], [6, [0.55, 0.42, 0.36]],
  [7.5, [0.6, 0.68, 0.8]], [12, [0.56, 0.69, 0.88]], [17, [0.62, 0.66, 0.74]],
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
  // Ray-marched clouds live in a small cube map; the dome draws it at full res.
  const clouds = createCloudSky(renderer, quality);
  const u = clouds.uniforms;
  const sky = createSkyDome(clouds.texture);
  scene.add(sky);
  const du = sky.material.uniforms;
  const skyNight = { value: 0 };
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  // reflections are built from a slightly blurred copy of the sky, so the
  // clouds' fine ray-march grain never shows up in glass, paint or water
  const envScene = new THREE.Scene();
  const envDome = createSkyDome(clouds.texture);
  envDome.scale.setScalar(100);
  envDome.material.uniforms.uSunDisc.value.setRGB(0, 0, 0);
  envScene.add(envDome);

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

  const sunDir = new THREE.Vector3();
  const fogCol = new THREE.Color();
  let lastEnvHour = -99, envTimer = 0, envAge = 0, lastCover = 0;
  const _grey = new THREE.Color();

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
      const day = smoothstep(-0.08, 0.12, elev);
      state.night = 1 - smoothstep(-0.12, 0.05, elev);
      worldUniforms.uNight.value = state.night;
      skyNight.value = 1 - smoothstep(-0.2, 0.02, elev);
      // atmosphere: fog glows toward the sun (or the moon at night)
      const glowDir = elev > -0.05 ? sunDir : sunDir.clone().negate();
      fogParams.a.x = glowDir.x; fogParams.a.y = glowDir.y; fogParams.a.z = glowDir.z;
      const low = 1 - smoothstep(0.05, 0.5, Math.abs(elev));
      fogParams.b.x = lerp(1.0, 1.35, low) * (elev > -0.05 ? 1 : 0.25);
      fogParams.b.y = lerp(0.92, 0.72, low) * (elev > -0.05 ? 1 : 0.3);
      fogParams.b.z = lerp(0.78, 0.42, low) * (elev > -0.05 ? 1 : 0.45);
      fogParams.b.w = elev > -0.05 ? lerp(0.35, 0.95, low) : 0.25;

      // Sun / moon key light
      const moonDir = sunDir.clone().negate();
      const useMoon = elev < -0.05;
      const dir = useMoon ? moonDir : sunDir;
      sun.position.copy(focus).addScaledVector(dir, 600);
      sun.target.position.copy(focus);
      // Snap the shadow camera to texels to stop shimmering
      const texel = (2 * sun.shadow.camera.right) / quality.shadowMap;
      sun.target.position.x = Math.round(sun.target.position.x / texel) * texel;
      sun.target.position.z = Math.round(sun.target.position.z / texel) * texel;
      sun.position.x = sun.target.position.x + dir.x * 600;
      sun.position.z = sun.target.position.z + dir.z * 600;
      const warm = smoothstep(0.0, 0.35, elev);
      if (useMoon) {
        sun.color.setRGB(0.55, 0.65, 1.0);
        sun.intensity = 0.6 * smoothstep(-0.05, -0.3, elev);
      } else {
        sun.color.setRGB(1.0, lerp(0.55, 0.985, warm), lerp(0.3, 0.955, warm));
        sun.intensity = 4.1 * day;
      }
      hemi.intensity = lerp(0.5, 0.58, day);
      hemi.color.setRGB(lerp(0.22, 0.62, day), lerp(0.28, 0.76, day), lerp(0.55, 1.0, day));
      // weather: clouds swallow the sun, light goes flat and grey
      const W = state.weather || { cover: 0.52, dark: 0, flash: 0, rain: 0 };
      sun.intensity *= 1 - W.dark * 0.85;
      hemi.intensity *= 1 - W.dark * 0.25 * day;
      hemi.color.lerp(_grey.setRGB(0.55, 0.58, 0.62).multiplyScalar(0.3 + 0.7 * day), W.dark * 0.6 * day);
      if (W.flash > 0) { hemi.intensity += W.flash * 2.5; hemi.color.lerp(_grey.setRGB(0.75, 0.8, 1.0), W.flash); }

      fogColorAt(h, fogCol);
      fogCol.lerp(_grey.setRGB(0.42, 0.45, 0.48).multiplyScalar(0.08 + 0.92 * day), W.dark * 0.7);
      scene.fog.color.copy(fogCol);
      sky.position.copy(focus);
      // dome: crisp sun disc, moon and stars drawn over the cloud cube
      du.uSunDir.value.copy(sunDir);
      du.uSunDisc.value.copy(sun.color).multiplyScalar(useMoon ? 0 : 60 * day);
      du.uMoonDir.value.copy(moonDir);
      du.uMoon.value = clamp(moonDir.y * 4, 0, 1);
      du.uStars.value = state.night * (1 - W.dark);
      du.uFlash.value = W.flash;
      // clouds: lit by the sun, then the moon after dark; sunset light reaches them last
      u.uCloudTime.value += dt * Math.max(timeScale, 0.05) + (timeScale === 0 ? dt * 0.3 : 0);
      u.uSkyNight.value = skyNight.value;
      const cloudDay = smoothstep(-0.24, 0.06, elev); // high clouds catch the sun after it sets
      const warmC = smoothstep(-0.08, 0.4, elev);
      u.uLightDir.value.copy(elev < -0.2 ? moonDir : sunDir);
      u.uCloudSun.value.setRGB(1.0, lerp(0.3, 0.95, warmC), lerp(0.2, 0.88, warmC)).multiplyScalar(3.6 * cloudDay);
      if (useMoon && elev < -0.2) u.uCloudSun.value.setRGB(0.05, 0.06, 0.085).multiplyScalar(smoothstep(-0.2, -0.35, elev));
      u.uCloudAmb.value.setRGB(lerp(0.012, 0.36, cloudDay), lerp(0.016, 0.42, cloudDay), lerp(0.03, 0.52, cloudDay));
      if (elev > -0.25 && elev < 0.25) u.uCloudAmb.value.lerp(_grey.setRGB(0.3, 0.24, 0.34), (1 - smoothstep(0.0, 0.25, elev)) * smoothstep(-0.25, -0.05, elev) * 0.7);
      u.uCloudSun.value.multiplyScalar(1 - W.dark * 0.55);
      u.uCloudAmb.value.multiplyScalar(1 - W.dark * 0.45);
      u.uCover.value = W.cover;
      u.uGround.value.setRGB(0.07 * day + 0.006, 0.07 * day + 0.007, 0.05 * day + 0.008);
      u.sunPosition.value.copy(sunDir);
      clouds.update();

      // Environment map: rebuilt from the cloud cube when the sun moves or clouds drift
      envTimer -= dt; envAge += dt;
      if ((Math.abs(h - lastEnvHour) > 0.2 || envAge > 12 || Math.abs(W.cover - lastCover) > 0.05) && envTimer <= 0) {
        lastCover = W.cover;
        envTimer = quality.envEvery * 0.1; envAge = 0;
        lastEnvHour = h;
        envDome.material.uniforms.uStars.value = 0;
        const next = pmrem.fromScene(envScene, 0.035, 0.1, 400);
        if (envRT) envRT.dispose();
        envRT = next;
        scene.environment = envRT.texture;
        scene.environmentIntensity = lerp(0.12, 0.22, day);
      }
    },
  };
  return state;
}
