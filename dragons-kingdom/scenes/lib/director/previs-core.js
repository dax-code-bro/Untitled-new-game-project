// Shot director - PREVIS CORE (pure: Node or browser, three.js maths only - no renderer, no DOM, no files).
// The measuring half of tools/previs.mjs (engine phase 1, engine/DESIGN.md section 3.6): where the camera
// of a hand-written shot spec is at time t (static / keyed / `frame` solved by the stage's own framing
// solver / `follow`), and where every cast member's head lands on the screen (in frame, distance, size,
// the speaking-face check, a nearer actor's head or body covering it). previs.mjs draws and prints it;
// the engine (mine-specs, later the stager's check / adjust loop) reads the numbers.
//
//   import { measure } from './previs-core.js';
//   const r = measure(spec, '1A-27', 1.2, { row });   // row: the shot-table row { job, frames, dialogue }
//   r.cam.pos / r.cam.look / r.cam.mm, r.actors[{ name, x, y, dist, inFrame, sizePx, ... }]  (or r.skip)
//
// Approximations: standard body heights (standing head 1.62 m ...), creatures from their length, marks
// from spec.previs.marks / spec.homes / the cast; a `mount`ed camera is not previsualised.
import * as THREE from 'three';
import { actorState, actorVisible } from './blocking.js';
import { keyed, isKeyList } from './timeline.js';
import { solveFraming } from './framing.js';
import { speakerAt } from './dialogue.js';
import { faceReadability } from './audit.js';

export const CREATURE_LEN = { hatchling: 0.7, leaf: 9, charcoal: 14, starlight: 16, scout: 8 };
export const V = (a) => new THREE.Vector3(...a);
export const mergeShot = (def = {}, s = {}) => {
  const out = { ...def, ...s };
  if (def.cast || s.cast) {
    out.cast = {};
    for (const k of new Set([...Object.keys(def.cast || {}), ...Object.keys(s.cast || {})])) {
      if (s.cast && k in s.cast && s.cast[k] == null) continue;
      out.cast[k] = { ...(def.cast?.[k] || {}), ...(s.cast?.[k] || {}) };
    }
  }
  if (def.cam && s.cam) out.cam = { ...def.cam, ...s.cam };
  return out;
};

export function shotEnv(spec, s1) {
  const missing = new Set();
  const cast = s1.cast || {};
  const env = {
    missing,
    // the set's ground height (spec.previs.ground: a number, the Verdor field is at y 9) - 0 by default
    // + spec.previs.floors: name prefixes of marks that are raised walkable surfaces (a stair's steps, a deck):
    // an actor within 2 m of such marks stands at their height (inverse-distance blend) - stairs and decks
    ground(x, z) {
      const base = spec.previs?.ground ?? 0, fl = spec.previs?.floors;
      if (!fl) return base;
      let w = 0, wy = 0;
      for (const [n, m] of Object.entries(spec.previs.marks || {})) {
        if (m.length !== 3 || !fl.some((p) => n.startsWith(p))) continue;
        const d = Math.hypot(m[0] - x, m[2] - z);
        if (d > 2.0) continue;
        const k = 1 / Math.max(d, 0.05) ** 2; w += k; wy += k * m[1];
      }
      return w ? wy / w : base;
    },
    mark(n) {
      const m = spec.previs?.marks?.[n];
      if (m) return m;
      const b = cast[n];
      if (b?.at) return Array.isArray(b.at) ? (b.at.length === 3 ? b.at : [b.at[0], spec.previs?.ground ?? 0, b.at[1]]) : env.mark(b.at);
      if (spec.homes?.[n]) return spec.homes[n];
      missing.add(n);
      return null;
    },
    state(name, t) { return actorState(cast[name], t, env); },
    /** an actor part's approximate point (head / eye / chest / hips / hand.*) or a mark */
    point(name, t) {
      if (name == null) return null;
      if (Array.isArray(name)) return V(name);
      const [an, ...rest] = String(name).split('.');
      const part = rest.join('.');
      const def = spec.cast?.[an], b = cast[an];
      // a RIDER (cast def.ride): seated on its mount - the seat from spec.previs.marks['<mount>Seat'] or
      // spec.previs.seatH[mount] above the mount's root (default 0.18 x its length); head 0.75 m above the seat
      if (def?.ride && b && cast[def.ride]) {
        const mdef = spec.cast?.[def.ride], ms = actorState(cast[def.ride], t, env);
        const L = cast[def.ride].length ?? mdef?.length ?? CREATURE_LEN[mdef?.id] ?? 2;
        const fwd = new THREE.Vector3(Math.sin(ms.yaw), 0, Math.cos(ms.yaw));
        const sm = spec.previs?.marks?.[`${def.ride}Seat`];
        const seat = sm ? V(sm) : new THREE.Vector3(ms.x, ms.y + (spec.previs?.seatH?.[def.ride] ?? L * 0.18), ms.z).addScaledVector(fwd, L * 0.1);
        const dy = part === 'head' || part === 'eye' || part === 'eyes' ? 0.75 : part === 'chest' ? 0.4 : part.startsWith('hand') ? 0.25 : 0.1;
        return seat.add(new THREE.Vector3(0, dy, 0));
      }
      if (def && b && def.kind !== 'object') {
        const st = actorState(b, t, env);
        const fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
        if (def.kind === 'creature') {
          const L = b.length ?? def.length ?? CREATURE_LEN[def.id] ?? 2;
          const k = part === 'head' || part === 'eye' ? 0.42 : part === 'tail' ? -0.5 : part === 'hips' ? -0.12 : 0.05;
          const h = part === 'head' || part === 'eye' ? 0.16 : 0.1;
          // a creature settled on a raised bed (the hatchling on the nest's linen): its home's height
          const base = b.settle && spec.homes?.[an] ? spec.homes[an][1] - L * 0.08 : st.y;
          return new THREE.Vector3(st.x, base + L * h, st.z).addScaledVector(fwd, L * k);
        }
        const H = (b.height ?? def.height ?? 1.72) / 1.72, P = st.posture;
        const head = 1.62 - P.sit * 0.4 - P.crouch * 0.67 - P.kneel * 0.5;
        const y = part === 'head' || part === 'eye' || part === 'eyes' ? head : part === 'chest' ? head - 0.42 : part.startsWith('hand') ? 0.85 - P.sit * 0.2 - P.crouch * 0.4 : part === 'feet' ? 0.05 : head - 0.7;
        const lean = (P.bow + P.crouch * 0.45 + P.lean * 0.5) * 0.25;
        return new THREE.Vector3(st.x, st.y + y * H, st.z).addScaledVector(fwd, (part === 'head' || part === 'eye' ? lean : 0) + (part.startsWith('hand') ? 0.3 : 0));
      }
      const m = env.mark(name);
      return m ? V(m) : null;
    },
  };
  env.approxPoint = (n, t) => env.point(n, t);
  return env;
}

