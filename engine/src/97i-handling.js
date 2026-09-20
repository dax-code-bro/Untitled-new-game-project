/* ==================================================================
   THE NOISES A WEAPON MAKES WHEN NOBODY IS SHOOTING IT
   ==================================================================

   A gunshot is a report. Everything else a weapon does -- a magazine
   dropping out, a bolt running home, a cover coming up, a cylinder
   closing, a shell going up the gate -- is a small mechanical noise,
   and multiplayer had none of them. Seventy-five weapons reloading,
   swapping and being inspected in silence, while zombies next door had
   a tuned set that nothing else could reach.

   So they are here. Each one is two or three calls into the engine's
   own audio and nothing else: a tone at a frequency, an impact, and
   sometimes a second one a few tens of milliseconds later, because a
   mechanism is a sequence and not a click.

   Both games call these. Zombies' makeSfx delegates to them rather than
   keeping a second copy, so the two cannot drift -- the numbers below
   are the numbers that were tuned there.

   `game.handling('magIn')`, and an unknown name is silently nothing:
   a weapon with no cover should not throw when something asks for one. */

const HANDLING = {
  /* A magazine catch, and the magazine leaving. */
  magRelease: (t, A) => { t(1500, 0.022, 'square', 0.07); },
  magOut: (t, A) => { t(420, 0.05, 'square', 0.07); A.impact(0.2); },
  magIn: (t, A) => {
    t(300, 0.06, 'square', 0.09); A.impact(0.35); t(900, 0.03, 'square', 0.05);
  },
  slideRelease: (t, A) => {
    A.impact(0.55); t(1250, 0.035, 'square', 0.09); t(600, 0.05, 'sawtooth', 0.07);
  },
  dryFire: (t) => { t(1300, 0.02, 'square', 0.06); },
  /* A bolt is a long steel noise in two parts: the handle turning up and
     the body running back, then the same in reverse with a round under
     it. */
  boltBack: (t, A, later) => {
    t(240, 0.05, 'square', 0.06); later(() => t(180, 0.11, 'sawtooth', 0.07), 60);
  },
  boltHome: (t, A, later) => {
    t(200, 0.09, 'sawtooth', 0.07);
    later(() => { A.impact(0.42); t(760, 0.03, 'square', 0.08); }, 90);
  },
  clipIn: (t, A, later) => {
    t(1900, 0.02, 'square', 0.05);
    for (let i = 0; i < 3; i++) later(() => t(520 - i * 40, 0.03, 'triangle', 0.05), 70 + i * 55);
  },
  /* A stamped top cover is a big thin sheet: it comes up with a ringing
     creak and goes down like a car bonnet, and a belt going into the
     tray is fifty brass links landing on steel, not one click. */
  coverUp: (t, A, later) => {
    t(420, 0.05, 'sawtooth', 0.06);
    later(() => { t(1150, 0.09, 'triangle', 0.05); A.impact(0.22); }, 70);
  },
  coverDown: (t, A, later) => {
    A.impact(0.72); t(240, 0.07, 'square', 0.11);
    later(() => { t(1600, 0.03, 'square', 0.07); t(900, 0.05, 'triangle', 0.05); }, 55);
  },
  beltIn: (t, A, later) => {
    for (let i = 0; i < 6; i++) {
      later(() => t(1500 + Math.random() * 900, 0.018, 'square', 0.045), i * 34);
    }
    later(() => A.impact(0.30), 170);
  },
  cellOut: (t) => { t(880, 0.05, 'triangle', 0.06); t(160, 0.10, 'sawtooth', 0.05); },
  cellIn: (t, A, later) => {
    A.impact(0.35); t(300, 0.06, 'square', 0.07);
    later(() => t(1240, 0.09, 'sine', 0.06), 80);
  },
  /* Cloth, then the weight of the next one arriving. */
  swap: (t, A, later) => {
    t(700, 0.04, 'triangle', 0.045);
    later(() => A.impact(0.22, { volume: 0.4 }), 90);
  },

  /* ---- AND THE ONES NEITHER GAME HAD ----
   *
     Four mechanisms were being animated in silence because the sound
     bank predates them: the hinge on a break gun, the gate on a tube
     gun, the crane on a revolver and the forend on a pump. */

  /* A break gun opening: a latch, a long hinge, and the ejectors
     throwing two cases clear. */
  hingeOpen: (t, A, later) => {
    t(1700, 0.02, 'square', 0.06);
    later(() => { t(300, 0.10, 'sawtooth', 0.05); A.impact(0.18, { volume: 0.5 }); }, 55);
    later(() => { t(1300, 0.03, 'square', 0.05); t(1900, 0.02, 'square', 0.035); }, 150);
  },
  /* And closing: a heavy steel clack that a shotgun is known for. */
  hingeShut: (t, A, later) => {
    t(220, 0.06, 'square', 0.10); A.impact(0.60);
    later(() => t(1450, 0.025, 'square', 0.06), 40);
  },
  /* A shell thumbed up the loading gate: brass on steel, then the
     lifter taking it. */
  shellIn: (t, A, later) => {
    t(760, 0.03, 'triangle', 0.055);
    later(() => { A.impact(0.20, { volume: 0.6 }); t(430, 0.04, 'square', 0.05); }, 45);
  },
  /* A pump worked: back, and forward hard. */
  rack: (t, A, later) => {
    t(330, 0.05, 'sawtooth', 0.075);
    later(() => { A.impact(0.45); t(520, 0.05, 'square', 0.08); }, 95);
  },
  /* A cylinder swung out on its crane, and the ejector rod pushed. */
  craneOut: (t, A, later) => {
    t(1250, 0.025, 'square', 0.055);
    later(() => t(620, 0.07, 'triangle', 0.05), 50);
  },
  ejectorRod: (t, A, later) => {
    t(900, 0.04, 'square', 0.05);
    for (let i = 0; i < 4; i++) {
      later(() => t(1100 + Math.random() * 700, 0.02, 'triangle', 0.035), 40 + i * 28);
    }
  },
  craneShut: (t, A, later) => {
    A.impact(0.40); t(380, 0.05, 'square', 0.08);
    later(() => t(1500, 0.02, 'square', 0.05), 45);
  },
  /* A loose round thumbed into a chamber. */
  roundIn: (t) => { t(1050, 0.022, 'triangle', 0.04); t(560, 0.03, 'square', 0.035); },
  /* A rocket pushed down a tube: a long scrape and a stop. */
  rocketIn: (t, A, later) => {
    t(150, 0.16, 'sawtooth', 0.055);
    later(() => { A.impact(0.34); t(280, 0.05, 'square', 0.07); }, 150);
  },
  /* An inspect: the weapon turned over in the hands, and a tap on the
     base of the magazine. Quiet -- it is a thing you do to yourself. */
  turnOver: (t) => { t(520, 0.05, 'triangle', 0.025); t(300, 0.06, 'sine', 0.02); },
  magTap: (t, A) => { A.impact(0.16, { volume: 0.45 }); t(640, 0.02, 'square', 0.03); },
};

