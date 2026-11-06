// Wanted level, pursuing police cruisers and officers on foot.
import * as THREE from 'three';
import { shadePerson } from './bodyshade.js';
import { Vehicle } from './vehicle.js';
import { Human, locomotion } from './human.js';
import { clamp, wrapAngle, mulberry32 } from '../util.js';
import { WEAPONS, buildWeaponModel } from './arsenal.js';
import { GunPose } from './gunpose.js';
import { vehiclesOverlap } from '../world/collision.js';
import { loadOpen, loaded, instance, Q } from '../assets/open.js';

const CARS_PER_STAR = [0, 1, 2, 3, 4, 6];
const TANK = Q('tank_pack', 'Tank');
loadOpen(TANK);
// How prepared the police are, by the worst crime in this chase:
// 1 disturbance/assault: guns holstered, they come to arrest you
// 2 theft/shots fired/brandishing: guns drawn, they shoot only if you're armed or attack
// 3 killing: shoot on sight   4 cop killer: SWAT with rifles   5 rampage: tanks
const HEAT = { poaching: 1, speeding: 1, disturbance: 1, assault: 1, resist: 1, carjack: 2, shots: 2, brandish: 2, robbery: 2, kill: 3, copShot: 3, copKill: 4, rampage: 5 };

// Armoured vehicle for the top wanted level (Quaternius Tank pack, CC0)
class Tank {
  constructor(scene) {
    this.isTank = true;
    this.group = new THREE.Group();
    const g = loaded(TANK);
    if (g) { const m = instance(g, 7.2); m.rotation.y = Math.PI / 2; this.group.add(m); const s0 = m.userData.size; this.size = new THREE.Vector3(s0.z, s0.y, s0.x); } // cannon is modelled along -X: turn it to +Z
    scene.add(this.group);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector2(); this.heading = 0; this.speed = 0;
    this.health = 2600; this.maxHealth = 2600; this.impact = 0; this.fireT = 4;
    const sz = this.size || new THREE.Vector3(3.4, 2.6, 7.2);
    this.spec = { name: 'Tank', len: Math.max(sz.x, sz.z), width: Math.min(sz.x, sz.z), height: sz.y };
    this.type = 'tank';
  }
  physics(dt, ctl, hm, collision) {
    if (this.health <= 0) { this.speed = 0; return; }
    const t = this.target;
    if (t) {
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      this.heading += clamp(wrapAngle(Math.atan2(dx, dz) - this.heading), -dt * 0.6, dt * 0.6);
      this.speed = d > 40 ? 6 : 0;
      this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
      const r = collision.resolveOBB(this.pos.x, this.pos.z, this.spec.width / 2, this.spec.len / 2, this.heading, this.pos.y, 3);
      this.pos.x = r.x; this.pos.z = r.z;
    }
    this.pos.y = collision.surface(this.pos.x, this.pos.z, this.pos.y + 1);
  }
  sync() { this.group.position.copy(this.pos); this.group.rotation.y = this.heading; }
  dispose() { this.group.parent?.remove(this.group); }
}

export class Police {
  constructor(lib, scene, hm, collision, graph, peds, audio) {
    this.lib = lib; this.scene = scene; this.hm = hm; this.collision = collision; this.graph = graph;
    this.peds = peds; this.audio = audio;
    this.wanted = 0; this.kills = 0; this.heat = 0; this.maxWanted = 0; this.copKills = 0;
    this.onEscaped = null; // (maxWanted, kills) when a chase is lost
    this.onShell = null; // (point) tank shell lands
    this.cool = 0;          // seconds since police last had eyes on the player
    this.cars = [];
    this.rnd = mulberry32(1911);
    this.bustT = 0;
    this.onBusted = null; this.onPlayerHit = null;
    peds.copThink = (p, dt) => this.copThink(p, dt);
  }

  get lost() { return this.wanted > 0 && this.cool > 4; }

