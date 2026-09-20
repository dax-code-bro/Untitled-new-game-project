/* ==================================================================
   MULTIPLAYER — THE NUMBERS
   ==================================================================
   Everything multiplayer is made of that is not geometry: sixty guns,
   sixty-nine attachments, the equipment, the abilities, the killstreaks,
   the maps and the two modes.

   It is one file and it is only data, deliberately. The shell reads it
   to draw the loadout screens, the match code reads it to build a gun,
   and the bots read it to pick a class. Three readers, one truth. When
   a gun's damage is wrong there is exactly one place it is wrong in.

   WHAT IS NOT HERE, AND WHY

   Zombies has weapons that only make sense against the dead: the
   Paralyzer, both Arc Breakers, the Battering Ram. A gun that freezes a
   crowd in place is not a thing you hand somebody in a six-a-side match
   -- there is no crowd, and the man you froze is a man who has stopped
   being allowed to play. They stay in zombies. Everything grounded
   comes across, the Model 5 included, because a .50 AE hand cannon is
   just a very loud pistol and multiplayer has room for one of those.

   THE SHAPE OF A GUN

     id      what the code calls it
     name    what the player calls it
     cls     assault | smg | lmg | special | pistol | launcher
     fam     the family it belongs to; attachments hang off families
     mag     rounds in a magazine
     rpm     rounds per minute -- refire is 60/rpm
     dmg     damage inside `near` metres
     dmgFar  damage past `far` metres; it ramps between the two
     hs      headshot multiplier
     ads     seconds from hip to sights
     move    walk speed multiplier while carrying it
     reload  seconds, full magazine
     rec     [up, side] degrees per shot
     spread  hipfire cone, degrees
     mv      muzzle velocity, m/s -- bullets travel, they are not rays

   DAMAGE AND TIME-TO-KILL

   Health is 100. A gun's close-range time to kill is
   (shots to kill - 1) * 60/rpm, so the table below is really a table of
   TTKs and the damage numbers are what produce them. The spread that
   matters is the spread between classes: an SMG should win a room and
   lose a street, and a rifle the other way round, and the falloff
   ranges are what make that true rather than the damage alone.
   ================================================================== */

