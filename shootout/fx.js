// Shootout — particle effects: muzzle flash, gun smoke, sparks, splinters, blood.

const FX = (() => {
  const live = [];

  let glowTex, puffTex;
  function textures() {
    if (glowTex) return;
    glowTex = Util.canvasTexture(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,190,80,0.9)');
      gr.addColorStop(0.6, 'rgba(255,90,10,0.35)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    puffTex = Util.canvasTexture(128, 128, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        const x = w / 2 + (Math.random() - 0.5) * 40, y = h / 2 + (Math.random() - 0.5) * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, 40);
        gr.addColorStop(0, 'rgba(200,195,185,0.35)'); gr.addColorStop(1, 'rgba(200,195,185,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    });
  }

  Engine.onUpdate(dt => {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.obj.parent && p.obj.parent.remove(p.obj);
        if (p.obj.material && p.obj.material.dispose && p.ownMat) p.obj.material.dispose();
        live.splice(i, 1);
        continue;
      }
      if (p.vel) {
        p.vel.y -= (p.gravity || 0) * dt;
        p.vel.multiplyScalar(1 - (p.drag || 0) * dt);
        p.obj.position.addScaledVector(p.vel, dt);
        if (p.floor !== undefined && p.obj.position.y < p.floor) {
          p.obj.position.y = p.floor; p.vel.set(0, 0, 0); p.spin = 0;
        }
      }
      if (p.spin) { p.obj.rotation.x += p.spin * dt; p.obj.rotation.z += p.spin * 0.7 * dt; }
      if (p.update) p.update(t, p);
    }
  });

  function add(scene, obj, opts) {
    scene.add(obj);
    live.push(Object.assign({ obj, age: 0, life: 1 }, opts));
  }

  // Bright flash at the muzzle: a glowing sprite plus a brief point light.
  function muzzleFlash(scene, pos, size = 0.35) {
    textures();
    const mat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos); s.scale.setScalar(size);
    add(scene, s, { life: 0.12, ownMat: true, update: t => { s.scale.setScalar(size * (1 + t)); mat.opacity = 1 - t; } });
    const light = new THREE.PointLight(0xffb060, 6, 6, 2);
    light.position.copy(pos);
    add(scene, light, { life: 0.1, update: t => { light.intensity = 6 * (1 - t); } });
  }

  function smoke(scene, pos, dir, count = 10, scale = 1) {
    textures();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.6 });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      const v = dir.clone().multiplyScalar(0.3 + Math.random() * 0.6)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2));
      const life = 1.4 + Math.random() * 1.4;
      add(scene, s, {
        vel: v, drag: 1.5, life, ownMat: true,
        update: t => { s.scale.setScalar((0.08 + t * 0.5) * scale); mat.opacity = 0.55 * (1 - t); },
      });
    }
  }

  // Small chunks flying out: sparks, wood splinters or blood drops.
  function burst(scene, pos, { count = 20, color = 0xffd080, size = 0.012, speed = 2, dir = null, spread = 1, gravity = 6, life = 0.8, floor, emissive = false } = {}) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive ? 1.5 : 0, roughness: 0.6 });
    const geo = new THREE.BoxGeometry(size, size, size * 2.2);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(spread);
      if (dir) v.add(dir);
      v.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      add(scene, m, { vel: v, gravity, drag: 0.6, spin: (Math.random() - 0.5) * 20, life: life * (0.6 + Math.random() * 0.8), floor });
    }
  }

  function blood(scene, pos, dir, floor = 0) {
    burst(scene, pos, { count: 40, color: 0x7a0000, size: 0.014, speed: 2.4, dir: dir.clone().multiplyScalar(1.5), spread: 0.8, gravity: 9, life: 1.6, floor });
  }

  return { muzzleFlash, smoke, burst, blood };
})();
