#!/usr/bin/env node
/* DOES THIS BRDF CONSERVE ENERGY? MEASURED, NOT ASSERTED.
 *
 * Feature 6 of the photoreal programme: multiple-scattering
 * compensation, height-correlated Smith visibility, specular and
 * horizon occlusion, a clearcoat lobe and a sheen lobe.
 *
 * THE FAULT IT FIXES IS INVISIBLE UNTIL YOU MEASURE IT. Single-scatter
 * GGX models light bouncing off ONE microfacet and leaving. Light that
 * hits a second facet is dropped on the floor, and the rougher the
 * surface the more of it there is. Nothing in a frame says "you have
 * lost 67 per cent of the energy here" -- the rough metal is simply
 * darker than the smooth metal beside it, and it reads as a material
 * choice rather than as a bug. It is why worn steel, brushed aluminium,
 * a rusted hinge and rough gold all go grey and dead in this renderer,
 * and why a roughness sweep across one object has a dark band through
 * the middle of it.
 *
 * THE WHITE FURNACE IS THE TEST THAT CANNOT BE ARGUED WITH. Put a
 * perfectly reflective metal (F0 = 1) inside a uniform environment of
 * radiance 1.0 and it must return radiance 1.0 -- at every roughness,
 * at every angle. Anything less is energy the renderer destroyed;
 * anything more is energy it invented. No art direction, no taste, no
 * tonemapper: one number, and it is 1.
 *
 * WHAT THIS RIG IS. Six F0 = 1 spheres at roughness 0.10 to 1.00 in a
 * pure white sky with the sun switched off and the ground black, so the
 * only light in the scene is the uniform environment. Measured on
 * attachment 0's LINEAR HDR, before the tonemapper, because the
 * question is radiance and not appearance. Then the same sweep lit by
 * the sun alone with the sky switched off, which is the direct-light
 * half of the same fault. Then a four-sphere row for the two new lobes.
 *
 * MEASURED ON THE BUILD THIS TEST WAS WRITTEN AGAINST:
 *
 *   furnace, probe on (ultra's real configuration)
 *     rough      0.10    0.28    0.46    0.64    0.82    1.00
 *     off      0.9984  0.9801  0.8976  0.7223  0.5149  0.3332
 *     on       1.0000  1.0000  1.0000  1.0000  1.0000  1.0010
 *   furnace, probe off (the analytic path the lower tiers use)
 *     off      0.9448  0.8462  0.7471  0.6479  0.5488  0.4500
 *     on       1.0000  1.0000  1.0000  1.0000  1.0000  1.0000
 *   sun only, probe off
 *     off      3.7206  0.8051  0.6714  0.5467  0.3720  0.2271
 *     on       3.9588  0.9610  0.9285  0.9026  0.7330  0.5142
 *
 * TWO THINGS IN THOSE NUMBERS ARE THE WHOLE FEATURE. The off row at
 * roughness 1.00 is 0.3332 -- two thirds of the light gone. The on row
 * is FLAT AT 1.0000 to four decimals across the entire sweep, with the
 * probe on and with it off, which is only possible because the
 * compensation is normalised against the same split-sum the lobe
 * actually used. An earlier cut used the analytic fit for both and
 * overshot to 1.2016 at roughness 0.46 when the integrated LUT was in
 * play; that is what the second source in msFromEss exists for.
 *
 * AND THE OFF STATE IS BIT-IDENTICAL TO THE RENDERER BEFORE THIS
 * FEATURE. Not "close": the same four decimals from the same rig
 * against the pre-feature bundle, and a whole 8-bit frame of ten
 * textured materials, two point lights, shadows, SSAO, bloom and FXAA
 * that compares byte for byte at retro, low, normal and high. That is
 * why quality.multiscatter and quality.specOcclusion ship at 0 on
 * those four tiers and why not one recorded number anywhere else in
 * the suite had to move.
 *
 * Usage: node engine/test/energy.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const BUNDLE = path.join(ROOT, 'site/engine/legend-engine.js');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (!fs.existsSync(BUNDLE)) {
  console.error('build the engine first: node engine/build.js');
  process.exit(1);
}

const ROUGH = [0.10, 0.28, 0.46, 0.64, 0.82, 1.00];

/* The recorded state of the renderer. `off` is what single-scatter GGX
   does and it is meant to be bad. `on` is the furnace, and the only
   number that matters about it is that it is 1. */
