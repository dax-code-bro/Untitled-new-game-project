#!/usr/bin/env node
/* Every animation in the engine, measured. No browser, no GPU, no
 * screenshots -- the bundle exports its clips and its skeleton, so all
 * of this is arithmetic and runs in under a second.
 *
 * It exists because three separate faults in the animation set were
 * invisible to every test that looked at a picture:
 *
 *   - NEITHER FOOT IN THE WALK OR THE RUN EVER REACHED IN FRONT OF THE
 *     PELVIS. Both cycles were written mirrored, and because the ARMS
 *     were mirrored by the same wrong belief about the rig's signs, the
 *     contralateral check in gait.test.js still passed. Two errors, one
 *     on each limb, cancelling inside a correlation.
 *   - 236 keys sat outside human range of motion, the bulk of them
 *     elbows bent BACKWARDS: run at +92 degrees, sprint at +112.
 *   - the sampler interpolated linearly, so every joint changed speed
 *     instantaneously at every key -- a 1737 deg/s step in one frame.
 *
 * Usage: node engine/test/motion.test.js
 */
const path = require('path');
const LE = require(path.join(__dirname, '..', '..', 'site', 'engine', 'legend-engine.js'));
const { makeHumanoidSkeleton, Animator, Vec3 } = LE;
const DEG = 180 / Math.PI;

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

/* ---- the rig, and what the signs mean on it ----
   Every one of these was MEASURED off the skeleton rather than read out
   of a comment, because two comments in 90-animation.js and one in
   99-zombie-anim.js had them wrong:
     upperLeg.x  NEGATIVE swings the leg forward   (+20 -> foot z -0.280)
     lowerLeg.x  POSITIVE flexes the knee
     foot.x      POSITIVE points the toe DOWN      (+20 -> toe y -0.901)
     upperArm.x  NEGATIVE raises the arm forward   (-90 -> hand z +0.510)
     lowerArm.x  NEGATIVE flexes the elbow; POSITIVE IS HYPEREXTENSION */
const sk = makeHumanoidSkeleton();
const an = new Animator(sk);
const HUMAN = LE.makeHumanoidClips(), ZOMBIE = LE.makeZombieClips();
for (const c of HUMAN.concat(ZOMBIE)) an.add(c);
const ALL = HUMAN.concat(ZOMBIE);

console.log('\n-- the rig signs, re-measured every run --');
{
  const p = new Vec3();
  const probe = (bone, deg, idx) => {
    for (const b of sk.bones) b.localRotation.identity();
    sk.bones[sk.index(bone)].localRotation.setEuler(deg / DEG, 0, 0);
    sk.update();
    sk.worldPosition(sk.index(idx), p);
    return p.clone();
  };
  check('a positive upper leg swings the foot BACKWARD', probe('upperLegL', 20, 'footL').z < -0.2,
    `z ${probe('upperLegL', 20, 'footL').z.toFixed(3)}`);
  check('a negative upper arm raises the hand FORWARD', probe('upperArmL', -90, 'handL').z > 0.4,
    `z ${probe('upperArmL', -90, 'handL').z.toFixed(3)}`);
  check('a negative lower arm flexes the elbow forward', probe('lowerArmL', -90, 'handL').z > 0.2,
    `z ${probe('lowerArmL', -90, 'handL').z.toFixed(3)}`);
  const toe = (d) => {
    for (const b of sk.bones) b.localRotation.identity();
    sk.bones[sk.index('footL')].localRotation.setEuler(d / DEG, 0, 0);
    sk.update();
    return new Vec3(0, 0, 0.12).applyMat4(sk.bones[sk.index('footL')].worldMatrix).y;
  };
  check('a positive foot key points the toe DOWN', toe(20) < toe(-20),
    `+20 -> ${toe(20).toFixed(3)}, -20 -> ${toe(-20).toFixed(3)}`);
}

