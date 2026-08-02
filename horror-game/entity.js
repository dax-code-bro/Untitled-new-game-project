/*
 * Untitled Horror Game — the Birch.
 *
 * A store mannequin, eleven feet tall, hand-carved from pale birch with
 * the joints left visible and tungsten bolts holding some of it together.
 * Its hands were made flat so it could never hurt anyone.
 *
 * It hides in the vents until the player takes the security cameras from
 * the warehouse. Then it haunts three spots — the storage unit (smearing
 * Nick's blood over itself), the holding cage (a frozen pirouette), the
 * warehouse (a raised-hand hello) — for 5 to 25 minutes at a time before
 * moving. While it is being LOOKED AT in a lurk or roam it cannot move.
 * Chases and rage don't care whether you're watching.
 *
 *   window.buildEntity(THREE, { scene, level }) → api
 */
(function () {
  'use strict';

  var RADIUS = 0.5;
  // The player walks at 2.9 and sprints at just under 5. A jog is pitched
  // a shade under a sprint on purpose: run the moment you hear it and you
  // stay ahead, hesitate and you do not. In the rage it matches a sprint,
  // and you are not outrunning it — you are getting a door down.
  var ROAM_SPEED = 2.2;
  var CHASE_SPEED = 4.45;
  var RAGE_SPEED = 4.92;
  var SENSE_RANGE = 3;
  // how far each kind of noise carries to it, in metres
  var NOISE = { still: 0, crawl: 2.6, crouch: 5.5, walk: 11, sprint: 19 };
  var LOSE_AFTER = 5;
  var CATCH_DIST = 1.2;
  var WATCH_DOT = 0.45;       // how centred you must have it to pin it
  var WATCH_RANGE = 48;

  var LURKS = [
    { id: 'storage',   x: 62.4, z: 2.6,  pose: 'smear' },
    { id: 'cage',      x: 54.3, z: 56,   pose: 'spin' },
    { id: 'warehouse', x: -56,  z: -2,   pose: 'hi' }
  ];

  var PATROL = [
    [-56, 2.2], [-50, 0], [-30, 0], [-10, 0], [0, 0.9],
    [10, 0], [30, 0], [44, 0], [49.5, 0], [49.5, 10],
    [49.5, 30], [49.5, 43]
  ];

  window.buildEntity = function buildEntity(THREE, ctx) {
    var scene = ctx.scene, level = ctx.level;
    var T = window.TEX;

    // ================= The mannequin =================
    var birchTex = T.wood(THREE, 512, [196, 180, 142], { knots: 3, grime: 3 });
    var birch = new THREE.MeshStandardMaterial({
      map: birchTex, bumpMap: birchTex, bumpScale: 0.1, roughness: 0.72
    });
    var birchBloody = new THREE.MeshStandardMaterial({
      map: birchTex, bumpMap: birchTex, bumpScale: 0.1, roughness: 0.8,
      color: 0x9c5a4a
    });
    var bolt = new THREE.MeshStandardMaterial({ color: 0x3c4144, roughness: 0.35, metalness: 0.85 });

    var g = new THREE.Group();
    // Yaw first, then the tilt, or the two mix: going flat to the ceiling
    // sets both at once and in the default order the body ends up lying
    // across the corridor on a diagonal instead of along it.
    g.rotation.order = 'YXZ';
    var meshes = { arms: {}, blood: [] };

    function cylPart(parent, rt, rb, h, x, y, z, mat) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat || birch);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    }
    function spherePart(parent, r, x, y, z, sx, sy, sz) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), birch);
      m.position.set(x, y, z);
      if (sx) m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    }
    function boltAt(parent, x, y, z, rz) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8), bolt);
      m.position.set(x, y, z);
      m.rotation.z = rz === undefined ? Math.PI / 2 : rz;
      parent.add(m);
      return m;
    }

    // Legs: stilt-thin, joints visible as turned balls with bolts through.
    // Hip and knee are separate groups so the thing can crouch, hunch and
    // splay itself flat against a ceiling instead of only swinging rigid.
    function leg(side) {
      var hip = new THREE.Group();
      hip.position.set(side * 0.17, 1.62, 0);
      spherePart(hip, 0.085, 0, 0, 0);
      boltAt(hip, 0, 0, 0);
      cylPart(hip, 0.06, 0.052, 0.78, 0, -0.42, 0);
      var kneeY = -0.82;
      spherePart(hip, 0.072, 0, kneeY, 0);
      boltAt(hip, 0, kneeY, 0);
      var knee = new THREE.Group();
      knee.position.set(0, kneeY, 0);
      cylPart(knee, 0.05, 0.046, 0.74, 0, -0.4, 0);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.3), birch);
      foot.position.set(0, -0.79, 0.07);
      knee.add(foot);
      hip.add(knee);
      g.add(hip);
      return { hip: hip, knee: knee, foot: foot };
    }
    var legL = leg(-1), legR = leg(1);

    // pelvis and a waist gap you can see through
    spherePart(g, 0.16, 0, 1.68, 0, 1.25, 0.62, 0.8);
    cylPart(g, 0.035, 0.035, 0.14, 0, 1.84, 0, bolt);   // exposed spine rod

    // Everything above the waist hangs off one hinge. Standing upright it
    // is eleven feet of mannequin and the corridors are eleven feet tall,
    // so it folds itself forward to get down them.
    var spine = new THREE.Group();
    spine.position.set(0, 1.84, 0);
    g.add(spine);

    // torso: a mannequin's tapered chest, far too thin
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.105, 0.98, 14), birch);
    torso.position.set(0, 0.58, 0);
    spine.add(torso);
    spherePart(spine, 0.155, 0, 1.06, 0, 1.15, 0.5, 0.85);   // chest cap
    boltAt(spine, -0.1, 0.78, 0.12, 0.5);
    boltAt(spine, 0.12, 0.36, -0.1, 1.1);

    // blood smears (hidden until it visits Nick)
    [[0, 0.71, 0.15, 0.22, 0.5], [-0.07, 0.36, 0.12, 0.16, 0.4], [0.09, 0.91, 0.13, 0.18, 0.3]].forEach(function (b) {
      var s = new THREE.Mesh(new THREE.PlaneGeometry(b[3], b[4]),
        new THREE.MeshStandardMaterial({ color: 0x571812, roughness: 0.55, transparent: true, opacity: 0.85 }));
      s.position.set(b[0], b[1], b[2]);
      s.rotation.z = Math.random();
      s.visible = false;
      spine.add(s);
      meshes.blood.push(s);
    });

    // Arms: hung from bolted shoulder balls, ending in FLAT hands. The
    // elbow is its own group — it needs to arch them out and sweep the
    // walls with the backs of its hands, which a rigid arm cannot do.
    function arm(side) {
      var sh = new THREE.Group();
      sh.position.set(side * 0.26, 1.02, 0);
      spherePart(sh, 0.08, 0, 0, 0);
      boltAt(sh, 0, 0, 0, 0);
      cylPart(sh, 0.047, 0.042, 0.74, 0, -0.4, 0);
      spherePart(sh, 0.06, 0, -0.8, 0);
      boltAt(sh, 0, -0.8, 0);
      var el = new THREE.Group();
      el.position.set(0, -0.8, 0);
      cylPart(el, 0.04, 0.036, 0.72, 0, -0.38, 0);
      // the flat hand — a paddle of wood, edge-on it disappears
      var hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.016), birch);
      hand.position.set(0, -0.92, 0);
      el.add(hand);
      sh.add(el);
      spine.add(sh);
      return { shoulder: sh, elbow: el, hand: hand };
    }
    var armL = arm(-1), armR = arm(1);
    meshes.arms.left = armL;
    meshes.arms.right = armR;

    // neck and the head: a featureless egg — until something is drawn on it
    var neck = cylPart(spine, 0.035, 0.045, 0.16, 0, 1.18, 0);
    void neck;
    var headGroup = new THREE.Group();
    headGroup.position.set(0, 1.40, 0);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14), birch);
    head.scale.set(0.92, 1.22, 0.98);
    headGroup.add(head);

    // the face: a transparent canvas hovering just off the wood
    var faceCanvas = document.createElement('canvas');
    faceCanvas.width = faceCanvas.height = 128;
    var faceCtx = faceCanvas.getContext('2d');
    var faceTex = new THREE.CanvasTexture(faceCanvas);
    var facePlane = new THREE.Mesh(new THREE.CircleGeometry(0.115, 20),
      new THREE.MeshBasicMaterial({ map: faceTex, transparent: true }));
    facePlane.position.set(0, 0.01, 0.15);
    headGroup.add(facePlane);
    spine.add(headGroup);

    function drawFace(kind) {
      var x = faceCtx;
      x.clearRect(0, 0, 128, 128);
      if (kind === 'none') { faceTex.needsUpdate = true; return; }
      x.strokeStyle = kind === 'blood' ? 'rgba(120,26,18,0.92)' : 'rgba(28,26,24,0.9)';
      x.lineWidth = kind === 'blood' ? 7 : 5;
      x.lineCap = 'round';
      // two line eyes, drawn the way a child draws them
      x.beginPath(); x.moveTo(42, 38); x.lineTo(44, 60); x.stroke();
      x.beginPath(); x.moveTo(84, 36); x.lineTo(85, 59); x.stroke();
      // that signature smile
      x.beginPath();
      x.moveTo(32, 76);
      x.quadraticCurveTo(64, 112, 96, 74);
      x.stroke();
      faceTex.needsUpdate = true;
    }
    drawFace('none');

    g.visible = false;
    scene.add(g);

    // fallen pieces appear in the world when parts break off
    function dropPiece(size, x, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), birch);
      m.position.set(x + (Math.random() - 0.5) * 0.8, size[1] / 2 + 0.01, z + (Math.random() - 0.5) * 0.8);
      m.rotation.y = Math.random() * 3;
      scene.add(m);
      return m;
    }

    // ================= Poses =================
    function setPose(name) {
      // reset
      armL.shoulder.rotation.set(0, 0, 0); armR.shoulder.rotation.set(0, 0, 0);
      armL.elbow.rotation.set(0, 0, 0); armR.elbow.rotation.set(0, 0, 0);
      legL.hip.rotation.set(0, 0, 0); legR.hip.rotation.set(0, 0, 0);
      legL.knee.rotation.set(0, 0, 0); legR.knee.rotation.set(0, 0, 0);
      headGroup.rotation.set(0, 0, 0);
      spine.rotation.set(0, 0, 0);
      g.rotation.z = 0;
      pose = name;
      if (name === 'hi') {
        armR.shoulder.rotation.z = Math.PI - 0.25;   // one flat hand raised: hello
        headGroup.rotation.z = 0.12;
      } else if (name === 'spin') {
        armL.shoulder.rotation.z = -Math.PI / 2 + 0.2;   // a wooden ballerina, stopped
        armR.shoulder.rotation.z = Math.PI / 2 - 0.2;
        legR.hip.rotation.x = -0.9;
        legR.knee.rotation.x = 0.5;
        g.rotation.z = 0.06;
        headGroup.rotation.y = 0.7;
      } else if (name === 'smear') {
        armL.shoulder.rotation.x = -1.1;             // both hands at the face
        armR.shoulder.rotation.x = -1.15;
        armL.elbow.rotation.x = -1.2; armR.elbow.rotation.x = -1.25;
        armL.shoulder.rotation.z = -0.25; armR.shoulder.rotation.z = 0.25;
        headGroup.rotation.x = 0.35;
      } else if (name === 'menace') {
        armR.shoulder.rotation.x = -Math.PI + 0.4;   // hand high, about to spear
        armR.elbow.rotation.x = 0.5;
        headGroup.rotation.x = -0.15;
      }
    }
    var pose = 'walk';

    // ================= Brain =================
    // dormant | lurk | roam | chase | rage | frozen | banging | menace | destroyed
    var mode = 'dormant';
    var pos = { x: LURKS[2].x, z: LURKS[2].z };
    var facing = 0;
    var lurkIndex = 2;
    var lurkT = 0;
    var lurkScale = 1;          // tests shrink the 5–25 minute waits
    var roamTarget = null;      // {x,z, hunt:bool}
    var wpIndex = 0, wpDir = 1;
    var lastSeen = 0;
    var staggerT = 0, freezeT = 0, bangT = 0, menaceT = 0, rageT = 0;
    var hits = 0;
    var walkT = 0;
    var bloodied = false;
    var armsLeft = 2;
    var headOn = true;
    var spottedOnce = false;
    var fleeT = 0;
    var angered = false;        // it has been shot; tomorrow night is worse
    var frozenForKill = false;  // the kill cam is animating it by hand
    var menaceCam = -1;
    var watched = false;
    var ventsOpen = false;
    var daylightHold = null;   // the mode it was in when the sun came up
    var standT = 0;

    function lurkDuration() { return (300 + Math.random() * 1200) * lurkScale; }

    function segmentHitsBox(x1, z1, x2, z2, b) {
      var dx = x2 - x1, dz = z2 - z1;
      var tmin = 0, tmax = 1;
      if (Math.abs(dx) < 1e-9) { if (x1 < b.x1 || x1 > b.x2) return false; }
      else {
        var tx1 = (b.x1 - x1) / dx, tx2 = (b.x2 - x1) / dx;
        tmin = Math.max(tmin, Math.min(tx1, tx2));
        tmax = Math.min(tmax, Math.max(tx1, tx2));
      }
      if (Math.abs(dz) < 1e-9) { if (z1 < b.z1 || z1 > b.z2) return false; }
      else {
        var tz1 = (b.z1 - z1) / dz, tz2 = (b.z2 - z1) / dz;
        tmin = Math.max(tmin, Math.min(tz1, tz2));
        tmax = Math.min(tmax, Math.max(tz1, tz2));
      }
      return tmax >= tmin;
    }
    function losClear(x1, z1, x2, z2) {
      var walls = level.wallBoxes;
      for (var i = 0; i < walls.length; i++) if (segmentHitsBox(x1, z1, x2, z2, walls[i])) return false;
      var cols = level.colliders;
      for (var j = 0; j < cols.length; j++) {
        var c = cols[j];
        if (!c.id || c.id === 'cage') continue;
        if (c.id.indexOf('seal') === 0) { if (!api.isSealActive(c.id)) continue; }
        else if (level.isDoorOpen(c.id)) continue;
        if (segmentHitsBox(x1, z1, x2, z2, c)) return false;
      }
      return true;
    }

    function move(nx, nz) {
      var r = RADIUS;
      function push(b) {
        if (nx + r < b.x1 || nx - r > b.x2 || nz + r < b.z1 || nz - r > b.z2) return;
        var pxl = (nx + r) - b.x1, pxr = b.x2 - (nx - r);
        var pzt = (nz + r) - b.z1, pzb = b.z2 - (nz - r);
        var mx = Math.min(pxl, pxr), mz = Math.min(pzt, pzb);
        if (mx < mz) nx += (pxl < pxr) ? -mx : mx;
        else nz += (pzt < pzb) ? -mz : mz;
      }
      var boxes = level.wallBoxes;
      for (var i = 0; i < boxes.length; i++) push(boxes[i]);
      for (var j = 0; j < level.colliders.length; j++) {
        var c = level.colliders[j];
        if (!c.id) continue;
        if (c.id.indexOf('seal') === 0) {
          if (api.isSealActive(c.id)) push(c);   // tungsten does not negotiate
          continue;
        }
        if (level.isDoorOpen(c.id)) continue;
        if (c.id === 'barricade' || c.id === 'cage') { push(c); continue; }
        var cx = Math.max(c.x1, Math.min(nx, c.x2));
        var cz = Math.max(c.z1, Math.min(nz, c.z2));
        if ((nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) < 1.1) {
          level.toggleDoor(c.id);
          if (api.onDoorSlam) api.onDoorSlam(c.id);
        } else push(c);
      }
      return { x: nx, z: nz };
    }

    // It has no eyes and no nose. The face is a drawing. What it has is a
    // chip that never stopped thinking and a body that reads the room off
    // the tiny shifts coming back at it — so it finds you by the noise you
    // make, from any direction, and it cannot find you at all if you are
    // still. Turning your back on it means nothing. Standing still means
    // everything.
    //
    // `noise` is how far the sound the player is currently making carries,
    // in metres, and comes in from the engine each tick.
    var lastNoise = 0;
    function canSense(px, pz, noise) {
      var dist = Math.hypot(px - pos.x, pz - pos.z);
      if (noise <= 0) return false;
      if (dist > noise) return false;
      // straight through the air, or muffled round a corner at less than
      // half the range. Tungsten stops it dead either way.
      if (losClear(pos.x, pos.z, px, pz)) return true;
      return dist < noise * 0.42 && dist < SENSE_RANGE * 2.2;
    }

    function nearestWaypoint(x, z) {
      var best = 0, bd = Infinity;
      for (var i = 0; i < PATROL.length; i++) {
        var d = (PATROL[i][0] - x) * (PATROL[i][0] - x) + (PATROL[i][1] - z) * (PATROL[i][1] - z);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function beginLurk(index) {
      lurkIndex = index === undefined ? Math.floor(Math.random() * LURKS.length) : index;
      var spot = LURKS[lurkIndex];
      pos.x = spot.x; pos.z = spot.z;
      mode = 'lurk';
      lurkT = lurkDuration();
      setPose(spot.pose);
      if (spot.id === 'storage' && !bloodied) {
        bloodied = true;
        meshes.blood.forEach(function (b) { b.visible = true; });
        torso.material = birchBloody;
        head.material = birchBloody;
      }
      if (api.onLurk) api.onLurk(spot.id);
    }

    function beginRoam() {
      setPose('walk');
      var hunt = Math.random() < 0.5;
      if (hunt) roamTarget = { x: 0, z: 0.9, hunt: true };       // it comes to Waiting
      else {
        var next = (lurkIndex + 1 + Math.floor(Math.random() * (LURKS.length - 1))) % LURKS.length;
        // with the grates off, it takes the ducts — no corridor, no warning
        if (ventsOpen && Math.random() < 0.6) {
          beginLurk(next);
          if (api.onVentMove) api.onVentMove(pos.x, pos.z);
          return;
        }
        roamTarget = { x: LURKS[next].x, z: LURKS[next].z, hunt: false, lurk: next };
      }
      wpIndex = nearestWaypoint(pos.x, pos.z);
      mode = 'roam';
      if (api.onWindup) api.onWindup();
      // does it pass one of the player's cameras on the way?
      if (api.findCameraNear) {
        var cam = api.findCameraNear(pos.x, pos.z, roamTarget.x, roamTarget.z);
        if (cam >= 0 && Math.random() < 0.4) {
          menaceCam = cam;
          menaceT = 8;
          mode = 'menace';
          drawFace('blood');
          setPose('menace');
          var cp = api.cameraPos(cam);
          if (cp) { pos.x = cp.x; pos.z = cp.z; }
          return;
        }
      }
    }

    function beginChase() {
      mode = 'chase';
      lastSeen = 0;
      setPose('walk');
    }

    function beginRage(seconds) {
      mode = 'rage';
      rageT = seconds === undefined ? 75 : seconds;
      drawFace('sharpie');
      setPose('walk');
      if (api.onRage) api.onRage();
    }

    // Put a bullet in it and it does not come for you — it goes. Away,
    // fast, out of the room, and it does not come back that night. It
    // comes back the NEXT night, and it comes back on the ceiling.
    function beginFlee() {
      mode = 'flee';
      fleeT = 12;
      angered = true;
      setPose('walk');
      // pick the lurk furthest from the player's noise and run for it
      var best = 0, bd = -1;
      for (var i = 0; i < LURKS.length; i++) {
        var d = Math.hypot(LURKS[i].x - pos.x, LURKS[i].z - pos.z);
        if (d > bd) { bd = d; best = i; }
      }
      roamTarget = { x: LURKS[best].x, z: LURKS[best].z, hunt: false, lurk: best };
      wpIndex = nearestWaypoint(pos.x, pos.z);
      if (api.onFlee) api.onFlee();
    }

    var api = {
      group: g,
      onCaught: null, onDoorSlam: null, onStep: null, onSpotted: null,
      onLurk: null, onRage: null, onBang: null, onWindup: null, onFlee: null,
      NOISE: NOISE,
      speeds: function () { return { roam: ROAM_SPEED, chase: CHASE_SPEED, rage: RAGE_SPEED }; },
      // the kill choreography drives the body directly
      parts: { spine: spine, head: headGroup, armL: armL, armR: armR, legL: legL, legR: legR },
      setPose: function (n) { setPose(n); },
      holdStill: function (on) { frozenForKill = !!on; },
      onCameraDestroyed: null, onArmBroken: null, onHeadBroken: null,
      // supplied by the engine:
      isSealActive: function () { return false; },
      findCameraNear: null, cameraPos: null,

      activate: function () {
        if (mode !== 'dormant') return;
        g.visible = true;
        beginLurk();
      },
      reset: function () {
        if (mode === 'dormant' || mode === 'destroyed') return;
        staggerT = freezeT = bangT = menaceT = rageT = 0;
        drawFace(bloodied ? 'none' : 'none');
        beginLurk();
      },
      freeze: function (seconds) {
        if (mode === 'destroyed' || mode === 'dormant') return false;
        freezeT = seconds;
        mode = 'frozen';
        return true;
      },
      shockAtCage: function () {
        if (mode === 'lurk' && LURKS[lurkIndex].id === 'cage') return api.freeze(100);
        return false;
      },
      // Hurting it is a decision, not a defence. It reels, it runs, and it
      // remembers — every night after this one it hunts you enraged.
      hitShot: function (stagger) {
        if (mode === 'dormant' || mode === 'destroyed') return false;
        hits++;
        staggerT = Math.max(staggerT, stagger || 1.1);
        if (mode === 'rage') return true;        // already past caring
        beginFlee();
        return true;
      },
      isAngered: function () { return angered; },
      // the riot shield turns its own attacks against it
      breakArm: function () {
        if (armsLeft <= 0) return false;
        armsLeft--;
        angered = true;          // a bullet is not the only way to hurt it
        var which = armsLeft === 1 ? armR : armL;
        which.shoulder.visible = false;
        dropPiece([0.06, 1.5, 0.08], pos.x, pos.z);
        if (api.onArmBroken) api.onArmBroken(armsLeft);
        staggerT = 1.6;
        return true;
      },
      breakHead: function () {
        if (!headOn) return false;
        headOn = false;
        headGroup.visible = false;
        dropPiece([0.24, 0.32, 0.24], pos.x, pos.z);
        mode = 'destroyed';
        // the body folds where it stands
        g.rotation.x = Math.PI / 2 - 0.15;
        g.position.y = 0.35;
        if (api.onHeadBroken) api.onHeadBroken(pos.x, pos.z);
        return true;
      },
      setWatched: function (w) { watched = w; },
      setVentsOpen: function (v) { ventsOpen = !!v; },
      // Daylight sends it back to whatever it does when it is not hunting.
      // It is not destroyed and it is not asleep — it is somewhere else, and
      // it comes back the moment the light goes.
      setDaylight: function (day) {
        if (mode === 'destroyed') return;
        if (day) {
          if (mode !== 'dormant') { daylightHold = mode; }
          mode = 'dormant';
          rageT = 0;
          g.visible = false;
        } else if (daylightHold) {
          lurkT = 0;
          beginLurk(Math.floor(Math.random() * LURKS.length));
          daylightHold = null;
          g.visible = true;
          // it was shot yesterday. It has had all day to think about it.
          if (angered) beginRage(Infinity);
        }
      },
      isHidden: function () { return mode === 'dormant'; },
      // It climbs back into the cage it tore open and folds up in there,
      // perfectly still, like something on charge.
      settleInCage: function (x, z) {
        pos.x = x; pos.z = z;
        mode = 'lurk';
        lurkIndex = 1;             // the cage
        lurkT = 1e9;               // it stays until something moves it
        facing = Math.PI;
        setPose('spin');
        drawFace('none');
        g.visible = true;
      },
      // materialise in front of a camera, already looking at the lens
      spawnAt: function (x, z, face) {
        pos.x = x; pos.z = z;
        if (face !== undefined) facing = face;
        mode = 'stand';
        standT = lurkDuration() * 0.4;
        setPose('menace');
        g.visible = true;
        g.position.set(pos.x, 0, pos.z);
        g.rotation.y = facing;
      },
      // shocked anywhere but the cage: it screams and charges the hallway
      shocked: function () {
        if (mode === 'dormant' || mode === 'destroyed') return false;
        staggerT = 0; freezeT = 0;
        mode = 'charge';
        roamTarget = { x: 0, z: 0.9, hunt: true };
        wpIndex = nearestWaypoint(pos.x, pos.z);
        setPose('walk');
        return true;
      },
      onVentMove: null,
      los: function (x1, z1, x2, z2) { return losClear(x1, z1, x2, z2); },
      setLurkScale: function (s) { lurkScale = s; },

      update: function (dt, px, pz, noise) {
        if (mode === 'dormant' || mode === 'destroyed') return;
        if (frozenForKill) return;              // the kill cam owns the body
        noise = noise === undefined ? NOISE.walk : noise;
        lastNoise = noise;

        var dx = px - pos.x, dz = pz - pos.z;
        var dist = Math.hypot(dx, dz);

        // being caught does not care what state it is in — but a flat
        // hand cannot pass through a wall or a sealed shutter
        if (dist < CATCH_DIST && mode !== 'frozen' && api.onCaught &&
            losClear(pos.x, pos.z, px, pz)) api.onCaught(armsLeft, headOn);

        if (mode === 'frozen') {
          freezeT -= dt;
          if (freezeT <= 0) beginLurk(lurkIndex);
          return;
        }

        if (staggerT > 0) {
          staggerT -= dt;
          g.rotation.x = -0.12 * Math.max(0, staggerT);
          g.position.set(pos.x, 0, pos.z);
          return;
        }
        if (mode !== 'destroyed') g.rotation.x = 0;

        if (mode === 'menace') {
          menaceT -= dt;
          if (menaceT <= 0) {
            if (api.onCameraDestroyed) api.onCameraDestroyed(menaceCam);
            drawFace(rageT > 0 ? 'sharpie' : 'none');
            menaceCam = -1;
            beginRoam();
          }
          g.position.set(pos.x, 0, pos.z);
          return;
        }

        if (mode === 'banging') {
          bangT -= dt;
          if (api.onBang && Math.random() < dt * 1.4) api.onBang(dist);
          if (bangT <= 0) {
            if (Math.random() < 0.35) beginRage();
            else beginLurk();
          }
          return;
        }

        if (mode === 'lurk' || mode === 'stand') {
          // it moves only when nobody is looking at it
          var tRef = mode === 'stand' ? (standT -= dt, standT) : (lurkT -= dt, lurkT);
          if (!watched && tRef <= 0) beginRoam();
          if (canSense(px, pz, noise) && dist < 9 && !watched) { beginChase(); }
          g.position.set(pos.x, 0, pos.z);
          return;
        }

        var moving = false;
        var speed = 0, tx = pos.x, tz = pos.z;

        if (mode === 'flee') {
          // straight away from you, then gone for the rest of the night
          fleeT -= dt;
          if (fleeT <= 0) { beginLurk(roamTarget ? roamTarget.lurk : undefined); return; }
          speed = RAGE_SPEED;
          tx = roamTarget.x; tz = roamTarget.z;
          moving = true;
        } else if (mode === 'chase' || mode === 'rage') {
          if (mode === 'rage') {
            rageT -= dt;
            if (rageT <= 0) { drawFace('none'); beginLurk(); return; }
            speed = RAGE_SPEED; tx = px; tz = pz;      // rage always knows
            moving = true;
          } else {
            if (canSense(px, pz, noise)) lastSeen = 0; else lastSeen += dt;
            if (lastSeen > LOSE_AFTER) { beginLurk(); return; }
            speed = CHASE_SPEED; tx = px; tz = pz;
            moving = true;
          }
        } else if (mode === 'roam' || mode === 'charge') {
          // a roam is pinned by a look; a shocked charge is not
          if (mode === 'roam' && watched) { g.position.set(pos.x, 0, pos.z); return; }
          if (canSense(px, pz, noise)) {
            mode = 'chase'; lastSeen = 0;
            if (!spottedOnce) { spottedOnce = true; if (api.onSpotted) api.onSpotted(true); }
            else if (api.onSpotted) api.onSpotted(false);
            return;
          }
          speed = mode === 'charge' ? RAGE_SPEED : ROAM_SPEED;
          var wp = PATROL[wpIndex];
          var targetNear = Math.hypot(roamTarget.x - pos.x, roamTarget.z - pos.z);
          if (targetNear < 12 || wpIndex < 0) { tx = roamTarget.x; tz = roamTarget.z; }
          else {
            tx = wp[0]; tz = wp[1];
            if (Math.hypot(tx - pos.x, tz - pos.z) < 0.7) {
              var targetWp = nearestWaypoint(roamTarget.x, roamTarget.z);
              wpIndex += (targetWp > wpIndex) ? 1 : (targetWp < wpIndex ? -1 : 0);
            }
          }
          moving = true;
          if (targetNear < 0.9) {
            if (roamTarget.hunt) { beginLurk(); return; }
            beginLurk(roamTarget.lurk);
            return;
          }
        }

        // A sealed shutter in its path stops it dead — whichever way it was
        // coming. This used to be checked only on a roam toward Waiting, so
        // once it could hear you it would walk into the tungsten and press
        // there silently instead of hitting it.
        if (moving && (mode === 'chase' || mode === 'rage' ||
            (mode !== 'flee' && roamTarget && roamTarget.hunt))) {
          var sealHit = api.isSealActive('sealWest') && Math.abs(pos.x + 8) < 2.6 && Math.abs(pos.z) < 2.8 ? 'sealWest'
            : api.isSealActive('sealEast') && Math.abs(pos.x - 8) < 2.6 && Math.abs(pos.z) < 2.8 ? 'sealEast' : null;
          if (sealHit) {
            mode = 'banging';
            bangT = 9;
            if (api.onBang) api.onBang(dist);
            return;
          }
        }

        if (moving) {
          var mdx = tx - pos.x, mdz = tz - pos.z;
          var mlen = Math.hypot(mdx, mdz) || 1;
          var want = Math.atan2(-mdx, -mdz);
          var turn = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
          facing += Math.max(-3 * dt, Math.min(3 * dt, turn));
          var resolved = move(pos.x + (mdx / mlen) * speed * dt, pos.z + (mdz / mlen) * speed * dt);
          pos.x = resolved.x; pos.z = resolved.z;

          stepAccumulate(dt, speed, dist);
        }

        // ---------------- presentation ----------------
        animate(dt, moving, dist);
      },

      getState: function () {
        return {
          mode: mode, x: pos.x, z: pos.z, hits: hits, facing: facing,
          lurk: mode === 'lurk' ? LURKS[lurkIndex].id : null,
          bloodied: bloodied, armsLeft: armsLeft, headOn: headOn,
          raging: rageT > 0, watched: watched,
          angered: angered, noise: lastNoise,
          hunch: hunch, splay: splay, onCeiling: ceilingT > 0.5,
          y: g.position.y, headSpin: headGroup.rotation.y, pose: pose
        };
      },
      force: function (x, z, m, lurkId) {
        pos.x = x; pos.z = z;
        staggerT = freezeT = bangT = menaceT = 0;
        if (m) {
          mode = m;
          if (m === 'lurk') {
            beginLurk(lurkId !== undefined ? lurkId : lurkIndex);
          }
          if (m === 'roam') {
            // forcing a roam always means a fresh hunt toward Waiting —
            // a stale target from an earlier roam must never leak in
            roamTarget = { x: 0, z: 0.9, hunt: true };
            wpIndex = nearestWaypoint(x, z);
            setPose('walk');
          }
          if (m !== 'rage') rageT = 0;
          if (m === 'rage') beginRage();
        }
        if (mode !== 'dormant') g.visible = true;
        g.position.set(pos.x, 0, pos.z);
      }
    };

    // ================= Movement, drawn =================
    // Three gaits and a fourth thing that is not a gait at all.
    //
    //   walk  — hunched, arms hanging, taking the building at its leisure
    //   jog   — arms thrown out and arched, hands sweeping the walls; this
    //           is what it does once it has heard you
    //   crawl — rage only: flat on the ceiling, head turning all the way
    //           round underneath it
    //
    // The hunch is not decoration. Standing straight it is 3.4m and the
    // corridor ceilings are 3.4m, so it folds itself to fit and unfolds
    // again the moment it reaches a room with height.
    var hunch = 0, splay = 0, ceilingT = 0;
    function ceilingAt(x, z) {
      var r = level.roomAt(x, z);
      return (r && r.h) ? r.h : 3.4;
    }
    function headroom(x, z) { return ceilingAt(x, z) - 3.46; }   // negative: it does not fit

    function animate(dt, moving, dist) {
      var raging = mode === 'rage';
      var jogging = mode === 'chase' || mode === 'charge' || raging;
      walkT += dt * (raging ? 8.5 : jogging ? 6.4 : 3.1);

      // ---- on the ceiling ----
      // In its rage it goes up. Flat to the ceiling, limbs splayed out to
      // the sides, working along on the backs of its hands.
      var wantCeiling = raging && moving;
      ceilingT += ((wantCeiling ? 1 : 0) - ceilingT) * Math.min(1, dt * 3.5);
      if (ceilingT > 0.02) {
        var ch = ceilingAt(pos.x, pos.z);
        var flat = ceilingT;
        g.rotation.x = -Math.PI / 2 * flat;
        g.rotation.z = 0;
        // lying prone the model runs along +y, so lift it to the ceiling
        // and let the interpolation carry it up off the floor
        g.position.set(pos.x, (ch - 0.42) * flat, pos.z);
        g.rotation.y = facing;
        var sp = Math.sin(walkT), sp2 = Math.cos(walkT);
        // limbs out to the sides, hauling along opposite pairs
        legL.hip.rotation.z = 1.15 * flat; legR.hip.rotation.z = -1.15 * flat;
        legL.hip.rotation.x = sp * 0.5 * flat; legR.hip.rotation.x = -sp * 0.5 * flat;
        legL.knee.rotation.x = (0.7 + sp * 0.4) * flat;
        legR.knee.rotation.x = (0.7 - sp * 0.4) * flat;
        if (armsLeft > 0) {
          armL.shoulder.rotation.z = -1.35 * flat;
          armL.shoulder.rotation.x = -sp2 * 0.6 * flat;
          armL.elbow.rotation.x = -1.0 * flat;
        }
        if (armsLeft > 1) {
          armR.shoulder.rotation.z = 1.35 * flat;
          armR.shoulder.rotation.x = sp2 * 0.6 * flat;
          armR.elbow.rotation.x = -1.0 * flat;
        }
        spine.rotation.x = -0.25 * flat;
        // the head hangs back off the neck to point at the floor, and keeps
        // turning — there is nothing in the joint to stop it
        headGroup.rotation.x = -1.5 * flat;
        headGroup.rotation.y += dt * 6.2;
        return;
      }

      // ---- on the floor ----
      g.rotation.x = 0;
      g.rotation.z = 0;
      g.rotation.y = facing;
      g.position.set(pos.x, moving ? Math.abs(Math.sin(walkT)) * 0.045 : 0, pos.z);

      // fold to fit the ceiling, and fold further when hurrying
      var room = headroom(pos.x, pos.z);
      var wantHunch = (room < 0 ? Math.min(0.62, -room * 1.15 + 0.16) : 0.06)
        + (jogging ? 0.22 : 0) + (raging ? 0.1 : 0);
      hunch += (wantHunch - hunch) * Math.min(1, dt * 4);
      spine.rotation.x = hunch;

      // arms out and arched once it is hunting: it is reading the room off
      // the walls, and the hands are how it does that
      var wantSplay = jogging ? 1 : 0;
      splay += (wantSplay - splay) * Math.min(1, dt * 3);

      if (!moving && !jogging) {
        // standing still in a lurk pose — leave whatever setPose put there
        headGroup.rotation.y = Math.sin(walkT * 0.22) * 0.6;
        return;
      }

      var s = Math.sin(walkT), c = Math.cos(walkT);
      legL.hip.rotation.set(s * (jogging ? 0.78 : 0.46), 0, 0);
      legR.hip.rotation.set(-s * (jogging ? 0.78 : 0.46), 0, 0);
      // knees only bend one way, and only on the leg coming through
      legL.knee.rotation.x = Math.max(0, -s) * (jogging ? 1.15 : 0.5);
      legR.knee.rotation.x = Math.max(0, s) * (jogging ? 1.15 : 0.5);

      if (armsLeft > 0) {
        armL.shoulder.rotation.x = -c * (0.3 + splay * 0.25) - splay * 0.55;
        armL.shoulder.rotation.z = -splay * (1.02 + Math.sin(walkT * 0.7) * 0.16);
        armL.elbow.rotation.x = -splay * (0.95 + c * 0.3);
        armL.elbow.rotation.z = 0;
      }
      if (armsLeft > 1) {
        armR.shoulder.rotation.x = c * (0.3 + splay * 0.25) - splay * 0.55;
        armR.shoulder.rotation.z = splay * (1.02 - Math.sin(walkT * 0.7) * 0.16);
        armR.elbow.rotation.x = -splay * (0.95 - c * 0.3);
        armR.elbow.rotation.z = 0;
      }

      // the head: a slow sweep while it walks, a full rotation in the rage,
      // and locked forward on the last stretch of a chase
      if (raging) headGroup.rotation.y += dt * 5.5;
      else if (jogging && dist < 6) headGroup.rotation.set(0.12, 0, 0);
      else headGroup.rotation.set(0, Math.sin(walkT * 0.28) * 0.75, 0);

      if (armsLeft === 0 && headOn) g.rotation.x = 0.28;   // the desperate lean
    }

    var stepClock = 0;
    function stepAccumulate(dt, speed, dist) {
      stepClock += speed * dt;
      var stride = mode === 'rage' ? 1.2 : mode === 'chase' ? 1.35 : 1.75;
      if (stepClock > stride) {
        stepClock = 0;
        if (api.onStep) api.onStep(dist, mode === 'chase' || mode === 'rage');
      }
    }

    return api;
  };
})();
