// Dust (graphics milestone G9): what dry ground gives up when something moves over it.
//  - Cars and trucks off the pavement (dirt, sand, forest floor, dry grass) throw a rolling cloud off
//    the back wheels that hangs, spreads and drifts off with the wind; more at speed, a lot more
//    when you slide it. Traffic and police cars do it too, so a car on a dirt track shows from far off
//  - Running feet kick up small puffs on dry soil and sand; so do galloping mustangs, running deer
//  - Aircraft: a plane's prop blast on a dry strip, a helicopter's downwash over dry ground
//  - Dust devils: on hot, clear afternoons a whirl of dust wanders across open dry ground
//  - Wet ground gives none, and it comes back as the ground dries
//  - Coloured by the ground it came off; lit by the sun and the sky (dark at night) and glowing
//    when you look through it towards a low sun
// One instanced pool of soft camera-facing puffs; each grows, rises a little, slows and fades.
import * as THREE from 'three';
import { scanGround } from '../core/substrate.js';
import { worldUniforms } from '../world/terrain.js';

// how much dust each kind of ground gives, and its colour
const DUSTY = {
  soil: { k: 1, c: [0.62, 0.52, 0.4] },
  sand: { k: 1.1, c: [0.8, 0.73, 0.6] },
  litter: { k: 0.55, c: [0.5, 0.44, 0.35] },
  grass: { k: 0.3, c: [0.6, 0.55, 0.43] },
};

function puffTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  // soft round blob broken up by a few octaves of value noise, so overlapping puffs read as cloud
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const n = (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = h(i, j), b = h(i + 1, j), cc = h(i, j + 1), d = h(i + 1, j + 1), su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv); return a + (b - a) * su + (cc - a) * sv + (a - b - cc + d) * su * sv; };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S * 2 - 1, v = j / S * 2 - 1, r = Math.hypot(u, v);
    const nz = n(i / 9, j / 9) * 0.55 + n(i / 4.5, j / 4.5) * 0.3 + n(i / 2.2, j / 2.2) * 0.15;
    const a = Math.max(0, 1 - r * r) ** 1.4 * (0.5 + nz * 0.8);
    const o = (j * S + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.min(255, a * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function installDust(game, opts = {}) {
  const { scene, S, player, sky } = game;
  const N = opts.max || ({ phone: 140, low: 220, medium: 320 }[game.settings?.preset] || 420), rnd = Math.random;
  const geo = new THREE.PlaneGeometry(1, 1);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); fade.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aFade', fade);
  const U = { uSunV: { value: new THREE.Vector3(0, 1, 0) }, uScatter: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ map: puffTexture(), transparent: true, depthWrite: false, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;')
      // lit like a sheet facing the sky, not like a card facing the camera (otherwise it goes dark
      // whenever you look towards the sun, which is when dust is brightest)
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\ntransformedNormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;')
      // face whichever camera is drawing it (in the shader, so a mirror or a moved camera sees it
      // right too): the instance matrix carries the centre, the size and a spin about the view axis
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  mvPosition.xy += mat2(instanceMatrix[0].xy, instanceMatrix[1].xy) * position.xy;
  gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade; uniform vec3 uSunV; uniform float uScatter;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vFade;')
      // forward scattering: looking through the cloud towards the sun, it glows
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float fs = pow(max(dot(-normalize(vViewPosition), uSunV), 0.0), 5.0); totalEmissiveRadiance += diffuseColor.rgb * fs * uScatter; }');
  };
  mat.customProgramCacheKey = () => 'sb-dust';
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.frustumCulled = false; mesh.userData.noHit = true; mesh.userData.noReflect = true; mesh.count = 0; mesh.renderOrder = 3;
  mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);
  // the sun in the drawing camera's view space, for the glow
  mesh.onBeforeRender = (r, sc, cam) => { U.uSunV.value.copy(sky.sunDir).transformDirection(cam.matrixWorldInverse); };

  const P = Array.from({ length: N }, () => ({ t: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, grow: 1, a: 0.3, rot: 0, spin: 0, r: 1, g: 1, b: 1 }));
  let next = 0, live = 0;
  // emit one puff. o: { vx, vy, vz, size, grow, life, alpha, col: [r,g,b], drag }
  const puff = (x, y, z, o = {}) => {
    const p = P[next]; next = (next + 1) % N;
    const c = o.col || DUSTY.soil.c, j = 0.92 + rnd() * 0.16;
    p.x = x; p.y = y; p.z = z; p.vx = o.vx || 0; p.vy = o.vy ?? 0.5; p.vz = o.vz || 0;
    p.s0 = (o.size ?? 1) * (0.7 + rnd() * 0.6); p.grow = (o.grow ?? 1) * (0.7 + rnd() * 0.6); p.life = (o.life ?? 3) * (0.7 + rnd() * 0.6); p.t = p.life;
    p.a = o.alpha ?? 0.3; p.rot = rnd() * 6.28; p.spin = (rnd() - 0.5) * 0.6; p.drag = o.drag ?? 1.2;
    p.r = c[0] * j; p.g = c[1] * j; p.b = c[2] * j;
  };

  // how dry the ground is right now (rain lays the dust; it comes back as things dry out)
  const dryness = () => (S.indoors ? 0 : 1 - Math.min(1, Math.max(0, (worldUniforms.uWet.value - 0.06) / 0.25)));
  // the ground under a point: cached per mover (scanning every frame for every car is wasteful)
  const groundCache = new WeakMap();
  const groundAt = (who, x, z) => {
    let g = groundCache.get(who);
    if (!g || Math.abs(g.x - x) + Math.abs(g.z - z) > 1.5) {
      const id = scanGround(x, z).sub?.id; g = { x, z, d: DUSTY[id] || null }; groundCache.set(who, g);
    }
    return g.d;
  };
  const wind = () => { const w = game.hunting?.wind; return w ? { x: w.x * w.kmh / 3.6 * 0.35, z: w.z * w.kmh / 3.6 * 0.35 } : { x: 0.4, z: 0 }; };

  // ---- a land vehicle: off the back wheels, more at speed and when sliding
  const acc = new WeakMap();
  const fromCar = (v, dt, dry, near) => {
    if (!v || v.isBoat || v.isAir || v.airborne || v.drowned) return;
    const sp = Math.abs(v.speed || 0); if (sp < 2.5) return;
    const L = (v.spec?.len || 4.4), W = (v.spec?.width || 1.8);
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
    const bx = v.pos.x - fx * L * 0.38, bz = v.pos.z - fz * L * 0.38;
    const d = groundAt(v, bx, bz); if (!d) return;
    const slide = v.vel ? Math.abs(v.vel.x * rx + v.vel.y * rz) : 0;
    const rate = (sp * 1.1 + slide * 3) * d.k * dry * (near ? 1 : 0.5);
    let a = (acc.get(v) || 0) + rate * dt;
    const big = Math.min(1, sp / 25);
    while (a >= 1) {
      a -= 1;
      const s = rnd() < 0.5 ? -1 : 1, x = bx + rx * W * 0.42 * s + (rnd() - 0.5) * 0.4, z = bz + rz * W * 0.42 * s + (rnd() - 0.5) * 0.4;
      puff(x, v.pos.y + 0.35, z, { vx: -fx * sp * 0.18 + rx * s * (0.6 + slide * 0.3), vz: -fz * sp * 0.18 + rz * s * (0.6 + slide * 0.3), vy: 0.5 + rnd() * 0.5,
        size: 1.0 + big * 1.2, grow: 0.9 + big * 1.1 + slide * 0.12, life: 3 + big * 3.5, alpha: (0.45 + big * 0.3) * Math.min(1, d.k + 0.2), col: d.c });
    }
    acc.set(v, a);
  };

  // ---- feet and hooves
  const stepT = new WeakMap();
  const fromFeet = (who, x, y, z, sp, dt, dry, k = 1) => {
    if (sp < 3.2) return;
    let t = (stepT.get(who) ?? 0) - dt;
    if (t <= 0) {
      t = Math.max(0.12, 1.4 / sp);
      const d = groundAt(who, x, z);
      if (d && rnd() < d.k * dry) puff(x + (rnd() - 0.5) * 0.3, y + 0.12, z + (rnd() - 0.5) * 0.3, { vy: 0.35, size: 0.3 * k, grow: 0.45 * k, life: 1.3 + k * 0.6, alpha: 0.38 * Math.min(1, d.k), col: d.c, drag: 2 });
    }
    stepT.set(who, t);
  };

  // ---- dust devils
  const devils = [];
  let devilT = 40 + rnd() * 60;
  const spawnDevil = (x, z) => {
    devils.push({ x, z, t: 0, life: 22 + rnd() * 20, h: rnd() * 6.28, sp: 1.5 + rnd() * 2, acc: 0, turn: (rnd() - 0.5) * 0.4, spin: rnd() < 0.5 ? -1 : 1 });
  };
  const stepDevils = (dt, dry) => {
    const hot = sky.hour > 11.5 && sky.hour < 17.5 && (game.weather?.kind === 'clear' || game.weather?.kind === 'cloudy');
    if (hot && dry > 0.9 && !S.indoors && devils.length < 2 && (devilT -= dt) <= 0) {
      devilT = 70 + rnd() * 110;
      for (let i = 0; i < 6; i++) { // somewhere open and dry, in front of you, 50-140 m out
        const yaw = (game.rig?.yaw ?? 0) + (rnd() - 0.5) * 1.6, r = 50 + rnd() * 90;
        const x = player.pos.x - Math.sin(yaw) * r, z = player.pos.z - Math.cos(yaw) * r, id = scanGround(x, z).sub?.id;
        if (id === 'soil' || id === 'sand') { spawnDevil(x, z); break; }
      }
    }
    const w = wind();
    for (let i = devils.length - 1; i >= 0; i--) {
      const D = devils[i]; D.t += dt;
      D.h += D.turn * dt; D.x += (Math.sin(D.h) * D.sp + w.x * 0.6) * dt; D.z += (Math.cos(D.h) * D.sp + w.z * 0.6) * dt;
      const g = scanGround(D.x, D.z).sub?.id, ok = g === 'soil' || g === 'sand' || g === 'grass';
      const env = Math.min(1, D.t / 4) * Math.min(1, (D.life - D.t) / 5) * (ok ? 1 : 0.2);
      if (D.t > D.life || Math.hypot(D.x - player.pos.x, D.z - player.pos.z) > 400) { devils.splice(i, 1); continue; }
      D.acc += dt * 42 * env;
      const y0 = game.hm.height(D.x, D.z), d = DUSTY[g] || DUSTY.soil;
      while (D.acc >= 1) {
        D.acc -= 1;
        // a puff on the rim of the column, thrown round it and up: the column is the swirl; thick
        // at the foot, thinning and widening as it climbs
        const a = rnd() * 6.28, up = rnd(), rr = 0.4 + rnd() * 0.8 + up * 1.2;
        puff(D.x + Math.cos(a) * rr, y0 + 0.3 + up * 4, D.z + Math.sin(a) * rr, {
          vx: -Math.sin(a) * 3.5 * D.spin + w.x * 0.5, vz: Math.cos(a) * 3.5 * D.spin + w.z * 0.5, vy: 3 + up * 4,
          size: 0.9 + up * 1.1, grow: 0.7 + up * 1.4, life: 3.5 + rnd() * 2.5, alpha: 0.6 - up * 0.25, col: d.c, drag: 0.4,
        });
      }
    }
  };

  // ---- the frame
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _qz = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();
  let heliT = 0;
  const api = {
    puff, devils, spawnDevil, get live() { return live; }, dryness,
    update(dt) {
      if ((S.frozen && !S.stepping) || S.paused) return '';
      const dry = dryness();
      if (dry > 0.05) {
        const v = S.vehicle;
        if (S.mode === 'car' && v) {
          fromCar(v, dt, dry, true);
          // aircraft: prop blast on the ground, rotor downwash over dry ground
          if (v.isAir) {
            const alt = v.pos.y - game.hm.height(v.pos.x, v.pos.z), d = groundAt(v, v.pos.x, v.pos.z);
            if (d && v.heli && alt < 14 && (v.power ?? 1) > 0.2 && (heliT -= dt) <= 0) {
              heliT = 0.05;
              const k = (1 - alt / 14) * d.k * dry, a = rnd() * 6.28, r = 2 + rnd() * 3;
              if (rnd() < k + 0.15) puff(v.pos.x + Math.cos(a) * r, v.pos.y - alt + 0.3, v.pos.z + Math.sin(a) * r, { vx: Math.cos(a) * 7, vz: Math.sin(a) * 7, vy: 0.6, size: 1.2, grow: 1.6, life: 2.6, alpha: 0.45 * k + 0.1, col: d.c, drag: 1.4 });
            } else if (d && !v.heli && alt < 3 && (v.power ?? 0) > 0.4 && rnd() < dt * 30 * d.k * dry * v.power) {
              const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
              puff(v.pos.x - fx * 2.5 + (rnd() - 0.5) * 2, v.pos.y - alt + 0.3, v.pos.z - fz * 2.5 + (rnd() - 0.5) * 2, { vx: -fx * (6 + Math.abs(v.speed) * 0.3), vz: -fz * (6 + Math.abs(v.speed) * 0.3), vy: 0.5, size: 1, grow: 1.4, life: 2.5, alpha: 0.42, col: d.c });
            }
          }
        }
        if (S.mode === 'foot') fromFeet(player, player.pos.x, player.pos.y, player.pos.z, player.speed || 0, dt, dry, 1);
        const near = (p, r) => Math.abs(p.x - player.pos.x) < r && Math.abs(p.z - player.pos.z) < r;
        for (const c of game.traffic?.cars || []) if (near(c.v.pos, 220)) fromCar(c.v, dt, dry, near(c.v.pos, 90));
        for (const c of game.police?.cars || []) if (!c.tank && near(c.v.pos, 220)) fromCar(c.v, dt, dry, true);
        for (const an of game.hunting?.list || []) if (!an.dead && near(an.pos, 120)) fromFeet(an, an.pos.x, an.pos.y, an.pos.z, an.speed || 0, dt, dry, an.s?.h > 1.8 ? 1.8 : 1.1);
      }
      stepDevils(dt, dry);

      // move, grow, fade
      const w = wind();
      let n = 0;
      for (const p of P) {
        if (p.t <= 0) continue;
        p.t -= dt; if (p.t <= 0) continue;
        const k = Math.exp(-p.drag * dt);
        p.vx = p.vx * k + w.x * (1 - k); p.vz = p.vz * k + w.z * (1 - k); p.vy = p.vy * k + 0.12 * (1 - k);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
        const age = p.life - p.t, u = age / p.life;
        const s = p.s0 + p.grow * age;
        _qz.setFromAxisAngle(_z, p.rot);
        // (centred high enough that the card's hard line through the ground falls in its faint lower edge)
        _m.compose(_p.set(p.x, p.y + s * 0.38, p.z), _qz, _s.set(s, s, s));
        mesh.setMatrixAt(n, _m);
        mesh.setColorAt(n, _c.setRGB(p.r, p.g, p.b));
        fade.array[n] = p.a * Math.min(1, age * 4) * (1 - u) ** 1.4;
        n++;
      }
      live = n; mesh.count = n;
      if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; fade.needsUpdate = true; }
      // how strong the glow is (none at night, less under cloud)
      U.uScatter.value = Math.max(0, Math.min(1, sky.sunDir.y * 5)) * (1 - (game.weather?.cover ?? 0.3) * 0.8) * 1.6;
      return '';
    },
  };
  return api;
}