(function () {
  'use strict';

  /* ---- classes, in the order the loadout screen lists them ---- */
  var CLASSES = [
    { id: 'assault', name: 'Assault Rifle', short: 'AR',
      blurb: 'Good at the range the maps are actually built at.' },
    { id: 'smg', name: 'Submachine Gun', short: 'SMG',
      blurb: 'Wins the room, loses the street.' },
    { id: 'lmg', name: 'Light Machine Gun', short: 'LMG',
      blurb: 'A belt, a bipod, and nowhere to be in a hurry.' },
    { id: 'sniper', name: 'Sniper Rifle', short: 'SNP',
      blurb: 'One round, one answer, and a second and a half to think about it.' },
    { id: 'shotgun', name: 'Shotgun', short: 'SHG',
      blurb: 'Everything inside eight metres, nothing outside twelve.' },
    { id: 'special', name: 'Special', short: 'SPC',
      blurb: 'The two that are not guns at all.' },
    { id: 'pistol', name: 'Pistol', short: 'PST',
      blurb: 'What you have left.' },
    { id: 'launcher', name: 'Launcher', short: 'LNC',
      blurb: 'For the things in the sky and the things behind the wall.' },
  ];

  /* ---- the families ----
     A family is a group of guns that were built to take the same
     hardware. It is what decides which barrels will thread onto what:
     the Kurz rifles share a barrel set with each other and with nothing
     else, and a drum magazine that fits a Thompson also fits a PPSh
     because both of those really did take one. */
  /* WHAT THE ACTION IS, where the family cannot say. A family is a
     shelf in a menu, not a mechanism: "Pump and break" holds four pumps
     and a double, and "Lever and revolver" holds one of each. The nine
     guns that are the odd one out in their own family carry `act`
     themselves, and engine/src/97e-action.js reads it before it falls
     back to the family. Without this a sawn-off racked a forend it does
     not have and a carousel worked a bolt for a cylinder. */
  var FAMILIES = {
    kurz: 'Kurz rifles', garand: 'Self-loading rifles', battle: 'Battle rifles',
    kalash: 'Kalashnikov pattern', stoner: 'Stoner pattern', bullpup: 'Bullpups',
    hk: 'Roller-lock SMGs', trench: 'Trench guns', modern: 'Polymer SMGs',
    machpistol: 'Machine pistols', belt: 'Belt-fed', bipod: 'Magazine-fed LMGs',
    rotary: 'Rotary', bolt: 'Bolt-action', amr: 'Anti-materiel',
    pump: 'Pump and break', auto12: 'Self-loading shotguns', exotic: 'Exotic',
    breakopen: 'Break-action', lever: 'Lever and revolver', marksman: 'Marksman rifles',
    acp: '.45 automatics', broom: 'Broomhandles', service: 'Service pistols',
    handcannon: 'Hand cannons', tube: 'Shoulder tubes', guided: 'Guided',
    grenade: 'Grenade launchers',
  };

  /* ================================================================
     THE SEVENTY-FIVE
     ================================================================
     Sixty until the shotgun and sniper sections landed. The three
     gauges and five long rifles that were filed under Special are
     classes of their own now, with ten more gauges and five more
     rifles beside them, and Special is what is actually left: a
     crossbow and a shield.
     ================================================================ */
  var GUNS = [

    /* ---------------- ASSAULT RIFLES (14) ---------------- */
    { id: 'stg44', name: 'STG 44', cls: 'assault', fam: 'kurz',
      mag: 30, rpm: 560, dmg: 26, dmgFar: 19, near: 26, far: 46, hs: 1.5,
      ads: 0.27, move: 0.94, reload: 2.5, rec: [0.52, 0.30], spread: 3.1, mv: 685,
      blurb: 'The first one of these anybody made, and it still shoots like the last one.' },
    { id: 'fg42', name: 'FG 42', cls: 'assault', fam: 'kurz',
      mag: 20, rpm: 750, dmg: 21, dmgFar: 15, near: 24, far: 44, hs: 1.5,
      ads: 0.25, move: 0.95, reload: 2.4, rec: [0.66, 0.38], spread: 3.4, mv: 740,
      blurb: 'Side-fed, fast, and empty before you have decided anything.' },
    { id: 'volkhammer', name: 'Volkhammer', cls: 'assault', fam: 'kurz',
      mag: 35, rpm: 500, dmg: 34, dmgFar: 24, near: 30, far: 52, hs: 1.5,
      ads: 0.30, move: 0.92, reload: 2.8, rec: [0.58, 0.26], spread: 2.8, mv: 700,
      blurb: 'Stamped, heavy, and hits harder than anything that cheap should.' },
    { id: 'garand', name: 'M1 Garand', cls: 'assault', fam: 'garand',
      mag: 8, rpm: 250, dmg: 55, dmgFar: 44, near: 40, far: 70, hs: 1.9, auto: false,
      ads: 0.28, move: 0.94, reload: 2.2, rec: [1.30, 0.42], spread: 2.4, mv: 853,
      blurb: 'Two to the chest at any range on any map. The clip announces itself.' },
    { id: 'svt40', name: 'SVT-40', cls: 'assault', fam: 'garand',
      mag: 10, rpm: 280, dmg: 52, dmgFar: 41, near: 36, far: 64, hs: 1.9, auto: false,
      ads: 0.26, move: 0.95, reload: 2.4, rec: [1.14, 0.38], spread: 2.5, mv: 830,
      blurb: 'Lighter than the Garand and two rounds longer.' },
    { id: 'bm59', name: 'Brecher 59', cls: 'assault', fam: 'garand',
      mag: 20, rpm: 400, dmg: 36, dmgFar: 28, near: 34, far: 62, hs: 1.8,
      ads: 0.31, move: 0.92, reload: 2.7, rec: [1.02, 0.44], spread: 3.0, mv: 820,
      blurb: 'A Garand that was made to keep going. It fights you for the privilege.' },
    { id: 'falke', name: 'Falke 7.62', cls: 'assault', fam: 'battle',
      mag: 20, rpm: 650, dmg: 27, dmgFar: 20, near: 32, far: 58, hs: 1.7,
      ads: 0.32, move: 0.90, reload: 2.9, rec: [1.10, 0.52], spread: 3.6, mv: 840,
      blurb: 'Full power, full auto, and a bipod you will want.' },
    { id: 'g3a', name: 'Kestrel G3', cls: 'assault', fam: 'battle',
      mag: 20, rpm: 600, dmg: 28, dmgFar: 21, near: 34, far: 60, hs: 1.7,
      ads: 0.33, move: 0.90, reload: 3.0, rec: [1.04, 0.46], spread: 3.4, mv: 800,
      blurb: 'Roller-delayed, plank-stocked, and completely unbothered by distance.' },
    { id: 'ak47', name: 'AK-47', cls: 'assault', fam: 'kalash',
      mag: 30, rpm: 500, dmg: 35, dmgFar: 25, near: 28, far: 50, hs: 1.6,
      ads: 0.29, move: 0.93, reload: 2.6, rec: [0.86, 0.48], spread: 3.3, mv: 715,
      blurb: 'Hits hard, climbs hard, does not care what you dropped it in.' },
    { id: 'ak74', name: 'AK-74', cls: 'assault', fam: 'kalash',
      mag: 30, rpm: 650, dmg: 26, dmgFar: 19, near: 30, far: 52, hs: 1.5,
      ads: 0.27, move: 0.94, reload: 2.5, rec: [0.54, 0.28], spread: 2.9, mv: 900,
      blurb: 'The same gun with the temper taken out of it.' },
    { id: 'groza', name: 'Groza-9', cls: 'assault', fam: 'kalash',
      mag: 20, rpm: 700, dmg: 27, dmgFar: 17, near: 20, far: 38, hs: 1.6,
      ads: 0.23, move: 0.97, reload: 2.7, rec: [0.72, 0.44], spread: 3.0, mv: 620,
      blurb: 'Bullpup, subsonic, and built for a corridor.' },
    { id: 'm16', name: 'M16A2', cls: 'assault', fam: 'stoner',
      mag: 30, rpm: 750, burst: 3, dmg: 34, dmgFar: 25, near: 32, far: 56, hs: 1.7,
      ads: 0.26, move: 0.94, reload: 2.4, rec: [0.60, 0.22], spread: 2.6, mv: 948,
      blurb: 'Three rounds a pull. Land all three and the argument is over.' },
    { id: 'm4', name: 'M4 Carbine', cls: 'assault', fam: 'stoner',
      mag: 30, rpm: 780, dmg: 21, dmgFar: 16, near: 26, far: 48, hs: 1.5,
      ads: 0.24, move: 0.96, reload: 2.2, rec: [0.50, 0.24], spread: 2.7, mv: 880,
      blurb: 'Nothing about it is remarkable, which is the remarkable part.' },
    { id: 'aug', name: 'AUG A3', cls: 'assault', fam: 'bullpup',
      mag: 30, rpm: 680, dmg: 26, dmgFar: 20, near: 30, far: 54, hs: 1.6,
      ads: 0.25, move: 0.95, reload: 2.6, rec: [0.56, 0.26], spread: 2.8, mv: 940,
      blurb: 'The magazine is behind the trigger, so the barrel is longer than it looks.' },

    /* ---------------- SUBMACHINE GUNS (12) ---------------- */
    { id: 'mp5', name: 'MP5', cls: 'smg', fam: 'hk',
      mag: 30, rpm: 800, dmg: 26, dmgFar: 16, near: 16, far: 30, hs: 1.4,
      ads: 0.20, move: 1.02, reload: 2.2, rec: [0.34, 0.22], spread: 3.6, mv: 400,
      blurb: 'The one everybody learns on, and nobody ever really puts down.' },
    { id: 'mp7', name: 'MP7', cls: 'smg', fam: 'hk',
      mag: 40, rpm: 950, dmg: 21, dmgFar: 13, near: 15, far: 28, hs: 1.4,
      ads: 0.18, move: 1.05, reload: 2.1, rec: [0.30, 0.26], spread: 3.9, mv: 725,
      blurb: 'Forty small fast rounds and almost nothing in the wrist.' },
    { id: 'ump', name: 'UMP .45', cls: 'smg', fam: 'hk',
      mag: 25, rpm: 600, dmg: 34, dmgFar: 22, near: 20, far: 36, hs: 1.4,
      ads: 0.22, move: 1.00, reload: 2.4, rec: [0.48, 0.30], spread: 3.4, mv: 285,
      blurb: 'Slow for an SMG and heavy for a .45. It kills in three.' },
    { id: 'thompson', name: 'Thompson', cls: 'smg', fam: 'trench',
      mag: 30, rpm: 700, dmg: 34, dmgFar: 21, near: 17, far: 31, hs: 1.4,
      ads: 0.23, move: 0.99, reload: 2.6, rec: [0.44, 0.34], spread: 3.7, mv: 280,
      blurb: 'Ten pounds of walnut and .45. Nobody has ever complained about it.' },
    { id: 'grease', name: 'M3 Grease Gun', cls: 'smg', fam: 'trench',
      mag: 30, rpm: 500, dmg: 34, dmgFar: 22, near: 18, far: 32, hs: 1.4,
      ads: 0.21, move: 1.02, reload: 2.5, rec: [0.38, 0.24], spread: 3.2, mv: 280,
      blurb: 'Pressed out of sheet steel in an afternoon. Fires slower than you can think.' },
    { id: 'sten', name: 'Sten Mk II', cls: 'smg', fam: 'trench',
      mag: 32, rpm: 550, dmg: 34, dmgFar: 21, near: 16, far: 29, hs: 1.4,
      ads: 0.19, move: 1.04, reload: 2.3, rec: [0.36, 0.30], spread: 3.8, mv: 365,
      blurb: 'A pipe, a spring and a magazine sticking out of the side.' },
    { id: 'mp40', name: 'MP 40', cls: 'smg', fam: 'trench',
      mag: 32, rpm: 500, dmg: 34, dmgFar: 22, near: 19, far: 34, hs: 1.4,
      ads: 0.22, move: 1.00, reload: 2.4, rec: [0.32, 0.20], spread: 3.0, mv: 380,
      blurb: 'Steady, slow and accurate. The folding stock is not a suggestion.' },
    { id: 'ppsh', name: 'PPSh-41', cls: 'smg', fam: 'trench',
      mag: 71, rpm: 1000, dmg: 21, dmgFar: 13, near: 14, far: 26, hs: 1.4,
      ads: 0.24, move: 0.98, reload: 3.2, rec: [0.40, 0.36], spread: 4.4, mv: 500,
      blurb: 'Seventy-one rounds. You will run out of room before you run out of them.' },
    { id: 'vector', name: 'Vector .45', cls: 'smg', fam: 'modern',
      mag: 25, rpm: 1100, dmg: 21, dmgFar: 13, near: 13, far: 25, hs: 1.4,
      ads: 0.19, move: 1.04, reload: 2.2, rec: [0.24, 0.18], spread: 3.5, mv: 300,
      blurb: 'The bolt goes down instead of back, so the gun does not.' },
    { id: 'p90', name: 'P90', cls: 'smg', fam: 'modern',
      mag: 50, rpm: 900, dmg: 26, dmgFar: 17, near: 17, far: 30, hs: 1.4,
      ads: 0.21, move: 1.01, reload: 2.8, rec: [0.28, 0.22], spread: 3.3, mv: 715,
      blurb: 'Fifty rounds lying flat on top of the gun.' },
    { id: 'skorpion', name: 'Skorpion vz.61', cls: 'smg', fam: 'machpistol',
      mag: 20, rpm: 950, dmg: 21, dmgFar: 12, near: 11, far: 22, hs: 1.4,
      ads: 0.15, move: 1.09, reload: 1.9, rec: [0.30, 0.34], spread: 4.6, mv: 320,
      blurb: 'Small enough to be a pistol and honest enough not to pretend.' },
    { id: 'microuzi', name: 'Micro Uzi', cls: 'smg', fam: 'machpistol',
      mag: 20, rpm: 1200, dmg: 21, dmgFar: 12, near: 10, far: 20, hs: 1.4,
      ads: 0.16, move: 1.08, reload: 2.0, rec: [0.34, 0.40], spread: 5.0, mv: 350,
      blurb: 'Empties in one second. Make it the right second.' },

    /* ---------------- LIGHT MACHINE GUNS (9) ---------------- */
    { id: 'mg42', name: 'MG 42', cls: 'lmg', fam: 'belt',
      mag: 125, rpm: 1150, dmg: 18, dmgFar: 14, near: 30, far: 58, hs: 1.5,
      ads: 0.44, move: 0.80, reload: 5.4, rec: [0.55, 0.42], spread: 5.2, mv: 755,
      blurb: 'Twelve hundred a minute. It does not sound like a gun, it sounds like cloth tearing.' },
    { id: 'mg34', name: 'MG 34', cls: 'lmg', fam: 'belt',
      mag: 100, rpm: 900, dmg: 21, dmgFar: 16, near: 32, far: 60, hs: 1.5,
      ads: 0.42, move: 0.81, reload: 5.0, rec: [0.60, 0.36], spread: 4.8, mv: 765,
      blurb: 'Machined out of a solid billet by somebody who had time.' },
    { id: 'm60', name: 'M60', cls: 'lmg', fam: 'belt',
      mag: 100, rpm: 550, dmg: 26, dmgFar: 20, near: 34, far: 64, hs: 1.6,
      ads: 0.48, move: 0.78, reload: 6.0, rec: [0.88, 0.40], spread: 5.0, mv: 853,
      blurb: 'Slow, enormous, and it does not matter where it hits you.' },
    { id: 'pkm', name: 'PKM', cls: 'lmg', fam: 'belt',
      mag: 100, rpm: 650, dmg: 26, dmgFar: 20, near: 33, far: 62, hs: 1.6,
      ads: 0.45, move: 0.80, reload: 5.6, rec: [0.74, 0.38], spread: 4.9, mv: 825,
      blurb: 'Belt-fed and somehow still lighter than the gun beside it.' },
    { id: 'rpd', name: 'RPD', cls: 'lmg', fam: 'belt',
      mag: 100, rpm: 650, dmg: 26, dmgFar: 19, near: 30, far: 56, hs: 1.5,
      ads: 0.40, move: 0.84, reload: 5.2, rec: [0.62, 0.34], spread: 4.4, mv: 735,
      blurb: 'The drum hangs under it and it handles like a heavy rifle.' },
    { id: 'bren', name: 'Bren Mk III', cls: 'lmg', fam: 'bipod',
      mag: 30, rpm: 500, dmg: 34, dmgFar: 27, near: 36, far: 66, hs: 1.7,
      ads: 0.38, move: 0.85, reload: 3.4, rec: [0.80, 0.26], spread: 3.6, mv: 745,
      blurb: 'Thirty rounds, top-fed, and accurate enough to be unfair.' },
    { id: 'bar', name: 'BAR 1918', cls: 'lmg', fam: 'bipod',
      mag: 20, rpm: 480, dmg: 36, dmgFar: 28, near: 34, far: 62, hs: 1.7,
      ads: 0.36, move: 0.87, reload: 3.0, rec: [0.96, 0.32], spread: 3.8, mv: 860,
      blurb: 'Twenty rounds of .30-06 carried at the hip by men who regretted it.' },
    { id: 'dp28', name: 'DP-28', cls: 'lmg', fam: 'bipod',
      mag: 47, rpm: 550, dmg: 26, dmgFar: 20, near: 32, far: 58, hs: 1.6,
      ads: 0.41, move: 0.83, reload: 4.4, rec: [0.70, 0.28], spread: 4.0, mv: 840,
      blurb: 'The record player. Forty-seven rounds going round on top.' },
    { id: 'hydra', name: 'Hydra Minigun', cls: 'lmg', fam: 'rotary',
      mag: 200, rpm: 2000, dmg: 13, dmgFar: 9, near: 26, far: 48, hs: 1.3,
      ads: 0.70, move: 0.62, reload: 8.0, rec: [0.30, 0.52], spread: 6.5, mv: 850,
      spinUp: 0.9,
      blurb: 'A second of spin-up, then the wall in front of you stops being a wall.' },

    /* ---------------- SNIPER RIFLES (10) ---------------- */
    { id: 'remington', name: 'Remington 700', cls: 'sniper', fam: 'bolt',
      mag: 5, rpm: 48, bolt: 1.25, dmg: 100, dmgFar: 95, near: 60, far: 120, hs: 3.0, auto: false,
      ads: 0.42, move: 0.88, reload: 3.2, rec: [3.4, 0.8], spread: 6.0, mv: 820,
      oneShot: 'chest',
      blurb: 'Chest and up, once, anywhere on any map.' },
    { id: 'kar98', name: 'Kar98k', cls: 'sniper', fam: 'bolt',
      mag: 5, rpm: 42, bolt: 1.40, dmg: 100, dmgFar: 95, near: 70, far: 140, hs: 3.0, auto: false,
      ads: 0.45, move: 0.89, reload: 3.6, rec: [3.7, 0.8], spread: 6.4, mv: 760,
      oneShot: 'chest',
      blurb: 'Slower to cycle than anything else here, and it does not need a second try.' },
    { id: 'mosin', name: 'Mosin-Nagant', cls: 'sniper', fam: 'bolt',
      mag: 5, rpm: 40, bolt: 1.45, dmg: 100, dmgFar: 95, near: 70, far: 140, hs: 3.0, auto: false,
      ads: 0.47, move: 0.88, reload: 3.8, rec: [3.9, 0.9], spread: 6.6, mv: 800,
      oneShot: 'chest',
      blurb: 'The bolt is stiff and the stock is a plank. It shoots like a laser.' },
    { id: 'killstreak', act: 'manual', name: 'The Kill Streak', cls: 'sniper', fam: 'amr',
      mag: 5, rpm: 36, bolt: 1.6, dmg: 130, dmgFar: 125, near: 90, far: 180, hs: 3.0, auto: false,
      ads: 0.58, move: 0.76, reload: 4.4, rec: [6.6, 1.5], spread: 8.0, mv: 880,
      oneShot: 'any', pierce: 2,
      blurb: 'Fifty calibre. Goes through the man, the wall, and the man behind the wall.' },
    { id: 'barrett', name: 'Barrett M82', cls: 'sniper', fam: 'amr',
      mag: 10, rpm: 90, dmg: 118, dmgFar: 110, near: 80, far: 170, hs: 3.0, auto: false,
      ads: 0.62, move: 0.74, reload: 4.8, rec: [6.2, 1.4], spread: 8.4, mv: 853,
      oneShot: 'any', pierce: 1,
      blurb: 'Semi-automatic, which means you get to be wrong twice quickly.' },
    { id: 'svd', name: 'SVD Dragunov', cls: 'sniper', fam: 'marksman',
      mag: 10, rpm: 110, dmg: 88, dmgFar: 78, near: 55, far: 120, hs: 2.4, auto: false,
      ads: 0.40, move: 0.86, reload: 3.0, rec: [2.6, 0.7], spread: 4.6, mv: 830,
      blurb: 'Semi-automatic and not quite a one-shot, which is the trade it was built to make.' },
    { id: 'lee', name: 'Lee-Enfield No.4', cls: 'sniper', fam: 'bolt',
      mag: 10, rpm: 58, bolt: 1.05, dmg: 96, dmgFar: 90, near: 62, far: 130, hs: 3.0, auto: false,
      ads: 0.43, move: 0.89, reload: 4.2, rec: [3.2, 0.8], spread: 5.8, mv: 744,
      /* NO oneShot, and 96 rather than 100, which is the trade this
         rifle is for: twice the magazine and half again the bolt speed
         of anything else in the class, in exchange for needing the
         second round on a body shot. mpdata.test.js caught the first
         draft, where it was flagged oneShot and did 96 -- a rifle
         that promised a kill it could not deliver. */
      blurb: 'Ten rounds and the fastest bolt anybody ever fitted to a rifle. It still needs two on a sprinter.' },
    { id: 'arctic', name: 'Arctic AW', cls: 'sniper', fam: 'bolt',
      mag: 5, rpm: 46, bolt: 1.30, dmg: 108, dmgFar: 100, near: 80, far: 160, hs: 3.0, auto: false,
      ads: 0.50, move: 0.82, reload: 3.4, rec: [4.2, 1.0], spread: 6.2, mv: 936,
      oneShot: 'chest',
      blurb: 'An aluminium chassis with a rifle floating inside it. Nothing it touches can move.' },
    { id: 'springfield', name: 'Springfield A4', cls: 'sniper', fam: 'bolt',
      mag: 5, rpm: 44, bolt: 1.35, dmg: 100, dmgFar: 95, near: 68, far: 138, hs: 3.0, auto: false,
      ads: 0.46, move: 0.88, reload: 3.7, rec: [3.6, 0.8], spread: 6.2, mv: 823,
      oneShot: 'chest',
      blurb: 'The Great War rifle with a telescope screwed to it, and the bolt bent down to clear it.' },
    { id: 'longwake', name: 'Longwake .338', cls: 'sniper', fam: 'marksman',
      mag: 8, rpm: 96, dmg: 112, dmgFar: 104, near: 85, far: 175, hs: 2.8, auto: false,
      ads: 0.54, move: 0.80, reload: 3.6, rec: [5.0, 1.2], spread: 6.8, mv: 915,
      oneShot: 'chest', pierce: 1,
      blurb: 'The whole action sits behind the trigger, so it carries a thirty-inch barrel like a carbine.' },

    /* ---------------- SHOTGUNS (13) ---------------- */
    { id: 'scatter', name: 'Scattergun', cls: 'shotgun', fam: 'pump',
      mag: 6, rpm: 70, dmg: 22, dmgFar: 6, near: 9, far: 19, hs: 1.3, auto: false, pellets: 8,
      ads: 0.30, move: 0.96, reload: 0.55, reloadKind: 'shell', rec: [2.3, 0.7], spread: 6.5, mv: 380,
      blurb: 'Eight pellets, one pump, and a reload you can stop halfway through.' },
    { id: 'sawnoff', act: 'break', name: 'Sawn-Off', cls: 'shotgun', fam: 'pump',
      mag: 2, rpm: 200, dmg: 26, dmgFar: 4, near: 7, far: 14, hs: 1.3, auto: false, pellets: 10,
      ads: 0.22, move: 1.05, reload: 2.1, rec: [3.8, 1.7], spread: 10.0, mv: 350,
      blurb: 'Two barrels, no stock, and the range of an angry handshake.' },
    { id: 'breakwater', name: 'Breakwater', cls: 'shotgun', fam: 'auto12',
      mag: 8, rpm: 180, dmg: 18, dmgFar: 5, near: 10, far: 20, hs: 1.3, pellets: 8,
      ads: 0.32, move: 0.94, reload: 0.5, reloadKind: 'shell', rec: [1.1, 0.4], spread: 6.0, mv: 380,
      blurb: 'Self-loading twelve gauge. You can hold the trigger down. People do.' },
    { id: 'trench', name: 'Trench Gun', cls: 'shotgun', fam: 'pump',
      mag: 6, rpm: 78, dmg: 23, dmgFar: 7, near: 10, far: 20, hs: 1.3, auto: false, pellets: 9,
      ads: 0.29, move: 0.95, reload: 0.52, reloadKind: 'shell', rec: [2.4, 0.8], spread: 6.2, mv: 390,
      melee: 1.6,
      blurb: 'Nineteen-seventeen, and the reason the other side complained to the Hague about it.' },
    { id: 'coach', name: 'Coach Gun', cls: 'shotgun', fam: 'breakopen',
      mag: 2, rpm: 210, dmg: 25, dmgFar: 6, near: 11, far: 22, hs: 1.3, auto: false, pellets: 9,
      ads: 0.26, move: 0.99, reload: 2.2, rec: [3.4, 1.4], spread: 7.2, mv: 400,
      blurb: 'Two barrels side by side and the hammers out where you can see them. Then two and a half seconds.' },
    { id: 'longshore', name: 'Longshore O/U', cls: 'shotgun', fam: 'breakopen',
      mag: 2, rpm: 260, dmg: 27, dmgFar: 7, near: 12, far: 24, hs: 1.4, auto: false, pellets: 8,
      ads: 0.28, move: 0.97, reload: 2.3, rec: [3.2, 1.2], spread: 5.4, mv: 410,
      blurb: 'Stacked instead of paired, so there is one rib to look down and it shoots where you look.' },
    { id: 'grinder', name: 'Grinder 12', cls: 'shotgun', fam: 'auto12',
      mag: 20, rpm: 300, dmg: 15, dmgFar: 4, near: 8, far: 17, hs: 1.2, pellets: 8,
      ads: 0.38, move: 0.86, reload: 4.6, rec: [1.0, 0.5], spread: 7.0, mv: 370,
      blurb: 'Twenty shells on a drum and a trigger that does not care how many are left.' },
    { id: 'ranger', name: 'Ranger Lever', cls: 'shotgun', fam: 'lever',
      mag: 5, rpm: 88, dmg: 24, dmgFar: 6, near: 10, far: 21, hs: 1.3, auto: false, pellets: 8,
      ads: 0.27, move: 0.97, reload: 0.58, reloadKind: 'shell', rec: [2.6, 0.9], spread: 6.6, mv: 385,
      blurb: 'Worked by throwing a hoop forward and catching it. Faster than a pump if your hand knows how.' },
    { id: 'kestrel12', name: 'Kestrel 12', cls: 'shotgun', fam: 'pump',
      mag: 14, rpm: 74, dmg: 22, dmgFar: 6, near: 9, far: 19, hs: 1.3, auto: false, pellets: 9,
      ads: 0.31, move: 0.94, reload: 0.50, reloadKind: 'shell', rec: [2.2, 0.7], spread: 6.4, mv: 380,
      blurb: 'Two magazine tubes, a switch between them, and the whole action behind the trigger.' },
    { id: 'marshback', name: 'Marshback Auto', cls: 'shotgun', fam: 'auto12',
      mag: 5, rpm: 200, dmg: 20, dmgFar: 5, near: 10, far: 21, hs: 1.3, pellets: 8,
      ads: 0.30, move: 0.93, reload: 0.54, reloadKind: 'shell', rec: [1.6, 0.6], spread: 6.0, mv: 390,
      blurb: 'The barrel comes back with the bolt, which is why the receiver has a hump on it.' },
    { id: 'doorbreaker', name: 'Doorbreaker', cls: 'shotgun', fam: 'pump',
      mag: 4, rpm: 82, dmg: 26, dmgFar: 4, near: 7, far: 15, hs: 1.3, auto: false, pellets: 10,
      ads: 0.20, move: 1.06, reload: 0.48, reloadKind: 'shell', rec: [3.6, 1.5], spread: 9.5, mv: 350,
      blurb: 'Fourteen inches, no stock, and a ring of teeth on the muzzle for standing it off a hinge.' },
    { id: 'carousel', act: 'revolver', name: 'Carousel 12', cls: 'shotgun', fam: 'lever',
      mag: 12, rpm: 150, dmg: 19, dmgFar: 5, near: 9, far: 18, hs: 1.2, auto: false, pellets: 8,
      ads: 0.34, move: 0.90, reload: 5.0, rec: [2.0, 0.8], spread: 7.4, mv: 375,
      blurb: 'Twelve rounds on a spring-wound cylinder as wide as your hand. Winding it back up takes a while.' },
    { id: 'anvil', name: 'Anvil 8-Bore', cls: 'shotgun', fam: 'breakopen',
      mag: 1, rpm: 60, dmg: 96, dmgFar: 34, near: 14, far: 26, hs: 1.5, auto: false, pellets: 1,
      ads: 0.44, move: 0.80, reload: 1.9, rec: [8.0, 2.6], spread: 3.0, mv: 440,
      slug: true,
      blurb: 'One barrel, one shell, and a bore you could post a letter down. It moves you as much as him.' },

    /* ---------------- SPECIAL (2) ---------------- */
    { id: 'crossbow', act: 'manual', name: 'Crossbow', cls: 'special', fam: 'exotic',
      mag: 1, rpm: 30, dmg: 120, dmgFar: 120, near: 200, far: 200, hs: 2.0, auto: false,
      ads: 0.40, move: 0.95, reload: 1.9, rec: [0.4, 0.1], spread: 2.0, mv: 105,
      silent: true, explosiveBolt: true,
      blurb: 'Silent, arcs like a thrown rock, and the bolt sticks in whatever it hits and waits.' },
    { id: 'riotshield', name: 'Riot Shield', cls: 'special', fam: 'exotic',
      mag: 0, rpm: 60, dmg: 75, dmgFar: 75, near: 2, far: 2, hs: 1.0, auto: false,
      ads: 0.30, move: 0.90, reload: 0, rec: [0, 0], spread: 0, mv: 0,
      shield: true, shieldHp: 320,
      blurb: 'It is not a gun. It is a wall you can take with you, and it can be planted.' },

    /* ---------------- PISTOLS (9) ---------------- */
    { id: 'm1911', name: 'M1911', cls: 'pistol', fam: 'acp',
      mag: 7, rpm: 375, dmg: 34, dmgFar: 21, near: 18, far: 34, hs: 1.6, auto: false,
      ads: 0.16, move: 1.06, reload: 1.5, rec: [0.9, 0.3], spread: 3.0, mv: 253,
      blurb: 'Seven rounds of .45 and a trigger that goes exactly where you put it.' },
    { id: 'blaze', name: 'Blaze', cls: 'pistol', fam: 'acp',
      mag: 8, rpm: 400, dmg: 34, dmgFar: 20, near: 17, far: 32, hs: 1.6, auto: false,
      ads: 0.15, move: 1.07, reload: 1.4, rec: [0.85, 0.3], spread: 2.9, mv: 253,
      blurb: 'The 1911 with the sharp edges taken off and one more in the magazine.' },
    /* `selfLoading`, and it should be `revolver`. The Model 5 IS a
       revolver -- bunker-nine builds it with a cylinder and a hammer and
       animates both -- but the SERVICE model multiplayer draws has a
       slide, an ejection port and cocking serrations on it: the two
       games model the same pistol as two different guns. Animating it
       as a revolver here would turn a cylinder it does not have and
       leave the slide it does have dead. The action follows the model
       until the model is rebuilt. */
    { id: 'model5', act: 'selfLoading', name: 'Model 5', cls: 'pistol', fam: 'handcannon',
      mag: 4, rpm: 230, dmg: 55, dmgFar: 38, near: 24, far: 44, hs: 1.9, auto: false,
      ads: 0.22, move: 1.00, reload: 2.0, rec: [3.4, 1.1], spread: 4.0, mv: 450,
      blurb: 'Fifty calibre out of a pistol. Two shots and your wrist has an opinion.' },
    { id: 'webley', act: 'revolver', name: 'Webley Mk VI', cls: 'pistol', fam: 'handcannon',
      mag: 6, rpm: 210, dmg: 52, dmgFar: 36, near: 22, far: 40, hs: 1.8, auto: false,
      ads: 0.20, move: 1.02, reload: 2.6, reloadKind: 'moon', rec: [2.7, 0.9], spread: 3.8, mv: 200,
      blurb: 'Breaks open at the top and throws all six on the floor at once.' },
    { id: 'mauser', name: 'Mauser C96', cls: 'pistol', fam: 'broom',
      mag: 10, rpm: 420, dmg: 26, dmgFar: 20, near: 26, far: 46, hs: 1.7, auto: false,
      ads: 0.18, move: 1.04, reload: 1.9, reloadKind: 'clip', rec: [0.63, 0.22], spread: 2.4, mv: 434,
      pierce: 1,
      blurb: 'Small fast bullet. Flat as a ruler and it goes through things.' },
    { id: 'luger', name: 'Luger P08', cls: 'pistol', fam: 'broom',
      mag: 8, rpm: 440, dmg: 26, dmgFar: 18, near: 22, far: 40, hs: 1.6, auto: false,
      ads: 0.15, move: 1.07, reload: 1.6, rec: [0.55, 0.20], spread: 2.6, mv: 350,
      blurb: 'The toggle flips up on top when it fires and everyone looks at it.' },
    { id: 'p226', name: 'P226 Nine', cls: 'pistol', fam: 'service',
      mag: 15, rpm: 450, dmg: 26, dmgFar: 18, near: 20, far: 36, hs: 1.5, auto: false,
      ads: 0.15, move: 1.07, reload: 1.5, rec: [0.50, 0.22], spread: 2.8, mv: 350,
      blurb: 'Fifteen rounds and nothing to say about any of them.' },
    { id: 'tokarev', name: 'TT-33 Tokarev', cls: 'pistol', fam: 'service',
      mag: 8, rpm: 420, dmg: 34, dmgFar: 24, near: 24, far: 42, hs: 1.7, auto: false,
      ads: 0.16, move: 1.06, reload: 1.5, rec: [0.70, 0.26], spread: 2.7, mv: 420,
      pierce: 1,
      blurb: 'The same fast bullet as the broomhandle in something you can holster.' },
    { id: 'g18', name: 'G18 Machine Pistol', cls: 'pistol', fam: 'service',
      mag: 17, rpm: 1100, dmg: 18, dmgFar: 11, near: 12, far: 22, hs: 1.4, auto: true,
      ads: 0.17, move: 1.06, reload: 1.7, rec: [0.44, 0.48], spread: 5.2, mv: 375,
      blurb: 'Seventeen rounds in under a second. Aim is a formality.' },

    /* ---------------- LAUNCHERS (6) ---------------- */
    { id: 'panzer', act: 'manual', name: 'Panzerfaust', cls: 'launcher', fam: 'tube',
      mag: 1, rpm: 30, dmg: 180, dmgFar: 60, near: 4.5, far: 8, hs: 1.0, auto: false,
      ads: 0.50, move: 0.88, reload: 3.6, rec: [5.0, 1.0], spread: 1.0, mv: 60,
      splash: 4.5, dropsFast: true,
      blurb: 'Point it, fire it, throw the tube away. Drops like a brick past thirty metres.' },
    { id: 'bazooka', act: 'manual', name: 'M1 Bazooka', cls: 'launcher', fam: 'tube',
      mag: 1, rpm: 30, dmg: 170, dmgFar: 55, near: 4.0, far: 7.5, hs: 1.0, auto: false,
      ads: 0.52, move: 0.86, reload: 4.0, rec: [4.4, 0.9], spread: 1.2, mv: 82,
      splash: 4.2,
      blurb: 'Flatter than the Panzerfaust and takes four seconds to reload.' },
    { id: 'rpg7', act: 'manual', name: 'RPG-7', cls: 'launcher', fam: 'tube',
      mag: 1, rpm: 34, dmg: 190, dmgFar: 65, near: 5.0, far: 9, hs: 1.0, auto: false,
      ads: 0.50, move: 0.87, reload: 3.8, rec: [5.2, 1.1], spread: 1.0, mv: 115,
      splash: 5.0,
      blurb: 'Sustainer motor kicks in after ten metres and it goes very fast indeed.' },
    { id: 'stinger', name: 'Stinger FIM', cls: 'launcher', fam: 'guided',
      mag: 1, rpm: 30, dmg: 40, dmgFar: 40, near: 3, far: 3, hs: 1.0, auto: false,
      ads: 0.60, move: 0.86, reload: 4.2, rec: [2.6, 0.6], spread: 0, mv: 200,
      lockOn: 'air', vsAir: 900, splash: 3.0,
      blurb: 'Useless against a man and the last word against a helicopter.' },
    { id: 'm79', act: 'break', name: 'M79 Thumper', cls: 'launcher', fam: 'grenade',
      mag: 1, rpm: 50, dmg: 120, dmgFar: 45, near: 3.5, far: 6.5, hs: 1.0, auto: false,
      ads: 0.34, move: 0.95, reload: 2.6, rec: [3.2, 0.8], spread: 1.4, mv: 76,
      splash: 3.5, arcs: true,
      blurb: 'Break-action, lobs in an arc, and lands somewhere you can aim for.' },
    { id: 'gl6', act: 'revolver', name: 'Six-Shot GL', cls: 'launcher', fam: 'grenade',
      mag: 6, rpm: 120, dmg: 95, dmgFar: 35, near: 3.0, far: 5.5, hs: 1.0, auto: false,
      ads: 0.44, move: 0.88, reload: 6.5, rec: [2.4, 0.9], spread: 2.0, mv: 76,
      splash: 3.0, arcs: true,
      blurb: 'A revolver for grenades. Six of them, then six and a half seconds of nothing.' },
  ];

  /* ================================================================
     ATTACHMENTS
     ================================================================
     Eight slots, sixty-nine parts, five of them on a gun at once.

     Zombies charges points for attachments because points are what
     zombies is made of. Multiplayer does not: an attachment is free and
     the price is the gun. You put rounds through it, or you simply
     carry it around a map for a match, and it gives you the parts back
     one level at a time. Nobody should be losing a gunfight because the
     other man had more of an evening spare.

     WHAT FITS WHAT

       classes   which weapon classes the part exists for at all
       fams      if present, only these families take it
       not       and these particular guns do not, whatever their family

     That last line is the one that makes the families feel like real
     hardware rather than a filing system. A Thompson and a PPSh both
     take a drum because both of them really did. The MP 40 is in the
     same family and does not, because it never had one -- the magazine
     is the grip.

       lvl       the gun level that hands it over
       fold      what it does to the numbers

     Six parts are at level 1, one in each of the slots that nearly
     every gun has. A brand-new gun used to open a screen on which
     every single row was greyed out, which reads as a broken menu
     rather than as something to work towards.

     `fold` takes the gun's current stats and returns only the fields it
     changes, so two parts touching the same field compose instead of
     fighting. Every one of them costs something. A part with no
     downside is a part that is simply always fitted, and a slot that is
     always the same is a slot that should not have been a choice.
     ================================================================ */

  var SLOTS = [
    { id: 'optic', name: 'Optic' },
    { id: 'muzzle', name: 'Muzzle' },
    { id: 'barrel', name: 'Barrel' },
    { id: 'under', name: 'Underbarrel' },
    { id: 'mag', name: 'Magazine' },
    { id: 'stock', name: 'Stock' },
    { id: 'grip', name: 'Rear Grip' },
    { id: 'laser', name: 'Laser' },
  ];
  var MAX_FITTED = 5;

  var GUNCLS = ['assault', 'smg', 'lmg', 'sniper', 'shotgun', 'special',
    'pistol', 'launcher'];
  var LONGARM = ['assault', 'smg', 'lmg', 'sniper', 'shotgun'];
  /* Thirteen of them now, and they are a CLASS rather than a note in
     the Special bin. Kept as an explicit list all the same, because
     what this is used for is "does a choke thread onto this" -- a
     question about the muzzle, not about the tab it is filed under,
     and the Anvil is an eight-bore that will not take one. */
  var SHOTGUNS = ['scatter', 'sawnoff', 'breakwater', 'trench', 'coach',
    'longshore', 'grinder', 'ranger', 'kestrel12', 'marshback',
    'doorbreaker', 'carousel', 'anvil'];

  var ATTACHMENTS = [

    /* ---------------- OPTICS (12) ---------------- */
    { id: 'o-reflex', slot: 'optic', name: 'Reflex Sight', lvl: 1, classes: GUNCLS,
      blurb: 'A dot on glass. Nothing else changes.',
      fold: function (w) { return { sightH: w.sightH + 0.011, adsSpread: w.adsSpread * 0.90 }; } },
    { id: 'o-reddot', slot: 'optic', name: 'Red Dot', lvl: 4, classes: GUNCLS,
      blurb: 'Smaller dot, smaller housing, cleaner corners.',
      fold: function (w) { return { sightH: w.sightH + 0.012, adsSpread: w.adsSpread * 0.86 }; } },
    { id: 'o-holo', slot: 'optic', name: 'Holographic', lvl: 7, classes: LONGARM,
      blurb: 'A wide window. You can see what is beside the man you are shooting.',
      fold: function (w) { return { sightH: w.sightH + 0.014, adsSpread: w.adsSpread * 0.84, ads: w.ads * 1.04 }; } },
    { id: 'o-combat', slot: 'optic', name: 'Combat Sight', lvl: 9, classes: LONGARM,
      blurb: 'Ring and post. Quick to pick up and no magnification at all.',
      fold: function (w) { return { sightH: w.sightH + 0.013, ads: w.ads * 0.94, adsSpread: w.adsSpread * 0.92 }; } },
    { id: 'o-2x', slot: 'optic', name: 'Marksman 2x', lvl: 11, classes: LONGARM.concat(['pistol']),
      blurb: 'Twice, which is exactly enough to read a face across a street.',
      fold: function (w) { return { sightH: w.sightH + 0.015, sightFov: 0.62, ads: w.ads * 1.08, adsSpread: w.adsSpread * 0.70 }; } },
    { id: 'o-34x', slot: 'optic', name: 'Recon 3.4x', lvl: 14, classes: ['assault', 'lmg', 'sniper'],
      blurb: 'Reads a name plate at sixty metres and nothing at six.',
      fold: function (w) { return { sightH: w.sightH + 0.016, sightFov: 0.40, ads: w.ads * 1.16, adsSpread: w.adsSpread * 0.56 }; } },
    { id: 'o-4x', slot: 'optic', name: 'Patrol 4x', lvl: 17, classes: ['assault', 'lmg', 'sniper'],
      blurb: 'Chevron reticle with a drop ladder under it.',
      fold: function (w) { return { sightH: w.sightH + 0.017, sightFov: 0.34, ads: w.ads * 1.22, adsSpread: w.adsSpread * 0.48 }; } },
    /* fams, and it EXCLUDES something: the two self-loading marksman
       rifles take glass but not this much of it. Without the family
       line both of these fitted all ten snipers and the check that
       some attachments are family-only went from four to two. */
    { id: 'o-7x', slot: 'optic', name: 'Sniper 7x', lvl: 12, classes: ['sniper'],
      fams: ['bolt', 'amr'],
      blurb: 'Seven times and no use at all inside a room.',
      fold: function (w) { return { sightH: w.sightH + 0.020, sightFov: 0.22, ads: w.ads * 1.34, adsSpread: w.adsSpread * 0.26, scoped: true }; } },
    { id: 'o-12x', slot: 'optic', name: 'Long Range 12x', lvl: 21, classes: ['sniper'],
      fams: ['bolt', 'amr'],
      blurb: 'You can hold your breath on it. You will need to.',
      fold: function (w) { return { sightH: w.sightH + 0.022, sightFov: 0.14, ads: w.ads * 1.52, adsSpread: w.adsSpread * 0.14, scoped: true, holdBreath: true }; } },
    { id: 'o-thermal', slot: 'optic', name: 'Thermal Optic', lvl: 24, classes: LONGARM,
      blurb: 'They glow. Smoke does not.',
      fold: function (w) { return { sightH: w.sightH + 0.016, ads: w.ads * 1.18, thermal: true, adsSpread: w.adsSpread * 0.66 }; } },
    { id: 'o-nvg', slot: 'optic', name: 'Night Vision', lvl: 26, classes: LONGARM,
      blurb: 'Green, grainy, and the corners stop being dark.',
      fold: function (w) { return { sightH: w.sightH + 0.018, ads: w.ads * 1.12, nightvision: true }; } },
    { id: 'o-canted', slot: 'optic', name: 'Canted Irons', lvl: 28, classes: LONGARM,
      blurb: 'A second set of sights at forty-five degrees, for when the big glass is wrong.',
      fold: function (w) { return { canted: true, ads: w.ads * 1.03 }; } },

    /* ---------------- MUZZLES (10) ---------------- */
    { id: 'm-suppressor', slot: 'muzzle', name: 'Suppressor', lvl: 3, classes: GUNCLS,
      blurb: 'Off the minimap when you fire. Costs you the last few metres.',
      fold: function (w) { return { quiet: true, dmgFar: w.dmgFar * 0.90, far: w.far * 0.86, spread: w.spread * 0.92 }; } },
    { id: 'm-mono', slot: 'muzzle', name: 'Monolithic Suppressor', lvl: 22, classes: LONGARM,
      blurb: 'Quiet, and it gives the range back instead of taking it.',
      fold: function (w) { return { quiet: true, far: w.far * 1.12, near: w.near * 1.08, ads: w.ads * 1.06, move: w.move * 0.98 }; } },
    { id: 'm-comp', slot: 'muzzle', name: 'Compensator', lvl: 5, classes: LONGARM.concat(['pistol']),
      blurb: 'Ports on the top. Holds the muzzle down and tells everyone where you are.',
      fold: function (w) { return { rec: [w.rec[0] * 0.62, w.rec[1] * 0.88], loud: true }; } },
    { id: 'm-brake', slot: 'muzzle', name: 'Muzzle Brake', lvl: 8, classes: LONGARM.concat(['pistol']),
      blurb: 'Side blast. Kills the shove and keeps the climb.',
      fold: function (w) { return { rec: [w.rec[0] * 0.92, w.rec[1] * 0.54], loud: true }; } },
    { id: 'm-flash', slot: 'muzzle', name: 'Flash Hider', lvl: 6, classes: LONGARM,
      blurb: 'No bloom in your own sight picture when the light goes.',
      fold: function (w) { return { noFlash: true, adsSpread: w.adsSpread * 0.96 }; } },
    { id: 'm-birdcage', slot: 'muzzle', name: 'Birdcage', lvl: 10, classes: LONGARM,
      blurb: 'The cheap one that does a bit of everything.',
      fold: function (w) { return { noFlash: true, rec: [w.rec[0] * 0.88, w.rec[1] * 0.88] }; } },
    { id: 'm-breacher', slot: 'muzzle', name: 'Breacher Device', lvl: 13, classes: LONGARM,
      blurb: 'A steel crown on the end. Butt-strokes and door frames both give way.',
      fold: function (w) { return { melee: 1.6, breach: true, ads: w.ads * 1.04 }; } },
    { id: 'm-annihilator', slot: 'muzzle', name: 'Mark One Annihilator', lvl: 25, classes: LONGARM,
      blurb: 'Recoil, very nearly gone. Weighs as much as the barrel.',
      fold: function (w) { return { rec: [w.rec[0] * 0.30, w.rec[1] * 0.34], ads: w.ads * 1.18, move: w.move * 0.95, loud: true }; } },
    /* A choke threads into a barrel that is bored for one. The lever
       gun and the revolver are not, and neither is an eight-bore. */
    { id: 'm-chokefull', slot: 'muzzle', name: 'Full Choke', lvl: 4, classes: ['shotgun'],
      fams: ['pump', 'auto12', 'breakopen'],
      blurb: 'Squeezes the pattern. Reaches further and forgives less.',
      fold: function (w) { return { spread: w.spread * 0.58, near: w.near * 1.45, far: w.far * 1.35 }; } },
    { id: 'm-duckbill', slot: 'muzzle', name: 'Duckbill', lvl: 12, classes: ['shotgun'],
      fams: ['pump', 'auto12', 'breakopen'],
      blurb: 'Spreads the pattern sideways, into a doorway-shaped slot.',
      fold: function (w) { return { spreadX: 2.4, spreadY: 0.5, near: w.near * 0.9 }; } },

    /* ---------------- BARRELS (12) ----------------
       Twelve, which is the number asked for, and every one of them is a
       real trade. A barrel is length, weight and what the muzzle is
       doing at the end of it, so the three things a barrel can move are
       range, handling and what the gun weighs in the hands -- and no
       barrel here moves all three the same way. */
    { id: 'b-long', slot: 'barrel', name: 'Long Barrel', lvl: 3, classes: GUNCLS,
      blurb: 'More range and more velocity. Slower into the shoulder.',
      fold: function (w) { return { mv: w.mv * 1.30, near: w.near * 1.20, far: w.far * 1.18, ads: w.ads * 1.10, move: w.move * 0.96 }; } },
    { id: 'b-short', slot: 'barrel', name: 'Short Barrel', lvl: 3, classes: GUNCLS,
      blurb: 'Handier, louder, and it throws the pattern about.',
      fold: function (w) { return { ads: w.ads * 0.86, move: w.move * 1.07, spread: w.spread * 1.24, far: w.far * 0.86 }; } },
    { id: 'b-heavy', slot: 'barrel', name: 'Heavy Barrel', lvl: 9, classes: LONGARM,
      blurb: 'Thick enough that sustained fire does not walk it up the wall.',
      fold: function (w) { return { rec: [w.rec[0] * 0.74, w.rec[1] * 0.80], move: w.move * 0.94, ads: w.ads * 1.12 }; } },
    { id: 'b-chrome', slot: 'barrel', name: 'Chrome-Lined Barrel', lvl: 11, classes: LONGARM,
      blurb: 'Stays honest hot. The tenth round of a burst goes where the first did.',
      fold: function (w) { return { heatSpread: 0.35, adsSpread: w.adsSpread * 0.92, move: w.move * 0.97 }; } },
    { id: 'b-fluted', slot: 'barrel', name: 'Fluted Barrel', lvl: 14, classes: LONGARM,
      blurb: 'Grooves cut down the outside. Long barrel weight, short barrel handling.',
      fold: function (w) { return { ads: w.ads * 0.93, move: w.move * 1.03, rec: [w.rec[0] * 1.08, w.rec[1] * 1.08] }; } },
    { id: 'b-match', slot: 'barrel', name: 'Match Grade Barrel', lvl: 16, classes: LONGARM.concat(['pistol']),
      blurb: 'Cut on a good day by somebody who cared. Tightest sights in the game.',
      fold: function (w) { return { adsSpread: w.adsSpread * 0.62, spread: w.spread * 0.94, ads: w.ads * 1.08 }; } },
    { id: 'b-recon', slot: 'barrel', name: 'Recon Barrel', lvl: 18, classes: ['assault', 'smg', 'sniper', 'shotgun'],
      blurb: 'Anybody you hit and do not kill is outlined for three seconds.',
      fold: function (w) { return { mark: 3.0, dmg: w.dmg * 0.95 }; } },
    { id: 'b-cqb', slot: 'barrel', name: 'CQB Barrel', lvl: 7, classes: ['smg', 'shotgun', 'assault'],
      blurb: 'Sawn back to the gas block. Hipfire tightens, everything else suffers.',
      fold: function (w) { return { spread: w.spread * 0.66, ads: w.ads * 0.88, far: w.far * 0.74, dmgFar: w.dmgFar * 0.88, move: w.move * 1.05 }; } },
    { id: 'b-marksman', slot: 'barrel', name: 'Marksman Barrel', lvl: 20, classes: ['assault', 'sniper', 'lmg'],
      blurb: 'Long, heavy, and it does not want to be moved once it is pointed.',
      fold: function (w) { return { near: w.near * 1.35, far: w.far * 1.30, dmgFar: w.dmgFar * 1.12, ads: w.ads * 1.20, move: w.move * 0.92 }; } },
    { id: 'b-shrouded', slot: 'barrel', name: 'Shrouded Barrel', lvl: 15, classes: LONGARM,
      blurb: 'A handguard over the whole thing. No flash, no heat shimmer, no hurry.',
      fold: function (w) { return { noFlash: true, noShimmer: true, rec: [w.rec[0] * 0.90, w.rec[1] * 0.90], ads: w.ads * 1.06 }; } },
    { id: 'b-ported', slot: 'barrel', name: 'Ported Barrel', lvl: 13, classes: LONGARM.concat(['pistol']),
      blurb: 'Holes drilled through the top near the muzzle. Flat, and very loud.',
      fold: function (w) { return { rec: [w.rec[0] * 0.66, w.rec[1] * 0.94], loud: true, dmgFar: w.dmgFar * 0.94 }; } },
    { id: 'b-tactical', slot: 'barrel', name: 'Tactical Barrel', lvl: 1, classes: GUNCLS,
      blurb: 'Lightweight profile. Fastest hip-to-sight there is and nothing else to say for itself.',
      fold: function (w) { return { ads: w.ads * 0.80, move: w.move * 1.04, rec: [w.rec[0] * 1.18, w.rec[1] * 1.14] }; } },

    /* ---------------- UNDERBARREL (8) ---------------- */
    { id: 'u-vert', slot: 'under', name: 'Vertical Grip', lvl: 1, classes: LONGARM,
      blurb: 'Pulls the climb out and puts weight in.',
      fold: function (w) { return { rec: [w.rec[0] * 0.72, w.rec[1] * 0.94], ads: w.ads * 1.05 }; } },
    { id: 'u-angle', slot: 'under', name: 'Angled Grip', lvl: 5, classes: LONGARM,
      blurb: 'Rolls the gun into the shoulder. Quicker up, worse held.',
      fold: function (w) { return { ads: w.ads * 0.87, rec: [w.rec[0] * 1.06, w.rec[1] * 0.86] }; } },
    { id: 'u-bipod', slot: 'under', name: 'Bipod', lvl: 10, classes: ['lmg', 'assault', 'sniper'],
      blurb: 'Put it on something and the recoil stops being a problem you have.',
      fold: function (w) { return { bipod: true, move: w.move * 0.96 }; } },
    { id: 'u-ranger', slot: 'under', name: 'Ranger Foregrip', lvl: 12, classes: LONGARM,
      blurb: 'A long handstop out at the end. Steadies the swing, slows the turn.',
      fold: function (w) { return { sway: 0.55, turn: 0.90, rec: [w.rec[0] * 0.88, w.rec[1] * 0.82] }; } },
    { id: 'u-handstop', slot: 'under', name: 'Handstop', lvl: 8, classes: LONGARM,
      blurb: 'A lump of polymer. Faster out of a sprint than anything else here.',
      fold: function (w) { return { sprintOut: 0.62, ads: w.ads * 0.96, rec: [w.rec[0] * 1.06, w.rec[1] * 1.06] }; } },
    { id: 'u-sling', slot: 'under', name: 'Tactical Sling', lvl: 15, classes: LONGARM,
      blurb: 'Hangs the gun where your hands are. Swap and sprint-out both drop.',
      fold: function (w) { return { swap: 0.55, sprintOut: 0.70, adsSpread: w.adsSpread * 1.10 }; } },
    { id: 'u-m203', slot: 'under', name: 'Under-Barrel Launcher', lvl: 23, classes: ['assault', 'lmg'],
      blurb: 'One 40mm grenade under the barrel, and no second one.',
      fold: function (w) { return { ubGL: 1, move: w.move * 0.94, ads: w.ads * 1.10 }; } },
    { id: 'u-masterkey', slot: 'under', name: 'Under-Barrel Shotgun', lvl: 23, classes: ['assault', 'smg'],
      blurb: 'Four shells slung under the handguard for the door you did not plan on.',
      fold: function (w) { return { ubShotgun: 4, move: w.move * 0.94, ads: w.ads * 1.08 }; } },

    /* ---------------- MAGAZINES (9) ---------------- */
    { id: 'g-ext', slot: 'mag', name: 'Extended Magazine', lvl: 1, classes: GUNCLS, not: ['riotshield'],
      blurb: 'Half again as many, and a slower change.',
      fold: function (w) { return { mag: Math.ceil(w.mag * 1.5), reload: w.reload * 1.08 }; } },
    { id: 'g-fast', slot: 'mag', name: 'Fast Magazine', lvl: 4, classes: GUNCLS, not: ['riotshield'],
      blurb: 'Tabbed base plate. Fewer rounds and a much quicker change.',
      fold: function (w) { return { mag: Math.max(2, Math.round(w.mag * 0.72)), reload: w.reload * 0.60 }; } },
    { id: 'g-drum', slot: 'mag', name: 'Drum Magazine', lvl: 19,
      classes: ['smg', 'lmg', 'assault'], fams: ['trench', 'kalash', 'bipod', 'kurz'],
      not: ['mp40', 'sten'],
      blurb: 'Enormous. The gun stops being something you carry and starts being something you hold.',
      fold: function (w) { return { mag: Math.round(w.mag * 2.4), reload: w.reload * 1.55, move: w.move * 0.94, ads: w.ads * 1.10 }; } },
    { id: 'g-speed', slot: 'mag', name: 'Speed Loader', lvl: 6, classes: ['shotgun', 'sniper', 'pistol'],
      fams: ['pump', 'auto12', 'handcannon', 'bolt'],
      blurb: 'All of them at once instead of one at a time.',
      fold: function (w) { return { reload: w.reload * 0.55, reloadKind: 'mag' }; } },
    { id: 'g-ap', slot: 'mag', name: 'Armour-Piercing Rounds', lvl: 16, classes: GUNCLS, not: ['riotshield', 'crossbow'],
      blurb: 'Goes through thin cover and through equipment. Softer on flesh.',
      fold: function (w) { return { pierce: (w.pierce || 0) + 1, vsEquip: 2.0, dmg: w.dmg * 0.94 }; } },
    { id: 'g-hollow', slot: 'mag', name: 'Hollow Point Rounds', lvl: 18, classes: GUNCLS, not: ['riotshield'],
      blurb: 'Hits limbs like it hits a chest. Stops at the first thing it touches.',
      fold: function (w) { return { limbMul: 1.0, pierce: 0, dmgFar: w.dmgFar * 0.90 }; } },
    { id: 'g-incendiary', slot: 'mag', name: 'Incendiary Rounds', lvl: 21, classes: GUNCLS, not: ['riotshield', 'stinger'],
      blurb: 'Sets them alight. Four a second for three seconds, and they know it.',
      fold: function (w) { return { burn: [4, 3], dmg: w.dmg * 0.90 }; } },
    { id: 'g-subsonic', slot: 'mag', name: 'Subsonic Rounds', lvl: 13, classes: GUNCLS, not: ['riotshield'],
      blurb: 'No crack overhead, so nobody nearby learns which way it came from.',
      fold: function (w) { return { noCrack: true, mv: w.mv * 0.62, far: w.far * 0.88 }; } },
    { id: 'g-tracer', slot: 'mag', name: 'Tracer Rounds', lvl: 27, classes: GUNCLS, not: ['riotshield'],
      blurb: 'You can see where it went. So can they.',
      fold: function (w) { return { tracer: true, visible: true, rec: [w.rec[0] * 0.94, w.rec[1] * 0.94] }; } },

    /* ---------------- STOCKS (7) ---------------- */
    { id: 's-collapsible', slot: 'stock', name: 'Collapsible Stock', lvl: 3, classes: LONGARM,
      blurb: 'Shorter in the shoulder. Move faster, hold worse.',
      fold: function (w) { return { move: w.move * 1.06, adsMove: 1.18, rec: [w.rec[0] * 1.12, w.rec[1] * 1.12] }; } },
    { id: 's-heavy', slot: 'stock', name: 'Heavy Stock', lvl: 7, classes: LONGARM,
      blurb: 'Weight in the butt. The sight picture stops drifting.',
      fold: function (w) { return { sway: 0.45, rec: [w.rec[0] * 0.84, w.rec[1] * 0.78], move: w.move * 0.94 }; } },
    { id: 's-none', slot: 'stock', name: 'No Stock', lvl: 11, classes: ['smg', 'shotgun'],
      blurb: 'Taken off entirely. You are quick, and you cannot hold it.',
      fold: function (w) { return { move: w.move * 1.12, ads: w.ads * 0.82, spread: w.spread * 1.20, rec: [w.rec[0] * 1.35, w.rec[1] * 1.40] }; } },
    { id: 's-padded', slot: 'stock', name: 'Padded Stock', lvl: 9, classes: LONGARM,
      blurb: 'Rubber butt pad. Takes the first shot out of the burst.',
      fold: function (w) { return { firstShot: 0.55, flinch: 0.70, move: w.move * 0.97 }; } },
    { id: 's-skeleton', slot: 'stock', name: 'Skeleton Stock', lvl: 14, classes: LONGARM,
      blurb: 'Everything not holding it together, removed.',
      fold: function (w) { return { move: w.move * 1.04, sprintOut: 0.78, sway: 1.20 }; } },
    { id: 's-wire', slot: 'stock', name: 'Wire Stock', lvl: 5, classes: ['smg', 'lmg'],
      blurb: 'A folded rod. Light, cheap and it rattles.',
      fold: function (w) { return { move: w.move * 1.08, ads: w.ads * 0.92, rec: [w.rec[0] * 1.22, w.rec[1] * 1.18] }; } },
    { id: 's-marksman', slot: 'stock', name: 'Marksman Stock', lvl: 17, classes: ['sniper', 'assault', 'lmg'],
      blurb: 'Cheek riser and an adjustable comb. Built to be still.',
      fold: function (w) { return { sway: 0.30, holdBreath: true, adsSpread: w.adsSpread * 0.80, move: w.move * 0.90 }; } },

    /* ---------------- REAR GRIPS (6) ---------------- */
    { id: 'r-rubber', slot: 'grip', name: 'Rubber Grip', lvl: 1, classes: GUNCLS,
      blurb: 'Soft. The gun comes back down to where it started.',
      fold: function (w) { return { recover: 1.30, rec: [w.rec[0] * 0.94, w.rec[1] * 0.94] }; } },
    { id: 'r-stippled', slot: 'grip', name: 'Stippled Grip', lvl: 4, classes: GUNCLS,
      blurb: 'Burnt-in texture. Nothing slips when you are sprinting.',
      fold: function (w) { return { sprintOut: 0.76, ads: w.ads * 0.96 }; } },
    { id: 'r-quickdraw', slot: 'grip', name: 'Quickdraw Grip', lvl: 8, classes: GUNCLS,
      blurb: 'Steep angle. The sights come up and the shot goes wide.',
      fold: function (w) { return { ads: w.ads * 0.82, adsSpread: w.adsSpread * 1.15 }; } },
    { id: 'r-tape', slot: 'grip', name: 'Field Tape', lvl: 6, classes: GUNCLS,
      blurb: 'Wrapped by hand on a bad night. It holds.',
      fold: function (w) { return { flinch: 0.72, swap: 0.82 }; } },
    { id: 'r-ergo', slot: 'grip', name: 'Ergonomic Grip', lvl: 15, classes: GUNCLS,
      blurb: 'Filled the web of the hand in. Less of everything in the wrist.',
      fold: function (w) { return { rec: [w.rec[0] * 0.86, w.rec[1] * 0.86], sway: 0.80 }; } },
    { id: 'r-granulated', slot: 'grip', name: 'Granulated Grip', lvl: 20, classes: GUNCLS,
      blurb: 'Coarse grit bonded to the panels. You can hold it wet.',
      fold: function (w) { return { firstShot: 0.70, recover: 1.18, ads: w.ads * 1.02 }; } },

    /* ---------------- LASERS (5) ----------------
       Every laser is the same bargain from a different angle: your
       hipfire gets better and a red line points back at your face. */
    { id: 'l-1mw', slot: 'laser', name: '1mW Laser', lvl: 1, classes: GUNCLS,
      blurb: 'Faint. Tightens the hip and is hard to spot.',
      fold: function (w) { return { spread: w.spread * 0.82, beam: 0.35 }; } },
    { id: 'l-5mw', slot: 'laser', name: '5mW Laser', lvl: 9, classes: GUNCLS,
      blurb: 'Bright. Very good, and very obvious.',
      fold: function (w) { return { spread: w.spread * 0.62, beam: 1.0 }; } },
    { id: 'l-tac', slot: 'laser', name: 'Tactical Laser', lvl: 13, classes: GUNCLS,
      blurb: 'Under the handguard with a pressure pad. Steadies the sights too.',
      fold: function (w) { return { spread: w.spread * 0.74, sway: 0.70, beam: 0.6 }; } },
    { id: 'l-ir', slot: 'laser', name: 'IR Laser', lvl: 19, classes: GUNCLS,
      blurb: 'Invisible unless they are wearing the goggles. Most of them are not.',
      fold: function (w) { return { spread: w.spread * 0.70, beam: 0, irOnly: true }; } },
    { id: 'l-steady', slot: 'laser', name: 'Steady Aim Laser', lvl: 24, classes: GUNCLS,
      blurb: 'Gyro-stabilised head. Best hipfire in the game and it weighs a pound.',
      fold: function (w) { return { spread: w.spread * 0.52, beam: 0.8, move: w.move * 0.96, ads: w.ads * 1.06 }; } },
  ];

  /* ================================================================
     TACTICALS, LETHALS, ABILITIES
     ================================================================ */

  var TACTICALS = [
    { id: 't-flash', name: 'Flash Grenade', lvl: 0,
      blurb: 'White for two seconds, deaf for three. Bounces off walls.' },
    { id: 't-stun', name: 'Stun Grenade', lvl: 0,
      blurb: 'They can still see. They just cannot get anywhere.' },
    { id: 't-smoke', name: 'Smoke Screen', lvl: 3,
      blurb: 'Fifteen seconds of nothing. Thermal reads straight through it.' },
    { id: 't-snapshot', name: 'Snapshot Grenade', lvl: 6,
      blurb: 'One frozen outline of everybody in the blast, for everyone on your side.' },
    { id: 't-heartbeat', name: 'Heartbeat Sensor', lvl: 9,
      blurb: 'A cone in front of you, refreshed every second. Ghost Step is invisible to it.' },
    { id: 't-decoy', name: 'Decoy Grenade', lvl: 12,
      blurb: 'Fake gunfire and fake blips for eight seconds.' },
    { id: 't-gas', name: 'Gas Grenade', lvl: 15,
      blurb: 'Slows, blurs and coughs. Does not kill and does not have to.' },
    { id: 't-stim', name: 'Stim Shot', lvl: 18,
      blurb: 'Instant heal and a second of sprint. One use, then a long wait.' },
  ];

  var LETHALS = [
    { id: 'x-frag', name: 'Frag Grenade', lvl: 0,
      blurb: 'Four second fuse you can cook. Rolls.' },
    { id: 'x-semtex', name: 'Semtex', lvl: 0,
      blurb: 'Sticks to whatever it lands on, including people.' },
    { id: 'x-knife', name: 'Throwing Knife', lvl: 4,
      blurb: 'One kill, silent, and you can go and pick it up again.' },
    { id: 'x-claymore', name: 'Claymore', lvl: 7,
      blurb: 'Faces one way. Put it where they will not be looking.' },
    { id: 'x-betty', name: 'Bouncing Betty', lvl: 10,
      blurb: 'Jumps to waist height before it goes. Crouching under it works.' },
    { id: 'x-thermite', name: 'Thermite', lvl: 13,
      blurb: 'Burns through whatever it is stuck to for six seconds.' },
    { id: 'x-molotov', name: 'Molotov', lvl: 16,
      blurb: 'A pool of fire in a doorway. Nobody walks through it twice.' },
    { id: 'x-satchel', name: 'Satchel Charge', lvl: 19,
      blurb: 'Thrown, then detonated when you choose. Two of them.' },
  ];

  /* One ability, charged by doing things rather than by a timer, so a
     player who is losing gets theirs later rather than never. */
  var ABILITIES = [
    { id: 'a-ghost', name: 'Ghost Step', charge: 70,
      blurb: 'Off every radar and silent on your feet for twenty seconds.' },
    { id: 'a-overclock', name: 'Overclock', charge: 55,
      blurb: 'Reload and swap at double speed for fifteen seconds.' },
    { id: 'a-secondwind', name: 'Second Wind', charge: 100,
      blurb: 'The next shot that would kill you leaves you on one instead. Once.' },
    { id: 'a-medic', name: 'Field Medic', charge: 65,
      blurb: 'Heals you and anybody on your side within six metres.' },
    { id: 'a-spotter', name: 'Spotter', charge: 80,
      blurb: 'Every enemy outlined through every wall for eight seconds. Your whole team sees it.' },
    { id: 'a-ironhide', name: 'Ironhide', charge: 75,
      blurb: 'A plate on the chest. Thirty per cent less, and no flinch, for twelve seconds.' },
    { id: 'a-kick', name: "Sprinter's Kick", charge: 50,
      blurb: 'Faster than anybody for ten seconds, and your melee kills in one.' },
    { id: 'a-jammer', name: 'Jammer', charge: 60,
      blurb: 'Kills the enemy minimap inside thirty metres of you for twenty seconds.' },
  ];

  /* ================================================================
     KILLSTREAKS
     ================================================================
     Five slots. Sixteen to put in them, priced in kills without dying.

     The rule the list is built around: nothing above eight kills may
     get its own kills without the player being in danger while it
     does. The gunship is flown by you, from the gunship, and you are
     lying on the floor of the map the whole time you are in it. */
  var KILLSTREAKS = [
    { id: 'k-recon', name: 'Recon Drone', cost: 3,
      blurb: 'Sweeps the map every four seconds for thirty. Everyone on your side sees it.' },
    { id: 'k-jammer', name: 'Jammer Drone', cost: 4,
      blurb: 'Their minimap goes to static for forty-five seconds.' },
    { id: 'k-crate', name: 'Supply Crate', cost: 4,
      blurb: 'A crate with a streak in it. Either side can open it.' },
    { id: 'k-mortar', name: 'Mortar Strike', cost: 5,
      blurb: 'Three points on the map, eight seconds apart. You pick them.' },
    { id: 'k-sentry', name: 'Sentry Gun', cost: 5,
      blurb: 'Placed, and it faces the way you were. Ninety degrees, ninety seconds.' },
    { id: 'k-cluster', name: 'Cluster Strike', cost: 6,
      blurb: 'One canister, twelve bomblets, one roof taken off.' },
    { id: 'k-airstrike', name: 'Precision Airstrike', cost: 7,
      blurb: 'A line you draw on the map and a pair of jets down it.' },
    { id: 'k-heli', name: 'Attack Helicopter', cost: 7,
      blurb: 'Ninety seconds overhead. A launcher answers it.' },
    { id: 'k-vest', name: 'Armour Drop', cost: 8,
      blurb: 'Plates for you and anybody who gets there. Doubles what you can take.' },
    { id: 'k-napalm', name: 'Napalm Run', cost: 8,
      blurb: 'A wall of fire across a third of the map that stays for twenty seconds.' },
    { id: 'k-wheeled', name: 'Wheeled Sentry', cost: 9,
      blurb: 'You drive it. It shoots. It is not armoured and it is very loud.' },
    { id: 'k-gunship', name: 'Gunship', cost: 10,
      blurb: 'Forty seconds in the chair, and your body is lying on the map the whole time.' },
    { id: 'k-strafe', name: 'Strafe Run', cost: 11,
      blurb: 'Five aircraft down a line. Nothing standing on that line is standing after.' },
    { id: 'k-airdrop', name: 'Emergency Airdrop', cost: 12,
      blurb: 'Three crates at once. Get a friend.' },
    { id: 'k-jugg', name: 'Juggernaut Drop', cost: 15,
      blurb: 'Armour, a minigun and a walk. You are slow and everyone knows where you are.' },
    { id: 'k-blackout', name: 'Blackout', cost: 25,
      blurb: 'Twenty-five without dying ends the match. It has been done four times.' },
    /* THE BERSERKER SUIT.
       Not a strike and not a vehicle: a second body. A flare goes on
       the ground, a jet drops a capsule on it, and what walks out is
       twelve feet of welded plate with a minigun for one arm and a
       flamethrower for the other. Ten thousand points of armour, and
       you are in third person and cannot hold your own weapons for as
       long as you are in it. */
    { id: 'k-berserker', name: 'Berserker Suit', cost: 18,
      blurb: 'A flare, a jet, a capsule, and twelve feet of welded plate with a minigun for an arm.' },
  ];

  /* ================================================================
     KILLSTREAK LEVELS
     ================================================================
     Every streak levels three times, and the second and third are not
     "more damage" -- each is one named ability you turn on or off in
     the loadout. A level you cannot switch off is a level that just
     rewrites the streak; a level you can is a choice.

     `unlock` is how many times the streak has been CALLED IN, over a
     career, not kills. You level a streak by using it. */
  var STREAK_LEVELS = {
    'k-recon':    [null,
      { id: 'sl-recon-2',    unlock: 8,  name: 'Continuous',   desc: 'Sweeps every two seconds instead of four.' },
      { id: 'sl-recon-3',    unlock: 25, name: 'Hardened',     desc: 'A jammer no longer blinds it.' }],
    'k-jammer':   [null,
      { id: 'sl-jammer-2',   unlock: 8,  name: 'Wide',         desc: 'Forty-five metres instead of thirty.' },
      { id: 'sl-jammer-3',   unlock: 25, name: 'Silent',       desc: 'No warning tone on their side.' }],
    'k-crate':    [null,
      { id: 'sl-crate-2',    unlock: 8,  name: 'Locked',       desc: 'Only your side can open it.' },
      { id: 'sl-crate-3',    unlock: 25, name: 'Double',       desc: 'Two streaks inside, not one.' }],
    'k-mortar':   [null,
      { id: 'sl-mortar-2',   unlock: 8,  name: 'Five rounds',  desc: 'Five points on the map, not three.' },
      { id: 'sl-mortar-3',   unlock: 25, name: 'Airburst',     desc: 'Detonates overhead. Roofs stop nothing.' }],
    'k-sentry':   [null,
      { id: 'sl-sentry-2',   unlock: 8,  name: 'Wide arc',     desc: 'A hundred and eighty degrees, not ninety.' },
      { id: 'sl-sentry-3',   unlock: 25, name: 'Plated',       desc: 'Twice the armour and it survives one rocket.' }],
    'k-cluster':  [null,
      { id: 'sl-cluster-2',  unlock: 8,  name: 'Wide pattern', desc: 'Twenty bomblets over a wider circle.' },
      { id: 'sl-cluster-3',  unlock: 25, name: 'Incendiary',   desc: 'Each bomblet leaves fire for eight seconds.' }],
    'k-airstrike':[null,
      { id: 'sl-air-2',      unlock: 8,  name: 'Second pass',  desc: 'The pair comes back down the line once.' },
      { id: 'sl-air-3',      unlock: 25, name: 'Low level',    desc: 'Under the roofline. No warning shadow.' }],
    'k-heli':     [null,
      { id: 'sl-heli-2',     unlock: 8,  name: 'Flares',       desc: 'Survives the first launcher hit.' },
      { id: 'sl-heli-3',     unlock: 25, name: 'Door gunner',  desc: 'You can take the gun yourself.' }],
    'k-vest':     [null,
      { id: 'sl-vest-2',     unlock: 8,  name: 'Deep pack',    desc: 'Four plates each instead of two.' },
      { id: 'sl-vest-3',     unlock: 25, name: 'Fast swap',    desc: 'Plating up takes a second, not three.' }],
    'k-napalm':   [null,
      { id: 'sl-napalm-2',   unlock: 8,  name: 'Long burn',    desc: 'Thirty-five seconds of fire, not twenty.' },
      { id: 'sl-napalm-3',   unlock: 25, name: 'Twin run',     desc: 'Two walls, crossing.' }],
    'k-wheeled':  [null,
      { id: 'sl-wheel-2',    unlock: 8,  name: 'Quiet drive',  desc: 'Off their minimap until it fires.' },
      { id: 'sl-wheel-3',    unlock: 25, name: 'Scuttle',      desc: 'Detonate it where it stands.' }],
    'k-gunship':  [null,
      { id: 'sl-gun-2',      unlock: 8,  name: 'Sixty seconds',desc: 'Twenty more in the chair.' },
      { id: 'sl-gun-3',      unlock: 25, name: 'Body guarded', desc: 'Your body on the map takes half damage.' }],
    'k-strafe':   [null,
      { id: 'sl-strafe-2',   unlock: 8,  name: 'Eight ships',  desc: 'Five became eight.' },
      { id: 'sl-strafe-3',   unlock: 25, name: 'Rockets',      desc: 'The last pair carries rockets.' }],
    'k-airdrop':  [null,
      { id: 'sl-drop-2',     unlock: 8,  name: 'Four crates',  desc: 'One more, and it lands closer.' },
      { id: 'sl-drop-3',     unlock: 25, name: 'Booby trapped',desc: 'Kills the first enemy to open one.' }],
    'k-jugg':     [null,
      { id: 'sl-jugg-2',     unlock: 8,  name: 'Lighter',      desc: 'You move at three quarters, not half.' },
      { id: 'sl-jugg-3',     unlock: 25, name: 'Riot plate',   desc: 'Half damage from the front.' }],
    'k-blackout': [null,
      { id: 'sl-black-2',    unlock: 4,  name: 'Longer',       desc: 'Ten seconds of it, not six.' },
      { id: 'sl-black-3',    unlock: 12, name: 'Total',        desc: 'Their sights go too.' }],
    /* The one the whole thing was asked for. */
    'k-berserker':[null,
      { id: 'sl-bers-2', unlock: 5,  name: 'Health Cannon',
        desc: 'The flamethrower arm becomes a cannon: heals you or a teammate, '
            + 'or does ten damage to an enemy. 54 rounds a minute, twenty seconds to recharge.' },
      { id: 'sl-bers-3', unlock: 14, name: 'Overdrive',
        desc: 'The minigun spins up instantly and cools in two seconds instead of five.' }],
  };

  /* The suit's own numbers, in one place, because four files need them
     and a mech whose health is written down twice is a mech with two
     different healths. */
  var BERSERKER = {
    hp: 10000,
    height: 3.66,            // twelve feet
    walk: 2.6, turn: 1.5,    // slow, and it turns like a tank
    minigun: { rpm: 3000, damage: 10, rounds: 500, cool: 5.0, spin: 0.9, spread: 0.022 },
    flame:   { rpm: 600, damage: 7, reach: 9.5, cone: 0.30 },
    health:  { rpm: 54, heal: 25, damage: 10, cool: 20.0, speed: 34 },
    fov: { hip: 1, ads: 0.62 },
    flare:   { fuse: 1.2, smoke: 3.2, jet: 2.6, capsule: 2.2, open: 2.4 },
  };

  /* ================================================================
     LEVELS, PRESTIGE, CAMO
     ================================================================
     A gun levels two ways and the second one is the point.

     KILLS give the most: sixty experience each, a hundred for a head.
     But a gun also earns simply for being carried -- twelve points for
     every ten metres walked with it in a live match. Ten metres is
     about two seconds of jogging, so a full match of moving about with
     a gun you are bad with still gets you somewhere. Nobody should be
     locked out of the attachment that would make a gun work for them
     by not yet being good with the gun without it.

     Thirty levels. The curve is quadratic rather than flat so the last
     few mean something, and the whole thing is reachable from either
     end: level 30 is about four hundred kills, or twenty kilometres of
     walking, or -- which is what actually happens -- some of each. Six
     or seven matches with a gun you like.

     PRESTIGE is three tiers past that, per gun:

       GOLD      level 30, and every attachment unlocked
       PLATINUM  gold, and six hundred kills with it
       DIAMOND   platinum, eleven hundred kills, and fifty heads

     The kill counts are absolute rather than counted from the tier
     below, because a gun can reach gold on walking alone with almost
     no kills behind it, and a platinum that only asked for 250 more
     than that would be handed out to somebody who had shot nobody.

     Diamond gives the camo and it gives the keychain -- a real object
     hanging off the rear sling loop, chosen and engraved by the player,
     that everybody who kills you sees in the kill camera. */

  var MAX_LEVEL = 30;
  var XP_KILL = 60, XP_HEADSHOT = 100, XP_ASSIST = 25, XP_PER_10M = 12;

  /* Total experience needed to HAVE reached level n. */
  function xpForLevel(n) {
    if (n <= 1) return 0;
    var k = n - 1;
    return Math.round(120 * k + 24 * k * k);
  }
  function levelForXp(xp) {
    var n = 1;
    while (n < MAX_LEVEL && xp >= xpForLevel(n + 1)) n++;
    return n;
  }

  var PRESTIGE = [
    { id: 'gold', name: 'Gold', color: '#ffd27a',
      need: 'Level 30 with every attachment unlocked' },
    { id: 'platinum', name: 'Platinum', color: '#d8e6f2',
      need: 'Gold, and six hundred kills with it' },
    { id: 'diamond', name: 'Diamond', color: '#8fe3ff',
      need: 'Platinum, eleven hundred kills and fifty heads' },
  ];

  var CAMOS = [
    { id: 'none', name: 'None', lvl: 0 },
    { id: 'woodland', name: 'Woodland', lvl: 5 },
    { id: 'desert', name: 'Desert Three-Colour', lvl: 8 },
    { id: 'splinter', name: 'Splinter', lvl: 12 },
    { id: 'urban', name: 'Urban Grey', lvl: 16 },
    { id: 'tiger', name: 'Tiger Stripe', lvl: 20 },
    { id: 'ash', name: 'Ash', lvl: 24 },
    { id: 'whiteout', name: 'Whiteout', lvl: 28 },
    { id: 'gold', name: 'Gold', prestige: 'gold' },
    { id: 'platinum', name: 'Platinum', prestige: 'platinum' },
    { id: 'diamond', name: 'Diamond', prestige: 'diamond' },
  ];

  /* The keychain: unlocked at diamond, hung off the sling loop, and the
     only thing in the loadout that is purely for being looked at. */
  var KEYCHAIN_SHAPES = [
    { id: 'tag', name: 'Dog Tag' }, { id: 'shell', name: 'Fired Case' },
    { id: 'skull', name: 'Small Skull' }, { id: 'coin', name: 'Challenge Coin' },
    { id: 'dice', name: 'Bone Die' }, { id: 'flamingo', name: 'Flamingo' },
    { id: 'key', name: 'Bunker Key' }, { id: 'anchor', name: 'Anchor' },
  ];
  var KEYCHAIN_METALS = [
    { id: 'brass', name: 'Brass', color: '#b08d4a' },
    { id: 'steel', name: 'Steel', color: '#a3a5aa' },
    { id: 'blued', name: 'Blued', color: '#3b4148' },
    { id: 'copper', name: 'Copper', color: '#a9633d' },
    { id: 'gold', name: 'Gold', color: '#d4a534' },
  ];

  /* ================================================================
     MAPS
     ================================================================
     Four, named by the person this is being built for and laid out
     here. Each one is a three-lane map because three lanes is what
     makes a six-a-side match readable: you can always be flanked from
     exactly one side, and you always know which.

     `lanes` is the shape in words; `size` is the playable square in
     metres; `spawns` are the two ends; `bombs` are the two Search and
     Destroy sites. */
  var MAPS = [
    {
      id: 'helipad', name: 'Helipad', size: 118,
      where: 'A coastal landing pad cut into the cliff', time: 'first light',
      blurb: 'A concrete apron with a helicopter still on it, a fuel farm on one '
        + 'side and the hangar on the other. The pad itself is the middle lane and '
        + 'it is completely open -- everybody learns not to cross it, and then '
        + 'somebody does, and it decides the round.',
      lanes: ['fuel farm and the pipe run', 'the open pad', 'hangar and the workshops'],
      verticality: 'Control tower over the hangar, and the cliff walk above the fuel farm.',
      bombs: ['the helicopter', 'the fuel manifold'],
      shots: [],
    },
    {
      id: 'resort', name: 'Resort', size: 124,
      where: 'An off-season hotel on a lake', time: 'afternoon',
      blurb: 'Empty in the way hotels are in February: chairs stacked, pool '
        + 'drained, one lamp on behind reception. The drained pool is a pit in the '
        + 'middle of the map that you fight down into and cannot easily leave.',
      lanes: ['the lobby and the corridor behind it', 'the drained pool', 'terrace, cabanas and the lake path'],
      verticality: 'First-floor balconies over the pool on three sides. Two staircases and one drainpipe.',
      bombs: ['reception desk', 'the pool plant room'],
      shots: [],
    },
    {
      id: 'town', name: 'Town', size: 132,
      where: 'Four streets of a place that was evacuated', time: 'overcast noon',
      blurb: 'The biggest of the four and the only one with real interiors: a '
        + 'bakery, a garage with the pit open, and a church. The high street runs '
        + 'the length of it and is a shooting gallery, so nobody uses it and '
        + 'everybody watches it.',
      lanes: ['back gardens and the alley', 'the high street', 'garage, yard and the church'],
      verticality: 'Two first floors you can fight from and a church tower you can be seen in.',
      bombs: ['the bakery ovens', 'the garage pit'],
      shots: [],
    },
    {
      id: 'demolition', name: 'Demolition', size: 108,
      where: 'A block half knocked down and left', time: 'dusk',
      blurb: 'The smallest and the nastiest. Three floors of a building with most '
        + 'of the walls gone, so sightlines cut diagonally up and down through '
        + 'holes in the slabs. There is no safe lane. There is barely a lane.',
      lanes: ['the standing wing', 'the collapsed middle', 'the crane and the skips'],
      verticality: 'Everywhere. Every floor sees two others through a hole in something.',
      bombs: ['the crane base', 'the standing stairwell'],
      shots: [],
    },
  ];

  /* ================================================================
     MODES
     ================================================================ */
  var MODES = [
    { id: 'tdm', name: 'Team Deathmatch', short: 'TDM',
      rule: 'First to 75, or whoever is ahead at ten minutes.',
      blurb: 'Six a side, respawns on, and the only thing that counts is the '
        + 'scoreboard. It is the mode everything else is balanced against.',
      score: 75, minutes: 10, respawn: true },
    { id: 'snd', name: 'Search and Destroy', short: 'S&D',
      rule: 'One life. Plant or defend. First to six rounds.',
      blurb: 'No respawns, two bomb sites, and sides swap at three. A round is '
        + 'over in ninety seconds or it is over because everybody is dead.',
      score: 6, seconds: 100, respawn: false, bomb: true },
  ];

  var TEAM_SIZE = 6;

  /* ================================================================
     THE API
     ================================================================ */

  var GUN_BY_ID = {}, ATT_BY_ID = {};
  GUNS.forEach(function (g) { GUN_BY_ID[g.id] = g; });
  ATTACHMENTS.forEach(function (a) { ATT_BY_ID[a.id] = a; });

  function gun(id) { return GUN_BY_ID[id] || null; }
  function att(id) { return ATT_BY_ID[id] || null; }
  function gunsOf(cls) { return GUNS.filter(function (g) { return g.cls === cls; }); }

  /* Every field a fold is allowed to read, with a value, whether or not
     the gun bothered to write one. A fold that reads undefined and
     multiplies it produces NaN, and a NaN in a stat bar is a stat bar
     that silently stops existing -- so the defaults live here, once,
     rather than as a guard in sixty-nine places. */
/* A TABLE KEYED BY CLASS, AND THERE ARE TWO MORE CLASSES NOW.
 *
   Splitting the snipers and the shotguns out of Special left this
   reading `ADS_CONE['sniper']`, which is undefined, which multiplies to
   NaN, which every optic in the game then folded into its own answer.
   mpdata.test.js named it on the first run: "no attachment produces a
   NaN on any gun it fits -- remington+o-reflex.adsSpread". Any lookup
   by class is a list of the classes, and adding one means visiting
   every list. The ART table in the shell is the other one, and it has
   a fallback so it only went quiet rather than wrong -- which is worse,
   not better. */
  var ADS_CONE = {
    sniper: 0.05, special: 0.06, assault: 0.16, pistol: 0.22,
    shotgun: 0.24, smg: 0.28, lmg: 0.30, launcher: 0.40,
  };

  function baseStats(g) {
    return {
      id: g.id, name: g.name, cls: g.cls, fam: g.fam,
      mag: g.mag, rpm: g.rpm, burst: g.burst || 0,
      dmg: g.dmg, dmgFar: g.dmgFar, near: g.near, far: g.far, hs: g.hs,
      auto: g.auto !== false,
      pellets: g.pellets || 1,
      ads: g.ads, move: g.move, reload: g.reload, reloadKind: g.reloadKind || 'mag',
      rec: [g.rec[0], g.rec[1]], spread: g.spread, mv: g.mv,
      sightH: g.sightH != null ? g.sightH : 0.030,
      /* The cone the gun still has when it is in your shoulder and you
         are standing still. Every gun used to share one number, which
         made the whole optic slot invisible on a stat bar and, worse,
         said a belt-fed gun aims like a bolt rifle. It is by class now,
         and by pellet count, because a shotgun does not aim at all. */
      adsSpread: g.adsSpread != null ? g.adsSpread : ADS_CONE[g.cls] * (g.pellets > 1 ? 5.0 : 1),
      sightFov: 1.0,
      sway: 1.0, recover: 1.0, flinch: 1.0, firstShot: 1.0,
      swap: 1.0, sprintOut: 1.0, adsMove: 1.0, turn: 1.0,
      pierce: g.pierce || 0, splash: g.splash || 0,
      melee: 1.0, limbMul: 0.9, heatSpread: 1.0,
      quiet: false, loud: false, noFlash: false, tracer: false,
    };
  }

  /* Does this part go on this gun? Three questions in order, because
     the order is what lets a family rule be broad and an exception be
     narrow: the class has to be right, then the family if the part
     names families at all, and then the gun must not be on the part's
     list of guns that simply never took one. */
  function fits(a, g) {
    if (!a || !g) return false;
    if (a.classes && a.classes.indexOf(g.cls) < 0) return false;
    if (a.fams && a.fams.indexOf(g.fam) < 0) return false;
    if (a.not && a.not.indexOf(g.id) >= 0) return false;
    if (g.shield && a.slot !== 'laser') return false;
    return true;
  }

  function partsFor(g, slot) {
    return ATTACHMENTS.filter(function (a) {
      return (!slot || a.slot === slot) && fits(a, g);
    });
  }

  /* Every part the gun can ever take, which is what "unlock them all"
     has to mean for a gun that cannot take a duckbill. */
  function partCount(g) { return partsFor(g).length; }

  /* Apply a list of attachment ids to a gun and hand back the numbers.
     Folds return only what they change, so two parts that both touch
     recoil compose rather than one of them winning. */
  function build(gunId, fittedIds) {
    var g = gun(gunId);
    if (!g) return null;
    var w = baseStats(g);
    (fittedIds || []).forEach(function (id) {
      var a = att(id);
      if (!a || !fits(a, g)) return;
      var d = a.fold ? a.fold(w) : null;
      if (!d) return;
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) w[k] = d[k];
    });
    w.fitted = (fittedIds || []).filter(function (id) { return fits(att(id), g); });
    w.refire = 60 / w.rpm;
    w.stk = Math.max(1, Math.ceil(100 / (w.dmg * w.pellets)));
    w.stkFar = Math.max(1, Math.ceil(100 / (w.dmgFar * w.pellets)));
    w.ttk = (w.stk - 1) * w.refire;
    w.ttkFar = (w.stkFar - 1) * w.refire;
    return w;
  }

  /* ================================================================
     WHAT A PART ACTUALLY DOES TO A GUN
     ================================================================
     Every attachment is already a `fold` -- a function from the gun's
     stats to the stats it changes. So the pros and cons are not
     written down anywhere: they are MEASURED, by folding the part onto
     the gun you are actually holding and diffing the result.

     That is the whole reason to do it this way. A hand-written list
     says what somebody believed the part did when they typed it, and
     goes out of date the first time a number is tuned. This cannot be
     wrong about its own weapon, and it is right for every one of the
     sixty separately -- a compensator on a gun with no recoil honestly
     shows no pro at all.

     THE SIGNS, exactly as asked for:

       under 25 per cent        one sign
       25 to 55 per cent        two
       over 55 per cent         three

     and the SIGN ITSELF says which way the number went -- plus for up,
     minus for down -- while the COLOUR says whether that is good for
     you. So a scope that takes seventy per cent off your aimed cone is
     three GREEN MINUSES, and the weight it adds to your aim-down-sights
     time is a RED PLUS. Both are true at once and neither is buried.

     `higher` is per stat: true where more is better (damage, range),
     false where less is (spread, recoil, the time to bring it up). */
  var STAT_META = {
    dmg: { name: 'Damage', higher: true },
    dmgFar: { name: 'Damage at range', higher: true },
    near: { name: 'Close range', higher: true },
    far: { name: 'Effective range', higher: true },
    hs: { name: 'Headshot multiplier', higher: true },
    rpm: { name: 'Rate of fire', higher: true },
    mag: { name: 'Magazine', higher: true },
    pellets: { name: 'Pellets', higher: true },
    mv: { name: 'Muzzle velocity', higher: true },
    pierce: { name: 'Penetration', higher: true },
    splash: { name: 'Blast radius', higher: true },
    melee: { name: 'Melee damage', higher: true },
    move: { name: 'Movement speed', higher: true },
    adsMove: { name: 'Speed while aiming', higher: true },
    turn: { name: 'Turn rate', higher: true },
    recover: { name: 'Recoil recovery', higher: true },
    limbMul: { name: 'Limb damage', higher: true },
    ads: { name: 'Aim-down-sights time', higher: false },
    reload: { name: 'Reload time', higher: false },
    swap: { name: 'Weapon swap time', higher: false },
    sprintOut: { name: 'Sprint-to-fire time', higher: false },
    spread: { name: 'Hip-fire spread', higher: false },
    adsSpread: { name: 'Aimed spread', higher: false },
    heatSpread: { name: 'Spread under sustained fire', higher: false },
    sway: { name: 'Idle sway', higher: false },
    flinch: { name: 'Flinch when hit', higher: false },
    firstShot: { name: 'First-shot kick', higher: false },
    /* Reported as MAGNIFICATION rather than as the field of view it is
       stored as, because "field of view down 78 per cent" is a true
       sentence nobody reads as "four times magnification". Inverted
       below, in num(). */
    sightFov: { name: 'Magnification', higher: true, invert: true },
    recUp: { name: 'Vertical recoil', higher: false },
    recSide: { name: 'Horizontal recoil', higher: false },
    sightH: { name: 'Sight height', higher: false, quiet: true },
  };

  /* Flags are not percentages. They are a sentence, and whether the
     sentence is a pro or a con. */
  var FLAG_META = {
    quiet: [true, 'Off the minimap when you fire'],
    loud: [false, 'Marks you on their minimap when you fire'],
    noFlash: [true, 'No muzzle bloom in your own sight picture'],
    tracer: [false, 'Visible tracers lead them back to you'],
    thermal: [true, 'Heat signatures through smoke'],
    nightvision: [true, 'The dark corners stop being dark'],
    scoped: [false, 'Scoped: no use at all inside a room'],
    holdBreath: [true, 'You can hold your breath to steady it'],
    canted: [true, 'A second set of sights at forty-five degrees'],
    breach: [true, 'Takes door frames off their hinges'],
    akimbo: [false, 'No sights at all'],
    bipod: [true, 'Deployed, the recoil very nearly stops'],
  };

  function signsFor(pct) {
    var a = Math.abs(pct);
    if (a < 0.025) return 0;             // under two and a half per cent is noise
    if (a < 0.25) return 1;
    if (a < 0.55) return 2;
    return 3;
  }

  /* effectsOf(attachmentId, gunId, alreadyFitted)
       -> { pros: [...], cons: [...], flags: [...], all: [...] }
     Each entry: { stat, name, pct, signs, sign:'+'|'-', good, text }
     `alreadyFitted` matters: a part is measured on top of what is
     already on the gun, because that is the gun it is going onto. */
  function effectsOf(attId, gunId, alreadyFitted) {
    var a = att(attId), g = gun(gunId);
    if (!a || !g) return { pros: [], cons: [], flags: [], all: [], fits: false };
    if (!fits(a, g)) return { pros: [], cons: [], flags: [], all: [], fits: false };
    var before = build(gunId, (alreadyFitted || []).filter(function (id) {
      var b = att(id); return b && b.slot !== a.slot;
    }));
    var after = build(gunId, (alreadyFitted || []).filter(function (id) {
      var b = att(id); return b && b.slot !== a.slot;
    }).concat([attId]));
    var out = [], flags = [];

    function num(key, b, f) {
      var meta = STAT_META[key];
      if (!meta || meta.quiet) return;
      if (typeof b !== 'number' || typeof f !== 'number') return;
      if (!isFinite(b) || !isFinite(f) || b === 0) return;
      var pct = meta.invert ? (Math.abs(b) / Math.abs(f) - 1) : (f - b) / Math.abs(b);
      if (meta.invert && f === 0) return;
      var n = signsFor(pct);
      if (!n) return;
      var up = pct > 0;
      var good = meta.higher ? up : !up;
      out.push({
        stat: key, name: meta.name, pct: pct, signs: n,
        sign: up ? '+' : '\u2212', good: good,
        text: (up ? '+' : '\u2212') + Math.round(Math.abs(pct) * 100) + '% ' + meta.name,
      });
    }

    for (var k in STAT_META) {
      if (!Object.prototype.hasOwnProperty.call(STAT_META, k)) continue;
      if (k === 'recUp' || k === 'recSide') continue;
      num(k, before[k], after[k]);
    }
    /* Recoil is a pair, and both halves are their own line -- a brake
       that kills the shove and keeps the climb has to read as one pro
       and no con, not as an average of the two. */
    num('recUp', before.rec[0], after.rec[0]);
    num('recSide', before.rec[1], after.rec[1]);

    for (var f in FLAG_META) {
      if (!Object.prototype.hasOwnProperty.call(FLAG_META, f)) continue;
      if (!after[f] || before[f]) continue;
      flags.push({ flag: f, good: FLAG_META[f][0], text: FLAG_META[f][1] });
    }

    /* Biggest first, so the reason to fit it is the first line. */
    out.sort(function (x, y) { return Math.abs(y.pct) - Math.abs(x.pct); });
    return {
      fits: true,
      all: out, flags: flags,
      pros: out.filter(function (e) { return e.good; })
        .concat(flags.filter(function (e) { return e.good; })),
      cons: out.filter(function (e) { return !e.good; })
        .concat(flags.filter(function (e) { return !e.good; })),
    };
  }

  /* WHAT A PART LOCKS OUT.
     Some parts cannot live together even though they are in different
     slots -- an underbarrel launcher and a bipod are both bolted to
     the same rail, and a scope with its own magnifier has nowhere to
     put a canted iron. One table, read from both directions. */
  var EXCLUDES = {
    'o-7x': ['o-canted'], 'o-12x': ['o-canted', 'u-bipod'],
    'o-thermal': ['o-canted'], 'o-nvg': ['o-canted'],
    'u-launcher': ['u-bipod', 'u-grip', 'u-angled', 'u-laser', 'm-duckbill'],
    'u-bipod': ['u-launcher', 'u-grip', 'u-angled'],
    'u-grip': ['u-bipod', 'u-launcher', 'u-angled'],
    'u-angled': ['u-bipod', 'u-launcher', 'u-grip'],
    'm-duckbill': ['m-chokefull', 'u-launcher'],
    'm-chokefull': ['m-duckbill'],
    'm-annihilator': ['u-launcher'],
    's-none': ['s-heavy', 's-light'],
  };

  function excludedBy(attId) { return EXCLUDES[attId] || []; }
  /* Everything currently fitted that would have to come off. */
  function conflicts(attId, fittedIds) {
    var out = [];
    (fittedIds || []).forEach(function (id) {
      if (id === attId) return;
      if ((EXCLUDES[attId] || []).indexOf(id) >= 0
        || (EXCLUDES[id] || []).indexOf(attId) >= 0) out.push(id);
    });
    return out;
  }

  /* A loadout is legal if it names things that exist, fits no more than
     five parts on a gun, fits at most one per slot, and puts a launcher
     or a shield in the secondary only if it is allowed there. */
  function checkLoadout(L) {
    var bad = [];
    var p = gun(L.primary), s = gun(L.secondary);
    if (!p) bad.push('no primary');
    if (!s) bad.push('no secondary');
    if (s && s.cls !== 'pistol' && s.cls !== 'launcher' && !s.shield) bad.push('secondary must be a pistol, a launcher or the shield');
    ['primary', 'secondary'].forEach(function (which) {
      var g = gun(L[which]), ids = (L[which + 'Att'] || []);
      if (!g) return;
      if (ids.length > MAX_FITTED) bad.push(which + ' has more than ' + MAX_FITTED + ' attachments');
      var seen = {};
      ids.forEach(function (id) {
        var a = att(id);
        if (!a) { bad.push('unknown attachment ' + id); return; }
        if (!fits(a, g)) { bad.push(a.name + ' does not fit the ' + g.name); return; }
        if (seen[a.slot]) bad.push('two parts in the ' + a.slot + ' slot of the ' + which);
        seen[a.slot] = 1;
        var cl = conflicts(id, ids);
        if (cl.length) {
          bad.push(a.name + ' cannot be fitted with ' + cl.map(function (c) {
            var o = att(c); return o ? o.name : c;
          }).join(' or '));
        }
      });
    });
    var ks = L.streaks || [];
    if (ks.length > 3) bad.push('more than three killstreaks');
    var ksSeen = {};
    ks.forEach(function (id) { if (ksSeen[id]) bad.push('the same killstreak twice'); ksSeen[id] = 1; });
    return bad;
  }

  /* ---- progress ---- */

  function newProgress() { return { xp: 0, kills: 0, heads: 0, metres: 0 }; }

  function addKills(pr, n, heads) {
    pr.kills += n;
    pr.heads += (heads || 0);
    pr.xp += n * XP_KILL + (heads || 0) * (XP_HEADSHOT - XP_KILL);
    return pr;
  }
  function addMetres(pr, m) {
    pr.metres += m;
    pr.xp += Math.floor(m / 10) * XP_PER_10M;
    return pr;
  }

  function levelOf(pr) { return levelForXp(pr ? pr.xp : 0); }

  /* How far through the current level, 0..1 -- what the bar under a gun
     in the loadout screen is actually showing. */
  function levelFrac(pr) {
    var n = levelOf(pr);
    if (n >= MAX_LEVEL) return 1;
    var a = xpForLevel(n), b = xpForLevel(n + 1);
    return Math.max(0, Math.min(1, ((pr ? pr.xp : 0) - a) / (b - a)));
  }

  /* Gold, platinum, diamond -- or null, which is most guns most of the
     time and is not a failure state. */
  function prestigeOf(g, pr) {
    if (!pr) return null;
    var lv = levelOf(pr);
    var all = partCount(g);
    var unlocked = partsFor(g).filter(function (a) { return a.lvl <= lv; }).length;
    if (lv < MAX_LEVEL || unlocked < all) return null;
    if (pr.kills >= 1100 && pr.heads >= 50) return 'diamond';
    if (pr.kills >= 600) return 'platinum';
    return 'gold';
  }

  function unlockedParts(g, pr) {
    var lv = levelOf(pr);
    return partsFor(g).filter(function (a) { return a.lvl <= lv; });
  }
  function isUnlocked(a, pr) { return a.lvl <= levelOf(pr); }

  /* ---- bots ----
     Twelve names so a lobby fills without two of the same, and a pick
     that is weighted rather than uniform: a bot should look like a
     player, and players do not choose evenly. */
  var BOT_NAMES = ['HOLLAND', 'MARCHETTI', 'PIKE', 'ODUYA', 'STRAND', 'KOVAC',
    'BELL', 'ARRIETA', 'NIEMI', 'FAULK', 'RASHID', 'VOSS'];

  /* THE FOUR DIFFICULTIES, and `aim` is a HIT RATE rather than a
     shrug. Asked for twenty per cent on Easy, fifty on Normal, sixty on
     Hardened and eighty-three on Veteran, so that is what the number
     means and the cone is derived from it instead of the other way
     round: a bot's spread is scaled until it lands that fraction of its
     rounds on a man-sized target at the range it usually engages from.

     `move` is how much of the movement system the bot has. A Veteran
     sprints between cover, slides into it and crouches behind it; a
     Recruit walks everywhere, which is most of what makes an easy bot
     read as easy before a shot is fired. */
  var BOT_SKILL = [
    { id: 'recruit', name: 'Easy', hit: 0.20, aim: 0.30, react: 0.62, wander: 0.55,
      move: 0.10, ads: 0.25 },
    { id: 'regular', name: 'Normal', hit: 0.50, aim: 0.52, react: 0.42, wander: 0.35,
      move: 0.45, ads: 0.60 },
    { id: 'veteran', name: 'Hardened', hit: 0.60, aim: 0.72, react: 0.26, wander: 0.20,
      move: 0.75, ads: 0.85 },
    { id: 'elite', name: 'Veteran', hit: 0.83, aim: 0.88, react: 0.16, wander: 0.10,
      move: 1.00, ads: 1.00 },
  ];

  /* ---- defaults ----
     What a player who has never opened the loadout screen takes onto
     the map. It has to be a complete, legal, unremarkable class: the
     first match should not be lost to an empty secondary slot. */
  /* ---- killstreaks, looked up ---- */

  function streak(id) {
    for (var i = 0; i < KILLSTREAKS.length; i++) {
      if (KILLSTREAKS[i].id === id) return KILLSTREAKS[i];
    }
    return null;
  }
  function streakLevels(id) { return STREAK_LEVELS[id] || [null, null, null]; }
  /* A streak levels by being CALLED IN, so the count is uses. Level is
     one-based: everybody starts at 1 and nothing is ever level 0. */
  function streakLevelOf(id, uses) {
    var L = streakLevels(id), lv = 1;
    for (var i = 1; i < L.length; i++) {
      if (L[i] && (uses || 0) >= L[i].unlock) lv = i + 1;
    }
    return lv;
  }

  function defaultLoadout() {
    return {
      name: 'Default',
      primary: 'stg44', primaryAtt: [],
      secondary: 'm1911', secondaryAtt: [],
      tactical: 't-flash', lethal: 'x-frag',
      ability: 'a-overclock',
      streaks: ['k-recon', 'k-airstrike', 'k-berserker'],
      camo: 'none',
      keychain: null,
    };
  }

  window.MP_DATA = {
    CLASSES: CLASSES, FAMILIES: FAMILIES, GUNS: GUNS,
    SLOTS: SLOTS, ATTACHMENTS: ATTACHMENTS, MAX_FITTED: MAX_FITTED,
    TACTICALS: TACTICALS, LETHALS: LETHALS, ABILITIES: ABILITIES,
    KILLSTREAKS: KILLSTREAKS, STREAK_LEVELS: STREAK_LEVELS, BERSERKER: BERSERKER,
    MAPS: MAPS, MODES: MODES, TEAM_SIZE: TEAM_SIZE, STREAK_SLOTS: 3,
    PRESTIGE: PRESTIGE, CAMOS: CAMOS,
    KEYCHAIN_SHAPES: KEYCHAIN_SHAPES, KEYCHAIN_METALS: KEYCHAIN_METALS,
    MAX_LEVEL: MAX_LEVEL, XP_KILL: XP_KILL, XP_HEADSHOT: XP_HEADSHOT,
    XP_ASSIST: XP_ASSIST, XP_PER_10M: XP_PER_10M,
    BOT_NAMES: BOT_NAMES, BOT_SKILL: BOT_SKILL, SHOTGUNS: SHOTGUNS,
    gun: gun, att: att, gunsOf: gunsOf, fits: fits, partsFor: partsFor,
    partCount: partCount, build: build, baseStats: baseStats,
    checkLoadout: checkLoadout,
    xpForLevel: xpForLevel, levelForXp: levelForXp,
    newProgress: newProgress, addKills: addKills, addMetres: addMetres,
    levelOf: levelOf, levelFrac: levelFrac, prestigeOf: prestigeOf,
    unlockedParts: unlockedParts, isUnlocked: isUnlocked,
    defaultLoadout: defaultLoadout,
    streak: streak, streakLevels: streakLevels, streakLevelOf: streakLevelOf,
    STAT_META: STAT_META, FLAG_META: FLAG_META, EXCLUDES: EXCLUDES,
    effectsOf: effectsOf, excludedBy: excludedBy, conflicts: conflicts,
    signsFor: signsFor,
  };
})();
