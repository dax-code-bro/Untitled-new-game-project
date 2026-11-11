// Things that happen while you're out and about, and the people who don't
// like you being on their turf.
//
// Random events (every couple of minutes, near you): a mugger demands your
// wallet; a robbery in progress you can break up; a broken-down car on a
// country road whose driver could use a hand; a fist fight outside a bar.
//
// Rival gangs: Los Halcones (the port), the Bayou Ravens (the swamp) and the
// Sierra Boys (the north hills) hang out on their turf, armed. Walk in and
// they warn you off; stay, or come in with a gun out, and they open fire.
import * as THREE from 'three';
import { Human, locomotion } from '../entities/human.js';
import { CITY, BAYOU, regionAt } from '../world/layout.js';
import { roadPointAround, keyHint } from './world-util.js';
import { dressMember, placeAccessories } from './gang.js';
import { makeSmoke, faceCamera } from '../world/fx.js';
import { wrapAngle } from '../util.js';

export const RIVALS = [
  { id: 'halcones', name: 'Los Halcones', where: 'the port warehouses', suit: [0.7, 0.12, 0.1], acc: ['bandana'], at: () => [CITY.x0 + 5 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch + 46],
    lines: ['You lost, guero? This is Halcones turf.', 'Turn around. Last warning.'] },
  { id: 'ravens', name: 'Bayou Ravens', where: 'the swamp', suit: [0.12, 0.12, 0.14], acc: ['beanie'], at: () => [BAYOU.x - 120, BAYOU.z + 80],
    lines: ['Ravens don\'t like visitors.', 'Keep walking, city boy.'] },
  { id: 'sierra', name: 'Sierra Boys', where: 'the north hills', suit: [0.35, 0.42, 0.25], acc: ['cap'], at: () => [420, -1650],
    lines: ['Private property. Ours.', 'Sierra Boys run these hills. Git.'] },
];

