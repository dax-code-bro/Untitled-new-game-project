// Talking to people, the law, and the price on your head.
//
//  - Hold F / ◎ / B (or hold aim with your gun holstered) near someone to
//    focus on them: you turn and look at them, then Greet (G) or
//    Antagonize (T). Push someone four times and they either swing at you
//    or call the police. Push a cop twice and you're under arrest.
//  - With your gun holstered and the police on you, focus on an officer and
//    Surrender (G): a short arrest scene, a few days inside, a fine.
//  - Lose the police outside the city and you get a bounty. Every three game
//    days a party of bounty hunters comes for you; every hunter you kill
//    raises the bounty and the next party is bigger and better armed. At the
//    top they bring a helicopter with a minigun and the police join in.
//  - Pay off the bounty at the Central Precinct.
import * as THREE from 'three';
import { Human, locomotion } from '../entities/human.js';
import { GunPose } from '../entities/gunpose.js';
import { WEAPONS, buildWeaponModel } from '../entities/arsenal.js';
import { AIRCRAFT, Aircraft } from '../entities/craft.js';
import { regionAt } from '../world/layout.js';
import { roadPointAround, keyHint } from './world-util.js';
import { clamp, wrapAngle } from '../util.js';

const pick = (a) => a[(Math.random() * a.length) | 0];
const GREET = ['Howdy.', 'Afternoon.', 'How you doing?', 'Hey there.', 'Nice day for it.'];
const GREET_BACK = ['Hey.', 'Afternoon to you.', 'Doing fine, thanks.', 'Hi there.', 'Mm-hm.', 'Take care now.'];
const INSULT = ['Nice shirt. Your mother pick it out?', 'You lost, partner?', 'Walk faster, you\'re blocking my sun.', 'You smell like a bait shop.', 'What are you looking at?', 'Move it, slowpoke.'];
const REPLY = [
  ['Excuse me?', 'Real mature.', 'Keep walking, pal.'],
  ['You looking for trouble?', 'I\'m warning you.', 'Say that again.'],
  ['Last chance. Back off.', 'One more word...', 'I swear to God...'],
];
const FIGHT = ['That\'s it!', 'You asked for it!', 'Come here!'];
const CALL = ['I\'m calling the cops!', 'Police! Somebody call the police!', 'You\'re gonna regret this. I\'m calling 911.'];
const COP_WARN = ['Move along, citizen.', 'Keep it civil.', 'Don\'t push your luck.'];
const COP_ARREST = ['That\'s it. You\'re under arrest.', 'Turn around. Hands behind your back.'];
const HUNTER_TIERS = [
  null,
  { n: 2, weapon: 'pistol', hp: 110, dmg: [5, 9], range: 28, rate: 1.1 },
  { n: 3, weapon: 'shotgun_01', hp: 130, dmg: [10, 16], range: 16, rate: 1.4 },
  { n: 4, weapon: 'rifle_01', hp: 150, dmg: [5, 8], range: 45, rate: 0.45 },
  { n: 6, weapon: 'rifle_02', hp: 200, dmg: [6, 9], range: 55, rate: 0.4 },
  { n: 6, weapon: 'rifle_02', hp: 220, dmg: [6, 10], range: 60, rate: 0.35, heli: true },
];

