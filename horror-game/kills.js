/*
 * THE BIRCH — the ways it kills you.
 *
 * Three choreographed deaths. Each one takes the camera off the player,
 * takes the mannequin's body off its own brain, and runs a hand-animated
 * timeline until there is nothing left to animate.
 *
 * The impale starts in your own eyes — you look down at what is in your
 * chest — and then leaves them, because the worst of it is the part you
 * were never meant to see. The other two never let go of first person at
 * all: one drives you into the floor, the other puts you on it.
 *
 *   window.buildKills(THREE, ctx) → { play, update, isPlaying, cancel }
 *
 * ctx: { camera, scene, entity, playerRig, ui, audio }
 */
(function () {
  'use strict';

  // ---- little easing helpers ----
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // 0 before `a`, 1 after `b`, smooth in between
  function ramp(t, a, b) { return clamp01((t - a) / (b - a || 1e-6)); }
  function ease(v) { return v * v * (3 - 2 * v); }
  function seg(t, a, b) { return ease(ramp(t, a, b)); }
  // a single decaying thump, 1 at `a`, gone by `a + d`
  function hit(t, a, d) {
    if (t < a) return 0;
    var k = clamp01((t - a) / d);
    return (1 - k) * (1 - k);
  }

  window.buildKills = function buildKills(THREE, ctx) {
    var camera = ctx.camera, entity = ctx.entity, rig = ctx.playerRig;
    var ui = ctx.ui || {};
    var audio = ctx.audio;

    var playing = null;      // { kind, t, dur, onDone, ... }
    var shake = 0;
    var _v = new THREE.Vector3();
    var _q = new THREE.Quaternion();
    var _e = new THREE.Euler(0, 0, 0, 'YXZ');

    // Where the body was before we took it over, so a cancel puts it back.
    var saved = null;

    function parts() { return entity.parts; }

    function saveState() {
      var p = parts();
      saved = {
        gPos: entity.group.position.clone(),
        gRot: entity.group.rotation.clone(),
        spine: p.spine.rotation.clone(),
        head: p.head.rotation.clone(),
        armL: p.armL.shoulder.rotation.clone(),
        armLe: p.armL.elbow.rotation.clone(),
        armR: p.armR.shoulder.rotation.clone(),
        armRe: p.armR.elbow.rotation.clone(),
        legL: p.legL.hip.rotation.clone(),
        legR: p.legR.hip.rotation.clone(),
        camLayer1: camera.layers.isEnabled(1),
        rigVisible: rig ? rig.group.visible : true
      };
    }
    function restoreState() {
      if (!saved) return;
      var p = parts();
      entity.group.position.copy(saved.gPos);
      entity.group.rotation.copy(saved.gRot);
      p.spine.rotation.copy(saved.spine);
      p.head.rotation.copy(saved.head);
      p.armL.shoulder.rotation.copy(saved.armL);
      p.armL.elbow.rotation.copy(saved.armLe);
      p.armR.shoulder.rotation.copy(saved.armR);
      p.armR.elbow.rotation.copy(saved.armRe);
      p.legL.hip.rotation.copy(saved.legL);
      p.legR.hip.rotation.copy(saved.legR);
      if (!saved.camLayer1) camera.layers.disable(1);
      // Put the body back together. It is still the thing mirrors and the
      // security feeds render, so leaving it torn in half and lying where
      // it died would follow the player into the next life.
      if (rig) {
        rig.group.visible = saved.rigVisible;
        rig.group.rotation.set(0, 0, 0);
        if (rig.joints) rig.joints.torso.position.y = 0;
        if (rig.pose) rig.pose('stand');
      }
      saved = null;
    }

    // Stand it directly in front of the player, facing them, at arm's reach.
    function placeInFront(dist) {
      var yaw = playing.yaw;
      var ex = playing.px + Math.sin(yaw) * -dist;
      var ez = playing.pz + Math.cos(yaw) * -dist;
      entity.group.position.set(ex, 0, ez);
      entity.group.rotation.set(0, yaw + Math.PI, 0);
      return { x: ex, z: ez };
    }

    // Pull the camera back from a subject along a bearing, but no further
    // than the room allows — a death cam that ends up inside the wall shows
    // the player the inside of a polygon at the worst possible moment.
    function clearRadius(sx, sz, ang, want) {
      if (!entity.los) return want;
      for (var r = want; r > 0.9; r -= 0.35) {
        if (entity.los(sx, sz, sx + Math.sin(ang) * r, sz + Math.cos(ang) * r)) return r;
      }
      return 0.9;
    }

    // Look from `eye` at `at`, written straight into the camera.
    function lookFrom(eye, at) {
      camera.position.set(eye.x, eye.y, eye.z);
      _v.set(at.x - eye.x, at.y - eye.y, at.z - eye.z);
      var yaw = Math.atan2(-_v.x, -_v.z);
      var pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      _e.set(pitch, yaw, 0, 'YXZ');
      camera.rotation.copy(_e);
    }

    var KINDS = {
      // ---- 1. impaled, lifted, torn ----
      // First person for as long as you can stand it, then out to where
      // you can see all of it.
      impale: { dur: 9.6, reason: 'impaled' },
      // ---- 2. taken off your feet and driven into the floor ----
      slam: { dur: 7.4, reason: 'slammed' },
      // ---- 3. headbutt, sweep, and then the hands ----
      butcher: { dur: 9.0, reason: 'butchered' }
    };

    function drive(t) {
      var p = parts();
      var k = playing.kind;
      var eye = playing.eyeY;
      var px = playing.px, pz = playing.pz, yaw = playing.yaw;
      var blood = 0, fade = 0;

      if (k === 'impale') {
        var spot = placeInFront(1.05);
        // the arm that is already inside you
        p.armR.shoulder.rotation.set(-1.62 - seg(t, 0, 0.25) * 0.1, 0, -0.28);
        p.armR.elbow.rotation.set(0.12, 0, 0);
        p.spine.rotation.set(0.22 + seg(t, 4.0, 5.4) * -0.5, 0, 0);
        p.head.rotation.set(0.1, Math.sin(t * 1.4) * 0.5, 0);
        // the second hand goes in
        if (t > 4.0) {
          p.armL.shoulder.rotation.set(-1.55 * seg(t, 4.0, 4.7), 0, 0.3 * seg(t, 4.0, 4.7));
          p.armL.elbow.rotation.set(0.1, 0, 0);
        } else {
          p.armL.shoulder.rotation.set(-0.5 * seg(t, 3.2, 4.0), 0, 0.2);
        }

        blood = ramp(t, 0.2, 3.0) * 0.55 + ramp(t, 4.0, 6.0) * 0.45;

        if (t < 3.4) {
          // ---- first person: look down at it ----
          var look = seg(t, 0.5, 2.9);
          camera.position.set(px, eye - look * 0.14, pz);
          _e.set(-look * 1.15, yaw + Math.sin(t * 9) * 0.02 * (1 - look * 0.4), 0, 'YXZ');
          camera.rotation.copy(_e);
          shake = Math.max(shake, hit(t, 0, 0.5) * 0.9 + 0.12 * (1 - look));
          if (rig) rig.group.visible = false;
        } else {
          // ---- third person: it lifts you, then opens you ----
          camera.layers.enable(1);
          if (rig) rig.group.visible = true;
          var lift = seg(t, 5.4, 6.9);
          var rip = seg(t, 7.0, 8.3);
          var bodyY = 0.0 + lift * 2.05;

          if (rig) {
            rig.group.position.set(spot.x + Math.sin(yaw) * 0.72, bodyY, spot.z + Math.cos(yaw) * 0.72);
            rig.group.rotation.set(0, yaw + Math.PI, 0);
            var j = rig.joints;
            if (j) {
              // limp: head back, arms and legs hanging
              j.head.rotation.set(-0.5 - lift * 0.35, 0.2, 0);
              j.shoulderL.rotation.set(0.2, 0, 0.5 + lift * 0.5);
              j.shoulderR.rotation.set(0.2, 0, -0.5 - lift * 0.5);
              j.hipL.rotation.set(0.3 + lift * 0.2, 0, 0.12);
              j.hipR.rotation.set(0.25 + lift * 0.2, 0, -0.12);
              j.kneeL.rotation.set(-0.5 - lift * 0.4, 0, 0);
              j.kneeR.rotation.set(-0.45 - lift * 0.35, 0, 0);
              // and then the top half goes one way and the bottom the other.
              // The torso pivots at the hips, so lifting it off them is
              // literally the body coming apart at the waist.
              j.torso.position.y = rip * 0.52;
              j.torso.rotation.set(-rip * 0.5, rip * 0.7, rip * 0.35);
              j.hipL.rotation.z = 0.12 + rip * 0.8;
              j.hipR.rotation.z = -0.12 - rip * 0.8;
            }
          }
          // both its arms haul apart on the rip
          p.armL.shoulder.rotation.set(-1.55 + lift * -0.5, 0, 0.3 + rip * 0.9);
          p.armR.shoulder.rotation.set(-1.72 + lift * -0.5, 0, -0.28 - rip * 0.9);

          // camera swings out and around to watch
          var orbit = seg(t, 3.4, 5.2);
          var ang = yaw + Math.PI * 0.5 + orbit * 0.9;
          var rad = clearRadius(spot.x, spot.z, ang, 2.4 + orbit * 1.0);
          lookFrom(
            { x: spot.x + Math.sin(ang) * rad, y: 1.5 + orbit * 0.9 + lift * 0.7, z: spot.z + Math.cos(ang) * rad },
            { x: spot.x, y: 1.35 + lift * 1.1, z: spot.z }
          );
          shake = Math.max(shake, hit(t, 4.05, 0.5) * 0.5 + hit(t, 7.05, 0.9) * 1.0);
          if (rip > 0.1) blood = Math.min(1, blood + rip * 0.5);
        }
        fade = ramp(t, 8.5, 9.5);
        playing.sfx.forEach(function (s) {
          if (!s.done && t >= s.at) { s.done = true; s.fn(); }
        });
        return { blood: blood, fade: fade };
      }

      if (k === 'slam') {
        // it has you by the chest, off the ground, and it is using you
        var spotS = placeInFront(1.15);
        p.spine.rotation.set(0.3, 0, 0);
        p.head.rotation.set(0.35, 0, 0);
        p.armR.shoulder.rotation.set(-1.5, 0, -0.2);
        p.armR.elbow.rotation.set(0.2, 0, 0);
        p.armL.shoulder.rotation.set(-1.2, 0, 0.35);

        var hoist = seg(t, 0.1, 0.8);
        // four times into the floor, then a fifth you do not come back up from
        var beats = [1.3, 2.5, 3.6, 4.6, 5.5];
        var FLOOR = 0.24, HOIST = 2.2;
        var y = FLOOR + (HOIST - FLOOR) * hoist;
        var down = 0, up = 0;
        for (var i = 0; i < beats.length; i++) {
          var b = beats[i];
          if (t < b - 0.28) break;                  // not into this one yet
          if (t < b) {                              // driven down
            down = ease(ramp(t, b - 0.28, b));
            y = HOIST - (HOIST - FLOOR) * down;
            break;
          }
          if (i === beats.length - 1) { y = FLOOR; break; }
          // hauled back up, and a little less far every time
          up = ease(ramp(t, b, b + 0.42));
          y = FLOOR + (HOIST * (1 - i * 0.13) - FLOOR) * up;
        }
        var roll = 0;
        for (var j = 0; j < beats.length; j++) {
          roll += hit(t, beats[j], 0.5) * 0.5;
          shake = Math.max(shake, hit(t, beats[j], 0.65) * 1.6);
          if (t >= beats[j]) blood = Math.max(blood, 0.2 + j * 0.19);
        }
        // its arm follows you down and hauls you back up
        p.armR.shoulder.rotation.x = -1.5 + down * 1.2 - up * 0.4;
        camera.position.set(px, y, pz);
        _e.set(-0.5 - roll * 0.5 + (1 - hoist) * 0.5, yaw + Math.sin(t * 14) * 0.03 * (1 - t / 7), roll, 'YXZ');
        camera.rotation.copy(_e);
        if (rig) rig.group.visible = false;
        void spotS;
        fade = ramp(t, 6.2, 7.3);
        playing.sfx.forEach(function (s) { if (!s.done && t >= s.at) { s.done = true; s.fn(); } });
        return { blood: blood, fade: fade };
      }

      // ---- butcher: the head, then the legs, then everything ----
      var spotB = placeInFront(0.95 + seg(t, 0, 0.35) * -0.35);
      var headbutt = hit(t, 0.35, 0.6);
      var swept = seg(t, 1.5, 2.1);
      var onFloor = swept;

      p.spine.rotation.set(0.3 - headbutt * 0.55 + onFloor * 0.5, 0, 0);
      p.head.rotation.set(-0.2 + headbutt * 0.9 + onFloor * 0.7, 0, 0);
      // the sweep: one leg comes through low
      p.legR.hip.rotation.set(-seg(t, 1.35, 1.75) * 1.5 + seg(t, 1.75, 2.2) * 1.4, 0, 0);
      p.legR.knee.rotation.set(seg(t, 1.6, 2.0) * 0.8, 0, 0);

      // then the hands come down, over and over
      // the headbutt opens you up on its own — you do not wait three
      // seconds for the hands to arrive before there is blood on the lens
      blood = Math.max(blood, ramp(t, 0.35, 0.9) * 0.34 + seg(t, 1.5, 2.2) * 0.16);
      var mash = [2.9, 3.6, 4.3, 5.0, 5.7, 6.4, 7.1];
      for (var m = 0; m < mash.length; m++) {
        shake = Math.max(shake, hit(t, mash[m], 0.4) * 1.25);
        if (t >= mash[m]) blood = Math.max(blood, Math.min(0.95, 0.5 + m * 0.075));
      }
      var swing = 0;
      for (var m2 = 0; m2 < mash.length; m2++) {
        var a0 = mash[m2] - 0.34;
        if (t >= a0 && t < mash[m2]) swing = ramp(t, a0, mash[m2]);
        else if (t >= mash[m2] && t < mash[m2] + 0.26) swing = 1 - ramp(t, mash[m2], mash[m2] + 0.26);
      }
      if (t > 2.4) {
        p.armL.shoulder.rotation.set(-2.5 + swing * 3.4, 0, 0.25);
        p.armR.shoulder.rotation.set(-2.4 + swing * 3.5, 0, -0.25);
        p.armL.elbow.rotation.set(-0.5 + swing * 0.4, 0, 0);
        p.armR.elbow.rotation.set(-0.5 + swing * 0.4, 0, 0);
      } else {
        p.armL.shoulder.rotation.set(-0.3, 0, 0.3);
        p.armR.shoulder.rotation.set(-0.3, 0, -0.3);
      }

      // camera: reeling from the headbutt, then flat on the floor looking up
      var camY = eye - onFloor * (eye - 0.22) + headbutt * 0.1;
      var whip = seg(t, 1.5, 1.95);
      camera.position.set(px + Math.sin(yaw + 1.57) * whip * 0.5, camY, pz + Math.cos(yaw + 1.57) * whip * 0.5);
      _e.set(
        headbutt * 0.5 + onFloor * 0.95 - swing * 0.05,
        yaw + whip * 1.15 + Math.sin(t * 7) * 0.02,
        onFloor * 1.45 + headbutt * 0.3,
        'YXZ'
      );
      camera.rotation.copy(_e);
      if (rig) rig.group.visible = false;
      void spotB;
      fade = ramp(t, 7.8, 8.9);
      playing.sfx.forEach(function (s) { if (!s.done && t >= s.at) { s.done = true; s.fn(); } });
      return { blood: blood, fade: fade };
    }

    function soundsFor(kind) {
      var a = audio || {};
      var out = [];
      function add(at, fn) { out.push({ at: at, fn: fn || function () {}, done: false }); }
      var thud = function () { if (a.doorSlam) a.doorSlam(1); };
      var wood = function () { if (a.woodHit) a.woodHit(); };
      if (kind === 'impale') {
        add(0.02, wood); add(4.05, wood); add(7.05, thud); add(7.3, wood);
      } else if (kind === 'slam') {
        [1.3, 2.5, 3.6, 4.6, 5.5].forEach(function (b) { add(b, thud); });
      } else {
        add(0.35, wood); add(1.7, thud);
        [2.9, 3.6, 4.3, 5.0, 5.7, 6.4, 7.1].forEach(function (b) { add(b, thud); });
      }
      return out;
    }

    var api = {
      // Which deaths exist, for pickers and for tests.
      kinds: Object.keys(KINDS),
      reasonFor: function (kind) { return (KINDS[kind] || KINDS.impale).reason; },
      pick: function () {
        var k = api.kinds;
        return k[Math.floor(Math.random() * k.length)];
      },
      isPlaying: function () { return !!playing; },
      current: function () { return playing ? playing.kind : null; },
      progress: function () { return playing ? playing.t / playing.dur : 0; },

      play: function (kind, opts, onDone) {
        if (playing) return false;
        if (!KINDS[kind]) kind = 'impale';
        opts = opts || {};
        saveState();
        if (entity.holdStill) entity.holdStill(true);
        playing = {
          kind: kind,
          t: 0,
          dur: KINDS[kind].dur,
          px: opts.x, pz: opts.z, yaw: opts.yaw || 0, eyeY: opts.eye || 1.68,
          onDone: onDone || null,
          sfx: soundsFor(kind)
        };
        entity.group.visible = true;
        if (ui.onKillStart) ui.onKillStart(kind);
        return true;
      },

      update: function (dt) {
        if (!playing) return;
        shake = 0;
        playing.t += dt;
        var out = drive(Math.min(playing.t, playing.dur));
        if (shake > 0) {
          camera.rotation.x += (Math.random() - 0.5) * 0.06 * shake;
          camera.rotation.y += (Math.random() - 0.5) * 0.06 * shake;
          camera.rotation.z += (Math.random() - 0.5) * 0.05 * shake;
        }
        if (ui.onKillFrame) ui.onKillFrame(out.blood, out.fade);
        if (playing.t >= playing.dur) {
          var done = playing.onDone;
          var kind = playing.kind;
          playing = null;
          if (entity.holdStill) entity.holdStill(false);
          restoreState();
          if (ui.onKillEnd) ui.onKillEnd(kind);
          if (done) done(KINDS[kind].reason);
        }
      },

      cancel: function () {
        if (!playing) return;
        playing = null;
        if (entity.holdStill) entity.holdStill(false);
        restoreState();
        if (ui.onKillEnd) ui.onKillEnd(null);
      }
    };
    return api;
  };
})();
