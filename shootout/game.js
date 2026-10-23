// Shootout — screens, menus and the rules of the table.
// All drawing and animation lives in the 3D modules (engine, table, stages);
// this file runs the game: turns, cards, items, guns, wounds and shootouts.

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

// The shotgun from a Gun card: two shells, both live, gone after the round.
const SHOTGUN_SHELLS = 2;

// Everyone starts with one life (one red mark). A revolver hit leaves you
// bleeding; if nobody bandages you by the end of the next round you lose a
// life. Losing your last life kills you.
const START_LIVES = 1;

// players[0] is you; the rest are the bots around the table.
const state = {
  mode: null,
  round: 1,
  players: [],
  selected: -1,
  covered: false,
  over: false,
  myTurn: false,
  busy: false,     // an item or card is being resolved on your turn
  box: null,       // { owner, items } while an unopened box sits on the table
};

const $ = sel => document.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const me = () => state.players[0];
const opponents = () => state.players.slice(1);
const alive = () => state.players.filter(p => p.alive);
const seatOf = p => state.players.indexOf(p);
const nameOf = p => (p.you ? 'you' : p.name);
const teammateOf = p => (p.team ? p.team.members.find(m => m !== p && m.alive) : null);

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

  // Tap a card to pick it, tap it again (or drag it up onto the table) to play.
  Table.onCardClick = i => {
    if (state.covered || state.over) return;
    Sound.cardFlick();
    if (state.selected === i && state.myTurn && !state.busy) playSelected();
    else selectCard(state.selected === i ? -1 : i);
  };
  Table.onCardDrop = i => {
    if (state.covered || state.over || !state.myTurn || state.busy) return;
    state.selected = i;
    playSelected();
  };
  Table.onBoxClick = () => openMyBox();
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
  state.busy = false;
  state.box = null;
  $('#btn-cover').textContent = 'Cover cards';
  $('#card-info').classList.add('hidden');
  hidePanel();
  $('#feed').innerHTML = '';

  state.players = [{ name: 'You', you: true }];
  state.players.push(...Bots.lineup(state.mode.opponents));
  state.players.forEach(p => Object.assign(p, {
    alive: true, hand: dealHand(), gun: loadGun(), lives: START_LIVES, bleeding: false, bleedUntil: 0,
    items: [], shotgun: 0, hasShotgun: false, unarmed: false, team: null, priority: null, shotBy: null,
  }));

  Table.setup(state.players);
  state.players.forEach((p, i) => Table.setLives(i, p.lives));
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
  hidePanel();
  document.body.classList.remove('bleeding', 'binoculars');
  $('#card-info').classList.add('hidden');
  showScreen('menu');
}

// Your turn: refill empty hands, then wait for you to use items and play a card.
async function beginTurn() {
  if (state.over) return;
  const game = state.game;
  for (const p of alive()) {
    if (p.hand.length || (p.team && p.team.leader !== p && teammateOf(p))) continue;
    const mate = p.team && p.team.leader === p ? teammateOf(p) : null;
    p.hand = dealHand(mate ? HAND_SIZE * 2 : HAND_SIZE);
    await Table.deal(seatOf(p), p.hand);
    if (game !== state.game) return;
  }
  state.myTurn = true;
  state.busy = false;
  renderAll();
  if (state.selected >= 0) selectCard(state.selected);
  setStatus(state.box && state.box.owner === me() ? 'A box slid over to you. Tap it to open it, then play a card.' : 'Your turn: tap a card, then tap it again to play');
}

