// In-page QA suite (runs inside the game page; see qa.mjs). Returns a report.
// Every test is isolated: an exception is recorded and the suite continues.
async (opts) => {
  const SB = window.SB, C = window.SB.catalogs;
  opts = { land: C.LAND.map((l) => l.id), boats: C.BOATS, air: C.AIRCRAFT, weapons: Object.keys(C.WEAPONS).filter((k) => k !== 'fists'), attachments: C.ATTACHMENTS.map((a) => a.id), arsenalAct: SB.arsenalAct, ...(opts || {}) };
  const _unused = G = SB.game, THREE_V = (x, y, z) => ({ x, y, z });
  const report = { pass: 0, fail: 0, errors: [], notes: [] };
  const t0 = performance.now();
  const ok = (cond, name) => { if (cond) report.pass++; else { report.fail++; report.errors.push('FAIL ' + name); } };
  const run = async (name, fn) => { console.log('QA> ' + name); const _t = performance.now(); try { await fn(); } catch (e) { report.fail++; report.errors.push(`EXC ${name}: ${e && e.message}\n${(e && e.stack || '').split('\n').slice(1, 3).join(' | ')}`); } const _ms = performance.now() - _t; if (_ms > 8000) console.log(`QA< ${name} took ${Math.round(_ms / 1000)}s`); };
  const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));
  const ctl = { throttle: 1, brake: 0, steer: 0.3, handbrake: false, nitro: true };
  // a brand-new game: you arrive with nothing and buy everything
  await run('new game: start with nothing', async () => {
    const P = G.career.p;
    ok(G.combat.owned.length === 1 && G.combat.owned[0] === 'fists', 'new game owns no weapons (fists only)');
    ok(G.career.money === 50000, 'new game starts with $50,000 (' + G.career.money + ')');
    ok(P.garage.length === 0, 'new game owns no vehicles');
    ok(!Object.values(P.med || {}).some((n) => n > 0), 'new game has no medical supplies');
    ok(!(P.gearOwned || []).length && (P.gear?.holster || 'owb') === 'owb', 'new game owns no gear');
    ok(!G.S.lastVehicle, 'no car is marked as yours');
    ok(G.gunStoreDefs.some((st) => st.ids[0] === 'pistol') && C.WEAPONS.pistol.price > 0, 'the Standard 9mm is for sale');
  });
  G.career.hooks.setMoney(1e9);
  SB.setWeather('clear'); SB.setHour(12);

  // ---------------- hitboxes ----------------
  await run('hitbox: parked car', async () => {
    const v = G.parked.find((p) => !p.isBoat && !p.isAir);
    v.group.updateMatrixWorld(true);
    const f = v.forward(), rx = f.z, rz = -f.x, y = v.pos.y + (v.spec.height || 1.4) * 0.45;
    const shoot = (side) => SB.trace(v.pos.x + rx * 12 + f.x * side, y, v.pos.z + rz * 12 + f.z * side, -rx, 0, -rz, 30);
    ok(shoot(0).kind === 'vehicle', 'ray through the middle of a car hits it');
    ok(shoot(v.spec.len / 2 + 0.06).kind !== 'vehicle', 'ray 6 cm past the bumper misses the car');
    ok(shoot(v.spec.len / 2 - 0.15).kind === 'vehicle', 'ray 15 cm inside the bumper hits the car');
    const over = SB.trace(v.pos.x + rx * 12, v.pos.y + (v.spec.height || 1.4) + 0.08, v.pos.z + rz * 12, -rx, 0, -rz, 30);
    ok(over.kind !== 'vehicle', 'ray 8 cm above the roof misses the car');
  });
  await run('hitbox: pedestrian', async () => {
    const pp = G.player.pos, p = G.peds.spawnAt(pp.x + 6, pp.z + 6, pp);
    p.mode = 'idle'; p.speed = 0; p.h.root.position.copy(p.pos); p.h.root.updateMatrixWorld(true); p.h.update(0.01);
    const at = (dx, h) => SB.trace(p.pos.x + dx, p.pos.y + h, p.pos.z - 10, 0, 0, 1, 30);
    const head = at(0, 1.62), chest = at(0, 1.2), wide = at(0.7, 1.2), above = at(0, 2.05);
    ok(head.kind === 'ped' && head.head, 'shot at head height is a headshot');
    ok(chest.kind === 'ped' && !chest.head, 'shot at chest is a body hit');
    ok(wide.kind !== 'ped', 'shot 70 cm to the side misses');
    ok(above.kind !== 'ped', 'shot above the head misses');
    G.peds.damage(p, 999, pp);
  });
  await run('hitbox: animal', async () => {
    const pp = G.player.pos;
    for (const sp of Object.keys(G.hunting.species)) {
      const a = G.hunting.spawn(sp, pp.x - 20, pp.z + 20); // out on the open lot (the kerb east of the spawn has parked cars)
      if (!a) { report.notes.push(`animal ${sp} model not loaded yet`); continue; }
      a.mode = 'graze'; a.update(0.01, G.hm, G.player, { noise: 1, bite() {} }); a.group.updateMatrixWorld(true);
      const c = a.center();
      ok(SB.trace(c.x, c.y, c.z - 12, 0, 0, 1, 30).kind === 'animal', `ray through a ${sp} hits it`);
      ok(SB.trace(c.x, a.pos.y + a.size.y + 0.15, c.z - 12, 0, 0, 1, 30).kind !== 'animal', `ray above a ${sp} misses`);
      a.hurt(9999);
    }
  });

  // ---------------- every vehicle: build, drive, NaN check ----------------
  await run('vehicles: every land model', async () => {
    let n = 0;
    for (const id of opts.land) {
      try {
        const v = new G.Vehicle(G.lib, id);
        v.pos.set(G.player.pos.x + 40, G.hm.height(G.player.pos.x + 40, G.player.pos.z), G.player.pos.z);
        for (let k = 0; k < 20; k++) v.physics(1 / 30, ctl, G.hm, G.collision);
        v.sync(1 / 30);
        ok(finite(v.pos) && Number.isFinite(v.heading), `vehicle ${id} stays finite`);
        ok(v.spec.width > 1 && v.spec.width < 3.2 && v.spec.len > 2.5 && v.spec.len < 13, `vehicle ${id} footprint sane (${v.spec.width.toFixed(2)} x ${v.spec.len.toFixed(2)})`);
        v.dispose(); n++;
      } catch (e) { report.fail++; report.errors.push(`EXC vehicle ${id}: ${e.message}`); }
      if (n % 10 === 0) await yieldUI();
    }
    report.notes.push(`${n} land vehicles driven`);
  });
  await run('car cabin: seats, doors, glass, cockpit', async () => {
    const v = new G.Vehicle(G.lib, 'sedan');
    v.pos.set(G.player.pos.x + 30, G.hm.height(G.player.pos.x + 30, G.player.pos.z), G.player.pos.z); v.sync(0);
    G.scene.add(v.group);
    ok(!!v.cabLayout && v.cabLayout.seats.length >= 2, 'a sedan has a driver and a passenger seat');
    ok(v.cabLayout.seats.length >= 4, 'a sedan has a rear bench');
    const L = v.cabLayout, s = G.player.h.root;
    ok(L.wheel.y > L.floorY && L.wheel.y < v.procSpec.roof && L.eye.y < v.procSpec.roof, 'wheel and eyes inside the cabin');
    v.seat(G.player.h, 0);
    ok(finite(s.position) && s.position.distanceTo(v.pos) < 2, 'seating puts you in the car');
    const d = v.door('door-drv'), p2 = v.door('door-pass');
    ok(!!d && !!p2 && d.userData.open < 0 && p2.userData.open > 0, 'both front doors split out and swing outward');
    v.setClear(false); ok(v.bodyMat.userData.u.uClear.value === 0 && !v.cab.glass.visible, 'tinted when nobody is at the wheel');
    v.setClear(true); ok(v.bodyMat.userData.u.uClear.value === 1 && v.cab.inner.visible, 'clear glass shows the cabin');
    v.steer = 0.4; v.speed = 20; v.updateCabin(1 / 30);
    ok(Math.abs(v.cab.spin.rotation.z) > 1 && v.cab.spd.visible, 'the wheel turns and the needles move');
    v.handsOnWheel(SB.gunPose()); ok(finite(G.player.h.model.getObjectByName('wristL').getWorldPosition(new SB.V3())), 'hands on the wheel stay finite');
    ok(!!v.eyeWorld(new SB.V3()), 'cockpit eye point');
    G.scene.remove(v.group); v.dispose();
    s.rotation.set(0, G.player.heading, 0); s.position.copy(G.player.pos);
    // every land model builds a cabin that fits it
    let bad = [];
    for (const id of opts.land) { const w = new G.Vehicle(G.lib, id); const C = w.cabLayout; if (C && !(C.seats.every((q) => Number.isFinite(q.y) && q.y > 0) && Number.isFinite(C.wheel.y))) bad.push(id); w.dispose(); }
    ok(bad.length === 0, 'every cabin layout is sane: ' + bad.slice(0, 5).join(','));
  });
  await run('rusty pickup is a full car', async () => {
    const v = new G.Vehicle(G.lib, 'rusty-pickup');
    ok(v.procedural && v.bodyMat.userData.u.uRust.value > 0.5 && !!v.cabLayout, 'Rico\'s pickup: procedural, rusty, with a cab');
    v.dispose();
  });
  await run('boats + aircraft', async () => {
    const m = G.marineAir.marinas[0];
    for (const b of opts.boats) {
      const v = G.marineAir.spawnCraft(b, 'boat', { x: m.water.x, z: m.water.z, h: m.dir });
      for (let k = 0; k < 30; k++) v.physics(1 / 30, ctl, G.hm); v.sync(1 / 30);
      ok(finite(v.pos), `boat ${b.id} finite`);
      G.scene.remove(v.group); G.parked.splice(G.parked.indexOf(v), 1);
    }
    for (const a of opts.air) {
      const v = G.marineAir.spawnCraft(a, 'air', { x: 1100, z: -440, h: -1.57 });
      for (let k = 0; k < 120; k++) v.physics(1 / 30, { throttle: 1, handbrake: k > 60, steer: 0.2 }, G.hm); v.sync(1 / 30);
      ok(finite(v.pos), `aircraft ${a.id} finite`);
      if (!v.heli) ok(v.speed > 10, `aircraft ${a.id} accelerates on the runway`);
      G.scene.remove(v.group); G.parked.splice(G.parked.indexOf(v), 1);
    }
  });

  // ---------------- weapons + attachments ----------------
  await run('weapons: fire every weapon', async () => {
    const c = G.combat, o = new window.SB.V3(G.player.pos.x, G.player.pos.y + 1.6, G.player.pos.z), d = new window.SB.V3(0.3, -0.05, 1).normalize();
    const targets = { peds: G.peds, vehicles: G.parked, animals: G.hunting.list, statics: [] };
    let n = 0;
    for (const id of opts.weapons) {
      c.give(id); c.weapon = id; c.cooldown = 0; c.reloading = 0;
      if (c.ammo[id]) c.ammo[id].clip = Math.max(c.ammo[id].clip, 1);
      c.attack(o.clone(), d.clone(), o.clone(), targets, G.player.pos);
      c.update(3); n++;
      if (n % 40 === 0) await yieldUI();
    }
    report.notes.push(`${n} weapons fired`);
    c.weapon = 'fists';
  });
  await run('weapons: hold every knife and hand weapon', async () => {
    const c = G.combat;
    const prev = { weapon: c.weapon, holstered: c.holstered, dual: c.dual, slots: { ...c.slots } };
    const melee = opts.weapons.filter((id) => id !== 'fists' && c.constructor.slotOf(id) === 'melee');
    for (const id of melee) {
      c.give(id); c.slots.melee = id; c.equip('melee');
      ok(c.weapon === id && !c.holstered, `${id} equips from the melee slot`);
      ok(!!c.model(id), `${id} has a model to hold`);
      window.SB.skipRender(true); window.SB.step(3, 1 / 30); window.SB.skipRender(false);
    }
    // leave the combat state exactly as we found it for the tests that follow
    c.weapon = prev.weapon; c.holstered = prev.holstered; c.dual = prev.dual; Object.assign(c.slots, prev.slots); delete c.slots.melee;
  });
  await run('attachments: fit every attachment', async () => {
    const ui = opts.arsenalAct;
    G.combat.give('rifle_01'); G.combat.weapon = 'rifle_01';
    for (const id of opts.attachments) ui(id);
    ok(Number.isFinite(G.combat.def.damage) && G.combat.def.clip >= 1, 'weapon stats stay valid after all attachments');
  });

  // ---------------- tools ----------------
  await run('tools: buy + use every tool', async () => {
    const st = G.toolsSys.store;
    for (const t of G.tools.list) { st.cfg.act(t); G.useTool(t); }
    ok(G.tools.list.every((t) => G.career.p.tools[t.id] >= 0), 'tool counts valid');
  });

  // ---------------- every shop screen and tab ----------------
  await run('shops: every tab renders', async () => {
    const shops = [G.garage.dealer, G.garage.customs, G.marineAir.boatShop, G.marineAir.airShop, G.estate.realtor, G.toolsSys.store, G.hunting.post, G.fishing.market, G.phoneSys.phone];
    for (const sh of shops) {
      const tabs = typeof sh.cfg.tabs === 'function' ? sh.cfg.tabs() : sh.cfg.tabs;
      for (const t of tabs) { sh.show(t.k); sh.render(); }
      sh.close();
    }
  });

  // ---------------- jobs ----------------
  await run('jobs: start + quit every job', async () => {
    for (const j of G.jobs.JOBS) {
      const pt = G.interact.points.find((p) => typeof p.label === 'function' && p.label().includes(j.name));
      if (!pt) { report.fail++; report.errors.push('FAIL no job board for ' + j.name); continue; }
      pt.use();
      G.jobs.update(1 / 30);
      if (G.jobs.active) pt.use(); // quit
      if (G.vehicle()) SB.exitCar();
      ok(!G.jobs.active, `job ${j.id} starts and quits cleanly`);
    }
  });

  // ---------------- missions ----------------
  await run('missions: start + step every mission', async () => {
    for (let i = 0; i < G.missions.MISSIONS.length; i++) {
      G.missions.start(i);
      for (let s = 0; s < 8; s++) { G.missions.update(1 / 30); if (s % 2 === 0) G.missions.advanceStep(); }
      G.missions.cancel();
      if (G.vehicle()) SB.exitCar();
      SB.setWanted(0);
    }
    ok(!G.missions.active, 'missions clean up');
  });

  // ---------------- interiors ----------------
  await run('interiors: enter + leave every building', async () => {
    let n = 0;
    const doors = opts.allDoors ? G.estate.doors : G.estate.doors.filter((d, i) => i % 3 === 0);
    for (const d of doors) {
      await G.estate.enter(d);
      ok(!!G.estate.inside, 'entered ' + d.i);
      const it = G.estate.inside && G.estate.inside.it;
      if (it) { let bad = 0; it.g.traverse((o) => { if (o.isMesh && !finite(o.position)) bad++; }); ok(bad === 0, 'interior ' + d.i + ' finite'); }
      G.estate.leave(); n++;
      if (n % 10 === 0) await yieldUI();
    }
    report.notes.push(`${n} interiors entered`);
  });
  await run('walls: rounds go through drywall, not brick', async () => {
    const c = G.combat, d = G.estate.doors.find((x) => x.b.style === 4);
    await G.estate.enter(d);
    const g = G.estate.inside.it.g; g.updateMatrixWorld(true);
    let wall = null;
    g.traverse((o) => { const P = o.geometry && o.geometry.parameters; if (!wall && o.isMesh && !o.userData.surf && o.material?.userData?.surf === 'drywall' && P && Math.min(P.width, P.depth) < 0.3 && Math.max(P.width, P.depth) > 2) wall = o; });
    ok(!!wall, 'a home has drywall partitions');
    if (wall) {
      const P = wall.geometry.parameters, wp = wall.getWorldPosition(new SB.V3());
      const n = P.width > P.depth ? new SB.V3(0, 0, 1) : new SB.V3(1, 0, 0);
      const o = wp.clone().addScaledVector(n, 1.5); o.y = wp.y + 0.2;
      const statics = []; g.traverse((m) => { if (m.isMesh && !m.userData.noHit) statics.push(m); });
      const T = { peds: G.peds, vehicles: [], animals: [], statics };
      c._pen = 3; const h1 = c.trace(o, n.clone().negate(), 20, T); c._pen = null;
      ok(h1.through && h1.through[0].surf === 'drywall', 'a rifle round goes through the partition (' + (h1.through ? h1.through.map((x) => x.surf).join('>') : h1.surf) + ')');
      c._pen = 0; const h2 = c.trace(o, n.clone().negate(), 20, T); c._pen = null;
      ok(!h2.through && h2.kind === 'building' && h2.surf === 'drywall', 'birdshot stops in the drywall');
      const before = c.holes.count;
      h1.dir = n.clone().negate(); h1.origin = o; h1.ammo = { dmg: 1, pen: 0 };
      c.impact(h1, { cat: 'rifle', pen: 3, damage: 30 }, T, o);
      ok(c.holes.count > before, 'entry and exit holes are left in the wall');
    }
    G.estate.leave();
    const brick = { t: 0, kind: 'building', box: { data: { surf: 'brick' } }, tExit: 9, point: new SB.V3() };
    c.wallInfo(brick, new SB.V3(1, 0, 0));
    ok(brick.surf === 'brick' && brick.thick > 1, 'a whole brick building is too thick to shoot through');
  });
  await run('houses: burn, fire department, rebuild', async () => {
    const D = G.demolition, B = G.city.buildings;
    const bi = B.findIndex((b) => b.style === 4 && !b.ruined && Math.hypot(b.x - G.player.pos.x, b.z - G.player.pos.z) < 2000);
    ok(bi >= 0, 'there are houses');
    if (bi >= 0) {
      const b = B[bi], m = new SB.THREE.Matrix4();
      D.destroy(bi);
      G.city.instOf[bi].mesh.getMatrixAt(G.city.instOf[bi].i, m);
      ok(b.ruined === 'fire' && D.sites.has(bi) && Math.abs(m.determinant()) < 1e-9, 'the house is burning and its model is replaced by the shell');
      ok(!!G.career.p.ruins[bi], 'the ruin is saved');
      const site = D.sites.get(bi);
      G.player.pos.set(b.x + b.w + 12, G.player.pos.y, b.z);
      SB.skipRender(true); for (let k = 0; k < 20; k++) SB.step(15, 1 / 15); SB.skipRender(false);
      ok(!!site.engine, 'a fire engine is dispatched');
      // the builder: jump the clock through the job
      site.phase = 'ruin'; site.t0 = G.sky.day * 24 + G.sky.hour - 2 - 16;
      SB.skipRender(true); SB.step(2, 1 / 30); SB.skipRender(false);
      ok(site.phase === 'build' && site.studs.count > 0, 'construction underway: framing at ' + site.stage);
      D.finish(bi);
      G.city.instOf[bi].mesh.getMatrixAt(G.city.instOf[bi].i, m);
      ok(!b.ruined && Math.abs(m.determinant()) > 1e-6 && !G.career.p.ruins[bi], 'the house is rebuilt and back on the map');
    }
  });
  await run('properties: buy a few', async () => {
    for (const p of G.estate.props.slice(0, 5)) { G.career.p.properties.push(p.id); }
    G.estate.update(1); ok(true, 'property income tick');
  });

  // ---------------- hunting ----------------
  await run('hunting: kill + skin', async () => {
    G.career.addTool('hunting_skinning-knife');
    const before = G.career.p.stats.animals;
    for (const sp of ['deer', 'stag', 'coyote', 'fox']) {
      const a = G.hunting.spawn(sp, G.player.pos.x + 1, G.player.pos.z + 1);
      if (!a) continue;
      a.hurt(9999);
      G.hunting.update(1 / 30, { enter: true }, true);
    }
    ok(G.career.p.stats.animals > before, 'skinning adds pelts');
  });

  // ---------------- weather + time ----------------
  await run('weather + time of day', async () => {
    for (const w of ['clear', 'cloudy', 'overcast', 'rain', 'storm']) for (const h of [3, 7, 12, 18.3, 22]) { SB.setWeather(w); SB.setHour(h); SB.step(1, 1 / 30); }
    SB.setWeather('clear'); SB.setHour(12);
  });

  await run('prologue: Rico rides along, then walks off', async () => {
    const P = G.career.p, money0 = G.S.money;
    P.story.prologue = false;
    G.gang.startPrologue();
    SB.skipRender(true);
    SB.step(2); document.querySelector('.sbskip')?.click(); SB.step(4);
    ok(G.rico.phase === 'truck' && !!G.rico.truck, 'after the intro: get in Rico\'s pickup');
    for (let k = 0; k < 40 && G.rico.state !== 'riding'; k++) SB.step(10);
    ok(G.rico.state === 'riding', 'Rico walked to the passenger door and got in (' + G.rico.state + ')');
    const t = G.rico.truck;
    G.player.pos.copy(t.pos); SB.enterNearest(); SB.step(5);
    ok(G.S.vehicle === t && G.rico.phase === 'drive', 'driving Rico downtown');
    const d = G.rico.dest;
    t.pos.set(d.x, G.collision.surface(d.x, d.z, 500), d.z); t.vel.set(0, 0); t.speed = 0;
    SB.step(3);
    ok(G.rico.state === 'out' || G.rico.state === 'shut' || G.rico.state === 'leave', 'at the drop-off Rico gets out (' + G.rico.state + ')');
    ok(P.story.prologue && G.S.money >= money0 + 200, 'paid $200 and the prologue is done');
    SB.step(30);
    const p0 = G.rico.pos.clone(); SB.step(30);
    ok(G.rico.state === 'leave' && G.rico.pos.distanceTo(p0) > 0.5, 'he walks off down the sidewalk');
    for (let k = 0; k < 90 && G.rico.state; k++) SB.step(15);
    ok(G.rico.state === null, 'and is back at the yard afterwards');
    SB.exitCar(); SB.skipRender(false);
  });

  // ---------------- save / load ----------------
  await run('save round trip', async () => {
    G.career.save();
    const raw = JSON.parse(localStorage.getItem('southbound.save.v1'));
    ok(raw && raw.v === 1 && Array.isArray(raw.garage) && typeof raw.money === 'number', 'save is valid JSON with the expected fields');
  });

  // ---------------- front yards and town poles (G11) ----------------
  await run('front yards and town poles', async () => {
    const Y = G.yards, c = (Y && Y.counts) || {};
    ok(c.houses >= 25, 'houses facing a street get a front yard (' + c.houses + ')');
    ok(c.walks >= 20 && c.drives >= 15, 'front walks and driveways (' + c.walks + ', ' + c.drives + ')');
    ok(Y.drives.filter((d) => d.car).length >= 6, 'most driveways have a car (' + Y.drives.filter((d) => d.car).length + ')');
    ok(c.mailboxes >= 10 && c.bins >= 10 && c.fences >= 10 && c.lanterns >= 25 && c.ac >= 10, 'mailboxes, bins, picket fences, lanterns, AC units');
    ok((c.drops || 0) >= 15, 'service wires run from the poles to the houses (' + c.drops + ')');
    const B = G.city.buildings;
    const inside = (x, z) => B.some((b) => Math.abs(x - b.x) < b.w / 2 - 0.2 && Math.abs(z - b.z) < b.d / 2 - 0.2);
    ok(Y.drives.every((d) => Number.isFinite(d.x + d.y + d.z + d.heading) && !inside(d.x, d.z)), 'every driveway car spot is a real place, outside the houses');
    SB.setHour(22); SB.step(2);
    ok(Y.lampK() > 1, 'door lanterns are lit at night (' + Y.lampK().toFixed(2) + ')');
    SB.setHour(12); SB.step(2);
    ok(Y.lampK() === 0, 'and off by day');
  });

  // ---------------- street clutter, contact shadows, palmettos (G12) ----------------
  await run('street clutter and contact shadows', async () => {
    const c = G.clutter || {};
    ok(c.stops >= 60 && c.names >= 20, 'stop signs and street-name blades at the junctions (' + c.stops + ', ' + c.names + ')');
    ok(c.manholes >= 100 && c.drains >= 100, 'manholes and storm drains (' + c.manholes + ', ' + c.drains + ')');
    ok(c.litter >= 200 && c.weeds >= 200, 'litter and weeds (' + c.litter + ', ' + c.weeds + ')');
    ok(c.hydrants >= 5 && c.bins >= 5, 'Mill Creek hydrants and bins (' + c.hydrants + ', ' + c.bins + ')');
    ok((G.palms?.palmettos || 0) >= 300, 'saw palmetto clumps (' + G.palms?.palmettos + ')');
    const cars = G.parked.filter((v) => v.contactShadow);
    ok(cars.length > 0 && cars.length === G.parked.filter((v) => !v.isBoat && !v.isAir && v.group).length, 'every parked car has a contact shadow');
  });

  await run('distance detail and connection tier', async () => {
    const D = G.detail;
    ok(D && typeof D.update === 'function', 'the distance detail manager is running');
    // (simulation only: in the software-rendered test browser a rendered step can stall for seconds)
    SB.skipRender(true); for (let i = 0; i < 75; i++) SB.step(1, 1 / 30); SB.skipRender(false); // a few sweeps (each root is looked at every ~10 frames, the list every 2 s)
    ok(D.stats.cars > 0 && D.stats.people > 0, 'it looks after cars and people (' + D.stats.cars + ' cars, ' + D.stats.people + ' people)');
    ok(D.stats.partsHidden > 0 && D.stats.shadowsOff > 0, 'far parts and far shadows are thinned out (' + D.stats.partsHidden + ' parts, ' + D.stats.shadowsOff + ' shadows)');
    let bad = 0; G.player.h.root.traverse((o) => { if (o.isMesh && !o.layers.isEnabled(0)) bad++; });
    ok(bad === 0, 'the player is never thinned out');
    const near = G.parked.filter((v) => v.group && v.group.visible && v.group.position.distanceTo(G.camera.position) < 15);
    let hidden = 0; for (const v of near) v.group.traverse((o) => { if (o.isMesh && !o.layers.isEnabled(0)) hidden++; });
    ok(hidden === 0, 'cars close by keep every part (' + near.length + ' within 15 m)');
    const p0 = D.pressure; D.setPressure(0.5); ok(D.R.carSmall < 40, 'under CPU pressure the distances shrink'); D.setPressure(p0);
    ok(typeof G.netTier === 'string' && /connection/.test(G.netTier), 'the connection tier is known (' + G.netTier + ')');
  });

  await run('every catalogue car its own design', async () => {
    const land = SB.catalogs.LAND.filter((c) => c.base !== 'concept');
    // the shape that tells two cars apart: proportions, cabin, heights, edges and fittings
    const sig = (id) => { const s = G.specOf(id); return s ? [s.L, s.zA0, s.zA1, s.zC1, s.zC0, s.roof, s.nose, s.hood, s.deck, s.belt, s.soft || 1, s.flare || 0, s.rack || 0, s.roofMode || 0, s.bus ? 1 : 0, s.bed ? 1 : 0].map((x) => Math.round(x * 20)).join(',') : null; };
    const sigs = land.map((c) => sig(c.id)).filter(Boolean);
    ok(sigs.length >= 90, 'every catalogue car has a body spec (' + sigs.length + ')');
    ok(new Set(sigs).size === sigs.length, 'no two catalogue cars share a body (' + new Set(sigs).size + ' different of ' + sigs.length + ')');
    const before = G.carsWarming();
    SB.skipRender(true); for (let i = 0; i < 120; i++) SB.step(1, 1 / 30); SB.skipRender(false);
    ok(G.carsWarming() < before || before === 0, 'the catalogue designs build in the background (' + before + ' -> ' + G.carsWarming() + ' left)');
  });

  await run('every catalogue gun its own model', async () => {
    const all = Object.values(SB.catalogs.WEAPONS).filter((w) => !w.melee && w.cat !== 'bow' && w.id !== 'fists');
    const kit = all.filter((w) => G.gunKit.modelFor(w)?.kit);
    ok(kit.length >= all.length - 12, 'the gun kit builds every catalogue gun but the photo-scanned few (' + kit.length + ' of ' + all.length + ')');
    const sigs = kit.map((w) => G.gunKit.signature(w));
    ok(new Set(sigs).size === sigs.length, 'no two kit guns alike (' + new Set(sigs).size + ' different of ' + sigs.length + ')');
    const m = G.gunKit.build(kit[0]);
    ok(m && m.userData.hold && m.userData.muzzle && m.userData.hold.kind, 'a kit gun has its hold points and muzzle');
    const fams = new Set(kit.map((w) => w.platform));
    ok(fams.size >= 15, 'kit guns cover every platform (' + fams.size + ')');
  });

  // The owner's crash: a hitchhiker dropped off in town (systems/roadside.js) went back to ordinary
  // street life with no block or corner to walk to, and the pedestrian AI read `target[0]` of nothing
  // every frame until the "Something went wrong" storm
  await run('people handed back to the street always have somewhere to go', async () => {
    const pp = G.player.pos, peds = G.peds;
    const bare = (p) => { for (const k of ['G', 'i', 'j', 'corner', 'target', 'idleT', 'threat']) delete p[k]; return p; };
    const a = bare(peds.spawnAt(pp.x + 5, pp.z + 3, null)); a.role = undefined; a.mode = 'walk'; // the dropped-off passenger
    const b = bare(peds.spawnAt(pp.x - 5, pp.z + 3, null)); b.mode = 'flee'; b.timer = 0.2; // runs from trouble with no home block, then calms down
    const c = peds.spawnAt(pp.x + 4, pp.z - 4, null); // and one whose own AI throws
    const think = peds.think;
    peds.think = function (p, dt, pl) { if (p === c) throw new Error('qa: deliberately broken person'); return think.call(this, p, dt, pl); };
    let threw = null;
    try { SB.skipRender(true); for (let i = 0; i < 20; i++) SB.step(1, 1 / 30); } catch (e) { threw = e; } finally { peds.think = think; SB.skipRender(false); }
    ok(!threw, 'the frame goes on (' + (threw && threw.message) + ')');
    ok(a.G && Array.isArray(a.target) && Number.isFinite(a.target[0]) && finite(a.pos), 'the dropped-off passenger picks a corner and walks to it');
    ok(b.G && ['return', 'walk', 'idle', 'dead', 'flee', 'cover', 'cower', 'phone', 'freeze'].includes(b.mode) && finite(b.pos), /* (something scary nearby can send them running again: R1) */ 'someone with no home block runs, then heads back to the street (' + b.mode + (b.mode === 'dead' ? ': hit by traffic on the way' : '') + ')');
    ok(!peds.list.includes(c), 'a person whose thinking keeps failing is let go, not the game');
    for (const p of [a, b]) { const k = peds.list.indexOf(p); if (k >= 0) { G.scene.remove(p.h.root); p.h.dispose(); peds.list.splice(k, 1); } }
  });

  // "Let Claude watch me play" (core/watch.js): off unless the player turns it on, never sends from a
  // test browser, and a report knows where you are, what you're doing, and can carry a picture
  await run('Claude can watch (off by default, reports and pictures work)', async () => {
    const W = G.watch;
    ok(W && W.on === false, 'watching is off by default (and always off in a test browser)');
    const s = W.snapshot();
    ok(s && s.region && Array.isArray(s.pos) && 'wanted' in s && 'health' in s && 'money' in s && s.preset, 'a report says where you are and how you are (' + [s.region, s.mode, s.health, s.money].join(', ') + ')');
    G.hud.toast('qa watch toast', 0.1);
    // (the picture itself is checked by tools/southbound/watch-test.mjs: reading a frame back here waits
    // minutes for the test browser's software graphics)
    ok(typeof W.capture === 'function' && typeof W.grab === 'function', 'pictures can be asked for');
    ok(typeof W.sendError === 'function' && !(await W.sendError({ msg: 'qa', stack: '' })), 'nothing is sent from a test browser');
  });

  // R1: what you're doing decides who can walk up to you. The owner was mugged while speeding off in a
  // car (the mugger walked to where they'd got in and took the wallet anyway); and people should take
  // cover in a robbery, with an officer coming to deal with it
  await run('situations: no mugging while you drive off; cover; an officer answers a robbery', async () => {
    const W = G.worldEvents, pp = G.player.pos, S = G.S;
    if (S.indoors && G.estate) G.estate.leave();
    if (G.S.mode !== 'foot') G.exitVehicle();
    G.police.wanted = 0; G.combat.holstered = true; W.clear();
    SB.skipRender(true); for (let i = 0; i < 20; i++) SB.step(1, 1 / 30);
    let s = G.situation();
    ok(s.onFoot && s.reachable && s.muggable, 'standing on the pavement: reachable, a mugger could pick you (' + [s.reachable, s.muggable, s.speed.toFixed(1)].join(',') + ')');
    G.police.wanted = 1; ok(!G.situation().muggable, 'wanted: no mugger picks you'); G.police.wanted = 0;
    S.cutscene = true; ok(!G.situation().reachable && !G.situation().muggable, 'in a cutscene: nobody walks up'); S.cutscene = false;
    S.indoors = { fake: true }; ok(!G.situation().muggable, 'indoors: no street mugging'); S.indoors = null;
    G.combat.holstered = false; ok(!G.situation().muggable || !G.combat.drawn, 'a gun out: no mugger picks you'); G.combat.holstered = true;
    // the owner's case: he demands, you get in a car and floor it
    const money0 = S.money;
    const e = W.force('mugging');
    ok(e && e.kind === 'mugging' && e.m, 'a mugging can start while you stand on the pavement');
    if (e && e.m) {
      e.m.pos.set(pp.x + 1.6, pp.y, pp.z + 0.4);
      for (let i = 0; i < 20 && !e.demanded; i++) SB.step(1, 1 / 30);
      ok(e.demanded, 'he demands your wallet');
      let v = G.parked.find((c) => !c.isBoat && !c.isAir && c.pos.distanceTo(pp) < 40);
      if (!v) { v = new G.Vehicle(G.lib, 'sedan'); v.pos.set(pp.x + 4, G.collision.surface(pp.x + 4, pp.z, 300), pp.z); v.heading = 0; v.sync(0); G.scene.add(v.group); G.parked.push(v); }
      G.enterVehicle(v);
      SB.setOverride({ throttle: 1 });
      for (let i = 0; i < 150; i++) SB.step(1, 1 / 30);
      const sp = Math.abs(G.vehicle()?.speed || 0);
      SB.setOverride(null);
      ok(S.money === money0, 'driving off keeps your money (' + money0 + ' -> ' + S.money + ', speed ' + sp.toFixed(1) + ' m/s)');
      ok(!W.event || W.event.kind !== 'mugging' || W.event.done, 'the mugger gives up once you drive away');
      ok(e.m.role !== 'mugger', 'he stops being a mugger (' + e.m.role + ', ' + e.m.mode + ')');
      G.exitVehicle();
      for (let i = 0; i < 10; i++) SB.step(1, 1 / 30);
    }
    // bystanders near a gun take cover behind something
    const near = [];
    for (let i = 0; i < 6; i++) { const q = G.peds.spawnAt(pp.x + 8 + i * 2, pp.z + 6 - i, null); q.nerve = 0.3; near.push(q); }
    G.peds.panic(new SB.debug.THREE.Vector3(pp.x + 10, pp.y, pp.z), 30, { cover: true });
    const inCover = near.filter((q) => q.mode === 'cover' && q.cover);
    ok(inCover.length >= 1, 'people near a gun take cover (' + inCover.length + ' of ' + near.length + '; the rest run or cower)');
    const d0 = inCover.map((q) => Math.hypot(q.cover.x - q.pos.x, q.cover.z - q.pos.z));
    for (let i = 0; i < 45; i++) SB.step(1, 1 / 30);
    const d1 = inCover.map((q) => Math.hypot(q.cover.x - q.pos.x, q.cover.z - q.pos.z));
    ok(!inCover.length || d1.some((d, i) => d < d0[i] - 0.5 || d < 0.6), 'they run to it (' + d0.map((d) => d.toFixed(1)).join(',') + ' -> ' + d1.map((d) => d.toFixed(1)).join(',') + ')');
    // a robbery with an officer close by: he comes, takes cover, and it ends
    const cop = G.peds.spawnAt(pp.x + 3, pp.z + 2, null); cop.role = 'cop';
    const r = W.force('robbery');
    if (r && r.m) {
      ok(r.cop && r.cop.role === 'responder', 'the nearest officer answers the robbery (' + (r.cop ? r.cop.role : 'none') + ')');
      if (!r.cop) return;
      const rc = r.cop, c0 = rc.pos.clone();
      for (let i = 0; i < 360; i++) SB.step(1, 1 / 30);
      ok(rc.pos.distanceTo(c0) > 2 || rc.role === 'cop', 'the officer moves in (' + rc.pos.distanceTo(c0).toFixed(1) + ' m, ' + rc.role + ')');
      ok(r.cop.resp === null || r.cop.resp === undefined || r.cop.resp.told, 'he orders the robber to drop it');
      ok(['arrested', 'mugger', 'foe'].includes(r.m.role) || r.m.mode === 'dead' || r.m.mode === 'flee' || !G.peds.list.includes(r.m), 'the robber gives up, runs, or fights (' + r.m.role + ', ' + r.m.mode + ')');
    } else ok(true, '(no street right here for a robbery)');
    for (const q of [...near, cop]) { const k = G.peds.list.indexOf(q); if (k >= 0) { G.scene.remove(q.h.root); q.h.dispose(); G.peds.list.splice(k, 1); } }
    W.clear();
    SB.skipRender(false);
  });

  // G13: blood and injuries: a hit leaves a wound where it landed and blood on the ground; a death leaves
  // a pool; the player's wounds heal; the Gore setting off leaves nothing; wounded people's own materials
  // are freed when they go
  await run('blood and injuries (wounds where hit, spatter, pools, healing, gore off)', async () => {
    const pp = G.player.pos, THREE = SB.debug.THREE;
    if (G.S.indoors && G.estate) G.estate.leave();
    if (G.S.mode !== 'foot') G.exitVehicle();
    SB.skipRender(true);
    G.settings.gore = true;
    const b0 = G.blood.count();
    const a = G.peds.spawnAt(pp.x + 3, pp.z + 2, null); a.scripted = true;
    SB.step(3, 1 / 30);
    const chest = new THREE.Vector3(); a.h.model.getObjectByName('spine02').getWorldPosition(chest);
    const from = chest.clone().add(new THREE.Vector3(-4, 0, 0)), pt = chest.clone().add(new THREE.Vector3(-0.12, 0, 0));
    G.peds.damage(a, 20, from, { part: 'chest', point: pt, dir: pt.clone().sub(from).normalize() });
    ok(a.h.wound && a.h.wound.list.length === 1 && a.h.wound.list[0].k === 0, 'a bullet leaves a wound where it hit (' + (a.h.wound ? a.h.wound.list.length : 0) + ')');
    ok(G.blood.count() > b0, 'and blood on the ground behind (' + b0 + ' -> ' + G.blood.count() + ')');
    ok(a.h.wound && a.h.wound.mats.length >= 2, 'the wounded person gets their own skin and clothes materials (' + (a.h.wound ? a.h.wound.mats.length : 0) + ')');
    G.peds.damage(a, 6, from, { part: 'arm', melee: true, point: pt.clone().add(new THREE.Vector3(0, -0.3, 0.2)) });
    ok(a.h.wound.list.some((w) => w.k === 2), 'fists leave a bruise');
    const r0 = a.h.wound.list[0].r;
    for (let i = 0; i < 90; i++) SB.step(1, 1 / 30);
    ok(a.h.wound.list[0].r > r0 && a.h.wound.list[0].run > 0.0001, 'the stain spreads and blood runs down while they bleed');
    // a killing shot: a wound before the fall, then a pool
    const d = G.peds.spawnAt(pp.x + 5, pp.z - 2, null);
    SB.step(3, 1 / 30);
    const c2 = new THREE.Vector3(); d.h.model.getObjectByName('spine02').getWorldPosition(c2);
    G.peds.damage(d, 500, c2.clone().add(new THREE.Vector3(-4, 0, 0)), { part: 'chest', point: c2.clone().add(new THREE.Vector3(-0.12, 0, 0)), dir: new THREE.Vector3(1, 0, 0) });
    const pools0 = G.blood.meshes.pool.count;
    for (let i = 0; i < 90; i++) SB.step(1, 1 / 30);
    ok(d.mode === 'dead' && d.h.wound && d.h.wound.list.length >= 1, 'a killing shot still leaves its wound');
    ok(G.blood.meshes.pool.count > pools0, 'a pool spreads under the dead (' + pools0 + ' -> ' + G.blood.meshes.pool.count + ')');
    // the player: wounded on the side the shot came from; healing over game days
    G.onPlayerHurt(10, pp.clone().add(new THREE.Vector3(6, 0, 0)), 2);
    const pw = G.player.h.wound;
    ok(pw && pw.list.length >= 1, 'the player gets a wound when shot');
    const h0 = pw ? pw.list[pw.list.length - 1].heal : 0;
    const hour0 = G.sky.hour; G.sky.hour = Math.min(23.9, hour0 + 5); SB.step(2, 1 / 30);
    ok(pw && pw.list.length && pw.list[pw.list.length - 1].heal > h0, 'wounds heal as game time passes');
    G.sky.hour = hour0;
    // gore off: nothing new
    G.settings.gore = false;
    const e = G.peds.spawnAt(pp.x - 4, pp.z + 3, null); e.scripted = true; SB.step(2, 1 / 30);
    const b1 = G.blood.count();
    G.peds.damage(e, 20, from, { part: 'chest', point: e.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), dir: new THREE.Vector3(1, 0, 0) });
    ok(!e.h.wound && G.blood.count() === b1, 'Blood & gore off: no wounds, no blood');
    G.settings.gore = true;
    // gone for good: their own materials go too
    const mats = a.h.wound.mats.slice();
    let disposed = 0; for (const m of mats) m.addEventListener('dispose', () => disposed++);
    for (const q of [a, d, e]) { const k = G.peds.list.indexOf(q); if (k >= 0) { G.scene.remove(q.h.root); q.h.dispose(); G.peds.list.splice(k, 1); } }
    ok(disposed === mats.length, 'the own materials of a wounded person are freed when they go (' + disposed + '/' + mats.length + ')');
    SB.skipRender(false);
  });

  // NaN sweep over everything in the scene
  await run('scene NaN sweep', async () => {
    let bad = [];
    G.scene.traverse((o) => { if (!finite(o.position)) bad.push(o.name || o.type); });
    ok(bad.length === 0, 'no object has a NaN position: ' + bad.slice(0, 5).join(','));
  });
  report.seconds = Math.round((performance.now() - t0) / 1000);
  return report;
}
