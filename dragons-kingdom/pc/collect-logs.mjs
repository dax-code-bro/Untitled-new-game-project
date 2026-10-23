#!/usr/bin/env node
// Put everything the Claude session needs to know about this PC's render into ONE text file:
//   pc/logs/send-to-claude-<date>.txt
// (what is in it: first the SETUP RESULT and the GPU check's answer, then this computer, the tools, the newest GPU
//  check, the end of the newest setup, cache and episode logs, the render status). The user folder (long and short
//  form), the temp folder, the user name and the computer's name are replaced by "~", "<temp>", "<user>",
//  "<computer>". The GPU check's picture is copied next to it (send-to-claude-<date>-picture.jpg) to drag into the chat.
//
//   Windows: double-click pc\Send-Logs.cmd   (also copies the text, and opens the folder with the file selected)
//   any OS:  node pc/collect-logs.mjs        (prints where the file is)
//
// Then paste the text into the chat with Claude (Ctrl+V), or attach the file there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LOGS = path.join(HERE, 'logs');
const MAX_BYTES = 400 * 1024;      // a chat message can hold this comfortably

/** Windows' short (8.3) form of a folder, e.g. C:\Users\DAXTYN~1 (TEMP is often given that way). */
function shortPath(p) {
  if (process.platform !== 'win32' || !p) return null;
  try {
    const r = spawnSync('cmd.exe', ['/d', '/c', `for %I in ("${p}") do @echo %~sI`], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const s = (r.stdout || '').trim().split(/\r?\n/).pop();
    return s && s.toLowerCase() !== p.toLowerCase() ? s : null;
  } catch { return null; }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Hide personal names: the user folder (long and short form, either slash, any letter case on Windows),
 * the temp folder, the user name where it is a path part or DOMAIN\name, and the computer's name.
 */
export function makePrivacy({ home, homeShort, tmp, user, host, win }) {
  const rules = [];
  const add = (p, to) => {
    if (!p || p.length <= 3) return;
    for (const v of new Set([p, p.replace(/\\/g, '/'), p.replace(/\//g, '\\')])) rules.push([new RegExp(esc(v), win ? 'gi' : 'g'), to]);
  };
  add(tmp, '<temp>');                     // first: TEMP usually lies inside the user folder
  for (const h of [home, homeShort]) add(h, '~');
  return (s) => {
    let t = String(s);
    for (const [re, to] of rules) t = t.replace(re, to);
    // the user name only where it is a path part or a DOMAIN\name (so a user called "user" does not rewrite the word "user")
    if (user && user.length > 1) t = t.replace(new RegExp(`(?<=[\\\\/])${esc(user)}(?=[\\\\/\\s"':]|$)`, 'gim'), '<user>');
    if (host && host.length > 1) t = t.replace(new RegExp(`(?<![\\w-])${esc(host)}(?![\\w-])`, 'gi'), '<computer>');
    return t;
  };
}
const user = (() => { try { return os.userInfo().username; } catch { return ''; } })();
let privacy = (s) => String(s);
const newest = (re) => {
  try {
    return fs.readdirSync(LOGS).filter((f) => re.test(f)).map((f) => path.join(LOGS, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  } catch { return null; }
};
const readTail = (f, lines) => {
  try {
    const all = fs.readFileSync(f, 'utf8').replace(/\r/g, '\n').split('\n').filter((l, i, a) => l !== '' || a[i - 1] !== '');
    return { text: all.slice(-lines).join('\n'), cut: Math.max(0, all.length - lines) };
  } catch (e) { return { text: `(could not read: ${e.message})`, cut: 0 }; }
};
const run = (cmd, args) => {
  try {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 20000 });
    return (r.stdout || r.stderr || '').trim();
  } catch { return ''; }
};
const freeGB = (dir) => { try { const s = fs.statfsSync(dir); return ((s.bavail * s.bsize) / 2 ** 30).toFixed(0); } catch { return '?'; } };

async function main() {
  privacy = makePrivacy({ home: os.homedir(), homeShort: shortPath(os.homedir()), tmp: os.tmpdir(), user, host: os.hostname(), win: process.platform === 'win32' });
  fs.mkdirSync(LOGS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const out = path.join(LOGS, `send-to-claude-${stamp}.txt`);
  const parts = [];
  const section = (title, body) => parts.push(`\n===== ${title} =====\n${body}\n`);

  // the answers first: how the setup ended, what the GPU check found
  const setupLog = newest(/^setup-.*\.log$/);
  let setupResult = '(no setup log yet)';
  if (setupLog) {
    const m = [...fs.readFileSync(setupLog, 'utf8').matchAll(/SETUP RESULT: (\d+) - ([^\r\n]*)/g)].pop();
    setupResult = m ? `${m[1]} - ${m[2]}  (${path.basename(setupLog)})` : `the newest setup log has no result line: it did not finish, or it is older than 2026-10-23 (${path.basename(setupLog)})`;
  }
  const gj = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'gpu-check', 'gpu-check.json'), 'utf8')); } catch { return null; } })();
  const gpuLine = gj ? `exit ${gj.exitCode} (0 ok, 2 no GPU, 3 picture different, 1 error) on ${String(gj.date).slice(0, 16)}; ${gj.gpu?.renderer || 'no GPU found'}; picture: ${gj.picture?.verdict || 'not compared'}`
    : '(the GPU check has not run on this PC yet)';
  const pic = gj?.picture?.jpg ? path.join(ROOT, gj.picture.jpg) : null;
  let picOut = null;
  if (pic && fs.existsSync(pic)) { picOut = out.replace(/\.txt$/, '-picture.jpg'); fs.copyFileSync(pic, picOut); }
  parts.push(`SETUP RESULT: ${setupResult}\nGPU CHECK:    ${gpuLine}\nPICTURE:      ${picOut ? `${path.basename(picOut)} (in the same folder) - please drag it into the chat too` : '(none yet)'}\n`);

  let ffmpeg = 'ffmpeg';
  try { ({ ffmpegPath: ffmpeg } = await import(pathToFileURL(path.join(ROOT, 'render', 'lib', 'tools.mjs')).href)); ffmpeg = ffmpeg(); } catch { ffmpeg = 'ffmpeg'; }
  const cpus = os.cpus();
  section('This computer', [
    `made:       ${new Date().toString()}`,
    `system:     ${os.type()} ${os.release()} (${process.platform}/${process.arch})`,
    `processor:  ${cpus[0]?.model?.trim() || '?'} x ${cpus.length} threads`,
    `memory:     ${(os.totalmem() / 2 ** 30).toFixed(1)} GB (${(os.freemem() / 2 ** 30).toFixed(1)} GB free now)`,
    `free disk:  ${freeGB(ROOT)} GB where the project is`,
    `node:       ${process.version} (${process.execPath})`,
    `ffmpeg:     ${run(ffmpeg, ['-hide_banner', '-version']).split('\n')[0] || 'not found'} (${ffmpeg})`,
    `git:        ${run('git', ['--version']) || 'not found'}`,
    `project:    ${ROOT}`,
    `branch:     ${run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])} at ${run('git', ['log', '-1', '--format=%h %cd %s', '--date=iso'])}`,
    `changed:    ${run('git', ['status', '--short', '--untracked-files=no']).split('\n').filter(Boolean).slice(0, 10).join('; ') || 'nothing (clean)'}`,
  ].join('\n'));

  const prof = path.join(HERE, '.dk-gpu.json');
  section('GPU profile the renderer uses (pc/.dk-gpu.json)', fs.existsSync(prof) ? fs.readFileSync(prof, 'utf8').trim() : '(none yet: the GPU check has not found a working graphics card on this PC)');

  const items = [
    ['Newest GPU check', newest(/^gpu-check-.*\.txt$/), 300],
    ['Newest setup log (end)', newest(/^setup-.*\.log$/), 200],
    ['Newest cache log (end)', newest(/^caches-.*\.log$/), 80],
    ['Render log (end)', fs.existsSync(path.join(LOGS, 'episode.log')) ? path.join(LOGS, 'episode.log') : null, 150],
    ['Render status', fs.existsSync(path.join(ROOT, 'output', 'episode1', 'STATUS.txt')) ? path.join(ROOT, 'output', 'episode1', 'STATUS.txt') : null, 120],
  ];
  for (const [title, f, n] of items) {
    if (!f) { section(title, '(not there yet)'); continue; }
    const { text, cut } = readTail(f, n);
    section(`${title}: ${path.relative(ROOT, f)}${cut ? ` (last ${n} lines; ${cut} earlier lines left out)` : ''}`, text);
  }
  const ep = path.join(LOGS, 'episode.log');
  if (fs.existsSync(ep)) {
    const fails = fs.readFileSync(ep, 'utf8').split(/\r?\n/).filter((l) => /FAILED|STOP:|Error|error:/.test(l)).slice(-40);
    section('Problems mentioned in the render log (last 40)', fails.length ? fails.join('\n') : '(none)');
  }

  let text = privacy(`Dragon's Kingdom - logs for the Claude session\n${parts.join('')}`);
  if (Buffer.byteLength(text) > MAX_BYTES) text = `${text.slice(0, MAX_BYTES)}\n\n(cut at ${MAX_BYTES / 1024} KB)\n`;
  fs.writeFileSync(out, text);
  console.log(`Wrote ${out}`);
  console.log(`${(Buffer.byteLength(text) / 1024).toFixed(0)} KB. Paste its text into the chat with Claude (open it, Ctrl+A, Ctrl+C, then Ctrl+V in the chat), or attach the file.`);
  if (picOut) console.log(`Also drag the GPU check picture into the chat: ${picOut}`);
  if (process.env.DK_PRINT_PATH_FILE) fs.writeFileSync(process.env.DK_PRINT_PATH_FILE, [out, picOut].filter(Boolean).join('\n'));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
