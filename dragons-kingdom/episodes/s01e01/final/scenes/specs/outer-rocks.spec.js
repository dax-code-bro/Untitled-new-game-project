// Shot specs - OUTER_ROCKS: scene 1C, the race through the outer rocks (X6-01..03, X6-08..18). Session 32: WIRED.
// Set builder: scenes/lib/director/sets/outer-rocks.js (SKY_OFF_VERDOR's coast / sea / sky + the stacks, foam, mist,
// seabirds). X6-04..07 / 19 / 20 are SKY_OFF_VERDOR shots (the approach + the return, rocks off frame).
//
// GAP FRAME (map below; the builder's DEF is a copy): u along the gap's axis, heading 150 (NNW -> SSE, the way Leaf
// threads it; the seaward exit at +u), v to its LEFT (ENE = seaward), y up; origin = the gap at sea level [700, 0, 3200].
//   A [0, +14] 64 m and B [0, -14] 56 m lean together: the gap is ~7 m at the water, 6.8 m at 10 m, 2.5 m at the top
//   C [70, -20] the LOW stack, flat top y 17 (~10 x 9 m) - Leaf lands on it heading 195; D-G more stacks round them
//   mist: a low bank against the seaward faces / the gap's exit (cinematic banks), a thin sheet further out to sea
// THE RACE (each shot is its own moment; the edit compresses time):
//   Leaf skims in low (y ~4.5) along the axis, rolls ~80 deg onto his side 30 m short of the gap, threads it at y ~9.5,
//   rolls level outside, swings up in a tight climbing right turn and lands low and level on C, heading 195.
//   Charcoal climbs over the stacks (y 48 -> 86), his downwash rings the water and lifts every bird (X6-12), he folds
//   and dives down the far side, then checks above C with one huge beat from the ESE (his shadow falls 1.63 h W and
//   0.35 h N of him: sun 102 / 31) and hovers there for the exchange (X6-17).
// Birds: set.birds.lift = the shot-local time the birds go up (none = sitting; -20 = all already wheeling).
const D2R = Math.PI / 180;
const map = { gap: [700, 0, 3200], axis: 150 };
const AX = map.axis;
const W = (u, v, y = 0) => {
  const h = AX * D2R;
  return [map.gap[0] + Math.sin(h) * u - Math.cos(h) * v, y, map.gap[2] - Math.cos(h) * u - Math.sin(h) * v];
};
/** root keys along the gap frame: [[t, u, v, y, ease?], ...] */
const path = (keys) => keys.map(([t, u, v, y, e]) => (e ? [t, W(u, v, y), e] : [t, W(u, v, y)]));
const LEAF_FLY = (o = {}) => [[0, 'flight', { corr: 1, ...o }]];
const LEAF_SKIM = (o = {}) => [[0, 'flight', { corr: 1, hz: 1.4, amp: 0.55, ...o }]];   // short beats: tips clear the water
const CHAR_HZ = 0.625;                                   // sound spots: one beat / 1.6 s
const CHAR_FLY = (o = {}) => [[0, 'flight', { hz: CHAR_HZ, amp: 0.68, ...o }]];
const LOW = W(70, -20, 17);                              // the low stack's top centre (= builder marks.lowTop)
const LEAF_ON_C = { root: [[0, LOW]], yawKeys: 195 };
const HOVER = W(94, 5, 40);                              // Charcoal checking above C (his shadow covers it)
const HOVER_TALK = W(84, -2, 19);                        // ... and lower / nearer for the exchange (X6-17; r3 at 32 / r4 at 26: Remi above the frame)
const LEAF_LOW = (o = {}) => [[0, 'crouch', { k: 0.35, ...o }]];
const BIRDS_UP = { lift: -20 };

