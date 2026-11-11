// Engine set generator - the TOWN-SQUARE template's builder (browser): architecture/cling.js clingSquare(ctx,
// { layout }) on the generated layout, a sky dome, the sun of the shot's continuity and a hemisphere fill.
// A generated wrapper (scenes/lib/director/sets/<id>.js) holds only PARAMS and calls makeTownSquare(PARAMS).
import * as THREE from 'three';
import { clingSquare, clingLayout } from '../../../architecture/cling.js';
import { filmFinish } from '../../../../lookdev/finish.js';
import { skyDome } from '../common.js';
import { squareMarks } from './town-square-layout.js';

export function makeTownSquare(P) {
  const LAY = clingLayout(P.layout || {});
  function cinematic() {
    return filmFinish({ grade: { exposure: 1.5, whiteBalance: 5600, contrast: 1.04, saturation: 0.9 }, grain: { amount: 3.2 }, lensFx: { vignette: 0.8 } });
  }
  async function build(ctx) {
    const { scene } = ctx;
    const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
    scene.add(skyDome({ zenith: [0.2, 0.32, 0.6], horizon: [0.75, 0.78, 0.84], ground: [0.12, 0.11, 0.1], glow: [0.6, 0.5, 0.35], glowDir: [1, 0.2, 0], glowPow: 6 }));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.19, 0.13), roughness: 0.95 }));
    ground.position.y = -0.01; ground.receiveShadow = true; scene.add(ground);
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.8), 4);
    sun.castShadow = true; sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
    const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.6, 0.65, 0.75), new THREE.Color(0.3, 0.27, 0.22), 0.5));
    const sq = await clingSquare(ctx, { layout: P.layout, seed: P.seed ?? 5 });
    scene.add(sq.group);
    ctx.camera.near = 0.05; ctx.camera.far = 4000; ctx.camera.updateProjectionMatrix();
    const marks = Object.fromEntries(Object.entries(squareMarks(LAY)).map(([k, m]) => [k, m.at]));
    return {
      marks, objects: {}, ground: () => 0.03,
      applyShot(info) {
        const d = new THREE.Vector3(...(info.cont?.sun || [0.6, 0.45, 0.3])).normalize();
        sun.target.position.set(0, 0, 0); sun.position.copy(d).multiplyScalar(150);
      },
    };
  }
  return { LAYOUT: LAY, cinematic, build };
}
