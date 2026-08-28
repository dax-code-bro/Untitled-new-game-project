#!/usr/bin/env node
/* Runs the built engine in headless Chromium against real WebGL2 (SwiftShader).
 *
 * This is the test that matters: shaders only fail at compile time on a GPU,
 * and a renderer that "looks fine" in code review can still produce a black
 * screen. Every scene here is rendered, checked for errors, and screenshotted.
 *
 * Usage: node engine/test/browser.test.js [--keep-shots]
 */
const fs = require('fs');
const path = require('path');

// Playwright is a dev-only dependency and is not vendored into this repo
// (the engine itself has none). Resolve it from wherever it happens to be
// installed rather than requiring a node_modules inside the project.
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error(
    'browser tests need playwright:\n'
    + '  npm i --no-save playwright\n'
    + 'or point NODE_PATH at an install that already has it.\n'
    + 'The solver tests (node engine/test/physics.test.js) need nothing.',
  );
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const BUNDLE = path.join(ROOT, 'site', 'engine', 'legend-engine.js');
const SHOTS = path.join(__dirname, 'shots');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
];

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

/* Scenes exercised. Each returns a description of what it built so the
   assertions can be scene-specific. */
const SCENES = {
  /* Baseline: does anything render at all, with shadows and PBR. */
  basic: `
    const game = LE.create({ quality: 'medium', canvas: '#c' });
    game.ground({ material: 'concrete', size: 60 });
    game.box({ at: [0, 1, 0], size: 2, material: 'brick' });
    game.sphere({ at: [2.5, 1, 1], radius: 0.8, material: 'gold' });
    game.cylinder({ at: [-2.5, 1, 1], radius: 0.6, height: 2, material: 'wood' });
    game.rock({ at: [0, 0.6, 3], radius: 0.7 });
    // Sun off to one side so cast shadows are visible rather than hidden
    // directly behind each object.
    game.renderer.sun.direction.set(0.62, 0.6, -0.5).normalize();
    game.lookAt([6, 4, 8], [0, 1, 0]);
    return game;
  `,

  /* Shadows. Deliberately lit with a low sun opposite the camera so the cast
     shadows fall toward the viewer. With the sun behind the camera every
     shadow hides behind its own caster and a completely broken shadow
     pipeline looks identical to a working one — which is exactly how this
     went unnoticed the first time. */
  shadows: `
    const game = LE.create({ quality: 'high', canvas: '#c' });
    game.ground({ material: 'concrete', size: 60 });
    game.box({ at: [0, 1.5, 0], size: [4, 3, 0.6], material: 'brick', static: true });
    game.sphere({ at: [3.5, 1, 1.5], radius: 1, material: 'plastic', static: true });
    game.renderer.sun.direction.set(0.75, 0.5, 0.1).normalize();
    game.renderer.post.vignette = 0;
    game.lookAt([-9, 5, 7], [0, 1, 0]);
    return game;
  `,

  /* Material sweep: every procedural texture generator on screen at once. */
  materials: `
    const game = LE.create({ quality: 'high', canvas: '#c' });
    game.ground({ material: 'tile', size: 60 });
    const mats = ['concrete','brick','wood','metal','rust','rock','grass','dirt','sand','marble','ice','fabric','skin','plastic','gold','copper'];
    mats.forEach((m, i) => {
      game.sphere({ at: [(i % 4) * 2.2 - 3.3, 1.1, Math.floor(i / 4) * 2.2 - 3.3], radius: 0.9, material: m, static: true });
    });
    game.lookAt([7, 7, 9], [0, 0.6, 0]);
    return game;
  `,

  /* Physics under load, plus grass and a full sky. */
  physics: `
    const game = LE.create({ quality: 'medium', canvas: '#c' });
    game.setSky('sunset');
    game.ground({ material: 'grass', size: 90, grass: { max: 8000, area: 40 } });
    for (let i = 0; i < 40; i++) {
      game.box({
        at: [(i % 5) * 1.1 - 2.2, 0.55 + Math.floor(i / 5) * 1.1, ((i * 3) % 5) * 1.1 - 2.2],
        size: 1, material: i % 3 === 0 ? 'brick' : 'concrete',
      });
    }
    game.orbit({ center: [0, 3, 0], distance: 16, height: 3 });
    return game;
  `,

  /* Destruction: shatter on purpose and verify chunks appear. */
  destruction: `
    const game = LE.create({ quality: 'medium', canvas: '#c' });
    game.ground({ material: 'dirt', size: 60 });
    window.__wall = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 6; x++) {
        window.__wall.push(game.box({
          at: [x * 1.02 - 2.5, 0.5 + y * 1.02, 0], size: 1,
          material: 'brick', breakable: { pieces: 8, threshold: 400 },
        }));
      }
    }
    game.lookAt([8, 5, 10], [0, 2, 0]);
    return game;
  `,

  /* Water: the screen-space fluid path, over a solid floor. */
  water: `
    const game = LE.create({ quality: 'medium', canvas: '#c' });
    game.setSky('day');
    game.ground({ material: 'rock', size: 60 });
    // Tank sized to the particle budget. A few thousand particles spread over
    // a 6x6 floor settle into a 7cm puddle; over a 2.4x2.4 floor they make a
    // pool deep enough to actually read as water.
    game.box({ at: [-1.4, 1, 0], size: [0.4, 2, 3.2], material: 'concrete', static: true });
    game.box({ at: [1.4, 1, 0], size: [0.4, 2, 3.2], material: 'concrete', static: true });
    game.box({ at: [0, 1, -1.4], size: [3.2, 2, 0.4], material: 'concrete', static: true });
    game.box({ at: [0, 1, 1.4], size: [3.2, 2, 0.4], material: 'concrete', static: true });
    game.water({ at: [0, 1.2, 0], size: [2.2, 1.4, 2.2] });
    // Look down into the tank. From a low angle the walls hide the settled
    // pool entirely, and the screenshot verifies nothing about the water.
    game.lookAt([3.2, 4.6, 3.8], [0, 0.4, 0]);
    return game;
  `,

  /* Character: skinned humanoid with a morphing face. */
  character: `
    const game = LE.create({ quality: 'medium', canvas: '#c' });
    game.ground({ material: 'grass', size: 60, grass: { max: 4000, area: 24 } });
    window.__hero = game.character({ at: [0, 1.1, 0], color: 'crimson' });
    window.__hero.face.setEmotion('smile', 1);
    window.__hero.face.say('hello from the legend engine');
    game.follow(window.__hero, { distance: 4.5, height: 1.6 });
    game.onUpdate(() => { window.__hero.controller.move(0, 1, false); });
    return game;
  `,

  /* Particles, emissive materials and bloom. */
  effects: `
    const game = LE.create({ quality: 'high', canvas: '#c' });
    game.setSky('night');
    game.ground({ material: 'concrete', size: 60 });
    game.sphere({ at: [0, 1.4, 0], radius: 0.7, material: 'neon', static: true });
    game.light({ at: [0, 2.4, 0], color: 0x36e0ff, intensity: 60, radius: 16 });
    game.box({ at: [2.6, 0.6, 0], size: 1.2, material: 'lava', static: true });
    game.onUpdate(() => {
      game.particles.fire([0, 0.3, 2.6].reduce((a,b,i)=> (a['xyz'[i]]=b, a), new LE.Vec3()), { count: 2 });
      game.particles.sparks(new LE.Vec3(-2.6, 1.2, 0), { count: 2, speed: 4 });
    });
    game.lookAt([6, 3, 7], [0, 1, 0]);
    return game;
  `,
};

