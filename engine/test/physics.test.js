#!/usr/bin/env node
/* Headless physics checks. These run without a GPU, so the solver can be
 * validated independently of anything rendering-related.
 *
 * Usage: node engine/test/physics.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const MODULES = ['10-math.js', '20-gl.js', '30-geometry.js', '70-physics-shapes.js',
  '71-physics-collide.js', '72-physics-world.js', '80-fracture.js', '86-fluid.js'];

const code = MODULES.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const ctx = vm.createContext({ console, Math, Number, Array, Float32Array, Uint8Array, Uint16Array, Uint32Array, Map, Set, JSON, Infinity, NaN });
vm.runInContext(`${code}\nthis.API = { Vec3, Quat, Shape, Body, PhysicsWorld, convexHull, Shapes, SHAPE, collide, ManifoldPool, Fracture, Fluid };`, ctx);
const { Vec3, Quat, Shape, Body, PhysicsWorld, convexHull, SHAPE, collide, ManifoldPool, Fracture, Fluid } = ctx.API;

/* The fluid sim itself is pure maths; only its buffer setup touches WebGL.
   A stub context lets the simulation be tested without a GPU. */
const STUB_GL = new Proxy({}, { get: () => () => ({}) });

let passed = 0, failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function near(a, b, tol = 1e-3) { return Math.abs(a - b) <= tol; }
function section(t) { console.log(`\n${t}`); }

function simulate(world, seconds) {
  const dt = world.fixedStep;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) world.fixedUpdate(dt);
}

/* ---------------- hull + shape construction ---------------- */

section('convex hull');
{
  const pts = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(new Vec3(x, y, z));
  const hull = convexHull(pts);
  check('cube hull built', !!hull);
  check('cube hull has 12 triangles', hull && hull.indices.length === 36, hull ? `got ${hull.indices.length / 3}` : '');

  const shape = Shape.convex(pts);
  check('cube hull merges to 6 faces', shape.faces.length === 6, `got ${shape.faces.length}`);
  check('cube hull has 3 unique edge axes', shape.edges.length === 3, `got ${shape.edges.length}`);
  check('cube hull volume ~8', near(shape.volume, 8, 0.05), `got ${shape.volume.toFixed(3)}`);

  // Every face normal must point away from the centre.
  let outward = true;
  for (const f of shape.faces) if (f.offset < 0) outward = false;
  check('cube hull faces point outward', outward);
}

section('shape support mapping');
{
  const box = Shape.box(1, 2, 3);
  const s = box.supportLocal(new Vec3(1, 1, 1), new Vec3());
  check('box support corner', near(s.x, 1) && near(s.y, 2) && near(s.z, 3), `got ${s.x},${s.y},${s.z}`);
  check('box volume', near(box.volume, 48), `got ${box.volume}`);
}

/* ---------------- narrowphase ---------------- */

