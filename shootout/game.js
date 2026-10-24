// Shootout — screens, menus and the rules of the table.
//
// Every seat at the table is played by someone: you ('local'), a friend on
// this same phone (also 'local', taking turns), a friend on another phone
// ('remote', online) or a bot. One phone runs the game (the host); it asks
// each seat for its decisions, plays the animations and, when friends are
// online, broadcasts every animation and message so their phones replay them.

const MODES = {
  solo:   { label: 'Solo',        seats: 2 },
  duos:   { label: 'Duos',        seats: 2 },
  trios:  { label: 'Trios',       seats: 3 },
  bloody: { label: 'Bloody Mary', seats: 4 },
  ffa:    { label: 'Free-for-all', seats: 6, ffa: true },   // 3 to 10 seats, picked on the mode screen
};
const FFA_MIN = 3, FFA_MAX = 10;

// Round at which the room is fully wrecked and the music is at full dread.
const MAX_DREAD_ROUND = 8;

// Each revolver holds 6 chambers with a random mix of live rounds and blanks
// (always at least one of each). It reloads with a fresh random mix when empty.
const CHAMBERS = 6;

// The shotgun from a Gun card: two shells, both live, gone after the round.
const SHOTGUN_SHELLS = 2;

// Everyone starts with one life (one red mark). A revolver hit leaves you
// bleeding; if nobody bandages you by the end of the next round you lose a
// life. Losing your last life kills you.
const START_LIVES = 1;

const state = {
  modeId: null,
  mode: null,
  round: 1,
  players: [],
  over: true,
  multi: false,     // more than one person playing (same phone or online)
  online: null,     // 'host' | 'client' | null
  view: 0,          // whose seat this phone's camera sits in
  selected: -1,
  covered: false,
  busy: false,
  box: null,        // { owner, items } while an unopened box sits on the table
  pile: [],         // recently played card ids
  config: null,     // how the current game was started (for Play again)
};

const $ = sel => document.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const alive = () => state.players.filter(p => p.alive);
const idx = p => state.players.indexOf(p);
const viewer = () => state.players[state.view];
const teammateOf = p => (p && p.team ? p.team.members.find(m => m !== p && m.alive) : null);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Text: "You" in a one-player game, names whenever several people play.
const isYou = p => !state.multi && p.ctrl === 'local';
const N = p => (isYou(p) ? 'You' : esc(p.name));
const n = p => (isYou(p) ? 'you' : esc(p.name));
const V = (p, you, they) => (isYou(p) ? you : they);
const POSS = p => (isYou(p) ? 'your' : esc(p.name) + "'s");
const SELF = p => (isYou(p) ? 'yourself' : 'themself');

// ---------- screen switching with a fade ----------

const MENU_SCREENS = ['menu', 'mode', 'settings', 'scores'];

function showScreen(name, fade = true) {
  const go = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + name).classList.add('active');
    if (MENU_SCREENS.includes(name)) MenuStage.show();
    if (name === 'game' && !picker.open) Table.show();
    if (name === 'mode') renderWho();
    if (name === 'loadout') { shop.model = Profile.loadout()[shop.slot === 'revolver' ? 'rgun' : 'sgun']; renderLoadout(); }
    if (name === 'gunsmith') { shop.skin = Profile.loadout()[shop.gun === 'revolver' ? 'rskin' : 'sskin']; renderGunsmith(); }
    if (name === 'scores') renderScores();
  };
  if (!fade) { go(); return; }
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => { go(); f.classList.remove('on'); }, 800);
}

// ---------- boot ----------

window.addEventListener('DOMContentLoaded', () => {
  Engine.init($('#gl'));
  runLoadingStage(() => showScreen('menu'));
  $('#pid-chip').textContent = 'ID ' + Net.pid;

  // Browsers only allow sound after the first click/tap.
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  document.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      Sound.unlock();
      showScreen(btn.dataset.go);
    });
  });
  document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => pickTable(btn.dataset.mode)));
  document.querySelectorAll('[data-who]').forEach(btn => btn.addEventListener('click', () => { who.tab = btn.dataset.who; renderWho(); }));

  $('#btn-quit').addEventListener('click', quitGame);
  $('#btn-cover').addEventListener('click', toggleCover);
  $('#btn-again').addEventListener('click', playAgain);
  $('#btn-menu').addEventListener('click', () => { $('#game-over').classList.add('hidden'); quitGame(); });

  $('#set-music').addEventListener('input', e => Sound.setMusicVolume(e.target.value / 100));
  $('#set-sfx').addEventListener('input', e => Sound.setSfxVolume(e.target.value / 100));
  $('#set-blood').addEventListener('change', e => Table.setBlood(e.target.checked));
  $('#set-difficulty').addEventListener('change', e => Bots.setDifficulty(e.target.value));

  // same-phone players
  $('#hs-minus').addEventListener('click', () => { who.locals = Math.max(2, who.locals - 1); renderWho(); });
  $('#hs-plus').addEventListener('click', () => { who.locals = Math.min(FFA_MAX, who.locals + 1); renderWho(); });
  $('#ffa-minus').addEventListener('click', () => { MODES.ffa.seats = Math.max(FFA_MIN, MODES.ffa.seats - 1); renderWho(); });
  $('#ffa-plus').addEventListener('click', () => { MODES.ffa.seats = Math.min(FFA_MAX, MODES.ffa.seats + 1); renderWho(); });

  // friends
  $('#my-name').value = Net.name;
  $('#my-name').addEventListener('change', e => { Net.setName(e.target.value); e.target.value = Net.name; Scores.push(); });
  $('#invite-form').addEventListener('submit', async e => {
    e.preventDefault();
    const box = $('#invite-id');
    await sendInvite(box.value);
    box.value = '';
  });
  $('#btn-leave-party').addEventListener('click', () => Net.leaveParty());
  Net.on('lobby', renderWho);
  Net.on('party', () => { renderWho(); checkMissing(); });
  Net.on('status', renderWho);
  Net.on('invite', showInvite);
  Net.on('act', onRemoteAct);
  Net.on('memberLeft', onMemberLeft);
  Net.on('game', onHostGame);
  Net.on('hostLeft', onHostLeft);
  Net.setGear(Profile.loadout());
  Net.init().then(() => Scores.init());
  Scores.onChange(() => { if ($('#screen-scores').classList.contains('active')) renderScores(); });

  // Loadout and Gunsmith
  document.querySelectorAll('[data-gun]').forEach(b => b.addEventListener('click', () => {
    shop.gun = b.dataset.gun;
    shop.skin = Profile.loadout()[shop.gun === 'revolver' ? 'rskin' : 'sskin'];
    renderGunsmith();
  }));
  $('#btn-equip').addEventListener('click', () => {
    if (!Profile.unlocked(shop.gun, shop.skin)) return;
    Profile.setLoadout(shop.gun === 'revolver' ? { rskin: shop.skin } : { sskin: shop.skin });
    Net.setGear(Profile.loadout());
    Sound.cock && Sound.cock();
    renderGunsmith();
  });
  document.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => {
    shop.slot = b.dataset.slot;
    shop.model = Profile.loadout()[shop.slot === 'revolver' ? 'rgun' : 'sgun'];
    renderLoadout();
  }));
  $('#btn-equip-gun').addEventListener('click', () => {
    Profile.setLoadout(shop.slot === 'revolver' ? { rgun: shop.model } : { sgun: shop.model });
    Net.setGear(Profile.loadout());
    Sound.cock && Sound.cock();
    renderLoadout();
  });
  $('#pick-go').addEventListener('click', confirmPick);

  // Tap a card to pick it, tap it again (or drag it up onto the table) to play.
  Table.onCardClick = i => {
    if (state.covered || !turn) return;
    Sound.cardFlick();
    if (state.selected === i && turn.canPlay && !state.busy) playSelected();
    else selectCard(state.selected === i ? -1 : i);
  };
  Table.onCardDrop = i => {
    if (state.covered || !turn || !turn.canPlay || state.busy) return;
    state.selected = i;
    playSelected();
  };
  Table.onBoxClick = () => openMyBox();
  $('#curtain-go').addEventListener('click', () => { const r = curtainResolve; curtainResolve = null; $('#curtain').classList.add('hidden'); if (r) r(); });
});

// ---------- who is playing: bots, same phone, friends ----------

const who = { tab: 'bots', locals: 2, names: ['Player 1', 'Player 2', 'Player 3', 'Player 4'] };

function humansFor(mode) {
  const mine = Profile.loadout();
  if (who.tab === 'same') {
    const k = Math.min(who.locals, mode.seats);
    // the phone's owner (player 1) brings their Loadout guns and skins
    return Array.from({ length: k }, (_, i) => Object.assign({ name: (who.names[i] || '').trim() || 'Player ' + (i + 1), ctrl: 'local' },
      i === 0 ? mine : {}));
  }
  if (who.tab === 'friends' && Net.party && Net.party.isHost) {
    return Net.members().map(m => (m.me
      ? Object.assign({ name: m.name, ctrl: 'local', pid: m.pid }, mine)
      : { name: m.name, ctrl: 'remote', pid: m.pid, rgun: m.rgun, sgun: m.sgun, rskin: m.rskin, sskin: m.sskin }));
  }
  return [Object.assign({ name: who.tab === 'friends' ? Net.name : 'You', ctrl: 'local', pid: Net.pid }, mine)];
}

function renderWho() {
  const box = $('#who');
  if (!box) return;
  document.querySelectorAll('[data-who]').forEach(b => b.classList.toggle('on', b.dataset.who === who.tab));
  ['bots', 'same', 'friends'].forEach(t => $('#who-' + t).classList.toggle('hidden', who.tab !== t));
  // same phone: name boxes
  $('#hs-count').textContent = who.locals;
  const names = $('#hs-names');
  if (names.children.length !== who.locals) {
    names.innerHTML = '';
    for (let i = 0; i < who.locals; i++) {
      const row = document.createElement('div');
      row.className = 'hs-row';
      const inp = document.createElement('input');
      inp.id = 'hs-name-' + i; inp.maxLength = 16; inp.value = who.names[i]; inp.placeholder = 'Player ' + (i + 1);
      inp.setAttribute('aria-label', 'Name of player ' + (i + 1));
      inp.addEventListener('input', () => { who.names[i] = inp.value; });
      row.append(inp);
      names.appendChild(row);
    }
  }
  // friends
  $('#friends-offline').classList.toggle('hidden', Net.available);
  $('#friends-online').classList.toggle('hidden', !Net.available);
  $('#my-pid').textContent = Net.pid;
  const party = Net.party;
  const members = Net.members();
  $('#party-list').innerHTML = party
    ? members.map(m => `<li>${esc(m.name)} <small>${m.pid}${m.host ? ' · host' : ''}${m.me ? ' · you' : ''}</small></li>`).join('')
    : '<li class="muted">Invite a friend to start a party.</li>';
  $('#btn-leave-party').classList.toggle('hidden', !party);
  const others = Net.online();
  $('#online-list').innerHTML = others.length
    ? others.map(o => `<li>${esc(o.name)} <small>${o.pid}</small> <button type="button" data-invite="${o.pid}">Invite</button></li>`).join('')
    : '<li class="muted">Nobody else has the game open right now.</li>';
  $('#online-list').querySelectorAll('[data-invite]').forEach(b => b.addEventListener('click', () => sendInvite(b.dataset.invite)));
  const waiting = who.tab === 'friends' && party && !party.isHost;
  $('#party-note').textContent = !party ? '' : waiting
    ? `Waiting for ${members.find(m => m.host) ? members.find(m => m.host).name : 'the host'} to pick a table.`
    : 'Pick a table above to start the game with your party. Empty seats get bots.';
  $('#ffa-count').textContent = MODES.ffa.seats;
  // the green circles: how many bots each table would get
  document.querySelectorAll('[data-mode]').forEach(btn => {
    const mode = MODES[btn.dataset.mode];
    const humans = humansFor(mode).length;
    const bots = mode.seats - humans;
    btn.disabled = waiting || bots < 0 || (who.tab === 'friends' && !party && false);
    btn.querySelector('small').textContent = bots < 0 ? 'too many players' : humans > 1
      ? `${humans} players · ${bots} bot${bots === 1 ? '' : 's'}`
      : `vs ${bots} bot${bots === 1 ? '' : 's'}`;
  });
}

