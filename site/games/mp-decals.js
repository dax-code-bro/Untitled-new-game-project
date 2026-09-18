/* ====================================================================
   WHAT A FIGHT LEAVES BEHIND
   ====================================================================
   Bullet holes, blood on the walls, a pool under a body, and the burn
   ring an explosion leaves -- all of them with an age, and all of them
   gone again after a while.

   THE TIMES ARE THE ONES ASKED FOR: impacts for a minute, blood for
   three. The last fifth of each is a fade rather than a disappearance,
   because a decal that vanishes on one frame is a decal the player
   sees vanish.

   HOW THE FADE WORKS, and why it is in steps

   The renderer's alpha is a per-MATERIAL uniform, not per instance --
   the instance data carries a tint (which can only multiply a colour
   DOWN, so it cannot fade a dark hole off a pale wall) and one spare
   float the lit shader does not read. Rather than change the shader
   under everything else in the game, each decal kind owns a short
   ladder of materials at fixed opacities and a decal is MOVED DOWN THE
   LADDER as it ages. Six steps over sixty seconds is one step every
   ten seconds, on a mark a few centimetres across that nobody is
   looking at: it reads as a fade, and it costs six materials rather
   than one per decal.

   EVERYTHING IS POOLED. A long match on Demolition puts a few thousand
   rounds into the scenery. Each kind has a ring of a fixed size and
   the oldest is reused, so the cost of the whole system is bounded
   before the first shot is fired.

   PER WEAPON, because it was asked for and because it is true: a
   twelve-gauge does not mark a wall the way a .22 does. The size, the
   spall ring around it and how much dust comes off are all read off
   the weapon that fired, through `impactOf`.
   ==================================================================== */
