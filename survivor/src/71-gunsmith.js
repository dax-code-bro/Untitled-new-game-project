/* ============================================================
   GUNSMITH — the mechanism, the strip, and the bench.

   70-firearms.js knows what a gun is worth: how reliable it is,
   how straight it shoots, what wears out. It does not know what
   the player's hands are doing. This file is that: the selector
   going from safe to semi, the rod going down the bore, rounds
   going into a magazine one at a time, the case leaving the port,
   and the whole thing coming apart on a bench and going back
   together — possibly not the way it started.

   The rule throughout is that an operation is a sequence with
   prerequisites, not a button. You cannot clean the bore with the
   barrel in the stock, you cannot drop the bolt out past a mounted
   scope, and you cannot get the trigger group out before the
   floorplate. That is what makes maintenance a thing the player
   does rather than a thing they buy.
   ============================================================ */

/* ---------------- fire control ---------------- */

const FIRE_MODE = { safe: 'safe', semi: 'semi', burst: 'burst', auto: 'auto' };

/* Which positions a given action actually has. A bolt gun has a
   safety and one way to fire it; an AK's lever is safe-auto-semi in
   that order, top to bottom, which is famously the wrong order and
   is why the first position under your thumb is full automatic. */
const MODES_FOR_ACTION = {
  boltAction: [FIRE_MODE.safe, FIRE_MODE.semi],
  leverAction: [FIRE_MODE.safe, FIRE_MODE.semi],
  pump: [FIRE_MODE.safe, FIRE_MODE.semi],
  semiAuto: [FIRE_MODE.safe, FIRE_MODE.semi],
  fullAuto: [FIRE_MODE.safe, FIRE_MODE.auto, FIRE_MODE.semi],
  revolver: [FIRE_MODE.semi],            // a double action has no safety
  breakAction: [FIRE_MODE.safe, FIRE_MODE.semi],
  singleShot: [FIRE_MODE.safe, FIRE_MODE.semi],
};

function modesFor(spec) {
  const m = MODES_FOR_ACTION[spec.action] || [FIRE_MODE.safe, FIRE_MODE.semi];
  return spec.burst ? m.concat([FIRE_MODE.burst]) : m;
}

/* How far round the selector has swung, 0..1, for the viewmodel to
   rotate the actual lever through. */
function selectorFraction(modes, mode) {
  const i = modes.indexOf(mode);
  return i < 0 ? 0 : i / Math.max(1, modes.length - 1);
}

/* ---------------- loading, one round at a time ----------------

   A magazine is a real object: a body with a capacity, a spring
   with its own condition, and a stack of rounds in the order they
   went in. Rounds come out last-in-first-out, which is why the
   round you chamber is the one you put in most recently and why
   topping off a partly-full magazine does not get you back the
   round you fired first. */

class Magazine {
  constructor(opts = {}) {
    this.capacity = opts.capacity || 5;
    this.rounds = [];
    this.springCondition = opts.springCondition != null ? opts.springCondition : 1;
    this.id = opts.id || 'mag';
    this.detachable = opts.detachable !== false;
    this.seated = opts.seated !== false;
  }

  get count() { return this.rounds.length; }
  get full() { return this.rounds.length >= this.capacity; }

  /* One round in. Returns how long the hand took, because thumbing
     thirty rounds into a magazine is thirty separate seconds of not
     watching the treeline. The last few are slower: the spring is
     nearly fully compressed and the rounds fight you. */
  push(round) {
    if (this.full) return { ok: false, reason: 'full' };
    this.rounds.push(round);
    const fill = this.rounds.length / this.capacity;
    // About a second and a half a round for the first two thirds, slower
    // as the spring stacks up: roughly 45 seconds for a full AK magazine,
    // which is what it takes.
    return { ok: true, seconds: 0.95 + fill * fill * 1.5, count: this.rounds.length };
  }

  pop() { return this.rounds.pop() || null; }

  /* A stripper clip: five rounds pressed in in one motion. Worth
     about four times thumbing them in, which is exactly why the
     things existed. */
  pushClip(rounds) {
    let n = 0;
    for (const r of rounds) { if (this.full) break; this.rounds.push(r); n++; }
    return { ok: n > 0, loaded: n, seconds: 2.6 + n * 0.15 };
  }

