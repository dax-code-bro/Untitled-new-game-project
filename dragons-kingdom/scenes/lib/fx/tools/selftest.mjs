// FX library self-test (node, no browser): the pure pieces every frame depends on.
//   node scenes/lib/fx/tools/selftest.mjs
// - cloth pre-simulation is deterministic (same bytes twice) and a tear really splits the grid
// - debris solver: deterministic, never below the ground, comes to rest on a stable face; held
//   pieces, roof slides, toppling, wall bounces, piles; the roofline capture reads a real roof
// - analytic helpers (ballistic with drag, liveRange) agree with brute-force integration
// - the director registration covers every documented kind with a factory
import * as THREE from 'three';
import { simulateCloth, bodyColliders } from '../cloth.js';
import { solvePiece, poseAt, PileField, prepWalls } from '../debris.js';
import { damageCapture, captureRuns } from '../destruction.js';
import { Kit, frame } from '../../architecture/core.js';
import { house } from '../../architecture/house.js';
import { ballistic } from '../core/util.js';
import { liveRange } from '../smoke.js';
import { registerDirectorFx, DIRECTOR_KINDS } from '../index.js';
import { resolveTier } from '../core/tier.js';
import { flamePalette, flameRadiance } from '../core/blackbody.js';
import { FlameVolume } from '../core/flamevol.js';
import { noiseVolume } from '../core/noise.js';
import { gradeColor } from '../../../../runtime/cinematic/colorlut.js';
import { LOOKS } from '../../../../runtime/cinematic/passes.js';

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log(`FAIL ${msg}`); } else console.log(`ok   ${msg}`); };

// ---- cloth
const opts = { hoist: [[0, 3, 0], [1, 3, 0]], size: [1, 2], res: [8, 14], t0: 1, gust: { t: 1, at: [-5, 2, 0], dir: [1, 0, 0.3], strength: 12 }, wind: [1, 0, 0], until: 3, seed: 3,
  tear: { t: 1.2, from: [0.5, 0.05], to: [0.45, 1], dur: 0.3 } };
const a = simulateCloth(opts), b = simulateCloth(opts);
const same = a.frames.length === b.frames.length && a.frames.every((f, i) => f.every((v, k) => v === b.frames[i][k]));
ok(same, `cloth: two runs give identical frames (${a.frames.length} frames x ${a.N} particles)`);
ok(a.twins.length >= 12, `cloth: tear doubles ${a.twins.length} vertices along its line`);
const last = a.frames[a.frames.length - 1];
let maxGap = 0;
for (const [v, w] of a.twins) maxGap = Math.max(maxGap, Math.hypot(last[v * 3] - last[w * 3], last[v * 3 + 1] - last[w * 3 + 1], last[v * 3 + 2] - last[w * 3 + 2]));
ok(maxGap > 0.05, `cloth: the two sides of the tear part (max gap ${maxGap.toFixed(2)} m)`);
let below = 0; for (const f of a.frames) for (let k = 1; k < f.length; k += 3) if (f[k] < -1e-3) below++;
ok(below === 0, 'cloth: never below the ground');
ok(bodyColliders({ at: [0, 0, 0], yaw: 0 }).length === 8, 'cloth: body colliders for a lying person');

// ---- debris
const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, -0.4));
const o = { e: 0.25, mu: 0.6, k: 0.2, ground: () => 0, bounces: 3 };
const s1 = solvePiece([0, 2, 0], [4, 3, 1], q0, [3, 1, -2], [0.13, 0.007, 0.08], 0.5, o);
const s2 = solvePiece([0, 2, 0], [4, 3, 1], q0, [3, 1, -2], [0.13, 0.007, 0.08], 0.5, o);
ok(JSON.stringify(s1.segs) === JSON.stringify(s2.segs), `debris: solver deterministic (${s1.segs.length} segments)`);
const pos = [0, 0, 0], q = new THREE.Quaternion();
let minY = Infinity;
for (let t = 0.5; t < 8; t += 1 / 96) { if (poseAt(s1, t, pos, q)) minY = Math.min(minY, pos[1]); }
ok(minY > -0.01, `debris: centre never below the ground (min ${minY.toFixed(3)} m)`);
poseAt(s1, 20, pos, q);
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
ok(Math.abs(Math.abs(up.y) - 1) < 1e-3 && Math.abs(pos[1] - 0.007) < 0.01, `debris: a tile comes to rest flat (y ${pos[1].toFixed(3)}, |up.y| ${Math.abs(up.y).toFixed(4)})`);
poseAt(s1, 20, pos, q); const p20 = pos.slice(); poseAt(s1, 30, pos, q);
ok(Math.hypot(pos[0] - p20[0], pos[2] - p20[2]) < 1e-9, 'debris: at rest it stays put');

