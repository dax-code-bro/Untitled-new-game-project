// Southbound live feed to Claude (the 'live' part of site/southbound/src/core/watch.js; read with
// tools/southbound/live.mjs). While the player lets Claude watch, the game posts what's happening every
// 2 s and a small picture every 5 s; Claude's watcher reads it back within seconds, and Claude's notes
// travel back the same way. No storage needed: the newest few minutes live in this function's memory
// (Vercel keeps an instance warm and reuses it between requests), and every update also goes to the
// function log, the dependable copy.
//
//   POST /api/sb-live  {game:'southbound', live, session, seq, ping, events?, frame?, say?, acks?}
//        -> {ok, inst, notes:[{id,text}]}   notes from Claude the game hasn't shown yet
//   GET  ?live=<id>&since=<seq>             -> {inst, pings, frames:[seq...], says, acks, notes}
//   GET  ?live=<id>&frame=<seq|latest>      -> image/jpeg
//   GET  ?live=<id>&note=<text>&nid=<id>    -> leave the player a note (shown in the game)
// The live id is random for each play session and shows up only in the function log (which needs the
// project's Vercel sign-in to read), so only someone who can read the logs can watch.
const crypto = require('node:crypto');

const INST = crypto.randomBytes(4).toString('hex'); // which warm instance answered (the watcher counts misses)
const feeds = globalThis.__sbLive || (globalThis.__sbLive = new Map());
const MAX_PINGS = 400, MAX_FRAMES = 24, MAX = 600 * 1024;
const okId = (s) => typeof s === 'string' && /^[a-f0-9]{16,64}$/.test(s);
const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
const feed = (id) => { let f = feeds.get(id); if (!f) { f = { pings: [], frames: [], says: [], notes: [], acks: new Set(), seen: Date.now() }; feeds.set(id, f); } f.seen = Date.now(); return f; };
const tidy = () => { const now = Date.now(); for (const [k, f] of feeds) if (now - f.seen > 45 * 60e3) feeds.delete(k); };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
      if (Buffer.isBuffer(b)) { try { b = JSON.parse(b.toString('utf8')); } catch (e) { b = null; } }
      if (!b || b.game !== 'southbound' || !okId(b.live) || !b.ping) return json(res, 400, { error: 'not a Southbound live update' });
      if (JSON.stringify(b).length > MAX) return json(res, 413, { error: 'too big' });
      tidy();
      const f = feed(b.live), t = Date.now(), seq = +b.seq || 0;
      const p = { seq, t, ...b.ping, events: b.events || [], say: b.say || null, acks: b.acks || [] };
      f.pings.push(p); if (f.pings.length > MAX_PINGS) f.pings.splice(0, f.pings.length - MAX_PINGS);
      if (b.say) for (const s of [].concat(b.say)) f.says.push({ seq, t, text: String(s).slice(0, 500) });
      for (const a of b.acks || []) f.acks.add(String(a));
      if (b.frame && /^data:image\/jpeg;base64,/.test(b.frame)) { f.frames.push({ seq, t, jpg: Buffer.from(b.frame.slice(23), 'base64') }); if (f.frames.length > MAX_FRAMES) f.frames.shift(); }
      // the dependable copy: the log (the start, anything with events or words, and every 15th update)
      if (seq <= 1 || seq % 30 === 0) console.log('SBLIVE-START ' + b.live + ' session ' + String(b.session || '').slice(0, 12) + ' seq ' + seq);
      if (seq % 15 === 0 || (b.events && b.events.length) || b.say) console.log('SBLIVE ' + b.live.slice(0, 8) + ' ' + JSON.stringify({ seq, ...b.ping, events: b.events, say: b.say }).slice(0, 4000));
      const notes = f.notes.filter((n) => !f.acks.has(n.id)).slice(-5);
      return json(res, 200, { ok: true, inst: INST, notes });
    }
    if (!okId(q.live)) return json(res, 404, { error: 'no such feed' });
    const f = feeds.get(q.live);
    if (q.note) {
      const nf = feed(q.live), id = String(q.nid || crypto.randomBytes(4).toString('hex')).slice(0, 24);
      if (!nf.notes.some((n) => n.id === id)) nf.notes.push({ id, text: String(q.note).slice(0, 400), t: Date.now() });
      if (nf.notes.length > 30) nf.notes.shift();
      console.log('SBLIVE-NOTE ' + q.live.slice(0, 8) + ' ' + id + ' ' + String(q.note).slice(0, 200));
      return json(res, 200, { ok: true, inst: INST, id });
    }
    if (!f) return json(res, 200, { inst: INST, pings: [], frames: [], says: [], acks: [], notes: [], empty: true });
    if (q.frame) {
      const fr = q.frame === 'latest' ? f.frames[f.frames.length - 1] : f.frames.find((x) => x.seq === +q.frame);
      if (!fr) return json(res, 404, { error: 'no picture' });
      res.statusCode = 200; res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Seq', String(fr.seq)); res.setHeader('X-Inst', INST);
      return res.end(fr.jpg);
    }
    const since = +q.since || 0;
    return json(res, 200, { inst: INST, pings: f.pings.filter((p) => p.seq > since), frames: f.frames.map((x) => x.seq), says: f.says.filter((s) => s.seq > since), acks: [...f.acks], notes: f.notes.map((n) => n.id) });
  } catch (e) {
    console.error('SBLIVE failure', e);
    return json(res, 500, { error: String(e && e.message || e) });
  }
};
