// Crowd behaviour for the humans library: villagers that MILL (wander between nearby spots, stop to
// talk, face each other), then FLEE along escape paths when an alarm goes off (reacting in a wave
// from the threat outward, running and pushing past each other), or COWER against a wall. The
// whole crowd is simulated ONCE in setup() (a seeded social-force model, Helbing & Molnar 1995, at
// 30 Hz) and baked into one Trajectory per villager; every frame then only reads the bake, so
// update(t) stays a pure function of t (every worker bakes the same numbers from the same seed).
// The legs, arms and faces come from the performers (perform.js / motion.js): planted feet on the
// baked paths, a look back at the threat, arms over the head while running from falling debris,
// fear on every face.
//
//   import { createCrowd } from '../lib/humans/crowd.js';
//   const crowd = createCrowd({
//     seed: 3, t0: 0, t1: 14,
//     agents: performers.map((p, i) => ({ performer: p, pos: [x, z], yaw })),
//     exits: [[[x, z], [x, z], ...], ...],          // escape paths (polylines) out of the space
//     obstacles: [{ x, z, r }], walls: [[x0, z0, x1, z1], ...],
//     alarm: { t: 4.0, at: [x, z] },                 // when / where the threat appears
//     cower: 0.2,                                    // share that cower instead of fleeing
//     groups: [[0, 1, 2], [3, 4]],                    // agents that stand together talking (optional)
//   });
//   crowd.bake();                                    // setup (also applies the schedule to the performers)
//   update(t): for (const p of performers) p.update(t)
import * as THREE from 'three';
import { Trajectory } from './motion.js';
import { hash01 } from './rig.js';

const DT = 1 / 30;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Closest point on segment ab to p: [x, z, distance]. */
function segPoint(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  const x = ax + dx * u, z = az + dz * u;
  return [x, z, Math.hypot(px - x, pz - z)];
}

/**
 * opts: { seed, t0, t1, agents: [{ performer?, pos: [x, z], yaw, home?: [x, z], radius (mill radius, 2.5),
 * talk (0.5: share of time stopped), speed (flee speed, default 3.0-4.4 by seed), exit (index) }],
 * exits: [polylines], obstacles: [{ x, z, r }], walls: [[x0, z0, x1, z1]], alarm: { t, at: [x, z],
 * wave (s per 10 m of distance: 0.6) }, cower (0.15), lookBack (0.5: share that glance back),
 * groups: [[agent indices], ...] - conversation groups: the members stand on a loose ring round the
 * group's centre (shuffling a little), face it, turn their heads to whoever is talking (the turn passes
 * round the group every few seconds), and the talker gestures - until the alarm breaks them up }
 */
export function createCrowd(opts) {
  const seed = opts.seed ?? 1;
  const agents = opts.agents.map((a, i) => ({
    i, ...a,
    home: a.home || a.pos,
    radius: a.radius ?? 2.5,
    talk: a.talk ?? 0.5,
    vFlee: a.speed ?? 3.0 + 1.4 * hash01(seed, i * 11 + 1),
    vMill: 0.55 + 0.35 * hash01(seed, i * 11 + 2),
    react: 0,
    mode: 'mill',
  }));
  // conversation groups: centre = the members' mean start, each member a slot on the ring
  const groups = (opts.groups || []).map((members, g) => {
    const m = members.filter((i) => agents[i]);
    const cx = m.reduce((s, i) => s + agents[i].pos[0], 0) / Math.max(1, m.length), cz = m.reduce((s, i) => s + agents[i].pos[1], 0) / Math.max(1, m.length);
    // slots in the members' own angular order round the centre (nobody crosses the circle)
    const order = m.slice().sort((i, j) => Math.atan2(agents[i].pos[1] - cz, agents[i].pos[0] - cx) - Math.atan2(agents[j].pos[1] - cz, agents[j].pos[0] - cx));
    const r = 0.32 + 0.12 * m.length;            // ~1.1-1.2 m between neighbours (conversation distance)
    order.forEach((i, k) => { const a = agents[i]; a.group = g; a.slot = (k / m.length) * Math.PI * 2 + hash01(seed, g * 13 + 1) * 6.283; a.ringR = r; });
    return { g, members: order, x: cx, z: cz, r };
  });
  const C = { opts, agents, groups, baked: false };
  C.bake = () => bake(C);
  /** The baked state of agent i at t: { x, z, yaw, v, mode } */
  C.stateAt = (i, t) => {
    const a = agents[i];
    const r = a.traj.at(t, {});
    r.mode = t >= a.fleeT ? (a.cowerAt != null && t >= a.cowerAt ? 'cower' : a.cowers ? 'toCover' : 'flee') : 'mill';
    return r;
  };
  return C;
}

