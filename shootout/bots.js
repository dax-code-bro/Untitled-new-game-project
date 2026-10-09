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

  // Who the bot shoots. `players` is everyone still alive (including the bot).
  function chooseTarget(bot, players) {
    const others = players.filter(p => p !== bot);
    if (!others.length) return bot;
    const next = bot.gun[0];
    const usesInfo = difficulty !== 'easy' || chance(0.5);

    let selfShot;
    if (next && next.known && usesInfo) selfShot = !next.live;   // live: shoot someone else; blank: safe on themself
    else selfShot = chance(PERSONALITIES[bot.personality].selfChance);
    if (selfShot) return bot;

    // Vengeful bots shoot back at whoever last shot at them.
    if (bot.personality === 'vengeful' && bot.shotBy && others.includes(bot.shotBy)) return bot.shotBy;

    // Hard bots gang up on you.
    const you = others.find(p => p.you);
    if (difficulty === 'hard' && you && chance(0.6)) return you;

    return pick(others);
  }

  function setDifficulty(d) { difficulty = d; }

  return { lineup, label, chooseCard, chooseTarget, setDifficulty };
})();
