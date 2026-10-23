// Comparing the GPU check's test frame with the reference frame rendered on the cloud machine
// (SwiftShader), on which every shot was reviewed. render/gpu-check.mjs uses it.
//
// The reference is small and text-only (pc/reference-image.json, no binary files in git): a
// 192x108 area-averaged thumbnail of the whole 4K frame and two 1:1 crops of 96x96 pixels, as base64
// RGB, plus the share of pure black / pure white pixels. The comparison:
//   - thumbnail: PSNR and SSIM (luma, 8x8 windows): colour, exposure, missing or moved objects, black blocks;
//   - 1:1 crops: PSNR: fine detail (precision, derivatives, texture filtering);
//   - pure black / pure white pixels against the reference: NaN and infinity in the float pipeline end up as
//     black or white pixels in the 8-bit frame;
//   - the float buffers themselves (window.dk.debugCinematic(): NaN / Inf counts per buffer), read in the page.
import zlib from 'node:zlib';

export const THUMB_W = 192, THUMB_H = 108, CROP = 96;

/** Area-average downscale of an RGBA (8-bit) frame to RGB tw x th. */
export function thumbnail(rgba, w, h, tw = THUMB_W, th = THUMB_H) {
  const out = new Uint8Array(tw * th * 3);
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor((ty * h) / th), y1 = Math.floor(((ty + 1) * h) / th);
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * w) / tw), x1 = Math.floor(((tx + 1) * w) / tw);
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
      }
      const n = (y1 - y0) * (x1 - x0), o = (ty * tw + tx) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

/** 1:1 RGB crop of an RGBA frame. */
export function crop(rgba, w, x, y, cw = CROP, ch = CROP) {
  const out = new Uint8Array(cw * ch * 3);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const s = ((y + j) * w + (x + i)) * 4, d = (j * cw + i) * 3;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2];
  }
  return out;
}

/** Share of pure black (all channels <= 1) and pure white (all >= 254) pixels. */
export function extremes(rgba) {
  let black = 0, white = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r <= 1 && g <= 1 && b <= 1) black++;
    else if (r >= 254 && g >= 254 && b >= 254) white++;
  }
  return { black: black / n, white: white / n };
}

export function psnr(a, b) {
  let se = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; se += d * d; }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

const luma = (rgb) => {
  const out = new Float64Array(rgb.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2];
  return out;
};

/** Mean SSIM of the luma of two RGB images (8x8 windows, step 4). */
export function ssim(a, b, w, h) {
  const A = luma(a), B = luma(b);
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let sum = 0, n = 0;
  for (let y = 0; y + 8 <= h; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
    let ma = 0, mb = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * w + x + i; ma += A[k]; mb += B[k]; }
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cov = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = (y + j) * w + x + i; const da = A[k] - ma, db = B[k] - mb; va += da * da; vb += db * db; cov += da * db; }
    va /= 63; vb /= 63; cov /= 63;
    sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
    n++;
  }
  return n ? sum / n : 1;
}

/** Pixel data <-> text (deflate + base64) for the JSON reference. */
export const pack = (u8) => zlib.deflateRawSync(Buffer.from(u8), { level: 9 }).toString('base64');
export const unpack = (s) => new Uint8Array(zlib.inflateRawSync(Buffer.from(s, 'base64')));

/** Everything the comparison needs from one frame. crops: [{ name, x, y }] (top-left, 4K pixels). */
export function analyse(rgba, w, h, crops = []) {
  return {
    width: w, height: h,
    thumb: thumbnail(rgba, w, h),
    crops: crops.map((c) => ({ ...c, rgb: crop(rgba, w, c.x, c.y) })),
    ...extremes(rgba),
  };
}

/** NaN / Inf counts per float buffer (window.dk.debugCinematic()), without the other fields. */
export function bufferCounts(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(stats)) if (v && typeof v === 'object' && 'nan' in v) out[k] = { nan: v.nan | 0, inf: v.inf | 0 };
  return out;
}

/** The reference entry stored in pc/reference-image.json (with the reference frame's own NaN / Inf counts). */
export function toReference(a, bufferStats = null) {
  const buffers = bufferCounts(bufferStats);
  return {
    width: a.width, height: a.height,
    thumb: { w: THUMB_W, h: THUMB_H, rgb: pack(a.thumb) },
    crops: a.crops.map((c) => ({ name: c.name, x: c.x, y: c.y, w: CROP, h: CROP, rgb: pack(c.rgb) })),
    black: +a.black.toFixed(6), white: +a.white.toFixed(6),
    ...(buffers ? { buffers } : {}),
  };
}

