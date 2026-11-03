// People walking along the country roads. Pull up next to one, stop, and
// hold F / ◎ to offer a ride: they climb in and ask for a town; drop them
// there for a tip. On foot you can greet or antagonize them like anyone else.
import * as THREE from 'three';
import { Human, locomotion } from '../entities/human.js';
import { CITY, TOWN } from '../world/layout.js';
import { wrapAngle } from '../util.js';

const inGrid = (x, z) => [CITY, TOWN].some((G) => x > G.x0 - 30 && x < G.x0 + G.nx * G.pitch + 30 && z > G.z0 - 30 && z < G.z0 + G.nz * G.pitch + 30);
const LINES = ['Thanks, friend. Mill Creek, if you\'re going that way.', 'Appreciate it. Can you drop me in the city?', 'Bless you. My truck broke down a mile back.', 'You\'re a lifesaver. Town\'s fine.'];
const THANKS = ['Thanks for the ride. Here, for the gas.', 'This is me. Take this, I insist.', 'Much obliged, stranger.'];

export function installRoadside(game) {
  const { peds, graph, lib, scene, collision, player, hud, S } = game;
  const MAX = { Phone: 4, Low: 5, Medium: 8, High: 11, Ultra: 14 }[game.q.label] ?? 7;
  const rural = graph.edges.filter((e) => e.len > 80 && !inGrid(e.pts[0][0], e.pts[0][1]) && !inGrid(e.pts[e.pts.length - 1][0], e.pts[e.pts.length - 1][1]));
  const walkers = [];
  const P = {};
  const sample = (e, s, out) => game.traffic.sampleEdge(e, s, out);
  let spawnT = 0, ride = null;

  function spawn() {
    const f = player.pos;
    for (let tries = 0; tries < 20; tries++) {
      const e = rural[(Math.random() * rural.length) | 0];
      if (!e) return;
      const s = Math.random() * e.len;
      sample(e, s, P);
      const d = Math.hypot(P.x - f.x, P.z - f.z);
      if (d < 55 || d > 135 || inGrid(P.x, P.z)) continue;
      const id = lib.peopleIds[(Math.random() * lib.peopleIds.length) | 0];
      const h = new Human(lib, id);
      const side = Math.random() < 0.5 ? 1 : -1, off = e.width / 2 + 1.4;
      const p = { h, role: 'walker', mode: 'walk', hp: 100, e, s, dir: Math.random() < 0.5 ? 1 : -1, side, off,
        pos: new THREE.Vector3(P.x - P.tz * off * side, P.y, P.z + P.tx * off * side), heading: 0, speed: 1.2 + Math.random() * 0.4, radius: 0.35, acc: 0, timer: 0 };
      scene.add(h.root);
      peds.list.push(p); walkers.push(p);
      return;
    }
  }

  // walk along the shoulder; turn round at the end of the road
  peds.walkerThink = (p, dt) => {
    if (p.mode === 'flee') { p.role = undefined; return; }
    if (p.mode === 'riding') return;
    if (p.mode === 'idle') { p.timer -= dt; if (p.timer <= 0) p.mode = 'walk'; p.h.play('Idle_Loop', 0.3); }
    else if (p.mode === 'board') {
      // walk to the car's passenger door, then get in
      const v = ride && ride.v;
      if (!v) { p.mode = 'walk'; return; }
      const door = new THREE.Vector3(v.pos.x + Math.cos(v.heading) * (v.spec.width / 2 + 0.6), v.pos.y, v.pos.z - Math.sin(v.heading) * (v.spec.width / 2 + 0.6));
      const dx = door.x - p.pos.x, dz = door.z - p.pos.z, d = Math.hypot(dx, dz);
      p.heading += wrapAngle(Math.atan2(dx, dz) - p.heading) * Math.min(1, dt * 6);
      if (d > 0.5) { p.pos.x += (dx / d) * 2.6 * dt; p.pos.z += (dz / d) * 2.6 * dt; p.h.play('Jog_Fwd_Loop', 0.2, 0.75); }
      else { p.mode = 'riding'; p.h.root.visible = false; hud.toast('Passenger aboard', 1.5); game.law && game.law.say?.('Passenger', ride.line, 3.5); }
      p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
    } else {
      p.s += p.dir * p.speed * dt;
      if (p.s < 2 || p.s > p.e.len - 2) { p.dir *= -1; p.s = Math.max(2, Math.min(p.e.len - 2, p.s)); }
      sample(p.e, p.s, P);
      const tx = P.x - P.tz * p.off * p.side, tz = P.z + P.tx * p.off * p.side;
      p.heading += wrapAngle(Math.atan2(tx - p.pos.x, tz - p.pos.z) - p.heading) * Math.min(1, dt * 4);
      p.pos.set(tx, collision.surface(tx, tz, P.y + 1), tz);
      const [clip, sp] = locomotion(p.speed); p.h.play(clip, 0.3, sp);
      if (Math.random() < dt * 0.02) { p.mode = 'idle'; p.timer = 3 + Math.random() * 4; }
    }
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading;
  };

  return {
    walkers: () => walkers,
    get passenger() { return ride ? ride.p : null; },
    update(dt, a) {
      for (let i = walkers.length - 1; i >= 0; i--) if (!peds.list.includes(walkers[i]) || walkers[i].mode === 'dead') walkers.splice(i, 1);
      if ((spawnT -= dt) <= 0) { spawnT = 1.5; if (walkers.filter((w) => w.role === 'walker').length < MAX && !inGrid(player.pos.x, player.pos.z) && !S.indoors) spawn(); }
      // offering rides
      if (ride) {
        const p = ride.p, v = S.vehicle;
        if (p.mode === 'dead' || !peds.list.includes(p)) { ride = null; return ''; }
        if (p.mode === 'board' && (!v || v !== ride.v)) { p.mode = 'walk'; ride = null; return ''; }
        if (p.mode === 'riding') {
          if (!v) { // you got out: they get out too
            p.mode = 'walk'; p.h.root.visible = true; p.pos.copy(player.pos).add(new THREE.Vector3(1.2, 0, 0)); p.role = undefined; ride = null;
            hud.toast('Your passenger got out', 2); return '';
          }
          p.pos.copy(v.pos);
          const d = Math.hypot(ride.to.x - v.pos.x, ride.to.z - v.pos.z);
          if (d < 30 && Math.abs(v.speed) < 2) {
            const tip = 40 + Math.round(Math.random() * 110);
            game.S.money += tip;
            game.law && game.law.say?.('Passenger', THANKS[(Math.random() * THANKS.length) | 0], 3);
            hud.toast(`+$${tip} for the ride`, 2.5);
            p.mode = 'walk'; p.role = undefined; p.h.root.visible = true;
            p.pos.set(v.pos.x + Math.cos(v.heading) * (v.spec.width / 2 + 0.9), v.pos.y, v.pos.z - Math.sin(v.heading) * (v.spec.width / 2 + 0.9));
            p.pos.y = collision.surface(p.pos.x, p.pos.z, p.pos.y + 1);
            game.career.p.stats.rides = (game.career.p.stats.rides || 0) + 1;
            ride = null;
            return '';
          }
          return '';
        }
        return '';
      }
      return this.canOffer() ? (game.settings.isTouch ? 'Tap ◎ to offer a ride' : 'Press F to offer a ride') : '';
    },
    // a walker close to your stopped car?
    canOffer() {
      const v = S.vehicle;
      if (ride || !v || v.isBoat || v.isAir || Math.abs(v.speed) > 2) return null;
      let best = null, bd = 9;
      for (const w of walkers) { if (w.role !== 'walker' || w.mode === 'dead') continue; const d = w.pos.distanceTo(v.pos); if (d < bd) { bd = d; best = w; } }
      return best;
    },
    offer() {
      const v = S.vehicle, best = this.canOffer();
      if (!best) return false;
      // destination: the nearer of the city and Mill Creek
      const spots = [{ x: CITY.x0 - 30, z: CITY.z0 + 2 * CITY.pitch, name: 'Port Calvera' }, { x: TOWN.x0 - 20, z: TOWN.z0 + TOWN.pitch, name: 'Mill Creek' }];
      spots.sort((p1, p2) => Math.hypot(p1.x - v.pos.x, p1.z - v.pos.z) - Math.hypot(p2.x - v.pos.x, p2.z - v.pos.z));
      const to = spots[0];
      ride = { p: best, v, to, line: LINES[(Math.random() * LINES.length) | 0] };
      best.mode = 'board';
      game.setWaypoint?.(to.x, to.z, `Drop-off: ${to.name}`);
      return true;
    },
  };
}
