// F16 Destruction and rebuilding: any building can come down, and the city builds it back.
// (systems/demolition.js keeps the houses and small shops: they burn and go back up in a day and a
// half. This is everything bigger: offices, apartment blocks, warehouses, the downtown towers.)
//  - Every building has a structure that can take so much (by its size): explosions hurt it, most of
//    all at the base; a blast blows the glass out of that floor, scorches the wall and leaves a fire
//    burning in it, and the building groans as it weakens
//  - Demolition charges (hardware store): plant them on a wall (F); 10 seconds later they go off
//  - Enough damage and it comes down: the storeys give way from the bottom one after another and the
//    rest drops onto them, leaning as it goes; concrete and glass fly out; a dust cloud rolls down the
//    streets; the ground shakes; people and cars underneath are crushed; the buildings next to it take
//    damage (a house next door can catch fire). The police come for whoever did it, it's in the news
//  - What's left: a smoking pile of rubble behind police barriers. Then the city hires crews and builds
//    it back over up to 7 game days (a tower the full week, a warehouse ~2): clear the rubble, dig and
//    pour the foundation, put up a tower crane, raise the frame floor by floor under safety netting,
//    hang the facade, take the crane down, and the building is back. Crews in hard hats work days
//  - Saved with the game; it carries on while you sleep
import * as THREE from 'three';
import { fxTime, makeFlame, makeSmoke } from '../world/fx.js';

