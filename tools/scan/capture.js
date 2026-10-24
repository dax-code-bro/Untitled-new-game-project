#!/usr/bin/env node
/* ============================================================
   Material capture.

   This is the back half of a photogrammetry pipeline. The front half —
   photographing a surface from many angles and solving for its geometry —
   has already been done by whoever shot these; what arrives here is a
   photograph of a surface, sometimes with maps alongside it. The job is
   to turn that into something a renderer can light correctly:

     delight      take the photograph's own lighting back out, so the
                  albedo is reflectance and not reflectance × illumination
     calibrate    scale that reflectance to the published diffuse albedo
                  of the real material, because a camera's exposure is
                  arbitrary and a renderer's is not
     tile         make it periodic without the ghosting a plain
                  cross-dissolve leaves, by blending low and high
                  frequencies over different widths
     height       mesostructure, from the displacement map if the capture
                  had one, otherwise from the delit luminance
     normal       the surface slope, computed from height in metres per
                  metre so the bump strength is physical rather than taste
     roughness    microstructure, into the measured range for that material
     occlusion    real horizon-angle ambient occlusion marched over the
                  height field

   Everything is done in linear light. Doing any of it on sRGB bytes is
   the single most common way to get a material that never quite sits in
   a scene.

     node tools/scan/capture.js [id ...]
   ============================================================ */

const fs = require('fs');
const path = require('path');
const sharp = require('/tmp/imgtools/node_modules/sharp');

const ROOT = path.join(__dirname, '..', '..');
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const RAW = path.join(ROOT, 'assets', 'scans', 'raw');
const OUT = path.join(ROOT, 'assets', 'scans', 'maps');

/* Published diffuse reflectance, visible band. These are the numbers a
   calibrated capture would have measured with a reference target in
   shot; a photograph on its own cannot know them, which is why an
   uncalibrated scan always looks slightly wrong under a physical sun. */
const ALBEDO = {
  sand: 0.35, meadow: 0.21, grassTurf: 0.20, rock: 0.25, forestFloor: 0.12,
  dirt: 0.17, gravel: 0.22, plank: 0.35, roughWood: 0.28, brick: 0.30,
  leather: 0.14, fabric: null, wornMetal: null, rubberWood: 0.10,
  ice: 0.35, fur: 0.13, stoneFloor: 0.28, waterSurface: null,
  cloth: 0.30, sailcloth: 0.42, rope: 0.22, weatheredTimber: 0.20,
  groundDetail: null, rockDetail: null, barkDetail: null,
};

/* ---------------- small float-image helpers ---------------- */

const srgbToLin = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  srgbToLin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

async function loadLinear(file, size) {
  const { data, info } = await sharp(file)
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = size * size;
  const out = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), size };
  for (let i = 0; i < n; i++) {
    out.r[i] = srgbToLin[data[i * info.channels]];
    out.g[i] = srgbToLin[data[i * info.channels + 1]];
    out.b[i] = srgbToLin[data[i * info.channels + 2]];
  }
  return out;
}

/* Raw 0..1 channels with no colour transform — normal, roughness and
   occlusion maps are data, and running them through a gamma curve is a
   bug that looks like a style choice. */
async function loadData(file, size) {
  const { data, info } = await sharp(file)
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = size * size;
  const out = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), size };
  for (let i = 0; i < n; i++) {
    out.r[i] = data[i * info.channels] / 255;
    out.g[i] = data[i * info.channels + 1] / 255;
    out.b[i] = data[i * info.channels + 2] / 255;
  }
  return out;
}

function luma(img) {
  const n = img.size * img.size;
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = 0.2126 * img.r[i] + 0.7152 * img.g[i] + 0.0722 * img.b[i];
  return l;
}

/* Separable box blur, repeated three times, which converges on a
   Gaussian and costs the same whatever the radius. `wrap` decides
   whether the image is treated as a tile — it must be false before the
   tiling step and true after it, or the seams reappear. */
