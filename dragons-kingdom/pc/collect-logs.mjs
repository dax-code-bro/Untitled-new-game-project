#!/usr/bin/env node
// Put everything the Claude session needs to know about this PC's render into ONE text file:
//   pc/logs/send-to-claude-<date>.txt
// (what is in it: this computer, the tools, the newest GPU check, the end of the newest setup, cache and episode
//  logs, the render status). Your user folder's name is replaced by "~" in it.
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

const home = os.homedir();
const user = (() => { try { return os.userInfo().username; } catch { return ''; } })();
/** Hide the user folder and the user name (they are not needed to help, and they are personal). */
function privacy(s) {
  let t = String(s);
  for (const h of [home, home.replace(/\\/g, '/')]) if (h && h.length > 3) t = t.split(h).join('~');
  // the user name only where it is a path part or a DOMAIN\name (so a user called "user" does not rewrite the word "user")
  if (user && user.length > 1) t = t.replace(new RegExp(`(?<=[\\\\/])${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\\\/\\s"':]|$)`, 'gim'), '<user>');
  return t;
}
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
  fs.mkdirSync(LOGS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const out = path.join(LOGS, `send-to-claude-${stamp}.txt`);
  const parts = [];
  const section = (title, body) => parts.push(`\n===== ${title} =====\n${body}\n`);

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
  if (process.env.DK_PRINT_PATH_FILE) fs.writeFileSync(process.env.DK_PRINT_PATH_FILE, out);
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
