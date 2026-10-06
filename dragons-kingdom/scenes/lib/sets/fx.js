// Small compositing-style effects for sets.
//
// silhouetteCard(): the old matte-painting trick for "a shape seen through
// fog": the silhouette of an object, as seen from the camera, is rendered once
// in setup, blurred (light diffusing through mist softens every edge), and
// shown as a dark, semi-transparent card at the object's distance, facing the
// camera. The volumetric fog in front of it then fades it further. Used for
// the prologue's "something passes beyond the mist": the eye reads a darker
// winged form in the cloud, never a clear creature.
import * as THREE from 'three';

function boxBlur(src, W, H, r, passes = 3) {
  let a = src, b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * W;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    // vertical
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc / (2 * r + 1);
        acc += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
      }
    }
  }
  return a;
}

/**
 * object: a posed Object3D (e.g. creature.root); from: Vector3 the camera position to
 * see it from; opts: size [W,H] (texture), blur (px at that size), color, opacity, pad.
 * Returns { mesh, center, radius, face(cameraPosition) }. The object is not modified.
 */
export function silhouetteCard(ctx, object, from, opts = {}) {
  const { renderer } = ctx;
  const [W, H] = opts.size || [1024, 512];
  object.updateMatrixWorld(true);
  // bounds from the skeleton / meshes (skinned meshes: use bone positions + a margin)
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  object.traverse((o) => { if (o.isBone) box.expandByPoint(o.getWorldPosition(v)); });
  if (box.isEmpty()) box.setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const R = sphere.radius * (opts.pad ?? 1.35);
  const cam = new THREE.OrthographicCamera(-R, R, R * H / W, -R * H / W, 0.1, sphere.center.distanceTo(from) + R * 4);
  cam.position.copy(from);
  cam.lookAt(sphere.center);
  cam.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: true });
  const tmp = new THREE.Scene();
  tmp.background = new THREE.Color(0, 0, 0);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  tmp.overrideMaterial = white;
  const parent = object.parent;
  tmp.add(object);
  const prevRT = renderer.getRenderTarget();
  const prevAC = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.render(tmp, cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(prevRT);
  renderer.autoClear = prevAC;
  tmp.remove(object);
  if (parent) parent.add(object);
  rt.dispose(); white.dispose();
  const f = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) f[i] = px[i * 4] / 255;
  const blurred = boxBlur(f, W, H, Math.max(1, Math.round(opts.blur ?? 8)));
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { const b = Math.round(Math.min(1, blurred[i]) * 255); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = b; out[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(...(opts.color || [0.02, 0.022, 0.026])), transparent: true, opacity: opts.opacity ?? 0.6,
    alphaMap: tex, depthWrite: false, fog: false, toneMapped: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R * H / W), mat);
  mesh.name = 'silhouette-card';
  mesh.position.copy(sphere.center);
  mesh.frustumCulled = false;
  const up = new THREE.Vector3(0, 1, 0);
  return {
    mesh, center: sphere.center.clone(), radius: R, texture: tex,
    /** Turn the card to face a camera position (the silhouette was taken from `from`). */
    face(p) { mesh.up.copy(up); mesh.lookAt(p); mesh.updateMatrixWorld(); },
  };
}
