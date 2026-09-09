#!/usr/bin/env node
/* Headless checks for the gamepad layer.
 *
 * The parts worth testing are the parts that decide how a stick feels rather
 * than whether it responds at all: the shape of the deadzone, the response
 * curve, edge detection across frames, and the trigger threshold. All of
 * that is pure arithmetic over a fake pad, so none of it needs a browser or
 * a controller plugged in.
 *
 * Usage: node engine/test/gamepad.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const code = fs.readFileSync(path.join(SRC, '88-gamepad.js'), 'utf8');

/* A fake pad, and a fake navigator to hand it back through. */
const fake = {
  index: 0,
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
  connected: true,
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  vibrationActuator: { playEffect: () => Promise.resolve('complete') },
};
let pads = [fake];

const sandbox = {
  console, Math, Number, Array, Float32Array, Set, Map, JSON, Infinity, NaN,
  performance: { now: () => 0 },
  navigator: { getGamepads: () => pads },
  window: { addEventListener: () => {}, removeEventListener: () => {} },
};
const ctx = vm.createContext(sandbox);
vm.runInContext(`${code}\nthis.API = { Pad, padStick, padFamily, PAD_BUTTON, PAD_LAYOUT };`, ctx);
const { Pad, padStick, padFamily, PAD_LAYOUT } = ctx.API;

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function section(t) { console.log(`\n${t}`); }

function setAxes(lx, ly, rx, ry) { fake.axes = [lx, ly, rx || 0, ry || 0]; }
function setButton(i, pressed, value) {
  fake.buttons[i] = { pressed, value: value != null ? value : (pressed ? 1 : 0) };
}
function resetPad() {
  setAxes(0, 0, 0, 0);
  for (let i = 0; i < fake.buttons.length; i++) setButton(i, false, 0);
}

/* ============================================================
   THE DEADZONE
   ============================================================ */
section('deadzone');
{
  const dz = 0.16;
  const centre = padStick(0.05, -0.09, dz, 1);
  check('a stick at rest is exactly zero', centre.x === 0 && centre.y === 0 && centre.mag === 0);

  /* The failure a per-axis deadzone produces. At a shallow diagonal the
     vector is well clear of the deadzone — 0.12 on each axis is a magnitude
     of 0.17 — while neither component is, so a per-axis test throws the
     whole input away and the player, pushing north-east, stands still. */
  const shallow = padStick(0.12, 0.12, dz, 1);
  check('a shallow diagonal past the deadzone still moves you', shallow.mag > 0,
    `magnitude ${Math.hypot(0.12, 0.12).toFixed(3)} against a ${dz} deadzone`);
  check('and keeps the heading it was pushed at',
    Math.abs(shallow.x - shallow.y) < 1e-9, `${shallow.x.toFixed(4)} vs ${shallow.y.toFixed(4)}`);
  const perAxisX = Math.abs(0.12) > dz ? 0.12 : 0;
  const perAxisY = Math.abs(0.12) > dz ? 0.12 : 0;
  check('where a per-axis deadzone would have dropped it entirely',
    perAxisX === 0 && perAxisY === 0);

  /* And the other half of the same bug: pushed almost due north, a per-axis
     test keeps the north and drops the east, so the stick snaps to the
     compass point instead of going where it was pushed. */
  const nearNorth = padStick(0.10, 0.85, dz, 1);
  check('a near-vertical push keeps its sideways component', nearNorth.x > 0.02,
    `x ${nearNorth.x.toFixed(3)}`);

  check('output starts from zero at the edge of the deadzone',
    padStick(dz + 1e-6, 0, dz, 1).mag < 1e-4);
  check('and reaches one before the stick does',
    Math.abs(padStick(0.96, 0, dz, 1).mag - 1) < 1e-6);
  check('a worn stick that only reaches 0.97 still gets full speed',
    padStick(0.97, 0, dz, 1).mag === 1);

  // The magnitude is what is shaped; the direction is untouched.
  const diag = padStick(0.6, 0.6, dz, 2.2);
  check('the curve shapes the magnitude, not the heading',
    Math.abs(Math.atan2(diag.y, diag.x) - Math.PI / 4) < 1e-9);
}

section('response curve');
{
  const linear = padStick(0.5, 0, 0.16, 1).mag;
  const curved = padStick(0.5, 0, 0.16, 2.2).mag;
  check('half a stick is half the rate on a linear curve',
    Math.abs(linear - 0.425) < 0.01, linear.toFixed(3));
  check('and much less than that on a shaped one', curved < linear * 0.45,
    `${curved.toFixed(3)} vs ${linear.toFixed(3)}`);
  check('but full deflection is full rate either way',
    Math.abs(padStick(1, 0, 0.16, 2.2).mag - 1) < 1e-9);
  /* This is the whole point of the curve: fine control where the stick
     spends most of its life, and the full rate still available. */
  check('a quarter stick is finer with the curve than without',
    padStick(0.25, 0, 0.16, 2.2).mag < padStick(0.25, 0, 0.16, 1).mag * 0.35);
}

/* ============================================================
   BUTTONS AND EDGES
   ============================================================ */