// You play a card, then each living bot (or bot team) plays one. Once
// everyone has played, the round ends in a shootout.
async function playSelected() {
  if (state.selected < 0 || state.over || !state.myTurn || state.busy) return;
  const game = state.game;
  state.busy = true;
  let index = state.selected;
  selectCard(-1);

  // Teams vote on every card from the shared hand.
  const mate = teammateOf(me());
  if (mate) {
    const choice = Bots.vote(mate, me().hand, index);
    if (choice !== index) {
      const mine = CARD_BY_ID[me().hand[index]].name, theirs = CARD_BY_ID[me().hand[choice]].name;
      const v = await choose('TEAM VOTE', `${mate.name} votes for <b>${theirs}</b>. You voted for <b>${mine}</b>. It's a tie.`, [
        { label: 'Flip a coin', value: 'coin' },
        { label: `Go with ${theirs}`, value: 'theirs' },
      ]);
      if (game !== state.game) return;
      if (v === 'theirs') index = choice;
      else {
        const heads = Math.random() < 0.5;
        showBanner(heads ? 'HEADS' : 'TAILS');
        log(`Coin flip: ${heads ? `heads, you play <b>${mine}</b>` : `tails, ${mate.name} wins the vote: <b>${theirs}</b>`}.`);
        if (!heads) index = choice;
        await sleep(900);
      }
    } else log(`${mate.name} votes yes.`);
  }

  state.myTurn = false;
  renderItems();
  const [id] = me().hand.splice(index, 1);
  await Table.play(0, index);
  if (!(await resolveCard(me(), id)) || game !== state.game) return;

  for (const opp of opponents()) {
    if (!opp.alive || state.over) continue;
    await botTurn(opp);
    if (state.over || game !== state.game) return;
  }

  // Everyone has played: the round ends with a shootout.
  if (!(await shootout('End of round ' + state.round)) || game !== state.game) return;
  if (!(await endOfRound()) || game !== state.game) return;

  state.round++;
  applyDread();
  renderAll();
  showBanner('ROUND ' + state.round);
  await sleep(1400);
  if (game !== state.game) return;
  await maybeBox();
  if (game !== state.game || state.over) return;
  beginTurn();
}

// A bot's turn: use items, then (unless its team leader plays for it) a card.
async function botTurn(bot) {
  const game = state.game;
  setStatus(bot.name + ' is thinking…');
  await sleep(500);
  const danger = alive().some(p => p.shotgun > 0 && p !== bot);
  for (const act of Bots.chooseItems(bot, { alive: alive(), danger })) {
    if (!bot.alive || state.over || game !== state.game) return;
    if (!bot.items.includes(act.item)) continue;
    await useItem(bot, act.item, act.target);
  }
  if (!bot.alive || state.over || game !== state.game) return;
  if (bot.team && bot.team.leader !== bot && teammateOf(bot)) return;   // the leader plays for the team
  if (!bot.hand.length) return;
  setStatus(bot.name + ' is choosing a card…');
  await sleep(500);
  const oi = Bots.chooseCard(bot);
  const [oid] = bot.hand.splice(oi, 1);
  if (teammateOf(bot)) log(`${bot.name}'s team voted.`);
  await Table.play(seatOf(bot), oi);
  await resolveCard(bot, oid);
}

