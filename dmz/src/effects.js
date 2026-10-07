// Short-lived visual effects: tracers, impact puffs, muzzle flashes, smoke.
import * as THREE from 'three';

const puffGeo = new THREE.IcosahedronGeometry(1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  tracer(a, b, color = 0xffd27a, life = 0.07) {
    const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, fog: true });
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.items.push({ obj: line, life, max: life, grow: 0, rise: 0 });
  }

  puff(p, color, size = 0.12, life = 0.35, rise = 0, grow = 2.5, opacity = 0.9) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(puffGeo, m);
    mesh.position.copy(p);
    mesh.scale.setScalar(size);
    this.scene.add(mesh);
    this.items.push({ obj: mesh, life, max: life, grow, rise, size, op: opacity });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      it.obj.material.opacity = (it.op ?? 0.9) * k;
      if (it.grow) it.obj.scale.setScalar(it.size * (1 + (1 - k) * it.grow));
      if (it.rise) it.obj.position.y += it.rise * dt;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.geometry !== puffGeo) it.obj.geometry.dispose();
        it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
