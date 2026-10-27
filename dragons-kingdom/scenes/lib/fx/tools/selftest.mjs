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
import { fxAfterOf, atRest, AFTER_T } from '../director.js';
import { jointMapFromMeshes, jointMapFromFn, projectorFrame, projectOnMesh } from '../core/decal.js';
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
// a beam pinned at one end (the eaves beam, R15-02): its free end drops, it swings down on the
// hinge, tears free before it hangs plumb and is thrown on, landing on the ground in front
{
  const L = 2.4, E = [0, 5, 0];
  const dh = [-1, 0, 0];
  const axis = [0, 0, 1];                              // cross(UP, dh) for dh = -x: (0,1,0)x(-1,0,0) = (0,0,1)
  const qB = new THREE.Quaternion();                   // long axis x (the beam lies along -x from the pin)
  const sol = solvePiece([E[0] - L / 2, E[1], E[2]], [0, 0, 0], qB, [0, 0, 0], [L / 2, 0.08, 0.07], 1, { ground: () => 0, hold: true, pivot: { E, axis, w0: 1.2, release: 1.2, carry: [0, 0.8, 2] } });
  const p0 = [0, 0, 0], qq = new THREE.Quaternion();
  poseAt(sol, 1 + (sol.segs[0].t1 - 1) * 0.5, p0, qq);
  const midDrop = p0[1] < E[1] - 0.2 && Math.abs(Math.hypot(p0[0] - E[0], p0[1] - E[1], p0[2] - E[2]) - L / 2) < 1e-3;
  poseAt(sol, 30, p0, qq);
  ok(sol.segs[0].type === 5 && sol.segs.length > 2 && midDrop && p0[1] < 0.2 && p0[2] > 0.5, `debris: a beam pinned at one end swings down on its hinge, tears free (${(sol.segs[0].t1 - 1).toFixed(2)} s) and lands in front (rest ${p0.map((x) => x.toFixed(2))})`);
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

// ---- decals: the pool's joints come from the set's own paving; dust settles on what faces up
{
  // two 'cobbles' (boxes, tops at 3 cm) with a 2 cm joint between them along x = 0
  const mat = new THREE.MeshBasicMaterial();
  const g = new THREE.Group();
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.4), mat); m.position.set(sx * 0.11, 0.015, 0); g.add(m); }
  g.updateMatrixWorld(true);
  const F = projectorFrame([0, 0.03, 0], [0, -1, 0], [0.5, 0.5, 0.4], [0, 0, -1]);
  const T = jointMapFromMeshes(F, g, { res: 0.005 });
  const at = (x, z) => { const u = (x * F.x[0] + z * F.x[2]) / F.w + 0.5, w = (x * F.y[0] + z * F.y[2]) / F.h + 0.5; const i = Math.min(T.image.width - 1, Math.floor(u * T.image.width)), j = Math.min(T.image.height - 1, Math.floor(w * T.image.height)); return T.image.data[(j * T.image.width + i) * 4] / 255; };
  ok(at(0, 0) > 0.9 && at(0.1, 0) < 0.1 && at(-0.1, 0.05) < 0.1 && at(0.24, 0.24) > 0.9, `decal: pool joints from the paving's geometry (joint ${at(0, 0).toFixed(2)}, cobble tops ${at(0.1, 0).toFixed(2)} / ${at(-0.1, 0.05).toFixed(2)}, bed ${at(0.24, 0.24).toFixed(2)})`);
  const T2 = jointMapFromFn(F, (x) => (Math.abs(x) < 0.01 ? 1 : 0), { res: 0.005 });
  ok(T2.image.width === 100 && T2.image.data.some((v) => v === 255) && T2.image.data.some((v, i) => i % 4 === 0 && v === 0), 'decal: pool joints from a function of the ground');
  // settle: per-vertex up-facing of the posed surface (a box: its top 1, its sides 0, no bottom)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4).toNonIndexed(), mat);
  box.position.set(0, 0.2, 0); box.updateMatrixWorld(true);
  const Fd = projectorFrame([0, 0.2, 0], [0, -1, 0], [1, 1, 1], [0, 0, -1]);
  const r = projectOnMesh(box, Fd, { upField: true, maxAngle: 100 });
  const ups = r ? Array.from({ length: r.geometry.attributes.aFlow.count }, (_, i) => r.geometry.attributes.aFlow.getX(i)) : [];
  ok(r && Math.max(...ups) > 0.99 && Math.min(...ups) > -0.01 && Math.min(...ups) < 0.01 && r.count === 10, `decal: settle keeps the top and the sides of a box, not its underside (${r?.count} triangles, up ${Math.min(...ups).toFixed(2)}..${Math.max(...ups).toFixed(2)})`);
}

// ---- director path: after-state, rest pose
{
  ok(fxAfterOf({ fxAfter: true }, 'stall', 'debris-sweep') && fxAfterOf({ fxAfter: ['stall'] }, 'stall', 'debris-sweep') && !fxAfterOf({ fxAfter: ['roof'] }, 'stall', 'debris-sweep')
    && fxAfterOf({ fxAfter: (id) => id === 'stall' }, 'stall', 'x') && !fxAfterOf({}, 'stall', 'debris-sweep') && AFTER_T > 100, 'director: the set says which cues a shot is after (fxAfter: true | ids | fn)');
  // a skinned actor posed and moved: under atRest the build sees its bind pose at the origin, and
  // every transform comes back afterwards
  const bones = [new THREE.Bone(), new THREE.Bone()];
  bones[0].add(bones[1]); bones[1].position.set(0, 1, 0);
  const geo = new THREE.BoxGeometry(0.2, 1, 0.2);
  const n = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const sm = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  sm.add(bones[0]); sm.bind(new THREE.Skeleton(bones));
  const root = new THREE.Group(); root.add(sm);
  const parent = new THREE.Group(); parent.position.set(5, 0, 0); parent.add(root);
  root.position.set(1, 2, 3); root.rotation.y = 1.2;
  bones[1].rotation.x = 0.8; bones[0].position.set(0.3, 0, 0);
  parent.updateMatrixWorld(true);
  const seen = atRest([{ root }], () => { const v = new THREE.Vector3(); bones[1].getWorldPosition(v); return { v: v.toArray(), par: root.parent, rx: bones[1].rotation.x }; });
  const back = bones[1].rotation.x === 0.8 && bones[0].position.x === 0.3 && root.parent === parent && root.position.x === 1 && Math.abs(root.rotation.y - 1.2) < 1e-9;
  ok(Math.abs(seen.v[1] - 1) < 1e-6 && Math.abs(seen.v[0]) < 1e-6 && seen.par === null && Math.abs(seen.rx) < 1e-6 && back, `director: body-bound effects build on the actor's rest pose at the origin (bone at ${seen.v.map((x) => x.toFixed(2))}), then the pose is put back`);
}

// ---- director kinds
const reg = new Map();
registerDirectorFx((k, f, meta) => reg.set(k, { f, meta }));
ok(reg.size === Object.keys(DIRECTOR_KINDS).length && [...reg.values()].every((r) => typeof r.f === 'function' && r.meta.about), `director: ${reg.size} kinds registered with factories and descriptions`);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
