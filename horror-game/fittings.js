/*
 * Untitled Horror Game — doors and mirrors.
 *
 * Doors: every doorway in the facility gets a slab built to its own spec.
 * They swing (or roll) on interaction and their collider drops out once
 * they are far enough open to walk through.
 *
 * Mirrors: a planar reflector. The scene is re-rendered from a camera
 * mirrored through the glass, and only while the player is close enough
 * and facing it — a mirror is a whole extra scene render, so it is not
 * something to leave running down a corridor.
 *
 *   window.FITTINGS.createDoors(THREE, ctx)
 *   window.FITTINGS.createMirror(THREE, ctx, spec)
 */
(function () {
  'use strict';

  var FITTINGS = {};

  // ===================================================================
  // Doors
  // ===================================================================
  FITTINGS.createDoors = function (THREE, ctx) {
    var group = ctx.group, MAT = ctx.materials, TEX = window.TEX;
    var box = ctx.box, cyl = ctx.cyl, solid = ctx.solid, interact = ctx.interact;

    var runtime = {};   // id → { open, angle, target, kind, pivot }
    var LEAF_H = 2.24;

    function panelledLeaf(w, h, mat, edgeMat) {
      // A door leaf is a slab plus raised panel mouldings, built around a
      // local origin at the hinge edge so the pivot maths stays simple.
      var g = new THREE.Group();
      var slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), mat);
      slab.position.set(w / 2, h / 2, 0);
      g.add(slab);
      var pw = w * 0.66, ph = h * 0.32;
      [h * 0.72, h * 0.32].forEach(function (cy) {
        var p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.016), edgeMat || mat);
        p.position.set(w / 2, cy, 0.03);
        g.add(p);
        var p2 = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.016), edgeMat || mat);
        p2.position.set(w / 2, cy, -0.03);
        g.add(p2);
      });
      return { group: g, slab: slab };
    }

    function handle(g, w, h, side) {
      var m = new THREE.MeshStandardMaterial({ color: 0x8c8578, roughness: 0.35, metalness: 0.8 });
      var hx = side === 'far' ? w - 0.12 : 0.12;
      [0.045, -0.045].forEach(function (z) {
        var lever = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.026, 0.026), m);
        lever.position.set(hx, h * 0.46, z);
        g.add(lever);
        var rose = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.014, 10), m);
        rose.rotation.x = Math.PI / 2;
        rose.position.set(hx, h * 0.46, z);
        g.add(rose);
      });
    }

    function pushBar(g, w, h) {
      var m = new THREE.MeshStandardMaterial({ color: 0x9aa0a2, roughness: 0.4, metalness: 0.75 });
      var bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.07, 0.05), m);
      bar.position.set(w / 2, h * 0.45, 0.06);
      g.add(bar);
      [0.22, 0.78].forEach(function (f) {
        var br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.09), m);
        br.position.set(w * f, h * 0.45, 0.035);
        g.add(br);
      });
    }

    function visionPanel(g, w, h, wired) {
      var pane = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.4, h * 0.26, 0.012),
        new THREE.MeshStandardMaterial({
          map: wired, color: 0xb9ccd0, roughness: 0.35,
          transparent: true, opacity: 0.62
        })
      );
      pane.position.set(w / 2, h * 0.7, 0);
      g.add(pane);
      var frame = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.46, h * 0.31, 0.052),
        new THREE.MeshStandardMaterial({ color: 0x4a4f51, roughness: 0.6, metalness: 0.4 })
      );
      frame.position.set(w / 2, h * 0.7, -0.004);
      g.add(frame);
    }

    var woodLight = TEX.wood(THREE, 512, [128, 96, 60], { knots: 2 });
    var woodDark = TEX.wood(THREE, 512, [86, 62, 38], { knots: 3 });
    var steelTex = TEX.metal(THREE, 512, 112, { rust: 8, plate: true });
    var wiredTex = TEX.wiredGlass(THREE, 256);
    var hazardTex = TEX.hazard(THREE, 256);

    var MATS = {
      woodLight: new THREE.MeshStandardMaterial({ map: woodLight, bumpMap: woodLight, bumpScale: 0.12, roughness: 0.72 }),
      woodDark: new THREE.MeshStandardMaterial({ map: woodDark, bumpMap: woodDark, bumpScale: 0.14, roughness: 0.76 }),
      steel: new THREE.MeshStandardMaterial({ map: steelTex, bumpMap: steelTex, bumpScale: 0.1, roughness: 0.5, metalness: 0.55 }),
      hazard: new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.65, metalness: 0.2 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x5a5f60, roughness: 0.7, metalness: 0.25 })
    };

    // ---- the specification for every doorway in the building ----
    // hinge: which end of the gap the leaf is hung from. swing: which way
    // it opens, in radians.
    var SPECS = {
      waitingWest: {
        gap: { axis: 'x', at: -8, min: -1.5, max: 1.5 },
        style: 'wood', label: 'Door to the west corridor', hinge: 'min', swing: -1.85,
        sign: null
      },
      waitingEast: {
        gap: { axis: 'x', at: 8, min: -1.5, max: 1.5 },
        style: 'wood', label: 'Door to the east corridor', hinge: 'max', swing: 1.85
      },
      restrooms: {
        gap: { axis: 'z', at: -1.5, min: -20, max: -17 },
        style: 'restroom', label: 'Restroom door', hinge: 'min', swing: 1.8,
        sign: 'REST\nROOMS'
      },
      warehouse: {
        gap: { axis: 'x', at: -48, min: -1.5, max: 1.5 },
        style: 'industrial', label: 'Warehouse doors', hinge: 'min', swing: -1.9,
        sign: 'WAREHOUSE'
      },
      office: {
        gap: { axis: 'z', at: -1.5, min: 26, max: 29 },
        style: 'ripped', label: 'The office doorway'
      },
      junction: {
        gap: { axis: 'x', at: 48, min: -1.5, max: 1.5 },
        style: 'fire', label: 'Fire door', hinge: 'min', swing: -1.85,
        sign: 'FIRE DOOR\nKEEP SHUT'
      },
      storage: {
        gap: { axis: 'x', at: 56, min: -1.5, max: 1.5 },
        style: 'roller', label: 'Storage unit', locked: true, id: 'storageDoor'
      },
      assembly: {
        gap: { axis: 'z', at: 46, min: 48, max: 51 },
        style: 'barricaded', label: 'Assembly'
      },
      airlockIn: {
        gap: { axis: 'x', at: 58, min: 51, max: 54 },
        style: 'hatch', label: 'Airlock hatch', hinge: 'min', swing: -1.7
      },
      airlockOut: {
        gap: { axis: 'x', at: 62, min: 51, max: 54 },
        style: 'hatch', label: 'Chamber hatch', hinge: 'max', swing: 1.7,
        sign: null
      },
      supply: {
        gap: { axis: 'z', at: 58, min: 63.5, max: 65.5 },
        style: 'utility', label: 'Supply storage door', hinge: 'min', swing: 1.75,
        sign: 'SUPPLY'
      },
      bath2: {
        gap: { axis: 'z', at: 58, min: 70, max: 72 },
        style: 'restroom', label: 'Restroom door', hinge: 'min', swing: 1.75,
        sign: 'REST\nROOM'
      }
    };

    // A leaf is modelled along its local +X with its faces on local Z, so
    // the pivot has to turn it to lie *in* the doorway. For a wall plane at
    // constant x the leaf must run along Z; for one at constant z, along X.
    function hingeBase(axis, atMin) {
      if (axis === 'x') return atMin ? -Math.PI / 2 : Math.PI / 2;
      return atMin ? 0 : Math.PI;
    }

    function buildLeaf(key, spec) {
      var gap = spec.gap;
      var w = gap.max - gap.min;
      var id = spec.id || ('door_' + key);

      // ---- doorways with no leaf ----
      if (spec.style === 'ripped') {
        // The office door was torn off; only the frame and hinges remain.
        var hy = [0.5, 1.2, 1.95];
        hy.forEach(function (y) {
          var hinge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), MATS.frame);
          hinge.position.set(gap.min + 0.08, y, gap.at);
          hinge.rotation.z = (Math.random() - 0.5) * 0.5;
          group.add(hinge);
        });
        // splinters where the frame gave way
        for (var s = 0; s < 9; s++) {
          var sp = new THREE.Mesh(new THREE.BoxGeometry(0.05 + Math.random() * 0.13, 0.04, 0.05), MATS.woodDark);
          sp.position.set(gap.min + 0.06 + Math.random() * 0.2, 0.3 + Math.random() * 1.9, gap.at + (Math.random() - 0.5) * 0.14);
          sp.rotation.set(Math.random(), Math.random(), Math.random());
          group.add(sp);
        }
        runtime[id] = { open: true, angle: 0, target: 0, kind: 'none' };
        return;
      }

      if (spec.style === 'barricaded') {
        // A steel door standing open, with the planks nailed across it.
        var leaf = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, LEAF_H, 0.06), MATS.steel);
        leaf.position.set(gap.min + w * 0.1, LEAF_H / 2, gap.at - 0.55);
        leaf.rotation.y = 1.25;
        group.add(leaf);
        runtime[id] = { open: true, angle: 0, target: 0, kind: 'none' };
        return;
      }

      if (spec.style === 'roller') {
        // A roller shutter: it lifts rather than swings.
        var slats = new THREE.Group();
        for (var r = 0; r < 12; r++) {
          var slat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, w + 0.1), MATS.steel);
          slat.position.set(0, 0.1 + r * 0.185, 0);
          slats.add(slat);
        }
        var housing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, w + 0.3), MATS.frame);
        housing.position.set(gap.at, LEAF_H + 0.16, (gap.min + gap.max) / 2);
        group.add(housing);
        slats.position.set(gap.at, 0, (gap.min + gap.max) / 2);
        group.add(slats);
        var lock = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10),
          new THREE.MeshStandardMaterial({ color: 0xb0a578, roughness: 0.3, metalness: 0.85 }));
        lock.rotation.z = Math.PI / 2;
        lock.position.set(gap.at - 0.07, 0.95, (gap.min + gap.max) / 2);
        group.add(lock);
        interact(slats.children[6], { kind: 'door', id: id, doorId: id, label: spec.label, verb: 'Open', locked: true });
        solid(gap.at - 0.12, gap.min, gap.at + 0.12, gap.max, id);
        runtime[id] = { open: false, angle: 0, target: 0, kind: 'roll', node: slats, travel: 2.3 };
        return;
      }

      // ---- hinged leaves ----
      var mat, edge, leafW = w - 0.06;
      var isDouble = spec.style === 'industrial';
      if (isDouble) leafW = (w - 0.08) / 2;

      if (spec.style === 'wood') { mat = MATS.woodLight; edge = MATS.woodDark; }
      else if (spec.style === 'restroom') { mat = MATS.woodDark; edge = MATS.woodDark; }
      else if (spec.style === 'utility') { mat = MATS.steel; edge = MATS.steel; }
      else if (spec.style === 'fire') { mat = MATS.steel; edge = MATS.steel; }
      else if (spec.style === 'hatch') { mat = MATS.hazard; edge = MATS.hazard; }
      else { mat = MATS.steel; edge = MATS.steel; }

      var leaves = [];
      var count = isDouble ? 2 : 1;
      for (var li = 0; li < count; li++) {
        var built = panelledLeaf(leafW, LEAF_H, mat, edge);
        var g = built.group;

        // per-style fittings
        if (spec.style === 'wood') handle(g, leafW, LEAF_H, 'far');
        if (spec.style === 'restroom') {
          handle(g, leafW, LEAF_H, 'far');
          // louvre vent along the bottom rail
          for (var v = 0; v < 5; v++) {
            var louvre = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.42, 0.022, 0.06), MATS.frame);
            louvre.position.set(leafW / 2, 0.2 + v * 0.045, 0.012);
            louvre.rotation.x = -0.5;
            g.add(louvre);
          }
        }
        if (spec.style === 'industrial') { pushBar(g, leafW, LEAF_H); visionPanel(g, leafW, LEAF_H, wiredTex); }
        if (spec.style === 'fire') { pushBar(g, leafW, LEAF_H); visionPanel(g, leafW, LEAF_H, wiredTex); }
        if (spec.style === 'utility') handle(g, leafW, LEAF_H, 'far');
        if (spec.style === 'hatch') {
          // a wheel handle and a ring of dogging bolts
          var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 20),
            new THREE.MeshStandardMaterial({ color: 0x7d8486, roughness: 0.45, metalness: 0.75 }));
          wheel.position.set(leafW * 0.62, LEAF_H * 0.5, 0.05);
          g.add(wheel);
          for (var sp2 = 0; sp2 < 4; sp2++) {
            var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02),
              new THREE.MeshStandardMaterial({ color: 0x7d8486, roughness: 0.45, metalness: 0.75 }));
            spoke.position.set(leafW * 0.62, LEAF_H * 0.5, 0.05);
            spoke.rotation.z = sp2 * Math.PI / 4;
            g.add(spoke);
          }
          for (var d = 0; d < 8; d++) {
            var bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8),
              new THREE.MeshStandardMaterial({ color: 0x5c6163, roughness: 0.5, metalness: 0.7 }));
            bolt.rotation.x = Math.PI / 2;
            bolt.position.set(0.07 + (d % 4) * (leafW - 0.14) / 3, d < 4 ? 0.1 : LEAF_H - 0.1, 0.03);
            g.add(bolt);
          }
        }
        if (spec.sign) {
          var signMat = new THREE.MeshStandardMaterial({
            map: TEX.sign(THREE, spec.sign, { fontSize: spec.sign.indexOf('\n') > -1 ? 34 : 26 }),
            roughness: 0.6, metalness: 0.2
          });
          var plate = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.5, leafW * 0.25, 0.008), signMat);
          plate.position.set(leafW / 2, LEAF_H * 0.86, 0.026);
          g.add(plate);
        }

        // place the pivot at the hinge edge
        var hingeAtMin = (spec.hinge === 'min');
        var pivot = new THREE.Group();
        var swing = spec.swing;
        var offset, ry0;

        if (isDouble) {
          // two leaves meeting in the middle, hinged at opposite jambs
          var atMin = (li === 0);
          offset = atMin ? gap.min + 0.02 : gap.max - 0.02;
          ry0 = hingeBase(gap.axis, atMin);
          swing = atMin ? spec.swing : -spec.swing;
        } else {
          offset = hingeAtMin ? gap.min + 0.03 : gap.max - 0.03;
          ry0 = hingeBase(gap.axis, hingeAtMin);
        }

        if (gap.axis === 'x') pivot.position.set(gap.at, 0, offset);
        else pivot.position.set(offset, 0, gap.at);
        pivot.rotation.y = ry0;
        pivot.add(g);
        group.add(pivot);
        leaves.push({ pivot: pivot, base: pivot.rotation.y, swing: swing });
        interact(built.slab, { kind: 'door', id: id, doorId: id, label: spec.label, verb: 'Open' });
      }

      // frame lining
      var lining = 0.06;
      if (gap.axis === 'x') {
        box(0.26, LEAF_H + 0.06, lining, MATS.frame, gap.at, (LEAF_H + 0.06) / 2, gap.min + lining / 2);
        box(0.26, LEAF_H + 0.06, lining, MATS.frame, gap.at, (LEAF_H + 0.06) / 2, gap.max - lining / 2);
        box(0.26, lining, gap.max - gap.min, MATS.frame, gap.at, LEAF_H + 0.03, (gap.min + gap.max) / 2);
      } else {
        box(lining, LEAF_H + 0.06, 0.26, MATS.frame, gap.min + lining / 2, (LEAF_H + 0.06) / 2, gap.at);
        box(lining, LEAF_H + 0.06, 0.26, MATS.frame, gap.max - lining / 2, (LEAF_H + 0.06) / 2, gap.at);
        box(gap.max - gap.min, lining, 0.26, MATS.frame, (gap.min + gap.max) / 2, LEAF_H + 0.03, gap.at);
      }

      if (gap.axis === 'x') solid(gap.at - 0.1, gap.min, gap.at + 0.1, gap.max, id);
      else solid(gap.min, gap.at - 0.1, gap.max, gap.at + 0.1, id);

      runtime[id] = { open: false, angle: 0, target: 0, kind: 'swing', leaves: leaves };
    }

    Object.keys(SPECS).forEach(function (key) { buildLeaf(key, SPECS[key]); });

    function toggle(id) {
      var d = runtime[id];
      if (!d || d.kind === 'none') return null;
      d.target = d.target > 0.5 ? 0 : 1;
      d.open = d.target > 0.5;
      return d.open;
    }
    function isOpen(id) {
      var d = runtime[id];
      // Not a door. Colliders like the assembly barricade and the holding
      // cage carry ids too, and must never be waved through here.
      if (!d) return false;
      if (d.kind === 'none') return true;
      return d.angle > 0.45;
    }

    function update(dt) {
      Object.keys(runtime).forEach(function (id) {
        var d = runtime[id];
        if (d.kind === 'none') return;
        if (Math.abs(d.angle - d.target) < 0.001) return;
        d.angle += (d.target - d.angle) * (1 - Math.exp(-4.5 * dt));
        if (d.kind === 'swing') {
          for (var i = 0; i < d.leaves.length; i++) {
            var L = d.leaves[i];
            L.pivot.rotation.y = L.base + L.swing * d.angle;
          }
        } else if (d.kind === 'roll') {
          d.node.position.y = d.angle * d.travel;
        }
      });
    }

    return { toggle: toggle, isOpen: isOpen, update: update, runtime: runtime };
  };

  // ===================================================================
  // Mirrors
  // ===================================================================
  FITTINGS.createMirror = function (THREE, ctx, spec) {
    var renderer = ctx.renderer, scene = ctx.scene, camera = ctx.camera, group = ctx.group;

    var target = new THREE.WebGLRenderTarget(spec.res || 512, spec.res || 512, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });
    // The renderer converts to the target texture's colour space on write.
    // Left at the default the reflection is written linear and then shown
    // as though it were sRGB, which reads as a near-black mirror.
    if (THREE.SRGBColorSpace) target.texture.colorSpace = THREE.SRGBColorSpace;

    var textureMatrix = new THREE.Matrix4();
    var material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: target.texture },
        textureMatrix: { value: textureMatrix },
        tint: { value: new THREE.Color(spec.tint || 0xbcc6c8) },
        grime: { value: spec.grime === undefined ? 0.16 : spec.grime }
      },
      vertexShader: [
        'uniform mat4 textureMatrix;',
        'varying vec4 vUvR;',
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  vUvR = textureMatrix * vec4( position, 1.0 );',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D tDiffuse;',
        'uniform vec3 tint;',
        'uniform float grime;',
        'varying vec4 vUvR;',
        'varying vec2 vUv;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'void main() {',
        '  vec4 base = texture2DProj( tDiffuse, vUvR );',
        // old silvering: dirt toward the edges, speckled desilvering
        '  vec2 c = abs(vUv - 0.5) * 2.0;',
        '  float edge = smoothstep(0.55, 1.0, max(c.x, c.y));',
        '  float spots = smoothstep(0.82, 1.0, hash(floor(vUv * 90.0)));',
        // Silvered glass returns most of the light, so lift it back up —
        // the raw reflection reads far darker than the room itself.
        '  vec3 col = base.rgb * tint;',
        '  col = mix(col, col * 0.45, edge * grime * 1.8);',
        '  col = mix(col, vec3(0.05, 0.055, 0.06), spots * 0.30);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });

    var geo = new THREE.PlaneGeometry(spec.width, spec.height);
    var mesh = new THREE.Mesh(geo, material);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.rotation.y = spec.ry || 0;
    group.add(mesh);

    var virtualCamera = new THREE.PerspectiveCamera();
    var reflectorPos = new THREE.Vector3();
    var cameraPos = new THREE.Vector3();
    var normal = new THREE.Vector3();
    var view = new THREE.Vector3();
    var lookAtPosition = new THREE.Vector3(0, 0, -1);
    var targetPos = new THREE.Vector3();
    var rotationMatrix = new THREE.Matrix4();
    var toCamera = new THREE.Vector3();
    var reflectorPlane = new THREE.Plane();
    var clipPlane = new THREE.Vector4();
    var q = new THREE.Vector4();
    var CLIP_BIAS = 0.003;

    var RANGE = spec.range || 9;

    function update() {
      mesh.updateMatrixWorld();
      reflectorPos.setFromMatrixPosition(mesh.matrixWorld);
      cameraPos.setFromMatrixPosition(camera.matrixWorld);

      // A mirror costs a whole extra render of the scene, so only pay for
      // it when the player is near it and on the reflective side.
      toCamera.subVectors(cameraPos, reflectorPos);
      if (toCamera.lengthSq() > RANGE * RANGE) return;

      rotationMatrix.extractRotation(mesh.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      if (toCamera.dot(normal) < 0) return;

      view.subVectors(reflectorPos, cameraPos);
      view.reflect(normal).negate().add(reflectorPos);

      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraPos);
      targetPos.subVectors(reflectorPos, lookAtPosition);
      targetPos.reflect(normal).negate().add(reflectorPos);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtualCamera.lookAt(targetPos);
      virtualCamera.far = camera.far;
      virtualCamera.near = camera.near;
      virtualCamera.fov = camera.fov;
      virtualCamera.aspect = 1;
      virtualCamera.updateProjectionMatrix();
      virtualCamera.updateMatrixWorld();

      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
      );
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(mesh.matrixWorld);

      // Oblique near-plane clipping. The mirrored camera sits behind the
      // wall the mirror hangs on, so without skewing the near plane onto
      // the mirror surface it renders the back of that wall and the
      // reflection is nothing but a dark slab.
      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorPos);
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y,
        reflectorPlane.normal.z, reflectorPlane.constant);

      var pm = virtualCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1.0;
      q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      pm.elements[2] = clipPlane.x;
      pm.elements[6] = clipPlane.y;
      pm.elements[10] = clipPlane.z + 1.0 - CLIP_BIAS;
      pm.elements[14] = clipPlane.w;

      mesh.visible = false;
      var prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.setRenderTarget(prevTarget);
      mesh.visible = true;
    }

    return { mesh: mesh, update: update };
  };

  window.FITTINGS = FITTINGS;
})();
