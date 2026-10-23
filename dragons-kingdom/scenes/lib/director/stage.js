// Shot director - the SET SCENE factory: one scene file renders every shot of one set.
//
//   // episodes/s01e01/final/scenes/birthing-chamber.js
//   import { createSetScene } from '../../../../scenes/lib/director/stage.js';
//   import * as builder from '../../../../scenes/lib/director/sets/birthing-chamber.js';
//   import spec from './specs/birthing-chamber.spec.js';
//   const S = createSetScene({ set: 'BIRTHING_CHAMBER', builder, spec, table: new URL('./birthing-chamber.shots.json', import.meta.url).href });
//   export const meta = S.meta;
//   export const setup = (ctx) => S.setup(ctx);
//   export const update = (t, ctx) => S.update(t, ctx);
//
// The render contract (render/episode.mjs, README "Writing scenes"): setup() builds the set, the
// cast and the effects once; update(t) finds the shot that owns ctx.frame in the shot table
// (<set>.shots.json, written by tools/build-shots.mjs and fetched in setup, so every render job
// fingerprints it), then poses everything for the shot-local time - a pure function of t.
//
// spec = {
//   set: 'BIRTHING_CHAMBER',
//   cast: { alexandria: { kind: 'human', id: 'alexandria' }, hatchling: { kind: 'creature', id: 'hatchling', quality: 'standard' }, ... },
//   defaults: { ...shot fields every shot gets unless it sets them },
//   shots: { 'T-01': { cam, cast: { actor: blocking }, lines, fx, set: { ...set state }, exposure, custom(api, t) }, ... },
// }
import * as THREE from 'three';
import { SETS, continuityFor } from './registry.js';
import { shotAt, clamp, keyed } from './timeline.js';
import { evalCamera, resolvePoint } from './camera.js';
import { actorState, actorVisible } from './blocking.js';
import { poseHuman, poseCreature, humanRig } from './actions.js';
import { FxRunner, loadFxLibrary } from './fx.js';
import { mouthAt } from './dialogue.js';

const HUMAN_PARTS = { head: 'head', neck: 'neck02', chest: 'spine02', hips: 'root', pelvis: 'root', 'hand.L': 'wrist.L', 'hand.R': 'wrist.R', 'elbow.L': 'lowerarm01.L', 'elbow.R': 'lowerarm01.R', 'foot.L': 'foot.L', 'foot.R': 'foot.R', 'knee.L': 'lowerleg01.L', 'knee.R': 'lowerleg01.R', 'shoulder.L': 'upperarm01.L', 'shoulder.R': 'upperarm01.R' };
const CREATURE_PARTS = { head: 'head', chest: 'thorax', hips: 'lumbar', neck: 'neck_4', tail: 'tail_6', jaw: 'jaw' };

/** Merge shot spec over defaults (cast entries merge per actor; arrays replace). */
function mergeShot(def = {}, s = {}) {
  const out = { ...def, ...s };
  if (def.cast || s.cast) {
    out.cast = {};
    for (const k of new Set([...Object.keys(def.cast || {}), ...Object.keys(s.cast || {})])) {
      if (s.cast && k in s.cast && s.cast[k] == null) continue;
      out.cast[k] = { ...(def.cast?.[k] || {}), ...(s.cast?.[k] || {}) };
    }
  }
  if (def.set || s.set) out.set = { ...(def.set || {}), ...(s.set || {}) };
  if (def.cam && s.cam) out.cam = { ...def.cam, ...s.cam };
  return out;
}

