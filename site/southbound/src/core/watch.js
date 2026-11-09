// "Let Claude watch me play" (Settings > Display, or ?watch=1 once). Off unless the player turns it on.
//
// While it's on, the game sends the game's own server (api/sb-watch.js) what's happening:
//  - every error, straight away, with what you were doing and a picture of the moment
//  - every ~3 minutes of play: where you are, on foot or in which car, the police, health, money,
//    the weapon, the frame rate, what the game told you (its messages) and one small screenshot
//  - sooner when something happens worth seeing (you died, the police are after you, a crash)
// Claude reads them back with a key, to see what went wrong, spot what looks off and fix it, and
// can leave you a note, which shows up in the game ("Claude: ...").
// When it's off nothing is sent; the error box still offers "Send to Claude" for that one error.
// Test browsers (navigator.webdriver) never send anything.
const API = '/api/sb-watch';
const PUBLIC = 'https://untitled-new-game-project.vercel.app';
const EVERY = 180;      // seconds of play between reports
const SAMPLE = 10;      // seconds between state samples inside a report
const SOON = 45;        // a highlight (death, chase) gets its report no sooner than this after the last one

export function installWatch({ settings, saveSettings, getState, hud, automated }) {
  const base = /\.vercel\.app$/.test(location.hostname) ? '' : PUBLIC; // the desktop app and local copies post to the site
  const session = Math.random().toString(36).slice(2, 10);
  const t0 = Date.now();
  let samples = [], events = [], lastError = null, sentErr = new Map();
  let playT = 0, sampleT = 0, sinceReport = 0, highlight = null, shotWanted = null, inboxT = 5, inboxSince = Date.now() - 6 * 3600e3;
  let prev = {};
  const on = () => !!settings.claudeWatch && !automated;
  try { if (/[?&]watch=1\b/.test(location.search) && !settings.claudeWatch) { settings.claudeWatch = true; saveSettings(settings); } } catch (e) { /* */ }

  const now = () => +((Date.now() - t0) / 1000).toFixed(1);
  const event = (kind, text) => { events.push({ t: now(), kind, text: String(text).slice(0, 240) }); if (events.length > 80) events.shift(); };
  const state = () => { try { return getState(); } catch (e) { return { stateError: String(e && e.message) }; } };

  // what the game tells you (toasts) goes into the timeline
  const toast = hud.toast.bind(hud);
  hud.toast = (msg, secs) => { if (msg) event('message', msg); return toast(msg, secs); };

  // a picture of the frame: copied right after it's drawn (the drawing buffer is only valid then),
  // shrunk and turned into a JPEG off the main thread, so taking one never holds up a frame
  function grab(src) {
    const want = shotWanted; shotWanted = null;
    if (!want) return;
    const w = 640, h = Math.max(1, Math.round(640 * src.height / Math.max(1, src.width)));
    let copy;
    try { copy = createImageBitmap(src, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }); } catch (e) { want(null); return; }
    copy.then((bmp) => {
      const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
      return c.convertToBlob ? c.convertToBlob({ type: 'image/jpeg', quality: 0.62 }) : new Promise((r) => c.toBlob(r, 'image/jpeg', 0.62));
    }).then((b) => (b ? new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(b); }) : null))
      .then((url) => want(url), () => want(null));
  }
  // the next frame's picture (or null if none comes within a few seconds)
  const shot = () => new Promise((res) => {
    let done = false; const finish = (v) => { if (!done) { done = true; res(v); } };
    shotWanted = finish;
    setTimeout(() => { if (shotWanted === finish) shotWanted = null; finish(null); }, 6000);
  });

  async function send(report, withShot = true) {
    if (withShot) report.shot = await shot();
    try {
      const r = await fetch(base + API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
      return r.ok;
    } catch (e) { return false; }
  }
  const header = (kind) => ({ game: 'southbound', kind, session, at: new Date().toISOString(), played: now(), page: location.pathname, ua: navigator.userAgent.slice(0, 160), screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}` });

  function report(why) {
    const r = { ...header('play'), why, state: state(), samples, events };
    samples = []; events = []; sinceReport = 0; highlight = null;
    send(r);
  }

  // errors: remembered always, sent when watching (the same message at most once a minute)
  function noteError(msg, stack, source) {
    const m = String(msg || 'error').slice(0, 400);
    lastError = { msg: m, stack: String(stack || '').slice(0, 4000), source, at: new Date().toISOString(), state: state(), events: events.slice(-30) };
    event('error', m);
    if (!on()) return;
    const last = sentErr.get(m) || 0;
    if (Date.now() - last < 60000) return;
    sentErr.set(m, Date.now());
    sendError();
  }
  function sendError(err = lastError) {
    if (!err || automated) return Promise.resolve(false);
    return send({ ...header('error'), error: { msg: err.msg, stack: err.stack, source: err.source }, state: err.state, events: err.events, samples: samples.slice(-6) });
  }
  addEventListener('error', (e) => noteError(e.message, e.error?.stack, 'error'));
  addEventListener('unhandledrejection', (e) => noteError(e.reason?.message || e.reason, e.reason?.stack, 'promise'));
  const cerr = console.error.bind(console);
  console.error = (...args) => { try { const e = args.find((a) => a instanceof Error); noteError(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : '')).join(' ').trim(), e?.stack, 'console'); } catch (x) { /* */ } return cerr(...args); };

  // notes from Claude: a card at the top of the screen
  let card = null;
  function showNote(text) {
    if (!card) {
      card = document.createElement('div');
      card.id = 'claude-note';
      card.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:60;max-width:min(560px,92vw);padding:10px 14px;border-radius:12px;background:rgba(20,22,26,.88);color:#f1ece4;font:14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);border:1px solid rgba(217,119,87,.55);opacity:0;transition:opacity .4s;pointer-events:none';
      document.body.appendChild(card);
    }
    card.innerHTML = '<b style="color:#e3926f">Claude</b> &nbsp;' + String(text).replace(/</g, '&lt;');
    card.style.opacity = '1';
    clearTimeout(card._t); card._t = setTimeout(() => { card.style.opacity = '0'; }, Math.min(16000, 5000 + text.length * 60));
    event('claude', text);
  }
  async function checkInbox() {
    try {
      const r = await fetch(base + API + '?inbox=1&since=' + inboxSince, { cache: 'no-store' });
      if (!r.ok) return;
      const notes = await r.json();
      for (const n of notes || []) { if (n.t > inboxSince) { inboxSince = n.t; showNote(n.text); } }
    } catch (e) { /* offline */ }
  }

  return {
    get on() { return on(); },
    session,
    grab,
    get wantsShot() { return !!shotWanted; },
    get lastError() { return lastError; },
    snapshot: state,   // what a report says about right now
    capture: shot,     // a picture of the next frame drawn (a data URL, or null)
    sendError,
    event,
    // called every frame with the real time step
    update(dt, paused) {
      if (!on() || document.hidden) return;
      if ((inboxT -= dt) <= 0) { inboxT = 90; checkInbox(); }
      if (paused) return;
      playT += dt; sinceReport += dt;
      if ((sampleT -= dt) <= 0) {
        sampleT = SAMPLE;
        const s = state(); s.t = now(); samples.push(s); if (samples.length > 40) samples.shift();
        // things worth a look, noticed by comparing with the last sample
        if (s.mode !== prev.mode) event('mode', `${prev.mode || 'start'} -> ${s.mode}${s.vehicle ? ' (' + s.vehicle + ')' : ''}`);
        if (s.region !== prev.region && prev.region) event('place', `${prev.region} -> ${s.region}`);
        if ((s.wanted || 0) !== (prev.wanted || 0)) { event('police', `wanted ${prev.wanted || 0} -> ${s.wanted || 0}`); if ((s.wanted || 0) >= 2 && (s.wanted || 0) > (prev.wanted || 0)) highlight = highlight || 'police chase'; }
        if (s.dead && !prev.dead) { event('death', 'you died'); highlight = 'died'; }
        if (s.cutscene !== !!prev.cutscene && (s.cutscene || prev.cutscene)) event('cutscene', s.cutscene ? 'a scene started' : 'the scene ended');
        if (s.fps < 20 && prev.fps >= 20) event('perf', `frame rate fell to ${s.fps}`);
        prev = s;
      }
      if (sinceReport >= EVERY || (highlight && sinceReport >= SOON)) report(highlight || 'every few minutes');
    },
    // the tab is closing: what's left, without a picture (sendBeacon has a size limit)
    flush() {
      if (!on() || (!samples.length && !events.length)) return;
      try { navigator.sendBeacon(base + API, new Blob([JSON.stringify({ ...header('play'), why: 'left the game', state: state(), samples, events })], { type: 'application/json' })); } catch (e) { /* */ }
    },
  };
}
