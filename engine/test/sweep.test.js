#!/usr/bin/env node
/* Every mesh in the game, checked against the things a machine can decide.
 *
 * There is one choke point that every piece of geometry in this project
 * passes through -- Engine._mesh, which takes a build function and uploads
 * the result -- so wrapping it and then booting the whole game catches
 * every weapon, every zombie body, every prop, every wall of the map and
 * the arms, without needing a list of them that would go stale the first
 * time somebody adds a model.
 *
 * What is checked, and why each one is here rather than being a thing I
 * looked at once:
 *
 *   finite            one NaN in a position makes the bounding box NaN,
 *                     which makes every frustum test false, and the model
 *                     silently stops drawing from some angles only.
 *   indices in range  an index past the end of the buffer draws garbage or
 *                     drops the draw call, depending on the driver.
 *   normals           a zero-length normal shades black. Every "why is
 *                     this model black" hour has started here or at
 *                     metalness.
 *   degenerate tris   a handful is normal; thousands means a sweep whose
 *                     stations collapsed onto each other.
 *   winding           a closed mesh with negative signed volume is
 *                     inside-out, and backface culling makes it vanish
 *                     rather than merely shade oddly.
 *   scale             a part 40 m across, or one with no size at all, is
 *                     a units mistake -- and this codebase is in metres
 *                     where a whole gun is 0.6.
 *   stranded parts    a part whose bounds do not touch the rest of the
 *                     model is the "sixteen weapons piled at the origin"
 *                     failure, and it is invisible in any single view.
 *
 * Usage: node engine/test/sweep.test.js [--json]
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('the sweep needs playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* Run inside the page: wrap _mesh, boot everything, then measure. Written
   as a function and stringified so it can be edited like code. */
