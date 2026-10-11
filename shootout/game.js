// Shootout — screens, menus and the rules of the table.
// All drawing and animation lives in the 3D modules (engine, table, stages);
// this file runs the game: turns, cards, guns and shootouts.

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

// players[0] is you; the rest are the bots around the table.
const state = {
  mode: null,
  round: 1,
  players: [],
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
const seatOf = p => state.players.indexOf(p);

// ---------- screen switching with a fade ----------

const MENU_SCREENS = ['menu', 'mode', 'settings', 'gunsmith', 'loadout'];

function showScreen(name, fade = true) {
  const go = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + name).classList.add('active');
    if (MENU_SCREENS.includes(name)) MenuStage.show();
    if (name === 'game') Table.show();
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
  $('#set-blood').addEventListener('change', e => Table.setBlood(e.target.checked));
  $('#set-difficulty').addEventListener('change', e => Bots.setDifficulty(e.target.value));

  Table.onCardClick = i => {
    if (state.covered || state.over) return;
    Sound.cardFlick();
    selectCard(state.selected === i ? -1 : i);
  };
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
  state.game = (state.game || 0) + 1;   // lets a previous game's async steps bail out
  const game = state.game;
  state.modeId = modeId;
  state.mode = MODES[modeId];
  state.round = 1;
  state.over = false;
  state.covered = false;
  state.selected = -1;
  state.myTurn = false;
  $('#btn-cover').textContent = 'Cover cards';
  $('#card-info').classList.add('hidden');
  hideShootout();
  $('#feed').innerHTML = '';

  state.players = [{ name: 'You', you: true }];
  state.players.push(...Bots.lineup(state.mode.opponents));
  state.players.forEach(p => { p.alive = true; p.hand = dealHand(); p.gun = loadGun(); });

  Table.setup(state.players);
  applyDread();
  renderAll();
  setStatus('');

  showScreen('game');
  setTimeout(async () => {
    if (game !== state.game) return;
    Sound.startMusic();
    showBanner('ROUND 1');
    // deal round-robin, one card at a time
    for (let k = 0; k < HAND_SIZE; k++) {
      for (let i = 0; i < state.players.length; i++) {
        if (game !== state.game) return;
        await Table.deal(i, [state.players[i].hand[k]]);
      }
    }
    if (game !== state.game) return;
    beginTurn();
  }, 900);
}

function quitGame() {
  state.over = true;
  state.game++;
  Sound.stopMusic();
  hideShootout();
  $('#card-info').classList.add('hidden');
  showScreen('menu');
}

// Your turn to play a card.
async function beginTurn() {
  if (state.over) return;
  const game = state.game;
  // Anyone who has run out of cards is dealt a fresh hand.
  for (const p of alive()) {
    if (p.hand.length) continue;
    p.hand = dealHand();
    await Table.deal(seatOf(p), p.hand);
    if (game !== state.game) return;
  }
  state.myTurn = true;
  renderAll();
  setStatus('Your turn — pick a card');
}

// Playing a card: you go first, then each living bot plays one.
// Once everyone has played, the round ends in a shootout.
async function playSelected() {
  if (state.selected < 0 || state.over || !state.myTurn) return;
  const game = state.game;
  state.myTurn = false;
  const index = state.selected;
  const [id] = me().hand.splice(index, 1);
  selectCard(-1);
  await Table.play(0, index);
  if (!(await resolveCard(me(), id)) || game !== state.game) return;

  for (const opp of opponents()) {
    if (!opp.alive) continue;
    setStatus(opp.name + ' is choosing a card…');
    await sleep(600);
    if (state.over || game !== state.game) return;
    const oi = Bots.chooseCard(opp);
    const [oid] = opp.hand.splice(oi, 1);
    await Table.play(seatOf(opp), oi);
    if (!(await resolveCard(opp, oid)) || game !== state.game) return;
  }

  // Everyone has played: the round ends with a shootout.
  if (!(await shootout('End of round ' + state.round)) || game !== state.game) return;

  state.round++;
  applyDread();
  renderAll();
  showBanner('ROUND ' + state.round);
  await sleep(1400);
  if (game !== state.game) return;
  beginTurn();
}

