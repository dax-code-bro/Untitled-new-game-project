// Shot director - mergeSpecs(auto, touch) (pure JS: Node and browser). Engine phase 4 (engine/DESIGN.md 3.7):
// <set>.spec.js = mergeSpecs(<set>.auto.js, <set>.touch.js). The touch overlay is { '<shot>': {...partial} } deep-merged
// over the generated entry (plain objects merge, arrays and values replace, null deletes), or { '<shot>': { lock: true,
// ...whole } } which replaces it. `touch.defaults` / `touch.cast` / `touch.reviewOk` merge the same way.
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(a, b) {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === null) delete out[k];
    else out[k] = isObj(v) && isObj(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}
const SPEC_KEYS = new Set(['set', 'shots', 'defaults', 'cast', 'reviewOk', 'previs', 'splits', 'homes']);
export function mergeSpecs(auto = {}, touch = {}) {
  const out = { ...auto, shots: { ...(auto.shots || {}) } };
  for (const k of ['defaults', 'cast', 'reviewOk', 'previs', 'splits']) if (touch[k]) out[k] = deepMerge(auto[k] || {}, touch[k]);
  // the shots: touch.shots, or (DESIGN 3.7's short form) every other top-level key that is not a spec key
  const shots = touch.shots || Object.fromEntries(Object.entries(touch).filter(([k]) => !SPEC_KEYS.has(k)));
  for (const [id, t] of Object.entries(shots)) {
    if (t === null) { delete out.shots[id]; continue; }
    if (t.lock) { const { lock, ...whole } = t; out.shots[id] = whole; continue; }
    out.shots[id] = deepMerge(out.shots[id] || {}, t);
  }
  return out;
}
