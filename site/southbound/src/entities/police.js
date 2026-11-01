// Wanted level, pursuing police cruisers and officers on foot.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { Human, locomotion } from './human.js';
import { clamp, wrapAngle, mulberry32 } from '../util.js';

const CARS_PER_STAR = [0, 1, 2, 3, 4, 6];

export class Police {
  constructor(lib, scene, hm, collision, graph, peds, audio) {
    this.lib = lib; this.scene = scene; this.hm = hm; this.collision = collision; this.graph = graph;
    this.peds = peds; this.audio = audio;
    this.wanted = 0; this.kills = 0;
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
    if (kind === 'shots') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'assault') this.wanted = Math.max(this.wanted, 1);
    if (kind === 'kill') { this.kills++; this.wanted = Math.max(this.wanted, 1 + Math.floor(this.kills / 3)); }
    if (kind === 'copShot') this.wanted = Math.max(this.wanted, 2);
    if (kind === 'copKill') this.wanted = Math.min(5, Math.max(this.wanted + 1, 3));
    if (kind === 'carjack') this.wanted = Math.max(this.wanted, this.nearPolice(40) ? 1 : 0);
    this.wanted = Math.min(5, this.wanted);
    if (this.wanted > before) this.cool = 0;
  }

  clear() {
    this.wanted = 0; this.kills = 0; this.cool = 0;
    for (const c of this.cars) { this.scene.remove(c.v.group); c.v.dispose(); for (const o of c.officers) o.mode = 'gone'; }
    this.cars = [];
    for (const p of this.peds.list) if (p.role === 'cop') { p.mode = 'dead'; p.timer = 0; }
  }

  nearPolice(r) {
    if (!this.player) return false;
    for (const c of this.cars) if (c.v.pos.distanceTo(this.player.pos) < r) return true;
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
      const v = new Vehicle(this.lib, 'police');
      v.pos.set(pt[0], this.collision.surface(pt[0], pt[1], 200) + 0.05, pt[1]);
      v.heading = Math.atan2(focus.x - pt[0], focus.z - pt[1]);
      v.siren = true;
      this.scene.add(v.group);
      const c = { v, stuck: 0, reverse: 0, officers: [], deployed: false };
      this.cars.push(c);
      return c;
    }
    return null;
  }

  // AI for officers (they live in the pedestrian list with role 'cop')
  copThink(p, dt) {
    if (p.mode === 'dead') return;
    const pl = this.player;
    if (!pl || this.wanted === 0) { p.h.play('Idle_Loop', 0.3); return; }
    const tx = pl.pos.x - p.pos.x, tz = pl.pos.z - p.pos.z, d = Math.hypot(tx, tz);
    p.heading += wrapAngle(Math.atan2(tx, tz) - p.heading) * Math.min(1, dt * 6);
    if (d > (pl.inCar ? 14 : 9)) {
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
      if (p.gunT <= 0) {
        p.gunT = 0.9 + this.rnd() * 0.8;
        p.h.play('Pistol_Shoot', 0.05, 1.4, true);
        this.audio?.gunshot(0.5);
        const chance = clamp(0.65 - d / 45, 0.1, 0.65) * (pl.inCar ? 0.6 : 1) * (pl.speed > 4 ? 0.6 : 1);
        if (this.rnd() < chance && this.onPlayerHit) this.onPlayerHit(6 + this.rnd() * 7, p.pos);
      } else if (p.h.locked <= 0) p.h.play('Pistol_Aim_Neutral', 0.15);
    }
  }

  update(dt, player) {
    // player: {pos, inCar, speed, vehicle}
    this.player = player;
    // police presence / losing them
    const seen = this.nearPolice(70);
    if (this.wanted > 0) {
      this.cool = seen ? 0 : this.cool + dt;
      if (this.cool > 8 + this.wanted * 4) { this.wanted--; this.cool = 4.5; if (this.wanted === 0) this.kills = 0; }
    }
    // keep the right number of cruisers in pursuit
    const want = CARS_PER_STAR[this.wanted];
    if (this.cars.length < want && this.rnd() < dt * 0.8) this.spawnCar(player.pos);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], v = c.v;
      const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z, d = Math.hypot(dx, dz);
      if ((this.wanted === 0 && d > 90) || d > 420 || (i >= want && d > 200)) {
        this.scene.remove(v.group); v.dispose();
        for (const o of c.officers) if (o.mode !== 'dead') { o.mode = 'dead'; o.timer = 0; o.h.root.visible = false; }
        this.cars.splice(i, 1); continue;
      }
      v.siren = this.wanted > 0;
      let ctl = { throttle: 0, brake: 1, steer: 0, handbrake: false };
      if (this.wanted > 0 && !c.deployed) {
        const want = Math.atan2(dx, dz);
        let steer = clamp(wrapAngle(want - v.heading) * 2, -1, 1);
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
      v.sync(dt);
    }
    // arrests: slow, on foot, an officer right next to you, low wanted level
    if (this.wanted > 0 && this.wanted <= 2 && !player.inCar && player.speed < 1.2 &&
        this.peds.list.some((p) => p.role === 'cop' && p.mode !== 'dead' && p.pos.distanceTo(player.pos) < 2.4)) {
      this.bustT += dt;
      if (this.bustT > 1.5 && this.onBusted) { this.bustT = 0; this.onBusted(); }
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
      const x = v.pos.x + sx * side * (v.spec.width / 2 + 0.8), z = v.pos.z + sz * side * (v.spec.width / 2 + 0.8);
      const p = { h, role: 'cop', mode: 'walk', hp: 120, pos: new THREE.Vector3(x, this.collision.surface(x, z, v.pos.y + 1), z),
        heading: v.heading, speed: 0, radius: 0.35, acc: 0, timer: 0, G: null };
      h.root.position.copy(p.pos);
      this.scene.add(h.root);
      this.peds.list.push(p);
      c.officers.push(p);
    }
  }
}
