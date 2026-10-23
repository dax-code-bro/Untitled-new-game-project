// FX library - deep shadow grid: how much sun and sky light reaches each particle of a cloud.
//
// A dust cloud or smoke plume is dark inside and underneath and bright on its sunlit side; the
// per-sprite self-shadow cannot know that. Each frame the particles' extinction is splatted
// into a coarse 3D grid around them, light is marched through the grid toward the sun and
// straight up (sky), and every particle reads its transmittance at its own position (sampled
// half a radius toward the light, so a puff does not shadow itself twice). Pure in t: it only
// depends on this frame's particles. Cost ~ N particles + res^3 * res (JS, ~5-30 ms).

export class ShadowGrid {
  constructor(res = 24, o = {}) {
    this.res = Math.max(4, res | 0);
    const R = this.res;
    this.sig = new Float32Array(R * R * R);
    this.tSun = new Float32Array(R * R * R);
    this.tSky = new Float32Array(R * R * R);
    this.sunDir = [0.3, 0.8, 0.5];
    this.pad = o.pad ?? 1.0;
    this.ambientDirs = o.ambientDirs ?? 1;
  }
  setSun(d) { const l = Math.hypot(d[0], d[1], d[2]) || 1; this.sunDir = [d[0] / l, d[1] / l, d[2] / l]; }

