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
  deer: { name: 'White-tailed doe', model: Q('animals_pack', 'Deer'), h: 1.45, hp: 50, speed: 11, wary: 70, pelt: 90, clips: QC, regions: ['Redgrass Plains', 'Pinewood Hollow', 'Calvera River', 'Calvera County', 'Bayou Verde'] },
  stag: { name: 'White-tailed buck', model: Q('animals_pack', 'Stag'), h: 1.85, hp: 70, speed: 11, wary: 80, pelt: 160, clips: QC, regions: ['Redgrass Plains', 'Pinewood Hollow', 'Calvera River', 'Calvera County'] },
  coyote: { name: 'Coyote', model: Q('animals_pack', 'Wolf'), h: 0.85, hp: 35, speed: 12, wary: 55, pelt: 60, aggro: 0.25, dmg: 8, clips: ['AnimalArmature|Idle', 'AnimalArmature|Walk', 'AnimalArmature|Gallop', 'AnimalArmature|Eating', 'AnimalArmature|Death', 'AnimalArmature|Attack'], regions: ['Redgrass Plains', 'Sierra Norte', 'Pinewood Hollow'] },
  fox: { name: 'Red fox', model: K('Fox'), h: 0.55, hp: 20, speed: 10, wary: 40, pelt: 75, clips: ['Survey', 'Walk', 'Run', 'Survey', null, null], regions: ['Pinewood Hollow', 'Calvera River', 'Calvera County', 'Mill Creek', 'Bayou Verde'] },
  horse: { name: 'Wild mustang', model: Q('animals_pack', 'Horse'), h: 2.2, hp: 120, speed: 14, wary: 60, pelt: 0, protected: true, clips: QC, regions: ['Redgrass Plains', 'Sierra Norte'] },
  cow: { name: 'Longhorn cow', model: Q('animals_pack', 'Cow'), h: 1.7, hp: 140, speed: 6, wary: 12, pelt: 0, protected: true, clips: QC, regions: ['Redgrass Plains'], herd: true },
  bull: { name: 'Longhorn bull', model: Q('animals_pack', 'Bull'), h: 1.85, hp: 200, speed: 9, wary: 18, pelt: 0, protected: true, aggro: 0.6, dmg: 25, clips: QC, regions: ['Redgrass Plains'], herd: true, rare: true },
};
// meat off the carcass (lb) and when each is about (deer at dawn and dusk, coyotes and foxes at night)
const MEAT = { deer: 45, stag: 70, cow: 0, bull: 0, horse: 0, coyote: 0, fox: 0 };
const ACTIVE = { deer: 'dusk', stag: 'dusk', coyote: 'night', fox: 'night' };
// Legendary animals: one of each, in one place, rarely about. Bigger, warier, worth a lot.
export const LEGENDS = {
  paleBuck: { base: 'stag', name: 'The Pale Buck', h: 2.25, hp: 170, wary: 120, pelt: 900, tint: 0xf4f0e6, region: 'Pinewood Hollow', rumour: 'A white buck, seen at first light up in Pinewood Hollow. Nobody\'s got close.' },
  oldScar: { base: 'coyote', name: 'Old Scar', h: 1.15, hp: 130, wary: 70, pelt: 650, aggro: 0.95, dmg: 16, tint: 0x6b5644, region: 'Sierra Norte', rumour: 'A big grey coyote with a torn face, running the high ground in the Sierra Norte. He doesn\'t run from people.' },
  ember: { base: 'fox', name: 'Ember', h: 0.72, hp: 50, wary: 95, pelt: 600, tint: 0xd9541a, region: 'Bayou Verde', rumour: 'A fox redder than any you\'ve seen, out in Bayou Verde after dark.' },
};
for (const [id, L] of Object.entries(LEGENDS)) SPECIES[id] = { ...SPECIES[L.base], ...L, regions: [L.region], legend: true, rare: true, protected: false, aggro: L.aggro ?? SPECIES[L.base].aggro };
const QUALITY = ['', 'poor', 'good', 'perfect'], QMULT = [0, 0.45, 0.8, 1.25];

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
    this.hits = 0; this.bleed = false; this.quality = 3; this.deadT = 0; this.dripT = 0;
    if (this.s.tint) this.group.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.lerp(new THREE.Color(this.s.tint), 0.75); } });
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
  hurt(d, w) {
    if (this.dead) return false;
    this.hp -= d; this.hits++; this.mode = this.s.aggro && Math.random() < this.s.aggro ? 'charge' : 'flee'; this.t = 6;
    // the pelt: one clean shot from the right calibre is perfect; more holes or too big a gun spoil it
    const big = d / this.s.hp;
    this.quality = Math.min(this.quality, w?.melee ? 3 : big > 4 ? 1 : this.hits === 1 && big < 2.6 ? 3 : this.hits <= 2 ? 2 : 1);
    if (this.hp <= 0) { this.die(w); return true; }
    if (this.hp < this.s.hp * 0.75) this.bleed = true; // a wounded animal runs, slows, and leaves a trail
    return false;
  }
  die(w) {
    this.dead = true; this.speed = 0; this.hp = 0;
    if (this.actions.death) this.play('death', 0.1); else { this.group.rotation.z = Math.PI / 2; if (this.cur) this.cur.stop(); }
    this.hunt?.onKill?.(this, w);
  }
  update(dt, hm, player, hunt) {
    this.mixer.update(dt);
    if (this.dead) { this.deadT += dt; this.group.position.copy(this.pos); return; }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    // they smell you downwind and barely notice you upwind; walking softly halves your noise
    // hearing (your noise; quieter upwind) and smell (only downwind, however softly you walk)
    const wk = hunt.windK ? hunt.windK(-dx / (d || 1), -dz / (d || 1)) : 1;
    const sense = Math.max(this.s.wary * hunt.noise * (wk < 1 ? 0.8 : 1), wk > 1 ? this.s.wary * wk : 0);
    if ((this.mode === 'graze' || this.mode === 'walk') && d < sense) { this.mode = this.s.aggro && Math.random() < this.s.aggro * 0.6 && d < 25 ? 'charge' : 'flee'; this.t = 8; }
    if (this.bleed) {
      this.hp -= this.s.hp * 0.014 * dt; // bleeding out (about a minute)
      if ((this.dripT -= dt) <= 0 && this.speed > 0.5) { this.dripT = 0.45; hunt.drip?.(this.pos.x, this.pos.z); }
      if (this.hp <= 0) { this.die(null); return; }
    }
    this.t -= dt;
    let target = 0;
    if (this.mode === 'flee') { this.heading = Math.atan2(-dx, -dz) + Math.sin(this.t * 1.3) * 0.4; target = this.s.speed; if (this.t < 0 && d > this.s.wary * 1.5) this.mode = 'graze'; }
    else if (this.mode === 'charge') {
      this.heading = Math.atan2(dx, dz); target = this.s.speed * 1.05;
      if (d < 1.4 + this.size.z * 0.5 && (this.attackT -= dt) <= 0) { this.attackT = 1.2; hunt.bite(this.s.dmg || 5); this.play('attack', 0.1); }
      if (this.t < 0 || d > 60) this.mode = 'flee';
    } else if (this.mode === 'walk') { target = this.s.speed * 0.14; if (this.t < 0) { this.mode = 'graze'; this.t = 4 + Math.random() * 8; } }
    else if (this.t < 0) { this.mode = 'walk'; this.t = 3 + Math.random() * 5; this.heading += (Math.random() - 0.5) * 2; }
    if (this.bleed) target *= 0.5 + 0.5 * Math.max(0, this.hp / this.s.hp);
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
  P.peltVal = P.peltVal || {}; P.meat = P.meat || 0; P.legends = P.legends || {};
  const list = [];
  let lastShotCooldown = 0;
  // the wind: a slow drift of direction and strength (blowing towards wind.x/z)
  const wind = { a: Math.random() * 6.28, x: 1, z: 0, kmh: 8 };
  const hunt = {
    noise: 1, wind,
    bite(dmg) { if (game.S.mode !== 'foot') return; player.health -= dmg; game.S.dmgFlash = 1; hud.toast('You were attacked!', 1); },
    // (ux, uz): from you to the animal. Wind carrying your scent to it: it knows you're there.
    windK(ux, uz) { const k = ux * wind.x + uz * wind.z; return k > 0.45 ? 1.4 + wind.kmh / 25 : k < -0.3 ? 0.6 : 1; },
    drip: null, // blood trail (systems/wilds.js)
    onKill: null,
  };
  const hourNow = () => game.sky?.hour ?? 12;
  const phase = () => { const h = hourNow(); return h < 5 || h > 21 ? 'night' : (h < 8.5 || h > 17.5) ? 'dusk' : 'day'; };
  // load the animal models in the background
  for (const s of Object.values(SPECIES)) loadOpen(s.model);
  const spawn = (sp, x, z) => {
    const g = loaded(SPECIES[sp].model);
    if (!g) return null;
    const a = new Animal(sp, x, z, hm, g);
    a.hunt = hunt;
    scene.add(a.group); list.push(a);
    return a;
  };
  const pickSpecies = (region) => {
    const ph = phase();
    const opts = Object.entries(SPECIES).filter(([, s]) => !s.legend && s.regions.includes(region) && (!s.rare || Math.random() < 0.2));
    if (!opts.length) return null;
    // more of whatever is about at this hour
    const wt = opts.map(([k]) => (ACTIVE[k] === ph ? 2.5 : ACTIVE[k] === 'night' && ph === 'day' ? 0.5 : 1));
    let r = Math.random() * wt.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) if ((r -= wt[i]) <= 0) return opts[i][0];
    return opts[0][0];
  };
  let spawnT = 0, legendT = 20;
  const maxN = { phone: 6, low: 8, medium: 12, high: 16, ultra: 22 }[game.q.key] || 12;

  const post = new ShopUI({
    title: 'Redgrass Trading Post', getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'sell', label: 'Sell pelts' }, { k: 'meat', label: 'Meat' }, { k: 'guide', label: 'Wildlife guide' }, { k: 'legend', label: 'Rumours' }, { k: 'lic', label: 'Licence' }],
    note: (t) => t === 'sell' ? 'A clean single shot keeps a pelt perfect. Calls draw animals in; work downwind of them. Horses and cattle are protected.'
      : t === 'meat' ? `${Math.round(P.meat)} lb of game meat in the cooler.` : t === 'legend' ? 'Talk around the stove: animals people swear they\'ve seen.'
      : t === 'lic' ? (P.huntLicence ? 'You hold a Calvera hunting licence.' : 'Hunting without a licence is poaching, if anyone sees you.') : 'Where each animal lives, when it\'s about and what it pays.',
    items: (t) => t === 'sell' ? Object.entries(P.pelts).filter(([k, n]) => n > 0 && SPECIES[k]).map(([k, n]) => ({ k, n }))
      : t === 'meat' ? [{ k: 'sellMeat' }, { k: 'cook' }]
      : t === 'legend' ? Object.entries(LEGENDS).map(([k, s]) => ({ k, s }))
      : t === 'lic' ? [{ k: 'licence' }]
      : Object.entries(SPECIES).filter(([, s]) => !s.legend).map(([k, s]) => ({ k, s })),
    row: (it, t) => t === 'sell'
      ? { name: `${SPECIES[it.k].name} pelt × ${it.n}`, sub: SPECIES[it.k].legend ? 'legendary' : 'graded by the buyer', stats: [], btn: `Sell ${money(peltValue(it.k))}` }
      : t === 'meat' ? (it.k === 'sellMeat' ? { name: 'Sell the meat', sub: `${Math.round(P.meat)} lb at $2.50/lb`, stats: [], btn: P.meat >= 1 ? `Sell ${money(Math.round(P.meat * 2.5))}` : 'None' }
        : { name: 'Have a plate cooked', sub: 'Venison over the stove (5 lb of your meat)', stats: [['Food', 0.45]], btn: P.meat >= 5 ? 'Eat · $4' : 'Need 5 lb' })
      : t === 'legend' ? { name: it.s.name, sub: P.legends[it.k] ? 'Taken' : it.s.rumour, stats: [['HP', it.s.hp / 200], ['Danger', it.s.aggro || 0]], btn: P.legends[it.k] ? 'Taken' : `${money(it.s.pelt)} pelt`, cls: 'own' }
      : t === 'lic' ? { name: 'Calvera hunting licence', sub: 'One year. Deer, buck, coyote and fox in season.', stats: [], btn: P.huntLicence ? 'Owned' : 'Buy · $40', cls: P.huntLicence ? 'own' : '' }
      : { name: it.s.name, sub: `${it.s.regions.join(', ')} · ${ACTIVE[it.k] === 'dusk' ? 'dawn and dusk' : ACTIVE[it.k] === 'night' ? 'at night' : 'all day'}`, stats: [['HP', it.s.hp / 200], ['Danger', it.s.aggro || 0]], btn: it.s.protected ? 'Protected' : money(it.s.pelt), cls: 'own' },
    act: (it, t) => {
      if (t === 'sell') { career.earn(peltValue(it.k), 'pelts'); P.pelts[it.k] = 0; P.peltVal[it.k] = 0; career.saveSoon(); }
      else if (t === 'meat' && it.k === 'sellMeat' && P.meat >= 1) { career.earn(Math.round(P.meat * 2.5), 'meat'); P.meat = 0; career.saveSoon(); }
      else if (t === 'meat' && it.k === 'cook' && P.meat >= 5 && career.money >= 4) { career.spend(4); P.meat -= 5; const N = game.needs?.N; if (N) N.food = Math.min(100, N.food + 45); hud.toast('Venison, beans and cornbread. You feel better.', 2.2); career.saveSoon(); }
      else if (t === 'lic' && !P.huntLicence && career.money >= 40) { career.spend(40); P.huntLicence = true; hud.toast('Licensed to hunt in Calvera.', 2); career.saveSoon(); }
    },
    // the animal itself on the stand (the wildlife guide, and whose pelt you're selling)
    model: (it) => { const s = SPECIES[it.k], g = s && loaded(s.model); if (!g) return null; const m = instance(g, s.h, 'y'); if (s.tint) m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.lerp(new THREE.Color(s.tint), 0.75); } }); return m; }, key: (it) => it.k,
  });
  // older saves kept a count only: price those at "good"
  const peltValue = (k) => Math.round(P.peltVal[k] || SPECIES[k].pelt * (P.pelts[k] || 0) * QMULT[2]);
  for (const [x, z, name] of [[PLAINS.x - 120, PLAINS.z + 60, 'Redgrass Trading Post'], [BAYOU.x + 200, BAYOU.z - 220, 'Bayou Fur & Hide'], [FOREST.x + 300, FOREST.z + 260, 'Pinewood Game Warden']]) {
    interact.add({ x, z, label: () => `${keyHint(game)} trade at ${name}`, color: 0xc08040, blip: { color: '#c08040', size: 5, global: true, icon: '🏕️', badge: 'S' }, use: () => post.show('sell', name) });
  }

  return {
    list, species: SPECIES, post, hunt, wind, legends: LEGENDS, phase,
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
      // walking softly (slow, not in a vehicle) and you can get much closer; running, they hear you coming
      const sp = player.speed || 0;
      hunt.quiet = game.S.mode === 'foot' && sp < 2.2 ? 0.55 : sp > 5.5 ? 1.35 : 1;
      wind.a += (Math.sin(performance.now() * 0.00004) * 0.02 + (Math.random() - 0.5) * 0.01) * dt * 10;
      wind.x = Math.sin(wind.a); wind.z = Math.cos(wind.a);
      wind.kmh = Math.max(2, Math.min(40, (game.weather?.kind === 'storm' ? 32 : game.weather?.rain > 0.3 ? 18 : 8) + Math.sin(performance.now() * 0.0001) * 4));
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
      const n0 = hunt.noise; hunt.noise = n0 * (hunt.quiet || 1);
      for (const an of list) an.update(dt, hm, player, hunt);
      hunt.noise = n0;
      // a legendary animal, now and then, in its own country (likelier at its hour)
      if ((legendT -= dt) <= 0 && !game.S.indoors) {
        legendT = 45;
        const region = regionAt(player.pos.x, player.pos.z).name;
        for (const [id, L] of Object.entries(LEGENDS)) {
          if (P.legends[id] || L.region !== region || list.some((x) => x.sp === id && !x.dead)) continue;
          if (Math.random() > (ACTIVE[L.base] === phase() ? 0.35 : 0.08)) continue;
          const ang = Math.random() * Math.PI * 2, r = 130 + Math.random() * 70, x = player.pos.x + Math.cos(ang) * r, z = player.pos.z + Math.sin(ang) * r;
          if (hm.waterLevel(x, z) - hm.height(x, z) > 0.2) continue;
          const an = spawn(id, x, z);
          if (an) hud.toast(L.base === 'stag' ? 'Fresh tracks, bigger than any buck\'s. Something is out here.' : L.base === 'coyote' ? 'A long howl, close. It doesn\'t sound like the others.' : 'A flash of red at the edge of the trees.', 3.2);
        }
      }
      if (game.S.mode !== 'foot') return '';
      const c = list.find((x) => x.dead && x.pos.distanceTo(player.pos) < 2.8);
      if (!c) return '';
      if (c.s.protected) return `${c.s.name} — protected animal, no pelt`;
      if (!game.tools.best('knife')) return `${c.s.name} — buy a knife to skin it (Hunting tools)`;
      const q = c.quality || 2, stars = '★'.repeat(q) + '☆'.repeat(3 - q);
      if (a.enter && free && game.acts && !c.skinning && game.S.mode === 'foot' && !game.S.doorWalk) {
        c.skinning = true;
        const at = c.group.position.clone();
        const run = game.acts.play(game.acts.knifeBeats(at, c.s.size > 1.3 ? 4.2 : 3.0), { done: (ok) => { c.skinning = false; if (ok) c.cut = true; } });
        if (run) { a.enter = false; return ''; }
        c.skinning = false; // (couldn't act it out: skinned on the spot)
      }
      if (c.skinning) return '';
      if ((a.enter && free) || c.cut) {
        c.cut = false;
        P.pelts[c.sp] = (P.pelts[c.sp] || 0) + 1; P.stats.animals++;
        P.peltVal[c.sp] = (P.peltVal[c.sp] || 0) + Math.round(c.s.pelt * QMULT[q]);
        const lb = Math.round((MEAT[c.s.base || c.sp] || 0) * (0.8 + Math.random() * 0.4) * (c.s.legend ? 1.4 : 1));
        P.meat += lb;
        if (c.s.legend) { P.legends[c.sp] = Date.now(); game.hud.bigMessage('LEGENDARY', `${c.s.name} · pelt ${stars}`, 3); }
        scene.remove(c.group); list.splice(list.indexOf(c), 1);
        hud.toast(`Skinned: ${c.s.name} pelt ${stars} (${QUALITY[q]})${lb ? ` · ${lb} lb of meat` : ''}`, 2.2); career.saveSoon();
        return '';
      }
      return `${keyHint(game)} skin the ${c.s.name} · pelt ${stars}`;
    },
  };
}
