/* Sign on the ground, and reading it.

   The ecology has been laying sign since the first day: tracks at each
   animal's own stride length and gait, droppings, beds it got up out of,
   rubs and scrapes a rutting buck worked, hair on a fence wire, and blood
   with a colour and a wait time that say where you hit it. Every one of
   those carries the animal that made it, when, how heavy it was, which
   way it was going and how fast. None of it was drawn. The whole tracking
   half of the game was running with the lights off.

   So: sign becomes objects in the world. A track is a pair of prints
   pressed into the ground, pointing the way the animal went, faint or
   sharp depending on how long ago and how much rain has fallen on it.
   Crouch over one and you get what a tracker would get — and what you get
   depends on how good you are at it, so the first hundred tracks you read
   tell you "something came through here" and by the thousandth you are
   reading a heavy buck at a trot two hours ago.

   Reading sign is the skill, so reading sign is what raises it.

   Emits:   'sign-read' { sign, read }
   State:   ctx.state.signActors -> Map(sign -> actor)
*/
SurvivorGame.module({
  id: 'tracking',
  order: 94,

  init(ctx) {
    const { LE, SV, game } = ctx;
    const eco = ctx.world.ecology;
    if (!eco || !eco.signs) return;

    /* How far sign is drawn. The ecology lays it out to 420 m so a trail
       exists to be picked up later; drawing all of it would be thousands
       of actors for marks nobody is looking at. Sixty metres is further
       than you can read one anyway. */
    const DRAW_M = 60;
    const MAX_ACTORS = 340;

    const shown = new Map();          // Sign -> { actor, extra: [] }
    ctx.state.signActors = shown;

    /* ---- what each kind of sign looks like ----

       Everything is built once and shared by key, so five hundred hoof
       prints are one upload and one instanced draw. */

    const GEO = {};

    /* A cloven hoof: two crescents, splayed a little, the way a deer's
       toes spread as the foot takes weight. A pad is four toes round a
       heel. Which one you get is the animal's foot, not its size. */
    function printGeometry(foot) {
      const key = `print:${foot}`;
      if (GEO[key]) return GEO[key];
      const g = new LE.Geometry();
      const blob = (cx, cz, rx, rz, rot) => {
        const N = 10;
        const c = Math.cos(rot), s = Math.sin(rot);
        const centre = g.vert(cx, 0, cz, 0, 1, 0, 0.5, 0.5);
        const ring = [];
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const px = Math.cos(a) * rx, pz = Math.sin(a) * rz;
          ring.push(g.vert(cx + px * c - pz * s, 0, cz + px * s + pz * c, 0, 1, 0,
            Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5));
        }
        /* Wound so the face points UP. A fan built the obvious way round
           in the XZ plane has its normal pointing at the ground, and the
           renderer culls back faces — every print, scuff, bed and blood
           mark in the game was being drawn face-down into the dirt. */
        for (let i = 0; i < N; i++) g.tri(centre, ring[i + 1], ring[i]);
      };
      if (foot === 'cloven') {
        // Two toes, points forward, splayed at the back.
        blob(-0.022, 0, 0.016, 0.040, 0.10);
        blob(0.022, 0, 0.016, 0.040, -0.10);
      } else if (foot === 'pad') {
        blob(0, -0.020, 0.034, 0.026, 0);                       // heel pad
        for (let i = 0; i < 4; i++) {
          const a = -0.9 + i * 0.6;
          blob(Math.sin(a) * 0.036, 0.028 + Math.cos(a) * 0.012, 0.012, 0.015, a);
        }
      } else if (foot === 'plantigrade') {
        blob(0, -0.010, 0.048, 0.062, 0);                       // the whole sole
        for (let i = 0; i < 5; i++) {
          const a = -1.0 + i * 0.5;
          blob(Math.sin(a) * 0.048, 0.062 + Math.cos(a) * 0.010, 0.013, 0.016, 0);
        }
      } else if (foot === 'boot') {
        // A lug sole: a rounded heel, an arch narrower than both, and a
        // forefoot. Unmistakable, and nothing else on the island makes one.
        blob(0, -0.075, 0.038, 0.042, 0);
        blob(0, 0.005, 0.026, 0.045, 0);
        blob(0, 0.070, 0.040, 0.048, 0);
      } else {                                                  // bird
        for (let i = 0; i < 3; i++) {
          const a = -0.7 + i * 0.7;
          blob(Math.sin(a) * 0.030, 0.020 + Math.cos(a) * 0.014, 0.006, 0.026, a);
        }
        blob(0, -0.016, 0.006, 0.018, Math.PI);                 // hallux, pointing back
      }
      GEO[key] = g.finalize();
      return GEO[key];
    }

    function discGeometry(key, r, lumps, seed) {
      if (GEO[key]) return GEO[key];
      const g = new LE.Geometry();
      const rng = new LE.Rng(seed || 7);
      for (let k = 0; k < lumps; k++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(0, r * 0.7);
        const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
        const rr = r * rng.range(0.25, 0.55);
        const N = 8;
        const centre = g.vert(cx, 0, cz, 0, 1, 0, 0.5, 0.5);
        const ring = [];
        for (let i = 0; i <= N; i++) {
          const t = (i / N) * Math.PI * 2;
          ring.push(g.vert(cx + Math.cos(t) * rr, 0, cz + Math.sin(t) * rr, 0, 1, 0, 0, 0));
        }
        // Face up, for the same reason as the prints above.
        for (let i = 0; i < N; i++) g.tri(centre, ring[i + 1], ring[i]);
      }
      GEO[key] = g.finalize();
      return GEO[key];
    }

    /* Droppings are three dimensional and they are how you tell a deer
       from an elk without seeing either. */
    function pelletGeometry(size) {
      const key = `pellet:${size.toFixed(3)}`;
      if (GEO[key]) return GEO[key];
      const g = new LE.Geometry();
      const rng = new LE.Rng(31);
      // Built at the right size to begin with. Merging unit spheres and
      // then scaling only Y left a pile of pellets two metres across.
      const sph = LE.Shapes.sphere(size, 6, 8);
      for (let i = 0; i < 9; i++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(0, size * 3.2);
        LE.mergeGeometry(g, sph, Math.cos(a) * d, size * 0.55, Math.sin(a) * d);
      }
      GEO[key] = g.finalize();
      return GEO[key];
    }

    /* Which foot a species leaves. This is anatomy, not a look-up of
       convenience: a bear walks on the whole sole and leaves a print you
       can mistake for a person's, which is the point of drawing it. */
    function footFor(speciesId) {
      // A person leaves a boot sole, and it is the one track on the
      // island that should stop you dead when you find it.
      if (speciesId === 'human') return 'boot';
      const s = SV.SPECIES ? SV.SPECIES[speciesId] : null;
      const cls = s ? s.class : null;
      if (cls === 'ungulate' || cls === 'suid') return 'cloven';
      if (cls === 'bear' || cls === 'procyonid' || cls === 'marsupial') return 'plantigrade';
      if (cls === 'bird') return 'bird';
      return 'pad';
    }

    /* Base colours are the PALE end of each mark, because tint can only
       multiply down: a fresh track is tinted dark and sharp, and an old
       one is left near its base colour so it sinks back into the ground.
       Starting from a dark brown meant fading could only make sign
       darker, and every mark on the island was an invisible smudge. */
    const MAT = {
      track: { color: 0xa8977a, roughness: 0.95, metalness: 0 },
      dropping: { color: 0x6b5a44, roughness: 0.86, metalness: 0 },
      bed: { color: 0xa8a678, roughness: 0.98, metalness: 0 },
      rub: { color: 0xd8c496, roughness: 0.82, metalness: 0 },
      scrape: { color: 0x9d8464, roughness: 0.96, metalness: 0 },
      wallow: { color: 0x8d7a5e, roughness: 0.9, metalness: 0 },
      feedSign: { color: 0x9dae72, roughness: 0.9, metalness: 0 },
      hair: { color: 0xc7b48e, roughness: 0.85, metalness: 0 },
    };

    /* Build the actors for one sign. A track is a PAIR of prints at the
       animal's stride, because one print is a smudge and two are a
       direction and a speed. */
    function makeActors(sg) {
      const S = SV.SPECIES ? SV.SPECIES[sg.speciesId] : null;
      const y = (x, z) => ctx.groundY(x, z) + 0.012;
      const made = [];
      const head = sg.heading || 0;
      const dirX = Math.sin(head), dirZ = Math.cos(head);

      if (sg.kind === 'track') {
        const foot = footFor(sg.speciesId);
        const geo = printGeometry(foot);
        // Bigger animal, bigger foot: a 300 kg elk's track is twice a
        // whitetail's across, which is most of how you tell them apart.
        const scale = Math.cbrt(Math.max(4, sg.massKg) / 60) * (foot === 'plantigrade' ? 1.15 : 1);
        const g2 = (SV.GAIT_SIGN && SV.GAIT_SIGN[sg.gait]) || { splay: 0.1 };
        for (const side of [-1, 1]) {
          const off = (g2.splay || 0.1) * scale * 1.6 * side;
          const px = sg.x - dirZ * off, pz = sg.z + dirX * off;
          /* Disturbed ground around the print. A real track is 7 cm long
             and from standing height that is a few pixels — what you
             actually spot at ten paces is the scuff, and you crouch and
             the scuff turns out to be a print. So both are drawn: a soft
             halo that carries at distance, and the print itself inside
             it for when you are over the top of it. */
          const halo = game.mesh({
            geometry: discGeometry('sign:scuff', 1, 5, 23), key: 'sign:scuff',
            material: { color: 0x8d7c62, roughness: 0.97, metalness: 0 },
            at: [px, y(px, pz) - 0.004, pz], physics: false, static: true, name: 'sign',
          });
          if (halo) { halo.setScale(scale * 0.13); made.push(halo); }
          const a = game.mesh({
            geometry: geo, key: `sign:${foot}`, material: MAT.track,
            at: [px, y(px, pz), pz], physics: false, static: true, name: 'sign',
          });
          if (!a) continue;
          a.setScale(scale);
          a.setRotation([0, (head * 180) / Math.PI, 0]);
          made.push(a);
        }
      } else if (sg.kind === 'dropping') {
        const size = Math.max(0.006, Math.cbrt(Math.max(4, sg.massKg) / 70) * 0.011);
        const a = game.mesh({
          geometry: pelletGeometry(Math.round(size * 400) / 400),
          key: `sign:pellet:${(Math.round(size * 400) / 400).toFixed(3)}`,
          material: MAT.dropping, at: [sg.x, y(sg.x, sg.z), sg.z],
          physics: false, static: true, name: 'sign',
        });
        if (a) made.push(a);
      } else if (sg.kind === 'bed') {
        // A bed is flattened grass the size of the animal that lay in it.
        const len = Math.max(0.4, sg.amount || 1);
        const a = game.mesh({
          geometry: discGeometry('sign:bed', 1, 7, 11), key: 'sign:bed',
          material: MAT.bed, at: [sg.x, y(sg.x, sg.z) - 0.006, sg.z],
          physics: false, static: true, name: 'sign',
        });
        if (a) { a.setScale(len * 0.42); a.setRotation([0, (head * 180) / Math.PI, 0]); made.push(a); }
      } else if (sg.kind === 'rub' || sg.kind === 'scrape') {
        if (sg.kind === 'rub') {
          /* A rub is bark stripped off a sapling at antler height, and it
             is the single most readable piece of sign in the woods — it
             says a buck was here and how big he is from how high it goes. */
          const h = 0.45 + Math.min(0.7, sg.massKg / 260);
          const a = game.box({
            at: [sg.x, ctx.groundY(sg.x, sg.z) + h * 0.5 + 0.25, sg.z],
            size: [0.075, h, 0.03], material: MAT.rub,
            static: true, physics: false, name: 'sign',
          });
          if (a) { a.setRotation([0, (head * 180) / Math.PI, 0]); made.push(a); }
        } else {
          const a = game.mesh({
            geometry: discGeometry('sign:scrape', 1, 9, 5), key: 'sign:scrape',
            material: MAT.scrape, at: [sg.x, y(sg.x, sg.z) - 0.004, sg.z],
            physics: false, static: true, name: 'sign',
          });
          if (a) { a.setScale(0.55); made.push(a); }
        }
      } else if (sg.kind === 'hair') {
        const a = game.box({
          at: [sg.x, ctx.groundY(sg.x, sg.z) + 0.18, sg.z],
          size: [0.05, 0.06, 0.012], material: MAT.hair,
          static: true, physics: false, name: 'sign',
        });
        if (a) { a.setRotation([12, (head * 180) / Math.PI, 8]); made.push(a); }
      } else if (sg.kind === 'wallow' || sg.kind === 'feedSign') {
        const a = game.mesh({
          geometry: discGeometry(`sign:${sg.kind}`, 1, 8, sg.kind === 'wallow' ? 3 : 9),
          key: `sign:${sg.kind}`, material: MAT[sg.kind],
          at: [sg.x, y(sg.x, sg.z) - 0.005, sg.z], physics: false, static: true, name: 'sign',
        });
        if (a) { a.setScale(sg.kind === 'wallow' ? 0.9 : 0.4); made.push(a); }
      } else if (sg.kind === 'blood') {
        /* Blood is drawn in the colour it actually is, because the colour
           IS the diagnosis: bright frothy pink is lungs and it is nearly
           over; dark and thick is liver and you wait an hour. */
        const b = sg.blood || {};
        const size = 0.10 + (b.volume || 0.5) * (sg.amount || 1) * 0.24;
        const a = game.mesh({
          geometry: discGeometry('sign:blood', 1, 6, 17), key: 'sign:blood',
          material: { color: b.colour || 0x7a1c18, roughness: 0.34, metalness: 0 },
          at: [sg.x, y(sg.x, sg.z) - 0.002, sg.z], physics: false, static: true, name: 'sign',
        });
        if (a) { a.setScale(size); made.push(a); }
      }
      void S;
      for (const a of made) a.userData = { kind: 'sign', sign: sg };
      return made;
    }

    /* Sign fades rather than vanishing: an old track is a shallow scuff
       and a fresh one is a sharp edge, and the difference is the whole
       reading. Tint carries it. */
    function fade(entry, fresh) {
      /* Old sign is shallower and paler; fresh sign is a sharp dark edge
         with crumbs of soil standing up around it. Tint multiplies, so
         fresh means tinted DOWN toward the shadow inside the print, and
         old means left near the pale base colour of disturbed ground.
         The previous version OR-ed the channels together, which pinned
         every mark at full brightness whatever its age. */
      const dark = 0.42 + (1 - fresh) * 0.58;          // 0.42 fresh -> 1.0 gone
      const c = Math.max(0, Math.min(255, Math.round(dark * 255)));
      const tint = (c << 16) | (c << 8) | c;
      for (const a of entry.actors) {
        if (a.userData.baseScale == null) a.userData.baseScale = a.scale.x;
        a.setScale(a.userData.baseScale * (0.7 + fresh * 0.3));
        a.setTint(tint);
      }
    }

    /* ---- keeping the drawn set in step with the simulated one ---- */

    let sweep = 0;
    function refresh() {
      const px = ctx.player.x, pz = ctx.player.z;
      const weather = ctx.world.clock.environment();
      const live = new Set();
      let count = 0;
      for (const sg of eco.signs) {
        if (count >= MAX_ACTORS) break;
        const d = Math.hypot(sg.x - px, sg.z - pz);
        if (d > DRAW_M) continue;
        const fresh = sg.freshness(eco.nowDays, weather);
        if (fresh <= 0.04) continue;
        live.add(sg);
        count++;
        let entry = shown.get(sg);
        if (!entry) {
          const actors = makeActors(sg);
          if (!actors.length) continue;
          entry = { actors, fresh: -1 };
          shown.set(sg, entry);
        }
        if (entry.fresh < 0 || Math.abs(entry.fresh - fresh) > 0.06) { entry.fresh = fresh; fade(entry, fresh); }
      }
      // Anything out of range or washed away goes.
      for (const [sg, entry] of shown) {
        if (live.has(sg)) continue;
        for (const a of entry.actors) { try { a.destroy(); } catch (e) { /* gone */ } }
        shown.delete(sg);
      }
    }

    /* ---- reading it ---- */

    /* What a tracker says out loud. The simulation already decided what
       is legible from this piece of sign given how good you are; this
       turns that into the sentence a person would actually say. */
    function sentence(read, sgSpecies) {
      const bits = [];
      const human = read.kind === 'track' && sgSpecies === 'human';
      const what = human ? 'boot prints'
        : (read.species && read.species !== 'something' ? read.species : 'Something');
      if (read.kind === 'blood') {
        bits.push(`Blood — ${read.blood || 'hard to say'}.`);
        if (read.means) bits.push(read.means);
        return bits.join(' ');
      }
      if (read.kind === 'track') {
        let s = `${what[0].toUpperCase()}${what.slice(1)}`;
        if (read.sizeClass) s += `, ${read.sizeClass}`;
        if (read.sex) s += `, a ${read.sex}`;
        if (read.gait) s += `, ${read.gait}`;
        s += `, ${read.when}.`;
        bits.push(s);
        if (read.strideM) bits.push(`Stride about ${read.strideM.toFixed(1)} m.`);
        if (read.heading != null) {
          const deg = ((read.heading * 180) / Math.PI + 360) % 360;
          const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
          bits.push(`Headed ${names[Math.round(deg / 45) % 8]}.`);
        }
        return bits.join(' ');
      }
      if (read.kind === 'dropping') return `${what[0].toUpperCase()}${what.slice(1)} droppings, ${read.when}.`;
      if (read.kind === 'bed') {
        return `A bed — ${what} lay here, ${read.when}.`
          + (read.bodyLengthM ? ` About ${read.bodyLengthM.toFixed(1)} m of animal.` : '');
      }
      if (read.kind === 'rub' || read.kind === 'scrape') {
        return `${read.kind === 'rub' ? 'A rub' : 'A scrape'}, ${read.when}. ${read.means || ''}`.trim();
      }
      if (read.kind === 'hair') return `Hair caught here — ${what}, ${read.when}.`;
      return `${what[0].toUpperCase()}${what.slice(1)} sign, ${read.when}.`;
    }

    function readSign(sg) {
      const weather = ctx.world.clock.environment();
      const read = sg.read(eco.nowDays, ctx.player.skills.tracking, weather);
      if (!read) { ctx.toast('Too old to read.'); return; }
      ctx.log(sentence(read, sg.speciesId), true);
      /* Certainty is what the skill buys, so say when you are guessing.
         A beginner being told plainly that they are not sure is worth
         more than a beginner being told a confident lie. */
      if (read.certainty < 0.4) ctx.toast('You are not certain.');
      ctx.player.practise('tracking', 0.006 + (1 - read.certainty) * 0.01);
      ctx.emit('sign-read', { sign: sg, read });
    }

    /* Crouching over a piece of sign is the interaction. It goes through
       the same offer hook every other interaction uses, so the prompt,
       the hold bar and the pad button all come for free. */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind !== 'sign' || !ud.sign) return null;
      const sg = ud.sign;
      const label = sg.kind === 'blood' ? 'look at the blood'
        : sg.kind === 'track' ? 'read the track'
          : sg.kind === 'dropping' ? 'check the droppings'
            : sg.kind === 'bed' ? 'look at the bed'
              : `read the ${sg.kind}`;
      return { verb: label, hold: 1.1, act: () => readSign(sg) };
    });

    /* Casting about: sweep the ground around you for anything you have
       not spotted yet. This is what a tracker does when the trail runs
       out, and it is how you find sign you walked straight past. */
    function castAbout() {
      const found = eco.signsNear(ctx.player.x, ctx.player.z, 9, {
        skill: ctx.player.skills.tracking,
        weather: ctx.world.clock.environment(),
      });
      if (!found.length) { ctx.toast('Nothing here.'); return; }
      // The best of it, and only as much as the skill can pick out.
      const n = Math.max(1, Math.round(1 + ctx.player.skills.tracking * 3));
      const top = found.slice(0, n);
      ctx.log(`Casting about: ${top.length} piece${top.length > 1 ? 's' : ''} of sign within nine metres.`, true);
      for (const f of top) ctx.log(`  ${sentence(f.read, f.sign.speciesId)}`);
      ctx.player.practise('tracking', 0.004);
      // Mark them so they are easy to walk to.
      for (const f of top) {
        game.particles.dust([f.sign.x, ctx.groundY(f.sign.x, f.sign.z) + 0.25, f.sign.z],
          { count: 3, size: 0.09 });
      }
    }
    /* No key of its own: every letter on the board is already spoken
       for, and casting about is a thing you do in a posture anyway.
       Crouch or go prone, look at the ground within a few metres, and
       the same interact button that reads a track sweeps the area. */
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind) return null;                       // something specific is there
      const st = ctx.state.stance;
      const low = st === 'prone' || st === 'crouched' || ctx.state.crouchHeld;
      if (!low || hit.distance > 3.2) return null;
      return { verb: 'cast about for sign', hold: 1.6, act: castAbout };
    });
    ctx.state.castAboutForSign = castAbout;

    ctx.onUpdate((dt) => {
      sweep += dt;
      // Rebuilding the drawn set every frame would be pointless: sign does
      // not move and freshness changes over hours.
      if (sweep < 0.75) return;
      sweep = 0;
      try { refresh(); } catch (e) { ctx.log(`tracking: ${e.message}`); }
    });

    ctx.log('Sign is on the ground now. Look at a track and hold '
      + `${ctx.hint('e', 'x')} to read it. Crouch and hold the same button `
      + 'over bare ground to cast about for what you walked past.');
  },
});