async function sendInvite(id) {
  const note = $('#invite-note');
  try {
    await Net.invite(id);
    note.textContent = `Invite sent to ${String(id).trim().toUpperCase()}.`;
  } catch (e) {
    note.textContent = {
      'bad-id': 'Player IDs are 6 letters and numbers, like K7Q2XD.',
      self: "That's your own ID.",
      'not-host': 'Only the party host can invite.',
      offline: 'Online play is not available here.',
    }[e.message] || 'Could not send the invite.';
  }
  renderWho();
}

let pendingInvite = null;
function showInvite(inv) {
  pendingInvite = inv;
  $('#invite-text').textContent = `${inv.name} (${inv.from}) invited you to their party.`;
  $('#invite-pop').classList.remove('hidden');
  Sound.chime && Sound.chime();
}
async function answerInvite(yes) {
  $('#invite-pop').classList.add('hidden');
  const inv = pendingInvite;
  pendingInvite = null;
  if (!yes || !inv) return;
  if (!state.over) quitGame();
  await Net.accept(inv);
  who.tab = 'friends';
  showScreen('mode');
}

function pickTable(modeId) {
  const mode = MODES[modeId];
  const humans = humansFor(mode);
  if (humans.length > mode.seats) return;
  if (who.tab === 'friends' && Net.party && !Net.party.isHost) return;
  const online = who.tab === 'friends' && Net.party && Net.party.isHost && humans.some(h => h.ctrl === 'remote');
  startGame({ modeId, humans, online });
}

// ---------- Loadout, Gunsmith and Scoreboard ----------

const shop = { gun: 'revolver', skin: 'standard', slot: 'revolver', model: 'colt' };

// Loadout: which revolver you carry and which big gun a Gun card gives you.
// Purely for looks: every gun in a slot shoots the same.
function renderLoadout() {
  document.querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('on', b.dataset.slot === shop.slot));
  const list = GUNS[shop.slot];
  const l = Profile.loadout();
  const equipped = shop.slot === 'revolver' ? l.rgun : l.sgun;
  if (!GUN_BY_ID[shop.slot][shop.model]) shop.model = list[0].id;
  $('#gun-list').innerHTML = list.map(gn => `<button type="button" class="tile gun${gn.id === shop.model ? ' on' : ''}${gn.id === equipped ? ' equipped' : ''}" data-model="${gn.id}"><b>${esc(gn.name)}</b></button>`).join('');
  $('#gun-list').querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => { shop.model = b.dataset.model; renderLoadout(); }));
  const gn = GUN_BY_ID[shop.slot][shop.model];
  $('#gun-info').innerHTML = `<h3>${esc(gn.name)}</h3><p>${esc(gn.blurb)}</p>` +
    `<small>${shop.slot === 'revolver' ? 'Your gun for every shootout.' : 'What a Gun card puts in your hands: 2 live shots, one hit kills.'} Looks only: it shoots exactly like the others.</small>`;
  const btn = $('#btn-equip-gun');
  btn.disabled = gn.id === equipped;
  btn.textContent = gn.id === equipped ? 'Equipped' : 'Equip';
  ShowcaseStage.show({ kind: shop.slot, model: gn.id, skin: shop.slot === 'revolver' ? l.rskin : l.sskin });
}

// A small painted badge for each character: hat silhouette over their colours.
const portraitCache = {};
function portrait(c) {
  if (!portraitCache[c.id]) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    const hex = v => '#' + (v || 0).toString(16).padStart(6, '0');
    const L = c.look;
    g.fillStyle = '#1a120c'; g.fillRect(0, 0, 96, 96);
    g.fillStyle = hex(L.coat); g.beginPath(); g.ellipse(48, 100, 40, 30, 0, 0, Math.PI * 2); g.fill();
    if (L.scarf) { g.fillStyle = hex(L.scarf); g.fillRect(36, 66, 24, 8); }
    g.fillStyle = hex(L.skin); g.beginPath(); g.ellipse(48, 52, 17, 21, 0, 0, Math.PI * 2); g.fill();
    if (L.facial === 'beard') { g.fillStyle = hex(L.facialColor); g.beginPath(); g.ellipse(48, 64, 15, 11, 0, 0, Math.PI); g.fill(); }
    if (L.facial === 'mustache' || L.facial === 'beard') { g.fillStyle = hex(L.facialColor); g.fillRect(40, 58, 16, 3); }
    if ((L.extras || []).includes('mask')) { g.fillStyle = '#9a1814'; g.beginPath(); g.moveTo(30, 54); g.lineTo(66, 54); g.lineTo(48, 74); g.fill(); }
    if ((L.extras || []).includes('eyepatch')) { g.fillStyle = '#000'; g.beginPath(); g.arc(54, 48, 4, 0, 7); g.fill(); }
    g.fillStyle = '#111'; g.fillRect(40, 47, 3, 3); if (!(L.extras || []).includes('eyepatch')) g.fillRect(53, 47, 3, 3);
    g.fillStyle = hex(L.hatColor);
    const hat = L.hat;
    if (hat === 'top' || hat === 'stovepipe') { g.fillRect(20, 33, 56, 4); g.fillRect(33, hat === 'stovepipe' ? 2 : 12, 30, hat === 'stovepipe' ? 32 : 22); }
    else if (hat === 'bowler') { g.fillRect(24, 33, 48, 4); g.beginPath(); g.arc(48, 34, 16, Math.PI, 0); g.fill(); }
    else if (hat === 'sombrero') { g.beginPath(); g.ellipse(48, 34, 46, 7, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(34, 34); g.lineTo(48, 6); g.lineTo(62, 34); g.fill(); }
    else if (hat === 'veil') { g.fillRect(14, 31, 68, 3); g.fillRect(36, 22, 24, 10); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(28, 34, 40, 26); }
    else if (hat === 'flat') { g.fillRect(16, 32, 64, 4); g.fillRect(34, 20, 28, 13); }
    else { g.beginPath(); g.moveTo(14, 34); g.quadraticCurveTo(48, 42, 82, 34); g.lineTo(82, 30); g.quadraticCurveTo(48, 36, 14, 30); g.fill(); g.beginPath(); g.moveTo(32, 32); g.lineTo(35, 12); g.quadraticCurveTo(48, 18, 61, 12); g.lineTo(64, 32); g.fill(); }
    portraitCache[c.id] = cv.toDataURL();
  }
  return `<img src="${portraitCache[c.id]}" alt="">`;
}

function renderGunsmith() {
  document.querySelectorAll('[data-gun]').forEach(b => b.classList.toggle('on', b.dataset.gun === shop.gun));
  const list = SKINS[shop.gun];
  const equipped = Profile.loadout()[shop.gun === 'revolver' ? 'rskin' : 'sskin'];
  if (!SKIN_BY_ID[shop.gun][shop.skin]) shop.skin = 'standard';
  $('#skin-list').innerHTML = list.map(sk => {
    const open = Profile.unlocked(shop.gun, sk.id);
    return `<button type="button" class="tile skin${sk.id === shop.skin ? ' on' : ''}${open ? '' : ' locked'}${sk.id === equipped ? ' equipped' : ''}" data-skin="${sk.id}">` +
      `<span class="swatch sw-${sk.id}"></span><b>${esc(sk.name)}</b>${open ? '' : '<i class="lock">LOCKED</i>'}</button>`;
  }).join('');
  $('#skin-list').querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', () => { shop.skin = b.dataset.skin; renderGunsmith(); }));
  const sk = SKIN_BY_ID[shop.gun][shop.skin];
  const open = Profile.unlocked(shop.gun, sk.id);
  const have = Math.min(sk.n, Profile.value(sk.stat));
  $('#skin-info').innerHTML = `<h3>${esc(sk.name)} · ${shop.gun === 'revolver' ? 'Revolver' : 'Gun card'}</h3><p>${esc(sk.blurb)}</p>` +
    (open ? `<small class="ok">${sk.stat ? 'Unlocked: ' + esc(sk.goal) : esc(sk.goal)}</small>`
      : `<small>To unlock: <b>${esc(sk.goal)}</b></small><div class="bar"><i style="width:${(100 * have / sk.n).toFixed(0)}%"></i></div><small>${have} / ${sk.n}</small>`);
  const btn = $('#btn-equip');
  btn.disabled = !open || sk.id === equipped;
  btn.textContent = sk.id === equipped ? 'Equipped' : open ? 'Equip' : 'Locked';
  ShowcaseStage.show({ kind: shop.gun, model: Profile.loadout()[shop.gun === 'revolver' ? 'rgun' : 'sgun'], skin: sk.id });
}

