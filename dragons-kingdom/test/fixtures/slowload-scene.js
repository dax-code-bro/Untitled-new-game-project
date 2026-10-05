// Asset loads that finish ~0.6 s AFTER setup() returned and are not awaited
// (like new TextureLoader().load(url)): through the default LoadingManager,
// through a LoadingManager the scene made itself, and a plain fetch().
// init() must wait for all of them (test (b5)).
import * as THREE from 'three';
export const meta = { title: 'Slow load fixture', duration: 2 };
let mat;
export async function setup(ctx) {
  ctx.scene.background = new THREE.Color(0x000000);
  mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  ctx.scene.add(quad);
  ctx.camera.position.set(0, 0, 1.2); ctx.camera.lookAt(0, 0, 0);
  const slow = (manager, apply) => {
    manager.itemStart('fake://slow');
    setTimeout(() => { apply(); manager.itemEnd('fake://slow'); }, 600);
  };
  slow(THREE.DefaultLoadingManager, () => { mat.color.r = 1; });
  const own = new THREE.Loader(new THREE.LoadingManager());   // the runtime must see this manager too
  slow(own.manager, () => { mat.color.g = 0.5; });
  fetch(new URL('./slowload-scene.js', import.meta.url)).then((r) => r.text()).then(() => { mat.color.b = 0.25; });
}
export function update() {}
