// Engine set generator - the TOWN-SQUARE marks from a clingLayout() layout (pure: browser and Node).
const r3 = (v) => Math.round(v * 1000) / 1000;
export function squareMarks(L) {
  const m = (at, alias = []) => ({ at: at.map(r3), ...(alias.length ? { alias } : {}) });
  return {
    fountain: m([L.fountain.x, 0.03, L.fountain.z], ['fountain', 'the fountain', 'well']),
    fountainRim: m([L.fountain.x + L.fountain.r + 0.4, 0, L.fountain.z], ['fountain rim', 'by the fountain']),
    steps: m([L.steps.x, 0, L.steps.z - 1], ['steps', 'the steps']),
    arch: m([L.arch.x + 1, 0, L.arch.z], ['arch', 'the arch', 'archway']),
    gate: m([L.gate.x - 1, 0, L.gate.z], ['gate', 'the gate']),
    alley: m([L.alley.x, 0, L.alley.z + 0.6], ['alley', 'the alley']),
    centre: m([(L.square.x0 + L.square.x1) / 2, 0, (L.square.z0 + L.square.z1) / 2], ['square', 'middle', 'centre']),
  };
}
