// Shootout — the 3D card table.
// Builds the gray room, the long table and the outlaws sitting at it, and
// animates everything the game asks for: dealing and playing cards, peeking
// into a cylinder, drawing, aiming, firing, dying, and the room coming apart
// a little more every round. Seat 0 is you (first-person camera).

const Table = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Q = () => new THREE.Quaternion();
  const T = (...a) => Engine.tween(...a), E = Engine.Ease;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TABLE_Y = 0.783;
  const DECK_POS = V(0.38, TABLE_Y, 0.15);

  let scene, camera, rig, handHolder, stage;
  let lamp, hemi, myGun, myGunRest;
  let shelves = [], deskL, deskR, picture, doorObj, decals = [], cracks = [], pools = [];
  let seats = [];          // seats[i] = { group, rig?, cards: [], label, dead, name }
  let pile = [];
  let ravageTarget = 0, ravage = 0, showBlood = true;
  let flicker = 1, hovered = -1, selected = -1, covered = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-9, -9);
  let api;

  // ---------- room ----------

  function buildRoom() {
    const m = Models.mats();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a08);
    scene.fog = new THREE.Fog(0x0c0a08, 6, 14);

    hemi = new THREE.HemisphereLight(0xb0a890, 0x2a2018, 0.45);
    scene.add(hemi);

    const W = 8, D = 9, H = 3.4, BACK = -5, FRONT = 4;
    const plane = (w, h, mat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.receiveShadow = true; return p; };
    const floor = plane(W, D, m.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (BACK + FRONT) / 2); scene.add(floor);
    const ceil = plane(W, D, m.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, (BACK + FRONT) / 2); scene.add(ceil);
    const back = plane(W, H, m.wall); back.position.set(0, H / 2, BACK); scene.add(back);
    const front = plane(W, H, m.wall); front.rotation.y = Math.PI; front.position.set(0, H / 2, FRONT); scene.add(front);
    const left = plane(D, H, m.wall); left.rotation.y = Math.PI / 2; left.position.set(-W / 2, H / 2, (BACK + FRONT) / 2); scene.add(left);
    const right = plane(D, H, m.wall); right.rotation.y = -Math.PI / 2; right.position.set(W / 2, H / 2, (BACK + FRONT) / 2); scene.add(right);
    // skirting boards
    const skirt = (w, x, z, ry) => { const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.03), m.darkWood); s.position.set(x, 0.07, z); s.rotation.y = ry; s.receiveShadow = true; scene.add(s); };
    skirt(W, 0, BACK + 0.015, 0); skirt(D, -W / 2 + 0.015, (BACK + FRONT) / 2, Math.PI / 2); skirt(D, W / 2 - 0.015, (BACK + FRONT) / 2, Math.PI / 2);

    // furniture against the back wall; each shelf tips around its front-bottom edge
    [[-2.6, 11], [2.6, 22]].forEach(([x, seed]) => {
      const s = Models.bookshelf(seed);
      const pivot = new THREE.Group(); pivot.position.set(x, 0, BACK + 0.36); scene.add(pivot);
      s.group.position.set(0, 0, -0.18); pivot.add(s.group);
      s.books.forEach(b => {
        const r = Util.rng(Math.floor(b.userData.fall * 1e6));
        b.userData.dest = V(b.position.x + (r() - 0.5) * 0.9, 0.03, 0.4 + r() * 0.9);
        b.userData.destRot = new THREE.Euler(Math.PI / 2 * (r() < 0.5 ? 1 : 0), r() * 3, r() < 0.5 ? Math.PI / 2 : 0);
      });
      shelves.push({ pivot, ...s });
    });
    deskL = Models.desk(); deskL.position.set(-1.2, 0, BACK + 0.35); scene.add(deskL);
    deskR = Models.desk(); deskR.position.set(1.2, 0, BACK + 0.35); deskR.scale.x = -1; scene.add(deskR);
    picture = Models.pictureFrame(); picture.position.set(0, 2.05, BACK + 0.03); scene.add(picture);
    doorObj = Models.door(); doorObj.position.set(-W / 2 + 0.07, 0, -1.6); doorObj.rotation.y = Math.PI / 2; scene.add(doorObj);
    [deskL, deskR, picture, doorObj].forEach(o => o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }));

    const table = Models.table(3.4, 1.2, 0.78);
    table.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(table);
    // the deck waits at the middle of the table
    for (let i = 0; i < 6; i++) {
      const c = Models.card(null);
      c.rotation.x = Math.PI / 2; c.rotation.z = (Math.random() - 0.5) * 0.08;
      c.position.copy(DECK_POS).add(V(0, 0.002 * i, 0));
      scene.add(c);
    }

    lamp = Models.hangingLamp();
    lamp.group.position.set(0, H, 0);
    lamp.group.children[0].scale.y = 1;
    scene.add(lamp.group);

    // blood and cracks, revealed bit by bit as the room is ravaged
    const r = Util.rng(1337);
    const t = Models.tex();
    for (let i = 0; i < 46; i++) {
      const d = Models.decal(t.blood[i % 4], 0.5 + r() * 0.9);
      const where = r();
      if (where < 0.35) d.position.set(-3.6 + r() * 7.2, 0.4 + r() * 2.6, BACK + 0.012);
      else if (where < 0.5) { d.rotation.y = Math.PI / 2; d.position.set(-W / 2 + 0.012, 0.4 + r() * 2.6, -4.5 + r() * 7); }
      else if (where < 0.65) { d.rotation.y = -Math.PI / 2; d.position.set(W / 2 - 0.012, 0.4 + r() * 2.6, -4.5 + r() * 7); }
      else if (where < 0.88) { d.rotation.x = -Math.PI / 2; d.rotation.z = r() * 6; d.position.set(-3.5 + r() * 7, 0.004, -4.5 + r() * 7.5); }
      else { d.rotation.x = -Math.PI / 2; d.rotation.z = r() * 6; d.scale.setScalar(0.45); d.position.set(-0.45 + r() * 0.9, TABLE_Y + 0.0015, -1.5 + r() * 3); }
      d.userData.threshold = 0.04 + (i / 46) * 0.92;
      scene.add(d); decals.push(d);
    }
    for (let i = 0; i < 10; i++) {
      const c = Models.decal(t.crack, 0.8 + r() * 0.8);
      if (i < 6) c.position.set(-3.4 + r() * 6.8, 0.8 + r() * 2.2, BACK + 0.011);
      else { c.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2; c.position.set(i % 2 ? -W / 2 + 0.011 : W / 2 - 0.011, 0.8 + r() * 2, -4 + r() * 6); }
      c.userData.threshold = 0.3 + (i / 10) * 0.6;
      scene.add(c); cracks.push(c);
    }

    // you: a first-person camera on a rig that can slump and fall
    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 40);
    rig = new THREE.Group(); rig.position.set(0, 1.27, 2.25); scene.add(rig);
    rig.add(camera);
    camera.rotation.set(-0.3, 0, 0);
    handHolder = new THREE.Group(); handHolder.position.set(-0.05, -0.22, -0.6); handHolder.scale.setScalar(0.82); camera.add(handHolder);
    const handLight = new THREE.PointLight(0xffe0b0, 0.35, 1.2); handLight.position.set(0, 0.1, 0.2); handHolder.add(handLight);

    myGun = Models.revolver();
    myGun.group.traverse(c => { if (c.isMesh) c.castShadow = true; });
    myGun.group.scale.setScalar(1.25);
    myGunRest = { pos: V(0.36, TABLE_Y + 0.02, 1.35), rot: new THREE.Euler(0, Math.PI + 0.25, Math.PI / 2) };
    resetMyGun();
    scene.add(myGun.group);

    stage = { scene, camera, update };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('click', onClick);
  }

  function resetMyGun() {
    if (myGun.group.parent !== scene) scene.attach(myGun.group);
    myGun.group.position.copy(myGunRest.pos);
    myGun.group.rotation.copy(myGunRest.rot);
    myGun.cylinder.position.set(0, 0, 0);
    myGun.cylinder.rotation.set(0, 0, 0);
    myGun.hammer.rotation.set(0, 0, 0);
    myGun.rounds.forEach(r => { r.visible = true; r.material = Models.mats().brass; });
  }

  // ---------- seats ----------

  // Where each opponent sits, by how many there are (matches the 2D layout).
  function seatSpots(n) {
    const far = { pos: V(0, 0, -2.05), ry: 0 };
    const left = { pos: V(-0.98, 0, -0.45), ry: Math.PI / 2 };
    const right = { pos: V(0.98, 0, -0.45), ry: -Math.PI / 2 };
    if (n <= 1) return [far];
    if (n === 2) return [left, right];
    return [far, left, right];
  }

  const PALETTES = [
    { coat: 0x3a2c22, shirt: 0x8a7a60, hat: 0x2a1c12, scarf: 0x6a1a14, skin: 0x8a6a52 },
    { coat: 0x2a3036, shirt: 0x6a6a5a, hat: 0x3a3028, scarf: 0x1a2a4a, skin: 0x9a7a62, beard: null },
    { coat: 0x4a3a2a, shirt: 0xa89878, hat: 0x5a4632, scarf: 0x3a4a2a, skin: 0x7a5a42 },
    { coat: 0x1e1e1e, shirt: 0x5a1a1a, hat: 0x111111, scarf: 0x222222, skin: 0x8a6a56, beard: 0x5a4a3a },
  ];

  function clearSeats() {
    seats.forEach(s => { if (s.group) scene.remove(s.group); s.cards.forEach(c => c.parent && c.parent.remove(c)); });
    pile.forEach(c => scene.remove(c));
    pools.forEach(p => scene.remove(p));
    seats = []; pile = []; pools = [];
  }

  function setup(players) {
    if (!scene) buildRoom();
    clearSeats();
    hovered = selected = -1; covered = false;
    ravage = ravageTarget = 0;
    rig.position.set(0, 1.27, 2.25); rig.rotation.set(0, 0, 0);
    camera.rotation.set(-0.3, 0, 0); camera.fov = 55; camera.updateProjectionMatrix();
    resetMyGun();
    seats.push({ you: true, cards: [], dead: false });
    const spots = seatSpots(players.length - 1);
    players.slice(1).forEach((p, i) => {
      const spot = spots[i];
      const group = new THREE.Group();
      group.position.copy(spot.pos); group.rotation.y = spot.ry;
      const chair = Models.chair(); chair.position.z = -0.05;
      chair.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      group.add(chair);
      const rigObj = Models.outlaw(PALETTES[i % PALETTES.length]);
      group.add(rigObj.root);
      const label = Util.textSprite(p.name, { sub: Bots.label(p) });
      label.position.set(0, 1.6, 0);
      group.add(label);
      scene.add(group);
      const seat = { group, rig: rigObj, cards: [], label, dead: false, name: p.name, sub: Bots.label(p), look: null, idle: Math.random() * 10 };
      seats.push(seat);
      applyPose(rigObj.rArm, restPose(seat, 'r'));
      applyPose(rigObj.lArm, restPose(seat, 'l'));
    });
  }

  // ---------- arm posing (two-bone IK) ----------

  const _m4 = new THREE.Matrix4();
  // Solve shoulder rotation + elbow bend so the hand reaches `t` (spine space).
  function solveArm(arm, t, pole) {
    const S = arm.shoulder.position;
    const D = t.clone().sub(S);
    const dir = D.clone().normalize();
    const d = clamp(D.length(), 0.08, arm.L1 + arm.L2 - 0.002);
    const a = Math.acos(clamp((arm.L1 * arm.L1 + d * d - arm.L2 * arm.L2) / (2 * arm.L1 * d), -1, 1));
    const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
    p.normalize();
    const u = dir.clone().multiplyScalar(Math.cos(a)).add(p.multiplyScalar(Math.sin(a)));
    const elbowPos = S.clone().add(u.clone().multiplyScalar(arm.L1));
    const f = S.clone().add(dir.clone().multiplyScalar(d)).sub(elbowPos).normalize();
    let n = new THREE.Vector3().crossVectors(u, f);
    if (n.lengthSq() < 1e-6) n = new THREE.Vector3().crossVectors(u, V(0, 0, 1));
    if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
    n.normalize();
    const Y = u.clone().negate();
    const Z = new THREE.Vector3().crossVectors(n, Y).normalize();
    _m4.makeBasis(n, Y, Z);
    return { sq: Q().setFromRotationMatrix(_m4), bend: Math.atan2(-f.dot(Z), f.dot(u)) };
  }

  // Full arm pose: hand at `handSp` (spine space), gun pointing at `aimWorld`.
  function makePose(seat, arm, handSp, pole, aimWorld) {
    const r = seat.rig;
    const save = getPose(arm);
    const { sq, bend } = solveArm(arm, handSp, pole);
    arm.shoulder.quaternion.copy(sq);
    arm.elbow.rotation.set(bend, 0, 0);
    r.root.updateMatrixWorld(true);
    let hq = Q();
    if (aimWorld) {
      const handW = arm.hand.getWorldPosition(V(0, 0, 0));
      const w = aimWorld.clone().sub(handW).normalize();
      const Yh = w.clone().negate();
      const up = V(0, 1, 0);
      let Zh = up.clone().sub(w.clone().multiplyScalar(up.dot(w)));
      if (Zh.lengthSq() < 1e-6) Zh.set(0, 0, 1);
      Zh.normalize();
      const Xh = new THREE.Vector3().crossVectors(Yh, Zh).normalize();
      _m4.makeBasis(Xh, Yh, Zh);
      const handWorldQ = Q().setFromRotationMatrix(_m4);
      const elbowWorldQ = arm.elbow.getWorldQuaternion(Q());
      hq = elbowWorldQ.invert().multiply(handWorldQ);
    }
    applyPose(arm, save);
    return { sq, bend, hq };
  }

  function getPose(arm) {
    return { sq: arm.shoulder.quaternion.clone(), bend: arm.elbow.rotation.x, hq: arm.hand.quaternion.clone() };
  }
  function applyPose(arm, p) {
    arm.shoulder.quaternion.copy(p.sq);
    arm.elbow.rotation.set(p.bend, 0, 0);
    arm.hand.quaternion.copy(p.hq);
  }
  function blendPose(arm, a, b, t) {
    arm.shoulder.quaternion.slerpQuaternions(a.sq, b.sq, t);
    arm.elbow.rotation.set(Util.lerp(a.bend, b.bend, t), 0, 0);
    arm.hand.quaternion.slerpQuaternions(a.hq, b.hq, t);
  }
  function moveArm(arm, to, seconds = 0.6, ease = E.inOut) {
    const from = getPose(arm);
    return T(seconds, t => blendPose(arm, from, to, t), ease);
  }

  // spine space -> world
  const spineToWorld = (seat, v) => { seat.rig.root.updateMatrixWorld(true); return seat.rig.spine.localToWorld(v.clone()); };
  const worldToSpine = (seat, v) => { seat.rig.root.updateMatrixWorld(true); return seat.rig.spine.worldToLocal(v.clone()); };

  function restPose(seat, side) {
    const arm = side === 'r' ? seat.rig.rArm : seat.rig.lArm;
    const sx = side === 'r' ? -1 : 1;
    const hand = V(sx * 0.17, 0.27, 0.46);
    return makePose(seat, arm, hand, V(sx * 0.4, -1, -0.3), spineToWorld(seat, V(sx * 0.12, 0.2, 1.2)));
  }
  function readyPose(seat) {
    return makePose(seat, seat.rig.rArm, V(-0.16, 0.48, 0.34), V(-0.5, -1, -0.4), spineToWorld(seat, V(-0.1, 1.2, 1.0)));
  }
  function aimPose(seat, targetWorld) {
    const S = seat.rig.rArm.shoulder.position;
    const tSp = worldToSpine(seat, targetWorld);
    const hand = S.clone().add(tSp.clone().sub(S).normalize().multiplyScalar(0.55));
    return makePose(seat, seat.rig.rArm, hand, V(-0.6, -1, 0), targetWorld);
  }
  function selfPose(seat) {
    const head = V(0, 0.75, 0.02);
    return makePose(seat, seat.rig.rArm, V(-0.3, 0.8, 0.06), V(-1, -0.6, -0.2), spineToWorld(seat, head));
  }
  function peekPose(seat) {
    return makePose(seat, seat.rig.rArm, V(-0.06, 0.5, 0.36), V(-0.5, -1, -0.2), spineToWorld(seat, V(0.1, 0.9, 1.2)));
  }

  function headWorld(pi) {
    if (pi === 0) return camera.getWorldPosition(V(0, 0, 0));
    const s = seats[pi];
    s.rig.root.updateMatrixWorld(true);
    return s.rig.head.localToWorld(V(0, 0.1, 0.02));
  }

  // ---------- per-frame ----------

  function update(dt, time) {
    // ease the room toward the target ravage level
    ravage += (ravageTarget - ravage) * Math.min(1, dt * 0.9);
    const R = ravage;

    // lamp: swings and flickers more as things get worse
    lamp.group.rotation.z = Math.sin(time * (0.8 + R)) * (0.015 + R * 0.12);
    lamp.group.rotation.x = Math.cos(time * 0.6) * R * 0.05;
    if (Math.random() < R * 0.06) flicker = 0.15 + Math.random() * 0.5;
    else flicker += (1 - flicker) * Math.min(1, dt * 9);
    lamp.light.intensity = (2.4 - R * 0.6) * flicker;
    lamp.bulbMat.emissiveIntensity = 2 * flicker;
    lamp.light.color.setRGB(1, 0.85 - R * 0.25, 0.63 - R * 0.35);
    hemi.intensity = 0.45 - R * 0.25;
    scene.fog.near = 6 - R * 3.5; scene.fog.far = 14 - R * 6;

    // furniture comes apart
    shelves.forEach((s, i) => {
      const start = i === 0 ? 0.5 : 0.7;
      const k = clamp((R - start) / 0.25, 0, 1);
      s.pivot.rotation.x = i === 0 ? k * 0.32 : E.bounce(k) * 1.45;
      s.books.forEach(b => {
        const th = 0.15 + b.userData.fall * 0.7;
        const f = clamp((R - th) / 0.08, 0, 1);
        if (f <= 0) { b.position.copy(b.userData.home); b.rotation.set(0, 0, 0); return; }
        const home = b.userData.home, dest = b.userData.dest;
        b.position.set(Util.lerp(home.x, dest.x, f), Util.lerp(home.y, dest.y, E.in(f)) + Math.sin(f * Math.PI) * 0.15, Util.lerp(home.z, dest.z, f));
        b.rotation.set(b.userData.destRot.x * f, b.userData.destRot.y * f, b.userData.destRot.z * f);
      });
    });
    const dk = clamp((R - 0.4) / 0.3, 0, 1);
    deskL.rotation.z = -dk * 0.12; deskL.position.y = -dk * 0.05;
    const dk2 = clamp((R - 0.65) / 0.25, 0, 1);
    deskR.rotation.x = E.bounce(dk2) * 1.4; deskR.position.z = -4.65 + dk2 * 0.4;
    deskL.userData.papers.visible = R < 0.35;
    if (R < 0.85) { picture.rotation.z = R * 0.55; picture.position.y = 2.05; picture.rotation.x = 0; }
    else { const pk = clamp((R - 0.85) / 0.1, 0, 1); picture.position.y = Util.lerp(2.05, 0.32, E.bounce(pk)); picture.rotation.z = 0.47 + pk * 0.4; picture.rotation.x = -pk * 0.25; }
    doorObj.userData.hinge.rotation.y = -(0.03 + R * 1.1);

    decals.forEach(d => { d.material.opacity = showBlood ? clamp((R - d.userData.threshold) * 8, 0, 1) : 0; });
    cracks.forEach(c => { c.material.opacity = clamp((R - c.userData.threshold) * 5, 0, 0.9); });
    pools.forEach(p => { p.visible = showBlood; });

    // the living breathe, fidget and watch whoever is acting
    seats.forEach((s, i) => {
      if (!s.rig || s.dead) return;
      const r = s.rig;
      const nerves = 0.01 + R * 0.03;
      r.spine.rotation.x = 0.06 + Math.sin(time * 1.6 + s.idle) * 0.012 + (s.lean || 0);
      r.spine.rotation.z = Math.sin(time * 0.7 + s.idle) * nerves;
      r.spine.scale.y = 1 + Math.sin(time * 1.6 + s.idle) * 0.008;
      const look = s.look !== null && s.look !== undefined ? headWorld(s.look) : camera.getWorldPosition(V(0, 0, 0));
      const lp = r.spine.worldToLocal(look.clone()).sub(r.head.position);
      const yaw = clamp(Math.atan2(lp.x, lp.z), -1.1, 1.1);
      const pitch = clamp(-Math.atan2(lp.y - 0.1, Math.hypot(lp.x, lp.z)), -0.5, 0.6) + (s.headDown || 0);
      r.head.rotation.y += (yaw + Math.sin(time * 0.4 + s.idle) * 0.08 - r.head.rotation.y) * Math.min(1, dt * 4);
      r.head.rotation.x += (pitch - r.head.rotation.x) * Math.min(1, dt * 4);
      r.eyeMat.emissive.setRGB(R > 0.55 ? (R - 0.55) * 2.2 : 0, 0, 0);
    });

    // your cards drift to their slots (hover/selection lift)
    seats.forEach(s => s.cards.forEach(c => {
      if (c.userData.flying || !c.userData.slot) return;
      const k = Math.min(1, dt * 12);
      c.position.lerp(c.userData.slot.pos, k);
      c.quaternion.slerp(c.userData.slot.quat, k);
    }));
  }

  // ---------- cards ----------

  function slotFor(pi, i, n) {
    const off = i - (n - 1) / 2;
    if (pi === 0) {
      const lift = (i === hovered ? 0.025 : 0) + (i === selected ? 0.055 : 0);
      const pos = V(off * 0.105, -Math.abs(off) * 0.014 + lift, i * 0.002 + (i === selected ? 0.01 : 0));
      const quat = Q().setFromEuler(new THREE.Euler(0, covered ? Math.PI : 0, -off * 0.11));
      return { pos, quat };
    }
    const pos = V(off * 0.16, TABLE_Y + 0.0012 + i * 0.0004, 0.5);
    const quat = Q().setFromEuler(new THREE.Euler(Math.PI / 2, 0, off * 0.08 + Math.sin(i * 3.1) * 0.05));
    return { pos, quat };
  }

  function relayout(pi) {
    const s = seats[pi];
    s.cards.forEach((c, i) => { c.userData.slot = slotFor(pi, i, s.cards.length); });
  }

  function parentOf(pi) { return pi === 0 ? handHolder : seats[pi].group; }

  // Fly an object along an arc to a world position/rotation.
  function flyTo(obj, toPos, toQuat, seconds, height = 0.25, spin = 0) {
    scene.attach(obj);
    obj.userData.flying = true;
    const fromPos = obj.position.clone(), fromQuat = obj.quaternion.clone();
    return T(seconds, t => {
      obj.position.lerpVectors(fromPos, toPos, t);
      obj.position.y += Math.sin(t * Math.PI) * height;
      obj.quaternion.slerpQuaternions(fromQuat, toQuat, t);
      if (spin) obj.rotateZ(Math.sin(t * Math.PI) * spin);
    }, E.inOut).then(() => { obj.userData.flying = false; });
  }

  function worldSlot(pi, slot) {
    const parent = parentOf(pi);
    parent.updateMatrixWorld(true);
    const pos = parent.localToWorld(slot.pos.clone());
    const quat = parent.getWorldQuaternion(Q()).multiply(slot.quat);
    return { pos, quat };
  }

  // Deal cards from the deck to a seat, one after another.
  async function deal(pi, ids) {
    const s = seats[pi];
    for (const id of ids) {
      const c = Models.card(id);
      c.traverse(o => { if (o.isMesh) o.castShadow = true; });
      c.position.copy(DECK_POS).add(V(0, 0.015, 0));
      c.rotation.set(Math.PI / 2, 0, 0);
      scene.add(c);
      s.cards.push(c);
      relayout(pi);
      const w = worldSlot(pi, c.userData.slot);
      Sound.cardFlick();
      await flyTo(c, w.pos, w.quat, 0.38, pi === 0 ? 0.15 : 0.22);
      parentOf(pi).attach(c);
      c.position.copy(c.userData.slot.pos); c.quaternion.copy(c.userData.slot.quat);
      s.cards.forEach((cc, i) => { if (cc !== c) cc.userData.slot = slotFor(pi, i, s.cards.length); });
    }
  }

  // Play a card from a seat onto the pile, face up.
  async function play(pi, index) {
    const s = seats[pi];
    const c = s.cards[index];
    if (!c) return;
    if (pi === 0) { selected = -1; hovered = -1; }
    else if (s.rig) {
      // reach for the card with the left hand
      const cw = c.getWorldPosition(V(0, 0, 0));
      const from = getPose(s.rig.lArm);
      await moveArm(s.rig.lArm, makePose(s, s.rig.lArm, worldToSpine(s, cw.clone().add(V(0, 0.03, 0))), V(0.4, -1, -0.3), null), 0.45);
      moveArm(s.rig.lArm, from, 0.5);
    }
    s.cards.splice(index, 1);
    relayout(pi);
    const k = pile.length;
    const toPos = V((Math.random() - 0.5) * 0.12, TABLE_Y + 0.0015 + k * 0.0012, (Math.random() - 0.5) * 0.12 - 0.1);
    const toQuat = Q().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, (Math.random() - 0.5) * 1.2));
    Sound.cardFlick();
    await flyTo(c, toPos, toQuat, 0.55, 0.35, pi === 0 ? 0 : 0.6);
    c.userData.slot = null;
    pile.push(c);
    if (pile.length > 24) scene.remove(pile.shift());
  }

  function setCovered(v) {
    covered = v;
    if (v) selected = -1;
    relayout(0);
  }
  function select(i) { selected = i; relayout(0); }

  // ---------- pointer ----------

  function onPointerMove(e) {
    if (Engine.stage !== stage) return;
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const i = pickCard(e);
    if (i !== hovered) { hovered = i; relayout(0); document.body.style.cursor = i >= 0 ? 'pointer' : ''; }
  }
  function onClick(e) {
    if (Engine.stage !== stage) return;
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const i = pickCard(e);
    if (i >= 0 && api.onCardClick) api.onCardClick(i);
  }
  function pickCard(e) {
    if (e.target && e.target.id !== 'gl' && !e.target.classList.contains('screen')) return -1;
    if (covered || !seats[0]) return -1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(seats[0].cards, true);
    if (!hits.length) return -1;
    let o = hits[0].object;
    while (o && !seats[0].cards.includes(o)) o = o.parent;
    return o ? seats[0].cards.indexOf(o) : -1;
  }

  // ---------- guns ----------

  // Camera-space pose for your revolver pointing at a world position.
  function myAimQuat(posLocal, targetWorld) {
    camera.updateMatrixWorld(true);
    const tLocal = camera.worldToLocal(targetWorld.clone());
    _m4.lookAt(tLocal, posLocal, V(0, 1, 0));
    return Q().setFromRotationMatrix(_m4);
  }

  async function raiseMyGun(pos, quat, seconds = 0.7) {
    camera.attach(myGun.group);
    const p0 = myGun.group.position.clone(), q0 = myGun.group.quaternion.clone();
    const s0 = myGun.group.scale.x;
    await T(seconds, t => {
      myGun.group.position.lerpVectors(p0, pos, t);
      myGun.group.position.y += Math.sin(t * Math.PI) * 0.05;
      myGun.group.quaternion.slerpQuaternions(q0, quat, t);
      myGun.group.scale.setScalar(Util.lerp(s0, 1, t));
    }, E.inOut);
  }

  async function lowerMyGun() {
    scene.attach(myGun.group);
    const p0 = myGun.group.position.clone(), q0 = myGun.group.quaternion.clone();
    const q1 = Q().setFromEuler(myGunRest.rot);
    const s0 = myGun.group.scale.x;
    await T(0.6, t => {
      myGun.group.position.lerpVectors(p0, myGunRest.pos, t);
      myGun.group.position.y += Math.sin(t * Math.PI) * 0.1;
      myGun.group.quaternion.slerpQuaternions(q0, q1, t);
      myGun.group.scale.setScalar(Util.lerp(s0, 1.25, t));
    }, E.inOut);
    myGun.cylinder.position.set(0, 0, 0);
  }

  async function cock(gun) {
    Sound.cock && Sound.cock();
    const c0 = gun.cylinder.rotation.z;
    await T(0.28, t => { gun.hammer.rotation.x = -0.8 * t; gun.cylinder.rotation.z = c0 + (Math.PI / 3) * t; }, E.inOut);
  }

  // Everyone takes their gun up for a shootout.
  async function drawGuns() {
    const jobs = [];
    seats.forEach((s, i) => {
      if (!s.rig || s.dead) return;
      s.lean = 0.04;
      jobs.push(moveArm(s.rig.rArm, readyPose(s), 0.6 + i * 0.1, E.out));
    });
    await Promise.all(jobs);
  }
  async function holsterGuns() {
    const jobs = [];
    seats.forEach(s => {
      if (!s.rig || s.dead) return;
      s.lean = 0; s.look = null; s.headDown = 0;
      jobs.push(moveArm(s.rig.rArm, restPose(s, 'r'), 0.7));
    });
    await Promise.all(jobs);
  }

  // Shooter points their gun at the target (or at themself).
  async function aim(si, ti) {
    seats.forEach((s, i) => { if (s.rig && !s.dead && i !== si) s.look = si; });
    if (si === 0) {
      if (ti === 0) {
        const pos = V(0.13, -0.05, -0.19);
        const q = Q().setFromRotationMatrix(_m4.lookAt(V(0.02, 0.03, 0.02), pos, V(0, 1, 0)));
        T(0.7, t => { rig.rotation.z = -0.1 * t; camera.fov = 55 - 7 * t; camera.updateProjectionMatrix(); });
        await raiseMyGun(pos, q);
      } else {
        const tw = headWorld(ti);
        const pos = V(0.08, -0.13, -0.34);
        await raiseMyGun(pos, myAimQuat(pos, tw));
      }
      await cock(myGun);
      return;
    }
    const s = seats[si];
    s.look = ti === si ? null : ti;
    if (ti === si) {
      s.headDown = 0.15;
      await moveArm(s.rig.rArm, selfPose(s), 0.9, E.inOut);
    } else {
      s.lean = 0.12;
      await moveArm(s.rig.rArm, aimPose(s, headWorld(ti)), 0.7, E.out);
    }
    await cock(s.rig.gun);
  }

  function muzzleOf(si) {
    const g = si === 0 ? myGun : seats[si].rig.gun;
    return { pos: g.muzzle.getWorldPosition(V(0, 0, 0)), gun: g };
  }

  // Pull the trigger. Live rounds flash, kick and kill the target.
  async function shoot(si, ti, live) {
    const { pos, gun } = muzzleOf(si);
    gun.hammer.rotation.x = 0;
    if (!live) {
      // blank: the hammer falls on nothing; the shooter flinches
      if (si !== 0) {
        const s = seats[si];
        await T(0.18, t => { s.rig.spine.rotation.x += 0; s.rig.head.rotation.z = Math.sin(t * Math.PI) * 0.12; });
      } else {
        await T(0.18, t => { rig.position.y = 1.27 - Math.sin(t * Math.PI) * 0.015; });
      }
      return;
    }
    const target = headWorld(ti);
    const dir = target.clone().sub(pos).normalize();
    FX.muzzleFlash(scene, pos, 0.4);
    FX.smoke(scene, pos, dir, 8, 0.7);
    lamp.light.intensity *= 1.6;
    // tracer
    const len = pos.distanceTo(target);
    const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    tracer.position.copy(pos).add(target).multiplyScalar(0.5);
    tracer.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    scene.add(tracer);
    T(0.15, t => { tracer.material.opacity = 0.8 * (1 - t); }).then(() => scene.remove(tracer));

    // recoil
    if (si === 0) {
      const p0 = myGun.group.position.clone();
      T(0.3, t => {
        const k = Math.sin(t * Math.PI);
        myGun.group.position.set(p0.x, p0.y + k * 0.03, p0.z + k * 0.05);
        myGun.group.rotateX(-k * 0.08 * (1 - t));
        camera.rotation.x = -0.3 + k * 0.03;
      }, E.out);
    } else if (ti !== si) {
      const s = seats[si];
      const q0 = s.rig.rArm.shoulder.quaternion.clone();
      T(0.3, t => {
        const k = Math.sin(t * Math.PI) * (1 - t);
        s.rig.rArm.shoulder.quaternion.copy(q0).multiply(Q().setFromAxisAngle(V(1, 0, 0), -k * 0.5));
      }, E.out);
    }
    await kill(ti, dir);
  }

  // The target takes the bullet.
  async function kill(ti, dir) {
    if (ti === 0) { await killMe(dir); return; }
    const s = seats[ti];
    s.dead = true;
    const head = headWorld(ti);
    FX.blood(scene, head, dir, TABLE_Y);
    const r = s.rig;
    r.eyeMat.emissive.setRGB(0, 0, 0);
    // knocked back, then slumps forward onto the table
    const sx0 = r.spine.rotation.x, sz0 = r.spine.rotation.z;
    const sideKick = Math.sign(dir.x * Math.cos(s.group.rotation.y) - dir.z * Math.sin(s.group.rotation.y)) || 1;
    flyHat(s, dir);
    dropGun(s);
    await T(0.16, t => { r.spine.rotation.x = sx0 - 0.35 * t; r.head.rotation.x = -0.5 * t; r.spine.rotation.z = sz0 + sideKick * 0.15 * t; }, E.out);
    moveArm(r.rArm, makePose(s, r.rArm, V(-0.3, -0.1, 0.25), V(-1, -1, 0), null), 0.8, E.in);
    moveArm(r.lArm, makePose(s, r.lArm, V(0.25, 0.1, 0.5), V(1, -1, 0), null), 0.8, E.in);
    await T(0.9, t => {
      r.spine.rotation.x = Util.lerp(sx0 - 0.35, 0.92, t);
      r.spine.rotation.z = Util.lerp(sz0 + sideKick * 0.15, sideKick * 0.12, t);
      r.head.rotation.x = Util.lerp(-0.5, 0.45, t);
      r.head.rotation.y = Util.lerp(r.head.rotation.y, sideKick * 0.5, t * 0.2);
    }, E.bounce);
    // blood pools on the table under them
    const pool = Models.decal(Models.tex().pool, 0.5);
    pool.rotation.x = -Math.PI / 2;
    const p = s.group.localToWorld(V(0.05, TABLE_Y + 0.002, 0.5));
    pool.position.copy(p);
    pool.material.opacity = 1;
    pool.scale.setScalar(0.1);
    scene.add(pool); pools.push(pool);
    T(3, t => pool.scale.setScalar(0.1 + t * 0.9), E.out);
    // label turns red
    s.group.remove(s.label);
    s.label = Util.textSprite(s.name + ' — DEAD', { color: '#e0402a', sub: s.sub });
    s.label.position.set(0, 1.6, 0);
    s.group.add(s.label);
  }

  function flyHat(s, dir) {
    const hat = s.rig.hat;
    scene.attach(hat);
    const p0 = hat.position.clone();
    const p1 = p0.clone().add(dir.clone().setY(0).normalize().multiplyScalar(0.9)); p1.y = 0.02;
    const q0 = hat.quaternion.clone();
    const q1 = Q().setFromEuler(new THREE.Euler(Math.PI * (Math.random() < 0.5 ? 1 : 0.1), Math.random() * 6, 0.2));
    T(1.0, t => {
      hat.position.lerpVectors(p0, p1, t);
      hat.position.y = Util.lerp(p0.y, p1.y, E.in(t)) + Math.sin(t * Math.PI) * 0.4;
      hat.quaternion.slerpQuaternions(q0, q1, t);
      hat.rotateY(t * 8);
    }, E.linear);
  }

  function dropGun(s) {
    const g = s.rig.gun.group;
    scene.attach(g);
    const p0 = g.position.clone();
    const p1 = s.group.localToWorld(V(-0.3, TABLE_Y + 0.02, 0.38));
    const q0 = g.quaternion.clone();
    const q1 = Q().setFromEuler(new THREE.Euler(0, Math.random() * 6, Math.PI / 2));
    T(0.6, t => {
      g.position.lerpVectors(p0, p1, t);
      g.position.y = Util.lerp(p0.y, p1.y, E.bounce(t));
      g.quaternion.slerpQuaternions(q0, q1, t);
    }, E.linear);
  }

  // You were shot: the view jerks, then you fall onto the table.
  async function killMe(dir) {
    seats[0].dead = true;
    const r0 = rig.rotation.clone(), p0 = rig.position.clone();
    const away = dir ? Math.sign(dir.x) || 1 : 1;
    if (myGun.group.parent === camera) lowerMyGun();
    await T(0.15, t => { rig.rotation.z = r0.z + away * -0.25 * t; rig.rotation.x = r0.x + 0.15 * t; }, E.out);
    await T(1.2, t => {
      rig.position.set(p0.x + away * 0.15 * t, Util.lerp(p0.y, TABLE_Y + 0.12, t), Util.lerp(p0.z, 1.75, t));
      rig.rotation.z = Util.lerp(r0.z - away * 0.25, away * 1.35, t);
      rig.rotation.x = Util.lerp(r0.x + 0.15, -0.35, t);
    }, E.bounce);
    FX.blood(scene, camera.getWorldPosition(V(0, 0, 0)).add(V(0, 0, -0.7)), V(0, -0.5, -1), TABLE_Y);
  }

  // After a shot: shooter lowers the gun (with relief on a blank).
  async function recover(si, ti, live) {
    if (si === 0) {
      if (seats[0].dead) return;
      T(0.5, t => { rig.rotation.z = Util.lerp(rig.rotation.z, 0, t); camera.fov = Util.lerp(camera.fov, 55, t); camera.updateProjectionMatrix(); camera.rotation.x = -0.3; });
      await lowerMyGun();
      return;
    }
    const s = seats[si];
    if (s.dead) return;
    s.headDown = 0; s.lean = 0.04;
    if (ti === si && !live) {
      // exhale
      await T(0.5, t => { s.rig.spine.rotation.x += Math.sin(t * Math.PI) * 0.004; });
    }
    await moveArm(s.rig.rArm, readyPose(s), 0.6);
  }

  // ---------- card effects ----------

  // 1/2/3 for you: lift your revolver, swing the cylinder out and spin the
  // chosen chamber to the top. Live rounds glow red; blanks show an empty hole.
  async function peek(pi, n, live) {
    if (pi !== 0) {
      const s = seats[pi];
      const from = getPose(s.rig.rArm);
      s.headDown = 0.45;
      await moveArm(s.rig.rArm, peekPose(s), 0.6);
      const cyl = s.rig.gun.cylinder;
      await T(0.3, t => { cyl.position.x = -0.035 * t; });
      await T(0.9, t => { cyl.rotation.z = t * Math.PI * 3; }, E.out);
      await T(0.3, t => { cyl.position.x = -0.035 * (1 - t); });
      s.headDown = 0;
      await moveArm(s.rig.rArm, from, 0.6);
      return;
    }
    const pos = V(0.02, -0.06, -0.3);
    const q = Q().setFromEuler(new THREE.Euler(0.35, Math.PI + 0.35, 0));
    await raiseMyGun(pos, q, 0.7);
    const cyl = myGun.cylinder;
    myGun.rounds.forEach((r, i) => { r.visible = false; });
    await T(0.35, t => { cyl.position.x = -0.045 * t; }, E.out);
    const chamber = n - 1;
    const angle = (chamber / 6) * Math.PI * 2;
    const finalRot = Math.PI / 2 - angle + Math.PI * 4;
    const r0 = cyl.rotation.z;
    await T(1.1, t => { cyl.rotation.z = Util.lerp(r0, finalRot, t); }, E.out);
    const round = myGun.rounds[chamber];
    const glow = new THREE.PointLight(live ? 0xff2010 : 0xc8e0ff, 0, 0.4);
    round.getWorldPosition(glow.position);
    scene.add(glow);
    if (live) {
      round.visible = true;
      round.material = new THREE.MeshStandardMaterial({ color: 0xc8963c, emissive: 0xff2000, emissiveIntensity: 0, metalness: 0.8, roughness: 0.3 });
    }
    await T(0.4, t => { glow.intensity = 2.5 * t; if (live) round.material.emissiveIntensity = 1.2 * t; });
    await Engine.wait(1.1);
    await T(0.3, t => { glow.intensity = 2.5 * (1 - t); if (live) round.material.emissiveIntensity = 1.2 * (1 - t); });
    scene.remove(glow);
    await T(0.3, t => { cyl.position.x = -0.045 * (1 - t); });
    myGun.rounds.forEach(r => { r.visible = true; r.material = Models.mats().brass; });
    await lowerMyGun();
  }

  // Jack of Trades: a golden glow bursts off the card on the pile.
  async function jackGlow() {
    const top = pile[pile.length - 1];
    const light = new THREE.PointLight(0xffc040, 0, 3);
    if (top) top.getWorldPosition(light.position);
    light.position.y += 0.2;
    scene.add(light);
    if (top) FX.burst(scene, light.position, { count: 40, color: 0xffd040, emissive: true, size: 0.01, speed: 1.5, dir: V(0, 1, 0), gravity: 1, life: 1.5 });
    await T(0.6, t => { light.intensity = 6 * t; });
    await T(0.8, t => { light.intensity = 6 * (1 - t); });
    scene.remove(light);
  }

  // Bloody Mary: the lamp gutters and the room bleeds red for a moment.
  async function bloodyMary() {
    const c0 = lamp.light.color.clone();
    await T(0.4, t => { lamp.light.color.setRGB(1, 0.85 * (1 - t), 0.6 * (1 - t)); flicker = 0.4 + Math.random() * 0.6; });
    await Engine.wait(0.5);
    await T(0.5, t => { lamp.light.color.lerpColors(new THREE.Color(1, 0, 0), c0, t); });
  }

  api = {
    setup, deal, play, select, setCovered, drawGuns, holsterGuns, aim, shoot, recover, peek, jackGlow, bloodyMary,
    show() { if (!scene) buildRoom(); Engine.setStage(stage); },
    setRavage(v) { ravageTarget = clamp(v, 0, 1); },
    setBlood(v) { showBlood = v; },
    onCardClick: null,
    get cardCount() { return seats[0] ? seats[0].cards.length : 0; },
  };
  return api;
})();
