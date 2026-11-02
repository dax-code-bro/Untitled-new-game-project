// Hunting: 8 species with procedural bodies, walk/run leg cycles and simple
// behaviour (graze, wander, flee, charge). Kill, skin with a knife, sell the
// pelts at a trading post. Animal calls (Hunting tools) draw animals in.
import * as THREE from 'three';
import { partMesh } from '../entities/craft.js';
import { roundBox, hyp2 } from '../assets/carbuilder.js';
import { PLAINS, FOREST, BAYOU, regionAt } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { money, keyHint } from './world-util.js';

// size: body length; leg length; colours; behaviour
export const SPECIES = {
  deer: { name: 'White-tailed deer', L: 1.6, h: 0.95, girth: 0.32, neck: 0.55, head: 0.18, leg: 0.85, col: [0.36, 0.24, 0.14], belly: [0.75, 0.7, 0.62], hp: 60, speed: 11, wary: 70, pelt: 140, antlers: 0.5, regions: ['Redgrass Plains', 'Pinewood Hollow', 'Calvera River'] },
  doe: { name: 'Doe', L: 1.45, h: 0.85, girth: 0.29, neck: 0.5, head: 0.16, leg: 0.8, col: [0.4, 0.28, 0.17], belly: [0.78, 0.72, 0.64], hp: 50, speed: 11, wary: 75, pelt: 90, regions: ['Redgrass Plains', 'Pinewood Hollow', 'Calvera River'] },
  boar: { name: 'Feral hog', L: 1.3, h: 0.55, girth: 0.34, neck: 0.15, head: 0.22, leg: 0.42, col: [0.16, 0.12, 0.1], belly: [0.2, 0.16, 0.12], hp: 80, speed: 8, wary: 40, pelt: 70, aggro: 0.5, dmg: 12, regions: ['Pinewood Hollow', 'Bayou Verde', 'Calvera River'] },
  coyote: { name: 'Coyote', L: 1.0, h: 0.55, girth: 0.2, neck: 0.3, head: 0.13, leg: 0.48, col: [0.5, 0.42, 0.32], belly: [0.8, 0.75, 0.65], hp: 35, speed: 12, wary: 55, pelt: 60, aggro: 0.2, dmg: 8, regions: ['Redgrass Plains', 'Sierra Norte'] },
  rabbit: { name: 'Cottontail', L: 0.38, h: 0.2, girth: 0.11, neck: 0.08, head: 0.07, leg: 0.12, col: [0.5, 0.42, 0.33], belly: [0.85, 0.82, 0.78], hp: 8, speed: 9, wary: 25, pelt: 15, regions: ['Redgrass Plains', 'Calvera River', 'Mill Creek'] },
  turkey: { name: 'Wild turkey', L: 0.7, h: 0.55, girth: 0.22, neck: 0.35, head: 0.06, leg: 0.42, col: [0.22, 0.18, 0.12], belly: [0.3, 0.24, 0.16], hp: 20, speed: 8, wary: 45, pelt: 45, bird: true, regions: ['Redgrass Plains', 'Pinewood Hollow'] },
  gator: { name: 'American alligator', L: 3.2, h: 0.22, girth: 0.28, neck: 0.2, head: 0.25, leg: 0.22, col: [0.12, 0.14, 0.09], belly: [0.55, 0.52, 0.4], hp: 160, speed: 5, wary: 18, pelt: 420, aggro: 0.9, dmg: 30, gator: true, regions: ['Bayou Verde'] },
  bear: { name: 'Black bear', L: 1.7, h: 0.9, girth: 0.45, neck: 0.3, head: 0.24, leg: 0.6, col: [0.06, 0.05, 0.05], belly: [0.1, 0.08, 0.07], hp: 220, speed: 10, wary: 30, pelt: 650, aggro: 0.7, dmg: 35, regions: ['Pinewood Hollow', 'Sierra Norte'], rare: true },
};

