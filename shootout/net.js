// Shootout — playing with friends online.
//
// Every phone gets a short player ID (shown in the top-right corner). Everyone
// with the game open shares a lobby through the claude.ai room: there you can
// see who is online and invite them by ID. Accepting an invite puts you in the
// inviter's party, a private named room. When the host starts a game, the
// host's phone runs the game (bots included) and the others mirror it.
//
// Everything travels as `presence` (each phone's own small state object),
// which every viewer may set, so friends only need to be able to open the
// game. The host publishes the recent game events plus a snapshot; the others
// publish their answers ("play card 2", "shoot Dutch") with a sequence number.

const Net = (() => {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const randomId = n => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

  const pid = store.get('shootout.pid') || randomId(6);
  store.set('shootout.pid', pid);
  let name = store.get('shootout.name') || 'Outlaw ' + pid.slice(0, 3);
  let gear = {};            // { ch, rs, ss }: character and skins, shown to the party
  let stats = null;         // headline record for the scoreboard

  let room = null;          // the lobby everyone shares
  let party = null;         // { code, host, room, isHost }
  let outgoing = [];        // invites I have sent: [{ to, code, t }]
  const seen = new Set();   // invites already shown
  const handlers = {};
  const on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); };
  const fire = (evt, ...args) => (handlers[evt] || []).forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } });

  // ---------- lobby ----------

  async function init() {
    if (!window.claude || typeof window.claude.use !== 'function') return null;
    try { room = await window.claude.use('room'); } catch (e) { room = null; }
    if (!room) { fire('status'); return null; }
    room.presence({ pid, nm: name, party: null, invs: [], st: stats }).catch(() => {});
    room.onPeers(onLobby, () => { room = null; fire('status'); });
    fire('status');
    return room;
  }

  function onLobby() {
    for (const p of room.peers()) {
      if (p.isMe) continue;
      const pr = p.presence || {};
      for (const inv of Array.isArray(pr.invs) ? pr.invs : []) {
        if (!inv || inv.to !== pid || typeof inv.code !== 'string') continue;
        const key = pr.pid + ':' + inv.code + ':' + inv.t;
        if (seen.has(key)) continue;
        seen.add(key);
        if (party && party.code === inv.code) continue;
        fire('invite', { from: String(pr.pid || ''), name: String(pr.nm || 'Someone').slice(0, 24), code: inv.code });
      }
    }
    fire('lobby');
  }

  // Everyone else online right now (one entry per player ID).
  function online() {
    if (!room) return [];
    const out = new Map();
    for (const p of room.peers()) {
      const pr = p.presence || {};
      if (p.isMe || !pr.pid || pr.pid === pid) continue;
      out.set(pr.pid, { pid: String(pr.pid), name: String(pr.nm || 'Someone').slice(0, 24), party: pr.party || null });
    }
    return [...out.values()];
  }

  function setName(n) {
    name = (n || '').trim().slice(0, 20) || name;
    store.set('shootout.name', name);
    if (room) room.presence({ nm: name }).catch(() => {});
    if (party) party.room.presence({ nm: name }).catch(() => {});
    fire('party');
  }

  // Your character and skins, so the party can see who is taken.
  function setGear(l) {
    gear = { ch: l.char || null, rs: l.rskin || 'standard', ss: l.sskin || 'standard' };
    if (party) party.room.presence(gear).catch(() => {});
  }

  // Your record, so anyone who can write the scoreboard can post it.
  function setStats(st) {
    stats = st;
    if (room) room.presence({ st }).catch(() => {});
  }

  // Everyone online's record: [{ pid, name, st }]
  function lobbyStats() {
    if (!room) return [];
    return room.peers().map(p => p.presence || {}).filter(pr => pr.pid && pr.st && typeof pr.st === 'object')
      .map(pr => ({ pid: String(pr.pid), name: String(pr.nm || 'Someone').slice(0, 24), st: pr.st }));
  }

  // ---------- party ----------

  async function joinParty(code, host) {
    if (party && party.code === code) return;
    await leaveParty(true);
    const r = await room.join('sh-' + code.toLowerCase());
    party = { code, host, room: r, isHost: host === pid, lastAct: {}, lastG: null, hostSeen: false, peerPid: {} };
    r.presence(Object.assign({ pid, nm: name, host: party.isHost ? 1 : 0 }, gear)).catch(() => {});
    r.onPeers(onParty, () => { party = null; fire('party'); });
    room.presence({ party: code }).catch(() => {});
    fire('party');
  }

  async function leaveParty(quiet) {
    if (!party) return;
    const r = party.room;
    party = null;
    outgoing = [];
    try { await r.leave(); } catch (e) { /* already gone */ }
    if (room) room.presence({ party: null, invs: [] }).catch(() => {});
    if (!quiet) fire('party');
  }

  async function invite(to) {
    to = (to || '').trim().toUpperCase();
    if (!room) throw new Error('offline');
    if (!/^[A-Z0-9]{6}$/.test(to)) throw new Error('bad-id');
    if (to === pid) throw new Error('self');
    if (!party) await joinParty(randomId(6), pid);
    if (!party.isHost) throw new Error('not-host');
    outgoing = outgoing.filter(i => i.to !== to).concat({ to, code: party.code, t: Date.now() }).slice(-6);
    await room.presence({ invs: outgoing });
  }

  const accept = inv => joinParty(inv.code, inv.from);

  // Party members, host first: [{ pid, name, host, peer }]
  function members() {
    if (!party) return [];
    const out = new Map();
    for (const p of party.room.peers()) {
      const pr = p.presence || {};
      if (!pr.pid) continue;
      const id = k => (typeof pr[k] === 'string' ? pr[k].slice(0, 16) : null);
      out.set(pr.pid, { pid: String(pr.pid), name: String(pr.nm || 'Someone').slice(0, 24), host: pr.pid === party.host, peer: p.peer, me: pr.pid === pid,
        char: id('ch'), rskin: id('rs'), sskin: id('ss') });
    }
    return [...out.values()].sort((a, b) => (b.host - a.host) || a.name.localeCompare(b.name));
  }

  function onParty(change) {
    if (!party) return;
    const peers = party.room.peers();
    // remember whose phone each peer is, so a departure can be named even
    // when the leaving peer's presence is already gone
    peers.forEach(p => { const id = (p.presence || {}).pid; if (id) party.peerPid[p.peer] = String(id); });
    const hostPeer = peers.find(p => (p.presence || {}).pid === party.host);
    if (hostPeer) party.hostSeen = true;
    else if (!party.isHost && party.hostSeen) fire('hostLeft');
    change.left.forEach(p => {
      const id = (p.presence || {}).pid || party.peerPid[p.peer];
      delete party.peerPid[p.peer];
      if (id && id !== pid && !peers.some(q => (q.presence || {}).pid === id)) fire('memberLeft', id);
    });
    // host: read answers from the others
    if (party.isHost) {
      for (const p of peers) {
        const pr = p.presence || {};
        const a = pr.act;
        if (!pr.pid || pr.pid === pid || !a || typeof a.s !== 'number') continue;
        if (a.s <= (party.lastAct[pr.pid] || 0)) continue;
        party.lastAct[pr.pid] = a.s;
        fire('act', String(pr.pid), a);
      }
    } else if (hostPeer) {
      const g = hostPeer.presence.g || null;
      if (g !== party.lastG) { party.lastG = g; fire('game', g); }
    }
    fire('party');
  }

  // ---------- game transport ----------

  // Host side: append an event and publish the recent ones with a snapshot.
  let hostLog = null;
  function hostStart(gid) { hostLog = { gid, n: 0, events: [] }; }
  function hostSend(ev, snap) {
    if (!party || !party.isHost || !hostLog) return;
    hostLog.n++;
    ev.n = hostLog.n;
    hostLog.events.push(ev);
    if (hostLog.events.length > 40) hostLog.events.shift();
    snap.n = hostLog.n;
    // keep as many recent events as fit in the presence budget
    let k = hostLog.events.length, g;
    do {
      g = { id: hostLog.gid, ev: hostLog.events.slice(-k), s: snap };
      k--;
    } while (JSON.stringify(g).length > 3700 && k > 0);
    party.room.presence({ g }).catch(e => console.warn('presence', e && e.message));
  }
  function hostStop() { hostLog = null; if (party) party.room.presence({ g: null }).catch(() => {}); }

  // Others: answer the host.
  let actSeq = 0;
  function sendAct(act) {
    if (!party) return;
    actSeq++;
    party.room.presence({ act: Object.assign({ s: actSeq }, act) }).catch(() => {});
  }

  return {
    init, on, online, setName, setGear, setStats, lobbyStats, invite, accept, leaveParty, members, hostStart, hostSend, hostStop, sendAct,
    get pid() { return pid; },
    get name() { return name; },
    get available() { return !!room; },
    get party() { return party; },
  };
})();