export function installLaw(g) {
  const { S, player, peds, police, combat, hud, sky, career, scene, collision, graph, lib, q, gunPose } = g;
  const P = career.p;
  P.law = P.law || { bounty: 0, hunterKills: 0, nextHunt: 0 };
  const L = P.law;

  // subtitles for conversations
  const sub = document.createElement('div');
  sub.className = 'sbsub';
  document.body.appendChild(sub);
  let subT = 0;
  const say = (who, line, t = 2.6) => { sub.innerHTML = who ? `<span>${who}:</span> ${line}` : line; sub.style.opacity = 1; subT = t; };
  police.onShout = (line) => say('Officer', line, 2.4);

  // fade overlay for the arrest scene
  const fade = document.createElement('div');
  fade.className = 'sbfade';
  fade.innerHTML = '<b></b><span></span>';
  document.body.appendChild(fade);

  let target = null, holdT = 0, focusing = false;
  const fw = new THREE.Vector3(), tmp = new THREE.Vector3();

  function findTarget() {
    fw.set(Math.sin(player.heading), 0, Math.cos(player.heading));
    let best = null, bs = 1e9;
    for (const p of peds.list) {
      if (p.mode === 'dead' || p.scripted || !p.h.root.visible || p.role === 'hunter' || p.role === 'foe') continue;
      tmp.subVectors(p.pos, player.pos); tmp.y = 0;
      const d = tmp.length();
      if (d > 5 || Math.abs(p.pos.y - player.pos.y) > 2) continue;
      const facing = tmp.dot(fw) / (d || 1);
      const score = d - facing * 1.5;
      if ((facing > 0.2 || d < 2) && score < bs) { bs = score; best = p; }
    }
    return best;
  }

  // ---------------- conversations
  function greet(p) {
    player.h.play('Interact', 0.1, 1.2, true);
    say('You', pick(GREET));
    setTimeout(() => {
      if (p.mode === 'dead') return;
      if (p.role === 'cop' && police.wanted > 0) return;
      say(p.role === 'cop' ? 'Officer' : 'Stranger', (p.anger || 0) > 1 ? 'Don\'t talk to me.' : pick(GREET_BACK));
      if (p.h.locked <= 0) p.h.play('Interact', 0.15, 1, true);
    }, 900);
    if (p.mode === 'walk') { p.mode = 'idle'; p.timer = 3; }
  }
  function antagonize(p) {
    player.h.play('Interact', 0.1, 1.4, true);
    say('You', pick(INSULT));
    p.anger = (p.anger || 0) + 1;
    setTimeout(() => {
      if (p.mode === 'dead') return;
      if (p.role === 'cop') {
        if (p.anger >= 2) { say('Officer', pick(COP_ARREST)); police.crime('resist'); p.warned = true; }
        else say('Officer', pick(COP_WARN));
        return;
      }
      if (p.anger < 4) { say('Stranger', REPLY[Math.min(2, p.anger - 1)][(Math.random() * 3) | 0]); if (p.mode === 'walk') { p.mode = 'idle'; p.timer = 2.5; } return; }
      // fourth time: they either fight you or call the police
      if (Math.random() < 0.55) {
        say('Stranger', pick(FIGHT));
        p.role = 'brawler'; p.punchT = 0.6; p.hp = Math.max(p.hp, 100);
      } else {
        say('Stranger', pick(CALL));
        p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 12;
        setTimeout(() => { if (p.mode !== 'dead') { police.crime('disturbance'); hud.toast('Someone called the police', 2.5); } }, 4000);
      }
    }, 900);
  }

  // fist fight AI for someone you pushed too far
  peds.brawlThink = (p, dt) => {
    const tx = player.pos.x - p.pos.x, tz = player.pos.z - p.pos.z, d = Math.hypot(tx, tz);
    p.heading += wrapAngle(Math.atan2(tx, tz) - p.heading) * Math.min(1, dt * 8);
    if (p.hp < 35 || d > 40 || S.mode !== 'foot') { p.role = undefined; p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 10; return; }
    if (d > 1.3) {
      const sp = d > 4 ? 4.2 : 2;
      p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
      p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      const [clip, s] = locomotion(sp); p.h.play(clip, 0.2, s);
    } else if ((p.punchT -= dt) <= 0) {
      p.punchT = 0.9 + Math.random() * 0.6;
      p.h.play(Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross', 0.06, 1.2, true);
      setTimeout(() => { if (p.mode !== 'dead' && p.pos.distanceTo(player.pos) < 1.7) g.hurtPlayer(5 + Math.random() * 4, p.pos, 0); }, 250);
    }
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
  };

  // ---------------- arrest scene
  let cut = null;
  function startArrest(cop) {
    if (cut || S.dead > 0) return;
    if (S.mode === 'car') g.exitVehicle();
    combat.holstered = true;
    cop = cop || peds.list.find((p) => p.role === 'cop' && p.mode !== 'dead') || null;
    // a cruiser to put you in
    const car = new g.Vehicle(lib, 'police');
    const side = new THREE.Vector3(-Math.cos(player.heading), 0, Math.sin(player.heading));
    car.pos.set(player.pos.x + side.x * 5, 0, player.pos.z + side.z * 5);
    car.pos.y = collision.surface(car.pos.x, car.pos.z, player.pos.y + 2);
    car.heading = player.heading; car.siren = true; car.sync(0);
    scene.add(car.group);
    if (!cop) {
      const h = new Human(lib, 'mh_cop');
      cop = { h, role: 'cop', mode: 'walk', hp: 120, pos: car.pos.clone().addScaledVector(side, -2), heading: 0, speed: 0, radius: 0.35, acc: 0, timer: 0, scripted: true };
      scene.add(h.root);
    }
    cop.scripted = true;
    const fine = Math.round(L.bounty + police.wanted * 150 + Math.min(S.money * 0.08, 2500));
    cut = { t: 0, cop, car, fine, days: 2 + Math.min(4, police.wanted) };
    S.dead = 99; // freezes your controls for the scene
    S.cutscene = true;
    hud.toast('', 0.01);
  }
  police.onBusted = (cop) => startArrest(cop);

  function updateArrest(dt) {
    const c = cut, cop = c.cop;
    c.t += dt;
    const behind = new THREE.Vector3(-Math.sin(player.heading), 0, -Math.cos(player.heading));
    const door = c.car.pos.clone().add(new THREE.Vector3(-Math.cos(c.car.heading), 0, Math.sin(c.car.heading)).multiplyScalar(-1.4));
    if (c.t < 2.0) {
      // hands up while the officer walks round behind you
      player.h.play('Idle_Loop', 0.2);
      const want = player.pos.clone().addScaledVector(behind, 0.9);
      cop.pos.lerp(want, Math.min(1, dt * 2.2));
      cop.heading = player.heading;
      cop.h.play(cop.pos.distanceTo(want) > 0.3 ? 'Walk_Loop' : 'Idle_Loop', 0.2);
    } else if (c.t < 3.8) {
      // walked to the car
      const k = Math.min(1, dt * 1.6);
      const toDoor = door.clone().sub(player.pos); toDoor.y = 0;
      if (toDoor.length() > 0.3) {
        player.heading += wrapAngle(Math.atan2(toDoor.x, toDoor.z) - player.heading) * Math.min(1, dt * 5);
        player.pos.addScaledVector(toDoor.normalize(), 1.3 * dt);
        player.h.play('Walk_Loop', 0.2, 0.8);
      } else player.h.play('Idle_Loop', 0.2);
      player.pos.y = collision.surface(player.pos.x, player.pos.z, player.pos.y + 0.5);
      cop.pos.lerp(player.pos.clone().addScaledVector(behind, 0.7), k * 2);
      cop.heading = player.heading;
      cop.h.play('Walk_Loop', 0.2, 0.8);
    } else if (c.t < 4.4) {
      // shoved into the back seat
      if (!c.inside) { c.inside = true; player.h.root.visible = false; cop.h.root.visible = false; if (cop.gun) cop.gun.visible = false; }
    } else if (c.t < 7.5) {
      // driven away
      c.car.physics(dt, { throttle: 0.6, brake: 0, steer: 0, handbrake: false }, g.hm, collision);
      if (c.t > 6.0 && !c.faded) { c.faded = true; fade.querySelector('b').textContent = 'BUSTED'; fade.querySelector('span').textContent = `${c.days} days later...`; fade.classList.add('show'); }
    } else {
      // released
      scene.remove(c.car.group); c.car.dispose?.();
      if (cop.scripted && !peds.list.includes(cop)) { scene.remove(cop.h.root); cop.h.freeGpu?.(); }
      cop.scripted = false;
      police.clear();
      S.money = Math.max(0, S.money - c.fine);
      L.bounty = 0; L.nextHunt = 0;
      if (g.missions?.active) g.missions.fail('You were arrested');
      sky.day += c.days; sky.hour = 9.5;
      const at = g.PRECINCT;
      player.pos.set(at.x, collision.surface(at.x, at.z, 200), at.z);
      player.vel.set(0, 0, 0);
      player.h.root.visible = true;
      player.health = 100;
      g.rig.yaw = player.heading;
      S.dead = 0; S.cutscene = false;
      cut = null;
      setTimeout(() => fade.classList.remove('show'), 600);
      hud.toast(`Released from ${at.name}. Fine paid: $${c.fine.toLocaleString('en-US')}`, 5);
      g.onArrested?.();
      career.saveSoon();
      return;
    }
    c.car.sync(dt);
    cop.h.update(dt);
    cop.h.root.position.copy(cop.pos); cop.h.root.rotation.y = cop.heading;
    player.h.update(dt);
    player.h.root.position.copy(player.pos); player.h.root.rotation.y = player.heading;
    player.h.root.updateMatrixWorld(true);
    // hands up (IK) until you're in the car
    if (c.t < 3.8 && gunPose.ok) {
      const F = gunPose.frame(player.heading);
      const shR = gunPose.R.upper.getWorldPosition(new THREE.Vector3()), shL = gunPose.L.upper.getWorldPosition(new THREE.Vector3());
      const lift = c.t < 2.0 ? Math.min(1, c.t * 2) : 1 - Math.min(1, (c.t - 2.0) * 0.8) * 0.6;
      if (c.t < 2.0) {
        gunPose.reach(gunPose.R, shR.clone().addScaledVector(F.up, 0.38 * lift).addScaledVector(F.right, 0.22).addScaledVector(F.fw, 0.05), F, 'R');
        gunPose.reach(gunPose.L, shL.clone().addScaledVector(F.up, 0.38 * lift).addScaledVector(F.right, -0.22).addScaledVector(F.fw, 0.05), F, 'L');
      } else {
        // hands behind the back
        const back = F.chest.clone().addScaledVector(F.fw, -0.22).addScaledVector(F.up, -0.42);
        gunPose.reach(gunPose.R, back.clone().addScaledVector(F.right, 0.05), F, 'R');
        gunPose.reach(gunPose.L, back.clone().addScaledVector(F.right, -0.05), F, 'L');
      }
    }
  }
  // scripted camera for the arrest
  function arrestCamera(camera) {
    const c = cut;
    if (c.t < 4.4) {
      const side = new THREE.Vector3(Math.cos(player.heading + 0.6), 0, -Math.sin(player.heading + 0.6));
      camera.position.copy(player.pos).addScaledVector(side, 3.6).add(tmp.set(0, 1.8, 0));
      camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
    } else {
      const v = c.car, b = new THREE.Vector3(-Math.sin(v.heading), 0, -Math.cos(v.heading));
      camera.position.copy(v.pos).addScaledVector(b, 9).add(tmp.set(0, 3.2, 0));
      camera.lookAt(v.pos.x, v.pos.y + 1, v.pos.z);
    }
  }

  // ---------------- bounty
  police.onEscaped = (maxWanted, kills) => {
    const r = regionAt(player.pos.x, player.pos.z);
    if (r.sub === 'City' || r.sub === 'Town') { hud.toast('You lost the police', 2.5); return; }
    const add = 150 * maxWanted + 350 * kills;
    L.bounty += add;
    if (!L.nextHunt) L.nextHunt = sky.day + 3;
    hud.toast(`You escaped the law. Bounty on your head: $${L.bounty.toLocaleString('en-US')}`, 4.5);
    career.saveSoon();
  };
  const tier = () => clamp(1 + Math.floor(L.bounty / 2500) + Math.floor(L.hunterKills / 6), 1, 5);
  let party = null; // { hunters: [], heli, t }

  function spawnHunters() {
    const T = HUNTER_TIERS[tier()];
    let at = roadPointAround(graph, player.pos.x, player.pos.z, 90, 140);
    // keep them in range: if the nearest road is far, they come cross-country
    const dd = at ? Math.hypot(at.x - player.pos.x, at.z - player.pos.z) : 1e9;
    if (!at || dd > 140) { const a = Math.random() * Math.PI * 2; at = { x: player.pos.x + Math.cos(a) * 115, z: player.pos.z + Math.sin(a) * 115 }; }
    party = { hunters: [], heli: null, t: 0, tier: tier() };
    // they pull up in a truck and come the rest of the way on foot
    const truck = new g.Vehicle(lib, Math.random() < 0.5 ? 'suv' : 'truck');
    truck.pos.set(at.x, collision.surface(at.x, at.z, 200), at.z);
    truck.heading = Math.atan2(player.pos.x - at.x, player.pos.z - at.z); truck.sync(0);
    scene.add(truck.group); g.parked.push(truck);
    party.truck = truck;
    for (let i = 0; i < T.n; i++) {
      const id = lib.peopleIds[(Math.random() * lib.peopleIds.length) | 0];
      const h = new Human(lib, id);
      const x = at.x + (Math.random() - 0.5) * 8, z = at.z + (Math.random() - 0.5) * 8;
      const p = { h, role: 'hunter', armor: party.tier >= 4 ? 3 : party.tier >= 3 ? 2 : 0, mode: 'walk', hp: T.hp, pos: new THREE.Vector3(x, collision.surface(x, z, 300), z), heading: 0, speed: 0, radius: 0.35, acc: 0, timer: 0,
        T, gunT: 1 + Math.random(), gun: buildWeaponModel(WEAPONS[T.weapon] || WEAPONS.pistol), strafe: Math.random() < 0.5 ? 1 : -1 };
      p.pose = new GunPose(h);
      scene.add(h.root, p.gun);
      peds.list.push(p);
      party.hunters.push(p);
    }
    if (T.heli) {
      const entry = AIRCRAFT.find((e) => e.id === 'news-heli') || AIRCRAFT.find((e) => /heli/.test(e.id));
      if (entry) {
        const heli = new Aircraft({ ...entry, name: 'Hunter gunship', paint: [0.06, 0.06, 0.07], trim: [0.25, 0.05, 0.05] }, q);
        heli.pos.set(at.x, player.pos.y + 45, at.z); heli.health = 700; heli.maxHealth = 700; heli.power = 1; heli.fireT = 3;
        scene.add(heli.group);
        party.heli = heli;
        police.crime('copShot'); // the police come for you too
      }
    }
    hud.bigMessage('BOUNTY HUNTERS', `$${L.bounty.toLocaleString('en-US')} on your head · ${T.n} hunters${T.heli ? ' + gunship' : ''}`, 3.5);
  }

  peds.hunterThink = (p, dt) => {
    const T = p.T;
    const tx = player.pos.x - p.pos.x, tz = player.pos.z - p.pos.z, d = Math.hypot(tx, tz);
    p.heading += wrapAngle(Math.atan2(tx, tz) - p.heading) * Math.min(1, dt * 6);
    let aiming = false;
    if (d > T.range * 0.8) {
      const sp = d > 40 ? 5.5 : 3.6;
      p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
      const [clip, s] = locomotion(sp); p.h.play(clip, 0.2, s);
    } else {
      // strafe a little while shooting
      const sx = Math.cos(p.heading) * p.strafe, sz = -Math.sin(p.heading) * p.strafe;
      p.pos.x += sx * 1.2 * dt; p.pos.z += sz * 1.2 * dt;
      if (Math.random() < dt * 0.3) p.strafe *= -1;
      aiming = true;
      if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15);
      if ((p.gunT -= dt) <= 0) {
        p.gunT = T.rate * (0.7 + Math.random() * 0.6);
        g.audio?.gunshot(T.weapon === 'pistol' ? 0.6 : 0.8);
        const chance = clamp(0.6 - d / (T.range * 1.6), 0.08, 0.55) * (S.mode === 'car' ? 0.6 : 1) * (player.speed > 4 ? 0.6 : 1);
        if (Math.random() < chance) g.hurtPlayer(T.dmg[0] + Math.random() * (T.dmg[1] - T.dmg[0]), p.pos, /rifle|sniper/.test(T.weapon) ? 3 : /shotgun/.test(T.weapon) ? 1.5 : 2);
      }
    }
    const r = collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8); p.pos.x = r.x; p.pos.z = r.z;
    p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
    // their gun, held properly
    if (p.gun) {
      p.h.root.updateMatrixWorld(true);
      const aim = new THREE.Vector3(tx, player.pos.y + 1.2 - (p.pos.y + 1.4), tz).normalize();
      p.gun.visible = true;
      p.pose.apply({ gun: p.gun, info: p.gun.userData.hold, state: aiming ? 'aim' : 'ready', aimDir: aim, heading: p.heading });
    }
  };

  function updateParty(dt) {
    party.t += dt;
    let alive = 0;
    for (const p of party.hunters) {
      if (!peds.list.includes(p)) { if (p.gun) p.gun.visible = false; continue; }
      if (p.mode === 'dead') { if (p.gun && p.gun.visible) { p.gun.visible = false; L.hunterKills++; L.bounty += 200 * party.tier; career.saveSoon(); } continue; }
      alive++;
    }
    const h = party.heli;
    if (h && h.health > 0) {
      // circle you and rake the area with the minigun
      party.ang = (party.ang || 0) + dt * 0.35;
      const want = new THREE.Vector3(player.pos.x + Math.cos(party.ang) * 45, player.pos.y + 32, player.pos.z + Math.sin(party.ang) * 45);
      h.pos.lerp(want, Math.min(1, dt * 0.6));
      h.heading = Math.atan2(player.pos.x - h.pos.x, player.pos.z - h.pos.z);
      h.alt = h.pos.y - collision.surface(h.pos.x, h.pos.z, 999);
      h.power = 1;
      if ((h.fireT -= dt) <= 0) { h.fireT = 4 + Math.random() * 2; h.burst = 1.6; }
      if (h.burst > 0) {
        h.burst -= dt;
        if (Math.random() < dt * 14) { g.audio?.gunshot(0.35); if (Math.random() < 0.18) g.hurtPlayer(4 + Math.random() * 4, h.pos, 3); g.tracer?.(h.pos, player.pos); }
      }
      h.sync(dt);
      alive++;
    } else if (h && !h.dead) {
      h.dead = true; g.explodeAt?.(h.pos.clone()); scene.remove(h.group);
      L.bounty += 1500; L.hunterKills += 2;
    }
    if (!alive || party.t > 240 || party.hunters.every((p) => p.mode === 'dead' || p.pos.distanceTo(player.pos) > 400)) {
      if (alive === 0) hud.toast(`Hunters dealt with. Bounty now $${L.bounty.toLocaleString('en-US')}`, 4);
      for (const p of party.hunters) { if (p.gun) scene.remove(p.gun); }
      if (party.heli && !party.heli.dead) scene.remove(party.heli.group);
      party = null;
    }
  }

  // pay it off at the precinct
  g.interact.add({ x: g.PRECINCT.x + 3, z: g.PRECINCT.z, r: 3, marker: false, show: () => L.bounty > 0 && !S.indoors,
    label: () => `${keyHint(g)} pay off your bounty ($${L.bounty.toLocaleString('en-US')})`,
    use: () => { if (S.money >= L.bounty) { S.money -= L.bounty; L.bounty = 0; L.nextHunt = 0; hud.toast('Bounty paid. You\'re a free citizen.', 3); career.saveSoon(); } else hud.toast('Not enough cash to pay the bounty', 2.5); } });

  let brandishT = 0;
  return {
    get cutscene() { return !!cut; },
    say,
    get bounty() { return L.bounty; },
    get focusing() { return focusing; },
    target: () => target,
    startArrest,
    hunters: () => (party ? party.hunters.filter((p) => p.mode !== 'dead' && peds.list.includes(p)) : []),
    heli: () => (party && party.heli && party.heli.health > 0 ? party.heli : null),
    spawnHunters,
    camera(cam) { if (cut) arrestCamera(cam); },
    // returns the prompt text to show (or '')
    update(dt, a) {
      if ((subT -= dt) <= 0 && sub.style.opacity !== '0') sub.style.opacity = 0;
      if (cut) { updateArrest(dt); return ''; }
      if (party) updateParty(dt);
      else if (L.bounty > 0 && L.nextHunt && sky.day >= L.nextHunt && !S.indoors && S.mode !== 'plane' && S.dead <= 0) { L.nextHunt = sky.day + 3; spawnHunters(); }
      if (L.bounty > 0 && !L.nextHunt) L.nextHunt = sky.day + 3;
      // waving a gun around in front of an officer is a crime
      if (S.mode === 'foot' && combat.drawn && police.wanted === 0 && police.nearPolice(22)) {
        brandishT += dt;
        if (brandishT > 0.2 && brandishT - dt <= 0.2) say('Officer', 'Hey! Put that gun away!', 2);
        if (brandishT > 2.5) { police.crime('brandish'); brandishT = 0; }
      } else brandishT = 0;

      focusing = false;
      if (S.mode !== 'foot' || S.dead > 0 || g.wheelOpen()) { target = null; document.body.classList.remove('focus'); return ''; }
      const wantFocus = a.interact || (a.aim && !combat.drawn);
      if (!wantFocus || !target || target.mode === 'dead' || target.pos.distanceTo(player.pos) > 6) target = findTarget();
      holdT = wantFocus ? holdT + dt : 0;
      document.body.classList.toggle('focus', !!(target && wantFocus));
      if (!target) return '';
      const cop = target.role === 'cop';
      if (!wantFocus) return settings(g).isTouch ? 'Hold ◎ to interact' : 'Hold F to interact';
      focusing = true;
      // turn to face them and look at them
      const dx = target.pos.x - player.pos.x, dz = target.pos.z - player.pos.z;
      player.heading += wrapAngle(Math.atan2(dx, dz) - player.heading) * Math.min(1, dt * 6);
      g.lookAt = target.pos;
      if (a.greet) { if (cop && police.wanted > 0 && !combat.drawn) startArrest(target); else greet(target); }
      else if (a.antag) antagonize(target);
      const t = settings(g).isTouch;
      if (cop && police.wanted > 0) return combat.drawn ? 'Holster your weapon to surrender' : (t ? 'Surrender · Antagonize' : 'G Surrender  ·  T Antagonize');
      return t ? 'Greet · Antagonize' : 'G Greet  ·  T Antagonize';
    },
  };
}
const settings = (g) => g.settings;
