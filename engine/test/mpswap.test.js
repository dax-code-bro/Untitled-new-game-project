#!/usr/bin/env node
/* THE SWAP AND THE INSPECT, in multiplayer, measured.
 *
 * Multiplayer's weapon swap was `p.held = 1 - p.held` -- the gun in your
 * hands became a different gun between one frame and the next. The one
 * thing a swap IS, is a pair of animations: the old weapon goes down out
 * of the frame and the new one comes up into it. Neither exists if the
 * exchange happens in the same tick.
 *
 * And there was no inspect at all, in either game.
 *
 * Both are now shared with zombies, so what this asks is whether the two
 * halves reach each other: the MATCH owns the clock, the VIEWMODEL owns
 * the movement, and a clock nothing reads is the fault worth catching.
 *
 *   1. Does the slot hold still while the gun is going down?
 *   2. Does it change at the bottom, where nothing can see it?
 *   3. Does the weapon actually clear the bottom of the frame while the
 *      exchange happens? A swap you can see through is not a swap.
 *   4. Do BOTS get their swap run? beginReload calls beginSwap when you
 *      are out of reserve, and a swap nothing advances leaves a bot
 *      holding an empty gun for the rest of the match.
 *   5. Does the inspect run, move the weapon, and put it back?
 *   6. Does firing cancel the inspect without snapping the weapon?
 *
 * Usage: node engine/test/mpswap.test.js
 */
