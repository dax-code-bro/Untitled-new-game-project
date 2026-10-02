/* ================================================================
   THE CAMPAIGN'S PEOPLE
   ================================================================
   Who they are, as the engine's castMember (engine/src/95e-cast.js)
   builds them. One entry per person; a mission names them by key.

   The team, as written by the user:

   SPITE     Carlos Martinez. The player. Civilian clothes under a
             black plate carrier, an M4 with a red dot, a 1911 in his
             holster. Just trying to get the job done; loves his team.
   PAYBACK   30. Loud, curses a lot, proud of her work. A long mask,
             eyes that have seen everything, a skull tattoo on her
             shoulder, civilian clothes under a plate carrier, no
             helmet. A bronze Desert Eagle is her primary.
   MOLOTOV   Russian-American. Strict, confident, quiet. Nobody knows
             his real name and nobody has seen his face: a ski mask he
             spray-painted with fire, black round his blue eyes,
             pitch-black tactical gear. Molotovs and a pump shotgun with
             a fire charm hanging off it.
   ALEC      Alec Sharp, 82, an Irish veteran. Slick, humorous,
             confident, proud. Black tactical gear with bright colours
             here and there, a tan mask with a microphone.
   MIKE      A hacker more than a soldier. Nervous, scared, hates
             killing. Civilian clothes under heavy armour, a lot of
             explosives and a pepper-ball rifle.
   LINCOLN   Sergeant Lincoln. Bald, standard camouflage, a golden
             Mauser on his hip.
   BRIAN / JESSE  The Wolfhard twins, snipers with .50s, in standard
             uniform. Different faces, almost identical.
   ================================================================ */
