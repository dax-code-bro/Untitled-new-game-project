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
    // Reflections for metal: a soft warm room with one bright lamp.
    const env = envMap();
    M.engraved = new THREE.MeshStandardMaterial({ map: engraving(), color: col(0xb8b8bc), metalness: 0.95, roughness: 0.28 });
    M.nickel = new THREE.MeshStandardMaterial({ color: col(0xc0c2c6), metalness: 1, roughness: 0.22 });
    [M.steel, M.blued, M.brass, M.lead, M.engraved, M.nickel].forEach(mt => { if (env) { mt.envMap = env; mt.envMapIntensity = 0.9; } });
    M.ready = true;
    return M;
  }

  let envTex = null;
  function envMap() {
    if (envTex || !Engine.renderer) return envTex;
    const eq = Util.canvasTexture(256, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#3a2a1a'); gr.addColorStop(0.5, '#6a5038'); gr.addColorStop(1, '#140c06');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const lamp = g.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.15, 40);
      lamp.addColorStop(0, '#fff6dc'); lamp.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = lamp; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(200,220,255,0.5)'; g.fillRect(w * 0.15, h * 0.3, 18, 30);
    });
    eq.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(Engine.renderer);
    envTex = pm.fromEquirectangular(eq).texture;
    pm.dispose();
    return envTex;
  }

  // Scrollwork for engraved gun metal.
  function engraving() {
    return Util.canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#8a8a90'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(30,30,34,0.55)'; g.lineWidth = 1.4;
      const r = Util.rng(77);
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = r() * h, rad = 6 + r() * 16;
        g.beginPath(); g.arc(x, y, rad, r() * 6, r() * 6 + 4); g.stroke();
        g.beginPath(); g.arc(x + rad * 0.5, y, rad * 0.45, 0, 5); g.stroke();
      }
    }, { repeat: [2, 2] });
  }

  function mesh(geo, mat, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
  const box = (w, h, d, mat, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, o);
  const cyl = (rt, rb, h, mat, seg = 16, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, o);
  const sphere = (r, mat, o) => mesh(new THREE.SphereGeometry(r, 20, 14), mat, o);

  // ---------- gun skins (Gunsmith) ----------
  // A skin swaps the materials a gun is built from (frame, barrel, cylinder,
  // grips, trim, small parts) and can add a few decorations. Glowing skins
  // pulse through `glowing`, animated every frame. Looks only: a skin never
  // changes how a gun shoots.

  const pattern = {};   // painted skin textures, made once on first use
  function skinTex(name) {
    if (pattern[name]) return pattern[name];
    const P = (w, h, draw, rep = [6, 6], srgb = true) => Util.canvasTexture(w, h, draw, { repeat: rep, srgb });
    const r = Util.rng(name.length * 131 + 7);
    const grain = (g, w, h, base, line, n = 50) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let k = 0; k < n; k++) {
        g.strokeStyle = line; g.globalAlpha = 0.15 + r() * 0.3; g.lineWidth = 1 + r() * 2;
        const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 10, h * 0.3, x - 10, h * 0.6, x + 5, h); g.stroke();
      }
      g.globalAlpha = 1;
    };
    const cracks = (g, w, h, color, width, n) => {
      g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
      const branch = (x, y, a, len, d) => {
        if (d > 5 || len < 4) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        branch(x2, y2, a + (r() - 0.5) * 1.1, len * 0.8, d + 1);
        if (r() < 0.45) branch(x2, y2, a + (r() - 0.5) * 2.2, len * 0.55, d + 1);
      };
      for (let i = 0; i < n; i++) branch(r() * w, r() * h, r() * 6.3, 18 + r() * 20, 0);
    };
    const make = {
      rust: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#4a3a30'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
          const c = ['#7a3a14', '#9a5420', '#5a2a10', '#3a3a3a', '#b06a2a'][Math.floor(r() * 5)];
          g.fillStyle = c; g.globalAlpha = 0.25 + r() * 0.5;
          g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 14, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(20,10,5,0.6)'; for (let i = 0; i < 30; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + r() * 30 - 15, y + r() * 30 - 15); g.stroke(); }
      }),
      twine: () => P(128, 128, (g, w, h) => {
        g.fillStyle = '#8a7048'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) {
          g.fillStyle = y % 16 ? '#a88a58' : '#6a5434'; g.fillRect(0, y, w, 6);
          g.strokeStyle = 'rgba(40,28,14,0.6)'; for (let x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 6); g.stroke(); }
        }
      }, [10, 10]),
      ivory: () => P(256, 256, (g, w, h) => { grain(g, w, h, '#ece2c8', '#b8a880', 30); }, [4, 4]),
      ebony: () => P(256, 256, (g, w, h) => { grain(g, w, h, '#16100c', '#3a2a20', 60); }, [4, 4]),
      rosewood: () => P(256, 256, (g, w, h) => {
        grain(g, w, h, '#5a2414', '#2a0c06', 70);
        g.strokeStyle = 'rgba(20,6,2,0.9)'; g.lineWidth = 3;   // the notches
        for (let i = 0; i < 21; i++) { const x = 10 + i * 11; g.beginPath(); g.moveTo(x, h * 0.1); g.lineTo(x + 3, h * 0.3); g.stroke(); }
        g.fillStyle = 'rgba(230,200,140,0.55)'; g.font = 'bold 60px Georgia, serif'; g.textAlign = 'center'; g.fillText('W.B.', w / 2, h * 0.75);
      }, [8, 8]),
      bone: () => P(256, 256, (g, w, h) => {
        grain(g, w, h, '#d8ccb0', '#8a7a5a', 25);
        g.strokeStyle = 'rgba(60,20,10,0.8)'; g.lineWidth = 2.5;
        for (let gp = 0; gp < 4; gp++) {   // tally marks, five to a gate
          const x0 = 20 + gp * 58, y0 = 40 + (gp % 2) * 110;
          for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x0 + i * 9, y0); g.lineTo(x0 + i * 9, y0 + 50); g.stroke(); }
          g.beginPath(); g.moveTo(x0 - 6, y0 + 40); g.lineTo(x0 + 34, y0 + 8); g.stroke();
        }
        g.fillStyle = 'rgba(110,0,0,0.55)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 4, 0, 7); g.fill(); }
      }, [8, 8]),
      bloodiron: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#26221f'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 300; i++) { const v = 20 + r() * 40; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(r() * w, r() * h, 3, 3); }
        for (let i = 0; i < 14; i++) {
          const x = r() * w, y = r() * h;
          g.fillStyle = `rgba(${90 + r() * 50},0,0,0.85)`;
          g.beginPath(); g.arc(x, y, 3 + r() * 10, 0, 7); g.fill();
          for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * 50, y + (r() - 0.5) * 50, 1 + r() * 3, 0, 7); g.fill(); }
          g.fillRect(x - 1.5, y, 3, 10 + r() * 30);
        }
      }),
      pearl: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#f4f0ec'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
          g.strokeStyle = ['rgba(255,190,220,0.35)', 'rgba(180,220,255,0.35)', 'rgba(255,240,200,0.4)'][i % 3]; g.lineWidth = 3 + r() * 6;
          g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 40, r() * 6, r() * 6 + 2); g.stroke();
        }
      }, [4, 4]),
      feathers: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(170,130,50,0.7)'; g.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          const x = 20 + (i % 3) * 85, y = 30 + Math.floor(i / 3) * 85;
          g.beginPath(); g.moveTo(x, y + 60); g.quadraticCurveTo(x + 20, y + 20, x + 50, y); g.stroke();
          for (let k = 0; k < 8; k++) { const t = k / 8; const px = x + 50 * t * t + 20 * t, py = y + 60 - 60 * t; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 14, py - 8); g.moveTo(px, py); g.lineTo(px + 8, py + 12); g.stroke(); }
        }
      }),
      veins: () => P(256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); cracks(g, w, h, '#ffffff', 2.4, 10); }, [5, 5], false),
      volcanic: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#120a08'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) { const v = 10 + r() * 30; g.fillStyle = `rgba(${v + 10},${v},${v},0.5)`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
        cracks(g, w, h, '#ff6a10', 2.4, 10);
      }, [5, 5]),
      circuit: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#fff'; g.lineWidth = 2.5;
        for (let i = 0; i < 26; i++) {
          let x = Math.floor(r() * 16) * 16, y = Math.floor(r() * 16) * 16;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) { if (r() < 0.5) x += (r() < 0.5 ? -1 : 1) * 32; else y += (r() < 0.5 ? -1 : 1) * 32; g.lineTo(x, y); }
          g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
        }
      }, [4, 4], false),
      facets: () => P(256, 256, (g, w, h) => {
        const s = 32;
        for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
          [[x, y, x + s, y, x, y + s], [x + s, y, x + s, y + s, x, y + s]].forEach(t => {
            const v = 170 + r() * 85;
            g.fillStyle = `rgb(${v - 20},${v},${Math.min(255, v + 30)})`;
            g.beginPath(); g.moveTo(t[0], t[1]); g.lineTo(t[2], t[3]); g.lineTo(t[4], t[5]); g.closePath(); g.fill();
          });
        }
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
        for (let y = 0; y <= h; y += s) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        for (let x = 0; x <= w; x += s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(x + s, 0); g.lineTo(x - h + s, h); g.stroke(); }
      }, [8, 8]),
      sparkle: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const x = r() * w, y = r() * h, s = 2 + r() * 5;
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - 0.6); g.lineTo(x + s, y); g.lineTo(x, y + 0.6); g.fill();
          g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + 0.6, y); g.lineTo(x, y + s); g.lineTo(x - 0.6, y); g.fill();
        }
      }, [8, 8], false),
      gothic: () => P(256, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const x = 32 + i * 64, y = 32 + j * 64;
          g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y + 22); g.moveTo(x - 14, y - 8); g.lineTo(x + 14, y - 8); g.stroke();   // cross
          g.beginPath(); g.arc(x, y, 26, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(x - 32, y - 32); g.quadraticCurveTo(x, y - 10, x + 32, y - 32); g.stroke();
        }
      }, [5, 5], false),
    };
    pattern[name] = make[name]();
    return pattern[name];
  }

  // Materials that glow and pulse: [{ mat, base, speed, flicker }]
  const glowing = [];
  let glowHooked = false;
  function addGlow(mat, base, speed = 2, flicker = 0) {
    glowing.push({ mat, base, speed, flicker, seed: Math.random() * 10 });
    if (!glowHooked && typeof Engine !== 'undefined') {
      glowHooked = true;
      Engine.onUpdate((dt, time) => {
        for (let i = glowing.length - 1; i >= 0; i--) {
          const gl = glowing[i];
          const t = time + gl.seed;
          gl.mat.emissiveIntensity = gl.base * (0.75 + 0.25 * Math.sin(t * gl.speed) + gl.flicker * (Math.sin(t * 17.3) * Math.sin(t * 7.1)));
        }
      });
    }
    return mat;
  }

  // Build the material set for a skin. Keys match mats() so the gun
  // builders don't care which skin they wear.
  const skinCache = {};
  function gunLook(skin, kind) {
    const key = kind + ':' + (skin || 'standard');
    if (skinCache[key]) return skinCache[key];
    const base = mats();
    const env = envMap();
    const metal = (color, metalness, roughness, extra = {}) => {
      const mt = new THREE.MeshStandardMaterial(Object.assign({ color: col(color), metalness, roughness }, extra));
      if (env) { mt.envMap = env; mt.envMapIntensity = extra.envI || 1; }
      return mt;
    };
    const plain = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: col(color), roughness }, extra));
    const glow = (mt, color, map, intensity, speed, flicker) => {
      mt.emissive = col(color); mt.emissiveMap = map || null; mt.emissiveIntensity = intensity;
      return addGlow(mt, intensity, speed, flicker);
    };
    const engr = base.engraved.map;
    let L;
    switch (skin) {
      case 'makeshift': L = {
        engraved: metal(0xc8b8a8, 0.6, 0.75, { map: skinTex('rust') }),
        blued: metal(0x8a8a8a, 0.55, 0.8, { map: skinTex('rust') }),
        steel: metal(0x5a5650, 0.7, 0.6),
        grip: plain(0xffffff, 1, { map: skinTex('twine') }),
        brass: metal(0xa86a3a, 0.8, 0.5),   // copper wire
        nickel: metal(0x6a6660, 0.7, 0.6),
        deco: ['clamp', 'wraps'],
      }; break;
      case 'silver': L = {
        engraved: metal(0xf4f4f8, 1, 0.12, { map: engr, envI: 1.3 }),
        blued: metal(0xd8dade, 1, 0.1, { envI: 1.3 }),
        steel: metal(0xe0e2e6, 1, 0.14, { envI: 1.3 }),
        grip: plain(0xffffff, 0.35, { map: skinTex('ivory') }),
        brass: metal(0xe8e8ec, 1, 0.1),
        nickel: metal(0xffffff, 1, 0.08),
      }; break;
      case 'gold': L = {
        engraved: metal(0xffc850, 1, 0.18, { map: engr, envI: 1.3 }),
        blued: metal(0xe0a830, 1, 0.16, { envI: 1.3 }),
        steel: metal(0xf0b840, 1, 0.2, { map: engr, envI: 1.3 }),
        grip: plain(0xffffff, 0.3, { map: skinTex('ebony') }),
        brass: metal(0xffd870, 1, 0.12),
        nickel: metal(0xffe090, 1, 0.12),
      }; break;
      case 'billy': L = {
        engraved: metal(0xb8bcc0, 0.95, 0.42, { map: engr }),
        blued: metal(0x9a9ea4, 0.95, 0.4),
        steel: metal(0xa8acb0, 0.95, 0.45),
        grip: plain(0xffffff, 0.5, { map: skinTex('rosewood') }),
        brass: metal(0xb88a4a, 0.9, 0.45),
        nickel: metal(0xc8c8c8, 1, 0.35),
      }; break;
      case 'murderer': L = {
        engraved: metal(0xb0a8a0, 0.7, 0.6, { map: skinTex('bloodiron') }),
        blued: metal(0x9a9090, 0.7, 0.55, { map: skinTex('bloodiron') }),
        steel: metal(0x3a3432, 0.8, 0.5),
        grip: plain(0xffffff, 0.7, { map: skinTex('bone') }),
        brass: metal(0x4a1010, 0.6, 0.4),
        nickel: metal(0x5a5a5a, 0.9, 0.5),
        deco: ['barbed'],
      }; break;
      case 'angel': L = {
        engraved: metal(0xfffaf0, 0.4, 0.25, { map: skinTex('feathers') }),
        blued: metal(0xf0ece4, 0.5, 0.2),
        steel: metal(0xffe8b0, 1, 0.15, { envI: 1.2 }),
        grip: plain(0xffffff, 0.2, { map: skinTex('pearl') }),
        brass: metal(0xffd870, 1, 0.12),
        nickel: metal(0xfff0c0, 1, 0.12),
        halo: glow(plain(0xfff4c8, 0.3), 0xffe8a0, null, 1.6, 1.5, 0),
        deco: ['wings', 'halo'],
      }; break;
      case 'hellfire': L = {
        engraved: glow(metal(0xffffff, 0.6, 0.55, { map: skinTex('volcanic') }), 0xff4a08, skinTex('veins'), 1.8, 3, 0.35),
        blued: glow(metal(0x1a1210, 0.8, 0.4), 0xff3000, skinTex('veins'), 1.4, 2.6, 0.35),
        steel: glow(metal(0x1a1210, 0.8, 0.4), 0xff5a10, skinTex('veins'), 1.6, 3.4, 0.35),
        grip: glow(plain(0x1a0a06, 0.8), 0xc02000, skinTex('veins'), 1.2, 2, 0.3),
        brass: glow(metal(0xff6a20, 0.8, 0.3), 0xff4000, null, 0.6, 4, 0.2),
        nickel: metal(0x2a2220, 0.8, 0.4),
        shell: glow(plain(0x3a0a04, 0.5), 0xff5000, null, 1.4, 5, 0.4),
        deco: ['embers'],
      }; break;
      case 'darkknight': L = {
        engraved: glow(metal(0x16161a, 0.9, 0.3), 0x8a0a14, skinTex('gothic'), 0.9, 1.2, 0),
        blued: metal(0x0c0c10, 0.9, 0.28),
        steel: glow(metal(0x121216, 0.9, 0.3), 0x6a0812, skinTex('gothic'), 0.7, 1.2, 0),
        grip: plain(0x180808, 0.45, { map: skinTex('ebony') }),
        brass: metal(0x8a0a14, 0.8, 0.3),
        nickel: metal(0x3a3a42, 1, 0.25),
        deco: kind === 'revolver' ? ['blade'] : ['spikes'],
      }; break;
      case 'diamond': L = {
        engraved: glow(metal(0xffffff, 0.35, 0.05, { map: skinTex('facets'), envI: 1.8 }), 0xd8f0ff, skinTex('sparkle'), 0.9, 5, 0.6),
        blued: glow(metal(0xe8f4ff, 0.4, 0.05, { map: skinTex('facets'), envI: 1.8 }), 0xd8f0ff, skinTex('sparkle'), 0.7, 4.3, 0.6),
        steel: glow(metal(0xffffff, 0.35, 0.05, { map: skinTex('facets'), envI: 1.8 }), 0xd8f0ff, skinTex('sparkle'), 0.9, 4.7, 0.6),
        grip: metal(0xc8e8ff, 0.3, 0.05, { map: skinTex('facets'), envI: 1.6 }),
        brass: metal(0xf0f4ff, 1, 0.08),
        nickel: metal(0xffffff, 1, 0.05),
      }; break;
      case 'bluelight': L = {
        engraved: glow(metal(0x101418, 0.9, 0.3), 0x2aa0ff, skinTex('circuit'), 2, 2.4, 0.25),
        blued: glow(metal(0x0a0c10, 0.9, 0.3), 0x2a90ff, skinTex('circuit'), 1.8, 2.8, 0.25),
        steel: glow(metal(0x101418, 0.9, 0.3), 0x60c0ff, null, 0.8, 3, 0.2),
        grip: glow(plain(0x0c1018, 0.5), 0x1a70ff, skinTex('circuit'), 1.2, 2, 0.2),
        brass: glow(metal(0x80d0ff, 0.8, 0.2), 0x40b0ff, null, 1, 3, 0.2),
        nickel: metal(0x3a4a5a, 1, 0.25),
        shell: glow(plain(0x0a2a5a, 0.4), 0x2a90ff, null, 1.2, 4, 0.3),
      }; break;
      default: L = {};
    }
    const out = Object.assign({}, base, { ammo: base.brass, shell: null, deco: [] }, L);
    out.ammo = base.brass;
    skinCache[key] = out;
    return out;
  }

  // Extra pieces some skins add to a revolver or shotgun.
  // A shotgun is decorated twice: once on its barrels, once on its body.
  const BARREL_DECO = ['clamp', 'barbed', 'spikes'];
  function decorate(g, m, kind, part) {
    const isR = kind === 'revolver';
    const len = isR ? 0.17 : 0.46, y = isR ? 0.012 : 0.016, z0 = isR ? 0.03 : 0.035;
    (m.deco || []).forEach(d => {
      if (!isR && BARREL_DECO.includes(d) !== (part === 'barrels')) return;
      if (d === 'clamp') {   // a hose clamp holding the barrel on
        [0.08, 0.15].forEach(z => { const c = mesh(new THREE.TorusGeometry(isR ? 0.0125 : 0.03, 0.0022, 6, 18), m.nickel); c.position.set(0, y, isR ? z : z * 2.6); if (!isR) c.scale.set(1, 0.6, 1); g.add(c); });
      } else if (d === 'wraps') {   // wire wound round the grip
        for (let i = 0; i < 6; i++) { const w = mesh(new THREE.TorusGeometry(0.019, 0.0016, 6, 16), m.brass); w.rotation.x = Math.PI / 2 - 0.5; w.position.set(0, -0.045 - i * 0.009, -0.035 - i * 0.004); w.scale.set(1, 1.4, 1); g.add(w); }
      } else if (d === 'barbed') {
        const wire = mesh(new THREE.TorusGeometry(isR ? 0.013 : 0.03, 0.0012, 4, 60, Math.PI * 2), m.nickel);
        for (let i = 0; i < 5; i++) {
          const ring = wire.clone(); ring.position.set(0, y, z0 + 0.03 + i * (len * 0.12)); if (!isR) ring.scale.set(1, 0.6, 1); g.add(ring);
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + i; const b = box(0.0012, 0.006, 0.0012, m.nickel); b.position.set(Math.cos(a) * (isR ? 0.013 : 0.03), y + Math.sin(a) * (isR ? 0.013 : 0.018), ring.position.z); b.rotation.z = a; g.add(b); }
        }
      } else if (d === 'wings') {   // feathered wings fanning up from the frame
        [-1, 1].forEach(sx => {
          const wing = new THREE.Group();
          for (let i = 0; i < 5; i++) {
            const f = mesh(new THREE.SphereGeometry(0.03, 12, 8), m.engraved);
            f.scale.set(0.1, 0.32 - i * 0.03, 1.1 - i * 0.12);
            f.position.set(0, 0.008 + i * 0.007, -0.02 - i * 0.006);
            f.rotation.x = 0.35 - i * 0.28;
            wing.add(f);
          }
          wing.position.set(sx * 0.02, 0.012, -0.03); wing.rotation.y = sx * 0.3; g.add(wing);
        });
      } else if (d === 'halo') {
        const halo = mesh(new THREE.TorusGeometry(0.03, 0.0025, 8, 32), m.halo, { cast: false });
        halo.rotation.x = Math.PI / 2; halo.position.set(0, isR ? 0.07 : 0.08, isR ? -0.01 : -0.02); g.add(halo);
      } else if (d === 'embers') {   // glowing coals set in the frame
        for (let i = 0; i < 5; i++) { const e = sphere(0.0026, m.brass, { cast: false }); e.position.set((i % 2 ? 1 : -1) * (isR ? 0.0125 : 0.024), -0.01 + (i * 0.007), (isR ? -0.02 : -0.04) + i * 0.01); g.add(e); }
      } else if (d === 'blade') {   // a bayonet under the barrel
        const blade = profile([[0.1, -0.012], [0.27, -0.008], [0.3, -0.004], [0.27, -0.002], [0.1, -0.004]], 0.003, m.nickel, 0.0005);
        g.add(blade);
        const lug = box(0.008, 0.012, 0.016, m.brass); lug.position.set(0, -0.006, 0.105); g.add(lug);
      } else if (d === 'spikes') {   // spikes ringing the muzzle
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const s = mesh(new THREE.ConeGeometry(0.004, 0.02, 6), m.brass);
          s.rotation.x = Math.PI / 2; s.position.set(Math.cos(a) * 0.03, 0.016 + Math.sin(a) * 0.02, 0.43);
          g.add(s);
        }
      }
    });
  }

  // ---------- revolver ----------
  // Single-action six-shooter. Barrel points along +Z, grip hangs down -Y,
  // origin at the cylinder. Returns { group, cylinder, hammer, muzzle,
  // chambers, rounds, trigger }.

  // Extrude a side profile (points as [z, y]) into a part `depth` wide.
  function profile(points, depth, mat, bevel = 0.0015, curves) {
    const sh = new THREE.Shape();
    sh.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else sh.lineTo(p[0], p[1]);
    }
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -depth / 2);
    const m = mesh(geo, mat);
    m.rotation.y = -Math.PI / 2;       // profile x -> world +Z
    return m;
  }

  function revolver(skin) {
    const m = gunLook(skin, 'revolver');
    const g = new THREE.Group();

    // barrel with a crowned muzzle, front blade sight and ejector housing
    const barrel = cyl(0.0105, 0.0115, 0.17, m.blued, 28);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.012, 0.115); g.add(barrel);
    const crown = mesh(new THREE.TorusGeometry(0.0095, 0.0018, 8, 24), m.nickel);
    crown.position.set(0, 0.012, 0.2); g.add(crown);
    const bore = cyl(0.0052, 0.0052, 0.004, m.black, 14, { cast: false });
    bore.rotation.x = Math.PI / 2; bore.position.set(0, 0.012, 0.199); g.add(bore);
    const blade = profile([[0.19, 0.021], [0.198, 0.021], [0.196, 0.03], [0.188, 0.03]], 0.003, m.blued, 0);
    g.add(blade);
    const housing = cyl(0.0065, 0.0065, 0.115, m.blued, 14);
    housing.rotation.x = Math.PI / 2; housing.position.set(0.004, -0.006, 0.09); g.add(housing);
    const rodHead = cyl(0.005, 0.005, 0.01, m.nickel, 12);
    rodHead.rotation.z = Math.PI / 2; rodHead.position.set(0.01, -0.006, 0.12); g.add(rodHead);

    // frame: front piece, top strap, recoil shield and the lower frame,
    // leaving a window for the cylinder
    const frameMat = m.engraved;
    g.add(profile([[0.024, 0.03], [0.04, 0.026], [0.04, -0.016], [0.024, -0.02]], 0.022, frameMat));
    g.add(profile([[-0.03, 0.026], [0.03, 0.026], [0.03, 0.032], [-0.032, 0.034]], 0.016, frameMat));
    g.add(profile([[-0.036, 0.032], [-0.024, 0.03], [-0.024, -0.022], [-0.04, -0.024], [-0.05, 0.0, -0.046, 0.024]], 0.03, frameMat));
    g.add(profile([[-0.04, -0.024], [0.03, -0.02], [0.03, -0.028], [-0.02, -0.034], [-0.04, -0.034]], 0.022, frameMat));
    const rear = profile([[-0.034, 0.034], [-0.03, 0.034], [-0.03, 0.04], [-0.034, 0.04]], 0.006, m.blued, 0);
    g.add(rear);
    [[0.006, 0.0, -0.03], [0.006, -0.025, 0.012], [0.006, 0.02, -0.04]].forEach(([x, y, z]) => {
      [-1, 1].forEach(sx => { const sc = cyl(0.0028, 0.0028, 0.002, m.nickel, 10); sc.rotation.z = Math.PI / 2; sc.position.set(sx * (x + 0.012), y, z); g.add(sc); });
    });
    const gate = profile([[-0.03, 0.008], [-0.022, 0.008], [-0.022, -0.012], [-0.03, -0.012]], 0.003, m.blued, 0);
    gate.position.x = 0.017; g.add(gate);

    // fluted cylinder with six chambers; each chamber can show a round
    const cylinder = new THREE.Group();
    const drum = cyl(0.0225, 0.0225, 0.046, m.steel, 36);
    drum.rotation.x = Math.PI / 2; cylinder.add(drum);
    const pin = cyl(0.004, 0.004, 0.05, m.nickel, 10); pin.rotation.x = Math.PI / 2; cylinder.add(pin);
    const chambers = [], rounds = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const hole = cyl(0.0048, 0.0048, 0.047, m.black, 12, { cast: false });
      hole.rotation.x = Math.PI / 2;
      hole.position.set(Math.cos(a) * 0.0135, Math.sin(a) * 0.0135, 0);
      cylinder.add(hole);
      chambers.push(hole);
      const fa = a + Math.PI / 6;
      const flute = box(0.006, 0.003, 0.03, m.black, { cast: false });
      flute.position.set(Math.cos(fa) * 0.0222, Math.sin(fa) * 0.0222, 0.004);
      flute.rotation.z = fa + Math.PI / 2;
      cylinder.add(flute);
      const round = cyl(0.0042, 0.0042, 0.006, m.ammo, 12, { cast: false });
      round.rotation.x = Math.PI / 2;
      round.position.set(Math.cos(a) * 0.0135, Math.sin(a) * 0.0135, -0.021);
      cylinder.add(round);
      rounds.push(round);
    }
    g.add(cylinder);

    // hammer with a checkered spur, pivoting at the back of the frame
    const hammer = new THREE.Group();
    hammer.add(profile([[-0.004, -0.004], [0.004, -0.004], [0.004, 0.011], [-0.009, 0.017, -0.018, 0.015], [-0.018, 0.011], [-0.006, 0.007]], 0.008, m.blued, 0.001));
    for (let i = 0; i < 3; i++) { const c = box(0.009, 0.0012, 0.0012, m.nickel, { cast: false }); c.position.set(0, 0.0175, -0.01 - i * 0.003); hammer.add(c); }
    hammer.position.set(0, 0.022, -0.04);
    g.add(hammer);

    // brass trigger guard and a curved trigger
    const guard = mesh(new THREE.TorusGeometry(0.017, 0.0032, 8, 24, Math.PI), m.brass);
    guard.rotation.set(Math.PI, Math.PI / 2, 0); guard.position.set(0, -0.031, -0.006); guard.scale.set(1, 1.15, 1); g.add(guard);
    const trigger = mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 12, Math.PI * 0.55), m.blued);
    trigger.rotation.set(0, Math.PI / 2, Math.PI * 0.9); trigger.position.set(0, -0.026, -0.016); g.add(trigger);

    // plow-handle grip: steel backstrap and walnut panels
    g.add(profile([[-0.042, -0.024], [-0.026, -0.03], [-0.032, -0.07, -0.05, -0.108], [-0.074, -0.104], [-0.062, -0.07, -0.05, -0.03]], 0.022, frameMat));
    const panels = profile([[-0.04, -0.03], [-0.03, -0.034], [-0.035, -0.07, -0.052, -0.1], [-0.068, -0.098], [-0.058, -0.066, -0.046, -0.032]], 0.033, m.grip, 0.002);
    g.add(panels);
    const medallion = cyl(0.004, 0.004, 0.036, m.brass, 12); medallion.rotation.z = Math.PI / 2; medallion.position.set(0, -0.07, -0.05); g.add(medallion);

    decorate(g, m, 'revolver');
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, 0.205); g.add(muzzle);
    return { group: g, cylinder, hammer, muzzle, chambers, rounds, trigger };
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
  // Seated figure facing +Z, built from a character's `look` (see
  // characters.js): hat style, face, hair, clothes and extras. Returns the
  // rig: root, spine, head, hat, arms, gun.
  function outlaw(look = {}, gunSkin = 'standard') {
    const m = mats();
    const L = look;
    const has = x => (L.extras || []).includes(x);
    const mat = (hex, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: col(hex), roughness: rough }, extra));
    const coat = mat(L.coat || 0x3a2c22);
    const shirt = mat(L.shirt || 0x8a7a60);
    const hatMat = mat(L.hatColor || 0x2a1c12, 0.85);
    const pants = mat(0x2a2620, 0.95);
    const skin = mat(L.skin || 0x8a6a52, 0.8);
    const hairMat = mat(L.hair || 0x2a1a10, 1);
    const female = !!L.female;

    const root = new THREE.Group();

    // legs (seated)
    [-0.1, 0.1].forEach(x => {
      const thigh = box(0.13, 0.13, 0.42, pants); thigh.position.set(x, 0.52, 0.17); root.add(thigh);
      const shin = box(0.11, 0.48, 0.12, pants); shin.position.set(x, 0.26, 0.36); root.add(shin);
      const boot = box(0.12, 0.08, 0.24, m.black); boot.position.set(x, 0.04, 0.41); root.add(boot);
    });
    if (has('dress')) {   // long skirt draped over the lap and down to the floor
      const skirt = mat(L.coat || 0x141014, 0.85);
      const lap = box(0.38, 0.14, 0.46, skirt); lap.position.set(0, 0.54, 0.16); root.add(lap);
      const drape = cyl(0.2, 0.26, 0.56, skirt, 18); drape.scale.z = 0.55; drape.position.set(0, 0.27, 0.36); root.add(drape);
    }

    // spine pivots at the hips so the body can lean and slump
    const spine = new THREE.Group(); spine.position.set(0, 0.56, 0); root.add(spine);
    const torsoTop = female ? 0.18 : 0.2;
    const torso = cyl(torsoTop, 0.17, 0.56, coat, 16); torso.position.y = 0.28; torso.scale.z = 0.65; spine.add(torso);
    const front = box(0.18, 0.4, 0.05, shirt); front.position.set(0, 0.32, 0.115); spine.add(front);
    if (has('vest')) {
      const vm = mat(L.vest || 0x5a3a22, 0.8);
      [-1, 1].forEach(sx => { const panel = box(0.075, 0.36, 0.055, vm); panel.position.set(sx * 0.06, 0.3, 0.122); spine.add(panel); });
      for (let i = 0; i < 3; i++) { const b = sphere(0.006, m.brass); b.position.set(0.026, 0.2 + i * 0.07, 0.152); spine.add(b); }
    }
    const belt = cyl(0.178, 0.178, 0.045, mat(0x2a1a0e, 0.7), 18);
    belt.position.y = 0.03; belt.scale.z = 0.68; spine.add(belt);
    const buckle = box(0.05, 0.036, 0.01, m.brass); buckle.position.set(0, 0.03, 0.122); spine.add(buckle);
    const shoulderW = female ? 0.4 : 0.46;
    const shoulders = cyl(0.07, 0.07, shoulderW, coat, 12); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 0.52; spine.add(shoulders);
    const neck = cyl(0.05, 0.055, 0.08, skin, 12); neck.position.y = 0.6; spine.add(neck);
    if (L.scarf) {
      const scarf = mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 16), mat(L.scarf));
      scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.58; spine.add(scarf);
      const knot = box(0.05, 0.07, 0.02, mat(L.scarf)); knot.position.set(0.02, 0.53, 0.07); knot.rotation.z = 0.3; spine.add(knot);
    }
    if (has('collar')) { const c = box(0.05, 0.03, 0.02, mat(0xf4f0e8, 0.6)); c.position.set(0, 0.6, 0.058); spine.add(c); }
    if (has('bowtie')) {
      const bm = mat(0x0a0a0a, 0.5);
      [-1, 1].forEach(sx => { const w = mesh(new THREE.ConeGeometry(0.022, 0.04, 4), bm); w.rotation.z = sx * Math.PI / 2; w.position.set(sx * 0.02, 0.57, 0.075); spine.add(w); });
    }
    if (has('tie')) { const t = box(0.03, 0.2, 0.012, mat(0x2a0a0a, 0.6)); t.position.set(0, 0.46, 0.145); spine.add(t); }
    if (has('badge')) {
      const star = new THREE.Shape();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.014 : 0.03; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? star.lineTo(x, y) : star.moveTo(x, y); }
      const b = mesh(new THREE.ExtrudeGeometry(star, { depth: 0.006, bevelEnabled: false }), m.brass);
      b.position.set(0.085, 0.4, 0.14); spine.add(b);
    }
    if (has('bandolier')) {
      const band = box(0.05, 0.6, 0.02, mat(0x3a2410, 0.7)); band.position.set(0, 0.3, 0.13); band.rotation.z = 0.7; spine.add(band);
      for (let i = 0; i < 7; i++) { const r = cyl(0.007, 0.007, 0.03, m.brass, 8); r.position.set(-0.15 + i * 0.05, 0.12 + i * 0.043, 0.145); spine.add(r); }
    }
    if (has('furcollar')) {
      const fur = mesh(new THREE.TorusGeometry(0.15, 0.06, 10, 22), mat(0x5a4430, 1)); fur.rotation.x = Math.PI / 2; fur.scale.set(1.15, 0.8, 1); fur.position.y = 0.55; spine.add(fur);
    }
    if (has('poncho')) {
      const pm = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, map: Util.canvasTexture(128, 64, (g, w, h) => {
        ['#8a2a14', '#d8a040', '#2a4a5a', '#e8dcc4', '#8a2a14'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (i * h) / 5, w, h / 5); });
      }) });
      const po = mesh(new THREE.ConeGeometry(0.34, 0.36, 20, 1, true), pm); po.scale.z = 0.7; po.position.y = 0.42; spine.add(po);
    }
    if (has('coattails')) { const tails = box(0.3, 0.42, 0.03, coat); tails.position.set(0, 0.0, -0.13); tails.rotation.x = -0.25; spine.add(tails); }

    // head pivots at the neck
    const head = new THREE.Group(); head.position.set(0, 0.64, 0); spine.add(head);
    const skull = sphere(0.105, skin); skull.position.y = 0.1; skull.scale.set(female ? 0.85 : 0.9, 1.08, 0.95); head.add(skull);
    const jaw = box(female ? 0.1 : 0.12, 0.06, 0.1, skin); jaw.position.set(0, 0.03, 0.02); head.add(jaw);
    const nose = box(0.024, 0.04, 0.03, skin); nose.position.set(0, 0.09, 0.1); head.add(nose);
    [-1, 1].forEach(sx => { const ear = sphere(0.022, skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 0.095, 0.1, 0.0); head.add(ear); });
    const eyeMat = mat(0x111111, 0.4, { emissive: col(0x000000) });
    const eyes = [-0.035, 0.035].map(x => { const e = sphere(0.012, eyeMat, { cast: false }); e.position.set(x, 0.11, 0.088); head.add(e); return e; });
    const brows = [-1, 1].map(sx => { const b = box(0.035, 0.008, 0.01, hairMat); b.position.set(sx * 0.035, 0.135, 0.093); b.rotation.z = sx * -0.12; head.add(b); return b; });
    const fc = mat(L.facialColor || L.hair || 0x2a1a10, 1);
    if (L.facial === 'beard') { const b = box(0.15, 0.09, 0.09, fc); b.position.set(0, 0.015, 0.05); head.add(b); }
    if (L.facial === 'beard' || L.facial === 'mustache') { const mu = box(0.075, 0.016, 0.02, fc); mu.position.set(0, 0.066, 0.106); head.add(mu); }
    if (L.facial === 'pencil') { const mu = box(0.06, 0.006, 0.012, fc); mu.position.set(0, 0.068, 0.108); head.add(mu); }
    if (L.facial === 'stubble') { const st = box(0.125, 0.07, 0.1, mat(L.facialColor || 0x2a1a10, 1, { transparent: true, opacity: 0.45 })); st.position.set(0, 0.03, 0.025); head.add(st); }
    if (has('lips')) { const lp = box(0.035, 0.01, 0.01, mat(0x8a1418, 0.5)); lp.position.set(0, 0.058, 0.11); head.add(lp); }
    // hair
    if (L.hairStyle === 'sideburns' || L.hairStyle === 'short') {
      [-1, 1].forEach(sx => { const sb = box(0.018, 0.06, 0.04, hairMat); sb.position.set(sx * 0.093, 0.09, 0.03); head.add(sb); });
      const back = sphere(0.1, hairMat); back.scale.set(0.95, 0.7, 0.6); back.position.set(0, 0.12, -0.04); head.add(back);
    }
    if (L.hairStyle === 'long') {
      const back = box(0.21, 0.36, 0.06, hairMat); back.position.set(0, -0.02, -0.07); head.add(back);
      [-1, 1].forEach(sx => { const strand = box(0.04, 0.26, 0.05, hairMat); strand.position.set(sx * 0.09, 0.02, 0.0); head.add(strand); });
    }
    if (L.hairStyle === 'braid') {
      const back = sphere(0.1, hairMat); back.scale.set(0.95, 0.75, 0.65); back.position.set(0, 0.12, -0.04); head.add(back);
      for (let i = 0; i < 7; i++) { const k = sphere(0.026 - i * 0.002, hairMat); k.position.set(0.07 + i * 0.006, 0.04 - i * 0.045, 0.02 + i * 0.012); head.add(k); }
    }
    // face extras
    if (has('mask')) {
      const bandana = new THREE.MeshStandardMaterial({ roughness: 0.9, map: Util.canvasTexture(64, 64, (g, w, h) => {
        g.fillStyle = '#9a1814'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8dcc4';
        for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2, 0, 7); g.fill(); }
      }) });
      const mk = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 18, 1, true, -Math.PI / 2, Math.PI), bandana);
      mk.position.set(0, 0.055, 0.0); mk.scale.z = 1.05; head.add(mk);
      const point = mesh(new THREE.ConeGeometry(0.05, 0.08, 4), bandana); point.rotation.x = Math.PI; point.position.set(0, -0.005, 0.1); head.add(point);
    }
    if (has('eyepatch')) {
      const pm = mat(0x080808, 0.6);
      const patch = cyl(0.022, 0.022, 0.008, pm, 14); patch.rotation.x = Math.PI / 2; patch.position.set(0.035, 0.112, 0.096); head.add(patch);
      const strap = mesh(new THREE.TorusGeometry(0.104, 0.004, 6, 30), pm); strap.position.set(0, 0.12, 0); strap.rotation.set(Math.PI / 2, 0.35, 0); head.add(strap);
    }
    if (has('scar')) { const sc = box(0.006, 0.07, 0.006, mat(0xc07068, 0.6)); sc.position.set(-0.05, 0.1, 0.095); sc.rotation.z = 0.4; head.add(sc); }
    if (has('monocle')) {
      const mo = mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 20), m.brass); mo.position.set(0.035, 0.11, 0.1); head.add(mo);
      const chain = box(0.002, 0.08, 0.002, m.brass); chain.position.set(0.05, 0.07, 0.1); chain.rotation.z = 0.3; head.add(chain);
    }
    if (has('spectacles')) {
      [-1, 1].forEach(sx => { const r = mesh(new THREE.TorusGeometry(0.019, 0.0025, 8, 20), m.nickel); r.position.set(sx * 0.035, 0.11, 0.1); head.add(r); });
      const bridge = box(0.03, 0.003, 0.003, m.nickel); bridge.position.set(0, 0.112, 0.102); head.add(bridge);
    }
    if (has('cigar')) {
      const cg = cyl(0.006, 0.006, 0.06, mat(0x5a3a20, 0.8), 8); cg.rotation.set(Math.PI / 2 - 0.2, 0, 0.3); cg.position.set(0.03, 0.055, 0.13); head.add(cg);
      const tip = sphere(0.0065, mat(0xff5010, 0.5, { emissive: col(0xff3000), emissiveIntensity: 1.5 })); tip.position.set(0.04, 0.049, 0.158); head.add(tip);
    }

    // hats
    const hat = new THREE.Group(); hat.position.set(0, 0.19, 0); head.add(hat);
    const band = mat(0x0a0a0a, 0.6);
    const style = L.hat || 'cowboy';
    if (style === 'cowboy' || style === 'cowgirl') {
      const brim = cyl(0.21, 0.21, 0.012, hatMat, 28); hat.add(brim);
      const crown = cyl(0.1, 0.115, 0.13, hatMat, 20); crown.position.y = 0.07; hat.add(crown);
      const dent = box(0.03, 0.02, 0.16, hatMat); dent.position.y = 0.138; hat.add(dent);
      const b = cyl(0.117, 0.117, 0.025, style === 'cowgirl' ? m.nickel : band, 20); b.position.y = 0.022; hat.add(b);
      if (style === 'cowgirl') [-1, 1].forEach(sx => { const flap = box(0.08, 0.012, 0.3, hatMat); flap.position.set(sx * 0.17, 0.03, 0); flap.rotation.z = sx * 0.7; hat.add(flap); });
    } else if (style === 'flat') {
      const brim = cyl(0.23, 0.23, 0.01, hatMat, 32); hat.add(brim);
      const crown = cyl(0.105, 0.11, 0.08, hatMat, 22); crown.position.y = 0.045; hat.add(crown);
      const b = cyl(0.112, 0.112, 0.02, band, 22); b.position.y = 0.015; hat.add(b);
    } else if (style === 'top' || style === 'stovepipe') {
      const tall = style === 'stovepipe' ? 0.32 : 0.21;
      const brim = cyl(0.14, 0.14, 0.01, hatMat, 26); hat.add(brim);
      const crown = cyl(0.088, 0.092, tall, hatMat, 22); crown.position.y = tall / 2; hat.add(crown);
      const b = cyl(0.094, 0.094, 0.03, style === 'top' ? mat(0x6a1010, 0.6) : band, 22); b.position.y = 0.02; hat.add(b);
    } else if (style === 'bowler') {
      const brim = mesh(new THREE.TorusGeometry(0.115, 0.016, 8, 28), hatMat); brim.rotation.x = Math.PI / 2; brim.scale.z = 0.6; hat.add(brim);
      const crown = mesh(new THREE.SphereGeometry(0.105, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), hatMat); crown.scale.y = 0.95; hat.add(crown);
      const b = cyl(0.106, 0.106, 0.02, band, 22); b.position.y = 0.01; hat.add(b);
    } else if (style === 'sombrero') {
      const brim = mesh(new THREE.ConeGeometry(0.36, 0.06, 32, 1, true), hatMat); brim.position.y = 0.0; brim.material = hatMat.clone(); brim.material.side = THREE.DoubleSide; hat.add(brim);
      const rim = mesh(new THREE.TorusGeometry(0.355, 0.012, 6, 36), hatMat); rim.rotation.x = Math.PI / 2; rim.position.y = -0.028; hat.add(rim);
      const crown = mesh(new THREE.ConeGeometry(0.11, 0.24, 20), hatMat); crown.position.y = 0.12; hat.add(crown);
      const b = cyl(0.1, 0.105, 0.03, mat(0xc8a040, 0.6), 20); b.position.y = 0.03; hat.add(b);
    } else if (style === 'veil') {
      const brim = cyl(0.25, 0.25, 0.008, hatMat, 32); hat.add(brim);
      const crown = cyl(0.09, 0.1, 0.07, hatMat, 20); crown.position.y = 0.04; hat.add(crown);
      const flower = sphere(0.03, mat(0x5a0a0e, 0.6)); flower.position.set(0.09, 0.05, 0.06); hat.add(flower);
      const veil = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.2, 28, 1, true), mat(0x080808, 1, { transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
      veil.position.y = -0.1; hat.add(veil);
    }

    // arms: shoulder -> elbow -> hand; the right hand holds the revolver
    function arm(side) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * (shoulderW / 2 - 0.01), 0.5, 0); spine.add(shoulder);
      const upper = cyl(0.055, 0.05, 0.3, coat, 10); upper.position.y = -0.15; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
      const fore = cyl(0.048, 0.042, 0.27, coat, 10); fore.position.y = -0.135; elbow.add(fore);
      const hand = new THREE.Group(); hand.position.y = -0.29; elbow.add(hand);
      const palm = box(0.07, 0.07, 0.035, skin); hand.add(palm);
      // four fingers curled forward and a thumb
      for (let f = 0; f < 4; f++) {
        const fin = box(0.015, 0.045, 0.018, skin); fin.position.set(-0.026 + f * 0.017, -0.05, 0.012); fin.rotation.x = 0.7; hand.add(fin);
      }
      const thumb = box(0.016, 0.04, 0.018, skin); thumb.position.set(side * -0.038, -0.02, 0.018); thumb.rotation.z = side * 0.5; hand.add(thumb);
      const cuff = cyl(0.05, 0.05, 0.03, shirt, 10); cuff.position.y = 0.035; hand.add(cuff);
      return { shoulder, elbow, hand, L1: 0.3, L2: 0.29 };
    }
    const rArm = arm(-1), lArm = arm(1);

    const gun = revolver(gunSkin);
    gun.group.rotation.x = Math.PI / 2;          // barrel follows the forearm
    gun.group.position.set(0, -0.04, 0.0);
    gun.group.scale.setScalar(1.25);
    rArm.hand.add(gun.group);

    if (L.build) root.scale.set(L.build.w, L.build.h, L.build.w);
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { root, spine, head, hat, rArm, lArm, gun, eyes, eyeMat, torso, brows };
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
  // Double-barrel coach gun with a break action. Same layout as the revolver
  // (barrels along +Z, grip down -Y) so it fits the same hand and aiming code.
  // `barrels` pivots at the hinge to break open; `shells` sit in the chambers.
  function shotgun(skin) {
    const m = gunLook(skin, 'shotgun');
    const g = new THREE.Group();
    const barrels = new THREE.Group();
    barrels.position.set(0, -0.004, 0.035);             // hinge pin
    [-0.0125, 0.0125].forEach(x => {
      const b = cyl(0.0115, 0.0128, 0.46, m.blued, 24);
      b.rotation.x = Math.PI / 2; b.position.set(x, 0.016, 0.23); barrels.add(b);
      const bore = cyl(0.0085, 0.0085, 0.004, m.black, 14, { cast: false });
      bore.rotation.x = Math.PI / 2; bore.position.set(x, 0.016, 0.459); barrels.add(bore);
    });
    const rib = box(0.008, 0.005, 0.44, m.steel); rib.position.set(0, 0.029, 0.23); barrels.add(rib);
    const bead = sphere(0.0022, m.brass); bead.position.set(0, 0.033, 0.448); barrels.add(bead);
    const lug = box(0.02, 0.012, 0.03, m.steel); lug.position.set(0, 0.0, 0.0); barrels.add(lug);
    const fore = profile([[0.06, 0.006], [0.2, 0.008], [0.205, -0.008, 0.19, -0.016], [0.07, -0.018]], 0.042, m.grip, 0.003);
    barrels.add(fore);
    const shells = [-0.0125, 0.0125].map(x => {
      const sh = new THREE.Group();
      const hull = cyl(0.0105, 0.0105, 0.055, m.shell || new THREE.MeshStandardMaterial({ color: col(0x8a1a14), roughness: 0.6 }), 14);
      hull.rotation.x = Math.PI / 2; sh.add(hull);
      const head = cyl(0.0115, 0.0115, 0.008, m.ammo, 14); head.rotation.x = Math.PI / 2; head.position.z = -0.03; sh.add(head);
      sh.position.set(x, 0.016, 0.03);
      barrels.add(sh);
      return sh;
    });
    g.add(barrels);

    // engraved receiver, top lever, twin hammers and triggers
    g.add(profile([[-0.05, 0.03], [0.034, 0.03], [0.034, -0.02], [-0.02, -0.028], [-0.05, -0.02]], 0.046, m.engraved, 0.002));
    const lever = profile([[-0.05, 0.034], [-0.02, 0.034], [-0.028, 0.04], [-0.05, 0.04]], 0.012, m.blued, 0.001);
    lever.rotation.z = 0.0; g.add(lever);
    const hammers = new THREE.Group();
    [-0.012, 0.012].forEach(x => {
      const h = profile([[-0.004, 0], [0.004, 0], [0.002, 0.018], [-0.014, 0.026, -0.018, 0.02], [-0.008, 0.012]], 0.006, m.blued, 0.001);
      h.position.x = x; hammers.add(h);
    });
    hammers.position.set(0, 0.026, -0.036);
    g.add(hammers);
    const guard = mesh(new THREE.TorusGeometry(0.02, 0.0032, 8, 20, Math.PI), m.blued);
    guard.rotation.set(Math.PI, Math.PI / 2, 0); guard.position.set(0, -0.026, -0.022); g.add(guard);
    [-0.008, -0.022].forEach(z => { const t = box(0.004, 0.016, 0.004, m.nickel); t.position.set(0, -0.028, z); t.rotation.x = 0.3; g.add(t); });

    // walnut stock with a pistol-grip wrist and a butt plate
    g.add(profile([[-0.05, 0.028], [-0.12, 0.012, -0.32, 0.0], [-0.33, -0.1], [-0.25, -0.088, -0.13, -0.06], [-0.09, -0.07], [-0.06, -0.04, -0.05, -0.02]], 0.04, m.grip, 0.004));
    const butt = profile([[-0.33, 0.004], [-0.336, 0.004], [-0.336, -0.104], [-0.33, -0.104]], 0.044, m.black, 0.001);
    g.add(butt);

    // skin decorations on the barrels break open with them
    decorate(barrels, m, 'shotgun', 'barrels');
    decorate(g, m, 'shotgun', 'body');
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.016, 0.465); barrels.add(muzzle);
    // the hand code expects a cylinder; give it a harmless stand-in
    const cylinder = new THREE.Group(); g.add(cylinder);
    return { group: g, cylinder, hammer: hammers, muzzle, chambers: [], rounds: [], barrels, shells, shotgun: true };
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

  // Pineapple grenade: grooved body, spoon lever and a pin ring.
  function grenade() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: col(0x3a4428), roughness: 0.65, metalness: 0.2,
      map: Util.canvasTexture(64, 64, (c, w, h) => { c.fillStyle = '#7a8a5a'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a3018';
        for (let i = 0; i < 8; i++) { c.fillRect(i * 8, 0, 2, h); c.fillRect(0, i * 8, w, 2); } }) });
    const egg = sphere(0.032, body); egg.scale.set(1, 1.25, 1); g.add(egg);
    const m = mats();
    const top = cyl(0.012, 0.014, 0.022, m.steel, 12); top.position.y = 0.045; g.add(top);
    const spoon = box(0.01, 0.06, 0.006, m.steel); spoon.position.set(0, 0.03, 0.03); spoon.rotation.x = -0.15; g.add(spoon);
    const ring = mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 16), m.nickel); ring.position.set(-0.02, 0.05, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
    g.userData.ring = ring;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // The bomb from the Nuclear card: fins, a nose cone and a radiation band.
  function missile() {
    const g = new THREE.Group();
    const m = mats();
    const shell = new THREE.MeshStandardMaterial({ color: col(0x5a6058), metalness: 0.6, roughness: 0.45 });
    const band = new THREE.MeshStandardMaterial({ roughness: 0.5, map: Util.canvasTexture(256, 64, (c, w, h) => {
      c.fillStyle = '#e8c030'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111';
      for (let k = 0; k < 4; k++) { const cx = 32 + k * 64, cy = 32;
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.094; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 24, a - 0.5, a + 0.5); c.fill(); }
        c.beginPath(); c.arc(cx, cy, 6, 0, 7); c.fill(); }
    }) });
    const body = cyl(0.16, 0.16, 1.1, shell, 28); g.add(body);
    const stripe = cyl(0.162, 0.162, 0.22, band, 28); stripe.position.y = 0.15; g.add(stripe);
    const nose = mesh(new THREE.ConeGeometry(0.16, 0.4, 28), shell); nose.position.y = -0.75; nose.rotation.x = Math.PI; g.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = box(0.02, 0.3, 0.22, m.steel); const a = i * Math.PI / 2;
      fin.position.set(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2); fin.rotation.y = -a; g.add(fin);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // Riveted steel shield that stands up on the table (Block card).
  function shield() {
    const g = new THREE.Group();
    const m = mats();
    const plate = profile([[-0.16, 0], [0.16, 0], [0.16, 0.22], [0.0, 0.3, -0.16, 0.22]], 0.012, m.steel, 0.004);
    plate.rotation.y = 0; g.add(plate);
    for (let i = 0; i < 6; i++) { const r = sphere(0.007, m.nickel); r.position.set(-0.13 + (i % 3) * 0.13, 0.04 + Math.floor(i / 3) * 0.14, 0.009); g.add(r); }
    const foot = box(0.3, 0.012, 0.08, m.steel); foot.position.y = 0.006; g.add(foot);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // A painted red tally mark (one per life).
  function lifeMark() {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.07),
      new THREE.MeshStandardMaterial({ color: col(0xc01010), emissive: col(0x500000), roughness: 0.6 }));
    return mark;
  }

  return {
    shotgun, crate, item, couch, lifeMark, grenade, missile, shield, profile,
    V, tex, mats, gunLook, revolver, card, setCardFace, cardFace, outlaw, table, chair, bookshelf, desk,
    door, pictureFrame, hangingLamp, target, bullet, decal, CARD_W, CARD_H,
  };
})();
