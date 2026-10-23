// FX library - the shot director's cue kinds (scenes/lib/director/fx.js loads them through
// index.js -> registerDirectorFx). A shot spec cues an effect like
//
//   fx: [{ kind: 'blood-spray', id: 'scout', from: 2.1, to: null, at: 'scout.wing.L',
//          params: { dir: [0, 0.3, -1], amount: 1.2 } }]
//
// - every kind maps onto one library call (DIRECTOR_KINDS below; `params` are that call's options
//   verbatim, see README.md), with t0 = 0 at the cue's `from` (params.t0 offsets it);
// - `at` (cue.at or params.at): [x,y,z], a set mark, a set object, or an actor point
//   ('remi.hand.R', 'scout.wing.L'). Marks / set objects / arrays are fixed at setup; an actor
//   point follows the director's pure blocking estimate (env.approxPoint) at every time an
//   effect asks for (drop launches, plume paths), so every frame comes out the same in any
//   order - for an exact attachment to a bone pass params.actor (fire from a mouth, gore);
// - effects that need an actor's body (gore appliances, decals on skin / scales / cloth) take
//   params.actor and need the director to hand actors to FX factories (api.actor(name) ->
//   { kind, c (creature) | ch (character), root }); without it they draw nothing and warn;
// - one FX manager serves all the director's cues (cached on ctx.__dkFxDirector), separate from
//   a set's own createFx() manager.
import { captureByName } from './destruction.js';

const STATIC_ONLY = new Set(['debris-burst', 'debris-collapse', 'debris-boards', 'debris-turf', 'debris-roofline', 'debris-object', 'debris-sweep']);
// a set object by name (api.set.objects) or the object itself
const setObject = (api, n) => (n && typeof n === 'object' ? n : api.set?.objects?.[n] || null);

function arr(v) { return v && (Array.isArray(v) ? v : v.isVector3 ? [v.x, v.y, v.z] : null); }