(function () {
  var W = window;

  // M81 woodland, at a printed repeat of about 60 cm (the body's UVs are in metres).
  var CAMO = { color: 0xffffff, texture: 'camo', roughness: 0.92, metalness: 0, uvScale: 1.7, sheen: 0.25, sheenColor: 0x8a8f78 };
  var KNIT_BLACK = { color: 0x1c1d1f, texture: 'knit', roughness: 0.96, metalness: 0, uvScale: 4 };
  var FLAME_MASK = { color: 0xffffff, texture: 'flameknit', roughness: 0.92, metalness: 0, uvScale: 1 };
  var TAN_MASK = { color: 0xb39a72, texture: 'knit', roughness: 0.95, metalness: 0, uvScale: 4 };
  var KIT_BLACK = 0x1f2022;

  var CAST = {
    spite: {
      id: 'spite', age: 34, name: 'Spite', frame: 'male', face: 'delta', seed: 11, height: 1.80, build: 1.02,
      skin: 0xb08560, hair: 'short', hairColor: 0x17110d, beard: 'stubble', brows: 'straight', eyeColor: 0x3a2618,
      outfit: {
        top: { color: 0x59604e, sleeve: 0.22 },                    // a faded olive tee
        bottom: { color: 0x2e3a52, knees: true },                   // jeans
        shoes: { kind: 'boot', color: 0x3a2c1f },
      },
      gear: ['carrier', 'pouches', 'admin', 'belt'], gearOpts: { pouches: 3, holster: true, kitColor: KIT_BLACK },
      voice: { pitch: 98, rate: 5.3 },
      weapon: 'm4',
    },
    payback: {
      id: 'payback', age: 30, name: 'Payback', frame: 'female', face: 'alpha', seed: 37, height: 1.69, build: 0.98,
      skin: 0xc49a72, hair: 'tied', hairColor: 0x15100c, brows: 'angled', eyeColor: 0x2c3a2a,
      outfit: {
        top: { color: 0x34363a, sleeve: 0.0, collar: 0.508 },      // a charcoal tank top: the shoulder shows
        bottom: { color: 0x3b3f46 },                                // dark work trousers
        shoes: { kind: 'boot', color: 0x1d1a17 },
      },
      gear: ['carrier', 'pouches', 'belt'], gearOpts: { pouches: 2, holster: true, kitColor: KIT_BLACK },
      mask: 'gaiter', maskMaterial: KNIT_BLACK,
      tattoo: 'skull',
      voice: { pitch: 132, rate: 5.8, tract: 0.88 },
      weapon: 'deagle',
    },
    molotov: {
      id: 'molotov', age: 38, name: 'Molotov', frame: 'male', face: 'charlie', seed: 23, height: 1.86, build: 1.08,
      skin: 0xe8c4a8, hair: 'crop', hairColor: 0xd8c08a, eyeColor: 0x4d6f96, eyeBlack: true,
      fatigues: 'black',
      gear: ['carrier', 'pouches', 'admin', 'belt', 'knees'], gearOpts: { pouches: 3, holster: false, kitColor: 0x161718 },
      mask: 'balaclava', maskMaterial: FLAME_MASK,
      voice: { pitch: 80, rate: 4.6, tract: 1.12 },
      weapon: 'trench',
    },
    alec: {
      id: 'alec', age: 82, name: 'Alec', frame: 'male', face: 'destroyer', seed: 61, height: 1.75, build: 0.96,
      skin: 0xe2b9a0, hair: 'swept', hairColor: 0xd9d6cf, brows: 'bushy', browColor: 0xcfcac0, eyeColor: 0x5a7690,
      fatigues: 'black',
      gear: ['carrier', 'pouches', 'belt', 'knees'], gearOpts: { pouches: 2, holster: true, kitColor: KIT_BLACK },
      mask: 'gaiter', maskMaterial: TAN_MASK, mic: true,
      accents: [0xe2a21a, 0x1fa6a0],                                // bright bands: amber and teal
      voice: { pitch: 96, rate: 5.0, tract: 1.04 },
      weapon: 'm16',
    },
    mike: {
      id: 'mike', age: 26, name: 'Mike', frame: 'male', face: 'alpha', seed: 44, height: 1.77, build: 0.94,
      skin: 0xd7ad8a, hair: 'thick', hairColor: 0x4a3524, brows: 'thin', eyeColor: 0x4b3a26,
      outfit: {
        top: { color: 0x4d5866, sleeve: 0.93, collar: 0.52, hem: -0.07 },   // a grey-blue sweatshirt
        under: { color: 0x1b1d21 },
        bottom: { color: 0x7c6d52 },                                         // khakis
        shoes: { kind: 'sneaker', color: 0xd9d6cf, sole: 0x3a3a3a },
      },
      gear: ['carrier', 'pouches', 'admin', 'belt', 'knees', 'helmet'], gearOpts: { pouches: 4, holster: false, kitColor: 0x2b2d30 },
      voice: { pitch: 118, rate: 6.2, tract: 0.94 },
      weapon: 'pepperball',
    },
    lincoln: {
      id: 'lincoln', age: 50, name: 'Lincoln', frame: 'heavy', face: 'abscess', seed: 52, height: 1.83, build: 1.12,
      skin: 0xb88a68, hair: null, brows: 'heavy', browColor: 0x2a2018, eyeColor: 0x3a2a1c,
      fatigues: CAMO,
      gear: ['belt'], gearOpts: { holster: true, kitColor: 0x3e3a2c },
      voice: { pitch: 86, rate: 5.0, tract: 1.10 },
      weapon: 'mauser-gold',
    },
    brian: {
      id: 'brian', age: 29, name: 'Brian Wolfhard', frame: 'male', face: 'swat', seed: 71, height: 1.81, build: 1.0,
      skin: 0xc8a07c, hair: 'crop', hairColor: 0x3a2a1c, brows: 'straight', eyeColor: 0x4a5a3a,
      fatigues: CAMO,
      gear: ['carrier', 'pouches', 'belt', 'knees', 'helmet'], gearOpts: { pouches: 2, kitColor: 0x4a4a36 },
      voice: { pitch: 102, rate: 5.4 },
      weapon: 'barrett',
    },
    jesse: {
      id: 'jesse', age: 29, name: 'Jesse Wolfhard', frame: 'male', face: 'swat', seed: 72, height: 1.81, build: 1.0,
      skin: 0xc8a07c, hair: 'crop', hairColor: 0x3a2a1c, brows: 'angled', beard: 'moustache', beardColor: 0x3a2a1c, eyeColor: 0x4a5a3a,
      fatigues: CAMO,
      gear: ['carrier', 'pouches', 'belt', 'knees', 'helmet'], gearOpts: { pouches: 2, kitColor: 0x4a4a36 },
      voice: { pitch: 106, rate: 5.4 },
      weapon: 'barrett',
    },
    soldier: {
      id: 'soldier', name: 'Soldier', frame: 'male', face: 'delta', seed: 81, height: 1.78,
      skin: 'tan', hair: 'crop', hairColor: 0x2a2018,
      fatigues: CAMO,
      gear: ['carrier', 'pouches', 'admin', 'belt', 'knees', 'helmet', 'goggles'], gearOpts: { pouches: 3, kitColor: 0x4a4a36 },
      voice: { pitch: 100 },
      weapon: 'm16',
    },
  };

  /* HYDRA: the people you fight. Three weeks before, civilians -- so
     they are dressed as civilians, with whatever webbing they were
     handed. A handful of bodies and skins, dealt out round-robin. */
  var HYDRA_LOOKS = [
    { outfit: 'street', skin: 0x9c7250, face: 'alpha', frame: 'male' },
    { outfit: 'flannel', skin: 0x8a6444, face: 'delta', frame: 'male' },
    { outfit: 'farmer', skin: 0xb08562, face: 'charlie', frame: 'heavy' },
    { outfit: 'workshirt', skin: 0x7a5a3c, face: 'destroyer', frame: 'male' },
    { outfit: 'mechanic', skin: 0xa77a55, face: 'swat', frame: 'male' },
    { outfit: 'college', skin: 0x936a48, face: 'abscess', frame: 'male' },
  ];
  HYDRA_LOOKS.forEach(function (h, i) {
    CAST['hydra' + i] = {
      id: 'hydra' + i, name: 'Hydra', frame: h.frame, face: h.face, seed: 90 + i * 7, height: 1.70 + (i % 3) * 0.05,
      skin: h.skin, hair: ['short', 'crop', 'thick', 'short', 'swept', 'crop'][i], hairColor: 0x161210,
      beard: ['stubble', null, 'moustache', 'full', null, 'goatee'][i], beardColor: 0x161210,
      outfit: h.outfit,
      gear: i % 2 ? ['belt'] : ['carrier', 'pouches'], gearOpts: { pouches: 2, kitColor: 0x3a3a30 },
      weapon: ['ak47', 'ak47', 'g3a', 'ak47', 'falke', 'ak47'][i],
    };
  });

  W.CAMPAIGN_CAST = CAST;
  W.CAMPAIGN_HYDRA = HYDRA_LOOKS.map(function (_, i) { return 'hydra' + i; });
})();
