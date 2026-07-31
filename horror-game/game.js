/*
 * Untitled Horror Game — Room 001
 *
 * Classic (non-module) script so the same source can power both the
 * multi-file dev build (index.html + vendored Three.js) and the inlined
 * single-file build (standalone.html). Exposes one entry point:
 *
 *   window.startGame(THREE, { mount, ui })
 *
 * THREE is injected rather than imported so neither build needs a bundler.
 */
(function () {
  'use strict';

  // -------------------------------------------------------------------
  // Room specification — the numbers the entry card advertises.
  // -------------------------------------------------------------------
  var ROOM_SIZE = 10;      // 10 x 10 metres
  var WALL_HEIGHT = 4;     // metres
  var EYE_HEIGHT = 1.7;    // camera height
  var PLAYER_RADIUS = 0.4; // keeps the player off the walls
  var HALF = ROOM_SIZE / 2;
  var MOVE_SPEED = 2.9;    // metres / second
  var LOOK_SENSITIVITY = 0.0022;
  var PITCH_LIMIT = Math.PI / 2 - 0.06;

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // -------------------------------------------------------------------
  // Procedural concrete: multi-octave canvas noise, so the grey surfaces
  // read as poured concrete instead of flat colour. No external assets.
  // -------------------------------------------------------------------
  function makeConcreteTexture(THREE, size, baseValue, speckle) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgb(' + baseValue + ',' + baseValue + ',' + baseValue + ')';
    ctx.fillRect(0, 0, size, size);

    // Coarse blotches through to fine mottling.
    var octaves = [
      { cells: 6, amp: 16, alpha: 0.5 },
      { cells: 16, amp: 12, alpha: 0.4 },
      { cells: 48, amp: 8, alpha: 0.35 },
      { cells: 128, amp: 5, alpha: 0.3 }
    ];
    for (var o = 0; o < octaves.length; o++) {
      var oct = octaves[o];
      var step = size / oct.cells;
      for (var y = 0; y < oct.cells; y++) {
        for (var x = 0; x < oct.cells; x++) {
          var d = (Math.random() * 2 - 1) * oct.amp;
          var v = Math.max(0, Math.min(255, baseValue + d));
          ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + oct.alpha + ')';
          ctx.fillRect(x * step, y * step, step + 1, step + 1);
        }
      }
    }

    // Pitting and aggregate flecks.
    for (var s = 0; s < speckle; s++) {
      var sx = Math.random() * size;
      var sy = Math.random() * size;
      var r = Math.random() * 1.6 + 0.2;
      var dark = Math.random() < 0.6;
      var sv = dark ? baseValue - 34 : baseValue + 26;
      sv = Math.max(0, Math.min(255, sv));
      ctx.fillStyle = 'rgba(' + sv + ',' + sv + ',' + sv + ',' + (Math.random() * 0.5 + 0.2) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  // -------------------------------------------------------------------
  // The electrical hum of a failing bulb, synthesised on the fly.
  // Started from the user's click, so autoplay policy is satisfied.
  // -------------------------------------------------------------------
  function createAmbience() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    var ctx, master, humGain;
    var started = false;

    function start() {
      if (started) return;
      started = true;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);

      // 50Hz mains buzz plus its harmonic — the bulb's filament.
      humGain = ctx.createGain();
      humGain.gain.value = 0.5;
      humGain.connect(master);

      [50, 100, 150].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        var g = ctx.createGain();
        g.gain.value = [0.5, 0.16, 0.06][i];
        osc.connect(g);
        g.connect(humGain);
        osc.start();
      });

      // A breath of filtered noise underneath: room tone.
      var len = ctx.sampleRate * 2;
      var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
      var noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      var ng = ctx.createGain();
      ng.gain.value = 0.5;
      noise.connect(lp);
      lp.connect(ng);
      ng.connect(master);
      noise.start();

      // Fade in — never a hard cut.
      master.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
    }

    return {
      start: start,
      // Duck the hum in sync with the light dropping out.
      setFlicker: function (amount) {
        if (!started || !humGain) return;
        humGain.gain.setTargetAtTime(0.2 + amount * 0.8, ctx.currentTime, 0.02);
      },
      setMuted: function (muted) {
        if (!started || !master) return;
        master.gain.setTargetAtTime(muted ? 0.0 : 0.05, ctx.currentTime, 0.15);
      },
      get available() {
        return started;
      }
    };
  }

  // -------------------------------------------------------------------
  // Entry point
  // -------------------------------------------------------------------
  window.startGame = function startGame(THREE, options) {
    options = options || {};
    var mount = options.mount || document.body;
    var ui = options.ui || {};

    // ---------------- Renderer ----------------
    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    var canvas = renderer.domElement;
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', 'Room 001 — first person view');

    // ---------------- Scene ----------------
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090a);
    scene.fog = new THREE.FogExp2(0x08090a, 0.055);

    var camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 60);
    // Start off-centre looking across the room's diagonal — the longest
    // sightline, so the space reads as a room immediately.
    camera.position.set(2.8, EYE_HEIGHT, 3.1);

    // ---------------- Materials ----------------
    var wallTex = makeConcreteTexture(THREE, 512, 132, 2600);
    wallTex.repeat.set(3, 1.4);
    var floorTex = makeConcreteTexture(THREE, 512, 108, 3400);
    floorTex.repeat.set(4, 4);
    var ceilTex = makeConcreteTexture(THREE, 512, 96, 1800);
    ceilTex.repeat.set(3, 3);

    var wallMat = new THREE.MeshStandardMaterial({
      color: 0x9aa1a4, map: wallTex, bumpMap: wallTex, bumpScale: 0.35,
      roughness: 0.96, metalness: 0.0
    });
    var floorMat = new THREE.MeshStandardMaterial({
      color: 0x8b9295, map: floorTex, bumpMap: floorTex, bumpScale: 0.4,
      roughness: 0.94, metalness: 0.0
    });
    var ceilMat = new THREE.MeshStandardMaterial({
      color: 0x7f868a, map: ceilTex, bumpMap: ceilTex, bumpScale: 0.3,
      roughness: 1.0, metalness: 0.0
    });

    // ---------------- Room ----------------
    var room = new THREE.Group();

    var floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    room.add(floor);

    var ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    ceiling.receiveShadow = true;
    room.add(ceiling);

    function addWall(x, y, z, rotY) {
      var wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, WALL_HEIGHT), wallMat);
      wall.position.set(x, y, z);
      wall.rotation.y = rotY;
      wall.receiveShadow = true;
      wall.castShadow = true;
      room.add(wall);
    }
    var midH = WALL_HEIGHT / 2;
    addWall(0, midH, -HALF, 0);            // north
    addWall(0, midH, HALF, Math.PI);       // south
    addWall(-HALF, midH, 0, Math.PI / 2);  // west
    addWall(HALF, midH, 0, -Math.PI / 2);  // east

    // A skirting rail grounds the walls against the floor.
    var trimMat = new THREE.MeshStandardMaterial({ color: 0x6a6f71, roughness: 0.85 });
    for (var t = 0; t < 4; t++) {
      var horizontal = t < 2;
      var trim = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? ROOM_SIZE : 0.06, 0.14, horizontal ? 0.06 : ROOM_SIZE),
        trimMat
      );
      trim.position.set(
        horizontal ? 0 : (t === 2 ? -HALF + 0.03 : HALF - 0.03),
        0.07,
        horizontal ? (t === 0 ? -HALF + 0.03 : HALF - 0.03) : 0
      );
      trim.receiveShadow = true;
      room.add(trim);
    }

    scene.add(room);

    // ---------------- Lighting ----------------
    // Cold fill so the concrete reads grey. Without enough cool light the
    // tungsten bulb stains the whole room sepia — the room must stay grey
    // and let the bulb own only the warm pool beneath it.
    var sky = new THREE.HemisphereLight(0x8fa3b4, 0x24282a, 1.15);
    scene.add(sky);
    var ambient = new THREE.AmbientLight(0x5b6b78, 0.5);
    scene.add(ambient);

    // ...against one warm, failing tungsten bulb. The whole palette is
    // this single relationship: cold room, fragile warm source.
    var bulbPivot = new THREE.Group();
    bulbPivot.position.set(0, WALL_HEIGHT, 0);
    scene.add(bulbPivot);

    var CORD_LENGTH = 0.62;

    var cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, CORD_LENGTH, 6),
      new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 1 })
    );
    cord.position.y = -CORD_LENGTH / 2;
    bulbPivot.add(cord);

    var socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.09, 12),
      new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.7, metalness: 0.3 })
    );
    socket.position.y = -CORD_LENGTH - 0.04;
    bulbPivot.add(socket);

    var bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff4e2, emissive: 0xffd9a0, emissiveIntensity: 3.0, roughness: 0.25
    });
    var bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 16), bulbMat);
    bulbMesh.position.y = -CORD_LENGTH - 0.13;
    bulbPivot.add(bulbMesh);

    var bulb = new THREE.PointLight(0xffe3c2, 22, 26, 1.75);
    bulb.position.y = -CORD_LENGTH - 0.13;
    bulb.castShadow = true;
    bulb.shadow.mapSize.set(1024, 1024);
    bulb.shadow.bias = -0.0016;
    bulb.shadow.camera.near = 0.05;
    bulb.shadow.camera.far = 20;
    bulbPivot.add(bulb);

    var BASE_INTENSITY = bulb.intensity;
    var BASE_EMISSIVE = bulbMat.emissiveIntensity;

    // ---------------- Look state ----------------
    var yaw = Math.PI / 4;  // face the opposite corner
    var pitch = 0;

    function applyLook() {
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
    applyLook();

    function addLook(dx, dy) {
      yaw -= dx * LOOK_SENSITIVITY;
      pitch -= dy * LOOK_SENSITIVITY;
      if (pitch > PITCH_LIMIT) pitch = PITCH_LIMIT;
      if (pitch < -PITCH_LIMIT) pitch = -PITCH_LIMIT;
      applyLook();
    }

    // ---------------- Input ----------------
    var keys = { forward: false, back: false, left: false, right: false, turnL: false, turnR: false };
    var running = false;
    var active = false;      // is the player in the room (past the entry card)?
    var pointerLocked = false;
    var pointerLockBlocked = false; // e.g. sandboxed iframe without allow="pointer-lock"

    function keyHandler(down) {
      return function (e) {
        switch (e.code) {
          case 'KeyW': case 'ArrowUp': keys.forward = down; break;
          case 'KeyS': case 'ArrowDown': keys.back = down; break;
          case 'KeyA': keys.left = down; break;
          case 'KeyD': keys.right = down; break;
          case 'ArrowLeft': keys.turnL = down; break;   // arrows turn, WASD strafes
          case 'ArrowRight': keys.turnR = down; break;
          case 'KeyQ': keys.turnL = down; break;
          case 'KeyE': keys.turnR = down; break;
          case 'ShiftLeft': case 'ShiftRight': running = down; break;
          default: return;
        }
        if (active) e.preventDefault();
      };
    }
    window.addEventListener('keydown', keyHandler(true));
    window.addEventListener('keyup', keyHandler(false));

    // Pointer lock is the ideal path, but it is routinely unavailable inside
    // an iframe. Drag-to-look is a first-class fallback, not a degradation.
    document.addEventListener('pointerlockchange', function () {
      pointerLocked = document.pointerLockElement === canvas;
      if (ui.onLockChange) ui.onLockChange(pointerLocked);
    });
    function markPointerLockBlocked() {
      if (pointerLockBlocked) return;
      pointerLockBlocked = true;
      if (ui.onPointerLockBlocked) ui.onPointerLockBlocked();
    }
    document.addEventListener('pointerlockerror', markPointerLockBlocked);

    document.addEventListener('mousemove', function (e) {
      if (!pointerLocked) return;
      addLook(e.movementX || 0, e.movementY || 0);
    });

    // Drag-to-look (mouse or touch) whenever the pointer is not locked.
    var dragging = false;
    var lastX = 0, lastY = 0;

    canvas.addEventListener('pointerdown', function (e) {
      if (!active || pointerLocked) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging || pointerLocked) return;
      addLook((e.clientX - lastX) * 2.1, (e.clientY - lastY) * 2.1);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // On-screen stick for touch devices.
    var stick = { active: false, x: 0, y: 0, id: null };
    if (ui.stick && ui.stickNub) {
      var stickEl = ui.stick;
      var nub = ui.stickNub;
      var RADIUS = 46;
      stickEl.addEventListener('pointerdown', function (e) {
        stick.active = true;
        stick.id = e.pointerId;
        try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
        e.preventDefault();
      });
      stickEl.addEventListener('pointermove', function (e) {
        if (!stick.active || e.pointerId !== stick.id) return;
        var rect = stickEl.getBoundingClientRect();
        var dx = e.clientX - (rect.left + rect.width / 2);
        var dy = e.clientY - (rect.top + rect.height / 2);
        var dist = Math.hypot(dx, dy) || 1;
        var clamped = Math.min(dist, RADIUS);
        dx = (dx / dist) * clamped;
        dy = (dy / dist) * clamped;
        stick.x = dx / RADIUS;
        stick.y = dy / RADIUS;
        nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        e.preventDefault();
      });
      function resetStick(e) {
        if (!stick.active) return;
        stick.active = false;
        stick.x = stick.y = 0;
        nub.style.transform = 'translate(0px,0px)';
        try { stickEl.releasePointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
      }
      stickEl.addEventListener('pointerup', resetStick);
      stickEl.addEventListener('pointercancel', resetStick);
    }

    // ---------------- Ambience ----------------
    var ambience = createAmbience();
    var muted = false;

    // ---------------- Loop ----------------
    var clock = new THREE.Clock();
    var velocity = new THREE.Vector3();
    var forwardVec = new THREE.Vector3();
    var rightVec = new THREE.Vector3();
    var bobTime = 0;
    var flickerDrop = 0;   // 0 = bulb at full, 1 = fully dropped out
    var nextFlickerAt = 2.5;

    function tick() {
      requestAnimationFrame(tick);
      var delta = Math.min(clock.getDelta(), 0.05);
      var elapsed = clock.elapsedTime;

      if (active) {
        // --- movement ---
        var inputX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stick.x;
        var inputZ = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0) - stick.y;
        var len = Math.hypot(inputX, inputZ);
        if (len > 1) { inputX /= len; inputZ /= len; }

        if (keys.turnL) yaw += 1.7 * delta;
        if (keys.turnR) yaw -= 1.7 * delta;
        if (keys.turnL || keys.turnR) applyLook();

        var speed = MOVE_SPEED * (running ? 1.75 : 1);
        forwardVec.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        rightVec.set(Math.cos(yaw), 0, -Math.sin(yaw));

        var targetX = (forwardVec.x * inputZ + rightVec.x * inputX) * speed;
        var targetZ = (forwardVec.z * inputZ + rightVec.z * inputX) * speed;

        // Critically-damped-ish approach; walking here should feel heavy.
        var damp = 1 - Math.exp(-11 * delta);
        velocity.x += (targetX - velocity.x) * damp;
        velocity.z += (targetZ - velocity.z) * damp;

        camera.position.x += velocity.x * delta;
        camera.position.z += velocity.z * delta;

        var limit = HALF - PLAYER_RADIUS;
        camera.position.x = Math.max(-limit, Math.min(limit, camera.position.x));
        camera.position.z = Math.max(-limit, Math.min(limit, camera.position.z));

        // --- head bob ---
        var speedNow = Math.hypot(velocity.x, velocity.z);
        if (!prefersReducedMotion) {
          bobTime += delta * speedNow * 2.4;
          camera.position.y = EYE_HEIGHT + Math.sin(bobTime * 2) * 0.022 + Math.sin(bobTime) * 0.012;
        } else {
          camera.position.y = EYE_HEIGHT;
        }
      }

      // --- the bulb ---
      // A slow pendulum swing makes every shadow in the room crawl.
      if (!prefersReducedMotion) {
        bulbPivot.rotation.z = Math.sin(elapsed * 0.62) * 0.035;
        bulbPivot.rotation.x = Math.cos(elapsed * 0.47) * 0.026;
      }

      // Failing filament: mostly steady, with occasional stutters.
      if (elapsed > nextFlickerAt) {
        flickerDrop = 0.55 + Math.random() * 0.45;
        nextFlickerAt = elapsed + 1.6 + Math.random() * 6.5;
      }
      flickerDrop *= Math.exp(-9 * delta);
      var buzz = Math.sin(elapsed * 47) * 0.018 + Math.sin(elapsed * 13) * 0.012;
      var level = Math.max(0.05, 1 - flickerDrop + buzz);

      bulb.intensity = BASE_INTENSITY * level;
      bulbMat.emissiveIntensity = BASE_EMISSIVE * Math.max(0.08, level);
      if (ambience) ambience.setFlicker(level);
      if (ui.onLightLevel) ui.onLightLevel(level);

      renderer.render(scene, camera);
    }
    tick();

    // ---------------- Resize ----------------
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ---------------- Public surface ----------------
    return {
      enter: function () {
        active = true;
        canvas.focus();
        if (ambience) ambience.start();
        if (!pointerLockBlocked && canvas.requestPointerLock) {
          // Chromium returns a promise here and rejects it when the frame
          // lacks the pointer-lock permission. Swallow it deliberately:
          // an unhandled rejection would spam the console in exactly the
          // embedded case the drag fallback exists to cover.
          var request;
          try {
            request = canvas.requestPointerLock();
          } catch (err) {
            markPointerLockBlocked();
          }
          if (request && typeof request.catch === 'function') {
            request.catch(markPointerLockBlocked);
          }
        }
      },
      exit: function () {
        active = false;
        keys.forward = keys.back = keys.left = keys.right = false;
        keys.turnL = keys.turnR = false;
        if (document.pointerLockElement === canvas && document.exitPointerLock) {
          document.exitPointerLock();
        }
      },
      toggleMute: function () {
        muted = !muted;
        if (ambience) ambience.setMuted(muted);
        return muted;
      },
      get isActive() { return active; },
      get pointerLockBlocked() { return pointerLockBlocked; },

      // Inspectable state — used by the test suite to assert on the real
      // camera rather than on pixels, since the scene animates every frame.
      getState: function () {
        return {
          yaw: yaw,
          pitch: pitch,
          x: camera.position.x,
          z: camera.position.z,
          active: active,
          locked: pointerLocked,
          pointerLockBlocked: pointerLockBlocked
        };
      }
    };
  };
})();
