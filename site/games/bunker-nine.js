/* ============================================================
   BUNKER NINE — round-based undead survival in a WWII bunker.

   Built on the Legend Engine (LE). One map, one player, waves of
   the dead coming through boarded windows. Points buy boards,
   guns off the wall, and the doors that make the bunker bigger.

   Everything here is original — the map, the characters, the
   voice lines. The formula (windows, points, chalk guns, rounds)
   is genre convention; the content is ours.

   Exposes window.BUNKER.start(opts) and window.__T (test hooks).
   ============================================================ */
(function () {
'use strict';

/* ---------------- tuning ---------------- */

const ECONOMY = {
  start: 500,
  hit: 10,            // per bullet that lands
  kill: 60,           // on top of hits
  headshotKill: 100,  // instead of the 60
  board: 10,          // per board repaired
  doorGenerator: 750,
  stairGate: 1000,
  wallGun: 1500,      // what the user specced: wall guns are 1500...
  wallAmmo: 500,      // ...and ammo off the same chalk is 500
  crate: 900,
};

const WEAPONS = {
  m1911: {
    name: 'M1911', slotName: 'SIDEARM',
    dmg: 55, headMul: 3.0, mag: 7, reserve: 42, refire: 0.16,
    reload: 1.5, auto: false, pellets: 1, spread: 0.4,
    kick: 1.6, sfx: 'shotPistol',
  },
  thompson: {
    name: 'Thompson', slotName: 'THOMPSON',
    dmg: 40, headMul: 2.2, mag: 30, reserve: 210, refire: 0.1,
    reload: 2.3, auto: true, pellets: 1, spread: 1.1,
    kick: 0.9, sfx: 'shotSmg',
  },
  scatter: {
    name: 'Scattergun', slotName: 'SCATTERGUN',
    dmg: 22, headMul: 1.6, mag: 2, reserve: 38, refire: 0.5,
    reload: 2.6, auto: false, pellets: 8, spread: 5.5,
    kick: 3.2, sfx: 'shotScatter',
  },
  arc: {
    name: 'AX-9 Arc Projector', slotName: 'ARC PROJECTOR',
    dmg: 900, headMul: 1.0, mag: 6, reserve: 30, refire: 0.55,
    reload: 2.9, auto: false, pellets: 1, spread: 0,
    kick: 1.2, sfx: 'shotArc',
    chain: { count: 3, radius: 4.0, dmg: 500 },
  },
};

const ROUNDS = {
  countFor: (r) => Math.min(4 + Math.ceil(r * 2.6), 33),
  hpFor: (r) => (r <= 9 ? 110 + (r - 1) * 55 : 550 * Math.pow(1.09, r - 9)),
  maxAlive: (r) => Math.min(7 + r, 13),
  spawnGap: (r) => Math.max(2.6 - r * 0.12, 0.9),
  lull: 8,
  // How fast the dead move, by round: early rounds shamble, later ones run.
  speedFor: (r, rng) => {
    if (r <= 2) return 0.9 + rng() * 0.5;
    if (r <= 5) return rng() < 0.5 ? 1.2 + rng() * 0.6 : 2.2 + rng() * 0.6;
    return rng() < 0.25 ? 1.6 : 3.0 + rng() * 1.3;
  },
};

const PLAYER = {
  hp: 100, regenDelay: 3.5, regenRate: 40,
  hitDamage: 25, attackRange: 1.45, attackCooldown: 0.9,
  interactRange: 2.0,
};

/* ---------------- the script ----------------
   Two voices. Cpl. Dee "Patch" Okafor — combat engineer, dry as
   dust, talking to herself because the radio mostly talks back.
   The Nightwatchman — whoever is on the other end of that radio,
   cheerful in a way that stops being comforting.  */

const CAST = {
  patch: { name: 'CPL. "PATCH" OKAFOR', base: 215, spread: 60, type: 'triangle', color: '#ffd27a' },
  radio: { name: 'THE NIGHTWATCHMAN', base: 122, spread: 26, type: 'square', color: '#7ad7ff' },
};

const LINES = {
  intro: [
    ['radio', 'Good evening, Bunker Nine. Lights out on the whole coast except you.'],
    ['patch', 'Then somebody should tell whatever is out in that fog to stop knocking.'],
    ['radio', 'Board the windows, corporal. The dead do love a draught.'],
  ],
  firstBlood: [['patch', 'That one stopped. The rest of you take notes.']],
  roundStart: [
    [['radio', 'More of them coming down the hill. I count... plenty.']],
    [['patch', 'Reload, breathe. Same song, louder verse.']],
    [['radio', 'They remember this place, you know. They just do not remember why.']],
    [['patch', 'Boards will not hold forever. Good thing neither will they.']],
    [['radio', 'The generator hums, the moths are drawn. Do keep the noise up.']],
  ],
  lowAmmo: [['patch', 'Running dry. Chalk says the wall sells courage at five hundred a box.']],
  buyThompson: [['patch', 'Eight hundred a minute says nothing else gets through that window.']],
  buyScatter: [['patch', 'Both barrels. Subtlety went out with the lights.']],
  power: [
    ['patch', 'Generator is up. Bunker Nine has a heartbeat again.'],
    ['radio', 'Warm light in the window. That is how they will find you, corporal.'],
  ],
  crateOpen: [['radio', 'Ah, the supply crate. Property of no army that admits to it.']],
  crateArc: [['patch', 'This is not standard issue. This is not any issue.']],
  blitz: [['radio', 'And the lightning takes the whole choir at once. Marvelous.']],
  nearDeath: [['patch', 'Still here. Angrier, but still here.']],
  gameOver: [['radio', 'Rest now, Bunker Nine. I will keep a light on for the next one.']],
};

/* ---------------- procedural sound ----------------
   No audio files anywhere in the engine, so every effect is a
   little synth recipe: stacked tones and noise impacts. Voices are
   radio blips — a pitch pattern per character under a subtitle,
   the way games talked before they could talk. */

function makeSfx(game) {
  const A = game.audio;
  const t = (f, d, ty, v) => A.tone(f, d, ty, v);
  return {
    shotPistol() { A.impact(0.85); t(1750, 0.03, 'square', 0.10); t(210, 0.09, 'sawtooth', 0.12); },
    shotSmg() { A.impact(0.7); t(1450, 0.025, 'square', 0.09); t(240, 0.07, 'sawtooth', 0.11); },
    shotScatter() { A.impact(1.0); t(950, 0.05, 'sawtooth', 0.14); t(120, 0.16, 'sawtooth', 0.16); },
    shotArc() { t(1900, 0.06, 'sawtooth', 0.09); t(640, 0.12, 'square', 0.10); t(96, 0.2, 'sine', 0.14); },
    dryFire() { t(1300, 0.02, 'square', 0.06); },
    reload1() { t(800, 0.03, 'square', 0.08); },
    reload2() { t(1100, 0.03, 'square', 0.08); t(500, 0.04, 'square', 0.06); },
    hitmark() { t(2300, 0.02, 'square', 0.05); },
    headmark() { t(2800, 0.025, 'square', 0.06); t(3400, 0.02, 'square', 0.04); },
    groan(pitch) { t(58 + pitch * 30, 0.5, 'sawtooth', 0.05); t(74 + pitch * 26, 0.42, 'triangle', 0.06); },
    tear() { t(140, 0.08, 'sawtooth', 0.1); A.impact(0.25); },
    board() { A.impact(0.4); t(95, 0.05, 'square', 0.1); },
    buy() { t(1250, 0.05, 'square', 0.1); t(1650, 0.06, 'square', 0.08); A.impact(0.3); },
    denied() { t(160, 0.12, 'square', 0.09); },
    doorOpen() { A.impact(0.9); t(70, 0.3, 'sawtooth', 0.12); },
    powerOn() { t(52, 0.7, 'sawtooth', 0.14); t(104, 0.5, 'sine', 0.1); t(208, 0.4, 'sine', 0.06); },
    powerup() { for (let i = 0; i < 4; i++) setTimeout(() => t(660 * Math.pow(1.25, i), 0.09, 'triangle', 0.1), i * 70); },
    blitz() { A.impact(1); t(60, 0.6, 'sawtooth', 0.18); t(2400, 0.3, 'sawtooth', 0.06); },
    hurt() { t(85, 0.2, 'sawtooth', 0.14); },
    heartbeat() { t(46, 0.11, 'sine', 0.2); setTimeout(() => t(40, 0.09, 'sine', 0.16), 180); },
    roundSting() {
      [220, 185, 147].forEach((f, i) => setTimeout(() => { t(f, 0.5, 'triangle', 0.12); t(f / 2, 0.55, 'sine', 0.1); }, i * 260));
    },
    roundClear() {
      [147, 196, 247].forEach((f, i) => setTimeout(() => t(f, 0.35, 'triangle', 0.1), i * 180));
    },
    crateSpin() { t(880, 0.04, 'square', 0.06); },
    vault() { A.impact(0.5); t(110, 0.1, 'sawtooth', 0.08); },
  };
}

/* Speak a line: subtitle plus a run of radio blips in the speaker's
   register. Returns total duration so lines can queue. */
function makeVoice(game, hud, isOver) {
  let busy = 0;
  return function say(lineSet, priority) {
    if (isOver() && !priority) return;
    const now = performance.now() / 1000;
    if (now < busy && !priority) return;
    let delay = 0;
    for (const [who, text] of lineSet) {
      const c = CAST[who];
      const dur = Math.max(1.6, text.length * 0.045);
      setTimeout(() => {
        if (isOver() && !priority) return;
        hud.subtitle(c, text, dur);
        // One blip per word-ish, wandering around the character's pitch.
        const blips = Math.min(14, Math.max(5, Math.round(text.length / 7)));
        for (let i = 0; i < blips; i++) {
          setTimeout(() => {
            const f = c.base + (Math.sin(i * 2.7) * 0.5 + Math.random() * 0.5) * c.spread;
            game.audio.tone(f, 0.055, c.type, 0.055);
            if (who === 'radio' && i % 3 === 0) game.audio.tone(f * 2.01, 0.03, 'square', 0.02);
          }, 90 + i * (dur * 500 / blips));
        }
      }, delay * 1000);
      delay += dur + 0.25;
    }
    busy = now + delay;
    return delay;
  };
}

/* ---------------- the bunker ----------------
   Original layout. Three spaces:

     MESS      12 x 9 m ground floor, spawn room. Two windows,
               both chalk guns, the stair gate east, the door west.
     GENERATOR 9.6 x 9 m, west. Two windows, the power switch,
               the supply crate.
     LOFT      the floor above MESS's east half. One high window,
               sandbags, the best view in a place with no views.

   Wall math: inner shells with 0.4 m slabs. Windows are 1.6 x 1.2
   openings at 0.9 sill, framed by splitting the wall run into
   sill / header / side pieces. */

const MAP = {
  mess: { x0: -6.4, x1: 6.0, z0: -4.5, z1: 4.5, y0: 0, y1: 3.2 },
  gen: { x0: -16.4, x1: -6.8, z0: -4.5, z1: 4.5, y0: 0, y1: 3.2 },
  loft: { x0: 0.5, x1: 6.0, z0: -4.5, z1: 4.5, y0: 3.1, y1: 6.0 },
  door1: { x: -6.6, z0: -0.3, z1: 1.3, h: 2.4 },            // MESS <-> GEN
  stair: { z0: 2.9, z1: 4.3, x0: 1.0, x1: 5.7, top: 3.1 },  // MESS -> LOFT
};

const WINDOWS = [
  { id: 'W1', room: 'mess', inside: [-2.5, 0, -3.4], sillAt: [-2.5, 1.5, -4.7], pad: [-2.5, 0, -8.2], face: 'N', wx: [-3.3, -1.7] },
  { id: 'W2', room: 'mess', inside: [4.9, 0, -2.0], sillAt: [6.2, 1.5, -2.0], pad: [9.6, 0, -2.0], face: 'E', wz: [-2.8, -1.2] },
  { id: 'W3', room: 'gen', inside: [-12.2, 0, -3.4], sillAt: [-12.2, 1.5, -4.7], pad: [-15.6, 0, -8.4], face: 'N', wx: [-13.0, -11.4] },
  { id: 'W4', room: 'gen', inside: [-15.3, 0, 1.0], sillAt: [-16.6, 1.5, 1.0], pad: [-19.8, 0, 1.0], face: 'W', wz: [0.2, 1.8] },
  { id: 'W5', room: 'loft', inside: [4.9, 3.1, 1.0], sillAt: [6.2, 4.5, 1.0], pad: [9.6, 0, 2.6], face: 'E', wz: [0.2, 1.8], high: true },
];

function buildMap(game, S) {
  const MAT = {
    wall: { color: 0x8f8c85, texture: 'concrete', roughness: 0.94, metalness: 0, uvScale: 1.3, normalStrength: 0.45 },
    wallDark: { color: 0x6f6c66, texture: 'concrete', roughness: 0.95, metalness: 0 },
    floor: { color: 0x76736c, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 1.2, normalStrength: 0.45 },
    wood: { color: 0x584023, texture: 'wood', roughness: 0.8, metalness: 0, uvScale: 2 },
    board: { color: 0x7d5c36, texture: 'wood', roughness: 0.85, metalness: 0, uvScale: 3 },
    steel: { color: 0x4a4e54, texture: 'metal', roughness: 0.5, metalness: 1 },
    sand: { color: 0x8a7f5e, texture: 'fabric', roughness: 0.98, metalness: 0, uvScale: 2 },
    chalk: { color: 0xf5f2e6, texture: 'smooth', roughness: 0.9, metalness: 0, emissive: 0xcfe8ff, emissiveStrength: 0.35 },
  };

  // A static slab from bounds, the whole bunker is made of these.
  const slab = (x0, x1, y0, y1, z0, z1, material = MAT.wall) => game.box({
    at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [x1 - x0, y1 - y0, z1 - z0],
    material, static: true,
  });
  // A wall run along X or Z with window holes cut into it.
  const wallX = (z0, z1, x0, x1, y1, holes = []) => {
    let cur = x0;
    for (const [hx0, hx1] of holes) {
      if (hx0 > cur) slab(cur, hx0, 0, y1, z0, z1);
      slab(hx0, hx1, 0, 0.9, z0, z1);         // sill
      slab(hx0, hx1, 2.1, y1, z0, z1);        // header
      cur = hx1;
    }
    if (cur < x1) slab(cur, x1, 0, y1, z0, z1);
  };
  // sill/head are absolute heights, so the same helper cuts a ground-floor
  // window and the loft's high one without any relative-offset arithmetic.
  const wallZ = (x0, x1, z0, z1, y1, holes = [], yBase = 0, sill = 0.9, head = 2.1) => {
    let cur = z0;
    for (const [hz0, hz1] of holes) {
      if (hz0 > cur) slab(x0, x1, yBase, y1, cur, hz0);
      slab(x0, x1, yBase, sill, hz0, hz1);
      slab(x0, x1, head, y1, hz0, hz1);
      cur = hz1;
    }
    if (cur < z1) slab(x0, x1, yBase, y1, cur, z1);
  };

  const M = MAP.mess, G = MAP.gen, L = MAP.loft;

  /* Ground, and the bunker floor pad. */
  game.ground({ material: { color: 0x3d3a33, texture: 'dirt', roughness: 0.97 }, size: 90 });
  slab(G.x0 - 0.4, M.x1 + 0.4, -0.05, 0.02, M.z0 - 0.4, M.z1 + 0.4, MAT.floor);

  /* MESS shell. North wall holds W1; east wall holds W2 low and W5 high. */
  wallX(M.z0 - 0.4, M.z0, M.x0, M.x1 + 0.4, L.y1, [WINDOWS[0].wx]);        // north, full height (loft shares it)
  wallX(M.z1, M.z1 + 0.4, M.x0, M.x1 + 0.4, L.y1);                          // south
  wallZ(M.x1, M.x1 + 0.4, M.z0, M.z1, 3.2, [WINDOWS[1].wz]);               // east low, W2
  wallZ(M.x1, M.x1 + 0.4, M.z0, M.z1, L.y1, [WINDOWS[4].wz], 3.2, 4.3, 5.5); // east upper, W5 (sill 4.3, header 5.5)

  /* Shared MESS/GEN wall with the 750 doorway. */
  const D = MAP.door1;
  slab(M.x0 - 0.4, M.x0, 0, L.y1, M.z0, D.z0);
  slab(M.x0 - 0.4, M.x0, 0, L.y1, D.z1, M.z1);
  slab(M.x0 - 0.4, M.x0, D.h, L.y1, D.z0, D.z1);

  /* GENERATOR shell. */
  wallX(G.z0 - 0.4, G.z0, G.x0 - 0.4, G.x0 + 9.6, 3.2, [WINDOWS[2].wx]);   // north, W3
  wallX(G.z1, G.z1 + 0.4, G.x0 - 0.4, M.x0, 3.2);                           // south
  wallZ(G.x0 - 0.4, G.x0, G.z0, G.z1, 3.2, [WINDOWS[3].wz]);               // west, W4

  /* Ceilings. GEN and MESS west get a lid at 3.2; the loft floor covers
     MESS east; the loft gets its own lid. */
  slab(G.x0 - 0.4, G.x1, 3.2, 3.5, G.z0 - 0.4, G.z1 + 0.4);
  slab(M.x0 - 0.4, L.x0, 3.2, 3.5, M.z0 - 0.4, M.z1 + 0.4, MAT.wallDark);
  slab(L.x0, L.x1 + 0.4, L.y1, L.y1 + 0.3, L.z0 - 0.4, L.z1 + 0.4, MAT.wallDark);

  /* Loft floor: a wooden deck with a stairwell hole over the ramp lane. */
  slab(L.x0, L.x1, 2.9, 3.1, L.z0, MAP.stair.z0, MAT.wood);
  slab(L.x0, 1.2, 2.9, 3.1, MAP.stair.z0, L.z1, MAT.wood);   // small landing strip
  /* West edge of the loft: railing, with the stair gap left open. */
  slab(L.x0, L.x0 + 0.12, 3.1, 4.1, L.z0, MAP.stair.z0 - 0.1, MAT.steel);

  /* Stairs: one ramp. The capsule controller walks ramps well and a real
     step stack just rattles it. Boxed in below so nothing hides under it. */
  const st = MAP.stair;
  const ramp = game.box({
    at: [(st.x0 + st.x1) / 2, st.top / 2 - 0.15, (st.z0 + st.z1) / 2],
    size: [Math.hypot(st.x1 - st.x0, st.top) + 0.2, 0.25, st.z1 - st.z0],
    material: MAT.wood, static: true,
  });
  ramp.setRotation([0, 0, -Math.atan2(st.top, st.x1 - st.x0) * 180 / Math.PI]);
  slab(st.x0, st.x1, 0, 0.4, st.z0, st.z1, MAT.wallDark);

  /* Window sill colliders: the opening is passable to nothing physical.
     Zombies come through by vaulting (animated), players never do. */
  for (const w of WINDOWS) {
    const at = w.sillAt;
    const size = w.face === 'N' ? [1.6, 1.25, 0.5] : [0.5, 1.25, 1.6];
    const sill = game.box({ at, size, material: MAT.wall, static: true, visible: false });
    // Solid to feet, transparent to gunfire: shooting the dead THROUGH the
    // window while they tear at it is half the game.
    if (sill.body) sill.body.userData = { bulletPassthrough: true };
  }

  /* Doors, purchasable. Rendered as planked barricades. */
  S.doors = {
    gen: {
      cost: ECONOMY.doorGenerator, open: false, label: 'Clear the doorway',
      at: [M.x0 - 0.2, 1.2, (D.z0 + D.z1) / 2],
      actors: [
        game.box({ at: [M.x0 - 0.2, 1.2, (D.z0 + D.z1) / 2], size: [0.3, 2.4, D.z1 - D.z0], material: MAT.board, static: true }),
      ],
    },
    stair: {
      cost: ECONOMY.stairGate, open: false, label: 'Open the stair gate',
      at: [st.x0 + 0.3, 1.2, (st.z0 + st.z1) / 2],
      actors: [
        game.box({ at: [st.x0 + 0.3, 1.1, (st.z0 + st.z1) / 2], size: [0.25, 2.2, st.z1 - st.z0], material: MAT.steel, static: true }),
      ],
    },
  };

  /* Chalk guns. The wall drawing is the actual gun model, ghost-white and
     faintly glowing, hung flat against the wall — plus a scrawled price
     the HUD shows when you stand at it. */
  const chalkMat = MAT.chalk;
  const thompsonChalk = game.thompson({ at: [-0.9, 1.55, M.z1 - 0.14], physics: false, material: chalkMat, woodMaterial: chalkMat });
  thompsonChalk.setRotation([0, 180, 0]);
  const scatterChalk = makeScattergun(game, { at: [-4.6, 1.55, M.z1 - 0.14], chalk: true });
  scatterChalk.root.setRotation([0, 180, 0]);

  S.buys = [
    { id: 'thompson', at: [-0.9, 1.4, M.z1 - 0.3], weapon: 'thompson', label: 'Thompson' },
    { id: 'scatter', at: [-4.6, 1.4, M.z1 - 0.3], weapon: 'scatter', label: 'Scattergun' },
  ];

  /* The generator itself, the power switch, the supply crate. */
  game.box({ at: [-14.9, 0.75, -3.2], size: [1.8, 1.5, 1.3], material: MAT.steel, static: true });
  game.cylinder({ at: [-13.7, 0.5, -3.4], radius: 0.32, height: 1.0, material: MAT.steel, static: true });
  S.powerSwitch = { at: [-14.9, 1.5, -2.4], on: false };
  const lever = game.box({ at: [-14.9, 1.5, -2.48], size: [0.1, 0.5, 0.08], material: { color: 0xa03028, texture: 'smooth', roughness: 0.5 }, physics: false });
  lever.setRotation([25, 0, 0]);
  S.powerSwitch.lever = lever;

  S.crate = {
    at: [-15.2, 0.4, 3.3], busy: false, cost: ECONOMY.crate,
    base: game.box({ at: [-15.2, 0.4, 3.3], size: [1.15, 0.8, 0.8], material: MAT.wood, static: true }),
    lid: game.box({ at: [-15.2, 0.84, 3.3], size: [1.15, 0.1, 0.8], material: MAT.steel, physics: false }),
    offer: null, offerId: null, timer: 0,
  };

  /* Sandbags and clutter: the difference between a diagram and a place. */
  const bag = (x, y, z, ry) => {
    const b = game.box({ at: [x, y, z], size: [0.85, 0.34, 0.45], material: MAT.sand, static: true });
    b.setRotation([0, ry, 0]);
  };
  bag(4.7, 3.28, -3.6, 8); bag(4.7, 3.62, -3.5, -6); bag(3.8, 3.28, -3.7, -14);
  bag(-3.2, 0.17, 3.8, 20); bag(-2.3, 0.17, 3.9, -12);
  game.box({ at: [-1.0, 0.42, -0.6], size: [2.2, 0.84, 0.9], material: MAT.wood, static: true }); // mess table
  game.box({ at: [-1.0, 0.95, -0.6], size: [0.5, 0.22, 0.34], material: MAT.steel, static: true }); // radio set on it
  game.box({ at: [-11.5, 0.5, 3.6], size: [1.0, 1.0, 0.7], material: MAT.wood, static: true });

  /* Outside: dead ground, wrecked timber, fog shapes. Lit by moon only. */
  for (const [x, z, ry, len] of [[-4, -11, 15, 5], [10, -6, -30, 4], [-19, 5, 60, 6], [12, 4, 10, 5]]) {
    const t = game.cylinder({ at: [x, 0.5, z], radius: 0.16, height: len, material: { color: 0x2c2620, texture: 'wood', roughness: 0.95 }, static: true });
    t.setRotation([84, ry, 0]);
  }

  /* Boards on every window. */
  S.windows = WINDOWS.map((w) => {
    const win = { def: w, boards: [], zombiesAt: 0 };
    for (let i = 0; i < 5; i++) win.boards.push(spawnBoard(game, w, i, MAT.board));
    return win;
  });
  S.boardMat = MAT.board;

  /* Lights. Budget is 8. Moon is the sun; interiors get one cage bulb per
     room ground floor, one in the loft, one over each chalk, all dim until
     the generator runs. Muzzle flash borrows the last slot. */
  S.lamps = [];
  const lamp = (x, y, z, intensity, color = 0xffc98f) => {
    const l = game.light({ at: [x, y, z], color, intensity, radius: 9 });
    const shade = game.cone({ at: [x, y + 0.22, z], radius: 0.16, height: 0.18, material: MAT.steel, physics: false });
    shade.setRotation([180, 0, 0]);
    S.lamps.push({ light: l, full: intensity });
    return l;
  };
  lamp(-1.5, 2.9, 0, 115);          // mess
  lamp(-12, 2.9, 0, 115);           // generator room
  lamp(3.3, 5.6, 0.6, 100);         // loft
  lamp(-0.9, 2.4, 3.9, 55, 0xcfe8ff);  // thompson chalk
  lamp(-4.6, 2.4, 3.9, 55, 0xcfe8ff); // scatter chalk
  // Cold moonlight spilling through the start-room window, so the first
  // thing that ever comes through it arrives as a silhouette.
  game.light({ at: [-2.5, 2.2, -5.6], color: 0x9db8e8, intensity: 45, radius: 11 });
  // A whisper of ambient so unlit corners are gloom, not void.
  game.renderer.sky.intensity = 1.5;
  setPower(game, S, false);
}

function spawnBoard(game, w, slot, mat) {
  const at = w.sillAt.slice();
  at[1] = w.sillAt[1] - 0.45 + slot * 0.24 + (slot % 2) * 0.03;
  const size = w.face === 'N' ? [1.78, 0.19, 0.06] : [0.06, 0.19, 1.78];
  const b = game.box({ at, size, material: mat, physics: false });
  const jitter = ((slot * 37) % 10 - 5) * 1.1;
  b.setRotation(w.face === 'N' ? [0, jitter * 0.3, jitter] : [jitter, jitter * 0.3, 0]);
  return b;
}

function setPower(game, S, on) {
  for (const L of S.lamps) L.light.intensity = on ? L.full : L.full * 0.45;
  S.powered = on;
}

/* ---------------- composite guns ----------------
   The Thompson and 1911 are real engine models. The other two are
   assembled from primitives — parented to an invisible root so a
   whole gun moves as one actor. */

function makeScattergun(game, opts = {}) {
  const steel = opts.chalk
    ? { color: 0xf5f2e6, texture: 'smooth', roughness: 0.9, emissive: 0xcfe8ff, emissiveStrength: 0.35 }
    : { color: 0x3a3f45, texture: 'metal', roughness: 0.4, metalness: 1 };
  const wood = opts.chalk ? steel : { color: 0x5e3d1f, texture: 'wood', roughness: 0.7, uvScale: 3 };
  const root = game.box({ at: opts.at || [0, 0, 0], size: 0.02, physics: false, visible: false });
  const parts = [];
  const add = (a, pos, rot) => {
    a.parent = root;
    a.setPosition(pos);
    if (rot) a.setRotation(rot);
    parts.push(a);
    return a;
  };
  // Two barrels side by side, muzzles at +X like every gun here.
  for (const dz of [-0.014, 0.014]) {
    add(game.cylinder({ radius: 0.0125, height: 0.50, material: steel, physics: false }), [0.30, 0.012, dz], [0, 0, 90]);
    add(game.cylinder({ radius: 0.0095, height: 0.012, material: steel, physics: false }), [0.552, 0.012, dz], [0, 0, 90]);
  }
  add(game.box({ size: [0.16, 0.062, 0.052], material: steel, physics: false }), [0.0, 0.004, 0]);       // receiver
  add(game.box({ size: [0.26, 0.056, 0.04], material: wood, physics: false }), [-0.20, -0.03, 0], [0, 0, 6]); // stock
  add(game.box({ size: [0.05, 0.09, 0.036], material: wood, physics: false }), [-0.055, -0.062, 0], [0, 0, 18]); // grip
  add(game.box({ size: [0.2, 0.03, 0.044], material: wood, physics: false }), [0.30, -0.016, 0]);        // forend
  add(game.box({ size: [0.05, 0.018, 0.03], material: steel, physics: false }), [-0.02, -0.052, 0]);     // guard
  return { root, parts };
}

function makeArcProjector(game, opts = {}) {
  const dark = { color: 0x23262c, texture: 'metal', roughness: 0.45, metalness: 1 };
  const coil = { color: 0x142430, texture: 'smooth', roughness: 0.3, emissive: 0x39c8ff, emissiveStrength: 2.2 };
  const brass = { color: 0xb08d4a, texture: 'metal', roughness: 0.35, metalness: 1 };
  const root = game.box({ at: opts.at || [0, 0, 0], size: 0.02, physics: false, visible: false });
  const parts = [];
  const add = (a, pos, rot) => { a.parent = root; a.setPosition(pos); if (rot) a.setRotation(rot); parts.push(a); return a; };
  add(game.box({ size: [0.34, 0.09, 0.075], material: dark, physics: false }), [0.05, 0, 0]);
  add(game.cylinder({ radius: 0.02, height: 0.3, material: brass, physics: false }), [0.33, 0.01, 0], [0, 0, 90]);
  for (let i = 0; i < 3; i++) {
    add(game.cylinder({ radius: 0.036 - i * 0.005, height: 0.03, material: coil, physics: false }), [0.24 + i * 0.075, 0.01, 0], [0, 0, 90]);
  }
  add(game.sphere({ radius: 0.023, material: coil, physics: false }), [0.5, 0.01, 0]);
  add(game.box({ size: [0.05, 0.1, 0.04], material: dark, physics: false }), [-0.06, -0.075, 0], [0, 0, 14]);
  add(game.box({ size: [0.1, 0.05, 0.06], material: brass, physics: false }), [-0.11, 0.01, 0]);
  return { root, parts };
}

/* ---------------- player ---------------- */

function makePlayer(game, S, hud, sfx, voice) {
  const hero = game.character({ at: [-2, 1.1, 1], face: false, name: 'player' });
  hero.visible = false;
  if (hero.head) hero.head.visible = false;
  game.firstPerson(hero, { eyeHeight: 1.62 });
  game._camYaw = Math.PI / 2;

  const P = {
    actor: hero, hp: PLAYER.hp, lastHit: -99, downs: 0,
    slots: ['m1911'], slot: 0,
    ammo: { m1911: { mag: WEAPONS.m1911.mag, reserve: WEAPONS.m1911.reserve } },
    cooldown: 0, reloading: 0, swayT: 0, kickPitch: 0,
    view: {}, muzzleT: 0, alive: true,
  };

  /* View models: one instance of each weapon, shown when equipped. */
  P.view.m1911 = { kind: 'single', actor: game.pistol1911({ physics: false }), muzzle: 0.24 };
  P.view.thompson = { kind: 'single', actor: game.thompson({ physics: false }), muzzle: 0.55 };
  P.view.scatter = Object.assign(makeScattergun(game), { kind: 'group', muzzle: 0.58 });
  P.view.arc = Object.assign(makeArcProjector(game), { kind: 'group', muzzle: 0.52 });
  for (const v of Object.values(P.view)) setViewVisible(v, false);

  /* Pointer lock: click to capture, mouse drives engine yaw/pitch. */
  const canvas = game.canvas;
  canvas.addEventListener('click', () => {
    if (S.testMode || S.gameOver) return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    game._camYaw -= e.movementX * 0.0021;
    game._camPitch = Math.max(-1.45, Math.min(1.45, game._camPitch + e.movementY * 0.0021));
  });

  P.equipped = () => P.slots[P.slot];
  P.spec = () => WEAPONS[P.equipped()];
  P.ammoFor = (id) => P.ammo[id];

  P.give = (id) => {
    if (!P.ammo[id]) P.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    else { P.ammo[id].mag = WEAPONS[id].mag; P.ammo[id].reserve = WEAPONS[id].reserve; }
    const have = P.slots.indexOf(id);
    if (have >= 0) { P.slot = have; }
    else if (P.slots.length < 2) { P.slots.push(id); P.slot = P.slots.length - 1; }
    else { P.slots[P.slot] = id; }
    P.reloading = 0;
    hud.flashWeapon(WEAPONS[id].slotName);
  };

  return P;
}

function setViewVisible(v, on) {
  if (v.kind === 'single') {
    v.actor.visible = on;
    if (v.actor.grips) v.actor.grips.visible = on;
    if (v.actor.mark) v.actor.mark.visible = on;
    if (v.actor.wood) v.actor.wood.visible = on;
  } else {
    for (const p of v.parts) p.visible = on;
  }
}

/* Position the equipped weapon against the camera every frame — bob,
   sway, recoil, reload dip. This is the whole first-person feel. */
function updateViewmodel(game, P, dt, moving) {
  const spec = P.spec();
  const v = P.view[P.equipped()];
  for (const [id, view] of Object.entries(P.view)) setViewVisible(view, id === P.equipped() && P.alive);
  if (!P.alive) return;

  const cam = game.camera;
  const f = _vTmp1.copy(cam.target).sub(cam.position).normalize();
  const up = _vTmp2.set(0, 1, 0);
  const right = _vTmp3.copy(f).cross(up).normalize();

  P.swayT += dt * (moving ? 7.2 : 1.6);
  const bobY = Math.sin(P.swayT * 2) * (moving ? 0.006 : 0.0016);
  const bobX = Math.cos(P.swayT) * (moving ? 0.004 : 0.001);
  P.kickPitch = Math.max(0, P.kickPitch - dt * 9);
  const dip = P.reloading > 0 ? Math.sin(Math.min(1, 1 - P.reloading / spec.reload) * Math.PI) * 0.09 : 0;

  const root = v.kind === 'single' ? v.actor : v.root;
  const px = cam.position.x + f.x * 0.44 + right.x * (0.17 + bobX);
  const py = cam.position.y - 0.19 + bobY - dip + f.y * 0.44;
  const pz = cam.position.z + f.z * 0.44 + right.z * (0.17 + bobX);
  root.setPosition([px, py, pz]);

  // Gun +X aligns to camera forward; kick tips the muzzle up briefly.
  const fh = Math.hypot(f.x, f.z) || 1e-6;
  const yaw = Math.atan2(-f.z / fh, f.x / fh);
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y))) + P.kickPitch * 0.06;
  _vQuat1.setEuler(0, yaw, pitch);
  root.setRotation(_vQuat1);

  P.muzzleWorld = [px + f.x * v.muzzle, py + f.y * v.muzzle + 0.03, pz + f.z * v.muzzle];
}

