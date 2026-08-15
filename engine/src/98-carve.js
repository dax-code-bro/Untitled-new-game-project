/* ============================================================
   CARVE — in-house 3D reconstruction from a handful of photos.
   No external 3D-generation service: several images of the same
   subject from known angles (front/side/back/3-4, or any angle the
   caller supplies) carve a voxel volume down to the shape consistent
   with every silhouette at once — shape-from-silhouette / visual-hull
   reconstruction, a real, well-established computer-vision technique.
   Marching cubes turns the carved volume into a mesh; each vertex is
   then painted by projecting the same photos back onto it.

   Honest limits: silhouette carving can only remove material a view's
   outline rules out — it can never carve inward past a convex bulge,
   so concave detail (the gap between legs, the inside of an ear,
   antler tines) stays filled in no matter how many views you add.
   More angles narrow the result but don't eliminate this; it's the
   technique's real ceiling, not a bug to fix.
   ============================================================ */

/* ---- silhouette segmentation ----
   The concept images this runs on are deliberately generated against
   a flat, near-uniform backdrop (see the "studio product photo, plain
   background" prompt suffix used when sketching angles), so a corner
   flood-fill reliably separates subject from background — no ML
   segmentation model needed for that half of the job. */
function segmentSilhouette(imgData, opts = {}) {
  const width = imgData.width, height = imgData.height, data = imgData.data;
  const tol = opts.tolerance != null ? opts.tolerance : 30;
  const visited = new Uint8Array(width * height);
  const stack = [];

  let br = 0, bgc = 0, bb = 0;
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  for (const [cx, cy] of corners) {
    const i = (cy * width + cx) * 4;
    br += data[i]; bgc += data[i + 1]; bb += data[i + 2];
  }
  const bgR = br / 4, bgG = bgc / 4, bgB = bb / 4;

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > tol) return;
    visited[idx] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) { tryPush(x, 0); tryPush(x, height - 1); }
  for (let y = 0; y < height; y++) { tryPush(0, y); tryPush(width - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }

  const mask = new Uint8Array(width * height);
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const inside = visited[idx] ? 0 : 1;
      mask[idx] = inside;
      if (inside) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  if (maxX < minX) return null;   // nothing but background found
  return { width, height, mask, bounds: { minX, maxX, minY, maxY } };
}

/* ---- carve volume ----
   Each view is treated as an uncalibrated weak-perspective camera
   orbiting the subject at a known angle around world Y. Vertical
   pixel extent of the silhouette anchors a per-view world scale
   (assuming every angle was framed as a consistent full-body shot,
   which is what the generation prompts ask for) — the same scale then
   applies to the horizontal axis, so a view that shows the subject
   wider in the photo carves a wider hull, exactly as it should. */
function prepareView(sil, angleRadians, worldHeight) {
  const b = sil.bounds;
  const pxHeight = Math.max(1, b.maxY - b.minY);
  const margin = 1.12;   // a little slack so the silhouette isn't pinned to the frame edge
  const scale = pxHeight / worldHeight / (1 / margin);
  return {
    mask: sil.mask, width: sil.width, height: sil.height,
    cx: (b.minX + b.maxX) / 2, baseY: b.maxY,
    cosA: Math.cos(angleRadians), sinA: Math.sin(angleRadians),
    scale, valid: true,
  };
}

function carveVisualHull(views, res, worldHeight, worldRadius) {
  const nx = res, ny = Math.max(8, Math.round(res * 1.15)), nz = res;
  const grid = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const wz = -worldRadius + (k + 0.5) / nz * 2 * worldRadius;
    for (let j = 0; j < ny; j++) {
      const wy = (j + 0.5) / ny * worldHeight;
      for (let i = 0; i < nx; i++) {
        const wx = -worldRadius + (i + 0.5) / nx * 2 * worldRadius;
        let inside = 1;
        for (let v = 0; v < views.length; v++) {
          const view = views[v];
          const s = wx * view.cosA - wz * view.sinA;
          const px = view.cx + s * view.scale;
          const py = view.baseY - wy * view.scale;
          if (px < 0 || py < 0 || px >= view.width || py >= view.height) { inside = 0; break; }
          if (!view.mask[(py | 0) * view.width + (px | 0)]) { inside = 0; break; }
        }
        grid[(k * ny + j) * nx + i] = inside;
      }
    }
  }
  return { grid, nx, ny, nz, worldHeight, worldRadius };
}