/* ---- range of motion ---- */
function toEuler(q) {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m11 = 1 - (yy + zz), m21 = xy + wz, m31 = xz - wy;
  const m22 = 1 - (xx + zz), m23 = yz - wx, m13 = xz + wy, m33 = 1 - (xx + yy);
  let ex = Math.asin(-Math.max(-1, Math.min(1, m23))), ey, ez;
  if (Math.abs(m23) < 0.9999999) { ey = Math.atan2(m13, m33); ez = Math.atan2(m21, m22); }
  else { ey = Math.atan2(-m31, m11); ez = 0; }
  ex *= DEG; ey *= DEG; ez *= DEG;
  /* YXZ pins x to [-90,90], so a knee at 110 comes back as (70,180,180):
     the same rotation in the other branch. Fold it, or every deep bend
     reads as a 180 degree twist nobody authored -- which is what made
     the first version of this audit report 584 violations instead of
     236. */
  const wr = (v) => (v > 180 ? v - 360 : v < -180 ? v + 360 : v);
  if (Math.abs(ey) > 90 && Math.abs(ez) > 90) {
    ex = ex >= 0 ? 180 - ex : -180 - ex;
    ey = wr(ey - Math.sign(ey) * 180); ez = wr(ez - Math.sign(ez) * 180);
  }
  return [ex, ey, ez];
}
/* [xMin,xMax, yMin,yMax, zMin,zMax] in this rig's signs. The hips are a
   root: a death clip lays the whole body down through them, so they are
   not held to a joint's range. */
const ROM = {
  spine: [-22, 48, -32, 32, -28, 28], chest: [-22, 38, -32, 32, -28, 28],
  neck: [-28, 28, -34, 34, -24, 24], head: [-48, 48, -72, 72, -42, 42],
  shoulderL: [-28, 28, -32, 32, -38, 38], shoulderR: [-28, 28, -32, 32, -38, 38],
  upperArmL: [-182, 62, -98, 98, -98, 98], upperArmR: [-182, 62, -98, 98, -98, 98],
  lowerArmL: [-152, 6, -92, 92, -22, 22], lowerArmR: [-152, 6, -92, 92, -22, 22],
  handL: [-72, 72, -28, 28, -48, 48], handR: [-72, 72, -28, 28, -48, 48],
  upperLegL: [-128, 34, -48, 48, -48, 48], upperLegR: [-128, 34, -48, 48, -48, 48],
  lowerLegL: [-6, 148, -22, 22, -18, 18], lowerLegR: [-6, 148, -22, 22, -18, 18],
  /* An ankle dorsiflexes about 25 degrees and plantarflexes about 50.
     The first pass had these the wrong way round and passed 236 bad
     keys while flagging good ones. */
  footL: [-28, 54, -28, 28, -28, 28], footR: [-28, 54, -28, 28, -28, 28],
};
const AX = ['x', 'y', 'z'];
console.log('\n-- range of motion, every key of every clip --');
{
  const bad = [];
  for (const clip of ALL) {
    for (const bone in clip.tracks) {
      const rom = ROM[bone]; if (!rom) continue;
      for (const q of clip.tracks[bone].rotations) {
        const e = toEuler(q);
        for (let a = 0; a < 3; a++) {
          const lo = rom[a * 2], hi = rom[a * 2 + 1];
          if (e[a] < lo - 0.5) bad.push([clip.name, bone + '.' + AX[a], e[a], lo - e[a]]);
          else if (e[a] > hi + 0.5) bad.push([clip.name, bone + '.' + AX[a], e[a], e[a] - hi]);
        }
      }
    }
  }
  bad.sort((a, b) => b[3] - a[3]);
  for (const b of bad.slice(0, 8)) console.log(`  .. ${b[0]} ${b[1]} = ${b[2].toFixed(0)} (over by ${b[3].toFixed(0)})`);
  console.log(`  .. ${bad.length} keys outside human range, across ${ALL.length} clips`);
  check('no joint is bent past where a joint bends', bad.length === 0,
    bad.length ? `worst ${bad[0][0]} ${bad[0][1]} = ${bad[0][2].toFixed(0)}` : '');
  /* lowerArmL, not lowerArm: the first spelling of this matched nothing
     and reported "no elbow is hyperextended" while the line above it was
     printing a crawl with its elbow bent 86 degrees the wrong way. */
  const elbow = bad.filter((b) => /^lowerArm[LR]\.x$/.test(b[1]) && b[2] > 0);
  check('no elbow is hyperextended -- bent backwards', elbow.length === 0,
    elbow.length ? `${elbow.length} keys, worst ${elbow[0][0]} at +${elbow[0][2].toFixed(0)}` : '');
}

