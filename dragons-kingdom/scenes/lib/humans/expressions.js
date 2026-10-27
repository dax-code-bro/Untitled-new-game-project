// Emotion layers for the face: weights of the CC0 MakeHuman face pose units (face.js) per emotion
// at full intensity. Blend any number of them: emotionUnits({ worry: 0.6, pain: 0.3 }).
// Units add as rotation vectors (face.js), so blends are order-free; the sum is softly limited.
//
// Each set is built from the action units a real face uses for that state (FACS):
//   calm      relaxed, lids a touch heavy
//   worry     inner brows up and drawn together (AU1+4), lips a little pressed, corners down
//   pain      brows lowered and knitted (AU4), orbit tightened / cheeks raised (AU6+7), nose wrinkle
//             (AU9), upper lip raised (AU10), lips stretched toward the neck (AU20)
//   fear      brows up and together (AU1+2+4), upper lids raised (AU5), lips stretched (AU20), jaw
//             dropped a little (AU26)
//   anger     brows lowered (AU4), lids tightened (AU7), upper lids raised (AU5), lips pressed (AU24)
//   grief     inner brows up (AU1), lids lowered, mouth corners down (AU15), chin raised (AU17)
//   amusement cheeks raised (AU6), lip corners pulled up (AU12), lower lids up
//   surprise  brows up (AU1+2), lids wide (AU5), jaw dropped (AU26)
//   tender    a small closed smile, soft lids, inner brows a hair up (looking at something loved)
//   contempt  one lip corner up and back (AU12+14 unilateral, R), lids a little lowered
//   determined brows down a little, lips pressed, jaw set
export const EMOTIONS = {
  calm: { LeftUpperLidClosed: 0.1, RightUpperLidClosed: 0.1 },
  worry: {
    LeftInnerBrowUp: 0.55, RightInnerBrowUp: 0.55, LeftBrowDown: 0.18, RightBrowDown: 0.18,
    MouthLeftPullDown: 0.18, MouthRightPullDown: 0.18, lowerLipUp: 0.1, LeftLowerLidUp: 0.1, RightLowerLidUp: 0.1,
  },
  pain: {
    LeftBrowDown: 0.55, RightBrowDown: 0.55, LeftInnerBrowUp: 0.35, RightInnerBrowUp: 0.35, NoseWrinkler: 0.3,
    LeftLowerLidUp: 0.55, RightLowerLidUp: 0.55, LeftUpperLidClosed: 0.28, RightUpperLidClosed: 0.28,
    LeftCheekUp: 0.35, RightCheekUp: 0.35, UpperLipUp: 0.3, MouthLeftPlatysma: 0.22, MouthRightPlatysma: 0.22,
    NasolabialDeepener: 0.3, JawOpen: 0.04,
  },
  fear: {
    LeftInnerBrowUp: 0.7, RightInnerBrowUp: 0.7, LeftOuterBrowUp: 0.45, RightOuterBrowUp: 0.45, LeftBrowDown: 0.12, RightBrowDown: 0.12,
    LeftUpperLidOpen: 0.65, RightUpperLidOpen: 0.65, MouthLeftPlatysma: 0.3, MouthRightPlatysma: 0.3,
    MouthLeftPullSide: 0.15, MouthRightPullSide: 0.15, JawOpen: 0.12,
  },
  anger: {
    LeftBrowDown: 0.8, RightBrowDown: 0.8, NoseWrinkler: 0.18, LeftLowerLidUp: 0.4, RightLowerLidUp: 0.4,
    LeftUpperLidOpen: 0.15, RightUpperLidOpen: 0.15, lowerLipUp: 0.22, UpperLipUp: 0.12, NasolabialDeepener: 0.15,
    MouthLeftPullDown: 0.1, MouthRightPullDown: 0.1,
  },
  grief: {
    LeftInnerBrowUp: 0.65, RightInnerBrowUp: 0.65, LeftBrowDown: 0.12, RightBrowDown: 0.12,
    LeftUpperLidClosed: 0.32, RightUpperLidClosed: 0.32, MouthLeftPullDown: 0.5, MouthRightPullDown: 0.5,
    lowerLipUp: 0.28, ChinDown: -0.08, LeftLowerLidUp: 0.12, RightLowerLidUp: 0.12,
  },
  amusement: {
    LeftCheekUp: 0.5, RightCheekUp: 0.5, MouthLeftPullUp: 0.42, MouthRightPullUp: 0.42, LeftLowerLidUp: 0.28,
    RightLowerLidUp: 0.28, NasolabialDeepener: 0.18, LeftOuterBrowUp: 0.05, RightOuterBrowUp: 0.05,
  },
  surprise: {
    LeftInnerBrowUp: 0.6, RightInnerBrowUp: 0.6, LeftOuterBrowUp: 0.7, RightOuterBrowUp: 0.7,
    LeftUpperLidOpen: 0.5, RightUpperLidOpen: 0.5, JawOpen: 0.18,
  },
  tender: {
    LeftCheekUp: 0.16, RightCheekUp: 0.16, MouthLeftPullUp: 0.2, MouthRightPullUp: 0.2,
    LeftUpperLidClosed: 0.16, RightUpperLidClosed: 0.16, LeftInnerBrowUp: 0.12, RightInnerBrowUp: 0.12, LeftLowerLidUp: 0.12, RightLowerLidUp: 0.12,
  },
  contempt: {
    MouthRightPullUp: 0.32, MouthRightPullSide: 0.2, RightCheekUp: 0.12, LeftUpperLidClosed: 0.18, RightUpperLidClosed: 0.2,
    LeftBrowDown: 0.1, RightBrowDown: 0.1,
  },
  determined: {
    LeftBrowDown: 0.35, RightBrowDown: 0.35, lowerLipUp: 0.18, LeftLowerLidUp: 0.2, RightLowerLidUp: 0.2, MouthLeftPullDown: 0.06, MouthRightPullDown: 0.06,
  },
};
export const EMOTION_NAMES = Object.keys(EMOTIONS);

