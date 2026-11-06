// Out in the wilds, around the hunting:
//  - a blood trail behind a wounded animal, so you can track it to where it lay down
//  - crows that find a carcass left lying and circle it (and lift off when you come close)
//  - rafts of ducks on the lake, the rivers and the bayou: they paddle, leave rings, and
//    burst off the water at a shot or when you get close
//  - poaching: killing without a licence, or killing a protected animal, is a crime if anyone sees
//  - the wind: a small readout (and arrow) when you're near game, because they smell you downwind
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TRAIL = 90, CROWS = 3 * 5, DUCKS = 2 * 7;

export function installWilds(game) {
  const { scene, hm, player, S, hud, career } = game;
  const H = game.hunting;
  if (!H) return { update() {} };
  const P = career.p, rnd = Math.random;

  // ---------------- blood trail: drops on the ground behind a wounded animal
  const dropGeo = new THREE.CircleGeometry(0.09, 7).rotateX(-Math.PI / 2);
  const dropMat = new THREE.MeshStandardMaterial({ color: 0x4a0808, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const trail = new THREE.InstancedMesh(dropGeo, dropMat, TRAIL);
  trail.count = 0; trail.frustumCulled = false; trail.userData.noHit = true; trail.receiveShadow = true;
  scene.add(trail);
  let tHead = 0;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  H.hunt.drip = (x, z) => {
    if (game.combat?.settings && !game.combat.settings.gore) return;
    const k = 0.6 + rnd() * 0.9;
    _m.compose(_p.set(x + (rnd() - 0.5) * 0.5, hm.height(x, z) + 0.03, z + (rnd() - 0.5) * 0.5), _q.setFromAxisAngle(Y, rnd() * 6.28), _s.set(k, 1, k * (0.6 + rnd() * 0.6)));
    trail.setMatrixAt(tHead, _m); tHead = (tHead + 1) % TRAIL;
    trail.count = Math.max(trail.count, tHead === 0 ? TRAIL : tHead); trail.instanceMatrix.needsUpdate = true;
  };

  // ---------------- poaching
  let warned = false;
  H.hunt.onKill = (an) => {
    if (an.s.legend) game.hud.toast(`${an.s.name} is down.`, 2.5);
    const poached = an.s.protected || !P.huntLicence;
    if (!poached) return;
    const r = game.reportCrime ? game.reportCrime('poaching', an.pos.clone()) : 'nobody';
    if (r !== 'nobody') hud.toast(an.s.protected ? `Killing a ${an.s.name.toLowerCase()} is a crime, and someone saw it.` : 'Hunting without a licence, and someone saw it.', 3);
    else if (!warned && !an.s.protected) { warned = true; hud.toast('No hunting licence (any trading post sells one). Nobody saw that one.', 3.2); }
  };

  // ---------------- birds: one mesh for the crows, one for the ducks
  const bird = (body, wing, tail) => mergeGeometries([
    new THREE.SphereGeometry(body, 8, 6).scale(1, 0.8, 1.9),
    new THREE.SphereGeometry(body * 0.55, 8, 6).translate(0, body * 0.45, body * 1.55),
    new THREE.BoxGeometry(wing, 0.015, body * 1.4).translate(0, body * 0.2, 0),
    new THREE.BoxGeometry(body * 0.9, 0.015, tail).translate(0, 0, -body * 1.9),
  ].map((g) => g.toNonIndexed()));
  const crowMesh = new THREE.InstancedMesh(bird(0.08, 0.62, 0.16), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55 }), CROWS);
  const duckMesh = new THREE.InstancedMesh(bird(0.13, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0x6f5a40, roughness: 0.8 }), DUCKS);
  for (const m of [crowMesh, duckMesh]) { m.count = 0; m.frustumCulled = false; m.userData.noHit = true; m.castShadow = true; scene.add(m); }
  // drakes get a green head and a white neck ring (instance colours)
  const drake = new THREE.Color(0x3d5a3a), hen = new THREE.Color(0x7a6448);
  for (let i = 0; i < DUCKS; i++) duckMesh.setColorAt(i, i % 2 ? drake : hen);

  // crows: a group circling each carcass that's been lying a while
  const crowGroups = [];
  const updateCrows = (dt) => {
    for (const an of H.list) {
      if (!an.dead || an.deadT < 30 || an.crows || crowGroups.length >= CROWS / 5) continue;
      if (Math.hypot(an.pos.x - player.pos.x, an.pos.z - player.pos.z) > 160) continue;
      an.crows = { an, x: an.pos.x, z: an.pos.z, y: an.pos.y, t: rnd() * 10, lift: 0, birds: Array.from({ length: 5 }, (_, i) => ({ a: i * 1.25, r: 6 + rnd() * 5, h: 9 + rnd() * 6, w: 0.5 + rnd() * 0.3 })) };
      crowGroups.push(an.crows);
    }
    let n = 0;
    for (let g = crowGroups.length - 1; g >= 0; g--) {
      const G = crowGroups[g];
      G.t += dt;
      const d = Math.hypot(G.x - player.pos.x, G.z - player.pos.z);
      if (d < 14 && !G.lift) G.lift = 0.01;
      if (G.lift) G.lift += dt;
      if (G.lift > 8 || !H.list.includes(G.an) || d > 260) { G.an.crows = null; crowGroups.splice(g, 1); continue; }
      for (const b of G.birds) {
        b.a += dt * b.w;
        const r = b.r + G.lift * 7, y = G.y + b.h + G.lift * 5 + Math.sin(G.t * 0.7 + b.a) * 1.2;
        const x = G.x + Math.cos(b.a) * r, z = G.z + Math.sin(b.a) * r;
        _q.setFromAxisAngle(Y, -b.a); // flying along the circle
        const flap = 1 + Math.sin(G.t * 9 + b.a * 3) * 0.25;
        crowMesh.setMatrixAt(n++, _m.compose(_p.set(x, y, z), _q, _s.set(flap, 1, 1)));
      }
    }
    crowMesh.count = n; crowMesh.instanceMatrix.needsUpdate = n > 0;
  };

  // ducks: a raft paddling about on still inland water near you
  const rafts = [];
  const inland = (x, z) => hm.waterLevel(x, z) > 0.5 && hm.waterLevel(x, z) - hm.height(x, z) > 0.6;
  let raftT = 3;
  const updateDucks = (dt) => {
    if ((raftT -= dt) <= 0) {
      raftT = 6;
      for (let i = rafts.length - 1; i >= 0; i--) if (Math.hypot(rafts[i].x - player.pos.x, rafts[i].z - player.pos.z) > 220) rafts.splice(i, 1);
      if (rafts.length < 2 && !S.indoors) {
        const a = rnd() * 6.28, r = 40 + rnd() * 60, x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
        if (inland(x, z)) rafts.push({ x, z, h: rnd() * 6.28, t: 0, ring: 1, fly: 0, ducks: Array.from({ length: 5 + ((rnd() * 3) | 0) }, () => ({ ox: (rnd() - 0.5) * 6, oz: (rnd() - 0.5) * 6, h: rnd() * 6.28, ph: rnd() * 6 })) });
      }
    }
    const shot = game.combat?.firedAt && performance.now() - game.combat.firedAt < 600;
    let n = 0;
    for (let i = rafts.length - 1; i >= 0; i--) {
      const R = rafts[i];
      R.t += dt;
      const d = Math.hypot(R.x - player.pos.x, R.z - player.pos.z), boat = S.vehicle?.isBoat && Math.abs(S.vehicle.speed) > 2;
      if (!R.fly && ((shot && d < 140) || (d < 14 && S.mode === 'foot') || (boat && d < 30))) {
        R.fly = 0.01; R.away = Math.atan2(R.x - player.pos.x, R.z - player.pos.z);
        for (const k of R.ducks) game.splashes?.splash(R.x + k.ox, R.z + k.oz, 0.15);
      }
      if (R.fly) {
        R.fly += dt;
        if (R.fly > 7) { rafts.splice(i, 1); continue; }
      } else {
        // paddle slowly, turning now and then; stay on the water
        R.h += Math.sin(R.t * 0.21) * dt * 0.3;
        const nx = R.x + Math.sin(R.h) * 0.35 * dt, nz = R.z + Math.cos(R.h) * 0.35 * dt;
        if (inland(nx, nz)) { R.x = nx; R.z = nz; } else R.h += 2;
        if ((R.ring -= dt) <= 0) { R.ring = 2.4; const k = R.ducks[(rnd() * R.ducks.length) | 0]; game.splashes?.disturb(R.x + k.ox, R.z + k.oz, 0.14, 0.6); }
      }
      const wl = hm.waterLevel(R.x, R.z);
      for (const k of R.ducks) {
        let x = R.x + k.ox, z = R.z + k.oz, y = wl + 0.04 + Math.sin(R.t * 1.6 + k.ph) * 0.015, h = R.h + Math.sin(R.t * 0.5 + k.ph) * 0.6;
        if (R.fly) {
          const f = R.fly;
          x += Math.sin(R.away) * f * f * 2.2 + k.ox * f * 0.4; z += Math.cos(R.away) * f * f * 2.2 + k.oz * f * 0.4;
          y += Math.min(f, 0.4) * 1.5 + Math.max(0, f - 0.4) * 3.5; h = R.away;
        }
        const flap = R.fly ? 1 + Math.sin(R.t * 18 + k.ph) * 0.6 : 1;
        duckMesh.setMatrixAt(n++, _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(Y, h), _s.set(flap * (R.fly ? 2.6 : 1), 1, 1)));
      }
    }
    duckMesh.count = n; duckMesh.instanceMatrix.needsUpdate = n > 0;
  };

  // ---------------- the wind readout, near game
  const box = document.createElement('div');
  box.id = 'sbwind';
  box.style.cssText = 'position:fixed;right:18px;bottom:220px;z-index:12;display:none;align-items:center;gap:7px;font:600 11px Inter,system-ui,sans-serif;color:#f2ead8;text-shadow:0 1px 2px #000;pointer-events:none;background:rgba(10,12,14,.45);padding:5px 9px;border-radius:7px';
  box.innerHTML = '<span data-k="arrow" style="display:inline-block;font-size:15px;transition:transform .3s">↑</span><span data-k="txt"></span>';
  document.body.appendChild(box);
  const arrow = box.querySelector('[data-k=arrow]'), txt = box.querySelector('[data-k=txt]');
  let windT = 0;
  const updateWind = (dt) => {
    if ((windT -= dt) > 0) return;
    windT = 0.25;
    const near = S.mode === 'foot' && !S.indoors && H.list.some((an) => !an.dead && Math.abs(an.pos.x - player.pos.x) < 180 && Math.abs(an.pos.z - player.pos.z) < 180);
    box.style.display = near ? 'flex' : 'none';
    if (!near) return;
    const w = H.wind, yaw = game.rig?.yaw ?? 0;
    // the arrow points where the wind is blowing, on screen (up = the way you're looking)
    const rel = Math.atan2(w.x, w.z) - yaw;
    arrow.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)`;
    txt.textContent = `Wind ${Math.round(w.kmh)} km/h${H.hunt.quiet < 1 ? ' · moving quietly' : ''}`;
  };

  return {
    trail, rafts, crowGroups,
    get ducks() { return rafts.reduce((a, r) => a + r.ducks.length, 0); },
    update(dt) {
      if (S.paused) return '';
      updateCrows(dt);
      updateDucks(dt);
      updateWind(dt);
      return '';
    },
  };
}
