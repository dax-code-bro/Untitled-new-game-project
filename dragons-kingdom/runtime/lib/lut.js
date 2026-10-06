// .cube 3D LUT support (Adobe/Resolve "Cube LUT Specification 1.0").
//
//   import { loadCubeLUT } from 'dk/lut.js';
//   ctx.cinematic.grade.lut = await loadCubeLUT(new URL('./looks/teal-orange.cube', import.meta.url).href);
//
// Or just give the runtime a URL / path: meta.cinematic.grade.lut = './looks/x.cube'
// (relative to the scene file); it is fetched during setup (and fingerprinted).
//
// A LUT maps an input colour to an output colour. Where it applies is set by
// grade.lutSpace:
//   'display' (default) - after tone mapping, on the sRGB-encoded display picture
//                         (a "look" LUT exported from Resolve for a Rec.709/sRGB timeline)
//   'logc3'             - the LUT receives scene-linear light encoded as ARRI LogC3 (EI 800)
//                         and outputs display sRGB/Rec.709: it REPLACES the tone mapper
//                         (e.g. a camera "LogC to Rec709" or show LUT)
//   'acescct'           - like logc3 but the input is ACEScct-encoded (AP1 primaries)
// 1D LUTs (LUT_1D_SIZE) are converted to an equivalent 3D LUT.

/** Parse the text of a .cube file. Returns { title, size, domainMin, domainMax, data: Float32Array(size^3*4) } (red fastest). */
export function parseCube(text, name = 'LUT') {
  let title = name, size3 = 0, size1 = 0;
  let dmin = [0, 0, 0], dmax = [1, 1, 1];
  const vals = [];
  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === 'TITLE') { title = line.slice(5).trim().replace(/^"|"$/g, ''); continue; }
    if (key === 'LUT_3D_SIZE') { size3 = parseInt(parts[1], 10); continue; }
    if (key === 'LUT_1D_SIZE') { size1 = parseInt(parts[1], 10); continue; }
    if (key === 'DOMAIN_MIN') { dmin = parts.slice(1, 4).map(Number); continue; }
    if (key === 'DOMAIN_MAX') { dmax = parts.slice(1, 4).map(Number); continue; }
    if (key === 'LUT_1D_INPUT_RANGE' || key === 'LUT_3D_INPUT_RANGE') { const a = +parts[1], b = +parts[2]; dmin = [a, a, a]; dmax = [b, b, b]; continue; }
    if (/^[A-Z_]+$/.test(key)) continue;    // unknown keyword (LUT_IN_VIDEO_RANGE...)
    if (parts.length < 3) throw new Error(`${name}: line ${ln + 1}: expected 3 numbers, got "${line}"`);
    const r = +parts[0], g = +parts[1], b = +parts[2];
    if (![r, g, b].every(Number.isFinite)) throw new Error(`${name}: line ${ln + 1}: not a number in "${line}"`);
    vals.push(r, g, b);
  }
  if (!size3 && !size1) throw new Error(`${name}: no LUT_3D_SIZE / LUT_1D_SIZE`);
  if (size3) {
    if (size3 < 2 || size3 > 256) throw new Error(`${name}: LUT_3D_SIZE ${size3} out of range`);
    if (vals.length !== size3 ** 3 * 3) throw new Error(`${name}: expected ${size3 ** 3} entries, found ${vals.length / 3}`);
    const data = new Float32Array(size3 ** 3 * 4);
    for (let i = 0; i < size3 ** 3; i++) { data[4 * i] = vals[3 * i]; data[4 * i + 1] = vals[3 * i + 1]; data[4 * i + 2] = vals[3 * i + 2]; data[4 * i + 3] = 1; }
    return { title, size: size3, domainMin: dmin, domainMax: dmax, data };
  }
  // 1D -> 3D (33^3)
  if (vals.length !== size1 * 3) throw new Error(`${name}: expected ${size1} 1D entries, found ${vals.length / 3}`);
  const N = 33, data = new Float32Array(N ** 3 * 4);
  const lerp1 = (x, ch) => {
    const p = Math.min(Math.max(x, 0), 1) * (size1 - 1), i = Math.min(Math.floor(p), size1 - 2), f = p - i;
    return vals[3 * i + ch] * (1 - f) + vals[3 * (i + 1) + ch] * f;
  };
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = 4 * (r + N * (g + N * b));
    data[o] = lerp1(r / (N - 1), 0); data[o + 1] = lerp1(g / (N - 1), 1); data[o + 2] = lerp1(b / (N - 1), 2); data[o + 3] = 1;
  }
  return { title, size: N, domainMin: dmin, domainMax: dmax, data };
}

/** Build a filterable 3D texture from a parsed LUT. */
export function makeLutTexture(THREE, lut) {
  const t = new THREE.Data3DTexture(lut.data, lut.size, lut.size, lut.size);
  t.format = THREE.RGBAFormat;
  t.type = THREE.FloatType;           // OES_texture_float_linear: available on SwiftShader and desktop GPUs
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  t.userData.dkLut = { size: lut.size, domainMin: lut.domainMin, domainMax: lut.domainMax, title: lut.title };
  return t;
}

/** fetch + parse a .cube file (the runtime waits for it like any other asset). */
export async function loadCubeLUT(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`LUT ${url}: HTTP ${r.status}`);
  return parseCube(await r.text(), String(url).split('/').pop());
}

/** Write a LUT as .cube text (used by the tests and to export the built-in looks). */
export function writeCube(size, fn, title = 'Dragons Kingdom LUT') {
  const out = [`TITLE "${title}"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const [R, G, B] = fn(r / (size - 1), g / (size - 1), b / (size - 1));
    out.push(`${R.toFixed(6)} ${G.toFixed(6)} ${B.toFixed(6)}`);
  }
  return out.join('\n') + '\n';
}