export default {
  set: 'OUTER_ROCKS',
  map,
  cast: {
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
    charcoal: { kind: 'creature', id: 'charcoal' },
    // the race: both riders tucked down (the lean is per rider build, so it holds for the whole set)
    abbyR: { kind: 'human', id: 'abby_ride', ride: { on: 'leaf', lean: 0.55 }, outfit: 'abby', role: 'ABBY' },
    remiR: { kind: 'human', id: 'remi_ride', ride: { on: 'charcoal', lean: 0.45 }, outfit: 'remi', role: 'REMI' },
  },
  previs: { ground: 0 },
  shots: {
    'X6-01': {
      staging: 'EXTREME WIDE 100 mm from a camera ship far out SSE, slow drift: the outer rocks centre (the two leaning stacks and the gap opening toward us, birds on the ledges, white water), the mist bank against their seaward side right; Leaf and Charcoal small, left, coming down the coast toward them.',
      // (r1 from v +75 at 120 mm: the pair sat exactly behind the stacks -> camera on the coast side of the axis, pair 120 m inland of it)
      cam: { rig: 'drone', pos: [[0, W(520, -60, 52)], [6, W(512, -66, 51), 'linear']], look: [[0, W(-40, -31, 30)], [6, W(-40, -33, 30), 'linear']], mm: 100, fstop: 8, focus: 520 },
      cast: {
        leaf: { tack: true, root: path([[0, -350, -98, 70], [6, -240, -98, 62, 'linear']]), yawKeys: AX, acts: LEAF_FLY() },
        charcoal: { tack: true, root: path([[0, -390, -112, 92], [6, -290, -112, 88, 'linear']]), yawKeys: AX, acts: CHAR_FLY() },
        abbyR: {}, remiR: {},
      },
    },
    'X6-02': {
      staging: 'WIDE 35 mm low over the water on the approach side, a slow push: the gap - two stone walls leaning together, a slot of bright mist and sea beyond, white water at their feet.',
      cam: { rig: 'drone', pos: [[0, W(-78, -3, 10)], [3, W(-66, -2.5, 10.5), 'linear']], look: [[0, W(10, 0, 14)], [3, W(10, 0, 14.5), 'linear']], mm: 35, fstop: 8, focus: 80 },
      cast: {},
    },
    'X6-03': {
      staging: 'WIDE 35 mm on the seaward side: the low bank of sea mist lying against the stacks\' seaward faces, the gap\'s exit half lost in it; muffled surf.',
      cam: { rig: 'drone', pos: [[0, W(42, 96, 13)], [3, W(36, 94, 13), 'linear']], look: [[0, W(0, 16, 12)], [3, W(-2, 16, 12), 'linear']], mm: 35, fstop: 8, focus: 85 },
      cast: {},
    },
    'X6-08': {
      staging: 'WIDE 35 mm tracking low over the water from behind-right: Leaf skims the sea a few metres up, short quick beats, small corrections; Abby tucked down; the stacks ahead right.',
      cam: { rig: 'follow', frame: { subjects: [['leaf.chest', [-0.1, 0.02]]], from: 312, dist: 15, rise: 1.6, track: true }, mm: 35, fstop: 5.6, focus: 'leaf.chest' },
      cast: {
        leaf: { tack: true, root: path([[0, -200, -1, 4.6], [4, -110, -1, 4.6, 'linear']]), yawKeys: [[0, 150], [1.1, 147], [2.2, 152], [3.2, 149], [4, 150]], roll: [[0, 0], [1, -7], [2, 6], [3, -4], [4, 0]], acts: LEAF_SKIM() },
        abbyR: {},
      },
    },
    'X6-09': {
      staging: 'WIDE 35 mm static INSIDE the gap looking out (NNW): Leaf comes in low and fast, tilts almost onto his side and threads the gap toward the lens, wingtips passing close to both walls; Abby tucked down.',
      cam: { rig: 'static', pos: W(13, 1.6, 7), look: W(-80, -0.6, 9.5), mm: 35, fstop: 8, focus: [[0, 80], [3.6, 6]] },
      cast: {
        leaf: { tack: true, root: path([[0, -78, -0.6, 7], [1.3, -47, -0.6, 9.5], [4, 18, -0.6, 9.5, 'linear']]), yawKeys: AX, roll: [[0, 0], [1.2, 0], [2.0, 80], [4, 80]], acts: LEAF_SKIM({ hz: 1.6, amp: 0.35 }) },
        abbyR: {},
      },
    },
    'X6-10': {
      staging: 'CLOSE 85 mm air-to-air on Abby from her right front: tucked down against Leaf, both hands on the grips, laughing into the wind; sea and spray behind.',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [0.08, 0.15]]], from: 200, dist: 3.6, rise: 0.3, track: true }, mm: 85, fstop: 2.8, focus: 'abbyR.head' },
      cast: {
        leaf: { tack: true, root: path([[0, -140, -1, 5], [2, -95, -1, 5, 'linear']]), yawKeys: AX, acts: LEAF_SKIM() },
        abbyR: { acts: [[0, 'look', { at: W(0, 0, 9), amount: 0.6 }]] },
      },
    },
    'X6-11': {
      staging: 'WIDE 35 mm from low on the water by the stacks\' seaward feet looking up: Charcoal cannot follow - he climbs and goes over the top of the stacks, slow and enormous, Remi low on his back.',
      // (r1 from W(-28, -32, 4) following him: sky only, no stone; r2 from W(-72, -52): looked into the sun (az 102) and cut him
      // off the top -> from the SEAWARD side (sun 90 deg to the side), aim following him a little below)
      cam: { rig: 'drone', pos: [[0, W(-72, 52, 5)], [5, W(-71, 52, 5.2), 'linear']], look: [[0, W(-50, 0, 52)], [5, W(-5, 0, 72), 'smooth']], mm: 35, fstop: 8, focus: 'charcoal.chest' },
      cast: {
        charcoal: { tack: true, root: path([[0, -95, 0, 48], [5, 5, 0, 86, 'linear']]), yawKeys: AX, pitch: [[0, -14], [5, -7]], acts: CHAR_FLY() },
        remiR: {},
      },
    },
    'X6-12': {
      staging: 'WIDE 35 mm static at the foot of the stacks looking up at them: his downwash (from above, off frame top) flattens the water round the rocks into a pale ring and lifts every seabird off its ledge at once.',
      // (r1 at y 3.5 / 50 m: the walls filled the frame, the ring + spray mist a white blur at the bottom -> higher, further)
      cam: { rig: 'static', pos: W(-80, -34, 10), look: W(0, 2, 20), mm: 35, fstop: 8, focus: 85 },
      set: { birds: { lift: 0.3 } },
      cast: {
        charcoal: { tack: true, root: path([[0, -12, 0, 92], [4, 52, 0, 84, 'linear']]), yawKeys: AX, acts: CHAR_FLY() },
        remiR: {},
      },
      fx: [{ kind: 'water-downwash', from: 0, at: W(0, 0, 0), params: { radius: 42, bursts: [0, 1.6, 3.2], ringLife: 5 } }],
    },
    'X6-13': {
      staging: 'MEDIUM 50 mm air-to-air from Charcoal\'s left front as he comes down past the stacks: Remi stays low in the saddle; behind him spray climbs the stone and the birds wheel.',
      // (r1 from 132: the coast + hills behind him and a near white wall of spray -> from dead ahead (the stacks behind him), less spray)
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.15, 0.05]]], from: 150, dist: 9, rise: 1.2, track: true }, mm: 50, fstop: 4, focus: 'remiR.head' },
      set: { birds: BIRDS_UP },
      cast: {
        charcoal: { tack: true, root: path([[0, 30, 6, 70], [3, 75, 9, 52, 'linear']]), yawKeys: AX, pitch: 10, acts: [[0, 'glide', { bank: 0.03, dihedral: 0.06, droop: 0.14 }]] },
        remiR: {},
      },
      fx: [0, 0.9, 1.8].map((t, i) => ({ kind: 'water-spray', id: `spray${i}`, from: t, at: W(-6 + 6 * i, 23 - i, 0.5), params: { dir: [0.15, 1, 0.1], speed: 12, count: 260, mistCount: 25, spread: 0.3, radius: 3 } })),
    },
    'X6-14': {
      staging: 'WIDE 35 mm from the far side: Charcoal folds his wings and comes down the slope of the air past the stacks toward the low stack; for a moment it looks as if he might get there first.',
      cam: { rig: 'drone', pos: [[0, W(150, -60, 30)], [4, W(148, -58, 29), 'linear']], look: [[0, W(28, 0, 82)], [4, W(98, -6, 40), 'smooth']], mm: 35, fstop: 8, focus: 'charcoal.chest' },
      set: { birds: BIRDS_UP },
      cast: {
        charcoal: { tack: true, root: path([[0, 15, 3, 94], [4, 108, -6, 36, 'linear']]), yawKeys: AX, pitch: [[0, 30], [4, 16]], acts: [[0, 'dive', { fold: 0.75 }]] },
        remiR: {},
      },
    },
    'X6-15': {
      staging: 'WIDE 35 mm static from the top of a lower stack (F): Leaf bursts out of the gap on the seaward side through the mist, swings up in a tight climbing right turn and lands on the flat top of the low stack, settling low and level, wrists down, Abby on his back - the whole of him fitting with room to spare.',
      cam: { rig: 'static', pos: W(117, -15, 29), look: W(40, -9, 16), mm: 35, fstop: 8, focus: 52 },
      set: { birds: BIRDS_UP },
      cast: {
        leaf: {
          tack: true,
          root: path([[0, -22, -0.6, 9.5], [1.4, 10, -0.6, 9.5, 'linear'], [2.0, 24, -0.6, 11], [2.8, 42, 0, 22], [3.5, 55, -3, 28], [4.1, 62, -12, 24], [4.6, 70, -20, 17]]),
          yawKeys: [[0, 150], [2.0, 150], [2.8, 155], [3.5, 175], [4.1, 192], [4.6, 195]],
          roll: [[0, 80], [1.4, 80], [2.0, 0], [2.8, 10], [3.4, 40], [4.1, 20], [4.6, 0]],
          pitch: [[0, 0], [2.0, -5], [2.6, -25], [3.4, -10], [4.1, 8], [4.6, 0]],
          acts: [[0, 'flight', { corr: 1, hz: 1.6, amp: 0.4 }], [2.0, 'flight', { corr: 1, hz: 1.5, amp: 0.95, blend: 0.3 }], [4.6, 'land', { local: true, blend: 0.2 }], [5.7, 'crouch', { k: 0.35, blend: 0.3 }]],
        },
        abbyR: {},
      },
    },
    'X6-16': {
      staging: 'WIDE 135 mm static, low over the water from ~400 m SSW: Leaf crouched on the low stack (left); Charcoal arrives out of his dive above it from the ESE and checks with one huge beat that sends the last birds wheeling; his shadow covers the whole stack and the dragon on it.',
      // (r1 from 300 m aimed at y 30: Leaf on the frame's bottom edge, Charcoal cut off the top; r2 at 230 m: sky only - the
      // sensor is Super 35 (135 mm = ~6 deg tall), so the stack + Leaf + Charcoal (y 15-58) need ~400 m)
      cam: { rig: 'static', pos: [637.7, 9, 3662.8], look: [734.5, 29.5, 3274.7], mm: 135, fstop: 8, focus: 'leaf.chest' },
      set: { birds: BIRDS_UP },
      cast: {
        leaf: { tack: true, ...LEAF_ON_C, acts: LEAF_LOW({ look: [0.6, 0.35] }) },
        charcoal: { tack: true, root: [[0, W(122, 28, 54)], [1.8, HOVER, 'out'], [4, [HOVER[0], HOVER[1] + 1.5, HOVER[2]], 'inOut']], yawKeys: 284, pitch: [[0, 6], [1.4, -16], [4, -10]], acts: [[0, 'glide', { dihedral: 0.2, droop: 0.15 }], [1.0, 'flight', { hz: 0.3, amp: 0.95, phase: 0.55, blend: 0.4 }]] },
        abbyR: {}, remiR: {},
      },
    },
    'X6-17': {
      staging: 'MEDIUM 50 mm static two-shot, Remi above: from 60 m out beyond Abby\'s right shoulder, level with the low stack (Abby left, three-quarter back) up to Remi on the hovering Charcoal (right, top). "Again?" - "You won." - "Say it so he can hear." - "You won." (louder).',
      // (r1: the framing solver could not hold both heads (1.53 off) and showed his belly -> a fixed lens WSW of Abby,
      // just above the stack top: Abby lower left (three-quarter back), Remi upper right ~12 deg beyond her)
      // (r2 at 22 m: sky only - Super 35 at 50 mm is ~16 deg tall -> 60 m out, the heads ~9 deg apart)
      cam: { rig: 'static', pos: [659.7, 24, 3286.1], look: [698.9, 24.2, 3278.0], mm: 50, fstop: 5.6, focus: 'abbyR.head' },
      set: { birds: BIRDS_UP },
      cast: {
        leaf: { tack: true, ...LEAF_ON_C, acts: LEAF_LOW({ look: [0.55, 0.3] }) },
        charcoal: { tack: true, root: [[0, HOVER_TALK], [7, [HOVER_TALK[0], HOVER_TALK[1] + 1, HOVER_TALK[2]], 'inOut']], yawKeys: 278, pitch: -10, acts: CHAR_FLY({ amp: 0.6 }) },
        abbyR: { acts: [[0, 'look', { at: 'remiR.head', amount: 0.9 }]] },
        remiR: { acts: [[0, 'look', { at: 'abbyR.head', amount: 0.8 }]] },
      },
      lines: [['X6-07', 0.3], ['X6-08', 0.15], ['X6-09', 0.15], ['X6-10', 0.2]],
    },
    'X6-18': {
      staging: 'CLOSE 85 mm static on Leaf\'s head from his front-left, on the stack: he turns one eye up toward Charcoal (off frame, above left) without any fear at all.',
      deviation: 'Leaf stays on the stack (the shot list\'s "and flies a little higher than he needs to" is not staged: he has just landed in X6-15/16/17).',
      cam: { rig: 'follow', frame: { subjects: [['leaf.head', [-0.12, 0.02]]], from: 150, dist: 5.5, rise: 0.4, track: true }, mm: 85, fstop: 4, focus: 'leaf.head' },
      set: { birds: BIRDS_UP },
      cast: {
        leaf: { tack: true, ...LEAF_ON_C, acts: [[0, 'crouch', { k: 0.35, look: [0.05, 0.05] }], [0.8, 'crouch', { k: 0.35, look: [0.85, 0.4], blend: 0.7 }]] },
        abbyR: {},
      },
    },
  },
};
