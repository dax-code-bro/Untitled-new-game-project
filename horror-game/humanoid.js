/*
 * THE BIRCH — the people.
 *
 * Everyone in the facility is built from the same blocky figure: square
 * head, thick slab torso, thin long limbs, every joint a real pivot so the
 * same rig poses a walking escort, a slumped corpse, and the player's own
 * reflection. Only the clothing changes between them.
 *
 * Origin sits on the floor between the feet; the figure faces -Z, matching
 * the yaw convention the rest of the game uses (forward = -sin/-cos yaw).
 *
 *   window.buildHumanoid(THREE, 'scientist')
 *     → { group, joints, setStance(n), setWalk(phase, amt), pose(name) }
 */
(function () {
  'use strict';

  // ---------------- Proportions ----------------
  // A ~1.77 m figure. Head centre lands at 1.66, close enough to the
  // player's 1.68 eye height that the camera sits inside its own head.
  var P = {
    footH: 0.08, footD: 0.26, footW: 0.16,
    shin: 0.42, shinW: 0.14, shinD: 0.15,
    thigh: 0.42, thighW: 0.16, thighD: 0.17,
    hipY: 0.92, hipX: 0.11,
    torsoH: 0.56, torsoW: 0.42, torsoD: 0.24,
    shoulderY: 1.42, shoulderX: 0.235,
    upper: 0.29, upperW: 0.12, upperD: 0.13,
    fore: 0.27, foreW: 0.11, foreD: 0.12,
    handH: 0.11,
    neckH: 0.07, neckW: 0.13,
    headY: 1.66, head: 0.24
  };

  // ---------------- Cloth ----------------
  // One scuffed-fabric texture per colour, built once and shared by every
  // figure wearing it — a dozen bodies at ~16 meshes each is already a lot
  // of draw calls without handing each of them its own material.
  var texCache = {};
  function clothTex(THREE, hex, wear, blood) {
    var key = hex + '|' + wear + '|' + (blood ? 'b' : '');
    if (texCache[key]) return texCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    x.fillStyle = hex;
    x.fillRect(0, 0, 64, 64);
    // weave
    for (var i = 0; i < 64; i += 2) {
      x.fillStyle = 'rgba(0,0,0,0.05)';
      x.fillRect(0, i, 64, 1);
    }
    // grime and scuffing, heavier the more `wear` is asked for
    var n = Math.round(wear * 90);
    for (var s = 0; s < n; s++) {
      var a = Math.random() * 0.16 * wear;
      x.fillStyle = 'rgba(48,40,30,' + a.toFixed(3) + ')';
      x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 9, 1 + Math.random() * 3);
    }
    for (var k = 0; k < Math.round(wear * 14); k++) {
      x.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.12).toFixed(3) + ')';
      x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
    // What soaked in before they stopped moving. Dried, so brown-red, and
    // heavier at the bottom of the tile where cloth meets the floor.
    if (blood) {
      for (var v = 0; v < 22; v++) {
        var by = Math.random() * Math.random() * 64;
        x.fillStyle = 'rgba(' + (58 + Math.random() * 26 | 0) + ',' + (14 + Math.random() * 10 | 0) + ',12,' +
          (0.3 + Math.random() * 0.5).toFixed(2) + ')';
        x.beginPath();
        x.ellipse(Math.random() * 64, 64 - by, 2 + Math.random() * 9, 2 + Math.random() * 6, Math.random() * 3, 0, 6.284);
        x.fill();
      }
      for (var d = 0; d < 16; d++) {
        x.fillStyle = 'rgba(48,10,9,' + (0.25 + Math.random() * 0.45).toFixed(2) + ')';
        x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1 + Math.random() * 7);
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache[key] = t;
    return t;
  }

  var SKIN = { pale: 0x9c7b62, dark: 0x6b503d, grey: 0x7d7469 };

  // Each outfit names the material for every part. `wear` drives how
  // scuffed the cloth reads; the dead are dirtier than the living.
  var OUTFITS = {
    // the player: blue intern tee, white pants that have had a day
    intern: {
      torso: { c: '#2f5d96', wear: 0.5 }, upper: { skin: true }, fore: { skin: true },
      thigh: { c: '#cdc9bd', wear: 1.0 }, shin: { c: '#cdc9bd', wear: 1.0 },
      foot: { c: '#2a2724', wear: 0.6 }, skin: SKIN.pale
    },
    // lab staff: white coat over white trousers
    scientist: {
      torso: { c: '#e2e3df', wear: 0.35 }, upper: { c: '#e2e3df', wear: 0.35 }, fore: { c: '#e8e9e5', wear: 0.3 },
      thigh: { c: '#d5d6d2', wear: 0.4 }, shin: { c: '#d5d6d2', wear: 0.4 },
      foot: { c: '#26241f', wear: 0.5 }, skin: SKIN.pale, coat: true
    },
    // assembly floor: heavy canvas coveralls
    worker: {
      torso: { c: '#54606b', wear: 0.9 }, upper: { c: '#54606b', wear: 0.9 }, fore: { c: '#54606b', wear: 0.9 },
      thigh: { c: '#4a555f', wear: 1.0 }, shin: { c: '#4a555f', wear: 1.0 },
      foot: { c: '#2b2723', wear: 1.0 }, skin: SKIN.dark
    },
    // Nick: same intern tee as you, because he was you, two years earlier
    nick: {
      torso: { c: '#2f5d96', wear: 1.0 }, upper: { skin: true }, fore: { skin: true },
      thigh: { c: '#b6b2a6', wear: 1.0 }, shin: { c: '#b6b2a6', wear: 1.0 },
      foot: { c: '#26231f', wear: 1.0 }, skin: SKIN.grey
    },
    // containment: dark utility uniform
    security: {
      torso: { c: '#232b33', wear: 0.7 }, upper: { c: '#232b33', wear: 0.7 }, fore: { c: '#232b33', wear: 0.7 },
      thigh: { c: '#1e242a', wear: 0.8 }, shin: { c: '#1e242a', wear: 0.8 },
      foot: { c: '#131417', wear: 0.7 }, skin: SKIN.grey
    },
    // the escort: black suits, no names
    suit: {
      torso: { c: '#0e0f11', wear: 0.2 }, upper: { c: '#0e0f11', wear: 0.2 }, fore: { c: '#0e0f11', wear: 0.2 },
      thigh: { c: '#0c0d0f', wear: 0.2 }, shin: { c: '#0c0d0f', wear: 0.2 },
      foot: { c: '#08090a', wear: 0.15 }, skin: SKIN.pale, tie: true
    }
  };

  var matCache = {};
  function matFor(THREE, spec, outfit, blood) {
    if (spec.skin) return skinMat(THREE, outfit.skin);
    var key = spec.c + '|' + spec.wear + '|' + (blood ? 'b' : '');
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial({
        color: 0xffffff, map: clothTex(THREE, spec.c, spec.wear, blood), roughness: 0.94
      });
    }
    return matCache[key];
  }
  function skinMat(THREE, hex) {
    var key = 'skin' + hex;
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 });
    }
    return matCache[key];
  }

  // ---------------- Poses ----------------
  // Joint rotations plus a `tilt` that lays the body down. Floor contact is
  // measured after posing rather than written here — a tilt pivots the
  // figure around its feet and every limb angle changes the footprint, so
  // hand-written drop values are wrong the moment a pose is edited.
  //
  // Once a body is tilted onto its face or back, local X and local Z stop
  // meaning what they do standing up: a Z rotation splays a limb flat along
  // the floor, an X rotation lifts it into the air. Lying poses therefore
  // splay with Z and keep X small — a bent knee or elbow, not a raised arm.
  var POSES = {
    stand: {},
    // knees and hips folded, arms hanging closer in
    crouch: { hipL: [-1.0, 0, 0], hipR: [-1.0, 0, 0], kneeL: [1.7, 0, 0], kneeR: [1.7, 0, 0],
      shoulderL: [0.2, 0, 0.12], shoulderR: [0.2, 0, -0.12], torso: [0.25, 0, 0] },
    // flat out, belly down, arms reaching ahead along the floor
    crawl: { tilt: -Math.PI / 2,
      hipL: [0, 0, 0.26], hipR: [0, 0, -0.26], kneeL: [0.45, 0, 0], kneeR: [0.6, 0, 0],
      shoulderL: [2.7, 0, 0.45], shoulderR: [2.7, 0, -0.45], elbowL: [0.5, 0, 0], elbowR: [0.5, 0, 0],
      head: [-0.4, 0, 0] },
    // --- the dead ---
    // face down, arms out where they landed, one knee drawn up
    sprawl: { tilt: -Math.PI / 2,
      hipL: [0.15, 0, 0.42], hipR: [-0.12, 0, -0.2], kneeL: [0.55, 0, 0], kneeR: [0.2, 0, 0],
      shoulderL: [0.3, 0, 1.35], shoulderR: [-0.25, 0, -0.95], elbowL: [0.55, 0, 0], elbowR: [0.35, 0, 0],
      head: [0, 0.8, 0] },
    // on their back, one arm thrown wide
    faceup: { tilt: Math.PI / 2,
      hipL: [0, 0, 0.26], hipR: [-0.2, 0, -0.34], kneeL: [-0.35, 0, 0], kneeR: [-0.15, 0, 0],
      shoulderL: [0.2, 0, 1.15], shoulderR: [0.15, 0, -1.4], elbowL: [0.4, 0, 0], elbowR: [0.3, 0, 0],
      head: [0, -0.8, 0] },
    // slumped sitting against a wall — how Nick went. The measured drop
    // lands the feet on the floor and the pelvis where a sitting one goes.
    slumped: { tilt: -0.15,
      hipL: [-1.5, 0, 0.16], hipR: [-1.4, 0, -0.2], kneeL: [1.2, 0, 0], kneeR: [1.5, 0, 0],
      shoulderL: [0.35, 0, 0.5], shoulderR: [0.3, 0, -0.42], elbowL: [-0.5, 0, 0], elbowR: [-0.7, 0, 0],
      torso: [0.3, 0, 0.1], head: [0.6, 0.25, 0] },
    // thrown, crumpled where they landed, half rolled onto one side
    crumpled: { tilt: -Math.PI / 2, spin: 0.5,
      hipL: [0.25, 0, 0.75], hipR: [0.1, 0, -0.12], kneeL: [1.1, 0, 0], kneeR: [0.85, 0, 0],
      shoulderL: [0.35, 0, 1.5], shoulderR: [-0.2, 0, -0.5], elbowL: [0.7, 0, 0], elbowR: [0.9, 0, 0],
      torso: [0, 0, 0.25], head: [0, 1.0, 0.3] }
  };

  window.buildHumanoid = function buildHumanoid(THREE, outfitName, opts) {
    opts = opts || {};
    var outfit = OUTFITS[outfitName] || OUTFITS.worker;
    // Two nested groups on purpose: callers own `group` for placement
    // (position + rotation.y), poses own `body` for the tilt onto the floor.
    // Sharing one group would let Euler order mix the two and lay corpses
    // out in directions nobody asked for.
    var group = new THREE.Group();
    var body = new THREE.Group();
    group.add(body);
    group.userData.humanoid = outfitName;

    function box(parent, w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0);
      parent.add(m);
      return m;
    }
    // A limb hangs from its pivot: the joint group sits at the socket and
    // the segment is offset half its length below, so rotating the joint
    // swings the segment the way a limb actually swings.
    function segment(parent, len, w, d, mat, sock) {
      var j = new THREE.Group();
      j.position.set(sock[0], sock[1], sock[2]);
      parent.add(j);
      box(j, w, len, d, mat, 0, -len / 2, 0);
      return j;
    }

    var gore = !!opts.blood;
    var mTorso = matFor(THREE, outfit.torso, outfit, gore);
    var mUpper = matFor(THREE, outfit.upper, outfit, gore);
    var mFore = matFor(THREE, outfit.fore, outfit, gore);
    var mThigh = matFor(THREE, outfit.thigh, outfit, gore);
    var mShin = matFor(THREE, outfit.shin, outfit, gore);
    var mFoot = matFor(THREE, outfit.foot, outfit, gore);
    var mSkin = skinMat(THREE, outfit.skin);

    // ---- body ----
    // One extra pivot at the hips carries the whole upper body, so a pose
    // can fold a figure forward without moving the legs.
    var hips = new THREE.Group();
    hips.position.y = P.hipY;
    body.add(hips);

    var torso = new THREE.Group();
    hips.add(torso);
    box(torso, P.torsoW, P.torsoH, P.torsoD, mTorso, 0, P.torsoH / 2, 0);
    // a lab coat reads as a longer panel hanging past the hips
    if (outfit.coat) {
      box(torso, P.torsoW + 0.02, 0.26, P.torsoD + 0.02, mTorso, 0, -0.1, 0);
    }
    if (outfit.tie) {
      box(torso, 0.07, 0.26, 0.02, skinMat(THREE, 0xe6e6e4), 0, P.torsoH - 0.18, P.torsoD / 2 + 0.005);
    }

    var neck = box(torso, P.neckW, P.neckH, P.neckW, mSkin, 0, P.torsoH + P.neckH / 2, 0);
    void neck;
    var head = new THREE.Group();
    head.position.y = P.torsoH + P.neckH;
    torso.add(head);
    box(head, P.head, P.head, P.head, mSkin, 0, P.head / 2, 0);
    // hair as a thin cap, so heads aren't all identical blocks
    if (!opts.noHair) {
      box(head, P.head + 0.006, 0.05, P.head + 0.006,
        skinMat(THREE, opts.hair || 0x2b2119), 0, P.head - 0.02, 0);
    }

    // ---- arms ----
    var shoulderL = segment(torso, P.upper, P.upperW, P.upperD, mUpper,
      [P.shoulderX, P.shoulderY - P.hipY, 0]);
    var elbowL = segment(shoulderL, P.fore, P.foreW, P.foreD, mFore, [0, -P.upper, 0]);
    box(elbowL, P.foreW + 0.005, P.handH, P.foreD + 0.005, mSkin, 0, -P.fore - P.handH / 2, 0);

    var shoulderR = segment(torso, P.upper, P.upperW, P.upperD, mUpper,
      [-P.shoulderX, P.shoulderY - P.hipY, 0]);
    var elbowR = segment(shoulderR, P.fore, P.foreW, P.foreD, mFore, [0, -P.upper, 0]);
    box(elbowR, P.foreW + 0.005, P.handH, P.foreD + 0.005, mSkin, 0, -P.fore - P.handH / 2, 0);

    // ---- legs ----
    function leg(sx) {
      var hip = segment(hips, P.thigh, P.thighW, P.thighD, mThigh, [sx, 0, 0]);
      var knee = segment(hip, P.shin, P.shinW, P.shinD, mShin, [0, -P.thigh, 0]);
      // the foot sticks forward from the ankle
      box(knee, P.footW, P.footH, P.footD, mFoot, 0, -P.shin - P.footH / 2, -0.05);
      return { hip: hip, knee: knee };
    }
    var legL = leg(P.hipX), legR = leg(-P.hipX);

    var joints = {
      hips: hips, torso: torso, head: head,
      hipL: legL.hip, kneeL: legL.knee, hipR: legR.hip, kneeR: legR.knee,
      shoulderL: shoulderL, elbowL: elbowL, shoulderR: shoulderR, elbowR: elbowR
    };

    // The rest pose every animation returns to, captured before anything
    // touches it so setWalk can layer on top rather than accumulate.
    shoulderL.rotation.z = 0.06;
    shoulderR.rotation.z = -0.06;

    // Drop the posed body until its lowest point is on the floor. Measured
    // in the placement group's own frame, so this is correct whether the
    // figure has been positioned in the world yet or not.
    var measureBox = new THREE.Box3();
    function settleOnFloor() {
      var px = group.position.x, py = group.position.y, pz = group.position.z;
      var ry = group.rotation.y;
      group.position.set(0, 0, 0);
      group.rotation.y = 0;
      body.position.y = 0;
      group.updateMatrixWorld(true);
      measureBox.setFromObject(body);
      body.position.y = isFinite(measureBox.min.y) ? -measureBox.min.y : 0;
      group.position.set(px, py, pz);
      group.rotation.y = ry;
      group.updateMatrixWorld(true);
    }

    function pose(name) {
      var p = POSES[name] || POSES.stand;
      Object.keys(joints).forEach(function (k) {
        var r = p[k];
        joints[k].rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
      });
      if (!p.shoulderL) shoulderL.rotation.z = 0.06;
      if (!p.shoulderR) shoulderR.rotation.z = -0.06;
      body.rotation.x = p.tilt || 0;
      body.rotation.z = p.spin || 0;
      settleOnFloor();
      return api;
    }

    // A plain two-beat walk: opposite arm and leg, knees bending only on
    // the back swing. `amt` scales it so a shove reads different to a walk.
    function setWalk(phase, amt) {
      var a = amt === undefined ? 1 : amt;
      var s = Math.sin(phase), c = Math.cos(phase);
      legL.hip.rotation.x = s * 0.62 * a;
      legR.hip.rotation.x = -s * 0.62 * a;
      legL.knee.rotation.x = Math.max(0, -s) * 0.9 * a;
      legR.knee.rotation.x = Math.max(0, s) * 0.9 * a;
      shoulderL.rotation.x = -s * 0.42 * a;
      shoulderR.rotation.x = s * 0.42 * a;
      elbowL.rotation.x = (0.25 + Math.max(0, s) * 0.3) * a;
      elbowR.rotation.x = (0.25 + Math.max(0, -s) * 0.3) * a;
      hips.position.y = P.hipY + Math.abs(c) * 0.018 * a;
      return api;
    }

    // Metal reconstruction — the assembly floor's worst detail. Plates and
    // rods bolted over whatever was left.
    function addMetal(metalMat) {
      box(torso, P.torsoW * 0.8, 0.1, P.torsoD + 0.03, metalMat, 0, P.torsoH * 0.55, 0);
      var rod = box(torso, 0.03, 0.34, 0.03, metalMat, 0.14, P.torsoH * 0.4, 0.1);
      rod.rotation.z = 0.5;
      box(shoulderL, 0.035, 0.24, 0.035, metalMat, 0.05, -P.upper * 0.5, 0.03);
      box(legR.knee, P.shinW + 0.02, 0.07, P.shinD + 0.02, metalMat, 0, -0.12, 0);
      return api;
    }

    var _v = new THREE.Vector3();
    var _b = new THREE.Box3();
    var api = {
      group: group,
      joints: joints,
      pose: pose,
      setWalk: setWalk,
      addMetal: addMetal,
      // A standing figure occupies its own coordinates; a lying one sprawls
      // more than a metre away from them. Callers place bodies by where the
      // body should be, so recentre on the requested spot after posing and
      // rotating rather than making every placement compensate by hand.
      centerOn: function (x, z) {
        group.updateMatrixWorld(true);
        _b.setFromObject(group);
        group.position.x += x - (_b.min.x + _b.max.x) / 2;
        group.position.z += z - (_b.min.z + _b.max.z) / 2;
        group.updateMatrixWorld(true);
        return api;
      },
      // Where the blood should pool: under the chest, not under the feet.
      torsoWorld: function () {
        group.updateMatrixWorld(true);
        joints.torso.getWorldPosition(_v);
        return { x: _v.x, y: _v.y, z: _v.z };
      },
      // Everything the figure owns, for layer assignment and culling.
      each: function (fn) { group.traverse(function (o) { if (o.isMesh) fn(o); }); return api; }
    };
    return pose(opts.pose || 'stand');
  };
})();
