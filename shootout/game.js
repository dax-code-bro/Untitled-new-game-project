// Shootout — screens, menus and the card table.

const MODES = {
  solo:   { label: 'Solo',        players: 1, opponents: 1 },
  duos:   { label: 'Duos',        players: 2, opponents: 1 },
  trios:  { label: 'Trios',       players: 3, opponents: 2 },
  bloody: { label: 'Bloody Mary', players: 4, opponents: 3 },
};

// Round at which the room is fully wrecked and the music is at full dread.
const MAX_DREAD_ROUND = 8;

// Each revolver holds 6 chambers with a random mix of live rounds and blanks
// (always at least one of each). It reloads with a fresh random mix when empty.
const CHAMBERS = 6;

// players[0] is you; the rest are the opponents around the table.
const state = {
  mode: null,
  round: 1,
  players: [],
  pile: [],
  selected: -1,
  covered: false,
  over: false,
  myTurn: false,
};

const $ = sel => document.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const me = () => state.players[0];
const opponents = () => state.players.slice(1);
const alive = () => state.players.filter(p => p.alive);

// ---------- screen switching with a fade ----------

function showScreen(name, fade = true) {
  const go = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + name).classList.add('active');
  };
  if (!fade) { go(); return; }
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => { go(); f.classList.remove('on'); }, 800);
}

// ---------- boot ----------

window.addEventListener('DOMContentLoaded', () => {
  runLoadingScreen($('#loading-canvas'), () => showScreen('menu'));

  // Browsers only allow sound after the first click/tap.
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  document.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      Sound.unlock();
      showScreen(btn.dataset.go);
    });
  });

  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => startGame(btn.dataset.mode));
  });

  $('#btn-quit').addEventListener('click', quitGame);
  $('#btn-cover').addEventListener('click', toggleCover);
  $('#btn-again').addEventListener('click', () => {
    $('#game-over').classList.add('hidden');
    startGame(state.modeId);
  });
  $('#btn-menu').addEventListener('click', () => {
    $('#game-over').classList.add('hidden');
    quitGame();
  });

  $('#set-music').addEventListener('input', e => Sound.setMusicVolume(e.target.value / 100));
  $('#set-sfx').addEventListener('input', e => Sound.setSfxVolume(e.target.value / 100));
  $('#set-blood').addEventListener('change', e => Room.setBlood(e.target.checked));
  $('#set-difficulty').addEventListener('change', e => Bots.setDifficulty(e.target.value));

  Room.init($('#room-canvas'));
  window.addEventListener('resize', renderOpponents);
});

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
function ensureRounds(player, n) {
  while (player.gun.length < n) player.gun.push(...loadGun());
}

// Pull the trigger: returns true for a live round, false for a blank.
function pullTrigger(player) {
  ensureRounds(player, 1);
  return player.gun.shift().live;
}

// Cards 1, 2 and 3: reveal whether that upcoming round is live or blank.
function peekRound(player, n) {
  ensureRounds(player, n);
  const round = player.gun[n - 1];
  round.known = true;
  return round.live;
}

// ---------- game flow ----------

function startGame(modeId) {
  Sound.unlock();
  state.game = (state.game || 0) + 1;   // lets stale timers from a previous game bail out
  state.modeId = modeId;
  state.mode = MODES[modeId];
  state.round = 1;
  state.over = false;
  state.covered = false;
  state.pile = [];
  state.selected = -1;
  $('#hand').classList.remove('covered');
  $('#btn-cover').textContent = 'Cover cards';
  hideShootout();
  $('#feed').innerHTML = '';

  state.players = [{ name: 'You', you: true }];
  state.players.push(...Bots.lineup(state.mode.opponents));
  state.players.forEach(p => { p.alive = true; p.hand = dealHand(); p.gun = loadGun(); });

  Room.setOpponents(state.mode.opponents);
  applyDread();

  showScreen('game');
  const game = state.game;
  setTimeout(() => {
    if (game !== state.game) return;
    Room.resize();
    Room.start();
    Sound.startMusic();
    renderAll();
    showBanner('ROUND 1');
    beginTurn();
  }, 800);
}

function quitGame() {
  state.over = true;
  state.game++;
  Sound.stopMusic();
  Room.stop();
  hideShootout();
  showScreen('menu');
}

// Your turn to play a card.
function beginTurn() {
  if (state.over) return;
  // Anyone who has run out of cards is dealt a fresh hand.
  alive().forEach(p => { if (!p.hand.length) p.hand = dealHand(); });
  state.myTurn = true;
  renderAll();
  setStatus('Your turn — play a card');
}

