#!/usr/bin/env node
/* Headless checks on the animal model layer: proportions, the skeleton's
 * geometry and the coat-depth mask. None of this needs a GPU, and all of
 * it is the sort of thing that is invisible in code review and obvious in
 * a screenshot — which is exactly what a test is for.
 *
 * Usage: node engine/test/animals.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const MODULES = ['10-math.js', '30-geometry.js', '71-physics-collide.js',
  '90-animation.js', '94-human.js', '96-animals.js'];
const code = MODULES.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
/* The modules also hang convenience methods off Engine and Actor, which
   this harness has no need for and does not load. A stub with a prototype
   is enough for those assignments to land somewhere harmless. */
function Stub() {}
const ctx = vm.createContext({
  console, Math, Number, Array, Object, Float32Array, Uint8Array, Uint16Array,
  Uint32Array, Map, Set, JSON, Infinity, NaN, isNaN, performance: { now: () => 0 },
  Engine: Stub, Actor: Stub, Game: Stub, Shapes: {}, TextureLib: { kinds: {} },
});
vm.runInContext(`${code}\nthis.API = { ANIMAL_SPECIES, FORM_CLASS, STAGE_FORM, resolveForm,
  makeQuadSkeleton, makeQuadGeometry, FUR_SHELL_SCALE, Vec3 };`, ctx);
const { ANIMAL_SPECIES, resolveForm, makeQuadSkeleton, makeQuadGeometry, FUR_SHELL_SCALE, Vec3 } = ctx.API;

let passed = 0, failed = 0;
const failures = [];
function section(name) { console.log(`\n${name}`); }
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}
function near(label, got, want, tol, unit = '') {
  ok(label, Math.abs(got - want) <= tol, `got ${got.toFixed(3)}${unit}, wanted ${want.toFixed(3)}±${tol}${unit}`);
}

/* The 20 real species, not the archetype aliases that point at them. */
const SPECIES = Object.keys(ANIMAL_SPECIES).filter((id) => {
  const seen = ANIMAL_SPECIES[id];
  return Object.keys(ANIMAL_SPECIES).findIndex((k) => ANIMAL_SPECIES[k] === seen) === Object.keys(ANIMAL_SPECIES).indexOf(id);
});

const bonePos = (sk, name) => { const v = new Vec3(); sk.bones[sk.index(name)].bindMatrix.getTranslation(v); return v; };

section('the skeleton stands on the ground at its measured height');
for (const id of ['whitetailDeer', 'elk', 'grizzlyBear', 'grayWolf', 'cottontailRabbit']) {
  const form = resolveForm(id, { sex: 'male', stage: 'prime' });
  const sk = makeQuadSkeleton(form, 1);
  const foot = Math.min(bonePos(sk, 'fFtL').y, bonePos(sk, 'rFtL').y);
  // The foot bone is the fetlock; the hoof/pad hangs a little below it.
  ok(`${id}: the feet reach the ground`, foot > 0 && foot < form.shoulder * 0.06,
    `lowest foot at ${foot.toFixed(3)} m`);
  // The spine line is half a chest below the withers; hips sit on it exactly.
  const withers = bonePos(sk, 'hips').y + form.bodyD * 0.45;
  near(`${id}: withers at its measured shoulder height`, withers, form.shoulder, form.shoulder * 0.08, ' m');
}

section('angulation changes the stance, not the height');
for (const id of ['whitetailDeer', 'grayWolf', 'grizzlyBear']) {
  const form = resolveForm(id, { sex: 'male', stage: 'adult' });
  const sk = makeQuadSkeleton(form, 1);
  const flat = makeQuadSkeleton(Object.assign({}, form, { limbAngle: 0 }), 1);
  near(`${id}: same foot height angulated or not`,
    bonePos(sk, 'rFtL').y, bonePos(flat, 'rFtL').y, 1e-6, ' m');
  const hockBack = bonePos(sk, 'rUpL').z - bonePos(sk, 'rLoL').z;
  ok(`${id}: the hock sits behind the hip`, hockBack > 0, `offset ${hockBack.toFixed(3)} m`);
}
{
  const bear = resolveForm('grizzlyBear', { sex: 'male', stage: 'adult' });
  const wolf = resolveForm('grayWolf', { sex: 'male', stage: 'adult' });
  ok('a plantigrade bear is straighter-legged than a canid', bear.limbAngle < wolf.limbAngle,
    `bear ${bear.limbAngle}, wolf ${wolf.limbAngle}`);
}

section('the off-side legs are out of step with the near ones');
for (const id of ['whitetailDeer', 'grayWolf']) {
  const sk = makeQuadSkeleton(resolveForm(id, { sex: 'male', stage: 'adult' }), 1);
  ok(`${id}: front feet are not in one plane`,
    Math.abs(bonePos(sk, 'fUpL').z - bonePos(sk, 'fUpR').z) > 0.01);
}

section('a coat is never deeper than the part it grows on');
for (const id of SPECIES) {
  for (const stage of ['young', 'adult', 'prime']) {
    const form = resolveForm(id, { sex: 'male', stage });
    const geo = makeQuadGeometry(makeQuadSkeleton(form, 1), form, 1);
    const furLen = (form.furLen || 0.02) * FUR_SHELL_SCALE;
    let worst = 0, worstAt = -1;
    for (let i = 0; i < geo.thick.length; i++) {
      // colors.r is the per-vertex fur depth multiplier the shader uses.
      const ratio = (geo.colors[i * 3] * furLen) / geo.thick[i];
      if (ratio > worst) { worst = ratio; worstAt = i; }
    }
    if (stage === 'adult') {
      ok(`${id}: no shell stands off more than 0.61 of its own half-thickness`,
        worst <= 0.611, `worst ${worst.toFixed(3)} at vertex ${worstAt}`);
    } else if (worst > 0.611) {
      ok(`${id} (${stage}): coat within thickness`, false, `worst ${worst.toFixed(3)}`);
    }
  }
}
ok('every species and stage checked', true);

