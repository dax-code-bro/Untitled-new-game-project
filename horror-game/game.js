/*
 * Untitled Horror Game — engine.
 *
 * Classic (non-module) script so the same source powers both the multi-file
 * dev build and the inlined single-file build. Level content lives in
 * level.js; this file is renderer, player, collision, interaction, audio.
 *
 *   window.startGame(THREE, { mount, ui })
 */
(function () {
  'use strict';

  var STANCE = {
    stand: { eye: 1.68, speed: 2.9, label: 'Standing' },
    crouch: { eye: 1.05, speed: 1.5, label: 'Crouching' },
    crawl: { eye: 0.34, speed: 0.85, label: 'Crawling' }
  };
  var PLAYER_RADIUS = 0.32;
  var LOOK_SENSITIVITY = 0.0022;
  var PITCH_LIMIT = Math.PI / 2 - 0.06;
  var REACH = 2.6;

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // -------------------------------------------------------------------
  // Audio: room tone, footsteps and stingers, all synthesised.
  // -------------------------------------------------------------------
  function createAudio() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    var ctx = null, master = null, started = false, muted = false;
    var beds = {};
    var currentRoom = null;
    var nextAmbient = 6;

    function now() { return ctx.currentTime; }

    function noiseBuffer(seconds) {
      var len = Math.floor(ctx.sampleRate * seconds);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    // A filtered noise hit, schedulable slightly in the future.
    // o: {at, dur, type, freq, q, gain, sweepTo, attack}
    function noiseHit(o) {
      if (!started || muted) return;
      var t = now() + (o.at || 0);
      var s = ctx.createBufferSource();
      s.buffer = noiseBuffer(Math.max(0.1, o.dur));
      var f = ctx.createBiquadFilter();
      f.type = o.type || 'lowpass';
      f.frequency.setValueAtTime(o.freq, t);
      if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
      f.Q.value = o.q || 0.8;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.gain, t + (o.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + o.dur + 0.03);
    }

    // A pitched tone, optionally wobbling — the wobble is what makes a
    // hinge squeak read as stick-slip rather than as a synthesizer.
    // o: {at, dur, freq, to, type, gain, attack, wobble:{rate,depth}}
    function tone(o) {
      if (!started || muted) return;
      var t = now() + (o.at || 0);
      var osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.gain, t + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      if (o.wobble) {
        var lfo = ctx.createOscillator();
        lfo.frequency.value = o.wobble.rate;
        var lg = ctx.createGain();
        lg.gain.value = o.wobble.depth;
        lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t); lfo.stop(t + o.dur + 0.05);
      }
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + o.dur + 0.05);
    }

    // Back-compat wrappers used by the older one-shot effects.
    function blip(freq, dur, type, gain, slideTo) {
      tone({ freq: freq, to: slideTo, dur: dur, type: type, gain: gain || 0.08 });
    }
    function burst(dur, cutoff, gain, sweepTo) {
      noiseHit({ dur: dur, freq: cutoff, gain: gain, sweepTo: sweepTo });
    }

    // A bed is a filtered noise loop plus optional drones and hiss layer.
    function makeBed(opts) {
      var g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);

      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(4);
      src.loop = true;
      var f = ctx.createBiquadFilter();
      f.type = opts.filter || 'lowpass';
      f.frequency.value = opts.cutoff;
      f.Q.value = opts.q || 0.7;
      var ng = ctx.createGain();
      ng.gain.value = opts.noise;
      src.connect(f); f.connect(ng); ng.connect(g);
      src.start();

      if (opts.hiss) {
        var hs = ctx.createBufferSource();
        hs.buffer = noiseBuffer(4);
        hs.loop = true;
        var hf = ctx.createBiquadFilter();
        hf.type = 'bandpass';
        hf.frequency.value = opts.hiss.freq;
        hf.Q.value = opts.hiss.q || 3;
        var hg = ctx.createGain();
        hg.gain.value = opts.hiss.gain;
        hs.connect(hf); hf.connect(hg); hg.connect(g);
        hs.start();
      }

      (opts.tones || []).forEach(function (t) {
        var o = ctx.createOscillator();
        o.type = t.type || 'sine';
        o.frequency.value = t.freq;
        var og = ctx.createGain();
        og.gain.value = t.gain;
        o.connect(og); og.connect(g);
        o.start();
        if (t.lfo) {
          var l = ctx.createOscillator();
          l.frequency.value = t.lfo;
          var lg2 = ctx.createGain();
          lg2.gain.value = t.freq * 0.012;
          l.connect(lg2); lg2.connect(o.frequency); l.start();
        }
      });
      return g;
    }

    function start() {
      if (started) return;
      started = true;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      // One bed per room — every part of the building has its own track.
      function bed(id, opts) { beds[id] = makeBed(opts); }
      bed('waiting',   { cutoff: 320, noise: 0.05,  tones: [{ freq: 50, gain: 0.05 }, { freq: 100, gain: 0.016, type: 'triangle' }] });
      bed('hallL',     { cutoff: 240, noise: 0.045, tones: [{ freq: 47, gain: 0.035 }, { freq: 94, gain: 0.008, type: 'triangle' }] });
      bed('hallR',     { cutoff: 230, noise: 0.045, tones: [{ freq: 44, gain: 0.034 }, { freq: 320, gain: 0.005, lfo: 0.09 }] });
      bed('hallE',     { cutoff: 260, noise: 0.04,  tones: [{ freq: 49, gain: 0.03 }, { freq: 98, gain: 0.01, type: 'triangle' }] });
      bed('hallS',     { cutoff: 210, noise: 0.05,  tones: [{ freq: 41, gain: 0.035 }, { freq: 27.5, gain: 0.03, lfo: 0.06 }] });
      bed('restrooms', { cutoff: 520, noise: 0.035, hiss: { freq: 800, q: 4, gain: 0.012 }, tones: [{ freq: 62, gain: 0.02 }] });
      bed('bath2',     { cutoff: 540, noise: 0.03,  hiss: { freq: 950, q: 5, gain: 0.014 }, tones: [{ freq: 66, gain: 0.018 }] });
      bed('warehouse', { cutoff: 180, noise: 0.075, tones: [{ freq: 33, gain: 0.07, lfo: 0.12 }, { freq: 66, gain: 0.02 }] });
      bed('office',    { cutoff: 280, noise: 0.04,  tones: [{ freq: 44, gain: 0.04 }, { freq: 220, gain: 0.004, type: 'triangle', lfo: 0.2 }] });
      bed('storage',   { cutoff: 150, noise: 0.05,  tones: [{ freq: 36, gain: 0.05 }, { freq: 72, gain: 0.012 }] });
      bed('assembly',  { cutoff: 900, q: 6, filter: 'bandpass', noise: 0.05, tones: [{ freq: 29, gain: 0.09, lfo: 0.07 }, { freq: 38.5, gain: 0.05, lfo: 0.05 }, { freq: 23, gain: 0.04 }] });
      bed('link',      { cutoff: 1400, q: 2, filter: 'bandpass', noise: 0.03, tones: [{ freq: 55, gain: 0.02 }] });
      bed('exterm',    { cutoff: 400, noise: 0.04, hiss: { freq: 1200, q: 3, gain: 0.008 }, tones: [{ freq: 41, gain: 0.05, lfo: 0.2 }, { freq: 123, gain: 0.012, type: 'triangle' }] });
      bed('supply',    { cutoff: 200, noise: 0.045, tones: [{ freq: 38, gain: 0.04 }] });

      if (currentRoom) setRoom(currentRoom);
    }

    function setRoom(id) {
      currentRoom = id;
      if (!started) return;
      Object.keys(beds).forEach(function (k) {
        beds[k].gain.setTargetAtTime(k === id ? 1 : 0, now(), 1.1);
      });
      nextAmbient = ambientDelay(id) * 0.5;
    }

    // ---------------- Random ambient one-shots, per room ----------------
    var AMBIENT = {
      waiting: ['settle'],
      hallL: ['knock', 'settle'], hallR: ['knock', 'settle'],
      hallE: ['knock'], hallS: ['scrape', 'knock'],
      restrooms: ['drip', 'drip', 'dripDouble'], bath2: ['drip', 'dripDouble'],
      warehouse: ['groan', 'rattle'], storage: ['rattle', 'groan'],
      office: ['creak'], assembly: ['scrape', 'boom', 'rattle'],
      link: ['hiss'], exterm: ['hiss', 'tick'], supply: ['rattle', 'settle']
    };
    function ambientDelay(id) {
      if (id === 'restrooms' || id === 'bath2') return 2.5 + Math.random() * 4.5;
      if (id === 'assembly') return 6 + Math.random() * 9;
      return 9 + Math.random() * 16;
    }
    function oneShot(name) {
      var r = Math.random;
      switch (name) {
        case 'drip':
          tone({ freq: 900 + r() * 500, to: 420, dur: 0.09, gain: 0.028 });
          noiseHit({ at: 0.004, dur: 0.05, type: 'bandpass', freq: 2400, q: 3, gain: 0.012 });
          break;
        case 'dripDouble':
          oneShot('drip');
          setTimeout(function () { oneShot('drip'); }, 300 + r() * 260);
          break;
        case 'knock':
          var n = 1 + Math.floor(r() * 3);
          for (var i = 0; i < n; i++) {
            noiseHit({ at: i * (0.22 + r() * 0.1), dur: 0.1, freq: 160 + r() * 60, sweepTo: 70, gain: 0.03 });
          }
          break;
        case 'settle':
          noiseHit({ dur: 0.5, freq: 120, sweepTo: 45, gain: 0.022, attack: 0.05 });
          break;
        case 'groan':
          noiseHit({ dur: 1.6 + r(), type: 'bandpass', freq: 150 + r() * 120, sweepTo: 90, q: 9, gain: 0.03, attack: 0.3 });
          break;
        case 'rattle':
          var m = 5 + Math.floor(r() * 6);
          for (var j = 0; j < m; j++) {
            noiseHit({ at: j * 0.045 + r() * 0.02, dur: 0.03, type: 'highpass', freq: 2600, gain: 0.008 + r() * 0.008 });
          }
          break;
        case 'scrape':
          noiseHit({ dur: 1.8 + r() * 1.4, type: 'bandpass', freq: 900 + r() * 600, sweepTo: 500, q: 5, gain: 0.016, attack: 0.5 });
          break;
        case 'boom':
          tone({ freq: 44, to: 26, dur: 1.6, gain: 0.05, attack: 0.02 });
          noiseHit({ dur: 1.2, freq: 220, sweepTo: 60, gain: 0.03 });
          break;
        case 'hiss':
          noiseHit({ dur: 1.4 + r(), type: 'highpass', freq: 3200, gain: 0.008, attack: 0.4 });
          break;
        case 'tick':
          noiseHit({ dur: 0.02, type: 'highpass', freq: 4200, gain: 0.015 });
          break;
        case 'creak':
          tone({ freq: 300 + r() * 260, to: 210, dur: 0.5, type: 'triangle', gain: 0.012, wobble: { rate: 9, depth: 40 } });
          break;
      }
    }
    function tick(dt, roomId) {
      if (!started || muted || !roomId) return;
      if (roomId !== currentRoom) return;
      nextAmbient -= dt;
      if (nextAmbient > 0) return;
      nextAmbient = ambientDelay(roomId);
      var list = AMBIENT[roomId];
      if (list) oneShot(list[Math.floor(Math.random() * list.length)]);
    }

    // ---------------- Footsteps, by surface ----------------
    function footstep(surface, stance) {
      if (!started || muted) return;
      var v = stance === 'crawl' ? 0.32 : stance === 'crouch' ? 0.55 : 1;
      var j = 0.85 + Math.random() * 0.3;   // no two steps identical
      if (surface === 'lobby' || surface === 'wood') {
        // carpet: a soft pad and a hint of fibre
        noiseHit({ dur: 0.07, freq: 300 * j, sweepTo: 140, gain: 0.05 * v });
        noiseHit({ at: 0.012, dur: 0.05, type: 'highpass', freq: 3400, gain: 0.006 * v });
      } else if (surface === 'tile') {
        // hard heel click, a faint ring, and the room slapping it back
        noiseHit({ dur: 0.035, type: 'bandpass', freq: 3200 * j, q: 1.4, gain: 0.075 * v });
        tone({ freq: 1150 * j, dur: 0.07, gain: 0.012 * v });
        noiseHit({ at: 0.085, dur: 0.05, freq: 1200, gain: 0.02 * v });
      } else if (surface === 'lab') {
        // clinical vinyl: tight click, small dry echo
        noiseHit({ dur: 0.03, type: 'bandpass', freq: 2300 * j, q: 2, gain: 0.06 * v });
        noiseHit({ at: 0.06, dur: 0.04, freq: 900, gain: 0.012 * v });
      } else if (surface === 'industrial') {
        // gritty concrete: thud plus loose debris
        noiseHit({ dur: 0.06, freq: 460 * j, sweepTo: 160, gain: 0.07 * v });
        for (var i = 0; i < 3; i++) {
          noiseHit({ at: 0.01 + Math.random() * 0.05, dur: 0.012, type: 'highpass', freq: 4000, gain: 0.008 * v });
        }
      } else {
        // bare corridor concrete: flat mid thud and a scuff
        noiseHit({ dur: 0.055, freq: 520 * j, sweepTo: 200, gain: 0.065 * v });
        noiseHit({ at: 0.02, dur: 0.07, type: 'bandpass', freq: 850, q: 0.9, gain: 0.018 * v });
      }
    }

    // ---------------- Doors, by construction ----------------
    function door(style, opening) {
      if (!started || muted) return;
      var r = Math.random;
      if (style === 'roller') {
        // slat rattle climbing the guides, then the stop
        for (var i = 0; i < 22; i++) {
          var t0 = i * (0.034 + r() * 0.006);
          noiseHit({ at: t0, dur: 0.022, type: 'highpass', freq: 2200 + r() * 900, gain: 0.02 });
          if (i % 3 === 0) noiseHit({ at: t0, dur: 0.03, freq: 300, gain: 0.02 });
        }
        noiseHit({ dur: 0.9, freq: 500, sweepTo: 180, gain: 0.05, attack: 0.05 });
        tone({ at: 0.85, freq: 90, to: 55, dur: 0.25, gain: 0.06 });
      } else if (style === 'hatch') {
        // wheel ratchet, dogs release, heavy clunk with a metallic ring
        for (var k = 0; k < 7; k++) {
          noiseHit({ at: k * 0.05, dur: 0.018, type: 'highpass', freq: 3400, gain: 0.022 });
        }
        tone({ at: 0.42, freq: 60, to: 42, dur: 0.3, gain: 0.07 });
        tone({ at: 0.44, freq: 1870, dur: 0.16, gain: 0.014 });
        tone({ at: 0.44, freq: 2410, dur: 0.12, gain: 0.009 });
        noiseHit({ at: 0.42, dur: 0.2, freq: 400, sweepTo: 120, gain: 0.05 });
      } else if (style === 'steel') {
        // resonant groan, push-bar clack, and a ring off the leaf
        noiseHit({ dur: 0.6, type: 'bandpass', freq: opening ? 240 : 300, sweepTo: opening ? 380 : 170, q: 11, gain: 0.035, attack: 0.12 });
        noiseHit({ dur: 0.04, type: 'highpass', freq: 3000, gain: 0.045 });
        tone({ at: 0.48, freq: 1870, dur: 0.1, gain: 0.012 });
        tone({ at: 0.48, freq: 2740, dur: 0.08, gain: 0.008 });
        if (!opening) tone({ at: 0.5, freq: 70, to: 48, dur: 0.2, gain: 0.06 });
      } else {
        // wood: latch, stick-slip hinge squeaks, and a shut thud
        noiseHit({ dur: 0.05, type: 'highpass', freq: 2600, gain: 0.03 });
        var grains = 3 + Math.floor(r() * 2);
        var base = opening ? 520 : 780;
        for (var g2 = 0; g2 < grains; g2++) {
          var f0 = base * (opening ? (1 + g2 * 0.16) : (1 - g2 * 0.12)) * (0.92 + r() * 0.16);
          tone({
            at: 0.05 + g2 * (0.11 + r() * 0.05),
            freq: f0, to: f0 * (opening ? 1.25 : 0.8),
            dur: 0.13 + r() * 0.07, type: 'triangle', gain: 0.014,
            wobble: { rate: 13, depth: f0 * 0.06 }
          });
        }
        if (!opening) {
          tone({ at: 0.55, freq: 85, to: 55, dur: 0.16, gain: 0.05 });
          noiseHit({ at: 0.55, dur: 0.08, freq: 300, gain: 0.035 });
        }
      }
    }

    return {
      start: start,
      setRoom: setRoom,
      tick: tick,
      door: door,
      footstep: footstep,
      get started() { return started; },
      debugBeds: function () { return Object.keys(beds); },
      setMuted: function (m) {
        muted = m;
        if (!started) return;
        master.gain.setTargetAtTime(m ? 0 : 0.9, now(), 0.15);
      },
      entityStep: function (dist, chasing) {
        // wood on concrete, carrying down the corridors
        var atten = Math.max(0, 1 - dist / 42);
        if (atten <= 0.01) return;
        var v = atten * atten * (chasing ? 1.25 : 1);
        tone({ freq: 82 + Math.random() * 14, to: 46, dur: 0.16, gain: 0.14 * v });
        noiseHit({ dur: 0.09, freq: 340, sweepTo: 110, gain: 0.09 * v });
        if (dist < 9) {
          // near enough to hear the joints
          tone({ at: 0.05, freq: 620 + Math.random() * 300, to: 480, dur: 0.09, type: 'triangle', gain: 0.012 * v, wobble: { rate: 11, depth: 50 } });
        }
      },
      doorSlam: function (dist) {
        var atten = dist === undefined ? 1 : Math.max(0.12, 1 - dist / 55);
        noiseHit({ dur: 0.4, freq: 700, sweepTo: 90, gain: 0.28 * atten });
        tone({ freq: 68, to: 38, dur: 0.5, gain: 0.2 * atten });
        tone({ at: 0.03, freq: 1870, dur: 0.12, gain: 0.02 * atten });
      },
      spotted: function () {
        // it stops, and the note under everything rises
        tone({ freq: 46, to: 130, dur: 1.4, type: 'sawtooth', gain: 0.07, attack: 0.25 });
        noiseHit({ dur: 1.1, type: 'bandpass', freq: 500, sweepTo: 1600, q: 4, gain: 0.05, attack: 0.2 });
      },
      woodHit: function () {
        // a round burying itself in birch
        noiseHit({ dur: 0.07, freq: 1500, sweepTo: 300, gain: 0.14 });
        tone({ freq: 210, to: 140, dur: 0.12, type: 'triangle', gain: 0.06 });
        for (var i = 0; i < 3; i++) {
          noiseHit({ at: 0.02 + Math.random() * 0.05, dur: 0.02, type: 'highpass', freq: 3600, gain: 0.02 });
        }
      },
      death: function () {
        tone({ freq: 60, to: 24, dur: 2.2, type: 'sawtooth', gain: 0.22, attack: 0.01 });
        noiseHit({ dur: 1.6, freq: 900, sweepTo: 60, gain: 0.22 });
      },
      gunshot: function () {
        burst(0.32, 4200, 0.55, 180);
        blip(140, 0.22, 'square', 0.22, 42);
      },
      dryFire: function () { blip(1800, 0.05, 'square', 0.05); },
      pickup: function () { blip(660, 0.1, 'sine', 0.09, 990); },
      locked: function () { blip(180, 0.13, 'square', 0.09, 120); },
      unlock: function () { blip(420, 0.16, 'sine', 0.1, 720); },
      ui: function () { blip(880, 0.045, 'square', 0.04); },
      shortCircuit: function () { burst(0.7, 6000, 0.5, 120); blip(90, 0.5, 'sawtooth', 0.2, 30); },
      stinger: function () { blip(58, 2.4, 'sawtooth', 0.16, 26); burst(1.6, 700, 0.12, 90); },
      phoneDead: function () {
        blip(440, 0.4, 'sine', 0.05);
        setTimeout(function () { blip(440, 0.4, 'sine', 0.05); }, 520);
      }
    };
  }
  // -------------------------------------------------------------------
  window.startGame = function startGame(THREE, options) {
    options = options || {};
    var mount = options.mount || document.body;
    var ui = options.ui || {};

    // ---------------- Renderer ----------------
    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);
    var canvas = renderer.domElement;
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', 'First person view');

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060708);
    scene.fog = new THREE.FogExp2(0x060708, 0.035);

    var camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 90);

    // ---------------- Level ----------------
    var level = window.buildLevel(THREE, scene, renderer, camera);
    var colliders = level.colliders;

    // ---------------- The thing from the blueprint ----------------
    var entity = window.buildEntity ? window.buildEntity(THREE, { scene: scene, level: level }) : null;

    camera.position.set(level.spawn.x, STANCE.stand.eye, level.spawn.z);
    var yaw = level.spawn.yaw;
    var pitch = 0;

    // The player's own light: not a torch, just enough to read by.
    var handLight = new THREE.PointLight(0xbfd0dd, 2.0, 7.5, 2);
    scene.add(handLight);

    function applyLook() { camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
    applyLook();
    function addLook(dx, dy) {
      yaw -= dx * LOOK_SENSITIVITY;
      pitch -= dy * LOOK_SENSITIVITY;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
      applyLook();
    }

    // ---------------- Game state ----------------
    var state = {
      stance: 'stand',
      hasKey: false,
      hasGlock: false,
      ammo: 0,
      mags: 0,
      inMag: 0,
      storageOpen: false,
      wifiConnected: false,
      tvWatched: false,
      readJournal: false,
      readBlueprint: false,
      supplies: false,
      room: null,
      seenAssembly: false,
      dead: false,
      deaths: 0
    };
    var MAG_SIZE = 17;

    var audio = createAudio();

    // ---------------- Input ----------------
    var keys = { f: false, b: false, l: false, r: false, tl: false, tr: false };
    var running = false;
    var active = false;
    var pointerLocked = false;
    var pointerLockBlocked = false;
    var uiOpen = false;   // an overlay (computer, journal…) has the input

    function setStance(next) {
      if (state.stance === next) next = 'stand';
      state.stance = next;
      if (ui.onStance) ui.onStance(STANCE[state.stance].label, state.stance);
    }

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') return;              // handled by the shell
      if (uiOpen) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.f = true; break;
        case 'KeyS': case 'ArrowDown': keys.b = true; break;
        case 'KeyA': keys.l = true; break;
        case 'KeyD': keys.r = true; break;
        case 'ArrowLeft': keys.tl = true; break;
        case 'ArrowRight': keys.tr = true; break;
        case 'KeyQ': keys.tl = true; break;
        case 'KeyE': tryInteract(); break;
        case 'ShiftLeft': case 'ShiftRight': running = true; break;
        case 'ControlLeft': case 'ControlRight': case 'KeyC': setStance('crouch'); break;
        case 'KeyZ': setStance('crawl'); break;
        case 'KeyR': reload(); break;
        default: return;
      }
      if (active) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.f = false; break;
        case 'KeyS': case 'ArrowDown': keys.b = false; break;
        case 'KeyA': keys.l = false; break;
        case 'KeyD': keys.r = false; break;
        case 'ArrowLeft': keys.tl = false; break;
        case 'ArrowRight': keys.tr = false; break;
        case 'KeyQ': keys.tl = false; break;
        case 'ShiftLeft': case 'ShiftRight': running = false; break;
        default: return;
      }
    });

    function markPointerLockBlocked() {
      if (pointerLockBlocked) return;
      pointerLockBlocked = true;
      if (ui.onPointerLockBlocked) ui.onPointerLockBlocked();
    }
    function requestLock() {
      if (!active || pointerLockBlocked || !canvas.requestPointerLock) return;
      if (document.pointerLockElement === canvas) return;
      var req;
      try { req = canvas.requestPointerLock(); } catch (err) { markPointerLockBlocked(); }
      if (req && typeof req.catch === 'function') req.catch(markPointerLockBlocked);
    }
    function releaseLock() {
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    }
    document.addEventListener('pointerlockchange', function () {
      pointerLocked = document.pointerLockElement === canvas;
      if (ui.onLockChange) ui.onLockChange(pointerLocked);
    });
    document.addEventListener('pointerlockerror', markPointerLockBlocked);
    document.addEventListener('mousemove', function (e) {
      if (!pointerLocked || uiOpen) return;
      addLook(e.movementX || 0, e.movementY || 0);
    });

    var dragging = false, lastX = 0, lastY = 0, dragMoved = 0;
    canvas.addEventListener('pointerdown', function (e) {
      if (!active || uiOpen) return;
      if (pointerLocked) { shoot(); return; }
      // Pointer lock is released whenever an overlay opens; clicking the
      // world takes it back rather than dropping into drag-look for good.
      if (!pointerLockBlocked && canvas.requestPointerLock) { requestLock(); return; }
      dragging = true; dragMoved = 0;
      lastX = e.clientX; lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging || pointerLocked || uiOpen) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      addLook(dx * 2.1, dy * 2.1);
      lastX = e.clientX; lastY = e.clientY;
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      // A tap (rather than a drag) interacts — the only way to play on touch.
      if (dragMoved < 6 && active && !uiOpen) tryInteract();
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    var stick = { active: false, x: 0, y: 0, id: null };
    if (ui.stick && ui.stickNub) {
      var stickEl = ui.stick, nub = ui.stickNub, RAD = 46;
      stickEl.addEventListener('pointerdown', function (e) {
        stick.active = true; stick.id = e.pointerId;
        try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
        e.preventDefault();
      });
      stickEl.addEventListener('pointermove', function (e) {
        if (!stick.active || e.pointerId !== stick.id) return;
        var rect = stickEl.getBoundingClientRect();
        var dx = e.clientX - (rect.left + rect.width / 2);
        var dy = e.clientY - (rect.top + rect.height / 2);
        var dist = Math.hypot(dx, dy) || 1;
        var cl = Math.min(dist, RAD);
        dx = (dx / dist) * cl; dy = (dy / dist) * cl;
        stick.x = dx / RAD; stick.y = dy / RAD;
        nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        e.preventDefault();
      });
      function resetStick(e) {
        if (!stick.active) return;
        stick.active = false; stick.x = stick.y = 0;
        nub.style.transform = 'translate(0px,0px)';
        try { stickEl.releasePointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
      }
      stickEl.addEventListener('pointerup', resetStick);
      stickEl.addEventListener('pointercancel', resetStick);
    }

    // ---------------- Collision ----------------
    function collide(nx, nz) {
      var r = PLAYER_RADIUS;
      for (var i = 0; i < colliders.length; i++) {
        var c = colliders[i];
        if (c.id && level.isDoorOpen(c.id)) continue;
        // The barricade has a gap you can only take on your belly.
        if (c.id === 'barricade' && state.stance === 'crawl') continue;
        if (nx + r < c.x1 || nx - r > c.x2 || nz + r < c.z1 || nz - r > c.z2) continue;
        // Push out along the shallower axis.
        var pxLeft = (nx + r) - c.x1;
        var pxRight = c.x2 - (nx - r);
        var pzTop = (nz + r) - c.z1;
        var pzBot = c.z2 - (nz - r);
        var mx = Math.min(pxLeft, pxRight);
        var mz = Math.min(pzTop, pzBot);
        if (mx < mz) nx += (pxLeft < pxRight) ? -mx : mx;
        else nz += (pzTop < pzBot) ? -mz : mz;
      }
      return { x: nx, z: nz };
    }

    // ---------------- Interaction ----------------
    var raycaster = new THREE.Raycaster();
    raycaster.far = REACH;
    var gunRay = new THREE.Raycaster();
    gunRay.far = 60;
    var centre = new THREE.Vector2(0, 0);
    var focused = null;

    function updateFocus() {
      // setFromCamera reads camera.matrixWorld, which is only refreshed by
      // render(). Without this the interaction prompt trails the camera by
      // a frame, which is visible when you flick the mouse across an object.
      camera.updateMatrixWorld();
      raycaster.setFromCamera(centre, camera);
      var hits = raycaster.intersectObjects(level.interactables, false);
      var found = null;
      for (var i = 0; i < hits.length; i++) {
        var d = hits[i].object.userData.interact;
        if (!d) continue;
        if (d.requiresProne && state.stance !== 'crawl') continue;
        found = hits[i].object;
        break;
      }
      if (found !== focused) {
        focused = found;
        if (ui.onFocus) {
          ui.onFocus(focused ? focused.userData.interact : null, promptFor(focused));
        }
      }
    }

    function promptFor(obj) {
      if (!obj) return null;
      var d = obj.userData.interact;
      if (d.kind === 'door') {
        if (d.locked && !state.storageOpen) return state.hasKey ? 'Unlock storage unit' : 'Locked — needs a key';
        return (level.isDoorOpen(d.doorId) ? 'Close ' : 'Open ') + d.label.toLowerCase();
      }
      return d.verb + ' ' + d.label.toLowerCase();
    }

    function tryInteract() {
      if (!focused || !active) return;
      var d = focused.userData.interact;
      var say = ui.onMessage || function () {};
      if (d.kind === 'door') {
        if (d.locked && !state.storageOpen) {
          if (!state.hasKey) {
            if (audio) audio.locked();
            say('Locked. There is a keyhole, and no key in it.');
            return;
          }
          state.storageOpen = true;
          if (audio) audio.unlock();
          if (audio) audio.door('roller', true);
          say('The lock turns. The shutter rolls up on a smell you will not forget.');
          level.toggleDoor(d.doorId);
          updateFocus();
          return;
        }
        var nowOpen = level.toggleDoor(d.doorId);
        if (audio) audio.door(d.sound || 'wood', nowOpen);
        updateFocus();
        return;
      }
      switch (d.id) {
        case 'wifiNote':
          if (audio) audio.ui();
          if (ui.showNote) ui.showNote();
          break;
        case 'computer':
          if (audio) audio.ui();
          if (ui.showComputer) ui.showComputer(state.wifiConnected);
          break;
        case 'entranceDoor':
          if (audio) audio.locked();
          say('The glass does not move. Whatever is on the other side, you cannot see it.');
          break;
        case 'phone':
          if (audio) audio.phoneDead();
          say('You lift the receiver. Two tones, then nothing. The line is dead.');
          break;
        case 'newspaper':
          say('Local section, three weeks old. A coffee ring has eaten most of the front page.');
          break;
        case 'storageKey':
          state.hasKey = true;
          focused.visible = false;
          if (audio) audio.pickup();
          say('You take the key. Stamped: STORAGE.');
          refreshHud();
          break;
        case 'journal':
          state.readJournal = true;
          if (ui.showJournal) ui.showJournal();
          break;
        case 'glock':
          state.hasGlock = true;
          state.mags = 2;
          state.inMag = MAG_SIZE;
          state.ammo = MAG_SIZE * 2;
          focused.visible = false;
          if (audio) audio.pickup();
          say('Glock 19, and two magazines. Thirty-four rounds. There will not be more.');
          refreshHud();
          if (entity) {
            entity.activate();
            if (audio) audio.doorSlam(40);
            setTimeout(function () {
              if (ui.onMessage) ui.onMessage('Somewhere far away, a door slams open.');
            }, 1400);
          }
          break;
        case 'blueprint':
          state.readBlueprint = true;
          if (ui.showBlueprint) ui.showBlueprint();
          break;
        case 'fragment':
          say('A splinter of pale birchwood, dense as bone. One end is scorched. The other is sharpened.');
          break;
        case 'bones':
          say('Fossil casts, mounted and labelled. Somebody paid a great deal for these.');
          break;
        case 'embeddedDoor':
          say('The office door is buried halfway into the wall. It was not opened. It was thrown.');
          break;
        case 'cage':
          say('HOLDING — SUBJECT SECURE. The bars are bent outward. It was not let out.');
          break;
        case 'supplies':
          state.supplies = true;
          if (audio) audio.pickup();
          say('Water, and a few cans of beans. Exactly what Nick ran out of.');
          refreshHud();
          break;
        default:
          say(d.label);
      }
      updateFocus();
    }

    // ---------------- Weapon ----------------
    function shoot() {
      if (!state.hasGlock || uiOpen) return;
      if (state.inMag <= 0) {
        if (audio) audio.dryFire();
        if (ui.onMessage) ui.onMessage(state.ammo > 0 ? 'Empty. Reload with R.' : 'Empty. There is no more ammunition.');
        return;
      }
      state.inMag--;
      state.ammo--;
      if (audio) audio.gunshot();
      if (ui.onMuzzleFlash) ui.onMuzzleFlash();
      if (entity) {
        camera.updateMatrixWorld();
        gunRay.setFromCamera(centre, camera);
        var hitList = gunRay.intersectObject(entity.group, true);
        if (hitList.length > 0 && hitList[0].distance < 45) {
          if (entity.hitShot()) {
            if (audio) setTimeout(function () { audio.woodHit(); }, 40);
            if (ui.onMessage) ui.onMessage('The round buries itself in the wood. It does not fall.');
          }
        }
      }
      refreshHud();
    }
    function reload() {
      if (!state.hasGlock) return;
      if (state.inMag >= MAG_SIZE) return;
      var pool = state.ammo - state.inMag;
      if (pool <= 0) { if (ui.onMessage) ui.onMessage('No magazines left.'); return; }
      var need = MAG_SIZE - state.inMag;
      var take = Math.min(need, pool);
      state.inMag += take;
      if (audio) audio.ui();
      if (ui.onMessage) ui.onMessage('Reloaded.');
      refreshHud();
    }

    function refreshHud() {
      if (ui.onHud) ui.onHud({
        hasGlock: state.hasGlock,
        inMag: state.inMag,
        ammo: state.ammo,
        hasKey: state.hasKey,
        supplies: state.supplies
      });
    }

    // ---------------- Entity hooks ----------------
    function die() {
      if (state.dead) return;
      state.dead = true;
      state.deaths++;
      active = false;
      keys.f = keys.b = keys.l = keys.r = keys.tl = keys.tr = false;
      if (audio) audio.death();
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
      if (ui.onDeath) ui.onDeath(state.deaths);
    }

    if (entity) {
      entity.onCaught = function () { die(); };
      entity.onStep = function (dist, chasing) { if (audio) audio.entityStep(dist, chasing); };
      entity.onDoorSlam = function () {
        if (!audio) return;
        var es = entity.getState();
        var d = Math.hypot(es.x - camera.position.x, es.z - camera.position.z);
        audio.doorSlam(d);
      };
      entity.onSpotted = function (first) {
        if (audio) audio.spotted();
        if (first && ui.onMessage) ui.onMessage('It has seen you.');
      };
    }

    // ---------------- Wi-Fi / TV hooks used by the shell ----------------
    window.__onWifiConnected = function () {
      state.wifiConnected = true;
      if (window.__startTv) window.__startTv();
      if (audio) audio.ui();
      if (ui.onMessage) ui.onMessage('Connected. Behind you, one of the screens wakes up.');
    };
    window.__onTvShort = function () {
      state.tvWatched = true;
      if (audio) audio.shortCircuit();
      if (ui.onMessage) ui.onMessage('The screen shorts out. The room is quieter than it was.');
    };

    // ---------------- Loop ----------------
    var clock = new THREE.Clock();
    var velocity = new THREE.Vector3();
    var bobTime = 0, stepAccum = 0, eyeCurrent = STANCE.stand.eye;
    var focusTimer = 0, cullTimer = 0;
    var ACTIVE_LIGHTS = 6;
    level.cullLights(camera.position, ACTIVE_LIGHTS);

    function tick() {
      requestAnimationFrame(tick);
      var dt = Math.min(clock.getDelta(), 0.05);
      var elapsed = clock.elapsedTime;

      if (active && !uiOpen) {
        var inputX = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + stick.x;
        var inputZ = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) - stick.y;
        var len = Math.hypot(inputX, inputZ);
        if (len > 1) { inputX /= len; inputZ /= len; }

        if (keys.tl) yaw += 1.7 * dt;
        if (keys.tr) yaw -= 1.7 * dt;
        if (keys.tl || keys.tr) applyLook();

        var st = STANCE[state.stance];
        var speed = st.speed * (running && state.stance === 'stand' ? 1.7 : 1);
        var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        var rx = Math.cos(yaw), rz = -Math.sin(yaw);
        var tx = (fx * inputZ + rx * inputX) * speed;
        var tz = (fz * inputZ + rz * inputX) * speed;

        var damp = 1 - Math.exp(-11 * dt);
        velocity.x += (tx - velocity.x) * damp;
        velocity.z += (tz - velocity.z) * damp;

        var resolved = collide(camera.position.x + velocity.x * dt, camera.position.z + velocity.z * dt);
        camera.position.x = resolved.x;
        camera.position.z = resolved.z;

        var moved = Math.hypot(velocity.x, velocity.z);

        // footsteps
        stepAccum += moved * dt;
        var stride = state.stance === 'crawl' ? 0.75 : state.stance === 'crouch' ? 0.62 : 0.78;
        if (stepAccum > stride) {
          stepAccum = 0;
          if (audio && state.room) audio.footstep(state.room.tone, state.stance);
        }

        if (!prefersReducedMotion) {
          bobTime += dt * moved * 2.2;
          eyeCurrent += (st.eye - eyeCurrent) * (1 - Math.exp(-9 * dt));
          camera.position.y = eyeCurrent + Math.sin(bobTime * 2) * 0.02 + Math.sin(bobTime) * 0.011;
        } else {
          eyeCurrent += (st.eye - eyeCurrent) * (1 - Math.exp(-9 * dt));
          camera.position.y = eyeCurrent;
        }

        // room tracking → audio bed + HUD label
        var r = level.roomAt(camera.position.x, camera.position.z);
        if (r !== state.room) {
          state.room = r;
          if (r) {
            if (audio) audio.setRoom(r.id);
            if (ui.onRoom) ui.onRoom(r.name);
            if (r.id === 'assembly' && !state.seenAssembly) {
              state.seenAssembly = true;
              if (audio) audio.stinger();
              if (ui.onMessage) ui.onMessage('Something in here is still warm.');
            }
          }
        }

        focusTimer += dt;
        if (focusTimer > 0.08) { focusTimer = 0; updateFocus(); }

        if (audio) audio.tick(dt, state.room ? state.room.id : null);

        if (entity) entity.update(dt, camera.position.x, camera.position.z);
      }

      handLight.position.copy(camera.position);

      cullTimer += dt;
      if (cullTimer > 0.2) {
        cullTimer = 0;
        level.cullLights(camera.position, ACTIVE_LIGHTS);
      }

      for (var i = 0; i < level.updates.length; i++) level.updates[i](dt, elapsed);

      renderer.render(scene, camera);
    }
    tick();

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
        if (audio) {
          audio.start();
          var r = level.roomAt(camera.position.x, camera.position.z);
          if (r) audio.setRoom(r.id);
        }
        requestLock();
        refreshHud();
      },
      exit: function () {
        active = false;
        keys.f = keys.b = keys.l = keys.r = keys.tl = keys.tr = false;
        if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
      },
      setUiOpen: function (open) {
        uiOpen = open;
        if (open) {
          keys.f = keys.b = keys.l = keys.r = keys.tl = keys.tr = false;
          // While the mouse is locked to the canvas the browser routes every
          // click there, so an open overlay would be unclickable.
          releaseLock();
        } else {
          requestLock();
        }
      },
      respawn: function () {
        state.dead = false;
        camera.position.set(level.spawn.x, STANCE.stand.eye, level.spawn.z);
        yaw = level.spawn.yaw; pitch = 0;
        applyLook();
        velocity.set(0, 0, 0);
        state.stance = 'stand';
        if (entity) entity.reset();
        state.room = level.roomAt(camera.position.x, camera.position.z);
        if (audio && state.room) audio.setRoom(state.room.id);
      },
      toggleMute: function () {
        var m = !window.__muted;
        window.__muted = m;
        if (audio) audio.setMuted(m);
        return m;
      },
      interact: tryInteract,
      get isActive() { return active; },
      get pointerLockBlocked() { return pointerLockBlocked; },
      getState: function () {
        return {
          yaw: yaw, pitch: pitch,
          x: camera.position.x, z: camera.position.z, y: camera.position.y,
          stance: state.stance,
          room: state.room ? state.room.id : null,
          active: active, locked: pointerLocked, uiOpen: uiOpen,
          pointerLockBlocked: pointerLockBlocked,
          hasKey: state.hasKey, storageOpen: state.storageOpen,
          hasGlock: state.hasGlock, ammo: state.ammo, inMag: state.inMag,
          wifiConnected: state.wifiConnected, tvWatched: state.tvWatched,
          dead: state.dead, deaths: state.deaths,
          entity: entity ? entity.getState() : null,
          focus: focused ? focused.userData.interact.id : null
        };
      },
      // test/debug helpers
      forceEntity: function (x, z, m) { if (entity) entity.force(x, z, m); },
      entityInfo: function () {
        if (!entity) return null;
        var b = new THREE.Box3().setFromObject(entity.group);
        var v = new THREE.Vector3();
        b.getSize(v);
        return { h: v.y, w: v.x };
      },
      fire: function () { shoot(); },
      renderInfo: function () {
        return {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          programs: renderer.info.programs ? renderer.info.programs.length : -1,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          lights: level.lightCount
        };
      },
      teleport: function (x, z) {
        camera.position.x = x; camera.position.z = z;
        state.room = level.roomAt(x, z);
      },
      // Point the camera at a world position, using the same yaw/pitch the
      // player controls drive, so tests exercise the real raycast path.
      aimAt: function (x, y, z) {
        var dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z;
        yaw = Math.atan2(-dx, -dz);
        pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(dy, Math.hypot(dx, dz))));
        applyLook();
        updateFocus();
      },
      // How many props actually landed in a given patch of floor. Guards
      // against geometry that is built but never parented into the scene.
      meshesNear: function (x, z, radius) {
        var n = 0, v = new THREE.Vector3();
        scene.traverse(function (o) {
          if (!o.isMesh) return;
          o.getWorldPosition(v);
          if (Math.hypot(v.x - x, v.z - z) <= radius) n++;
        });
        return n;
      },
      isDoorOpen: function (id) { return level.isDoorOpen(id); },
      audioBeds: function () { return audio && audio.started ? audio.debugBeds() : []; },
      doorSounds: function () {
        var out = {};
        for (var i = 0; i < level.interactables.length; i++) {
          var d = level.interactables[i].userData.interact;
          if (d.kind === 'door') out[d.doorId] = d.sound || null;
        }
        return out;
      },
      // World-space extent of a door leaf. A leaf hung the wrong way round
      // still blocks correctly (the collider is separate) but sticks out
      // through the room, so its orientation needs asserting numerically.
      doorBounds: function (id) {
        var b = new THREE.Box3(), found = false;
        for (var i = 0; i < level.interactables.length; i++) {
          var o = level.interactables[i];
          var d = o.userData.interact;
          if (d.kind !== 'door' || d.doorId !== id) continue;
          o.updateWorldMatrix(true, false);
          b.expandByObject(o);
          found = true;
        }
        if (!found) return null;
        var size = new THREE.Vector3();
        b.getSize(size);
        return { x: size.x, y: size.y, z: size.z };
      },
      doorIds: function () { return level.doorIds(); },
      interactablePos: function (id) {
        for (var i = 0; i < level.interactables.length; i++) {
          var o = level.interactables[i];
          if (o.userData.interact.id === id) {
            var v = new THREE.Vector3();
            o.getWorldPosition(v);
            return { x: v.x, y: v.y, z: v.z };
          }
        }
        return null;
      },
      forceStance: function (s) { state.stance = s; if (ui.onStance) ui.onStance(STANCE[s].label, s); }
    };
  };
})();
