// Shootout — computer opponents.
// Each bot has a name and a personality that shapes who they shoot and how
// often they turn the gun on themself. The difficulty setting decides how
// well they use their cards: Easy bots play almost at random, Hard bots
// peek at their gun before shootouts, cash in a Jack of Trades straight away
// and gang up on you.

const Bots = (() => {
  const PERSONALITIES = {
    reckless:    { label: 'Reckless',    selfChance: 0.10 },   // points the gun at others, almost never at themself
    vengeful:    { label: 'Vengeful',    selfChance: 0.20 },   // shoots back at whoever last shot at them
    calculating: { label: 'Calculating', selfChance: 0.35 },   // leans hardest on peeking with 1/2/3
    cautious:    { label: 'Cautious',    selfChance: 0.15 },   // hoards peek cards, only risks themself when sure
    chaotic:     { label: 'Chaotic',     selfChance: 0.50 },   // coin flip on everything, loves Bloody Mary
  };

  const ROSTER = [
    { name: 'Dutch Calloway', personality: 'reckless' },
    { name: 'Sadie Graves',   personality: 'vengeful' },
    { name: 'Doc Whitmore',   personality: 'calculating' },
    { name: 'Silent Jim',     personality: 'cautious' },
    { name: 'Mad Maggie',     personality: 'chaotic' },
    { name: 'Hosea Crane',    personality: 'calculating' },
    { name: 'Bill Mercer',    personality: 'reckless' },
    { name: 'Abigail Rourke', personality: 'vengeful' },
  ];

  let difficulty = 'normal';   // 'easy' | 'normal' | 'hard'

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const chance = p => Math.random() < p;

  // n bots with different names, in random order.
  function lineup(n) {
    const pool = [...ROSTER];
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const [b] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      out.push({ name: b.name, personality: b.personality, bot: true });
    }
    return out;
  }

  function label(bot) { return PERSONALITIES[bot.personality].label; }

  // Which card in the bot's hand to play. Returns an index into bot.hand.
  function chooseCard(bot) {
    const hand = bot.hand;
    const find = id => hand.indexOf(id);
    const random = () => Math.floor(Math.random() * hand.length);
    if (difficulty === 'easy') return random();

    // A Jack of Trades wins on the spot, so smart bots never sit on one.
    if (find('jack') >= 0) return find('jack');

    const next = bot.gun[0];
    const smart = difficulty === 'hard' || bot.personality === 'calculating' || bot.personality === 'cautious';

    // A shotgun only lasts this round and never misses: take it.
    if (find('gun') >= 0 && (smart || chance(0.5))) return find('gun');

    // Known live round in the chamber: force a shootout and use it on someone.
    if (next && next.known && next.live && find('bloody') >= 0 && (smart || chance(0.5))) return find('bloody');

    // Chaotic bots can't resist starting a shootout.
    if (bot.personality === 'chaotic' && find('bloody') >= 0 && chance(0.6)) return find('bloody');

    // Peek at the next round before the shootout if it's still a mystery.
    if (next && !next.known && find('one') >= 0 && (smart || chance(0.5))) return find('one');

    // Otherwise keep the useful cards and play something else.
    const keep = new Set(['jack', 'bloody', 'one', 'two', 'three']);
    const filler = hand.map((id, i) => i).filter(i => !keep.has(hand[i]));
    if (filler.length && (smart || chance(0.6))) return pick(filler);
    return random();
  }

  // Who the bot shoots. `players` is everyone the bot may aim at (itself
  // included); unarmed players are already left out.
  function chooseTarget(bot, players) {
    const mate = p => bot.team && bot.team.members.includes(p);
    let others = players.filter(p => p !== bot);
    const enemies = others.filter(p => !mate(p));
    if (enemies.length) others = enemies;
    if (!others.length) return bot;

    // With a shotgun every shot kills: never point it at yourself.
    if (bot.shotgun > 0) {
      if (bot.priority && others.includes(bot.priority)) return bot.priority;
      return pick(others);
    }
    const next = bot.gun[0];
    const usesInfo = difficulty !== 'easy' || chance(0.5);

    let selfShot;
    if (next && next.known && usesInfo) selfShot = !next.live;   // live: shoot someone else; blank: safe on themself
    else selfShot = chance(PERSONALITIES[bot.personality].selfChance);
    if (selfShot) return bot;

    // Someone they spotted holding a Jack of Trades through binoculars.
    if (bot.priority && others.includes(bot.priority) && chance(0.8)) return bot.priority;

    // Vengeful bots shoot back at whoever last shot at them.
    if (bot.personality === 'vengeful' && bot.shotBy && others.includes(bot.shotBy)) return bot.shotBy;

    // Hard bots gang up on you.
    const you = others.find(p => p.you);
    if (difficulty === 'hard' && you && chance(0.6)) return you;

    return pick(others);
  }

  // Items a bot uses at the start of its turn: [{ item, target }].
  // `ctx.alive` is every living player; `ctx.danger` is true when someone
  // holds a shotgun this round.
  function chooseItems(bot, ctx) {
    const acts = [];
    const has = id => bot.items.includes(id);
    const mates = bot.team ? bot.team.members.filter(p => p !== bot && p.alive) : [];
    const others = ctx.alive.filter(p => p !== bot && !mates.includes(p));
    if (has('potion')) acts.push({ item: 'potion', target: bot });
    if (has('bandage')) {
      if (bot.bleeding) acts.push({ item: 'bandage', target: bot });
      else { const hurt = mates.find(p => p.bleeding); if (hurt) acts.push({ item: 'bandage', target: hurt }); }
    }
    if (has('hammer') && !bot.unarmed && (bot.bleeding || ctx.danger || (difficulty !== 'easy' && bot.lives <= 1 && chance(0.25)))) {
      acts.push({ item: 'hammer', target: bot });
    }
    if (has('binoculars') && others.length && chance(difficulty === 'easy' ? 0.3 : 0.7)) {
      acts.push({ item: 'binoculars', target: pick(others) });
    }
    if (has('teammate') && !bot.team && ctx.alive.length >= 3 && chance(0.5)) {
      const free = others.filter(p => !p.team);
      if (free.length) acts.push({ item: 'teammate', target: pick(free) });
    }
    return acts;
  }

  // Does this bot agree to team up with `inviter`?
  function acceptTeam(bot, inviter) {
    if (bot.shotBy === inviter) return false;              // you shot me
    if (bot.personality === 'vengeful') return chance(0.4);
    if (bot.personality === 'reckless') return chance(0.5);
    return chance(0.7);
  }

  // A teammate's vote on the card you want to play from the shared hand.
  // Returns the index the bot prefers; the same index means it agrees.
  function vote(bot, hand, proposed) {
    if (hand[proposed] === 'jack') return proposed;
    const pref = chooseCard({ ...bot, hand });
    if (pref === proposed || hand[pref] === hand[proposed]) return proposed;
    return chance(0.65) ? proposed : pref;
  }

  function setDifficulty(d) { difficulty = d; }

  return { lineup, label, chooseCard, chooseTarget, chooseItems, acceptTeam, vote, setDifficulty };
})();
