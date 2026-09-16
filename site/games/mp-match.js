/* ==================================================================
   THE MATCH
   ==================================================================
   Six a side on one of the four maps, in one of the two modes, with
   bots filling whatever the lobby has not.

   WHAT THIS IS AND IS NOT

   It is the rules and the bodies: who is on which side, where they
   come back, what a bullet does when it arrives, who is winning, and
   when it stops. It owns no pixels. The HUD reads it, the bots are
   driven by it, and a headless test can run a whole ten minute match
   in a few seconds without a screen -- which is the only way to find
   out whether a map plays before anybody has to play it.

   THE BOTS ARE NOT PRETENDING TO BE PEOPLE

   They are pretending to be players, which is a different and easier
   job. A player walks towards where the fight is, stops when they can
   see somebody, shoots at them with roughly their own accuracy, takes
   cover when hurt, and reloads at the wrong moment. That is the whole
   state machine, and it is four states, because a bot with fourteen
   states is a bot that does something inexplicable once a match and
   ruins it.

   The skill levels differ in three numbers and nothing else: how well
   they aim, how long they take to notice you, and how much they
   wander. An Elite is not given more health or a better gun -- it is
   given a shorter reaction time, and that is what being good at this
   game actually is.

   NAVIGATION

   The grid sweep, the A*, and the line-of-sight smoothing are the same
   algorithm zombies uses, written again here rather than shared. That
   is a deliberate choice and not an oversight: the zombies copy is
   wired into a round loop with its own map assumptions, and pulling it
   out mid-feature to refactor a game that works is how a working game
   stops working. engine/test/navsame.test.js runs both over the same
   world and fails if they ever disagree, so the copies cannot drift
   quietly. They should be merged the next time zombies is opened.
   ================================================================== */

