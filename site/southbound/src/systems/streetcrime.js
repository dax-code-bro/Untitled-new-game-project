// People who carry, and people who talk.
//  - Some pedestrians carry a handgun (more of them out in the country) and
//    a few carry a knife. Hurt or threaten one and they may fight back
//    instead of running.
//  - Crimes are reported by people who saw them. If a police officer saw it,
//    it's reported at once. Otherwise a witness runs, stops, and calls 911:
//    reach them first and you can try to pay them to keep quiet. Some take
//    the money, some won't, and some take it and call anyway.
//  - With nobody around to see, nobody calls.
import * as THREE from 'three';
import { WEAPONS, buildWeaponModel } from '../entities/arsenal.js';
import { GunPose } from '../entities/gunpose.js';
import { regionAt } from '../world/layout.js';
import { keyHint } from './world-util.js';
import { locomotion } from '../entities/human.js';

const PRICE = { breakin: 400, trespass: 150, theft: 300, shots: 150, assault: 250, weapon: 120, kill: 900, carjack: 300, disturbance: 80 };
const SEVERITY = { breakin: 3, trespass: 1, theft: 2, disturbance: 1, weapon: 1, shots: 2, carjack: 2, assault: 3, robbery: 4, kill: 5 };
const pick = (a) => a[(Math.random() * a.length) | 0];