const BASE = {
  'furnace-probe':   { off: [0.9984, 0.9801, 0.8976, 0.7223, 0.5149, 0.3332],
                       on:  [1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0010] },
  'furnace-analytic':{ off: [0.9448, 0.8462, 0.7471, 0.6479, 0.5488, 0.4500],
                       on:  [1.0000, 1.0000, 1.0000, 1.0000, 1.0000, 1.0000] },
  'sun':             { off: [3.7206, 0.8051, 0.6714, 0.5467, 0.3720, 0.2271],
                       on:  [3.9588, 0.9610, 0.9285, 0.9026, 0.7330, 0.5142] },
};
/* rim/core on a sphere. Clearcoat and sheen are both RIM phenomena --
   a lacquered panel and a canvas strap both light up at the silhouette
   and barely move in the middle -- so this ratio is the measurement
   and the mean is not. */
const COAT = {
  'paint-plain': 0.3047, 'paint-clearcoat': 0.3652,
  'cloth-plain': 0.8251, 'cloth-sheen':     1.0002,
};

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const note = (s) => console.log(`  ..   ${s}`);
const row = (a) => a.map((v) => v.toFixed(4).padStart(9)).join('');

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 600, height: 200 } });
  page.setDefaultTimeout(900000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(BUNDLE, 'utf8') });

  /* ---- the shared harness, evaluated once in the page ---- */
  await page.evaluate(() => {
    /* RGBA16F comes back as halves: SwiftShader will not hand a
       half-float attachment over as RGBA/FLOAT, so ask the driver what
       it will accept and decode whatever arrives. */
    window.__half = (h) => {
      const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
      if (e === 0) return s * m * 5.9604644775390625e-8;
      if (e === 31) return m ? NaN : s * Infinity;
      return s * Math.pow(2, e - 15) * (1 + m / 1024);
    };
    window.__readHdr = (g) => {
      const r = g.renderer, gl = g.gl, W = r.hdrA.width, H = r.hdrA.height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.hdrA.handle);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      while (gl.getError()) {}
      const fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
      const typ = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
      const px = new Float32Array(W * H * 4);
      if (typ === gl.HALF_FLOAT) {
        const raw = new Uint16Array(W * H * 4);
        gl.readPixels(0, 0, W, H, fmt, typ, raw);
        for (let i = 0; i < raw.length; i++) px[i] = window.__half(raw[i]);
      } else gl.readPixels(0, 0, W, H, fmt, typ, px);
      const err = gl.getError();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return err ? null : { px, W, H };
    };
    /* WHERE THE SPHERE IS, PROJECTED RATHER THAN GUESSED. A difference
       mask (render with, render without) cannot be used here: an actor
       with no body is marked still and the batch it is in is cached, so
       hiding it does not change the next frame. The camera's own
       viewProj is exact and costs nothing. */
    window.__discs = (g, pos, radius) => {
      const r = g.renderer, cam = r.camera, e = cam.viewProj.e;
      const W = r.hdrA.width, H = r.hdrA.height;
      const proj = (q) => {
        const x = q[0], y = q[1], z = q[2];
        const cx = e[0]*x + e[4]*y + e[8]*z + e[12];
        const cy = e[1]*x + e[5]*y + e[9]*z + e[13];
        const cw = e[3]*x + e[7]*y + e[11]*z + e[15];
        return [(cx / cw * 0.5 + 0.5) * W, (cy / cw * 0.5 + 0.5) * H];
      };
      return pos.map((q) => {
        const c = proj(q);
        const ed = proj([q[0] + cam.right.x * radius, q[1] + cam.right.y * radius,
          q[2] + cam.right.z * radius]);
        return { cx: c[0], cy: c[1], rr: Math.hypot(ed[0] - c[0], ed[1] - c[1]) };
      });
    };
    /* Sampled to 0.70 of the radius. The outer three tenths are the
       silhouette, where a pixel is part sphere and part sky and the
       measurement would be of the blend. */
    window.__bands = (f, discs, frac) => discs.map((d) => {
      let s = 0, n = 0; const R2 = (d.rr * frac) * (d.rr * frac);
      for (let y = Math.floor(d.cy - d.rr); y <= Math.ceil(d.cy + d.rr); y++)
        for (let x = Math.floor(d.cx - d.rr); x <= Math.ceil(d.cx + d.rr); x++) {
          if (x < 0 || y < 0 || x >= f.W || y >= f.H) continue;
          const dx = x - d.cx, dy = y - d.cy;
          if (dx * dx + dy * dy > R2) continue;
          const q = (y * f.W + x) * 4;
          s += 0.2126 * f.px[q] + 0.7152 * f.px[q + 1] + 0.0722 * f.px[q + 2];
          n++;
        }
      return n ? s / n : 0;
    });
  });

  /* ================= the energy sweeps ================= */
  const sweeps = {};
  for (const [id, mode, env] of [['furnace-probe', 'furnace', 1],
    ['furnace-analytic', 'furnace', 0], ['sun', 'sun', 0]]) {
    sweeps[id] = await page.evaluate(({ mode, env, ROUGH }) => {
      /* 0.6 render scale on a 600x200 page is 360x120 = 43k pixels.
         Every ultra path runs, on a real driver, for a fortieth of one
         browser.test.js scene. */
      const g = LegendEngine.create({ canvas: '#game', quality: 'ultra',
        preserveDrawingBuffer: true,
        qualityOverrides: { renderScale: 0.6, shadowRes: 512, maxGrass: 0,
          env, envRes: 32, envSamples: 8, ssr: 0, ssrSteps: 0, envScene: 0,
          bloom: false, bloomIters: 0, ssao: 0, ssaoSamples: 0, fxaa: false,
          sharpen: 0, multiscatter: 0, specOcclusion: 0 } });
      const r = g.renderer;
      r.post.vignette = 0; r.post.grain = 0; r.post.chromatic = 0; r.post.bloom = 0;
      r.sky.clouds = 0; r.sky.occlusion = 0; r.sky.room.set(0, 0, 0); r.sky.bounce = 0;
      r.fog.density = 0; r.shadows.enabled = false;
      if (mode === 'furnace') {
        r.sky.zenith.set(1, 1, 1); r.sky.horizon.set(1, 1, 1); r.sky.ground.set(1, 1, 1);
        r.sky.intensity = 1.0; r.sun.intensity = 0.0; r.sun.direction.set(0, 1, 0);
      } else {
        r.sky.zenith.set(0, 0, 0); r.sky.horizon.set(0, 0, 0); r.sky.ground.set(0, 0, 0);
        r.sky.intensity = 0.0; r.sun.intensity = 4.0; r.sun.color.set(1, 1, 1);
        r.sun.direction.set(0.30, 0.30, -0.905);
      }
      /* A black floor a long way down, only so the horizon is not the
         bottom of the sky gradient across the spheres. */
      g.box({ size: [90, 0.4, 90], position: [0, -8.0, 0], physics: false,
        material: { color: 0x000000, texture: 'smooth', roughness: 1.0 } });
      /* NO TEXTURE ON THE SPHERES. metal resolves as
         uMetalness * mix(1, orm.b, 0.85), and a recipe that never sets
         metal would render a material asking for 1 at 0.15. With no
         maps uHasMaps is 0 and the uniforms pass through untouched,
         which is what F0 = 1 requires. */
      const pos = [];
      for (let i = 0; i < ROUGH.length; i++) {
        const q = [-5.0 + i * 2.0, 1.0, 0]; pos.push(q);
        g.sphere({ radius: 0.8, position: q, physics: false,
          material: { color: 0xffffff, texture: null, roughness: ROUGH[i], metalness: 1 } });
      }
      g.camera.position.set(0, 1.0, -8.5); g.camera.target.set(0, 1.0, 0);
      if (g.fieldOfView) g.fieldOfView(66);
      /* 40 frames. The environment cube bakes ONE FACE PER FRAME and
         the prefilter walks the mips after it, so a probe read before
         it finishes is a measurement of a half-baked cube. */
      for (let i = 0; i < 40; i++) g.step(1 / 60);
      const discs = window.__discs(g, pos, 0.8);
      const take = () => { for (let i = 0; i < 3; i++) g.step(1 / 60);
        const f = window.__readHdr(g); return f ? window.__bands(f, discs, 0.70) : null; };
      const off = take();
      r.quality.multiscatter = 1; const on = take();
      r.quality.multiscatter = 0; const occ = take();
      r.quality.specOcclusion = 1; const so = take();
      r.quality.specOcclusion = 0;
      return { off, on, occ, so, W: r.hdrA.width, H: r.hdrA.height,
        gbuffer: r.gbuffer, atts: r.hdrA.colors.length };
    }, { mode, env, ROUGH });
  }

  console.log('\nENERGY SWEEP (linear HDR, mean over the inner 70% of each sphere)');
  console.log('  rough   ', ROUGH.map((v) => v.toFixed(2).padStart(9)).join(''));
  for (const id of Object.keys(sweeps)) {
    const s = sweeps[id];
    console.log(`  ${id}`);
    console.log('    off   ', row(s.off));
    console.log('    on    ', row(s.on));
    note(`${id}: retention r1.00/r0.10  off ${(s.off[5] / s.off[0]).toFixed(4)}`
      + `  ->  on ${(s.on[5] / s.on[0]).toFixed(4)}`);
  }

  const fp = sweeps['furnace-probe'], fa = sweeps['furnace-analytic'], sn = sweeps['sun'];

  check('the rig has a G-buffer and two attachments, i.e. it is really at ultra',
    fp.gbuffer === true && fp.atts >= 2, `gbuffer=${fp.gbuffer} atts=${fp.atts}`);

  /* THE HEADLINE. A white furnace must return exactly what it receives.
     3% either way: the sphere is 17 pixels across, so the outer ring of
     the sampled disc carries some partial coverage, and the probe path
     reads a 32-pixel cube face. */
  for (const [id, s] of [['probe', fp], ['analytic', fa]]) {
    const worst = Math.max(...s.on.map((v) => Math.abs(v - 1)));
    check(`white furnace (${id}): every roughness returns 1.0 within 3%`,
      worst < 0.03, `worst deviation ${worst.toFixed(4)}  row${row(s.on)}`);
  }
  /* And the fault it fixes is still demonstrably there when it is off,
     or this test has stopped measuring anything. */
  check('single-scatter still loses most of the light at roughness 1.0',
    fp.off[5] < 0.45 && fa.off[5] < 0.55,
    `probe ${fp.off[5].toFixed(4)} analytic ${fa.off[5].toFixed(4)}`);
  check('and the compensation is worth more the rougher the surface',
    (fp.on[5] / fp.off[5]) > (fp.on[1] / fp.off[1]) * 1.5,
    `r1.00 x${(fp.on[5] / fp.off[5]).toFixed(3)} vs r0.28 x${(fp.on[1] / fp.off[1]).toFixed(3)}`);

  /* Direct light: a ratchet rather than a furnace, because the sun is a
     delta and a sphere's mean is not a hemispherical albedo. */
  check('rough metal under the sun gains at least 80% at roughness 1.0',
    sn.on[5] / sn.off[5] > 1.8, `x${(sn.on[5] / sn.off[5]).toFixed(3)}`);
  check('and a near-mirror under the sun barely moves',
    sn.on[0] / sn.off[0] < 1.15, `x${(sn.on[0] / sn.off[0]).toFixed(3)}`);

  /* AO = 1 has to be EXACTLY neutral, because every untextured material
     in the engine has it and uHasMaps = 0 forces it. An off-by-epsilon
     here would darken the whole game the day the key is raised. */
  for (const [id, s] of [['probe', fp], ['analytic', fa], ['sun', sn]]) {
    const same = s.so.every((v, i) => Math.abs(v - s.off[i]) < 1e-6);
    check(`specular occlusion is exactly neutral where there is no AO map (${id})`,
      same, `${row(s.so)} vs ${row(s.off)}`);
  }
  /* Toggling the keys back must return the original numbers, which is
     the cheap in-test form of the byte-identity claim. */
  for (const [id, s] of [['probe', fp], ['analytic', fa], ['sun', sn]]) {
    check(`switching the feature off restores the previous frame (${id})`,
      s.occ.every((v, i) => Math.abs(v - s.off[i]) < 1e-6), row(s.occ));
  }
  /* The ratchet. These may improve and may not regress. */
  for (const id of Object.keys(BASE)) {
    const s = sweeps[id], b = BASE[id];
    const worst = Math.max(...s.on.map((v, i) => (b.on[i] - v) / Math.max(b.on[i], 1e-4)));
    check(`${id}: no regression against the recorded compensated sweep`,
      worst < 0.05, `worst shortfall ${(worst * 100).toFixed(2)}%  now${row(s.on)}`);
  }

  /* ================= clearcoat and sheen ================= */
  const coat = await page.evaluate(() => {
    const g = LegendEngine.create({ canvas: '#game', quality: 'ultra',
      preserveDrawingBuffer: true,
      qualityOverrides: { renderScale: 0.6, shadowRes: 1024, maxGrass: 0, env: 1,
        envRes: 32, envSamples: 8, ssr: 0, ssrSteps: 0, envScene: 0, bloom: false,
        bloomIters: 0, ssao: 0, ssaoSamples: 0, fxaa: false, sharpen: 0,
        multiscatter: 1, specOcclusion: 1 } });
    const r = g.renderer;
    r.post.vignette = 0; r.post.grain = 0; r.post.chromatic = 0;
    r.sun.intensity = 3.0; r.sun.direction.set(0.25, 0.55, -0.79);
    r.sky.intensity = 1.0; r.sky.clouds = 0; r.fog.density = 0;
    g.box({ size: [60, 0.4, 60], position: [0, -0.2, 0], physics: false,
      material: { color: 0x2a2a2e, texture: 'smooth', roughness: 0.85 } });
    /* Pairs, so each lobe is measured against the identical material
       with only its own parameter changed. */
    const specs = [
      { id: 'paint-plain',     p: [-3.3, 1.0, 0], m: { color: 0xb43a2e, texture: null, roughness: 0.42, metalness: 0.75 } },
      { id: 'paint-clearcoat', p: [-1.1, 1.0, 0], m: { color: 0xb43a2e, texture: null, roughness: 0.42, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.05 } },
      { id: 'cloth-plain',     p: [ 1.1, 1.0, 0], m: { color: 0x8d8468, texture: null, roughness: 0.95, metalness: 0 } },
      { id: 'cloth-sheen',     p: [ 3.3, 1.0, 0], m: { color: 0x8d8468, texture: null, roughness: 0.95, metalness: 0, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.3 } },
    ];
    for (const s of specs) g.sphere({ radius: 0.82, position: s.p, physics: false, material: s.m });
    g.camera.position.set(0, 1.1, -6.2); g.camera.target.set(0, 1.0, 0);
    if (g.fieldOfView) g.fieldOfView(62);
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    const discs = window.__discs(g, specs.map((s) => s.p), 0.82);
    const f = window.__readHdr(g);
    if (!f) return null;
    const out = {};
    discs.forEach((d, i) => {
      let cs = 0, cn = 0, rs = 0, rn = 0;
      for (let y = Math.floor(d.cy - d.rr); y <= Math.ceil(d.cy + d.rr); y++)
        for (let x = Math.floor(d.cx - d.rr); x <= Math.ceil(d.cx + d.rr); x++) {
          if (x < 0 || y < 0 || x >= f.W || y >= f.H) continue;
          const t = Math.hypot((x - d.cx) / d.rr, (y - d.cy) / d.rr);
          if (t > 0.93) continue;
          const q = (y * f.W + x) * 4;
          const l = 0.2126 * f.px[q] + 0.7152 * f.px[q + 1] + 0.0722 * f.px[q + 2];
          if (t < 0.55) { cs += l; cn++; } else { rs += l; rn++; }
        }
      out[specs[i].id] = { core: cn ? cs / cn : 0, rim: rn ? rs / rn : 0 };
    });
    return out;
  });

  console.log('\nCLEARCOAT AND SHEEN (rim = the outer band of the sphere, core = the inner)');
  check('the coat/cloth rig rendered', !!coat, 'null read');
  if (coat) {
    for (const id of Object.keys(coat)) {
      const c = coat[id], ratio = c.rim / Math.max(c.core, 1e-6);
      note(`${id.padEnd(16)} core ${c.core.toFixed(4)}  rim ${c.rim.toFixed(4)}`
        + `  rim/core ${ratio.toFixed(4)}  (recorded ${COAT[id].toFixed(4)})`);
    }
    const R = (id) => coat[id].rim / Math.max(coat[id].core, 1e-6);
    /* A clearcoat is a Fresnel layer: its whole signature is that the
       silhouette gains and the middle does not. If the middle gained
       too, the coat is adding energy rather than layering it. */
    check('clearcoat lights the silhouette of painted metal',
      R('paint-clearcoat') > R('paint-plain') * 1.10,
      `${R('paint-clearcoat').toFixed(4)} vs ${R('paint-plain').toFixed(4)}`);
    check('and it does not simply brighten the whole sphere',
      coat['paint-clearcoat'].core < coat['paint-plain'].core * 1.05,
      `core ${coat['paint-clearcoat'].core.toFixed(4)} vs ${coat['paint-plain'].core.toFixed(4)}`);
    /* Cloth is the lobe GGX cannot express: rim brighter than or equal
       to core, where every microfacet material is darker at the edge. */
    check('sheen turns the edge of cloth from darker than the middle to as bright',
      R('cloth-plain') < 0.92 && R('cloth-sheen') > 0.96,
      `plain ${R('cloth-plain').toFixed(4)} sheen ${R('cloth-sheen').toFixed(4)}`);
    check('and sheen pays for its rim out of the base rather than adding it',
      coat['cloth-sheen'].core < coat['cloth-plain'].core * 1.08,
      `core ${coat['cloth-sheen'].core.toFixed(4)} vs ${coat['cloth-plain'].core.toFixed(4)}`);
  }

  /* THE COMPILE GATE. Seven new GLSL functions, five new uniforms and
     two new uniform branches in the hottest shader in the engine, all
     of it only ever exercised at ultra -- which nothing else in the
     suite runs. A link failure or a dropped draw surfaces here and
     nowhere else. The filter is browser.test.js:383's, verbatim. */
  const real = errors.filter((e) => !/performance|deprecat|SwiftShader|Fallback/i.test(e));
  check('no runtime errors from any of the new shader code',
    real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