function buildAnimal(sp, q) {
  const s = SPECIES[sp];
  const L2 = s.L / 2, y0 = s.leg + s.girth * 0.6;
  const parts = [];
  const ell = (cx, cy, cz, rx, ry, rz) => (x, y, z) => { const qx = (x - cx) / rx, qy = (y - cy) / ry, qz = (z - cz) / rz; const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz), k1 = Math.sqrt((qx / rx) ** 2 + (qy / ry) ** 2 + (qz / rz) ** 2) || 1e-6; return k0 * (k0 - 1) / k1; };
  parts.push({ kind: 'body', d: ell(0, y0, 0, s.girth * (s.gator ? 1.3 : 1), s.girth * (s.gator ? 0.7 : 1), L2), k: 0.08 });
  if (s.gator) parts.push({ kind: 'body', d: ell(0, y0 - 0.02, -L2 - 0.5, 0.15, 0.1, 0.9), k: 0.15 }, { kind: 'head', d: ell(0, y0, L2 + 0.35, 0.16, 0.09, 0.5), k: 0.1 });
  else {
    const nx = L2 * 0.85, ny = y0 + s.neck * 0.8;
    parts.push({ kind: 'body', d: (x, y, z) => { const t = Math.max(0, Math.min(1, ((z - L2 * 0.6) * (nx - L2 * 0.6) + (y - y0) * (ny - y0)) / ((nx - L2 * 0.6) ** 2 + (ny - y0) ** 2))); return hyp2(x, Math.hypot(y - (y0 + (ny - y0) * t), z - (L2 * 0.6 + (nx - L2 * 0.6) * t))) - s.girth * (0.55 - t * 0.2); }, k: 0.1 });
    parts.push({ kind: 'head', d: ell(0, ny + s.head * 0.2, nx + s.head * 0.8, s.head * 0.7, s.head * 0.75, s.head * 1.4), k: 0.06 });
    if (!s.bird) parts.push({ kind: 'ear', d: (x, y, z) => ell(s.head * 0.45, ny + s.head * 1.0, nx + s.head * 0.3, s.head * 0.18, s.head * 0.45, s.head * 0.12)(Math.abs(x), y, z) });
    if (s.bird) parts.push({ kind: 'tail', d: ell(0, y0 + 0.25, -L2 - 0.05, 0.3, 0.3, 0.06) }, { kind: 'beak', d: ell(0, ny, nx + s.head * 2.2, 0.03, 0.02, 0.05) });
    else parts.push({ kind: 'tail', d: ell(0, y0 + s.girth * 0.4, -L2 - 0.02, s.girth * 0.25, s.girth * 0.35, s.girth * 0.25) });
    if (s.antlers) for (let k = 0; k < 4; k++) parts.push({ kind: 'antler', d: (x, y, z) => roundBox(0.12 + k * 0.04, ny + s.head + 0.12 + k * 0.05, nx + 0.08 - k * 0.04, 0.015, 0.1, 0.015, 0.01)(Math.abs(x), y, z) });
  }
  const h = Math.max(0.025, s.L / 70) * (q && q.key === 'phone' ? 1.5 : 1);
  const colorOf = (kind, x, y) => kind === 'antler' ? [[0.55, 0.48, 0.38], 0.7, 0] : kind === 'beak' ? [[0.7, 0.6, 0.3], 0.5, 0] : [y < y0 - s.girth * 0.3 || kind === 'tail' && !s.bird ? s.belly : s.col, s.gator ? 0.45 : 0.9, 0];
  const mesh = partMesh(parts, [[-s.girth * 2 - 0.4, 0, -L2 - (s.gator ? 1.5 : 0.4)], [s.girth * 2 + 0.4, y0 + s.neck + s.head * 3 + 0.5, L2 + s.head * 3 + 0.6]], h, colorOf, false);
  mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...s.col).multiplyScalar(0.8), roughness: 0.9 });
  const legs = [];
  for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx * s.girth * 0.55, y0, lz * L2 * 0.65);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(s.girth * 0.16, s.girth * 0.09, s.leg + s.girth * 0.4, 6).translate(0, -(s.leg + s.girth * 0.4) / 2, 0), legMat);
    leg.castShadow = true; pivot.add(leg); g.add(pivot); legs.push(pivot);
  }
  return { g, legs };
}