const isSmall = (b) => b.style === 4 || (b.style === 5 && b.h < 9) || (b.style === 2 && b.h < 9); // (demolition.js)
const CHARGE_ID = 'construction_demolition-charge';
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// a soft rolling dust puff: a camera-facing quad
const dustMat = new THREE.ShaderMaterial({
  uniforms: { uTime: fxTime, uSeed: { value: 0 }, uAlpha: { value: 1 }, uCol: { value: new THREE.Color(0.62, 0.58, 0.52) } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uSeed; uniform float uAlpha; uniform vec3 uCol; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 p = vUv - 0.5; float t = uTime * 0.12 + uSeed * 9.0;
      float m = n(p * 3.0 + vec2(t, -t * 0.7)) * 0.6 + n(p * 7.0 - vec2(t * 1.3, t)) * 0.4;
      float r = length(p * vec2(1.0, 1.25)) + (m - 0.5) * 0.28;
      float a = smoothstep(0.5, 0.12, r) * uAlpha;
      gl_FragColor = vec4(uCol * (0.82 + m * 0.3), a * 0.85);
    }`,
});

export function installDestruction(game) {
  const { scene, combat, career, hud, collision, sky, camera, player, S } = game;
  const B = game.city.buildings, P = career.p;
  P.wrecks = P.wrecks || {};
  const now = () => sky.day * 24 + sky.hour;
  const me = () => (S.mode === 'car' && S.vehicle ? S.vehicle.pos : player.pos);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

  // ---- how much a building can take
  const maxHp = (b) => 100 * Math.max(1, b.h / 6) * Math.max(1, (b.w * b.d) / 500);
  const hpOf = (b) => (b.shp ??= maxHp(b));
  const floorsOf = (b) => Math.max(2, Math.round(b.h / 3.5));
  const nameOf = (b, bi) => game.work?.employers && [...game.work.employers.values()].find((E) => E.door?.i === bi)?.name || ({ 0: 'tower', 1: 'office building', 2: 'apartment block', 3: 'warehouse', 5: 'building' }[b.style] || 'building');

  // ---- the walls, drawn for falling: storey-high windows in the building's own colour
  const facadeTex = new Map();
  function facadeMat(b) {
    const key = `${b.style}:${b.color}`;
    if (!facadeTex.has(key)) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
      const base = new THREE.Color(b.color ?? 0x9a958c), glass = b.style <= 1;
      x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 128, 64);
      x.fillStyle = glass ? '#1f2e3c' : '#2a2e33';
      for (let i = 0; i < 4; i++) x.fillRect(4 + i * 32, glass ? 6 : 14, 26, glass ? 50 : 32);
      x.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) x.fillRect(6 + i * 32, 8, 8, 44);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
      facadeTex.set(key, t);
    }
    const t = facadeTex.get(key).clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(Math.max(b.w, b.d) / 6)), 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  }

  // ---- flying debris: one instanced mesh for every chunk of concrete and glass
  const CAP = 600;
  const debris = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.9 }), CAP);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  debris.count = 0; debris.frustumCulled = false; debris.castShadow = true; debris.name = 'debris';
  scene.add(debris);
  const chunks = []; let nextChunk = 0;
  function throwChunk(x, y, z, vx, vy, vz, size, glass, ground) {
    const i = nextChunk; nextChunk = (nextChunk + 1) % CAP; if (debris.count < CAP) debris.count++;
    const c = chunks[i] || (chunks[i] = { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: new THREE.Vector3() });
    c.p.set(x, y, z); c.v.set(vx, vy, vz); c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.w.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    c.s.set(size * (glass ? 1.2 : 1), size * (glass ? 0.06 : 0.55 + Math.random() * 0.5), size * (glass ? 0.8 : 0.6 + Math.random() * 0.6));
    c.ground = ground; c.rest = false; c.age = 0;
    debris.setColorAt(i, glass ? _c.setRGB(0.35, 0.45, 0.5) : _c.setRGB(0.48 + Math.random() * 0.12, 0.46 + Math.random() * 0.1, 0.42 + Math.random() * 0.1));
    debris.instanceColor.needsUpdate = true;
  }
  function updateDebris(dt) {
    let moved = false;
    for (let i = 0; i < debris.count; i++) {
      const c = chunks[i]; if (!c || c.rest) continue;
      c.age += dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt); c.r.addScaledVector(c.w, dt);
      if (c.p.y < c.ground + c.s.y * 0.5) { c.p.y = c.ground + c.s.y * 0.5; c.v.y *= -0.22; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5); if (Math.abs(c.v.y) < 0.6 && c.v.lengthSq() < 0.5) c.rest = true; }
      _e.set(c.r.x, c.r.y, c.r.z); _q.setFromEuler(_e);
      _m.compose(c.p, _q, c.s); debris.setMatrixAt(i, _m); moved = true;
    }
    if (moved) debris.instanceMatrix.needsUpdate = true;
  }

  // ---- dust: puffs that roll outward and settle
  const puffs = [];
  function dust(x, y, z, size, out, life = 40) {
    if (puffs.length > 48) { const o = puffs.shift(); scene.remove(o.m); o.m.material.dispose(); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dustMat.clone());
    m.material.uniforms.uTime = fxTime; m.material.uniforms.uSeed.value = Math.random(); m.renderOrder = 6; m.userData.noHit = true; m.userData.noReflect = true;
    m.position.set(x, y + size * 0.4, z); m.scale.setScalar(size); scene.add(m);
    puffs.push({ m, v: out, grow: size * 0.06, life, t: 0 });
  }
  function updateDust(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const d = puffs[i]; d.t += dt;
      d.m.position.addScaledVector(d.v, dt); d.v.multiplyScalar(1 - Math.min(1, dt * 0.25));
      d.m.scale.multiplyScalar(1 + d.grow * dt / Math.max(1, d.m.scale.x)); d.m.position.y += dt * 0.25;
      d.m.material.uniforms.uAlpha.value = Math.min(1, d.t * 2) * Math.max(0, 1 - d.t / d.life);
      d.m.quaternion.copy(camera.quaternion);
      if (d.t > d.life) { scene.remove(d.m); d.m.material.dispose(); puffs.splice(i, 1); }
    }
  }

  // ---- fires in blown-out floors (a few at a time)
  const burns = [];
  function burnAt(b, at) {
    // the wall face nearest the blast
    const fx = at.x - b.x, fz = at.z - b.z, alongX = Math.abs(fx) / b.w > Math.abs(fz) / b.d;
    const px = alongX ? b.x + Math.sign(fx) * (b.w / 2 + 0.05) : Math.max(b.x - b.w / 2 + 1, Math.min(b.x + b.w / 2 - 1, at.x));
    const pz = alongX ? Math.max(b.z - b.d / 2 + 1, Math.min(b.z + b.d / 2 - 1, at.z)) : b.z + Math.sign(fz) * (b.d / 2 + 0.05);
    const py = Math.max(b.y + 0.5, Math.min(b.y + b.h - 2, at.y));
    // scorch on the wall
    const sc = new THREE.Mesh(new THREE.CircleGeometry(2.2 + Math.random(), 18), new THREE.MeshBasicMaterial({ color: 0x0a0807, transparent: true, opacity: 0.8, depthWrite: false }));
    sc.position.set(px, py + 1, pz); sc.lookAt(px + (alongX ? Math.sign(fx) : 0), py + 1, pz + (alongX ? 0 : Math.sign(fz))); sc.renderOrder = 2;
    sc.material.polygonOffset = true; sc.material.polygonOffsetFactor = -4; scene.add(sc);
    const fl = makeFlame(3 + Math.random() * 2);
    if (fl) { fl.position.set(px + (alongX ? Math.sign(fx) * 0.4 : 0), py, pz + (alongX ? 0 : Math.sign(fz) * 0.4)); scene.add(fl); }
    burns.push({ sc, fl, t: 0, bi: B.indexOf(b) });
    if (burns.length > 10) { const o = burns.shift(); scene.remove(o.sc); o.sc.material.dispose(); if (o.fl) scene.remove(o.fl); }
    // glass out of that floor
    for (let k = 0; k < 14; k++) throwChunk(px + (Math.random() - 0.5) * 4, py + 1 + Math.random() * 2, pz + (Math.random() - 0.5) * 4, (alongX ? Math.sign(fx) : (Math.random() - 0.5)) * (2 + Math.random() * 5), 1 + Math.random() * 3, (alongX ? (Math.random() - 0.5) : Math.sign(fz)) * (2 + Math.random() * 5), 0.25 + Math.random() * 0.4, true, b.y);
  }

  // ---- damage
  let groanT = 0;
  function damage(bi, amount, at, quiet) {
    const b = B[bi]; if (!b || b.ruined || isSmall(b)) return;
    const hp = hpOf(b);
    b.shp = hp - amount;
    if (b.shp <= 0) { collapse(bi); return; }
    if (!quiet && at) burnAt(b, at);
    if (b.shp < maxHp(b) * 0.45 && groanT <= 0 && me().distanceTo(_p.set(b.x, b.y, b.z)) < 250) { groanT = 20; hud.toast('The building groans. Dust falls from the windows.', 3); game.audio?.thunder?.(); }
  }
  // explosions: the blast reaches the walls around it; low hits do the real harm
  const prevBoom = combat.onExplosion;
  combat.onExplosion = (at, power) => {
    prevBoom?.(at, power);
    const reach = 4 + power * 1.2;
    collision.query(at.x, at.z, reach + 2, (it) => {
      if (it.t !== 0 || !it.data?.building) return;
      const bi = B.findIndex((b) => b.col === it); if (bi < 0) return;
      const b = B[bi]; if (isSmall(b)) return;
      const dx = Math.max(Math.abs(at.x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(at.z - b.z) - b.d / 2, 0), dy = Math.max(at.y - (b.y + b.h), 0, b.y - at.y);
      const d = Math.hypot(dx, dz, dy); if (d > reach) return;
      const low = at.y < b.y + Math.max(6, b.h * 0.15) ? 1 : 0.3;
      damage(bi, power * 45 * (1 - d / reach) * low, at);
    });
  };

  // ---- demolition charges: plant on a wall, run
  const charges = [];
  const chargeMesh = () => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a5a3a, roughness: 0.7 })); g.add(box);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.13), new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.5 })); g.add(tape);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0.1, 0.07, 0.07); g.add(led); g.userData.led = led;
    return g;
  };
  function wallNear(p) {
    let best = null;
    collision.query(p.x, p.z, 2.5, (it) => {
      if (best || it.t !== 0 || !it.data?.building) return;
      const dx = Math.max(it.minX - p.x, 0, p.x - it.maxX), dz = Math.max(it.minZ - p.z, 0, p.z - it.maxZ);
      if (Math.hypot(dx, dz) < 1.3 && p.y < it.y1 && p.y > it.y0 - 1) { const bi = B.findIndex((b) => b.col === it); if (bi >= 0 && !B[bi].ruined) best = { bi, it }; }
    });
    return best;
  }
  function plant() {
    const w = wallNear(player.pos); if (!w) return;
    if (!career.useTool(CHARGE_ID)) return;
    const it = w.it, p = player.pos;
    const x = Math.max(it.minX, Math.min(it.maxX, p.x)), z = Math.max(it.minZ, Math.min(it.maxZ, p.z));
    const nx = p.x < it.minX ? -1 : p.x > it.maxX ? 1 : 0, nz = nx ? 0 : (p.z < it.minZ ? -1 : 1);
    const g = chargeMesh(); g.position.set(x + nx * 0.07, p.y + 1.0, z + nz * 0.07); g.rotation.y = Math.atan2(nx, nz); scene.add(g);
    player.h?.play?.('Interact', 0.1, 1.2, true);
    charges.push({ g, bi: w.bi, t: 10, at: g.position.clone() });
    hud.toast(`Charge set. ${career.p.tools[CHARGE_ID] ? `${career.p.tools[CHARGE_ID]} left. ` : ''}10 seconds. Get clear.`, 3);
  }
  function updateCharges(dt) {
    for (let i = charges.length - 1; i >= 0; i--) {
      const c = charges[i]; c.t -= dt;
      c.g.userData.led.visible = (c.t * (c.t < 3 ? 6 : 2)) % 1 > 0.5;
      if (c.t <= 0) {
        scene.remove(c.g); charges.splice(i, 1);
        if (game.explodeAt) game.explodeAt(c.at, 160); else combat.onExplosion?.(c.at, 6);
        const b = B[c.bi];
        if (b && !b.ruined) { if (isSmall(b)) game.demolition?.destroy?.(c.bi); else damage(c.bi, Math.max(700, maxHp(b) * 0.36), c.at); }
      }
    }
  }

  // ---- coming down
  let falling = null;
  function collapse(bi) {
    const b = B[bi]; if (!b || b.ruined || falling?.bi === bi) return;
    if (game.estate?.inside?.d?.i === bi) game.estate.leave();
    b.ruined = 'collapse';
    const F = floorsOf(b), fh = b.h / F;
    const im = new THREE.InstancedMesh(unit, facadeMat(b), F); im.castShadow = true; im.frustumCulled = false; im.name = 'collapse';
    scene.add(im);
    game.demolition?.show?.(bi, false);
    const a = Math.random() * Math.PI * 2;
    falling = { bi, b, im, F, fh, crushed: 0, drop: 0, v: 0, t: 0, lean: { x: Math.cos(a), z: Math.sin(a) }, tilt: 0, off: [] };
    for (let k = 0; k < F; k++) falling.off.push({ x: (Math.random() - 0.5) * 1.2, z: (Math.random() - 0.5) * 1.2, r: (Math.random() - 0.5) * 0.15 });
    placeFalling();
    // everyone and everything underneath
    const c = _p.set(b.x, b.y, b.z).clone(), R = Math.max(b.w, b.d) / 2 + 6;
    for (const p of [...game.peds.list]) if (p.mode !== 'dead' && Math.abs(p.pos.x - b.x) < b.w / 2 + 6 && Math.abs(p.pos.z - b.z) < b.d / 2 + 6) game.peds.damage(p, 600, c, { blast: true });
    for (const v of [S.vehicle, ...(game.traffic?.cars || []).map((q) => q.v), ...(game.parked || [])]) if (v && Math.abs(v.pos.x - b.x) < b.w / 2 + 5 && Math.abs(v.pos.z - b.z) < b.d / 2 + 5) v.health = Math.min(v.health, 5);
    const mp = me();
    if (Math.abs(mp.x - b.x) < b.w / 2 + 5 && Math.abs(mp.z - b.z) < b.d / 2 + 5) game.hurtPlayer?.(90, c, 3);
    game.peds.panic?.(c, Math.max(80, b.h * 2), { cover: false });
    const d = mp.distanceTo(c);
    if (d < 600) { if (game.rig) game.rig.shake = Math.min(1, 1.4 - d / 600); game.audio?.thunder?.(); setTimeout(() => game.audio?.thunder?.(), 1400); }
    if (d < 400 && game.police) { game.police.crime?.('kill'); game.police.wanted = Math.max(game.police.wanted, Math.min(5, 3 + (b.h > 30 ? 1 : 0))); }
    const name = nameOf(b, bi);
    game.news?.(`${b.h > 30 ? 'A downtown tower' : `A ${name}`} collapsed in an explosion today. The city says crews will rebuild it within ${Math.round(daysOf(b))} days.`);
    if (d < 300) hud.bigMessage('COLLAPSE', `The ${name} is coming down`, 3);
    // the buildings next door take a beating
    collision.query(b.x, b.z, R + b.h * 0.4, (it) => {
      if (it.t !== 0 || !it.data?.building || it === b.col) return;
      const ni = B.findIndex((q) => q.col === it); if (ni < 0 || B[ni].ruined) return;
      const n = B[ni], gap = Math.hypot(Math.max(Math.abs(n.x - b.x) - (n.w + b.w) / 2, 0), Math.max(Math.abs(n.z - b.z) - (n.d + b.d) / 2, 0));
      if (gap > b.h * 0.4) return;
      const hit = 260 * (1 - gap / (b.h * 0.4 + 1)) * Math.min(2, b.h / 20);
      if (isSmall(n)) { if (hit > 120) game.demolition?.destroy?.(ni); }
      else damage(ni, hit, _p.set(n.x, n.y + 3, n.z), true);
    });
  }
  function placeFalling() {
    const f = falling, b = f.b, pile = f.fh * 0.16;
    for (let k = 0; k < f.F; k++) {
      const o = f.off[k];
      if (k < f.crushed) {
        _p.set(b.x + o.x * 2, b.y + pile * (k + 0.5), b.z + o.z * 2); _q.setFromEuler(_e.set(o.r, o.r * 2, -o.r)); _s.set(b.w * 1.04, pile, b.d * 1.04);
      } else {
        const up = pile * f.crushed + (k - f.crushed + 0.5) * f.fh - f.drop;
        const lean = f.tilt * (up / b.h);
        _p.set(b.x + f.lean.x * lean * b.h * 0.6, b.y + up, b.z + f.lean.z * lean * b.h * 0.6);
        _q.setFromEuler(_e.set(f.lean.z * f.tilt, 0, -f.lean.x * f.tilt)); _s.set(b.w, f.fh, b.d);
      }
      _m.compose(_p, _q, _s); f.im.setMatrixAt(k, _m);
    }
    f.im.instanceMatrix.needsUpdate = true;
  }
  function updateFalling(dt) {
    const f = falling; if (!f) return;
    const b = f.b;
    f.t += dt; f.v += 9.8 * 0.75 * dt; f.drop += f.v * dt; f.tilt = Math.min(0.14, f.tilt + dt * 0.01);
    while (f.drop >= f.fh * 0.84 && f.crushed < f.F) {
      f.crushed++; f.drop -= f.fh * 0.84; f.v *= 0.55;
      const y = b.y + f.fh * 0.16 * f.crushed + 1;
      const n = Math.min(14, 6 + Math.round(b.w / 6));
      for (let k = 0; k < n; k++) {
        const side = (Math.random() * 4) | 0, along = Math.random() - 0.5;
        const x = side < 2 ? b.x + (side ? 1 : -1) * b.w / 2 : b.x + along * b.w, z = side < 2 ? b.z + along * b.d : b.z + (side === 2 ? 1 : -1) * b.d / 2;
        const ox = side < 2 ? (side ? 1 : -1) : 0, oz = side >= 2 ? (side === 2 ? 1 : -1) : 0, sp = 3 + Math.random() * 8;
        throwChunk(x, y + Math.random() * 3, z, ox * sp + (Math.random() - 0.5) * 3, 1 + Math.random() * 4, oz * sp + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 1.6, Math.random() < 0.3, b.y);
      }
      if (f.crushed % 2 === 1) for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28; dust(b.x + Math.cos(a) * b.w * 0.6, b.y, b.z + Math.sin(a) * b.d * 0.6, Math.max(b.w, b.d) * 0.7, new THREE.Vector3(Math.cos(a) * 6, 0, Math.sin(a) * 6), 50); }
      if (me().distanceTo(_p.set(b.x, b.y, b.z)) < 400) game.audio?.thud?.(0.6);
    }
    placeFalling();
    if (f.crushed >= f.F) {
      scene.remove(f.im); f.im.material.map?.dispose(); f.im.material.dispose(); f.im.dispose?.();
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; dust(b.x + Math.cos(a) * b.w * 0.5, b.y, b.z + Math.sin(a) * b.d * 0.5, Math.max(b.w, b.d) * 0.9 + b.h * 0.3, new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9), 70); }
      const bi = f.bi; falling = null;
      P.wrecks[bi] = { t0: now(), days: daysOf(b) };
      startSite(bi);
      career.saveSoon?.();
    }
  }

  // ---- the site: rubble, then the rebuild
  const daysOf = (b) => Math.max(2, Math.min(7, b.h / 9));
  const sites = new Map();
  const conc = new THREE.MeshStandardMaterial({ color: 0x7e7a72, roughness: 0.9 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x2c3a46, roughness: 0.15, metalness: 0.5 });
  // safety netting: a see-through mesh sleeve around the top floors (no lid)
  const netT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(40,110,60,0.35)'; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(30,90,45,0.9)'; x.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const netM = new THREE.MeshStandardMaterial({ map: netT, transparent: true, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const sleeve = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4);
  const lattice = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = '#f2c200'; x.lineWidth = 5; x.strokeRect(2, 2, 60, 60); x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.stroke(); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  function boxes(list) {
    // merge [w,h,d,x,y,z,rx,ry,rz,[r,g,b]] boxes into one vertex-coloured mesh
    const geos = list.map(([w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, col]) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1)));
      const n = g.attributes.position.count, ca = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) ca.set(col, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); return g;
    });
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })); m.castShadow = m.receiveShadow = true;
    return m;
  }
  function startSite(bi) {
    const b = B[bi], r = rnd(bi * 31 + 9), g = new THREE.Group(), F = floorsOf(b), fh = b.h / F;
    b.ruined = 'collapse';
    game.demolition?.show?.(bi, false);
    // rubble: a mound of broken concrete with beams sticking out
    const H = Math.min(14, 3 + b.h * 0.12), L = [];
    for (let k = 0; k < 140; k++) {
      const u = (r() - 0.5) * 1.15, v = (r() - 0.5) * 1.15, h = H * Math.max(0.05, 1 - (u * u + v * v) * 2.6), s = 1 + r() * 3;
      L.push([s, s * 0.6, s * (0.6 + r()), b.x + u * b.w, b.y + h * r() * 0.9, b.z + v * b.d, r() * 0.6, r() * 3, r() * 0.6, [0.42 + r() * 0.12, 0.4 + r() * 0.1, 0.37 + r() * 0.1]]);
    }
    for (let k = 0; k < 12; k++) L.push([0.35, 0.35, 5 + r() * 8, b.x + (r() - 0.5) * b.w * 0.7, b.y + H * 0.5 + r() * H * 0.4, b.z + (r() - 0.5) * b.d * 0.7, 0.4 + r() * 0.8, r() * 3, r() * 0.5, [0.24, 0.16, 0.12]]);
    const rubble = boxes(L); g.add(rubble);
    // barriers and tape around it; later the site fence
    const FW = b.w + 10, FD = b.d + 10, fence = [], tape = [];
    for (const [len, cx, cz, alongX] of [[FW, b.x, b.z - FD / 2, 1], [FW, b.x, b.z + FD / 2, 1], [FD, b.x - FW / 2, b.z, 0], [FD, b.x + FW / 2, b.z, 0]]) {
      for (let s = -len / 2 + 1.2; s < len / 2; s += 2.6) {
        const px = alongX ? cx + s : cx, pz = alongX ? cz : cz + s;
        tape.push([alongX ? 2 : 0.6, 0.8, alongX ? 0.6 : 2, px, b.y + 0.4, pz, 0, 0, 0, [0.82, 0.8, 0.76]]);
        fence.push([alongX ? 2.5 : 0.05, 2.0, alongX ? 0.05 : 2.5, px, b.y + 1.0, pz, 0, 0, 0, [0.16, 0.32, 0.6]]);
      }
      tape.push([alongX ? len : 0.02, 0.08, alongX ? 0.02 : len, cx, b.y + 1.0, cz, 0, 0, 0, [0.95, 0.8, 0.05]]);
    }
    const barriers = boxes(tape); g.add(barriers);
    const fenceM = boxes(fence); g.add(fenceM); fenceM.visible = false;
    const pit = boxes([[b.w, 0.4, b.d, b.x, b.y - 0.15, b.z, 0, 0, 0, [0.3, 0.25, 0.2]]]); g.add(pit); pit.visible = false;
    const slab = boxes([[b.w + 0.4, 0.5, b.d + 0.4, b.x, b.y + 0.25, b.z, 0, 0, 0, [0.62, 0.61, 0.58]]]); g.add(slab); slab.visible = false;
    // the frame (concrete), the facade (the building's own walls), the net around the top
    const cols = [];
    const nx = Math.max(2, Math.round(b.w / 7)), nz = Math.max(2, Math.round(b.d / 7));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) if (i === 0 || j === 0 || i === nx || j === nz) cols.push([b.x - b.w / 2 + 0.3 + (b.w - 0.6) * i / nx, b.z - b.d / 2 + 0.3 + (b.d - 0.6) * j / nz]);
    const per = cols.length + 2;
    const frame = new THREE.InstancedMesh(unit, conc, F * per); frame.count = 0; frame.castShadow = true;
    let k = 0;
    for (let fl = 0; fl < F; fl++) {
      const y0 = b.y + 0.5 + fl * fh;
      frame.setMatrixAt(k++, _m.compose(_p.set(b.x, y0 + fh - 0.15, b.z), _q.identity(), _s.set(b.w, 0.3, b.d)));
      frame.setMatrixAt(k++, _m.compose(_p.set(b.x, y0 + fh / 2, b.z), _q.identity(), _s.set(b.w * 0.22, fh, b.d * 0.22)));
      for (const [cx, cz] of cols) frame.setMatrixAt(k++, _m.compose(_p.set(cx, y0 + fh / 2, cz), _q.identity(), _s.set(0.5, fh, 0.5)));
    }
    frame.instanceMatrix.needsUpdate = true; g.add(frame);
    const skin = new THREE.InstancedMesh(unit, facadeMat(b), F); skin.count = 0; skin.castShadow = true;
    for (let fl = 0; fl < F; fl++) skin.setMatrixAt(fl, _m.compose(_p.set(b.x, b.y + 0.5 + fl * fh + fh / 2, b.z), _q.identity(), _s.set(b.w + 0.2, fh, b.d + 0.2)));
    skin.instanceMatrix.needsUpdate = true; g.add(skin);
    const net = new THREE.Mesh(sleeve, netM.clone()); net.material.map = netT.clone(); net.material.map.needsUpdate = true; net.material.map.repeat.set(Math.round((b.w + b.d) / 2), 2); net.visible = false; g.add(net);
    // the tower crane
    const crane = new THREE.Group(); crane.visible = false; g.add(crane);
    const yel = new THREE.MeshStandardMaterial({ map: lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, color: 0xffffff, transparent: false });
    const mast = new THREE.Mesh(unit, yel); crane.add(mast);
    const jibG = new THREE.Group(); crane.add(jibG);
    const jibLen = Math.max(28, Math.max(b.w, b.d) * 1.2);
    const jib = new THREE.Mesh(unit, yel); jib.scale.set(jibLen, 1.4, 1.4); jib.position.set(jibLen / 2 - 6, 0, 0); jibG.add(jib);
    const cjib = new THREE.Mesh(unit, yel); cjib.scale.set(12, 1.2, 1.4); cjib.position.set(-12, 0, 0); jibG.add(cjib);
    const weight = new THREE.Mesh(unit, conc); weight.scale.set(3, 2.4, 2); weight.position.set(-15, -1.6, 0); jibG.add(weight);
    const cab = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 })); cab.scale.set(2.2, 2.2, 2.2); cab.position.set(1.6, -1.8, 1.6); jibG.add(cab);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 4), yel); peak.position.set(0, 3.5, 0); jibG.add(peak);
    const line = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: 0x222222 })); jibG.add(line);
    const load = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 })); load.scale.set(4, 0.6, 1); jibG.add(load);
    const cs = { x: b.x + b.w / 2 + 4, z: b.z + b.d / 2 + 4 }; // the crane stands at a corner
    crane.position.set(cs.x, b.y, cs.z);
    // smoke over the pile
    const smoke = [];
    for (let q = 0; q < 3; q++) { const sm = makeSmoke(12 + r() * 10, r(), 0.3); sm.position.set(b.x + (r() - 0.5) * b.w * 0.5, b.y + H * 0.6, b.z + (r() - 0.5) * b.d * 0.5); g.add(sm); smoke.push(sm); }
    scene.add(g);
    const site = { bi, b, g, F, fh, H, rubble, barriers, fenceM, pit, slab, frame, per, skin, net, crane, mast, jibG, jibLen, line, load, smoke, workers: [], phase: '' };
    sites.set(bi, site);
    // the building is a low pile now
    if (b.col) { b.col.y1Was ??= b.col.y1; b.col.y1 = b.y + Math.min(2.5, H * 0.4); }
    updateSite(site, 0, true);
    return site;
  }
  const PH = [['response', 0.04], ['clearing rubble', 0.24], ['foundation', 0.32], ['crane going up', 0.36], ['framing', 0.86], ['facade', 0.96], ['crane coming down', 1]];
  function updateSite(site, dt, force) {
    const b = site.b, W = P.wrecks[site.bi]; if (!W) return;
    const f = Math.max(0, (now() - W.t0) / (W.days * 24));
    if (f >= 1) { finish(site); return; }
    site.phase = PH.find(([, e]) => f < e)[0];
    const near = me().distanceTo(_p.set(b.x, b.y, b.z)) < 700;
    if (!near && !force) return;
    site.t = (site.t || 0) + dt;
    // rubble goes, the pit is dug, the slab poured
    const clear = Math.max(0, Math.min(1, (f - 0.04) / 0.2));
    // (the boxes sit at world heights: scale about y = b.y so the pile sinks into the ground)
    site.rubble.visible = clear < 0.99; site.rubble.scale.y = 1 - clear * 0.97; site.rubble.position.y = b.y * (1 - site.rubble.scale.y);
    for (const sm of site.smoke) sm.visible = f < 0.15;
    site.barriers.visible = f < 0.24; site.fenceM.visible = f >= 0.2;
    site.pit.visible = f >= 0.24 && f < 0.3; site.slab.visible = f >= 0.29;
    if (b.col) b.col.y1 = f < 0.24 ? b.y + Math.min(2.5, site.H * 0.4) * (1 - clear) : b.col.y1;
    // frame and facade, floor by floor
    const framed = Math.max(0, Math.min(site.F, Math.floor((f - 0.34) / 0.5 * site.F)));
    const clad = Math.max(0, Math.min(site.F, Math.floor((f - 0.46) / 0.48 * site.F)));
    site.frame.count = framed * site.per; site.skin.count = clad;
    if (b.col && f >= 0.3) b.col.y1 = b.y + 0.5 + Math.max(clad, 0) * site.fh;
    const top = b.y + 0.5 + framed * site.fh;
    site.net.visible = framed > 0 && framed < site.F + 1 && f < 0.9;
    if (site.net.visible) { site.net.scale.set(b.w + 1.2, site.fh * 2, b.d + 1.2); site.net.position.set(b.x, top - site.fh, b.z); }
    // the crane: up before the frame, taller than it, gone at the end
    const craneOn = f >= 0.32 && f < 1;
    site.crane.visible = craneOn;
    if (craneOn) {
      const up = f < 0.36 ? (f - 0.32) / 0.04 : f > 0.96 ? 1 - (f - 0.96) / 0.04 : 1;
      const mh = Math.max(4, (Math.max(top, b.y + 20) - b.y + 14) * up);
      site.mast.scale.set(1.8, mh, 1.8); site.mast.position.set(0, mh / 2, 0);
      site.mast.material.map.repeat.set(1, Math.round(mh / 2));
      site.jibG.position.set(0, mh, 0); site.jibG.visible = up > 0.6;
      site.jibG.rotation.y = Math.sin(site.t * 0.05 + site.bi) * 1.4 + site.bi;
      const reach = site.jibLen * (0.45 + 0.35 * Math.sin(site.t * 0.07)), drop = Math.max(3, mh - (top - b.y) - 2);
      site.line.scale.set(0.06, drop, 0.06); site.line.position.set(reach - 6, -drop / 2, 0);
      site.load.position.set(reach - 6, -drop - 0.3, 0);
    }
    // the crew: in the day, while you're near
    workers(site, f, dt);
  }
  function workers(site, f, dt) {
    const b = site.b, day = sky.hour > 7 && sky.hour < 18, near = me().distanceTo(_p.set(b.x, b.y, b.z)) < 140;
    const want = day && near && f >= 0.04 && f < 0.98 ? 4 : 0;
    while (site.workers.length > want) { const w = site.workers.pop(); w.h.root.parent?.remove(w.h.root); w.h.dispose?.(); }
    while (site.workers.length < want && game.demolition?.worker) {
      const h = game.demolition.worker('build', site.workers.length + site.bi);
      const a = Math.random() * 6.28; h.root.position.set(b.x + Math.cos(a) * (b.w / 2 + 3), b.y, b.z + Math.sin(a) * (b.d / 2 + 3));
      site.workers.push({ h, t: 0, to: null });
    }
    for (const w of site.workers) {
      w.t -= dt;
      if (!w.to || w.t <= 0) { const a = Math.random() * 6.28; w.to = new THREE.Vector3(b.x + Math.cos(a) * (b.w / 2 + 2.5), b.y, b.z + Math.sin(a) * (b.d / 2 + 2.5)); w.t = 8 + Math.random() * 10; w.work = false; }
      if (!w.work && game.demolition.walkTo(w.h, w.to, dt, 1.3)) { w.work = true; game.demolition.face(w.h, _p.set(b.x, b.y, b.z)); w.knock = 0; }
      if (w.work && (w.knock -= dt) <= 0) { w.knock = 0.6 + Math.random() * 0.5; w.h.play('Interact', 0.05, 1.4, true); }
      w.h.update(dt);
    }
  }
  function finish(site) {
    const b = site.b;
    for (const w of site.workers) { w.h.root.parent?.remove(w.h.root); w.h.dispose?.(); }
    scene.remove(site.g);
    site.g.traverse((o) => { if (o.isMesh && o.geometry !== unit && o.geometry !== sleeve) o.geometry.dispose(); });
    site.skin.material.map?.dispose(); site.skin.material.dispose(); site.net.material.map?.dispose(); site.net.material.dispose();
    sites.delete(site.bi); delete P.wrecks[site.bi];
    b.ruined = false; b.shp = maxHp(b);
    if (b.col && b.col.y1Was != null) b.col.y1 = b.col.y1Was;
    game.demolition?.show?.(site.bi, true);
    if (me().distanceTo(_p.set(b.x, b.y, b.z)) < 400) hud.toast(`The ${nameOf(b, site.bi)} is finished. The crews pack up.`, 3);
    game.news?.(`Ribbon cut on the rebuilt ${nameOf(b, site.bi)}.`);
    career.saveSoon?.();
  }

  // ---- from the save
  for (const [k, W] of Object.entries(P.wrecks)) { const b = B[+k]; if (!b || isSmall(b)) { delete P.wrecks[k]; continue; } startSite(+k); }

  const api = {
    sites, charges, get falling() { return falling; }, hp: (bi) => (B[bi] ? hpOf(B[bi]) : 0), maxHp: (bi) => maxHp(B[bi]), damage, collapse,
    plant, isSmall,
    // tests and the phone: push a site's clock on
    advance: (bi, hours) => { const W = P.wrecks[bi]; if (W) W.t0 -= hours; const s = sites.get(bi); if (s) updateSite(s, 0, true); },
    phaseOf: (bi) => sites.get(bi)?.phase || null,
    update(dt, a, free) {
      groanT -= dt;
      updateFalling(dt); updateDebris(dt); updateDust(dt); updateCharges(dt);
      for (const bu of burns) { bu.t += dt; if (bu.fl) bu.fl.lookAt(camera.position.x, bu.fl.position.y, camera.position.z); }
      // sites near you every frame (the crane turns, the crew works); the rest twice a second
      const tick = sites.size && (this._t = (this._t || 0) - dt) <= 0; if (tick) this._t = 0.5;
      for (const s of [...sites.values()]) { if (me().distanceTo(_p.set(s.b.x, s.b.y, s.b.z)) < 400) updateSite(s, dt); else if (tick) updateSite(s, 0.5); }
      for (const s of sites.values()) for (const sm of s.smoke) sm.lookAt(camera.position.x, sm.position.y, camera.position.z);
      // a charge in your pocket and a wall in front of you
      if (S.mode === 'foot' && !S.indoors && (career.p.tools[CHARGE_ID] || 0) > 0) {
        const w = (this._w = (this._wt = (this._wt || 0) - dt) <= 0 ? (this._wt = 0.25, wallNear(player.pos)) : this._w);
        if (w) {
          if (free && a?.enter) { a.enter = false; plant(); return ''; }
          return `${game.settings?.isTouch ? 'Tap 🚗 to' : 'Press F to'} plant a demolition charge (${career.p.tools[CHARGE_ID]} left)`;
        }
      }
      return '';
    },
  };
  game.destruction = api;
  return api;
}
