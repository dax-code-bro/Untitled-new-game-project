// Shot director - pure measurements for the realism audits (no three.js: unit-testable in Node).
//
// faceReadability: how readable a face is to the lens. Until approved faces and lip-sync exist
// (shotlist realism_strategy), a SPEAKING face must be soft, turned (profile or further), small or
// backlit; stage.js measures every speaking actor per frame and reports the shots that break it.

export const SENSOR_HEIGHT_MM = { super35: 14.0, fullframe: 20.25, alexa65: 30.44 };
export const FACE_LIMITS = { angleDeg: 70, faceFrac: 0.06, blurFrac: 0.006 };

/**
 * fwd: the face's forward unit vector (head bone -> mid-eyes), toCam: unit vector from the eyes to the
 * camera, dist: eyes-to-camera metres, lens: { focalLength (mm), fstop, focus (m), sensor }.
 * Returns { angle (deg between face and lens), faceFrac (face height / frame height), blurFrac
 * (circle of confusion / frame height), readable (all three limits broken) }.
 */
export function faceReadability(fwd, toCam, dist, lens = {}, limits = FACE_LIMITS) {
  const dot = fwd[0] * toCam[0] + fwd[1] * toCam[1] + fwd[2] * toCam[2];
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  const f = lens.focalLength || 35, N = lens.fstop || 2.8;
  const S = (lens.focus || dist) * 1000, d = Math.max(1, dist * 1000);
  const sensorH = typeof lens.sensor === 'number' ? (lens.sensor * 9) / 16 : (SENSOR_HEIGHT_MM[lens.sensor || 'super35'] ?? 14.0);
  const faceFrac = (240 * f) / d / sensorH;                                   // a face ~24 cm chin to crown
  const blurFrac = ((f * f) / (N * Math.max(1, S - f))) * (Math.abs(d - S) / d) / sensorH;
  const readable = angle < limits.angleDeg && faceFrac > limits.faceFrac && blurFrac < limits.blurFrac;
  return { angle, faceFrac, blurFrac, readable };
}
