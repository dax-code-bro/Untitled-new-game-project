// Who leaves tracks (world/tracks.js draws them): you and the people walking near you (boot
// prints), deer, cattle and horses (hooves), coyotes and foxes (paws), and your car or truck off the
// road (tyre tracks from every wheel).
import { createTracks } from '../world/tracks.js';

const PAW = new Set(['coyote', 'fox', 'oldScar', 'ember']);

export function installPrints(game) {
  const { scene, hm, S, player, peds } = game;
  const tracks = createTracks(scene, hm, { count: game.q?.key === 'phone' ? 300 : 700 });
  const walked = new WeakMap(); // who -> { d, side, x, z }
  const step = (who, x, z, heading, kind, stride, scale = 1, width = 0.11) => {
    let w = walked.get(who);
    if (!w) { w = { d: 0, side: 1, x, z }; walked.set(who, w); return; }
    const dd = Math.hypot(x - w.x, z - w.z); w.x = x; w.z = z;
    if (dd > 3) { w.d = 0; return; } // teleported
    w.d += dd;
    if (w.d < stride) return;
    w.d = 0; w.side = -w.side;
    const rx = Math.cos(heading) * width * w.side, rz = -Math.sin(heading) * width * w.side;
    tracks.press(kind, x + rx, z + rz, heading, scale);
  };
  let wheelD = 0, lastV = null, lx = 0, lz = 0, scanT = 0;
  return {
    tracks,
    update(dt) {
      tracks.update(dt);
      if (S.indoors) return '';
      // you
      if (S.mode === 'foot') step(player, player.pos.x, player.pos.z, player.heading, 'boot', 0.72);
      // your vehicle, every wheel, off the road
      const v = S.vehicle;
      if (S.mode === 'car' && v && !v.isBoat && !v.isAir && !v.airborne) {
        if (lastV !== v) { lastV = v; lx = v.pos.x; lz = v.pos.z; wheelD = 0; }
        wheelD += Math.hypot(v.pos.x - lx, v.pos.z - lz); lx = v.pos.x; lz = v.pos.z;
        if (wheelD > 0.42) {
          wheelD = 0;
          const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
          const hw = (v.spec?.width || 1.9) * 0.4, hl = (v.spec?.len || 4.5) * 0.32;
          for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) tracks.press('tread', v.pos.x + rx * hw * a + fx * hl * b, v.pos.z + rz * hw * a + fz * hl * b, v.heading, 1);
        }
      } else lastV = null;
      // people and animals near you
      if ((scanT -= dt) > 0) return '';
      scanT = 0.1;
      const px = player.pos.x, pz = player.pos.z;
      for (const p of peds.list) {
        if (p.mode === 'dead' || Math.abs(p.pos.x - px) > 45 || Math.abs(p.pos.z - pz) > 45) continue;
        step(p, p.pos.x, p.pos.z, p.heading || 0, 'boot', 0.7);
      }
      for (const an of game.hunting?.list || []) {
        if (an.dead || Math.abs(an.pos.x - px) > 70 || Math.abs(an.pos.z - pz) > 70) continue;
        const paw = PAW.has(an.sp), size = an.s.h || 1.4;
        step(an, an.pos.x, an.pos.z, an.heading, paw ? 'paw' : 'hoof', paw ? 0.4 * size : 0.45 * size, paw ? size : Math.max(1, size * 0.7), paw ? 0.06 : 0.12 * size);
      }
      return '';
    },
  };
}