section('narrowphase');
{
  const pool = new ManifoldPool();

  // Sphere / sphere
  const a = new Body(Shape.sphere(1), { position: [0, 0, 0] });
  const b = new Body(Shape.sphere(1), { position: [1.5, 0, 0] });
  let c = [];
  collide(a, b, c, pool);
  check('sphere-sphere contact found', c.length === 1);
  check('sphere-sphere depth 0.5', c.length && near(c[0].depth, 0.5), c.length ? `got ${c[0].depth}` : '');
  check('sphere-sphere normal +x', c.length && near(c[0].normal.x, 1));

  // Separated
  const far = new Body(Shape.sphere(1), { position: [5, 0, 0] });
  c = []; collide(a, far, c, pool);
  check('separated spheres produce no contact', c.length === 0);

  // Box resting on a box: expect a 4-point face manifold.
  pool.reset();
  const g = new Body(Shape.box(2, 0.5, 2), { position: [0, 0, 0], static: true });
  const t = new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 0.95, 0] });
  c = []; collide(g, t, c, pool);
  check('box-box gives a 4-point manifold', c.length === 4, `got ${c.length}`);
  check('box-box normal is +y', c.length && near(c[0].normal.y, 1, 1e-3), c.length ? `got ${c[0].normal.y}` : '');
  check('box-box depth ~0.05', c.length && near(c[0].depth, 0.05, 1e-3), c.length ? `got ${c[0].depth}` : '');

  // Box on plane
  pool.reset();
  const plane = new Body(Shape.plane([0, 1, 0], 0), { static: true });
  const box = new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 0.4, 0] });
  c = []; collide(plane, box, c, pool);
  check('plane-box gives 4 contacts', c.length === 4, `got ${c.length}`);
  check('plane-box normal +y (plane is A)', c.length && near(c[0].normal.y, 1));
  check('plane-box depth 0.1', c.length && near(c[0].depth, 0.1), c.length ? `got ${c[0].depth}` : '');

  // Sphere vs convex from outside a face
  pool.reset();
  const cube = new Body(Shape.box(1, 1, 1), { position: [0, 0, 0], static: true });
  const ball = new Body(Shape.sphere(0.5), { position: [1.3, 0, 0] });
  c = []; collide(cube, ball, c, pool);
  check('convex-sphere contact found', c.length === 1);
  check('convex-sphere depth 0.2', c.length && near(c[0].depth, 0.2, 1e-3), c.length ? `got ${c[0].depth}` : '');
  check('convex-sphere normal +x', c.length && near(c[0].normal.x, 1, 1e-3));

  // Sphere near a cube corner: the normal must point along the diagonal,
  // which is the case a face-only test gets wrong.
  pool.reset();
  const corner = new Body(Shape.sphere(0.5), { position: [1.2, 1.2, 1.2] });
  c = []; collide(cube, corner, c, pool);
  const expect = 1 / Math.sqrt(3);
  check('convex-sphere corner normal is diagonal',
    c.length === 1 && near(c[0].normal.x, expect, 0.02) && near(c[0].normal.y, expect, 0.02),
    c.length ? `got ${c[0].normal.x.toFixed(3)},${c[0].normal.y.toFixed(3)}` : 'no contact');
}

/* ---------------- resting and stacking ---------------- */

section('resting contact');
{
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const box = w.add(new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 3, 0], restitution: 0 }));
  simulate(w, 3);
  check('box rests on ground at y=0.5', near(box.position.y, 0.5, 0.02), `got ${box.position.y.toFixed(4)}`);
  check('box came to rest', box.velocity.length() < 0.05, `|v|=${box.velocity.length().toFixed(4)}`);
  check('box did not drift horizontally', Math.abs(box.position.x) < 0.02 && Math.abs(box.position.z) < 0.02,
    `x=${box.position.x.toFixed(4)} z=${box.position.z.toFixed(4)}`);
  check('box fell asleep', !box.awake);
}

section('stacking');
{
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const boxes = [];
  for (let i = 0; i < 5; i++) {
    boxes.push(w.add(new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 0.5 + i * 1.02, 0], restitution: 0 })));
  }
  simulate(w, 5);
  let ok = true, worst = 0;
  for (let i = 0; i < boxes.length; i++) {
    const expected = 0.5 + i;
    const err = Math.abs(boxes[i].position.y - expected);
    worst = Math.max(worst, err);
    if (err > 0.08) ok = false;
  }
  check('5-box stack stays stacked', ok, `worst height error ${worst.toFixed(4)}`);
  let toppled = false;
  for (const b of boxes) if (Math.abs(b.position.x) > 0.15 || Math.abs(b.position.z) > 0.15) toppled = true;
  check('5-box stack does not slide apart', !toppled);
  check('stack settles to sleep', boxes.every((b) => !b.awake));
}

section('energy behaviour');
{
  // A zero-restitution drop must not bounce back up.
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const box = w.add(new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 6, 0], restitution: 0 }));
  let maxAfterTouch = -Infinity;
  let touched = false;
  const dt = w.fixedStep;
  for (let i = 0; i < 400; i++) {
    w.fixedUpdate(dt);
    if (box.position.y < 0.55) touched = true;
    if (touched) maxAfterTouch = Math.max(maxAfterTouch, box.position.y);
  }
  check('inelastic drop does not gain height', maxAfterTouch < 0.62, `peak after impact ${maxAfterTouch.toFixed(4)}`);

  // A bouncy ball should bounce, but lower each time.
  const w2 = new PhysicsWorld();
  w2.add(new Body(Shape.plane([0, 1, 0], 0), { static: true, restitution: 0.7 }));
  const ball = w2.add(new Body(Shape.sphere(0.5), { position: [0, 5, 0], restitution: 0.7, canSleep: false }));
  let peaks = [];
  let lastY = ball.position.y, rising = false;
  for (let i = 0; i < 900; i++) {
    w2.fixedUpdate(w2.fixedStep);
    const y = ball.position.y;
    if (y > lastY) rising = true;
    else if (rising) { peaks.push(lastY); rising = false; }
    lastY = y;
  }
  check('bouncy ball bounces', peaks.length >= 2, `${peaks.length} bounces`);
  check('bounces decay', peaks.length < 2 || peaks[1] < peaks[0], peaks.length >= 2 ? `${peaks[0].toFixed(2)} -> ${peaks[1].toFixed(2)}` : '');
  check('ball never sinks through the floor', ball.position.y > 0.45, `y=${ball.position.y.toFixed(4)}`);
}

