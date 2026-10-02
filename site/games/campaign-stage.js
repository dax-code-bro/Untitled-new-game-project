/* ================================================================
   THE CAMPAIGN STAGE
   ================================================================
   What a mission written as a screenplay needs that a list of
   objectives does not: people who are not in the fight, a camera
   that moves, vehicles, fire and noise, words on the screen.

   The director (campaign.js) owns the mission and its steps; a step
   of type 'scene' (a cutscene) or 'play' (gameplay with a script
   running alongside it) is a generator function handed this stage as
   S. It reads like the script it came from:

     run: function* (S) {
       S.shot({ eye: [..], at: [..], fov: 40, to: { eye: [..] }, secs: 6 });
       S.cast.lincoln.walkTo([-2, 13.6, -46]);
       yield S.wait(1.5);
       S.line('lincoln', 'Sharp. Took your sweet time.');
       yield S.quiet();
     }

   Each `yield` waits for what it is handed (a function that says when
   it is done); everything else -- walks, camera moves, vehicles,
   fire -- carries on in the background.

   EXTRAS are the story's people built with castMember (campaign-
   cast.js): Lincoln, the twins, the soldiers on each floor, and a copy
   of each of the squad for cutscenes. They are not combatants: the
   match never sees them, they cannot be hurt -- except that shooting
   one is friendly fire. They walk, sit, point, duck, carry their
   weapon (the match's own carry, M.carryFor) and talk with their faces.

   THE SQUAD in play are the match's allies, dressed as themselves.
   For a cutscene they are put away (scripted) and their extras take
   the stage; afterwards they come back where the extras stood.
   ================================================================ */