(function () {
  'use strict';
  var W = window;

  /* ---- how long things last ---- */
  var LIFE = {
    hole: 60,          // a minute
    spall: 60,
    blood: 180,        // three minutes
    pool: 180,
    scorch: 90,
  };
  /* Ring sizes. Holes outnumber everything else by a factor of thirty. */
  var POOL = { hole: 260, spall: 120, blood: 90, pool: 26, scorch: 24 };

  /* The opacity ladder. Each kind's material at each step. */
  var STEPS = [1.0, 0.82, 0.62, 0.44, 0.27, 0.12];

  var LOOK = {
    hole: { color: 0x0e0b08, roughness: 0.96, metalness: 0.0, texture: 'smooth' },
    spall: { color: 0x9c968a, roughness: 0.92, metalness: 0.0, texture: 'concrete' },
    blood: { color: 0x5e0f0b, roughness: 0.42, metalness: 0.0, texture: 'smooth' },
    pool: { color: 0x460a07, roughness: 0.22, metalness: 0.0, texture: 'smooth' },
    scorch: { color: 0x120f0c, roughness: 0.98, metalness: 0.0, texture: 'smooth' },
  };

  /* ---- what each weapon does to a wall ----
     Read off the family and the damage, because the weapon table has
     no calibre in it and inventing one to look it up with would be a
     second thing to keep in step. */
  function impactOf(w) {
    if (!w) return { hole: 0.055, spall: 0.13, dust: 10, spark: 4, deep: 1 };
    var fam = w.fam || '', cls = w.cls || '';
    if (fam === 'amr') return { hole: 0.135, spall: 0.44, dust: 34, spark: 14, deep: 3 };
    if (fam === 'bolt' || fam === 'dmr') return { hole: 0.085, spall: 0.26, dust: 22, spark: 9, deep: 2 };
    if (cls === 'lmg') return { hole: 0.070, spall: 0.20, dust: 16, spark: 7, deep: 2 };
    if (fam === 'pump' || fam === 'auto12') return { hole: 0.032, spall: 0.09, dust: 5, spark: 2, deep: 1 };
    if (cls === 'pistol') return { hole: 0.044, spall: 0.11, dust: 8, spark: 3, deep: 1 };
    if (cls === 'smg') return { hole: 0.048, spall: 0.12, dust: 9, spark: 4, deep: 1 };
    if (cls === 'launcher') return { hole: 0, spall: 0, dust: 40, spark: 20, deep: 0, scorch: 1.9 };
    return { hole: 0.058, spall: 0.15, dust: 12, spark: 5, deep: 1 };
  }

  function make(game) {
    if (!game || !game.box) return null;
    var mats = {};
    for (var k in LOOK) {
      if (!Object.prototype.hasOwnProperty.call(LOOK, k)) continue;
      mats[k] = STEPS.map(function (o) {
        var spec = {};
        for (var q in LOOK[k]) spec[q] = LOOK[k][q];
        spec.opacity = o;
        /* Below one, resolveMaterial marks it transparent on its own. */
        return game.material(spec);
      });
    }

    var rings = {}, at = {};
    for (var kk in POOL) { rings[kk] = []; at[kk] = 0; }
    var live = [];                      // everything currently showing
    var clock = 0;

    /* A decal is a very thin box lying on the surface. A quad would be
       one triangle pair cheaper and would also be a mesh nothing else
       in the game uses; the box is already instanced with every crate
       on the map. */
    function cell(kind) {
      var ring = rings[kind];
      var i = at[kind];
      at[kind] = (i + 1) % POOL[kind];
      var a = ring[i];
      if (!a) {
        try {
          a = game.box({ at: [0, -900, 0], size: [1, 1, 0.006], physics: false,
            material: mats[kind][0], name: 'decal-' + kind });
        } catch (e) { return null; }
        a.noCull = true;
        ring[i] = a;
      } else if (a.__rec) {
        /* Reused before its time was up: forget the old one. */
        var q = live.indexOf(a.__rec);
        if (q >= 0) live.splice(q, 1);
      }
      return a;
    }

    var AXZ = null, TMP = null;
    function lieOn(a, point, n, size, spin) {
      if (!AXZ) { AXZ = { x: 0, y: 0, z: 1 }; }
      a.position.set(point.x + n.x * 0.006, point.y + n.y * 0.006, point.z + n.z * 0.006);
      a.scale.set(size, size, 0.006);
      /* Take the decal's own +Z onto the surface normal, then spin it
         about that normal so a wall of holes is not a wall of the same
         hole. Done as two rotations composed, because a single
         axis-angle cannot also carry the roll. */
      if (a.rotation && a.rotation.setAxisAngle) {
        var dot = Math.max(-1, Math.min(1, n.z));
        var ax = -n.y, ay = n.x, az = 0;
        var al = Math.hypot(ax, ay, az);
        if (al < 1e-6) { ax = 1; ay = 0; az = 0; al = 1; }
        a.rotation.setAxisAngle({ x: ax / al, y: ay / al, z: az / al }, Math.acos(dot));
        if (spin && a.rotation.mulQuats && W.LE && W.LE.Quat) {
          if (!TMP) TMP = new W.LE.Quat();
          TMP.setAxisAngle({ x: n.x, y: n.y, z: n.z }, spin);
          a.rotation.mulQuats(TMP, a.rotation);
        }
      }
      a._still = false;
    }

    function add(kind, point, normal, size, spin) {
      var a = cell(kind);
      if (!a) return null;
      var n = normal && isFinite(normal.x) && (normal.x || normal.y || normal.z)
        ? normal : { x: 0, y: 1, z: 0 };
      var nl = Math.hypot(n.x, n.y, n.z) || 1;
      n = { x: n.x / nl, y: n.y / nl, z: n.z / nl };
      lieOn(a, point, n, size, spin);
      a.visible = true;
      a.material = mats[kind][0];
      var rec = { a: a, kind: kind, born: clock, life: LIFE[kind], step: 0,
        size: size, grow: 0 };
      a.__rec = rec;
      live.push(rec);
      return rec;
    }

    return {
      /* ---- a round into the scenery ---- */
      bullet: function (point, normal, weapon) {
        var I = impactOf(weapon);
        if (I.scorch) { this.scorch(point, normal, I.scorch); }
        else {
          /* The spall goes down first so the hole sits on top of it. */
          if (I.spall > 0) add('spall', point, normal, I.spall * (0.8 + Math.random() * 0.5),
            Math.random() * 6.28);
          add('hole', point, normal, I.hole * (0.85 + Math.random() * 0.35),
            Math.random() * 6.28);
        }
        /* And the thing you actually notice: the puff off the wall. */
        try {
          if (game.particles) {
            game.particles.dust([point.x, point.y, point.z],
              { count: I.dust, size: 0.06 + I.hole });
            if (I.spark) {
              game.particles.sparks([point.x, point.y, point.z],
                { count: I.spark, speed: 3.4 + I.deep });
            }
          }
        } catch (e) { /* no particle system on this build */ }
      },

      /* ---- a round into a man ---- */
      hit: function (point, dir, heavy) {
        try {
          if (game.particles) {
            game.particles.blood([point.x, point.y, point.z],
              { count: heavy ? 26 : 12, speed: heavy ? 5 : 3 });
          }
        } catch (e) { /* none */ }
      },

      /* Spray behind whoever was hit: three or four overlapping marks,
         thrown along the direction of travel onto whatever is behind
         him. Only when something IS behind him, within a couple of
         metres -- blood painted on the floor forty metres downrange is
         not blood, it is litter. */
      spray: function (from, dir, weapon) {
        var dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
        var d = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
        var hit = null;
        try {
          hit = game.raycast([from.x, from.y, from.z], [d.x, d.y, d.z], 2.6,
            function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
        } catch (e) { hit = null; }
        if (!hit || !hit.point) return 0;
        var I = impactOf(weapon);
        var n = hit.normal || { x: -d.x, y: -d.y, z: -d.z };
        var k = 2 + Math.floor(Math.random() * 3);
        for (var i = 0; i < k; i++) {
          var jitter = 0.10 + Math.random() * 0.20;
          var p = {
            x: hit.point.x + (Math.random() - 0.5) * jitter,
            y: hit.point.y + (Math.random() - 0.5) * jitter,
            z: hit.point.z + (Math.random() - 0.5) * jitter,
          };
          add('blood', p, n, (0.10 + Math.random() * 0.22) * (1 + I.deep * 0.22),
            Math.random() * 6.28);
        }
        return k;
      },

      /* ---- a body on the ground ----
         The pool grows for the first few seconds and then holds, which
         is the difference between blood and a red circle. */
      pool: function (point) {
        var rec = add('pool', { x: point.x, y: point.y + 0.004, z: point.z },
          { x: 0, y: 1, z: 0 }, 0.16, Math.random() * 6.28);
        if (rec) { rec.grow = 0.62 + Math.random() * 0.34; rec.growT = 5.0; }
        return rec;
      },

      scorch: function (point, normal, size) {
        add('scorch', point, normal || { x: 0, y: 1, z: 0 }, size || 1.6,
          Math.random() * 6.28);
        try {
          if (game.particles) game.particles.explosion([point.x, point.y, point.z],
            { scale: (size || 1.6) / 3 });
        } catch (e) { /* none */ }
      },

      /* ---- the clock ---- */
      tick: function (dt) {
        clock += dt;
        for (var i = live.length - 1; i >= 0; i--) {
          var r = live[i];
          var age = clock - r.born;
          if (age >= r.life) {
            r.a.visible = false;
            r.a.__rec = null;
            live.splice(i, 1);
            continue;
          }
          /* Growing pools. */
          if (r.grow && age < r.growT) {
            var f = age / r.growT;
            var s = r.size + (r.grow - r.size) * (1 - (1 - f) * (1 - f));
            r.a.scale.set(s, s, 0.006);
            r.a._still = false;
          }
          /* The last fifth is the fade, in steps down the ladder. */
          var left = 1 - age / r.life;
          var want = left > 0.20 ? 0
            : Math.min(STEPS.length - 1, 1 + Math.floor((0.20 - left) / 0.20 * (STEPS.length - 1)));
          if (want !== r.step) {
            r.step = want;
            r.a.material = mats[r.kind][want];
          }
        }
      },

      /* Everything gone: a new match, or a Play Again. */
      clear: function () {
        for (var i = 0; i < live.length; i++) { live[i].a.visible = false; live[i].a.__rec = null; }
        live.length = 0;
      },
      get count() { return live.length; },
      _live: live,
      LIFE: LIFE,
    };
  }

  W.MP_DECALS = { make: make, LIFE: LIFE, impactOf: impactOf, POOL: POOL, STEPS: STEPS };
}());
