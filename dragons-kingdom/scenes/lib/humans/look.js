// LOOK round 2 (2026-10-30): per-character skin look on top of the cache's material record (runtime
// only - no rebuild needed; the offline spec in offline/characters.py stays the source of the base
// look). Keys: freckles 0..1, underEye 0..1 (periorbital darkening), chromo 0..1.5 (blood / pigment
// variation), plus any skinMaterial option (flush, redness, rough...). Matched on the id prefix
// before '_' (abby_sling -> abby). PROVISIONAL until Daxtyn approves.
export const SKIN_LOOK = {
  // Abby is a CHILD: fine, clear skin, light sun freckles over the nose and cheeks, little under-eye
  abby: { freckles: 0.55, underEye: 0.3, chromo: 0.9 },
  // Remi, adult: outdoor rider - more blood / pigment variation, some under-eye
  remi: { freckles: 0.2, underEye: 0.55, chromo: 1.2 },
  // Alexandria, middle-aged, sleepless (the jug of wine by the window): darker under the eyes
  alexandria: { freckles: 0.0, underEye: 0.8, chromo: 1.1 },
};
const DEFAULT = { underEye: 0.5, chromo: 1.0 };
export function skinLook(id) {
  const base = String(id || '').split('_')[0];
  return { ...DEFAULT, ...(SKIN_LOOK[id] || SKIN_LOOK[base] || {}) };
}
