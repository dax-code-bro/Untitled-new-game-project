// Prints the POB crafting catalog as Markdown tables (used to build DESIGN.md).
//   node tools/catalog-tables.mjs
import { CATEGORIES, ITEMS, AMMO, craftable, fmtDuration } from '../src/data/catalog.js';

const out = [];
for (const c of CATEGORIES.slice(1)) {
  const list = craftable().filter((d) => d.cat === c.id).sort((a, b) => a.cost - b.cost);
  if (!list.length) continue;
  out.push(`### ${c.name}\n`);
  if (c.id === 'weapons') {
    out.push('| Weapon | Type | Caliber / ammo | Damage | RPM | Mag | Action | Filament | Print time |', '|---|---|---|---|---|---|---|---|---|');
    for (const d of list) out.push(`| ${d.name} | ${d.sub} | ${d.caliber || '—'} | ${d.pellets ? `${d.dmg}×${d.pellets}` : d.dmg ?? '—'} | ${d.rpm ?? '—'} | ${d.mag ?? d.count ?? '—'} | ${d.mode || 'melee'} | ${d.cost} | ${fmtDuration(d.time)} |`);
  } else {
    out.push('| Item | Notes | Filament | Print time |', '|---|---|---|---|');
    for (const d of list) out.push(`| ${d.name} | ${(d.desc || (d.cloth ? `needs ${d.cloth} cloth` : '')).replace(/\|/g, '/')} | ${d.cost} | ${fmtDuration(d.time)} |`);
  }
  out.push('');
}
out.push('### Ammo classes\n', '| Ammo | Penetration | Notes |', '|---|---|---|');
for (const [k, a] of Object.entries(AMMO)) out.push(`| ${a.name} | ${a.pen} | ${a.explosive ? `explosive (${a.blastDmg} dmg, ${a.blast} m)` : a.shot ? 'buckshot' : a.ap ? 'armor piercing' : ''} |`);
console.log(out.join('\n'));
