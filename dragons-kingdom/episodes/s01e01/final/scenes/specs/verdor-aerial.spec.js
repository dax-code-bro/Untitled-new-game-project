// Shot specs - VERDOR_AERIAL: scene 1C, X4-01 .. X4-20 minus the ground shots. Session 17: first-pass plan; session
// 20: WIRED - registry entry + builder scenes/lib/director/sets/verdor-aerial.js (it reads `map` below). Only the shots
// in `shots` are wired (X4-01/02/03/06/11/14/20); the rest wait in `plans` (requests / dialogue / previs pending).
// NOTE (s20): the MAP numbers below supersede the s17 prose where they differ (harbour wall rooted at [275, 1440],
// Santa Maria at x 267, terraced town: ground = 2.6 + 7.5 * terrace index, terraces 25 m apart west of x 230).
//
// The ground-level X4 shots (X4-04, X4-05, X4-07, X4-09) are set VERDOR_HARBOR (their own spec / builder later); they
// share the SAME map below so the dragons' shadows / the harbour layout match across the cut.
//
// MAP (VERDOR frame: +x east = the sea, -z north, y up, metres; PROVISIONAL - first placement of the harbour town):
//   The riding grounds are around the origin (1B); the palace lies SOUTH of the field (1A: they walk up the field
//   from the south). The 1C flight line runs SOUTH along the coast (x ~295) from z 300; 1C-19 ends at formation
//   time T 47 (z 1052). Continuing south the coast BENDS east into the harbour bay:
//     COAST      x ~295 down to z ~1350, then the bay: shore curving west to x ~250 (z 1500-1750) and back out east to
//                a low headland at [380, 0, 1880]; south of it the coast runs on SSE to the outer rocks (X6, z ~3200)
//     HARBOUR    curved stone wall (breakwater) from the north shore [300, 0, 1480] arcing out to the mouth at
//                [400, 0, 1640], opening SOUTH-EAST; QUAY along the inner west shore x ~262, z 1560-1700, quay face
//                looking EAST (architecture/verdor.js harbor(): its +z sea axis rotated to +x), slipway at its south
//                end [265, 0, 1715] running down east; net frames on the hard south of the slipway
//     SANTA MARIA moored at the north end of the quay, bow north, [272, 0, 1585], mainmast top ~28 m
//     TOWN       terraced hillside WEST of the quay: x 120-255, z 1480-1780, ground rising from 3 m at the quay to
//                ~42 m at x 120 (3-4 terraces of houses: architecture houses kit, roofs readable from above);
//                MARKET STREET running north-south along the first terrace (x ~235, y ~8)
//     PALACE     on the high ground WNW of the town: [60, 58, 1430] (ground), keep ~24 m; the birthing chamber's
//                high opening on its EAST face ~18 m above its ground ([84, 76, 1430]) - looks east over the sea, the
//                same window that lights the chamber in 1A (sun az 94.7 - check BIRTHING_CHAMBER continuity)
//     TERRACE FARM (X4-06) south-west of the town on the slope [150, 34, 1840]
//     SCHOOL FIELD (X4-13: young riders on small dragons, instructor) on the plateau south of the town
//                [190, 38, 1960], 120 x 70 m, NOT the 1B riding grounds
//   SUN: same as 1C (sunDir(102, 31)); shadows fall 1.63 h west + 0.35 h north of each dragon -> at 60 m up Charcoal's
//   shadow lands ~100 m WEST of him: over the quay when he flies ~100 m east of it (X4-03 "his shadow reaches the
//   town before he does" works naturally with the sun behind them over the sea).
//
// FLIGHT CLOCK (formation T continues 1C's: zF(T) = 300 + 16 T; the edit compresses time, the map stays continuous):
//   X4 starts at T 62 (z 1292, the bend ahead). Over the harbour the line curves: heading 180 -> 200 (SSW) across the
//   bay mouth, then back to 165 along the south coast; altitude: Charcoal stays ~60 m (X4-03 "stays high"); Leaf drops
//   to ~14 m along the breakwater (X4-02), passes the Santa Maria's masthead at ~30 m (X4-10), climbs back (X4-11).
//   Screen direction: cameras stay on the INLAND (west) side while over open water (travel L -> R); over the town the
//   aerial views look DOWN / east from the town side, travel still L -> R (shotlist flight_line_1C_to_1E).
// Faces: X4-12 (Remi "They wave at you"), X4-18 (Abby/Remi exchange) and X4-19 are dialogue / reaction shots ->
// lip-sync from the takes when performance supports riders in flight; otherwise three-quarter / turned.
// CAST: as SKY_OFF_VERDOR + town crowd (scenes/lib/humans crowd kit, LOD far), quay dragon (scout-size species,
// low crouch), net dragon, 3-4 school dragons (hatchling-grown / scout presets, small), lookout on the Santa Maria.
//
// Shot specs below use the SKY_OFF_VERDOR vocabulary (cam rigs, inForm, acts) so the file can be wired as-is once the
// builder exists; every `cam` is a PLAN to be checked in previs (pv tool) before stills.
const V = 16;
const zF = (T) => 300 + V * T;
const inForm = (x, y, lead, T0, dur, o = {}) => ({
  root: [[0, [x, y, zF(T0) + lead]], [dur, [x + (o.dx || 0), y + (o.dy || 0), zF(T0 + dur) + lead + (o.dlead || 0)], 'linear']],
  yawKeys: o.heading ?? 180,
});
const LEAF_FLY = (o = {}) => [[0, 'flight', { corr: 1, ...o }]];
const CHAR_HZ = 0.625;                                   // sound spots: one beat / 1.6 s (do not change without telling sound)
const CHAR_FLY = (o = {}) => [[0, 'flight', { hz: CHAR_HZ, amp: 0.68, ...o }]];
const CHAR_GLIDE = (o = {}) => [[0, 'glide', { bank: 0.03, dihedral: 0.08, droop: 0.06, ...o }]];

