#!/usr/bin/env node
/* IS THE PLAYER'S OWN HAND IN HIS SIGHT PICTURE?
 *
 * sights.test.js fires a bundle of rays down each weapon's sight line
 * and asks what stops them, which is the right question -- but it scans
 * the weapon's own triangles and nothing else. The hands are not in it.
 * So "you cannot see through the sights because your hand is in the
 * way" was outside every check in the project, and stayed outside it
 * through seven attempts to fix it.
 *
 * WHAT THIS MEASURES. For every two-handed weapon, the highest point of
 * the support hand, against the weapon's own sight line -- both as the
 * finger-joint centreline and as the drawn mesh, which is 10.6 mm of
 * skin further out and is what the player actually sees. Also the top
 * of the WEAPON at the same station, because that decides whose fault a
 * failure is: a hand above a forend that is itself above the sight line
 * is a weapon-modelling fault, and a hand above a forend that is below
 * it is a hand-solver fault. Measured: the gun is below its own sight
 * line at the hand's station on eleven of fifteen, so this is the hand.
 *
 * A RATCHET, NOT A PASS. Seven weapons are still over the line and the
 * remaining cause is understood and specific -- the march that shapes
 * each finger keeps closing only while it stays in contact, and past the
 * top of a forend there is nothing left to be in contact with, so the
 * fingers run on into fresh air. Fixing that is a change to the function
 * that shapes every finger on every weapon and wants the grip test's
 * burial numbers watched the whole way. Until then the number is held
 * where it is, so it cannot quietly grow back.
 *
 * Usage: node engine/test/sightblock.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* The count of weapons whose support hand is above the sight line, and
   the worst offender's height, as they stand. Both may go DOWN freely;
   neither may go up. */