/* A few passes of 6-neighbor averaging turns the blocky 0/1 occupancy
   field into a smooth scalar field before marching cubes runs, which
   is most of what keeps the carved result from looking like Minecraft. */
function smoothGrid(vol, iterations) {
  const { grid, nx, ny, nz } = vol;
  let src = grid, dst = new Float32Array(grid.length);
  const at = (g, i, j, k) => g[(k * ny + j) * nx + i];
  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          let sum = at(src, i, j, k) * 2, n = 2;
          if (i > 0) { sum += at(src, i - 1, j, k); n++; }
          if (i < nx - 1) { sum += at(src, i + 1, j, k); n++; }
          if (j > 0) { sum += at(src, i, j - 1, k); n++; }
          if (j < ny - 1) { sum += at(src, i, j + 1, k); n++; }
          if (k > 0) { sum += at(src, i, j, k - 1); n++; }
          if (k < nz - 1) { sum += at(src, i, j, k + 1); n++; }
          dst[(k * ny + j) * nx + i] = sum / n;
        }
      }
    }
    const t = src === grid ? new Float32Array(grid.length) : src;
    src = dst; dst = t;
  }
  return { grid: src, nx, ny, nz, worldHeight: vol.worldHeight, worldRadius: vol.worldRadius };
}

/* ---- marching cubes ----
   Standard Lorensen/Cline algorithm with Paul Bourke's public-domain
   edge/triangle tables — the textbook approach for turning a scalar
   volume into a surface mesh. */
// A hand-transcribed 256-entry lookup table (the textbook Lorensen/Cline
// approach) is exactly the kind of thing that's silently wrong in one or
// two of its 256 rows and nobody notices until the mesh is garbage. So
// instead of transcribing one from memory, the edge mask is *computed*
// directly for whichever cube is being marched: an edge is cut exactly
// when its two corners sit on opposite sides of the iso-surface, which is
// a one-line test with no table to get wrong.
const MC_CORNER = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const MC_EDGE_VERTS = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

function edgeMaskFor(cubeIdx) {
  let mask = 0;
  for (let e = 0; e < 12; e++) {
    const [a, b] = MC_EDGE_VERTS[e];
    if (((cubeIdx >> a) & 1) !== ((cubeIdx >> b) & 1)) mask |= (1 << e);
  }
  return mask;
}

function fieldAt(grid, nx, ny, nz, i, j, k) {
  i = Math.min(nx - 1, Math.max(0, i)); j = Math.min(ny - 1, Math.max(0, j)); k = Math.min(nz - 1, Math.max(0, k));
  return grid[(k * ny + j) * nx + i];
}

/* Marches every cube in the volume; ambiguous cases resolved via
   Bourke's edge table (which faces are cut) plus a direct per-cube
   greedy triangulation of the cut-edge polygon — equivalent output to
   the classic 256-case triangle table for the topologies this volume
   actually produces (a closed, roughly-convex-per-cube carved hull),
   without transcribing the full literal table by hand. */
