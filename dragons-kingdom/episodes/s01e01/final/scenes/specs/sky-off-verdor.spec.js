// Shot specs - SKY_OFF_VERDOR: scene 1C in the air, 1C-07 .. 1C-19 (session 14: FIRST PASS, specs + previs only).
// Set builder: scenes/lib/director/sets/sky-off-verdor.js (VERDOR frame: +x east = the sea, -z north, y up).
//
// THE FLIGHT LINE (shotlist conventions.flight_line_1C_to_1E): they fly SOUTH (+z, heading 180) along the coast
// (coast x ~295 from z 300); cameras on the INLAND (west) side look east, so travel reads screen LEFT -> RIGHT and
// we see their RIGHT sides. Leaf on the inland side and a little behind/below; Charcoal seaward and ahead.
// Formation clock T = seconds since 1C-10's first frame (the edit compresses time; T keeps the coast continuous):
//   (session 15, owner notes on the st21 stills: Leaf flew 20-40 m below Charcoal in the wides -> brought ABREAST,
//   slightly behind, inland side, near his altitude; lateral gap 40 -> 30 m keeps ~11 m clear of his ~30 m span)
//   Leaf      [505, 58, zF(T)]          quick corrective beats (flight corr 1)
//   Charcoal  [545, 58, zF(T) + 20]     slow heavy beats (hz 0.625 = one beat / 1.6 s, the sound spots); draws level +
//                                       closes in + climbs 5 m in 1C-13 -> TALK [535, 63, +8] for 1C-14..19
//   zF(T) = 300 + 16 T  (16 m/s)
// Wides (1C-11/13/15/19): 160-200 mm, camera ~4-4.5 deg above the pair (the horizon just out of the top of frame: no
// white haze band) and 300-800 m out, so the 40 m depth gap shows as ~0.5 deg (previs: Leaf <= ~0.2 NDC lower).
// Shadows (1C-12): sun sunDir(102, 31) -> a shadow lies 1.63 h west and 0.35 h north of its dragon: Leaf (h 58) on
// x ~410, Charcoal (h 58) on x ~450 - the sandy shallows (sea floor 1-3 m down), so they read.
// Air-to-air close / medium shots use the framing solver with track: true (re-solved every frame on the moving
// riders). Long-lens wides: world camera keys moving with the formation (linear).
// Faces: 1C-09 (L042) and 1C-14 (L043-L045) are dialogue shots with lip-sync from the takes; the others keep the
// riders' faces three-quarter / turned (no performance needed).
// NOT RENDERED YET - see scenes/lib/director/PROGRESS.md session 14 for the exact still / render commands.
const V = 16;
const zF = (T) => 300 + V * T;
const D2R = Math.PI / 180;
/** a straight flight: root keys from p0 along heading h (deg, 0 = north) at speed v, climbing dy over dur */
function fly(p0, h, v, dur, dy = 0) {
  const dx = Math.sin(h * D2R) * v * dur, dz = -Math.cos(h * D2R) * v * dur;
  return { root: [[0, p0], [dur, [p0[0] + dx, p0[1] + dy, p0[2] + dz], 'linear']], yawKeys: h };
}
/** formation member at lane x, height y, lead (m ahead of zF) for a shot starting at formation time T0 */
const inForm = (x, y, lead, T0, dur, o = {}) => ({
  root: [[0, [x, y, zF(T0) + lead]], [dur, [x + (o.dx || 0), y + (o.dy || 0), zF(T0 + dur) + lead + (o.dlead || 0)], 'linear']],
  yawKeys: o.heading ?? 180,
});
const LEAF_FLY = (o = {}) => [[0, 'flight', { corr: 1, ...o }]];
// Charcoal's beat: 1.6 s (sound spots, wf_c293b01a); amp a little under his default so the beat reads heavy, not frantic
const CHAR_HZ = 0.625;
const CHAR_FLY = (o = {}) => [[0, 'flight', { hz: CHAR_HZ, amp: 0.68, ...o }]];
const CHAR_GLIDE = (o = {}) => [[0, 'glide', { bank: 0.03, dihedral: 0.08, droop: 0.06, ...o }]];
// the launch dust left on the field (VERDOR_GROUNDS' LAUNCH_FX, aged): Charcoal's first downstroke was at
// tau 3.3 of his launch; 1C-08 starts ~10.7 s after it
const SCAR = [43.0, 9, -60.0];
const OLD_DUST = (from) => [{ kind: 'dust-downwash', id: 'launch', from, to: null, at: SCAR, params: { bursts: [0, 2.2, 4.4, 6.6], radius: 30, strength: 1, color: 'loam', life: 24 } }];
// formation times of each shot's first frame (shot lengths from the shot list)
const T = { '1C-10': 0, '1C-11': 6, '1C-12': 11, '1C-13': 15, '1C-14': 21, '1C-15': 26, '1C-16': 35, '1C-17': 38, '1C-18': 41, '1C-19': 44 };
// the talking formation (after 1C-13): Charcoal closed in and level, a little above
const FORM = { leaf: [505, 58, 0], charcoal: [545, 58, 20] };
const TALK = { leaf: [505, 58, 0], charcoal: [535, 63, 8] };

