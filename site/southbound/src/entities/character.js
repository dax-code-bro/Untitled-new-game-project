// Procedural humanoid with a simple procedural walk/run/swim/jump animation.
import * as THREE from 'three';

export function createCharacter(opts = {}) {
  const skin = new THREE.MeshStandardMaterial({ color: opts.skin ?? 0xc68e6a, roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: opts.shirt ?? 0x3b5c7a, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: opts.pants ?? 0x2b2f38, roughness: 0.9 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: opts.hair ?? 0x2a1d14, roughness: 0.9 });

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const cast = (m) => { m.castShadow = true; return m; };

  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), shirt));
  torso.scale.set(1.12, 1, 0.72);
  torso.position.y = 0.36;
  hips.add(torso);
  const pelvis = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.1, 4, 8), pants));
  pelvis.scale.set(1.15, 1, 0.8);
  pelvis.position.y = 0.02;
  hips.add(pelvis);
  const neck = new THREE.Group();
  neck.position.y = 0.72;
  hips.add(neck);
  const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin));
  head.scale.set(0.95, 1.1, 1.0);
  head.position.y = 0.14;
  neck.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 0.16;
  hairCap.rotation.x = -0.25;
  neck.add(hairCap);

  const limb = (r, len, mat) => {
    const g = new THREE.Group();
    const m = cast(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat));
    m.position.y = -len / 2 - r * 0.4;
    g.add(m);
    return g;
  };
  const makeArm = (side) => {
    const sh = limb(0.06, 0.24, shirt);
    sh.position.set(0.27 * side, 0.6, 0);
    const el = limb(0.05, 0.22, skin);
    el.position.y = -0.33;
    sh.add(el);
    hips.add(sh);
    return { sh, el };
  };
  const makeLeg = (side) => {
    const hp = limb(0.085, 0.36, pants);
    hp.position.set(0.11 * side, -0.02, 0);
    const kn = limb(0.07, 0.36, pants);
    kn.position.y = -0.46;
    hp.add(kn);
    const foot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), shoes));
    foot.position.set(0, -0.48, 0.05);
    kn.add(foot);
    hips.add(hp);
    return { hp, kn };
  };
  const armL = makeArm(-1), armR = makeArm(1), legL = makeLeg(-1), legR = makeLeg(1);

  let phase = 0, blend = 0;
  return {
    root,
    animate(dt, speed, state) {
      // state: 'ground' | 'air' | 'swim'
      const moving = Math.min(speed / 6.5, 1.4);
      blend += (moving - blend) * Math.min(1, dt * 8);
      phase += dt * (2.2 + speed * 1.45);
      const s = Math.sin(phase), c = Math.cos(phase);
      const amp = 0.25 + blend * 0.6;
      if (state === 'swim') {
        hips.rotation.x = 1.25;
        hips.position.y = 0.55;
        armL.sh.rotation.x = Math.sin(phase * 0.8) * 1.6 - 1.2; armR.sh.rotation.x = -Math.sin(phase * 0.8) * 1.6 - 1.2;
        legL.hp.rotation.x = s * 0.4; legR.hp.rotation.x = -s * 0.4;
        legL.kn.rotation.x = legR.kn.rotation.x = 0.2;
        return;
      }
      hips.rotation.x = blend * 0.12;
      if (state === 'air') {
        legL.hp.rotation.x = -0.6; legR.hp.rotation.x = 0.3; legL.kn.rotation.x = 0.9; legR.kn.rotation.x = 0.4;
        armL.sh.rotation.x = -0.4; armR.sh.rotation.x = -0.4; armL.sh.rotation.z = -0.5; armR.sh.rotation.z = 0.5;
        hips.position.y = 0.95;
        return;
      }
      const idle = blend < 0.05;
      const breathe = Math.sin(performance.now() * 0.002) * 0.01;
      hips.position.y = 0.95 + (idle ? breathe : Math.abs(c) * 0.05 * blend - 0.02 * blend);
      legL.hp.rotation.x = s * amp * blend * 1.3;
      legR.hp.rotation.x = -s * amp * blend * 1.3;
      legL.kn.rotation.x = Math.max(0, -c) * amp * 1.6 * blend + 0.05;
      legR.kn.rotation.x = Math.max(0, c) * amp * 1.6 * blend + 0.05;
      armL.sh.rotation.x = -s * amp * blend;
      armR.sh.rotation.x = s * amp * blend;
      armL.sh.rotation.z = -0.08; armR.sh.rotation.z = 0.08;
      armL.el.rotation.x = armR.el.rotation.x = -0.25 - blend * 0.6;
      neck.rotation.x = -blend * 0.1;
    },
  };
}
