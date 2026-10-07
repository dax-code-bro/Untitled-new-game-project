// One deployment into the zone: world, player, AI, loot, contract, exfil and radiation.
import * as THREE from 'three';
import { World, rayBox } from './world.js';
import { Player, Gun } from './player.js';
import { Enemy } from './enemy.js';
import { Effects } from './effects.js';
import { rollContainer, rollEnemy, describe } from './loot.js';
import { CONTAINERS, AMMO, ITEMS, RAID, MAX_PLATES } from './data.js';
import { rand, pick, clamp, weighted } from './rng.js';

const MAP_SEED = 7331;
const geoCache = {};

export class Raid {
  constructor(ctx) {
    this.ctx = ctx;
    this.renderer = ctx.renderer;
    this.audio = ctx.audio;
    this.hud = ctx.hud;
    this.settings = ctx.settings;
    this.input = ctx.input;
    this.time = 0;
    this.over = false;
    this.paused = false;
    this.ui = null;
    this.mapOpen = false;
    this.focus = null;
    this.kills = 0;
    this.xp = 0;
    this.enemies = [];
    this.containers = [];

    const scene = (this.scene = new THREE.Scene());
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xd2c3a3, 50, 340);
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
    scene.add(new THREE.HemisphereLight(0xfff2dd, 0x6b5a40, 1.4));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d0, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 1; sc.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);

    this.world = new World(scene, MAP_SEED);
    this.effects = new Effects(scene);
    this.mapImg = this.world.renderMap(1024);

    const sp = pick(this.world.playerSpawns);
    this.player = new Player(this, ctx.kit, { x: sp.x, z: sp.z, yaw: Math.atan2(sp.x, sp.z) });

    this.spawnEnemies();
    this.spawnLoot();
    this.setupContract();
    this.setupExfils();
    this.setupRadiation();
    this.hud.toast(`Deployed. Contract: ${this.contract.title}`, '#ffd23f', 5);
  }

  // ---------------------------------------------------------------- spawning
  randomFree(cx, cz, r, clearance = 0.5) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random());
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (this.world.isFree(x, z, clearance)) return { x, z };
    }
    return null;
  }

  spawnSquad(cx, cz, n, types, anchorR, extra = {}) {
    const squad = [];
    for (let i = 0; i < n; i++) {
      const p = this.randomFree(cx, cz, 7) || this.randomFree(cx, cz, 15);
      if (!p) continue;
      const e = new Enemy(this, pick(types), p.x, p.z, { anchor: { x: cx, z: cz, r: anchorR }, squad, ...extra });
      squad.push(e);
      this.enemies.push(e);
    }
    return squad;
  }

  spawnEnemies() {
    const plan = {
      town: [[3, ['grunt']], [3, ['grunt']], [3, ['grunt', 'heavy']]],
      industrial: [[3, ['grunt', 'heavy']], [3, ['grunt']], [3, ['heavy', 'grunt']], [2, ['elite']]],
      farm: [[3, ['grunt']], [3, ['grunt', 'grunt', 'heavy']]],
      comms: [[3, ['grunt', 'heavy']], [3, ['heavy', 'elite']], [2, ['grunt']]],
      fort: [[4, ['heavy', 'elite']], [4, ['heavy', 'grunt']], [3, ['elite']], [3, ['heavy']]],
    };
    for (const poi of this.world.pois) {
      for (const [n, types] of plan[poi.kind]) {
        const c = this.randomFree(poi.x, poi.z, poi.r * 0.85);
        if (c) this.spawnSquad(c.x, c.z, n, types, poi.r * 0.55);
      }
    }
    // The Warden holds the fort HQ
    const boss = new Enemy(this, 'boss', 0, -3, { anchor: { x: 0, z: 0, r: 4 } });
    this.enemies.push(boss);
    this.boss = boss;
    // road patrols
    for (const [x, z] of [[-170, 0], [170, 0], [0, -150], [0, 160], [-85, -150], [85, 160]]) {
      this.spawnSquad(x, z, 2, ['grunt'], 70);
    }
  }

  makeContainer(kind, x, z, items, threat = 1) {
    const def = CONTAINERS[kind];
    const [w, h, d] = def.size;
    const key = def.size.join(',');
    const geo = geoCache[key] || (geoCache[key] = new THREE.BoxGeometry(w, h, d));
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2 + 0.06, z);
    mesh.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const lid = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: kind === 'intel' ? 0xffe066 : 0xbfb6a0 }));
    lid.scale.set(1.02, 0.12, 1.02);
    lid.position.y = h / 2;
    mesh.add(lid);
    this.scene.add(mesh);
    if (def.collide) {
      const hw = Math.max(w, d) / 2;
      this.world.addCollider({ min: [x - hw, 0, z - hw], max: [x + hw, h + 0.06, z + hw] });
    }
    const c = {
      kind, name: def.name, pos: new THREE.Vector3(x, h / 2 + 0.1, z), mesh, mat, opened: false,
      items: items || rollContainer(kind, threat),
    };
    this.containers.push(c);
    return c;
  }

  spawnLoot() {
    for (const s of this.world.lootSpots) {
      if (s.taken) continue;
      if (Math.random() < 0.12) continue; // some spots are empty each raid
      s.container = this.makeContainer(s.kind, s.x, s.z, null, s.poi.threat);
    }
  }

  setupContract() {
    const pois = this.world.pois.filter((p) => p.kind !== 'fort');
    const type = pick(['intel', 'hvt']);
    if (type === 'intel') {
      const spots = this.world.lootSpots.filter((s) => s.building && s.poi.kind !== 'fort' && s.container);
      const s = pick(spots);
      // swap that container for the intel case
      this.scene.remove(s.container.mesh);
      this.containers.splice(this.containers.indexOf(s.container), 1);
      const b = s.building;
      this.makeContainer('intel', s.x, s.z, [{ kind: 'item', id: 'intel' }, { kind: 'cash', amount: 500 }], 2);
      this.contract = {
        type, title: 'Secure Intel', reward: 5000, xp: 1500, done: false, stage: 'find',
        desc: `Recover the Intel Drive from the marked building in ${s.poi.name}, then exfil with it.`,
        marker: { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, r: 0 },
      };
    } else {
      const poi = pick(pois);
      const c = this.randomFree(poi.x, poi.z, poi.r * 0.7) || this.randomFree(poi.x, poi.z, poi.r) || { x: poi.x + 8, z: poi.z + 8 };
      const hvt = new Enemy(this, 'elite', c.x, c.z, { name: 'HVT Kazimir Vos', hvt: true, hp: 220, armor: 150, anchor: { x: c.x, z: c.z, r: 18 } });
      this.enemies.push(hvt);
      const squad = this.spawnSquad(c.x, c.z, 3, ['heavy', 'grunt'], 20);
      squad.push(hvt); // members share this array, so the HVT joins their squad
      hvt.squad = squad;
      this.contract = {
        type, title: 'Eliminate HVT', reward: 3000, xp: 1500, done: false, stage: 'hunt',
        desc: `Kazimir Vos is hiding near ${poi.name}. Eliminate him (bounty paid on kill).`,
        marker: { x: c.x + rand(-20, 20), z: c.z + rand(-20, 20), r: 45 },
      };
    }
  }

  setupExfils() {
    this.exfils = this.world.exfils.map((e) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(11.4, 12, 48),
        new THREE.MeshBasicMaterial({ color: 0x4dff7a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, 0.08, e.z);
      this.scene.add(ring);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      pole.position.set(e.x, 0.6, e.z);
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4020 }));
      flare.position.set(e.x, 1.25, e.z);
      this.scene.add(pole, flare);
      return { ...e, ring, state: 'idle', t: 0, smokeT: Math.random(), board: 0, heli: null };
    });
    this.activeExfil = null;
  }

  setupRadiation() {
    this.rad = { x: rand(-90, 90), z: rand(-90, 90), r0: 520, r: 520 };
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 220, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7cff4a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    wall.position.set(this.rad.x, 60, this.rad.z);
    this.scene.add(wall);
    this.radWall = wall;
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (this.paused) return;
    if (this.over) {
      this.endT -= dt;
      this.effects.update(dt);
      this.updateExfil(dt);
      if (this.endT <= 0 && !this.endSent) { this.endSent = true; this.ctx.onEnd(this.result); }
      this.clearInput();
      return;
    }
    this.time += dt;
    const P = this.player;
    P.update(dt, this.input, !!this.ui);
    for (const e of this.enemies) e.update(dt);
    this.updateExfil(dt);
    this.updateRadiation(dt);
    this.effects.update(dt);
    this.updateFocus();
    this.sun.position.set(P.pos.x + 60, 130, P.pos.z + 35);
    this.sun.target.position.set(P.pos.x, 0, P.pos.z);
    if (this.time >= RAID.duration && P.alive) { P.alive = false; this.endRaid(false, 'Lost in the radiation'); }
    this.hud.update(this, dt);
    this.clearInput();
  }

  clearInput() {
    this.input.pressed.clear();
    this.input.mdx = this.input.mdy = 0;
    this.input.wheel = 0;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------------------------------------------------------------- combat
  hitscan(o, d, maxT) {
    const w = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxT);
    let best = w ? w.t : maxT, enemy = null, head = false;
    const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.pos.x, ey = e.pos.y, ez = e.pos.z, s = e.scale;
      const dx = ex - o.x, dz = ez - o.z;
      if (dx * dx + dz * dz > best * best + 4) continue;
      let t = rayBox(o.x, o.y, o.z, ix, iy, iz, ex - 0.3 * s, ey, ez - 0.3 * s, ex + 0.3 * s, ey + 1.52 * s, ez + 0.3 * s);
      if (t < best) { best = t; enemy = e; head = false; }
      t = rayBox(o.x, o.y, o.z, ix, iy, iz, ex - 0.17 * s, ey + 1.52 * s, ez - 0.17 * s, ex + 0.17 * s, ey + 1.92 * s, ez + 0.17 * s);
      if (t < best) { best = t; enemy = e; head = true; }
    }
    return { t: best, enemy, head };
  }

  playerShot(o, dir, def, muzzle, first) {
    const res = this.hitscan(o, dir, 450);
    const pt = o.clone().addScaledVector(dir, res.t);
    if (first && Math.random() < 0.6) this.effects.tracer(muzzle, pt, 0xfff0b0, 0.04);
    if (res.enemy) {
      let dmg = def.dmg * (res.head ? def.headMul : 1);
      if (res.t > def.range) dmg *= Math.max(0.45, 1 - (res.t - def.range) / (def.range * 2));
      const r = res.enemy.takeDamage(dmg, res.head);
      this.hud.hitmarker(r.kill, res.head, r.armorHit);
      if (first || r.kill) this.audio.hit(res.head, r.armorHit);
      if (r.kill) this.audio.kill();
      this.effects.puff(pt, r.armorHit ? 0x9fc4ff : 0x8a1010, 0.07, 0.25);
    } else if (res.t < 450) {
      this.effects.puff(pt.addScaledVector(dir, -0.05), 0x9a8a70, 0.06, 0.45, 0.4);
    }
  }

  noise(pos, radius, source = null) {
    for (const e of this.enemies) {
      if (e.dead || e === source || e.state === 'combat') continue;
      const d = e.pos.distanceTo(pos);
      if (d < radius) {
        // gunfire from other AI only makes patrols come investigate; player gunfire can trigger combat
        if (source) { if (e.state === 'patrol') e.hear(pos, radius, radius); }
        else e.hear(pos, d, radius);
      }
    }
  }

  onEnemyKilled(e) {
    if (!e.radKill) {
      this.kills++;
      this.xp += e.def.xp;
      this.hud.feed(`Eliminated ${e.name}`, e.def.boss || e.hvt ? '#ffb02e' : '#e8e8e8');
    }
    this.containers.push({
      kind: 'body', name: e.name, pos: e.pos.clone().setY(0.35), mesh: null, opened: false, items: rollEnemy(e),
    });
    if (e.hvt && !this.contract.done) {
      this.contract.done = true;
      this.player.cash += this.contract.reward;
      this.xp += this.contract.xp;
      this.audio.success();
      this.hud.toast(`HVT eliminated — $${this.contract.reward.toLocaleString()} bounty paid`, '#ffd23f', 5);
    }
    if (e.def.boss) this.hud.toast('The Warden is down. Loot his body.', '#ffb02e', 5);
  }

  // Next waypoint from `from` towards `to`, routing via doors.
  nav(from, to) {
    const A = this.world.containing(from.x, from.z), B = this.world.containing(to.x, to.z);
    let k = 0;
    while (k < A.length && k < B.length && A[k] === B[k]) k++;
    const pickDoor = (b, a, c) => {
      let best = null, bd = Infinity;
      for (const d of b.doors) {
        const s = Math.hypot(d.in.x - a.x, d.in.z - a.z) + Math.hypot(d.out.x - c.x, d.out.z - c.z);
        if (s < bd) { bd = s; best = d; }
      }
      return best;
    };
    const through = (p, a, b) => {
      const nx = b.x - a.x, nz = b.z - a.z, L = Math.hypot(nx, nz);
      const ux = nx / L, uz = nz / L;
      const rx = p.x - a.x, rz = p.z - a.z;
      const along = rx * ux + rz * uz;
      const lat = Math.abs(rx * uz - rz * ux);
      return lat < 0.7 && along > -0.5 ? b : a;
    };
    if (A.length > k) {
      const b = A[A.length - 1];
      const d = pickDoor(b, from, to);
      if (d) return through(from, d.in, d.out);
    } else if (B.length > k) {
      const b = B[k];
      let best = null, bd = Infinity;
      for (const d of b.doors) { const s = Math.hypot(d.out.x - from.x, d.out.z - from.z); if (s < bd) { bd = s; best = d; } }
      if (best) return through(from, best.out, best.in);
    }
    return to;
  }

  // ---------------------------------------------------------------- interaction
  updateFocus() {
    const P = this.player;
    this.focus = null;
    if (!P.alive || P.downed || this.ui) return;
    const cam = this.camera.position;
    const f = this.camera.getWorldDirection(new THREE.Vector3());
    let best = -1;
    for (const c of this.containers) {
      if (c.opened && c.items.length === 0) continue;
      const dx = c.pos.x - cam.x, dy = c.pos.y - cam.y, dz = c.pos.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 2.7) continue;
      const dot = (dx * f.x + dy * f.y + dz * f.z) / dist;
      if (dot < 0.5) continue;
      const hit = this.world.raycast(cam.x, cam.y, cam.z, dx / dist, dy / dist, dz / dist, dist);
      if (hit && hit.t < dist - 0.75) continue;
      const score = dot - dist * 0.08;
      if (score > best) { best = score; this.focus = { type: 'container', c }; }
    }
    if (!this.focus && !this.activeExfil) {
      for (const ex of this.exfils) {
        if (ex.state === 'idle' && Math.hypot(P.pos.x - ex.x, P.pos.z - ex.z) < 12) this.focus = { type: 'exfil', ex };
      }
    }
    for (const c of this.containers) if (c.mat) c.mat.emissive.setHex(this.focus && this.focus.c === c ? 0x333322 : 0x000000);
  }

  onKey(code) {
    if (this.over) return;
    if (code === 'Tab') { this.ui ? this.closeUI() : this.openUI('inventory'); return; }
    if (code === 'KeyM') { this.mapOpen = !this.mapOpen; this.hud.showMap(this.mapOpen, this); return; }
    if (code === 'Escape' && this.ui) { this.closeUI(); return; }
    if (code === 'KeyE') {
      if (this.ui === 'loot') { this.closeUI(); return; }
      if (this.ui) return;
      const f = this.focus;
      if (!f) return;
      if (f.type === 'container') { f.c.opened = true; this.lootTarget = f.c; this.openUI('loot'); this.audio.ui(); }
      if (f.type === 'exfil') this.callExfil(f.ex);
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
    this.ctx.lock();
  }

  takeItem(c, i, silent = false) {
    const P = this.player, it = c.items[i];
    if (!it) return false;
    const fail = (msg) => { if (!silent) this.hud.toast(msg, '#ff6a5a'); return false; };
    switch (it.kind) {
      case 'cash':
        P.cash += it.amount; this.audio.cash(); break;
      case 'ammo': {
        const room = AMMO[it.type].max - P.ammo[it.type];
        if (room <= 0) return fail(`${AMMO[it.type].name} ammo full`);
        const take = Math.min(room, it.amount);
        P.ammo[it.type] += take;
        it.amount -= take;
        this.audio.pickup();
        if (it.amount > 0) return true;
        break;
      }
      case 'plate':
        if (P.plates >= RAID.maxSparePlates) return fail('Plate carrier full');
        P.plates++; this.audio.plate(); break;
      case 'revive':
        if (P.revives >= 1) return fail('Already carrying a Self-Revive');
        P.revives++; this.audio.pickup(); break;
      case 'item':
        if (P.bag.length >= P.bagCap) return fail('Backpack full');
        P.bag.push({ kind: 'item', id: it.id });
        this.audio.pickup();
        if (it.id === 'intel' && this.contract.type === 'intel') {
          this.contract.stage = 'exfil';
          this.hud.toast('Intel secured — exfil to complete the contract', '#ffd23f', 5);
        }
        break;
      case 'weapon':
        if (!P.weapons[0]) {
          P.weapons[0] = new Gun(it.id, it.uid, it.mag);
          P.switchTo(0);
        } else {
          if (P.bag.length >= P.bagCap) return fail('Backpack full');
          P.bag.push({ kind: 'weapon', id: it.id, uid: it.uid, mag: it.mag });
          this.audio.pickup();
        }
        break;
    }
    c.items.splice(i, 1);
    return true;
  }

  takeAll(c) {
    for (let i = 0; i < c.items.length;) {
      const before = c.items.length;
      this.takeItem(c, i, true);
      if (c.items.length === before) i++;
    }
    if (c.items.length) this.hud.toast('Some items could not be taken', '#ff6a5a');
  }

  dropFromBag(i) {
    const P = this.player;
    const it = P.bag.splice(i, 1)[0];
    if (!it) return;
    if (it.kind === 'item' && it.id === 'intel' && this.contract.type === 'intel') this.contract.stage = 'find';
    let c = this.containers.find((k) => k.kind === 'drop' && k.pos.distanceTo(P.pos) < 2.5);
    if (!c) {
      const f = this.camera.getWorldDirection(new THREE.Vector3());
      c = this.makeContainer('drop', P.pos.x + f.x * 0.9, P.pos.z + f.z * 0.9, []);
      c.opened = true;
    }
    c.items.push(it);
  }

  // Equip a weapon from the backpack into slot (0 primary / 1 secondary); the old one goes to the bag.
  equipFromBag(i, slot) {
    const P = this.player;
    const it = P.bag[i];
    if (!it || it.kind !== 'weapon') return;
    const old = P.weapons[slot];
    P.weapons[slot] = new Gun(it.id, it.uid, it.mag);
    if (old) P.bag[i] = { kind: 'weapon', id: old.id, uid: old.uid, mag: old.mag };
    else P.bag.splice(i, 1);
    P.switchTo(slot);
  }

  hasIntel() { return this.player.bag.some((b) => b.kind === 'item' && b.id === 'intel'); }

  // ---------------------------------------------------------------- exfil
  callExfil(ex) {
    if (this.activeExfil) return;
    ex.state = 'called';
    ex.t = RAID.exfilCall;
    ex.wave2 = false;
    this.activeExfil = ex;
    this.audio.alert();
    this.hud.toast(`Exfil ${ex.name} called — hold the area. Enemy reinforcements inbound!`, '#4dff7a', 5);
    this.spawnReinforcements(ex, 3);
  }

  spawnReinforcements(ex, n) {
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + rand(-0.5, 0.5), d = rand(65, 85);
      const p = this.randomFree(ex.x + Math.cos(a) * d, ex.z + Math.sin(a) * d, 12);
      if (!p) continue;
      const e = new Enemy(this, weighted({ grunt: 3, heavy: 2, elite: 0.6 }), p.x, p.z, { anchor: { x: ex.x, z: ex.z, r: 15 } });
      this.enemies.push(e);
      e.enterCombat(this.player.pos, false, false);
    }
  }

  buildHeli() {
    const g = new THREE.Group();
    const olive = new THREE.MeshLambertMaterial({ color: 0x4a5236 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1e1f1c });
    const add = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    add(2.4, 2.2, 6.5, olive, 0, 1.6, 0);
    add(0.6, 0.6, 6, olive, 0, 2.1, 5.5);
    add(0.2, 1.6, 1.2, olive, 0, 2.9, 8.2);
    add(2.0, 0.9, 1.6, new THREE.MeshLambertMaterial({ color: 0x223040 }), 0, 2.0, -3.2);
    add(0.12, 0.12, 5, dark, 1.1, 0.2, 0); add(0.12, 0.12, 5, dark, -1.1, 0.2, 0);
    const rotor = new THREE.Group(); rotor.position.set(0, 3.0, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 0.4), dark);
    const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2;
    rotor.add(blade, blade2); g.add(rotor);
    g.userData.rotor = rotor;
    this.scene.add(g);
    return g;
  }

  updateExfil(dt) {
    const P = this.player;
    for (const ex of this.exfils) {
      ex.smokeT -= dt;
      if (ex.smokeT <= 0 && ex.state !== 'cooldown') {
        ex.smokeT = 0.35;
        this.effects.puff(new THREE.Vector3(ex.x + rand(-0.3, 0.3), 1.4, ex.z + rand(-0.3, 0.3)),
          ex.state === 'idle' ? 0xc0402c : 0x40c060, 0.5, 4.5, 3.2, 4, 0.45);
      }
      if (ex.state === 'cooldown') {
        ex.t -= dt;
        if (ex.t <= 0) { ex.state = 'idle'; ex.ring.material.color.setHex(0x4dff7a); }
      }
    }
    const ex = this.activeExfil;
    if (!ex) return;
    ex.t -= dt;
    if (ex.state === 'called') {
      if (!ex.wave2 && ex.t <= RAID.exfilCall * 0.45) { ex.wave2 = true; this.spawnReinforcements(ex, 2); }
      if (ex.t <= 0) {
        ex.state = 'arriving';
        ex.t = 9;
        ex.heli = this.buildHeli();
        const a = Math.atan2(ex.z, ex.x);
        ex.from = new THREE.Vector3(ex.x - Math.cos(a) * 260, 70, ex.z - Math.sin(a) * 260);
        // land beside the flare, on the side facing the map center, so it doesn't drop onto the player
        const len = Math.hypot(ex.x, ex.z) || 1;
        ex.to = new THREE.Vector3(ex.x - (ex.x / len) * 9, 0.4, ex.z - (ex.z / len) * 9);
        ex.heli.rotation.y = Math.atan2(-(ex.to.x - ex.from.x), -(ex.to.z - ex.from.z)) + Math.PI;
        ex.sound = this.audio.startHeli();
      }
    } else if (ex.state === 'arriving') {
      const k = 1 - Math.max(0, ex.t) / 9;
      const e = 1 - Math.pow(1 - k, 3);
      ex.heli.position.lerpVectors(ex.from, ex.to, e);
      if (ex.t <= 0) { ex.state = 'landed'; ex.t = RAID.heliWait; ex.board = 0; this.hud.toast('Exfil chopper landed — get on board!', '#4dff7a', 4); }
    } else if (ex.state === 'landed') {
      const inZone = P.alive && Math.hypot(P.pos.x - ex.to.x, P.pos.z - ex.to.z) < 8 && !P.downed;
      ex.board = inZone ? ex.board + dt : Math.max(0, ex.board - dt * 2);
      if (ex.board >= RAID.board && !this.over) { this.endRaid(true, `Extracted at Exfil ${ex.name}`); }
      if (ex.t <= 0 && !this.over) { ex.state = 'leaving'; ex.t = 8; this.hud.toast('The exfil chopper left without you', '#ff6a5a', 4); }
    } else if (ex.state === 'leaving') {
      ex.heli.position.y += dt * (this.over ? 9 : 12);
      ex.heli.position.x += dt * 25 * Math.sign(ex.x || 1);
      ex.heli.position.z += dt * 25 * Math.sign(ex.z || 1);
      if (ex.t <= 0) {
        this.scene.remove(ex.heli);
        ex.heli = null;
        ex.sound.stop();
        ex.state = 'cooldown';
        ex.t = 40;
        ex.ring.material.color.setHex(0x777777);
        this.activeExfil = null;
      }
    }
    if (ex.heli) {
      ex.heli.userData.rotor.rotation.y += dt * 30;
      ex.sound.set(ex.heli.position.distanceTo(this.camera.position));
    }
  }

  // ---------------------------------------------------------------- radiation
  radiusAt(t) {
    if (t < RAID.radStart) return this.rad.r0;
    return this.rad.r0 * Math.max(0, 1 - (t - RAID.radStart) / (RAID.radEnd - RAID.radStart));
  }

  updateRadiation(dt) {
    const r = (this.rad.r = this.radiusAt(this.time));
    this.radWall.scale.set(Math.max(0.01, r), 1, Math.max(0.01, r));
    const P = this.player;
    const d = Math.hypot(P.pos.x - this.rad.x, P.pos.z - this.rad.z);
    this.inRad = d > r;
    if (this.inRad && P.alive && !P.downed) {
      P.damage(RAID.radDps * dt, null, 'Radiation', true);
      if (Math.random() < dt * 25) this.audio.geiger();
    }
    for (const e of this.enemies) {
      if (!e.dead && Math.hypot(e.pos.x - this.rad.x, e.pos.z - this.rad.z) > r) {
        e.hp -= RAID.radDps * dt;
        if (e.hp <= 0) { e.radKill = true; e.die(); }
      }
    }
  }

  // ---------------------------------------------------------------- markers / end
  markers() {
    const m = [];
    for (const ex of this.exfils) {
      m.push({ x: ex.x, z: ex.z, color: ex.state === 'cooldown' ? '#888888' : '#4dff7a', label: `EXFIL ${ex.name.toUpperCase()}`, kind: 'exfil' });
    }
    const c = this.contract;
    if (!c.done && c.stage !== 'exfil') m.push({ x: c.marker.x, z: c.marker.z, r: c.marker.r, color: '#ffd23f', label: c.title.toUpperCase(), kind: 'objective' });
    for (const e of this.enemies) {
      if (!e.dead && this.time - e.lastShotT < 2 && e.dist < 90) m.push({ x: e.pos.x, z: e.pos.z, color: '#ff4a3a', kind: 'enemy' });
    }
    return m;
  }

  endRaid(success, reason) {
    if (this.over) return;
    this.over = true;
    this.endT = success ? 3 : 3.5;
    const P = this.player;
    if (this.ui) { this.ui = null; this.hud.renderPanel(this); }
    const weapons = [];
    let items = [];
    let bonus = 0;
    if (success) {
      for (const g of P.weapons) if (g) weapons.push({ id: g.id, uid: g.uid });
      for (const b of P.bag) {
        if (b.kind === 'weapon') weapons.push({ id: b.id, uid: b.uid });
        else if (!ITEMS[b.id].quest) items.push({ id: b.id });
      }
      if (this.contract.type === 'intel' && this.hasIntel()) {
        this.contract.done = true;
        bonus = this.contract.reward;
        this.xp += this.contract.xp;
      }
      this.xp += 500;
      this.audio.success();
    }
    const haulValue = items.reduce((s, it) => s + ITEMS[it.id].value, 0) + (success ? P.cash + bonus : 0);
    this.result = {
      success, reason, duration: this.time, kills: this.kills, xp: this.xp,
      cash: success ? Math.round(P.cash) : 0, bonus, weapons, items,
      plates: success ? P.plates + Math.floor(P.armor / 50) : 0,
      revives: success ? P.revives : 0,
      haulValue, contract: { title: this.contract.title, done: this.contract.done },
      lost: success ? [] : [...P.weapons.filter(Boolean).map((g) => g.def.name), ...P.bag.map((b) => describe(b).name)],
    };
    this.hud.banner(success ? 'EXTRACTED' : 'KILLED IN ACTION', reason, success);
    this.ctx.unlock();
  }

  dispose() {
    for (const ex of this.exfils) if (ex.sound) ex.sound.stop();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.renderer.renderLists.dispose();
  }
}

function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2; cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fa4cf');
  gr.addColorStop(0.55, '#c5c6bb');
  gr.addColorStop(1, '#d2c3a3');
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