// held, then slides down a 45 deg roof and leaves its edge on time
{
  const d = [0, -Math.SQRT1_2, Math.SQRT1_2], a = 4, dist = 2, v0s = 0.5;
  const sol = solvePiece([0, 6, 0], [0, 0, 0], new THREE.Quaternion(), [0, 0, 0], [0.13, 0.007, 0.08], 1, { ground: () => 0, hold: true, incline: { d, a, dist, v0: v0s } });
  const p0 = [0, 0, 0], qq = new THREE.Quaternion();
  ok(poseAt(sol, 0.2, p0, qq) && Math.abs(p0[1] - 6) < 1e-9, 'debris: a held piece sits at its start before its time');
  const tEdge = 1 + (-v0s + Math.sqrt(v0s * v0s + 2 * a * dist)) / a;
  poseAt(sol, tEdge - 1e-6, p0, qq);
  ok(Math.abs(p0[1] - (6 - dist * Math.SQRT1_2)) < 1e-3 && Math.abs(sol.segs[0].t1 - tEdge) < 1e-9, `debris: slides down the roof and leaves the eaves at ${tEdge.toFixed(3)} s`);
}
// a standing box pushed over its edge topples and lies on its long side
{
  const half = [0.5, 1.0, 0.4];
  const sol = solvePiece([0, 1.0, 0], [0, 0, 0], new THREE.Quaternion(), [0, 0, 0], half, 0.5, { ground: () => 0, hold: true, pivot: { E: [0, 0, 0.4], axis: [1, 0, 0], w0: 3 } });
  const p0 = [0, 0, 0], qq = new THREE.Quaternion();
  poseAt(sol, 20, p0, qq);
  const yl = new THREE.Vector3(0, 1, 0).applyQuaternion(qq);
  ok(sol.segs[0].type === 5 && Math.abs(yl.y) < 0.05 && p0[1] < 0.55 && p0[2] > 0.4, `debris: a pushed box topples over its edge (rest height ${p0[1].toFixed(2)} m, z ${p0[2].toFixed(2)} m)`);
  const weak = solvePiece([0, 1.0, 0], [0, 0, 0], new THREE.Quaternion(), [0, 0, 0], half, 0.5, { ground: () => 0, hold: true, pivot: { E: [0, 0, 0.4], axis: [1, 0, 0], w0: 0.5 } });
  poseAt(weak, 20, p0, qq);
  ok(Math.abs(p0[1] - 1.0) < 1e-6 && Math.abs(qq.w - 1) < 1e-6, 'debris: a weak push rocks it back onto its base');
}
// a wall stops what is thrown at it
{
  const walls = prepWalls([{ p: [2, 0, 0], n: [-1, 0, 0], width: 6, height: 4 }]);
  const sol = solvePiece([0, 1, 0], [9, 2, 0], new THREE.Quaternion(), [0, 0, 0], [0.1, 0.1, 0.1], 0, { ground: () => 0, walls });
  const p0 = [0, 0, 0], qq = new THREE.Quaternion();
  let maxX = -Infinity;
  const ext = (q) => [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].reduce((s2, a) => s2 + Math.abs(a.applyQuaternion(q).x) * 0.1, 0);
  for (let t = 0; t < 6; t += 1 / 240) if (poseAt(sol, t, p0, qq)) maxX = Math.max(maxX, p0[0] + ext(qq));
  ok(maxX < 2.02 && sol.events.some((e) => e.wall), `debris: bounces off a wall face (furthest reach x ${maxX.toFixed(2)} m)`);
}
// piles: what lands later lies on what is already there
{
  const pile = new PileField(() => 0, 0.04);
  pile.stamp([0, 0.08, 0], new THREE.Quaternion(), [0.6, 0.08, 0.07]);
  ok(Math.abs(pile.ground(0.3, 0) - 0.16) < 1e-6 && pile.ground(0, 0.3) === 0, 'debris: the pile is as high as the beam under it, and only under it');
}
// the roofline capture reads a real Cling roof: one slope, its pitch, clay vs stone slate
for (const cover of ['clay', 'slate']) {
  const cap = damageCapture((x, y, z) => Math.hypot(x - 1, y - 7.4, z + 2.4) < 1.3);
  const kit = new Kit(0);
  house(kit, frame([0, 0, -6]), { w: 7, d: 8.5, storeys: 1, roof: 'side', cover, seed: 25, lod: 'mid', party: { left: true, right: true }, damage: (p) => cap.damage([p[0], p[1], p[2] - 6]) });
  const runs = captureRuns(cap.calls);
  const R = runs[0];
  ok(runs.length === 1 && R.hit.length > 20 && R.n[2] > 0.5 && R.coverGuess === cover, `roofline: capture finds the struck slope (${R?.hit.length} ${cover} tiles, pitch ${((R?.pitch ?? 0) * 180 / Math.PI).toFixed(0)} deg, guessed ${R?.coverGuess})`);
}

