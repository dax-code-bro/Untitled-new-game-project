// Shot specs - VERDOR_HARBOR: scene 1C at quay level (X4-04, X4-05, X4-07, X4-09). Session 31: first wiring.
// Builder: scenes/lib/director/sets/verdor-harbor.js = VERDOR_AERIAL's whole town / harbour / Santa Maria (built from
// the SAME map: the verdor-aerial spec's MAP, imported below) + quay-level dressing (bollards, slipway, boats, the
// hauled net, fish baskets, market stalls). Positions: VERDOR frame (+x east = the sea, -z north, y up, metres).
//   quay      face x 262, z 1560-1700, paving top 2.8 (the apron behind it ~x 254-262)
//   slipway   head [262, 2.75, 1715] running down EAST 26 m to its foot under the water (8 m wide, z 1711-1719)
//   ship      the Santa Maria at [267, 0, 1590], bow north, hull ~22 m (z ~1579-1601), mainmast top ~28 m
//   market    terrace-1 street x ~197-205 (ground ~10.1), stalls on its east side (x ~203), houses on the west
// Sun 1C (sunDir(102, 31)): a flyer's shadow lands 1.63 h WEST and 0.35 h NORTH of him (h = height over the ground).
// CAST NOTES: the working dragons are Leaf-sized builds in the creatures library's 'scout' look (slate grey) - the
// library has no other working-dragon colours yet (REQUEST in creatures/PROGRESS.md). Charcoal (X4-07) is NOT cast: his
// shadow is the 'shadow-pass' FX on his line. Crew / market extras are adults only (characters.py ages >= 0.33).
import { MAP as AMAP } from './verdor-aerial.spec.js';

const CHAR_HZ = 0.625;                                     // the 1C beat (one beat / 1.6 s: sound spots)
const CHAR_FLY = (o = {}) => [[0, 'flight', { hz: CHAR_HZ, amp: 0.68, ...o }]];
const D2R = Math.PI / 180;
function fly(p0, h, v, dur, dy = 0) {
  const dx = Math.sin(h * D2R) * v * dur, dz = -Math.cos(h * D2R) * v * dur;
  return { root: [[0, p0], [dur, [p0[0] + dx, p0[1] + dy, p0[2] + dz], 'linear']], yawKeys: h };
}
/** the sun's shadow of a flyer at p on ground height g (sun 102 / 31) */
const shadowOf = (p, g) => [p[0] - 1.627 * (p[1] - g), g, p[2] - 0.346 * (p[1] - g)];
const shTrack = (fl, g) => fl.root.map(([t, p, e]) => (e ? [t, shadowOf(p, g), e] : [t, shadowOf(p, g)]));

export const MAP = {
  ...AMAP,
  slipway: { at: [265, 0, 1715], dir: 'east', len: 26, width: 8, top: 2.75, toe: -1.6 },
  harbor: {
    catch: [[251.6, 1660.4], [252.4, 1658.6], [258.6, 1667.2], [259.4, 1665.2], [258.7, 1663.1]],   // X4-04 baskets
    heap: [251.2, 1662.2],                                                                            // the fish being sorted
    stalls: [[203.2, 1618], [203.0, 1627.5], [203.4, 1637], [203.1, 1646.5], [203.3, 1656], [198.6, 1641.5]],
    hauled: [[[256.5, 1722.5], 200], [[257.5, 1729], 165]],
    dryNet: [[252, 1735], [252, 1743]],
    crates: [[257.8, 1652], [256.9, 1650.5], [258.1, 1640.5]],          // (s31 r1: the two by the X4-04 lens blocked the frame)
    street: { x: [196.8, 205.6], z: [1596, 1700] },                     // market street paving (terrace 1)
  },
};

