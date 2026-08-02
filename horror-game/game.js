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
    var motionBed = null, whisperBed = null;
    var creakClock = 0;

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
    // The gear layer: a wound whine plus a low metal groan, both always
    // running and both gated to silence by a single gain, so the thing
    // fades in as it comes down the corridor rather than snapping on.
    function makeMotion() {
      var g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);

      var whine = ctx.createOscillator();
      whine.type = 'sawtooth';
      whine.frequency.value = 128;
      var wf = ctx.createBiquadFilter();
      wf.type = 'bandpass'; wf.frequency.value = 1100; wf.Q.value = 5.5;
      var wg = ctx.createGain(); wg.gain.value = 0.022;
      whine.connect(wf); wf.connect(wg); wg.connect(g);
      whine.start();

      var groan = ctx.createOscillator();
      groan.type = 'triangle';
      groan.frequency.value = 47;
      var gg2 = ctx.createGain(); gg2.gain.value = 0.05;
      groan.connect(gg2); gg2.connect(g);
      groan.start();

      // a slow wobble on the groan so it never sits still
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.23;
      var lg = ctx.createGain(); lg.gain.value = 6;
      lfo.connect(lg); lg.connect(groan.frequency);
      lfo.start();

      return { gain: g, whine: whine, creakRate: 0.5, near: 0 };
    }

    // Whispering: bandpassed noise pushed through a moving formant, which
    // lands somewhere between breath and a voice you cannot quite make out.
    function makeWhisper() {
      var g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);

      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(5);
      src.loop = true;

      var f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass'; f1.frequency.value = 720; f1.Q.value = 7;
      var f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 1980; f2.Q.value = 9;
      var g1 = ctx.createGain(); g1.gain.value = 0.5;
      var g2 = ctx.createGain(); g2.gain.value = 0.3;
      src.connect(f1); f1.connect(g1); g1.connect(g);
      src.connect(f2); f2.connect(g2); g2.connect(g);
      src.start();

      // the formants drift, which is what makes it read as almost-words
      var lfo1 = ctx.createOscillator(); lfo1.frequency.value = 1.7;
      var l1 = ctx.createGain(); l1.gain.value = 260;
      lfo1.connect(l1); l1.connect(f1.frequency); lfo1.start();
      var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.9;
      var l2 = ctx.createGain(); l2.gain.value = 620;
      lfo2.connect(l2); l2.connect(f2.frequency); lfo2.start();

      // and it breathes, in and out, under all of it
      var breath = ctx.createOscillator(); breath.frequency.value = 0.31;
      var bg = ctx.createGain(); bg.gain.value = 0.42;
      breath.connect(bg); bg.connect(g1.gain); breath.start();

      return { gain: g };
    }

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

    var muzak = null, muzakSrc = null;
    function buildMuzak() {
      // four bars of classic mediocre pop, straight off a demo keyboard
      var off = new OfflineAudioContext(1, 44100 * 7.5, 44100);
      var CHORDS = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
      for (var bar = 0; bar < 4; bar++) {
        var t0 = bar * 1.85;
        CHORDS[bar].forEach(function (f) {
          var o = off.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          var g = off.createGain();
          g.gain.setValueAtTime(0.045, t0);
          g.gain.linearRampToValueAtTime(0.03, t0 + 1.7);
          o.connect(g); g.connect(off.destination);
          o.start(t0); o.stop(t0 + 1.82);
        });
        var b2 = off.createOscillator();
        b2.type = 'sine';
        b2.frequency.value = CHORDS[bar][0] / 2;
        var bg = off.createGain();
        for (var beat = 0; beat < 4; beat++) {
          bg.gain.setValueAtTime(0.09, t0 + beat * 0.46);
          bg.gain.exponentialRampToValueAtTime(0.02, t0 + beat * 0.46 + 0.4);
        }
        b2.connect(bg); bg.connect(off.destination);
        b2.start(t0); b2.stop(t0 + 1.85);
        // the world's least ambitious drum machine
        for (var h = 0; h < 8; h++) {
          var nb = off.createBufferSource();
          var buf = off.createBuffer(1, 1200, 44100);
          var dd = buf.getChannelData(0);
          for (var n2 = 0; n2 < 1200; n2++) dd[n2] = (Math.random() * 2 - 1) * (1 - n2 / 1200);
          nb.buffer = buf;
          var hg = off.createGain();
          hg.gain.value = h % 2 === 0 ? 0.05 : 0.028;
          nb.connect(hg); hg.connect(off.destination);
          nb.start(t0 + h * 0.23);
        }
      }
      return off.startRendering();
    }

    function start() {
      if (started) return;
      started = true;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      muzak = ctx.createGain();
      muzak.gain.value = 0;
      var mf = ctx.createBiquadFilter();
      mf.type = 'lowpass';
      mf.frequency.value = 2600;
      muzak.connect(mf); mf.connect(master);
      buildMuzak().then(function (buf) {
        muzakSrc = ctx.createBufferSource();
        muzakSrc.buffer = buf;
        muzakSrc.loop = true;
        muzakSrc.connect(muzak);
        muzakSrc.start();
        if (phase === 'pop') muzak.gain.setTargetAtTime(0.85, now(), 0.5);
      });

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

    var phase = 'pop';
    function setRoom(id) {
      currentRoom = id;
      if (!started) return;
      Object.keys(beds).forEach(function (k) {
        beds[k].gain.setTargetAtTime(phase === 'eerie' && k === id ? 1 : 0, now(), 1.1);
      });
      nextAmbient = ambientDelay(id) * 0.5;
    }
    function setPhase(p) {
      if (phase === p) return;
      phase = p;
      if (!started) return;
      if (p === 'eerie') {
        // the tape dies: pitch sags, then nothing but the building
        if (muzakSrc) {
          muzakSrc.playbackRate.setTargetAtTime(0.4, now(), 0.8);
        }
        if (muzak) muzak.gain.setTargetAtTime(0, now(), 1.2);
        setRoom(currentRoom);
      } else if (muzak) {
        muzak.gain.setTargetAtTime(0.85, now(), 0.5);
      }
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
      if (!started || muted) return;
      // Individual joint creaks, laid over the continuous gear layer. These
      // run whatever the room is doing — the thing is louder than the
      // building it is walking through.
      if (motionBed && motionBed.creakRate > 0 && motionBed.near > 0.02) {
        creakClock -= dt * motionBed.creakRate;
        if (creakClock <= 0) {
          creakClock = 0.55 + Math.random() * 0.9;
          var cv = motionBed.near * motionBed.near;
          noiseHit({ dur: 0.16 + Math.random() * 0.2, type: 'bandpass',
            freq: 380 + Math.random() * 900, q: 7 + Math.random() * 6, gain: 0.085 * cv });
          tone({ freq: 210 + Math.random() * 160, to: 120, dur: 0.3, type: 'sawtooth',
            gain: 0.02 * cv, wobble: { rate: 9 + Math.random() * 8, depth: 40 } });
        }
      }
      if (!roomId) return;
      if (phase !== 'eerie') return;   // the building holds its breath until the pop dies
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
        // carpet: heel pad, then the toe settling
        noiseHit({ dur: 0.07, freq: 300 * j, sweepTo: 140, gain: 0.05 * v });
        noiseHit({ at: 0.07, dur: 0.05, freq: 240 * j, sweepTo: 120, gain: 0.024 * v });
        noiseHit({ at: 0.012, dur: 0.05, type: 'highpass', freq: 3400, gain: 0.006 * v });
      } else if (surface === 'tile') {
        // hard heel click, a faint ring, and the room slapping it back
        noiseHit({ dur: 0.035, type: 'bandpass', freq: 3200 * j, q: 1.4, gain: 0.075 * v });
        noiseHit({ at: 0.075, dur: 0.03, type: 'bandpass', freq: 2500 * j, q: 1.4, gain: 0.035 * v });
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
        // bare corridor concrete: heel, toe, and a scuff
        noiseHit({ dur: 0.055, freq: 520 * j, sweepTo: 200, gain: 0.065 * v });
        noiseHit({ at: 0.065, dur: 0.045, freq: 420 * j, sweepTo: 170, gain: 0.03 * v });
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
      // ---- the two continuous layers the Birch brings with it ----
      // A body of wood on metal joints does not move silently: gears taking
      // up slack, a wound spring, and the long creak of something too tall
      // leaning through a doorway. Driven every frame from its distance.
      setMotion: function (dist, moving, hunting) {
        if (!started) return;
        if (!motionBed) motionBed = makeMotion();
        var near = Math.max(0, 1 - dist / 34);
        var amt = moving ? near * near : near * near * 0.16;
        motionBed.gain.gain.setTargetAtTime(amt * (hunting ? 1.35 : 0.85), now(), 0.18);
        // the gear whine rises as it hurries
        motionBed.whine.frequency.setTargetAtTime(
          moving ? (hunting ? 290 : 190) : 128, now(), 0.35);
        motionBed.creakRate = moving ? (hunting ? 5.5 : 2.4) : 0.5;
        motionBed.near = near;
      },
      // Whispering. Not words — nearly words, which is worse. It comes up
      // when it is hunting you and you are the one making the noise.
      setWhisper: function (amount) {
        if (!started) return;
        if (!whisperBed) whisperBed = makeWhisper();
        whisperBed.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, amount)) * 0.5, now(), 0.5);
      },
      // shot, and it does not like it
      scream: function (dist) {
        var a = Math.max(0.25, 1 - (dist || 8) / 40);
        tone({ freq: 900, to: 210, dur: 1.5, type: 'sawtooth', gain: 0.16 * a, wobble: { rate: 17, depth: 190 } });
        tone({ at: 0.04, freq: 1340, to: 320, dur: 1.3, type: 'square', gain: 0.055 * a, wobble: { rate: 23, depth: 260 } });
        noiseHit({ dur: 1.4, type: 'bandpass', freq: 1500, sweepTo: 420, q: 2.2, gain: 0.13 * a, attack: 0.05 });
        tone({ at: 0.2, freq: 62, to: 40, dur: 1.1, gain: 0.1 * a });
      },
      // eleven feet of mannequin folding itself into a 560mm duct
      ventSqueeze: function (dist) {
        var a = Math.max(0.2, 1 - (dist || 8) / 36);
        for (var i = 0; i < 7; i++) {
          noiseHit({ at: i * 0.16, dur: 0.19, type: 'bandpass', freq: 900 + Math.random() * 1800, q: 6, gain: 0.09 * a });
        }
        tone({ freq: 148, to: 96, dur: 1.25, type: 'sawtooth', gain: 0.05 * a, wobble: { rate: 6, depth: 30 } });
        noiseHit({ at: 0.9, dur: 0.35, freq: 420, sweepTo: 120, gain: 0.12 * a });
      },
      // your own lungs, and the noise you make without deciding to
      panic: function (hard) {
        noiseHit({ dur: hard ? 0.34 : 0.24, type: 'bandpass', freq: 620, sweepTo: 300, q: 1.6, gain: hard ? 0.075 : 0.045 });
        tone({ freq: hard ? 210 : 160, to: 108, dur: 0.3, type: 'sawtooth', gain: hard ? 0.035 : 0.018 });
      },
      windup: function (dist) {
        // gears taking up slack before it moves
        var a = Math.max(0.1, 1 - (dist || 10) / 45);
        for (var i = 0; i < 9; i++) {
          noiseHit({ at: i * 0.07, dur: 0.02, type: 'highpass', freq: 2800 + i * 140, gain: 0.02 * a });
        }
        tone({ dur: 0.7, freq: 160, to: 340, type: 'triangle', gain: 0.02 * a, attack: 0.2 });
      },
      bang: function (dist) {
        var a = Math.max(0.15, 1 - (dist || 10) / 50);
        for (var i = 0; i < 3; i++) {
          noiseHit({ at: i * 0.4, dur: 0.3, freq: 600, sweepTo: 80, gain: 0.3 * a });
          tone({ at: i * 0.4, freq: 55, to: 34, dur: 0.4, gain: 0.22 * a });
        }
      },
      zap: function () {
        noiseHit({ dur: 1.2, type: 'highpass', freq: 2400, gain: 0.16 });
        tone({ dur: 1.1, freq: 120, type: 'square', gain: 0.07, wobble: { rate: 30, depth: 60 } });
      },
      rifle: function () {
        // a hunting rifle indoors: an enormous crack and a long tail
        noiseHit({ dur: 0.6, freq: 6000, sweepTo: 120, gain: 0.75 });
        tone({ freq: 130, to: 26, dur: 0.55, type: 'square', gain: 0.32 });
        noiseHit({ at: 0.12, dur: 1.1, freq: 800, sweepTo: 90, gain: 0.12, attack: 0.1 });
      },
      boltCycle: function () {
        noiseHit({ dur: 0.03, type: 'highpass', freq: 3200, gain: 0.05 });
        tone({ at: 0.02, freq: 1870, dur: 0.05, gain: 0.014 });
      },
      magOut: function () { noiseHit({ dur: 0.05, type: 'highpass', freq: 2200, gain: 0.05 }); },
      magIn: function () {
        noiseHit({ dur: 0.04, type: 'highpass', freq: 2600, gain: 0.06 });
        tone({ at: 0.03, freq: 240, dur: 0.06, gain: 0.05 });
      },
      shellIn: function () {
        noiseHit({ dur: 0.03, type: 'bandpass', freq: 1400, q: 2, gain: 0.05 });
        tone({ freq: 420, dur: 0.05, gain: 0.02 });
      },
      scream: function (dist) {
        // wood should not be able to make this noise
        var a = Math.max(0.2, 1 - (dist || 10) / 60);
        tone({ freq: 1150, to: 420, dur: 1.5, type: 'sawtooth', gain: 0.16 * a, wobble: { rate: 22, depth: 160 } });
        tone({ at: 0.1, freq: 1560, to: 700, dur: 1.2, type: 'square', gain: 0.05 * a, wobble: { rate: 31, depth: 220 } });
        noiseHit({ dur: 1.4, type: 'bandpass', freq: 1900, q: 2.5, gain: 0.09 * a, attack: 0.05 });
      },
      doorBash: function (dist) {
        var a = Math.max(0.15, 1 - (dist || 10) / 55);
        noiseHit({ dur: 0.5, freq: 1200, sweepTo: 90, gain: 0.4 * a });
        tone({ freq: 60, to: 30, dur: 0.6, gain: 0.28 * a });
        for (var i = 0; i < 6; i++) {
          noiseHit({ at: 0.04 + i * 0.03, dur: 0.05, type: 'bandpass', freq: 900 + Math.random() * 1400, q: 3, gain: 0.08 * a });
        }
      },
      shotgun: function () {
        noiseHit({ dur: 0.5, freq: 5200, sweepTo: 140, gain: 0.7 });
        tone({ freq: 110, to: 30, dur: 0.4, type: 'square', gain: 0.3 });
      },
      consume: function (kind) {
        if (kind === 'water') { for (var i = 0; i < 3; i++) tone({ at: i * 0.24, freq: 320 - i * 40, dur: 0.1, gain: 0.05 }); }
        else if (kind === 'beans') { noiseHit({ dur: 0.3, freq: 900, sweepTo: 300, gain: 0.05 }); }
        else { noiseHit({ dur: 0.5, type: 'highpass', freq: 3000, gain: 0.045 }); tone({ freq: 660, to: 880, dur: 0.3, gain: 0.03 }); }
      },
      vomit: function () { noiseHit({ dur: 0.7, freq: 700, sweepTo: 200, gain: 0.1 }); },
      flush: function () { noiseHit({ dur: 1.6, freq: 1400, sweepTo: 300, gain: 0.09, attack: 0.15 }); },
      ventBreak: function () {
        noiseHit({ dur: 0.3, freq: 2000, sweepTo: 300, gain: 0.2 });
        for (var i = 0; i < 5; i++) tone({ at: 0.05 + i * 0.05, freq: 1400 + i * 300, dur: 0.06, gain: 0.02 });
        tone({ at: 0.3, freq: 140, to: 60, dur: 0.3, gain: 0.1 });
      },
      ventCrawl: function () {
        for (var i = 0; i < 8; i++) {
          noiseHit({ at: i * 0.22, dur: 0.1, freq: 500 + Math.random() * 400, sweepTo: 200, gain: 0.05 });
          tone({ at: i * 0.22, freq: 90 + Math.random() * 40, dur: 0.12, gain: 0.03 });
        }
      },
      ventScramble: function (dist) {
        var a = Math.max(0.1, 1 - (dist || 20) / 50);
        for (var i = 0; i < 10; i++) {
          noiseHit({ at: i * 0.09, dur: 0.05, type: 'bandpass', freq: 700 + Math.random() * 900, q: 3, gain: 0.04 * a });
        }
      },
      setPhase: setPhase,
      engineNode: null,
      engine: function (on) {
        if (!started) return;
        if (on && !this.engineNode) {
          var g = ctx.createGain();
          g.gain.value = 0;
          g.connect(master);
          var o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = 42;
          var og = ctx.createGain(); og.gain.value = 0.12;
          o.connect(og); og.connect(g); o.start();
          var l = ctx.createOscillator(); l.frequency.value = 9;
          var lg = ctx.createGain(); lg.gain.value = 5;
          l.connect(lg); lg.connect(o.frequency); l.start();
          var nb = ctx.createBufferSource();
          nb.buffer = noiseBuffer(3); nb.loop = true;
          var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 210;
          var ng = ctx.createGain(); ng.gain.value = 0.16;
          nb.connect(f); f.connect(ng); ng.connect(g); nb.start();
          g.gain.setTargetAtTime(0.7, now(), 0.6);
          this.engineNode = g;
        } else if (!on && this.engineNode) {
          this.engineNode.gain.setTargetAtTime(0, now(), 0.5);
          this.engineNode = null;
        }
      },
      brakes: function () {
        noiseHit({ dur: 0.9, type: 'highpass', freq: 2800, gain: 0.14, attack: 0.02 });
        noiseHit({ at: 0.1, dur: 0.5, freq: 300, sweepTo: 90, gain: 0.1 });
      },
      glassBang: function () {
        tone({ freq: 90, to: 55, dur: 0.2, gain: 0.24 });
        noiseHit({ dur: 0.12, type: 'bandpass', freq: 900, q: 3, gain: 0.2 });
        tone({ at: 0.01, freq: 1870, dur: 0.25, gain: 0.03 });
        tone({ at: 0.01, freq: 2740, dur: 0.2, gain: 0.02 });
      },
      sealSlam: function () {
        noiseHit({ dur: 0.5, freq: 900, sweepTo: 70, gain: 0.4 });
        tone({ freq: 50, to: 30, dur: 0.7, gain: 0.3 });
        tone({ at: 0.05, freq: 1870, dur: 0.2, gain: 0.03 });
      },
      entityStep: function (dist, chasing) {
        // wood on concrete, carrying down the corridors
        var atten = Math.max(0, 1 - dist / 42);
        if (atten <= 0.01) return;
        var v = atten * atten * (chasing ? 1.25 : 1);
        tone({ freq: 82 + Math.random() * 14, to: 46, dur: 0.16, gain: 0.14 * v });
        noiseHit({ dur: 0.09, freq: 340, sweepTo: 110, gain: 0.09 * v });
        // the gears, always — a small ratchet under every step
        noiseHit({ at: 0.03, dur: 0.014, type: 'highpass', freq: 3400, gain: 0.02 * v });
        noiseHit({ at: 0.055, dur: 0.012, type: 'highpass', freq: 3900, gain: 0.014 * v });
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

    // ---------------- First-person weapons ----------------
    scene.add(camera);   // children of the camera need it in the graph
    var viewRoot = new THREE.Group();
    viewRoot.position.set(0.24, -0.22, -0.45);
    camera.add(viewRoot);
    var weapons = window.buildWeapons(THREE, { camera: camera, viewRoot: viewRoot, scene: scene });
    function updateViewmodel() {
      var id = state.hotbar[state.hotbarSel];
      if (id && (ITEM_DEFS[id].kind === 'weapon' || id === 'camera' || id === 'flashlight')) weapons.select(id);
      else weapons.select(null);
    }

    // Where does this shot actually stop? Walls, closed doors and seals,
    // in 2D, then projected along the true aim.
    function wallHitDistance(ox, oz, dx, dz) {
      var best = 60;
      function slab(b) {
        var tmin = -Infinity, tmax = Infinity;
        if (Math.abs(dx) < 1e-9) { if (ox < b.x1 || ox > b.x2) return; }
        else {
          var t1 = (b.x1 - ox) / dx, t2 = (b.x2 - ox) / dx;
          tmin = Math.max(tmin, Math.min(t1, t2));
          tmax = Math.min(tmax, Math.max(t1, t2));
        }
        if (Math.abs(dz) < 1e-9) { if (oz < b.z1 || oz > b.z2) return; }
        else {
          var t3 = (b.z1 - oz) / dz, t4 = (b.z2 - oz) / dz;
          tmin = Math.max(tmin, Math.min(t3, t4));
          tmax = Math.min(tmax, Math.max(t3, t4));
        }
        if (tmax >= tmin && tmin > 0.05 && tmin < best) best = tmin;
      }
      for (var i = 0; i < level.wallBoxes.length; i++) slab(level.wallBoxes[i]);
      for (var j = 0; j < level.colliders.length; j++) {
        var c = level.colliders[j];
        if (!c.id) continue;
        if (c.id.indexOf('seal') === 0) { if (state.seals[c.id]) slab(c); continue; }
        if (c.id === 'entrance' && !state.entranceOpen) { slab(c); continue; }
        if (!level.isDoorOpen(c.id)) slab(c);
      }
      return best;
    }

    // The player's own light: not a torch, just enough to read by.
    var handLight = new THREE.PointLight(0xbfd0dd, 2.0, 7.5, 2);
    scene.add(handLight);

    // The torch off the reception desk. Parented to the camera so it always
    // points where you are looking, and it stays lit while you hold a gun —
    // a light you have to put away to shoot is a light nobody uses.
    var torchBeam = new THREE.SpotLight(0xf2f6ff, 0, 26, 0.42, 0.45, 1.4);
    torchBeam.position.set(0.12, -0.1, 0);
    var torchTarget = new THREE.Object3D();
    torchTarget.position.set(0.12, -0.1, -12);
    camera.add(torchTarget);
    torchBeam.target = torchTarget;
    camera.add(torchBeam);
    // a soft near-field wash, so your own feet are not pitch black
    var torchSpill = new THREE.PointLight(0xdfe8f4, 0, 5.5, 2);
    torchSpill.position.set(0.1, -0.1, -0.4);
    camera.add(torchSpill);

    function setTorch(on) {
      if (!state.hasFlashlight) return false;
      state.torchOn = !!on;
      torchBeam.intensity = state.torchOn ? 34 : 0;
      torchSpill.intensity = state.torchOn ? 1.5 : 0;
      if (audio) audio.ui();
      refreshHud();
      return state.torchOn;
    }

    // ---------------- The body you're wearing ----------------
    // Blue intern tee, white pants that have already had a day. It lives on
    // layer 1, which the player's own camera does not render — otherwise
    // you would be looking at the inside of your own head — while mirrors
    // and the security feeds do. Walking it is driven from the move loop.
    var playerRig = window.buildHumanoid
      ? window.buildHumanoid(THREE, 'intern', { hair: 0x352519 })
      : null;
    if (playerRig) {
      playerRig.each(function (m) { m.layers.set(1); });
      scene.add(playerRig.group);
    }
    var walkPhase = 0, lastStance = 'stand';

    // ---------------- The ways it kills you ----------------
    var kills = (window.buildKills && entity) ? window.buildKills(THREE, {
      camera: camera, scene: scene, entity: entity, playerRig: playerRig,
      ui: {
        onKillStart: function (kind) {
          uiOpen = false;
          stopCinematics();
          if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
          if (ui.onKillStart) ui.onKillStart(kind);
        },
        onKillFrame: function (blood, fade) { if (ui.onKillFrame) ui.onKillFrame(blood, fade); },
        onKillEnd: function (kind) { if (ui.onKillEnd) ui.onKillEnd(kind); }
      },
      audio: {
        doorSlam: function (n) { if (audio) audio.doorSlam(n); },
        woodHit: function () { if (audio) audio.woodHit(); }
      }
    }) : null;

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
      hasFlashlight: false,
      torchOn: false,
      hasGlock: false,
      ammo: 0,
      mags: 0,
      inMag: 0,
      storageOpen: false,
      wifiConnected: false,
      tvWatched: false,
      readJournal: false,
      readBlueprint: false,
      readConfession: false,
      readRoster: false,
      readValuation: false,
      readEvidenceLog: false,
      // ---- campaign ----
      // `story` is the flag set the beat list reads; `beat` is how far
      // through that list the player has got.
      beat: 0,
      dayNo: 1,
      phase: 'night',          // the first stretch is the shock and the seal
      clock: 0,
      beatTimer: 0,            // counts down on beats that carry one
      beatSeen: {},            // beats that were ever the live objective
      beatFailed: false,       // this beat's countdown already ran out
      sawSealEast: false, sawSealWest: false,
      story: {
        wifiConnected: false, camsPlanted: 0, sawBirch: false, shockedInCage: false,
        sealedEast: false, hasGlock: false, ate: false, drank: false,
        powerOn: false, sealedWest: false, slept: false,
        hasPhone: false, phoneCharged: false, emailOpen: false, sawMap: false,
        hasSledge: false, shaftOpen: false, underground: false,
        openedCell: false, heardRadio: false, metJames: false
      },
      wires: null,             // the power puzzle's current wiring
      beansNamed: false,       // Chef Rat -> Diarrhea, after the first can
      powerOn: false, hasPhone: false, hasSledge: false, underground: false,
      phonePct: 0, emailCode: null,
      supplies: false,
      room: null,
      seenAssembly: false,
      dead: false,
      killing: false,          // a kill animation owns the camera
      deaths: 0,
      deathReason: null,
      // survival
      hunger: 10, thirst: 10, energy: 20,
      waterN: 0, beansN: 0, fuelN: 0,
      fuelStreak: 0, fueled: false,
      gut: 0, bladder: 0, needToilet: false,
      collapseT: 0, starveT: 0, hallucinating: false,
      // security
      cams: 0, seals: { sealWest: false, sealEast: false },
      // arsenal
      weapon: 'glock', shells: 0, arRounds: 0, tube: 0,
      hasShotgun: false, hasAR: false, riotGear: false,
      keycard: false, entranceOpen: false, ended: false,
      attackCd: 0,
      camsTaken: false, birchAwake: false,
      riotEquipped: false,
      hotbar: [null, null, null, null, null],
      hotbarSel: 0,
      ventOpen: [false, false, false, false]
    };
    var planted = [];          // {x,z,facing,alive,mesh}
    var openedCrates = {};
    var takenSupplies = [];        // bottles and cans, put back at dawn
    var debugChance = {};      // test hook: force named rolls
    function chance(name, p) {
      if (debugChance[name] !== undefined) return debugChance[name];
      return Math.random() < p;
    }
    var MAG_SIZE = 17;

    var audio = createAudio();
    function say(text) { if (ui.onMessage) ui.onMessage(text); }

    // ---------------- Input ----------------
    var keys = { f: false, b: false, l: false, r: false, tl: false, tr: false };
    var running = false;
    var sprintHold = 0;              // seconds held on a steady line forward
    var SPRINT_AFTER = 2.0;          // ...before it turns into a run
    var active = false;
    var pointerLocked = false;
    var pointerLockBlocked = false;
    var uiOpen = false;   // an overlay (computer, journal…) has the input

    function setStance(next) {
      if (state.stance === next) next = 'stand';
      state.stance = next;
      sprintHold = 0;                 // dropping to a crouch ends the run
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
        case 'KeyF': plantCamera(); break;
        case 'KeyG': setTorch(!state.torchOn); break;
        case 'Digit1': selectSlot(0); break;
        case 'Digit2': selectSlot(1); break;
        case 'Digit3': selectSlot(2); break;
        case 'Digit4': selectSlot(3); break;
        case 'Digit5': selectSlot(4); break;
        case 'Tab': if (ui.onInventory) ui.onInventory(); break;
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
    // Touch players steer by dragging — a captured, hidden cursor would eat
    // every tap on the stick and buttons (Android exposes requestPointerLock
    // even on phones, so feature-detection alone is not enough).
    var coarseInput = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    function requestLock() {
      if (coarseInput) return;
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
      if (pointerLocked) { useSelected(); return; }
      // Pointer lock is released whenever an overlay opens; clicking the
      // world takes it back rather than dropping into drag-look for good.
      if (!coarseInput && !pointerLockBlocked && canvas.requestPointerLock) { requestLock(); return; }
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
        if (c.id === 'sealWest' || c.id === 'sealEast') {
          if (!state.seals[c.id]) continue;      // shutter parked in the ceiling
        } else if (c.id === 'entrance') {
          if (state.entranceOpen) continue;
        } else if (c.id && level.isDoorOpen(c.id)) continue;
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

    // Raycaster does not care whether a mesh is visible, so a hidden pickup
    // stays targetable unless we say otherwise. Walk the parents too: some
    // items hide the group rather than the clickable mesh.
    function meshShown(o) {
      for (var n = o; n; n = n.parent) { if (!n.visible) return false; }
      return true;
    }

    // A pickup is gone once taken: hidden, and out of the interactable list
    // so nothing can find it again. Hiding alone let players re-take the
    // Glock for a fresh thirty-four rounds, indefinitely.
    // Drop the crosshair target and tell the HUD. Nulling `focused` alone is
    // not enough: updateFocus() only notifies the UI when the target changes,
    // and null -> null is not a change, so the "E Take" prompt for a thing
    // you just pocketed stayed on screen until you looked at something else.
    function clearFocus() {
      focused = null;
      if (ui.onFocus) ui.onFocus(null, promptFor(null));
    }

    function takePickup(mesh, hideParent) {
      var node = (hideParent && mesh.parent) ? mesh.parent : mesh;
      node.visible = false;
      var i = level.interactables.indexOf(mesh);
      if (i >= 0) level.interactables.splice(i, 1);
      clearFocus();
    }

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
        if (!meshShown(hits[i].object)) continue;
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
          if (audio) audio.door(d.sound || 'wood', true);
          say('The lock turns. The door swings back on a smell you will not forget.');
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
          // with the phone in hand the lead is the point of the desk
          if (state.hasPhone && !state.story.emailOpen) {
            state.phoneCharging = true;
            if (!state.story.phoneCharged && state.phonePct >= 1) flag('phoneCharged');
            if (ui.showPhone) ui.showPhone();
            break;
          }
          if (ui.showComputer) ui.showComputer(state.wifiConnected);
          break;
        case 'entranceDoor':
          if (state.keycard && !state.entranceOpen) {
            state.entranceOpen = true;
            if (window.__entranceGlass) window.__entranceGlass.forEach(function (m) { m.visible = false; });
            if (audio) audio.unlock();
            say('The reader blinks green. The glass swings loose. Outside is outside.');
            break;
          }
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
          takePickup(focused);
          if (audio) audio.pickup();
          say('You take the key. The tag reads STORAGE, in biro, twice.');
          refreshHud();
          break;
        case 'flashlight':
          state.hasFlashlight = true;
          takePickup(focused, true);
          if (audio) audio.pickup();
          giveItem('flashlight');
          setTorch(true);
          say('A torch, and the batteries are still in it. It stays on while your hands are full.');
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
          takePickup(focused, true);
          flag('hasGlock');
          cinematic('gotGun');      // the whole pistol group, not just the slide
          if (audio) audio.pickup();
          giveItem('glock');
          say('Glock 19, and two magazines. Thirty-four rounds. There will not be more.');
          refreshHud();
          break;
        case 'blueprint':
          state.readBlueprint = true;
          if (ui.showBlueprint) ui.showBlueprint();
          break;
        case 'confession':
          state.readConfession = true;
          if (ui.showManifesto) ui.showManifesto();
          break;
        case 'roster':
          state.readRoster = true;
          if (ui.showRoster) ui.showRoster();
          break;
        case 'valuation':
          state.readValuation = true;
          if (ui.showValuation) ui.showValuation();
          break;
        case 'trapnell':
          say('A laminated badge, cracked down the middle. TRAPNELL — CONTAINMENT. The photo has been scraped off.');
          break;
        case 'nickID':
          say('An employee badge. NICK AHOY — INTAKE — AGE 19. The lanyard is still knotted the way he tied it.');
          break;
        case 'powerPanel':
          if (state.powerOn) { say('Green across the board. It stays on.'); break; }
          if (!state.wires) state.wires = makeWires();
          if (audio) audio.ui();
          if (ui.showWires) ui.showWires();
          break;
        case 'sledge':
          state.hasSledge = true;
          takePickup(focused, true);
          if (audio) audio.pickup();
          say('Sledgehammer. Heavier than it looks, and the only tool in this building worth anything.');
          checkBeat();
          break;
        case 'shaftWall':
          if (state.underground || state.story.shaftOpen) { say('The hole goes down further than the torch reaches.'); break; }
          if (!state.story.sawMap) { say('Brick over concrete, and newer than the wall around it. Somebody closed something off here.'); break; }
          if (!state.hasSledge) { say('The map says a service lift used to run down from this corner. You would need to break it open.'); break; }
          breakShaft();
          break;
        case 'shaftDown':
          descend();
          break;
        case 'ownerPhone':
          state.hasPhone = true;
          takePickup(focused, true);
          if (audio) audio.pickup();
          cinematic('gotPhone');
          checkBeat();
          break;
        case 'bunk':
          trySleep();
          break;
        case 'cellDoor':
          if (!state.story.openedCell) {
            flag('openedCell');
            if (window.__cellDoor) window.__cellDoor.rotation.y = 1.5;
            if (audio) audio.door('steel', true);
            cinematic('openedCell', { lock: false });
          } else say('You have seen what is in there. Once was enough.');
          break;
        case 'undergroundRadio':
          if (state.story.heardRadio) { say('The same loop. He is still saying it.'); break; }
          flag('heardRadio');
          if (audio) audio.ui();
          cinematic('radioOn');
          break;
        case 'barracksDoor':
          if (state.story.metJames) { say('He is still in there. Still holding the rifle.'); break; }
          flag('metJames');
          if (audio) audio.door('steel', true);
          cinematic('knock', { lock: true }, function () {
            cinematic('jamesTalk', { lock: true }, function () {
              if (ui.onActEnd) ui.onActEnd();
            });
          });
          break;
        case 'evidenceLog':
          state.readEvidenceLog = true;
          if (ui.showEvidenceLog) ui.showEvidenceLog();
          break;
        case 'deadRadio':
          say('A handheld radio, battery long dead. The channel dial is still set to a frequency nobody uses anymore.');
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
          say('HOLDING — SUBJECT SECURE. Carbon-reinforced steel, rated past anything else on this floor. The bars are bent outward from the inside. It was not let out.');
          break;
        case 'cameraCrate':
          if (state.camsTaken) { say('Empty. The foam cutouts are shaped like cameras.'); break; }
          state.camsTaken = true;
          state.cams += 5;
          giveItem('camera');
          if (audio) audio.pickup();
          say('Five security cameras. Select them on the hotbar and click to place.');
          refreshHud();
          break;
        case 'vent': {
          var vi = d.vent;
          if (!state.ventOpen[vi]) {
            state.ventOpen[vi] = true;
            // the grate hangs off its last screw, forever
            var vm = d.end === 0 ? level.vents[vi].meshA : level.vents[vi].meshB;
            vm.rotation.z = 0.9;
            vm.position.y = 0.18;
            var other = d.end === 0 ? level.vents[vi].meshB : level.vents[vi].meshA;
            other.rotation.z = -0.8;
            other.position.y = 0.18;
            if (audio) audio.ventBreak();
            say('The grate wrenches off. That is permanent — and it is not only your shortcut now.');
            if (entity) entity.setVentsOpen(true);
            refreshHud();
            break;
          }
          if (state.stance !== 'crawl') { say('The duct is knee-high. You would have to crawl.'); break; }
          // through the wall
          var dest = d.end === 0 ? level.vents[vi].b : level.vents[vi].a;
          if (audio) audio.ventCrawl();
          if (ui.onVentTravel) ui.onVentTravel();
          var self = this;
          void self;
          setTimeout(function () {
            camera.position.x = dest.x - Math.sin(dest.ry) * 0.9;
            camera.position.z = dest.z - Math.cos(dest.ry) * 0.9;
            var r2 = level.roomAt(camera.position.x, camera.position.z);
            state.room = r2;
            if (audio && r2) audio.setRoom(r2.id);
          }, 900);
          break;
        }
        case 'openCrate':
          if (focused.userData.taken) { say('Nothing left but the straw.'); break; }
          focused.userData.taken = true;
          if (d.kind === 'water') { state.waterN += 2; giveItem('water'); say('Two bottles of water, right on top.'); }
          else if (d.kind === 'beans') { state.beansN += 2; giveItem('beans'); say('Two cans of beans. Nick would have wept.'); }
          else say('Paperwork. Order forms for birch, tungsten, and steel.');
          if (audio) audio.pickup();
          refreshHud();
          break;
        case 'lootCrate': {
          var idx = d.idx;
          if (openedCrates[idx]) { say('Already open. Packing straw.'); break; }
          openedCrates[idx] = true;
          var got = [];
          if (chance('cameras', 0.30)) { state.cams += 5; giveItem('camera'); got.push('a bundle of five cameras'); }
          if (chance('ammo', 0.10)) { state.ammo += 17; got.push('a box of 9mm'); }
          if (chance('gun', 0.02)) {
            if (Math.random() < 0.5) { var hadSg = state.hasShotgun; state.hasShotgun = true; state.shells += 6; if (!hadSg) state.tube = 6; giveItem('shotgun'); got.push('a semi-auto shotgun'); }
            else { state.hasAR = true; state.arRounds += 30; giveItem('ar'); got.push('an assault rifle'); }
          }
          if (chance('water', 0.50)) { state.waterN++; giveItem('water'); got.push('water'); }
          if (chance('beans', 0.60)) { state.beansN++; giveItem('beans'); got.push('beans'); }
          if (chance('fuel', 0.25)) { state.fuelN++; giveItem('fuel'); got.push('GAMER ENERGY'); }
          if (chance('riot', 0.09)) {
            if (!state.riotGear) { state.riotGear = true; giveItem('riot'); got.push('RIOT GEAR — equip it in your inventory'); }
            else got.push('spare riot padding');
          }
          if (audio) audio.pickup();
          say(got.length ? 'Inside: ' + got.join(', ') + '.' : 'Packing straw and dust.');
          refreshHud();
          break;
        }
        case 'toilet':
          if (state.needToilet) {
            state.gut = 0; state.bladder = 0; state.needToilet = false;
            if (audio) audio.flush();
            say('Better. The flush echoes much too far.');
          } else {
            if (audio) audio.flush();
            say('No need. The flush echoes anyway.');
          }
          refreshHud();
          break;
        case 'placedCam':
          collectCamera(focused);
          break;
        case 'keycard':
          state.keycard = true;
          takePickup(focused);
          if (audio) audio.pickup();
          say('A keycard, warm from the machinery. Stamped: FRONT ENTRANCE.');
          refreshHud();
          break;
        case 'supplyItem': {
          // One item, once — the shelf empties as you strip it. Hidden
          // rather than destroyed, because the facility restocks at dawn
          // and a run past day two is unsurvivable otherwise.
          takenSupplies.push(focused);
          takePickup(focused, true);
          state.supplies = true;
          if (audio) audio.pickup();
          if (d.kind2 === 'water') { state.waterN++; giveItem('water'); say('A bottle of water. There are not many left.'); }
          else { state.beansN++; giveItem('beans'); say('A can of beans. Exactly what Nick ran out of.'); }
          clearFocus();
          refreshHud();
          break;
        }
        default:
          say(d.label);
      }
      updateFocus();
    }

    // ---------------- Hotbar and inventory ----------------
    // Item counts live in state; the hotbar holds item ids. Clicking uses
    // whatever is selected: weapons fire, consumables consume, cameras place.
    var ITEM_DEFS = {
      glock: { label: 'GLOCK', kind: 'weapon' },
      shotgun: { label: 'SEMI12', kind: 'weapon' },
      ar: { label: 'R700', kind: 'weapon' },
      camera: { label: 'CAM', kind: 'place' },
      flashlight: { label: 'LIGHT', kind: 'toggle' },
      water: { label: 'WATER', kind: 'consume' },
      beans: { label: 'BEANS', kind: 'consume' },
      fuel: { label: 'NRG', kind: 'consume' },
      riot: { label: 'RIOT', kind: 'armor' }
    };
    function itemCount(id) {
      if (id === 'flashlight') return state.hasFlashlight ? 1 : 0;
      if (id === 'camera') return state.cams;
      if (id === 'water') return state.waterN;
      if (id === 'beans') return state.beansN;
      if (id === 'fuel') return state.fuelN;
      if (id === 'glock') return state.hasGlock ? 1 : 0;
      if (id === 'shotgun') return state.hasShotgun ? 1 : 0;
      if (id === 'ar') return state.hasAR ? 1 : 0;
      if (id === 'riot') return state.riotGear && !state.riotEquipped ? 1 : 0;
      return 0;
    }
    function ownedItems() {
      return Object.keys(ITEM_DEFS).filter(function (id) {
        if (id === 'riot') return state.riotGear;
        return itemCount(id) > 0;
      }).map(function (id) {
        return { id: id, label: ITEM_DEFS[id].label, kind: ITEM_DEFS[id].kind, count: itemCount(id), equipped: id === 'riot' && state.riotEquipped };
      });
    }
    // first pickup of a thing lands it in the first free hotbar slot
    function giveItem(id) {
      if (ITEM_DEFS[id].kind === 'armor') { refreshHud(); return; }
      if (state.hotbar.indexOf(id) >= 0) { refreshHud(); return; }
      for (var i = 0; i < 5; i++) {
        if (!state.hotbar[i]) {
          state.hotbar[i] = id;
          if (ITEM_DEFS[id].kind === 'weapon') { state.hotbarSel = i; state.weapon = id; updateViewmodel(); }
          break;
        }
      }
      refreshHud();
    }
    function selectSlot(i) {
      if (!active || uiOpen) return;
      state.hotbarSel = i;
      var id = state.hotbar[i];
      if (id && ITEM_DEFS[id].kind === 'weapon') state.weapon = id;
      updateViewmodel();
      if (audio) audio.ui();
      refreshHud();
    }
    function useSelected() {
      var id = state.hotbar[state.hotbarSel];
      if (!id) return false;
      var kind = ITEM_DEFS[id].kind;
      if (kind === 'weapon') { state.weapon = id; shoot(); return true; }
      if (kind === 'consume') { consume(id === 'fuel' ? 'fuel' : id); return true; }
      if (kind === 'place') { plantCamera(); return true; }
      if (kind === 'toggle') { setTorch(!state.torchOn); return true; }
      return false;
    }
    function assignHotbar(slot, id) {
      if (id && ITEM_DEFS[id] && ITEM_DEFS[id].kind === 'armor') return;
      state.hotbar[slot] = id;
      refreshHud();
    }
    function equipRiot(on) {
      if (!state.riotGear) return;
      state.riotEquipped = !!on;
      if (audio) audio.ui();
      refreshHud();
    }

    // ---------------- Cameras, consumables, seals ----------------
    // ---------------- Placeable cameras ----------------
    var camAnims = [];
    var camMats = {
      body: new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.15, metalness: 0.3 }),
      leg: new THREE.MeshStandardMaterial({ color: 0x3a3f43, roughness: 0.45, metalness: 0.6 }),
      led: new THREE.MeshStandardMaterial({ color: 0x300a08, emissive: 0xc33322, emissiveIntensity: 1.6 })
    };

    function cameraHead(parent) {
      var head = new THREE.Group();
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.17), camMats.body));
      var hood = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.17), camMats.body);
      hood.position.set(0, 0.055, 0);
      head.add(hood);
      var lens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.05, 10), camMats.lens);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0.005, -0.1);
      head.add(lens);
      var led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), camMats.led);
      led.position.set(0.04, 0.03, -0.085);
      head.add(led);
      parent.add(head);
      return head;
    }

    // three legs meeting the pan-head hub — every part actually joined
    function buildTripod() {
      var g = new THREE.Group();
      var APEX = 0.8;
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.06, 10), camMats.leg);
      hub.position.y = APEX;
      g.add(hub);
      for (var l = 0; l < 3; l++) {
        var a = (l / 3) * Math.PI * 2 + 0.5;
        var footX = Math.cos(a) * 0.26, footZ = Math.sin(a) * 0.26;
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.86, 8), camMats.leg);
        // from the hub down to the splayed foot
        leg.position.set(footX / 2, APEX / 2, footZ / 2);
        leg.lookAt ? null : null;
        var dir = new THREE.Vector3(footX, -APEX, footZ);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
        g.add(leg);
        var foot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), camMats.leg);
        foot.position.set(footX, 0.015, footZ);
        g.add(foot);
      }
      var column = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8), camMats.leg);
      column.position.y = APEX + 0.09;
      g.add(column);
      var head = cameraHead(g);
      head.position.y = APEX + 0.19;
      return { g: g, head: head, headY: APEX + 0.19 };
    }

    // plate → arm → hinge → head: a standard wall unit
    function buildWallCam() {
      var g = new THREE.Group();
      var plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.02), camMats.leg);
      plate.position.z = 0.01;
      g.add(plate);
      var arm = new THREE.Group();
      var armBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), camMats.leg);
      armBar.rotation.x = Math.PI / 2;
      armBar.position.z = -0.08;
      arm.add(armBar);
      var hinge = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), camMats.leg);
      hinge.position.z = -0.16;
      arm.add(hinge);
      var head = cameraHead(arm);
      head.position.set(0, -0.05, -0.2);
      head.rotation.x = -0.35;
      g.add(arm);
      return { g: g, arm: arm, headY: 0 };
    }

    // planted[0] is the fixture that came with the building; the five the
    // player carries in are everything after it.
    function plantedByPlayer() {
      var n = 0;
      planted.forEach(function (c) { if (!c.fixed) n++; });
      return n;
    }

    // CAM 0 — the one that was already here. Bolted to the Assembly wall
    // looking straight at the holding cage, half dead, and the only unit in
    // the building with a taser in it. Yours are older stock without one.
    (function installFixedCam() {
      var CAGE = { x: 54.3, z: 56 };
      var x = 49.4, z = 51.6;
      var built = buildWallCam();
      built.g.position.set(x, 2.35, z);
      var face = Math.atan2(-(CAGE.x - x), -(CAGE.z - z));
      built.g.rotation.y = face + Math.PI;      // plate to the wall
      built.arm.rotation.x = 0;
      scene.add(built.g);
      planted.push({
        x: x, z: z, facing: face, pitch: -0.16, headY: 2.2,
        alive: true, mesh: built.g, type: 'wall', taser: true, fixed: true
      });
    })();

    function plantCamera() {
      if (!active || uiOpen || state.dead) return;
      if (state.cams <= 0) { say('No cameras to place.'); return; }

      camera.updateMatrixWorld();
      gunRay.setFromCamera(centre, camera);
      var dir = gunRay.ray.direction;
      var flat = Math.hypot(dir.x, dir.z) || 1;
      var wallD = wallHitDistance(camera.position.x, camera.position.z, dir.x / flat, dir.z / flat);

      var entry;
      if (wallD < 2.4) {
        // close to a wall: it becomes a standard wall unit, looking back
        // into the room from just shy of the surface
        var wx = camera.position.x + (dir.x / flat) * (wallD - 0.09);
        var wz = camera.position.z + (dir.z / flat) * (wallD - 0.09);
        var built = buildWallCam();
        built.g.position.set(wx, 2.3, wz);
        built.g.rotation.y = yaw;                    // plate against the wall
        scene.add(built.g);
        // the arm swings down out of your hands
        built.arm.rotation.x = 1.3;
        camAnims.push({ t: 0, dur: 0.55, kind: 'wall', arm: built.arm });
        entry = { x: wx, z: wz, facing: yaw + Math.PI, pitch: -0.3, headY: 2.2, alive: true, mesh: built.g, type: 'wall' };
        say('Camera ' + (planted.length + 1) + ' bolted to the wall.');
      } else {
        // open floor: a tripod, three feet tall, planted a step ahead
        var px = camera.position.x + (dir.x / flat) * 1.1;
        var pz = camera.position.z + (dir.z / flat) * 1.1;
        var built2 = buildTripod();
        built2.g.position.set(px, 0, pz);
        built2.g.rotation.y = yaw;
        built2.g.scale.set(0.4, 0.25, 0.4);          // legs folded in your hands
        scene.add(built2.g);
        camAnims.push({ t: 0, dur: 0.7, kind: 'tripod', mesh: built2.g });
        entry = { x: px, z: pz, facing: yaw, pitch: -0.05, headY: built2.headY, alive: true, mesh: built2.g, type: 'tripod' };
        say('Camera ' + (planted.length + 1) + ' planted. Knee height sees more than you think.');
      }

      state.cams--;
      entry.mesh.traverse(function (o) { o.userData.plantedCam = true; });
      entry.mesh.children[0].userData.interact = { id: 'placedCam', label: 'Security camera', verb: 'Collect' };
      level.interactables.push(entry.mesh.children[0]);
      planted.push(entry);
      if (audio) audio.ui();
      refreshHud();
    }

    function collectCamera(mesh) {
      for (var i = 0; i < planted.length; i++) {
        if (planted[i].mesh.children.indexOf(mesh) >= 0 || planted[i].mesh === mesh) {
          var c = planted[i];
          scene.remove(c.mesh);
          var ii = level.interactables.indexOf(mesh);
          if (ii >= 0) level.interactables.splice(ii, 1);
          planted.splice(i, 1);
          if (c.alive) {
            state.cams++;
            say('Camera packed up. Place it somewhere better.');
          } else {
            say('The housing is crushed. Beyond repair.');
          }
          if (audio) audio.pickup();
          clearFocus();
          refreshHud();
          return true;
        }
      }
      return false;
    }

    var UNHINGED = [
      'I could take him.',
      'He is made of wood. I am made of ENERGY.',
      'Blink. I dare you, plank.',
      'My blood is nine percent taurine.',
      'Try me, furniture.'
    ];
    function consume(kind) {
      if (!active || uiOpen || state.dead) return;
      if (kind === 'water') {
        if (state.waterN <= 0) { say('No water.'); return; }
        state.waterN--;
        state.fuelStreak = 0;
        if (state.thirst >= 9) { state.bladder++; }
        state.thirst = Math.min(10, state.thirst + 5);
        if (state.bladder >= 2) {
          state.needToilet = true;
          if (audio) audio.vomit();
          say('Too much. It comes back up, and now you need the toilet as well.');
          state.thirst = Math.max(0, state.thirst - 1);
          state.hunger = Math.max(0, state.hunger - 1);
        } else {
          if (audio) audio.consume('water');
          say('The water is warm and perfect. Generic. Absolutely generic.');
          flag('drank');
        }
      } else if (kind === 'beans') {
        if (state.beansN <= 0) { say('No beans.'); return; }
        state.beansN--;
        state.fuelStreak = 0;
        if (state.hunger >= 9) state.gut++;
        state.hunger = Math.min(10, state.hunger + 3);
        if (state.gut >= 2) {
          state.needToilet = true;
          say('Cold beans. Nick was right about the smell. You will need the toilet.');
        } else if (!state.beansNamed) {
          say('Cold Chef Rat Beans, straight from the can. That was a mistake.');
        } else {
          say('More Diarrhea Beans. You have made your peace with it.');
        }
        if (audio) audio.consume('beans');
        flag('ate');
        // the label does not survive contact with the product
        if (!state.beansNamed) {
          state.beansNamed = true;
          ITEM_DEFS.beans.label = 'DIARRHEA';
          cinematic('ateBeans');
        }
      } else {
        if (state.fuelN <= 0) { say('No GAMER ENERGY.'); return; }
        state.fuelN--;
        state.fuelStreak++;
        state.energy = 25;
        state.fueled = true;
        if (audio) audio.consume('fuel');
        if (state.fuelStreak >= 10 && chance('seizure', 0.25)) {
          say('Your heart plays a drum solo. Then it stops.');
          setTimeout(function () { die('seizure'); }, 1200);
          return;
        }
        say(UNHINGED[Math.floor(Math.random() * UNHINGED.length)]);
      }
      refreshHud();
    }

    function setSeal(which) {
      // one shutter at a time — sealing one raises the other
      Object.keys(state.seals).forEach(function (k) { state.seals[k] = false; });
      if (which) state.seals[which] = true;
      if (audio) audio.sealSlam();
      makeNoise(60);              // a tonne of tungsten hitting the floor
      // the shutter coming down is its own scene — play it before the flag,
      // so it leads whatever the flag then unlocks
      if (which === 'sealEast' && !state.sawSealEast) { state.sawSealEast = true; cinematic('sealedEast'); }
      if (which === 'sealWest' && !state.sawSealWest) { state.sawSealWest = true; cinematic('sealedWest'); }
      if (which === 'sealEast') flag('sealedEast');
      if (which === 'sealWest') flag('sealedWest');
      refreshHud();
      return state.seals;
    }

    // ---------------- Weapon ----------------
    function shoot() {
      if (!state.hasGlock || uiOpen || state.dead) return;
      if (!weapons.canFire()) return;
      var w = state.weapon;
      var pellets = 1, stagger = 1.1, spread = 0;

      if (w === 'shotgun') {
        if (state.tube <= 0) { if (audio) audio.dryFire(); say(state.shells > 0 ? 'Tube empty. Reload with R.' : 'No shells at all.'); return; }
        state.tube--;
        pellets = 8; spread = 0.045; stagger = 1.2;
        if (audio) audio.shotgun();
      } else if (w === 'ar') {
        if (state.arRounds <= 0) { if (audio) audio.dryFire(); say('The rifle is dry.'); return; }
        state.arRounds--;
        stagger = 2.2;
        if (audio) audio.rifle();
      } else {
        if (state.inMag <= 0) {
          if (audio) audio.dryFire();
          say(state.ammo > 0 ? 'Empty. Reload with R.' : 'Empty. There is no more ammunition.');
          return;
        }
        state.inMag--;
        state.ammo--;
        if (audio) audio.gunshot();
      }
      if (ui.onMuzzleFlash) ui.onMuzzleFlash();
      // A gunshot indoors is the loudest thing in this building. It does
      // not need to see the muzzle flash — it heard the room ring.
      makeNoise(w === 'shotgun' ? 95 : w === 'ar' ? 88 : 78);

      camera.updateMatrixWorld();
      var hitsOnEntity = 0;
      var firstHit = null;
      var muzzle = weapons.muzzleWorld() || camera.position.clone();
      var es3 = entity ? entity.getState() : null;

      for (var pi = 0; pi < pellets; pi++) {
        var sx = (Math.random() - 0.5) * spread * 2;
        var sy = (Math.random() - 0.5) * spread * 2;
        gunRay.setFromCamera({ x: sx, y: sy }, camera);
        var dir = gunRay.ray.direction;
        var wallD = wallHitDistance(camera.position.x, camera.position.z, dir.x, dir.z);
        var endPoint = camera.position.clone().addScaledVector(dir, Math.min(wallD, 55));
        if (entity && es3) {
          var hitList = gunRay.intersectObject(entity.group, true);
          if (hitList.length > 0 && hitList[0].distance < wallD && hitList[0].distance < 45) {
            hitsOnEntity++;
            endPoint = hitList[0].point.clone();
            if (!firstHit) firstHit = endPoint;
          }
        }
        weapons.spawnPellets(muzzle, [endPoint]);
      }
      weapons.onFired(w, null);

      if (w === 'ar') {
        weapons.cycleBolt(function () { if (audio) audio.boltCycle(); });
        if (audio) setTimeout(function () { audio.boltCycle(); }, 120);
      }

      if (hitsOnEntity > 0 && entity) {
        var totalStagger = stagger + (pellets > 1 ? hitsOnEntity * 0.18 : 0);
        // which side of it you hit, so the right hand goes over the hole
        var esh = entity.getState();
        var sideDot = Math.cos(esh.facing) * (camera.position.x - esh.x)
          - Math.sin(esh.facing) * (camera.position.z - esh.z);
        if (entity.hitShot(totalStagger, sideDot < 0 ? -1 : 1)) {
          if (audio) setTimeout(function () { audio.woodHit(); }, 40);
          say(pellets > 1
            ? hitsOnEntity + ' of ' + pellets + ' pellets bury themselves in the wood. It does not fall.'
            : 'The round buries itself in the wood. It does not fall.');
        }
      }
      refreshHud();
    }

    function reload() {
      if (!state.hasGlock || uiOpen || state.dead || weapons.isReloading()) return;
      var w = state.weapon;
      if (w === 'glock') {
        if (state.inMag >= MAG_SIZE) return;
        var pool = state.ammo - state.inMag;
        if (pool <= 0) { say('No magazines left.'); return; }
        if (audio) audio.magOut();
        weapons.startReload('glock', 1.0, function () {
          var take = Math.min(MAG_SIZE - state.inMag, pool);
          state.inMag += take;
          if (audio) audio.magIn();
          say('Reloaded.');
          refreshHud();
        });
      } else if (w === 'shotgun') {
        if (state.tube >= 6 || state.shells - state.tube <= 0) return;
        var want = Math.min(6 - state.tube, state.shells - state.tube);
        if (audio) audio.ui();
        weapons.startReload('shotgun', 0.5 * want, function () {
          state.tube += want;
          say(want === 1 ? 'One shell into the tube.' : want + ' shells into the tube.');
          refreshHud();
        });
        // a click per shell as they go in
        for (var sh2 = 0; sh2 < want; sh2++) {
          if (audio) setTimeout(function () { audio.shellIn(); }, 250 + sh2 * 500);
        }
      }
      // the rifle feeds from the pool; its reload is the bolt
    }

    function refreshHud() {
      if (ui.onHud) ui.onHud({
        hasGlock: state.hasGlock, inMag: state.inMag, ammo: state.ammo,
        weapon: state.weapon, shells: state.shells, arRounds: state.arRounds, tube: state.tube,
        hasShotgun: state.hasShotgun, hasAR: state.hasAR, riotGear: state.riotGear,
        hasKey: state.hasKey, supplies: state.supplies, keycard: state.keycard,
        hasFlashlight: state.hasFlashlight, torchOn: state.torchOn,
        cams: state.cams, planted: planted.map(function (c) { return { alive: c.alive }; }),
        hunger: state.hunger, thirst: state.thirst, energy: state.energy,
        fueled: state.fueled, needToilet: state.needToilet,
        waterN: state.waterN, beansN: state.beansN, fuelN: state.fuelN,
        seals: { west: state.seals.sealWest, east: state.seals.sealEast },
        hotbar: state.hotbar.map(function (id, i) {
          return { id: id, label: id ? ITEM_DEFS[id].label : '', count: id ? itemCount(id) : 0, sel: i === state.hotbarSel };
        }),
        riotEquipped: state.riotEquipped
      });
    }

    // ---------------- How much noise you are making ----------------
    // It has no eyes and no nose — it reads the building off the echoes.
    // So this, and not where you are looking, is what gets you killed.
    // Standing still is genuinely invisible to it; sprinting is a flare.
    var noiseSpike = 0;              // a gunshot or a slammed door, decaying
    var seenDim = 0, lastSeenDim = 0;   // the lights go when you look at it
    var panicT = 0;                  // how long since you last said something
    function playerNoise() {
      var N = (entity && entity.NOISE) || { still: 0, crawl: 2.6, crouch: 5.5, walk: 11, sprint: 19 };
      var moving = Math.hypot(velocity.x, velocity.z) > 0.35;
      var base;
      if (!moving) base = N.still;
      else if (state.stance === 'crawl') base = N.crawl;
      else if (state.stance === 'crouch') base = N.crouch;
      else base = state.sprinting ? N.sprint : N.walk;
      // things that are loud whatever you were doing
      return Math.max(base, noiseSpike);
    }
    // A one-off racket: a shot, a shutter, a door taken off its latch.
    function makeNoise(metres) {
      noiseSpike = Math.max(noiseSpike, metres);
    }

    // What comes out of you when it is behind you and you are running. You
    // do not choose to say these, which is rather the point — and every one
    // of them is more noise for the thing that hunts by noise.
    var PANIC = [
      'Shit — shit shit shit—',
      'Oh fuck. Oh fuck oh fuck—',
      'No no no no NO—',
      'Get away from me. GET AWAY FROM ME—',
      'Fuck you! FUCK YOU—',
      'Please. Please, please, please—',
      'Not like this. Not like this—',
      'I am not dying in here. I am NOT dying in here—'
    ];
    var BREATH = [
      'You cannot get the air in fast enough.',
      'Something in your chest is screaming and it is not stopping.'
    ];
    function panicVoice(dt, dist, hunting) {
      panicT -= dt;
      if (!hunting || state.dead || state.killing) return;
      var close = dist < 22;
      if (!close || !state.sprinting) return;
      if (panicT > 0) return;
      panicT = 4.5 + Math.random() * 4;
      var hard = dist < 10;
      if (audio) audio.panic(hard);
      var line = hard || Math.random() < 0.75
        ? PANIC[Math.floor(Math.random() * PANIC.length)]
        : BREATH[Math.floor(Math.random() * BREATH.length)];
      if (ui.onMessage) ui.onMessage(line);
      // and shouting is the loudest thing you can do while running
      makeNoise(hard ? 26 : 21);
    }

    // ---------------- The campaign ----------------
    // A beat is done when its flag turns true; the next objective then goes
    // up on the HUD. Beats that carry a timer fail you if it runs out.
    var S = window.STORY;
    var cineLock = false, cineTimers = [];
    var cineQueue = [], cineBusy = false;
    var beatPoll = 0;          // objectives are re-checked on a timer, not on trust

    function beat() { return S.BEATS[state.beat] || null; }

    // Play a scripted run of lines. Locks nothing by default — the player
    // usually needs to keep running while their own head talks at them.
    // Two runs can now be asked for in the same instant (sealing the east
    // door skips two beats and opens a third), so they queue instead of
    // talking over each other.
    function cinematic(key, opts, onDone) {
      var lines = S.LINES[key];
      if (!lines) { if (onDone) onDone(); return; }
      queueLines(lines, opts, onDone);
    }
    function queueLines(lines, opts, onDone) {
      cineQueue.push({ lines: lines, opts: opts || {}, onDone: onDone });
      if (!cineBusy) runNextCinematic();
    }
    function runNextCinematic() {
      var job = cineQueue.shift();
      if (!job) { cineBusy = false; return; }
      cineBusy = true;
      var opts = job.opts;
      if (opts.lock) { cineLock = true; if (ui.onBars) ui.onBars(true); }
      var last = 0;
      job.lines.forEach(function (l) {
        last = Math.max(last, l[0]);
        cineTimers.push(setTimeout(function () {
          if (ui.onDialogue) ui.onDialogue(l[1], l[2]);
        }, l[0]));
      });
      // The last line normally sits for a beat before clearing. With another
      // scene waiting that pause is just dead air, so cut it short.
      var hold = opts.hold === undefined ? 4200 : opts.hold;
      if (cineQueue.length) hold = Math.min(hold, 1200);
      cineTimers.push(setTimeout(function () {
        if (ui.onDialogue) ui.onDialogue(null, null);
        if (opts.lock) { cineLock = false; if (ui.onBars) ui.onBars(false); }
        if (job.onDone) job.onDone();
        runNextCinematic();
      }, last + hold));
    }
    function stopCinematics() {
      cineTimers.forEach(clearTimeout);
      cineTimers = [];
      cineQueue = [];
      cineBusy = false;
      if (ui.onDialogue) ui.onDialogue(null, null);
      cineLock = false;
      if (ui.onBars) ui.onBars(false);
    }

    // Fired by the world when something story-relevant happens.
    function flag(name, value) {
      var v = value === undefined ? true : value;
      if (state.story[name] === v) return;
      state.story[name] = v;
      checkBeat();
    }

    // Derive every flag that can be derived from live game state, rather
    // than trusting each site to remember to raise it. The camera objective
    // sat there forever because nothing called flag('camsPlanted'); doing
    // this every tick means an objective cannot get stuck even if a future
    // beat's trigger is wired up wrong.
    function syncStoryFlags() {
      var f = state.story;
      f.camsPlanted = plantedByPlayer();
      f.wifiConnected = state.wifiConnected;
      f.hasGlock = state.hasGlock;
      f.sealedEast = f.sealedEast || !!state.seals.sealEast;
      f.sealedWest = f.sealedWest || !!state.seals.sealWest;
      f.powerOn = f.powerOn || !!state.powerOn;
      f.hasPhone = f.hasPhone || !!state.hasPhone;
      f.hasSledge = f.hasSledge || !!state.hasSledge;
      f.underground = f.underground || !!state.underground;
    }

    function checkBeat() {
      syncStoryFlags();
      var guard = 0, moved = false, skipped = [];
      while (guard++ < 40) {
        var b = beat();
        if (!b || !b.done(state.story)) break;
        // A beat that was already satisfied the moment it came up was never
        // the live objective — the player did that job early. Note it so the
        // objective jumping two or three places reads as deliberate.
        if (!state.beatSeen[b.id] && b.skip) skipped.push(b.skip);
        state.beatSeen[b.id] = true;
        state.beat++;
        state.beatTimer = 0;
        state.beatFailed = false;
        moved = true;
        // "It stopped. It got light out." — holding the east door is what
        // ends the first night, so the clock has to agree with the script
        // and with the next objective, which opens on daylight.
        if (b.id === 'sealEast' && state.phase !== 'day') startPhase('day');
        var nb = beat();
        if (nb && nb.timer) state.beatTimer = nb.timer;
        if (ui.onObjective) ui.onObjective(nb, 0);
      }
      var cur = beat();
      if (cur && !state.beatSeen[cur.id]) {
        state.beatSeen[cur.id] = true;
        // The note goes on the subtitle line rather than into the dialogue
        // queue: it has to land at the same moment the objective jumps, and
        // the queue may well be part-way through a scene of its own.
        if (skipped.length && ui.onMessage) ui.onMessage(skipped.join('  '));
        if (cur.enter) cinematic(cur.enter);
      }
      // Only touch the HUD when something actually changed. This runs four
      // times a second; redrawing the hotbar on every call replaced its DOM
      // constantly, and a slot you are trying to tap kept vanishing.
      if (moved) refreshHud();
    }

    function startPhase(which) {
      state.phase = which;
      state.clock = which === 'day' ? S.DAY_LEN : S.NIGHT_LEN;
      if (entity) entity.setDaylight(which === 'day');
      if (audio) audio.setPhase(which === 'day' ? 'pop' : 'eerie');
      if (ui.onClock) ui.onClock(state.dayNo, which, state.clock);
      if (which === 'day') {
        restockWorld();
        cinematic('dawn');
      }
    }

    // Every morning the facility restocks: crates you emptied are full
    // again, and the bottles and cans are back on their shelves. One-off
    // things — a read newspaper, the torch, the Glock, the sledgehammer —
    // are gone for good, so anything else taken out of the list stays out.
    function restockWorld() {
      openedCrates = {};
      level.interactables.forEach(function (m) {
        var d = m.userData.interact;
        if (d.id === 'openCrate') d.taken = m.userData.taken = false;
      });
      takenSupplies.forEach(function (m) {
        var d = m.userData.interact;
        (d && d.node ? d.node : m).visible = true;
        if (level.interactables.indexOf(m) < 0) level.interactables.push(m);
      });
      takenSupplies.length = 0;
    }

    // ---------------- The power panel ----------------
    // Four wires a side. The left column is fixed; the right column starts
    // shuffled and cross-linked, and you drag each one onto its own colour.
    var WIRE_COLOURS = ['yellow', 'purple', 'green', 'blue'];
    function makeWires() {
      // The starting links are fixed, so shuffling the right-hand column
      // alone is not enough: one arrangement in twenty-four lines up with
      // those links and hands you a panel that is already solved. Deal
      // until at least three of the four genuinely have to be moved.
      var w, tries = 0;
      do {
        var right = WIRE_COLOURS.slice();
        for (var i = right.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = right[i]; right[i] = right[j]; right[j] = t;
        }
        // links[i] = which right-hand terminal the left wire i is joined to
        w = { left: WIRE_COLOURS.slice(), right: right, links: [3, 2, 0, 1] };
        tries++;
      } while (tries < 40 && wiresWrong(w) < 3);
      return w;
    }
    // how many of the four are joined to the wrong terminal right now
    function wiresWrong(w) {
      var n = 0;
      for (var i = 0; i < 4; i++) if (w.right[w.links[i]] !== w.left[i]) n++;
      return n;
    }
    function wiresCorrect(w) {
      if (!w) return false;
      for (var i = 0; i < 4; i++) if (w.right[w.links[i]] !== w.left[i]) return false;
      return true;
    }
    function powerRestored() {
      if (state.powerOn) return;
      state.powerOn = true;
      flag('powerOn');
      if (audio) { audio.unlock(); audio.bang(4); }
      // the alarm tells it exactly which room you are standing in
      if (entity && !entity.isHidden()) entity.force(camera.position.x, camera.position.z - 8, 'chase');
      cinematic('powerOn');
      checkBeat();
    }

    // ---------------- Sleep ----------------
    function trySleep() {
      if (state.phase !== 'night') { say('It is daylight. Sleeping through the only safe hours would be a choice.'); return; }
      var es = entity ? entity.getState() : null;
      if (es && es.mode === 'banging') { say('Not with that on the other side of the door.'); return; }
      if (state.hunger < 10 || state.thirst < 10) { say('Too hungry and too thirsty to sleep. Eat something first.'); return; }
      if (state.energy < 20) { say('Wired. You need to sit still for a while before this works.'); return; }
      flag('slept');
      state.clock = 1;                    // the night runs out while you are under
      if (ui.onSleep) ui.onSleep();
      cinematic('slept');
      checkBeat();
    }

    // ---------------- The shaft ----------------
    function breakShaft() {
      flag('shaftOpen');
      if (window.__shaftWall) window.__shaftWall.visible = false;
      // the collider goes with it, and a way down takes its place
      for (var i = 0; i < level.colliders.length; i++) {
        if (level.colliders[i].id === 'shaftWall') { level.colliders.splice(i, 1); break; }
      }
      if (audio) { audio.doorBash(2); setTimeout(function () { audio.doorBash(2); }, 420); setTimeout(function () { audio.ventBreak(); }, 900); }
      if (window.__shaftHole) {
        window.__shaftHole.visible = true;
        level.interactables.push(window.__shaftHole);
      }
      cinematic('shaftOpen');
      checkBeat();
    }
    function descend() {
      if (state.underground) return;
      state.underground = true;
      flag('underground');
      if (ui.onBars) ui.onBars(true);
      cineLock = true;
      if (audio) audio.ventCrawl();
      // a slow ride down the guide rails, then the lights come up on the floor below
      var t0 = performance.now();
      (function drop() {
        var u = Math.min(1, (performance.now() - t0) / 4200);
        camera.position.set(57.6, 1.68 - u * 0.9, 4.2);
        pitch = -0.5 + u * 0.5;
        applyLook();
        if (u < 1) requestAnimationFrame(drop);
        else {
          camera.position.set(UNDER.entry.x, STANCE.stand.eye, UNDER.entry.z);
          yaw = UNDER.entry.yaw; pitch = 0;
          applyLook();
          state.room = level.roomAt(camera.position.x, camera.position.z);
          cineLock = false;
          if (ui.onBars) ui.onBars(false);
          cinematic('landed', {}, function () { cinematic('cellsSeen'); });
          checkBeat();
        }
      })();
    }
    var UNDER = { entry: { x: 6, z: -78, yaw: Math.PI } };

    // ---------------- Entity hooks ----------------
    function die(reason) {
      if (state.dead || state.ended) return;
      state.dead = true;
      state.deaths++;
      state.deathReason = reason || 'impaled';
      active = false;
      keys.f = keys.b = keys.l = keys.r = keys.tl = keys.tr = false;
      // whatever scene was mid-run, it does not carry on over the death card
      stopCinematics();
      if (audio) audio.death();
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
      if (ui.onDeath) ui.onDeath(state.deathReason);
    }

    // It does not simply kill you — it does one of three things to you, and
    // the choreography runs to the end before the death card comes up.
    function beginKill(forced) {
      if (!kills || kills.isPlaying() || state.dead || state.ended) {
        if (!state.dead) die('impaled');
        return;
      }
      var kind = forced || kills.pick();
      state.killing = true;
      state.attackCd = 1e9;          // nothing else touches you now
      var ok = kills.play(kind, {
        x: camera.position.x, z: camera.position.z, yaw: yaw, eye: camera.position.y
      }, function (reason) {
        state.killing = false;
        die(reason);
      });
      if (!ok) { state.killing = false; die('impaled'); }
    }

    if (entity) {
      entity.onCaught = function (armsLeft, headOn) {
        if (state.dead || state.ended || !active) return;
        if (state.attackCd > 0) return;
        state.attackCd = 1.3;
        var es = entity.getState();
        if (armsLeft === 0 && headOn) {
          // all it has left is the desperate lean of its head
          if (state.riotEquipped) {
            entity.breakHead();
            if (audio) { audio.woodHit(); audio.doorSlam(1); }
            say('Its head comes off against the shield. The body folds like a closed hand.');
            return;
          }
          die('headbutt');
          return;
        }
        if (state.riotEquipped && chance('armBreak', 0.35)) {
          entity.breakArm();
          if (audio) audio.woodHit();
          say(entity.getState().armsLeft === 1
            ? 'The flat hand shatters on the shield. It looks at the stump.'
            : 'The other arm breaks off. It has nothing left to spear you with.');
          // shoved back hard
          var kdx = camera.position.x - es.x, kdz = camera.position.z - es.z;
          var kl = Math.hypot(kdx, kdz) || 1;
          var pushed = collide(camera.position.x + (kdx / kl) * 3, camera.position.z + (kdz / kl) * 3);
          camera.position.x = pushed.x; camera.position.z = pushed.z;
          return;
        }
        beginKill();
      };
      entity.onStep = function (dist, chasing) { if (audio) audio.entityStep(dist, chasing); };
      entity.onWindup = function () {
        if (!audio) return;
        var es = entity.getState();
        audio.windup(Math.hypot(es.x - camera.position.x, es.z - camera.position.z));
      };
      entity.onDoorSlam = function (id) {
        // it does not open doors. It goes through them — unless they are
        // hard-sealed tungsten.
        var es = entity.getState();
        var d2 = Math.hypot(es.x - camera.position.x, es.z - camera.position.z);
        if (id !== 'storageDoor' && level.destroyDoor && level.destroyDoor(id)) {
          if (audio) audio.doorBash(d2);
        } else if (audio) audio.doorSlam(d2);
      };
      entity.onBang = function () {
        if (!audio) return;
        var es = entity.getState();
        audio.bang(Math.hypot(es.x - camera.position.x, es.z - camera.position.z));
      };
      entity.onSpotted = function (first) {
        if (audio) audio.spotted();
        if (first && ui.onMessage) ui.onMessage('It has seen you.');
      };
      entity.onRage = function () {
        if (audio) { audio.spotted(); audio.stinger(); }
        say('Something on its face now. Drawn like a child would draw it.');
      };
      entity.onLurk = function () {};
      entity.onCameraDestroyed = function (i) {
        if (planted[i]) {
          planted[i].alive = false;
          if (planted[i].mesh) planted[i].mesh.visible = false;
          say('A camera feed just died.');
          if (audio) audio.shortCircuit();
          refreshHud();
        }
      };
      entity.onArmBroken = function () {};
      entity.onHeadBroken = function (x, z) {
        // the keycard was inside it the whole time
        var card = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xc7742c, roughness: 0.4 }));
        card.position.set(x, 0.35, z);
        scene.add(card);
        card.userData.interact = { id: 'keycard', label: 'Something buried in the body', verb: 'Tear out' };
        level.interactables.push(card);
      };
      entity.isSealActive = function (id) { return !!state.seals[id]; };
      entity.onVentMove = function (x, z) {
        if (audio) audio.ventScramble(Math.hypot(x - camera.position.x, z - camera.position.z));
      };
      entity.onScream = function (x, z) {
        var d = Math.hypot(x - camera.position.x, z - camera.position.z);
        if (audio) audio.scream(d);
        say(d < 14
          ? 'It SCREAMS. Not a recording of a scream — a scream, out of a thing with no mouth.'
          : 'Something screams, a long way off, and the sound comes back off every wall.');
      };
      entity.onVentSqueeze = function (x, z) {
        var d = Math.hypot(x - camera.position.x, z - camera.position.z);
        if (audio) audio.ventSqueeze(d);
        if (d < 20) say('It goes down on all fours and puts its head into the vent. The rest of it follows.');
      };
      entity.onFlee = function () {
        // a beat behind the scream, or it overwrites it on the same tick
        setTimeout(function () {
          if (state.dead || state.killing) return;
          say('It has its hand clamped over the hole. It is not coming for you. It is going.');
        }, 2200);
      };
      entity.findCameraNear = function (x1, z1, x2, z2) {
        for (var i = 0; i < planted.length; i++) {
          var c = planted[i];
          if (!c.alive) continue;
          var mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
          if (Math.hypot(c.x - x1, c.z - z1) < 9 || Math.hypot(c.x - mx, c.z - mz) < 9) return i;
        }
        return -1;
      };
      entity.cameraPos = function (i) {
        var c = planted[i];
        if (!c) return null;
        return { x: c.x + Math.sin(c.facing) * 1.6, z: c.z + Math.cos(c.facing) * 1.6 };
      };
    }

    // ---------------- Wi-Fi / TV hooks used by the shell ----------------
    window.__onWifiConnected = function () {
      state.wifiConnected = true;
        flag('wifiConnected');
      if (window.__startTv) window.__startTv();
      if (audio) audio.ui();
      if (ui.onMessage) ui.onMessage('Connected. Behind you, one of the screens wakes up.');
    };
    window.__onTvShort = function () {
      state.tvWatched = true;
      if (audio) audio.shortCircuit();
      if (ui.onMessage) ui.onMessage('The screen shorts out. The room is quieter than it was.');
    };

    // ---------------- Security feeds ----------------
    var feedTarget = new THREE.WebGLRenderTarget(256, 160);
    if (THREE.SRGBColorSpace) feedTarget.texture.colorSpace = THREE.SRGBColorSpace;
    var feedCam = new THREE.PerspectiveCamera(72, 1.6, 0.05, 60);
    feedCam.layers.enable(1);          // your cameras can see you too
    var feedPixels = new Uint8Array(256 * 160 * 4);

    function renderFeed(i, canvas2d) {
      var c = planted[i];
      if (!c) return false;
      var x2 = canvas2d.getContext('2d');
      if (!c.alive) {
        x2.fillStyle = '#05070a';
        x2.fillRect(0, 0, canvas2d.width, canvas2d.height);
        return false;
      }
      feedCam.position.set(c.x, c.headY === undefined ? 2.35 : c.headY, c.z);
      feedCam.rotation.set(c.pitch === undefined ? -0.12 : c.pitch, c.facing, 0, 'YXZ');
      // the eye sits inside the camera's own head — hide the model or the
      // lens renders as a black blob in the middle of its own feed
      var ownMesh = c.mesh, wasVisible = ownMesh ? ownMesh.visible : true;
      if (ownMesh) ownMesh.visible = false;
      var prev = renderer.getRenderTarget();
      renderer.setRenderTarget(feedTarget);
      renderer.render(scene, feedCam);
      renderer.readRenderTargetPixels(feedTarget, 0, 0, 256, 160, feedPixels);
      renderer.setRenderTarget(prev);
      if (ownMesh) ownMesh.visible = wasVisible;
      var img = x2.createImageData(256, 160);
      // flip vertically, lift the blacks, push it green — a cheap camera
      for (var y = 0; y < 160; y++) {
        for (var x = 0; x < 256; x++) {
          var si = ((159 - y) * 256 + x) * 4, di = (y * 256 + x) * 4;
          var lum = (feedPixels[si] + feedPixels[si + 1] + feedPixels[si + 2]) / 3;
          // black and white, blacks lifted — a camera from another decade
          var v = Math.min(255, 16 + lum * 2.2);
          img.data[di] = v;
          img.data[di + 1] = v;
          img.data[di + 2] = v;
          img.data[di + 3] = 255;
        }
      }
      x2.putImageData(img, 0, 0);
      return true;
    }

    // ---------------- Loop ----------------
    var clock = new THREE.Clock();
    var velocity = new THREE.Vector3();
    var bobTime = 0, stepAccum = 0, eyeCurrent = STANCE.stand.eye;
    var focusTimer = 0, cullTimer = 0;
    var survivalT = 0, thirstAcc = 0, hungerAcc = 0, energyAcc = 0, stillAcc = 0;
    var collapseAcc = 0, fuelLineT = 20, rageRelight = 0;
    var ACTIVE_LIGHTS = 6;
    level.cullLights(camera.position, ACTIVE_LIGHTS);

    function tick() {
      requestAnimationFrame(tick);
      var dt = Math.min(clock.getDelta(), 0.05);
      var elapsed = clock.elapsedTime;

      if (window.__introActive && window.__introActive.active) {
        window.__introActive.render(dt);
        return;
      }

      // seal shutters slide whether or not the player is moving
      if (level.sealMeshes) {
        Object.keys(level.sealMeshes).forEach(function (k) {
          var m = level.sealMeshes[k];
          var target = state.seals[k] ? 1.2 : 4.8;
          m.position.y += (target - m.position.y) * (1 - Math.exp(-6 * dt));
        });
      }

      if (openingLock) {
        // subtle shake while the fists land on the glass
        camera.rotation.z = Math.sin(elapsed * 60) * 0.004;
      }
      // ---- campaign clock ----
      if (active && !state.dead && !state.ended) {
        beatPoll -= dt;
        if (beatPoll <= 0) { beatPoll = 0.25; checkBeat(); }
        // the phone trickles up off the reception lead
        if (state.phoneCharging && state.phonePct < 100) {
          state.phonePct = Math.min(100, state.phonePct + dt * 0.9);
          if (state.phonePct >= 1 && !state.story.phoneCharged) flag('phoneCharged');
        }
        var b0 = beat();
        if (b0 && b0.timer) {
          // a beat with a countdown: run out and it reaches you
          state.beatTimer -= dt;
          if (ui.onObjective) ui.onObjective(b0, Math.max(0, state.beatTimer));
          if (state.beatTimer <= 0 && !state.beatFailed) {
            // Once. This used to re-run every frame, which pinned it to you
            // permanently and reset its stagger before it could ever finish
            // a swing — you could neither escape it nor be killed by it.
            state.beatTimer = 0;
            state.beatFailed = true;
            if (b0.fail === 'caught' && entity) entity.force(camera.position.x + 1.2, camera.position.z, 'chase');
          }
        }
        if (state.clock > 0) {
          state.clock -= dt;
          if (ui.onClock) ui.onClock(state.dayNo, state.phase, Math.max(0, state.clock));
          if (state.clock <= 0) {
            if (state.phase === 'day') startPhase('night');
            else { state.dayNo++; startPhase('day'); }
          }
        }
      }

      // While a kill is running it owns the camera and the mannequin —
      // nothing else may write to either.
      if (kills && kills.isPlaying()) {
        kills.update(dt);
        renderer.render(scene, camera);
        return;
      }

      if (active && !uiOpen && state.collapseT > 0) {
        // face down on the floor, counting seconds
        state.collapseT -= dt;
        eyeCurrent += (0.32 - eyeCurrent) * (1 - Math.exp(-6 * dt));
        camera.position.y = eyeCurrent;
        if (state.collapseT <= 0) say('You get up. Nothing about that was sleep.');
      } else if (active && !uiOpen) {
        var inputX = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + stick.x;
        var inputZ = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) - stick.y;
        var len = Math.hypot(inputX, inputZ);
        if (len > 1) { inputX /= len; inputZ /= len; }

        if (keys.tl) yaw += 1.7 * dt;
        if (keys.tr) yaw -= 1.7 * dt;
        if (keys.tl || keys.tr) applyLook();

        var st = STANCE[state.stance];
        var canSprint = state.energy > 0 && state.hunger > 0;

        // Auto-sprint. Hold a steady line forward for two seconds and you
        // break into a run on your own — no key to hold, which is the only
        // way it works on touch. Strafing, backing up, crouching, stopping
        // or walking into something drops you straight back to a walk.
        var goingForward = inputZ > 0.55 && Math.abs(inputX) < 0.75;
        var reallyMoving = Math.hypot(velocity.x, velocity.z) > st.speed * 0.5;
        if (state.stance === 'stand' && goingForward && reallyMoving && canSprint) {
          sprintHold += dt;
        } else {
          sprintHold = 0;
        }
        var wasSprinting = state.sprinting;
        state.sprinting = (running || sprintHold >= SPRINT_AFTER) && state.stance === 'stand';
        if (state.sprinting !== wasSprinting && ui.onStance) {
          ui.onStance(state.sprinting ? 'Running' : STANCE[state.stance].label, state.stance);
        }

        var sprintMult = state.sprinting ? (canSprint ? 1.7 : 1.25) : 1;
        var speed = st.speed * sprintMult * (state.fueled ? 1.2 : 1);
        if (state.hallucinating) {
          // the corridor will not hold still
          inputX += Math.sin(elapsed * 0.9) * 0.35;
        }
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

        // the body follows you around, one stance behind nothing
        if (playerRig) {
          if (state.stance !== lastStance) { playerRig.pose(state.stance); lastStance = state.stance; }
          playerRig.group.position.x = camera.position.x;
          playerRig.group.position.z = camera.position.z;
          playerRig.group.rotation.y = yaw;
          if (state.stance === 'stand') {
            walkPhase += dt * moved * 3.4;
            playerRig.setWalk(walkPhase, Math.min(1, moved / 2.2));
          }
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
        // decays fast, and snaps to actually-silent rather than trailing a
        // millionth of a metre of "noise" behind it forever
        if (noiseSpike > 0) {
          noiseSpike -= dt * 26;
          if (noiseSpike < 0.05) noiseSpike = 0;
        }

        if (entity) {
          // pinned while observed: centred enough in view, close enough, unobstructed
          var es0 = entity.getState();
          var vex = es0.x - camera.position.x, vez = es0.z - camera.position.z;
          var vd = Math.hypot(vex, vez) || 1;
          var fx2 = -Math.sin(yaw), fz2 = -Math.cos(yaw);
          var dot = (vex / vd) * fx2 + (vez / vd) * fz2;
          var inView = dot > 0.45 && vd < 48 && entity.los(camera.position.x, camera.position.z, es0.x, es0.z);
          entity.setWatched(inView);
          entity.update(dt, camera.position.x, camera.position.z, playerNoise());

          // ---- everything it drags along with it ----
          var es1 = entity.getState();
          var hunting = es1.mode === 'chase' || es1.mode === 'rage' || es1.mode === 'charge' || es1.mode === 'flee';
          var walking = hunting || es1.mode === 'roam' || es1.mode === 'venting';
          if (audio && es1.mode !== 'dormant') {
            audio.setMotion(vd, walking, hunting);
            // whispering: it is hunting, it is close, and you are the one
            // making the noise you are trying not to make
            var wh = hunting ? Math.max(0, 1 - vd / 26) : 0;
            if (es1.mode === 'rage') wh = Math.max(wh, Math.max(0, 1 - vd / 34) * 1.15);
            audio.setWhisper(wh * (state.sprinting ? 1 : 0.72));
          } else if (audio) {
            audio.setMotion(99, false, false);
            audio.setWhisper(0);
          }

          // The lights do not like being looked at with it in the frame.
          // Seeing it costs you the room you are standing in.
          seenDim += ((inView && es1.mode !== 'dormant' ? 1 : 0) - seenDim) * Math.min(1, dt * (inView ? 3.2 : 0.9));
          if (seenDim > 0.004 || lastSeenDim > 0.004) {
            // a flutter under the dip, so it reads as the building
            // struggling rather than a slider being moved
            var flick = 1 - seenDim * 0.16 * Math.abs(Math.sin(elapsed * 21));
            level.setDim((1 - seenDim * 0.72) * flick);
            lastSeenDim = seenDim;
          }

          panicVoice(dt, vd, hunting);
        }

        // in its rage, the lights die wherever it walks
        if (entity) {
          var esR = entity.getState();
          if (esR.raging) {
            for (var lf = 0; lf < level.lightFixtures.length; lf++) {
              var F = level.lightFixtures[lf];
              var fdx = F.light.position.x - esR.x, fdz = F.light.position.z - esR.z;
              if (!F.killed && fdx * fdx + fdz * fdz < 36) {
                F.killed = true;
                F.light.visible = false;
                if (F.panel) F.panel.material.emissiveIntensity = 0.02;
              }
            }
            rageRelight = 4;
          } else if (rageRelight > 0) {
            rageRelight -= dt;
            if (rageRelight <= 0) {
              for (var lf2 = 0; lf2 < level.lightFixtures.length; lf2++) {
                var F2 = level.lightFixtures[lf2];
                if (F2.killed) {
                  F2.killed = false;
                  F2.light.visible = true;
                  if (F2.panel) F2.panel.material.emissiveIntensity = 1.6;
                }
              }
            }
          }
        }

        // ---------------- survival ----------------
        if (state.attackCd > 0) state.attackCd -= dt;
        survivalT += dt;
        if (survivalT > 1) {
          survivalT = 0;
          thirstAcc += 1; hungerAcc += 1;
          if (thirstAcc >= 50) { thirstAcc = 0; state.thirst = Math.max(0, state.thirst - 1); refreshHud(); }
          if (hungerAcc >= 70) { hungerAcc = 0; state.hunger = Math.max(0, state.hunger - 1); refreshHud(); }
          if (state.needToilet && Math.random() < 0.12) say('You need the toilet. Genuinely.');
        }
        var movedNow = Math.hypot(velocity.x, velocity.z);
        if (running && movedNow > 0.6 && state.energy > 0) {
          energyAcc += dt;
          if (energyAcc > 3.5) { energyAcc = 0; state.energy = Math.max(0, state.energy - 1); refreshHud(); }
        } else if (movedNow < 0.15) {
          stillAcc += dt;
          if (stillAcc > 3 && state.energy < 20) { stillAcc = 0; state.energy++; refreshHud(); }
        } else { stillAcc = 0; }
        if (state.fueled && state.energy <= 20) state.fueled = false;
        if (state.fueled) {
          fuelLineT -= dt;
          if (fuelLineT <= 0) { fuelLineT = 22 + Math.random() * 10; say(UNHINGED[Math.floor(Math.random() * UNHINGED.length)]); }
        }
        // the view opens up a little once you are actually running
        var fovTarget = (state.fueled ? 84 : 74) + (state.sprinting ? 4 : 0);
        if (Math.abs(camera.fov - fovTarget) > 0.2) {
          camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-4 * dt));
          camera.updateProjectionMatrix();
        }
        state.hallucinating = state.thirst <= 0;
        if (state.hallucinating) {
          camera.rotation.z = Math.sin(elapsed * 0.7) * 0.05;
          collapseAcc += dt;
          if (collapseAcc > 15) {
            collapseAcc = 0;
            if (chance('collapse', 0.35)) {
              state.collapseT = 50;
              say('The floor comes up to meet you. Fifty seconds.');
            }
          }
        } else if (!prefersReducedMotion) camera.rotation.z = 0;
        if (state.hunger <= 0) {
          state.starveT += dt;
          if (state.starveT > 180) die('starved');
        } else state.starveT = 0;

        // walking out — the only good ending
        if (state.entranceOpen && camera.position.z > 7.4 && !state.ended) {
          state.ended = true;
          active = false;
          if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
          if (ui.onEnding) ui.onEnding();
        }
      }

      weapons.update(dt, bobTime);

      for (var ca = camAnims.length - 1; ca >= 0; ca--) {
        var A = camAnims[ca];
        A.t += dt;
        var u = Math.min(1, A.t / A.dur);
        var ease = 1 - Math.pow(1 - u, 3);
        if (A.kind === 'tripod') {
          // legs unfold, then the whole thing settles with a bounce
          var sy = 0.25 + ease * 0.75 + (u > 0.85 ? Math.sin((u - 0.85) * 22) * 0.03 * (1 - u) : 0);
          A.mesh.scale.set(0.4 + ease * 0.6, sy, 0.4 + ease * 0.6);
        } else {
          A.arm.rotation.x = 1.3 * (1 - ease);
        }
        if (u >= 1) camAnims.splice(ca, 1);
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

    // ---------------- The opening, interior half ----------------
    var openingLock = false;
    // Thrown in, not walked in — you come to on your back, on the floor,
    // with the lock already turning behind you. Eye height rides the normal
    // stance system (crawl/crouch/stand) rather than fighting it: the main
    // loop re-derives camera.position.y from state.stance every frame, so a
    // hand-rolled tween on position.y directly gets overwritten within a
    // frame or two. Pitch isn't touched by that loop, so it tweens freely.
    function playOpening(onDone) {
      openingLock = true;
      camera.position.set(0, STANCE.stand.eye, 5.4);
      yaw = Math.PI + 0.35; pitch = 1.1;    // flat on the floor, looking at the ceiling
      applyLook();
      state.stance = 'crawl';

      function tweenPitch(dur, from, to) {
        var t0 = performance.now();
        (function step() {
          var u = Math.min(1, (performance.now() - t0) / dur);
          pitch = from + (to - from) * (u * u * (3 - 2 * u));
          applyLook();
          if (u < 1) requestAnimationFrame(step);
        })();
      }

      var steps = [
        // still dark — you hear them seal it before you can see anything
        [0, function () { if (audio) audio.sealSlam(); }],
        // vision swims back
        [1600, function () { tweenPitch(1900, 1.1, 0.55); }],
        // getting your feet under you
        [3500, function () { state.stance = 'crouch'; }],
        [3700, function () { tweenPitch(1500, 0.55, 0); }],
        [5000, function () { state.stance = 'stand'; }],
        [5400, function () { say('Get up. Get up—get up.'); }],
        [6300, function () {
          // one look back at the doors, out of habit more than hope
          var startYaw = yaw, t0 = performance.now();
          (function turn() {
            var u = Math.min(1, (performance.now() - t0) / 480);
            yaw = startYaw + (Math.PI - startYaw) * (u * u * (3 - 2 * u));
            applyLook();
            if (u < 1) requestAnimationFrame(turn);
          })();
          camera.position.z = 5.7;
        }],
        [6900, function () { if (audio) audio.glassBang(); }],
        [7500, function () { say('Locked. From the outside.'); }],
        [9000, function () {
          openingLock = false;
          if (onDone) onDone();
        }]
      ];
      steps.forEach(function (st2) { setTimeout(st2[1], st2[0]); });
    }

    // ---------------- Public surface ----------------
    return {
      // Kick the campaign off: first objective on screen, first stretch of
      // dark on the clock. Called once, when the player first takes control.
      beginCampaign: function () {
        if (state.beat > 0 || state.clock > 0) return;
        state.beat = 0;
        state.phase = 'night';
        state.clock = S.NIGHT_LEN;
        if (entity) entity.setDaylight(false);
        if (ui.onClock) ui.onClock(state.dayNo, 'night', state.clock);
        if (ui.onObjective) ui.onObjective(beat(), 0);
        cinematic('intro');
      },
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
      playOpening: playOpening,
      renderer: renderer,
      audioEngine: function (on) { if (audio) audio.engine(on); },
      audioBrakes: function () { if (audio) audio.brakes(); },
      audioCreak: function () { if (audio) audio.door('wood', true); },
      audioBash: function () { if (audio) audio.doorBash(2); },
      audioStart: function () { if (audio) audio.start(); },
      respawn: function () {
        if (kills) kills.cancel();
        state.killing = false;
        if (ui.onKillEnd) ui.onKillEnd(null);
        state.dead = false;
        state.collapseT = 0;
        state.attackCd = 0;
        state.deathReason = null;
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
          sprinting: !!state.sprinting, sprintHold: sprintHold,
          room: state.room ? state.room.id : null,
          active: active, locked: pointerLocked, uiOpen: uiOpen,
          pointerLockBlocked: pointerLockBlocked,
          hasKey: state.hasKey, storageOpen: state.storageOpen,
          hasFlashlight: state.hasFlashlight, torchOn: state.torchOn,
          hasGlock: state.hasGlock, ammo: state.ammo, inMag: state.inMag,
          wifiConnected: state.wifiConnected, tvWatched: state.tvWatched,
          dead: state.dead, deaths: state.deaths, deathReason: state.deathReason,
          entity: entity ? entity.getState() : null,
          hunger: state.hunger, thirst: state.thirst, energy: state.energy,
          fueled: state.fueled, collapsed: state.collapseT > 0,
          hallucinating: state.hallucinating, needToilet: state.needToilet,
          cams: state.cams, plantedCount: planted.length,
          waterN: state.waterN, beansN: state.beansN, fuelN: state.fuelN,
          weapon: state.weapon, shells: state.shells, arRounds: state.arRounds, tube: state.tube,
          riotGear: state.riotGear, keycard: state.keycard,
          seals: { west: state.seals.sealWest, east: state.seals.sealEast },
          entranceOpen: state.entranceOpen, ended: state.ended,
          camsTaken: state.camsTaken, birchAwake: state.birchAwake,
          riotEquipped: state.riotEquipped,
          hotbar: state.hotbar.slice(), hotbarSel: state.hotbarSel,
          beat: state.beat, beatId: beat() ? beat().id : null,
          beatTimer: state.beatTimer, dayNo: state.dayNo,
          beatSeen: state.beatSeen, beatFailed: state.beatFailed,
          dayPhase: state.phase, clock: state.clock,
          story: JSON.parse(JSON.stringify(state.story)),
          beansNamed: state.beansNamed,
          powerOn: state.powerOn, hasPhone: state.hasPhone, hasSledge: state.hasSledge,
          underground: state.underground, phonePct: state.phonePct,
          mapUnlocked: !!state.mapUnlocked, sawPhotos: !!state.sawPhotos,
          ventOpen: state.ventOpen.slice(),
          focus: focused ? focused.userData.interact.id : null
        };
      },
      // test/debug helpers
      forceEntity: function (x, z, m, lurkId) { if (entity) entity.force(x, z, m, lurkId); },
      setSeal: function (w) { return setSeal(w); },
      shockEntity: function () {
        if (!entity) return false;
        var ok = entity.shockAtCage();
        if (ok) { if (audio) audio.zap(); say('The cage floor lights. It stands perfectly still, cooking.'); }
        return ok;
      },
      renderFeed: renderFeed,
      rotateCam: function (i, dyaw, dpitch) {
        var c = planted[i];
        if (!c) return;
        c.facing += dyaw;
        c.pitch = Math.max(-0.6, Math.min(0.4, (c.pitch === undefined ? -0.12 : c.pitch) + dpitch));
        // a wall unit's mesh is placed plate-to-wall, half a turn from where
        // it looks — panning must keep that offset or the plate leaves the wall
        if (c.mesh) c.mesh.rotation.y = (c.type === 'wall') ? c.facing - Math.PI : c.facing;
      },
      entityNearCam: function (i) {
        if (!entity || !planted[i]) return false;
        var es = entity.getState();
        if (es.mode === 'dormant' || es.mode === 'destroyed') return false;
        return Math.hypot(es.x - planted[i].x, es.z - planted[i].z) < 11;
      },
      // Opening the feeds with all five of your own cameras down is what
      // starts it. It does not appear on one of yours — it is already in the
      // cage it tore open, on the camera that was here before you were.
      notifyCamerasViewed: function () {
        if (!state.camsTaken || state.birchAwake) return false;
        if (plantedByPlayer() < 5) return false;
        state.birchAwake = true;
        if (entity) entity.settleInCage(54.3, 56);
        if (audio) { audio.setPhase('eerie'); audio.doorSlam(30); }
        say('The speakers die mid-chorus.');
        refreshHud();
        return true;
      },
      // Viewing CAM 0 while it is folded up in the cage is the reveal.
      notifyFeedViewed: function (i) {
        if (i !== 0 || !state.birchAwake || state.story.sawBirch) return false;
        if (!entity) return false;
        var es = entity.getState();
        if (Math.hypot(es.x - 54.3, es.z - 56) > 6) return false;
        flag('sawBirch');
        cinematic('sawBirch');
        return true;
      },
      // Only CAM 0 can do this. The five you carried in are leftovers with
      // no taser in them, which is the whole reason the first one matters.
      canShock: function (i) {
        var c = planted[i];
        if (!c || !c.taser || !c.alive || !entity) return false;
        var es = entity.getState();
        if (es.mode === 'dormant' || es.mode === 'destroyed') return false;
        return Math.hypot(es.x - c.x, es.z - c.z) < 11;
      },
      shockAt: function (i) {
        var c = planted[i];
        if (!entity || !c) return false;
        if (!c.taser) { say('No taser in this one. It is older stock — they all are, except the one that was already here.'); return false; }
        var es = entity.getState();
        if (Math.hypot(es.x - c.x, es.z - c.z) >= 11) return false;

        entity.shocked();
        if (audio) {
          audio.zap();
          setTimeout(function () {
            var es2 = entity.getState();
            audio.scream(Math.hypot(es2.x - camera.position.x, es2.z - camera.position.z));
          }, 350);
        }
        flag('shockedInCage');
        cinematic('shocked');
        // it comes out of the cage through the camera that shocked it
        setTimeout(function () {
          c.alive = false;
          if (c.mesh) c.mesh.visible = false;
          if (audio) audio.doorBash(24);
          cinematic('camDead');
          refreshHud();
        }, 4200);
        return true;
      },
      plantedCams: function () { return planted.map(function (c) { return { x: c.x, z: c.z, alive: c.alive, type: c.type, headY: c.headY, facing: c.facing, pitch: c.pitch }; }); },
      entityLurk: function () { return entity ? entity.getState().lurk : null; },
      setLurkScale: function (v) { if (entity) entity.setLurkScale(v); },
      setChance: function (name, v) { debugChance[name] = v; },
      giveDebug: function (what) {
        if (what === 'cams') state.cams += 5;
        if (what === 'riot') state.riotGear = true;
        if (what === 'water') state.waterN += 5;
        if (what === 'beans') state.beansN += 5;
        if (what === 'fuel') state.fuelN += 12;
        if (what === 'keycard') state.keycard = true;
        refreshHud();
      },
      consumeDebug: function (kind) { consume(kind); },
      selectSlot: selectSlot,
      useSelected: useSelected,
      assignHotbar: assignHotbar,
      equipRiot: equipRiot,
      ownedItems: ownedItems,
      lootSample: function (n) {
        var P = { cameras: 0.30, ammo: 0.10, gun: 0.02, water: 0.50, beans: 0.60, fuel: 0.25, riot: 0.09 };
        var out = {};
        Object.keys(P).forEach(function (k) { out[k] = 0; });
        for (var i = 0; i < n; i++) {
          Object.keys(P).forEach(function (k) { if (Math.random() < P[k]) out[k]++; });
        }
        Object.keys(out).forEach(function (k) { out[k] = out[k] / n; });
        return out;
      },
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
      // A bright lamp anywhere, so visual QA can actually see the geometry
      // it is checking. Nothing calls this during play.
      debugLight: function (x, y, z, intensity) {
        if (window.__qaLight) scene.remove(window.__qaLight);
        var l = new THREE.PointLight(0xffffff, intensity || 20, 34, 2);
        l.position.set(x, y === undefined ? 2.4 : y, z);
        scene.add(l);
        window.__qaLight = l;
      },
      // Stand a row of figures in front of the camera, for visual QA.
      debugStage: function (rows, z, lightAt) {
        if (window.__stage) { scene.remove(window.__stage); }
        var stage = new THREE.Group();
        rows.forEach(function (r) {
          var h = window.buildHumanoid(THREE, r[0], { pose: r[1] });
          h.group.position.set(r[2], 0, z || 0);
          h.group.rotation.y = Math.PI;
          stage.add(h.group);
        });
        var l = new THREE.PointLight(0xffffff, 14, 26, 2);
        l.position.set(0.7, 2.4, (z || 0) + (lightAt || 2));
        stage.add(l);
        scene.add(stage);
        window.__stage = stage;
      },
      // ---- humanoid rig introspection, for the body test suite ----
      probeHumanoid: function (outfit, poseName, ry) {
        var h = window.buildHumanoid(THREE, outfit, { pose: poseName || 'stand' });
        if (ry) h.group.rotation.y = ry;
        h.group.updateMatrixWorld(true);
        var b = new THREE.Box3().setFromObject(h.group);
        return {
          joints: Object.keys(h.joints),
          nested: h.group.children.length === 1 && h.group.children[0].isGroup,
          minY: b.min.y, height: b.max.y - b.min.y
        };
      },
      probeOutfits: function (names) {
        var torsoColors = [], built = 0, mats = {};
        var count = 0;
        names.forEach(function (n) {
          // build each outfit twice: identical figures must share materials
          var a = window.buildHumanoid(THREE, n);
          var b2 = window.buildHumanoid(THREE, n);
          built++;
          [a, b2].forEach(function (fig) {
            fig.each(function (m) { if (!mats[m.material.uuid]) { mats[m.material.uuid] = 1; count++; } });
          });
          torsoColors.push(a.joints.torso.children[0].material.uuid);
        });
        return {
          built: built,
          torsoColors: torsoColors,
          matCount: count,
          sharedMaterials: count < names.length * 8
        };
      },
      countHumanoids: function () {
        var byRoom = { assembly: 0, exterm: 0, storage: 0, other: 0 }, total = 0;
        var v = new THREE.Vector3();
        scene.traverse(function (o) {
          if (!o.userData || !o.userData.humanoid) return;
          total++;
          o.getWorldPosition(v);
          var r = level.roomAt(v.x, v.z);
          var id = r ? r.id : 'other';
          if (byRoom[id] === undefined) byRoom.other++; else byRoom[id]++;
        });
        return { total: total, byRoom: byRoom };
      },
      eachHumanoidBounds: function () {
        var out = [], b = new THREE.Box3();
        scene.traverse(function (o) {
          if (!o.userData || !o.userData.humanoid || o === playerRig.group) return;
          b.setFromObject(o);
          out.push({
            outfit: o.userData.humanoid,
            minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z,
            minY: b.min.y, maxY: b.max.y,
            cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2
          });
        });
        return out;
      },
      // Which bodies are lying through the scenery. Bodies sprawl over a
      // metre, so a corpse placed clear of a prop can still reach into it.
      bodiesInsideProps: function () {
        var out = [], b = new THREE.Box3();
        scene.traverse(function (o) {
          if (!o.userData || !o.userData.humanoid || (playerRig && o === playerRig.group)) return;
          b.setFromObject(o);
          for (var i = 0; i < level.colliders.length; i++) {
            var c = level.colliders[i];
            // doorways and the barricade are meant to be walked through
            if (c.id) continue;
            var overlapX = Math.min(b.max.x, c.x2) - Math.max(b.min.x, c.x1);
            var overlapZ = Math.min(b.max.z, c.z2) - Math.max(b.min.z, c.z1);
            if (overlapX > 0.06 && overlapZ > 0.06) {
              out.push({
                outfit: o.userData.humanoid,
                cx: +((b.min.x + b.max.x) / 2).toFixed(2), cz: +((b.min.z + b.max.z) / 2).toFixed(2),
                into: [c.x1, c.z1, c.x2, c.z2], overlap: +Math.min(overlapX, overlapZ).toFixed(2)
              });
              break;
            }
          }
        });
        return out;
      },
      // Every interactable item, checked for interpenetrating anything else.
      // Resting on a surface or sitting beside something is fine; being sunk
      // into it is not, so this measures overlap volume against the smaller
      // of the two boxes rather than just asking whether they touch.
      // Flat signage should stand in front of the wall it hangs on. Walls are
      // 0.18 thick, so a plate placed 0.07 off the wall's centreline ends up
      // behind its own surface and is simply not there when you look.
      signsInWalls: function () {
        var out = [], b = new THREE.Box3(), wb = new THREE.Box3();
        var walls = [];
        (level.group || scene).traverse(function (o) {
          if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
          var pr = o.geometry.parameters;
          // wall planes are the big thin slabs
          if (pr.depth === undefined) return;
          var big = Math.max(pr.width || 0, pr.depth || 0);
          var thin = Math.min(pr.width || 0, pr.depth || 0);
          if (big > 6 && thin < 0.25 && (pr.height || 0) > 2.5) walls.push(o);
        });
        (level.group || scene).traverse(function (o) {
          if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
          var pr = o.geometry.parameters;
          if (pr.depth === undefined) return;
          var t = Math.min(pr.width, pr.height, pr.depth);
          // thin plates only, small enough to be signage, and mounted at
          // reading height — vent grates are thin plates too, and those are
          // supposed to be set into the wall
          if (t > 0.06 || Math.max(pr.width, pr.height, pr.depth) > 1.4) return;
          if (o.position.y < 1.2) return;
          b.setFromObject(o);
          for (var i = 0; i < walls.length; i++) {
            wb.setFromObject(walls[i]);
            var dx = Math.min(b.max.x, wb.max.x) - Math.max(b.min.x, wb.min.x);
            var dy = Math.min(b.max.y, wb.max.y) - Math.max(b.min.y, wb.min.y);
            var dz = Math.min(b.max.z, wb.max.z) - Math.max(b.min.z, wb.min.z);
            if (dx > 0.01 && dy > 0.01 && dz > 0.01) {
              var bx = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
              if ((dx * dy * dz) / Math.max(bx, 1e-9) > 0.5) {
                out.push({
                  text: 'plate', axis: 'xyz',
                  pos: [b.min.x, b.min.y, b.min.z].map(function (v) { return +v.toFixed(2); })
                });
              }
              break;
            }
          }
        });
        return out;
      },
      propOverlaps: function (frac) {
        var limit = frac === undefined ? 0.28 : frac;
        // Two things are meant to be inside the scenery: a vent grate is set
        // into the wall it vents through, and the office door was thrown so
        // hard it is buried in the plaster.
        var EMBEDDED = { vent: 1, embeddedDoor: 1 };
        var root = level.group || scene;
        // the item's own model: anything under the same top-level node is a
        // sibling part (a lens inside a bezel), not a collision
        function topOf(o) {
          var n = o;
          while (n.parent && n.parent !== root && n.parent !== scene) n = n.parent;
          return n;
        }
        var items = [];
        level.interactables.forEach(function (m) {
          if (!m.visible) return;
          if (EMBEDDED[m.userData.interact.id]) return;
          var b = new THREE.Box3().setFromObject(m);
          if (!isFinite(b.min.x)) return;
          items.push({ mesh: m, id: m.userData.interact.id, box: b, top: topOf(m) });
        });
        var others = [];
        root.traverse(function (o) {
          if (!o.isMesh || !o.visible) return;
          others.push(o);
        });
        function vol(b) {
          return Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.y - b.min.y) * Math.max(0, b.max.z - b.min.z);
        }
        // Volume alone cannot tell "resting on" from "sunk through": a sheet
        // of paper is so thin that a cup standing on it reads as a big share
        // of the paper's volume. Depth can — a couple of millimetres is
        // contact, a couple of centimetres on every axis is penetration.
        var MIN_DEPTH = 0.015;
        function overlapOf(a, b) {
          var dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
          var dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
          var dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
          if (dx <= 0 || dy <= 0 || dz <= 0) return { v: 0, d: 0 };
          return { v: dx * dy * dz, d: Math.min(dx, dy, dz) };
        }
        var out = [], ob = new THREE.Box3();
        items.forEach(function (it) {
          var iv = vol(it.box);
          if (iv <= 0) return;
          var worst = null;
          for (var k = 0; k < others.length; k++) {
            var o = others[k];
            if (o === it.mesh) continue;
            if (topOf(o) === it.top) continue;          // part of the same object
            ob.setFromObject(o);
            if (!isFinite(ob.min.x)) continue;
            var o2 = overlapOf(it.box, ob);
            if (o2.v <= 0 || o2.d < MIN_DEPTH) continue;
            var share = o2.v / Math.min(iv, Math.max(vol(ob), 1e-9));
            if (share > limit && (!worst || share > worst.share)) {
              worst = {
                share: share, depth: o2.d,
                oc: [(ob.min.x + ob.max.x) / 2, (ob.min.y + ob.max.y) / 2, (ob.min.z + ob.max.z) / 2],
                os: [ob.max.x - ob.min.x, ob.max.y - ob.min.y, ob.max.z - ob.min.z]
              };
            }
          }
          if (worst) {
            out.push({
              id: it.id, share: +worst.share.toFixed(2), depth: +worst.depth.toFixed(3),
              at: [it.box.min.x, it.box.min.y, it.box.min.z].map(function (v) { return +v.toFixed(2); }),
              size: [it.box.max.x - it.box.min.x, it.box.max.y - it.box.min.y, it.box.max.z - it.box.min.z]
                .map(function (v) { return +v.toFixed(3); }),
              intoAt: worst.oc.map(function (v) { return +v.toFixed(2); }),
              intoSize: worst.os.map(function (v) { return +v.toFixed(2); })
            });
          }
        });
        return out;
      },
      // ---- the power panel ----
      wireState: function () {
        if (!state.wires) state.wires = makeWires();
        return { left: state.wires.left.slice(), right: state.wires.right.slice(), links: state.wires.links.slice() };
      },
      linkWire: function (leftRow, rightRow) {
        if (!state.wires || state.powerOn) return false;
        // a terminal takes one wire: whoever had it loses it
        var prev = state.wires.links.indexOf(rightRow);
        if (prev >= 0 && prev !== leftRow) {
          state.wires.links[prev] = state.wires.links[leftRow];
        }
        state.wires.links[leftRow] = rightRow;
        if (audio) audio.ui();
        if (wiresCorrect(state.wires)) powerRestored();
        return true;
      },
      // ---- the owner's phone ----
      emailCode: function () {
        if (!state.emailCode) state.emailCode = String(1000 + Math.floor(Math.random() * 9000));
        return state.emailCode;
      },
      sawPhotos: function () {
        if (state.sawPhotos) return;
        state.sawPhotos = true;
        cinematic('photos');
      },
      // ---- campaign test hooks ----
      debugConnectWifi: function () { state.wifiConnected = true; flag('wifiConnected'); },
      debugFill: function () { state.hunger = 10; state.thirst = 10; state.energy = 20; refreshHud(); },
      debugStarve: function () { state.hunger = 0; state.energy = 0; refreshHud(); },
      debugChargePhone: function () { state.phonePct = 100; flag('phoneCharged'); checkBeat(); },
      // test seams: the sim clock is wall-clock, so a 30-second countdown
      // cannot be waited out in a headless run at two frames a second
      debugExpireBeat: function () { state.beatTimer = 0.001; },
      debugKill: function (reason) { die(reason || 'impaled'); },
      debugDawn: function () { state.dayNo++; startPhase('day'); },
      debugNightfall: function () { startPhase('night'); },
      debugRedealWires: function () { state.wires = makeWires(); return wiresWrong(state.wires); },
      // ---- the Birch ----
      playerNoise: playerNoise,
      makeNoise: makeNoise,
      shootEntity: function (side) { return entity ? entity.hitShot(1.1, side) : false; },
      audioApi: function () {
        return audio ? {
          setMotion: !!audio.setMotion, setWhisper: !!audio.setWhisper,
          scream: !!audio.scream, ventSqueeze: !!audio.ventSqueeze, panic: !!audio.panic
        } : null;
      },
      lightLevel: function () {
        var n = 0;
        for (var i = 0; i < level.lightFixtures.length; i++) {
          if (!level.lightFixtures[i].killed) n += level.lightFixtures[i].light.intensity;
        }
        return n;
      },
      seenDim: function () { return seenDim; },
      speedTable: function () {
        var e = entity ? entity.speeds() : { roam: 0, chase: 0, rage: 0 };
        return {
          walk: STANCE.stand.speed,
          sprint: STANCE.stand.speed * 1.7,
          crouch: STANCE.crouch.speed,
          roam: e.roam, chase: e.chase, rage: e.rage
        };
      },
      killKinds: function () { return kills ? kills.kinds.slice() : []; },
      killNow: function (kind) { beginKill(kind); return kills ? kills.current() : null; },
      killState: function () {
        return kills
          ? { playing: kills.isPlaying(), kind: kills.current(), progress: kills.progress() }
          : { playing: false, kind: null, progress: 0 };
      },
      debugPlayScene: function (key) { cinematic(key); },
      supplyCount: function () {
        var n = 0;
        for (var i = 0; i < level.interactables.length; i++) {
          if (level.interactables[i].userData.interact.id === 'supplyItem') n++;
        }
        return n;
      },
      interactId: function (id) {
        for (var i = 0; i < level.interactables.length; i++) {
          var o = level.interactables[i];
          if (o.userData.interact.id !== id) continue;
          focused = o;
          tryInteract();
          return true;
        }
        // the shaft mouth is not listed until the wall comes down
        if (id === 'shaftDown' && window.__shaftHole) { focused = window.__shaftHole; tryInteract(); return true; }
        return false;
      },
      sawMapNow: function () {
        if (state.story.sawMap) return;
        flag('sawMap');
        cinematic('sawMap');
        checkBeat();
      },
      acceptEmail: function () {
        if (state.story.emailOpen) return;
        flag('emailOpen');
        state.mapUnlocked = true;
        say('Accepted. The layout is on the terminal now.');
        checkBeat();
      },
      torchInfo: function () {
        var wp = new THREE.Vector3(), wt = new THREE.Vector3();
        torchBeam.getWorldPosition(wp);
        torchTarget.getWorldPosition(wt);
        // does the beam point the way the camera is facing?
        var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        var beamDir = wt.clone().sub(wp).normalize();
        return {
          intensity: torchBeam.intensity,
          onCamera: torchBeam.parent === camera,
          aimsForward: beamDir.dot(fwd) > 0.97,
          on: state.torchOn
        };
      },
      supplyItemRooms: function () {
        var out = [], v = new THREE.Vector3();
        for (var i = 0; i < level.interactables.length; i++) {
          var o = level.interactables[i];
          if (o.userData.interact.id !== 'supplyItem') continue;
          var d = o.userData.interact;
          o.getWorldPosition(v);
          var r = level.roomAt(v.x, v.z);
          var meshes = 0;
          if (d.node) d.node.traverse(function (m) { if (m.isMesh) meshes++; });
          out.push({ kind: d.kind2, room: r ? r.id : null, x: v.x, y: v.y, z: v.z, meshes: meshes });
        }
        return out;
      },
      roomNames: function () {
        return window.LEVEL.rooms.map(function (r) { return { id: r.id, name: r.name }; });
      },
      roomOf: function (x, z) {
        var r = level.roomAt(x, z);
        return r ? { id: r.id, x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2 } : null;
      },
      playerBodyInfo: function () {
        if (!playerRig) return { exists: false };
        playerRig.group.updateMatrixWorld(true);
        var b = new THREE.Box3().setFromObject(playerRig.group);
        var meshes = 0, offLayer = 0;
        playerRig.each(function (m) { meshes++; if (!m.layers.isEnabled(1) || m.layers.isEnabled(0)) offLayer++; });
        return {
          exists: true, meshes: meshes, offLayer: offLayer, allLayer1: offLayer === 0,
          mainCameraSeesIt: camera.layers.isEnabled(1),
          feedCamSeesIt: feedCam.layers.isEnabled(1),
          x: playerRig.group.position.x, z: playerRig.group.position.z,
          minY: b.min.y, height: b.max.y - b.min.y,
          hipAngles: [playerRig.joints.hipL.rotation.x, playerRig.joints.hipR.rotation.x]
        };
      },
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