const _vTmp1 = { x: 0, y: 0, z: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }, sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }, cross(o) { const x = this.y * o.z - this.z * o.y, y = this.z * o.x - this.x * o.z, z = this.x * o.y - this.y * o.x; this.x = x; this.y = y; this.z = z; return this; }, normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const _vTmp2 = Object.assign(Object.create(Object.getPrototypeOf(_vTmp1)), _vTmp1);
const _vTmp3 = Object.assign(Object.create(Object.getPrototypeOf(_vTmp1)), _vTmp1);
let _vQuat1 = null;   // needs LE at boot; assigned in start()

/* Fire the equipped weapon. Raycasts from the camera, damage to
   zombies, points per hit, gore on kill. */
function tryFire(game, S, P, hud, sfx, dt) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  P.cooldown -= dt;
  if (P.reloading > 0) return;
  const wantFire = spec.auto ? S.input.fireHeld : S.input.firePressed;
  if (!wantFire || P.cooldown > 0) return;

  if (am.mag <= 0) {
    sfx.dryFire();
    if (am.reserve <= 0 && Math.random() < 0.4) S.voice(LINES.lowAmmo);
    else tryReload(P, sfx);
    P.cooldown = 0.25;
    return;
  }

  am.mag--;
  P.cooldown = spec.refire;
  P.kickPitch = Math.min(3, P.kickPitch + spec.kick);
  sfx[spec.sfx]();
  hud.ammo(P);

  // Muzzle flash: light + sparks, one frame of each.
  if (P.muzzleWorld) {
    game.particles.sparks(P.muzzleWorld, { count: spec.pellets > 1 ? 14 : 8, speed: 5, color: 0xffd27a });
    const fl = game.light({ at: P.muzzleWorld, color: spec.sfx === 'shotArc' ? 0x66d4ff : 0xffc061, intensity: 130, radius: 8 });
    fl._decay = 0.05;   // engine removes lights whose _decay is set
  }

  const cam = game.camera;
  const fwd = _vTmp1.copy(cam.target).sub(cam.position).normalize();
  let killsThisShot = 0;

  for (let p = 0; p < spec.pellets; p++) {
    const spread = spec.spread * Math.PI / 180;
    // Perturb along camera right and up so the cone is a cone from any
    // facing; one shared scalar collapses the pattern into a stripe.
    const rx = (Math.random() - 0.5) * spread, ry = (Math.random() - 0.5) * spread;
    const rl = Math.hypot(fwd.x, fwd.z) || 1e-6;
    const rgt = { x: fwd.z / rl, z: -fwd.x / rl };
    const dir = [fwd.x + rgt.x * rx, fwd.y + ry, fwd.z + rgt.z * rx];
    const hit = game.raycast([cam.position.x, cam.position.y, cam.position.z], dir, 60,
      (b) => b !== P.actor.body && !b.isTrigger && !(b.userData && b.userData.bulletPassthrough));
    if (!hit) continue;

    const z = hit.actor && hit.actor.userData && hit.actor.userData.zombie;
    if (z && !z.dead) {
      const headshot = hit.point.y > z.actor.position.y + 0.5;
      const dmg = spec.dmg * (headshot ? spec.headMul : 1);
      // Snapshot before the kill: death parks the body at the pool lot,
      // and the chain has to arc from the corpse, not the car park.
      const diedAt = { x: z.actor.position.x, y: z.actor.position.y, z: z.actor.position.z };
      hurtZombie(game, S, z, dmg, hit.point, headshot);
      let awarded = S.addPoints(ECONOMY.hit);
      if (z.dead) {
        killsThisShot++;
        awarded += S.addPoints(headshot ? ECONOMY.headshotKill : ECONOMY.kill);
      }
      hud.pointsDelta(awarded);
      headshot ? sfx.headmark() : sfx.hitmark();
      hud.hitmark(headshot);
      // Arc chain: jump to neighbours of the first thing it kills.
      if (spec.chain) {
        let jumps = 0;
        for (const other of S.zombies) {
          if (jumps >= spec.chain.count) break;
          if (other === z || other.dead) continue;
          const d = dist2d(other.actor.position, diedAt);
          if (d < spec.chain.radius) {
            arcBolt(game, diedAt, other.actor.position);
            hurtZombie(game, S, other, spec.chain.dmg, other.actor.position, false);
            if (other.dead) { S.addPoints(ECONOMY.kill); hud.pointsDelta(ECONOMY.kill); }
            jumps++;
          }
        }
      }
    } else {
      // Wall hit: dust and a chip sound at the point.
      game.particles.dust(hit.point, { count: 4, color: 0x8d8a82 });
    }
  }
  if (killsThisShot && !S.firstBloodDone) { S.firstBloodDone = true; S.voice(LINES.firstBlood); }
  hud.points(S.points);
}

