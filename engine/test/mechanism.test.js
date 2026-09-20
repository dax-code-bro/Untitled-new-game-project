#!/usr/bin/env node
/* DOES EVERY GUN'S ACTION MOVE, IN BOTH GAMES?
 *
 * Bunker Nine has driven its weapons' moving parts for a while --
 * action.test.js holds it to that. Multiplayer builds the SAME weapons,
 * the same serviceArm with the same bolt and cylinder and hammer and
 * cover hanging off it, and drove NONE of them: seventy-five guns firing
 * with a dead receiver, a flash at the muzzle and nothing behind it.
 * Counted at the time, in mp-game.js: `bolt` 0, `cylinder` 0, `hammer`
 * 0, `cover` 0, `belt` 0, `forend` 0, `swing` 0.
 *
 * This walks the whole multiplayer roster through the real viewmodel,
 * fires each one, reloads it, and reports how far each moving part it
 * owns actually travelled. A part that never moves is named.
 *
 * Usage: node engine/test/mechanism.test.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..', '..') + '/';
let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log('  ok   ' + n); }
  else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/mp-data.js'])
    await p.addScriptTag({ content: fs.readFileSync(R + f, 'utf8') });

  const r = await p.evaluate(() => {
    const LE = window.LE, D = window.MP_DATA;
    const G = LE.create({ canvas: '#game', quality: 'low', gravity: 0 });
    /* Build each weapon the way the viewmodel does and pose it through
       a whole cycle, reading the parts out. No match needed: the
       question is whether poseAction moves what the model carries. */
    const PARTS = ['bolt', 'slide', 'cylinder', 'hammer', 'cover', 'belt', 'forend',
      'swing', 'lever', 'mag'];
    const VMF = window.VM_FALLBACK || {};
    const out = [];
    for (const g of D.GUNS) {
      let arm = null;
      for (const nm of [g.id, VMF[g.id], g.base, 'm4']) {
        if (!nm) continue;
        try { arm = G.serviceArm(nm, { at: [0, -90, 0], physics: false }); } catch (e) { arm = null; }
        if (arm) break;
      }
      if (!arm) { out.push({ id: g.id, none: true }); continue; }
      const act = LE.weaponAction(g);
      const has = PARTS.filter((n) => arm[n]);
      /* POSITION AND ROTATION BOTH. The first version of this measured
         position only, and reported a revolver's cylinder as dead --
         a cylinder does not go anywhere, it turns. */
      const span = {};
      for (const n of has) span[n] = { p: [1e9, -1e9], r: [1e9, -1e9] };
      const read = () => {
        for (const n of has) {
          const a = arm[n], q = a.rotation;
          const pm = Math.abs(a.position.x) + Math.abs(a.position.y) + Math.abs(a.position.z);
          const rm = q ? Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) : 0;
          span[n].p[0] = Math.min(span[n].p[0], pm); span[n].p[1] = Math.max(span[n].p[1], pm);
          span[n].r[0] = Math.min(span[n].r[0], rm); span[n].r[1] = Math.max(span[n].r[1], rm);
        }
      };
      /* A shot, then a reload, sampled right through both. */
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        LE.poseAction(arm, act, { fire: Math.sin(u * Math.PI), hand: Math.sin(u * Math.PI),
          reload: 0, trigger: u < 0.5 ? u * 2 : 2 - u * 2, rounds: i, spin: u });
        read();
      }
      for (let i = 0; i <= 24; i++) {
        LE.poseAction(arm, act, { fire: 0, hand: 0, reload: i / 24, trigger: 0, rounds: i, spin: 0 });
        read();
      }
      const moved = {};
      for (const n of has) moved[n] = +Math.max(span[n].p[1] - span[n].p[0],
        span[n].r[1] - span[n].r[0]).toFixed(4);
      /* WHICH PART THIS ACTION IS ABOUT. "Something moved" is too weak a
         question -- a hammer twitching does not make a break gun open --
         so each action names the group that IS its mechanism, and the
         check is whether THAT one moved. */
      const KEY = { selfLoading: ['bolt', 'slide'], belt: ['bolt', 'slide'],
        /* NO FALLBACKS on these two. A pump gun racks its FOREND and a
           lever gun swings its LEVER; letting either fall back to the
           bolt made the check pass on four shotguns and a carbine that
           have no forend or lever group at all, which is the exact gap
           this test exists to name. */
        manual: ['bolt', 'slide'], pump: ['forend'], lever: ['lever'],
        revolver: ['cylinder', 'mag'], break: ['swing'], rotary: ['cylinder'], energy: [] };
      const kind = Object.keys(LE.WEAPON_ACTIONS).find((k) => LE.WEAPON_ACTIONS[k] === act);
      out.push({ id: g.id, fam: g.fam, act: g.act || null, kind, has, moved,
        key: (KEY[kind] || []).filter((n) => arm[n]) });
    }
    return out;
  });

  const noModel = r.filter((q) => q.none);
  console.log(`   ${r.length} weapons, ${noModel.length} with no model`);
  const byAct = {};
  for (const q of r) if (!q.none) (byAct[q.kind] = byAct[q.kind] || []).push(q.id);
  console.log('   actions across the roster:');
  for (const k of Object.keys(byAct).sort())
    console.log(`     ${k.padEnd(12)} ${String(byAct[k].length).padStart(2)}  ${byAct[k].slice(0, 9).join(' ')}`);

  const dead = r.filter((q) => !q.none && q.key.length
    && !q.key.some((n) => q.moved[n] > 1e-4));
  const unmodelled = r.filter((q) => !q.none && q.kind !== 'energy' && !q.key.length);
  console.log('');
  check('every weapon in the multiplayer roster has a model', noModel.length === 0,
    noModel.map((q) => q.id).join(', '));
  check('and every one of them has a part that can move',
    r.every((q) => q.none || q.has.length > 0),
    r.filter((q) => !q.none && !q.has.length).map((q) => q.id).join(', '));
  check('every action has the group it is about modelled',
    unmodelled.length === 0,
    unmodelled.map((q) => q.id + ' is a ' + q.kind + ' and carries only ' + q.has.join('+')).join(', '));
  check('and that group actually moves when the gun is worked',
    dead.length === 0, dead.map((q) => q.id + ' (' + q.kind + ', '
      + q.key.map((n) => n + ' ' + q.moved[n]).join(' ') + ')').join(', '));

  /* The ones whose action is not what their family says. A family is a
     shelf in a menu: "Pump and break" holds four pumps and a double. */
  const odd = r.filter((q) => q.act);
  console.log(`   ${odd.length} weapons declare an action their family cannot give them:`);
  console.log('     ' + odd.map((q) => q.id + '=' + q.kind).join(' '));
  check('the odd ones out carry their own action', odd.length >= 9,
    `${odd.length}`);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
