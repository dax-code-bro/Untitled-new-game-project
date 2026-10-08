// One life on Sector 12: world, player, AI, wildlife, weather, caches, combat, POB, extraction.
import * as THREE from 'three';
import { Terrain } from './terrainMesh.js';
import { Physics, rayBox } from './physics.js';
import { buildStructures } from './structures.js';
import { Scatter } from './scatter.js';
import { POB } from './pob.js';
import { Environment } from './environment.js';
import { CacheSystem, Extraction } from './caches.js';
import { Wildlife } from './animals.js';
import { Operator, SAFE_ZONE } from './operators.js';
import { Player } from './player.js';
import { Inventory, makeItem, describeItem } from './inventory.js';
import { Effects } from './effects.js';
import { ITEMS, KILL_REWARD } from './data/catalog.js';
import { LOOT_TABLES } from './data/world.js';
import { POIS, heightAt, regionAt, REGIONS, islandD } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { rand, randi, clamp } from './rng.js';

const OP_TARGET = 7;

export class Game {
  constructor(ctx) {
    this.ctx = ctx;
    this.renderer = ctx.renderer;
    this.audio = ctx.audio;
    this.hud = ctx.hud;
    this.input = ctx.input;
    this.save = ctx.save;
    this.settings = ctx.save.settings;
    this.time = 0;
    this.over = false;
    this.paused = false;
    this.ui = null;
    this.mapOpen = false;
    this.focus = null;
    this.kills = 0;
    this.filamentEarned = 0;

    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 60000);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
    this.physics = new Physics();
    this.effects = new Effects(scene);
    this.terrain = new Terrain(scene);
    this.env = new Environment(this);
    this.structures = buildStructures(scene, this.physics);
    this.scatter = new Scatter(scene, this.physics);
    const pobPoi = POIS.find((p) => p.id === 'pob');
    this.pob = new POB(scene, this.physics, pobPoi, this.save, {
      persist: () => ctx.persist(),
      onPrinted: (it) => { this.hud.toast(`Printed: ${ITEMS[it.id].name} (in your POB locker)`, '#46ffb0', 4); this.audio.printDone(); },
    });
    this.containers = [];
    for (const l of this.structures.loot) this.addLootCrate(l);
    this.caches = new CacheSystem(this);
    this.extraction = new Extraction(this);
    this.wildlife = new Wildlife(this);
    this.operators = [];
    this.opSpawnT = 8;
    this.projectiles = [];
    this.deployables = [];
    this.campfires = [];
    this.flareLight = new THREE.PointLight(0xff4020, 0, 120, 1.5);
    this.fireLight = new THREE.PointLight(0xff9a40, 0, 14, 2);
    scene.add(this.flareLight, this.fireLight);