section('buttons');
{
  resetPad();
  const pad = new Pad();
  pad.poll(0);
  check('a pad is found', pad.connected);
  check('and identified', pad.family === 'xbox', pad.family);

  setButton(0, true);
  pad.poll(1);
  check('a press is seen', pad.down('a') && pad.justPressed('a'));
  pad.poll(2);
  check('and is not seen twice', pad.down('a') && !pad.justPressed('a'));
  setButton(0, false);
  pad.poll(3);
  check('a release is seen once', !pad.down('a') && pad.justReleased('a'));
  pad.poll(4);
  check('and not again', !pad.justReleased('a'));

  /* The aliases exist so a game can be written in whichever vocabulary its
     author thinks in without a translation table at every call site. */
  setButton(1, true);
  pad.poll(5);
  check('names alias across pad families', pad.down('b') && pad.down('circle'));

  // A pad that is unplugged mid-press must not leave the button stuck down.
  resetPad();
  setButton(0, true);
  pad.poll(6);
  pads = [];
  pad.poll(7);
  check('unplugging releases everything', !pad.down('a') && pad.justReleased('a'));
  pads = [fake];
  resetPad();
}

section('triggers');
{
  resetPad();
  const pad = new Pad();
  pad.poll(0);

  /* Several pads report a trigger's travel in `value` and never set
     `pressed`. Reading the flag alone makes those triggers dead. */
  setButton(7, false, 0.2);
  pad.poll(1);
  check('a barely-touched trigger is not a press', !pad.down('rt'));
  check('but its travel is readable', Math.abs(pad.value('rt') - 0.2) < 1e-6);
  setButton(7, false, 0.8);
  pad.poll(2);
  check('past the threshold it is a press even with no pressed flag', pad.down('rt'));
  check('and it is an edge', pad.justPressed('rt'));
  check('the analogue value is what a throttle reads',
    Math.abs(pad.triggers.rt - 0.8) < 1e-6);
  resetPad();
}

/* ============================================================
   LABELS
   ============================================================ */
section('glyphs');
{
  check('an Xbox pad is detected', padFamily('Xbox Wireless Controller') === 'xbox');
  check('a DualSense is detected', padFamily('DualSense Wireless Controller') === 'playstation');
  check('a Switch pro is detected', padFamily('Pro Controller (Vendor: 057e)') === 'nintendo');
  check('anything else falls back', padFamily('Generic USB Joystick') === 'generic');

  /* Nintendo's bottom face button is B and its right face button is A, which
     is the opposite of every other pad. The index is the position and the
     glyph is what is printed there, so the same code prints both. */
  check('the bottom button is A on Xbox', PAD_LAYOUT.xbox.a === 'A');
  check('and B on Nintendo', PAD_LAYOUT.nintendo.a === 'B');
  check('and a cross on PlayStation', PAD_LAYOUT.playstation.a === '✕');
  check('every family labels every position',
    Object.keys(PAD_LAYOUT).every((f) => Object.keys(PAD_LAYOUT.xbox)
      .every((k) => PAD_LAYOUT[f][k] != null)));
}

/* ============================================================
   LOOK
   ============================================================ */
section('look');
{
  resetPad();
  const pad = new Pad();
  setAxes(0, 0, 1, 0);
  pad.poll(0);

  /* Look is a rate. Ten frames at 60 fps and ten frames at 10 fps must turn
     you through the same angle, or the game aims differently on a good
     machine than on a bad one. */
  let fast = 0;
  for (let i = 0; i < 60; i++) fast += pad.lookDelta(1 / 60, 3.2).yaw;
  let slow = 0;
  for (let i = 0; i < 10; i++) slow += pad.lookDelta(1 / 10, 3.2).yaw;
  check('a full second of look is the same angle at any frame rate',
    Math.abs(fast - slow) < 1e-9, `${fast.toFixed(4)} vs ${slow.toFixed(4)}`);
  check('and that angle is the sensitivity, in radians',
    Math.abs(Math.abs(fast) - 3.2) < 1e-6, Math.abs(fast).toFixed(4));
  check('right on the stick turns you right', fast < 0);

  setAxes(0, 0, 0, -1);
  pad.poll(1);
  const a = pad.lookDelta(1 / 60, 3.2, false).pitch;
  const b = pad.lookDelta(1 / 60, 3.2, true).pitch;
  check('inverting Y flips the pitch', a === -b && a !== 0);
  check('and leaves the yaw alone', pad.lookDelta(1 / 60, 3.2, true).yaw === 0);

  // A stick at rest must ask for nothing, or the view drifts while nobody
  // is touching it — the most obvious controller bug there is.
  setAxes(0, 0, 0.05, -0.07);
  pad.poll(2);
  const idle = pad.lookDelta(1 / 60, 3.2);
  check('a resting stick asks for no turn at all', idle.yaw === 0 && idle.pitch === 0);
  resetPad();
}

section('rumble');
{
  resetPad();
  const pad = new Pad();
  pad.poll(0);
  let played = null;
  fake.vibrationActuator = { playEffect: (kind, o) => { played = Object.assign({ kind }, o); return Promise.resolve(); } };
  check('a rumble reaches the actuator', pad.rumble(0.5, 0.2) === true);
  check('as a dual-rumble effect', played && played.kind === 'dual-rumble');
  check('with the duration in milliseconds', played && played.duration === 200, String(played && played.duration));
  check('the heavy motor carries the strength', Math.abs(played.strongMagnitude - 0.5) < 1e-9);

  // A quiet effect must not cut a loud one short.
  played = null;
  check('a weaker rumble does not interrupt a stronger one', pad.rumble(0.1, 0.05) === false);
  check('a stronger one does', pad.rumble(0.9, 0.3) === true);

  pad.vibration = false;
  played = null;
  check('and turning vibration off silences it', pad.rumble(1, 1) === false && played === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
