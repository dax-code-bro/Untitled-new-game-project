// Writes southbound-unity/Tools/CoreTests/fixtures/craft-parity.json: the web game's own boats and aircraft
// (src/entities/craft.js, bundled for node) run through set manoeuvres on a made-up shore, and the size of
// every craft's mesh, so the Unity port (Core/Craft.cs) can be checked step for step.
//   node tools/southbound/craft-parity.mjs
// (needs site/southbound/vendor/three/build/three.module.js, three r170, which .gitignore leaves out: npm pack three@0.170.0)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const game = path.join(repo, 'site/southbound');
const out = path.join(repo, 'southbound-unity/Tools/CoreTests/fixtures/craft-parity.json');

const res = await esbuild.build({
  stdin: { contents: `export * from './src/entities/craft.js';`, resolveDir: game, loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{
    name: 'three',
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(game, 'vendor/three/build/three.module.js') }));
      b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(game, 'vendor/three/addons', a.path.slice('three/addons/'.length)) }));
    },
  }],
  logLevel: 'silent',
});
const tmp = path.join(here, '.craft-bundle.mjs');
fs.writeFileSync(tmp, res.outputFiles[0].text);
const C = await import(tmp + '?' + Date.now());
fs.unlinkSync(tmp);

// the made-up world: sea (water 0) over a seabed 6 m down west of x = 60, rising to a beach and dry land east of it;
// a lake at 45 m north of z = 300 (for the seaplane); a flat field at 12 m for the aircraft south of z = -200
const height = (x, z) => z < -200 ? 12 : z > 300 ? (x < 100 ? 40 : 50) : x < 60 ? -6 : -6 + (x - 60) * 0.5;
const waterLevel = (x, z) => z > 300 ? (x < 100 ? 45 : 0) : 0;
const hm = { height, waterLevel };
const input = (o) => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, ...o });

const boats = [];
for (const [id, plan] of [
  ['speedboat', [[4, { throttle: 1 }], [3, { throttle: 1, steer: 1 }], [2, { brake: 1 }], [6, { throttle: 1 }]]],
  ['wave-runner', [[2, { throttle: 1 }], [3, { throttle: 1, steer: -1 }], [4, { throttle: 1 }]]],
  ['trawler', [[6, { throttle: 1 }], [2, { brake: 0.5, steer: 0.5 }]]],
]) {
  const b = new C.Boat(C.BOATS.find((e) => e.id === id));
  b.pos.set(0, 0, 0); b.heading = Math.PI / 2; b.t = 0; // heading east, toward the beach
  const steps = [];
  for (const [secs, o] of plan) for (let i = 0; i < secs * 30; i++) {
    b.physics(1 / 30, input(o), hm);
    if (i % 5 === 0) steps.push({ in: o, x: b.pos.x, y: b.pos.y, z: b.pos.z, h: b.heading, p: b.pitch, r: b.roll, s: b.speed });
    else steps.push({ in: o });
  }
  boats.push({ id, steps });
}

const air = [];
for (const [id, at, plan] of [
  // a take-off run on the field, rotate, climb, flaps and gear, a bank, a power-off glide and a landing
  ['skylark', [0, -600, 0], [[12, { throttle: 1 }], [3, { throttle: 1, handbrake: true }], [6, {}], [3, { steer: 1 }], [2, { steer: -1 }], [4, { brake: 1 }], [20, { nitro: false }]]],
  ['bizjet', [0, -800, 0], [[14, { throttle: 1 }], [4, { throttle: 1, handbrake: true }], [5, {}]]],
  ['tour-heli', [0, -400, 0], [[4, { handbrake: true }], [5, { throttle: 1 }], [3, { throttle: 1, steer: 1 }], [3, { brake: 1 }], [6, { nitro: true }]]],
  ['seaplane', [-200, 600, Math.PI / 2], [[16, { throttle: 1 }], [3, { throttle: 1, handbrake: true }]]],
]) {
  const e = C.AIRCRAFT.find((a) => a.id === id);
  const v = new C.Aircraft(e);
  v.pos.set(at[0], v.groundAt(hm, at[0], at[1]), at[1]); v.heading = at[2];
  const steps = [];
  let k = 0;
  for (const [secs, o] of plan) for (let i = 0; i < secs * 30; i++, k++) {
    if (id === 'skylark' && k === 30 * 21) { v.flaps = 1; }
    if (id === 'skylark' && k === 30 * 22) { v.gearDown = false; }
    if (id === 'skylark' && k === 30 * 24) { v.gearDown = true; }
    v.physics(1 / 30, input(o), hm);
    const row = { in: o, flaps: v.flaps, gear: v.gearDown };
    if (k % 5 === 0) Object.assign(row, { x: v.pos.x, y: v.pos.y, z: v.pos.z, h: v.heading, p: v.pitch, r: v.roll, s: v.speed, vy: v.v3.y, power: v.power, fuel: v.fuel, alt: v.alt, stall: v.stall, hp: v.health });
    steps.push(row);
    if (v.stall) { row.stalled = true; break; } // (a stall throws in randomness: stop comparing there)
  }
  air.push({ id, x: at[0], z: at[1], h: at[2], steps, touch: v.touchdown ? { vs: v.touchdown.vs, gear: v.touchdown.gear, speed: v.touchdown.speed } : null });
}

// every craft's mesh (the browser's surface nets on the same parts): vertex and triangle counts
const meshes = [];
for (const e of [...C.BOATS, ...C.AIRCRAFT]) {
  const v = e.type in { prop: 1, duster: 1, stunt: 1, seaplane: 1, twin: 1, jet: 1, heli: 1, heliBig: 1 } ? new C.Aircraft(e) : new C.Boat(e);
  const g = v.model.children[0].geometry;
  meshes.push({ id: e.id, vertices: g.attributes.position.count, triangles: (g.index ? g.index.count : g.attributes.position.count) / 3 });
}

const upgrades = { boat: C.BOAT_UPGRADES.map((u) => [u.id, u.price]), air: C.AIR_UPGRADES.map((u) => [u.id, u.price]) };
fs.writeFileSync(out, JSON.stringify({ boats, air, meshes, upgrades }));
console.log(`craft parity: ${boats.length} boat runs, ${air.length} aircraft runs, ${meshes.length} meshes -> ${path.relative(repo, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