async function run() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found at ${BUNDLE} — run: node engine/build.js`);
    process.exit(1);
  }
  const bundleSrc = fs.readFileSync(BUNDLE, 'utf8');
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS });

  for (const [name, sceneCode] of Object.entries(SCENES)) {
    console.log(`\nscene: ${name}`);
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err && err.message ? err.message : err)));

    await page.setContent(`<!doctype html><html><body style="margin:0">
      <canvas id="c" style="position:fixed;inset:0;width:100%;height:100%;display:block"></canvas>
    </body></html>`);
    await page.addScriptTag({ content: bundleSrc });

    const setup = await page.evaluate(`(() => {
      window.__frames = 0;
      window.__errors = [];
      window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
      // Frames are driven manually rather than from requestAnimationFrame, so
      // the compositor may discard the back buffer before readPixels runs.
      // Preserving it is a test-harness concern only; real games never need it.
      const __create = LE.create;
      LE.create = (o) => __create(Object.assign({ preserveDrawingBuffer: true }, o || {}));
      try {
        const game = (function(){ ${sceneCode} })();
        window.__game = game;
        // Drive frames manually so the test is deterministic and does not
        // depend on how fast SwiftShader can hit requestAnimationFrame.
        window.__step = (dt) => { game.step(dt); window.__frames++; };
        return { ok: true, version: LE.version, quality: game.renderer.qualityName };
      } catch (err) {
        return { ok: false, error: String(err && err.stack ? err.stack : err) };
      }
    })()`);

    check(`${name}: scene builds`, setup.ok, setup.ok ? '' : setup.error);
    if (!setup.ok) { await page.close(); continue; }

    // Warm up, then run a fixed number of steps.
    const stepResult = await page.evaluate(`(() => {
      try {
        for (let i = 0; i < 90; i++) window.__step(1/60);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err && err.stack ? err.stack : err) };
      }
    })()`);
    check(`${name}: 90 frames run clean`, stepResult.ok, stepResult.ok ? '' : stepResult.error);

    // Scene-specific behaviour.
    if (name === 'destruction') {
      const broke = await page.evaluate(`(() => {
        const g = window.__game;
        const before = g.actors.length;
        g.explode([0, 1.5, 0], { radius: 7, strength: 30 });
        for (let i = 0; i < 40; i++) window.__step(1/60);
        return { before, after: g.actors.length, chunks: g.activeChunks.length };
      })()`);
      check('destruction: explosion creates chunks', stepResult.ok && broke.chunks > 8,
        `chunks=${broke.chunks} actors ${broke.before}->${broke.after}`);
    }

    if (name === 'water') {
      // Let the pool actually settle. At 90 frames the water is still
      // mid-splash from its initial drop, so both the assertions and the
      // screenshot would describe a transient rather than the steady state.
      await page.evaluate(`(() => { for (let i = 0; i < 260; i++) window.__step(1/60); })()`);
      const fluid = await page.evaluate(`(() => {
        const f = window.__game.fluid;
        let minY = Infinity, maxY = -Infinity, finite = true;
        for (let i = 0; i < f.count; i++) {
          if (!Number.isFinite(f.px[i]) || !Number.isFinite(f.py[i])) finite = false;
          minY = Math.min(minY, f.py[i]); maxY = Math.max(maxY, f.py[i]);
        }
        return { count: f.count, minY, maxY, finite, speed: f.averageSpeed() };
      })()`);
      check('water settles down', fluid.speed < 2.5, `avg speed ${fluid.speed.toFixed(2)}`);
      check('water: particles exist', fluid.count > 200, `count=${fluid.count}`);
      check('water: no NaN particles', fluid.finite);
      check('water: settles above the floor', fluid.minY > -0.5, `minY=${fluid.minY.toFixed(3)}`);
      check('water: stays inside the tank', fluid.maxY < 6, `maxY=${fluid.maxY.toFixed(3)}`);
    }

    if (name === 'character') {
      const hero = await page.evaluate(`(() => {
        const h = window.__hero;
        const w = h.face.weights;
        return {
          moved: h.position.z,
          state: h.controller.state,
          smile: w.get('smile'),
          jaw: w.get('jawOpen'),
          bones: h.skeleton.bones.length,
          finite: Number.isFinite(h.position.x) && Number.isFinite(h.position.y),
        };
      })()`);
      check('character: skeleton built', hero.bones === 19, `bones=${hero.bones}`);
      check('character: walks forward', hero.moved > 0.6, `z=${hero.moved.toFixed(2)}`);
      check('character: enters a locomotion state', hero.state === 'walk' || hero.state === 'run', `state=${hero.state}`);

      /* A layered character is several actors over one rigid body. Raycasts
         resolve a hit through body.actor, so if a later layer claimed it,
         every shot would report the wrong actor and games would silently
         stop registering hits. */
      const layered = await page.evaluate(() => {
        const g = window.__hero.engine;
        const z = g.character({
          at: [4, 1.1, 0], zombie: true, face: 'static', armor: true, zombieBuild: 'male',
        });
        const owner = z.controller.body.actor;
        return {
          owner: owner ? owner.name : null,
          isMain: owner === z,
          layers: ['cloth', 'blood', 'armor'].filter((k) => !!z[k]),
        };
      });
      check('character: layers do not steal the body back-reference',
        layered.isMain, `body.actor="${layered.owner}", layers=[${layered.layers.join(',')}]`);
      check('character: the extra skinned layers are actually built',
        layered.layers.length >= 2, `layers=[${layered.layers.join(',')}]`);
      check('character: expression applied', hero.smile > 0.5, `smile=${(hero.smile || 0).toFixed(2)}`);
      check('character: position stays finite', hero.finite);
    }

    if (name === 'shadows') {
      const sh = await page.evaluate(`(() => {
        const game = window.__game, gl = game.gl;
        const w = game.canvas.width, h = game.canvas.height;
        const buf = new Uint8Array(w * h * 4);
        const luma = () => {
          for (let i = 0; i < 3; i++) window.__step(1/60);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let s = 0;
          for (let i = 0; i < w * h; i++) s += buf[i*4]*0.299 + buf[i*4+1]*0.587 + buf[i*4+2]*0.114;
          return s / (w * h);
        };
        const on = luma();
        game.renderer.shadows.enabled = false;
        const off = luma();
        game.renderer.shadows.enabled = true;

        // Count how much of the frame the shadow term actually darkens.
        game.renderer.debugMode = 1;
        for (let i = 0; i < 3; i++) window.__step(1/60);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let shadowed = 0, lit = 0;
        for (let i = 0; i < w * h; i++) {
          const v = buf[i*4];
          if (v < 200) shadowed++; else lit++;
        }
        game.renderer.debugMode = 0;
        return { on, off, delta: off - on, shadowedPct: 100 * shadowed / (w * h), lit };
      })()`);
      check('shadows: enabling shadows darkens the frame', sh.delta > 0.1,
        `on=${sh.on.toFixed(2)} off=${sh.off.toFixed(2)} delta=${sh.delta.toFixed(3)}`);
      check('shadows: a real fraction of the frame is shadowed',
        sh.shadowedPct > 1.5 && sh.shadowedPct < 60, `${sh.shadowedPct.toFixed(1)}% shadowed`);
    }

    if (name === 'physics') {
      const phys = await page.evaluate(`(() => {
        const g = window.__game;
        let below = 0, nan = 0;
        for (const b of g.physics.bodies) {
          if (b.shape.type === 2) continue;
          if (!b.position.isFinite()) nan++;
          else if (b.position.y < -1) below++;
        }
        return { below, nan, bodies: g.physics.bodies.length, grass: g.grass ? g.grass.count : 0 };
      })()`);
      check('physics: nothing falls through the floor', phys.below === 0, `${phys.below} below ground`);
      check('physics: no NaN bodies', phys.nan === 0);
      check('physics: grass scattered', phys.grass > 1000, `blades=${phys.grass}`);
    }

    /* Pixel checks: the screen must not be blank, and must not be a single
       flat colour (which is what a broken shader or a missing clear looks
       like). */
    const pixels = await page.evaluate(`(() => {
      const c = document.getElementById('c');
      const gl = c.getContext('webgl2');
      const w = c.width, h = c.height;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0, min = 255, max = 0;
      const hist = new Set();
      const n = w * h;
      for (let i = 0; i < n; i++) {
        const r = buf[i*4], g2 = buf[i*4+1], b = buf[i*4+2];
        const lum = (r * 0.299 + g2 * 0.587 + b * 0.114) | 0;
        sum += lum; if (lum < min) min = lum; if (lum > max) max = lum;
        if (hist.size < 4000) hist.add((r >> 3) << 10 | (g2 >> 3) << 5 | (b >> 3));
      }
      return { mean: sum / n, min, max, distinct: hist.size, w, h };
    })()`);

    check(`${name}: frame is not black`, pixels.mean > 6, `mean luma ${pixels.mean.toFixed(1)}`);
    check(`${name}: frame is not blown out`, pixels.mean < 250, `mean luma ${pixels.mean.toFixed(1)}`);
    check(`${name}: frame has real contrast`, pixels.max - pixels.min > 40, `range ${pixels.min}-${pixels.max}`);
    check(`${name}: frame has varied colour`, pixels.distinct > 60, `${pixels.distinct} distinct colours`);

    const pageErrors = errors.concat(await page.evaluate('window.__errors || []'));
    // WebGL performance warnings from SwiftShader are noise, not failures.
    const real = pageErrors.filter((e) => !/performance|deprecat|SwiftShader|Fallback/i.test(e));
    check(`${name}: no runtime errors`, real.length === 0, real.slice(0, 2).join(' | '));

    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    await page.close();
  }

  /* Frame budget on a software rasteriser is not meaningful in absolute
     terms, but a runaway regression still shows up. */
  console.log('\nperformance');
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    await page.setContent('<!doctype html><body style="margin:0"><canvas id="c" style="width:100%;height:100%"></canvas></body>');
    await page.addScriptTag({ content: bundleSrc });
    const timing = await page.evaluate(`(() => {
      const game = LE.create({ quality: 'low', canvas: '#c' });
      game.ground({ material: 'concrete', size: 60 });
      for (let i = 0; i < 60; i++) game.box({ at: [(i%8)*1.1-4, 0.55+Math.floor(i/8)*1.1, 0], size: 1, material: 'brick' });
      game.lookAt([10, 6, 12], [0, 2, 0]);
      for (let i = 0; i < 30; i++) game.step(1/60);   // warm up shaders
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) game.step(1/60);
      const ms = (performance.now() - t0) / 60;
      return { ms, draws: game.stats.draws };
    })()`);
    console.log(`       ${timing.ms.toFixed(2)} ms/frame, ${timing.draws} draw calls (software rasteriser)`);
    check('60 boxes render in under 120ms/frame on SwiftShader', timing.ms < 120, `${timing.ms.toFixed(1)}ms`);
    check('draw calls stay batched', timing.draws < 30, `${timing.draws} draws`);
    await page.close();
  }

  await browser.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`screenshots in ${path.relative(ROOT, SHOTS)}/`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
