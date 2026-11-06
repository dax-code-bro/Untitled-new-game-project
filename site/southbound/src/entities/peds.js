// Pedestrians: walk the sidewalks of Port Calvera and Mill Creek, cross at
// corners, chat, panic and flee from gunfire, get hit, flinch, die and go limp (bodies are searched: systems/loot.js).
import * as THREE from 'three';
import { Human, locomotion } from './human.js';
import { CITY, TOWN } from '../world/layout.js';
import { mulberry32, wrapAngle, clamp } from '../util.js';

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const INSET = 1.7;

function cornerPos(G, i, j, c) {
  const half = (G.pitch - G.street) / 2 - INSET;
  const cx = G.x0 + i * G.pitch + G.pitch / 2, cz = G.z0 + j * G.pitch + G.pitch / 2;
  return [cx + CORNERS[c][0] * half, cz + CORNERS[c][1] * half];
}

export class Peds {
  constructor(lib, quality, scene, collision, settings) {
    this.lib = lib; this.scene = scene; this.collision = collision; this.settings = settings;
    this.max = { Phone: 18, Low: 24, Medium: 44, High: 68, Ultra: 96 }[quality.label] ?? 40;
    this.list = [];
    this.pickups = [];
    this.rnd = mulberry32(911);
    this.frame = 0;
    const cashGeo = new THREE.BoxGeometry(0.35, 0.08, 0.2);
    this.cashMat = new THREE.MeshStandardMaterial({ color: 0x3aa35a, emissive: 0x1a5a2a, emissiveIntensity: 0.6 });
    this.cashGeo = cashGeo;
  }