section('friction');
{
  // On a high-friction floor a sliding box must stop; on ice it keeps going.
  const mk = (friction) => {
    const w = new PhysicsWorld();
    w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true, friction }));
    const b = w.add(new Body(Shape.box(0.5, 0.5, 0.5), {
      position: [0, 0.5, 0], velocity: [6, 0, 0], friction, restitution: 0,
    }));
    simulate(w, 3);
    return b;
  };
  const rough = mk(0.9);
  const ice = mk(0.02);
  check('friction stops a sliding box', rough.velocity.length() < 0.2, `|v|=${rough.velocity.length().toFixed(3)}`);
  check('low friction keeps it sliding further', ice.position.x > rough.position.x + 2,
    `ice x=${ice.position.x.toFixed(2)} rough x=${rough.position.x.toFixed(2)}`);
}

section('determinism');
{
  const run = () => {
    const w = new PhysicsWorld();
    w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
    for (let i = 0; i < 12; i++) {
      w.add(new Body(Shape.box(0.4, 0.4, 0.4), {
        position: [(i % 3) * 0.9 - 0.9, 1 + i * 0.85, ((i * 7) % 5) * 0.3 - 0.6],
        rotation: [i * 11, i * 23, i * 5],
      }));
    }
    simulate(w, 4);
    return w.bodies.slice(1).map((b) => `${b.position.x.toFixed(6)},${b.position.y.toFixed(6)},${b.position.z.toFixed(6)}`).join('|');
  };
  check('same setup gives identical results', run() === run());
}

section('raycast');
{
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const box = w.add(new Body(Shape.box(1, 1, 1), { position: [0, 5, 0], static: true }));
  const sphere = w.add(new Body(Shape.sphere(1), { position: [6, 5, 0], static: true }));

  const hit = w.raycast([0, 10, 0], [0, -1, 0], 100);
  check('ray hits the box', hit && hit.body === box, hit ? `hit body ${hit.body.id}` : 'no hit');
  check('ray distance to box top is 4', hit && near(hit.distance, 4, 1e-3), hit ? `got ${hit.distance}` : '');
  check('ray normal points up', hit && near(hit.normal.y, 1, 1e-3));

  const hit2 = w.raycast([6, 10, 0], [0, -1, 0], 100);
  check('ray hits the sphere', hit2 && hit2.body === sphere);
  check('ray distance to sphere top is 4', hit2 && near(hit2.distance, 4, 1e-3), hit2 ? `got ${hit2.distance}` : '');

  const miss = w.raycast([100, 10, 100], [1, 0, 0], 10);
  check('ray into empty space misses', miss === null);

  const ground = w.raycast([0, 10, 0], [0, -1, 0], 100, (b) => b !== box);
  check('raycast filter skips the box', ground && ground.body.shape.type === SHAPE.PLANE);
}

section('explosions');
{
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const near0 = w.add(new Body(Shape.box(0.3, 0.3, 0.3), { position: [1, 0.3, 0] }));
  const far0 = w.add(new Body(Shape.box(0.3, 0.3, 0.3), { position: [7, 0.3, 0] }));
  w.explode([0, 0.3, 0], 5, 12);
  check('explosion moves nearby bodies', near0.velocity.length() > 1, `|v|=${near0.velocity.length().toFixed(2)}`);
  check('explosion spares distant bodies', far0.velocity.length() < 1e-6);
  check('explosion pushes outward', near0.velocity.x > 0);
}