// Apply a played card's effect. Returns false if the game ended because of it.
async function resolveCard(player, id) {
  const card = CARD_BY_ID[id];
  log(`${player.you ? 'You' : player.name} played <b>${card.name}</b>.`);
  renderAll();

  if (card.instantWin) {
    await Table.jackGlow();
    const mate = teammateOf(player);
    const winners = player.you || (mate && mate.you) ? 'YOU WIN' : (mate ? `${player.name} & ${mate.name} WIN` : player.name.toUpperCase() + ' WINS');
    endGame(winners, `${player.you ? 'You' : player.name} played the Jack of Trades.`);
    return false;
  }
  if (card.shotgun) {
    player.shotgun = SHOTGUN_SHELLS;
    player.hasShotgun = true;
    await Table.giveShotgun(seatOf(player));
    log(`${player.you ? 'You have' : player.name + ' has'} a <b>shotgun</b> this round: 2 shells, both live.${player.unarmed ? ' (Unarmed, so it stays on the table.)' : ''}`);
    refreshTags(player);
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

// ---------- shootouts ----------

// Every living, armed player, starting with you, shoots themself or someone
// else. Unarmed players (smashed guns) can't shoot and can't be shot.
// Returns false if the game ended.
async function shootout(reason) {
  const game = state.game;
  showBanner('SHOOTOUT');
  log(`<span class="shootout">— Shootout: ${reason} —</span>`);
  await Table.drawGuns();
  await sleep(500);

  for (const shooter of state.players) {
    if (state.over || game !== state.game) return false;
    if (!shooter.alive) continue;
    if (shooter.unarmed) { log(`${shooter.you ? 'You sit' : shooter.name + ' sits'} this one out, unarmed.`); continue; }

    const targets = alive().filter(p => p === shooter || !p.unarmed);
    let target;
    if (shooter.you) {
      target = await askForTarget(reason, targets);
    } else {
      setStatus(shooter.name + ' is deciding…');
      await sleep(700);
      target = Bots.chooseTarget(shooter, targets);
    }
    if (game !== state.game) return false;
    if (!target) { log(`${shooter.you ? 'You hold' : shooter.name + ' holds'} fire.`); continue; }
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
  const si = seatOf(shooter), ti = seatOf(target);
  const shotgun = shooter.shotgun > 0;
  setStatus(`${shooter.you ? 'You aim' : shooter.name + ' aims'} ${shotgun ? 'the shotgun ' : ''}at ${who}…`);
  await Table.aim(si, ti);
  await sleep(700);   // let it hang

  let live, dies = false, lostLife = false;
  if (shotgun) { shooter.shotgun--; live = true; dies = true; }
  else live = pullTrigger(shooter);
  if (target !== shooter) target.shotBy = shooter;   // vengeful bots remember this

  const by = shooter.you ? 'You' : shooter.name;
  if (!live) {
    Sound.blank();
    log(`${by} shot ${who}: <i>click.</i> A blank.`);
  } else {
    if (shotgun) Sound.shotgun(); else Sound.gunshot();
    flash();
    if (!dies) {
      if (target.bleeding) {           // shot again while bleeding: lose a life now
        target.lives--;
        lostLife = true;
        dies = target.lives <= 0;
      } else {
        target.bleeding = true;
        target.bleedUntil = state.round + 1;
      }
    }
    if (dies) {
      target.alive = false;
      target.bleeding = false;
      target.cause = shotgun ? 'A shotgun blast.' : 'Shot again while you were already bleeding.';
      log(`${by} shot ${who} with the ${shotgun ? 'shotgun' : 'revolver'}: <b class="live">BANG!</b> ${target.you ? 'You are' : target.name + ' is'} dead.`);
    } else if (lostLife) {
      log(`${by} shot ${who}: <b class="live">BANG!</b> Already bleeding, ${target.you ? 'you lose' : 'they lose'} a life.`);
    } else {
      log(`${by} shot ${who}: <b class="live">BANG!</b> ${target.you ? "You're" : target.name + ' is'} <b class="live">bleeding out</b>. A bandage by the end of next round, or lose a life.`);
    }
  }
  renderGun();
  await Table.shoot(si, ti, live, { lethal: dies });
  Table.setLives(ti, Math.max(0, target.lives));
  if (dies) onDeath(target);
  refreshTags(target);
  renderAll();
  if (shooter.alive) await Table.recover(si, ti, live);
  await sleep(300);
}

// End of the round: bleeding wounds cost a life, smashed guns are replaced
// and shotguns disappear. Returns false if the game ended.
async function endOfRound() {
  for (const p of alive()) {
    if (!p.bleeding || state.round < p.bleedUntil) continue;
    p.lives--;
    p.bleeding = false;
    const i = seatOf(p);
    Table.setLives(i, Math.max(0, p.lives));
    if (p.lives <= 0) {
      p.alive = false;
      p.cause = 'You bled out. Nobody bandaged you in time.';
      log(`${p.you ? 'You' : p.name} bled out.`);
      await Table.bleedOut(i);
      onDeath(p);
      if (checkGameOver()) return false;
    } else {
      log(`${p.you ? 'You' : p.name} lost a life to the bleeding but ${p.you ? "you're" : "they're"} still breathing.`);
      await Table.loseLife(i);
      await Table.stopBleeding(i, false);
    }
    refreshTags(p);
  }
  for (const p of alive()) {
    if (p.unarmed) {
      p.unarmed = false;
      p.gun = loadGun();
      log(`${p.you ? 'You get' : p.name + ' gets'} a new gun.`);
      await Table.newGun(seatOf(p));
    }
    if (p.hasShotgun) {
      p.hasShotgun = false;
      p.shotgun = 0;
      await Table.removeShotgun(seatOf(p));
    }
    refreshTags(p);
  }
  renderAll();
  return !checkGameOver();
}

// A death breaks up the dead player's team; any shared cards go to the survivor.
function onDeath(p) {
  const mate = teammateOf(p);
  if (p.team) {
    p.team.members.forEach(m => { m.team = null; });
    if (mate && p.hand.length) {
      mate.hand.push(...p.hand);
      p.hand = [];
      Table.transferCards(seatOf(p), seatOf(mate));
    }
    if (mate) { log(`${mate.you ? 'You fight' : mate.name + ' fights'} on alone.`); refreshTags(mate); }
  }
  if (p.you) document.body.classList.remove('bleeding');
}

function checkGameOver() {
  if (state.over) return true;
  if (!me().alive) { endGame('YOU DIED', me().cause || 'You ran out of lives.'); return true; }
  const left = alive();
  const oneTeam = left.length === 2 && left[0].team && left[0].team === left[1].team;
  if (left.length === 1 || oneTeam) {
    endGame('YOU WIN', oneTeam ? `You and ${left.find(p => !p.you).name} are the last ones standing.` : 'You are the last one standing.');
    return true;
  }
  return false;
}

function endGame(title, reason) {
  state.over = true;
  state.myTurn = false;
  hidePanel();
  setStatus('');
  $('#card-info').classList.add('hidden');
  renderItems();
  $('#game-over-title').textContent = title;
  $('#game-over-reason').textContent = reason;
  setTimeout(() => $('#game-over').classList.remove('hidden'), 1200);
}

// ---------- boxes and items ----------

// From round 2 a box sometimes lands on the table and slides to someone.
async function maybeBox() {
  if (state.round < 2 || state.box || Math.random() > BOX_CHANCE) return;
  const owner = pick(alive());
  state.box = { owner, items: rollItems() };
  showBanner('A BOX!');
  await Table.spawnBox(seatOf(owner));
  log(`A box slid over to ${nameOf(owner)}.`);
  if (!owner.you) await openBox(owner);
  renderItems();
}

async function openBox(p) {
  const box = state.box;
  if (!box || box.owner !== p) return;
  state.box = null;
  await Table.openBox(seatOf(p), box.items);
  p.items.push(...box.items);
  const names = box.items.map(id => ITEMS[id].name).join(' and ');
  log(p.you ? `You found <b>${names}</b>.` : `${p.name} found two items.`);
  renderItems();
}

async function openMyBox() {
  if (!state.box || state.box.owner !== me() || !state.myTurn || state.busy || state.over) return;
  state.busy = true;
  renderItems();
  await openBox(me());
  state.busy = false;
  renderItems();
  setStatus('Your turn: tap a card, then tap it again to play');
}

// Use an item. `target` is the player it's used on (if it needs one).
async function useItem(p, id, target) {
  const k = p.items.indexOf(id);
  if (k < 0) return;
  p.items.splice(k, 1);
  const pi = seatOf(p);
  const by = p.you ? 'You' : p.name;
  if (id === 'potion') {
    await Table.usePotion(pi);
    p.lives++;
    Table.setLives(pi, p.lives);
    log(`${by} drank a <b>health potion</b>: ${p.lives} ${p.lives === 1 ? 'life' : 'lives'}.`);
  } else if (id === 'bandage') {
    await Table.useBandage(pi, seatOf(target));
    target.bleeding = false;
    log(`${by} bandaged ${target === p ? (p.you ? 'yourself' : 'themself') : nameOf(target)}. The bleeding stops.`);
    refreshTags(target);
  } else if (id === 'hammer') {
    await Table.smashGun(pi);
    p.unarmed = true;
    log(`${by} smashed ${p.you ? 'your' : 'their'} own gun with a <b>hammer</b>. Nobody can shoot ${p.you ? 'you' : 'them'} this round.`);
  } else if (id === 'binoculars') {
    if (p.you) await lookThrough(target);
    else {
      await Table.binoStart(pi, seatOf(target));
      if (target.hand.includes('jack')) p.priority = target;
      log(`${p.name} looks at ${target.you ? 'your' : target.name + "'s"} cards through <b>binoculars</b>.`);
    }
  } else if (id === 'teammate') {
    await offerTeam(p, target);
  }
  refreshTags(p);
  renderAll();
}

// Your binoculars: zoom in on their cards and list them.
async function lookThrough(target) {
  document.body.classList.add('binoculars');
  await Table.binoStart(0, seatOf(target));
  const cards = target.hand.length ? target.hand.map(id => `<b>${CARD_BY_ID[id].name}</b>`).join(', ') : 'no cards';
  log(`Through the binoculars: ${target.name} holds ${cards}.`);
  await choose('BINOCULARS', `${target.name} is holding ${cards}.`, [{ label: 'Lower the binoculars', value: 1 }]);
  await Table.binoEnd();
  document.body.classList.remove('binoculars');
}

// Teammate: ask someone to team up; they say yes or no. A team needs at
// least one player left outside it to fight.
async function offerTeam(from, to) {
  if (from.team || to.team || alive().length < 3) return;
  const obj = await Table.invite(seatOf(from), seatOf(to));
  let yes;
  if (to.you) {
    yes = await choose('TEAM UP?', `${from.name} wants to team up. You'd share a couch and your cards, and vote on every card you play.`, [
      { label: 'Team up', value: true }, { label: 'Refuse', value: false },
    ]) === true;
  } else {
    setStatus(`${to.name} is thinking it over…`);
    await sleep(900);
    yes = Bots.acceptTeam(to, from);
  }
  if (!yes) {
    await Table.decline(obj);
    log(`${to.you ? 'You refuse' : to.name + ' refuses'} to team up with ${nameOf(from)}.`);
    return;
  }
  // you always lead a team you're in, so you keep choosing the cards
  const leader = to.you ? to : from, member = leader === from ? to : from;
  const team = { members: [leader, member], leader };
  leader.team = member.team = team;
  showBanner('TEAM UP');
  log(`${leader.you ? 'You' : leader.name} and ${nameOf(member)} team up. Their hands are shared now.`);
  leader.hand.push(...member.hand);
  member.hand = [];
  await Table.formTeam(seatOf(leader), seatOf(member), obj);
  refreshTags(leader); refreshTags(member);
}

// Your items: pick a target if needed, then use it.
async function useMyItem(id) {
  if (!state.myTurn || state.busy || state.over) return;
  state.busy = true;
  renderItems();
  const others = alive().filter(p => !p.you);
  let target = me();
  if (id === 'bandage') {
    const hurt = alive().filter(p => p.bleeding);
    target = hurt.length === 1 ? hurt[0] : await choose('BANDAGE', 'Who do you bandage?',
      hurt.map(p => ({ label: p.you ? 'Yourself' : p.name, value: p })).concat([{ label: 'Cancel', value: null }]));
  } else if (id === 'binoculars') {
    target = await choose('BINOCULARS', "Whose cards do you want to see?",
      others.filter(p => p !== teammateOf(me())).map(p => ({ label: p.name, value: p })).concat([{ label: 'Cancel', value: null }]));
  } else if (id === 'teammate') {
    target = await choose('TEAMMATE', 'Who do you ask to team up?',
      others.filter(p => !p.team).map(p => ({ label: p.name, value: p })).concat([{ label: 'Cancel', value: null }]));
  }
  if (target) await useItem(me(), id, target);
  if (state.over) return;
  state.busy = false;
  renderAll();
  if (state.selected >= 0) selectCard(state.selected);
  setStatus('Your turn: tap a card, then tap it again to play');
}

// Why an item can't be used right now ('' when it can).
function itemBlocked(id) {
  if (id === 'bandage' && !alive().some(p => p.bleeding)) return 'Nobody is bleeding';
  if (id === 'hammer' && me().unarmed) return 'Already unarmed';
  if (id === 'teammate') {
    if (me().team) return 'Already on a team';
    if (alive().length < 3) return 'Nobody would be left to fight';
    if (!alive().some(p => !p.you && !p.team)) return 'Nobody free to team with';
  }
  return '';
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
      b.addEventListener('click', () => { hidePanel(); resolve(o.value); });
      panel.appendChild(b);
    });
    panel.classList.remove('hidden');
  });
}