// X4-07: Charcoal continues X4-06's inland loop (X4-06 ends [262, 41, 1640] heading 224): 13 m/s, his shadow
// crosses the terrace-1 street (ground ~10.1) at ~2.7 s, z ~1641, from screen right to left
const X4_07 = fly([276, 41, 1626], 224, 13, 5);
const STREET = 10.1;
/** where Charcoal is at t (people glance up at him) */
const UP = (t) => { const [[, a], [, b]] = X4_07.root; const k = t / 5; return a.map((v, i) => v + (b[i] - v) * k); };

export default {
  set: 'VERDOR_HARBOR',
  map: MAP,
  cast: {
    workDragon: { kind: 'creature', id: 'leaf', opts: { look: 'scout' }, length: 9 },
    netDragon: { kind: 'creature', id: { name: 'netDragon', design: 'leaf', L: 7.0, look: 'scout', flapHz: 0.8, flapAmp: 0.92, scaleMul: 0.66, seatBack: 0.38, limbScaleMul: 0.8 }, length: 7 },
    crewA: { kind: 'human', id: 'sailor2' },
    crewB: { kind: 'human', id: 'crowd02' },
    crewC: { kind: 'human', id: 'crowd09' },
    crewD: { kind: 'human', id: 'sailor1' },
    crewE: { kind: 'human', id: 'crowd04' },
    boatman1: { kind: 'human', id: 'crowd16', parent: 'boatA' },
    boatman2: { kind: 'human', id: 'crowd12', parent: 'boatB' },
    vendor: { kind: 'human', id: 'vendor' },
    m1: { kind: 'human', id: 'crowd01' },
    m2: { kind: 'human', id: 'crowd03' },
    m3: { kind: 'human', id: 'crowd06' },
    m4: { kind: 'human', id: 'crowd11' },
    m5: { kind: 'human', id: 'crowd14' },
  },
  shots: {
    'X4-09': {
      staging: 'WIDE 35 mm slow aerial pass from over the basin (camera ship ~20 m up, ~60 m out): the Santa Maria moored at the quay, sails furled on the yards, the town terraces rising behind; crew at work on the quay by her side. Name not held on.',
      cam: { rig: 'follow', pos: [[0, [322, 19, 1634]], [5, [327, 19, 1604], 'linear']], look: [[0, [266, 11, 1593]], [5, [266, 11, 1588], 'linear']], mm: 35, fstop: 8, focus: [267, 6, 1590] },
      set: { shadowAt: [266, 3, 1592], shadowExtent: 45 },
      cast: {
        crewD: { at: [258.8, 1604], face: 0, legs: 'planted', acts: [[0, 'walk', { to: [259.2, 1588], speed: 1.3 }]] },
        crewA: { at: [259.6, 1581.5], face: 90, look: [267, 12, 1588], lookAmount: 0.5, acts: [[0.5, 'reach', { side: 'R', at: [260.6, 3.2, 1581.5], in: 0.5, hold: 2, out: 0.5 }]] },
        crewE: { at: [258.2, 1575.5], face: 175, legs: 'planted', acts: [[0.4, 'walk', { to: [257.6, 1590], speed: 1.1 }]] },
      },
    },
    'X4-07': {
      staging: 'WIDE 35 mm STATIC at street level in the market street (terrace 1), looking north along the stalls: Charcoal\'s shadow sweeps across the cloth roofs and the people (right to left, ~2.7 s); they glance up, know him, go back to business; two lift a hand. Nobody runs. Charcoal himself stays above the frame.',
      // (s31 r1: with Charcoal cast (draft) his shadow did not show on the street at 0.54 - cause not found in budget;
      // his shadow is now the director FX 'shadow-pass' stand-in (a shadow-only silhouette ~36 x 34 m from the builder,
      // on his X4-06-continuing line, heading 224, 41 m up, 13 m/s); people look up at points on that line. Lens moved
      // 11 m nearer the stalls (z 1672 -> 1661), street paved.)
      cam: { rig: 'static', pos: [199.8, STREET + 1.65, 1661], look: [202.2, STREET + 1.0, 1625], mm: 35, fstop: 5.6, focus: [201.5, STREET + 1.5, 1640] },
      set: { shadowAt: [[0, shadowOf(X4_07.root[0][1], STREET)], [5, shadowOf(X4_07.root[1][1], STREET), 'linear']], shadowExtent: 75 },
      fx: [{ kind: 'shadow-pass', from: 0, to: 5, params: { object: 'shadowDragon', from: X4_07.root[0][1], to: X4_07.root[1][1], yawDeg: 180 - 224 } }],
      cast: {
        vendor: { at: [204.6, 1646.5], face: 270, look: 'm1.head', lookAmount: 0.6, acts: [[2.5, 'look', { at: UP(2.5), amount: 0.85, blend: 0.4 }], [3.7, 'raiseHand', { side: 'R', in: 0.35, hold: 0.7, out: 0.4 }], [4.3, 'look', { at: 'm1.head', amount: 0.6, blend: 0.5 }]] },
        m1: { at: [201.2, 1647.0], face: 95, look: [203.0, STREET + 1.0, 1646.5], lookAmount: 0.7, acts: [[2.7, 'look', { at: UP(2.7), amount: 0.8, blend: 0.4 }], [4.0, 'look', { at: [203.0, STREET + 1.0, 1646.5], amount: 0.7, blend: 0.5 }]] },
        m2: { at: [201.0, 1637.6], face: 80, look: [203.4, STREET + 1.0, 1637], lookAmount: 0.7, acts: [[2.4, 'look', { at: UP(2.4), amount: 0.7, blend: 0.5 }], [3.6, 'look', { at: [203.4, STREET + 1.0, 1637], amount: 0.7, blend: 0.6 }]] },
        m3: { at: [199.6, 1653.5], face: 352, legs: 'planted', acts: [[0, 'walk', { to: [200.0, 1636], speed: 1.0 }], [2.9, 'look', { at: UP(2.9), amount: 0.6, blend: 0.4 }], [4.2, 'raiseHand', { side: 'R', in: 0.3, hold: 0.5, out: 0.4 }]] },
        m4: { at: [200.6, 1627.4], face: 100, look: [203.0, STREET + 1.0, 1627.5], lookAmount: 0.7, acts: [[2.2, 'look', { at: UP(2.2), amount: 0.75, blend: 0.4 }], [3.4, 'look', { at: [203.0, STREET + 1.0, 1627.5], amount: 0.7, blend: 0.5 }]] },
        m5: { at: [198.4, 1631.0], face: 175, legs: 'planted', acts: [[0, 'walk', { to: [198.7, 1648], speed: 1.2 }], [2.8, 'look', { at: UP(2.8), amount: 0.6, blend: 0.4 }], [3.8, 'look', { at: [199, STREET + 1.4, 1660], amount: 0.5, blend: 0.5 }]] },
      },
      notes: 'Charcoal is NOT cast (shadow-pass stand-in on his line); sound: "one heavy wingbeat" ~2.4 s (his 1C beat grid would give 1.76 / 3.36 s)',
    },
    'X4-04': {
      staging: 'MEDIUM 50 mm STATIC from the quay, looking north along it (the Santa Maria soft beyond, right): a working dragon about Leaf\'s size (slate grey) crouches low and level, wrists of the folded wings on the stones, head toward the catch; the crew sort fish into baskets at left, full baskets right; it waits for its share.',
      cam: { rig: 'static', pos: [257.6, 4.35, 1685], look: [254.8, 3.5, 1661], mm: 50, fstop: 4, focus: 'workDragon.head' },
      set: { shadowAt: [255, 3, 1663], shadowExtent: 25 },
      cast: {
        workDragon: { at: [255.8, 1661.2], face: 212, acts: [[0, 'crouch', { k: 1, breathe: 0.5, look: [-0.25, -0.1] }], [2.2, 'crouch', { k: 1, breathe: 0.6, look: [-0.45, -0.15], blend: 0.8 }]] },
        crewA: { at: [250.4, 1663.2], face: 120, posture: { kneel: 1 }, look: [251.2, 2.9, 1662.2], lookAmount: 0.8, acts: [[0.3, 'reach', { side: 'R', at: [251.3, 3.0, 1662.1], in: 0.4, hold: 0.6, out: 0.4 }], [1.9, 'reach', { side: 'R', at: [251.6, 3.3, 1660.6], in: 0.4, hold: 0.4, out: 0.4 }]] },
        crewB: { at: [250.2, 1660.6], face: 75, posture: { crouch: 0.8 }, look: [251.2, 2.9, 1662.2], lookAmount: 0.8, acts: [[0.9, 'reach', { side: 'L', at: [251.0, 3.0, 1661.8], in: 0.4, hold: 0.7, out: 0.4 }], [2.7, 'look', { at: 'workDragon.head', amount: 0.5, blend: 0.5 }]] },
        crewC: { at: [252.6, 1665.6], face: 40, look: 'workDragon.head', lookAmount: 0.5 },
      },
    },
    'X4-05': {
      staging: 'WIDE 35 mm STATIC from the slipway (the quay\'s south end, looking south-east down the slip, the sun high left): two boats bring in a heavy net between them out on the basin (background); a second, smaller working dragon (slate grey) walks the slack line up the slipway (centre, toward screen right), low on its two legs and the wrists of its folded wings, the line running from its jaws back to the net; the crew (right) haul a second line from the near boat in time.',
      // (s31 previs: from the slipway head looking ENE the dragon walked out of frame left and the boats spread 40 deg,
      // and every look down the slip faces the sun -> the lens stands on the quay end NW of the slip looking SE)
      cam: { rig: 'static', pos: [259, 4.6, 1700.5], look: [284, 0.5, 1717], mm: 35, fstop: 8, focus: 'netDragon.head' },
      set: {
        shadowAt: [278, 1, 1716], shadowExtent: 40,
        boats: { boatA: [[0, [298.5, 1712, 265]], [6, [297, 1712.4, 265], 'linear']], boatB: [[0, [299.5, 1724, 275]], [6, [298, 1723.6, 275], 'linear']] },
        net: { mouth: [4, 0] }, haul: 'netDragon.head', haul2: [276.3, 1.6, 1717.6],
      },
      cast: {
        netDragon: { at: [278.5, 1713.6], face: 272, acts: [[0, 'crouch', { k: 0.6, breathe: 0.6 }], [0.3, 'walk', { to: [271.0, 1713.4], speed: 1.4, blend: 0.6 }]] },
        crewD: { at: [275.0, 1717.6], face: 105, look: [298, 1, 1723], lookAmount: 0.5, acts: [[0, 'lean', { to: 0.4, dur: 0.01 }], [0, 'handsTo', { at: [276.0, 1.6, 1717.6], in: 0.01, spread: 0.2 }]] },
        crewE: { at: [273.0, 1717.9], face: 105, look: [298, 1, 1723], lookAmount: 0.5, acts: [[0, 'lean', { to: 0.5, dur: 0.01 }], [0, 'handsTo', { at: [274.0, 1.95, 1717.9], in: 0.01, spread: 0.2 }]] },
        boatman1: { at: [-0.9, 0.3], face: 270, acts: [[0, 'lean', { to: 0.35, dur: 0.01 }]] },
        boatman2: { at: [-0.9, -0.3], face: 270, acts: [[0, 'lean', { to: 0.3, dur: 0.01 }]] },
      },
      notes: 'boats + net are set objects (builder); the haul line runs from the net to netDragon.head (jaws); crew hold the second line from boatB. Sound: crew rhythm call (wordless), rope strain',
    },
  },
};