function renderScores() {
  const s = Profile.stats;
  const ratio = (w, l) => (l ? (w / l).toFixed(2) : w ? w.toFixed(2) : '0.00');
  const pct = (w, g) => (g ? Math.round((100 * w) / g) + '%' : '–');
  const cardName = id => (CARD_BY_ID[id] ? CARD_BY_ID[id].name : '–');
  $('#my-record').innerHTML = `<b>${esc(Net.name)}</b> <small>${Net.pid}</small><br>` +
    `${s.wins} wins · ${s.losses} losses · W/L ${ratio(s.wins, s.losses)} · ${pct(s.wins, s.games)} · best streak ${s.bestStreak} · ${s.kills} kills` +
    `<br><small>Most dealt card: ${cardName(Profile.topCard())}</small>`;
  let rows = Scores.rows.slice();
  if (!rows.some(r => r.pid === Net.pid) && s.games) rows.push({ pid: Net.pid, nm: Net.name, w: s.wins, l: s.losses, g: s.games, top: Profile.topCard(), local: true });
  rows.sort((a, b) => (b.w - a.w) || ((b.w / Math.max(1, b.l)) - (a.w / Math.max(1, a.l))) || (b.g - a.g));
  $('#score-table tbody').innerHTML = rows.length ? rows.map((r, i) =>
    `<tr class="${r.pid === Net.pid ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.nm || 'Someone')} <small>${esc(r.pid)}</small></td><td>${r.w | 0}</td><td>${r.l | 0}</td>` +
    `<td>${ratio(r.w | 0, r.l | 0)}</td><td>${pct(r.w | 0, r.g | 0)}</td><td>${esc(cardName(r.top))}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">Nobody has finished a game yet.</td></tr>';
  $('#score-note').textContent = !Scores.ready ? 'Loading the scoreboard…'
    : !Scores.available ? 'The shared scoreboard works when the game is opened from its claude.ai link. Your own record is kept on this phone.'
    : Scores.canWrite === false ? "You can see the board but can't post to it from this account. Your record is posted whenever someone who can is online with you."
    : 'Everyone who has played. Same-phone games are not counted.';
}

// ---------- guns ----------

// A player's gun is the queue of rounds they will fire next. Each round is
// { live, known }; `known` is set once a 1, 2 or 3 card has revealed it.
function loadGun() {
  const live = 1 + Math.floor(Math.random() * (CHAMBERS - 1));   // 1..5 live rounds
  const chambers = Array.from({ length: CHAMBERS }, (_, i) => ({ live: i < live, known: false }));
  for (let i = chambers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chambers[i], chambers[j]] = [chambers[j], chambers[i]];
  }
  return chambers;
}

// Make sure at least `n` rounds are queued, reloading a fresh cylinder behind
// the current one when it is about to run dry.
function ensureRounds(player, k) {
  while (player.gun.length < k) player.gun.push(...loadGun());
}

// Pull the trigger: returns true for a live round, false for a blank.
function pullTrigger(player) {
  ensureRounds(player, 1);
  return player.gun.shift().live;
}

// Cards 1, 2 and 3: reveal whether that upcoming round is live or blank.
function peekRound(player, k) {
  ensureRounds(player, k);
  const round = player.gun[k - 1];
  round.known = true;
  return round.live;
}

// ---------- animations, messages and the online broadcast ----------

// How each Table call's arguments name players, so every phone can turn a
// player number into a seat around its own camera.
const ANIM = {
  deal: 'P_', play: 'P_', drawGuns: '', holsterGuns: '', aim: 'PP', shoot: 'PP_O', recover: 'PP_',
  peek: 'P__', bloodyMary: '', wound: 'P_', stopBleeding: 'P_', loseLife: 'P', bleedOut: 'P',
  setLives: 'P_', setTags: 'P_', spawnBox: 'P', openBox: 'P_', usePotion: 'P', useBandage: 'PP', smashGun: 'P',
  newGun: 'P', giveShotgun: 'P', removeShotgun: 'P', binoStart: 'PP', binoEnd: '', invite: 'PP', decline: '',
  formTeam: 'PP', transferCards: 'PP', setRavage: '_', raiseShield: 'P', lowerShield: 'P', setReverse: 'P_',
  grenade: 'PHL_', nuke: 'P', stealCard: 'PP__', placeDynamite: 'P_', explodeDynamite: 'P__', removeDynamite: 'P',
};
const seatOf = i => (i - state.view + state.players.length) % state.players.length;

function applyAnim(f, args) {
  const spec = ANIM[f] || '';
  const mapped = args.map((a, k) => {
    switch (spec[k]) {
      case 'P': return seatOf(a);
      case 'L': return a.map(seatOf);
      case 'H': return a.map(h => ({ s: seatOf(h.s), dead: h.dead }));
      case 'O': return Object.assign({}, a, a && a.victim != null ? { victim: seatOf(a.victim) } : {});
      default: return a;
    }
  });
  if (f === 'binoStart' && mapped[0] === 0) document.body.classList.add('binoculars');
  if (f === 'binoEnd') document.body.classList.remove('binoculars');
  return Table[f](...mapped);
}

// Host: send an event to friends' phones along with a fresh snapshot.
function bcast(ev) {
  if (state.online === 'host') Net.hostSend(ev, snapshot());
}

// Play an animation here (and on friends' phones).
function A(f, ...args) {
  bcast({ m: 'a', f, a: args });
  return applyAnim(f, args);
}

// Messages, banners, sounds (here and on friends' phones).
function ui(f, ...args) {
  bcast({ m: 'u', f, a: args });
  applyUi(f, args);
}

function applyUi(f, a) {
  switch (f) {
    case 'log': log(a[0]); break;
    case 'banner': showBanner(a[0]); break;
    case 'status': setStatus(a[0]); break;
    case 'flash': flash(); break;
    case 'snd': if (Sound[a[0]]) Sound[a[0]](); break;
    case 'round': state.round = a[0]; applyDread(); renderAll(); break;
    case 'whiteout': whiteout(); break;
    case 'end': showEnd(a[0], a[1], a[2]); break;
    case 'taken': pickerTaken(a[0]); break;
    case 'swap': swapView(a[0], a[1], a[2]); break;
    case 'chars': charactersPicked(); break;
  }
}

// ---------- snapshots (online sync and same-phone handoffs) ----------

function knownStr(p) {
  ensureRounds(p, 3);
  return p.gun.slice(0, 3).map(r => (r.known ? (r.live ? 'L' : 'B') : '?')).join('');
}

function teamsList() {
  const seen = new Set(), out = [];
  state.players.forEach(p => {
    if (!p.team || seen.has(p.team)) return;
    seen.add(p.team);
    if (p.team.members.every(m => m.alive)) out.push([idx(p.team.leader), idx(p.team.members.find(m => m !== p.team.leader))]);
  });
  return out;
}

function tagsOf(p) {
  const tags = [];
  if (p.bleeding) tags.push('BLEEDING');
  if (p.unarmed) tags.push('UNARMED');
  if (p.hasShotgun && p.shotgun > 0) tags.push('SHOTGUN');
  if (teammateOf(p)) tags.push('TEAM');
  if (p.dynamite) tags.push('DYNAMITE');
  return tags;
}

function snapshot() {
  return {
    r: state.round, m: state.modeId, mu: state.multi ? 1 : 0, ov: state.over ? 1 : 0,
    bx: state.box ? idx(state.box.owner) : null, pl: state.pile.slice(-6), tm: teamsList(),
    ps: state.players.map(p => ({
      nm: p.name, pid: p.pid || null, c: p.ctrl, sb: p.sub, pa: p.pal, ch: p.char, rg: p.rgun, sg: p.sgun, rs: p.rskin !== 'standard' ? p.rskin : undefined, ss: p.sskin !== 'standard' ? p.sskin : undefined, a: p.alive ? 1 : 0, l: p.lives, b: p.bleeding ? 1 : 0,
      h: p.hand, i: p.items, u: p.unarmed ? 1 : 0, sg: p.shotgun, hs: p.hasShotgun ? 1 : 0, bk: p.block ? 1 : 0, rv: p.reverse ? 1 : 0, dy: p.dynamite ? 1 : 0, k: knownStr(p),
    })),
  };
}

// A friend's phone keeps a copy of the players built from the host's snapshot.
function fromSnapshot(s) {
  state.round = s.r;
  state.modeId = s.m;
  state.mode = MODES[s.m];
  state.multi = !!s.mu;
  state.players = s.ps.map(d => ({
    name: d.nm, pid: d.pid, ctrl: d.c, sub: d.sb, pal: d.pa, char: d.ch, rgun: d.rg, sgun: d.sg, rskin: d.rs || 'standard', sskin: d.ss || 'standard', alive: !!d.a, lives: d.l, bleeding: !!d.b, hand: d.h || [], items: d.i || [],
    unarmed: !!d.u, shotgun: d.sg || 0, hasShotgun: !!d.hs, block: !!d.bk, reverse: !!d.rv, dynamite: d.dy ? { round: 0 } : null,
    gun: (d.k || '???').split('').map(c => ({ known: c !== '?', live: c === 'L' })), team: null,
  }));
  (s.tm || []).forEach(([li, mi]) => {
    const team = { members: [state.players[li], state.players[mi]], leader: state.players[li] };
    state.players[li].team = state.players[mi].team = team;
  });
  state.box = s.bx != null ? { owner: state.players[s.bx] } : null;
  state.pile = s.pl || [];
  const me = state.players.findIndex(p => p.pid === Net.pid);
  if (me >= 0) state.view = me;
}

// Rebuild the whole table as seen from `state.view`.
function rebuildTable() {
  const k = state.players.length;
  const order = Array.from({ length: k }, (_, i) => (state.view + i) % k);
  const seat = i => (i - state.view + k) % k;
  const tps = order.map(i => { const p = state.players[i]; return { name: p.name, sub: p.sub, pal: p.pal, char: p.char, rgun: p.rgun, sgun: p.sgun, rskin: p.rskin, sskin: p.sskin }; });
  Table.rebuild(tps, {
    ravage: dread(),
    seats: order.map(i => {
      const p = state.players[i];
      return { hand: p.hand, lives: p.lives, items: p.items, dead: !p.alive, bleeding: p.bleeding, unarmed: p.unarmed,
        shotgun: p.hasShotgun && p.shotgun > 0, block: p.block, reverse: p.reverse, dynamite: !!p.dynamite, tags: tagsOf(p) };
    }),
    teams: teamsList().map(([li, mi]) => [seat(li), seat(mi)]),
    pile: state.pile.slice(-6),
    box: state.box ? seat(idx(state.box.owner)) : null,
  });
  renderAll();
}

// ---------- stats for the scoreboard and Gunsmith ----------

// What each player did this game; added to their record when it ends.
const newTally = () => ({ kills: 0, rKills: 0, sKills: 0, grenades: 0, nukes: 0, heals: 0, blocks: 0, cards: {} });
function tally(p, key, k = 1) { if (p && p.st) p.st[key] += k; }
function dealt(p, ids) { if (p && p.st) ids.forEach(id => { p.st.cards[id] = (p.st.cards[id] || 0) + 1; }); }
function killedBy(killer, victim, how) {
  if (!killer || killer === victim) return;
  tally(killer, 'kills');
  if (how === 'revolver') tally(killer, 'rKills');
  if (how === 'shotgun') tally(killer, 'sKills');
}

// One result per person at the table (by player number), sent with the end.
function results(winners) {
  const out = {};
  state.players.forEach((p, i) => { if (p.ctrl !== 'bot' && p.st) out[i] = Object.assign({ win: winners.includes(p) ? 1 : 0 }, p.st); });
  return out;
}

// The big gun a Gun card hands this player (cosmetic; they all work the same).
const bigGun = p => (GUN_BY_ID.shotgun[p.sgun] || GUN_BY_ID.shotgun.coach).name;

// ---------- picking characters as the match loads ----------
// Everyone picks who they play as. Online, everyone picks at once and a
// character someone grabs gets a ✕ on the others' screens straight away;
// people sharing a phone pick one after another. Bots take what's left.

const PICK_SECONDS = 30;
async function pickCharacters(game) {
  const taken = [];
  const humans = state.players.filter(p => p.ctrl !== 'bot');
  const claim = (p, id) => { p.char = id; taken.push(id); ui('taken', taken.slice()); };
  const pickOne = async p => {
    for (let tries = 0; tries < 6; tries++) {
      if (game !== state.game) return;
      const title = state.multi ? `${p.name}: choose your outlaw` : 'Choose your outlaw';
      // a friend who never answers gets a random character
      const v = await Promise.race([ask(p, 'char', { title, taken: taken.slice() }), sleep((PICK_SECONDS + 15) * 1000).then(() => null)]);
      if (game !== state.game) return;
      if (CHARACTER_BY_ID[v] && !taken.includes(v)) { claim(p, v); return; }
      if (!CHARACTER_BY_ID[v]) break;
      // someone took it a moment earlier: ask again with the new ✕
    }
    claim(p, freeCharacters(taken)[0].id);
  };
  const locals = humans.filter(p => p.ctrl === 'local');
  await Promise.all([
    ...humans.filter(p => p.ctrl === 'remote').map(pickOne),
    (async () => { for (const p of locals) await pickOne(p); })(),
  ]);
  if (game !== state.game) return;
  // bots play the characters left over, with those characters' names
  const free = freeCharacters(taken);
  state.players.filter(p => p.ctrl === 'bot').forEach((b, k) => {
    const ch = free[k];
    Object.assign(b, { name: ch.short, personality: ch.personality, char: ch.id });
    b.sub = Bots.label(b);
  });
  humans.forEach(p => { p.char = p.char || freeCharacters(state.players.map(q => q.char))[0].id; p.sub = CHARACTER_BY_ID[p.char].short.toUpperCase() + ' · ' + p.sub.split(' · ').pop(); });
  if (locals.length === 1 && !state.multi) Profile.setLoadout({ char: locals[0].char });
  ui('chars');
}

// The picker on this phone.
const picker = { open: false, taken: [], sel: null, done: null, timer: null, left: 0 };
function openPicker(data, pref) {
  return new Promise(res => {
    if (picker.done) picker.done(null);
    picker.open = true;
    picker.done = res;
    picker.taken = data.taken || [];
    const free = CHARACTERS.filter(c => !picker.taken.includes(c.id));
    if (!free.length) { closePicker(); res(null); return; }
    picker.sel = [pref, picker.sel].find(id => CHARACTER_BY_ID[id] && !picker.taken.includes(id)) || free[0].id;
    $('#pick-title').textContent = data.title || 'Choose your outlaw';
    $('#char-pick').classList.remove('hidden');
    document.body.classList.add('picking');
    picker.left = PICK_SECONDS;
    clearInterval(picker.timer);
    picker.timer = setInterval(() => { picker.left--; if (picker.left <= 0) confirmPick(); else $('#pick-timer').textContent = `Picking for you in ${picker.left}s`; }, 1000);
    renderPicker();
  });
}

function renderPicker() {
  const ch = CHARACTER_BY_ID[picker.sel];
  $('#pick-grid').innerHTML = CHARACTERS.map(c => {
    const x = picker.taken.includes(c.id);
    return `<button type="button" class="tile${c.id === picker.sel ? ' on' : ''}${x ? ' taken' : ''}" data-pick="${c.id}" ${x ? 'disabled' : ''}
      aria-label="${esc(c.name)}${x ? ', taken' : ''}">${portrait(c)}<b>${esc(c.short)}</b>${x ? '<i class="x">✕</i>' : ''}</button>`;
  }).join('');
  $('#pick-grid').querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { picker.sel = b.dataset.pick; renderPicker(); }));
  $('#pick-info').innerHTML = `<h3>${esc(ch.name)}</h3><p>${esc(ch.blurb)}</p>`;
  $('#pick-go').textContent = 'Play as ' + ch.short;
  $('#pick-timer').textContent = `Picking for you in ${picker.left}s`;
  const l = Profile.loadout();
  ShowcaseStage.show({ kind: 'char', id: ch.id, rskin: l.rskin, rgun: l.rgun });
}

function confirmPick() {
  if (!picker.open) return;
  if (picker.taken.includes(picker.sel)) picker.sel = (CHARACTERS.find(c => !picker.taken.includes(c.id)) || {}).id;
  const done = picker.done, id = picker.sel;
  closePicker();
  Sound.cock && Sound.cock();
  if (done) done(id);
}

function closePicker() {
  const was = picker.open;
  picker.open = false;
  picker.done = null;
  clearInterval(picker.timer);
  $('#char-pick').classList.add('hidden');
  document.body.classList.remove('picking');
  if (was && $('#screen-game').classList.contains('active')) Table.show();
}

// Someone just took a character: put a ✕ on it here.
function pickerTaken(list) {
  picker.taken = Array.isArray(list) ? list : [];
  if (!picker.open) return;
  if (picker.taken.includes(picker.sel)) picker.sel = (CHARACTERS.find(c => !picker.taken.includes(c.id)) || {}).id;
  if (!picker.sel) return;
  renderPicker();
}

// Everyone has picked: sit them all down at the table.
function charactersPicked() {
  if (picker.done) { const d = picker.done; picker.done = null; d(null); }
  closePicker();
  if (state.online === 'client' && client.latest) {
    const view = state.view;
    fromSnapshot(client.latest);
    state.view = view; state.multi = true;
    state.players.forEach(p => { p.hand = []; });   // nothing is dealt yet: the deal animations add the cards
    state.pile = [];
  }
  rebuildTable();
  Table.show();
}

// ---------- starting a game ----------

function startGame(config) {
  Sound.unlock();
  state.game = (state.game || 0) + 1;   // lets a previous game's async steps bail out
  const game = state.game;
  state.config = config;
  state.modeId = config.modeId;
  state.mode = MODES[config.modeId];
  state.round = 1;
  state.over = false;
  state.covered = false;
  state.selected = -1;
  state.busy = false;
  state.box = null;
  state.pile = [];
  state.view = 0;
  state.multi = config.humans.length > 1;
  state.online = config.online ? 'host' : null;
  turn = null;
  pendingAsks.clear();
  resetHud();

  // Characters are picked as the match loads (pickCharacters); bots carry a
  // random pair of guns.
  const humans = config.humans.map(h => ({
    name: h.name, ctrl: h.ctrl, pid: h.pid || null, char: null,
    rgun: GUN_BY_ID.revolver[h.rgun] ? h.rgun : 'colt', sgun: GUN_BY_ID.shotgun[h.sgun] ? h.sgun : 'coach',
    rskin: h.rskin || 'standard', sskin: h.sskin || 'standard', sub: h.ctrl === 'remote' ? 'ONLINE' : (state.multi ? 'PLAYER' : 'YOU'),
  }));
  const bots = Bots.lineup(state.mode.seats - config.humans.length).map(b => Object.assign(b, {
    char: null, rgun: pick(GUNS.revolver).id, sgun: pick(GUNS.shotgun).id, rskin: 'standard', sskin: 'standard', ctrl: 'bot', sub: 'CHOOSING…',
  }));
  state.players = [...humans, ...bots];
  state.players.forEach((p, i) => Object.assign(p, {
    pal: i, alive: true, st: newTally(), hand: [], gun: loadGun(), lives: START_LIVES, bleeding: false, bleedUntil: 0,
    items: [], shotgun: 0, hasShotgun: false, unarmed: false, team: null, priority: null, shotBy: null,
    block: false, reverse: false, cause: '',
  }));

  if (state.online === 'host') Net.hostStart(Net.pid + '-' + Date.now().toString(36));
  rebuildTable();
  showScreen('game');
  setTimeout(() => {
    if (game !== state.game) return;
    Sound.startMusic();
    runGame(game).catch(e => console.error(e));
  }, 900);
}

function playAgain() {
  $('#game-over').classList.add('hidden');
  if (state.online === 'client') { showScreen('mode'); return; }
  const cfg = state.config;
  if (cfg && cfg.online) {
    const humans = humansFor(MODES[cfg.modeId]);
    startGame(Object.assign({}, cfg, { humans: humans.slice(0, MODES[cfg.modeId].seats), online: humans.length > 1 }));
  } else if (cfg) startGame(cfg);
}

function quitGame() {
  const wasClient = state.online === 'client';
  if (state.online === 'host') Net.hostStop();
  state.over = true;
  state.game = (state.game || 0) + 1;
  state.online = null;
  turn = null;
  Sound.stopMusic();
  hidePanel();
  $('#curtain').classList.add('hidden');
  document.body.classList.remove('bleeding', 'binoculars');
  $('#card-info').classList.add('hidden');
  if (wasClient) { client.gid = null; Net.leaveParty(); }
  showScreen('menu');
}

// ---------- the host's game loop ----------

async function runGame(game) {
  const live = () => game === state.game && !state.over;
  await pickCharacters(game);
  if (!live()) return;
  await sleep(600);
  ui('banner', 'ROUND 1');
  // deal round-robin, one card at a time
  const hands = state.players.map(() => dealHand());
  for (let k = 0; k < HAND_SIZE; k++) {
    for (let i = 0; i < state.players.length; i++) {
      if (!live()) return;
      state.players[i].hand.push(hands[i][k]);
      dealt(state.players[i], [hands[i][k]]);
      await A('deal', i, [hands[i][k]]);
    }
  }
  while (live()) {
    for (const p of state.players) {
      if (!live()) return;
      if (p.alive) await takeTurn(p);
    }
    if (!live()) return;
    if (!(await shootout('End of round ' + state.round)) || !live()) return;
    if (!(await endOfRound()) || !live()) return;
    ui('round', state.round + 1);
    ui('banner', 'ROUND ' + state.round);
    await sleep(1400);
    if (!live()) return;
    await maybeBox();
  }
}

// One seat's turn: refill an empty hand, then items and a card.
async function takeTurn(p) {
  const i = idx(p);
  const member = p.team && p.team.leader !== p && teammateOf(p);
  if (!p.hand.length && !member) {
    const ids = dealHand(teammateOf(p) ? HAND_SIZE * 2 : HAND_SIZE, p.luck || 0);
    if (ids.includes('nuclear')) p.luck = 0;   // the luck paid off
    p.hand.push(...ids);
    dealt(p, ids);
    await A('deal', i, ids);
  }
  if (p.ctrl === 'bot') return botTurn(p);
  ui('status', `${N(p)}${isYou(p) ? 'r turn' : "'s turn"}${member ? ' (your teammate plays the cards)' : ''}`);
  for (;;) {
    if (state.over || !p.alive) return;
    const act = await ask(p, 'turn', { canPlay: !member });
    if (act == null) { if (p.ctrl === 'bot') return botTurn(p); return; }
    if (act.k === 'box') { await openBox(p); continue; }
    if (act.k === 'item') {
      const target = act.t != null ? state.players[act.t] : p;
      if (p.items.includes(act.id) && target) await useItem(p, act.id, target);
      continue;
    }
    if (act.k === 'pass') return;
    if (act.k === 'play' && !member && p.hand[act.i] != null) { await teamPlay(p, act.i); return; }
  }
}

// A bot's turn: use items, then (unless its team leader plays for it) a card.
async function botTurn(bot) {
  ui('status', esc(bot.name) + ' is thinking…');
  await sleep(500);
  const danger = alive().some(p => p.shotgun > 0 && p !== bot);
  for (const act of Bots.chooseItems(bot, { alive: alive(), danger })) {
    if (!bot.alive || state.over) return;
    if (!bot.items.includes(act.item) || !act.target || !act.target.alive) continue;
    await useItem(bot, act.item, act.target);
  }
  if (!bot.alive || state.over) return;
  if (bot.team && bot.team.leader !== bot && teammateOf(bot)) return;   // the leader plays for the team
  if (!bot.hand.length) return;
  ui('status', esc(bot.name) + ' is choosing a card…');
  await sleep(500);
  bot.foes = alive().filter(p => p !== bot && p !== teammateOf(bot)).length;
  const oi = Bots.chooseCard(bot);
  if (teammateOf(bot)) ui('log', `${esc(bot.name)}'s team voted.`);
  await playCard(bot, oi);
}

// A person plays a card; a teammate votes on it first.
async function teamPlay(p, i) {
  const mate = teammateOf(p);
  let choice = i;
  if (mate) {
    const mine = CARD_BY_ID[p.hand[i]].name;
    let alt = i;
    if (mate.ctrl === 'bot') alt = Bots.vote(mate, p.hand, i);
    else {
      const others = [...new Set(p.hand.filter((c, k) => k !== i && c !== p.hand[i]))];
      const v = await ask(mate, 'choice', {
        title: 'TEAM VOTE', html: `${N(p)} wants to play <b>${mine}</b>.`,
        options: [{ label: 'Agree', v: -1 }, ...others.map(c => ({ label: `Vote for ${CARD_BY_ID[c].name}`, v: p.hand.indexOf(c) }))],
      });
      alt = v == null || v === -1 ? i : v;
    }
    if (alt === i) ui('log', `${esc(mate.name)} votes yes.`);
    else {
      const theirs = CARD_BY_ID[p.hand[alt]].name;
      const v = await ask(p, 'choice', {
        title: 'TEAM VOTE', html: `${esc(mate.name)} votes for <b>${theirs}</b>, ${n(p)} voted for <b>${mine}</b>. It's a tie.`,
        options: [{ label: 'Flip a coin', v: 'coin' }, { label: `Go with ${theirs}`, v: 'theirs' }],
      });
      if (v === 'theirs') choice = alt;
      else {
        const heads = Math.random() < 0.5;
        ui('banner', heads ? 'HEADS' : 'TAILS');
        ui('log', `Coin flip: ${heads ? `heads, ${n(p)} play${V(p, '', 's')} <b>${mine}</b>` : `tails, ${esc(mate.name)} wins the vote: <b>${theirs}</b>`}.`);
        if (!heads) choice = alt;
        await sleep(900);
      }
    }
  }
  await playCard(p, choice);
}

async function playCard(p, i) {
  const [id] = p.hand.splice(i, 1);
  state.pile.push(id);
  if (state.pile.length > 12) state.pile.shift();
  await A('play', idx(p), i);
  await resolveCard(p, id);
}

// Apply a played card's effect.
async function resolveCard(player, id) {
  const card = CARD_BY_ID[id];
  const pi = idx(player);
  const mate = teammateOf(player);
  ui('log', `${N(player)} played <b>${card.name}</b>.`);
  renderAll();

  if (card.nuke) {
    ui('banner', 'NUCLEAR');
    ui('log', `${N(player)} launched a <b class="live">nuclear bomb</b>.`);
    await A('nuke', pi);
    ui('whiteout');
    tally(player, 'nukes');
    state.players.forEach(p => { if (p !== player && p !== mate) { if (p.alive) killedBy(player, p, 'nuke'); p.alive = false; p.cause = 'Wiped out by a nuclear bomb.'; } });
    await sleep(1200);
    endGame([player, mate].filter(Boolean), `${N(player)} launched a nuclear bomb. Everyone else was wiped out.`);
    return;
  }
  if (card.grenade) {
    await throwGrenade(player);
    return;
  }
  if (card.shotgun) {
    player.shotgun = SHOTGUN_SHELLS;
    player.hasShotgun = true;
    await A('giveShotgun', pi);
    ui('log', `${N(player)} ${V(player, 'get', 'gets')} the <b>${bigGun(player)}</b> this round: 2 shots, both live.${player.unarmed ? ' (Unarmed, so it stays on the table.)' : ''}`);
    refreshTags(player);
  }
  if (card.block) {
    player.block = true;
    await A('raiseShield', pi);
    ui('log', `A steel shield rises in front of ${n(player)}. It stops the next hit this round.`);
  }
  if (card.reverse) {
    player.reverse = true;
    await A('setReverse', pi, true);
    ui('log', `${N(player)} ${V(player, 'are', 'is')} ringed in red: the next shot at ${isYou(player) ? 'you' : 'them'} this round goes back to the shooter.`);
  }
  if (card.peek) {
    const live = peekRound(player, card.peek);
    if (player.ctrl === 'bot') ui('status', `${esc(player.name)} checks their cylinder…`);
    await A('peek', pi, card.peek, live);
    tell(player, 'peek', card.peek, live);
    await sleep(600);
  }
  if (card.lucky) {
    player.luck = Math.min(LUCKY_MAX, (player.luck || 0) + 1);
    ui('log', `${N(player)} ${V(player, 'feel', 'feels')} <b>lucky</b>.`);
    tell(player, 'lucky', Math.round(player.luck * LUCKY_STEP * 100));
  }
  if (card.swap) {
    const others = alive().filter(o => o !== player);
    let target = null;
    if (others.length && player.ctrl === 'bot') target = Bots.chooseSwapTarget(player, others);
    else if (others.length) {
      const v = await ask(player, 'choice', { title: 'SWAP', html: 'Who do you swap with? You trade everything: seats, cards, guns, lives, items and wounds.',
        options: others.map(o => ({ label: `${o.name} (${o.lives} ${o.lives === 1 ? 'life' : 'lives'}${o.bleeding ? ', bleeding' : ''})`, v: idx(o) })) });
      target = state.players[v] && state.players[v].alive && state.players[v] !== player ? state.players[v] : Bots.chooseSwapTarget(player, others);
    }
    if (target) await swapPlayers(player, target);
  }
  if (card.pickpocket) {
    const marks = alive().filter(o => o !== player && o.hand.length && o !== teammateOf(player));
    let target = null;
    if (marks.length && player.ctrl === 'bot') target = Bots.choosePickTarget(player, marks);
    else if (marks.length) {
      const v = await ask(player, 'choice', { title: 'PICKPOCKET', html: 'Whose pocket do you pick? You steal one of their cards at random.',
        options: marks.map(o => ({ label: `${o.name} (${o.hand.length} card${o.hand.length === 1 ? '' : 's'})`, v: idx(o) })) });
      target = marks.includes(state.players[v]) ? state.players[v] : pick(marks);
    }
    if (!target) ui('log', `${N(player)} reach${V(player, '', 'es')} for a pocket, but nobody has a card to steal.`);
    else {
      const k = Math.floor(Math.random() * target.hand.length);
      const [id] = target.hand.splice(k, 1);
      player.hand.push(id);
      ui('log', `${N(player)} picked ${POSS(target)} pocket and stole a card.`);
      await A('stealCard', idx(target), idx(player), k, player.ctrl === 'bot' ? null : id);
      tell(player, 'stole', CARD_BY_ID[id].name);
      renderAll();
    }
  }
  if (card.dynamite) {
    const others = alive().filter(o => o !== player);
    let target = null;
    if (others.length && player.ctrl === 'bot') target = Bots.chooseDynamiteTarget(player, others);
    else if (others.length) {
      const v = await ask(player, 'choice', { title: 'DYNAMITE', html: 'Who gets the dynamite? It blows up at the end of next round unless a Block shield stops it.',
        options: others.map(o => ({ label: `${o.name}${o.block ? ' (shielded)' : ''}${o.dynamite ? ' (already has some)' : ''}`, v: idx(o) })) });
      target = others.includes(state.players[v]) ? state.players[v] : pick(others);
    }
    if (target) {
      target.dynamite = { by: player, round: state.round + 1 };
      ui('banner', 'DYNAMITE');
      ui('log', `${N(player)} lit a bundle of <b class="live">dynamite</b> and slid it to ${n(target)}. It blows at the end of next round.`);
      await A('placeDynamite', idx(target));
      refreshTags(target);
    }
  }
  if (card.forcesShootout) {
    await A('bloodyMary');
    await shootout('Bloody Mary');
  }
}

// Swap: two people trade places. Everything at a seat (cards, gun and its
// rounds, lives, items, wounds, shields, a box, a teammate) stays there and
// the people move: each now plays as what the other had.
const IDENTITY = ['name', 'ctrl', 'pid', 'char', 'sub', 'st', 'luck', 'personality', 'bot'];
async function swapPlayers(a, b) {
  const ia = idx(a), ib = idx(b);
  ui('log', `${N(a)} ${V(a, 'swap', 'swaps')} with ${n(b)}: seats, cards, guns, lives and all.`);
  IDENTITY.forEach(k => { const t = a[k]; a[k] = b[k]; b[k] = t; });
  [a, b].forEach(p => { p.priority = null; p.shotBy = null; if (p.ctrl === 'bot' && !p.personality) p.personality = 'calculating'; if (p.ctrl !== 'bot') delete p.personality; });
  const snap = snapshot();
  ui('swap', ia, ib, JSON.stringify(snap).length < 1400 ? snap : null);   // big tables: friends use the host's latest snapshot
  await sleep(1500);
}

// Grenade: everyone else is hit and loses their cards and items; the
// thrower keeps theirs but is caught in the blast too.
async function throwGrenade(p) {
  const hits = [], blocked = [], lines = [];
  tally(p, 'grenades');
  for (const v of alive()) {
    if (v === p) continue;
    if (v.block) { v.block = false; blocked.push(v); tally(v, 'blocks'); lines.push(`${N(v)}'s shield took the blast`); continue; }
    v.hand = [];
    v.items = [];
    const res = hit(v, 'wound');
    if (res.dies) { v.cause = 'Caught in a grenade blast.'; killedBy(p, v, 'grenade'); }
    hits.push({ v, res });
  }
  const self = hit(p, 'wound');
  if (self.dies) p.cause = 'Caught in your own grenade blast.';
  ui('banner', 'GRENADE');
  ui('snd', 'cock');
  await A('grenade', idx(p), hits.map(h => ({ s: idx(h.v), dead: h.res.dies })), blocked.map(idx), self.dies);
  ui('flash');
  hits.forEach(({ v, res }) => lines.push(`${N(v)} ${res.dies ? (isYou(v) ? 'are killed' : 'is killed') : res.lostLife ? V(v, 'lose a life', 'loses a life') : V(v, 'are bleeding out', 'is bleeding out')} and lose${V(v, '', 's')} every card and item`));
  ui('log', `<b class="live">BOOM.</b> ${lines.join('; ')}. ${N(p)} ${self.dies ? V(p, 'are killed too', 'is killed too') : V(p, 'are bleeding out', 'is bleeding out')} but keep${V(p, '', 's')} ${POSS(p)} cards.`);
  [...hits.map(h => h.v), p].forEach(v => { A('setLives', idx(v), Math.max(0, v.lives)); if (!v.alive) onDeath(v); refreshTags(v); });
  renderAll();
  checkGameOver();
}

// A hit lands on `p`: a kill, or a wound (a lost life if already bleeding).
function hit(p, kind) {
  const res = { dies: false, lostLife: false, wounded: false };
  if (kind === 'kill') res.dies = true;
  else if (p.bleeding) { p.lives--; res.lostLife = true; res.dies = p.lives <= 0; }
  else { p.bleeding = true; p.bleedUntil = state.round + 1; res.wounded = true; }
  if (res.dies) { p.alive = false; p.bleeding = false; }
  return res;
}

// ---------- shootouts ----------

// Every living, armed player shoots themself or someone else. Unarmed players
// (smashed guns) can't shoot and can't be shot. Returns false if the game ended.
async function shootout(reason) {
  ui('banner', 'SHOOTOUT');
  ui('log', `<span class="shootout">— Shootout: ${reason} —</span>`);
  await A('drawGuns');
  await sleep(500);

  for (const shooter of state.players) {
    if (state.over) return false;
    if (!shooter.alive) continue;
    if (shooter.unarmed) { ui('log', `${N(shooter)} sit${V(shooter, '', 's')} this one out, unarmed.`); continue; }
    const targets = alive().filter(p => p === shooter || !p.unarmed);
    let target;
    if (shooter.ctrl !== 'bot') {
      const v = await ask(shooter, 'choice', targetChoice(shooter, targets, reason));
      if (state.over) return false;
      if (v === 'hold') target = null;
      else if (v == null) target = Bots.chooseTarget(shooter, targets);
      else target = state.players[v];
    } else {
      ui('status', esc(shooter.name) + ' is deciding…');
      await sleep(700);
      target = Bots.chooseTarget(shooter, targets);
    }
    if (!target || !target.alive) { ui('log', `${N(shooter)} hold${V(shooter, '', 's')} fire.`); continue; }
    await fire(shooter, target);
    if (checkGameOver()) return false;
  }
  ui('status', '');
  await A('holsterGuns');
  return true;
}

function targetChoice(p, targets, reason) {
  const shotgun = p.shotgun > 0;
  const next = p.gun[0];
  const privateOk = p.ctrl === 'remote' || state.view === idx(p);
  const hint = shotgun
    ? `${isYou(p) ? 'You hold' : esc(p.name) + ' holds'} the <b class="live">${bigGun(p)}</b> (${p.shotgun} live shot${p.shotgun === 1 ? '' : 's'}): one hit kills.`
    : privateOk && next && next.known
      ? `You know your next round is <b class="${next.live ? 'live' : 'blank'}">${next.live ? 'LIVE' : 'BLANK'}</b>.`
      : "You don't know if your next round is live or blank.";
  const options = [];
  if (!shotgun) options.push({ label: 'Shoot yourself', v: idx(p), cls: 'self' });
  targets.filter(t => t !== p).forEach(t => options.push({
    label: `Shoot ${t.name}${t.bleeding ? ' (bleeding)' : ''}${t.block ? ' (shielded)' : ''}${t.reverse ? ' (reverse!)' : ''}${t === teammateOf(p) ? ' (teammate)' : ''}`,
    v: idx(t),
  }));
  if (!options.length) options.push({ label: 'Hold fire (nobody to shoot)', v: 'hold' });
  const title = state.multi ? `SHOOTOUT · ${esc(p.name)}` : 'SHOOTOUT';
  return { title, html: `${reason}. ${hint}`, options };
}

async function fire(shooter, target) {
  const si = idx(shooter), ti = idx(target);
  const tn = target === shooter ? SELF(shooter) : (isYou(target) ? 'YOU' : esc(target.name));
  const shotgun = shooter.shotgun > 0;
  ui('status', `${N(shooter)} aim${V(shooter, '', 's')} ${shotgun ? 'the ' + bigGun(shooter) + ' ' : ''}at ${tn}…`);
  await A('aim', si, ti);
  await sleep(700);   // let it hang

  let live;
  if (shotgun) { shooter.shotgun--; live = true; } else live = pullTrigger(shooter);
  if (target !== shooter) target.shotBy = shooter;   // vengeful bots remember this

  if (!live) {
    ui('snd', 'blank');
    ui('log', `${N(shooter)} shot ${tn}: <i>click.</i> A blank.`);
    renderGun();
    await A('shoot', si, ti, false, {});
    if (shooter.alive) await A('recover', si, ti, false);
    await sleep(300);
    return;
  }
  ui('snd', shotgun ? 'shotgun' : 'gunshot');
  ui('flash');
  // a Reverse ring sends the shot back; a Block shield stops it
  let victim = target, reverse = false, blocked = false;
  if (target !== shooter && target.reverse) { target.reverse = false; reverse = true; victim = shooter; }
  if (victim.block) { victim.block = false; blocked = true; tally(victim, 'blocks'); }
  const res = blocked ? { dies: false } : hit(victim, shotgun ? 'kill' : 'wound');
  if (res.dies) killedBy(shooter, victim, shotgun ? 'shotgun' : 'revolver');
  if (res.dies) victim.cause = shotgun ? 'A shotgun blast.' : reverse ? 'Your own shot, turned back by a Reverse.' : 'Shot again while already bleeding.';
  const vn = N(victim);
  let line = `${N(shooter)} shot ${tn}${shotgun ? ' with the ' + bigGun(shooter) : ''}: <b class="live">BANG!</b> `;
  if (reverse) line += `The Reverse turns it back on ${victim === shooter ? (isYou(shooter) ? 'you' : 'them') : vn}. `;
  if (blocked) line += `${vn === 'You' ? 'Your' : vn + "'s"} shield stops it.`;
  else if (res.dies) line += `${vn} ${V(victim, 'are', 'is')} dead.`;
  else if (res.lostLife) line += `Already bleeding, ${vn === 'You' ? 'you lose' : vn + ' loses'} a life.`;
  else line += `${vn} ${V(victim, 'are', 'is')} <b class="live">bleeding out</b>. A bandage by the end of next round, or lose a life.`;
  ui('log', line);
  renderGun();
  await A('shoot', si, ti, true, { lethal: res.dies, reverse, blocked, victim: idx(victim) });
  A('setLives', idx(victim), Math.max(0, victim.lives));
  if (res.dies) onDeath(victim);
  refreshTags(victim); refreshTags(target);
  renderAll();
  if (shooter.alive) await A('recover', si, ti, true);
  await sleep(300);
}

// End of the round: bleeding wounds cost a life, smashed guns are replaced,
// shotguns, shields and reverses wear off. Returns false if the game ended.
async function endOfRound() {
  for (const p of alive()) {
    if (!p.dynamite || state.round < p.dynamite.round) continue;
    const by = p.dynamite.by, i = idx(p);
    p.dynamite = null;
    ui('banner', 'BOOM');
    if (p.block) {
      p.block = false;
      tally(p, 'blocks');
      ui('log', `The dynamite in front of ${n(p)} goes off, but ${isYou(p) ? 'your' : 'their'} shield takes the blast.`);
      await A('explodeDynamite', i, false, true);
      A('lowerShield', i);
    } else {
      p.alive = false; p.bleeding = false;
      p.cause = isYou(p) ? 'Blown up by dynamite.' : 'Dynamite.';
      killedBy(by, p, 'dynamite');
      ui('log', `The dynamite in front of ${n(p)} goes off. <b class="live">${N(p)} ${V(p, 'are', 'is')} dead.</b>`);
      await A('explodeDynamite', i, true, false);
      A('setLives', i, 0);
      onDeath(p);
      if (checkGameOver()) return false;
    }
    refreshTags(p);
  }
  for (const p of alive()) {
    if (!p.bleeding || state.round < p.bleedUntil) continue;
    p.lives--;
    p.bleeding = false;
    const i = idx(p);
    A('setLives', i, Math.max(0, p.lives));
    if (p.lives <= 0) {
      p.alive = false;
      p.cause = isYou(p) ? 'You bled out. Nobody bandaged you in time.' : 'Bled out.';
      if (p.shotBy && p.shotBy.alive) killedBy(p.shotBy, p, 'revolver');
      ui('log', `${N(p)} bled out.`);
      await A('bleedOut', i);
      onDeath(p);
      if (checkGameOver()) return false;
    } else {
      ui('log', `${N(p)} lost a life to the bleeding but ${isYou(p) ? "you're" : "they're"} still breathing.`);
      await A('loseLife', i);
      await A('stopBleeding', i, false);
    }
    refreshTags(p);
  }
  for (const p of alive()) {
    const i = idx(p);
    if (p.unarmed) {
      p.unarmed = false;
      p.gun = loadGun();
      ui('log', `${N(p)} get${V(p, '', 's')} a new gun.`);
      await A('newGun', i);
    }
    if (p.hasShotgun) { p.hasShotgun = false; p.shotgun = 0; await A('removeShotgun', i); }
    if (p.block) { p.block = false; A('lowerShield', i); }
    if (p.reverse) { p.reverse = false; A('setReverse', i, false); }
    refreshTags(p);
  }
  renderAll();
  return !checkGameOver();
}

// A death breaks up the dead player's team; shared cards go to the survivor.
function onDeath(p) {
  if (p.dynamite) { p.dynamite = null; A('removeDynamite', idx(p)); }
  const mate = teammateOf(p);
  if (p.team) {
    p.team.members.forEach(m => { m.team = null; });
    if (mate && p.hand.length) {
      mate.hand.push(...p.hand);
      p.hand = [];
      A('transferCards', idx(p), idx(mate));
    }
    if (mate) { ui('log', `${N(mate)} fight${V(mate, '', 's')} on alone.`); refreshTags(mate); }
  }
}

function checkGameOver() {
  if (state.over) return true;
  const left = alive();
  const oneTeam = left.length === 2 && left[0].team && left[0].team === left[1].team;
  const people = left.filter(p => p.ctrl !== 'bot');
  if (left.length <= 1 || oneTeam) {
    endGame(left, left.length ? (oneTeam ? `${N(left[0])} and ${n(left[1])} are the last ones standing.` : `${N(left[0])} ${V(left[0], 'are', 'is')} the last one standing.`) : 'Nobody survived.');
    return true;
  }
  if (!people.length) {
    const dead = state.players.find(p => p.ctrl === 'local');
    endGame(left, !state.multi && dead ? dead.cause || 'You ran out of lives.' : 'Every player is dead. The bots take the table.');
    return true;
  }
  return false;
}

function endGame(winners, reason) {
  if (state.over) return;
  state.over = true;
  turn = null;
  ui('end', winners.map(idx), reason, results(winners));
}

// ---------- boxes and items ----------

// From round 2 a box sometimes lands on the table and slides to someone.
async function maybeBox() {
  if (state.round < 2 || state.box || Math.random() > BOX_CHANCE) return;
  const owner = pick(alive());
  state.box = { owner, items: rollItems() };
  ui('banner', 'A BOX!');
  await A('spawnBox', idx(owner));
  ui('log', `A box slid over to ${n(owner)}.`);
  if (owner.ctrl === 'bot') await openBox(owner);
  renderAll();
}

async function openBox(p) {
  const box = state.box;
  if (!box || box.owner !== p) return;
  state.box = null;
  p.items.push(...box.items);
  await A('openBox', idx(p), box.items);
  const names = box.items.map(id => ITEMS[id].name).join(' and ');
  if (p.ctrl === 'bot' || state.multi) ui('log', `${N(p)} found two items.`);
  if (p.ctrl !== 'bot') tell(p, 'found', names);
  renderAll();
}

// Use an item. `target` is the player it's used on (if it needs one).
async function useItem(p, id, target) {
  const k = p.items.indexOf(id);
  if (k < 0) return;
  p.items.splice(k, 1);
  const pi = idx(p);
  if (id === 'potion' || id === 'bandage') tally(p, 'heals');
  if (id === 'potion') {
    p.lives++;
    await A('usePotion', pi);
    A('setLives', pi, p.lives);
    ui('log', `${N(p)} drank a <b>health potion</b>: ${p.lives} ${p.lives === 1 ? 'life' : 'lives'}.`);
  } else if (id === 'bandage') {
    target.bleeding = false;
    await A('useBandage', pi, idx(target));
    ui('log', `${N(p)} bandaged ${target === p ? SELF(p) : n(target)}. The bleeding stops.`);
    refreshTags(target);
  } else if (id === 'hammer') {
    p.unarmed = true;
    await A('smashGun', pi);
    ui('log', `${N(p)} smashed ${isYou(p) ? 'your' : 'their'} own gun with a <b>hammer</b>. Nobody can shoot ${isYou(p) ? 'you' : 'them'} this round.`);
  } else if (id === 'binoculars') {
    await A('binoStart', pi, idx(target));
    if (p.ctrl === 'bot') {
      if (target.hand.includes('nuclear')) p.priority = target;
      ui('log', `${N(p)} looks at ${POSS(target)} cards through <b>binoculars</b>.`);
    } else {
      const cards = target.hand.length ? target.hand.map(c => `<b>${CARD_BY_ID[c].name}</b>`).join(', ') : 'no cards';
      ui('log', `${N(p)} look${V(p, '', 's')} at ${POSS(target)} cards through <b>binoculars</b>.`);
      await ask(p, 'choice', { title: 'BINOCULARS', html: `${esc(target.name)} is holding ${cards}.`, options: [{ label: 'Lower the binoculars', v: 1 }] });
      await A('binoEnd');
    }
  } else if (id === 'teammate') {
    await offerTeam(p, target);
  }
  refreshTags(p);
  renderAll();
}

// Teammate: ask someone to team up; they say yes or no. A team needs at
// least one player left outside it to fight.
async function offerTeam(from, to) {
  if (from.team || to.team || alive().length < 3) return;
  await A('invite', idx(from), idx(to));
  let yes;
  if (to.ctrl === 'bot') {
    ui('status', `${esc(to.name)} is thinking it over…`);
    await sleep(900);
    yes = Bots.acceptTeam(to, from);
  } else {
    yes = await ask(to, 'choice', {
      title: 'TEAM UP?', html: `${esc(from.name)} wants to team up with ${n(to)}. You'd share a couch and your cards, and vote on every card you play.`,
      options: [{ label: 'Team up', v: true }, { label: 'Refuse', v: false }],
    }) === true;
  }
  if (!yes) {
    await A('decline');
    ui('log', `${N(to)} refuse${V(to, '', 's')} to team up with ${n(from)}.`);
    return;
  }
  // a person leads a team with a bot; between two people the inviter leads
  const leader = from.ctrl === 'bot' && to.ctrl !== 'bot' ? to : from;
  const member = leader === from ? to : from;
  const team = { members: [leader, member], leader };
  leader.team = member.team = team;
  leader.hand.push(...member.hand);
  member.hand = [];
  ui('banner', 'TEAM UP');
  ui('log', `${N(leader)} and ${n(member)} team up. Their hands are shared now.`);
  await A('formTeam', idx(leader), idx(member));
  refreshTags(leader); refreshTags(member);
}

function refreshTags(p) {
  if (!p) return;
  A('setTags', idx(p), tagsOf(p));
}

// ---------- asking people for decisions ----------

let askSeq = 0;
const pendingAsks = new Map();

// Ask a person for a decision: on this phone, or online on theirs.
// Resolves null when an online player leaves (a bot then decides).
function ask(p, kind, data) {
  if (state.over && kind !== 'choice') return Promise.resolve(null);
  if (p.ctrl === 'local') return localAsk(p, kind, data);
  if (p.ctrl === 'remote') {
    const id = ++askSeq;
    return new Promise(res => {
      pendingAsks.set(id, { res, pid: p.pid });
      bcast({ m: 'ask', to: p.pid, id, k: kind, d: data });
    });
  }
  return Promise.resolve(null);
}

function onRemoteAct(pid, act) {
  const w = pendingAsks.get(act.id);
  if (!w || w.pid !== pid) return;
  pendingAsks.delete(act.id);
  w.res(act.v);
}

// Host: any online player no longer in the party has left the table.
function checkMissing() {
  if (state.online !== 'host' || state.over) return;
  const here = new Set(Net.members().map(m => m.pid));
  state.players.filter(p => p.ctrl === 'remote' && !here.has(p.pid)).forEach(p => onMemberLeft(p.pid));
}

function onMemberLeft(pid) {
  if (state.online !== 'host' || state.over) return;
  const p = state.players.find(q => q.pid === pid && q.ctrl === 'remote');
  if (!p) return;
  Object.assign(p, Bots.lineup(1)[0], { name: p.name, ctrl: 'bot', pid: null });
  p.sub = Bots.label(p);
  ui('log', `${esc(p.name)} left the table. A bot plays for them now.`);
  for (const [id, w] of pendingAsks) if (w.pid === pid) { pendingAsks.delete(id); w.res(null); }
}

// Private news for one person: what their 1/2/3 card showed, what they found.
function tell(p, what, ...args) {
  if (p.ctrl === 'local') showTell(what, args, p);
  else if (p.ctrl === 'remote') bcast({ m: 'tell', to: p.pid, f: what, a: args });
}

// After a Swap: everyone's table is rebuilt (this phone may have changed seat).
function swapView(ia, ib, snap) {
  showBanner('SWAP');
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => {
    if (state.online === 'client') { const s = snap || client.latest; if (s) { fromSnapshot(s); state.multi = true; } }
    else if (state.view === ia) state.view = ib;
    else if (state.view === ib) state.view = ia;
    if (state.covered) toggleCover();
    selectCard(-1);
    rebuildTable();
    f.classList.remove('on');
  }, 800);
}

