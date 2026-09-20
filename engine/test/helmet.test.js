#!/usr/bin/env node
/* Does the helmet fit?
 *
 * "Their heads are poking out of their helmets." Every head-worn piece
 * of kit -- the helmet shell, the hazmat hood, the visor, the goggles,
 * the respirator -- is authored around the CENTRE of the skull, and all
 * of them were being handed the head BONE, which is where the character
 * builder puts the chin. Half a head of error, on everybody wearing
 * anything.
 *
 * So this measures rather than looks: the head geometry's own top and
 * width, in the same space the kit is built in, against the kit's. The
 * questions are the ones a fitting asks:
 *
 *   - Is the crown of the skull INSIDE the shell?
 *   - Is the shell wider than the head, and not by a comic margin?
 *   - Does the hood clear the helmet it goes over?
 *   - Is the visor in front of the face rather than through it?
 *
 * And it renders the four helmeted operators' heads, because a number
 * that passes and a picture that is wrong have both happened here.
 *
 * Usage: node engine/test/helmet.test.js
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 440 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.evaluate(() => {
    const G = window.G = LE.create({ canvas: '#game', quality: 'high', gravity: 0 });
    G.setSky('overcast');
    G.setTimeOfDay(12);
    G.ground({ at: [0, 0, 0], size: 40, material: { color: 0x6e6b66, texture: 'concrete',
      roughness: 0.95, uvScale: 12 }, physics: false });
  });

  /* Everybody who wears something on their head. */
  const fits = await page.evaluate(() => {
    const g = window.G;
    const out = [];
    const bounds = (pos, stride) => {
      const b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
      for (let i = 0; i < pos.length; i += (stride || 3)) {
        b.x0 = Math.min(b.x0, pos[i]); b.x1 = Math.max(b.x1, pos[i]);
        b.y0 = Math.min(b.y0, pos[i + 1]); b.y1 = Math.max(b.y1, pos[i + 1]);
        b.z0 = Math.min(b.z0, pos[i + 2]); b.z1 = Math.max(b.z1, pos[i + 2]);
      }
      return b;
    };
    for (const op of g.operators()) {
      const id = op.id;
      const spec = g.operatorSpec(id);
      if (!spec.gear || !spec.gear.length) continue;
      const wears = spec.gear.filter((n) =>
        ['helmet', 'hood', 'visor', 'goggles', 'respirator'].indexOf(n) >= 0);
      if (!wears.length) continue;
      const a = g.operator(id, { at: [0, 0, 0], name: 'fit-' + id, face: 'static' });
      /* The skull, in the skeleton's own space: the head actor is
         parented to the head bone with a measured offset and scale, so
         its geometry has to be put through both to be comparable with
         the kit, which is skinned into that space already. */
      const hg = a.head && a.head.__geo;
      const hs = a.head ? a.head.scale.x : 1;
      const hoff = a.head ? a.head.localOffset : null;
      const bone = a.skeleton.bones[a.skeleton.index('head')];
      const boneY = bone.bindMatrix.e[13];
      const hb = bounds(hg.positions, hg.stride || 3);
      const head = {
        bottom: boneY + (hoff ? hoff.y : 0) + hb.y0 * hs,
        /* THE CHIN, not the lowest vertex anywhere on the sculpt.
         *
           91-face.js records both and says why: "the jaw sweeps back
           under the ear and the nape hollow can dip lower than the chin
           does". The head is PLACED by chinY -- 95-engine.js puts the
           chin on the bone and then drops it 11 mm so the jaw overlaps
           the neck instead of balancing on it -- so measuring the mesh
           minimum measures the nape, which hangs 9 to 13 mm lower
           again. That is 20 to 24 mm against a 20 mm bar, and six
           operators failed a check about the chin on account of the
           back of their necks. */
        chin: boneY + (hoff ? hoff.y : 0) + (hg.headBounds ? hg.headBounds.chinY : hb.y0) * hs,
        top: boneY + (hoff ? hoff.y : 0) + hb.y1 * hs,
        halfW: Math.max(-hb.x0, hb.x1) * hs,
        front: hb.z1 * hs,
      };
      const kit = {};
      for (const ga of (a.gear || [])) {
        const kb = bounds(ga.__geo.positions, ga.__geo.stride || 3);
        kit[ga.name.replace('gear-', '')] = {
          top: kb.y1, bottom: kb.y0, halfW: Math.max(-kb.x0, kb.x1), front: kb.z1,
        };
      }
      out.push({ id, wears, boneY, head, kit, mats: Object.keys(kit),
        nvg: !!(spec.gearOpts && spec.gearOpts.nvg) });
      a.destroy();
    }
    return out;
  });

  for (const f of fits) {
    note(`${f.id.padEnd(10)} skull ${(f.head.bottom).toFixed(3)}..${(f.head.top).toFixed(3)} m`
      + `  (${((f.head.top - f.head.bottom) * 100).toFixed(1)} cm tall,`
      + ` ${(f.head.halfW * 200).toFixed(1)} cm wide)  wears ${f.wears.join('+')}`);
    for (const m of f.mats) {
      const k = f.kit[m];
      note(`   ${m.padEnd(8)} ${k.bottom.toFixed(3)}..${k.top.toFixed(3)}`
        + `  half-width ${(k.halfW * 100).toFixed(1)} cm`);
    }
  }

  check('somebody is wearing something on their head', fits.length >= 3, String(fits.length));
  /* And the bar is TIGHTER for asking the right question: the placement
     is deliberate and exact -- chin on the bone, then 11 mm down for the
     overlap -- so anything past 15 mm is a head that has come off its
     rig, which is what this was written to catch. Measured against the
     nape it could not have been set below 25 mm without failing on
     correct geometry. */
  check('the chin is on the head bone, not the middle of the face',
    fits.every((f) => Math.abs(f.head.chin - f.boneY) < 0.015),
    fits.map((f) => (f.head.chin - f.boneY).toFixed(3)).join(' '));

  const lids = fits.filter((f) => f.wears.indexOf('helmet') >= 0);
  note(`${lids.length} of them in a helmet: ${lids.map((f) => f.id).join(', ')}`);
  check('the crown of the skull is inside the shell',
    lids.every((f) => f.kit.kevlar && f.kit.kevlar.top > f.head.top),
    lids.map((f) => `${f.id} ${((f.kit.kevlar.top - f.head.top) * 100).toFixed(1)}`).join(' '));
  /* Clearance over the crown. A set of night vision tubes flipped up
     on the mount stands well above the shell and is part of the same
     kevlar geometry, so a man wearing them gets the taller allowance --
     the first version of this check called delta's NVGs a helmet four
     sizes too big. */
  check('and not swimming in it',
    lids.every((f) => f.kit.kevlar.top - f.head.top < (f.nvg ? 0.12 : 0.05)),
    lids.map((f) => `${f.id}${f.nvg ? '+nvg' : ''} ${((f.kit.kevlar.top - f.head.top) * 100).toFixed(1)} cm`).join(' '));
  check('the shell is wider than the head it is on',
    lids.every((f) => f.kit.kevlar.halfW > f.head.halfW),
    lids.map((f) => `${f.id} ${((f.kit.kevlar.halfW - f.head.halfW) * 100).toFixed(1)}`).join(' '));
  check('the shell comes down past the brow',
    lids.every((f) => f.kit.kevlar.bottom < f.head.bottom + (f.head.top - f.head.bottom) * 0.72),
    lids.map((f) => `${f.id} ${(((f.kit.kevlar.bottom - f.head.bottom) / (f.head.top - f.head.bottom)) * 100).toFixed(0)}%`).join(' '));

  const hooded = fits.filter((f) => f.wears.indexOf('hood') >= 0);
  if (hooded.length) {
    check('the hood clears the skull', hooded.every((f) => f.kit.hazmat.top > f.head.top + 0.01),
      hooded.map((f) => ((f.kit.hazmat.top - f.head.top) * 100).toFixed(1)).join(' '));
    check('and comes down onto the shoulders',
      hooded.every((f) => f.kit.hazmat.bottom < f.head.bottom),
      hooded.map((f) => ((f.kit.hazmat.bottom - f.head.bottom) * 100).toFixed(1)).join(' '));
  }
  const visored = fits.filter((f) => f.wears.indexOf('visor') >= 0);
  if (visored.length) {
    check('the visor is in front of the face, not through it',
      visored.every((f) => f.kit.glass.front > f.head.front),
      visored.map((f) => ((f.kit.glass.front - f.head.front) * 100).toFixed(1)).join(' '));
  }

  /* And look at it. */
  await page.evaluate((ids) => {
    const g = window.G;
    let x = -((ids.length - 1) * 0.40) / 2;
    window.HEADS = [];
    for (const id of ids) {
      window.HEADS.push(g.operator(id, { at: [x, 0.875, 0], name: 'shot-' + id, face: 'static' }));
      x += 0.40;
    }
    g.step(1 / 60);
  }, fits.map((f) => f.id));

  await page.evaluate((n) => {
    const g = window.G;
    const w = ((n - 1) * 0.40) / 2;
    /* Framed on the heads, which sit about 1.62 up. These have twice
       come out forty pixels tall, and I twice reported on sculpts I
       could not actually see. The frame is 1280 x 440, so the row has
       to fill the WIDTH and the camera sits at head height. */
    g.lookAt([0, 1.62, w * 1.30 + 0.85], [0, 1.62, 0]);
    for (let i = 0; i < 4; i++) g.step(1 / 60);
  }, fits.length);
  await page.screenshot({ path: path.join(OUT, 'helmets-front.png') });
  note(`front -> ${path.join(OUT, 'helmets-front.png')}`);

  await page.evaluate((n) => {
    const g = window.G;
    /* One man, side on. A row spread along X photographed from the X
       axis is six people standing behind each other, which is what the
       first attempt produced -- so this frames the LAST of them alone.
       */
    const last = ((n - 1) * 0.40) / 2;
    g.lookAt([last + 0.80, 1.62, 0.0], [last, 1.62, 0]);
    for (let i = 0; i < 4; i++) g.step(1 / 60);
  }, fits.length);
  await page.screenshot({ path: path.join(OUT, 'helmets-side.png') });
  note(`side  -> ${path.join(OUT, 'helmets-side.png')}`);

  /* ----------------------------------------------------------------
     AND ARE THEY DRESSED?
     ----------------------------------------------------------------
     A Best Play screenshot came back with a man who read as naked --
     bare arms, bare legs, a plate carrier strapped to skin. He was not
     naked: his coyote fatigues and his tan skin were the same
     luminance to within one part in a hundred and thirty, and under a
     warm sky that is a naked man. So this compares the two colours
     rather than squinting at the render.
     -------------------------------------------------------------- */
  const dressed = await page.evaluate(() => {
    const lum = (c) => (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255)
      + 0.114 * (c & 255)) / 255;
    /* Distance in colour, not only in brightness. Luminance alone
       called biohazard's yellow hood over pink skin a clash -- they
       are the same brightness and nothing else, and no one has ever
       mistaken hazard yellow for a bare arm. */
    const far = (a, b) => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255),
      ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255)) / 255;
    const out = [];
    for (const op of window.G.operators()) {
      const spec = window.G.operatorSpec(op.id);
      const cloth = window.G.clothOf(spec.outfit);
      const skin = window.G.skinOf(spec.skin);
      out.push({ id: op.id, outfit: spec.outfit, skinName: spec.skin,
        d: far(cloth, skin), l: Math.abs(lum(cloth) - lum(skin)), cloth, skin });
    }
    return out;
  });
  for (const d of dressed) {
    note(`${d.id.padEnd(10)} ${d.outfit.padEnd(7)} #${d.cloth.toString(16).padStart(6, '0')}`
      + ` over ${d.skinName.padEnd(6)} #${d.skin.toString(16).padStart(6, '0')}`
      + `  Δluminance ${(d.d * 100).toFixed(1)}%`);
  }
  check('nobody is wearing fatigues the same shade as their own skin',
    dressed.every((d) => d.d > 0.15),
    dressed.filter((d) => d.d <= 0.15).map((x) => `${x.id} ${(x.d * 100).toFixed(1)}%`).join(' '));

  /* Whatever the numbers say, LOOK at them. */
  await page.evaluate((ids) => {
    const g = window.G;
    for (const a of (window.HEADS || [])) a.destroy();
    let x = -((ids.length - 1) * 0.80) / 2;
    window.HEADS = [];
    for (const id of ids) {
      const a = g.operator(id, { at: [x, 0.875, 0], name: 'body-' + id, face: 'static' });
      window.HEADS.push(a);
      x += 0.80;
    }
    g.step(1 / 60);
  }, fits.map((f) => f.id));
  await page.evaluate((n) => {
    const g = window.G;
    const w = ((n - 1) * 0.80) / 2;
    g.lookAt([0, 1.00, w * 1.30 + 1.15], [0, 0.95, 0]);
    for (let i = 0; i < 4; i++) g.step(1 / 60);
  }, fits.length);
  await page.screenshot({ path: path.join(OUT, 'helmets-bodies.png') });
  note(`bodies -> ${path.join(OUT, 'helmets-bodies.png')}`);

  /* And walking, because a walk cycle is not a pose. Four phases of
     one man, side on, which is the only view that shows a stride. */
  await page.evaluate(() => {
    const g = window.G;
    for (const a of (window.HEADS || [])) a.destroy();
    window.HEADS = [];
    const phases = [0, 0.25, 0.5, 0.75];
    let x = -((phases.length - 1) * 1.05) / 2;
    for (const ph of phases) {
      const a = g.operator('delta', { at: [x, 0.875, 0], name: 'walk-' + ph, face: 'static' });
      /* TURNED SIDE ON, via the CONTROLLER. A stride and an arm swing
         are fore-and-aft movements and from the front they are four men
         standing still -- and setting a.rotation does nothing, because
         a controller-driven actor takes its facing from
         controller.facing and nothing else. The first attempt set the
         quaternion and produced four men facing the camera. */
      if (a.controller) {
        a.controller.teleport([x, (a.controller.height || 1.75) * 0.5, 0]);
        a.controller.facing = Math.PI / 2;
      }
      if (a.animator) {
        a.animator.play('walk', 0);
        a.animator.speed = 0;
        a.animator.time = a.animator.clips.get('walk').duration * ph;
        a.animator.update(0);
        if (a.skeleton) a.skeleton.update();
      }
      if (a.controller) a.controller.autoAnimate = false;
      window.HEADS.push(a);
      x += 1.15;
    }
    g.step(1 / 60);
  });
  await page.evaluate(() => {
    const g = window.G;
    g.lookAt([0.0, 1.00, 2.95], [0, 0.95, 0]);
    for (let i = 0; i < 3; i++) g.step(1 / 60);
  });
  await page.screenshot({ path: path.join(OUT, 'walk-phases.png') });
  note(`walk   -> ${path.join(OUT, 'walk-phases.png')}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