function blur(src, size, radius, wrap, passes = 3) {
  let a = Float32Array.from(src);
  let b = new Float32Array(size * size);
  const r = Math.max(1, Math.round(radius));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[y * size + idx(k, size, wrap)];
      for (let x = 0; x < size; x++) {
        b[y * size + x] = sum / (2 * r + 1);
        sum -= a[y * size + idx(x - r, size, wrap)];
        sum += a[y * size + idx(x + r + 1, size, wrap)];
      }
    }
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += b[idx(k, size, wrap) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = sum / (2 * r + 1);
        sum -= b[idx(y - r, size, wrap) * size + x];
        sum += b[idx(y + r + 1, size, wrap) * size + x];
      }
    }
  }
  return a;
}
function idx(i, size, wrap) {
  if (wrap) return ((i % size) + size) % size;
  return i < 0 ? 0 : i >= size ? size - 1 : i;
}

/* ---------------- choosing a patch ----------------
   Three of these sources are not surface swatches at all: they are UV
   atlases unwrapped off a scanned object, with a dozen materials and the
   empty space between them laid out in one image. Tiling an atlas gives
   you a wallpaper of helmet parts.

   Rather than eyeball a rectangle, the patch is chosen by measuring:
   slide a window over the image and score each position for being one
   material — low variation in hue, low variation in the broad lighting,
   but plenty of fine detail, which is what separates a leather panel
   from the flat background it sits on. */
function autoCrop(img, wins) {
  const S = img.size;
  const l = luma(img);
  let best = null;
  for (const win of wins) {
  const w = Math.max(16, Math.round(win * S));
  const stride = Math.max(4, Math.round(w / 8));
  const lo = blur(l, S, Math.max(3, w / 6), false, 3);
  for (let y = 0; y + w <= S; y += stride) {
    for (let x = 0; x + w <= S; x += stride) {
      let n = 0, sumL = 0, sumL2 = 0, sumHF = 0;
      let sumA = 0, sumA2 = 0, sumB = 0, sumB2 = 0;
      for (let j = 0; j < w; j += 2) {
        for (let i = 0; i < w; i += 2) {
          const k = (y + j) * S + (x + i);
          const L = l[k];
          sumL += lo[k]; sumL2 += lo[k] * lo[k];
          const hf = L - lo[k]; sumHF += hf * hf;
          // Crude opponent-colour axes: enough to notice two materials.
          const a = img.r[k] - img.g[k], b2 = img.b[k] - img.g[k];
          sumA += a; sumA2 += a * a; sumB += b2; sumB2 += b2 * b2;
          n++;
        }
      }
      const varL = sumL2 / n - (sumL / n) ** 2;
      const chroma = (sumA2 / n - (sumA / n) ** 2) + (sumB2 / n - (sumB / n) ** 2);
      const detail = sumHF / n;
      // Detail is good but saturates; uniformity is what we are really after.
      /* Uniformity dominates. A window that straddles two materials has
         a high broad-scale variance and a wide spread of hue, and both
         are far more damning than a shortage of fine detail. Bigger
         windows are preferred only slightly, so a small clean patch
         beats a large dirty one. */
      const score = Math.min(detail, 0.003) * 180
        - varL * 420 - chroma * 520 + win * 1.2;
      if (!best || score > best.score) best = { score, x: x / S, y: y / S, w: win, h: win };
    }
  }
  }
  return best;
}

async function loadCropped(file, size, crop, wins) {
  if (!crop) return loadLinear(file, size);
  const probe = await loadLinear(file, 512);
  const rect = autoCrop(probe, wins);
  const meta = await sharp(file).metadata();
  const px = (v, dim) => Math.max(0, Math.min(dim - 8, Math.round(v * dim)));
  const region = {
    left: px(rect.x, meta.width), top: px(rect.y, meta.height),
    width: Math.max(8, Math.round(rect.w * meta.width)),
    height: Math.max(8, Math.round(rect.h * meta.height)),
  };
  const buf = await sharp(file).extract(region).toBuffer();
  const img = await loadLinear(buf, size);
  img.crop = region;
  return img;
}

/* The same patch has to be taken out of every other map of that scan, or
   the normal will not belong to the albedo. */
async function loadDataCropped(file, size, region) {
  if (!region) return loadData(file, size);
  const buf = await sharp(file).extract(region).toBuffer();
  return loadData(buf, size);
}