export function cameraAt(spec, s1, t, u, env) {
  const c = s1.cam || {};
  if (c.mount) return { skip: `mounted on ${c.mount}` };
  const mm = typeof c.mm === 'number' ? c.mm : isKeyList(c.mm) ? keyed(t, c.mm) : 35;
  const res = (v) => {
    if (v == null) return null;
    if (isKeyList(v)) {
      const ks = v.map(([tk, val, e]) => [tk, Array.isArray(val) ? val : env.point(val, tk)?.toArray(), e]);
      if (ks.some((k) => !k[1])) return null;
      return V(keyed(t, ks));
    }
    return Array.isArray(v) ? V(v) : env.point(v, t);
  };
  let pos, look, worst = null, usedMm = mm;
  if (c.frame) {
    const lost = c.frame.subjects.map(([n]) => n).filter((n) => !env.point(n, c.frame.at ?? 0));
    if (lost.length) return { skip: `frame subject(s) ${lost.join(', ')} not placeable here (spec.previs.marks)` };
    let r = solveFraming(c.frame, mm, env, t, 16 / 9, 24.89, c.bounds || null);
    const tol = c.frame.tolerance ?? 0.12;
    if (r.worst > tol && !c.frame.track && c.frame.autoLens !== false) {
      for (const m2 of [40, 35, 32, 28, 24, 21, 18].filter((m) => m < mm && m >= Math.max(18, mm * (c.frame.minLensRatio ?? 0.5)))) {
        const r2 = solveFraming(c.frame, m2, env, t, 16 / 9, 24.89, c.bounds || null);
        if (r2.worst < r.worst) { r = r2; usedMm = m2; }
        if (r2.worst <= tol) break;
      }
    }
    pos = r.pos; look = r.look; worst = r.worst;
  } else if (c.follow) {
    const f = c.follow, st = env.state(f.target, t);
    const rot = (a) => (f.local !== false ? V(a).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw != null ? (keyed(t, f.yaw) * Math.PI) / 180 : st.yaw) : V(a));
    const g = new THREE.Vector3(st.x, st.y, st.z);
    // offsets may be key lists (X2-04's follow pulls back over the shot)
    const kv = (v, d) => (v == null ? d : isKeyList(v) ? keyed(t, v) : v);
    pos = g.clone().add(rot(kv(f.offset, [0, 2, -6])));
    look = c.look != null ? res(c.look) : g.clone().add(rot(kv(f.lookOffset, [0, 1.2, 0])));
  } else {
    pos = res(c.pos); look = res(c.look);
  }
  if (!pos || !look) return { skip: 'camera position or aim not resolvable here' };
  if (c.offset) pos.add(V(c.offset));
  if (c.push && typeof c.push === 'number') { const d = look.clone().sub(pos).multiplyScalar(c.push * u); pos.add(d); look.add(d); }
  const fstop = typeof c.fstop === 'number' ? c.fstop : 2.8;
  const fo = c.focus ?? (c.frame ? c.frame.subjects[0][0] : null);
  const fv = typeof fo === 'number' ? fo : isKeyList(fo) ? keyed(t, fo) : fo;
  const fp = typeof fv === 'number' ? null : res(fv);
  const focus = (typeof fv === 'number' ? fv : fp ? fp.distanceTo(pos) : look.distanceTo(pos)) + (c.focusOffset ?? 0);
  return { pos, look, mm: usedMm, asked: mm, fstop, focus, worst };
}

