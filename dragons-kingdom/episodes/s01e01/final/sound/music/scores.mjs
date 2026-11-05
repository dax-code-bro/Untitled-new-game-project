// Original music for Episode 1, composed as note data (beats = quarter notes). Rendered by music/render.mjs
// (MIDI -> FluidSynth + the Fluid R3 GM soundfont, MIT). Placed on the cut by music/cues.json (keyed to EDL shot ids).
// Written for this series by the sound track (2026-10-30); no quotation of any existing piece.
//
// Key plan: the sea/dawn theme rises in D major and stops on the dominant (A) so the title sting can resolve it to D;
// the hatching cue lives on an A pedal (D minor colour, a rising chromatic cello line, a minor-ninth Bb) and turns
// to D major (add9) when the hatchling is out.
// GM programs (0-based): 8 celesta, 42 cello, 43 contrabass, 44 tremolo strings, 45 pizzicato, 46 harp, 47 timpani,
// 48 strings, 49 slow strings, 60 French horn, 71 clarinet, 73 flute.

const N = { D1: 26, A1: 33, Bb1: 34, C2: 36, D2: 38, E2: 40, F2: 41, Fs2: 42, G2: 43, A2: 45, Bb2: 46, C3: 48, D3: 50, E3: 52,
  F3: 53, Fs3: 54, G3: 55, A3: 57, Bb3: 58, B3: 59, C4: 60, Cs4: 61, D4: 62, E4: 64, F4: 65, Fs4: 66, G4: 67, A4: 69,
  Bb4: 70, B4: 71, C5: 72, Cs5: 73, D5: 74, E5: 76, F5: 77, Fs5: 78, G5: 79, A5: 81, B5: 83, D6: 86 };
const chord = (beat, dur, pitches, vel) => pitches.map((p) => [beat, dur, N[p], vel]);
// a rising broken chord (harp), step in beats
const arp = (beat, step, pitches, vel, dur = 2) => pitches.map((p, i) => [beat + i * step, dur, N[p], vel - i]);

// ---------------------------------------------------------------- sea / dawn theme (P-15 .. T-01)
// 6 bars of 4/4 at 60 bpm. Bars 1-2: one low sustained string tone (the shot list: "music enters: one low sustained
// string tone, then the restrained rising theme"). Bars 3-6: horn melody D E F# A | A F# | G A B | D(sus) C#.
const dawn = {
  tempo_bpm: 60, length_beats: 30,
  parts: [
    { name: 'low strings', program: 49, channel: 0, volume: 110, reverb: 70, expression: 0,
      notes: [[0, 16, N.D2, 80], [0, 16, N.D3, 70], [4, 12, N.A2, 55], [16, 4, N.G2, 75], [20, 4, N.A2, 80]],
      ramps: [[0, 5, 11, 0, 100], [16, 24, 11, 100, 112]] },
    { name: 'strings', program: 48, channel: 1, volume: 100, reverb: 75, expression: 70,
      notes: [...chord(8, 4, ['D3', 'Fs3', 'A3'], 55), ...chord(12, 4, ['D3', 'Fs3', 'B3'], 55), ...chord(16, 4, ['D3', 'G3', 'B3'], 60),
        ...chord(20, 2, ['E3', 'A3', 'D4'], 64), ...chord(22, 2, ['E3', 'A3', 'Cs4'], 66)],
      ramps: [[8, 12, 11, 50, 80], [18, 24, 11, 80, 100]] },
    { name: 'horn theme', program: 60, channel: 2, volume: 96, pan: 58, reverb: 80, expression: 100,
      notes: [[8, 2, N.D4, 62], [10, 1, N.E4, 60], [11, 1, N.Fs4, 64], [12, 3, N.A4, 70], [15, 1, N.Fs4, 58],
        [16, 1, N.G4, 64], [17, 1, N.A4, 68], [18, 2, N.B4, 74], [20, 2, N.D5, 78], [22, 2, N.Cs5, 72]] },
    { name: 'harp', program: 46, channel: 3, volume: 84, pan: 80, reverb: 85,
      notes: [...arp(8, 0.5, ['D3', 'A3', 'D4', 'Fs4'], 46), ...arp(10, 0.5, ['A3', 'D4', 'Fs4', 'A4'], 40),
        ...arp(12, 0.5, ['B3', 'D4', 'Fs4', 'B4'], 46), ...arp(14, 0.5, ['D4', 'Fs4', 'B4', 'D5'], 40),
        ...arp(16, 0.5, ['G3', 'B3', 'D4', 'G4'], 48), ...arp(18, 0.5, ['B3', 'D4', 'G4', 'B4'], 44),
        ...arp(20, 0.5, ['A3', 'D4', 'E4', 'A4'], 50), ...arp(22, 0.5, ['A3', 'Cs4', 'E4', 'A4'], 52)] },
    { name: 'high strings', program: 49, channel: 4, volume: 80, pan: 40, reverb: 90, expression: 60,
      notes: [[16, 4, N.D5, 40], [20, 4, N.E5, 46]], ramps: [[16, 24, 11, 50, 80]] },
  ],
};

