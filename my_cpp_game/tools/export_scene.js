#!/usr/bin/env node
/* Export a web game map into a scene file the native engine renders.
 *
 *   node my_cpp_game/tools/export_scene.js bunker-nine out.lescene [--frames 12]
 *
 * The web game builds its maps procedurally, in JavaScript, at load time.
 * Porting every builder by hand would be a second copy of the game to keep
 * in step with the first. Instead this loads the real game page headless,
 * lets it build the map exactly as a player's browser would, and writes
 * out what the renderer was about to draw: every mesh (deduplicated),
 * every material (as its recipe name and parameters -- the native engine
 * re-bakes the textures itself, at 4K), every transform and instance
 * list, the lights, the sky, the fog, the grade and the camera.
 *
 * The one change to the engine it needs -- keep a mesh's CPU arrays after
 * upload -- is applied to the bundle TEXT inside this tool, never to the
 * shipped web build.
 *
 * File format (little endian):
 *   "LESC" | u32 version=1 | u32 jsonBytes | json (padded to 4) | blob
 *   Arrays in the JSON are {off, count} into the blob (float32 or uint32).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const GAMES = {
  'bunker-nine': {
    scripts: ['site/games/bunker-nine.js'],
    start: `window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'ultra' }); window.__G = B.game;`,
  },
  // The second zombies map: the same game, the Coastline builder loaded
  // after it (the page's own script order) and picked by id.
  coastline: {
    scripts: ['site/games/bunker-nine.js', 'site/games/coastline.js'],
    start: `window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'ultra', map: 'coastline' }); window.__G = B.game;`,
  },
};

// The four multiplayer maps: built straight onto an engine by MP_MAPS, as
// engine/test/mpmaps.test.js does, and framed from team A's spawn looking
// up the map, the view a player gets at the start of a match.
for (const id of ['helipad', 'resort', 'town', 'demolition']) {
  GAMES[id] = {
    scripts: ['site/games/mp-data.js', 'site/games/mp-maps.js'],
    start: `window.__G = LE.create({ canvas: '#game', quality: 'ultra', gravity: -19.6 });
            window.__M = MP_MAPS.build(window.__G, '${id}');
            { const f = window.__M.spawns.a[2].at;
              window.__G.lookAt([f[0], f[1] + 1.6, f[2]], [f[0] * 0.3, 1.4, f[2] + 40]); }`,
  };
}

async function main() {
  const [, , name, out, ...rest] = process.argv;
  const game = GAMES[name];
  if (!game || !out) {
    console.error(`usage: export_scene.js <${Object.keys(GAMES).join('|')}> out.lescene [--frames N]`);
    process.exit(2);
  }
  const frames = rest.includes('--frames') ? parseInt(rest[rest.indexOf('--frames') + 1], 10) : 12;
  // --compare web.png: also save the web game's own frame from the same
  // camera, at 1280x720, for a side-by-side with the native render.
  const compare = rest.includes('--compare') ? rest[rest.indexOf('--compare') + 1] : null;

  let engine = fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8');
  const anchor = 'this.bounds = geometry.bounds || null;';
  if (!engine.includes(anchor)) throw new Error('GpuMesh anchor not found -- update export_scene.js');
  engine = engine.replace(anchor, anchor + ' this.__geometry = geometry;');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: compare ? { width: 1280, height: 720 } : { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: engine });
  for (const s of game.scripts) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, s), 'utf8') });
  await page.evaluate(game.start);
  await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__G.step(1 / 60); }, frames);
  if (compare) {
    // Read the frame straight back from GL after one renderFrom, as the
    // engine's own pixel tests do: a page screenshot waits for the page to
    // go idle, which a running game at ultra under SwiftShader never does.
    const shot = await page.evaluate(() => {
      const G = window.__G, c = G.camera, gl = G.gl;
      G.renderFrom([c.position.x, c.position.y, c.position.z], [c.target.x, c.target.y, c.target.z]);
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, buf = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let str = '';
      for (let j = 0; j < buf.length; j += 8192) str += String.fromCharCode.apply(null, buf.subarray(j, j + 8192));
      return { W, H, b64: btoa(str) };
    });
    const px = Buffer.from(shot.b64, 'base64');
    const rgb = Buffer.alloc(shot.W * shot.H * 3);
    for (let y = 0; y < shot.H; y++) for (let x = 0; x < shot.W; x++) {
      const s0 = ((shot.H - 1 - y) * shot.W + x) * 4, d = (y * shot.W + x) * 3;
      rgb[d] = px[s0]; rgb[d + 1] = px[s0 + 1]; rgb[d + 2] = px[s0 + 2];
    }
    fs.writeFileSync(compare, Buffer.concat([Buffer.from(`P6\n${shot.W} ${shot.H}\n255\n`), rgb]));
    console.log(`web frame ${shot.W}x${shot.H} -> ${compare} (PPM)`);
  }

  const res = await page.evaluate(() => {
    const G = window.__G, R = G.renderer;
    const v3 = (v) => [v.x, v.y, v.z];
    const chunks = [];
    let bytes = 0;
    const put = (typed) => {
      const off = bytes;
      const copy = typed instanceof Float32Array || typed instanceof Uint32Array ? typed.slice() : null;
      chunks.push(copy);
      bytes += copy.byteLength;
      return { off, count: copy.length };
    };
    const f32 = (a) => put(a instanceof Float32Array ? a : new Float32Array(a));
    const u32 = (a) => put(new Uint32Array(a));

    // Recover each shared texture set's seed from the engine's cache key.
    const seedOf = new Map();
    const cache = G.gl && G.gl.__legendTexCache;
    if (cache) for (const [k, v] of cache) seedOf.set(v, parseInt(k.split(':')[2], 10) || 1);

    const meshIds = new Map(), matIds = new Map();
    const meshes = [], materials = [], draws = [];
    let skipped = 0, noGeometry = 0;
    const meshId = (m) => {
      if (meshIds.has(m)) return meshIds.get(m);
      const g = m.__geometry;
      if (!g) return -1;
      const e = {
        // The engine's primitive cache key ('sphere', 'cylinder',
        // 'torus:14:28:0.240', ...) -- lets the native side rebuild the
        // primitive at desktop tessellation instead of the phone-budget one.
        key: m.__key || null,
        positions: f32(g.positions), normals: f32(g.normals), uvs: f32(g.uvs),
        tangents: g.tangents ? f32(g.tangents) : null,
        colors: g.colors ? f32(g.colors) : null,
        joints: g.joints ? f32(g.joints) : null,
        weights: g.weights ? f32(g.weights) : null,
        indices: u32(g.indices),
      };
      meshes.push(e);
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
        subsurface: m.subsurface || 0, clearcoat: m.clearcoat || 0,
        clearcoatRoughness: m.clearcoatRoughness != null ? m.clearcoatRoughness : 0.1,
        sheen: m.sheen || 0, sheenColor: m.sheenColor ? v3(m.sheenColor) : [1, 1, 1],
        sheenRoughness: m.sheenRoughness != null ? m.sheenRoughness : 0.3,
      });
      matIds.set(m, materials.length - 1);
      return materials.length - 1;
    };

    // Everything, not what the camera happens to see: probe mode culls by
    // distance, so a huge radius returns the whole map.
    const cam = G.camera;
    const batches = G._buildBatches({ x: cam.position.x, y: cam.position.y, z: cam.position.z, radius: 1e7 });
    // Skinned batches carry the bone texture, not the skeleton; find the
    // actor that owns it to read the palette (bones x 16 floats, the exact
    // array uploadTexture sends to the GPU).
    const skelByTex = new Map();
    for (const a of G.actors) if (a.skeleton && a.skeleton.texture) skelByTex.set(a.skeleton.texture, a.skeleton);
    /* STATIC ACTORS ARE WALKED DIRECTLY, not taken from the batches, so
       each draw can carry the NAME its builder gave the actor -- 'lake',
       'oak-crown', 'house-roof', 'house-window'. The batches group by mesh
       and material only, and that is exactly the information the native
       look-dev passes need to know what a box IS. Grouped by mesh +
       material + name; engine default names ('actor123') count as none.
       Same visibility rule as _buildBatches; the matrices were updated by
       the _buildBatches call above. Skinned and morph-target actors, and
       the grass, still come from the batches. */
    const groups = new Map();
    for (const a of G.actors) {
      if (!a.visible || !a.mesh || a.dead || a.skeleton || a.face) continue;
      const mi = meshId(a.mesh);
      if (mi < 0) { noGeometry++; continue; }
      const name = /^actor\d+$/.test(a.name || '') ? '' : (a.name || '');
      const mat = matId(a.material);
      const key = mi + '|' + mat + '|' + name;
      let g = groups.get(key);
      if (!g) { g = { mesh: mi, material: mat, name, data: [] }; groups.set(key, g); }
      const e = a.matrix.e;
      for (let i = 0; i < 16; i++) g.data.push(e[i]);
      g.data.push(a.tint.x, a.tint.y, a.tint.z, a.custom || 0);
    }
    for (const g of groups.values())
      draws.push({ mesh: g.mesh, material: g.material, name: g.name, grass: false, alphaClip: false,
                   instances: f32(new Float32Array(g.data)) });
    for (const b of batches) {
      if (!b.count || (b.instanced && !b.grass)) continue;   // statics done above
      const mi = meshId(b.mesh);
      if (mi < 0) { noGeometry++; continue; }
      const d = { mesh: mi, material: matId(b.material), name: b.grass ? 'grass' : '', grass: !!b.grass,
                  alphaClip: !!b.alphaClip };
      if (b.skinned) {
        const sk = skelByTex.get(b.boneTexture);
        const g = b.mesh.__geometry;
        if (!sk || !g.joints || !g.weights) { skipped++; continue; }
        d.bones = f32(sk.matrices.subarray(0, sk.bones.length * 16));
        d.boneCount = sk.bones.length;
      }
      if (b.instanced) d.instances = f32(b.instances.subarray(0, b.count * 20));
      else { d.model = Array.from(b.model.e); d.params = Array.from(b.params); }
      draws.push(d);
    }

    const s = R.sky, u = R.sun, f = R.fog, sh = R.shadows, p = R.post;
    const env = {
      sun: { direction: v3(u.direction), color: v3(u.color), intensity: u.intensity },
      sky: { zenith: v3(s.zenith), horizon: v3(s.horizon), ground: v3(s.ground), intensity: s.intensity,
             clouds: s.clouds, room: v3(s.room), occlusion: s.occlusion, bounce: s.bounce },
      fog: { color: v3(f.color), density: f.density, height: f.height, falloff: f.falloff, skyBlend: f.skyBlend },
      shadows: { distance: sh.distance, strength: sh.strength, split: sh.split, softness: sh.softness,
                 enabled: sh.enabled !== false },
      post: { exposure: p.exposure, toneMap: p.toneMap === 'aces' ? 0 : 1, bloom: p.bloom,
              bloomThreshold: p.bloomThreshold, vignette: p.vignette, chromatic: p.chromatic,
              saturation: p.saturation, contrast: p.contrast, grain: p.grain },
      lights: R.lights.map((l) => ({ position: v3(l.position), color: v3(l.color),
                                     intensity: l.intensity, radius: l.radius || 10 })),
      wind: R.wind ? { direction: v3(R.wind.direction), strength: R.wind.strength } : null,
      detailScale: R.detailScale, detailFade: R.detailFade,
      parallaxDepth: R.parallaxDepth, parallaxFade: R.parallaxFade,
    };
    const camera = { position: v3(cam.position), target: v3(cam.target), fov: cam.fov,
                     near: cam.near, far: cam.far };

    // Concatenate and base64 in slices small enough for String.fromCharCode.
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
    return {
      json: { version: 1, meshes, materials, draws, env, camera,
              stats: { batches: batches.length, skippedSkinned: skipped, noGeometry, actors: G.actors.length } },
      parts,
    };
  });
  await browser.close();

  const blob = Buffer.concat(res.parts.map((b) => Buffer.from(b, 'base64')));
  const json = Buffer.from(JSON.stringify(res.json), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const head = Buffer.alloc(12);
  head.write('LESC', 0, 'ascii');
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(json.length + pad, 8);
  fs.writeFileSync(out, Buffer.concat([head, json, Buffer.alloc(pad, 0x20), blob]));

  const st = res.json.stats;
  let verts = 0, tris = 0;
  for (const m of res.json.meshes) { verts += m.positions.count / 3; tris += m.indices.count / 3; }
  console.log(`${name}: ${res.json.draws.length} draws, ${res.json.meshes.length} meshes (${verts} verts, ${tris} tris),` +
    ` ${res.json.materials.length} materials, ${res.json.env.lights.length} lights, ${st.actors} actors;` +
    ` skipped ${st.skippedSkinned} skinned, ${st.noGeometry} without geometry -> ${out} (${(blob.length / 1048576).toFixed(1)} MB)`);
  if (errors.length) console.log('page errors:\n  ' + [...new Set(errors)].slice(0, 10).join('\n  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
