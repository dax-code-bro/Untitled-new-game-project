// What happens to people who get shot and live.
//  - A leg wound: they limp, bent over, and can't run.
//  - An arm wound: whoever was holding a gun drops it (you can pick it up).
//  - A plate or helmet stopping a round knocks them back but doesn't wound.
//  - Badly hurt, people go down and sit there bleeding. In town an
//    ambulance comes for them; out in the country they bleed out.
//  - A downed police officer's partner runs over, drags them out of the line
//    of fire and waits with them for the ambulance.
//  - You can help a downed civilian yourself with a bandage.
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { WEAPONS, buildWeaponModel } from '../entities/arsenal.js';
import { regionAt } from '../world/layout.js';
import { keyHint, roadPointAround } from './world-util.js';

const OFFICER_DOWN = ['Officer down! Officer down!', 'I got you, I got you. Stay with me.', 'Shots fired, officer hit! Send EMS!'];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function installWounds(game) {
  const { scene, peds, lib, hud, player, collision, interact, combat, career, S } = game;
  const P = career.p;
  const downed = [], drops = [], crews = [];
  const near = (p, r) => p.pos.distanceTo(player.pos) < r;

  // a dropped gun you can pick up
  const dropGun = (p, id) => {
    const w = WEAPONS[id]; if (!w) return;
    const m = buildWeaponModel(w);
    m.position.set(p.pos.x + Math.sin(p.heading) * 0.6, collision.surface(p.pos.x, p.pos.z, p.pos.y + 1) + 0.04, p.pos.z + Math.cos(p.heading) * 0.6);
    m.rotation.set(Math.PI / 2, 0, Math.random() * 6); m.traverse((o) => { o.userData.noHit = true; });
    scene.add(m);
    const d = { m, id, t: 120 };
    d.pt = interact.add({ x: m.position.x, z: m.position.z, r: 1.4, label: () => `${keyHint(game)} pick up the ${w.name}`, show: () => S.mode === 'foot', use: () => {
      combat.give(id); const a = combat.ammo[id]; if (a) a.reserve += w.clip || 10;
      hud.toast(`Picked up: ${w.name}`, 1.8); remove(d);
    } });
    drops.push(d);
  };
  const remove = (d) => { scene.remove(d.m); interact.remove(d.pt); drops.splice(drops.indexOf(d), 1); };

  const goDown = (p) => {
    const W = p.wound;
    if (W.down) return;
    W.down = true; W.bleedOut = 70 + Math.random() * 60; W.downT = 0;
    p.speed = 0; p.mode = p.mode === 'dead' ? 'dead' : 'downed';
    p.h.play('Death01', 0.2, 0.9, true); // down on the ground, still alive
    downed.push(p);
    if (p.role === 'cop') {
      if (near(p, 60)) hud.toast(`Police radio: "${pick(OFFICER_DOWN)}"`, 3);
      // the nearest partner comes for them
      let best = null, bd = 50;
      for (const q of peds.list) {
        if (q === p || q.role !== 'cop' || q.mode === 'dead' || q.wound?.down || q.rescue) continue;
        const d = q.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = q; }
      }
      if (best) { best.rescue = { target: p, phase: 'run', t: 0 }; p.rescuer = best; }
    } else if (near(p, 25) && p.role !== 'foe' && p.role !== 'hunter') {
      W.help = interact.add({ x: p.pos.x, z: p.pos.z, r: 1.6, label: () => `${keyHint(game)} help them (bandage)`, show: () => S.mode === 'foot' && W.down && !W.saved,
        use: () => {
          const has = ['bandage', 'dressing', 'gauze', 'ifak'].find((k) => P.med?.[k] > 0);
          if (!has) { hud.toast('You need a bandage or a dressing', 2); return; }
          P.med[has]--; W.saved = true; W.bleedOut = 1e9; player.h.play('Interact', 0.2);
          hud.toast('"Thank you... thank you. God bless you."', 2.5);
          if (Math.random() < 0.6) career.earn(20 + ((Math.random() * 60) | 0), 'a grateful stranger');
        } });
    }
  };

  const prevDamage = peds.damage.bind(peds);
  peds.damage = (p, amount, from, info) => {
    const killed = prevDamage(p, amount, from);
    if (killed || p.mode === 'dead') {
      if (p.wound?.help) interact.remove(p.wound.help);
      // whatever they were carrying falls where they drop
      if (killed && !p.dropped && near(p, 80) && (p.gun || ['cop', 'foe', 'hunter', 'mugger', 'armedciv'].includes(p.role))) {
        p.dropped = true; if (p.gun) { scene.remove(p.gun); p.gun = null; }
        dropGun(p, p.weaponId && WEAPONS[p.weaponId] ? p.weaponId : 'pistol');
      }
      return killed;
    }
    if (!info) return killed;
    const W = (p.wound = p.wound || { leg: 0, arm: 0 });
    if (info.stopped) { p.h.play('Hit_Chest', 0.05, 1.5, true); return false; }
    if (info.part === 'leg') W.leg = 1;
    if (info.part === 'arm' && !p.disarmed && (p.gun || p.role === 'cop' || p.role === 'foe' || p.role === 'hunter' || p.role === 'mugger')) {
      p.disarmed = true;
      if (p.gun) { p.gun.visible = false; scene.remove(p.gun); p.gun = null; }
      if (p.pistol) p.pistol.visible = false;
      dropGun(p, p.weaponId || 'pistol');
      if (p.role !== 'cop') { p.role = undefined; p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 12; }
    }
    const maxHp = p.maxHp || (p.role === 'cop' ? (p.swat ? 220 : 120) : 100);
    if (p.hp < maxHp * 0.3 && Math.random() < 0.7) goDown(p);
    else if (W.leg && p.hp < maxHp * 0.55 && Math.random() < 0.35) goDown(p);
    return killed;
  };

  // wrap behaviour: limping, the downed, and partners dragging them
  const prevThink = peds.think.bind(peds);
  const _v = new THREE.Vector3();
  peds.think = (p, dt, pl) => {
    if (p.mode === 'dead') { if (p.wound?.down) { p.h.layer('Crouch_Idle_Loop', 0); } return prevThink(p, dt, pl); }
    const W = p.wound;
    if (W?.down) {
      W.downT += dt;
      p.h.model.rotation.y = Math.sin(W.downT * 1.3) * 0.05 + Math.sin(W.downT * 3.1) * 0.02; // writhing
      if (near(p, 12) && (W.moan = (W.moan ?? 4) - dt) <= 0) {
        W.moan = 9 + Math.random() * 8;
        hud.toast(pick(['*groaning*', '"Help... somebody help me..."', '"Oh God, oh God..."', '"I can\'t feel my leg..."']), 1.6);
      }
      if ((W.bleedOut -= dt) <= 0) { prevDamage(p, 9999, null); p.mode = 'dead'; }
      return;
    }
    if (p.rescue) return rescueThink(p, dt);
    const x0 = p.pos.x, z0 = p.pos.z;
    const r = prevThink(p, dt, pl);
    if (W?.leg) {
      const dx = p.pos.x - x0, dz = p.pos.z - z0, moving = dx * dx + dz * dz > 1e-6;
      p.pos.x = x0 + dx * 0.32; p.pos.z = z0 + dz * 0.32;
      p.h.layer('Crouch_Idle_Loop', moving ? 0.55 : 0.25);
      W.ph = (W.ph || 0) + dt * (moving ? 7 : 0);
      p.h.model.rotation.z = moving ? Math.max(0, Math.sin(W.ph)) * 0.09 : 0;
      p.h.model.position.y = moving ? -Math.max(0, Math.sin(W.ph)) * 0.05 : 0;
      if (p.h.current && p.h.current.timeScale > 0.9 && moving) p.h.current.timeScale = 0.7;
    }
    return r;
  };

  function rescueThink(p, dt) {
    const R = p.rescue, v = R.target;
    if (!v || v.mode === 'dead' && !v.wound?.down) { p.rescue = null; return; }
    R.t += dt;
    const dx = v.pos.x - p.pos.x, dz = v.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (R.phase === 'run') {
      p.heading = Math.atan2(dx, dz);
      if (d > 1.0) { const sp = 4.2; p.pos.x += (dx / d) * sp * dt; p.pos.z += (dz / d) * sp * dt; p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5); p.h.play('Jog_Fwd_Loop', 0.2, 1.15); }
      else { R.phase = 'kneel'; R.t = 0; p.h.play('Crouch_Idle_Loop', 0.2); if (near(p, 40)) hud.toast(`"${pick(OFFICER_DOWN.slice(1))}"`, 2.5); }
    } else if (R.phase === 'kneel') {
      if (R.t > 1.8) {
        R.phase = 'drag'; R.t = 0;
        // away from the shooter
        _v.set(p.pos.x - player.pos.x, 0, p.pos.z - player.pos.z).normalize();
        R.dir = _v.clone(); R.dist = 0; v.dragged = true;
      }
    } else if (R.phase === 'drag') {
      // walk backwards, bent over, pulling them by the vest
      p.heading = Math.atan2(-R.dir.x, -R.dir.z);
      const sp = 1.05;
      const nx = p.pos.x + R.dir.x * sp * dt, nz = p.pos.z + R.dir.z * sp * dt;
      const res = collision.resolve(nx, nz, 0.35, p.pos.y, 1.8);
      p.pos.x = res.x; p.pos.z = res.z; p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      R.dist += sp * dt;
      p.h.play('Walk_Loop', 0.2, -0.75); p.h.layer('Crouch_Idle_Loop', 0.6);
      v.pos.set(p.pos.x - R.dir.x * 0.95, collision.surface(p.pos.x - R.dir.x * 0.95, p.pos.z - R.dir.z * 0.95, p.pos.y + 0.5), p.pos.z - R.dir.z * 0.95);
      v.heading = p.heading + Math.PI;
      if (R.dist > 10 || res.hit) { R.phase = 'wait'; R.t = 0; p.h.layer('Crouch_Idle_Loop', 0); p.h.play('Crouch_Idle_Loop', 0.3); v.dragged = false; }
    } else if (R.phase === 'wait') {
      p.heading = Math.atan2(dx, dz);
      if (R.t > 40 && !v.wound.ems) { v.wound.bleedOut = 1e9; }
    }
  }

  // ambulances for the wounded in town
  const sendEMS = (p) => {
    const r = roadPointAround(game.graph, p.pos.x, p.pos.z, 6, 30);
    if (!r || !game.Vehicle) return false;
    const amb = new game.Vehicle(lib, 'ambulance');
    amb.pos.set(r.x, collision.surface(r.x, r.z, 300), r.z); amb.heading = Math.atan2(p.pos.x - r.x, p.pos.z - r.z); amb.siren = true; amb.sync?.(0); scene.add(amb.group);
    const medics = [0, 1].map((k) => { const h = new Human(lib, lib.peopleIds[(k + 3) % lib.peopleIds.length]); h.root.position.set(r.x + (k ? 1.2 : -1.2), amb.pos.y, r.z); scene.add(h.root); h.play('Jog_Fwd_Loop', 0); return h; });
    crews.push({ p, amb, medics, t: 0, phase: 'go' });
    if (near(p, 80)) hud.toast('An ambulance has arrived', 2);
    return true;
  };

  return {
    update(dt) {
      for (let i = downed.length - 1; i >= 0; i--) {
        const p = downed[i], W = p.wound;
        if (!peds.list.includes(p)) { if (W.help) interact.remove(W.help); downed.splice(i, 1); continue; }
        if (p.mode === 'dead') { if (W.help) interact.remove(W.help); downed.splice(i, 1); continue; }
        if (W.help) { W.help.x = p.pos.x; W.help.z = p.pos.z; }
        const reg = regionAt(p.pos.x, p.pos.z), town = reg.sub === 'City' || reg.sub === 'Town';
        if (town && !W.ems && W.downT > (p.role === 'cop' ? 20 : 30) && !(p.rescuer && p.rescuer.rescue?.phase === 'drag')) { W.ems = sendEMS(p) || 'none'; if (W.ems === true) W.bleedOut = 1e9; }
      }
      for (let i = crews.length - 1; i >= 0; i--) {
        const c = crews[i]; c.t += dt;
        const target = c.p.pos;
        for (const h of c.medics) {
          const dx = target.x - h.root.position.x, dz = target.z - h.root.position.z, d = Math.hypot(dx, dz);
          if (c.phase === 'go' && d > 1.1) { h.root.position.x += (dx / d) * 3.4 * dt; h.root.position.z += (dz / d) * 3.4 * dt; h.root.position.y = collision.surface(h.root.position.x, h.root.position.z, h.root.position.y + 0.5); h.root.rotation.y = Math.atan2(dx, dz); h.play('Jog_Fwd_Loop', 0.2); }
          else if (c.phase === 'go') { h.play('Crouch_Idle_Loop', 0.3); h.root.rotation.y = Math.atan2(dx, dz); }
          h.update(dt);
        }
        if (c.phase === 'go' && c.medics.every((h) => h.root.position.distanceTo(target) < 1.3)) { c.phase = 'treat'; c.t = 0; }
        if (c.phase === 'treat' && c.t > 6) {
          // onto the stretcher and away
          c.p.h.root.visible = false; c.p.mode = 'dead'; c.p.timer = 0; c.p.wound.down = false;
          if (c.p.rescuer) c.p.rescuer.rescue = null;
          c.phase = 'leave'; c.t = 0;
        }
        if (c.phase === 'leave' && c.t > 6) { scene.remove(c.amb.group); for (const h of c.medics) scene.remove(h.root); crews.splice(i, 1); }
      }
      for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; if ((d.t -= dt) <= 0) remove(d); }
    },
  };
}