/** The kinds: name -> { about, cost (extra s per draft frame), make(fx, params, who) }. */
export const DIRECTOR_KINDS = {
  // blood
  'blood-spray': { about: 'arterial / impact blood spray with drops, mist and the stains they leave', cost: 0.4, make: (fx, p) => fx.blood.spray(p) },
  'blood-drip': { about: 'blood dripping from a wound / an edge, splashing below', cost: 0.1, make: (fx, p) => fx.blood.drip(p) },
  'blood-pool': { about: 'a spreading pool of blood on the ground', cost: 0.15, make: (fx, p) => fx.blood.pool(p) },
  'blood-decal': { about: 'blood on a surface: params.kind coat|splat|spatter|stamps|run|smear|soak (params.actor / params.object targets)', cost: 0.2, make: (fx, p, who) => fx.blood.decal({ ...p, target: who.mesh(p) }) },
  'blood-water': { about: 'blood clouding into sea / river water', cost: 0.2, make: (fx, p) => fx.blood.water(p) },
  // dust
  'dust-downwash': { about: 'a dragon\'s wingbeat downwash: rolling ground dust (takeoff / landing)', cost: 1.2, make: (fx, p) => fx.dust.downwash(p) },
  'dust-cloud': { about: 'a dust cloud from an impact / collapse', cost: 0.8, make: (fx, p) => fx.dust.cloud(p) },
  'dust-haze': { about: 'settling dust haze in a box', cost: 0.5, make: (fx, p) => fx.dust.haze(p) },
  // debris (need fixed positions: arrays, marks or set objects)
  'debris-burst': { about: 'timber / tile / plaster / stone fragments blasted from a point', cost: 0.3, make: (fx, p) => fx.debris.burst(p) },
  'debris-collapse': { about: 'a wall / roof section collapsing into fragments', cost: 0.4, make: (fx, p) => fx.debris.collapse(p) },
  'debris-boards': { about: 'boards / planks thrown (stalls, shutters)', cost: 0.2, make: (fx, p) => fx.debris.boards(p) },
  'debris-turf': { about: 'turf, clods and stones torn up by claws / a takeoff', cost: 0.3, make: (fx, p) => fx.debris.turf(p) },
  'debris-roofline': {
    about: 'the set\'s own roof section coming down (params.capture: the name given to fx.debris.damageCapture when the set was built with the hole; params.set: set object / group to match the tiles to; impact, dir, speed)', cost: 0.6,
    make: (fx, p, who, api) => {
      const capture = typeof p.capture === 'string' ? captureByName(p.capture) : p.capture;
      if (!capture) { console.warn(`[fx] debris-roofline: no damage capture "${p.capture}" (build the set with fx.debris.damageCapture(region, { name }).damage)`); return null; }
      return fx.debris.roofline({ ...p, capture, set: setObject(api, p.set) || api.set?.group || api.scene });
    },
  },
  'debris-object': {
    about: 'a whole set prop thrown by the blast (params.object: set object name; dir, speed, spin; topples over its edge if standing)', cost: 0.1,
    make: (fx, p, who, api) => { const object = setObject(api, p.object); if (!object) { console.warn(`[fx] debris-object: no set object "${p.object}"`); return null; } return fx.debris.object({ ...p, object }); },
  },
  'debris-sweep': {
    about: 'a set prop swept by the blast and coming apart into its loose parts (the vendor\'s stall, 3C-12; params.object, dir, speed)', cost: 0.2,
    make: (fx, p, who, api) => { const object = setObject(api, p.object); if (!object) { console.warn(`[fx] debris-sweep: no set object "${p.object}"`); return null; } return fx.debris.sweep({ ...p, object }); },
  },
  // smoke and fire
  'smoke-plume': { about: 'a smoke column (wood fire, chimney, smoulder, soot, steam)', cost: 0.6, make: (fx, p) => fx.smoke.plume(p) },
  'smoke-trail': { about: 'smoke streaming from a moving burning thing', cost: 0.5, make: (fx, p) => fx.smoke.trail(p) },
  'smoke-wisp': { about: 'a thin wisp (pipe, herb bundle, snuffed lamp)', cost: 0.1, make: (fx, p) => fx.smoke.wisp(p) },
  'fire-jet': { about: 'dragon fire (params.palette standard|leaf) with light, embers, soot, heat shimmer, scorch', cost: 1.5, make: (fx, p, who) => fx.fire.jet({ ...p, creature: who.creature(p) || p.creature }) },
  'fire-burn': { about: 'a burning object / cloth / thatch: flames, light, smoke', cost: 0.8, make: (fx, p) => fx.fire.burn(p) },
  'embers': { about: 'drifting embers', cost: 0.1, make: (fx, p) => fx.fire.embers(p) },
  'heat-shimmer': { about: 'heat haze over a fire / hot ground', cost: 0.2, make: (fx, p) => fx.fire.shimmer(p) },
  'scorch': { about: 'scorch / char marks on a surface', cost: 0.1, make: (fx, p, who) => fx.fire.scorch({ ...p, target: who.mesh(p) }) },
  // water
  'water-splash': { about: 'a body hitting water: crown, sheet, jet, mist, foam', cost: 0.8, make: (fx, p) => fx.water.splash(p) },
  'water-spray': { about: 'wind-blown spray / a wingtip slap', cost: 0.4, make: (fx, p) => fx.water.spray(p) },
  'water-foam': { about: 'a foam patch on the water', cost: 0.1, make: (fx, p) => fx.water.foam(p) },
  'water-trail': { about: 'a foam trail behind something moving in water', cost: 0.1, make: (fx, p) => fx.water.trail(p) },
  'water-churn': { about: 'thrashing in water: churned spray and foam', cost: 0.6, make: (fx, p) => fx.water.churn(p) },
  'water-downwash': { about: 'wingbeat downwash on water: rings, spray sheet, mist', cost: 0.8, make: (fx, p) => fx.water.downwash(p) },
  // gore (need api.actor)
  'gore-wing-root': { about: 'the scout\'s torn wing root (params.actor, side, bleed...)', cost: 0.3, needs: 'creature', make: (fx, p, who) => fx.gore.wingRoot({ ...p, creature: who.creature(p) }) },
  'gore-fracture': { about: 'an open fracture below the knee through torn clothing (params.actor, side)', cost: 0.2, needs: 'character', make: (fx, p, who) => fx.gore.openFracture({ ...p, character: who.character(p) }) },
  'gore-scalp': { about: 'a split scalp with blood down the face (params.actor, side)', cost: 0.1, needs: 'character', make: (fx, p, who) => fx.gore.scalp({ ...p, character: who.character(p) }) },
  'gore-burned-rider': { about: 'burned clothing and skin after dragon fire (params.actor, side, burnTime, neck)', cost: 0.2, needs: 'character', make: (fx, p, who) => fx.gore.burnedRider({ ...p, character: who.character(p) }) },
  // cloth, sparks, ash
  'cloth-banner': { about: 'a banner torn loose / ripped / flogging in a dragon\'s wake', cost: 0.2, make: (fx, p) => fx.cloth.banner(p) },
  'cloth-drape': { about: 'a cloth lying over a body or shapes', cost: 0.1, make: (fx, p) => fx.cloth.drape(p) },
  'sparks': { about: 'sparks off steel / stone, or knocked from a burning beam', cost: 0.05, make: (fx, p) => fx.sparks.burst(p) },
  'ash-fall': { about: 'ash and soot flakes drifting down after the fire', cost: 0.2, make: (fx, p) => fx.ash.fall(p) },
};

