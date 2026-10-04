#!/usr/bin/env node
/* Export the things a native game needs that a map is not: the zombies and
 * the guns in your hands, with their animation.
 *
 *   node my_cpp_game/tools/export_kit.js out.lekit
 *
 * The web game animates both in JavaScript every frame -- a zombie is a
 * skinned body played by an Animator, a viewmodel is a few dozen actors a
 * weapon script places relative to the camera, with arms solved onto the
 * gun. Porting the animation systems would be a second copy of them to keep
 * in step with the first, so this RECORDS them instead: it loads the real
 * zombies game headless, plays each clip the way the game plays it, and
 * writes down, frame by frame, where every part was. The native side plays
 * the recording back.
 *
 *   zombie rigs   four pooled zombies (the male, female and heavy builds and
 *                 a dressed male), each recorded through its walk, the run,
 *                 an attack and two deaths. Per frame: every part's matrix
 *                 relative to the body's root, and every skeleton's palette.
 *   view rigs     the M1911, the Thompson and the Scattergun in your hands,
 *                 recorded at rest, aimed, firing (hip and aimed) and
 *                 through a full reload. Per frame: every part's matrix
 *                 relative to the CAMERA, its visibility, the arm
 *                 skeletons' palettes and the muzzle point.
 *   weapons       each gun's numbers from the zombies game's own table.
 *
 * File format: a LESC container exactly like export_scene.js writes
 * ("LESC" | u32 1 | u32 jsonBytes | json | blob), with meshes and materials
 * in the same layout and `rigs` and `weapons` in place of `draws`.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIEW_GUNS = ['m1911', 'thompson', 'scatter'];

async function main() {
  const out = process.argv[2];
  if (!out) { console.error('usage: export_kit.js out.lekit'); process.exit(2); }

  let engine = fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8');
  const anchor = 'this.bounds = geometry.bounds || null;';
  if (!engine.includes(anchor)) throw new Error('GpuMesh anchor not found -- update export_kit.js');
  engine = engine.replace(anchor, anchor + ' this.__geometry = geometry;');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'log' && /^\[kit\]/.test(m.text())) console.log(m.text()); });
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: engine });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  console.log('[kit] starting the zombies game');
  await page.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'ultra' });
  });
  console.log('[kit] started');

  const res = await page.evaluate((VIEW_GUNS) => {
    const G = B.game, S = B.S, P = B.P, T = window.__T;
    const v3 = (v) => [v.x, v.y, v.z];
    const chunks = [];
    let bytes = 0;
    const put = (typed) => {
      const off = bytes;
      const copy = typed.slice();
      chunks.push(copy);
      bytes += copy.byteLength;
      return { off, count: copy.length };
    };
    const f32 = (a) => put(a instanceof Float32Array ? a : new Float32Array(a));
    const u32 = (a) => put(new Uint32Array(a));

    /* ---- meshes and materials: the layout export_scene.js writes ---- */
    const seedOf = new Map();
    const cache = G.gl && G.gl.__legendTexCache;
    if (cache) for (const [k, v] of cache) seedOf.set(v, parseInt(k.split(':')[2], 10) || 1);
    const meshIds = new Map(), matIds = new Map(), meshes = [], materials = [];
    const meshId = (m) => {
      if (meshIds.has(m)) return meshIds.get(m);
      const g = m.__geometry;
      if (!g || !g.indices || !g.indices.length) return -1;
      meshes.push({
        key: null,
        positions: f32(g.positions), normals: f32(g.normals), uvs: f32(g.uvs),
        tangents: g.tangents ? f32(g.tangents) : null, colors: g.colors ? f32(g.colors) : null,
        joints: g.joints ? f32(g.joints) : null, weights: g.weights ? f32(g.weights) : null,
        indices: u32(g.indices),
      });
      meshIds.set(m, meshes.length - 1);
      return meshes.length - 1;
    };
    const matId = (m) => {
      if (matIds.has(m)) return matIds.get(m);
      materials.push({
        color: v3(m.color), roughness: m.roughness, metalness: m.metalness,
        emissive: v3(m.emissive), emissiveStrength: m.emissiveStrength,
        opacity: m.opacity, transparent: !!m.transparent, doubleSided: !!m.doubleSided,
        uvScale: m.uvScale, worldUv: !!m.worldUv, normalStrength: m.normalStrength,
        detail: m.detail, texture: m.texture || null, seed: m.maps ? (seedOf.get(m.maps) || 1) : 1,
        parallax: m.parallax, castShadow: m.castShadow !== false, receiveShadow: m.receiveShadow !== false,
        subsurface: m.subsurface || 0, thin: !!m.thin, clearcoat: m.clearcoat || 0,
        clearcoatRoughness: m.clearcoatRoughness != null ? m.clearcoatRoughness : 0.1,
        sheen: m.sheen || 0, sheenColor: m.sheenColor ? v3(m.sheenColor) : [1, 1, 1],
        sheenRoughness: m.sheenRoughness != null ? m.sheenRoughness : 0.3,
      });
      matIds.set(m, materials.length - 1);
      return materials.length - 1;
    };

    /* ---- 4x4 helpers (column-major, the engine's layout) ---- */
    const mul = (a, b) => {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    };
    // Inverse of an affine matrix (any scale): the 3x3 by cofactors.
    const inv = (m) => {
      const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
      const A = e * i - f * h, Bc = -(d * i - f * g), C = d * h - e * g;
      const det = a * A + b * Bc + c * C;
      const s = 1 / det;
      const r = [A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
                 Bc * s, (a * i - c * g) * s, -(a * f - c * d) * s,
                 C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
      const o = new Float32Array(16);
      o[0] = r[0]; o[4] = r[1]; o[8] = r[2];
      o[1] = r[3]; o[5] = r[4]; o[9] = r[5];
      o[2] = r[6]; o[6] = r[7]; o[10] = r[8];
      const tx = m[12], ty = m[13], tz = m[14];
      o[12] = -(o[0] * tx + o[4] * ty + o[8] * tz);
      o[13] = -(o[1] * tx + o[5] * ty + o[9] * tz);
      o[14] = -(o[2] * tx + o[6] * ty + o[10] * tz);
      o[15] = 1;
      return o;
    };
    const depth = (a) => { let d = 0; for (let p = a.parent; p && d < 64; p = p.parent) d++; return d; };
    const shown = (a) => { for (let p = a; p; p = p.parent) if (p.visible === false || p.dead) return false; return true; };

    /* A rig: a fixed list of parts, and clips that say where each was.
       `relTo()` is the frame's reference (the zombie's root, the camera's
       view matrix); everything is stored relative to it. */
    function makeRig(name, kind, actors) {
      actors = actors.filter((a) => a.mesh && !a.noDraw && meshId(a.mesh) >= 0).sort((p, q) => depth(p) - depth(q));
      const skels = [];
      const parts = actors.map((a) => {
        let pal = -1;
        const sk = a.skeleton;
        const g = a.mesh.__geometry;
        if (sk && g.joints && g.weights) {
          pal = skels.indexOf(sk);
          if (pal < 0) { skels.push(sk); pal = skels.length - 1; }
        }
        return { mesh: meshId(a.mesh), material: matId(a.material), name: a.name || '',
                 params: [a.tint.x, a.tint.y, a.tint.z, a.custom || 0], palette: pal };
      });
      return { name, kind, actors, skels, parts, palettes: skels.map((s) => s.bones.length), clips: {} };
    }
    function capture(rig, clip, ref) {
      const c = rig.clips[clip] || (rig.clips[clip] = { model: [], vis: [], pal: rig.skels.map(() => []), muzzle: [] });
      for (const a of rig.actors) a.updateMatrix();
      // The reference AFTER the matrices are current: read before, it is last frame's (or the pool's parking spot).
      if (typeof ref === 'function') ref = ref();
      for (const a of rig.actors) {
        const m = mul(ref, a.matrix.e);
        for (let k = 0; k < 16; k++) c.model.push(m[k]);
        c.vis.push(shown(a) ? 1 : 0);
      }
      // The first-person arms' palette is read off the rig's actors (engine 98f): bring it to this frame.
      rig.skels.forEach((sk) => { if (sk.refresh) sk.refresh(); });
      rig.skels.forEach((sk, i) => { const M = sk.matrices; for (let k = 0; k < sk.bones.length * 16; k++) c.pal[i].push(M[k]); });
      c.frames = (c.frames || 0) + 1;
      return c;
    }
    function finish(rig) {
      const clips = {};
      for (const [n, c] of Object.entries(rig.clips)) {
        clips[n] = { fps: c.fps, frames: c.frames, loop: !!c.loop, model: f32(c.model), vis: f32(c.vis),
                     pal: c.pal.map((p) => f32(p)), muzzle: c.muzzle.length ? f32(c.muzzle) : null };
      }
      return { name: rig.name, kind: rig.kind, parts: rig.parts, palettes: rig.palettes, clips,
               floor: rig.floor || 0, height: rig.height || 0, muzzleRest: rig.muzzleRest || null,
               rootPart: rig.rootPart != null ? rig.rootPart : -1, muzzleLocal: rig.muzzleLocal || null };
    }

    /* NOTHING IS DRAWN WHILE RECORDING. engine.step() renders a frame as
       well as advancing the world, and under SwiftShader at ultra that is
       2.4 s of GL calls a step against 15 ms of simulation. The recording
       needs the matrices -- which _buildBatches still computes every step
       -- not the pixels. */
    const Rr = G.renderer;
    for (const k of ['renderShadows', 'renderScene', 'renderFluid', 'renderParticles', 'present'])
      if (typeof Rr[k] === 'function') Rr[k] = () => {};
    const rigs = [];
    const run = (n) => { for (let i = 0; i < n; i++) { S.toSpawn = 0; S.spawnT = 1e9; G.step(1 / 60); } };

    /* ================= THE GUNS IN YOUR HANDS ================= */
    console.log('[kit] recording the viewmodels');
    T.god(true); T.killAll();
    T.teleport(-2.4, 1.1, 1.4); T.look(Math.PI * 0.98, 0.0); run(30);
    const camRef = () => new Float32Array(G.camera.view.e);
    const camP = () => G.camera.position;
    const toCam = (w) => {   // a world point in camera space
      const V = G.camera.view.e;
      return [V[0] * w[0] + V[4] * w[1] + V[8] * w[2] + V[12], V[1] * w[0] + V[5] * w[1] + V[9] * w[2] + V[13],
              V[2] * w[0] + V[6] * w[1] + V[10] * w[2] + V[14]];
    };
    const weapons = {};
    for (const id of VIEW_GUNS) {
      const v = P.view[id];
      if (!v) { console.log('[kit] no viewmodel for ' + id); continue; }
      console.log('[kit] view ' + id + ': drawing it');
      T.release(); T.give(id); run(70);
      const ammo = P.ammoFor(id);
      const root = v.kind === 'single' ? v.actor : v.root;
      // Every actor under the weapon (arms included -- they are parented to it), and the reload props.
      const set = new Set([root].concat(v.parts || []));
      if (v.prop && v.prop.parts) for (const q of v.prop.parts) if (q) set.add(q);
      // The arms that are drawn: skinned to the rig, not parented to the weapon (engine 98f).
      if (v.arms && v.arms.body) for (const q of v.arms.body) set.add(q);
      for (let grow = true; grow;) {
        grow = false;
        for (const a of G.actors) if (!set.has(a) && a.parent && set.has(a.parent)) { set.add(a); grow = true; }
      }
      const rig = makeRig(id, 'view', [...set].filter((a) => !a.dead));
      /* The muzzle, in the weapon's own space: the barrel runs along +X (the
         slide recoils along -X), as far out as the model says its muzzle is,
         at its bore height. */
      rig.rootPart = rig.actors.indexOf(root);
      rig.muzzleLocal = [v.muzzle || root.muzzleAt || 0.3, root.boreAt != null ? root.boreAt : 0, 0];
      const rec = (clip, fps, n, loop, before) => {
        const step = Math.round(60 / fps);
        for (let f = 0; f < n; f++) {
          if (before) before(f);
          const c = capture(rig, clip, camRef());
          c.fps = fps; c.loop = loop;
          const mw = P.muzzleWorld || [camP().x, camP().y, camP().z];
          c.muzzle.push(...toCam(mw));
          if (f < n - 1) run(step);
        }
      };
      // At rest: the hip carry with the breathing settled.
      ammo.mag = WEAPONS_MAG(id); run(30);
      rec('idle', 30, 1, true);
      rig.muzzleRest = rig.clips.idle.muzzle.slice(0, 3);
      // A shot from the hip: the slide, the hammer, the kick -- 0.30 s.
      T.hold({ fire: true }); run(1); T.release();
      rec('fire', 60, 18, false);
      run(40);
      // Aimed.
      T.hold({ aim: true }); run(45);
      rec('ads', 30, 1, true);
      T.hold({ aim: true, fire: true }); run(1); T.hold({ aim: true, fire: false });
      rec('adsfire', 60, 18, false);
      T.release(); run(45);
      console.log('[kit] view ' + id + ': reload');
      // The reload, start to finish, from an empty magazine.
      ammo.mag = 0; ammo.reserve = 999; T.reload();
      let n = 0;
      const frames = [];
      rec('reload', 30, 1, false);
      while (P.reloading > 0 && n++ < 400) rec('reload', 30, 1, false, () => run(2));
      rig.clips.reload.frames = rig.clips.reload.vis.length / rig.actors.length;
      run(30);
      ammo.mag = WEAPONS_MAG(id);
      const w = T.WEAPONS[id] || {};
      weapons[id] = {
        name: w.name || id, damage: w.dmg || 0, headMul: w.headMul || 2, mag: w.mag || 0,
        reserve: w.reserve || 0, refire: w.refire || 0.2, reload: w.reload || 2, auto: !!w.auto,
        pellets: w.pellets || 1, spread: w.spread || 0, adsSpread: w.adsSpread || 0.35, kick: w.kick || 1,
        sightFov: w.sightFov || 0.8, adsTime: w.adsTime || 0.2,
        recoilUp: (w.recoil && w.recoil.up) || 1, recoilSide: (w.recoil && w.recoil.side) || 0.3,
        recover: (w.recoil && w.recoil.recover) || 9,
      };
      rigs.push(finish(rig));
      console.log(`[kit] view ${id}: ${rig.parts.length} parts, ${rig.palettes.length} skeletons, reload ${rig.clips.reload.frames} frames`);
    }
    function WEAPONS_MAG(id) { const w = T.WEAPONS[id]; return (w && w.mag) || 8; }

    /* ================= THE ZOMBIES ================= */
    console.log('[kit] recording the zombies');
    T.release(); T.killAll(); run(10);
    T.buildPool(6);
    const CLIPS = [['walk', null, true], ['zrun', 'zrun', true], ['attack', 'zattack', false],
                   ['zdie_back', 'zdie_back', false], ['zdie_face', 'zdie_face', false]];
    const bodies = [];
    for (let k = 0; k < 4; k++) {
      const z = T.spawn(null, null);
      if (!z) break;
      bodies.push(z);
    }
    bodies.forEach((z, k) => {
      const A = z.actor, anim = A.animator, sk = A.skeleton;
      const set = new Set(G.actors.filter((a) => !a.dead && (a === A || (anim && a.animator === anim) || (sk && a.skeleton === sk))));
      for (let grow = true; grow;) {
        grow = false;
        for (const a of G.actors) if (!set.has(a) && !a.dead && a.parent && set.has(a.parent)) { set.add(a); grow = true; }
      }
      const list = [...set].filter((a) => shown(a));
      const body = A.bodyType || ('z' + k);
      const rig = makeRig('zombie-' + body + '-' + k, 'zombie', list);
      const walk = (z.V && z.V.clip) || (body === 'heavy' ? 'zwalk_heavy' : body === 'female' ? 'zwalk_light' : 'zwalk');
      for (const [clip, src, loop] of CLIPS) {
        const name = src || walk;
        const def = anim.clips && (anim.clips.get ? anim.clips.get(name) : anim.clips[name]);
        const dur = (def && def.duration) || 1.0;
        anim.play(name, 0);
        const fps = 30, n = Math.max(2, Math.round(dur * fps) + (loop ? 0 : 1));
        for (let f = 0; f < n; f++) {
          if (f > 0) anim.update(1 / fps); else anim.update(0);
          const c = capture(rig, clip, () => inv(A.matrix.e));
          c.fps = fps; c.loop = loop;
        }
      }
      // Where the feet are: the lowest skinned vertex at the first walk frame, in root space.
      let lo = 1e9, hi = -1e9;
      rig.actors.forEach((a, i) => {
        if (!a.skeleton) return;
        const g = a.mesh.__geometry, Pp = g.positions, J = g.joints, Wt = g.weights;
        if (!J || !Wt) return;
        const pal = rig.clips.walk.pal[rig.parts[i].palette];
        const M0 = rig.clips.walk.model.slice(i * 16, i * 16 + 16);
        for (let v = 0; v < Pp.length / 3; v += 7) {
          let y = 0, wsum = 0;
          for (let j = 0; j < 4; j++) {
            const w = Wt[v * 4 + j]; if (w <= 0) continue;
            const b = J[v * 4 + j] * 16;
            const x0 = Pp[v * 3], y0 = Pp[v * 3 + 1], z0 = Pp[v * 3 + 2];
            const px = pal[b] * x0 + pal[b + 4] * y0 + pal[b + 8] * z0 + pal[b + 12];
            const py = pal[b + 1] * x0 + pal[b + 5] * y0 + pal[b + 9] * z0 + pal[b + 13];
            const pz = pal[b + 2] * x0 + pal[b + 6] * y0 + pal[b + 10] * z0 + pal[b + 14];
            y += w * (M0[1] * px + M0[5] * py + M0[9] * pz + M0[13]); wsum += w;
          }
          if (wsum > 0) { y /= wsum; lo = Math.min(lo, y); hi = Math.max(hi, y); }
        }
      });
      // The rigid parts too -- the head is its own actor on the neck bone, and it is the top of the body.
      rig.actors.forEach((a, i) => {
        if (a.skeleton || !a.mesh || !a.mesh.bounds) return;
        const bd = a.mesh.bounds, M0 = rig.clips.walk.model.slice(i * 16, i * 16 + 16);
        if (!isFinite(bd.min.x) || Math.hypot(M0[0], M0[1], M0[2]) < 0.05) return;   // the glints in the eyes
        for (const x of [bd.min.x, bd.max.x]) for (const y of [bd.min.y, bd.max.y]) for (const z of [bd.min.z, bd.max.z])
          hi = Math.max(hi, M0[1] * x + M0[5] * y + M0[9] * z + M0[13]);
      });
      rig.floor = lo; rig.height = hi - lo;
      rigs.push(finish(rig));
      console.log(`[kit] ${rig.name}: ${rig.parts.length} parts, ${rig.palettes.length} skeletons, walk '${walk}', floor ${lo.toFixed(3)}, height ${(hi - lo).toFixed(2)}`);
    });

    const blob = new Uint8Array(bytes);
    let o = 0;
    for (const c of chunks) { blob.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), o); o += c.byteLength; }
    const parts = [];
    for (let i = 0; i < blob.length; i += 3 * 65536) {
      let str = '';
      const sub = blob.subarray(i, Math.min(blob.length, i + 3 * 65536));
      for (let j = 0; j < sub.length; j += 8192) str += String.fromCharCode.apply(null, sub.subarray(j, j + 8192));
      parts.push(btoa(str));
    }
    return { json: { version: 1, kind: 'kit', meshes, materials, draws: [], rigs, weapons,
                     camera: { fov: G.camera.fov, near: G.camera.near } }, parts };
  }, VIEW_GUNS);
  await browser.close();

  const blob = Buffer.concat(res.parts.map((b) => Buffer.from(b, 'base64')));
  const json = Buffer.from(JSON.stringify(res.json), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const head = Buffer.alloc(12);
  head.write('LESC', 0, 'ascii');
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(json.length + pad, 8);
  fs.writeFileSync(out, Buffer.concat([head, json, Buffer.alloc(pad, 0x20), blob]));
  console.log(`kit: ${res.json.rigs.length} rigs, ${res.json.meshes.length} meshes, ${res.json.materials.length} materials -> ${out} (${(blob.length / 1048576).toFixed(1)} MB)`);
  if (errors.length) console.log('page errors:\n  ' + [...new Set(errors)].slice(0, 10).join('\n  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