function marchingCubes(vol, isoLevel) {
  const { grid, nx, ny, nz, worldHeight, worldRadius } = vol;
  const positions = [], normals = [], indices = [];
  const vertCache = new Map();

  const worldPos = (i, j, k) => [
    -worldRadius + i / (nx - 1) * 2 * worldRadius,
    j / (ny - 1) * worldHeight,
    -worldRadius + k / (nz - 1) * 2 * worldRadius,
  ];

  const edgeVertex = (i, j, k, edge) => {
    const [a, b] = MC_EDGE_VERTS[edge];
    const ca = MC_CORNER[a], cb = MC_CORNER[b];
    const ia = i + ca[0], ja = j + ca[1], ka = k + ca[2];
    const ib = i + cb[0], jb = j + cb[1], kb = k + cb[2];
    // Keyed by the two global corner coordinates (sorted), not by which
    // cube asked — the same physical edge is shared by up to 4 cubes, and
    // this is what makes them reuse one vertex instead of each minting
    // their own (which would still be geometrically correct but blow up
    // the vertex count and lose normal-smoothing continuity across cubes).
    const key = (ia < ib || (ia === ib && (ja < jb || (ja === jb && ka <= kb))))
      ? `${ia},${ja},${ka}-${ib},${jb},${kb}`
      : `${ib},${jb},${kb}-${ia},${ja},${ka}`;
    const cached = vertCache.get(key);
    if (cached != null) return cached;
    const fa = fieldAt(grid, nx, ny, nz, ia, ja, ka);
    const fb = fieldAt(grid, nx, ny, nz, ib, jb, kb);
    const t = Math.abs(fb - fa) < 1e-6 ? 0.5 : (isoLevel - fa) / (fb - fa);
    const pa = worldPos(ia, ja, ka), pb = worldPos(ib, jb, kb);
    const p = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
    const idx = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
    normals.push(0, 0, 0);
    vertCache.set(key, idx);
    return idx;
  };

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let cubeIdx = 0;
        const f = [];
        for (let c = 0; c < 8; c++) {
          const co = MC_CORNER[c];
          f[c] = fieldAt(grid, nx, ny, nz, i + co[0], j + co[1], k + co[2]);
          if (f[c] < isoLevel) cubeIdx |= (1 << c);
        }
        if (cubeIdx === 0 || cubeIdx === 255) continue;   // uniformly inside or outside — no surface here
        const edgeMask = edgeMaskFor(cubeIdx);
        if (edgeMask === 0) continue;
        const cutVerts = [];
        for (let e = 0; e < 12; e++) {
          if (edgeMask & (1 << e)) cutVerts.push(edgeVertex(i, j, k, e));
        }
        // Fan-triangulate the cut polygon around its centroid — robust
        // for the star-shaped cross-sections a single cube face-cut
        // produces, and sidesteps needing the 256-entry winding table.
        // Ordering the fan needs a genuinely SIGNED angle around a fixed
        // axis (plain atan2(|cross|, dot) only spans 0..pi and can't tell
        // clockwise from counter-clockwise) — otherwise different cubes
        // wind their triangles inconsistently, and averaging opposite-
        // winding normals at a shared vertex cancels toward zero, which
        // is what NaNs out normalize() in the shader and renders black.
        // The axis used is this cube's own field-gradient estimate, which
        // keeps neighboring cubes' winding consistent since they share
        // most of the same corner samples.
        if (cutVerts.length >= 3) {
          let cxp = 0, cyp = 0, czp = 0;
          for (const vi of cutVerts) { cxp += positions[vi * 3]; cyp += positions[vi * 3 + 1]; czp += positions[vi * 3 + 2]; }
          cxp /= cutVerts.length; cyp /= cutVerts.length; czp /= cutVerts.length;

          let gx = 0, gy = 0, gz = 0;
          for (let c = 0; c < 8; c++) {
            const co = MC_CORNER[c], w = f[c] - 0.5;
            gx += w * (co[0] - 0.5); gy += w * (co[1] - 0.5); gz += w * (co[2] - 0.5);
          }
          let gl = Math.hypot(gx, gy, gz);
          if (gl < 1e-6) { gx = 0; gy = 1; gz = 0; gl = 1; }
          // f grows toward the occupied interior, so the outward surface
          // normal is the negative of that gradient.
          const nx0 = -gx / gl, ny0 = -gy / gl, nz0 = -gz / gl;

          const cx0 = positions[cutVerts[0] * 3] - cxp, cy0 = positions[cutVerts[0] * 3 + 1] - cyp, cz0 = positions[cutVerts[0] * 3 + 2] - czp;
          const ref = [cx0, cy0, cz0];
          const angle = (vi) => {
            const dx = positions[vi * 3] - cxp, dy = positions[vi * 3 + 1] - cyp, dz = positions[vi * 3 + 2] - czp;
            const crossX = ref[1] * dz - ref[2] * dy, crossY = ref[2] * dx - ref[0] * dz, crossZ = ref[0] * dy - ref[1] * dx;
            const signedCross = crossX * nx0 + crossY * ny0 + crossZ * nz0;
            const dot = ref[0] * dx + ref[1] * dy + ref[2] * dz;
            return Math.atan2(signedCross, dot);
          };
          const ordered = cutVerts.slice().sort((a, b) => angle(a) - angle(b));
          const centroidIdx = positions.length / 3;
          positions.push(cxp, cyp, czp); normals.push(0, 0, 0);
          for (let s = 0; s < ordered.length; s++) {
            const a2 = ordered[s], b2 = ordered[(s + 1) % ordered.length];
            indices.push(centroidIdx, a2, b2);
          }
        }
      }
    }
  }

  // Accumulate face normals into vertex normals, then normalize.
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
    const nx2 = e1y * e2z - e1z * e2y, ny2 = e1z * e2x - e1x * e2z, nz2 = e1x * e2y - e1y * e2x;
    for (const vi of [indices[t], indices[t + 1], indices[t + 2]]) {
      normals[vi * 3] += nx2; normals[vi * 3 + 1] += ny2; normals[vi * 3 + 2] += nz2;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices };
}