/* ---- locomotion: the stride, the floor, and the reach ---- */
const FLOOR = -0.875;                        // under a 1.75 m body
const LOCO = ['walk', 'run', 'sprint', 'crouchWalk', 'crouchRun',
  'zwalk', 'zwalk_heavy', 'zwalk_light', 'zrun', 'zrun_human', 'zrun_hold',
  'zwalk_burden', 'zlimp', 'zwade'];
console.log('\n-- locomotion --');
{
  const p = new Vec3();
  const iL = sk.index('footL'), iR = sk.index('footR');
  const rows = [];
  for (const name of LOCO) {
    const clip = an.clips.get(name); if (!clip) continue;
    let fwd = -1e9, back = 1e9, low = 1e9;
    for (let i = 0; i < 240; i++) {
      an.time = i / 240 * clip.duration; an.current = clip; an.previous = null; an.fade = 1;
      an.update(0);
      for (const ix of [iL, iR]) {
        sk.worldPosition(ix, p);
        fwd = Math.max(fwd, p.z); back = Math.min(back, p.z); low = Math.min(low, p.y);
      }
    }
    rows.push({ name, fwd, back, low });
  }
  for (const r of rows)
    console.log(`  .. ${r.name.padEnd(13)} foot z ${r.back.toFixed(2)}..${r.fwd.toFixed(2)}   lowest ankle ${r.low.toFixed(3)}`);
  const dragged = rows.filter((r) => r.fwd < 0.05);
  check('every gait puts a foot in FRONT of the pelvis', dragged.length === 0,
    dragged.map((r) => `${r.name} max z ${r.fwd.toFixed(2)}`).join(', '));
  const thin = rows.filter((r) => r.fwd - r.back < 0.30);
  check('and every gait has a stride worth the name', thin.length === 0,
    thin.map((r) => `${r.name} ${(r.fwd - r.back).toFixed(2)} m`).join(', '));
  /* The ankle joint, not the sole: the sole hangs about 17 mm below it,
     so an ankle at the floor line is already a foot buried to the laces. */
  const sunk = rows.filter((r) => r.low < FLOOR + 0.012);
  check('and no ankle drops through the floor', sunk.length === 0,
    sunk.map((r) => `${r.name} ${r.low.toFixed(3)} vs ${FLOOR}`).join(', '));
}

/* ---- the clips say how far they travel, and the game reads it ---- */
console.log('\n-- stride, and the rate it implies --');
{
  const need = ['walk', 'run', 'sprint', 'crouchWalk', 'crouchRun'];
  const missing = need.filter((n) => !(an.clips.get(n) || {}).stride);
  check('every locomotion cycle states its stride', missing.length === 0, missing.join(','));
  for (const n of need) {
    const c = an.clips.get(n); if (!c || !c.stride) continue;
    console.log(`  .. ${n.padEnd(11)} ${c.stride} m per cycle over ${c.duration}s = ${(c.stride / c.duration).toFixed(2)} m/s`);
  }
  /* This game moves men at 4.6 m/s and sprints them at 6.4. Those are
     not walking speeds, and the clip chosen for them must not be the
     walk -- which is what the old speed thresholds did, stretching it to
     its 1.9x ceiling while the floor went past nearly three times as
     fast. */
  const pick = (v) => {
    let best = null, err = Infinity;
    for (const n of ['walk', 'run', 'sprint']) {
      const c = an.clips.get(n); if (!c || !c.stride) continue;
      const e = Math.abs(Math.log(v / (c.stride / c.duration)));
      if (e < err) { err = e; best = n; }
    }
    return best;
  };
  for (const v of [1.2, 2.5, 4.6, 6.4]) {
    const n = pick(v);
    console.log(`  .. ${v} m/s -> ${n} at ${LE.gaitRate(an.clips.get(n), v).toFixed(2)}x`);
  }
  check('a man at 4.6 m/s is not playing the walk', pick(4.6) !== 'walk', pick(4.6));
  check('and at 6.4 he is sprinting', pick(6.4) === 'sprint', pick(6.4));
  const worst = [1.2, 2.5, 4.6, 6.4].map((v) => {
    const c = an.clips.get(pick(v));
    return Math.abs(v - (c.stride / c.duration) * LE.gaitRate(c, v)) / v;
  });
  check('and the feet are within 25% of the ground at every speed',
    Math.max(...worst) < 0.25, `worst ${(Math.max(...worst) * 100).toFixed(0)}% slip`);
}

