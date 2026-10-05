// Small, fast scene used by the automated tests. Colourful, has a smooth sky
// gradient (dither/banding check), shadows, and motion (determinism check).
export const meta = { title: 'Test fixture', duration: 4 };

let rig;

export async function setup(ctx) {
  const { THREE, scene, camera, rng, quality } = ctx;
  // sky gradient dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.9,0.75,0.6), vec3(0.15,0.3,0.7), smoothstep(-0.05,0.6,h)), 1.); }',
    }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x553311, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0dd, 3);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 150 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x4c7a3a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const colors = [0xd23b3b, 0x3b8ad2, 0xe0c040, 0x9b59b6, 0x2ecc71, 0xffffff];
  for (let i = 0; i < 24; i++) {
    const h = 1 + rng() * 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, h, 2), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5, metalness: 0.1 }));
    const a = (i / 24) * Math.PI * 2;
    m.position.set(Math.cos(a) * 14, h / 2, Math.sin(a) * 14);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  rig = new THREE.Mesh(new THREE.TorusKnotGeometry(3, 0.9, 160, 24), new THREE.MeshStandardMaterial({ color: 0xff7722, roughness: 0.3, metalness: 0.3 }));
  rig.castShadow = true;
  scene.add(rig);
  camera.fov = 45;
  camera.near = 0.5; camera.far = 1200;
  camera.updateProjectionMatrix();
}

export function update(t, ctx) {
  rig.position.set(Math.sin(t * 1.3) * 6, 6 + Math.sin(t * 2.1) * 1.5, Math.cos(t * 0.9) * 4);
  rig.rotation.set(t * 0.8, t * 1.1, 0);
  const a = 0.6 + t * 0.15;
  ctx.camera.position.set(Math.cos(a) * 34, 14 + Math.sin(t * 0.5) * 2, Math.sin(a) * 34);
  ctx.camera.lookAt(0, 3, 0);
}
