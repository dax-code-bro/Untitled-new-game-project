#!/usr/bin/env node
/* The multiplayer tables, checked without a browser.
 *
 * mp-data.js is only data and pure functions, so it does not need a GPU
 * to be wrong. It needs a `window` to hang itself off and nothing else,
 * which is a fake object here.
 *
 * What is worth checking about a table of sixty guns is not any one
 * gun -- it is the things that are true of the whole table and that a
 * hand edit quietly breaks: duplicate ids, a class that has drifted off
 * its count, an attachment that fits nothing at all, a gun that can take
 * fewer than five parts in a screen that lets you fit five, a fold that
 * produces NaN. Every one of those is invisible until somebody is in a
 * menu wondering why the slot is empty.
 *
 * Usage: node engine/test/mpdata.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'site', 'games', 'mp-data.js');

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'mp-data.js' });
const MP = sandbox.window.MP_DATA;

check('the module loads', !!MP);

/* ---- the counts the game was asked for ---- */
/* Seventy-five. Sixty until the shotgun and sniper sections landed:
   ten more gauges and five more rifles, and the eight that were filed
   under Special moved into the two new classes rather than being
   counted twice. */
check('seventy-five guns', MP.GUNS.length === 75, `got ${MP.GUNS.length}`);
/* Eight. Six until the snipers and the shotguns came out of Special --
   ten one-shot rifles and thirteen gauges is two classes, not a note in
   a bin that also holds a crossbow and a riot shield. Special is those
   two now, and the count is asserted rather than inferred because
   every class-keyed table in the project has to be visited when it
   changes; ADS_CONE was not, and every optic in the game folded a NaN
   onto every sniper rifle until this file said so. */
check('eight classes', MP.CLASSES.length === 8, `got ${MP.CLASSES.length}`);

const byCls = {};
MP.GUNS.forEach((g) => { byCls[g.cls] = (byCls[g.cls] || 0) + 1; });
check('every gun is in a real class',
  MP.GUNS.every((g) => MP.CLASSES.some((c) => c.id === g.cls)),
  JSON.stringify(Object.keys(byCls)));
check('every class has guns in it',
  MP.CLASSES.every((c) => (byCls[c.id] || 0) > 0),
  JSON.stringify(byCls));

const barrels = MP.ATTACHMENTS.filter((a) => a.slot === 'barrel');
check('twelve barrels', barrels.length === 12, `got ${barrels.length}`);
check('dozens of attachments', MP.ATTACHMENTS.length >= 48, `got ${MP.ATTACHMENTS.length}`);
check('five killstreak slots worth to choose from',
  MP.KILLSTREAKS.length >= 10, `got ${MP.KILLSTREAKS.length}`);
check('four maps', MP.MAPS.length === 4, MP.MAPS.map((m) => m.id).join(','));
check('two modes', MP.MODES.length === 2, MP.MODES.map((m) => m.id).join(','));
check('six a side', MP.TEAM_SIZE === 6, String(MP.TEAM_SIZE));
check('three prestiges: gold, platinum, diamond',
  MP.PRESTIGE.map((p) => p.id).join(',') === 'gold,platinum,diamond');

/* ---- nothing named twice ---- */
function dupes(list, key) {
  const seen = {}, out = [];
  list.forEach((x) => { if (seen[x[key]]) out.push(x[key]); seen[x[key]] = 1; });
  return out;
}
check('no two guns share an id', dupes(MP.GUNS, 'id').length === 0, dupes(MP.GUNS, 'id').join(','));
check('no two attachments share an id',
  dupes(MP.ATTACHMENTS, 'id').length === 0, dupes(MP.ATTACHMENTS, 'id').join(','));
check('no two guns share a name', dupes(MP.GUNS, 'name').length === 0, dupes(MP.GUNS, 'name').join(','));
check('no two killstreaks share an id', dupes(MP.KILLSTREAKS, 'id').length === 0);

/* ---- the zombies-only weapons did not come across ---- */
const banned = ['paralyzer', 'arc', 'arc2', 'ram', 'obliterator'];
check('no wonder weapons in multiplayer',
  banned.every((id) => !MP.gun(id)),
  banned.filter((id) => MP.gun(id)).join(','));