/* ---------------- delighting ----------------
   A photograph of a surface carries the lighting it was shot under:
   a gradient across the frame, a vignette, the shadow of whoever was
   holding the camera. None of that belongs in an albedo map — it will be
   lit a second time by the renderer, and the double shading is what makes
   a textured surface look like a photograph of a surface rather than the
   surface itself.

   The illumination field is low frequency by nature, so estimating it as
   a heavy blur of the luminance and dividing it out is both the standard
   fix and very nearly the right one. */
function delight(img, strength = 1) {
  const S = img.size;
  const l = luma(img);
  const field = blur(l, S, Math.max(4, S / 12), false, 3);
  let mean = 0;
  for (let i = 0; i < field.length; i++) mean += field[i];
  mean /= field.length;
  for (let i = 0; i < l.length; i++) {
    const f = field[i] > 1e-5 ? mean / field[i] : 1;
    // Partial correction keeps a trace of the real mesoscale occlusion,
    // which the surface genuinely has; full correction flattens it.
    const k = 1 + (f - 1) * strength;
    img.r[i] *= k; img.g[i] *= k; img.b[i] *= k;
  }
  return img;
}

/* ---------------- calibration ----------------
   Scale so the mean linear luminance equals the published diffuse
   reflectance of the real material. */
function calibrate(img, target) {
  if (!target) return img;
  const l = luma(img);
  let mean = 0;
  for (let i = 0; i < l.length; i++) mean += l[i];
  mean /= l.length;
  if (mean < 1e-5) return img;
  const k = target / mean;
  for (let i = 0; i < l.length; i++) {
    img.r[i] = Math.min(1, img.r[i] * k);
    img.g[i] = Math.min(1, img.g[i] * k);
    img.b[i] = Math.min(1, img.b[i] * k);
  }
  return img;
}

/* ---------------- tiling ----------------
   A plain cross-dissolve makes an image periodic but averages two
   unrelated parts of the photograph over a wide band, and the result is
   a smeared ghost down the middle of every tile. Splitting the image
   into a low and a high band first and dissolving each over its own
   width fixes it: low frequencies can be blended over half the image
   without anyone seeing, and high frequencies only need a narrow band
   to hide the join. */
function tileChannel(src, size, wide, narrow) {
  const low = blur(src, size, Math.max(3, size / 24), false, 3);
  const high = new Float32Array(size * size);
  for (let i = 0; i < src.length; i++) high[i] = src[i] - low[i];
  const lowT = crossDissolve(low, size, wide);
  const highT = crossDissolve(high, size, narrow);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = lowT[i] + highT[i];
  return out;
}

/* Blend the image with copies of itself shifted by a whole tile, using
   weights that are exactly complementary at the edges. That is what
   makes the result periodic by construction rather than by eye. */
function crossDissolve(src, size, band) {
  const out = new Float32Array(size * size);
  const w = Math.max(1, Math.round(band));
  const ramp = (d) => {
    if (d >= w) return 1;
    const t = d / w;
    return t * t * (3 - 2 * t) * 0.5 + 0.5;       // smoothstep, 0.5..1
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ax = ramp(Math.min(x, size - 1 - x));
      const ay = ramp(Math.min(y, size - 1 - y));
      const xm = (x + size / 2) % size, ym = (y + size / 2) % size;
      // Horizontal pair, then vertical pair; separable and periodic.
      const h = src[y * size + x] * ax + src[y * size + Math.floor(xm)] * (1 - ax);
      const hv = src[Math.floor(ym) * size + x] * ax + src[Math.floor(ym) * size + Math.floor(xm)] * (1 - ax);
      out[y * size + x] = h * ay + hv * (1 - ay);
    }
  }
  return out;
}

function tileRgb(img, size) {
  const wide = size / 2, narrow = Math.max(4, size / 14);
  return {
    r: tileChannel(img.r, size, wide, narrow),
    g: tileChannel(img.g, size, wide, narrow),
    b: tileChannel(img.b, size, wide, narrow),
    size,
  };
}

/* ---------------- normal from height ----------------
   The slope is in metres of rise per metre of run, so the bump strength
   comes out of the physical amplitude of the surface and the size of the
   tile rather than from a number tuned until it looked right. */
/* The gradient of the height field, before any scaling. Its RMS is what
   the strength is solved against. */
