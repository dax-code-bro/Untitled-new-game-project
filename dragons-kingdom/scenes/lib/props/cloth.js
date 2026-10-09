// Props library - cloth. Meshes from cloth-simulation grids baked offline (offline/*.py, Blender
// cloth) or built analytically, with the attributes clothMaterial() reads:
//   uv: metres in the cloth (u across / along the weave, v down)
//   aWear: doubled cloth (hems, reinforcement patches, reef bands) - blocks the light twice
//   aAO: shade in deep folds (from the local concavity of the drape)
// Seams, stitching and per-bolt tone come from the shader (clothSeams()).
import * as THREE from 'three';
import { Builder, tube, clamp, smooth, hash, catenary, resample } from './core.js';

/** Catmull-Rom upsampling of a (nx+1) x (ny+1) grid of Vector3 by factor k (rows j, columns i). */
export function upsampleGrid(P, nx, ny, k = 2) {
  const at = (i, j) => P[clamp(j, 0, ny) * (nx + 1) + clamp(i, 0, nx)];
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return new THREE.Vector3(
      0.5 * (2 * b.x + (-a.x + c.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (-a.x + 3 * b.x - 3 * c.x + d.x) * t3),
      0.5 * (2 * b.y + (-a.y + c.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (-a.y + 3 * b.y - 3 * c.y + d.y) * t3),
      0.5 * (2 * b.z + (-a.z + c.z) * t + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * t2 + (-a.z + 3 * b.z - 3 * c.z + d.z) * t3));
  };
  // extrapolated neighbours at the borders (no flattening of the edge)
  const ext = (i, j) => {
    if (i >= 0 && i <= nx && j >= 0 && j <= ny) return at(i, j);
    const ci = clamp(i, 0, nx), cj = clamp(j, 0, ny);
    const ii = ci + (ci - i === 0 ? 0 : Math.sign(ci - i)), jj = cj + (cj - j === 0 ? 0 : Math.sign(cj - j));
    return at(ci, cj).clone().multiplyScalar(2).sub(at(ii, jj));
  };
  const NX = nx * k, NY = ny * k, out = [];
  for (let J = 0; J <= NY; J++) {
    const j = Math.min(ny - 1, Math.floor(J / k)), tj = J / k - j;
    for (let I = 0; I <= NX; I++) {
      const i = Math.min(nx - 1, Math.floor(I / k)), ti = I / k - i;
      const rows = [-1, 0, 1, 2].map((dj) => cr(ext(i - 1, j + dj), ext(i, j + dj), ext(i + 1, j + dj), ext(i + 2, j + dj), ti));
      out.push(cr(rows[0], rows[1], rows[2], rows[3], tj));
    }
  }
  return { P: out, nx: NX, ny: NY };
}

/**
 * Cloth grid -> geometry. P: Vector3[] (row-major, (nx+1) x (ny+1)), uvFn(i, j) -> [u, v] (metres),
 * dblFn(i, j, u, v) -> 0..1 (doubled cloth), piece. AO from the drape's concavity (folds).
 */
export function clothGeometry(P, nx, ny, o = {}) {
  const b = new Builder();
  const N = new THREE.Vector3();
  // fold shade: a vertex below the average of its neighbours (seen from the normal side) sits in a
  // fold; both sides of a thin sheet see a fold from one side, so it is the magnitude that counts
  const at = (i, j) => P[clamp(j, 0, ny) * (nx + 1) + clamp(i, 0, nx)];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const p = at(i, j);
    const [u, v] = o.uvFn ? o.uvFn(i, j) : [i / nx, j / ny];
    let ao = 1;
    if (o.foldAO) {
      const avg = at(i - 1, j).clone().add(at(i + 1, j)).add(at(i, j - 1)).add(at(i, j + 1)).multiplyScalar(0.25);
      N.subVectors(at(i + 1, j), at(i - 1, j)).cross(new THREE.Vector3().subVectors(at(i, j + 1), at(i, j - 1))).normalize();
      const d = N.dot(avg.sub(p));          // > 0: neighbours toward the normal side
      ao = clamp(1 - Math.abs(d) * o.foldAO, 0.45, 1);
    }
    b.v(p, u, v, o.piece ?? 0, ao, o.dblFn ? o.dblFn(i, j, u, v) : 0);
  }
  const row = nx + 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * row + i;
    b.q(a, a + row, a + row + 1, a + 1);
  }
  return b.geometry();
}