export const MAP = {
  // (s20: the numbers the builder sets/verdor-aerial.js reads - quayX / apronY / terrace / palace / harbourWall / santaMaria / quay)
  quayX: 262, apronY: 2.6,
  terrace: { x0: 230, slope: 0.3, step: 7.5 },          // town + farm ground: flat terraces every 7.5 m up, 25 m apart west of x 230
  harbourWall: [[275, 0, 1440], [340, 0, 1482], [385, 0, 1552], [400, 0, 1630]],   // rooted on the north shore, opening SE
  quay: { from: [262, 0, 1560], to: [262, 0, 1700], faces: 'east', top: 2.8 },
  slipway: { at: [265, 0, 1715], dir: 'east', len: 26 },
  santaMaria: { at: [267, 0, 1590], heading: 0, mastTop: 28 },
  town: { x: [110, 230], z: [1480, 1790] },             // houses: one row per terrace (terrace i flat at y 2.6 + 7.5 i)
  marketStreet: { x: 197, z: [1520, 1740], y: 10.1 },   // in front of the terrace-1 row
  palace: { ground: [60, 58, 1430], chamberOpening: [84, 76, 1430], faces: 'east' },
  terraceFarm: [146, 25.1, 1846],                       // terrace 3, south of the houses
  schoolField: { centre: [120, 36, 1985], size: [120, 70] },
};
// formation times of each X4 shot's first frame (shot list lengths, X4-04/05/07/09 are on the ground but the clock
// runs on through them so the aerials stay continuous)
const T = { 'X4-01': 62, 'X4-02': 69, 'X4-03': 73, 'X4-06': 87, 'X4-08': 95, 'X4-10': 103.5, 'X4-11': 110.5, 'X4-12': 114,
  'X4-13': 118, 'X4-14': 126, 'X4-15': 131, 'X4-16': 135.5, 'X4-17': 141.5, 'X4-18': 143.5, 'X4-19': 151.5, 'X4-20': 155 };