function bake(C) {
  if (C.baked) return C;
  const { opts, agents } = C;
  const seed = opts.seed ?? 1;
  const t0 = opts.t0 ?? 0, t1 = opts.t1 ?? 20;
  const n = Math.ceil((t1 - t0 + 3) / DT) + 1;
  const walls = opts.walls || [];
  const obs = opts.obstacles || [];
  const exits = opts.exits || [];
  const al = opts.alarm || null;
  // who flees where, who cowers, when each reacts
  for (const a of agents) {
    const d = al ? Math.hypot(a.pos[0] - al.at[0], a.pos[1] - al.at[1]) : 0;
    a.fleeT = al ? al.t + (al.wave ?? 0.25) * d / 10 + 0.12 + 0.6 * hash01(seed, a.i * 11 + 3) : Infinity;
    a.cowers = al && hash01(seed, a.i * 11 + 4) < (opts.cower ?? 0.15);
    // the nearest exit whose entrance is not past the threat (run away, not toward it)
    let best = -1, bs = Infinity;
    exits.forEach((path, k) => {
      const [ex, ez] = path[0];
      const dE = Math.hypot(ex - a.pos[0], ez - a.pos[1]);
      const away = al ? ((ex - a.pos[0]) * (a.pos[0] - al.at[0]) + (ez - a.pos[1]) * (a.pos[1] - al.at[1])) / ((dE || 1) * (d || 1)) : 0;
      const s = dE * (1.4 - 0.6 * away) * (0.85 + 0.3 * hash01(seed, a.i * 31 + k));
      if (s < bs) { bs = s; best = k; }
    });
    a.exit = a.exit ?? best;
    // cover: the nearest wall point (or obstacle edge) for the ones who cower
    if (a.cowers) {
      let cp = null, cd = Infinity;
      // the nearest shelter that is not toward the threat (a wall or the far side of an obstacle)
      const dT = (x, z) => Math.hypot(x - al.at[0], z - al.at[1]);
      const score = (x, z, dd) => dd + 2 * Math.max(0, d - dT(x, z));
      let cs = Infinity;
      for (const [x0, z0, x1, z1] of walls) { const [x, z, dd] = segPoint(a.pos[0], a.pos[1], x0, z0, x1, z1); const sc = score(x, z, dd); if (sc < cs) { cs = sc; cd = dd; cp = [x, z]; } }
      for (const o of obs) {
        // the side of the obstacle facing away from the threat
        const ux = o.x - al.at[0], uz = o.z - al.at[1], L = Math.hypot(ux, uz) || 1;
        const x = o.x + ux / L * o.r, z = o.z + uz / L * o.r, dd = Math.hypot(a.pos[0] - x, a.pos[1] - z);
        const sc = score(x, z, dd); if (sc < cs) { cs = sc; cd = dd; cp = [x, z]; }
      }
      if (!cp || cd > 9) {
        // no shelter near: frozen with fear - a step back from the threat and down where they stand
        const ux = a.pos[0] - al.at[0], uz = a.pos[1] - al.at[1], L = Math.hypot(ux, uz) || 1;
        a.cover = [a.pos[0] + ux / L * 0.7, a.pos[1] + uz / L * 0.7];
      } else {
        // stand 0.45 m off the wall, toward the agent
        const dx = a.pos[0] - cp[0], dz = a.pos[1] - cp[1], L = Math.hypot(dx, dz) || 1;
        a.cover = [cp[0] + dx / L * 0.45, cp[1] + dz / L * 0.45];
      }
    }
    a.yaw0 = Number.isFinite(a.yaw) ? a.yaw : 0;
    a.px = new Float64Array(n); a.pz = new Float64Array(n); a.yaw = new Float64Array(n);
    a.x = a.pos[0]; a.z = a.pos[1]; a.vx = 0; a.vz = 0; a.h = a.yaw0;
    a.wp = 1;          // next waypoint on the exit path
    a.cowerAt = null;
  }
  // mill targets: piecewise, a new spot every 3-7 s, sometimes staying to talk
  const millGoal = (a, t) => {
    if (a.group != null) {
      const G = C.groups[a.group];
      const ang = a.slot + 0.12 * Math.sin(t * 0.21 + a.i * 1.7), r = a.ringR * (1 + 0.08 * Math.sin(t * 0.33 + a.i));
      const gx = G.x + Math.cos(ang) * r, gz = G.z + Math.sin(ang) * r;
      return Math.hypot(gx - a.x, gz - a.z) > 0.12 ? [gx, gz] : null;
    }
    const P = 3 + 4 * hash01(seed, a.i * 7 + 9);
    const k = Math.floor((t - t0 + hash01(seed, a.i * 7 + 8) * P) / P);
    if (hash01(seed, a.i * 977 + k) < a.talk) return null;           // standing / talking
    const ang = hash01(seed, a.i * 991 + k) * Math.PI * 2, r = a.radius * Math.sqrt(hash01(seed, a.i * 997 + k));
    return [a.home[0] + Math.cos(ang) * r, a.home[1] + Math.sin(ang) * r];
  };
  for (let s = 0; s < n; s++) {
    const t = t0 - 1 + s * DT;
    // forces
    for (const a of agents) {
      let gx = 0, gz = 0, v0 = 0, tau = 0.8;
      if (t < a.fleeT) {
        const g = millGoal(a, t);
        if (g) { gx = g[0] - a.x; gz = g[1] - a.z; v0 = Math.min(a.vMill, Math.hypot(gx, gz) * 0.8); }
      } else if (a.cowers) {
        gx = a.cover[0] - a.x; gz = a.cover[1] - a.z;
        const d = Math.hypot(gx, gz);
        v0 = Math.min(a.vFlee * 0.8, d * 2.2); tau = 0.35;
        if (d < 0.25 && a.cowerAt == null) a.cowerAt = t;
      } else if (a.exit >= 0) {
        const path = exits[a.exit];
        // steer at the next waypoint; advance when close
        let w = path[Math.min(a.wp, path.length - 1)];
        if (Math.hypot(w[0] - a.x, w[1] - a.z) < 1.6 && a.wp < path.length - 1) { a.wp++; w = path[a.wp]; }
        if (!a.onPath) {
          if (Math.hypot(path[0][0] - a.x, path[0][1] - a.z) < 2.5) a.onPath = true;
          else w = path[0];
        }
        gx = w[0] - a.x; gz = w[1] - a.z;
        const ramp = Math.min(1, (t - a.fleeT) / 0.9);
        v0 = a.vFlee * (0.35 + 0.65 * ramp); tau = 0.45;
        // the end of the path: slow down
        if (a.wp === path.length - 1) v0 *= Math.min(1, Math.hypot(gx, gz) / 3);
      }
      const gl = Math.hypot(gx, gz) || 1;
      let fx = (gx / gl * v0 - a.vx) / tau, fz = (gz / gl * v0 - a.vz) / tau;
      // other people: exponential repulsion + a little sideways slip (passing on the right)
      for (const b of agents) {
        if (b === a) continue;
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz) || 1e-3;
        if (d > 3) continue;
        const k = (t >= a.fleeT ? 7 : 2.2) * Math.exp((0.62 - d) / 0.3);
        fx += dx / d * k - dz / d * k * 0.15; fz += dz / d * k + dx / d * k * 0.15;
      }
      for (const o of obs) {
        const dx = a.x - o.x, dz = a.z - o.z, d = Math.hypot(dx, dz) || 1e-3;
        const k = 6 * Math.exp((o.r + 0.32 - d) / 0.22);
        fx += dx / d * k; fz += dz / d * k;
      }
      for (const [x0, z0, x1, z1] of walls) {
        const [x, z, d] = segPoint(a.x, a.z, x0, z0, x1, z1);
        if (d > 2) continue;
        const k = 6 * Math.exp((0.32 - d) / 0.2);
        fx += (a.x - x) / (d || 1e-3) * k; fz += (a.z - z) / (d || 1e-3) * k;
      }
      a.fx = fx; a.fz = fz;
    }
    // integrate (semi-implicit Euler), cap speed, heading follows the velocity (turn-rate limited)
    for (const a of agents) {
      if (a.cowerAt != null && t > a.cowerAt) { a.vx *= 0.8; a.vz *= 0.8; }
      a.vx += a.fx * DT; a.vz += a.fz * DT;
      const sp = Math.hypot(a.vx, a.vz), cap = (t >= a.fleeT && !a.cowers ? a.vFlee : a.vMill) * 1.25 + 0.2;
      if (sp > cap) { a.vx *= cap / sp; a.vz *= cap / sp; }
      a.x += a.vx * DT; a.z += a.vz * DT;
      let want = a.h;
      if (sp > 0.25) want = Math.atan2(a.vx, a.vz);
      else if (t < a.fleeT && a.group != null) {
        // in a group: face its centre (the head turns to the talker on top, see below)
        const G = C.groups[a.group];
        want = Math.atan2(G.x - a.x, G.z - a.z);
      } else if (t < a.fleeT) {
        // standing: face the nearest neighbour (talking groups)
        let nb = null, nd = 3.5;
        for (const b of agents) { if (b === a) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < nd) { nd = d; nb = b; } }
        if (nb) want = Math.atan2(nb.x - a.x, nb.z - a.z);
      } else if (a.cowers && a.cover) {
        // cowering: back to the wall, facing out toward the square (and the threat)
        want = al ? Math.atan2(al.at[0] - a.x, al.at[1] - a.z) : a.h;
      }
      const maxTurn = (t >= a.fleeT ? 5 : 1.6) * DT;
      a.h += Math.max(-maxTurn, Math.min(maxTurn, wrap(want - a.h)));
    }
    // bodies do not overlap: push apart any pair closer than 0.56 m (position correction)
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i], b = agents[j];
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
        if (d >= 0.56 || d < 1e-6) continue;
        const k = (0.56 - d) / 2 / d;
        a.x += dx * k; a.z += dz * k; b.x -= dx * k; b.z -= dz * k;
      }
    }
    for (const a of agents) { a.px[s] = a.x; a.pz[s] = a.z; a.yaw[s] = a.h; }
  }
  // smooth (0.2 s) and resample to Trajectories
  for (const a of agents) {
    const sm = (arr) => { const o = new Float64Array(arr.length); const w = 3; for (let i = 0; i < arr.length; i++) { let s = 0, c = 0; for (let j = -w; j <= w; j++) { const k = Math.max(0, Math.min(arr.length - 1, i + j)); s += arr[k]; c++; } o[i] = s / c; } return o; };
    const X = sm(a.px), Z = sm(a.pz);
    // unwrap yaw before smoothing
    const Y = new Float64Array(n); let prev = a.yaw[0];
    for (let i = 0; i < n; i++) { prev = prev + wrap(a.yaw[i] - prev); Y[i] = prev; }
    const Ys = sm(Y);
    const T0 = t0 - 1;
    a.traj = Trajectory.fromFn((t) => {
      const u = (t - T0) / DT, i = Math.max(0, Math.min(n - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i));
      return { x: X[i] + (X[i + 1] - X[i]) * f, z: Z[i] + (Z[i + 1] - Z[i]) * f, yaw: Ys[i] + (Ys[i + 1] - Ys[i]) * f };
    }, T0, T0 + (n - 1) * DT);
    // the performer's schedule from the bake
    const P = a.performer;
    if (!P) continue;
    P.trajectory(a.traj);
    if (a.group != null) {
      // the talk passes round the group: a talker every 2-4.5 s; listeners turn their heads to the
      // talker, the talker looks round at them and makes a point with a hand now and then
      const G = C.groups[a.group];
      const end = Math.min(a.fleeT ?? Infinity, t1);
      let tt = t0 - 1, k = 0;
      while (tt < end) {
        const talker = G.members[Math.floor(hash01(seed, a.group * 101 + k) * G.members.length)];
        const dur = 2 + 2.5 * hash01(seed, a.group * 103 + k);
        if (talker === a.i) {
          const other = G.members.find((j) => j !== a.i);
          if (other != null && agents[other].performer) P.lookAt({ ch: agents[other].performer.ch }, tt + 0.2, { amount: 0.5, blend: 0.5 });
          if (hash01(seed, a.i * 17 + k) < 0.6 && tt + 0.3 < end) P.gesture('explain', tt + 0.3, { side: hash01(seed, a.i * 19 + k) < 0.7 ? 'R' : 'L', in: 0.45, dur: Math.min(dur - 1.2, 1.4), out: 0.6, beat: 1.1 });
          P.react('smile', tt + 0.5 + 0.8 * hash01(seed, a.i * 23 + k), 1.4);
        } else if (agents[talker]?.performer) {
          P.lookAt({ ch: agents[talker].performer.ch }, tt + 0.15 + 0.3 * hash01(seed, a.i * 29 + k), { amount: 0.65, blend: 0.45 });
          if (hash01(seed, a.i * 31 + k) < 0.35) P.react('smile', tt + 0.9 + hash01(seed, a.i * 37 + k), 1.2);
        }
        tt += dur; k++;
      }
    }
    if (!al) continue;
    const threat = al.look || new THREE.Vector3(al.at[0], al.lookY ?? 6, al.at[1]);
    P.mood({ fear: 0.7 + 0.3 * hash01(seed, a.i * 11 + 5), worry: 0.3 }, a.fleeT - 0.5, 1e9, 0.3);
    // the startle: head (and eyes) snap to the threat, a gasp
    P.lookAt(threat, a.fleeT - 0.45, { amount: 0.9, blend: 0.18 });
    P.react('startle', a.fleeT - 0.4, 0.9);
    if (a.cowers) {
      P.posture('cower', a.cowerAt != null ? a.cowerAt - 0.1 : a.fleeT + 1.2, { in: 0.5, hold: 1e9 });
    } else {
      // running: eyes on the way out, some glance back over the shoulder, some shield their heads
      P.lookAt(null, a.fleeT + 0.5, { blend: 0.4 });
      if (hash01(seed, a.i * 11 + 6) < (opts.lookBack ?? 0.5)) {
        const tb = a.fleeT + 1.6 + 1.5 * hash01(seed, a.i * 11 + 7);
        P.lookAt(threat, tb, { amount: 0.75, blend: 0.25, chest: 0.4 });
        P.lookAt(null, tb + 0.7, { blend: 0.3 });
      }
      if (hash01(seed, a.i * 11 + 8) < (opts.shield ?? 0.3)) P.gesture('protectHead', a.fleeT + 0.2, { in: 0.3, dur: 1.4 + hash01(seed, a.i * 11 + 9), out: 0.6 });
    }
  }
  C.baked = true;
  return C;
}
