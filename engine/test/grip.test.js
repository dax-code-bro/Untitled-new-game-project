#!/usr/bin/env node
/* Is the hand actually closed on the grip?
 *
 * A screenshot cannot settle it — the hand is forty pixels across in the
 * frame and every version of it looks like an orange lump at that size. The
 * question is geometric, so ask the geometry: build the hand mesh, take its
 * vertices, and see which sides of the grip anchor they sit on. A claw has
 * skin on one or two sides. A hand closed on something has it on four.
 *
 * No browser needed — makeViewmodelArms is pure geometry and the engine has
 * a CommonJS export.
 */
const path = require('path');
const LE = require(path.join(__dirname, '..', '..', 'site', 'engine', 'legend-engine.js'));

const HANDS = {
  m1911: { right: [-0.006, -0.030, 0.014], left: null },
  thompson: { right: [-0.010, -0.040, 0.015], left: [0.250, -0.010, -0.018] },
  mp5: { right: [-0.012, -0.036, 0.015], left: [0.190, -0.020, -0.018] },
  mauser: { right: [-0.010, -0.020, 0.014], left: null },
  obliterator: { right: [-0.010, -0.026, 0.014], left: null },
  scatter: { right: [-0.014, -0.046, 0.016], left: [0.242, -0.006, -0.020] },
  remington: { right: [-0.012, -0.028, 0.016], left: [0.300, -0.006, -0.021] },
  mg42: { right: [-0.012, -0.030, 0.016], left: [0.330, -0.010, -0.020] },
};

let bad = 0;
for (const id in HANDS) {
  const hands = HANDS[id];
  const parts = LE.makeViewmodelArms(hands, {});
  for (const which of ['right', 'left']) {
    const h = hands[which];
    if (!h) continue;
    const geo = which === 'right' ? parts.skin : parts.lSkin;
    const pos = geo && geo.positions;
    if (!pos) { console.log(id, which, 'no mesh'); bad++; continue; }
    let near = 0, total = 0, far = 0;
    const quad = [0, 0, 0, 0];
    for (let i = 0; i < pos.length; i += 3) {
      const dx = pos[i] - h[0], dy = pos[i + 1] - h[1], dz = pos[i + 2] - h[2];
      const d = Math.hypot(dx, dy, dz);
      total++;
      if (d > far) far = d;
      if (d < 0.055) {
        near++;
        // Four quadrants in the plane across the barrel: above/below the
        // anchor, and near side / far side of it.
        quad[(dy >= 0 ? 0 : 2) + (dz >= 0 ? 0 : 1)]++;
      }
    }
    const sides = quad.filter((n) => n > near * 0.06).length;
    if (sides < 4) bad++;
    console.log(String(id).padEnd(12), which.padEnd(6),
      'within 55mm ' + String((near / Math.max(1, total) * 100).toFixed(1)).padStart(5) + '%',
      'quadrants ' + JSON.stringify(quad).padEnd(26),
      sides < 4 ? '<<< skin on only ' + sides + ' sides' : 'closed');
  }
}
console.log(bad ? `\n${bad} hand(s) not closed on the grip` : '\nevery hand is closed on its grip');
process.exit(bad ? 1 : 0);
