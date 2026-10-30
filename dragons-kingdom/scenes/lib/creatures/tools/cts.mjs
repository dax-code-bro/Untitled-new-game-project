import { createCreature, poses } from '/home/user/Untitled-new-game-project/dragons-kingdom/scenes/lib/creatures/index.js';
import * as THREE from '/home/user/Untitled-new-game-project/dragons-kingdom/node_modules/three/build/three.module.js';
const c = await createCreature(process.argv[2], { quality: 'draft', drape: false });
for (const spec of process.argv.slice(3)) {
  const i = spec.indexOf(':'); const name = i < 0 ? spec : spec.slice(0, i); const o = i < 0 ? {} : JSON.parse(spec.slice(i + 1));
  c.setPose(poses[name](c, { t: 0, ...o })); c.root.updateMatrixWorld(true);
  const out = c.anatomy.contacts.filter((ct) => /_L_|_L$/.test(ct.bone)).map((ct) => { const b = c.bones[c.boneIndex[ct.bone]]; const v = new THREE.Vector3(...ct.off).applyMatrix4(b.matrixWorld); return `${ct.bone}:${(v.y - ct.r).toFixed(2)}`; });
  console.log(spec, out.join(' '));
}
