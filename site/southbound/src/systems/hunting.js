// Hunting with open-source animated animals (Quaternius CC0 animals pack,
// Khronos glTF Fox): deer, stags, coyotes, foxes, wild horses and ranch cattle.
// They graze, wander, flee from noise, and some charge. Kill, skin with a
// knife, sell pelts at a trading post. Animal calls draw them in.
import * as THREE from 'three';
import { PLAINS, FOREST, BAYOU, regionAt } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { money, keyHint } from './world-util.js';
import { loadOpen, loaded, instance, Q, K } from '../assets/open.js';

// h: model height (m); clips: [idle, walk, run, eat, death, attack]
const QC = ['AnimalArmature|Idle', 'AnimalArmature|Walk', 'AnimalArmature|Gallop', 'AnimalArmature|Eating', 'AnimalArmature|Death', 'AnimalArmature|Attack_Headbutt'];
export const SPECIES = {
  deer: { name: 'White-tailed doe', model: Q('animals_pack', 'Deer'), h: 1.45, hp: 50, speed: 11, wary: 70, pelt: 90, clips: QC, regions: ['Redgrass Plains', 'Pinewood Hollow', 'Calvera River', 'Bayou Verde'] },
  stag: { name: 'White-tailed buck', model: Q('animals_pack', 'Stag'), h: 1.85, hp: 70, speed: 11, wary: 80, pelt: 160, clips: QC, regions: ['Redgrass Plains', 'Pinewood Hollow', 'Calvera River'] },
  coyote: { name: 'Coyote', model: Q('animals_pack', 'Wolf'), h: 0.85, hp: 35, speed: 12, wary: 55, pelt: 60, aggro: 0.25, dmg: 8, clips: ['AnimalArmature|Idle', 'AnimalArmature|Walk', 'AnimalArmature|Gallop', 'AnimalArmature|Eating', 'AnimalArmature|Death', 'AnimalArmature|Attack'], regions: ['Redgrass Plains', 'Sierra Norte', 'Pinewood Hollow'] },
  fox: { name: 'Red fox', model: K('Fox'), h: 0.55, hp: 20, speed: 10, wary: 40, pelt: 75, clips: ['Survey', 'Walk', 'Run', 'Survey', null, null], regions: ['Pinewood Hollow', 'Calvera River', 'Mill Creek', 'Bayou Verde'] },
  horse: { name: 'Wild mustang', model: Q('animals_pack', 'Horse'), h: 2.2, hp: 120, speed: 14, wary: 60, pelt: 0, protected: true, clips: QC, regions: ['Redgrass Plains', 'Sierra Norte'] },
  cow: { name: 'Longhorn cow', model: Q('animals_pack', 'Cow'), h: 1.7, hp: 140, speed: 6, wary: 12, pelt: 0, protected: true, clips: QC, regions: ['Redgrass Plains'], herd: true },
  bull: { name: 'Longhorn bull', model: Q('animals_pack', 'Bull'), h: 1.85, hp: 200, speed: 9, wary: 18, pelt: 0, protected: true, aggro: 0.6, dmg: 25, clips: QC, regions: ['Redgrass Plains'], herd: true, rare: true },
};