function arcBolt(game, a, b) {
  // A run of glowing points between two positions — lightning on a budget.
  const n = 7;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.4;
    const y = a.y + 1 + (Math.random() - 0.5) * 0.5;
    const z = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * 0.4;
    game.particles.sparks([x, y, z], { count: 3, speed: 1.5, color: 0x66d4ff, colorEnd: 0x1a5f8a });
  }
}

function tryReload(P, sfx) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  if (P.reloading > 0 || am.mag >= spec.mag || am.reserve <= 0) return;
  P.reloading = spec.reload;
  sfx.reload1();
  setTimeout(() => sfx.reload2(), spec.reload * 600);
}

function finishReload(P, hud) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  const want = spec.mag - am.mag;
  const take = Math.min(want, am.reserve);
  am.mag += take;
  am.reserve -= take;
  hud.ammo(P);
}

function dist2d(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }

/* ---------------- the dead ---------------- */

const ZOMBIE_SKIN = { color: 0x93a37c, texture: 'skin', roughness: 0.75, metalness: 0 };
const ZOMBIE_RAGS = { color: 0x453f33, texture: 'fabric', roughness: 0.98, metalness: 0 };

function roomOf(p) {
  if (p.y > 2.4 && p.x > MAP.loft.x0 - 0.5) return 'loft';
  if (p.x < MAP.gen.x1 + 0.2) return 'gen';
  return 'mess';
}

