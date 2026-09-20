#!/usr/bin/env node
/* IS THE MAN ACROSS THE STREET ACTUALLY HOLDING HIS WEAPON?
 *
 * For the whole life of this multiplayer mode he was not. The stock
 * humanoid set has nineteen clips in it and not one of them holds a
 * gun -- they are all locomotion, and every one swings both arms like
 * a man jogging empty-handed. The weapon's place was solved from the
 * pelvis and the facing, the hands came from the skeleton, and nothing
 * ever reconciled the two: measured on a bot with `aiming` true, hands
 * at y 0.12 and 0.21 against a head at 0.57, with a rifle floating at
 * his shoulder held by nobody.
 *
 * Both halves of that are now solved -- the arms are run onto the
 * weapon with two-bone IK from the animator's onPosed hook -- and both
 * halves can be measured, which is the point of this file. Renders
 * cannot settle it: the harness that photographs a combatant freezes
 * the game to pose him and its own notes warn that the limb poses in
 * its photographs cannot be trusted. Distances can.
 *
 * WHAT IT ASKS, of every weapon class, hip and shouldered:
 *
 *   IS THE FIRING HAND ON THE GRIP?  svcSpec puts every weapon's
 *   origin at its grip, so this is one subtraction. Two centimetres is
 *   a hand's thickness; anything beyond that is a hand in mid-air.
 *
 *   IS THE SUPPORT HAND ON THE FOREND, and is it the FAR hand? Both
 *   hands solving to the same end of the weapon is a specific failure
 *   mode of getting the two targets the same way round, and it reads
 *   as praying rather than as holding.
 *
 *   ARE HIS FOREARMS ACROSS HIS OWN FACE?  This is what the first
 *   working version looked like: the weapon was carried to within
 *   1.5 cm of the centre line on the sights, so the hands came to the
 *   nose and both arms crossed the head. A rifle goes in the shoulder
 *   pocket and the head comes across to it.
 *
 *   ARE THE ELBOWS BELOW THE HANDS?  An arm supporting a weapon breaks
 *   downwards. An elbow above its own hand is the pole vector pointing
 *   the wrong way, which is the other half of what an untested IK
 *   solver gets wrong.
 *
 * Usage: node engine/test/hold.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.waitForTimeout(2000);

  /* One subject, stood next to us so the level of detail keeps his
     weapon drawn, and handed a different gun for each measurement.
     GUNS is the real accessor on MP_DATA -- the first version of the
     roster test reached for WEAPONS, measured nothing, and passed. */
  const r = await page.evaluate(async () => {
    const M = window.MP.match, LEx = window.LE;
    const foe = M.people.find((p) => p.id !== M.you.id && p.actor);
    M.people.forEach((p) => {
      if (p !== foe && p !== M.you) {
        p.alive = false; p.respawnAt = 1e9;
        if (p.actor) p.actor.visible = false;
      }
    });
    foe.pos.x = M.you.pos.x + 3; foe.pos.z = M.you.pos.z; foe.pos.y = M.you.pos.y;
    foe.lastGood = { x: foe.pos.x, y: foe.pos.y, z: foe.pos.z };
    foe.yaw = 0; foe.pitch = 0; foe.bot = false;

    const GUNS = (window.MP_DATA && window.MP_DATA.GUNS) || [];
    const byId = {};
    GUNS.forEach((g) => { byId[g.id] = g; });
    /* One from each family that is drawn a different way: a hand-built
       viewmodel weapon, a service-table rifle, a pistol, a machine gun,
       a bolt rifle and a bullpup. A hold that works on an assault rifle
       and not on a pistol is a hold that works on one arm length. */
    const WANT = ['mp5', 'ak47', 'm1911', 'mg42', 'remington', 'p90',
      'thompson', 'sawnoff', 'm4a1', 'scar'];
    const subjects = WANT.filter((id) => byId[id]);

    const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const out = { measured: [], guns: GUNS.length, missing: WANT.filter((id) => !byId[id]) };
    const v = new LEx.Vec3();
    const pos = (sk, n) => { const i = sk.index(n); if (i < 0) return null;
      const o = new LEx.Vec3(); sk.worldPosition(i, o); return o; };

    for (const id of subjects) {
      for (const aiming of [false, true]) {
        foe.guns[foe.held] = Object.assign({}, foe.guns[foe.held], byId[id], { id });
        foe._armCache = null;
        foe.aiming = aiming;
        /* Let the ADS ease settle rather than assuming it snaps: the
           carry eases to the shoulder the same way the viewmodel does. */
        foe._adsT = aiming ? 1 : 0;
        /* AND PIN THE POSE. This subject is a bot in a live match, so
           without this it is measured in whatever cycle it happens to be
           running and at whatever phase -- and three runs of one
           unchanged build returned 20 cm, 20 cm and 14 cm for the same
           weapon. Six centimetres of scatter cannot decide anything, and
           it decided several things before anyone checked: two separate
           "improvements" to the reach were measured against it and both
           readings were noise. A man aiming a rifle is standing still;
           hold it there. */
        foe.actor.animator.play('idle', 0);
        foe.actor.animator.speed = 0;
        foe.actor.animator.time = 0;
        for (let i = 0; i < 6; i++) {
          foe.actor.animator.time = 0;
          await frame();
        }
        const a = foe.actor, sk = a.skeleton, g = foe._reachGun;
        if (!g) { out.measured.push({ id, aiming, noWeapon: true }); continue; }
        a.updateMatrix();
        const inv = new LEx.Mat4().copy(a.matrix).invert();
        const gripL = new LEx.Vec3(g.position.x, g.position.y, g.position.z).applyMat4(inv);
        const muzzleAt = g.muzzleAt != null ? g.muzzleAt : 0.42;
        const boreAt = g.boreAt != null ? g.boreAt : 0.05;
        /* The same point the reach aims the support hand at, worked out
           independently here so the test is not just reading back the
           number the game used. */
        const fw = new LEx.Vec3(muzzleAt * 0.62, boreAt * 0.42, 0).applyQuat(g.rotation);
        const foreL = new LEx.Vec3(g.position.x + fw.x, g.position.y + fw.y,
          g.position.z + fw.z).applyMat4(inv);

        const hR = pos(sk, 'handR'), hL = pos(sk, 'handL');
        const eR = pos(sk, 'lowerArmR'), eL = pos(sk, 'lowerArmL');
        const head = pos(sk, 'head');
        /* THE SUPPORT HAND IS CHECKED AGAINST THE WEAPON, NOT AGAINST
           ONE POINT ON IT. Asking for the hand at 62% of the way to
           the muzzle would fail every long gun on purpose: the reach
           chokes up when the arm will not stretch that far, which is
           what a person does. So measure the two things that actually
           matter -- how far the hand is OFF the weapon's axis, and how
           far along it the hand ended up. */
        const axis = new LEx.Vec3(foreL.x - gripL.x, foreL.y - gripL.y, foreL.z - gripL.z);
        const span = Math.hypot(axis.x, axis.y, axis.z) || 1e-6;
        axis.x /= span; axis.y /= span; axis.z /= span;
        const rel = new LEx.Vec3(hL.x - gripL.x, hL.y - gripL.y, hL.z - gripL.z);
        const along = rel.x * axis.x + rel.y * axis.y + rel.z * axis.z;
        const offAxis = Math.hypot(rel.x - axis.x * along, rel.y - axis.y * along,
          rel.z - axis.z * along);

        const rec = {
          id, aiming,
          gripMiss: +hR.distanceTo(gripL).toFixed(4),
          foreMiss: +hL.distanceTo(foreL).toFixed(4),
          offAxis: +offAxis.toFixed(4),
          along: +along.toFixed(4),
          wanted: +span.toFixed(4),
          /* How far apart the hands ended up, against how far apart
             their two targets are. */
          handSpan: +hR.distanceTo(hL).toFixed(4),
          targetSpan: +gripL.distanceTo(foreL).toFixed(4),
          /* Nearest approach of either hand to the head bone. */
          headClearR: +hR.distanceTo(head).toFixed(4),
          headClearL: +hL.distanceTo(head).toFixed(4),
          elbowBelowHandR: +(eR.y - hR.y).toFixed(4),
          elbowBelowHandL: +(eL.y - hL.y).toFixed(4),
          gripLocal: [+gripL.x.toFixed(3), +gripL.y.toFixed(3), +gripL.z.toFixed(3)],
        };
        out.measured.push(rec);
      }
    }
    return out;
  });

  note(`${r.guns} weapons in the table; measured ${r.measured.length} holds`
    + (r.missing.length ? `; not found: ${r.missing.join(',')}` : ''));

  check('the weapon table was actually reached', r.guns > 20, `${r.guns} guns`);
  check('and a hold was measured for every subject, hip and shouldered',
    r.measured.length >= 12 && !r.measured.some((m) => m.noWeapon),
    `${r.measured.length} holds, ${r.measured.filter((m) => m.noWeapon).length} with no weapon drawn`);

  const real = r.measured.filter((m) => !m.noWeapon);
  const worst = (key) => real.reduce((a, b) => (b[key] > a[key] ? b : a), real[0]);

  const wGrip = worst('gripMiss');
  note(`worst firing hand: ${wGrip.id} ${wGrip.aiming ? 'shouldered' : 'hip'} `
    + `${(wGrip.gripMiss * 1000).toFixed(0)} mm off the grip`);
  check('the firing hand is on the grip of every weapon',
    real.every((m) => m.gripMiss < 0.02),
    real.filter((m) => m.gripMiss >= 0.02).slice(0, 4)
      .map((m) => `${m.id}${m.aiming ? '/ads' : ''} ${(m.gripMiss * 1000).toFixed(0)}mm`).join(', '));

  const wFore = worst('offAxis');
  note(`worst support hand: ${wFore.id} ${wFore.aiming ? 'shouldered' : 'hip'} `
    + `${(wFore.offAxis * 1000).toFixed(0)} mm off the weapon's axis`);
  note('choke: ' + real.filter((m) => m.aiming)
    .map((m) => `${m.id} ${(m.along * 100).toFixed(0)}/${(m.wanted * 100).toFixed(0)}cm`)
    .join(' '));
  check('the support hand is on the weapon, not in mid-air beside it',
    real.every((m) => m.offAxis < 0.02),
    real.filter((m) => m.offAxis >= 0.02).slice(0, 5)
      .map((m) => `${m.id}${m.aiming ? '/ads' : ''} ${(m.offAxis * 1000).toFixed(0)}mm`).join(', '));

  /* AND FAR ENOUGH FORWARD TO BE A SECOND GRIP. Choking up shortens
     this; it must not collapse it.

     THE FIRST VERSION OF THIS ASKED FOR 10 cm AND WENT GREEN ON A POSE
     THAT WAS STILL WRONG. Every weapon in the rack, from a pistol to an
     MG42, was choking to exactly 12 cm -- which is the giveaway, since
     the limit then depends only on where the shoulder and the grip are
     and not at all on the weapon -- and 12 cm apart is two hands
     touching, not a rifle being held. A hand's breadth clear of the
     other hand is the floor for anything longer than a pistol, so ask
     for what the weapon actually wanted, capped at the 22 cm past which
     it stops mattering. */
  const SECOND_GRIP = 0.22;
  const wantAlong = (m) => Math.min(m.wanted, SECOND_GRIP) - 0.01;
  check('the support hand is far enough forward to be a second grip',
    real.every((m) => m.along >= wantAlong(m)),
    real.filter((m) => m.along < wantAlong(m)).slice(0, 5)
      .map((m) => `${m.id}${m.aiming ? '/ads' : ''} ${(m.along * 100).toFixed(1)}cm, `
        + `wanted ${(wantAlong(m) * 100).toFixed(0)}cm`).join(', '));

  /* BOTH HANDS AT THE SAME END is the failure this catches: the hands
     must end up as far apart as the reach asked them to be. */
  check('the two hands are at opposite ends of the weapon, not bunched together',
    real.every((m) => m.handSpan > Math.min(m.targetSpan, m.along + 0.02) * 0.8),
    real.filter((m) => m.handSpan <= Math.min(m.targetSpan, m.along + 0.02) * 0.8).slice(0, 4)
      .map((m) => `${m.id} hands ${(m.handSpan * 100).toFixed(0)}cm vs `
        + `${(m.along * 100).toFixed(0)}cm apart on the weapon`).join(', '));

  /* A hand within 12 cm of the head bone is a hand over the face. */
  const nearest = real.reduce((a, b) =>
    (Math.min(b.headClearR, b.headClearL) < Math.min(a.headClearR, a.headClearL) ? b : a), real[0]);
  note(`closest a hand comes to the head: ${nearest.id} `
    + `${nearest.aiming ? 'shouldered' : 'hip'} `
    + `${(Math.min(nearest.headClearR, nearest.headClearL) * 100).toFixed(1)} cm`);
  check('neither hand is across his own face',
    real.every((m) => m.headClearR > 0.12 && m.headClearL > 0.12),
    real.filter((m) => m.headClearR <= 0.12 || m.headClearL <= 0.12).slice(0, 4)
      .map((m) => `${m.id}${m.aiming ? '/ads' : ''} `
        + `${(Math.min(m.headClearR, m.headClearL) * 100).toFixed(1)}cm`).join(', '));

  /* Elbows break downwards. A tolerance rather than zero, because a
     support elbow on a shouldered weapon comes up nearly level. */
  check('both elbows break downwards, not up over the hands',
    real.every((m) => m.elbowBelowHandR < 0.04 && m.elbowBelowHandL < 0.04),
    real.filter((m) => m.elbowBelowHandR >= 0.04 || m.elbowBelowHandL >= 0.04).slice(0, 4)
      .map((m) => `${m.id}${m.aiming ? '/ads' : ''} R+${(m.elbowBelowHandR * 100).toFixed(0)} `
        + `L+${(m.elbowBelowHandL * 100).toFixed(0)}cm`).join(', '));

  /* THE SHOULDERED WEAPON GOES IN THE POCKET, NOT ON THE STERNUM. His
     right is -X in this frame (see face()), so a shouldered weapon's
     grip should sit a clear distance to negative x of the centre line. */
  const ads = real.filter((m) => m.aiming);
  const offsets = ads.map((m) => -m.gripLocal[0]);
  const minOff = Math.min.apply(null, offsets);
  note(`shouldered weapons sit ${(minOff * 100).toFixed(1)}-`
    + `${(Math.max.apply(null, offsets) * 100).toFixed(1)} cm to his firing side`);
  check('a shouldered weapon is in the shoulder pocket, not on the centre line',
    minOff > 0.04, `nearest ${(minOff * 100).toFixed(1)} cm off centre`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
