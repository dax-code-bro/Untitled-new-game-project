// Story: 63 missions in three acts. All characters, places and events are original.
//
// SOUTHBOUND — Eli Navarro, a shrimp-boat captain who left Calvera after a
// fire on the docks, comes home when his brother Danny turns up dead in the
// bayou. Port Calvera is split between the Delacroix family (old money that
// owns the harbor) and the Ríos crew (newcomers moving product up the Gulf),
// with police captain Harlan Voss selling protection to both. Eli's allies:
// Tía Lupe (mechanic, Calvera Customs), Skeeter Boudreaux (crop-duster pilot),
// and Mara Quint (reporter at the Gulf Ledger).
//
// Each step is one objective:
//   goto place | drive place | steal type place | deliver place | kill n place | escape stars
//   boat place | fly place | hunt n | fish n | survive seconds | pay amount | talk
import { CITY, TOWN, LAKE, BAYOU, PLAINS, FOREST, AIRFIELD } from '../world/layout.js';
import { roadPointAround, nearestRoad, spawnParked, money, keyHint } from './world-util.js';

const ACTS = ['Act I · Homecoming', 'Act II · The Harbor War', 'Act III · Southbound'];
const W = {
  lupe: 'Tía Lupe', mara: 'Mara Quint', skeet: 'Skeeter Boudreaux', voss: 'Capt. Harlan Voss', ana: 'Ana Delacroix', remy: 'Remy Delacroix', rios: 'Tomas Ríos', june: 'June Navarro', padre: 'Father Ambrose', otis: 'Otis Thibodeaux',
};
// [contact, title, brief, steps, reward]
const M = [
  // ---------------- ACT I · Homecoming (21) ----------------
  ['june', 'Home Again', 'Your mother asks you to come straight to the house. Danny\'s things are still in his room.', [['goto', 'millcreek']], 500],
  ['june', 'Danny\'s Truck', 'Danny\'s pickup is still in the impound lot downtown. Bring it home.', [['steal', 'pickup_03', 'impound'], ['deliver', 'millcreek']], 800],
  ['lupe', 'Lupe\'s Garage', 'Lupe knew Danny. Meet her at Calvera Customs.', [['drive', 'customs'], ['talk']], 600],
  ['lupe', 'Test Drive', 'A customer\'s car needs a road test before it goes back. Don\'t scratch it.', [['steal', 'coupe_03', 'customs'], ['drive', 'airfield'], ['deliver', 'customs']], 1200],
  ['mara', 'The Reporter', 'A reporter has been asking about Danny. She wants to meet at the harbor.', [['drive', 'harbor'], ['talk']], 500],
  ['mara', 'Paper Trail', 'Mara needs files from a Delacroix shipping office. Get in and out.', [['goto', 'downtown'], ['survive', 25], ['escape', 1]], 1500],
  ['otis', 'Bayou Bait', 'Old Otis ran shrimp with Danny. He\'ll talk if you help him fill the cooler.', [['drive', 'bayou'], ['fish', 2]], 900],
  ['otis', 'Gator Country', 'Something has been hitting Otis\'s traps. Deal with it.', [['goto', 'bayou'], ['hunt', 1]], 1100],
  ['otis', 'Where Danny Went', 'Otis saw Danny\'s skiff go out the night he died. Take a boat and look.', [['boat', 'lakemid']], 1300],
  ['skeet', 'The Duster', 'Skeeter Boudreaux flies crops out of Redgrass. He saw lights over the bayou that night.', [['drive', 'airfield'], ['talk']], 600],
  ['skeet', 'Low and Slow', 'Ride along: fly the duster over the plains and photograph the landing strip nobody owns.', [['fly', 'plainsfar'], ['fly', 'airfield']], 2000],
  ['mara', 'Tailing Remy', 'Remy Delacroix drives a gold coupe. Follow him to his meeting.', [['drive', 'downtown'], ['drive', 'harbor']], 1400],
  ['voss', 'A Friendly Warning', 'Captain Voss wants a word at the precinct. Go — it\'s worse if you don\'t.', [['goto', 'precinct'], ['talk']], 300],
  ['voss', 'Errand for Voss', 'Voss says a favor clears the air. Pick up a "package" from a car on the east side.', [['steal', 'sedan_05', 'eastside'], ['deliver', 'precinct']], 2500],
  ['lupe', 'Parts Run', 'Lupe\'s supplier in Mill Creek is short. Bring the engine parts back before close.', [['drive', 'millcreek'], ['drive', 'customs']], 1000],
  ['rios', 'Tomas Ríos', 'Tomas Ríos sends a car for you. He says he knows who killed Danny.', [['goto', 'riverbend'], ['talk']], 800],
  ['rios', 'Proof of Trust', 'Ríos wants a Delacroix van taken off the road.', [['steal', 'delivery', 'harbor'], ['deliver', 'riverbend'], ['escape', 2]], 3500],
  ['mara', 'The Ledger', 'Mara\'s office was broken into. Get there before whoever did it gets away.', [['drive', 'downtown'], ['kill', 2, 'downtown']], 2200],
  ['june', 'Sunday Dinner', 'Your mother insists. Bring something from the lake.', [['drive', 'lake'], ['fish', 1], ['drive', 'millcreek']], 700],
  ['otis', 'The Burned Dock', 'Otis shows you where the fire started years ago. It wasn\'t an accident.', [['boat', 'harborwater'], ['goto', 'harbor']], 1500],
  ['ana', 'Ana Delacroix', 'Remy\'s sister wants to meet in private. She says her family didn\'t kill Danny.', [['drive', 'lakehouse'], ['talk']], 2000],
  // ---------------- ACT II · The Harbor War (21) ----------------
  ['ana', 'Family Business', 'Ana wants proof Voss is double-dealing. Watch his drop at the airfield.', [['drive', 'airfield'], ['survive', 30]], 2500],
  ['skeet', 'Night Flight', 'Follow the unmarked plane in Skeeter\'s duster and see where it lands.', [['fly', 'plainsfar'], ['fly', 'sierra'], ['fly', 'airfield']], 4000],
  ['rios', 'Shipment', 'Ríos needs a boat run from the bayou to the harbor. No police.', [['boat', 'harborwater'], ['escape', 1]], 4500],
  ['remy', 'Remy\'s Offer', 'Remy Delacroix offers money to walk away. Hear him out.', [['drive', 'downtown'], ['talk']], 5000],
  ['remy', 'Collateral', 'Remy wants a Ríos car burned. You only have to bring it to the lot.', [['steal', 'muscle_04', 'riverbend'], ['deliver', 'impound'], ['escape', 2]], 5000],
  ['lupe', 'Armor Up', 'Lupe can armor a car if you bring her one worth armoring.', [['steal', 'suv_06', 'eastside'], ['deliver', 'customs']], 3000],
  ['mara', 'Source', 'A dockworker will talk, but men are watching him. Get him clear.', [['drive', 'harbor'], ['kill', 3, 'harbor'], ['escape', 2]], 6000],
  ['otis', 'Hunter\'s Moon', 'Otis takes you into the forest to talk where no one listens.', [['drive', 'forest'], ['hunt', 2]], 2500],
  ['voss', 'Squeeze', 'Voss sends a cruiser to pick you up. Don\'t get in it.', [['escape', 3]], 4000],
  ['rios', 'Lake Drop', 'Pick up a waterproof case dropped in Lake Arden.', [['boat', 'lakemid'], ['boat', 'lakeshore']], 4500],
  ['ana', 'The Accountant', 'Ana\'s accountant has the books on Voss. He\'s hiding in Mill Creek.', [['drive', 'millcreek'], ['survive', 20], ['drive', 'lakehouse']], 5500],
  ['skeet', 'Crash Site', 'A plane went down in the Sierra Norte. Get there first.', [['fly', 'sierra'], ['goto', 'sierra']], 6000],
  ['mara', 'Front Page', 'Mara publishes. Keep her safe until the paper hits the street.', [['drive', 'downtown'], ['survive', 40], ['escape', 2]], 7000],
  ['rios', 'Turncoat', 'Ríos thinks you sold him out. Convince him otherwise — or don\'t.', [['drive', 'riverbend'], ['kill', 3, 'riverbend']], 6500],
  ['lupe', 'Burned Out', 'Someone torched Calvera Customs. Find out who was seen running.', [['drive', 'customs'], ['drive', 'eastside'], ['kill', 1, 'eastside']], 5000],
  ['june', 'Leave Town', 'Get your mother out to the lake house until things cool down.', [['drive', 'millcreek'], ['drive', 'lakehouse']], 2000],
  ['remy', 'Gold Coupe', 'Remy\'s car is the key to his storage unit. Take it.', [['steal', 'super_04', 'downtown'], ['deliver', 'customs'], ['escape', 3]], 9000],
  ['otis', 'Low Tide', 'The smugglers use the bayou channels at low tide. Run them by airboat.', [['boat', 'bayouwater'], ['boat', 'harborwater']], 6000],
  ['ana', 'Ana\'s Choice', 'Ana asks you to meet her brother with her. It could be a trap.', [['drive', 'harbor'], ['kill', 4, 'harbor']], 9000],
  ['voss', 'The Badge', 'Voss\'s second-in-command will testify if you get her to the courthouse alive.', [['drive', 'precinct'], ['drive', 'downtown'], ['escape', 3]], 10000],
  ['mara', 'What Danny Knew', 'Danny\'s notebook is in a safe deposit box. Mara has the key.', [['drive', 'downtown'], ['talk']], 5000],
  // ---------------- ACT III · Southbound (21) ----------------
  ['padre', 'Confession', 'Father Ambrose buried Danny. He has something he never told the police.', [['drive', 'millcreek'], ['talk']], 3000],
  ['skeet', 'Wings', 'You\'ll need to move fast. Skeeter teaches you to fly a helicopter.', [['drive', 'airfield'], ['fly', 'lakemid'], ['fly', 'airfield']], 8000],
  ['lupe', 'Rebuild', 'Lupe is back in business. Buy her a new work truck.', [['pay', 25000], ['steal', 'pickup_07', 'customs'], ['deliver', 'customs']], 30000],
  ['rios', 'Last Deal', 'Tomas Ríos wants out of Calvera. Get his family to the airfield.', [['drive', 'riverbend'], ['drive', 'airfield'], ['escape', 2]], 12000],
  ['ana', 'The Storage Unit', 'Remy\'s unit holds the harbor fire evidence. Get it before he moves it.', [['drive', 'eastside'], ['kill', 3, 'eastside'], ['escape', 3]], 12000],
  ['mara', 'Broadcast', 'Channel 9 will air the story if the tape reaches them by helicopter.', [['fly', 'downtownair'], ['fly', 'airfield']], 10000],
  ['otis', 'Old Friends', 'Otis is taken by Voss\'s men. They\'re holding him at the bayou landing.', [['drive', 'bayou'], ['kill', 4, 'bayou']], 14000],
  ['voss', 'Cornered', 'Voss puts every cruiser in the state on you.', [['escape', 4]], 15000],
  ['june', 'Mother\'s Ring', 'Your mother asks for one thing: her ring, sold by Danny to pay a debt. Buy it back.', [['pay', 15000], ['drive', 'lakehouse']], 5000],
  ['remy', 'Remy Runs', 'Remy is making a run for the Gulf by speedboat. Catch him.', [['boat', 'harborwater'], ['boat', 'gulf']], 18000],
  ['ana', 'Family Ties', 'Ana turns on Voss in public. Stay close and keep her alive.', [['drive', 'downtown'], ['survive', 45]], 15000],
  ['lupe', 'Getaway Car', 'Lupe builds you the fastest thing in Calvera. Pick it up.', [['steal', 'super_06', 'customs'], ['drive', 'airfield'], ['deliver', 'customs']], 20000],
  ['skeet', 'Air Drop', 'Drop supplies to Otis\'s people in the bayou.', [['fly', 'bayouair'], ['fly', 'airfield']], 16000],
  ['padre', 'Sanctuary', 'Witnesses are hiding at the church. Move them to the lake house.', [['drive', 'millcreek'], ['drive', 'lakehouse'], ['escape', 2]], 14000],
  ['mara', 'Hearing', 'The state hearing starts tomorrow. Get Mara\'s evidence there.', [['drive', 'downtown'], ['goto', 'precinct']], 12000],
  ['voss', 'The Fire', 'You know who set the dock fire now. So does Voss. He wants to meet at the burned dock.', [['drive', 'harbor'], ['kill', 5, 'harbor']], 25000],
  ['rios', 'Debts Paid', 'Ríos leaves one last thing for you: the plane that brought it all in. Burn it.', [['drive', 'plainsfar'], ['survive', 20], ['escape', 3]], 20000],
  ['ana', 'New Harbor', 'Ana wants the harbor run clean. Clear the last of Remy\'s crew.', [['drive', 'harbor'], ['kill', 4, 'harbor']], 22000],
  ['june', 'Danny\'s Boat', 'The family shrimp boat is yours. Take her out on the Gulf one more time.', [['boat', 'gulf'], ['fish', 2]], 15000],
  ['otis', 'Gulf Coast', 'Otis wants a ride along the coast at sunset.', [['boat', 'harborwater']], 10000],
  ['june', 'Southbound', 'Everyone you saved is waiting at the lake house.', [['drive', 'lakehouse'], ['talk']], 50000],
];
export const MISSIONS = M.map(([who, title, brief, steps, reward], i) => ({ id: `m${String(i + 1).padStart(2, '0')}`, act: ACTS[Math.floor(i / 21)], who: W[who], title, brief, steps, reward }));

