// 240 tools in 8 trades, sold at hardware, tackle and outdoor stores.
// Many have real effects: first-aid heals, armor vests protect, repair kits
// fix your car, rods/bait/knives are needed for fishing and hunting, the
// flashlight lights the night (L), the metal detector finds buried cash, and
// jobs check for the tools of their trade.
import * as THREE from 'three';
import { CITY, TOWN } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { money, keyHint } from './world-util.js';

// [trade, [name, price, effect?] ...]  effect: heal/armor/repair/rod/bait/knife/call/light/detector/...
const RAW = {
  Fishing: [
    ...['Spinning rod', 'Baitcast rod', 'Fly rod', 'Surf rod', 'Deep-sea rod'].flatMap((n, k) => [1, 2, 3].map((t) => [`${n} ${['Basic', 'Pro', 'Elite'][t - 1]}`, 60 * (k + 1) * t * t, { rod: k * 3 + t }])),
    ['Earthworms (24)', 6, { bait: 24 }], ['Live shrimp (12)', 14, { bait: 12, baitK: 1.3 }], ['Minnows (12)', 12, { bait: 12, baitK: 1.2 }], ['Crickets (24)', 8, { bait: 24 }], ['Cut mullet (10)', 10, { bait: 10, baitK: 1.4 }],
    ['Spinner lure', 9, { lure: 1 }], ['Crankbait', 12, { lure: 1 }], ['Soft plastic worm', 6, { lure: 1 }], ['Topwater popper', 14, { lure: 1 }], ['Bucktail jig', 11, { lure: 1 }], ['Spoon lure', 8, { lure: 1 }], ['Fly assortment', 25, { lure: 1 }], ['Saltwater jig', 16, { lure: 1 }],
    ['Landing net', 40], ['Tackle box', 35], ['Line 10 lb', 9], ['Line 30 lb braid', 22], ['Leader 50 lb', 12], ['Fishing pliers', 18], ['Rod holder', 25], ['Cooler 48 qt', 60, { cooler: 1 }], ['Bait bucket', 15], ['Polarized sunglasses', 45], ['Fish scale', 20], ['Fillet knife', 30, { knife: 1 }], ['Portable fish finder', 180, { finder: 1 }], ['Cast net', 55, { bait: 30 }],
  ],
  Hunting: [
    ...['Skinning knife', 'Gut hook knife', 'Bowie knife'].flatMap((n, k) => [1, 2].map((t) => [`${n}${t === 2 ? ' Pro' : ''}`, 40 * (k + 1) * t, { knife: k * 2 + t }])),
    ['Deer grunt call', 25, { call: 'deer' }], ['Turkey box call', 30, { call: 'turkey' }], ['Duck call', 22, { call: 'duck' }], ['Predator call', 45, { call: 'coyote' }], ['Hog call', 28, { call: 'boar' }], ['Electronic caller', 160, { call: 'any' }],
    ['Doe scent', 12], ['Cover scent', 10], ['Binoculars 8x42', 140, { binos: 1 }], ['Rangefinder', 210], ['Camo jacket', 90], ['Camo pants', 70], ['Ghillie suit', 260, { stealth: 1 }], ['Tree stand', 180], ['Ground blind', 150], ['Trail camera', 110],
    ['Game bag', 25, { pelts: 1 }], ['Field dressing kit', 40], ['Blood tracking light', 60], ['Bow sight', 75], ['Quiver', 35], ['Arrows (12)', 48, { arrows: 12 }], ['Broadheads (6)', 40], ['Decoy deer', 120], ['Turkey decoys', 60],
  ],
  Mechanic: [
    ['Repair kit', 120, { repair: 50 }], ['Pro repair kit', 300, { repair: 100 }], ['Tire plug kit', 25, { repair: 10 }], ['Jumper cables', 30], ['Floor jack', 140], ['Jack stands', 60], ['Socket set', 90, { trade: 'mech' }],
    ['Wrench set', 70, { trade: 'mech' }], ['Torque wrench', 85], ['Impact driver', 160], ['Air compressor', 220], ['OBD scanner', 95], ['Creeper', 50], ['Oil drain pan', 20], ['Funnel set', 8], ['Breaker bar', 40],
    ['Screwdriver set', 30], ['Pliers set', 35], ['Multimeter', 45], ['Battery charger', 80], ['Tow strap', 35], ['Shop light', 40], ['Grease gun', 30], ['Brake bleeder', 35], ['Timing light', 60], ['Engine hoist', 300],
    ['Wheel chocks', 20], ['Spare tire', 110, { repair: 15 }], ['Fuel can', 25], ['Coolant tester', 18], ['Spark plug set', 30], ['Belt kit', 55], ['Body filler', 25, { repair: 20 }], ['Paint gun', 120], ['Welder', 450, { trade: 'mech' }],
  ],
  Survival: [
    ['Flashlight', 25, { light: 1 }], ['Tactical flashlight', 70, { light: 2 }], ['Headlamp', 40, { light: 1 }], ['Lantern', 35], ['Compass', 20], ['Tent', 160, { camp: 1 }], ['Sleeping bag', 70], ['Camp stove', 60], ['Water filter', 45], ['Canteen', 15],
    ['Paracord', 12], ['Fire starter', 10], ['Machete', 35, { knife: 1 }], ['Hatchet', 40], ['Folding saw', 30], ['Multitool', 65], ['Emergency blanket', 8], ['Signal mirror', 9], ['Whistle', 5], ['Rain poncho', 15],
    ['Hiking boots', 120], ['Backpack 40L', 90], ['Trekking poles', 60], ['Solar charger', 75], ['Bug spray', 7], ['Sunscreen', 8], ['Snake bite kit', 25, { heal: 10 }], ['Waterproof matches', 6], ['Mess kit', 22], ['Hammock', 55],
  ],
  Construction: [
    ['Claw hammer', 18], ['Sledgehammer', 45], ['Crowbar', 25], ['Bolt cutters', 40], ['Hand saw', 22], ['Circular saw', 130], ['Cordless drill', 120, { trade: 'build' }], ['Jigsaw', 90], ['Angle grinder', 85], ['Tape measure', 12],
    ['Level', 20], ['Speed square', 10], ['Chalk line', 8], ['Utility knife', 9], ['Ladder 8 ft', 110], ['Extension ladder', 220], ['Toolbox', 40], ['Tool belt', 30], ['Hard hat', 20], ['Safety glasses', 8],
    ['Work gloves', 12], ['Shop vac', 95], ['Nail gun', 180], ['Stud finder', 25], ['Caulk gun', 10], ['Trowel', 12], ['Paint roller kit', 20], ['Wheelbarrow', 85], ['Cement mixer', 380], ['Scaffold', 420],
    ['Rebar bender', 140], ['Tile cutter', 75], ['Pipe wrench', 30, { trade: 'plumb' }], ['Plumbing snake', 45, { trade: 'plumb' }], ['Wire strippers', 15, { trade: 'elec' }],
  ],
  Medical: [
    ['Bandages', 15, { heal: 20 }], ['First aid kit', 60, { heal: 50 }], ['Trauma kit', 140, { heal: 100 }], ['Painkillers', 10, { heal: 10 }], ['Splint', 20, { heal: 15 }], ['Burn gel', 12, { heal: 10 }], ['Energy drink', 4, { heal: 5 }], ['Protein bar', 3, { heal: 4 }],
    ['Light armor vest', 250, { armor: 40 }], ['Kevlar vest', 600, { armor: 80 }], ['Heavy armor', 1200, { armor: 100 }], ['Tourniquet', 25, { heal: 25 }], ['Hemostatic gauze', 35, { heal: 30 }], ['Epinephrine pen', 80, { heal: 40 }],
    ['Stethoscope', 60, { trade: 'med' }], ['Blood pressure cuff', 45, { trade: 'med' }], ['Defibrillator', 900, { trade: 'med' }], ['Stretcher', 250, { trade: 'med' }], ['Oxygen kit', 300, { trade: 'med' }], ['Gloves (100)', 12],
  ],
  Electronics: [
    ['Phone: Gulfcell 5', 300], ['Phone: Gulfcell 7 Pro', 900, { phone: 2 }], ['Police scanner', 220, { scanner: 1 }], ['Handheld GPS', 180], ['Walkie-talkies', 70], ['Drone', 650], ['Night vision goggles', 1500, { nvg: 1 }], ['Lockpick set', 90, { lockpick: 1 }],
    ['Signal jammer', 800], ['Laptop', 1100], ['Dash cam', 120], ['Bluetooth speaker', 60], ['Power bank', 40], ['Action camera', 300], ['Metal detector', 280, { detector: 1 }], ['Pro metal detector', 900, { detector: 2 }],
    ['CB radio', 140], ['Weather radio', 45], ['Satellite messenger', 350], ['Thermal monocular', 1800], ['Electric screwdriver', 45], ['Soldering iron', 35, { trade: 'elec' }], ['Oscilloscope', 600, { trade: 'elec' }], ['Cable tester', 40, { trade: 'elec' }], ['Label maker', 30],
  ],
  Farm: [
    ['Shovel', 25], ['Spade', 28], ['Rake', 18], ['Hoe', 20], ['Pitchfork', 30], ['Pruning shears', 22], ['Loppers', 35], ['Hedge trimmer', 120, { trade: 'yard' }], ['Leaf blower', 140, { trade: 'yard' }], ['Push mower', 260, { trade: 'yard' }],
    ['Riding mower', 1900, { trade: 'yard' }], ['Chainsaw', 320, { trade: 'yard' }], ['String trimmer', 150, { trade: 'yard' }], ['Garden hose', 30], ['Sprinkler', 20], ['Seed spreader', 60], ['Post hole digger', 45], ['Fence stretcher', 70], ['Hay hook', 15], ['Livestock prod', 55],
    ['Feed bucket', 10], ['Branding iron', 80], ['Hoof pick', 6], ['Water trough', 140], ['Tractor tool kit', 210],
  ],
};
export const TOOLS = [];
for (const [trade, list] of Object.entries(RAW)) for (const [name, price, fx] of list) TOOLS.push({ id: `${trade.toLowerCase()}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, trade, name, price, fx: fx || {} });
export const TRADES = Object.keys(RAW);

export function installTools(game) {
  const { career, interact, hud, player, scene } = game;
  const P = career.p;
  const T = (id) => TOOLS.find((t) => t.id === id);
  const has = (pred) => TOOLS.filter((t) => pred(t.fx) && career.hasTool(t.id));
  game.tools = { list: TOOLS, best: (key) => has((f) => f[key]).reduce((a, t) => Math.max(a, typeof t.fx[key] === 'number' ? t.fx[key] : 1), 0), hasTrade: (tr) => has((f) => f.trade === tr).length > 0 };

  const useTool = (t) => {
    const f = t.fx;
    if (f.heal) { if (player.health >= 100) return hud.toast('Already at full health', 1.2); career.useTool(t.id); player.health = Math.min(100, player.health + f.heal); return hud.toast(`${t.name}: +${f.heal} health`, 1.5); }
    if (f.armor) { career.useTool(t.id); player.armor = Math.min(100, Math.max(player.armor, f.armor)); return hud.toast(`${t.name} on`, 1.5); }
    if (f.repair) {
      const v = game.vehicle() || game.parked.reduce((a, b) => (b.pos.distanceTo(player.pos) < (a ? a.pos.distanceTo(player.pos) : 8) ? b : a), null);
      if (!v) return hud.toast('Stand next to a vehicle', 1.5);
      career.useTool(t.id); v.health = Math.min(v.maxHealth || 100, v.health + f.repair); v.wrecked = false; if (v.health >= (v.maxHealth || 100)) v.dmg = null; else if (v.dmg) for (const k in v.dmg) v.dmg[k] = Math.max(0, v.dmg[k] - f.repair / 100); return hud.toast(`${v.spec.name} repaired`, 1.5);
    }
    if (f.light) { lightOn = !lightOn; return hud.toast(`Flashlight ${lightOn ? 'on' : 'off'} (L)`, 1.2); }
    if (f.call) { game.hunting?.call(f.call); return; }
    hud.toast(`${t.name}: carried. Used automatically where it matters.`, 2);
  };
  game.useTool = useTool;

  const SUPPLIES = [
    { supply: 'metal', n: 1, name: 'Scrap steel bar', price: 35, desc: 'Machinable steel stock' },
    { supply: 'metal', n: 5, name: 'Box of scrap steel (5)', price: 150, desc: 'Bulk, a little rusty' },
    { supply: 'glass', n: 1, name: 'Optical lens', price: 80, desc: 'Ground glass for a scope' },
    { supply: 'springs', n: 1, name: 'Spring assortment', price: 25, desc: 'Coil and leaf springs' },
  ];
  const store = new ShopUI({
    title: 'Calvera Hardware', getMoney: () => career.money, pause: game.pause,
    tabs: [...TRADES.map((k) => ({ k, label: `${k} (${TOOLS.filter((t) => t.trade === k).length})` })), { k: 'supplies', label: 'Crafting supplies' }],
    note: (tr) => tr === 'supplies' ? `For Tina at the hideout: she builds scopes and suppressors from these. You have ${P.supplies?.metal || 0} metal, ${P.supplies?.glass || 0} lenses, ${P.supplies?.springs || 0} spring sets.` : `${TOOLS.length} tools. Consumables stack; everything is kept in your phone's inventory (I).`,
    items: (tr) => tr === 'supplies' ? SUPPLIES : TOOLS.filter((t) => t.trade === tr),
    row: (t) => {
      if (t.supply) return { name: t.name, sub: `${t.desc} · you have ${P.supplies?.[t.supply] || 0}`, stats: [], btn: money(t.price) };
      const n = P.tools[t.id] || 0, fx = Object.entries(t.fx).map(([k, v]) => `${k}${v !== 1 && typeof v !== 'string' ? ' ' + v : typeof v === 'string' ? ': ' + v : ''}`).join(', ');
      return { name: t.name, sub: `${t.trade}${fx ? ' · ' + fx : ''}${n ? ` · you have ${n}` : ''}`, stats: [], btn: money(t.price), cls: n ? 'own' : '' };
    },
    act: (t) => { if (t.supply) { if (career.spend(t.price)) { P.supplies = P.supplies || { metal: 0, glass: 0, springs: 0 }; P.supplies[t.supply] += t.n; hud.toast(`Bought ${t.name}`, 1.2); } return; } if (career.spend(t.price)) { career.addTool(t.id, t.fx.bait || t.fx.arrows ? 1 : 1); if (t.fx.bait) P.baitCount = (P.baitCount || 0) + t.fx.bait; hud.toast(`Bought ${t.name}`, 1.2); } },
  });
  const shops = [
    [CITY.x0 + 5 * CITY.pitch - 30, CITY.z0 - 26, 'Calvera Hardware', 'Construction'],
    [TOWN.x0 + TOWN.pitch * 2 + 10, TOWN.z0 + TOWN.nz * TOWN.pitch + 18, 'Mill Creek Feed & Hardware', 'Farm'],
    [TOWN.x0 - 26, TOWN.z0 + 2 * TOWN.pitch, 'Bayou Outfitters (hunting)', 'Hunting'],
  ];
  for (const [x, z, name, tab] of shops) interact.add({ x, z, label: () => `${keyHint(game)} shop at ${name}`, color: 0xffa040, blip: { color: '#ffa040', size: 5, global: true, icon: tab === 'Hunting' ? '🏹' : '🔨' }, show: () => !game.S.indoors, use: () => store.show(tab, name) });
  for (const m of game.marineAir?.marinas || []) interact.add({ x: m.land.x + 6, z: m.land.z + 4, label: () => `${keyHint(game)} shop for bait & tackle`, color: 0xffa040, blip: { color: '#ffa040', size: 4, icon: '🎣', badge: 'S' }, use: () => store.show('Fishing', 'Bait & Tackle') });

  // flashlight that follows the player at night
  let lightOn = false;
  const torch = new THREE.SpotLight(0xfff1dd, 0, 30, 0.45, 0.5, 1.5);
  scene.add(torch, torch.target);
  addEventListener('keydown', (e) => { if (e.code === 'KeyL' && game.tools.best('light')) { lightOn = !lightOn; } });
  // metal detector: walking the countryside turns up buried cash
  let detT = 0;
  return {
    store, useTool, TOOLS,
    update(dt) {
      const on = lightOn && game.S.mode === 'foot' && game.tools.best('light') > 0;
      torch.intensity = on ? 40 * game.tools.best('light') : 0;
      if (on) {
        const f = Math.sin(player.heading), c = Math.cos(player.heading);
        torch.position.set(player.pos.x + f * 0.3, player.pos.y + 1.5, player.pos.z + c * 0.3);
        torch.target.position.set(player.pos.x + f * 10, player.pos.y, player.pos.z + c * 10);
      }
      const det = game.tools.best('detector');
      if (det && game.S.mode === 'foot' && !game.S.indoors && player.vel && Math.hypot(player.vel.x, player.vel.z) > 0.5) {
        detT += dt * det;
        if (detT > 45 + Math.random() * 60) { detT = 0; const amt = Math.round((20 + Math.random() * 180) * det); career.earn(amt, 'metal detector find'); }
      }
    },
  };
}
