// FX library self-test (node, no browser): the pure pieces every frame depends on.
//   node scenes/lib/fx/tools/selftest.mjs
// - cloth pre-simulation is deterministic (same bytes twice) and a tear really splits the grid
// - debris solver: deterministic, never below the ground, comes to rest on a stable face
// - analytic helpers (ballistic with drag, liveRange) agree with brute-force integration
// - the director registration covers every documented kind with a factory
import * as THREE from 'three';
import { simulateCloth, bodyColliders } from '../cloth.js';
import { solvePiece, poseAt } from '../debris.js';
import { ballistic } from '../core/util.js';
import { liveRange } from '../smoke.js';
import { registerDirectorFx, DIRECTOR_KINDS } from '../index.js';

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

// ---- analytic helpers
const p = [0, 0, 0], v = [0, 0, 0];
ballistic([0, 1, 0], [5, 6, 0], [0, -9.81, 0], 0.8, [1, 0, 0], 1.3, p, v);
let x = [0, 1, 0], u = [5, 6, 0]; const dt = 1e-5;
for (let t = 0; t < 1.3 - 1e-12; t += dt) { for (let k = 0; k < 3; k++) { const acc = (k === 1 ? -9.81 : 0) + 0.8 * ([1, 0, 0][k] - u[k]); u[k] += acc * dt; x[k] += u[k] * dt; } }
ok(Math.hypot(p[0] - x[0], p[1] - x[1], p[2] - x[2]) < 2e-3, `util: closed-form drag ballistic matches integration (err ${Math.hypot(p[0] - x[0], p[1] - x[1]).toExponential(1)} m)`);
const [i0, i1] = liveRange(10, 0, 100, 20, 3);
ok(i0 <= 7 * 20 && i1 >= 10 * 20 - 1 && i1 - i0 < 3 * 20 + 3, `smoke: live particle range [${i0}, ${i1}] covers exactly the last 3 s`);

// ---- director kinds
const reg = new Map();
registerDirectorFx((k, f, meta) => reg.set(k, { f, meta }));
ok(reg.size === Object.keys(DIRECTOR_KINDS).length && [...reg.values()].every((r) => typeof r.f === 'function' && r.meta.about), `director: ${reg.size} kinds registered with factories and descriptions`);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