section('thin parts get a thin coat');
{
  const form = resolveForm('whitetailDeer', { sex: 'male', stage: 'prime' });
  const geo = makeQuadGeometry(makeQuadSkeleton(form, 1), form, 1);
  let ear = 1, body = 0, leg = 1;
  for (let i = 0; i < geo.thick.length; i++) {
    const v = geo.uvs[i * 2 + 1], d = geo.colors[i * 3];
    if (v > 0.97) ear = Math.min(ear, d);
    else if (v > 0.86 && v < 0.95) leg = Math.min(leg, d);
    else if (v > 0.1 && v < 0.3) body = Math.max(body, d);
  }
  ok('the ribcage carries a full-depth coat', body > 0.99, `got ${body.toFixed(3)}`);
  ok('the cannon bone carries almost none', leg < 0.35, `got ${leg.toFixed(3)}`);
  ok('an ear plate carries almost none', ear < 0.35, `got ${ear.toFixed(3)}`);
}

section('the coat atlas lands on the band it was written for');
{
  const form = resolveForm('whitetailDeer', { sex: 'male', stage: 'adult' });
  const geo = makeQuadGeometry(makeQuadSkeleton(form, 1), form, 1);
  let maxV = 0;
  for (let i = 0; i < geo.uvs.length; i += 2) maxV = Math.max(maxV, geo.uvs[i + 1]);
  // Doubled uv used to push the ears (v 0.98) onto the hoof band, which is
  // why every animal in the game had two black spikes for ears.
  ok('no v runs past the end of the atlas', maxV <= 1.0001, `max v ${maxV.toFixed(3)}`);
}

section('a rack is counted the way a rack is counted');
{
  const pointsFor = (id, stage) => {
    const f = resolveForm(id, { sex: 'male', stage });
    if (f.antlerFrac <= 0.05) return 0;
    return Math.max(1, Math.round(1 + f.antlerFrac * ((f.antlerMax || 5) - 1)));
  };
  ok('a prime whitetail buck carries a five-point side', pointsFor('whitetailDeer', 'prime') === 5,
    `got ${pointsFor('whitetailDeer', 'prime')}`);
  ok('a bull elk carries six', pointsFor('elk', 'prime') === 6, `got ${pointsFor('elk', 'prime')}`);
  ok('a juvenile carries spikes', pointsFor('whitetailDeer', 'juvenile') <= 2,
    `got ${pointsFor('whitetailDeer', 'juvenile')}`);
  ok('a fawn carries none', pointsFor('whitetailDeer', 'young') === 0);
  ok('a doe carries none', resolveForm('whitetailDeer', { sex: 'female', stage: 'prime' }).antlerFrac === 0);
}

section('a tail is outside the animal');
for (const id of ['grayWolf', 'redFox', 'whitetailDeer', 'cougar']) {
  const form = resolveForm(id, { sex: 'male', stage: 'adult' });
  const sk = makeQuadSkeleton(form, 1);
  const hips = bonePos(sk, 'hips'), tip = bonePos(sk, 'tail2');
  const rump = hips.z - form.bodyLen * 0.36;      // the body loft's rearmost station
  ok(`${id}: the tail tip clears the rump`, tip.z < rump, `tip ${tip.z.toFixed(3)}, rump ${rump.toFixed(3)}`);
}

section('young animals are leggy and short-bodied, not scale models');
for (const id of ['whitetailDeer', 'elk', 'grayWolf']) {
  const y = resolveForm(id, { sex: 'male', stage: 'young' });
  const a = resolveForm(id, { sex: 'male', stage: 'adult' });
  ok(`${id}: a young one stands well over half adult height`, y.shoulder / a.shoulder > 0.55);
  ok(`${id}: but its body is proportionally shorter`,
    (y.bodyLen / y.shoulder) < (a.bodyLen / a.shoulder));
  ok(`${id}: and its head is proportionally bigger`,
    (y.headLen / y.bodyLen) > (a.headLen / a.bodyLen));
}

section('the sexes are shaped differently, not just sized');
for (const id of ['whitetailDeer', 'elk', 'grizzlyBear']) {
  const m = resolveForm(id, { sex: 'male', stage: 'prime' });
  const f = resolveForm(id, { sex: 'female', stage: 'prime' });
  ok(`${id}: the male is the larger`, m.shoulder > f.shoulder);
  ok(`${id}: and carries a heavier neck`, m.neckW > f.neckW);
}

section('nothing in any model is NaN');
for (const id of SPECIES) {
  const form = resolveForm(id, { sex: 'female', stage: 'adult' });
  const geo = makeQuadGeometry(makeQuadSkeleton(form, 1), form, 1);
  let bad = 0;
  for (let i = 0; i < geo.positions.length; i++) if (!Number.isFinite(geo.positions[i])) bad++;
  for (let i = 0; i < geo.colors.length; i++) if (!Number.isFinite(geo.colors[i])) bad++;
  if (bad) ok(`${id}: finite geometry`, false, `${bad} bad floats`);
}
ok('every species builds a finite mesh', true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.log('\nfailures:'); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed ? 1 : 0);