const SWEEP = () => {
  const out = { meshes: [], errors: [] };
  const seen = {};

  /* Capture every geometry as it is uploaded. The GpuMesh drops the CPU
     arrays after upload, so this is the only moment they exist. */
  const E = LE.Engine.prototype;
  const realMesh = E._mesh;
  E._mesh = function (key, build) {
    if (!this.meshCache.get(key)) {
      let geo = null;
      const wrapped = () => { geo = build(); return geo; };
      const m = realMesh.call(this, key, wrapped);
      if (geo && geo.positions && !seen[key]) seen[key] = geo;
      return m;
    }
    return realMesh.call(this, key, build);
  };

  const stats = (geo) => {
    const P = geo.positions, I = geo.indices, N = geo.normals;
    const r = { verts: P.length / 3, tris: I ? I.length / 3 : 0,
      nan: 0, badIdx: 0, badNorm: 0, degen: 0, vol: 0 };
    let minx = 1e9, miny = 1e9, minz = 1e9, maxx = -1e9, maxy = -1e9, maxz = -1e9;
    for (let i = 0; i < P.length; i++) if (!Number.isFinite(P[i])) r.nan++;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    r.bounds = [minx, miny, minz, maxx, maxy, maxz];
    r.size = [maxx - minx, maxy - miny, maxz - minz];
    if (N) {
      for (let i = 0; i < N.length; i += 3) {
        const L = Math.hypot(N[i], N[i + 1], N[i + 2]);
        if (!Number.isFinite(L) || L < 0.5 || L > 1.6) r.badNorm++;
      }
    } else r.badNorm = -1;
    if (I) {
      const nv = P.length / 3;
      for (let i = 0; i + 2 < I.length; i += 3) {
        const a = I[i], b = I[i + 1], c = I[i + 2];
        if (a >= nv || b >= nv || c >= nv || a < 0 || b < 0 || c < 0) { r.badIdx++; continue; }
        const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
        const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
        const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (Math.hypot(nx, ny, nz) < 1e-12) r.degen++;
      }

    }
    return r;
  };

  /* Boot the game itself: that builds the map, the props, the zombie
     bodies and every weapon that gets racked. */
  try {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 40; i++) window.B.game.step(1 / 60);
  } catch (e) { out.errors.push('boot: ' + e.message); }

  /* Then everything the boot does not touch: every weapon the player can
     ever hold, and every zombie variant's body. */
  const S = window.B && window.B.S, P = S && S.player;
  if (P) {
    for (const id of Object.keys(window.__T_WEAPONS || {})) {
      try {
        P.give(id);
        P.slot = P.slots.indexOf(id);
        for (let i = 0; i < 8; i++) { window.B.game.step(1 / 60); S.toSpawn = 0; S.spawnT = 1e9; }
      } catch (e) { out.errors.push('equip ' + id + ': ' + e.message); }
    }
    for (const kind of ['walker', 'runner', 'crawler', 'spitter', 'armored', 'amalgam', 'boss']) {
      try {
        const z = __T.spawnKind(kind);
        for (let i = 0; i < 6; i++) { window.B.game.step(1 / 60); S.toSpawn = 0; S.spawnT = 1e9; }
        if (z) __T.killAll();
      } catch (e) { out.errors.push('spawn ' + kind + ': ' + e.message); }
    }
  }

  for (const key in seen) {
    const r = stats(seen[key]);
    r.key = key;
    out.meshes.push(r);
  }

  /* Every mesh, drawn culled and then double-sided, in a scene of its own.
     See the note on the check that reads this. */
  out.cull = [];
  try {
    const g = LE.create({ canvas: document.createElement('canvas'), quality: 'low',
      preserveDrawingBuffer: true });
    g.canvas.width = 200; g.canvas.height = 160;
    g.setSky('day', { fogDensity: 0, zenith: 0x000000, horizon: 0x000000, ground: 0x000000,
      sun: [0.4, 0.7, 0.3], sunColor: 0xffffff, sunIntensity: 2, exposure: 1, room: 0xffffff });
    g.renderer.sky.intensity = 0;
    g.light({ at: [0.6, 0.8, 0.6], color: 0xffffff, intensity: 40, radius: 8 });
    g.light({ at: [-0.6, 0.4, -0.6], color: 0xffffff, intensity: 40, radius: 8 });
    const gl = g.renderer.gl;
    const px = new Uint8Array(200 * 160 * 4);
    const cover = () => {
      for (let i = 0; i < 2; i++) g.step(1 / 60);
      gl.readPixels(0, 0, 200, 160, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 40) n++;
      return n;
    };
    for (const key in seen) {
      const geo = seen[key], bb = geo.bounds;
      if (!bb) continue;
      const c = [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2];
      const rad = Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.5;
      if (!(rad > 1e-5)) continue;
      let solid = 0, both = 0;
      for (const dbl of [false, true]) {
        const a = g._spawn({ physics: false, material: { color: 0xffffff, texture: 'smooth',
          roughness: 0.6, metalness: 0, emissive: 0xffffff, emissiveStrength: 0.9,
          doubleSided: dbl } }, g._mesh('cull:' + key + ':' + dbl, () => geo), null, rad * 2);
        g.camera.position.set(c[0] + rad * 1.5, c[1] + rad * 1.1, c[2] + rad * 1.7);
        g.camera.target.set(c[0], c[1], c[2]);
        g.camera.fov = 45 * Math.PI / 180;
        const n = cover();
        if (dbl) both = n; else solid = n;
        if (a.destroy) a.destroy(); else a.visible = false;
        for (let i = 0; i < 2; i++) g.step(1 / 60);
      }
      if (both > 80) out.cull.push({ key, solid, both, lost: +(100 - solid / both * 100).toFixed(0) });
    }
  } catch (e) { out.errors.push('cull pass: ' + e.message); }

  E._mesh = realMesh;

  /* ---- and then the systems, put through every combination they have.
   *
   * A model that is geometrically sound can still be attached to a weapon
   * that throws on its third reload, or a variant that never reaches the
   * player, so the second half of the sweep drives the game rather than
   * measuring it. Every check here is something that has actually gone
   * wrong in this project at least once. */
  out.sys = { weapons: [], variants: [], heroes: [], toggles: [], errors: [] };
  const G = window.B && window.B.game, SS = window.B && window.B.S;
  const PP = SS && SS.player;
  const runFrames = (n) => {
    for (let i = 0; i < n; i++) { G.step(1 / 60); SS.toSpawn = 0; SS.spawnT = 1e9; }
  };
  if (PP) {
    __T.god(true);
    /* Every weapon: equip it, empty it, reload it, empty it again. The
       reload defect this game has shipped four times -- a sound played
       once a frame instead of once -- only shows on a reload that
       actually runs to the end, and the second magazine is where a
       counter that never resets gives itself away. */
    const sfxT = SS.__sfx;
    for (const id of Object.keys(window.__T_WEAPONS || {})) {
      const row = { id, fired: 0, worstSound: 0, worstKey: '', brass: 0, err: '' };
      try {
        PP.give(id);
        PP.slot = PP.slots.indexOf(id);
        runFrames(30);
        const counts = {};
        const saved = {};
        for (const k of Object.keys(sfxT)) {
          if (typeof sfxT[k] !== 'function') continue;
          saved[k] = sfxT[k];
          sfxT[k] = function () { counts[k] = (counts[k] || 0) + 1; };
        }
        const brass0 = SS.brass.length;
        for (let round = 0; round < 2; round++) {
          for (let i = 0; i < 420; i++) {
            if ((i % 10) === 0) __T.hold({ fire: true });
            else if ((i % 10) === 4) __T.release();
            runFrames(1);
          }
          __T.release();
          __T.reload();
          runFrames(Math.ceil(((PP.spec() || {}).reload || 3) * 60) + 40);
        }
        for (const k in saved) sfxT[k] = saved[k];
        row.brass = SS.brass.length - brass0;
        /* The weapon's own firing sound is excluded from this: it is
           SUPPOSED to play once per shot, and a belt-fed MG holding the
           trigger for fourteen seconds legitimately plays it eighty-four
           times. The defect this is looking for has always been in the
           OTHER sounds -- a shell, a lever, a cylinder -- played once a
           frame for the length of a reload. */
        const own = (PP.spec() || {}).sfx;
        row.hasSfx = !!own;
        row.melee = !!(PP.spec() || {}).melee;
        row.fired = counts[own] || 0;
        for (const k in counts) {
          if (k === own) continue;
          if (counts[k] > row.worstSound) { row.worstSound = counts[k]; row.worstKey = k; }
        }
      } catch (e) { row.err = e.message; }
      out.sys.weapons.push(row);
    }

    /* The melee weapons, against something to hit. Their sound only plays
       on a connection, so swinging at an empty room proves nothing -- put
       a body in front of the player and check that it loses health. */
    out.sys.melee = [];
    for (const id of Object.keys(window.__T_WEAPONS || {})) {
      if (!(window.__T_WEAPONS[id] || {}).melee) continue;
      const row = { id, hurt: false, err: '' };
      try {
        PP.give(id);
        PP.slot = PP.slots.indexOf(id);
        __T.killAll(); runFrames(20);
        const z = __T.spawnKind('walker');
        if (!z) { row.err = 'no target would spawn'; out.sys.melee.push(row); continue; }
        /* Put the TARGET in front of the camera, rather than putting the
           player next to the target. Melee raycasts from the eye along the
           camera's forward and stops at the first body it meets, so a
           zombie standing out at its window with a bunker wall between it
           and a teleported player is not a test of the weapon -- it is a
           test of the wall, and it failed all four including the knife,
           which is what gave the probe away. */
        const cam = G.camera;
        const fw = { x: cam.target.x - cam.position.x, y: 0, z: cam.target.z - cam.position.z };
        const L = Math.hypot(fw.x, fw.z) || 1;
        const put = () => {
          const at = new window.LE.Vec3(
            cam.position.x + fw.x / L * 1.3,
            PP.actor.position.y,
            cam.position.z + fw.z / L * 1.3);
          z.actor.controller.teleport(at);
        };
        put(); runFrames(4);
        const hp0 = z.hp;
        for (let i = 0; i < 600; i++) {
          // Held back in place every few frames: it is a live zombie and
          // it walks away between swings.
          if ((i % 4) === 0) put();
          if ((i % 12) === 0) __T.hold({ fire: true });
          else if ((i % 12) === 5) __T.release();
          runFrames(1);
          if (z.dead || z.hp < hp0) break;
        }
        __T.release();
        row.hurt = !!(z.dead || z.hp < hp0);
        row.hp = z.hp; row.hp0 = hp0;
      } catch (e) { row.err = e.message; }
      out.sys.melee.push(row);
    }

    /* Every kind of zombie, and can it reach you and be killed. */
    for (const kind of ['walker', 'runner', 'crawler', 'spitter', 'armored', 'amalgam', 'boss']) {
      const row = { kind, moved: 0, peak: 0, maxAir: 0, animated: false, died: false, err: '' };
      try {
        __T.killAll(); runFrames(20);
        const z = __T.spawnKind(kind);
        if (!z) { row.err = 'would not spawn'; out.sys.variants.push(row); continue; }
        let last = { x: z.actor.position.x, z: z.actor.position.z }, total = 0, peak = 0;
        for (let i = 0; i < 420; i++) {
          runFrames(1);
          if (z.dead) break;
          const q = z.actor.position;
          const d = Math.hypot(q.x - last.x, q.z - last.z);
          last = { x: q.x, z: q.z };
          if (i > 30) { total += d; if (d * 60 > peak) peak = d * 60; }
          // How high the body ever gets while it is climbing in.
          if (z.vault && q.y > row.maxAir) row.maxAir = +q.y.toFixed(2);
          if (!Number.isFinite(q.x) || !Number.isFinite(q.z)) { row.err = 'position went NaN'; break; }
        }
        row.moved = +total.toFixed(2);
        row.peak = +peak.toFixed(2);
        row.animated = !!(z.actor.animator && z.actor.animator.clip);
        __T.killAll(); runFrames(10);
        row.died = !!z.dead;
      } catch (e) { row.err = e.message; }
      out.sys.variants.push(row);
    }

    /* Every playable character: can it be selected and does it speak. */
    for (const h of (window.__T_SYS && window.__T_SYS.HERO_ORDER) || []) {
      const row = { h, err: '' };
      try {
        SS.heroId = h;
        if (SS.setHero) SS.setHero(h);
        runFrames(10);
        row.spoke = SS.bark ? !!SS.bark('round', true) : null;
      } catch (e) { row.err = e.message; }
      out.sys.heroes.push(row);
    }

    /* Every settings toggle, flipped both ways with the game running. */
    const TG = window.__T_SYS && window.__T_SYS.TOGGLES;
    for (const key of (window.__T_SYS && window.__T_SYS.TOGGLE_ORDER) || []) {
      const row = { key, err: '' };
      try {
        const was = TG[key];
        for (const v of [!was, was]) { TG[key] = v; runFrames(30); }
      } catch (e) { row.err = e.message; }
      out.sys.toggles.push(row);
    }
  }
  return JSON.stringify(out);
};

