// Physical camera model + deterministic camera shake (import from 'dk/camera.js').
//
// A real cinema camera is described by its sensor, the lens' focal length,
// the aperture (f-stop), where it is focused, the shutter angle and the ISO.
// The runtime reads ctx.lens every frame (scenes set it in update(t)):
//
//   ctx.lens.focalLength = 35;          // mm  -> field of view (with the sensor width)
//   ctx.lens.sensor = 'super35';        // 'super35' | 'fullframe' | 'alexa65' | width in mm
//   ctx.lens.fstop = 2.8;               // aperture -> depth of field
//   ctx.lens.focus = 12;                // metres from the camera (or focusTarget below)
//   ctx.lens.focusTarget = dragon.head; // optional Object3D / Vector3: a "focus puller" that follows it
//   ctx.lens.shutterAngle = 180;        // degrees -> motion blur length (180 = 1/48 s at 24 fps)
//   ctx.lens.iso = 800;                 // exposure + sensor noise level
//   ctx.lens.exposureComp = 0;          // stops (+1 = twice as bright)
//   ctx.lens.nd = 'auto';               // 'auto': ND filters keep exposure constant when f-stop /
//                                       // shutter change (what a camera crew does); a number = stops
//                                       // of ND, and then f-stop and shutter change exposure physically
//
// Everything here is plain math (no state) so it is a pure function of its inputs.

/** Sensor sizes (mm) of the 16:9 area used for a 3840x2160 delivery. */
export const SENSORS = {
  // Super 35 (ARRI ALEXA 35 4K 16:9 is 24.88 x 14.00 mm; classic S35 film 24.89 mm wide)
  super35: { width: 24.89, height: 14.0 },
  // full frame / VistaVision (Sony VENICE, ALEXA LF 16:9 area ~ 36 x 20.25)
  fullframe: { width: 36.0, height: 20.25 },
  // ALEXA 65 16:9 crop
  alexa65: { width: 54.12, height: 30.44 },
};

export function sensorSize(sensor, aspect = 16 / 9) {
  if (typeof sensor === 'number') return { width: sensor, height: sensor / aspect };
  const s = SENSORS[sensor || 'super35'];
  if (!s) throw new Error(`unknown sensor "${sensor}" (use ${Object.keys(SENSORS).join(', ')} or a width in mm)`);
  // the delivered frame is cut from the sensor at the output aspect, full width
  return { width: s.width, height: s.width / aspect };
}

/** Vertical field of view (degrees) of a lens of focal length f (mm) on a sensor. */
export function fovFromFocalLength(f, sensor = 'super35', aspect = 16 / 9) {
  const { height } = sensorSize(sensor, aspect);
  return (2 * Math.atan(height / (2 * f)) * 180) / Math.PI;
}

