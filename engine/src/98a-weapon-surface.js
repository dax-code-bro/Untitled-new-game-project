/* THE SURFACE OF A WEAPON, for closing a hand onto it.
 *
   Lived in bunker-nine, which multiplayer does not load -- so
   multiplayer had no way to solve a grip and ended up with a floating
   gun and no hands at all. A copy in each game is how the two
   viewmodels drifted far enough apart that one of them drew no gun.
   It only ever needed geometryOf, so it belongs here. */
Engine.prototype.weaponSurface = function (root) {
  const game = this;
  if (!root || !game.geometryOf) return null;
  /* Only how MANY sampled vertices the walk found, not where they are:
     the guard below wants a count and nothing else does. */
  let nPts = 0;
  /* Triangles as well as points. The point list keeps every third vertex,
     which is plenty to answer "how far to the surface" and useless for
     "which side of it" -- a flat panel has vertices only at its corners,
     so a shell marked from vertices is a shell full of holes. */
  const tris = [];
  const walk = (a, local) => {
    const geo = a.mesh && game.geometryOf(a.mesh);
    if (geo && geo.positions) {
      const q = geo.positions;
      const m = local ? local.e : null;
      if (geo.indices) {
        const I = geo.indices;
        const tf = (i) => {
          const x = q[i * 3], y = q[i * 3 + 1], z = q[i * 3 + 2];
          if (!m) return [x, y, z];
          return [m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14]];
        };
        for (let i = 0; i < I.length; i += 3) tris.push(tf(I[i]), tf(I[i + 1]), tf(I[i + 2]));
      }
      // Every third vertex: a fingertip is 10 mm across and these meshes are
      // far finer than that, so a third of them describes the same surface.
      for (let i = 0; i < q.length; i += 9) nPts += 3;
    }
    for (const c of (a.children || [])) {
      const cm = new LegendEngine.Mat4();
      cm.compose(c._position, c._rotation, c.scale);
      if (local) { const t = new LegendEngine.Mat4(); t.mulMatrices(local, cm); walk(c, t); }
      else walk(c, cm);
    }
  };
  walk(root, null);
  if (nPts < 30) return null;

  /* There WAS a grid of points here, and nothing ever read it.
     It is what the field used before the switch to point-to-triangle
     below, and when that landed the query moved to the triangle grid and
     this one was left standing: built for every weapon at start-up,
     several thousand points bucketed into a Map with string keys, and
     then never looked at again. Gone, along with the point list itself --
     only the count survives, because the guard above wants to know
     whether the walk found a mesh at all. */
  /* Distance to the nearest TRIANGLE, not the nearest vertex.
   *
   * The solve wants each joint one finger-radius plus a hair off the
   * weapon's skin, and it was being handed the range to the closest
   * VERTEX instead. On a swept mesh the vertices sit on the section rings
   * and a flat panel between two rings has none in the middle, so the
   * field reads several millimetres further out than the surface actually
   * is -- and the solve, believing it, drives the finger that much into
   * the metal. That is not a small correction: measured by ray parity,
   * between 14% and 63% of each hand's finger surface was inside its gun,
   * and moving the hand closer only buried it deeper, because the error
   * grows as you approach the middle of a panel.
   *
   * Point-to-triangle, over a grid of triangles rather than of points, so
   * a lookup still touches a handful of them. */
  const TCELL = 0.016;
  /* Each triangle's own box, kept alongside so a query can reject one
     without running the region test on it. Indexed by the triangle's
     start offset, the same number the grid cells hold. */
  const tlo = new Float32Array(tris.length), thi = new Float32Array(tris.length);
  let wlo0 = 1e9, wlo1 = 1e9, wlo2 = 1e9, whi0 = -1e9, whi1 = -1e9, whi2 = -1e9;
  for (let t = 0; t < tris.length; t += 3) {
    const A = tris[t], B2 = tris[t + 1], C = tris[t + 2];
    for (let c = 0; c < 3; c++) {
      tlo[t + c] = Math.min(A[c], B2[c], C[c]);
      thi[t + c] = Math.max(A[c], B2[c], C[c]);
    }
    if (tlo[t] < wlo0) wlo0 = tlo[t];
    if (tlo[t + 1] < wlo1) wlo1 = tlo[t + 1];
    if (tlo[t + 2] < wlo2) wlo2 = tlo[t + 2];
    if (thi[t] > whi0) whi0 = thi[t];
    if (thi[t + 1] > whi1) whi1 = thi[t + 1];
    if (thi[t + 2] > whi2) whi2 = thi[t + 2];
  }
  /* A DENSE grid over the weapon's own box, not a hash of cells.
   *
   * Counted over a start-up, four cells in five that a query looked up
   * were empty -- and every one of those cost a key to build and a hash
   * to miss on. A weapon is a metre of gun at most, which at 16 mm cells
   * is a box of a few tens of thousands of them, so the whole grid fits
   * in two flat arrays: where each cell's triangles start, and the
   * triangles themselves end to end. An empty cell is then one integer
   * read that comes back equal to the next one, and a cell outside the
   * weapon's box is a bounds check. Same cells, same contents, same
   * answers -- it is only the way they are reached that changes. */
  const gx0 = Math.floor(wlo0 / TCELL), gy0 = Math.floor(wlo1 / TCELL), gz0 = Math.floor(wlo2 / TCELL);
  const nx = Math.floor(whi0 / TCELL) - gx0 + 1;
  const ny = Math.floor(whi1 / TCELL) - gy0 + 1;
  const nz = Math.floor(whi2 / TCELL) - gz0 + 1;
  const nCell = nx * ny * nz;
  const gStart = new Int32Array(nCell + 1);
  for (let t = 0; t < tris.length; t += 3)
    for (let i = Math.floor(tlo[t] / TCELL); i <= Math.floor(thi[t] / TCELL); i++)
      for (let j = Math.floor(tlo[t + 1] / TCELL); j <= Math.floor(thi[t + 1] / TCELL); j++)
        for (let k = Math.floor(tlo[t + 2] / TCELL); k <= Math.floor(thi[t + 2] / TCELL); k++)
          gStart[((i - gx0) * ny + (j - gy0)) * nz + (k - gz0) + 1]++;
  for (let c = 0; c < nCell; c++) gStart[c + 1] += gStart[c];
  const gItem = new Int32Array(gStart[nCell]);
  const fill = gStart.slice(0, nCell);
  for (let t = 0; t < tris.length; t += 3)
    for (let i = Math.floor(tlo[t] / TCELL); i <= Math.floor(thi[t] / TCELL); i++)
      for (let j = Math.floor(tlo[t + 1] / TCELL); j <= Math.floor(thi[t + 1] / TCELL); j++)
        for (let k = Math.floor(tlo[t + 2] / TCELL); k <= Math.floor(thi[t + 2] / TCELL); k++)
          gItem[fill[((i - gx0) * ny + (j - gy0)) * nz + (k - gz0)]++] = t;
  /* Which triangles this query has already measured.
     A triangle wider than a cell is filed in every cell it crosses, and a
     query reads twenty-seven of them at the first ring alone, so without
     this the same triangle gets the full region test several times over
     for the same answer. A stamp per query costs one comparison. */
  const seen = new Int32Array(tris.length);
  let visit = 0;
  /* And for the queries that are nowhere near the weapon at all, the box
     again: the search gives up after six rings, so anything further than
     six cells outside it cannot find a triangle. Most queries are exactly
     that -- a solver stepping a fingertip through the air around the gun. */
  const REACH = 7 * TCELL;
  /* Closest point on a triangle to a point: the standard region test --
     the three vertices, the three edges, or the face interior. */
  const triDist2 = (px, py, pz, A, B2, C) => {
    const abx = B2[0]-A[0], aby = B2[1]-A[1], abz = B2[2]-A[2];
    const acx = C[0]-A[0], acy = C[1]-A[1], acz = C[2]-A[2];
    const apx = px-A[0], apy = py-A[1], apz = pz-A[2];
    const d1 = abx*apx + aby*apy + abz*apz, d2 = acx*apx + acy*apy + acz*apz;
    let cx, cy, cz;
    if (d1 <= 0 && d2 <= 0) { cx = A[0]; cy = A[1]; cz = A[2]; }
    else {
      const bpx = px-B2[0], bpy = py-B2[1], bpz = pz-B2[2];
      const d3 = abx*bpx + aby*bpy + abz*bpz, d4 = acx*bpx + acy*bpy + acz*bpz;
      if (d3 >= 0 && d4 <= d3) { cx = B2[0]; cy = B2[1]; cz = B2[2]; }
      else {
        const vc = d1*d4 - d3*d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) {
          const v2 = d1 / (d1 - d3);
          cx = A[0] + abx*v2; cy = A[1] + aby*v2; cz = A[2] + abz*v2;
        } else {
          const cpx = px-C[0], cpy = py-C[1], cpz = pz-C[2];
          const d5 = abx*cpx + aby*cpy + abz*cpz, d6 = acx*cpx + acy*cpy + acz*cpz;
          if (d6 >= 0 && d5 <= d6) { cx = C[0]; cy = C[1]; cz = C[2]; }
          else {
            const vb = d5*d2 - d1*d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) {
              const w3 = d2 / (d2 - d6);
              cx = A[0] + acx*w3; cy = A[1] + acy*w3; cz = A[2] + acz*w3;
            } else {
              const va = d3*d6 - d5*d4;
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
                const w3 = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                cx = B2[0] + (C[0]-B2[0])*w3; cy = B2[1] + (C[1]-B2[1])*w3; cz = B2[2] + (C[2]-B2[2])*w3;
              } else {
                const den = 1 / (va + vb + vc);
                const v2 = vb * den, w3 = vc * den;
                cx = A[0] + abx*v2 + acx*w3; cy = A[1] + aby*v2 + acy*w3; cz = A[2] + abz*v2 + acz*w3;
              }
            }
          }
        }
      }
    }
    const dx = cx-px, dy = cy-py, dz = cz-pz;
    return dx*dx + dy*dy + dz*dz;
  };
  const surf = (x, y, z) => {
    if (!tris.length) return 1;
    if (x < wlo0 - REACH || x > whi0 + REACH || y < wlo1 - REACH || y > whi1 + REACH ||
        z < wlo2 - REACH || z > whi2 + REACH) return 1;
    const gi = Math.floor(x / TCELL), gj = Math.floor(y / TCELL), gk = Math.floor(z / TCELL);
    let best = 1e9;
    visit++;
    for (let r = 0; r <= 6; r++) {
      /* Walk the SHELL, not the cube with its middle skipped. At the
         sixth ring that is 2197 iterations to visit 866 cells, and the
         1331 skipped ones each cost an abs and a max to skip. */
      for (let a2 = -r; a2 <= r; a2++) {
        const ea = (a2 === -r || a2 === r);
        for (let b2 = -r; b2 <= r; b2++) {
          const eb = ea || b2 === -r || b2 === r;
          // On a face of the shell every k belongs; otherwise only the two ends.
          for (let c2 = -r; c2 <= r; c2 += (eb || r === 0) ? 1 : (2 * r)) {
            /* The CELL's box before the cell's contents.
             *
             * Counted over a start-up: 269 million triangles stamped to
             * measure 15 per query. Ninety-four per cent of the work was
             * rejecting triangles one at a time out of cells that were
             * wholly further away than the best answer so far.
             *
             * Rejecting the cell instead is exact, not an approximation.
             * A triangle wider than a cell is filed in every cell its box
             * overlaps, including the one holding its own nearest point,
             * and that cell's box is no further from the query than the
             * triangle is -- so a cell further away than `best` cannot be
             * holding the winner, only copies of triangles that will be
             * reached through nearer cells. And this runs before the key
             * and the lookup, so a rejected cell costs no hashing either. */
            const bi = (gi + a2) * TCELL, bj = (gj + b2) * TCELL, bk = (gk + c2) * TCELL;
            const cdx = x < bi ? bi - x : (x > bi + TCELL ? x - bi - TCELL : 0);
            const cdy = y < bj ? bj - y : (y > bj + TCELL ? y - bj - TCELL : 0);
            const cdz = z < bk ? bk - z : (z > bk + TCELL ? z - bk - TCELL : 0);
            if (cdx * cdx + cdy * cdy + cdz * cdz >= best) continue;
            const ii = gi + a2 - gx0, jj = gj + b2 - gy0, kk = gk + c2 - gz0;
            if (ii < 0 || ii >= nx || jj < 0 || jj >= ny || kk < 0 || kk >= nz) continue;
            const ci0 = (ii * ny + jj) * nz + kk;
            for (let ci = gStart[ci0], ce = gStart[ci0 + 1]; ci < ce; ci++) {
              const t = gItem[ci];
              // Measured already, this query, from another cell it crosses.
              if (seen[t] === visit) continue;
              seen[t] = visit;
              /* Its box first. The distance to a box is a lower bound on
                 the distance to what is inside it, so a box already
                 further away than the best triangle so far cannot win and
                 does not need the region test. */
              const bx = x < tlo[t] ? tlo[t] - x : (x > thi[t] ? x - thi[t] : 0);
              const by = y < tlo[t + 1] ? tlo[t + 1] - y : (y > thi[t + 1] ? y - thi[t + 1] : 0);
              const bz = z < tlo[t + 2] ? tlo[t + 2] - z : (z > thi[t + 2] ? z - thi[t + 2] : 0);
              if (bx * bx + by * by + bz * bz >= best) continue;
              const d = triDist2(x, y, z, tris[t], tris[t + 1], tris[t + 2]);
              if (d < best) best = d;
            }
          }
        }
      }
      // One ring past the first hit: a nearer triangle can sit diagonally.
      if (best < 1e9 && r >= 1) break;
    }
    return best < 1e9 ? Math.sqrt(best) : 1;
  };

  /* Is this point INSIDE the weapon?
   *
   * The distance above is to the nearest VERTEX and has no sign, so it
   * cannot tell a finger resting on a surface from one buried in it -- and
   * a finger lying in the middle of a large flat panel, the side of a
   * receiver say, is far from every vertex while being deep inside the
   * solid. That is not a hypothetical: measured by ray parity against the
   * weapons' own triangles, 14% of the 1911's finger surface and 63% of
   * the MG 42's support hand were inside the gun. The solver's own
   * anti-clipping term was reading the one number that cannot see it.
   *
   * A coarse occupancy grid answers it in a lookup. Cells the geometry
   * passes through are the shell; flooding inwards from the outside
   * leaves the interior as whatever the flood never reached. Only the
   * INTERIOR counts as solid, not the shell -- a finger touching the
   * surface must stay legal, or every hand in the game gets pushed a
   * cell off the weapon it is holding. */
  /* RAY PARITY, which is exact and cannot be fooled by a hollow shell.
   *
   * This was an occupancy grid: rasterise the triangles into cells, flood
   * inwards from a corner, and call whatever the flood never reached the
   * inside. That works on a solid. These weapons are not solids. They are
   * swept SHELLS -- a handguard is a tube, a barrel jacket is a tube with
   * slots cut in it -- and a flood walks straight into an open end and
   * fills the lot, so `inside` answered false everywhere and every
   * anti-clipping term in the builder was reading a constant. I fixed the
   * grid's cell size, raised its cap, and it made no difference at all,
   * because the mechanism was wrong and not merely mis-sized.
   *
   * Parity needs no grid and no flood: a ray from a point crosses a
   * surface an odd number of times exactly when the point is inside it.
   * Measured this way against the weapons' own triangles, 10 to 25 per
   * cent of each of the MP5's support fingers is inside the gun and 41
   * per cent of its thumb -- which is what a hand standing through a
   * handguard looks like as a number, and what nothing in the builder
   * could see.
   *
   * Cast along +X, and bucket the triangles by the (y, z) cell they cover
   * so a ray tests a handful rather than six thousand. Counting both
   * directions from the same candidates costs one comparison more and
   * buys the one guard parity needs: on a CLOSED surface the two parities
   * agree, and where they disagree the mesh is open along that line and
   * the answer is not to be trusted -- so it says outside, which is the
   * safe way to be wrong. */
  if (!tris.length) { surf.inside = () => false; return surf; }
  /* Four millimetres, not ten.
   *
   * The parity test reads ONE column cell and runs an exact point-in-2D-
   * triangle test on everything filed in it, so the cell size cannot
   * change the answer: a triangle whose shadow covers the ray's (y, z) has
   * a (y, z) box covering it too, and is filed in that cell whatever the
   * cell measures. All the size decides is how many triangles get tested
   * and thrown away -- and at ten millimetres a rifle's column held every
   * triangle down the whole length of the barrel that shared those ten
   * millimetres of section. Finer cells, same answer, less of it. */
  const PCELL = 0.004;
  const pkey = (j, k) => j * 8192 + k;
  const pgrid = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    const A = tris[t], B2 = tris[t + 1], C = tris[t + 2];
    const j0 = Math.floor(Math.min(A[1], B2[1], C[1]) / PCELL);
    const j1 = Math.floor(Math.max(A[1], B2[1], C[1]) / PCELL);
    const k0 = Math.floor(Math.min(A[2], B2[2], C[2]) / PCELL);
    const k1 = Math.floor(Math.max(A[2], B2[2], C[2]) / PCELL);
    for (let j = j0; j <= j1; j++) {
      for (let k = k0; k <= k1; k++) {
        const kk = pkey(j, k);
        let cell = pgrid.get(kk);
        if (!cell) { cell = []; pgrid.set(kk, cell); }
        cell.push(t);
      }
    }
  }
  const inside = (x, y, z) => {
    const cell = pgrid.get(pkey(Math.floor(y / PCELL), Math.floor(z / PCELL)));
    if (!cell) return false;
    let ahead = 0, behind = 0;
    for (let c = 0; c < cell.length; c++) {
      const t = cell[c];
      const A = tris[t], B2 = tris[t + 1], C = tris[t + 2];
      // Does the ray's (y, z) point land in this triangle's shadow?
      const ay = A[1] - y, az = A[2] - z;
      const by = B2[1] - y, bz = B2[2] - z;
      const cy = C[1] - y, cz = C[2] - z;
      const wc = ay * bz - by * az;
      const wa = by * cz - cy * bz;
      const wb = cy * az - ay * cz;
      if (!((wa >= 0 && wb >= 0 && wc >= 0) || (wa <= 0 && wb <= 0 && wc <= 0))) continue;
      const den = wa + wb + wc;
      if (den === 0) continue;
      // Where along x it crosses, by the same weights.
      const hx = (A[0] * wa + B2[0] * wb + C[0] * wc) / den;
      if (hx > x) ahead++; else behind++;
    }
    // Open along this line: the two counts disagree, and outside is the
    // safe answer.
    if (((ahead & 1) === 1) !== ((behind & 1) === 1)) return false;
    return (ahead & 1) === 1;
  };
  /* SIGNED, and this is the whole fault behind "the fingers are jumbled up
   * with the gun".
   *
   * Everything that places a hand -- the anchor seating, the knuckle row,
   * the curl -- scores a candidate by how near this field is to a
   * finger's own radius. Unsigned, a knuckle ten millimetres INSIDE the
   * slide reads ten millimetres and scores perfectly, so a search over
   * that field does not merely tolerate burying the hand in the gun: it
   * is indifferent between resting on the metal and being ten
   * millimetres under it, and coordinate descent will take whichever it
   * reaches first. Measured on the 1911, it took the inside: the four
   * knuckles came out at y -11, +8, +27 and +45 -- climbing the frame
   * and onto the top of the slide -- while a hundred millimetres of grip
   * below them had no finger on it at all.
   *
   * Negative inside the solid turns that indifference into a cost, and
   * every consumer of this field gets the fix at once without knowing
   * anything about occupancy grids. The sign only appears past the shell
   * band, so a finger genuinely touching the surface still reads zero and
   * stays legal. */
  const signed = (x, y, z) => (inside(x, y, z) ? -surf(x, y, z) : surf(x, y, z));
  signed.inside = inside;
  signed.unsigned = surf;
  return signed;
};
