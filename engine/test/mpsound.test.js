#!/usr/bin/env node
/* DOES MULTIPLAYER MAKE A SOUND WHEN YOU PULL THE TRIGGER?
 *
 * It did not. Not thinly, not sharing voices between weapons -- there
 * was not one call into the audio engine anywhere in mp-game.js or
 * mp-match.js, so sixty guns, every impact and every footstep were
 * silent. Zombies has a hand-authored voice per weapon; this side had
 * nothing, and nothing is hard to notice in a screenshot.
 *
 * WHY THIS IS A TEST AND NOT A LISTEN. An AudioContext needs a user
 * gesture and SwiftShader has no audio device, so "play it and hear
 * it" is not available. What IS checkable is everything up to the
 * speaker: that a voice is derived for every weapon in the table, that
 * the numbers in it are finite and in range, and above all that they
 * DIFFER in the ways the physics says they must -- a subsonic .45 with
 * no supersonic crack, a full-power rifle with a large one, a .50 BMG
 * louder than a 9 mm. A derivation that returned the same voice sixty
 * times would pass a smoke test and fail the point.
 *
 * Usage: node engine/test/mpsound.test.js
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

/* voiceFor lives inside mp-game.js's IIFE, which starts a match on
   load. Lift the function out of the source and run it against the
   real MP_DATA rather than restating the formula here -- a restated
   formula tests itself. */
function liftVoiceFor() {
  const src = fs.readFileSync(path.join(ROOT, 'site/games/mp-game.js'), 'utf8');
  const i = src.indexOf('  var VOICES = {};');
  if (i < 0) return null;
  const j = src.indexOf('\n  }\n', src.indexOf('function voiceFor(spec) {', i));
  if (j < 0) return null;
  return src.slice(i, j + 4);
}

(async () => {
  const body = liftVoiceFor();
  if (!body) { console.log('  FAIL could not find voiceFor in mp-game.js'); process.exit(1); }

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/mp-data.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }

  const r = await page.evaluate((src) => {
    const W = window;
    // eslint-disable-next-line no-new-func
    const voiceFor = new Function('W', src + '; return voiceFor;')(W);
    const guns = W.MP_DATA.GUNS;
    const out = { rows: [], bad: [] };
    for (const g of guns) {
      const w = W.MP_DATA.build(g.id, []);
      const v = voiceFor(w);
      if (!v) { out.bad.push({ id: g.id, why: 'no voice' }); continue; }
      const [bore, o] = v;
      const nums = Object.keys(o).filter((k) => typeof o[k] === 'number');
      for (const k of nums) {
        if (!Number.isFinite(o[k])) out.bad.push({ id: g.id, why: k + ' is ' + o[k] });
      }
      if (!(bore > 0 && bore <= 1)) out.bad.push({ id: g.id, why: 'bore ' + bore });
      if (o.crack < 0) out.bad.push({ id: g.id, why: 'negative crack' });
      if (!(o.minGap > 0 && o.minGap < 60 / w.rpm)) {
        out.bad.push({ id: g.id, why: 'minGap ' + o.minGap + ' vs refire ' + (60 / w.rpm) });
      }
      out.rows.push({ id: g.id, cls: g.cls, mv: w.mv, bore: +bore.toFixed(3),
        crack: +o.crack.toFixed(3), mech: o.mech });
    }
    // Does the audio engine actually have the two entry points?
    const G = LE.create({ canvas: '#game', quality: 'low', gravity: 0 });
    out.hasReport = !!(G.audio && typeof G.audio.report === 'function');
    out.hasPing = !!(G.audio && typeof G.audio.ping === 'function');
    return out;
  }, body);

  const by = (id) => r.rows.find((x) => x.id === id);
  const m1911 = by('m1911'), fg42 = by('fg42'), barrett = by('barrett'),
    mp5 = by('mp5'), thompson = by('thompson');

  note(`${r.rows.length} voices derived`);
  if (r.bad.length) note('bad: ' + r.bad.slice(0, 6).map((b) => b.id + ': ' + b.why).join(', '));
  for (const g of [m1911, mp5, thompson, fg42, barrett]) {
    if (g) note(`${g.id}  mv ${g.mv}  bore ${g.bore}  crack ${g.crack}  mech ${g.mech}`);
  }

  check('the audio engine has report()', r.hasReport);
  check('the audio engine has ping() for the Garand clip', r.hasPing);
  check('every weapon in the table gets a voice', r.rows.length === 60, `${r.rows.length}`);
  check('and every number in it is finite and in range',
    r.bad.length === 0, r.bad.slice(0, 3).map((b) => b.id + ':' + b.why).join(', '));

  /* THE PHYSICS, which is the whole reason this is derived rather than
     typed sixty times. */
  check('a subsonic .45 has no supersonic crack worth the name',
    m1911 && m1911.crack < 0.35, m1911 ? String(m1911.crack) : 'missing');
  check('a full-power rifle round does',
    fg42 && fg42.crack > 0.9, fg42 ? String(fg42.crack) : 'missing');
  check('a .50 BMG is a bigger report than a 9 mm subgun',
    barrett && mp5 && barrett.bore > mp5.bore * 1.8,
    barrett && mp5 ? `${barrett.bore} vs ${mp5.bore}` : 'missing');
  check('an open-bolt subgun clatters more than a closed-bolt one',
    thompson && mp5 && thompson.mech > mp5.mech,
    thompson && mp5 ? `${thompson.mech} vs ${mp5.mech}` : 'missing');
  /* And they are not all the same sound wearing sixty names. */
  const distinct = new Set(r.rows.map((x) => x.bore.toFixed(2) + '/' + x.crack.toFixed(2)));
  check('the sixty voices are actually distinct', distinct.size > 30, `${distinct.size} distinct`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
