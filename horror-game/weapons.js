/*
 * Untitled Horror Game — hands, guns, and everything that leaves them.
 *
 * First-person arms and three real weapons:
 *   glock    — Glock 19. Reciprocating slide, box mag reload.
 *   shotgun  — semi-automatic 12 gauge. Tube magazine, shell-by-shell reload,
 *              eight-pellet spread.
 *   ar       — Remington 700. Iron sights, bolt cycled by hand between
 *              shots, so the rate of fire is the animation.
 *
 * Plus the physical consequences: brass ejected out of the port, tracers
 * you can watch fly, impact puffs where they land.
 *
 *   window.buildWeapons(THREE, { camera, viewRoot, scene }) → api
 */
(function () {
  'use strict';

  window.buildWeapons = function buildWeapons(THREE, ctx) {
    var camera = ctx.camera, viewRoot = ctx.viewRoot, scene = ctx.scene;

    var steel = new THREE.MeshStandardMaterial({ color: 0x2c3033, roughness: 0.45, metalness: 0.55 });
    var polymer = new THREE.MeshStandardMaterial({ color: 0x1b1e20, roughness: 0.7, metalness: 0.15 });
    var walnut = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.62 });
    var brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.8 });
    var skin = new THREE.MeshStandardMaterial({ color: 0x9c7b62, roughness: 0.85 });
    // The intern tee is short-sleeved, so what's on the gun is bare forearm
    // with the hem of the sleeve just visible at the top of frame.
    var sleeve = new THREE.MeshStandardMaterial({ color: 0x2f5d96, roughness: 0.94 });

    function box(parent, w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0);
      parent.add(m);
      return m;
    }
    function cyl(parent, rt, rb, h, mat, x, y, z, rx) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10), mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.x = rx === undefined ? Math.PI / 2 : rx;
      parent.add(m);
      return m;
    }

    // ---------------- Arms ----------------
    // A forearm-and-hand that can be posed per weapon. The elbow is off
    // screen; what sells it is the hand actually being on the gun.
    function makeArm() {
      var a = new THREE.Group();
      var fore = box(a, 0.055, 0.055, 0.24, skin, 0, 0, 0.1);
      void fore;
      box(a, 0.062, 0.062, 0.05, sleeve, 0, 0, 0.2);      // sleeve hem
      var hand = box(a, 0.05, 0.075, 0.075, skin, 0, 0.005, -0.045);
      void hand;
      // four block fingers wrapped forward
      for (var f = 0; f < 4; f++) {
        box(a, 0.011, 0.05, 0.02, skin, -0.017 + f * 0.011, -0.005, -0.085);
      }
      var thumb = box(a, 0.012, 0.04, 0.018, skin, 0.028, 0.01, -0.06);
      thumb.rotation.z = -0.5;
      return a;
    }

    // ---------------- The guns ----------------
    var rigs = {};

    function rigGlock() {
      var g = new THREE.Group();
      var slide = new THREE.Group();
      box(slide, 0.052, 0.05, 0.19, steel, 0, 0.012, -0.02);
      box(slide, 0.052, 0.014, 0.03, steel, 0, 0.045, 0.06);       // rear sight block
      box(slide, 0.008, 0.014, 0.008, steel, 0, 0.048, -0.1);      // front post
      g.add(slide);
      box(g, 0.048, 0.05, 0.13, polymer, 0, -0.03, 0.0);            // frame
      var grip = box(g, 0.044, 0.12, 0.062, polymer, 0, -0.1, 0.055);
      grip.rotation.x = 0.28;
      box(g, 0.04, 0.03, 0.05, polymer, 0, -0.045, -0.055);         // trigger guard
      var mag = box(g, 0.036, 0.1, 0.05, steel, 0, -0.1, 0.058);
      mag.rotation.x = 0.28;
      var armR = makeArm();
      armR.position.set(0.015, -0.1, 0.14);
      armR.rotation.x = 0.25;
      var armL = makeArm();
      armL.position.set(-0.045, -0.115, 0.1);
      armL.rotation.set(0.3, 0.5, 0.35);
      g.add(armR); g.add(armL);
      return {
        g: g, slide: slide, mag: mag, armL: armL, armR: armR,
        tip: new THREE.Vector3(0, 0.012, -0.13),
        eject: new THREE.Vector3(0.03, 0.03, -0.02),
        casing: 'pistol'
      };
    }

    function rigShotgun() {
      var g = new THREE.Group();
      var rec = box(g, 0.055, 0.07, 0.2, steel, 0, 0, 0.02);
      void rec;
      cyl(g, 0.016, 0.016, 0.4, steel, 0, 0.012, -0.26);            // barrel
      cyl(g, 0.013, 0.013, 0.34, steel, 0, -0.026, -0.24);          // tube mag
      var forend = box(g, 0.05, 0.05, 0.14, walnut, 0, -0.02, -0.2);
      box(g, 0.012, 0.012, 0.012, brass, 0, 0.032, -0.44);          // bead
      var stock = box(g, 0.05, 0.09, 0.2, walnut, 0, -0.035, 0.19);
      stock.rotation.x = -0.12;
      var armR = makeArm();
      armR.position.set(0.01, -0.1, 0.16);
      armR.rotation.x = 0.3;
      var armL = makeArm();
      armL.position.set(-0.01, -0.075, -0.18);
      armL.rotation.set(0.15, 0.15, 0);
      g.add(armR); g.add(armL);
      return {
        g: g, forend: forend, armL: armL, armR: armR,
        tip: new THREE.Vector3(0, 0.012, -0.47),
        eject: new THREE.Vector3(0.035, 0.02, 0.0),
        casing: 'shell'
      };
    }

    function rigRifle() {
      var g = new THREE.Group();
      // one long walnut stock, receiver set into it — a hunting rifle,
      // not a rig of rails
      var stock = box(g, 0.05, 0.075, 0.24, walnut, 0, -0.03, 0.16);
      stock.rotation.x = -0.1;
      box(g, 0.048, 0.055, 0.3, walnut, 0, -0.035, -0.12);          // forestock
      box(g, 0.05, 0.05, 0.16, steel, 0, 0.012, 0.0);               // receiver
      cyl(g, 0.012, 0.012, 0.52, steel, 0, 0.018, -0.4);            // barrel
      // iron sights: rear notch, front post on a ramp
      box(g, 0.026, 0.018, 0.012, steel, 0, 0.05, 0.03);
      box(g, 0.006, 0.02, 0.008, steel, 0, 0.052, -0.63);
      box(g, 0.02, 0.01, 0.02, steel, 0, 0.042, -0.63);
      var boltArm = new THREE.Group();
      boltArm.position.set(0.03, 0.02, 0.05);
      cyl(boltArm, 0.008, 0.008, 0.05, steel, 0.02, 0, 0, Math.PI / 2 - 0.2);
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), steel);
      knob.position.set(0.042, -0.012, 0);
      boltArm.add(knob);
      g.add(boltArm);
      var armR = makeArm();
      armR.position.set(0.012, -0.1, 0.2);
      armR.rotation.x = 0.32;
      var armL = makeArm();
      armL.position.set(-0.012, -0.085, -0.22);
      armL.rotation.set(0.18, 0.1, 0);
      g.add(armR); g.add(armL);
      return {
        g: g, bolt: boltArm, armL: armL, armR: armR,
        tip: new THREE.Vector3(0, 0.018, -0.66),
        eject: new THREE.Vector3(0.03, 0.04, 0.04),
        casing: 'rifle'
      };
    }

    // A camera you can see is a camera: bevelled housing, a sunshade over
    // the lens, a glass front, the IR ring, a status LED and the pigtail
    // lead hanging off the back. It used to be a box with a stub on it.
    function rigCamera() {
      var g = new THREE.Group();
      var body = box(g, 0.095, 0.075, 0.15, polymer, 0, 0, 0);
      void body;
      box(g, 0.099, 0.02, 0.152, steel, 0, 0.03, 0);           // top rib
      box(g, 0.101, 0.055, 0.03, steel, 0, -0.005, 0.062);      // back plate
      // sunshade hood over the lens
      box(g, 0.098, 0.012, 0.06, polymer, 0, 0.036, -0.055);
      box(g, 0.012, 0.05, 0.06, polymer, 0.045, 0.012, -0.055);
      box(g, 0.012, 0.05, 0.06, polymer, -0.045, 0.012, -0.055);
      // the lens barrel, its glass, and the ring of IR emitters
      cyl(g, 0.028, 0.031, 0.045, steel, 0, 0, -0.09);
      var glass = cyl(g, 0.024, 0.024, 0.004, new THREE.MeshStandardMaterial({
        color: 0x0a1116, roughness: 0.08, metalness: 0.6,
        emissive: 0x0d2430, emissiveIntensity: 0.5
      }), 0, 0, -0.113);
      void glass;
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2;
        cyl(g, 0.0035, 0.0035, 0.004, new THREE.MeshStandardMaterial({
          color: 0x3a1010, emissive: 0x5c1414, emissiveIntensity: 0.8, roughness: 0.4
        }), Math.cos(a) * 0.036, Math.sin(a) * 0.036, -0.108);
      }
      // status LED and the lead out of the back
      cyl(g, 0.004, 0.004, 0.004, new THREE.MeshStandardMaterial({
        color: 0x123, emissive: 0x2ad07a, emissiveIntensity: 2.2, roughness: 0.3
      }), 0.031, 0.021, -0.072);
      cyl(g, 0.008, 0.008, 0.05, polymer, 0, -0.012, 0.09);
      cyl(g, 0.006, 0.006, 0.07, new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }),
        0, -0.03, 0.125, Math.PI / 2.4);
      // the mount foot it bolts down on
      box(g, 0.05, 0.014, 0.05, steel, 0, -0.043, 0.01);
      var armR = makeArm();
      armR.position.set(0.03, -0.1, 0.09);
      armR.rotation.x = 0.3;
      g.add(armR);
      return { g: g, tip: null };
    }

    // ---------------- The things you carry ----------------
    // Everything holdable gets a model in hand, not just the guns.
    var tinMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.34, metalness: 0.75 });
    var labelBeans = new THREE.MeshStandardMaterial({ color: 0x9d3123, roughness: 0.85 });
    var plasticClear = new THREE.MeshStandardMaterial({
      color: 0xcfe3ec, roughness: 0.12, metalness: 0.05,
      transparent: true, opacity: 0.42
    });
    var waterMat = new THREE.MeshStandardMaterial({
      color: 0x5f9fb8, roughness: 0.1, transparent: true, opacity: 0.72
    });
    var capMat = new THREE.MeshStandardMaterial({ color: 0x2b6fa8, roughness: 0.5 });

    // A dented tin, held up near the mouth the way you hold a can you are
    // about to eat cold, with the lid peeled half back.
    function rigBeans() {
      var g = new THREE.Group();
      var tin = cyl(g, 0.038, 0.038, 0.105, tinMat, 0, 0, 0, 0);
      void tin;
      cyl(g, 0.0395, 0.0395, 0.062, labelBeans, 0, 0, 0, 0);
      cyl(g, 0.0405, 0.0405, 0.006, tinMat, 0, 0.049, 0, 0);     // rolled rim
      cyl(g, 0.0405, 0.0405, 0.006, tinMat, 0, -0.049, 0, 0);
      // the lid, peeled back and still attached
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.003, 14, 1, false, 0, Math.PI * 1.2), tinMat);
      lid.position.set(0.01, 0.056, 0.012);
      lid.rotation.set(-0.9, 0.4, 0);
      g.add(lid);
      // what is in it
      cyl(g, 0.034, 0.034, 0.012, new THREE.MeshStandardMaterial({ color: 0x6d4326, roughness: 0.95 }), 0, 0.046, 0, 0);
      g.position.set(0, 0, 0);
      var armR = makeArm();
      armR.position.set(0.035, -0.11, 0.1);
      armR.rotation.x = 0.42;
      armR.rotation.z = -0.2;
      g.add(armR);
      return { g: g, tip: null };
    }

    // A scuffed half-litre bottle, label long gone.
    function rigWater() {
      var g = new THREE.Group();
      cyl(g, 0.032, 0.034, 0.15, plasticClear, 0, 0, 0, 0);
      cyl(g, 0.029, 0.031, 0.115, waterMat, 0, -0.012, 0, 0);   // what is left in it
      cyl(g, 0.017, 0.03, 0.035, plasticClear, 0, 0.09, 0, 0);  // shoulder
      cyl(g, 0.014, 0.014, 0.022, plasticClear, 0, 0.116, 0, 0); // neck
      cyl(g, 0.017, 0.017, 0.016, capMat, 0, 0.133, 0, 0);      // cap
      for (var r = 0; r < 3; r++) {
        cyl(g, 0.0345, 0.0345, 0.004, plasticClear, 0, -0.04 + r * 0.035, 0, 0);
      }
      var armR = makeArm();
      armR.position.set(0.034, -0.13, 0.1);
      armR.rotation.x = 0.4;
      armR.rotation.z = -0.18;
      g.add(armR);
      return { g: g, tip: null };
    }

    // GAMER ENERGY: a tall slab-sided can, far too pleased with itself.
    function rigFuel() {
      var g = new THREE.Group();
      var can = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.3, metalness: 0.7 });
      var flash = new THREE.MeshStandardMaterial({
        color: 0x8ce03a, roughness: 0.4, emissive: 0x397a12, emissiveIntensity: 0.45
      });
      cyl(g, 0.031, 0.031, 0.17, can, 0, 0, 0, 0);
      cyl(g, 0.0315, 0.0315, 0.05, flash, 0, 0.005, 0, 0);
      cyl(g, 0.0325, 0.0325, 0.005, tinMat, 0, 0.083, 0, 0);
      cyl(g, 0.0325, 0.0325, 0.005, tinMat, 0, -0.083, 0, 0);
      cyl(g, 0.026, 0.03, 0.012, tinMat, 0, 0.09, 0, 0);
      box(g, 0.016, 0.003, 0.01, tinMat, 0.006, 0.098, 0);       // the tab
      var armR = makeArm();
      armR.position.set(0.033, -0.14, 0.1);
      armR.rotation.x = 0.4;
      armR.rotation.z = -0.18;
      g.add(armR);
      return { g: g, tip: null };
    }

    // The riot helmet, carried under one arm before you put it on.
    function rigRiot() {
      var g = new THREE.Group();
      var shellMat = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.42, metalness: 0.2 });
      var shell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), shellMat);
      shell.position.set(0, 0.01, 0);
      g.add(shell);
      box(g, 0.2, 0.028, 0.02, shellMat, 0, -0.055, -0.086);       // brow
      var visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.112, 16, 10, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.32, Math.PI * 0.36),
        new THREE.MeshStandardMaterial({
          color: 0x9fb4bd, roughness: 0.06, metalness: 0.25,
          transparent: true, opacity: 0.4, side: THREE.DoubleSide
        }));
      visor.position.set(0, 0.01, 0);
      g.add(visor);
      box(g, 0.075, 0.05, 0.045, shellMat, 0, -0.07, 0.075);        // nape
      var armR = makeArm();
      armR.position.set(0.06, -0.13, 0.11);
      armR.rotation.x = 0.5;
      armR.rotation.z = -0.3;
      g.add(armR);
      return { g: g, tip: null };
    }

    // The torch, held low and forward the way you carry one you are
    // actually using. The beam itself lives on the camera, not here.
    function rigFlashlight() {
      var g = new THREE.Group();
      var barrel = cyl(g, 0.021, 0.019, 0.16, polymer, 0, 0, -0.02, Math.PI / 2);
      void barrel;
      for (var k = 0; k < 3; k++) cyl(g, 0.0225, 0.0225, 0.008, steel, 0, 0, 0.01 - k * 0.022, Math.PI / 2);
      cyl(g, 0.029, 0.022, 0.05, steel, 0, 0, -0.12, Math.PI / 2);
      var lens = cyl(g, 0.024, 0.024, 0.006, new THREE.MeshStandardMaterial({
        color: 0xdcecff, emissive: 0xcfe2f5, emissiveIntensity: 1.4, roughness: 0.1
      }), 0, 0, -0.147, Math.PI / 2);
      var armR = makeArm();
      armR.position.set(0.018, -0.085, 0.1);
      armR.rotation.x = 0.28;
      g.add(armR);
      return { g: g, tip: null, lens: lens };
    }

    rigs.glock = rigGlock();
    rigs.shotgun = rigShotgun();
    rigs.ar = rigRifle();
    rigs.camera = rigCamera();
    rigs.flashlight = rigFlashlight();
    rigs.beans = rigBeans();
    rigs.water = rigWater();
    rigs.fuel = rigFuel();
    rigs.riot = rigRiot();
    // The view root is placed for a rifle held at the hip. Something small
    // held up in one hand wants to be higher and nearer the middle, or the
    // bottom half of it is off the edge of the screen.
    rigs.beans.g.position.set(-0.05, 0.1, 0.08);
    rigs.water.g.position.set(-0.05, 0.11, 0.08);
    rigs.fuel.g.position.set(-0.05, 0.12, 0.08);
    rigs.riot.g.position.set(-0.04, 0.05, 0.06);
    rigs.camera.g.position.set(-0.03, 0.07, 0.04);
    Object.keys(rigs).forEach(function (k) {
      rigs[k].g.visible = false;
      viewRoot.add(rigs[k].g);
    });

    // ---------------- The riot helmet, from the inside ----------------
    // Not a filter over the screen — an actual visor bolted to your head.
    // It sits rigid to the camera rather than in the weapon root, because a
    // helmet does not sway when you swing a gun about: the world moves
    // behind it and it does not move at all. Which is the whole point.
    var visor = (function buildVisor() {
      // One panel, right in front of the eyes, carrying the whole helmet:
      // a soft aperture that darkens towards the edges, the tint and haze
      // of scratched polycarbonate across the middle, and a reflection.
      // Built as a texture rather than as geometry because a visor edge is
      // a soft curve, and plates in 3D give you hard black rectangles.
      var S = 512;
      var c = document.createElement('canvas');
      c.width = c.height = S;
      var x = c.getContext('2d');

      // --- the shell, crowding in from every edge ---
      x.fillStyle = 'rgba(6,7,8,0.985)';
      x.fillRect(0, 0, S, S);
      // punch the opening out of it, softly
      x.globalCompositeOperation = 'destination-out';
      x.filter = 'blur(26px)';
      x.beginPath();
      var m = S * 0.085, r = S * 0.3;
      x.moveTo(m + r, m * 1.35);
      x.lineTo(S - m - r, m * 1.35);
      x.quadraticCurveTo(S - m * 0.55, m * 1.35, S - m * 0.55, m * 1.35 + r);
      x.lineTo(S - m * 0.55, S - m * 1.5 - r);
      x.quadraticCurveTo(S - m * 0.55, S - m * 1.5, S - m - r, S - m * 1.5);
      x.lineTo(m + r, S - m * 1.5);
      x.quadraticCurveTo(m * 0.55, S - m * 1.5, m * 0.55, S - m * 1.5 - r);
      x.lineTo(m * 0.55, m * 1.35 + r);
      x.quadraticCurveTo(m * 0.55, m * 1.35, m + r, m * 1.35);
      x.closePath();
      x.fill();
      x.filter = 'none';
      x.globalCompositeOperation = 'source-over';

      // --- the glass itself, over everything ---
      var tint = x.createLinearGradient(0, 0, 0, S);
      tint.addColorStop(0, 'rgba(150,186,200,0.12)');
      tint.addColorStop(0.45, 'rgba(150,186,200,0.045)');
      tint.addColorStop(1, 'rgba(120,160,178,0.1)');
      x.fillStyle = tint;
      x.fillRect(0, 0, S, S);

      // scratches, mostly where a sleeve has wiped it
      x.strokeStyle = 'rgba(226,242,248,0.13)';
      for (var i = 0; i < 46; i++) {
        x.lineWidth = Math.random() < 0.82 ? 0.8 : 1.7;
        x.beginPath();
        var sx = Math.random() * S, sy = S * 0.12 + Math.random() * S * 0.7;
        var len = 14 + Math.random() * 110, ang = (Math.random() - 0.5) * 0.9;
        x.moveTo(sx, sy);
        x.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len * 0.3);
        x.stroke();
      }
      x.strokeStyle = 'rgba(240,250,255,0.26)';
      x.lineWidth = 1.9;
      for (var j = 0; j < 4; j++) {
        x.beginPath();
        var gx = S * 0.2 + Math.random() * S * 0.6, gy = S * 0.25 + Math.random() * S * 0.5;
        x.moveTo(gx, gy);
        x.lineTo(gx + 50 + Math.random() * 110, gy + (Math.random() - 0.5) * 40);
        x.stroke();
      }

      // the reflection sliding down the glass
      var gl = x.createLinearGradient(S * 0.1, 0, S * 0.62, S * 0.8);
      gl.addColorStop(0, 'rgba(226,242,250,0)');
      gl.addColorStop(0.45, 'rgba(226,242,250,0.09)');
      gl.addColorStop(0.62, 'rgba(226,242,250,0.02)');
      gl.addColorStop(1, 'rgba(226,242,250,0)');
      x.fillStyle = gl;
      x.fillRect(0, 0, S, S);

      var tex = new THREE.CanvasTexture(c);
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthTest: false, depthWrite: false
        }));
      var DIST = 0.12;
      plane.position.set(0, 0, -DIST);
      plane.renderOrder = 999;
      plane.visible = false;
      camera.add(plane);

      // cover exactly the frustum at that distance, whatever the screen is
      function fit() {
        var h = 2 * DIST * Math.tan((camera.fov * Math.PI / 180) / 2);
        plane.scale.set(h * camera.aspect * 1.02, h * 1.02, 1);
      }
      fit();
      return { g: plane, fit: fit };
    })();

    // ---------------- Muzzle flash ----------------
    var flashTex = (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var x = c.getContext('2d');
      var grd = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      grd.addColorStop(0, 'rgba(255,240,190,1)');
      grd.addColorStop(0.4, 'rgba(255,190,90,0.8)');
      grd.addColorStop(1, 'rgba(255,140,40,0)');
      x.fillStyle = grd;
      x.fillRect(0, 0, 64, 64);
      for (var sp = 0; sp < 6; sp++) {
        x.save(); x.translate(32, 32); x.rotate(sp * Math.PI / 3);
        x.fillStyle = 'rgba(255,220,140,0.7)';
        x.fillRect(-1.6, 0, 3.2, 30);
        x.restore();
      }
      return new THREE.CanvasTexture(c);
    })();
    var flash = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false }));
    flash.visible = false;
    viewRoot.add(flash);
    var flashLight = new THREE.PointLight(0xffc37a, 0, 8, 2);
    camera.add(flashLight);
    var flashT = 0;

    // ---------------- Brass ----------------
    var casings = [];
    var casingGeo = {
      pistol: new THREE.CylinderGeometry(0.005, 0.005, 0.016, 6),
      rifle: new THREE.CylinderGeometry(0.005, 0.006, 0.03, 6),
      shell: new THREE.CylinderGeometry(0.01, 0.01, 0.03, 6)
    };
    var shellMat = new THREE.MeshStandardMaterial({ color: 0xa03428, roughness: 0.6 });
    function spawnCasing(kind) {
      var rig = null;
      Object.keys(rigs).forEach(function (k) { if (rigs[k].g.visible && rigs[k].eject) rig = rigs[k]; });
      if (!rig) return;
      var m = new THREE.Mesh(casingGeo[kind], kind === 'shell' ? shellMat : brass);
      var p = rig.eject.clone();
      rig.g.localToWorld(p);
      m.position.copy(p);
      scene.add(m);
      // out of the port: right, up, and slightly back, tumbling
      var right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      var up = new THREE.Vector3(0, 1, 0);
      var back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
      casings.push({
        mesh: m,
        vel: right.multiplyScalar(1.4 + Math.random()).add(up.clone().multiplyScalar(2 + Math.random())).add(back.multiplyScalar(0.4)),
        spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20),
        life: 2.5
      });
    }

    // ---------------- Tracers and impacts ----------------
    var tracers = [];
    var tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    var puffTex = (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 32;
      var x = c.getContext('2d');
      var grd = x.createRadialGradient(16, 16, 1, 16, 16, 15);
      grd.addColorStop(0, 'rgba(210,205,195,0.9)');
      grd.addColorStop(1, 'rgba(210,205,195,0)');
      x.fillStyle = grd;
      x.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    var puffs = [];
    function spawnPuff(at) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16),
        new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      m.position.copy(at);
      m.quaternion.copy(camera.quaternion);
      scene.add(m);
      puffs.push({ mesh: m, life: 0.32 });
    }
    function spawnTracer(from, to) {
      var dir = to.clone().sub(from);
      var len = dir.length();
      dir.normalize();
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.5), tracerMat);
      m.position.copy(from);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
      scene.add(m);
      tracers.push({ mesh: m, dir: dir, travelled: 0, total: len, speed: 85, end: to.clone() });
    }

    // ---------------- Animation state ----------------
    var current = null;
    var kickT = 0, slideT = 0, boltT = 0, reloadT = 0, reloadDur = 0;
    var reloadDone = null;
    var boltNeeded = false;

    var api = {
      hasRig: function (id) { return !!rigs[id]; },
      rigInfo: function (id) {
        if (!rigs[id]) return null;
        var n = 0;
        rigs[id].g.traverse(function (o) { if (o.isMesh) n++; });
        return { meshes: n, visible: rigs[id].g.visible };
      },
      shownRig: function () { return current; },
      visorScreenPos: function () {
        visor.g.updateMatrixWorld(true);
        var v = new THREE.Vector3();
        visor.g.getWorldPosition(v);
        v.project(camera);
        return { x: +v.x.toFixed(4), y: +v.y.toFixed(4) };
      },
      // looking out through the visor
      setVisor: function (on) { visor.fit(); visor.g.visible = !!on; },
      fitVisor: function () { visor.fit(); },
      visorOn: function () { return visor.g.visible; },
      select: function (id) {
        Object.keys(rigs).forEach(function (k) { rigs[k].g.visible = false; });
        current = rigs[id] ? id : null;
        if (current) rigs[current].g.visible = true;
        // switching guns abandons a reload and forgets the spent bolt
        reloadT = 0; reloadDone = null; boltT = 0; boltNeeded = false;
      },
      canFire: function () {
        if (reloadT > 0) return false;
        if (current === 'ar' && (boltNeeded || boltT > 0)) return false;
        return true;
      },
      isReloading: function () { return reloadT > 0; },
      onFired: function (weapon, hitPoint) {
        kickT = 1;
        flashT = 0.06;
        var rig = rigs[weapon];
        if (rig && rig.tip) {
          flash.position.copy(rig.tip.clone().add(rig.g.position));
          flash.rotation.z = Math.random() * Math.PI;
          flash.visible = true;
          flashLight.intensity = 6;
          var from = rig.tip.clone();
          rig.g.localToWorld(from);
          if (hitPoint) spawnTracer(from, hitPoint);
        }
        if (weapon === 'glock') { slideT = 1; spawnCasing('pistol'); }
        if (weapon === 'shotgun') { spawnCasing('shell'); }
        if (weapon === 'ar') { boltNeeded = true; }
        if (window.__horror && window.__horror.debugFx) window.__horror.debugFx();
      },
      // the R700's rate of fire IS this animation
      cycleBolt: function (onDone) {
        if (!boltNeeded || boltT > 0) return false;
        boltT = 1;
        setTimeout(function () { spawnCasing('rifle'); }, 350);
        setTimeout(function () {
          boltNeeded = false;
          if (onDone) onDone();
        }, 1050);
        return true;
      },
      boltNeeded: function () { return boltNeeded; },
      startReload: function (weapon, dur, onDone) {
        if (reloadT > 0) return false;
        reloadDur = dur;
        reloadT = dur;
        reloadDone = onDone || null;
        return true;
      },
      spawnPellets: function (from, points) {
        for (var i = 0; i < points.length; i++) spawnTracer(from.clone(), points[i]);
      },
      spawnImpact: spawnPuff,
      muzzleWorld: function () {
        if (!current || !rigs[current].tip) return null;
        var p = rigs[current].tip.clone();
        rigs[current].g.localToWorld(p);
        return p;
      },
      counts: function () { return { casings: casings.length, tracers: tracers.length }; },

      update: function (dt, bobTime) {
        // recoil and settle
        if (kickT > 0) kickT = Math.max(0, kickT - dt * 6);
        viewRoot.position.z = -0.45 + kickT * (current === 'shotgun' ? 0.09 : current === 'ar' ? 0.08 : 0.05);
        viewRoot.rotation.x = kickT * (current === 'shotgun' ? 0.2 : 0.12) + Math.sin(bobTime) * 0.008;

        if (flashT > 0) {
          flashT -= dt;
          if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; }
        }

        // Glock slide blowback
        if (rigs.glock.g.visible) {
          if (slideT > 0) slideT = Math.max(0, slideT - dt * 9);
          rigs.glock.slide.position.z = slideT > 0.5 ? 0.035 : slideT * 0.07;
        }

        // rifle bolt: up, back, forward, down — driven by the right hand
        if (rigs.ar.g.visible && boltT > 0) {
          boltT = Math.max(0, boltT - dt / 1.05);
          var ph = 1 - boltT;
          var b = rigs.ar.bolt;
          if (ph < 0.25) { b.rotation.z = (ph / 0.25) * 1.1; b.position.z = 0.05; }
          else if (ph < 0.5) { b.rotation.z = 1.1; b.position.z = 0.05 + ((ph - 0.25) / 0.25) * 0.06; }
          else if (ph < 0.75) { b.rotation.z = 1.1; b.position.z = 0.11 - ((ph - 0.5) / 0.25) * 0.06; }
          else { b.rotation.z = 1.1 - ((ph - 0.75) / 0.25) * 1.1; b.position.z = 0.05; }
          rigs.ar.armR.position.y = -0.1 + Math.sin(ph * Math.PI) * 0.06;
        }

        // reload: gun dips and turns, hands do the work off screen
        if (reloadT > 0) {
          reloadT -= dt;
          var rp = 1 - reloadT / reloadDur;
          var dip = Math.sin(Math.min(rp * 2, 1) * Math.PI) * 0.14;
          if (current && rigs[current]) {
            rigs[current].g.position.y = -dip;
            rigs[current].g.rotation.z = dip * 1.4;
            if (current === 'glock') {
              rigs.glock.mag.visible = rp < 0.25 || rp > 0.65;
            }
          }
          if (reloadT <= 0) {
            if (current && rigs[current]) {
              rigs[current].g.position.y = 0;
              rigs[current].g.rotation.z = 0;
              if (rigs.glock.mag) rigs.glock.mag.visible = true;
            }
            var cb = reloadDone;
            reloadDone = null;
            if (cb) cb();
          }
        }

        // brass
        for (var i = casings.length - 1; i >= 0; i--) {
          var c = casings[i];
          c.life -= dt;
          c.vel.y -= 9.8 * dt;
          c.mesh.position.addScaledVector(c.vel, dt);
          c.mesh.rotation.x += c.spin.x * dt;
          c.mesh.rotation.z += c.spin.z * dt;
          if (c.mesh.position.y < 0.012 && c.vel.y < 0) {
            c.mesh.position.y = 0.012;
            c.vel.y *= -0.35;
            c.vel.x *= 0.6; c.vel.z *= 0.6;
          }
          if (c.life <= 0) { scene.remove(c.mesh); casings.splice(i, 1); }
        }

        // tracers fly until they arrive, then puff
        for (var t2 = tracers.length - 1; t2 >= 0; t2--) {
          var tr = tracers[t2];
          tr.travelled += tr.speed * dt;
          if (tr.travelled >= tr.total) {
            spawnPuff(tr.end);
            scene.remove(tr.mesh);
            tracers.splice(t2, 1);
          } else {
            tr.mesh.position.copy(tr.end).addScaledVector(tr.dir, tr.travelled - tr.total);
          }
        }
        for (var pu = puffs.length - 1; pu >= 0; pu--) {
          var pf = puffs[pu];
          pf.life -= dt;
          pf.mesh.scale.multiplyScalar(1 + dt * 3);
          pf.mesh.material.opacity = Math.max(0, pf.life / 0.32);
          if (pf.life <= 0) { scene.remove(pf.mesh); puffs.splice(pu, 1); }
        }
      }
    };
    return api;
  };
})();
