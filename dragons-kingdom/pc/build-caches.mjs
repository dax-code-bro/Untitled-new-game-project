#!/usr/bin/env node
// Re-create everything a render needs that is NOT in git (see pc/MANIFEST.md),
// or check that it is there.
//
//   node pc/build-caches.mjs --check             what is missing / out of date (changes nothing)
//   node pc/build-caches.mjs                     build what is missing or out of date
//   node pc/build-caches.mjs --only nature,props one family (node-modules, chromium, ffmpeg, assets,
//                                                nature, humans, architecture, props, sound, voice)
//   options: --python PATH  Blender's Python (bpy 4.2) - default pc/.venv-bpy (made by the setup
//                           scripts) or DK_BPY_PYTHON;  --jobs N  parallel human builds;
//            --humans id,id only these characters (e.g. --only humans --humans abby,remi --force);
//            --force        rebuild even if up to date;  --with-voice  also the Kokoro voice models
//            --from PATH    sound: install a package from a copied .tar or folder (pc/MANIFEST.md, "Sound")
// "sound" (the final voice takes and the episode mix, never in git) downloads what the cloud has
// published in episodes/s01e01/final/audio/delivery.json; nothing published yet is not an error.
//
// Idempotent and resumable: every finished piece is recorded in a stamp
// (<cache>/.dk-build.json) together with a hash of the code that made it, so
// a re-run skips what is done and rebuilds only what the code (after a git
// pull) changed. Human characters are recorded one by one. Logs go to
// pc/logs/caches-<date>.log; the console shows one line per step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readDelivery, packageState, installPackage, download, sha256File } from './sound-delivery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const WIN = process.platform === 'win32';
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(o, null, 1) + '\n'); fs.renameSync(t, f); };
const exists = (f) => fs.existsSync(f);
const fmt = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s) % 60).padStart(2, '0')}s` : `${s.toFixed(0)}s`);

let LOG = null;
const say = (s = '') => { console.log(s); if (LOG) fs.appendFileSync(LOG, s + '\n'); };
const logOnly = (s) => { if (LOG) fs.appendFileSync(LOG, s); };

// ------------------------------------------------------------- helpers ---
/** Hash of files (contents + names), for "was this cache made by the current code?" */
function hashFiles(files) {
  const h = crypto.createHash('sha1');
  for (const f of [...new Set(files)].sort()) { h.update(rel(f) + '\0'); h.update(exists(f) ? fs.readFileSync(f) : 'missing'); h.update('\0'); }
  return h.digest('hex').slice(0, 16);
}
/** A JS module and every relative module it imports (static and dynamic), recursively. */
function importGraph(entry, seen = new Set()) {
  if (seen.has(entry) || !exists(entry)) return seen;
  seen.add(entry);
  const src = fs.readFileSync(entry, 'utf8');
  for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) importGraph(path.resolve(path.dirname(entry), m[1]), seen);
  return seen;
}
const listDir = (d, re) => (exists(d) ? fs.readdirSync(d).filter((f) => re.test(f)).map((f) => path.join(d, f)) : []);

function run(cmd, args, { cwd = ROOT, env = {}, quiet = true, shell = false } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    logOnly(`\n$ ${cmd} ${args.join(' ')}\n`);
    let p;
    try {
      p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell, windowsHide: true, stdio: ['ignore', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'] });
    } catch (e) { resolve({ code: 1, error: e.message, s: 0, tail: '' }); return; }
    let tail = '';
    const keep = (d) => { const s = d.toString(); logOnly(s); tail = (tail + s).slice(-3000); };
    p.stdout?.on('data', keep); p.stderr?.on('data', keep);
    p.on('error', (e) => resolve({ code: 1, error: e.message, s: (Date.now() - t0) / 1000, tail }));
    p.on('close', (code) => resolve({ code, s: (Date.now() - t0) / 1000, tail }));
  });
}
const lastLines = (t, n = 6) => t.trim().split(/\r?\n/).slice(-n).map((l) => `      ${l}`).join('\n');

export function bpyPython(explicit) {
  // pc/.bpy-python: written by the setup scripts when the venv lives elsewhere (Windows: a short path)
  let recorded = null;
  try { recorded = fs.readFileSync(path.join(HERE, '.bpy-python'), 'utf8').trim() || null; } catch {}
  const c = [explicit, process.env.DK_BPY_PYTHON, recorded,
    path.join(HERE, '.venv-bpy', WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python')].filter(Boolean);
  return c.find((p) => exists(p)) || null;
}

// stamps: <dir>/.dk-build.json = { entries: { <key>: { hash, outputs: [rel...], at } } }
const stampFile = (dir) => path.join(dir, '.dk-build.json');
const readStamp = (dir) => readJson(stampFile(dir)) || { entries: {} };
function writeStampEntry(dir, key, hash, outputs) {
  const s = readStamp(dir);
  s.entries[key] = { hash, outputs: outputs.map(rel), at: new Date().toISOString(), host: os.hostname() };
  writeJson(stampFile(dir), s);
}
/** ok | missing outputs | made by older code. Caches made by hand (no stamp) count as ok if their files exist. */
function stampState(dir, key, hash, outputs) {
  const miss = outputs.filter((f) => !exists(f));
  if (miss.length) return { ok: false, problem: `missing ${miss.slice(0, 3).map(rel).join(', ')}${miss.length > 3 ? ` (+${miss.length - 3} more)` : ''}` };
  const e = readStamp(dir).entries[key];
  if (e && e.hash !== hash) return { ok: false, problem: 'made by older code (changed since: rebuild)' };
  return { ok: true, note: e ? null : 'present (no build stamp: made by hand)' };
}

// ------------------------------------------------------------ families ---
// Each: { name, what, check() -> { ok, problem?, note? }, build(ctx) -> { ok, problem? } }
const NATURE = path.join(ROOT, 'scenes', 'lib', 'nature');
const HUMANS = path.join(ROOT, 'scenes', 'lib', 'humans');
const ARCH = path.join(ROOT, 'scenes', 'lib', 'architecture');
const PROPS = path.join(ROOT, 'scenes', 'lib', 'props');
const KOKORO_DIR = path.join(ROOT, 'episodes', 's01e01', 'preview', '.cache', 'kokoro');

/** Nature bakes: the commands in scenes/lib/nature/README.md (in its order), else these. */
function natureRecipes() {
  const fallback = [
    { script: 'bake-verdor-land.mjs', args: ['--drops', '800000', '--sp', '60', '--K', '0.004'], outputs: ['cache/verdor/land.dkhm'] },
    { script: 'bake-verdor-cliffs.mjs', args: [], outputs: ['cache/verdor/cliffs.json'] },
    { script: 'bake-island.mjs', args: ['--drops', '900000', '--sp', '70', '--K', '0.02'], outputs: ['cache/island/island.dkhm'] },
    { script: 'bake-cling.mjs', args: [], outputs: ['cache/cling/cling.dkhm'] },
  ];
  // the README's code block is the source of truth for order and arguments (outputs: known per script)
  const readme = exists(path.join(NATURE, 'README.md')) ? fs.readFileSync(path.join(NATURE, 'README.md'), 'utf8') : '';
  const fromReadme = [...readme.matchAll(/^node scenes\/lib\/nature\/offline\/([\w.-]+\.mjs)([^#\n]*)/gm)].map((m) => ({
    script: m[1], args: m[2].trim().split(/\s+/).filter(Boolean),
    outputs: fallback.find((f) => f.script === m[1])?.outputs || [],
  }));
  const list = fromReadme.length ? fromReadme : fallback;
  for (const r of list) {
    r.entry = path.join(NATURE, 'offline', r.script);
    r.outputs = r.outputs.map((o) => path.join(NATURE, o));
    // the cliff tiles use however many cores this PC has (the README's --workers is for the cloud machine)
    if (r.script === 'bake-verdor-cliffs.mjs') {
      const i = r.args.indexOf('--workers');
      if (i >= 0) r.args.splice(i, 2);
      r.args.push('--workers', String(Math.max(1, Math.min(8, (os.availableParallelism?.() ?? os.cpus().length) - 1))));
    }
  }
  return list;
}
const natureHash = (r, all) => {
  // a recipe depends on its own code and on every earlier bake it reads (the cliffs read the land)
  const idx = all.indexOf(r);
  const files = [];
  for (const x of all.slice(0, idx + 1)) if (x === r || r.script.startsWith('bake-verdor-cliffs') && x.script.startsWith('bake-verdor-land')) files.push(...importGraph(x.entry));
  return hashFiles(files) + ':' + r.args.filter((a, i, A) => A[i - 1] !== '--workers' && a !== '--workers').join(' ');
};

/** bpy bake scripts of a library: every offline/*.py there is one standalone bake. */
const KNOWN_BPY_OUTPUTS = {
  'nest_cloth.py': ['nest_cloth.json'], 'table_cloth.py': ['table_cloth.json'],
  'sail.py': ['sail_prologue_full.json', 'sail_prologue_eased.json'],
  'drapes.py': ['awning_24.json', 'awning_3.json', 'banner_breeze.json', 'banner_gust.json', 'banner_still.json', 'counter.json',
    'pennant_0.json', 'pennant_1.json', 'pennant_2.json', 'pennant_3.json', 'pennant_4.json', 'pennant_5.json'],
};
function bpyRecipes(lib) {
  const cache = path.join(lib, 'cache');
  const stamp = readStamp(cache);
  return listDir(path.join(lib, 'offline'), /\.py$/).map((f) => {
    const name = path.basename(f);
    const recorded = stamp.entries[name]?.outputs?.map((o) => path.join(ROOT, o));
    const outputs = recorded?.length ? recorded : (KNOWN_BPY_OUTPUTS[name] || []).map((o) => path.join(cache, o));
    return { name, script: f, cache, outputs, hash: hashFiles([f]) };
  });
}

function bpyFamily(name, lib, what) {
  return {
    name, what,
    check() {
      const rs = bpyRecipes(lib);
      if (!rs.length) return { ok: true, note: 'no bakes' };
      const probs = rs.map((r) => ({ r, s: stampState(r.cache, r.name, r.hash, r.outputs.length ? r.outputs : [path.join(r.cache, '__never__')]) })).filter((x) => !x.s.ok);
      return probs.length ? { ok: false, problem: probs.map((x) => `${x.r.name}: ${x.s.problem}`).join('; ') } : { ok: true };
    },
    async build(ctx) {
      const py = ctx.python;
      if (!py) return { ok: false, problem: 'Blender Python (bpy 4.2) not found - run the setup script, or pass --python' };
      for (const r of bpyRecipes(lib)) {
        if (!ctx.force && stampState(r.cache, r.name, r.hash, r.outputs.length ? r.outputs : [path.join(r.cache, '__never__')]).ok) { say(`    ${r.name}: up to date`); continue; }
        fs.mkdirSync(r.cache, { recursive: true });
        const before = new Map(listDir(r.cache, /\.(json|bin)$/).map((f) => [f, fs.statSync(f).mtimeMs]));
        say(`    ${r.name}: baking...`);
        const res = await run(py, ['-I', r.script]);
        if (res.code !== 0) return { ok: false, problem: `${r.name} failed (exit ${res.code})\n${lastLines(res.tail)}` };
        const made = listDir(r.cache, /\.(json|bin)$/).filter((f) => !before.has(f) || fs.statSync(f).mtimeMs !== before.get(f));
        const outputs = made.length ? made : r.outputs;
        writeStampEntry(r.cache, r.name, r.hash, outputs);
        say(`    ${r.name}: done in ${fmt(res.s)} (${outputs.length} file(s))`);
      }
      return { ok: true };
    },
  };
}

function humanSources() { return listDir(path.join(HUMANS, 'offline'), /\.py$/); }
async function humanIds(py) {
  const r = spawnSync(py, ['-I', path.join(HUMANS, 'offline', 'build.py'), '--list'], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20 });
  if (r.status !== 0) throw new Error(`build.py --list failed: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout.split(/\r?\n/).map((l) => l.split(' - ')[0].trim()).filter((x) => /^[\w-]+$/.test(x));
}

