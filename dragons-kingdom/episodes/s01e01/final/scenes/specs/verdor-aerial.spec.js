// Shot specs - VERDOR_AERIAL: scene 1C, X4-01 .. X4-20 minus the ground shots. Session 17: first-pass plan; session
// 20: WIRED - registry entry + builder scenes/lib/director/sets/verdor-aerial.js (it reads `map` below). Only the shots
// in `shots` are wired (X4-01/02/03/06/11/14/20); the rest wait in `plans` (requests / dialogue / previs pending).
// NOTE (s20): the MAP numbers below supersede the s17 prose where they differ (harbour wall rooted at [275, 1440],
// Santa Maria at x 267, terraced town: ground = 2.6 + 7.5 * terrace index, terraces 25 m apart west of x 230).
//
// The ground-level X4 shots (X4-04, X4-05, X4-07, X4-09) are set VERDOR_HARBOR (s31: specs/verdor-harbor.spec.js +
// sets/verdor-harbor.js, a wrapper over this builder); they import the SAME map below so the layout matches across the cut.
// (s30 wired X4-08/12/16-19, s31 X4-13 + X4-15; X4-10 is still in `plans`.)
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
// (s30) straight flight + the talking formation on any heading, and the sun's shadow box on a flyer
const D2R = Math.PI / 180;
function fly(p0, h, v, dur, dy = 0) {
  const dx = Math.sin(h * D2R) * v * dur, dz = -Math.cos(h * D2R) * v * dur;
  return { root: [[0, p0], [dur, [p0[0] + dx, p0[1] + dy, p0[2] + dz], 'linear']], yawKeys: h };
}
/** Leaf at p on heading h; Charcoal `lat` m to her LEFT (seaward when heading south), `lead` m ahead, 2 m lower (1C TALK) */
function pair(p, h, dur, o = {}) {
  const f = [Math.sin(h * D2R), -Math.cos(h * D2R)], l = [-Math.cos(h * D2R), -Math.sin(h * D2R)];
  const lat = o.lat ?? 30, lead = o.lead ?? 16;
  const c0 = [p[0] + l[0] * lat + f[0] * lead, p[1] + (o.cdy ?? -2), p[2] + l[1] * lat + f[1] * lead];
  return { leaf: fly(p, h, o.v ?? V, dur, o.dy || 0), charcoal: fly(c0, h, o.v ?? V, dur, o.dy || 0) };
}
/** shadow-box centre for a flyer at p (sun 102 / 31: the box's axis through p meets y 20 here) */
const SH = (p) => [p[0] - 1.86 * (p[1] - 20), 20, p[2] - 0.394 * (p[1] - 20)];
const shTrack = (fl) => fl.root.map(([t, p, e]) => (e ? [t, SH(p), e] : [t, SH(p)]));
const posAt = (fl, t) => { const [[t0, a], [t1, b]] = fl.root; const k = (t - t0) / (t1 - t0); return a.map((v, i) => v + (b[i] - v) * k); };
// (s30) X4-16..19 formation over the town's south end, heading 170 (after X4-14 / 15 they cross back inland)
const X4P = {
  'X4-16': pair([196, 66, 1690], 170, 6),            // over the town: Charcoal on the terrace-1 roofs' line (x ~228)
  'X4-17': pair([270, 64, 1800], 170, 2),
  'X4-18': pair([272, 64, 1840], 170, 8),
  'X4-19': pair([290, 64, 1975], 170, 3.5),
};
const X4_10 = { root: [[0, [257, 30, 1545]], [7, [259, 31, 1657], 'linear']], yawKeys: 179 };
const X4_12 = fly([454, 58, 1770], 172, V, 4);
const X4_08 = { root: [[0, [360, 22, 1600]], [3.5, [355, 24, 1655], 'linear']], yawKeys: 185 };

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
    // (s31) X4-13 the riding school: small young dragons (Leaf's design, smaller, the 'scout' slate look - the only
    // non-hero look the creatures library has), one student rider (scout_ride: the only free seated build - REQUEST
    // young seated builds), a young student standing by (crowd13), the instructor (crowd12, adult)
    young1: { kind: 'creature', id: { name: 'young1', design: 'leaf', L: 5.2, look: 'scout', flapHz: 1.0, flapAmp: 0.9, scaleMul: 0.66, seatBack: 0.3, limbScaleMul: 0.8 }, quality: 'draft', length: 5.2 },
    young2: { kind: 'creature', id: { name: 'young2', design: 'leaf', L: 4.6, look: 'scout', flapHz: 1.0, flapAmp: 0.9, scaleMul: 0.66, seatBack: 0.3, limbScaleMul: 0.8 }, quality: 'draft', length: 4.6 },
    young3: { kind: 'creature', id: { name: 'young3', design: 'leaf', L: 4.9, look: 'scout', flapHz: 1.0, flapAmp: 0.9, scaleMul: 0.66, seatBack: 0.3, limbScaleMul: 0.8 }, quality: 'draft', length: 4.9 },
    student: { kind: 'human', id: 'scout_ride', ride: { on: 'young1', lean: 0.6 }, outfit: 'scout' },
    student2: { kind: 'human', id: 'crowd13' },
    instructor: { kind: 'human', id: 'crowd12' },
    alexandria: { kind: 'human', id: 'alexandria' },                // (s31) X4-15: in the chamber's opening
  },
  map: MAP,
  shots: {
    'X4-01': {
      staging: 'EXTREME WIDE: 24 mm (s21; was 180 mm) from a camera ship high and inland over the north shore, slow travel: the coast bends, the harbour opens below - curved wall, pale quay, boats on the slipway, nets on frames; the pair enter LEFT, Leaf near/behind, Charcoal right/ahead.',
      // (s21: the 180 mm frame from here held ~60 m - only the breakwater's end and sea, no pair. Now 24 mm, aim
      // bearing ~42 deg south of east / 23 deg down (r2 still at 40 / 17 was mostly open sea, the harbour cut at the
      // bottom right): the pair enter at the left edge, the harbour + town lower centre-right. NOT RE-STILLED at 45 / 23.)
      // (s26: s24 still @0.5 was still mostly open sea, the town at the right edge. The camera ship now stands further
      // back (NW) and 15 m higher, aimed ~55 deg south of east and panning right with the pair: the breakwater + quay
      // centre-right (quay x ~0.5 at 0.5), the town's east edge at the right, the pair at the left (x -0.9 -> -0.8).)
      cam: { rig: 'follow', pos: [[0, [90, 175, 1060]], [7, [115, 175, 1150], 'linear']], look: [[0, [380, 0, 1480]], [7, [375, 0, 1590], 'linear']], mm: 24, fstop: 8, focus: 'leaf.chest' },
      cast: { leaf: { tack: true, ...inForm(505, 62, 0, T['X4-01'], 7, { dx: -40 }), acts: LEAF_FLY() }, charcoal: { tack: true, ...inForm(535, 60, 16, T['X4-01'], 7, { dx: -40 }), acts: CHAR_FLY() }, abbyR: {}, remiR: {} },
    },
    'X4-02': {
      staging: 'WIDE: 70 mm (s21; was 150) air-to-air from inland: Leaf drops to ~12 m (s24; was 14) and flies along the harbour wall (wall in the foreground, the bay beyond), wingtip shadow on the stones.',
      // (s21 still @0.5: Leaf + Abby read, but only sea behind - she was still 27 m up, 26 m outside the wall, and a
      // 150 mm frame 12 m above her cannot reach the wall top. NOT RE-STILLED: she now drops early and skims ~7 m
      // outside the wall, the lens 2 m above her at 70 mm with her in the upper third, so the wall top runs along the
      // frame bottom. Still it before the video.)
      // s24 (s22 still: the wall only a sliver at the bottom edge - Leaf ~12 m over the wall top = 6.7 deg below her at
      // 104 m, the 70 mm frame holds +-5.7): she skims LOWER (16/14 -> 13/11 m: ~8 m over the parapet) and the lens sits
      // level with her (rise 2 -> 0) aimed further down (Leaf at frame y 0.3 -> 0.35): the parapet ~-0.45, wall top ~-0.55.
      cam: { rig: 'follow', frame: { subjects: [['leaf.chest', [0, 0.35]]], from: 270, dist: 110, rise: 0, track: true }, mm: 70, fstop: 5.6, focus: 'leaf.chest' },
      cast: { leaf: { tack: true, root: [[0, [362, 40, 1500]], [1.5, [372, 13, 1525], 'inOut'], [4, [395, 11, 1562], 'linear']], yawKeys: 155, acts: LEAF_FLY() }, abbyR: {} },
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
      staging: '35 mm STATIC on the terrace farm (s24; was 50): a farmer (a woman) rests on a hoe (foreground left, back three-quarter, face turned away), the town\'s upper rows behind her, watches the riders pass high over the town (background right), unimpressed.',
      // (s21: camera ~10.7 m behind-left of her on terrace 3 (ground ~25.1), aim bearing 45 / 2 deg DOWN (super35 50 mm
      // holds only +-8 deg vertically): she sits ~7.6 deg left of centre, feet to head ~-7..+2 deg; the pair lowered to
      // y 32-34 over the harbour (s21 still: Charcoal at y 40 broke the top edge) so they sit ~3 deg above centre; she faces
      // NORTH ([146, 1790]: ~35 deg left of the lens axis) so the hoe and hands in front of her read in back three-quarter.
      // The farmer (crowd05) is a WOMAN (humans look 2j). s23: Charcoal's upstroke wingtips broke the TOP edge at 0.6 ->
      // he flies further out on the same bearing and lower (root [344, 28, 1668] -> [347, 28, 1716], ~255 m): previs
      // (0.64, 0.35) at 0.6, still inside at 0.95; Leaf unchanged (0.30, 0.54).)
      // s24 RE-BLOCK for the town behind her: from the old bearing (45) the town lay 15-40 deg LEFT and below the terrace-3
      // edge (eye level hides rows 0-2). Now the lens looks NNE (bearing 12, 2 deg down) along terrace 3 at 35 mm: the
      // terrace-3 house row recedes behind her, row 4 upper left, row 2 roofs over the edge; the pair pass high over the
      // town (staging: 'background right') at ~160-235 m, Leaf (bearing ~22) inland of Charcoal (~26), ~4-5 deg up.
      // She stands at bearing 4 / 11 m. s24 r1 still: town reads, but the hoe hid behind her (facing -23 = 35 deg left read
      // as straight back at 35 mm) and Charcoal's right wing broke the top-right corner -> she faces bearing -40 (52 deg
      // left of the axis), Leaf 4 m inland (x 205 -> 201) to keep clear of his left wing. r2 still: hoe shaft reads (thin),
      // Charcoal's right wing STILL broke the top-right corner -> pushed 1.3x further out on the same ray from the lens
      // ([230, 38, 1640] -> [256.7, 41.4, 1575], same 48 m path): same screen spot, ~23 % smaller. NOT RE-STILLED.
      // s27 INLAND LOOP (s26 continuity fix: X4-03 left Charcoal over the harbour basin heading 185; here he was 65 m
      // inland and back north, still heading south): the pair bank in from the harbour side and cross the town heading
      // SOUTH-WEST (yaw 224, right -> left on screen, coming slightly toward the lens): Charcoal [300, 41, 1600] ->
      // [262, 41, 1640], Leaf 50 m behind him on the same line (y 40). The turn itself falls in X4-04/05 (ground). From
      // the s24 lens (bearing 12) the pair sat on / past the right edge (previs x 0.87-1.1), so the lens turns 7 deg
      // right about the camera (bearing 19) and the farmer + her facing turn with it (same screen spot, same back
      // three-quarter): Charcoal x ~0.6 -> 0.5, Leaf ~0.75 -> 0.65. NO phase / tOffset (sound: beats unchanged).
      // s29 (X4-06 video 11-06 showed "no hoe, no lean"): NOT a wiring bug - a debug log in the stage at 0.6 found the
      // gesture overlay 'tool' (w 1, prop 'hoe', stance 'R'), posture lean 0.6, the performance 'gesture' hook registered,
      // the hoe in the scene (base 0.59 m ahead of her root, hands on its top). A red-painted hoe showed WHY it did not
      // read: from the lens (her facing 44 deg off the lens ray) the shaft ran exactly behind her skirt's left edge, only
      // the blade tip showed by her feet. Now she faces bearing -51 (was -33: 62 deg off the lens ray, still back
      // three-quarter, face away) and the hoe stands 0.7 m ahead (gesture ahead 0.6 -> 0.7): the shaft clears her
      // silhouette on the left and the forward lean onto it reads in near-profile.
      cam: { rig: 'static', pos: [141, 26.8, 1856], look: [189.8, 21.6, 1714.2], mm: 35, fstop: 5.6, focus: 'farmer.head' },
      set: { shadowAt: [170, 25, 1760], shadowExtent: 160 },
      cast: {
        farmer: { at: [143.1, 1845.2], face: [100.4, 1810.6], acts: [[0, 'lean', { to: 0.6, dur: 0.01 }], [0, 'gesture', { name: 'tool', prop: 'hoe', stance: 'R', ahead: 0.7 }], [0.5, 'look', { at: 'leaf.chest', amount: 0.7 }]] },
        leaf: { tack: true, root: [[0, [334.4, 40, 1563.7]], [3, [296.4, 40, 1603.7], 'linear']], yawKeys: 224, acts: LEAF_FLY() },
        charcoal: { tack: true, root: [[0, [300, 41, 1600]], [3, [262, 41, 1640], 'linear']], yawKeys: 224, acts: CHAR_FLY() },
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
    // ------------------------------------------------------------------ session 31 (batch 2) ---
    'X4-13': {
      staging: 'AERIAL 35 mm looking down (~60 m) on the riding school on the grass terraces south of the town: the INSTRUCTOR (left) calls; a young dragon makes a wobbling takeoff with its rider clinging on with both arms (lean); another student stands by a crouched young dragon; one young dragon lies down flat in the middle of the lesson and will not move (right). Abby\'s laugh is OFF (sound). No rider named or aged.',
      // (s31: the school is on terrace 3 (flat x ~137-155, y 25.1) at z 1960-1995 - the MAP schoolField centre [120, 36]
      // sits on the narrow terrace-4 flat; terrace 3 is wider. The pair's shadows are NOT staged (plan note) - add
      // Leaf / Charcoal flights with shTrack boxes if wanted.)
      cam: { rig: 'follow', pos: [[0, [174, 86, 1948]], [8, [176, 86, 1986], 'linear']], look: [[0, [146, 25.1, 1970]], [8, [146, 25.1, 1980], 'linear']], mm: 35, fstop: 8, focus: [146, 25.1, 1975] },
      set: { shadowAt: [146, 25.1, 1975], shadowExtent: 45 },
      cast: {
        young1: { tack: true, yawKeys: [[0, 20], [8, 32, 'linear']], root: [[0, [147, 25.1, 1974]], [1.6, [147, 25.1, 1974]], [3.0, [147.6, 28.4, 1971.5], 'inOut'], [4.4, [148.4, 26.6, 1969.6], 'inOut'], [6.2, [149.6, 30.2, 1967], 'inOut'], [8, [151, 32.5, 1964.4], 'inOut']],
          acts: [[0, 'crouch', { k: 0.6 }], [1.2, 'launch', { blend: 0.4 }], [2.4, 'flight', { hz: 1.3, amp: 0.95, blend: 0.4 }], [4.2, 'flight', { hz: 1.6, amp: 1.0, blend: 0.3 }], [5.6, 'flight', { hz: 1.2, amp: 0.9, blend: 0.4 }]] },
        student: {},
        young2: { at: [144.2, 1987.5], face: 300, acts: [[0, 'stand', { breathe: 0.5 }], [1.0, 'lie', { blend: 1.6 }]] },
        young3: { at: [149.5, 1981], face: 250, acts: [[0, 'crouch', { k: 0.7, breathe: 0.5, look: [0.3, 0.1] }]] },
        student2: { at: [147.6, 1982.2], face: 70, look: 'young3.head', lookAmount: 0.6, acts: [[3.0, 'look', { at: 'young1.chest', amount: 0.7, blend: 0.5 }]] },
        instructor: { at: [141.2, 1976.5], face: 80, look: 'young1.chest', lookAmount: 0.8, acts: [[1.4, 'raiseHand', { side: 'R', in: 0.35, hold: 1.2, out: 0.4 }], [5.0, 'point', { side: 'R', at: 'young2.chest', in: 0.4, hold: 1.4, out: 0.5 }], [5.0, 'look', { at: 'young2.chest', amount: 0.7, blend: 0.5 }]] },
      },
      notes: 'young dragons: Leaf design, smaller, scout look (creatures REQUEST: more working / young dragon colours); student = scout_ride clinging (ride lean 0.6); sound: instructor call ~1.5 s, Abby laugh OFF ~5.5 s (young2 lies down)',
    },
    'X4-15': {
      staging: 'POV 300 mm from Remi\'s eyeline (on Charcoal, passing ~67 m east of the palace keep, heading south): Alexandria stands in the chamber\'s high opening on the keep\'s east face, watching them pass - still, unreadable, hands folded; she does not wave. Remi lifts his right hand (his act; the REVERSE on him is not staged - DEVIATION: one POV set-up, no cut inside the shot).',
      // (s31: the opening = the keep's top front window row (architecture palace(): keep 20 x 15 x 24 m at palace-local
      // (0, -6), front = EAST face x ~61.5, windows 1.2 x 2.4 m at 16.5 m over the box base (world y 74.5), centres at
      // z 1430 +-2.5 / +-7.5); MAP.palace.chamberOpening [84, 76, 1430] is 22 m in the air east of the face - not used.)
      cam: { rig: 'follow', pos: [[0, 'remiR.head']], look: [[0, [61.0, 75.7, 1427.5]]], mm: 300, fstop: 5.6, focus: [61.0, 75.7, 1427.5], shake: { kind: 'dragonback', amount: 0.12, seed: 15 } },
      set: { shadowAt: [80, 60, 1430], shadowExtent: 80 },
      cast: {
        charcoal: { tack: true, ...fly([128, 66, 1398], 178, 16, 4.5), acts: CHAR_GLIDE({ droop: 0.1 }) },
        remiR: { acts: [[0, 'look', { at: [61.0, 75.7, 1427.5], amount: 0.9 }], [1.6, 'raiseHand', { side: 'R', in: 0.4, hold: 1.6, out: 0.5 }]] },
        alexandria: { at: [61.0, 1427.5], y: 74.5, face: 90, look: 'remiR.head', lookAmount: 0.7, acts: [[0, 'clasp', { in: 0.01 }]] },
      },
    },
    // ------------------------------------------------------------------ session 30 (batch 1) ---
    'X4-08': {
      staging: 'MEDIUM-WIDE 120 mm air-to-air off Leaf\'s right, a little above: low over the harbour basin, Leaf gives a quick bright call (neck up, jaw open), then back to the line; the quay dragon\'s answer is OFF (sound). Charcoal does not call (not in frame).',
      // (s30: plan dist 26 held only head + neck at 120 mm -> 48 m, rise 8 (looks down onto the basin / wall); the quay
      // dragon is not built yet - its answer stays off screen, sound only)
      cam: { rig: 'follow', frame: { subjects: [['leaf.chest', [-0.05, 0.05]]], from: 250, dist: 48, rise: 8, track: true }, mm: 120, fstop: 5.6, focus: 'leaf.head' },
      set: { shadowAt: shTrack(X4_08), shadowExtent: 60 },
      cast: { leaf: { tack: true, ...X4_08, acts: [[0, 'flight', { corr: 1 }], [0.8, 'flight', { corr: 1, call: 1, blend: 0.25 }], [1.9, 'flight', { corr: 1, blend: 0.5 }]] }, abbyR: {} },
      notes: 'creatures flight `call` channel (r2 s8). Sound: Leaf call 0.9-1.8 s, the quay dragon answers OFF ~2.3 s',
    },
    'X4-12': {
      staging: 'MEDIUM 50 mm on Abby from Leaf\'s right front three-quarter (Remi\'s line X4-02 "They wave at you." OFF / over, he is 30 m away seaward): she pretends not to hear and pats Leaf\'s neck with her right hand; face three-quarter.',
      // (s30: one subject (the 1C-09 lesson: two subjects flip the solve); Remi is OFF - at 50 mm a medium on Abby cannot hold a
      // rider 30 m away; the shot list's 'Remi R' is his voice from screen right. The line plays OFF, so no lip-sync on screen.)
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.12, 0.2]]], from: 222, dist: 4.5, rise: 0.6, track: true }, mm: 50, fstop: 4, focus: 'abbyR.head' },
      set: { shadowAt: shTrack(X4_12), shadowExtent: 40 },
      cast: {
        leaf: { tack: true, ...X4_12, acts: LEAF_FLY() },
        abbyR: { acts: [[0, 'look', { at: [700, 50, 2000], amount: 0.5 }], [1.5, 'touch', { side: 'R', at: 'leaf.neck_2', offset: [0, 0.12, 0], in: 0.35, hold: 0.3, out: 0.25 }], [2.45, 'touch', { side: 'R', at: 'leaf.neck_2', offset: [0, 0.12, 0], in: 0.25, hold: 0.3, out: 0.4 }]] },
      },
      lines: [['X4-02', 0.35]],
    },
    'X4-16': {
      staging: 'MEDIUM 50 mm off Charcoal\'s right front: Remi (screen right) looks down over the town longer than he needs to - roofs, harbour, people working below-left; face three-quarter AWAY (down-left).',
      // (s30 r1 still from 212 over x 298: sea + a bare apron behind him, no town -> the pair moved inland over the town
      // and the lens comes from AHEAD (185), 4 m above him, looking back down: the terrace roofs below / behind him)
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.3, 0.15]]], from: 185, dist: 14, rise: 4, track: true }, mm: 50, fstop: 4, focus: 'remiR.head' },
      set: { shadowAt: shTrack(X4P['X4-16'].charcoal), shadowExtent: 50 },
      cast: { charcoal: { tack: true, ...X4P['X4-16'].charcoal, acts: CHAR_GLIDE({ droop: 0.16 }) }, remiR: { acts: [[0, 'look', { at: [175, 12, 1650], amount: 0.9 }]] } },
    },
    'X4-17': {
      staging: 'CLOSE 85 mm on Abby (screen left) from Leaf\'s right front three-quarter: she watches him doing it - looks screen RIGHT toward Remi. Silent.',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.15, 0.12]]], from: 215, dist: 5.5, rise: 0.4, track: true }, mm: 85, fstop: 4, focus: 'abbyR.head' },
      set: { shadowAt: shTrack(X4P['X4-17'].leaf), shadowExtent: 40 },
      cast: { leaf: { tack: true, ...X4P['X4-17'].leaf, acts: LEAF_FLY() }, abbyR: { acts: [[0, 'look', { at: posAt(X4P['X4-17'].charcoal, 1).map((v, i) => v + (i === 1 ? 3 : 0)), amount: 0.8 }]] } },
    },
    'X4-18': {
      staging: 'TWO-SHOT 180 mm air-to-air from inland: the exchange X4-03..X4-07 ("You\'re doing it again." ... "You\'re counting something."); Leaf / Abby left and near, Charcoal / Remi right and beyond; the sea below and behind them.',
      // (s30: the 1C TALK formation (30 m lateral, Charcoal 16 m ahead) on heading 170; lines from the takes)
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.4, 0]], ['remiR.head', [0.4, 0.08]]], from: 262, dist: 230, rise: 22, track: true }, mm: 180, fstop: 5.6, focus: 'abbyR.head' },
      set: { shadowAt: shTrack(X4P['X4-18'].leaf), shadowExtent: 90 },
      cast: {
        leaf: { tack: true, ...X4P['X4-18'].leaf, acts: LEAF_FLY() },
        charcoal: { tack: true, ...X4P['X4-18'].charcoal, acts: CHAR_GLIDE() },
        abbyR: { acts: [[0, 'look', { at: 'remiR.head', amount: 0.8 }]] },
        remiR: { acts: [[0, 'look', { at: [210, 12, 1800], amount: 0.8 }], [5.2, 'look', { at: 'abbyR.head', amount: 0.6, blend: 0.5 }]] },
      },
      lines: [['X4-03', 0.5], ['X4-04', 0.35], ['X4-05', 0.3], ['X4-06', 0.35], ['X4-07', 0.35]],
    },
    'X4-19': {
      staging: 'CLOSE 85 mm on Remi (screen right) from Charcoal\'s right front: he does not answer; looks away from the town (down-left) toward the sea (screen right), like someone caught.',
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.2, 0.1]]], from: 205, dist: 7, rise: 0.8, track: true }, mm: 85, fstop: 4, focus: 'remiR.head' },
      set: { shadowAt: shTrack(X4P['X4-19'].charcoal), shadowExtent: 40 },
      cast: { charcoal: { tack: true, ...X4P['X4-19'].charcoal, acts: CHAR_GLIDE({ droop: 0.16 }) }, remiR: { acts: [[0, 'look', { at: [180, 10, 1760], amount: 0.8 }], [1.2, 'look', { at: [800, 40, 2100], amount: 0.8, blend: 0.6 }]] } },
    },
  },
  // NOT WIRED yet (build-shots reads only `shots`): these stay slates in edl-1C until each is checked in previs /
  // stills and its requests are met; move an entry up into `shots` to wire it.
  plans: {
    'X4-10': {
      staging: '50 mm air-to-air from inland past the Santa Maria\'s mainmast: Leaf passes close beside it on its inland side, the LOOKOUT high on the mast (beyond her, right) ducks, then laughs and waves; Abby waves back with her LEFT hand (her right stays on the grip bar). Line X4-01 (Abby).',
      // (s30 NOT DONE - r2 still @0.35: no mast in frame (the 50 mm frame at Leaf's height 30 m cuts at ~24 m, the ship's
      // rig is lower / behind her) and Abby hidden by the upstroke. NEXT: Leaf ~20 m, lens 4 m above her, Abby [-0.3, 0.2];
      // measure the mainmast (x, z, top) from the santa-maria model first; the lookout needs a cast entry
      // `lookout: { kind: 'human', id: 'crowd08' }` and a top platform under him.)
      // (s30: Leaf passes 10 m INLAND of the mast (x 257) so the mast and the lookout stand BEYOND her from an inland
      // camera - the flight line stays L -> R and nothing crosses in front of Abby; the mast is ahead (screen right)
      // until ~2.8 s, then slides behind her. Lookout: crowd08 at the masthead mark, y 22 (a guess at the main top -
      // check the still); if there is no platform there he floats: then cut him and log the request)
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.3, 0.0]]], from: 252, dist: 30, rise: 1.5, track: true }, mm: 50, fstop: 5.6, focus: 'abbyR.head' },
      set: { shadowAt: shTrack(X4_10), shadowExtent: 60 },
      cast: {
        leaf: { tack: true, ...X4_10, acts: LEAF_FLY() },
        abbyR: { acts: [[3.2, 'wave', { side: 'L', in: 0.3, hold: 1.3, out: 0.4 }]] },
        lookout: { at: [MAP.santaMaria.at[0], MAP.santaMaria.at[2]], y: 22, face: 270, acts: [[1.4, 'crouch', { dur: 1.2 }], [2.9, 'wave', { side: 'R', in: 0.3, hold: 1.6, out: 0.4 }]] },
      },
      lines: [['X4-01', { at: 4.6 }]],
    },
  },
};
