// Render PC kit tests (run: npm test). No browser, no rendering: a few seconds.
//  - the Windows launchers keep the shape their safety depends on (CRLF, one block, ASCII);
//  - messages shown on Windows never tell Daxtyn to type "npm run ..." (npm may not be on PATH there);
//  - the render gate (render/lib/gate.mjs): the lock follows the files a scene loads, CRLF checkouts give the
//    same lock, and the verdicts (not approved / approved / changed since) are right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PC = path.join(ROOT, 'pc');
const cmdFiles = fs.readdirSync(PC).filter((f) => f.endsWith('.cmd')).map((f) => path.join(PC, f));
const ps1Files = fs.readdirSync(PC).filter((f) => f.endsWith('.ps1')).map((f) => path.join(PC, f));

// ---------------------------------------------------------------- launchers ---
test('pc kit: every .cmd launcher is CRLF, "@echo off" + rem lines + ONE ( ... exit /b ) block, no < or > in comments', () => {
  assert.ok(cmdFiles.length >= 4, `expected the four launchers, found ${cmdFiles.length}`);
  for (const f of cmdFiles) {
    const name = path.basename(f);
    const raw = fs.readFileSync(f, 'latin1');
    assert.ok(raw.endsWith('\r\n'), `${name}: must end with CRLF`);
    assert.equal(raw.replace(/\r\n/g, '').includes('\n'), false, `${name}: has a line ending without CR (cmd.exe needs CRLF; edit it with CRLF kept)`);
    const lines = raw.slice(0, -2).split('\r\n');
    assert.equal(lines[0], '@echo off', `${name}: first line must be "@echo off"`);
    let i = 1;
    for (; i < lines.length && /^rem( |$)/i.test(lines[i]); i++) {
      assert.ok(!/[<>|&]/.test(lines[i]), `${name}: line ${i + 1}: "<", ">", "|" or "&" in a rem line (cmd.exe may parse it): ${lines[i]}`);
    }
    assert.equal(lines[i], '(', `${name}: after the rem lines the commands must open ONE block "(" (a git pull may rewrite the file while it runs; cmd.exe reads a block whole)`);
    const close = lines.lastIndexOf(')');
    assert.equal(close, lines.length - 1, `${name}: the block's ")" must be the last line (nothing after the block)`);
    const body = lines.slice(i + 1, close);
    assert.ok(body.length >= 1 && /^\s*exit \/b\s*$/i.test(body[body.length - 1]), `${name}: the block must end with "exit /b"`);
    assert.ok(!body.some((l) => /^\s*[()]\s*$/.test(l)), `${name}: no nested blocks`);
  }
});

test('pc kit: .cmd and .ps1 files are pure ASCII (Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI); git keeps .cmd bytes as committed', () => {
  for (const f of [...cmdFiles, ...ps1Files]) {
    const buf = fs.readFileSync(f);
    const bad = buf.findIndex((b) => b > 0x7e || (b < 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09));
    if (bad >= 0) {
      const line = buf.subarray(0, bad).toString('latin1').split('\n').length;
      assert.fail(`${path.basename(f)}: byte 0x${buf[bad].toString(16)} at line ${line} is not printable ASCII`);
    }
  }
  const ga = fs.readFileSync(path.join(PC, '.gitattributes'), 'utf8');
  assert.match(ga, /^\*\.cmd\s+-text\b/m, 'pc/.gitattributes must keep *.cmd as committed (-text)');
  const g = spawnSync('git', ['ls-files', '--eol', ...cmdFiles.map((f) => path.relative(ROOT, f))], { cwd: ROOT, encoding: 'utf8' });
  if (g.status === 0 && g.stdout.trim()) {
    for (const l of g.stdout.trim().split('\n')) assert.match(l, /^i\/crlf\s/, `committed .cmd is not CRLF: ${l}`);
  }
});

test('pc kit: the PowerShell scripts parse (only where a pwsh binary is available: DK_PWSH or pwsh on PATH)', (t) => {
  const pwsh = process.env.DK_PWSH || (spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pwsh'], { encoding: 'utf8' }).stdout || '').split(/\r?\n/)[0].trim();
  if (!pwsh || !fs.existsSync(pwsh)) { t.skip('no pwsh here (set DK_PWSH=/path/to/pwsh to run it)'); return; }
  const script = ps1Files.map((f) => `$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${f.replace(/'/g, "''")}',[ref]$t,[ref]$e);foreach($x in $e){Write-Output ('${path.basename(f)} line '+$x.Extent.StartLineNumber+': '+$x.Message)}`).join(';');
  const r = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, `pwsh failed: ${r.stderr}`);
  assert.equal(r.stdout.trim(), '', `parse errors:\n${r.stdout}`);
});