  spawn(focus, minR, maxR) {
    const rnd = this.rnd;
    for (let tries = 0; tries < 40; tries++) {
      const G = Math.hypot(focus.x - (TOWN.x0 + 144), focus.z - (TOWN.z0 + 108)) < 400 ? TOWN : CITY;
      const i = (rnd() * G.nx) | 0, j = (rnd() * G.nz) | 0, c = (rnd() * 4) | 0;
      const [x, z] = cornerPos(G, i, j, c);
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d < minR || d > maxR) continue;
      const id = this.lib.peopleIds[(rnd() * this.lib.peopleIds.length) | 0];
      const h = new Human(this.lib, id);
      const p = {
        h, G, i, j, corner: c, dir: rnd() < 0.5 ? 1 : -1, mode: 'walk', hp: 100,
        pos: new THREE.Vector3(x, G.height + 0.22, z), heading: 0, speed: 1.3 + rnd() * 0.5,
        target: null, timer: 0, threat: null, idleT: 10 + rnd() * 30, radius: 0.35, acc: 0,
      };
      this.nextTarget(p);
      p.h.root.position.copy(p.pos);
      this.scene.add(h.root);
      this.list.push(p);
      return p;
    }
    return null;
  }

  // A ped at an exact spot, running from `threat` (e.g. a carjacked driver)
  spawnAt(x, z, threat) {
    const id = this.lib.peopleIds[(this.rnd() * this.lib.peopleIds.length) | 0];
    const h = new Human(this.lib, id);
    let G = CITY, i = 0, j = 0;
    for (const g of [CITY, TOWN]) {
      const gi = Math.floor((x - g.x0) / g.pitch), gj = Math.floor((z - g.z0) / g.pitch);
      if (gi >= 0 && gj >= 0 && gi < g.nx && gj < g.nz) { G = g; i = gi; j = gj; }
    }
    const p = { h, G, i, j, corner: 0, dir: 1, mode: threat ? 'flee' : 'walk', hp: 100, pos: new THREE.Vector3(x, this.collision.surface(x, z, 300), z),
      heading: 0, speed: 1.4, target: cornerPos(G, i, j, 0), timer: 9, threat: threat ? threat.clone() : null, idleT: 20, radius: 0.35, acc: 0 };
    h.root.position.copy(p.pos);
    this.scene.add(h.root);
    this.list.push(p);
    return p;
  }

  nextTarget(p) {
    const r = this.rnd();
    const [sx, sz] = CORNERS[p.corner];
    p.crossing = false;
    if (r < 0.28) {
      // cross a street to the neighbouring block
      const viaX = this.rnd() < 0.5;
      const ni = p.i + (viaX ? sx : 0), nj = p.j + (viaX ? 0 : sz);
      if (ni >= 0 && nj >= 0 && ni < p.G.nx && nj < p.G.nz) {
        const ns = viaX ? [-sx, sz] : [sx, -sz];
        p.i = ni; p.j = nj; p.corner = CORNERS.findIndex((c) => c[0] === ns[0] && c[1] === ns[1]);
        p.crossing = true;
      }
    }
    if (!p.crossing) p.corner = (p.corner + p.dir + 4) % 4;
    p.target = cornerPos(p.G, p.i, p.j, p.corner);
  }

  // Everyone near `pos` runs away from it
  panic(pos, radius = 35) {
    for (const p of this.list) {
      if (p.mode === 'dead' || p.role === 'cop') continue;
      if (p.pos.distanceTo(pos) < radius) { p.mode = 'flee'; p.threat = pos.clone(); p.timer = 8 + this.rnd() * 6; }
    }
  }

  // info: { part, side, point, dir, pen } from a bullet, { vehicle } from a car, { blast } from an
  // explosion, { melee } from a fist or a blade
  damage(p, amount, from, info = null) {
    if (p.mode === 'dead') return false;
    p.hp -= amount;
    if (p.hp <= 0) {
      p.mode = 'dead'; p.timer = 120; p.speed = 0; // bodies stay a while (they can be searched: systems/loot.js)
      if (!this.goLimp(p, from, info)) p.h.play('Death01', 0.12, 1, true);
      this.onDeath?.(p, from, info);
      return true;
    }
    // a hit they survive: the part that was hit jerks away; a body shot can knock the wind out of them
    const part = info?.part || 'torso';
    p.h.flinch(part, info?.side || 'R', info?.melee ? 0.7 : 1);
    if (part === 'torso' && !info?.melee && this.rnd() < 0.5) p.h.play('Hit_Chest', 0.08, 1.2, true);
    if (p.role === 'cop') return false;
    p.mode = 'flee'; p.threat = from ? from.clone() : p.pos.clone(); p.timer = 10;
    return false;
  }

  // Physics takes the body (entities/ragdoll.js), pushed where it was struck.
  goLimp(p, from, info) {
    if (!this.settings || this.settings.ragdolls === false) return false;
    if (!p.h.goLimp((x, z, y) => this.collision.surface(x, z, y))) return false;
    const r = p.h.ragdoll, V = THREE.Vector3;
    if (info?.vehicle) {
      // struck by a car: the legs are taken out, the body goes up and over or under, carried along
      const v = info.vehicle, vx = v.vel?.x ?? Math.sin(v.heading) * v.speed, vz = v.vel?.y ?? Math.cos(v.heading) * v.speed, sp = Math.hypot(vx, vz);
      r.push(new V(vx * 0.75, 1.5 + sp * 0.18, vz * 0.75), p.pos.clone().setY(p.pos.y + 0.45), new V(vx * 0.5, 0.5, vz * 0.5), 1.5 + sp * 0.1);
    } else if (info?.blast) {
      const d = new V().subVectors(p.pos, info.blast); const k = Math.max(0, 1 - d.length() / 12);
      d.y = 0; d.normalize();
      r.push(new V(d.x * (3 + 7 * k), 2.5 + 6 * k, d.z * (3 + 7 * k)), null, null, 4 * k);
    } else if (info?.point && info?.dir) {
      // shot: the whole body goes a little with the round, the part that was hit a lot
      const d = info.dir, f = 1.2 + (info.pen || 1) * 0.35, hp = info.part === 'head' ? 4.5 : info.part === 'leg' ? 3.5 : 2.8;
      r.push(new V(d.x * f, info.part === 'leg' ? 0.2 : 0.6, d.z * f), info.point, new V(d.x * hp, info.part === 'head' ? 1.2 : 0, d.z * hp), 0.6);
    } else {
      const d = from ? new V().subVectors(p.pos, from).setY(0).normalize() : new V(Math.sin(p.heading), 0, Math.cos(p.heading)).negate();
      r.push(new V(d.x * 1.6, 0.8, d.z * 1.6), null, null, 0.8);
    }
    return true;
  }

  dropCash(pos, amount) {
    const m = new THREE.Mesh(this.cashGeo, this.cashMat);
    m.position.copy(pos).add(new THREE.Vector3(0.4, 0.15, 0.3));
    this.scene.add(m);
    this.pickups.push({ mesh: m, amount, t: 60 });
  }

  // Closest living ped hit by a ray (for gunfire). Returns {p, t, head}
  raycast(origin, dir, maxT) {
    let best = null;
    const oc = new THREE.Vector3();
    for (const p of this.list) {
      if (p.mode === 'dead') continue;
      // capsule approximated as a vertical segment (feet..head) with radius
      oc.copy(p.pos).sub(origin);
      const t = clamp(oc.dot(dir), 0, maxT);
      const cx = origin.x + dir.x * t, cy = origin.y + dir.y * t, cz = origin.z + dir.z * t;
      const dy = cy - p.pos.y;
      if (dy < 0 || dy > 1.85) continue;
      const d = Math.hypot(cx - p.pos.x, cz - p.pos.z);
      if (d < 0.38 && (!best || t < best.t)) best = { p, t, head: dy > 1.55 };
    }
    return best;
  }

  update(dt, focus, player, cars, onCash) {
    this.frame++;
    if (this.list.filter((p) => p.mode !== 'dead' && p.role !== 'cop').length < this.max) this.spawn(focus, this.list.length < this.max * 0.5 ? 6 : 45, 115);
    for (let k = this.list.length - 1; k >= 0; k--) {
      const p = this.list[k];
      const d = Math.hypot(p.pos.x - focus.x, p.pos.z - focus.z);
      if (d > (p.role === 'hunter' ? 450 : 150) || (p.mode === 'dead' && (p.timer -= dt) <= 0)) {
        this.scene.remove(p.h.root); p.h.dispose(); this.list.splice(k, 1); continue;
      }
      this.think(p, dt, player);
      // cars: a person is a body in a car's way. Walking into one, they step round it; hit slowly,
      // they're knocked aside and hurt; hit fast, they're thrown (and above ~40 km/h, killed)
      if (p.mode !== 'dead' && p.mode !== 'riding') for (const v of cars) {
        if (!v || !v.spec) continue;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
        if (dx * dx + dz * dz > 49 || Math.abs(p.pos.y - v.pos.y) > 2) continue;
        const c = Math.cos(v.heading), sn = Math.sin(v.heading);
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // into the car's frame (+z forward)
        const hw = (v.spec.width || 1.9) / 2 + 0.3, hl = (v.spec.len || 4.5) / 2 + 0.3;
        if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
        const sp = Math.abs(v.speed || 0);
        if (sp > 2.5) {
          const fast = sp > 9;
          const killed = this.damage(p, fast ? sp * sp * 1.4 : sp * 7, v.pos, fast ? { vehicle: v } : { part: 'leg', side: lx > 0 ? 'R' : 'L' });
          if (!killed && !fast) { p.pos.x += Math.sign(dx || 1) * 1.1; p.pos.z += Math.sign(dz || 1) * 1.1; }
          if (fast && !killed) { p.hp = 0; p.mode = 'dead'; p.timer = 120; this.goLimp(p, v.pos, { vehicle: v }); this.onDeath?.(p, v.pos, { vehicle: v }); }
          if (v.vel) v.vel.multiplyScalar(fast ? 0.9 : 0.96); // the car feels it
          v.impact = Math.max(v.impact || 0, fast ? 3 : 1);
          if (v.onHitPed) v.onHitPed(p, killed || fast);
          break;
        }
        // standing still or creeping: step out of the car's footprint the short way
        const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
        if (px < pz) { const k = Math.sign(lx || 1) * px; p.pos.x += c * k; p.pos.z -= sn * k; }
        else { const k = Math.sign(lz || 1) * pz; p.pos.x += sn * k; p.pos.z += c * k; }
      }
      // animation LOD: full rate nearby, reduced far away
      p.h.root.visible = d < (p.role === 'hunter' ? 450 : 150) && p.mode !== 'riding';
      p.acc += dt;
      const every = d < 50 ? 1 : d < 100 ? 3 : 6;
      if (p.h.ragdoll) { p.h.update(dt); p.acc = 0; p.pos.copy(p.h.root.position); continue; } // physics every frame; the body moves the person
      if (p.h.root.visible && this.frame % every === 0) { p.h.update(p.acc); p.acc = 0; }
      p.h.root.position.copy(p.pos);
      p.h.root.rotation.y = p.heading;
    }
    // cash pickups
    for (let k = this.pickups.length - 1; k >= 0; k--) {
      const c = this.pickups[k];
      c.mesh.rotation.y += dt * 3;
      if ((c.t -= dt) <= 0) { this.scene.remove(c.mesh); this.pickups.splice(k, 1); continue; }
      if (player && c.mesh.position.distanceTo(player) < 1.6) { onCash(c.amount); this.scene.remove(c.mesh); this.pickups.splice(k, 1); }
    }
  }

  think(p, dt, player) {
    if (p.mode === 'dead') return;
    if (p.scripted) return; // in a cutscene
    if (p.role === 'cop') { if (this.copThink) this.copThink(p, dt); return; }
    if (p.role === 'foe') { if (this.foeThink) this.foeThink(p, dt); return; }
    if (p.role === 'hunter') { if (this.hunterThink) this.hunterThink(p, dt); return; }
    if (p.role === 'brawler') { if (this.brawlThink) this.brawlThink(p, dt); return; }
    if (p.role === 'walker') { if (this.walkerThink) this.walkerThink(p, dt); return; }
    let want = 0;
    if (p.mode === 'flee') {
      p.timer -= dt;
      const ax = p.pos.x - p.threat.x, az = p.pos.z - p.threat.z;
      p.heading += wrapAngle(Math.atan2(ax, az) - p.heading) * Math.min(1, dt * 6);
      want = 6.2;
      if (p.timer <= 0) { p.mode = 'return'; p.target = cornerPos(p.G, p.i, p.j, p.corner); }
    } else if (p.mode === 'idle') {
      p.timer -= dt;
      p.h.play('Idle_Talking_Loop', 0.3);
      if (p.timer <= 0) { p.mode = 'walk'; p.idleT = 15 + this.rnd() * 40; }
    } else {
      const tx = p.target[0] - p.pos.x, tz = p.target[1] - p.pos.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.6) {
        if (p.mode === 'return') p.mode = 'walk';
        this.nextTarget(p);
      } else p.heading += wrapAngle(Math.atan2(tx, tz) - p.heading) * Math.min(1, dt * 5);
      want = p.mode === 'return' ? 2.8 : p.speed;
      if (p.mode === 'walk' && !p.crossing && (p.idleT -= dt) <= 0) { p.mode = 'idle'; p.timer = 3 + this.rnd() * 6; want = 0; }
    }
    if (want > 0) {
      p.pos.x += Math.sin(p.heading) * want * dt;
      p.pos.z += Math.cos(p.heading) * want * dt;
      if (p.mode === 'flee') {
        const r = this.collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8);
        p.pos.x = r.x; p.pos.z = r.z;
        if (r.hit) p.heading += 0.9 * dt * 4;
      }
      p.pos.y = this.collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      const [clip, sp] = locomotion(want);
      p.h.play(clip, 0.25, sp);
    }
    // keep out of the player's way
    if (player) {
      const dx = p.pos.x - player.x, dz = p.pos.z - player.z, d = Math.hypot(dx, dz);
      if (d < 0.7 && d > 1e-3) { p.pos.x += (dx / d) * (0.7 - d); p.pos.z += (dz / d) * (0.7 - d); }
    }
  }
}
