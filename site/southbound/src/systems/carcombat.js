// People in cars, shooting through glass, and cars that burn and blow up.
//  - Nearby traffic and police cars get a visible driver (a small pool of
//    people moved between the closest cars).
//  - A bullet that hits a car's windows goes through and can hit the driver;
//    rounds with enough penetration go through the doors too. A shot driver
//    slumps and the car rolls to a stop.
//  - A car shot or blasted to zero health catches fire, burns for a few
//    seconds, then explodes: fireball, the wreck is thrown and charred, and it
//    keeps burning and smoking for a while. Explosions can chain.
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { makeFlame, makeSmoke, faceCamera, fxTime } from '../world/fx.js';

export function installCarCombat(game, { explodeAt }) {
  const { scene, lib, combat, traffic, police, peds, hud, S, camera } = game;
  const POOL = { Phone: 4, Low: 6, Medium: 8, High: 12, Ultra: 16 }[game.q.label] ?? 8;
  const drivers = [];
  for (let i = 0; i < POOL; i++) {
    const id = lib.peopleIds[i % lib.peopleIds.length];
    const h = new Human(lib, id);
    h.play('Driving_Loop', 0);
    h.root.visible = false;
    scene.add(h.root);
    drivers.push({ h, car: null });
  }
  const seat = (v) => { // driver's seat (left) in world space
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const lx = (v.spec.width || 1.9) * 0.22, lz = (v.spec.len || 4.6) * 0.05, ly = 0.08 + (v.spec.height || 1.5) * 0.1;
    return new THREE.Vector3(v.pos.x + lx * c + lz * s, v.pos.y + ly, v.pos.z - lx * s + lz * c);
  };
  let assignT = 0;
  const _v = new THREE.Vector3();

  // glass / door hits: does the bullet's line pass the driver?
  combat.onVehicleHit = (hit, w) => {
    const v = hit.vehicle;
    if (!v || v.driverDead || v === S.vehicle) return;
    const rel = (hit.point.y - v.pos.y) / (v.spec.height || 1.5);
    const glass = rel > 0.56;
    const pen = (w.pen || 1) + (hit.ammo?.pen || 0);
    if (!glass && pen < 3) return; // the door stopped it
    if (glass) v.glassHits = (v.glassHits || 0) + 1;
    const d = drivers.find((x) => x.car === v);
    const p = d ? d.h.root.position.clone().add(_v.set(0, 0.75, 0)) : seat(v).add(_v.set(0, 0.75, 0));
    // distance from the driver's chest/head to the bullet's line
    const o = hit.origin, dir = hit.dir;
    if (!o || !dir) return;
    const t = Math.max(0, p.clone().sub(o).dot(dir));
    const miss = o.clone().addScaledVector(dir, t).distanceTo(p);
    if (miss > 0.42) return;
    v.driverDead = true;
    if (d) { d.h.play('Death01', 0.1, 1.2, true); }
    combat.burst(p, game.settings.gore ? combat.bloodMat : combat.dustMat, 8);
    game.onDriverKilled?.(v);
  };

  // burning, then the explosion
  const burning = [];
  combat.onVehicleDestroyed = (v, at, blast) => {
    if (v.exploded || v.onFire) return;
    v.onFire = blast ? 0.4 : 3.5 + Math.random() * 2; // seconds until it goes up
    v.driverDead = true;
    const f = makeFlame(1.6); f.position.set(0, (v.spec.height || 1.5) * 0.55, (v.spec.len || 4.5) * 0.3);
    v.group.add(f);
    burning.push({ v, flames: [f], smoke: [], t: 0 });
    if (v === S.vehicle) hud.toast('Your car is on fire. Get out!', 3);
  };
  function blowUp(b) {
    const v = b.v;
    v.exploded = true; v.wrecked = true; v.health = -999;
    v.setClear?.(false);
    explodeAt(v.pos.clone().add(_v.set(0, 0.8, 0)), 160);
    // thrown and charred
    v.vy = 6 + Math.random() * 3; v.airborne = true;
    if (v.vel) v.vel.multiplyScalar(0.3);
    v.group.traverse((o) => {
      if (!o.isMesh || o.userData.noHit) return;
      const m = (Array.isArray(o.material) ? o.material : [o.material]).map((mm) => { const c = mm.clone(); if (c.color) c.color.multiplyScalar(0.12); c.roughness = 1; c.metalness = 0.1; if (c.emissive) c.emissive.setRGB(0, 0, 0); if (c.transparent) c.opacity = 0.15; return c; });
      o.material = Array.isArray(o.material) ? m : m[0];
    });
    for (const [x, z, s] of [[0, 0.3, 2.2], [0.4, -0.4, 1.5], [-0.4, -0.2, 1.3]]) { const f = makeFlame(s); f.position.set(x, (v.spec.height || 1.5) * 0.3, z * (v.spec.len || 4.5)); v.group.add(f); b.flames.push(f); }
    for (let i = 0; i < 2; i++) { const sm = makeSmoke(7 + i * 3, Math.random(), 0.08); sm.position.set(0, (v.spec.height || 1.5) * 0.8, 0); v.group.add(sm); b.smoke.push(sm); }
    b.t = 0; b.burn = 28;
    if (v === S.vehicle) { game.exitVehicle(); game.hurtPlayer?.(60, v.pos); }
    // whoever was inside
    const d = drivers.find((x) => x.car === v); if (d) { d.car = null; d.h.root.visible = false; }
    game.onCarExploded?.(v);
  }

  return {
    update(dt) {
      fxTime.value += dt;
      // put drivers in the closest cars
      if ((assignT -= dt) <= 0) {
        assignT = 0.5;
        const focus = game.player.pos;
        const cars = [...traffic.cars.map((c) => c.v), ...police.cars.filter((c) => !c.deployed && !c.tank).map((c) => c.v)]
          .filter((v) => !v.exploded && v.pos.distanceTo(focus) < 70).sort((a, b) => a.pos.distanceTo(focus) - b.pos.distanceTo(focus)).slice(0, POOL);
        for (const d of drivers) if (d.car && !cars.includes(d.car) && !d.car.driverDead) { d.car = null; d.h.root.visible = false; }
        for (const v of cars) {
          if (drivers.some((d) => d.car === v)) continue;
          const free = drivers.find((d) => !d.car);
          if (!free) break;
          free.car = v; free.h.root.visible = true; free.h.play('Driving_Loop', 0.1, 1, true);
        }
        // clear glass where someone sits at the wheel (or the cops have got out); tinted where nobody does
        for (const c of traffic.cars) c.v.setClear?.(drivers.some((d) => d.car === c.v));
        for (const c of police.cars) c.v.setClear?.(!!c.deployed || drivers.some((d) => d.car === c.v));
      }
      for (const d of drivers) {
        const v = d.car;
        if (!v) continue;
        if (!v.group.parent || v.exploded) { d.car = null; d.h.root.visible = false; continue; }
        if (!(v.cabLayout && v.seat(d.h, 0))) {
          d.h.root.position.copy(seat(v));
          d.h.root.rotation.set(v.pitch ? -v.pitch : 0, v.heading, 0);
        }
        d.h.update(dt);
      }
      // a car with a dead driver coasts to a stop
      // fires
      for (let i = burning.length - 1; i >= 0; i--) {
        const b = burning[i], v = b.v;
        b.t += dt;
        for (const f of b.flames) faceCamera(f, camera);
        for (const s of b.smoke) faceCamera(s, camera);
        if (!v.exploded && (v.onFire -= dt) <= 0) blowUp(b);
        if (v.exploded) {
          // the thrown wreck falls back
          if (v.airborne) { v.vy -= 20 * dt; v.pos.y += v.vy * dt; const g = game.collision.surface(v.pos.x, v.pos.z, v.pos.y + 1); if (v.pos.y <= g) { v.pos.y = g; v.airborne = false; v.vy = 0; } v.sync?.(dt); }
          if ((b.burn -= dt) <= 0) { for (const f of b.flames) v.group.remove(f); b.flames.length = 0; if (b.burn < -40) { for (const s of b.smoke) v.group.remove(s); burning.splice(i, 1); } }
        }
      }
    },
  };
}