// ------------------------------------------------- Windows-facing messages ---
const WIN_PRELOAD = `data:text/javascript,${encodeURIComponent("Object.defineProperty(process, 'platform', { value: 'win32' });")}`;
function runAsWindows(args, env = {}) {
  const r = spawnSync(process.execPath, ['--import', WIN_PRELOAD, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } });
  return `${r.stdout || ''}${r.stderr || ''}`;
}

test('pc kit: what Windows shows never says "npm run" (help, status, no-GPU stop, GPU banner)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-pckit-'));
  try {
    const out = path.join(tmp, 'out');
    const texts = {
      'episode --help': runAsWindows(['render/episode.mjs', '--help']),
      'episode --status': runAsWindows(['render/episode.mjs', '--status', '--out', out]),
      'STATUS.txt': fs.existsSync(path.join(out, 'STATUS.txt')) ? fs.readFileSync(path.join(out, 'STATUS.txt'), 'utf8') : '(missing)',
      'episode without a GPU check': runAsWindows(['render/episode.mjs', '--out', out], { DK_GPU_FILE: path.join(tmp, 'no-gpu.json') }),
      'gpu-check --help': runAsWindows(['render/gpu-check.mjs', '--help']),
      'GPU banner + commands': runAsWindows(['-e', `import('./render/lib/gpu.mjs').then((m) => console.log(m.softwareFallbackMessage('SwiftShader', { check: true }), m.softwareFallbackMessage(null, {}), m.gpuCheckCommand(), m.renderCommand(), m.renderCommand('--rerender-stale')))`]),
    };
    assert.match(texts['episode without a GPU check'], /GPU-Check\.cmd/, 'the no-GPU stop must name GPU-Check.cmd');
    assert.match(texts['episode without a GPU check'], /Render-Episode\.cmd --cpu/, 'the no-GPU stop must name the .cmd for a CPU render');
    assert.match(texts['GPU banner + commands'], /Render-Episode\.cmd --rerender-stale/);
    assert.notEqual(texts['STATUS.txt'], '(missing)', '--status wrote no STATUS.txt');
    for (const [what, text] of Object.entries(texts)) {
      assert.ok(text.trim().length > 0, `${what}: no output`);
      const hit = text.split('\n').find((l) => /\bnpm run\b|\bnpm test\b/.test(l));
      assert.equal(hit, undefined, `${what} tells a Windows user to use npm: ${hit}`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ------------------------------------------------------------- render gate ---
test('render gate: the lock follows every file the scene loads, ignores CRLF, and the verdicts are right', async () => {
  const gate = await import('../render/lib/gate.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-gate-test-'));
  try {
    const sceneF = path.join(tmp, 'set.js'), helper = path.join(tmp, 'lib', 'helper.js'), lazy = path.join(tmp, 'lib', 'lazy.js'), data = path.join(tmp, 'lib', 'table.json');
    fs.mkdirSync(path.dirname(helper), { recursive: true });
    fs.writeFileSync(sceneF, "import * as THREE from 'three';\nimport { h } from './lib/helper.js';\n// import './lib/not-loaded.js';\nexport const meta = {};\nexport function update(t) { return h(t); }\n");
    fs.writeFileSync(helper, "export const table = new URL('./table.json', import.meta.url);\nexport async function more() { return import('./lazy.js'); }\nexport const h = (t) => t;\n");
    fs.writeFileSync(lazy, 'export const x = 1;\n');
    fs.writeFileSync(data, '{"a": 1}\n');
    const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
    const c = gate.importClosure([sceneF]);
    for (const f of [sceneF, helper, lazy, data]) assert.ok(rel(f) in c.files, `closure misses ${rel(f)}`);
    assert.ok('node_modules/three/build/three.module.js' in c.files, 'closure misses three');
    assert.ok(!Object.keys(c.files).some((f) => f.endsWith('not-loaded.js')), 'a commented-out import was followed');

    const job = { job: 'T-01', frames: 24, render: '3d' };
    const r = { kind: '3d', scene: sceneF, startS: 2, entry: { job: 'T-01', start_s: 2, frames: 24 } };
    const lockA = gate.computeLock(job, r);
    // the same files with CRLF line endings (a Windows checkout) give the same lock
    for (const f of [sceneF, helper, lazy, data]) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
    fs.utimesSync(lazy, new Date(), new Date(Date.now() + 5000));
    const reload = await import(`../render/lib/gate.mjs?crlf=${Date.now()}`);
    assert.equal(reload.computeLock(job, r).lockId, lockA.lockId, 'CRLF checkout changed the lock');

    const planDir = tmp;
    const g0 = reload.readGate(planDir);
    assert.equal(reload.gateVerdict(g0, job, r).approved, false, 'no gate file: not approved');
    reload.writeGate(planDir, { approved: { 'T-01': { lockId: lockA.lockId, lock: lockA.lock, approvedBy: 'test', date: '2026-10-23' } }, libs: { [lockA.lock.lib]: { files: lockA.libFiles } } });
    const g1 = reload.readGate(planDir);
    const v1 = reload.gateVerdict(g1, job, r);
    assert.ok(v1.approved && v1.current, 'approved with the same files: current');
    // a file loaded lazily (dynamic import) changes: the shot waits, and the change names that file
    fs.writeFileSync(lazy, 'export const x = 2;\n');
    fs.utimesSync(lazy, new Date(), new Date(Date.now() + 10000));
    const again = await import(`../render/lib/gate.mjs?edit=${Date.now()}`);
    const v2 = again.gateVerdict(again.readGate(planDir), job, r);
    assert.ok(v2.approved && !v2.current, 'a changed lazy import must make the approval out of date');
    assert.match(v2.changed.join(' '), /lazy\.js/, `the change should name lazy.js: ${v2.changed}`);
    // the shot entry changes (another start time): out of date too
    const v3 = again.gateVerdict(again.readGate(planDir), job, { ...r, startS: 3, entry: { ...r.entry, start_s: 3 } });
    assert.ok(!v3.current && v3.changed.some((x) => /shot entry/.test(x)), 'a changed shot entry must make the approval out of date');
    // black cards need no approval
    assert.equal(again.gateVerdict(g1, { job: 'B', render: 'black' }, { kind: 'black' }).gated, false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// --------------------------------------------------------------- Send-Logs ---
test('Send-Logs privacy: user folder in any letter case and its 8.3 short form, TEMP, user name and computer name are hidden', async () => {
  const { makePrivacy } = await import('../pc/collect-logs.mjs');
  const hide = makePrivacy({ home: 'C:\\Users\\Daxtyn Sanches', homeShort: 'C:\\Users\\DAXTYN~1', tmp: 'C:\\Users\\DAXTYN~1\\AppData\\Local\\Temp',
    user: 'Daxtyn Sanches', host: 'DAX-GAMING-PC', win: true });
  const raw = [
    'node: C:\\Users\\Daxtyn Sanches\\DragonsKingdom\\dragons-kingdom\\pc\\tools\\node\\node.exe',
    'temp: C:\\Users\\DAXTYN~1\\AppData\\Local\\Temp\\dk-episode-123.json',
    'lower: c:\\users\\daxtyn sanches\\DragonsKingdom and c:/users/daxtyn sanches/x',
    'short: C:\\Users\\DAXTYN~1\\DragonsKingdom',
    '"host": "DAX-GAMING-PC", other D:\\Daxtyn Sanches\\Videos',
  ].join('\n');
  const t = hide(raw);
  for (const secret of [/daxtyn/i, /DAX-GAMING-PC/i, /DAXTYN~1/i]) assert.doesNotMatch(t, secret, `still in the text: ${secret}\n${t}`);
  assert.match(t, /node: ~\\DragonsKingdom/);
  assert.match(t, /temp: <temp>\\dk-episode/);
  assert.match(t, /"host": "<computer>"/);
  // Linux / macOS: exact case only, and a user called "user" keeps the ordinary word
  const nix = makePrivacy({ home: '/home/user', tmp: '/tmp', user: 'user', host: 'box', win: false });
  assert.equal(nix('the user ran /home/user/x on box in /tmp/y'), 'the user ran ~/x on <computer> in <temp>/y');
});