function askForTarget(reason, targets) {
  const shotgun = me().shotgun > 0;
  const next = me().gun[0];
  const hint = shotgun
    ? `You hold the <b class="live">shotgun</b> (${me().shotgun} live shell${me().shotgun === 1 ? '' : 's'}): one hit kills.`
    : next && next.known
      ? `You know your next round is <b class="${next.live ? 'live' : 'blank'}">${next.live ? 'LIVE' : 'BLANK'}</b>.`
      : "You don't know if your next round is live or blank.";
  const others = targets.filter(p => !p.you);
  const options = [];
  if (!shotgun) options.push({ label: 'Shoot yourself', value: me(), cls: 'self' });
  others.forEach(p => options.push({ label: `Shoot ${p.name}${p.bleeding ? ' (bleeding)' : ''}${p === teammateOf(me()) ? ' (teammate)' : ''}`, value: p }));
  if (!options.length) options.push({ label: 'Hold fire (nobody to shoot)', value: null });
  setStatus('Pick who to shoot');
  return choose('SHOOTOUT', `${reason}. ${hint}`, options);
}

function hidePanel() { $('#shootout').classList.add('hidden'); }

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

// Words under a bot's name in the room.
function refreshTags(p) {
  if (!p || p.you) return;
  const tags = [];
  if (p.bleeding) tags.push('BLEEDING');
  if (p.unarmed) tags.push('UNARMED');
  if (p.hasShotgun && p.shotgun > 0) tags.push('SHOTGUN');
  if (teammateOf(p)) tags.push(teammateOf(p).you ? 'YOUR TEAMMATE' : 'TEAM');
  Table.setTags(seatOf(p), tags);
}