  /* A weak spring does not fail evenly — it fails at the bottom of
     the stack, where it is least compressed and has least to give.
     So a magazine that works fine with five rounds in it stops
     feeding the last two. */
  willFeed(rng = Math.random) {
    if (!this.rounds.length) return false;
    const depth = 1 - this.rounds.length / this.capacity;   // 0 full, 1 nearly empty
    const margin = this.springCondition - depth * 0.55;
    return rng() < clamp01(0.55 + margin * 0.8);
  }
}

/* ---------------- the strip ----------------

   Taking a gun apart is an ordered sequence with prerequisites.
   The order comes from the assembly itself — every part carries
   the position it comes off at — and the prerequisites are the few
   rules that actually bite: it has to be unloaded, the optic comes
   off before the bolt on a rifle whose scope sits over the port,
   and the barrel does not leave the stock until the action screws
   are out. */

const STRIP_BLOCKERS = {
  bolt: ['scope', 'scopeRings'],
  barrel: ['stock', 'handguard', 'receiver'],
  receiver: ['stock'],
  firingPin: ['bolt'],
  firingPinSpring: ['bolt'],
  extractor: ['bolt'],
  sear: ['trigger', 'triggerGuard'],
  hammer: ['triggerGuard'],
  magFollower: ['magazine', 'floorplate'],
  magazineSpring: ['magazine', 'floorplate', 'magTube'],
  cylinder: ['ejectorRod'],
};

/* How long each part takes to get out, in seconds, with the tools
   to hand. The numbers are what the job actually takes: a bolt is
   a two-second pull, a trigger group is ten minutes of small
   springs and a punch. */
const STRIP_SECONDS = {
  magazine: 1.2, floorplate: 4, bolt: 2.5, pumpHandle: 30,
  firingPin: 45, firingPinSpring: 40, extractor: 90,
  trigger: 240, sear: 300, hammer: 200, triggerGuard: 60,
  selector: 45, magFollower: 8, magazineSpring: 10, magTube: 120,
  handguard: 40, gasSystem: 70, stock: 150, grip: 60, recoilPad: 90,
  barrel: 600, receiver: 300, cylinder: 20, ejectorRod: 15,
  scope: 90, scopeRings: 120, muzzleDevice: 45, bipod: 30,
  frontSight: 400, rearSight: 300, slide: 20, floorPlate: 4,
};

class StripState {
  constructor(assembly, firearm) {
    this.assembly = assembly;
    this.firearm = firearm;
    this.removed = new Set();
    this.elapsed = 0;
    this.lost = new Set();
  }

  present(id) { return !this.removed.has(id); }
  get open() { return this.removed.size > 0; }

  /* Is this part reachable right now? Everything in front of it has
     to be off first, and the gun has to be clear. */
  canRemove(id) {
    const part = this.assembly.parts.find((x) => x.id === id);
    if (!part) return { ok: false, reason: 'no such part' };
    if (part.virtual) return { ok: false, reason: `the ${part.name} is not a part you can hold` };
    if (this.removed.has(id)) return { ok: false, reason: 'already off' };
    if (this.firearm && this.firearm.chambered) {
      return { ok: false, reason: 'there is a round in the chamber — clear it first' };
    }
    const blockers = (STRIP_BLOCKERS[id] || []).filter(
      (b) => this.assembly.parts.some((x) => x.id === b) && !this.removed.has(b),
    );
    if (blockers.length) {
      const names = blockers.map((b) => {
        const q = this.assembly.parts.find((x) => x.id === b);
        return q ? q.name : b;
      });
      return { ok: false, reason: `the ${names.join(' and the ')} ${names.length > 1 ? 'are' : 'is'} in the way` };
    }
    return { ok: true, seconds: STRIP_SECONDS[id] || 60 };
  }

  /* Take it off. Small parts under spring tension get away from you
     in the field — which is the real argument for doing a detail
     strip on a bench and not on a hillside in the rain. */
  remove(id, opts = {}) {
    const check = this.canRemove(id);
    if (!check.ok) return check;
    const part = this.assembly.parts.find((x) => x.id === id);
    this.removed.add(id);
    // Anything that rides on this part comes off with it.
    for (const other of this.assembly.parts) {
      if (other.rides === id) this.removed.add(other.id);
    }
    this.elapsed += check.seconds;
    // Case-insensitive: the ids are camelCase, so /pin/ never matched
    // 'firingPin' and nothing was ever lost in the grass.
    const springy = /spring|pin|extractor|follower|sear/i.test(id);
    if (springy && !opts.onBench) {
      const rng = opts.rng || Math.random;
      if (rng() < 0.18) {
        this.lost.add(id);
        return { ok: true, removed: part.name, seconds: check.seconds, lost: true,
          reason: `the ${part.name} went into the grass and you are not going to find it` };
      }
    }
    return { ok: true, removed: part.name, seconds: check.seconds };
  }

