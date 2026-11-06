// The showroom stand: whatever a store sells, turning slowly under studio lights (drag to turn it,
// wheel or pinch to zoom). One renderer shared by every store (only one is open at a time), moved
// into whichever panel is showing, so ten stores don't cost ten WebGL contexts.
import * as THREE from 'three';

let V = null;
function make() {
  const canvas = document.createElement('canvas'); canvas.className = 'sbview';
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  // a soft studio: a big key light, a cool fill, a rim from behind, and a floor that catches the shadow
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3028, 0.9));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(3, 5, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8dcff, 1.2); rim.position.set(-4, 3, -5); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // soft studio reflections for paint, chrome and glass (a dim room with a big softbox overhead)
  const pm = new THREE.PMREMGenerator(r), env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: 0x8a847c, side: THREE.BackSide })));
  const floorE = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ color: 0x4a4540 })); floorE.rotation.x = -Math.PI / 2; floorE.position.y = -1.5; env.add(floorE);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ color: 0xfff4e6 })); front.position.set(3, 1.5, 3.5); front.lookAt(0, 0, 0); env.add(front);
  const box = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff })); box.position.set(0, 3.5, 0.5); box.lookAt(0, 0, 0); env.add(box);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), new THREE.MeshBasicMaterial({ color: 0xbfd2ff })); side.position.set(-4, 1.5, -1); side.lookAt(0, 0, 0); env.add(side);
  scene.environment = pm.fromScene(env, 0.04).texture;
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
  const stand = new THREE.Group(); scene.add(stand);
  const s = { canvas, r, scene, cam, key, floor, stand, yaw: 0.6, pitch: 0.28, dist: 3, spin: true, drag: null, raf: 0, size: 1 };
  canvas.addEventListener('pointerdown', (e) => { s.drag = { x: e.clientX, y: e.clientY }; s.spin = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!s.drag) return; s.yaw -= (e.clientX - s.drag.x) * 0.01; s.pitch = Math.max(-0.2, Math.min(1.2, s.pitch + (e.clientY - s.drag.y) * 0.006)); s.drag = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', () => { s.drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); s.zoom = Math.max(0.5, Math.min(2.2, (s.zoom || 1) * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  return s;
}

// Put `obj` on the stand inside `host` (an element); null clears it. Returns the canvas.
export function showOnStand(host, obj, opts = {}) {
  if (!V) V = make();
  if (V.canvas.parentElement !== host) host.appendChild(V.canvas);
  for (const c of [...V.stand.children]) V.stand.remove(c);
  if (obj) {
    V.stand.add(obj);
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= bb.min.y; // stood on the floor, centred
    V.size = Math.max(size.x, size.y, size.z, 0.05);
    V.height = size.y;
    V.floor.scale.setScalar(V.size * 0.9);
    const k = V.key.shadow.camera, e = V.size * 1.2; k.left = -e; k.right = e; k.top = e; k.bottom = -e; k.near = 0.01; k.far = 30; k.updateProjectionMatrix();
    V.key.position.set(V.size * 2, V.size * 3.5, V.size * 2.5);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  V.spin = opts.spin ?? true; V.yaw = opts.yaw ?? 0.6; V.zoom = 1;
  if (!V.raf) loop();
  return V.canvas;
}
export function hideStand() { if (V) { cancelAnimationFrame(V.raf); V.raf = 0; for (const c of [...V.stand.children]) V.stand.remove(c); } }

function loop() {
  V.raf = requestAnimationFrame(loop);
  const host = V.canvas.parentElement; if (!host || !host.offsetParent) return; // not on screen
  const w = host.clientWidth, h = host.clientHeight;
  if (w < 2 || h < 2) return;
  if (V.canvas.width !== Math.round(w * V.r.getPixelRatio()) || V.canvas.height !== Math.round(h * V.r.getPixelRatio())) { V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); }
  if (V.spin) V.yaw += 0.006;
  const d = (V.size / (2 * Math.tan((V.cam.fov * Math.PI) / 360))) * 1.25 * (V.zoom || 1) / Math.min(1, V.cam.aspect);
  const ty = V.height * 0.45;
  V.cam.position.set(Math.sin(V.yaw) * Math.cos(V.pitch) * d, ty + Math.sin(V.pitch) * d, Math.cos(V.yaw) * Math.cos(V.pitch) * d);
  V.cam.near = d * 0.02; V.cam.far = d * 10; V.cam.updateProjectionMatrix();
  V.cam.lookAt(0, ty, 0);
  V.r.render(V.scene, V.cam);
}
