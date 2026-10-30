// Original music for Episode 1, composed as note data (beats = quarter notes). Rendered by music/render.mjs
// (MIDI -> FluidSynth + the Fluid R3 GM soundfont, MIT). Placed on the cut by music/cues.json (keyed to EDL shot ids).
// Written for this series by the sound track (2026-10-30); no quotation of any existing piece.
//
// Key plan: the sea/dawn theme rises in D major and stops on the dominant (A) so the title sting can resolve it to D;
// the hatching cue lives on an A pedal (D minor colour, a rising chromatic cello line, a minor-ninth Bb) and turns
// to D major (add9) when the hatchling is out.
// GM programs (0-based): 8 celesta, 42 cello, 43 contrabass, 44 tremolo strings, 45 pizzicato, 46 harp, 47 timpani,
// 48 strings, 49 slow strings, 60 French horn.

const N = { D1: 26, A1: 33, D2: 38, E2: 40, G2: 43, A2: 45, D3: 50, E3: 52, Fs3: 54, G3: 55, A3: 57, Bb3: 58, B3: 59,
  C4: 60, Cs4: 61, D4: 62, E4: 64, F4: 65, Fs4: 66, G4: 67, A4: 69, Bb4: 70, B4: 71, Cs5: 73, D5: 74, E5: 76, F5: 77,
  Fs5: 78, A5: 81, D6: 86 };
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

export const SCORES = { dawn_theme: dawn, title_sting: sting, hatching };
