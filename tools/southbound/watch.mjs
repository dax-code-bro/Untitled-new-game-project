// Read what the owner's game sent with "Let Claude watch me play" (api/sb-watch.js, src/core/watch.js).
//
//   node tools/southbound/watch.mjs key <key>        save the read key (kept in ~/.sbwatch-key, never in the repo)
//   node tools/southbound/watch.mjs status           is a store connected?
//   node tools/southbound/watch.mjs list [n] [kind]  newest reports (kind: play | error)
//   node tools/southbound/watch.mjs new              reports since the last `new` (summaries + pictures saved)
//   node tools/southbound/watch.mjs show <pathname>  one report in full (timeline, samples, picture saved)
//   node tools/southbound/watch.mjs say "<text>"     a note that shows up in the owner's game
//   node tools/southbound/watch.mjs prune <days>     delete reports older than that
//
// The key: GET /api/sb-watch?reveal=1 on a protected deployment address (behind Vercel sign-in), e.g.
// with the Vercel MCP tool web_fetch_vercel_url on https://<latest deployment>.vercel.app/api/sb-watch?reveal=1.
// Before a store is connected, reports only reach the function log (about an hour): read them with the
// Vercel MCP get_runtime_logs (query "SBWATCH").
// Pictures go to $SBWATCH_OUT (default /tmp/sbwatch). Uses curl (Node's fetch ignores the proxy).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.SBWATCH_URL || 'https://untitled-new-game-project.vercel.app/api/sb-watch';
const KEYFILE = path.join(os.homedir(), '.sbwatch-key'), SEENFILE = path.join(os.homedir(), '.sbwatch-seen');
const OUT = process.env.SBWATCH_OUT || '/tmp/sbwatch';
const [cmd = 'list', ...args] = process.argv.slice(2);
const key = () => process.env.SBWATCH_KEY || (fs.existsSync(KEYFILE) ? fs.readFileSync(KEYFILE, 'utf8').trim() : '');
const curl = (q, binary = false) => execFileSync('curl', ['-sS', '--max-time', '60', BASE + '?' + q], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 << 20 });
const getJson = (q) => { const t = curl(q); try { return JSON.parse(t); } catch (e) { throw new Error('not JSON: ' + t.slice(0, 300)); } };
const withKey = (q) => { const k = key(); if (!k) { console.error('no key: node tools/southbound/watch.mjs key <key>  (see the header of this file)'); process.exit(2); } return q + '&key=' + k; };

const when = (p) => new Date(9999999999999 - +path.basename(p).slice(0, 13)).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
const brief = (r) => {
  const s = r.state || {};
  const where = `${s.region || '?'} (${(s.pos || []).map((v) => Math.round(v)).join(', ')})`;
  const doing = s.mode === 'car' || s.vehicle ? `driving ${s.vehicle || '?'} ${s.speed ? Math.round(Math.abs(s.speed) * 3.6) + ' km/h' : ''}` : s.indoors ? 'indoors' : 'on foot';
  const bits = [where, doing, s.wanted ? `WANTED ${s.wanted}` : null, `hp ${s.health ?? '?'}`, `$${s.money ?? '?'}`, s.weapon ? `holding ${s.weapon}` : null, s.mission ? `mission: ${s.mission}` : null,
    `${s.fps ?? '?'} fps (${s.preset || '?'}, cpu ${s.cpuMs ?? '?'} ms, ${s.draws ?? '?'} draws)`, s.hour != null ? `${Math.floor(s.hour)}:${String(Math.round((s.hour % 1) * 60)).padStart(2, '0')} ${s.weather || ''}` : null];
  return bits.filter(Boolean).join(' · ');
};
const saveShot = (p) => {
  try {
    const buf = curl(withKey('shot=' + encodeURIComponent(p)), true);
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    fs.mkdirSync(OUT, { recursive: true });
    const f = path.join(OUT, path.basename(p, '.json') + '.jpg'); fs.writeFileSync(f, buf); return f;
  } catch (e) { return null; }
};
function print(p, r, full = false) {
  console.log(`\n== ${when(p)}  ${r.kind.toUpperCase()}${r.why ? ' (' + r.why + ')' : ''}  session ${r.session}, ${Math.round((r.played || 0) / 60)} min in  [${p}]`);
  if (r.error) console.log('   ERROR: ' + r.error.msg + '\n   ' + String(r.error.stack || '').split('\n').slice(0, full ? 12 : 4).join('\n   '));
  console.log('   ' + brief(r));
  const ev = (r.events || []).slice(full ? 0 : -12);
  if (ev.length) console.log('   timeline: ' + ev.map((e) => `[${Math.round(e.t)}s ${e.kind}] ${e.text}`).join('\n             '));
  if (full && r.samples?.length) console.log('   samples:\n' + r.samples.map((s) => '     ' + Math.round(s.t) + 's ' + brief({ state: s })).join('\n'));
  if (full) console.log('   screen ' + r.screen + ' · ' + r.ua);
  const f = r.shot ? saveShot(p) : null;
  if (f) console.log('   picture: ' + f);
}

if (cmd === 'key') { fs.writeFileSync(KEYFILE, String(args[0] || '').trim() + '\n', { mode: 0o600 }); console.log('saved to ' + KEYFILE); }
else if (cmd === 'status') console.log(getJson('status=1'));
else if (cmd === 'list' || cmd === 'new') {
  const seen = cmd === 'new' && fs.existsSync(SEENFILE) ? fs.readFileSync(SEENFILE, 'utf8').trim() : '';
  const list = getJson(withKey(`list=1&limit=${cmd === 'new' ? 60 : +args[0] || 15}${args[1] ? '&kind=' + args[1] : ''}`));
  if (!Array.isArray(list)) { console.log(list); process.exit(1); }
  const fresh = seen ? list.filter((b) => b.pathname < seen) : list; // newer names sort first
  if (!fresh.length) console.log(cmd === 'new' ? 'nothing new since the last check' : 'no reports yet');
  for (const b of fresh.slice().reverse()) print(b.pathname, getJson(withKey('get=' + encodeURIComponent(b.pathname))));
  if (cmd === 'new' && list.length) fs.writeFileSync(SEENFILE, list[0].pathname + '\n');
} else if (cmd === 'show') print(args[0], getJson(withKey('get=' + encodeURIComponent(args[0]))), true);
else if (cmd === 'say') console.log(getJson(withKey('say=' + encodeURIComponent(args.join(' ')))));
else if (cmd === 'prune') console.log(getJson(withKey('prune=' + (+args[0] || 30))));
else console.log('commands: key, status, list, new, show, say, prune (see the top of this file)');
