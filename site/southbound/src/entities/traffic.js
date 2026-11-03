// AI traffic: cars follow lanes on the road graph, keep their distance,
// slow for turns, and stop for the player.
import * as THREE from 'three';
import { vehiclesOverlap } from '../world/collision.js';
import { Vehicle, randomCarType } from './vehicle.js';
import { mulberry32, polylineLengths, lerp, wrapAngle, clamp } from '../util.js';

const LANE = { street: 3.0, highway: 3.0 };

export class Traffic {
  constructor(graph, quality, scene, lib) {
    this.lib = lib;
    this.graph = graph;
    this.quality = quality;
    this.scene = scene;
    this.rnd = mulberry32(4242);
    this.cars = [];
    for (const e of graph.edges) { e.acc = polylineLengths(e.pts); e.len = e.acc[e.acc.length - 1]; e.mid = e.pts[(e.pts.length / 2) | 0]; }
    this.max = quality.traffic;
  }

  sampleEdge(e, d, out) {
    // point + tangent at distance d from node a
    const acc = e.acc, pts = e.pts;
    d = clamp(d, 0, e.len);
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] <= d) lo = m; else hi = m; }
    const t = (d - acc[lo]) / Math.max(acc[hi] - acc[lo], 1e-6);
    out.x = lerp(pts[lo][0], pts[hi][0], t);
    out.z = lerp(pts[lo][1], pts[hi][1], t);
    out.y = lerp(e.ys[lo], e.ys[hi], t) + 0.1;
    const L = Math.hypot(pts[hi][0] - pts[lo][0], pts[hi][1] - pts[lo][1]) || 1;
    out.tx = (pts[hi][0] - pts[lo][0]) / L;
    out.tz = (pts[hi][1] - pts[lo][1]) / L;
    out.slope = (e.ys[hi] - e.ys[lo]) / L;
    return out;
  }

  spawn(center, minR, maxR) {
    const edges = this.graph.edges;
    for (let tries = 0; tries < 40; tries++) {
      const e = edges[(this.rnd() * edges.length) | 0];
      const d = Math.hypot(e.mid[0] - center.x, e.mid[1] - center.z);
      if (d < minR || d > maxR) continue;
      const patrol = this.rnd() < (this.patrolK ?? 0.05); // marked units on patrol (more at night)
      const v = new Vehicle(this.lib, patrol ? 'police' : randomCarType(this.rnd));
      v.patrol = patrol;
      const car = { v, e, dir: this.rnd() < 0.5 ? 1 : -1, s: this.rnd() * e.len, speed: 0, pref: 0.85 + this.rnd() * 0.25, stun: 0, init: true };
      car.speed = e.speed * car.pref * 0.8;
      this.place(car, 1);
      this.scene.add(v.group);
      this.cars.push(car);
      return car;
    }
    return null;
  }

  place(car, k) {
    const p = this._p || (this._p = {});
    const d = car.dir > 0 ? car.s : car.e.len - car.s;
    this.sampleEdge(car.e, d, p);
    const tx = p.tx * car.dir, tz = p.tz * car.dir;
    const off = LANE[car.e.kind];
    const x = p.x - tz * off, z = p.z + tx * off;
    const v = car.v;
    if (car.init) { v.pos.set(x, p.y, z); v.heading = Math.atan2(tx, tz); car.init = false; }
    v.pos.x = lerp(v.pos.x, x, k); v.pos.z = lerp(v.pos.z, z, k); v.pos.y = lerp(v.pos.y, p.y, Math.min(1, k * 2));
    v.heading += wrapAngle(Math.atan2(tx, tz) - v.heading) * k;
    v.pitch = lerp(v.pitch, Math.atan(p.slope * car.dir), k);
  }

  nextEdge(car) {
    const nodeId = car.dir > 0 ? car.e.b : car.e.a;
    const node = this.graph.nodes.get(nodeId);
    const options = node.edges.filter((id) => id !== car.e.id);
    const id = options.length ? options[(this.rnd() * options.length) | 0] : car.e.id;
    const e = this.graph.edges[id];
    car.e = e;
    car.dir = e.a === nodeId ? 1 : -1;
    car.s = 0;
  }

  // Take a car out of traffic (the player is stealing it)
  release(car) {
    this.cars.splice(this.cars.indexOf(car), 1);
    return car.v;
  }

  nearest(pos, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) { const d = c.v.pos.distanceTo(pos); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  update(dt, focus, playerVehicle, playerOnFoot, night, extraObstacles = []) {
    // keep the population topped up around the player
    if (this.cars.length < this.max) this.spawn(focus, this.cars.length < this.max * 0.6 ? 20 : 220, 480);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const far = Math.hypot(c.v.pos.x - focus.x, c.v.pos.z - focus.z);
      // over the (time-of-day) limit: let cars that are well out of sight go home
      if (far > 620 || (this.cars.length > this.max + 2 && far > 260 && !c.v.patrol)) {
        this.scene.remove(c.v.group);
        c.v.dispose();
        this.cars.splice(i, 1);
      }
    }
    const obstacles = this.cars.map((c) => c.v);
    if (playerVehicle) obstacles.push(playerVehicle);
    for (const o of extraObstacles) obstacles.push(o);
    for (const c of this.cars) {
      const v = c.v;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      let target = c.e.speed * c.pref;
      if (c.e.len - c.s < 22) target = Math.min(target, c.e.kind === 'highway' ? 14 : 7.5);
      for (const o of obstacles) {
        if (o === v) continue;
        const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead <= 0 || ahead > 32) continue;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat < 2.4) target = Math.min(target, Math.max(0, (ahead - 7.5) * 0.9));
      }
      if (playerOnFoot) {
        const dx = playerOnFoot.x - v.pos.x, dz = playerOnFoot.z - v.pos.z;
        const ahead = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 18 && lat < 2.2) target = Math.min(target, Math.max(0, (ahead - 4) * 0.8));
      }
      if (c.stun > 0) { c.stun -= dt; target = 0; }
      if (v.driverDead || v.exploded || v.onFire) target = 0; // nobody driving any more
      const dv = target - c.speed;
      c.speed += clamp(dv, -9 * dt, 3 * dt);
      v.braking = dv < -0.5;
      c.s += c.speed * dt;
      if (c.s >= c.e.len) this.nextEdge(c);
      this.place(c, Math.min(1, dt * 6));
      v.speed = c.speed;
      v.steer = 0;
      v.wheelSpin += (c.speed / v.spec.wheelR) * dt;
      v.night = night;
      v.sync(dt);
    }
    // player car shoves traffic
    if (playerVehicle) {
      for (const c of this.cars) {
        const v = c.v;
        if (Math.abs(v.pos.x - playerVehicle.pos.x) > 12 || Math.abs(v.pos.z - playerVehicle.pos.z) > 12) continue;
        const m = vehiclesOverlap(playerVehicle, v); // exact footprints
        if (m) {
          const nx = -m.nx, nz = -m.nz, push = m.d;
          playerVehicle.pos.x -= nx * push * 0.6; playerVehicle.pos.z -= nz * push * 0.6;
          const vn = playerVehicle.vel.x * nx + playerVehicle.vel.y * nz;
          if (vn > 0) { playerVehicle.vel.x -= nx * vn * 1.1; playerVehicle.vel.y -= nz * vn * 1.1; playerVehicle.impact = Math.max(playerVehicle.impact, vn); }
          c.speed = 0; c.stun = 3;
        }
      }
    }
  }
}