// Limits (see compare): thumbnail PSNR/SSIM catch colour, exposure, missing/moved objects and black
// blocks; crops catch fine detail. Grain is drawn from a hash in the shader, so a different GPU may draw
// a different grain pattern. MEASURED on the cloud machine (2026-10-23, F2, native 4K): frame 48 against
// frame 49 - a new grain pattern plus one frame of motion - gives thumbnail 41.5 dB / SSIM 0.993 and 1:1
// crops 25.2 dB (Charcoal's head) and 30.5 dB (Remi). The limits sit below that, so a different grain
// pattern passes; a wrong texture, a missing object or broken shading falls far below them.
export const LIMITS = { thumbPsnr: 30, thumbSsim: 0.93, cropPsnr: 22, closeThumbPsnr: 25, closeThumbSsim: 0.85, extraBlack: 0.002, extraWhite: 0.002 };

/**
 * Compare a frame (analyse()) with a reference (toReference() form) and float-buffer stats.
 * Returns { verdict: 'SAME PICTURE' | 'SMALL DIFFERENCES' | 'DIFFERENT', reasons: [...], notes: [...], thumbPsnr, thumbSsim, crops: [{name, psnr}], black, white, buffers }
 */
export function compare(a, ref, bufferStats = null) {
  const reasons = [];
  const out = { reasons };
  const rt = unpack(ref.thumb.rgb);
  out.thumbPsnr = +psnr(a.thumb, rt).toFixed(2);
  out.thumbSsim = +ssim(a.thumb, rt, ref.thumb.w, ref.thumb.h).toFixed(4);
  out.crops = ref.crops.map((rc) => {
    const mine = a.crops.find((c) => c.name === rc.name);
    return { name: rc.name, x: rc.x, y: rc.y, psnr: mine ? +psnr(mine.rgb, unpack(rc.rgb)).toFixed(2) : null };
  });
  out.black = { now: a.black, ref: ref.black };
  out.white = { now: a.white, ref: ref.white };
  let level = 0;   // 0 same, 1 small differences, 2 different
  if (out.thumbPsnr < LIMITS.closeThumbPsnr || out.thumbSsim < LIMITS.closeThumbSsim) { level = 2; reasons.push(`the whole picture differs from the reference (PSNR ${out.thumbPsnr} dB, SSIM ${out.thumbSsim})`); }
  else if (out.thumbPsnr < LIMITS.thumbPsnr || out.thumbSsim < LIMITS.thumbSsim) { level = Math.max(level, 1); reasons.push(`the whole picture is a little different (PSNR ${out.thumbPsnr} dB, SSIM ${out.thumbSsim})`); }
  for (const c of out.crops) if (c.psnr != null && c.psnr < LIMITS.cropPsnr) { level = Math.max(level, 1); reasons.push(`fine detail differs in the 1:1 crop "${c.name}" (PSNR ${c.psnr} dB)`); }
  if (a.black > ref.black + LIMITS.extraBlack) { level = 2; reasons.push(`${(100 * a.black).toFixed(2)}% pure black pixels (reference ${(100 * ref.black).toFixed(2)}%): NaN in the float pipeline shows as black`); }
  if (a.white > ref.white + LIMITS.extraWhite) { level = 2; reasons.push(`${(100 * a.white).toFixed(2)}% pure white pixels (reference ${(100 * ref.white).toFixed(2)}%): infinity in the float pipeline shows as white`); }
  // NaN / Inf in the float buffers: measured against the reference frame's own counts. A buffer that is clean
  // on the cloud machine must be clean here (any NaN = DIFFERENT). A few scenes already hold some NaN on the
  // cloud machine (F5: 96 NaN in "scene", 2026-10-23, hidden by the post chain): there, only MORE than twice
  // the reference count is a difference of this GPU; the same count is a note (a scene fault, not the GPU).
  const notes = [];
  out.notes = notes;
  if (bufferStats) {
    out.buffers = {};
    for (const [k, v] of Object.entries(bufferStats)) {
      if (k === 'shaderErrors') { out.shaderErrors = v; if (v) { level = 2; reasons.push(`${v} shader program(s) failed to compile`); } continue; }
      if (!v || typeof v !== 'object') continue;
      out.buffers[k] = { nan: v.nan, inf: v.inf };
      const r = ref.buffers?.[k] || { nan: 0, inf: 0 };
      const over = (now, was) => (was ? now > 2 * was : now > 0);
      if (over(v.nan, r.nan) || over(v.inf, r.inf)) { level = 2; reasons.push(`float buffer "${k}" holds ${v.nan} NaN and ${v.inf} infinite values (the cloud frame: ${r.nan} NaN, ${r.inf} infinite)`); }
      else if (v.nan || v.inf) notes.push(`float buffer "${k}" holds ${v.nan} NaN / ${v.inf} infinite values; the cloud frame holds ${r.nan} / ${r.inf} too (a fault of the scene, not of this graphics card)`);
    }
  }
  out.verdict = ['SAME PICTURE', 'SMALL DIFFERENCES', 'DIFFERENT'][level];
  return out;
}
