// Power lines along the main dirt roads: wooden poles with crossarms and insulators, three
// wires per span sagging between them (and swaying a touch in the wind). Built once for the whole
// island — about a thousand poles is one instanced draw plus one line draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, roadPoint, heightAt } from './terrain.js';
import { waterLevelAt } from './physics.js';

const SPAN = 46;      // m between poles
const SIDE = 6.5;     // m from the road centre
const TOP = 8.6;      // crossarm height

function poleGeometry() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.11, 0.15, 9.2, 8); pole.translate(0, 4.6, 0); parts.push(pole);
  const arm = new THREE.BoxGeometry(2.3, 0.13, 0.13); arm.translate(0, TOP, 0); parts.push(arm);
  for (const x of [-0.95, 0, 0.95]) { const ins = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 8); ins.translate(x, TOP + 0.17, 0); parts.push(ins); }
  const brace = new THREE.BoxGeometry(0.06, 0.06, 1.1); brace.rotateX(0.0); brace.rotateZ(0.7); brace.translate(0.3, TOP - 0.35, 0); parts.push(brace);
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  g.computeVertexNormals();
  return g;
}

export class PowerLines {
  constructor(scene, physics, T) {
    const poles = [];
    for (const R of ROADS) {
      if (!R.power) continue;
      const n = Math.floor(((R.t1 - R.t0) * R.len) / SPAN);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = R.t0 + (i * SPAN) / R.len;
        const [x, z] = roadPoint(R, t, SIDE);
        const [x2, z2] = roadPoint(R, Math.min(1, t + 0.002), SIDE);
        const h = heightAt(x, z);
        if (waterLevelAt(x, z, h) !== null) { prev = null; continue; }
        const yaw = Math.atan2(x2 - x, z2 - z) + Math.PI / 2; // crossarm across the line
        const p = { x, y: h - 0.4, z, yaw, lean: (Math.sin(i * 12.9898 + R.seed) * 0.5) * 0.04 };
        poles.push(p);
        if (prev) p.prev = prev;
        prev = p;
      }
    }
    // poles: one instanced mesh
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b5640, roughness: 0.92, map: T && T.wood ? T.wood.map : null, normalMap: T && T.wood ? T.wood.nr : null });
    const mesh = new THREE.InstancedMesh(poleGeometry(), mat, Math.max(1, poles.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    poles.forEach((p, i) => { e.set(p.lean, p.yaw, p.lean * 0.5, 'YXZ'); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m4); });
    mesh.count = poles.length;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    // wires: three per span, each a sagging curve
    const pts = [];
    const SEG = 8;
    for (const p of poles) {
      if (!p.prev) continue;
      const a = p.prev, b = p;
      for (const off of [-0.95, 0, 0.95]) {
        const ax = a.x + Math.cos(a.yaw) * off, az = a.z - Math.sin(a.yaw) * off, ay = a.y + TOP + 0.28;
        const bx = b.x + Math.cos(b.yaw) * off, bz = b.z - Math.sin(b.yaw) * off, by = b.y + TOP + 0.28;
        const span = Math.hypot(bx - ax, bz - az), sag = span * 0.035;
        for (let k = 0; k < SEG; k++) {
          for (const u of [k / SEG, (k + 1) / SEG]) pts.push(ax + (bx - ax) * u, ay + (by - ay) * u - Math.sin(Math.PI * u) * sag, az + (bz - az) * u);
        }
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 }));
    this.wires.frustumCulled = false;
    scene.add(this.wires);
    this.mesh = mesh;
    this.count = poles.length;
    if (physics && physics.addTrunks) physics.addTrunks('powerlines', poles.map((p) => ({ x: p.x, z: p.z, r: 0.16, h: 9, base: p.y, kind: 'wood' })));
  }
}