// Apply a played card's effect. Returns false if the game ended because of it.
async function resolveCard(player, id) {
  const card = CARD_BY_ID[id];
  log(`${player.name} played <b>${card.name}</b>.`);
  renderAll();

  if (card.instantWin) {
    await Table.jackGlow();
    endGame(player.you ? 'YOU WIN' : player.name.toUpperCase() + ' WINS',
      (player.you ? 'You' : 'They') + ' played the Jack of Trades.');
    return false;
  }
  if (card.peek) {
    const live = peekRound(player, card.peek);
    if (!player.you) setStatus(`${player.name} checks their cylinder…`);
    await Table.peek(seatOf(player), card.peek, live);
    if (player.you) {
      const which = ['next', '2nd', '3rd'][card.peek - 1];
      showBanner(live ? 'LIVE' : 'BLANK');
      log(`<span class="secret">Only you know: your ${which} round is <b class="${live ? 'live' : 'blank'}">${live ? 'LIVE' : 'BLANK'}</b>.</span>`);
      renderGun();
      await sleep(900);
    }
  }
  if (card.forcesShootout) {
    await Table.bloodyMary();
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
  await Table.drawGuns();
  await sleep(500);

  for (const shooter of state.players) {
    if (state.over || game !== state.game) return false;
    if (!shooter.alive) continue;

    let target;
    if (shooter.you) {
      target = await askForTarget(reason);
    } else {
      setStatus(shooter.name + ' is deciding…');
      await sleep(700);
      target = Bots.chooseTarget(shooter, alive());
    }
    if (game !== state.game) return false;
    await fire(shooter, target);
    if (checkGameOver()) return false;
  }
  setStatus('');
  await Table.holsterGuns();
  return true;
}

async function fire(shooter, target) {
  const who = target === shooter
    ? (shooter.you ? 'yourself' : 'themself')
    : (target.you ? 'YOU' : target.name);
  setStatus(`${shooter.name} ${shooter.you ? 'aim' : 'aims'} at ${who}…`);
  const si = seatOf(shooter), ti = seatOf(target);
  await Table.aim(si, ti);
  await sleep(700);   // let it hang

  const live = pullTrigger(shooter);
  if (target !== shooter) target.shotBy = shooter;   // vengeful bots remember this
  if (live) {
    Sound.gunshot();
    flash();
    target.alive = false;
    log(`${shooter.name} shot ${who} — <b class="live">BANG!</b> ${target.you ? 'You are' : target.name + ' is'} dead.`);
  } else {
    Sound.blank();
    log(`${shooter.name} shot ${who} — <i>click.</i> A blank.`);
  }
  renderGun();
  await Table.shoot(si, ti, live);
  if (shooter.alive) await Table.recover(si, ti, live);
  await sleep(300);
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
  $('#card-info').classList.add('hidden');
  $('#game-over-title').textContent = title;
  $('#game-over-reason').textContent = reason;
  setTimeout(() => $('#game-over').classList.remove('hidden'), 1200);
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
  Table.setRavage(dread);
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
  Table.setCovered(state.covered);
  $('#btn-cover').textContent = state.covered ? 'Show cards' : 'Cover cards';
  if (state.covered) selectCard(-1);
}

// ---------- HUD ----------

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
  renderGun();
}

function selectCard(i) {
  state.selected = i;
  Table.select(i);
  const info = $('#card-info');
  if (i < 0) { info.classList.add('hidden'); return; }
  const c = CARD_BY_ID[me().hand[i]];
  info.innerHTML = `<b>${c.name}</b>${c.effect}<br>` +
    (state.myTurn ? '<button class="play">Play card</button>' : '<small>Wait for your turn.</small>');
  const play = info.querySelector('.play');
  if (play) play.addEventListener('click', playSelected);
  info.classList.remove('hidden');
}