function rmsGradient(height, size) {
  let sum = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + idx(x - 1, size, true)];
      const r = height[y * size + idx(x + 1, size, true)];
      const d = height[idx(y - 1, size, true) * size + x];
      const u = height[idx(y + 1, size, true) * size + x];
      const gx = (l - r) * 0.5, gy = (d - u) * 0.5;
      sum += gx * gx + gy * gy;
    }
  }
  return Math.sqrt(sum / (size * size));
}

/* Scale the slope so the surface has the RMS roughness angle a real one
   of that kind has. Guessing a bump amplitude in millimetres and hoping
   it reads at a metre is how a normal map ends up either invisible or
   like crumpled foil; a target slope is something you can look up, argue
   about, and measure afterwards. */
function normalFromHeight(height, size, slopeDeg, _metresPerTile) {
  const g = rmsGradient(height, size) || 1e-6;
  const k = Math.tan(slopeDeg * Math.PI / 180) / g;
  const out = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + idx(x - 1, size, true)];
      const r = height[y * size + idx(x + 1, size, true)];
      const d = height[idx(y - 1, size, true) * size + x];
      const u = height[idx(y + 1, size, true) * size + x];
      const nx = (l - r) * 0.5 * k;
      const ny = (d - u) * 0.5 * k;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 3;
      out[i] = nx / len; out[i + 1] = ny / len; out[i + 2] = nz / len;
    }
  }
  return out;
}

/* A supplied normal map is measured and rescaled the same way, so a scan
   whose normals were authored flat and one whose were authored violent
   both end up at the slope the real surface has. */
function retargetNormal(n3, count, slopeDeg) {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const z = Math.max(1e-4, n3[i * 3 + 2]);
    const tx = n3[i * 3] / z, ty = n3[i * 3 + 1] / z;
    sum += tx * tx + ty * ty;
  }
  const rms = Math.sqrt(sum / count) || 1e-6;
  const k = Math.tan(slopeDeg * Math.PI / 180) / rms;
  for (let i = 0; i < count; i++) {
    const z = Math.max(1e-4, n3[i * 3 + 2]);
    let x = (n3[i * 3] / z) * k, y = (n3[i * 3 + 1] / z) * k;
    const len = Math.hypot(x, y, 1);
    n3[i * 3] = x / len; n3[i * 3 + 1] = y / len; n3[i * 3 + 2] = 1 / len;
  }
  return n3;
}

/* ---------------- horizon ambient occlusion ----------------
   For each texel, march outward in a ring of directions and record the
   highest angle the terrain rises to. The fraction of the hemisphere
   still visible is the occlusion. This is the real thing rather than a
   blurred-and-inverted height field, and it is what gives a scanned
   surface its depth under flat sky. */
function horizonAo(height, size, heightAmpM, metresPerTile, dirs = 16, steps = 10) {
  const texelM = metresPerTile / size;
  const out = new Float32Array(size * size);
  const cos = [], sin = [];
  for (let d = 0; d < dirs; d++) { const a = (d / dirs) * Math.PI * 2; cos.push(Math.cos(a)); sin.push(Math.sin(a)); }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h0 = height[y * size + x] * heightAmpM;
      let occ = 0;
      for (let d = 0; d < dirs; d++) {
        let maxTan = 0;
        for (let s = 1; s <= steps; s++) {
          const sx = idx(Math.round(x + cos[d] * s), size, true);
          const sy = idx(Math.round(y + sin[d] * s), size, true);
          const dh = height[sy * size + sx] * heightAmpM - h0;
          if (dh > 0) maxTan = Math.max(maxTan, dh / (s * texelM));
        }
        // Visible fraction of that slice of the hemisphere.
        occ += Math.sin(Math.atan(maxTan));
      }
      out[y * size + x] = 1 - occ / dirs;
    }
  }
  return out;
}

/* ---------------- write ---------------- */

async function writeRgb(file, r, g, b, size, srgb, quality) {
  const buf = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    buf[i * 3] = srgb ? linToSrgb(r[i]) : Math.max(0, Math.min(255, Math.round(r[i] * 255)));
    buf[i * 3 + 1] = srgb ? linToSrgb(g[i]) : Math.max(0, Math.min(255, Math.round(g[i] * 255)));
    buf[i * 3 + 2] = srgb ? linToSrgb(b[i]) : Math.max(0, Math.min(255, Math.round(b[i] * 255)));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(buf, { raw: { width: size, height: size, channels: 3 } })
    .webp({ quality, effort: 6 }).toFile(file);
  return fs.statSync(file).size;
}

