// Police, batch two.
//  - The helicopter: from three stars a police helicopter comes up and hangs over where they think
//    you are, and it can see you from the air (it helps the cars find you). At night it lights you
//    up with a searchlight. It goes home when the stars drop.
//  - Roadblocks: at three stars and up, driving, a roadblock can go up on the road ahead of you:
//    two cruisers across it, officers behind them, and a stinger. Drive over the stinger and your
//    tyres are shredded (slow, and the car pulls) until a garage fixes them.
//  - Bribes: at one star, with an officer about to cuff you, you can offer him money (F). Some take
//    it and look the other way; some don't, and that's another star.
//  - The radio: you only hear the police radio when they're close, or anywhere if you've bought a
//    police scanner.
import * as THREE from 'three';
import { AIRCRAFT, Aircraft } from '../entities/craft.js';
import { nearestRoad, keyHint } from './world-util.js';

export function installPolicePlus(game) {
  const { police, scene, player, S, hud, career, peds } = game;
  const rnd = Math.random;

  // ---------------- the helicopter
  let heli = null, leaving = 0;
  const light = new THREE.SpotLight(0xf2f4ff, 0, 220, 0.11, 0.55, 1.2);
  light.castShadow = false; scene.add(light, light.target);
  const sweep = new THREE.Vector3();
  function updateHeli(dt) {
    const want = police.wanted >= 3 && !S.indoors;
    if (want && !heli) {
      const entry = AIRCRAFT.find((e) => /police|news/.test(e.id) && /heli/.test(e.type || e.id)) || AIRCRAFT.find((e) => /heli/.test(e.type || e.id));
      if (entry) {
        heli = new Aircraft({ ...entry, name: 'Police helicopter', paint: [0.05, 0.08, 0.16], trim: [0.85, 0.85, 0.85] }, game.q);
        const a = rnd() * Math.PI * 2;
        heli.pos.set(player.pos.x + Math.cos(a) * 300, player.pos.y + 60, player.pos.z + Math.sin(a) * 300);
        scene.add(heli.group); leaving = 0;
        police.radio?.('Air support is up. We\'ll find him.', 1);
      }
    }
    if (!heli) { light.intensity = 0; police.heliSees = false; return; }
    if (!want) leaving += dt;
    const T = leaving > 0 ? new THREE.Vector3(heli.pos.x + 400, heli.pos.y + 40, heli.pos.z) : (police.target?.() || player.pos);
    const dx = T.x - heli.pos.x, dz = T.z - heli.pos.z, d = Math.hypot(dx, dz);
    const sp = Math.min(22, d * 0.6) * dt;
    if (d > 1) { heli.pos.x += (dx / d) * sp; heli.pos.z += (dz / d) * sp; heli.heading = Math.atan2(dx, dz); }
    const ground = game.collision.surface(heli.pos.x, heli.pos.z, heli.pos.y + 50);
    heli.pos.y += ((ground + 48) - heli.pos.y) * Math.min(1, dt * 0.8);
    heli.group.position.copy(heli.pos); heli.group.rotation.set(Math.min(0.25, sp / dt / 90), heli.heading, 0, 'YXZ');
    heli.sync?.(dt);
    // the searchlight (after dark): on you when they can see you, sweeping round where you were when not
    const night = game.sky.night > 0.35;
    light.position.copy(heli.pos);
    if (police.sight) sweep.copy(player.pos); else { const t = performance.now() * 0.0006; sweep.set(T.x + Math.sin(t) * 18, T.y || player.pos.y, T.z + Math.cos(t * 1.3) * 18); }
    light.target.position.lerp(sweep, Math.min(1, dt * 3)); light.target.updateMatrixWorld();
    light.intensity = night && leaving === 0 ? 9000 : 0;
    // it sees you from the air: out in the open, within ~150 m of under it
    const hd = Math.hypot(player.pos.x - heli.pos.x, player.pos.z - heli.pos.z);
    police.heliSees = leaving === 0 && !S.indoors && hd < 150 && game.collision.raycast(heli.pos.x, heli.pos.y - 2, heli.pos.z, player.pos.x, player.pos.y + 1.6, player.pos.z) > 0.97;
    if (leaving > 25) { scene.remove(heli.group); heli = null; light.intensity = 0; }
  }

  // ---------------- roadblocks
  const blocks = [];
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.6 });
  let blockT = 20;
  function placeRoadblock() {
    const v = S.vehicle, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const r = nearestRoad(game.graph, v.pos.x + fx * 170, v.pos.z + fz * 170);
    if (!r || r.dist > 20) return false;
    const across = Math.atan2(r.tz, -r.tx); // perpendicular to the road
    const cars = [];
    for (const side of [-1, 1]) {
      const c = police.spawnCar?.(new THREE.Vector3(r.x, 0, r.z)); if (!c || c.tank) continue;
      c.v.pos.set(r.x + r.tz * side * 2.6, game.collision.surface(r.x, r.z, 60) + 0.05, r.z - r.tx * side * 2.6);
      c.v.heading = across + (side > 0 ? 0.3 : -0.3); c.v.siren = true; c.v.sync?.(0);
      police.deploy?.(c); cars.push(c);
    }
    // the stinger, across the road a few metres in front of the cars
    const sx = r.x - r.tx * 9, sz = r.z - r.tz * 9;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.35), spikeMat);
    strip.position.set(sx, game.collision.surface(sx, sz, 60) + 0.03, sz); strip.rotation.y = Math.atan2(r.tx, r.tz) + Math.PI / 2; strip.userData.noHit = true;
    scene.add(strip);
    blocks.push({ x: r.x, z: r.z, sx, sz, tx: r.tx, tz: r.tz, strip, cars, t: 0, sprung: false });
    police.radio?.('Roadblock\'s up on his route. Stinger out.', 1);
    return true;
  }
  function updateRoadblocks(dt) {
    if (police.wanted >= 3 && S.mode === 'car' && !S.vehicle?.isBoat && !S.vehicle?.isAir && Math.abs(S.vehicle.speed || 0) > 10 && blocks.length < 1) {
      if ((blockT -= dt) <= 0) { blockT = 45 + rnd() * 30; placeRoadblock(); }
    }
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]; b.t += dt;
      const v = S.mode === 'car' ? S.vehicle : null;
      if (v && !b.sprung) {
        // over the stinger: within its length, across its line
        const ox = v.pos.x - b.sx, oz = v.pos.z - b.sz, along = Math.abs(ox * b.tz - oz * b.tx), cross = Math.abs(ox * b.tx + oz * b.tz);
        if (along < 4.6 && cross < 1.2) { b.sprung = true; v.flats = true; hud.toast('The stinger shreds your tyres!', 2.4); game.audio?.thud?.(1.2); }
      }
      if (b.t > 90 || police.wanted === 0 || Math.hypot(b.x - player.pos.x, b.z - player.pos.z) > 450) { scene.remove(b.strip); blocks.splice(i, 1); }
    }
  }
  // shredded tyres: slow, and the car pulls and shimmies (main.js calls this before the physics)
  game.flatTyres = (v, ctl, dt) => {
    if (!v?.flats) return;
    v._flatT = (v._flatT || 0) + dt;
    ctl.throttle = (ctl.throttle || 0) * 0.5; ctl.nitro = false;
    ctl.steer = (ctl.steer || 0) + Math.sin(v._flatT * 7) * 0.12 + 0.06;
    if (Math.abs(v.speed || 0) > 15) v.vel.multiplyScalar(0.985);
  };

  // ---------------- bribes
  let bribeCool = 0;
  const bribeCop = () => (police.wanted !== 1 || police.heat > 1 || S.mode !== 'foot' || bribeCool > performance.now()) ? null
    : peds.list.find((p) => p.role === 'cop' && p.mode !== 'dead' && p.pos.distanceTo(player.pos) < 3) || null;
  function bribe(a, free) {
    const cop = bribeCop();
    if (!cop) return '';
    const amount = 150 + Math.round((career.p.level || 1) * 25);
    if (free && a.enter) {
      a.enter = false; bribeCool = performance.now() + 20000;
      if (S.money < amount) { hud.toast('You don\'t have that kind of money on you.', 2); return ''; }
      const takes = rnd() < 0.55;
      const outcome = () => {
        if (takes) { career.spend(amount); hud.toast(`Officer: "I didn't see anything. Move along." (-$${amount})`, 3); police.clear?.(); }
        else { hud.toast('Officer: "Are you trying to bribe a police officer?"', 2.6); police.wanted = Math.min(5, police.wanted + 1); police.heat = Math.max(police.heat, 2); police.cool = 0; }
      };
      // (A2) a fold of bills, held low; they take it and pocket it, or look at it and then at you
      const A = game.acts;
      if (!A) { outcome(); return ''; }
      const who = A.fromPed(cop);
      const beats = takes ? A.payBeats(who, 'give', 1.2)
        : [{ face: cop.pos, t: 0.35 }, { t: 1.3, start: (ctx) => A.hold(ctx, A.prop('cash')), ik: (F, k, ctx, P) => ctx.held && A.carry(P, F, ctx.held, false, 0.28, 0.2), each: (dt) => who.face(player.pos, dt) }];
      const run = A.play(beats, { done: () => { who.release(); outcome(); } });
      if (!run) { who.release(); outcome(); }
      return '';
    }
    return `${keyHint(game)} offer the officer $${amount}`;
  }

  // ---------------- the radio: close by, or with a scanner
  const scannerOwned = () => { const id = game.tools?.list?.find((t) => /police scanner/i.test(t.name))?.id; return !!(id && career.p.tools?.[id]); };
  function wrapRadio() {
    if (!police.onShout || police.onShout.sbWrapped) return;
    const raw = police.onShout;
    const w = (line) => { if (police.nearPolice(90) || scannerOwned() || game.crew?.radioHere?.()) raw(line); };
    w.sbWrapped = true; police.onShout = w;
  }

  return {
    update(dt, a, free) {
      wrapRadio();
      updateHeli(dt);
      updateRoadblocks(dt);
      return bribe(a, free);
    },
    get heli() { return heli; }, get roadblocks() { return blocks.length; }, get blockList() { return blocks; }, get searchlight() { return light.intensity; },
    roadblockNow: () => S.mode === 'car' && placeRoadblock(),
    bribeHere: () => !!bribeCop(), // (main.js: an officer at your shoulder beats getting into a car)
  };
}
