// Shot specs - PROLOGUE_VISTAS (PROLOGUE: P-08 .. P-16, the dissolving landscapes under the narration).
// Locations: scenes/lib/director/sets/prologue-vistas.js (each landscape is its own location group at
// the origin; only the shot's location is drawn, so no named place can show in another's view).
// Captions: TARA / SCRAPPER / VERDOR / CITADEL SEA / PROXY SEA appear over their own view only, synced
// to the spoken word (shot list); P-13 -> P-14 is its own dissolve, so the two seas never share a view.
// The narration L002 / L003 is split at its sentence pauses (dialogue.js takeParts) so each sentence
// sits on its landscape; "The Citadel Sea and the Proxy Sea" runs over the P-13 / P-14 cut (continues)
// so "Proxy Sea" lands on P-14.

export default {
  set: 'PROLOGUE_VISTAS',
  cast: {},
  shots: {
    'P-08': {
      staging: 'NONE: a fishing settlement above its shore under a pale dawn sky, from the water; slow drift.',
      trans: ['dissolve', 24],
      cam: { rig: 'drone', pos: [[0, [-50, 13, 70]], [8, [-20, 13.4, 62]]], look: [[0, [-20, 20, -220]], [8, [5, 20, -220]]], mm: 24, fstop: 5.6, focus: 600, ease: 'linear', shake: { kind: 'aerial', amount: 0.15 } },
      set: { loc: 'settlement' },
      lines: [['L002#1', 1.3], ['L002#2', 0.6]],
    },
    'P-09': {
      staging: 'NONE: open sea to the horizon, away from the land.',
      trans: ['dissolve', 24],
      cam: { rig: 'drone', pos: [[0, [40, 7, 300]], [8.5, [10, 7.2, 320]]], look: [[0, [-600, 2, 3400]], [8.5, [-450, 2, 3400]]], mm: 24, fstop: 5.6, focus: 500, ease: 'linear', shake: { kind: 'aerial', amount: 0.12 } },
      set: { loc: 'settlement' },
      lines: [['L002#3', 1.4]],
    },
    'P-10': {
      staging: 'NONE: a forest reaching a dark sea cliff, from the water, the cliff line receding west along the frame; caption TARA on the word.',
      trans: ['dissolve', 18],
      // looking along the coast (not square onto the face): the wandering cliff line, its buttresses and
      // the wood's edge read in depth; a frontal face under the raking dawn sun read as a palisade
      cam: { rig: 'drone', pos: [[0, [255, 20, 150]], [2, [247, 20.3, 147]]], look: [-60, 40, -170], mm: 24, fstop: 5.6, focus: 450, ease: 'linear' },
      set: { loc: 'forest' },
      lines: [['L003#1', 0.55]],
      captions: [{ text: 'Tara', line: 'L003#1', word: 'tara', lead: 0.1, hold: 1.25 }],
    },
    'P-11': {
      staging: 'NONE: distant fortified walls along a ridge, inland; caption SCRAPPER on the word.',
      trans: ['dissolve', 12],
      cam: { rig: 'drone', pos: [[0, [70, 42, -280]], [2, [62, 42.3, -282]]], look: [0, 88, -820], mm: 24, fstop: 5.6, focus: 900, ease: 'linear' },
      set: { loc: 'walls', sunTarget: [0, 60, -700] },
      lines: [['L003#2', 0.5]],
      captions: [{ text: 'Scrapper', line: 'L003#2', word: 'scrapper', lead: 0.1, hold: 1.25 }],
    },
    'P-12': {
      staging: 'NONE: a misted pale island alone on the sea, from open water; caption VERDOR on the word.',
      trans: ['dissolve', 12],
      cam: { rig: 'drone', pos: [[0, [-260, 8, 60]], [2, [-252, 8.1, 56]]], look: [200, 75, -2500], mm: 24, fstop: 5.6, focus: 2500, ease: 'linear' },
      set: { loc: 'verdor', sunTarget: [200, 50, -2500], shadowExtent: 3000 },
      lines: [['L003#3', 0.5]],
      captions: [{ text: 'Verdor', line: 'L003#3', word: 'verdor', lead: 0.1, hold: 1.25 }],
    },
    'P-13': {
      staging: 'NONE: calm open water under a high bright sky, no coast; caption CITADEL SEA on the words.',
      trans: ['dissolve', 12],
      cam: { rig: 'drone', pos: [[0, [0, 4.5, 0]], [2.5, [3, 4.5, -4]]], look: [0, 30, -1200], mm: 24, fstop: 5.6, focus: 400, ease: 'linear' },
      set: { loc: 'calm' },
      lines: [['L003#4', 1.22, { continues: true }]],
      captions: [{ text: 'Citadel Sea', line: 'L003#4', word: 'citadel', lead: 0.1, hold: 1.05 }],
    },
    'P-14': {
      staging: 'NONE: a different sea: a long swell under low cloud, no coast; caption PROXY SEA on the words.',
      trans: ['dissolve', 12],
      cam: { rig: 'drone', pos: [[0, [0, 5, 0]], [2, [-3, 5, 1]]], look: [-1100, 18, 380], mm: 24, fstop: 5.6, focus: 400, ease: 'linear', shake: { kind: 'aerial', amount: 0.1 } },
      set: { loc: 'swell' },
      captions: [{ text: 'Proxy Sea', from: 0.0, to: 1.75 }],
    },
    'P-15': {
      staging: 'NONE: unreached islands far on the horizon at dawn; a very slow push; no caption.',
      trans: ['dissolve', 18],
      cam: { rig: 'push', pos: [0, 6, 0], look: [300, 70, -11000], mm: 24, fstop: 5.6, focus: 9000, push: 0.006 },
      set: { loc: 'islands', sunTarget: [0, 0, -6000], shadowExtent: 9000 },
      lines: [['L003#5', 1.2]],
    },
    'P-16': {
      staging: 'NONE: a wing-shaped cloud drifts across a brightening morning sky; the camera tilts up from the sea to it.',
      trans: ['dissolve', 24],
      cam: { rig: 'tilt', pos: [0, 6, 0], look: [[0, [-200, 160, -3200]], [3.0, [-200, 160, -3200]], [10.5, [80, 1330, -3200]]], mm: 35, fstop: 5.6, focus: 3500, ease: 'sine' },
      set: { loc: 'sky', wing: { path: [[0, [-1000, 1380, -3250]], [11, [350, 1420, -3300]]] } },
      lines: [['L004', 2.0]],
    },
  },
};
