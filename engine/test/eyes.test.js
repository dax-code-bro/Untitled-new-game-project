#!/usr/bin/env node
/* WHAT IT ACTUALLY LOOKS LIKE.
 *
 * Reported, repeatedly, and not yet believed by me with my own eyes:
 * the gun is invisible, there is no aiming down sights, everybody has
 * a blue coat of skin, the weapon models are undeveloped, and the
 * zombies walls and floors look like a broken screen.
 *
 * Every one of those is a claim about PIXELS, and I have been
 * answering them with claims about code. This takes the photographs:
 * the viewmodel at the hip and at the sight, a man up close, and the
 * zombies floor and wall. It also samples the actual colour of a
 * body's torso, because "blue coat of skin" is a measurable thing and
 * arguing about it from the material table is how a whole session gets
 * wasted.
 *
 * Usage: node engine/test/eyes.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT_DIR || path.join(ROOT, '.testshots');
fs.mkdirSync(OUT, { recursive: true });

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
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  /* ================= MULTIPLAYER ================= */
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.evaluate(() => window.MP.input._lock(true));
  await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  });

  const hip = await page.evaluate(async () => {
    const G = window.MP;
    G.input.buttons.aim = false;
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    const g = G.viewmodel.gun;
    const cam = G.game.camera, e = (cam.viewProjection || cam.viewProj).e;
    const p = g.position;
    const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
    return { visible: !!(g && g.visible !== false), aim: G.viewmodel.state.aim, depth: w,
      ndcX: (e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) / (w || 1),
      ndcY: (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) / (w || 1),
      parts: g.partNames ? g.partNames.length : 0,
      verts: (() => {
        let n = g.mesh ? g.mesh.vertexCount : 0;
        for (const k of (g.partNames || [])) {
          const a = g[k]; if (a && a !== g && a.mesh) n += a.mesh.vertexCount || 0;
        }
        return n;
      })() };
  });
  /* DOES IT REACH A DRAW CALL? Every check so far has read fields off
     the actor and concluded the gun is fine, and the photograph says
     there is no gun. So ask the renderer. */
  const drawn = await page.evaluate(() => {
    const G = window.MP, g = G.viewmodel.gun, game = G.game;
    const keys = new Set();
    const parts = [];
    const addKey = (a) => {
      if (!a || !a.mesh) return;
      keys.add(a.mesh.__key || '(uid)');
      const pm = a.parent && a.parent.matrix ? a.parent.matrix.e : null;
      const num = (v) => (v == null ? 'null' : (Number.isFinite(v) ? +v.toFixed(3) : String(v)));
      parts.push({ n: a.name || '?', vis: a.visible !== false, dead: !!a.dead,
        inList: game.actors.indexOf(a) >= 0, noCull: !!a.noCull,
        r: a.boundRadius, hasMat: !!a.material,
        x: +a.matrix.e[12].toFixed(2), y: +a.matrix.e[13].toFixed(2),
        z: +a.matrix.e[14].toFixed(2),
        /* The actual inputs to the compose, because the output being
           NaN with a valid parent means one of these is not a number
           and guessing which has already cost two rounds. */
        pos: a._position ? [num(a._position.x), num(a._position.y), num(a._position.z)] : 'none',
        rot: a._rotation
          ? [num(a._rotation.x), num(a._rotation.y), num(a._rotation.z), num(a._rotation.w)]
          : 'none',
        scl: a.scale ? [num(a.scale.x), num(a.scale.y), num(a.scale.z)] : 'none',
        pBone: a.parentBone, hasParent: !!a.parent, parentIsRoot: a.parent === g,
        pMat: pm ? [num(pm[12]), num(pm[13]), num(pm[14])] : 'none',
        pFinite: pm ? pm.every((v) => Number.isFinite(v)) : false,
        finite: a.matrix.e.every((v) => Number.isFinite(v)) });
    };
    addKey(g);
    for (const k of (g.partNames || [])) if (g[k] && g[k] !== g) addKey(g[k]);
    const batches = game._buildBatches();
    let found = 0, groups = 0;
    for (const b of batches) {
      const k = b.mesh && (b.mesh.__key || '(uid)');
      if (keys.has(k)) { groups++; found += b.count || 1; }
    }
    return { parts, groups, found, batches: batches.length,
      cam: [+game.camera.position.x.toFixed(2), +game.camera.position.y.toFixed(2),
        +game.camera.position.z.toFixed(2)],
      near: game.camera.near, far: game.camera.far, fov: +game.camera.fov.toFixed(2) };
  });
  note(`camera at ${drawn.cam.join(',')} near ${drawn.near} fov ${drawn.fov}`);
  drawn.parts.forEach((p) => {
    note(`  part ${p.n}: at ${p.x},${p.y},${p.z}  bone ${p.pBone}`
      + ` parentIsRoot ${p.parentIsRoot} parentFinite ${p.pFinite} parentAt ${p.pMat}`);
    note(`      pos ${p.pos}  rot ${p.rot}  scale ${p.scl}`);
  });
  note(`${drawn.groups} of ${drawn.batches} draw groups are this weapon, ${drawn.found} instances`);
  /* FINITE, not merely present. A composed matrix takes its translation
     straight from the position, so an actor with a NaN quaternion still
     reports a perfectly sensible world position and passes every check
     about where it is -- while the GPU discards every triangle it has.
     That is exactly how an invisible weapon passed a dozen tests. */
  check('every part of the weapon has a finite transform',
    drawn.parts.every((p) => p.finite),
    drawn.parts.filter((p) => !p.finite).map((p) => p.n).join(' '));
  check('the weapon reaches a draw call at all', drawn.groups > 0,
    `${drawn.groups} groups out of ${drawn.batches}`);
  check('every part of it is in the scene and alive',
    drawn.parts.every((p) => p.vis && !p.dead && p.inList && p.hasMat),
    drawn.parts.filter((p) => !(p.vis && !p.dead && p.inList && p.hasMat))
      .map((p) => p.n).join(' '));

  await page.screenshot({ path: path.join(OUT, 'see-hip.jpg'), type: 'jpeg', quality: 88 });
  note(`hip: visible ${hip.visible}, aim ${hip.aim.toFixed(2)},`
    + ` ndc ${hip.ndcX.toFixed(2)},${hip.ndcY.toFixed(2)},`
    + ` ${hip.parts} parts ${hip.verts} verts`);
  /* The origin is the grip, and a grip below the bottom edge is
     normal -- the body of the weapon rises from it into frame. What
     must not happen is the origin being BEHIND the eye, which is what
     puts the camera inside the receiver. */
  check('the gun is in front of the camera, not around it',
    hip.visible && hip.depth > 0.25, `depth ${(hip.depth || 0).toFixed(2)}`);
  check('and it is a detailed model, not a blockout',
    hip.verts > 3000 && hip.parts >= 4, `${hip.parts} parts, ${hip.verts} verts`);

  const ads = await page.evaluate(async () => {
    const G = window.MP;
    G.input.buttons.aim = true;
    const seen = [];
    /* STEPPED AT A FIXED 1/60, not driven by the animation frame.
       Under SwiftShader a frame is nearly half a second, and an ease
       written as `t += (want - t) * dt * rate` completes in ONE of
       those -- so the check reported "no aiming animation" on an ease
       that works, for the same reason the player cannot see one at two
       frames a second. */
    G.game.stop();
    for (let i = 0; i < 26; i++) {
      G.game.step(1 / 60);
      seen.push(+G.viewmodel.state.aim.toFixed(3));
    }
    G.game.start();
    const g = G.viewmodel.gun;
    const cam = G.game.camera, e = (cam.viewProjection || cam.viewProj).e;
    const p = g.position;
    const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
    return { seen, aim: G.viewmodel.state.aim,
      ndcX: (e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) / (w || 1),
      ndcY: (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) / (w || 1),
      visible: !!(g && g.visible !== false) };
  });
  await page.screenshot({ path: path.join(OUT, 'see-ads.jpg'), type: 'jpeg', quality: 88 });
  const steps = new Set(ads.seen).size;
  note(`ads: ${ads.seen.slice(0, 8).join(' ')} ... ${ads.aim.toFixed(2)};`
    + ` ndc ${ads.ndcX.toFixed(2)},${ads.ndcY.toFixed(2)}`);
  check('holding aim brings the gun up', ads.aim > 0.9, ads.aim.toFixed(2));
  check('and it is a MOVE, not a switch', steps > 6, `${steps} distinct positions`);
  check('the sight ends up on the centre line',
    Math.abs(ads.ndcX) < 0.12 && ads.visible, `ndc x ${ads.ndcX.toFixed(3)}`);
  await page.evaluate(() => { window.MP.input.buttons.aim = false; });

  /* HANDS. Checked HERE, while the multiplayer page is still loaded --
     the first version asked for window.MP after the run had navigated
     on to zombies, and reported that multiplayer has no hands because
     multiplayer was no longer open. */
  const arms = await page.evaluate(() => {
    const g = window.MP.viewmodel.gun;
    const a = g && g.__arms;
    if (!a) return { has: false };
    return { has: true, parts: a.parts.length,
      shown: a.parts.filter((x) => x.visible !== false).length,
      finite: a.parts.every((x) => x.matrix.e.every((v) => Number.isFinite(v))),
      verts: a.parts.reduce((n, x) => n + ((x.mesh && x.mesh.vertexCount) || 0), 0) };
  });
  note(`hands: ${JSON.stringify(arms)}`);
  check('the weapon is held in a pair of hands', arms.has && arms.shown > 4,
    JSON.stringify(arms));
  check('and every piece of them has a finite transform', arms.has && arms.finite);


  /* A man up close, and the actual colour of his chest. */
  const body = await page.evaluate(async () => {
    const G = window.MP, M = G.match;
    const t = M.people.find((p) => p.id !== M.you.id && p.alive);
    const f = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
    for (let i = 0; i < 14; i++) {
      M.you.pos.x = t.pos.x + f.x * 2.4; M.you.pos.z = t.pos.z + f.z * 2.4;
      M.you.pos.y = t.pos.y;
      G.look(Math.atan2(t.pos.x - M.you.pos.x, t.pos.z - M.you.pos.z), 0.10);
      await new Promise((r) => requestAnimationFrame(r));
    }
    /* His actual materials, straight off the actors. "Blue coat of
       skin" is a colour, and a colour can be read. */
    const seen = [];
    const walk = (a) => {
      if (!a) return;
      if (a.material && a.material.color != null && a.visible !== false) {
        seen.push({ name: a.name || '?', c: a.material.color });
      }
      if (a.children) a.children.forEach(walk);
    };
    walk(t.actor);
    (t.actor.rigged || []).forEach(walk);
    ['head', 'neck', 'eyes'].forEach((k) => walk(t.actor[k]));
    (t.actor.gear || []).forEach(walk);
    return { op: t.operator, name: t.name, seen: seen.slice(0, 14) };
  });
  await page.screenshot({ path: path.join(OUT, 'see-body.jpg'), type: 'jpeg', quality: 88 });
  const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
  note(`${body.name} is operator "${body.op}"`);
  note('his materials: ' + body.seen.map((s) => `${s.name} ${hex(s.c)}`).join(', '));
  /* Blue means the blue channel dominates by a clear margin. A navy
     uniform is allowed to be navy; SKIN that is blue is not. */
  const blueSkin = body.seen.filter((s) => {
    if (!/head|neck|face|hand|arm|leg|body/i.test(s.name)) return false;
    const r = (s.c >> 16) & 255, g = (s.c >> 8) & 255, b = s.c & 255;
    return b > r + 25 && b > g + 25;
  });
  check('nobody is wearing a blue coat of skin', blueSkin.length === 0,
    blueSkin.map((s) => `${s.name} ${hex(s.c)}`).join(' '));

  /* ================= ZOMBIES ================= */
  await page.goto('file://' + path.join(ROOT, 'site/games/bunker-nine.html'));
  await page.waitForTimeout(3000);
  const z = await page.evaluate(async () => {
    /* Straight into a round, past the title card. */
    if (window.SHELL && window.SHELL.intoGame) window.SHELL.intoGame('bunker');
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
    const g = window.GAME || window.B9 || null;
    const R = g && g.game ? g.game.renderer : (window.LE_GAME ? window.LE_GAME.renderer : null);
    return R ? { tier: R.qualityName, scale: R.quality.renderScale,
      posterize: R.quality.posterize || 0, cap: R.quality.fpsCap || 0,
      cw: R.canvas.width, ch: R.canvas.height,
      cssW: R.canvas.clientWidth, cssH: R.canvas.clientHeight } : { err: 'no renderer handle' };
  });
  note('zombies: ' + JSON.stringify(z));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, 'see-zombies.jpg'), type: 'jpeg', quality: 88 });
  if (!z.err) {
    check('zombies is not rendering at a fraction of the display',
      z.scale >= 0.6, `renderScale ${z.scale}`);
    check('and its palette is not quantised', z.posterize === 0, `posterize ${z.posterize}`);
    check('the drawing buffer is not far below the canvas',
      z.cw >= z.cssW * 0.55, `${z.cw}x${z.ch} into ${z.cssW}x${z.cssH}`);
  }

  for (const f of ['see-hip', 'see-ads', 'see-body', 'see-zombies']) {
    note(`shot -> ${path.join(OUT, f + '.jpg')}`);
  }
  check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