// ---------------------------------------------------------------- title sting (T-01: DRAGON'S KINGDOM on the egg)
// A two-beat timpani roll into a full D major downbeat (beat 2 = the title cut), which then falls away to nothing
// so the scratch from inside the egg is heard alone ("Music resolves and falls away").
const roll = [];
for (let b = 0; b < 2; b += 0.125) roll.push([b, 0.125, N.D2, Math.round(28 + 52 * (b / 2))]);
const sting = {
  tempo_bpm: 60, length_beats: 11,
  parts: [
    { name: 'timpani', program: 47, channel: 0, volume: 104, reverb: 70, notes: [...roll, [2, 3, N.D2, 104]] },
    { name: 'strings', program: 48, channel: 1, volume: 112, reverb: 80, expression: 118,
      notes: chord(2, 4.5, ['D2', 'A2', 'D3', 'Fs3', 'A3', 'D4', 'Fs4'], 88), ramps: [[2.5, 6.5, 11, 118, 0]] },
    { name: 'horns', program: 60, channel: 2, volume: 104, pan: 58, reverb: 85, expression: 120,
      notes: chord(2, 3.5, ['D4', 'Fs4', 'A4', 'D5'], 84), ramps: [[3, 5.5, 11, 120, 0]] },
    { name: 'harp', program: 46, channel: 3, volume: 92, pan: 84, reverb: 90,
      notes: arp(2, 0.125, ['D3', 'A3', 'D4', 'Fs4', 'A4', 'D5', 'Fs5', 'A5'], 70, 4) },
    { name: 'contrabass', program: 43, channel: 4, volume: 100, reverb: 60, expression: 110,
      notes: [[2, 4, N.D1, 90]], ramps: [[3, 6, 11, 110, 0]] },
  ],
};

// ---------------------------------------------------------------- hatching (1A-05 .. 1A-14), tense then tender
// 60 bpm. Beats 0-33.5: tremolo strings on an open fifth A-E, a pizzicato "heartbeat" on D that quickens, a high
// sustained E then F (minor sixth over the pedal), a cello line rising by semitones A -> E, a Bb minor ninth at the
// peak as the shell breaks away. Beat 33.5 (synced to 1A-13): the tension stops; D major add9 in slow strings and
// three harp notes; gone before the whispered close-up (1A-15: "nothing else").
const beat = [];
for (let b = 8; b < 24; b += 2) beat.push([b, 0.4, N.D2, 52], [b + 0.42, 0.4, N.D2, 36]);
for (let b = 24, step = 1.5; b < 33; b += step, step = Math.max(1, step - 0.1)) beat.push([b, 0.35, N.D2, 58], [b + 0.36, 0.35, N.D2, 40]);
const hatching = {
  tempo_bpm: 60, length_beats: 43,
  parts: [
    { name: 'tremolo strings', program: 44, channel: 0, volume: 96, reverb: 60, expression: 0,
      notes: [[0, 33.5, N.A2, 70], [0, 33.5, N.E3, 64]], ramps: [[0, 8, 11, 0, 72], [16, 33, 11, 72, 100]] },
    { name: 'pizzicato heartbeat', program: 45, channel: 1, volume: 92, reverb: 55, notes: beat },
    { name: 'high strings', program: 49, channel: 2, volume: 82, pan: 44, reverb: 85, expression: 60,
      notes: [[6, 10, N.E5, 38], [16, 8, N.F5, 42], [24, 9.5, N.Bb4, 46], [24, 9.5, N.E5, 42]],
      ramps: [[6, 12, 11, 30, 70], [24, 33, 11, 70, 96]] },
    { name: 'cello line', program: 42, channel: 3, volume: 90, pan: 70, reverb: 65, expression: 80,
      notes: [[20, 2, N.A3, 54], [22, 2, N.Bb3, 58], [24, 2, N.B3, 62], [26, 2, N.C4, 66], [28, 2, N.Cs4, 70], [30, 3.5, N.E4, 74]],
      ramps: [[20, 33, 11, 80, 110]] },
    { name: 'tender strings', program: 49, channel: 4, volume: 96, reverb: 90, expression: 90,
      notes: chord(33.5, 6, ['D3', 'A3', 'E4', 'Fs4'], 56), ramps: [[35, 39.5, 11, 90, 0]] },
    { name: 'harp', program: 46, channel: 5, volume: 80, pan: 84, reverb: 90,
      notes: [[34, 3, N.Fs4, 44], [35, 3, N.A4, 40], [36, 3, N.D5, 38]] },
  ],
};