/**
 * Register every kind with the director (registerFx from scenes/lib/director/fx.js);
 * createFx is index.js's (passed in to keep the module graph acyclic).
 */
export function registerDirectorKinds(registerFx, createFx) {
  for (const [kind, def] of Object.entries(DIRECTOR_KINDS)) {
    registerFx(kind, (ctx, api) => makeInstance(kind, def, ctx, api, createFx), { about: def.about, cost: def.cost, from: 'scenes/lib/fx' });
  }
}

async function makeInstance(kind, def, ctx, api, createFx) {
  const cue = api.cue || {};
  const THREE = api.THREE;
  let fx = ctx.__dkFxDirector;
  if (!fx) {
    const keep = ctx.__dkFx;
    fx = await createFx(ctx, { fresh: true, tier: ctx.meta?.fxTier, ground: api.set?.ground || 0, wind: api.set?.wind || [0, 0, 0] });
    ctx.__dkFx = keep;               // (the set's own manager, if any, stays the default)
    ctx.__dkFxDirector = fx;
  }
  const params = { ...(cue.params || {}) };
  const L = { env: null, from: cue.from ?? 0 };
  // fixed points (marks, set objects, arrays) are resolved now; actor points follow the cast
  const fixed = (n) => {
    if (n == null) return null;
    const a = arr(n); if (a) return a;
    if (typeof n === 'function' || typeof n === 'object') return null;
    const m = api.set?.marks?.[n]; if (m) return m.length === 2 ? [m[0], 0, m[1]] : m;
    const o = api.set?.objects?.[n];
    if (o) { o.updateWorldMatrix(true, false); return arr(o.getWorldPosition(new THREE.Vector3())); }
    return null;
  };
  const atName = cue.at ?? params.at;
  let atSpec = fixed(atName);
  let lazy = false;
  if (!atSpec && atName != null) {
    if (typeof atName === 'function' || (typeof atName === 'object' && !Array.isArray(atName))) atSpec = atName;
    else {
      lazy = true;
      atSpec = (te) => {
        const env = L.env;
        if (!env) return [0, 0, 0];
        const tt = te + L.from;
        // (env.point reads the cast as posed for the CURRENT frame whatever time is asked; effects
        // evaluate their sources at many past times, so they follow the pure blocking estimate)
        const p = env.approxPoint ? env.approxPoint(atName, tt) : env.point(atName, tt);
        return arr(p) || [0, 0, 0];
      };
    }
  }
  if (atSpec) params.at = atSpec;
  if (params.t0 == null) params.t0 = 0;
  if (lazy && STATIC_ONLY.has(kind)) {
    console.warn(`[fx] ${kind}: debris needs a fixed position (an [x,y,z], a set mark or a set object), not "${atName}" - drawn as nothing`);
    return null;
  }
  // actors (gore, decals on bodies, fire from a creature's mouth)
  const actorOf = (p) => (p.actor != null ? (api.actor?.(p.actor) || api.actors?.[p.actor] || null) : null);
  const who = {
    creature: (p) => { const a = actorOf(p); return a ? (a.c || a.creature || null) : null; },
    character: (p) => { const a = actorOf(p); return a ? (a.ch || a.character || null) : null; },
    mesh: (p) => {
      if (p.target) return p.target;
      if (p.object && api.set?.objects?.[p.object]) return api.set.objects[p.object];
      const a = actorOf(p);
      if (!a) return p.plane ? null : undefined;
      return a.root || null;
    },
  };
  if (def.needs && !(def.needs === 'creature' ? who.creature(params) : who.character(params))) {
    console.warn(`[fx] ${kind}: needs params.actor and the director's api.actor(name) (REQUEST director) - drawn as nothing`);
    return null;
  }
  let effects = [];
  const build = async () => {
    const n0 = fx.effects.length;
    await def.make(fx, params, who, api);
    effects = fx.effects.slice(n0);
    for (const e of effects) e.object.visible = false;
  };
  const buildSync = () => {
    const n0 = fx.effects.length;
    def.make(fx, params, who, api);
    effects = fx.effects.slice(n0);
  };
  if (!lazy) await build();
  const dynamic = [];
  for (const e of effects) if (e.dynamic) dynamic.push(...e.dynamic);
  let built = !lazy;
  return {
    dynamic,
    setActive(on) { for (const e of effects) { e.object.visible = on; e.enabled = on; if (!on) e.restore?.(); } },
    update(local, c, env, info) {
      L.env = env; L.from = c?.from ?? L.from;
      if (!built) { buildSync(); built = true; for (const e of effects) { e.object.visible = true; e.enabled = true; } }
      for (const e of effects) fx.updateOne(e, local);
    },
  };
}
