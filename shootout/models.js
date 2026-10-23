// Shootout — 3D models.
// Everything is built from simple shapes and canvas-painted textures, so the
// game has no model or image files to load. Units are metres.

const Models = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Hex colours are written as they look on screen; convert them for lighting.
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();

  // ---------- textures ----------

  function noise(g, w, h, base, spread, count, size) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const v = Math.floor(Math.random() * spread);
      g.fillStyle = `rgba(${v},${v},${v},0.06)`;
      const s = Math.random() * size;
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
  }

  const TEX = {};
  function tex() {
    if (TEX.ready) return TEX;
    TEX.plaster = Util.canvasTexture(512, 512, (g, w, h) => {
      noise(g, w, h, '#8f8f8b', 255, 4000, 6);
      // water stains
      for (let i = 0; i < 6; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 80;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(70,64,50,0.12)'); gr.addColorStop(1, 'rgba(70,64,50,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    }, { repeat: [3, 1.5] });

    TEX.planks = Util.canvasTexture(512, 512, (g, w, h) => {
      const rows = 8;
      for (let i = 0; i < rows; i++) {
        const shade = 70 + Math.random() * 25;
        g.fillStyle = `rgb(${shade + 12},${shade * 0.72},${shade * 0.48})`;
        g.fillRect(0, (i * h) / rows, w, h / rows);
        g.strokeStyle = 'rgba(30,18,10,0.25)';
        for (let k = 0; k < 14; k++) {
          g.beginPath();
          const y = (i * h) / rows + Math.random() * (h / rows);
          g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y + 1);
          g.stroke();
        }
        g.fillStyle = 'rgba(15,8,4,0.8)';
        g.fillRect(0, (i * h) / rows, w, 2);
        g.fillRect(Math.random() * w, (i * h) / rows, 2, h / rows);
      }
    }, { repeat: [4, 4] });

    TEX.wood = Util.canvasTexture(256, 512, (g, w, h) => {
      g.fillStyle = '#6a4226'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 60; k++) {
        g.strokeStyle = `rgba(${30 + Math.random() * 30},${15 + Math.random() * 15},5,${0.15 + Math.random() * 0.2})`;
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        const x = Math.random() * w;
        g.moveTo(x, 0); g.bezierCurveTo(x + 8, h * 0.3, x - 8, h * 0.6, x + 4, h);
        g.stroke();
      }
    });

    TEX.target = Util.canvasTexture(512, 512, (g, w, h) => {
      const rings = ['#e8dcc4', '#8b1a1a', '#e8dcc4', '#8b1a1a', '#e8dcc4', '#8b1a1a'];
      rings.forEach((c, i) => {
        g.beginPath(); g.arc(w / 2, h / 2, (w / 2) * (1 - i / rings.length), 0, Math.PI * 2);
        g.fillStyle = c; g.fill();
      });
    });

    TEX.blood = [0, 1, 2, 3].map(seed => Util.canvasTexture(256, 256, (g, w, h) => {
      const r = Util.rng(seed * 977 + 13);
      g.clearRect(0, 0, w, h);
      const col = `rgba(${95 + r() * 40},0,0,0.92)`;
      g.fillStyle = col;
      g.beginPath(); g.arc(w / 2, h / 2, 30 + r() * 20, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2, d = 30 + r() * 90;
        g.beginPath(); g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 2 + r() * 9, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 4; i++) {   // drips
        const x = w / 2 + (r() - 0.5) * 60;
        g.fillRect(x, h / 2, 4 + r() * 3, 40 + r() * 80);
      }
    }, {}));

    TEX.pool = Util.canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(70,0,0,0.95)'); gr.addColorStop(0.7, 'rgba(90,0,0,0.85)'); gr.addColorStop(1, 'rgba(90,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2.6, 0.3, 0, Math.PI * 2); g.fill();
    });

    TEX.crack = Util.canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(20,20,20,0.75)'; g.lineWidth = 2;
      const branch = (x, y, a, len, depth) => {
        if (depth > 4 || len < 6) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        branch(x2, y2, a + (Math.random() - 0.5) * 1.2, len * 0.75, depth + 1);
        if (Math.random() < 0.5) branch(x2, y2, a + (Math.random() - 0.5) * 2, len * 0.5, depth + 1);
      };
      for (let i = 0; i < 4; i++) branch(w / 2, h / 2, Math.random() * Math.PI * 2, 40, 0);
    });

    TEX.cardBack = Util.canvasTexture(256, 360, (g, w, h) => {
      g.fillStyle = '#3a0808'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6a1414'; g.lineWidth = 8;
      for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
      g.strokeStyle = '#c8a050'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#c8a050'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center';
      g.fillText('✦', w / 2, h / 2 + 12);
    });

    TEX.ready = true;
    return TEX;
  }

  // Painted card artwork. Returns false for cards that just show their number.
  function drawIcon(g, id, x, y, ink, dark) {
    g.save();
    g.translate(x, y);
    g.fillStyle = ink; g.strokeStyle = ink; g.lineJoin = 'round'; g.lineCap = 'round';
    const red = '#8a0a0a';
    switch (id) {
      case 'jack': {   // crown over a gold J
        g.fillStyle = '#c8a040';
        g.beginPath(); g.moveTo(-50, -20); g.lineTo(-50, -70); g.lineTo(-25, -45); g.lineTo(0, -80); g.lineTo(25, -45); g.lineTo(50, -70); g.lineTo(50, -20); g.closePath(); g.fill();
        g.fillStyle = ink; g.font = 'bold 110px Georgia, serif'; g.textAlign = 'center'; g.fillText('J', 0, 70);
        break;
      }
      case 'bloody': {   // blood drop with a dripping trail
        g.fillStyle = '#c01810';
        g.beginPath(); g.moveTo(0, -75); g.bezierCurveTo(30, -25, 50, 5, 50, 30); g.arc(0, 30, 50, 0, Math.PI); g.bezierCurveTo(-50, 5, -30, -25, 0, -75); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-18, 25, 8, 18, 0.4, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'gun': {   // revolver silhouette
        g.fillRect(-55, -30, 110, 16);          // barrel
        g.fillRect(-55, -14, 80, 8);            // ejector rod
        g.fillRect(-60, -36, 6, 8);             // front sight
        g.beginPath(); g.ellipse(35, -16, 22, 18, 0, 0, Math.PI * 2); g.fill();   // cylinder
        g.beginPath(); g.moveTo(45, -34); g.lineTo(72, -40); g.lineTo(70, -30); g.lineTo(55, -22); g.fill();  // hammer
        g.beginPath(); g.moveTo(42, -2); g.lineTo(72, -6); g.lineTo(80, 60); g.lineTo(50, 66); g.closePath(); g.fill();  // grip
        g.lineWidth = 6; g.beginPath(); g.arc(28, 12, 16, 0, Math.PI); g.stroke();  // guard
        break;
      }
      case 'grenade': {
        g.beginPath(); g.ellipse(0, 20, 45, 55, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = dark ? '#000' : '#d8c49c'; g.lineWidth = 4;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-45, 20 + i * 25); g.lineTo(45, 20 + i * 25); g.stroke(); }
        g.fillStyle = ink; g.fillRect(-16, -48, 32, 18);
        g.beginPath(); g.moveTo(14, -46); g.lineTo(40, -70); g.lineTo(46, -62); g.lineTo(20, -36); g.fill();   // lever
        g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.arc(-28, -54, 12, 0, Math.PI * 2); g.stroke();  // pin ring
        break;
      }
      case 'nuclear': {   // radiation trefoil
        g.fillStyle = '#e8c030';
        g.beginPath(); g.arc(0, 0, 72, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111';
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 62, a - 0.52, a + 0.52); g.closePath(); g.fill();
        }
        g.fillStyle = '#e8c030'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'block': {   // shield
        g.beginPath(); g.moveTo(0, -70); g.lineTo(55, -50); g.bezierCurveTo(55, 20, 30, 55, 0, 75); g.bezierCurveTo(-30, 55, -55, 20, -55, -50); g.closePath(); g.fill();
        g.strokeStyle = dark ? '#000' : '#d8c49c'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(0, -55); g.lineTo(0, 58); g.moveTo(-40, -15); g.lineTo(40, -15); g.stroke();
        break;
      }
      case 'reverse': {   // two chasing arrows
        g.lineWidth = 12;
        g.beginPath(); g.arc(0, 0, 50, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        g.beginPath(); g.arc(0, 0, 50, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
        const head = (a, flip) => {
          const px = Math.cos(a) * 50, py = Math.sin(a) * 50;
          g.save(); g.translate(px, py); g.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
          g.beginPath(); g.moveTo(-16, -6); g.lineTo(16, -6); g.lineTo(0, 18); g.closePath(); g.fill(); g.restore();
        };
        head(Math.PI * 1.9, false); head(Math.PI * 0.9, false);
        break;
      }
      default: g.restore(); return false;
    }
    g.restore();
    return true;
  }

  // Card faces are drawn once per card type.
  const faceCache = {};
  function cardFace(id) {
    if (faceCache[id]) return faceCache[id];
    const c = CARD_BY_ID[id];
    const dark = c.style.includes('dark'), red = c.style.includes('red');
    faceCache[id] = Util.canvasTexture(256, 360, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      if (dark) { gr.addColorStop(0, '#2a2a2a'); gr.addColorStop(1, '#0e0e0e'); }
      else { gr.addColorStop(0, '#f5ead2'); gr.addColorStop(1, '#d8c49c'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = dark ? '#000' : '#3a2410'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      g.strokeStyle = id === 'jack' ? '#c8a040' : (dark ? '#555' : '#8a6a40'); g.lineWidth = 2; g.strokeRect(16, 16, w - 32, h - 32);
      const ink = red ? (dark ? '#ff4a3a' : '#8a0a0a') : (dark ? '#e8d8b8' : '#2a1a0a');
      g.fillStyle = ink; g.textAlign = 'left';
      g.font = 'bold 30px Georgia, serif'; g.fillText(c.corner, 24, 50);
      g.textAlign = 'center';
      if (!drawIcon(g, id, w / 2, h / 2 - 6, ink, dark)) {
        g.font = 'bold 130px Georgia, serif';
        g.fillText(c.icon, w / 2, h / 2 + 40);
      }
      g.font = 'bold 26px Georgia, serif';
      const words = c.name.toUpperCase().split(' ');
      const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [words.join(' ')];
      lines.forEach((ln, i) => g.fillText(ln, w / 2, h - 52 + i * 28 - (lines.length - 1) * 14));
    });
    return faceCache[id];
  }

  // ---------- materials ----------

  const M = {};
  function mats() {
    if (M.ready) return M;
    const t = tex();
    M.steel = new THREE.MeshStandardMaterial({ color: col(0x2a2c30), metalness: 0.85, roughness: 0.35 });
    M.blued = new THREE.MeshStandardMaterial({ color: col(0x1a1d24), metalness: 0.9, roughness: 0.3 });
    M.brass = new THREE.MeshStandardMaterial({ color: col(0xc8963c), metalness: 0.9, roughness: 0.3 });
    M.lead = new THREE.MeshStandardMaterial({ color: col(0x6a6a70), metalness: 0.6, roughness: 0.5 });
    M.grip = new THREE.MeshStandardMaterial({ map: t.wood, color: col(0x9a6038), roughness: 0.55 });
    M.wood = new THREE.MeshStandardMaterial({ map: t.wood, roughness: 0.75 });
    M.darkWood = new THREE.MeshStandardMaterial({ map: t.wood, color: col(0x7a5a48), roughness: 0.8 });
    M.wall = new THREE.MeshStandardMaterial({ map: t.plaster, roughness: 0.95 });
    M.floor = new THREE.MeshStandardMaterial({ map: t.planks, roughness: 0.85 });
    M.ceiling = new THREE.MeshStandardMaterial({ color: col(0x4a4a48), roughness: 1 });
    M.paper = new THREE.MeshStandardMaterial({ color: col(0xd8d0bc), roughness: 0.9 });
    M.skin = new THREE.MeshStandardMaterial({ color: col(0x8a6a52), roughness: 0.8 });
    M.black = new THREE.MeshStandardMaterial({ color: col(0x050505), roughness: 1 });
    M.cardBack = new THREE.MeshStandardMaterial({ map: t.cardBack, roughness: 0.6 });
    M.cardEdge = new THREE.MeshStandardMaterial({ color: col(0xd8c8a0), roughness: 0.8 });
    M.ready = true;
    return M;
  }

  function mesh(geo, mat, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
  const box = (w, h, d, mat, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, o);
  const cyl = (rt, rb, h, mat, seg = 16, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, o);
  const sphere = (r, mat, o) => mesh(new THREE.SphereGeometry(r, 20, 14), mat, o);

  // ---------- revolver ----------
  // Barrel points along +Z, grip hangs down -Y, origin at the cylinder.
  // Returns { group, cylinder, hammer, muzzle, chambers, rounds }.
  function revolver() {
    const m = mats();
    const g = new THREE.Group();

    const barrel = cyl(0.011, 0.012, 0.17, m.blued, 20);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.012, 0.11); g.add(barrel);
    const bore = cyl(0.005, 0.005, 0.002, m.black, 12, { cast: false });
    bore.rotation.x = Math.PI / 2; bore.position.set(0, 0.012, 0.196); g.add(bore);
    const rod = cyl(0.006, 0.006, 0.12, m.steel, 12);
    rod.rotation.x = Math.PI / 2; rod.position.set(0, -0.006, 0.085); g.add(rod);
    const sight = box(0.004, 0.01, 0.012, m.blued); sight.position.set(0, 0.026, 0.185); g.add(sight);
    const frame = box(0.026, 0.05, 0.075, m.steel); frame.position.set(0, 0, -0.005); g.add(frame);
    const strap = box(0.02, 0.008, 0.08, m.blued); strap.position.set(0, 0.03, 0.0); g.add(strap);

    // Cylinder with six chambers; each chamber can show a round.
    const cylinder = new THREE.Group();
    const drum = cyl(0.023, 0.023, 0.046, m.steel, 24);
    drum.rotation.x = Math.PI / 2; cylinder.add(drum);
    const chambers = [], rounds = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const hole = cyl(0.0048, 0.0048, 0.047, m.black, 10, { cast: false });
      hole.rotation.x = Math.PI / 2;
      hole.position.set(Math.cos(a) * 0.0135, Math.sin(a) * 0.0135, 0);
      cylinder.add(hole);
      chambers.push(hole);
      const round = cyl(0.0042, 0.0042, 0.006, m.brass, 10, { cast: false });
      round.rotation.x = Math.PI / 2;
      round.position.set(Math.cos(a) * 0.0135, Math.sin(a) * 0.0135, -0.021);
      cylinder.add(round);
      rounds.push(round);
    }
    cylinder.position.set(0, 0.0, 0.0);
    g.add(cylinder);

    const hammer = new THREE.Group();
    const hm = box(0.008, 0.028, 0.012, m.blued); hm.position.set(0, 0.012, -0.004); hammer.add(hm);
    const spur = box(0.01, 0.006, 0.016, m.blued); spur.position.set(0, 0.026, -0.012); hammer.add(spur);
    hammer.position.set(0, 0.022, -0.042);
    g.add(hammer);

    const guard = mesh(new THREE.TorusGeometry(0.017, 0.003, 6, 18, Math.PI), m.steel);
    guard.rotation.set(Math.PI, Math.PI / 2, 0); guard.position.set(0, -0.027, -0.004); g.add(guard);
    const trigger = box(0.004, 0.018, 0.005, m.steel); trigger.position.set(0, -0.032, -0.004); trigger.rotation.x = 0.35; g.add(trigger);

    const grip = box(0.028, 0.09, 0.036, m.grip); grip.position.set(0, -0.06, -0.052); grip.rotation.x = 0.38; g.add(grip);
    const cap = box(0.03, 0.01, 0.04, m.steel); cap.position.set(0, -0.102, -0.068); cap.rotation.x = 0.38; g.add(cap);

    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.2); g.add(muzzle);
    return { group: g, cylinder, hammer, muzzle, chambers, rounds };
  }

  // ---------- card ----------
  // A thin card standing in the XY plane, face toward +Z.
  const CARD_W = 0.14, CARD_H = 0.196;
  function card(id) {
    const m = mats();
    const g = new THREE.Group();
    const face = mesh(new THREE.PlaneGeometry(CARD_W, CARD_H),
      id ? new THREE.MeshStandardMaterial({ map: cardFace(id), roughness: 0.55 }) : m.cardBack, { cast: false });
    face.position.z = 0.0011;
    const back = mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), m.cardBack, { cast: false });
    back.rotation.y = Math.PI; back.position.z = -0.0011;
    const edge = box(CARD_W, CARD_H, 0.002, m.cardEdge);
    edge.scale.set(0.995, 0.995, 1);
    g.add(edge, face, back);
    g.userData.face = face;
    return g;
  }
  function setCardFace(cardGroup, id) {
    cardGroup.userData.face.material = id
      ? new THREE.MeshStandardMaterial({ map: cardFace(id), roughness: 0.55 })
      : mats().cardBack;
  }

  // ---------- outlaw ----------
  // Seated figure facing +Z. Returns the rig: root, spine, head, hat, arms.
  function outlaw(palette = {}) {
    const m = mats();
    const coat = new THREE.MeshStandardMaterial({ color: col(palette.coat || 0x3a2c22), roughness: 0.9 });
    const shirt = new THREE.MeshStandardMaterial({ color: col(palette.shirt || 0x8a7a60), roughness: 0.9 });
    const hatMat = new THREE.MeshStandardMaterial({ color: col(palette.hat || 0x2a1c12), roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: col(0x2a2620), roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: col(palette.skin || 0x8a6a52), roughness: 0.8 });

    const root = new THREE.Group();

    // legs (seated)
    [-0.1, 0.1].forEach(x => {
      const thigh = box(0.13, 0.13, 0.42, pants); thigh.position.set(x, 0.52, 0.17); root.add(thigh);
      const shin = box(0.11, 0.48, 0.12, pants); shin.position.set(x, 0.26, 0.36); root.add(shin);
      const boot = box(0.12, 0.08, 0.24, m.black); boot.position.set(x, 0.04, 0.41); root.add(boot);
    });

    // spine pivots at the hips so the body can lean and slump
    const spine = new THREE.Group(); spine.position.set(0, 0.56, 0); root.add(spine);
    const torso = cyl(0.2, 0.17, 0.56, coat, 16); torso.position.y = 0.28; torso.scale.z = 0.65; spine.add(torso);
    const vest = box(0.18, 0.4, 0.05, shirt); vest.position.set(0, 0.32, 0.115); spine.add(vest);
    const shoulders = cyl(0.07, 0.07, 0.46, coat, 12); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 0.52; spine.add(shoulders);
    const neck = cyl(0.05, 0.055, 0.08, skin, 12); neck.position.y = 0.6; spine.add(neck);
    const scarf = mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 16), new THREE.MeshStandardMaterial({ color: col(palette.scarf || 0x6a1a14), roughness: 0.9 }));
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.58; spine.add(scarf);

    // head pivots at the neck
    const head = new THREE.Group(); head.position.set(0, 0.64, 0); spine.add(head);
    const skull = sphere(0.105, skin); skull.position.y = 0.1; skull.scale.set(0.9, 1.08, 0.95); head.add(skull);
    const jaw = box(0.12, 0.06, 0.1, skin); jaw.position.set(0, 0.03, 0.02); head.add(jaw);
    const nose = box(0.024, 0.04, 0.03, skin); nose.position.set(0, 0.09, 0.1); head.add(nose);
    const beard = box(0.15, 0.06, 0.08, new THREE.MeshStandardMaterial({ color: col(palette.beard || 0x2a1a10), roughness: 1 }));
    beard.position.set(0, 0.025, 0.05); beard.visible = palette.beard !== null; head.add(beard);
    const eyeMat = new THREE.MeshStandardMaterial({ color: col(0x111111), emissive: col(0x000000), roughness: 0.4 });
    const eyes = [-0.035, 0.035].map(x => { const e = sphere(0.012, eyeMat, { cast: false }); e.position.set(x, 0.11, 0.088); head.add(e); return e; });

    const hat = new THREE.Group(); hat.position.set(0, 0.19, 0); head.add(hat);
    const brim = cyl(0.21, 0.21, 0.012, hatMat, 28); hat.add(brim);
    const crown = cyl(0.1, 0.115, 0.13, hatMat, 20); crown.position.y = 0.07; hat.add(crown);
    const dent = box(0.03, 0.02, 0.16, hatMat); dent.position.y = 0.138; hat.add(dent);
    const band = cyl(0.117, 0.117, 0.025, new THREE.MeshStandardMaterial({ color: col(0x0a0a0a) }), 20); band.position.y = 0.022; hat.add(band);

    // arms: shoulder -> elbow -> hand; the right hand holds the revolver
    function arm(side) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.22, 0.5, 0); spine.add(shoulder);
      const upper = cyl(0.055, 0.05, 0.3, coat, 10); upper.position.y = -0.15; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
      const fore = cyl(0.048, 0.042, 0.27, coat, 10); fore.position.y = -0.135; elbow.add(fore);
      const hand = new THREE.Group(); hand.position.y = -0.29; elbow.add(hand);
      const palm = box(0.07, 0.08, 0.04, skin); hand.add(palm);
      return { shoulder, elbow, hand, L1: 0.3, L2: 0.29 };
    }
    const rArm = arm(-1), lArm = arm(1);

    const gun = revolver();
    gun.group.rotation.x = Math.PI / 2;          // barrel follows the forearm
    gun.group.position.set(0, -0.04, 0.0);
    gun.group.scale.setScalar(1.25);
    rArm.hand.add(gun.group);

    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { root, spine, head, hat, rArm, lArm, gun, eyes, eyeMat, torso };
  }

  // ---------- furniture ----------

  function table(len = 3.4, width = 1.2, height = 0.78) {
    const m = mats();
    const g = new THREE.Group();
    const top = box(width, 0.06, len, m.wood); top.position.y = height - 0.03; g.add(top);
    const apron = box(width - 0.1, 0.1, len - 0.1, m.darkWood); apron.position.y = height - 0.11; g.add(apron);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = box(0.08, height - 0.06, 0.08, m.darkWood);
      leg.position.set(sx * (width / 2 - 0.08), (height - 0.06) / 2, sz * (len / 2 - 0.1));
      g.add(leg);
    });
    g.userData.height = height;
    return g;
  }

  function chair() {
    const m = mats();
    const g = new THREE.Group();
    const seat = box(0.46, 0.05, 0.44, m.darkWood); seat.position.y = 0.47; g.add(seat);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = box(0.04, 0.47, 0.04, m.darkWood); leg.position.set(sx * 0.2, 0.235, sz * 0.19); g.add(leg);
    });
    [-1, 1].forEach(sx => { const post = box(0.04, 0.55, 0.04, m.darkWood); post.position.set(sx * 0.2, 0.75, -0.2); g.add(post); });
    for (let i = 0; i < 3; i++) { const slat = box(0.4, 0.05, 0.025, m.darkWood); slat.position.set(0, 0.62 + i * 0.16, -0.2); g.add(slat); }
    return g;
  }

  // Returns { group, books } — books can be knocked to the floor.
  function bookshelf(seed) {
    const m = mats();
    const r = Util.rng(seed);
    const g = new THREE.Group();
    const W = 1.1, H = 2.0, D = 0.35;
    const sideL = box(0.04, H, D, m.darkWood); sideL.position.set(-W / 2, H / 2, 0); g.add(sideL);
    const sideR = sideL.clone(); sideR.position.x = W / 2; g.add(sideR);
    const backP = box(W, H, 0.02, m.darkWood); backP.position.set(0, H / 2, -D / 2); g.add(backP);
    const books = [];
    const colors = [0x5a1f1f, 0x2a3a4a, 0x3a4a2a, 0x6a5a3a, 0x4a2a4a, 0x7a6a50];
    for (let s = 0; s < 5; s++) {
      const y = 0.04 + s * 0.47;
      const shelf = box(W, 0.03, D, m.darkWood); shelf.position.set(0, y, 0); g.add(shelf);
      if (s === 4) break;
      let x = -W / 2 + 0.05;
      while (x < W / 2 - 0.08) {
        const bw = 0.03 + r() * 0.04, bh = 0.24 + r() * 0.14;
        const mat = new THREE.MeshStandardMaterial({ color: col(colors[Math.floor(r() * colors.length)]), roughness: 0.9 });
        const b = box(bw, bh, 0.22, mat);
        b.position.set(x + bw / 2, y + 0.015 + bh / 2, 0.02);
        b.userData.home = b.position.clone();
        b.userData.fall = r();
        g.add(b); books.push(b);
        x += bw + 0.004;
      }
    }
    return { group: g, books };
  }

  function desk() {
    const m = mats();
    const g = new THREE.Group();
    const top = box(1.2, 0.05, 0.6, m.wood); top.position.y = 0.76; g.add(top);
    const drawers = box(0.4, 0.7, 0.55, m.darkWood); drawers.position.set(-0.38, 0.38, 0); g.add(drawers);
    for (let i = 0; i < 3; i++) {
      const knob = sphere(0.015, m.brass); knob.position.set(-0.38, 0.6 - i * 0.22, 0.28); g.add(knob);
      const line = box(0.38, 0.005, 0.005, m.black); line.position.set(-0.38, 0.5 - i * 0.22, 0.278); g.add(line);
    }
    [[0.55, -0.25], [0.55, 0.25]].forEach(([x, z]) => { const leg = box(0.05, 0.74, 0.05, m.darkWood); leg.position.set(x, 0.37, z); g.add(leg); });
    const papers = box(0.25, 0.02, 0.32, m.paper); papers.position.set(0.25, 0.795, 0); papers.rotation.y = 0.1; g.add(papers);
    const lampBase = cyl(0.06, 0.08, 0.02, m.brass); lampBase.position.set(-0.4, 0.795, -0.1); g.add(lampBase);
    const lampPole = cyl(0.008, 0.008, 0.3, m.brass); lampPole.position.set(-0.4, 0.94, -0.1); g.add(lampPole);
    const lampShade = cyl(0.04, 0.11, 0.12, new THREE.MeshStandardMaterial({ color: col(0x5a6a3a), roughness: 0.6, side: THREE.DoubleSide }), 16);
    lampShade.position.set(-0.4, 1.1, -0.1); g.add(lampShade);
    g.userData.papers = papers;
    return g;
  }

  // Door in a frame; door.userData.panel swings open around its hinge.
  function door() {
    const m = mats();
    const g = new THREE.Group();
    const H = 2.15, W = 0.95;
    const frameMat = m.darkWood;
    const jL = box(0.08, H, 0.14, frameMat); jL.position.set(-W / 2 - 0.04, H / 2, 0); g.add(jL);
    const jR = jL.clone(); jR.position.x = W / 2 + 0.04; g.add(jR);
    const head = box(W + 0.16, 0.08, 0.14, frameMat); head.position.set(0, H + 0.04, 0); g.add(head);
    const dark = box(W, H, 0.02, m.black, { cast: false }); dark.position.set(0, H / 2, -0.05); g.add(dark);
    const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, 0); g.add(hinge);
    const panel = box(W - 0.01, H - 0.01, 0.045, m.wood); panel.position.set(W / 2, H / 2, 0); hinge.add(panel);
    for (let i = 0; i < 2; i++) {
      const inset = box(W - 0.25, H * 0.35, 0.01, m.darkWood); inset.position.set(W / 2, H * (0.28 + i * 0.45), 0.027); hinge.add(inset);
    }
    const knob = sphere(0.03, m.brass); knob.position.set(W - 0.1, 1.0, 0.05); hinge.add(knob);
    g.userData.hinge = hinge;
    return g;
  }

  function pictureFrame() {
    const m = mats();
    const g = new THREE.Group();
    const frame = box(0.8, 0.6, 0.04, m.darkWood); g.add(frame);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.48), new THREE.MeshStandardMaterial({
      map: Util.canvasTexture(256, 180, (c, w, h) => {
        const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#c89a5a'); sky.addColorStop(1, '#e8c890');
        c.fillStyle = sky; c.fillRect(0, 0, w, h);
        c.fillStyle = '#6a3a1a';
        c.beginPath(); c.moveTo(0, h); c.lineTo(40, 110); c.lineTo(90, 130); c.lineTo(150, 80); c.lineTo(210, 120); c.lineTo(w, 100); c.lineTo(w, h); c.fill();
        c.fillStyle = '#f0d070'; c.beginPath(); c.arc(190, 50, 18, 0, Math.PI * 2); c.fill();
      }), roughness: 0.8,
    }));
    art.position.z = 0.021; g.add(art);
    return g;
  }

  // Hanging lamp; returns { group, light, bulb, swing } where swing is the pivot.
  function hangingLamp() {
    const m = mats();
    const swing = new THREE.Group();
    const cord = cyl(0.006, 0.006, 0.9, m.black, 6); cord.position.y = -0.45; swing.add(cord);
    const shade = mesh(new THREE.ConeGeometry(0.26, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: col(0x1e2a1e), metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.y = -0.98; swing.add(shade);
    const bulbMat = new THREE.MeshStandardMaterial({ color: col(0xffeecc), emissive: col(0xffd890), emissiveIntensity: 2 });
    const bulb = sphere(0.045, bulbMat, { cast: false }); bulb.position.y = -1.04; swing.add(bulb);
    const light = new THREE.PointLight(0xffd8a0, 2.2, 9, 1.6);
    light.position.y = -1.06;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002;
    swing.add(light);
    return { group: swing, light, bulb, bulbMat };
  }

  function target() {
    const m = mats();
    const g = new THREE.Group();
    const post = box(0.1, 1.4, 0.08, m.darkWood); post.position.set(0, -0.9, -0.08); g.add(post);
    const disc = cyl(0.45, 0.45, 0.06, m.wood, 40); disc.rotation.x = Math.PI / 2; g.add(disc);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.44, 48), new THREE.MeshStandardMaterial({ map: tex().target, roughness: 0.9 }));
    face.position.z = 0.031; g.add(face);
    g.userData.face = face;
    return g;
  }

  function bullet() {
    const m = mats();
    const g = new THREE.Group();
    const casing = cyl(0.0057, 0.0057, 0.012, m.brass, 16); casing.rotation.x = Math.PI / 2; g.add(casing);
    const tip = mesh(new THREE.SphereGeometry(0.0057, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.lead);
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.006; g.add(tip);
    return g;
  }

  // A flat decal (blood, cracks) lying on a surface. Starts invisible.
  function decal(texture, size) {
    const mat = new THREE.MeshStandardMaterial({
      map: texture, transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.4,
    });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    d.receiveShadow = true;
    return d;
  }


  // ---------- shotgun ----------
  // Double-barrel coach gun. Same layout as the revolver: barrels along +Z,
  // grip hangs down -Y, so it fits the same hand and aiming code.
  function shotgun() {
    const m = mats();
    const g = new THREE.Group();
    [-0.013, 0.013].forEach(x => {
      const b = cyl(0.012, 0.012, 0.46, m.blued, 16);
      b.rotation.x = Math.PI / 2; b.position.set(x, 0.012, 0.27); g.add(b);
      const bore = cyl(0.008, 0.008, 0.002, m.black, 12, { cast: false });
      bore.rotation.x = Math.PI / 2; bore.position.set(x, 0.012, 0.501); g.add(bore);
    });
    const rib = box(0.006, 0.006, 0.44, m.steel); rib.position.set(0, 0.026, 0.27); g.add(rib);
    const fore = box(0.04, 0.026, 0.16, m.grip); fore.position.set(0, -0.006, 0.17); g.add(fore);
    const action = box(0.044, 0.05, 0.08, m.steel); action.position.set(0, 0.0, 0.0); g.add(action);
    const hammers = new THREE.Group();
    [-0.012, 0.012].forEach(x => { const h = box(0.006, 0.022, 0.01, m.blued); h.position.set(x, 0.03, -0.03); hammers.add(h); });
    g.add(hammers);
    const guard = mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 18, Math.PI), m.steel);
    guard.rotation.set(Math.PI, Math.PI / 2, 0); guard.position.set(0, -0.028, -0.02); g.add(guard);
    const stock = box(0.038, 0.06, 0.26, m.grip); stock.position.set(0, -0.04, -0.15); stock.rotation.x = 0.22; g.add(stock);
    const butt = box(0.042, 0.075, 0.012, m.black); butt.position.set(0, -0.07, -0.28); butt.rotation.x = 0.22; g.add(butt);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.51); g.add(muzzle);
    // the hand code expects a cylinder and hammer; give it harmless stand-ins
    const cylinder = new THREE.Group(); g.add(cylinder);
    return { group: g, cylinder, hammer: hammers, muzzle, chambers: [], rounds: [], shotgun: true };
  }

  // ---------- items ----------

  // Wooden crate with iron bands; userData.lid swings open at the back hinge.
  function crate() {
    const m = mats();
    const g = new THREE.Group();
    const W = 0.34, H = 0.2, D = 0.24;
    const body = box(W, H, D, m.darkWood); body.position.y = H / 2; g.add(body);
    for (let i = 0; i < 3; i++) {
      const plank = box(W + 0.004, 0.006, D + 0.004, m.black); plank.position.y = 0.04 + i * 0.065; g.add(plank);
    }
    [-1, 1].forEach(sx => { const band = box(0.02, H + 0.004, D + 0.006, m.steel); band.position.set(sx * (W / 2 - 0.04), H / 2, 0); g.add(band); });
    const hinge = new THREE.Group(); hinge.position.set(0, H, -D / 2); g.add(hinge);
    const lid = box(W + 0.01, 0.03, D + 0.01, m.wood); lid.position.set(0, 0.015, D / 2); hinge.add(lid);
    const lock = box(0.04, 0.05, 0.012, m.brass); lock.position.set(0, -0.01, D + 0.008); hinge.add(lock);
    const glow = new THREE.PointLight(0xffd080, 0, 0.8); glow.position.set(0, H - 0.02, 0); g.add(glow);
    g.userData.lid = hinge; g.userData.glow = glow;
    return g;
  }

  // Red health potion in a round flask.
  function potion() {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: col(0xc01818), emissive: col(0x500000), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
    const flask = sphere(0.04, glass); flask.position.y = 0.04; g.add(flask);
    const neck = cyl(0.012, 0.016, 0.04, glass, 12); neck.position.y = 0.09; g.add(neck);
    const cork = cyl(0.013, 0.011, 0.018, new THREE.MeshStandardMaterial({ color: col(0x9a7040), roughness: 0.9 }), 10); cork.position.y = 0.118; g.add(cork);
    const label = cyl(0.041, 0.041, 0.02, new THREE.MeshStandardMaterial({ color: col(0xe8dcc4), roughness: 0.9 }), 20); label.position.y = 0.04; label.scale.z = 1.01; g.add(label);
    return g;
  }

  // Roll of bandage with a loose tail.
  function bandage() {
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: col(0xf0ebe0), roughness: 1 });
    const roll = cyl(0.03, 0.03, 0.05, cloth, 18); roll.rotation.z = Math.PI / 2; roll.position.y = 0.03; g.add(roll);
    const core = cyl(0.01, 0.01, 0.052, new THREE.MeshStandardMaterial({ color: col(0xa89878) }), 10); core.rotation.z = Math.PI / 2; core.position.y = 0.03; g.add(core);
    const tail = box(0.05, 0.002, 0.09, cloth); tail.position.set(0, 0.001, 0.07); g.add(tail);
    return g;
  }

  // Claw hammer lying on its side; origin at the handle's end.
  function hammerTool() {
    const m = mats();
    const g = new THREE.Group();
    const handle = cyl(0.012, 0.014, 0.3, m.grip, 10); handle.rotation.x = Math.PI / 2; handle.position.z = 0.15; g.add(handle);
    const head = box(0.03, 0.03, 0.13, m.steel); head.rotation.y = Math.PI / 2; head.position.set(0, 0, 0.3); g.add(head);
    const face = cyl(0.02, 0.02, 0.02, m.steel, 12); face.rotation.z = Math.PI / 2; face.position.set(0.07, 0, 0.3); g.add(face);
    const claw = box(0.012, 0.024, 0.05, m.steel); claw.position.set(-0.075, 0.01, 0.3); claw.rotation.z = 0.5; g.add(claw);
    g.userData.head = head;
    return g;
  }

  function binoculars() {
    const m = mats();
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: col(0x2a2a24), roughness: 0.6, metalness: 0.4 });
    [-0.035, 0.035].forEach(x => {
      const tube = cyl(0.022, 0.026, 0.11, body, 16); tube.rotation.x = Math.PI / 2; tube.position.set(x, 0.026, 0); g.add(tube);
      const lens = cyl(0.02, 0.02, 0.002, new THREE.MeshStandardMaterial({ color: col(0x4a6a8a), metalness: 0.9, roughness: 0.05 }), 16);
      lens.rotation.x = Math.PI / 2; lens.position.set(x, 0.026, 0.056); g.add(lens);
      const ring = cyl(0.024, 0.024, 0.01, m.brass, 16); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.026, -0.05); g.add(ring);
    });
    const bridge = box(0.05, 0.012, 0.04, body); bridge.position.set(0, 0.03, 0); g.add(bridge);
    return g;
  }

  // Teammate offer: a rolled-up pact tied with a red ribbon.
  function contract() {
    const g = new THREE.Group();
    const paper = new THREE.MeshStandardMaterial({ color: col(0xe8d8b0), roughness: 0.95 });
    const roll = cyl(0.02, 0.02, 0.16, paper, 14); roll.rotation.z = Math.PI / 2; roll.position.y = 0.02; g.add(roll);
    const ribbon = mesh(new THREE.TorusGeometry(0.021, 0.005, 8, 18), new THREE.MeshStandardMaterial({ color: col(0xa01818), roughness: 0.7 }));
    ribbon.rotation.y = Math.PI / 2; ribbon.position.y = 0.02; g.add(ribbon);
    const seal = cyl(0.012, 0.012, 0.004, new THREE.MeshStandardMaterial({ color: col(0x8a1010), roughness: 0.5 }), 12);
    seal.position.set(0, 0.042, 0.004); g.add(seal);
    return g;
  }

  function item(id) {
    const g = { potion, bandage, hammer: hammerTool, binoculars, teammate: contract }[id]();
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // Leather couch that replaces two chairs when players team up.
  function couch(width = 1.35) {
    const g = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: col(0x5a2a18), roughness: 0.55 });
    const wood = mats().darkWood;
    const base = box(width, 0.18, 0.55, wood); base.position.y = 0.2; g.add(base);
    const seat = box(width - 0.18, 0.12, 0.5, leather); seat.position.set(0, 0.36, 0.02); g.add(seat);
    const back = box(width, 0.55, 0.14, leather); back.position.set(0, 0.6, -0.22); g.add(back);
    [-1, 1].forEach(sx => { const arm = box(0.1, 0.32, 0.55, leather); arm.position.set(sx * (width / 2 - 0.05), 0.42, 0); g.add(arm); });
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => { const leg = cyl(0.025, 0.02, 0.12, wood, 8); leg.position.set(sx * (width / 2 - 0.08), 0.06, sz * 0.22); g.add(leg); }));
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // A painted red tally mark (one per life).
  function lifeMark() {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.07),
      new THREE.MeshStandardMaterial({ color: col(0xc01010), emissive: col(0x500000), roughness: 0.6 }));
    return mark;
  }

  return {
    shotgun, crate, item, couch, lifeMark,
    V, tex, mats, revolver, card, setCardFace, cardFace, outlaw, table, chair, bookshelf, desk,
    door, pictureFrame, hangingLamp, target, bullet, decal, CARD_W, CARD_H,
  };
})();
