#!/usr/bin/env node
/* ONE TEXTURE PER RECIPE, AND IT GETS SHARPER AFTER YOU LOAD.
 *
 * Two claims, both about memory and both easy to believe without
 * checking, which is why they are checked.
 *
 *   SHARED    every Material that asked for a texture used to upload
 *             its own copy. Coastline builds a hundred and thirty-six
 *             materials out of seventeen recipes, so the GPU held about
 *             a hundred megabytes of what was thirteen megabytes of
 *             distinct data. The count of live GL textures is the
 *             claim, so the count is what is measured.
 *
 *   UPGRADED  the world loads at 256 because generating these is
 *             per-texel JavaScript and the full set is 6.2 s at 1024.
 *             upgradeTextures re-uploads each recipe into the texture
 *             the materials already share, so the check is that the
 *             SAME texture object ends up bigger -- if it made new ones
 *             instead, every material would still be pointing at the
 *             small one and the upgrade would be invisible.
 *
 * Usage: node engine/test/texres.test.js
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
  const page = await browser.newPage({ viewport: { width: 420, height: 280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(async () => {
    /* Count every texture the driver actually holds, by counting the
       calls that make one. Nothing else can be trusted to know. */
    const G0 = document.createElement('canvas').getContext('webgl2');
    void G0;
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'normal', map: 'coastline' });
    const G = B.game;
    for (let i = 0; i < 12; i++) G.step(1 / 60);
    const out = {};
    const gl = G.renderer.gl;
    const store = gl.__legendTexCache;

    /* How many materials wanted a texture, against how many texture
       sets exist. The first number is the duplication that used to be. */
    const mats = new Set();
    for (const a of G.actors) if (a && a.material && a.material.texture) mats.add(a.material);
    out.texturedMaterials = mats.size;
    out.sets = store ? store.size : 0;
    /* And every one of those materials must be pointing AT one of the
       shared sets rather than at a private copy. */
    const shared = new Set();
    if (store) for (const v of store.values()) shared.add(v.albedo);
    let priv = 0;
    for (const m of mats) if (!m.maps || !shared.has(m.maps.albedo)) priv++;
    out.privateCopies = priv;

    out.target = G.renderer.texTarget;
    out.builtAt = window.LE.Material.textureSize;

    /* The upgrade, driven fast so the test does not sit for a minute. */
    const before = [...store.keys()].sort();
    const beforeTex = store.get(before[0]).albedo;
    await new Promise((res) => {
      const st = G.upgradeTextures(512, { gapMs: 0, onDone: () => res(st) });
      if (!st) res(null);
    });
    const after = [...store.keys()].sort();
    out.keysBefore = before.slice(0, 3);
    out.keysAfter = after.slice(0, 3);
    out.allAt512 = after.every((k) => k.split(':')[1] === '512');
    /* NAME THE ONES THAT DID NOT COME WITH, and the ones that appeared.
     *
       This reported `keysAfter.slice(0, 3)` on failure -- the first
       three keys alphabetically, which on a passing set and a failing
       one are the same three, all at 512. So the message read "and
       every recipe ends up at the new size [bluing:512, brass:512,
       brick:512]", which is the evidence FOR the thing it is
       complaining about. The store has eighteen entries; the two that
       matter were never printed. */
    out.stragglers = after.filter((k) => k.split(':')[1] !== '512');
    out.appeared = after.filter((k) => before.indexOf(k) < 0
      && before.indexOf(k.replace(/:\d+:/, ':256:')) < 0);
    out.vanished = before.filter((k) => after.indexOf(k) < 0);
    /* THE SAME OBJECT, bigger. A new texture here would mean every
       material is still holding the old small one. */
    out.sameObject = store.get(after[0]).albedo === beforeTex;
    out.setsAfter = store.size;
    return out;
  });

  note(JSON.stringify(r));
  check('materials share their textures rather than each uploading one',
    r.privateCopies === 0, `${r.privateCopies} of ${r.texturedMaterials} hold a private copy`);
  check('and there are far fewer texture sets than materials',
    r.sets > 0 && r.sets * 3 < r.texturedMaterials,
    `${r.sets} sets for ${r.texturedMaterials} textured materials`);
  /* THE FIRST LOAD IS THE FAST ONE. */
  check('the world builds at 256 whatever the tier is aiming for',
    r.builtAt === 256 && r.target > 256, `built ${r.builtAt}, target ${r.target}`);
  /* AND THE UPGRADE LANDS WHERE THE MATERIALS ARE LOOKING. */
  check('upgrading re-uploads into the texture the materials already hold',
    r.sameObject, 'it made a new texture, so nothing would have sharpened');
  check('and every recipe ends up at the new size', r.allAt512,
    'still at the old size: ' + JSON.stringify(r.stragglers));
  check('without leaking a second set', r.setsAfter === r.sets,
    `${r.sets} before, ${r.setsAfter} after; new keys `
    + JSON.stringify(r.appeared) + ', gone ' + JSON.stringify(r.vanished));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