export function installWorldEvents(game) {
  const { scene, collision, hm, graph, lib, peds, player, hud, S, police, combat, career } = game;
  const P = career.p;
  P.rivals = P.rivals || {};
  const say = (who, line, t = 3) => (game.law?.say ? game.law.say(who, line, t) : hud.toast(`${who}: ${line}`, t));
  const inTown = (x, z) => { const r = regionAt(x, z); return r.sub === 'City' || r.sub === 'Town' || /village|hamlet/i.test(r.sub); };

  // ---- gunfire in town gets phoned in; out in the wilds only a witness can report it
  let reportT = 0;
  game.onShotFired = (pos) => {
    if (police.wanted > 0) return;
    if (inTown(pos.x, pos.z)) { if (reportT <= 0) reportT = 3 + Math.random() * 4; }
  };

  // ---- people for events
  const spawnPerson = (x, z, role, look) => {
    const id = lib.peopleIds[(Math.random() * lib.peopleIds.length) | 0];
    const h = look ? dressMember(lib, look) : new Human(lib, id);
    const p = { h, role, mode: 'walk', hp: 100, pos: new THREE.Vector3(x, collision.surface(x, z, 300), z), heading: 0, speed: 0, radius: 0.35, acc: 0, timer: 0, event: true };
    h.root.position.copy(p.pos);
    scene.add(h.root);
    peds.list.push(p);
    return p;
  };
  let ev = null, nextT = 70 + Math.random() * 60;

  // muggers and robbers walk up, point, demand
  peds.muggerThink = (p, dt) => {
    if (p.shootAt) return shootOut(p, p.shootAt, dt); // cornered by the police and won't give up
    if (p.facing && p.facing.mode !== 'dead') { // an officer has him covered: he freezes, gun on the officer, deciding
      p.heading = Math.atan2(p.facing.pos.x - p.pos.x, p.facing.pos.z - p.pos.z);
      if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15);
      p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
      if (p.gun && p.pose) { p.h.root.updateMatrixWorld(true); p.pose.attachToHand(p.gun, p.pose.R); p.gun.visible = true; }
      return;
    }
    const tp = p.target ? p.target.pos : game.situation().pos; // you, or your car if you're in one (R1)
    const dx = tp.x - p.pos.x, dz = tp.z - p.pos.z, d = Math.hypot(dx, dz);
    p.heading += wrapAngle(Math.atan2(dx, dz) - p.heading) * Math.min(1, dt * 6);
    if (d > 3.4) p.holding = false; // you stepped away: after you again
    if (d > 2.6 && !p.holding) {
      const sp = d > 12 ? 3.4 : 1.6;
      p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
      p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      const [c, s] = locomotion(sp); p.h.play(c, 0.2, s);
    } else { p.holding = true; if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15); }
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
    if (p.gun) { p.h.root.updateMatrixWorld(true); p.pose.attachToHand(p.gun, p.pose.R); p.gun.visible = true; }
  };
  peds.victimThink = (p, dt) => { if (p.h.locked <= 0) p.h.play('Crouch_Idle_Loop', 0.3); p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading; };
  peds.fighterThink = (p, dt) => {
    const o = p.opp; if (!o || o.mode === 'dead') { p.role = undefined; p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 8; return; }
    const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
    p.heading = Math.atan2(dx, dz);
    if ((p.punchT = (p.punchT ?? Math.random()) - dt) <= 0) { p.punchT = 0.8 + Math.random() * 0.7; p.h.play(Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross', 0.06, 1.2, true); if (Math.random() < 0.3) o.h.play('Hit_Chest', 0.08, 1.2, true); }
    else if (p.h.locked <= 0) p.h.play('Idle_Loop', 0.2);
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
  };
  // ---- an officer answering a robbery (R1): runs to cover with the robber in sight, orders him to drop
  // it; he gives up, runs, or shoots it out. Bystanders are already in cover by then.
  const shootOut = (p, foe, dt) => {
    if (!foe || foe.mode === 'dead' || !peds.list.includes(foe)) { p.shootAt = null; p.role = undefined; p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 12; return; }
    p.heading = Math.atan2(foe.pos.x - p.pos.x, foe.pos.z - p.pos.z);
    if ((p.fireT = (p.fireT ?? 0.8) - dt) <= 0) {
      p.fireT = 1.1 + Math.random() * 0.9;
      p.h.play('Pistol_Shoot', 0.05, 1.4, true); police.audio?.gunshot?.(0.5);
      peds.panic(p.pos, 45, { cover: true });
      if (Math.random() < 0.22) peds.damage(foe, 22 + Math.random() * 18, p.pos, { part: 'chest' });
    } else if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15);
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
    if (p.gun) { p.h.root.updateMatrixWorld(true); p.pose.attachToHand(p.gun, p.pose.R); p.gun.visible = true; }
  };
  const ORDERS = ['Police! Drop the weapon!', 'Drop it! Drop it now!', 'Police! Hands where I can see them!'];
  function callResponder(e) {
    let cop = null, bd = 95;
    for (const p of peds.list) if (p.role === 'cop' && p.mode !== 'dead' && !p.scripted && !p.inCar) { const d = Math.hypot(p.pos.x - e.m.pos.x, p.pos.z - e.m.pos.z); if (d < bd) { bd = d; cop = p; } }
    if (!cop) return null;
    cop.role = 'responder'; cop.resp = { e, t: 0, atT: 0, told: false, decided: false, cover: null };
    police.armCop?.(cop, true);
    return cop;
  }
  peds.responderThink = (p, dt) => {
    const R = p.resp, rob = R.e.m;
    const stand = () => { p.role = 'cop'; p.resp = null; p.drawn = false; police.poseGun?.(p, false); };
    R.t += dt;
    if (!rob || !peds.list.includes(rob) || rob.mode === 'dead' || R.t > 90 || (rob.mode === 'flee' && rob.pos.distanceTo(p.pos) > 45)) {
      if (rob && rob.mode === 'dead' && !R.said) { R.said = true; if (p.pos.distanceTo(player.pos) < 40) say('Officer', 'Suspect down! Need an ambulance here.', 3); }
      return stand();
    }
    if (rob.role === 'arrested') { // walk up, cuff him, take him away
      const d = p.pos.distanceTo(rob.pos);
      p.heading = Math.atan2(rob.pos.x - p.pos.x, rob.pos.z - p.pos.z);
      if (d > 1.3) police.walkCop(p, dt, 2.2);
      else if ((R.cuff = (R.cuff || 0) + dt) > 3) { scene.remove(rob.h.root); rob.h.dispose(); if (rob.gun) scene.remove(rob.gun); peds.list.splice(peds.list.indexOf(rob), 1); if (p.pos.distanceTo(player.pos) < 40) hud.toast('The robber is taken into custody', 2.5); return stand(); }
      else if (p.h.locked <= 0) p.h.play('Interact', 0.2, 0.7);
      police.poseGun?.(p, false);
      return;
    }
    if (!R.cover) R.cover = police.findCover(p, { pos: rob.pos }) || { x: p.pos.x, z: p.pos.z, low: false, here: true };
    const c = R.cover, dx = c.x - p.pos.x, dz = c.z - p.pos.z, dc = Math.hypot(dx, dz);
    if (dc > 0.5 && !c.here) {
      // blocked on the way (a wall, a parked car: officers don't path-find): kneel where he is instead
      const g = R.prog || (R.prog = { t: 0, x: p.pos.x, z: p.pos.z });
      if ((g.t += dt) > 1.5) { if (Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 0.8) c.here = true; R.prog = { t: 0, x: p.pos.x, z: p.pos.z }; }
      if (!c.here) { p.heading = Math.atan2(dx, dz); police.walkCop(p, dt, 5.6); police.poseGun?.(p, true); return; }
    }
    c.here = true;
    p.heading = Math.atan2(rob.pos.x - p.pos.x, rob.pos.z - p.pos.z);
    R.atT += dt;
    if (!R.told) { R.told = true; if (p.pos.distanceTo(player.pos) < 60) say('Officer', ORDERS[(Math.random() * ORDERS.length) | 0], 2.5); rob.facing = p; }
    if (!R.decided && R.atT > 2.5) {
      R.decided = true;
      const r = Math.random();
      if (r < 0.5) { rob.role = 'arrested'; if (rob.gun) rob.gun.visible = false; if (p.pos.distanceTo(player.pos) < 40) say('Robber', 'Okay, okay! I give up!', 2.5); }
      else if (r < 0.78) { rob.role = undefined; rob.mode = 'flee'; rob.threat = p.pos.clone(); rob.timer = 14; if (rob.gun) rob.gun.visible = false; }
      else { rob.shootAt = p; peds.panic(rob.pos, 45, { cover: true }); }
    }
    // in cover: low behind a car, aiming over it; shoot back if he's shooting
    if (rob.shootAt === p && (R.fireT = (R.fireT ?? 0.5) - dt) <= 0) {
      R.fireT = 0.8 + Math.random() * 0.6;
      p.h.play('Pistol_Shoot', 0.05, 1.4, true); police.audio?.gunshot?.(0.5);
      if (Math.random() < 0.38) peds.damage(rob, 30 + Math.random() * 25, p.pos, { part: 'chest' });
    } else if (p.h.locked <= 0) p.h.play(c.low && !rob.shootAt ? 'Crouch_Idle_Loop' : 'Pistol_Aim_Neutral', 0.15);
    police.poseGun?.(p, true);
  };
  peds.arrestedThink = (p) => { if (p.h.locked <= 0) p.h.play('Crouch_Idle_Loop', 0.3); p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading; };

  const prevThink = peds.think.bind(peds);
  peds.think = (p, dt, pl) => {
    if (p.mode !== 'dead' && p.role === 'responder') return peds.responderThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'arrested') return peds.arrestedThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'mugger') return peds.muggerThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'victim') return peds.victimThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'fighter') return peds.fighterThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'rival') return rivalThink(p, dt);
    return prevThink(p, dt, pl);
  };
  const giveGun = async (p) => {
    const { WEAPONS, buildWeaponModel } = await import('../entities/arsenal.js');
    const { GunPose } = await import('../entities/gunpose.js');
    const id = p.role === 'mugger' ? (game.muggerWeapon?.() || 'pistol') : 'pistol';
    p.weaponId = id; p.gun = buildWeaponModel(WEAPONS[id]); p.gun.visible = false; scene.add(p.gun); p.pose = new GunPose(p.h);
  };
  const cleanup = (e) => { for (const p of e.people || []) { if (p.role === 'arrested' || p.shootAt) continue; if (p.gun) scene.remove(p.gun); if (p.mode !== 'dead') { p.role = undefined; p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 10; } } if (e.car) { e.car.group.remove(e.smoke); } };

  function startEvent(force) {
    if (S.mode !== 'foot' && S.mode !== 'car') return;
    const sit = game.situation();
    const town = inTown(player.pos.x, player.pos.z);
    const kinds = town ? ['mugging', 'robbery', 'fight'] : ['breakdown', 'mugging'];
    const kind = force || kinds[(Math.random() * kinds.length) | 0];
    if (kind === 'mugging' && sit.muggable) { // (not while you're driving, armed, wanted, running or indoors: R1)
      const a = Math.random() * Math.PI * 2, x = player.pos.x + Math.cos(a) * 22, z = player.pos.z + Math.sin(a) * 22;
      const m = spawnPerson(x, z, 'mugger'); giveGun(m);
      ev = { kind, people: [m], t: 0, m, demanded: false };
    } else if (kind === 'robbery') {
      const r = roadPointAround(graph, player.pos.x, player.pos.z, 25, 45); if (!r) return;
      const v = spawnPerson(r.x + 3, r.z + 3, 'victim'); v.heading = Math.random() * 6;
      const m = spawnPerson(r.x + 4.5, r.z + 4.5, 'mugger'); m.target = v; giveGun(m);
      ev = { kind, people: [v, m], t: 0, m, v };
      hud.toast('Someone is being robbed nearby', 3);
      peds.panic(m.pos, 28, { cover: true }); // a gun out on the street: people get down behind cars and walls
      ev.cop = callResponder(ev);
    } else if (kind === 'fight') {
      const r = roadPointAround(graph, player.pos.x, player.pos.z, 15, 35); if (!r) return;
      const a = spawnPerson(r.x + 3, r.z + 3, 'fighter'), b = spawnPerson(r.x + 4.1, r.z + 3.2, 'fighter');
      a.opp = b; b.opp = a;
      ev = { kind, people: [a, b], t: 0 };
    } else if (kind === 'breakdown') {
      const r = roadPointAround(graph, player.pos.x, player.pos.z, 60, 140); if (!r) return;
      const car = new game.Vehicle(lib, ['sedan', 'suv', 'truck', 'van'][(Math.random() * 4) | 0]);
      car.pos.set(r.x + 4, collision.surface(r.x + 4, r.z, 300), r.z); car.heading = Math.random() * 6; car.sync(0);
      scene.add(car.group); game.parked.push(car);
      const smoke = makeSmoke(4, Math.random(), 0.35); smoke.position.set(0, 1.2, car.spec.len * 0.38); car.group.add(smoke);
      const d = spawnPerson(r.x + 6, r.z + 2, 'victim'); d.heading = Math.atan2(car.pos.x - d.pos.x, car.pos.z - d.pos.z);
      ev = { kind, people: [d], car, smoke, t: 0, d };
      ev.point = game.interact.add({ x: d.pos.x, z: d.pos.z, r: 3, marker: false, label: () => `${keyHint(game)} help with the car`, use: () => {
        game.interact.remove(ev.point);
        const e0 = ev, tip = 60 + ((Math.random() * 90) | 0);
        const paid = () => { S.money += tip; hud.toast(`+$${tip}`, 2); if (ev === e0) ev.done = true; };
        const fixed = () => { car.group.remove(smoke); say('Driver', 'You\'re a lifesaver. Here, take this.', 3); };
        const A = game.acts;
        if (A && S.mode === 'foot' && !S.doorWalk) { // (A2) under the hood, then cash from the driver's hand
          const fw = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading)), front = car.pos.clone().addScaledVector(fw, car.spec.len / 2 + 0.55), bay = car.pos.clone().addScaledVector(fw, car.spec.len * 0.34); bay.y += 0.9;
          const run = A.play([{ walk: { x: front.x, z: front.z }, face: bay, max: 4 }, { t: 2.4, ik: (F, k, ctx, P) => { P.reach(P.R, bay.clone().addScaledVector(F.right, 0.16 + Math.sin(k * 17) * 0.05), F, 'R'); P.reach(P.L, bay.clone().addScaledVector(F.right, -0.2).addScaledVector(F.up, Math.sin(k * 11) * 0.03), F, 'L'); } }],
            { done: (ok) => {
              fixed();
              if (!ok || d.mode === 'dead' || d.h?.ragdoll) return paid();
              const who = A.fromPed(d);
              if (!A.play([A.toward(who), ...A.payBeats(who, 'take', 1.0)], { done: () => { who.release(); paid(); } })) { who.release(); paid(); }
            } });
          if (run) return;
        }
        player.h.play('Interact', 0.1, 0.8, true);
        setTimeout(() => { fixed(); paid(); }, 2500);
      } });
    }
  }

  function updateEvent(dt) {
    const e = ev; e.t += dt;
    if (e.kind === 'mugging') {
      const m = e.m, sit = game.situation();
      const dm = Math.hypot(m.pos.x - sit.pos.x, m.pos.z - sit.pos.z);
      if (m.mode === 'dead') { say('', 'The mugger is down.', 2); e.done = true; }
      else if (m.role !== 'mugger') e.done = true;
      // you drove off, went inside, a scene started, or you're long gone: he can't rob you (R1)
      else if (sit.indoors || sit.scene || sit.down || dm > 40 || (!sit.reachable && (sit.inVehicle || dm > 6))) {
        const drove = sit.inVehicle && sit.speed > 2;
        if (drove && e.demanded && Math.random() < 0.3) { say('Mugger', 'Get back here!', 2); m.role = 'foe'; } // a parting shot at the car
        else { if (dm < 60) say('Mugger', drove ? 'Damn it!' : 'Forget it.', 2); m.role = undefined; m.mode = 'flee'; m.threat = sit.pos.clone(); m.timer = 12; }
        e.done = true;
      } else if (m.holding && !e.demanded) { e.demanded = true; e.demandT = 0; say('Mugger', sit.inVehicle ? 'Window down. Wallet. Now.' : 'Wallet. Now. Don\'t be a hero.', 4); peds.panic(m.pos, 22, { cover: true }); }
      else if (e.demanded && !m.holding) { /* you stepped back: he closes in again, the clock waits */ }
      else if (e.demanded) {
        e.demandT += dt;
        if (combat.drawn || player.h.current === player.h.actions.Punch_Jab) { say('Mugger', Math.random() < 0.5 ? 'Whoa, whoa! I\'m going!' : 'Bad idea, man!', 2); m.role = Math.random() < 0.5 ? undefined : 'foe'; if (!m.role) { m.mode = 'flee'; m.threat = player.pos.clone(); m.timer = 12; } e.done = true; }
        else if (e.demandT > 6 && sit.reachable && dm < 3.6 && !e.handing) {
          const robbed = () => { const loss = Math.min(400, Math.round(S.money * 0.15)); S.money -= loss; say('Mugger', 'Pleasure doing business.', 3); hud.toast(`You were robbed: -$${loss}`, 3); m.role = undefined; m.mode = 'flee'; m.threat = player.pos.clone(); m.timer = 14; e.done = true; };
          // (A2) slow hands: you reach for your wallet and hold it out; he snatches it
          const A = game.acts, who = A && S.mode === 'foot' ? A.fromPed(m) : null, wallet = A?.prop('card');
          const run = who && A.play([{ face: m.pos, t: 0.3 }, { t: 0.9, ik: (F, k, ctx, P) => A.handsUp(P, F, Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.7) }, ...A.handBeats(who, wallet, 'give', 0.9)],
            { done: () => { who.release(); robbed(); } });
          if (run) e.handing = true; else { who?.release(); robbed(); }
        }
      }
    } else if (e.kind === 'robbery') {
      if (e.tipping) { if (!S.doorWalk) e.done = true; } else
      if (e.m.mode === 'dead' || (combat.drawn && e.m.pos.distanceTo(player.pos) < 18 && !e.scared)) {
        if (e.m.mode !== 'dead') { e.scared = true; say('Robber', 'This ain\'t over!', 2); e.m.role = undefined; e.m.mode = 'flee'; e.m.threat = player.pos.clone(); e.m.timer = 14; }
        if (e.v.pos.distanceTo(game.situation().pos) < 30) { // only if you were there to see it (not when an officer stopped him)
          const tip = 50 + ((Math.random() * 100) | 0), give = () => { S.money += tip; hud.toast(`+$${tip}`, 2); };
          say('Victim', 'Thank you! Thank you. Here, it\'s all I have left.', 3);
          const A = game.acts;
          if (A && S.mode === 'foot' && !S.doorWalk && e.v.mode !== 'dead' && !e.v.h?.ragdoll && e.v.pos.distanceTo(player.pos) < 8) { // (A2) from their hand to yours
            const who = A.fromPed(e.v);
            if (A.play([A.toward(who), ...A.payBeats(who, 'take', 1.0)], { done: () => { who.release(); give(); e.done = true; } })) { e.tipping = true; return; }
            who.release();
          }
          give();
        }
        e.done = true;
      } else if (e.t > 45 && !(e.cop && e.cop.role === 'responder' && e.cop.mode !== 'dead')) { if (e.m.role === 'mugger') say('', 'The robber got away.', 2); e.done = true; }
    } else if (e.kind === 'fight') {
      if (e.t > 20 || e.people.some((p) => p.mode === 'dead')) e.done = true;
    } else if (e.kind === 'breakdown') {
      faceCamera(e.smoke, game.camera);
      if (e.t > 240 || e.car.pos.distanceTo(player.pos) > 400) e.done = true;
    }
    if (e.done || e.t > 300 || e.people.every((p) => !peds.list.includes(p))) { if (e.point) game.interact.remove(e.point); cleanup(e); ev = null; nextT = 80 + Math.random() * 90; }
  }

  // ---- rival gangs on their turf
  const turfs = RIVALS.map((R) => {
    const [x, z] = R.at();
    const y = hm.height(x, z);
    game.interact.add({ x, z, r: 0.1, marker: false, label: '', use: () => {}, blip: { color: '#d03030', size: 6, global: true, icon: '☠', bg: 'rgba(120,10,10,0.9)' } });
    return { R, x, z, y, members: [], warned: 0, hostile: false, respawnDay: 0 };
  });
  function rivalThink(p, dt) {
    const t = p.turf;
    if (t.hostile) { p.role = 'foe'; return; }
    const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 25) p.heading += wrapAngle(Math.atan2(dx, dz) - p.heading) * Math.min(1, dt * 4);
    if (p.h.locked <= 0) p.h.play(d < 25 ? 'Pistol_Idle_Loop' : p.idle, 0.3);
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
    placeAccessories(p.h);
    if (p.gun) { p.h.root.updateMatrixWorld(true); p.pose.attachToHand(p.gun, p.pose.R); p.gun.visible = d < 25; }
  }
  function spawnTurf(t) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = t.x + Math.cos(a) * 4, z = t.z + Math.sin(a) * 4;
      const look = { id: `${t.R.id}${i}`, base: lib.peopleIds[i % lib.peopleIds.length], skin: ['tan', 'olive', 'brown', 'light', 'dark'][i % 5], suit: t.R.suit, hair: 'black', h: 0.96 + Math.random() * 0.1, w: 1 + Math.random() * 0.15, acc: t.R.acc, lines: t.R.lines };
      const p = spawnPerson(x, z, 'rival', look);
      p.turf = t; p.hp = 130; p.armor = 1; p.heading = a + Math.PI; p.idle = ['Idle_Talking_Loop', 'Idle_Loop', 'Crouch_Idle_Loop'][i % 3];
      giveGun(p);
      t.members.push(p);
    }
  }

  return {
    turfs,
    get event() { return ev; },
    force(kind) { if (ev) { cleanup(ev); ev = null; } startEvent(kind); return ev; }, // (tests)
    clear() { if (ev) { cleanup(ev); ev = null; } nextT = 80 + Math.random() * 90; },
    update(dt) {
      if (reportT > 0 && (reportT -= dt) <= 0 && police.wanted === 0) { police.crime('shots'); hud.toast('Someone reported gunshots', 2.5); }
      // events
      if (ev) updateEvent(dt);
      else if (!S.cutscene && !S.indoors && S.dead <= 0 && !game.missionActive?.() && (nextT -= dt) <= 0) { nextT = 30; startEvent(); }
      // turf
      for (const t of turfs) {
        const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
        const alive = t.members.filter((p) => p.mode !== 'dead' && peds.list.includes(p));
        if (d < 120 && !alive.length && game.sky.day >= t.respawnDay && S.mode === 'foot') { t.members = []; t.hostile = false; t.warned = 0; t.cleared = false; spawnTurf(t); continue; }
        // members taken out of the world because you walked off (not killed): they just went home
        if (!alive.length && t.members.length && t.members.some((p) => p.mode !== 'dead' && !peds.list.includes(p))) { t.members = []; t.hostile = false; t.warned = 0; continue; }
        if (!alive.length) { if (t.members.length && !t.cleared) { t.cleared = true; t.respawnDay = game.sky.day + 3; P.rivals[t.R.id] = (P.rivals[t.R.id] || 0) + 1; hud.toast(`You cleared ${t.R.name} off their turf. They'll be back.`, 3.5); career.saveSoon(); } continue; }
        t.cleared = false;
        if (t.hostile) continue;
        if ((P.truce?.[t.R.id] || 0) > game.sky.day) { if (d < 30 && !t.warned) { t.warned = 1; say(t.R.name, 'We got a deal. Don\'t make us regret it.', 3); } continue; } // paid off (systems/crew.js)
        if (d < 30 && (combat.drawn || t.warned > 0 && (t.stayT = (t.stayT || 0) + dt) > 12)) { t.hostile = true; say(t.R.name, 'Light him up!', 2); for (const p of alive) p.role = 'foe'; }
        else if (d < 30 && !t.warned) { t.warned = 1; t.stayT = 0; say(t.R.name, t.R.lines[(Math.random() * t.R.lines.length) | 0], 3); }
        else if (d > 45) { t.warned = 0; t.stayT = 0; }
      }
    },
  };
}
