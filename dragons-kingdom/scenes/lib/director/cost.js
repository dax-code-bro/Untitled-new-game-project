// Shot director - RENDER COST ESTIMATES per shot (pure JS: browser AND Node).
//
// Every number here is either MEASURED on this cloud machine (4 vCPU Xeon 2.1 GHz, no GPU,
// SwiftShader) and says so, or derived from measured numbers and says ESTIMATE.
//
// Model: seconds per frame (s/f) of a shot = the set's base s/f (measured at draft with the
// set's own look, steady state) x modifiers for what is in the shot (people, creatures, effects,
// depth of field, a moving camera that defeats nothing but costs motion blur) x the size factor
// for the output (4K / draft). The size factor is MEASURED on style frames rendered both ways:
// F1 (sea) draft velocity ~1.7 s/f vs 4K velocity 12.7 s/f; F4 (chamber) draft velocity 10 s/f
// (2026-10-23, this machine) vs 4K 8-sub-frame 202 s/f (/8 ~ 25 s per sub-frame). The geometry
// share (vertex work, shadow passes) does not shrink with the picture, so heavy-geometry sets
// scale less than 16x.
// GPU: when a gpu-check result exists (output/gpu-check/gpu-check.json `estimate.ratio`), the
// 4K figures are divided by it; otherwise only the CPU figures are given.

/** Base cost per set at the draft preset (960x540), velocity motion blur, s per frame (steady state). */
export const SET_BASE = {
  SEA_COAST_DAWN: { draft: 1.7, k4: 12.7, basis: 'MEASURED: F1 draft ~1.7 s/f (velocity, 2026-10-23), 4K 12.7 s/f (README)' },
  PROLOGUE_VISTAS: { draft: 1.5, k4: 13, basis: 'ESTIMATE: F1-class (sea, haze, distant land)' },
  VERDOR_GROUNDS: { draft: 3.0, k4: 35, basis: 'ESTIMATE: F2 meadow without the heavy dragons (F2 4K velocity 50.7 s MEASURED)' },
  BIRTHING_CHAMBER: { draft: 3.5, k4: 40, basis: 'ESTIMATE until the set is measured (F4 style frame: draft 10 s/f MEASURED with its 4096 sun map, lamp shadow cube and 96-tap DOF every frame)' },
  PALACE_CORRIDOR: { draft: 2.0, k4: 25, basis: 'ESTIMATE: masonry interior, 1-3 people' },
  ALEXANDRIA_ROOM: { draft: 2.0, k4: 25, basis: 'ESTIMATE: masonry interior, 1-2 people, sea through the window' },
  CARD_BLACK: { draft: 0, k4: 0, basis: 'no 3D render' },
};

/** Multipliers from what a shot spec puts in frame. */
export function shotFactors(spec = {}) {
  const cast = Object.entries(spec.cast || {});
  let people = 0, creatures = 0, walkers = 0;
  for (const [, c] of cast) {
    if (c.visible === false) continue;
    if (c.kind === 'creature' || c.creature) creatures++;
    else people++;
    if ((c.acts || []).some((a) => /walk|run|hurry/.test(a[1]))) walkers++;
  }
  const fx = (spec.fx || []).length;
  const cam = spec.cam || {};
  const moving = !!(cam.push || cam.follow || cam.orbit || (Array.isArray(cam.pos) && Array.isArray(cam.pos[0])) || /dolly|track|crane|drone|follow|pan|tilt|handheld|boat/.test(cam.rig || ''));
  const f = { people: 1 + 0.12 * people, creatures: 1 + 0.25 * creatures, fx: 1 + 0.05 * fx, walk: 1 + 0.03 * walkers, move: moving ? 1.08 : 1 };
  f.total = f.people * f.creatures * f.fx * f.walk * f.move;
  return f;
}

/**
 * Estimate one shot: { draft_s_per_frame, k4_cpu_s_per_frame, k4_gpu_s_per_frame|null,
 * draft_minutes, k4_cpu_hours, k4_gpu_hours|null, basis }. measured: optional { draft_s_per_frame }
 * from a real draft render of this shot (cut/timings.json) - it replaces the model.
 */
export function estimateShot(setId, frames, spec, opts = {}) {
  const base = SET_BASE[setId] || { draft: 3, k4: 40, basis: 'ESTIMATE: unknown set, generic' };
  const f = shotFactors(spec);
  const measured = opts.measured?.draft_s_per_frame;
  const draft = measured ?? base.draft * f.total;
  const ratio = base.draft ? base.k4 / base.draft : 0;
  const k4 = measured ? measured * ratio : base.k4 * f.total;
  const gpu = opts.gpuRatio ? k4 / opts.gpuRatio : null;
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    draft_s_per_frame: r2(draft), k4_cpu_s_per_frame: r2(k4), k4_gpu_s_per_frame: gpu == null ? null : r2(gpu),
    draft_minutes: r2((draft * frames) / 60), k4_cpu_hours: r2((k4 * frames) / 3600), k4_gpu_hours: gpu == null ? null : r2((gpu * frames) / 3600),
    factors: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, r2(v)])),
    basis: measured ? `MEASURED draft ${r2(measured)} s/f on this machine; 4K = draft x ${r2(ratio)} (the set's 4K/draft ratio: ${base.basis})` : `${base.basis}; x ${r2(f.total)} for the shot's content`,
  };
}
