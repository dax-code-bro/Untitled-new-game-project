/* The five hundred animals, made visible.

   The ecology simulates the whole island whether or not anyone is looking,
   which is the point; this file is the window onto it. The simulation owns
   where every animal is and what it is doing, and the engine's sculpted
   quadrupeds own how that looks — the two are never allowed to disagree,
   because a deer that drifts from the deer the ecology thinks it is would
   make every shot a lie.

   The engine carries four fur-shelled archetypes. Twenty species share them,
   scaled to each individual's real shoulder height, so an elk and a whitetail
   are visibly different animals and a coyote is not the size of a wolf. A
   wolf currently wears a felid body; that is a gap in the sculpts, not in the
   simulation, and it is the honest way to have a wolf on the island at all.

   Blood trails, carcasses and tracks are here too, because tracking a
   wounded animal is the part of hunting most games skip and it is most of
   what hunting actually is.

   Listens: 'gunshot' { x, z, audibleM }   spooks everything in earshot
            'animal-wounded' { animal, severity, fromX, fromZ }
   Emits:   'animal-down' { animal, carcass }
   State:   ctx.state.animalActors  -> Map(animal.id -> actor) */
SurvivorGame.module({
  id: 'ecologyFeedback',
  order: 92,

  init(ctx) {
    const { LE, SV, game } = ctx;

    /* Which sculpt a species borrows, and how convincing that is. The engine
       has deer, rabbit, bear and lion; everything else is the nearest body
       plan at the right size. */
    const ARCHETYPE = {
      ungulate: 'deer', bear: 'bear', felid: 'lion', canid: 'lion',
      suid: 'bear', lagomorph: 'rabbit', rodent: 'rabbit',
      marsupial: 'rabbit', procyonid: 'rabbit', bird: 'rabbit',
    };

    const rendered = new Map();       // animal.id -> { beast, sim }
    ctx.state.animalActors = rendered;

    /* Render distance scales with the animal. An elk is worth drawing at two
       hundred metres because it is what gives a valley its sense of scale; a
       squirrel at forty metres is two pixels and a wasted draw call. */
    function visibleRange(a) {
      return 45 + a.shoulderHeightM * 165;
    }

    const MAX_DRAWN = 55;

    function sync() {
      const px = ctx.player.x, pz = ctx.player.z;
      const near = ctx.world.ecology.near(px, pz, 230);
      const want = near
        .filter((a) => Math.hypot(a.x - px, a.z - pz) < visibleRange(a))
        // Biggest first, so if the budget bites it bites the squirrels.
        .sort((a, b) => b.shoulderHeightM - a.shoulderHeightM)
        .slice(0, MAX_DRAWN);

      const keep = new Set();
      for (const a of want) {
        keep.add(a.id);
        if (rendered.has(a.id)) continue;
        /* Each species is now built to its own measurements rather than
           being one of four archetypes scaled up and down, and sex and life
           stage change the shape rather than only the size — so a fawn is
           leggy and short-bodied rather than a small deer, and a rutting
           buck carries the neck of one. */
        const modelId = LE.ANIMAL_SPECIES[a.speciesId] ? a.speciesId
          : (ARCHETYPE[a.species.class] || 'deer');
        const base = LE.ANIMAL_SPECIES[modelId];
        /* The simulation rolled this individual's own withers height, so
           the model is scaled to that animal rather than to the species
           average — which is what makes a big buck look like a big buck. */
        const form = LE.resolveForm(modelId, {
          sex: a.male ? 'male' : 'female', stage: a.stage,
        });
        const scaleMul = form.shoulder > 0 ? a.currentShoulderM / form.shoulder : 1;
        try {
          const beast = new LE.Animal(game, {
            species: modelId,
            sex: a.male ? 'male' : 'female',
            stage: a.stage,
            at: [a.x, a.y, a.z],
            scaleMul: Math.max(0.25, Math.min(2.2, scaleMul)),
            groundY: (x, z) => ctx.groundY(x, z),
            seed: a.id * 977,
          });
          if (beast.actor) beast.actor.userData = { kind: 'animal', animal: a };
          rendered.set(a.id, { beast, sim: a });
        } catch (err) {
          // A sculpt that will not build must not take the frame with it.
          rendered.set(a.id, { beast: null, sim: a });
        }
      }

      const now = ctx.world.clock.simSeconds || 0;
      for (const [id, rec] of rendered) {
        if (keep.has(id) && rec.sim.alive) continue;
        /* An animal that has just been killed does not blink out: it
           goes down, and the collapse is given its second and a half
           before the carcass renderer takes over. Only an animal that
           has simply walked out of range goes immediately. */
        if (!rec.sim.alive && rec.beast && rec.beast.die && !rec.dyingUntil) {
          rec.beast.die({ seconds: 1.4 });
          rec.dyingUntil = now + 3.0;
          continue;
        }
        if (rec.dyingUntil && now < rec.dyingUntil) continue;
        /* destroy() takes the eyes, antlers and horns with it. Destroying
           only the body actor left those parented to nothing, floating
           where the animal had been. */
        if (rec.beast && rec.beast.destroy) {
          try { rec.beast.destroy(); } catch (e) { /* already gone */ }
        } else if (rec.beast && rec.beast.actor) {
          try { rec.beast.actor.destroy(); } catch (e) { /* already gone */ }
        }
        rendered.delete(id);
      }
    }

    function drive() {
      for (const rec of rendered.values()) {
        const { beast, sim } = rec;
        if (!beast) continue;
        // A dying animal is still being animated — it is going down, and
        // the simulation no longer has an opinion about where it is.
        if (!sim.alive) continue;
        // The simulation is the authority on position and intent; the engine
        // animal only decides how that reads.
        beast.x = sim.x;
        beast.z = sim.z;
        beast.yaw = sim.heading;
        beast.speed = sim.speedMs;
        beast.state = (sim.behaviour === 'fleeing' || sim.behaviour === 'chasing'
          || sim.behaviour === 'attacking') ? 'run'
          : (sim.behaviour === 'grazing' || sim.behaviour === 'browsing'
            || sim.behaviour === 'scavenging') ? 'graze'
          : sim.behaviour === 'bedded' ? 'idle' : 'walk';
      }
    }

    /* ---- carcasses ---- */

    const carcassActors = new Map();

    function syncCarcasses() {
      const px = ctx.player.x, pz = ctx.player.z;
      const near = ctx.world.ecology.carcassesNear(px, pz, 200);
      const keep = new Set();
      for (const c of near) {
        keep.add(c);
        if (carcassActors.has(c)) {
          // Stage changes what it looks like: a fresh kill is a body, and
          // four days later it is a scatter of bone.
          const rec = carcassActors.get(c);
          if (rec.stage !== c.stage) { rec.actor.destroy(); carcassActors.delete(c); }
          else continue;
        }
        const skeletal = c.stage === 'skeletal';
        const size = Math.max(0.25, Math.cbrt(Math.max(c.massKg, 2)) * 0.22);
        const a = game.capsule({
          at: [c.x, ctx.groundY(c.x, c.z) + size * 0.5, c.z],
          radius: size * 0.55, height: size * 2.1,
          material: skeletal ? { preset: 'concrete', color: 0xcfc7b4, roughness: 0.85 }
            : { preset: 'skin', color: c.stage === 'fresh' ? 0x7a4a38 : 0x4d3a2c, roughness: 0.9 },
          static: true, name: 'carcass',
        });
        a.setRotation([90, (c.x * 13) % 360, 0]);
        a.userData = { kind: 'carcass', carcass: c };
        carcassActors.set(c, { actor: a, stage: c.stage });
      }
      for (const [c, rec] of carcassActors) {
        if (keep.has(c)) continue;
        try { rec.actor.destroy(); } catch (e) { /* already gone */ }
        carcassActors.delete(c);
      }
    }

    /* ---- blood trails ---- */

    /* A wounded animal leaves a trail whose colour says what you hit: frothy
       pink is lung and the animal is close to down, dark is liver and it will
       take a while, sparse means you clipped it and should think hard about
       whether to follow. That reading is the skill, so the marks have to
       persist long enough to be followed and to be told apart. */
    const trailMarks = [];
    const TRAIL_LIFE = 3600 * 6;      // simulated seconds; blood dries

    const TRAIL_COLOUR = {
      frothy: { color: 0xd4707a, size: 0.16 },
      dark: { color: 0x5c1c18, size: 0.13 },
      sparse: { color: 0x6e2a22, size: 0.08 },
    };

    function layTrail(animal) {
      const pts = ctx.world.ecology.bloodTrail(animal, 3.5);
      for (const p of pts) {
        if (trailMarks.length > 420) break;
        const look = TRAIL_COLOUR[p.kind] || TRAIL_COLOUR.sparse;
        const jitterX = ((p.x * 7919) % 1) * 0.6 - 0.3;
        const jitterZ = ((p.z * 6871) % 1) * 0.6 - 0.3;
        const x = p.x + jitterX, z = p.z + jitterZ;
        const a = game.box({
          at: [x, ctx.groundY(x, z) + 0.03, z],
          size: [look.size * (0.6 + p.amount * 6), 0.01, look.size * (0.6 + p.amount * 6)],
          material: { preset: 'fabric', color: look.color, roughness: 0.6 },
          static: true, physics: false, name: 'blood',
        });
        a.setRotation([0, (x * 37) % 360, 0]);
        a.userData = { kind: 'blood', trail: p.kind, animal };
        trailMarks.push({ actor: a, born: ctx.world.clock.totalDays * 86400 + ctx.world.clock.simSeconds, kind: p.kind });
      }
      ctx.log(`Blood on the ground — ${pts.length ? pts[0].kind : 'not much'}.`, true);
    }

    ctx.on('animal-wounded', (d) => {
      if (!d || !d.animal) return;
      try { layTrail(d.animal); } catch (err) { console.error('blood trail:', err); }
      /* Show what the terminal model decided. The flinch is the tell —
         a mule kick is a heart, a hunch is lungs, humped up and walking
         is gut — and reading it is how you decide whether to follow now
         or back out and come back in the morning. Skipping the animation
         throws that information away and leaves the player guessing. */
      const entry = rendered.get(d.animal.id);
      if (entry && entry.beast && entry.beast.react) {
        try {
          entry.beast.react(d.region || d.where || (d.severity > 0.7 ? 'lung' : 'muscle'),
            d.fromX, d.fromZ);
        } catch (err) { console.error('hit reaction:', err); }
      }
    });

    /* Going down. The ecology decides when an animal dies — from where it
       was hit, how much blood it has lost and how far it has run — and
       this is only the collapse. An animal that vanishes the instant it
       is killed is the single most immersion-breaking thing a hunting
       game can do. */
    function collapse(animal) {
      const entry = rendered.get(animal.id);
      if (!entry || !entry.beast || !entry.beast.die) return false;
      entry.beast.die({ seconds: 1.4 + Math.random() * 0.5 });
      entry.dyingUntil = (ctx.world.clock.simSeconds || 0) + 3.2;
      return true;
    }
    ctx.state.collapseAnimal = collapse;
    ctx.on('animal-down', (d) => { if (d && d.animal) collapse(d.animal); });

    /* ---- reacting to gunfire ---- */

    /* A shot tells everything inside its audible radius roughly where you
       are. That is the real cost of missing, and it is why the .22 and a
       suppressor are worth carrying. */
    ctx.on('gunshot', (d) => {
      if (!d) return;
      const r = Math.max(30, Math.min(2400, d.audibleM || 400));
      const heard = ctx.world.ecology.near(d.x, d.z, r);
      let spooked = 0;
      for (const a of heard) {
        const dist = Math.hypot(a.x - d.x, a.z - d.z);
        // Closer animals are more certain about where the noise came from.
        const certainty = 1 - dist / r;
        a.awareOfPlayer = Math.max(a.awareOfPlayer, 0.55 + certainty * 0.45);
        a.fear = Math.min(1, a.fear + certainty);
        if (a.awareOfPlayer > 0.7) {
          a.behaviour = 'fleeing';
          const away = Math.atan2(a.x - d.x, a.z - d.z);
          a.targetX = a.x + Math.sin(away) * (120 + certainty * 260);
          a.targetZ = a.z + Math.cos(away) * (120 + certainty * 260);
          spooked++;
        }
      }
      if (spooked > 3) ctx.log(`That was heard. ${spooked} animals are moving.`);
    });

    /* ---- tracks ---- */

    /* Footprints only where the ground takes them. On rock and dry grass an
       animal leaves nothing, which is exactly why a hunter follows the wet
       ground and the game rewards knowing that. */
    const SOFT = new Set(['beach', 'dune', 'saltMarsh', 'freshMarsh', 'riverbank', 'meadow']);
    const tracks = [];
    let trackTimer = 0;

    function layTracks(dt) {
      trackTimer -= dt;
      if (trackTimer > 0) return;
      trackTimer = 1.4;
      const px = ctx.player.x, pz = ctx.player.z;
      for (const rec of rendered.values()) {
        const a = rec.sim;
        if (!a.alive || a.speedMs < 0.4) continue;
        if (Math.hypot(a.x - px, a.z - pz) > 90) continue;
        const b = ctx.biomeAt(a.x, a.z);
        if (!b || !SOFT.has(b.id)) continue;
        if (tracks.length > 300) break;
        const size = Math.max(0.05, a.shoulderHeightM * 0.09);
        const t = game.box({
          at: [a.x, ctx.groundY(a.x, a.z) + 0.015, a.z],
          size: [size, 0.006, size * 1.4],
          material: { preset: 'dirt', color: 0x2a2118, roughness: 1 },
          static: true, physics: false, name: 'track',
        });
        t.setRotation([0, a.heading * 180 / Math.PI, 0]);
        t.userData = { kind: 'track', species: a.speciesId, massKg: a.massKg };
        tracks.push({ actor: t, born: ctx.world.clock.totalDays * 86400 + ctx.world.clock.simSeconds });
      }
    }

    /* Marks fade. Blood dries and darkens, tracks wash out in rain and blow
       over in wind — so a cold trail really is cold. */
    function ageMarks() {
      const now = ctx.world.clock.totalDays * 86400 + ctx.world.clock.simSeconds;
      const rain = ctx.world.clock.environment().precipitation;
      const wash = 1 + rain * 0.6;
      for (let i = trailMarks.length - 1; i >= 0; i--) {
        const m = trailMarks[i];
        if ((now - m.born) * wash > TRAIL_LIFE) {
          try { m.actor.destroy(); } catch (e) { /* already gone */ }
          trailMarks.splice(i, 1);
        }
      }
      for (let i = tracks.length - 1; i >= 0; i--) {
        const t = tracks[i];
        if ((now - t.born) * wash > 3600 * 10) {
          try { t.actor.destroy(); } catch (e) { /* already gone */ }
          tracks.splice(i, 1);
        }
      }
    }

    /* ---- the loop ---- */

    let syncTimer = 0, ageTimer = 0;
    ctx.onUpdate((dt) => {
      // Which animals have geometry changes on the timescale animals walk,
      // not the timescale frames render.
      syncTimer -= dt;
      if (syncTimer <= 0) {
        syncTimer = 0.4;
        try { sync(); syncCarcasses(); } catch (err) { console.error('animal sync:', err); }
      }
      drive();
      layTracks(dt);
      ageTimer -= dt;
      if (ageTimer <= 0) { ageTimer = 4; ageMarks(); }
    });

    /* What the player is looking at, in the words a hunter would use. */
    ctx.state.describeAnimal = (a) => {
      if (!a) return null;
      const s = a.species;
      const cond = a.woundSeverity > 0.6 ? 'badly hurt'
        : a.woundSeverity > 0.15 ? 'hit' : null;
      const aware = a.awareOfPlayer > 0.75 ? 'it has you'
        : a.awareOfPlayer > 0.4 ? 'it is looking your way' : 'it has not noticed you';
      return `${s.name}${a.male ? ', male' : ''}, ${a.massKg.toFixed(0)} kg — ${aware}${cond ? `, ${cond}` : ''}`;
    };
  },
});
