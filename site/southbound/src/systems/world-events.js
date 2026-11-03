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
    const tgt = p.target || player;
    const tp = tgt.pos;
    const dx = tp.x - p.pos.x, dz = tp.z - p.pos.z, d = Math.hypot(dx, dz);
    p.heading += wrapAngle(Math.atan2(dx, dz) - p.heading) * Math.min(1, dt * 6);
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
  const prevThink = peds.think.bind(peds);
  peds.think = (p, dt, pl) => {
    if (p.mode !== 'dead' && p.role === 'mugger') return peds.muggerThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'victim') return peds.victimThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'fighter') return peds.fighterThink(p, dt);
    if (p.mode !== 'dead' && p.role === 'rival') return rivalThink(p, dt);
    return prevThink(p, dt, pl);
  };
  const giveGun = async (p) => {
    const { WEAPONS, buildWeaponModel } = await import('../entities/arsenal.js');
    const { GunPose } = await import('../entities/gunpose.js');
    p.gun = buildWeaponModel(WEAPONS.pistol); p.gun.visible = false; scene.add(p.gun); p.pose = new GunPose(p.h);
  };
  const cleanup = (e) => { for (const p of e.people || []) { if (p.gun) scene.remove(p.gun); if (p.mode !== 'dead') { p.role = undefined; p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 10; } } if (e.car) { e.car.group.remove(e.smoke); } };

  function startEvent() {
    if (S.mode !== 'foot' && S.mode !== 'car') return;
    const town = inTown(player.pos.x, player.pos.z);
    const kinds = town ? ['mugging', 'robbery', 'fight'] : ['breakdown', 'mugging'];
    const kind = kinds[(Math.random() * kinds.length) | 0];
    if (kind === 'mugging' && S.mode === 'foot') {
      const a = Math.random() * Math.PI * 2, x = player.pos.x + Math.cos(a) * 22, z = player.pos.z + Math.sin(a) * 22;
      const m = spawnPerson(x, z, 'mugger'); giveGun(m);
      ev = { kind, people: [m], t: 0, m, demanded: false };
    } else if (kind === 'robbery') {
      const r = roadPointAround(graph, player.pos.x, player.pos.z, 25, 45); if (!r) return;
      const v = spawnPerson(r.x + 3, r.z + 3, 'victim'); v.heading = Math.random() * 6;
      const m = spawnPerson(r.x + 4.5, r.z + 4.5, 'mugger'); m.target = v; giveGun(m);
      ev = { kind, people: [v, m], t: 0, m, v };
      hud.toast('Someone is being robbed nearby', 3);
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
        game.interact.remove(ev.point); player.h.play('Interact', 0.1, 0.8, true);
        setTimeout(() => { car.group.remove(smoke); const tip = 60 + ((Math.random() * 90) | 0); S.money += tip; say('Driver', 'You\'re a lifesaver. Here, take this.', 3); hud.toast(`+$${tip}`, 2); ev && (ev.done = true); }, 2500);
      } });
    }
  }

  function updateEvent(dt) {
    const e = ev; e.t += dt;
    if (e.kind === 'mugging') {
      const m = e.m;
      if (m.mode === 'dead') { say('', 'The mugger is down.', 2); e.done = true; }
      else if (m.holding && !e.demanded) { e.demanded = true; e.demandT = 0; say('Mugger', 'Wallet. Now. Don\'t be a hero.', 4); }
      else if (e.demanded) {
        e.demandT += dt;
        if (combat.drawn || player.h.current === player.h.actions.Punch_Jab) { say('Mugger', Math.random() < 0.5 ? 'Whoa, whoa! I\'m going!' : 'Bad idea, man!', 2); m.role = Math.random() < 0.5 ? undefined : 'foe'; if (!m.role) { m.mode = 'flee'; m.threat = player.pos.clone(); m.timer = 12; } e.done = true; }
        else if (e.demandT > 6) { const loss = Math.min(400, Math.round(S.money * 0.15)); S.money -= loss; say('Mugger', 'Pleasure doing business.', 3); hud.toast(`You were robbed: -$${loss}`, 3); m.role = undefined; m.mode = 'flee'; m.threat = player.pos.clone(); m.timer = 14; e.done = true; }
      }
    } else if (e.kind === 'robbery') {
      if (e.m.mode === 'dead' || (combat.drawn && e.m.pos.distanceTo(player.pos) < 18 && !e.scared)) {
        if (e.m.mode !== 'dead') { e.scared = true; say('Robber', 'This ain\'t over!', 2); e.m.role = undefined; e.m.mode = 'flee'; e.m.threat = player.pos.clone(); e.m.timer = 14; }
        const tip = 50 + ((Math.random() * 100) | 0); S.money += tip;
        say('Victim', 'Thank you! Thank you. Here, it\'s all I have left.', 3); hud.toast(`+$${tip}`, 2);
        e.done = true;
      } else if (e.t > 45) { say('', 'The robber got away.', 2); e.done = true; }
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
        if (!alive.length) { if (t.members.length && !t.cleared) { t.cleared = true; t.respawnDay = game.sky.day + 3; P.rivals[t.R.id] = (P.rivals[t.R.id] || 0) + 1; hud.toast(`You cleared ${t.R.name} off their turf. They'll be back.`, 3.5); career.saveSoon(); } continue; }
        t.cleared = false;
        if (t.hostile) continue;
        if (d < 30 && (combat.drawn || t.warned > 0 && (t.stayT = (t.stayT || 0) + dt) > 12)) { t.hostile = true; say(t.R.name, 'Light him up!', 2); for (const p of alive) p.role = 'foe'; }
        else if (d < 30 && !t.warned) { t.warned = 1; t.stayT = 0; say(t.R.name, t.R.lines[(Math.random() * t.R.lines.length) | 0], 3); }
        else if (d > 45) { t.warned = 0; t.stayT = 0; }
      }
    },
  };
}