/** Focal length (mm) that gives this vertical field of view (degrees). */
export function focalLengthFromFov(fovDeg, sensor = 'super35', aspect = 16 / 9) {
  const { height } = sensorSize(sensor, aspect);
  return height / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * Thin-lens circle of confusion. Returns K (pixels) such that the CoC
 * DIAMETER of a point at distance d (metres) is  coc(d) = K * (1 - focus / d)
 * (negative = in front of the focus plane). K is the blur of a point at infinity.
 *   A = f / N (aperture diameter), c = A * f / (S - f) * |d - S| / d  (on the sensor, mm)
 */
export function cocScale({ focalLength, fstop, focus, sensorWidth, imageWidth }) {
  const f = focalLength, S = Math.max(focus * 1000, f * 1.001);   // mm, focus beyond the lens
  const A = f / fstop;
  const cMm = (A * f) / (S - f);
  return (cMm / sensorWidth) * imageWidth;
}

/** Hyperfocal distance (m) for a CoC limit of cPx pixels at imageWidth. */
export function hyperfocal({ focalLength, fstop, sensorWidth, imageWidth, cPx = 1.5 }) {
  const c = (cPx / imageWidth) * sensorWidth;     // mm on the sensor
  return ((focalLength * focalLength) / (fstop * c) + focalLength) / 1000;
}

/**
 * Exposure multiplier of the physical camera relative to the reference
 * (ISO 800, T2.8, 180 degree shutter). nd 'auto' keeps exposure independent of
 * f-stop and shutter (the crew adds ND filters); a number of ND stops makes
 * the f-stop and shutter act on exposure exactly like on a real camera.
 */
export function exposureMultiplier({ iso = 800, fstop = 2.8, shutterAngle = 180, exposureComp = 0, nd = 'auto' } = {}) {
  let e = Math.pow(2, exposureComp) * (iso / 800);
  if (nd !== 'auto') e *= Math.pow(2.8 / fstop, 2) * (shutterAngle / 180) * Math.pow(2, -nd);
  return e;
}

/** Shutter open time in seconds. */
export const exposureTime = (shutterAngle, fps) => (shutterAngle / 360) / fps;

export const LENS_DEFAULTS = Object.freeze({
  focalLength: null,      // null: keep the camera's own fov (the focal length is derived from it)
  sensor: 'super35',
  fstop: 4,
  focus: null,            // metres; null and no focusTarget -> no depth of field
  focusTarget: null,
  shutterAngle: 180,
  iso: 800,
  exposureComp: 0,
  nd: 'auto',
});

// ------------------------------------------------------------ camera shake
// Deterministic, smooth noise: a sum of sinusoids with "random" but FIXED
// frequencies and phases derived from the seed only. A pure function of t -
// rendering frame 5000 does not depend on any other frame.
function hash32(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth 1-D noise in about [-1, 1] with energy around freq Hz (sum of 5 incommensurate sines). */
export function smoothNoise1(t, freq, seed, channel = 0) {
  let s = 0, n = 0;
  for (let i = 0; i < 5; i++) {
    const f = freq * (0.55 + 0.9 * hash32(seed * 977 + channel * 131 + i, 1)) * (1 + i * 0.37);
    const ph = 6.283185307 * hash32(seed * 977 + channel * 131 + i, 2);
    const a = 1 / (1 + i * 0.8);
    s += a * Math.sin(6.283185307 * f * t + ph); n += a * a;
  }
  return s / Math.sqrt(2 * n) * 1.41;
}

// amplitudes: rotations in degrees, translations in metres; freq in Hz
export const SHAKE_PRESETS = {
  // operator holding the camera: slow body sway + breathing, a little micro jitter
  handheld: { rot: [0.35, 0.28, 0.22], rotFreq: 0.45, pos: [0.012, 0.010, 0.008], posFreq: 0.35, jitter: 0.03, jitterFreq: 6, breathe: 0.08 },
  // camera on a horse / cart / boat deck: rhythmic bumps + roll
  vehicle: { rot: [0.5, 0.35, 0.6], rotFreq: 0.9, pos: [0.02, 0.05, 0.02], posFreq: 2.2, jitter: 0.08, jitterFreq: 9, breathe: 0 },
  // camera rig on a flying dragon: wing-beat bob (set wingbeatHz) + turbulence
  dragonback: { rot: [0.7, 0.5, 0.9], rotFreq: 0.35, pos: [0.05, 0.25, 0.05], posFreq: 0.3, jitter: 0.12, jitterFreq: 7, breathe: 0, wingbeatHz: 1.1, wingbeat: 0.18 },
  // wind buffeting a tripod / crane on a cliff top: small, fast, gusty
  wind: { rot: [0.08, 0.06, 0.05], rotFreq: 1.6, pos: [0.002, 0.002, 0.002], posFreq: 1.2, jitter: 0.02, jitterFreq: 11, breathe: 0, gusts: 0.12 },
  // slow aerial drift (helicopter / drone feel)
  aerial: { rot: [0.25, 0.2, 0.35], rotFreq: 0.15, pos: [0.3, 0.2, 0.3], posFreq: 0.12, jitter: 0.015, jitterFreq: 5, breathe: 0 },
};

/**
 * Camera shake at time t. Returns { pitch, yaw, roll } (radians) and
 * { x, y, z } (metres, camera-local: x right, y up, z back).
 *   opts = { kind: 'handheld'|'vehicle'|'dragonback'|'wind'|'aerial', amount: 1, seed: 1, ...preset overrides }
 */
export function cameraShake(t, opts = {}) {
  const p = { ...(SHAKE_PRESETS[opts.kind || 'handheld'] || SHAKE_PRESETS.handheld), ...opts };
  const k = opts.amount ?? 1, seed = (opts.seed ?? 1) | 0;
  const D = Math.PI / 180;
  const n = (ch, f) => smoothNoise1(t, f, seed, ch);
  // gusts: slow envelope that makes the wind shake come and go
  const gust = p.gusts ? 1 + p.gusts * 6 * Math.max(0, n(20, 0.08)) : 1;
  let pitch = p.rot[0] * n(0, p.rotFreq) + p.jitter * n(3, p.jitterFreq);
  let yaw = p.rot[1] * n(1, p.rotFreq * 0.9) + p.jitter * n(4, p.jitterFreq * 1.1);
  let roll = p.rot[2] * n(2, p.rotFreq * 0.7) + p.jitter * 0.5 * n(5, p.jitterFreq * 0.9);
  let x = p.pos[0] * n(6, p.posFreq), y = p.pos[1] * n(7, p.posFreq * 1.2), z = p.pos[2] * n(8, p.posFreq * 0.8);
  if (p.breathe) { const b = Math.sin(6.283185307 * 0.26 * t + 1.3); pitch += p.breathe * b; y += 0.004 * b; }
  if (p.wingbeat) {
    const hz = p.wingbeatHz || 1;
    const ph = 6.283185307 * hz * t;
    // a wing beat lifts the body sharply on the down-stroke and sinks it slowly (not a pure sine)
    const lift = Math.sin(ph) + 0.35 * Math.sin(2 * ph + 0.8);
    y += p.wingbeat * lift; pitch += p.wingbeat * 1.5 * Math.cos(ph + 0.4); roll += p.wingbeat * 0.6 * Math.sin(ph * 0.5 + 2);
  }
  return { pitch: pitch * D * k * gust, yaw: yaw * D * k * gust, roll: roll * D * k * gust, x: x * k * gust, y: y * k * gust, z: z * k * gust };
}

/**
 * Apply cameraShake(t, opts) to a camera that is already positioned/aimed for
 * time t (call after camera.lookAt). Rotations and offsets are in the
 * camera's own frame, like a real operator's movement.
 */
export function applyShake(camera, t, opts = {}) {
  const s = cameraShake(t, opts);
  camera.translateX(s.x); camera.translateY(s.y); camera.translateZ(s.z);
  camera.rotateY(s.yaw); camera.rotateX(s.pitch); camera.rotateZ(s.roll);
  camera.updateMatrixWorld();
  return s;
}
