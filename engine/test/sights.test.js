#!/usr/bin/env node
/* Can you see through the sights?
 *
 * Six weapons shipped with something solid parked on their own sight line:
 * the Thompson's rear peep with no hole in it, the Mauser's hammer built at
 * x = 0 and floating in the middle of the frame, the shotguns' top lever
 * standing eleven millimetres above the bead, the Paralyzer's charge tube
 * lying along the rib, the Arc Breaker's iron sights mounted UNDER its
 * accelerator tube. Every one of them looked fine from outside; you only
 * find them by standing behind the gun.
 *
 * The obvious test — "is any vertex above the sight line" — is worse than
 * no test, and I wrote it and believed it for an hour. A hooded front post
 * is fifteen millimetres above the line all the way round, and so is an
 * aperture's ring, because you look THROUGH them. It flagged every good
 * sight on the gun and stayed quiet about the Mauser's hammer.
 *
 * So ask the question the eye asks. Fire a bundle of rays from behind the
 * rear sight, forward along the sight line, spread across a couple of
 * millimetres. A hood or an aperture ring lets the middle ones through. A
 * slab of receiver stops all of them. If every ray in the bundle dies on
 * the same part of the gun, the sight picture is walled.
 *
 * Geometry only, no browser: the builders leave their CPU-side meshes on
 * the engine as _armParts.
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('sight tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* maker -> the key its geometry is cached under. Scanning the whole cache
   reports the Paralyzer's coils as blocking the Mauser, which cost me a
   wrong fix once already. */
const GUNS = {
  thompson: ['thompson', 'thompson'],
  mp5: ['mp5', 'mp5'],
  scatter: ['scattergun', 'scatter'],
  sawnoff: ['sawnOff', 'sawnoff'],
  paralyzer: ['paralyzer', 'paralyzer'],
  mauser: ['mauserC96', 'c96'],
  obliterator: ['model5', 'mod5'],
  arc: ['arcBreaker', 'arc'],
  mg42: ['mg42', 'mg42'],
};

const SCAN = (GUNS) => {
/* Moller-Trumbore, far enough along the ray to be forward of the eye. */
function hit(p, d, a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (det > -1e-9 && det < 1e-9) return -1;
  const inv = 1 / det;
  const s = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const u = inv * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
  if (u < 0 || u > 1) return -1;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = inv * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
  if (v < 0 || u + v > 1) return -1;
  const t = inv * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
  return t > 1e-5 ? t : -1;
}

/* The bundle: the sight line itself and a ring of eight around it, at the
   radius a shooter's eye actually uses. Two millimetres is inside every
   aperture in the game and outside nothing.

   A ray "gets through" if it reaches the front sight — not the muzzle. The
   front sight is allowed to be in the way; that is its job, and a bead is a
   3.4 mm ball sitting exactly on the line, so a bundle this size dies in it
   every time on all three break-actions. Stopping the eye BEFORE the front
   sight is the fault. */
const R = 0.0020;
const FRONT = 0.040;      // the last 40 mm, where a front sight lives
const RAYS = [[0, 0]];
for (let i = 0; i < 8; i++) RAYS.push([Math.cos(i * Math.PI / 4) * R, Math.sin(i * Math.PI / 4) * R]);

  const g = LE.create({ canvas: '#game', quality: 'low' });
  const rows = [];
for (const id in GUNS) {
  const [maker, key] = GUNS[id];
  let body;
  try { body = g[maker]({ physics: false }); }
  catch (e) { rows.push({ id, err: e.message }); continue; }
  const sight = body.sightAt, muzzle = body.muzzleAt;
  const own = (g._armParts || {})[key];
  if (sight == null || !own) { rows.push({ id, err: 'no sight line or no cached geometry' }); continue; }

  /* Start behind the gun's own rear-most geometry so nothing is skipped,
     and stop at the muzzle. */
  const blockers = {};
  for (const [dy, dz] of RAYS) {
    const p = [-0.30, sight + dy, dz], d = [1, 0, 0];
    let best = Infinity, who = null;
    for (const name in own) {
      const geo = own[name];
      if (!geo || !geo.positions || !geo.indices) continue;
      const P = geo.positions, I = geo.indices;
      for (let i = 0; i + 2 < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const t = hit(p, d, [P[a], P[a + 1], P[a + 2]], [P[b], P[b + 1], P[b + 2]],
          [P[c], P[c + 1], P[c + 2]]);
        if (t > 0 && t < best && t - 0.30 < muzzle - FRONT) { best = t; who = name; }
      }
    }
    if (who) blockers[who] = (blockers[who] || 0) + 1;
  }
  const stopped = Object.values(blockers).reduce((a, n) => a + n, 0);
  const worst = Object.entries(blockers).sort((a, b) => b[1] - a[1])[0];
  rows.push({ id, stopped, total: RAYS.length, worst: worst ? worst[0] : null,
    worstN: worst ? worst[1] : 0 });
}
  return rows;
};

let passed = 0, failed = 0;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 160, height: 120 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent('<body><canvas id="game"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const rows = await page.evaluate(([src, GUNS]) => {
    // eslint-disable-next-line no-new-func
    return new Function('GUNS', 'LE', 'return (' + src + ')(GUNS)')(GUNS, window.LE);
  }, [SCAN.toString(), GUNS]);

  console.log('sight lines');
  for (const r of rows) {
    if (r.err) { failed++; console.log('  FAIL ' + r.id.padEnd(12) + r.err); continue; }
    if (r.stopped >= r.total) {
      failed++;
      console.log('  FAIL ' + r.id.padEnd(12) + 'walled: all ' + r.total + ' rays stopped, '
        + r.worstN + ' of them by "' + r.worst + '"');
    } else {
      passed++;
      console.log('  ok   ' + r.id.padEnd(12) + (r.total - r.stopped) + '/' + r.total
        + ' rays reach the muzzle'
        + (r.worst ? '   (the ring clips "' + r.worst + '", which is what a hood is for)' : ''));
    }
  }
  if (errors.length) { failed++; console.log('  FAIL page errors: ' + errors.join('; ')); }
  await browser.close();
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
