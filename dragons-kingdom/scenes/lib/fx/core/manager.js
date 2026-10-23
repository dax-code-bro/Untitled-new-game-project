// FX library - the manager: shared resources (tier, light rig, noise volume, groups) and the
// list of live effects. scenes/lib/fx/index.js wraps it into the public API.
import * as THREE from 'three';
import { resolveTier } from './tier.js';
import { LightRig } from './light.js';
import { noiseVolume } from './noise.js';
import { arr3, resolveAt } from './util.js';

export class FxManager {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.THREE = THREE;
    this.tier = resolveTier(ctx, o.tier);
    this.light = new LightRig(ctx);
    this.noise = noiseVolume(this.tier.noise3D, o.noiseSeed ?? 7);
    this.group = new THREE.Group();
    this.group.name = 'fx';
    if (o.addToScene !== false) ctx.scene.add(this.group);
    this.effects = [];
    this.api = o.api || null;           // director api (point(name, t))
    this.ground = typeof o.ground === 'function' ? o.ground : (o.ground != null ? () => o.ground : () => 0);
    this.wind = arr3(o.wind, [0, 0, 0]);
    this.stamp = null;
    this.focus = null;
    this.t = 0;
  }

  /** Shutter interval [ta, tb] around t (the camera's exposure; sub-frames get their slice). */
  shutter(t) {
    const ctx = this.ctx;
    const ang = ctx.lens?.shutterAngle ?? 180;
    const fps = ctx.fps || 24;
    let T = (ang / 360) / fps;
    const sub = ctx.subframe;
    if (sub && sub.count > 1) T /= sub.count;
    return [t - T / 2, t + T / 2];
  }

  /** World position of an "at" spec at time t (see util.resolveAt). */
  at(spec, t) { return resolveAt(spec, t, THREE, this.api); }

  add(effect) {
    this.effects.push(effect);
    if (effect.object) this.group.add(effect.object);
    return effect;
  }
  remove(effect) {
    const i = this.effects.indexOf(effect);
    if (i >= 0) this.effects.splice(i, 1);
    if (effect.object?.parent) effect.object.parent.remove(effect.object);
    effect.dispose?.();
  }

  /** Re-read the lights once per drawn (sub-)frame. */
  prepare(t) {
    const ctx = this.ctx;
    const s = `${ctx.frame}|${ctx.subframe ? ctx.subframe.index + ':' + ctx.subframe.kind : ''}|${t}`;
    if (s === this.stamp) return;
    this.stamp = s;
    this.light.update(this.focus);
  }

  /** Update every effect for time t (call after posing the scene and placing the camera). */
  update(t) {
    this.t = t;
    this.prepare(t);
    const cam = this.ctx.camera;
    for (const e of this.effects) e.update(t, cam);
  }

  /** Objects that move and cast shadows (for ctx.shadows.dynamic). */
  get dynamic() {
    const out = [];
    for (const e of this.effects) if (e.dynamic) out.push(...e.dynamic);
    return out;
  }
}

/**
 * Base class for effects: a time window [t0 - pre, t0 + life], an object (group), layers that
 * are begun / ended around the effect's own update.
 */
export class Effect {
  constructor(fx, o = {}) {
    this.fx = fx;
    this.o = o;
    this.t0 = o.t0 ?? 0;
    this.seed = o.seed ?? 1;
    this.object = new THREE.Group();
    this.object.name = o.name || this.constructor.name;
    this.layers = [];
    this.casters = [];           // moving shadow casters (ctx.shadows.dynamic)
    this.enabled = true;
  }
  get dynamic() { return this.casters; }
  layer(l) {
    this.layers.push(l); this.object.add(l.mesh);
    if (l.shadowTwin) { this.object.add(l.shadowTwin); this.casters.push(l.shadowTwin); }
    else if (l.mesh.castShadow) this.casters.push(l.mesh);
    return l;
  }
  /** override: draw for time t */
  draw(t, cam) {}
  update(t, cam) {
    for (const l of this.layers) l.begin();
    if (this.enabled) this.draw(t, cam);
    for (const l of this.layers) l.end(cam);
  }
  dispose() { for (const l of this.layers) l.dispose(); }
}
