#!/usr/bin/env node
/* THE CRATE, THE LOCK, FOUR WIRES AND A BLOWTORCH
 *
 * What was asked for:
 *
 *   "for every map there's three different locations it can be and it
 *   is a small crate ... you have to do a little animation that lasts
 *   20 seconds and you will not be able to move during this ... your
 *   character will pull out some wire cutters and they'll cut the lock
 *   of the storage tank and then you have to walk inside the storage
 *   tank and disarm the bomb inside. The wire is randomized. There is a
 *   blue wire, a red wire, a green wire and a yellow wire. If you do
 *   not succeed, the bomb will activate a fail safe, where you now have
 *   10 seconds to pick the right wire ... if they cut open the storage
 *   tank, your character grabs a blowtorch, puts the doors back
 *   together and then fuses the lock back together."
 *
 * Every clause in that is a number or a rule, and every one of them is
 * checked here. The mode is driven headless -- the rules and the bodies,
 * no rendering -- so a whole match is a second and the wire can be cut
 * a hundred times.
 *
 * WHY THE HOLD IS TESTED BY MOVING THE MAN. The complaint that started
 * it was an animation you could walk away from while it carried on
 * saying you were doing it, so a test that reads a flag called `busy`
 * and believes it is testing nothing. This drives the same control()
 * the player's keyboard drives, with the stick hard over, and measures
 * whether he went anywhere.
 *
 * Usage: node engine/test/snd.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAPS = ['helipad', 'resort', 'town', 'demolition'];

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
  await page.setContent('<body style="margin:0"><canvas id="game" '
    + 'style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/mp-data.js',
    'site/games/mp-maps.js', 'site/games/mp-match.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }

  /* ---------------- the two tools ---------------- */
  const tools = await page.evaluate(() => {
    const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
    const out = {};
    /* GEOMETRY COMES FROM THE ENGINE'S OWN MAP, not off the actor.
       `actor.mesh` is a GpuMesh -- buffers on the card -- and it has no
       `.geometry` at all, so the first cut of this read undefined,
       reported len: null, and then PASSED a check that null is smaller
       than 30 cm. A dimension that does not exist is not a small
       dimension. Every number below is required to be finite. */
    const look = (a) => {
      if (!a) return null;
      let lo = Infinity, hi = -Infinity, verts = 0;
      const walk = (act) => {
        const g = G.geometryOf(act.mesh);
        if (!g) return;
        verts += g.positions.length / 3;
        for (let i = 0; i < g.positions.length; i += 3) {
          if (g.positions[i] < lo) lo = g.positions[i];
          if (g.positions[i] > hi) hi = g.positions[i];
        }
      };
      walk(a);
      for (const n of a.partNames) if (a[n] && a[n] !== a) walk(a[n]);
      return { parts: a.partNames.slice(),
        len: verts ? +(hi - lo).toFixed(3) : null,
        verts: verts,
        muzzle: a.muzzleAt != null ? +a.muzzleAt.toFixed(3) : null,
        hold: a.holdAt ? a.holdAt.map((v) => +v.toFixed(3)) : null };
    };
    out.cut = look(G.wireCutters({ at: [0, -90, 0], physics: false }));
    out.torch = look(G.blowtorch({ at: [0, -90, 0], physics: false }));
    /* Not the same object twice, which is what a fallback to a rifle
       would have given -- and what every tool would have been before
       these existed. */
    out.differ = JSON.stringify(out.cut) !== JSON.stringify(out.torch);
    return out;
  });
  note(`cutters ${tools.cut.len} m, ${tools.cut.verts} verts, parts ${tools.cut.parts}`);
  note(`torch   ${tools.torch.len} m, ${tools.torch.verts} verts, parts ${tools.torch.parts}`);
  check('there is a pair of wire cutters and it has two jaws and a grip',
    tools.cut.parts.length === 3 && tools.cut.verts > 400, JSON.stringify(tools.cut));
  check('and a blowtorch with a bottle, a head and a flame',
    tools.torch.parts.indexOf('flame') >= 0 && tools.torch.verts > 400,
    JSON.stringify(tools.torch));
  check('they are hand sized, not rifle sized',
    Number.isFinite(tools.cut.len) && Number.isFinite(tools.torch.len)
    && tools.cut.len > 0.08 && tools.cut.len < 0.30
    && tools.torch.len > 0.10 && tools.torch.len < 0.40,
    `${tools.cut.len} / ${tools.torch.len}`);
  check('and both say where they are held',
    !!tools.cut.hold && !!tools.torch.hold);
  check('they are not the same model', tools.differ);

  /* ---------------- three sites, and a tank on each ---------------- */
  const geo = await page.evaluate((maps) => {
    const out = {};
    for (const id of maps) {
      if (window.G) { try { window.G.dispose(); } catch (e) { /* nothing to lose */ } }
      const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
      const M = MP_MAPS.build(G, id);
      out[id] = {
        n: M.sites.length,
        tanks: M.sites.filter((s) => s.tank && s.tank.doors.length === 2 && s.tank.lock).length,
        /* Two sites 4 m apart are one site. */
        minGap: Math.round(Math.min(...M.sites.flatMap((a, i) =>
          M.sites.slice(i + 1).map((b) =>
            Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2]))))),
        /* The doors have to face the ground you stand on, not the wall
           behind. Standing point to tank centre, against the facing. */
        facing: M.sites.every((s) => {
          const t = s.tank; if (!t) return false;
          const dx = t.at[0] - s.at[0], dz = t.at[2] - s.at[2];
          return Math.hypot(dx, dz) > 1.5 && Math.hypot(dx, dz) < 3.5;
        }),
        /* And the lock has to be on the door side of the tank. */
        lockOut: M.sites.every((s) => {
          const t = s.tank, L = t.lock.position;
          const toYou = [s.at[0] - t.at[0], s.at[2] - t.at[2]];
          const toLock = [L.x - t.at[0], L.z - t.at[2]];
          return toYou[0] * toLock[0] + toYou[1] * toLock[1] > 0;
        }),
      };
    }
    return out;
  }, MAPS);
  for (const id of MAPS) {
    note(`${id}: ${geo[id].n} sites, ${geo[id].tanks} tanks, closest pair ${geo[id].minGap} m`);
  }
  check('three sites on every map', MAPS.every((m) => geo[m].n === 3),
    MAPS.map((m) => `${m} ${geo[m].n}`).join(', '));
  check('and a tank with two doors and a lock on each',
    MAPS.every((m) => geo[m].tanks === 3),
    MAPS.map((m) => `${m} ${geo[m].tanks}`).join(', '));
  check('the three are not the same place',
    MAPS.every((m) => geo[m].minGap >= 12), MAPS.map((m) => `${m} ${geo[m].minGap}`).join(', '));
  check('the tank stands behind the ground you work from',
    MAPS.every((m) => geo[m].facing), MAPS.filter((m) => !geo[m].facing).join(', '));
  check('and the lock is on the side you can reach',
    MAPS.every((m) => geo[m].lockOut), MAPS.filter((m) => !geo[m].lockOut).join(', '));

  /* ---------------- the sequence, driven by hand ---------------- */
  const seq = await page.evaluate(() => {
    if (window.G) { try { window.G.dispose(); } catch (e) { /* nothing to lose */ } }
    const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
    const M = window.M = MP_MATCH.start({
      game: G, mapId: 'town', mode: 'snd', headless: true, youBot: false, seed: 11,
    });
    const D = 1 / 60;
    const step = (n) => { for (let i = 0; i < n; i++) M.update(D); };
    const out = {};

    // Past the opening freeze, then plant by hand so the test is about
    // the tank and not about whether bots found the site this seed.
    step(320);
    const B = M.bomb;
    const site = M.map.sites[B.want];
    out.wiresNamed = MP_MATCH.SND.wires.slice().sort().join(',');
    out.budget = MP_MATCH.SND.lock + MP_MATCH.SND.inside;
    out.failsafeLen = MP_MATCH.SND.failsafe;

    const atk = M.people.filter((p) => p.team === B.attackers);
    const def = M.people.filter((p) => p.team === B.defenders);

    /* PINNED EVERY TICK, NOT ONCE. Placing everybody and then stepping
       two hundred frames is placing nobody: the bots walk. The first cut
       of this measured the job at 15.6 s instead of 20 because two other
       defenders had wandered onto the tank and were helping, and the
       plant in the second block never happened at all because the man
       holding the bomb strolled off the site. */
    const pin = (only, x, z) => {
      M.people.forEach((p) => {
        p.alive = true; p.hp = 500;
        if (p === only) { p.pos.x = x; p.pos.z = z; } else { p.pos.x = 90; p.pos.z = 90; }
      });
    };
    const run = (n, only, x, z) => { for (let i = 0; i < n; i++) { pin(only, x, z); M.update(D); } };
    run(200, atk[0], site.at[0], site.at[2]);   // he plants it
    out.planted = B.planted;
    out.tankArmed = !!(B.tank && B.tank.wires.length === 4);
    out.correctIsAWire = B.tank && B.tank.wires.indexOf(B.tank.correct) >= 0;
    out.shutAtPlant = B.tank && !B.tank.open;

    // The planter leaves; one defuser arrives, and only one.
    const t0 = M.time;
    run(30, def[0], site.at[0], site.at[2]);
    out.heldWhileCutting = !!def[0].busy && def[0].busy.kind === 'cut';

    /* THE HOLD, MEASURED BY TRYING TO WALK. Same control() the player's
       keyboard goes through, stick hard forward, for a full second. */
    M.you = def[0];
    const p0 = { x: def[0].pos.x, z: def[0].pos.z };
    for (let i = 0; i < 60; i++) {
      M.people.forEach((q) => { if (q !== def[0]) { q.pos.x = 90; q.pos.z = 90; } });
      MP_MATCH.control(M, { yaw: 2.0, pitch: 0, forward: 1, right: 1, run: true, fire: true }, D);
      M.update(D);
    }
    out.walkedWhileHeld = +Math.hypot(def[0].pos.x - p0.x, def[0].pos.z - p0.z).toFixed(2);
    out.yawFollowedMouse = Math.abs(def[0].yaw - 2.0) < 0.05;

    // Run the lock out.
    let guard = 0;
    while (!B.tank.open && guard++ < 4000) { pin(def[0], site.at[0], site.at[2]); M.update(D); }
    out.cutAt = +(M.time - t0).toFixed(1);
    out.doorsOpen = B.tank.open;
    out.lockGone = site.tank ? site.tank.lock.visible === false : null;

    // And the inside work.
    guard = 0;
    while (!B.tank.ready && guard++ < 4000) { pin(def[0], site.at[0], site.at[2]); M.update(D); }
    out.readyAt = +(M.time - t0).toFixed(1);
    out.heldAtWires = !!def[0].busy && def[0].busy.kind === 'wires';

    /* A wrong wire. Which wire is wrong is whichever is not the one, so
       the test never has to know the answer -- which is the point. */
    const wrong = B.tank.wires.filter((w) => w !== B.tank.correct)[0];
    out.wrongResult = MP_MATCH.cutWire(M, def[0], wrong, function () {});
    out.failsafeArmed = +B.tank.failsafe.toFixed(1);
    out.sameWireAgain = MP_MATCH.cutWire(M, def[0], wrong, function () {});
    // A second wrong one must not buy another ten seconds.
    const wrong2 = B.tank.wires.filter((w) => w !== B.tank.correct && w !== wrong)[0];
    step(60);
    const before2 = B.tank.failsafe;
    MP_MATCH.cutWire(M, def[0], wrong2, function () {});
    out.noExtraTime = B.tank.failsafe <= before2 + 0.01;

    // The right one, in time.
    out.rightResult = MP_MATCH.cutWire(M, def[0], B.tank.correct, function () {});
    out.defusedEvent = M.events.filter((e) => e.kind === 'defuse').length;
    out.releasedAfter = !def[0].busy;
    return out;
  });
  note(`the four wires are ${seq.wiresNamed}`);
  note(`lock cut at ${seq.cutAt}s, wires live at ${seq.readyAt}s `
    + `(budget ${seq.budget}s), failsafe ${seq.failsafeLen}s`);
  note(`held man walked ${seq.walkedWhileHeld} m with the stick hard over`);

  check('the wires are blue, green, red and yellow',
    seq.wiresNamed === 'blue,green,red,yellow', seq.wiresNamed);
  check('a plant arms the tank with four wires and one answer',
    seq.planted && seq.tankArmed && seq.correctIsAWire && seq.shutAtPlant,
    JSON.stringify({ planted: seq.planted, armed: seq.tankArmed,
      answer: seq.correctIsAWire, shut: seq.shutAtPlant }));
  check('cutting the lock takes hold of the man', seq.heldWhileCutting);
  check('and he cannot walk out of it', seq.walkedWhileHeld < 0.05,
    `${seq.walkedWhileHeld} m`);
  check('nor turn away from it', !seq.yawFollowedMouse,
    'the mouse still turned him');
  check('the lock comes off, and so does the padlock',
    seq.doorsOpen === true && seq.lockGone === true,
    `open=${seq.doorsOpen} padlockHidden=${seq.lockGone}`);
  check('the whole job is twenty seconds',
    Math.abs(seq.readyAt - seq.budget) < 1.2 && Math.abs(seq.budget - 20) < 0.01,
    `${seq.readyAt}s against a budget of ${seq.budget}s`);
  check('and it holds him all the way to the wires', seq.heldAtWires);
  check('a wrong wire arms the failsafe at ten seconds',
    seq.wrongResult === 'wrong' && Math.abs(seq.failsafeArmed - 10) < 0.2,
    `${seq.wrongResult}, ${seq.failsafeArmed}s`);
  check('the same wire cannot be cut twice', seq.sameWireAgain === 'no', seq.sameWireAgain);
  check('a second wrong one does not buy more time', seq.noExtraTime);
  check('the right wire defuses it and lets him go',
    seq.rightResult === 'defused' && seq.defusedEvent > 0 && seq.releasedAfter,
    JSON.stringify({ r: seq.rightResult, ev: seq.defusedEvent, free: seq.releasedAfter }));

  /* ---------------- the failsafe running out, and the blowtorch ------- */
  const rest = await page.evaluate(() => {
    if (window.G) { try { window.G.dispose(); } catch (e) { /* nothing to lose */ } }
    const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
    const D = 1 / 60;
    const out = {};

    function freshPlanted(seed) {
      const M = MP_MATCH.start({ game: G, mapId: 'resort', mode: 'snd',
        headless: true, youBot: true, seed: seed });
      for (let i = 0; i < 320; i++) M.update(D);
      const B = M.bomb, site = M.map.sites[B.want];
      const atk = M.people.filter((p) => p.team === B.attackers);
      const pin = (only) => M.people.forEach((p) => {
        p.alive = true; p.hp = 500;
        if (p === only) { p.pos.x = site.at[0]; p.pos.z = site.at[2]; }
        else { p.pos.x = 90; p.pos.z = 90; }
      });
      for (let i = 0; i < 260; i++) { pin(atk[0]); M.update(D); }
      return { M: M, B: B, site: site, pin: pin,
        atk: atk, def: M.people.filter((p) => p.team === B.defenders) };
    }

    /* ---- let the ten seconds run out ---- */
    let s = freshPlanted(21);
    if (!s.B.tank) return { noPlant: true };
    let g = 0;
    while (!s.B.tank.ready && g++ < 6000) { s.pin(s.def[0]); s.M.update(D); }
    /* HE STOPS BEING A BOT FIRST. A bot standing at the wires goes on
       picking during the failsafe, which is right -- of course he tries
       again -- but it means the first run of this measured a bot's
       second guess (4.7 s, defused) and called it the failsafe. To
       measure how long the ten seconds are, nobody may cut anything. */
    s.def[0].bot = false;
    const wrong = s.B.tank.wires.filter((w) => w !== s.B.tank.correct)[0];
    MP_MATCH.cutWire(s.M, s.def[0], wrong, function () {});
    const round0 = s.M.round, score0 = s.M.score[s.B.attackers];
    g = 0;
    while (s.M.round === round0 && !s.M.over && g++ < 1200) { s.pin(s.def[0]); s.M.update(D); }
    out.failsafeBlew = s.M.score[s.B.attackers] > score0 || s.M.over;
    out.failsafeSeconds = +(g * D).toFixed(1);

    /* ---- and the blowtorch ---- */
    s = freshPlanted(33);
    if (!s.B.tank) return { noPlant: true };
    g = 0;
    while (!s.B.tank.open && g++ < 6000) { s.pin(s.def[0]); s.M.update(D); }
    out.openedForWeld = s.B.tank.open;
    const insideWas = s.B.tank.inside;
    // The defuser is killed off it and one of the other side walks up.
    s.def[0].alive = false; s.def[0].busy = null;
    s.def[0].pos.x = 90; s.def[0].pos.z = 90;
    g = 0;
    while (s.B.tank.open && g++ < 6000) {
      s.pin(s.atk[0]);
      s.def[0].alive = false; s.def[0].busy = null; s.def[0].pos.x = 90; s.def[0].pos.z = 90;
      s.M.update(D);
    }
    out.weldedShut = !s.B.tank.open;
    out.weldSeconds = +(g * D).toFixed(1);
    out.cutBackToZero = s.B.tank.cut === 0 && s.B.tank.inside === 0;
    out.lockBack = s.site.tank ? s.site.tank.lock.visible !== false : null;
    out.hadProgress = insideWas >= 0;
    out.weldEvents = s.M.events.filter((e) => e.kind === 'weld').length;
    return out;
  });
  check('the bomb got planted for the second half of this', !rest.noPlant);
  note(`failsafe ran out after ${rest.failsafeSeconds}s; `
    + `the blowtorch took ${rest.weldSeconds}s`);
  check('letting the failsafe run out detonates it', rest.failsafeBlew);
  check('and it takes about ten seconds to do so',
    rest.failsafeSeconds > 8 && rest.failsafeSeconds < 13, `${rest.failsafeSeconds}s`);
  check('a cut-open tank can be blowtorched shut again',
    rest.openedForWeld && rest.weldedShut,
    `opened=${rest.openedForWeld} shut=${rest.weldedShut}`);
  check('and that puts the work back to nothing', rest.cutBackToZero);
  check('with the padlock fused back on', rest.lockBack === true, String(rest.lockBack));
  check('the weld is reported', rest.weldEvents > 0, `${rest.weldEvents} events`);

  /* ---------------- and the panel a player actually sees ------------ */
  /* A SECOND PAGE ON THE REAL URL, not an iframe inside this one. The
     harness page is built with setContent, which has no file:// origin
     for a relative src to resolve against, so the iframe would have
     loaded nothing and the check would have "passed" by never running. */
  const uiPage = await browser.newPage({ viewport: { width: 900, height: 560 } });
  uiPage.on('pageerror', (e) => errors.push('ui: ' + e.message.split('\n')[0]));
  await uiPage.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
    + '?map=town&mode=snd');
  await uiPage.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  const ui = await uiPage.evaluate(() => {
    const M = window.MP.match, D = 1 / 60;
    const panel = document.querySelector('#mpui .tank');
    if (!panel) return { noPanel: true };
    const out = { hiddenAtFirst: !panel.classList.contains('on') };

    for (let i = 0; i < 320; i++) M.update(D);
    const B = M.bomb, site = M.map.sites[B.want];
    const you = M.you;
    /* The player has to be on the DEFUSING side for any of this to be
       his to do, so the round is handed to him rather than hoped for. */
    B.attackers = you.team === 'a' ? 'b' : 'a';
    B.defenders = you.team;
    const planter = M.people.filter((q) => q !== you && q.team === B.attackers)[0];
    const pin = (who) => M.people.forEach((q) => {
      q.alive = true; q.hp = 500;
      if (q === who) { q.pos.x = site.at[0]; q.pos.z = site.at[2]; }
      else { q.pos.x = 90; q.pos.z = 90; }
    });
    for (let i = 0; i < 260; i++) { pin(planter); M.update(D); }
    out.planted = !!(B.planted && B.tank);
    if (!out.planted) return out;

    let g = 0;
    while (!B.tank.ready && g++ < 6000) { pin(you); M.update(D); }
    out.ready = B.tank.ready;
    pin(you); M.update(D);
    window.MP.hud.paint(0.02, false, 0);
    out.panelUp = panel.classList.contains('on') && panel.classList.contains('pick');
    out.buttons = panel.querySelectorAll('.wires b').length;
    out.labels = Array.from(panel.querySelectorAll('.wires b'))
      .map((b) => b.className).join(',');
    out.jobText = panel.querySelector('.job').textContent;
    /* WHAT IS IN HIS HANDS. The viewmodel names whatever it last
       selected, so this is the swap itself and not a guess from the
       fact that the HUD is up. A man cutting a padlock with a rifle is
       the same class of fault as a lever you can walk away from. */
    out.gunId = (M.you.guns[M.you.held].id) || (M.you.guns[M.you.held].base);
    return out;
  });
  if (ui.noPanel) check('the HUD has a tank panel', false);
  else {
    note(`panel: ${ui.buttons} wire buttons (${ui.labels}), reading "${ui.jobText}"`);
    check('the panel is not furniture when there is nothing to do', ui.hiddenAtFirst);
    check('the page reaches the wires', ui.planted && ui.ready,
      JSON.stringify({ planted: ui.planted, ready: ui.ready }));
    check('and puts four buttons up', ui.panelUp && ui.buttons === 4,
      `up=${ui.panelUp} n=${ui.buttons}`);
  }

  /* WHAT IS IN HIS HANDS, after the PAGE'S OWN FRAME has run.
     The viewmodel is placed by the render loop, not by M.update, so
     reading it straight after stepping the match reads whatever was in
     his hands before any of this started -- which is how the first cut
     of this reported a rifle and was right to. */
  if (!ui.noPanel && ui.ready) {
    const held = await uiPage.evaluate(() => new Promise((done) => {
      const M = window.MP.match, you = M.you;
      const site = M.map.sites[M.bomb.want];
      let n = 0;
      const tick = () => {
        you.pos.x = site.at[0]; you.pos.z = site.at[2];
        if (++n < 12) return requestAnimationFrame(tick);
        done({ now: window.MP.viewmodel.state.gun, busy: you.busy && you.busy.kind });
      };
      requestAnimationFrame(tick);
    }));
    note(`in his hands: ${held.now} (his gun is ${ui.gunId}, job ${held.busy})`);
    check('he is holding wire cutters, not his rifle',
      held.now === 'tool-cutters' && held.now !== ui.gunId, String(held.now));
  }

  /* THE KEY, THROUGH THE REAL HANDLER. Which number is the right one is
     looked up from the match, so the test never has to know the answer
     -- it presses the key for the wire the match says is the one, the
     same way a player who has guessed right does. Pressed with the
     page's own key path rather than by calling cutWire, because what is
     being checked here is the wiring between the two. */
  if (!ui.noPanel && ui.ready) {
    const cut = await uiPage.evaluate(() => new Promise((done) => {
      const M = window.MP.match, B = M.bomb;
      const you = M.you, site = M.map.sites[B.want];
      const idx = B.tank.wires.indexOf(B.tank.correct) + 1;
      const before = M.score[B.defenders];
      window.MP.input._press(String(idx));
      /* The page's own loop runs the frame that reads the key. */
      let n = 0;
      const tick = () => {
        M.people.forEach((q) => {
          if (q === you) { q.pos.x = site.at[0]; q.pos.z = site.at[2]; }
        });
        if (++n < 20) return requestAnimationFrame(tick);
        done({ cut: M.events.some((e) => e.kind === 'defuse')
          || M.score[B.defenders] > before, freed: !you.busy, pressedKey: idx });
      };
      requestAnimationFrame(tick);
    }));
    note(`pressed ${cut.pressedKey} for the right wire`);
    check('pressing the number cuts that wire', cut.cut && cut.freed,
      JSON.stringify(cut));
  }
  await uiPage.close();

  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
