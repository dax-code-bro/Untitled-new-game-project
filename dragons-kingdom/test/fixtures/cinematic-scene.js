// Cinematic stack fixture: lens (focal length, f-stop, focus pull), velocity
// motion blur (a fast spinning/moving knot, an instanced swarm, a skinned
// "tail" and a waving flag), DOF, bloom, grade, grain. Small and procedural.
// The tests change the settings through the session's `cinematic` option.
import { applyShake } from 'dk/camera.js';

export const meta = {
  title: 'Cinematic fixture', duration: 4,
  cinematic: true,
};

let S;

export async function setup(ctx) {
  const { THREE, scene, camera, rng, quality } = ctx;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(1.4,1.2,1.0), vec3(0.25,0.45,1.1), smoothstep(-0.05,0.6,h)), 1.); }',
  }));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x553311, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0dd, 3.2);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 150 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x5a7a46, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const colors = [0xd23b3b, 0x3b8ad2, 0xe0c040, 0x9b59b6, 0x2ecc71, 0xffffff];
  for (let i = 0; i < 18; i++) {
    const h = 1 + rng() * 5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5 }));
    const a = (i / 18) * Math.PI * 2, r = 8 + (i % 3) * 5;
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  // a small bright light bulb (bokeh + bloom)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(40, 30, 18) }));
  bulb.position.set(-6, 2.2, -14);
  scene.add(bulb);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.6, 0.5, 128, 16), new THREE.MeshStandardMaterial({ color: 0xff7722, roughness: 0.3, metalness: 0.2 }));
  knot.castShadow = true;
  scene.add(knot);
  // instanced swarm
  const swarm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: 0x223344 }), 40);
  swarm.castShadow = true;
  scene.add(swarm);
  // skinned tail: a bent cylinder with 4 bones
  const segs = 4, len = 4;
  const geo = new THREE.CylinderGeometry(0.25, 0.08, len, 12, 16, false);
  geo.translate(0, len / 2, 0);
  const pos = geo.attributes.position, si = [], sw = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / len * segs, b = Math.min(segs - 1, Math.floor(y)), f = y - b;
    si.push(b, Math.min(segs - 1, b + 1), 0, 0); sw.push(1 - f, f, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const bones = [];
  for (let i = 0; i < segs; i++) { const b = new THREE.Bone(); b.position.y = i === 0 ? 0 : len / segs; if (i) bones[i - 1].add(b); bones.push(b); }
  const tail = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8844cc, roughness: 0.6 }));
  tail.add(bones[0]); tail.bind(new THREE.Skeleton(bones));
  tail.position.set(4, 0, 3); tail.castShadow = true;
  scene.add(tail);
  // waving flag (vertex animation)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2, 24, 12), new THREE.MeshStandardMaterial({ color: 0xcc2222, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(-3, 4, 2); flag.castShadow = true;
  const base = Float32Array.from(flag.geometry.attributes.position.array);
  scene.add(flag);
  camera.near = 0.3; camera.far = 1200;
  S = { THREE, knot, swarm, bones, flag, base, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1) };
}

export function update(t, ctx) {
  const { knot, swarm, bones, flag, base, m4, q, e, v, one } = S;
  knot.position.set(Math.sin(t * 2.6) * 5, 3 + Math.sin(t * 2.1) * 1.0, Math.cos(t * 1.8) * 2);
  knot.rotation.set(t * 3.0, t * 4.0, 0);
  for (let i = 0; i < 40; i++) {
    const a = t * 1.5 + i * 0.4;
    v.set(Math.cos(a) * (6 + (i % 5)), 5 + Math.sin(a * 2 + i) * 0.8, Math.sin(a) * (6 + (i % 5)) - 4);
    q.setFromEuler(e.set(a, a * 0.5, 0));
    swarm.setMatrixAt(i, m4.compose(v, q, one));
  }
  swarm.instanceMatrix.needsUpdate = true;
  for (let i = 1; i < bones.length; i++) bones[i].rotation.z = Math.sin(t * 5 + i) * 0.5;
  const p = flag.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = base[3 * i] + 1.5;
    p.setZ(i, Math.sin(x * 2.5 - t * 7) * 0.25 * x / 3);
  }
  p.needsUpdate = true;
  const a = 0.6 + t * 0.25;
  ctx.camera.position.set(Math.cos(a) * 27, 4.5, Math.sin(a) * 27);
  ctx.camera.lookAt(0, 2.5, 0);
  applyShake(ctx.camera, t, { kind: 'handheld', amount: 0.5 });
  ctx.lens.focalLength = 40;
  ctx.lens.fstop = 2.0;
  ctx.lens.focusTarget = knot;
  ctx.lens.shutterAngle = 180;
}