  /* Putting it back. The gun only goes together in the reverse
     order it came apart, and anything that rides on a part cannot
     go on before the part it rides on. */
  refit(id) {
    const part = this.assembly.parts.find((x) => x.id === id);
    if (!part) return { ok: false, reason: 'no such part' };
    if (!this.removed.has(id)) return { ok: false, reason: 'it is already on' };
    if (this.lost.has(id)) return { ok: false, reason: `you do not have a ${part.name} any more` };
    /* A part that rides INSIDE another goes back into it in your hand,
       before the host goes back on the gun — a firing pin is assembled
       into a bolt on the bench and the bolt then goes into the rifle.
       Requiring the host to be fitted first deadlocked the rebuild: the
       pin waited for the bolt and the bolt waited for the pin. */
    // Anything this part blocks must still be off, or it will not seat.
    for (const [other, blockers] of Object.entries(STRIP_BLOCKERS)) {
      if (blockers.includes(id) && this.removed.has(other)) {
        const q = this.assembly.parts.find((x) => x.id === other);
        return { ok: false, reason: `the ${q ? q.name : other} goes in before this does` };
      }
    }
    this.removed.delete(id);
    this.elapsed += (STRIP_SECONDS[id] || 60) * 1.3;   // it always goes back slower
    return { ok: true, refitted: part.name };
  }

  /* What is left to do, in the order it has to be done. */
  nextSteps() {
    const out = [];
    for (const part of this.assembly.parts) {
      if (part.virtual || part.rides) continue;
      if (this.removed.has(part.id)) continue;
      const c = this.canRemove(part.id);
      if (c.ok) out.push({ id: part.id, name: part.name, seconds: c.seconds });
    }
    return out.sort((a, b) => a.seconds - b.seconds);
  }

  complete() { return this.removed.size === 0; }
  missing() { return Array.from(this.lost); }
}

/* ---------------- cleaning ----------------

   Not a button. A bore is cleaned with a rod, and a rod carries
   either a bronze brush or a patch: the brush breaks the carbon
   and copper loose, the patch carries it out, and neither does
   anything without solvent. The first patch through a filthy bore
   comes out black and takes most of the fouling with it; the tenth
   comes out nearly clean and takes almost nothing, which is why
   the job has a natural end.

   Copper fouling is separate from carbon and does not come out
   with the same solvent, which is the thing that surprises people
   the first time a rifle stops shooting groups and the bore looks
   clean. */

const BORE_PASS = {
  patch: { carbon: 0.34, copper: 0.02, seconds: 22, needsSolvent: true },
  brush: { carbon: 0.18, copper: 0.26, seconds: 30, needsSolvent: true },
  dryPatch: { carbon: 0.06, copper: 0, seconds: 16, needsSolvent: false },
  boreSnake: { carbon: 0.22, copper: 0.05, seconds: 12, needsSolvent: false },
};

class CleaningJob {
  constructor(firearm) {
    this.firearm = firearm;
    this.passes = [];
    this.seconds = 0;
    // Copper is tracked separately from the carbon the firearm already
    // carries, because it comes out differently and it is what actually
    // opens a group up at range.
    if (firearm.copperFouling == null) {
      firearm.copperFouling = clamp01(firearm.roundsSinceCleaning / 900);
    }
  }

