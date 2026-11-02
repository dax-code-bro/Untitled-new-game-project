// Installs every gameplay system and runs them each frame.
import { installGarage } from './garage.js';
import { installMarineAir } from './marine-air.js';
import { installEstate } from './estate.js';

export function installSystems(game) {
  const list = [];
  const add = (name, sys) => { game[name] = sys; list.push(sys); return sys; };
  add('garage', installGarage(game));
  add('marineAir', installMarineAir(game));
  // GPS waypoint: a tall marker + map blip that clears when you arrive
  let wp = null;
  game.setWaypoint = (x, z, label = 'Waypoint') => {
    if (wp) game.interact.remove(wp);
    wp = game.interact.add({ x, z, r: 6, any: true, height: 40, color: 0xff4060, marker: true, label: () => label, blip: { color: '#ff4060', size: 7, global: true }, use: () => {} });
    game.hud.toast(`GPS: ${label}`, 2);
  };
  add('waypoint', { update() { if (wp && Math.hypot(game.player.pos.x - wp.x, game.player.pos.z - wp.z) < 8 && game.S.mode === 'foot') { game.interact.remove(wp); wp = null; } } });
  add('estate', installEstate(game));
  return {
    list,
    update(dt, a) { for (const s of list) if (s.update) s.update(dt, a); },
  };
}