// Playing a card: you go first, then each living opponent plays one.
// Once everyone has played, the round ends in a shootout.
async function playSelected() {
  if (state.selected < 0 || state.over || !state.myTurn) return;
  const game = state.game;
  state.myTurn = false;
  const [id] = me().hand.splice(state.selected, 1);
  selectCard(-1);
  if (!(await resolveCard(me(), id)) || game !== state.game) return;

  for (const opp of opponents()) {
    if (!opp.alive) continue;
    setStatus(opp.name + ' is choosing a card…');
    await sleep(800);
    if (state.over || game !== state.game) return;
    const [oid] = opp.hand.splice(Bots.chooseCard(opp), 1);
    if (!(await resolveCard(opp, oid)) || game !== state.game) return;
  }

  // Everyone has played: the round ends with a shootout.
  if (!(await shootout('End of round ' + state.round)) || game !== state.game) return;

  state.round++;
  applyDread();
  showBanner('ROUND ' + state.round);
  await sleep(1200);
  if (game !== state.game) return;
  beginTurn();
}

// Put a card on the table and apply its effect.
// Returns false if the game ended because of it.
async function resolveCard(player, id) {
  const card = CARD_BY_ID[id];
  state.pile.push({ id, rot: (Math.random() - 0.5) * 30 });
  Sound.cardFlick();
  log(`${player.name} played <b>${card.name}</b>.`);
  renderAll();

  if (card.instantWin) {
    endGame(player.you ? 'YOU WIN' : player.name.toUpperCase() + ' WINS',
      (player.you ? 'You' : 'They') + ' played the Jack of Trades.');
    return false;
  }
  if (card.peek) {
    const live = peekRound(player, card.peek);
    if (player.you) {
      const which = ['next', '2nd', '3rd'][card.peek - 1];
      showBanner(live ? 'LIVE' : 'BLANK');
      log(`<span class="secret">Only you know: your ${which} round is <b class="${live ? 'live' : 'blank'}">${live ? 'LIVE' : 'BLANK'}</b>.</span>`);
      renderGun();
      await sleep(1200);
    }
  }
  if (card.forcesShootout) {
    await sleep(600);
    return shootout('Bloody Mary');
  }
  return true;
}

// Every living player, starting with you, either shoots themself or shoots
// someone else at the table. Returns false if the game ended.
async function shootout(reason) {
  const game = state.game;
  showBanner('SHOOTOUT');
  log(`<span class="shootout">— Shootout: ${reason} —</span>`);
  await sleep(1400);

  for (const shooter of state.players) {
    if (state.over || game !== state.game) return false;
    if (!shooter.alive) continue;

    let target;
    if (shooter.you) {
      target = await askForTarget(reason);
    } else {
      setStatus(shooter.name + ' picks up the gun…');
      await sleep(900);
      target = Bots.chooseTarget(shooter, alive());
    }
    if (game !== state.game) return false;
    await fire(shooter, target);
    if (checkGameOver()) return false;
  }
  setStatus('');
  return true;
}

async function fire(shooter, target) {
  const who = target === shooter
    ? (shooter.you ? 'yourself' : 'themself')
    : (target.you ? 'YOU' : target.name);
  setStatus(`${shooter.name} ${shooter.you ? 'aim' : 'aims'} at ${who}…`);
  await sleep(1100);

  const live = pullTrigger(shooter);
  if (target !== shooter) target.shotBy = shooter;   // vengeful bots remember this
  if (live) {
    Sound.gunshot();
    flash();
    target.alive = false;
    if (!target.you) Room.setDead(state.players.indexOf(target) - 1, true);
    log(`${shooter.name} shot ${who} — <b class="live">BANG!</b> ${target.you ? 'You are' : target.name + ' is'} dead.`);
  } else {
    Sound.blank();
    log(`${shooter.name} shot ${who} — <i>click.</i> A blank.`);
  }
  renderAll();
  await sleep(1000);
}

function checkGameOver() {
  if (state.over) return true;
  if (!me().alive) { endGame('YOU DIED', 'The chamber was live.'); return true; }
  if (alive().length === 1) { endGame('YOU WIN', 'You are the last one standing.'); return true; }
  return false;
}

function endGame(title, reason) {
  state.over = true;
  state.myTurn = false;
  hideShootout();
  setStatus('');
  if (title !== 'YOU DIED') Sound.gunshot();
  $('#game-over-title').textContent = title;
  $('#game-over-reason').textContent = reason;
  setTimeout(() => $('#game-over').classList.remove('hidden'), 900);
}

// ---------- shootout choice panel ----------

function askForTarget(reason) {
  return new Promise(resolve => {
    const panel = $('#shootout');
    const next = me().gun[0];
    const hint = next && next.known
      ? `You know your next round is <b class="${next.live ? 'live' : 'blank'}">${next.live ? 'LIVE' : 'BLANK'}</b>.`
      : 'You don\'t know if your next round is live or blank.';
    panel.innerHTML = `<h3>SHOOTOUT</h3><p>${reason}. ${hint}</p>`;
    const choose = target => { hideShootout(); resolve(target); };
    const self = document.createElement('button');
    self.className = 'self';
    self.textContent = 'Shoot yourself';
    self.addEventListener('click', () => choose(me()));
    panel.appendChild(self);
    alive().filter(p => !p.you).forEach(p => {
      const b = document.createElement('button');
      b.textContent = 'Shoot ' + p.name;
      b.addEventListener('click', () => choose(p));
      panel.appendChild(b);
    });
    panel.classList.remove('hidden');
    setStatus('Pick who to shoot');
  });
}