// ---------------------------------------------------------------- shared figures for 1B / 1C
// Leaf's figure (light, playful; flute or clarinet): A . B D - B A | F# A B D. `sp` < 1 plays it faster.
const LEAF = [[0, 0.3, 'A4'], [0.5, 0.25, 'B4'], [0.75, 0.6, 'D5'], [1.5, 0.25, 'B4'], [2, 0.7, 'A4'],
  [3, 0.25, 'Fs4'], [3.5, 0.25, 'A4'], [3.75, 0.25, 'B4'], [4.25, 0.9, 'D5']];
const leafFig = (b, vel, sp = 1, shift = 0) => LEAF.map(([o, d, p], i) => [b + o * sp, d * sp, N[p] + shift, vel - (i % 3) * 3]);
// a plucked pulse alternating between pitches, every `step` beats in [from, to)
const pulse = (from, to, step, pitches, vel, dur = 0.4) => {
  const out = [];
  for (let b = from, i = 0; b < to - 1e-9; b += step, i++) out.push([b, dur, N[pitches[i % pitches.length]], vel - (i % 2) * 8]);
  return out;
};

// ---------------------------------------------------------------- M4 riding grounds (1B-02 .. X3-16)
// 60 bpm, beat 0 = start of 1B-02 (the pull-back from Charcoal's flank); beat = cut time - 4 s in the 1B draft cut.
// Quiet tension and awe for Remi and the lowered Charcoal (a D pedal, slow Mixolydian/Aeolian chord colours:
// D - Bb - C over D, never a full cadence), and Leaf's light figure on flute/clarinet for Leaf and Abby, played only
// in the gaps between lines. Sections (beats): 0-11.5 reveal; 11.5-28.5 Leaf and Abby (1B-04..1B-06, lines at
// 16.9-27.2 ducked); 28.5-42.5 getting ready (1B-07..1B-10, Abby mounts: the figure at 36.5); 42.5-60.5 the climb
// (X3-01..X3-05: tremolo pedal, low horns as Charcoal lowers at 46.5, the cello climbs a D minor scale step per
// landing, high strings at the top); 60.5-77 Leaf edges forward and is turned back (figure, then a falling clarinet
// version after the keeper's last line, X3-08); 77-95.5 the straps (low, sparse); 97-102.5 "Morning." and the eye
// (X3-14/15: the dawn theme's first four notes on a soft horn); 102.5-114 thin, under the pipe (R2-01); faded out by
// X3-16 + 3 s ("the field goes quiet").
const grounds = {
  tempo_bpm: 60, length_beats: 118,
  parts: [
    { name: 'low strings', program: 49, channel: 0, volume: 104, reverb: 70, expression: 0,
      notes: [[0, 28, N.D2, 66], [2, 26, N.A2, 52], [28.5, 14, N.D2, 50], [42.5, 4, N.D2, 60], [46.5, 4, N.Bb1, 72],
        [50.5, 10, N.D2, 62], [60.5, 16.5, N.D2, 48], [77, 25, N.D2, 50], [102.5, 13, N.D2, 40]],
      ramps: [[0, 6, 11, 0, 96], [42.5, 50.5, 11, 96, 112], [56, 62, 11, 112, 92], [102.5, 112, 11, 92, 50]] },
    { name: 'slow strings', program: 49, channel: 1, volume: 100, reverb: 80, expression: 50,
      notes: [...chord(4, 4, ['D3', 'A3', 'E4'], 50), ...chord(8, 3.5, ['Bb2', 'F3', 'D4'], 54),
        ...chord(12, 8, ['D3', 'Fs3', 'A3'], 42), ...chord(20, 4, ['G3', 'B3', 'D4'], 40), ...chord(24, 4.5, ['A3', 'D4', 'E4'], 40),
        ...chord(28.5, 6, ['D3', 'A3', 'C4'], 44), ...chord(34.5, 4, ['Bb2', 'D3', 'F3', 'A3'], 44), ...chord(38.5, 4, ['C3', 'E3', 'G3'], 46),
        ...chord(60.5, 6, ['D3', 'Fs3', 'A3'], 42), ...chord(66.5, 6, ['G3', 'B3', 'D4'], 40), ...chord(72.5, 4.5, ['A3', 'D4', 'E4'], 40),
        ...chord(77, 8, ['D3', 'A3'], 44), ...chord(85, 5, ['Bb2', 'F3', 'D4'], 44), ...chord(90, 7, ['C3', 'G3', 'E4'], 46),
        ...chord(97.5, 5, ['D3', 'Fs3', 'A3'], 46), ...chord(103.5, 10, ['D3', 'A3'], 36)],
      ramps: [[4, 8, 11, 50, 92], [10, 12, 11, 92, 70], [97.5, 100, 11, 70, 92], [104, 114, 11, 92, 40]] },
    { name: 'high strings', program: 49, channel: 2, volume: 80, pan: 40, reverb: 90, expression: 60,
      notes: [[6, 6, N.A4, 38], [54.5, 3, N.A4, 44], [57.5, 3.5, N.D5, 50], [103.5, 9, N.A4, 30]],
      ramps: [[54.5, 61, 11, 60, 96], [61, 62, 11, 96, 60]] },
    { name: 'flute (Leaf)', program: 73, channel: 3, volume: 92, pan: 34, reverb: 70,
      notes: [...leafFig(11.5, 66), ...leafFig(36.5, 58), ...leafFig(60.5, 64)] },
    { name: 'clarinet (Abby)', program: 71, channel: 4, volume: 88, pan: 48, reverb: 72,
      notes: [[18.4, 0.3, N.Fs4, 54], [18.9, 0.3, N.A4, 52], [19.15, 0.9, N.B4, 56],
        // X3-08 after the keeper's last line: the figure falls, then a cheeky upturn as Leaf looks back
        [71.2, 0.4, N.D5, 56], [71.7, 0.4, N.B4, 54], [72.2, 0.4, N.A4, 52], [72.7, 1.1, N.Fs4, 52],
        [74.2, 0.3, N.A4, 50], [74.5, 0.8, N.D5, 54]] },
    { name: 'pizzicato', program: 45, channel: 5, volume: 86, pan: 72, reverb: 55,
      notes: [...pulse(11.5, 21.5, 1, ['D3', 'A2'], 50), ...pulse(21.5, 28.5, 2, ['D3', 'A2'], 42), ...pulse(28.5, 42.5, 2, ['D2'], 44),
        ...pulse(60.5, 72.5, 1, ['D3', 'A2'], 44), ...pulse(77, 95, 2, ['D2'], 40)] },
    { name: 'tremolo strings', program: 44, channel: 6, volume: 92, reverb: 60, expression: 0,
      notes: [[42.5, 18, N.D3, 62], [42.5, 18, N.A3, 58]], ramps: [[42.5, 48, 11, 0, 70], [50.5, 59, 11, 70, 104], [59, 61, 11, 104, 0]] },
    { name: 'cello climb', program: 42, channel: 7, volume: 90, pan: 70, reverb: 65, expression: 84,
      notes: ['D3', 'E3', 'F3', 'G3', 'A3', 'Bb3', 'C4', 'D4'].map((p, i) => [50.5 + i * 1.25, 1.25, N[p], 50 + i * 3]) },
    { name: 'horns', program: 60, channel: 8, volume: 90, pan: 58, reverb: 85, expression: 90,
      notes: [...chord(46.5, 4, ['Bb2', 'D3', 'F3'], 58),
        // X3-14/15: "Morning." - the eye half closes: the dawn theme's first four notes, soft
        [98.5, 2, N.D4, 52], [100.5, 1, N.E4, 50], [101.5, 1, N.Fs4, 54], [102.5, 3, N.A4, 56]],
      ramps: [[46.5, 50.5, 11, 70, 100], [102.5, 105.5, 11, 90, 40]] },
    { name: 'harp', program: 46, channel: 10, volume: 80, pan: 84, reverb: 90,
      notes: [...arp(12, 0.5, ['D3', 'A3', 'D4', 'Fs4'], 44), ...arp(57.5, 0.33, ['D4', 'A4', 'D5', 'E5', 'A5'], 42),
        ...arp(99, 0.5, ['Fs4', 'A4', 'D5'], 38)] },
  ],
};

