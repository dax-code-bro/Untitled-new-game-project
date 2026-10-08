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

  blood(pos) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x6a0a0a, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.03, pos.z + (Math.random() - 0.5) * 0.4);
    m.scale.set(0.12, 0.02, 0.12);
    this.scene.add(m);
    this.items.push({ obj: m, life: 40, max: 40, grow: 0, rise: 0, op: 0.9, flat: true });
  }

  explosion(pos, r) {
    this.puff(pos, 0xffb040, r * 0.35, 0.35, 0, 2.5, 1);
    this.puff(pos, 0xff6020, r * 0.25, 0.5, 1, 3, 0.9);
    for (let i = 0; i < 6; i++) this.puff(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * r, Math.random() * r * 0.5, (Math.random() - 0.5) * r)), 0x3a3530, r * 0.18, 2.5, 1.5, 3, 0.6);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      it.obj.material.opacity = (it.op ?? 0.9) * k;
      if (it.grow && !it.flat) it.obj.scale.setScalar(it.size * (1 + (1 - k) * it.grow));
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
