// Shootout — card definitions.
// Every card has a rarity. Most cards fill hand slots by `weight` (out of
// 100, so `weight` is the % chance for each slot). The rarest cards carry a
// `handChance` instead: the chance that a dealt hand holds one (never more
// than one).

const RARITY = {
  common:    { label: 'Common',    color: '#b8b0a0' },
  uncommon:  { label: 'Uncommon',  color: '#5ac85a' },
  rare:      { label: 'Rare',      color: '#4a9aff' },
  epic:      { label: 'Epic',      color: '#b45aff' },
  legendary: { label: 'Legendary', color: '#ffb020' },
};

const CARDS = [
  { id: 'jack',     name: 'Jack of Trades', icon: '🃏', corner: 'J',  style: '',         rarity: 'epic',      effect: 'Play it and you win the game on the spot.', instantWin: true, handChance: 0.10 },
  { id: 'bloody',   name: 'Bloody Mary',    icon: '🩸', corner: 'BM', style: 'dark red', rarity: 'uncommon',  effect: 'Forces a shootout right now: everyone must shoot themself or someone else.', forcesShootout: true, handChance: 0.20 },
  { id: 'gun',      name: 'Gun',            icon: '🔫', corner: 'G',  style: '',         rarity: 'rare',      effect: 'Gives you your big gun for this round (a shotgun unless you picked another in Loadout): 2 shots, both live, and one hit kills anyone.', shotgun: true, weight: 6 },
  { id: 'grenade',  name: 'Grenade',        icon: '💣', corner: 'GR', style: '',         rarity: 'epic',      effect: 'Blows up the table: everyone else is hit and loses all their cards and items. You keep yours, but the blast leaves you bleeding out too.', grenade: true, handChance: 0.08 },
  { id: 'nuclear',  name: 'Nuclear',        icon: '☢️', corner: 'N',  style: 'dark',     rarity: 'legendary', effect: 'Launches a nuclear bomb on the table. Everyone else is wiped out and you win on the spot.', nuke: true, handChance: 0.03 },
  { id: 'block',    name: 'Block',          icon: '🛡️', corner: 'B',  style: '',         rarity: 'uncommon',  effect: 'A steel shield rises in front of you. It stops the next hit you would take this round: a bullet, a shotgun blast or a grenade.', block: true, weight: 15 },
  { id: 'reverse',  name: 'Reverse',        icon: '🔄', corner: 'R',  style: '',         rarity: 'uncommon',  effect: 'The next live shot someone fires at you this round turns around and hits them instead.', reverse: true, weight: 13 },
  { id: 'one',      name: '1',              icon: '1',  corner: '1',  style: '',         rarity: 'common',    effect: 'Secretly shows you if the next round in your gun is live or blank.', peek: 1, weight: 22 },
  { id: 'two',      name: '2',              icon: '2',  corner: '2',  style: '',         rarity: 'common',    effect: 'Secretly shows you if the 2nd round in your gun is live or blank.', peek: 2, weight: 22 },
  { id: 'three',    name: '3',              icon: '3',  corner: '3',  style: '',         rarity: 'common',    effect: 'Secretly shows you if the 3rd round in your gun is live or blank.', peek: 3, weight: 22 },
];

// How likely a card is, in words: "22% per card" or "10% per hand".
function cardOdds(c) {
  return c.handChance ? `${Math.round(c.handChance * 100)}% chance per hand` : `${c.weight}% chance per card dealt`;
}

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

const HAND_SIZE = 3;

// Deal a random hand. Each slot is drawn from the weighted cards, so a hand
// can hold repeats. Cards with a `handChance` are rolled separately: each has
// that chance of showing up once in a hand, and never more than once.
function drawWeighted() {
  const pool = CARDS.filter(c => !c.handChance);
  let r = Math.random() * pool.reduce((t, c) => t + c.weight, 0);
  for (const c of pool) { r -= c.weight; if (r < 0) return c.id; }
  return pool[pool.length - 1].id;
}
function dealHand(size = HAND_SIZE) {
  const hand = [];
  for (let i = 0; i < size; i++) hand.push(drawWeighted());
  const freeSlots = [...hand.keys()];
  for (const rare of CARDS.filter(c => c.handChance)) {
    if (Math.random() < rare.handChance) {
      if (!freeSlots.length) break;
      const [slot] = freeSlots.splice(Math.floor(Math.random() * freeSlots.length), 1);
      hand[slot] = rare.id;
    }
  }
  return hand;
}