  crime(kind) {
    const before = this.wanted;
    this.heat = Math.max(this.heat, HEAT[kind] || 1);
    if (kind === 'disturbance' || kind === 'resist' || kind === 'brandish') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'copKill' && ++this.copKills >= 3) this.heat = 5;
    if (kind === 'copKill') this.radio('Officer down! Officer down! All units, respond!', 0);
    else if (kind === 'copShot') this.radio('Officer hit! Taking fire!', 1);
    else if (kind === 'shots' && before === 0) this.radio('Shots fired, shots fired!', 2);
    else if (kind === 'robbery' && before === 0) this.radio('All units: armed robbery in progress.', 2);
    if (kind === 'shots') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'weapon') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'theft' || kind === 'breakin' || kind === 'trespass') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'assault') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'speeding') this.wanted = Math.max(this.wanted, 1); // pulled over (systems/driving.js)
    if (kind === 'poaching') this.wanted = Math.max(this.wanted, 1); // no licence, or a protected animal (systems/wilds.js)
    if (kind === 'robbery') this.wanted = Math.max(this.wanted, 2); // armed robbery of a store
    if (kind === 'kill') { this.kills++; this.wanted = Math.max(this.wanted, 1 + Math.floor(this.kills / 3)); }
    if (kind === 'copShot') this.wanted = Math.max(this.wanted, 2);
    if (kind === 'copKill') this.wanted = Math.min(5, Math.max(this.wanted + 1, 3));
    if (kind === 'carjack') this.wanted = Math.max(this.wanted, this.nearPolice(40) ? 1 : 0);
    if (this.kills >= 8) this.heat = 5;
    if (this.heat >= 4) this.wanted = Math.max(this.wanted, this.heat);
    this.wanted = Math.min(5, this.wanted);
    this.maxWanted = Math.max(this.maxWanted, this.wanted);
    if (this.wanted > before) this.cool = 0;
    if (this.wanted > 0 && this.player && (!this.sight || !this.lastSeen)) this.lastSeen = (this.lastSeen || new THREE.Vector3()).copy(this.player.pos); // where it was reported
  }
  // officers open fire: serious crime, or you have a gun out in front of them
  lethal(p) { return this.heat >= 3 || (this.player && this.player.drawn) || p.provoked; }
  // radio chatter and shouted orders (rate-limited so it reads like a radio, not a spam of lines)
  radio(line, wait = 5) { const now = performance.now(); if (now - (this.radioAt || 0) < wait * 1000) return; this.radioAt = now; this.onShout?.(line); }
  // What the police actually know. They see you (line of sight, out to ~75 m; a cruiser ~90 m), hear
  // you up close or when you fire, or they work from where you were last seen.
  perceive(dt) {
    if ((this.perT = (this.perT || 0) - dt) > 0) return;
    this.perT = 0.25;
    const pl = this.player, pp = pl.pos, was = this.sight;
    const sees = (x, y, z, r) => { const d = Math.hypot(pp.x - x, pp.z - z); return d < 11 || (d < r && this.collision.raycast(x, y + 1.5, z, pp.x, pp.y + 1.3, pp.z) > 0.97); };
    let s = false;
    for (const p of this.peds.list) if (p.role === 'cop' && p.mode !== 'dead' && sees(p.pos.x, p.pos.y, p.pos.z, 75)) { s = true; break; }
    if (!s) for (const c of this.cars) if (!c.tank && sees(c.v.pos.x, c.v.pos.y, c.v.pos.z, 90)) { s = true; break; }
    if (!s && pl.fired && this.nearPolice(140)) s = true; // gunshots give you away
    if (!s && this.heliSees) s = true; // the helicopter has you (systems/policeplus.js)
    this.sight = s;
    if (s) { this.hadSight = true; this.lastSeen = (this.lastSeen || new THREE.Vector3()).copy(pp); this.lostT = 0; if (was === false && this.wanted > 0 && this.hadLost) { this.hadLost = false; this.radio(pl.inCar ? 'I\'ve got him — he\'s in a vehicle!' : 'Eyes on the suspect!'); } }
    else { this.lostT = (this.lostT || 0) + 0.25; if (this.wanted > 0 && this.lostT > 3 && !this.hadLost && this.hadSight) { this.hadLost = true; this.radio('We lost visual. Search the area — last seen right here.'); } }
  }
  target() { return this.sight || !this.lastSeen ? this.player.pos : this.lastSeen; }

  clear() {
    // (the handlers set at startup, onEscaped and onShell, stay: clearing them here broke escapes and
    // tank shells for the rest of the game after the first arrest)
    this.wanted = 0; this.kills = 0; this.heat = 0; this.maxWanted = 0; this.copKills = 0; this.cool = 0;
    this.sight = false; this.lastSeen = null; this.hadSight = false;
    for (const c of this.cars) { this.scene.remove(c.v.group); c.v.dispose(); for (const o of c.officers) o.mode = 'gone'; }
    this.cars = [];
    for (const p of this.peds.list) if (p.role === 'cop') { p.mode = 'dead'; p.timer = 0; }
  }

  nearPolice(r) {
    if (!this.player) return false;
    for (const c of this.cars) if (c.v.pos.distanceTo(this.player.pos) < r) return true;
    for (const v of this.patrols?.() || []) if (v.pos.distanceTo(this.player.pos) < r) return true;
    return this.peds.list.some((p) => p.role === 'cop' && p.mode !== 'dead' && p.pos.distanceTo(this.player.pos) < r);
  }

  spawnCar(focus) {
    // pick a road point 150-260 m away
    const edges = this.graph.edges;
    for (let tries = 0; tries < 30; tries++) {
      const e = edges[(this.rnd() * edges.length) | 0];
      const pt = e.pts[(this.rnd() * e.pts.length) | 0];
      const d = Math.hypot(pt[0] - focus.x, pt[1] - focus.z);
      if (d < 150 || d > 260) continue;
      const tank = this.heat >= 5 && this.cars.filter((c) => c.tank).length < 2 && loaded(TANK);
      const swat = this.heat >= 4 && !tank;
      const v = tank ? new Tank(this.scene) : new Vehicle(this.lib, swat ? 'police-suv' : 'police');
      v.pos.set(pt[0], this.collision.surface(pt[0], pt[1], 200) + 0.05, pt[1]);
      v.heading = Math.atan2(focus.x - pt[0], focus.z - pt[1]);
      v.siren = !tank;
      if (!tank) this.scene.add(v.group);
      const c = { v, stuck: 0, reverse: 0, officers: [], deployed: !!tank, swat, tank: !!tank };
      this.cars.push(c);
      return c;
    }
    return null;
  }

  // AI for officers (they live in the pedestrian list with role 'cop')
  copThink(p, dt) {
    if (p.mode === 'dead') { if (p.gun) p.gun.visible = false; return; }
    const pl = this.player;
    if (!pl || this.wanted === 0) { p.h.play('Idle_Loop', 0.3); return; }
    const lethal = this.lethal(p);
    this.armCop(p, lethal || this.heat >= 2);
    // can't see you: go to where you were last seen, then search round it, gun ready
    if (!this.sight && this.lastSeen) {
      const ls = this.lastSeen;
      if (!p.search || (p.searchT = (p.searchT || 0) - dt) <= 0 || Math.hypot(p.search.x - p.pos.x, p.search.z - p.pos.z) < 1.5) {
        const near = Math.hypot(ls.x - p.pos.x, ls.z - p.pos.z) > 6;
        const a = this.rnd() * Math.PI * 2, r = near ? 0 : 6 + this.rnd() * (8 + (this.lostT || 0));
        p.search = { x: ls.x + Math.cos(a) * r, z: ls.z + Math.sin(a) * r }; p.searchT = near ? 2 : 4 + this.rnd() * 3;
      }
      const sx = p.search.x - p.pos.x, sz = p.search.z - p.pos.z, sd = Math.hypot(sx, sz);
      p.heading += wrapAngle(Math.atan2(sx, sz) - p.heading) * Math.min(1, dt * 4);
      if (sd > 1) this.walkCop(p, dt, sd > 15 ? 4.2 : 2.2); else if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.2);
      p.react = 0.5 + this.rnd() * 0.5; // a beat before they fire when they find you
      this.poseGun(p, false);
      return;
    }
    const tx = pl.pos.x - p.pos.x, tz = pl.pos.z - p.pos.z, d = Math.hypot(tx, tz);
    p.heading += wrapAngle(Math.atan2(tx, tz) - p.heading) * Math.min(1, dt * 6);
    // a gun out but nothing fired yet: an order first, and a few seconds to obey it
    if (lethal && this.heat < 3 && !p.provoked) {
      if (pl.drawn && !pl.inCar) {
        if (p.warnT === undefined && d < 30) { p.warnT = 3.2; this.radio(this.rnd() < 0.5 ? 'Drop the weapon! Drop it now!' : 'Gun! Put it on the ground — NOW!', 2); }
        if (p.warnT !== undefined && (p.warnT -= dt) > 0) { if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15); this.poseGun(p, true); return; }
      } else p.warnT = undefined;
    }
    // in a gunfight: one officer of each car behind it, the other working round the side
    if (lethal && !pl.inCar && p.car && d < 45) {
      const v = p.car.v, cx = v.pos.x - pl.pos.x, cz = v.pos.z - pl.pos.z, cd = Math.hypot(cx, cz) || 1;
      let gx, gz;
      if (p.side < 0 && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 14) { gx = v.pos.x + (cx / cd) * (v.spec.width / 2 + 1); gz = v.pos.z + (cz / cd) * (v.spec.width / 2 + 1); }
      else { const a = Math.atan2(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) + 0.5 * dt * p.side * 0.6, r = Math.min(Math.max(d, 11), 17); gx = pl.pos.x + Math.sin(a) * r; gz = pl.pos.z + Math.cos(a) * r; }
      const mx = gx - p.pos.x, mz = gz - p.pos.z, md = Math.hypot(mx, mz);
      if (md > 0.8) { const hd = p.heading; p.heading = Math.atan2(mx, mz); this.walkCop(p, dt, md > 6 ? 4.5 : 2.4); p.heading = hd + wrapAngle(Math.atan2(tx, tz) - hd); }
    }
    if ((p.react = (p.react || 0) - dt) > 0) { if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15); this.poseGun(p, true); return; }
    const holding = lethal && !pl.inCar && p.car && d < 45; // in cover or flanking: they shoot from there
    if (!lethal && !pl.inCar) {
      // not shooting: walk up to make the arrest, gun in hand only for felonies
      if (d > 1.7) {
        const sp = d > 20 ? 5.5 : d > 6 ? 3.2 : 1.5;
        p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
        const r = this.collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8);
        p.pos.x = r.x; p.pos.z = r.z;
        p.pos.y = this.collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
        const [clip, s] = locomotion(sp); p.h.play(clip, 0.2, s);
      } else if (p.h.locked <= 0) p.h.play(this.heat >= 2 ? 'Pistol_Aim_Neutral' : 'Idle_Talking_Loop', 0.2);
      if (d < 9 && !p.warned) { p.warned = true; this.onShout?.(this.heat >= 2 ? 'Police! Hands where I can see them!' : 'Police. Stay right where you are.'); }
      this.poseGun(p, lethal);
      return;
    }
    if (!holding && d > (pl.inCar ? 14 : 9)) {
      const sp = d > 25 ? 6.5 : 4;
      p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
      const r = this.collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8);
      p.pos.x = r.x; p.pos.z = r.z;
      p.pos.y = this.collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
      const [clip, s] = locomotion(sp); p.h.play(clip, 0.2, s);
      p.gunT = 0.6;
    } else {
      // aim and shoot
      p.gunT = (p.gunT ?? 1) - dt;
      if (p.gunT <= 0 && !p.disarmed) {
        p.gunT = 0.9 + this.rnd() * 0.8;
        p.h.play('Pistol_Shoot', 0.05, 1.4, true);
        this.audio?.gunshot(0.5);
        const chance = clamp(0.65 - d / 45, 0.1, 0.65) * (pl.inCar ? 0.6 : 1) * (pl.speed > 4 ? 0.6 : 1);
        if (this.rnd() < chance && this.onPlayerHit) this.onPlayerHit(6 + this.rnd() * 7, p.pos, p.swat ? 3 : 2);
      } else if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15);
    }
    this.poseGun(p, true);
  }

  // a cruiser is solid against every other car: traffic, parked cars, the other cruisers, yours
  // (exact footprints). A traffic car it hits stops (systems: traffic stun).
  bump(v) {
    for (const o of this.obstacles?.() || []) {
      if (!o || o === v || o.isBoat || o.isAir || Math.abs(o.pos.x - v.pos.x) > 12 || Math.abs(o.pos.z - v.pos.z) > 12) continue;
      const m = vehiclesOverlap(v, o);
      if (!m) continue;
      // a cruiser stood still isn't shoved down the road by traffic: the traffic stops instead
      if (Math.abs(v.speed || 0) < 1.5 && o !== this.player?.vehicle) { this.onCarBump?.(o, 0); continue; }
      v.pos.x += m.nx * m.d; v.pos.z += m.nz * m.d;
      const vn = v.vel.x * m.nx + v.vel.y * m.nz;
      if (vn < 0) { v.vel.x -= m.nx * vn * 1.1; v.vel.y -= m.nz * vn * 1.1; v.vel.multiplyScalar(0.85); }
      this.onCarBump?.(o, -vn);
    }
  }
  // the shortest way by road (Dijkstra over the junctions), as a list of points to drive through
  route(from, to) {
    const g = this.graph; if (!g?.nodes) return null;
    const nodes = g.nodes instanceof Map ? [...g.nodes.values()] : g.nodes;
    if (!g._len) { g._len = g.edges.map((e) => { let L = 0; for (let i = 1; i < e.pts.length; i++) L += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); return L; }); g._byId = new Map(nodes.map((n) => [n.id, n])); }
    const nearest = (x, z) => { let b = null, bd = 1e18; for (const n of nodes) { const dd = (n.x - x) ** 2 + (n.z - z) ** 2; if (dd < bd) { bd = dd; b = n; } } return b; };
    const s = nearest(from.x, from.z), t = nearest(to.x, to.z);
    if (!s || !t) return null;
    const dist = new Map([[s.id, 0]]), prev = new Map(), done = new Set();
    for (let it = 0; it < nodes.length + 5; it++) {
      let u = null, ud = Infinity;
      for (const [id, dd] of dist) if (!done.has(id) && dd < ud) { ud = dd; u = id; }
      if (u === null || u === t.id) break;
      done.add(u);
      for (const ei of g._byId.get(u).edges) { const e = g.edges[ei], w = e.a === u ? e.b : e.a, nd = ud + g._len[ei]; if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); prev.set(w, { u, e }); } }
    }
    const pts = [];
    for (let w = t.id; prev.has(w);) { const { u, e } = prev.get(w); const P = e.a === u ? e.pts : [...e.pts].reverse(); pts.unshift(...P.slice(1)); w = u; }
    pts.unshift([s.x, s.z]); pts.push([to.x, to.z]);
    return pts;
  }
  walkCop(p, dt, sp) {
    p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
    const r = this.collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8);
    p.pos.x = r.x; p.pos.z = r.z;
    p.pos.y = this.collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
    const [clip, s] = locomotion(sp); p.h.play(clip, 0.2, s);
  }
  // officers carry a sidearm (SWAT: a rifle); it comes out with the threat level
  armCop(p, drawn) {
    if (!p.gun) {
      const w = p.swat ? WEAPONS.rifle_01 : WEAPONS.pistol;
      p.gun = buildWeaponModel(w); p.gun.visible = false; this.scene.add(p.gun);
      p.pose = new GunPose(p.h);
    }
    p.drawn = drawn;
  }
  poseGun(p, aiming) {
    if (!p.gun) return;
    p.gun.visible = !!p.drawn && p.mode !== 'dead' && p.h.root.visible;
    if (!p.gun.visible) return;
    p.h.root.position.copy(p.pos); p.h.root.rotation.y = p.heading; p.h.root.updateMatrixWorld(true);
    const info = p.gun.userData.hold;
    const aim = new THREE.Vector3(this.player.pos.x - p.pos.x, (this.player.pos.y + 1.2) - (p.pos.y + 1.4), this.player.pos.z - p.pos.z).normalize();
    if (info.kind === 'long' || aiming) p.pose.apply({ gun: p.gun, info, state: aiming ? 'aim' : 'ready', aimDir: aim, heading: p.heading });
    else p.pose.attachToHand(p.gun, p.pose.R);
  }

  update(dt, player) {
    // player: {pos, inCar, speed, vehicle}
    this.player = player;
    if (this.wanted > 0) this.perceive(dt); else { this.sight = false; this.lastSeen = null; this.hadLost = false; this.hadSight = false; }
    // police presence / losing them: it's what they can see (or hear) that keeps the stars on
    // (the stars only start to cool once they've reached where you were last seen and can't find you)
    const atScene = this.lastSeen && (this.cars.some((c) => c.v.pos.distanceTo(this.lastSeen) < 70) || this.peds.list.some((p) => p.role === 'cop' && p.mode !== 'dead' && p.pos.distanceTo(this.lastSeen) < 70));
    const seen = this.wanted > 0 ? this.sight || !atScene : this.nearPolice(70);
    if (this.wanted > 0) {
      this.cool = seen ? 0 : this.cool + dt;
      if (this.cool > 8 + this.wanted * 4) {
        this.wanted--; this.cool = 4.5;
        if (this.wanted === 0) { this.onEscaped?.(this.maxWanted, this.kills); this.kills = 0; this.heat = 0; this.maxWanted = 0; this.copKills = 0; }
      }
    }
    // keep the right number of cruisers in pursuit
    const want = CARS_PER_STAR[this.wanted];
    if (this.cars.length < want && this.rnd() < dt * 0.8) this.spawnCar(player.pos);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], v = c.v;
      const T = this.wanted > 0 ? this.target() : player.pos; // where they think you are
      const dx = T.x - v.pos.x, dz = T.z - v.pos.z, d = Math.hypot(dx, dz);
      if ((this.wanted === 0 && d > 90) || d > 420 || (i >= want && d > 200) || c.recall) {
        this.scene.remove(v.group); v.dispose();
        for (const o of c.officers) if (o.mode !== 'dead') { o.mode = 'dead'; o.timer = 0; o.h.root.visible = false; }
        this.cars.splice(i, 1); continue;
      }
      if (c.tank) {
        // roll toward you and fire the main gun every few seconds
        v.target = player.pos;
        if (v.health > 0 && d < 160 && (v.fireT -= dt) <= 0) {
          v.fireT = 5 + this.rnd() * 3;
          const miss = 2 + this.rnd() * 6, a = this.rnd() * Math.PI * 2;
          this.audio?.gunshot(2.6);
          this.onShell?.(new THREE.Vector3(player.pos.x + Math.cos(a) * miss, player.pos.y, player.pos.z + Math.sin(a) * miss), v.pos);
        }
        v.physics(dt, null, this.hm, this.collision); v.sync(dt);
        continue;
      }
      v.siren = this.wanted > 0;
      let ctl = { throttle: 0, brake: 1, steer: 0, handbrake: false };
      if (this.wanted > 0 && !c.deployed) {
        // along the roads to where they think you are (straight at you only for the last stretch)
        let ax = T.x, az = T.z;
        if (d > 45) {
          if (!c.path || (c.routeT -= dt) <= 0 || Math.hypot(c.pathEnd.x - T.x, c.pathEnd.z - T.z) > 40) { c.path = this.route(v.pos, T); c.pi = 0; c.routeT = 4; c.pathEnd = { x: T.x, z: T.z }; }
          const P = c.path;
          if (P && P.length) {
            while (c.pi < P.length - 1 && Math.hypot(P[c.pi][0] - v.pos.x, P[c.pi][1] - v.pos.z) < 10) c.pi++;
            ax = P[c.pi][0]; az = P[c.pi][1];
          }
        }
        const want = Math.atan2(ax - v.pos.x, az - v.pos.z);
        let steer = clamp(wrapAngle(want - v.heading) * 2, -1, 1);
        // stuck is not getting any closer (a car jammed against a wall can show plenty of speed)
        const dAim = Math.hypot(ax - v.pos.x, az - v.pos.z);
        // still no closer after a long while (wedged somewhere): that car's called off and another sent
        if (d < (c.bestD ?? 1e9) - 3) { c.bestD = d; c.noGain = 0; } else if ((c.noGain = (c.noGain || 0) + dt) > 12 && d > 60) c.recall = true;
        if ((c.progT = (c.progT || 0) + dt) > 2.5) { if (!(c.reverse > 0) && (c.progD ?? 1e9) - dAim < 2.5 && d > 16) { c.reverse = 1.4; c.pi = Math.min((c.pi || 0) + 1, (c.path?.length || 1) - 1); } c.progD = dAim; c.progT = 0; }
        const close = d < (player.inCar ? 10 : 14);
        if (c.reverse > 0) { c.reverse -= dt; ctl = { throttle: 0, brake: 1, steer: -steer, handbrake: false }; }
        else if (close && Math.abs(player.speed) < 6) ctl = { throttle: 0, brake: 1, steer, handbrake: false };
        else {
          const cornering = Math.abs(steer) > 0.7 && Math.abs(v.speed) > 18;
          ctl = { throttle: cornering ? 0.3 : 1, brake: cornering ? 0.4 : 0, steer, handbrake: false };
        }
        if (ctl.throttle > 0.5 && Math.abs(v.speed) < 1.2) { c.stuck += dt; if (c.stuck > 1.5) { c.reverse = 1.3; c.stuck = 0; } } else c.stuck = 0;
        // officers get out when the chase stops
        if (close && Math.abs(v.speed) < 2 && !c.deployed) this.deploy(c);
      }
      v.physics(dt, ctl, this.hm, this.collision);
      this.bump(v);
      v.sync(dt);
    }
    // arrests: slow, on foot, an officer right next to you, low wanted level
    const arresting = this.wanted > 0 && this.heat <= 2 && !player.inCar && !player.drawn && player.speed < 1.2 &&
      this.peds.list.find((p) => p.role === 'cop' && p.mode !== 'dead' && p.pos.distanceTo(player.pos) < 2.4);
    if (arresting) {
      this.bustT += dt;
      if (this.bustT > 1.5 && this.onBusted) { this.bustT = 0; this.onBusted(arresting); }
    } else this.bustT = 0;
    // siren audio
    let nearest = Infinity;
    for (const c of this.cars) if (c.v.siren) nearest = Math.min(nearest, c.v.pos.distanceTo(player.pos));
    this.audio?.siren(nearest < 250 ? 1 - nearest / 250 : 0);
  }

  deploy(c) {
    c.deployed = true;
    const v = c.v, sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
    for (const side of [-1, 1]) {
      const h = new Human(this.lib, 'mh_cop');
      if (c.swat) { h.model.traverse((o) => { if (o.isMesh && o.material?.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } }); shadePerson(h.model); }
      const x = v.pos.x + sx * side * (v.spec.width / 2 + 0.8), z = v.pos.z + sz * side * (v.spec.width / 2 + 0.8);
      const p = { h, role: 'cop', swat: !!c.swat, armor: c.swat ? 3 : 1, mode: 'walk', hp: c.swat ? 220 : 120, pos: new THREE.Vector3(x, this.collision.surface(x, z, v.pos.y + 1), z),
        heading: v.heading, speed: 0, radius: 0.35, acc: 0, timer: 0, G: null };
      p.car = c; p.side = side; // side -1 takes cover behind the car, +1 flanks
      h.root.position.copy(p.pos);
      this.scene.add(h.root);
      this.peds.list.push(p);
      c.officers.push(p);
    }
  }
}
