// Shootout — card definitions.
// Every card in the game lives here. The `effect` text is a placeholder
// until each card's rules are written; `play()` hooks are where the
// real behaviour will go.

const CARDS = [
  { id: 'jack',     name: 'Jack of Trades', icon: '🃏', corner: 'J',  style: '',         effect: 'Effect not written yet.' },
  { id: 'bloody',   name: 'Bloody Mary',    icon: '🩸', corner: 'BM', style: 'dark red', effect: 'Effect not written yet.' },
  { id: 'gun',      name: 'Gun',            icon: '🔫', corner: 'G',  style: '',         effect: 'Effect not written yet.' },
  { id: 'grenade',  name: 'Grenade',        icon: '💣', corner: 'GR', style: '',         effect: 'Effect not written yet.' },
  { id: 'nuclear',  name: 'Nuclear',        icon: '☢️', corner: 'N',  style: 'dark',     effect: 'Effect not written yet.' },
  { id: 'block',    name: 'Block',          icon: '🛡️', corner: 'B',  style: '',         effect: 'Effect not written yet.' },
  { id: 'reverse',  name: 'Reverse',        icon: '🔄', corner: 'R',  style: '',         effect: 'Effect not written yet.' },
  { id: 'one',      name: '1',              icon: '1',  corner: '1',  style: '',         effect: 'Effect not written yet.' },
  { id: 'two',      name: '2',              icon: '2',  corner: '2',  style: '',         effect: 'Effect not written yet.' },
  { id: 'three',    name: '3',              icon: '3',  corner: '3',  style: '',         effect: 'Effect not written yet.' },
];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

const HAND_SIZE = 10;

// Deal a random hand. Each card is drawn at random, so a hand can hold repeats.
function dealHand(size = HAND_SIZE) {
  const hand = [];
  for (let i = 0; i < size; i++) {
    hand.push(CARDS[Math.floor(Math.random() * CARDS.length)].id);
  }
  return hand;
}