// ---------------------------------------------------------------- M5 ready (1B-12 .. 1B-15), into the takeoff
// beat 6 = 1B-13 (Leaf's eye on Charcoal). Under the 1B-12 lines: a low held fifth. 1B-13: a quick pizzicato
// and three flute notes (alert). 1B-15 (beat 12): Leaf rises - his figure, a harp run up, strings swelling from D
// to an A major chord held at the last frame of 1B, so the 1C takeoff cue can land on D.
const ready = {
  tempo_bpm: 60, length_beats: 20,
  parts: [
    { name: 'low strings', program: 49, channel: 0, volume: 100, reverb: 70, expression: 0,
      notes: [[0, 12, N.D2, 56], [0, 12, N.A2, 48], [12, 4, N.D2, 66], [16, 4, N.A1, 74]], ramps: [[0, 4, 11, 0, 84], [12, 18, 11, 84, 112]] },
    { name: 'strings', program: 48, channel: 1, volume: 100, reverb: 80, expression: 60,
      notes: [...chord(12, 4, ['D3', 'Fs3', 'A3', 'D4'], 56), ...chord(16, 4, ['A3', 'Cs4', 'E4', 'A4'], 64)],
      ramps: [[12, 18, 11, 60, 118]] },
    { name: 'pizzicato', program: 45, channel: 2, volume: 88, pan: 72, reverb: 55,
      notes: [[6, 0.3, N.D4, 48], [6.25, 0.3, N.Fs4, 46], [6.5, 0.4, N.A4, 50]] },
    { name: 'flute (Leaf)', program: 73, channel: 3, volume: 94, pan: 34, reverb: 70,
      notes: [[7, 0.25, N.A4, 54], [7.25, 0.25, N.B4, 52], [7.5, 0.6, N.D5, 56], ...leafFig(12, 68, 0.8)] },
    { name: 'harp', program: 46, channel: 4, volume: 86, pan: 84, reverb: 90,
      notes: arp(12.5, 0.25, ['D3', 'A3', 'D4', 'Fs4', 'A4', 'D5', 'Fs5', 'A5'], 52, 3) },
  ],
};

