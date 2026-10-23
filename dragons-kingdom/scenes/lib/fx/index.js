// Dragon's Kingdom FX library - blood, gore, burns, dust, debris, destruction, smoke, fire,
// water, sparks, ash, cloth. See README.md in this folder.
//
//   import { createFx } from '../lib/fx/index.js';
//   // setup(ctx):
//   const fx = await createFx(ctx, { tier: 'auto', ground: 0, wind: [1, 0, 0] });
//   fx.dust.downwash({ at: [0, 0, 0], t0: 1.0, bursts: [0, 0.9, 1.8], radius: 30 });
//   fx.blood.spray({ at: () => jaw.getWorldPosition(v), dir: [0, 0.3, -1], t0: 2.1 });
//   // update(t, ctx): after posing everything and placing the camera
//   fx.update(t);
//
// Every effect is a pure function of t (closed-form motion or a deterministic pre-simulation
// run once in setup), so frames can be drawn in any order, in any browser, on any machine.
// Quality tiers (core/tier.js) scale counts and resolutions, never the look.
import { FxManager } from './core/manager.js';
import { dustApi } from './dust.js';
import { bloodApi } from './blood.js';
import { DecalEffect } from './core/decal.js';
import { debrisApi } from './debris.js';
import { damageCapture, roofline, ThrownObject, splitObject, sweepObject } from './destruction.js';
import { smokeApi } from './smoke.js';
import { fireApi } from './fire.js';
import { waterApi } from './water.js';
import { goreApi } from './gore.js';
import { clothApi } from './cloth.js';
import { sparksApi, ashApi } from './sparks.js';
import { registerDirectorKinds } from './director.js';

export { FxManager, Effect } from './core/manager.js';
export { ParticleLayer } from './core/particles.js';
export { ShadowGrid } from './core/shadowgrid.js';
export { TIERS, resolveTier } from './core/tier.js';
export { DecalEffect, DECAL_LIQUIDS, projectorFrame, projectOnMesh } from './core/decal.js';
export { DUST_COLORS } from './dust.js';
export { BLOOD_COLOR, bloodTint } from './blood.js';
export { DebrisEffect, solvePiece, poseAt, PileField, prepWalls } from './debris.js';
export { damageCapture, roofline, ThrownObject, splitObject, sweepObject } from './destruction.js';
export { SmokePlume, SmokeWisp, SMOKE_KINDS } from './smoke.js';
export { FireJet, FireBurn, Embers, Shimmer, FIRE_PALETTES } from './fire.js';
export { ClothHole, attachToBone, surfaceHit } from './gore.js';
export { ClothEffect, simulateCloth, fabricMaterial, bodyColliders } from './cloth.js';
export { DIRECTOR_KINDS } from './director.js';
export { Sparks, AshFall } from './sparks.js';

/** Create the FX manager for this scene (one per scene; cached on ctx). */
export async function createFx(ctx, o = {}) {
  if (ctx.__dkFx && !o.fresh) return ctx.__dkFx;
  const fx = new FxManager(ctx, o);
  fx.dust = dustApi(fx);
  fx.blood = bloodApi(fx);
  fx.decal = (opts) => fx.add(new DecalEffect(fx, opts));
  fx.debris = debrisApi(fx);
  // the Cling set's own roofline coming down, whole props thrown (destruction.js)
  fx.debris.damageCapture = (region, opts) => damageCapture(region, opts);
  fx.debris.roofline = (opts = {}) => roofline(fx, opts, { library: fx.debris.library });
  fx.debris.object = (opts = {}) => fx.add(new ThrownObject(fx, opts));
  fx.debris.sweep = (opts = {}) => sweepObject(fx, opts);
  fx.debris.split = (object, opts) => splitObject(object, opts);
  fx.smoke = smokeApi(fx);
  fx.fire = fireApi(fx);
  fx.water = waterApi(fx);
  fx.gore = goreApi(fx);
  fx.cloth = clothApi(fx);
  fx.sparks = sparksApi(fx);
  fx.ash = ashApi(fx);
  ctx.__dkFx = fx;
  return fx;
}

/**
 * The shot director's hook (scenes/lib/director/fx.js loadFxLibrary): registers every FX cue kind
 * (blood-spray, dust-downwash, debris-collapse, fire-jet, water-splash, gore-wing-root, ...; see
 * director.js / README.md).
 */
export function registerDirectorFx(registerFx) { registerDirectorKinds(registerFx, createFx); }