export const FAMILIES = [
  {
    name: 'node-modules', what: 'npm packages (three.js, Playwright)',
    check() {
      const pj = readJson(path.join(ROOT, 'package.json'));
      const want = { ...(pj.dependencies || {}), ...(pj.optionalDependencies || {}) };
      const bad = Object.entries(want).filter(([n, v]) => readJson(path.join(ROOT, 'node_modules', n, 'package.json'))?.version !== v);
      return bad.length ? { ok: false, problem: `not installed: ${bad.map(([n, v]) => `${n}@${v}`).join(', ')}` } : { ok: true };
    },
    async build() {
      const r = await run(WIN ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], { shell: WIN });
      return r.code === 0 ? { ok: true } : { ok: false, problem: `npm ci failed\n${lastLines(r.tail)}` };
    },
  },
  {
    name: 'chromium', what: 'Playwright Chromium (headless browser that draws the frames)',
    async check() {
      try {
        const { chromeExecutable } = await import(pathToFileURL(path.join(ROOT, 'render', 'lib', 'tools.mjs')).href);
        await chromeExecutable();
        return { ok: true };
      } catch (e) { return { ok: false, problem: e.message.split('\n')[0] }; }
    },
    async build() {
      const r = await run(WIN ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { shell: WIN });
      return r.code === 0 ? { ok: true } : { ok: false, problem: `npx playwright install chromium failed\n${lastLines(r.tail)}` };
    },
  },
  {
    name: 'ffmpeg', what: 'ffmpeg + ffprobe with libx264 (installed by the setup script)',
    async check() {
      try {
        const { checkFfmpeg } = await import(pathToFileURL(path.join(ROOT, 'render', 'lib', 'tools.mjs')).href);
        checkFfmpeg();
        return { ok: true };
      } catch (e) { return { ok: false, problem: e.message }; }
    },
    async build() { return { ok: false, problem: 'install ffmpeg with the setup script (pc/setup-windows.ps1 / pc/setup.sh)' }; },
  },
  {
    name: 'assets', what: 'asset library: HDRIs, photo materials, scanned models, MakeHuman data (assets-lib/fetch.mjs)',
    check() {
      const m = readJson(path.join(ROOT, 'assets-lib', 'manifest.json'));
      if (!m) return { ok: false, problem: 'assets-lib/manifest.json missing' };
      const need = m.assets.filter((a) => a.status === 'available');
      const miss = need.filter((a) => (a.files || []).some((f) => { try { return f.bytes != null && fs.statSync(path.join(ROOT, 'assets-lib', f.path)).size !== f.bytes; } catch { return true; } }));
      const extra = m.assets.filter((a) => a.status !== 'available' && !exists(path.join(ROOT, 'assets-lib', a.id, 'asset.json')));
      const note = extra.length ? `${extra.length} optional Poly Haven / ambientCG asset(s) not downloaded (no scene uses them yet)` : null;
      return miss.length ? { ok: false, problem: `${miss.length} of ${need.length} assets missing or incomplete (e.g. ${miss.slice(0, 3).map((a) => a.id).join(', ')})`, note } : { ok: true, note };
    },
    async build() {
      // the whole manifest: on a home connection the Poly Haven / ambientCG hosts that the
      // cloud machine could not reach download too (they are optional: a failure there is reported, not fatal)
      const r = await run(process.execPath, [path.join(ROOT, 'assets-lib', 'fetch.mjs'), '--jobs', '6']);
      const sum = r.tail.split('\n').filter((l) => /\bok\b.*blocked|failed|BLOCKED|MISSING|FAIL /.test(l)).slice(-4).join('\n      ');
      if (sum) say(`      ${sum}`);
      return r.code === 0 ? { ok: true } : { ok: false, problem: `assets-lib/fetch.mjs reported missing assets (run it again: it resumes)\n${lastLines(r.tail)}` };
    },
  },
  {
    name: 'nature', what: 'landscape bakes: Verdor coast + cliffs, prologue island, land around Cling (Node)',
    check() {
      const rs = natureRecipes();
      const probs = rs.map((r) => ({ r, s: stampState(path.join(NATURE, 'cache'), r.script, natureHash(r, rs), r.outputs) })).filter((x) => !x.s.ok);
      return probs.length ? { ok: false, problem: probs.map((x) => `${x.r.script}: ${x.s.problem}`).join('; ') } : { ok: true };
    },
    async build(ctx) {
      const rs = natureRecipes();
      for (const r of rs) {
        const h = natureHash(r, rs);
        if (!ctx.force && stampState(path.join(NATURE, 'cache'), r.script, h, r.outputs).ok && readStamp(path.join(NATURE, 'cache')).entries[r.script]) { say(`    ${r.script}: up to date`); continue; }
        say(`    ${r.script} ${r.args.join(' ')}: baking...`);
        const res = await run(process.execPath, [r.entry, ...r.args]);
        if (res.code !== 0) return { ok: false, problem: `${r.script} failed (exit ${res.code})\n${lastLines(res.tail)}` };
        writeStampEntry(path.join(NATURE, 'cache'), r.script, h, r.outputs);
        say(`    ${r.script}: done in ${fmt(res.s)}`);
      }
      return { ok: true };
    },
  },
  {
    name: 'humans', what: 'human characters (Blender cloth + MakeHuman, scenes/lib/humans/offline/build.py)',
    needsPython: true,
    async check(ctx) {
      const cache = path.join(HUMANS, 'cache');
      const hash = hashFiles(humanSources());
      const st = readStamp(cache);
      let ids = st.ids;
      if (!ids && ctx?.python) { try { ids = await humanIds(ctx.python); } catch {} }
      if (!ids) {
        const have = listDir(cache, /\.json$/).filter((f) => !f.endsWith('.dk-build.json'));
        return have.length ? { ok: true, note: `${have.length} characters present (no build stamp: made by hand)` } : { ok: false, problem: 'no characters built yet' };
      }
      const bad = ids.filter((id) => !exists(path.join(cache, `${id}.json`)) || !exists(path.join(cache, `${id}.bin`)) || (st.entries[id] && st.entries[id].hash !== hash));
      return bad.length ? { ok: false, problem: `${bad.length} of ${ids.length} characters missing or made by older code (e.g. ${bad.slice(0, 4).join(', ')})` } : { ok: true };
    },
    async build(ctx) {
      const py = ctx.python;
      if (!py) return { ok: false, problem: 'Blender Python (bpy 4.2) not found - run the setup script, or pass --python' };
      const cache = path.join(HUMANS, 'cache');
      fs.mkdirSync(cache, { recursive: true });
      const hash = hashFiles(humanSources());
      let ids;
      try { ids = await humanIds(py); } catch (e) { return { ok: false, problem: e.message }; }
      const st = readStamp(cache); st.ids = ids; writeJson(stampFile(cache), st);
      if (ctx.humans) {
        const unknown = ctx.humans.filter((id) => !ids.includes(id));
        if (unknown.length) return { ok: false, problem: `--humans: unknown id(s) ${unknown.join(', ')} (build.py --list shows them)` };
      }
      const todo = ids.filter((id) => !ctx.humans || ctx.humans.includes(id)).filter((id) => ctx.force || !exists(path.join(cache, `${id}.json`)) || !exists(path.join(cache, `${id}.bin`)) || (st.entries[id] ? st.entries[id].hash !== hash : !ctx.trustUnstamped));
      if (!todo.length) { say(`    all ${ids.length} characters up to date`); return { ok: true }; }
      const cores = os.availableParallelism?.() ?? os.cpus().length;
      const jobs = ctx.jobs || Math.max(1, Math.min(6, Math.floor(cores / 4), Math.floor(os.totalmem() / 2 ** 30 / 4)));
      say(`    ${todo.length} of ${ids.length} characters to build, ${jobs} at a time (close-up characters take 5-15 min each)`);
      const queue = [...todo];
      const failed = [];
      let n = 0;
      const t0 = Date.now();
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          const res = await run(py, ['-I', path.join(HUMANS, 'offline', 'build.py'), '--only', id]);
          n++;
          if (res.code === 0 && exists(path.join(cache, `${id}.json`))) {
            writeStampEntry(cache, id, hash, [path.join(cache, `${id}.json`), path.join(cache, `${id}.bin`)]);
            say(`    [${n}/${todo.length}] ${id}: done in ${fmt(res.s)}  (elapsed ${fmt((Date.now() - t0) / 1000)})`);
          } else { failed.push(id); say(`    [${n}/${todo.length}] ${id}: FAILED (exit ${res.code}) - see the log\n${lastLines(res.tail, 4)}`); }
        }
      };
      await Promise.all(Array.from({ length: jobs }, worker));
      return failed.length ? { ok: false, problem: `${failed.length} character(s) failed: ${failed.join(', ')} (run again to retry just these)` } : { ok: true };
    },
  },
  bpyFamily('architecture', ARCH, 'architecture cloth bakes (nest linen, table cloth; Blender)'),
  bpyFamily('props', PROPS, 'prop cloth bakes (sails, awnings, banners, pennants; Blender)'),
  {
    // sound files that are never in git (SERIES.md section 2): pc/sound-delivery.mjs, pc/pack-sound.mjs
    name: 'sound', what: 'sound not in git: final voice takes + episode mix (episodes/s01e01/final/audio/delivery.json)',
    optional: true, defaultRun: true,    // a render does not wait for it: scene files get their sound later
    check() {
      const d = readDelivery();
      if (!d) return { ok: true, note: 'no delivery list (episodes/s01e01/final/audio/delivery.json)' };
      const notes = [];
      const probs = [];
      for (const p of d.packages) {
        let st;
        try { st = packageState(p); } catch (e) { probs.push(`${p.id}: ${e.message}`); continue; }
        if (st.ok) notes.push(`${p.id} ok (${st.total} files)`);
        else if (!st.total) notes.push(`${p.id}: not made yet`);
        else if (p.archive?.url) probs.push(`${p.id}: ${st.total - st.have} of ${st.total} file(s) to download (${(p.archive.bytes / 2 ** 20).toFixed(0)} MB)`);
        else notes.push(`${p.id}: not on this computer (${p.archive ? 'packed, not published: install it with --from' : 'not published yet'})`);
      }
      return probs.length ? { ok: false, problem: probs.join('; '), note: notes.join('; ') || null } : { ok: true, note: notes.join('; ') };
    },
    async build(ctx) {
      const d = readDelivery();
      if (!d) return { ok: false, problem: 'episodes/s01e01/final/audio/delivery.json is missing' };
      if (ctx.from) {
        const src = path.resolve(ctx.from);
        if (!exists(src)) return { ok: false, problem: `--from ${src}: not found` };
        let pkgs = d.packages;
        if (fs.statSync(src).isFile()) {
          const sum = sha256File(src);
          const m = d.packages.find((p) => p.archive?.sha256 === sum);
          if (m) { pkgs = [m]; say(`    ${path.basename(src)}: the published archive of "${m.id}" (sha256 ok)`); }
        }
        let n = 0;
        const bad = [];
        for (const p of pkgs) {
          if (!packageState(p, { hash: false }).total) continue;
          const r = installPackage(p, src, say);
          if (r.written) say(`    ${p.id}: ${r.written} file(s) checked and put in ${p.dir}`);
          n += r.written;
          bad.push(...r.bad.map((b) => `${p.id}: ${b}`));
        }
        if (bad.length) return { ok: false, problem: `${bad.length} file(s) did not match their sha256 and were NOT put in place (e.g. ${bad.slice(0, 3).join(', ')})` };
        if (!n) return { ok: false, problem: `--from ${src}: none of the listed sound files are in it` };
        return { ok: true };
      }
      for (const p of d.packages) {
        const st = packageState(p);
        if (st.ok || !st.total || !p.archive?.url) continue;
        const tar = path.join(HERE, 'downloads', p.archive.file);
        const have = exists(tar) && fs.statSync(tar).size === p.archive.bytes && sha256File(tar) === p.archive.sha256;
        if (!have) {
          say(`    ${p.id}: downloading ${p.archive.url} (${(p.archive.bytes / 2 ** 20).toFixed(0)} MB)`);
          try { await download(p.archive.url, tar, { sha256: p.archive.sha256, bytes: p.archive.bytes, say }); } catch (e) { return { ok: false, problem: `${p.id}: ${e.message}` }; }
        }
        const r = installPackage(p, tar, say);
        if (r.bad.length) return { ok: false, problem: `${p.id}: ${r.bad.length} file(s) in the archive do not match delivery.json (not put in place)` };
        const st2 = packageState(p);
        if (!st2.ok) return { ok: false, problem: `${p.id}: ${st2.total - st2.have} file(s) still missing after unpacking - the published archive does not match delivery.json` };
        say(`    ${p.id}: ${r.written} file(s) checked and put in ${p.dir}`);
        fs.rmSync(tar, { force: true });
      }
      return { ok: true };
    },
  },
  {
    name: 'voice', what: 'Kokoro-82M voice model files (only for making voice takes; optional)', optional: true,
    files: {
      'kokoro-v1.0.int8.onnx': '6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb',
      'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
    },
    check() {
      const miss = Object.keys(this.files).filter((f) => !exists(path.join(KOKORO_DIR, f)));
      return miss.length ? { ok: false, problem: `missing ${miss.join(', ')} in ${rel(KOKORO_DIR)}` } : { ok: true };
    },
    async build() {
      fs.mkdirSync(KOKORO_DIR, { recursive: true });
      for (const [f, want] of Object.entries(this.files)) {
        const dest = path.join(KOKORO_DIR, f);
        if (exists(dest) && sha1(fs.readFileSync(dest)) && crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex') === want) { say(`    ${f}: ok`); continue; }
        const url = `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/${f}`;
        say(`    ${f}: downloading ${url}`);
        const res = await fetch(url);
        if (!res.ok) return { ok: false, problem: `${url}: HTTP ${res.status}` };
        const buf = Buffer.from(await res.arrayBuffer());
        const got = crypto.createHash('sha256').update(buf).digest('hex');
        if (got !== want) return { ok: false, problem: `${f}: sha256 ${got.slice(0, 12)}... does not match ${want.slice(0, 12)}...` };
        fs.writeFileSync(dest, buf);
      }
      return { ok: true };
    },
  },
];