// ---- analytic helpers
const p = [0, 0, 0], v = [0, 0, 0];
ballistic([0, 1, 0], [5, 6, 0], [0, -9.81, 0], 0.8, [1, 0, 0], 1.3, p, v);
let x = [0, 1, 0], u = [5, 6, 0]; const dt = 1e-5;
for (let t = 0; t < 1.3 - 1e-12; t += dt) { for (let k = 0; k < 3; k++) { const acc = (k === 1 ? -9.81 : 0) + 0.8 * ([1, 0, 0][k] - u[k]); u[k] += acc * dt; x[k] += u[k] * dt; } }
ok(Math.hypot(p[0] - x[0], p[1] - x[1], p[2] - x[2]) < 2e-3, `util: closed-form drag ballistic matches integration (err ${Math.hypot(p[0] - x[0], p[1] - x[1]).toExponential(1)} m)`);
const [i0, i1] = liveRange(10, 0, 100, 20, 3);
ok(i0 <= 7 * 20 && i1 >= 10 * 20 - 1 && i1 - i0 < 3 * 20 + 3, `smoke: live particle range [${i0}, ${i1}] covers exactly the last 3 s`);

// ---- quality tiers: the CPU box never goes above preview; a GPU scales up with the preset
{
  const fake = (name, preset, quality = {}) => ({ preset, quality, renderer: { getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => name }) } });
  const sw = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  const r = [resolveTier(fake(sw, 'draft')).name, resolveTier(fake(sw, 'final')).name, resolveTier(fake(rtx, 'preview')).name, resolveTier(fake(rtx, 'final')).name, resolveTier(fake(rtx, 'final', { tier: 'hero' })).name, resolveTier(fake(rtx, 'final', { fxTier: 'high' })).name];
  ok(r.join() === 'draft,preview,preview,final,ultra,final', `tiers: CPU draft/final -> ${r[0]}/${r[1]}, RTX preview/final/hero/high -> ${r.slice(2).join('/')}`);
  const t = resolveTier(fake(rtx, 'final', { fxParticles: 1.5 }));
  ok(Math.abs(t.particles - 1.5) < 1e-9 && t.gpu, 'tiers: ctx.quality.fxParticles scales the particle counts on a GPU');
}

// ---- fire: blackbody emission in absolute radiance, graded through the film finish
{
  const P = flamePalette('standard');
  const Y = (T) => { const c = flameRadiance(T, P); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  let mono = true; for (let T = 900; T < 2600; T += 50) if (!(Y(T + 50) > Y(T))) mono = false;
  const body = flameRadiance(1450, P);
  ok(mono && body[0] > body[1] && body[1] > body[2] && Y(1050) < 0.05 && Y(2250) > 5, `fire: radiance rises with T (1050 K ${Y(1050).toFixed(3)}, 1450 K ${Y(1450).toFixed(2)}, 2250 K ${Y(2250).toFixed(1)}), body orange`);
  const g = { toneMapping: 'agx', contrast: 1, saturation: 1, gain: [1, 1, 1], lift: [0, 0, 0], gamma: [1, 1, 1] };
  const e = (T) => gradeColor(flameRadiance(T, P), g, LOOKS.cinema, null).map((x) => Math.round(x * 255));
  const eb = e(1450), ec = e(2250), et = e(1150);
  ok(eb[0] - eb[2] > 150 && Math.min(...ec) > 190 && et[0] < 160, `fire: graded body saturated orange (${eb}), core clips (${ec}), tips dark red (${et})`);
  // flame volume: the JS twin of the shader field gives a light that is deterministic and flickers
  const fxs = { tier: { steps: 24, gpu: false }, noise: noiseVolume(32, 7) };
  const fv = new FlameVolume(fxs, { R: [0.25, 0.25], H: 1.1, seed: 3 });
  const m = new THREE.Matrix4();
  const Ys = []; for (let i = 0; i < 24; i++) { const r = fv.emission(2 + i / 24, m); Ys.push(0.2126 * r.I[0] + 0.7152 * r.I[1] + 0.0722 * r.I[2]); }
  const again = fv.emission(2 + 5 / 24, m);
  const mean = Ys.reduce((a, b) => a + b, 0) / Ys.length, sd = Math.sqrt(Ys.reduce((a, b) => a + (b - mean) ** 2, 0) / Ys.length);
  ok(Math.abs(0.2126 * again.I[0] + 0.7152 * again.I[1] + 0.0722 * again.I[2] - Ys[5]) < 1e-12 && mean > 0.05 && sd / mean > 0.03, `fire: flame light from its own field (mean I ${mean.toFixed(3)}, flicker ${(100 * sd / mean).toFixed(0)} %), deterministic`);
}

// ---- director kinds
const reg = new Map();
registerDirectorFx((k, f, meta) => reg.set(k, { f, meta }));
ok(reg.size === Object.keys(DIRECTOR_KINDS).length && [...reg.values()].every((r) => typeof r.f === 'function' && r.meta.about), `director: ${reg.size} kinds registered with factories and descriptions`);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