// ---------- HUD ----------

// Your gun and lives: the next three rounds (? until a 1/2/3 card reveals
// them) and one red mark per life.
function renderGun() {
  const box = $('#my-gun');
  const p = me();
  if (!p) return;
  ensureRounds(p, 3);
  const marks = Array.from({ length: Math.max(0, p.lives) }, () => '<i></i>').join('');
  const status = !p.alive ? '' : p.unarmed ? '<div class="tag">UNARMED</div>'
    : p.shotgun > 0 ? `<div class="tag">SHOTGUN · ${p.shotgun} LIVE</div>` : '';
  box.innerHTML = `<div class="gun-label">LIVES</div><div class="lives">${marks}</div>` +
    (p.bleeding ? `<div class="tag bleed">BLEEDING OUT</div>` : '') + status +
    '<div class="gun-label">YOUR GUN</div>' + p.gun.slice(0, 3).map((r, i) => {
      const cls = r.known ? (r.live ? 'live' : 'blank') : 'unknown';
      const text = r.known ? (r.live ? 'LIVE' : 'BLANK') : '?';
      return `<div class="chamber ${cls}"><span>${['NEXT', '2ND', '3RD'][i]}</span>${text}</div>`;
    }).join('');
  document.body.classList.toggle('bleeding', !!(p.alive && p.bleeding));
}

