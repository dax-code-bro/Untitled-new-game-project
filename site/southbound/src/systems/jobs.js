// 27 jobs. Each job board starts a shift: get the work vehicle (or your
// tools), follow the stops before the clock runs out, get paid per stop.
// Pay grows with your level in that job (every 3 shifts).
import { CITY, TOWN, LAKE, PLAINS, FOREST, AIRFIELD, BAYOU } from '../world/layout.js';
import { roadPointAround, nearestRoad, spawnParked, money, keyHint } from './world-util.js';
import { BOATS, AIRCRAFT } from '../entities/craft.js';

const C = (i, j) => [CITY.x0 + i * CITY.pitch, CITY.z0 + j * CITY.pitch];
const T = (i, j) => [TOWN.x0 + i * TOWN.pitch, TOWN.z0 + j * TOWN.pitch];
// kind: route (drive/walk to stops), catch (fish N), hunt (skin N), bounty
export const JOBS = [
  { id: 'taxi', name: 'Taxi Driver', at: C(1, 3), veh: 'taxi', area: 'city', stops: 4, pay: 90, timer: 300, text: 'Pick up and drop off fares' },
  { id: 'bus', name: 'Bus Driver', at: C(0, 1), veh: 'bus_01', area: 'city', stops: 6, wait: 3, pay: 60, timer: 420, text: 'Run the downtown loop and stop at every shelter' },
  { id: 'parcel', name: 'Parcel Courier', at: C(4, 0), veh: 'delivery', area: 'city', stops: 5, wait: 2, pay: 70, timer: 360, text: 'Drop parcels around Port Calvera' },
  { id: 'pizza', name: 'Pizza Delivery', at: C(3, 2), veh: 'compact_02', area: 'city', stops: 3, pay: 55, timer: 150, text: 'Hot pizza, tight clock' },
  { id: 'trucker', name: 'Long-haul Trucker', at: T(0, 3), veh: 'truck_02', area: 'far', stops: 2, wait: 4, pay: 420, timer: 600, text: 'Haul freight between the city, the town and the airfield' },
  { id: 'paramedic', name: 'Paramedic', at: C(8, 2), veh: 'ambulance', area: 'city', stops: 3, wait: 4, back: true, pay: 160, timer: 240, siren: true, text: 'Reach the patient, then get them to Medical Center' },
  { id: 'fire', name: 'Firefighter', at: C(6, 0), veh: 'firetruck', area: 'city', stops: 2, wait: 8, back: true, pay: 220, timer: 300, siren: true, text: 'Put out fires around the city' },
  { id: 'police', name: 'Police Patrol', at: C(0, 1), veh: 'police', area: 'city', stops: 5, pay: 110, timer: 400, siren: true, text: 'Patrol the checkpoints' },
  { id: 'tow', name: 'Tow Truck Operator', at: C(7, 5), veh: 'tow-truck', area: 'city', stops: 2, wait: 5, back: true, pay: 180, timer: 360, text: 'Hook up breakdowns and haul them to the impound' },
  { id: 'garbage', name: 'Garbage Collector', at: C(2, 6), veh: 'garbage-truck', area: 'city', stops: 6, wait: 2, pay: 50, timer: 420, text: 'Empty the bins on the route' },
  { id: 'roadcrew', name: 'Road Crew', at: C(5, 6), veh: 'pickup_02', area: 'city', stops: 3, wait: 6, pay: 120, timer: 400, text: 'Fix potholes at the work sites', tool: 'build' },
  { id: 'mechanic', name: 'Mechanic', at: C(2, 6), veh: null, area: 'near', stops: 3, wait: 6, pay: 140, timer: 300, tool: 'mech', text: 'Fix customer cars around the shop' },
  { id: 'messenger', name: 'Bike Messenger', at: C(5, 3), veh: null, area: 'downtown', stops: 4, pay: 45, timer: 200, text: 'Run envelopes between offices on foot' },
  { id: 'security', name: 'Security Guard', at: C(6, 4), veh: null, area: 'near', stops: 5, wait: 3, pay: 50, timer: 360, text: 'Check every door on your round' },
  { id: 'charter', name: 'Fishing Charter Captain', at: 'marina', boat: 'center-console', area: 'lake', stops: 1, wait: 20, back: true, pay: 600, timer: 600, text: 'Take clients out to the fishing grounds and back' },
  { id: 'fisherman', name: 'Commercial Fisherman', at: 'marina', kind: 'catch', need: 3, pay: 150, timer: 900, text: 'Land three fish for the market' },
  { id: 'guide', name: 'Hunting Guide', at: [PLAINS.x - 120, PLAINS.z + 70], kind: 'hunt', need: 2, pay: 300, timer: 900, text: 'Bag and skin two animals for your clients' },
  { id: 'duster', name: 'Crop Duster Pilot', at: [AIRFIELD.x1 - 20, AIRFIELD.z - 50], air: 'crop-duster', area: 'plains', stops: 5, fly: true, pay: 260, timer: 420, text: 'Spray the fields (fly low through the markers)' },
  { id: 'tours', name: 'Air Tour Pilot', at: [AIRFIELD.x1 - 30, AIRFIELD.z - 50], air: 'tour-heli', area: 'landmarks', stops: 4, fly: true, back: true, pay: 380, timer: 600, text: 'Show tourists the lake, downtown and the coast' },
  { id: 'medevac', name: 'Medevac Pilot', at: [AIRFIELD.x1 - 40, AIRFIELD.z - 50], air: 'medevac', area: 'far', stops: 1, fly: true, land: true, back: true, pay: 700, timer: 480, text: 'Fly to the accident, land, and bring the patient back' },
  { id: 'lumber', name: 'Lumberjack', at: [FOREST.x + 280, FOREST.z + 240], veh: null, area: 'forest', stops: 4, wait: 6, pay: 110, timer: 500, tool: 'yard', text: 'Fell the marked trees (needs a chainsaw)' },
  { id: 'landscaper', name: 'Landscaper', at: T(1, 1), veh: 'pickup_04', area: 'town', stops: 4, wait: 5, pay: 95, timer: 480, tool: 'yard', text: 'Mow and trim yards around Mill Creek' },
  { id: 'construction', name: 'Construction Worker', at: C(7, 1), veh: null, area: 'near', stops: 4, wait: 6, pay: 120, timer: 420, tool: 'build', text: 'Frame, drill and fasten at the site' },
  { id: 'electrician', name: 'Electrician', at: C(3, 5), veh: 'van_02', area: 'city', stops: 3, wait: 6, pay: 160, timer: 480, tool: 'elec', text: 'Service calls: wiring and panels' },
  { id: 'plumber', name: 'Plumber', at: C(4, 5), veh: 'van_03', area: 'city', stops: 3, wait: 6, pay: 150, timer: 480, tool: 'plumb', text: 'Service calls: leaks and clogs' },
  { id: 'ranch', name: 'Ranch Hand', at: [PLAINS.x + 200, PLAINS.z - 140], veh: 'offroad_01', area: 'plains', stops: 5, pay: 85, timer: 480, text: 'Check fences and round up strays across the plains' },
  { id: 'bounty', name: 'Bounty Hunter', at: C(0, 2), kind: 'bounty', pay: 900, timer: 600, text: 'Track down the fugitive and take them out' },
];

