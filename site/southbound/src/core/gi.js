// Dynamic lighting that responds to where you are and what's happening.
//
// 1. Local light capture (an approximation of global illumination): every few seconds, and as
//    soon as you've moved on, the big shapes round the camera (sky, terrain, buildings, roads,
//    water, trees) are rendered into a small cube map, one face per frame, and pre-filtered into
//    the scene's environment light. Car paint, glass and metal then reflect the actual street
//    instead of an empty sky, and the ambient light picks up the colour of what's around: a
//    red-brick canyon, a green meadow, a sunlit concrete plaza. Enclosed streets get part of
//    their lost skylight back (the eye would adapt; there's no auto-exposure to do it).
// 2. Ground bounce: the light coming up from below takes the colour of the ground underfoot
//    (grass, dry grass, sand, forest litter, pavement, water), lit by the sun.
// 3. Real lights: after dark the nearest street lamps light cars, walls and people (not just a
//    glow painted on the road); your vehicle's headlights light the road ahead; gunfire flashes
//    light the surroundings. The pools are a fixed size so shaders never recompile.
import * as THREE from 'three';
import { CITY, TOWN } from '../world/layout.js';

const CFG = {
  Medium: { size: 32, every: 4.0, lamps: 2 },
  High: { size: 64, every: 3.0, lamps: 4 },
  Ultra: { size: 96, every: 2.0, lamps: 6 },
  Cinematic: { size: 128, every: 1.5, lamps: 8 },
};

