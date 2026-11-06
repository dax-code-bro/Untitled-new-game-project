// Street life, batch one: the little things that make a street feel lived in.
//  - Pigeons: small flocks pecking about on the pavements; they burst up and away when you run at
//    them, a car goes by close or a shot's fired, and settle again somewhere else later.
//  - Umbrellas: when it rains most people out walking put one up.
//  - Joggers, mornings and evenings.
//  - People stood about looking at their phones.
//  - Food carts on the downtown corners (a vendor and a cart; the Gulf Mart menu, a little cheaper).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Human } from '../entities/human.js';
import { CITY } from '../world/layout.js';
import { attachToBone, bodyMetres, suitMesh } from '../entities/clothing.js';
import { keyHint } from './world-util.js';

const FLOCKS = 6, PER = 8;

export function installAmbient(game) {
  const { scene, peds, player, S, hud, interact, lib } = game;
  const rnd = Math.random;

  // ---------------- pigeons
  const body = new THREE.SphereGeometry(0.09, 8, 6).scale(1, 0.8, 1.6).translate(0, 0.1, 0);
  const head = new THREE.SphereGeometry(0.045, 8, 6).translate(0, 0.17, 0.12);
  const tail = new THREE.BoxGeometry(0.08, 0.015, 0.1).translate(0, 0.1, -0.16);
  const birdGeo = mergeGeometries([body, head, tail].map((g) => g.toNonIndexed()));
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshStandardMaterial({ color: 0x7c7f86, roughness: 0.8 }), FLOCKS * PER);
  birds.castShadow = true; birds.userData.noHit = true; birds.frustumCulled = false;
  scene.add(birds);
  const flocks = Array.from({ length: FLOCKS }, () => ({ x: 0, z: 0, y: 0, placed: false, up: 0, away: 0, birds: Array.from({ length: PER }, () => ({ ox: 0, oz: 0, h: rnd() * 6.28, t: rnd() * 5, vy: 0, vx: 0, vz: 0, y: 0 })) }));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const placeFlock = (f) => {
    // a pavement corner somewhere near you, in town
    const G = CITY, pp = player.pos;
    for (let k = 0; k < 20; k++) {
      const i = Math.floor((pp.x - G.x0) / G.pitch + (rnd() - 0.5) * 3), j = Math.floor((pp.z - G.z0) / G.pitch + (rnd() - 0.5) * 3);
      if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) continue;
      const cx = G.x0 + (i + 0.5) * G.pitch, cz = G.z0 + (j + 0.5) * G.pitch, half = (G.pitch - G.street) / 2 - 2.5;
      const x = cx + (rnd() < 0.5 ? -1 : 1) * half * (0.3 + rnd() * 0.7), z = cz + (rnd() < 0.5 ? -1 : 1) * half;
      if (Math.hypot(x - pp.x, z - pp.z) < 25) continue;
      f.x = x; f.z = z; f.y = game.collision.surface(x, z, 50); f.placed = true; f.up = 0;
      for (const b of f.birds) { b.ox = (rnd() - 0.5) * 3; b.oz = (rnd() - 0.5) * 3; b.y = 0; b.vy = 0; }
      return;
    }
    f.placed = false;
  };
  const scatter = (f) => {
    if (f.up > 0) return;
    f.up = 18 + rnd() * 12; // back in a while, somewhere else
    for (const b of f.birds) { const a = rnd() * 6.28; b.vx = Math.cos(a) * (3 + rnd() * 3); b.vz = Math.sin(a) * (3 + rnd() * 3); b.vy = 3 + rnd() * 2.5; }
    if (Math.hypot(f.x - player.pos.x, f.z - player.pos.z) < 30) game.audio?.flap?.();
  };
  function updateBirds(dt) {
    const inTown = player.pos.x > CITY.x0 - 60 && player.pos.x < CITY.x0 + CITY.nx * CITY.pitch + 60 && player.pos.z > CITY.z0 - 60 && player.pos.z < CITY.z0 + CITY.nz * CITY.pitch + 60;
    birds.visible = inTown && !S.indoors;
    if (!birds.visible) return;
    const shot = performance.now() - (game.combat?.firedAt || -1e9) < 400;
    const cars = [S.vehicle, ...(game.traffic?.cars || []).map((c) => c.v)].filter(Boolean);
    let n = 0;
    for (const f of flocks) {
      if (!f.placed || Math.hypot(f.x - player.pos.x, f.z - player.pos.z) > 160) placeFlock(f);
      if (f.up > 0) { f.up -= dt; if (f.up <= 0) placeFlock(f); }
      else if (f.placed) {
        const dp = Math.hypot(f.x - player.pos.x, f.z - player.pos.z);
        if ((dp < 4.5 && player.speed > 2.2) || dp < 1.6 || (shot && dp < 70)) scatter(f);
        else for (const v of cars) if (Math.abs(v.speed || 0) > 4 && Math.hypot(v.pos.x - f.x, v.pos.z - f.z) < 7) { scatter(f); break; }
      }
      for (const b of f.birds) {
        b.t += dt;
        let x = f.x + b.ox, z = f.z + b.oz, y = f.y, sc = 1;
        if (f.up > 0) { b.ox += b.vx * dt; b.oz += b.vz * dt; b.y += b.vy * dt; b.vy += 0.6 * dt; y += b.y; sc = 1 + Math.sin(b.t * 30) * 0.15; b.h = Math.atan2(b.vx, b.vz); }
        else { // pecking about: little hops and turns
          if (Math.sin(b.t * 1.7 + b.ox) > 0.97) { b.h += (rnd() - 0.5) * 1.5; b.ox += Math.sin(b.h) * 0.12; b.oz += Math.cos(b.h) * 0.12; }
          y += Math.max(0, Math.sin(b.t * 9)) * 0.02;
        }
        if (!f.placed) { _s.setScalar(0); } else _s.set(sc, 1, 1);
        _q.setFromAxisAngle(Y, b.h); _p.set(x, y, z);
        birds.setMatrixAt(n++, _m.compose(_p, _q, _s));
      }
    }
    birds.instanceMatrix.needsUpdate = true;
  }

  // ---------------- umbrellas, joggers, phones
  const umbrellaGeo = mergeGeometries([new THREE.ConeGeometry(0.55, 0.28, 10, 1, true).translate(0, 0.14, 0).toNonIndexed(), new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6).translate(0, -0.3, 0).toNonIndexed()]);
  const umbrellaMats = [0x1b1b1d, 0x2c3e66, 0x6a1f22, 0x2f5a3a, 0x8a7a40].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide }));
  const phoneGeo = new THREE.BoxGeometry(0.075, 0.15, 0.01), phoneMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.3, emissive: 0x1a3a5a, emissiveIntensity: 0.25 });
  let rollT = 0;
  function dress(dt) {
    if ((rollT -= dt) > 0) return;
    rollT = 0.7;
    const rain = game.weather?.rain || 0, h = game.sky.hour;
    const jogHours = (h > 6 && h < 8.5) || (h > 17 && h < 19.5);
    for (const p of peds.list) {
      if (p.mode === 'dead' || p.role === 'cop' || p.scripted || p.h.ragdoll) continue;
      const near = p.pos.distanceTo(player.pos) < 60;
      // umbrellas up in the rain (and down when it stops)
      if (rain > 0.25 && near && p.umbrella === undefined) {
        p.umbrella = rnd() < 0.7 ? new THREE.Mesh(umbrellaGeo, umbrellaMats[(rnd() * umbrellaMats.length) | 0]) : null;
        if (p.umbrella) { p.umbrella.position.set(0.12, 2.0, 0.08); p.umbrella.rotation.z = -0.12; p.umbrella.userData.noHit = true; p.h.root.add(p.umbrella); }
      } else if (rain < 0.1 && p.umbrella !== undefined) { if (p.umbrella) p.h.root.remove(p.umbrella); p.umbrella = undefined; }
      if (p.umbrella && (p.mode === 'flee')) { p.h.root.remove(p.umbrella); p.umbrella = null; } // dropped it and ran
      // a jogger now and then, mornings and evenings (the generic walkers; residents keep their pace)
      if (!p.ambRolled) {
        p.ambRolled = true;
        if (jogHours && !p.role && rnd() < 0.18) { p.speed = 2.8 + rnd() * 0.7; p.jogger = true; }
        // some people on their phones
        if (!p.jogger && rnd() < 0.3) {
          const mesh = suitMesh(p.h);
          if (mesh) { const ph = new THREE.Mesh(phoneGeo, phoneMat); ph.userData.noHit = true; if (attachToBone(mesh, 'wristR', ph, [-0.62, 0.17, 0.04], bodyMetres(p.h, mesh))) p.phoneProp = ph; /* (bind-pose hand position) */ }
        }
      }
    }
  }

  // ---------------- food carts downtown
  const carts = [];
  const cartSpots = [[2, 2], [5, 1], [3, 4], [6, 4]].map(([i, j]) => [CITY.x0 + i * CITY.pitch + 9, CITY.z0 + j * CITY.pitch + 9]);
  const cartMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c4, roughness: 0.35, metalness: 0.6 });
  const awnMat = new THREE.MeshStandardMaterial({ color: 0xc23a2a, roughness: 0.6, side: THREE.DoubleSide });
  for (const [x, z] of cartSpots) {
    const g = new THREE.Group();
    const y = game.collision.surface(x, z, 50);
    g.position.set(x, y, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.8), cartMat); box.position.y = 0.75; g.add(box);
    for (const sx of [-0.6, 0.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.22, 0.42); g.add(w); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), cartMat); pole.position.set(0, 1.9, 0); g.add(pole);
    const awn = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 8, 1, true), awnMat); awn.position.set(0, 2.6, 0); g.add(awn);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = false; } });
    scene.add(g);
    game.collision.addBox(x - 0.85, z - 0.45, x + 0.85, z + 0.45, y, y + 1.2);
    const vendor = new Human(lib, lib.peopleIds[(carts.length * 3) % lib.peopleIds.length]);
    vendor.root.position.set(x, y, z - 0.9); vendor.root.rotation.y = Math.PI; vendor.play('Idle_Loop', 0); scene.add(vendor.root);
    carts.push({ g, vendor, x, z });
    interact.add({ x, z: z + 1.2, r: 1.8, marker: false, show: () => S.mode === 'foot', label: () => `${keyHint(game)} buy something from the cart`,
      use: () => { if (game.mart) { game.mart.k = 0.85; game.mart.show('here', 'Street cart'); } } });
  }

  return {
    update(dt) {
      updateBirds(dt);
      dress(dt);
      for (const c of carts) { const d = c.vendor.root.position.distanceTo(player.pos); c.vendor.root.visible = d < 120; if (d < 60) c.vendor.update(dt); }
    },
    get pigeons() { return flocks.filter((f) => f.placed && f.up <= 0).length; },
    scatterAll() { for (const f of flocks) scatter(f); },
  };
}