// ---------------------------------------------------------------- M6 takeoff (1C-01 .. 1C-06)
// beat 0 = 1C-01 (60 bpm, beat = cut time in the 1C draft cut). 1C-01/02 (0-7): Leaf goes first - his figure fast
// over bright D major strings, a clarinet answer as Abby leans into the climb. 1C-03 (7-14): Charcoal gathers and
// his wings open: the bright strings stop, horns and basses build D - Bb - C. 1C-04 (14-18): "air pressure
// building; silence from birds": tremolo strings rise on A with a timpani roll. 1C-05 (18): the massive downbeat -
// full D major tutti, the dawn theme on the horns (D E F# A - B A); 1C-06 (24): a second, higher swell, then gone by
// 1C-07 (the cut's slates; the flight cue is a later session's).
const troll = [];
for (let b = 15; b < 18; b += 0.125) troll.push([b, 0.125, N.A1, Math.round(30 + 60 * ((b - 15) / 3))]);
const takeoff = {
  tempo_bpm: 60, length_beats: 32,
  parts: [
    { name: 'strings', program: 48, channel: 0, volume: 104, reverb: 80, expression: 80,
      notes: [...chord(0, 4, ['D3', 'Fs3', 'A3', 'D4'], 58), ...chord(4, 3, ['G3', 'B3', 'D4', 'G4'], 60),
        ...chord(18, 6, ['D2', 'A2', 'D3', 'Fs3', 'A3', 'D4', 'Fs4'], 92), ...chord(24, 5, ['A2', 'E3', 'A3', 'D4', 'Fs4', 'A4', 'D5'], 86)],
      ramps: [[6, 7, 11, 80, 30], [18, 22, 11, 120, 96], [24, 25, 11, 96, 118], [25, 29, 11, 118, 30]] },
    { name: 'flute (Leaf)', program: 73, channel: 1, volume: 96, pan: 34, reverb: 70,
      notes: [...leafFig(0, 72, 0.6), ...leafFig(3.4, 66, 0.6, 12).slice(0, 5)] },
    { name: 'clarinet (Abby)', program: 71, channel: 2, volume: 88, pan: 48, reverb: 72,
      notes: [[4.5, 0.3, N.A4, 58], [4.8, 0.3, N.B4, 58], [5.1, 0.3, N.D5, 60], [5.4, 1.2, N.E5, 62]] },
    { name: 'basses', program: 43, channel: 3, volume: 104, reverb: 60, expression: 40,
      notes: [[6.5, 3.5, N.D2, 80], [10, 2, N.Bb1, 84], [12, 2, N.C2, 88], [14, 4, N.A1, 92], [18, 6, N.D1, 110], [24, 5, N.A1, 96]],
      ramps: [[6.5, 14, 11, 40, 110], [18, 24, 11, 127, 100], [25, 29, 11, 100, 0]] },
    { name: 'horns', program: 60, channel: 4, volume: 100, pan: 58, reverb: 85, expression: 60,
      notes: [...chord(8, 2, ['D3', 'A3'], 60), ...chord(10, 2, ['Bb2', 'D3', 'F3'], 66), ...chord(12, 2, ['C3', 'E3', 'G3'], 72),
        ...chord(14, 4, ['A2', 'E3', 'A3'], 74),
        [18, 2, N.D4, 100], [20, 1, N.E4, 96], [21, 1, N.Fs4, 100], [22, 2, N.A4, 106], [24, 2, N.B4, 100], [26, 3, N.A4, 94],
        ...chord(18, 6, ['D3', 'Fs3', 'A3'], 84)],
      ramps: [[8, 18, 11, 60, 110], [18, 19, 11, 127, 127], [26, 29, 11, 120, 0]] },
    { name: 'tremolo strings', program: 44, channel: 5, volume: 96, reverb: 60, expression: 0,
      notes: [[14, 4, N.A2, 70], [14, 4, N.E3, 66], [14, 4, N.A3, 64], [14, 4, N.Cs4, 62]], ramps: [[14, 18, 11, 20, 124]] },
    { name: 'timpani', program: 47, channel: 6, volume: 108, reverb: 70, notes: [...troll, [18, 3, N.D2, 118], [24, 3, N.A1, 104]] },
    { name: 'harp', program: 46, channel: 7, volume: 86, pan: 84, reverb: 90,
      notes: [...arp(0, 0.25, ['D4', 'Fs4', 'A4', 'D5'], 52), ...arp(18, 0.125, ['D3', 'A3', 'D4', 'Fs4', 'A4', 'D5', 'Fs5', 'A5'], 76, 3)] },
  ],
};