section('joints');
{
  const w = new PhysicsWorld();
  const anchor = w.add(new Body(Shape.box(0.2, 0.2, 0.2), { position: [0, 5, 0], static: true }));
  const bob = w.add(new Body(Shape.sphere(0.3), { position: [0, 3, 0], canSleep: false }));
  w.addJoint('distance', anchor, bob, { distance: 2, pivotA: [0, 0, 0], pivotB: [0, 0, 0] });
  simulate(w, 4);
  const d = bob.position.distanceTo(anchor.position);
  check('distance joint holds its length', near(d, 2, 0.08), `got ${d.toFixed(4)}`);
}

section('sleep and wake');
{
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const box = w.add(new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 1, 0], restitution: 0 }));
  simulate(w, 3);
  check('body sleeps when settled', !box.awake);
  // Scale by mass: at the engine's default density a 1 m box is ~1000 kg,
  // so a fixed impulse would be meaningless.
  box.applyImpulse(new Vec3(0, 6 * box.mass, 0), box.position);
  check('impulse wakes the body', box.awake);
  simulate(w, 0.2);
  check('woken body actually moves', box.position.y > 0.55, `y=${box.position.y.toFixed(3)}`);
}

section('stability under stress');
{
  // Deep initial overlap must resolve without launching anything.
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const a = w.add(new Body(Shape.box(0.5, 0.5, 0.5), { position: [0, 0.5, 0] }));
  const b = w.add(new Body(Shape.box(0.5, 0.5, 0.5), { position: [0.05, 0.6, 0.05] }));
  let maxSpeed = 0;
  for (let i = 0; i < 300; i++) {
    w.fixedUpdate(w.fixedStep);
    maxSpeed = Math.max(maxSpeed, a.velocity.length(), b.velocity.length());
  }
  check('deep overlap resolves without explosion', maxSpeed < 12, `peak speed ${maxSpeed.toFixed(2)}`);
  check('overlapping boxes separate', Math.abs(a.position.y - b.position.y) > 0.6,
    `dy=${Math.abs(a.position.y - b.position.y).toFixed(3)}`);
  check('no NaN positions', a.position.isFinite() && b.position.isFinite());

  // A fast body must not tunnel through the floor.
  const w2 = new PhysicsWorld();
  w2.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  const bullet = w2.add(new Body(Shape.sphere(0.25), { position: [0, 20, 0], velocity: [0, -160, 0] }));
  simulate(w2, 2);
  check('fast body does not tunnel through the floor', bullet.position.y > 0.2, `y=${bullet.position.y.toFixed(3)}`);
}

section('many bodies');
{
  const w = new PhysicsWorld();
  w.add(new Body(Shape.plane([0, 1, 0], 0), { static: true }));
  for (let i = 0; i < 200; i++) {
    w.add(new Body(Shape.box(0.25, 0.25, 0.25), {
      position: [(i % 10) * 0.7 - 3.5, 1 + Math.floor(i / 10) * 0.7, ((i * 3) % 10) * 0.7 - 3.5],
    }));
  }
  const t0 = Date.now();
  simulate(w, 2);
  const ms = Date.now() - t0;
  const perStep = ms / 120;
  check('200 bodies stay finite', w.bodies.every((b) => b.position.isFinite()));
  check('200 bodies settle above ground', w.bodies.slice(1).every((b) => b.position.y > 0.1));
  /* The bound is a smoke alarm for an algorithmic regression, not a
     benchmark. It runs on whatever shared CPU the session happens to get,
     and on a loaded box the same unchanged solver measures anywhere from
     1.5 to 8 ms a step — so a tight bound only ever reports on the
     neighbours. Fifteen still catches the things worth catching: an O(n^2)
     broadphase, a solver iteration count that ran away, an allocation in
     the inner loop. */
  check('200 bodies step in under 15ms', perStep < 15, `${perStep.toFixed(2)}ms/step`);
  console.log(`       (${perStep.toFixed(2)} ms per fixed step with 200 bodies)`);
}


/* ---------------- fracture ---------------- */