// ranks by level in a job
const RANKS = [[10, 'Veteran'], [7, 'Lead'], [4, 'Senior'], [2, 'Regular'], [1, 'Trainee']];
const rankOf = (level) => RANKS.find(([n]) => level >= n)[1];
// jobs where somebody rides with you and rates the ride
const RIDERS = new Set(['taxi', 'bus', 'paramedic', 'charter', 'tours', 'medevac']);
const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
const GRIPES = ['"Whoa! Watch it!"', '"Are you trying to kill us?"', '"Easy, easy!"', '"I\'d like to get there alive."', '"That\'s coming out of your tip."'];

const JOB_ICONS = { taxi: '🚕', bus: '🚌', parcel: '📦', pizza: '🍕', trucker: '🚚', paramedic: '🚑', fire: '🚒', police: '🚓', tow: '🛻', garbage: '🗑️', roadcrew: '🚧', mechanic: '🔧', messenger: '✉️', security: '🛡️',
  charter: '🛥️', fisherman: '🐟', guide: '🦌', duster: '🌾', tours: '🚁', medevac: '🚑', lumber: '🪓', landscaper: '🌳', construction: '🏗️', electrician: '⚡', plumber: '🚰', ranch: '🐄', bounty: '🎯' };

export function installJobs(game) {
  const { career, interact, hud, player, hm, graph } = game;
  // Work isn't all in the city: move boards out to Mill Creek, the two country
  // settlements and the bayou, each to a job that fits the place.
  const hamlets = (game.city.junk || []).filter((j) => j.kind === 'sign');
  const MOVE = {
    pizza: { at: T(2, 1), area: 'town', text: 'Hot pizza for Mill Creek, tight clock' },
    parcel: { at: T(1, 3), area: 'town', text: 'Drop parcels around Mill Creek' },
    garbage: { at: T(3, 0), area: 'town', text: 'Empty the bins around Mill Creek' },
    mechanic: { at: T(0, 2), area: 'near', text: 'Fix customer cars around the Mill Creek garage' },
    plumber: { at: T(3, 2), area: 'town', text: 'Service calls around Mill Creek: leaks and clogs' },
    fisherman: { at: [BAYOU.x + 180, BAYOU.z - 120], text: 'Land three fish from the bayou for the market' },
    ...(hamlets[0] ? { tow: { at: [hamlets[0].x + 14, hamlets[0].z - 10], area: 'around', text: `Tow breakdowns around ${hamlets[0].name || 'the crossing'} to the yard` } } : {}),
    ...(hamlets[1] ? { roadcrew: { at: [hamlets[1].x - 14, hamlets[1].z + 10], area: 'around', text: `Patch the country roads around ${hamlets[1].name || 'the bend'}` } } : {}),
  };
  // the emergency jobs start at the real hospital and fire station
  if (game.civic?.hospital) MOVE.paramedic = { at: [game.civic.hospital.x, game.civic.hospital.z] };
  if (game.civic?.firehouse) MOVE.fire = { at: [game.civic.firehouse.x, game.civic.firehouse.z] };
  if (game.civic?.precinct) { MOVE.police = { at: [game.civic.precinct.x + 4, game.civic.precinct.z] }; MOVE.bounty = { at: [game.civic.precinct.x - 4, game.civic.precinct.z] }; }
  for (const j of JOBS) if (MOVE[j.id]) Object.assign(j, MOVE[j.id]);
  const P = career.p;
  let job = null; // { def, stop, stops[], t, veh, marker, waitT, base }
  const lvl = (id) => (P.jobs[id] || { level: 1 }).level;
  const marina = () => game.marineAir?.marinas?.[0];
  const where = (def) => def.at === 'marina' ? (marina() ? [marina().land.x + 3, marina().land.z - 5] : [LAKE.x + LAKE.r, LAKE.z]) : def.at;

  const stopPoints = (def, from) => {
    const pts = [];
    const near = (cx, cz, r0, r1) => { const p = roadPointAround(graph, cx, cz, r0, r1); return [p.x, p.z]; };
    for (let i = 0; i < (def.stops || 0); i++) {
      if (def.area === 'city') pts.push(near(CITY.x0 + CITY.nx * CITY.pitch / 2, CITY.z0 + CITY.nz * CITY.pitch / 2, 40, 330));
      else if (def.area === 'downtown') pts.push(near(CITY.downtown[0], CITY.downtown[1], 20, 160));
      else if (def.area === 'town') pts.push(near(TOWN.x0 + 144, TOWN.z0 + 108, 20, 200));
      else if (def.area === 'around') { const a = Math.random() * 6.28, r = 60 + Math.random() * 280; pts.push([from[0] + Math.cos(a) * r, from[1] + Math.sin(a) * r]); }
      else if (def.area === 'near') { const a = Math.random() * 6.28, r = 15 + Math.random() * 45; pts.push([from[0] + Math.cos(a) * r, from[1] + Math.sin(a) * r]); }
      else if (def.area === 'forest') { const a = Math.random() * 6.28, r = 40 + Math.random() * 160; pts.push([FOREST.x + 200 + Math.cos(a) * r, FOREST.z + 180 + Math.sin(a) * r]); }
      else if (def.area === 'plains') { const a = Math.random() * 6.28, r = 80 + Math.random() * 380; pts.push([PLAINS.x + Math.cos(a) * r, PLAINS.z + Math.sin(a) * r]); }
      else if (def.area === 'lake') { const a = Math.random() * 6.28; pts.push([LAKE.x + Math.cos(a) * LAKE.r * 0.45, LAKE.z + Math.sin(a) * LAKE.r * 0.45]); }
      else if (def.area === 'landmarks') pts.push([[LAKE.x, LAKE.z], CITY.downtown, [CITY.x0 + 400, 1500], [TOWN.x0 + 144, TOWN.z0 + 108]][i % 4]);
      else pts.push([[TOWN.x0 + 144, TOWN.z0 + 120], [CITY.x0 + 200, CITY.z0 + 200], [AIRFIELD.x1 - 100, AIRFIELD.z - 40], [PLAINS.x, PLAINS.z]][(i + Math.floor(Math.random() * 4)) % 4]);
    }
    if (def.back) pts.push(def.id === 'paramedic' || def.id === 'medevac' ? [CITY.x0 + CITY.nx * CITY.pitch + 24, CITY.z0 + 2 * CITY.pitch] : from);
    return pts;
  };

  const setMarker = () => {
    if (job.marker) interact.remove(job.marker);
    const [x, z] = job.stops[job.stop];
    const r = job.def.fly ? 26 : job.def.veh === null || job.def.kind ? 3 : 7;
    job.marker = interact.add({ x, z, r, any: true, marker: true, height: job.def.fly ? 60 : 6, color: 0xffe040, blip: { color: '#ffe040', size: 7, global: true, icon: '📍', bg: 'rgba(160,120,0,0.9)' }, label: () => '', use: () => {} });
    job.waitT = job.def.wait || 0;
  };
  const finish = (ok, msg) => {
    if (job.marker) interact.remove(job.marker);
    if (job.target && !job.target.dead) job.target.mode = 'walk';
    const d = job.def;
    if (ok) {
      const j = P.jobs[d.id] || (P.jobs[d.id] = { level: 1, xp: 0, runs: 0 });
      j.runs++; j.xp++; if (j.xp >= 3) { j.xp = 0; j.level++; hud.toast(`${d.name} level ${j.level}!`, 2.5); }
      P.stats.jobsDone++;
      const bonus = Math.round(job.earned * 0.25 * Math.max(0, job.t / d.timer));
      if (bonus > 0) career.earn(bonus, 'time bonus');
      // the shift's rating: dispatch texts it, good shifts add up to employee of the month
      j.earned = (j.earned || 0) + job.earned + bonus; j.lastRating = job.rating; j.best = Math.max(j.best || 0, job.rating);
      if (job.rating >= 4.5) j.good = (j.good || 0) + 1;
      hud.bigMessage('SHIFT COMPLETE', `${d.name} · earned ${money(job.earned + bonus)} · ${stars(job.rating)}`, 3);
      game.text?.(`${d.name} dispatch`, job.rating >= 4.5 ? `Great shift. ${stars(job.rating)} Keep it up.` : job.rating >= 3 ? `Shift logged. ${stars(job.rating)}` : `We had complaints. ${stars(job.rating)} Drive like it's your own.`);
      if (j.good === 5) { career.earn(500, 'employee of the month'); hud.toast(`Employee of the month: ${d.name}! +$500`, 3.5); game.news?.(`Local ${d.name.toLowerCase()} named employee of the month.`); }
    } else hud.bigMessage('SHIFT OVER', msg || d.name, 2.5);
    if (job.veh && d.siren) job.veh.siren = false;
    job = null; career.saveSoon();
  };

  const start = (def) => {
    if (job) return finish(false, 'You quit the shift');
    if (P.jobs[def.id]?.firedDay === game.sky?.day) return hud.toast(`${def.name}: "After what you did to the truck? Come back tomorrow."`, 3);
    if (def.tool && !game.tools.hasTrade(def.tool)) return hud.toast(`You need ${def.tool === 'mech' ? 'mechanic' : def.tool === 'build' ? 'construction' : def.tool === 'elec' ? 'electrical' : def.tool === 'plumb' ? 'plumbing' : 'yard'} tools (hardware store)`, 3);
    const from = where(def);
    // the night shift pays a quarter more
    const h = game.sky?.hour ?? 12, night = h >= 22 || h < 6;
    job = { def, stop: 0, t: def.timer, earned: 0, base: def.pay * (1 + (lvl(def.id) - 1) * 0.15) * (night ? 1.25 : 1), night, rating: 5, hp0: null, gripeT: 0, leg: 0, count0: def.kind === 'catch' ? P.stats.fishCaught : P.stats.animals };
    if (def.kind === 'bounty') {
      const p = roadPointAround(graph, CITY.x0 + 380, CITY.z0 + 280, 60, 380);
      job.target = game.peds.spawnAt(p.x, p.z, player.pos);
      if (job.target) { job.target.bounty = true; job.target.hp = (job.target.hp || 100) * 2; }
      job.stops = [[p.x, p.z]]; setMarker();
    } else if (def.kind) { job.stops = []; }
    else {
      job.stops = stopPoints(def, from);
      // the work vehicle
      if (def.veh) { const r = nearestRoad(graph, from[0], from[1]); job.veh = spawnParked(game, def.veh, r.x, r.z, Math.atan2(r.tx, r.tz)); job.veh.issued = true; game.enterVehicle(job.veh); }
      if (def.boat) { job.veh = game.marineAir.spawnCraft(BOATS.find((b) => b.id === def.boat), 'boat', { x: marina().water.x, z: marina().water.z, h: marina().dir }); game.enterVehicle(job.veh); }
      if (def.air) { const e = AIRCRAFT.find((a) => a.id === def.air); job.veh = game.marineAir.spawnCraft(e, 'air', { x: AIRFIELD.x1 - 90, z: AIRFIELD.z, h: -Math.PI / 2 }); game.enterVehicle(job.veh); }
      if (job.veh && def.siren) job.veh.siren = true;
      if (job.veh) job.veh.fuel = 1; // the company fills it up
      setMarker();
    }
    hud.bigMessage(def.name.toUpperCase(), `${def.text}${job.night ? ' · night rate (+25%)' : ''}`, 3);
  };

  for (const def of JOBS) {
    const at = where(def);
    interact.add({ x: at[0], z: at[1], color: 0xffe040, blip: { color: '#ffe040', size: 4, icon: JOB_ICONS[def.id] || '💼', badge: 'J' }, show: () => !game.S.indoors && (!job || job.def === def),
      label: () => job && job.def === def ? `${keyHint(game)} quit the ${def.name} shift` : `${keyHint(game)} work as ${def.name} (${rankOf(lvl(def.id))}, level ${lvl(def.id)} · ~${money((def.pay * (1 + (lvl(def.id) - 1) * 0.15)) * (def.stops || def.need || 1))})`,
      use: () => start(def) });
  }

  return {
    JOBS, rankOf, get active() { return job; }, start: (id) => start(JOBS.find((j) => j.id === id)),
    update(dt) {
      if (!job || game.S.frozen && !game.S.stepping) return '';
      const d = job.def;
      job.t -= dt; job.leg += dt;
      // the ride: every knock costs you stars (and riders say so); wreck it and you're fired
      if (job.veh && game.vehicle() === job.veh) {
        const hp = job.veh.health;
        if (job.hp0 == null) job.hp0 = hp;
        const lost = job.hp0 - hp;
        if (lost > 0.8) {
          job.hp0 = hp; job.rating = Math.max(1, job.rating - lost * 0.06);
          if (RIDERS.has(d.id) && job.gripeT <= performance.now()) { job.gripeT = performance.now() + 6000; hud.toast(`Passenger: ${GRIPES[(Math.random() * GRIPES.length) | 0]}`, 2); }
        }
        if (hp < (job.veh.maxHealth || 100) * 0.3) {
          const j = P.jobs[d.id] || (P.jobs[d.id] = { level: 1, xp: 0, runs: 0 }); j.firedDay = game.sky?.day;
          finish(false, `You wrecked the ${d.name.toLowerCase()}'s vehicle. You're fired (for today).`); return '';
        }
      }
      if (job.t <= 0) { finish(false, 'Out of time'); return ''; }
      const clock = `${Math.floor(job.t / 60)}:${String(Math.floor(job.t % 60)).padStart(2, '0')}`;
      if (d.kind === 'catch' || d.kind === 'hunt') {
        const got = (d.kind === 'catch' ? P.stats.fishCaught : P.stats.animals) - job.count0;
        if (got >= d.need) { career.earn(Math.round(job.base * d.need), d.name); job.earned = job.base * d.need; finish(true); return ''; }
        return `${d.name.toUpperCase()} · ${got}/${d.need} · ${clock}`;
      }
      if (d.kind === 'bounty') {
        const tg = job.target;
        if (!tg) { finish(false, 'The trail went cold'); return ''; }
        if (job.marker) { job.marker.x = tg.pos.x; job.marker.z = tg.pos.z; }
        if (tg.mode === 'dead' || tg.dead || tg.hp <= 0) { career.earn(Math.round(job.base), 'bounty'); job.earned = job.base; finish(true); return ''; }
        return `BOUNTY · fugitive on the map · ${clock}`;
      }
      const inJobVeh = !job.veh || game.vehicle() === job.veh;
      if (job.veh && !inJobVeh) return `${d.name.toUpperCase()} · get back in the vehicle · ${clock}`;
      const [x, z] = job.stops[job.stop];
      const pos = job.veh ? job.veh.pos : player.pos;
      const dist = Math.hypot(pos.x - x, pos.z - z);
      const reach = job.marker.r;
      if (dist < reach && (!d.fly || (d.land && job.stop === 0 ? job.veh.alt < 2.5 : job.veh.alt < (d.area === 'plains' ? 30 : 120)))) {
        const still = !job.veh || job.veh.isAir || Math.abs(job.veh.speed) < 1.5;
        if (still) job.waitT -= dt;
        if (job.waitT <= 0) {
          const pay = Math.round(job.base);
          career.earn(pay, d.name); job.earned += pay;
          // tips: riders tip for a smooth ride; pizza tips for hot pizza
          const tip = d.id === 'pizza' ? Math.round(job.base * 0.5 * Math.max(0, 1 - job.leg / 90)) : RIDERS.has(d.id) ? Math.round(job.base * 0.1 * Math.max(0, job.rating - 2.5)) : 0;
          if (tip > 0) { career.earn(tip, 'tip'); job.earned += tip; hud.toast(`Tip: ${money(tip)}${d.id === 'pizza' ? (job.leg < 40 ? ' (still hot!)' : '') : ` · ${stars(job.rating)}`}`, 1.8); }
          else if (d.id === 'pizza') hud.toast('"This pizza\'s cold." No tip.', 1.8);
          job.leg = 0;
          job.stop++;
          if (job.stop >= job.stops.length) { finish(true); return ''; }
          setMarker();
        } else return `${d.name.toUpperCase()} · working… ${Math.ceil(job.waitT)}s`;
      }
      return `${d.name.toUpperCase()} · stop ${job.stop + 1}/${job.stops.length} · ${Math.round(dist)} m · ${clock}${job.veh ? ` · ${stars(job.rating)}` : ''}`;
    },
  };
}