/* ---------------- one material ---------------- */

async function capture(m) {
  const dir = path.join(RAW, m.id);
  const size = m.size || 256;
  const work = Math.max(size, 512);                 // process large, ship small
  const find = (slot) => {
    if (!m.maps[slot]) return null;
    const ext = path.extname(m.maps[slot]) || '.png';
    const f = path.join(dir, `${slot}${ext}`);
    return fs.existsSync(f) ? f : null;
  };

  const stats = { id: m.id, from: [] };

  /* --- albedo --- */
  let albedo;
  let region = null;
  if (find('color')) {
    albedo = await loadCropped(find('color'), work, m.crop === 'auto', [0.07, 0.09, 0.12, 0.16, 0.22]);
    region = albedo.crop || null;
    delight(albedo, 0.85);
    if (m.structureOnly) {
      /* Some captures are worth having for their weave, their grain or
         their wear, and not at all for their colour — a helmet's leather
         panels come with the piping and the rivets still attached, and a
         rifle's stock is whatever walnut the game says it is. Keep the
         fine detail, throw away everything broad enough to read as a
         shape, and sit it on the published reflectance. */
      const l = luma(albedo);
      const lo = blur(l, work, Math.max(3, work / 12), false, 3);
      const base = m.neutralAlbedo || 0.3;
      const gain = m.structureGain != null ? m.structureGain : 1.6;
      for (let i = 0; i < l.length; i++) {
        const d = (l[i] - lo[i]) * gain;
        /* Clamped either side of the base rather than at zero and one, so
           a map meant to multiply a vertex colour keeps its mean where it
           was put. A mean below one is a dimmer switch nobody asked for. */
        const v = Math.max(base * 0.35, Math.min(Math.min(1, base * 1.65), base + d));
        albedo.r[i] = v; albedo.g[i] = v; albedo.b[i] = v;
      }
      stats.from.push('structure only, published reflectance');
    } else if (m.neutralAlbedo) {
      /* Some captures carry a colour the game has no use for — a blue
         technical weave, a leopard's spots — while their weave and pile
         are exactly right. Keep the structure, drop the hue, and let
         whatever is wearing it supply the colour. */
      const l = luma(albedo);
      for (let i = 0; i < l.length; i++) { albedo.r[i] = l[i]; albedo.g[i] = l[i]; albedo.b[i] = l[i]; }
      calibrate(albedo, m.neutralAlbedo);
      stats.from.push('colour photograph, hue removed');
    } else {
      calibrate(albedo, ALBEDO[m.id]);
      stats.from.push('colour photograph');
    }
    if (region) stats.crop = region;
    albedo = tileRgb(albedo, work);
  } else if (m.neutralAlbedo) {
    /* A capture that is only a normal map — scratches in steel, say —
       still needs somewhere to sit. Published reflectance, flat. */
    const n = work * work;
    const v = m.neutralAlbedo;
    albedo = { r: new Float32Array(n).fill(v), g: new Float32Array(n).fill(v), b: new Float32Array(n).fill(v), size: work };
    stats.from.push('published reflectance, flat');
  } else {
    // Water has no albedo of its own; it is whatever the sky is doing.
    const n = work * work;
    albedo = { r: new Float32Array(n).fill(0.08), g: new Float32Array(n).fill(0.11), b: new Float32Array(n).fill(0.13), size: work };
  }

  /* --- height --- */
  let height;
  if (find('height')) {
    const h = await loadDataCropped(find('height'), work, region);
    height = tileChannel(h.r, work, work / 2, Math.max(4, work / 14));
    stats.from.push('displacement map');
  } else {
    // Mesostructure is the mid-frequency part of the delit luminance:
    // the low band is shape the renderer already has from the mesh, the
    // very top band is grain that belongs in roughness.
    const l = luma(albedo);
    const lo = blur(l, work, Math.max(3, work / 10), true, 3);
    height = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) height[i] = l[i] - lo[i];
    normalise(height);
  }

  /* --- normal --- */
  let normal;
  if (find('normal')) {
    const nm = await loadDataCropped(find('normal'), work, region);
    const nr = tileChannel(nm.r, work, work / 2, Math.max(4, work / 14));
    const ng = tileChannel(nm.g, work, work / 2, Math.max(4, work / 14));
    const nb = tileChannel(nm.b, work, work / 2, Math.max(4, work / 14));
    normal = new Float32Array(work * work * 3);
    for (let i = 0; i < work * work; i++) {
      let x = nr[i] * 2 - 1, y = ng[i] * 2 - 1, z = nb[i] * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      normal[i * 3] = x / len; normal[i * 3 + 1] = y / len; normal[i * 3 + 2] = Math.abs(z / len);
    }
    retargetNormal(normal, work * work, m.slopeDeg || 15);
    stats.from.push('normal map, retargeted');
  } else {
    normal = normalFromHeight(height, work, m.slopeDeg || 15, m.metresPerTile || 1);
    stats.from.push('normal derived from height');
  }

  /* --- roughness --- */
  const [rLo, rHi] = m.roughRange || [0.5, 0.95];
  let rough = new Float32Array(work * work);
  if (find('roughness')) {
    const rm = await loadDataCropped(find('roughness'), work, region);
    rough = remap(tileChannel(rm.r, work, work / 2, Math.max(4, work / 14)), rLo, rHi);
    stats.from.push('roughness map');
  } else if (find('orm')) {
    const om = await loadDataCropped(find('orm'), work, region);
    rough = remap(tileChannel(om.g, work, work / 2, Math.max(4, work / 14)), rLo, rHi);
    stats.from.push('ORM roughness');
  } else {
    /* No measured roughness, so infer it from the surface itself: the
       local variance of the albedo tracks how broken up the surface is,
       and a broken surface scatters more widely. Crude, but it is
       correlated with the truth and a constant is not. */
    const l = luma(albedo);
    const lo = blur(l, work, Math.max(2, work / 64), true, 2);
    const varr = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) { const d = l[i] - lo[i]; varr[i] = d * d; }
    const sm = blur(varr, work, Math.max(3, work / 18), true, 3);
    for (let i = 0; i < sm.length; i++) sm[i] = Math.sqrt(Math.max(0, sm[i]));
    rough = remap(sm, rLo, rHi, 0.05, 0.95);
    stats.from.push('roughness inferred from albedo variance');
  }

  /* --- occlusion --- */
  let ao;
  if (find('orm')) {
    const om = await loadDataCropped(find('orm'), work, region);
    ao = normaliseAo(tileChannel(om.r, work, work / 2, Math.max(4, work / 14)));
    stats.from.push('ORM occlusion');
  } else {
    ao = normaliseAo(horizonAo(height, work, (m.heightAmpM || 0.01) * 6, m.metresPerTile || 1));
    stats.from.push('horizon occlusion from height');
  }

  /* --- metalness --- */
  const metal = new Float32Array(work * work);
  if (find('orm') && m.metal > 0) {
    const om = await loadDataCropped(find('orm'), work, region);
    const bt = tileChannel(om.b, work, work / 2, Math.max(4, work / 14));
    for (let i = 0; i < metal.length; i++) metal[i] = clamp01(bt[i]);
  } else {
    metal.fill(m.metal || 0);
  }

  /* --- downsample and write --- */
  /* Three resolutions, because the three maps carry different amounts of
     information. Colour needs the full tile. The normal is halved — the
     shader resamples it at a second, much higher frequency for close
     range anyway, so the base tile only has to carry the shape. The
     occlusion and roughness are smooth by nature and survive a quarter. */
  const nSize = Math.max(128, size >> 1);
  const oSize = Math.max(64, size >> 2);
  const outDir = path.join(OUT, m.id);
  const nOut = down3(normal, work, nSize);
  const bytes = {
    albedo: await writeRgb(path.join(outDir, 'albedo.webp'),
      resample(albedo.r, work, size), resample(albedo.g, work, size), resample(albedo.b, work, size), size, true, 80),
    normal: await writeRgb(path.join(outDir, 'normal.webp'),
      mapArr(nOut.x, (v) => v * 0.5 + 0.5), mapArr(nOut.y, (v) => v * 0.5 + 0.5), mapArr(nOut.z, (v) => v * 0.5 + 0.5), nSize, false, 86),
    orm: await writeRgb(path.join(outDir, 'orm.webp'),
      resample(ao, work, oSize), resample(rough, work, oSize), resample(metal, work, oSize), oSize, false, 84),
  };

  let mean = 0;
  const la = luma(albedo);
  for (let i = 0; i < la.length; i++) mean += la[i];
  let sl = 0;
  for (let i = 0; i < work * work; i++) {
    const z = Math.max(1e-4, normal[i * 3 + 2]);
    sl += (normal[i * 3] / z) ** 2 + (normal[i * 3 + 1] / z) ** 2;
  }
  stats.slopeDeg = +(Math.atan(Math.sqrt(sl / (work * work))) * 180 / Math.PI).toFixed(1);
  stats.size = size;
  stats.normalSize = nSize;
  stats.ormSize = oSize;
  stats.meanAlbedo = +(mean / la.length).toFixed(3);
  stats.bytes = bytes;
  stats.totalKb = +((bytes.albedo + bytes.normal + bytes.orm) / 1024).toFixed(1);
  return stats;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* Stretch whatever range a source map actually occupies onto the range
   the material really has. Scans arrive with their roughness crushed
   into the top of the byte range as often as not, and remapping by the
   literal value then pins every texel at the maximum — which is how a
   whole material ends up uniformly matte. */
