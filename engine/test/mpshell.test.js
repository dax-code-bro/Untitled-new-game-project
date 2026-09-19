#!/usr/bin/env node
/* The multiplayer screens, driven the way a player drives them.
 *
 * mpdata.test.js checks the tables. This checks that the menu built on
 * top of them actually works: that MULTIPLAYER is on the main menu,
 * that both tabs paint, that the lobby fills to twelve, that moving
 * down the attachment list changes the picture of the gun and every
 * stat bar under it, and that pressing the button puts the part on and
 * keeps it there.
 *
 * It also takes the screenshots, because the reason for a lot of this
 * is how it looks and a passing assertion has never once proved that.
 *
 * Usage: node engine/test/mpshell.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp';

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/bunker-nine.js',
    'site/games/coastline.js', 'site/games/mp-data.js', 'site/games/bunker-nine-shell.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }
  /* The real boot, minus the body model fetch, which has nothing to do
     with a menu and is the slowest step there is. */
  await page.evaluate(() => { window.__mpBoot = BUNKER_SHELL.boot({ canvas: '#game' }); });
  await page.waitForFunction(() => {
    const m = document.querySelector('#b9shell .menu');
    return m && m.classList.contains('on');
  }, null, { timeout: 120000 });

  const mainText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#b9shell .mainlist .item .t')).map((e) => e.textContent));
  check('MULTIPLAYER is on the main menu', mainText.some((t) => /multiplayer/i.test(t)),
    mainText.join(' | '));

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#b9shell .mainlist .item'));
    const r = rows.find((e) => /multiplayer/i.test(e.querySelector('.t').textContent));
    r.click();
  });
  await page.waitForTimeout(300);

  const lob = await page.evaluate(() => ({
    on: !!document.querySelector('#b9shell .mp.on'),
    tab: !!document.querySelector('#b9shell .lobtab.sel'),
    modes: document.querySelectorAll('#b9shell .modelist .pick').length,
    maps: document.querySelectorAll('#b9shell .mplist .pick').length,
    roster: document.querySelectorAll('#b9shell .roster .slotline').length,
    teams: document.querySelectorAll('#b9shell .roster .team').length,
    me: document.querySelectorAll('#b9shell .roster .slotline.me').length,
    trainer: document.querySelectorAll('#b9shell .train svg .rig').length,
    who: (document.querySelector('#b9shell .mphead .who b') || {}).textContent || '',
    go: !!document.querySelector('#b9shell .go'),
  }));
  check('the multiplayer screen opened', lob.on);
  check('it opens on the lobby tab', lob.tab);
  check('two modes are listed', lob.modes === 2, String(lob.modes));
  check('four maps are listed', lob.maps === 4, String(lob.maps));
  check('the lobby is two teams of six', lob.teams === 2 && lob.roster === 12,
    `${lob.teams} teams, ${lob.roster} names`);
  check('exactly one of the twelve is you', lob.me === 1, String(lob.me));
  check('the operator is on the range behind it', lob.trainer === 1, String(lob.trainer));
  check('the lobby names the operator', lob.who.length > 0, lob.who);
  check('there is a button', lob.go);
  await page.screenshot({ path: path.join(OUT, 'mp-lobby.jpg'), type: 'jpeg', quality: 82 });

  /* Choosing a mode has to stick, and has to change what the card says. */
  const modeSwap = await page.evaluate(() => {
    document.querySelectorAll('#b9shell .modelist .pick')[1].click();
    /* Re-queried, because choosing repaints the list and the node that
       was clicked is no longer the node in the document. */
    return {
      on: document.querySelectorAll('#b9shell .modelist .pick')[1].classList.contains('on'),
      head: document.querySelector('#b9shell .lobinfo h3').textContent,
      saved: BUNKER_SHELL.mpState().mode,
    };
  });
  check('picking the second mode takes', modeSwap.on && /search/i.test(modeSwap.head)
    && modeSwap.saved === 'snd', modeSwap.head + ' / saved ' + modeSwap.saved);

  const mapSwap = await page.evaluate(() => {
    const picks = document.querySelectorAll('#b9shell .mplist .pick');
    picks[3].click();
    return document.querySelector('#b9shell .lobinfo h3').textContent;
  });
  check('picking a map repaints the card', /demolition/i.test(mapSwap), mapSwap);
  await page.screenshot({ path: path.join(OUT, 'mp-lobby-snd.jpg'), type: 'jpeg', quality: 82 });

  /* ---- loadout ---- */
  await page.evaluate(() => document.querySelector('#b9shell .loadtab').click());
  await page.waitForTimeout(250);
  const lo = await page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll('#b9shell .lslot:not(.head)'));
    return {
      tab: !!document.querySelector('#b9shell .loadtab.sel'),
      pane: !!document.querySelector('#b9shell .loadout.on'),
      slots: slots.length,
      keys: slots.map((s) => s.querySelector('.k').textContent),
      vals: slots.map((s) => s.querySelector('.v').textContent),
      opts: document.querySelectorAll('#b9shell .dlist .opt').length,
      heads: document.querySelectorAll('#b9shell .dlist .sec').length,
    };
  });
  check('the loadout tab paints', lo.tab && lo.pane);
  /* THREE killstreak slots, not five -- see mp-data's STREAK_SLOTS.
     The rail in the match shows three and the loadout has to agree
     with it, or the fourth and fifth are picked and never appear. */
  check('every slot the spec asks for is there',
    ['Primary', 'Secondary', 'Tactical', 'Lethal', 'Ability'].every((k) => lo.keys.includes(k))
    && lo.keys.filter((k) => ['One', 'Two', 'Three'].includes(k)).length === 3
    && !lo.keys.includes('Four') && !lo.keys.includes('Five'),
    lo.keys.join(','));
  check('nothing in the loadout is empty', lo.vals.every((v) => v && v !== '—'), lo.vals.join(' | '));
  check('the primary list opens on the gun list', lo.opts >= 40 && lo.heads >= 6,
    `${lo.opts} guns in ${lo.heads} classes`);
  await page.screenshot({ path: path.join(OUT, 'mp-loadout.jpg'), type: 'jpeg', quality: 82 });

  /* Every one of them is reachable from this screen, across the
     primary and the secondary between them. Counted against
     MP_DATA.GUNS rather than against a number written here, which is
     why this went on being true when sixty became seventy-five. */
  const reach = await page.evaluate(() => {
    const names = new Set();
    const pick = (label) => {
      const s = Array.from(document.querySelectorAll('#b9shell .lslot:not(.head)'))
        .find((e) => e.querySelector('.k').textContent === label);
      s.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      Array.from(document.querySelectorAll('#b9shell .dlist .opt .n'))
        .forEach((n) => names.add(n.textContent));
    };
    pick('Primary'); pick('Secondary');
    return { n: names.size, total: window.MP_DATA.GUNS.length };
  });
  check('every gun in the table is reachable in the menu', reach.n === reach.total,
    `${reach.n} of ${reach.total}`);

  /* ---- attachments: the preview, then the confirm ---- */
  const att = await page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll('#b9shell .lslot:not(.head)'));
    const a = slots.find((e) => e.querySelector('.k').textContent === 'Attachments');
    a.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const opts = Array.from(document.querySelectorAll('#b9shell .dlist .opt'));
    const free = opts.filter((o) => !o.classList.contains('locked'));
    if (!free.length) return { none: true, opts: opts.length };
    const artBefore = document.querySelector('#b9shell .gunart').innerHTML;
    const statsBefore = Array.from(document.querySelectorAll('#b9shell .stat .sv')).map((e) => e.textContent);
    free[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const artHover = document.querySelector('#b9shell .gunart').innerHTML;
    const statsHover = Array.from(document.querySelectorAll('#b9shell .stat .sv')).map((e) => e.textContent);
    const moved = document.querySelectorAll('#b9shell .stat.up, #b9shell .stat.down').length;
    const confirm = (document.querySelector('#b9shell .confirm .t') || {}).textContent || '';
    /* The whole pane, for the pros and cons, which are above the
       action rather than in it. */
    const pane = (document.querySelector('#b9shell .confirm') || {}).textContent || '';
    return {
      slots: document.querySelectorAll('#b9shell .dlist .sec').length,
      opts: opts.length, locked: opts.length - free.length,
      stats: statsBefore.length,
      artChanged: artBefore !== artHover,
      statsChanged: JSON.stringify(statsBefore) !== JSON.stringify(statsHover),
      moved, confirm, pane,
      name: free[0].querySelector('.n').textContent,
    };
  });
  check('a brand-new gun has something it can take', !att.none,
    att.none ? 'every one of ' + att.opts + ' parts was locked' : '');
  check('the attachment list is grouped by slot', att.slots >= 6, String(att.slots));
  check('there are attachments, and some of them are locked',
    att.opts >= 20 && att.locked > 0, `${att.opts} parts, ${att.locked} locked`);
  check('nine stat bars under the gun', att.stats === 9, String(att.stats));
  check('hovering a part puts it on the gun in the picture', att.artChanged, att.name);
  check('and moves the numbers', att.statsChanged && att.moved > 0,
    `${att.moved} bars moved`);
  check('and offers the confirm', /fit it/i.test(att.confirm), att.confirm);
  /* And the pros and cons, above it, measured off the fold rather than
     written down -- see effectsOf in mp-data. The confirm pane now
     leads with them, which is why the check above reads the whole
     pane's text rather than its first line. */
  check('with what the part does to this gun, in signs',
    /[+\u2212]\s*\d+%/.test(att.pane) || /changes nothing measurable/i.test(att.pane),
    (att.pane || '').slice(0, 140));
  await page.screenshot({ path: path.join(OUT, 'mp-attach.jpg'), type: 'jpeg', quality: 82 });

  const fitted = await page.evaluate(() => {
    const free = Array.from(document.querySelectorAll('#b9shell .dlist .opt'))
      .filter((o) => !o.classList.contains('locked'));
    free[0].click();
    const slots = Array.from(document.querySelectorAll('#b9shell .lslot:not(.head)'));
    const a = slots.find((e) => e.querySelector('.k').textContent === 'Attachments');
    return {
      count: a.querySelector('.v').textContent,
      marked: document.querySelectorAll('#b9shell .dlist .opt.fitted').length,
      saved: BUNKER_SHELL.mpState().loadout.primaryAtt.length,
    };
  });
  check('confirming fits the part', /1 of 5/.test(fitted.count), fitted.count);
  check('and it is marked in the list', fitted.marked >= 1, String(fitted.marked));
  check('and it is written down', fitted.saved === 1, String(fitted.saved));
  await page.screenshot({ path: path.join(OUT, 'mp-attach-fitted.jpg'), type: 'jpeg', quality: 82 });

  /* Five is the limit, and the sixth must be refused rather than
     silently dropped. */
  const cap = await page.evaluate(() => {
    const L = window.MP_DATA;
    for (let round = 0; round < 10; round++) {
      const opts = Array.from(document.querySelectorAll('#b9shell .dlist .opt'));
      const next = opts.find((o) => !o.classList.contains('locked')
        && !o.classList.contains('fitted') && o.querySelector('.r').textContent.trim() === '');
      if (!next) break;
      next.click();
    }
    /* Re-queried after the loop: every click repaints the left column,
       so a row captured before it is a node that is no longer in the
       document and reports whatever it said when it was detached. */
    const a = Array.from(document.querySelectorAll('#b9shell .lslot:not(.head)'))
      .find((e) => e.querySelector('.k').textContent === 'Attachments');
    const saved = BUNKER_SHELL.mpState().loadout;
    return {
      count: a.querySelector('.v').textContent,
      n: saved.primaryAtt.length,
      legal: L.checkLoadout(saved).length,
      noRoom: Array.from(document.querySelectorAll('#b9shell .dlist .opt .r'))
        .filter((e) => /no room/.test(e.textContent)).length,
    };
  });
  check('five attachments is the ceiling', cap.n === 5 && /5 of 5/.test(cap.count),
    `${cap.n} fitted, label ${cap.count}`);
  check('and the result is still a legal loadout', cap.legal === 0, String(cap.legal));
  check('the sixth part is refused rather than dropped', cap.noRoom > 0, String(cap.noRoom));
  await page.screenshot({ path: path.join(OUT, 'mp-attach-full.jpg'), type: 'jpeg', quality: 82 });

  /* ---- the rest of the slots all paint something ---- */
  const others = await page.evaluate(() => {
    const out = {};
    ['Tactical', 'Lethal', 'Ability', 'One', 'Camo', 'Keychain'].forEach((k) => {
      const s = Array.from(document.querySelectorAll('#b9shell .lslot:not(.head)'))
        .find((e) => e.querySelector('.k').textContent === k);
      s.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      out[k] = document.querySelectorAll('#b9shell .dlist .opt').length;
    });
    return out;
  });
  check('tactical, lethal and ability all list options',
    others.Tactical === 8 && others.Lethal === 8 && others.Ability >= 6, JSON.stringify(others));
  check('a killstreak slot lists the streaks', others.One >= 10, String(others.One));
  check('camo lists camos', others.Camo >= 8, String(others.Camo));
  check('the keychain says it is behind diamond', others.Keychain >= 1, String(others.Keychain));
  await page.screenshot({ path: path.join(OUT, 'mp-streaks.jpg'), type: 'jpeg', quality: 82 });

  /* ---- OPERATORS ----
     This tab shipped with no test at all, which is why "operators
     aren't showing up" reached the player rather than the bench. */
  const ops = await page.evaluate(() => {
    const tab = document.querySelector('#b9shell .optab');
    if (!tab) return { err: 'no OPERATORS tab in the header' };
    tab.click();
    const pane = document.querySelector('#b9shell .opspane');
    const rows = Array.from(document.querySelectorAll('#b9shell .oprow .nm'))
      .map((e) => e.textContent);
    return {
      tab: !!tab,
      on: !!(pane && pane.classList.contains('on')),
      rows: rows,
      name: (document.querySelector('#b9shell .opname') || {}).textContent || '',
      blurb: (document.querySelector('#b9shell .opblurb') || {}).textContent || '',
      fig: (document.querySelector('#b9shell .opfig') || {}).innerHTML.length || 0,
      stats: (document.querySelector('#b9shell .opstats') || {}).textContent || '',
    };
  });
  if (ops.err) check('the OPERATORS tab exists', false, ops.err);
  else {
    check('the OPERATORS tab opens its pane', ops.on);
    check('all seven operators are listed', ops.rows.length === 7,
      `${ops.rows.length}: ${ops.rows.join(',')}`);
    check('and they are the seven that were asked for',
      ['DESTROYER', 'CHARLIE', 'DELTA', 'ALPHA', 'ABSCESS', 'BIOHAZARD', 'SWAT']
        .every((n) => ops.rows.indexOf(n) >= 0), ops.rows.join(','));
    check('one of them is selected and described', ops.name.length > 2 && ops.blurb.length > 10,
      `${ops.name} / ${ops.blurb.slice(0, 40)}`);
    check('the selected one has a figure drawn', ops.fig > 200, `${ops.fig} chars of svg`);
    check('and his real numbers are shown', /HEIGHT|FRAME|REACH/.test(ops.stats),
      ops.stats.slice(0, 60));
  }

  /* Picking one has to stick, or the tab is a picture of a chooser. */
  const pick = await page.evaluate(() => {
    const rows = document.querySelectorAll('#b9shell .oprow');
    if (rows.length < 3) return { err: 'nothing to pick' };
    rows[4].click();
    return {
      saved: BUNKER_SHELL.mpState().operator,
      name: (document.querySelector('#b9shell .opname') || {}).textContent || '',
      onRow: !!document.querySelectorAll('#b9shell .oprow')[4].classList.contains('on'),
    };
  });
  if (pick.err) check('an operator can be picked', false, pick.err);
  else {
    check('picking one writes it down', pick.saved === 'abscess', String(pick.saved));
    check('and the panel follows the pick', /ABSCESS/i.test(pick.name), pick.name);
    check('and the row shows as chosen', pick.onRow);
  }
  await page.screenshot({ path: path.join(OUT, 'mp-operators.jpg'), type: 'jpeg', quality: 82 });

  /* ---- and back out ---- */
  const back = await page.evaluate(() => {
    document.querySelector('#b9shell .lobtab').click();
    const ok = !!document.querySelector('#b9shell .lobby.on');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { lobby: ok, menu: !!document.querySelector('#b9shell .menu.on') };
  });
  check('the tabs go back and forth', back.lobby);
  check('escape leaves multiplayer', back.menu);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n  shots in ${OUT}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