// ---------------------------------------------------------------- the light theme (1C flight, 1C-10 / 1C-15..1C-19)
// The dawn theme's head (D E F# A) made light and airborne by Leaf's turn (B A F#) and his rising tail: 8 beats,
// A | D . E F#-- A | B A F# | D---. Flute + violins, harp, high pad; never brass-heavy (private freedom, not a
// procession). M7 states it once and leaves it hanging on F# (1C-10, then "only wingbeats" from 1C-11); M8 grows it
// from 1C-15 and lets it complete on D only in 1C-19.
const LIGHT = [[0, 0.5, 'A4'], [0.5, 1, 'D5'], [1.5, 0.5, 'E5'], [2, 1.5, 'Fs5'], [3.5, 0.5, 'A5'], [4, 1, 'B5'], [5, 0.5, 'A5'],
  [5.5, 0.5, 'Fs5'], [6, 2, 'D5']];
const lightFig = (b, vel, { shift = 0, upto = LIGHT.length, hold = 0 } = {}) => LIGHT.slice(0, upto).map(([o, d, p], i, a) =>
  [b + o, (i === a.length - 1 ? d + hold : d) * 0.95, N[p] + shift, vel + (p === 'Fs5' || p === 'B5' ? 4 : 0) - (i % 2) * 3]);
// slow harp ostinato: pitches cycled every `step` beats over [from, to)
const ost = (from, to, step, pitches, vel) => pulse(from, to, step, pitches, vel, step * 3);