export function installStreetCrime(game) {
  const { scene, peds, player, hud, police, interact, career, S, collision, combat } = game;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  // ---------------- arming
  const armedList = [];
  const arm = (p, id) => {
    armedList.push(p);
    p.armed = id; p.weaponId = id;
    p.gun = buildWeaponModel(WEAPONS[id]); p.gun.visible = false; p.gun.traverse((o) => { o.userData.noHit = true; }); scene.add(p.gun);
    p.pose = new GunPose(p.h);
  };
  game.muggerWeapon = () => (Math.random() < 0.45 ? pick(['kitchen_knife', 'switchblade', 'hunting_knife']) : 'pistol');

  // ---------------- fighting back
  const prevDamage = peds.damage.bind(peds);
  peds.damage = (p, amount, from, info) => {
    const killed = prevDamage(p, amount, from, info);
    if (!killed && p.mode !== 'dead' && p.carry && !p.role && !p.disarmed && Math.random() < 0.55 && from && from.distanceTo(player.pos) < 4) startFight(p);
    return killed;
  };
  game.armAndFight = (p, id) => { p.carry = id; startFight(p); }; // (a shopkeeper with a shotgun: systems/robbery.js)
  const startFight = (p) => {
    if (!p.gun) arm(p, p.carry);
    p.role = 'armedciv'; p.mode = 'fight'; p.fightT = 0;
    if (p.pos.distanceTo(player.pos) < 40) hud.toast(pick(['"You picked the wrong guy!"', '"Back off! I\'m armed!"', '"Big mistake, buddy."', '"Not today!"']), 2);
  };
  peds.armedThink = (p, dt) => {
    const pl = player.pos, dx = pl.x - p.pos.x, dz = pl.z - p.pos.z, d = Math.hypot(dx, dz);
    p.fightT += dt;
    if (d > 70 || S.dead > 0 || p.disarmed) { p.role = undefined; p.mode = 'flee'; p.threat = pl.clone(); p.timer = 10; if (p.gun) p.gun.visible = false; return; }
    p.heading = Math.atan2(dx, dz);
    const knife = WEAPONS[p.armed]?.melee;
    const reach = knife ? 1.3 : 15;
    if (d > reach) {
      const sp = knife ? 4.2 : 2.4;
      p.pos.x += (dx / d) * sp * dt; p.pos.z += (dz / d) * sp * dt;
      const r = collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8); p.pos.x = r.x; p.pos.z = r.z;
      p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      const [c, s] = locomotion(sp); p.h.play(c, 0.2, s);
    } else if ((p.atkT = (p.atkT ?? 0.6) - dt) <= 0) {
      if (knife) {
        p.atkT = 0.8 + Math.random() * 0.5; p.h.play('Punch_Jab', 0.05, 1.3, true);
        setTimeout(() => { if (p.mode !== 'dead' && p.pos.distanceTo(player.pos) < 1.8) game.hurtPlayer(10 + Math.random() * 9, p.pos, 0.5); }, 220);
      } else {
        p.atkT = 1.0 + Math.random() * 0.9; p.h.play('Pistol_Shoot', 0.05, 1.3, true);
        game.audio?.gunshot(0.55);
        _a.set(p.pos.x, p.pos.y + 1.4, p.pos.z); _b.set(pl.x, pl.y + 1.2, pl.z);
        game.tracer?.(_a, _b);
        const chance = Math.max(0.12, 0.6 - d / 35) * (player.speed > 4 ? 0.6 : 1);
        if (Math.random() < chance) game.hurtPlayer(7 + Math.random() * 6, p.pos, 2);
        peds.panic(p.pos, 30);
      }
    } else if (p.h.locked <= 0) p.h.play(knife ? 'Idle_Loop' : 'Pistol_Aim_Neutral', 0.15);
    if (p.gun) { p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading; p.h.root.updateMatrixWorld(true); p.pose.attachToHand(p.gun, p.pose.R); p.gun.visible = true; }
  };
  // ---------------- a gun pointed at you
  const HANDS = ['"Whoa, whoa! Don\'t shoot!"', '"Take whatever you want, man!"', '"Please, I got kids!"', '"Easy, easy... I\'m not doing nothing."', '"Okay! Okay! Hands up!"'];
  const BEG = ['"Please... please don\'t..."', '"I won\'t tell anybody, I swear!"', '"Oh God, oh God..."'];
  const handsPost = (p) => () => {
    if (p.role !== 'handsup' || !p.aimRx) { p.h.post = null; return; }
    p.pose = p.pose || new GunPose(p.h);
    if (!p.pose.ok) return;
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading; p.h.root.updateMatrixWorld(true);
    const F = p.pose.frame(p.heading);
    const k = Math.min(1, p.aimRx.age * 3); // the arms come up, they don't snap
    const top = F.chest.clone().addScaledVector(F.up, (p.aimRx.kind === 'beg' ? 0.42 : 0.6) * k - 0.25 * (1 - k));
    p.pose.reach(p.pose.R, top.clone().addScaledVector(F.right, 0.24).addScaledVector(F.fw, 0.08), F, 'R');
    p.pose.reach(p.pose.L, top.clone().addScaledVector(F.right, -0.24).addScaledVector(F.fw, 0.08), F, 'L');
  };
  game.aimedAt = (p) => {
    if (p.role === 'handsup') { p.aimRx.t = 2.5; return; }
    if (p.aimCool > 0) return;
    if (p.carry && Math.random() < 0.3) { startFight(p); return; }
    const r = Math.random(), kind = r < 0.6 ? 'hands' : r < 0.82 ? 'flee' : 'beg';
    const near = p.pos.distanceTo(player.pos) < 25;
    if (kind === 'flee') { p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 10; p.aimCool = 20; if (near) hud.toast(pick(['"He\'s got a gun!"', '"Help! Somebody help!"']), 1.6); return; }
    p.role = 'handsup'; p.aimRx = { kind, t: 2.5, age: 0 }; p.h.post = handsPost(p);
    if (near) hud.toast(pick(kind === 'beg' ? BEG : HANDS), 2);
  };
  const handsThink = (p, dt) => {
    const R = p.aimRx; R.t -= dt; R.age += dt;
    p.heading = Math.atan2(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
    p.h.play(R.kind === 'beg' ? 'Crouch_Idle_Loop' : 'Idle_Loop', 0.25);
    if (R.t <= 0) {
      // you lowered the gun: they run, and most of them call it in
      p.role = undefined; p.aimRx = null; p.h.post = null; p.aimCool = 30;
      p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 10;
      if (Math.random() < 0.7) game.reportCrime?.('weapon', p.pos, p);
    }
  };
  const prevThink = peds.think.bind(peds);
  peds.think = (p, dt, pl) => {
    if (p.aimCool > 0) p.aimCool -= dt;
    if (p.mode !== 'dead' && p.role === 'handsup') return handsThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'armedciv') return peds.armedThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'witness') return witnessThink(p, dt);
    return prevThink(p, dt, pl);
  };

  // ---------------- witnesses
  const witnesses = [];
  const copSees = (pos) => {
    for (const p of peds.list) if (p.role === 'cop' && p.mode !== 'dead' && !p.wound?.down && p.pos.distanceTo(pos) < 40) return true;
    for (const c of police.cars) if (c.v.pos.distanceTo(pos) < 30) return true;
    for (const v of police.patrols?.() || []) if (v.pos.distanceTo(pos) < 35) return true;
    return false;
  };
  // report a crime: the police know at once if one of them saw it, otherwise
  // a witness has to call it in
  game.reportCrime = (kind, pos, victim) => {
    if (kind === 'copShot' || kind === 'copKill' || copSees(pos)) { police.crime(kind); return 'police'; }
    const existing = witnesses.find((w) => w.p.mode !== 'dead' && w.p.pos.distanceTo(pos) < 60);
    if (existing) { if ((SEVERITY[kind] || 1) > (SEVERITY[existing.kind] || 1)) existing.kind = kind; existing.crimes.push(kind); return 'witness'; }
    let best = null, bd = 45;
    for (const p of peds.list) {
      if (p === victim || p.mode === 'dead' || p.role || p.wound?.down || p.scripted) continue;
      const d = p.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return 'nobody';
    best.role = 'witness'; best.mode = 'witness';
    const w = { p: best, kind, crimes: [kind], t: 0, call: 9 + Math.random() * 5, phase: 'run', honest: Math.random() < 0.28, crook: Math.random() < 0.12 };
    w.pt = interact.add({ x: best.pos.x, z: best.pos.z, r: 2.4, marker: false, blip: { color: '#ff5050', size: 5, icon: '📞' },
      show: () => S.mode === 'foot' && best.role === 'witness',
      label: () => `${keyHint(game)} pay the witness to keep quiet · $${PRICE[w.kind] || 200} · ${Math.max(0, Math.ceil(w.call - w.t))}s`,
      use: () => bribe(w) });
    witnesses.push(w);
    hud.toast('Someone saw that and is calling the police. Stop them before they finish the call.', 3.5);
    return 'witness';
  };
  const bribe = (w) => {
    const cost = PRICE[w.kind] || 200;
    if (w.honest) { hud.toast(pick(['"Keep your money. I\'m calling them."', '"You think I can be bought?"', '"Get away from me!"']), 2.5); w.t = w.call; return; }
    if (!career.spend(cost)) return;
    player.h.play('Interact', 0.2);
    if (w.crook) { hud.toast('"Pleasure doing business." (they pocket it)', 2.5); w.t = w.call - 6; w.honest = true; return; }
    hud.toast(pick(['"Didn\'t see nothing."', '"What crime? I was looking at my phone."', '"We never talked."']), 2.5);
    done(w, false);
  };
  const done = (w, called) => {
    interact.remove(w.pt);
    witnesses.splice(witnesses.indexOf(w), 1);
    if (w.p.mode !== 'dead') { w.p.role = undefined; w.p.mode = 'flee'; w.p.threat = player.pos.clone(); w.p.timer = 8; }
    if (called) {
      for (const k of new Set(w.crimes)) police.crime(k);
      hud.toast(w.crook ? 'That witness took your money and called the cops anyway.' : 'A witness called the police.', 3);
    }
  };
  function witnessThink(p, dt) {
    const w = witnesses.find((x) => x.p === p);
    if (!w) { p.role = undefined; p.mode = 'flee'; p.timer = 5; p.threat = player.pos.clone(); return; }
    w.t += dt;
    const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    if (w.t < 3) { // get some distance first
      p.heading = Math.atan2(dx, dz);
      p.pos.x += (dx / d) * 5.5 * dt; p.pos.z += (dz / d) * 5.5 * dt;
      const r = collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8); p.pos.x = r.x; p.pos.z = r.z;
      p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      p.h.play('Sprint_Loop', 0.2, 0.9);
    } else {
      // on the phone, looking over their shoulder
      p.heading = Math.atan2(-dx, -dz);
      p.h.play('Idle_Talking_Loop', 0.3);
    }
    w.pt.x = p.pos.x; w.pt.z = p.pos.z;
  }

  // ---------------- pedestrians who carry
  let rollT = 0;
  return {
    witnesses,
    update(dt) {
      if ((rollT -= dt) <= 0) {
        rollT = 1;
        // guns of people who have left the area go with them
        for (let i = armedList.length - 1; i >= 0; i--) { const p = armedList[i]; if (!peds.list.includes(p)) { if (p.gun) scene.remove(p.gun); p.gun = null; armedList.splice(i, 1); } }
        for (const p of peds.list) {
          if (p.carryRolled || p.role === 'cop' || p.scripted) continue;
          p.carryRolled = true;
          const reg = regionAt(p.pos.x, p.pos.z), town = reg.sub === 'City' || reg.sub === 'Town';
          const r = Math.random();
          if (p.role === 'walker' || !town) { if (r < 0.22) p.carry = 'pistol'; else if (r < 0.3) p.carry = 'hunting_knife'; }
          else if (r < 0.1) p.carry = 'pistol'; else if (r < 0.15) p.carry = pick(['switchblade', 'kitchen_knife']);
        }
      }
      for (let i = witnesses.length - 1; i >= 0; i--) {
        const w = witnesses[i];
        if (w.p.mode === 'dead' || !peds.list.includes(w.p)) { done(w, false); continue; }
        if (w.p.role !== 'witness') { done(w, false); continue; }
        if (w.t >= w.call) done(w, true);
      }
      // brandishing a gun at someone armed can start a standoff
      if (combat.drawn && player.aiming && S.mode === 'foot') {
        for (const p of peds.list) {
          if (!p.carry || p.role || p.mode === 'dead' || p.standoffRolled) continue;
          if (p.pos.distanceTo(player.pos) > 12) continue;
          p.standoffRolled = true;
          if (Math.random() < 0.3) startFight(p);
        }
      }
    },
  };
}
void THREE;
