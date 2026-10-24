// Shootout — the ten characters you can play as.
// Each one is a full look for the 3D model (hat, face, hair, clothes and
// extras) plus the personality a bot uses when it plays that character.
// Nobody can be the same character as someone else at the table.

const CHARACTERS = [
  {
    id: 'drifter', short: 'The Drifter', name: 'The Drifter', personality: 'calculating',
    blurb: 'A quiet gunslinger in a dust-caked duster. Never says where he came from.',
    look: { hat: 'cowboy', hatColor: 0x3a2a18, coat: 0x6a5038, shirt: 0x9a8a6a, skin: 0x9a7058, hair: 0x2a1a10, hairStyle: 'short',
      facial: 'stubble', facialColor: 0x2a1a10, scarf: 0x7a1a14, extras: ['coattails'] },
  },
  {
    id: 'sheriff', short: 'Sheriff Holt', name: 'Sheriff Wade Holt', personality: 'vengeful',
    blurb: 'Wears the star and expects it to be respected. Holds a grudge longer than a drought.',
    look: { hat: 'cowboy', hatColor: 0xa88a5a, coat: 0x4a3a2a, shirt: 0xd8d0c0, vest: 0x5a3a22, skin: 0x9a7058, hair: 0x6a5a4a, hairStyle: 'short',
      facial: 'mustache', facialColor: 0x7a6a5a, scarf: null, extras: ['badge', 'vest'] },
  },
  {
    id: 'preacher', short: 'Preacher Cain', name: 'Preacher Ezekiel Cain', personality: 'cautious',
    blurb: 'Reads last rites over the men he shoots. Prays before every trigger pull.',
    look: { hat: 'flat', hatColor: 0x121212, coat: 0x161616, shirt: 0x202020, skin: 0xa88068, hair: 0x9a9a9a, hairStyle: 'short',
      facial: 'beard', facialColor: 0x9a9a9a, scarf: null, extras: ['collar', 'coattails'] },
  },
  {
    id: 'bandit', short: 'El Coyote', name: 'El Coyote', personality: 'reckless',
    blurb: 'Rode up from the border with a price on his head and a smile under the bandana.',
    look: { hat: 'sombrero', hatColor: 0x8a6a3a, coat: 0x5a3020, shirt: 0xc8a878, skin: 0x7a5232, hair: 0x140c08, hairStyle: 'short',
      facial: 'none', scarf: null, extras: ['mask', 'poncho', 'bandolier'] },
  },
  {
    id: 'gambler', short: 'Lucky Jack', name: '"Lucky" Jack Marlowe', personality: 'chaotic',
    blurb: 'Bets his life the way other men bet a dollar, and has never once lost it.',
    look: { hat: 'top', hatColor: 0x0e0e0e, coat: 0x2a1a3a, shirt: 0xe8e0d0, vest: 0x8a1a1a, skin: 0xb08870, hair: 0x1a1a1a, hairStyle: 'short',
      facial: 'pencil', facialColor: 0x1a1a1a, scarf: null, extras: ['vest', 'bowtie', 'monocle', 'cigar'] },
  },
  {
    id: 'hunter', short: 'Grim Vane', name: 'Silas "Grim" Vane', personality: 'vengeful',
    blurb: 'A bounty hunter who lost an eye to the last man who ran. That man is buried in Kansas.',
    look: { hat: 'cowboy', hatColor: 0x2a2018, coat: 0x2a3a2a, shirt: 0x5a5040, skin: 0x8a6048, hair: 0x2a2018, hairStyle: 'short',
      facial: 'stubble', facialColor: 0x2a2018, scarf: null, extras: ['furcollar', 'eyepatch', 'scar', 'bandolier'] },
  },
  {
    id: 'doctor', short: 'Doc Fell', name: 'Doc Ambrose Fell', personality: 'calculating',
    blurb: 'Patches up the wounded and does the math on everyone else at the table.',
    look: { hat: 'bowler', hatColor: 0x242424, coat: 0x3a3a42, shirt: 0xe0dcd0, vest: 0x5a5a5a, skin: 0xc0987a, hair: 0x6a4a30, hairStyle: 'sideburns',
      facial: 'mustache', facialColor: 0x6a4a30, scarf: null, extras: ['vest', 'tie', 'spectacles'] },
  },
  {
    id: 'widow', short: 'The Widow', name: 'Lillian Black, the Widow', personality: 'cautious',
    blurb: 'Buried three husbands. Wears black to every table and never says who is next.',
    look: { hat: 'veil', hatColor: 0x0c0c0c, coat: 0x141014, shirt: 0x141014, skin: 0xe0c0a8, hair: 0x0c0806, hairStyle: 'long',
      facial: 'none', scarf: null, female: true, extras: ['dress', 'lips'] },
  },
  {
    id: 'rose', short: 'Rattlesnake Rose', name: 'Rattlesnake Rose', personality: 'reckless',
    blurb: 'Fastest hands in three territories and a temper to match. Strikes first, always.',
    look: { hat: 'cowgirl', hatColor: 0x7a2a18, coat: 0x6a3a1a, shirt: 0xd8c8a8, vest: 0x5a2e14, skin: 0xd0a080, hair: 0x9a3a14, hairStyle: 'braid',
      facial: 'none', scarf: 0xa01818, female: true, extras: ['vest', 'lips'] },
  },
  {
    id: 'undertaker', short: 'Mortimer Grave', name: 'Mortimer Grave', personality: 'chaotic',
    blurb: 'The town undertaker. Measures everyone at the table for a coffin, just in case.',
    look: { hat: 'stovepipe', hatColor: 0x0a0a0a, coat: 0x0e0e10, shirt: 0x2a2a2e, skin: 0xb0aaa0, hair: 0x8a8a8a, hairStyle: 'sideburns',
      facial: 'none', scarf: null, build: { w: 0.88, h: 1.06 }, extras: ['coattails', 'tie'] },
  },
];

const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

// The characters nobody has taken, in random order (bots pick from these).
function freeCharacters(taken) {
  const free = CHARACTERS.filter(c => !taken.includes(c.id));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  return free;
}