section('voronoi fracture');
{
  for (const pieces of [6, 12, 24]) {
    const chunks = Fracture.shatterBox(new Vec3(0.5, 0.5, 0.5), { pieces, seed: 7 });
    let vol = 0;
    for (const c of chunks) vol += c.volume;
    // The cells must tile the original volume exactly. Any gap or overlap
    // means the clipping is wrong, and it shows up as debris that visibly
    // does not add up to the object that broke.
    check(`${pieces}-piece fracture conserves volume`, near(vol, 1, 0.02), `got ${vol.toFixed(4)}`);
    check(`${pieces}-piece fracture yields ${pieces} chunks`, chunks.length === pieces, `got ${chunks.length}`);
    let bounded = true;
    for (const c of chunks) if (c.shape.vertices.length > 64) bounded = false;
    check(`${pieces}-piece chunks stay simple`, bounded);
  }

  const flat = Fracture.shatterBox(new Vec3(1, 0.25, 0.5), { pieces: 16, seed: 3, pattern: 'slab' });
  let vol = 0;
  for (const c of flat) vol += c.volume;
  check('slab pattern conserves volume on a non-cube', near(vol, 2 * 0.5 * 1, 0.02), `got ${vol.toFixed(4)}`);

  const t0 = Date.now();
  Fracture.shatterBox(new Vec3(0.5, 0.5, 0.5), { pieces: 12, seed: 99 });
  const ms = Date.now() - t0;
  check('12-piece fracture bakes in under 150ms', ms < 150, `${ms}ms`);
}

/* ---------------- fluid ---------------- */

section('fluid simulation');
{
  const f = new Fluid(STUB_GL, { capacity: 1200, radius: 0.24 });
  f.bounds = { min: new Vec3(-2, 0, -2), max: new Vec3(2, 20, 2) };
  const n = f.fillBox(new Vec3(-1, 0.2, -1), new Vec3(1, 1.6, 1));
  check('fluid fills a volume', n > 300 && n <= 1200, `${n} particles`);

  // Seeding must already be near rest density, or frame one delivers a
  // violent correction.
  f.qx.set(f.px); f.qy.set(f.py); f.qz.set(f.pz);
  f._buildNeighbors();
  let maxNeighbors = 0, totalNeighbors = 0;
  for (let i = 0; i < f.count; i++) {
    maxNeighbors = Math.max(maxNeighbors, f.neighborCount[i]);
    totalNeighbors += f.neighborCount[i];
  }
  check('neighbour search finds neighbours', totalNeighbors / f.count > 8,
    `avg ${(totalNeighbors / f.count).toFixed(1)} neighbours`);
  check('neighbour lists do not saturate', maxNeighbors <= f.maxNeighbors, `max ${maxNeighbors}`);

  for (let i = 0; i < 240; i++) f.step(1 / 60);

  let escaped = 0, nan = 0, maxY = -Infinity, minY = Infinity, maxSpeed = 0;
  for (let i = 0; i < f.count; i++) {
    if (!Number.isFinite(f.px[i]) || !Number.isFinite(f.py[i]) || !Number.isFinite(f.pz[i])) nan++;
    maxY = Math.max(maxY, f.py[i]);
    minY = Math.min(minY, f.py[i]);
    const sp = Math.hypot(f.vx[i], f.vy[i], f.vz[i]);
    maxSpeed = Math.max(maxSpeed, sp);
    if (f.px[i] < -2.5 || f.px[i] > 2.5 || f.pz[i] < -2.5 || f.pz[i] > 2.5) escaped++;
  }
  check('fluid produces no NaN particles', nan === 0, `${nan} NaN`);
  check('fluid stays inside its bounds', escaped === 0, `${escaped} escaped`);
  check('fluid does not launch itself upward', maxY < 4, `maxY ${maxY.toFixed(2)}`);
  check('fluid settles onto the floor', minY < 0.35, `minY ${minY.toFixed(3)}`);
  check('fluid comes to rest', f.averageSpeed() < 1.2, `avg speed ${f.averageSpeed().toFixed(3)}`);
  check('no particle exceeds the speed clamp', maxSpeed <= f.maxSpeed + 1e-3, `max ${maxSpeed.toFixed(2)}`);

  // A settled pool must be roughly level, not a spike or a pit.
  let above = 0;
  const surface = maxY - 0.25;
  for (let i = 0; i < f.count; i++) if (f.py[i] > surface) above++;
  check('settled fluid has a flat surface', above > f.count * 0.02,
    `${above} of ${f.count} particles near the top`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