function hideShootout() { $('#shootout').classList.add('hidden'); }

// ---------- feedback ----------

// Music and the room both follow the same "dread" level.
function applyDread() {
  const dread = Math.min(1, (state.round - 1) / (MAX_DREAD_ROUND - 1));
  Room.setRavage(dread);
  Sound.setIntensity(dread);
}

function showBanner(text) {
  const b = $('#round-banner');
  b.textContent = text;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 1600);
}

function setStatus(text) { $('#status').textContent = text; }

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

function toggleCover() {
  state.covered = !state.covered;
  $('#hand').classList.toggle('covered', state.covered);
  $('#btn-cover').textContent = state.covered ? 'Show cards' : 'Cover cards';
  if (state.covered) selectCard(-1);
}

// ---------- rendering ----------

function cardEl(id, opts = {}) {
  const el = document.createElement('div');
  if (opts.back) {
    el.className = 'card back' + (opts.small ? ' small' : '');
    return el;
  }
  const c = CARD_BY_ID[id];
  el.className = 'card ' + c.style;
  el.innerHTML = `<div class="face"><div class="corner">${c.corner}</div><div class="icon">${c.icon}</div><div class="name">${c.name}</div></div>`;
  return el;
}

// Your gun: the next three rounds, shown as ? until a 1/2/3 card reveals them.
function renderGun() {
  const box = $('#my-gun');
  if (!me()) return;
  ensureRounds(me(), 3);
  box.innerHTML = '<div class="gun-label">YOUR GUN</div>' + me().gun.slice(0, 3).map((r, i) => {
    const cls = r.known ? (r.live ? 'live' : 'blank') : 'unknown';
    const text = r.known ? (r.live ? 'LIVE' : 'BLANK') : '?';
    return `<div class="chamber ${cls}"><span>${['NEXT', '2ND', '3RD'][i]}</span>${text}</div>`;
  }).join('');
}

function renderAll() {
  $('#round-label').textContent = 'ROUND ' + state.round;
  $('#mode-label').textContent = state.mode.label.toUpperCase() + ' · ' + state.mode.players + (state.mode.players === 1 ? ' PLAYER' : ' PLAYERS');
  renderHand();
  renderOpponents();
  renderPile();
  renderGun();
}

function renderHand() {
  const hand = $('#hand');
  hand.innerHTML = '';
  hand.classList.toggle('waiting', !state.myTurn);
  const cards = me() ? me().hand : [];
  const n = cards.length;
  cards.forEach((id, i) => {
    const el = cardEl(id);
    // fan the cards out
    const spread = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
    el.style.transform = `rotate(${spread * 14}deg) translateY(${Math.abs(spread) * 14}px)`;
    if (i === state.selected) el.classList.add('selected');
    el.addEventListener('click', () => {
      if (state.covered) return;
      Sound.cardFlick();
      selectCard(state.selected === i ? -1 : i);
    });
    hand.appendChild(el);
  });
}

function renderOpponents() {
  const box = $('#opponent-hands');
  if (!state.mode) return;
  box.innerHTML = '';
  const seats = Room.seats(state.mode.opponents);
  opponents().forEach((opp, i) => {
    const seat = seats[i];
    const wrap = document.createElement('div');
    wrap.className = 'opp' + (opp.alive ? '' : ' dead');
    // far seat: cards on the far edge of the table; side seats: held in front of them
    wrap.style.left = (seat.x * 100) + '%';
    wrap.style.top = ((seat.y < 0.55 ? 0.52 : 0.655) * 100) + '%';
    const cards = document.createElement('div');
    cards.className = 'opp-cards';
    if (opp.alive) opp.hand.forEach(() => cards.appendChild(cardEl(null, { back: true, small: true })));
    const name = document.createElement('div');
    name.className = 'opp-name';
    name.innerHTML = opp.name.toUpperCase() + (opp.alive ? '' : ' — DEAD') +
      `<small>${Bots.label(opp)}</small>`;
    wrap.append(name, cards);
    box.appendChild(wrap);
  });
}

function renderPile() {
  const pile = $('#table-pile');
  pile.innerHTML = '';
  state.pile.slice(-3).forEach(p => {
    const el = cardEl(p.id);
    el.style.setProperty('--rot', p.rot + 'deg');
    pile.appendChild(el);
  });
}

function selectCard(i) {
  state.selected = i;
  renderHand();
  const info = $('#card-info');
  if (i < 0) { info.classList.add('hidden'); return; }
  const c = CARD_BY_ID[me().hand[i]];
  info.innerHTML = `<b>${c.name}</b>${c.effect}<br>` +
    (state.myTurn ? '<button class="play">Play card</button>' : '<small>Wait for your turn.</small>');
  const play = info.querySelector('.play');
  if (play) play.addEventListener('click', playSelected);
  info.classList.remove('hidden');
}
