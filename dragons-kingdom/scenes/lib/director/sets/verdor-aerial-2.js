// Shot director set - VERDOR_AERIAL_2: X4-10 (Leaf passes the Santa Maria's mainmast; the lookout ducks, laughs,
// waves), a SECOND spec on the VERDOR_AERIAL shots (registry `shotSet`, as CLING_SQUARE_2 on CLING_SQUARE).
//
// A THIN WRAPPER over VERDOR_AERIAL (sets/verdor-aerial.js, its build() as-is, from the verdor-aerial spec's MAP), so
// the two specs can never disagree about the harbour. sets/verdor-aerial.js and verdor-aerial.spec.js are NOT edited
// (shots queued on them keep their keys). This file adds, procedural:
//   crow's nest   a round timber lookout tub on the Santa Maria's MAINMAST, above the main top (the source model has
//                 none): floor, staved wall to waist height, a rim, four cheek brackets under it. Placed in the
//                 ship's own frame from the mast MEASURED in the model (session 35, gltf probe of
//                 ph_dutch_ship_medium rigging: mainmast at ship x -1.15, z 0; masthead y 22.66; the main top /
//                 yard band y 15-18; the topmast above 18 is ~0.15 m radius; foremast at x 6.5, top 20.2)
//   marks         `crowsNest` = the tub's floor centre (world), `mainmastTop` = the masthead (world)
// Ship frame -> world (MAP.santaMaria at [267, 0, 1590], heading 0 = bow north): world x = 267 + z_ship,
// world z = 1590 - x_ship -> mainmast [267, 1591.15], nest floor y 18.3.
import * as THREE from 'three';
import * as base from './verdor-aerial.js';

export const cinematic = base.cinematic;
export const NEST = { x: -1.15, z: 0, y: 18.3, r: 0.85, wall: 1.05 };   // ship frame (metres)
export const MASTHEAD = [-1.19, 22.66, 0];

export async function build(ctx, opts = {}) {
  const { scene } = ctx;
  const B = await base.build(ctx, opts);
  const ship = scene.getObjectByName('santa-maria');

  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e2118, roughness: 0.9, metalness: 0 });
  const nest = new THREE.Group(); nest.name = 'crows-nest';
  const { r, wall } = NEST;
  // staved wall: a slightly flared open cylinder + vertical stave lines (thin dark battens)
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, wall, 20, 1, true), wood);
  tub.position.y = wall / 2; nest.add(tub);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.045, wall, 0.03), dark);
    const rr = r * 0.95 + 0.012;
    b.position.set(Math.cos(a) * rr, wall / 2, Math.sin(a) * rr); b.rotation.y = -a; nest.add(b);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.045, 6, 28), dark);
  rim.rotation.x = Math.PI / 2; rim.position.y = wall; nest.add(rim);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.03, 6, 28), dark);
  hoop.rotation.x = Math.PI / 2; hoop.position.y = 0.08; nest.add(hoop);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.08, 20), wood);
  floor.position.y = -0.04; nest.add(floor);
  // cheek brackets from the mast down-out to the floor's edge
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.1), dark);
    br.position.set(Math.cos(a) * r * 0.45, -0.45, Math.sin(a) * r * 0.45);
    br.rotation.y = -a; br.rotation.z = 0; br.rotateOnAxis(new THREE.Vector3(0, 0, 1), 0.7);
    nest.add(br);
  }
  nest.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  nest.position.set(NEST.x, NEST.y, NEST.z);
  const marks = { ...B.marks };
  if (ship) {
    ship.add(nest);
    ship.updateMatrixWorld(true);
    const w = nest.getWorldPosition(new THREE.Vector3());
    marks.crowsNest = [w.x, w.y, w.z];
    const m = new THREE.Vector3(...MASTHEAD).applyMatrix4(ship.matrixWorld);
    marks.mainmastTop = [m.x, m.y, m.z];
  }
  return { ...B, marks, objects: { ...B.objects, crowsNest: nest } };
}
