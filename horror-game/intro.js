/*
 * THE BIRCH — the arrival.
 *
 * A box truck pulls up to the facility at night, the glass doors open,
 * and the player goes in. The interior half of the opening (the slam,
 * the banging, the realisation) is scripted in game.js; this file is
 * only the exterior shot.
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

    // ---------------- the truck ----------------
    var truck = new THREE.Group();
    var boxMat = new THREE.MeshStandardMaterial({ map: T.metal(THREE, 512, 150, { rust: 5 }), color: 0xb8bcbd, roughness: 0.6, metalness: 0.25 });
    var cabMat = new THREE.MeshStandardMaterial({ color: 0x3f5a70, roughness: 0.5, metalness: 0.3 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.1, 2.5), boxMat);
    body.position.set(-1.4, 2.05, 0);
    truck.add(body);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 2.4), cabMat);
    cab.position.set(3.5, 1.45, 0);
    truck.add(cab);
    var shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.2, metalness: 0.6 }));
    shield.position.set(4.72, 1.8, 0);
    truck.add(shield);
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.9 });
    [[3.6, 1], [3.6, -1], [-0.2, 1], [-0.2, -1], [-2.8, 1], [-2.8, -1]].forEach(function (w) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 14), wheelMat);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(w[0], 0.55, w[1] * 1.15);
      truck.add(wh);
    });
    var head1 = new THREE.SpotLight(0xfff2cc, 60, 40, 0.4, 0.5, 1.6);
    head1.position.set(4.8, 1.1, 0.75);
    var head1T = new THREE.Object3D(); head1T.position.set(20, 0.6, 0.75);
    truck.add(head1T); head1.target = head1T; truck.add(head1);
    var head2 = head1.clone();
    head2.position.z = -0.75;
    var head2T = new THREE.Object3D(); head2T.position.set(20, 0.6, -0.75);
    truck.add(head2T); head2.target = head2T; truck.add(head2);
    [1, -1].forEach(function (sz) {
      var tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x400a08, emissive: 0xc23020, emissiveIntensity: 1.4 }));
      tail.position.set(-5.02, 1.1, sz * 0.9);
      truck.add(tail);
    });
    // it arrives from the dark, heading for the doors
    truck.rotation.y = Math.PI / 2 + 0.1;
    truck.position.set(-2.2, 0, 36);
    scene.add(truck);

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
        // 0–5.2s: the truck rolls in and stops at the doors
        var drive = Math.min(1, t / 5.2);
        var eased = 1 - Math.pow(1 - drive, 2.4);
        truck.position.z = 36 - eased * 29.5;
        truck.position.x = -2.2 - eased * 0.8;
        if (drive >= 1 && A.brakes && !this._hissed) { this._hissed = true; A.brakes(); }
        // idle shake
        truck.position.y = Math.sin(t * 30) * 0.012 * (drive < 1 ? 1 : 0.5);
        // 5.9–7.2s: the glass doors swing open for you
        if (t > 5.9) {
          var open = Math.min(1, (t - 5.9) / 1.3);
          var oe = 1 - Math.pow(1 - open, 3);
          doorL.rotation.y = -oe * 1.5;
          doorR.rotation.y = oe * 1.5;
          if (!this._creaked && A.creak) { this._creaked = true; A.creak(); }
        }
        // 6.4s→: the camera walks to the doorway
        if (t > 6.4) {
          var walk = Math.min(1, (t - 6.4) / 2.6);
          var we = walk * walk * (3 - 2 * walk);
          camera.position.set(6.8 - we * 6.6, 1.7 + Math.sin(t * 7) * 0.02 * we, 13.5 - we * 11.7);
          camera.lookAt(0, 1.5, 0.5);
        }
        // and it's over
        if (t > 9.3) { finish(); return; }
        renderer.render(scene, camera);
      }
    };
  };
})();
