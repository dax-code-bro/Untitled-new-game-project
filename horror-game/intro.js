/*
 * THE BIRCH — the arrival.
 *
 * Not a delivery. An armored jeep pulls up outside the facility at night,
 * two men in black suits drag you out and force the doors, and you're
 * thrown inside before you can get your feet under you. The interior half
 * of the opening (the lock turning, coming to on the floor, the door that
 * won't give) is scripted in game.js; this file is only the exterior shot.
 *
 *   window.buildIntro(THREE, renderer, audio) → { start(onDone), skip(), render(dt), active }
 */
(function () {
  'use strict';

  window.buildIntro = function buildIntro(THREE, renderer, audioHooks) {
    var T = window.TEX;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040507);
    scene.fog = new THREE.FogExp2(0x040507, 0.03);

    var camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(6.8, 1.7, 13.5);
    camera.lookAt(-2, 1.3, 4);

    // ---------------- the lot ----------------
    var asphalt = new THREE.Mesh(new THREE.PlaneGeometry(120, 80),
      new THREE.MeshStandardMaterial({ map: T.concrete(THREE, 512, 52, { speckle: 3200, grime: 12, repeat: [10, 7] }), color: 0x5c6063, roughness: 0.95 }));
    asphalt.rotation.x = -Math.PI / 2;
    scene.add(asphalt);

    // ---------------- the facade ----------------
    var wallMat = new THREE.MeshStandardMaterial({ map: T.concrete(THREE, 512, 118, { formwork: true, repeat: [6, 2] }), color: 0x8b9194, roughness: 0.95 });
    var wall = new THREE.Mesh(new THREE.BoxGeometry(46, 7, 0.6), wallMat);
    wall.position.set(0, 3.5, 0);
    scene.add(wall);
    // door frame + two glass leaves
    var frameMat = new THREE.MeshStandardMaterial({ color: 0x2c3134, roughness: 0.6, metalness: 0.4 });
    [-1.7, 0, 1.7].forEach(function (x) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.2), frameMat);
      p.position.set(x, 1.25, 0.35);
      scene.add(p);
    });
    var glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c0c4, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.5 });
    var doorL = new THREE.Group(); doorL.position.set(-1.7, 0, 0.35);
    var leafL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.06), glassMat);
    leafL.position.set(0.8, 1.2, 0);
    doorL.add(leafL); scene.add(doorL);
    var doorR = new THREE.Group(); doorR.position.set(1.7, 0, 0.35);
    var leafR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.06), glassMat);
    leafR.position.set(-0.8, 1.2, 0);
    doorR.add(leafR); scene.add(doorR);
    // warm light spilling from inside
    var spill = new THREE.PointLight(0xffe3c0, 7, 14, 2);
    spill.position.set(0, 2, 1.4);
    scene.add(spill);
    // a tired exterior lamp over the doors
    var lamp = new THREE.PointLight(0xdfe8ea, 11, 20, 2);
    lamp.position.set(0, 4.6, 1.2);
    scene.add(lamp);
    var lampFix = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf0f2ee, emissive: 0xdfe8ea, emissiveIntensity: 1.4 }));
    lampFix.position.set(0, 4.7, 0.5);
    scene.add(lampFix);
    scene.add(new THREE.HemisphereLight(0x2a3a4c, 0x07090c, 1.4));
    var moon = new THREE.DirectionalLight(0x8fa3c0, 0.5);
    moon.position.set(-20, 30, 25);
    scene.add(moon);

    // ---------------- the neighborhood, emptied ----------------
    // The nearest occupied house isn't nearby anymore. A mile of exclusion
    // zone starts somewhere past these dark shapes.
    var houseMat = new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.95 });
    var houseDark = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.9 });
    [[-30, 46, 5.5, 1], [-42, 60, 4.6, -0.4], [34, 52, 5.0, 0.6], [46, 68, 6.0, -0.7]].forEach(function (h) {
      var house = new THREE.Mesh(new THREE.BoxGeometry(7, h[2], 8), houseMat);
      house.position.set(h[0], h[2] / 2, h[1]);
      house.rotation.y = h[3];
      scene.add(house);
      var roof = new THREE.Mesh(new THREE.ConeGeometry(6, 1.6, 4), houseDark);
      roof.position.set(h[0], h[2] + 0.6, h[1]);
      roof.rotation.y = Math.PI / 4 + h[3];
      scene.add(roof);
    });

    // A warning post at the edge of the lot — nobody reads it anymore,
    // nobody has to. The zone keeps itself now.
    var postMat = new THREE.MeshStandardMaterial({ color: 0x2a2d2f, roughness: 0.7, metalness: 0.4 });
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 8), postMat);
    post.position.set(-13, 1.2, 9);
    scene.add(post);
    var warnTex = T.sign(THREE, 'EXCLUSION ZONE\n1 MILE — DO NOT ENTER', { bg: '#2b1210', fg: '#e2b9a8', border: 'rgba(226,120,90,0.5)', fontSize: 20 });
    var warnSign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75),
      new THREE.MeshStandardMaterial({ map: warnTex, roughness: 0.7 }));
    warnSign.position.set(-13, 2.1, 8.96);
    warnSign.rotation.y = 0.5;
    scene.add(warnSign);
    // a strip of hazard tape, half torn down, still hanging there
    var tape = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.22),
      new THREE.MeshStandardMaterial({ map: T.hazard(THREE, 64), roughness: 0.8, side: THREE.DoubleSide }));
    tape.position.set(-9.5, 0.9, 10.4);
    tape.rotation.y = 0.42;
    tape.rotation.z = 0.06;
    scene.add(tape);

    // ---------------- the jeep ----------------
    // No markings, no plates lit. Whoever sent it didn't want it remembered.
    var jeep = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ map: T.metal(THREE, 512, 90, { rust: 1 }), color: 0x1c1f20, roughness: 0.55, metalness: 0.35 });
    var glassDark = new THREE.MeshStandardMaterial({ color: 0x0a0d0f, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.85 });
    var hull = new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.5, 2.0), bodyMat);
    hull.position.set(0, 1.05, 0);
    jeep.add(hull);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 1.94), bodyMat);
    cabin.position.set(0.15, 1.9, 0);
    jeep.add(cabin);
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.8), glassDark);
    windshield.position.set(1.18, 1.9, 0);
    jeep.add(windshield);
    [-0.8, 0.8].forEach(function (wz) {
      var win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.05), glassDark);
      win.position.set(0.1, 1.9, wz * 0.97);
      jeep.add(win);
    });
    var bull = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x101315, roughness: 0.3, metalness: 0.65 }));
    bull.position.set(2.28, 1.0, 0);
    jeep.add(bull);
    var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 5), postMat);
    antenna.position.set(-0.6, 3.05, 0.7);
    antenna.rotation.z = -0.12;
    jeep.add(antenna);
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.9 });
    [[1.35, 1], [1.35, -1], [-1.35, 1], [-1.35, -1]].forEach(function (w) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14), wheelMat);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(w[0], 0.42, w[1] * 1.05);
      jeep.add(wh);
    });
    var head1 = new THREE.SpotLight(0xd8e4ff, 55, 40, 0.4, 0.5, 1.6);
    head1.position.set(2.3, 0.75, 0.6);
    var head1T = new THREE.Object3D(); head1T.position.set(20, 0.4, 0.6);
    jeep.add(head1T); head1.target = head1T; jeep.add(head1);
    var head2 = head1.clone();
    head2.position.z = -0.6;
    var head2T = new THREE.Object3D(); head2T.position.set(20, 0.4, -0.6);
    jeep.add(head2T); head2.target = head2T; jeep.add(head2);
    [1, -1].forEach(function (sz) {
      var tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x400a08, emissive: 0xc23020, emissiveIntensity: 1.4 }));
      tail.position.set(-2.16, 1.0, sz * 0.8);
      jeep.add(tail);
    });
    // it arrives fast, and it stops hard
    jeep.rotation.y = Math.PI / 2 + 0.1;
    jeep.position.set(-2.2, 0, 36);
    scene.add(jeep);

    // ---------------- the escort ----------------
    // Two suits, no names given, no names asked for. They know exactly what
    // this place is, and they leave the second the doors are shut.
    var suitMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.6 });
    var suitSkin = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85 });
    function buildSuit() {
      var g = new THREE.Group();
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), suitMat);
      torso.position.y = 1.32;
      g.add(torso);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), suitSkin);
      head.position.y = 1.74;
      g.add(head);
      [-1, 1].forEach(function (side) {
        var arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.15), suitMat);
        arm.position.set(side * 0.29, 1.32, 0);
        g.add(arm);
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.86, 0.19), suitMat);
        leg.position.set(side * 0.12, 0.43, 0);
        g.add(leg);
      });
      return g;
    }
    var suitL = buildSuit();
    var suitR = buildSuit();
    scene.add(suitL, suitR);

    // ---------------- timeline ----------------
    var active = false, t = 0, onDoneCb = null;
    var A = audioHooks || {};

    function start(onDone) {
      active = true; t = 0; onDoneCb = onDone;
      if (A.engine) A.engine(true);
    }
    function finish() {
      if (!active) return;
      active = false;
      if (A.engine) A.engine(false);
      if (onDoneCb) { var cb = onDoneCb; onDoneCb = null; cb(); }
    }

    // Camera path, hand-placed rather than physically simulated: it only
    // has to read as dragged, not survive frame-by-frame scrutiny.
    var camStart = new THREE.Vector3(6.8, 1.7, 13.5);
    var camDoor = new THREE.Vector3(0.4, 1.55, 2.2);
    var camThrow = new THREE.Vector3(0.1, 0.55, -1.2);

    return {
      get active() { return active; },
      start: start,
      skip: finish,
      onResize: function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      },
      render: function (dt) {
        if (!active) return;
        t += dt;

        // 0–3.6s: the jeep comes in hard and stops hard — this was never a delivery
        var drive = Math.min(1, t / 3.6);
        var eased = 1 - Math.pow(1 - drive, 2.8);
        jeep.position.z = 36 - eased * 29.5;
        jeep.position.x = -2.2 - eased * 0.8;
        if (drive >= 1 && A.brakes && !this._hissed) { this._hissed = true; A.brakes(); }
        jeep.position.y = Math.sin(t * 34) * 0.01 * (drive < 1 ? 1 : 0.4);

        // 3.6–4.4s: the doors, then you, come out of it
        if (t > 3.6) {
          var out = Math.min(1, (t - 3.6) / 0.8);
          var oe = out * out * (3 - 2 * out);
          suitL.position.set(-3.4 - oe * 1.6, 0, 6.9 - oe * 2.6);
          suitR.position.set(-1.0 + oe * 1.6, 0, 6.9 - oe * 2.6);
          suitL.rotation.y = suitR.rotation.y = Math.PI * 0.15;
        }

        // 4.4–5.8s: dragged across the lot, on your feet but not steady
        if (t > 4.4) {
          var walk = Math.min(1, (t - 4.4) / 1.4);
          var we = walk * walk * (3 - 2 * walk);
          var pos = camStart.clone().lerp(camDoor, we);
          var wob = Math.sin(t * 9) * 0.05 * we + Math.sin(t * 3.3) * 0.03;
          camera.position.set(pos.x, pos.y - Math.abs(Math.sin(t * 6)) * 0.05 * we, pos.z);
          suitL.position.lerpVectors(new THREE.Vector3(-3.4, 0, 4.3), new THREE.Vector3(-0.9, 0, 2.3), we);
          suitR.position.lerpVectors(new THREE.Vector3(-1.0, 0, 4.3), new THREE.Vector3(1.1, 0, 2.3), we);
          camera.lookAt(pos.x + wob, 1.2, pos.z - 3);
        }

        // 5.4s: the doors do not get opened. They get forced.
        if (t > 5.4) {
          var burst = Math.min(1, (t - 5.4) / 0.28);
          var be = 1 - Math.pow(1 - burst, 3);
          doorL.rotation.y = -be * 1.9;
          doorR.rotation.y = be * 1.9;
          if (!this._burst) { this._burst = true; if (A.bash) A.bash(); }
        }

        // 5.8–6.9s: through the doorway, low and fast, no footing under you
        if (t > 5.8) {
          var drag = Math.min(1, (t - 5.8) / 1.1);
          var de = drag * drag;
          var pos2 = camDoor.clone().lerp(camThrow, Math.min(1, de * 1.3));
          var shake = Math.sin(t * 22) * 0.06 * drag;
          camera.position.set(pos2.x + shake, pos2.y, pos2.z);
          camera.lookAt(0.2, pos2.y - 0.3 - drag * 0.6, pos2.z - 1.4);
        }

        // 6.9s: thrown — the last half-second is a fall, then nothing
        if (t > 6.9) { finish(); return; }
        renderer.render(scene, camera);
      }
    };
  };
})();