function percentile(src, lo, hi) {
  const a = Float32Array.from(src).sort();
  const at = (p) => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  return [at(lo), at(hi)];
}
function remap(src, outLo, outHi, pLo = 0.02, pHi = 0.98) {
  const [a, b] = percentile(src, pLo, pHi);
  const d = (b - a) || 1;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = outLo + (outHi - outLo) * clamp01((src[i] - a) / d);
  return out;
}

/* Ambient occlusion is mostly open sky with darkness in the creases. A
   map whose mean is a half is not occlusion, it is a dirt layer, and it
   drags the whole surface into shadow before the renderer has lit it. */
function normaliseAo(src, mean = 0.86, floor = 0.35) {
  let m = 0;
  for (let i = 0; i < src.length; i++) m += src[i];
  m /= src.length;
  const out = new Float32Array(src.length);
  const k = m > 1e-4 ? mean / m : 1;
  for (let i = 0; i < src.length; i++) out[i] = Math.max(floor, Math.min(1, src[i] * k));
  return out;
}
function mapArr(a, f) { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = f(a[i]); return o; }
function normalise(a) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const d = hi - lo || 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / d;
}
function resample(src, from, to, _ch) {
  if (from === to) return src;
  const out = new Float32Array(to * to);
  const k = from / to;
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      let sum = 0, n = 0;
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) {
          sum += src[idx(Math.floor(y * k + dy), from, true) * from + idx(Math.floor(x * k + dx), from, true)];
          n++;
        }
      }
      out[y * to + x] = sum / Math.max(1, n);
    }
  }
  return out;
}
function down3(n3, from, to) {
  const x = new Float32Array(from * from), y = new Float32Array(from * from), z = new Float32Array(from * from);
  for (let i = 0; i < from * from; i++) { x[i] = n3[i * 3]; y[i] = n3[i * 3 + 1]; z[i] = n3[i * 3 + 2]; }
  const rx = resample(x, from, to), ry = resample(y, from, to), rz = resample(z, from, to);
  for (let i = 0; i < to * to; i++) {
    const len = Math.hypot(rx[i], ry[i], rz[i]) || 1;
    rx[i] /= len; ry[i] /= len; rz[i] /= len;
  }
  return { x: rx, y: ry, z: rz };
}

(async () => {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const list = only.length ? SRC.materials.filter((m) => only.includes(m.id)) : SRC.materials;
  const report = [];
  let total = 0;
  for (const m of list) {
    const t = Date.now();
    const s = await capture(m);
    total += s.totalKb;
    report.push(s);
    console.log(`  ${s.id.padEnd(14)} ${String(s.size).padStart(4)}px  ${String(s.totalKb).padStart(6)} kB  albedo ${s.meanAlbedo}  slope ${s.slopeDeg}°  ${((Date.now() - t) / 1000).toFixed(1)}s  [${s.from.join(', ')}]`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.length} materials, ${(total / 1024).toFixed(2)} MB of maps`);
})();
