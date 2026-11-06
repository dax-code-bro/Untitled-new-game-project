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
        if (wire.t <= 0 || S.mode !== 'car') { if (S.mode === 'car') { wire.v.wired = true; hud.toast('The engine catches', 1.2); } S.holdCar = false; wire = null; }
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
        if (stopT > 2.2 && police.wanted <= 1 && police.heat <= 1) {
          const fine = 50 + clocked.over * 5;
          career.spend?.(Math.min(fine, S.money)) || (S.money = Math.max(0, S.money - fine));
          hud.toast(`Speeding ticket: ${clocked.over} over the limit · $${fine}`, 3);
          police.clear?.(); clocked.cop.siren = false; clocked = null; stopT = 0;
        } else if (clocked.t <= 0 || police.wanted === 0 || police.heat > 1) { if (clocked.cop) clocked.cop.siren = false; clocked = null; }
      }
      return '';
    },
    get marks() { return marks.count; },
  };
}