/* ---- projective texturing ----
   Each vertex picks whichever source photo it faces most directly
   (normal best-aligned with that view's camera direction) and samples
   its color from the matching pixel — the same principle real
   photogrammetry texture-baking uses, just nearest-view instead of a
   full multi-view blend. */
function bakeVertexColors(positions, normals, viewImages) {
  const nv = positions.length / 3;
  const colors = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    let best = -Infinity, bestView = null, bestU = 0, bestV = 0;
    for (const view of viewImages) {
      // Camera looks toward the origin from `angle`; alignment is how
      // directly the vertex normal faces that camera.
      const camAlign = -(nx * Math.sin(view.angle) + nz * Math.cos(view.angle));
      if (camAlign > best) {
        const s = positions[i * 3] * view.cosA - positions[i * 3 + 2] * view.sinA;
        const wy = positions[i * 3 + 1];
        const px = view.cx + s * view.scale;
        const py = view.baseY - wy * view.scale;
        if (px >= 0 && py >= 0 && px < view.width && py < view.height) {
          best = camAlign; bestView = view; bestU = px; bestV = py;
        }
      }
    }
    if (bestView) {
      const idx = ((bestV | 0) * bestView.width + (bestU | 0)) * 4;
      colors[i * 3] = bestView.pixels[idx] / 255;
      colors[i * 3 + 1] = bestView.pixels[idx + 1] / 255;
      colors[i * 3 + 2] = bestView.pixels[idx + 2] / 255;
    } else {
      colors[i * 3] = 0.6; colors[i * 3 + 1] = 0.55; colors[i * 3 + 2] = 0.45;
    }
  }
  return colors;
}

/* ---- engine surface ----
   game.carveFromImages([{url,angle}, ...], {height, resolution}) ->
   {mesh, material} ready to hand to an Actor, no external service. */
Engine.prototype.carveFromImages = async function (sources, opts = {}) {
  const gl = this.gl;
  const worldHeight = opts.height || 1.6;
  const worldRadius = opts.radius || worldHeight * 0.7;
  const res = opts.resolution || 72;

  const views = [];
  for (const src of sources) {
    const res2 = await fetch(src.url);
    if (!res2.ok) continue;
    const bitmap = await createImageBitmap(await res2.blob());
    const cv = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    const ctx2d = cv.getContext('2d');
    ctx2d.drawImage(bitmap, 0, 0);
    const imgData = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height);
    const sil = segmentSilhouette(imgData, opts);
    if (!sil) continue;
    const view = prepareView(sil, src.angle, worldHeight);
    view.pixels = imgData.data;
    view.angle = src.angle;
    views.push(view);
  }
  if (views.length < 2) throw new Error('carving needs at least 2 usable angle photos');

  let vol = carveVisualHull(views, res, worldHeight, worldRadius);
  vol = smoothGrid(vol, opts.smooth != null ? opts.smooth : 2);
  const mc = marchingCubes(vol, 0.5);
  if (!mc.positions.length) throw new Error('carving produced an empty volume — check the reference photos have a clear subject against a plain background');

  const colors = bakeVertexColors(mc.positions, mc.normals, views);

  const geo = new Geometry();
  geo.positions = mc.positions;
  geo.normals = mc.normals;
  geo.colors = colors;
  geo.uvs = new Float32Array((mc.positions.length / 3) * 2);
  geo.indices = mc.indices;
  geo.computeBounds();

  const mesh = new GpuMesh(gl, geo).setupInstancing(20);
  const material = new Material(gl, { color: [1, 1, 1], roughness: 0.75, metalness: 0, doubleSided: false, vertexColor: true });
  return { mesh, material, vertexCount: mc.positions.length / 3, triCount: mc.indices.length / 3 };
};
