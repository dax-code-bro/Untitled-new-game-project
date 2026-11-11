// Southbound "Let Claude watch me play" (site/southbound/src/core/watch.js).
//
// The game posts reports here only when the player has turned watching on (or presses "Send to
// Claude" on the error box). With a private Vercel Blob store connected to the project
// (BLOB_READ_WRITE_TOKEN), each report is kept as one private file; without one, reports still go
// to the function log (Vercel keeps that about an hour), so errors are never lost the moment they
// happen.
//
//   POST /api/sb-watch                     {game:'southbound', kind:'play'|'error', ...}  store a report
//   GET  /api/sb-watch?inbox=1&since=<ms>  notes Claude left for the player (shown in the game)
//   GET  /api/sb-watch?status=1            {store: true|false}
// Reading needs the key. The key is shown only on the project's protected deployment addresses
// (behind Vercel sign-in), never on the public game address:
//   GET  ?reveal=1                          {key}           (protected address only)
//   GET  ?key=K&list=1[&kind=error][&limit=40][&after=<pathname>]  newest reports first (no pictures)
//   GET  ?key=K&get=<pathname>              one report (JSON, picture as a data URL)
//   GET  ?key=K&shot=<pathname>             its picture (image/jpeg)
//   GET  ?key=K&say=<text>                  leave the player a note
//   GET  ?key=K&prune=<days>                delete reports older than that
const crypto = require('node:crypto');

let blob = null;
try { blob = require('@vercel/blob'); } catch (e) { /* not installed: log-only */ }
// a connected store gives either a read-write token or (newer) a store id used with Vercel's own sign-in
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || undefined;
const STORE = !!(blob && (TOKEN || process.env.BLOB_STORE_ID));
const PREFIX = 'sbwatch/r/';
const INBOX = 'sbwatch/inbox.json';
const PUBLIC_HOST = 'untitled-new-game-project.vercel.app';
const MAX = 900 * 1024;

// the read key: derived from the store's secret token, or (store id only) a random one kept in the store
let KEY = null;
async function readKey() {
  if (KEY) return KEY;
  if (TOKEN) return (KEY = crypto.createHash('sha256').update('sbwatch-read:' + TOKEN).digest('hex').slice(0, 32));
  if (!STORE) return '';
  const k = await readJson('sbwatch/key.json').catch(() => null);
  if (k && k.key) return (KEY = k.key);
  const key = crypto.randomBytes(16).toString('hex');
  await blob.put('sbwatch/key.json', JSON.stringify({ key }), { access: 'private', token: TOKEN, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false }).catch(() => null);
  const again = await readJson('sbwatch/key.json').catch(() => null); // two first calls at once: keep whichever was written
  return (KEY = (again && again.key) || key);
}
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
// the deployment and branch addresses are behind Vercel Authentication (the project's standard protection)
const isProtected = (req) => { const h = hostOf(req); return h !== PUBLIC_HOST && /^untitled-new-game-project-[a-z0-9-]+-dax-code-bros-projects\.vercel\.app$/.test(h); };
const safe = (s, n = 12) => String(s || '').replace(/[^a-z0-9]/gi, '').slice(0, n) || 'x';
const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
const text = async (stream) => new Response(stream).text();

