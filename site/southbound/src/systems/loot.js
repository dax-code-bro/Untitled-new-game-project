// Searching the dead (no more cash floating over bodies).
//
// When someone dies their pockets are settled there and then: an officer's sidearm (a SWAT
// officer's rifle) falls beside him, and he may have a little cash; a civilian with a gun out drops
// it, one with a gun or knife still hidden has it found on him; anyone else has a fair chance of
// some cash and a very rare one of a pistol. Walk
// up to a body and search it: you crouch over it for a moment and take what's there. A dropped
// gun lies on the ground until someone picks it up.
import * as THREE from 'three';
import { WEAPONS, buildWeaponModel } from '../entities/arsenal.js';

const SEARCH_T = 1.6;

export function installLoot(game) {
  const { peds, interact, player, combat, S, hud, scene } = game;
  const bodies = [], guns = [];
  const rnd = Math.random;

  const take = (id) => {
    const w = WEAPONS[id];
    combat.give(id);
    const am = combat.ammo[id]; if (am && !w.melee) am.reserve = (am.reserve || 0) + Math.max(6, (w.mag || 12));
  };
  const dropGun = (id, at, heading) => {
    const w = WEAPONS[id];
    if (!w) return;
    const m = buildWeaponModel(w);
    m.traverse((o) => { o.userData.noHit = true; if (o.isMesh) o.castShadow = true; });
    const a = heading + (rnd() - 0.5) * 1.6, r = 0.5 + rnd() * 0.5;
    const x = at.x + Math.sin(a) * r, z = at.z + Math.cos(a) * r, y = game.collision.surface(x, z, at.y + 1) + 0.03;
    m.position.set(x, y, z); m.rotation.set(Math.PI / 2, rnd() * Math.PI * 2, 0, 'YXZ');
    scene.add(m);
    const g = { id, m, t: 600 };
    g.point = interact.add({ x, z, y, r: 1.4, marker: false, label: `Pick up the ${w.name}`, use: () => {
      const got = () => { take(id); hud.toast(`Picked up: ${w.name}`, 1.6); remove(g); };
      // (A2) crouch for it: your hand closes on it and it comes up with you
      if (game.acts && game.S.mode === 'foot' && !game.S.doorWalk) { g.point.show = () => false; const run = game.acts.play(game.acts.pickupBeats(m, { x, y, z }), { done: got }); if (run) return; }
      got();
    } });
    guns.push(g);
  };
  const remove = (g) => { scene.remove(g.m); interact.remove(g.point); const i = guns.indexOf(g); if (i >= 0) guns.splice(i, 1); };

  // what someone had on them, settled when they die
  const settle = (p) => {
    const loot = { cash: 0, gun: null };
    if (p.gun) p.gun.visible = false; // the one in his hand: a real one is laid on the ground instead
    if (p.role === 'cop') {
      if (!p.disarmed) dropGun(p.swat ? 'rifle_01' : 'pistol', p.pos, p.heading); // (a disarmed officer's gun is already on the ground)
      if (rnd() < 0.5) loot.cash = 10 + ((rnd() * 60) | 0);
    } else {
      // a gun he had out falls from his hand; one still in his waistband is found when he's searched
      const held = p.disarmed ? null : p.weaponId && WEAPONS[p.weaponId] ? p.weaponId : (p.gun || ['foe', 'hunter', 'mugger', 'armedciv'].includes(p.role)) ? 'pistol' : null;
      if (held) dropGun(held, p.pos, p.heading);
      else if (!p.disarmed && p.carry && WEAPONS[p.carry]) loot.gun = p.carry;
      if (rnd() < 0.55) loot.cash = 2 + ((rnd() * 58) | 0);
      if (!held && !p.carry && rnd() < 0.015) loot.gun = 'pistol'; // very rare: a pistol in a pocket
    }
    return loot;
  };

  const prevDeath = peds.onDeath;
  peds.onDeath = (p, from, info) => {
    prevDeath?.(p, from, info);
    const b = { p, loot: settle(p), searched: false };
    b.point = interact.add({ x: p.pos.x, z: p.pos.z, y: p.pos.y, r: 1.6, marker: false,
      label: () => (b.searched ? 'Nothing left on them' : p.role === 'cop' ? 'Search the officer' : 'Search the body'),
      use: () => { if (!b.searched && !S.search && S.mode === 'foot') startSearch(b); } });
    bodies.push(b);
  };

  const startSearch = (b) => {
    S.search = { b, t: SEARCH_T, prevOverride: S.override };
    S.override = { moveX: 0, moveY: 0, sprint: false, jump: false };
    player.heading = Math.atan2(b.p.pos.x - player.pos.x, b.p.pos.z - player.pos.z);
    player.h.play('Crouch_Idle_Loop', 0.2, 1, true); player.h.locked = SEARCH_T;
  };
  const finishSearch = (b) => {
    b.searched = true;
    const parts = [];
    if (b.loot.cash) { S.money += b.loot.cash; parts.push(`$${b.loot.cash}`); }
    if (b.loot.gun) { take(b.loot.gun); parts.push(`a ${WEAPONS[b.loot.gun].name}`); }
    hud.toast(parts.length ? `Found ${parts.join(' and ')}` : 'Nothing on them', 1.8);
  };

  return {
    update(dt) {
      // the search in progress
      if (S.search) {
        const s = S.search;
        s.t -= dt;
        if (s.t > SEARCH_T - 0.6 && s.t <= SEARCH_T - 0.6 + dt) player.h.play('Interact', 0.15, 1, true); // the hands go in
        if (s.t <= 0 || S.mode !== 'foot' || S.dead > 0) {
          if (s.t <= 0) finishSearch(s.b);
          S.override = s.prevOverride; S.search = null;
        }
      }
      // keep each search point on its body (it may have been thrown), drop the ones that are gone
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (!peds.list.includes(b.p)) { interact.remove(b.point); bodies.splice(i, 1); continue; }
        b.point.x = b.p.pos.x; b.point.z = b.p.pos.z; b.point.y = b.p.pos.y;
      }
      for (let i = guns.length - 1; i >= 0; i--) if ((guns[i].t -= dt) <= 0 || guns[i].m.position.distanceTo(player.pos) > 400) remove(guns[i]);
    },
    get bodies() { return bodies.length; }, get guns() { return guns.length; },
  };
}