/* Play one. Unknown names do nothing, on purpose: the caller asks for
   the noise its mechanism makes and a weapon without that mechanism
   should not have to guard the call. */
Engine.prototype.handling = function (name, o = {}) {
  const fn = HANDLING[name];
  const A = this.audio;
  if (!fn || !A || !A.tone) return false;
  const gain = o.volume == null ? 1 : o.volume;
  const t = (f, d, ty, v) => A.tone(f, d, ty, v * gain);
  /* Deferred parts of a sequence. setTimeout rather than a scheduled
     audio node because that is what the tuned originals used, and the
     numbers below were tuned against its behaviour. */
  const later = (fn2, ms) => setTimeout(fn2, ms);
  try { fn(t, A, later); } catch (e) { return false; }
  return true;
};

/* Which noise a reload makes at which beat, per kind. The caller has
   the clock; this says what belongs on it.

   Fractions through the reload, chosen against the beat the weapon's
   own part changes on -- the same reasoning as RELOAD_WINDOW, and the
   same numbers where they overlap, so the sound lands on the movement
   rather than near it. */
const RELOAD_SOUNDS = {
  mag: [[0.06, 'magRelease'], [0.18, 'magOut'], [0.62, 'magIn'], [0.86, 'slideRelease']],
  clip: [[0.08, 'boltBack'], [0.30, 'clipIn'], [0.78, 'boltHome']],
  cell: [[0.10, 'cellOut'], [0.66, 'cellIn'], [0.88, 'boltHome']],
  belt: [[0.06, 'boltHome'], [0.18, 'coverUp'], [0.62, 'beltIn'],
    [0.76, 'coverDown'], [0.90, 'boltHome']],
  break: [[0.10, 'hingeOpen'], [0.62, 'shellIn'], [0.84, 'hingeShut']],
  revolver: [[0.08, 'craneOut'], [0.18, 'ejectorRod'],
    [0.32, 'roundIn'], [0.48, 'roundIn'], [0.62, 'roundIn'], [0.74, 'roundIn'],
    [0.88, 'craneShut']],
  tube: [[0.10, 'shellIn'], [0.28, 'shellIn'], [0.46, 'shellIn'],
    [0.64, 'shellIn'], [0.82, 'shellIn'], [0.94, 'rack']],
  rocket: [[0.12, 'turnOver'], [0.60, 'rocketIn'], [0.90, 'boltHome']],
};

/* And the inspect, which is the same everywhere. */
const INSPECT_SOUNDS = [[0.14, 'turnOver'], [0.26, 'boltBack'], [0.50, 'boltHome'],
  [0.62, 'turnOver'], [0.70, 'magTap']];

/* Step a cue list. `was` and `now` are the fractions this frame spans;
   anything whose mark falls inside plays exactly once. Returns nothing
   -- the caller keeps no state beyond the two fractions it already has,
   which is what stops a sound firing twice on a long frame or never on
   a short one. */
Engine.prototype.cueSounds = function (list, was, now, o = {}) {
  if (!list || !(now > was)) return;
  for (let i = 0; i < list.length; i++) {
    const at = list[i][0];
    if (at > was && at <= now) this.handling(list[i][1], o);
  }
};