// M7 sky glimpse: beat 0 = 1C-10 (the extreme wide over the coast), 60 bpm; faded out early in 1C-11.
const skyGlimpse = {
  tempo_bpm: 60, length_beats: 12,
  parts: [
    { name: 'high pad', program: 49, channel: 0, volume: 92, reverb: 95, expression: 0,
      notes: [[0, 9, N.D4, 50], [0, 9, N.A4, 46], [0, 9, N.D5, 42], [0, 9, N.Fs5, 30]], ramps: [[0, 2.5, 11, 0, 84], [6, 10, 11, 84, 20]] },
    { name: 'harp', program: 46, channel: 1, volume: 80, pan: 78, reverb: 92,
      notes: ost(0, 7, 0.5, ['D4', 'A4', 'D5', 'A4', 'Fs4', 'A4'], 40) },
    { name: 'flute (light theme)', program: 73, channel: 2, volume: 94, pan: 40, reverb: 82,
      notes: lightFig(0.5, 66, { upto: 8, hold: 2 }) },
  ],
};

// M8 light theme: beat 0 = 1C-15 (65.5 s in the 1C draft cut), 60 bpm, so beat = cut time - 65.5. Shots: 1C-15
// beats 0-9 (nobody speaks: pad + harp, the theme low on clarinet from beat 3), 1C-16 9-12 (hands on the grips),
// 1C-17 12-15 (Leaf's glance: his figure on flute), 1C-18 15-18 (Remi relaxed: the dawn head on a soft horn),
// 1C-19 18-26 (the theme whole on flute + violins, harmonised D - D/F# - G - A - D) then a D add9 held into X4-01.
const lightTheme = {
  tempo_bpm: 60, length_beats: 34,
  parts: [
    { name: 'high pad', program: 49, channel: 0, volume: 96, reverb: 92, expression: 0,
      notes: [[0, 9, N.D4, 48], [0, 9, N.Fs4, 44], [0, 9, N.A4, 42], [9, 9, N.D4, 48], [9, 9, N.G4, 44], [9, 9, N.B4, 42],
        [18, 2, N.D4, 56], [18, 2, N.A4, 52], [20, 2, N.Fs4, 56], [20, 2, N.A4, 52], [22, 1.5, N.G4, 58], [22, 1.5, N.B4, 54],
        [23.5, 1, N.E4, 58], [23.5, 1, N.A4, 54], [24.5, 9, N.D4, 56], [24.5, 9, N.Fs4, 52], [24.5, 9, N.A4, 50], [24.5, 9, N.E5, 40]],
      ramps: [[0, 4, 11, 0, 80], [16, 19, 11, 80, 104], [27, 33, 11, 104, 0]] },
    { name: 'basses', program: 43, channel: 1, volume: 90, reverb: 70, expression: 70,
      notes: [[18, 2, N.D2, 60], [20, 2, N.Fs2, 58], [22, 1.5, N.G2, 62], [23.5, 1, N.A2, 62], [24.5, 6, N.D2, 64]],
      ramps: [[25, 31, 11, 70, 0]] },
    { name: 'harp', program: 46, channel: 2, volume: 82, pan: 80, reverb: 90,
      notes: [...ost(0.5, 18, 0.5, ['D4', 'A4', 'D5', 'A4', 'Fs4', 'A4'], 38), ...arp(18, 0.25, ['D3', 'A3', 'D4', 'Fs4', 'A4', 'D5'], 52, 2.5),
        ...arp(22, 0.25, ['G3', 'D4', 'G4', 'B4'], 50, 2), ...arp(24.5, 0.2, ['D3', 'A3', 'D4', 'E4', 'Fs4', 'A4', 'D5', 'E5'], 56, 4)] },
    { name: 'clarinet (low theme)', program: 71, channel: 3, volume: 86, pan: 50, reverb: 80,
      notes: lightFig(3, 56, { shift: -12, upto: 5, hold: 1.5 }) },
    { name: 'flute (Leaf / light theme)', program: 73, channel: 4, volume: 96, pan: 40, reverb: 80,
      notes: [...leafFig(12.2, 60, 0.7), ...lightFig(18, 74, { hold: 2 })] },
    { name: 'violins (light theme)', program: 48, channel: 5, volume: 92, pan: 56, reverb: 85, expression: 60,
      notes: lightFig(18, 64, { shift: -12, hold: 2 }), ramps: [[18, 21, 11, 60, 96], [26, 30, 11, 96, 0]] },
    { name: 'horn (dawn head)', program: 60, channel: 6, volume: 84, pan: 60, reverb: 88, expression: 70,
      notes: [[15, 0.9, N.D4, 54], [16, 0.5, N.E4, 52], [16.5, 0.5, N.Fs4, 55], [17, 1.2, N.A4, 58]] },
  ],
};

