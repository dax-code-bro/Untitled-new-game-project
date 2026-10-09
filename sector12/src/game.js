// One life on Sector 12: world, player, AI, wildlife, weather, caches, combat, POB, extraction.
import * as THREE from 'three';
import { Terrain } from './terrainMesh.js';
import { Graphics } from './graphics.js';
import { Grass } from './grass.js';
import { SHARED } from './materials.js';
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
import { LOOT_TABLES, ANIMALS } from './data/world.js';
import { POIS, heightAt, regionAt, REGIONS, islandD, normalAt, snowAt } from './terrain.js';
import { setWeaponTextures, buildWeapon } from './weapons.js';
import { HumanRig, PALETTES } from './rig.js';
import { QuadRig } from './animalRig.js';
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
    this.tex = ctx.textures;
    this.gfx = new Graphics(this.renderer, scene, this.camera, this.settings.quality || 'high');
    this.physics = new Physics();
    this.effects = new Effects(scene, this.audio);
    setWeaponTextures(this.tex);
    this.bullets = [];
    this.later = [];
    this.terrain = new Terrain(scene, this.tex);
    this.env = new Environment(this);
    this.structures = buildStructures(scene, this.physics, this.tex);
    this.scatter = new Scatter(scene, this.physics, this.tex, this.gfx.q);
    this.grass = new Grass(scene, this.tex, this.gfx.q);
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
    // brass and magazines from the first-person gun land in the world
    this.player.vm.onEject = (p, v, kind) => this.effects.casing(p, v, kind);
    this.player.vm.onDropMag = (obj, p, q, s) => this.effects.debris(obj, p, q, s, new THREE.Vector3(0, -0.5, 0).add(this.player.vel || new THREE.Vector3()));
    this.wasSafe = true;
    this.saveCarry();
  }

  async load(onProgress) {
    this.scatter.warmup(this.player.pos);
    this.grass.update(this.player.pos);
    this.player.update(0, this.input, true);
    this.env.update(0, 0);
    await this.terrain.warmup(this.camera.position, onProgress);
    await this.warmShaders();
    this.gfx.patchScene();
    this.patchT = 1;
  }

  // Compile every material variant the game will need (people, animals, guns, effects) during the
  // loading screen, so the first operator / deer / explosion doesn't hitch the game.
  async warmShaders() {
    const tmp = new THREE.Group();
    this.scene.add(tmp);
    const P = this.player.pos;
    const rigs = [];
    const op = new HumanRig(tmp, this.tex, { palette: PALETTES.woodland, skin: 0xc69a74, vest: 8, helmet: 8, pack: 2, goggles: true, cap: false, holster: true, vestColor: 0x3a4030, helmColor: 0x45503a });
    op.setWeapon(ITEMS.bg850, null);
    const op2 = new HumanRig(tmp, this.tex, { palette: PALETTES.desert, skin: 0x8a5a3a, vest: 0, helmet: 0, pack: 0, balaclava: true, cap: true, vestColor: 0x3a4030, helmColor: 0x45503a });
    op2.setWeapon(ITEMS.ka43, null);
    rigs.push(op, op2);
    for (const sp of ['deer', 'wolf', 'bear', 'raccoon', 'moose']) rigs.push(new QuadRig(tmp, sp, ANIMALS[sp].size, ANIMALS[sp].color));
    const s = { pos: new THREE.Vector3(P.x, P.y - 50, P.z), vel: new THREE.Vector3(), yaw: 0, aimYaw: 0, aimPitch: 0, fwd: new THREE.Vector3(0, 0, 1), state: 'wander', dist: 1, grounded: true };
    for (const r of rigs) { r.update(0.016, s); r.root.position.copy(s.pos); }
    for (const id of ['xm9', 'trench', 'sixshooter', 'slugthrower', 'knife', 'flaregun']) { const g = buildWeapon(ITEMS[id], { att: { optic: id === 'xm9' ? 'holo' : null } }); g.position.copy(s.pos); tmp.add(g); }
    const fx = this.effects, here = new THREE.Vector3(P.x, P.y + 1, P.z);
    fx.impact(here, new THREE.Vector3(0, 1, 0), 'metal', new THREE.Vector3(0, -1, 0));
    fx.casing(here, new THREE.Vector3(), 'rifle'); fx.casing(here, new THREE.Vector3(), 'shell'); fx.casing(here, new THREE.Vector3(), 'pistol'); fx.casing(here, new THREE.Vector3(), 'big');
    fx.ring(here, 0.1, 0.2, 0.05, 0xffffff, 0.01);
    fx.update(0.016, this.camera.position);
    this.gfx.patchScene();
    try {
      // never let a driver that doesn't report parallel-compile status hold up the loading screen
      if (this.renderer.compileAsync) await Promise.race([this.renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 6000))]);
      else this.renderer.compile(this.scene, this.camera);
      this.gfx.render(); // shadow-pass variants too
    } catch (e) { console.warn('shader warm-up', e); }
    for (const r of rigs) r.dispose();
    this.scene.remove(tmp);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (this.paused) return;
    if (this.over) {
      this.endT -= dt;
      this.updateBullets(dt);
      this.effects.update(dt, this.camera.position);
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
    this.grass.update(P.pos);
    SHARED.uTime.value += dt;
    const L = this.env.local;
    SHARED.uWet.value += ((L.rain > 0.3 ? 1 : 0) - SHARED.uWet.value) * Math.min(1, dt * 0.05);
    SHARED.uWindStrength.value = 1 + (1 - L.fog) * 2 + L.tornado * 3;
    this.env.update(dt, this.time);
    this.patchT -= dt;
    if (this.patchT <= 0) { this.patchT = 1; this.gfx.patchScene(); }
    this.pob.update(dt);
    this.caches.update(dt);
    this.extraction.update(dt);
    this.wildlife.update(dt);
    this.updateOperators(dt);
    this.updateProjectiles(dt);
    this.updateBullets(dt);
    for (let i = this.later.length - 1; i >= 0; i--) { const l = this.later[i]; l.t -= dt; if (l.t <= 0) { this.later.splice(i, 1); l.fn(); } }
    this.updateDeployables(dt);
    this.effects.setLight(this.gfx.particleLight());
    this.effects.update(dt, this.camera.position);
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
  render() { this.gfx.render(); }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.gfx.resize(w, h); }
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

  // ---------------------------------------------------------------- ballistics
  // Bullets are projectiles: they leave the muzzle at the round's velocity, lose speed to drag, drop
  // under gravity (the bore is angled up so the round crosses the sight line at the weapon's zero)
  // and take time to arrive. They penetrate thin cover, trees and bodies when they have the power.
  // b: {origin, dir, muzzle, dmg, pen, ammo, range, explosive, blast, blastDmg, shot, shooter, tracer, def}
  fireBullet(b) {
    const B = ballistics(b);
    const dir = b.dir.clone();
    dir.y += (9.8 * B.zero) / (2 * B.v0 * B.v0);
    dir.normalize();
    this.bullets.push({ ...b, pos: b.origin.clone(), vel: dir.multiplyScalar(B.v0), v0: B.v0, drag: B.drag, travelled: 0, life: 4, vis: b.muzzle ? b.muzzle.clone().sub(b.origin) : new THREE.Vector3(), streak: b.tracer ? 1 : 0.35 });
  }

  updateBullets(dt) {
    const P = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      const speed = b.vel.length();
      const len = speed * dt;
      const dir = b.vel.clone().divideScalar(speed || 1);
      let stop = b.life <= 0 || speed < 60 || b.travelled > 2500;
      if (!stop) stop = this.resolveSegment(b, b.pos, dir, len);
      // water: a round entering the water slows to nothing within a metre or so
      if (!stop) {
        const nx = b.pos.x + dir.x * len, nz = b.pos.z + dir.z * len, ny = b.pos.y + dir.y * len;
        const wl = waterLevelAt(nx, nz);
        if (wl !== null && b.pos.y > wl && ny <= wl) {
          const t = (b.pos.y - wl) / Math.max(1e-6, b.pos.y - ny);
          this.effects.splash(new THREE.Vector3(b.pos.x + dir.x * len * t, wl, b.pos.z + dir.z * len * t), b.shot ? 0.25 : 0.5);
          stop = true;
        }
      }
      // passing close to the player: the supersonic crack
      if (!stop && b.shooter !== P && !b.cracked) {
        const toP = new THREE.Vector3(P.pos.x - b.pos.x, P.pos.y + 1.5 - b.pos.y, P.pos.z - b.pos.z);
        const along = toP.dot(dir);
        if (along > 0 && along < len) {
          const miss = toP.addScaledVector(dir, -along).length();
          if (miss < 4) { b.cracked = true; if (this.audio.crack) this.audio.crack(miss, speed > 340); }
        }
      }
      // visible streak (offset from the eye towards the muzzle at first, converging down range)
      if (b.streak > 0 && b.travelled < 1200) {
        const k = Math.max(0, 1 - b.travelled / 12);
        const p = b.pos.clone().addScaledVector(dir, len * 0.5).addScaledVector(b.vis, k);
        this.effects.glow.emit({ pos: p, vel: b.vel, color: b.tracer ? [1.6, 1.25, 0.7] : [1.1, 1.0, 0.85], life: dt * 1.2, size: b.tracer ? 0.035 : 0.018, stretch: b.tracer ? 0.012 : 0.006, alpha: b.tracer ? 0.95 : 0.4 * b.streak, fadeIn: 0 });
      }
      if (stop) { this.bullets.splice(i, 1); continue; }
      b.pos.addScaledVector(dir, len);
      b.travelled += len;
      b.vel.y -= 9.8 * dt;
      b.vel.multiplyScalar(Math.exp(-b.drag * dt));
    }
  }

  // what a bullet meets along one step; returns true when it stops
  resolveSegment(b, o, dir, len) {
    const P = this.player;
    const world = this.physics.rayAll(o, dir, len);
    const ents = b.shooter === P ? this.entityRay(o, dir, len) : this.entityRay(o, dir, len).filter((h) => h.kind !== 'op');
    const hits = [...world, ...ents].sort((a, c) => a.t - c.t);
    // AI rounds that were rolled to hit the player land when they reach them
    if (b.hitPlayer && !b.hitDone) {
      const toP = new THREE.Vector3(P.pos.x - o.x, P.pos.y + P.eye * 0.75 - o.y, P.pos.z - o.z);
      const along = toP.dot(dir);
      if (along >= 0 && along <= len && toP.addScaledVector(dir, -along).length() < 0.8 && (!hits.length || hits[0].t > along)) {
        b.hitDone = true;
        b.hitPlayer();
        return true;
      }
    }
    for (const h of hits) {
      const dist = b.travelled + h.t;
      const fall = dist > b.range ? clamp(1 - (dist - b.range) / (b.range * 2.5), 0.35, 1) : 1;
      // energy left (a slowed round hits softer)
      const energy = clamp((b.vel.length() / b.v0) ** 2, 0.3, 1);
      const pt = o.clone().addScaledVector(dir, h.t);
      if (h.kind === 'op') {
        const zone = h.op.zoneAt(pt);
        h.op.airborneAtDeath = false;
        const r = h.op.takeHit({ dmg: b.dmg * fall * energy, pen: b.pen, ammo: b.ammo, zone, explosive: b.explosive, shot: b.shot }, { byPlayer: b.shooter === P, airborne: !P.onGround && P.airTime > 0.25, dir });
        this.hud.hitmarker(r.killed, zone === 'head', r.armorHit);
        this.audio.hit(zone === 'head', r.armorHit);
        this.effects.impact(pt, dir.clone().negate(), r.armorHit ? 'armor' : 'flesh', dir, b.shot ? 0.5 : 1);
        if (b.explosive) { this.explode(pt, b.blast, b.blastDmg, b.shooter); return true; }
        if (b.pen >= 6) { b.dmg *= 0.5; b.pen -= 3; continue; }
        return true;
      }
      if (h.kind === 'animal') {
        let zone = h.zone;
        if (zone === 'body') {
          const a = h.a, fwd = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
          const rel = pt.clone().sub(a.pos);
          if (rel.dot(fwd) > a.bodyOff + a.def.size * 0.05 && rel.y > a.legH + a.bodyH * 0.35) zone = 'vitals';
          else if (rel.y < a.legH + 0.05) zone = 'leg';
        }
        const r = h.a.takeDamage(b.dmg * fall * energy, zone);
        if (b.shooter === P) this.hud.hitmarker(r.killed, zone === 'head' || zone === 'vitals', false);
        this.effects.impact(pt, dir.clone().negate(), 'flesh', dir, b.shot ? 0.5 : 1);
        if (b.explosive) { this.explode(pt, b.blast, b.blastDmg, b.shooter); return true; }
        return true;
      }
      if (b.explosive) { this.explode(pt.addScaledVector(dir, -0.2), b.blast, b.blastDmg, b.shooter); return true; }
      const { n, surface } = this.surfaceAt(h, pt, dir);
      this.effects.impact(pt, n, surface, dir, b.shot ? 0.45 : b.pen >= 6 ? 1.4 : 1);
      if (h.kind === 'box' && h.box.thin && b.pen >= 4) { b.dmg *= 0.6; b.pen -= 2; continue; }
      if (h.kind === 'trunk' && h.trunk.kind !== 'rock' && b.pen >= 7) { b.dmg *= 0.5; b.pen -= 3; continue; }
      // shallow hits on hard surfaces ricochet
      if ((surface === 'rock' || surface === 'metal' || surface === 'concrete') && !b.shot && -dir.dot(n) < 0.25 && !b.ricochet) {
        b.ricochet = true;
        b.pos.copy(pt).addScaledVector(n, 0.02);
        b.vel.addScaledVector(n, -2 * b.vel.dot(n)).multiplyScalar(0.45);
        b.dmg *= 0.4;
        b.travelled += h.t;
        if (this.audio.ricochet) this.audio.ricochet(pt.distanceTo(this.camera.position));
        return false;
      }
      return true;
    }
    return false;
  }

  surfaceAt(h, pt, dir) {
    if (h.kind === 'terrain') {
      const n = new THREE.Vector3(...normalAt(pt.x, pt.z, 0.5));
      const reg = regionAt(pt.x, pt.z, pt.y);
      return { n, surface: snowAt(pt.x, pt.z, pt.y) ? 'snow' : reg === 'w' || reg === 'beach' ? 'sand' : 'terrain' };
    }
    if (h.kind === 'trunk') {
      const t = h.trunk;
      const n = new THREE.Vector3(pt.x - t.x, 0, pt.z - t.z).normalize();
      return { n, surface: t.kind === 'rock' ? 'rock' : 'wood' };
    }
    const c = h.box;
    // which face: the axis where the point is closest to the box surface
    const d = [pt.x - c.min[0], c.max[0] - pt.x, pt.y - c.min[1], c.max[1] - pt.y, pt.z - c.min[2], c.max[2] - pt.z];
    let k = 0;
    for (let i = 1; i < 6; i++) if (d[i] < d[k]) k = i;
    const n = new THREE.Vector3([-1, 1, 0, 0, 0, 0][k], [0, 0, -1, 1, 0, 0][k], [0, 0, 0, 0, -1, 1][k]);
    return { n, surface: c.mat || 'concrete' };
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
    this.effects.impact(pt, d.clone().negate(), 'flesh', d, 0.7);
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
        if (e.kind === 'op') { const pt = p.pos.clone().addScaledVector(dir, e.t); this.effects.impact(pt, dir.clone().negate(), 'flesh', dir, 0.6); const zone = e.op.zoneAt(pt); const r = e.op.takeHit({ dmg: p.dmg, pen: 3, ammo: 'light', zone }, { byPlayer: true, airborne: !this.player.onGround }); this.hud.hitmarker(r.killed, zone === 'head', r.armorHit); }
        else { const r = e.a.takeDamage(p.dmg, e.zone); this.hud.hitmarker(r.killed, e.zone === 'head', false); }
        this.audio.hit(false, false);
        p.pos.addScaledVector(dir, e.t);
        p.stuck = true; p.mesh.position.copy(p.pos);
        continue;
      }
      if (w) {
        const wp = p.pos.clone().addScaledVector(dir, w.t);
        if (p.type !== 'flare') { const sf = this.surfaceAt(w, wp, dir); this.effects.impact(wp, sf.n, sf.surface, dir, 0.4); }
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
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.gfx.dispose();
    this.renderer.renderLists.dispose();
  }
}

// muzzle velocity (m/s), drag and zero range for a round
function ballistics(b) {
  const d = b.def || {};
  const sub = d.sub || '';
  let v0 = 880, drag = 0.1, zero = 100;
  if (b.shot) { v0 = 400; drag = 0.9; zero = 25; }
  else if (b.ammo === 'slug' || b.ammo === 'exp_slug') { v0 = 470; drag = 0.35; zero = 50; }
  else if (d.id === 'bg850') { v0 = 900; drag = 0.05; zero = 300; }
  else if (d.id === 'zip22') { v0 = 330; drag = 0.3; zero = 15; }
  else if (/Pistol|Revolver|Cannon|SMG/.test(sub)) { v0 = d.id === 'guillotine' || d.id === 'd744' ? 470 : 370; drag = 0.25; zero = 25; }
  else if (d.id === 'ka43') { v0 = 715; drag = 0.13; }
  if (b.explosive) v0 *= 0.85;
  return { v0, drag, zero };
}