    // the player spawns at the POB with whatever they carried in from the locker
    const inv = new Inventory();
    for (const it of this.save.carry || []) inv.add(it);
    const sp = this.pob.spawn;
    this.player = new Player(this, inv, { x: sp.x, y: sp.y, z: sp.z, yaw: Math.PI });
    this.wasSafe = true;
    this.saveCarry();
  }

  async load(onProgress) {
    this.scatter.warmup(this.player.pos);
    this.player.update(0, this.input, true);
    this.env.update(0, 0);
    await this.terrain.warmup(this.camera.position, onProgress);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (this.paused) return;
    if (this.over) {
      this.endT -= dt;
      this.effects.update(dt);
      if (this.endT <= 0 && !this.endSent) { this.endSent = true; this.ctx.onExit(this.result); }
      this.clearInput();
      return;
    }
    this.time += dt;
    const P = this.player;
    P.update(dt, this.input, !!this.ui);
    if (this.over) { this.clearInput(); return; }
    this.terrain.update(dt, this.camera.position);
    this.scatter.update(dt, P.pos);
    this.env.update(dt, this.time);
    this.pob.update(dt);
    this.caches.update(dt);
    this.extraction.update(dt);
    this.wildlife.update(dt);
    this.updateOperators(dt);
    this.updateProjectiles(dt);
    this.updateDeployables(dt);
    this.effects.update(dt);
    this.updateFocus();
    // safe-zone bookkeeping: carried gear only survives a browser close inside the POB zone
    const safe = this.inSafeZone(P.pos);
    if (safe !== this.wasSafe) {
      this.wasSafe = safe;
      this.hud.toast(safe ? 'Entered the POB safe zone' : 'Left the safe zone — everything you carry is at risk', safe ? '#46ffb0' : '#ffb02e', 3);
      this.saveCarry();
    }
    this.hud.update(this, dt);
    this.clearInput();
  }

  clearInput() { this.input.pressed.clear(); this.input.mdx = this.input.mdy = 0; this.input.wheel = 0; }
  render() { this.renderer.render(this.scene, this.camera); }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  inSafeZone(p) { return Math.hypot(p.x - this.pob.origin.x, p.z - this.pob.origin.z) < SAFE_ZONE; }
  get hour() { return this.env.hour; }

  ambientTemp(pos) {
    let t = this.env.tempAt(pos);
    for (const f of this.campfires) { const d = Math.hypot(pos.x - f.x, pos.z - f.z); if (d < 6 && f.t > 0) t += 25 * (1 - d / 6); }
    return t;
  }

  saveCarry() {
    this.save.carry = this.wasSafe ? this.player.inv.allItems() : [];
    this.ctx.persist();
  }

  // ---------------------------------------------------------------- AI operators
  updateOperators(dt) {
    const P = this.player;
    for (const o of this.operators) o.update(dt);
    this.opSpawnT -= dt;
    if (this.opSpawnT > 0) return;
    this.opSpawnT = 3;
    for (let i = this.operators.length - 1; i >= 0; i--) {
      const o = this.operators[i];
      const far = o.dist > (o.dead ? 450 : 1100);
      if (far) { o.dispose(); this.operators.splice(i, 1); if (o.body) o.body.gone = true; }
    }
    if (this.operators.filter((o) => !o.dead).length >= OP_TARGET) return;
    const a = Math.random() * Math.PI * 2, d = rand(260, 650);
    const x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d;
    const h = heightAt(x, z);
    if (islandD(x, z) > 0.97 || waterLevelAt(x, z, h) !== null || this.inSafeZone({ x, z })) return;
    this.operators.push(new Operator(this, x, z, regionAt(x, z, h)));
  }

  onOperatorKilled(op, info) {
    const body = this.addContainer({ kind: 'body', name: `${op.name}'s body`, pos: op.pos.clone().setY(op.pos.y + 0.4), items: op.lootTable() });
    op.body = body;
    if (!info.byPlayer) return;
    this.kills++;
    const special = info.explosive || info.airborne || op.airborneAtDeath;
    const reward = special ? KILL_REWARD.special : info.zone === 'head' ? KILL_REWARD.head : KILL_REWARD.body;
    const why = info.explosive ? 'EXPLOSIVE KILL' : info.airborne ? 'MID-AIR KILL' : info.zone === 'head' ? 'HEADSHOT' : 'KILL';
    this.player.inv.filament += reward;
    this.filamentEarned += reward;
    this.hud.feed(`${why} · ${op.name}  +${reward} filament`, special ? '#ff8a3a' : info.zone === 'head' ? '#ffd23f' : '#e8e8e8');
    this.audio.kill();
  }

  onAnimalKilled(a) {
    this.hud.feed(`${a.name} down — harvest it [E]`, '#c9b46a');
  }

  // ---------------------------------------------------------------- containers / loot
  addContainer(c) {
    c.opened = c.opened || false;
    c.items = c.items || [];
    this.containers.push(c);
    return c;
  }

  addLootCrate(l) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: l.table === 'arctic' ? 0x8aa0b0 : l.table === 'military' ? 0x4f5a3a : 0x7a5a3a }));
    mesh.position.set(l.x, l.y + 0.3, l.z);
    mesh.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.62), new THREE.MeshBasicMaterial({ color: l.table === 'arctic' ? 0x9fe8ff : l.table === 'military' ? 0xffd23f : 0xc9b46a }));
    band.position.y = 0.2; mesh.add(band);
    this.scene.add(mesh);
    this.physics.addBox([l.x - 0.45, l.y, l.z - 0.3], [l.x + 0.45, l.y + 0.6, l.z + 0.3]);
    this.addContainer({ kind: 'crate', name: l.table === 'arctic' ? 'Arctic Supply Crate' : l.table === 'military' ? 'Military Crate' : 'Supply Crate', pos: new THREE.Vector3(l.x, l.y + 0.4, l.z), table: l.table, items: null, mesh });
  }

  rollLoot(table) {
    const out = [];
    for (const [id, chance, min, max] of LOOT_TABLES[table]) {
      if (Math.random() > chance) continue;
      const n = randi(min, max);
      if (id === 'filament') { out.push({ uid: 'f' + Math.random(), id, count: n }); continue; }
      const d = ITEMS[id];
      if (d.cat === 'ammo') out.push(makeItem(id, { count: d.amount * n }));
      else if (d.cat === 'medical' || id === 'cloth') out.push(makeItem(id, { count: n }));
      else for (let i = 0; i < n; i++) out.push(makeItem(id));
    }
    return out;
  }

  openContainer(c) {
    if (c.items === null) c.items = this.rollLoot(c.table);
    c.opened = true;
    this.lootTarget = c;
    this.openUI('loot');
    this.audio.ui();
  }

  takeItem(c, i) {
    const it = c.items[i];
    if (!it) return false;
    const inv = this.player.inv;
    if (!inv.add(it)) { this.hud.toast('Backpack full', '#ff6a5a'); return false; }
    c.items.splice(i, 1);
    if (it.id === 'filament') { this.audio.cash(); if (c.cache) { c.cache.looted = true; this.hud.toast(`+${it.count} filament from the ${c.name}`, '#46ffb0', 4); } }
    else this.audio.pickup();
    if (!this.player.held) this.player.refreshHeld();
    return true;
  }

  takeAll(c) {
    for (let i = 0; i < c.items.length;) { const n = c.items.length; this.takeItem(c, i); if (c.items.length === n) i++; }
  }

  dropFromBag(i) {
    const it = this.player.inv.bag.splice(i, 1)[0];
    if (!it) return;
    const P = this.player;
    let c = this.containers.find((k) => k.kind === 'drop' && k.pos.distanceTo(P.pos) < 2.5);
    if (!c) c = this.addContainer({ kind: 'drop', name: 'Dropped items', pos: P.pos.clone().setY(P.pos.y + 0.3), items: [] });
    c.items.push(it);
  }

  // ---------------------------------------------------------------- interaction
  updateFocus() {
    const P = this.player;
    this.focus = null;
    if (!P.alive || this.ui) return;
    const cam = this.camera.position;
    const f = this.camera.getWorldDirection(new THREE.Vector3());
    let best = -1;
    const consider = (pos, maxD, obj) => {
      const dx = pos.x - cam.x, dy = pos.y - cam.y, dz = pos.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > maxD) return;
      const dot = (dx * f.x + dy * f.y + dz * f.z) / dist;
      if (dot < 0.55) return;
      const score = dot - dist * 0.05;
      if (score > best) { best = score; this.focus = obj; }
    };
    for (const c of this.containers) {
      if (c.gone || (c.opened && c.items && c.items.length === 0)) continue;
      consider(c.pos, 2.8, { type: 'container', c, label: c.opened ? `Loot ${c.name} (${c.items.length})` : `Search ${c.name}` });
    }
    for (const it of this.pob.interact) consider(it.pos, 3.2, { type: it.type, label: it.type === 'deposit' ? `Deposit ${P.inv.filament} filament${P.inv.cloth ? ` + ${P.inv.cloth} cloth` : ''}` : it.label });
    for (const a of this.wildlife.list) if (a.dead && !a.harvested) consider(a.pos, 3, { type: 'harvest', a, label: `Harvest ${a.name}` });
    for (const p of this.projectiles) if (p.stuck && p.pickup) consider(p.pos, 2.5, { type: 'pickup', p, label: p.type === 'co2blade' ? 'Pick up CO2 blade' : 'Pick up throwing knife' });
    const ex = this.extraction;
    if (ex.state === 'idle' && P.pos.distanceTo(ex.callPos) < 6) this.focus = { type: 'extract', label: 'Call extraction helicopter' };
  }

  onKey(code) {
    if (this.over) return;
    if (code === 'Tab') { this.ui === 'inventory' ? this.closeUI() : this.ui ? this.closeUI() : this.openUI('inventory'); return; }
    if (code === 'KeyM') { this.mapOpen = !this.mapOpen; this.hud.showMap(this.mapOpen, this); return; }
    if (code === 'Escape' && this.ui) { this.closeUI(); return; }
    if (code === 'KeyZ') this.pingTarget();
    if (code === 'KeyE') {
      if (this.ui === 'loot' || this.ui === 'terminal') { this.closeUI(); return; }
      if (this.ui) return;
      const f = this.focus;
      if (!f) return;
      if (f.type === 'container') this.openContainer(f.c);
      else if (f.type === 'terminal') this.openUI('terminal');
      else if (f.type === 'deposit') this.deposit();
      else if (f.type === 'harvest') this.harvest(f.a);
      else if (f.type === 'pickup') this.pickupProjectile(f.p);
      else if (f.type === 'extract') this.extraction.call();
    }
  }

  openUI(kind) {
    this.ui = kind;
    if (kind !== 'loot') this.lootTarget = null;
    this.input.lmb = this.input.rmb = false;
    this.ctx.unlock();
    this.hud.renderPanel(this);
  }

  closeUI() {
    this.ui = null;
    this.lootTarget = null;
    this.hud.renderPanel(this);
    this.player.refreshHeld();
    this.ctx.lock();
  }

  deposit() {
    const inv = this.player.inv;
    if (!inv.filament && !inv.cloth) { this.hud.toast('Nothing to deposit — kill operators or find caches for filament', '#ff6a5a'); return; }
    const f = inv.filament, c = inv.cloth;
    this.pob.deposit(f);
    this.save.cloth = (this.save.cloth || 0) + c;
    inv.filament = 0; inv.cloth = 0;
    this.save.stats.deposited = (this.save.stats.deposited || 0) + f;
    this.audio.deposit();
    this.hud.toast(`Deposited ${f} filament${c ? ` and ${c} cloth` : ''} — bank: ${this.save.bank}`, '#46ffb0', 4);
    this.saveCarry();
  }

  harvest(a) {
    const inv = this.player.inv;
    if (!inv.melee || !['knife', 'hatchet', 'co2knife'].includes(inv.melee.id)) { this.hud.toast('You need a knife or hatchet to harvest', '#ff6a5a'); return; }
    for (const r of a.harvest()) {
      if (r.id === 'meat') inv.meds.meat += r.count;
      if (r.id === 'cloth') inv.cloth += r.count;
    }
    this.audio.pickup();
    this.hud.toast(`Harvested ${a.name}: ${a.def.meat} meat${a.def.hide ? `, ${a.def.hide} hide (cloth)` : ''}`, '#c9b46a');
  }

  pingTarget() {
    const cam = this.camera;
    const o = cam.getWorldPosition(new THREE.Vector3()), d = cam.getWorldDirection(new THREE.Vector3());
    const hit = this.entityRay(o, d, 600).find((h) => h.kind === 'op');
    if (!hit) return;
    if (hit.op.suit) { this.hud.toast('Target is wearing a camo suit — can\'t be pinned', '#ff6a5a'); return; }
    hit.op.pinnedUntil = this.time + 10;
    this.audio.ui();
  }

  // ---------------------------------------------------------------- combat
  // entities along a ray (operators + animals), sorted
  entityRay(o, d, maxT) {
    const hits = [];
    const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
    for (const op of this.operators) {
      if (op.dead) continue;
      const p = op.pos;
      const dx = p.x - o.x, dz = p.z - o.z;
      if (dx * dx + dz * dz > (maxT + 3) ** 2) continue;
      const box = { min: [p.x - 0.32, p.y, p.z - 0.32], max: [p.x + 0.32, p.y + 1.92, p.z + 0.32] };
      const r = rayBox(o.x, o.y, o.z, ix, iy, iz, box);
      if (r && r[0] < maxT) hits.push({ t: r[0], kind: 'op', op });
    }
    for (const a of this.wildlife.list) {
      if (a.dead) continue;
      const dx = a.pos.x - o.x, dz = a.pos.z - o.z;
      if (dx * dx + dz * dz > (maxT + 4) ** 2) continue;
      let bestT = Infinity, zone = null;
      for (const b of a.hitBoxes()) { const r = rayBox(o.x, o.y, o.z, ix, iy, iz, b); if (r && r[0] < bestT) { bestT = r[0]; zone = b.zone; } }
      if (bestT < maxT) hits.push({ t: bestT, kind: 'animal', a, zone });
    }
    return hits.sort((a, b) => a.t - b.t);
  }

  fireBullet(b) {
    const P = this.player;
    const maxT = Math.min(1500, Math.max(b.range * 6, 250));
    const world = this.physics.rayAll(b.origin, b.dir, maxT);
    const ents = this.entityRay(b.origin, b.dir, maxT);
    const hits = [...world, ...ents].sort((a, c) => a.t - c.t);
    let dmg = b.dmg, pen = b.pen, endT = maxT;
    const point = (t) => b.origin.clone().addScaledVector(b.dir, t);
    for (const h of hits) {
      const fall = h.t > b.range ? clamp(1 - (h.t - b.range) / (b.range * 2.5), 0.35, 1) : 1;
      const pt = point(h.t);
      if (h.kind === 'op') {
        const zone = h.op.zoneAt(pt);
        h.op.airborneAtDeath = false;
        const r = h.op.takeHit({ dmg: dmg * fall, pen, ammo: b.ammo, zone, explosive: b.explosive, shot: b.shot }, { byPlayer: b.shooter === P, airborne: !P.onGround && P.airTime > 0.25 });
        this.hud.hitmarker(r.killed, zone === 'head', r.armorHit);
        this.audio.hit(zone === 'head', r.armorHit);
        this.effects.puff(pt, r.armorHit ? 0x9fc4ff : 0x8a1010, 0.07, 0.25);
        if (b.explosive) { endT = h.t; this.explode(pt, b.blast, b.blastDmg, b.shooter); break; }
        if (pen >= 6) { dmg *= 0.5; pen -= 3; continue; }
        endT = h.t; break;
      }
      if (h.kind === 'animal') {
        let zone = h.zone;
        if (zone === 'body') {
          const a = h.a, fwd = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
          const rel = pt.clone().sub(a.pos);
          if (rel.dot(fwd) > a.def.size * 0.1 && rel.y > a.legH + a.bodyH * 0.35) zone = 'vitals';
          else if (rel.y < a.legH + 0.05) zone = 'leg';
        }
        const r = h.a.takeDamage(dmg * fall, zone);
        this.hud.hitmarker(r.killed, zone === 'head' || zone === 'vitals', false);
        this.effects.puff(pt, 0x8a1010, 0.06, 0.25);
        if (b.explosive) { endT = h.t; this.explode(pt, b.blast, b.blastDmg, b.shooter); break; }
        endT = h.t; break;
      }
      if (b.explosive) { endT = h.t; this.explode(pt.addScaledVector(b.dir, -0.2), b.blast, b.blastDmg, b.shooter); break; }
      this.effects.puff(pt.clone().addScaledVector(b.dir, -0.05), h.kind === 'trunk' ? 0x6a4a2a : 0x9a8a70, 0.06, 0.45, 0.4);
      if (h.kind === 'box' && h.box.thin && pen >= 4) { dmg *= 0.6; pen -= 2; continue; }
      if (h.kind === 'trunk' && pen >= 7) { dmg *= 0.5; pen -= 3; continue; }
      endT = h.t; break;
    }
    if (b.tracer && Math.random() < 0.6) this.effects.tracer(b.muzzle, point(Math.min(endT, 600)), 0xfff0b0, 0.04);
  }

  explode(pos, r, dmg, source) {
    this.effects.explosion(pos, r);
    this.audio.explosion(pos.distanceTo(this.camera.position));
    this.noise(pos, 250, null);
    const byPlayer = source === this.player;
    for (const op of this.operators) {
      if (op.dead) continue;
      const d = op.pos.distanceTo(pos);
      if (d < r) op.takeHit({ dmg: dmg * (1 - d / r), pen: 0, ammo: 'exp_round', zone: 'torso', blast: true, explosive: true }, { byPlayer });
    }
    for (const a of this.wildlife.list) if (!a.dead && a.pos.distanceTo(pos) < r) a.takeDamage(dmg * (1 - a.pos.distanceTo(pos) / r), 'body');
    const pd = this.player.pos.distanceTo(pos);
    if (pd < r && this.player.alive) this.player.takeHit({ dmg: dmg * (1 - pd / r), pen: 0, ammo: 'exp_round', zone: 'torso', blast: true, explosive: true }, pos, source && source !== this.player ? source.name : 'your own explosive');
  }

  meleeHit(P, dmg, range) {
    const o = this.camera.getWorldPosition(new THREE.Vector3()), d = this.camera.getWorldDirection(new THREE.Vector3());
    const h = this.entityRay(o, d, range)[0];
    if (!h) return;
    const pt = o.clone().addScaledVector(d, h.t);
    if (h.kind === 'op') {
      const zone = h.op.zoneAt(pt);
      const r = h.op.takeHit({ dmg, pen: 3, ammo: 'light', zone }, { byPlayer: true, airborne: !P.onGround && P.airTime > 0.25 });
      this.hud.hitmarker(r.killed, zone === 'head', r.armorHit);
    } else {
      const r = h.a.takeDamage(dmg, h.zone);
      this.hud.hitmarker(r.killed, false, false);
    }
    this.effects.puff(pt, 0x8a1010, 0.06, 0.25);
    this.audio.hit(false, false);
  }

  // projectiles: thrown knives, CO2 blades, flares
  throwProjectile(type, P, opts) {
    const o = this.camera.getWorldPosition(new THREE.Vector3()), d = this.camera.getWorldDirection(new THREE.Vector3());
    let mesh;
    if (type === 'flare') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5020 }));
      d.y += 0.25; d.normalize();
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.28), new THREE.MeshLambertMaterial({ color: 0xc8ccd0 }));
    }
    mesh.position.copy(o);
    this.scene.add(mesh);
    this.projectiles.push({ type, mesh, pos: o.clone(), vel: d.clone().multiplyScalar(opts.speed), dmg: opts.dmg || 0, straight: opts.straight || 0, travelled: 0, life: type === 'flare' ? 2.6 : 20, stuck: false, pickup: type !== 'flare' });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.stuck) {
        if (p.type === 'flare') { this.flareLight.intensity = Math.max(0, p.life) * 4; if (p.life <= 0) { this.scene.remove(p.mesh); this.projectiles.splice(i, 1); } }
        else if (p.life < -300) { this.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
        continue;
      }
      if (p.type === 'flare' && p.life <= 0) { this.flareBurst(p); continue; }
      const step = p.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len || 1);
      const w = this.physics.raycast(p.pos, dir, len);
      const e = p.type === 'flare' ? null : this.entityRay(p.pos, dir, len)[0];
      if (e && (!w || e.t < w.t)) {
        if (e.kind === 'op') { const pt = p.pos.clone().addScaledVector(dir, e.t); const zone = e.op.zoneAt(pt); const r = e.op.takeHit({ dmg: p.dmg, pen: 3, ammo: 'light', zone }, { byPlayer: true, airborne: !this.player.onGround }); this.hud.hitmarker(r.killed, zone === 'head', r.armorHit); }
        else { const r = e.a.takeDamage(p.dmg, e.zone); this.hud.hitmarker(r.killed, e.zone === 'head', false); }
        this.audio.hit(false, false);
        p.pos.addScaledVector(dir, e.t);
        p.stuck = true; p.mesh.position.copy(p.pos);
        continue;
      }
      if (w) {
        p.pos.addScaledVector(dir, Math.max(0, w.t - 0.05));
        p.mesh.position.copy(p.pos);
        p.stuck = true;
        if (p.type === 'flare') this.flareBurst(p);
        continue;
      }
      p.pos.add(step);
      p.travelled += len;
      // CO2 blades fly straight for 25 m, then drop; everything else arcs
      if (!(p.type === 'co2blade' && p.travelled < p.straight)) p.vel.y -= (p.type === 'flare' ? 6 : 9.8) * dt;
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.clone().add(p.vel));
      if (p.type === 'flare') { this.flareLight.position.copy(p.pos); this.flareLight.intensity = 6; }
    }
  }

  flareBurst(p) {
    p.stuck = true;
    p.life = 30;
    this.flareLight.position.copy(p.pos);
    let n = 0;
    for (const op of this.operators) {
      if (op.dead) continue;
      if (Math.hypot(op.pos.x - p.pos.x, op.pos.z - p.pos.z) < 50) { op.revealedUntil = this.time + 600; n++; }
    }
    this.hud.toast(n ? `Flare: ${n} enemy operator${n > 1 ? 's' : ''} marked for 10 minutes` : 'Flare: no enemies within 50 m', n ? '#ff4a3a' : '#ffb02e', 4);
  }

  pickupProjectile(p) {
    const inv = this.player.inv;
    if (p.type === 'knife') {
      if (inv.throwing) inv.throwing.count++;
      else inv.throwing = makeItem('throwknives', { count: 1 });
    } else if (p.type === 'co2blade') {
      if (inv.melee && inv.melee.id === 'co2knife') inv.melee.loaded = true;
      else { this.hud.toast('You need a CO2 knife to reload this blade', '#ff6a5a'); return; }
    }
    this.scene.remove(p.mesh);
    this.projectiles.splice(this.projectiles.indexOf(p), 1);
    this.audio.pickup();
  }

  noise(pos, radius, source, force = false) {
    for (const op of this.operators) {
      if (op.dead || op === source) continue;
      const d = op.pos.distanceTo(pos);
      if (d < radius) op.hear(pos, force ? radius : d, radius);
    }
  }

  // ---------------------------------------------------------------- buildings
  placeBuilding(i) {
    const P = this.player, inv = P.inv;
    const it = inv.bag[i];
    if (!it) return;
    const d = ITEMS[it.id];
    if (!d.deploy) return;
    const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    let x = P.pos.x + f.x * 2.6, z = P.pos.z + f.z * 2.6;
    if (d.deploy === 'treestand') {
      const near = this.physics.queryTrunks(P.pos.x - 6, P.pos.z - 6, P.pos.x + 6, P.pos.z + 6).filter((t) => t.h > 6).sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0];
      if (!near) { this.hud.toast('Stand next to a tall tree to place a tree stand', '#ff6a5a'); return; }
      const ang = Math.atan2(P.pos.x - near.x, P.pos.z - near.z);
      x = near.x + Math.sin(ang) * (near.r + 1); z = near.z + Math.cos(ang) * (near.r + 1);
    }
    inv.bag.splice(i, 1);
    const y = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = P.yaw;
    const m = (c) => new THREE.MeshLambertMaterial({ color: c });
    const add = (w, h, dd, c, px, py, pz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m(c)); b.position.set(px, py, pz); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const along = Math.abs(f.x) > Math.abs(f.z); // wall faces the player
    const dep = { type: d.deploy, x, y, z, g, t: 0 };
    if (d.deploy === 'sandbags' || d.deploy === 'barricade') {
      const h = d.deploy === 'sandbags' ? 1.0 : 2.2, w = 3, th = d.deploy === 'sandbags' ? 0.9 : 0.3;
      add(w, h, th, d.deploy === 'sandbags' ? 0x9c8a62 : 0x7a5a3a, 0, h / 2, 0);
      g.rotation.y = along ? Math.PI / 2 : 0;
      const hx = along ? th / 2 : w / 2, hz = along ? w / 2 : th / 2;
      this.physics.addBox([x - hx, y, z - hz], [x + hx, y + h, z + hz]);
    } else if (d.deploy === 'campfire') {
      for (let k = 0; k < 5; k++) { const l = add(0.12, 0.12, 0.9, 0x5a4330, 0, 0.1, 0); l.rotation.y = (k / 5) * Math.PI; }
      dep.flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 7), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 }));
      dep.flame.position.y = 0.55; g.add(dep.flame);
      dep.t = 600;
      this.campfires.push(dep);
    } else if (d.deploy === 'treestand') {
      add(1.8, 0.15, 1.8, 0x7a5a3a, 0, 5, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(0.12, 5, 0.12, 0x4f3a26, sx * 0.8, 2.5, sz * 0.8);
      add(0.6, 5, 0.08, 0x6a4a2a, 0, 2.5, 0.95);
      g.rotation.y = 0;
      this.physics.addBox([x - 0.9, y + 4.85, z - 0.9], [x + 0.9, y + 5, z + 0.9]);
      this.physics.addBox([x - 0.35, y, z + 0.85], [x + 0.35, y + 5.0, z + 1.1], { ladder: true });
    } else if (d.deploy === 'turret') {
      add(0.9, 0.8, 0.9, 0x3a3f45, 0, 0.4, 0);
      dep.head = new THREE.Group(); dep.head.position.y = 1.05; g.add(dep.head);
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), m(0x24272b)); dep.head.add(hb);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), m(0x15171a)); barrel.position.z = -0.6; dep.head.add(barrel);
      dep.ammo = 300; dep.cd = 0;
      this.physics.addBox([x - 0.45, y, z - 0.45], [x + 0.45, y + 1.3, z + 0.45]);
    }
    this.scene.add(g);
    this.deployables.push(dep);
    this.hud.toast(`${d.name} placed`, '#46ffb0');
    this.audio.plate();
  }

  updateDeployables(dt) {
    let fireOn = null;
    for (const f of this.campfires) {
      f.t -= dt;
      if (f.t > 0) { f.flame.scale.y = 0.8 + Math.sin(this.time * 12 + f.x) * 0.2; if (!fireOn || this.player.pos.distanceTo(f.g.position) < this.player.pos.distanceTo(fireOn.g.position)) fireOn = f; }
      else f.flame.visible = false;
    }
    if (fireOn) { this.fireLight.position.set(fireOn.x, fireOn.y + 1, fireOn.z); this.fireLight.intensity = 6 + Math.sin(this.time * 17) * 1.5; } else this.fireLight.intensity = 0;
    for (const d of this.deployables) {
      if (d.type !== 'turret' || d.ammo <= 0) continue;
      d.cd -= dt;
      const origin = { x: d.x, y: d.y + 1.1, z: d.z };
      let target = null, bd = 45;
      for (const op of this.operators) {
        if (op.dead) continue;
        const dist = Math.hypot(op.pos.x - d.x, op.pos.z - d.z);
        if (dist < bd && this.physics.lineOfSight(origin, { x: op.pos.x, y: op.pos.y + 1.2, z: op.pos.z })) { bd = dist; target = op; }
      }
      if (!target) continue;
      d.head.rotation.y = Math.atan2(-(target.pos.x - d.x), -(target.pos.z - d.z)) - d.g.rotation.y;
      if (d.cd > 0) continue;
      d.cd = 0.16;
      d.ammo--;
      this.audio.shot('medium', this.player.pos.distanceTo(d.g.position));
      const tp = new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z);
      this.effects.tracer(new THREE.Vector3(origin.x, origin.y, origin.z), tp, 0xffd27a, 0.05);
      if (Math.random() < 0.4) target.takeHit({ dmg: 24, pen: 4, ammo: 'medium', zone: Math.random() < 0.1 ? 'head' : 'torso' }, { byPlayer: true });
    }
  }

  // ---------------------------------------------------------------- markers / end
  markers() {
    const m = [];
    const ex = this.extraction.site;
    m.push({ x: ex.x, z: ex.z, color: '#4dff7a', label: 'EXTRACTION', kind: 'exfil' });
    m.push({ x: this.pob.origin.x, z: this.pob.origin.z, color: '#46ffb0', label: 'POB', kind: 'pob' });
    for (const c of this.caches.markers()) m.push(c);
    for (const op of this.operators) {
      if (op.dead) continue;
      if (this.time < op.revealedUntil || this.time < (op.pinnedUntil || 0) || (this.time - op.lastShotT < 2 && op.dist < 120)) m.push({ x: op.pos.x, z: op.pos.z, color: '#ff4a3a', kind: 'enemy' });
    }
    return m;
  }

  playerDied(cause, killer) {
    if (this.over) return;
    const inv = this.player.inv;
    this.save.stats.deaths = (this.save.stats.deaths || 0) + 1;
    this.save.stats.kills = (this.save.stats.kills || 0) + this.kills;
    this.save.carry = [];
    this.ctx.persist();
    this.finish({
      success: false, cause, killer, time: this.time, kills: this.kills, filament: inv.filament,
      lost: inv.allItems().map((it) => describeItem(it)),
    }, 'YOU DIED', cause);
  }

  extracted() {
    const inv = this.player.inv;
    const items = inv.allItems().filter((it) => it.id !== 'filament' && it.id !== 'cloth');
    this.save.locker.push(...items);
    this.save.bank += inv.filament;
    this.save.cloth = (this.save.cloth || 0) + inv.cloth;
    this.save.stats.extracts = (this.save.stats.extracts || 0) + 1;
    this.save.stats.kills = (this.save.stats.kills || 0) + this.kills;
    this.save.carry = [];
    this.ctx.persist();
    this.audio.success();
    this.finish({ success: true, time: this.time, kills: this.kills, filament: inv.filament, items: items.map((it) => describeItem(it)) }, 'EXTRACTED', 'Everything you carried is in your POB locker');
  }

  finish(result, title, sub) {
    this.over = true;
    this.endT = 3.5;
    this.result = result;
    if (this.ui) { this.ui = null; this.hud.renderPanel(this); }
    this.hud.banner(title, sub, result.success);
    this.ctx.unlock();
  }

  dispose() {
    this.terrain.destroy();
    this.caches.clear();
    this.extraction.clearHeli();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.renderer.renderLists.dispose();
  }
}