function showTell(what, a, p) {
  if (p && state.multi && state.online !== 'client' && state.view !== idx(p)) return;   // same phone: only the one looking
  if (what === 'peek') {
    const [k, live] = a;
    const which = ['next', '2nd', '3rd'][k - 1];
    showBanner(live ? 'LIVE' : 'BLANK');
    log(`<span class="secret">Only you know: your ${which} round is <b class="${live ? 'live' : 'blank'}">${live ? 'LIVE' : 'BLANK'}</b>.</span>`);
    renderGun();
  } else if (what === 'stole') {
    log(`<span class="secret">You stole <b>${esc(a[0])}</b>.</span>`);
  } else if (what === 'lucky') {
    log(`<span class="secret">Your chance of a <b>Nuclear</b> in your next hands is now <b>${a[0]}%</b>.</span>`);
  } else if (what === 'found') {
    log(`<span class="secret">You found <b>${a[0]}</b>.</span>`);
  }
}

// Same phone: hide the table and pass the phone before someone's private turn.
let curtainResolve = null;
function curtain(name) {
  return new Promise(res => {
    curtainResolve = res;
    $('#curtain-text').textContent = `Pass the phone to ${name}`;
    $('#curtain-go').textContent = `I'm ${name}`;
    $('#curtain').classList.remove('hidden');
  });
}

