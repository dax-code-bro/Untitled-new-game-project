// The render gate: which shots the render PC may render into the episode masters.
//
// Every track pushes work-in-progress to the branch the render PC pulls. A shot's scene file
// existing therefore does NOT mean the shot is ready for a final 4K master. A shot is rendered
// only when it is listed in render-ready.json (next to render-jobs.json) with a LOCK that matches
// the files on disk:
//
//   lock.scene  sha256 of the scene file the shot renders from
//   lock.shot   sha256 of the shot's own entry (its .shots.json entry or its render-jobs.json command,
//               plus its frame count)
//   lock.lib    sha256 of every code file the scene loads: the static import closure of the scene file
//               and of the renderer page (runtime/), plus the data files the code names with
//               new URL('./literal', import.meta.url) (git-ignored caches are excluded: they are covered
//               by pc/build-caches.mjs stamps) and render/lib/presets.mjs (the quality settings)
//   lock.text   (credits card) sha256 of the credits text
//
// Text files are hashed with CRLF turned into LF, so a Windows checkout gives the same lock.
// A finished shot remembers the lockId it was rendered with (DONE.json). When the approval's lockId
// changes (the director re-approved new files), the shot is rendered again and its scene re-joined.
// When the files on disk drift from an approved lock (WIP pushed after the approval), shots that are
// not rendered yet WAIT (they would not show what was approved); finished shots stay valid.
//
// render/gate.mjs is the tool that writes the approvals (`approve`, `revoke`, `status`, `check`).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROJECT_ROOT } from './tools.mjs';

export const GATE_NAME = 'render-ready.json';
export const GATE_FORMAT = 1;

const rel = (f) => path.relative(PROJECT_ROOT, f).split(path.sep).join('/');
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.html', '.css', '.glsl', '.txt', '.md', '.cube', '.csv', '.svg']);

const _hash = new Map();
/** sha256 of a file (text files with CRLF -> LF), cached by size + mtime. 'missing' if it does not exist. */
export function fileHash(file) {
  let st;
  try { st = fs.statSync(file); } catch { return 'missing'; }
  if (!st.isFile()) return 'missing';
  const k = `${st.size}:${st.mtimeMs}`;
  const c = _hash.get(file);
  if (c?.k === k) return c.h;
  let buf = fs.readFileSync(file);
  if (TEXT_EXT.has(path.extname(file).toLowerCase())) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  _hash.set(file, { k, h });
  return h;
}

/** JSON with sorted keys (stable across writers). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------ import closure ---
const THREE_ROOT = path.join(PROJECT_ROOT, 'node_modules', 'three');
const RUNTIME_ROOT = path.join(PROJECT_ROOT, 'runtime');
const IMPORT_MAP = [
  ['three/addons/', path.join(THREE_ROOT, 'examples', 'jsm') + path.sep],
  ['three/examples/jsm/', path.join(THREE_ROOT, 'examples', 'jsm') + path.sep],
  ['dk/', path.join(RUNTIME_ROOT, 'lib') + path.sep],
];
const STATIC_RE = /(?:^|[\s;})])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?(['"])([^'"\n]+)\1/g;
const DYNAMIC_RE = /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const URL_RE = /new URL\(\s*(['"])(\.{1,2}\/[^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g;

function resolveSpec(spec, from) {
  if (spec === 'three') return path.join(THREE_ROOT, 'build', 'three.module.js');
  for (const [pre, dir] of IMPORT_MAP) if (spec.startsWith(pre)) return dir + spec.slice(pre.length);
  if (spec.startsWith('/runtime/')) return path.join(RUNTIME_ROOT, spec.slice('/runtime/'.length));
  if (spec.startsWith('/three/')) return path.join(THREE_ROOT, spec.slice('/three/'.length));
  if (spec.startsWith('./') || spec.startsWith('../')) return path.resolve(path.dirname(from), spec);
  return null;   // URLs, node: builtins (not loaded by the page)
}

/** Strip // and block comments roughly (enough that commented-out imports are not followed). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const isIgnoredData = (f) => /[\\/](cache|\.cache|output|node_modules[\\/](?!three))[\\/]/.test(f) || /\.shots\.json$/.test(f);

/**
 * Every file the scene's code loads, from its entry files: { files: {rel: sha256}, unresolved: [...] }.
 * Data named with new URL('./x', import.meta.url) is included when it is a file outside git-ignored
 * cache folders (a set's own .shots.json is locked per shot instead, see lock.shot).
 */
export function importClosure(entries) {
  const seen = new Map();
  const unresolved = new Set();
  const todo = [...entries];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    const h = fileHash(f);
    if (h === 'missing') { unresolved.add(rel(f)); continue; }
    seen.set(f, h);
    if (!/\.m?js$/.test(f)) continue;
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    for (const re of [STATIC_RE, DYNAMIC_RE]) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(src));) {
        const r = resolveSpec(m[2], f);
        if (r) todo.push(r);
      }
    }
    URL_RE.lastIndex = 0;
    for (let m; (m = URL_RE.exec(src));) {
      if (/\$\{/.test(m[2]) || m[2].endsWith('/')) continue;
      const r = path.resolve(path.dirname(f), m[2]);
      if (isIgnoredData(r)) continue;
      try { if (fs.statSync(r).isFile()) todo.push(r); } catch {}
    }
  }
  const files = Object.fromEntries([...seen].map(([f, h]) => [rel(f), h]).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { files, unresolved: [...unresolved].sort() };
}

