/* ==================================================================
   THE AIMED VIEW: what a weapon puts in front of the eye
   ==================================================================

   Both games hold a weapon the same way aimed (mp-game place(), bunker-nine updateViewmodel()):
   the sight line on the camera axis and, on anything with a stock, the gun brought in until the
   cheek is on the stock and the butt behind the eye. Two things about the weapon's own shape decide
   what that looks like, and both are read off its meshes here so the two games read them the same.

   THE BUTT. How far behind its origin (the grip) the weapon reaches: the least x over every drawn
   part. A weapon reaching 15 cm or more back has a stock (or a bullpup's action) and is pulled in.

   THE REAR SIGHT. Pulled in, the top of the stock runs forward from under the eye to the receiver --
   and on most rifles the comb is only 8 to 16 mm under the sight line (on a shotgun it is level
   with the rib). From 10 cm away the near plane cut it flat, and what showed was a wide, stretched,
   wood-grained flap fanned out under the rear sight: the Kar 98's, the Mosin's, the Garand's, the
   Thompson's; the Longwake's scope bell filled a third of the screen. Aimed, the eye sees nothing
   behind the rear sight -- the stock is under the cheek -- so the weapon's own parts are clipped,
   while aiming, at 15 mm short of the rearmost thing on the sight line ahead of the stock: the rear
   sight, the back of the receiver, a scope's ocular. Everything behind it leaves the picture and the
   sights are untouched. 22 cm at most: further, and the back of an M4's upper receiver was cut open.

   THE WEAPON'S PARTS, NOT THE CAMERA'S NEAR PLANE. Done first by moving the near plane out, it cut
   the firing hand's wrist too: on the M4, the AK and the Volkhammer the back of the hand ended in a
   ragged sheet of skin with no forearm behind it. So the clip is a per-mesh one (`clipNearTree`,
   the renderer's CLIP_NEAR variant) on the weapon's rigid parts; the skinned arms are never cut. */

const AIM_NEAR_MAX = 0.22;

/* `root` the weapon actor (its origin at the grip, +X out along the bore, +Y up), `sightY` the
   height of its sight line above that origin. Cached on the actor. Returns
     rear       the least x over every drawn part (the butt)
     sightRear  the least x, ahead of the stock (x > -0.08), of anything within 16 mm of the sight
                line and 20 mm of the bore plane -- or null when nothing is */
function aimShape(root, sightY, geometryOf) {
  if (!root) return { rear: 0, sightRear: null };
  const key = sightY == null ? 'n' : sightY.toFixed(4);
  if (root.__aimShape && root.__aimShape.key === key) return root.__aimShape;
  let rear = 0, sightRear = null;
  const walk = (a, m) => {
    // Hidden parts count: mid-swap the whole weapon is hidden when this may first be asked.
    if (a !== root && (a.noDraw || a.skeleton)) return;
    const geo = a.mesh && geometryOf ? geometryOf(a.mesh) : null;
    if (geo && geo.positions) {
      const q = geo.positions, e = m ? m.e : null;
      for (let i = 0; i < q.length; i += 3) {
        const px = q[i], py = q[i + 1], pz = q[i + 2];
        const x = e ? e[0] * px + e[4] * py + e[8] * pz + e[12] : px;
        if (x < rear) rear = x;
        if (sightY == null || x <= -0.08 || (sightRear != null && x >= sightRear)) continue;
        const y = e ? e[1] * px + e[5] * py + e[9] * pz + e[13] : py;
        const z = e ? e[2] * px + e[6] * py + e[10] * pz + e[14] : pz;
        if (Math.abs(y - sightY) < 0.016 && Math.abs(z) < 0.02) sightRear = x;
      }
    }
    for (const c of (a.children || [])) {
      const cm = new Mat4();
      cm.compose(c._position, c._rotation, c.scale);
      if (m) { const t = new Mat4(); t.mulMatrices(m, cm); walk(c, t); } else walk(c, cm);
    }
  };
  try { walk(root, null); } catch (e) { rear = 0; sightRear = null; }
  root.__aimShape = { key, rear, sightRear };
  return root.__aimShape;
}

/* The clip distance for a weapon `dist` out along the camera axis (its origin's depth) at aim `aim`
   (0 hip .. 1 aimed): 0 at the hip, 15 mm short of the rear sight aimed. Only a weapon that reaches
   back past the eye (rear < -0.15) is clipped. Eased in on the square of the aim, so a weapon on its
   way up is not cut where its butt still is. */
function aimClip(shape, dist, aim) {
  if (!shape || shape.rear >= -0.15 || !(aim > 0)) return 0;
  const want = shape.sightRear == null ? AIM_NEAR_MAX
    : Math.min(AIM_NEAR_MAX, dist + shape.sightRear - 0.015);
  const a = Math.min(1, aim);
  return want > 0 ? want * a * a : 0;
}

Engine.prototype.aimShape = function (root, sightY) {
  return aimShape(root, sightY, this.geometryOf ? (m) => this.geometryOf(m) : null);
};

/* Set `clipNear` (metres from the eye; 0 for none) on a weapon's rigid parts. Skinned meshes -- the
   arms holding it -- are left alone. */
Engine.prototype.clipNearTree = function (root, v) {
  const walk = (a) => {
    if (!a) return;
    if (!a.skeleton) a.clipNear = v;
    for (const c of (a.children || [])) walk(c);
  };
  walk(root);
};
