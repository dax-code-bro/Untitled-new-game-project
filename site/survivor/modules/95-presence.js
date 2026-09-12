/* What you leave behind, and what gives you away.

   Two halves of the same idea. The tracking layer made every animal on
   the island legible; this makes the player part of it. You press
   prints into soft ground exactly the way a deer does — same simulated
   Sign objects, same reading, so the marks are real rather than
   decorative — and on this island that matters, because one life per
   world means somebody else can be following them.

   The other half is the birds. A jay or a flock of doves sitting in
   cover will go up when you get close, and the noise carries a long
   way. That is the single most common way a stalk is blown in real
   life and it is almost never modelled: the animal that gives you away
   is not the one you are hunting.

   Emits:  'flush' { x, z, count, audibleM }
*/
SurvivorGame.module({
  id: 'presence',
  order: 95,

  init(ctx) {
    const { LE, SV, game } = ctx;
    const eco = ctx.world.ecology;
    if (!eco || !eco.addSign) return;

    /* ---- your own tracks ---- */

    let lastX = ctx.player.x, lastZ = ctx.player.z;
    let sinceStep = 0;
    let left = false;

    /* Which ground takes a print. Sand and mud hold one you could read a
       week later; rock and dry grass hold nothing at all, and knowing
       the difference is the difference between being followed and not. */
    function holdsPrint(x, z) {
      const b = ctx.biomeAt(x, z);
      const id = b ? b.id : '';
      if (/rock|scree|cliff|road|urban/i.test(id)) return 0;
      if (/beach|dune|sand|mud|marsh|bank|river|shore/i.test(id)) return 1;
      if (/meadow|grass|prairie|field/i.test(id)) return 0.35;
      if (/forest|wood|thicket/i.test(id)) return 0.55;
      return 0.4;
    }

    function stepped() {
      const x = ctx.player.x, z = ctx.player.z;
      const depth = holdsPrint(x, z);
      if (depth <= 0.05) return;
      // Wet ground takes a deeper print, which is why a hunter walks the
      // ridge in the rain and the creek bottom when it is dry.
      const env = ctx.world.clock.environment();
      const wet = Math.min(1, (env.precipitation || 0) / 4);
      const load = ctx.player.inventory ? Math.min(1, ctx.player.inventory.massKg / 45) : 0;
      eco.addSign({
        kind: 'track', x, z,
        speciesId: 'human', male: true, massKg: 78 + load * 22,
        heading: Math.atan2(x - lastX, z - lastZ),
        gait: ctx.player.speedMs > 3 ? 'gallop' : ctx.player.speedMs > 1.6 ? 'trot' : 'walk',
        depth: Math.min(1, depth * (0.7 + wet * 0.5) * (0.85 + load * 0.3)),
        ageClass: 'adult',
      });
      left = true;
    }

    /* ---- birds ---- */

    /* Small birds sitting in cover. They are not simulated animals —
       there are five hundred of those and they have somewhere to be —
       these are ambient, they exist only near you, and their whole
       purpose is to go up at the wrong moment. */
    const perches = [];
    const MAX_PERCH = 14;
    const rng = new LE.Rng(0x8112);
    let reseed = 0;

    function seedPerches() {
      const px = ctx.player.x, pz = ctx.player.z;
      // Drop the ones you have walked away from.
      for (let i = perches.length - 1; i >= 0; i--) {
        if (Math.hypot(perches[i].x - px, perches[i].z - pz) > 70) perches.splice(i, 1);
      }
      while (perches.length < MAX_PERCH) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(22, 62);
        const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
        const b = ctx.biomeAt(x, z);
        const cover = b && b.cover != null ? b.cover : 0.4;
        // Birds sit where there is something to sit in.
        if (cover < 0.25) { perches.push({ x, z, dead: true }); continue; }
        perches.push({
          x, z, dead: false,
          flock: rng.int(1, cover > 0.6 ? 9 : 3),
          spooked: false,
          // How close you get before they go. A jay lets you to fifteen
          // metres; a flock of doves in the open goes at forty.
          flushM: 12 + (1 - cover) * 26,
        });
      }
    }

    function flush(p) {
      p.spooked = true;
      const y = ctx.groundY(p.x, p.z);
      for (let i = 0; i < p.flock; i++) {
        game.particles.dust(
          [p.x + rng.range(-1.2, 1.2), y + rng.range(1.4, 3.4), p.z + rng.range(-1.2, 1.2)],
          { count: 2, size: 0.16 },
        );
      }
      try { game.audio.tone(1500 + rng.range(-300, 400), 0.06); } catch (e) { /* no audio yet */ }
      /* The noise. A flock going up out of cover is loud and it carries,
         and every animal that hears it knows something is moving down
         there. This is the mechanism by which the bird you did not see
         ruins the stalk you spent forty minutes on. */
      const audibleM = 55 + p.flock * 22;
      ctx.emit('flush', { x: p.x, z: p.z, count: p.flock, audibleM });
      if (eco.disturb) {
        try { eco.disturb(p.x, p.z, { radiusM: audibleM, strength: 0.35 + p.flock * 0.05 }); }
        catch (e) { /* the ecology will cope */ }
      }
      const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
      if (d < 45) {
        ctx.log(p.flock > 3
          ? `A flock goes up ahead of you, loud enough to empty the hillside.`
          : `Something small goes up out of the brush.`, p.flock > 3);
      }
    }

    ctx.onUpdate((dt) => {
      /* Tracks, at a stride. A person's stride is about 75 cm walking
         and over a metre and a half running, and laying one per stride
         rather than per frame is what makes the spacing read as a gait. */
      const x = ctx.player.x, z = ctx.player.z;
      const moved = Math.hypot(x - lastX, z - lastZ);
      if (moved > 0.001 && !ctx.state.uiOpen) {
        sinceStep += moved;
        const stride = ctx.player.speedMs > 3 ? 1.7 : ctx.player.speedMs > 1.6 ? 1.05 : 0.75;
        if (sinceStep >= stride) { stepped(); sinceStep = 0; lastX = x; lastZ = z; }
      }

      reseed += dt;
      if (reseed > 2.5) {
        reseed = 0;
        seedPerches();
      }
      // Anything you have walked up on goes.
      for (const p of perches) {
        if (p.dead || p.spooked) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        // Crouching and moving slowly buys you a lot of ground.
        const quiet = (ctx.state.stance === 'prone' ? 0.45
          : (ctx.state.stance === 'crouched' || ctx.state.crouchHeld) ? 0.65 : 1)
          * (0.55 + Math.min(1, ctx.player.speedMs / 3) * 0.75);
        if (d < p.flushM * quiet) flush(p);
      }
    });

    /* Your own trail, described. Worth knowing, because on an island
       with one life per world it is also somebody else's information. */
    ctx.state.myTrail = () => {
      if (!left) return 'You have not left much.';
      const mine = eco.signs.filter((s) => s.speciesId === 'human');
      return mine.length
        ? `${mine.length} of your own prints are still readable.`
        : 'Nothing of yours is left.';
    };

    ctx.log('You leave prints in soft ground the same as anything else does.');
    void SV;
  },
});