const RENDERER_ENTRIES = [path.join(RUNTIME_ROOT, 'page.html'), path.join(RUNTIME_ROOT, 'dk-runtime.js'), path.join(PROJECT_ROOT, 'render', 'lib', 'presets.mjs')];

const _closure = new Map();
function libOf(sceneFile) {
  if (!_closure.has(sceneFile)) {
    const c = importClosure([sceneFile, ...RENDERER_ENTRIES]);
    _closure.set(sceneFile, { ...c, hash: sha256(canonical(c.files)) });
  }
  return _closure.get(sceneFile);
}

/**
 * The lock of a resolved shot (resolveShot() of render/episode.mjs: { kind, scene, via, entry, command, textFile }).
 * Returns { lock, lockId, libFiles } or null for black cards (nothing to approve).
 */
export function computeLock(job, r) {
  if (r.kind === 'black') return null;
  if (r.kind === 'text') {
    const lock = { text: fileHash(r.textFile) };
    return { lock, lockId: sha256(canonical(lock)).slice(0, 16), libFiles: null };
  }
  const lib = libOf(r.scene);
  const lock = {
    scene: fileHash(r.scene),
    shot: sha256(canonical({ frames: job.frames, startS: r.startS ?? 0, entry: r.entry ?? null, command: r.entry ? null : (r.command ?? null) })),
    lib: lib.hash,
  };
  return { lock, lockId: sha256(canonical(lock)).slice(0, 16), libFiles: lib.files, unresolved: lib.unresolved };
}

// --------------------------------------------------------------- the file ---
export const gatePath = (planDir) => path.join(planDir, GATE_NAME);

export function readGate(planDir) {
  const file = gatePath(planDir);
  let j = null;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return { file, exists: false, approved: {}, libs: {} };
    return { file, exists: true, error: `${rel(file)} is not valid JSON (${e.message.split('\n')[0]})`, approved: {}, libs: {} };
  }
  if (j?.format !== GATE_FORMAT) return { file, exists: true, error: `${rel(file)}: format ${j?.format} (this renderer reads format ${GATE_FORMAT})`, approved: {}, libs: {} };
  return { file, exists: true, approved: j.approved || {}, libs: j.libs || {}, raw: j };
}

export function writeGate(planDir, g) {
  const file = gatePath(planDir);
  // keep only the lib tables some approval still points to
  const used = new Set(Object.values(g.approved).map((a) => a.lock?.lib).filter(Boolean));
  const libs = Object.fromEntries(Object.entries(g.libs || {}).filter(([h]) => used.has(h)).sort(([a], [b]) => (a < b ? -1 : 1)));
  const approved = Object.fromEntries(Object.entries(g.approved).sort(([a], [b]) => (a < b ? -1 : 1)));
  const out = { about: g.raw?.about ?? ABOUT, ...(g.raw || {}), format: GATE_FORMAT, approved, libs };
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 1) + '\n');
  fs.renameSync(tmp, file);
  return file;
}

export const ABOUT = [
  'Render gate: only the shots listed here are rendered into the Episode 1 masters (render/episode.mjs).',
  'A shot is listed by the director after reviewing its frames: node render/gate.mjs approve <shot ids> --by "<who>" [--note "<what was reviewed>"].',
  'The lock pins the scene file, the shot entry and every code file the scene loads (sha256); if any of them changes, the shot waits until it is approved again.',
  'Approving again with new files makes the render PC render that shot again and re-join its scene. See render/lib/gate.mjs.',
];

/**
 * The gate's verdict for one resolved shot:
 *  { gated: false }                                        black card
 *  { approved: false, reason }                             not listed (or no gate file)
 *  { approved: true, current: true, lockId }               listed and the files match: may render
 *  { approved: true, current: false, lockId, changed: [...] }  listed, but the files changed since approval
 */
export function gateVerdict(gate, job, r) {
  const c = computeLock(job, r);
  if (!c) return { gated: false };
  if (gate.error) return { gated: true, approved: false, reason: gate.error, now: c };
  if (!gate.exists) return { gated: true, approved: false, reason: `not approved for the masters yet (${GATE_NAME} does not exist)`, now: c };
  const a = gate.approved[job.job];
  if (!a) return { gated: true, approved: false, reason: `not approved for the masters yet (not in ${GATE_NAME})`, now: c };
  if (a.lockId === c.lockId) return { gated: true, approved: true, current: true, lockId: a.lockId, entry: a, now: c };
  const changed = [];
  for (const k of ['text', 'scene', 'shot']) if ((a.lock?.[k] ?? null) !== (c.lock[k] ?? null)) changed.push(k === 'shot' ? 'its shot entry' : k === 'scene' ? `its scene file ${r.scene ? rel(r.scene) : ''}`.trim() : 'the credits text');
  if ((a.lock?.lib ?? null) !== (c.lock.lib ?? null)) {
    const was = gate.libs?.[a.lock?.lib]?.files || {};
    const now = c.libFiles || {};
    const diff = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((f) => (was[f] || '').slice(0, 16) !== (now[f] || '').slice(0, 16));
    changed.push(`code it loads${diff.length ? ` (${diff.slice(0, 4).join(', ')}${diff.length > 4 ? `, +${diff.length - 4} more` : ''})` : ''}`);
  }
  return { gated: true, approved: true, current: false, lockId: a.lockId, entry: a, now: c, changed };
}
