/*
 * Untitled Horror Game — the thing from the blueprint.
 *
 * Eleven feet. Tungsten frame, non-oxidising steel joints, the rest
 * birchwood. The extermination chamber is full of the people who tried
 * to switch it off, so gunfire staggers it; nothing kills it.
 *
 * Dormant until the player takes Nick's gun. Then it walks the building:
 * a fixed patrol along the corridor spines, slamming doors open as it
 * comes to them, breaking into a chase when it has line of sight.
 *
 *   window.buildEntity(THREE, { scene, level }) → api
 */
(function () {
  'use strict';

  var HEIGHT = 3.35;          // 11 ft
  var RADIUS = 0.55;
  var EYE_Y = 3.0;
  var PATROL_SPEED = 1.9;
  var CHASE_SPEED = 3.3;
  var SIGHT_RANGE = 16;
  var SENSE_RANGE = 3;        // it feels you this close, eyes or none
  var FOV = Math.PI * 0.42;   // ~75° either side
  var LOSE_AFTER = 5;         // seconds without sight before it gives up
  var CATCH_DIST = 1.15;

  // The route it walks: warehouse → west corridor → Waiting → east
  // corridor → junction → the length of the south corridor, and back.
  var PATROL = [
    [-56, 2.2], [-50, 0], [-30, 0], [-10, 0], [0, 0.9],
    [10, 0], [30, 0], [44, 0], [49.5, 0], [49.5, 10],
    [49.5, 30], [49.5, 43]
  ];

  window.buildEntity = function buildEntity(THREE, ctx) {
    var scene = ctx.scene, level = ctx.level;
    var T = window.TEX;

    // ---------------- The body ----------------
    var birchTex = T.wood(THREE, 512, [190, 172, 130], { knots: 4, grime: 7 });
    var birch = new THREE.MeshStandardMaterial({
      map: birchTex, bumpMap: birchTex, bumpScale: 0.18, roughness: 0.82
    });
    var joint = new THREE.MeshStandardMaterial({ color: 0x3c4144, roughness: 0.38, metalness: 0.85 });
    var frame = new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.5, metalness: 0.75 });

    var g = new THREE.Group();

    function limb(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    }
    function ball(r, x, y, z) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), joint);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    }

    // legs — too long, like the drawing
    limb(0.2, 1.5, 0.24, birch, -0.22, 0.78, 0);
    limb(0.2, 1.5, 0.24, birch, 0.22, 0.78, 0);
    ball(0.13, -0.22, 1.56, 0); ball(0.13, 0.22, 1.56, 0);   // hip joints
    ball(0.11, -0.22, 0.82, 0.02); ball(0.11, 0.22, 0.82, 0.02); // knees
    limb(0.24, 0.1, 0.42, birch, -0.22, 0.05, 0.06);         // feet
    limb(0.24, 0.1, 0.42, birch, 0.22, 0.05, 0.06);

    // pelvis and torso, with the chest left unfinished — the frame shows
    limb(0.62, 0.3, 0.34, birch, 0, 1.72, 0);
    var torso = limb(0.7, 1.0, 0.4, birch, 0, 2.32, 0);
    limb(0.34, 0.5, 0.06, frame, 0, 2.36, 0.2);              // open chest panel
    limb(0.05, 0.44, 0.05, joint, -0.09, 2.36, 0.21);        // exposed ribs of tungsten
    limb(0.05, 0.44, 0.05, joint, 0.09, 2.36, 0.21);

    // shoulders and arms — they reach past the knees
    ball(0.15, -0.42, 2.72, 0); ball(0.15, 0.42, 2.72, 0);
    var armL = new THREE.Group(); var armR = new THREE.Group();
    [armL, armR].forEach(function (arm, i) {
      var side = i === 0 ? -1 : 1;
      arm.position.set(side * 0.46, 2.72, 0);
      var upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.18), birch);
      upper.position.y = -0.45;
      arm.add(upper);
      var elbow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), joint);
      elbow.position.y = -0.92;
      arm.add(elbow);
      var fore = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.85, 0.15), birch);
      fore.position.y = -1.36;
      arm.add(fore);
      // the hand: four long fingers, no thumb worth the name
      for (var f = 0; f < 4; f++) {
        var finger = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.3, 0.03), birch);
        finger.position.set(-0.05 + f * 0.033, -1.92, 0);
        arm.add(finger);
      }
      g.add(arm);
    });

    // the head: undersized, featureless, a lathe-turned suggestion of one
    var head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.34, 10), birch);
    head.position.set(0, 3.05, 0);
    g.add(head);
    ball(0.09, 0, 2.85, 0);                                   // neck joint

    g.visible = false;
    scene.add(g);

    // ---------------- Occlusion ----------------
    // Line of sight tests walls and closed doors only. Furniture does not
    // hide you from something eleven feet tall.
    function segmentHitsBox(x1, z1, x2, z2, b) {
      var dx = x2 - x1, dz = z2 - z1;
      var tmin = 0, tmax = 1;
      if (Math.abs(dx) < 1e-9) {
        if (x1 < b.x1 || x1 > b.x2) return false;
      } else {
        var tx1 = (b.x1 - x1) / dx, tx2 = (b.x2 - x1) / dx;
        tmin = Math.max(tmin, Math.min(tx1, tx2));
        tmax = Math.min(tmax, Math.max(tx1, tx2));
      }
      if (Math.abs(dz) < 1e-9) {
        if (z1 < b.z1 || z1 > b.z2) return false;
      } else {
        var tz1 = (b.z1 - z1) / dz, tz2 = (b.z2 - z1) / dz;
        tmin = Math.max(tmin, Math.min(tz1, tz2));
        tmax = Math.min(tmax, Math.max(tz1, tz2));
      }
      return tmax >= tmin;
    }

    function losClear(x1, z1, x2, z2) {
      var walls = level.wallBoxes;
      for (var i = 0; i < walls.length; i++) {
        if (segmentHitsBox(x1, z1, x2, z2, walls[i])) return false;
      }
      var cols = level.colliders;
      for (var j = 0; j < cols.length; j++) {
        var c = cols[j];
        if (!c.id) continue;
        if (level.isDoorOpen(c.id)) continue;
        if (c.id === 'cage') continue;                 // bars, not a wall
        if (segmentHitsBox(x1, z1, x2, z2, c)) return false;
      }
      return true;
    }

    // Movement collides with walls and closed doors; doors it simply
    // slams open. It does not path around furniture — it is the reason
    // the furniture is broken.
    function move(nx, nz) {
      var boxes = level.wallBoxes;
      var r = RADIUS;
      function push(b) {
        if (nx + r < b.x1 || nx - r > b.x2 || nz + r < b.z1 || nz - r > b.z2) return;
        var pxl = (nx + r) - b.x1, pxr = b.x2 - (nx - r);
        var pzt = (nz + r) - b.z1, pzb = b.z2 - (nz - r);
        var mx = Math.min(pxl, pxr), mz = Math.min(pzt, pzb);
        if (mx < mz) nx += (pxl < pxr) ? -mx : mx;
        else nz += (pzt < pzb) ? -mz : mz;
      }
      for (var i = 0; i < boxes.length; i++) push(boxes[i]);
      for (var j = 0; j < level.colliders.length; j++) {
        var c = level.colliders[j];
        if (!c.id || level.isDoorOpen(c.id)) continue;
        if (c.id === 'barricade' || c.id === 'cage') { push(c); continue; }
        // a closed door in its way gets opened, hard
        var cx = Math.max(c.x1, Math.min(nx, c.x2));
        var cz = Math.max(c.z1, Math.min(nz, c.z2));
        if ((nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) < 1.1) {
          level.toggleDoor(c.id);
          if (api.onDoorSlam) api.onDoorSlam(c.id);
        } else {
          push(c);
        }
      }
      return { x: nx, z: nz };
    }

    // ---------------- Brain ----------------
    var mode = 'dormant';       // dormant | patrol | chase
    var pos = { x: PATROL[0][0], z: PATROL[0][1] };
    var facing = 0;
    var wpIndex = 1, wpDir = 1;
    var lastSeen = 0;
    var staggerT = 0;
    var stepAccum = 0;
    var hits = 0;
    var walkT = 0;
    var spottedOnce = false;

    function nearestWaypoint() {
      var best = 0, bd = Infinity;
      for (var i = 0; i < PATROL.length; i++) {
        var d = (PATROL[i][0] - pos.x) * (PATROL[i][0] - pos.x) + (PATROL[i][1] - pos.z) * (PATROL[i][1] - pos.z);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function canSee(px, pz) {
      var dx = px - pos.x, dz = pz - pos.z;
      var dist = Math.hypot(dx, dz);
      if (dist < SENSE_RANGE) return true;
      if (dist > SIGHT_RANGE) return false;
      var ang = Math.atan2(-dx, -dz);
      var diff = Math.atan2(Math.sin(ang - facing), Math.cos(ang - facing));
      if (Math.abs(diff) > FOV) return false;
      return losClear(pos.x, pos.z, px, pz);
    }

    var api = {
      group: g,
      onCaught: null,
      onDoorSlam: null,
      onStep: null,
      onSpotted: null,

      activate: function () {
        if (mode !== 'dormant') return;
        mode = 'patrol';
        pos.x = PATROL[0][0]; pos.z = PATROL[0][1];
        wpIndex = 1; wpDir = 1;
        g.visible = true;
      },
      reset: function () {
        if (mode === 'dormant') return;
        mode = 'patrol';
        pos.x = PATROL[0][0]; pos.z = PATROL[0][1];
        wpIndex = 1; wpDir = 1;
        staggerT = 0;
        g.position.set(pos.x, 0, pos.z);
      },
      hitShot: function () {
        if (mode === 'dormant') return false;
        hits++;
        staggerT = 1.1;
        if (mode === 'patrol') { mode = 'chase'; lastSeen = 0; }
        return true;
      },

      update: function (dt, px, pz) {
        if (mode === 'dormant') return;

        var dx = px - pos.x, dz = pz - pos.z;
        var dist = Math.hypot(dx, dz);

        if (staggerT > 0) {
          staggerT -= dt;
          g.rotation.x = -0.12 * Math.max(0, staggerT);
        } else {
          g.rotation.x = 0;

          var speed, tx, tz;
          if (mode === 'chase') {
            if (canSee(px, pz)) lastSeen = 0; else lastSeen += dt;
            if (lastSeen > LOSE_AFTER) {
              mode = 'patrol';
              wpIndex = nearestWaypoint(); wpDir = 1;
            }
          } else if (canSee(px, pz)) {
            mode = 'chase';
            lastSeen = 0;
            if (!spottedOnce) { spottedOnce = true; if (api.onSpotted) api.onSpotted(true); }
            else if (api.onSpotted) api.onSpotted(false);
          }

          if (mode === 'chase') {
            speed = CHASE_SPEED; tx = px; tz = pz;
          } else {
            speed = PATROL_SPEED;
            var wp = PATROL[wpIndex];
            tx = wp[0]; tz = wp[1];
            if (Math.hypot(tx - pos.x, tz - pos.z) < 0.6) {
              wpIndex += wpDir;
              if (wpIndex >= PATROL.length) { wpIndex = PATROL.length - 2; wpDir = -1; }
              if (wpIndex < 0) { wpIndex = 1; wpDir = 1; }
            }
          }

          var mdx = tx - pos.x, mdz = tz - pos.z;
          var mlen = Math.hypot(mdx, mdz) || 1;
          var want = Math.atan2(-mdx, -mdz);
          var turn = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
          facing += Math.max(-2.6 * dt, Math.min(2.6 * dt, turn));

          var resolved = move(pos.x + (mdx / mlen) * speed * dt, pos.z + (mdz / mlen) * speed * dt);
          pos.x = resolved.x; pos.z = resolved.z;

          // footsteps: the whole building hears wood on concrete
          stepAccum += speed * dt;
          var stride = mode === 'chase' ? 1.35 : 1.75;
          if (stepAccum > stride) {
            stepAccum = 0;
            if (api.onStep) api.onStep(dist, mode === 'chase');
          }

          if (dist < CATCH_DIST && api.onCaught) api.onCaught();
        }

        walkT += dt * (mode === 'chase' ? 8 : 4.4);
        g.position.set(pos.x, Math.sin(walkT) * 0.045, pos.z);
        g.rotation.y = facing;
        armL.rotation.x = Math.sin(walkT * 0.5) * 0.28;
        armR.rotation.x = -Math.sin(walkT * 0.5) * 0.28;
        var breathe = 1 + Math.sin(walkT * 0.23) * 0.01;
        torso.scale.set(breathe, 1, breathe);
        head.rotation.y = Math.sin(walkT * 0.31) * 0.4;
      },

      getState: function () {
        return { mode: mode, x: pos.x, z: pos.z, hits: hits, facing: facing };
      },
      // test hook — place it and set its mind directly
      force: function (x, z, m) {
        pos.x = x; pos.z = z;
        if (m) mode = m;
        if (mode !== 'dormant') g.visible = true;
        g.position.set(pos.x, 0, pos.z);
      }
    };

    return api;
  };
})();