/* Waypoint chains between rooms. Small map, hand-authored graph. */
function routeTo(fromRoom, toRoom, S) {
  const D = MAP.door1, st = MAP.stair;
  const door = [-6.6, 0, (D.z0 + D.z1) / 2];
  const base = [st.x0 - 0.9, 0, (st.z0 + st.z1) / 2];
  const top = [st.x1 + 0.2, st.top, (st.z0 + st.z1) / 2];
  const key = fromRoom + '>' + toRoom;
  const table = {
    'gen>mess': [door], 'mess>gen': [door],
    'mess>loft': [base, top], 'loft>mess': [top, base],
    'gen>loft': [door, base, top], 'loft>gen': [top, base, door],
  };
  return table[key] || [];
}

/* The pool. Building a character is expensive — a skin-weight solve, a
   sculpted head, a full mesh upload — so it happens once per pool slot,
   staggered behind the title screen, and never during play. Spawning is
   a teleport and a reset; dying is a parking job. */

function buildPooledZombie(game, S, i) {
  const a = game.character({
    at: [200 + i * 4, 1.1, 0],
    material: ZOMBIE_RAGS, skin: ZOMBIE_SKIN, seed: 20 + (i % 9),
    face: 'static',
  });
  a.controller.body.gravityScale = 0;
  const eyes = [];
  if (a.head && a.skeleton) {
    for (const sx of [-0.036, 0.036]) {
      const e = game.sphere({ radius: 0.016, physics: false, material: { color: 0x100804, texture: 'smooth', roughness: 0.4, emissive: 0xff7a2a, emissiveStrength: 2.6 } });
      e.parent = a;
      e.parentBone = a.skeleton.index('head');
      e.localOffset = new window.LE.Vec3(sx, 0.31, 0.085);
      eyes.push(e);
    }
  }
  const z = { actor: a, eyes, parked: true, dead: true, poolSlot: i };
  a.userData = { zombie: z };
  setZombieVisible(z, false);
  S.pool.push(z);
  return z;
}