export default {
  set: 'VERDOR_AERIAL',
  cast: {
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
    charcoal: { kind: 'creature', id: 'charcoal' },
    remiR: { kind: 'human', id: 'remi_ride', ride: 'charcoal', outfit: 'remi', role: 'REMI' },
    abbyR: { kind: 'human', id: 'abby_ride', ride: 'leaf', outfit: 'abby', role: 'ABBY' },
    farmer: { kind: 'human', id: 'crowd05' },                         // X4-06 (perf s11 lean-on-a-hoe)
  },
  map: MAP,
  shots: {
    'X4-01': {
      staging: 'EXTREME WIDE: 24 mm (s21; was 180 mm) from a camera ship high and inland over the north shore, slow travel: the coast bends, the harbour opens below - curved wall, pale quay, boats on the slipway, nets on frames; the pair enter LEFT, Leaf near/behind, Charcoal right/ahead.',
      // (s21: the 180 mm frame from here held ~60 m - only the breakwater's end and sea, no pair. Now 24 mm, aim
      // bearing ~42 deg south of east / 23 deg down (r2 still at 40 / 17 was mostly open sea, the harbour cut at the
      // bottom right): the pair enter at the left edge, the harbour + town lower centre-right. NOT RE-STILLED at 45 / 23.)
      cam: { rig: 'follow', pos: [[0, [120, 160, 1200]], [7, [150, 160, 1300], 'linear']], look: [[0, [402, 0, 1454]], [7, [432, 0, 1554], 'linear']], mm: 24, fstop: 8, focus: 'leaf.chest' },
      cast: { leaf: { tack: true, ...inForm(505, 62, 0, T['X4-01'], 7, { dx: -40 }), acts: LEAF_FLY() }, charcoal: { tack: true, ...inForm(535, 60, 16, T['X4-01'], 7, { dx: -40 }), acts: CHAR_FLY() }, abbyR: {}, remiR: {} },
    },
    'X4-02': {
      staging: 'WIDE: 70 mm (s21; was 150) air-to-air from inland: Leaf drops to ~14 m and flies along the harbour wall (wall in the foreground, the bay beyond), wingtip shadow on the stones.',
      // (s21 still @0.5: Leaf + Abby read, but only sea behind - she was still 27 m up, 26 m outside the wall, and a
      // 150 mm frame 12 m above her cannot reach the wall top. NOT RE-STILLED: she now drops early and skims ~7 m
      // outside the wall, the lens 2 m above her at 70 mm with her in the upper third, so the wall top runs along the
      // frame bottom. Still it before the video.)
      cam: { rig: 'follow', frame: { subjects: [['leaf.chest', [0, 0.3]]], from: 270, dist: 110, rise: 2, track: true }, mm: 70, fstop: 5.6, focus: 'leaf.chest' },
      cast: { leaf: { tack: true, root: [[0, [362, 40, 1500]], [1.5, [372, 16, 1525], 'inOut'], [4, [395, 14, 1562], 'linear']], yawKeys: 155, acts: LEAF_FLY() }, abbyR: {} },
    },
    'X4-03': {
      staging: 'LOW STATIC 24 mm at the town roofs (s21 restage: a 35 mm frame cannot hold roofs, quay and a high dragon): from the terrace-2 street just over the terrace-1 ridges, looking east-north-east down the slope - roofs in the foreground, the quay apron and the Santa Maria beyond, the breakwater and the sea; Charcoal crosses high over the harbour (top, left to right) and his shadow slides over the apron toward the town.',
      cam: { rig: 'static', pos: [178, 25, 1640], look: [300, 9.5, 1580], mm: 24, fstop: 8, focus: [300, 9.5, 1580] },
      // (s18: shot list sound = "Deep slow beats overhead." -> he BEATS (CHAR_FLY, one beat / 1.6 s), not a glide: the
      // beats are what sells "he stays high and heavy" in a 35 mm wide where he is small; a beating shadow reads too.
      // SOUND: wingbeat at 0.16 s then every 1.6 s (0.16 / 1.76 / 3.36) - the 1C convention, CHAR_HZ unchanged.)
      cast: { charcoal: { tack: true, root: [[0, [330, 36, 1560]], [4, [322, 36, 1624], 'linear']], yawKeys: 185, acts: CHAR_FLY() }, remiR: {} },
      notes: 'the shadow lands ~100 m west of him (sun 102/31): check it crosses the quay at 0.3-0.6 of the shot; Charcoal beats (shot list sound: deep slow beats overhead)',
    },
    'X4-06': {
      staging: '50 mm STATIC on the terrace farm: a farmer (a woman) rests on a hoe (foreground left, back three-quarter, face turned away), watches the riders pass high over the town (background right), unimpressed.',
      // (s21: camera ~10.7 m behind-left of her on terrace 3 (ground ~25.1), aim bearing 45 / 2 deg DOWN (super35 50 mm
      // holds only +-8 deg vertically): she sits ~7.6 deg left of centre, feet to head ~-7..+2 deg; the pair lowered to
      // y 32-34 over the harbour (s21 still: Charcoal at y 40 broke the top edge) so they sit ~3 deg above centre; she faces
      // NORTH ([146, 1790]: ~35 deg left of the lens axis) so the hoe and hands in front of her read in back three-quarter.
      // The farmer (crowd05) is a WOMAN (humans look 2j). s23: Charcoal's upstroke wingtips broke the TOP edge at 0.6 ->
      // he flies further out on the same bearing and lower (root [344, 28, 1668] -> [347, 28, 1716], ~255 m): previs
      // (0.64, 0.35) at 0.6, still inside at 0.95; Leaf unchanged (0.30, 0.54).)
      cam: { rig: 'static', pos: [140, 26.8, 1852], look: [317, 18, 1675], mm: 50, fstop: 5.6, focus: 'farmer.head' },
      set: { shadowAt: [200, 25, 1780], shadowExtent: 160 },
      cast: {
        farmer: { at: [146.5, 1843.5], face: [146, 1790], acts: [[0, 'lean', { to: 0.6, dur: 0.01 }], [0, 'gesture', { name: 'tool', prop: 'hoe', stance: 'R' }], [0.5, 'look', { at: 'leaf.chest', amount: 0.7 }]] },
        leaf: { tack: true, root: [[0, [300, 34, 1680]], [3, [303, 34, 1728], 'linear']], yawKeys: 177, acts: LEAF_FLY() },
        charcoal: { tack: true, root: [[0, [344, 28, 1668]], [3, [347, 28, 1716], 'linear']], yawKeys: 177, acts: CHAR_FLY() },
        abbyR: {}, remiR: {},
      },
      notes: 'perf s11 acts (humans/PROGRESS.md); hoe = humans tools.js stand-in until props has a real one',
    },
    'X4-11': {
      staging: 'WIDE 85 mm (s23; s21 100, was 160) from inland: Leaf climbs back to Charcoal\'s level on his usual side (inland, a little behind), near enough for talk.',
      // (s21 still: at 160 mm Charcoal filled the top and broke the edge, Leaf a sliver bottom left. s22 still (100 mm,
      // camera y 120): Charcoal still clipped at the TOP, Leaf low - the high camera stacked them (he is 40 m further).
      // s23: camera down to y 95-97 (sea still fills the top: ~2 deg down at the frame top), 85 mm, Leaf's climb 47 -> 58
      // (was 34 -> 61), Charcoal 58, look keyed on the pair's midpoint + a little: previs heads Leaf (-0.19, -0.41) ->
      // (0.03, -0.20) -> (-0.02, -0.13), Charcoal (0.24, 0.17) -> (0.24, 0.06).)
      cam: { rig: 'follow', pos: [[0, [120, 95, 1690]], [3.5, [128, 97, 1746], 'linear']], look: [[0, [461, 57, 1708]], [1.75, [466.5, 59, 1736], 'linear'], [3.5, [472, 61, 1764], 'linear']], mm: 85, fstop: 8, focus: 'leaf.chest' },
      cast: { leaf: { tack: true, root: [[0, [440, 47, 1700]], [3.5, [452, 58, 1756], 'inOut']], yawKeys: 172, acts: LEAF_FLY() }, charcoal: { tack: true, root: [[0, [482, 58, 1716]], [3.5, [492, 58, 1772], 'linear']], yawKeys: 172, acts: CHAR_FLY() }, abbyR: {}, remiR: {} },
    },
    'X4-14': {
      staging: 'AERIAL 35 mm: beyond the town, on its high ground, the palace - weathered pale stone, practical; the birthing chamber\'s high opening a dark shape near the top of the east face.',
      cam: { rig: 'follow', pos: [[0, [330, 95, 1520]], [5, [325, 92, 1480], 'inOut']], look: [[0, [70, 70, 1430]], [5, [70, 70, 1430], 'inOut']], mm: 35, fstop: 8, focus: [70, 70, 1430] },
      notes: 'builder: architecture/verdor.js palace() at MAP.palace.ground, lod far; chamber opening = interiors.birthingChamber window aligned east',
    },
    'X4-20': {
      staging: 'EXTREME WIDE 160 mm aerial travel from ~700 m behind / inland (s21: on the line from the outer rocks through the pair, so both read in one long-lens frame): they leave the harbour behind and follow the coast SSE toward its far end, Charcoal left (seaward), Leaf right; the outer rocks small near the horizon right.',
      cam: { rig: 'follow', pos: [[0, [45, 110, 1686]], [5, [73, 110, 1761], 'linear']], look: [[0, [357, 63.5, 2313]], [5, [385, 63.5, 2388], 'linear']], mm: 160, fstop: 8, focus: 'leaf.chest' },
      // (s23: Charcoal's left wingtip broke the LEFT edge on upstrokes -> 9 m toward Leaf across the lens axis: previs
      // x -0.62 -> -0.42. Length stays exactly 5 s (score sync).)
      cast: { leaf: { tack: true, root: [[0, [361, 55, 2302]], [5, [389, 55, 2378], 'linear']], yawKeys: 160, acts: LEAF_FLY() }, charcoal: { tack: true, root: [[0, [384, 57, 2312]], [5, [412, 57, 2388], 'linear']], yawKeys: 160, acts: CHAR_FLY() }, abbyR: {}, remiR: {} },
      notes: 'outer rocks: nature/rocks kit stacks at [700, 0, 3200] (X6 continuity: two stacks leaning close, mist on the seaward side)',
    },
  },
  // NOT WIRED yet (build-shots reads only `shots`): these stay slates in edl-1C until each is checked in previs /
  // stills and its requests are met; move an entry up into `shots` to wire it.
  plans: {
    'X4-08': {
      staging: 'MEDIUM 120 mm air-to-air off Leaf\'s right: Leaf gives a quick bright call (mouth open, head up); hold; the quay dragon\'s answer is OFF (sound). Charcoal does not call.',
      cam: { rig: 'follow', frame: { subjects: [['leaf.head', [-0.1, 0.1]]], from: 250, dist: 26, rise: 2, track: true }, mm: 120, fstop: 4, focus: 'leaf.head' },
      cast: { leaf: { tack: true, root: [[0, [360, 22, 1600]], [3.5, [355, 24, 1655], 'linear']], yawKeys: 185, acts: [[0, 'flight', { corr: 1 }], [0.8, 'flight', { corr: 1, call: 1 }], [1.6, 'flight', { corr: 1 }]] }, abbyR: {} },
      notes: 'REQUEST creatures: a `call` channel (jaw open + neck lift) in flight if `bite`/`roar` cannot be layered on flight',
    },
    'X4-10': {
      staging: '50 mm air-to-air past the Santa Maria\'s mainmast: Leaf passes close beside it, the LOOKOUT at the masthead ducks, then laughs and waves; Abby waves back with her LEFT hand (her right stays on the grip bar). Line X4-01 (Abby).',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.15, 0.05]], ['lookout.head', [0.3, 0]]], from: 225, dist: 14, rise: 1.5, track: true }, mm: 50, fstop: 5.6, focus: 'abbyR.head' },
      cast: {
        leaf: { tack: true, root: [[0, [282, 30, 1545]], [7, [290, 32, 1655], 'linear']], yawKeys: 182, acts: LEAF_FLY() },
        abbyR: { acts: [[2.6, 'gesture', { name: 'wave', hand: 'L' }]] },
        lookout: { kind: 'human', id: 'sailor1', mark: 'santaMaria.masthead', acts: [[1.2, 'duck'], [2.4, 'gesture', { name: 'wave', hand: 'R' }]] },
      },
      notes: 'mast clearance: Leaf\'s right wingtip must stay >= 4 m from the mast at the beat\'s full extension (check every 6th frame)',
    },
    'X4-12': {
      staging: 'MEDIUM 50 mm on Abby (Remi\'s line X4-02 "They wave at you." OFF/over): she pretends not to hear and pats Leaf\'s neck; face three-quarter.',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.1, 0.15]], ['abbyR.hand.R', [0.15, -0.3]]], from: 215, dist: 4.5, rise: 0.6, track: true }, mm: 50, fstop: 4, focus: 'abbyR.head' },
      cast: { leaf: { tack: true, ...inForm(452, 62, 0, T['X4-12'], 4, { heading: 172 }), acts: LEAF_FLY() }, abbyR: { acts: [[1.4, 'gesture', { name: 'pat', target: 'leaf.neck', hand: 'R' }]] } },
      notes: 'wing-sweep rule (1C-16 lesson): at dist 4.5 from 215 the lens may be inside the right wing\'s sweep - previs every beat phase',
    },
    'X4-13': {
      staging: 'AERIAL 35 mm looking down on the school field from ~90 m: young riders on small dragons, an INSTRUCTOR; one wobbling takeoff, one rider clinging on with both arms; the pair\'s shadows cross the field.',
      cam: { rig: 'follow', pos: [[0, [170, 130, 1900]], [8, [180, 130, 1990], 'linear']], look: [[0, [190, 38, 1950]], [8, [195, 38, 1985], 'linear']], mm: 35, fstop: 8, focus: [190, 38, 1960] },
      notes: 'cast: 3-4 small dragons (scout / grown-hatchling presets, low stance), 4 young riders (crowd kit, teen builds - NO child content beyond riding lessons), 1 instructor; acts: takeoff (wobble), sit, walk',
    },
    'X4-15': {
      staging: 'POV 300 mm-equivalent from Remi\'s eyeline: Alexandria standing in the chamber opening, watching them pass (face too small to need lip-sync; still, unreadable); REVERSE 85 mm on Remi lifting a hand.',
      cam: { rig: 'follow', pos: [[0, 'remiR.head']], look: [[0, MAP.palace.chamberOpening]], mm: 300, fstop: 5.6, focus: MAP.palace.chamberOpening },
      notes: 'two set-ups in one shot id: split into X4-15a (POV 0-2.5 s) / X4-15b (reverse 2.5-4.5 s) via a camera cut key at 2.5 s; Alexandria: humans id alexandria, stand, hands folded',
    },
    'X4-16': {
      staging: 'MEDIUM 50 mm off Charcoal\'s right: Remi looks down over the town longer than he needs to - roofs, harbour, people working; face three-quarter AWAY (down-left).',
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.3, 0.1]]], from: 200, dist: 16, rise: 3, track: true }, mm: 50, fstop: 4, focus: 'remiR.head' },
      cast: { charcoal: { tack: true, root: [[0, [300, 62, 1760]], [6, [318, 62, 1854], 'linear']], yawKeys: 170, acts: CHAR_GLIDE({ droop: 0.16 }) }, remiR: { acts: [[0, 'look', { at: [200, 10, 1700], amount: 0.9 }]] } },
    },
    'X4-17': {
      staging: 'CLOSE 85 mm on Abby: she watches him doing it (looks screen RIGHT toward Remi). Silent.',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.15, 0.1]]], from: 215, dist: 5.5, rise: 0.4, track: true }, mm: 85, fstop: 4, focus: 'abbyR.head' },
      cast: { leaf: { tack: true, root: [[0, [270, 62, 1800]], [2, [275, 62, 1832], 'linear']], yawKeys: 170, acts: LEAF_FLY() }, abbyR: { acts: [[0, 'look', { at: 'remiR.head', amount: 0.8 }]] } },
    },
    'X4-18': {
      staging: 'TWO-SHOT 180 mm air-to-air from inland: the exchange X4-03..X4-07 ("You\'re doing it again." ... "You\'re counting something."); Leaf left/near, Charcoal right; the roofs drop away below.',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.35, 0]], ['remiR.head', [0.3, 0.05]]], from: 262, dist: 180, rise: 18, track: true }, mm: 180, fstop: 5.6, focus: 'abbyR.head' },
      notes: 'formation TALK as 1C (Leaf 16 m behind Charcoal\'s centre, 30 m lateral); lines placed by build-shots from takes',
    },
    'X4-19': {
      staging: 'CLOSE 85 mm on Remi: he does not answer; looks away from the town toward the sea (screen right), like someone caught.',
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.2, 0.1]]], from: 205, dist: 7, rise: 0.8, track: true }, mm: 85, fstop: 4, focus: 'remiR.head' },
      notes: 'remiR look: [0] at town (down-left) -> [1.2] at sea (east), blend 0.6',
    },
  },
};