async function focus(p) {
  const i = idx(p);
  if (state.view === i) return;
  await curtain(p.name);
  if (state.over) return;
  state.view = i;
  rebuildTable();
}

// ---------- this phone's controls ----------

let turn = null;   // { canPlay, respond } while this phone's player is choosing

function localAsk(p, kind, data) {
  return new Promise(async res => {
    if (kind === 'turn') {
      if (state.multi) await focus(p);
      if (state.over) return res(null);
      beginTurnUI(data, res);
    } else if (kind === 'char') {
      res(await openPicker(data, idx(p) === 0 || !state.multi ? Profile.loadout().char : null));
    } else {
      res(await choose(data.title, data.html, data.options));
    }
  });
}

// A friend's phone answers the host's questions the same way.
function handleAsk(ev) {
  const respond = v => Net.sendAct({ id: ev.id, v });
  if (ev.k === 'turn') beginTurnUI(ev.d, respond);
  else if (ev.k === 'char') openPicker(ev.d, Profile.loadout().char).then(respond);
  else choose(ev.d.title, ev.d.html, ev.d.options).then(respond);
}

function beginTurnUI(data, respond) {
  turn = { canPlay: data.canPlay, respond };
  state.busy = false;
  renderAll();
  if (state.selected >= 0) selectCard(state.selected);
  const me = viewer();
  const prompt = !data.canPlay ? 'Your teammate plays the cards. Use items, then end your turn.'
    : state.box && state.box.owner === me ? 'A box slid over to you. Tap it to open it, then play a card.'
    : 'Your turn: tap a card, then tap it again to play';
  setStatus(state.multi && state.online !== 'client' ? `${me.name}: ${prompt}` : prompt);
}