class Animal {
  constructor(sp, x, z, hm, q) {
    this.sp = sp; this.s = SPECIES[sp];
    const m = buildAnimal(sp, q);
    this.group = m.g; this.legs = m.legs;
    this.pos = new THREE.Vector3(x, hm.height(x, z), z);
    this.heading = Math.random() * Math.PI * 2; this.speed = 0; this.mode = 'graze'; this.t = Math.random() * 4; this.phase = 0;
    this.hp = this.s.hp; this.dead = false; this.radius = Math.max(0.25, this.s.girth * 1.6); this.attackT = 0;
  }
  center() { return this.pos.clone().setY(this.pos.y + this.s.leg + this.s.girth * 0.5); }
  hurt(d) {
    if (this.dead) return false;
    this.hp -= d; this.mode = this.s.aggro && Math.random() < this.s.aggro ? 'charge' : 'flee'; this.t = 6;
    if (this.hp <= 0) { this.dead = true; this.speed = 0; this.group.rotation.z = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); this.group.position.y += this.s.girth * 0.4; return true; }
    return false;
  }
  update(dt, hm, player, hunt) {
    if (this.dead) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const noise = hunt.noise * (player.sneak ? 0.5 : 1);
    if ((this.mode === 'graze' || this.mode === 'walk') && d < this.s.wary * noise) { this.mode = this.s.aggro && Math.random() < this.s.aggro * 0.6 && d < 25 ? 'charge' : 'flee'; this.t = 8; }
    this.t -= dt;
    let target = 0;
    if (this.mode === 'flee') { this.heading = Math.atan2(-dx, -dz) + Math.sin(this.t * 1.3) * 0.4; target = this.s.speed; if (this.t < 0 && d > this.s.wary * 1.5) this.mode = 'graze'; }
    else if (this.mode === 'charge') {
      this.heading = Math.atan2(dx, dz); target = this.s.speed * 1.1;
      if (d < 1.6 + this.s.L * 0.5 && (this.attackT -= dt) <= 0) { this.attackT = 1.2; hunt.bite(this.s.dmg); }
      if (this.t < 0 || d > 60) this.mode = 'flee';
    } else if (this.mode === 'walk') { target = this.s.speed * 0.18; if (this.t < 0) { this.mode = 'graze'; this.t = 3 + Math.random() * 6; } }
    else { if (this.t < 0) { this.mode = 'walk'; this.t = 3 + Math.random() * 5; this.heading += (Math.random() - 0.5) * 2; } }
    this.speed += (target - this.speed) * Math.min(1, dt * 3);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const wet = hm.waterLevel(nx, nz) - hm.height(nx, nz) > 0.6;
    if (!wet || this.s.gator) { this.pos.x = nx; this.pos.z = nz; } else this.heading += 1.5;
    this.pos.y = this.s.gator ? Math.max(hm.height(this.pos.x, this.pos.z), hm.waterLevel(this.pos.x, this.pos.z) - 0.25) : hm.height(this.pos.x, this.pos.z);
    this.phase += dt * (2 + this.speed * 1.4);
    const amp = Math.min(0.9, this.speed * 0.08) + (this.mode === 'graze' ? 0 : 0.05);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}

