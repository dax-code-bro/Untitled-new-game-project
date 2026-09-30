#!/usr/bin/env node
/* LIPS A LIP-READER COULD READ, AND A BLINK EVERY THIRTY SECONDS.
 *
 * Asked for in so many words: the mouth must not "just randomly move"
 * while a character talks -- it has to make the shapes of the words
 * being said, so that someone reading lips could follow it -- and the
 * characters should blink every thirty seconds.
 *
 * Both are claims that can be checked without a GPU, so they are:
 *
 *   1. Words to sounds to visemes. A lip-reader tells apart the lips
 *      shut (m, b, p), the lip under the teeth (f, v), the tongue at the
 *      teeth (th), the rounded lips (oo, w, oh), the spread ones (ee)
 *      and the open ones (ah). A line's viseme sequence is checked
 *      against what a reader would transcribe -- including the words
 *      English does not spell the way it says ("one", "move", "though").
 *
 *   2. Timing. At the middle of an m the lips are pressed and the jaw
 *      is shut; at the middle of an "ah" the jaw is open; the line fills
 *      the duration it is given.
 *
 *   3. The face. On real MakeHuman heads (male, female, heavy) the rig
 *      splits the upper lip from the lower exactly, the jaw opens the
 *      mouth by a real amount, a closure keeps it shut, the neck edge
 *      shared with the body never moves, and a blink carries the upper
 *      lid down to the lower one.
 *
 *   4. The schedule: over two minutes a face blinks about every thirty
 *      seconds -- not every three, not never.
 *
 * Usage: node engine/test/lipsync.test.js
 */
const path = require('path');
const LE = require(path.join(__dirname, '..', '..', 'site', 'engine', 'legend-engine.js'));
const { LipSync, buildMhFaceRig, mhFaceDeform, makeMhHeadGeometry, MhFace } = LE;

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

console.log('words -> visemes');
const vis = (t) => LipSync.visemes(t).join(' ');
const has = (t, seq) => vis(t).includes(seq);
check('"Bob": lips shut, open, shut', vis('Bob') === 'PP aa PP', vis('Bob'));
check('"five": lip on the teeth at both ends', /^FF .* FF$/.test(vis('five')), vis('five'));
check('"move": shut, rounded, lip on the teeth', vis('move') === 'PP ou FF', vis('move'));
check('"one" is said "wun" (rounded first), not spelled', vis('one').startsWith('ou aa'), vis('one'));
check('"though" ends rounded, no g or h', vis('though') === 'TH oh', vis('though'));
check('"think": tongue at the teeth first', vis('think').startsWith('TH'), vis('think'));
check('"shoe": the flared sh, then rounded', vis('shoe') === 'CH ou', vis('shoe'));
check('"we see" rounds then spreads', vis('we see') === 'ou ih SS ih', vis('we see'));
check('"knife": the k is silent', vis('knife').startsWith('DD'), vis('knife'));
check('"phone": ph is f', vis('phone').startsWith('FF'), vis('phone'));
check('"stone": silent e makes a long o', vis('stone') === 'SS DD oh DD', vis('stone'));
check('numbers are said: "5" is five', vis('5') === vis('five'), vis('5'));
check('"Move up, we need more fuel" has every closure a reader would see',
  has('Move up, we need more fuel', 'PP ou FF') && has('Move up, we need more fuel', 'aa PP') && has('Move up, we need more fuel', 'PP oh RR') && has('Move up, we need more fuel', 'FF'),
  vis('Move up, we need more fuel'));

console.log('timing');
{
  const tl = LipSync.timeline('mama', 1.0);
  check('the line fills the duration it is given', Math.abs(tl.duration - 1.0) < 1e-9 && Math.abs(tl.segs[tl.segs.length - 1].t1 - 1.0) < 1e-9);
  const m = tl.segs.find((s) => s.ph === 'M'), a = tl.segs.find((s) => /^(AA|AH|AE)$/.test(s.ph));
  const cm = LipSync.sample(tl, m.tc), ca = LipSync.sample(tl, a.tc);
  check('middle of an m: lips pressed, jaw shut', cm.press > 0.99 && cm.jaw < 0.02, JSON.stringify(cm));
  check('middle of the vowel: jaw open, lips apart', ca.jaw > 0.5 && ca.press < 0.01, JSON.stringify(ca));
  const tf = LipSync.timeline('if', 0.5), f = tf.segs.find((s) => s.ph === 'F');
  check('middle of an f: the lower lip tucked', LipSync.sample(tf, f.tc).tuck > 0.99);
  const t2 = LipSync.timeline('Hold on, I am coming.');
  const pauses = t2.segs.filter((s) => s.ph === '_');
  check('a comma is a longer beat than a word break', Math.max(...pauses.map((p) => p.w)) > 1 && Math.min(...pauses.map((p) => p.w)) < 0.3);
  check('silence after the line: everything back to rest', Object.values(LipSync.sample(t2, t2.duration + 0.1)).every((v) => v === 0));
  check('word times for a voice that reports progress', LipSync.wordTime(t2, 'Hold on, I am '.length) > LipSync.wordTime(t2, 0));
}

