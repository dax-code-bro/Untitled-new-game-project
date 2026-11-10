// Driving, batch one: the things around the wheel.
//  - Fuel: every car has a tank. It drains with the throttle and the speed; run dry and the engine
//    coughs and dies. Fill up at any Gulf Mart (pull in by the store and stop) or, on foot by the
//    car, tip in the fuel can from the hardware store.
//  - Skid marks: brake hard, drift or pull the handbrake on asphalt and the tyres leave black marks
//    that stay on the road.
//  - The horn: people in front of the car jump out of the way (and say what they think of you).
//  - Parked cars: you hot-wire one before it'll start (quicker with a lockpick set), and some have
//    an alarm that goes off — lights flashing, someone calls it in.
//  - Speeding: a patrol car that clocks you well over the limit lights up and pulls you over. Stop
//    and you get a ticket; keep going and you're wanted.
import * as THREE from 'three';
import { nearestRoad } from './world-util.js';

const LIMIT = { street: 15.6, road: 24.6, highway: 31.3 }; // 35 / 55 / 70 mph
const MARKS = 700;

export function installDriving(game) {
  const { scene, hud, player, S, peds, police, career } = game;
  // (A2) pulled over: the officer gets out, walks up to your window, has a word, and hands you the ticket
  // through it; you take it; they walk back to the cruiser
  const sideOf = (v, k) => { const h = v.heading; return new THREE.Vector3(Math.cos(h) * k, 0, -Math.sin(h) * k); };
  const fwdOf = (v, k) => new THREE.Vector3(Math.sin(v.heading) * k, 0, Math.cos(v.heading) * k);
  const chargeTicket = (c, fine, line = '') => { career.spend?.(Math.min(fine, S.money)) || (S.money = Math.max(0, S.money - fine)); hud.toast(`Speeding ticket: ${c.over} over the limit · $${fine}${line}`, 3.2); };
  function startTicket(v) {
    const c = clocked, W = (v.spec.width || 1.9) / 2;
    const pc = c.cop?.pos ? c.cop : null;
    const from = pc && pc.pos.distanceTo(v.pos) < 40 ? pc.pos.clone().add(sideOf(pc, (pc.spec?.width || 1.9) / 2 + 0.7)) : v.pos.clone().add(fwdOf(v, -11)).add(sideOf(v, W + 0.8));
    const win = v.pos.clone().add(sideOf(v, W + 0.5)).add(fwdOf(v, 0.05));
    const off = game.acts ? game.acts.person(from, v.heading, 'mh_cop') : null;
    if (!off) { chargeTicket(c, 50 + c.over * 5); police.clear?.(); clocked = null; stopT = 0; return; }
    c.scene = { off, from, win, t: 0, ph: 0, fine: 50 + c.over * 5, ticket: game.acts.prop('ticket') };
    S.holdCar = 'ticket';
  }
  function endTicket() {
    const c = clocked, sc = c.scene;
    sc.off.remove(); sc.ticket.parent?.remove(sc.ticket);
    if (S.holdCar === 'ticket') S.holdCar = false;
    S.carReach = null;
    if (c.cop) c.cop.siren = false;
    police.clear?.(); clocked = null; stopT = 0;
  }
  function ticketScene(v, dt) {
    const c = clocked, sc = c.scene, off = sc.off;
    sc.t += dt;
    if (S.mode !== 'car' || S.vehicle !== v) { if (!sc.paid) chargeTicket(c, sc.fine); endTicket(); return; }
    const winPt = sc.win.clone(); winPt.y = v.pos.y + 1.15;
    if (sc.ph === 0) { // out of the cruiser and up to your window
      if (off.walk(sc.win, dt, 1.5) || sc.t > 12) { sc.ph = 1; sc.t = 0; police.radio?.('License and registration, please.', 0); }
    } else if (sc.ph === 1) { // a word through the window
      off.face(v.pos, dt); off.h.play('Idle_Talking_Loop', 0.2);
      if (sc.t > 1.4 && !sc.said) { sc.said = true; hud.toast(`Officer: "${c.over} over the limit. I'm writing you up."`, 2.4); }
      if (sc.t > 2.8) { sc.ph = 2; sc.t = 0; off.hold(sc.ticket, false); off.h.play('Idle_Loop', 0.2); }
    } else if (sc.ph === 2) { // the ticket goes in through the window; you take it
      off.face(v.pos, dt);
      const k = Math.min(1, sc.t / 1.3);
      if (k < 0.55) off.ik = (F, P) => { game.acts.reachTo(P, F, 'R', winPt, 0.15 + k * 0.6); P.attachToHand(sc.ticket, P.R); };
      else {
        if (off.held === sc.ticket) { off.drop(); off.ik = (F, P) => game.acts.reachTo(P, F, 'R', winPt, 0.5 + (k - 0.55) * 1.1); }
        // your left hand takes it (main.js: S.carReach runs after your hands are on the wheel)
        S.carReach = (gp) => { const F = gp.frame(v.heading); gp.reach(gp.L, winPt, F, 'L'); gp.attachToHand(sc.ticket, gp.L); };
      }
      if (k >= 1 && !sc.paid) { sc.paid = true; chargeTicket(c, sc.fine, '. "Slow it down out there."'); sc.ph = 3; sc.t = 0; off.ik = null; }
    } else { // back to the cruiser; the ticket goes on the dash
      if (sc.t > 0.7 && S.carReach) { S.carReach = null; sc.ticket.parent?.remove(sc.ticket); }
      if (off.walk(sc.from, dt, 1.4) || sc.t > 9) { endTicket(); return; }
    }
    off.sync(dt);
  }

  // ---- skid marks: one instanced mesh, a ring buffer of dark strips on the road
  const markGeo = new THREE.PlaneGeometry(0.22, 0.55).rotateX(-Math.PI / 2);
  const markMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const marks = new THREE.InstancedMesh(markGeo, markMat, MARKS);
  marks.count = 0; marks.frustumCulled = false; marks.userData.noHit = true; marks.renderOrder = 1;
  scene.add(marks);
  let markI = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const lastMark = [null, null];
  const addMark = (k, x, y, z, heading) => {
    const prev = lastMark[k];
    if (prev && Math.hypot(prev.x - x, prev.z - z) < 0.45) return;
    lastMark[k] = { x, z };
    _q.setFromAxisAngle(Y, heading); _p.set(x, y + 0.03, z);
    marks.setMatrixAt(markI, _m.compose(_p, _q, _s));
    markI = (markI + 1) % MARKS; marks.count = Math.max(marks.count, markI === 0 ? MARKS : markI);
    marks.instanceMatrix.needsUpdate = true;
  };

  // ---- fuel
  const fuelOf = (v) => { if (v.fuel === undefined) v.fuel = v.uid ? 1 : 0.35 + Math.random() * 0.6; return v.fuel; };
  const marts = () => (game.shopSpots || []).filter((s) => s.kind === 'mart');
  const gauge = document.createElement('div');
  gauge.id = 'fuelgauge';
  gauge.style.cssText = 'position:absolute;left:0;right:0;bottom:-14px;height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden';
  gauge.innerHTML = '<i style="display:block;height:100%;width:100%;background:#e8b04a"></i>';
  const speedo = document.getElementById('speedo'); if (speedo) { speedo.style.position = speedo.style.position || 'relative'; speedo.appendChild(gauge); }
  let lowWarned = false, sputter = 0, pumps = null, fillT = 0;

  // ---- tickets
  let stopT = 0, clocked = null, roadT = 0, limit = LIMIT.street;

  // ---- hot-wiring and alarms (main.js calls onEnterParked when you take a car that isn't yours)
  let wire = null;
  game.onEnterParked = (v) => {
    if (v.uid || v.wired) return;
    const pick = game.tools?.best?.('lockpick');
    wire = { v, t: pick ? 1.0 : 2.6 };
    S.holdCar = true;
    hud.toast(pick ? 'Picking the ignition…' : 'Hot-wiring…', 1.4);
    if (Math.random() < 0.35) {
      v.alarm = 18; game.audio?.alarm?.(0.9);
      hud.toast('A car alarm goes off!', 2);
      game.reportCrime?.('theft', v.pos.clone());
    }
  };

  return {
    // called before the car's physics: an empty tank means no throttle (a cough or two first)
    control(v, ctl, dt) {
      if (!v || v.isBoat || v.isAir) return ctl;
      const f = fuelOf(v);
      if (f <= 0) {
        sputter += dt;
        ctl.throttle = Math.sin(sputter * 9) > 0.7 && sputter < 2 ? ctl.throttle * 0.5 : 0; ctl.nitro = false;
      } else sputter = 0;
      // the burn: idling sips, flooring it gulps (a full tank is ~25 minutes of hard driving)
      v.fuel = Math.max(0, f - dt * (0.00012 + Math.abs(ctl.throttle || 0) * 0.0006 + Math.abs(v.speed || 0) * 0.000012) * (ctl.nitro ? 2.5 : 1));
      if (v.fuel < 0.12 && !lowWarned) { lowWarned = true; hud.toast('Fuel low — fill up at a Gulf Mart', 2.6); }
      if (v.fuel > 0.2) lowWarned = false;
      return ctl;
    },
    update(dt, a, free) {
      // car alarms flash and whoop until they give up
      for (const v of game.parked || []) if (v.alarm > 0) { v.alarm -= dt; v.night = Math.sin(v.alarm * 8) > 0 ? 1 : 0; v.lightsOn = v.alarm > 0; if (v.alarm <= 0) { v.night = 0; v.lightsOn = false; } }
      // hot-wiring
      if (wire) {
        wire.t -= dt;
        // (A2) your hands are under the dash: two wires twisted together (or a pick working the ignition)
        if (!wire.hands && S.mode === 'car') {
          wire.hands = true;
          S.carReach = (gp, car) => {
            const F = gp.frame(car.heading), T = performance.now() * 0.001;
            const col = F.chest.clone().addScaledVector(F.fw, 0.42).addScaledVector(F.up, -0.28);
            gp.reach(gp.R, col.clone().addScaledVector(F.right, 0.04 + Math.sin(T * 9) * 0.025).addScaledVector(F.up, Math.cos(T * 7) * 0.02), F, 'R');
            gp.reach(gp.L, col.clone().addScaledVector(F.right, -0.06 + Math.cos(T * 8) * 0.02), F, 'L');
          };
        }
        if (wire.t <= 0 || S.mode !== 'car') { if (wire.hands) S.carReach = null; if (S.mode === 'car') { wire.v.wired = true; hud.toast('The engine catches', 1.2); } S.holdCar = false; wire = null; }
      }
      // the pumps out front of every Gulf Mart (where the clerk faces)
      if (!pumps && game.shopSpots) pumps = marts().map((m) => ({ x: m.x + Math.sin(m.face || 0) * 11, z: m.z + Math.cos(m.face || 0) * 11 }));
      const v = S.mode === 'car' ? S.vehicle : null;
      gauge.style.display = v && !v.isBoat && !v.isAir ? '' : 'none';
      // the fuel can, on foot, by your car
      if (!v && S.mode === 'foot') {
        const car = game.lastVehicle?.(), canId = game.tools?.list?.find((t) => /fuel can/i.test(t.name))?.id;
        if (car && !car.isBoat && !car.isAir && fuelOf(car) < 0.6 && canId && career.p.tools?.[canId] && car.pos.distanceTo(player.pos) < 3.2) {
          if (free && a.enter) { a.enter = false; car.fuel = Math.min(1, car.fuel + 0.35); hud.toast('Emptied the fuel can into the tank', 1.8); return ''; }
          return 'F  pour the fuel can into the tank';
        }
      }
      if (!v || v.isBoat || v.isAir) { stopT = 0; fillT = 0; return ''; }
      // pull in at the pumps and stop: a second later the tank's full
      if (pumps && Math.abs(v.speed || 0) < 1.2 && fuelOf(v) < 0.97 && pumps.some((q) => Math.hypot(q.x - v.pos.x, q.z - v.pos.z) < 9)) {
        const cost = Math.max(2, Math.round((1 - v.fuel) * 62));
        if ((fillT += dt) > 1.1) { fillT = 0; if (career.spend(cost)) { v.fuel = 1; hud.toast(`Filled up · $${cost}`, 1.8); } else hud.toast(`Not enough cash for gas ($${cost})`, 1.8); }
        else return `Filling up… ($${cost})`;
      } else fillT = 0;
      gauge.firstChild.style.width = `${Math.round(fuelOf(v) * 100)}%`;
      gauge.firstChild.style.background = v.fuel < 0.15 ? '#e05a3a' : '#e8b04a';
      const sp = Math.abs(v.speed || 0), fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
      // skid marks: sliding sideways, locking up, or the handbrake, on a hard surface
      const lat = Math.abs(v.vel.x * rx + v.vel.y * rz);
      if (sp > 5 && (lat > 2.6 || (a.brake > 0.8 && sp > 11) || (a.handbrake && sp > 6))) {
        const w = (v.spec.width || 1.9) / 2 - 0.25, back = (v.spec.len || 4.5) * 0.32;
        for (const k of [0, 1]) {
          const s = k ? 1 : -1, x = v.pos.x - fx * back + rx * w * s, z = v.pos.z - fz * back + rz * w * s;
          const y = game.collision.surface(x, z, v.pos.y + 1);
          addMark(k, x, y, z, Math.atan2(v.vel.x, v.vel.y));
        }
        if (lat > 4 || a.handbrake) game.audio?.skid?.(Math.min(1, lat / 8));
      } else lastMark[0] = lastMark[1] = null;
      // the horn: whoever's in front gets out of the way
      if (a.horn) for (const p of peds.list) {
        if (p.mode === 'dead' || p.role === 'cop' || p.mode === 'flee') continue;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 14 && side < 2.5) { p.mode = 'flee'; p.threat = v.pos.clone(); p.timer = 1.4; if (Math.random() < 0.08) hud.toast(['"Watch it, buddy!"', '"Hey! I\'m walking here!"', '"Lord have mercy!"'][(Math.random() * 3) | 0], 1.6); }
      }
      // speeding: a patrol car that sees you well over the limit pulls you over
      if ((roadT -= dt) <= 0) { roadT = 0.6; const r = nearestRoad(game.graph, v.pos.x, v.pos.z); limit = r?.e?.kind === 'highway' ? LIMIT.highway : game.city && Math.abs(v.pos.x - 640) < 520 && Math.abs(v.pos.z - 1050) < 420 ? LIMIT.street : LIMIT.road; }
      if (!clocked && police.wanted === 0 && sp > limit + 6.7) {
        const cop = (police.patrols?.() || []).find((c) => c.pos.distanceTo(v.pos) < 55);
        if (cop) { clocked = { cop, over: Math.round((sp - limit) * 2.237), t: 12 }; cop.siren = true; police.crime('speeding'); police.radio?.(`Pull over! You were doing ${Math.round(sp * 2.237)} in a ${Math.round(limit * 2.237)}.`, 0); }
      }
      if (clocked) {
        clocked.t -= dt;
        if (sp < 1.2) stopT += dt; else stopT = 0; // (pulled over: braking at a standstill backs up a little)
        if (clocked.scene) { ticketScene(v, dt); }
        else if (stopT > 2.2 && police.wanted <= 1 && police.heat <= 1) startTicket(v);
        else if (clocked.t <= 0 || police.wanted === 0 || police.heat > 1) { if (clocked.cop) clocked.cop.siren = false; clocked = null; }
      }
      return '';
    },
    get ticketing() { return !!clocked?.scene; },
    get marks() { return marks.count; },
  };
}