function endTurnUI(action) {
  if (!turn) return;
  const r = turn.respond;
  turn = null;
  state.busy = true;
  selectCard(-1);
  renderAll();
  r(action);
}

function playSelected() {
  if (state.selected < 0 || !turn || !turn.canPlay || state.busy) return;
  endTurnUI({ k: 'play', i: state.selected });
}

function openMyBox() {
  if (!turn || state.busy || !state.box || state.box.owner !== viewer()) return;
  endTurnUI({ k: 'box' });
}

async function useMyItem(id) {
  if (!turn || state.busy) return;
  const me = viewer();
  const others = alive().filter(p => p !== me);
  let target = me;
  state.busy = true;
  renderItems();
  const cancel = { label: 'Cancel', v: null };
  if (id === 'bandage') {
    const hurt = alive().filter(p => p.bleeding);
    target = hurt.length === 1 ? hurt[0] : await choose('BANDAGE', 'Who do you bandage?', hurt.map(p => ({ label: p === me ? 'Yourself' : p.name, v: idx(p) })).concat([cancel])).then(v => (v == null ? null : state.players[v]));
  } else if (id === 'binoculars') {
    target = await choose('BINOCULARS', "Whose cards do you want to see?", others.filter(p => p !== teammateOf(me)).map(p => ({ label: p.name, v: idx(p) })).concat([cancel])).then(v => (v == null ? null : state.players[v]));
  } else if (id === 'teammate') {
    target = await choose('TEAMMATE', 'Who do you ask to team up?', others.filter(p => !p.team).map(p => ({ label: p.name, v: idx(p) })).concat([cancel])).then(v => (v == null ? null : state.players[v]));
  }
  state.busy = false;
  if (!target) { renderAll(); return; }
  endTurnUI({ k: 'item', id, t: idx(target) });
}