console.log('the face');
const U = 1 / 0.378;
for (const [type, seed] of [['male', 31], ['female', 5], ['heavy', 11]]) {
  const g = makeMhHeadGeometry({ seed, type });
  const R = buildMhFaceRig(g);
  const B = g.positions, n = B.length / 3, Q = new Float32Array(B.length);
  const pose = (c, blink = 0) => mhFaceDeform(R, B, Object.assign({ jaw: 0, round: 0, spread: 0, press: 0, tuck: 0, funnel: 0, upper: 0 }, c), blink, Q);
  check(`${type}: the upper and lower lip are found apart`, R.split && R.upperN > 50 && R.lowerN > 50, `split ${R.split} ${R.upperN}/${R.lowerN}`);
  pose({});
  let moved = 0;
  for (let i = 0; i < B.length; i++) moved = Math.max(moved, Math.abs(Q[i] - B[i]));
  check(`${type}: at rest nothing moves`, moved === 0, moved);
  // The lip rows at the middle of the mouth, on the outer surface: the lowest of the upper and the highest of the lower.
  let up = -1, lo = -1;
  for (let v = 0; v < n; v++) {
    const x = B[v * 3] / U, y = B[v * 3 + 1] / U, z = B[v * 3 + 2] / U;
    if (Math.abs(x) > 0.003 || Math.abs(y - R.slitY) > 0.004 || z < R.slitZ - 0.003) continue;
    if (R.jw[v] < 0.05 && (up < 0 || y < B[up * 3 + 1] / U)) up = v;
    if (R.jw[v] > 0.95 && (lo < 0 || y > B[lo * 3 + 1] / U)) lo = v;
  }
  check(`${type}: a lip row either side of the slit`, up >= 0 && lo >= 0);
  const gap = () => (Q[up * 3 + 1] - Q[lo * 3 + 1]) / U;
  pose({});
  const gap0 = gap();
  pose({ jaw: 1 });
  check(`${type}: "ah" opens the lips 9-18 mm`, gap() - gap0 > 0.009 && gap() - gap0 < 0.018, ((gap() - gap0) * 1000).toFixed(1) + ' mm');
  pose({ press: 1 });
  check(`${type}: m/b/p keeps them shut`, gap() < gap0 + 0.0005, ((gap() - gap0) * 1000).toFixed(2) + ' mm');
  pose({ round: 1 });
  // Rounding narrows the mouth: the corners (the outermost points of the lip line) come in.
  let cx0 = 0, cx1 = 0;
  for (let v = 0; v < n; v++) {
    const y = B[v * 3 + 1] / U, z = B[v * 3 + 2] / U;
    if (Math.abs(y - R.slitY) < 0.003 && z > R.slitZ - 0.02 && Math.abs(B[v * 3] / U) < 0.03) { cx0 = Math.max(cx0, Math.abs(B[v * 3]) / U); cx1 = Math.max(cx1, Math.abs(Q[v * 3]) / U); }
  }
  check(`${type}: "oo" draws the corners in 3 mm or more`, cx0 - cx1 > 0.003, ((cx0 - cx1) * 1000).toFixed(1) + ' mm');
  // Nothing on the neck edge moves, whatever the face does.
  pose({ jaw: 1, round: 1, spread: 1, press: 1, tuck: 1, funnel: 1, upper: 1 }, 1);
  let seam = 0;
  for (let v = 0; v < n; v++) {
    const y = B[v * 3 + 1] / U, z = B[v * 3 + 2] / U, cut = -0.100 - 0.45 * (Math.max(-0.06, Math.min(0.10, z)) + 0.06);
    if (y < cut + 0.004) seam = Math.max(seam, Math.hypot(Q[v * 3] - B[v * 3], Q[v * 3 + 1] - B[v * 3 + 1], Q[v * 3 + 2] - B[v * 3 + 2]));
  }
  check(`${type}: the neck edge shared with the body never moves`, seam === 0, seam);
  // A blink: the upper lid's margin over the middle of each eye comes down to the lower lid's.
  check(`${type}: both lids rigged`, R.lids.length === 2 && R.lids.every((l) => l.rot.length > 200));
  for (const lid of R.lids) {
    const m = lid.meas, cy = lid.c[1], cz = lid.c[2];
    let worst = -1;
    for (let i = 0; i < lid.rot.length; i += 2) {
      const v = lid.rot[i];
      const dx = B[v * 3] / U - m.cx;
      if (Math.abs(dx - (m.dxMin + m.dxMax) / 2) > 0.003) continue;
      const a0 = Math.atan2(B[v * 3 + 1] - cy, B[v * 3 + 2] - cz);
      const c0 = Math.round((dx + 0.018) / 0.001 - 0.5);
      const u = m.su[c0], l = m.sl[c0];
      if (!(u === u) || !(a0 >= u - 0.01 && a0 < u + 0.05)) continue;    // the upper margin rows
      const a1 = Math.atan2(Q[v * 3 + 1] - cy, Q[v * 3 + 2] - cz);
      // Where the lower lid's margin has risen to, closed (it rises about a quarter of the gap).
      worst = Math.max(worst, a1 - (l + 0.242 * (u - l)));
    }
    check(`${type}: blink closes eye ${lid.side} (upper margin meets the risen lower lid)`, worst > -1 && worst < 0.01, (worst * 57.3).toFixed(1) + ' deg above it');
  }
  // A coarser level of detail rigs off the close-up's measurements.
  const gm = makeMhHeadGeometry({ seed, type, resolution: 0.0042 });
  const Rm = buildMhFaceRig(gm, R);
  check(`${type}: the middle level of detail is rigged too`, Rm.split && Rm.jaw.length > 100 && Rm.lids.length === 2);
  check(`${type}: teeth behind the lips, the lower row flagged to ride the jaw`, g.eyes._teeth > 0 && g.eyes._lowerTeeth.length > 100);
}

