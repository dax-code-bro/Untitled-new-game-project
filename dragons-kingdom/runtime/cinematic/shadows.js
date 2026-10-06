// Cascaded sun shadow maps fitted to the camera every frame (a pure function
// of the camera, so deterministic). Near the camera a 4096 map covers a few
// metres -> millimetre-sharp contact at 4K; farther cascades cover hundreds of
// metres. Stable fitting (bounding sphere + texel snapping) so shadow edges do
// not crawl when the camera moves or turns.
//
// The scene's sun stays cascade 0; the runtime adds cascades 1..N-1 as extra
// DirectionalLights with the same direction/colour. The material patch
// (materials.js) gives each fragment only the cascade covering its distance.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();

export class CascadedShadows {
  constructor(host, cin) {
    this.h = host; this.cin = cin;
    this.lights = [];
    this.bands = [];
  }

  init(sun) {
    const c = this.cin.c.shadows;
    const N = Math.max(1, Math.min(4, c.cascades | 0));
    this.N = N;
    this.sun = sun;
    // per cascade: each one covers a small part of the view, so 2048 is already finer than one
    // 4096 map over everything; 3 x 4096 measured 2.2 s more per 4K frame than 3 x 2048 (test-kingdom)
    const q = this.h.ctx.quality.shadowMapSize || 2048;
    const size = c.mapSize || (N > 1 ? Math.min(q, 2048) : q);
    this.size = size;
    sun.castShadow = true;
    sun.shadow.mapSize.set(size, size);
    this.lights = [sun];
    const parent = sun.parent || this.h.scene;
    for (let i = 1; i < N; i++) {
      const l = new THREE.DirectionalLight(sun.color, sun.intensity);
      l.name = `dk-csm-${i}`;
      l.castShadow = true;
      l.shadow.mapSize.set(size, size);
      parent.add(l); parent.add(l.target);
      this.lights.push(l);
    }
    if (!sun.target.parent) parent.add(sun.target);
    // the cascades must be the first shadow-casting directional lights (three
    // sorts shadow casters first, otherwise keeps scene order)
    if (parent === this.h.scene) {
      const ours = new Set(this.lights);
      const rest = parent.children.filter((o) => !ours.has(o));
      parent.children.length = 0;
      parent.children.push(...this.lights, ...rest);
    }
    const order = [];
    this.h.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) order.push(o); });
    if (order.slice(0, N).some((l, i) => l !== this.lights[i])) console.warn('[dk] cinematic: the sun is not the first shadow-casting DirectionalLight - cascades may light the wrong light; add the sun directly to the scene');
    return this.lights;
  }

  /** Fit the cascades to the camera. Returns the material bands. */
  update() {
    const { camera } = this.h, c = this.cin.c.shadows, N = this.N, sun = this.sun;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    const dir = _v.setFromMatrixPosition(sun.matrixWorld).sub(_c.setFromMatrixPosition(sun.target.matrixWorld)).normalize().clone();
    const near = camera.near, far = Math.min(camera.far, c.maxDistance);
    const splits = [];
    for (let i = 0; i <= N; i++) {
      const u = near + ((far - near) * i) / N, l = near * Math.pow(far / near, i / N);
      splits.push(u + (l - u) * c.split);
    }
    // camera frustum corners at view depth z (view space -> world)
    const tanY = Math.tan((camera.fov * Math.PI) / 360) / (camera.zoom || 1), tanX = tanY * camera.aspect;
    const corners = (z) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => new THREE.Vector3(sx * tanX * z, sy * tanY * z, -z).applyMatrix4(camera.matrixWorld));
    const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    this.bands = [];
    for (let i = 0; i < N; i++) {
      const l = this.lights[i];
      const w = splits[i + 1] - splits[i];
      const fadeOutStart = i < N - 1 ? splits[i + 1] - w * c.blend : 0;
      const fadeInStart = i > 0 ? this.bands[i - 1].fadeOutStart : 0;
      const z0 = i > 0 ? fadeInStart : near, z1 = splits[i + 1];
      const pts = [...corners(z0), ...corners(z1)];
      const center = new THREE.Vector3();
      for (const p of pts) center.add(p);
      center.multiplyScalar(1 / pts.length);
      let r = 0;
      for (const p of pts) r = Math.max(r, p.distanceTo(center));
      r = Math.ceil(r * 16) / 16;                       // quantised: the map scale does not flicker
      // snap the centre to whole shadow texels in light space (no crawling edges)
      _m.lookAt(new THREE.Vector3(), dir.clone().negate(), up);   // light orientation (rotation only)
      _mi.copy(_m).invert();
      const lc = center.clone().applyMatrix4(_mi);
      const texel = (2 * r) / this.size;
      lc.x = Math.round(lc.x / texel) * texel; lc.y = Math.round(lc.y / texel) * texel;
      center.copy(lc.applyMatrix4(_m));
      const pull = Math.max(r, c.pullback ?? 300);       // casters outside the view (cliffs, a dragon above)
      l.position.copy(center).addScaledVector(dir, r + pull);
      l.target.position.copy(center);
      const cam = l.shadow.camera;
      cam.up.copy(up);                                   // same axes as the snapping above
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5; cam.far = 2 * r + pull + 1;
      cam.updateProjectionMatrix();
      l.shadow.bias = c.bias ?? sun.shadow.bias ?? -0.0002;
      l.shadow.normalBias = (c.normalBias ?? 1.5) * texel;
      if (l !== sun) { l.color.copy(sun.color); l.intensity = sun.intensity; l.visible = sun.visible; }
      l.updateMatrixWorld(); l.target.updateMatrixWorld();
      this.bands.push({ fadeInStart, fadeInEnd: i > 0 ? splits[i] : 0, fadeOutStart, fadeOutEnd: i < N - 1 ? splits[i + 1] : 0, r, texel });
    }
    this.far = far;
    return this.bands;
  }

  bind(u) {
    for (let i = 0; i < 4; i++) {
      const b = this.bands[i];
      if (b) u.dkCsmBand.value[i].set(b.fadeInStart, b.fadeInEnd, b.fadeOutStart, b.fadeOutEnd);
      else u.dkCsmBand.value[i].set(0, 0, 0, 0);
    }
    u.dkCsmFadeEnd.value = this.far;
  }
}