(function () {
  'use strict';

  var W = window;
  var HEALTH = 100;
  var EYE = 1.62;
  var RESPAWN = 5.0;            // seconds, team deathmatch
  var NAV_CELL = 0.55;
  var NAV_Y = 1.05;

  /* ================================================================
     NAVIGATION
     ================================================================ */

  function navBuild(game, box, y) {
    var c = NAV_CELL;
    var w = Math.ceil((box.x1 - box.x0) / c);
    var h = Math.ceil((box.z1 - box.z0) / c);
    var g = new Uint8Array(w * h);
    var solid = function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); };
    function mark(x, z) {
      var i = Math.floor((x - box.x0) / c), j = Math.floor((z - box.z0) / c);
      if (i >= 0 && i < w && j >= 0 && j < h) g[j * w + i] = 1;
    }
    /* March, do not single-cast. One ray down a row reports only the
       first thing it meets; restarting a little past each hit walks the
       whole row and finds the far side of the crate as well as the
       near side. */
    function sweep(along) {
      var n = along === 'x' ? h : w;
      for (var k = 0; k < n; k++) {
        var fixed = (along === 'x' ? box.z0 : box.x0) + (k + 0.5) * c;
        var t = 0;
        var span = along === 'x' ? box.x1 - box.x0 : box.z1 - box.z0;
        for (var guard = 0; guard < 400 && t < span; guard++) {
          var ox = along === 'x' ? box.x0 + t : fixed;
          var oz = along === 'x' ? fixed : box.z0 + t;
          var dir = along === 'x' ? [1, 0, 0] : [0, 0, 1];
          var hit = game.raycast([ox, y, oz], dir, span - t, solid);
          if (!hit) break;
          var d = Math.hypot(hit.point.x - ox, hit.point.z - oz);
          mark(hit.point.x, hit.point.z);
          t += d + c * 0.5;
        }
      }
    }
    sweep('x'); sweep('z');
    return { box: box, w: w, h: h, c: c, g: g };
  }

  function navBlocked(nav, i, j) {
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return true;
    return nav.g[j * nav.w + i] === 1;
  }

  /* WHAT IS ACTUALLY REACHABLE, worked out once.
   *
     A goal inside a wall, or on the far side of one with no way round,
     makes A* explore every cell it can get to before admitting defeat.
     On Demolition -- a hundred and eighty-two cells square -- that is
     thirty-three thousand cells a go, and four hundred and twenty-nine
     failed searches in two simulated minutes came to eighteen MILLION
     cells examined. It was the difference between a match that
     simulates in one second and one that takes seventy-two.

     One flood fill at the start of the match says which cells are
     connected to the ground the players are standing on. After that a
     goal is snapped onto that set before anybody paths to it, and the
     failure case stops existing rather than being made cheaper. */
  function navFlood(nav, from) {
    var w = nav.w, h = nav.h, c = nav.c, b = nav.box;
    var reach = new Uint8Array(w * h);
    var si = Math.max(0, Math.min(w - 1, Math.floor((from.x - b.x0) / c)));
    var sj = Math.max(0, Math.min(h - 1, Math.floor((from.z - b.z0) / c)));
    if (navBlocked(nav, si, sj)) {
      /* The seed may be standing on a marked cell -- a doorway, a step.
         Walk out to the first free one. */
      var found = false;
      for (var r = 1; r < 12 && !found; r++) {
        for (var j = sj - r; j <= sj + r && !found; j++) {
          for (var i = si - r; i <= si + r && !found; i++) {
            if (!navBlocked(nav, i, j)) { si = i; sj = j; found = true; }
          }
        }
      }
      if (!found) return reach;
    }
    var q = [sj * w + si];
    reach[sj * w + si] = 1;
    for (var k = 0; k < q.length; k++) {
      var cur = q[k], ci2 = cur % w, cj2 = (cur / w) | 0;
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          var ni = ci2 + di, nj = cj2 + dj;
          if (navBlocked(nav, ni, nj)) continue;
          var kk = nj * w + ni;
          if (reach[kk]) continue;
          reach[kk] = 1; q.push(kk);
        }
      }
    }
    nav.reach = reach;
    return reach;
  }

  function navReachable(nav, x, z) {
    if (!nav.reach) return true;
    var i = Math.floor((x - nav.box.x0) / nav.c), j = Math.floor((z - nav.box.z0) / nav.c);
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return false;
    return nav.reach[j * nav.w + i] === 1;
  }

  /* The nearest cell anybody can actually stand in. Spirals out, so the
     answer is the closest one rather than the first one found. */
  function navSnap(nav, x, z) {
    if (navReachable(nav, x, z)) return { x: x, z: z };
    var w = nav.w, h = nav.h, c = nav.c, b = nav.box;
    var ci2 = Math.floor((x - b.x0) / c), cj2 = Math.floor((z - b.z0) / c);
    for (var r = 1; r < 26; r++) {
      var best = null, bd = 1e9;
      for (var j = cj2 - r; j <= cj2 + r; j++) {
        for (var i = ci2 - r; i <= ci2 + r; i++) {
          if (Math.max(Math.abs(i - ci2), Math.abs(j - cj2)) !== r) continue;
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          if (!nav.reach || nav.reach[j * w + i] !== 1) continue;
          var d = (i - ci2) * (i - ci2) + (j - cj2) * (j - cj2);
          if (d < bd) { bd = d; best = [i, j]; }
        }
      }
      if (best) return { x: b.x0 + (best[0] + 0.5) * c, z: b.z0 + (best[1] + 0.5) * c };
    }
    return null;
  }

  function navClear(nav, a, b) {
    var c = nav.c;
    var d = Math.hypot(b.x - a.x, b.z - a.z);
    var steps = Math.ceil(d / (c * 0.5));
    for (var k = 1; k < steps; k++) {
      var t = k / steps;
      var x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      var i = Math.floor((x - nav.box.x0) / c), j = Math.floor((z - nav.box.z0) / c);
      if (navBlocked(nav, i, j)) return false;
    }
    return true;
  }

  function navPath(nav, from, to, stats) {
    var c = nav.c, b = nav.box, w = nav.w, h = nav.h;
    function ci(x) { return Math.max(0, Math.min(w - 1, Math.floor((x - b.x0) / c))); }
    function cj(z) { return Math.max(0, Math.min(h - 1, Math.floor((z - b.z0) / c))); }
    var si = ci(from.x), sj = cj(from.z);
    var ti = ci(to.x), tj = cj(to.z);
    if (si === ti && sj === tj) return [];
    /* Not connected to anything: refuse before searching, not after. */
    if (nav.reach && nav.reach[tj * w + ti] !== 1) return null;
    if (navBlocked(nav, ti, tj)) {
      var best = null, bd = 1e9;
      for (var j2 = Math.max(0, tj - 5); j2 <= Math.min(h - 1, tj + 5); j2++) {
        for (var i2 = Math.max(0, ti - 5); i2 <= Math.min(w - 1, ti + 5); i2++) {
          if (navBlocked(nav, i2, j2)) continue;
          var dd = (i2 - ti) * (i2 - ti) + (j2 - tj) * (j2 - tj);
          if (dd < bd) { bd = dd; best = [i2, j2]; }
        }
      }
      if (!best) return null;
      ti = best[0]; tj = best[1];
    }
    var n = w * h;
    var gScore = new Float32Array(n).fill(Infinity);
    var came = new Int32Array(n).fill(-1);
    var closed = new Uint8Array(n);
    var start = sj * w + si, goal = tj * w + ti;
    gScore[start] = 0;
    function hEst(k) {
      var i = k % w, j = (k / w) | 0;
      var dx = Math.abs(i - ti), dz = Math.abs(j - tj);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    }
    /* A BINARY HEAP, AND NOT A LINEAR SCAN.
     *
       The zombies version scans the open set to find the cheapest cell,
       with a comment saying the grid is under two thousand cells and a
       scan costs less than the code to avoid it. That is true of the
       bunker. It is not true here: Demolition's grid is a hundred and
       eighty-two squared, so a search that has to look at most of it
       does thirty-three thousand scans of an open set that is itself
       thousands long. One twelve-minute match on that map took SEVENTY
       TWO SECONDS to simulate, against four for the others.

       The heap is twenty lines and makes it linear-ish in the number of
       cells examined. */
    var heap = [], hf = [];
    function push(k, f) {
      heap.push(k); hf.push(f);
      var c = heap.length - 1;
      while (c > 0) {
        var par = (c - 1) >> 1;
        if (hf[par] <= hf[c]) break;
        var tk = heap[par]; heap[par] = heap[c]; heap[c] = tk;
        var tf = hf[par]; hf[par] = hf[c]; hf[c] = tf;
        c = par;
      }
    }
    function pop() {
      var top = heap[0];
      var lastK = heap.pop(), lastF = hf.pop();
      if (heap.length) {
        heap[0] = lastK; hf[0] = lastF;
        var c2 = 0;
        for (;;) {
          var l = c2 * 2 + 1, r2 = l + 1, m2 = c2;
          if (l < heap.length && hf[l] < hf[m2]) m2 = l;
          if (r2 < heap.length && hf[r2] < hf[m2]) m2 = r2;
          if (m2 === c2) break;
          var tk2 = heap[m2]; heap[m2] = heap[c2]; heap[c2] = tk2;
          var tf2 = hf[m2]; hf[m2] = hf[c2]; hf[c2] = tf2;
          c2 = m2;
        }
      }
      return top;
    }
    push(start, hEst(start));
    var found = false, guard = 0;
    while (heap.length && guard++ < 40000) {
      if (stats) stats.pathCells++;
      var cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      var i3 = cur % w, j3 = (cur / w) | 0;
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          var ni = i3 + di, nj = j3 + dj;
          if (navBlocked(nav, ni, nj)) continue;
          if (di && dj && (navBlocked(nav, i3 + di, j3) || navBlocked(nav, i3, j3 + dj))) continue;
          var kk = nj * w + ni;
          if (closed[kk]) continue;
          var step = (di && dj) ? Math.SQRT2 : 1;
          var g2 = gScore[cur] + step;
          if (g2 < gScore[kk]) {
            gScore[kk] = g2; came[kk] = cur;
            /* Pushed again rather than decreased in place; the stale
               copy is skipped when it comes out, because by then the
               cell is closed. */
            push(kk, g2 + hEst(kk));
          }
        }
      }
    }
    if (!found) return null;
    var out = [];
    for (var k3 = goal; k3 !== -1 && k3 !== start; k3 = came[k3]) {
      out.push([b.x0 + (k3 % w + 0.5) * c, 0, b.z0 + (((k3 / w) | 0) + 0.5) * c]);
    }
    out.reverse();
    var keep = [];
    var at = { x: from.x, z: from.z };
    for (var k4 = 0; k4 < out.length; k4++) {
      var next = out[k4 + 1];
      if (next && navClear(nav, at, { x: next[0], z: next[2] })) continue;
      keep.push(out[k4]);
      at = { x: out[k4][0], z: out[k4][2] };
    }
    return keep;
  }

  /* ================================================================
     RANDOMNESS YOU CAN REPLAY
     ================================================================
     A match that cannot be run twice the same way cannot be debugged.
     Everything random goes through here. */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ================================================================
     A COMBATANT
     ================================================================
     You and the eleven bots are the same object with one flag
     different, deliberately. Every rule -- damage, falloff, reloads,
     respawn timing, the scoreboard -- then applies to all twelve
     without a single branch, and it is not possible for the player to
     be quietly advantaged by a rule the bots go through a different
     path for. */

  function makeCombatant(M, i, team, def) {
    var lo = def.loadout;
    var primary = MP_DATA.build(lo.primary, lo.primaryAtt);
    var secondary = MP_DATA.build(lo.secondary, lo.secondaryAtt);
    return {
      id: i, name: def.name, team: team, bot: !!def.bot, skill: def.skill || null,
      operator: def.operator || null,
      hp: HEALTH, alive: false, respawnAt: 0,
      pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      sliding: false, slideEnd: 0, slideRecover: 0,
      vel: { x: 0, z: 0 },
      actor: null,
      guns: [primary, secondary], held: 0,
      ammo: [primary.mag, secondary.mag],
      reserve: [primary.mag * 10, secondary.mag * 10],
      reloadUntil: 0, nextShot: 0,
      loadout: lo,
      kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, bestStreak: 0,
      /* Everything the bot brain keeps between frames. Empty for you. */
      aiming: false,
      ai: { state: 'advance', target: null, sawAt: -99, path: null, pathAt: -99,
        pathIdx: 0, goal: null, goalAt: -99, strafe: 1, jitter: 0,
        lostAt: -99, reactAt: 0 },
    };
  }

  /* WHICH WAY IS RIGHT.
   *
     The engine is a standard right-handed system -- X right, Y up, Z out
     of the screen -- and this game points the camera along +Z, which
     means it is looking BACKWARD along the standard axis and the
     player's right hand is at -X. Rendered proof: a box at x = +3, four
     metres ahead, draws on the LEFT of the screen.

     Every yaw formula in here assumed right was +X. So looking right
     turned you left, strafing right walked you left, and the gun was
     held out over the player's left shoulder -- far enough out of frame
     that it read as "my gun doesn't come up, it's invisible". One sign,
     three symptoms that look like three bugs.

     Defined once, here, so it cannot be got wrong in a fourth place. */
  function RIGHT(yaw) { return { x: -Math.cos(yaw), z: Math.sin(yaw) }; }

  function gun(p) { return p.guns[p.held]; }

  /* Damage over distance. Full damage inside `near`, the far figure past
     `far`, and a straight ramp between the two -- which is the whole of
     why an SMG loses a street and a rifle loses a room. */
  function damageAt(w, d) {
    if (d <= w.near) return w.dmg;
    if (d >= w.far) return w.dmgFar;
    var t = (d - w.near) / (w.far - w.near);
    return w.dmg + (w.dmgFar - w.dmg) * t;
  }

  /* ================================================================
     THE MATCH
     ================================================================ */

  function start(opts) {
    var game = opts.game;
    var mapId = opts.mapId || 'town';
    var modeId = opts.mode || 'tdm';
    var mode = MP_DATA.MODES.filter(function (m) { return m.id === modeId; })[0] || MP_DATA.MODES[0];
    var teamSize = opts.teamSize || MP_DATA.TEAM_SIZE;
    var rand = rng(opts.seed || 20260915);
    var emit = opts.onEvent || function () {};
    var headless = !!opts.headless;

    var map = MP_MAPS.build(game, mapId);
    if (!map) throw new Error('no such map: ' + mapId);

    var R = mapId === 'demolition' ? 50 : (mapId === 'town' ? 62 : 58);
    var nav = navBuild(game, { x0: -R, x1: R, z0: -R, z1: R }, NAV_Y);
    /* Seeded from a spawn point, because that is by definition ground
       somebody is standing on. */
    navFlood(nav, { x: map.spawns.a[2].at[0], z: map.spawns.a[2].at[2] });

    /* ---- who is playing ---- */
    var people = [];
    var names = MP_DATA.BOT_NAMES.slice();
    var you = opts.you || {};
    people.push(makeCombatant(null, 0, 'a', {
      name: you.name || 'YOU', bot: !!opts.youBot,
      skill: opts.youBot ? MP_DATA.BOT_SKILL[2] : null,
      loadout: you.loadout || MP_DATA.defaultLoadout(),
      operator: you.operator || 'delta',
    }));
    for (var i = 1; i < teamSize * 2; i++) {
      var team = (i % 2) ? 'b' : 'a';
      var sk = MP_DATA.BOT_SKILL[(i * 3 + 1) % MP_DATA.BOT_SKILL.length];
      people.push(makeCombatant(null, i, team, {
        name: names[(i - 1) % names.length], bot: true, skill: sk,
        loadout: botLoadout(rand),
      }));
    }

    /* Counters. Cheap, always on, and the only reason the first
       simulated match was debuggable at all: it dealt four hundred
       damage and produced no kills, and no amount of reading the code
       said whether that was one long fight or forty single shots. */
    var stats = { scans: 0, acquired: 0, shots: 0, hits: 0, engageTicks: 0,
      advanceTicks: 0, breakTicks: 0, paths: 0, pathFail: 0, pathCells: 0,
      losCalls: 0, seen: 0 };

    var M = {
      stats: stats,
      game: game, map: map, mapId: mapId, mode: mode, nav: nav,
      people: people, time: 0, over: false, winner: null,
      score: { a: 0, b: 0 }, round: 1, roundTime: 0,
      bomb: null, events: [],
      headless: headless,
      you: people[0],
    };

    /* A team band: a cuff round each upper arm in the side's colour,
       bright enough to read across a street and small enough not to
       repaint the man wearing it. Parented to the arm bones, so it
       moves with him and needs no rig of its own. */
    function teamBand(g, actor, colour) {
      if (!actor || !actor.skeleton || !g.cylinder) return;
      var mat = { color: colour, texture: 'fabric', roughness: 0.86,
        metalness: 0, emissive: colour, emissiveStrength: 0.30 };
      ['upperArmL', 'upperArmR'].forEach(function (bone) {
        var bi = actor.skeleton.index(bone);
        if (bi < 0) return;
        /* Built with its parent and bone in the OPTIONS, not assigned
           afterwards. Setting them on the finished actor left the
           engine's own bookkeeping out of it, and `rotation` on a child
           is not a Quat you can call setFromAxisAngle on -- which threw
           during world build and took the whole match down with it.
           The boot plate said so plainly and I had not looked. */
        var band = g.cylinder({ at: [0, -60, 0], radius: 0.062, height: 0.052,
          physics: false, material: mat, name: 'teamband',
          parent: actor, parentBone: bi, offset: [0, -0.120, 0] });
        if (!band) return;
      });
    }

    /* ---- bodies ----

       Everybody in the match is an operator, not just you. Twelve
       identical figures in two colours is what the lobby has been so
       far, and the seven are the answer to that: bots are dealt round
       the roster so a six-a-side has six different silhouettes on it,
       and a silhouette is genuinely worth something in a firefight --
       telling Destroyer from SWAT across a street is telling a
       breacher from an entry man, at a glance, before either of them
       has shot at you. */
    var OPS = game.operators ? game.operators().map(function (o) { return o.id; }) : [];
    people.forEach(function (p) {
      if (headless) return;
      var c = p.team === 'a' ? 0x4c6a8a : 0x8a5a4c;
      if (!p.operator) p.operator = OPS.length ? OPS[(p.id * 3 + 1) % OPS.length] : null;
      if (p.operator && game.operator) {
        /* NO TEAM TINT ON THE MAN HIMSELF.
         *
           This passed a flat team colour as the body material, which
           overrides the operator's own fatigues -- so Destroyer's
           coyote, Biohazard's hazmat yellow and SWAT's navy all became
           one of two colours, and one of those two (0x8a5a4c) is very
           close to skin. Twelve naked men, which is what they looked
           like, and it also threw away the single most useful thing
           about having seven distinguishable operators.

           The side is shown on the KIT instead -- see teamBand below.
           You can tell a friendly by the band on his arm, which is how
           it is done in life and for the same reason. */
        p.actor = game.operator(p.operator, {
          at: [0, -50, 0], name: 'mp-' + p.id, face: 'static',
          speed: 4.6, runSpeed: 6.4,
        });
        if (p.actor) teamBand(game, p.actor, c);
      } else {
        p.actor = game.character({
          at: [0, -50, 0], name: 'mp-' + p.id,
          material: { preset: 'fabric', color: c },
          height: 1.75, radius: 0.32, speed: 4.6, runSpeed: 6.4,
        });
      }
      if (p.actor && p.actor.body) p.actor.body.userData = { actor: true, mp: p.id };
    });

    recInit(M);
    hlInit(M);

    /* ---- the first spawn ---- */
    people.forEach(function (p) { spawn(M, p, true); });
    if (mode.bomb) armRound(M);

    M.update = function (dt) { update(M, dt, rand, emit); };
    M.scoreboard = function () { return scoreboard(M); };
    M.spawnOf = function (p) { return pickSpawn(M, p); };
    M.damage = function (from, to, amount, head) { return hurt(M, from, to, amount, head, emit); };
    M.fire = function (p) { return fire(M, p, rand, emit); };
    M.control = function (cmd, dt) { control(M, cmd, dt); };
    M._emit = emit;
    M.nav = nav;
    M.recAt = function (t, out) { return recAt(M, t, out); };
    M.recSpan = function () { return recSpan(M); };
    M.bestPlay = function () { return bestPlay(M); };
    M.tapeAt = function (tape, t, out) { return tapeAt(tape, t, out); };
    M.clip = function (t0, t1) { return clipOut(M.rec, t0, t1); };
    M.pose = function (list, dt) { pose(M, list, dt); };
    M.unpose = function () { unpose(M); };
    return M;
  }

  /* A bot's class. Weighted rather than uniform, because players are:
     most of a lobby is carrying a rifle or an SMG, one person has a
     sniper, and somebody always has the shotgun. */
  function botLoadout(rand) {
    var r = rand();
    var cls = r < 0.42 ? 'assault' : r < 0.72 ? 'smg' : r < 0.84 ? 'lmg'
      : r < 0.95 ? 'special' : 'pistol';
    var list = MP_DATA.gunsOf(cls).filter(function (g) { return !g.shield; });
    var g = list[Math.floor(rand() * list.length) % list.length];
    var pistols = MP_DATA.gunsOf('pistol');
    var s = pistols[Math.floor(rand() * pistols.length) % pistols.length];
    var L = MP_DATA.defaultLoadout();
    L.primary = g.id; L.primaryAtt = [];
    L.secondary = s.id; L.secondaryAtt = [];
    return L;
  }

  /* ================================================================
     SPAWNING
     ================================================================
     Pick the point on your side that is furthest from the nearest
     living enemy. Not the furthest from the enemy SPAWN -- from the
     enemy, now, wherever they actually are. Spawning into the back of
     somebody is the single worst thing a shooter does to a player, and
     it is entirely avoidable with one loop. */

  function pickSpawn(M, p) {
    var list = M.map.spawns[p.team] || M.map.spawns.a;
    var foes = M.people.filter(function (q) { return q.team !== p.team && q.alive; });
    var best = list[0], bd = -1;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var near = 1e9;
      for (var j = 0; j < foes.length; j++) {
        var d = Math.hypot(foes[j].pos.x - s.at[0], foes[j].pos.z - s.at[2]);
        if (d < near) near = d;
      }
      /* A tiny random nudge so twelve bodies do not all queue for the
         same best point when the map is empty. */
      near += (i % 3) * 0.5;
      if (near > bd) { bd = near; best = s; }
    }
    return best;
  }

  function spawn(M, p, first) {
    var s = pickSpawn(M, p);
    p.pos = { x: s.at[0], y: s.at[1], z: s.at[2] };
    p.yaw = s.yaw; p.pitch = 0;
    p.hp = HEALTH; p.alive = true; p.streak = 0;
    p.held = 0;
    p.ammo = [p.guns[0].mag, p.guns[1].mag];
    p.reserve = [p.guns[0].mag * 10, p.guns[1].mag * 10];
    p.reloadUntil = 0; p.nextShot = 0;
    p.lastGood = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    p.sliding = false; p.slideEnd = 0; p.slideRecover = 0;
    p.vy = 0; p.kickUp = 0; p.kickSide = 0; p.kickHold = 0;
    p.ai.state = 'advance'; p.ai.target = null; p.ai.path = null;
    p.ai.goal = null; p.ai.goalAt = -99;
    if (p.actor && p.actor.controller) {
      p.actor.controller.teleport([p.pos.x, p.pos.y + lift(p), p.pos.z]);
      // Facing too, or a man spawns looking the way the LAST one did.
      face(p.actor, p.yaw);
    }
    if (!first) M.events.push({ t: M.time, kind: 'spawn', who: p.id });
  }

  /* ================================================================
     SHOOTING
     ================================================================
     A ray from the eye, with a cone on it, against everybody alive on
     the other side. The cone is the gun's aimed or hip spread widened
     by how badly the shooter is aiming -- which for a bot is its skill
     and for you is whether you were moving.

     Bodies are checked as capsules rather than by raycasting the world
     for an actor, because the world raycast returns the first thing it
     meets and a bot standing behind a crate at the same screen
     position as an enemy would eat the bullet. Here the world is
     tested for cover separately, which is the question that was
     actually being asked. */

  function eyeOf(p) { return { x: p.pos.x, y: p.pos.y + EYE, z: p.pos.z }; }

  function losClear(M, from, to) {
    if (M.stats) M.stats.losCalls++;
    var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    var len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    var h = M.game.raycast([from.x, from.y, from.z], [dx / len, dy / len, dz / len], len - 0.25,
      function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
    return !h;
  }

  /* WHERE A BODY IS, AS FAR AS A BULLET IS CONCERNED.
   *
     A vertical capsule from the shins to the shoulders with a sphere on
     top of it, tested as a ray against a segment. And the aim point --
     AIM_Y -- is on that segment, which it was not.

     That mismatch is the whole of why the first simulated match fired
     two thousand seven hundred shots and landed thirty-three. The bots
     aimed at chest height, 1.45 above the feet, and the hit test
     measured the perpendicular distance to a point at 0.90. A shot
     placed perfectly at the aim point was therefore fifty-five
     centimetres off a body whose tolerance was forty, so a bot could
     only hit by MISSING its own aim, and the better it aimed the worse
     it shot. Everybody stood in the open emptying magazines at each
     other for ten minutes and nobody fell over.

     One constant, used by the aim and by the test. */
  var BODY_LO = 0.35, BODY_HI = 1.48, BODY_R = 0.36;
  var HEAD_Y = 1.66, HEAD_R = 0.15;
  var AIM_Y = 1.25;

  function rayBody(from, dir, p) {
    /* Closest approach between the shot and the body's own axis. */
    var px = p.pos.x, pz = p.pos.z;
    var ax = px - from.x, az = pz - from.z;
    var lo = p.pos.y + BODY_LO - from.y, hi = p.pos.y + BODY_HI - from.y;
    /* The axis is vertical, so the geometry collapses: the horizontal
       part is a ray-versus-line problem and the vertical part is just
       an interval to be inside. */
    var dh = Math.hypot(dir.x, dir.z);
    if (dh < 1e-6) return null;
    var along = (ax * dir.x + az * dir.z) / (dh * dh);
    if (along <= 0.3) return null;
    var offx = ax - dir.x * along, offz = az - dir.z * along;
    var offH = Math.hypot(offx, offz);
    if (offH > BODY_R + HEAD_R) return null;
    var y = dir.y * along;
    var head = Math.abs(y - (p.pos.y + HEAD_Y - from.y)) < HEAD_R + 0.04 && offH < HEAD_R + 0.10;
    if (!head && (y < lo - BODY_R || y > hi + BODY_R)) return null;
    if (!head && offH > BODY_R) return null;
    return { d: Math.hypot(ax, az, y) , head: head };
  }

  /* WHERE THE ROUND ACTUALLY LEAVES FROM.
   *
     Out of the muzzle, not out of the eye. A gun is held below and to
     the side of your head with about sixty centimetres of barrel in
     front of it, so a shot fired from the eye is a shot fired from a
     place the gun is not -- which sounds like a detail until you lean
     round a corner, see a man, and kill him through the wall your
     barrel is still behind. That is the bug this removes, and the fact
     that the barrel being covered now blocks the shot is the point of
     it rather than a side effect. */
  var MUZZLE_FWD = 0.62, MUZZLE_DOWN = 0.14, MUZZLE_SIDE = 0.10;

  function muzzleOf(p) {
    var e = eyeOf(p);
    var cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    var f = { x: sy * cp, y: -sp, z: cy * cp };
    /* Aiming brings the gun onto the centre line, which is the whole
       point of aiming, so the offset goes away as the sights come up. */
    var side = p.aiming ? 0 : MUZZLE_SIDE, down = p.aiming ? 0.02 : MUZZLE_DOWN;
    return {
      x: e.x + f.x * MUZZLE_FWD - cy * side,
      y: e.y + f.y * MUZZLE_FWD - down,
      z: e.z + f.z * MUZZLE_FWD + sy * side,
    };
  }

  function fire(M, p, rand, emit) {
    var w = gun(p);
    if (!p.alive || M.time < p.nextShot || M.time < p.reloadUntil) return null;
    if (p.ammo[p.held] <= 0) { beginReload(M, p); return null; }
    p.ammo[p.held]--;
    p.nextShot = M.time + 60 / w.rpm;
    // Stamped so the recorder can flag this tick as a shot -- a replay
    // with no muzzle flashes is a replay of people jogging.
    p.lastShotAt = M.time;
    if (M.stats) M.stats.shots++;
    kickFrom(M, p, w, rand);

    /* If the muzzle itself is inside something, the round goes into
       that and no further. */
    var eye = eyeOf(p);
    var from = muzzleOf(p);
    if (!losClear(M, eye, from)) from = eye;
    /* Aimed or from the hip. A bot is aiming whenever it is engaging;
       you are aiming when you are holding the button. */
    var cone = ((p.aiming || p.ai.state === 'engage') ? w.adsSpread : w.spread) * Math.PI / 180;
    if (p.bot && p.skill) cone *= (1.9 - p.skill.aim);
    var out = [];
    for (var s = 0; s < (w.pellets || 1); s++) {
      var yaw = p.yaw + (rand() - 0.5) * cone;
      var pitch = p.pitch + (rand() - 0.5) * cone;
      var dir = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      var best = null;
      for (var i = 0; i < M.people.length; i++) {
        var q = M.people[i];
        if (q === p || !q.alive || q.team === p.team) continue;
        var r = rayBody(from, dir, q);
        if (!r || r.d > w.far * 2.2) continue;
        if (best && r.d >= best.r.d) continue;
        if (!losClear(M, from, { x: q.pos.x, y: q.pos.y + 1.0, z: q.pos.z })) continue;
        best = { q: q, r: r };
      }
      if (best) {
        if (M.stats) M.stats.hits++;
        var amount = damageAt(w, best.r.d) * (best.r.head ? w.hs : 1);
        out.push(hurt(M, p, best.q, amount, best.r.head, emit));
      }
    }
    if (p.ammo[p.held] <= 0) beginReload(M, p);
    return out;
  }

  /* RECOIL THAT MOVES THE MAN, NOT THE GUN.
   *
     Every shot puts a real impulse into the view: the pitch climbs and
     the yaw wanders, per gun, off the same recoil figures the loadout
     screen shows. It decays back most of the way but not all of it, so
     holding the trigger walks your aim up the wall and you have to pull
     it down -- which is what recoil IS, and what a muzzle that rises
     while the camera stays level completely fails to be.

     `recoil` is where it has climbed to and `settle` is where it will
     fall back to, so the recovery returns the shot-to-shot jump and
     keeps the drift. A bot fights it the same way a player does. */
  function kickFrom(M, p, w, rand) {
    var up = w.rec[0] * Math.PI / 180, side = w.rec[1] * Math.PI / 180;
    var aim = p.aiming ? 0.72 : 1;          // braced against the shoulder
    var crouch = p.crouching ? 0.85 : 1;
    p.kickUp = (p.kickUp || 0) + up * aim * crouch;
    p.kickSide = (p.kickSide || 0) + (rand() - 0.5) * 2 * side * aim * crouch;
    /* A quarter of each shot's climb stays until you put it back. */
    p.kickHold = (p.kickHold || 0) + up * aim * crouch * 0.26;
    p.kickAt = M.time;
  }

  function settleKick(M, p, dt) {
    if (!p.kickUp && !p.kickSide) return;
    var k = Math.pow(0.0009, dt);           // most of it back in a fifth of a second
    p.kickUp = (p.kickUp - p.kickHold) * k + p.kickHold;
    p.kickSide *= k;
    /* And the part that stayed drains away slowly once you stop. */
    if (M.time - (p.kickAt || 0) > 0.22) p.kickHold *= Math.pow(0.30, dt);
    if (Math.abs(p.kickUp) < 1e-5) { p.kickUp = 0; p.kickHold = 0; }
    if (Math.abs(p.kickSide) < 1e-5) p.kickSide = 0;
  }

  function beginReload(M, p) {
    var w = gun(p);
    if (p.reserve[p.held] <= 0) {
      /* Out. Swap to the other gun rather than standing there, which is
         what a player does and what makes a secondary worth having. */
      var other = 1 - p.held;
      if (p.ammo[other] > 0 || p.reserve[other] > 0) { p.held = other; p.nextShot = M.time + 0.45; }
      return;
    }
    p.reloadUntil = M.time + w.reload;
  }

  function finishReload(M, p) {
    var w = gun(p);
    var want = w.mag - p.ammo[p.held];
    var got = Math.min(want, p.reserve[p.held]);
    p.ammo[p.held] += got;
    p.reserve[p.held] -= got;
  }

  function hurt(M, from, to, amount, head, emit) {
    if (!to.alive) return 0;
    var dealt = Math.min(to.hp, amount);
    to.hp -= amount;
    /* When you were last hit, which is what the regeneration delay is
       counted from. It was never written down, so health came back
       during the fight rather than after it. */
    to.hurtAt = M.time;
    if (from) from.damage += dealt;
    if (to.hp > 0) {
      /* Being shot at from somewhere is how a bot learns you exist,
         even when it was looking the other way. */
      if (to.bot && from) { to.ai.target = from; to.ai.sawAt = M.time; to.ai.state = 'engage'; }
      return dealt;
    }
    to.alive = false;
    to.deaths++;
    to.streak = 0;
    to.respawnAt = M.time + RESPAWN;
    if (from) {
      from.kills++;
      from.streak++;
      if (from.streak > from.bestStreak) from.bestStreak = from.streak;
      if (M.mode.id === 'tdm') M.score[from.team]++;
    }
    if (to.actor && to.actor.controller) to.actor.controller.teleport([to.pos.x, -60, to.pos.z]);
    var ev = { t: M.time, kind: 'kill', by: from ? from.id : null, who: to.id, head: !!head,
      weapon: from ? gun(from).id : null,
      /* Everything Best Play needs to weigh this later, taken NOW --
         the range and the score are gone a second after the fact and
         cannot be recovered from a scoreboard. */
      at: [to.pos.x, to.pos.y, to.pos.z],
      range: from ? Math.hypot(from.pos.x - to.pos.x, from.pos.z - to.pos.z) : 0,
      score: [M.score.a, M.score.b] };
    M.events.push(ev);
    emit(ev);
    return dealt;
  }

  /* ================================================================
     THE RECORDER
     ================================================================
     A kill cam and a Best Play are the same machine twice: both need to
     know where everybody WAS, not where they are, and neither can be
     reconstructed after the fact from a scoreboard.

     So the match keeps a rolling tape. Twenty samples a second -- not
     sixty, because a replay is watched at a distance and the difference
     between 20 Hz and 60 Hz of a running man is invisible while the
     memory is three times the size. Each sample is a flat array rather
     than an object per player: twelve objects a tick, twenty ticks a
     second, for a ten-minute match is fourteen million allocations and
     a garbage collector pause every few seconds, which would show up as
     exactly the stutter this game has been accused of.

     REC_SECONDS is what the kill cam needs. Best Play keeps its own
     sparser highlight list instead of a ten-minute tape, because the
     interesting parts of a match are seconds long and minutes apart. */
  var REC_HZ = 20;
  var REC_SECONDS = 8;
  var REC_STRIDE = 6;              // x, y, z, yaw, pitch, flags per person

  function recInit(M) {
    var n = M.people.length;
    M.rec = {
      hz: REC_HZ, stride: REC_STRIDE, people: n,
      frames: Math.ceil(REC_HZ * REC_SECONDS),
      data: new Float32Array(Math.ceil(REC_HZ * REC_SECONDS) * n * REC_STRIDE),
      time: new Float32Array(Math.ceil(REC_HZ * REC_SECONDS)),
      head: 0, filled: 0, acc: 0,
    };
  }

  function recSample(M, dt) {
    var R = M.rec;
    if (!R) return;
    R.acc += dt;
    if (R.acc < 1 / R.hz) return;
    R.acc = 0;
    var base = R.head * R.people * R.stride;
    for (var i = 0; i < R.people; i++) {
      var p = M.people[i], o = base + i * R.stride;
      R.data[o] = p.pos.x; R.data[o + 1] = p.pos.y; R.data[o + 2] = p.pos.z;
      R.data[o + 3] = p.yaw; R.data[o + 4] = p.pitch;
      /* One float of state, packed: alive, firing, sprinting, crouching.
         A replay that shows everybody standing upright and still is a
         replay of a diagram. */
      R.data[o + 5] = (p.alive ? 1 : 0) + (M.time - (p.lastShotAt || -9) < 0.12 ? 2 : 0)
        + (p.sprinting ? 4 : 0) + (p.crouching ? 8 : 0);
    }
    R.time[R.head] = M.time;
    R.head = (R.head + 1) % R.frames;
    if (R.filled < R.frames) R.filled++;
  }

  /* Read the tape at a time, interpolating between the two samples
     either side of it -- twenty a second is smooth enough to watch only
     if it is not also played back at twenty. */
  function recAt(M, t, out) { return tapeAt(M.rec, t, out); }

  function tapeAt(R, t, out) {
    if (!R || !R.filled) return null;
    var oldest = (R.head - R.filled + R.frames) % R.frames;
    var a = -1, b = -1, f = 0;
    for (var k = 0; k < R.filled - 1; k++) {
      var i0 = (oldest + k) % R.frames, i1 = (oldest + k + 1) % R.frames;
      if (R.time[i0] <= t && R.time[i1] >= t) {
        a = i0; b = i1;
        var span = R.time[i1] - R.time[i0];
        f = span > 1e-6 ? (t - R.time[i0]) / span : 0;
        break;
      }
    }
    if (a < 0) {
      /* Off either end of the tape: hold the nearest frame rather than
         returning nothing, so a playback that overshoots by a frame
         freezes for a frame instead of snapping back to live state. */
      a = b = R.time[oldest] > t ? oldest : (R.head - 1 + R.frames) % R.frames;
      f = 0;
    }
    out = out || [];
    for (var i = 0; i < R.people; i++) {
      var oa = a * R.people * R.stride + i * R.stride;
      var ob = b * R.people * R.stride + i * R.stride;
      var e = out[i] || (out[i] = {});
      e.x = R.data[oa] + (R.data[ob] - R.data[oa]) * f;
      e.y = R.data[oa + 1] + (R.data[ob + 1] - R.data[oa + 1]) * f;
      e.z = R.data[oa + 2] + (R.data[ob + 2] - R.data[oa + 2]) * f;
      /* Yaw wraps, and lerping across the wrap spins a man round twice
         in a tenth of a second. Take the short way. */
      var dy = R.data[ob + 3] - R.data[oa + 3];
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      e.yaw = R.data[oa + 3] + dy * f;
      e.pitch = R.data[oa + 4] + (R.data[ob + 4] - R.data[oa + 4]) * f;
      /* Flags are not interpolated -- half a muzzle flash is not a
         thing. Take the frame we are nearest to. */
      var fl = R.data[(f < 0.5 ? oa : ob) + 5];
      e.alive = !!(fl & 1); e.firing = !!(fl & 2);
      e.sprinting = !!(fl & 4); e.crouching = !!(fl & 8);
    }
    out.length = R.people;
    return out;
  }

  /* How far back the tape goes, so a caller can ask for a window it
     actually has rather than one it would like. */
  function recSpan(M) {
    var R = M.rec;
    if (!R || R.filled < 2) return null;
    var oldest = (R.head - R.filled + R.frames) % R.frames;
    var newest = (R.head - 1 + R.frames) % R.frames;
    return { from: R.time[oldest], to: R.time[newest] };
  }

  /* Cut a standalone tape out of the rolling one. A clip is the same
     shape as the ring buffer with its head parked at zero and the
     buffer exactly full, so tapeAt reads it without knowing which it
     has been handed. */
  function clipOut(R, t0, t1) {
    if (!R || R.filled < 2) return null;
    var oldest = (R.head - R.filled + R.frames) % R.frames;
    var from = -1, to = -1;
    for (var k = 0; k < R.filled; k++) {
      var i = (oldest + k) % R.frames;
      if (R.time[i] >= t0 && from < 0) from = k > 0 ? k - 1 : k;   // one frame of lead-in
      if (R.time[i] <= t1) to = k;
    }
    if (from < 0) from = 0;
    if (to < from) to = Math.min(R.filled - 1, from + 1);
    if (to < R.filled - 1) to++;                                    // and one of lead-out
    var n = to - from + 1;
    if (n < 2) return null;
    var w = R.people * R.stride;
    var clip = {
      hz: R.hz, stride: R.stride, people: R.people,
      frames: n, head: 0, filled: n,
      data: new Float32Array(n * w), time: new Float32Array(n),
    };
    for (var f2 = 0; f2 < n; f2++) {
      var src = ((oldest + from + f2) % R.frames) * w;
      clip.data.set(R.data.subarray(src, src + w), f2 * w);
      clip.time[f2] = R.time[(oldest + from + f2) % R.frames];
    }
    return clip;
  }

  /* ================================================================
     BEST PLAY
     ================================================================
     "Replay the best moment of the match." Which means deciding what
     best IS, and that decision is the whole feature -- a highlight reel
     that picks the wrong five seconds is worse than none, because it
     tells the player the game was not watching.

     What it weighs, in the order the weights say:

       a multi-kill      most. Two men inside four seconds is the thing
                         anybody would clip, and three is the match.
       a long shot       a kill at sixty metres is a different act from
                         one at six, and the range is recorded per kill
                         because it cannot be recovered afterwards.
       a headshot        a choice rather than an accident, mostly.
       being behind      the same double kill means more when your side
                         was losing, which is why the score at the
                         moment of the kill is on the event.
       surviving it      a trade where you died a second later is not a
                         best play, it is a mutual accident.

     Ties go to the LATER moment, because a match builds.

     The rolling tape is eight seconds long and a match is ten minutes,
     so a best play found at the end cannot be replayed from it. Runs
     are therefore scored as they close and the good ones are CUT OUT
     of the tape at the time, keeping the best four. Four clips of four
     seconds is about ninety kilobytes; a ten-minute tape of everybody
     would be eleven megabytes and would be thrown away unwatched. */
  var HL_WINDOW = 4.0;      // kills this close together are one play
  var HL_LEAD = 2.2;        // seconds of run-up shown before the first
  var HL_TAIL = 1.4;        // and of aftermath after the last
  var HL_KEEP = 4;

  function hlInit(M) {
    M.highlights = [];
    M._hlPend = [];
    M._hlSeen = 0;
  }

  /* Score one run of kills. Returns null for a run that should not be
     considered at all (a suicide, a killer who has left). */
  function hlScore(M, run) {
    var k = run[0], who = M.people[k.by];
    if (!who) return null;
    var n = run.length;
    var score = n * n * 100;                            // a double is 4x a single
    var far = 0, heads = 0;
    for (var r = 0; r < run.length; r++) {
      far = Math.max(far, run[r].range || 0);
      if (run[r].head) heads++;
    }
    score += Math.min(60, far) * 1.6;
    score += heads * 45;
    /* Behind at the time. The kill carries the score as it stood, so
       this is what the board said then and not what it says now. */
    var mine = k.score ? k.score[who.team === 'a' ? 0 : 1] : 0;
    var theirs = k.score ? k.score[who.team === 'a' ? 1 : 0] : 0;
    if (theirs > mine) score += Math.min(40, (theirs - mine) * 8);
    // Died right after: a trade, not a play.
    var last = run[run.length - 1];
    var diedAfter = M.events.some(function (e) {
      return e.kind === 'kill' && e.who === k.by && e.t > k.t && e.t < last.t + HL_TAIL + 1.5;
    });
    if (diedAfter) score *= 0.55;
    return {
      score: score, by: k.by, name: who.name, team: who.team,
      kills: n, heads: heads, range: far,
      from: k.t - HL_LEAD, to: last.t + HL_TAIL, at: k.at, t: k.t,
    };
  }

  /* Called every tick. Groups new kills into runs, then cuts out the
     ones worth keeping once their window has closed. */
  function hlTick(M) {
    var P = M._hlPend;
    for (; M._hlSeen < M.events.length; M._hlSeen++) {
      var e = M.events[M._hlSeen];
      if (e.kind !== 'kill' || e.by == null || e.by === e.who) continue;
      var open = null;
      for (var i = 0; i < P.length; i++) {
        if (P[i].by === e.by && e.t - P[i].run[0].t <= HL_WINDOW) { open = P[i]; break; }
      }
      if (open) open.run.push(e);
      else P.push({ by: e.by, run: [e] });
    }
    for (var j = P.length - 1; j >= 0; j--) {
      var p = P[j], last = p.run[p.run.length - 1];
      /* Closed once no further kill can join the run AND the tail we
         mean to show has actually been recorded. */
      if (M.time < Math.max(p.run[0].t + HL_WINDOW, last.t + HL_TAIL) + 0.25) continue;
      P.splice(j, 1);
      var h = hlScore(M, p.run);
      if (!h) continue;
      var worst = M.highlights.length >= HL_KEEP
        ? M.highlights.reduce(function (a, b) { return b.score < a.score ? b : a; })
        : null;
      if (worst && h.score <= worst.score) continue;
      var span = recSpan(M);
      if (span) h.from = Math.max(h.from, span.from);
      h.clip = clipOut(M.rec, h.from, h.to);
      if (!h.clip) continue;
      if (worst) M.highlights.splice(M.highlights.indexOf(worst), 1);
      M.highlights.push(h);
    }
  }

  /* End of match: close anything still open, then hand back the best
     one. Ties go to the later moment. */
  function bestPlay(M) {
    if (M._hlPend && M._hlPend.length) {
      var save = M.time;
      M.time = 1e9;                 // force every pending run closed
      hlTick(M);
      M.time = save;
    }
    var best = null;
    for (var i = 0; i < M.highlights.length; i++) {
      var h = M.highlights[i];
      if (!best || h.score > best.score || (h.score === best.score && h.t > best.t)) best = h;
    }
    return best;
  }

  /* ================================================================
     MOVING
     ================================================================
     Bodies are moved kinematically against the navigation grid rather
     than by pushing a physics capsule about.

     Two reasons, and the second is the important one. A capsule driven
     by forces gets wedged on a step, and a bot wedged on a step stands
     there for the rest of the round doing nothing while eleven people
     play a different game. And a headless run has no physics tick, so
     a match simulated for a test would move nobody -- which would make
     the test that proves the map is playable the one thing that never
     actually walks it.

     So: steer, try the whole step, and if the cell ahead is solid try
     the two axes separately, which is what makes a body slide along a
     wall instead of sticking to it. The visible actor is then placed
     where the simulation says it is. */

  function cellBlocked(nav, x, z) {
    var i = Math.floor((x - nav.box.x0) / nav.c), j = Math.floor((z - nav.box.z0) / nav.c);
    return navBlocked(nav, i, j);
  }

  var notActor = function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); };

  /* THE FLOOR UNDER A POINT, and it tries three times.
   *
     A ray that starts INSIDE a solid does not report that solid, so a
     body whose feet are in the side wall of Resort's drained pool cast
     down from within it, found nothing at all, and fell. Casting again
     from well above clears whatever it was standing in and finds the
     real floor. Three heights, because one of them being wrong is how
     a man ends up at minus five metres. */
  function groundAt(M, x, z, from) {
    var y0 = from == null ? 8 : from;
    for (var i = 0; i < 3; i++) {
      var start = i === 0 ? y0 : (i === 1 ? y0 + 3.0 : y0 + 14.0);
      var h = M.game.raycast([x, start, z], [0, -1, 0], 60, notActor);
      /* A floor above the feet is not the floor you are on -- that is
         a ceiling, and taking it is how a body teleports upstairs. */
      if (h && h.point.y <= y0 + 0.02) return h.point.y;
    }
    return null;
  }

  var GRAVITY = 19.6, JUMP = 6.0, STEP_UP = 0.62;

  function moveBy(M, p, vx, vz, dt, jump) {
    var nx = p.pos.x + vx * dt, nz = p.pos.z + vz * dt;
    if (!cellBlocked(M.nav, nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
    else {
      if (!cellBlocked(M.nav, nx, p.pos.z)) p.pos.x = nx;
      if (!cellBlocked(M.nav, p.pos.x, nz)) p.pos.z = nz;
    }
    /* Vertical properly, rather than snapping to whatever is underneath.
     *
       Snapping meant a body could step up a wall as easily as a kerb and
       could not fall off anything at all. Now there is a step height --
       stairs are a 0.26 rise, so 0.62 takes a step and refuses a wall --
       and everything else is gravity. Which also gives the player a jump
       without a second movement path to keep in step with this one. */
    /* THE GROUND RAY STARTS AT THE FEET, plus a step.
     *
       It started 2.4 metres above them, and the test for standing was
       "the floor is no more than a step BELOW me" -- which is satisfied
       by a floor any distance ABOVE me. So anything the ray found on
       the way down, up to two and a half metres up, counted as ground
       and the body was snapped on top of it. A man could walk into the
       side of a spawn screen and be standing on it, walk off the far
       side, and end up somewhere with nothing underneath at all.

       Starting the ray a step above the feet means the only floors it
       can find are ones you could actually step onto. */
    var g = groundAt(M, p.pos.x, p.pos.z, p.pos.y + STEP_UP + 0.05);
    p.vy = p.vy || 0;
    var onFloor = g != null && p.pos.y - g <= STEP_UP && p.vy <= 0.001;
    if (onFloor) {
      p.pos.y = g; p.vy = 0; p.grounded = true;
      p.lastGood = { x: p.pos.x, y: g, z: p.pos.z };
      if (jump) { p.vy = JUMP; p.grounded = false; }
    } else {
      p.grounded = false;
      p.vy -= GRAVITY * dt;
      p.pos.y += p.vy * dt;
      if (g != null && p.pos.y <= g) {
        p.pos.y = g; p.vy = 0; p.grounded = true;
        p.lastGood = { x: p.pos.x, y: g, z: p.pos.z };
      } else if (g == null && p.lastGood && p.pos.y < p.lastGood.y - 0.5) {
        /* NOTHING UNDERNEATH, and half a metre gone.
         *
           Not a fall -- a fall finds a floor the whole way down and is
           handled above. This is the case where three separate casts
           found nothing at all, which on Resort means a body has walked
           sideways out of the drained pool THROUGH its wall into the
           void under the terrace. It can do that because the navigation
           grid is swept at chest height and a pit two and a half metres
           down is invisible to it.

           Half a metre is the threshold because half a metre of
           unexplained fall is already enough to know something is
           wrong, and putting a body back where it last stood is better
           than letting it drop out of the match. Unlike killing it,
           this leaves no hole in the scoreboard for a bug of ours. */
        p.pos.x = p.lastGood.x; p.pos.y = p.lastGood.y; p.pos.z = p.lastGood.z;
        p.vy = 0; p.grounded = true;
      }
    }
    /* A replay owns every body on the screen while it runs. The match
       keeps simulating underneath it -- respawn timers, the round
       clock, the bots -- but if it also kept placing the actors the
       kill cam would show twelve men standing where they are NOW while
       the camera flew to where one of them WAS. */
    if (p.actor && p.actor.controller && !M.replaying) {
      p.actor.controller.teleport([p.pos.x, p.pos.y + lift(p), p.pos.z]);
      face(p.actor, p.yaw);
    }
  }

  /* Every body in this match is TELEPORTED into place each frame -- the
     match owns movement and the engine's controller is only a thing to
     hang a mesh and a skeleton on. Teleport zeroes the controller's
     velocity, so the controller's own animation state machine saw
     twelve men standing perfectly still while they sprinted across
     Town, and played 'idle' at all of them for the entire match. The
     bodies slid around the map in the T-adjacent bind pose and nobody
     noticed because nobody had looked at a bot from the outside.

     So the state is chosen HERE, from what the match knows, and the
     speed is measured from the position actually travelled rather than
     from any velocity field -- the match has three or four paths that
     move a body and only some of them bother to record why. */
  /* WHICH WAY A BODY IS POINTING.
     ================================================================
     Setting actor.rotation does NOTHING to a character. The engine
     composes a controller-driven actor's transform from
     controller.facing, because a capsule has its rotation locked so it
     cannot topple and therefore carries no facing information at all
     (see Actor.updateMatrix). So the two lines here that carefully set
     a quaternion every tick were writing to a field nothing reads.

     And controller.facing is only ever advanced by the controller's
     OWN steering, which a teleported body never runs. Which means
     every man in this match has been pointing due north since the
     first frame, whatever direction he was running or shooting in --
     twelve people strafing sideways and firing over their shoulders,
     for the whole of every match. */
  function face(actor, yaw) {
    if (!actor) return;
    if (actor.controller) actor.controller.facing = yaw;
    else if (actor.rotation && actor.rotation.setFromAxisAngle) {
      actor.rotation.setFromAxisAngle([0, 1, 0], yaw);
    }
  }

  /* WHERE THE BODY GOES. The capsule's origin is its CENTRE, so a body
     standing on the floor sits half its own height above it -- and this
     was a flat 0.9 for everybody, on operators who run from 1.72m to
     1.92m. The tall ones stood six centimetres into the concrete and
     the short ones floated four above it, which is most of why the men
     in this game do not look like they are standing on anything. */
  function lift(p) {
    var c = p.actor && p.actor.controller;
    return c && c.height ? c.height * 0.5 : 0.9;
  }

  function animate(p, dt) {
    var a = p.actor.animator;
    if (!a) return;
    p.actor.controller.autoAnimate = false;

    var last = p._animPos;
    var sp = 0;
    if (last && dt > 1e-4) {
      sp = Math.hypot(p.pos.x - last.x, p.pos.z - last.z) / dt;
      // A respawn is a jump across the map, not a hundred-metre-per-
      // second dash. Anything past a plausible sprint is teleportation.
      if (sp > 14) sp = 0;
    }
    p._animPos = { x: p.pos.x, z: p.pos.z };
    // Smoothed, because a per-frame position delta on a grid-collided
    // body is spiky enough to flicker between two states on a wall.
    p._animSpeed = p._animSpeed == null ? sp
      : p._animSpeed + (sp - p._animSpeed) * Math.min(1, dt * 12);
    var v = p._animSpeed;

    var want;
    if (!p.alive) want = 'idle';
    else if (p.sliding) want = 'slide';
    else if (!p.grounded) want = 'jump';
    else if (p.sprinting && v > 4.6) want = 'sprint';
    else if (v > 4.3) want = 'run';
    else if (v > 0.35) want = 'walk';
    else want = 'idle';

    if (want !== p._animState) {
      p._animState = want;
      a.play(want, want === 'jump' || want === 'slide' ? 0.07 : 0.16);
    }
    if (want === 'walk') a.speed = Math.max(0.5, Math.min(1.7, v / 4.6));
    else if (want === 'run') a.speed = Math.max(0.7, Math.min(1.4, v / 6.0));
    else if (want === 'sprint') a.speed = Math.max(0.85, Math.min(1.2, v / 7.0));
    else a.speed = 1;
  }

  /* Pose every body from a tape frame instead of from the simulation.
     This is the whole of what a replay does to the world: the same
     actors, the same animator, driven by what was recorded rather than
     by what is happening. Speed is measured from the tape the same way
     animate measures it from the simulation, because a replay of men
     sliding about in the bind pose is what the live game looked like
     before animate existed and it looked like a bug. */
  function pose(M, list, dt) {
    if (!list) return;
    for (var i = 0; i < M.people.length && i < list.length; i++) {
      var p = M.people[i], e = list[i];
      if (!p.actor || !p.actor.controller) continue;
      if (!e.alive) { p.actor.controller.teleport([e.x, -60, e.z]); continue; }
      p.actor.controller.teleport([e.x, e.y + lift(p), e.z]);
      face(p.actor, e.yaw);
      var a = p.actor.animator;
      if (!a) continue;
      p.actor.controller.autoAnimate = false;
      var last = p._rpPos, sp = 0;
      if (last && dt > 1e-4) {
        sp = Math.hypot(e.x - last.x, e.z - last.z) / dt;
        if (sp > 14) sp = 0;
      }
      p._rpPos = { x: e.x, z: e.z };
      p._rpSpeed = p._rpSpeed == null ? sp : p._rpSpeed + (sp - p._rpSpeed) * Math.min(1, dt * 12);
      var v = p._rpSpeed;
      var want = e.sprinting && v > 4.6 ? 'sprint' : v > 4.3 ? 'run' : v > 0.35 ? 'walk' : 'idle';
      if (want !== p._rpState) { p._rpState = want; a.play(want, 0.16); }
      if (want === 'walk') a.speed = Math.max(0.5, Math.min(1.7, v / 4.6));
      else if (want === 'run') a.speed = Math.max(0.7, Math.min(1.4, v / 6.0));
      else if (want === 'sprint') a.speed = Math.max(0.85, Math.min(1.2, v / 7.0));
      else a.speed = 1;
    }
  }

  /* Handing the world back. The live animator remembers what it last
     played, so without this everybody keeps whatever the replay left
     them doing until their speed happens to cross a threshold. */
  function unpose(M) {
    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i];
      p._rpPos = null; p._rpSpeed = null; p._rpState = null;
      p._animState = null; p._animPos = null; p._animSpeed = null;
    }
  }

  /* Turn towards a heading, at a rate. Snapping to face a target is
     what makes a bot feel like a turret; a rate makes it feel like
     somebody who has just noticed you. */
  /* Returns the error REMAINING after the turn, not the error before
     it. Before-the-turn was what gated firing, and it let a bot shoot
     while still eight degrees off -- four metres wide at thirty. */
  function turnTo(p, wantYaw, rate, dt) {
    var d = wantYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var step = rate * dt;
    var applied = Math.max(-step, Math.min(step, d));
    p.yaw += applied;
    return Math.abs(d - applied);
  }

  function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

  /* ================================================================
     THE BOT
     ================================================================
     Four states. A bot with fourteen states does something
     inexplicable once a match and ruins it. */

  function botThink(M, p, dt, rand, emit) {
    var ai = p.ai, sk = p.skill || MP_DATA.BOT_SKILL[1];
    var w = gun(p);

    /* ---- see ---- */
    if (M.time - ai.sawAt > 0.18) {
      ai.sawAt = M.time;
      if (M.stats) M.stats.scans++;
      var best = null, bd = 1e9;
      for (var i = 0; i < M.people.length; i++) {
        var q = M.people[i];
        if (q.team === p.team || !q.alive) continue;
        var d = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
        /* How far away a bot notices you. Capped, and capped hard.
           Uncapped at far * 1.8 + 12 an assault rifle noticed a man a
           hundred metres off, so on every map everybody could see
           everybody and the whole twelve stood still shooting across it
           -- eighty-four per cent of all ticks were spent engaging and
           the fight never moved. */
        if (d > Math.min(w.far * 1.5 + 8, 56)) continue;
        if (!losClear(M, eyeOf(p), { x: q.pos.x, y: q.pos.y + 1.0, z: q.pos.z })) continue;
        if (d < bd) { bd = d; best = q; }
      }
      if (best) {
        if (M.stats) { M.stats.seen++; if (ai.target !== best) M.stats.acquired++; }
        if (ai.target !== best) ai.reactAt = M.time + sk.react * (0.6 + rand() * 0.8);
        ai.target = best;
        ai.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
        ai.lostAt = M.time;
      } else if (ai.target && M.time - ai.lostAt > 1.6) {
        ai.target = null;
      }
    }

    var t = ai.target;
    /* YOU PLAY A MODE WITH NO RESPAWNS DIFFERENTLY.
     *
       The bots did not. They walked into the middle of Helipad twelve
       at a time and one side was wiped inside twenty seconds, every
       round, for eight rounds -- and the bomb carrier reached the site
       with two and a quarter of the three seconds he needed, and died
       holding it, every single time. Nothing was broken. They were
       simply playing Search and Destroy as though they had another life
       coming, which is the one thing that mode is about not having.

       So when there is no respawn they break off much earlier and they
       do not close the distance. It is the same four states; it is the
       thresholds that change, which is also the honest difference
       between how a person plays the two modes. */
    /* And in the back half of a round the clock becomes the enemy. An
       attacking side still being careful with twenty seconds left is an
       attacking side that has already lost the round; real players
       commit, and so do these. Without it, whether a bomb was ever
       planted on a given map came down to the seed. */
    var attacking = M.mode.bomb && M.bomb && p.team === M.bomb.attackers && !M.bomb.planted;
    /* Twenty-five seconds, or down to the last two men.
     *
       This was fifty-five, and fifty-five never happened: rounds end by
       elimination somewhere between thirty and fifty seconds, so the
       rule that was meant to make attackers commit ran in no round of
       any match. The tick counts across the change were byte for byte
       identical, which is always the same story -- the code was not
       being reached. */
    var alive = (M.aliveCount && M.aliveCount[p.team]) || 6;
    /* Fifteen seconds, not twenty-five: measured, rounds on these maps
       are decided between nineteen and thirty, so twenty-five was most
       of the way to being another rule that never ran. */
    var pressing = attacking && (M.roundTime > 15 || alive <= 2);
    var careful = M.mode.bomb && !pressing;
    var hurtBadly = p.hp < (careful ? 62 : 38);
    var td = t ? Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) : 1e9;
    var inRange = t && td < w.far * 1.25 + 6;
    /* THE MAN WITH THE BOMB DOES NOT STOP TO FIGHT.
     *
       He stopped for everybody he saw, which on Demolition -- small,
       and with sightlines through holes in three floors -- meant he saw
       somebody within ten metres of leaving the spawn and never moved
       again. Six rounds, no plant. A carrier keeps walking unless
       somebody is close enough to be the more urgent problem. */
    var carrying = M.bomb && !M.bomb.planted && M.bomb.carrier === p.id;
    if (carrying && !hurtBadly && td > 13) inRange = false;
    ai.state = (t && inRange && M.time >= (ai.reactAt || 0))
      ? (hurtBadly ? 'break' : 'engage') : 'advance';

    if (M.stats) M.stats[ai.state === 'engage' ? 'engageTicks'
      : ai.state === 'break' ? 'breakTicks' : 'advanceTicks']++;

    if (ai.state === 'engage') {
      var d2 = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
      var off = turnTo(p, yawTo(p.pos, t.pos), 5.0 + sk.aim * 5.0, dt);
      /* Pulled back down against its own recoil, as well as it can --
         which is what its skill actually buys it. */
      var want = Math.atan2((p.pos.y + EYE) - (t.pos.y + AIM_Y), Math.max(0.5, d2));
      p.pitch = want - (p.kickUp || 0) * (1 - sk.aim * 0.85);
      /* Strafe rather than stand. Changed at intervals, not per frame,
         or the body vibrates on the spot. */
      ai.jitter -= dt;
      if (ai.jitter <= 0) { ai.jitter = 0.5 + rand() * 1.1; ai.strafe = rand() < 0.5 ? -1 : 1; }
      var side = RIGHT(p.yaw);
      /* Close the distance in deathmatch; hold it when a death is the
         end of your round. */
      var hold = careful ? 1.35 : 0.9;
      var want = d2 > w.near * hold ? 1 : (d2 < w.near * (hold * 0.45) ? -1 : 0);
      var sp = 4.4 * w.move;
      moveBy(M, p,
        Math.sin(p.yaw) * want * sp * 0.75 + side.x * ai.strafe * sp * 0.6,
        Math.cos(p.yaw) * want * sp * 0.75 + side.z * ai.strafe * sp * 0.6, dt);
      if (off < 0.035 && M.time >= p.nextShot) fire(M, p, rand, emit);
      return;
    }

    if (ai.state === 'break') {
      /* Hurt: back off the way you came and let it regenerate. Bots
         that fight to the death make every trade a coin flip. */
      var away = yawTo(t.pos, p.pos);
      turnTo(p, away, 6.0, dt);
      moveBy(M, p, Math.sin(away) * 5.2, Math.cos(away) * 5.2, dt);
      if (M.time - ai.lostAt > 2.5 || p.hp > (careful ? 85 : 70)) ai.state = 'advance';
      return;
    }

    /* ---- advance ---- */
    if (!ai.goal || M.time - ai.goalAt > 9 || dist2(p.pos, ai.goal) < 3.5) {
      ai.goal = pickGoal(M, p, rand);
      ai.goalAt = M.time;
      ai.path = null;
    }
    var step = steer(M, p, ai.goal);
    if (step) {
      var yaw = yawTo(p.pos, step);
      turnTo(p, yaw, 4.5, dt);
      p.pitch *= 0.85;
      var run = 5.4 * gun(p).move;
      moveBy(M, p, Math.sin(p.yaw) * run, Math.cos(p.yaw) * run, dt);
      /* Walking and shooting: if somebody is roughly in front of you
         while you are advancing, fire anyway. Wide cone, because you
         are moving and not aiming, which is exactly right. */
      if (t && td < w.far && M.time >= p.nextShot) {
        var want = yawTo(p.pos, t.pos), off2 = want - p.yaw;
        while (off2 > Math.PI) off2 -= Math.PI * 2;
        while (off2 < -Math.PI) off2 += Math.PI * 2;
        if (Math.abs(off2) < 0.20) fire(M, p, rand, emit);
      }
    }
  }

  function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  /* Where a bot is trying to get to. In Search and Destroy that is the
     bomb, the site, or the man carrying it. In Team Deathmatch it is
     the middle of a lane in the other half, which is the honest answer
     to "where is the fight" on a three-lane map. */
  function pickGoal(M, p, rand) {
    var g = rawGoal(M, p, rand);
    return navSnap(M.nav, g.x, g.z) || g;
  }

  function rawGoal(M, p, rand) {
    if (M.mode.bomb && M.bomb) {
      var att = M.bomb.attackers === p.team;
      if (M.bomb.planted) {
        var s = M.bomb.site;
        return { x: s.at[0] + (rand() - 0.5) * 6, z: s.at[2] + (rand() - 0.5) * 6 };
      }
      if (att && M.bomb.carrier === p.id) {
        var site = M.map.sites[M.bomb.want];
        return { x: site.at[0], z: site.at[2] };
      }
      /* Late in the round everybody on the attacking side goes to the
         site, carrier or not: a plant needs somebody standing on it and
         there is no time left to be clever about getting there. */
      if (att && (M.roundTime > 15 || (M.aliveCount && M.aliveCount[p.team] <= 2))) {
        var sl = M.map.sites[M.bomb.want];
        return { x: sl.at[0] + (rand() - 0.5) * 7, z: sl.at[2] + (rand() - 0.5) * 7 };
      }
      /* THE REST OF THE ATTACK GOES TO THE SITE, spread around it.
       *
         They used to escort the carrier at plus or minus twenty-two
         metres, which was meant to keep him company and instead put the
         whole side in a loose cloud that was nowhere in particular.
         Measured on Town: never more than ONE attacker within reach of
         a site in a whole nine-round match, and the plant stalling at
         1.47 seconds of the 2.8 it needs.

         Going to the site is also going with the carrier -- that is
         where he is headed -- and it means that when he dies somebody
         else is already standing on it. */
      if (att) {
        var sd = M.map.sites[M.bomb.want];
        return { x: sd.at[0] + (rand() - 0.5) * 13, z: sd.at[2] + (rand() - 0.5) * 13 };
      }
      var s2 = M.map.sites[att ? M.bomb.want : (rand() < 0.5 ? 0 : 1)];
      return { x: s2.at[0] + (rand() - 0.5) * 10, z: s2.at[2] + (rand() - 0.5) * 10 };
    }
    var lane = M.map.lanes[Math.floor(rand() * M.map.lanes.length) % M.map.lanes.length];
    var toward = p.team === 'a' ? 1 : -1;
    return { x: lane.x + (rand() - 0.5) * 12, z: toward * (6 + rand() * 24) };
  }

  /* Walk round what is in the way. The direct line first, because it is
     the common case and costs one lookup; the grid only when it is not
     clear. Recomputed on a timer rather than every frame, or twelve
     bodies is twelve A* searches sixty times a second. */
  function steer(M, p, goal) {
    var ai = p.ai;
    if (navClear(M.nav, p.pos, goal)) { ai.path = null; return goal; }
    var stale = !ai.path || M.time - ai.pathAt > 1.1;
    if (stale) {
      if (M.stats) M.stats.paths++;
      ai.path = navPath(M.nav, p.pos, goal, M.stats);
      ai.pathAt = M.time; ai.pathIdx = 0;
      if (!ai.path) {
        if (M.stats) M.stats.pathFail++;
        /* Somewhere it cannot get to. Choose again next tick rather
           than asking the same impossible question every second for the
           rest of the match. */
        ai.goal = null; ai.goalAt = -99;
      }
    }
    var path = ai.path;
    if (!path || !path.length) return goal;
    var wp = path[Math.min(ai.pathIdx, path.length - 1)];
    if (dist2(p.pos, { x: wp[0], z: wp[2] }) < 0.9) {
      ai.pathIdx = Math.min(ai.pathIdx + 1, path.length - 1);
      wp = path[ai.pathIdx];
    }
    return { x: wp[0], z: wp[2] };
  }

  /* ================================================================
     THE TWO MODES
     ================================================================ */

  function armRound(M) {
    /* Sides swap at the halfway point, which is what stops Search and
       Destroy being a map you only ever attack or only ever defend. */
    var half = Math.ceil(M.mode.score / 2);
    var swapped = (M.score.a + M.score.b) >= half;
    var attackers = swapped ? 'b' : 'a';
    var want = (M.round % 2) ? 0 : 1;
    var site = M.map.sites[want];
    /* The bomb goes to whoever spawned nearest the site they are going
       to, not to whoever happens to be first in the list. On Town --
       the biggest of the four -- the first attacker was routinely the
       one furthest from the objective, and across six rounds the bomb
       was never carried to a site once. */
    var carriers = M.people.filter(function (p) { return p.team === attackers; })
      .sort(function (x, y) {
        return Math.hypot(x.pos.x - site.at[0], x.pos.z - site.at[2])
          - Math.hypot(y.pos.x - site.at[0], y.pos.z - site.at[2]);
      });
    M.bomb = {
      attackers: attackers, defenders: attackers === 'a' ? 'b' : 'a',
      carrier: carriers.length ? carriers[0].id : null,
      want: want,
      planted: false, plantAt: 0, progress: 0, site: null, defuse: 0, switched: false,
      lastAt: 0,
    };
    M.roundTime = 0;
  }

  function updateBomb(M, dt, emit) {
    var B = M.bomb;
    if (!B) return;
    /* THE OPENING FREEZE.
     *
       A round starts with everybody dead for three seconds while they
       are put back. The elimination check ran during those three
       seconds, found nobody alive on either side, and ended the round
       -- which started another one, which also ended. A whole six-round
       match finished in THIRTEEN SECONDS and the bomb was never once
       carried anywhere, because no round ever lasted long enough for
       anybody to take a step.

       Nothing is decided until everybody is on their feet. */
    if (M.roundTime < 4.5) return;
    var alive = { a: 0, b: 0 };
    M.people.forEach(function (p) { if (p.alive) alive[p.team]++; });

    if (!B.planted) {
      var carrier = M.people[B.carrier];
      /* The bomb is dropped where its carrier fell, and the next
         attacker alive picks it up. A round that ends because the one
         man holding it died in the first ten seconds is not a round. */
      if (!carrier || !carrier.alive) {
        var site2 = M.map.sites[B.want];
        var next = M.people.filter(function (p) { return p.team === B.attackers && p.alive; })
          .sort(function (x, y) {
            return Math.hypot(x.pos.x - site2.at[0], x.pos.z - site2.at[2])
              - Math.hypot(y.pos.x - site2.at[0], y.pos.z - site2.at[2]);
          })[0];
        B.carrier = next ? next.id : null;
      }
      var c2 = B.carrier != null ? M.people[B.carrier] : null;
      /* GO TO THE OTHER ONE.
       *
         Thirty seconds in with nothing planted means the site being
         walked at is being held. A player would go to the other one,
         and until they did, whether a round was ever planted at all
         came down to which map and which seed: Helipad's first site is
         a helicopter parked in the middle of a completely open pad,
         which is a fine thing to fight over and a terrible thing to
         walk to in a straight line for six rounds running. Once per
         round, so it is a decision and not a dither. */
      if (c2 && c2.alive && !B.switched && M.roundTime > 20) {
        var other = 1 - B.want;
        var so = M.map.sites[other], sn = M.map.sites[B.want];
        var dOther = Math.hypot(c2.pos.x - so.at[0], c2.pos.z - so.at[2]);
        var dNow = Math.hypot(c2.pos.x - sn.at[0], c2.pos.z - sn.at[2]);
        if (dOther < dNow * 1.25) {
          B.want = other; B.switched = true; B.progress = 0;
          M.people.forEach(function (q) { if (q.team === B.attackers) { q.ai.goal = null; q.ai.goalAt = -99; } });
        }
      }
      /* WHOEVER IS STANDING ON IT PLANTS IT, not only the man the round
         started with.
       *
         The bomb was a relay baton: only its current carrier could
         advance the plant, and when he died the next nearest attacker
         inherited it wherever he happened to be -- usually forty metres
         away, with the progress bleeding off the whole way back. On
         Town, the biggest of the four, that meant six rounds could go
         by without a plant depending on nothing but the seed.

         A bomb is a thing on the ground at the site. Anybody on the
         attacking side who is standing there is planting it, and two of
         them there is faster than one. */
      var site = M.map.sites[B.want];
      var onSite = M.people.filter(function (q) {
        return q.team === B.attackers && q.alive
          && Math.hypot(q.pos.x - site.at[0], q.pos.z - site.at[2]) < site.r;
      });
      if (onSite.length) {
        B.lastAt = M.time;
        B.progress += dt * (1 + (onSite.length - 1) * 0.40);
        if (B.progress >= 2.8) {
          B.planted = true; B.plantAt = M.time; B.site = site; B.progress = 0;
          var ev = { t: M.time, kind: 'plant', who: onSite[0].id, site: site.id };
          M.events.push(ev); emit(ev);
        }
      } else if (M.time - (B.lastAt || 0) > 5) {
        /* Only once the site has been properly given up. A plant that
           unwinds the moment its man is killed is a plant that only
           ever happens uncontested. */
        B.progress = Math.max(0, B.progress - dt * 0.35);
      }
      if (alive[B.attackers] === 0) return endRound(M, B.defenders, 'attackers eliminated', emit);
      if (alive[B.defenders] === 0) return endRound(M, B.attackers, 'defenders eliminated', emit);
      if (M.roundTime - 4.5 > M.mode.seconds) return endRound(M, B.defenders, 'time', emit);
      return;
    }

    /* Planted. The clock is the only thing that matters now -- killing
       the last defender does not win it, and that is the mode. */
    var defusing = M.people.filter(function (p) {
      return p.team === B.defenders && p.alive
        && Math.hypot(p.pos.x - B.site.at[0], p.pos.z - B.site.at[2]) < B.site.r;
    });
    if (defusing.length) {
      B.defuse += dt * (1 + (defusing.length - 1) * 0.35);
      if (B.defuse >= 6.0) {
        var ev2 = { t: M.time, kind: 'defuse', who: defusing[0].id };
        M.events.push(ev2); emit(ev2);
        return endRound(M, B.defenders, 'defused', emit);
      }
    } else B.defuse = Math.max(0, B.defuse - dt * 0.5);
    if (M.time - B.plantAt > 45) return endRound(M, B.attackers, 'detonated', emit);
    if (alive[B.defenders] === 0 && !defusing.length) {
      return endRound(M, B.attackers, 'defenders eliminated', emit);
    }
    return undefined;
  }

  function endRound(M, winner, why, emit) {
    M.score[winner]++;
    var ev = { t: M.time, kind: 'roundEnd', winner: winner, why: why,
      score: { a: M.score.a, b: M.score.b } };
    M.events.push(ev); emit(ev);
    if (M.score[winner] >= M.mode.score) return finish(M, winner, emit);
    M.round++;
    M.people.forEach(function (p) { p.alive = false; p.respawnAt = M.time + 3.0; });
    armRound(M);
    return undefined;
  }

  function finish(M, winner, emit) {
    M.over = true;
    M.winner = winner;
    var ev = { t: M.time, kind: 'matchEnd', winner: winner,
      score: { a: M.score.a, b: M.score.b } };
    M.events.push(ev); emit(ev);
    return undefined;
  }

  /* ================================================================
     THE TICK
     ================================================================ */

  function update(M, dt, rand, emit) {
    if (M.over) return;
    dt = Math.min(dt, 0.05);           // one long frame must not teleport anybody
    M.time += dt;
    M.roundTime += dt;

    /* How many are left on each side, counted once and read by
       everybody. The bots need it to know when their round is slipping
       away, and counting it inside twelve bot brains is twelve times
       the work for the same number. */
    recSample(M, dt);
    hlTick(M);
    M.aliveCount = { a: 0, b: 0 };
    for (var c0 = 0; c0 < M.people.length; c0++) {
      if (M.people[c0].alive) M.aliveCount[M.people[c0].team]++;
    }

    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i];
      /* Posed every tick, alive or not, and BEFORE the early return --
         a body that stops moving stops calling moveBy, so animating
         from inside the mover left anyone who came to a halt frozen
         mid-stride until they set off again. */
      if (p.actor && !M.replaying) animate(p, dt);
      if (!p.alive) {
        /* Search and Destroy has no respawns inside a round. The round
           itself puts everybody back, in the first few seconds of it. */
        if (M.time >= p.respawnAt && (!M.mode.bomb || M.roundTime < 4.0)) spawn(M, p, false);
        continue;
      }
      settleKick(M, p, dt);
      if (M.time >= p.reloadUntil && p.reloadUntil > 0) { finishReload(M, p); p.reloadUntil = 0; }
      /* Health comes back after five seconds untouched. Without it every
         fight after the first is decided by the one before it. */
      if (p.hp < HEALTH && M.time - (p.hurtAt || 0) > 5) p.hp = Math.min(HEALTH, p.hp + 18 * dt);
      if (p.bot) botThink(M, p, dt, rand, emit);
      /* Out of the world. It should not be possible and it is checked
         for anyway, because the one time it happens it is a player
         falling for the rest of the match. */
      if (p.pos.y < -25) { p.alive = false; p.deaths++; p.respawnAt = M.time + 2; }
    }

    if (M.mode.bomb) updateBomb(M, dt, emit);
    else {
      if (M.score.a >= M.mode.score) return finish(M, 'a', emit);
      if (M.score.b >= M.mode.score) return finish(M, 'b', emit);
      if (M.time >= M.mode.minutes * 60) {
        return finish(M, M.score.a === M.score.b ? null : (M.score.a > M.score.b ? 'a' : 'b'), emit);
      }
    }
    return undefined;
  }

  /* ================================================================
     THE PLAYER
     ================================================================
     You are combatant zero and you move, shoot and reload through the
     same functions the bots do. The only thing this adds is reading a
     set of intentions instead of deciding them, which is the whole of
     the difference between a person and a bot and should be the whole
     of the difference in the code as well. */
  function control(M, cmd, dt) {
    var p = M.you;
    if (!p || !p.alive || M.over) return;
    var w = gun(p);
    p.yaw = cmd.yaw; p.pitch = cmd.pitch;
    p.aiming = !!cmd.aim;

    var fwd = cmd.forward || 0, str = cmd.right || 0;
    var len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    /* Sprinting is forward only, and you cannot sprint down your sights.
       Crouching is slower and steadier. */
    var sprint = cmd.run && fwd > 0.5 && !p.aiming;

    /* THE SLIDE.
     *
       Entered from a sprint and from nothing else, because a slide from
       standing is a crouch with extra steps. It keeps the speed you
       came in with plus a shove, bleeds it off over about three
       quarters of a second, and drops you to crouch height for the
       whole of it -- so it is genuinely a way under a sightline and not
       only a way to look busy.

       The recovery is the cost. For a fifth of a second after it ends
       you are standing up and cannot fire, which is what stops it being
       a free dodge you spam round every corner. */
    if (cmd.slide && sprint && p.grounded && M.time > (p.slideEnd || 0) + 0.45) {
      p.sliding = true;
      p.slideEnd = M.time + 0.72;
      p.slideDir = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
      p.slideSpeed = 5.2 * w.move * 1.62;
    }
    if (p.sliding && (M.time >= p.slideEnd || !p.grounded)) {
      p.sliding = false;
      p.slideRecover = M.time + 0.20;
    }
    if (p.sliding) {
      /* Only the last of the speed is steerable, so a slide commits you
         to roughly where you pointed it. */
      var left = Math.max(0, (p.slideEnd - M.time) / 0.72);
      var sp2 = p.slideSpeed * (0.35 + 0.65 * left);
      var steer2 = 1 - left * 0.85;
      var rr = RIGHT(p.yaw);
      var dx = p.slideDir.x + rr.x * str * steer2;
      var dz = p.slideDir.z + rr.z * str * steer2;
      var dl = Math.hypot(dx, dz) || 1;
      moveBy(M, p, (dx / dl) * sp2, (dz / dl) * sp2, dt, false);
      p.crouching = true;
      p.sprinting = false;
      return;
    }

    var speed = 5.2 * w.move * (sprint ? 1.34 : 1) * (cmd.crouch ? 0.52 : 1)
      * (p.aiming ? 0.62 : 1);
    var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    var rt = RIGHT(p.yaw);
    moveBy(M, p, (sy * fwd + rt.x * str) * speed, (cy * fwd + rt.z * str) * speed, dt,
      !!cmd.jump && p.grounded);

    if (cmd.swap && M.time > (p._swapAt || 0)) {
      p.held = 1 - p.held; p._swapAt = M.time + 0.6; p.nextShot = M.time + 0.5;
      p.reloadUntil = 0;
    }
    if (cmd.reload && !p.reloadUntil && p.ammo[p.held] < w.mag) beginReload(M, p);
    /* Not while you are getting up out of a slide. */
    if (cmd.fire && M.time >= (p.slideRecover || 0) && (w.auto || !p._heldTrigger)) {
      fireHuman(M, p);
    }
    p._heldTrigger = !!cmd.fire;
    p.sprinting = sprint;
    p.crouching = !!cmd.crouch;
  }

  var humanRand = rng(0x5eed);
  function fireHuman(M, p) { return fire(M, p, humanRand, M._emit || function () {}); }

  function scoreboard(M) {
    return M.people.slice().sort(function (x, y) {
      return (y.kills - y.deaths) - (x.kills - x.deaths) || y.kills - x.kills;
    }).map(function (p) {
      return { id: p.id, name: p.name, team: p.team, bot: p.bot,
        kills: p.kills, deaths: p.deaths, damage: Math.round(p.damage),
        best: p.bestStreak, gun: p.guns[0].name,
        skill: p.skill ? p.skill.name : 'player' };
    });
  }

  W.MP_MATCH = {
    start: start,
    HEALTH: HEALTH, EYE: EYE, RESPAWN: RESPAWN,
    damageAt: damageAt, botLoadout: botLoadout, control: control,
    muzzleOf: muzzleOf, kickFrom: kickFrom, settleKick: settleKick,
    AIM_Y: 1.25, GRAVITY: GRAVITY, JUMP: JUMP,
    nav: { build: navBuild, path: navPath, clear: navClear, blocked: navBlocked,
      flood: navFlood, snap: navSnap, reachable: navReachable, CELL: NAV_CELL },
  };
})();