class Animal {
  constructor(sp, x, z, hm, g) {
    this.sp = sp; this.s = SPECIES[sp];
    this.group = instance(g, this.s.h, 'y');
    this.size = this.group.userData.size;
    this.mixer = new THREE.AnimationMixer(this.group);
    this.actions = {};
    const byName = new Map(g.animations.map((c) => [c.name, c]));
    ['idle', 'walk', 'run', 'eat', 'death', 'attack'].forEach((k, i) => { const c = byName.get(this.s.clips[i]); if (c) this.actions[k] = this.mixer.clipAction(c); });
    this.pos = new THREE.Vector3(x, hm.height(x, z), z);
    this.heading = Math.random() * Math.PI * 2; this.speed = 0; this.mode = 'graze'; this.t = Math.random() * 4;
    this.hp = this.s.hp; this.dead = false; this.radius = Math.max(0.3, Math.max(this.size.x, this.size.z) * 0.35); this.attackT = 0;
    this.play('eat');
  }
  play(k, fade = 0.25) {
    const a = this.actions[k] || this.actions.idle;
    if (!a || a === this.cur) return;
    a.reset().fadeIn(fade).play();
    if (k === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a;
  }
  center() { return this.pos.clone().setY(this.pos.y + this.size.y * 0.55); }
  hurt(d) {
    if (this.dead) return false;
    this.hp -= d; this.mode = this.s.aggro && Math.random() < this.s.aggro ? 'charge' : 'flee'; this.t = 6;
    if (this.hp <= 0) {
      this.dead = true; this.speed = 0;
      if (this.actions.death) this.play('death', 0.1); else { this.group.rotation.z = Math.PI / 2; if (this.cur) this.cur.stop(); }
      return true;
    }
    return false;
  }
  update(dt, hm, player, hunt) {
    this.mixer.update(dt);
    if (this.dead) { this.group.position.copy(this.pos); return; }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if ((this.mode === 'graze' || this.mode === 'walk') && d < this.s.wary * hunt.noise) { this.mode = this.s.aggro && Math.random() < this.s.aggro * 0.6 && d < 25 ? 'charge' : 'flee'; this.t = 8; }
    this.t -= dt;
    let target = 0;
    if (this.mode === 'flee') { this.heading = Math.atan2(-dx, -dz) + Math.sin(this.t * 1.3) * 0.4; target = this.s.speed; if (this.t < 0 && d > this.s.wary * 1.5) this.mode = 'graze'; }
    else if (this.mode === 'charge') {
      this.heading = Math.atan2(dx, dz); target = this.s.speed * 1.05;
      if (d < 1.4 + this.size.z * 0.5 && (this.attackT -= dt) <= 0) { this.attackT = 1.2; hunt.bite(this.s.dmg || 5); this.play('attack', 0.1); }
      if (this.t < 0 || d > 60) this.mode = 'flee';
    } else if (this.mode === 'walk') { target = this.s.speed * 0.14; if (this.t < 0) { this.mode = 'graze'; this.t = 4 + Math.random() * 8; } }
    else if (this.t < 0) { this.mode = 'walk'; this.t = 3 + Math.random() * 5; this.heading += (Math.random() - 0.5) * 2; }
    this.speed += (target - this.speed) * Math.min(1, dt * 3);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    if (hm.waterLevel(nx, nz) - hm.height(nx, nz) < 0.5) { this.pos.x = nx; this.pos.z = nz; } else this.heading += 1.5;
    this.pos.y = hm.height(this.pos.x, this.pos.z);
    const k = this.mode === 'charge' || this.speed > this.s.speed * 0.4 ? 'run' : this.speed > 0.3 ? 'walk' : this.mode === 'graze' ? 'eat' : 'idle';
    if (!(this.cur === this.actions.attack && this.attackT > 0.6)) this.play(k);
    if (this.cur) this.cur.timeScale = k === 'run' ? Math.max(0.7, this.speed / this.s.speed * 1.2) : 1;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}

export function installHunting(game) {
  const { career, interact, hud, scene, hm, player } = game;
  const P = career.p;
  const list = [];
  let lastShotCooldown = 0;
  const hunt = {
    noise: 1,
    bite(dmg) { if (game.S.mode !== 'foot') return; player.health -= dmg; game.S.dmgFlash = 1; hud.toast('You were attacked!', 1); },
  };
  // load the animal models in the background
  for (const s of Object.values(SPECIES)) loadOpen(s.model);
  const spawn = (sp, x, z) => {
    const g = loaded(SPECIES[sp].model);
    if (!g) return null;
    const a = new Animal(sp, x, z, hm, g);
    scene.add(a.group); list.push(a);
    return a;
  };
  const pickSpecies = (region) => {
    const opts = Object.entries(SPECIES).filter(([, s]) => s.regions.includes(region) && (!s.rare || Math.random() < 0.2));
    return opts.length ? opts[(Math.random() * opts.length) | 0][0] : null;
  };
  let spawnT = 0;
  const maxN = { phone: 6, low: 8, medium: 12, high: 16, ultra: 22 }[game.q.key] || 12;

  const post = new ShopUI({
    title: 'Redgrass Trading Post', getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'sell', label: 'Sell pelts' }, { k: 'guide', label: 'Wildlife guide' }],
    note: (t) => t === 'sell' ? 'Calls (Hunting tools) draw animals to you. Horses and cattle are protected.' : 'Where each animal lives and what it pays.',
    items: (t) => t === 'sell' ? Object.entries(P.pelts).filter(([k, n]) => n > 0 && SPECIES[k]).map(([k, n]) => ({ k, n })) : Object.entries(SPECIES).map(([k, s]) => ({ k, s })),
    row: (it, t) => t === 'sell'
      ? { name: `${SPECIES[it.k].name} pelt × ${it.n}`, sub: 'quality by knife', stats: [], btn: `Sell ${money(SPECIES[it.k].pelt * it.n)}` }
      : { name: it.s.name, sub: it.s.regions.join(', '), stats: [['HP', it.s.hp / 200], ['Danger', it.s.aggro || 0]], btn: it.s.protected ? 'Protected' : money(it.s.pelt), cls: 'own' },
    act: (it, t) => { if (t === 'sell') { career.earn(SPECIES[it.k].pelt * it.n, 'pelts'); P.pelts[it.k] = 0; career.saveSoon(); } },
  });
  for (const [x, z, name] of [[PLAINS.x - 120, PLAINS.z + 60, 'Redgrass Trading Post'], [BAYOU.x + 200, BAYOU.z - 220, 'Bayou Fur & Hide'], [FOREST.x + 300, FOREST.z + 260, 'Pinewood Game Warden']]) {
    interact.add({ x, z, label: () => `${keyHint(game)} trade at ${name}`, color: 0xc08040, blip: { color: '#c08040', size: 5, global: true, icon: '🏕️' }, use: () => post.show('sell', name) });
  }

