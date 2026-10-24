// Shootout — the shared scoreboard.
// One row per player ID in the artifact's database (`scores/<player ID>`):
// name, wins, losses, games, kills and the card they've been dealt most.
// Each phone keeps its own record (profile.js) and posts it here. People
// who may not write to the board (the share menu's Viewers) still show up:
// their record rides along in the lobby, and anyone online who can write
// posts it for them.

const Scores = (() => {
  let db = null;
  let canWrite = null;      // null = not told yet; a refused write decides
  let rows = [];
  let ready = false;
  const listeners = [];
  const fire = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  const int = v => (Number.isFinite(v) ? Math.max(0, Math.min(1e6, Math.floor(v))) : 0);

  // Your headline record (also what goes into the lobby).
  function mine() {
    const s = Profile.stats;
    return { w: s.wins, l: s.losses, g: s.games, k: s.kills, top: Profile.topCard() };
  }

  // A row from someone's record; null if it doesn't add up.
  function row(pid, name, st) {
    if (!/^[A-Z0-9]{6}$/.test(pid) || !st) return null;
    const r = { pid, nm: String(name || 'Someone').slice(0, 20), w: int(st.w), l: int(st.l), g: int(st.g), k: int(st.k), top: CARD_BY_ID[st.top] ? st.top : null };
    if (r.g < 1 || r.w + r.l > r.g) return null;
    return r;
  }

  async function init() {
    Net.setStats(mine());
    if (!window.claude || typeof window.claude.use !== 'function') { ready = true; fire(); return; }
    try { db = await window.claude.use('db'); } catch (e) { db = null; }
    try {
      const user = await window.claude.use('user');
      if (user) { const c = await user.can('data.write'); canWrite = c == null ? null : !!c; }
    } catch (e) { /* not told */ }
    ready = true;
    if (!db) { fire(); return; }
    db.collection('scores').orderBy('w', 'desc').limit(300).onSnapshot(snap => {
      rows = snap.docs.map(d => d.data()).filter(Boolean);
      fire();
      relay();
    }, () => { db = null; fire(); });
    Net.on('lobby', relay);
    push();
  }

  // Writes go out one at a time.
  let chain = Promise.resolve();
  const sent = {};
  function write(r) {
    if (!db || canWrite === false) return;
    const old = sent[r.pid] || rows.find(x => x.pid === r.pid);
    if (old && old.g >= r.g && old.nm === r.nm) return;      // already up to date
    if (old && old.g > r.g) return;                          // never move a record backwards
    sent[r.pid] = r;
    chain = chain.then(() => db.doc('scores/' + r.pid).set(Object.assign({}, r, { t: Date.now() }))).catch(e => {
      if (e && e.code === 'invalid_argument') canWrite = false;
    });
  }

  // After a game (and on start): post your own record.
  function push() {
    const st = mine();
    Net.setStats(st);
    const r = row(Net.pid, Net.name, st);
    if (r) write(r);
  }

  // Post the records of people online who can't write themselves.
  function relay() {
    if (!db || canWrite === false) return;
    Net.lobbyStats().forEach(({ pid, name, st }) => {
      const r = row(pid, name, st);
      if (r && pid !== Net.pid) write(r);
    });
  }

  return {
    init, push,
    onChange(fn) { listeners.push(fn); },
    get rows() { return rows; },
    get available() { return !!db; },
    get ready() { return ready; },
    get canWrite() { return canWrite; },
  };
})();