const path = require('path');

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

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 264 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push((e.message.split('\n')[0]) + ' @ '
    + String(e.stack || '').split('\n').slice(1, 3).join(' <- ').trim()));
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.evaluate(() => window.MP.input._lock(true));

  const r = await page.evaluate(async () => {
    const G = window.MP, M = G.match, vm = G.viewmodel, input = G.input;
    const out = {};
    const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const settle = async (n) => { for (let i = 0; i < n; i++) await frame(); };
    const you = M.you;
    you.alive = true;
    await settle(10);

    /* ---- 1-3. THE SWAP ---- */
    const held0 = you.held;
    const trace = [];
    /* The same reader a keyboard feeds: press, let the frame see it,
       release. A test that called the match directly would pass with
       the input layer disconnected. */
    input._press('q');
    for (let i = 0; i < 70; i++) {
      await frame();
      trace.push({ held: you.held, left: +(you.swapUntil - M.time).toFixed(4),
        forT: +(you.swapFor || 0).toFixed(4), oy: +(vm.state.oy || 0).toFixed(4) });
      if (!you.swapUntil && i > 3) break;
    }
    out.held0 = held0;
    out.heldEnd = you.held;
    out.frames = trace.length;
    out.dur = trace.length ? trace[0].forT : 0;
    /* The frame the slot changed on, as a fraction of the whole swap. */
    let at = -1;
    for (let i = 0; i < trace.length; i++) {
      if (trace[i].held !== held0) { at = i; break; }
    }
    out.changedAt = at;
    out.changedFrac = at >= 0 && out.dur > 0
      ? +(1 - trace[at].left / out.dur).toFixed(3) : -1;
    /* The resting height, and the lowest the gun got while it swapped. */
    const rest = vm.state.oy;
    let lowest = 9;
    for (const t of trace) if (t.oy < lowest) lowest = t.oy;
    out.restOy = +rest.toFixed(4);
    out.dropped = +(rest - lowest).toFixed(4);

    /* ---- 4. A BOT'S SWAP IS ADVANCED BY SOMEBODY ---- */
    /* The defect this is for: runSwap ran inside the human command path
       only. beginReload calls beginSwap when you are out of reserve, so
       a bot that emptied its primary would set a swap that nothing ever
       advanced and stand there holding an empty gun for the rest of the
       match -- twelve of them, every match.

       Set the state beginSwap sets, rather than waiting for a bot to
       see an enemy and pull the trigger on an empty gun: whether a bot
       ASKS for a swap is its brain's business and it is not what broke.
       Whether anything RUNS one for it is. */
    const bot = M.people.find((p) => p.bot && p.alive);
    if (bot) {
      bot.held = 0;
      bot.swapFor = 0.5;
      bot.swapUntil = M.time + 0.5;
      bot.swapTo = 1;
      const t0 = M.time;
      let swapped = false, cleared = false;
      for (let i = 0; i < 120; i++) {
        await frame();
        if (bot.held === 1) swapped = true;
        if (swapped && !bot.swapUntil) { cleared = true; break; }
      }
      out.botSwapped = swapped;
      out.botCleared = cleared;
      out.botTook = +(M.time - t0).toFixed(2);
    } else out.botSwapped = 'no bot';

    /* ---- 5-6. THE INSPECT ---- */
    await settle(20);
    const before = { oy: vm.state.oy, oz: vm.state.oz, ins: vm.state.ins || 0 };
    input._press('i');
    /* Wait for the press to be SEEN. The input layer clears its
       one-shot table at the end of every frame, so a press made between
       the game's read and its endFrame is gone -- and counting frames
       from the press rather than from the start measures the alignment
       of two requestAnimationFrame loops, not the animation. */
    for (let i = 0; i < 20 && !(vm.state.ins > 0); i++) {
      await frame();
      if (!(vm.state.ins > 0)) input._press('i');
    }
    out.inspectStarted = vm.state.ins > 0;
    /* IN SECONDS, NOT FRAMES. The first version of this counted frames
       with `ins > 0` and wanted most of forty of them; it got nineteen
       and I nearly went looking for a cancel. The page renders in
       software GL at about nine frames a second, so nineteen frames IS
       the whole two-second animation. A frame count measures the
       machine the test is running on. */
    const t0i = M.time;
    let moved = 0, ran = 0, maxIns = 0, ended = -1;
    for (let i = 0; i < 40; i++) {
      await frame();
      const s = vm.state;
      if ((s.ins || 0) > 0) { ran++; if ((s.ins || 0) > maxIns) maxIns = s.ins; }
      else if (ran > 0 && ended < 0) ended = M.time - t0i;
      moved = Math.max(moved, Math.abs(s.oz - before.oz) + Math.abs(s.oy - before.oy));
      if (ended >= 0) break;
    }
    out.inspectRan = ran;
    out.inspectSecs = +(ended >= 0 ? ended : M.time - t0i).toFixed(2);
    out.inspectReached = +maxIns.toFixed(3);
    out.inspectWhole = ended >= 0;
    out.inspectMoved = +moved.toFixed(4);
    /* And put it back for the cancel test below, since the loop above
       may have run it to the end. */
    if (!(vm.state.ins > 0)) {
      for (let i = 0; i < 12 && !(vm.state.ins > 0); i++) {
        input._press('i'); await frame();
      }
    }
    /* Cancel it by firing, and watch how far the weapon jumps in one
       frame. A cut teleports; a fade does not. */
    let jump = 0, prev = { y: vm.state.oy, z: vm.state.oz };
    input.buttons.fire = true;
    for (let i = 0; i < 24; i++) {
      await frame();
      const d = Math.abs(vm.state.oy - prev.y) + Math.abs(vm.state.oz - prev.z);
      if (d > jump) jump = d;
      prev = { y: vm.state.oy, z: vm.state.oz };
    }
    input.buttons.fire = false;
    out.cancelJump = +jump.toFixed(4);
    out.insAfterCancel = +(vm.state.ins || 0).toFixed(3);
    await settle(30);
    out.oyBack = +(vm.state.oy - before.oy).toFixed(4);
    return out;
  });

  console.log('\n  ' + JSON.stringify(r, null, 1).replace(/\n/g, '\n  ') + '\n');

  check('the swap takes real time', r.dur > 0.2 && r.dur < 1.2, 'dur ' + r.dur);
  check('the slot does not change on the frame you ask for it', r.changedAt > 0,
    'changed at frame ' + r.changedAt);
  check('it changes at the midpoint, out of sight',
    r.changedFrac > 0.35 && r.changedFrac < 0.65, 'at ' + r.changedFrac);
  check('and you end up holding the other weapon', r.heldEnd !== r.held0,
    r.held0 + ' -> ' + r.heldEnd);
  check('the weapon clears the frame while the exchange happens',
    r.dropped > 0.12, 'dropped ' + r.dropped + ' m');
  check("a bot's swap is advanced and finished by somebody",
    r.botSwapped === true && r.botCleared === true,
    'swapped ' + r.botSwapped + ', cleared ' + r.botCleared + ', ' + r.botTook + 's');
  check('the inspect runs for its whole length',
    r.inspectStarted && r.inspectWhole
      && r.inspectSecs > 1.6 && r.inspectSecs < 2.9 && r.inspectReached > 0.9,
    r.inspectSecs + 's over ' + r.inspectRan + ' frames, reached '
      + r.inspectReached);
  check('and it moves the weapon', r.inspectMoved > 0.02, String(r.inspectMoved));
  check('firing cancels it', r.insAfterCancel === 0, String(r.insAfterCancel));
  check('and the cancel does not snap the weapon', r.cancelJump < 0.02,
    r.cancelJump + ' m in one frame');
  check('the weapon comes back to where it was', Math.abs(r.oyBack) < 0.004,
    String(r.oyBack));
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