// M9 coast (light theme reprise): beat 0 = X4-20 (the dragons leave the harbour and follow the coast, 5 s), 80 bpm
// so the whole 8-beat theme fits the shot (beat = shot time x 4/3; the closing D lands at beat 6.25 = 4.7 s). M8's
// 1C-19 statement made lighter and moving: no basses or horn, harp in eighths, the theme once on flute with violins
// an octave below, harmonised D - D/F# - G - A - D as in M8, the last chord a D add9 left open (the journey goes
// on; hard cut to Cling at X5-01, the cue is faded over the cut).
const coast = {
  tempo_bpm: 80, length_beats: 10,
  parts: [
    { name: 'high pad', program: 49, channel: 0, volume: 90, reverb: 92, expression: 0,
      notes: [[0, 2.25, N.D4, 48], [0, 2.25, N.A4, 44], [2.25, 2, N.Fs4, 48], [2.25, 2, N.A4, 44], [4.25, 1, N.G4, 50],
        [4.25, 1, N.B4, 46], [5.25, 1, N.E4, 50], [5.25, 1, N.A4, 46], [6.25, 3.5, N.D4, 50], [6.25, 3.5, N.Fs4, 46],
        [6.25, 3.5, N.A4, 44], [6.25, 3.5, N.E5, 36]],
      ramps: [[0, 1.5, 11, 0, 82], [7, 9.5, 11, 82, 0]] },
    { name: 'harp', program: 46, channel: 1, volume: 80, pan: 80, reverb: 90,
      notes: [...ost(0, 2.25, 0.5, ['D4', 'A4', 'D5', 'A4'], 40), ...ost(2.25, 4.25, 0.5, ['Fs4', 'A4', 'D5', 'A4'], 40),
        ...ost(4.25, 5.25, 0.5, ['G4', 'B4'], 42), ...ost(5.25, 6.25, 0.5, ['E4', 'A4'], 42),
        ...arp(6.25, 0.2, ['D3', 'A3', 'D4', 'E4', 'Fs4', 'A4', 'D5', 'E5'], 52, 3)] },
    { name: 'flute (light theme)', program: 73, channel: 2, volume: 94, pan: 40, reverb: 82,
      notes: lightFig(0.25, 68, { hold: 1.5 }) },
    { name: 'violins (light theme)', program: 48, channel: 3, volume: 88, pan: 56, reverb: 85, expression: 64,
      notes: lightFig(0.25, 58, { shift: -12, hold: 1.5 }), ramps: [[0.25, 2.5, 11, 64, 92], [7, 9.5, 11, 92, 0]] },
  ],
};

// (s9) the pad starts half a beat early (0.375 s pre-lap into X4-19, from expression 0) so the cue does not start
// cold on the cut; everything else is shifted by +0.5 beat and the cue's sync is beat 0.5 = X4-20 (cues.json), so the
// harp's first pluck stays on the cut and the closing D add9 stays at 4.7 s into the shot.
const shiftScore = (sc, db) => ({ ...sc, length_beats: sc.length_beats + db, parts: sc.parts.map((p) => ({ ...p,
  notes: p.notes.map(([b, ...r]) => [b + db, ...r]), ...(p.ramps ? { ramps: p.ramps.map(([b0, b1, ...r]) => [b0 + db, b1 + db, ...r]) } : {}) })) });
const coastPre = shiftScore(coast, 0.5);
coastPre.parts[0].notes = coastPre.parts[0].notes.map((n) => (n[0] === 0.5 ? [0, n[1] + 0.5, n[2], n[3]] : n));
// (s9) measured: a 0 -> 82 expression ramp left the pre-lap inaudible (first sound = the harp on the cut); start the
// swell at 40 so the slow string-pad attack is already audible under the harp's first pluck.
coastPre.parts[0].ramps.splice(0, 1, [0, 0.5, 11, 40, 72], [0.5, 2, 11, 72, 82]);

export const SCORES = { dawn_theme: dawn, title_sting: sting, hatching, riding_grounds: grounds, ready, takeoff, sky_glimpse: skyGlimpse, light_theme: lightTheme, coast: coastPre };