  /* One pass of the rod. */
  pass(kind, opts = {}) {
    const spec = BORE_PASS[kind];
    if (!spec) return { ok: false, reason: 'nothing to push down the bore' };
    if (!opts.hasRod && kind !== 'boreSnake') {
      return { ok: false, reason: 'you need a cleaning rod' };
    }
    if (spec.needsSolvent && !opts.solvent) {
      return { ok: false, reason: 'a dry patch will not shift carbon — you need solvent' };
    }
    const f = this.firearm;
    /* Diminishing returns: each pass takes a fraction of what is
       still there, so the bore approaches clean and never quite
       arrives, which is how it actually goes. */
    const beforeC = f.fouling, beforeCu = f.copperFouling;
    f.fouling = Math.max(0, f.fouling * (1 - spec.carbon));
    f.copperFouling = Math.max(0, f.copperFouling * (1 - spec.copper));
    this.seconds += spec.seconds;
    this.passes.push(kind);

    // What the patch looks like coming out. This is the whole feedback
    // loop: the player reads the patch, not a number.
    const lifted = (beforeC - f.fouling) + (beforeCu - f.copperFouling) * 0.6;
    let patch;
    if (lifted > 0.14) patch = 'the patch comes out black';
    else if (lifted > 0.06) patch = 'grey, and still coming';
    else if (lifted > 0.02) patch = 'faint grey';
    else patch = 'the patch comes out clean';
    if (kind === 'brush' && beforeCu - f.copperFouling > 0.05) {
      patch += ', with blue-green on it — that is copper';
    }

    if (f.parts.bore) f.parts.bore.fouling = f.fouling;
    if (f.fouling < 0.04 && f.copperFouling < 0.04) f.roundsSinceCleaning = 0;
    return {
      ok: true, patch, seconds: spec.seconds,
      fouling: f.fouling, copper: f.copperFouling,
      done: f.fouling < 0.04 && f.copperFouling < 0.04,
    };
  }

  /* Scrubbing an individual part, which is what a strip is for. A
     bolt face caked in primer residue is a light strike waiting to
     happen and no amount of running a rod down the bore touches it. */
  scrub(partName, opts = {}) {
    const f = this.firearm;
    const part = f.parts[partName];
    if (!part) return { ok: false, reason: 'no such part' };
    if (!part.spec.cleanable) return { ok: false, reason: `the ${part.spec.name} does not clean, it gets replaced` };
    if (!opts.solvent) return { ok: false, reason: 'you need solvent' };
    const was = part.fouling;
    part.fouling = Math.max(0, part.fouling * 0.15);
    this.seconds += 40;
    return {
      ok: true, cleaned: part.spec.name, seconds: 40,
      note: was > 0.4 ? `there was a lot of carbon on the ${part.spec.name}` : null,
    };
  }
}

/* ---------------- ejection ----------------

   Where the case goes. A bolt gun throws it wherever the shooter
   flicks it; a gas gun throws it right and slightly forward at a
   consistent angle, which is why you can find your brass. The case
   is hot, and it stays on the ground — nothing in this game
   despawns. */

const EJECT_PATTERN = {
  boltAction: { dirX: 0.9, dirY: 0.5, dirZ: 0.1, speed: 2.2, spread: 0.55 },
  leverAction: { dirX: 0.2, dirY: 0.95, dirZ: 0.1, speed: 2.8, spread: 0.4 },
  pump: { dirX: 0.85, dirY: 0.45, dirZ: 0.25, speed: 3.4, spread: 0.35 },
  semiAuto: { dirX: 0.92, dirY: 0.36, dirZ: 0.16, speed: 5.2, spread: 0.22 },
  fullAuto: { dirX: 0.90, dirY: 0.34, dirZ: 0.26, speed: 6.4, spread: 0.26 },
  revolver: null,                       // nothing comes out until you open it
  breakAction: { dirX: 0.1, dirY: 0.8, dirZ: -0.6, speed: 1.8, spread: 0.5 },
  singleShot: { dirX: 0.6, dirY: 0.6, dirZ: 0.2, speed: 2.0, spread: 0.5 },
};

/* The spent case: where it goes, how fast, how hot, and how long it
   stays hot. A case leaves the chamber at about 150 °C and will
   raise a blister; down the back of a collar it is the reason
   people drop rifles. */
function ejectCase(spec, opts = {}) {
    const pat = EJECT_PATTERN[spec.action];
  if (!pat) return null;
  const rng = opts.rng || Math.random;
  const jitter = (a) => a + (rng() - 0.5) * pat.spread;
  const cart = CARTRIDGES[opts.cartridgeId] || null;
  return {
    cartridgeId: opts.cartridgeId,
    dir: [jitter(pat.dirX), jitter(pat.dirY), jitter(pat.dirZ)],
    speedMs: pat.speed * (0.8 + rng() * 0.4),
    spinRad: (rng() - 0.5) * 40,
    tempC: 150 + (cart && cart.powderGr ? cart.powderGr : 20) * 0.9,
    massG: cart && cart.caseMassG ? cart.caseMassG : 10,
  };
}

/* ---------------- the parts bin ----------------

   The design asks that a gun can be rebuilt differently. Parts move
   between guns when they belong to the same family and the same
   bolt face — a .308 bolt will not close on a magnum case head, and
   a 700 trigger will not drop into an AK. Nothing here lets a part
   into a gun it does not fit. */

