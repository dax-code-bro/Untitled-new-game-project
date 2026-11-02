// Interaction points: shops, doors, garages, jobs, missions, properties...
// Walk (or drive, for drive-in points) into the marker and press F / tap 🚗.
// Nearby points get a glowing light-column marker; points with a blip show on
// the minimap.
import * as THREE from 'three';

const MARKER_POOL = 28;

function makeMarkerMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 0.8, 0.3) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.55 + 0.45 * sin(uTime * 3.0 + vUv.y * 6.0));
        float ring = smoothstep(0.0, 0.06, vUv.y) ; gl_FragColor = vec4(uColor * a * 1.8 * ring, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export class Interactions {
  constructor(scene, hm) {
    this.hm = hm;
    this.points = [];
    this.pool = [];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < MARKER_POOL; i++) {
      const m = new THREE.Mesh(geo, makeMarkerMaterial());
      m.visible = false; m.frustumCulled = false; m.renderOrder = 4; m.userData.noReflect = true;
      scene.add(m);
      this.pool.push(m);
    }
    this.t = 0; this.scan = 0; this.near = [];
    this.current = null; this.hold = 0; this.fired = false;
  }

  // p: { x, z, y?, r, label, use(), show?(), color, blip?: {color, size, global}, drive?: bool, height }
  add(p) {
    p.r = p.r || 2.2;
    if (p.y === undefined) p.y = this.hm.height(p.x, p.z);
    p.color = new THREE.Color(p.color ?? 0xffc040);
    this.points.push(p);
    return p;
  }
  remove(p) { const i = this.points.indexOf(p); if (i >= 0) this.points.splice(i, 1); }

  visible(p) { return !p.show || p.show(); }

  // Returns the prompt for the closest point in reach (and triggers it on F)
  update(dt, pos, inCar, enterPressed, speed = 0) {
    this.t += dt;
    if ((this.scan -= dt) <= 0) {
      this.scan = 0.25;
      this.near = this.points.filter((p) => this.visible(p) && Math.abs(p.x - pos.x) < 140 && Math.abs(p.z - pos.z) < 140 && Math.abs(p.y - pos.y) < 60)
        .sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
      this.marked = this.near.filter((p) => p.marker !== false).slice(0, MARKER_POOL);
    }
    this.pool.forEach((m, i) => {
      const p = this.marked && this.marked[i];
      m.visible = !!p;
      if (!p) return;
      m.position.set(p.x, p.y + 0.05, p.z);
      m.scale.set(p.r * 0.45, p.height || (p.drive ? 3 : 1.6), p.r * 0.45);
      m.material.uniforms.uColor.value.copy(p.color);
      m.material.uniforms.uTime.value = this.t;
    });
    let best = null, bd = 1e9;
    for (const p of this.near) {
      if (p.r < 0.5) break;
      if (!!p.drive !== !!inCar && !p.any) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < p.r && d < bd) { bd = d; best = p; }
    }
    if (best !== this.current) { this.hold = 0; this.fired = false; }
    this.current = best;
    if (!best) return '';
    const label = typeof best.label === 'function' ? best.label() : best.label;
    if (inCar && best.drive) {
      // drive-in points trigger once the car has stopped inside the marker
      if (Math.abs(speed) < 1.5) this.hold += dt; else this.hold = 0;
      if (this.hold > 0.6 && !this.fired) { this.fired = true; best.use(); return ''; }
      return this.fired ? '' : `${label} — stop in the marker`;
    }
    if (enterPressed) { best.use(); return ''; }
    return label;
  }

  blips(pos) {
    const out = [];
    for (const p of this.points) {
      if (!p.blip || !this.visible(p)) continue;
      if (!p.blip.global && Math.hypot(p.x - pos.x, p.z - pos.z) > 900) continue;
      out.push({ x: p.x, z: p.z, color: p.blip.color || '#ffc040', size: p.blip.size || 4, icon: p.blip.icon });
    }
    return out;
  }
}
