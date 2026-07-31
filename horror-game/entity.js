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
  var ROAM_SPEED = 2.2;
  var CHASE_SPEED = 3.4;
  var RAGE_SPEED = 4.6;
  var SIGHT_RANGE = 17;
  var SENSE_RANGE = 3;
  var FOV = Math.PI * 0.42;
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

    // legs: stilt-thin, joints visible as turned balls with bolts through
    function leg(side) {
      var hip = new THREE.Group();
      hip.position.set(side * 0.17, 1.62, 0);
      spherePart(hip, 0.085, 0, 0, 0);
      boltAt(hip, 0, 0, 0);
      cylPart(hip, 0.06, 0.052, 0.78, 0, -0.42, 0);
      var kneeY = -0.82;
      spherePart(hip, 0.072, 0, kneeY, 0);
      boltAt(hip, 0, kneeY, 0);
      cylPart(hip, 0.05, 0.046, 0.74, 0, kneeY - 0.4, 0);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.3), birch);
      foot.position.set(0, kneeY - 0.79, 0.07);
      hip.add(foot);
      g.add(hip);
      return hip;
    }
    var legL = leg(-1), legR = leg(1);

    // pelvis and a waist gap you can see through
    spherePart(g, 0.16, 0, 1.68, 0, 1.25, 0.62, 0.8);
    cylPart(g, 0.035, 0.035, 0.14, 0, 1.84, 0, bolt);   // exposed spine rod

    // torso: a mannequin's tapered chest, far too thin
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.105, 0.98, 14), birch);
    torso.position.set(0, 2.42, 0);
    g.add(torso);
    spherePart(g, 0.155, 0, 2.9, 0, 1.15, 0.5, 0.85);   // chest cap
    boltAt(g, -0.1, 2.62, 0.12, 0.5);
    boltAt(g, 0.12, 2.2, -0.1, 1.1);

    // blood smears (hidden until it visits Nick)
    [[0, 2.55, 0.15, 0.22, 0.5], [-0.07, 2.2, 0.12, 0.16, 0.4], [0.09, 2.75, 0.13, 0.18, 0.3]].forEach(function (b) {
      var s = new THREE.Mesh(new THREE.PlaneGeometry(b[3], b[4]),
        new THREE.MeshStandardMaterial({ color: 0x571812, roughness: 0.55, transparent: true, opacity: 0.85 }));
      s.position.set(b[0], b[1], b[2]);
      s.rotation.z = Math.random();
      s.visible = false;
      g.add(s);
      meshes.blood.push(s);
    });

    // arms: hung from bolted shoulder balls, ending in FLAT hands
    function arm(side) {
      var sh = new THREE.Group();
      sh.position.set(side * 0.26, 2.86, 0);
      spherePart(sh, 0.08, 0, 0, 0);
      boltAt(sh, 0, 0, 0, 0);
      cylPart(sh, 0.047, 0.042, 0.74, 0, -0.4, 0);
      spherePart(sh, 0.06, 0, -0.8, 0);
      boltAt(sh, 0, -0.8, 0);
      cylPart(sh, 0.04, 0.036, 0.72, 0, -1.18, 0);
      // the flat hand — a paddle of wood, edge-on it disappears
      var hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.016), birch);
      hand.position.set(0, -1.72, 0);
      sh.add(hand);
      g.add(sh);
      return sh;
    }
    var armL = arm(-1), armR = arm(1);
    meshes.arms.left = armL;
    meshes.arms.right = armR;

    // neck and the head: a featureless egg — until something is drawn on it
    var neck = cylPart(g, 0.035, 0.045, 0.16, 0, 3.02, 0);
    void neck;
    var headGroup = new THREE.Group();
    headGroup.position.set(0, 3.24, 0);
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
    g.add(headGroup);

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
      armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0);
      legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
      headGroup.rotation.set(0, 0, 0);
      g.rotation.z = 0;
      if (name === 'hi') {
        armR.rotation.z = Math.PI - 0.25;         // one flat hand raised: hello
        headGroup.rotation.z = 0.12;
      } else if (name === 'spin') {
        armL.rotation.z = -Math.PI / 2 + 0.2;     // a wooden ballerina, stopped
        armR.rotation.z = Math.PI / 2 - 0.2;
        legR.rotation.x = -0.9;
        g.rotation.z = 0.06;
        headGroup.rotation.y = 0.7;
      } else if (name === 'smear') {
        g.rotation.z = 0.0;
        armL.rotation.x = -1.1;                   // both hands at the face
        armR.rotation.x = -1.15;
        armL.rotation.z = -0.25; armR.rotation.z = 0.25;
        headGroup.rotation.x = 0.35;
      } else if (name === 'menace') {
        armR.rotation.x = -Math.PI + 0.4;         // hand high, about to spear
        headGroup.rotation.x = -0.15;
      }
    }

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
    var menaceCam = -1;
    var watched = false;
    var ventsOpen = false;

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

    function canSee(px, pz) {
      var dx = px - pos.x, dz = pz - pos.z;
      var dist = Math.hypot(dx, dz);
      // it can smell you this close — but not through tungsten
      if (dist < SENSE_RANGE) return losClear(pos.x, pos.z, px, pz);
      if (dist > SIGHT_RANGE) return false;
      var ang = Math.atan2(-dx, -dz);
      var diff = Math.atan2(Math.sin(ang - facing), Math.cos(ang - facing));
      if (Math.abs(diff) > FOV) return false;
      return losClear(pos.x, pos.z, px, pz);
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

    function beginRage() {
      mode = 'rage';
      rageT = 75;
      drawFace('sharpie');
      setPose('walk');
      if (api.onRage) api.onRage();
    }

    var api = {
      group: g,
      onCaught: null, onDoorSlam: null, onStep: null, onSpotted: null,
      onLurk: null, onRage: null, onBang: null, onWindup: null,
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
      hitShot: function (stagger) {
        if (mode === 'dormant' || mode === 'destroyed') return false;
        hits++;
        staggerT = Math.max(staggerT, stagger || 1.1);
        if (mode === 'lurk' || mode === 'roam' || mode === 'menace') { mode = 'chase'; lastSeen = 0; setPose('walk'); }
        if (hits === 6 && rageT <= 0) beginRage();
        return true;
      },
      // the riot shield turns its own attacks against it
      breakArm: function () {
        if (armsLeft <= 0) return false;
        armsLeft--;
        var which = armsLeft === 1 ? armR : armL;
        which.visible = false;
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
      onVentMove: null,
      los: function (x1, z1, x2, z2) { return losClear(x1, z1, x2, z2); },
      setLurkScale: function (s) { lurkScale = s; },

      update: function (dt, px, pz) {
        if (mode === 'dormant' || mode === 'destroyed') return;

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

        if (mode === 'lurk') {
          // it moves only when nobody is looking at it
          lurkT -= dt;
          if (!watched && lurkT <= 0) beginRoam();
          if (canSee(px, pz) && dist < 7 && !watched) { mode = 'chase'; lastSeen = 0; setPose('walk'); }
          g.position.set(pos.x, 0, pos.z);
          return;
        }

        var moving = false;
        var speed = 0, tx = pos.x, tz = pos.z;

        if (mode === 'chase' || mode === 'rage') {
          if (mode === 'rage') {
            rageT -= dt;
            if (rageT <= 0) { drawFace(bloodied ? 'none' : 'none'); beginLurk(); return; }
            speed = RAGE_SPEED; tx = px; tz = pz;      // rage always knows
            moving = true;
          } else {
            if (canSee(px, pz)) lastSeen = 0; else lastSeen += dt;
            if (lastSeen > LOSE_AFTER) { beginLurk(); return; }
            speed = CHASE_SPEED; tx = px; tz = pz;
            moving = true;
          }
        } else if (mode === 'roam') {
          // pinned by a look, exactly like the lurk
          if (watched) { g.position.set(pos.x, 0, pos.z); return; }
          if (canSee(px, pz)) {
            mode = 'chase'; lastSeen = 0;
            if (!spottedOnce) { spottedOnce = true; if (api.onSpotted) api.onSpotted(true); }
            else if (api.onSpotted) api.onSpotted(false);
            return;
          }
          speed = ROAM_SPEED;
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
          // a sealed shutter in its path stops it dead
          if (roamTarget.hunt) {
            var sealHit = api.isSealActive('sealWest') && Math.abs(pos.x + 8) < 2.2 && Math.abs(pos.z) < 2.5 ? 'sealWest'
              : api.isSealActive('sealEast') && Math.abs(pos.x - 8) < 2.2 && Math.abs(pos.z) < 2.5 ? 'sealEast' : null;
            if (sealHit) {
              mode = 'banging';
              bangT = 9;
              if (api.onBang) api.onBang(dist);
              return;
            }
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
        walkT += dt * (mode === 'rage' ? 9 : mode === 'chase' ? 7 : 4.2);
        var wallCrawl = mode === 'rage' && isInCorridor(pos.x, pos.z);
        if (wallCrawl) {
          // in its rage it takes to the walls
          g.position.set(pos.x, 1.1 + Math.sin(walkT * 0.7) * 0.2, pos.z);
          g.rotation.z = 0.9;
        } else {
          g.rotation.z = 0;
          g.position.set(pos.x, Math.abs(Math.sin(walkT)) * 0.05, pos.z);
        }
        g.rotation.y = facing;
        if (moving) {
          legL.rotation.x = Math.sin(walkT) * 0.5;
          legR.rotation.x = -Math.sin(walkT) * 0.5;
          if (armsLeft > 0) armL.rotation.x = -Math.sin(walkT) * 0.3;
          if (armsLeft > 1) armR.rotation.x = Math.sin(walkT) * 0.3;
          if (mode === 'chase' && armsLeft > 1) armR.rotation.x = -2.4;  // hand already up
        }
        if (mode === 'rage') {
          headGroup.rotation.y += dt * 5;          // the head goes all the way around
        } else if (mode === 'chase') {
          headGroup.rotation.y = 0;
        } else {
          headGroup.rotation.y = Math.sin(walkT * 0.2) * 0.6;
        }
        if (armsLeft === 0 && headOn) {
          // nothing left but the desperate lean
          g.rotation.x = 0.28;
        }
      },

      getState: function () {
        return {
          mode: mode, x: pos.x, z: pos.z, hits: hits, facing: facing,
          lurk: mode === 'lurk' ? LURKS[lurkIndex].id : null,
          bloodied: bloodied, armsLeft: armsLeft, headOn: headOn,
          raging: rageT > 0, watched: watched
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

    var stepClock = 0;
    function stepAccumulate(dt, speed, dist) {
      stepClock += speed * dt;
      var stride = mode === 'rage' ? 1.2 : mode === 'chase' ? 1.35 : 1.75;
      if (stepClock > stride) {
        stepClock = 0;
        if (api.onStep) api.onStep(dist, mode === 'chase' || mode === 'rage');
      }
    }

    function isInCorridor(x, z) {
      var r = level.roomAt(x, z);
      return r && (r.id === 'hallL' || r.id === 'hallR' || r.id === 'hallS' || r.id === 'hallE');
    }

    return api;
  };
})();
