// Watch the owner play, live (api/sb-live.js; the game side is site/southbound/src/core/watch.js).
//
//   node tools/southbound/live.mjs watch <liveId>        follow the feed: prints one line per thing worth a
//                                                       look (run it under Monitor: each line wakes Claude)
//   node tools/southbound/live.mjs say <liveId> "text"   a note that shows up in the owner's game
//   node tools/southbound/live.mjs now <liveId>          the latest update and picture, once
//   node tools/southbound/live.mjs auto                  wait until the owner starts playing, then follow
//                                                       (the lobby: needs the secret in ~/.sblive-secret,
//                                                       whose sha256 is LOBBY_HASH in api/sb-live.js;
//                                                       a new secret means a new hash there and a deploy)
//
// The live id: the newest "SBLIVE-START <id>" line in the function log (Vercel MCP get_runtime_logs,
// query "SBLIVE-START"). Pictures and the full feed go to $SBLIVE_OUT (default /tmp/sblive):
// latest.jpg (the newest picture), f-<seq>.jpg (the last 40), live.jsonl (every update).
// What gets a line: the owner's messages, errors, deaths, the police, in/out of vehicles, new places,
// missions, cutscenes, and physical errors: below the ground, floating, a vehicle on its roof or side,
// crashes, sudden jumps; frame-rate drops; the feed going quiet / coming back; a summary every 90 s.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SBLIVE_URL || 'https://untitled-new-game-project.vercel.app/api/sb-live';
const OUT = process.env.SBLIVE_OUT || '/tmp/sblive';
const [cmd, arg1, ...rest] = process.argv.slice(2);
let id = arg1;
if (cmd !== 'auto' && (!id || !/^[a-f0-9]{16,64}$/.test(id))) { console.error('usage: live.mjs watch|say|now <liveId> [text] | auto'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const get = (q, bin = false) => execFileSync('curl', ['-sS', '--max-time', '12', `${BASE}?live=${id}&${q}`], { encoding: bin ? 'buffer' : 'utf8', maxBuffer: 32 << 20 });
const getJson = (q) => { try { return JSON.parse(get(q)); } catch (e) { return null; } };
const outboxOf = () => path.join(OUT, `outbox-${String(id).slice(0, 8)}.json`);
const readOutbox = () => { try { return JSON.parse(fs.readFileSync(outboxOf(), 'utf8')); } catch (e) { return []; } };
const sendNote = (n) => getJson(`note=${encodeURIComponent(n.text)}&nid=${n.nid}`);
const hhmm = (h) => (h == null ? '?' : `${Math.floor(h)}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`);
const brief = (p) => [p.region, p.indoors ? 'indoors' : p.vehicle ? `in ${p.vehicle} ${Math.round(Math.abs(p.speed || 0) * 3.6)} km/h` : `on foot${p.speed > 0.5 ? ' ' + (Math.abs(p.speed) * 3.6).toFixed(0) + ' km/h' : ''}`,
  p.wanted ? `WANTED ${p.wanted}` : null, `hp ${p.health}`, `$${p.money}`, p.weapon ? `holding ${p.weapon}` : null, p.mission ? `mission ${p.mission}` : null,
  `${Math.round(p.fps)} fps`, `${hhmm(p.hour)} ${p.weather || ''}`, p.paused ? 'PAUSED' : null].filter(Boolean).join(' · ');
const saveFrame = (seq) => {
  try {
    const b = get(`frame=${seq}`, true);
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    const f = path.join(OUT, `f-${seq}.jpg`); fs.writeFileSync(f, b); fs.copyFileSync(f, path.join(OUT, 'latest.jpg'));
    const old = fs.readdirSync(OUT).filter((n) => /^f-\d+\.jpg$/.test(n)).sort((a, b) => +a.slice(2, -4) - +b.slice(2, -4));
    for (const n of old.slice(0, Math.max(0, old.length - 40))) fs.unlinkSync(path.join(OUT, n));
    return f;
  } catch (e) { return null; }
};

if (cmd === 'say') {
  const n = { nid: Math.random().toString(16).slice(2, 10), text: rest.join(' ').slice(0, 400), t: Date.now() };
  const r = sendNote(n);
  const box = readOutbox(); box.push(n); fs.writeFileSync(outboxOf(), JSON.stringify(box));
  console.log(r ? `note ${n.nid} sent (the watcher re-sends it until the game shows it)` : 'could not reach the feed');
} else if (cmd === 'now') {
  const j = getJson('since=0');
  if (!j || !j.pings.length) { console.log('no updates in this instance', j && j.inst); process.exit(0); }
  const p = j.pings[j.pings.length - 1];
  console.log(`#${p.seq} ${new Date(p.t).toISOString().slice(11, 19)}Z ${brief(p)}  pos ${(p.pos || []).map(Math.round).join(',')}`);
  if (j.frames.length) console.log('picture', saveFrame(j.frames[j.frames.length - 1]));
} else if (cmd === 'watch' || cmd === 'auto') {
  const secret = (() => { try { return fs.readFileSync(path.join(process.env.HOME || '/root', '.sblive-secret'), 'utf8').trim(); } catch (e) { return ''; } })();
  const lobby = () => { try { return JSON.parse(execFileSync('curl', ['-sS', '--max-time', '12', `${BASE}?lobby=${secret}`], { encoding: 'utf8' })); } catch (e) { return null; } };
  let since = 0, prev = null, lastSeen = Date.now(), quiet = false, lastSum = 0, lastFps = 0, lastFrame = 0, misses = 0, polls = 0, below = 0, floatN = 0, rollN = 0;
  const say = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);
  let waiting = cmd === 'auto', lobbyT = 0;
  if (waiting) say('waiting for the owner to start playing (lobby every 10 s)');
  else say(`watching ${id.slice(0, 8)}…  pictures: ${OUT}/latest.jpg`);
  const follow = (nid, f) => { id = nid; since = 0; prev = null; lastSeen = Date.now(); quiet = false; lastFrame = 0; waiting = false; say(`PLAYING: the owner started (feed ${nid.slice(0, 8)}${f && f.region ? ', ' + f.region : ''}) · pictures: ${OUT}/latest.jpg`); };
  const tick = () => {
    if (waiting) {
      if (Date.now() - lobbyT < 10000) return;
      lobbyT = Date.now();
      const L = lobby(); const f = L && L.feeds && L.feeds.find((x) => x.ago < 30 && x.session !== 'claudetest');
      if (f) follow(f.id, f);
      return;
    }
    // following: if this feed has been quiet for 10 minutes, go back to waiting for a new one (auto)
    if (cmd === 'auto' && Date.now() - lastSeen > 600000) { say('the owner seems to have stopped; waiting for the next session'); waiting = true; return; }
    if (cmd === 'auto' && quiet && Date.now() - lobbyT > 20000) { // a new session (the page was reloaded) takes over
      lobbyT = Date.now();
      const L = lobby(); const f = L && L.feeds && L.feeds.find((x) => x.ago < 30 && x.id !== id && x.session !== 'claudetest');
      if (f) { follow(f.id, f); return; }
    }
    polls++;
    const j = getJson(`since=${since}`);
    if (!j) return;
    if (j.empty || (!j.pings.length && Date.now() - lastSeen > 6000)) misses++;
    // notes not yet shown in the game: send again (the update may have reached another warm instance)
    const box = readOutbox(), acks = new Set(j.acks || []);
    const keep = box.filter((n) => !acks.has(n.nid) && Date.now() - n.t < 180000);
    for (const n of keep) if (!n.last || Date.now() - n.last > 6000) { sendNote(n); n.last = Date.now(); }
    if (keep.length !== box.length || keep.some((n) => n.last)) fs.writeFileSync(outboxOf(), JSON.stringify(keep));
    for (const p of j.pings.sort((a, b) => a.seq - b.seq)) {
      if (p.seq <= since) continue;
      since = p.seq; lastSeen = Date.now();
      fs.appendFileSync(path.join(OUT, 'live.jsonl'), JSON.stringify(p) + '\n');
      if (quiet) { quiet = false; say(`BACK · ${brief(p)}`); }
      for (const e of p.events || []) {
        if (e.kind === 'owner') say(`💬 OWNER: ${e.text}`);
        else if (e.kind === 'error') say(`ERROR: ${e.text}`);
        else if (e.kind === 'death') say(`DIED · ${brief(p)}`);
        else if (e.kind === 'police') say(`POLICE ${e.text} · ${brief(p)}`);
        else if (e.kind === 'cutscene' && /started/.test(e.text)) say('CUTSCENE started');
      }
      if (prev) {
        if (p.vehicle !== prev.vehicle) say(p.vehicle ? `INTO ${p.vehicle} · ${p.region}` : `OUT of ${prev.vehicle} · ${p.region}`);
        if (p.region !== prev.region) say(`PLACE ${prev.region} -> ${p.region}`);
        if (p.mission && p.mission !== prev.mission) say(`MISSION ${p.mission}`);
        if (p.indoors && !prev.indoors) say(`INSIDE a building · ${p.region}`);
        if ((prev.health || 0) - (p.health || 0) >= 15) say(`HURT ${prev.health} -> ${p.health} · ${brief(p)}`);
        const dx = Math.hypot((p.pos?.[0] || 0) - (prev.pos?.[0] || 0), (p.pos?.[2] || 0) - (prev.pos?.[2] || 0)), dt = Math.max(0.5, (p.t - prev.t) / 1000);
        const vMax = Math.max(Math.abs(p.speed || 0), Math.abs(prev.speed || 0));
        if (!p.paused && dx > 25 + vMax * dt * 1.6 && dt < 6 && !p.cutscene && !prev.cutscene) say(`JUMP ${dx.toFixed(0)} m in ${dt.toFixed(1)} s (teleport or physics) · ${brief(p)}`);
        if (prev.vehicle && p.vehicle === prev.vehicle && Math.abs(prev.speed || 0) - Math.abs(p.speed || 0) > 12) say(`CRASH ${Math.round(Math.abs(prev.speed) * 3.6)} -> ${Math.round(Math.abs(p.speed) * 3.6)} km/h · ${brief(p)}`);
      }
      // physical errors
      if (!p.indoors && !p.cutscene && p.ground != null && p.y != null && !p.vehicle) {
        if (p.y < p.ground - 0.6) { if (++below === 2) say(`BELOW GROUND by ${(p.ground - p.y).toFixed(1)} m at ${(p.pos || []).map(Math.round).join(',')} · ${p.region}`); } else below = 0;
        if (p.y > p.ground + 2.5 && prev && Math.abs((prev.y || 0) - p.y) < 0.3) { if (++floatN === 2) say(`FLOATING ${(p.y - p.ground).toFixed(1)} m above the ground at ${(p.pos || []).map(Math.round).join(',')} · ${p.region}`); } else floatN = 0;
      }
      if (p.vehicle && p.up != null && p.up < 0.35 && Math.abs(p.speed || 0) < 3) { if (++rollN === 2) say(`VEHICLE ON ITS ${p.up < -0.3 ? 'ROOF' : 'SIDE'} (${p.vehicle}) · ${p.region}`); } else rollN = 0;
      if (p.fps < 20 && !p.paused && Date.now() - lastFps > 60000) { lastFps = Date.now(); say(`FPS ${Math.round(p.fps)} (cpu ${p.cpuMs} ms, ${p.draws} draws, scale ${p.scale}) · ${p.region}`); }
      prev = p;
    }
    if (j.frames && j.frames.length) { const f = j.frames[j.frames.length - 1]; if (f > lastFrame) { lastFrame = f; saveFrame(f); } }
    if (!quiet && Date.now() - lastSeen > 20000 && since) { quiet = true; say('QUIET: no updates for 20 s (paused in a menu, tab in the background, or closed)'); }
    if (prev && Date.now() - lastSum > 90000 && !quiet) {
      lastSum = Date.now();
      const msgs = (prev.events || []).filter((e) => e.kind === 'message').slice(-2).map((e) => e.text).join(' | ');
      say(`NOW ${brief(prev)}${msgs ? ' · "' + msgs + '"' : ''} · misses ${misses}/${polls}`);
    }
  };
  tick();
  setInterval(tick, 2000);
} else console.error('commands: watch, say, now');
