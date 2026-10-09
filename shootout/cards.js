// Shootout — card definitions.
// Every card in the game lives here. The `effect` text is a placeholder
// until each card's rules are written; `play()` hooks are where the
// real behaviour will go.

const CARDS = [
  { id: 'jack',     name: 'Jack of Trades', icon: '🃏', corner: 'J',  style: '',         effect: 'Play it and you win the game on the spot.', instantWin: true, handChance: 0.10 },
  { id: 'bloody',   name: 'Bloody Mary',    icon: '🩸', corner: 'BM', style: 'dark red', effect: 'Forces a shootout right now: everyone must shoot themself or someone else.', forcesShootout: true, handChance: 0.20 },
  { id: 'gun',      name: 'Gun',            icon: '🔫', corner: 'G',  style: '',         effect: 'Effect not written yet.' },
  { id: 'grenade',  name: 'Grenade',        icon: '💣', corner: 'GR', style: '',         effect: 'Effect not written yet.' },
  { id: 'nuclear',  name: 'Nuclear',        icon: '☢️', corner: 'N',  style: 'dark',     effect: 'Effect not written yet.' },
  { id: 'block',    name: 'Block',          icon: '🛡️', corner: 'B',  style: '',         effect: 'Effect not written yet.' },
  { id: 'reverse',  name: 'Reverse',        icon: '🔄', corner: 'R',  style: '',         effect: 'Effect not written yet.' },
  { id: 'one',      name: '1',              icon: '1',  corner: '1',  style: '',         effect: 'Secretly shows you if the next round in your gun is live or blank.', peek: 1 },
  { id: 'two',      name: '2',              icon: '2',  corner: '2',  style: '',         effect: 'Secretly shows you if the 2nd round in your gun is live or blank.', peek: 2 },
  { id: 'three',    name: '3',              icon: '3',  corner: '3',  style: '',         effect: 'Secretly shows you if the 3rd round in your gun is live or blank.', peek: 3 },
];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

const HAND_SIZE = 10;

// Deal a random hand. Regular cards are drawn at random, so a hand can hold
// repeats. Rare cards (those with a `handChance`) are rolled separately: each
// has that chance of showing up once in a hand, and never more than once.
function dealHand(size = HAND_SIZE) {
  const regular = CARDS.filter(c => !c.handChance);
  const hand = [];
  for (let i = 0; i < size; i++) {
    hand.push(regular[Math.floor(Math.random() * regular.length)].id);
  }
  const freeSlots = [...hand.keys()];
  for (const rare of CARDS.filter(c => c.handChance)) {
    if (Math.random() < rare.handChance) {
      const [slot] = freeSlots.splice(Math.floor(Math.random() * freeSlots.length), 1);
      hand[slot] = rare.id;
    }
  }
  return hand;
}
