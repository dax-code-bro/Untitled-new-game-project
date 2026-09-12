/* The wind, made readable.

   The ecology has always used it: an animal's nose only works if the
   air is carrying from you to it, so walking in upwind is the single
   most effective thing a hunter can do and walking in downwind ruins a
   stalk before it starts. The simulation has been doing that from the
   beginning and the player had no way to know which way the air was
   moving. A mechanic you cannot perceive is not a mechanic.

   So: a pinch of dust out of the pocket, thrown up and watched. That is
   how it is actually done, and it is better than a number in the corner
   because it costs a second and it tells you what you needed to know.
   The strip along the bottom of the compass shows what you last learned
   and goes stale, so the answer is worth checking again after an hour.

   It also draws the cone your scent is being carried into, briefly,
   when you check — because the useful question is not "which way is the
   wind" but "what can smell me".

   State:  ctx.state.windKnownAt  — sim seconds of the last check
           ctx.state.checkWind()
*/
SurvivorGame.module({
  id: 'wind',
  order: 96,

  init(ctx) {
    const { LE, game } = ctx;

    const COMPASS = ['north', 'north-east', 'east', 'south-east',
      'south', 'south-west', 'west', 'north-west'];

    let knownAt = -1e9;
    let knownDir = 0;
    let knownMs = 0;

    /* Beaufort, in the words the scale actually uses, because "3.2 m/s"
       tells a player nothing and "leaves in constant motion" tells them
       whether their scent is going anywhere. */
    function describe(ms) {
      if (ms < 0.3) return 'dead still — your scent is pooling right here';
      if (ms < 1.6) return 'barely moving, smoke drifts';
      if (ms < 3.4) return 'you can feel it on your face';
      if (ms < 5.5) return 'leaves in constant motion';
      if (ms < 8.0) return 'small branches moving';
      if (ms < 10.8) return 'whole trees swaying — nothing will hear you';
      return 'hard enough to lean on';
    }

    function bearing(rad) {
      const deg = ((rad * 180) / Math.PI + 360) % 360;
      return COMPASS[Math.round(deg / 45) % 8];
    }

    /* Throw a pinch of dust and watch where it goes. */
    function checkWind() {
      if (ctx.state.uiOpen) return;
      const env = ctx.world.clock.environment();
      const w = ctx.world.clock;
      knownDir = w.windDirRad || 0;
      knownMs = env.windMs || 0;
      knownAt = ctx.world.clock.simSeconds + ctx.world.clock.totalDays * 86400;
      ctx.state.windKnownAt = knownAt;

      /* The dust itself. It leaves your hand and drifts downwind, which
         is the whole readout — the particles ARE the instrument. */
      const px = ctx.player.x, pz = ctx.player.z;
      const y = ctx.groundY(px, pz) + 1.35;
      const dx = Math.sin(knownDir), dz = Math.cos(knownDir);
      for (let i = 0; i < 14; i++) {
        const t = i / 14;
        const drift = 0.4 + t * (1.2 + knownMs * 1.6);
        game.particles.dust(
          [px + dx * drift + (Math.random() - 0.5) * 0.25,
            y - t * 0.5 + Math.random() * 0.2,
            pz + dz * drift + (Math.random() - 0.5) * 0.25],
          { count: 1, size: 0.05 + t * 0.06 },
        );
      }
      ctx.player.practise('hunting', 0.002);

      /* What it means for the stalk. Downwind of you is where you have
         already been smelled; upwind is where you can still get to. */
      const d = describe(knownMs);
      ctx.log(`The wind is out of the ${bearing(knownDir + Math.PI)}, going ${bearing(knownDir)}. `
        + `${d[0].toUpperCase()}${d.slice(1)}.`, true);
      const eco = ctx.world.ecology;
      if (eco && eco.near) {
        // How many animals are currently downwind of you and inside their
        // own nose range. This is the number that matters.
        let downwind = 0;
        for (const a of eco.near(px, pz, 220)) {
          const ax = a.x - px, az = a.z - pz;
          const d = Math.hypot(ax, az) || 1;
          const along = (ax / d) * dx + (az / d) * dz;
          const smellM = a.species && a.species.smellM ? a.species.smellM : 0;
          if (along > 0.25 && d < smellM) downwind++;
        }
        if (downwind > 0) {
          ctx.toast(`${downwind} downwind of you.`);
          ctx.log(`  ${downwind} animal${downwind > 1 ? 's are' : ' is'} downwind and inside `
            + `${downwind > 1 ? 'their own nose range' : 'its own nose range'}.`);
        } else {
          ctx.log('  Nothing downwind that can smell you from here.');
        }
      }
    }
    ctx.state.checkWind = checkWind;

    /* No key of its own — every letter is spoken for. It goes on the
       wheel for a pad, and on the interaction prompt when you are
       standing still with nothing else to do, which is when you would
       actually check. */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind) return null;
      if (ctx.player.speedMs > 0.4) return null;
      const st = ctx.state.stance;
      if (st === 'prone' || st === 'crouched' || ctx.state.crouchHeld) return null;  // that is casting about
      if (!ctx.state.currentWeapon) return null;   // only worth it while hunting
      return { verb: 'check the wind', hold: 0.5, act: checkWind };
    });

    /* The strip under the compass. It shows what you LAST learned, not
       what is true now, and it fades as it ages — the wind veers over a
       morning and an hour-old reading is a guess. */
    const strip = ctx.hud.panel('windStrip', {
      style: 'left:50%;transform:translateX(-50%);top:38px;z-index:21;'
        + 'pointer-events:none;font-size:11px;letter-spacing:.14em;'
        + 'color:#98917f;text-align:center;display:none',
    });

    ctx.onUpdate(() => {
      const now = ctx.world.clock.simSeconds + ctx.world.clock.totalDays * 86400;
      const age = now - knownAt;
      if (!ctx.state.currentWeapon || age > 7200 || ctx.state.uiOpen) {
        strip.style.display = 'none';
        return;
      }
      strip.style.display = 'block';
      // An arrow that points where the air is going, relative to where
      // you are looking, so it reads at a glance like a real wind flag.
      const yaw = game._camYaw != null ? game._camYaw : 0;
      const rel = knownDir + yaw;
      const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
      const deg = ((rel * 180) / Math.PI + 360) % 360;
      const glyph = arrows[Math.round(deg / 45) % 8];
      const stale = age > 1800 ? ' · stale' : '';
      const dim = Math.max(0.35, 1 - age / 7200);
      strip.style.color = `rgba(152,145,127,${dim})`;
      strip.textContent = `WIND ${glyph} ${knownMs.toFixed(1)} m/s${stale}`;
    });

    ctx.log('Stand still with a gun in your hands and hold '
      + `${ctx.hint('e', 'x')} to throw a pinch of dust and read the wind.`);
  },
});
