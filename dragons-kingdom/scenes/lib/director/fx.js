// Shot director - FX CUE HOOKS: the interface the FX library (scenes/lib/fx, the fx track) plugs into.
//
// A shot spec lists effects as cues (times are shot seconds):
//   fx: [
//     { kind: 'dust-motes', from: 0, to: null, at: 'window-shaft', params: { count: 600 } },
//     { kind: 'lamp-flicker', params: { amount: 0.08 } },
//     { kind: 'blood-spray', from: 2.1, to: 3.0, at: 'scout.wing.L', params: { ... } },
//   ]
// The director creates ONE instance per (kind, id) for the whole set in setup() (a set scene
// renders many shots from one browser), hides it outside its cues and calls update() every frame:
//
//   registerFx(kind, async (ctx, api) => ({
//     object,                               // optional THREE.Object3D, added to the scene by the director
//     update(local, cue, env, info) {},     // local = seconds since cue.from (pure in t!), info: { t, shot, u, camera }
//     setActive(on) {},                     // optional (default: object.visible = on)
//     dynamic: [obj],                       // optional: moving shadow casters (shadow cache)
//   }), { about: 'what it draws', cost: 0.1 /* extra s per draft frame, for the estimates */ })
//
// api = { scene, set (the set builder's result: marks, lights, ground), point(name, t), THREE }.
// The FX library registers its kinds from scenes/lib/fx/index.js by exporting
//   export function registerDirectorFx(registerFx) { registerFx('blood-spray', factory, meta); ... }
// (or `export const DIRECTOR_FX = { kind: factory }`). loadFxLibrary() imports it if it exists; a
// kind registered there replaces the director's built-in stand-in of the same name. A cue whose
// kind nobody registered is drawn as nothing and reported (missingFx), so a shot never fails
// because an effect is not built yet.
import * as THREE from 'three';
import { vnoise1, hash01, clamp } from './timeline.js';

const REG = new Map();
export const FX_META = new Map();
/** Register (or replace) an effect kind. */
export function registerFx(kind, factory, meta = {}) { REG.set(kind, factory); FX_META.set(kind, meta); }
export function fxKinds() { return [...REG.keys()]; }

let libTried = null;
/** Import the FX library's registrations once (scenes/lib/fx/index.js), if the fx track has built it. */
export async function loadFxLibrary() {
  if (libTried) return libTried;
  libTried = (async () => {
    try {
      const m = await import('../fx/index.js');
      if (typeof m.registerDirectorFx === 'function') m.registerDirectorFx(registerFx);
      else if (m.DIRECTOR_FX) for (const [k, f] of Object.entries(m.DIRECTOR_FX)) registerFx(k, f, { from: 'scenes/lib/fx' });
      return { loaded: true, kinds: fxKinds() };
    } catch (e) {
      return { loaded: false, reason: String(e?.message || e).slice(0, 160) };
    }
  })();
  return libTried;
}

/** Runs the FX cues of a set's shots. */
export class FxRunner {
  constructor(ctx, api) { this.ctx = ctx; this.api = api; this.inst = new Map(); this.missing = new Set(); this.dynamic = []; }
  /** Create instances for every cue kind used by these shots (setup time). */
  async prepare(shotSpecs) {
    for (const spec of shotSpecs) for (const cue of spec?.fx || []) {
      const key = `${cue.kind}:${cue.id || ''}`;
      if (this.inst.has(key)) continue;
      const f = REG.get(cue.kind);
      if (!f) { this.missing.add(cue.kind); this.inst.set(key, null); continue; }
      const it = await f(this.ctx, { ...this.api, cue, THREE });
      if (it?.object) { it.object.visible = false; this.api.scene.add(it.object); }
      if (it?.dynamic) this.dynamic.push(...it.dynamic);
      this.inst.set(key, it || null);
    }
    return this;
  }
  /** Per frame: activate the cues of this shot that cover shot time t; hide everything else. */
  update(spec, t, env, info) {
    const active = new Set();
    for (const cue of spec?.fx || []) {
      const key = `${cue.kind}:${cue.id || ''}`;
      const it = this.inst.get(key);
      if (!it) continue;
      const from = cue.from ?? -Infinity, to = cue.to ?? Infinity;
      if (t < from || t > to) continue;
      active.add(key);
      it.setActive ? it.setActive(true) : it.object && (it.object.visible = true);
      it.update?.(t - (Number.isFinite(from) ? from : 0), cue, env, { ...info, t });
    }
    for (const [key, it] of this.inst) if (it && !active.has(key)) (it.setActive ? it.setActive(false) : it.object && (it.object.visible = false));
  }
}

