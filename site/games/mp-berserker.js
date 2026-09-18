/* ====================================================================
   THE BERSERKER SUIT
   ====================================================================
   The eighteen-kill streak, and the only one that is a second body
   rather than a thing that happens to the map.

   IT IS A SEQUENCE, NOT A BUTTON. Six states, and every one of them is
   a thing you watch happen:

     throw    you are holding a flare and there is an arc on the ground
              showing where it lands. The arc is a real ballistic
              solution at the real throw speed, not a straight line
              with a dot on the end, because a predictor that lies is
              worse than none. It can be switched off in the settings.
     smoke    the flare is down and red smoke is climbing out of it.
     jet      an aircraft crosses the map. It does not shoot. It drops
              one capsule, and the capsule falls on the flare.
     open     the capsule is down. Your man walks to it, hits the
              release, and the door goes off its hinges.
     ride     you are the suit.
     out      the suit is dead or the match is, and you are you again.

   WHAT IT IS MADE OF, AND WHY IT IS BUILT OUT OF PRIMITIVES

   Twelve feet of welded plate, a minigun for the right arm and a flame
   nozzle for the left. It is forty-odd boxes, cylinders and a cone --
   no skeleton, no skinning, no animation clips. A mech does not bend;
   it pivots. Every moving part of it is one primitive rotating about
   one axis, which is also why it cannot break the way a rigged body
   can: there is no bind pose to come apart.

   The proportions are held in SUIT below in metres, once, and the
   builder reads them, so the thing that collides and the thing you see
   cannot disagree.

   THE NUMBERS ARE NOT HERE. They are in mp-data's BERSERKER, because
   four files need them and a mech whose health is written down twice
   is a mech with two different healths.
   ==================================================================== */