  /**
   * A (x,y,z,r per particle), C (alpha, seed, age, -), n, density(i) -> extinction 1/m of
   * particle i (default: alpha * 1.5).
   */
  build(A, C, n, density) {
    const R = this.res;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const r = A[i * 4 + 3];
      for (let k = 0; k < 3; k++) { const v = A[i * 4 + k]; if (v - r < lo[k]) lo[k] = v - r; if (v + r > hi[k]) hi[k] = v + r; }
    }
    // cubic cells (the march step is one cell)
    const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.5) * (1 + 0.1 * this.pad);
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    this.origin = [c[0] - ext / 2, c[1] - ext / 2, c[2] - ext / 2];
    this.cell = ext / R;
    const cell = this.cell, o = this.origin, sig = this.sig;
    sig.fill(0);
    const cellVol = cell * cell * cell;
    for (let i = 0; i < n; i++) {
      const x = A[i * 4], y = A[i * 4 + 1], z = A[i * 4 + 2], r = A[i * 4 + 3];
      const s = density ? density(i) : C[i * 4] * 1.5;
      if (!(s > 0)) continue;
      // total "extinction volume" of the particle (sigma * volume of its ball, ~0.5 of it dense)
      const mass = s * (4.18879 * r * r * r) * 0.5;
      const rc = r / cell;
      if (rc < 0.75) {
        // trilinear splat of the whole mass
        const gx = (x - o[0]) / cell - 0.5, gy = (y - o[1]) / cell - 0.5, gz = (z - o[2]) / cell - 0.5;
        const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
        const fx = gx - ix, fy = gy - iy, fz = gz - iz;
        for (let k = 0; k < 8; k++) {
          const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
          const X = ix + dx, Y = iy + dy, Z = iz + dz;
          if (X < 0 || Y < 0 || Z < 0 || X >= R || Y >= R || Z >= R) continue;
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
          sig[X + R * (Y + R * Z)] += w * mass / cellVol;
        }
      } else {
        // spread over the cells inside the ball (weights normalised)
        const x0 = Math.max(0, Math.floor((x - r - o[0]) / cell)), x1 = Math.min(R - 1, Math.floor((x + r - o[0]) / cell));
        const y0 = Math.max(0, Math.floor((y - r - o[1]) / cell)), y1 = Math.min(R - 1, Math.floor((y + r - o[1]) / cell));
        const z0 = Math.max(0, Math.floor((z - r - o[2]) / cell)), z1 = Math.min(R - 1, Math.floor((z + r - o[2]) / cell));
        let wsum = 0;
        const r2 = r * r;
        for (let Z = z0; Z <= z1; Z++) for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
          const px = o[0] + (X + 0.5) * cell - x, py = o[1] + (Y + 0.5) * cell - y, pz = o[2] + (Z + 0.5) * cell - z;
          const d2 = px * px + py * py + pz * pz;
          if (d2 < r2) wsum += 1 - d2 / r2;
        }
        if (wsum <= 0) continue;
        const k = mass / cellVol / wsum;
        for (let Z = z0; Z <= z1; Z++) for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
          const px = o[0] + (X + 0.5) * cell - x, py = o[1] + (Y + 0.5) * cell - y, pz = o[2] + (Z + 0.5) * cell - z;
          const d2 = px * px + py * py + pz * pz;
          if (d2 < r2) sig[X + R * (Y + R * Z)] += k * (1 - d2 / r2);
        }
      }
    }
    this.blur();
    this.march(this.sunDir, this.tSun);
    this.column(this.tSky);
  }

  /** Straight up: a running sum per column (exact for the grid, cheap). */
  column(out) {
    const R = this.res, sig = this.sig, cell = this.cell;
    for (let Z = 0; Z < R; Z++) for (let X = 0; X < R; X++) {
      let tau = 0;
      for (let Y = R - 1; Y >= 0; Y--) {
        const i = X + R * (Y + R * Z);
        tau += sig[i] * 0.5;
        out[i] = Math.exp(-tau * cell);
        tau += sig[i] * 0.5;
      }
    }
  }

  /** One separable [1 2 1]/4 pass on the density (soft shadow edges, no cell blocks). */
  blur() {
    const R = this.res, a = this.sig;
    const b = this.tmp || (this.tmp = new Float32Array(R * R * R));
    const pass = (src, dst, sx, sy, sz) => {
      for (let Z = 0; Z < R; Z++) for (let Y = 0; Y < R; Y++) for (let X = 0; X < R; X++) {
        const i = X + R * (Y + R * Z);
        const c = X * sx + Y * sy + Z * sz;
        const st = sx + R * sy + R * R * sz;
        const l = c > 0 ? src[i - st] : src[i], r = c < R - 1 ? src[i + st] : src[i];
        dst[i] = 0.25 * l + 0.5 * src[i] + 0.25 * r;
      }
    };
    pass(a, b, 1, 0, 0); pass(b, a, 0, 1, 0); pass(a, b, 0, 0, 1); a.set(b);
  }

  /** Transmittance from every cell centre out of the grid along dir (step = 1 cell, trilinear). */
  march(dir, out) {
    const R = this.res, sig = this.sig, cell = this.cell;
    const steps = Math.ceil(R * 1.75);
    for (let Z = 0; Z < R; Z++) for (let Y = 0; Y < R; Y++) for (let X = 0; X < R; X++) {
      let x = X + dir[0] * 0.5, y = Y + dir[1] * 0.5, z = Z + dir[2] * 0.5;    // cell-centre coords
      let tau = 0;
      for (let s = 0; s < steps; s++) {
        if (x < -0.5 || y < -0.5 || z < -0.5 || x > R - 0.5 || y > R - 0.5 || z > R - 0.5) break;
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        const fx = x - ix, fy = y - iy, fz = z - iz;
        let v = 0;
        for (let k = 0; k < 8; k++) {
          const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
          const X2 = ix + dx, Y2 = iy + dy, Z2 = iz + dz;
          if (X2 < 0 || Y2 < 0 || Z2 < 0 || X2 >= R || Y2 >= R || Z2 >= R) continue;
          v += (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz) * sig[X2 + R * (Y2 + R * Z2)];
        }
        tau += v;
        x += dir[0]; y += dir[1]; z += dir[2];
      }
      out[X + R * (Y + R * Z)] = Math.exp(-tau * cell);
    }
  }

  sample(arr, x, y, z) {
    const R = this.res, o = this.origin, cell = this.cell;
    const gx = (x - o[0]) / cell - 0.5, gy = (y - o[1]) / cell - 0.5, gz = (z - o[2]) / cell - 0.5;
    const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
    const fx = gx - ix, fy = gy - iy, fz = gz - iz;
    let v = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
      const X = Math.min(R - 1, Math.max(0, ix + dx)), Y = Math.min(R - 1, Math.max(0, iy + dy)), Z = Math.min(R - 1, Math.max(0, iz + dz));
      v += (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz) * arr[X + R * (Y + R * Z)];
    }
    return v;
  }

  /** Write sun transmittance into C.w and sky visibility into E.x. */
  lookup(A, C, E, n) {
    const L = this.sunDir;
    for (let i = 0; i < n; i++) {
      const x = A[i * 4], y = A[i * 4 + 1], z = A[i * 4 + 2], r = A[i * 4 + 3] * 0.6;
      C[i * 4 + 3] = Math.max(0.02, this.sample(this.tSun, x + L[0] * r, y + L[1] * r, z + L[2] * r));
      E[i * 2] = Math.max(0.05, this.sample(this.tSky, x, y + r, z));
    }
  }
}