const PART_FAMILY = {
  remington700_308: 'rem700_standard', remington700_300wm: 'rem700_magnum',
  remington700_7mm: 'rem700_magnum', mauser98: 'mauser',
  ruger1022: 'ruger10_22', ak47: 'kalash', m16: 'ar15',
  colt1911: 'm1911', revolver357: 'kframe', revolver500: 'xframe',
  barrett50: 'm82', shotgun12: 'pump12',
};

/* Some parts are generic enough to move anywhere: a sling swivel is
   a sling swivel. Most are not. */
const UNIVERSAL_PARTS = new Set(['stock', 'recoilPad', 'grip', 'bipod', 'sling']);

function partFits(fromWeaponId, toWeaponId, partName) {
  if (fromWeaponId === toWeaponId) return { ok: true };
  if (UNIVERSAL_PARTS.has(partName)) {
    return { ok: true, note: 'it will need bedding, but it will go on' };
  }
  const a = PART_FAMILY[fromWeaponId], b = PART_FAMILY[toWeaponId];
  if (a && b && a === b) return { ok: true };
  // A standard-bolt-face 700 part into a magnum 700 and vice versa: the
  // receiver is the same, the bolt face is not.
  if (a && b && a.split('_')[0] === b.split('_')[0]) {
    if (partName === 'bolt' || partName === 'extractor') {
      return { ok: false, reason: 'the bolt face is wrong for that case head' };
    }
    return { ok: true, note: 'same action, different chambering — it fits' };
  }
  return { ok: false, reason: 'it is not the same gun' };
}

/* Move a part from one firearm to another. Condition comes with it,
   which is the point: a worn extractor pulled out of a beaten rifle
   is still a worn extractor in a good one. */
function swapPart(from, to, partName) {
  const fit = partFits(from.id, to.id, partName);
  if (!fit.ok) return fit;
  const src = from.parts[partName];
  const dst = to.parts[partName];
  if (!src) return { ok: false, reason: `that gun has no ${partName}` };
  if (!dst) return { ok: false, reason: `this one does not take a ${partName}` };
  const a = { condition: src.condition, broken: src.broken, fouling: src.fouling };
  src.condition = dst.condition; src.broken = dst.broken; src.fouling = dst.fouling;
  dst.condition = a.condition; dst.broken = a.broken; dst.fouling = a.fouling;
  return {
    ok: true, note: fit.note || null,
    swapped: partName,
    was: a.condition, now: dst.condition,
  };
}

/* What a gun looks like on a bench: every part, its condition, its
   fouling, and a sentence about what is wrong with it. This is the
   diagnosis loop the rest of the game runs on — symptoms, not
   numbers. */
function benchReport(firearm) {
  const out = [];
  for (const [name, p] of Object.entries(firearm.parts)) {
    let verdict = 'serviceable';
    if (p.broken) verdict = 'broken';
    else if (p.condition < 0.15) verdict = 'scrap';
    else if (p.condition < 0.35) verdict = 'worn out';
    else if (p.condition < 0.6) verdict = 'worn';
    else if (p.condition > 0.92) verdict = 'as new';
    let symptom = null;
    if (name === 'firingPin' && p.condition < 0.4) symptom = 'the tip is peened flat — expect light strikes';
    else if (name === 'extractor' && p.condition < 0.4) symptom = 'the claw is rounded — it will start leaving cases in the chamber';
    else if (name === 'recoilSpring' && p.condition < 0.5) symptom = 'it has taken a set — short-stroking next';
    else if (name === 'magazineSpring' && p.condition < 0.5) symptom = 'weak — the last rounds will not lift';
    else if (name === 'barrel' && p.condition < 0.4) symptom = 'the throat is eroded — the groups are gone and they are not coming back';
    else if (name === 'bore' && p.fouling > 0.5) symptom = 'caked with carbon';
    else if (name === 'sear' && p.condition < 0.4) symptom = 'the engagement is rounded — this will double or go off on its own';
    if (p.fouling > 0.5 && !symptom) symptom = 'filthy';
    out.push({
      part: name, name: p.spec.name, condition: p.condition,
      fouling: p.fouling, broken: p.broken, verdict, symptom,
      critical: p.spec.critical, cleanable: p.spec.cleanable,
    });
  }
  return out.sort((a, b) => a.condition - b.condition);
}
