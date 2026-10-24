// Shootout — the guns you can pick in Loadout.
// Every gun is cosmetic: whatever you carry, it shoots exactly like the
// others. Revolver-slot guns are the sidearm you play the whole game with;
// big-gun-slot guns are what a Gun card hands you (2 live shots, one hit
// kills). Each model works with every Gunsmith skin: the parts are built from
// the same material set (frame, barrel, cylinder/slide, grips, trim).
//
// Shared layout (as in models.js): barrel along +Z, grip hanging down -Y,
// origin near the trigger hand. Revolver-slot guns return { group, cylinder,
// hammer, muzzle, chambers, rounds, trigger } and semi-automatics add `mag`
// (the magazine that drops out to show a round). Big guns return { group,
// cylinder, hammer, muzzle, barrels, shells, open(t), shotgun: true }.

const GUNS = {
  revolver: [
    { id: 'colt',      name: 'Colt Single Action Army', blurb: 'The Peacemaker. A plain six-shooter with a case-hardened frame.' },
    { id: 'navy',      name: '1851 Navy Revolver',      blurb: 'Cap-and-ball with an octagon barrel, a loading lever and an engraved cylinder.' },
    { id: 'schofield', name: 'Schofield Revolver',      blurb: 'A Smith & Wesson top-break: the barrel tips down to empty all six at once.' },
    { id: 'm1911',     name: 'M1911',                   blurb: 'Colt’s .45 automatic, with a slide, a grip safety and a seven-round magazine.' },
    { id: 'mauser',    name: 'Mauser C96',              blurb: 'The “Broomhandle”: a long barrel, a magazine in front of the trigger and a round wooden grip.' },
    { id: 'luger',     name: 'Semi-Automatic Pistol',   blurb: 'A Luger-style automatic: a toggle that snaps up with every shot and a steeply raked grip.' },
  ],
  shotgun: [
    { id: 'coach',       name: 'Double-Barrel Coach Gun', blurb: 'Two barrels, a break action and a walnut stock.' },
    { id: 'python',      name: 'Colt Python',             blurb: 'A .357 Magnum with a ventilated rib and a full-length underlug.' },
    { id: 'sw500',       name: 'S&W Model 500',           blurb: 'The biggest revolver there is: a five-shot cylinder and a ported compensator.' },
    { id: 'bmg',         name: '.50 BMG Rifle',           blurb: 'An anti-materiel rifle with a scope, a muzzle brake and a folding bipod.' },
    { id: 'blunderbuss', name: 'Blunderbuss',             blurb: 'A brass flintlock with a flared bell mouth.' },
  ],
};
const GUN_BY_ID = {
  revolver: Object.fromEntries(GUNS.revolver.map(g => [g.id, g])),
  shotgun: Object.fromEntries(GUNS.shotgun.map(g => [g.id, g])),
};

