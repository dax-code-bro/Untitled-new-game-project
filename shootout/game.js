// Shootout — screens, menus and the card table.

const MODES = {
  solo:   { label: 'Solo',        players: 1, opponents: 1 },
  duos:   { label: 'Duos',        players: 2, opponents: 1 },
  trios:  { label: 'Trios',       players: 3, opponents: 2 },
  bloody: { label: 'Bloody Mary', players: 4, opponents: 3 },
};

// Round at which the room is fully wrecked and the music is at full dread.
const MAX_DREAD_ROUND = 8;

const state = {
  mode: null,
  round: 1,
  hand: [],
  oppHands: [],
  pile: [],
  selected: -1,
  covered: false,
  over: false,
};

const $ = sel => document.querySelector(sel);

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

  $('#btn-next-round').addEventListener('click', nextRound);
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

  Room.init($('#room-canvas'));
  window.addEventListener('resize', renderOpponents);
});

// ---------- game flow ----------

function startGame(modeId) {
  Sound.unlock();
  state.modeId = modeId;
  state.mode = MODES[modeId];
  state.round = 1;
  state.over = false;
  state.covered = false;
  $('#hand').classList.remove('covered');
  $('#btn-cover').textContent = 'Cover cards';

  Room.setOpponents(state.mode.opponents);
  applyDread();
  dealRound();

  showScreen('game');
  setTimeout(() => {
    Room.resize();
    Room.start();
    Sound.startMusic();
    renderAll();
    showBanner('ROUND 1');
  }, 800);
}

function dealRound() {
  state.hand = dealHand();
  state.oppHands = Array.from({ length: state.mode.opponents }, () => dealHand());
  state.pile = [];
  state.selected = -1;
}

function nextRound() {
  if (state.over) return;
  state.round++;
  applyDread();
  dealRound();
  renderAll();
  selectCard(-1);
  showBanner('ROUND ' + state.round);
}

function quitGame() {
  Sound.stopMusic();
  Room.stop();
  showScreen('menu');
}

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

function renderAll() {
  $('#round-label').textContent = 'ROUND ' + state.round;
  $('#mode-label').textContent = state.mode.label.toUpperCase() + ' · ' + state.mode.players + (state.mode.players === 1 ? ' PLAYER' : ' PLAYERS');
  renderHand();
  renderOpponents();
  renderPile();
}

function renderHand() {
  const hand = $('#hand');
  hand.innerHTML = '';
  const n = state.hand.length;
  state.hand.forEach((id, i) => {
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
  seats.forEach((seat, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'opp';
    // far seat: cards on the far edge of the table; side seats: held in front of them
    const x = seat.x;
    const y = seat.y < 0.55 ? 0.52 : 0.655;
    wrap.style.left = (x * 100) + '%';
    wrap.style.top = (y * 100) + '%';
    const cards = document.createElement('div');
    cards.className = 'opp-cards';
    state.oppHands[i].forEach(() => cards.appendChild(cardEl(null, { back: true, small: true })));
    const name = document.createElement('div');
    name.className = 'opp-name';
    name.textContent = 'OPPONENT ' + (i + 1);
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
  const c = CARD_BY_ID[state.hand[i]];
  info.innerHTML = `<b>${c.name}</b>${c.effect}<br><button class="play">Play card</button>`;
  info.querySelector('.play').addEventListener('click', playSelected);
  info.classList.remove('hidden');
}

// Playing a card puts it on the table and each opponent answers with a random
// card of their own. Only the Jack of Trades has an effect so far.
function playSelected() {
  if (state.selected < 0 || state.over) return;
  const [id] = state.hand.splice(state.selected, 1);
  state.pile.push({ id, rot: (Math.random() - 0.5) * 30 });
  Sound.cardFlick();
  selectCard(-1);
  renderAll();
  if (CARD_BY_ID[id].instantWin) { endGame('YOU WIN', 'You played the Jack of Trades.'); return; }

  const round = state.round;
  state.oppHands.forEach((h, i) => {
    if (!h.length) return;
    setTimeout(() => {
      if (state.over || state.round !== round || !h.length) return;   // game ended or a new round was dealt
      const [oid] = h.splice(Math.floor(Math.random() * h.length), 1);
      state.pile.push({ id: oid, rot: (Math.random() - 0.5) * 30 });
      Sound.cardFlick();
      renderOpponents();
      renderPile();
      if (CARD_BY_ID[oid].instantWin) endGame('OPPONENT ' + (i + 1) + ' WINS', 'They played the Jack of Trades.');
    }, 600 * (i + 1));
  });
}

function endGame(title, reason) {
  state.over = true;
  Sound.gunshot();
  $('#game-over-title').textContent = title;
  $('#game-over-reason').textContent = reason;
  setTimeout(() => $('#game-over').classList.remove('hidden'), 500);
}
