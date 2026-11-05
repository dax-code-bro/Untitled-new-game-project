// Shared helpers for gameplay systems: road lookups, safe spawn spots, labels.
import { Vehicle } from '../entities/vehicle.js';

// Nearest point on the road network (with the road's direction there)
export function nearestRoad(graph, x, z, minWidth = 0) {
  let best = null, bd = Infinity;
  for (const e of graph.edges) {
    if (e.width < minWidth) continue;
    const P = e.pts;
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0], az = P[i - 1][1], bx = P[i][0], bz = P[i][1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { const L = Math.sqrt(L2); bd = d; best = { x: px, z: pz, tx: dx / L, tz: dz / L, edge: e, dist: Math.sqrt(d) }; }
    }
  }
  return best;
}

// Random point on a road between minR and maxR from (x, z)
export function roadPointAround(graph, x, z, minR, maxR, rnd = Math.random) {
  for (let tries = 0; tries < 60; tries++) {
    const e = graph.edges[(rnd() * graph.edges.length) | 0];
    const p = e.pts[(rnd() * e.pts.length) | 0];
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d >= minR && d <= maxR) return { x: p[0], z: p[1] };
  }
  const a = rnd() * Math.PI * 2, r = (minR + maxR) / 2;
  return nearestRoad(graph, x + Math.cos(a) * r, z + Math.sin(a) * r);
}

// Spawn a parked vehicle (type from the catalog) at a road-side spot
export function spawnParked(game, type, x, z, heading = 0, up = null) {
  const v = new Vehicle(game.lib, type);
  v.pos.set(x, game.hm.height(x, z) + 0.05, z);
  v.heading = heading;
  v.night = 0; // parked: lights off
  if (up) game.applyUpgrades(v, up);
  v.sync(0);
  game.scene.add(v.group);
  game.parked.push(v);
  return v;
}

export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const keyHint = (game) => (game.settings.isTouch ? 'Tap 🚗 to' : 'Press F to');