// The mouth of an emotion on a character with the sculpted mouth shapes (mouthshapes.js: CC0
// MakeHuman expression targets): the real muscle shapes - zygomaticus smile (AU12), depressor corners
// down (AU15), levator upper lip (AU10), lips pressed thin (AU24), stretched (AU20) - on top of the
// bone units, whose corner pulls then give up a part (SHAPE_TRADE) so the sum does not overshoot.
export const EMOTION_SHAPES = {
  worry: { 'mouth-depression': 0.18, 'mouth-compression': 0.12 },
  pain: { 'mouth-elevation': 0.3, 'mouth-retraction': 0.25 },
  fear: { 'mouth-retraction': 0.35 },
  anger: { 'mouth-compression': 0.35, 'mouth-elevation': 0.12 },
  grief: { 'mouth-depression': 0.55, 'mouth-compression': 0.1 },
  amusement: { 'mouth-corner-puller': 0.45 },
  tender: { 'mouth-corner-puller': 0.22 },
  determined: { 'mouth-compression': 0.25 },
};
const SHAPE_TRADE = { MouthLeftPullUp: 0.7, MouthRightPullUp: 0.7, MouthLeftPullDown: 0.7, MouthRightPullDown: 0.7 };

/** Soft limit of a unit weight (sums of several emotions saturate instead of breaking the face). */
function soft(w) {
  const a = Math.abs(w);
  if (a <= 0.75) return w;
  return Math.sign(w) * (0.75 + (1 - Math.exp(-(a - 0.75) / 0.45)) * 0.45);
}

/**
 * Face-unit weights for an emotion mix { name: 0..1 }. opts: { asym (-0.3..0.3: + = the character's
 * LEFT side stronger), out (object to add into), gain (1), shapes (the character has the sculpted
 * mouth shapes: EMOTION_SHAPES join in) }.
 */
export function emotionUnits(mix, opts = {}) {
  const o = {};
  const g = opts.gain ?? 1;
  for (const [name, w] of Object.entries(mix || {})) {
    const e = EMOTIONS[name];
    if (!e || !w) continue;
    for (const u in e) o[u] = (o[u] || 0) + e[u] * w * g * (opts.shapes ? SHAPE_TRADE[u] ?? 1 : 1);
    if (opts.shapes) for (const u in EMOTION_SHAPES[name] || {}) o[u] = (o[u] || 0) + EMOTION_SHAPES[name][u] * w * g;
  }
  const as = opts.asym || 0;
  const out = opts.out || {};
  for (const u in o) {
    let w = soft(o[u]);
    if (as) w *= u.startsWith('Left') ? 1 + as : u.startsWith('Right') ? 1 - as : 1;
    out[u] = (out[u] || 0) + w;
  }
  return out;
}

