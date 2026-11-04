// The parts of the city nobody plans: stray dogs working the sidewalks and
// dumpsters, rats and mice in the alleys (more of them at night), and homeless camps
// tucked against walls: a tent or a tarp, a shopping cart, boxes, and someone
// sitting there. People react: they step around dogs, jump at rats, and you
// can spare some change.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadOpen } from '../assets/open.js';
import { CITY } from '../world/layout.js';
import { Human } from '../entities/human.js';
import { keyHint } from './world-util.js';

const pick = (a) => a[(Math.random() * a.length) | 0];

export function installStrays(game) {
  const { scene, collision, graph, player, peds, hud, interact, career, S, lib, sky, q } = game;
  let seed = 9091; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const inBuilding = (x, z, m = 0.3) => { let hit = false; collision.query(x, z, 2, (it) => { if (it.t === 0 && x > it.minX - m && x < it.maxX + m && z > it.minZ - m && z < it.maxZ + m) hit = true; }); return hit; };
  const nearWall = (x, z) => { let w = false; collision.query(x, z, 4, (it) => { if (it.t === 0 && x > it.minX - 2.5 && x < it.maxX + 2.5 && z > it.minZ - 2.5 && z < it.maxZ + 2.5) w = true; }); return w; };
  const ground = (x, z, y = 30) => collision.surface(x, z, y + 3);
  const blockW = CITY.pitch - CITY.street;

  // ---------------- spots in the alleys (against walls, inside the blocks)
  const alley = [];
  for (const bl of game.city.cityBlocks || []) {
    if (bl.type !== 'build') continue;
    for (let k = 0; k < 40 && alley.length < 400; k++) {
      const x = bl.cx + (rnd() - 0.5) * (blockW - 6), z = bl.cz + (rnd() - 0.5) * (blockW - 6);
      if (!inBuilding(x, z, 0.6) && nearWall(x, z)) { alley.push([x, z]); if (rnd() < 0.5) break; }
    }
  }
  // sidewalks: just off the city streets
  const walks = [];
  for (const e of graph.edges) {
    if (!(e.a[0] === 'c' && e.b[0] === 'c')) continue;
    for (let i = 1; i < e.pts.length; i += 2) {
      const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i];
      const L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L, s = rnd() < 0.5 ? 1 : -1, off = (e.width || 10) / 2 + 1.8;
      const x = ax - tz * s * off, z = az + tx * s * off;
      if (!inBuilding(x, z)) walks.push([x, z]);
    }
  }

  // ---------------- homeless camps
  const camps = [];
  const nCamps = q.label === 'Phone' ? 5 : 10;
  const tarps = [0x2f5a8a, 0x5a6a3a, 0x8a3a2a, 0x6b6b6b];
  for (let i = 0; i < nCamps && alley.length; i++) {
    const [x, z] = alley.splice((rnd() * alley.length) | 0, 1)[0];
    const y = ground(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rnd() * 6.28;
    const M = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const add = (geo, m, px, py, pz, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; o.userData.noHit = true; g.add(o); return o; };
    if (rnd() < 0.6) { const t = add(new THREE.ConeGeometry(1.1, 1.3, 4), M(pick(tarps), 0.8), 0, 0.65, -0.6, Math.PI / 4); t.scale.set(1, 1, 1.4); }
    else { const tarp = add(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshStandardMaterial({ color: pick(tarps), roughness: 0.8, side: THREE.DoubleSide }), 0, 0.9, -0.6); tarp.rotation.x = -0.9; }
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.5 + rnd() * 0.3, 0.3 + rnd() * 0.3, 0.4), M(0x9a7a50), -1.2 + rnd() * 0.3, 0.2 + k * 0.05, 0.5 - k * 0.45, rnd());
    // shopping cart: basket and wheels
    const wire = M(0xb8bcc0, 0.4); wire.metalness = 0.8;
    add(new THREE.BoxGeometry(0.55, 0.45, 0.85), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.8, roughness: 0.4, wireframe: true }), 1.3, 0.75, 0.2);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), M(0x111111), 1.3 + a * 0.24, 0.07, 0.2 + b * 0.36).rotation.z = Math.PI / 2;
    add(new THREE.BoxGeometry(0.75, 0.12, 1.9), M(0x3a4a6a, 0.95), -0.2, 0.06, 0.6); // sleeping bag
    scene.add(g);
    camps.push({ x, z, y, g, rot: g.rotation.y, gave: 0 });
  }
  // the people at the camps: a small pool of figures for the camps near you
  const sitters = [];
  for (let i = 0; i < Math.min(4, camps.length); i++) {
    const h = new Human(lib, lib.peopleIds[(i * 2 + 1) % lib.peopleIds.length]);
    h.play('Sitting_Idle_Loop', 0); h.model.position.y = -0.42; // on the ground, not on a chair
    h.root.visible = false; scene.add(h.root);
    sitters.push({ h, camp: null });
  }
  const SPARE = ['"God bless you, man."', '"Thank you, brother. Stay safe out there."', '"Appreciate it. Watch the cops on Harbor tonight."', '"That\'s a hot meal. Thank you."'];
  for (const c of camps) {
    interact.add({ x: c.x, z: c.z, r: 2.4, marker: false, show: () => S.mode === 'foot' && !!c.sitter,
      label: () => `${keyHint(game)} spare some change ($5)`,
      use: () => {
        if (!career.spend(5)) return;
        c.gave++; hud.toast(pick(SPARE), 2.5);
        if (c.gave === 3) setTimeout(() => hud.toast('"You\'re alright. Here, I found this." (+$20 lottery scratch-off)', 3), 1200), career.earn?.(20, 'a scratch-off');
      } });
  }

  // ---------------- stray dogs
  const dogs = [];
  const nDogs = q.label === 'Phone' ? 3 : 6;
  (async () => {
    const kinds = await Promise.all(['real/zk_animals/Characters_GermanShepherd.glb', 'real/zk_animals/Characters_Pug.glb'].map(loadOpen));
    for (let i = 0; i < nDogs && walks.length; i++) {
      const src = kinds[i % 3 === 2 ? 1 : 0]; if (!src) continue;
      const m = cloneSkinned(src.scene);
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
      const k = (src === kinds[1] ? 0.32 : 0.62) / Math.max(0.01, size.y); m.scale.setScalar(k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; o.frustumCulled = false; } });
      const root = new THREE.Group(); root.add(m); scene.add(root);
      const mixer = new THREE.AnimationMixer(m);
      const clip = (n) => src.animations.find((a) => a.name.endsWith(n));
      const act = {}; for (const n of ['Idle', 'Walk', 'Run', 'Eating', 'Idle_2_HeadLow']) { const c = clip(n); if (c) act[n] = mixer.clipAction(c); }
      const [x, z] = walks[(rnd() * walks.length) | 0];
      const d = { root, mixer, act, cur: null, pos: new THREE.Vector3(x, ground(x, z), z), heading: rnd() * 6.28, target: null, wait: 2, speed: 0, small: src === kinds[1] };
      const play = (n) => { const a = d.act[n] || d.act.Idle; if (!a || d.cur === a) return; a.reset().play(); if (d.cur) d.cur.crossFadeTo(a, 0.25, false); d.cur = a; };
      d.play = play; play('Idle');
      dogs.push(d);
    }
  })();

  // ---------------- rats
  const rats = [];
  const nRats = q.label === 'Phone' ? 8 : 18;
  const ratMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95 }), tailMat = new THREE.MeshStandardMaterial({ color: 0xb08a80, roughness: 0.7 });
  // and house mice: half the size, sandy grey, bigger ears, quicker, and they freeze before they bolt
  const mouseMat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.95 });
  const nMice = q.label === 'Phone' ? 4 : 12;
  for (let i = 0; i < nRats + nMice && alley.length; i++) {
    const mouse = i >= nRats;
    const [x, z] = alley[(rnd() * alley.length) | 0];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mouse ? mouseMat : ratMat); body.scale.set(0.8, 0.7, 1.6); body.position.y = 0.05; g.add(body);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 8), mouse ? mouseMat : ratMat); head.rotation.x = Math.PI / 2; head.position.set(0, 0.05, 0.12); g.add(head);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(mouse ? 0.022 : 0.014, 6, 4), tailMat); ear.position.set(s * (mouse ? 0.03 : 0.025), mouse ? 0.09 : 0.085, 0.09); g.add(ear); }
    if (mouse) g.scale.setScalar(0.5);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.16, 5), tailMat); tail.rotation.x = Math.PI / 2 - 0.25; tail.position.set(0, 0.035, -0.17); g.add(tail);
    g.traverse((o) => { if (o.isMesh) o.userData.noHit = true; });
    scene.add(g);
    rats.push({ g, pos: new THREE.Vector3(x, ground(x, z), z), home: [x, z], target: null, heading: rnd() * 6.28, t: rnd() * 5, tail, mouse });
  }

  const _v = new THREE.Vector3();
  return {
    camps, dogs, rats,
    update(dt) {
      const pp = player.pos, night = sky.hour < 6 || sky.hour > 20;
      // camp figures go to the nearest camps
      const near = camps.map((c) => [Math.hypot(c.x - pp.x, c.z - pp.z), c]).sort((a, b) => a[0] - b[0]).slice(0, sitters.length).filter(([d]) => d < 90).map(([, c]) => c);
      for (const c of camps) c.sitter = null;
      sitters.forEach((s, i) => {
        const c = near[i];
        if (!c) { s.h.root.visible = false; return; }
        c.sitter = s;
        s.h.root.visible = true;
        s.h.root.position.set(c.x + Math.sin(c.rot) * 0.4, c.y, c.z + Math.cos(c.rot) * 0.4);
        s.h.root.rotation.y = Math.atan2(pp.x - c.x, pp.z - c.z) * 0.3 + c.rot;
        s.h.update(dt);
      });
      // dogs: trot between sidewalk spots, sniff around, bolt from gunfire and running
      for (const d of dogs) {
        const dist = d.pos.distanceTo(pp);
        d.root.visible = dist < 120;
        if (!d.root.visible) continue;
        const scared = (game.combat.drawn && player.aiming && dist < 15) || (player.speed > 5.5 && dist < 4);
        if (scared && d.speed < 3) { const a = Math.atan2(d.pos.x - pp.x, d.pos.z - pp.z); d.target = [d.pos.x + Math.sin(a) * 25, d.pos.z + Math.cos(a) * 25]; d.speed = 5.5; d.wait = 0; }
        if (!d.target) {
          if ((d.wait -= dt) <= 0) { const w = walks[(Math.random() * walks.length) | 0]; if (Math.hypot(w[0] - d.pos.x, w[1] - d.pos.z) < 60) { d.target = w; d.speed = 1.3; } d.wait = 1; }
          d.play(Math.sin(performance.now() / 3000 + d.pos.x) > 0.3 ? 'Idle_2_HeadLow' : 'Idle');
        } else {
          const dx = d.target[0] - d.pos.x, dz = d.target[1] - d.pos.z, L = Math.hypot(dx, dz);
          if (L < 0.6) { d.target = null; d.wait = 2 + Math.random() * 6; d.speed = 0; }
          else {
            d.heading += Math.atan2(Math.sin(Math.atan2(dx, dz) - d.heading), Math.cos(Math.atan2(dx, dz) - d.heading)) * Math.min(1, dt * 5);
            d.pos.x += Math.sin(d.heading) * d.speed * dt; d.pos.z += Math.cos(d.heading) * d.speed * dt;
            const r = collision.resolve(d.pos.x, d.pos.z, 0.3, d.pos.y, 0.8); if (r.hit) d.target = null; d.pos.x = r.x; d.pos.z = r.z;
            d.pos.y = ground(d.pos.x, d.pos.z, d.pos.y);
            d.play(d.speed > 3 ? 'Run' : 'Walk');
          }
        }
        d.root.position.copy(d.pos); d.root.rotation.y = d.heading;
        d.mixer.update(dt * (d.small ? 1.4 : 1));
        // people step around dogs; a few back right off
        for (const p of peds.list) {
          if (p.role || p.mode === 'dead' || p.mode === 'flee') continue;
          if (Math.abs(p.pos.x - d.pos.x) < 1.6 && Math.abs(p.pos.z - d.pos.z) < 1.6 && Math.random() < dt * 2) {
            if (Math.random() < 0.3) { p.mode = 'flee'; p.threat = d.pos.clone(); p.timer = 2; }
            else { _v.set(p.pos.x - d.pos.x, 0, p.pos.z - d.pos.z).normalize(); p.pos.addScaledVector(_v, 0.4); }
          }
        }
      }
      // rats: still, twitching, then a dash along the wall when anything comes close
      for (const r of rats) {
        const dist = r.pos.distanceTo(pp);
        r.g.visible = dist < 45 && (night || r.home[0] % 3 < 1.2);
        if (!r.g.visible) continue;
        r.t += dt;
        const spooked = dist < (r.mouse ? 3 : 4.5) || peds.list.some((p) => p.mode !== 'dead' && Math.abs(p.pos.x - r.pos.x) < 1.5 && Math.abs(p.pos.z - r.pos.z) < 1.5);
        if (spooked && !r.target && !(r.freeze > 0)) {
          if (r.mouse && r.freeze === undefined) { r.freeze = 0.4 + Math.random() * 0.5; } // a mouse freezes for a beat first
          else {
            r.freeze = undefined;
            const a = Math.random() * 6.28; r.target = [r.home[0] + Math.cos(a) * 3, r.home[1] + Math.sin(a) * 3];
            for (const p of peds.list) if (!p.role && p.mode !== 'dead' && p.pos.distanceTo(r.pos) < 2 && Math.random() < (r.mouse ? 0.3 : 0.5)) { p.h.play('Hit_Chest', 0.05, 1.6, true); if (p.pos.distanceTo(pp) < 20) hud.toast(pick(r.mouse ? ['"Was that a mouse?"', '"Eek!"', '"Ugh, mice."'] : ['"Ugh! A rat!"', '"Oh hell no."', '"Get away, get away!"']), 1.4); }
          }
        }
        if (r.freeze > 0) r.freeze -= dt;
        if (r.target) {
          const dx = r.target[0] - r.pos.x, dz = r.target[1] - r.pos.z, L = Math.hypot(dx, dz);
          if (L < 0.15) r.target = null;
          else { const sp = r.mouse ? 4.2 : 3.2; r.heading = Math.atan2(dx, dz); r.pos.x += (dx / L) * sp * dt; r.pos.z += (dz / L) * sp * dt; r.pos.y = ground(r.pos.x, r.pos.z, r.pos.y); }
        }
        r.g.position.copy(r.pos); r.g.rotation.y = r.heading + (r.target ? 0 : Math.sin(r.t * 7) * 0.15);
        r.tail.rotation.y = Math.sin(r.t * (r.target ? 22 : 4)) * 0.4;
      }
    },
  };
}
