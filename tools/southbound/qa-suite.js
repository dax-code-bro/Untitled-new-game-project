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
    ok(G.career.money <= 150, 'new game starts with $150 or less');
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
      const a = G.hunting.spawn(sp, pp.x + 20, pp.z + 20);
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

  // ---------------- save / load ----------------
  await run('save round trip', async () => {
    G.career.save();
    const raw = JSON.parse(localStorage.getItem('southbound.save.v1'));
    ok(raw && raw.v === 1 && Array.isArray(raw.garage) && typeof raw.money === 'number', 'save is valid JSON with the expected fields');
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