check('the grounded zombies guns did come across',
  ['m1911', 'thompson', 'mp5', 'mg42', 'remington', 'scatter', 'sawnoff',
    'breakwater', 'mauser', 'blaze', 'killstreak'].every((id) => !!MP.gun(id)));
check('the Model 5 stayed', !!MP.gun('model5'));

/* ---- every slot is reachable, on something ---- */
MP.SLOTS.forEach((s) => {
  const n = MP.ATTACHMENTS.filter((a) => a.slot === s.id).length;
  check(`the ${s.id} slot has parts in it`, n > 0, String(n));
});
check('every attachment names a real slot',
  MP.ATTACHMENTS.every((a) => MP.SLOTS.some((s) => s.id === a.slot)));

/* ---- an attachment that fits nothing is a dead row in a menu ---- */
const orphans = MP.ATTACHMENTS.filter((a) => !MP.GUNS.some((g) => MP.fits(a, g)));
check('no attachment fits nothing', orphans.length === 0, orphans.map((a) => a.id).join(','));

/* ---- and a gun that can take fewer than five parts cannot fill the
   five slots the loadout screen shows it ---- */
const thin = MP.GUNS.filter((g) => !g.shield && MP.partCount(g) < MP.MAX_FITTED);
check('every gun can fill all five attachment slots', thin.length === 0,
  thin.map((g) => `${g.id}:${MP.partCount(g)}`).join(','));
const thinSlots = MP.GUNS.filter((g) => !g.shield &&
  MP.SLOTS.filter((s) => MP.partsFor(g, s.id).length > 0).length < MP.MAX_FITTED);
check('every gun has parts in at least five different slots', thinSlots.length === 0,
  thinSlots.map((g) => g.id).join(','));

/* ---- families actually mean something ---- */
check('every gun names a real family',
  MP.GUNS.every((g) => !!MP.FAMILIES[g.fam]),
  MP.GUNS.filter((g) => !MP.FAMILIES[g.fam]).map((g) => g.fam).join(','));
const shared = MP.ATTACHMENTS.filter((a) => {
  const cls = {};
  MP.GUNS.forEach((g) => { if (MP.fits(a, g)) cls[g.cls] = 1; });
  return Object.keys(cls).length > 1;
});
check('some attachments cross weapon types', shared.length >= 20, String(shared.length));
const famOnly = MP.ATTACHMENTS.filter((a) => a.fams);
check('some attachments are family-only', famOnly.length >= 4, String(famOnly.length));
/* The MP 40 is in the trench family and never took a drum. If that
   exception has been lost, the families have become a filing system. */
check('a family exception is honoured (no drum on the MP 40)',
  !MP.fits(MP.att('g-drum'), MP.gun('mp40')) && MP.fits(MP.att('g-drum'), MP.gun('thompson')));

/* ---- every fold survives being applied to every gun it fits ---- */
let nan = [];
MP.GUNS.forEach((g) => {
  MP.partsFor(g).forEach((a) => {
    const w = MP.build(g.id, [a.id]);
    for (const k in w) {
      const v = w[k];
      if (typeof v === 'number' && !isFinite(v)) nan.push(`${g.id}+${a.id}.${k}`);
      if (Array.isArray(v) && v.some((n) => typeof n === 'number' && !isFinite(n))) nan.push(`${g.id}+${a.id}.${k}[]`);
    }
  });
});
check('no attachment produces a NaN on any gun it fits', nan.length === 0, nan.slice(0, 5).join(','));

/* ---- and five at once, one per slot, still produces a gun ---- */
let fiveBad = [];
MP.GUNS.forEach((g) => {
  if (g.shield) return;
  const pick = [];
  MP.SLOTS.forEach((s) => {
    if (pick.length >= MP.MAX_FITTED) return;
    const opts = MP.partsFor(g, s.id);
    if (opts.length) pick.push(opts[0].id);
  });
  const w = MP.build(g.id, pick);
  if (!w || pick.length < MP.MAX_FITTED) { fiveBad.push(g.id + ':short'); return; }
  if (!(w.dmg > 0) || !(w.rpm > 0) || !(w.mag >= 0) || !(w.ttk >= 0)) fiveBad.push(g.id);
});
check('a full five-part build works on every gun', fiveBad.length === 0, fiveBad.slice(0, 6).join(','));