async function readJson(pathname) {
  const r = await blob.get(pathname, { access: 'private', token: TOKEN, useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await text(r.stream));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // the desktop app and local copies post from another origin
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);

  try {
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      if (Buffer.isBuffer(body)) { try { body = JSON.parse(body.toString('utf8')); } catch (e) { body = null; } }
      if (!body || body.game !== 'southbound' || !/^(play|error)$/.test(body.kind)) return json(res, 400, { error: 'not a Southbound report' });
      const raw = JSON.stringify(body);
      if (raw.length > MAX) return json(res, 413, { error: 'too big' });
      const id = String(9999999999999 - Date.now()).padStart(13, '0') + '-' + body.kind + '-' + safe(body.session, 8);
      // the log always gets the gist (without the picture), so the newest hour is readable even with no
      // store: what happened first (error, state, the game's messages), the 10 s samples on a line of
      // their own (log viewers cut long lines short, and the timeline matters more)
      const { samples, shot, ua, ...rest } = body;
      const head = { id, ...rest, shot: shot ? '[jpeg ' + Math.round(shot.length / 1024) + ' KB]' : null, ua: String(ua || '').replace(/^Mozilla\/5\.0 /, '').slice(0, 60) };
      if (head.events) head.events = head.events.slice(-25).map((e) => `${Math.round(e.t)}s ${e.kind}: ${e.text}`);
      const log = body.kind === 'error' ? console.error : console.log;
      log('SBWATCH ' + JSON.stringify(head).slice(0, 12000));
      if (samples && samples.length) log('SBWATCH-SAMPLES ' + id + ' ' + JSON.stringify(samples.map((q) => [Math.round(q.t), q.region, q.mode, q.vehicle, Math.round(q.speed || 0), q.wanted, q.health, q.money, Math.round(q.fps), q.pos && q.pos.map(Math.round)])).slice(0, 12000));
      if (STORE) await blob.put(PREFIX + id + '.json', raw, { access: 'private', token: TOKEN, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      return json(res, 200, { ok: true, stored: STORE, id });
    }

    if (q.status) return json(res, 200, { store: STORE });
    if (q.inbox) {
      if (!STORE) return json(res, 200, []);
      const since = +q.since || 0;
      const notes = (await readJson(INBOX).catch(() => null)) || [];
      return json(res, 200, notes.filter((n) => n.t > since).slice(-5));
    }
    if (q.reveal) {
      if (!isProtected(req)) return json(res, 403, { error: 'only on the protected deployment address' });
      return json(res, 200, { key: await readKey(), store: STORE });
    }

    // everything below needs the key
    const key = await readKey();
    if (!key || !q.key || q.key.length !== key.length || !crypto.timingSafeEqual(Buffer.from(q.key), Buffer.from(key))) return json(res, 403, { error: STORE ? 'bad key' : 'no store connected' });

    if (q.list) {
      const limit = Math.max(1, Math.min(200, +q.limit || 40));
      const out = []; let cursor;
      do { // newest first: the names start with a count-down of the time
        const r = await blob.list({ prefix: PREFIX, limit: 1000, cursor, token: TOKEN });
        for (const b of r.blobs) if ((!q.kind || b.pathname.includes('-' + q.kind + '-')) && (!q.after || b.pathname < q.after)) out.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
        cursor = r.hasMore ? r.cursor : null;
      } while (cursor && out.length < limit);
      return json(res, 200, out.slice(0, limit));
    }
    if (q.get || q.shot) {
      const p = String(q.get || q.shot);
      if (!p.startsWith(PREFIX)) return json(res, 400, { error: 'bad pathname' });
      const r = await readJson(p);
      if (!r) return json(res, 404, { error: 'not found' });
      if (q.get) return json(res, 200, r);
      const m = /^data:image\/jpeg;base64,(.+)$/.exec(r.shot || '');
      if (!m) return json(res, 404, { error: 'no picture' });
      res.statusCode = 200; res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'no-store');
      return res.end(Buffer.from(m[1], 'base64'));
    }
    if (q.say) {
      const notes = ((await readJson(INBOX).catch(() => null)) || []).slice(-19);
      notes.push({ t: Date.now(), text: String(q.say).slice(0, 400) });
      await blob.put(INBOX, JSON.stringify(notes), { access: 'private', token: TOKEN, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      return json(res, 200, { ok: true, notes: notes.length });
    }
    if (q.prune) {
      const before = Date.now() - Math.max(1, +q.prune) * 86400e3, gone = []; let cursor;
      do {
        const r = await blob.list({ prefix: PREFIX, limit: 1000, cursor, token: TOKEN });
        for (const b of r.blobs) if (new Date(b.uploadedAt).getTime() < before) gone.push(b.pathname);
        cursor = r.hasMore ? r.cursor : null;
      } while (cursor);
      for (let i = 0; i < gone.length; i += 100) await blob.del(gone.slice(i, i + 100), { token: TOKEN });
      return json(res, 200, { deleted: gone.length });
    }
    return json(res, 400, { error: 'nothing asked' });
  } catch (e) {
    console.error('SBWATCH failure', e);
    return json(res, 500, { error: String(e && e.message || e) });
  }
};