function setZombieVisible(z, on) {
  z.actor.visible = on;
  if (z.actor.head) z.actor.head.visible = on;
  for (const e of z.eyes) e.visible = on;
}

function parkZombie(game, S, z) {
  z.parked = true;
  z.dead = true;
  setZombieVisible(z, false);
  const b = z.actor.controller.body;
  b.gravityScale = 0;
  b.velocity.setScalar(0);
  b.setPosition({ x: 200 + z.poolSlot * 4, y: 1.1, z: 0 });
  z.actor.controller.move(0, 0);
}

function spawnZombie(game, S, win) {
  const z = S.pool.find((q) => q.parked);
  if (!z) return null;
  const speed = ROUNDS.speedFor(S.round, Math.random);
  const b = z.actor.controller.body;
  b.gravityScale = 1;
  b.velocity.setScalar(0);
  b.setPosition({
    x: win.def.pad[0] + (Math.random() - 0.5) * 1.4,
    y: 1.1,
    z: win.def.pad[2] + (Math.random() - 0.5) * 1.4,
  });
  z.actor.controller.moveSpeed = speed;
  z.actor.controller.runSpeed = speed * 1.35;
  Object.assign(z, {
    parked: false, dead: false, hp: ROUNDS.hpFor(S.round),
    state: 'toWindow', win, speed,
    tearT: 0, attackT: 0, groanT: 1 + Math.random() * 3, stuckT: 0, lastPos: null,
    vault: null,
  });
  setZombieVisible(z, true);
  if (z.actor.animator) z.actor.animator.play('walk', 0.2);
  win.zombiesAt++;
  if (!S.zombies.includes(z)) S.zombies.push(z);
  return z;
}

function hurtZombie(game, S, z, dmg, at, headshot) {
  if (z.dead) return;
  z.hp -= dmg;
  game.particles.sparks(at, { count: 5, speed: 2.5, color: 0x7a1610, colorEnd: 0x2c0605 });
  if (z.hp <= 0) killZombie(game, S, z, headshot);
}

function killZombie(game, S, z, headshot) {
  z.dead = true;
  S.killsTotal++;
  if (z.state === 'toWindow' || z.state === 'tearing') z.win.zombiesAt--;
  const p = z.actor.position;
  // Gibs: a burst of dark red chunks with real physics, plus dust. The
  // engine pools nothing here, so they get lifetimes and stay few.
  game.particles.sparks([p.x, p.y + 0.9, p.z], { count: 16, speed: 3.5, color: 0x8a1a12, colorEnd: 0x300806 });
  game.particles.dust([p.x, p.y + 0.4, p.z], { count: 6, color: 0x4a3f33 });
  const gibs = headshot ? 4 : 3;
  for (let i = 0; i < gibs; i++) {
    const g = game.box({
      at: [p.x + (Math.random() - 0.5) * 0.3, p.y + 0.8 + Math.random() * 0.5, p.z + (Math.random() - 0.5) * 0.3],
      size: [0.14 + Math.random() * 0.1, 0.1, 0.1],
      material: { color: 0x5a120c, texture: 'smooth', roughness: 0.7 },
      lifetime: 2.2, velocity: [(Math.random() - 0.5) * 5, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 5],
    });
    if (g.body) g.body.angularVelocity.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
  }
  // Powerup roll.
  if (!S.powerupActive && Math.random() < 0.04) dropPowerup(game, S, p);
  parkZombie(game, S, z);
  game.audio.impact(0.5);
}

const POWERUPS = {
  maxammo: { label: 'FULL RESUPPLY', color: 0x59ff7a },
  blitz: { label: 'BLITZ', color: 0xffd23a },
  double: { label: 'PAYDAY', color: 0x66d4ff },
};

function dropPowerup(game, S, p) {
  const keys = Object.keys(POWERUPS);
  const kind = keys[Math.floor(Math.random() * keys.length)];
  const def = POWERUPS[kind];
  const a = game.box({
    at: [p.x, p.y + 0.15, p.z], size: 0.34, physics: false,
    material: { color: 0x181818, texture: 'smooth', roughness: 0.3, emissive: def.color, emissiveStrength: 2.4 },
  });
  S.powerupActive = { kind, actor: a, t: 20, spin: 0, baseY: p.y + 0.15 };
}

function applyPowerup(game, S, P, hud, sfx) {
  const pu = S.powerupActive;
  const def = POWERUPS[pu.kind];
  sfx.powerup();
  hud.banner(def.label, '#' + def.color.toString(16).padStart(6, '0'));
  if (pu.kind === 'maxammo') {
    for (const id of Object.keys(P.ammo)) { P.ammo[id].mag = WEAPONS[id].mag; P.ammo[id].reserve = WEAPONS[id].reserve; }
    hud.ammo(P);
  } else if (pu.kind === 'blitz') {
    let n = 0;
    for (const z of S.zombies) if (!z.dead) { killZombie(game, S, z, false); n++; }
    S.addPoints(400);
    sfx.blitz();
    if (n >= 6) S.voice(LINES.blitz);
    game.renderer.post.exposureFlash = 1;   // harmless if unsupported
  } else if (pu.kind === 'double') {
    S.mul = 2;
    S.mulT = 30;
  }
  pu.actor.destroy();
  S.powerupActive = null;
}