  return {
    list, species: SPECIES, post,
    call(kind) {
      const region = regionAt(player.pos.x, player.pos.z).name;
      const sp = kind === 'any' || !SPECIES[kind] ? (pickSpecies(region) || 'deer') : kind;
      let n = 0;
      for (let i = 0; i < 2 + Math.random() * 2; i++) { const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 30; const an = spawn(sp, player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r); if (an) { an.heading = Math.atan2(-Math.cos(a), -Math.sin(a)); an.mode = 'walk'; an.t = 12; n++; } }
      hud.toast(n ? 'You hear something answer the call…' : 'Nothing answers out here', 2);
    },
    spawn,
    update(dt, a, free) {
      const cd = game.combat.cooldown;
      if (cd > lastShotCooldown + 0.05 && !game.combat.def.silent && !game.combat.def.melee) hunt.noise = 3;
      lastShotCooldown = cd;
      hunt.noise = Math.max(1, hunt.noise - dt * 0.3);
      if ((spawnT -= dt) <= 0 && !game.S.indoors) {
        spawnT = 2;
        const region = regionAt(player.pos.x, player.pos.z).name;
        if (list.filter((x) => !x.dead).length < maxN) {
          const sp = pickSpecies(region);
          if (sp) {
            const ang = Math.random() * Math.PI * 2, r = 90 + Math.random() * 120, x = player.pos.x + Math.cos(ang) * r, z = player.pos.z + Math.sin(ang) * r;
            if (hm.waterLevel(x, z) - hm.height(x, z) < 0.3) {
              const n = SPECIES[sp].herd ? 3 + Math.floor(Math.random() * 3) : 1;
              for (let i = 0; i < n; i++) spawn(sp, x + (Math.random() - 0.5) * 14, z + (Math.random() - 0.5) * 14);
            }
          }
        }
        for (let i = list.length - 1; i >= 0; i--) if (list[i].pos.distanceTo(player.pos) > 420) { scene.remove(list[i].group); list.splice(i, 1); }
      }
      for (const an of list) an.update(dt, hm, player, hunt);
      if (game.S.mode !== 'foot') return '';
      const c = list.find((x) => x.dead && x.pos.distanceTo(player.pos) < 2.8);
      if (!c) return '';
      if (c.s.protected) return `${c.s.name} — protected animal, no pelt`;
      if (!game.tools.best('knife')) return `${c.s.name} — buy a knife to skin it (Hunting tools)`;
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