(function () {
  'use strict';
  var W = window;

  var CSS = [
    '#stg{position:fixed;inset:0;pointer-events:none;z-index:41;font-family:Georgia,"Times New Roman",serif;color:#e8ddc8}',
    '#stg .title{position:absolute;left:5vw;bottom:15vh;font-family:"Courier New",monospace;font-size:22px;letter-spacing:.18em;line-height:1.6;',
    'text-shadow:0 1px 4px #000;white-space:pre;opacity:0;transition:opacity .8s}',
    '#stg .title b{color:#d8b45a;font-weight:normal}',
    '#stg .black{position:absolute;inset:0;background:#000;opacity:0}',
    '#stg .ff{position:absolute;inset:0;background:#000;display:none;align-items:center;justify-content:center;flex-direction:column}',
    '#stg .ff .h{font-size:30px;letter-spacing:.28em;color:#d84a3a;text-transform:uppercase;text-align:center}',
    '#stg .ff .s{margin-top:18px;font-size:13px;letter-spacing:.3em;color:#8f8775;text-transform:uppercase}',
    '#stg .bino{position:absolute;inset:0;display:none}',
    '#stg .bino .ret{position:absolute;left:50%;top:50%;width:40vh;height:1px;margin-left:-20vh;background:rgba(220,230,220,.5)}',
    '#stg .bino .ret.v{width:1px;height:40vh;margin:-20vh 0 0 0}',
    '#stg .bino .z{position:absolute;right:12vw;bottom:12vh;font-family:"Courier New",monospace;font-size:14px;letter-spacing:.2em;color:#cfe0cf}',
    '#stg .hud{position:absolute;left:50%;bottom:9vh;transform:translateX(-50%);font-family:"Courier New",monospace;font-size:16px;',
    'letter-spacing:.2em;text-align:center;text-shadow:0 1px 3px #000;display:none;background:rgba(0,0,0,.45);padding:8px 16px}',
    '#stg .toast{position:absolute;right:28px;top:26px;font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:#d8b45a;',
    'text-shadow:0 1px 3px #000;opacity:0;transition:opacity .4s;z-index:5}',
    '#stg .cross{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:1px solid rgba(255,255,255,.7);',
    'border-radius:50%;display:none}',
    /* MISSION PASSED */
    '#stg .pass{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;',
    'background:radial-gradient(ellipse at 50% 45%,rgba(30,22,8,.86) 0%,rgba(5,6,10,.96) 70%)}',
    '#stg .pass .h{font-size:64px;letter-spacing:.16em;text-transform:uppercase;color:#f0c75a;text-shadow:0 0 30px rgba(240,180,60,.45),0 2px 4px #000;',
    'transform:scale(.6);opacity:0;transition:transform .7s cubic-bezier(.2,1.6,.4,1),opacity .5s}',
    '#stg .pass.in .h{transform:scale(1);opacity:1}',
    '#stg .pass .t{font-size:15px;letter-spacing:.35em;color:#a39a86;text-transform:uppercase;margin-top:8px}',
    '#stg .pass .stars{margin:28px 0 10px;font-size:58px;letter-spacing:.2em}',
    '#stg .pass .stars i{font-style:normal;color:#3a3630;display:inline-block;transform:scale(.3);opacity:0;transition:transform .45s cubic-bezier(.2,1.8,.4,1),opacity .3s,color .3s}',
    '#stg .pass .stars i.on{color:#f0c75a;text-shadow:0 0 18px rgba(240,190,70,.6)}',
    '#stg .pass .stars i.shown{transform:scale(1);opacity:1}',
    '#stg .pass .why{font-size:13px;color:#b0705a;letter-spacing:.12em;min-height:18px}',
    '#stg .pass .pct{font-size:30px;letter-spacing:.14em;margin-top:22px}',
    '#stg .pass .pct small{display:block;font-size:11px;letter-spacing:.4em;color:#8f8775;text-transform:uppercase;margin-top:4px}',
    '#stg .pass ul{list-style:none;padding:0;margin:22px 0 26px;font-size:14px;line-height:1.9;color:#cfc5b0;min-width:340px}',
    '#stg .pass ul li{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.06)}',
    '#stg .pass ul li span:last-child{color:#d8b45a}',
    '#stg .pass button{pointer-events:auto;font:inherit;letter-spacing:.3em;text-transform:uppercase;background:none;color:#e8ddc8;',
    'border:1px solid #c9a35a;padding:11px 26px;margin:6px;cursor:pointer}',
    '#stg .pass button:hover,#stg .pass button.sel{background:#c9a35a;color:#05060a}',
  ].join('\n');

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(u) { u = clamp01(u); return u * u * (3 - 2 * u); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function lerp3(a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
  function val(v) { return typeof v === 'function' ? v() : v; }
  function angTo(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

  /* ================================================================
     AN EXTRA
     ================================================================ */
  function Extra(S, id, castKey, opts) {
    opts = opts || {};
    var spec = W.CAMPAIGN_CAST[castKey];
    if (!spec) throw new Error('no cast member ' + castKey);
    this.S = S; this.id = id; this.cast = castKey; this.spec = spec;
    this.name = opts.name || spec.name.split(' ')[0];
    this.voice = spec.voice || {};
    this.actor = S.game.castMember(spec, { at: [0, -80, 0], name: 'extra-' + id, speed: 1.5, runSpeed: 4.5 });
    if (this.actor.controller) this.actor.controller.autoAnimate = false;
    // A person, not scenery: rays for bullets and lines of sight pass the capsule (the match's rule).
    if (this.actor.body) this.actor.body.userData = { actor: true, extra: id };
    // What the match's carry() reads: a pos, a yaw and pitch, a gun.
    this.pos = { x: 0, y: -80, z: 0 }; this.yaw = 0; this.pitch = 0;
    var gunId = opts.gun !== undefined ? opts.gun : spec.weapon;
    this.guns = [{ id: gunId === 'mauser-gold' ? 'mauser' : gunId === 'pepperball' ? 'm4' : gunId }];
    this.held = 0; this.prone = false; this.crouching = false; this.aiming = false;
    this.armed = false; this.aim = false; this.visible = false;
    this.clip = null; this.walk = null; this.wantYaw = null; this.ride = null;
  }
  Extra.prototype.lift = function () {
    var c = this.actor.controller;
    return c && c.height ? c.height * 0.5 : 0.9;
  };
  /* Stand somewhere (on the floor at y), facing yaw (radians; 0 is +Z, north). */
  Extra.prototype.at = function (p, yaw, clip) {
    this.pos = { x: p[0], y: p[1], z: p[2] };
    if (yaw != null) { this.yaw = yaw; this.wantYaw = null; }
    this.visible = true; this.walk = null; this.ride = null;
    this.play(clip || this.clip || 'idle', 0);
    this.apply();
    return this;
  };
  Extra.prototype.hide = function () {
    this.visible = false; this.walk = null; this.ride = null;
    this.pos.y = -80;
    if (this.actor.controller) this.actor.controller.teleport([0, -80, 0]);
    if (this.S.M.stowFor) this.S.M.stowFor(this);
    return this;
  };
  Extra.prototype.play = function (clip, blend, speed) {
    var a = this.actor.animator;
    this.clip = clip;
    if (!a || !a.clips.get(clip)) return this;
    a.play(clip, blend == null ? 0.25 : blend);
    a.speed = speed || 1;
    return this;
  };
  Extra.prototype.walkTo = function (p, o) {
    o = o || {};
    this.walk = { to: { x: p[0], y: p[1], z: p[2] }, speed: o.speed || 1.45, clip: o.clip || (o.speed > 3 ? 'run' : 'walk'),
      then: o.then || 'idle', face: o.face, done: false };
    this.play(this.walk.clip, 0.2);
    return this;
  };
  Extra.prototype.arrived = function () { return !this.walk; };
  Extra.prototype.turnTo = function (yawOrPoint) {
    if (typeof yawOrPoint === 'number') this.wantYaw = yawOrPoint;
    else { var q = yawOrPoint.pos || { x: yawOrPoint[0], z: yawOrPoint[2] }; this.wantYaw = Math.atan2(q.x - this.pos.x, q.z - this.pos.z); }
    return this;
  };
  Extra.prototype.arm = function (on, aim) { this.armed = !!on; this.aim = !!aim; if (!on && this.S.M.stowFor) this.S.M.stowFor(this); return this; };
  Extra.prototype.look = function (other) {
    var f = this.actor.face;
    if (f && f.lookAt) f.lookAt(other ? (other.actor || other) : null);
    return this;
  };
  Extra.prototype.feel = function (emotion) {
    var f = this.actor.face;
    if (f && f.setEmotion) f.setEmotion(emotion);
    return this;
  };
  /* Sit in or stand on a vehicle: local position and yaw in the vehicle's frame, kept there as it moves. */
  Extra.prototype.rideOn = function (V, local, lyaw, clip) {
    this.visible = true; this.walk = null;
    this.ride = { V: V, l: local, yaw: lyaw || 0 };
    this.play(clip || 'sit', 0);
    this.S.placeOnVehicle(this);
    this.apply();
    return this;
  };
  Extra.prototype.apply = function () {
    var c = this.actor.controller;
    if (!c) return;
    c.teleport([this.pos.x, this.pos.y + this.lift(), this.pos.z]);
    c.facing = this.yaw;
  };
  Extra.prototype.tick = function (dt) {
    if (!this.visible) return;
    var S = this.S;
    if (this.ride) S.placeOnVehicle(this);
    else if (this.walk) {
      var w = this.walk, dx = w.to.x - this.pos.x, dz = w.to.z - this.pos.z, d = Math.hypot(dx, dz);
      var step = w.speed * dt;
      if (d <= step || d < 0.02) {
        this.pos.x = w.to.x; this.pos.z = w.to.z; this.pos.y = w.to.y;
        this.walk = null;
        if (w.face != null) this.wantYaw = w.face;
        this.play(w.then, 0.3);
      } else {
        this.pos.x += dx / d * step; this.pos.z += dz / d * step;
        this.pos.y += (w.to.y - this.pos.y) * Math.min(1, step / Math.max(d, 1e-3));
        var want = Math.atan2(dx, dz);
        // Backing up (dragging something): face away from the way he is going.
        if (w.backwards) want += Math.PI;
        this.yaw += angTo(this.yaw, want) * Math.min(1, dt * 8);
        var a = this.actor.animator, rc = a && a.clips.get(w.clip);
        if (rc && rc.stride && W.LE.gaitRate) a.speed = W.LE.gaitRate(rc, w.speed);
      }
    }
    if (this.wantYaw != null && !this.walk && !this.ride) {
      var d2 = angTo(this.yaw, this.wantYaw);
      this.yaw += d2 * Math.min(1, dt * 5);
      if (Math.abs(d2) < 0.01) this.wantYaw = null;
    }
    this.apply();
    if (this.armed && S.M.carryFor) S.M.carryFor(this, this.aim);
  };
  // Where his eyes are, for a camera that wants to look at his face.
  Extra.prototype.head = function (dy) {
    var y = this.pos.y + (this.clip === 'sit' || this.clip === 'sitTable' ? 1.22 : this.prone ? 0.3 : 1.62) * (this.spec.height || 1.8) / 1.8;
    return [this.pos.x, y + (dy || 0), this.pos.z];
  };
  // A point in front of him (metres ahead, metres up), for over-the-shoulder and reverse shots.
  Extra.prototype.ahead = function (d, up, side) {
    var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    var rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    return [this.pos.x + fx * d + rx * (side || 0), this.pos.y + (up == null ? 1.6 : up), this.pos.z + fz * d + rz * (side || 0)];
  };

  /* ================================================================
     THE STAGE
     ================================================================ */
  function Stage(ctx) {
    var S = this;
    this.ctx = ctx;
    this.api = ctx.api; this.M = ctx.M; this.game = ctx.game; this.you = ctx.M.you;
    this.props = (ctx.M.map && ctx.M.map.props) || {};
    this.cast = {};
    this.vehicles = [];
    this.t = 0; this.dt = 0;
    this.camState = null;
    this.shakeAmt = 0;
    this.fxQueue = [];
    this.tickers = [];
    this.flags = {};

    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var root = document.createElement('div');
    root.id = 'stg';
    root.innerHTML = '<div class="title"></div><div class="bino"></div><div class="cross"></div><div class="hud"></div>'
      + '<div class="toast"></div><div class="black"></div><div class="ff"></div><div class="pass"></div>';
    document.body.appendChild(root);
    this.root = root;
    this.$ = function (s) { return root.querySelector(s); };
    this.$('.bino').innerHTML = '<svg width="100%" height="100%" style="position:absolute;inset:0"><defs><mask id="binoM">'
      + '<rect width="100%" height="100%" fill="white"/><circle cx="40%" cy="50%" r="27%" fill="black"/><circle cx="60%" cy="50%" r="27%" fill="black"/>'
      + '</mask><radialGradient id="binoV"><stop offset="70%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity=".7"/></radialGradient></defs>'
      + '<rect width="100%" height="100%" fill="black" mask="url(#binoM)"/><circle cx="40%" cy="50%" r="27%" fill="url(#binoV)"/><circle cx="60%" cy="50%" r="27%" fill="url(#binoV)"/></svg>'
      + '<div class="ret"></div><div class="ret v"></div><div class="z">x10</div>';

    // The camera, while a scene or an overlay has it.
    this.cinematic = function (dt) {
      var c = S.camState;
      if (!c) return null;
      var e, a, f;
      if (c.fn) { var r = c.fn(S.t, dt); e = r.eye; a = r.at; f = r.fov; }
      else {
        c.t += dt;
        var u = c.secs ? (c.ease === 'linear' ? clamp01(c.t / c.secs) : smooth(c.t / c.secs)) : 1;
        e = c.to && c.to.eye ? lerp3(val(c.eye), val(c.to.eye), u) : val(c.eye);
        a = c.to && c.to.at ? lerp3(val(c.at), val(c.to.at), u) : val(c.at);
        f = c.to && c.to.fov ? lerp(c.fov || 50, c.to.fov, u) : (c.fov || 50);
      }
      if (S.shakeAmt > 0.001) {
        var k = S.shakeAmt;
        e = [e[0] + (Math.random() - 0.5) * k, e[1] + (Math.random() - 0.5) * k, e[2] + (Math.random() - 0.5) * k];
        S.shakeAmt *= Math.pow(0.02, dt);
      }
      return { eye: e, at: a, fov: f };
    };
  }

  /* ---- people ---- */
  Stage.prototype.extra = function (id, castKey, opts) {
    if (!this.cast[id]) this.cast[id] = new Extra(this, id, castKey || id, opts);
    return this.cast[id];
  };
  Stage.prototype.hideAll = function () { for (var k in this.cast) this.cast[k].hide(); };
  /* The squad: the match's allies. 'away' -- out of sight for a cutscene; 'fight' -- the match's
     bots again; 'trail' -- walking behind you where you walked (stairwells the bots cannot path). */
  Stage.prototype.squad = function (mode, spots) {
    var S = this, M = this.M;
    this.ctx.allies.forEach(function (p, k) {
      p.puppet = false; p.scripted = false;
      if (mode === 'away') {
        p.scripted = true;
        if (p.actor && p.actor.controller) p.actor.controller.teleport([0, -70, 0]);
        if (M.stowFor) M.stowFor(p);
      } else if (mode === 'trail' || mode === 'hold') {
        if (!p.alive) M.spawnAt(p, [S.you.pos.x, S.you.pos.y, S.you.pos.z], S.you.yaw);
        p.puppet = true;
        if (spots && spots[k]) { var s = spots[k]; p.pos = { x: s[0], y: s[1], z: s[2] }; p.yaw = s[3] || 0; }
        if (mode === 'trail') S._trail = [];
      }
    });
    this.squadMode = mode;
  };
  /* Put the squad (match allies) where their extras are standing, and the extras away. */
  Stage.prototype.squadFromExtras = function (ids, mode) {
    var S = this, M = this.M;
    this.ctx.allies.forEach(function (p, k) {
      var e = S.cast[ids[k]];
      if (!e) return;
      M.spawnAt(p, [e.pos.x, e.pos.y, e.pos.z], e.yaw);
      e.hide();
    });
    this.squad(mode || 'fight');
  };
  Stage.prototype.tickSquad = function (dt) {
    if (this.squadMode !== 'trail') return;
    var you = this.you, T = this._trail || (this._trail = []);
    var last = T[T.length - 1];
    if (!last || Math.hypot(you.pos.x - last.x, you.pos.z - last.z) + Math.abs(you.pos.y - last.y) > 0.2) T.push({ x: you.pos.x, y: you.pos.y, z: you.pos.z });
    if (T.length > 400) T.splice(0, T.length - 400);
    this.ctx.allies.forEach(function (p, k) {
      if (!p.alive) return;
      // Walk the trail back from the newest point by (k + 1) * 1.3 metres.
      var want = (k + 1) * 1.35, acc = 0, i = T.length - 1, at = T[i];
      for (; i > 0 && at; i--) {
        var a = T[i], b = T[i - 1], seg = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y);
        if (acc + seg >= want) { var u = (want - acc) / Math.max(seg, 1e-4); at = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) }; break; }
        acc += seg; at = b;
      }
      if (!at) return;
      var dx = at.x - p.pos.x, dz = at.z - p.pos.z, d = Math.hypot(dx, dz);
      // No faster than a jog, so a body never teleports along a long trail.
      var mv = Math.min(d, 5.2 * dt);
      if (d > 1e-3) { p.pos.x += dx / d * mv; p.pos.z += dz / d * mv; p.yaw += angTo(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 6); }
      p.pos.y += (at.y - p.pos.y) * Math.min(1, dt * 8);
    });
  };

  /* ---- vehicles ---- */
  Stage.prototype.vehicle = function (kind, opts) {
    var a = this.game[kind](Object.assign({ at: [0, -100, 0] }, opts || {}));
    var V = { kind: kind, actor: a, x: 0, y: -100, z: 0, yaw: 0, pitch: 0, roll: 0, rotor: 0, spin: 0,
      turret: 0, gun: 0, burning: false, smoke: null };
    this.vehicles.push(V);
    this.placeVehicle(V);
    return V;
  };
  /* Yaw about Y (0: nose to +X), then pitch about the nose-to-tail's sideways axis, then roll. */
  Stage.prototype.vehQuat = function (V) {
    var LE = W.LE, q = V._q || (V._q = new LE.Quat()), q2 = V._q2 || (V._q2 = new LE.Quat());
    var up = this._up || (this._up = new LE.Vec3(0, 1, 0)), zx = this._zx || (this._zx = new LE.Vec3(0, 0, 1)), xx = this._xx || (this._xx = new LE.Vec3(1, 0, 0));
    q.setAxisAngle(up, V.yaw);
    q2.setAxisAngle(zx, V.pitch); q.mulQuats(q, q2);
    q2.setAxisAngle(xx, V.roll); q.mulQuats(q, q2);
    return q;
  };
  Stage.prototype.placeVehicle = function (V) {
    var a = V.actor;
    if (!a) return;
    a.position.set(V.x, V.y, V.z);
    a.rotation.copy(this.vehQuat(V));
    a._still = false;
    var LE = W.LE, up = this._up;
    /* A part turns about its own pivot (mountArm keeps it as <name>Pivot): every part sits in the
       vehicle's frame, so a turn R about P is rotation R and position P - R.P. */
    var v1 = this._v1 || (this._v1 = new LE.Vec3()), v2 = this._v2 || (this._v2 = new LE.Vec3());
    function turn(part, piv, q) {
      if (!part || part === a || !piv) return;
      v1.set(piv[0], piv[1], piv[2]).applyQuat(q);
      part.rotation.copy(q);
      part.position.set(piv[0] - v1.x, piv[1] - v1.y, piv[2] - v1.z);
      part._still = false;
    }
    if (V.kind === 'helicopter') {
      var rq = V._rq || (V._rq = new LE.Quat()), tq0 = V._tq0 || (V._tq0 = new LE.Quat());
      rq.setAxisAngle(up, V.rotor);
      tq0.setAxisAngle(this._zx, V.rotor * 4.3);
      turn(a.rotor, a.rotorPivot, rq);
      turn(a.tailRotor, a.tailRotorPivot, tq0);
    }
    if (V.kind === 'tank') {
      var tq = V._tq || (V._tq = new LE.Quat()), gq = V._gq || (V._gq = new LE.Quat()), q3 = V._q3 || (V._q3 = new LE.Quat());
      tq.setAxisAngle(up, V.turret);
      turn(a.turret, a.turretPivot, tq);
      turn(a.turretMark, a.turretMarkPivot || a.turretPivot, tq);
      // The gun turns with the turret about the ring, and elevates about its trunnion.
      if (a.gun && a.gun !== a && a.gunPivot && a.turretPivot) {
        var ring = a.turretPivot, tr = a.gunPivot;
        gq.setAxisAngle(this._zx, V.gun);
        q3.mulQuats(tq, gq);
        v1.set(tr[0], tr[1], tr[2]).applyQuat(gq);                       // qG . trun
        v2.set(tr[0] - v1.x - ring[0], tr[1] - v1.y - ring[1], tr[2] - v1.z - ring[2]).applyQuat(tq);
        a.gun.rotation.copy(q3);
        a.gun.position.set(v2.x + ring[0], v2.y + ring[1], v2.z + ring[2]);
        a.gun._still = false;
      }
    }
  };
  // A point in a vehicle's own frame, in the world.
  Stage.prototype.vLocal = function (V, l) {
    var v = this._tv || (this._tv = new W.LE.Vec3());
    v.set(l[0], l[1], l[2]).applyQuat(this.vehQuat(V));
    return [V.x + v.x, V.y + v.y, V.z + v.z];
  };
  Stage.prototype.placeOnVehicle = function (e) {
    var r = e.ride, p = this.vLocal(r.V, r.l);
    e.pos.x = p[0]; e.pos.y = p[1]; e.pos.z = p[2];
    // The vehicle's yaw is about +X for its nose; a person's yaw 0 faces +Z.
    e.yaw = Math.PI / 2 - r.V.yaw + r.yaw;
  };

  /* ---- the camera ---- */
  Stage.prototype.shot = function (o) {
    this.camState = { eye: o.eye, at: o.at, fov: o.fov || 50, to: o.to || null, secs: o.secs || 0, ease: o.ease, t: 0, fn: o.fn || null };
    this.api.cinematic = this.cinematic;
  };
  Stage.prototype.camRig = function (fn) { this.shot({ fn: fn }); };
  Stage.prototype.releaseCamera = function () { this.camState = null; this.api.cinematic = null; };
  Stage.prototype.shake = function (k) { this.shakeAmt = Math.max(this.shakeAmt, k); };

  /* ---- waiting (what a scene yields) ---- */
  Stage.prototype.wait = function (secs) { var S = this, until = S.t + secs; return function () { return S.t >= until; }; };
  Stage.prototype.quiet = function () { var S = this; return function () { return !S.ctx.talking(); }; };
  Stage.prototype.until = function (fn) { return fn; };
  Stage.prototype.arrive = function () {
    var es = Array.prototype.slice.call(arguments);
    return function () { return es.every(function (e) { return e.arrived(); }); };
  };

  /* ---- words ---- */
  Stage.prototype.line = function (who, text, o) {
    o = o || {};
    this.ctx.say([{ who: who, text: text, emotion: o.emotion || null, wait: o.wait, volume: o.volume, radio: o.radio }]);
  };
  Stage.prototype.title = function (lines, hold) {
    var S = this, el = this.$('.title');
    var full = lines.join('\n'), i = 0;
    el.style.opacity = '1';
    el.textContent = '';
    var t0 = S.t;
    this.every(function () {
      var n = Math.min(full.length, Math.floor((S.t - t0) / 0.045));
      if (n !== i) { i = n; el.textContent = full.slice(0, n); if (S.game.audio && S.game.audio.tone && n % 2 === 0 && full[n - 1] !== ' ') S.game.audio.tone(1600, 0.012, 'square', 0.025); }
      if (S.t - t0 > full.length * 0.045 + (hold || 4)) { el.style.opacity = '0'; return true; }
      return false;
    });
  };
  Stage.prototype.toast = function (text) {
    var el = this.$('.toast'), S = this, t0 = this.t;
    el.textContent = text; el.style.opacity = '1';
    this.every(function () { if (S.t - t0 > 2.6) { el.style.opacity = '0'; return true; } return false; });
  };
  Stage.prototype.hud = function (html) {
    var el = this.$('.hud');
    if (html == null) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.innerHTML = html;
  };
  Stage.prototype.binoculars = function (on) { this.$('.bino').style.display = on ? 'block' : 'none'; };
  /* To black (1) or back (0) over secs. */
  Stage.prototype.fade = function (to, secs) {
    var S = this, el = this.$('.black'), from = +el.style.opacity || 0, t0 = S.t;
    secs = secs || 0.0001;
    this.every(function () {
      var u = clamp01((S.t - t0) / secs);
      el.style.opacity = String(lerp(from, to, u));
      return u >= 1;
    });
    return this.wait(secs);
  };
  Stage.prototype.black = function (on) { this.$('.black').style.opacity = on ? '1' : '0'; };

  /* ---- things that run every frame until they say they are done ---- */
  Stage.prototype.every = function (fn) { this.tickers.push(fn); };
  /* Something to do in `secs` of game time -- not setTimeout, which keeps the wall clock and runs
     early on a slow frame and late on a paused one. */
  Stage.prototype.after = function (secs, fn) {
    var S = this, at = this.t + secs;
    this.every(function () { if (S.t < at) return false; fn(); return true; });
  };

  /* ---- fire and noise ---- */
  Stage.prototype.boom = function (at, scale, o) {
    o = o || {};
    var g = this.game;
    try { if (g.explode) g.explode(at, { radius: 4 * (scale || 1), strength: 2, scale: scale || 1, light: true }); }
    catch (e) { if (g.particles) g.particles.explosion({ x: at[0], y: at[1], z: at[2] }, { scale: scale || 1 }); }
    // Debris and dust thrown up, and the shake that falls off with distance.
    var P = g.particles;
    if (P) {
      P.dust([at[0], at[1] + 0.3, at[2]], { count: Math.round(30 * (scale || 1)), size: 1.4 * (scale || 1) });
      P.smoke([at[0], at[1] + 1, at[2]], { count: Math.round(4 * (scale || 1)), size: 3 * (scale || 1), life: 3.5, alpha: 0.45, color: 0x2a2724, colorEnd: 0x77706a });
    }
    var cam = this.camState ? this.cinematic(0) : null;
    var eye = cam ? cam.eye : [this.you.pos.x, this.you.pos.y + 1.6, this.you.pos.z];
    var d = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]);
    var k = (o.shake != null ? o.shake : 1.2) * (scale || 1) / Math.max(1, d / 12);
    this.shake(Math.min(0.9, k));
    if (this.ctx.hudShake) this.ctx.hudShake(Math.min(1, k * 1.5));
  };
  // Something left burning: fire and smoke at a point, from now on.
  Stage.prototype.burn = function (at, size) {
    var P = this.game.particles, acc = 0, sacc = 0;
    var light = this.game.light ? this.game.light({ at: [at[0], at[1] + 1, at[2]], color: 0xff8a30, intensity: 6 * (size || 1), radius: 10 * (size || 1) }) : null;
    var S = this;
    var b = { at: at, size: size || 1, light: light, off: false };
    this.every(function (dt) {
      if (b.off) { if (light) light.intensity = 0; return true; }
      acc += dt * 10 * b.size; sacc += dt * 2.4;
      while (acc > 1) { acc -= 1; if (P) P.fire([at[0] + (Math.random() - 0.5) * 1.6 * b.size, at[1], at[2] + (Math.random() - 0.5) * 1.6 * b.size], { count: 1, size: 1.3 * b.size, life: 0.9 }); }
      while (sacc > 1) { sacc -= 1; if (P) P.smoke([at[0], at[1] + 1.5, at[2]], { count: 1, size: 4 * b.size, life: 8, alpha: 0.55, color: 0x1e1c1a, colorEnd: 0x5e5852 }); }
      if (light) light.intensity = 6 * b.size * (0.8 + 0.2 * Math.sin(S.t * 13) * Math.sin(S.t * 7.3));
      return false;
    });
    return b;
  };
  Stage.prototype.tracer = function (from, to) {
    var P = this.game.particles;
    if (!P || !P.sparks) return;
    var n = 6;
    for (var i = 0; i < n; i++) {
      var u = (i + Math.random()) / n;
      P.sparks([lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(from[2], to[2], u)], { count: 1, speed: 0.4, size: 0.5 });
    }
  };
  // The whistle of something coming in: a falling tone.
  Stage.prototype.whistle = function (secs) {
    var A = this.game.audio, ctx = A && A.ensure && A.ensure();
    if (!ctx) return;
    var now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, now);
    o.frequency.exponentialRampToValueAtTime(520, now + secs);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + secs * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, now + secs);
    o.connect(g).connect(A.bus || ctx.destination);
    o.start(now); o.stop(now + secs + 0.05);
  };
  // A helicopter, heard: the blade slap, as amplitude-modulated noise. Returns a handle to set its level.
  Stage.prototype.rotorSound = function () {
    var A = this.game.audio, ctx = A && A.ensure && A.ensure();
    if (!ctx) return { level: function () {}, stop: function () {} };
    var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    var am = ctx.createGain(); am.gain.value = 0.5;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 17; var lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    var out = ctx.createGain(); out.gain.value = 0;
    src.connect(lp).connect(am).connect(out).connect(A.bus || ctx.destination);
    src.start(); lfo.start();
    return {
      level: function (v) { out.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.3); },
      stop: function () { out.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(function () { try { src.stop(); lfo.stop(); } catch (e) { /* gone */ } }, 1500); },
    };
  };

  /* ---- friendly fire on the extras: the match hands us every round you fire ---- */
  Stage.prototype.shotRay = function (from, dir, maxD) {
    for (var k in this.cast) {
      var e = this.cast[k];
      if (!e.visible || e.ride) continue;
      // A standing man as a capsule from the shins to the head.
      var h = e.prone ? 0.4 : e.clip === 'sit' || e.clip === 'sitTable' || e.clip === 'duck' || e.clip === 'crouchIdle' ? 1.2 : 1.75;
      var ax = e.pos.x, ay = e.pos.y + 0.2, az = e.pos.z;
      // Closest approach of the ray to the vertical segment.
      var wx = from.x - ax, wz = from.z - az;
      var dh = Math.hypot(dir.x, dir.z) || 1e-6;
      var t = -(wx * dir.x + wz * dir.z) / (dh * dh);
      if (t < 0.3 || t > maxD) continue;
      var px = from.x + dir.x * t - ax, pz = from.z + dir.z * t - az, py = from.y + dir.y * t;
      if (px * px + pz * pz > 0.3 * 0.3) continue;
      if (py < ay || py > e.pos.y + h) continue;
      // And nothing solid in between.
      var hit = this.game.raycast && this.game.raycast([from.x, from.y, from.z], [dir.x, dir.y, dir.z], t - 0.3,
        function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
      if (hit) continue;
      if (this.ctx.friendlyFire) this.ctx.friendlyFire(e);
      return true;
    }
    return false;
  };

  /* ---- the frame ---- */
  Stage.prototype.tick = function (dt) {
    this.t += dt; this.dt = dt;
    // Vehicles first: anybody riding in one is placed from where it is THIS frame, not last.
    for (var i = 0; i < this.vehicles.length; i++) {
      var V = this.vehicles[i];
      if (V.spin) V.rotor += V.spin * dt;
      if (V.update) V.update(dt, V);
      this.placeVehicle(V);
    }
    for (var k in this.cast) this.cast[k].tick(dt);
    this.tickSquad(dt);
    for (var j = this.tickers.length - 1; j >= 0; j--) {
      var done = false;
      try { done = this.tickers[j](dt); } catch (e) { done = true; if (W.console) console.error(e); }
      if (done) this.tickers.splice(j, 1);
    }
  };

  /* ================================================================
     MISSION PASSED
     ================================================================ */
  /* Upbeat and short: I - V - vi - IV in C at 128 bpm, a bass, a stabbed chord, an arpeggiated lead,
     a kick and a snare. Synthesised here so there is nothing to download. */
  Stage.prototype.music = function () {
    var A = this.game.audio, ctx = A && A.ensure && A.ensure();
    if (!ctx) return { stop: function () {} };
    var out = ctx.createGain(); out.gain.value = 0.0001;
    out.connect(A.master || ctx.destination);
    out.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.8);
    var beat = 60 / 128, bar = beat * 4;
    var CH = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];      // C G Am F
    var LEAD = [72, 76, 79, 76, 74, 79, 83, 79, 72, 76, 81, 76, 77, 81, 84, 81];
    var hz = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };
    var noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), nd = noise.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    function note(type, f, t, dur, vol, lpHz) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var node = o.connect(g);
      if (lpHz) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz; node = g.connect(lp); }
      node.connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function kick(t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
    }
    function snare(t) {
      var s = ctx.createBufferSource(); s.buffer = noise;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      s.connect(hp).connect(g).connect(out); s.start(t); s.stop(t + 0.2);
    }
    var t0 = ctx.currentTime + 0.1, bars = 0, stopped = false;
    function schedule() {
      if (stopped) return;
      while (t0 + bars * bar < ctx.currentTime + 1.6) {
        var tb = t0 + bars * bar, ch = CH[bars % 4];
        note('triangle', hz(ch[0] - 12), tb, beat * 1.8, 0.32);
        note('triangle', hz(ch[0] - 12), tb + beat * 2, beat * 1.8, 0.28);
        for (var b = 0; b < 4; b++) {
          ch.forEach(function (n) { note('sawtooth', hz(n + 12), tb + b * beat + beat * 0.5, beat * 0.35, 0.05, 2400); });
          kick(tb + b * beat);
          if (b % 2 === 1) snare(tb + b * beat);
        }
        for (var q = 0; q < 8; q++) note('square', hz(LEAD[(bars % 2) * 8 + q] + (bars % 4 === 3 ? -3 : 0)), tb + q * beat / 2, beat * 0.45, 0.045, 3200);
        bars++;
      }
      setTimeout(schedule, 400);
    }
    schedule();
    return { stop: function () { stopped = true; out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); } };
  };

  /* Stars, completion and the three buttons. r: { stars, why[], pct, rows[[label, value]], onRestart, onNext, onMenu } */
  Stage.prototype.passed = function (r) {
    var S = this, el = this.$('.pass');
    el.innerHTML = '<div class="h">Mission Passed</div><div class="t">' + (r.title || '') + '</div>'
      + '<div class="stars"><i>&#9733;</i><i>&#9733;</i><i>&#9733;</i></div><div class="why"></div>'
      + '<div class="pct">0%<small>Completion</small></div><ul></ul><div class="b"></div>';
    el.style.display = 'flex';
    var ul = el.querySelector('ul');
    (r.rows || []).forEach(function (row) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + row[0] + '</span><span>' + row[1] + '</span>';
      ul.appendChild(li);
    });
    var buttons = [['Restart mission', r.onRestart], ['Next mission', r.onNext], ['Main menu', r.onMenu]];
    var bdiv = el.querySelector('.b');
    buttons.forEach(function (b, i) {
      var btn = document.createElement('button');
      btn.textContent = b[0];
      if (i === 1) btn.className = 'sel';
      btn.addEventListener('click', function () { if (S._music) S._music.stop(); if (b[1]) b[1](); });
      bdiv.appendChild(btn);
    });
    this._music = this.music();
    var stars = el.querySelectorAll('.stars i');
    setTimeout(function () { el.classList.add('in'); }, 60);
    [0, 1, 2].forEach(function (i) {
      setTimeout(function () {
        stars[i].classList.add('shown');
        if (i < r.stars) { stars[i].classList.add('on'); if (S.game.audio && S.game.audio.tone) S.game.audio.tone(880 * Math.pow(1.26, i), 0.25, 'triangle', 0.12); }
        if (i === 2) el.querySelector('.why').textContent = (r.why || []).join('  /  ');
      }, 900 + i * 420);
    });
    var pctEl = el.querySelector('.pct'), t0 = performance.now();
    (function count() {
      var u = clamp01((performance.now() - t0 - 2200) / 1400);
      pctEl.firstChild.nodeValue = Math.round(r.pct * smooth(u)) + '%';
      if (u < 1) requestAnimationFrame(count);
    })();
    this.passedShown = r;
  };

  W.CAMPAIGN_STAGE = { Stage: Stage, Extra: Extra, smooth: smooth, lerp: lerp, lerp3: lerp3 };
})();
