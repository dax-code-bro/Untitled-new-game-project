// Side-on grey silhouette of a weapon model for the gun HUD (rendered once per
// weapon with the game's own renderer into a small target, then cached).
import * as THREE from 'three';

export function makeSilhouetter(renderer) {
  const W = 360, H = 120;
  const rt = new THREE.WebGLRenderTarget(W, H);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cache = new Map();
  const px = new Uint8Array(W * H * 4);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  return (key, model) => {
    if (!model) return '';
    if (cache.has(key)) return cache.get(key);
    const c = model.clone(true);
    c.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } if (o.isLight) o.visible = false; });
    c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.setScalar(1); c.visible = true;
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    // look at the gun's right side, muzzle to the right
    const half = Math.max(sz.z / 2 / (W / H), sz.y / 2) * 1.08;
    Object.assign(cam, { left: -half * (W / H), right: half * (W / H), top: half, bottom: -half });
    cam.position.set(ctr.x - 5, ctr.y, ctr.z); cam.lookAt(ctr); cam.updateProjectionMatrix();
    scene.add(c);
    const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevCol, prevA);
    renderer.shadowMap.autoUpdate = prevAuto;
    scene.remove(c);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
      const on = px[s] > 20 || px[s + 3] > 20;
      img.data[d] = img.data[d + 1] = img.data[d + 2] = 225;
      img.data[d + 3] = on ? 150 : 0;
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL('image/png');
    cache.set(key, url);
    return url;
  };
}
