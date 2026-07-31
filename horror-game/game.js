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
      if (!started || muted || !roomId) return;
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
      if (id && (ITEM_DEFS[id].kind === 'weapon' || id === 'camera')) weapons.select(id);
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
      readConfession: false,
      readRoster: false,
      readValuation: false,
      readEvidenceLog: false,
      supplies: false,
      room: null,
      seenAssembly: false,
      dead: false,
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
        case 'KeyF': plantCamera(); break;
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
          focused.visible = false;
          if (audio) audio.pickup();
          say('A keycard, warm from the machinery. Stamped: FRONT ENTRANCE.');
          refreshHud();
          break;
        case 'supplies':
          state.supplies = true;
          if (audio) audio.pickup();
          state.waterN += 2; state.beansN += 2;
          giveItem('water'); giveItem('beans');
          say('Water, and a few cans of beans. Exactly what Nick ran out of.');
          refreshHud();
          break;
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
      water: { label: 'WATER', kind: 'consume' },
      beans: { label: 'BEANS', kind: 'consume' },
      fuel: { label: 'NRG', kind: 'consume' },
      riot: { label: 'RIOT', kind: 'armor' }
    };
    function itemCount(id) {
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
          say('The water is warm and perfect.');
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
        } else {
          say('Cold beans, straight from the can.');
        }
        if (audio) audio.consume('beans');
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
        if (entity.hitShot(totalStagger)) {
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

    // ---------------- Entity hooks ----------------
    function die(reason) {
      if (state.dead || state.ended) return;
      state.dead = true;
      state.deaths++;
      state.deathReason = reason || 'impaled';
      active = false;
      keys.f = keys.b = keys.l = keys.r = keys.tl = keys.tr = false;
      if (audio) audio.death();
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
      if (ui.onDeath) ui.onDeath(state.deathReason);
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
        die('impaled');
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
        var sprintMult = running && state.stance === 'stand' ? (canSprint ? 1.7 : 1.25) : 1;
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

        if (entity) {
          // pinned while observed: centred enough in view, close enough, unobstructed
          var es0 = entity.getState();
          var vex = es0.x - camera.position.x, vez = es0.z - camera.position.z;
          var vd = Math.hypot(vex, vez) || 1;
          var fx2 = -Math.sin(yaw), fz2 = -Math.cos(yaw);
          var dot = (vex / vd) * fx2 + (vez / vd) * fz2;
          entity.setWatched(dot > 0.45 && vd < 48 && entity.los(camera.position.x, camera.position.z, es0.x, es0.z));
          entity.update(dt, camera.position.x, camera.position.z);
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
        var fovTarget = state.fueled ? 84 : 74;
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
          room: state.room ? state.room.id : null,
          active: active, locked: pointerLocked, uiOpen: uiOpen,
          pointerLockBlocked: pointerLockBlocked,
          hasKey: state.hasKey, storageOpen: state.storageOpen,
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
      notifyCamerasViewed: function () {
        if (!state.camsTaken || state.birchAwake || planted.length < 5) return false;
        state.birchAwake = true;
        var i = Math.floor(Math.random() * planted.length);
        var c = planted[i];
        var fx3 = -Math.sin(c.facing), fz3 = -Math.cos(c.facing);
        if (entity) entity.spawnAt(c.x + fx3 * 3, c.z + fz3 * 3, Math.atan2(-(-fx3), -(-fz3)));
        if (audio) { audio.setPhase('eerie'); audio.doorSlam(30); }
        say('The speakers die mid-chorus. CAM ' + (i + 1) + ' — it is already looking at the lens.');
        refreshHud();
        return true;
      },
      shockAt: function (i) {
        if (!entity || !planted[i]) return false;
        var es = entity.getState();
        if (Math.hypot(es.x - planted[i].x, es.z - planted[i].z) >= 11) return false;
        if (es.lurk === 'cage') {
          var ok = entity.shockAtCage();
          if (ok) { if (audio) audio.zap(); say('The cage floor lights. It stands perfectly still, cooking.'); }
          return ok;
        }
        entity.shocked();
        if (audio) {
          audio.zap();
          setTimeout(function () {
            var es2 = entity.getState();
            audio.scream(Math.hypot(es2.x - camera.position.x, es2.z - camera.position.z));
          }, 350);
        }
        say('It takes the current — and SCREAMS — and starts running. Seal the door. Now.');
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