/* ---- smoothness: the thing that made all of it look cartoonish ---- */
console.log('\n-- how hard the motion jerks --');
{
  const TIPS = ['handL', 'handR', 'footL', 'footR', 'head'].map((n) => [n, sk.index(n)]);
  const N = 240;
  let worst = 0, worstAt = '', sum = 0;
  for (const clip of ALL) {
    const dt = clip.duration / N, L = clip.loop;
    const P = TIPS.map(() => []);
    for (let s = 0; s < N; s++) {
      an.time = s / N * clip.duration; an.current = clip; an.previous = null; an.fade = 1;
      an.update(0);
      TIPS.forEach(([, ix], t) => { const v = new Vec3(); sk.worldPosition(ix, v); P[t].push(v); });
    }
    let m = 0, mAt = '';
    TIPS.forEach(([n], t) => {
      const a = P[t];
      /* A clip that does not loop must NOT be differenced across its
         ends. `drop` starts standing and finishes folded; wrapping it
         produced a 515,000 m/s^2 spike that swamped every other reading
         and made the before and after of a real fix look identical. */
      for (let s = L ? 0 : 1; s < (L ? N : N - 1); s++) {
        const p0 = a[L ? (s - 1 + N) % N : s - 1], p1 = a[s], p2 = a[L ? (s + 1) % N : s + 1];
        const g = Math.hypot(p2.x - 2 * p1.x + p0.x, p2.y - 2 * p1.y + p0.y, p2.z - 2 * p1.z + p0.z) / (dt * dt);
        if (g > m) { m = g; mAt = `${clip.name} ${n}`; }
      }
    });
    sum += m;
    if (m > worst) { worst = m; worstAt = mAt; }
  }
  const mean = sum / ALL.length;
  console.log(`  .. peak acceleration of hands, feet and head: mean ${mean.toFixed(0)}, worst ${worst.toFixed(0)} m/s^2 (${worstAt})`);
  console.log('  .. with the old linear sampler these were 1137 and 15032');
  check('no limb snaps to a new speed at every keyframe', mean < 300, `${mean.toFixed(0)} m/s^2 mean`);
  check('and nothing anywhere is flung', worst < 1400, `${worst.toFixed(0)} m/s^2 at ${worstAt}`);
}

/* ---- and the curve still passes through what was authored ---- */
console.log('\n-- the interpolation does not invent poses --');
{
  const rel = (a, b) => {
    const ax = -a.x, ay = -a.y, az = -a.z, aw = a.w;
    return { x: aw * b.x + ax * b.w + ay * b.z - az * b.y,
      y: aw * b.y + ay * b.w + az * b.x - ax * b.z,
      z: aw * b.z + az * b.w + ax * b.y - ay * b.x,
      w: aw * b.w - ax * b.x - ay * b.y - az * b.z };
  };
  const logq = (r) => {
    let { x, y, z, w } = r;
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const s = Math.hypot(x, y, z);
    if (s < 1e-9) return [0, 0, 0];
    const a = 2 * Math.atan2(s, w);
    return [x / s * a, y / s * a, z / s * a];
  };
  let over = 0, overAt = '';
  for (const clip of ALL) {
    for (const bone in clip.tracks) {
      const tr = clip.tracks[bone];
      for (let i = 0; i + 1 < tr.times.length; i++) {
        const qa = tr.rotations[i], qb = tr.rotations[i + 1];
        const v = logq(rel(qa, qb)), T = Math.hypot(v[0], v[1], v[2]);
        if (T < 1e-4) continue;
        const n = [v[0] / T, v[1] / T, v[2] / T];
        const t0 = tr.times[i], t1 = tr.times[i + 1];
        for (let s = 1; s < 16; s++) {
          const u = logq(rel(qa, clip.sample(t0 + (t1 - t0) * s / 16, {})[bone].rotation));
          const along = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
          const d = Math.max(-along, along - T) * DEG;
          if (d > over) { over = d; overAt = `${clip.name} ${bone}`; }
        }
      }
    }
  }
  console.log(`  .. furthest the curve goes past a pose it was aimed at: ${over.toFixed(2)} deg (${overAt})`);
  check('nothing overshoots the pose it was aimed at', over < 1.0, `${over.toFixed(2)} deg at ${overAt}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
