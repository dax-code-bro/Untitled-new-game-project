// Flying, batch one (F12). The aircraft themselves (entities/craft.js) now burn fuel, stall when
// too slow, carry flaps and landing gear, drift with the wind and buck in storms, and know how
// hard they touched down. This system adds the rest:
//  - a flight panel: airspeed (knots), height (feet), heading, climb rate, fuel, gear and flaps
//  - G raises and lowers the gear (belly landings hurt), J sets the flaps (slower, safer landings)
//  - warnings: STALL, PULL UP (sinking fast near the ground), LOW FUEL, ENGINE OUT (glide it in;
//    helicopters autorotate)
//  - damage you can see: smoke when the plane's hurt, an engine that can quit when it's bad
//  - landings rated (butter, smooth, firm, hard), the radio at Redgrass calling you in and out
//  - runway edge lights after dark, a windsock that shows the real wind, nav lights and a strobe
//    on every aircraft at night
//  - refuelling: stop on the pad at the airfield (or by a marina pier in a seaplane)
//  - flight school at Redgrass: three lessons (take-off, the circuit, landing), medals, and a
//    pilot's licence (+15% on the flying jobs)
//  - low flying over Port Calvera is against the law
//  - flight time and highest altitude in your stats
import * as THREE from 'three';
import { AIRFIELD, CITY } from '../world/layout.js';
import { AIRCRAFT } from '../entities/craft.js';
import { keyHint, money } from './world-util.js';

