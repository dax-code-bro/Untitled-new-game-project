/* ============================================================
   UNITS — one place where the game agrees with reality.

   Every system below stores SI internally and converts only at
   the edges. That is not fussiness: the moment hydration is in
   litres in one file and millilitres in another, a survival game
   silently becomes a fantasy game, and the bug looks like
   "balance" rather than like a bug.
   ============================================================ */

const UNIT = {
  /* mass */
  GRAIN_KG: 6.479891e-5,        // exact, by definition of the grain
  LB_KG: 0.45359237,            // exact
  OZ_KG: 0.028349523125,

  /* length */
  INCH_M: 0.0254,               // exact
  FOOT_M: 0.3048,
  YARD_M: 0.9144,
  MILE_M: 1609.344,

  /* energy */
  KCAL_J: 4184,                 // thermochemical kilocalorie
  FTLB_J: 1.3558179483314004,

  /* volume */
  FLOZ_US_L: 0.0295735295625,
  GAL_US_L: 3.785411784,

  /* environment, ICAO standard sea level */
  AIR_DENSITY: 1.225,           // kg/m^3
  SPEED_OF_SOUND: 340.29,       // m/s at 15 C
  GRAVITY: 9.80665,             // m/s^2, standard
  WATER_DENSITY: 998.2,         // kg/m^3 at 20 C
};

const grainsToKg = (gr) => gr * UNIT.GRAIN_KG;
const kgToGrains = (kg) => kg / UNIT.GRAIN_KG;
const fpsToMs = (fps) => fps * UNIT.FOOT_M;
const msToFps = (ms) => ms / UNIT.FOOT_M;
const inchesToM = (i) => i * UNIT.INCH_M;
const yardsToM = (y) => y * UNIT.YARD_M;
const joulesToFtLb = (j) => j / UNIT.FTLB_J;
const ftLbToJoules = (f) => f * UNIT.FTLB_J;
const kcalToJoules = (k) => k * UNIT.KCAL_J;
const joulesToKcal = (j) => j / UNIT.KCAL_J;
const cToF = (c) => c * 9 / 5 + 32;
const fToC = (f) => (f - 32) * 5 / 9;

/* Speed of sound varies with temperature, and a rifle bullet crossing
   Mach 1 behaves differently on a -10 C morning than a 35 C afternoon.
   Cheap to get right, so get it right. */
function speedOfSound(celsius = 15) {
  return 331.3 * Math.sqrt(1 + celsius / 273.15);
}

/* Air density from the ideal gas law with humidity. Denser air means more
   drag, which means more drop — the reason a zero checked in winter shoots
   high in summer. */
function airDensity(celsius = 15, pressurePa = 101325, relativeHumidity = 0) {
  const T = celsius + 273.15;
  // Tetens saturation vapour pressure, good to a fraction of a percent
  // across every temperature this game will ever see.
  const psat = 610.78 * Math.exp((17.27 * celsius) / (celsius + 237.3));
  const pv = relativeHumidity * psat;
  const pd = pressurePa - pv;
  return pd / (287.058 * T) + pv / (461.495 * T);
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clampTo = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerpN = (a, b, t) => a + (b - a) * t;
/* Smooth 0→1 ramp across [edge0, edge1]. Physiology is full of thresholds
   that are not cliffs — thirst does not switch on at exactly 2.0% loss — and
   this is how those get expressed without magic step functions. */
function ramp(x, edge0, edge1) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  return clamp01((x - edge0) / (edge1 - edge0));
}