// ----------------------------------------------- built-in stand-ins --------
// Small, cheap effects the first episode needs now; the FX library may replace any of them.

/** lamp-flicker: oil-lamp flames breathe (the set's point lights, cue.params.amount ~0.06). */
registerFx('lamp-flicker', async (ctx, api) => {
  const lights = api.set?.lamps || [];
  const base = lights.map((l) => l.intensity);
  return {
    setActive(on) { if (!on) lights.forEach((l, i) => { l.intensity = base[i] * (l.userData.dirScale ?? 1); }); },
    update(local, cue, env, info) {
      const a = cue.params?.amount ?? 0.07;
      lights.forEach((l, i) => {
        const n = 0.6 * vnoise1(info.t * 7.3 + i * 13.1, 31 + i) + 0.4 * vnoise1(info.t * 17.9 + i * 5.7, 77 + i);
        l.intensity = base[i] * (l.userData.dirScale ?? 1) * (1 + a * n);
      });
    },
  };
}, { about: 'oil-lamp intensity flicker on the set\'s lamp lights', cost: 0 });

/**
 * dust-motes: fine dust drifting in a box (cue.params: box [[x0,y0,z0],[x1,y1,z1]], count, size m,
 * color [r,g,b] linear, drift m/s) - catches light only where the set lights it (a soft additive
 * sprite tinted by cue.params.color; at draft size it reads as specks in the window shaft).
 */
registerFx('dust-motes', async (ctx, api) => {
  const p = api.cue.params || {};
  const box = p.box || [[-1, 0, -1], [1, 2, 1]];
  const N = p.count ?? 500;
  const g = new THREE.BufferGeometry();
  const base = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) base[i * 3 + k] = box[0][k] + (box[1][k] - box[0][k]) * hash01(i, k, 91);
    seed[i] = hash01(i, 7, 13);
  }
  const pos = new Float32Array(N * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const col = p.color || [1.4, 1.35, 1.25];
  const mat = new THREE.PointsMaterial({ size: p.size ?? 0.006, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(...col), sizeAttenuation: true, opacity: p.opacity ?? 0.5 });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.castShadow = false; pts.receiveShadow = false;
  pts.name = 'fx:dust-motes';
  const dv = p.drift || [0.02, -0.006, 0.01];
  return {
    object: pts,
    update(local, cue, env, info) {
      const t = info.t;
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        for (let k = 0; k < 3; k++) {
          const span = box[1][k] - box[0][k];
          const w = base[i * 3 + k] - box[0][k] + dv[k] * t * (0.5 + s) + 0.03 * vnoise1(t * 0.3 + s * 50 + k * 7, 3 + k);
          pos[i * 3 + k] = box[0][k] + (((w % span) + span) % span);
        }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}, { about: 'drifting dust specks in a lit volume (stand-in)', cost: 0.02 });

/**
 * shadow-pass: an invisible body that only casts a shadow, moving along a straight line (P-06 the
 * shape in the fog, P-17 the dragon's shadow over the meadow). params: { object: set-provided
 * Object3D name in api.set.objects, from [x,y,z], to [x,y,z], yawDeg }
 */
registerFx('shadow-pass', async (ctx, api) => {
  const p = api.cue.params || {};
  const obj = api.set?.objects?.[p.object];
  if (!obj) return null;
  const a = new THREE.Vector3(...p.from), b = new THREE.Vector3(...p.to);
  return {
    dynamic: [obj],
    setActive(on) { obj.visible = on; },
    update(local, cue) {
      const dur = (cue.to ?? local + 1) - (cue.from ?? 0);
      const u = clamp(local / Math.max(0.01, dur));
      obj.position.lerpVectors(a, b, u);
      if (p.yawDeg != null) obj.rotation.y = (p.yawDeg * Math.PI) / 180;
      obj.updateMatrixWorld(true);
    },
  };
}, { about: 'a shadow-only body crossing the frame', cost: 0.05 });