export function createSetScene({ set: setId, builder, spec, table: tableUrl, title }) {
  const entry = SETS[setId];
  if (!entry) throw new Error(`createSetScene: set ${setId} is not in the director registry`);
  const meta = {
    title: title || `${setId} - shot director set scene`,
    duration: spec.duration ?? 600,
    seed: spec.seed ?? 7,
    cinematic: builder.cinematic ? builder.cinematic(spec) : true,
    shadowFilter: spec.shadowFilter,
  };
  let S = null;

  async function setup(ctx) {
    const r = await fetch(tableUrl);
    if (!r.ok) throw new Error(`${setId}: shot table ${tableUrl} missing (run node scenes/lib/director/tools/build-shots.mjs)`);
    const table = await r.json();
    const jobs = new Set(table.shots.map((s) => s.job));
    const shotSpecs = {};
    for (const s of table.shots) shotSpecs[s.job] = mergeShot(spec.defaults, spec.shots?.[s.job] || {});
    const fxLib = await loadFxLibrary();
    // who appears in the shots of this table
    const used = new Set();
    for (const j of jobs) for (const a of Object.keys(shotSpecs[j].cast || {})) used.add(a);
    const built = await builder.build(ctx, { spec, table, shotSpecs, continuity: (scene, job) => continuityFor(setId, scene, job), used });
    // the cast
    const actors = {};
    const castDef = { ...(spec.cast || {}), ...(built.cast || {}) };
    const H = [...used].filter((a) => castDef[a]?.kind === 'human');
    let humansLib = null, creaturesLib = null;
    if (H.length) humansLib = await import('../humans/index.js');
    if ([...used].some((a) => castDef[a]?.kind === 'creature')) creaturesLib = await import('../creatures/index.js');
    await Promise.all([...used].map(async (name) => {
      const d = castDef[name];
      if (!d) throw new Error(`${setId}: actor "${name}" is used by a shot but not in spec.cast`);
      if (d.kind === 'human') {
        const ch = await humansLib.loadCharacter(d.id, d.load || {});
        ch.root.name = `actor:${name}`;
        ctx.scene.add(ch.root);
        humanRig(ch);
        actors[name] = { name, kind: 'human', def: d, ch, root: ch.root };
      } else if (d.kind === 'creature') {
        const c = d.instance || await creaturesLib.createCreature(d.id, { quality: d.quality || (ctx.preset === 'final' || ctx.preset === 'final-fast' ? 'hero' : 'standard'), ...(d.opts || {}) });
        c.root.name = `actor:${name}`;
        if (!d.instance) ctx.scene.add(c.root);
        actors[name] = { name, kind: 'creature', def: d, c, root: c.root };
      } else if (d.kind === 'object') {
        const o = built.objects?.[d.object || name];
        if (!o) throw new Error(`${setId}: object actor "${name}" not provided by the set builder`);
        actors[name] = { name, kind: 'object', def: d, root: o };
      } else throw new Error(`${setId}: actor "${name}" has unknown kind "${d.kind}"`);
      actors[name].root.visible = false;
      // an actor aboard something that moves (a sailor on the boat): its blocking is in the parent's frame
      if (d.parent) {
        const par = built.objects?.[d.parent];
        if (!par) throw new Error(`${setId}: actor "${name}" has parent "${d.parent}", which the set builder does not provide`);
        par.add(actors[name].root);
      }
    }));
    if (creaturesLib) S_poses = creaturesLib.poses;
    const fx = new FxRunner(ctx, { scene: ctx.scene, set: built, point: null });
    await fx.prepare(Object.values(shotSpecs));
    S = { ctx, table, shotSpecs, built, actors, fx, fxLib, posed: new Set(), states: {}, last: null, warned: new Set(), frameCache: new Map() };
    fx.api.point = (n, t) => S.env.point(n, t);
    S.env = makeEnv(S);
    if (fx.missing.size) console.warn(`[director] ${setId}: FX not built yet (drawn as nothing): ${[...fx.missing].join(', ')}`);
    ctx.shadows.key = null;
  }
  let S_poses = null;

  function makeEnv(S) {
    const v = new THREE.Vector3();
    const markP = (n) => S.built.marks?.[n] || null;
    const env = {
      // a mark, or another actor's starting place (for `face: 'remi'`)
      mark: (n) => {
        const m = markP(n);
        if (m) return m;
        const b = S.cur?.cast?.[n];
        if (b) {
          if (b.root) { const r = b.root[0][1]; return [r[0], r[1], r[2]]; }
          if (Array.isArray(b.at)) return b.at.length === 3 ? b.at : [b.at[0], 0, b.at[1]];
          if (typeof b.at === 'string') return markP(b.at);
        }
        const o = S.built.objects?.[n];
        if (o) return o.getWorldPosition(new THREE.Vector3()).toArray();
        // an actor who is not in this shot: where they usually are (spec.homes)
        if (spec.homes?.[n]) return spec.homes[n];
        return null;
      },
      ground: (x, z) => (S.built.ground ? S.built.ground(x, z) : 0),
      /** the world matrix of a set object or an actor root (camera mounts) */
      objectMatrix(name) {
        const o = S.built.objects?.[name] || S.actors[name]?.root;
        if (!o) return null;
        o.updateMatrixWorld(true);
        return o.matrixWorld;
      },
      /** blocking env for one actor: an actor aboard a parent walks on the parent's deck (builder.groundIn) */
      forActor(name) {
        const d = S.actors[name]?.def;
        if (!d?.parent) return env;
        return { ...env, ground: (x, z) => (S.built.groundIn ? S.built.groundIn(d.parent, x, z) : 0) };
      },
      /** a point in an actor's parent frame -> world */
      toWorld(name, v) {
        const d = S.actors[name]?.def;
        if (!d?.parent) return v;
        const par = S.built.objects[d.parent];
        par.updateMatrixWorld(true);
        return v.applyMatrix4(par.matrixWorld);
      },
      point(name, t) {
        if (name == null) return null;
        if (Array.isArray(name)) return new THREE.Vector3(...name);
        if (name.isVector3) return name.clone();
        const m = markP(name);
        if (m) return new THREE.Vector3(...m);
        const [an, ...rest] = String(name).split('.');
        const part = rest.join('.');
        const a = S.actors[an];
        if (a) {
          if (a.kind === 'object') return a.root.getWorldPosition(new THREE.Vector3());
          if (!S.posed.has(an)) {
            // not posed yet in this update: the blocking state's root + the rest-pose offset (pure)
            const st = S.states[an];
            if (st && a.kind === 'human') {
              const rig = humanRig(a.ch);
              const off = (part === 'head' || part === 'eye' || part === 'eyes') ? rig.head : part === 'chest' ? rig.pelvis.clone().lerp(rig.head, 0.55) : rig.pelvis;
              const o2 = off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), st.yaw);
              return env.toWorld(an, new THREE.Vector3(st.x + o2.x, st.y + o2.y, st.z + o2.z));
            }
            if (st) return env.toWorld(an, new THREE.Vector3(st.x, st.y + 0.5, st.z));
          }
          if (a.kind === 'human') {
            if (!part) return a.ch.bone('spine02').getWorldPosition(new THREE.Vector3());
            if (part === 'eye' || part === 'eyes') return a.ch.bone('eye.L').getWorldPosition(new THREE.Vector3()).add(a.ch.bone('eye.R').getWorldPosition(v)).multiplyScalar(0.5);
            const b = a.ch.bone(HUMAN_PARTS[part] || part);
            return b ? b.getWorldPosition(new THREE.Vector3()) : a.root.getWorldPosition(new THREE.Vector3());
          }
          if (a.kind === 'creature') {
            const c = a.c;
            const bi = (n) => c.boneIndex?.[n];
            let bn = part === 'eye' ? (bi('eye_L') !== undefined ? 'eye_L' : 'head') : (CREATURE_PARTS[part] || part || 'thorax');
            if (bi(bn) === undefined) bn = 'thorax';
            return c.bones[bi(bn)].getWorldPosition(new THREE.Vector3());
          }
        }
        const o = S.built.objects?.[name];
        if (o) return o.getWorldPosition(new THREE.Vector3());
        if (S.built.point) { const p = S.built.point(name, t); if (p) return p; }
        throw new Error(`[director] unknown point "${name}" (not a mark, actor, part or set object)`);
      },
      /** a pure, pose-free estimate of a point at shot time tt (framing solves, eye-lines across actors) */
      approxPoint(name, tt) {
        if (Array.isArray(name)) return new THREE.Vector3(...name);
        const m = markP(name);
        if (m) return new THREE.Vector3(...m);
        const [an, ...rest] = String(name).split('.');
        const part = rest.join('.');
        const a = S.actors[an], b = S.cur?.cast?.[an];
        if (a && b && a.kind !== 'object') {
          const st = actorState(b, tt, env.forActor(an));
          if (a.kind === 'human') {
            const rig = humanRig(a.ch);
            const P = st.posture;
            const drop = P.sit * (rig.pelvis.y - 0.55) + P.crouch * rig.legLen * 0.42 + P.kneel * rig.legLen * 0.5;
            const off = (part === 'head' || part === 'eye' || part === 'eyes') ? rig.head.clone() : part === 'chest' ? rig.pelvis.clone().lerp(rig.head, 0.55) : part.startsWith('hand') ? rig.pelvis.clone().add(new THREE.Vector3(0, 0.05, 0.25)) : part === 'feet' ? new THREE.Vector3(0, 0.05, 0) : rig.pelvis.clone().lerp(rig.head, 0.4);
            off.y -= drop * (part === 'feet' ? 0 : 1);
            if (part === 'head' || part === 'eye' || part === 'eyes') off.z += (P.bow + P.crouch * 0.45 + P.lean * 0.5) * 0.25;
            off.applyAxisAngle(new THREE.Vector3(0, 1, 0), st.yaw);
            return env.toWorld(an, new THREE.Vector3(st.x + off.x, st.y + off.y, st.z + off.z));
          }
          // creatures: from the size and the facing (head forward, chest middle)
          const L = a.c.L || a.def.length || 1;
          const fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
          const k = part === 'head' || part === 'eye' ? 0.42 : part === 'tail' ? -0.5 : part === 'hips' ? -0.12 : 0.05;
          const h = part === 'head' || part === 'eye' ? 0.16 : 0.1;
          const lift = b.acts?.length ? (b.acts[b.acts.length - 1][2]?.lift || 0) : 0;
          return new THREE.Vector3(st.x, st.y + L * h + lift, st.z).addScaledVector(fwd, L * k).add(new THREE.Vector3(...(a.def.approxOffset?.[part] || [0, 0, 0])));
        }
        return env.point(name, tt);
      },
      warnOnce(msg) { const k = `${S.cur?.job || ''}:${msg}`; if (!S.warned.has(k)) { S.warned.add(k); console.warn(`[director] ${S.cur?.job || ''}: ${msg}`); } },
      /** an actor's ground frame at shot time tt (pure: from the blocking, not from the posed root) */
      actorFrame(name, tt) {
        const a = S.actors[name], b = S.cur?.cast?.[name];
        if (a && b && a.kind !== 'object') { const st = actorState(b, tt, env.forActor(name)); return { pos: env.toWorld(name, new THREE.Vector3(st.x, st.y, st.z)), yaw: st.yaw }; }
        const p = env.point(name, tt);
        return { pos: p, yaw: a ? a.root.rotation.y : 0 };
      },
    };
    return env;
  }

  /** Pose the shot's cast for shot time tt (objects, creatures, then humans); returns the moving roots. */
  function poseCast(spec1, row, tt) {
    S.posed.clear(); S.states = {};
    const cast = spec1.cast || {};
    const names = Object.keys(cast);
    const order = (k) => (S.actors[k]?.kind === 'object' ? 0 : S.actors[k]?.kind === 'creature' ? 1 : 2);
    names.sort((a, b) => order(a) - order(b));
    for (const name of names) S.states[name] = actorState(cast[name], tt, S.env.forActor(name));
    const dynamic = [];
    for (const name of names) {
      const a = S.actors[name], b = cast[name], st = S.states[name];
      if (!a) continue;
      a.root.visible = actorVisible(b, tt);
      if (!a.root.visible) { S.posed.add(name); continue; }
      if (a.kind === 'human') {
        const mouth = row.dialogue?.length ? mouthAt(row.dialogue, a.def.role || name.toUpperCase(), tt) : 0;
        poseHuman(a.ch, st, tt, S.env, { idle: b.idle, armSwing: b.armSwing ?? a.def.armSwing, mouth, role: a.def.role, placed: row.dialogue, shot: row.job });
      } else if (a.kind === 'creature') {
        poseCreature(a.c, S_poses, st, tt, { look: b.lookPose ? b.lookPose : null, defaults: b.poseDefaults });
        placeCreature(a, b, tt);
      } else if (a.kind === 'object') {
        if (b.at) { const p = Array.isArray(b.at) && b.at.length === 3 ? b.at : null; if (p) a.root.position.set(...p); }
        if (b.rot) a.root.rotation.set(...b.rot.map((x) => x * Math.PI / 180));
        a.root.updateMatrixWorld(true);
      }
      S.posed.add(name);
      if (a.kind !== 'object' || b.dynamic) dynamic.push(a.root);
    }
    return dynamic;
  }

  /**
   * Creature placement after the pose: `anchor` { part, to (point / name / keys), offset } moves the
   * root so that body part lands on the target (a snout at the egg's opening, a head on a path);
   * `settle` (true | { parts: [[bone, clearance m], ...], lift: true }) puts the body down on the
   * set's ground (the lowest listed part at its clearance; lift: only ever raise it).
   */
  function placeCreature(a, b, tt) {
    const c = a.c;
    const bp = (n) => { const i = c.boneIndex?.[CREATURE_PARTS[n] || n]; return i === undefined ? null : c.bones[i].getWorldPosition(new THREE.Vector3()); };
    if (b.anchor) {
      const part = bp(b.anchor.part || 'head');
      const to = resolvePoint(b.anchor.to, tt, S.env);
      if (part && to) {
        if (b.anchor.offset) to.add(new THREE.Vector3(...keyed(tt, b.anchor.offset)));
        c.root.position.add(to.sub(part));
        c.root.updateMatrixWorld(true);
      }
    }
    if (b.settle) {
      const parts = b.settle.parts || [['head', 0.03], ['thorax', 0.045], ['lumbar', 0.04]];
      let d = -Infinity;
      for (const [n, cl] of parts) { const p = bp(n); if (p) d = Math.max(d, S.env.ground(p.x, p.z) + cl - p.y); }
      if (Number.isFinite(d)) {
        if (b.settle.lift) d = Math.max(0, d);
        c.root.position.y += d;
        c.root.updateMatrixWorld(true);
      }
    }
  }

  function update(t, ctx) {
    // review mode (--fps 1 or 2): frame k shows shot k at its middle (or spec.reviewAt), so a whole
    // set can be checked as a contact sheet in one job (render with --cinematic preview)
    if (ctx.fps <= 2) {
      const n = S.table.shots.length;
      const k = Math.max(0, Math.min(n - 1, Math.round(t)));
      const row = S.table.shots[k];
      const ra = S.shotSpecs[row.job]?.reviewAt ?? 0.5;
      const f24 = row.start_frame + Math.min(row.frames - 1, Math.round(row.frames * ra));
      const save = ctx.frame, saveFps = ctx.fps;
      ctx.frame = f24; ctx.fps = 24;
      try { return update(f24 / 24, ctx); } finally { ctx.frame = save; ctx.fps = saveFps; }
    }
    const sel = shotAt(S.table.shots, ctx.frame, t, ctx.fps);
    const row = sel.shot, local = sel.local;
    const spec1 = S.shotSpecs[row.job];
    S.cur = spec1; spec1.job = row.job;
    const dur = row.frames / ctx.fps;
    const cont = continuityFor(setId, row.scene, row.job);
    // the set: light, weather, shot state (before the cast: actors may stand on set pieces)
    const info = { row, spec: spec1, local, u: sel.u, dur, cont, t, ctx, env: S.env };
    S.built.applyShot?.(info);
    const cast = spec1.cast || {};
    for (const [name, a] of Object.entries(S.actors)) if (!(name in cast)) a.root.visible = false;
    // a static framed camera is solved on the subjects' EXACT posed positions at frame.at: pose the
    // cast at that time once per shot (pure: depends only on the shot and frame.at), remember the
    // subject points, then pose for this frame
    const fr = spec1.cam?.frame;
    if (fr && !fr.track && !S.frameCache.has(row.job)) {
      const at = fr.at ?? 0;
      poseCast(spec1, row, at);
      const pts = {};
      for (const [n] of fr.subjects) { const p = S.env.point(n, at); pts[n] = p ? p.toArray() : null; }
      S.frameCache.set(row.job, pts);
    }
    const dynamic = poseCast(spec1, row, local);
    // per-shot custom beats (the egg cracking, a hand under a cloth, ...)
    if (spec1.custom) spec1.custom({ ...info, actors: S.actors, set: S.built, THREE }, local);
    S.built.afterCast?.(info, S.actors);
    // camera, lens, focus
    if (!spec1.cam) throw new Error(`[director] shot ${row.job} has no cam in its spec`);
    const fc = S.frameCache.get(row.job);
    const camEnv = fc ? { ...S.env, approxPoint: (n, tt) => (fc[n] ? new THREE.Vector3(...fc[n]) : S.env.point(n, tt)) } : { ...S.env, approxPoint: (n, tt) => S.env.point(n, tt) };
    evalCamera(spec1.cam, local, sel.u, ctx, camEnv, dur);
    // effects
    S.fx.update(spec1, local, S.env, { shot: row.job, u: sel.u, camera: ctx.camera });
    // exposure (continuity + the shot's own trim), shadows: the set is static within a shot
    if (ctx.cinematic?.grade) ctx.cinematic.grade.exposure = (cont.exposure ?? 0) + (spec1.exposure ?? 0);
    ctx.shadows.key = `${row.job}|${JSON.stringify(spec1.set || {})}`;
    ctx.shadows.dynamic = [...dynamic, ...S.fx.dynamic, ...(S.built.dynamic?.(info) || [])];
    S.built.afterCamera?.(info);
  }

  return { meta, setup, update, get state() { return S; } };
}