// ------------------------------------------------- delivery notes -> emotion --
// Keyword rules for the director's delivery notes (dialogue.json `delivery`). Every pattern is a
// whole word or word stem (\b...): "reaching" must not read as "aching", "saddle" not as "sad",
// "scold" not as "cold". Negated phrases ("not a boast", "no anger") are dropped first.
const RULES = [
  [/\b(calm|controlled|steady|economical|practical|plain|restrained|level|even|measured|matter-of-fact|composed)\b/, { calm: 0.55 }],
  [/\b(gentle|gently|soft|softly|warm|tender|kind|careful|soothing|comforting|reassur\w*)\b/, { tender: 0.45, calm: 0.25 }],
  [/\b(quiet|quietly|hushed|whisper\w*|low)\b/, { calm: 0.3 }],
  [/\b(casual|easy|easygoing|light|good-humou?red|cheerful|friendly)\b/, { calm: 0.25, amusement: 0.3 }],
  [/\b(worr\w*|anxious|nervous|uneasy|concern\w*|tense|unsure|hesitant|doubt\w*|urgent|urgency|breathless|frighten\w*|alarm\w*|insistent|pleading)\b/, { worry: 0.6 }],
  [/\b(pain|painful|hurt|hurting|winc\w*|injur\w*|gasp\w*|aching|agony|sore)\b/, { pain: 0.7 }],
  [/\b(fear|afraid|terrified|terror|scared|panic\w*|horror|horrified|scream\w*|shaking|trembl\w*)\b/, { fear: 0.8 }],
  [/\b(angry|anger|furious|fury|rage|snap\w*|bitter|fierce|curs\w*|swear\w*|cold|hard|sharp|sharper|clipped|scold\w*|hiss\w*)\b/, { anger: 0.5 }],
  [/\b(shout\w*|command\w*|order\w*|bark\w*|yell\w*|raised)\b/, { anger: 0.2, determined: 0.3 }],
  [/\b(grie\w*|sorrow\w*|sad|sadly|mourn\w*|tears|crying|weep\w*|despair\w*|numb|loss|broken|heavy|hollow)\b/, { grief: 0.65 }],
  [/\b(resign\w*|tired|weary|defeated|exhausted)\b/, { grief: 0.35, calm: 0.15 }],
  [/\b(teas\w*|dry|amus\w*|jok\w*|laugh\w*|grin\w*|wry|smil\w*|playful|delight\w*|cheek\w*|fond|fondly|banter|proud)\b/, { amusement: 0.55 }],
  [/\b(relie[fv]\w*)\b/, { calm: 0.3, amusement: 0.2 }],
  [/\b(amaz\w*|wonder\w*|awe|astonish\w*|surpris\w*|stunned|disbelief|eager\w*)\b/, { surprise: 0.55 }],
  [/\b(firm|firmly|determined|resolute|set|stern)\b/, { determined: 0.45 }],
  [/\b(contempt\w*|scorn\w*|sneer\w*|mock\w*|dismissive)\b/, { contempt: 0.55 }],
];
const PRESET = {
  pain: { pain: 0.75 }, hurt: { pain: 0.45 }, shout: { determined: 0.3, anger: 0.15 }, urgent: { worry: 0.4 },
  breathless: { worry: 0.3 }, whisper: { calm: 0.25 }, quiet: { calm: 0.3 }, firm: { determined: 0.35 },
  command: { determined: 0.4, anger: 0.1 }, resigned: { grief: 0.35 }, low: { calm: 0.2, worry: 0.1 },
};

/** Emotion mix from a delivery note (+ the take's performance preset). Weights 0..1. */
export function emotionFromDelivery(delivery, preset) {
  let txt = String(delivery || '').toLowerCase();
  // drop negated phrases: "not a boast", "no anger", "never cruel", "without fear"
  txt = txt.replace(/\b(not|no|never|without|nothing)\b( (a|an|the|any|quite|too))? [a-z-]+/g, ' ');
  const e = {};
  for (const [rx, w] of RULES) if (rx.test(txt)) for (const k in w) e[k] = (e[k] || 0) + w[k];
  for (const k in PRESET[preset] || {}) e[k] = (e[k] || 0) + PRESET[preset][k];
  const out = {};
  for (const k of Object.keys(e).sort()) if (e[k] > 0.01) out[k] = Math.round(Math.min(1, e[k]) * 100) / 100;
  return out;
}