console.log('blinking every thirty seconds');
{
  const f = new MhFace({ gl: null, camera: null }, null, null, { seed: 9 });
  const at = [];
  let t = 0;
  for (let i = 0; i < 60 * 180; i++) {
    const was = f.blinks;
    f.update(1 / 60);
    t += 1 / 60;
    if (f.blinks > was) at.push(t);
  }
  const gaps = at.slice(1).map((x, i) => x - at[i]);
  check('three minutes: five to seven blinks', at.length >= 5 && at.length <= 7, at.map((x) => x.toFixed(1)).join(', '));
  check('every gap 27-33 s', gaps.length && gaps.every((g) => g >= 26.9 && g <= 33.1), gaps.map((x) => x.toFixed(1)).join(', '));
  check('the first blink within the first thirty seconds', at[0] <= 30.5, at[0]);
  const f2 = new MhFace({ gl: null, camera: null }, null, null, { seed: 10 });
  check('two faces do not blink in step', Math.abs(new MhFace({ gl: null, camera: null }, null, null, { seed: 9 }).blinkTimer - f2.blinkTimer) > 0.5);
  f.say('Move up, we need more fuel.', { duration: 2 });
  let pressed = 0;
  for (let i = 0; i < 120; i++) { f.update(1 / 60); if (f.ctl.press > 0.95) pressed++; }
  check('a spoken line closes the lips on its m and p', pressed > 3, pressed);
  for (let i = 0; i < 120; i++) f.update(1 / 60);
  check('and the mouth goes back to rest after it', !f.speaking && Object.values(f.ctl).every((v) => Math.abs(v) < 0.01));
}

/* 5. In the game: pick a character on the Bunker Nine select screen and the one standing on the
   stage says their line with their own mouth. Needs a browser; skipped (and said so) without one. */
(async () => {
  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('\n  ..   no playwright: in-game check skipped'); }
  if (chromium) {
    console.log('in the game');
    const fs = require('fs');
    const ROOT = path.join(__dirname, '..', '..');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
    await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
    const r = await page.evaluate(() => {
      const B = BUNKER.start({ canvas: '#game', test: true, holdTitle: true, quality: 'low' });
      const G = B.game, S = B.S;
      for (let i = 0; i < 10; i++) G.step(1 / 60);
      const a = S.heroModels && S.heroModels[S.heroId];
      if (!a) return { staged: false };
      S.bark('pick', true);
      const out = { staged: true, speaking: !!(a.face && a.face.speaking), text: a.face && a.face.text, jaw: 0, press: 0, priv: false };
      for (let i = 0; i < 150; i++) {
        G.step(1 / 60);
        out.jaw = Math.max(out.jaw, a.face.ctl.jaw);
        if (a.face.ctl.press > 0.9 || a.face.ctl.tuck > 0.9) out.press++;
        if (String(a.head.mesh.__key).startsWith('mhface')) out.priv = true;
      }
      return out;
    });
    check('the chosen character is on the stage', r.staged);
    check('picking them makes their face say the line', r.speaking, JSON.stringify(r));
    check('their jaw opens on the vowels', r.jaw > 0.4, r.jaw);
    check('their lips close or tuck on its consonants', r.press > 0, r.press);
    check('the face deforms on a mesh of its own, not the shared one', r.priv);
    check('no page errors', errors.length === 0, errors.join('; '));
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