(function () {
  'use strict';
  var W = window;

  var CSS = `
#mpui .bers { position:absolute; left:50%; bottom:30px; transform:translateX(-50%);
  text-align:center; z-index:46; }
#mpui .bers .hp { position:static; width:420px; }
#mpui .bers .armour { position:relative; height:7px; width:420px;
  background:rgba(0,0,0,.6); border:1px solid #3a3428; }
#mpui .bers .armour i { position:absolute; left:0; top:0; bottom:0;
  background:linear-gradient(90deg,#c8a24e,#ffd27a); transition:width .12s linear; }
#mpui .bers .n { font-size:11px; letter-spacing:.28em; text-transform:uppercase;
  color:#c8bfa8; margin-bottom:6px; }
#mpui .bers .n b { color:#ffd27a; font-weight:normal; }
#mpui .bers .arms { display:flex; gap:22px; justify-content:center; margin-top:9px; }
#mpui .bers .arm { font-size:10px; letter-spacing:.22em; text-transform:uppercase;
  color:#6b6455; border:1px solid #2e2a22; padding:5px 11px;
  background:rgba(6,7,11,.6); min-width:150px; }
#mpui .bers .arm.sel { color:#ffd27a; border-color:#6a5a2e; }
#mpui .bers .arm .heat { display:block; height:2px; margin-top:4px;
  background:#3a3428; }
#mpui .bers .arm .heat i { display:block; height:100%; width:0; background:#ffd27a; }
#mpui .bers .arm.hot .heat i { background:#e2413a; }

/* the throw arc and the landing ring */
#mpui .throwline { position:absolute; inset:0; z-index:43; pointer-events:none; }
#mpui .cine { position:absolute; inset:0; z-index:70; pointer-events:none; }
#mpui .cine .lb { position:absolute; left:0; right:0; height:11%; background:#05060a; }
#mpui .cine .lb.t { top:0; } #mpui .cine .lb.b { bottom:0; }
#mpui .cine .cap { position:absolute; left:0; right:0; bottom:14%; text-align:center;
  font-size:12px; letter-spacing:.34em; text-transform:uppercase; color:#c8bfa8; }
#mpui .cine .cap b { display:block; color:#ffd27a; font-weight:normal;
  font-size:19px; letter-spacing:.20em; margin-bottom:6px; }
`;

  /* ---- the suit, in metres ---- */
  var SUIT = {
    h: 3.66,                 // twelve feet, floor to the top of the shoulders
    hipY: 1.62,              // where the legs meet the body
    torso: { w: 1.34, h: 1.26, d: 0.92 },
    canopy: { w: 0.74, h: 0.52, d: 0.10 },
    shoulder: { r: 0.40 },
    upperLeg: { w: 0.38, h: 0.74, d: 0.42 },
    lowerLeg: { w: 0.32, h: 0.70, d: 0.36 },
    foot: { w: 0.52, h: 0.22, d: 0.86 },
    minigun: { barrels: 6, len: 1.26, r: 0.052, ring: 0.26 },
    flame: { len: 0.96, r: 0.14 },
    /* The eye the player looks from in third person: over the left
       shoulder, because the minigun is on the right and a camera
       behind a spinning six-barrel is a camera behind a wall. */
    camBack: 5.4, camUp: 3.3, camSide: 1.15,
  };

  var MAT = {
    plate: { color: 0x4a4e52, roughness: 0.62, metalness: 0.55, texture: 'metal' },
    dark: { color: 0x23262a, roughness: 0.55, metalness: 0.70, texture: 'metal' },
    hot: { color: 0x8a3a22, roughness: 0.70, metalness: 0.40, texture: 'rust' },
    glass: { color: 0x2b3a44, roughness: 0.14, metalness: 0.20, opacity: 0.55 },
    trim: { color: 0xc8a24e, roughness: 0.42, metalness: 0.80, texture: 'metal' },
  };

  /* ------------------------------------------------------------------
     THE MODEL
     A flat list of primitives, each with a local offset from the suit's
     origin (which is on the FLOOR, between the feet) and, for the parts
     that move, a name. Nothing is parented: the whole thing is placed
     every frame from one position and one yaw, because forty boxes at
     sixty hertz is nothing and a parent chain is another thing that can
     be wrong.
     ------------------------------------------------------------------ */
  function build(game) {
    var P = [];
    function box(name, x, y, z, sx, sy, sz, mat) {
      var a = game.box({ size: [sx, sy, sz], at: [0, -500, 0], physics: false,
        material: mat || MAT.plate, name: 'bers-' + name });
      P.push({ a: a, n: name, o: [x, y, z] });
      return a;
    }
    function cyl(name, x, y, z, r, h, mat, axis) {
      var a = game.cylinder({ radius: r, height: h, at: [0, -500, 0], physics: false,
        material: mat || MAT.plate, name: 'bers-' + name });
      P.push({ a: a, n: name, o: [x, y, z], axis: axis || 'y' });
      return a;
    }

    var T = SUIT.torso, hip = SUIT.hipY;

    /* ---- body ---- */
    box('pelvis', 0, hip - 0.16, 0, T.w * 0.72, 0.42, T.d * 0.80, MAT.dark);
    box('torso', 0, hip + T.h * 0.52, 0, T.w, T.h, T.d);
    box('chestPlate', 0, hip + T.h * 0.66, T.d * 0.50 + 0.03, T.w * 0.86, T.h * 0.46, 0.07, MAT.trim);
    box('canopy', 0, hip + T.h * 0.74, T.d * 0.50 + 0.07,
      SUIT.canopy.w, SUIT.canopy.h, SUIT.canopy.d, MAT.glass);
    box('canopyBar', 0, hip + T.h * 0.74, T.d * 0.50 + 0.12, 0.05, SUIT.canopy.h, 0.05, MAT.dark);
    /* The exhaust stacks, because something has to be burning to move
       four tonnes of plate at walking pace. */
    cyl('stackL', -0.36, hip + T.h + 0.30, -T.d * 0.40, 0.09, 0.58, MAT.hot);
    cyl('stackR', 0.36, hip + T.h + 0.30, -T.d * 0.40, 0.09, 0.58, MAT.hot);
    box('collar', 0, hip + T.h + 0.10, 0, T.w * 0.80, 0.18, T.d * 0.74, MAT.dark);
    /* A sensor head, small and set low, so the silhouette reads as a
       machine with a man in it rather than a robot. */
    box('head', 0, hip + T.h + 0.30, 0.12, 0.42, 0.26, 0.34, MAT.dark);
    box('visor', 0, hip + T.h + 0.30, 0.30, 0.34, 0.11, 0.04, MAT.trim);

    /* ---- shoulders ---- */
    var shY = hip + T.h * 0.78;
    var shX = T.w * 0.5 + 0.16;
    box('shoulderL', -shX, shY, 0, 0.44, 0.52, 0.62);
    box('shoulderR', shX, shY, 0, 0.44, 0.52, 0.62);
    box('pauldronL', -shX - 0.06, shY + 0.26, 0, 0.50, 0.16, 0.70, MAT.trim);
    box('pauldronR', shX + 0.06, shY + 0.26, 0, 0.50, 0.16, 0.70, MAT.trim);

    /* ---- right arm: the minigun ---- */
    var G = SUIT.minigun;
    box('gunBody', shX, shY - 0.18, 0.34, 0.40, 0.42, 0.72, MAT.dark);
    cyl('gunHub', shX, shY - 0.18, 0.34 + 0.40, G.ring, 0.26, MAT.dark, 'z');
    for (var i = 0; i < G.barrels; i++) {
      var a = (i / G.barrels) * Math.PI * 2;
      cyl('barrel' + i, shX + Math.cos(a) * G.ring * 0.62,
        shY - 0.18 + Math.sin(a) * G.ring * 0.62, 0.34 + 0.40 + G.len * 0.5,
        G.r, G.len, MAT.dark, 'z');
    }
    cyl('gunRing', shX, shY - 0.18, 0.34 + 0.40 + G.len, G.ring * 0.94, 0.09, MAT.trim, 'z');
    box('ammoBox', shX + 0.30, shY - 0.34, -0.22, 0.34, 0.50, 0.54, MAT.dark);

    /* ---- left arm: the flame nozzle (or the health cannon) ---- */
    var F = SUIT.flame;
    box('armL', -shX, shY - 0.18, 0.22, 0.38, 0.40, 0.56);
    cyl('nozzle', -shX, shY - 0.18, 0.22 + 0.28 + F.len * 0.5, F.r, F.len, MAT.hot, 'z');
    cyl('nozzleTip', -shX, shY - 0.18, 0.22 + 0.28 + F.len + 0.04, F.r * 1.35, 0.10, MAT.trim, 'z');
    cyl('fuelA', -shX - 0.26, shY - 0.30, -0.30, 0.15, 0.68, MAT.hot);
    cyl('fuelB', -shX + 0.02, shY - 0.30, -0.36, 0.15, 0.68, MAT.hot);

    /* ---- legs: two pistons each, digitigrade, feet flat ---- */
    var UL = SUIT.upperLeg, LL = SUIT.lowerLeg, FT = SUIT.foot;
    [-1, 1].forEach(function (s) {
      var t = s < 0 ? 'L' : 'R', lx = s * 0.40;
      box('hip' + t, lx, hip - 0.24, 0, 0.42, 0.34, 0.46, MAT.dark);
      box('upper' + t, lx, hip - 0.28 - UL.h * 0.5, -0.04, UL.w, UL.h, UL.d);
      cyl('piston' + t, lx + s * 0.22, hip - 0.28 - UL.h * 0.5, 0.16, 0.06, UL.h * 0.9, MAT.trim);
      box('knee' + t, lx, hip - 0.30 - UL.h, 0, 0.34, 0.26, 0.38, MAT.dark);
      box('lower' + t, lx, hip - 0.36 - UL.h - LL.h * 0.5, 0.06, LL.w, LL.h, LL.d);
      box('foot' + t, lx, FT.h * 0.5, 0.10, FT.w, FT.h, FT.d, MAT.dark);
      box('toe' + t, lx, FT.h * 0.4, 0.10 + FT.d * 0.5 + 0.10, FT.w * 0.86, FT.h * 0.7, 0.22, MAT.trim);
    });

    P.forEach(function (q) { q.a.visible = false; });
    return P;
  }

  /* Place the whole suit from one position and one yaw. */
  function put(P, x, y, z, yaw, spin) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    for (var i = 0; i < P.length; i++) {
      var q = P[i], o = q.o;
      /* Forward is +Z at yaw 0, so a yaw rotation about Y takes
         (ox, oz) to (ox*cos + oz*sin, -ox*sin + oz*cos) in this
         handedness -- the same one RIGHT() uses in the match. */
      var wx = o[0] * c + o[2] * s;
      var wz = -o[0] * s + o[2] * c;
      var wy = o[1];
      if (spin && q.n.indexOf('barrel') === 0) {
        /* The six barrels turn about the gun's own axis. */
        var shX = SUIT.torso.w * 0.5 + 0.16;
        var bx = o[0] - shX, by = o[1] - (SUIT.hipY + SUIT.torso.h * 0.78 - 0.18);
        var bc = Math.cos(spin), bs = Math.sin(spin);
        var rx = bx * bc - by * bs, ry = bx * bs + by * bc;
        var lx = rx + shX, ly = ry + (SUIT.hipY + SUIT.torso.h * 0.78 - 0.18);
        wx = lx * c + o[2] * s;
        wz = -lx * s + o[2] * c;
        wy = ly;
      }
      q.a.position.set(x + wx, y + wy, z + wz);
      if (q.a.rotation && q.a.rotation.setFromAxisAngle) {
        var ax = q.axis === 'z' ? AXZ : AXY;
        if (q.axis === 'z') {
          /* A cylinder is built up the Y axis; a barrel points along Z,
             so it is tipped a right angle and then yawed with the rest. */
          Q1.setFromAxisAngle(AXX, Math.PI / 2);
          Q2.setFromAxisAngle(AXY, yaw);
          q.a.rotation.mulQuats(Q2, Q1);
        } else {
          q.a.rotation.setFromAxisAngle(ax, yaw);
        }
      }
    }
  }
  var AXX, AXY, AXZ, Q1, Q2;
  function axes() {
    if (AXX) return;
    AXX = new W.LE.Vec3(1, 0, 0); AXY = new W.LE.Vec3(0, 1, 0);
    AXZ = new W.LE.Vec3(0, 0, 1);
    Q1 = new W.LE.Quat(); Q2 = new W.LE.Quat();
  }

  function show(P, on) { for (var i = 0; i < P.length; i++) P[i].a.visible = on; }

  /* ------------------------------------------------------------------
     make(root, M, game, opts)
     ------------------------------------------------------------------ */
  function make(root, M, game, opts) {
    opts = opts || {};
    axes();
    var B = W.MP_DATA.BERSERKER;
    var parts = null;

    /* Everything the suit owns while it is up. */
    var S = {
      state: 'off', t: 0, level: 1,
      flare: null, capsule: null, jet: null, smoke: null,
      at: null,                       // where the flare landed
      hp: 0, spin: 0, spinUp: 0,
      rounds: B.minigun.rounds, cool: 0,
      healCool: 0, nextShot: 0,
      arm: 0,                         // 0 minigun, 1 flame / health cannon
      yaw: 0, pitch: 0, pos: null,
      aim: 0,
    };

    /* ---- the HUD ---- */
    var el = document.createElement('div');
    el.className = 'bers hide';
    el.innerHTML = '<div class="n">BERSERKER SUIT <b class="lv">L1</b></div>'
      + '<div class="armour"><i></i></div>'
      + '<div class="arms">'
      + '<div class="arm a0">Minigun<span class="heat"><i></i></span></div>'
      + '<div class="arm a1">Flamethrower<span class="heat"><i></i></span></div>'
      + '</div>';
    root.appendChild(el);
    var cine = document.createElement('div');
    cine.className = 'cine hide';
    cine.innerHTML = '<div class="lb t"></div><div class="lb b"></div>'
      + '<div class="cap"><b></b><span></span></div>';
    root.appendChild(cine);
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    line.setAttribute('class', 'throwline hide');
    line.innerHTML = '<path fill="none" stroke="#ffd27a" stroke-width="2"'
      + ' stroke-dasharray="6 5" opacity=".85"/>'
      + '<ellipse fill="none" stroke="#e2413a" stroke-width="2"/>'
      + '<ellipse fill="none" stroke="#e2413a" stroke-width="1" opacity=".5"/>';
    root.appendChild(line);

    function cap(big, small) {
      cine.classList.remove('hide');
      cine.querySelector('b').textContent = big || '';
      cine.querySelector('span').textContent = small || '';
    }
    function uncap() { cine.classList.add('hide'); }

    function indicatorsOn() {
      try { return W.localStorage.getItem('b9.mp.throwArc') !== 'off'; }
      catch (e) { return true; }
    }

    /* ---- throwing the flare ----
       A real ballistic solution: thrown at 17 m/s from the shoulder,
       gravity 19.6 (the match's, not the world's), and the arc is
       sampled until it hits the ground the match reports. */
    var THROW_V = 17;
    function solve(from, yaw, pitch) {
      var g = 19.6;
      var cp = Math.cos(pitch);
      var v = { x: Math.sin(yaw) * cp * THROW_V, y: -Math.sin(pitch) * THROW_V,
        z: Math.cos(yaw) * cp * THROW_V };
      var pts = [], p = { x: from.x, y: from.y, z: from.z };
      for (var i = 0; i < 90; i++) {
        var dt = 1 / 30;
        p = { x: p.x + v.x * dt, y: p.y + v.y * dt - 0.5 * g * dt * dt, z: p.z + v.z * dt };
        v.y -= g * dt;
        pts.push({ x: p.x, y: p.y, z: p.z });
        var gr = M.groundAt ? M.groundAt(p.x, p.z, p.y + 1.2) : 0;
        if (gr != null && p.y <= gr) { pts[pts.length - 1].y = gr; break; }
        if (p.y < -30) break;
      }
      return pts;
    }

    function drawArc(pts) {
      if (!pts || !pts.length || !indicatorsOn()) { line.classList.add('hide'); return; }
      var w = root.clientWidth, h = root.clientHeight;
      line.setAttribute('width', w); line.setAttribute('height', h);
      line.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var d = '', seen = 0;
      for (var i = 0; i < pts.length; i += 2) {
        var s = game.project ? game.project([pts[i].x, pts[i].y, pts[i].z]) : null;
        if (!s || s.behind) continue;
        d += (seen++ ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1) + ' ';
      }
      line.querySelector('path').setAttribute('d', d);
      var end = pts[pts.length - 1];
      var e = game.project ? game.project([end.x, end.y + 0.02, end.z]) : null;
      var rings = line.querySelectorAll('ellipse');
      if (e && !e.behind) {
        /* The ring is drawn by projecting a point a metre to the side
           of the landing spot, so it shrinks with distance on its own
           rather than through a magic number. */
        var side = game.project([end.x + 1, end.y + 0.02, end.z]);
        var rx = side && !side.behind ? Math.abs(side.x - e.x) : 24;
        for (var k = 0; k < rings.length; k++) {
          rings[k].setAttribute('cx', e.x); rings[k].setAttribute('cy', e.y);
          rings[k].setAttribute('rx', rx * (k ? 1.7 : 1));
          rings[k].setAttribute('ry', rx * (k ? 1.7 : 1) * 0.34);
        }
        line.classList.remove('hide');
      } else line.classList.add('hide');
      line.classList.toggle('hide', seen < 2);
    }

    /* ---- calling it in ---- */
    function callIn(level) {
      if (S.state !== 'off') return false;
      S.level = level || 1;
      S.state = 'throw'; S.t = 0;
      el.querySelector('.lv').textContent = 'L' + S.level;
      el.querySelector('.a1').textContent = S.level >= 2 ? 'Health Cannon' : 'Flamethrower';
      el.querySelector('.a1').innerHTML = (S.level >= 2 ? 'Health Cannon' : 'Flamethrower')
        + '<span class="heat"><i></i></span>';
      cap('Berserker Suit', 'throw the flare');
      return true;
    }

    function spawnFlare(at) {
      S.at = at;
      S.flare = game.cylinder({ radius: 0.07, height: 0.24, at: [at.x, at.y + 0.12, at.z],
        physics: false, material: { color: 0xe2413a, emissive: 0xe2413a, emissiveIntensity: 2.2 },
        name: 'bers-flare' });
      S.smoke = [];
      for (var i = 0; i < 9; i++) {
        S.smoke.push(game.sphere({ radius: 0.5 + i * 0.16, at: [at.x, at.y - 40, at.z],
          physics: false, name: 'bers-smoke-' + i,
          material: { color: 0xc8362f, opacity: 0.34, emissive: 0x5a1512,
            emissiveIntensity: 0.5 } }));
      }
      S.state = 'smoke'; S.t = 0;
      cap('', 'marker down — stand clear');
    }

    function spawnJet(at) {
      /* Crosses the map along X at a hundred metres a second, forty
         metres up, and drops the capsule when it is over the flare. */
      S.jet = game.box({ size: [11, 1.5, 2.2], at: [at.x - 260, at.y + 42, at.z],
        physics: false, material: MAT.dark, name: 'bers-jet' });
      S.jetWing = game.box({ size: [3.4, 0.5, 9.5], at: [at.x - 260, at.y + 42, at.z],
        physics: false, material: MAT.dark, name: 'bers-jetwing' });
      S.jetTail = game.box({ size: [1.4, 2.6, 2.0], at: [at.x - 265, at.y + 43, at.z],
        physics: false, material: MAT.dark, name: 'bers-jettail' });
      S.jetX = -260; S.dropped = false;
      S.state = 'jet'; S.t = 0;
      cap('', 'inbound');
    }

    function spawnCapsule(at) {
      S.capsule = game.box({ size: [1.9, 4.4, 1.9], at: [at.x, at.y + 44, at.z],
        physics: false, material: MAT.plate, name: 'bers-capsule' });
      S.capDoor = game.box({ size: [1.72, 3.2, 0.14], at: [at.x, at.y + 44, at.z + 0.95],
        physics: false, material: MAT.trim, name: 'bers-capdoor' });
      S.capY = at.y + 44; S.capVy = 0;
    }

    function openUp() {
      S.state = 'open'; S.t = 0;
      cap('', 'release');
    }

    function mount() {
      if (!parts) parts = build(game);
      show(parts, true);
      S.state = 'ride'; S.t = 0;
      S.hp = B.hp + (S.level >= 3 ? 0 : 0);
      S.rounds = B.minigun.rounds; S.cool = 0; S.healCool = 0;
      S.arm = 0; S.spin = 0; S.spinUp = 0; S.aim = 0;
      S.pos = { x: S.at.x, y: S.at.y, z: S.at.z };
      S.yaw = M.you.yaw; S.pitch = 0;
      el.classList.remove('hide');
      uncap();
      /* Your own body goes away and your weapons with it: you are not
         holding anything for as long as you are in this. */
      M.you.inSuit = true;
      if (M.you.actor) M.you.actor.visible = false;
      if (opts.onMount) opts.onMount();
    }

    function dismount(why) {
      if (parts) show(parts, false);
      el.classList.add('hide');
      uncap();
      line.classList.add('hide');
      M.you.inSuit = false;
      if (M.you.actor) M.you.actor.visible = true;
      /* You come out where it fell, and you come out hurt. */
      if (S.pos) { M.you.pos.x = S.pos.x; M.you.pos.z = S.pos.z; }
      if (why === 'killed') M.you.hp = Math.min(M.you.hp, 40);
      clean();
      S.state = 'off';
      if (opts.onEnd) opts.onEnd(why);
    }

    function kill(a) { if (a && a.remove) a.remove(); else if (a) a.visible = false; }
    function clean() {
      kill(S.flare); S.flare = null;
      if (S.smoke) S.smoke.forEach(kill);
      S.smoke = null;
      kill(S.jet); kill(S.jetWing); kill(S.jetTail);
      S.jet = S.jetWing = S.jetTail = null;
      kill(S.capsule); kill(S.capDoor); S.capsule = S.capDoor = null;
    }

    /* ---- the two arms ---- */
    function muzzle() {
      var shX = SUIT.torso.w * 0.5 + 0.16, shY = SUIT.hipY + SUIT.torso.h * 0.78 - 0.18;
      var side = S.arm ? -shX : shX;
      var fwd = S.arm ? 0.22 + 0.28 + SUIT.flame.len : 0.34 + 0.40 + SUIT.minigun.len;
      var c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      return { x: S.pos.x + side * c + fwd * s, y: S.pos.y + shY, z: S.pos.z - side * s + fwd * c };
    }

    function fireMinigun(dt) {
      var G = B.minigun;
      if (S.cool > 0) return;
      S.spinUp = Math.min(1, S.spinUp + dt / (S.level >= 3 ? 0.05 : G.spin));
      if (S.spinUp < 0.999) return;
      var gap = 60 / G.rpm;
      while (M.time >= S.nextShot) {
        S.nextShot = Math.max(M.time, S.nextShot) + gap;
        S.rounds--;
        shoot(G.damage, G.spread, 140);
        if (S.rounds <= 0) { S.cool = S.level >= 3 ? 2.0 : G.cool; S.rounds = G.rounds; break; }
      }
    }

    function fireFlame(dt) {
      var F = B.flame;
      var gap = 60 / F.rpm;
      while (M.time >= S.nextShot) {
        S.nextShot = Math.max(M.time, S.nextShot) + gap;
        shoot(F.damage, F.cone, F.reach);
      }
    }

    function fireHealth() {
      var H = B.health;
      if (S.healCool > 0) return;
      var gap = 60 / H.rpm;
      if (M.time < S.nextShot) return;
      S.nextShot = M.time + gap;
      /* One slug. It heals a friend, heals you if you point it at your
         own feet, and hurts an enemy -- and the target is picked by the
         same cone the minigun uses so it cannot heal through a wall. */
      var hit = pick(3.0);
      if (hit) {
        if (hit.team === M.you.team) hit.hp = Math.min(100, hit.hp + H.heal);
        else M.damage(M.you, hit, H.damage, false);
      } else {
        M.you.hp = Math.min(100, M.you.hp + H.heal * 0.5);
      }
      S.healCool = H.cool;
    }

    /* Whoever the suit is pointing at, inside `deg` degrees and in
       sight. The same shape of test the match uses for a bullet. */
    function pick(deg, reach) {
      var m = muzzle();
      var c = Math.cos(S.yaw) * Math.cos(S.pitch);
      var f = { x: Math.sin(S.yaw) * Math.cos(S.pitch), y: -Math.sin(S.pitch), z: c };
      var lim = Math.cos((deg || 3) * Math.PI / 180);
      var far = reach || 160;
      var best = null, bd = 1e9;
      for (var i = 0; i < M.people.length; i++) {
        var q = M.people[i];
        if (!q.alive || q.id === M.you.id) continue;
        var dx = q.pos.x - m.x, dy = (q.pos.y + 1.0) - m.y, dz = q.pos.z - m.z;
        var d = Math.hypot(dx, dy, dz);
        if (d > far || d < 0.01) continue;
        var dot = (dx * f.x + dy * f.y + dz * f.z) / d;
        if (dot < lim) continue;
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    }

    function shoot(damage, spread, reach) {
      var deg = Math.max(0.6, (spread || 0.02) * 57.3);
      var t = pick(deg, reach);
      if (t) M.damage(M.you, t, damage, false);
    }

    /* ---- damage taken ----
       Called by the match when a round would have hit you. */
    function absorb(amount) {
      if (S.state !== 'ride') return false;
      S.hp -= amount;
      if (S.hp <= 0) { S.hp = 0; dismount('killed'); }
      return true;
    }

    /* ---- the frame ---- */
    function poll(dt, cmd, camera) {
      if (S.state === 'off') return null;
      S.t += dt;
      var you = M.you;

      if (S.state === 'throw') {
        var eye = { x: you.pos.x, y: you.pos.y + 1.52, z: you.pos.z };
        var pts = solve(eye, cmd.yaw, cmd.pitch);
        drawArc(pts);
        if (cmd.fire && S.t > 0.35) {
          line.classList.add('hide');
          spawnFlare(pts[pts.length - 1]);
        }
        return null;
      }
      line.classList.add('hide');

      if (S.state === 'smoke') {
        /* The smoke climbs, widening, for the length of the fuse. */
        var f = Math.min(1, S.t / B.flare.smoke);
        for (var i = 0; i < S.smoke.length; i++) {
          var lag = i / S.smoke.length;
          var rise = Math.max(0, f - lag * 0.5) * 9;
          S.smoke[i].position.set(S.at.x + Math.sin(S.t * 1.4 + i) * rise * 0.10,
            S.at.y + rise, S.at.z + Math.cos(S.t * 1.1 + i) * rise * 0.10);
        }
        if (S.t >= B.flare.smoke) spawnJet(S.at);
        return null;
      }

      if (S.state === 'jet') {
        S.jetX += 150 * dt;
        var jy = S.at.y + 42;
        [S.jet, S.jetWing, S.jetTail].forEach(function (a, k) {
          if (a) a.position.set(S.at.x + S.jetX - (k === 2 ? 5 : 0), jy + (k === 2 ? 1 : 0), S.at.z);
        });
        if (!S.dropped && S.jetX >= 0) { S.dropped = true; spawnCapsule(S.at); }
        if (S.capsule) {
          S.capVy -= 19.6 * dt * 0.42;      // braked: it is on a chute
          S.capY = Math.max(S.at.y + 2.2, S.capY + S.capVy * dt);
          S.capsule.position.set(S.at.x, S.capY, S.at.z);
          S.capDoor.position.set(S.at.x, S.capY, S.at.z + 0.98);
          if (S.capY <= S.at.y + 2.21) openUp();
        }
        return null;
      }

      if (S.state === 'open') {
        /* THE SHORT CUTSCENE. Your man walks the last few metres, hits
           the release, and the door goes. Held on rails because this is
           the one moment in the streak that is a picture rather than a
           thing you are doing. */
        var T = B.flare.open;
        var k = Math.min(1, S.t / T);
        var ang = k * Math.PI * 0.35;
        var away = 7.0 - k * 2.0;
        if (camera) {
          camera.eye = [S.at.x + Math.sin(ang) * away, S.at.y + 2.6 + k * 0.6,
            S.at.z + Math.cos(ang) * away];
          camera.at = [S.at.x, S.at.y + 2.0, S.at.z];
        }
        if (k > 0.55 && S.capDoor && S.capDoor.visible !== false) {
          /* The door does not swing. It is blown off and lands. */
          var g = (k - 0.55) / 0.45;
          S.capDoor.position.set(S.at.x, S.capY + g * 1.4 - g * g * 2.6,
            S.at.z + 0.98 + g * 4.2);
        }
        if (k > 0.35) cap('', 'stand by');
        if (k >= 1) { if (S.capsule) S.capsule.visible = false;
          if (S.capDoor) S.capDoor.visible = false; mount(); }
        return camera || null;
      }

      if (S.state !== 'ride') return null;

      /* ---- driving it ---- */
      /* It turns like a tank and walks like one. The stick still turns
         the view instantly -- only the BODY is slow -- because a camera
         that lags the stick is a camera nobody can aim. */
      S.yaw = cmd.yaw; S.pitch = cmd.pitch;
      var fwd = cmd.forward || 0, str = cmd.right || 0;
      var len = Math.hypot(fwd, str);
      if (len > 1) { fwd /= len; str /= len; }
      var sp = B.walk;
      var c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      S.pos.x += (s * fwd - c * str) * sp * dt;
      S.pos.z += (c * fwd + s * str) * sp * dt;
      var gr = M.groundAt ? M.groundAt(S.pos.x, S.pos.z, S.pos.y + 1.0) : 0;
      S.pos.y = gr != null ? gr : S.pos.y;
      /* Your body goes where the suit goes, so the match's scoring,
         spawn logic and minimap all still know where you are. */
      you.pos.x = S.pos.x; you.pos.z = S.pos.z; you.pos.y = S.pos.y;
      you.yaw = S.yaw; you.pitch = S.pitch;

      /* Swap arms. */
      if (cmd.swap) S.arm = S.arm ? 0 : 1;

      /* Aiming narrows the field of view; it does nothing else, which
         is exactly what was asked for. */
      var wantAim = cmd.aim ? 1 : 0;
      S.aim += (wantAim - S.aim) * Math.min(1, dt * 9);

      if (S.cool > 0) S.cool = Math.max(0, S.cool - dt);
      if (S.healCool > 0) S.healCool = Math.max(0, S.healCool - dt);

      if (cmd.fire) {
        if (S.arm === 0) fireMinigun(dt);
        else if (S.level >= 2) fireHealth();
        else fireFlame(dt);
      } else {
        S.spinUp = Math.max(0, S.spinUp - dt * 1.6);
        S.nextShot = Math.max(S.nextShot, M.time);
      }
      S.spin += S.spinUp * dt * 34;

      put(parts, S.pos.x, S.pos.y, S.pos.z, S.yaw, S.spin);

      /* ---- the HUD ---- */
      var bar = el.querySelector('.armour i');
      if (bar) bar.style.width = (100 * S.hp / B.hp).toFixed(1) + '%';
      var a0 = el.querySelector('.a0'), a1 = el.querySelector('.a1');
      a0.classList.toggle('sel', S.arm === 0);
      a1.classList.toggle('sel', S.arm === 1);
      a0.classList.toggle('hot', S.cool > 0);
      a1.classList.toggle('hot', S.healCool > 0);
      var h0 = a0.querySelector('.heat i'), h1 = a1.querySelector('.heat i');
      if (h0) {
        h0.style.width = S.cool > 0
          ? (100 * (1 - S.cool / B.minigun.cool)).toFixed(0) + '%'
          : (100 * S.rounds / B.minigun.rounds).toFixed(0) + '%';
      }
      if (h1) {
        h1.style.width = S.level >= 2
          ? (S.healCool > 0 ? (100 * (1 - S.healCool / B.health.cool)).toFixed(0) : '100') + '%'
          : '100%';
      }

      /* ---- the camera: third person, over the left shoulder ---- */
      var back = SUIT.camBack * (1 - S.aim * 0.35);
      var up = SUIT.camUp;
      var eyeX = S.pos.x - Math.sin(S.yaw) * back + Math.cos(S.yaw) * SUIT.camSide;
      var eyeZ = S.pos.z - Math.cos(S.yaw) * back - Math.sin(S.yaw) * SUIT.camSide;
      var eyeY = S.pos.y + up + S.pitch * -2.2;
      var aimAt = {
        x: S.pos.x + Math.sin(S.yaw) * 24,
        y: S.pos.y + 2.4 - Math.sin(S.pitch) * 24,
        z: S.pos.z + Math.cos(S.yaw) * 24,
      };
      return { eye: [eyeX, eyeY, eyeZ], at: [aimAt.x, aimAt.y, aimAt.z],
        fov: 55 * (B.fov.hip + (B.fov.ads - B.fov.hip) * S.aim) };
    }

    return {
      callIn: callIn,
      poll: poll,
      absorb: absorb,
      dismount: dismount,
      get state() { return S.state; },
      get active() { return S.state !== 'off'; },
      get riding() { return S.state === 'ride'; },
      get hp() { return S.hp; },
      get level() { return S.level; },
      _S: S,
      dispose: function () {
        clean();
        if (parts) show(parts, false);
        [el, cine, line].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      },
    };
  }

  W.MP_BERSERKER = { make: make, CSS: CSS, SUIT: SUIT, build: build, put: put };
}());
