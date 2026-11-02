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
  add('toolsSys', installTools(game));
  add('hunting', installHunting(game));
  add('fishing', installFishing(game));
  add('jobs', installJobs(game));
  add('missions', installMissions(game));
  add('phoneSys', installPhone(game));
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
