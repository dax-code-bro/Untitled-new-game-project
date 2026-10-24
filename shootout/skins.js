// Shootout — Gunsmith skins.
// Skins only change how a gun looks: every revolver-slot and Gun-card gun fires
// exactly the same whatever it wears. Each skin unlocks by reaching a goal
// (see profile.js for the stats behind `stat`). The look of each skin is
// built in models.js (gunLook).

const SKINS = {
  revolver: [
    { id: 'standard',   name: 'Standard Issue',          stat: null,         n: 0,  goal: 'Yours from the start.',
      blurb: 'Case-hardened frame, blued barrel, walnut grips.' },
    { id: 'makeshift',  name: 'Makeshift Six-Shooter',   stat: 'games',      n: 3,  goal: 'Play 3 games.',
      blurb: 'Rusted parts from three dead guns, a twine-wrapped grip and a hose-clamp on the barrel.' },
    { id: 'silver',     name: 'Silver',                  stat: 'wins',       n: 3,  goal: 'Win 3 games.',
      blurb: 'Hand-polished silver with fine scrollwork and ivory grips.' },
    { id: 'billy',      name: 'Billy the Kid',           stat: 'rKills',     n: 10, goal: 'Kill 10 players with the revolver.',
      blurb: "A worn nickel Colt with notched rosewood grips. Twenty-one notches, or so the story goes." },
    { id: 'gold',       name: 'Gold',                    stat: 'wins',       n: 15, goal: 'Win 15 games.',
      blurb: 'Solid gold engraving, gold barrel and black ebony grips.' },
    { id: 'murderer',   name: "The Murderer's Device",   stat: 'kills',      n: 40, goal: 'Get 40 kills.',
      blurb: 'Blackened iron that never quite washes clean, bone grips scratched with tally marks and barbed wire.' },
    { id: 'angel',      name: 'Angel',                   stat: 'heals',      n: 15, goal: 'Heal 15 times with potions or bandages.',
      blurb: 'White pearl and soft gold with feathered wings and a glowing halo.' },
    { id: 'hellfire',   name: 'Hellfire',                stat: 'bloodyWins', n: 5,  goal: 'Win 5 Bloody Mary games.',
      blurb: 'Black metal split by veins of living fire.' },
    { id: 'darkknight', name: 'Dark Knight',             stat: 'bestStreak', n: 5,  goal: 'Win 5 games in a row.',
      blurb: 'Gothic black steel, crimson edges and a blade beneath the barrel.' },
    { id: 'diamond',    name: 'Diamond',                 stat: 'wins',       n: 50, goal: 'Win 50 games.',
      blurb: 'Every surface cut into glittering diamond facets.' },
  ],
  shotgun: [
    { id: 'standard',   name: 'Standard Issue',          stat: null,         n: 0,  goal: 'Yours from the start.',
      blurb: 'Blued barrels, engraved receiver and a walnut stock.' },
    { id: 'gold',       name: 'Gold',                    stat: 'sKills',     n: 5,  goal: 'Kill 5 players with a Gun card.',
      blurb: 'Gold barrel and frame with an ebony stock or grips.' },
    { id: 'bluelight',  name: 'Blue Light',              stat: 'blocks',     n: 10, goal: 'Stop 10 hits with a Block shield.',
      blurb: 'Black steel traced with humming electric-blue light.' },
    { id: 'hellfire',   name: 'Hellfire',                stat: 'grenades',   n: 10, goal: 'Throw 10 grenades.',
      blurb: 'Metal that glows like a forge, with burning shells.' },
    { id: 'darkknight', name: 'Dark Knight',             stat: 'bestStreak', n: 3,  goal: 'Win 3 games in a row.',
      blurb: 'Gothic black steel with crimson trim and a spiked muzzle.' },
    { id: 'diamond',    name: 'Diamond',                 stat: 'sKills',     n: 25, goal: 'Kill 25 players with a Gun card.',
      blurb: 'A gun cut from diamond, glittering in the lamplight.' },
  ],
};

const SKIN_BY_ID = {
  revolver: Object.fromEntries(SKINS.revolver.map(s => [s.id, s])),
  shotgun: Object.fromEntries(SKINS.shotgun.map(s => [s.id, s])),
};