// Why an item can't be used right now ('' when it can).
function itemBlocked(id) {
  const me = viewer();
  if (id === 'bandage' && !alive().some(p => p.bleeding)) return 'Nobody is bleeding';
  if (id === 'hammer' && me.unarmed) return 'Already unarmed';
  if (id === 'teammate') {
    if (me.team) return 'Already on a team';
    if (alive().length < 3) return 'Nobody would be left to fight';
    if (!alive().some(p => p !== me && !p.team)) return 'Nobody free to team with';
  }
  return '';
}

// ---------- a friend's phone: mirror the host ----------

const client = { gid: null, last: 0, queue: [], pumping: false };

function onHostGame(g) {
  if (!g) {
    if (state.online === 'client' && !state.over) { endedByHost(); }
    return;
  }
  if (g.id !== client.gid) { startClient(g); return; }
  if (state.online !== 'client') return;
  const fresh = (g.ev || []).filter(e => e.n > client.last).sort((a, b) => a.n - b.n);
  if (!fresh.length && !(g.s && g.s.n > client.last)) return;
  if (!fresh.length || fresh[0].n > client.last + 1) {
    // missed some: jump straight to the host's snapshot
    client.queue = [];
    fromSnapshot(g.s);
    client.last = g.s.n;
    rebuildTable();
    return;
  }
  client.queue.push(...fresh);
  client.last = fresh[fresh.length - 1].n;
  client.latest = g.s;
  pump();
}