export default {
  set: 'SKY_OFF_VERDOR',
  cast: {
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
    charcoal: { kind: 'creature', id: 'charcoal' },
    remiR: { kind: 'human', id: 'remi_ride', ride: 'charcoal', outfit: 'remi', role: 'REMI' },
    abbyR: { kind: 'human', id: 'abby_ride', ride: 'leaf', outfit: 'abby', role: 'ABBY' },
  },
  previs: { ground: 0 },
  shots: {
    '1C-07': {
      staging: 'MEDIUM: 50 mm air-to-air off Leaf\'s right (inland) side, a little ahead: Leaf climbing out south-east over the field edge; Abby turns in the saddle and looks back through the departing dust toward the launch (face turned away, three-quarter back).',
      // (one subject: with leaf.chest as a second one the solver flipped sides - previs s14)
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [-0.2, 0.28]]], from: 235, dist: 10, rise: 1.2, track: true }, mm: 50, fstop: 4, focus: 'abbyR.head' },
      set: { shadowExtent: 60 },
      cast: {
        leaf: { tack: true, ...fly([150, 40, -30], 150, V, 2.5, 3), acts: LEAF_FLY() },
        abbyR: { acts: [[0.2, 'look', { at: [43, 14, -60], amount: 0.9, blend: 0.7 }]] },
      },
      fx: OLD_DUST(-8.2),
    },
    '1C-08': {
      staging: 'POV (Abby\'s eyeline, 35 mm, flying): back over her right shoulder, Charcoal rises out of the dust above the field, Remi a small fixed point on his back; the dust cloud behind and below him.',
      deviation: 'Charcoal flies a keyed climb (flight pose) instead of continuing poses.launch: the launch formula accelerates without limit (tau 14 = 276 m) and would put him ahead of Leaf.',
      // (session 15: st21 showed only Leaf's own neck scales + right wing - Charcoal was due WEST, i.e. along her right
      // wing. Now Leaf is further down her line and Charcoal climbs on her back-right quarter (bearing ~300 from her,
      // 40 deg off the tail line), from a little below her eyeline to above it, the old dust behind/below him;
      // eye raised 0.6 m (she half-stands to look back) so her wing root sits low in frame.)
      cam: { rig: 'follow', pos: 'abbyR.head', offset: [0, 0.6, 0], look: 'charcoal.chest', mm: 35, fstop: 5.6, focus: 'charcoal.chest', shake: { kind: 'aerial', amount: 0.5 } },
      set: { shadowAt: [[0, [120, 9, 40]], [5, [150, 9, 90], 'linear']], shadowExtent: 160 },
      cast: {
        leaf: { tack: true, ...fly([200, 44, 60], 160, V, 5, 4), acts: LEAF_FLY() },
        abbyR: { visible: false },
        charcoal: { tack: true, ...fly([90, 38, 0], 150, 15, 5, 20), pitch: [[0, -12], [5, -6]], acts: CHAR_FLY() },
        remiR: {},
      },
      fx: OLD_DUST(-10.7),
    },
    '1C-09': {
      staging: 'CLOSE: 85 mm air-to-air on Abby from her right front three-quarter: "You could have warned the grass." - to herself and us; Remi is far off (no reply).',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.head', [0.1, 0.18]]], from: 215, dist: 3.4, rise: 0.15, track: true }, mm: 85, fstop: 2.8, focus: 'abbyR.head' },
      set: { shadowExtent: 40 },
      cast: {
        leaf: { tack: true, ...fly([260, 46, 120], 160, V, 4, 2), acts: LEAF_FLY() },
        abbyR: { acts: [[0, 'look', { at: [330, 50, 330], amount: 0.6 }]] },
      },
      lines: [['L042', 0.6]],
    },
    '1C-10': {
      staging: 'EXTREME WIDE: 150 mm from a camera ship far inland and high, slow travel: they climb out over the coast south-east, the shoreline first (bottom left), Leaf behind and inland (left), Charcoal ahead (right) crossing the cliff edge.',
      cam: { rig: 'drone', pos: [[0, [-350, 160, 60]], [6, [-330, 162, 100], 'linear']], look: [[0, [232, 31, 251]], [6, [300, 47, 319], 'linear']], mm: 150, fstop: 8, focus: 'charcoal.chest' },
      set: { shadowAt: [[0, [240, 9, 250]], [6, [300, 0, 320], 'linear']], shadowExtent: 160 },
      cast: {
        // (s15: Leaf 42 m straight behind him (NW = inland + screen left), 1 m higher - was 6 m lower and in front)
        leaf: { tack: true, ...fly([220, 35, 232], 135, V, 6, 16), acts: LEAF_FLY() },
        charcoal: { tack: true, ...fly([250, 34, 262], 135, V, 6, 16), acts: CHAR_FLY() },
        abbyR: {}, remiR: {},
      },
    },
    '1C-11': {
      staging: 'WIDE: 135 mm air-to-air from the inland side, abreast of Leaf (~300 m): Leaf left and nearer, Charcoal right, ahead and farther out - the flight line used through 1E.',
      // (s15: 200 mm from 300 m, ~4 deg above them: the horizon is out of frame (st21 had a blown-out white band on top))
      cam: { rig: 'follow', pos: [[0, [205, 82, zF(6) + 4]], [5, [205, 82, zF(11) + 4], 'linear']], look: [[0, [525, 59, zF(6) + 16]], [5, [525, 59, zF(11) + 16], 'linear']], mm: 200, fstop: 8, focus: 'leaf.chest' },
      set: { shadowAt: [[0, [470, 0, zF(6)]], [5, [470, 0, zF(11)], 'linear']], shadowExtent: 180 },
      cast: {
        leaf: { tack: true, ...inForm(...FORM.leaf, T['1C-11'], 5), acts: LEAF_FLY() },
        charcoal: { tack: true, ...inForm(...FORM.charcoal, T['1C-11'], 5), acts: CHAR_FLY() },
        abbyR: {}, remiR: {},
      },
    },
    '1C-12': {
      staging: 'EXTREME WIDE: top-down from 480 m, 35 mm, travelling with them: the sea floor through the shallows and the two shadows on it, Charcoal\'s far larger; travel left -> right (screen top = the sea).',
      // (previs: from 380 m over x 420 Charcoal was off the top; 480 m over x 465 holds shadows 389 / 449 and dragons 470 / 540)
      cam: { rig: 'drone', pos: [[0, [482, 480, zF(11)]], [4, [482, 480, zF(15)], 'linear']], look: [[0, [494, 0, zF(11)]], [4, [494, 0, zF(15)], 'linear']], mm: 35, fstop: 8, focus: 430 },
      set: { shadowAt: [[0, [450, 0, zF(11)]], [4, [450, 0, zF(15)], 'linear']], shadowExtent: 200 },
      cast: {
        leaf: { tack: true, ...inForm(...FORM.leaf, T['1C-12'], 4), acts: LEAF_FLY() },
        charcoal: { tack: true, ...inForm(...FORM.charcoal, T['1C-12'], 4), acts: CHAR_GLIDE() },
        abbyR: {}, remiR: {},
      },
    },
    '1C-13': {
      staging: 'WIDE: 135 mm from the inland side: Charcoal draws level and closes in (out 540 -> 500, ahead 25 -> 5, a little higher); his shadow crosses the water below; Leaf works harder with quick corrective beats.',
      // (s15: 180 mm, camera ~4.5 deg above them, horizon out of frame; he keeps beating (1.6 s) - the st21 glide read as a stiff sail)
      cam: { rig: 'follow', pos: [[0, [195, 85, zF(15) + 4]], [6, [195, 85, zF(21) + 4], 'linear']], look: [[0, [525, 59, zF(15) + 14]], [6, [520, 60, zF(21) + 8], 'linear']], mm: 180, fstop: 8, focus: 'leaf.chest' },
      set: { shadowAt: [[0, [460, 0, zF(15)]], [6, [450, 0, zF(21)], 'linear']], shadowExtent: 200 },
      cast: {
        leaf: { tack: true, ...inForm(...FORM.leaf, T['1C-13'], 6), acts: LEAF_FLY({ hz: 1.25 }) },
        charcoal: { tack: true, ...inForm(...FORM.charcoal, T['1C-13'], 6, { dx: TALK.charcoal[0] - FORM.charcoal[0], dy: TALK.charcoal[1] - FORM.charcoal[1], dlead: TALK.charcoal[2] - FORM.charcoal[2] }), acts: CHAR_FLY() },
        abbyR: {}, remiR: {},
      },
    },
    '1C-14': {
      staging: 'MEDIUM: 50 mm off Charcoal\'s right shoulder, ahead of Remi, looking back over the neck: Remi right, Leaf and Abby lower in the background left. "Everything secure?" - "Yes." - "All right."',
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.38, 0.12]], ['abbyR.head', [-0.4, -0.35]]], from: 190, dist: 14, rise: 2.5, track: true }, mm: 50, fstop: 4, focus: 'remiR.head' },
      set: { shadowExtent: 70 },
      cast: {
        leaf: { tack: true, ...inForm(TALK.leaf[0], TALK.leaf[1], TALK.leaf[2], T['1C-14'], 5), acts: LEAF_FLY() },
        charcoal: { tack: true, ...inForm(TALK.charcoal[0], TALK.charcoal[1], TALK.charcoal[2], T['1C-14'], 5), acts: CHAR_GLIDE() },
        remiR: { acts: [[0, 'look', { at: 'abbyR.head', amount: 0.5 }]] },     // calls back over his right shoulder (previs: face 147 deg at 0.8)
        abbyR: { acts: [[0, 'look', { at: 'remiR.head', amount: 0.8 }]] },
      },
      lines: [['L043', 0.5], ['L044', 0.35], ['L045', 0.4]],
    },
    '1C-15': {
      staging: 'EXTREME WIDE: 180 mm from the inland side, tracking with them (no orbit): their path curves gently seaward with the coast; the coast in the foreground left; nobody speaks.',
      cam: { rig: 'follow', pos: [[0, [-120, 104, zF(26) - 40]], [9, [-100, 104, zF(35) - 40], 'linear']], look: [[0, [520, 58, zF(26)]], [9, [550, 58, zF(35)], 'linear']], mm: 180, fstop: 8, focus: 'leaf.chest' },
      set: { shadowAt: [[0, [440, 0, zF(26)]], [9, [470, 0, zF(35)], 'linear']], shadowExtent: 200 },
      cast: {
        leaf: { tack: true, ...inForm(TALK.leaf[0], TALK.leaf[1], TALK.leaf[2], T['1C-15'], 9, { dx: 30, heading: [[0, 180], [9, 176]] }), acts: LEAF_FLY() },
        charcoal: { tack: true, ...inForm(TALK.charcoal[0], TALK.charcoal[1], TALK.charcoal[2], T['1C-15'], 9, { dx: 30, heading: [[0, 180], [9, 176]] }), acts: CHAR_FLY({ bank: -0.06 }) },
        abbyR: {}, remiR: {},
      },
    },
    '1C-16': {
      staging: 'INSERT: 100 mm on Abby\'s two hands on the grips, easy (detail 1 - both hands, before the pass).',
      cam: { rig: 'follow', frame: { subjects: [['abbyR.hand.L', [-0.25, 0.0]], ['abbyR.hand.R', [0.25, 0.0]]], from: 240, dist: 1.6, rise: 0.4, track: true }, mm: 100, fstop: 4, focus: 'abbyR.hand.R' },
      set: { shadowExtent: 30 },
      cast: {
        leaf: { tack: true, ...inForm(TALK.leaf[0], TALK.leaf[1], TALK.leaf[2], T['1C-16'], 3), acts: LEAF_FLY() },
        abbyR: {},
      },
    },
    '1C-17': {
      staging: 'CLOSE: 85 mm on Leaf\'s head from his right front: he glances across at Charcoal (right/seaward, out of frame) without fear, then back to the line.',
      cam: { rig: 'follow', frame: { subjects: [['leaf.head', [-0.2, 0.05]]], from: 215, dist: 5.5, rise: 0.6, track: true }, mm: 85, fstop: 4, focus: 'leaf.head' },
      set: { shadowExtent: 40 },
      cast: {
        leaf: { tack: true, ...inForm(TALK.leaf[0], TALK.leaf[1], TALK.leaf[2], T['1C-17'], 3), acts: [[0, 'flight', { corr: 1 }], [0.8, 'flight', { corr: 1, look: [0.45, 0.05], blend: 0.5 }], [2.2, 'flight', { corr: 1, blend: 0.7 }]] },
        charcoal: { tack: true, ...inForm(TALK.charcoal[0], TALK.charcoal[1], TALK.charcoal[2], T['1C-17'], 3), acts: CHAR_GLIDE() },
        abbyR: {},
      },
    },
    '1C-18': {
      staging: 'MEDIUM: 50 mm off Charcoal\'s right side: Remi relaxed, looking back at the island (Verdor, north-west) instead of scanning the sky; face three-quarter away.',
      cam: { rig: 'follow', frame: { subjects: [['remiR.head', [0.3, 0.15]]], from: 235, dist: 7, rise: 1.0, track: true }, mm: 50, fstop: 4, focus: 'remiR.head' },
      set: { shadowExtent: 60 },
      cast: {
        charcoal: { tack: true, ...inForm(TALK.charcoal[0], TALK.charcoal[1], TALK.charcoal[2], T['1C-18'], 3), acts: CHAR_GLIDE() },
        remiR: { acts: [[0, 'look', { at: [120, 40, -700], amount: 0.7 }]] },
      },
    },
    '1C-19': {
      staging: 'EXTREME WIDE: 160 mm slow aerial travel from inland, abeam and a little behind: the pair over the bright sea, Leaf left, Charcoal right; Verdor\'s headland receding in the left background. Private freedom, not a procession.',
      // (abeam from inland: from behind, the inland Leaf read RIGHT of Charcoal; Verdor's headland is then behind the lens -
      // the shot list's 'Island, L-bg' is open: PROGRESS session 14)
      cam: { rig: 'drone', pos: [[0, [-250, 118, zF(44) - 150]], [8, [-235, 119, zF(52) - 150], 'linear']], look: [[0, [520, 59, zF(44) + 10]], [8, [535, 59, zF(52) + 10], 'linear']], mm: 160, fstop: 8, focus: 'charcoal.chest' },
      set: { shadowAt: [[0, [460, 0, zF(44)]], [8, [470, 0, zF(52)], 'linear']], shadowExtent: 200 },
      cast: {
        leaf: { tack: true, ...inForm(...TALK.leaf, T['1C-19'], 8), acts: LEAF_FLY() },
        charcoal: { tack: true, ...inForm(...TALK.charcoal, T['1C-19'], 8), acts: CHAR_FLY() },
        abbyR: {}, remiR: {},
      },
    },
  },
};