function renderItems() {
  const bar = $('#items');
  const p = me();
  if (!p) return;
  const can = state.myTurn && !state.busy && !state.over;
  let html = '';
  if (state.box && state.box.owner === p && !state.over) {
    html += `<button class="item box" data-box ${can ? '' : 'disabled'}><b>Open box</b><span>Two random items inside</span></button>`;
  }
  html += p.items.map((id, i) => {
    const why = itemBlocked(id);
    return `<button class="item" data-item="${id}" ${can && !why ? '' : 'disabled'} title="${ITEMS[id].desc}"><b>${ITEMS[id].name}</b><span>${why || ITEMS[id].desc}</span></button>`;
  }).join('');
  bar.innerHTML = html ? `<div class="gun-label">ITEMS</div>${html}` : '';
  bar.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => useMyItem(b.dataset.item)));
  const boxBtn = bar.querySelector('[data-box]');
  if (boxBtn) boxBtn.addEventListener('click', openMyBox);
}

function renderAll() {
  if (!state.mode) return;
  $('#round-label').textContent = 'ROUND ' + state.round;
  $('#mode-label').textContent = state.mode.label.toUpperCase() + ' · ' + state.mode.players + (state.mode.players === 1 ? ' PLAYER' : ' PLAYERS');
  renderGun();
  renderItems();
}

function selectCard(i) {
  state.selected = i;
  Table.select(i);
  const info = $('#card-info');
  if (i < 0 || !me().hand[i]) { info.classList.add('hidden'); return; }
  const c = CARD_BY_ID[me().hand[i]];
  info.innerHTML = `<b>${c.name}</b>${c.effect}` +
    (state.myTurn && !state.busy
      ? '<button class="play">Play card</button><small>or tap the card again, or drag it onto the table</small>'
      : '<small>Wait for your turn.</small>');
  const play = info.querySelector('.play');
  if (play) play.addEventListener('click', playSelected);
  info.classList.remove('hidden');
}
