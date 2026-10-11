// Shootout — the loading-screen and main-menu 3D stages.

// LOADING: the revolver slides in, cocks, fires; the camera rides the bullet in
// slow motion until it splits the bullseye. Calls onDone() when finished.
function runLoadingStage(onDone) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x140b06);
  scene.fog = new THREE.Fog(0x140b06, 4, 14);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 50);

  scene.add(new THREE.HemisphereLight(0xffc890, 0x201008, 0.5));
  const sun = new THREE.DirectionalLight(0xffa860, 1.7);
  sun.position.set(-2, 3, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 6, top: 3, bottom: -3 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xff5020, 0.8); rim.position.set(3, 1, -3); scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x1e120a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2; ground.receiveShadow = true;
  scene.add(ground);

  // Revolver at 4x scale so it reads on screen; holder lets it recoil.
  const holder = new THREE.Group();
  const gun = Models.revolver();
  gun.group.scale.setScalar(4);
  holder.add(gun.group);
  holder.rotation.y = Math.PI / 2;     // barrel toward +X
  holder.position.set(-4, 0, 0);
  scene.add(holder);

  const tgt = Models.target();
  tgt.position.set(3.2, 0.05, 0);
  tgt.rotation.y = -Math.PI / 2;
  tgt.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(tgt);

  const bullet = Models.bullet();
  bullet.scale.setScalar(4);
  bullet.visible = false;
  scene.add(bullet);
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0005, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.rotation.z = Math.PI / 2;
  trail.visible = false;
  scene.add(trail);

  const stage = { scene, camera };
  camera.position.set(-1.2, 0.35, 2.4);
  camera.lookAt(-0.6, 0, 0);
  Engine.setStage(stage);

  const muzzleWorld = () => gun.muzzle.getWorldPosition(new THREE.Vector3());
  const T = Engine.tween, W = Engine.wait, E = Engine.Ease;

  (async () => {
    // slide in
    await T(1.0, t => {
      holder.position.x = Util.lerp(-4, -1.4, t);
      holder.rotation.z = Util.lerp(0.4, 0, t);
      camera.position.x = Util.lerp(-1.6, -1.1, t);
      camera.lookAt(Util.lerp(-1.2, -0.9, t), 0, 0);
    }, E.out);
    // cock the hammer and turn the cylinder one chamber
    await T(0.35, t => {
      gun.hammer.rotation.x = -0.75 * t;
      gun.cylinder.rotation.z = (Math.PI / 3) * t;
    }, E.inOut);
    await W(0.2);

    // fire
    gun.hammer.rotation.x = 0;
    const from = muzzleWorld();
    const to = new THREE.Vector3(tgt.position.x - 0.04, from.y, from.z);
    Sound.gunshot();
    FX.muzzleFlash(scene, from, 0.9);
    FX.smoke(scene, from, new THREE.Vector3(1, 0, 0), 10, 1.3);
    T(0.35, t => { holder.rotation.z = Math.sin(t * Math.PI) * 0.45; holder.position.x = -1.4 - Math.sin(t * Math.PI) * 0.12; }, E.linear);

    // bullet time: camera rides alongside the spinning bullet
    bullet.visible = true; trail.visible = true;
    await T(1.7, t => {
      const p = from.clone().lerp(to, t);
      bullet.position.copy(p);
      bullet.rotation.set(0, Math.PI / 2, 0);
      bullet.rotateZ(t * 40);
      const len = Math.min(1.4, p.x - from.x);
      trail.scale.y = Math.max(0.001, len);
      trail.position.set(p.x - len / 2, p.y, p.z);
      camera.position.set(p.x - 0.3 + t * 0.1, p.y + 0.07, p.z + 0.55 - t * 0.15);
      camera.lookAt(p.x + 0.25, p.y, p.z);
    }, E.inOut);

    // impact
    bullet.visible = false; trail.visible = false;
    Sound.impact();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    hole.position.set(0, 0, 0.033);
    tgt.add(hole);
    FX.burst(scene, to, { count: 40, color: 0xc8a070, size: 0.02, speed: 3, dir: new THREE.Vector3(-1.2, 0.4, 0), spread: 0.8, gravity: 5, life: 1.2 });
    FX.burst(scene, to, { count: 16, color: 0xffd080, size: 0.008, speed: 4, dir: new THREE.Vector3(-1, 0, 0), emissive: true, life: 0.4 });
    const camFrom = camera.position.clone();
    T(0.5, t => { tgt.rotation.z = Math.sin(t * Math.PI * 4) * 0.06 * (1 - t); }, E.linear);
    await T(1.1, t => {
      camera.position.lerpVectors(camFrom, new THREE.Vector3(2.0, 0.25, 1.6), t);
      camera.lookAt(3.2, 0.05, 0);
    }, E.out);
    await W(0.5);
    onDone();
  })();
}

// MENU: a revolver and three cards on a table under a swaying lamp, slowly
// orbited by the camera. The HTML menu sits on top of it.
const MenuStage = (() => {
  let stage;
  function build() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0604);
    scene.fog = new THREE.Fog(0x0a0604, 2, 7);
    const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 30);

    scene.add(new THREE.HemisphereLight(0x806040, 0x100804, 0.35));
    const lamp = Models.hangingLamp();
    lamp.group.position.set(0, 2.1, 0);
    lamp.light.intensity = 3;
    scene.add(lamp.group);

    const top = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 6), Models.mats().wood);
    top.position.y = -0.03; top.receiveShadow = true; scene.add(top);

    const gun = Models.revolver();
    gun.group.scale.setScalar(2.2);
    gun.group.rotation.set(0, 0.9, Math.PI / 2);     // lying on its side
    gun.group.position.set(-0.55, 0.035, 0.05);
    gun.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(gun.group);

    ['jack', 'bloody', 'one'].forEach((id, i) => {
      const c = Models.card(id);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = -0.35 + i * 0.32;
      c.position.set(0.5 + i * 0.09, 0.002 + i * 0.002, 0.05 - i * 0.02);
      c.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(c);
    });

    for (let i = 0; i < 5; i++) {
      const b = Models.bullet();
      b.scale.setScalar(2.2);
      b.rotation.set(Math.PI / 2, 0, Math.random() * 3);
      b.position.set(-0.75 + Math.random() * 0.35, 0.012, 0.35 + Math.random() * 0.25);
      b.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(b);
    }

    // dust drifting through the lamplight
    const dustGeo = new THREE.BufferGeometry();
    const pts = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) { pts[i * 3] = (Math.random() - 0.5) * 3; pts[i * 3 + 1] = Math.random() * 2; pts[i * 3 + 2] = (Math.random() - 0.5) * 3; }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe0b0, size: 0.008, transparent: true, opacity: 0.5 }));
    scene.add(dust);

    stage = {
      scene, camera,
      update(dt, time) {
        const a = time * 0.12;
        camera.position.set(Math.sin(a) * 0.5, 1.15 + Math.sin(time * 0.3) * 0.04, 1.55 + Math.cos(a) * 0.2);
        camera.lookAt(0, 0.0, 0);
        lamp.group.rotation.z = Math.sin(time * 0.7) * 0.05;
        lamp.light.intensity = 3 + Math.sin(time * 13) * 0.05;
        gun.cylinder.rotation.z = Math.floor(time / 3) * (Math.PI / 3);
        dust.rotation.y = time * 0.02;
        dust.position.y = Math.sin(time * 0.2) * 0.05;
      },
    };
  }
  return { show() { if (!stage) build(); Engine.setStage(stage); } };
})();