export function installHunting(game) {
  const { career, interact, hud, scene, hm, player } = game;
  const P = career.p;
  const list = [];
  let lastShotCooldown = 0, carcassPoint = null;
  const hunt = {
    noise: 1,
    bite(dmg) { if (game.S.mode !== 'foot') return; player.health -= dmg; game.S.dmgFlash = 1; hud.toast('You were attacked!', 1); },
  };
  const spawn = (sp, x, z) => { const a = new Animal(sp, x, z, hm, game.q); scene.add(a.group); list.push(a); return a; };
  const pickSpecies = (region) => {
    const opts = Object.entries(SPECIES).filter(([, s]) => s.regions.includes(region) && (!s.rare || Math.random() < 0.15));
    return opts.length ? opts[(Math.random() * opts.length) | 0][0] : null;
  };
  let spawnT = 0;
  const maxN = { phone: 6, low: 8, medium: 12, high: 16, ultra: 22 }[game.q.key] || 12;

  // trading posts buy pelts and meat
  const PELT_PRICE = Object.fromEntries(Object.entries(SPECIES).map(([k, s]) => [k, s.pelt]));
  const post = new ShopUI({
    title: 'Redgrass Trading Post', getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'sell', label: 'Sell pelts' }, { k: 'guide', label: 'Hunting guide' }],
    note: (t) => t === 'sell' ? 'Pelts skinned with a better knife sell for more. Calls (Hunting tools) draw animals to you.' : 'Where each animal lives and what it pays.',
    items: (t) => t === 'sell' ? Object.entries(P.pelts).filter(([, n]) => n > 0).map(([k, n]) => ({ k, n })) : Object.entries(SPECIES).map(([k, s]) => ({ k, s })),
    row: (it, t) => t === 'sell'
      ? { name: `${SPECIES[it.k].name} pelt × ${it.n}`, sub: 'quality by knife', stats: [], btn: `Sell ${money(PELT_PRICE[it.k] * it.n)}` }
      : { name: it.s.name, sub: it.s.regions.join(', '), stats: [['HP', it.s.hp / 220], ['Danger', it.s.aggro || 0]], btn: money(it.s.pelt), cls: 'own' },
    act: (it, t) => { if (t === 'sell') { career.earn(PELT_PRICE[it.k] * it.n, 'pelts'); P.pelts[it.k] = 0; career.saveSoon(); } },
  });
  for (const [x, z, name] of [[PLAINS.x - 120, PLAINS.z + 60, 'Redgrass Trading Post'], [BAYOU.x + 200, BAYOU.z - 220, 'Bayou Fur & Hide'], [FOREST.x + 300, FOREST.z + 260, 'Pinewood Game Warden']]) {
    interact.add({ x, z, label: () => `${keyHint(game)} trade at ${name}`, color: 0xc08040, blip: { color: '#c08040', size: 5, global: true }, use: () => post.show('sell', name) });
  }

  return {
    list, species: SPECIES,
    call(kind) {
      const sp = kind === 'any' ? pickSpecies(regionAt(player.pos.x, player.pos.z).name) || 'deer' : kind;
      for (let i = 0; i < 2 + Math.random() * 2; i++) { const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 30; const an = spawn(sp, player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r); an.heading = Math.atan2(-Math.cos(a), -Math.sin(a)); an.mode = 'walk'; an.t = 12; }
      hud.toast('You hear something answer the call…', 2);
    },
    spawn,
    update(dt, a, free) {
      // gunshots scare everything nearby
      const cd = game.combat.cooldown;
      if (cd > lastShotCooldown + 0.05 && !game.combat.def.silent && !game.combat.def.melee) hunt.noise = 3;
      lastShotCooldown = cd;
      hunt.noise = Math.max(1, hunt.noise - dt * 0.3);
      // population around the player
      if ((spawnT -= dt) <= 0 && !game.S.indoors) {
        spawnT = 2;
        const region = regionAt(player.pos.x, player.pos.z).name;
        const alive = list.filter((x) => !x.dead).length;
        if (alive < maxN) {
          const sp = pickSpecies(region);
          if (sp) { const ang = Math.random() * Math.PI * 2, r = 90 + Math.random() * 120, x = player.pos.x + Math.cos(ang) * r, z = player.pos.z + Math.sin(ang) * r; if (hm.waterLevel(x, z) - hm.height(x, z) < 0.3 || SPECIES[sp].gator) spawn(sp, x, z); }
        }
        for (let i = list.length - 1; i >= 0; i--) if (list[i].pos.distanceTo(player.pos) > 420) { scene.remove(list[i].group); list.splice(i, 1); }
      }
      for (const an of list) an.update(dt, hm, player, hunt);
      // skin a carcass you are standing next to
      if (game.S.mode !== 'foot') return '';
      const c = list.find((x) => x.dead && x.pos.distanceTo(player.pos) < 2.4);
      if (!c) return '';
      const knife = game.tools.best('knife');
      if (!knife) return `${c.s.name} — buy a knife to skin it (Hunting tools)`;
      if (a.enter && free) {
        P.pelts[c.sp] = (P.pelts[c.sp] || 0) + 1; P.stats.animals++;
        scene.remove(c.group); list.splice(list.indexOf(c), 1);
        hud.toast(`Skinned: ${c.s.name} pelt`, 1.6); career.saveSoon();
        return '';
      }
      return `${keyHint(game)} skin the ${c.s.name}`;
    },
  };
}
