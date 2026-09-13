/* ============================================================
   VETERANCY — the character hardens with the hours you put in.

   The design asks for a character who is not the same person after
   a hundred hours as they were on the first morning. Not a level
   with a number over it: a body that has been carrying loads and
   taking recoil and falling over for a long time, and behaves like
   one.

   What actually changes in a person who does this for years is
   narrow and real:

     - bone gets denser under load, so it takes more to break
     - the shoulder learns to meet recoil instead of absorbing it
     - blood volume and cardiac output go up with conditioning
     - pain stops being disabling, because it stops being novel
     - hypothermia comes on slower once brown fat has adapted

   None of that makes you bulletproof. A veteran shot through the
   femoral artery bleeds out on the same schedule as anyone else;
   they are just harder to get there. The cap is deliberate: 200 on
   the vitality scale against a baseline of 100, reached at around
   three hundred hours, and asymptotic so the last twenty per cent
   costs more than the first hundred.

   Hours are LIVED hours, not wall clock — time spent in a world
   with a character alive in it. Dying does not reset it, because
   the thing that hardened is the player.
   ============================================================ */

/* Where the curve tops out and how fast it gets there. Three hundred
   hours to be most of the way, which is a lot of playing and is meant
   to be. */
const VETERAN_HOURS = 300;
const VITALITY_MAX = 200;
const VITALITY_BASE = 100;

/* 0..1, asymptotic. Half the total gain by about seventy hours, ninety-five
   per cent of it by three hundred, never quite all of it. */
function hardening(hoursLived) {
  const h = Math.max(0, hoursLived || 0);
  return 1 - Math.exp(-h / (VETERAN_HOURS * 0.34));
}

/* The single number the UI shows. 100 on the first morning, 200 for
   someone who has genuinely lived on this island. */
function vitality(hoursLived) {
  return Math.round(VITALITY_BASE + (VITALITY_MAX - VITALITY_BASE) * hardening(hoursLived));
}

/* What that hardening is worth, term by term. Every one of these is
   a multiplier applied by the system that owns the thing, so nothing
   here reaches into anything. */
function veterancy(hoursLived) {
  const t = hardening(hoursLived);
  return {
    hours: hoursLived || 0,
    fraction: t,
    vitality: vitality(hoursLived),
    /* Bone. Loaded bone remodels denser — this is why a career infantry
       soldier's tibia takes more than a desk worker's. Forty per cent
       more energy to break at the top, which is real and is not a lot. */
    boneToughness: 1 + t * 0.40,
    /* Recoil. Almost all of what a new shooter suffers is flinch and a
       shoulder that is not meeting the gun. It never goes to zero. */
    recoilControl: 1 - t * 0.55,
    /* Conditioning: more blood to lose, and a heart that moves it. */
    bloodReserve: 1 + t * 0.18,
    /* Pain stops being disabling once it stops being surprising. */
    painTolerance: 1 - t * 0.45,
    /* Cold adaptation is real and it is smaller than people think. */
    coldTolerance: 1 + t * 0.22,
    /* Load carriage: the same pack costs less. */
    loadEfficiency: 1 - t * 0.25,
    /* And the hands are steadier, which is the sway term. */
    steadiness: 1 - t * 0.35,
    title: t < 0.08 ? 'washed up'
      : t < 0.22 ? 'getting by'
        : t < 0.45 ? 'settled in'
          : t < 0.7 ? 'hard'
            : t < 0.9 ? 'weathered'
              : 'part of the island',
  };
}

/* The record that survives a death and a reload. Deliberately tiny:
   hours lived, and enough to show a player what they have done. */
class Veterancy {
  constructor(saved = {}) {
    this.hoursLived = saved.hoursLived || 0;
    this.daysSurvivedBest = saved.daysSurvivedBest || 0;
    this.livesLost = saved.livesLost || 0;
    this.animalsTaken = saved.animalsTaken || 0;
    this.metresWalked = saved.metresWalked || 0;
  }

  /* Called with simulated seconds actually lived. */
  live(seconds) {
    if (!(seconds > 0)) return;
    this.hoursLived += seconds / 3600;
  }

  get stats() { return veterancy(this.hoursLived); }

  serialize() {
    return {
      hoursLived: this.hoursLived,
      daysSurvivedBest: this.daysSurvivedBest,
      livesLost: this.livesLost,
      animalsTaken: this.animalsTaken,
      metresWalked: this.metresWalked,
    };
  }

  static load(raw) {
    if (!raw) return new Veterancy();
    try { return new Veterancy(typeof raw === 'string' ? JSON.parse(raw) : raw); }
    catch (e) { return new Veterancy(); }
  }
}
