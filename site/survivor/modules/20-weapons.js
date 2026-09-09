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

    /* Which viewmodel shape a weapon gets. The engine has no separate
       viewmodel pass, so the gun is an ordinary actor parked in front of the
       camera every frame — which means it is lit by the same sun as
       everything else, and looks it. */
    const CLASS = {
      remington700_308: 'boltRifle', remington700_300wm: 'boltRifle',
      remington700_7mm: 'boltRifle', mauser98: 'boltRifle',
      ruger1022: 'carbine', ak47: 'carbine', m16: 'carbine',
      colt1911: 'pistol', revolver357: 'revolver', revolver500: 'revolver',
      barrett50: 'heavyRifle', shotgun12: 'shotgun',
    };

    function gunGeometry(kind) {
      const g = new LE.Geometry();
      /* Six faces with their own normals. Sharing eight vertices across all
         six would light every face as though it pointed at the sky, which is
         what makes a shaded box read as a flat grey slab. */
      const box = (x0, y0, z0, x1, y1, z1, col) => {
        const c = [
          [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
          [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        ];
        const faces = [
          [[4, 5, 6, 7], [0, 0, 1]], [[1, 0, 3, 2], [0, 0, -1]],
          [[5, 1, 2, 6], [1, 0, 0]], [[0, 4, 7, 3], [-1, 0, 0]],
          [[7, 6, 2, 3], [0, 1, 0]], [[0, 1, 5, 4], [0, -1, 0]],
        ];
        for (const [f, n] of faces) {
          const idx = [];
          f.forEach((ci, k) => {
            const p = c[ci];
            idx.push(g.vert(p[0], p[1], p[2], n[0], n[1], n[2], k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0));
            g.vertColor(col[0], col[1], col[2]);
          });
          g.quad(idx[0], idx[1], idx[2], idx[3]);
        }
      };
      const steel = [0.13, 0.13, 0.145];
      const wood = [0.24, 0.15, 0.08];
      const black = [0.06, 0.06, 0.07];

      switch (kind) {
        case 'boltRifle':
          box(-0.011, -0.008, 0.10, 0.011, 0.010, 0.34, steel);       // barrel
          box(-0.016, -0.014, -0.06, 0.016, 0.016, 0.12, steel);      // action
          box(-0.024, -0.052, -0.30, 0.024, -0.008, 0.06, wood);      // stock
          box(-0.026, -0.058, -0.30, 0.026, -0.040, -0.20, black);    // recoil pad
          box(-0.020, -0.050, 0.06, 0.020, -0.008, 0.22, wood);       // forend
          box(-0.010, -0.086, -0.04, 0.010, -0.050, 0.02, wood);      // grip
          box(0.016, 0.000, -0.04, 0.044, 0.010, -0.01, steel);       // bolt handle
          box(-0.024, 0.016, 0.00, 0.024, 0.032, 0.02, black);        // scope ring
          box(-0.024, 0.016, 0.14, 0.024, 0.032, 0.16, black);        // scope ring
          box(-0.021, 0.019, -0.02, 0.021, 0.045, 0.19, black);       // scope body
          break;
        case 'heavyRifle':
          box(-0.026, -0.018, -0.40, 0.026, 0.022, 0.52, steel);
          box(-0.034, -0.070, -0.40, 0.034, -0.012, 0.10, black);
          box(-0.030, 0.020, -0.10, 0.030, 0.038, 0.18, black);       // rail
          box(-0.040, -0.020, 0.44, 0.040, 0.024, 0.52, steel);       // brake
          break;
        case 'carbine':
          box(-0.014, -0.010, -0.26, 0.014, 0.016, 0.30, black);
          box(-0.026, -0.048, -0.26, 0.026, -0.006, 0.02, black);
          box(-0.022, -0.044, 0.04, 0.022, -0.006, 0.18, wood);
          box(-0.028, -0.120, 0.00, 0.028, -0.044, 0.08, black);      // magazine
          box(-0.010, -0.082, -0.06, 0.010, -0.046, 0.00, black);
          break;
        case 'shotgun':
          box(-0.019, -0.014, -0.28, 0.019, 0.016, 0.38, steel);
          box(-0.026, -0.052, -0.28, 0.026, -0.008, 0.04, wood);
          box(-0.030, -0.062, 0.10, 0.030, -0.016, 0.24, wood);       // pump
          break;
        case 'revolver':
          box(-0.011, -0.010, -0.02, 0.011, 0.012, 0.19, steel);
          box(-0.023, -0.020, 0.01, 0.023, 0.020, 0.06, steel);       // cylinder
          box(-0.011, -0.090, -0.05, 0.011, -0.008, 0.01, wood);      // grip
          break;
        default:                                                      // pistol
          box(-0.012, -0.004, -0.02, 0.012, 0.020, 0.15, steel);
          box(-0.011, -0.088, -0.04, 0.011, -0.002, 0.02, black);
          box(-0.009, -0.082, -0.02, 0.009, -0.010, 0.02, black);
          break;
      }
      return g.finalize();
    }

    const GUN_GEO = {};
    const GUN_MAT = { preset: 'painted', vertexColor: true, color: 0xffffff, roughness: 0.42, metalness: 0.55, uvScale: 6 };

    /* ---- the weapon in hand ---- */

    let firearm = null;
    let viewActor = null;
    let aiming = false;      // the mouse's own right button
    let aimed = false;       // mouse or trigger — what the game reacts to
    let baseFov = null;
    let recoilPitch = 0, recoilRecover = 0;
    let bobPhase = 0;
    let clearing = 0;
    const rng = new LE.Rng(0xf17e);

    function equip(weaponId) {
      const spec = SV.WEAPONS[weaponId];
      if (!spec) { ctx.toast('No such weapon.'); return null; }
      firearm = new SV.Firearm(weaponId, { condition: 0.62 + rng.next() * 0.3, oilLevel: 0.55 });
      // Iron sights unless the player fits something else.
      firearm.attach('ironSights');
      const kind = CLASS[weaponId] || 'carbine';
      if (!GUN_GEO[kind]) GUN_GEO[kind] = gunGeometry(kind);
      if (viewActor) { try { viewActor.destroy(); } catch (e) { /* gone */ } }
      viewActor = game.mesh({
        geometry: GUN_GEO[kind], key: `gun:${kind}`, material: GUN_MAT,
        at: [0, -1000, 0], physics: false, name: 'viewmodel',
      });
      viewActor.noCull = true;
      ctx.state.currentWeapon = firearm;
      ctx.log(`${spec.name}. ${spec.note}`, true);
      return firearm;
    }

    ctx.state.giveWeapon = equip;
    ctx.state.equipWeapon = equip;

    /* Ammunition. A round is a cartridge id plus a condition, which is what
       the firearm's fire() wants and what handloading produces. */
    function loadMagazine() {
      if (!firearm) return;
      const cid = firearm.cartridgeId;
      const have = ctx.player.inventory.slots.find((s) => s.item === `ammo:${cid}`);
      const want = firearm.capacity - firearm.magazine.length;
      const n = Math.min(want, have ? have.quantity : want);
      if (n <= 0) { ctx.toast('No ammunition for it.'); return; }
      const rounds = [];
      for (let i = 0; i < n; i++) rounds.push({ cartridgeId: cid, condition: 0.9 + rng.next() * 0.1 });
      firearm.load(rounds);
      if (have) ctx.player.inventory.remove(`ammo:${cid}`, n);
      ctx.toast(`Loaded ${n}.`);
    }

    /* ---- the shot ---- */

    const HIT_TMP = new LE.Vec3();

    function shoot() {
      if (!firearm) { ctx.toast('Nothing in your hands.'); return; }
      if (firearm.jammed) { ctx.toast(`${firearm.jammed.kind} — hold R to clear`); return; }
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
      game.particles.smoke([origin.x, origin.y, origin.z], { count: 5, size: 0.25, life: 0.5 });
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

    function placeViewmodel(dt) {
      if (!viewActor || !firearm) return;
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
         right where a rifle actually hangs. Further out than it feels like
         it should be, because at thirty centimetres a real rifle fills half
         your field of view and reads as a prop held to your face. */
      /* The near plane is a quarter of a metre and there is no separate
         viewmodel pass, so the gun cannot come as close to the eye as a
         real one does. Aiming therefore brings it onto the centre line and
         a little low and left of it, which reads as looking through the
         sight without putting the back of the receiver in your eye. */
      const outX = aimed ? 0.012 : 0.17;
      const outY = aimed ? -0.052 : -0.14;
      const outZ = aimed ? 0.52 : 0.46;

      const pos = new LE.Vec3().copy(cam.position)
        .addScaled(fwd, outZ)
        .addScaled(right, outX + swayX)
        .addScaled(up, outY + swayY);
      viewActor.setPosition([pos.x, pos.y, pos.z]);

      const yaw = Math.atan2(fwd.x, fwd.z) * 180 / Math.PI;
      const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180 / Math.PI;
      viewActor.setRotation([-pitch, yaw, aimed ? 0 : 3]);
      viewActor.visible = !ctx.paused;
    }

    /* ---- input ---- */

    ctx.key('1', () => { if (!ctx.state.buildMenuOpen) equip('remington700_308'); }, 'Bolt rifle');
    ctx.key('2', () => { if (!ctx.state.buildMenuOpen) equip('ruger1022'); }, '.22');
    ctx.key('3', () => { if (!ctx.state.buildMenuOpen) equip('shotgun12'); }, 'Shotgun');
    ctx.key('4', () => { if (!ctx.state.buildMenuOpen) equip('revolver357'); }, 'Revolver');
    ctx.key('5', () => { if (!ctx.state.buildMenuOpen) equip('ak47'); }, 'AK');
    ctx.key('l', () => loadMagazine(), 'Load');
    ctx.key('i', () => {
      if (!firearm) return;
      const info = firearm.inspect();
      ctx.log(`${firearm.name}: ${info.notes.length ? info.notes.join('; ') : 'in good order'}`, true);
      ctx.toast(`${(info.reliability * 100).toFixed(0)}% reliable, ${info.accuracyMoa.toFixed(1)} MOA`);
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
      if (spec.action === SV.ACTION.fullAuto) return 60 / (spec.rpm || 600);
      if (spec.action === SV.ACTION.semiAuto) return Math.max(0.11, spec.cycleTimeS || 0.11);
      // Bolt, pump, lever, revolver, break: one per pull of the trigger.
      return Infinity;
    }

    // A stoppage is cleared by holding, not by tapping — and some of them
    // need a rod, which the model already decides.
    ctx.key('u', () => {
      if (!firearm || !firearm.jammed) return;
      clearing = 0.35;
    }, 'Clear a stoppage');

    ctx.onUpdate((dt) => {
      aimed = ads();
      placeViewmodel(dt);

      // The trigger.
      sinceShot += dt;
      if (!ctx.paused && !ctx.state.uiOpen && trigger()) {
        const interval = repeatInterval();
        if (firedThisPull === 0 || (interval !== Infinity && sinceShot >= interval)) {
          sinceShot = 0;
          firedThisPull++;
          shoot();
        }
      } else if (!trigger()) {
        firedThisPull = 0;
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
        if (firearm.jammed) lines.push(`${firearm.name}: ${firearm.jammed.kind} — hold ${ctx.hint('u', 'y')}`);
        else if (!firearm.chambered && !firearm.magazine.length) lines.push(`${firearm.name}: empty — ${ctx.hint('l', 'rb')} to load`);
        else if (firearm.barrelTempC > 120) lines.push('The barrel is too hot to hold.');
        if (firearm.fouling > 0.6) lines.push('The action is thick with carbon.');
        if (firearm.oilLevel < 0.2) lines.push('The rifle is bone dry.');
      }
    });

    ctx.log('Number keys pick up a weapon. L loads it, left mouse fires.');
  },
});
