// 27 jobs. Each job board starts a shift: get the work vehicle (or your
// tools), follow the stops before the clock runs out, get paid per stop.
// Pay grows with your level in that job (every 3 shifts).
import * as THREE from 'three';
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
  { id: 'paper', name: 'Paper Route', at: T(2, 3), veh: null, area: 'town', stops: 7, pay: 18, timer: 540, text: 'The Calvera Courier, door to door around Mill Creek' },
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
  charter: '🛥️', fisherman: '🐟', guide: '🦌', duster: '🌾', tours: '🚁', medevac: '🚑', lumber: '🪓', landscaper: '🌳', construction: '🏗️', electrician: '⚡', plumber: '🚰', ranch: '🐄', bounty: '🎯', paper: '📰' };

// A2: deliveries are made at the door. You walk up with it, knock, they open up and take it from you (or
// nobody's home and it goes on the mat); pizza customers pay you on the step.
const DOOR = {
  parcel: { item: 'parcel', kinds: ['home', 'apartment', 'store', 'office'], verb: 'hand over the parcel', lines: ['Oh, that was quick!', 'Finally! I\'ve been waiting all week.', 'Is that mine? Great, thanks.'], nobody: 0.35, left: 'Nobody home. You leave the parcel on the mat.' },
  pizza: { item: 'pizza', kinds: ['home', 'apartment'], verb: 'hand over the pizza', lines: ['Smells great!', 'About time, I\'m starving.', 'Pizza! Honey, it\'s here!'], pay: true },
  messenger: { item: 'papers', kinds: ['office', 'store'], verb: 'hand over the envelope', lines: ['Thanks. I\'ll sign for it.', 'For me? Thanks.', 'Right on time.'] },
  paper: { item: 'newspaper', kinds: ['home'], verb: 'hand over the paper', lines: ['Morning! Thanks.', 'Ah, the Courier. Thank you.', 'Just in time for my coffee.'], nobody: 0.3, left: 'Nobody answers. You leave the paper on the step.' },
};
const pickL = (a) => a[(Math.random() * a.length) | 0];
// A2: people ride for real: a fare at the curb walks to the passenger door, opens it and gets in; at the
// drop-off they get out and walk off. Bus riders get off and on at every shelter; a patient on the ground
// gets up and is helped into the ambulance, and out at the hospital.
const RIDE = {
  taxi: (i, n) => (i % 2 === 0 ? 'on' : 'off'),
  bus: (i, n) => (i === 0 ? 'on' : i === n - 1 ? 'off' : 'both'),
  paramedic: (i, n) => (i === n - 1 ? 'off' : 'on'),
};
// A2: trades do the work at each stop with their hands: out of the truck, the tool, the job, then on
const WORK = {
  roadcrew: { tool: 'shovel', verb: 'patch the pothole', low: false },
  mechanic: { tool: 'wrench', verb: 'work on the car', low: true },
  plumber: { tool: 'wrench', verb: 'fix the leak', low: true },
  electrician: { tool: 'screwdriver', verb: 'wire the panel', low: false },
  construction: { tool: 'hammer', verb: 'frame the wall', low: false },
  landscaper: { tool: 'trimmer', verb: 'trim the yard', low: false },
  lumber: { tool: 'chainsaw', verb: 'cut the tree', low: false },
  garbage: { tool: 'bin', verb: 'empty the bin', low: false },
  security: { tool: 'flashlight', verb: 'check the door', low: false },
  ranch: { tool: 'hammer', verb: 'mend the fence', low: true },
};

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
    if (def.id === 'messenger' && game.work?.officeStops) { const o = game.work.officeStops(def.stops, from); if (o) { pts.length = 0; pts.push(...o); } }
    if (DOOR[def.id] && game.estate?.doors) atDoors(def, pts);
    if (def.back) pts.push(def.id === 'paramedic' || def.id === 'medevac' ? [CITY.x0 + CITY.nx * CITY.pitch + 24, CITY.z0 + 2 * CITY.pitch] : from);
    return pts;
  };

  // each delivery stop moves to the nearest door of the right kind (a house for the paper, an office for
  // an envelope), [x, z, label, spot]: x/z in front of the door, spot = the door (systems/acts.js doorstep)
  const atDoors = (def, pts) => {
    const E = game.estate, cfg = DOOR[def.id], used = new Set();
    const doors = E.doors.filter((d) => !d.b.ruined && !E.special?.has?.(d.i) && cfg.kinds.includes(E.kindOf(d)));
    for (let i = 0; i < pts.length; i++) {
      let best = null, bd = 140;
      for (const d of doors) { if (used.has(d)) continue; const dd = Math.hypot(d.x - pts[i][0], d.z - pts[i][1]); if (dd < bd) { bd = dd; best = d; } }
      if (!best) continue;
      used.add(best);
      const sp = E.doorSpot(best), who = game.population?.atHome?.(best.i)?.[0];
      pts[i] = [sp.x + sp.nx * 0.9, sp.z + sp.nz * 0.9, who ? `for ${game.population.fullName(who)}` : (pts[i][2] || 'at the door'), sp];
    }
  };
  // a stop's pay, tips, and on to the next (true when that was the last)
  const payStop = (d) => {
    const pay = Math.round(job.base);
    career.earn(pay, d.name); job.earned += pay;
    // tips: riders tip for a smooth ride; pizza tips for hot pizza
    let tip = d.id === 'pizza' ? Math.round(job.base * 0.5 * Math.max(0, 1 - job.leg / 90)) : RIDERS.has(d.id) ? Math.round(job.base * 0.1 * Math.max(0, job.rating - 2.5)) : 0;
    if (tip > 0 && game.work?.sharp?.()) tip = Math.round(tip * 1.2);
    if (tip > 0) { career.earn(tip, 'tip'); job.earned += tip; hud.toast(`Tip: ${money(tip)}${d.id === 'pizza' ? (job.leg < 40 ? ' (still hot!)' : '') : ` · ${stars(job.rating)}`}`, 1.8); }
    else if (d.id === 'pizza') hud.toast('"This pizza\'s cold." No tip.', 1.8);
    job.leg = 0;
    job.stop++;
    if (job.stop >= job.stops.length) { finish(true); return true; }
    setMarker();
    return false;
  };
  // at the door: on foot, F hands it over (acted out); in the work vehicle you park and walk it up
  const doorstepStop = (d, spot, a, free, clock) => {
    const cfg = DOOR[d.id], S = game.S, tag = `${d.name.toUpperCase()} · stop ${job.stop + 1}/${job.stops.length}`;
    game.deliveryDoor = spot.door; // (walking into it doesn't let you in: systems/estate.js)
    if (job.acting) return `${tag} · at the door`;
    const fx = spot.x + spot.nx * 0.9, fz = spot.z + spot.nz * 0.9;
    const dd = Math.hypot(player.pos.x - fx, player.pos.z - fz);
    if (S.mode === 'foot' && dd < 2.4 && !S.doorWalk) {
      if (free && a?.enter) {
        a.enter = false; job.acting = true;
        const who = game.population?.atHome?.(spot.door?.i)?.[0], nobody = !!cfg.nobody && !who && Math.random() < cfg.nobody * 2;
        const run = game.acts?.doorstep(spot, cfg.item, { nobody, leftLine: cfg.left, name: who ? game.population.fullName(who) : '', line: pickL(cfg.lines), pay: !!cfg.pay, thanks: cfg.pay ? '"Keep the change."' : null,
          done: (ok) => { if (!job) return; job.acting = false; if (ok) payStop(d); } });
        if (!run) { job.acting = false; payStop(d); } // (couldn't act it out: just hand it over)
        return '';
      }
      return `${keyHint(game)} ${cfg.verb}`;
    }
    const v = job.veh && game.vehicle() === job.veh ? job.veh : null;
    const from = v ? v.pos : player.pos, far = Math.round(Math.hypot(from.x - fx, from.z - fz));
    if (v && far < 35) return `${tag} · park and take the ${cfg.item === 'papers' ? 'envelope' : cfg.item} to the door · ${clock}`;
    if (job.veh && !v && S.mode !== 'foot') return `${tag} · get back in the vehicle · ${clock}`;
    const what = job.stops[job.stop][2] ? ` · ${job.stops[job.stop][2]}` : '';
    return `${tag}${what} · ${far} m · ${clock}${v ? ` · ${stars(job.rating)}` : ''}`;
  };

  // a trade's stop: walk up to it and do the work, the tool in your hands (the truck waits at the curb)
  const workStop = (d, a, free, clock) => {
    const w = WORK[d.id], S = game.S, [x, z] = job.stops[job.stop], tag = `${d.name.toUpperCase()} · stop ${job.stop + 1}/${job.stops.length}`;
    if (job.acting) return `${tag} · ${w.verb}…`;
    const dd = Math.hypot(player.pos.x - x, player.pos.z - z);
    if (S.mode === 'foot' && dd < 3.2 && !S.doorWalk) {
      if (free && a?.enter) {
        a.enter = false; job.acting = true;
        const at = { x, z, y: game.collision.surface(x, z, player.pos.y + 1) };
        const run = game.acts.play(game.acts.workBeats(at, w.tool, Math.max(2.5, d.wait || 4), w.low), { done: (ok) => { if (!job) return; job.acting = false; if (ok) payStop(d); } });
        if (!run) { job.acting = false; payStop(d); }
        return '';
      }
      return `${keyHint(game)} ${w.verb}`;
    }
    const v = job.veh && game.vehicle() === job.veh ? job.veh : null;
    const from = v ? v.pos : player.pos, far = Math.round(Math.hypot(from.x - x, from.z - z));
    if (v && far < 30) return `${tag} · park and get out to ${w.verb} · ${clock}`;
    if (job.veh && !v && S.mode !== 'foot') return `${tag} · get back in the vehicle · ${clock}`;
    const what = job.stops[job.stop][2] ? ` · ${job.stops[job.stop][2]}` : '';
    return `${tag}${what} · ${far} m · ${clock}${v ? ` · ${stars(job.rating)}` : ''}`;
  };

  // ---- riders (taxi, bus, ambulance)
  const sideOf = (v, k) => new THREE.Vector3(-Math.cos(v.heading) * k, 0, Math.sin(v.heading) * k); // (the passenger side)
  const fwdOf = (v, k) => new THREE.Vector3(Math.sin(v.heading) * k, 0, Math.cos(v.heading) * k);
  const seatRiders = (dt) => { // they ride along, seated
    const v = job.veh; if (!v || !job.riders) return;
    for (const r of job.riders) if (r.seated) { r.h.update(dt); if (v.cabLayout) v.seat(r.h, r.seat); else r.h.root.visible = false; }
  };
  const riderStop = (d, dt, clock) => {
    const v = job.veh;
    job.riders = job.riders || [];
    seatRiders(dt);
    if (game.vehicle() !== v) return null;
    const [x, z] = job.stops[job.stop], tag = `${d.name.toUpperCase()} · stop ${job.stop + 1}/${job.stops.length}`;
    const B = job.board;
    if (B) { // the people getting off and on, one after another
      B.t += dt;
      const door = v.door?.('door-pass'), W = (v.spec.width || 1.9) / 2;
      const doorPt = v.pos.clone().add(sideOf(v, W + 0.6)).add(fwdOf(v, d.id === 'bus' ? (v.spec.len || 10) * 0.38 : 0.1));
      const swing = (k) => { if (door) door.rotation.y = door.userData.open * Math.max(0, Math.min(1, k)); };
      const cur = B.q[0];
      if (!cur) { swing(1 - B.t / 0.4); if (B.t > 0.45) { job.board = null; if (game.S.holdCar === 'riders') game.S.holdCar = false; payStop(d); } return `${tag} · ${clock}`; }
      if (cur.kind === 'off') {
        const r = cur.r;
        if (!cur.out) { swing(B.t / 0.4); if (B.t > 0.45) { cur.out = true; r.seated = false; r.h.root.visible = true; r.pos.copy(doorPt); r.pos.y = game.collision.surface(r.pos.x, r.pos.z, v.pos.y + 1); r.heading = v.heading + Math.PI / 2 * (d.id === 'bus' ? 1 : -1); r.h.play('Idle_Loop', 0.2, 1, true); cur.to = r.pos.clone().add(sideOf(v, 5)).add(fwdOf(v, (Math.random() - 0.5) * 6)); if (cur.line) hud.toast(cur.line, 2); } }
        else { const there = r.walk(cur.to, dt, 1.3); r.sync(dt); if (there || B.t > 4.5) { r.remove(); job.riders.splice(job.riders.indexOf(r), 1); B.q.shift(); B.t = 0.45; } }
      } else { // on: from the curb to the door, in
        const r = cur.r;
        if (!cur.at) { const there = r.walk(doorPt, dt, d.id === 'paramedic' ? 0.9 : 1.4); r.sync(dt); if (there || B.t > 9) { cur.at = true; B.t = 0; r.face(v.pos, 1); r.h.play('Interact', 0.1, 1.6, true); } }
        else { r.sync(dt); swing(B.t / 0.4); if (B.t > 0.6) { r.seated = true; r.seat = cur.seat; r.h.play('Sitting_Idle_Loop', 0.2, 1, true); job.riders.push(r); B.q.shift(); B.t = 0.45; if (cur.line) game.law?.say?.(d.id === 'paramedic' ? 'Patient' : 'Passenger', cur.line, 3); } }
      }
      return `${tag} · ${cur.kind === 'off' ? 'dropping off' : d.id === 'paramedic' ? 'the patient is getting in' : 'picking up'} · ${clock}`;
    }
    const dist = Math.hypot(v.pos.x - x, v.pos.z - z);
    if (dist < job.marker.r && Math.abs(v.speed) < 1.2) {
      const kind = RIDE[d.id](job.stop, job.stops.length), q = [];
      if (kind === 'off' || kind === 'both') {
        const n = d.id === 'bus' ? Math.min(job.riders.length, 1 + ((Math.random() * 2) | 0)) : job.riders.length;
        for (const r of job.riders.slice(0, n)) q.push({ kind: 'off', r, line: d.id === 'taxi' ? pickL(['"Keep the change."', '"Thanks, this is me."', '"Right here\'s fine."']) : d.id === 'paramedic' ? '"Thank you... thank you."' : '' });
      }
      if (kind === 'on' || kind === 'both') {
        const n = d.id === 'bus' ? 1 + ((Math.random() * 2) | 0) : 1;
        const lay = v.cabLayout?.seats?.length || 2;
        for (let i = 0; i < n; i++) {
          const curb = v.pos.clone().add(sideOf(v, (v.spec.width || 1.9) / 2 + 2.6)).add(fwdOf(v, (i - 0.5) * 1.6 + (d.id === 'bus' ? 3 : 0)));
          const r = game.acts.person(curb, v.heading - Math.PI / 2);
          if (d.id === 'paramedic') r.h.play('Crouch_Idle_Loop', 0, 1, true); // (they've been sitting on the curb, hurt)
          q.push({ kind: 'on', r, seat: Math.min(lay - 1, d.id === 'taxi' ? 2 : 1 + ((job.riders.length + i) % Math.max(1, lay - 1))), line: d.id === 'taxi' ? pickL(['"Take me downtown, please."', '"I\'m late. Step on it."', '"Evening. Out to the address on the app."']) : d.id === 'paramedic' ? '"It hurts... my leg."' : '' });
        }
      }
      job.board = { q, t: 0 };
      game.S.holdCar = 'riders';
      return `${tag} · ${clock}`;
    }
    return null;
  };

  const setMarker = () => {
    if (job.marker) interact.remove(job.marker);
    const [x, z] = job.stops[job.stop];
    const r = job.def.fly ? 26 : job.def.veh === null || job.def.kind ? 3 : 7;
    job.marker = interact.add({ x, z, r, any: true, marker: true, noUse: !!(DOOR[job.def.id] && job.stops[job.stop]?.[3]) || !!(WORK[job.def.id] && game.acts), height: job.def.fly ? 60 : 6, color: 0xffe040, blip: { color: '#ffe040', size: 7, global: true, icon: '📍', bg: 'rgba(160,120,0,0.9)' }, label: () => '', use: () => {} });
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
      if (bonus > 0) { career.earn(bonus, 'time bonus'); job.earned += bonus; }
      // the shift's rating: dispatch texts it, good shifts add up to employee of the month
      j.earned = (j.earned || 0) + job.earned; j.lastRating = job.rating; j.best = Math.max(j.best || 0, job.rating);
      if (job.rating >= 4.5) j.good = (j.good || 0) + 1;
      hud.bigMessage('SHIFT COMPLETE', `${d.name} · earned ${money(job.earned)} · ${stars(job.rating)}`, 3);
      game.text?.(`${d.name} dispatch`, job.rating >= 4.5 ? `Great shift. ${stars(job.rating)} Keep it up.` : job.rating >= 3 ? `Shift logged. ${stars(job.rating)}` : `We had complaints. ${stars(job.rating)} Drive like it's your own.`);
      if (j.good === 5) { career.earn(500, 'employee of the month'); hud.toast(`Employee of the month: ${d.name}! +$500`, 3.5); game.news?.(`Local ${d.name.toLowerCase()} named employee of the month.`); }
    } else hud.bigMessage('SHIFT OVER', msg || d.name, 2.5);
    if (job.veh && d.siren) job.veh.siren = false;
    for (const r of job.riders || []) r.remove();
    if (job.board) { for (const q of job.board.q) if (q.kind === 'on' && !job.riders?.includes(q.r)) q.r.remove(); if (game.S.holdCar === 'riders') game.S.holdCar = false; }
    const ended = job; job = null; career.saveSoon();
    if (ended.veh && game.S.entering?.v === ended.veh) game.cancelEnter?.(); // (quit before you got in: you stop walking to it)
    try { game.work?.shiftEnded?.(d.id, ok, { rating: ended.rating, earned: ended.earned, msg, wrecked: !!ended.wrecked, opts: ended.opts }); } catch (e) { console.error('[jobs] ' + (e && e.message), e); }
  };

  const start = (def, opts = null) => {
    if (job) return finish(false, 'You quit the shift');
    if (P.jobs[def.id]?.firedDay === game.sky?.day) return hud.toast(`${def.name}: "After what you did to the truck? Come back tomorrow."`, 3);
    if (def.tool && !game.tools.hasTrade(def.tool)) return hud.toast(`You need ${def.tool === 'mech' ? 'mechanic' : def.tool === 'build' ? 'construction' : def.tool === 'elec' ? 'electrical' : def.tool === 'plumb' ? 'plumbing' : 'yard'} tools (hardware store)`, 3);
    const from = where(def);
    // the night shift pays a quarter more
    const h = game.sky?.hour ?? 12, night = h >= 22 || h < 6;
    job = { def, opts, stop: 0, t: def.timer, earned: 0, base: def.pay * (1 + (lvl(def.id) - 1) * 0.15) * (game.work?.payMult?.(def.id) ?? 1) * (night ? 1.25 : 1) * (def.air && P.pilotLicence ? 1.15 : 1) /* a pilot's licence pays (systems/aviation.js) */, night, rating: 5, hp0: null, gripeT: 0, leg: 0, count0: def.kind === 'catch' ? P.stats.fishCaught : P.stats.animals };
    if (def.kind === 'bounty') {
      const p = roadPointAround(graph, CITY.x0 + 380, CITY.z0 + 280, 60, 380);
      job.target = game.peds.spawnAt(p.x, p.z, player.pos);
      if (job.target) { job.target.bounty = true; job.target.hp = (job.target.hp || 100) * 2; }
      job.stops = [[p.x, p.z]]; setMarker();
    } else if (def.kind) { job.stops = []; }
    else {
      job.stops = stopPoints(def, from);
      // the work vehicle
      if (def.veh) { const r = nearestRoad(graph, from[0], from[1]); job.veh = spawnParked(game, def.veh, r.x, r.z, Math.atan2(r.tx, r.tz)); job.veh.issued = true; if (!game.walkIntoVehicle?.(job.veh)) game.enterVehicle(job.veh); } // (A2: you walk to it)
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
      label: () => job && job.def === def ? `${keyHint(game)} quit the ${def.name} shift` : game.work?.boardLabel?.(def) || `${keyHint(game)} work as ${def.name} (${rankOf(lvl(def.id))}, level ${lvl(def.id)} · ~${money((def.pay * (1 + (lvl(def.id) - 1) * 0.15)) * (def.stops || def.need || 1))})`,
      use: () => (job && job.def === def) || !game.work?.ready ? start(def) : game.work.talk(def.id) });
    def.board = interact.points[interact.points.length - 1];
  }

  return {
    JOBS, rankOf, where, get active() { return job; },
    atDoor() { const st = job && DOOR[job.def.id] && job.stops[job.stop], sp = st && st[3]; return !!sp && Math.hypot(player.pos.x - (sp.x + sp.nx * 0.9), player.pos.z - (sp.z + sp.nz * 0.9)) < 2.6; }, start: (id, opts) => start(JOBS.find((j) => j.id === id), opts),
    update(dt, a, free) {
      if (!job) game.deliveryDoor = null;
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
          const j = P.jobs[d.id] || (P.jobs[d.id] = { level: 1, xp: 0, runs: 0 }); j.firedDay = game.sky?.day; job.wrecked = true;
          finish(false, `You wrecked the ${d.name.toLowerCase()}'s vehicle. Sent home for today.`); return '';
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
      const ds = DOOR[d.id] && job.stops[job.stop]?.[3];
      if (ds) return doorstepStop(d, ds, a, free, clock);
      if (WORK[d.id] && game.acts) return workStop(d, a, free, clock);
      if (RIDE[d.id] && game.acts && job.veh) { const r = riderStop(d, dt, clock); if (r != null) return r; }
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
          if (payStop(d)) return '';
        } else return `${d.name.toUpperCase()} · working… ${Math.ceil(job.waitT)}s`;
      }
      const what = job.stops[job.stop][2] ? ` · ${job.stops[job.stop][2]}` : '';
      return `${d.name.toUpperCase()} · stop ${job.stop + 1}/${job.stops.length}${what} · ${Math.round(dist)} m · ${clock}${job.veh ? ` · ${stars(job.rating)}` : ''}`;
    },
  };
}