const BASELINE_BLOCKING = 7;
const BASELINE_WORST = 0.0486;

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const note = (s) => console.log(`  ..   ${s}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 240, height: 150 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const rows = await page.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 8; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); }
    const P = B.P, G = B.game, out = [];
    for (const [id, v] of Object.entries(P.view)) {
      const w = __T_WEAPONS[id];
      if (!w || w.melee || w.tool) continue;
      const root = v.kind === 'single' ? v.actor : v.root;
      const sight = root && root.sightAt != null ? root.sightAt : null;
      const a = v.arms;
      if (!a || sight == null) continue;
      const L = a.digits && a.digits.left;
      if (!L || !L.at) { out.push({ id, oneHanded: true }); continue; }

      /* The drawn hand. Every actor on the arms rig -- the sleeves and
         the palms as well as the fingers, because a wrist standing in
         the notch is just as opaque as a knuckle. */
      let meshTop = -9, meshPart = null;
      const scan = (act, label) => {
        if (!act || !act.mesh) return;
        const geo = G.geometryOf ? G.geometryOf(act.mesh) : null;
        if (!geo || !geo.positions) return;
        const Pz = geo.positions;
        for (let i = 1; i < Pz.length; i += 3) {
          if (Pz[i] > meshTop) { meshTop = Pz[i]; meshPart = label; }
        }
      };
      for (const k of Object.keys(a)) if (a[k] && a[k].mesh) scan(a[k], k);
      if (a.parts) for (const k of Object.keys(a.parts)) if (a.parts[k] && a.parts[k].mesh)
        scan(a.parts[k], 'parts.' + k);

      /* The joint centrelines, which is what the solver reasons about. */
      let jointTop = -9;
      for (const d of (L.digits || [])) {
        for (const j of (d.joints || [])) if (j[1] > jointTop) jointTop = j[1];
        if (d.tip && d.tip[1] > jointTop) jointTop = d.tip[1];
      }

      /* And the top of the WEAPON at the hand's own station, from this
         weapon's actors. A first version of this walked the engine's
         shared arm-parts cache and reported the riot shield's frame as
         the top of a 1911 -- a measurement that names a part from
         another gun is not a measurement. */
      const handX = L.at[0];
      const acts = [];
      const add = (x) => { if (x && x.mesh) acts.push(x); };
      add(root);
      for (const nm of (root.partNames || [])) add(root[nm]);
      if (v.parts) for (const k of Object.keys(v.parts)) add(v.parts[k]);
      let gunTop = -9, n = 0;
      for (const act of acts) {
        const geo = G.geometryOf ? G.geometryOf(act.mesh) : null;
        if (!geo || !geo.positions) continue;
        const Pz = geo.positions;
        for (let i = 0; i < Pz.length; i += 3) {
          if (Math.abs(Pz[i] - handX) > 0.040) continue;
          n++;
          if (Pz[i + 1] > gunTop) gunTop = Pz[i + 1];
        }
      }
      /* CAN THE FINGER REACH OVER AT ALL? The nine attempts recorded in
         98-viewmodel.js end by naming three levers: a thinner finger, a
         looser curl cap, and a palm seated close enough that the wrap is
         geometrically possible. The first two are tried and reverted.
         This is the third, and it is arithmetic rather than a build.

         A finger lying over a forend has to leave the knuckle, cross to
         the near face, climb it, and come over the crown. That path is
         measurable from the weapon's own cross-section at the hand's
         station, and so is the finger. */
      let secTop = -9, secNear = 9, secFar = -9, sn = 0;
      for (const act of acts) {
        const geo2 = G.geometryOf ? G.geometryOf(act.mesh) : null;
        if (!geo2 || !geo2.positions) continue;
        const Q = geo2.positions;
        for (let i = 0; i < Q.length; i += 3) {
          if (Math.abs(Q[i] - handX) > 0.030) continue;
          sn++;
          if (Q[i + 1] > secTop) secTop = Q[i + 1];
          if (Q[i + 2] < secNear) secNear = Q[i + 2];
          if (Q[i + 2] > secFar) secFar = Q[i + 2];
        }
      }
      const dd = (u, w2) => Math.hypot(u[0] - w2[0], u[1] - w2[1], u[2] - w2[2]);
      let have = 0, hn = 0;
      for (const d of (L.digits || [])) {
        if (!d || !d.tip) continue;
        const j0 = (d.joints && d.joints[0]) || d.tip;
        const j1 = (d.joints && d.joints[1]) || j0;
        have += dd(d.knuckle, j0) + dd(j0, j1) + dd(j1, d.tip);
        hn++;
      }
      have = hn ? have / hn : 0;
      const mid = (L.digits && L.digits[1]) || (L.digits && L.digits[0]);
      const kn = mid ? mid.knuckle : null;
      const need = (sn && kn)
        ? Math.max(0, secNear - kn[2]) + Math.max(0, secTop - kn[1])
          + (secFar - secNear) * 0.5
        : null;

      out.push({ id,
        wrapHave: +have.toFixed(4),
        wrapNeed: need == null ? null : +need.toFixed(4),
        handOverSight: +(meshTop - sight).toFixed(4),
        jointOverSight: +(jointTop - sight).toFixed(4),
        gunOverSight: n ? +(gunTop - sight).toFixed(4) : null,
        handOverGun: n ? +(meshTop - gunTop).toFixed(4) : null,
        part: meshPart });
    }
    return out;
  });

  const two = rows.filter((r) => !r.oneHanded);
  note(`${rows.length} weapons, ${two.length} of them two-handed`);
  check('every two-handed weapon was measured', two.length >= 12, `${two.length}`);

  const blocking = two.filter((r) => r.handOverSight > 0);
  const worst = two.reduce((a, b) => (b.handOverSight > a.handOverSight ? b : a), two[0]);
  note('over the line: ' + (blocking.length
    ? blocking.sort((a, b) => b.handOverSight - a.handOverSight)
      .map((r) => `${r.id} +${(r.handOverSight * 1000).toFixed(0)}`).join(' ') + ' mm'
    : 'none'));
  note(`worst: ${worst.id} +${(worst.handOverSight * 1000).toFixed(1)} mm `
    + `(${worst.part}), and it is ${(worst.handOverGun * 1000).toFixed(0)} mm `
    + `above the top of the weapon at that station`);

  /* WHOSE FAULT IS IT. This decides which task the remaining work
     belongs to, so it is measured rather than assumed.

     The first version of this asked whether the weapon's own geometry
     stands above its sight line at the hand's station, and set the bar
     at "no more than three". That was a guess and the answer was four,
     which is what setting a threshold before looking gets you. It is
     also the wrong question twice over: three of the four are over by
     6 to 7 mm, which is a sight blade's own thickness, and the fourth is
     the scoped rifle, whose scope IS its sight and is supposed to be up
     there.

     The claim the diagnosis actually rests on is simpler and much
     stronger: the hand finishes above the WEAPON. A hand resting on a
     forend cannot be 37 mm clear of the top of it, so whatever is wrong
     is in how the hand is shaped, not in where the sights are. */
  const gunAbove = two.filter((r) => r.gunOverSight != null && r.gunOverSight > 0.003);
  note(`weapons whose own geometry is above their sight line where the hand sits: `
    + (gunAbove.length ? gunAbove.map((r) => `${r.id} +${(r.gunOverSight * 1000).toFixed(0)}`)
      .join(' ') : 'none') + ' mm (a blade is ~6 mm; the killstreak\'s is its scope)');
  const floating = two.filter((r) => r.handOverGun != null && r.handOverGun > 0.015);
  note('hands finishing clear of the top of the weapon they hold: '
    + (floating.length ? floating.sort((a, b) => b.handOverGun - a.handOverGun)
      .map((r) => `${r.id} +${(r.handOverGun * 1000).toFixed(0)}`).join(' ') + ' mm' : 'none'));
  /* THE THIRD LEVER, AND IT IS NOT THE ANSWER FOR SIX OF THE SEVEN.
   *
   * The nine attempts recorded in 98-viewmodel.js end by naming three
   * escapes: a thinner finger, a looser curl cap, and a palm seated
   * close enough that the wrap is geometrically possible. The first two
   * are built, measured and reverted. This is the third, and it is
   * arithmetic rather than a build -- which is what that note asked
   * for: "both are measurable before they are built".
   *
   * MEASURED, on the weapons that actually block. The average finger is
   * 87 mm and the path over the forend is:
   *
   *     thompson 47   mp5 51   mauser 60   sawnoff 79
   *     breakwater 86   scatter 73          paralyzer 96
   *
   * So six of the seven have between 1 and 40 mm of slack. Their palms
   * are not too far away and their fingers are not too short: they CAN
   * come over the top and they do not. The Paralyzer is the one honest
   * exception, 9 mm short, and it is the only one of the seven for
   * which "seat the palm closer" is a real answer.
   *
   * Which puts the cause back where the eighth attempt left it: over
   * the top costs burial, beside it costs the sight picture, and the
   * scoring picks beside. All three escapes are now closed, so an
   * eleventh attempt has to be in the scoring row itself -- and the
   * eighth already showed that a COST term there gives every millimetre
   * back the moment it is gated so it cannot outbid burial. What has
   * NOT been tried is a restriction rather than a cost: past the crown
   * of what it is holding, simply do not offer the search the
   * candidates that stay above the sight line. A restriction cannot be
   * outbid, and the `walled` fallback already exists for the joints
   * where nothing qualifies. */
  const wrap = two.filter((r) => r.wrapNeed != null && r.handOverSight > 0);
  if (wrap.length) {
    note('can the finger even reach over? ' + wrap
      .map((r) => `${r.id} has ${(r.wrapHave * 1000).toFixed(0)} needs `
        + `${(r.wrapNeed * 1000).toFixed(0)}`).join(', ') + ' mm');
    const tooShort = wrap.filter((r) => r.wrapHave < r.wrapNeed);
    note('too short to wrap at all: ' + (tooShort.length
      ? tooShort.map((r) => `${r.id} by `
        + `${((r.wrapNeed - r.wrapHave) * 1000).toFixed(0)} mm`).join(', ')
      : 'none'));
    /* Held at one, the Paralyzer, for the same reason the count above is
       held at seven: so a change that puts another hand out of reach of
       its own weapon shows up as a failure rather than as a hand that
       quietly stopped trying. */
    check('no more blocking hand is physically unable to wrap its weapon',
      tooShort.length <= 1,
      tooShort.map((r) => `${r.id} short by `
        + `${((r.wrapNeed - r.wrapHave) * 1000).toFixed(0)}mm`).join(', '));
  }

  check('the weapons that block their own sights do so by less than a scope',
    gunAbove.every((r) => r.gunOverSight < 0.040),
    gunAbove.filter((r) => r.gunOverSight >= 0.040)
      .map((r) => `${r.id} +${(r.gunOverSight * 1000).toFixed(0)}mm`).join(', '));
  /* Every weapon whose hand is in the sight picture is also a weapon
     whose hand is off the gun. If that ever stops being true, the cause
     has changed and this file's reasoning needs redoing. */
  check('every hand in the sight picture is a hand floating above its weapon',
    blocking.every((r) => r.handOverGun != null && r.handOverGun > 0.015),
    blocking.filter((r) => !(r.handOverGun > 0.015))
      .map((r) => `${r.id} sits ${(r.handOverGun * 1000).toFixed(0)}mm over the gun`).join(', '));

  /* The ratchet. */
  check(`no more than ${BASELINE_BLOCKING} weapons have a hand in the sight picture`,
    blocking.length <= BASELINE_BLOCKING,
    `${blocking.length} blocking, baseline ${BASELINE_BLOCKING}`);
  check(`and the worst is no worse than ${(BASELINE_WORST * 1000).toFixed(1)} mm`,
    worst.handOverSight <= BASELINE_WORST + 1e-4,
    `${(worst.handOverSight * 1000).toFixed(1)} mm on ${worst.id}`);

  if (blocking.length < BASELINE_BLOCKING || worst.handOverSight < BASELINE_WORST - 0.001) {
    note(`RATCHET: this is better than the baseline. Lower BASELINE_BLOCKING to `
      + `${blocking.length} and BASELINE_WORST to ${worst.handOverSight.toFixed(4)}.`);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
