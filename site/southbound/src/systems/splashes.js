// What disturbs the water: your boat's wake and bow spray, wading people and animals, a car
// that drives in, a helicopter's downwash, bullets, fish rising on a still evening, the bobber.
// The rings themselves are drawn by the water shader (world/wakes.js); this file decides where
// they start and throws the spray.
import * as THREE from 'three';
import { disturb, updateWakes, liveWakes } from '../world/wakes.js';
import { worldUniforms } from '../world/terrain.js';
import { soakUniform } from '../entities/bodyshade.js';

const DROPS = 220;

export function installSplashes(game) {
  const { scene, S, hm, player, peds } = game;
  const rnd = Math.random;
  const depthAt = (x, z) => hm.waterLevel(x, z) - hm.height(x, z);

  // ---- spray: a pool of droplets thrown up and falling back
  const geo = new THREE.IcosahedronGeometry(0.05, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.55, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 0.4 });
  const mesh = new THREE.InstancedMesh(geo, mat, DROPS);
  mesh.frustumCulled = false; mesh.userData.noHit = true; mesh.userData.noReflect = true; mesh.count = 0;
  scene.add(mesh);
  const drops = Array.from({ length: DROPS }, () => ({ t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  let next = 0;
  const spray = (x, y, z, n, o = {}) => {
    for (let i = 0; i < n; i++) {
      const d = drops[next]; next = (next + 1) % DROPS;
      const a = rnd() * Math.PI * 2, h = (o.spread ?? 1.5) * (0.4 + rnd() * 0.6);
      d.x = x + (rnd() - 0.5) * (o.jitter ?? 0.3); d.y = y; d.z = z + (rnd() - 0.5) * (o.jitter ?? 0.3);
      d.vx = Math.cos(a) * h + (o.vx || 0) * (0.6 + rnd() * 0.5); d.vz = Math.sin(a) * h + (o.vz || 0) * (0.6 + rnd() * 0.5);
      d.vy = (o.up ?? 3) * (0.5 + rnd() * 0.7); d.t = (o.life ?? 0.9) * (0.6 + rnd() * 0.6); d.s = (o.size ?? 1) * (0.6 + rnd() * 0.8);
    }
  };
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const stepSpray = (dt) => {
    let n = 0;
    for (const d of drops) {
      if (d.t <= 0) continue;
      d.t -= dt; d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.t <= 0) continue;
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s.setScalar(d.s * Math.min(1, d.t * 3)));
      mesh.setMatrixAt(n++, _m);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = n > 0;
  };

  // a splash at a point on the water (bullets, things that fall in)
  const splash = (x, z, big = 0.5) => {
    const wl = hm.waterLevel(x, z);
    disturb(x, z, Math.min(1, 0.35 + big * 0.5), 1.4 + big * 1.5);
    spray(x, wl, z, Math.round(4 + big * 14), { spread: 0.6 + big, up: 2.5 + big * 3, life: 0.7 + big * 0.4, size: 0.7 + big * 0.5 });
  };
  game.combat.onSplash = (at) => splash(at.x, at.z, 0.25);

  let tBoat = 0, tBow = 0, tWade = 0, tFish = 2 + rnd() * 3, tHeli = 0, carSplashed = null, tStep = 0;
  const lastWade = new WeakMap();
  const wade = (who, x, z, moving, dt, big = 0.3) => {
    const t = (lastWade.get(who) || 0) - dt;
    if (t > 0) { lastWade.set(who, t); return; }
    if (depthAt(x, z) < 0.12) return;
    lastWade.set(who, moving ? 0.32 : 1.6);
    disturb(x, z, moving ? big : big * 0.4, moving ? 0.9 : 0.5);
  };

  return {
    splash, spray, disturb, liveWakes, get soak() { return soakUniform.value; }, set soak(v) { soakUniform.value = v; },
    update(dt) {
      if ((S.frozen && !S.stepping) || S.paused) { updateWakes(); return ''; }
      const v = S.vehicle;
      // ---- your boat: a ring dropped from the stern every tenth of a second, spray off the bow
      if (S.mode === 'car' && v?.isBoat) {
        tBoat -= dt;
        const sp = Math.abs(v.speed), fx = Math.sin(v.heading), fz = Math.cos(v.heading), L = v.spec.len || 6;
        if (tBoat <= 0 && sp > 0.6) {
          tBoat = 0.1; tBow = (tBow || 0) + 1;
          disturb(v.pos.x - fx * L * 0.35, v.pos.z - fz * L * 0.35, Math.min(1, 0.2 + sp / 16), Math.min(6, Math.max(0.8, sp * 0.36)));
          // white water thrown off the bow, every other tick
          if (sp > 4 && tBow % 2 === 0) disturb(v.pos.x + fx * L * 0.3, v.pos.z + fz * L * 0.3, Math.min(0.8, sp / 22), 1.4);
        }
        if (sp > 6 && rnd() < dt * sp * 1.2) {
          const side = rnd() < 0.5 ? -1 : 1, rx = Math.cos(v.heading) * side, rz = -Math.sin(v.heading) * side;
          const bx = v.pos.x + fx * L * 0.25 + rx * (v.spec.width || 2) * 0.45, bz = v.pos.z + fz * L * 0.25 + rz * (v.spec.width || 2) * 0.45;
          spray(bx, hm.waterLevel(bx, bz) + 0.1, bz, 3, { vx: rx * 2.5 + fx * sp * 0.25, vz: rz * 2.5 + fz * sp * 0.25, spread: 0.6, up: 1.6 + sp * 0.12, life: 0.8, size: 0.9 });
        }
      }
      // ---- a car or truck in the water: a big splash going in, then a bow wave as it ploughs on
      if (S.mode === 'car' && v && !v.isBoat && !v.isAir) {
        const deep = depthAt(v.pos.x, v.pos.z);
        if (deep > 0.25) {
          if (carSplashed !== v) { carSplashed = v; splash(v.pos.x, v.pos.z, Math.min(1, Math.abs(v.speed) / 12 + 0.3)); }
          wade(v, v.pos.x, v.pos.z, Math.abs(v.speed) > 0.5, dt, Math.min(1, 0.3 + Math.abs(v.speed) / 15));
          if (Math.abs(v.speed) > 3 && rnd() < dt * 8) spray(v.pos.x + Math.sin(v.heading) * 2, hm.waterLevel(v.pos.x, v.pos.z), v.pos.z + Math.cos(v.heading) * 2, 4, { spread: 1.2, up: 2.4, life: 0.7 });
        } else if (carSplashed === v && deep < 0) carSplashed = null;
      }
      // ---- a helicopter low over water: a ring of downwash and blown spray
      if (S.mode === 'car' && v?.heli) {
        const wl = hm.waterLevel(v.pos.x, v.pos.z), alt = v.pos.y - wl;
        if (depthAt(v.pos.x, v.pos.z) > 0.3 && alt < 14 && alt > 0) {
          tHeli -= dt;
          if (tHeli <= 0) { tHeli = 0.28; disturb(v.pos.x, v.pos.z, 0.9 - alt / 20, 3.5); }
          if (rnd() < dt * (16 - alt)) {
            const a = rnd() * Math.PI * 2, r = 3 + rnd() * 3, x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r;
            spray(x, wl, z, 2, { vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, spread: 0.5, up: 0.8, life: 0.9, size: 1.3 });
          }
        }
      }
      // ---- wading: you, people and animals
      tWade -= dt;
      if (S.mode === 'foot') wade(player, player.pos.x, player.pos.z, Math.hypot(player.vel?.x || 0, player.vel?.z || 0) > 0.5, dt);
      if (tWade <= 0) {
        tWade = 0.15;
        const px = player.pos.x, pz = player.pos.z;
        for (const p of peds.list) if (p.mode !== 'dead' && Math.abs(p.pos.x - px) < 70 && Math.abs(p.pos.z - pz) < 70) wade(p, p.pos.x, p.pos.z, (p.speed || 0) > 0.3, 0.15);
        for (const a of game.hunting?.list || []) if (!a.dead && Math.abs(a.pos.x - px) < 90 && Math.abs(a.pos.z - pz) < 90) wade(a, a.pos.x, a.pos.z, true, 0.15, 0.4);
      }
      // ---- fish rising: a quiet ring somewhere near you on calm water (mostly at dawn and dusk)
      tFish -= dt;
      if (tFish <= 0) {
        const h = game.sky?.hour ?? 12, golden = (h > 5.5 && h < 8.5) || (h > 17.5 && h < 20.5);
        tFish = (golden ? 1.2 : 3.5) + rnd() * 3;
        const a = rnd() * Math.PI * 2, r = 8 + rnd() * 40, x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
        if (depthAt(x, z) > 0.8 && (game.weather?.rain || 0) < 0.3) { disturb(x, z, 0.3, 0.8); if (rnd() < 0.3) spray(x, hm.waterLevel(x, z), z, 3, { spread: 0.3, up: 1.6, life: 0.5, size: 0.6 }); }
      }
      // ---- in the rain: everyone soaks through in a minute or so and dries over a few; tyres throw
      // spray off wet roads; your footsteps splash
      const rain = S.indoors ? 0 : (game.weather?.rain || 0), wet = worldUniforms.uWet.value;
      soakUniform.value = Math.max(0, Math.min(1, soakUniform.value + (rain > 0.15 ? dt * rain / 45 : -dt / (S.indoors ? 120 : 300))));
      if (wet > 0.35 && !S.indoors) {
        const throwSpray = (car, k) => {
          const sp = Math.abs(car.speed || 0);
          if (sp < 7 || car.isBoat || car.isAir || rnd() > dt * sp * 0.9 * k) return;
          const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
          const L = (car.spec?.len || 4.4) * 0.36, W = (car.spec?.width || 1.8) * 0.45, s = rnd() < 0.5 ? -1 : 1;
          const x = car.pos.x - fx * L + rx * W * s, z = car.pos.z - fz * L + rz * W * s;
          spray(x, car.pos.y + 0.15, z, 3, { vx: -fx * sp * 0.25 + rx * s * 1.5, vz: -fz * sp * 0.25 + rz * s * 1.5, spread: 0.7, up: 1.1, life: 0.55, size: 1.2 * wet, jitter: 0.4 });
        };
        if (S.mode === 'car' && v) throwSpray(v, 1);
        for (const c of game.traffic?.cars || []) if (Math.abs(c.v.pos.x - player.pos.x) < 60 && Math.abs(c.v.pos.z - player.pos.z) < 60) throwSpray(c.v, 0.5);
        if (S.mode === 'foot' && (player.speed || 0) > 1.5 && (tStep -= dt) <= 0) {
          tStep = (player.speed || 0) > 5 ? 0.32 : 0.5;
          spray(player.pos.x, player.pos.y + 0.03, player.pos.z, 2, { spread: 0.4, up: 0.9, life: 0.35, size: 0.5 });
        }
      }
      updateWakes();
      stepSpray(dt);
      return '';
    },
  };
}
