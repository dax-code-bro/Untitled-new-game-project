#!/usr/bin/env node
/* THE HEIGHT CHANNEL, AND THE TWO NUMBERS THAT ARE WRITTEN DOWN TWICE.
 *
 * Every procedural recipe in 40-material.js fills `c.h` for every texel
 * -- it has to, because heightToNormal differentiates it to make the
 * normal map -- and that field is packed into the alpha of the ORM map,
 * the one channel of the three bound maps that nothing sampled. The pack
 * is a fixed affine window shared by all 46 recipes:
 *
 *     height = alpha * HEIGHT_SPAN + HEIGHT_BIAS
 *
 * The parallax shader has to invert that, and it does it with GLSL
 * LITERALS rather than uniforms, on purpose: an unbound uniform reads
 * zero with no error at all (20-gl.js no-ops an unknown name), and a
 * silently zero height span is a feature that does nothing and leaves
 * nothing to find. A literal cannot be silently zero -- but it CAN drift
 * away from the constant it is mirroring, which is what this file exists
 * to prevent. It reads both sources and fails if they disagree.
 *
 * It also checks the things a reader would otherwise have to take on
 * trust: that the window really does round-trip, that the per-recipe
 * relief measurements are real rather than guessed, that their ordering
 * is the physical one the fixed window exists to preserve, and that the
 * normal maps are still being differentiated from the raw float field
 * and not from the quantised byte.
 *
 * Pure Node. No GPU, no browser.
 * Usage: node engine/test/height.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const matSrc = fs.readFileSync(path.join(SRC, '40-material.js'), 'utf8');
const shdSrc = fs.readFileSync(path.join(SRC, '50-shaders.js'), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function section(t) { console.log(`\n${t}`); }

/* ---------------- the duplicated constants ---------------- */

section('the window is the same number in both files');

function jsConst(name) {
  const m = matSrc.match(new RegExp('const\\s+' + name + '\\s*=\\s*(-?[0-9.]+)\\s*;'));
  return m ? parseFloat(m[1]) : null;
}
function glslConst(name) {
  const m = shdSrc.match(new RegExp('const\\s+float\\s+' + name + '\\s*=\\s*(-?[0-9.]+)\\s*;'));
  return m ? parseFloat(m[1]) : null;
}

const jsBias = jsConst('HEIGHT_BIAS');
const jsSpan = jsConst('HEIGHT_SPAN');
const glBias = glslConst('PARALLAX_HEIGHT_BIAS');
const glSpan = glslConst('PARALLAX_HEIGHT_SPAN');

check('40-material.js declares HEIGHT_BIAS', jsBias !== null);
check('40-material.js declares HEIGHT_SPAN', jsSpan !== null);
check('50-shaders.js declares PARALLAX_HEIGHT_BIAS', glBias !== null);
check('50-shaders.js declares PARALLAX_HEIGHT_SPAN', glSpan !== null);
check('the bias has not drifted', jsBias === glBias, `js ${jsBias} vs glsl ${glBias}`);
check('the span has not drifted', jsSpan === glSpan, `js ${jsSpan} vs glsl ${glSpan}`);
check('the span is positive', jsSpan > 0, String(jsSpan));

/* The packer writes into orm.a and the shader reads orm.a. If either
   side is moved to another channel the other is reading rubbish, and
   because every channel of that texture holds a plausible 0..1 number
   there is no value that would look obviously wrong. */
check('the packer still writes the height into orm alpha',
  /orm\[i \+ 3\] = clamp\(\(c\.h - HEIGHT_BIAS\) \/ HEIGHT_SPAN, 0, 1\) \* 255;/.test(matSrc));
check('the shader still reads the height out of orm alpha',
  /textureGrad\(uOrmMap, uvp, ddx, ddy\)\.a \* PARALLAX_HEIGHT_SPAN \+ PARALLAX_HEIGHT_BIAS/.test(shdSrc));

/* ---------------- run the real generator ---------------- */

const MODULES = ['10-math.js', '40-material.js'];
const code = MODULES.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const ctx = vm.createContext({
  console, Math, Number, Array, Float32Array, Uint8Array, Uint16Array, Uint32Array,
  Map, Set, JSON, Infinity, NaN, isFinite, isNaN,
});
vm.runInContext(`${code}\nthis.API = { TextureLib };`, ctx);
const { TextureLib } = ctx.API;
const Noise = vm.runInContext('Noise', ctx);

section('the maps object carries what the renderer binds');

/* 96 is small enough that all 46 recipes bake in a couple of seconds and
   large enough that a mortar course is several texels wide, so the
   measured ranges are the recipe's and not the sampling grid's. */
const SIZE = 96;
const maps = {};
const KINDS = Object.keys(TextureLib.kinds);
for (const k of KINDS) maps[k] = TextureLib.generate(k, SIZE, 1);

/* Re-derive one recipe's raw height field exactly the way generate()
   does, so the packed bytes can be checked against what was packed. */
function rawField(kind) {
  const out = new Float32Array(SIZE * SIZE);
  const fn = TextureLib.kinds[kind];
  const n = new Noise(1 * 7919 + 13);
  n.cells = (x, y, sd, period) => TextureLib.worley(x, y, sd, period);
  const c = { r: 1, g: 1, b: 1, ao: 1, rough: 0.8, metal: 0, h: 0.5 };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      c.r = c.g = c.b = 1; c.ao = 1; c.rough = 0.8; c.metal = 0; c.h = 0.5;
      fn(x / SIZE, y / SIZE, n, c, SIZE);
      out[y * SIZE + x] = c.h;
    }
  }
  return out;
}