export function createDynamicLighting({ renderer, scene, quality, sky, hm, lamps, roots, collision }) {
  const C = CFG[quality.label];
  if (!C) return { update() {}, active: false };

  // ---- 1. local capture
  // Only the big shapes go into a 32-128 px cube: the ground, buildings, roads, water, sky and
  // trees (camera layer 3). Cars, people, props, grass and facade detail stay out, so each face
  // costs a fraction of a frame.
  const LAYER = 3;
  const rt = new THREE.WebGLCubeRenderTarget(C.size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cube = new THREE.CubeCamera(0.5, 260, rt);
  cube.coordinateSystem = renderer.coordinateSystem; cube.updateCoordinateSystem();
  scene.add(cube);
  const cams = cube.children;
  for (const c of cams) c.layers.set(LAYER);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let face = -1, timer = 1.0, envRT = null, envK = 1, envKWant = 1;
  // How much open sky there is round the capture point (rays up through the street canyon). A
  // canyon's capture is honestly darker than open ground; the eye adapts to that, so part of it
  // is given back here (there's no auto-exposure to do it).
  const DIRS = [];
  for (const el of [0.35, 0.7, 1.1]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + el; DIRS.push([Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)]); }
  function openness(p) {
    if (!collision) return 1;
    let open = 0;
    for (const [x, y, z] of DIRS) if (collision.raycast(p.x, p.y, p.z, p.x + x * 120, p.y + y * 120, p.z + z * 120) >= 1) open++;
    return open / DIRS.length;
  }
  // what goes in: rechecked at the start of each capture (terrain tiles and trees stream in);
  // every light too, so the cube sees the same lights as the frame and no shader compiles twice
  function tagLayer() {
    scene.traverse((o) => { if (o.isLight || o.userData.gi) o.layers.enable(LAYER); }); // userData.gi: other ground pieces
    for (const r of roots()) if (r) r.traverse((o) => { if (!o.userData.noReflect && !o.userData.noGI) o.layers.enable(LAYER); });
  }
  function renderFace(i) {
    const prevRT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const disc = sky.captureBegin ? sky.captureBegin() : null;
    renderer.setRenderTarget(rt, i);
    renderer.clear(true, true, false); // the game runs with autoClear off (post does it): without this each capture draws over the last one's depth
    renderer.render(scene, cams[i]);
    renderer.setRenderTarget(prevRT, prevFace, prevMip);
    renderer.shadowMap.autoUpdate = prevShadow;
    if (disc) sky.captureEnd(disc);
  }

  // ---- 2. what the ground bounces back
  // albedos in sRGB, like a colour picked off a photo of the ground
  const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const ALB = {
    grass: srgb(0.24, 0.29, 0.13), dry: srgb(0.42, 0.37, 0.24), sand: srgb(0.55, 0.5, 0.4),
    forest: srgb(0.2, 0.17, 0.11), paved: srgb(0.4, 0.4, 0.39), water: srgb(0.08, 0.11, 0.13),
  };
  const ground = new THREE.Color(0x3a3020), target = ground.clone(), want = new THREE.Color(), tmp = new THREE.Color(), part = new THREE.Color();
  let groundTimer = 0;
  const inGrid = (x, z, G) => x > G.x0 - 10 && x < G.x0 + G.nx * G.pitch + 10 && z > G.z0 - 10 && z < G.z0 + G.nz * G.pitch + 10;
  function groundAlbedo(p) {
    want.setRGB(0, 0, 0);
    let n = 0;
    for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [14, 14], [-14, -14], [14, -14], [-14, 14]]) {
      const x = p.x + dx, z = p.z + dz;
      if (inGrid(x, z, CITY) || inGrid(x, z, TOWN)) { want.add(ALB.paved); n++; continue; }
      if (hm.waterLevel(x, z) > hm.height(x, z) + 0.2) { want.add(ALB.water); n++; continue; }
      const sand = hm.splatAt(x, z, 0), forest = hm.splatAt(x, z, 1), dry = hm.splatAt(x, z, 2), paved = hm.splatAt(x, z, 3);
      const grass = Math.max(0, 1 - sand - forest - dry);
      tmp.copy(ALB.grass).multiplyScalar(grass).add(part.copy(ALB.dry).multiplyScalar(dry)).add(part.copy(ALB.sand).multiplyScalar(sand)).add(part.copy(ALB.forest).multiplyScalar(forest));
      tmp.lerp(ALB.paved, paved);
      want.add(tmp); n++;
    }
    return want.multiplyScalar(1 / n);
  }

  // ---- 3. light pools
  const lampLights = [];
  for (let i = 0; i < C.lamps; i++) {
    const L = new THREE.PointLight(0xffd29a, 0, 26, 2);
    scene.add(L); lampLights.push(L);
  }
  const heads = (lamps || []).map((l) => {
    const r = l.rot + (l.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    return new THREE.Vector3(l.x + Math.sin(r) * 1.9, l.y + 7.6, l.z + Math.cos(r) * 1.9);
  });
  const headL = [0, 1].map(() => {
    const s = new THREE.SpotLight(0xfff3e0, 0, 60, 0.42, 0.55, 1.6);
    scene.add(s, s.target); return s;
  });
  let lampTimer = 0;

  return {
    active: true, lampLights, headL, rt, openness: () => openness(cube.position), get envK() { return envK; },
    // all six faces and the filter at once (tests and timing)
    captureNow(cam) {
      cube.position.set(cam.x, Math.max(cam.y, hm.height(cam.x, cam.z) + 1.4), cam.z); cube.updateMatrixWorld(true);
      tagLayer();
      envKWant = envK = 1 + (1 - openness(cube.position)) * 0.6; sky.envK = envK;
      for (let i = 0; i < 6; i++) renderFace(i);
      envRT = pmrem.fromCubemap(rt.texture, envRT); scene.environment = envRT.texture; sky.localEnv = true; face = -1; timer = C.every;
    },
    // focus: where the player is; vehicle: the one they're driving (or null)
    update(dt, focus, cam, vehicle) {
      // capture: one cube face per frame, then filter it into the environment light
      if (face < 0) {
        timer -= dt;
        // on a timer, and straight away once you've moved well away from the last capture
        // (a fast drive, a teleport, leaving a building)
        if (timer <= 0 || (cam.x - cube.position.x) ** 2 + (cam.z - cube.position.z) ** 2 > 28 * 28) {
          face = 0; cube.position.set(cam.x, Math.max(cam.y, hm.height(cam.x, cam.z) + 1.4), cam.z); cube.updateMatrixWorld(true);
          tagLayer();
          envKWant = 1 + (1 - openness(cube.position)) * 0.6;
        }
      }
      if (face >= 0) {
        renderFace(face++);
        if (face === 6) {
          envRT = pmrem.fromCubemap(rt.texture, envRT);
          scene.environment = envRT.texture;
          sky.localEnv = true;
          face = -1; timer = C.every;
        }
      }
      envK += (envKWant - envK) * Math.min(1, dt * 0.8);
      sky.envK = envK;
      // light from below: the ground's colour, lit by the sun and sky
      const day = 1 - sky.night;
      if ((groundTimer -= dt) <= 0) { groundTimer = 0.5; target.copy(groundAlbedo(focus)).multiplyScalar(0.25 + day * 0.85); }
      ground.lerp(target, Math.min(1, dt * 1.5));
      sky.hemi.groundColor.copy(ground);

      // street lamps: the nearest few become real lights after dark
      const night = sky.night;
      if ((lampTimer -= dt) <= 0) {
        lampTimer = 0.4;
        if (night > 0.05 && heads.length) {
          const near = heads.map((h, i) => [h.distanceToSquared(cam), i]).sort((a, b) => a[0] - b[0]).slice(0, lampLights.length);
          near.forEach(([d2, i], k) => { lampLights[k].position.copy(heads[i]); lampLights[k].userData.d2 = d2; });
        }
      }
      for (const L of lampLights) L.intensity = night > 0.05 && L.userData.d2 < 90 * 90 ? 28 * night : 0;

      // headlights: two spots from the front of whatever you're driving
      const lightsOn = vehicle && !vehicle.isBoat && !vehicle.isAir && (night > 0.15 || (sky.weather?.dark || 0) > 0.5);
      headL.forEach((s, i) => {
        if (!lightsOn) { s.intensity = 0; return; }
        const f = vehicle.forward(), hl = (vehicle.spec?.len || 4.4) / 2, hw = (vehicle.spec?.width || 1.8) * 0.36 * (i ? 1 : -1);
        const rx = f.z, rz = -f.x;
        s.position.set(vehicle.pos.x + f.x * hl + rx * hw, vehicle.pos.y + 0.75, vehicle.pos.z + f.z * hl + rz * hw);
        s.target.position.set(s.position.x + f.x * 22, vehicle.pos.y - 0.4, s.position.z + f.z * 22);
        s.target.updateMatrixWorld();
        s.intensity = 900 * Math.max(night, 0.4);
      });
    },
  };
}