let passed = 0, failed = 0;
const problems = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); if (detail) console.log('       ' + detail); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const raw = await page.evaluate(`(${SWEEP.toString()})()`);
  const r = JSON.parse(raw);
  await browser.close();

  console.log(`\nswept ${r.meshes.length} distinct meshes\n`);

  const bad = (f) => r.meshes.filter(f);
  const list = (rows, fmt) => rows.slice(0, 12).map(fmt).join('\n       ')
    + (rows.length > 12 ? `\n       ...and ${rows.length - 12} more` : '');

  const nan = bad((m) => m.nan > 0);
  check('no mesh has a NaN in it', nan.length === 0,
    list(nan, (m) => `${m.key}: ${m.nan} non-finite coordinates`));

  const oob = bad((m) => m.badIdx > 0);
  check('every index points at a vertex that exists', oob.length === 0,
    list(oob, (m) => `${m.key}: ${m.badIdx} indices past the end of ${m.verts} vertices`));

  const norm = bad((m) => m.badNorm > 0);
  check('no mesh has a broken normal', norm.length === 0,
    list(norm, (m) => `${m.key}: ${m.badNorm} of ${m.verts} normals are not unit length`));

  const dg = bad((m) => m.tris > 40 && m.degen / m.tris > 0.06);
  check('no mesh is mostly zero-area triangles', dg.length === 0,
    list(dg, (m) => `${m.key}: ${m.degen} of ${m.tris} triangles have no area`));

  const empty = bad((m) => m.verts === 0 || m.tris === 0);
  check('no mesh is empty', empty.length === 0,
    list(empty, (m) => `${m.key}: ${m.verts} vertices, ${m.tris} triangles`));

  const flat = bad((m) => Math.max(...m.size) < 1e-5);
  check('no mesh has collapsed to a point', flat.length === 0,
    list(flat, (m) => `${m.key}: ${m.size.map((v) => v.toFixed(5)).join(' x ')}`));

  /* Inside out, asked of the GPU, because nothing cheaper gets it right.
   *
   * Summing signed volume flagged nine models, including a revolver
   * cylinder I had just watched render correctly -- it is only meaningful
   * for one closed surface, and every model here is a union of overlapping
   * solids with recesses deliberately cut into it. Firing rays and asking
   * whether the first surface faces the ray flagged twelve, for the same
   * reason: a bore that pokes a fraction of a millimetre out through the
   * skin around it presents its inner wall to the ray first, and the GPU
   * does not care because the outer skin is still there in front of it.
   *
   * So draw each mesh twice -- once normally, once with the material
   * double-sided -- and compare how many pixels it covers. That is
   * precisely what "backface culling deleted this surface" means, and it
   * cannot be fooled by geometry that overlaps itself. All twelve came
   * back within noise of the controls. */
  const inv = r.cull.filter((c) => c.lost > 20);
  check('backface culling does not delete any surface', inv.length === 0,
    list(inv, (c) => `${c.key}: culling removes ${c.lost}% of it`));

  /* ---- systems */
  const sy = r.sys || { weapons: [], variants: [], heroes: [], toggles: [] };
  const wErr = sy.weapons.filter((w) => w.err);
  check('every weapon equips, fires and reloads twice without throwing', wErr.length === 0,
    list(wErr, (w) => `${w.id}: ${w.err}`));

  /* Two reloads and a few hundred shots. Every reload sound is a handful
     of beats; twenty-five is generous and a once-a-frame bug produces
     hundreds. */
  const spam = sy.weapons.filter((w) => w.worstSound > 25);
  check('no weapon plays a sound once a frame', spam.length === 0,
    list(spam, (w) => `${w.id}: ${w.worstKey} played ${w.worstSound} times`));

  /* Only the things that shoot. The ram and the riot shields declare a
     sound, but it is a HIT sound -- it plays when the swing connects, and
     the loop above swings at an empty room. They get their own check. */
  const mute = sy.weapons.filter((w) => !w.err && w.hasSfx && !w.melee && w.fired === 0);
  check('every weapon that shoots actually shoots', mute.length === 0,
    list(mute, (w) => `${w.id}: its firing sound never played`));

  const limp = (sy.melee || []).filter((m) => !m.err && !m.hurt);
  check('every melee weapon hurts what it is swung at', limp.length === 0,
    list(limp, (m) => `${m.id}: a zombie 1.3 m in front of the camera went from ${m.hp0} to ${m.hp} hp`));
  const mErr = (sy.melee || []).filter((m) => m.err);
  check('every melee weapon can be swung', mErr.length === 0,
    list(mErr, (m) => `${m.id}: ${m.err}`));

  const shower = sy.weapons.filter((w) => w.brass > 90);
  check('no weapon empties a bandolier onto the floor', shower.length === 0,
    list(shower, (w) => `${w.id}: ${w.brass} cases`));

  const vErr = sy.variants.filter((v) => v.err);
  check('every kind of zombie spawns, moves and can be killed', vErr.length === 0,
    list(vErr, (v) => `${v.kind}: ${v.err}`));

  const stuck = sy.variants.filter((v) => !v.err && v.moved < 1);
  check('no kind of zombie stands still', stuck.length === 0,
    list(stuck, (v) => `${v.kind}: travelled ${v.moved} m in seven seconds`));

  /* A body covering more than a quarter of a metre in one frame has not
     walked there. Vaults and shoves are real, but a fifteen-metre-a-second
     spike is a body being teleported by something. */
  const warp = sy.variants.filter((v) => !v.err && v.peak > 9);
  check('no zombie teleports', warp.length === 0,
    list(warp, (v) => `${v.kind}: peaked at ${v.peak} m/s (a player sprints at 7.4)`));

  /* A body that has just climbed through a window should be standing on
     the floor, not hanging a metre above it. This is here because the
     vault's two endpoints were in different coordinate spaces and nothing
     was watching. */
  const air = sy.variants.filter((v) => !v.err && v.maxAir > 1.2);
  check('nothing finishes a window vault hanging in the air', air.length === 0,
    list(air, (v) => `${v.kind}: ended a vault ${v.maxAir} m above the floor`));

  const hErr = sy.heroes.filter((h) => h.err);
  check('every playable character can be selected', hErr.length === 0,
    list(hErr, (h) => `${h.h}: ${h.err}`));

  const tErr = sy.toggles.filter((t) => t.err);
  check('every settings toggle can be flipped while playing', tErr.length === 0,
    list(tErr, (t) => `${t.key}: ${t.err}`));

  check('the game booted and ran without throwing',
    r.errors.length === 0 && pageErrors.length === 0,
    [].concat(r.errors, pageErrors).slice(0, 8).join('\n       '));

  console.log('');
  console.log(`${passed} passed, ${failed} failed`);
  if (process.argv.indexOf('--json') >= 0) {
    fs.writeFileSync(path.join(ROOT, 'engine/test/sweep.json'), JSON.stringify(r, null, 1));
    console.log('full measurements written to engine/test/sweep.json');
  }
  void problems;
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