function startClient(g) {
  state.game = (state.game || 0) + 1;
  client.gid = g.id;
  client.queue = [];
  client.last = g.s.n;
  client.latest = g.s;
  state.online = 'client';
  state.over = false;
  state.selected = -1;
  state.covered = false;
  state.busy = false;
  turn = null;
  resetHud();
  $('#game-over').classList.add('hidden');
  fromSnapshot(g.s);
  state.multi = true;
  rebuildTable();
  showScreen('game');
  Sound.startMusic();
  const fresh = (g.ev || []).filter(e => e.n > client.last).sort((a, b) => a.n - b.n);
  client.queue.push(...fresh);
  if (fresh.length) client.last = fresh[fresh.length - 1].n;
  pump();
}

async function pump() {
  if (client.pumping) return;
  client.pumping = true;
  const game = state.game;
  while (client.queue.length && game === state.game) {
    const ev = client.queue.shift();
    try {
      if (ev.m === 'a') await applyAnim(ev.f, ev.a);
      else if (ev.m === 'u') { if (ev.f === 'end' && client.latest) syncHud(client.latest); applyUi(ev.f, ev.a); }
      else if (ev.m === 'ask' && ev.to === Net.pid) { if (client.latest) syncHud(client.latest); handleAsk(ev); }
      else if (ev.m === 'tell' && ev.to === Net.pid) showTell(ev.f, ev.a);
    } catch (e) { console.error('event', ev, e); }
  }
  if (client.latest && game === state.game) syncHud(client.latest);
  client.pumping = false;
}

// Refresh the HUD from the host's latest snapshot without touching the table.
function syncHud(s) {
  const view = state.view;
  fromSnapshot(s);
  state.view = view;
  state.multi = true;
  renderAll();
}

function onHostLeft() {
  if (state.online === 'client' && !state.over) endedByHost();
}
function endedByHost() {
  state.over = true;
  turn = null;
  hidePanel();
  $('#game-over-title').textContent = 'GAME OVER';
  $('#game-over-reason').textContent = 'The host left the table.';
  $('#btn-again').textContent = 'Back to party';
  $('#game-over').classList.remove('hidden');
}

// ---------- panels ----------

// Show a choice panel and resolve with the chosen option's value.
function choose(title, html, options) {
  return new Promise(resolve => {
    const panel = $('#shootout');
    panel.innerHTML = `<h3>${title}</h3><p>${html}</p>`;
    options.forEach(o => {
      const b = document.createElement('button');
      if (o.cls) b.className = o.cls;
      b.textContent = o.label;
      b.addEventListener('click', () => { hidePanel(); resolve(o.v); });
      panel.appendChild(b);
    });
    panel.classList.remove('hidden');
  });
}

function hidePanel() { $('#shootout').classList.add('hidden'); }

// ---------- feedback ----------

const dread = () => Math.min(1, (state.round - 1) / (MAX_DREAD_ROUND - 1));

// Music and the room both follow the same "dread" level.
function applyDread() {
  Table.setRavage(dread());
  Sound.setIntensity(dread());
}

function showBanner(text) {
  const b = $('#round-banner');
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => b.classList.remove('show'), 1600);
}

function setStatus(text) { $('#status').innerHTML = text; }

function log(html) {
  const feed = $('#feed');
  const line = document.createElement('div');
  line.innerHTML = html;
  feed.appendChild(line);
  while (feed.children.length > 6) feed.firstChild.remove();
}

function flash() {
  const f = $('#hit-flash');
  f.classList.remove('on');
  void f.offsetWidth;   // restart the animation
  f.classList.add('on');
}

function whiteout() {
  const w = $('#whiteout');
  w.classList.remove('on');
  void w.offsetWidth;
  w.classList.add('on');
}

// The end screen, worded for whoever is looking at this phone.
function showEnd(winIdx, reason, res) {
  state.over = true;
  turn = null;
  hidePanel();
  setStatus('');
  $('#card-info').classList.add('hidden');
  renderItems();
  const winners = winIdx.map(i => state.players[i]).filter(Boolean);
  const names = winners.map(p => p.name.toUpperCase()).join(' & ');
  const mine = state.online === 'client' ? [state.players[state.view]] : state.players.filter(p => p.ctrl === 'local');
  let title;
  if (!winners.length) title = 'NOBODY WINS';
  else if (mine.length === 1) title = winners.includes(mine[0]) ? 'YOU WIN' : !mine[0].alive ? 'YOU DIED' : `${names} ${winners.length > 1 ? 'WIN' : 'WINS'}`;
  else title = `${names} ${winners.length > 1 ? 'WIN' : 'WINS'}`;
  $('#game-over-title').textContent = title;
  $('#game-over-reason').innerHTML = reason + recordResult(res);
  $('#btn-again').textContent = state.online === 'client' ? 'Back to party' : 'Play again';
  setTimeout(() => $('#game-over').classList.remove('hidden'), 1200);
}

// Add the finished game to this phone's record (and the scoreboard). Only
// counts when one person plays on this phone: same-phone games are shared.
let recordedGame = null;
function recordResult(res) {
  if (!res) return '';
  const key = state.online === 'client' ? 'c' + client.gid : 'h' + state.game;
  if (recordedGame === key) return '';
  const locals = state.players.filter(p => p.ctrl === 'local');
  const mine = state.online === 'client' ? state.view : locals.length === 1 ? idx(locals[0]) : -1;
  const r = res[mine];
  if (!r) return '';
  recordedGame = key;
  const unlocks = Profile.record({ win: !!r.win, mode: state.modeId, st: r });
  Scores.push();
  if (!unlocks.length) return '';
  return `<span class="unlock">Gunsmith unlocked: ${unlocks.map(u => `<b>${esc(u.skin.name)} (${u.kind === 'revolver' ? 'revolver' : 'Gun card'})</b>`).join(', ')}</span>`;
}

function toggleCover() {
  state.covered = !state.covered;
  Table.setCovered(state.covered);
  $('#btn-cover').textContent = state.covered ? 'Show cards' : 'Cover cards';
  if (state.covered) selectCard(-1);
}

function resetHud() {
  $('#btn-cover').textContent = 'Cover cards';
  $('#card-info').classList.add('hidden');
  $('#game-over').classList.add('hidden');
  $('#curtain').classList.add('hidden');
  $('#btn-again').textContent = 'Play again';
  hidePanel();
  $('#feed').innerHTML = '';
  setStatus('');
  document.body.classList.remove('bleeding', 'binoculars');
}

// ---------- HUD ----------

// Your gun and lives: the next three rounds (? until a 1/2/3 card reveals
// them) and one red mark per life.
function renderGun() {
  const box = $('#my-gun');
  const p = viewer();
  if (!p) return;
  ensureRounds(p, 3);
  const marks = Array.from({ length: Math.max(0, p.lives) }, () => '<i></i>').join('');
  const status = !p.alive ? '<div class="tag bleed">DEAD</div>' : p.unarmed ? '<div class="tag">UNARMED</div>'
    : p.shotgun > 0 ? `<div class="tag">${bigGun(p).toUpperCase()} · ${p.shotgun} LIVE</div>` : '';
  const guards = (p.block ? '<div class="tag">SHIELD UP</div>' : '') + (p.reverse ? '<div class="tag">REVERSE</div>' : '');
  box.innerHTML = (state.multi ? `<div class="gun-label who">${esc(p.name)}</div>` : '') +
    `<div class="gun-label">LIVES</div><div class="lives">${marks}</div>` +
    (p.bleeding ? `<div class="tag bleed">BLEEDING OUT</div>` : '') + status + guards +
    '<div class="gun-label">YOUR GUN</div>' + p.gun.slice(0, 3).map((r, i) => {
      const cls = r.known ? (r.live ? 'live' : 'blank') : 'unknown';
      const text = r.known ? (r.live ? 'LIVE' : 'BLANK') : '?';
      return `<div class="chamber ${cls}"><span>${['NEXT', '2ND', '3RD'][i]}</span>${text}</div>`;
    }).join('');
  document.body.classList.toggle('bleeding', !!(p.alive && p.bleeding));
}

function renderItems() {
  const bar = $('#items');
  const p = viewer();
  if (!p) { bar.innerHTML = ''; return; }
  const can = !!turn && !state.busy && !state.over;
  let html = '';
  if (state.box && state.box.owner === p && !state.over) {
    html += `<button class="item box" data-box ${can ? '' : 'disabled'}><b>Open box</b><span>Two random items inside</span></button>`;
  }
  html += p.items.map(id => {
    const why = itemBlocked(id);
    return `<button class="item" data-item="${id}" ${can && !why ? '' : 'disabled'} title="${ITEMS[id].desc}"><b>${ITEMS[id].name}</b><span>${why || ITEMS[id].desc}</span></button>`;
  }).join('');
  if (turn && !turn.canPlay) html += `<button class="item box" data-pass ${can ? '' : 'disabled'}><b>End turn</b><span>Your teammate plays the cards</span></button>`;
  bar.innerHTML = html ? `<div class="gun-label">ITEMS</div>${html}` : '';
  bar.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => useMyItem(b.dataset.item)));
  const boxBtn = bar.querySelector('[data-box]');
  if (boxBtn) boxBtn.addEventListener('click', openMyBox);
  const pass = bar.querySelector('[data-pass]');
  if (pass) pass.addEventListener('click', () => endTurnUI({ k: 'pass' }));
}

function renderAll() {
  if (!state.mode || !viewer()) return;
  $('#round-label').textContent = 'ROUND ' + state.round;
  const people = state.players.filter(p => p.ctrl !== 'bot').length;
  $('#mode-label').textContent = `${state.mode.label.toUpperCase()} · ${state.players.length} SEATS${people > 1 ? ` · ${people} PLAYERS` : ''}${state.online ? ' · ONLINE' : ''}`;
  renderGun();
  renderItems();
}

function selectCard(i) {
  state.selected = i;
  Table.select(i);
  const info = $('#card-info');
  const me = viewer();
  if (i < 0 || !me || !me.hand[i]) { info.classList.add('hidden'); return; }
  const c = CARD_BY_ID[me.hand[i]];
  info.innerHTML = `<b>${c.name}</b><span class="rarity" style="color:${RARITY[c.rarity].color}">${RARITY[c.rarity].label} · ${cardOdds(c)}</span>${c.effect}` +
    (turn && turn.canPlay && !state.busy
      ? '<button class="play">Play card</button><small>or tap the card again, or drag it onto the table</small>'
      : '<small>Wait for your turn.</small>');
  const play = info.querySelector('.play');
  if (play) play.addEventListener('click', playSelected);
  info.classList.remove('hidden');
}