export function installAviation(game) {
  const { scene, S, hud, career, hm, player, sky, interact } = game;
  const P = career.p;
  P.stats.flightTime = P.stats.flightTime || 0; P.stats.maxAlt = P.stats.maxAlt || 0; P.stats.landings = P.stats.landings || 0;
  P.flightSchool = P.flightSchool || {};
  const air = () => (S.mode === 'car' && S.vehicle?.isAir ? S.vehicle : null);
  const radio = (line) => hud.toast(`📻 Redgrass: ${line}`, 3.2);
  const callsign = (v) => `N${(v.type || 'x').length * 97 + 120}${v.heli ? 'H' : 'RG'}`;

  // ---------------- the panel
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:13;display:none;gap:14px;align-items:center;font:600 12px "JetBrains Mono",ui-monospace,monospace;color:#d9f2e4;background:rgba(6,14,10,.55);padding:7px 12px;border-radius:9px;text-shadow:0 1px 2px #000;pointer-events:none';
  document.body.appendChild(panel);
  const warnEl = document.createElement('div');
  warnEl.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:14;font:800 26px Inter,system-ui,sans-serif;color:#ff4a3a;text-shadow:0 2px 6px #000;letter-spacing:.08em;pointer-events:none;display:none';
  document.body.appendChild(warnEl);
  const compass = (h) => { const d = ((-h * 180 / Math.PI) % 360 + 360) % 360; return `${String(Math.round(d)).padStart(3, '0')}°`; };

  // ---------------- gear and flaps
  addEventListener('keydown', (e) => {
    const v = air(); if (!v || e.repeat) return;
    if (e.code === 'KeyG' && !v.heli && !v.floats) { if (!v.gearDown || v.alt > 2) { v.gearDown = !v.gearDown; hud.toast(v.gearDown ? 'Gear down' : 'Gear up', 1.2); } }
    if (e.code === 'KeyJ' && !v.heli) { v.flaps = v.flaps ? 0 : 1; hud.toast(v.flaps ? 'Flaps down' : 'Flaps up', 1.2); }
  });

  // ---------------- the airfield: runway lights, windsock, fuel pad
  const len = AIRFIELD.x1 - AIRFIELD.x0, nL = Math.floor(len / 30) + 1;
  const rl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff2c0, emissiveIntensity: 0 }), nL * 2 + 8);
  { const m = new THREE.Matrix4(); let i = 0;
    for (let k = 0; k < nL; k++) for (const sd of [-1, 1]) { const x = AIRFIELD.x0 + k * 30, z = AIRFIELD.z + sd * (AIRFIELD.w / 2 + 1); rl.setMatrixAt(i++, m.makeTranslation(x, hm.height(x, z) + 0.2, z)); }
    for (const x of [AIRFIELD.x0 - 2, AIRFIELD.x1 + 2]) for (let k = 0; k < 4; k++) { const z = AIRFIELD.z - 12 + k * 8; rl.setMatrixAt(i++, m.makeTranslation(x, hm.height(x, z) + 0.2, z)); }
    rl.instanceMatrix.needsUpdate = true; rl.userData.noHit = true; scene.add(rl); }
  const sockAt = { x: AIRFIELD.x1 - 130, z: AIRFIELD.z - 32 };
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 }));
  pole.position.set(sockAt.x, hm.height(sockAt.x, sockAt.z) + 3, sockAt.z); scene.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 12, 1, true).rotateZ(Math.PI / 2).translate(1.1, 0, 0), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.7, side: THREE.DoubleSide }));
  sock.position.set(sockAt.x, pole.position.y + 2.8, sockAt.z); scene.add(sock);
  const pad = { x: AIRFIELD.x1 - 60, z: AIRFIELD.z - 26 };
  interact.add({ x: pad.x, z: pad.z, r: 0.1, marker: false, label: '', use: () => {}, blip: { color: '#ffcf40', size: 4, icon: '⛽' } });

  // ---------------- nav lights and the strobe on every aircraft near you
  const navMat = { red: new THREE.MeshBasicMaterial({ color: 0xff2020 }), green: new THREE.MeshBasicMaterial({ color: 0x20ff40 }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
  const dot = new THREE.SphereGeometry(0.09, 8, 6);
  const fit = (v) => {
    if (v.userData?.nav || !v.group) return;
    const s = v.s || {}, half = v.heli ? (s.r || 1) * 1.2 : (s.span || 8) / 2, y = v.heli ? 1.2 : (s.wingY || 1);
    const L = new THREE.Mesh(dot, navMat.red), R = new THREE.Mesh(dot, navMat.green), T = new THREE.Mesh(dot, navMat.white);
    L.position.set(half, y, 0); R.position.set(-half, y, 0); T.position.set(0, y + 0.6, -(s.L || 8) / 2);
    v.body.add(L, R, T);
    v.userData = v.userData || {}; v.userData.nav = { L, R, T };
  };

  // ---------------- flight school
  const LESSONS = [
    { n: 1, name: 'Take-off', brief: 'Full throttle (W), lift off at flying speed (Space eases the nose up) and climb to 400 ft.', limit: 150 },
    { n: 2, name: 'The circuit', brief: 'Fly through the four markers around the field, between 300 and 1,000 ft.', limit: 300 },
    { n: 3, name: 'Landing', brief: 'Line up with the runway, gear down (G), flaps (J), and set it down gently. Stop on the runway.', limit: 360 },
  ];
  let lesson = null;
  const nextLesson = () => LESSONS.find((l) => !P.flightSchool[l.n]);
  const school = { x: AIRFIELD.x1 - 52, z: AIRFIELD.z - 64 };
  interact.add({ x: school.x, z: school.z, r: 2.2, color: 0x60c0ff, blip: { color: '#60c0ff', size: 5, global: true, icon: '🛩', badge: 'S' },
    show: () => S.mode === 'foot' && !lesson,
    label: () => { const l = nextLesson(); return l ? `${keyHint(game)} flight school: lesson ${l.n} · ${l.name} ($150)` : 'Redgrass Flight School · licensed pilot ✓'; },
    use: () => { const l = nextLesson(); if (!l || !career.spend(150)) return; startLesson(l); } });
  function startLesson(l) {
    const entry = AIRCRAFT.find((a) => a.id === 'skylark');
    const at = l.n === 3 ? { x: AIRFIELD.x0 - 700, z: AIRFIELD.z, h: Math.PI / 2 } : { x: AIRFIELD.x1 - 90, z: AIRFIELD.z, h: -Math.PI / 2 };
    const v = game.marineAir.spawnCraft(entry, 'air', at);
    if (l.n === 3) { v.pos.y = hm.height(at.x, at.z) + 150; v.speed = 38; v.power = 0.45; v.airborne = true; v.gearDown = false; }
    game.enterVehicle(v);
    lesson = { l, v, t: 0, rings: [], idx: 0 };
    if (l.n === 2) for (const [dx, dz] of [[-200, -320], [-650, -320], [-650, 320], [-200, 320]]) lesson.rings.push({ x: AIRFIELD.x1 + dx, z: AIRFIELD.z + dz });
    hud.bigMessage(`LESSON ${l.n}: ${l.name.toUpperCase()}`, l.brief, 5);
    markRing();
  }
  let ringMark = null;
  function markRing() {
    if (ringMark) { interact.remove(ringMark); ringMark = null; }
    const r = lesson?.rings[lesson.idx]; if (!r) return;
    ringMark = interact.add({ x: r.x, z: r.z, r: 50, any: true, marker: true, height: 120, color: 0x60c0ff, label: () => '', use: () => {}, blip: { color: '#60c0ff', size: 7, global: true, icon: '◎' } });
  }
  function endLesson(ok, why) {
    if (ringMark) { interact.remove(ringMark); ringMark = null; }
    const l = lesson.l, t = lesson.t;
    if (ok) {
      const medal = t < l.limit * 0.5 ? 'gold' : t < l.limit * 0.8 ? 'silver' : 'bronze';
      P.flightSchool[l.n] = medal;
      hud.bigMessage(`LESSON ${l.n} PASSED`, `${l.name} · ${medal} · ${Math.round(t)} s`, 4);
      if (!nextLesson() && !P.pilotLicence) { P.pilotLicence = true; setTimeout(() => hud.bigMessage("PILOT'S LICENCE", 'Flying jobs pay 15% more', 4), 4200); game.text?.('Redgrass Flight School', 'Congratulations, captain. Your licence is in the mail.'); }
    } else hud.bigMessage(`LESSON ${l.n} FAILED`, why, 3);
    lesson = null; career.saveSoon();
  }

  let state = { wasAir: false, lastTd: 0, padT: 0, smokeT: 0, lowT: 0, warned: 0, zone: false, roll: 0 };
  return {
    lessons: LESSONS, get lesson() { return lesson; }, startLesson,
    update(dt) {
      const night = sky.night;
      rl.material.emissiveIntensity = night > 0.15 ? 3 : 0;
      // the windsock points downwind, standing out straighter in a stronger wind
      const w = game.hunting?.wind || { x: 1, z: 0, kmh: 8 };
      sock.rotation.y = Math.atan2(-w.z, w.x); sock.scale.set(1, Math.min(1, 0.45 + w.kmh / 30), 1);
      sock.rotation.z = -(1 - Math.min(1, w.kmh / 25)) * 0.9;
      // nav lights on aircraft near you
      const strobe = Math.floor(performance.now() / 120) % 12 === 0;
      for (const v of [S.vehicle, ...(game.parked || [])]) {
        if (!v?.isAir || Math.abs(v.pos.x - player.pos.x) > 400 || Math.abs(v.pos.z - player.pos.z) > 400) continue;
        fit(v); const n = v.userData.nav; const on = night > 0.2 || v === S.vehicle;
        n.L.visible = n.R.visible = on; n.T.visible = on && strobe;
      }
      const v = air();
      if (!v) { panel.style.display = 'none'; warnEl.style.display = 'none'; if (lesson && S.mode === 'foot') endLesson(false, 'You left the aircraft'); state.wasAir = false; return ''; }
      // wind and weather on the airframe
      const k = game.weather?.kind;
      v.windX = w.x * w.kmh / 3.6 * 0.5; v.windZ = w.z * w.kmh / 3.6 * 0.5;
      v.turb = k === 'storm' ? 1 : k === 'rain' ? 0.4 : 0.05;
      // the panel
      const kt = Math.round(Math.abs(v.speed) * 1.944), ft = Math.round(v.alt * 3.281), vs = Math.round(v.v3.y * 196.85);
      panel.style.display = 'flex';
      panel.innerHTML = `<span>${kt} KT</span><span>${ft} FT</span><span>HDG ${compass(v.heading)}</span><span>${vs >= 0 ? '+' : ''}${vs} FPM</span><span style="color:${v.fuel < 0.15 ? '#ff8a6a' : 'inherit'}">FUEL ${Math.round(v.fuel * 100)}%</span>${v.heli ? '' : `<span>GEAR ${v.gearDown || v.floats ? 'DN' : 'UP'} (G)</span><span>FLAPS ${v.flaps ? 'DN' : 'UP'} (J)</span>`}`;
      // warnings
      let warn = '';
      if (v.health <= 0 || v.engineOut) warn = v.heli ? 'ENGINE OUT · AUTOROTATE' : 'ENGINE OUT · GLIDE';
      else if (v.fuel <= 0) warn = v.heli ? 'NO FUEL · AUTOROTATE' : 'NO FUEL · GLIDE';
      else if (v.stall) warn = 'STALL';
      else if (v.airborne && v.alt < 60 && v.v3.y < -8) warn = 'PULL UP';
      else if (v.fuel < 0.15 && Math.floor(performance.now() / 600) % 2) warn = 'LOW FUEL';
      warnEl.textContent = warn; warnEl.style.display = warn ? 'block' : 'none';
      // a hurt aircraft smokes; badly hurt, the engine can quit
      if (v.health < 50 && (state.smokeT -= dt) <= 0) { state.smokeT = 0.12; game.combat?.burst?.(v.pos.clone().setY(v.pos.y + 1), game.combat.dustMat, 1, { speed: 0.3, life: 1.6, grav: -0.4, color: new THREE.Color(0x2a2a2a), size: 2.4 }); }
      if (v.health < 25 && v.airborne && !v.engineOut && Math.random() < dt * 0.03) { v.engineOut = true; hud.toast('The engine coughs and dies.', 2.5); }
      // landings rated, the radio
      const nearField = Math.hypot(v.pos.x - (AIRFIELD.x0 + AIRFIELD.x1) / 2, v.pos.z - AIRFIELD.z) < 900;
      if (v.touchdown && v.touchdown.t !== state.lastTd) {
        state.lastTd = v.touchdown.t; P.stats.landings++;
        const s = -v.touchdown.vs, word = !v.touchdown.gear ? 'Belly landing!' : s < 1.5 ? 'Butter landing' : s < 3 ? 'Smooth landing' : s < 5 ? 'Firm landing' : 'Hard landing';
        hud.toast(`${word} · ${(s * 196.85).toFixed(0)} fpm`, 2.4);
        if (nearField) radio(`${callsign(v)}, welcome to Redgrass. Taxi to parking.`);
        if (lesson?.l.n === 3) { const onRwy = v.pos.x > AIRFIELD.x0 && v.pos.x < AIRFIELD.x1 && Math.abs(v.pos.z - AIRFIELD.z) < AIRFIELD.w / 2 + 4; if (!onRwy) endLesson(false, 'You landed off the runway'); else if (s > 3.5 || !v.touchdown.gear) endLesson(false, 'Too hard a landing'); else lesson.landed = true; }
      }
      if (v.airborne && !state.wasAir && nearField) radio(`${callsign(v)}, cleared for departure. Winds ${Math.round(w.kmh)} km/h.`);
      const inZone = nearField && v.airborne && v.alt < 330;
      if (inZone && !state.zone && state.wasAir) radio(`${callsign(v)}, you're in the pattern. Report final.`);
      state.zone = inZone; state.wasAir = v.airborne;
      // stats
      if (v.airborne) { P.stats.flightTime += dt; P.stats.maxAlt = Math.max(P.stats.maxAlt, Math.round(v.pos.y)); }
      // fuel: stop on the pad (or by a marina in a seaplane)
      const atPad = Math.hypot(v.pos.x - pad.x, v.pos.z - pad.z) < 20 || (v.floats && (game.marineAir?.marinas || []).some((m) => Math.hypot(v.pos.x - m.water.x, v.pos.z - m.water.z) < 30));
      if (atPad && !v.airborne && Math.abs(v.speed) < 1 && v.fuel < 0.98) {
        if ((state.padT += dt) > 1.5) { const cost = Math.round((1 - v.fuel) * (v.heli ? 420 : 260)); if (career.spend(cost)) { v.fuel = 1; hud.toast(`Refuelled: ${money(cost)}`, 2); } state.padT = -20; }
        else return 'Refuelling…';
      } else if (state.padT > 0) state.padT = 0;
      // low flying over Port Calvera
      const overCity = v.pos.x > CITY.x0 && v.pos.x < CITY.x0 + CITY.nx * CITY.pitch && v.pos.z > CITY.z0 && v.pos.z < CITY.z0 + CITY.nz * CITY.pitch;
      if (overCity && v.airborne && v.alt < 70) { state.lowT += dt; if (state.lowT > 4 && !state.warned) { state.warned = 1; game.police?.crime('disturbance'); hud.toast('Low flying over the city: the police have your tail number.', 3); } else if (state.lowT > 0.5 && state.lowT < 0.6) hud.toast('Too low over the city: climb above 250 ft', 2); }
      else { state.lowT = 0; if (!overCity) state.warned = 0; }
      // the lesson
      if (lesson && lesson.v === v) {
        lesson.t += dt;
        if (lesson.t > lesson.l.limit) { endLesson(false, 'Out of time'); return ''; }
        if (v.health < 50) { endLesson(false, 'You damaged the trainer'); return ''; }
        if (lesson.l.n === 1 && v.alt > 122) endLesson(true);
        else if (lesson.l.n === 2) {
          const r = lesson.rings[lesson.idx];
          if (r && Math.hypot(v.pos.x - r.x, v.pos.z - r.z) < 55 && v.alt > 90 && v.alt < 310) { lesson.idx++; hud.toast(`Marker ${lesson.idx}/4`, 1.2); if (lesson.idx >= lesson.rings.length) endLesson(true); else markRing(); }
        } else if (lesson.l.n === 3 && lesson.landed && Math.abs(v.speed) < 2) endLesson(true);
        if (lesson) return `LESSON ${lesson.l.n} · ${lesson.l.name} · ${Math.ceil(lesson.l.limit - lesson.t)} s`;
      }
      return '';
    },
  };
}