check('TextureLib publishes the window it packed with',
  TextureLib.heightBias === jsBias && TextureLib.heightSpan === jsSpan,
  `${TextureLib.heightBias} / ${TextureLib.heightSpan}`);

const missing = KINDS.filter((k) => maps[k].heightTop == null || maps[k].heightRange == null);
check('every recipe reports its measured relief', missing.length === 0, missing.join(', '));

const badRange = KINDS.filter((k) => !(maps[k].heightRange >= 0 && maps[k].heightRange <= jsSpan + 1e-6));
check('no relief escapes the packed window', badRange.length === 0,
  badRange.map((k) => `${k} ${maps[k].heightRange.toFixed(3)}`).join(', '));

const badTop = KINDS.filter((k) => maps[k].heightTop > jsBias + jsSpan + 1e-6);
check('no recipe reports a top above the window', badTop.length === 0, badTop.join(', '));

section('the window round-trips');

/* Take the recipe with the most relief and confirm that unpacking its
   alpha the way the shader does lands back on the height the recipe
   wrote, to within one quantisation step. This is the whole contract
   between the two files, expressed as arithmetic. */
const deepest = KINDS.slice().sort((a, b) => maps[b].heightRange - maps[a].heightRange)[0];
{
  const raw = rawField(deepest);
  const m = maps[deepest];
  let worst = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const want = Math.min(Math.max(raw[i], jsBias), jsBias + jsSpan);
    const got = m.orm[i * 4 + 3] / 255 * jsSpan + jsBias;
    worst = Math.max(worst, Math.abs(want - got));
  }
  const step = jsSpan / 255;
  check(`${deepest} unpacks to the height it packed`, worst <= step + 1e-6,
    `worst ${worst.toFixed(5)} against a quantisation step of ${step.toFixed(5)}`);
}

section('the fixed window preserves the physical ordering');

/* This is the reason the window is global instead of per recipe. A roof
   of pantiles really does have centimetres of relief and a blued
   receiver has microns; normalising each recipe to its own extremes
   would give both the same depth and put corrugations on a gun. */
const order = ['pantile', 'brick', 'concrete', 'bluing'];
for (let i = 1; i < order.length; i++) {
  const a = order[i - 1], b = order[i];
  check(`${a} has more relief than ${b}`, maps[a].heightRange > maps[b].heightRange,
    `${maps[a].heightRange.toFixed(3)} vs ${maps[b].heightRange.toFixed(3)}`);
}
check('smooth is perfectly flat', maps.smooth.heightRange < 1e-6,
  maps.smooth.heightRange.toFixed(6));
check('a blued receiver is nearly flat', maps.bluing.heightRange < 0.12,
  maps.bluing.heightRange.toFixed(4));

/* The shader divides the measured range by a reference figure to decide
   how deep to march, and that figure is brick's. If brick's recipe is
   ever rewritten the divisor has to move with it, or every surface in
   the game changes depth at once and nobody will know why. */
const REF = (shdSrc.match(/clamp\(uParallaxRange \/ ([0-9.]+),/) || [])[1];
check('the shader states a reference relief', REF != null);
check("the reference is brick's measured relief",
  REF != null && Math.abs(parseFloat(REF) - maps.brick.heightRange) < 0.10,
  `shader ${REF} vs brick ${maps.brick.heightRange.toFixed(3)}`);

section('the normal maps still come from the raw float field');

/* If heightToNormal were ever switched to differentiate the packed byte
   it would coarsen every normal map in the game, worst exactly where it
   shows -- the low-relief finishes, whose slope would step between two
   adjacent codes and read as facets. Asserted directly rather than by
   proxy: rebuild the field from the packed bytes, differentiate THAT,
   and confirm (a) the shipped map is not it, so the distinction is real
   and measurable, and (b) the shipped map IS the raw-derived one. */
{
  const kind = 'concrete';
  const m = maps[kind];
  const strength = TextureLib.normalStrength[kind] || 3;
  const raw = rawField(kind);
  const quant = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) quant[i] = m.orm[i * 4 + 3] / 255 * jsSpan + jsBias;
  const fromRaw = TextureLib.heightToNormal(raw, SIZE, strength);
  const fromQuant = TextureLib.heightToNormal(quant, SIZE, strength);
  let rawSame = 0, quantDiff = 0;
  for (let i = 0; i < m.normal.length; i += 4) {
    if (m.normal[i] === fromRaw[i] && m.normal[i + 1] === fromRaw[i + 1]) rawSame++;
    if (fromQuant[i] !== fromRaw[i] || fromQuant[i + 1] !== fromRaw[i + 1]) quantDiff++;
  }
  const texels = SIZE * SIZE;
  check('quantising the height would visibly coarsen the normal map',
    quantDiff > texels * 0.02, `${quantDiff} of ${texels} texels would move`);
  check('the shipped normal map is the one derived from the raw floats',
    rawSame === texels, `${texels - rawSame} of ${texels} texels differ`);
}
check('heightToNormal is still handed the float field',
  /this\.heightToNormal\(height, size,/.test(matSrc));

/* ---------------- report ---------------- */

section('measured relief, in height units');
for (const k of KINDS.slice().sort((a, b) => maps[b].heightRange - maps[a].heightRange)) {
  const r = maps[k].heightRange;
  if (r > 0.001) console.log(`  ${k.padEnd(12)} ${r.toFixed(3)}  top ${maps[k].heightTop.toFixed(3)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