const Guns = (() => {
  let P;   // Models.parts, filled in on first use
  const alongZ = (o, z, y = 0, x = 0) => { o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return o; };
  const alongX = (o, x, y, z) => { o.rotation.z = Math.PI / 2; o.position.set(x, y, z); return o; };

  // Gunsmith skins keep their look on every gun; on the Standard skin some
  // guns get their own finish (matte black, rubber grips, a brass barrel).
  const finishes = {};
  function finish(name) {
    if (finishes[name]) return finishes[name];
    const base = Models.mats();
    const mk = (src, color, metalness, roughness) => { const mt = src.clone(); mt.map = null; mt.color = P.col(color); mt.metalness = metalness; mt.roughness = roughness; return mt; };
    finishes[name] = {
      matte: () => mk(base.blued, 0x1c1d20, 0.55, 0.62),
      parkerized: () => mk(base.blued, 0x2e302c, 0.5, 0.7),
      rubber: () => mk(base.black, 0x101010, 0, 0.85),
      lens: () => { const mt = new THREE.MeshStandardMaterial({ color: P.col(0x0a1a2a), metalness: 0.2, roughness: 0.05, emissive: P.col(0x102840), emissiveIntensity: 0.6 }); return mt; },
    }[name]();
    return finishes[name];
  }

  // ---------- shared parts ----------

  // Revolver cylinder with n chambers; each chamber can show a round.
  function drum(m, { R = 0.0225, L = 0.046, n = 6, flutes = true, mat = m.steel, nipples = false } = {}) {
    const { cyl, box } = P;
    const cylinder = new THREE.Group();
    cylinder.add(alongZ(cyl(R, R, L, mat, 36), 0));
    cylinder.add(alongZ(cyl(0.004, 0.004, L + 0.004, m.nickel, 10), 0));
    const chambers = [], rounds = [];
    const cr = R * 0.6, hr = R * 0.21;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const hole = alongZ(cyl(hr, hr, L + 0.001, m.black, 12, { cast: false }), 0, Math.sin(a) * cr, Math.cos(a) * cr);
      cylinder.add(hole); chambers.push(hole);
      if (flutes) {
        const fa = a + Math.PI / n;
        const fl = box(R * 0.27, R * 0.13, L * 0.65, m.black, { cast: false });
        fl.position.set(Math.cos(fa) * R * 0.985, Math.sin(fa) * R * 0.985, L * 0.09); fl.rotation.z = fa + Math.PI / 2;
        cylinder.add(fl);
      }
      if (nipples) {   // percussion nipples on a cap-and-ball cylinder
        const nip = alongZ(cyl(0.0022, 0.003, 0.005, m.nickel, 8), -L / 2 - 0.002, Math.sin(a) * cr, Math.cos(a) * cr); nip.rotation.x = -Math.PI / 2; cylinder.add(nip);
      }
      const round = alongZ(cyl(hr * 0.88, hr * 0.88, 0.006, m.ammo, 12, { cast: false }), -L / 2 + 0.002, Math.sin(a) * cr, Math.cos(a) * cr);
      cylinder.add(round); rounds.push(round);
    }
    return { cylinder, chambers, rounds };
  }

  // Single-action hammer with a checkered spur, pivoting at its base.
  function spurHammer(m, z, y, size = 1) {
    const h = new THREE.Group();
    h.add(P.profile([[-0.004, -0.004], [0.004, -0.004], [0.004, 0.011], [-0.009, 0.017, -0.018, 0.015], [-0.018, 0.011], [-0.006, 0.007]].map(p => p.map(v => v * size)), 0.008 * size, m.blued, 0.001));
    for (let i = 0; i < 3; i++) { const c = P.box(0.009 * size, 0.0012, 0.0012, m.nickel, { cast: false }); c.position.set(0, 0.0175 * size, (-0.01 - i * 0.003) * size); h.add(c); }
    h.position.set(0, y, z);
    return h;
  }

  // Trigger guard (a bow) and a curved trigger.
  function guard(m, g, { z = -0.006, y = -0.031, r = 0.017, mat = m.brass, sy = 1.15 } = {}) {
    const gd = P.mesh(new THREE.TorusGeometry(r, 0.0032, 8, 24, Math.PI), mat);
    gd.rotation.set(Math.PI, Math.PI / 2, 0); gd.position.set(0, y, z); gd.scale.set(1, sy, 1); g.add(gd);
    const trigger = P.mesh(new THREE.TorusGeometry(r * 0.7, 0.0022, 6, 12, Math.PI * 0.55), m.blued);
    trigger.rotation.set(0, Math.PI / 2, Math.PI * 0.9); trigger.position.set(0, y + 0.005, z - 0.01); g.add(trigger);
    return trigger;
  }

  // A box magazine full of cartridges. `lean` tilts it with the grip. The
  // top round is rounds[0]; the magazine slides out along its own length.
  function magazine(m, n, { w = 0.018, d = 0.03, h = 0.09, lean = 0.2, z = -0.05, y = -0.05, r = 0.0045, len = 0.026 } = {}) {
    const mag = new THREE.Group();
    const body = P.box(w, h, d, m.steel); body.position.y = -h / 2; mag.add(body);
    const base = P.box(w + 0.004, 0.006, d + 0.006, m.blued); base.position.y = -h - 0.002; mag.add(base);
    const rounds = [];
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group();
      const brass = alongZ(P.cyl(r, r, len * 0.75, m.ammo, 10, { cast: false }), -len * 0.12);
      const tip = P.mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Models.mats().lead, { cast: false });
      tip.rotation.x = Math.PI / 2; tip.position.z = len * 0.26;
      c.add(brass, tip);
      c.position.set((i % 2 ? 1 : -1) * w * 0.12, 0.002 - i * r * 1.7, 0);
      mag.add(c);
      rounds.push(brass);
    }
    mag.position.set(0, y, z); mag.rotation.x = lean;
    mag.userData.home = mag.position.clone();
    mag.userData.out = new THREE.Vector3(0, -Math.cos(lean), -Math.sin(lean)).multiplyScalar(0.075);
    return { mag, rounds };
  }

  // A stand-in for the parts the table animates on a revolver.
  const blank = () => new THREE.Group();

  // ---------- revolver slot ----------

  function navy(m) {
    const { cyl, box, profile, sphere } = P;
    const g = new THREE.Group();
    // octagonal barrel, brass front sight, lug and loading lever beneath
    const barrel = alongZ(cyl(0.0098, 0.0098, 0.2, m.blued, 8), 0.13, 0.012); barrel.rotation.y = Math.PI / 8; g.add(barrel);
    g.add(alongZ(cyl(0.005, 0.005, 0.004, m.black, 12, { cast: false }), 0.229, 0.012));
    const bead = P.mesh(new THREE.ConeGeometry(0.0022, 0.008, 8), m.brass); bead.position.set(0, 0.023, 0.222); g.add(bead);
    g.add(profile([[0.024, 0.006], [0.085, 0.004], [0.08, -0.012], [0.024, -0.018]], 0.014, m.blued));
    g.add(profile([[0.04, -0.012], [0.16, -0.003], [0.162, -0.008], [0.045, -0.018], [0.03, -0.02]], 0.006, m.blued, 0.001));
    g.add(alongZ(cyl(0.0035, 0.0035, 0.03, m.nickel, 8), 0.035, -0.008));
    const wedge = box(0.03, 0.004, 0.006, m.nickel); wedge.position.set(0, 0.0, 0.035); g.add(wedge);
    // open-top frame: recoil shield and the lower frame, no top strap
    g.add(profile([[-0.036, 0.03], [-0.024, 0.028], [-0.024, -0.022], [-0.04, -0.024], [-0.05, 0.0, -0.046, 0.026]], 0.03, m.engraved));
    g.add(profile([[-0.04, -0.024], [0.03, -0.02], [0.03, -0.028], [-0.02, -0.034], [-0.04, -0.034]], 0.022, m.engraved));
    // engraved cylinder with percussion nipples
    const d = drum(m, { R: 0.021, L: 0.044, flutes: false, mat: m.engraved, nipples: true });
    g.add(d.cylinder);
    const hammer = spurHammer(m, -0.04, 0.022, 1.15); g.add(hammer);
    const trigger = guard(m, g, { mat: m.brass });
    // brass backstrap and a one-piece walnut grip
    g.add(profile([[-0.042, -0.024], [-0.028, -0.03], [-0.034, -0.07, -0.05, -0.104], [-0.07, -0.1], [-0.06, -0.068, -0.05, -0.03]], 0.02, m.brass));
    g.add(profile([[-0.04, -0.03], [-0.031, -0.034], [-0.036, -0.07, -0.052, -0.098], [-0.066, -0.095], [-0.058, -0.066, -0.047, -0.032]], 0.032, m.grip, 0.002));
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.232); g.add(muzzle);
    Models.parts.decorate(g, m, 'revolver', null, { len: 0.2, top: 0.06 });
    return { group: g, cylinder: d.cylinder, hammer, muzzle, chambers: d.chambers, rounds: d.rounds, trigger };
  }

  function schofield(m) {
    const { cyl, box, profile } = P;
    const g = new THREE.Group();
    // round barrel with a top rib, a short lug and the hinge at the front of the frame
    g.add(alongZ(cyl(0.0105, 0.0112, 0.17, m.blued, 28), 0.115, 0.012));
    g.add(profile([[0.024, 0.02], [0.2, 0.02], [0.2, 0.025], [0.024, 0.027]], 0.009, m.blued, 0.001));
    const blade = profile([[0.19, 0.024], [0.198, 0.024], [0.196, 0.032], [0.188, 0.032]], 0.003, m.nickel, 0); g.add(blade);
    g.add(alongZ(cyl(0.005, 0.005, 0.004, m.black, 12, { cast: false }), 0.2, 0.012));
    g.add(profile([[0.024, 0.0], [0.07, -0.002], [0.066, -0.014], [0.024, -0.02]], 0.016, m.blued));
    g.add(alongX(cyl(0.0045, 0.0045, 0.024, m.nickel, 12), 0, -0.02, 0.028));
    // frame with a top strap ending in the stirrup latch
    const frameMat = m.engraved;
    g.add(profile([[0.024, 0.026], [0.032, 0.026], [0.032, -0.02], [0.024, -0.022]], 0.022, frameMat));
    g.add(profile([[-0.03, 0.026], [0.032, 0.026], [0.032, 0.031], [-0.03, 0.033]], 0.016, frameMat));
    g.add(profile([[-0.034, 0.03], [-0.024, 0.03], [-0.024, -0.022], [-0.04, -0.024], [-0.048, 0.0, -0.044, 0.024]], 0.03, frameMat));
    g.add(profile([[-0.04, -0.024], [0.032, -0.02], [0.032, -0.028], [-0.02, -0.034], [-0.04, -0.034]], 0.022, frameMat));
    g.add(profile([[-0.044, 0.026], [-0.03, 0.03], [-0.03, 0.042], [-0.038, 0.044], [-0.046, 0.036]], 0.02, m.nickel, 0.001));
    const d = drum(m, { R: 0.0222, L: 0.044 });
    const star = alongZ(cyl(0.012, 0.012, 0.003, m.nickel, 6), -0.0235); d.cylinder.add(star);
    g.add(d.cylinder);
    const hammer = spurHammer(m, -0.04, 0.024); g.add(hammer);
    const trigger = guard(m, g, { mat: m.blued });
    // rounded grip with a lanyard ring
    g.add(profile([[-0.042, -0.024], [-0.026, -0.03], [-0.028, -0.07, -0.042, -0.1], [-0.07, -0.1], [-0.064, -0.06, -0.05, -0.03]], 0.022, frameMat));
    g.add(profile([[-0.04, -0.03], [-0.029, -0.034], [-0.031, -0.068, -0.044, -0.094], [-0.066, -0.094], [-0.06, -0.06, -0.047, -0.032]], 0.033, m.grip, 0.002));
    const ring = P.mesh(new THREE.TorusGeometry(0.006, 0.0014, 6, 14), m.nickel); ring.position.set(0, -0.106, -0.058); ring.rotation.y = Math.PI / 2; g.add(ring);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.205); g.add(muzzle);
    Models.parts.decorate(g, m, 'revolver', null);
    return { group: g, cylinder: d.cylinder, hammer, muzzle, chambers: d.chambers, rounds: d.rounds, trigger };
  }

  function m1911(m) {
    const { cyl, box, profile } = P;
    const g = new THREE.Group();
    // slide with serrations, ejection port, sights and the barrel bushing
    const slide = profile([[-0.078, 0.0], [0.124, 0.0], [0.124, 0.026], [0.118, 0.031], [-0.074, 0.031], [-0.078, 0.027]], 0.024, m.steel, 0.0015);
    g.add(slide);
    for (let i = 0; i < 7; i++) [-1, 1].forEach(sx => { const sr = box(0.001, 0.022, 0.0016, m.black, { cast: false }); sr.position.set(sx * 0.0126, 0.016, -0.07 + i * 0.003); g.add(sr); });
    const port = box(0.002, 0.009, 0.034, m.black, { cast: false }); port.position.set(0.0126, 0.021, 0.02); g.add(port);
    const rear = box(0.016, 0.006, 0.008, m.blued); rear.position.set(0, 0.034, -0.066); g.add(rear);
    g.add(profile([[0.108, 0.031], [0.118, 0.031], [0.116, 0.037], [0.11, 0.037]], 0.003, m.blued, 0));
    g.add(alongZ(cyl(0.0085, 0.0085, 0.004, m.nickel, 18), 0.124, 0.014));
    g.add(alongZ(cyl(0.0057, 0.0057, 0.003, m.black, 12, { cast: false }), 0.1265, 0.014));
    // frame: rails, dust cover, slide stop and thumb safety
    g.add(profile([[-0.07, 0.002], [0.02, 0.002], [0.09, 0.0], [0.09, -0.014], [0.03, -0.016], [-0.02, -0.014], [-0.07, -0.01]], 0.022, m.engraved));
    const stop = box(0.004, 0.006, 0.026, m.blued); stop.position.set(-0.0135, 0.0, 0.01); g.add(stop);
    const safety = box(0.004, 0.006, 0.014, m.blued); safety.position.set(-0.0135, 0.004, -0.058); g.add(safety);
    // square trigger guard and a flat trigger
    g.add(profile([[0.03, -0.014], [0.036, -0.014], [0.034, -0.04], [-0.02, -0.042], [-0.02, -0.036], [0.028, -0.034]], 0.008, m.engraved, 0.001));
    const trigger = box(0.007, 0.016, 0.005, m.brass); trigger.position.set(0, -0.022, 0.006); g.add(trigger);
    // grip frame, beavertail grip safety, checkered panels and the hammer
    g.add(profile([[-0.022, -0.014], [-0.072, -0.004], [-0.092, -0.104], [-0.046, -0.112]], 0.024, m.engraved));
    g.add(profile([[-0.074, -0.002], [-0.088, 0.008], [-0.092, 0.002], [-0.08, -0.014]], 0.022, m.engraved, 0.001));
    g.add(profile([[-0.03, -0.018], [-0.07, -0.01], [-0.088, -0.098], [-0.05, -0.104]], 0.031, m.grip, 0.0015));
    [-1, 1].forEach(sx => { const sc = alongX(cyl(0.0028, 0.0028, 0.002, m.nickel, 8), sx * 0.016, -0.035, -0.052); g.add(sc); });
    const hammer = new THREE.Group();
    hammer.add(profile([[-0.004, -0.006], [0.004, -0.006], [0.002, 0.01], [-0.01, 0.014], [-0.012, 0.008]], 0.007, m.blued, 0.001));
    hammer.position.set(0, 0.024, -0.076); g.add(hammer);
    const { mag, rounds } = magazine(m, 7, { w: 0.018, d: 0.03, h: 0.095, lean: 0.21, z: -0.062, y: 0.0, r: 0.0055, len: 0.03 });
    g.add(mag);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.014, 0.128); g.add(muzzle);
    Models.parts.decorate(g, m, 'revolver', null, { r: 0.0135, sy: 1.2, y: 0.016, z0: 0.0, len: 0.12, top: 0.07 });
    return { group: g, cylinder: blank(), hammer, muzzle, chambers: [], rounds, trigger, mag };
  }

  function mauser(m) {
    const { cyl, box, profile } = P;
    const g = new THREE.Group();
    // long thin barrel with a tangent rear sight and a blade front sight
    g.add(alongZ(cyl(0.0078, 0.0085, 0.145, m.blued, 22), 0.135, 0.012));
    g.add(alongZ(cyl(0.0042, 0.0042, 0.004, m.black, 12, { cast: false }), 0.207, 0.012));
    g.add(profile([[0.195, 0.019], [0.204, 0.019], [0.202, 0.027], [0.197, 0.027]], 0.003, m.blued, 0));
    g.add(profile([[0.04, 0.024], [0.07, 0.022], [0.07, 0.028], [0.044, 0.03]], 0.01, m.blued, 0.001));
    // milled frame with its side panels and the magazine well ahead of the trigger
    g.add(profile([[-0.075, 0.026], [0.064, 0.026], [0.064, -0.006], [-0.075, -0.006]], 0.024, m.engraved));
    [-1, 1].forEach(sx => { const panel = box(0.002, 0.018, 0.05, m.steel); panel.position.set(sx * 0.0125, 0.01, -0.02); g.add(panel); });
    g.add(profile([[0.008, -0.006], [0.052, -0.006], [0.05, -0.056], [0.012, -0.058]], 0.022, m.engraved));
    for (let i = 0; i < 4; i++) [-1, 1].forEach(sx => { const rib = box(0.002, 0.003, 0.034, m.black, { cast: false }); rib.position.set(sx * 0.0115, -0.016 - i * 0.01, 0.03); g.add(rib); });
    // knurled bolt and ring hammer at the back
    g.add(alongZ(cyl(0.0065, 0.0065, 0.016, m.nickel, 14), -0.08, 0.019));
    const hammer = new THREE.Group();
    const ringH = P.mesh(new THREE.TorusGeometry(0.0075, 0.0025, 8, 18), m.blued); ringH.rotation.y = Math.PI / 2; ringH.position.set(0, 0.012, -0.004); hammer.add(ringH);
    hammer.add(box(0.006, 0.012, 0.006, m.blued));
    hammer.position.set(0, 0.024, -0.078); g.add(hammer);
    // trigger guard behind the magazine
    const gd = P.mesh(new THREE.TorusGeometry(0.014, 0.0028, 8, 20, Math.PI), m.blued);
    gd.rotation.set(Math.PI, Math.PI / 2, 0); gd.position.set(0, -0.006, -0.008); gd.scale.set(1, 1.3, 1); g.add(gd);
    const trigger = box(0.005, 0.014, 0.004, m.blued); trigger.position.set(0, -0.012, -0.004); g.add(trigger);
    // the round "broomhandle" grip with grooves and a lanyard ring
    g.add(profile([[-0.03, -0.006], [-0.075, -0.004], [-0.098, -0.06, -0.09, -0.11], [-0.054, -0.114], [-0.05, -0.06, -0.034, -0.018]], 0.03, m.grip, 0.004));
    for (let i = 0; i < 9; i++) { const groove = box(0.031, 0.0016, 0.03, m.black, { cast: false }); groove.position.set(0, -0.022 - i * 0.009, -0.06 - i * 0.0025); g.add(groove); }
    const ring = P.mesh(new THREE.TorusGeometry(0.006, 0.0014, 6, 14), m.nickel); ring.position.set(0, -0.12, -0.075); ring.rotation.y = Math.PI / 2; g.add(ring);
    const { mag, rounds } = magazine(m, 6, { w: 0.016, d: 0.03, h: 0.045, lean: 0, z: 0.03, y: -0.004, r: 0.0045, len: 0.026 });
    g.add(mag);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.21); g.add(muzzle);
    Models.parts.decorate(g, m, 'revolver', null, { r: 0.0095, z0: 0.065, len: 0.14, top: 0.065 });
    return { group: g, cylinder: blank(), hammer, muzzle, chambers: [], rounds, trigger, mag };
  }

  function luger(m) {
    const { cyl, box, profile } = P;
    const g = new THREE.Group();
    // slim tapered barrel on a squared receiver
    g.add(alongZ(cyl(0.0068, 0.0082, 0.105, m.blued, 22), 0.105, 0.014));
    g.add(alongZ(cyl(0.004, 0.004, 0.004, m.black, 12, { cast: false }), 0.157, 0.014));
    g.add(profile([[0.146, 0.02], [0.154, 0.02], [0.152, 0.028], [0.148, 0.028]], 0.003, m.blued, 0));
    g.add(profile([[-0.022, 0.004], [0.054, 0.004], [0.054, 0.026], [-0.022, 0.026]], 0.02, m.steel));
    g.add(profile([[-0.07, 0.004], [0.06, 0.004], [0.06, -0.01], [-0.02, -0.012], [-0.07, -0.006]], 0.024, m.engraved));
    // the toggle: two links and knurled knobs; it snaps up when cocked
    const hammer = new THREE.Group();
    hammer.add(alongZ(cyl(0.0058, 0.0058, 0.044, m.steel, 14), 0.022));
    [-1, 1].forEach(sx => {
      const knob = alongX(cyl(0.0095, 0.0095, 0.006, m.nickel, 16), sx * 0.012, 0, 0.02);
      hammer.add(knob);
      for (let i = 0; i < 8; i++) { const k = box(0.0062, 0.0014, 0.0014, m.black, { cast: false }); const a = (i / 8) * Math.PI * 2; k.position.set(sx * 0.012, Math.sin(a) * 0.0095, 0.02 + Math.cos(a) * 0.0095); hammer.add(k); }
    });
    hammer.position.set(0, 0.02, -0.066); g.add(hammer);
    const rearSight = box(0.012, 0.005, 0.006, m.blued); rearSight.position.set(0, 0.03, -0.066); g.add(rearSight);
    // trigger guard, side plate and the steeply raked grip
    const trigger = guard(m, g, { z: 0.012, y: -0.012, r: 0.015, mat: m.engraved, sy: 1.1 });
    const plate = box(0.002, 0.012, 0.03, m.blued); plate.position.set(-0.0125, -0.002, 0.03); g.add(plate);
    g.add(profile([[-0.016, -0.008], [-0.068, -0.004], [-0.116, -0.094], [-0.07, -0.106]], 0.024, m.engraved));
    g.add(profile([[-0.022, -0.014], [-0.064, -0.01], [-0.106, -0.088], [-0.074, -0.098]], 0.032, m.grip, 0.0015));
    const safety = box(0.003, 0.016, 0.006, m.blued); safety.position.set(-0.014, -0.006, -0.06); safety.rotation.x = 0.4; g.add(safety);
    const { mag, rounds } = magazine(m, 8, { w: 0.016, d: 0.026, h: 0.09, lean: 0.55, z: -0.044, y: -0.012, r: 0.0042, len: 0.024 });
    g.add(mag);
    const button = alongZ(cyl(0.007, 0.007, 0.012, m.grip, 12), -0.026, -0.09); mag.add(button); button.position.set(0, -0.095, 0);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.014, 0.16); g.add(muzzle);
    Models.parts.decorate(g, m, 'revolver', null, { r: 0.009, y: 0.014, z0: 0.055, len: 0.1, top: 0.065 });
    return { group: g, cylinder: blank(), hammer, muzzle, chambers: [], rounds, trigger, mag };
  }

  // ---------- big-gun slot (the Gun card) ----------
  // Two shots, both live. After each shot the gun "opens": the cylinder
  // swings out, the bolt racks or the frizzen flips, and a spent case flies.

  // A double-action revolver scaled up, shared by the Python and the 500.
  function bigRevolver(m, skin, o) {
    const { cyl, box, profile } = P;
    const std = !skin || skin === 'standard';
    const g = new THREE.Group();
    const s = new THREE.Group(); g.add(s);   // built at revolver size, then scaled
    const by = 0.013, R = o.R, L = o.L;
    const barrelMat = o.matte && std ? finish('matte') : m.blued;
    s.add(alongZ(cyl(o.br, o.br, o.len, barrelMat, 28), 0.028 + o.len / 2, by));
    s.add(alongZ(cyl(o.br * 0.48, o.br * 0.48, 0.004, m.black, 14, { cast: false }), 0.028 + o.len + 0.001, by));
    // full-length underlug, top rib with vents (Python) or a ported compensator (500)
    s.add(profile([[0.026, by], [0.028 + o.len, by], [0.028 + o.len, by - o.br - 0.008], [0.03, by - o.br - 0.01]], o.br * 1.5, barrelMat));
    s.add(profile([[0.026, by + o.br - 0.002], [0.028 + o.len, by + o.br - 0.002], [0.028 + o.len, by + o.br + 0.006], [0.026, by + o.br + 0.006]], 0.008, barrelMat, 0.001));
    if (o.vents) for (let i = 0; i < 6; i++) { const v = box(0.0084, 0.005, 0.01, m.black, { cast: false }); v.position.set(0, by + o.br + 0.002, 0.05 + i * (o.len - 0.04) / 6); s.add(v); }
    if (o.comp) {
      const c = box(o.br * 2.3, o.br * 2.3, 0.04, barrelMat); c.position.set(0, by, 0.028 + o.len - 0.02); s.add(c);
      for (let i = 0; i < 4; i++) { const port = box(o.br * 1.4, 0.004, 0.005, m.black, { cast: false }); port.position.set(0, by + o.br * 1.16, 0.028 + o.len - 0.034 + i * 0.009); s.add(port); }
    }
    s.add(profile([[0.028 + o.len - 0.016, by + o.br + 0.006], [0.028 + o.len - 0.004, by + o.br + 0.006], [0.028 + o.len - 0.006, by + o.br + 0.016], [0.028 + o.len - 0.016, by + o.br + 0.012]], 0.004, m.brass, 0));
    // frame with a top strap and an adjustable rear sight
    const fm = m.engraved;
    s.add(profile([[0.022, by + o.br + 0.006], [0.03, by + o.br + 0.006], [0.03, -R - 0.002], [0.022, -R - 0.004]], R * 1.1, fm));
    s.add(profile([[-L / 2 - 0.008, R + 0.004], [0.03, R + 0.004], [0.03, R + 0.011], [-L / 2 - 0.01, R + 0.012]], 0.018, fm));
    s.add(profile([[-L / 2 - 0.014, R + 0.012], [-L / 2 - 0.004, R + 0.01], [-L / 2 - 0.004, -R], [-L / 2 - 0.022, -R - 0.002], [-L / 2 - 0.03, 0, -L / 2 - 0.026, R + 0.008]], R * 1.35, fm));
    s.add(profile([[-L / 2 - 0.022, -R - 0.002], [0.03, -R + 0.002], [0.03, -R - 0.008], [-0.02, -R - 0.014], [-L / 2 - 0.022, -R - 0.014]], R * 1.05, fm));
    const rs = box(0.014, 0.006, 0.01, m.blued); rs.position.set(0, R + 0.015, -L / 2 - 0.002); s.add(rs);
    const d = drum(m, { R, L, n: o.n, mat: m.steel });
    s.add(d.cylinder);
    const hammer = spurHammer(m, -L / 2 - 0.018, R + 0.002, 1.1); s.add(hammer);
    const trigger = guard(m, s, { z: -0.004, y: -R - 0.012, r: 0.016, mat: fm, sy: 1.1 });
    // grips: target walnut with finger grooves (Python), black rubber (500)
    const gripMat = o.rubber && std ? finish('rubber') : m.grip;
    const gz = -L / 2 - 0.018, gy = -R - 0.008;
    s.add(profile([[gz + 0.02, gy], [gz - 0.012, gy + 0.004], [gz - 0.03, gy - 0.07], [gz - 0.004, gy - 0.082], [gz + 0.008, gy - 0.07], [gz + 0.004, gy - 0.054], [gz + 0.012, gy - 0.04], [gz + 0.008, gy - 0.024], [gz + 0.016, gy - 0.01]], 0.036, gripMat, 0.003));
    s.scale.setScalar(o.scale);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, by, 0.03 + o.len); s.add(muzzle);
    Models.parts.decorate(s, m, 'shotgun', null, { r: o.br + 0.002, sy: 1, y: by, z0: 0.028, len: o.len, top: R + 0.05, w: R * 0.7, gz: gz - 0.004, gy: gy - 0.01 });
    const shells = d.rounds.slice(0, 2);
    const cylinder = d.cylinder;
    return {
      group: g, cylinder: blank(), hammer, muzzle, barrels: cylinder, shells, shotgun: true, trigger,
      open: t => { cylinder.position.x = -R * 1.6 * t; cylinder.rotation.z = 0.4 * t; },
    };
  }

  function python(m, skin) { return bigRevolver(m, skin, { R: 0.022, L: 0.046, n: 6, br: 0.0105, len: 0.15, vents: true, scale: 1.45 }); }
  function sw500(m, skin) { return bigRevolver(m, skin, { R: 0.027, L: 0.058, n: 5, br: 0.0135, len: 0.19, comp: true, matte: false, rubber: true, scale: 1.4 }); }

  function bmg(m, skin) {
    const { cyl, box, profile, sphere } = P;
    const std = !skin || skin === 'standard';
    const body = std ? finish('parkerized') : m.engraved;
    const dark = std ? finish('matte') : m.blued;
    const grip = std ? finish('rubber') : m.grip;
    const g = new THREE.Group();
    const by = 0.012;
    // upper and lower receiver, the top rail
    g.add(profile([[-0.13, 0.034], [0.2, 0.034], [0.2, -0.004], [0.06, -0.01], [-0.13, -0.012]], 0.046, body, 0.003));
    g.add(profile([[-0.11, -0.012], [0.06, -0.01], [0.06, -0.034], [-0.11, -0.03]], 0.044, body, 0.002));
    const rail = box(0.02, 0.008, 0.3, dark); rail.position.set(0, 0.038, 0.03); g.add(rail);
    for (let i = 0; i < 20; i++) { const sl = box(0.021, 0.003, 0.004, m.black, { cast: false }); sl.position.set(0, 0.041, -0.11 + i * 0.015); g.add(sl); }
    // fluted barrel, slotted handguard and a twin-chamber muzzle brake
    g.add(alongZ(cyl(0.0105, 0.012, 0.48, dark, 20), 0.44, by));
    g.add(profile([[0.2, 0.032], [0.4, 0.028], [0.4, -0.008], [0.2, -0.004]], 0.052, body, 0.003));
    for (let i = 0; i < 6; i++) [-1, 1].forEach(sx => { const sl = box(0.002, 0.012, 0.022, m.black, { cast: false }); sl.position.set(sx * 0.0265, 0.012, 0.22 + i * 0.03); g.add(sl); });
    const brake = box(0.042, 0.03, 0.062, dark); brake.position.set(0, by, 0.69); g.add(brake);
    [-1, 1].forEach(sx => [0, 1].forEach(k => { const port = box(0.002, 0.02, 0.02, m.black, { cast: false }); port.position.set(sx * 0.0215, by, 0.672 + k * 0.032); g.add(port); }));
    g.add(alongZ(cyl(0.007, 0.007, 0.004, m.black, 12, { cast: false }), 0.722, by));
    // scope in rings, with turrets and glass at both ends
    const sy = 0.074;
    g.add(alongZ(cyl(0.0145, 0.0145, 0.2, dark, 24), 0.03, sy));
    g.add(alongZ(cyl(0.022, 0.016, 0.05, dark, 24), 0.155, sy));
    g.add(alongZ(cyl(0.017, 0.0145, 0.04, dark, 24), -0.085, sy));
    const lens = finish('lens');
    g.add(alongZ(cyl(0.02, 0.02, 0.002, lens, 24, { cast: false }), 0.181, sy));
    g.add(alongZ(cyl(0.015, 0.015, 0.002, lens, 24, { cast: false }), -0.106, sy));
    const turret = cyl(0.008, 0.008, 0.016, dark, 14); turret.position.set(0, sy + 0.02, 0.03); g.add(turret);
    g.add(alongX(cyl(0.008, 0.008, 0.016, dark, 14), 0.02, sy, 0.03));
    [-0.03, 0.09].forEach(z => { const ring = P.mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 20), m.nickel); ring.position.set(0, sy, z); g.add(ring); const base = box(0.018, 0.024, 0.012, m.nickel); base.position.set(0, 0.052, z); g.add(base); });
    // carry handle, magazine, pistol grip, trigger and guard
    g.add(profile([[0.11, 0.034], [0.124, 0.06], [0.2, 0.06], [0.21, 0.034], [0.2, 0.034], [0.19, 0.052], [0.132, 0.052], [0.122, 0.034]], 0.012, dark, 0.001));
    const magBox = box(0.036, 0.07, 0.06, dark); magBox.position.set(0, -0.06, 0.03); magBox.rotation.x = 0.08; g.add(magBox);
    for (let i = 0; i < 3; i++) { const r = box(0.038, 0.003, 0.062, m.black, { cast: false }); r.position.set(0, -0.04 - i * 0.02, 0.03); g.add(r); }
    g.add(profile([[-0.03, -0.03], [-0.06, -0.03], [-0.09, -0.13], [-0.06, -0.135]], 0.03, grip, 0.003));
    const gd = P.mesh(new THREE.TorusGeometry(0.018, 0.003, 8, 20, Math.PI), dark); gd.rotation.set(Math.PI, Math.PI / 2, 0); gd.position.set(0, -0.032, -0.012); gd.scale.set(1, 1.2, 1); g.add(gd);
    const trigger = box(0.005, 0.016, 0.004, m.nickel); trigger.position.set(0, -0.04, -0.012); trigger.rotation.x = 0.3; g.add(trigger);
    // stock with a cheek rest, a monopod and a thick recoil pad
    g.add(profile([[-0.13, 0.034], [-0.42, 0.04], [-0.43, -0.09], [-0.36, -0.08], [-0.22, -0.03], [-0.13, -0.03]], 0.04, body, 0.004));
    g.add(profile([[-0.22, 0.04], [-0.38, 0.044], [-0.38, 0.06], [-0.24, 0.055]], 0.034, grip, 0.003));
    g.add(profile([[-0.43, 0.044], [-0.46, 0.044], [-0.46, -0.094], [-0.43, -0.094]], 0.046, finish('rubber'), 0.003));
    const mono = cyl(0.005, 0.005, 0.06, dark, 8); mono.position.set(0, -0.11, -0.33); g.add(mono);
    // folded bipod legs along the handguard
    [-1, 1].forEach(sx => { const leg = alongZ(cyl(0.0035, 0.0035, 0.24, dark, 8), 0.47, -0.01, sx * 0.012); leg.rotation.y = sx * 0.02; g.add(leg); const foot = sphere(0.006, finish('rubber')); foot.position.set(sx * 0.012, -0.01, 0.35); g.add(foot); });
    const yoke = box(0.04, 0.012, 0.02, dark); yoke.position.set(0, -0.006, 0.59); g.add(yoke);
    // charging handle on the right; two big cases waiting at the ejection port
    const handle = new THREE.Group();
    handle.add(box(0.02, 0.012, 0.016, m.nickel)); handle.position.set(0.032, 0.022, 0.12); g.add(handle);
    const port = box(0.002, 0.016, 0.05, m.black, { cast: false }); port.position.set(0.0235, 0.012, 0.06); g.add(port);
    const shells = [0, 1].map(k => { const sh = new THREE.Group(); sh.add(alongZ(cyl(0.008, 0.009, 0.06, m.ammo, 12), 0)); sh.add(alongZ(cyl(0.004, 0.008, 0.02, m.ammo, 12), 0.04)); sh.position.set(0.012 - k * 0.006, 0.012, 0.06); g.add(sh); return sh; });
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, by, 0.725); g.add(muzzle);
    Models.parts.decorate(g, m, 'shotgun', null, { r: 0.014, sy: 1, y: by, z0: 0.4, len: 0.28, top: 0.12, w: 0.024 });
    return {
      group: g, cylinder: blank(), hammer: blank(), muzzle, barrels: handle, shells, shotgun: true, trigger,
      open: t => { handle.position.z = 0.12 - 0.07 * t; },
    };
  }

  function blunderbuss(m, skin) {
    const { cyl, box, profile } = P;
    const std = !skin || skin === 'standard';
    const barrelMat = std ? m.brass : m.blued;
    const g = new THREE.Group();
    const by = 0.016;
    // brass barrel swelling into the bell mouth
    g.add(alongZ(cyl(0.017, 0.015, 0.4, barrelMat, 24), 0.22, by));
    const bell = P.mesh(new THREE.CylinderGeometry(0.046, 0.017, 0.1, 28, 1, true), barrelMat);
    bell.material = barrelMat; bell.rotation.x = Math.PI / 2; bell.position.set(0, by, 0.47); g.add(bell);
    const inside = P.mesh(new THREE.CylinderGeometry(0.044, 0.015, 0.098, 28, 1, true), m.black, { cast: false });
    inside.material = m.black.clone(); inside.material.side = THREE.BackSide; inside.rotation.x = Math.PI / 2; inside.position.copy(bell.position); g.add(inside);
    const lip = P.mesh(new THREE.TorusGeometry(0.046, 0.0035, 8, 32), barrelMat); lip.position.set(0, by, 0.52); g.add(lip);
    [0.08, 0.2, 0.32].forEach(z => { const band = P.mesh(new THREE.TorusGeometry(0.0165, 0.0022, 6, 20), m.brass); band.position.set(0, by, z); g.add(band); });
    // full walnut stock from the butt to under the barrel, brass furniture
    g.add(profile([[0.36, by - 0.012], [0.02, by - 0.018], [-0.04, by - 0.02], [-0.07, -0.03], [-0.12, -0.04], [-0.36, 0.0], [-0.37, -0.11], [-0.24, -0.08], [-0.13, -0.065], [-0.07, -0.06], [-0.03, -0.04], [0.02, -0.022], [0.36, -0.02]], 0.04, m.grip, 0.004));
    g.add(profile([[-0.36, 0.002], [-0.374, 0.002], [-0.384, -0.112], [-0.37, -0.112]], 0.044, m.brass, 0.002));
    g.add(profile([[0.02, -0.022], [0.026, -0.03], [0.0, -0.05], [-0.06, -0.064], [-0.064, -0.058], [-0.004, -0.044]], 0.008, m.brass, 0.001));
    const trigger = box(0.005, 0.016, 0.004, m.nickel); trigger.position.set(0, -0.034, -0.014); trigger.rotation.x = 0.3; g.add(trigger);
    g.add(alongZ(cyl(0.0035, 0.0035, 0.3, m.grip, 8), 0.2, -0.024));
    g.add(alongZ(cyl(0.0045, 0.0045, 0.012, m.brass, 8), 0.354, -0.024));
    // flintlock on the right: lock plate, pan, frizzen and the cock with its flint
    const lx = 0.021;
    const lock = profile([[-0.06, 0.02], [0.04, 0.022], [0.05, 0.008], [0.03, -0.004], [-0.06, 0.0]], 0.003, m.engraved, 0.001);
    lock.position.x = lx; g.add(lock);
    const pan = box(0.012, 0.004, 0.016, m.steel); pan.position.set(lx + 0.006, 0.024, 0.008); g.add(pan);
    const frizzen = new THREE.Group();
    const fz1 = box(0.012, 0.004, 0.016, m.steel); fz1.position.y = 0.002; frizzen.add(fz1);
    const fz2 = box(0.012, 0.028, 0.004, m.steel); fz2.position.set(0, 0.016, 0.006); frizzen.add(fz2);
    frizzen.position.set(lx + 0.006, 0.026, 0.002); g.add(frizzen);
    const hammer = new THREE.Group();
    hammer.add(profile([[-0.004, -0.004], [0.004, -0.004], [0.0, 0.02], [0.012, 0.032], [0.006, 0.036], [-0.008, 0.024]], 0.006, m.steel, 0.001));
    const flint = box(0.007, 0.006, 0.012, Models.mats().lead); flint.position.set(0, 0.032, 0.012); hammer.add(flint);
    hammer.position.set(lx + 0.006, 0.02, -0.03); g.add(hammer);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, by, 0.52); g.add(muzzle);
    Models.parts.decorate(g, m, 'shotgun', null, { r: 0.019, sy: 1, y: by, z0: 0.03, len: 0.36, top: 0.085, w: 0.024 });
    return {
      group: g, cylinder: blank(), hammer, muzzle, barrels: frizzen, shells: [], shotgun: true, trigger,
      open: t => { frizzen.rotation.x = 0.9 * t; },
    };
  }

  const BUILD = {
    revolver: { navy, schofield, m1911, mauser, luger },
    shotgun: { python, sw500, bmg, blunderbuss },
  };

  // Build a gun: kind 'revolver' | 'shotgun', a model from GUNS, a skin.
  function build(kind, model, skin) {
    P = P || Models.parts;
    const make = BUILD[kind][model];
    if (!make) return kind === 'shotgun' ? Models.shotgun(skin) : Models.revolver(skin);
    const gun = make(Models.gunLook(skin, kind), skin);
    gun.model = model;
    gun.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return gun;
  }

  return { build };
})();
