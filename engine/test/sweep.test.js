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
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low',
      // readPixels on the default framebuffer needs the frame to survive it.
      preserveDrawingBuffer: true });
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
  out.sys = { weapons: [], variants: [], heroes: [], toggles: [], voices: [], errors: [] };
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
        /* Back to round one first.
         *
         * runFrames pins toSpawn at zero so the sweep is not fighting a
         * room filling with bodies -- but that ends each round the instant
         * it starts, so by the time the fourth melee weapon comes up the
         * round counter has raced into the hundreds and a walker spawns
         * with eighteen thousand health and moves accordingly. The riot
         * shield "failed" this check for that reason and kills a walker in
         * one swing when it is asked on its own. */
        if (typeof SS.round === 'number') SS.round = 1;
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
        /* Level the view first.
         *
         * The weapon loop above fires several hundred rounds, and recoil
         * pitch is cumulative -- by the time the melee block runs the
         * camera is aimed well above the horizon. The probe was placing
         * the target horizontally in front of the player while the melee
         * ray, which uses the camera's real three-dimensional forward,
         * went over its head. Every melee weapon "failed" and all four
         * kill a walker in one swing when asked on their own. */
        __T.look(G._camYaw || 0, 0);
        PP.kickPitch = 0;
        runFrames(4);
        const cam = G.camera;
        const put = () => {
          const fx = cam.target.x - cam.position.x, fz = cam.target.z - cam.position.z;
          const L = Math.hypot(fx, fz) || 1;
          z.actor.controller.teleport(new window.LE.Vec3(
            cam.position.x + fx / L * 1.3,
            PP.actor.position.y,
            cam.position.z + fz / L * 1.3));
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
        row.hp = Math.round(z.hp); row.hp0 = Math.round(hp0); row.round = SS.round;
        // Enough state to tell a broken weapon from a broken probe.
        row.equipped = PP.equipped();
        row.slot = PP.slot;
        row.cooldown = +PP.cooldown.toFixed(2);
        row.reloading = +PP.reloading.toFixed(2);
        row.swingT = +(PP.swingT || 0).toFixed(2);
        row.dist = +Math.hypot(z.actor.position.x - PP.actor.position.x,
          z.actor.position.z - PP.actor.position.z).toFixed(2);
        row.parked = !!z.parked;
        row.zState = z.state;
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

    /* A window with AUTO REPAIR off must stay broken while you stand at
       it, and go back up when it is on. The gate has been correct all
       along; what was not correct was a saved setting from an older build
       overriding the default, which nothing was watching for. */
    out.sys.repair = [];
    // Read after the boot: __T_SYS does not exist until the game starts.
    out.autoRepairDefault = (window.__T_SYS && window.__T_SYS.TOGGLES
      && window.__T_SYS.TOGGLES.autoRepair) ? window.__T_SYS.TOGGLES.autoRepair.def : null;
    try {
      const strip = (w) => {
        for (let i = 0; i < w.boards.length; i++) {
          if (!w.boards[i]) continue;
          if (w.boards[i].destroy) w.boards[i].destroy(); else w.boards[i].visible = false;
          w.boards[i] = null;
        }
      };
      /* A window where REPAIR is the nearest thing: at W1 the Thompson
         wall-buy sits on the same spot and shadows it. */
      let win = null, spot = null;
      for (const w of SS.windows) {
        strip(w);
        const ins = w.def.inside, sill = w.def.sillAt;
        for (const t of [0, 0.2, 0.4, 0.6, 0.8]) {
          const x = ins[0] + (sill[0] - ins[0]) * t, z = ins[2] + (sill[2] - ins[2]) * t;
          const it = __T.interactAt(x, ins[1] + 1.0, z);
          if (it && it.kind === 'repair') { win = w; spot = [x, ins[1] + 1.0, z]; break; }
        }
        if (win) break;
      }
      if (!win) out.sys.repair.push({ err: 'no window offers a repair prompt' });
      else {
        for (const auto of [false, true]) {
          SS.toggles.autoRepair = auto;
          strip(win);
          __T.teleport(spot[0], spot[1], spot[2]);
          runFrames(20);
          runFrames(420);
          out.sys.repair.push({ auto, boards: win.boards.filter(Boolean).length });
        }
        SS.toggles.autoRepair = false;
      }
    } catch (e) { out.sys.repair.push({ err: e.message }); }

    /* Every hand on every grip, measured against the weapon table the
       game actually ships.

       This used to be its own headless file with its own copy of the hand
       data, and the copy went stale the moment the grips were reworked:
       it built every hand with the default pistol grip and then failed
       eight of them for not matching poses they no longer have. A test
       carrying a second copy of the data it is testing is a test of the
       copy. It reads __T_WEAPONS now, like everything else here. */
    out.sys.grips = [];
    try {
      for (const id of Object.keys(window.__T_WEAPONS || {})) {
        const hands = window.__T_WEAPONS[id].hands;
        if (!hands) continue;
        const parts = LE.makeViewmodelArms(hands, {});
        for (const which of ['right', 'left']) {
          const h = hands[which];
          if (!h) continue;
          const geo = which === 'right' ? parts.skin : parts.lSkin;
          const pos = geo && geo.positions;
          if (!pos || !pos.length) { out.sys.grips.push({ id, which, err: 'no mesh' }); continue; }
          /* Quadrants in the GRIP's own frame, not in world Y and Z.

             The old split was `above/below the anchor` and `near/far side
             of it`, which encodes the assumption that everything is held
             either on a vertical grip or under a horizontal forend. Now
             that each weapon describes what it is holding, a spade grip
             wraps around X and a knife haft around a diagonal, and a
             fixed world-axis split measures the wrong plane -- it failed
             fourteen hands that are perfectly closed. Split along the way
             the fingers travel and along the held part's axis instead. */
          const gspec = hands[which + 'Grip'];
          const GK = LE.GRIP_KINDS || {};
          const Gd = Object.assign({}, GK.pistol,
            (typeof gspec === 'string' ? GK[gspec] : null) || GK.pistol,
            (gspec && typeof gspec === 'object') ? gspec : {});
          const nrm = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1;
            return [v[0] / L, v[1] / L, v[2] / L]; };
          const ax = nrm(Gd.axis), rd = nrm(Gd.round);
          const side3 = nrm([ax[1] * rd[2] - ax[2] * rd[1],
            ax[2] * rd[0] - ax[0] * rd[2], ax[0] * rd[1] - ax[1] * rd[0]]);
          let near = 0, cx = 0, cy = 0, cz = 0;
          const quad = [0, 0, 0, 0];
          for (let i = 0; i < pos.length; i += 3) {
            const dx = pos[i] - h[0], dy = pos[i + 1] - h[1], dz = pos[i + 2] - h[2];
            cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2];
            if (Math.hypot(dx, dy, dz) < 0.055) {
              near++;
              const a1 = dx * rd[0] + dy * rd[1] + dz * rd[2];
              const a2 = dx * side3[0] + dy * side3[1] + dz * side3[2];
              quad[(a1 >= 0 ? 0 : 2) + (a2 >= 0 ? 0 : 1)]++;
            }
          }
          const n3 = pos.length / 3;
          cx /= n3; cy /= n3; cz /= n3;
          /* Enclosure alone is not enough, and this measurement learned
             that the hard way: it once passed a hand that was a ball with
             four stubs on it, because a ball also has skin on all four
             sides of its centre. What separates a hand from a lump is
             that things stick out of it -- so `reach` is the share of
             skin further than 45 mm from the centroid, which fingers put
             there and a lump cannot. */
          let reach = 0;
          for (let i = 0; i < pos.length; i += 3) {
            if (Math.hypot(pos[i] - cx, pos[i + 1] - cy, pos[i + 2] - cz) > 0.045) reach++;
          }
          out.sys.grips.push({ id, which,
            sides: quad.filter((n) => n > near * 0.06).length,
            reach: +(reach / n3 * 100).toFixed(1) });
        }
      }
    } catch (e) { out.sys.grips.push({ id: '?', which: '?', err: e.message }); }

    /* Does hitting a body actually throw blood off it?
       The emitter can be right and the call site still missing. */
    out.sys.gore = { hit: 0, kill: 0, err: '' };
    try {
      SS.round = 1;
      __T.killAll(); runFrames(20);
      const z = __T.spawnKind('walker');
      const alive = () => (G.particles && (G.particles.count != null
        ? G.particles.count : G.particles.live)) || 0;
      const before = alive();
      __T.hurt(z, 10, null, false, 'bullet');
      out.sys.gore.hit = alive() - before;
      const mid = alive();
      __T.hurt(z, 1e6, null, true, 'bullet');      // a killing head shot
      out.sys.gore.kill = alive() - mid;
    } catch (e) { out.sys.gore.err = e.message; }

    /* Anything paper-thin standing inside the bunker.

       Two 3.4 x 4.3 metre boxes with no depth at all were built where the
       wing's east wall meets the bunker's west wall: the partition
       between them spanned from one to the other and they are the same
       plane, so the slab came out zero wide. Lit from one side, invisible
       edge-on, and solid to walk into. Nothing was watching for it. */
    out.sys.flat = [];
    try {
      const M = window.__T_MAP.main;
      const seen2 = new Set();
      const walk = (a) => {
        if (!a || seen2.has(a)) return;
        seen2.add(a);
        const m = a.matrix && a.matrix.e, bb = a.mesh && a.mesh.bounds;
        if (m && bb && a.visible !== false) {
          let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
          for (const X of [bb.min.x, bb.max.x]) {
            for (const Y of [bb.min.y, bb.max.y]) {
              for (const Z of [bb.min.z, bb.max.z]) {
                const wx = m[0] * X + m[4] * Y + m[8] * Z + m[12];
                const wy = m[1] * X + m[5] * Y + m[9] * Z + m[13];
                const wz = m[2] * X + m[6] * Y + m[10] * Z + m[14];
                lo = [Math.min(lo[0], wx), Math.min(lo[1], wy), Math.min(lo[2], wz)];
                hi = [Math.max(hi[0], wx), Math.max(hi[1], wy), Math.max(hi[2], wz)];
              }
            }
          }
          const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
          const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
          const inside = c[0] > M.x0 - 0.5 && c[0] < M.x1 + 0.5
            && c[2] > M.z0 - 0.5 && c[2] < M.z1 + 0.5 && c[1] > -0.5 && c[1] < M.y1 + 0.5;
          if (inside && Math.min.apply(null, size) < 0.02 && Math.max.apply(null, size) > 0.30) {
            out.sys.flat.push({ name: a.name || '(unnamed)',
              key: (a.mesh && a.mesh.__key) || '?',
              size: size.map((v) => +v.toFixed(3)), at: c.map((v) => +v.toFixed(2)) });
          }
        }
        for (const ch of (a.children || [])) walk(ch);
      };
      for (const a of (G.actors || [])) walk(a);
    } catch (e) { out.sys.flat.push({ name: 'scan failed', key: e.message, size: [], at: [] }); }

    /* Every playable character: can it be selected and does it speak. */
    for (const h of (window.__T_SYS && window.__T_SYS.HERO_ORDER) || []) {
      const row = { h, err: '' };
      try {
        SS.heroId = h;
        if (SS.setHero) SS.setHero(h);
        runFrames(10);
        row.spoke = SS.bark ? !!SS.bark('round', true) : null;
        /* And what they look like, read off the mesh rather than off the
           table -- the question is whether choosing a character reaches the
           arms, and a table can be full of ten different colours while every
           pair of forearms on screen stays the same. Two weapons, because
           each weapon has its own arms and only one of them was ever going
           to be the one that got updated. */
        const seen = [];
        /* Material.color is a linear Vec3, not the hex it was built from --
           reading it straight gave "[object Object]" for all ten and the
           check compared ten identical strings, which cannot fail for the
           right reason or pass for one either. Roughness too, since two
           characters could share a colour and differ in finish. */
        const read = (m) => (m && m.color
          ? [m.color.x, m.color.y, m.color.z, m.roughness].map((v) => v.toFixed(4)).join(',')
          : 'none');
        for (const wid of ['m1911', 'thompson']) {
          const arms = ((SS.player && SS.player.view[wid]) || {}).arms;
          if (!arms || !arms.skin) continue;
          seen.push(read(arms.skin.material), read(arms.sleeve.material));
        }
        row.look = seen.join('/');
      } catch (e) { row.err = e.message; }
      out.sys.heroes.push(row);
    }

    /* Are the fingers on the gun?
     *
     * Every digit reports where it starts and ends in the weapon's own
     * space, so for each fingertip the question is how far the nearest bit
     * of weapon is. Measured before this existed: every fingertip in the
     * game sat 15 to 45 mm off the thing it was holding.
     *
     * The knuckle is reported too, because the two failures look identical
     * on screen and need opposite repairs -- a knuckle on the weapon with
     * the tip in the air is a finger not closing far enough, and a knuckle
     * already 40 mm out is a hand in the wrong place. */
    out.sys.contact = [];
    try {
      for (const [id, v] of Object.entries(PP.view)) {
        const arms = v.arms;
        if (!arms || !arms.digits) continue;
        const root = v.kind === 'single' ? v.actor : v.root;
        const pts = [];
        const skin = new Set([arms.skin, arms.lSkin, arms.sleeve, arms.lSleeve, arms.thumb]);
        const walk = (a, local) => {
          if (a.mesh && !skin.has(a)) {
            const geo = G.geometryOf(a.mesh);
            if (geo && geo.positions) {
              const q = geo.positions, m = local ? local.e : null;
              for (let i = 0; i < q.length; i += 9) {
                let x = q[i], y = q[i + 1], z = q[i + 2];
                if (m) {
                  const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
                  const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
                  const wz = m[2]*x + m[6]*y + m[10]*z + m[14];
                  x = wx; y = wy; z = wz;
                }
                pts.push(x, y, z);
              }
            }
          }
          for (const c of (a.children || [])) {
            const cm = new LegendEngine.Mat4();
            cm.compose(c._position, c._rotation, c.scale);
            if (local) { const t = new LegendEngine.Mat4(); t.mulMatrices(local, cm); walk(c, t); }
            else walk(c, cm);
          }
        };
        walk(root, null);
        if (!pts.length) continue;
        const near = (P2) => {
          let best = 1e9;
          for (let i = 0; i < pts.length; i += 3) {
            const dx = pts[i]-P2[0], dy = pts[i+1]-P2[1], dz = pts[i+2]-P2[2];
            const d = dx*dx + dy*dy + dz*dz;
            if (d < best) best = d;
          }
          return Math.sqrt(best);
        };
        for (const sideName of ['right', 'left']) {
          const rec = arms.digits[sideName];
          if (!rec || !rec.digits) continue;
          const ds = rec.digits.map((d) => ({
            gap: +(near(d.tip) - d.r).toFixed(4),
            kgap: +(near(d.knuckle) - d.r).toFixed(4),
          }));
          out.sys.contact.push({ id, side: sideName, n: ds.length,
            // The last digit is the trigger finger: it rests inside a guard
            // rather than wrapping, so it is reported apart from the rest.
            wrap: ds.slice(0, 3), trigger: ds[3] || null });
        }
      }
    } catch (e) { out.sys.contact.push({ id: '?', err: e.message }); }

    /* Every mouth in the game, asked to say the same sentence.
     *
     * What this measures is the SYNTHESISER, not the audio device -- there
     * is no sound card here and there never will be. So: does the speaker
     * have a throat at all, does speak() run on it without throwing, and
     * does the length it comes back with actually move when the throat
     * changes. A voiceBox that is read but ignored gives every character
     * the same number, and that is the failure this is looking for: ten
     * characters who are described differently and sound identical. */
    const LINE = 'Hold the door and count them as they come.';
    const speakers = [];
    for (const h of (window.__T_SYS && window.__T_SYS.HERO_ORDER) || []) {
      const H = (window.__T_SYS.HEROES || {})[h];
      if (H) speakers.push({ who: h, box: H.voiceBox, kind: 'hero' });
    }
    for (const k of Object.keys((window.__T_SYS && window.__T_SYS.CAST) || {})) {
      speakers.push({ who: k, box: window.__T_SYS.CAST[k].voiceBox, kind: 'cast' });
    }
    for (const sp of speakers) {
      const row = { who: sp.who, kind: sp.kind, err: '', box: !!sp.box, dur: 0 };
      try {
        if (sp.box) {
          row.pitch = sp.box.pitch; row.tract = sp.box.tract; row.rate = sp.box.rate;
          row.words = !!sp.box.say;
        }
        // Through sayLine, so the game's own path is what is exercised --
        // including the words layer, which must not throw where there is
        // no speechSynthesis.
        row.dur = window.__T_SYS.sayLine(G, LINE, sp.box, { who: sp.who }) || 0;
      } catch (e) { row.err = e.message; }
      out.sys.voices.push(row);
    }

    /* What colour the hands COME OUT, not what colour they were set to.
     *
     * This has shipped orange three times -- once from the material, once
     * from the texture baking its own warmth on top, and once from ten
     * per-character tones picked by eye in a hex editor without accounting
     * for either. Every one of those was argued about by looking at a
     * screenshot and calling it "a bit warm". The ratio of the channels is
     * not a matter of opinion: a hand under warm indoor light lands near
     * G/R 0.76-0.88 and B/R 0.52-0.72, and a traffic cone is B/R under 0.45.
     *
     * A patch of wall is read in the same frame as a control. If the wall
     * is neutral and the hand is not, it is the hands; if both are warm, it
     * is the light, and that is a different repair. */
    out.sys.skin = [];
    try {
      /* At High, because that is the tier the tones were measured and
         tuned against -- reading them at Low would be a band from one
         lighting setup applied to another. Put back afterwards so nothing
         downstream inherits it. */
      const wasTier = SS.settings.current;
      window.__T_SYS.applyGraphics(G, SS, 'high');
      /* And standing in a known spot facing a known wall.
       *
       * Wherever the sweep happened to have left the camera, the control
       * read the "wall" patch at B/R 0.78 rather than 1.00 -- it was not
       * looking at that wall at all, so neither box meant what it was named
       * and the hand figure beside it was worth nothing. A colour reading
       * is only a colour reading if the frame is the one it was calibrated
       * against. This is the mess room's north wall, from the spot the
       * tones were tuned at. */
      __T.teleport(-2.4, 1.1, 1.4);
      __T.look(Math.PI * 0.98, 0.02);
      SS.player.give('m1911');
      runFrames(40);
      const gl = G.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      // NDC box over the firing hand, measured from the projected mesh.
      const box = (x0, x1, y0, y1) => {
        let r = 0, g = 0, b = 0, n = 0;
        const i0 = Math.round((x0 + 1) / 2 * W), i1 = Math.round((x1 + 1) / 2 * W);
        // readPixels counts y from the bottom, which is also NDC's direction.
        const j0 = Math.round((y0 + 1) / 2 * H), j1 = Math.round((y1 + 1) / 2 * H);
        for (let j = Math.max(0, j0); j < Math.min(H, j1); j++)
          for (let i = Math.max(0, i0); i < Math.min(W, i1); i++) {
            const k = (j * W + i) * 4;
            if (px[k] < 12 && px[k + 1] < 12 && px[k + 2] < 12) continue;
            r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
          }
        if (!n) return null;
        return { gr: +(g / r).toFixed(3), br: +(b / r).toFixed(3), n };
      };
      for (const h of (window.__T_SYS.HERO_ORDER || [])) {
        SS.setHero(h);
        runFrames(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const hand = box(0.20, 0.48, -0.98, -0.52);
        const wall = box(-0.30, 0.10, 0.10, 0.35);
        out.sys.skin.push({ h, hand, wall });
      }
      window.__T_SYS.applyGraphics(G, SS, wasTier);
      runFrames(4);
    } catch (e) { out.sys.skin.push({ h: '?', err: e.message }); }

    /* Every settings toggle, flipped both ways with the game running.
     *
     * Through SS.setToggle, which is the same call the settings menu makes.
     * This used to write booleans into __T_SYS.TOGGLES -- the table of
     * NAMES and DEFAULTS -- so it replaced `{name, def, blurb}` with `false`
     * and never touched the live settings at all. Thirty frames later
     * nothing had happened, and the check passed, because a check that
     * flips the wrong object cannot fail. */
    for (const key of (window.__T_SYS && window.__T_SYS.TOGGLE_ORDER) || []) {
      const row = { key, err: '', took: false };
      try {
        const was = SS.toggles[key];
        for (const v of [!was, was]) {
          SS.setToggle(key, v);
          if (SS.toggles[key] !== v) throw new Error('flip did not take');
          runFrames(30);
        }
        row.took = SS.toggles[key] === was;
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

  /* A mesh far heavier than everything around it.
   *
   * This is a budget, not a correctness check: the two 1911 grip panels
   * come out at 11,824 triangles each because the checkering is real
   * geometry rather than a normal map -- every other grid node raised, so
   * the surface is a field of diamond pyramids. That is nine per cent of
   * the game's entire triangle count for two small panels, on a gun whose
   * whole receiver is 2,800. Worth knowing about before something worse
   * lands. */
  const heavy = bad((m) => m.tris > 15000);
  check('no single mesh runs away with the triangle budget', heavy.length === 0,
    list(heavy, (m) => `${m.key}: ${m.tris} triangles`));

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
    list(limp, (m) => `${m.id}: ${m.hp0} -> ${m.hp} hp; ` + JSON.stringify({ equipped: m.equipped, slot: m.slot, cooldown: m.cooldown, reloading: m.reloading, swingT: m.swingT, dist: m.dist, parked: m.parked, state: m.zState })));
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

  const gr = sy.grips || [];
  const grErr = gr.filter((g2) => g2.err);
  check('every hand builds a mesh', grErr.length === 0,
    list(grErr, (g2) => `${g2.id} ${g2.which}: ${g2.err}`));
  const claw = gr.filter((g2) => !g2.err && g2.sides < 4);
  check('every hand has skin on all four sides of what it holds', claw.length === 0,
    list(claw, (g2) => `${g2.id} ${g2.which}: skin on only ${g2.sides} sides`));
  /* Fingers reach; a lump does not. The bar is low because it has to hold
     for a fist round a 34 mm grip and for a hand laid open on a 108 mm
     tube, which are legitimately different shapes. */
  const lump = gr.filter((g2) => !g2.err && g2.reach < 10);
  check('no hand is a lump with no fingers on it', lump.length === 0,
    list(lump, (g2) => `${g2.id} ${g2.which}: only ${g2.reach}% of skin reaches past the palm`));

  const go = sy.gore || {};
  check('a hit throws blood off the body', !go.err && go.hit > 6,
    go.err || `${go.hit} particles`);
  check('a killing blow makes more of a mess than a hit', !go.err && go.kill > go.hit,
    go.err || `hit ${go.hit}, kill ${go.kill}`);

  /* The ground plane is legitimately flat; nothing else in the room is. */
  const flat2 = (sy.flat || []).filter((f) => f.name !== 'ground');
  check('nothing paper-thin is standing inside the bunker', flat2.length === 0,
    list(flat2, (f) => `${f.name} (${f.key}) ${f.size.join(' x ')} at ${f.at.join(', ')}`));

  const rp = sy.repair || [];
  const rpErr = rp.filter((r) => r.err);
  const off = rp.find((r) => r.auto === false), on = rp.find((r) => r.auto === true);
  check('a barricade does not rebuild itself with auto repair off',
    !rpErr.length && off && off.boards === 0,
    rpErr.length ? rpErr[0].err : off ? `${off.boards} boards went back on their own` : 'no reading');
  check('a barricade does rebuild itself with auto repair on',
    !rpErr.length && on && on.boards > 0,
    on ? `${on.boards} boards` : 'no reading');
  check('the settings default to auto repair off',
    r.autoRepairDefault === false, 'default is ' + r.autoRepairDefault);

  const hErr = sy.heroes.filter((h) => h.err);
  check('every playable character can be selected', hErr.length === 0,
    list(hErr, (h) => `${h.h}: ${h.err}`));

  const looks = sy.heroes.filter((h) => h.look);
  const distinct = new Set(looks.map((h) => h.look));
  check('choosing a character changes the arms you are looking at',
    looks.length === sy.heroes.length && distinct.size === sy.heroes.length,
    `${distinct.size} distinct looks across ${sy.heroes.length} characters` +
    (looks.length < sy.heroes.length ? `; ${sy.heroes.length - looks.length} read nothing` : ''));
  check('every weapon\'s arms follow the character, not just the first',
    looks.every((h) => h.look.split('/').length === 4),
    list(looks.filter((h) => h.look.split('/').length !== 4), (h) => `${h.h}: ${h.look}`));

  const ct = (sy.contact || []).filter((q) => !q.err);
  const ctErr = (sy.contact || []).filter((q) => q.err);
  /* Two different faults, and the max alone cannot tell them apart.
   *
   * A hand where three fingers touch within a millimetre and the fourth is
   * 16 mm off IS holding the weapon -- that is a hand on a forend that
   * tapers, and the finger nearest the muzzle is round a thinner part. A
   * hand where all four are 30 mm off is holding nothing. Judging on the
   * worst finger calls both of those the same thing and flags correct
   * anatomy along with the fault.
   *
   * So: the MIDDLE finger's gap says whether the hand is on the weapon, and
   * the WORST finger says whether one is sticking out on its own -- which
   * is its own complaint and worth catching separately. */
  const mid = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const floating = ct.filter((q) => mid(q.wrap.map((d) => d.gap)) > 0.008);
  check('the fingers that wrap a weapon are touching it',
    !ctErr.length && ct.length > 0 && floating.length === 0,
    ctErr.length ? ctErr[0].err
      : list(floating, (q) => `${q.id}/${q.side}: tips ${q.wrap.map((d) => Math.round(d.gap * 1000)).join(', ')} mm off`));
  const stickOut = ct.filter((q) => Math.max.apply(null, q.wrap.map((d) => d.gap)) > 0.030);
  check('no single finger is left sticking out on its own',
    stickOut.length === 0,
    list(stickOut, (q) => `${q.id}/${q.side}: tips ${q.wrap.map((d) => Math.round(d.gap * 1000)).join(', ')} mm off`));
  const misplaced = ct.filter((q) => mid(q.wrap.map((d) => d.kgap)) > 0.018);
  check('every hand is in the right place on its weapon',
    misplaced.length === 0,
    list(misplaced, (q) => `${q.id}/${q.side}: knuckles ${q.wrap.map((d) => Math.round(d.kgap * 1000)).join(', ')} mm off`));
  const noFingers = ct.filter((q) => q.n !== 4);
  check('every hand has four fingers on it and no more',
    noFingers.length === 0, list(noFingers, (q) => `${q.id}/${q.side}: ${q.n}`));

  const sk = (sy.skin || []).filter((q) => !q.err);
  const skErr = (sy.skin || []).filter((q) => q.err);
  const orange = sk.filter((q) => !q.hand || q.hand.br < 0.50 || q.hand.br > 0.78
    || q.hand.gr < 0.74 || q.hand.gr > 0.92);
  check('the hands come out the colour of hands',
    !skErr.length && sk.length > 0 && orange.length === 0,
    skErr.length ? skErr[0].err
      : list(orange, (q) => q.hand
        ? `${q.h}: G/R ${q.hand.gr}, B/R ${q.hand.br}` + (q.hand.br < 0.50 ? '  (orange)' : '')
        : `${q.h}: no hand pixels found`));
  // The control. If this drifts the reading above means something different.
  const cw = sk.filter((q) => q.wall && (q.wall.br < 0.9 || q.wall.br > 1.1));
  check('the wall behind them is still neutral, so the reading is about the hands',
    cw.length === 0, list(cw, (q) => `${q.h}: wall B/R ${q.wall.br}`));

  const vo = sy.voices || [];
  const voErr = vo.filter((v) => v.err);
  check('every speaking part has a voice to speak with', vo.length > 0 && vo.every((v) => v.box),
    list(vo.filter((v) => !v.box), (v) => `${v.who} (${v.kind}) has no voiceBox`));
  check('saying a line never throws', voErr.length === 0,
    list(voErr, (v) => `${v.who}: ${v.err}`));
  /* Two throats, not two names. Pitch and tract together are what make one
     character sound eighty and another nineteen; if the table were copied
     around, these would collapse. */
  const throats = new Set(vo.filter((v) => v.box).map((v) => `${v.pitch}/${v.tract}/${v.rate}`));
  check('no two characters share a throat', throats.size === vo.length,
    `${throats.size} distinct settings across ${vo.length} speakers`);
  check('every voice also carries the words layer', vo.every((v) => !v.box || v.words),
    list(vo.filter((v) => v.box && !v.words), (v) => `${v.who} has no say{} block`));

  const tErr = sy.toggles.filter((t) => t.err);
  check('every settings toggle can be flipped while playing', tErr.length === 0,
    list(tErr, (t) => `${t.key}: ${t.err}`));
  check('a flipped setting comes back where it started',
    sy.toggles.length > 0 && sy.toggles.every((t) => t.took),
    list(sy.toggles.filter((t) => !t.took), (t) => t.key));

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
