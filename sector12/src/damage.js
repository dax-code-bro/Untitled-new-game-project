// Shared hit model for humanoids (player + AI operators): hit zones, armor levels, bleeding, fractures.
import { AMMO, armorMultiplier } from './data/catalog.js';

export const ZONES = {
  head: { mul: 2.2, armor: 'helmet', name: 'Head' },
  torso: { mul: 1, armor: 'vest', name: 'Torso' },
  arm: { mul: 0.6, armor: null, name: 'Arm', limb: true },
  leg: { mul: 0.7, armor: null, name: 'Leg', limb: true },
};

// Zone from the hit height relative to the body (0 = feet) and lateral offset from the body axis.
export function zoneFromHit(relY, lateral, height = 1.8) {
  const k = relY / height;
  if (k > 0.83) return 'head';
  if (k < 0.5) return 'leg';
  if (lateral > 0.2) return 'arm';
  return 'torso';
}

export function randomZone() {
  const r = Math.random();
  return r < 0.1 ? 'head' : r < 0.65 ? 'torso' : r < 0.8 ? 'arm' : 'leg';
}

// target: { hp, vest: {level, dur}|null, helmet: {level, dur}|null, status }
// hit: { dmg, pen, ammo, zone, explosive, shot (pellet) }
// Returns { dealt, armorHit, zone, killed }
export function applyHit(target, hit) {
  const Z = ZONES[hit.zone] || ZONES.torso;
  let dmg = hit.dmg * Z.mul;
  let armorHit = false;
  const plate = Z.armor ? target[Z.armor] : null;
  if (plate && plate.level > 0 && plate.dur > 0 && !hit.blast) {
    const m = armorMultiplier(hit.pen, plate.level);
    dmg *= m;
    plate.dur -= hit.dmg * (m < 0.5 ? 0.35 : 0.2);
    if (plate.dur <= 0) { plate.dur = 0; target.armorBroke = Z.armor; }
    armorHit = m < 0.85;
  }
  target.hp -= dmg;
  const st = target.status;
  if (st && dmg > 2) {
    const A = AMMO[hit.ammo] || { bleed: 0.3 };
    const heavyChance = (Z.limb ? 0.18 : 0.1) + (hit.pen >= 6 ? 0.1 : 0) + (dmg > 40 ? 0.15 : 0);
    if (Math.random() < heavyChance) { st.bleedHeavy++; if (Z.limb) st.heavyLimb = true; }
    else if (Math.random() < A.bleed + (armorHit ? -0.2 : 0)) st.bleedLight++;
    if (hit.zone === 'leg' && dmg > 18 && Math.random() < 0.3) st.fracture = true;
    if (hit.shot || hit.explosive) st.fragments = Math.min(5, st.fragments + 1);
    st.pain = Math.max(st.pain, Math.min(20, dmg * 0.3));
  }
  return { dealt: dmg, armorHit, zone: hit.zone, killed: target.hp <= 0 };
}

export function newStatus() {
  return { bleedLight: 0, bleedHeavy: 0, heavyLimb: false, fracture: false, fragments: 0, pain: 0, adrenaline: 0, numb: 0, warm: 0 };
}

// HP lost per second from status effects.
export function statusDrain(st) {
  return st.bleedLight * 0.6 + st.bleedHeavy * 2.2 + st.fragments * 0.15;
}
