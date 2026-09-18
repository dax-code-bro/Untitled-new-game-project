/* ==================================================================
   FITTING ATTACHMENTS TO A WEAPON
   ==================================================================
   Multiplayer showed no attachments on any gun, ever. Not because the
   parts are missing -- there are sixty-nine of them, every one a real
   model -- but because nothing in multiplayer ever mounted one. The
   whole system lived inside bunker-nine, which multiplayer does not
   load, which is the third time in this project that a working feature
   turned out to be behind a file boundary.

   EVERY WEAPON IS A DIFFERENT SHAPE, so a single offset per attachment
   is wrong on most of the rack. The mounts are not a table of guesses
   per gun: they come off the weapon's OWN measurements, which every
   serviceArm build already reports about itself --

     muzzleAt   how far the crown is from the origin
     boreAt     how high the bore line sits above it
     sightAt    where the sight line is
     magWell    where the magazine goes in, if it has one

   -- so a sight lands on the sight line of whatever it is bolted to, a
   muzzle device lands on the crown, and a drum hangs under the well. A
   weapon added tomorrow is fitted correctly without being added here.
   ================================================================== */

/* Which family of part a weapon takes. A long barrel for a pistol is
   not a long barrel for a rifle, and an SMG does not take a 1911's
   magazine -- they are different objects sharing a slot name. */
function hostClassOf(root, hint) {
  if (hint) return hint;
  const m = root && root.muzzleAt != null ? root.muzzleAt : 0.3;
  return m > 0.60 ? 'rifle' : m > 0.30 ? 'smg' : 'pistol';
}

/* WHAT LOCKS OUT WHAT.
   Two optics on one rail is two optics on one rail; a bipod and a
   foregrip want the same few centimetres of handguard. The weapon
   table already answers this properly -- every attachment declares the
   SLOT it occupies -- so the rule is simply one per slot, and it
   applies wherever parts are mounted rather than only in the screen
   that picks them. A list that arrives from storage is a list somebody
   may have edited. */

/* Filter a wanted list down to what can physically go on at once.
   Takes [{ id, slot }]; first come, first served, because the loadout
   screen adds in the order the player picked. */
Engine.prototype.legalAttachments = function (wanted, max) {
  const out = [], taken = {};
  for (const p of (wanted || [])) {
    const id = typeof p === 'string' ? p : p.id;
    const slot = typeof p === 'string' ? null : p.slot;
    if (slot) {
      if (taken[slot]) continue;
      taken[slot] = id;
    }
    out.push({ id, slot });
    if (max && out.length >= max) break;
  }
  return out;
};

/* Mount a set of parts onto a built weapon. Returns a map of id to the
   actors that make it up, all hidden -- showing them is the caller's
   business, because the loadout preview wants to flick between them
   while the game wants whatever the player actually fitted. */
Engine.prototype.fitAttachments = function (root, opts = {}) {
  if (!root) return null;
  const M = root.muzzleAt != null ? root.muzzleAt : 0.34;
  const B = root.boreAt != null ? root.boreAt : 0.05;
  const H = root.sightAt != null ? root.sightAt : B + 0.026;
  const host = hostClassOf(root, opts.host);
  const feed = opts.feed || 'box';
  const bore = opts.bore || 0.0046;
  const dims = opts.dims || {};
  const well = root.magWell || null;

  const mount = (id, pos, rot) => {
    const grp = this.gunPart(id, { host, feed, dims, bore });
    if (!grp) return null;
    grp.setPosition(pos);
    if (rot) grp.setRotation(rot);
    grp.parent = root;
    const list = [grp];
    for (const nm of (grp.partNames || []).slice(1)) if (grp[nm]) list.push(grp[nm]);
    for (const q of list) q.visible = false;
    return list;
  };

  /* Under the well where there is one, on the frame where there is
     not -- a revolver has no magazine and a drum still has to hang
     somewhere that is not mid-air. */
  const magAt = (id, fallback) => {
    if (!well) return fallback;
    return [well[0] + (id === 'drummag' ? 0.006 : 0),
      well[1] - (id === 'drummag' ? 0.004 : 0.014), well[2]];
  };

  const muz = [M - 0.012, B, 0];
  const opt = [0.012, H - 0.010, 0];
  const under = [Math.max(0.10, M * 0.52), B - 0.030, 0];

  /* BY SLOT, off this weapon's own numbers. An optic lands on the
     sight line of whatever it is bolted to, a muzzle device on the
     crown, a foregrip about halfway down the handguard, a drum under
     the well -- so the same part sits correctly on a pistol and on a
     light machine gun without either being named here. */
  const BY_SLOT = {
    optic: opt,
    muzzle: muz,
    barrel: [M - 0.030, B, 0],
    under: under,
    mag: null,                    // magAt, which needs the id
    stock: [-0.085, B - 0.012, 0],
    grip: [-0.030, B - 0.048, 0],
    laser: [0.030, B - 0.026, 0.020],
  };

  const want = this.legalAttachments(opts.parts || [], opts.max);
  const made = {};
  for (const p of want) {
    const at = p.slot === 'mag'
      ? magAt(p.id, [-0.010, -0.092, 0])
      : (BY_SLOT[p.slot] || opt);
    const list = mount(p.id, at);
    if (list) made[p.id] = list;
  }
  root.__att = made;
  return made;
};

/* Show exactly the parts in `list` and hide the rest. */
Engine.prototype.showAttachments = function (root, list) {
  const made = root && root.__att;
  if (!made) return;
  const on = {};
  for (const p of this.legalAttachments(list || [])) on[p.id] = true;
  for (const id of Object.keys(made)) {
    for (const a of made[id]) a.visible = !!on[id];
  }
};
