// Dragons Kingdom - establishing shot (render test, ~10 s).
//
// A castle on a hill above a lake, forests, mountains, a sky with sun and
// clouds, and a (placeholder) dragon flying past while the camera cranes up.
// Everything is procedural: no downloaded assets.
//
// Scene contract (see README): export meta, setup(ctx), update(t, ctx).
// update() is a pure function of t: it positions everything for time t.
import { createNoise2D, fbm, ridged, smoothstep, mix, clamp } from 'dk/noise.js';
import { createAtmosphere, ATMOSPHERE_UNIFORMS_GLSL, ATMOSPHERE_GLSL } from 'dk/atmosphere.js';
import { createCastle } from './lib/castle.js';
import { createDragon } from './lib/dragon.js';
import { createTiledInstances, splitGrid, mergeColored } from 'dk/instancing.js';

export const meta = {
  title: 'Dragons Kingdom - establishing shot',
  duration: 10,
  toneMapping: 'aces',
  exposure: 0.9,
  vignette: 0.18,
  seed: 1,
};

// world layout (metres). Camera looks roughly toward -z.
const CASTLE = { x: 0, z: -175, top: 30 };
const LAKE = { x: 8, z: 35, rx: 230, rz: 125 };
const WATER_Y = 0;

let S = null;   // everything update() needs