/** Used by render/episode.mjs before rendering: [{ name, ok, problem, note }] for the families a render needs. */
export async function checkCaches({ python } = {}) {
  const out = [];
  for (const f of FAMILIES.filter((x) => !x.optional)) {
    let r;
    try { r = await f.check({ python: python ?? bpyPython() }); } catch (e) { r = { ok: false, problem: e.message }; }
    out.push({ name: f.name, ...r });
  }
  return out;
}

// ---------------------------------------------------------------- main ---
async function main() {
  const argv = process.argv.slice(2);
  const opt = { check: false, only: null, force: false, voice: false, python: null, jobs: null, trustUnstamped: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opt.check = true;
    else if (a === '--force') opt.force = true;
    else if (a === '--with-voice') opt.voice = true;
    else if (a === '--only') opt.only = new Set(argv[++i].split(','));
    else if (a === '--python') opt.python = argv[++i];
    else if (a === '--humans') opt.humans = argv[++i].split(',').map((x) => x.trim()).filter(Boolean);
    else if (a === '--jobs') opt.jobs = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === '--rebuild-unstamped') opt.trustUnstamped = false;
    else if (a === '--from') opt.from = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 21).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
    else throw new Error(`unknown option ${a}`);
  }
  if (opt.only) for (const n of opt.only) if (!FAMILIES.some((f) => f.name === n)) throw new Error(`--only ${n}: choose from ${FAMILIES.map((f) => f.name).join(', ')}`);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  fs.mkdirSync(path.join(HERE, 'logs'), { recursive: true });
  if (!opt.check) LOG = path.join(HERE, 'logs', `caches-${stamp}.log`);   // --check only prints
  const python = bpyPython(opt.python);
  const ctx = { ...opt, python };
  say(`Dragon's Kingdom caches - ${opt.check ? 'check' : 'build'} (${new Date().toString()})`);
  say(`  project ${ROOT}`);
  say(`  Blender Python: ${python || 'not found (needed for humans, architecture, props)'}`);
  if (opt.from && !(opt.only && opt.only.size === 1 && opt.only.has('sound'))) throw new Error('--from is for the sound: use  --only sound --from <file.tar or folder>');
  const fams = FAMILIES.filter((f) => (opt.only ? opt.only.has(f.name) : !f.optional || f.defaultRun || (f.name === 'voice' && opt.voice)));
  let bad = 0;
  for (const f of fams) {
    let c;
    try { c = await f.check(ctx); } catch (e) { c = { ok: false, problem: e.message }; }
    if (opt.check) {
      say(`  ${c.ok ? 'ok     ' : 'MISSING'} ${f.name.padEnd(13)} ${c.ok ? (c.note || f.what) : c.problem}${!c.ok && c.note ? ` (${c.note})` : ''}`);
      if (!c.ok) bad++;
      continue;
    }
    if (c.ok && !opt.force && !(opt.from && f.name === 'sound')) { say(`  ok      ${f.name.padEnd(13)} ${c.note || 'up to date'}`); continue; }
    say(`  build   ${f.name.padEnd(13)} ${f.what}${c.problem ? ` - ${c.problem}` : ''}`);
    const t0 = Date.now();
    let r;
    try { r = await f.build.call(f, ctx); } catch (e) { r = { ok: false, problem: e.message }; }
    if (r.ok) {
      const c2 = await f.check(ctx);
      say(`  ${c2.ok ? 'ok     ' : 'CHECK  '} ${f.name.padEnd(13)} ${c2.ok ? `built in ${fmt((Date.now() - t0) / 1000)}` : `built, but the check still says: ${c2.problem}`}`);
      if (!c2.ok) bad++;
    } else { bad++; say(`  FAILED  ${f.name.padEnd(13)} ${r.problem}`); }
  }
  say(bad ? `\n${bad} item(s) not ready${LOG ? ` - details in ${rel(LOG)}` : ''}. ${opt.check ? 'Build them with: node pc/build-caches.mjs' : 'Run this again to retry (finished parts are kept).'}` : '\nall caches ready.');
  if (LOG) say(`log: ${rel(LOG)}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
