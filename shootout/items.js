// Shootout — items found in the boxes that sometimes land on the table.
// Items are separate from cards: you keep them until you use them, and you
// can use any number of them on your turn before you play a card.

const ITEMS = {
  potion:     { name: 'Health Potion', desc: 'Drink it to gain an extra life (one more red mark on your side of the table).' },
  bandage:    { name: 'Bandage',       desc: 'Stop yourself or another player from bleeding out.' },
  teammate:   { name: 'Teammate',      desc: 'Ask another player to team up. If they say yes, your chairs become a couch, you share your cards and you vote on every card you play.' },
  hammer:     { name: 'Hammer',        desc: 'Smash your own gun. Nobody can shoot you this round, but you sit the shootouts out. You get a new gun next round.' },
  binoculars: { name: 'Binoculars',    desc: "Look at any player's cards." },
};

// Chance that a box lands on the table at the start of a round (from round 2).
const BOX_CHANCE = 0.4;
const BOX_ITEMS = 2;

// Two random items (repeats allowed).
function rollItems(n = BOX_ITEMS) {
  const ids = Object.keys(ITEMS);
  return Array.from({ length: n }, () => ids[Math.floor(Math.random() * ids.length)]);
}