export async function setup(ctx) {
  const { THREE, scene, camera, renderer, quality } = ctx;
  const n1 = createNoise2D(11), n2 = createNoise2D(23), n3 = createNoise2D(37), n4 = createNoise2D(41), n5 = createNoise2D(53);
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

  // ------------------------------------------------------------ atmosphere
  const sunDir = new THREE.Vector3(-0.8, 0.3, 0.32).normalize();
  const atmo = createAtmosphere(THREE, {
    sunDirection: sunDir,
    sunColor: [9.5, 7.4, 5.2],
    zenith: [0.13, 0.27, 0.62],
    horizon: [0.74, 0.76, 0.8],
    groundHaze: [0.5, 0.52, 0.55],
    fogDensity: 0.00085,
    fogFalloff: 0.009,
    fogBase: 0,
    cloudCover: 0.56,
  });
  scene.add(atmo.sky);

  // ------------------------------------------------------------------ lights
  const sunColor = lin(1.0, 0.86, 0.68);
  const sun = new THREE.DirectionalLight(sunColor, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  const shadowTarget = new THREE.Vector3(-5, 20, -95);
  sun.position.copy(shadowTarget).addScaledVector(sunDir, 700);
  sun.target.position.copy(shadowTarget);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 170, bottom: -170, near: 300, far: 1100 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6 * 2048 / quality.shadowMapSize;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(lin(0.62, 0.72, 0.92), lin(0.32, 0.27, 0.2), 1.15);
  scene.add(hemi);

  // ----------------------------------------------------------------- terrain
  function height(x, z) {
    let h = 7 + fbm(n1, x * 0.0045, z * 0.0045, 5) * 22 + fbm(n2, x * 0.03, z * 0.03, 3) * 1.6;
    // distant mountain ring
    const dm = Math.hypot(x * 0.8, z + 200);
    const mm = smoothstep(430, 900, dm);
    h += mm * (30 + ridged(n3, x * 0.0017 + 3, z * 0.0017, 6) * 330 + fbm(n4, x * 0.0009, z * 0.0009, 2) * 90);
    // castle hill: flat top, rocky flanks
    const dc = Math.hypot(x - CASTLE.x, (z - CASTLE.z) * 0.9);
    const hill = 1 - smoothstep(66, 170, dc);
    const flank = smoothstep(60, 80, dc) * (1 - smoothstep(110, 170, dc));
    const hillH = CASTLE.top + fbm(n4, x * 0.04, z * 0.04, 2) * 0.4 - Math.max(0, dc - 62) * 0.08
      + flank * (ridged(n3, x * 0.03, z * 0.03, 3) * 14 - 6);
    h = mix(h, Math.max(h, hillH), smoothstep(0, 1, hill * 1.25));
    // lake basin
    const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) + fbm(n5, x * 0.01, z * 0.01, 3) * 0.12;
    const lake = 1 - smoothstep(0.72, 1.06, dl);
    h = mix(h, -9 - (1 - dl) * 8, lake * (1 - hill * 0.85));
    return h;
  }

  const SEG = 420, SIZE = 3000, CX = 0, CZ = -60;
  const warpA = 2.3, warp = (u) => Math.sinh(warpA * u) / Math.sinh(warpA);   // denser grid in the middle
  const tGeo = new THREE.PlaneGeometry(1, 1, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const tp = tGeo.attributes.position;
  const colors = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    const x = CX + warp(tp.getX(i) * 2) * SIZE / 2;
    const z = CZ + warp(tp.getZ(i) * 2) * SIZE / 2;
    tp.setXYZ(i, x, height(x, z), z);
  }
  tGeo.computeVertexNormals();
  const tn = tGeo.attributes.normal;
  const cSand = lin(0.74, 0.68, 0.5), cMud = lin(0.36, 0.33, 0.25), cGrass = lin(0.25, 0.42, 0.13), cDry = lin(0.55, 0.53, 0.26);
  const cForest = lin(0.16, 0.27, 0.09), cRock = lin(0.44, 0.42, 0.4), cRockDark = lin(0.3, 0.29, 0.28), cSnow = lin(0.95, 0.96, 1.0);
  const c = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
    const slope = 1 - tn.getY(i);
    const v = fbm(n2, x * 0.012, z * 0.012, 3);
    c.copy(cGrass).lerp(cDry, smoothstep(-0.1, 0.5, v) * 0.6).lerp(cForest, smoothstep(0.05, 0.35, fbm(n5, x * 0.008, z * 0.008, 3)) * 0.7);
    c.lerp(cRock.clone().lerp(cRockDark, smoothstep(-0.3, 0.3, v)), smoothstep(0.18, 0.4, slope + v * 0.08));
    c.lerp(cSand, 1 - smoothstep(0.6, 2.4, y + v * 1.5));
    c.lerp(cMud, 1 - smoothstep(-2.5, -0.5, y));
    c.lerp(cSnow, smoothstep(185, 215, y + v * 40) * (1 - smoothstep(0.45, 0.7, slope)));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // split into 7x7 blocks so off-screen terrain is frustum-culled
  const terrain = splitGrid(THREE, tGeo, SEG, SEG, 60, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.traverse((o) => { o.receiveShadow = true; });
  scene.add(terrain);

  // ------------------------------------------------------------------- water
  const waterUniforms = { uTime: { value: 0 }, ...atmo.uniforms };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 600, 1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: ATMOSPHERE_UNIFORMS_GLSL + ATMOSPHERE_GLSL + /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        // gradient of a travelling sine wave
        vec2 wv(vec2 p, vec2 d, float k, float a, float s) { float ph = dot(p, d) * k + uTime * s; return d * (a * k * cos(ph)); }
        void main() {
          vec2 p = vWorld.xz;
          float dist = length(cameraPosition - vWorld);
          float fade = 1.0 / (1.0 + dist * 0.004);          // calmer look far away (less aliasing)
          vec2 g = wv(p, normalize(vec2(1.0, 0.35)), 0.21, 0.08, 1.1)
                 + wv(p, normalize(vec2(-0.4, 1.0)), 0.37, 0.045, 1.6)
                 + wv(p, normalize(vec2(0.8, -0.6)), 0.83, 0.02, 2.3)
                 + wv(p, normalize(vec2(-0.9, -0.2)), 1.71, 0.009, 3.1);
          g += (vec2(dkValueNoise(p * 0.9 + uTime * 0.3), dkValueNoise(p * 0.9 - uTime * 0.27 + 17.0)) - 0.5) * 0.06;
          vec3 n = normalize(vec3(-g.x * fade, 1.0, -g.y * fade));
          vec3 v = normalize(cameraPosition - vWorld);
          vec3 r = reflect(-v, n); r.y = abs(r.y);
          float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 refl = dkSkyNoSun(r);
          float spec = pow(max(dot(r, dkSunDir), 0.0), 900.0) * 30.0 + pow(max(dot(r, dkSunDir), 0.0), 60.0) * 0.4;
          vec3 body = vec3(0.012, 0.045, 0.05) * (0.5 + dkSunDir.y) + vec3(0.01, 0.03, 0.025);
          vec3 col = mix(body, refl * vec3(0.78, 0.84, 0.88), F * 0.92) + dkSunColor * spec * F * 2.0;
          gl_FragColor = vec4(dkApplyFog(col, cameraPosition, vWorld), 1.0);
        }`,
    }),
  );
  water.position.set(LAKE.x, WATER_Y, LAKE.z - 20);
  scene.add(water);

  // ------------------------------------------------------------------ castle
  const castle = createCastle(THREE, { seed: 7, ground: CASTLE.top, radius: 46, sides: 6 });
  castle.group.position.set(CASTLE.x, 0, CASTLE.z);
  castle.group.scale.setScalar(1.12);
  scene.add(castle.group);

  // ------------------------------------------------------------------ forest
  const rng = ctx.rng;
  const shadowBox = (x, z) => Math.abs(x - shadowTarget.x) < 210 && z > -340 && z < 125;
  const trunkCol = lin(0.3, 0.2, 0.12), needleCol = lin(0.13, 0.26, 0.11), leafCol = lin(0.24, 0.38, 0.13), leafCol2 = lin(0.28, 0.42, 0.15);
  // two levels of detail per tree type; far trees are a single cone / blob
  const geo = {
    cHi: mergeColored(THREE, [
      [new THREE.CylinderGeometry(0.22, 0.35, 3, 5, 1, true).translate(0, 1.5, 0), trunkCol],
      ...[[2.7, 5, 2.4], [2.1, 4.4, 5.4], [1.4, 3.8, 8.2]].map(([r, h, y]) => [new THREE.ConeGeometry(r, h, 7, 1).translate(0, y + h / 2 - 0.6, 0), needleCol]),
    ]),
    cLo: mergeColored(THREE, [[new THREE.ConeGeometry(2.5, 10.5, 6, 1).translate(0, 2 + 5.25, 0), needleCol]]),
    bHi: mergeColored(THREE, [
      [new THREE.CylinderGeometry(0.25, 0.4, 4, 5, 1, true).translate(0, 2, 0), trunkCol],
      [new THREE.IcosahedronGeometry(2.8, 1).scale(1, 0.85, 1).translate(0, 5.6, 0), leafCol],
      [new THREE.IcosahedronGeometry(1.9, 1).translate(1.2, 6.8, 0.6), leafCol2],
    ]),
    bLo: mergeColored(THREE, [[new THREE.IcosahedronGeometry(3.0, 0).scale(1, 0.9, 1).translate(0, 5.8, 0), leafCol]]),
  };
  // Lambert (diffuse only) instead of PBR for matte grass/foliage: looks the same, measured ~13% cheaper per 4K frame
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const camRef = new THREE.Vector3(-40, 15, 100);   // middle of the camera move
  const buckets = {};
  const STEP = 6.5;
  for (let gx = -1100; gx < 1100; gx += STEP) {
    for (let gz = -950; gz < 380; gz += STEP) {
      const x = gx + (rng() - 0.5) * STEP * 0.9, z = gz + (rng() - 0.5) * STEP * 0.9;
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      if (z > 150) continue;                                               // behind the camera for the whole shot
      const h = height(x, z);
      if (h < 1.6 || h > 150) continue;
      const slope = Math.abs(height(x + 2, z) - h) + Math.abs(height(x, z + 2) - h);
      if (slope > 2.2) continue;
      if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 76) continue;            // keep the castle hill top clear
      if (Math.hypot(x + 58, z - 120) < 30) continue;                      // keep the camera's foreground clear
      const dens = smoothstep(-0.25, 0.2, fbm(n5, x * 0.008, z * 0.008, 3)) * 0.8 + 0.06;
      const farThin = 1 - smoothstep(500, 1100, Math.hypot(x, z + 100)) * 0.6;
      if (r1 > dens * farThin) continue;
      const broad = r2 < 0.3 - smoothstep(20, 90, h) * 0.25;
      const s = 0.75 + r3 * 0.7;
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.3, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r4 * Math.PI * 2),
        new THREE.Vector3(s * (0.9 + r2 * 0.2), s * (0.85 + r1 * 0.3), s));
      const color = new THREE.Color().setScalar(0.75 + r3 * 0.45).lerp(new THREE.Color(1.15, 1.0, 0.7), r4 * 0.35);
      const near = Math.hypot(x - camRef.x, z - camRef.z) < 420;
      const key = (broad ? 'b' : 'c') + (near ? 'Hi' : 'Lo') + (shadowBox(x, z) ? ':cast' : '');
      (buckets[key] ||= []).push({ matrix, color });
    }
  }
  let treeCount = 0;
  for (const [key, items] of Object.entries(buckets)) {
    const [g, cast] = key.split(':');
    scene.add(createTiledInstances(THREE, geo[g], treeMat, items, { tileSize: 160, castShadow: !!cast, receiveShadow: !!cast, name: 'trees-' + key }));
    treeCount += items.length;
  }

  // ------------------------------------------------------------------ dragon
  const dragon = createDragon(THREE, { scale: 1.0, flapHz: 0.6 });
  scene.add(dragon.root);
  const flight = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-230, 40, -30),
    new THREE.Vector3(-120, 44, -55),
    new THREE.Vector3(-10, 52, -85),
    new THREE.Vector3(85, 66, -140),
    new THREE.Vector3(80, 88, -260),
    new THREE.Vector3(-50, 96, -300),
    new THREE.Vector3(-200, 78, -220),
    new THREE.Vector3(-310, 50, -100),
  ], true, 'centripetal');

  // ------------------------------------------------------------------ camera
  camera.fov = 33;
  camera.near = 1;
  camera.far = 12000;
  camera.updateProjectionMatrix();

  atmo.apply(scene);
  S = { atmo, waterUniforms, castle, dragon, flight, flightLen: flight.getLength(), sun, treeCount };
  console.info(`[test-kingdom] terrain ${tp.count} verts, ${treeCount} trees`);
  ctx.post.vignette = meta.vignette;
}

const ease = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };   // smootherstep

export function update(t, ctx) {
  const { THREE, camera } = ctx;
  const { atmo, waterUniforms, castle, dragon, flight, flightLen } = S;
  atmo.uniforms.dkTime.value = t;
  waterUniforms.uTime.value = t;
  castle.animate(t);

  // ---- dragon along its flight path (speed ~30 m/s), banking into turns
  const speed = 26;
  const u0 = 0.09;
  const u = (((u0 + (t * speed) / flightLen) % 1) + 1) % 1;
  const pos = flight.getPointAt(u);
  const ahead = flight.getPointAt((u + 0.01) % 1);
  const ahead2 = flight.getPointAt((u + 0.02) % 1);
  const fwd = ahead.clone().sub(pos).normalize();
  const fwd2 = ahead2.clone().sub(ahead).normalize();
  const turn = new THREE.Vector3().crossVectors(fwd, fwd2).y;            // >0 = turning left
  const bank = clamp(-turn * 14, -0.75, 0.75);
  const ph = 2 * Math.PI * dragon.flapHz * t;
  pos.y += Math.sin(ph + Math.PI * 0.8) * 0.9;                            // body lifts on the downstroke
  const m = new THREE.Matrix4().lookAt(pos.clone().add(fwd), pos, new THREE.Vector3(0, 1, 0));
  dragon.root.position.copy(pos);
  dragon.root.quaternion.setFromRotationMatrix(m);
  dragon.root.rotateZ(bank);
  dragon.root.rotateX(-0.08 * Math.sin(ph));
  dragon.root.updateMatrixWorld(true);
  dragon.pose(t);

  // ---- camera: slow crane up and push in over the lake, eased
  const k = ease(t / 10);
  camera.position.set(mix(-58, -22, k), mix(5.5, 27, k) + Math.sin(t * 0.7) * 0.15, mix(128, 66, k));
  const look = new THREE.Vector3(mix(-10, -4, k), mix(46, 50, k), CASTLE.z);
  // drift a little toward the dragon while it is in front of the castle
  const w = 0.1 * Math.max(0, 1 - Math.abs(pos.x + 10) / 200);
  look.lerp(pos, w);
  camera.lookAt(look);
  camera.updateMatrixWorld();
}
