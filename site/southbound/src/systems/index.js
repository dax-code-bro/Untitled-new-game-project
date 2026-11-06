// Installs every gameplay system and runs them each frame.
import { installGarage } from './garage.js';
import { installMarineAir } from './marine-air.js';
import { installEstate } from './estate.js';
import { installTools } from './tools.js';
import { installHunting } from './hunting.js';
import { installFishing } from './fishing.js';
import { installJobs } from './jobs.js';
import { installMissions } from './missions.js';
import { installPhone } from './phone.js';
import { installKerbside } from './kerbside.js';
import { installPopulation } from './population.js';
import { installDriving } from './driving.js';
import { installGunwork } from './gunwork.js';
import { installAmbient } from './ambient.js';
import { installPolicePlus } from './policeplus.js';
import { installSplashes } from './splashes.js';
import { installWilds } from './wilds.js';
import { installPhonePlus } from './phoneplus.js';
import { installPrints } from './prints.js';
import { installPropertyPlus } from './propertyplus.js';
import { installFoodPlus } from './foodplus.js';
import { installCrew } from './crew.js';
import { installMissionsPlus } from './missionsplus.js';

export function installSystems(game) {
  const list = [];
  const add = (name, sys) => { game[name] = sys; list.push(sys); return sys; };
  add('garage', installGarage(game));
  add('marineAir', installMarineAir(game));
  // GPS waypoint: a tall marker + map blip that clears when you arrive
  let wp = null;
  game.setWaypoint = (x, z, label = 'Waypoint') => {
    if (wp) game.interact.remove(wp);
    wp = game.interact.add({ x, z, r: 6, any: true, height: 40, color: 0xff4060, marker: true, label: () => label, blip: { color: '#ff4060', size: 7, global: true, icon: '📍', bg: 'rgba(190,20,60,0.95)' }, use: () => {} });
    game.hud.toast(`GPS: ${label}`, 2);
  };
  add('waypoint', { update() { if (wp && Math.hypot(game.player.pos.x - wp.x, game.player.pos.z - wp.z) < 8 && game.S.mode === 'foot') { game.interact.remove(wp); wp = null; } } });
  add('estate', installEstate(game));
  add('propertyPlus', installPropertyPlus(game)); // rent, tax, the market, selling, burglaries, upgrades
  add('gunwork', installGunwork(game)); // wear, jams, cleaning, takedowns (before the residents: a takedown beats "say hello")
  add('policePlus', installPolicePlus(game)); // the helicopter, roadblocks and stingers, bribes, the radio
  add('population', installPopulation(game)); // ~3,000 residents with homes, jobs, friends and days of their own
  add('toolsSys', installTools(game));
  add('hunting', installHunting(game));
  add('fishing', installFishing(game));
  add('jobs', installJobs(game));
  add('missions', installMissions(game));
  add('phoneSys', installPhone(game));
  add('phonePlus', installPhonePlus(game)); // battery, bank and ATMs, news, texts, contacts, forecast, camera, cabs
  add('kerbside', installKerbside(game));
  add('driving', installDriving(game)); // fuel, skid marks, the horn, hot-wiring and alarms, speeding tickets
  add('ambient', installAmbient(game)); // pigeons, umbrellas, joggers, phones, food carts
  add('splashes', installSplashes(game)); // wakes, spray, wading rings, rising fish
  add('wilds', installWilds(game)); // blood trails, crows, ducks, poaching, the wind
  add('prints', installPrints(game)); // boot, hoof and paw prints and tyre tracks in soft ground
  add('foodPlus', installFoodPlus(game)); // food that goes off, coffee, loyalty card, today's special
  add('crew', installCrew(game)); // the Gulf Line: loyalty, crew jobs, hideout upgrades, raids, turf
  add('missionsPlus', installMissionsPlus(game)); // medals, checkpoints, hints, contacts, replays, side jobs
  return {
    list,
    // systems may return a prompt; `free` says whether F is still unclaimed this frame
    update(dt, a, free) {
      let prompt = '';
      for (const s of list) { if (!s.update) continue; const p = s.update(dt, a, free && !prompt); if (p && !prompt) prompt = p; }
      return prompt;
    },
  };
}