/* Per-frame zombie brain. */
function updateZombie(game, S, P, z, dt, sfx) {
  if (z.dead || z.parked) return;
  const a = z.actor;
  const pos = a.position;

  z.groanT -= dt;
  if (z.groanT < 0) { z.groanT = 2.5 + Math.random() * 4; if (dist2d(pos, P.actor.position) < 14) sfx.groan(Math.random()); }

  if (z.vault) {
    const v = z.vault;
    v.t += dt / v.dur;
    const t = Math.min(1, v.t);
    const arc = Math.sin(t * Math.PI) * 0.6;
    a.body.setPosition({ x: v.from[0] + (v.to[0] - v.from[0]) * t, y: v.from[1] + (v.to[1] - v.from[1]) * t + arc + 1.0, z: v.from[2] + (v.to[2] - v.from[2]) * t });
    a.body.velocity.setScalar(0);
    if (t >= 1) { z.vault = null; z.state = 'hunt'; }
    return;
  }

  const move = (tx, tz, urgency = 1) => {
    const dx = tx - pos.x, dz = tz - pos.z;
    const d = Math.hypot(dx, dz) || 1e-5;
    a.controller.move(dx / d, dz / d, urgency > 1.2);
  };

  if (z.state === 'toWindow') {
    const sill = z.win.def.sillAt;
    move(z.win.def.pad[0] * 0.15 + sill[0] * 0.85, z.win.def.pad[2] * 0.15 + sill[2] * 0.85);
    if (dist2d(pos, { x: sill[0], z: sill[2] }) < 1.5) { z.state = 'tearing'; z.tearT = 0.8; }
  } else if (z.state === 'tearing') {
    a.controller.move(0, 0);
    const win = z.win;
    z.tearT -= dt;
    if (z.tearT <= 0) {
      const slot = win.boards.map((b, i) => (b ? i : -1)).filter((i) => i >= 0).pop();
      if (slot == null) {
        // Nothing left to tear: through the window.
        win.zombiesAt--;
        sfx.vault();
        z.vault = { from: [pos.x, pos.y - 1.0, pos.z], to: [win.def.inside[0], win.def.inside[1] + 1.0, win.def.inside[2]], t: 0, dur: win.def.high ? 1.5 : 0.9 };
        z.state = 'vaulting';
        if (z.actor.animator) z.actor.animator.play('jump', 0.1);
      } else {
        const b = win.boards[slot];
        win.boards[slot] = null;
        sfx.tear();
        if (z.actor.animator) { z.actor.animator.play('wave', 0.08); setTimeout(() => { if (!z.dead && z.state === 'tearing' && z.actor.animator) z.actor.animator.play('idle', 0.3); }, 500); }
        S.debris.push({ actor: b, vel: [(Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2 + (z.win.def.face === 'N' ? 1.5 : 0)], spin: (Math.random() - 0.5) * 8, t: 1.4 });
        z.tearT = 2.1;
      }
    }
  } else if (z.state === 'hunt') {
    const zr = roomOf(pos), pr = roomOf(P.actor.position);
    if (zr === pr) {
      move(P.actor.position.x, P.actor.position.z, z.speed > 2.4 ? 2 : 1);
      const d = dist2d(pos, P.actor.position);
      z.attackT -= dt;
      if (d < PLAYER.attackRange && z.attackT <= 0 && Math.abs(pos.y - P.actor.position.y) < 1.6) {
        z.attackT = PLAYER.attackCooldown;
        if (z.actor.animator) { z.actor.animator.play('wave', 0.06); }
        hurtPlayer(game, S, P, PLAYER.hitDamage, sfx);
      }
    } else {
      const route = routeTo(zr, pr, S);
      let wp = route[0];
      for (const r of route) { wp = r; if (dist2d(pos, { x: r[0], z: r[2] }) > 0.9 && Math.abs(pos.y - r[1]) < 1.8) break; }
      if (wp) move(wp[0], wp[2]);
      else move(P.actor.position.x, P.actor.position.z);
    }
    // Un-stick: zombies wedge on door frames; a sideways shove fixes most.
    if (z.lastPos != null) {
      const moved = dist2d(pos, z.lastPos);
      z.stuckT = moved < 0.02 ? z.stuckT + dt : 0;
      if (z.stuckT > 1.6) { a.body.velocity.x += (Math.random() - 0.5) * 4; a.body.velocity.z += (Math.random() - 0.5) * 4; z.stuckT = 0; }
    }
    z.lastPos = { x: pos.x, z: pos.z };
  }

  // Soft separation, so a pack does not fuse into one many-armed thing.
  for (const other of S.zombies) {
    if (other === z || other.dead) continue;
    const d = dist2d(pos, other.actor.position);
    if (d < 0.62 && d > 1e-4) {
      const push = (0.62 - d) * 2.4;
      a.body.velocity.x += (pos.x - other.actor.position.x) / d * push;
      a.body.velocity.z += (pos.z - other.actor.position.z) / d * push;
    }
  }
}

function hurtPlayer(game, S, P, dmg, sfx) {
  if (!P.alive || S.godMode) return;
  P.hp -= dmg;
  P.lastHit = S.time;
  sfx.hurt();
  S.hud.damage(P.hp);
  if (P.hp <= 25 && P.hp + dmg > 25) S.voice(LINES.nearDeath);
  if (P.hp <= 0) {
    P.alive = false;
    S.gameOver = true;
    closeCrate(S);
    document.exitPointerLock && document.exitPointerLock();
    S.voice(LINES.gameOver, true);
    S.hud.gameOver(S.round, S.killsTotal);
  }
}

/* ---------------- interaction ---------------- */

function nearestInteract(S, P) {
  const p = P.actor.position;
  const R = PLAYER.interactRange;
  // Wall buys.
  for (const b of S.buys) {
    if (dist2d(p, { x: b.at[0], z: b.at[2] }) < R && Math.abs(p.y - 1) < 2) {
      const owned = P.slots.includes(b.weapon);
      const cost = owned ? ECONOMY.wallAmmo : ECONOMY.wallGun;
      return { kind: 'buy', buy: b, cost, label: `${b.label} — ${owned ? 'AMMO ' : ''}${cost}` };
    }
  }
  for (const [id, d] of Object.entries(S.doors)) {
    if (!d.open && dist2d(p, { x: d.at[0], z: d.at[2] }) < R + 0.6) {
      return { kind: 'door', id, door: d, cost: d.cost, label: `${d.label} — ${d.cost}` };
    }
  }
  if (!S.powered && dist2d(p, { x: S.powerSwitch.at[0], z: S.powerSwitch.at[2] }) < R) {
    return { kind: 'power', cost: 0, label: 'Start the generator' };
  }
  const c = S.crate;
  if (dist2d(p, { x: c.at[0], z: c.at[2] }) < R + 0.4) {
    if (c.offer) return { kind: 'take', cost: 0, label: `Take ${WEAPONS[c.offerId].name}` };
    if (!c.busy) return { kind: 'crate', cost: c.cost, label: `Supply crate — ${c.cost}` };
  }
  // Window repair.
  for (const win of S.windows) {
    const s = win.def.sillAt;
    if (Math.abs(p.y + 0.5 - s[1]) < 2.2 && dist2d(p, { x: s[0], z: s[2] }) < R) {
      if (win.boards.some((b) => !b)) return { kind: 'repair', win, cost: 0, label: 'Rebuild barricade', hold: true };
    }
  }
  return null;
}

function doInteract(game, S, P, hud, sfx, it, dt) {
  if (it.cost > S.points) { sfx.denied(); hud.prompt(it.label + '  — need more points', true); return; }
  if (it.kind === 'buy') {
    S.points -= it.cost; sfx.buy();
    const owned = P.slots.includes(it.buy.weapon);
    P.give(it.buy.weapon);
    if (!owned) S.voice(it.buy.weapon === 'thompson' ? LINES.buyThompson : LINES.buyScatter);
    hud.ammo(P); hud.points(S.points);
  } else if (it.kind === 'door') {
    S.points -= it.cost; sfx.doorOpen();
    it.door.open = true;
    for (const a of it.door.actors) a.destroy();
    if (it.id === 'gen') S.activeWindows.push('W3', 'W4');
    if (it.id === 'stair') S.activeWindows.push('W5');
    hud.points(S.points);
  } else if (it.kind === 'power') {
    setPower(game, S, true);
    sfx.powerOn();
    S.powerSwitch.lever.setRotation([-25, 0, 0]);
    S.voice(LINES.power);
  } else if (it.kind === 'crate') {
    S.points -= it.cost; sfx.buy();
    openCrate(game, S, P, hud, sfx);
    hud.points(S.points);
  } else if (it.kind === 'take') {
    const c = S.crate;
    P.give(c.offerId);
    sfx.buy();
    if (c.offerId === 'arc') S.voice(LINES.crateArc);
    closeCrate(S);
    hud.ammo(P);
  } else if (it.kind === 'repair') {
    if (S.repairFrame !== S.frame - 1) S.repairT = 0.45;   // new hold
    S.repairFrame = S.frame;
    S.repairT -= dt;
    if (S.repairT <= 0) {
      S.repairT = 0.45;
      const win = it.win;
      const slot = win.boards.findIndex((b) => !b);
      if (slot >= 0) {
        win.boards[slot] = spawnBoard(game, win.def, slot, S.boardMat);
        sfx.board();
        S.addPoints(ECONOMY.board);
        hud.pointsDelta(ECONOMY.board);
        hud.points(S.points);
      }
    }
  }
}

function openCrate(game, S, P, hud, sfx) {
  const c = S.crate;
  c.busy = true;
  const roll = Math.random();
  c.offerId = roll < 0.38 ? 'thompson' : roll < 0.72 ? 'scatter' : 'arc';
  S.voice(LINES.crateOpen);
  // Lid swings, the prize rises out of the box glowing.
  c.lid.setRotation([0, 0, -70]);
  c.lid.setPosition([c.at[0] - 0.45, c.at[1] + 0.75, c.at[2]]);
  let disp;
  if (c.offerId === 'thompson') { const t = game.thompson({ physics: false }); disp = { root: t, parts: t.wood ? [t.wood] : [] }; }
  else if (c.offerId === 'scatter') disp = makeScattergun(game);
  else disp = makeArcProjector(game);
  disp.root.setPosition([c.at[0], c.at[1] + 0.2, c.at[2]]);
  c.offer = disp;
  c.rise = 0;
  c.timer = 8;
  c.glow = game.light({ at: [c.at[0], c.at[1] + 1, c.at[2]], color: 0x86e2ff, intensity: 70, radius: 6 });
  let spins = 0;
  c.spinInterval = setInterval(() => { sfx.crateSpin(); if (++spins > 10) { clearInterval(c.spinInterval); c.spinInterval = null; } }, 160);
}

function closeCrate(S) {
  const c = S.crate;
  if (c.offer) { for (const p of c.offer.parts) p.destroy(); c.offer.root.destroy(); }
  if (c.glow) { c.glow._decay = 0.05; c.glow = null; }   // engine sweeps it out
  if (c.spinInterval) { clearInterval(c.spinInterval); c.spinInterval = null; }
  c.offer = null; c.offerId = null; c.busy = false;
  c.lid.setRotation([0, 0, 0]);
  c.lid.setPosition([c.at[0], c.at[1] + 0.44, c.at[2]]);
}

/* ---------------- HUD ----------------
   All DOM, injected here so the page needs nothing but a canvas.
   Serif, parchment-on-dark, red where it matters. */

function makeHud() {
  const old = document.getElementById('b9hud');
  if (old) old.remove();
  const oldCss = document.getElementById('b9hud-css');
  if (oldCss) oldCss.remove();
  const css = document.createElement('style');
  css.id = 'b9hud-css';
  css.textContent = `
  #b9hud { position:fixed; inset:0; pointer-events:none; font-family:Georgia,'Times New Roman',serif; color:#e8ddc8; z-index:10; }
  #b9hud .round { position:absolute; left:26px; bottom:18px; font-size:64px; color:#b3221c;
    text-shadow:0 0 18px rgba(179,34,28,.55), 0 2px 2px #000; font-style:italic; }
  #b9hud .roundlbl { position:absolute; left:28px; bottom:86px; font-size:13px; letter-spacing:.35em; color:#8c7f68; }
  #b9hud .points { position:absolute; right:26px; bottom:64px; font-size:30px; text-align:right; text-shadow:0 2px 3px #000; }
  #b9hud .ammo { position:absolute; right:26px; bottom:18px; font-size:22px; text-align:right; color:#cfc3ab; text-shadow:0 2px 3px #000; }
  #b9hud .ammo .wname { font-size:12px; letter-spacing:.3em; color:#8c7f68; display:block; }
  #b9hud .cross { position:absolute; left:50%; top:50%; width:4px; height:4px; margin:-2px; border-radius:50%;
    background:rgba(232,221,200,.85); box-shadow:0 0 4px #000; }
  #b9hud .hitm { position:absolute; left:50%; top:50%; width:18px; height:18px; margin:-9px; opacity:0; }
  #b9hud .hitm:before,#b9hud .hitm:after { content:''; position:absolute; inset:0;
    border:2px solid #e8ddc8; border-radius:0; transform:rotate(45deg); border-bottom:none; border-left:none; }
  #b9hud .hitm:after { transform:rotate(225deg); }
  #b9hud .hitm.head:before,#b9hud .hitm.head:after { border-color:#ff5040; }
  #b9hud .prompt { position:absolute; left:50%; bottom:26%; transform:translateX(-50%); font-size:19px;
    background:rgba(8,6,4,.72); padding:8px 22px; border:1px solid #4a4234; letter-spacing:.06em; display:none; }
  #b9hud .prompt .key { color:#ffd27a; }
  #b9hud .subs { position:absolute; left:50%; bottom:12%; transform:translateX(-50%); width:min(760px,80vw);
    text-align:center; font-size:18px; text-shadow:0 2px 3px #000; display:none; }
  #b9hud .subs .who { font-size:12px; letter-spacing:.3em; display:block; margin-bottom:4px; }
  #b9hud .banner { position:absolute; left:50%; top:20%; transform:translateX(-50%); font-size:34px;
    letter-spacing:.28em; opacity:0; text-shadow:0 0 22px currentColor; transition:opacity .3s; }
  #b9hud .dmg { position:absolute; inset:0; opacity:0;
    background:radial-gradient(ellipse at center, transparent 42%, rgba(140,10,6,.75) 100%); transition:opacity .25s; }
  #b9hud .title { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    justify-content:center; background:rgba(4,3,2,.9); transition:opacity 1.4s; pointer-events:auto; }
  #b9hud .title h1 { font-size:64px; letter-spacing:.3em; color:#e8ddc8; margin:0 0 8px; font-weight:400; }
  #b9hud .title h1 span { color:#b3221c; }
  #b9hud .title p { color:#8c7f68; letter-spacing:.2em; font-size:14px; margin:4px 0; }
  #b9hud .pdelta { position:absolute; right:30px; bottom:100px; font-size:18px; color:#ffd27a; opacity:0; }
  #b9hud .flick { animation:b9flick 1.4s ease-out; }
  @keyframes b9flick { 0%{opacity:0} 12%{opacity:1} 22%{opacity:.2} 34%{opacity:1} 44%{opacity:.35} 60%{opacity:1} 100%{opacity:1} }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'b9hud';
  root.innerHTML = `
    <div class="dmg"></div><div class="cross"></div><div class="hitm"></div>
    <div class="roundlbl">ROUND</div><div class="round">1</div>
    <div class="points">500</div><div class="pdelta"></div>
    <div class="ammo"><span class="wname">SIDEARM</span><span class="nums">7 / 42</span></div>
    <div class="prompt"></div>
    <div class="subs"><span class="who"></span><span class="text"></span></div>
    <div class="banner"></div>
    <div class="title"><h1>BUNKER <span>NINE</span></h1>
      <p>THE DEAD COME THROUGH THE WINDOWS. POINTS BUY EVERYTHING.</p>
      <p>WASD MOVE &nbsp;·&nbsp; MOUSE AIM &nbsp;·&nbsp; F USE &nbsp;·&nbsp; R RELOAD &nbsp;·&nbsp; Q SWAP</p>
      <p class="go" style="color:#e8ddc8;margin-top:22px">CLICK TO STAND POST</p></div>`;
  document.body.appendChild(root);
  const $ = (c) => root.querySelector(c);
  const els = {
    round: $('.round'), points: $('.points'), ammo: $('.ammo .nums'), wname: $('.ammo .wname'),
    prompt: $('.prompt'), subs: $('.subs'), subWho: $('.subs .who'), subText: $('.subs .text'),
    banner: $('.banner'), dmg: $('.dmg'), title: $('.title'), hitm: $('.hitm'), pdelta: $('.pdelta'),
  };
  let subTimer = 0, hmTimer = 0, pdAcc = 0, pdTimer = 0, bnTimer = 0;
  return {
    els,
    round(n) { els.round.textContent = n; els.round.classList.remove('flick'); void els.round.offsetWidth; els.round.classList.add('flick'); },
    points(n) { els.points.textContent = n; },
    pointsDelta(n) { pdAcc += n; els.pdelta.textContent = '+' + pdAcc; els.pdelta.style.opacity = 1; clearTimeout(pdTimer); pdTimer = setTimeout(() => { els.pdelta.style.opacity = 0; pdAcc = 0; }, 700); },
    ammo(P) { const am = P.ammoFor(P.equipped()); els.ammo.textContent = `${am.mag} / ${am.reserve}`; els.wname.textContent = P.spec().slotName; },
    flashWeapon(name) { els.wname.textContent = name; },
    prompt(text, warn) {
      if (!text) { els.prompt.style.display = 'none'; return; }
      els.prompt.style.display = 'block';
      els.prompt.innerHTML = `<span class="key">[F]</span> ${text}`;
      els.prompt.style.borderColor = warn ? '#b3221c' : '#4a4234';
    },
    subtitle(cast, text, dur) {
      els.subs.style.display = 'block';
      els.subWho.textContent = cast.name;
      els.subWho.style.color = cast.color;
      els.subText.textContent = '"' + text + '"';
      clearTimeout(subTimer);
      subTimer = setTimeout(() => { els.subs.style.display = 'none'; }, dur * 1000 + 400);
    },
    banner(text, color) {
      els.banner.textContent = text;
      els.banner.style.color = color || '#e8ddc8';
      els.banner.style.opacity = 1;
      clearTimeout(bnTimer);
      bnTimer = setTimeout(() => { els.banner.style.opacity = 0; }, 2200);
    },
    hitmark(head) {
      els.hitm.classList.toggle('head', !!head);
      els.hitm.style.opacity = 1;
      clearTimeout(hmTimer);
      hmTimer = setTimeout(() => { els.hitm.style.opacity = 0; }, 90);
    },
    damage(hp) { els.dmg.style.opacity = Math.min(1, (100 - hp) / 90); },
    hideTitle() { els.title.style.opacity = 0; setTimeout(() => { els.title.style.display = 'none'; }, 1500); },
    gameOver(round, kills) {
      els.title.innerHTML = `<h1 style="color:#b3221c">YOU FELL</h1>
        <p>SURVIVED TO ROUND ${round} &nbsp;·&nbsp; ${kills} OF THE DEAD PUT DOWN</p>
        <p class="go" style="color:#e8ddc8;margin-top:22px;cursor:pointer">CLICK TO STAND POST AGAIN</p>`;
      els.title.style.display = 'flex';
      els.title.style.opacity = 1;
      els.title.querySelector('.go').addEventListener('click', () => location.reload());
    },
  };
}

/* ---------------- rounds ---------------- */

function startRound(game, S, hud, sfx) {
  S.round++;
  S.toSpawn = ROUNDS.countFor(S.round);
  S.spawnT = 1.5;
  S.betweenRounds = false;
  hud.round(S.round);
  sfx.roundSting();
  if (S.round > 1 && S.round % 2 === 0) {
    const pool = LINES.roundStart;
    S.voice(pool[Math.floor(Math.random() * pool.length)]);
  }
}

function updateRounds(game, S, P, hud, sfx, dt) {
  const alive = S.zombies.filter((z) => !z.dead).length;

  if (S.betweenRounds) {
    S.lullT -= dt;
    if (S.lullT <= 0) startRound(game, S, hud, sfx);
    return;
  }

  if (S.toSpawn > 0 && alive < ROUNDS.maxAlive(S.round)) {
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      S.spawnT = ROUNDS.spawnGap(S.round);
      // Prefer windows in or beside the player's room, like a director
      // keeping the pressure where the player is looking.
      const pr = roomOf(P.actor.position);
      const options = S.windows.filter((w) => S.activeWindows.includes(w.def.id));
      const near = options.filter((w) => w.def.room === pr);
      const pickFrom = near.length && Math.random() < 0.65 ? near : options;
      const win = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      if (win && spawnZombie(game, S, win)) S.toSpawn--;
    }
  }

  const aliveNow = S.zombies.some((z) => !z.dead);
  if (S.toSpawn === 0 && !aliveNow && !S.gameOver) {
    S.betweenRounds = true;
    S.lullT = ROUNDS.lull;
    sfx.roundClear();
  }
}

/* ---------------- boot ---------------- */

function start(opts = {}) {
  const LE = window.LE;
  _vQuat1 = new LE.Quat();

  const game = LE.create({
    canvas: opts.canvas || '#game',
    quality: opts.quality || undefined,
    gravity: -19.6,
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  game.setSky('night', {
    fogDensity: 0.020, fog: 0x0a0d16,
    zenith: 0x0d1430, horizon: 0x24304e, sunIntensity: 0.9, exposure: 1.9,
  });
  game.renderer.post.vignette = 0.34;
  game.renderer.post.grain = 0.035;
  game.camera.near = 0.02;

  const S = {
    time: 0, points: ECONOMY.start, mul: 1, mulT: 0,
    round: 0, toSpawn: 0, spawnT: 0, betweenRounds: false, lullT: 0,
    zombies: [], pool: [], debris: [], windows: [], buys: [], doors: {},
    activeWindows: ['W1', 'W2'], powered: false,
    killsTotal: 0, gameOver: false, started: false,
    firstBloodDone: false, powerupActive: null,
    testMode: !!opts.test, godMode: false,
    input: { fireHeld: false, firePressed: false },
  };
  S.addPoints = (n) => { const a = Math.round(n * S.mul); S.points += a; return a; };

  const hud = makeHud();
  S.hud = hud;
  const sfx = makeSfx(game);
  const voice = makeVoice(game, hud, () => S.gameOver);
  S.voice = voice;

  buildMap(game, S);
  // Three zombies up front so round one is ready; the rest of the pool
  // fills in one at a time behind the title card and early rounds.
  const POOL_SIZE = 13;
  for (let i = 0; i < 3; i++) buildPooledZombie(game, S, i);
  let poolNext = 3;
  const trickle = () => {
    if (poolNext >= POOL_SIZE) return;
    buildPooledZombie(game, S, poolNext++);
    setTimeout(trickle, 450);
  };
  setTimeout(trickle, 1200);
  const P = makePlayer(game, S, hud, sfx, voice);
  S.player = P;
  hud.ammo(P);
  hud.points(S.points);

  /* Input edge-tracking. */
  const startGame = () => {
    if (S.started) return;
    S.started = true;
    hud.hideTitle();
    setTimeout(() => voice(LINES.intro, true), 900);
    S.roundStartAt = S.time + 5.2;   // game time, so tests and pauses behave
  };
  hud.els.title.addEventListener('click', startGame);
  if (opts.test) startGame();

  game.onUpdate((dt) => {
    if (window.__FREEZE) return;   // test/profiling hatch: engine only
    S.time += dt;
    S.frame = (S.frame || 0) + 1;
    const i = game.input;
    S.input.fireHeld = i.pointer.down || i.down(' ');
    S.input.firePressed = i.pointer.justDown || i.justPressed(' ');

    if (S.gameOver || !S.started) return;
    if (S.roundStartAt != null && S.time >= S.roundStartAt) { S.roundStartAt = null; startRound(game, S, hud, sfx); }

    /* Player movement: camera-relative WASD through the capsule controller. */
    if (P.alive) {
      const yaw = game.cameraYaw;
      const mx = i.axes.x, mz = -i.axes.y;
      const wx = Math.sin(yaw) * mz + Math.cos(yaw) * mx;
      const wz = Math.cos(yaw) * mz - Math.sin(yaw) * mx;
      P.actor.controller.move(wx, wz, i.down('shift'));

      if (i.justPressed('r')) tryReload(P, sfx);
      if (i.justPressed('q') && P.slots.length > 1) { P.slot = 1 - P.slot; P.reloading = 0; hud.ammo(P); }
      if (i.justPressed('1')) { P.slot = 0; P.reloading = 0; hud.ammo(P); }
      if (i.justPressed('2') && P.slots.length > 1) { P.slot = 1; P.reloading = 0; hud.ammo(P); }

      if (P.reloading > 0) {
        P.reloading -= dt;
        if (P.reloading <= 0) { P.reloading = 0; finishReload(P, hud); }
      }

      tryFire(game, S, P, hud, sfx, dt);
      updateViewmodel(game, P, dt, Math.abs(mx) + Math.abs(mz) > 0.1);

      /* Interact. */
      const it = nearestInteract(S, P);
      if (it) {
        hud.prompt(it.label + (it.hold ? ' (hold)' : ''));
        if (it.hold ? i.down('f') || i.down('x') : (i.justPressed('f') || i.justPressed('x'))) {
          doInteract(game, S, P, hud, sfx, it, dt);
        }
      } else hud.prompt(null);

      /* Regen. */
      if (P.hp < PLAYER.hp && S.time - P.lastHit > PLAYER.regenDelay) {
        P.hp = Math.min(PLAYER.hp, P.hp + PLAYER.regenRate * dt);
        hud.damage(P.hp);
      }
      if (P.hp < 30 && Math.floor(S.time * 1.1) !== Math.floor((S.time - dt) * 1.1)) sfx.heartbeat();
    }

    /* World systems. */
    updateRounds(game, S, P, hud, sfx, dt);
    for (const z of S.zombies) updateZombie(game, S, P, z, dt, sfx);

    /* Torn boards tumble. */
    for (let k = S.debris.length - 1; k >= 0; k--) {
      const d = S.debris[k];
      d.t -= dt;
      const pos = d.actor.position;
      d.vel[1] -= 12 * dt;
      d.actor.setPosition([pos.x + d.vel[0] * dt, pos.y + d.vel[1] * dt, pos.z + d.vel[2] * dt]);
      if (d.t <= 0) { d.actor.destroy(); S.debris.splice(k, 1); }
    }

    /* Powerup float, pickup, expiry. */
    if (S.powerupActive) {
      const pu = S.powerupActive;
      pu.t -= dt; pu.spin += dt * 2.4;
      pu.actor.setRotation([0, pu.spin * 57.3, 0]);
      const base = pu.actor.position;
      pu.actor.setPosition([base.x, pu.baseY + Math.sin(pu.spin * 1.8) * 0.12, base.z]);
      if (pu.t < 4) pu.actor.visible = Math.floor(pu.t * 6) % 2 === 0;
      if (dist2d(base, P.actor.position) < 1.25 && Math.abs(base.y - P.actor.position.y) < 1.8) applyPowerup(game, S, P, hud, sfx);
      else if (pu.t <= 0) { pu.actor.destroy(); S.powerupActive = null; }
    }
    if (S.mulT > 0) { S.mulT -= dt; if (S.mulT <= 0) S.mul = 1; }

    /* Crate lifecycle. */
    const c = S.crate;
    if (c.offer) {
      c.rise = Math.min(1, c.rise + dt / 2.2);
      c.offer.root.setPosition([c.at[0], c.at[1] + 0.2 + c.rise * 0.85, c.at[2]]);
      c.offer.root.setRotation([0, S.time * 40 % 360, 0]);
      c.timer -= dt;
      if (c.timer <= 0) closeCrate(S);
    }

    /* Lamp flicker: dying grid before power, breathing warmth after. */
    for (let li = 0; li < S.lamps.length; li++) {
      const L = S.lamps[li];
      const base = S.powered ? L.full : L.full * 0.45;
      const n = Math.sin(S.time * (S.powered ? 2.1 : 13) + li * 7.3) * 0.5 + Math.sin(S.time * 27 + li * 3.1) * 0.5;
      L.light.intensity = base * (S.powered ? 1 + n * 0.06 : Math.max(0.35, 0.8 + n * 0.35));
    }
  });

  /* Test hooks: everything QA needs to drive the game headless. */
  window.__T = {
    game, S, P, WEAPONS, ECONOMY, LINES,
    spawn(winId) {
      const win = S.windows.find((w) => w.def.id === (winId || S.activeWindows[0]));
      return win ? spawnZombie(game, S, win) : null;
    },
    setPoints(n) { S.points = n; hud.points(n); },
    give(id) { S.player.give(id); hud.ammo(S.player); },
    killAll() { for (const z of S.zombies) if (!z.dead) killZombie(game, S, z, false); },
    forceRound(n) { S.round = n - 1; S.toSpawn = 0; for (const z of S.zombies) if (!z.dead) killZombie(game, S, z, false); startRound(game, S, hud, sfx); },
    god(on) { S.godMode = on !== false; },
    teleport(x, y, z) { P.actor.controller.teleport(new window.LE.Vec3(x, y, z)); },
    look(yaw, pitch) { game._camYaw = yaw; game._camPitch = Math.max(-1.45, Math.min(1.45, pitch)); },
    idleInPool() { return S.pool.filter((z) => z.parked).length; },
    poolReady() { return S.pool.filter((z) => z.parked).length; },
  };

  if (!opts.test) game.start();
  return { game, S, P };
}

window.BUNKER = { start, WEAPONS, ECONOMY, LINES, CAST };
})();
