/* Guns, and shots that resolve through the ballistics model.

   Nothing in this file decides what a bullet does. It builds a Projectile
   from the cartridge the weapon is chambered for, asks the firearm whether
   it went off, walks the ray the trajectory integrator produces, and hands
   whatever it hits to the penetration model. Every number the player feels —
   the drop, the recoil, whether the round came out the far side of the wall
   with anything left — is read back out of the simulation.

   The wall case is the one this whole project is built around. A round that
   meets a wall does not stop at it: the wall's layer stack is looked up at
   the exact point along it that was hit, so whether the bullet met the
   cavity or a stud decides most of what is left, the hole is punched into
   the wall's own record so it stays there, and the ray continues on the far
   side with the exit velocity to hit whatever is standing behind it.

   Emits:   'gunshot' { x, z, audibleM, db, weapon }
            'animal-wounded' { animal, severity, fromX, fromZ }
            'wall-damaged' { wall, u, y, r }
   State:   ctx.state.currentWeapon, ctx.state.aiming
            ctx.state.giveWeapon(id) — for testing and for the creative mode */
SurvivorGame.module({
  id: 'weapons',
  order: 20,

  init(ctx) {
    const { LE, SV, game } = ctx;

    /* Which gun profile a weapon gets. The profile carries the real
       dimensions — a Remington 700 is 1080 mm long with a 610 mm barrel —
       and the assembler turns it into a parts list. Every part is its own
       actor, which is the whole point: a bolt that reciprocates, a
       selector that rotates, a magazine that drops out and a case that
       leaves the port are four different things moving, and one welded
       mesh can do none of them. */
    const PROFILE = {
      remington700_308: 'boltRifle', remington700_300wm: 'boltRifle',
      remington700_7mm: 'boltRifle', mauser98: 'boltRifle',
      ruger1022: 'rimfire', ak47: 'carbine', m16: 'modernCarbine',
      colt1911: 'pistol', revolver357: 'revolver', revolver500: 'bigRevolver',
      barrett50: 'heavyRifle', shotgun12: 'shotgun',
    };

    /* Which simulated cartridge each gun's brass is, for the case that
       comes out of the port and stays on the ground. */
    const BRASS_GEO = {};
    function brassMesh(cartridgeId) {
      const key = `brass:${cartridgeId}`;
      if (!BRASS_GEO[key]) BRASS_GEO[key] = LE.cartridgeGeometry(cartridgeId, { spent: true });
      return BRASS_GEO[key];
    }
    function liveMesh(cartridgeId) {
      const key = `round:${cartridgeId}`;
      if (!BRASS_GEO[key]) BRASS_GEO[key] = LE.cartridgeGeometry(cartridgeId, { spent: false });
      return BRASS_GEO[key];
    }

    /* ---- the weapon in hand ---- */

    let firearm = null;
    let rig = null;          // { parts: Map<id, {actor, part, rest}>, asm }
    let aiming = false;      // the mouse's own right button
    let aimed = false;       // mouse or trigger — what the game reacts to
    let baseFov = null;
    let recoilPitch = 0, recoilRecover = 0;
    let bobPhase = 0;
    let clearing = 0;
    const rng = new LE.Rng(0xf17e);
    const brass = [];        // spent cases lying where they fell
    let pendingCase = null;  // a fired case still in a manual action's chamber

    /* The animation state. Every moving part reads these, and nothing
       else does: one number per mechanism, driven by clips, so the bolt,
       the hammer, the trigger, the selector and the magazine can all be
       somewhere between their two positions at the same time without any
       of them knowing about each other. */
    const anim = {
      bolt: 0,        // 0 closed, 1 fully back
      hammer: 0,      // 0 down, 1 cocked
      trigger: 0,     // 0 forward, 1 pressed
      selector: 0,    // whatever fraction the lever is at
      magazine: 0,    // 0 seated, 1 dropped clear
      cylinder: 0,    // 0 closed, 1 swung out
      rodOut: 0,      // the cleaning rod, 0 out, 1 all the way down the bore
      hand: 0,        // the whole gun dipping while the hands are busy
    };
    let clip = null;  // the clip currently playing: { t, dur, steps, onEnd }

    function play(name, dur, steps, onEnd) {
      clip = { name, t: 0, dur, steps, onEnd: onEnd || null };
      publishBusy();
    }
    function busy() { return !!clip; }
    // Anything driving the gun from outside — a controller, a test — needs
    // to know when the hands are free, because every action is gated on it.
    function publishBusy() { ctx.state.weaponBusy = !!clip; }

    function stepClip(dt) {
      if (!clip) return;
      clip.t += dt;
      const u = Math.min(1, clip.t / clip.dur);
      for (const [key, fn] of Object.entries(clip.steps)) anim[key] = fn(u);
      if (u >= 1) { const end = clip.onEnd; clip = null; publishBusy(); if (end) end(); }
    }

    /* Ease curves. A bolt does not move linearly: it is snatched back
       hard, held, and shoved forward into battery. */
    const ease = (t) => t * t * (3 - 2 * t);
    const outIn = (t, hold) => (t < hold ? ease(t / hold) : 1 - ease((t - hold) / (1 - hold)));

    /* ---- building the rig ---- */

    function destroyRig() {
      if (!rig) return;
      for (const p of rig.parts.values()) { try { p.actor.destroy(); } catch (e) { /* gone */ } }
      // The rounds visible in the magazine are actors too. Left behind on
      // a weapon swap they stayed floating where the last gun's magazine
      // had been, which is how six 7.62 rounds ended up hanging in the air
      // beside a bolt rifle on the bench.
      for (const a of rig.rounds || []) { try { a.destroy(); } catch (e) { /* gone */ } }
      rig = null;
    }

    function buildRig(weaponId, fa) {
      destroyRig();
      const profileId = PROFILE[weaponId] || 'carbine';
      const asm = LE.assembleGun(profileId, { attachments: fa.attachments });
      const parts = new Map();
      for (const part of asm.parts) {
        if (part.virtual || !part.build) continue;
        const geo = part.build();
        if (!geo.positions || !geo.positions.length) continue;
        const mat = Object.assign({}, LE.GUN_MATERIAL[part.mat] || LE.GUN_MATERIAL.blued);
        const actor = game.mesh({
          geometry: geo, key: `gunpart:${profileId}:${part.id}`, material: mat,
          at: [0, -1000, 0], physics: false, name: `gun:${part.id}`,
        });
        actor.noCull = true;
        parts.set(part.id, { actor, part, rest: part.at.slice() });
      }
      /* Rounds visible in the magazine. A player who can see how many are
         left does not have to read a counter, and a magazine you can see
         into is the reason a see-through mag exists at all. */
      const magPart = asm.parts.find((x) => x.id === 'magazine' || x.id === 'cylinder');
      rig = { asm, parts, profileId, magPart, rounds: [] };
      return rig;
    }

    function equip(weaponId) {
      const spec = SV.WEAPONS[weaponId];
      if (!spec) { ctx.toast('No such weapon.'); return null; }
      firearm = new SV.Firearm(weaponId, { condition: 0.62 + rng.next() * 0.3, oilLevel: 0.55 });
      firearm.attach('ironSights');
      buildRig(weaponId, firearm);
      anim.selector = firearm.selectorFraction;
      anim.hammer = firearm.spec.action === SV.ACTION.boltAction ? 1 : 0;
      ctx.state.currentWeapon = firearm;
      ctx.state.currentRig = rig;
      ctx.log(`${spec.name}. ${spec.note}`, true);
      ctx.toast('On safe — shift+Z to take it off');
      return firearm;
    }

    ctx.state.giveWeapon = equip;
    ctx.state.equipWeapon = equip;
    /* The bench needs to rebuild the rig after a strip changes what is on
       the gun, and after an optic is mounted or comes off. */
    ctx.state.rebuildWeaponRig = () => { if (firearm) { buildRig(firearm.id, firearm); } };

    /* ---- loading, a round at a time ---- */

    let magazine = null;

    function ammoInPack() {
      if (!firearm) return 0;
      const have = ctx.player.inventory.slots.find((s) => s.item === `ammo:${firearm.cartridgeId}`);
      return have ? have.quantity : 0;
    }

    /* Thumb one round in. This is deliberately not a single "reload"
       action: a magazine is filled one round at a time and each one is
       about a second and a half of not watching the treeline. Holding the
       key keeps going. */
    function loadOne() {
      if (!firearm || busy()) return false;
      if (!magazine || magazine.capacity !== firearm.capacity) {
        magazine = new SV.Magazine({
          capacity: firearm.capacity,
          springCondition: firearm.parts.magazineSpring ? firearm.parts.magazineSpring.condition : 1,
        });
        for (const r of firearm.magazine) magazine.push(r);
      }
      if (magazine.full) { ctx.toast('Full.'); return false; }
      if (ammoInPack() <= 0) { ctx.toast('No ammunition for it.'); return false; }
      const round = { cartridgeId: firearm.cartridgeId, condition: 0.9 + rng.next() * 0.1 };
      const out = magazine.push(round);
      if (!out.ok) return false;
      ctx.player.inventory.remove(`ammo:${firearm.cartridgeId}`, 1);
      firearm.magazine = magazine.rounds.slice();
      // The hands drop the gun a little while they work.
      play('feed', Math.min(1.1, out.seconds * 0.55), {
        hand: (t) => Math.sin(t * Math.PI) * 0.6,
        magazine: () => anim.magazine,
      });
      ctx.state.busySeconds = (ctx.state.busySeconds || 0) + out.seconds;
      return true;
    }

    /* A whole magazine change, for the guns that take one: the old one
       drops clear, the new one goes up, and the bolt is released. */
    function swapMagazine() {
      if (!firearm || busy()) return;
      const detachable = rig && rig.parts.has('magazine');
      if (!detachable) { loadOne(); return; }
      const want = firearm.capacity - firearm.magazine.length;
      if (want <= 0 && firearm.chambered) { ctx.toast('Full.'); return; }
      const n = Math.min(want, ammoInPack());
      if (n <= 0) { ctx.toast('No ammunition for it.'); return; }
      play('magout', 0.55, {
        magazine: (t) => ease(t),
        hand: (t) => Math.sin(t * Math.PI) * 0.7,
      }, () => {
        const rounds = [];
        for (let i = 0; i < n; i++) rounds.push({ cartridgeId: firearm.cartridgeId, condition: 0.9 + rng.next() * 0.1 });
        firearm.load(rounds);
        ctx.player.inventory.remove(`ammo:${firearm.cartridgeId}`, n);
        magazine = null;
        play('magin', 0.65, {
          magazine: (t) => 1 - ease(t),
          hand: (t) => Math.sin(t * Math.PI) * 0.5,
          bolt: (t) => (t < 0.7 ? 0 : 1 - ease((t - 0.7) / 0.3)),
        }, () => { firearm.chamber(); ctx.toast(`${n} up.`); });
      });
    }

    /* ---- the case ---- */

    /* A spent case, thrown out of the port and left where it lands.
       Nothing in this game despawns, and brass is a component: a
       handloader walks back and picks it up. */
    function throwCase(spent) {
      if (!spent || !rig) return;
      const cam = game.camera;
      const port = rig.parts.get('receiver');
      const at = new LE.Vec3().copy(cam.position)
        .addScaled(cam.forward, 0.42).addScaled(cam.right, 0.10).addScaled(cam.trueUp, -0.04);
      void port;
      const a = game.mesh({
        geometry: brassMesh(spent.cartridgeId), key: `brass:${spent.cartridgeId}`,
        material: LE.GUN_MATERIAL.brass, at: [at.x, at.y, at.z],
        collider: 'box', physics: true, mass: Math.max(0.004, spent.massG / 1000),
        name: 'brass',
      });
      if (!a) return;
      // Out of the port along the pattern the action actually throws.
      const d = new LE.Vec3()
        .addScaled(cam.right, spent.dir[0])
        .addScaled(cam.trueUp, spent.dir[1])
        .addScaled(cam.forward, spent.dir[2]).normalize();
      try { a.push(d, spent.speedMs); } catch (e) { /* static fallback */ }
      a.userData = { kind: 'brass', cartridgeId: spent.cartridgeId, tempC: spent.tempC, t: 0 };
      brass.push(a);
      // A hundred cases on the ground is plenty; past that the oldest go.
      if (brass.length > 160) { const old = brass.shift(); try { old.destroy(); } catch (e) { /* gone */ } }
    }

    /* ---- the shot ---- */

    const HIT_TMP = new LE.Vec3();

    function shoot() {
      if (!firearm) { ctx.toast('Nothing in your hands.'); return; }
      if (firearm.jammed) { ctx.toast(`${firearm.jammed.kind} — hold ${ctx.hint('u', 'y')} to clear`); return; }
      if (!firearm.chambered && !firearm.chamber()) { ctx.toast('Empty.'); return; }

      const body = ctx.player.body;
      const status = body.status(ctx.world.clock.hourOfDay);
      const shot = firearm.fire({
        rng: () => rng.next(),
        prone: ctx.state.stance === 'prone',
        skill: ctx.player.skills.shooting,
        // A tired, cold, hurt shooter is a worse shooter, and all three are
        // already tracked by the body.
        fatigue: Math.max(status.sleepPressure, 1 - status.capacity),
        shivering: status.shivering,
        breathless: Math.min(1, ctx.player.speedMs / 4),
      });

      if (!shot.fired) {
        ctx.toast(shot.jam ? `${shot.jam.kind}` : shot.reason);
        ctx.log(shot.jam ? `The rifle stops: ${shot.jam.kind}.` : `It will not fire: ${shot.reason}.`, true);
        return;
      }

      ctx.player.practise('shooting', 0.004);

      /* The mechanism, shown. The hammer falls, the trigger comes back,
         and then the action does whatever its action does: a self-loader
         cycles itself and throws the case; a bolt gun sits there with a
         fired case in the chamber until the shooter works it, which is
         the entire difference in how the two guns feel. */
      const act = firearm.spec.action;
      const selfLoading = act === SV.ACTION.semiAuto || act === SV.ACTION.fullAuto;
      anim.hammer = 0;
      anim.trigger = 1;
      if (selfLoading) {
        const cycle = Math.max(0.06, (firearm.spec.cycleTimeS || 0.12) * 0.9);
        play('cycle', cycle, {
          bolt: (t) => outIn(t, 0.42),
          trigger: (t) => 1 - ease(t),
          hammer: (t) => (t < 0.5 ? 0 : ease((t - 0.5) / 0.5)),
        }, () => { firearm.chamber(); });
        // The case leaves as the bolt reaches the back of its travel.
        setTimeout(() => throwCase(shot.ejected), cycle * 420);
      } else if (act === SV.ACTION.revolver) {
        play('dacycle', 0.22, {
          trigger: (t) => 1 - ease(t),
          hammer: (t) => (t < 0.5 ? 0 : ease((t - 0.5) / 0.5)),
        }, () => { firearm.chamber(); });
      } else {
        // Manual: the trigger resets and the action stays shut. The player
        // has to work it, and the case comes out when they do.
        play('reset', 0.18, { trigger: (t) => 1 - ease(t) });
        pendingCase = shot.ejected;
      }

      // Recoil goes into the camera and recovers over the model's own time.
      recoilPitch += (shot.muzzleRise.riseDeg * Math.PI) / 180;
      recoilRecover = shot.muzzleRise.recoveryS;

      const aim = ctx.aim();
      const dir = new LE.Vec3().copy(aim.direction).normalize();

      /* Dispersion, from the accuracy the firearm reported. A minute of
         angle is one sixtieth of a degree; converting it here rather than
         inventing a spread keeps the sight picture honest about what the
         rifle, the shooter and the conditions are actually worth. */
      const sigma = (shot.accuracyMoa / 60) * (Math.PI / 180) * 0.5;
      const a1 = rng.next() * Math.PI * 2;
      const r1 = Math.sqrt(-2 * Math.log(Math.max(1e-6, rng.next()))) * sigma;
      dir.addScaled(game.camera.right, Math.cos(a1) * r1)
        .addScaled(game.camera.trueUp, Math.sin(a1) * r1).normalize();

      const origin = new LE.Vec3().copy(aim.origin).addScaled(dir, 0.35);
      /* Muzzle blast at the muzzle, not at the eye. A suppressed gun
         still smokes — it just does it quietly and out of a can, which
         is the visible half of why a suppressor fouls a gun faster. */
      const can = firearm.attachments.thread;
      const suppressed = !!(can && can.noiseDb < 0);
      const muzzle = new LE.Vec3().copy(aim.origin).addScaled(dir, (rig && rig.asm.profile.barrelM) || 0.5);
      game.particles.smoke([muzzle.x, muzzle.y, muzzle.z],
        { count: suppressed ? 8 : 5, size: suppressed ? 0.18 : 0.25, life: suppressed ? 0.9 : 0.5 });
      if (!suppressed) {
        game.particles.sparks([muzzle.x, muzzle.y, muzzle.z],
          { count: 10, speed: 7, size: 0.05 });
      }
      game.audio.impact(Math.min(1, shot.noiseDb / 165));

      ctx.emit('gunshot', {
        x: ctx.player.x, z: ctx.player.z,
        audibleM: shot.audibleM, db: shot.noiseDb,
        weapon: firearm.id,
        // Free recoil energy in joules, for anything that wants to react in
        // proportion to it rather than to a flat "a gun went off".
        recoilJ: shot.recoil && shot.recoil.energyJ != null ? shot.recoil.energyJ : null,
        suppressed: !!(firearm.attachments && firearm.attachments.muzzle
          && firearm.attachments.muzzle.suppressor),
      });

      try {
        traceShot(shot.projectile, origin, dir);
      } catch (err) {
        console.error('shot trace:', err);
      }
    }

    /* Walk the bullet. The trajectory integrator gives the real drop and
       time of flight; stepping the ray along it is what lets the round pass
       through one thing and go on to hit another, which is the whole point
       of having a penetration model at all. */
    function traceShot(proj, origin, dir) {
      const env = ctx.world.clock.environment();
      const traj = SV.integrateTrajectory(proj, {
        maxRange: 900, dt: 0.0008, sampleEvery: 12,
        windMs: env.windMs,
        // The crosswind component relative to the shot, which is the only
        // part that pushes the bullet sideways.
        windAngleDeg: 90,
        env: { tempC: env.airTempC, humidity: env.humidity },
      });

      let velocity = proj.muzzleMs;
      let pos = new LE.Vec3().copy(origin);
      let travelled = 0;
      let hops = 0;
      const upv = game.camera.trueUp;

      while (hops++ < 8 && velocity > 40 && travelled < 900) {
        const remaining = 900 - travelled;
        const hit = game.raycast(pos, dir, Math.min(remaining, 400));
        if (!hit) {
          // Nothing in the way. Where would it land? Follow the arc down and
          // mark the ground, so a miss at long range still tells you where
          // the round went.
          const drop = traj.samples.find((s) => s.rangeM > travelled + 200);
          if (drop) {
            const end = new LE.Vec3().copy(pos)
              .addScaled(dir, 200).addScaled(upv, drop.dropM);
            game.particles.dust([end.x, ctx.groundY(end.x, end.z), end.z], { count: 5, size: 0.3 });
          }
          return;
        }

        travelled += hit.distance;
        // Velocity at this range, straight off the integrated trajectory.
        const at = traj.samples.filter((s) => s.rangeM <= travelled).pop();
        if (at) velocity = at.speedMs;

        const ud = (hit.actor && hit.actor.userData) || {};
        const result = resolveHit(ud, hit, proj, velocity, dir);
        if (!result || !result.through) return;

        velocity = result.exitMs;
        pos = new LE.Vec3().copy(hit.point).addScaled(dir, 0.06);
      }
    }

    function resolveHit(ud, hit, proj, velocity, dir) {
      const p = hit.point;

      /* A wall. Look up the stack at the exact point along it that was hit,
         so a round that finds the cavity keeps most of what it had and one
         that finds a stud does not. */
      if (ud.kind === 'wall' && ud.wall) {
        const wall = ud.wall;
        const u = Math.hypot(p.x - wall.x1, p.z - wall.z1);
        const layers = wall.layersAt(u);
        if (!layers.length) return { through: true, exitMs: velocity };   // already a hole
        const res = SV.penetrate(proj, layers, { impactVelocityMs: velocity });
        wall.punch(u, p.y - (ud.building ? ud.building.y : 0), proj.diameterM * 1.6, { kind: 'bullet' });
        ctx.emit('wall-damaged', { wall, u, y: p.y, r: proj.diameterM * 1.6, building: ud.building });
        game.particles.dust([p.x, p.y, p.z], { count: 12, size: 0.16 });
        game.audio.impact(0.5);
        if (!res.perforated) {
          ctx.toast(`stopped in the ${res.layers[res.stoppedInLayer] ? res.layers[res.stoppedInLayer].material : 'wall'}`);
          return { through: false };
        }
        return { through: true, exitMs: res.exitVelocityMs };
      }

      // Glass shatters and barely slows anything down.
      if (ud.kind === 'glass') {
        game.audio.shatter(0.6);
        if (ud.opening) ud.opening.broken = true;
        ctx.emit('window-broken', { opening: ud.opening, wall: ud.wall });
        return { through: true, exitMs: velocity * 0.97 };
      }

      if (ud.kind === 'tree') {
        const t = ud.tree;
        const res = SV.penetrate(proj, [SV.layer('greenTrunk', Math.max(0.08, t ? t.trunkR * 2 : 0.3))],
          { impactVelocityMs: velocity });
        game.particles.dust([p.x, p.y, p.z], { count: 8, size: 0.12 });
        return res.perforated ? { through: true, exitMs: res.exitVelocityMs } : { through: false };
      }

      /* An animal. Which stack it is depends on what it is: a whitetail's
         chest and a grizzly's shoulder are very different problems, which is
         the entire argument about calibre. */
      if (ud.kind === 'animal' && ud.animal) {
        const a = ud.animal;
        const heavy = a.species.class === 'bear' || a.massKg > 250;
        const stack = heavy ? SV.ASSEMBLY.grizzlyShoulder() : SV.ASSEMBLY.deerChest();
        const res = SV.penetrate(proj, stack, { impactVelocityMs: velocity });
        const wound = SV.woundSeverity(proj, res, 'thorax');
        game.particles.sparks([p.x, p.y, p.z], { count: 10, speed: 3, size: 0.1 });

        const carcass = ctx.world.ecology.wound(a, wound.severity, {
          fromX: ctx.player.x, fromZ: ctx.player.z,
        });
        ctx.emit('animal-wounded', { animal: a, severity: wound.severity, fromX: ctx.player.x, fromZ: ctx.player.z });
        if (carcass) {
          ctx.log(`The ${a.species.name} drops where it stood.`, true);
          ctx.emit('animal-down', { animal: a, carcass });
          ctx.player.practise('hunting', 0.05);
        } else {
          ctx.log(`Hit. The ${a.species.name} is running.`, true);
        }
        return { through: res.perforated, exitMs: res.exitVelocityMs };
      }

      if (ud.kind === 'prop' || ud.kind === 'vehicle') {
        game.particles.sparks([p.x, p.y, p.z], { count: 8, speed: 4 });
        game.audio.impact(0.6);
        const res = SV.penetrate(proj, [SV.layer('sheetSteel', 0.0012)], { impactVelocityMs: velocity });
        return { through: res.perforated, exitMs: res.exitVelocityMs };
      }

      // Terrain and everything else: a puff of dust and the end of the round.
      game.particles.dust([p.x, p.y, p.z], { count: 10, size: 0.2 });
      game.audio.impact(0.35);
      return { through: false };
    }

    /* ---- the viewmodel ---- */

    /* The gun is an ordinary actor parked in front of the camera every
       frame — there is no separate viewmodel pass, which means it is lit
       by the same sun as everything else and looks it. What is new is
       that it is not ONE actor: every part is placed individually, each
       offset along its own travel axis by however far the animation says
       it has moved. That is the difference between a gun that fires and
       a gun you can watch fire. */

    const _p = new LE.Vec3(), _q = new LE.Quat();

    function partOffset(id, part) {
      // How far this part has moved from its rest position, in gun space.
      const tv = part.travel;
      if (!tv) return null;
      let amount = 0;
      if (id === 'bolt' || id === 'pumpHandle') amount = anim.bolt;
      else if (id === 'magazine' || id === 'floorplate') amount = anim.magazine;
      else if (id === 'trigger') amount = anim.trigger;
      else if (id === 'hammer') amount = anim.hammer;
      else if (id === 'selector') amount = anim.selector;
      else if (id === 'cylinder' || id === 'ejectorRod') amount = anim.cylinder;
      else if (id === 'firingPin') amount = anim.trigger > 0.8 ? 1 : 0;
      else return null;
      if (amount === 0) return null;
      return { tv, amount };
    }

    function placeViewmodel(dt) {
      if (!rig || !firearm) return;
      const cam = game.camera;
      const fwd = cam.forward, right = cam.right, up = cam.trueUp;

      // Sway from breathing, movement and the state of the shooter. A rifle
      // held by someone exhausted and shivering does not sit still, and the
      // body already knows how exhausted and cold they are.
      const st = ctx.player.body.status(ctx.world.clock.hourOfDay);
      bobPhase += dt * (1.4 + ctx.player.speedMs * 1.9);
      const unsteady = 0.4 + 1.6 * Math.max(st.sleepPressure * 0.6, 1 - st.capacity)
        + st.shivering * 1.2;
      const amp = (aimed ? 0.0016 : 0.006) * unsteady;
      const swayX = Math.sin(bobPhase * 0.9) * amp + Math.sin(bobPhase * 2.3) * amp * 0.4;
      const swayY = Math.sin(bobPhase * 1.7) * amp * 0.8;

      /* Where the gun sits. Aiming brings it onto the centre line and
         forward so the sights are near the eye; at rest it drops to the
         right where a rifle actually hangs. The near plane is a quarter of
         a metre, so it cannot come as close to the eye as a real one does. */
      /* At rest the gun hangs down and to the right, but not as far as a
         single welded box needed to: the parts now span a metre of real
         gun, so the old offset put two thirds of a Mauser off the edge of
         the screen. */
      const hand = anim.hand;
      const outX = (aimed ? 0.012 : 0.105) + hand * 0.03;
      const outY = (aimed ? -0.052 : -0.105) - hand * 0.06;
      const outZ = (aimed ? 0.50 : 0.44) - hand * 0.04;

      // The gun's own frame: forward is the bore, up is the top strap.
      const base = new LE.Vec3().copy(cam.position)
        .addScaled(fwd, outZ)
        .addScaled(right, outX + swayX)
        .addScaled(up, outY + swayY);

      const yaw = Math.atan2(fwd.x, fwd.z) * 180 / Math.PI;
      const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180 / Math.PI;
      const roll = (aimed ? 0 : 3) + hand * 8;
      _q.setEuler(-pitch * Math.PI / 180, yaw * Math.PI / 180, roll * Math.PI / 180);

      for (const [id, entry] of rig.parts) {
        const { actor, part, rest } = entry;
        let lx = rest[0], ly = rest[1], lz = rest[2];
        let extraPitch = 0, extraYaw = 0, extraRoll = 0;

        const mv = partOffset(id, part);
        if (mv) {
          const { tv, amount } = mv;
          // Linear travel along one axis, or rotation about one.
          if (tv.axis === 'z') lz += tv.amount * amount;
          else if (tv.axis === 'y') ly += tv.amount * amount;
          else if (tv.axis === 'x') lx += tv.amount * amount;
          else if (tv.axis === 'rx') extraPitch = tv.amount * amount;
          else if (tv.axis === 'ry') extraYaw = tv.amount * amount;
          else if (tv.axis === 'rz') extraRoll = tv.amount * amount;
          else if (tv.axis === 'swing') { lx += -0.055 * amount; extraYaw = -tv.amount * amount; }
        }
        // A part that rides on another moves with it.
        if (part.rides) {
          const host = rig.parts.get(part.rides);
          if (host) {
            const hm = partOffset(part.rides, host.part);
            if (hm) {
              const { tv, amount } = hm;
              if (tv.axis === 'z') lz += tv.amount * amount;
              else if (tv.axis === 'y') ly += tv.amount * amount;
              else if (tv.axis === 'x') lx += tv.amount * amount;
            }
          }
        }

        // Gun space -> world.
        _p.set(lx, ly, lz).applyQuat(_q);
        actor.setPosition([base.x + _p.x, base.y + _p.y, base.z + _p.z]);
        actor.setRotation([
          -pitch + extraPitch * 180 / Math.PI,
          yaw + extraYaw * 180 / Math.PI,
          roll + extraRoll * 180 / Math.PI,
        ]);
        actor.visible = !ctx.paused && !ctx.state.benchOpen;
      }

      /* Rounds in the magazine, so a glance tells you what is left. The
         top round sits under the feed lips and the stack goes down. */
      const magEntry = rig.parts.get('magazine');
      const want = magEntry && !ctx.state.benchOpen ? Math.min(6, firearm.magazine.length) : 0;
      while (rig.rounds.length < want) {
        const a = game.mesh({
          geometry: liveMesh(firearm.cartridgeId), key: `round:${firearm.cartridgeId}`,
          material: LE.GUN_MATERIAL.brass, at: [0, -1000, 0], physics: false, name: 'round',
        });
        if (!a) break;
        a.noCull = true;
        rig.rounds.push(a);
      }
      while (rig.rounds.length > want) {
        const a = rig.rounds.pop();
        try { a.destroy(); } catch (e) { /* gone */ }
      }
      if (want && magEntry) {
        const mv = partOffset('magazine', magEntry.part);
        const drop = mv ? magEntry.part.travel.amount * mv.amount : 0;
        for (let i = 0; i < rig.rounds.length; i++) {
          _p.set(magEntry.rest[0] - 0.004,
            magEntry.rest[1] + drop - 0.004 - i * 0.0105,
            magEntry.rest[2] + (i % 2 ? 0.0018 : -0.0018)).applyQuat(_q);
          rig.rounds[i].setPosition([base.x + _p.x, base.y + _p.y, base.z + _p.z]);
          rig.rounds[i].setRotation([-pitch, yaw + 90, roll]);
          rig.rounds[i].visible = !ctx.paused && !ctx.state.benchOpen;
        }
      }
    }

    /* Cases cool on the ground. A case out of a rifle will raise a
       blister for the first few seconds and then it is just brass. */
    function coolBrass(dt) {
      for (const a of brass) {
        const ud = a.userData;
        if (!ud || ud.tempC <= 25) continue;
        ud.t += dt;
        ud.tempC = 20 + (ud.tempC - 20) * Math.exp(-dt / 9);
        if (ud.tempC > 90 && ud.t < 4 && Math.random() < dt * 1.6) {
          game.particles.smoke([a.position.x, a.position.y + 0.01, a.position.z],
            { count: 1, size: 0.03, life: 0.5 });
        }
      }
    }

    /* ---- input ---- */

    ctx.key('1', () => { if (!ctx.state.buildMenuOpen) equip('remington700_308'); }, 'Bolt rifle');
    ctx.key('2', () => { if (!ctx.state.buildMenuOpen) equip('ruger1022'); }, '.22');
    ctx.key('3', () => { if (!ctx.state.buildMenuOpen) equip('shotgun12'); }, 'Shotgun');
    ctx.key('4', () => { if (!ctx.state.buildMenuOpen) equip('revolver357'); }, 'Revolver');
    ctx.key('5', () => { if (!ctx.state.buildMenuOpen) equip('ak47'); }, 'AK');
    /* Working the action by hand. On a bolt gun, a pump or a lever this
       is the shot cycle: the case you fired is still in the chamber and
       the next round is still in the magazine until you do this. Holding
       it does nothing — it is one deliberate motion. */
    function workAction() {
      if (!firearm || busy()) return;
      const act = firearm.spec.action;
      if (act === SV.ACTION.semiAuto || act === SV.ACTION.fullAuto) {
        // Charging a self-loader: haul it back and let it go.
        play('charge', 0.42, {
          bolt: (t) => outIn(t, 0.55),
          hand: (t) => Math.sin(t * Math.PI) * 0.5,
        }, () => {
          if (pendingCase) { throwCase(pendingCase); pendingCase = null; }
          else if (firearm.chambered) { firearm.chambered = null; }
          firearm.chamber();
        });
        return;
      }
      if (act === SV.ACTION.revolver) { openCylinder(); return; }
      const cycleT = Math.max(0.35, (firearm.spec.cycleTimeS || 1) * 0.8);
      play('cycle', cycleT, {
        bolt: (t) => outIn(t, 0.5),
        hammer: (t) => ease(Math.min(1, t * 1.6)),
        hand: (t) => Math.sin(t * Math.PI) * 0.45,
      }, () => {
        if (pendingCase) { throwCase(pendingCase); pendingCase = null; }
        firearm.chambered = null;
        if (!firearm.chamber()) ctx.toast('Empty.');
      });
    }

    /* A revolver: the cylinder swings out, the rod dumps all six cases
       at once, and you load it a chamber at a time. */
    function openCylinder() {
      if (!firearm || busy()) return;
      if (anim.cylinder > 0.5) {
        play('close', 0.35, { cylinder: (t) => 1 - ease(t), hand: (t) => Math.sin(t * Math.PI) * 0.4 });
        return;
      }
      play('open', 0.4, { cylinder: (t) => ease(t), hand: (t) => Math.sin(t * Math.PI) * 0.5 }, () => {
        const n = firearm.magazine.length + (firearm.chambered ? 1 : 0);
        if (n > 0) {
          for (let i = 0; i < n; i++) {
            throwCase({
              cartridgeId: firearm.cartridgeId, massG: 10, tempC: 90,
              dir: [0.2 + rng.next() * 0.3, -0.4, 0.1], speedMs: 0.9 + rng.next() * 0.6,
            });
          }
          firearm.magazine.length = 0;
          firearm.chambered = null;
          ctx.toast(`${n} out.`);
        }
      });
    }

    /* Gun handling lives on two keys and their shifted forms, because
       every other letter on the board is already spoken for by fire,
       shelter, fishing, wiring or the vehicles. Shift is the deliberate
       version of the same action: load a magazine or thumb in one round,
       work the action or change what the action will do. */
    ctx.key('l', (c, ev) => {
      if (ev && ev.shiftKey) loadOne();
      else swapMagazine();
    }, 'Load (shift: one round at a time)');

    ctx.key('z', (c, ev) => {
      if (ev && ev.shiftKey) cycleSelector();
      else workAction();
    }, 'Work the action (shift: fire selector)');

    /* The selector. It is a real lever on the model and it rotates to
       the position it is in — on an AK the first position under the
       thumb is full automatic, which is a thing you find out. */
    function cycleSelector() {
      if (!firearm || busy()) return;
      const mode = firearm.cycleFireMode();
      const target = firearm.selectorFraction;
      const from = anim.selector;
      play('select', 0.22, { selector: (t) => from + (target - from) * ease(t) });
      game.audio.tone(1800, 0.03);
      ctx.toast(mode === 'safe' ? 'Safe.' : mode === 'auto' ? 'Full automatic.'
        : mode === 'burst' ? 'Burst.' : 'Semi-automatic.');
    }
    // The controller and anything else that wants it can drive the
    // selector without knowing which key it is on.
    ctx.state.cycleFireSelector = cycleSelector;
    ctx.state.workWeaponAction = workAction;
    ctx.state.thumbRoundIn = loadOne;

    ctx.key('i', () => {
      if (!firearm) return;
      const info = firearm.inspect();
      ctx.log(`${firearm.name}: ${info.notes.length ? info.notes.join('; ') : 'in good order'}`, true);
      ctx.toast(`${(info.reliability * 100).toFixed(0)}% reliable, ${info.accuracyMoa.toFixed(1)} MOA, ${firearm.fireMode}`);
      // Tip it over and look at it, the way you do.
      play('inspect', 1.4, {
        hand: (t) => Math.sin(t * Math.PI) * 0.9,
        bolt: (t) => (t > 0.25 && t < 0.75 ? Math.sin((t - 0.25) * 2 * Math.PI) * 0.5 : 0),
      });
    }, 'Inspect weapon');

    /* Firing and aiming are held rather than clicked, because a trigger is
       something you hold: a mouse button, or the right trigger on a pad.
       What holding it does is the weapon's business — a bolt gun fires once
       and waits for you to work the bolt, an AK empties itself at six
       hundred rounds a minute — so the action decides, not the input. */
    let triggerHeld = false, sinceShot = 0, firedThisPull = 0;
    window.addEventListener('mousedown', (e) => {
      if (ctx.paused || ctx.state.uiOpen) return;
      if (e.button === 0) triggerHeld = true;
      if (e.button === 2) aiming = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) triggerHeld = false;
      if (e.button === 2) aiming = false;
    });
    window.addEventListener('blur', () => { triggerHeld = false; aiming = false; });
    window.addEventListener('contextmenu', (e) => { if (!ctx.state.uiOpen) e.preventDefault(); });

    /* A controller sets these instead; keeping them on ctx.state means the
       weapon does not have to know which device is pulling the trigger. */
    function trigger() { return triggerHeld || !!ctx.state.triggerHeld; }
    function ads() { return aiming || !!ctx.state.adsHeld; }

    /* How fast the weapon will let you shoot, from its own action. A
       semi-automatic is limited by how fast a finger moves, which is about
       five a second; anything manually operated needs the action worked and
       that is the cycle time the weapon already carries. */
    function repeatInterval() {
      if (!firearm) return Infinity;
      const spec = SV.WEAPONS[firearm.id] || {};
      // On safe, nothing repeats.
      if (firearm.fireMode === SV.FIRE_MODE.safe) return Infinity;
      if (spec.action === SV.ACTION.fullAuto && firearm.fireMode === SV.FIRE_MODE.auto) {
        return 60 / (spec.rpm || 600);
      }
      // Semi-automatic is limited by how fast a finger moves, which is
      // about five a second — and a selector on semi holds a machine gun
      // to exactly the same rate.
      if (spec.action === SV.ACTION.semiAuto || spec.action === SV.ACTION.fullAuto) {
        return Math.max(0.13, spec.cycleTimeS || 0.13);
      }
      // Bolt, pump, lever, revolver, break: one per pull of the trigger.
      return Infinity;
    }

    // A stoppage is cleared by holding, not by tapping — and some of them
    // need a rod, which the model already decides.
    ctx.key('u', () => {
      if (!firearm || !firearm.jammed) return;
      clearing = 0.35;
    }, 'Clear a stoppage');

    /* A way to pull the trigger that is not a mouse button, so the
       browser tests can fire the real weapon through the real code path
       rather than reaching past it into the simulation. */
    ctx.on('debug:fire', () => { if (!busy()) shoot(); });

    ctx.onUpdate((dt) => {
      aimed = ads();
      stepClip(dt);
      placeViewmodel(dt);
      coolBrass(dt);

      // The trigger. Nothing fires while the hands are doing something
      // else — working the action, changing a magazine, thumbing rounds
      // in — which is what makes those actions cost anything.
      sinceShot += dt;
      if (!ctx.paused && !ctx.state.uiOpen && !ctx.state.benchOpen && !busy() && trigger()) {
        const interval = repeatInterval();
        if (firedThisPull === 0 || (interval !== Infinity && sinceShot >= interval)) {
          sinceShot = 0;
          firedThisPull++;
          shoot();
        }
      } else if (!trigger()) {
        firedThisPull = 0;
        // The finger comes off and the trigger goes forward with it.
        if (!busy() && anim.trigger > 0) anim.trigger = Math.max(0, anim.trigger - dt * 8);
      }

      if (clearing > 0) {
        clearing -= dt;
        const out = firearm.clearJam(dt, { hasTool: ctx.player.inventory.has('cleaningRod') });
        if (out.cleared) { ctx.toast('Cleared.'); clearing = 0; }
        else if (out.reason) { ctx.toast(out.reason); clearing = 0; }
      }
      if (firearm) firearm.cool(dt, ctx.world.clock.environment().airTempC);

      // Recoil recovery, and the narrower field of view of an aimed shot.
      if (recoilPitch > 0) {
        const back = Math.min(recoilPitch, (dt / Math.max(0.05, recoilRecover)) * recoilPitch * 3);
        recoilPitch -= back;
        if (game._camPitch != null) game._camPitch -= back * 0.6;
      }
      if (baseFov == null && game.camera) baseFov = game.camera.fov;
      if (baseFov != null && game.camera) {
        const scope = firearm && firearm.attachments.rail && firearm.attachments.rail.magnification
          ? firearm.attachments.rail.magnification : 1;
        const target = aimed ? baseFov / Math.max(1.35, scope) : baseFov;
        game.camera.fov += (target - game.camera.fov) * Math.min(1, dt * 9);
      }
      ctx.state.aiming = aimed = ads();

      // The status panel says what the weapon is doing, in the words a
      // shooter would use rather than as a number.
      const lines = ctx.state.statusLines = ctx.state.statusLines || [];
      lines.length = 0;
      if (firearm) {
        const act = firearm.spec.action;
        const manual = act === SV.ACTION.boltAction || act === SV.ACTION.pump || act === SV.ACTION.leverAction;
        lines.push(`${firearm.name} · ${firearm.fireMode} · ${firearm.magazine.length + (firearm.chambered ? 1 : 0)}/${firearm.capacity}`);
        if (firearm.fireMode === SV.FIRE_MODE.safe) lines.push('Safety on — shift+Z');
        if (pendingCase && manual) lines.push(`Fired case in the chamber — ${ctx.hint('z', 'rb')} to work the action`);
        if (firearm.jammed) lines.push(`${firearm.name}: ${firearm.jammed.kind} — hold ${ctx.hint('u', 'y')}`);
        else if (!firearm.chambered && !firearm.magazine.length) lines.push(`${firearm.name}: empty — ${ctx.hint('l', 'rb')} to load`);
        else if (firearm.barrelTempC > 120) lines.push('The barrel is too hot to hold.');
        if (firearm.fouling > 0.6) lines.push('The action is thick with carbon.');
        if (firearm.oilLevel < 0.2) lines.push('The rifle is bone dry.');
      }
    });

    ctx.log('Number keys pick up a weapon. L loads it (shift+L for one round '
      + 'at a time), Z works the action, shift+Z is the selector, I looks it '
      + 'over and shift+I puts it on the bench.');
  },
});