export function installMissions(game) {
  const { career, interact, hud, player, graph } = game;
  const P = career.p;
  // named places
  const cx = CITY.x0, cz = CITY.z0, pc = CITY.pitch;
  const places = {
    millcreek: [TOWN.x0 + 150, TOWN.z0 + 110], customs: [cx + 2 * pc, cz + CITY.nz * pc - 8], impound: [cx + 7 * pc, cz + 5 * pc], downtown: CITY.downtown,
    harbor: game.marineAir?.marinas?.[1] ? [game.marineAir.marinas[1].land.x, game.marineAir.marinas[1].land.z] : [cx + 3 * pc, cz + 6 * pc],
    precinct: [cx - 24, cz + pc], eastside: [cx + 8 * pc - 10, cz + 2 * pc], riverbend: [-160, 280], lake: [LAKE.x + LAKE.r + 30, LAKE.z],
    lakehouse: [LAKE.x - LAKE.r - 20, LAKE.z + 60], bayou: [BAYOU.x + 200, BAYOU.z - 200], airfield: [AIRFIELD.x1 - 70, AIRFIELD.z - 50], forest: [FOREST.x + 250, FOREST.z + 230],
    plainsfar: [PLAINS.x + 350, PLAINS.z - 300], sierra: [400, -1700], lakemid: [LAKE.x, LAKE.z], lakeshore: [LAKE.x + LAKE.r * 0.8, LAKE.z],
    harborwater: game.marineAir?.marinas?.[1] ? [game.marineAir.marinas[1].water.x, game.marineAir.marinas[1].water.z + 60] : [cx + 3 * pc, 1500],
    bayouwater: game.marineAir?.marinas?.[2] ? [game.marineAir.marinas[2].water.x, game.marineAir.marinas[2].water.z] : [BAYOU.x, BAYOU.z],
    gulf: [cx + 500, 1750], downtownair: [CITY.downtown[0], CITY.downtown[1]], bayouair: [BAYOU.x, BAYOU.z],
  };
  // snap land places onto roads so they are reachable
  for (const k of ['millcreek', 'customs', 'impound', 'downtown', 'precinct', 'eastside', 'riverbend', 'lakehouse', 'airfield']) { const r = nearestRoad(graph, places[k][0], places[k][1]); if (r && r.dist < 120) places[k] = [r.x, r.z]; }

  // subtitles
  const sub = document.createElement('div');
  sub.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);max-width:min(760px,90vw);text-align:center;color:#fff;font:600 17px Inter,system-ui,sans-serif;text-shadow:0 2px 6px #000,0 0 2px #000;z-index:15;pointer-events:none;opacity:0;transition:opacity .3s';
  document.body.appendChild(sub);
  let subT = 0;
  const say = (who, line, t = 5) => { sub.innerHTML = `<span style="color:#ffcf6a">${who}:</span> ${line}`; sub.style.opacity = 1; subT = t; };

  let run = null; // { m, step, marker, target, t, count0, veh, foes[] }
  const nextMission = () => MISSIONS.find((m) => !P.missions.done.includes(m.id));
  const giverPoint = interact.add({ x: 0, z: 0, r: 2.4, color: 0xff3040, height: 3, blip: { color: '#ff3040', size: 7, global: true },
    show: () => !run && !!nextMission() && !game.S.indoors,
    label: () => { const m = nextMission(); return m ? `${keyHint(game)} start "${m.title}" — ${m.who} (${MISSIONS.indexOf(m) + 1}/63)` : ''; },
    use: () => begin(nextMission()) });
  const placeGiver = () => {
    const m = nextMission(); if (!m) return;
    const first = m.steps.find((s) => s[0] !== 'talk' && s[0] !== 'pay' && s[0] !== 'escape' && s[0] !== 'survive' && s[0] !== 'fish' && s[0] !== 'hunt');
    const key = (first && (first[2] || first[1])) || 'downtown';
    const p = places[typeof key === 'string' && places[key] ? key : 'downtown'];
    const near = roadPointAround(graph, p[0], p[1], 30, 120);
    giverPoint.x = near.x + 4; giverPoint.z = near.z; giverPoint.y = game.hm.height(giverPoint.x, giverPoint.z);
  };
  placeGiver();

  const mark = (x, z, r = 7, opts = {}) => { if (run.marker) interact.remove(run.marker); run.marker = interact.add({ x, z, r, any: true, height: opts.height || 8, color: 0xff3040, blip: { color: '#ff3040', size: 7, global: true }, label: () => '', use: () => {} }); };
  const begin = (m) => {
    run = { m, step: -1, t: 0 };
    hud.bigMessage(m.title.toUpperCase(), `${m.act} · ${m.who}`, 3.5);
    say(m.who, m.brief, 7);
    advance();
  };
  const advance = () => {
    run.step++;
    if (run.marker) { interact.remove(run.marker); run.marker = null; }
    const s = run.m.steps[run.step];
    if (!s) return complete();
    const [kind, a1, a2] = s;
    run.t = 0; run.count0 = kind === 'fish' ? P.stats.fishCaught : P.stats.animals;
    const at = (k) => places[k] || places.downtown;
    if (kind === 'goto' || kind === 'drive' || kind === 'deliver') { const [x, z] = at(a1); mark(x, z, kind === 'goto' ? 4 : 8); }
    else if (kind === 'boat') { const [x, z] = at(a1); mark(x, z, 22, { height: 12 }); }
    else if (kind === 'fly') { const [x, z] = at(a1); mark(x, z, 60, { height: 80 }); }
    else if (kind === 'steal') {
      const [x, z] = at(a2); const r = nearestRoad(graph, x + 20, z + 10);
      run.veh = spawnParked(game, a1, r.x + r.tz * 3, r.z - r.tx * 3, Math.atan2(r.tx, r.tz));
      mark(run.veh.pos.x, run.veh.pos.z, 3);
    } else if (kind === 'kill') {
      const [x, z] = at(a2); run.foes = [];
      for (let i = 0; i < a1; i++) { const p = game.peds.spawnAt(x + (Math.random() - 0.5) * 20, z + (Math.random() - 0.5) * 20, player.pos); if (p) { p.foe = true; run.foes.push(p); } }
      mark(x, z, 25, { height: 4 });
    } else if (kind === 'escape') { game.police.wanted = Math.max(game.police.wanted || 0, a1); game.police.cool = 0; }
    else if (kind === 'pay') { if (!career.spend(a1)) { say(run.m.who, `Come back when you have ${money(a1)}.`, 4); fail(); } else advance(); }
    else if (kind === 'talk') { const lines = ['We\'ll talk more soon.', 'Keep your head down.', 'Danny trusted you. So do I.', 'This town has a long memory.']; say(run.m.who, lines[Math.floor(Math.random() * lines.length)], 4); setTimeout(() => run && advance(), 2500); }
  };
  const complete = () => {
    const m = run.m;
    P.missions.done.push(m.id);
    career.earn(m.reward, 'mission');
    hud.bigMessage('MISSION PASSED', `${m.title} · ${money(m.reward)}`, 4);
    run = null; placeGiver(); career.save();
  };
  const fail = (why) => {
    if (!run) return;
    if (run.marker) interact.remove(run.marker);
    hud.bigMessage('MISSION FAILED', why || run.m.title, 3);
    run = null; placeGiver();
  };

  return {
    MISSIONS, places, get active() { return run; },
    start: (i) => begin(MISSIONS[i]),
    update(dt) {
      if (subT > 0 && (subT -= dt) <= 0) sub.style.opacity = 0;
      if (!run || game.S.frozen) return '';
      if (game.player.health <= 0) { fail('You died'); return ''; }
      const s = run.m.steps[run.step];
      if (!s) return '';
      const [kind, a1] = s;
      run.t += dt;
      const v = game.vehicle();
      const pos = v ? v.pos : player.pos;
      const mk = run.marker;
      const inMarker = mk && Math.hypot(pos.x - mk.x, pos.z - mk.z) < mk.r;
      const label = `${run.m.title.toUpperCase()} · `;
      switch (kind) {
        case 'goto': if (inMarker && game.S.mode === 'foot') advance(); return label + 'go to the marker';
        case 'drive': if (inMarker && v) advance(); return label + (v ? 'drive to the marker' : 'get a vehicle and drive to the marker');
        case 'boat': if (inMarker && v && v.isBoat) advance(); return label + (v && v.isBoat ? 'take the boat to the marker' : 'get a boat (marina) and reach the marker');
        case 'fly': if (inMarker && v && v.isAir) advance(); return label + (v && v.isAir ? 'fly through the marker' : 'get an aircraft (airfield)');
        case 'steal': if (v && v === run.veh) advance(); else if (run.veh && run.marker) { run.marker.x = run.veh.pos.x; run.marker.z = run.veh.pos.z; } return label + 'take the marked vehicle';
        case 'deliver': if (inMarker && v === run.veh && Math.abs(v.speed) < 2) advance(); return label + (v === run.veh ? 'deliver it to the marker' : 'get back in the vehicle');
        case 'kill': { const left = run.foes.filter((p) => p.mode !== 'dead' && p.hp > 0).length; if (!left) advance(); return label + `take out the targets (${left} left)`; }
        case 'escape': { const w = game.police.wanted || 0; if (w === 0 && run.t > 2) advance(); return label + 'lose the police'; }
        case 'survive': if (run.t >= a1) advance(); return label + `hold on ${Math.ceil(a1 - run.t)}s`;
        case 'fish': { const got = P.stats.fishCaught - run.count0; if (got >= a1) advance(); return label + `catch fish ${got}/${a1}`; }
        case 'hunt': { const got = P.stats.animals - run.count0; if (got >= a1) advance(); return label + `hunt and skin ${got}/${a1}`; }
        default: return label;
      }
    },
  };
}
