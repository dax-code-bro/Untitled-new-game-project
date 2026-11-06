// Contextual locomotion safety: where you put your feet decides how you can move.
//
// Every frame on foot the ground is read with the substrate scanner (core/substrate.js) and the
// world's wetness, and the body adapts the way a person does:
//   - Ledges: walking or jogging, you stop at a drop of more than ~1.5 m (a roof edge, a cliff, a
//     loading dock) and slide along it instead of stepping off. Sprint or jump to go over on purpose.
//   - Slopes: how steep you can climb depends on grip. Dry rock and asphalt hold to ~40 degrees,
//     wet grass, mud and loose sand far less: you slow down as it steepens, then can't go up at all
//     and slip back. Going down something steep, you slow to a careful walk.
//   - Slick surfaces: wet tile, glass, painted steel and mud take away acceleration and cap your
//     sprint, so you can't turn on a sixpence.
//   - Water: wading slows you with depth (knee-deep, waist-deep), before you have to swim.
//   - Narrow footing up high (a beam, a parapet, a ledge over a drop): you edge along at a walk.
// It also keeps the gait's stride, so every footstep sounds like what you're standing on.
import { SUBSTRATES, scanGround, fromSurf, gripOf } from '../core/substrate.js';

export function createFooting({ hm, collision, wet, indoors, onStep }) {
  // the ground exactly as it's drawn (and stood on), not the smoother heightmap
  const ty = (x, z) => (collision.terrainY ? collision.terrainY(x, z) : hm.height(x, z));
  const st = { sub: SUBSTRATES.grass, grip: 0.65, wet: 0, depth: 0, grade: 0, edge: false, narrow: false, slip: 0, speedK: 1 };
  let stride = 0, readT = 0, edgeT = 0;

  // what's under the feet at (x, y, z)
  function underfoot(x, y, z) {
    if (indoors()) return SUBSTRATES.wood;
    const gy = ty(x, z), wl = hm.waterLevel(x, z);
    if (wl > y - 0.05 && wl - gy > 0.08) return SUBSTRATES.water;
    const pv = collision.paved ? collision.paved(x, z) : null;
    if (y > (pv ?? gy) + 0.25) {
      // standing on something built: a building's roof is tar and gravel whatever its walls are;
      // anything else by its tag, or concrete (docks, steps, platforms)
      let box = null;
      collision.query(x, z, 0.1, (it) => { if (it.t === 0 && x > it.minX && x < it.maxX && z > it.minZ && z < it.maxZ && Math.abs(it.y1 - y) < 0.3) box = it; });
      if (box?.data?.building) return SUBSTRATES.asphalt;
      const tag = box?.data?.substrate || fromSurf(box?.data?.surf);
      if (tag && SUBSTRATES[tag]) return SUBSTRATES[tag];
      return SUBSTRATES.concrete;
    }
    return scanGround(x, z).sub;
  }
  // are we on a narrow top with a drop either side (a beam, a wall top, a ledge)?
  function narrowAt(x, y, z) {
    let narrow = false;
    collision.query(x, z, 0.1, (it) => {
      if (it.t !== 0 || Math.abs(it.y1 - y) > 0.3 || !(x > it.minX && x < it.maxX && z > it.minZ && z < it.maxZ)) return;
      if (Math.min(it.maxX - it.minX, it.maxZ - it.minZ) < 1.1 && y - ty(x, z) > 2.5) narrow = true;
    });
    return narrow;
  }

  return {
    state: st,
    underfoot,
    // before moving: how fast and how sharply the body can move here, given which way it wants to go
    before(p, dx, dz, mag, a, dt) {
      if ((readT -= dt) <= 0) {
        readT = 0.15;
        st.sub = underfoot(p.pos.x, p.pos.y, p.pos.z);
        st.wet = indoors() ? 0 : wet();
        st.grip = gripOf(st.sub, st.wet);
        const g0 = ty(p.pos.x, p.pos.z), wl = hm.waterLevel(p.pos.x, p.pos.z);
        st.depth = !p.swimming && wl > g0 ? Math.max(0, wl - Math.max(g0, p.pos.y - 0.05)) : 0;
        st.narrow = p.grounded && narrowAt(p.pos.x, p.pos.y, p.pos.z);
      }
      let speed = 1, accel = 1, sprintCap = 1;
      if (indoors()) { st.grade = 0; st.speedK = 1; return { speed, accel, sprintCap }; } // floors are flat and interiors have their own walls
      // grade along the way we're heading, on open ground (built steps are the mantle's business)
      st.grade = 0;
      // on open ground: not on the paved grid, and not on anything built (a deck, a platform, a roof)
      const g0 = ty(p.pos.x, p.pos.z);
      const onOpen = p.grounded && Math.abs(p.pos.y - g0) < 0.3 && collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.3) - g0 < 0.05
        && !(collision.paved && collision.paved(p.pos.x, p.pos.z) !== null);
      if (onOpen && mag > 0.05) {
        const L = 0.8, ahead = ty(p.pos.x + dx * L, p.pos.z + dz * L);
        st.grade = (ahead - p.pos.y) / L;
        const maxG = 0.35 + st.grip * 0.62; // tan of the steepest climb: dry rock ~40 deg, wet grass ~31
        if (st.grade > 0.2) speed *= 1 - Math.min(1, (st.grade - 0.2) / Math.max(0.05, maxG - 0.2)) * 0.8;
        if (st.grade > maxG) speed = 0.08; // too steep for this ground: you can't get up it
        if (st.grade < -maxG * 0.85) { speed = Math.min(speed, 0.45); sprintCap = 0.45; } // picking your way down
      }
      // slick underfoot: less push-off and no flat-out sprint
      if (st.grip < 0.55) { accel *= Math.max(0.3, st.grip / 0.55); sprintCap = Math.min(sprintCap, 0.55 + st.grip * 0.6); }
      // wading
      if (st.depth > 0.12) speed *= 1 - Math.min(1, st.depth / 1.3) * 0.6;
      // a narrow top over a drop: edge along at a walk
      if (st.narrow) sprintCap = Math.min(sprintCap, 0.4);
      st.speedK = speed;
      return { speed, accel, sprintCap };
    },
    // after moving: don't walk off a ledge by accident, and slip back off what's too steep
    after(p, px, pz, py, a, dt) {
      st.edge = false;
      if (!p.grounded || p.swimming || p.mantle || a.jump || a.sprint || indoors()) { edgeT = 0; return; }
      const mx = p.pos.x - px, mz = p.pos.z - pz, ml = Math.hypot(mx, mz);
      if (ml > 1e-5) {
        // look half a metre ahead: a roof edge, a wall top or a cliff face all read as a drop
        const LA = 0.45;
        const drop = (x, z) => { const g = collision.surface(x, z, py + 0.3), w = hm.waterLevel(x, z); return w > g + 1.2 ? 0 : py - g; };
        const bad = (x, z, ux, uz) => drop(x + ux * LA, z + uz * LA) > 1.5;
        if (bad(p.pos.x, p.pos.z, mx / ml, mz / ml)) {
          // which way is "over the edge" there: down the ground's slope across the lookahead point
          const lx = p.pos.x + (mx / ml) * LA, lz = p.pos.z + (mz / ml) * LA, e = 0.3;
          let gx = collision.surface(lx + e, lz, py + 0.3) - collision.surface(lx - e, lz, py + 0.3);
          let gz = collision.surface(lx, lz + e, py + 0.3) - collision.surface(lx, lz - e, py + 0.3);
          const gl = Math.hypot(gx, gz);
          if (gl > 1e-4) { gx /= gl; gz /= gl; } else { gx = -mx / ml; gz = -mz / ml; }
          // keep only the part of the step that runs along the edge (none of it towards the drop)
          const into = -(mx * gx + mz * gz);
          let sx = mx, sz = mz;
          if (into > 0) { sx = mx + into * gx; sz = mz + into * gz; }
          const sl = Math.hypot(sx, sz);
          if (sl > 1e-5 && !bad(px + sx, pz + sz, sx / sl, sz / sl)) { p.pos.x = px + sx; p.pos.z = pz + sz; }
          else { p.pos.x = px; p.pos.z = pz; }
          const vin = -(p.vel.x * gx + p.vel.z * gz);
          if (vin > 0) { p.vel.x += vin * gx; p.vel.z += vin * gz; }
          st.edge = true; edgeT = 0.6;
        }
      }
      if (edgeT > 0) { edgeT -= dt; st.edge = true; }
      // too steep for the ground's grip: a slow slide back down
      if (st.grade > 0.35 + st.grip * 0.62 && Math.abs(p.pos.y - ty(p.pos.x, p.pos.z)) < 0.3) {
        const e = 0.6, gx = ty(p.pos.x + e, p.pos.z) - ty(p.pos.x - e, p.pos.z), gz = ty(p.pos.x, p.pos.z + e) - ty(p.pos.x, p.pos.z - e);
        const gl = Math.hypot(gx, gz) || 1;
        st.slip = Math.min(1, st.slip + dt * 2);
        p.pos.x -= (gx / gl) * 0.9 * st.slip * dt; p.pos.z -= (gz / gl) * 0.9 * st.slip * dt;
      } else st.slip = Math.max(0, st.slip - dt * 3);
    },
    // footsteps: one per stride, the length of the stride set by the pace
    steps(p, dt) {
      if (!p.grounded || p.swimming || p.mantle || p.speed < 0.4) { stride = Math.min(stride, 0.3); return; }
      const len = p.speed > 5.5 ? 1.55 : p.speed > 2.6 ? 1.2 : 0.72;
      stride += p.speed * dt;
      if (stride >= len) {
        stride -= len;
        onStep?.(st.sub, Math.min(1, 0.35 + p.speed / 7), st.wet, st.depth);
      }
    },
  };
}
