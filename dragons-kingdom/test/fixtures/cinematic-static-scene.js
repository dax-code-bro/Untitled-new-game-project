// Cinematic stack fixture 3: nothing moves (camera included), so two frames
// differ only by what the stack adds per frame (sensor grain). Used for the
// grain, LUT and "motion blur leaves a still picture alone" tests.
export const meta = { title: 'Cinematic static fixture', duration: 4, cinematic: true };

export async function setup(ctx) {
  const { THREE, scene, camera } = ctx;
  scene.background = new THREE.Color(0.45, 0.55, 0.75);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x403020, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0dd, 3);
  sun.position.set(20, 30, 10); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 100 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x6d7a5a, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  // a grey ramp (smooth gradients for the LUT test) and coloured blocks
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(14, 4, 1, 1), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const c = new Float32Array([0.02, 0.02, 0.02, 3, 3, 3, 0.02, 0.02, 0.02, 3, 3, 3]);
  ramp.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  ramp.position.set(0, 6, -6);
  scene.add(ramp);
  const cols = [0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0xecf0f1];
  cols.forEach((col, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 2 + i, 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    b.position.set(-8 + i * 4, 1 + i / 2, -2 - i * 2);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
  });
  camera.position.set(0, 4, 14);
  camera.lookAt(0, 3, -4);
}

export function update(t, ctx) {
  ctx.lens.focalLength = 35;
  ctx.lens.fstop = 2.8;
  ctx.lens.focus = 14;
}