/* ---- the numbers say what the classes are supposed to say ----
   An SMG should beat an assault rifle up close and lose to it at
   distance. If that is not true of the medians the table is not
   balanced, whatever any single gun looks like. */
function median(xs) { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
const arNear = median(MP.gunsOf('assault').map((g) => MP.build(g.id, []).ttk));
const smgNear = median(MP.gunsOf('smg').map((g) => MP.build(g.id, []).ttk));
const arFar = median(MP.gunsOf('assault').map((g) => MP.build(g.id, []).far));
const smgFar = median(MP.gunsOf('smg').map((g) => MP.build(g.id, []).far));
check('SMGs kill quicker up close than rifles', smgNear < arNear, `${smgNear.toFixed(3)} vs ${arNear.toFixed(3)}`);
check('rifles reach further than SMGs', arFar > smgFar, `${arFar} vs ${smgFar}`);
const snipers = MP.GUNS.filter((g) => g.oneShot);
check('the bolt guns kill in one', snipers.length >= 4
  && snipers.every((g) => MP.build(g.id, []).dmg >= 98), String(snipers.length));

/* ---- levelling ---- */
check('level 1 costs nothing', MP.xpForLevel(1) === 0);
let rising = true;
for (let n = 2; n <= MP.MAX_LEVEL; n++) if (MP.xpForLevel(n) <= MP.xpForLevel(n - 1)) rising = false;
check('the level curve only goes up', rising);
const pr = MP.newProgress();
check('a new gun is level 1', MP.levelOf(pr) === 1);
MP.addKills(pr, 400, 0);
check('four hundred kills is max level', MP.levelOf(pr) === MP.MAX_LEVEL,
  `${MP.levelOf(pr)} at ${pr.xp} xp`);

/* Walking alone has to get there too, or a player who is bad with a gun
   can never unlock the part that would make it work for them. */
const pr2 = MP.newProgress();
MP.addMetres(pr2, 20000);
check('walking alone can max a gun out', MP.levelOf(pr2) === MP.MAX_LEVEL,
  `${MP.levelOf(pr2)} at ${pr2.xp} xp from ${pr2.metres} m`);
const pr3 = MP.newProgress();
MP.addMetres(pr3, 11000);
check('eleven kilometres is real progress', MP.levelOf(pr3) > 1 && MP.levelOf(pr3) < MP.MAX_LEVEL,
  `level ${MP.levelOf(pr3)}`);

check('progress fraction stays in range',
  MP.levelFrac(MP.newProgress()) === 0 && MP.levelFrac(pr) === 1);

/* ---- prestige ---- */
const stg = MP.gun('stg44');
check('a fresh gun has no prestige', MP.prestigeOf(stg, MP.newProgress()) === null);
const gold = MP.newProgress(); MP.addKills(gold, 400, 0);
check('max level with everything unlocked is gold', MP.prestigeOf(stg, gold) === 'gold',
  String(MP.prestigeOf(stg, gold)));
const plat = MP.newProgress(); MP.addKills(plat, 700, 0);
check('and six hundred kills is platinum', MP.prestigeOf(stg, plat) === 'platinum',
  String(MP.prestigeOf(stg, plat)));
const dia = MP.newProgress(); MP.addKills(dia, 1200, 60);
check('and eleven hundred and the heads is diamond', MP.prestigeOf(stg, dia) === 'diamond',
  String(MP.prestigeOf(stg, dia)));
check('the diamond camo and the keychain exist',
  MP.CAMOS.some((c) => c.prestige === 'diamond') && MP.KEYCHAIN_SHAPES.length >= 4);
check('every attachment is unlocked by max level',
  MP.GUNS.every((g) => MP.partsFor(g).every((a) => a.lvl <= MP.MAX_LEVEL)));
/* A gun you have just picked up must have SOMETHING it can take. The
   first version of the table had nothing below level 2, so a new gun
   opened a screen on which every row was grey. */
check('something is available at level 1 on every gun',
  MP.GUNS.every((g) => MP.unlockedParts(g, MP.newProgress()).length > 0),
  MP.GUNS.filter((g) => !MP.unlockedParts(g, MP.newProgress()).length).map((g) => g.id).join(','));
check('a level 1 gun can reach several slots',
  MP.GUNS.filter((g) => !g.shield).every((g) => {
    const s2 = {};
    MP.unlockedParts(g, MP.newProgress()).forEach((a) => { s2[a.slot] = 1; });
    return Object.keys(s2).length >= 3;
  }));

/* ---- the default class is legal ---- */
const L = MP.defaultLoadout();
check('the default loadout passes its own check', MP.checkLoadout(L).length === 0,
  MP.checkLoadout(L).join('; '));
check('the default loadout has three killstreaks', L.streaks.length === 3);
check('the default names a tactical, a lethal and an ability',
  !!MP.TACTICALS.find((t) => t.id === L.tactical)
  && !!MP.LETHALS.find((t) => t.id === L.lethal)
  && !!MP.ABILITIES.find((t) => t.id === L.ability));

/* ---- and the check actually refuses things ---- */
check('a rifle in the secondary slot is refused',
  MP.checkLoadout(Object.assign(MP.defaultLoadout(), { secondary: 'stg44' })).length > 0);
check('six attachments are refused',
  MP.checkLoadout(Object.assign(MP.defaultLoadout(), {
    primary: 'stg44', primaryAtt: ['o-reflex', 'm-comp', 'b-long', 'u-vert', 'g-ext', 's-heavy'],
  })).length > 0);
check('two parts in one slot are refused',
  MP.checkLoadout(Object.assign(MP.defaultLoadout(), {
    primary: 'stg44', primaryAtt: ['o-reflex', 'o-reddot'],
  })).length > 0);
check('a part that does not fit is refused',
  MP.checkLoadout(Object.assign(MP.defaultLoadout(), {
    primary: 'stg44', primaryAtt: ['m-chokefull'],
  })).length > 0);
check('six killstreaks are refused',
  MP.checkLoadout(Object.assign(MP.defaultLoadout(), {
    streaks: ['k-recon', 'k-crate', 'k-mortar', 'k-airstrike', 'k-heli', 'k-napalm'],
  })).length > 0);

/* ---- equipment and bots ---- */
check('eight tacticals and eight lethals',
  MP.TACTICALS.length === 8 && MP.LETHALS.length === 8);
check('abilities exist and charge', MP.ABILITIES.length >= 6
  && MP.ABILITIES.every((a) => a.charge > 0));
check('enough bot names for two full teams', MP.BOT_NAMES.length >= 12);
check('every map names two bomb sites and three lanes',
  MP.MAPS.every((m) => m.bombs.length === 2 && m.lanes.length === 3));
check('the maps are the four that were asked for',
  MP.MAPS.map((m) => m.id).join(',') === 'helipad,resort,town,demolition');
check('the modes are team deathmatch and search and destroy',
  MP.MODES.map((m) => m.id).join(',') === 'tdm,snd');

/* ================================================================
   KILLSTREAKS, LEVELS AND THE BERSERKER
   ================================================================ */
check('three killstreak slots, not five',
  MP.STREAK_SLOTS === 3
  && MP.checkLoadout(Object.assign(MP.defaultLoadout(), {
    streaks: ['k-recon', 'k-crate', 'k-mortar', 'k-airstrike'],
  })).length > 0);
check('the Berserker Suit is in the table and costs eighteen',
  !!MP.streak('k-berserker') && MP.streak('k-berserker').cost === 18);
check('every killstreak has three levels',
  MP.KILLSTREAKS.every((k) => {
    const L = MP.streakLevels(k.id);
    return L.length === 3 && L[0] === null && L[1] && L[2];
  }), MP.KILLSTREAKS.filter((k) => MP.streakLevels(k.id).length !== 3).map((k) => k.id).join(','));
check('every level past the first is a named ability with a description',
  MP.KILLSTREAKS.every((k) => MP.streakLevels(k.id).slice(1).every(
    (L) => L && L.name && L.desc && L.unlock > 0)));
check('a streak levels by being used, and starts at one',
  MP.streakLevelOf('k-berserker', 0) === 1
  && MP.streakLevelOf('k-berserker', 5) === 2
  && MP.streakLevelOf('k-berserker', 14) === 3);
check('level two of the Berserker is the Health Cannon',
  /health cannon/i.test(MP.streakLevels('k-berserker')[1].name));
check('the suit has ten thousand armour and is twelve feet',
  MP.BERSERKER.hp === 10000 && Math.abs(MP.BERSERKER.height - 3.66) < 0.01);
check('the minigun is three thousand a minute at ten a round, five hundred then cool',
  MP.BERSERKER.minigun.rpm === 3000 && MP.BERSERKER.minigun.damage === 10
  && MP.BERSERKER.minigun.rounds === 500 && MP.BERSERKER.minigun.cool === 5);
check('the health cannon is fifty-four a minute, ten damage, twenty to recharge',
  MP.BERSERKER.health.rpm === 54 && MP.BERSERKER.health.damage === 10
  && MP.BERSERKER.health.cool === 20);
check('aiming in the suit only narrows the field of view',
  MP.BERSERKER.fov.ads < MP.BERSERKER.fov.hip);

/* ================================================================
   THE PROS AND THE CONS
   ================================================================
   Measured off the folds, so what is checked is that the measurement
   is honest rather than that any one number is a particular value. */
const RIFLE = MP.GUNS.find((g) => g.cls === 'assault').id;
check('a part that fits a gun reports effects on it',
  MP.effectsOf('m-suppressor', RIFLE).fits === true);
check('a part that does not fit reports nothing rather than lying',
  MP.effectsOf('o-7x', RIFLE).fits === false
  && MP.effectsOf('o-7x', RIFLE).pros.length === 0);
{
  const e = MP.effectsOf('m-annihilator', RIFLE);
  const up = e.all.find((x) => x.stat === 'recUp');
  const ads = e.all.find((x) => x.stat === 'ads');
  check('a recoil-killing muzzle is a green minus on vertical recoil',
    !!up && up.good === true && up.sign === '\u2212' && up.signs === 3,
    up ? `${up.sign}${up.signs} ${(up.pct * 100).toFixed(0)}%` : 'no entry');
  check('and a red plus on the time to bring it up',
    !!ads && ads.good === false && ads.sign === '+',
    ads ? `${ads.sign}${ads.signs}` : 'no entry');
  check('and it marks you on their minimap, as a con',
    e.cons.some((c) => c.flag === 'loud'));
}
{
  const bolt = MP.GUNS.find((g) => g.fam === 'bolt').id;
  const e = MP.effectsOf('o-7x', bolt);
  const mag = e.all.find((x) => x.stat === 'sightFov');
  check('a scope reports magnification, not a field of view going down',
    !!mag && mag.name === 'Magnification' && mag.pct > 0 && mag.good === true,
    mag ? `${mag.name} ${(mag.pct * 100).toFixed(0)}%` : 'no entry');
}
check('the sign bands are the ones asked for',
  MP.signsFor(0.01) === 0 && MP.signsFor(0.18) === 1
  && MP.signsFor(0.45) === 2 && MP.signsFor(0.70) === 3
  && MP.signsFor(-0.70) === 3);
check('every attachment measures cleanly on every gun it fits',
  MP.ATTACHMENTS.every((a) => MP.GUNS.every((g) => {
    if (!MP.fits(a, g)) return true;
    const e = MP.effectsOf(a.id, g.id);
    return e.all.every((x) => Number.isFinite(x.pct) && x.signs >= 1 && x.signs <= 3);
  })));
check('at least four parts in five say something about themselves',
  (() => {
    let some = 0, all = 0;
    MP.ATTACHMENTS.forEach((a) => {
      const g = MP.GUNS.find((x) => MP.fits(a, x));
      if (!g) return;
      all++;
      const e = MP.effectsOf(a.id, g.id);
      if (e.pros.length + e.cons.length > 0) some++;
    });
    return all > 0 && some / all >= 0.8;
  })());

/* ---- what cannot be fitted with what ---- */
check('a bipod and a grip are refused together',
  MP.conflicts('u-bipod', ['u-grip']).length === 1);
check('and the loadout check says so',
  MP.checkLoadout(Object.assign(MP.defaultLoadout(), {
    primary: RIFLE, primaryAtt: ['u-bipod', 'u-grip'],
  })).some((b) => /cannot be fitted/.test(b)));
check('exclusions read the same from both directions',
  Object.keys(MP.EXCLUDES).every((a) => MP.EXCLUDES[a].every(
    (b) => MP.conflicts(a, [b]).length === 1 && MP.conflicts(b, [a]).length === 1)));

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
