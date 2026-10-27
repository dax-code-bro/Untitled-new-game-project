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
import { mouthAt, speakerAt } from './dialogue.js';
import { faceReadability } from './audit.js';

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
    // planted feet (humans library: performance track) for the shots / actors that ask for them:
    // `legs: 'planted'` on a shot, an actor of a shot, or the spec's defaults
    const wantsPlanted = Object.values(spec.shots || {}).some((s) => (s.legs ?? spec.defaults?.legs) === 'planted' || Object.values(s.cast || {}).some((c) => c?.legs === 'planted'));
    if (wantsPlanted && humansLib?.registerDirectorHooks) await humansLib.registerDirectorHooks({ legs: true });
    if ([...used].some((a) => castDef[a]?.kind === 'creature')) creaturesLib = await import('../creatures/index.js');
    await Promise.all([...used].map(async (name) => {
      const d = castDef[name];
      if (!d) throw new Error(`${setId}: actor "${name}" is used by a shot but not in spec.cast`);
      if (d.kind === 'human' && d.ride) {
        // a RIDER: a seated build (remi_ride, abby_ride, fall_ride, scout_ride, abby_ride_injured)
        // mounted on a creature of the cast after everyone is loaded (saddle fitted to its back,
        // straddle fitted to its body, grab bar, stirrups: creatures library rider.js)
        const ride = typeof d.ride === 'string' ? { on: d.ride } : { ...d.ride };
        const human = await humansLib.loadHuman({ ids: [d.id] });
        const rider = humansLib.createRider(human, { id: d.id, outfit: d.outfit || name, lean: ride.lean, reach: ride.reach });
        rider.root.name = `actor:${name}`;
        humanRig(rider.character);
        actors[name] = { name, kind: 'human', def: d, ch: rider.character, root: rider.root, rider, ride };
      } else if (d.kind === 'human') {
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
    // riders onto their mounts (one saddle per creature, fitted once; shown in the shots that seat
    // someone on it or ask for it with `tack: true` on the creature's cast entry)
    for (const a of Object.values(actors)) {
      if (!a.ride) continue;
      const m = actors[a.ride.on];
      if (!m || m.kind !== 'creature') throw new Error(`${setId}: rider "${a.name}" rides "${a.ride.on}", which is not a creature in this set's shots`);
      if (!m.tack) m.tack = creaturesLib.createSaddle(m.c, m.def.tack || {});
      a.mount = creaturesLib.mountRider(m.c, m.tack, a.rider, { raise: a.ride.raise });
      a.rider.root.visible = false;
    }
    // FX factories get the cast too (the FX library's gore / decals / fire from a mouth take
    // params.actor: api.actor(name) -> { kind, c (creature) | ch (character), root })
    const fx = new FxRunner(ctx, { scene: ctx.scene, set: built, point: null, actors, actor: (n) => actors[n] || null });
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
          if (!S.posed.has(an) && !a.ride) {
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
        if (a?.ride) return env.point(name, tt);          // a rider sits where its mount's pose puts it
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
        if (S.actors[name]?.ride) return env.actorFrame(S.actors[name].ride.on, tt);
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
      if (a.ride) {
        // seated on its mount (posed before the humans): idle + the straddle fit; no blocking root
        if (!cast[a.ride.on]) throw new Error(`[director] ${row.job}: rider "${name}" is cast without its mount "${a.ride.on}"`);
        a.rider.update(tt, b.idle || {});
        S.posed.add(name);
        continue;
      }
      if (b.nearTo) placeNear(st, b.nearTo, tt);
      if (a.kind === 'human') {
        const mouth = row.dialogue?.length ? mouthAt(row.dialogue, a.def.role || name.toUpperCase(), tt) : 0;
        const planted = (b.legs ?? spec1.legs) === 'planted';
        const stateAt = planted ? (t2) => { const s2 = actorState(b, t2, S.env.forActor(name)); if (b.nearTo) placeNear(s2, b.nearTo, t2); return s2; } : undefined;
        poseHuman(a.ch, st, tt, S.env, { idle: b.idle, armSwing: b.armSwing ?? a.def.armSwing, armsDown: b.armsDown ?? a.def.armsDown, mouth, role: a.def.role, placed: row.dialogue, shot: row.job, plantedFeet: planted, stateAt, seconds: (row.frames + (row.post || 0)) / 24 });
      } else if (a.kind === 'creature') {
        if (a.tack) { const on = b.tack === true || names.some((n) => S.actors[n]?.ride?.on === name && actorVisible(cast[n], tt)); for (const m of a.tack.meshes || []) m.visible = on; }
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
   * `nearTo: { to: 'leaf.head', dist: 0.5, from: 270, face: true }` puts an actor's root `dist` metres
   * from a POSED point (actors are posed objects -> creatures -> humans, so a person can stand at a
   * dragon's real head, foot or wing joint), on the side given by `from` (heading from the point to
   * the actor), facing the point. Pure: the point is posed for this same t.
   */
  function placeNear(st, o, tt) {
    const p = S.env.point(o.to, tt);
    if (!p) return;
    const a = ((o.from ?? 180) * Math.PI) / 180, d = o.dist ?? 0.6;
    st.x = p.x + Math.sin(a) * d; st.z = p.z - Math.cos(a) * d;
    st.y = S.env.ground(st.x, st.z);
    if (o.face !== false) st.yaw = Math.atan2(p.x - st.x, p.z - st.z) + ((o.turn ?? 0) * Math.PI) / 180;
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
    // cam.debug: print the solved camera and the subjects' posed points once per shot (framing checks)
    if (spec1.cam.debug) {
      const r3 = (v) => v.toArray().map((x) => +x.toFixed(2));
      const names = [...(fr?.subjects || []).map(([n]) => n), ...(Array.isArray(spec1.cam.debug) ? spec1.cam.debug : [])];
      const subj = Object.fromEntries(names.map((n) => { try { return [n, r3(S.env.point(n, local))]; } catch { return [n, null]; } }));
      S.env.warnOnce(`debug: camera ${JSON.stringify(r3(ctx.camera.position))} subjects ${JSON.stringify(subj)}`);
    }
    // the speaking-face audit (realism strategy): until lip-sync exists a speaking face must be soft,
    // turned (profile or further), small or backlit; the first frame of a shot that breaks it is reported
    try { faceAudit(row, local); } catch { /* an audit never stops a render */ }
    // effects
    S.fx.update(spec1, local, S.env, { shot: row.job, u: sel.u, camera: ctx.camera });
    // exposure (continuity + the shot's own trim), shadows: the set is static within a shot
    if (ctx.cinematic?.grade) ctx.cinematic.grade.exposure = (cont.exposure ?? 0) + (info.exposureTrim ?? 0) + (spec1.exposure ?? 0);
    ctx.shadows.key = `${row.job}|${JSON.stringify(spec1.set || {})}`;
    ctx.shadows.dynamic = [...dynamic, ...S.fx.dynamic, ...(S.built.dynamic?.(info) || [])];
    S.built.afterCamera?.(info);
  }

  /**
   * Speaking-face audit: for the actor speaking at shot time t (placed dialogue), the angle between the
   * face's forward direction (head bone -> mid-eyes) and the lens, the face height as a fraction of the
   * frame height and the defocus blur (circle of confusion) as a fraction of the frame height. A face
   * turned less than 70 deg from the lens, taller than 6 % of the frame and sharper than 0.6 % blur reads
   * as a talking face with a still mouth: reported once per shot and actor (console + S.faceAudit).
   */
  function faceAudit(row, t) {
    if (!row.dialogue?.length) return;
    const role = speakerAt(row.dialogue, t);
    if (!role) return;
    const cam = S.ctx.camera, L = S.ctx.lens || {};
    for (const [name, a] of Object.entries(S.actors)) {
      if (a.kind !== 'human' || !a.root.visible || (a.def.role || name.toUpperCase()) !== role) continue;
      const head = a.ch.bone('head')?.getWorldPosition(new THREE.Vector3());
      const eL = a.ch.bone('eye.L'), eR = a.ch.bone('eye.R');
      if (!head || !eL || !eR) continue;
      const eyes = eL.getWorldPosition(new THREE.Vector3()).add(eR.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      const fwd = eyes.clone().sub(head).normalize();
      const toCam = cam.position.clone().sub(eyes);
      const dist = toCam.length();
      toCam.normalize();
      const ndc = eyes.clone().project(cam);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.02 || Math.abs(ndc.y) > 1.02) continue;
      const m = faceReadability(fwd.toArray(), toCam.toArray(), dist, { focalLength: L.focalLength, fstop: L.fstop, focus: L.focus, sensor: L.sensor });
      const ang = m.angle, faceFrac = m.faceFrac, cocFrac = m.blurFrac, flag = m.readable;
      const rec = { shot: row.job, role, t: +t.toFixed(2), angle: Math.round(ang), face: +(faceFrac * 100).toFixed(1), blur: +(cocFrac * 100).toFixed(2), flag };
      S.faceAudit = S.faceAudit || {};
      const k = `${row.job}:${role}`, prev = S.faceAudit[k];
      if (!prev || (rec.flag && !prev.flag) || (rec.flag === prev.flag && rec.face - rec.angle / 10 > prev.face - prev.angle / 10)) S.faceAudit[k] = rec;
      if (flag) S.env.warnOnce(`speaking face reads: ${role} ${rec.angle} deg from the lens, ${rec.face}% of frame height, blur ${rec.blur}% (soften, turn, shrink or backlight it until lip-sync exists)`);
    }
  }

  return { meta, setup, update, get state() { return S; } };
}
