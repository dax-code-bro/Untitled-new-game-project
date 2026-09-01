/* Every gun against every magazine it will take.
 *
 * Three faults this is here to catch, all of which shipped:
 *
 *   An attachment drawn as WELL as the part it stands in for -- two
 *   magazines in one well, one inside the other, which is what "the
 *   extended mag went over the current magazine" was.
 *
 *   An attachment that is fitted and not drawn at all.
 *
 *   Any weapon that cannot survive being given one, fired and reloaded.
 *
 * Deliberately NOT written as "count the visible parts and predict the
 * difference". That needs to know how many pieces the fitted part has, how
 * many the gun's own magazine has, and how many of those were visible to
 * begin with -- the Arc Breaker's cell has a glow that is not always on --
 * and two attempts at it flagged fourteen correct guns and then sixteen.
 * Both things that matter can simply be looked at.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });
  const r = await p.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    const run = (n) => { for (let i = 0; i < n; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1/60); } };
    __T.buildPool(4); __T.god(true); __T.killAll(); run(20);
    const A = __T_SYS.ATTACH, P = B.S.player;
    const GUNS = Object.keys(__T_WEAPONS).filter((k) => !__T_WEAPONS[k].melee);
    // Which parts each gun will actually accept.
    const allowed = {};
    for (const g of GUNS) {
      allowed[g] = Object.keys(A.parts).filter((k) => !(A.parts[k].bans || []).includes(g));
    }
    const out = { doubles: [], errs: [], combos: 0, guns: GUNS.length };
    const visibleParts = (v) => {
      const root = v.kind === 'single' ? v.actor : v.root;
      const seen = [];
      const walk = (a) => { if (a.mesh && a.visible !== false) seen.push(a); for (const c of (a.children || [])) walk(c); };
      walk(root);
      return seen;
    };
    /* Nothing may hang in the air.
     *
     * "Make sure the animations are good and nothing's hovering in the
     *  air. No mags are sideways."
     *
     * Measured, not looked at: for every gun and every part it will take,
     * how far is the NEAREST piece of the weapon from the nearest piece of
     * the attachment. A part bolted to a gun touches it. Three faults came
     * out of this the first time it was run -- every muzzle device on both
     * pistols and the Thompson screwed to a point in front of the barrel,
     * and a claw hammer wearing a magazine. */
    const gunPts = (v, skip) => {
      const root = v.kind === 'single' ? v.actor : v.root;
      const pts = [];
      const walk = (a, local, into, bare) => {
        if (a.mesh && (bare || !skip.has(a))) {
          const geo = B.game.geometryOf(a.mesh);
          if (geo && geo.positions) {
            const q = geo.positions, m = local ? local.e : null;
            for (let i = 0; i < q.length; i += 27) {
              let x = q[i], y = q[i+1], z = q[i+2];
              if (m) {
                const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
                const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
                const wz = m[2]*x + m[6]*y + m[10]*z + m[14];
                x = wx; y = wy; z = wz;
              }
              into.push(x, y, z);
            }
          }
        }
        for (const c of (a.children || [])) {
          const cm = new LegendEngine.Mat4();
          cm.compose(c._position, c._rotation, c.scale);
          if (local) { const t = new LegendEngine.Mat4(); t.mulMatrices(local, cm); walk(c, t, into, bare); }
          else walk(c, cm, into, bare);
        }
      };
      walk(root, null, pts, false);
      return { pts, walk };
    };
    out.floating = [];
    for (const g of GUNS) {
      const v = P.view[g];
      if (!v || !v.att) continue;
      const skip = new Set();
      if (v.arms) for (const q of v.arms.parts) skip.add(q);
      for (const arr of Object.values(v.att)) for (const q of arr) skip.add(q);
      if (v.prop) for (const q of v.prop.parts) skip.add(q);
      const { pts, walk } = gunPts(v, skip);
      if (!pts.length) continue;
      const near = (x, y, z) => {
        let best = 1e9;
        for (let i = 0; i < pts.length; i += 3) {
          const dx = pts[i]-x, dy = pts[i+1]-y, dz = pts[i+2]-z;
          const d = dx*dx + dy*dy + dz*dz;
          if (d < best) best = d;
        }
        return Math.sqrt(best);
      };
      for (const [name, arr] of Object.entries(v.att)) {
        if (!arr.length || (A.parts[name].bans || []).includes(g)) continue;
        const ap = [];
        const m0 = new LegendEngine.Mat4();
        m0.compose(arr[0]._position, arr[0]._rotation, arr[0].scale);
        walk(arr[0], m0, ap, true);
        if (!ap.length) continue;
        let gap = 1e9;
        for (let i = 0; i < ap.length; i += 3) {
          const d = near(ap[i], ap[i+1], ap[i+2]);
          if (d < gap) gap = d;
        }
        if (gap > 0.030) out.floating.push(g + '/' + name + ' ' + Math.round(gap * 1000) + ' mm');
      }
    }

    for (const g of GUNS) {
      const parts = allowed[g];
      const mags = parts.filter((k) => A.parts[k].slot === 'mag');
      for (const m of mags) {
        try {
          P.fitted[g] = {};
          P.give(g); run(6);
          P.fitted[g] = { mag: m };
          __T_SYS.applyAttachmentLooks(B.game, P, g);
          run(6);
          /* Asked directly rather than inferred from a count.
           *
           * Counting visible parts before and after and predicting the
           * difference needs to know how many pieces the fitted part has,
           * how many the gun's own magazine has, and how many of those were
           * visible to begin with -- the Arc Breaker's cell has a glow that
           * is not always on. Two attempts at that arithmetic flagged
           * fourteen correct guns. The two things that actually matter can
           * each be looked at: is the fitted part on the gun, and is the
           * part it replaces off it. */
          const v2 = P.view[g];
          const fittedParts = (v2.att && v2.att[m]) || [];
          const fittedOn = fittedParts.filter((a) => a.visible !== false).length;
          const own2 = v2.magOwn || [];
          const ownOn = own2.filter((a) => a.visible !== false).length;
          const shouldReplace = !!(v2.magSwap && v2.magSwap.length);
          if (fittedParts.length && fittedOn !== fittedParts.length) {
            out.doubles.push({ g, m, why: 'fitted part not shown',
              on: fittedOn, of: fittedParts.length });
          } else if (shouldReplace && ownOn > 0) {
            out.doubles.push({ g, m, why: 'gun keeps its own magazine too',
              ownStillVisible: ownOn, of: own2.length });
          }

          // And it has to survive being used.
          for (let k = 0; k < 3; k++) { __T.hold({ fire: true }); run(4); __T.release(); run(4); }
          B.S.player.ammoFor(g).mag = 0; run(4);
          run(Math.ceil((P.spec().reload || 3) * 60) + 40);
          out.combos++;
        } catch (e) { out.errs.push(g + '/' + m + ': ' + e.message); }
      }
      P.fitted[g] = {};
      __T_SYS.applyAttachmentLooks(B.game, P, g);
    }
    return out;
  });
  await b.close();

  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log(`  ok   ${name}`); }
    else { failed++; console.log(`  FAIL ${name}`); if (detail) console.log('       ' + detail); }
  };
  console.log('');
  console.log(`attachments: ${r.guns} weapons, ${r.combos} magazine fittings driven through`);
  console.log('');
  check('every gun survives every magazine, fired and reloaded', r.errs.length === 0,
    r.errs.slice(0, 6).join('\n       '));
  const notShown = r.doubles.filter((d) => d.why === 'fitted part not shown');
  check('a fitted magazine is actually on the gun', notShown.length === 0,
    notShown.map((d) => `${d.g}/${d.m}: ${d.on} of ${d.of} pieces shown`).join('\n       '));
  const kept = r.doubles.filter((d) => d.why === 'gun keeps its own magazine too');
  check('a magazine that replaces one takes the old one away', kept.length === 0,
    kept.map((d) => `${d.g}/${d.m}: ${d.ownStillVisible} of ${d.of} still visible`).join('\n       '));
  check('no attachment hangs in the air beside its gun',
    (r.floating || []).length === 0, (r.floating || []).slice(0, 6).join(', '));
  check('nothing threw', errs.length === 0, errs.slice(0, 4).join(' | '));
  console.log('');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