export function analyse(spec, s1, row, t, env) {
  const u = t / (row.frames / 24);
  const cam = cameraAt(spec, s1, t, u, env);
  if (cam.skip) return { t, skip: cam.skip };
  const vfov = 2 * Math.atan((24.89 * 9 / 16) / 2 / cam.mm) * 180 / Math.PI;
  const C = new THREE.PerspectiveCamera(vfov, 16 / 9, 0.05, 2000);
  C.position.copy(cam.pos); C.lookAt(cam.look); C.updateMatrixWorld(true);
  const speaker = row.dialogue?.length ? speakerAt(row.dialogue, t) : null;
  const tanV = Math.tan((vfov * Math.PI) / 360);
  const actors = [];
  for (const [name, b] of Object.entries(s1.cast || {})) {
    const def = spec.cast?.[name];
    if (!def || def.kind === 'object' || !actorVisible(b, t)) continue;
    const head = env.point(`${name}.head`, t);
    if (!head) continue;
    const ndc = head.clone().project(C);
    const dist = head.distanceTo(cam.pos);
    const st = env.state(name, t);
    // the face direction: the body's facing turned toward the eye-line by its amount
    let fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    if (st.look?.at != null) {
      const tp = env.point(st.look.at, t);
      if (tp) { const d = tp.clone().sub(head).normalize(); fwd = fwd.clone().lerp(d, Math.min(1, st.look.amount ?? 0.85)).normalize(); }
    }
    const toCam = cam.pos.clone().sub(head).normalize();
    const role = def.role ?? name.toUpperCase();
    const human = def.kind === 'human';
    const m = human ? faceReadability(fwd.toArray(), toCam.toArray(), dist, { focalLength: cam.mm, fstop: cam.fstop, focus: cam.focus, sensor: 'super35' }) : null;
    actors.push({
      name, role, kind: def.kind, head, x: ndc.x, y: ndc.y, behind: ndc.z > 1, dist,
      inFrame: ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
      sizePx: (0.24 / (dist * 2 * tanV)) * 540, speaking: speaker && role === speaker,
      angle: m ? Math.round(m.angle) : null, facePct: m ? +(m.faceFrac * 100).toFixed(1) : null, blurPct: m ? +(m.blurFrac * 100).toFixed(2) : null,
      reads: m && speaker && role === speaker && ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 ? !!m.readable : false, yaw: st.yaw, x3: st.x, z3: st.z,
      lookAt: typeof st.look?.at === 'string' ? st.look.at.split('.')[0] : null,
    });
  }
  // a head covered by a nearer actor's head or body (a disc 0.22 m wide at its own distance)
  for (const a of actors) for (const o of actors) {
    if (o === a || o.dist >= a.dist || !a.inFrame) continue;
    const ohead = o.head, chest = ohead.clone().add(new THREE.Vector3(0, -0.45, 0));
    for (const p of [ohead, chest]) {
      const n = p.clone().project(C);
      const rad = (0.22 / (p.distanceTo(cam.pos) * Math.tan((vfov * Math.PI) / 360) * 16 / 9)) + (0.12 / (a.dist * Math.tan((vfov * Math.PI) / 360) * 16 / 9));
      if (Math.hypot(n.x - a.x, (n.y - a.y) / 1.78) < rad) { a.hiddenBy = o.name; break; }
    }
  }
  return { t, cam, actors, speaker };
}

/** The merged spec of one shot (defaults + its own entry; cast merged per actor, null removes). */
export const shotSpec = (spec, id) => mergeShot(spec.defaults, spec.shots?.[id] || {});

/** Measure shot `shot` (an id of spec.shots, or an already merged shot spec) at t seconds into it.
 *  opts.row: its shot-table row ({ frames, dialogue }); without one, frames come from opts.frames
 *  (default 96) and nobody speaks. Returns analyse()'s { t, cam, actors, speaker } or { t, skip }. */
export function measure(spec, shot, t, opts = {}) {
  const s1 = typeof shot === 'string' ? shotSpec(spec, shot) : shot;
  const row = opts.row || { job: typeof shot === 'string' ? shot : null, frames: opts.frames ?? 96, dialogue: [] };
  const env = opts.env || shotEnv(spec, s1);
  const r = analyse(spec, s1, row, t, env);
  r.missing = [...env.missing];
  return r;
}
