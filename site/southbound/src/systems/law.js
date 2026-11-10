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
import { roadPointAround, keyHint, nearestRoad } from './world-util.js';
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
    // (A2) your finger in their face; they recoil, then square up (or wave you off)
    if (g.acts && !S.doorWalk) g.acts.play([{ face: p.pos, t: 0.2 }, { t: 0.8, ik: (F, k, ctx, P) => { const head = p.h.root.position.clone(); head.y += 1.5; g.acts.reachTo(P, F, 'R', head.lerp(F.chest.clone().addScaledVector(F.fw, 0.3), 0.45), k, 3); } }]);
    setTimeout(() => { if (p.mode !== 'dead' && p.h && !p.h.ragdoll) p.h.play(p.anger >= 3 ? 'Hit_Chest' : 'Idle_Talking_Loop', 0.15, 1, p.anger >= 3); }, 350);
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

  // ---------------- arrest scene (A2): the officer's hands are on you, and how rough it is depends on
  // what you did (police.heat: the worst crime this chase, and how wanted you are):
  //  'cuff'   a ticket-type offence: "turn around, hands behind your back", cuffed standing, a hand on
  //           your arm to the cruiser, the door, a hand on your head, into the back
  //  'hood'   theft, a robbery, shots fired: marched to the cruiser, hands on the hood, patted down,
  //           cuffed there, put in the back
  //  'ground' a killing, a cop shot, SWAT: "on the ground!", on your knees, shoved flat, a knee in your
  //           back and cuffed on the ground with a partner covering you, hauled up by both arms, pushed in
  let cut = null;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const LINES = {
    cuff: [['Officer', 'Turn around. Hands behind your back.'], ['Officer', 'Watch your head.']],
    hood: [['Officer', 'Hands on the car! Now!'], ['Officer', 'Anything sharp in your pockets? ...Alright.'], ['Officer', 'In the car.']],
    ground: [['Officer', 'GET ON THE GROUND! NOW!'], ['Officer', 'Stop resisting! Hands behind your back!'], ['Officer', 'Up. Get up!']],
  };
  function startArrest(cop) {
    if (cut || S.dead > 0) return;
    if (S.mode === 'car') g.exitVehicle();
    combat.holstered = true;
    cop = cop || peds.list.find((p) => p.role === 'cop' && p.mode !== 'dead') || null;
    const heat = police.heat || 1, w = police.wanted || 1;
    const style = cop?.swat || heat >= 3 || w >= 4 ? 'ground' : heat >= 2 || w >= 3 ? 'hood' : 'cuff';
    // the cruiser pulls up on the road beside you, its passenger side to you (or on your left, off-road)
    const car = new g.Vehicle(lib, 'police');
    const right = V3(-Math.cos(player.heading), 0, Math.sin(player.heading));
    const rd = nearestRoad(graph, player.pos.x, player.pos.z), CW = (car.spec.width || 1.9) / 2;
    if (rd && rd.dist < 30 && !S.indoors) {
      let nx = player.pos.x - rd.x, nz = player.pos.z - rd.z; const nl = Math.hypot(nx, nz);
      if (nl > 0.3) { nx /= nl; nz /= nl; } else { nx = -rd.tz; nz = rd.tx; }
      const room = Math.max(0, rd.edge.width / 2 - CW - 0.4), off = clamp(nl - CW - 1.7, -room, room);
      car.pos.set(rd.x + nx * off, 0, rd.z + nz * off);
      car.heading = Math.atan2(nz, -nx); // its right side (the passenger door) toward you
    } else { car.pos.set(player.pos.x - right.x * 4.6, 0, player.pos.z - right.z * 4.6); car.heading = player.heading; }
    car.pos.y = collision.surface(car.pos.x, car.pos.z, player.pos.y + 2);
    car.siren = true; car.sync(0);
    scene.add(car.group);
    if (!cop) {
      const h = new Human(lib, 'mh_cop');
      cop = { h, role: 'cop', mode: 'walk', hp: 120, pos: car.pos.clone().addScaledVector(right, 2.2).addScaledVector(V3(Math.sin(car.heading), 0, Math.cos(car.heading)), -2.5), heading: 0, speed: 0, radius: 0.35, acc: 0, timer: 0, scripted: true };
      scene.add(h.root);
    }
    // out of the street crowd for the scene (peds.update would move and animate them a second time)
    const li = peds.list.indexOf(cop); if (li >= 0) peds.list.splice(li, 1);
    cop.scripted = true; cop.h.root.visible = true; if (cop.gun) cop.gun.visible = false;
    const A = g.acts.person(cop.pos, cop.heading, null, { h: cop.h });
    let partner = null, pgun = null;
    if (style === 'ground') {
      const h2 = new Human(lib, 'mh_cop'); scene.add(h2.root);
      const fwd = V3(Math.sin(player.heading), 0, Math.cos(player.heading));
      partner = g.acts.person(player.pos.clone().addScaledVector(fwd, 3.2).addScaledVector(right, 1.2), player.heading + Math.PI, null, { h: h2 });
      h2.play('Pistol_Aim_Neutral', 0); pgun = buildWeaponModel(WEAPONS.pistol); scene.add(pgun);
      partner.ik = (F, P) => P.attachToHand(pgun, P.R);
    }
    const fine = Math.round(L.bounty + police.wanted * 150 + Math.min(S.money * 0.08, 2500));
    const fwdC = V3(Math.sin(car.heading), 0, Math.cos(car.heading)), rightC = V3(-Math.cos(car.heading), 0, Math.sin(car.heading));
    const W = car.spec.width || 1.9, Ln = car.spec.len || 4.8;
    const spot = {
      door: car.pos.clone().addScaledVector(rightC, W / 2 + 0.6).addScaledVector(fwdC, (car.spec.wf || 1.3) * 0.2 - 0.55),
      hood: car.pos.clone().addScaledVector(rightC, W / 2 + 0.62).addScaledVector(fwdC, Ln * 0.3),
      hoodY: car.pos.y + Math.min(1.05, (car.spec.height || 1.45) * 0.62),
      drv: car.pos.clone().addScaledVector(rightC, -(W / 2 + 0.6)).addScaledVector(fwdC, (car.spec.wf || 1.3) * 0.2),
      fwdC, rightC,
    };
    cut = { t: 0, pt: 0, ph: 0, style, cop: A, copRef: cop, partner, pgun, car, spot, fine, days: 2 + Math.min(4, police.wanted), cuffs: g.acts.prop('cuffs'), cuffed: false, seated: false, said: 0 };
    S.dead = 99; // freezes your controls for the scene
    S.cutscene = true;
    hud.toast('', 0.01);
    say(...LINES[style][0], 3);
  }
  police.onBusted = (cop) => startArrest(cop);

  // where the officer stands to work on you: behind you, a little to one side
  const behindOf = (d = 0.62, sideK = 0.12) => { const f = V3(Math.sin(player.heading), 0, Math.cos(player.heading)), r = V3(-f.z, 0, f.x); return player.pos.clone().addScaledVector(f, -d).addScaledVector(r, sideK); };
  const toward = (to, dt, k = 8) => { player.heading += wrapAngle(Math.atan2(to.x - player.pos.x, to.z - player.pos.z) - player.heading) * Math.min(1, dt * k); };
  const stepPlayer = (to, dt, sp) => { // true when there
    const dx = to.x - player.pos.x, dz = to.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) return true;
    toward(to, dt); const s = Math.min(sp, d * 4); player.pos.x += (dx / d) * s * dt; player.pos.z += (dz / d) * s * dt;
    player.pos.y = collision.surface(player.pos.x, player.pos.z, player.pos.y + 0.5);
    player.h.play('Walk_Loop', 0.2, clamp(sp / 1.35, 0.6, 1.2));
    return false;
  };
  // the cop walks beside/behind you, a hand on your upper arm
  const escort = (c, dt, sideK = 0.32) => {
    const A = c.cop, want = behindOf(0.45, sideK);
    A.pos.lerp(want, Math.min(1, dt * 6)); A.pos.y = collision.surface(A.pos.x, A.pos.z, A.pos.y + 0.5);
    A.heading += wrapAngle(player.heading - A.heading) * Math.min(1, dt * 6);
    A.h.play(player.h.current?.getClip().name === 'Walk_Loop' ? 'Walk_Loop' : 'Idle_Loop', 0.2, 0.9);
  };
  // the cuffs sit on your wrists
  const placeCuffs = (c) => {
    if (!c.cuffed || !gunPose.ok) return;
    const wr = g.acts.wristsOf(gunPose), m = c.cuffs;
    m.position.copy(wr.R).lerp(wr.L, 0.5); m.lookAt(wr.R); m.rotateY(Math.PI / 2); m.updateMatrixWorld(true);
  };
  // the officer's hands: on your wrists (cuffing), on your arm and back (escort), on your head (into the car)
  const copHands = (c, mode, k = 0) => {
    const A = c.cop; if (!A.pose) A.pose = new GunPose(A.h);
    const P = A.pose; if (!P.ok || !gunPose.ok) { A.ik = null; return; }
    A.ik = (F) => {
      if (mode === 'wrists') { const wr = g.acts.wristsOf(gunPose); P.reach(P.R, wr.R, F, 'R'); P.reach(P.L, wr.L, F, 'L'); }
      else if (mode === 'arm') { const arm = (c.armSide === 'L' ? gunPose.L : gunPose.R).upper.getWorldPosition(V3()).lerp((c.armSide === 'L' ? gunPose.L : gunPose.R).lower.getWorldPosition(V3()), 0.35); P.reach(c.armSide === 'L' ? P.R : P.L, arm, F, c.armSide === 'L' ? 'R' : 'L'); }
      else if (mode === 'frisk') { // down your sides and legs, twice
        const pf = gunPose.frame(player.heading), y = 1.25 - Math.abs(Math.sin(k * Math.PI * 2)) * 0.85;
        for (const s of ['R', 'L']) { const pt = player.pos.clone().addScaledVector(pf.right, (s === 'R' ? 1 : -1) * 0.2).addScaledVector(pf.fw, 0.02); pt.y = player.pos.y + y; P.reach(s === 'R' ? P.R : P.L, pt, F, s); }
      } else if (mode === 'head') { const hd = gunPose.head ? gunPose.head.getWorldPosition(V3()) : player.pos.clone().add(V3(0, 1.7, 0)); hd.y += 0.12; P.reach(P.R, hd, F, 'R'); }
      else if (mode === 'door') { const dp = c.car.pos.clone().addScaledVector(c.spot.rightC, (c.car.spec.width || 1.9) / 2 + 0.05).addScaledVector(c.spot.fwdC, 0.2); dp.y = c.car.pos.y + 1.0; P.reach(P.R, dp, F, 'R'); }
      else if (mode === 'back') { const pf = gunPose.frame(player.heading); P.reach(P.L, pf.chest.clone().addScaledVector(pf.fw, -0.16), F, 'L'); }
    };
  };
  // your hands: up / behind your back / on the hood / on the back of your head
  const myHands = (c, mode, k = 1) => { c.hands = [mode, k]; }; // (applied after your body's animation this frame)
  const applyMyHands = (c, mode, k = 1) => {
    if (!gunPose.ok) return;
    player.h.root.updateMatrixWorld(true);
    const F = gunPose.frame(player.heading);
    if (mode === 'up') g.acts.handsUp(gunPose, F, k);
    else if (mode === 'behind') g.acts.handsBehind(gunPose, F);
    else if (mode === 'hood') for (const s of ['R', 'L']) { const pt = c.spot.hood.clone().addScaledVector(c.spot.fwdC, s === 'R' ? 0.32 : -0.32).addScaledVector(c.spot.rightC, -0.42); pt.y = c.spot.hoodY; gunPose.reach(s === 'R' ? gunPose.R : gunPose.L, pt, F, s); }
    else if (mode === 'head') for (const s of ['R', 'L']) { const hd = (gunPose.head || gunPose.chest).getWorldPosition(V3()).addScaledVector(F.fw, -0.12).addScaledVector(F.right, s === 'R' ? 0.08 : -0.08); hd.y += 0.04; gunPose.reach(s === 'R' ? gunPose.R : gunPose.L, hd, F, s); }
  };

  // the phases of each kind of arrest: [seconds, (c, dt, k) => true to move on early]
  const COMMON_TAIL = [
    // walked to the cruiser's back door, a hand on your arm
    [7, (c, dt) => { c.armSide = 'R'; copHands(c, 'arm'); const there = stepPlayer(c.spot.door, dt, c.style === 'ground' ? 1.5 : 1.15); escort(c, dt); myHands(c, 'behind'); return there; }],
    // the door
    [0.7, (c, dt, k) => { toward(c.car.pos, dt, 4); player.h.play('Idle_Loop', 0.2); copHands(c, 'door'); c.cop.face(c.car.pos, dt); const d = c.car.door?.('door-pass'); if (d) d.rotation.y = d.userData.open * Math.min(1, k * 1.4); myHands(c, 'behind'); }],
    // a hand on your head and in you go
    [1.0, (c, dt, k) => { copHands(c, 'head'); if (k < 0.6) { const into = c.car.pos.clone().addScaledVector(c.spot.rightC, (c.car.spec.width || 1.9) / 2 - 0.1).addScaledVector(c.spot.fwdC, -0.5); player.pos.lerp(V3(into.x, player.pos.y, into.z), Math.min(1, dt * (c.style === 'ground' ? 5 : 2.5))); }
      else if (!c.seated) { c.seated = true; say(...LINES[c.style][LINES[c.style].length - 1], 2); player.h.play('Sitting_Idle_Loop', 0.25, 1, true); } myHands(c, 'behind'); }],
    // the door shuts; the officer walks round and gets in
    [2.2, (c, dt, k) => { const d = c.car.door?.('door-pass'); if (d) d.rotation.y = d.userData.open * Math.max(0, 1 - k * 4); c.cop.ik = null; if (!c.cop.walk(c.spot.drv, dt, 1.6) && k < 0.95) return false; if (!c.copIn) { c.copIn = true; c.cop.h.play('Driving_Loop', 0.2, 1, true); } }],
  ];
  const PHASES = {
    cuff: [
      // hands up; the officer walks round behind you
      [1.7, (c, dt, k) => { player.h.play('Idle_Loop', 0.2); myHands(c, 'up', Math.min(1, k * 3)); return c.cop.walk(behindOf(), dt, 1.6) && k > 0.6; }],
      // turn your back; hands behind it
      [0.9, (c, dt, k) => { c.cop.face(player.pos, dt); myHands(c, 'behind'); }],
      // the cuffs go on
      [1.5, (c, dt, k) => { c.cop.face(player.pos, dt); copHands(c, 'wrists'); myHands(c, 'behind'); if (k > 0.55 && !c.cuffed) { c.cuffed = true; scene.add(c.cuffs); g.audio?.click?.(0.6); } }],
      ...COMMON_TAIL,
    ],
    hood: [
      [1.3, (c, dt, k) => { player.h.play('Idle_Loop', 0.2); myHands(c, 'up', Math.min(1, k * 3)); return c.cop.walk(behindOf(0.55, 0.3), dt, 2.6) && k > 0.5; }],
      // marched to the front of the cruiser
      [5, (c, dt) => { c.armSide = 'R'; copHands(c, 'arm'); const there = stepPlayer(c.spot.hood, dt, 1.5); escort(c, dt); myHands(c, 'behind'); return there; }],
      // hands on the hood
      [0.8, (c, dt, k) => { toward(c.car.pos.clone().addScaledVector(c.spot.fwdC, (c.car.spec.len || 4.8) * 0.3), dt, 6); player.h.play('Idle_Loop', 0.2); myHands(c, 'hood'); c.cop.ik = null; c.cop.walk(behindOf(0.62, 0.05), dt, 1.2); }],
      // patted down
      [2.4, (c, dt, k) => { myHands(c, 'hood'); c.cop.face(player.pos, dt); c.cop.walk(behindOf(0.55, 0.05), dt, 0.8); copHands(c, 'frisk', k); if (k > 0.5 && !c.said) { c.said = 1; say(...LINES.hood[1], 2.4); } }],
      // hands behind your back, cuffed against the car
      [1.5, (c, dt, k) => { myHands(c, 'behind'); copHands(c, 'wrists'); c.cop.face(player.pos, dt); if (k > 0.5 && !c.cuffed) { c.cuffed = true; scene.add(c.cuffs); g.audio?.click?.(0.6); } }],
      ...COMMON_TAIL,
    ],
    ground: [
      // hands up, the partner covering you
      [1.0, (c, dt, k) => { player.h.play('Idle_Loop', 0.2); myHands(c, 'up', Math.min(1, k * 4)); c.cop.walk(behindOf(1.2, 0.2), dt, 3.2); }],
      // on your knees, hands on your head
      [1.4, (c, dt, k) => { player.h.play('Crouch_Idle_Loop', 0.3, 1, true); myHands(c, 'head'); c.cop.walk(behindOf(0.7, 0.15), dt, 2.0); }],
      // shoved flat
      [0.5, (c, dt, k) => { if (!c.shoved) { c.shoved = true; c.cop.h.play('Punch_Cross', 0.05, 1.4, true); setTimeout(() => cut && player.h.play('Death01', 0.12, 1.6, true), 160); } c.cop.face(player.pos, dt); }],
      // a knee in your back; cuffed on the ground
      [2.4, (c, dt, k) => { if (k < 0.3) return false; c.cop.h.play('Crouch_Idle_Loop', 0.25, 1, true); c.cop.walk(behindOf(0.35, 0.35), dt, 1.0); copHands(c, 'wrists'); if (k > 0.6 && !c.cuffed) { c.cuffed = true; scene.add(c.cuffs); g.audio?.click?.(0.7); } if (k > 0.4 && !c.said) { c.said = 1; say(...LINES.ground[1], 2.4); } }],
      // hauled up by both arms
      [1.3, (c, dt, k) => { if (!c.up) { c.up = true; player.h.play('Crouch_Idle_Loop', 0.5, 1, true); c.cop.h.play('Idle_Loop', 0.3, 1, true); say(...LINES.ground[2], 1.6); } if (k > 0.5) player.h.play('Idle_Loop', 0.4); c.armSide = 'R'; copHands(c, 'arm'); escort(c, dt); myHands(c, 'behind'); if (c.partner) { c.partner.walk(behindOf(0.45, -0.32), dt, 2.0); } }],
      ...COMMON_TAIL,
    ],
  };

  function updateArrest(dt) {
    const c = cut;
    c.t += dt; c.pt += dt; c.hands = null;
    const list = PHASES[c.style];
    if (c.ph < list.length) {
      const [d, run] = list[c.ph];
      const r = run(c, dt, clamp(c.pt / d, 0, 1));
      if (r === true || (r !== false && c.pt >= d) || c.pt >= d + 4) { c.ph++; c.pt = 0; }
      if (c.ph >= list.length) c.drive = 0;
    } else {
      // driven away
      c.drive += dt;
      c.car.physics(dt, { throttle: 0.6, brake: 0, steer: 0, handbrake: false }, g.hm, collision);
      if (c.drive > 1.6 && !c.faded) { c.faded = true; fade.querySelector('b').textContent = 'BUSTED'; fade.querySelector('span').textContent = `${c.days} days later...`; fade.classList.add('show'); }
      if (c.drive > 3.2) { endArrest(c); return; }
    }
    // the partner keeps you covered (and walks along once you're up)
    if (c.partner) { if (!c.up) c.partner.face(player.pos, dt); c.partner.sync(dt); c.pgun?.updateMatrixWorld(true); }
    c.car.sync(dt);
    // bodies: you (seated in the back once you're in), the officer (in the driver's seat once he's in)
    player.h.update(dt);
    if (c.seated && c.car.cabLayout) { c.car.seat(player.h, Math.min(2, (c.car.cabLayout.seats.length || 2) - 1)); }
    else { player.h.root.position.copy(player.pos); player.h.root.rotation.y = player.heading; }
    if (c.copIn && c.car.cabLayout) { c.cop.h.update(dt); c.car.seat(c.cop.h, 0); }
    else c.cop.sync(dt);
    // the IK on top: your hands (as the phase asked) and the cuffs on your wrists
    if (c.hands && !c.seated) applyMyHands(c, c.hands[0], c.hands[1]);
    else if (c.cuffed && c.seated) { player.h.root.updateMatrixWorld(true); applyMyHands(c, 'behind'); }
    placeCuffs(c);
  }
  function endArrest(c) {
    const cop = c.copRef;
    scene.remove(c.car.group); c.car.dispose?.();
    scene.remove(cop.h.root); cop.h.freeGpu?.(); cop.mode = 'gone'; cop.scripted = false;
    if (c.partner) { c.partner.remove(); }
    if (c.pgun) scene.remove(c.pgun);
    scene.remove(c.cuffs);
    police.clear();
    S.money = Math.max(0, S.money - c.fine);
    L.bounty = 0; L.nextHunt = 0;
    if (g.missions?.active) g.missions.fail('You were arrested');
    sky.day += c.days; sky.hour = 9.5;
    const at = g.PRECINCT;
    player.pos.set(at.x, collision.surface(at.x, at.z, 200), at.z);
    player.vel.set(0, 0, 0);
    player.h.root.visible = true; player.h.play('Idle_Loop', 0, 1, true);
    player.health = 100;
    g.rig.yaw = player.heading;
    S.dead = 0; S.cutscene = false;
    cut = null;
    setTimeout(() => fade.classList.remove('show'), 600);
    hud.toast(`Released from ${at.name}. Fine paid: $${c.fine.toLocaleString('en-US')}`, 5);
    g.onArrested?.();
    career.saveSoon();
  }
  // scripted camera for the arrest: beside you while they work on you (low when you're on the ground),
  // then behind the cruiser as it drives off
  // a side to film from that a wall or a parked car isn't in the way of (picked again when blocked)
  const camClear = (c, ang, dist, hgt) => {
    const p = player.pos, x = p.x + Math.cos(player.heading + ang) * dist, z = p.z - Math.sin(player.heading + ang) * dist, y = p.y + hgt;
    if (collision.raycast(p.x, p.y + 1.2, p.z, x, y, z) < 0.98) return false;
    for (const v of [c.car, ...(g.parked || []), ...(g.traffic?.cars || []).map((t) => t.v)]) if (v?.pos && Math.hypot(v.pos.x - x, v.pos.z - z) < (v.spec?.len || 4.5) * 0.5 + 1.2) return false;
    return true;
  };
  function arrestCamera(camera) {
    const c = cut;
    if (!c.seated || !c.copIn) {
      const low = c.style === 'ground' && !c.up, dist = low ? 3.0 : 3.8, hgt = low ? 1.2 : 1.85;
      if (c.camAng == null || (c.camT = (c.camT || 0) - 1 / 60) <= 0) {
        c.camT = 0.5;
        if (c.camAng == null || !camClear(c, c.camAng, dist, hgt)) c.camAng = [0.9, -0.9, 2.3, -2.3, 0.2, Math.PI].find((a) => camClear(c, a, dist, hgt)) ?? 0.9;
      }
      const side = V3(Math.cos(player.heading + c.camAng), 0, -Math.sin(player.heading + c.camAng));
      camera.position.copy(player.pos).addScaledVector(side, dist).add(tmp.set(0, hgt, 0));
      camera.lookAt(player.pos.x, player.pos.y + (low ? 0.5 : 1.15), player.pos.z);
    } else {
      const v = c.car, b = V3(-Math.sin(v.heading), 0, -Math.cos(v.heading));
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
    use: () => {
      if (S.money < L.bounty) { hud.toast('Not enough cash to pay the bounty', 2.5); return; }
      const paid = () => { S.money -= L.bounty; L.bounty = 0; L.nextHunt = 0; hud.toast('Bounty paid. You\'re a free citizen.', 3); career.saveSoon(); };
      const sgt = g.civic?.precinct?.staff || Object.values(g.civic || {}).find((c) => c.staff && /precinct|police/i.test(c.name))?.staff;
      if (g.acts && sgt && !S.doorWalk && sgt.root.position.distanceTo(player.pos) < 5) { const who = g.acts.fromHuman(sgt); if (g.acts.play(g.acts.payBeats(who, 'give', 1.1), { done: () => { who.release(); paid(); } })) return; who.release(); }
      paid();
    } });

  let brandishT = 0;
  return {
    get cutscene() { return !!cut; },
    _cut: () => cut, // (tests: the arrest scene in progress)
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
