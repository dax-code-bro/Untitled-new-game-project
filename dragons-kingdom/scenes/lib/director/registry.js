// Shot director - the SET REGISTRY (pure data: browser AND Node).
//
// For every set of the shot list (episodes/s01e01/final/shotlist.json `sets`): which scene file
// renders it (the name render-jobs.json / episode.mjs expect), which director set builder
// (scenes/lib/director/sets/<builder>.js) builds it from which libraries, the world frame it
// uses, and CONTINUITY per story scene: time of day, where the sun is, weather, what lights burn.
// Set builders read their light and weather from here, so two shots of the same scene can never
// disagree about the sun. Values are PROVISIONAL production choices (SERIES.md section 5), not
// canon; where a style frame established a look, the entry says so.
//
// World frames
//   VERDOR: one frame for every Verdor set (riding grounds, palace interiors, chamber): +x = EAST
//           (the sea side: the shot list's "sun over the sea side"), -z = NORTH, y up, metres.
//   PROLOGUE: style frame F1's frame (camera near the origin looking north, the island 2 km out).
//
// Sun direction: a unit vector TOWARD the sun in the set's world frame, from azimuth (degrees,
// 0 = north (-z), 90 = east (+x)) and elevation (degrees above the horizon): sunDir(az, el).

export function sunDir(azDeg, elDeg) {
  const a = (azDeg * Math.PI) / 180, e = (elDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

/** Per story scene: the clock and the weather (applies to every set the scene visits). */
export const SCENE_CONTINUITY = {
  PROLOGUE: {
    tod: 'dawn', weather: 'sea fog in banks, a low cloud bank on the eastern horizon; fresh breeze (Beaufort 5) from 110 deg',
    notes: 'Historical prologue: no named dragon, nothing resolved in the fog. P-16 is the turn to the present day (first clear sunlight); P-17 is the present-day meadow (Verdor, morning).',
  },
  TITLE: { tod: 'morning (interior, dark)', weather: '-', notes: 'The closed egg in near-dark: one warm lamp rim. The chamber of 1A before the hatching.' },
  '1A': {
    tod: 'early morning -> morning', weather: 'clear after a misty dawn; mist thinning over the sea by X2-08',
    notes: 'X1 (the queen\'s room, the corridor) is FIRST LIGHT: the sun not yet up, a grey sky over the sea. The hatching takes time: by the chamber shots the sun is up and shines through the chamber\'s high east window; X2-04..X2-07 and X2-08..X2-13 (the field) are full morning. Lamps burn in the chamber all scene.',
  },
};

/** Every set of the shot list. builder: scenes/lib/director/sets/<builder>.js (null: no 3D). */
export const SETS = {
  CARD_BLACK: { file: null, builder: null, frame: null, render: 'black', libs: [], about: 'Black / text card: made by the encoder in the conform.' },
  SEA_COAST_DAWN: {
    file: 'sea-coast-dawn.js', builder: 'sea-coast-dawn', frame: 'PROLOGUE',
    libs: ['dk/ocean.js (FFT sea, wake)', 'runtime/cinematic (atmosphere, froxel fog banks)', 'scenes/lib/nature/island.js (prologue island)', 'scenes/lib/props/boat.js (prologue vessel)', 'scenes/lib/humans (sailor1, crowd06, crowd16)', 'scenes/lib/creatures (shadow-only body)', 'scenes/lib/sets/fx.js (silhouette card)'],
    from: 'style frame F1 (scenes/lookdev/style-f1-prologue.js)',
    continuity: { PROLOGUE: { sun: sunDir(-0.5, 6), sunVeiled: true, tod: 'dawn', exposure: -1.35, whiteBalance: 3700 } },
  },
  PROLOGUE_VISTAS: {
    file: 'prologue-vistas.js', builder: 'prologue-vistas', frame: 'PROLOGUE',
    libs: ['dk/ocean.js', 'scenes/lib/nature (prologue island, trees)', 'scenes/lib/architecture (houses, walls, towers)', 'scenes/lib/sets/terrain.js', 'runtime/cinematic (haze, mist banks: the wing-shaped cloud)'],
    from: 'new: one landscape per shot in the F1 look',
    continuity: { PROLOGUE: { sun: sunDir(95, 7), sunVeiled: true, tod: 'dawn', perShot: { 'P-13': { sun: sunDir(140, 38), tod: 'high bright day (another sea)' }, 'P-14': { sun: sunDir(200, 14), sunVeiled: true, tod: 'low cloud, long swell' }, 'P-16': { sun: sunDir(100, 12), tod: 'morning: first clear sunlight' } } } },
  },
  VERDOR_GROUNDS: {
    file: 'verdor-grounds.js', builder: 'verdor-grounds', frame: 'VERDOR',
    libs: ['scenes/lib/sets/terrain.js + grass.js', 'dk/ocean.js (the sea beyond the field)', 'scenes/lib/creatures (Leaf; Charcoal shadow-only in P-17)', 'scenes/lib/humans (abby, remi)', 'scenes/lib/architecture/verdor.js (stable door)'],
    from: 'style frame F2 (scenes/lookdev/style-f2-riding-grounds.js), same sun side',
    continuity: { PROLOGUE: { sun: sunDir(105, 32), tod: 'clear morning', exposure: 1.4 }, '1A': { sun: sunDir(100, 30), tod: 'morning, mist thinning', exposure: 1.4 } },
  },
  BIRTHING_CHAMBER: {
    file: 'birthing-chamber.js', builder: 'birthing-chamber', frame: 'VERDOR',
    libs: ['scenes/lib/architecture/interiors.js (birthingChamber, nest, lamps)', 'scenes/lib/props/verdor.js (the egg: closed / cracked / opened)', 'scenes/lib/creatures (hatchling)', 'scenes/lib/humans (alexandria, attendant, abby, remi, young attendant = messenger)', 'runtime/cinematic (dust in the window shaft)'],
    from: 'style frame F4 (scenes/lookdev/style-f4-birthing-chamber.js)',
    continuity: {
      TITLE: { sun: null, lamps: 0.55, tod: 'before the hatching: near dark, one lamp', exposure: 0.6 },
      '1A': { sun: sunDir(94.7, 43.2), lamps: 1.0, tod: 'morning: sun through the high east window (F4)', exposure: 1.3 },
    },
  },
  PALACE_CORRIDOR: {
    file: 'palace-corridor.js', builder: 'palace-corridor', frame: 'VERDOR',
    libs: ['scenes/lib/architecture (masonry, openings, interiors: flag floor, beam ceiling)', 'scenes/lib/humans (messenger as the young attendant, alexandria, abby, remi, crowd servants)'],
    from: 'new (assets-delta S2)',
    continuity: { '1A': { sun: sunDir(95, 4), sunVeiled: true, tod: 'first light (X1) / morning (X2)', perShot: { 'X2-04': { sun: sunDir(100, 24), sunVeiled: false }, 'X2-05': { sun: sunDir(100, 24), sunVeiled: false }, 'X2-06': { sun: sunDir(100, 24), sunVeiled: false }, 'X2-07': { sun: sunDir(100, 24), sunVeiled: false } } } },
  },
  ALEXANDRIA_ROOM: {
    file: 'alexandria-room.js', builder: 'alexandria-room', frame: 'VERDOR',
    libs: ['scenes/lib/architecture (masonry, window unit, door, flag floor, beam ceiling)', 'scenes/lib/props (jug, cup, bed linen)', 'dk/ocean.js (the sea through the window)', 'scenes/lib/humans (alexandria, messenger)'],
    from: 'new (assets-delta S1)',
    continuity: { '1A': { sun: sunDir(92, -2), sunVeiled: true, tod: 'first light: the sun not up, grey sky over the sea, no lamp lit', exposure: 1.0 } },
  },
};

/** The set entry + the continuity of story scene `scene` (with per-shot overrides) for shot `job`. */
export function continuityFor(setId, scene, job = null) {
  const s = SETS[setId];
  if (!s) throw new Error(`set "${setId}" is not in the director's registry`);
  const sc = SCENE_CONTINUITY[scene] || {};
  const c = s.continuity?.[scene] || Object.values(s.continuity || {})[0] || {};
  const per = (job && c.perShot?.[job]) || {};
  const out = { ...sc, ...c, ...per };
  delete out.perShot;
  return out;
}