/** The seam/patch uniforms of a cloth material: { u: spacing (m, seams along v), w: width, patches: [[u0, v0, u1, v1], ...] }. */
export function clothSeams(mat, o = {}) {
  const U = mat.userData.prop;
  if (!U) return mat;
  U.prSeam = U.prSeam || { value: new THREE.Vector4() };
  U.prSeam.value.set(o.u ?? 0, o.w ?? 0.03, o.v ?? 0, o.vw ?? 0.03);
  return mat;
}

/**
 * A square sail from a baked grid (offline/sail.py -> cache/sail_<name>.json), in the sail's
 * frame: x across (yard), y up (0 = yard), z downwind. Returns { mesh, group (sail + bolt rope +
 * robands + reef points), corners: { headL, headR, clewL, clewR }, pointAt(u, v) } (u, v in 0..1).
 * o: { material, ropeMaterial, k (upsample, 2), reefRows ([0.16, 0.3] fractions of the depth
 * below the head), patches: [[u0, v0, u1, v1] metres], seed }
 */
export function squareSail(data, o = {}) {
  const raw = [];
  for (let i = 0; i < data.positions.length; i += 3) raw.push(new THREE.Vector3(data.positions[i], data.positions[i + 1], data.positions[i + 2]));
  const up = upsampleGrid(raw, data.nx, data.ny, o.k ?? 2);
  const { P, nx, ny } = up;
  const H = data.h, W0 = data.wHead, W1 = data.wFoot;
  // cloth coordinates: the flat sail's metres (u from the port leech, v down from the head)
  const uvAt = (i, j) => { const v = j / ny, w = W0 + (W1 - W0) * v; return [(i / nx - 0.5) * w + W1 / 2, v * H]; };
  const reefRows = o.reefRows ?? [0.17, 0.33];
  const dbl = (i, j, u, v) => {
    const fu = i / nx, fv = j / ny, w = W0 + (W1 - W0) * fv;
    const du = Math.min(fu, 1 - fu) * w, dv = Math.min(fv * H, (1 - fv) * H);
    let d = Math.max(smooth(0.07, 0.04, du), smooth(0.07, 0.04, dv));       // tabling (hems) all round
    // corner reinforcement patches (triangles at the clews and the head earings)
    for (const [cu, cv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const a = Math.abs(fu - cu) * w, c = Math.abs(fv - cv) * H;
      if (a + c < (cv ? 0.75 : 0.45)) d = 1;
    }
    for (const r of reefRows) if (Math.abs(fv - r) * H < 0.045) d = Math.max(d, 0.9);   // reef bands
    for (const p of o.patches || []) if (u > p[0] && u < p[2] && v > p[1] && v < p[3]) d = 1;
    return d;
  };
  const geo = clothGeometry(P, nx, ny, { uvFn: uvAt, dblFn: dbl, foldAO: 18, piece: o.piece ?? 0.37 });
  const group = new THREE.Group(); group.name = 'sail';
  const mesh = new THREE.Mesh(geo, o.material);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'sail-cloth';
  group.add(mesh);
  // normals of the grid (for things that sit on the cloth: bolt rope, reef points)
  geo.computeVertexNormals();
  const NA = geo.attributes.normal;
  const at = (i, j) => P[clamp(j, 0, ny) * (nx + 1) + clamp(i, 0, nx)];
  const nAt = (i, j) => { const k = clamp(j, 0, ny) * (nx + 1) + clamp(i, 0, nx); return new THREE.Vector3(NA.getX(k), NA.getY(k), NA.getZ(k)); };
  const pointAt = (fu, fv) => at(Math.round(fu * nx), Math.round(fv * ny)).clone();
  if (o.ropeMaterial) {
    const rb = new Builder(); rb.name = 'rope';
    // bolt rope sewn round the edges (on the after side of the sail: -z, the windward face)
    const edge = [];
    for (let i = 0; i <= nx; i++) edge.push(at(i, 0));
    for (let j = 1; j <= ny; j++) edge.push(at(nx, j));
    for (let i = nx - 1; i >= 0; i--) edge.push(at(i, ny));
    for (let j = ny - 1; j >= 0; j--) edge.push(at(0, j));
    tube(rb, edge.map((p, k) => p.clone()), o.boltRadius ?? 0.014, { sides: 6, seg: 0.05, piece: 0.2 });
    // reef points: short ties through the reef bands, both faces, hanging down a little
    const rnd = (a, b2) => hash(a * 31 + 7, b2 * 17 + 3);
    reefRows.forEach((r, ri) => {
      const j = Math.round(r * ny), w = W0 + (W1 - W0) * r;
      const n = Math.floor(w / 0.42);
      for (let k = 1; k < n; k++) {
        const fu = k / n, i = Math.round(fu * nx);
        const p = at(i, j), nn = nAt(i, j);
        for (const side of [-1, 1]) {
          const L = 0.22 + 0.08 * rnd(k, ri * 2 + (side > 0 ? 1 : 0));
          const sway = (rnd(k + 5, ri) - 0.5) * 0.06;
          const p0 = p.clone().addScaledVector(nn, side * 0.012);
          const pts = [p0, p0.clone().addScaledVector(nn, side * 0.05).add(new THREE.Vector3(sway * 0.5, -L * 0.45, 0)), p0.clone().addScaledVector(nn, side * 0.06).add(new THREE.Vector3(sway, -L, 0))];
          tube(rb, pts, 0.0045, { sides: 4, seg: 0.04, piece: 0.3 + 0.01 * k });
        }
      }
    });
    const ropes = new THREE.Mesh(rb.geometry(), o.ropeMaterial);
    ropes.castShadow = true; ropes.receiveShadow = true; ropes.name = 'sail-ropes';
    group.add(ropes);
  }
  const corners = { headL: at(0, 0).clone(), headR: at(nx, 0).clone(), clewL: at(0, ny).clone(), clewR: at(nx, ny).clone() };
  return { group, mesh, corners, pointAt, nx, ny, at, nAt };
}

/**
 * A cord with pennants (bunting) hung between a and b (world or parent space) with a catenary sag.
 * o: { sag (m) | slack (fraction of the span), n flags or spacing (m), size [w, h] (m), shapes
 *   ['tri'|'swallow'|'square'], colors [[r,g,b]...], flagMaterials (one per colour), cordMaterial,
 *   wind ([x, y, z]: how the flags blow), seed, flutter (0..1) }
 * Each pennant is a little cloth sheet folded over the cord (doubled hem at the top), hanging and
 * twisting with the cord's slope and the wind, its point lifted and curled a little. Returns a Group.
 */
export function bunting(a, b, o = {}) {
  const span = a.distanceTo(b);
  const L = span * (1 + (o.slack ?? 0.012));
  const cord = catenary(a, b, L, 48);
  const pts = resample(cord, 96);
  const group = new THREE.Group(); group.name = 'bunting';
  const cb = new Builder();
  tube(cb, pts, o.cordRadius ?? 0.005, { sides: 5, seg: 0.05, piece: 0.1 });
  const cm = new THREE.Mesh(cb.geometry(), o.cordMaterial); cm.castShadow = true; cm.receiveShadow = true;
  group.add(cm);
  const spacing = o.spacing ?? 0.42;
  const [fw, fh] = o.size || [0.26, 0.34];
  const n = Math.floor((pts.length_m - 0.3) / spacing);
  const builders = (o.flagMaterials || []).map(() => new Builder());
  const wind = new THREE.Vector3(...(o.wind || [0, 0, 0.35]));
  const seed = o.seed ?? 1;
  const curve = new THREE.CatmullRomCurve3(pts);
  const shapes = o.shapes || ['tri'];
  for (let k = 0; k < n; k++) {
    const t = (0.15 + k * spacing + spacing / 2) / pts.length_m;
    if (t >= 0.98) break;
    const c = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    const r = (q) => hash(seed * 977 + k * 13 + q);
    const ci = Math.floor(r(1) * builders.length) % builders.length;
    const B = builders[ci];
    const shape = shapes[Math.floor(r(2) * shapes.length) % shapes.length];
    // hanging direction: gravity, pushed by the wind, varied per flag (each flag catches it differently)
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(wind, 0.6 + 0.8 * r(3)).normalize();
    // the flag's plane contains the cord tangent and its hanging direction
    const side = new THREE.Vector3().crossVectors(T, down).normalize();
    const hang = new THREE.Vector3().crossVectors(side, T).normalize().multiplyScalar(-1);
    if (hang.y > 0) hang.negate();
    const twist = (r(4) - 0.5) * 0.5 * (o.flutter ?? 1);
    const NU = 8, NV = 10;
    const base = B.count;
    const w = fw * (0.95 + 0.1 * r(5)), h = fh * (0.92 + 0.16 * r(6));
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const fu = i / NU - 0.5, fv = j / NV;
      // outline: triangle / swallowtail / square, as a width profile down the flag
      let half = 0.5;
      if (shape === 'tri') half = 0.5 * (1 - fv);
      else if (shape === 'swallow') half = 0.5;
      let x = fu * 2 * half * w;
      let yv = fv * h;
      if (shape === 'swallow') { const notch = 0.35 * h * (1 - Math.abs(fu * 2)); yv = fv * (h - notch * (fv > 0 ? 1 : 0)); }
      // drape: a soft belly across, the point curling with the wind, a twist down the flag
      const belly = 0.018 * Math.sin(Math.PI * (fu + 0.5)) * Math.sin(Math.PI * Math.min(1, fv * 1.3)) * (0.5 + r(7));
      const curl = (0.04 + 0.05 * r(8)) * Math.pow(fv, 2.2) * (o.flutter ?? 1);
      const tw = twist * fv;
      const p = c.clone()
        .addScaledVector(T, x * Math.cos(tw))
        .addScaledVector(hang, yv + 0.01)
        .addScaledVector(side, belly + curl + x * Math.sin(tw) + 0.003);
      // hem: the top 3 cm are folded over the cord (doubled); the cut edges have a narrow rolled hem
      const edge = shape === 'tri' ? Math.min((half - Math.abs(fu * 2 * half)) * w, (1 - fv) * h * 0.5) : Math.min((0.5 - Math.abs(fu)) * w, h - yv);
      const dblv = Math.max(smooth(0.045, 0.03, yv), smooth(0.012, 0.004, edge) * 0.8);
      B.v(p, x + 0.5 * w + k * 0.7, yv, (ci + 1) * 0.11 + r(9) * 0.05, 1 - 0.15 * fv * r(10), dblv);
    }
    const row = NU + 1;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a0 = base + j * row + i;
      B.q(a0, a0 + 1, a0 + row + 1, a0 + row);
    }
    // the fold over the cord (a short loop of cloth wrapping it)
    const lb = B.count;
    for (let s = 0; s <= 6; s++) {
      const ang = (s / 6) * Math.PI * 1.6 - 0.3;
      for (let i = 0; i <= 2; i++) {
        const x = (i / 2 - 0.5) * w * (shape === 'tri' ? 1 : 1);
        const rr = 0.008;
        const p = c.clone().addScaledVector(T, x).addScaledVector(hang, -Math.cos(ang) * rr + rr * 0.5).addScaledVector(side, Math.sin(ang) * rr);
        B.v(p, x + 0.5 * w + k * 0.7, -0.01 - s * 0.004, (ci + 1) * 0.11, 0.85, 1);
      }
    }
    for (let s = 0; s < 6; s++) for (let i = 0; i < 2; i++) { const a0 = lb + s * 3 + i; B.q(a0, a0 + 1, a0 + 4, a0 + 3); }
  }
  builders.forEach((B, i) => {
    if (!B.X.n) return;
    const m = new THREE.Mesh(B.geometry(), o.flagMaterials[i]); m.castShadow = true; m.receiveShadow = true; m.name = 'bunting-flags-' + i;
    group.add(m);
  });
  return group;
}
