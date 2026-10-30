import { createCreature, createSaddle, poses } from '/home/user/Untitled-new-game-project/dragons-kingdom/scenes/lib/creatures/index.js';
import * as THREE from '/home/user/Untitled-new-game-project/dragons-kingdom/node_modules/three/build/three.module.js';
const c = await createCreature('charcoal', { quality: 'draft', drape: false });
const tack = createSaddle(c, {});
const v = new THREE.Vector3();
const P = (n) => { const b = c.bones[c.boneIndex[n]]; v.setFromMatrixPosition(b.matrixWorld); return v.toArray().map((x) => x.toFixed(2)).join(','); };
for (const spec of process.argv.slice(2)) {
  const i = spec.indexOf(':'); const name = i < 0 ? spec : spec.slice(0, i), js = i < 0 ? '' : spec.slice(i + 1); const o = js ? JSON.parse(js) : {};
  const p = poses[name](c, { t: 0, ...o }); c.setPose(p); c.root.updateMatrixWorld(true);
  const bi = c.bones.indexOf(tack.seatBone);
  const seat = tack.seatPoint.clone().applyMatrix4(c.skeleton.boneInverses[bi]).applyMatrix4(tack.seatBone.matrixWorld);
  // lowest body vertex y
  const pos = c.body?.geometry ? null : null;
  const d = c.anatomy.dims; const bel = [];
  for (const [n, s] of [['rib_thorax', 0.25], ['rib_body', 0.5], ['rib_lumbar', 0.78]]) { const b = c.bones[c.boneIndex[n]]; const sc = d.trunkAt(s); const rp = c.restPos[n];
    const w = new THREE.Vector3(sc.c[0] - rp[0], sc.c[1] - sc.hh * 0.97 - rp[1], sc.c[2] - rp[2]).applyMatrix4(b.matrixWorld); bel.push(w.y.toFixed(2)); }
  console.log('  belly', bel.join(' '), 'chest depth', (2*d.trunkAt(0.25).hh).toFixed(2), 'thorax', P('thorax'));
  console.log(spec, 'seat', seat.toArray().map((x) => x.toFixed(2)).join(','), '| hipL', P('hl_L_0'), 'knee', P('hl_L_1'), 'hock', P('hl_L_2'), 'ball', P('hl_L_3'), '| wristL', P('w_L_2'), 'rig', p.rig.position.map((x)=>x.toFixed(2)).join(','));
}
