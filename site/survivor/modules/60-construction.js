/* Building, repairing and wiring. Three jobs that share a screen because
   they share a truth: none of them is a single click.

   A wall you shoot a hole through is repaired in the order a real one is —
   frame, sheathe, insulate, board, tape, mud, sand, paint — and the wall
   itself refuses to take a step out of order. Structural strength comes
   back with the frame and the board; the last four steps only make the
   patch invisible. That is exactly what SV.Wall.repair enforces, so the
   module can be honest without inventing anything.

   The wiring half runs a real check: gauge against breaker, load against
   ampacity, voltage drop against run length, earth and ground-fault
   protection against where it is. A run that would burn a house down is
   rejected with the reason an inspector would give.

   Emits: 'built' { piece }, 'repaired' { wall, stage }, 'wired' { circuit }. */
SurvivorGame.module({
  id: 'construction',
  order: 60,

  init(ctx) {
    const { LE, SV, game } = ctx;

    /* Repair steps, with what each needs and how long it takes. The times
       are the honest ones for a two-foot patch: mudding is quick and drying
       is not, which is why it takes three coats over two days in real life
       and three timed steps here. */
    const REPAIR = {
      frame:    { needs: { plank: 1, nails: 1 }, tool: 'hammer', seconds: 420, says: 'Sistered a stud in behind it.' },
      sheathe:  { needs: { plank: 1, nails: 1 }, tool: 'hammer', seconds: 300, says: 'Sheathing on.' },
      insulate: { needs: { cloth: 1 }, tool: null, seconds: 180, says: 'Packed the bay. It will hold heat again.' },
      board:    { needs: { plank: 1, nails: 1 }, tool: 'hammer', seconds: 360, says: 'Boarded over.' },
      tape:     { needs: { cloth: 1 }, tool: null, seconds: 240, says: 'Taped the seams.' },
      mud:      { needs: { sand: 1 }, tool: null, seconds: 300, says: 'First coat on. It has to dry.' },
      sand:     { needs: {}, tool: null, seconds: 240, says: 'Sanded flat.' },
      paint:    { needs: {}, tool: null, seconds: 300, says: 'Painted. You cannot see where it was.' },
    };
    const STEPS = ['frame', 'sheathe', 'insulate', 'board', 'tape', 'mud', 'sand', 'paint'];

    /* What the player can put up from nothing. Costs are in the same items
       the inventory already knows about, and the mass of each piece is the
       real mass of that much timber. */
    const PIECES = {
      wallSection: { name: 'wall section', cost: { plank: 4, nails: 2 }, tool: 'hammer', seconds: 900,
        size: [2.4, 2.4, 0.14], material: { preset: 'wood', color: 0xa9885c }, assembly: 'exteriorFrameWall' },
      floorSection: { name: 'floor section', cost: { plank: 3, nails: 2 }, tool: 'hammer', seconds: 720,
        size: [2.4, 0.12, 2.4], material: { preset: 'wood', color: 0x9b7c54 } },
      roofSection: { name: 'roof section', cost: { plank: 3, nails: 2 }, tool: 'hammer', seconds: 780,
        size: [2.6, 0.1, 2.6], material: { preset: 'wood', color: 0x74593a }, pitchDeg: 28 },
      doorway: { name: 'doorway', cost: { plank: 2, nails: 2 }, tool: 'hammer', seconds: 600,
        size: [1.0, 2.1, 0.14], material: { preset: 'wood', color: 0x8a6d47 } },
      ladder: { name: 'ladder', cost: { plank: 2, cordage: 2 }, tool: null, seconds: 900,
        size: [0.5, 3.0, 0.1], material: { preset: 'wood', color: 0x8a6d47 } },
      workbench: { name: 'workbench', cost: { plank: 4, nails: 2 }, tool: 'hammer', seconds: 1800,
        size: [2.0, 0.9, 0.8], material: { preset: 'wood', color: 0x7a613f }, workbench: true },
      palisade: { name: 'palisade', cost: { timber: 2, cordage: 1 }, tool: 'axe', seconds: 1200,
        size: [2.2, 2.6, 0.25], material: { preset: 'wood', color: 0x5f4a2e } },
    };

    let pieceId = 0;
    let ghost = null;             // the translucent preview
    let placing = null;           // key into PIECES
    let job = null;               // { seconds, remaining, label, run }

    const built = [];             // { piece, actor, x, y, z, yaw }

    /* ---- placing ---------------------------------------------------- */

    function ghostFor(key) {
      const spec = PIECES[key];
      if (ghost) { try { ghost.destroy(); } catch (e) { /* gone */ } ghost = null; }
      ghost = game.box({
        at: [0, -100, 0], size: spec.size,
        material: Object.assign({}, spec.material, { opacity: 0.45, roughness: 0.9 }),
        static: true, name: 'ghost',
      });
      return ghost;
    }

    /* Where the piece would go: two and a half metres down the camera,
       snapped to the ground and to quarter-metre steps so runs line up. */
    function placementPoint() {
      const a = ctx.aim();
      const dist = 2.6;
      const x = a.origin.x + a.direction.x * dist;
      const z = a.origin.z + a.direction.z * dist;
      const sx = Math.round(x * 4) / 4, sz = Math.round(z * 4) / 4;
      return { x: sx, z: sz, y: ctx.groundY(sx, sz) };
    }

    function canAfford(spec) {
      const inv = ctx.player.inventory;
      for (const [item, n] of Object.entries(spec.cost)) if (!inv.has(item, n)) return false;
      if (spec.tool && !inv.has(spec.tool, 1)) return false;
      return true;
    }

    function place() {
      const spec = PIECES[placing];
      if (!spec) return;
      if (!canAfford(spec)) {
        const missing = Object.entries(spec.cost).filter(([i, n]) => !ctx.player.inventory.has(i, n)).map(([i, n]) => `${n} ${i}`);
        ctx.toast(`Need ${missing.join(', ')}${spec.tool && !ctx.player.inventory.has(spec.tool, 1) ? ` and a ${spec.tool}` : ''}.`);
        return;
      }
      const p = placementPoint();
      const yaw = Math.round((game._camYaw * 180) / Math.PI / 15) * 15;
      startJob(`building a ${spec.name}`, spec.seconds, () => {
        for (const [item, n] of Object.entries(spec.cost)) ctx.player.inventory.remove(item, n);
        const actor = game.box({
          at: [p.x, p.y + spec.size[1] / 2, p.z], size: spec.size,
          material: spec.material, static: true, name: spec.name,
        });
        actor.setRotation([spec.pitchDeg || 0, yaw, 0]);
        const rec = { id: ++pieceId, key: placing, spec, x: p.x, y: p.y, z: p.z, yaw, actor };
        /* A wall the player built is a real wall as far as the ballistics
           are concerned: it gets a layer stack, so you can shoot through
           your own house exactly as you can shoot through anyone else's. */
        if (spec.assembly) {
          rec.wall = new SV.Wall({
            x1: p.x - Math.cos((yaw * Math.PI) / 180) * spec.size[0] / 2,
            z1: p.z + Math.sin((yaw * Math.PI) / 180) * spec.size[0] / 2,
            x2: p.x + Math.cos((yaw * Math.PI) / 180) * spec.size[0] / 2,
            z2: p.z - Math.sin((yaw * Math.PI) / 180) * spec.size[0] / 2,
            storey: 0, exterior: true, assembly: spec.assembly,
          });
          actor.userData = { kind: 'wall', wall: rec.wall, built: rec };
        } else {
          actor.userData = { kind: 'built', built: rec };
        }
        built.push(rec);
        ctx.world.built.push({ key: placing, x: p.x, y: p.y, z: p.z, yaw });
        ctx.player.practise('carpentry', 0.05);
        ctx.log(`${spec.name} up.`, true);
        ctx.emit('built', { piece: rec });
      });
    }

    function startJob(label, seconds, run) {
      if (job) { ctx.toast('You are already working on something.'); return; }
      job = { label, seconds, remaining: seconds, run };
      ctx.log(`${label} — ${Math.round(seconds / 60)} minutes of work.`);
    }

    ctx.onUpdate((dt) => {
      // The ghost follows the aim while a piece is selected.
      if (placing && ghost) {
        const p = placementPoint();
        const spec = PIECES[placing];
        ghost.visible = !ctx.state.uiOpen;
        ghost.setPosition([p.x, p.y + spec.size[1] / 2, p.z]);
        ghost.setRotation([spec.pitchDeg || 0, Math.round((game._camYaw * 180) / Math.PI / 15) * 15, 0]);
        ghost.setTint(canAfford(spec) ? 0x9fe08a : 0xe08a8a);
      } else if (ghost) ghost.visible = false;

      if (!job) return;
      // Building is work: it costs calories and it does not happen while
      // you walk away from it.
      job.remaining -= dt * (ctx.world.clock.timeScale || 1);
      ctx.player.extraWatts = 300;
      ctx.hud.setPrompt(`${job.label} — ${Math.max(0, job.remaining).toFixed(0)} s`);
      if (job.remaining > 0) return;
      const run = job.run;
      job = null;
      ctx.player.extraWatts = 0;
      ctx.hud.setPrompt('');
      try { run(); } catch (e) { ctx.log(`construction: ${e.message}`); }
    });

    /* ---- repairing --------------------------------------------------- */

    function nextStage(wall) {
      const i = wall._repairStage || 0;
      return STEPS[Math.min(i, STEPS.length - 1)];
    }

    function repairWall(wall) {
      const stage = nextStage(wall);
      const spec = REPAIR[stage];
      const inv = ctx.player.inventory;
      const missing = Object.entries(spec.needs).filter(([i, n]) => !inv.has(i, n));
      if (missing.length) { ctx.toast(`Need ${missing.map(([i, n]) => `${n} ${i}`).join(', ')} to ${stage} it.`); return; }
      if (spec.tool && !inv.has(spec.tool, 1)) { ctx.toast(`Need a ${spec.tool}.`); return; }
      startJob(`${stage} the wall`, spec.seconds, () => {
        for (const [i, n] of Object.entries(spec.needs)) inv.remove(i, n);
        const r = wall.repair(stage);
        if (!r.ok) { ctx.log(r.reason, true); return; }
        ctx.player.practise('carpentry', 0.03);
        ctx.log(`${spec.says}${r.done ? ' The wall is whole.' : ` Next: ${r.next}.`}`, !!r.done);
        ctx.emit('repaired', { wall, stage, done: !!r.done });
      });
    }

    /* Welding is the steel equivalent, and it needs what welding needs:
       a set, gas or power, and a shade to look through. Doing it without
       the shade is how you get arc eye, which the injury system will
       happily give you. */
    function weld(target) {
      const inv = ctx.player.inventory;
      if (!inv.has('weldingSet', 1)) { ctx.toast('No welding set.'); return; }
      const shaded = inv.has('weldingMask', 1);
      startJob('welding', 600, () => {
        if (target.wall) { target.wall.integrity = Math.min(1, target.wall.integrity + 0.5); target.wall.holes.length = 0; }
        ctx.player.practise('carpentry', 0.06);
        ctx.log('Bead run and ground back.', true);
        if (!shaded) {
          // Arc eye: photokeratitis, six to twelve hours later, and it is
          // agony for a day.
          ctx.player.injury.wound({ type: 'burn', region: 'head', severity: 0.12, clean: true });
          ctx.log('You looked at the arc. Your eyes will tell you about it tonight.', true);
        }
      });
    }

    /* ---- wiring ------------------------------------------------------ */

    const wiringSheet = document.createElement('div');
    wiringSheet.className = 'screen';
    wiringSheet.hidden = true;
    wiringSheet.innerHTML = '<div class="sheet"></div>';
    document.body.appendChild(wiringSheet);
    const wbody = wiringSheet.querySelector('.sheet');

    const design = { gauge: 14, breakerA: 15, lengthM: 20, voltage: 120, expectedLoadW: 1200,
      ground: true, gfci: false, wet: false, aluminium: false, antioxidant: false };

    function renderWiring() {
      const check = SV.checkWiring(design);
      const rows = [
        ['conductor', [10, 12, 14, 16], 'gauge', (v) => `${v} AWG (${SV.AWG[v].ampacity} A)`],
        ['breaker', [15, 20, 30, 40, 60], 'breakerA', (v) => `${v} A`],
        ['run length', [8, 20, 40, 80], 'lengthM', (v) => `${v} m`],
        ['supply', [120, 240], 'voltage', (v) => `${v} V`],
        ['expected load', [600, 1200, 2400, 4800], 'expectedLoadW', (v) => `${v} W`],
      ].map(([label, options, key, fmt]) => `<tr><td>${label}</td><td>${
        options.map((o) => `<button data-set="${key}" data-value="${o}" ${design[key] === o ? 'class="on"' : ''}>${fmt(o)}</button>`).join(' ')
      }</td></tr>`).join('');

      const toggles = [['ground', 'earth conductor'], ['gfci', 'ground fault device'],
        ['wet', 'wet location'], ['aluminium', 'aluminium cable'], ['antioxidant', 'antioxidant paste']]
        .map(([k, label]) => `<button data-toggle="${k}" ${design[k] ? 'class="on"' : ''}>${label}: ${design[k] ? 'yes' : 'no'}</button>`).join(' ');

      wbody.innerHTML = `<h2>Wiring a circuit</h2>
        <p class="faint">Every rule below is the one an inspector would apply.
          A breaker bigger than the cable can carry does not protect the cable — it protects nothing.</p>
        <table>${rows}</table>
        <p style="margin:10px 0">${toggles}</p>
        <div style="margin:12px 0;padding:10px;border:1px solid ${check.ok ? '#3f6a3f' : '#6a3f3f'};background:${check.ok ? '#182018' : '#201818'}">
          ${check.ok
            ? `<b style="color:#8ad07a">This passes.</b> ${check.dropPct.toFixed(1)}% voltage drop over ${design.lengthM} m.`
            : `<b style="color:#d8785a">${check.problems.length} problem${check.problems.length > 1 ? 's' : ''}:</b><ul>${
              check.problems.map((p) => `<li>${p}</li>`).join('')}</ul>`}
        </div>
        <p><button data-install ${check.ok ? '' : 'disabled'}>Install it (${Math.round(design.lengthM * 1.5)} minutes, ${Math.ceil(design.lengthM / 8)} wire)</button>
        <span class="faint"> — X to close.</span></p>`;
    }

    wbody.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.set) design[t.dataset.set] = +t.dataset.value;
      if (t.dataset.toggle) design[t.dataset.toggle] = !design[t.dataset.toggle];
      if (t.hasAttribute('data-install')) {
        const need = Math.ceil(design.lengthM / 8);
        if (!ctx.player.inventory.has('wire', need)) { ctx.toast(`Need ${need} wire.`); return; }
        toggleWiring();
        startJob('running the circuit', design.lengthM * 90, () => {
          ctx.player.inventory.remove('wire', need);
          const c = new SV.Circuit({ name: `run ${ctx.world.electrical.circuits.length + 1}`,
            breakerA: design.breakerA, gauge: design.gauge, lengthM: design.lengthM,
            voltage: design.voltage, gfci: design.gfci });
          ctx.world.electrical.addCircuit(c);
          ctx.player.practise('electrical', 0.1);
          ctx.log(`Circuit in: ${design.gauge} AWG on a ${design.breakerA} A breaker.`, true);
          ctx.emit('wired', { circuit: c });
        });
        return;
      }
      renderWiring();
    });

    function toggleWiring() {
      wiringSheet.hidden = !wiringSheet.hidden;
      ctx.state.uiOpen = !wiringSheet.hidden;
      ctx.state.movementLocked = !wiringSheet.hidden;
      if (!wiringSheet.hidden) renderWiring();
    }

    /* ---- the build menu ---------------------------------------------- */
    const menu = ctx.hud.panel('build', { className: 'panel' });
    menu.style.cssText += ';position:absolute;right:12px;top:270px;display:none;min-width:220px';

    function renderMenu() {
      menu.innerHTML = '<div style="font-size:12px;opacity:.7;margin-bottom:4px">Build (1-7, N to close)</div>'
        + Object.entries(PIECES).map(([k, s], i) => {
          const ok = canAfford(s);
          const cost = Object.entries(s.cost).map(([it, n]) => `${n} ${it}`).join(', ');
          return `<div style="opacity:${ok ? 1 : 0.45};${placing === k ? 'color:#e8c96a' : ''}">`
            + `${i + 1}. ${s.name} <span class="faint">— ${cost}</span></div>`;
        }).join('');
    }

    let menuOpen = false;
    ctx.key('n', () => {
      menuOpen = !menuOpen;
      ctx.state.buildMenuOpen = menuOpen;
      menu.style.display = menuOpen ? 'block' : 'none';
      if (!menuOpen) { placing = null; if (ghost) ghost.visible = false; }
      else renderMenu();
    }, 'Build menu');

    for (let i = 1; i <= 7; i++) {
      ctx.key(String(i), () => {
        if (!menuOpen) return;
        placing = Object.keys(PIECES)[i - 1];
        ghostFor(placing);
        renderMenu();
        ctx.toast(`${PIECES[placing].name} — click to place.`);
      }, i === 1 ? 'Choose a piece (in the build menu)' : null);
    }

    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !placing || ctx.state.uiOpen) return;
      place();
    });

    ctx.key('x', toggleWiring, 'Wiring');
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wiringSheet.hidden) toggleWiring(); });

    /* ---- verbs -------------------------------------------------------- */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind === 'wall' && ud.wall && ud.wall.holes && ud.wall.holes.length) {
        const stage = nextStage(ud.wall);
        return { verb: `${stage} the hole (${ud.wall.holes.length} hole${ud.wall.holes.length > 1 ? 's' : ''}, integrity ${Math.round(ud.wall.integrity * 100)}%)`,
          hold: 2, act: () => repairWall(ud.wall) };
      }
      if (ud.kind === 'welder') {
        return { verb: 'weld', hold: 2, act: () => weld(ud) };
      }
      if (ud.kind === 'built' && ud.built && ud.built.spec.workbench) {
        return { verb: 'use the workbench', hold: 0, act: () => { ctx.state.atWorkbench = true; ctx.toast('At the bench: crafting is twice as fast.'); } };
      }
      return null;
    });
  },
});
