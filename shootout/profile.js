// Shootout — your record on this phone: stats, unlocked skins, your guns
// (Loadout) and the character you last played.
// Everything is kept in this browser. The scoreboard (scores.js) copies the
// headline numbers to the shared board.

const Profile = (() => {
  const KEY = 'shootout.profile';
  const blank = () => ({
    games: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0,
    kills: 0, rKills: 0, sKills: 0, grenades: 0, nukes: 0, heals: 0, blocks: 0, bloodyWins: 0,
    cards: {},                                   // card id -> times dealt to you
    loadout: { char: null, rgun: 'colt', sgun: 'coach', rskin: 'standard', sskin: 'standard' },
  });

  let data = blank();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') data = Object.assign(blank(), saved, { loadout: Object.assign(blank().loadout, saved.loadout) });
  } catch (e) { /* private mode or bad data: start fresh */ }

  const listeners = [];
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  const value = stat => (stat ? data[stat] || 0 : 0);
  const unlocked = (kind, id) => { const s = SKIN_BY_ID[kind][id]; return !!s && (!s.stat || value(s.stat) >= s.n); };

  // Skins that a game result just unlocked: [{ kind, skin }]
  function newUnlocks(before) {
    const out = [];
    ['revolver', 'shotgun'].forEach(kind => SKINS[kind].forEach(s => {
      if (s.stat && (before[s.stat] || 0) < s.n && value(s.stat) >= s.n) out.push({ kind, skin: s });
    }));
    return out;
  }

  // Add one finished game. `r` = { win, mode, st: { kills, rKills, sKills,
  // grenades, nukes, heals, blocks, cards } } (counts from that game).
  function record(r) {
    const before = Object.assign({}, data);
    const st = r.st || {};
    data.games++;
    if (r.win) { data.wins++; data.streak++; data.bestStreak = Math.max(data.bestStreak, data.streak); }
    else { data.losses++; data.streak = 0; }
    if (r.win && r.mode === 'bloody') data.bloodyWins++;
    ['kills', 'rKills', 'sKills', 'grenades', 'nukes', 'heals', 'blocks'].forEach(k => { data[k] += Math.max(0, Math.min(99, st[k] | 0)); });
    Object.entries(st.cards || {}).forEach(([id, k]) => { if (CARD_BY_ID[id]) data.cards[id] = (data.cards[id] || 0) + Math.max(0, Math.min(99, k | 0)); });
    save();
    return newUnlocks(before);
  }

  // The card you've been dealt most often.
  function topCard() {
    let best = null, k = 0;
    Object.entries(data.cards).forEach(([id, c]) => { if (c > k && CARD_BY_ID[id]) { best = id; k = c; } });
    return best;
  }

  function setLoadout(patch) {
    Object.assign(data.loadout, patch);
    if (!unlocked('revolver', data.loadout.rskin)) data.loadout.rskin = 'standard';
    if (!unlocked('shotgun', data.loadout.sskin)) data.loadout.sskin = 'standard';
    if (data.loadout.char && !CHARACTER_BY_ID[data.loadout.char]) data.loadout.char = null;
    if (!GUN_BY_ID.revolver[data.loadout.rgun]) data.loadout.rgun = 'colt';
    if (!GUN_BY_ID.shotgun[data.loadout.sgun]) data.loadout.sgun = 'coach';
    save();
  }

  // The loadout as it can be used right now (locked skins fall back).
  function loadout() {
    const l = data.loadout;
    return {
      char: CHARACTER_BY_ID[l.char] ? l.char : null,
      rgun: GUN_BY_ID.revolver[l.rgun] ? l.rgun : 'colt',
      sgun: GUN_BY_ID.shotgun[l.sgun] ? l.sgun : 'coach',
      rskin: unlocked('revolver', l.rskin) ? l.rskin : 'standard',
      sskin: unlocked('shotgun', l.sskin) ? l.sskin : 'standard',
    };
  }

  return {
    record, unlocked, value, topCard, setLoadout, loadout,
    onChange(fn) { listeners.push(fn); },
    get stats() { return data; },
  };
})();
