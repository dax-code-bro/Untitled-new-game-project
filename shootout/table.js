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
  let lamp, hemi, myGun, myGunRest, myShotgun = null, myShotgunRest, boxObj = null;
  let shelves = [], deskL, deskR, picture, doorObj, decals = [], cracks = [], pools = [];
  let seats = [];          // seats[i] = { group, rig?, cards: [], label, dead, name }
  let pile = [];
  let ravageTarget = 0, ravage = 0, showBlood = true;
  let flicker = 1, hovered = -1, selected = -1, covered = false;
  let drag = null;           // a card being dragged up out of your hand
  let fovLock = false;       // true while an animation zooms the camera
  // Wider view on tall phone screens so the table and your cards still fit.
  const baseFov = () => (camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 64 : 55);
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
    // remember where things stand so a new game can put back what a nuke blew away
    [...shelves.map(sh => sh.pivot), deskL, deskR, picture].forEach(o => { o.userData.home = { p: o.position.clone(), r: o.rotation.clone() }; });

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
    myShotgunRest = { pos: V(-0.02, TABLE_Y + 0.03, 1.28), rot: new THREE.Euler(0, Math.PI - 0.2, Math.PI / 2), scale: 1 };
    myGunRest.scale = 1.25;
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', () => { drag = null; if (seats[0]) relayout(0); });
  }

  function resetMyGun() {
    if (myShotgun) { myShotgun.group.parent && myShotgun.group.parent.remove(myShotgun.group); myShotgun = null; }
    if (boxObj) { scene.remove(boxObj); boxObj = null; }
    myGun.group.visible = true;
    myGun.group.scale.setScalar(1.25);
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

  let junk = [];   // leftovers of a nuclear blast, cleared with the table
  function clearSeats() {
    junk.forEach(j => scene.remove(j)); junk = [];
    [...shelves.map(sh => sh.pivot), deskL, deskR, picture].forEach(o => { if (o && o.userData.home) { o.position.copy(o.userData.home.p); o.rotation.copy(o.userData.home.r); } });
    if (boxObj) { scene.remove(boxObj); boxObj = null; }
    seats.forEach(s => { if (s.group) scene.remove(s.group); s.cards.forEach(c => c.parent && c.parent.remove(c)); });
    pile.forEach(c => scene.remove(c));
    pools.forEach(p => scene.remove(p));
    seats = []; pile = []; pools = [];
  }

  function setup(players) {
    if (!scene) buildRoom();
    clearSeats();
    hovered = selected = -1; covered = false; drag = null; bino = null;
    handHolder.visible = true;
    document.body.style.cursor = '';
    ravage = ravageTarget = 0;
    rig.position.set(0, 1.27, 2.25); rig.rotation.set(0, 0, 0);
    camera.rotation.set(-0.3, 0, 0); fovLock = false; camera.fov = baseFov(); camera.updateProjectionMatrix();
    resetMyGun();
    const youGroup = new THREE.Group();
    youGroup.position.set(0, 0, 2.05); youGroup.rotation.y = Math.PI;
    scene.add(youGroup);
    seats.push({ you: true, group: youGroup, cards: [], items: [], marks: [], tags: [], dead: false });
    const spots = seatSpots(players.length - 1);
    players.slice(1).forEach((p, i) => {
      const spot = spots[i];
      const group = new THREE.Group();
      group.position.copy(spot.pos); group.rotation.y = spot.ry;
      const chair = Models.chair(); chair.position.z = -0.05;
      chair.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      group.add(chair);
      const rigObj = Models.outlaw(PALETTES[(p.pal != null ? p.pal : i) % PALETTES.length]);
      group.add(rigObj.root);
      const sub = p.sub || Bots.label(p);
      const label = Util.textSprite(p.name, { sub });
      label.position.set(0, 1.6, 0);
      group.add(label);
      scene.add(group);
      const seat = { group, chair, rig: rigObj, cards: [], items: [], marks: [], tags: [], label, dead: false, name: p.name, sub, look: null, idle: Math.random() * 10, drip: 0 };
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
      if (s.bleeding) {
        s.drip -= dt;
        if (s.drip <= 0) {
          s.drip = 0.35 + Math.random() * 0.5;
          FX.burst(scene, chestWorld(i), { count: 2, color: 0x7a0000, size: 0.01, speed: 0.2, dir: V(0, -1, 0), spread: 0.2, gravity: 9, life: 1.2, floor: 0.002 });
        }
      }
    });

    // camera and hand adapt to the screen shape: on a tall phone the view
    // widens and the hand shrinks so every card fits on screen
    if (!fovLock && Math.abs(camera.fov - baseFov()) > 0.01) { camera.fov = baseFov(); camera.updateProjectionMatrix(); }
    if (seats[0]) {
      const halfH = 0.6 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const halfW = halfH * camera.aspect;
      const n = Math.max(1, seats[0].cards.length);
      const fan = Math.min(0.105, 0.36 / n) * (n - 1) + Models.CARD_W + 0.04;
      const sc = Math.min(0.82, (2 * halfW * 0.94) / fan);
      handHolder.scale.setScalar(sc);
      handHolder.position.set(0, -halfH + Models.CARD_H * sc * 0.56, -0.6);
    }

    seats.forEach(st => {
      const ring = st.reverseRing;
      if (!ring) return;
      ring.rotation.z += dt * 2.5;
      ring.position.y += Math.sin(time * 3) * 0.0004;
      ring.userData.flash = Math.max(0, (ring.userData.flash || 0) - dt * 2);
      ring.material.emissiveIntensity = 1.2 + ring.userData.flash * 4;
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
      const spacing = Math.min(0.105, 0.36 / Math.max(1, n));
      let lift = (i === hovered ? 0.025 : 0) + (i === selected ? 0.055 : 0);
      if (drag && drag.i === i && drag.moved) lift = Math.min(0.3, Math.max(0, drag.dy) / innerHeight * 0.75);
      const pos = V(off * spacing, -Math.abs(off) * 0.014 + lift, i * 0.002 + (i === selected ? 0.01 : 0));
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

  // Tap a card to pick it (tap again to play), or drag it up onto the table.
  const setPointer = e => pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  function onPointerDown(e) {
    if (Engine.stage !== stage) return;
    setPointer(e);
    const i = pickCard(e);
    if (i >= 0) drag = { i, y0: e.clientY, dy: 0, moved: false };
  }
  function onPointerMove(e) {
    if (Engine.stage !== stage) return;
    setPointer(e);
    if (drag) {
      drag.dy = drag.y0 - e.clientY;
      if (Math.abs(drag.dy) > 12) drag.moved = true;
      relayout(0);
      return;
    }
    const i = e.pointerType === 'mouse' ? pickCard(e) : -1;
    const overBox = e.pointerType === 'mouse' && pickBox(e);
    if (i !== hovered) { hovered = i; relayout(0); }
    document.body.style.cursor = i >= 0 || overBox ? 'pointer' : '';
  }
  function onPointerUp(e) {
    if (Engine.stage !== stage) return;
    setPointer(e);
    if (drag) {
      const d = drag;
      drag = null;
      relayout(0);
      if (!d.moved) { if (api.onCardClick) api.onCardClick(d.i); }
      else if (d.dy > innerHeight * 0.12 && api.onCardDrop) api.onCardDrop(d.i);
      return;
    }
    if (pickBox(e) && api.onBoxClick) api.onBoxClick();
  }
  function pickBox(e) {
    if (!boxObj || !boxObj.userData.mine || boxObj.userData.opening) return false;
    if (e.target && e.target.id !== 'gl' && !e.target.classList.contains('screen')) return false;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(boxObj, true).length > 0;
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

  // The gun you shoot with: the shotgun while you hold one, else your revolver.
  const myWeapon = () => myShotgun || myGun;
  const restOf = w => (w === myGun ? myGunRest : myShotgunRest);
  // A bot's weapon in hand.
  const weaponOf = s => s.shotgun || s.rig.gun;

  async function raiseMyGun(pos, quat, seconds = 0.7, w = myWeapon()) {
    camera.attach(w.group);
    const p0 = w.group.position.clone(), q0 = w.group.quaternion.clone();
    const s0 = w.group.scale.x;
    await T(seconds, t => {
      w.group.position.lerpVectors(p0, pos, t);
      w.group.position.y += Math.sin(t * Math.PI) * 0.05;
      w.group.quaternion.slerpQuaternions(q0, quat, t);
      w.group.scale.setScalar(Util.lerp(s0, 1, t));
    }, E.inOut);
  }

  async function lowerMyGun(w = null) {
    w = w || (myShotgun && myShotgun.group.parent === camera ? myShotgun : myGun);
    const rest = restOf(w);
    scene.attach(w.group);
    const p0 = w.group.position.clone(), q0 = w.group.quaternion.clone();
    const q1 = Q().setFromEuler(rest.rot);
    const s0 = w.group.scale.x;
    await T(0.6, t => {
      w.group.position.lerpVectors(p0, rest.pos, t);
      w.group.position.y += Math.sin(t * Math.PI) * 0.1;
      w.group.quaternion.slerpQuaternions(q0, q1, t);
      w.group.scale.setScalar(Util.lerp(s0, rest.scale, t));
    }, E.inOut);
    w.cylinder.position.set(0, 0, 0);
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
        fovLock = true;
        const f0 = camera.fov;
        T(0.7, t => { rig.rotation.z = -0.1 * t; camera.fov = f0 - 7 * t; camera.updateProjectionMatrix(); });
        await raiseMyGun(pos, q);
      } else {
        const tw = headWorld(ti);
        const pos = V(0.08, -0.13, -0.34);
        await raiseMyGun(pos, myAimQuat(pos, tw));
      }
      await cock(myWeapon());
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
    await cock(weaponOf(s));
  }

  function muzzleOf(si) {
    const g = si === 0 ? myWeapon() : weaponOf(seats[si]);
    return { pos: g.muzzle.getWorldPosition(V(0, 0, 0)), gun: g };
  }

  // Pull the trigger. Live rounds flash and kick; `opts.lethal` kills the
  // target, otherwise a live round wounds them and they start bleeding.
  async function shoot(si, ti, live, opts = {}) {
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
    const big = gun.shotgun;
    const vi = opts.victim != null ? opts.victim : ti;
    const target = opts.lethal || big ? headWorld(ti) : chestWorld(ti);
    const dir = target.clone().sub(pos).normalize();
    FX.muzzleFlash(scene, pos, big ? 0.8 : 0.4);
    FX.smoke(scene, pos, dir, big ? 18 : 8, big ? 1.2 : 0.7);
    if (big) FX.burst(scene, pos, { count: 18, color: 0xffc060, emissive: true, size: 0.006, speed: 6, dir: dir.clone().multiplyScalar(3), spread: 0.3, gravity: 0, life: 0.25 });
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
      const w = myWeapon(), kick = big ? 2.2 : 1;
      const p0w = w.group.position.clone();
      T(0.3, t => {
        const k = Math.sin(t * Math.PI) * kick;
        w.group.position.set(p0w.x, p0w.y + k * 0.03, p0w.z + k * 0.05);
        w.group.rotateX(-k * 0.08 * (1 - t));
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
    if (big) breakOpen(gun);
    if (opts.reverse) {
      // the shot hits the reverse ring and flies back at the shooter
      await Engine.wait(0.12);
      const ring = seats[ti].reverseRing;
      if (ring) { ring.userData.flash = 1; }
      Sound.reverse && Sound.reverse();
      FX.burst(scene, target, { count: 24, color: 0xff3020, emissive: true, size: 0.008, speed: 2.5, life: 0.4 });
      const back = headWorld(vi);
      const d2 = back.clone().sub(target).normalize();
      const tr2 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, target.distanceTo(back), 6),
        new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
      tr2.position.copy(target).add(back).multiplyScalar(0.5);
      tr2.quaternion.setFromUnitVectors(V(0, 1, 0), d2);
      scene.add(tr2);
      T(0.2, t => { tr2.material.opacity = 0.9 * (1 - t); }).then(() => scene.remove(tr2));
      setReverse(ti, false);
      if (opts.blocked) await shieldHit(vi, d2);
      else if (opts.lethal) await kill(vi, d2);
      else await wound(vi, d2);
      return;
    }
    if (opts.blocked) { await shieldHit(vi, dir); return; }
    if (opts.lethal) await kill(ti, dir);
    else await wound(ti, dir);
  }

  // After a shotgun shot: the barrels drop open, a smoking shell flies out,
  // and the gun snaps shut again.
  async function breakOpen(gun) {
    if (!gun.barrels) return;
    await Engine.wait(0.35);
    await T(0.25, t => { gun.barrels.rotation.x = 0.55 * t; }, E.out);
    const spent = gun.shells.find(sh => sh.visible);
    if (spent) {
      const w = spent.getWorldPosition(V(0, 0, 0)), q = spent.getWorldQuaternion(Q());
      spent.visible = false;
      const flying = spent.clone(); flying.visible = true;
      flying.position.copy(w); flying.quaternion.copy(q); flying.scale.setScalar(gun.group.getWorldScale(V(0, 0, 0)).x);
      scene.add(flying);
      const v = V((Math.random() - 0.5) * 0.6, 1.4, -0.4).applyQuaternion(gun.group.getWorldQuaternion(Q()));
      const p0 = w.clone();
      FX.smoke(scene, w, V(0, 1, 0), 3, 0.3);
      T(0.9, t => {
        flying.position.set(p0.x + v.x * t, p0.y + v.y * t - 4.9 * t * t, p0.z + v.z * t);
        flying.rotation.x += 0.4; flying.rotation.z += 0.25;
        if (flying.position.y < 0.02) flying.position.y = 0.02;
      }, E.linear).then(() => setTimeout(() => scene.remove(flying), 4000));
    }
    await T(0.2, t => { gun.barrels.rotation.x = 0.55 * (1 - t); }, E.in);
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
    if (!s.unarmed) dropGun(s);
    lowerShield(ti); setReverse(ti, false);
    s.bleeding = false; s.tags = [];
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
    const g = weaponOf(s).group;
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
    if (myWeapon().group.parent === camera) lowerMyGun();
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
      T(0.5, t => { rig.rotation.z = Util.lerp(rig.rotation.z, 0, t); camera.fov = Util.lerp(camera.fov, baseFov(), t); camera.updateProjectionMatrix(); camera.rotation.x = -0.3; }).then(() => { fovLock = false; });
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


  // ---------- wounds, bleeding and lives ----------

  function chestWorld(pi) {
    if (pi === 0) return camera.getWorldPosition(V(0, 0, 0)).add(V(0, -0.35, 0));
    const s = seats[pi];
    s.rig.root.updateMatrixWorld(true);
    return s.rig.spine.localToWorld(V(0, 0.36, 0.12));
  }

  function clutchPose(s) { return makePose(s, s.rig.lArm, V(0.03, 0.36, 0.2), V(1, -1, 0.2), null); }

  // Shot but still alive: jolt, spray, then hunch over clutching the wound.
  async function wound(ti, dir) {
    if (ti === 0) { await woundMe(dir); return; }
    const s = seats[ti];
    FX.blood(scene, chestWorld(ti), dir, 0);
    s.bleeding = true;
    await T(0.14, t => { s.lean = Util.lerp(0.04, -0.32, t); }, E.out);
    moveArm(s.rig.lArm, clutchPose(s), 0.5);
    await T(0.7, t => { s.lean = Util.lerp(-0.32, 0.2, t); }, E.out);
  }

  async function woundMe(dir) {
    seats[0].bleeding = true;
    FX.blood(scene, camera.getWorldPosition(V(0, 0, 0)).add(V(0, -0.2, -0.8)), V(0, -0.3, -1), TABLE_Y);
    const z0 = rig.rotation.z, away = dir ? Math.sign(dir.x) || 1 : 1;
    await T(0.12, t => { rig.rotation.z = z0 - away * 0.18 * t; rig.position.z = 2.25 + 0.08 * t; }, E.out);
    await T(0.6, t => { rig.rotation.z = Util.lerp(z0 - away * 0.18, -away * 0.04, t); rig.position.z = 2.25 + 0.08 * (1 - t); }, E.inOut);
  }

  // Bleeding stopped: by a bandage (`wrap` shows the dressing) or by losing a life.
  async function stopBleeding(pi, wrap) {
    const s = seats[pi];
    s.bleeding = false;
    if (pi === 0) { T(0.5, t => { rig.rotation.z = Util.lerp(rig.rotation.z, 0, t); }); return; }
    if (s.dead) return;
    if (wrap && !s.wrap) {
      s.wrap = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 24), new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 1 }));
      s.wrap.rotation.x = Math.PI / 2; s.wrap.position.y = 0.36; s.wrap.scale.setScalar(0.01);
      s.rig.spine.add(s.wrap);
      T(0.5, t => { const k = Math.max(0.01, E.back(t)); s.wrap.scale.set(k, 0.66 * k, k); }, E.linear);
    }
    await Promise.all([
      T(0.5, t => { s.lean = Util.lerp(s.lean || 0, 0.04, t); }),
      moveArm(s.rig.lArm, restPose(s, 'l'), 0.6),
    ]);
  }

  // Ran out of time while bleeding but had a spare life: a shudder, one mark gone.
  async function loseLife(pi) {
    if (pi === 0) {
      await T(0.5, t => { rig.position.y = 1.27 - Math.sin(t * Math.PI) * 0.06; rig.rotation.x = Math.sin(t * Math.PI) * 0.08; });
      return;
    }
    const s = seats[pi];
    await T(0.6, t => { s.rig.head.rotation.z = Math.sin(t * Math.PI * 6) * 0.08 * (1 - t); });
  }

  // Bled out: a slow slump forward onto the table.
  async function bleedOut(pi) {
    if (pi === 0) { await killMe(null); return; }
    const s = seats[pi];
    s.dead = true; s.bleeding = false;
    const r = s.rig;
    r.eyeMat.emissive.setRGB(0, 0, 0);
    if (!s.unarmed) dropGun(s);
    moveArm(r.rArm, makePose(s, r.rArm, V(-0.25, -0.15, 0.2), V(-1, -1, 0), null), 1.6, E.in);
    moveArm(r.lArm, makePose(s, r.lArm, V(0.25, 0.1, 0.5), V(1, -1, 0), null), 1.6, E.in);
    const sx0 = r.spine.rotation.x;
    await T(1.8, t => {
      r.spine.rotation.x = Util.lerp(sx0, 0.95, t);
      r.spine.rotation.z = Util.lerp(r.spine.rotation.z, 0.1, t * 0.2);
      r.head.rotation.x = Util.lerp(r.head.rotation.x, 0.5, t);
    }, E.in);
    const pool = Models.decal(Models.tex().pool, 0.5);
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(s.group.localToWorld(V(0.05, TABLE_Y + 0.002, 0.5)));
    pool.material.opacity = 1; pool.scale.setScalar(0.1);
    scene.add(pool); pools.push(pool);
    T(3, t => pool.scale.setScalar(0.1 + t * 0.9), E.out);
    s.tags = [];
    setLabel(s, s.name + ' — DEAD', '#e0402a');
  }

  // Red tally marks on the table in front of each seat, one per life.
  function markSlot(pi, i) {
    return pi === 0 ? V(0.44 - i * 0.03, TABLE_Y + 0.0012, 0.5) : V(0.38 - i * 0.03, TABLE_Y + 0.0012, 0.44);
  }
  function setLives(pi, n) {
    const s = seats[pi];
    if (!s) return;
    while (s.marks.length < n) {
      const m = Models.lifeMark();
      m.position.copy(markSlot(pi, s.marks.length));
      m.rotation.y = (Math.random() - 0.5) * 0.15;
      m.scale.set(1, 1, 0.01);
      s.group.add(m); s.marks.push(m);
      T(0.4, t => m.scale.set(1, 1, Math.max(0.01, t)), E.back);
    }
    while (s.marks.length > n) {
      const m = s.marks.pop();
      T(0.5, t => m.scale.set(1 - t * 0.9, 1, 1 - t * 0.99)).then(() => s.group.remove(m));
    }
  }

  function setLabel(s, text, color) {
    if (!s.label) return;
    s.group.remove(s.label);
    const sub = [s.sub, ...(s.tags || [])].join(' · ');
    s.label = Util.textSprite(text, { color, sub, subColor: (s.tags || []).length ? '#e06040' : '#9a8a6a' });
    s.label.position.set(0, 1.6, 0);
    s.group.add(s.label);
  }
  // Extra words under a name: BLEEDING, UNARMED, SHOTGUN, TEAM.
  function setTags(pi, tags) {
    const s = seats[pi];
    if (!s || !s.rig || s.dead) return;
    if (tags.join() === (s.tags || []).join()) return;
    s.tags = tags;
    setLabel(s, s.name);
  }

  // ---------- items ----------

  function itemSlot(pi, i) {
    return pi === 0 ? V(0.5 - i * 0.12, TABLE_Y, 0.74) : V(-0.32 + i * 0.11, TABLE_Y, 0.66);
  }
  function layoutItems(pi, seconds = 0.4) {
    const s = seats[pi];
    return Promise.all(s.items.map((it, i) => {
      const to = itemSlot(pi, i), from = it.obj.position.clone();
      return T(seconds, t => it.obj.position.lerpVectors(from, to, t));
    }));
  }
  function takeItem(pi, id) {
    const s = seats[pi];
    const k = s.items.findIndex(it => it.id === id);
    if (k < 0) return null;
    const [it] = s.items.splice(k, 1);
    layoutItems(pi);
    scene.attach(it.obj);
    return it.obj;
  }

  // A crate drops onto the middle of the table, then slides to a seat.
  async function spawnBox(pi) {
    if (boxObj) scene.remove(boxObj);
    boxObj = Models.crate();
    boxObj.scale.setScalar(0.75);
    boxObj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const land = V(0.25, TABLE_Y, 0.3);
    boxObj.position.set(land.x, 3.2, land.z);
    boxObj.rotation.y = Math.random() * 6;
    scene.add(boxObj);
    await T(0.7, t => { boxObj.position.y = Util.lerp(3.2, TABLE_Y, E.bounce(t)); }, E.linear);
    Sound.thud();
    FX.burst(scene, land.clone().add(V(0, 0.02, 0)), { count: 24, color: 0x8a7050, size: 0.012, speed: 1.2, dir: V(0, 0.6, 0), gravity: 3, life: 0.8, floor: TABLE_Y });
    const s = seats[pi];
    s.group.updateMatrixWorld(true);
    const dest = s.group.localToWorld(pi === 0 ? V(-0.2, TABLE_Y, 1.05) : V(0.18, TABLE_Y, 0.78));
    const r0 = boxObj.rotation.y, r1 = s.group.rotation.y + (pi === 0 ? Math.PI : 0) + 0.2;
    await T(0.6, t => { boxObj.position.lerpVectors(land, dest, t); boxObj.rotation.y = Util.lerp(r0, r1, t); }, E.out);
    boxObj.userData.mine = pi === 0;
    boxObj.userData.owner = pi;
  }

  // The lid flies open and the items rise out and settle in front of the seat.
  async function openBox(pi, ids) {
    if (!boxObj) return;
    const box = boxObj;
    box.userData.opening = true;
    const s = seats[pi];
    if (s.rig) {   // reach for the lid
      const from = getPose(s.rig.lArm);
      await moveArm(s.rig.lArm, makePose(s, s.rig.lArm, worldToSpine(s, box.position.clone().add(V(0, 0.25, 0))), V(0.4, -1, -0.3), null), 0.4);
      moveArm(s.rig.lArm, from, 0.5);
    }
    Sound.creak();
    await T(0.5, t => { box.userData.lid.rotation.x = -1.9 * t; box.userData.glow.intensity = 3 * t; }, E.back);
    Sound.chime();
    const top = box.position.clone().add(V(0, 0.3, 0));
    for (const id of ids) {
      const obj = Models.item(id);
      obj.position.copy(box.position).add(V(0, 0.1, 0));
      obj.scale.setScalar(0.01);
      scene.add(obj);
      await T(0.45, t => { obj.position.lerpVectors(box.position.clone().add(V(0, 0.1, 0)), top, t); obj.scale.setScalar(Math.max(0.01, t * 1.3)); obj.rotation.y = t * 6; }, E.out);
      s.items.push({ id, obj });
      s.group.attach(obj);
      const to = itemSlot(pi, s.items.length - 1), from = obj.position.clone();
      const q0 = obj.quaternion.clone(), q1 = Q().setFromEuler(new THREE.Euler(0, Math.random() * 0.6 - 0.3, 0));
      await T(0.5, t => { obj.position.lerpVectors(from, to, t); obj.position.y += Math.sin(t * Math.PI) * 0.15; obj.quaternion.slerpQuaternions(q0, q1, t); obj.scale.setScalar(Util.lerp(1.3, 1, t)); }, E.inOut);
    }
    await T(0.4, t => { box.scale.setScalar(0.75 * (1 - t * 0.99)); box.userData.glow.intensity = 3 * (1 - t); });
    scene.remove(box);
    if (boxObj === box) boxObj = null;
  }

  // Health potion: drink it. A red glow and a new mark.
  async function usePotion(pi) {
    const obj = takeItem(pi, 'potion');
    if (!obj) return;
    if (pi === 0) {
      camera.attach(obj);
      const p0 = obj.position.clone(), q0 = obj.quaternion.clone();
      await T(0.6, t => { obj.position.lerpVectors(p0, V(0.02, -0.16, -0.32), t); obj.quaternion.slerpQuaternions(q0, Q(), t); }, E.inOut);
      Sound.gulp();
      await T(0.8, t => { obj.position.y = -0.16 + t * 0.08; obj.rotation.x = t * 1.9; camera.rotation.x = -0.3 + Math.sin(t * Math.PI) * 0.18; }, E.inOut);
    } else {
      const s = seats[pi];
      const from = getPose(s.rig.lArm);
      s.rig.lArm.hand.attach(obj);
      const p0 = obj.position.clone();
      T(0.4, t => obj.position.lerpVectors(p0, V(0, -0.06, 0.02), t));
      await moveArm(s.rig.lArm, makePose(s, s.rig.lArm, V(0.06, 0.66, 0.22), V(1, -1, 0), null), 0.6);
      Sound.gulp();
      s.headDown = -0.45;
      await T(0.9, t => { obj.rotation.x = -t * 1.6; });
      s.headDown = 0;
      scene.attach(obj);
      moveArm(s.rig.lArm, from, 0.5);
    }
    const glow = new THREE.PointLight(0xff3030, 0, 1.5);
    glow.position.copy(chestWorld(pi)).add(V(0, 0.2, 0));
    scene.add(glow);
    Sound.chime();
    await T(0.5, t => { glow.intensity = 4 * Math.sin(t * Math.PI); obj.scale.setScalar(1 - t * 0.99); });
    scene.remove(glow); obj.parent && obj.parent.remove(obj);
  }

  // Bandage: the roll flies to whoever is bleeding and wraps the wound.
  async function useBandage(pi, ti) {
    const obj = takeItem(pi, 'bandage');
    if (!obj) return;
    const to = ti === 0 ? camera.getWorldPosition(V(0, 0, 0)).add(V(0, -0.3, -0.35)) : chestWorld(ti).add(V(0, 0, 0.1));
    const from = obj.getWorldPosition(V(0, 0, 0));
    await T(0.7, t => { obj.position.lerpVectors(from, to, t); obj.position.y += Math.sin(t * Math.PI) * 0.35; obj.rotation.z = t * 14; }, E.inOut);
    Sound.chime();
    await T(0.35, t => obj.scale.setScalar(1 - t * 0.99));
    scene.remove(obj);
    await stopBleeding(ti, true);
  }

  // Hammer: smash your own gun to bits.
  async function smashGun(pi) {
    const tool = takeItem(pi, 'hammer');
    let gun, at;
    if (pi === 0) {
      if (myShotgun) { myShotgun.group.visible = false; }
      gun = myGun.group;
      if (gun.parent !== scene) scene.attach(gun);
      at = gun.position.clone();
    } else {
      const s = seats[pi];
      await moveArm(s.rig.rArm, restPose(s, 'r'), 0.5);
      gun = weaponOf(s).group;
      scene.attach(gun);
      at = s.group.localToWorld(V(-0.18, TABLE_Y + 0.02, 0.5));
      const p0 = gun.position.clone(), q0 = gun.quaternion.clone();
      const q1 = Q().setFromEuler(new THREE.Euler(0, s.group.rotation.y, Math.PI / 2));
      await T(0.4, t => { gun.position.lerpVectors(p0, at, t); gun.quaternion.slerpQuaternions(q0, q1, t); });
      if (s.shotgun) s.rig.gun.group.visible = false;
    }
    const h = tool || Models.item('hammer');
    scene.add(h);
    h.position.copy(at).add(V(0.05, 0.45, 0.25));
    h.rotation.set(-1.2, 0, 0);
    await T(0.35, t => { h.rotation.x = Util.lerp(-1.2, -0.4, t); }, E.out);
    await T(0.18, t => { h.position.y = Util.lerp(at.y + 0.45, at.y + 0.05, t); h.rotation.x = Util.lerp(-0.4, 0.35, t); }, E.in);
    Sound.smash();
    gun.visible = false;
    FX.burst(scene, at.clone().add(V(0, 0.03, 0)), { count: 30, color: 0x3a3c40, size: 0.018, speed: 2.2, dir: V(0, 1, 0), gravity: 8, life: 1.4, floor: TABLE_Y });
    FX.burst(scene, at.clone().add(V(0, 0.03, 0)), { count: 20, color: 0xffd080, emissive: true, size: 0.006, speed: 3, life: 0.35 });
    await T(0.4, t => { h.position.y = at.y + 0.05 + t * 0.4; h.scale.setScalar(1 - t * 0.99); });
    scene.remove(h);
    seats[pi].unarmed = true;
  }

  // A fresh revolver after a smashed one (or a fallen shotgun round).
  async function newGun(pi) {
    const s = seats[pi];
    s.unarmed = false;
    if (pi === 0) {
      resetMyGunPose();
      myGun.group.visible = true;
      await T(0.5, t => myGun.group.scale.setScalar(Math.max(0.01, 1.25 * E.back(t))), E.linear);
      return;
    }
    if (s.dead) return;
    const old = s.rig.gun.group;
    old.parent && old.parent.remove(old);
    s.rig.gun = Models.revolver();
    const g = s.rig.gun.group;
    g.rotation.x = Math.PI / 2; g.position.set(0, -0.04, 0); g.scale.setScalar(0.01);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    s.rig.rArm.hand.add(g);
    await T(0.5, t => g.scale.setScalar(Math.max(0.01, 1.25 * E.back(t))), E.linear);
  }
  function resetMyGunPose() {
    if (myGun.group.parent !== scene) scene.attach(myGun.group);
    myGun.group.position.copy(myGunRest.pos);
    myGun.group.rotation.copy(myGunRest.rot);
  }

  // Gun card: a shotgun drops onto the table (or into a bot's hand).
  async function giveShotgun(pi) {
    const sg = Models.shotgun();
    sg.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    if (pi === 0) {
      if (myShotgun) scene.remove(myShotgun.group);
      myShotgun = sg;
      scene.add(sg.group);
      sg.group.rotation.copy(myShotgunRest.rot);
      const p = myShotgunRest.pos;
      await T(0.6, t => sg.group.position.set(p.x, Util.lerp(2.6, p.y, E.bounce(t)), p.z), E.linear);
      Sound.thud();
      return;
    }
    const s = seats[pi];
    if (s.dead) return;
    if (s.shotgun) s.shotgun.group.parent && s.shotgun.group.parent.remove(s.shotgun.group);
    s.shotgun = sg;
    s.rig.gun.group.visible = false;
    const g = sg.group;
    g.rotation.x = Math.PI / 2; g.position.set(0, -0.04, 0); g.scale.setScalar(0.01);
    s.rig.rArm.hand.add(g);
    const glow = new THREE.PointLight(0xffd080, 0, 1.2);
    s.rig.rArm.hand.add(glow);
    Sound.thud();
    await T(0.6, t => { g.scale.setScalar(Math.max(0.01, E.back(t))); glow.intensity = 3 * Math.sin(t * Math.PI); }, E.linear);
    s.rig.rArm.hand.remove(glow);
  }

  // End of the round: the shotgun is gone.
  async function removeShotgun(pi) {
    if (pi === 0) {
      const sg = myShotgun;
      if (!sg) return;
      myShotgun = null;
      if (sg.group.parent === camera) scene.attach(sg.group);
      await T(0.5, t => sg.group.scale.setScalar(Math.max(0.01, 1 - t)));
      scene.remove(sg.group);
      return;
    }
    const s = seats[pi];
    const sg = s.shotgun;
    if (!sg) return;
    s.shotgun = null;
    await T(0.5, t => sg.group.scale.setScalar(Math.max(0.01, 1 - t)));
    sg.group.parent && sg.group.parent.remove(sg.group);
    if (!s.dead && !s.unarmed) s.rig.gun.group.visible = true;
  }

  // Binoculars: you zoom in on a player while their cards stand up for you.
  let bino = null;
  async function binoStart(pi, ti) {
    const tool = takeItem(pi, 'binoculars');
    const t = seats[ti];
    if (pi !== 0) {
      const s = seats[pi];
      if (tool) {
        s.rig.spine.attach(tool);
        const p0 = tool.position.clone(), q0 = tool.quaternion.clone();
        await T(0.5, k => { tool.position.lerpVectors(p0, V(0, 0.75, 0.2), k); tool.quaternion.slerpQuaternions(q0, Q(), k); });
      }
      s.look = ti;
      await moveArm(s.rig.lArm, makePose(s, s.rig.lArm, V(0.06, 0.72, 0.22), V(1, -1, 0), null), 0.5);
      await Engine.wait(1.4);
      s.look = null;
      moveArm(s.rig.lArm, restPose(s, 'l'), 0.5);
      if (tool) { await T(0.3, k => tool.scale.setScalar(1 - k * 0.99)); tool.parent.remove(tool); }
      return;
    }
    if (tool) { await T(0.3, k => tool.scale.setScalar(1 - k * 0.99)); scene.remove(tool); }
    // zoom the camera at the target's cards, which lift and turn to face you
    const target = t.cards.length ? t.cards[Math.floor(t.cards.length / 2)].getWorldPosition(V(0, 0, 0)) : headWorld(ti);
    fovLock = true;
    const camQ0 = camera.quaternion.clone(), fov0 = camera.fov;
    rig.updateMatrixWorld(true);
    const m = new THREE.Matrix4().lookAt(V(0, 0, 0), rig.worldToLocal(target.clone()), V(0, 1, 0));
    const camQ1 = Q().setFromRotationMatrix(m);
    handHolder.visible = false;
    const lifts = t.cards.map(c => {
      const p0 = c.position.clone(), q0 = c.quaternion.clone();
      c.userData.flying = true;
      return { c, p0, q0 };
    });
    bino = { ti, camQ0, fov0, lifts };
    const camPos = camera.getWorldPosition(V(0, 0, 0));
    await T(0.8, k => {
      camera.quaternion.slerpQuaternions(camQ0, camQ1, k);
      camera.fov = Util.lerp(fov0, 30, k); camera.updateProjectionMatrix();
      lifts.forEach(({ c, p0, q0 }, i) => {
        c.position.set(p0.x, p0.y + 0.08 * k, p0.z);
        const face = new THREE.Object3D();
        c.parent.updateMatrixWorld(true);
        const lp = c.parent.worldToLocal(camPos.clone());
        face.position.copy(c.position); face.lookAt(lp);
        c.quaternion.slerpQuaternions(q0, face.quaternion, k);
      });
    }, E.inOut);
  }
  async function binoEnd() {
    if (!bino) return;
    const { camQ0, fov0, lifts } = bino;
    bino = null;
    const q1 = camera.quaternion.clone(), f1 = camera.fov;
    const starts = lifts.map(({ c }) => ({ p: c.position.clone(), q: c.quaternion.clone() }));
    await T(0.6, k => {
      camera.quaternion.slerpQuaternions(q1, camQ0, k);
      camera.fov = Util.lerp(f1, fov0, k); camera.updateProjectionMatrix();
      lifts.forEach(({ c, p0, q0 }, i) => { c.position.lerpVectors(starts[i].p, p0, k); c.quaternion.slerpQuaternions(starts[i].q, q0, k); });
    }, E.inOut);
    lifts.forEach(({ c }) => { c.userData.flying = false; });
    handHolder.visible = true;
    fovLock = false;
  }

  // Teammate: the pact flies across the table.
  async function invite(pi, ti) {
    const obj = takeItem(pi, 'teammate') || Models.item('teammate');
    scene.add(obj);
    const from = obj.getWorldPosition(V(0, 0, 0));
    const to = ti === 0 ? camera.getWorldPosition(V(0, 0, 0)).add(V(0, -0.35, -0.5)) : seats[ti].group.localToWorld(V(0, TABLE_Y + 0.02, 0.62));
    await T(0.8, t => { obj.position.lerpVectors(from, to, t); obj.position.y += Math.sin(t * Math.PI) * 0.4; obj.rotation.y = t * 8; }, E.inOut);
    pendingPact = obj;
    return obj;
  }
  let pendingPact = null;
  async function decline(obj = pendingPact) {
    pendingPact = null;
    if (!obj) return;
    const at = obj.getWorldPosition(V(0, 0, 0));
    FX.burst(scene, at, { count: 26, color: 0xe8d8b0, size: 0.02, speed: 1.4, dir: V(0, 1, 0), gravity: 2, life: 1.4, floor: TABLE_Y });
    scene.remove(obj);
  }

  // Team up: the member hops over beside the leader, the chairs become a
  // couch and the member's cards join the leader's hand.
  async function formTeam(li, mi, obj = pendingPact) {
    pendingPact = null;
    if (obj) { await T(0.3, t => obj.scale.setScalar(1 - t * 0.99)); scene.remove(obj); }
    await seatTogether(li, mi, true);
    await transferCards(mi, li);
  }

  // Put two teammates side by side on a couch. Whoever isn't the viewer moves.
  async function seatTogether(li, mi, animate) {
    if (mi === 0) [li, mi] = [mi, li];
    const L = seats[li], M = seats[mi];
    L.group.updateMatrixWorld(true);
    // Your teammate moves to a couch along the table right next to you, where
    // you can see them; bot teammates share a couch side by side.
    const dest = li === 0 ? V(0.98, 0, 1.15) : L.group.localToWorld(V(-0.64, 0, 0));
    const q1 = li === 0 ? Q().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)) : L.group.quaternion.clone();
    const p0 = M.group.position.clone(), q0 = M.group.quaternion.clone();
    const chairs = [L.chair, M.chair].filter(Boolean);
    const dur = k => (animate ? k : 0);
    await T(dur(0.4), t => chairs.forEach(c => c.scale.setScalar(Math.max(0.01, 1 - t))));
    chairs.forEach(c => { c.visible = false; });
    if (animate) Sound.thud();
    await T(dur(1.0), t => {
      M.group.position.lerpVectors(p0, dest, t);
      M.group.position.y = Math.sin(t * Math.PI) * 0.35;
      M.group.quaternion.slerpQuaternions(q0, q1, t);
    }, E.inOut);
    const couch = Models.couch(1.45);
    couch.scale.setScalar(0.01);
    if (li === 0) { couch.position.set(0.3, 0, -0.08); M.group.add(couch); M.couch = couch; }
    else { couch.position.set(-0.32, 0, -0.1); L.group.add(couch); L.couch = couch; }
    await T(dur(0.6), t => couch.scale.setScalar(Math.max(0.01, E.back(t))), E.linear);
  }

  // Move every card from one seat's hand into another's.
  async function transferCards(fi, ti) {
    const F = seats[fi], D = seats[ti];
    const moving = F.cards.splice(0);
    for (const c of moving) {
      D.cards.push(c);
      relayout(ti);
      const w = worldSlot(ti, c.userData.slot);
      Sound.cardFlick();
      await flyTo(c, w.pos, w.quat, 0.4, 0.2);
      parentOf(ti).attach(c);
      c.position.copy(c.userData.slot.pos); c.quaternion.copy(c.userData.slot.quat);
    }
    relayout(ti);
  }


  // ---------- Block, Reverse, Grenade, Nuclear ----------

  // Block: a riveted steel shield springs up on the table in front of a seat.
  async function raiseShield(pi) {
    const s = seats[pi];
    if (s.shield) return;
    const sh = Models.shield();
    const z = pi === 0 ? 0.95 : 0.45;
    sh.position.set(0, TABLE_Y - 0.3, z);
    sh.scale.setScalar(pi === 0 ? 0.9 : 1.5);
    const glow = new THREE.PointLight(0x9ac8ff, 0.8, 0.9); glow.position.set(0, 0.2, 0.15); sh.add(glow);
    s.group.add(sh);
    s.shield = sh;
    await T(0.5, t => { sh.position.y = Util.lerp(TABLE_Y - 0.3, TABLE_Y, E.back(t)); }, E.linear);
    Sound.smash();
    FX.burst(scene, sh.getWorldPosition(V(0, 0, 0)), { count: 10, color: 0xffd080, emissive: true, size: 0.006, speed: 1.5, life: 0.3 });
  }
  // A hit lands on the shield: sparks, a clang, and it topples over.
  async function shieldHit(pi, dir) {
    const s = seats[pi];
    const sh = s.shield;
    if (!sh) return;
    s.shield = null;
    const at = sh.getWorldPosition(V(0, 0, 0)).add(V(0, 0.15, 0));
    Sound.smash();
    FX.burst(scene, at, { count: 30, color: 0xffd080, emissive: true, size: 0.007, speed: 3, dir: dir ? dir.clone().negate() : null, life: 0.45 });
    await T(0.6, t => { sh.rotation.x = -E.bounce(t) * 1.4; }, E.linear);
    const sc0 = sh.scale.x;
    await T(0.6, t => { sh.scale.setScalar(Math.max(0.01, sc0 * (1 - t))); });
    s.group.remove(sh);
  }
  async function lowerShield(pi) {
    const s = seats[pi];
    const sh = s && s.shield;
    if (!sh) return;
    s.shield = null;
    await T(0.4, t => { sh.position.y = Util.lerp(TABLE_Y, TABLE_Y - 0.3, t); });
    s.group.remove(sh);
  }

  // Reverse: a red ring circles a seat until a shot bounces off it.
  async function setReverse(pi, on) {
    const s = seats[pi];
    if (!s) return;
    if (on && !s.reverseRing) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(pi === 0 ? 0.22 : 0.34, 0.012, 8, 48),
        new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a0a, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, pi === 0 ? TABLE_Y + 0.03 : 1.0, pi === 0 ? 0.95 : 0);
      ring.scale.setScalar(0.01);
      ring.userData.flash = 0;
      s.group.add(ring);
      s.reverseRing = ring;
      Sound.reverse && Sound.reverse();
      await T(0.5, t => ring.scale.setScalar(Math.max(0.01, E.back(t))), E.linear);
    } else if (!on && s.reverseRing) {
      const ring = s.reverseRing;
      s.reverseRing = null;
      await T(0.4, t => ring.scale.setScalar(Math.max(0.01, 1 + t * 0.6)), E.out);
      s.group.remove(ring);
    }
  }

  // Burn a seat's cards: they curl up off the table and turn to ash.
  function burnCards(si) {
    const s = seats[si];
    const cards = s.cards.splice(0);
    cards.forEach((c, i) => {
      scene.attach(c);
      c.userData.flying = true;
      const p0 = c.position.clone();
      c.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); } });
      T(1.0 + i * 0.1, t => {
        c.position.set(p0.x + Math.sin(t * 6 + i) * 0.05, p0.y + t * 0.5, p0.z);
        c.rotation.z += 0.08; c.rotation.x += 0.05;
        c.traverse(o => { if (o.isMesh && o.material.color) { o.material.color.setRGB(1 - t * 0.9, 0.5 - t * 0.45, 0.3 - t * 0.28); if (o.material.emissive) o.material.emissive.setRGB(1.2 * (1 - t), 0.3 * (1 - t), 0); } });
        c.scale.setScalar(Math.max(0.01, 1 - t));
      }, E.in).then(() => scene.remove(c));
    });
    if (si === 0) { selected = -1; hovered = -1; }
  }
  // Items blown off the table and gone.
  function blowItems(si, from) {
    const s = seats[si];
    s.items.splice(0).forEach(({ obj }) => {
      scene.attach(obj);
      const p0 = obj.position.clone();
      const out = p0.clone().sub(from).setY(0).normalize().multiplyScalar(1.5);
      T(0.9, t => {
        obj.position.set(p0.x + out.x * t, p0.y + Math.sin(t * Math.PI) * 0.5, p0.z + out.z * t);
        obj.rotation.x += 0.3; obj.rotation.z += 0.2;
        obj.scale.setScalar(Math.max(0.01, 1 - t * 0.9));
      }, E.out).then(() => scene.remove(obj));
    });
  }

  function camShake(seconds, power) {
    const p0 = rig.position.clone();
    return T(seconds, t => {
      const k = power * (1 - t);
      rig.position.set(p0.x + (Math.random() - 0.5) * k, p0.y + (Math.random() - 0.5) * k, p0.z + (Math.random() - 0.5) * k);
    }, E.linear).then(() => { if (!seats[0] || !seats[0].dead) rig.position.copy(p0); });
  }

  // Fireball: stacked glowing sprites, a blast light and thick smoke.
  function fireball(at, size) {
    const light = new THREE.PointLight(0xffa040, 30, 12, 2);
    light.position.copy(at).add(V(0, 0.3, 0));
    scene.add(light);
    T(1.2, t => { light.intensity = 30 * (1 - t); }).then(() => scene.remove(light));
    for (let i = 0; i < 7; i++) {
      const glow = Util.canvasTexture(64, 64, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.95)'); gr.addColorStop(0.7, 'rgba(180,40,0,0.5)'); gr.addColorStop(1, 'rgba(60,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const off = V((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4).multiplyScalar(size);
      sp.position.copy(at).add(off);
      scene.add(sp);
      const peak = size * (0.8 + Math.random() * 0.8);
      T(0.9 + Math.random() * 0.5, t => { sp.scale.setScalar(peak * E.out(t) + 0.01); sp.material.opacity = 1 - t; sp.position.y += 0.004; }, E.linear).then(() => scene.remove(sp));
    }
    FX.smoke(scene, at, V(0, 1, 0), 26, size * 2.2);
    FX.burst(scene, at, { count: 60, color: 0x3a2a1a, size: 0.025, speed: 4 * size, dir: V(0, 1.2, 0), gravity: 7, life: 1.6, floor: 0.01 });
    FX.burst(scene, at, { count: 40, color: 0xffc060, emissive: true, size: 0.008, speed: 6 * size, life: 0.6 });
  }

  // Grenade: the thrower pulls the pin and lobs it into the middle of the
  // table. `hits` = [{ s, dead }] seats caught in the blast, `blocked` seats
  // whose shield took it, `selfDead` if the thrower dies of it.
  async function grenade(pi, hits, blocked, selfDead) {
    const g = Models.grenade();
    const center = V(0.05, TABLE_Y + 0.04, -0.15);
    let from;
    if (pi === 0) {
      camera.add(g);
      g.position.set(0.12, -0.18, -0.4);
      await T(0.4, t => { g.position.y = -0.18 + t * 0.06; });
      from = g.getWorldPosition(V(0, 0, 0));
    } else {
      const s = seats[pi];
      s.rig.lArm.hand.add(g);
      g.position.set(0, -0.06, 0.03);
      await moveArm(s.rig.lArm, makePose(s, s.rig.lArm, V(0.25, 0.75, -0.05), V(1, -1, -0.3), null), 0.5);
      from = g.getWorldPosition(V(0, 0, 0));
    }
    // pull the pin
    const ring = g.userData.ring;
    Sound.cock();
    const rw = ring.getWorldPosition(V(0, 0, 0));
    scene.attach(ring);
    T(0.8, t => { ring.position.set(rw.x + t * 0.3, rw.y + Math.sin(t * Math.PI) * 0.2, rw.z); ring.rotation.x += 0.4; }).then(() => scene.remove(ring));
    await Engine.wait(0.25);
    scene.attach(g);
    if (pi !== 0) moveArm(seats[pi].rig.lArm, restPose(seats[pi], 'l'), 0.6);
    from = g.position.clone();
    await T(0.75, t => {
      g.position.lerpVectors(from, center, t);
      g.position.y = Util.lerp(from.y, center.y, t) + Math.sin(t * Math.PI) * 0.6;
      g.rotation.x += 0.35; g.rotation.z += 0.2;
    }, E.linear);
    Sound.thud();
    const blink = new THREE.PointLight(0xff2010, 0, 1.2); blink.position.copy(center).add(V(0, 0.1, 0)); scene.add(blink);
    for (let i = 0; i < 3; i++) {
      Sound.tick && Sound.tick();
      blink.intensity = 3;
      await T(0.25, t => { blink.intensity = 3 * (1 - t); g.position.x = center.x + Math.sin(t * 20) * 0.006; });
      await Engine.wait(0.08);
    }
    scene.remove(blink); scene.remove(g);
    // BOOM
    Sound.explosion && Sound.explosion();
    fireball(center, 0.9);
    camShake(0.9, 0.08);
    const scorch = Models.decal(Models.tex().pool, 1.2);
    scorch.material = scorch.material.clone(); scorch.material.color.setRGB(0.08, 0.06, 0.05); scorch.material.opacity = 0.9;
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(center.x, TABLE_Y + 0.003, center.z);
    scene.add(scorch); pools.push(scorch);
    // the pile of played cards is blown off the table
    pile.splice(0).forEach(c => {
      const v = V(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
      const p0 = c.position.clone();
      T(1.0, t => { c.position.set(p0.x + v.x * t * 2, p0.y + Math.sin(t * Math.PI) * 0.8, p0.z + v.z * t * 2); c.rotation.x += 0.3; c.scale.setScalar(Math.max(0.01, 1 - t)); }).then(() => scene.remove(c));
    });
    const jobs = [];
    hits.forEach(({ s: si, dead }) => {
      const dir = headWorld(si).sub(center).normalize();
      burnCards(si);
      blowItems(si, center);
      jobs.push(dead ? kill(si, dir) : wound(si, dir));
    });
    blocked.forEach(si => jobs.push(shieldHit(si, headWorld(si).sub(center).normalize())));
    const sdir = headWorld(pi).sub(center).normalize();
    jobs.push(selfDead ? kill(pi, sdir) : wound(pi, sdir));
    await Promise.all(jobs);
  }

  // Nuclear: sirens, the room shakes, a bomb punches through the ceiling and
  // everything is blown away in a white-hot blast.
  async function nuke(pi) {
    Sound.siren && Sound.siren();
    const c0 = lamp.light.color.clone();
    const alarm = new THREE.PointLight(0xff1000, 0, 14); alarm.position.set(0, 3, 0); scene.add(alarm);
    for (let i = 0; i < 5; i++) {
      FX.burst(scene, V((Math.random() - 0.5) * 3, 3.35, (Math.random() - 0.5) * 3), { count: 14, color: 0x8a8070, size: 0.02, speed: 0.4, dir: V(0, -1, 0), gravity: 6, life: 1.2, floor: 0.01 });
      await T(0.45, t => { alarm.intensity = 6 * Math.sin(t * Math.PI); lamp.group.rotation.z = Math.sin(t * Math.PI * 2) * 0.3; });
      camShake(0.45, 0.01 + i * 0.012);
    }
    // the bomb comes through the ceiling
    const bomb = Models.missile();
    bomb.position.set(0.1, 6, -0.4);
    scene.add(bomb);
    FX.burst(scene, V(0.1, 3.38, -0.4), { count: 80, color: 0x6a6a64, size: 0.05, speed: 3, dir: V(0, -1, 0), gravity: 9, life: 1.5, floor: 0.01 });
    await T(0.45, t => { bomb.position.y = Util.lerp(6, TABLE_Y + 0.8, E.in(t)); }, E.linear);
    Sound.explosion && Sound.explosion();
    // white flash, a fireball and the room blown outward
    const flashLight = new THREE.PointLight(0xffffff, 80, 30, 1); flashLight.position.set(0, 1.5, -0.4); scene.add(flashLight); junk.push(flashLight);
    scene.remove(bomb);
    fireball(V(0.1, TABLE_Y + 0.4, -0.4), 2.4);
    camShake(2.2, 0.25);
    const blown = [];
    seats.forEach((s, i) => { if (i !== 0 && s.group) blown.push(s.group); });
    shelves.forEach(sh => blown.push(sh.pivot));
    [deskL, deskR, picture].forEach(o => blown.push(o));
    blown.forEach(o => {
      const p0 = o.position.clone();
      const out = p0.clone().setY(0); if (out.lengthSq() < 0.01) out.set(0, 0, -1);
      out.normalize().multiplyScalar(3 + Math.random() * 2);
      const spin = V(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const r0 = o.rotation.clone();
      T(1.6, t => {
        o.position.set(p0.x + out.x * t, p0.y + Math.sin(t * Math.PI) * 1.5, p0.z + out.z * t);
        o.rotation.set(r0.x + spin.x * t, r0.y + spin.y * t, r0.z + spin.z * t);
      }, E.out);
    });
    // mushroom cloud: a column of fire puffs rising into a rolling cap,
    // turning to dark smoke as it cools
    const puff = (hot) => Util.canvasTexture(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      if (hot) { gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.4, 'rgba(255,160,50,0.9)'); gr.addColorStop(1, 'rgba(160,30,0,0)'); }
      else { gr.addColorStop(0, 'rgba(70,60,52,0.9)'); gr.addColorStop(0.6, 'rgba(50,44,40,0.6)'); gr.addColorStop(1, 'rgba(30,28,26,0)'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const fireTex = puff(true), smokeTex = puff(false);
    // look up at the cloud
    if (!seats[0].dead) { fovLock = true; const rx0 = camera.rotation.x, f0 = camera.fov; T(2.0, t => { camera.rotation.x = Util.lerp(rx0, 0.32, t); camera.fov = Util.lerp(f0, Math.max(f0, 70), t); camera.updateProjectionMatrix(); }, E.inOut); }
    const base = V(0.1, TABLE_Y, -0.4);
    const puffs = [];
    for (let i = 0; i < 46; i++) {
      const inCap = i >= 16;
      const a = Math.random() * Math.PI * 2;
      const r = inCap ? 0.4 + Math.random() * 0.9 : Math.random() * 0.25;
      const y = inCap ? 2.3 + Math.random() * 0.6 : (i / 16) * 2.3;
      [true, false].forEach(hot => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: hot ? fireTex : smokeTex, transparent: true, depthWrite: false,
          blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: hot ? 1 : 0 }));
        sp.position.copy(base);
        scene.add(sp); junk.push(sp);
        puffs.push({ sp, hot, a, r, y, size: (inCap ? 0.9 : 0.6) + Math.random() * 0.5, delay: (inCap ? 0.25 : 0) + (i % 16) * 0.02 });
      });
    }
    await T(2.6, t => {
      puffs.forEach(pf => {
        const k = Math.max(0, Math.min(1, (t - pf.delay) / (1 - pf.delay)));
        const e = E.out(k);
        pf.sp.position.set(base.x + Math.cos(pf.a + k) * pf.r * e, base.y + pf.y * e, base.z + Math.sin(pf.a + k) * pf.r * e);
        pf.sp.scale.setScalar(0.01 + pf.size * e * (pf.hot ? 1 : 1.25));
        pf.sp.material.opacity = pf.hot ? Math.max(0, 1 - k * 0.9) : Math.min(0.85, k * 1.2);
      });
      flashLight.intensity = 80 * (1 - t);
      lamp.light.color.lerpColors(c0, new THREE.Color(1, 0.4, 0.1), t);
    }, E.linear);
    scene.remove(alarm);
  }

  // ---------- rebuild ----------
  // Set the whole table to a known state at once: used when the phone is
  // passed to another player and when an online player joins or catches up.
  // `snap.seats` is in seat order (seat 0 = the viewer).
  function rebuild(players, snap) {
    setup(players);
    ravage = ravageTarget = snap.ravage || 0;
    snap.seats.forEach((d, i) => {
      const s = seats[i];
      (d.hand || []).forEach(id => {
        const c = Models.card(id);
        c.traverse(o => { if (o.isMesh) o.castShadow = true; });
        s.cards.push(c);
        parentOf(i).add(c);
      });
      relayout(i);
      s.cards.forEach(c => { c.position.copy(c.userData.slot.pos); c.quaternion.copy(c.userData.slot.quat); });
      setLives(i, Math.max(0, d.lives || 0));
      (d.items || []).forEach(id => {
        const obj = Models.item(id);
        s.items.push({ id, obj });
        s.group.add(obj);
        obj.position.copy(itemSlot(i, s.items.length - 1));
      });
      if (d.dead) { instantDead(i); return; }
      if (d.bleeding) {
        s.bleeding = true;
        if (s.rig) { s.lean = 0.2; applyPose(s.rig.lArm, clutchPose(s)); }
      }
      if (d.unarmed) {
        s.unarmed = true;
        if (i === 0) myGun.group.visible = false; else s.rig.gun.group.visible = false;
      }
      if (d.shotgun) giveShotgun(i);
      if (d.block) raiseShield(i);
      if (d.reverse) setReverse(i, true);
      if (d.tags && s.rig) setTags(i, d.tags);
    });
    (snap.teams || []).forEach(([li, mi]) => seatTogether(li, mi, false));
    (snap.pile || []).forEach((id, k) => {
      const c = Models.card(id);
      c.position.set((Math.random() - 0.5) * 0.12, TABLE_Y + 0.0015 + k * 0.0012, (Math.random() - 0.5) * 0.12 - 0.1);
      c.rotation.set(-Math.PI / 2, 0, (Math.random() - 0.5) * 1.2);
      scene.add(c); pile.push(c);
    });
    if (snap.box != null) {
      boxObj = Models.crate();
      boxObj.scale.setScalar(0.75);
      const o = seats[snap.box];
      o.group.updateMatrixWorld(true);
      boxObj.position.copy(o.group.localToWorld(snap.box === 0 ? V(-0.2, TABLE_Y, 1.05) : V(0.18, TABLE_Y, 0.78)));
      boxObj.userData.mine = snap.box === 0;
      scene.add(boxObj);
    }
  }

  // Someone already dead when the table is rebuilt: slumped, no hat, no gun.
  function instantDead(i) {
    const s = seats[i];
    s.dead = true;
    if (i === 0) {
      rig.position.set(0.15, TABLE_Y + 0.12, 1.75);
      rig.rotation.set(-0.35, 0, 1.35);
      return;
    }
    const r = s.rig;
    r.spine.rotation.set(0.92, 0, 0.1);
    r.head.rotation.set(0.45, 0.3, 0);
    r.hat.visible = false;
    r.gun.group.visible = false;
    applyPose(r.rArm, makePose(s, r.rArm, V(-0.3, -0.1, 0.25), V(-1, -1, 0), null));
    applyPose(r.lArm, makePose(s, r.lArm, V(0.25, 0.1, 0.5), V(1, -1, 0), null));
    setLabel(s, s.name + ' — DEAD', '#e0402a');
  }

  api = {
    setup, deal, play, select, setCovered, drawGuns, holsterGuns, aim, shoot, recover, peek, jackGlow, bloodyMary,
    wound, stopBleeding, loseLife, bleedOut, setLives, setTags, spawnBox, openBox, usePotion, useBandage,
    smashGun, newGun, giveShotgun, removeShotgun, binoStart, binoEnd, invite, decline, formTeam, transferCards,
    raiseShield, lowerShield, setReverse, grenade, nuke, rebuild,
    onCardDrop: null, onBoxClick: null,
    get hasBox() { return !!boxObj; },
    show() { if (!scene) buildRoom(); Engine.setStage(stage); },
    setRavage(v) { ravageTarget = clamp(v, 0, 1); },
    setBlood(v) { showBlood = v; },
    onCardClick: null,
    get cardCount() { return seats[0] ? seats[0].cards.length : 0; },
  };
  return api;
})();
