// UNTITLED — First Demo (vertical slice) — "CoD1 milestone" build
// Three.js FPS: textured world (all textures painted procedurally on canvas — no assets),
// modeled gun viewmodels with animations (bob/sway/recoil/reload/muzzle flash/shells),
// soldier models with death animations, ADS, KB+mouse + controller + touch,
// nameplate system, friendly-fire lockout, story intro.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---------------------------------------------------------------- crash visibility (mobile debugging)
function showFatal(msg) {
  let b = document.getElementById('fatal');
  if (!b) {
    b = document.createElement('div');
    b.id = 'fatal';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#7a1226;color:#fff;font:12px monospace;padding:10px 14px;white-space:pre-wrap;';
    document.body.appendChild(b);
  }
  b.textContent = '⚠ GAME ERROR (send this to Claude):\n' + msg;
}
window.addEventListener('error', (e) => showFatal((e.message || 'unknown') + '\n' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => showFatal('Promise: ' + (e.reason && e.reason.message || e.reason)));

(() => {
  const ok = document.createElement('div');
  ok.id = 'jsok';
  ok.style.cssText = 'position:fixed;left:8px;bottom:6px;z-index:98;color:#a6e3a1;font:10px monospace;opacity:.7;';
  ok.textContent = 'js: loading…';
  document.body.appendChild(ok);
})();

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;                     // real shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // filmic tone curve
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const BASE_FOV = 75, ADS_FOV = 58;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 600);
const PLAYER_H = 1.7, CROUCH_H = 1.0;
camera.position.set(0, PLAYER_H, 8);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- procedural textures (painted in code)
function canvasTex(size, painter, rx = 1, ry = 1, mult = 2) {
  // paint at logical `size`, render at `size*mult` — vector draws (rects, arcs,
  // gradients, text) come out genuinely high-res, not upscaled
  const c = document.createElement('canvas'); c.width = c.height = size * mult;
  const ctx = c.getContext('2d');
  ctx.scale(mult, mult);
  painter(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// generate a NORMAL MAP from a painted height field (Sobel filter) — bump detail in code
function normalFromHeight(heightPainter, logical = 256, strength = 2.2, rx = 1, ry = 1) {
  const size = logical * 2;                                    // double-res normals
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(2, 2);
  heightPainter(x, logical);
  const d = x.getImageData(0, 0, size, size).data;
  const h = (i, j) => d[(((j + size) % size) * size + ((i + size) % size)) * 4] / 255;
  const n = document.createElement('canvas'); n.width = n.height = size;
  const nx = n.getContext('2d');
  const out = nx.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (h(i + 1, j) - h(i - 1, j)) * strength;
    const dy = (h(i, j + 1) - h(i, j - 1)) * strength;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    const o = (j * size + i) * 4;
    out.data[o] = (-dx * inv * 0.5 + 0.5) * 255;
    out.data[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
    out.data[o + 2] = inv * 255;
    out.data[o + 3] = 255;
  }
  nx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
// height painters for the world's materials
const brickNormal = normalFromHeight((x, s) => {
  x.fillStyle = '#404040'; x.fillRect(0, 0, s, s);          // mortar low
  const bh = 16, bw = 42;
  for (let row = 0; row < s / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < s / bw + 1; col++) {
      x.fillStyle = `hsl(0,0%,${rnd(72, 82) | 0}%)`;         // brick faces high
      x.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
}, 256, 2.6, 3, 2);
const stuccoNormal = normalFromHeight((x, s) => {
  x.fillStyle = '#808080'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 5200; i++) {
    x.fillStyle = `hsl(0,0%,${rnd(35, 68) | 0}%)`;
    x.fillRect(rnd(0, s), rnd(0, s), rnd(1, 4), rnd(1, 3));
  }
}, 256, 1.5);
const plankNormal = normalFromHeight((x, s) => {
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, s, s);
  for (let p = 0; p < 4; p++) {
    x.fillStyle = '#2a2a2a'; x.fillRect(0, p * 64, s, 4);   // deep gaps
    for (let i = 0; i < 8; i++) {
      x.fillStyle = `hsl(0,0%,${rnd(48, 66) | 0}%)`;
      x.fillRect(0, p * 64 + rnd(8, 58), s, rnd(1, 3));      // grain grooves
    }
  }
}, 256, 2.4);
const groundNormal = normalFromHeight((x, s) => {
  x.fillStyle = '#787878'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `hsl(0,0%,${rnd(38, 62) | 0}%)`;
    x.fillRect(rnd(0, s), rnd(0, s), rnd(1, 4), rnd(1, 3));
  }
  for (let i = 0; i < 120; i++) {                            // stone bumps
    const cx = rnd(0, s), cy = rnd(0, s), r = rnd(2, 6);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, '#d8d8d8'); g.addColorStop(1, '#787878');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
}, 256, 2.0, 26, 26);

// ---- fractal value-noise: the difference between "TV static" and real material ----
function noiseCanvas(cell) {
  const c = document.createElement('canvas'); c.width = c.height = cell;
  const x = c.getContext('2d');
  const img = x.createImageData(cell, cell);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd(0, 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
function mottle(ctx, s, cells, op, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.imageSmoothingEnabled = true;
  cells.forEach((cell, k) => {
    ctx.globalAlpha = alpha * Math.pow(0.62, k);
    ctx.drawImage(noiseCanvas(cell), 0, 0, s, s);   // smoothed upscale = soft octave
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

// dirt ground — layered earth tones, fractal mottling, shadowed pebbles, grass tufts
const dirtTex = canvasTex(512, (ctx, s) => {
  ctx.fillStyle = '#6f5b40'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) {             // broad earth-tone patches (ochre/umber/olive)
    const x = rnd(0, s), y = rnd(0, s), r = rnd(50, 160);
    const cols = ['122,101,71', '95,79,56', '107,106,74', '130,110,80'];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${cols[i % 4]},0.35)`);
    g.addColorStop(1, `rgba(${cols[i % 4]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  mottle(ctx, s, [7, 13, 27, 53], 'overlay', 0.5);   // natural large-to-fine mottling
  mottle(ctx, s, [17, 67], 'multiply', 0.28);
  for (let i = 0; i < 260; i++) {            // pebbles WITH drop shadows
    const x = rnd(0, s), y = rnd(0, s), rx2 = rnd(1, 4), ry2 = rnd(1, 3), a = rnd(0, 3);
    ctx.fillStyle = 'rgba(20,14,8,0.4)';
    ctx.beginPath(); ctx.ellipse(x + 1.2, y + 1.4, rx2, ry2, a, 0, 7); ctx.fill();
    ctx.fillStyle = `hsl(${rnd(28, 45) | 0},${rnd(8, 20) | 0}%,${rnd(42, 68) | 0}%)`;
    ctx.beginPath(); ctx.ellipse(x, y, rx2, ry2, a, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 220; i++) {            // grass TUFTS — blade strokes, not blobs
    const x = rnd(0, s), y = rnd(0, s);
    ctx.strokeStyle = `hsl(${rnd(72, 105) | 0},${rnd(28, 46) | 0}%,${rnd(24, 38) | 0}%)`;
    ctx.lineWidth = rnd(0.7, 1.4);
    for (let b2 = 0; b2 < 4; b2++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + rnd(-3, 3), y - rnd(2, 5), x + rnd(-5, 5), y - rnd(4, 9));
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(35,25,15,0.3)'; ctx.lineWidth = 1;   // dry earth cracks
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = rnd(0, s), y = rnd(0, s);
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rnd(-22, 22); y += rnd(-22, 22); ctx.lineTo(x, y); }
    ctx.stroke();
  }
}, 26, 26);

// plaster wall w/ stains, cracks and painted windows
function wallTexture(base, trim) {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    mottle(ctx, s, [9, 21, 47], 'overlay', 0.38);      // plaster mottling — aged, uneven
    mottle(ctx, s, [15, 61], 'multiply', 0.2);
    for (let i = 0; i < 12; i++) {           // grime streaks from top
      const x = rnd(0, s);
      const g = ctx.createLinearGradient(0, 0, 0, rnd(60, 200));
      g.addColorStop(0, 'rgba(40,35,30,0.25)'); g.addColorStop(1, 'rgba(40,35,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, rnd(6, 22), 200);
    }
    { // weathering: rain-splash grime at the base, sun-fade at the top, corner AO
      const gb = ctx.createLinearGradient(0, s, 0, s - 90);
      gb.addColorStop(0, 'rgba(48,40,28,0.42)'); gb.addColorStop(1, 'rgba(48,40,28,0)');
      ctx.fillStyle = gb; ctx.fillRect(0, s - 90, s, 90);
      const gt = ctx.createLinearGradient(0, 0, 0, 60);
      gt.addColorStop(0, 'rgba(255,250,235,0.10)'); gt.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = gt; ctx.fillRect(0, 0, s, 60);
      [[0, 0, 26, s], [s - 26, 0, 26, s]].forEach(([ex, ey, ew, eh]) => {
        const ga = ctx.createLinearGradient(ex, 0, ex === 0 ? ew : s - ew, 0);
        ga.addColorStop(ex === 0 ? 0 : 1, 'rgba(20,16,10,0.22)');
        ga.addColorStop(ex === 0 ? 1 : 0, 'rgba(20,16,10,0)');
        ctx.fillStyle = ga; ctx.fillRect(ex, ey, ew, eh);
      });
    }
    // windows (2 rows)
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const wx = 60 + col * 150, wy = 90 + row * 220, ww = 78, wh = 110;
      ctx.fillStyle = trim; ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);      // frame
      const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);              // glass
      g.addColorStop(0, '#232c34'); g.addColorStop(0.5, '#3a4a55'); g.addColorStop(1, '#1c2329');
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeStyle = trim; ctx.lineWidth = 5;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
      // sun glint on the glass + water-stain drips bleeding from the sill
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(wx + 6, wy + wh - 8); ctx.lineTo(wx + ww - 20, wy + 8);
      ctx.lineTo(wx + ww - 6, wy + 8); ctx.lineTo(wx + 18, wy + wh - 8); ctx.closePath(); ctx.fill();
      for (let dr = 0; dr < 3; dr++) {
        const dx2 = wx + rnd(4, ww - 8);
        const g2 = ctx.createLinearGradient(0, wy + wh + 8, 0, wy + wh + rnd(26, 60));
        g2.addColorStop(0, 'rgba(52,44,32,0.32)'); g2.addColorStop(1, 'rgba(52,44,32,0)');
        ctx.fillStyle = g2; ctx.fillRect(dx2, wy + wh + 8, rnd(2.5, 6), 60);
      }
    }
    // crack lines
    ctx.strokeStyle = 'rgba(30,25,20,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = rnd(0, s), y = 0;
      ctx.moveTo(x, y);
      while (y < s) { x += rnd(-14, 14); y += rnd(18, 45); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
}
const wallTexA = wallTexture('#b8a284', '#4a3b2c');
const wallTexB = wallTexture('#a49478', '#3c3128');
const wallTexC = wallTexture('#8f8a7a', '#2f2a24');

// brick — per-brick hue variation, top-light shading, mortar shadows, aged grime
const brickTex = canvasTex(512, (ctx, s) => {
  ctx.fillStyle = '#5f5148'; ctx.fillRect(0, 0, s, s);   // mortar
  const bh = 32, bw = 84;
  for (let row = 0; row < s / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < s / bw + 1; col++) {
      const bx = col * bw + off + 3, by = row * bh + 3, bwi = bw - 6, bhi = bh - 6;
      const hue = rnd(8, 22), sat = rnd(28, 48), lit = rnd(30, 44);
      const g = ctx.createLinearGradient(0, by, 0, by + bhi);          // top-lit face
      g.addColorStop(0, `hsl(${hue | 0},${sat | 0}%,${(lit + 7) | 0}%)`);
      g.addColorStop(1, `hsl(${hue | 0},${sat | 0}%,${(lit - 4) | 0}%)`);
      ctx.fillStyle = g; ctx.fillRect(bx, by, bwi, bhi);
      ctx.fillStyle = 'rgba(25,18,12,0.4)';                            // shadow under the brick
      ctx.fillRect(bx, by + bhi, bwi, 2.5);
      for (let i = 0; i < 26; i++) {                                    // pitting
        ctx.fillStyle = `rgba(0,0,0,${rnd(0.04, 0.14)})`;
        ctx.fillRect(bx + rnd(0, bwi), by + rnd(0, bhi), rnd(1, 2.5), rnd(1, 2));
      }
      if (Math.random() < 0.12) {                                       // the odd broken corner
        ctx.fillStyle = '#5f5148';
        ctx.beginPath(); ctx.moveTo(bx + bwi, by);
        ctx.lineTo(bx + bwi - rnd(6, 16), by); ctx.lineTo(bx + bwi, by + rnd(5, 12));
        ctx.closePath(); ctx.fill();
      }
    }
  }
  mottle(ctx, s, [11, 31], 'multiply', 0.22);                           // aged grime wash
  mottle(ctx, s, [23], 'overlay', 0.25);
}, 3, 2);

// wood planks — hue-varied boards, wavy grain, KNOTS, weathered wash
const woodTex = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#8a6a42'; ctx.fillRect(0, 0, s, s);
  for (let p = 0; p < 4; p++) {
    const py = p * 64;
    const g = ctx.createLinearGradient(0, py, 0, py + 62);
    const l = rnd(38, 50);
    g.addColorStop(0, `hsl(${rnd(26, 34) | 0},${rnd(30, 42) | 0}%,${(l + 4) | 0}%)`);
    g.addColorStop(1, `hsl(${rnd(26, 34) | 0},${rnd(30, 42) | 0}%,${(l - 3) | 0}%)`);
    ctx.fillStyle = g; ctx.fillRect(0, py + 2, s, 60);
    ctx.strokeStyle = 'rgba(70,50,28,0.55)';
    for (let i = 0; i < 9; i++) {            // wavy long grain
      ctx.lineWidth = rnd(0.6, 1.6);
      ctx.beginPath();
      const y = py + rnd(6, 58);
      ctx.moveTo(0, y);
      for (let x = 0; x < s; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.06 + i) * 1.8 + rnd(-1, 1));
      ctx.stroke();
    }
    if (Math.random() < 0.8) {               // a knot with rings bending the grain
      const kx = rnd(30, s - 30), ky = py + rnd(18, 46);
      for (let r = 6; r > 0; r -= 1.6) {
        ctx.strokeStyle = `rgba(60,40,22,${0.25 + (6 - r) * 0.08})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(kx, ky, r * 1.6, r, 0, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(48,30,16,0.85)';
      ctx.beginPath(); ctx.ellipse(kx, ky, 2.6, 1.8, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,20,10,0.5)';     // plank gap shadow
    ctx.fillRect(0, py, s, 2.5);
  }
  mottle(ctx, s, [13, 41], 'multiply', 0.2);  // weathering wash
  ctx.fillStyle = 'rgba(45,30,15,0.9)';       // nails
  [20, 236].forEach(x => { for (let p = 0; p < 4; p++) { ctx.beginPath(); ctx.arc(x, p * 64 + 32, 3, 0, 7); ctx.fill(); } });
});

// gunmetal
const metalTex = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#2a2d31'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${rnd(50, 90) | 0},${rnd(52, 92) | 0},${rnd(55, 95) | 0},${rnd(0.05, 0.2)})`;
    ctx.fillRect(rnd(0, s), rnd(0, s), rnd(6, 30), 1);
  }
});

// camo fabric
function camoTex(c1, c2, c3) {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, s, s);
    [c2, c3].forEach(c => {
      ctx.fillStyle = c;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        const x = rnd(0, s), y = rnd(0, s);
        ctx.moveTo(x, y);
        for (let a = 0; a < 6.3; a += 0.8) {
          const r = rnd(10, 30);
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
      }
    });
    mottle(ctx, s, [19, 53], 'overlay', 0.3);         // fabric depth
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';             // weave threads
    for (let y = 0; y < s; y += 2.5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
  });
}
const camoGreen = camoTex('#4a5a3a', '#2f3d27', '#6b6f4d');
const camoBlack = camoTex('#23262b', '#15171b', '#33373e');

// sky dome — overcast-blue with painted clouds
const skyTex = canvasTex(1024, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#7fa6c9'); g.addColorStop(0.45, '#a7c2d8'); g.addColorStop(0.75, '#cfd8d6'); g.addColorStop(1, '#d8d3c2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 150; i++) {            // cloud blobs
    const x = rnd(0, s), y = rnd(s * 0.1, s * 0.6), r = rnd(20, 90);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, `rgba(255,255,255,${rnd(0.10, 0.30)})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
});

// ---------------------------------------------------------------- sky, fog, lights (daylight — CoD1 palette)
scene.background = new THREE.Color(0xa7c2d8);
scene.fog = new THREE.Fog(0xc4bda8, 40, 230);   // warm dust haze — the RDR distance
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 14),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
scene.add(skyDome);

scene.add(new THREE.HemisphereLight(0xc4d2e0, 0x77653f, 0.85));
const sun = new THREE.DirectionalLight(0xffe9c2, 1.45);   // warm late-day sun
sun.position.set(24, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8797a5, 0.35));

// environment cube (painted sky gradient) — gives metals REAL reflections
const envFaces = [];
for (let i = 0; i < 6; i++) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  if (i === 2) { g.addColorStop(0, '#8fb2d4'); g.addColorStop(1, '#a7c2d8'); }        // up
  else if (i === 3) { g.addColorStop(0, '#6d5a41'); g.addColorStop(1, '#54452f'); }   // down
  else { g.addColorStop(0, '#7fa6c9'); g.addColorStop(0.7, '#cfd8d6'); g.addColorStop(1, '#8a7a5c'); }
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  envFaces.push(c);
}
const envTex = new THREE.CubeTexture(envFaces);
envTex.needsUpdate = true;
envTex.colorSpace = THREE.SRGBColorSpace;
scene.environment = envTex;

// ---------------------------------------------------------------- ground
const groundGeo = new THREE.PlaneGeometry(240, 240, 72, 72);
{ // gentle terrain relief — the ground is no longer a billiard table
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const gx = pos.getX(i), gy = pos.getY(i);
    const d = Math.hypot(gx, gy);
    const amp = d < 12 ? 0 : Math.min(1, (d - 12) / 30);      // dead flat at spawn, rolls further out
    pos.setZ(i, (Math.sin(gx * 0.16) * Math.cos(gy * 0.13) + Math.sin(gx * 0.31 + gy * 0.21) * 0.5) * 0.22 * amp);
  }
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo,
  new THREE.MeshStandardMaterial({ map: dirtTex, normalMap: groundNormal,
    normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// distant mountain ring + haze — the world no longer ends at a fog wall
const mtnMat = new THREE.MeshBasicMaterial({ color: 0x8d9aa8, fog: true });
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2 + 0.2;
  const r = 195 + (i % 3) * 18;
  const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(28, 55), rnd(26, 48), 5), mtnMat);
  m.position.set(Math.cos(a) * r, 4, Math.sin(a) * r);
  m.rotation.y = rnd(0, 3);
  scene.add(m);
}

// ---------------------------------------------------------------- war-damage fire system (shared by every burning building)
const charMat = new THREE.MeshStandardMaterial({ color: 0x241f19, roughness: 1 });
const flameTex = canvasTex(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s * 0.62, 0, s / 2, s * 0.62, s * 0.55);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.35, 'rgba(255,160,40,0.9)');
  g.addColorStop(0.75, 'rgba(220,70,15,0.5)');
  g.addColorStop(1, 'rgba(180,40,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
const fireSys = { emitters: [], smokes: [], light: null };
function addFlame(x, y, z, sc) {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
  f.position.set(x, y, z);
  f.userData = { base: sc, phase: rnd(0, 9), y0: y };
  f.scale.setScalar(sc);
  scene.add(f);
  return f;
}
function addFireEmitter(x, y, z, opts = {}) {
  const em = { x, y, z, flames: [], smokeT: rnd(0, 0.4), rate: opts.rate || 0.5, big: !!opts.big };
  (opts.flames || []).forEach(([fx, fy, fz, sc]) => em.flames.push(addFlame(fx, fy, fz, sc)));
  fireSys.emitters.push(em);
  return em;
}
function updateFire(dt, t) {
  for (const em of fireSys.emitters) {
    for (const f of em.flames) {
      const w = Math.sin(t * 13 + f.userData.phase) * 0.5 + Math.sin(t * 29 + f.userData.phase * 2) * 0.5;
      f.scale.set(f.userData.base * (1 + w * 0.18), f.userData.base * (1 + w * 0.3), 1);
      f.position.y = f.userData.y0 + w * 0.06;
      f.material.opacity = 0.8 + w * 0.15;
    }
    em.smokeT += dt;
    if (em.smokeT > em.rate) {
      em.smokeT = 0;
      if (fireSys.smokes.length > 120) scene.remove(fireSys.smokes.shift());
      const m = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false,
        opacity: 0.45, color: 0x4a453e });
      const s = new THREE.Sprite(m);
      s.position.set(em.x + rnd(-0.7, 0.7), em.y + rnd(0, 0.5), em.z + rnd(-0.7, 0.7));
      s.scale.setScalar(rnd(0.6, 1.1) * (em.big ? 1.4 : 1));
      s.userData = { t: 0, drift: new THREE.Vector3(rnd(0.15, 0.45), rnd(0.9, 1.4), rnd(-0.1, 0.1)) };
      scene.add(s);
      fireSys.smokes.push(s);
    }
  }
  for (let i = fireSys.smokes.length - 1; i >= 0; i--) {
    const s = fireSys.smokes[i];
    s.userData.t += dt;
    s.position.addScaledVector(s.userData.drift, dt);
    s.scale.multiplyScalar(1 + dt * 0.55);
    s.material.opacity = Math.max(0, 0.45 - s.userData.t * 0.075);
    if (s.userData.t > 6) { scene.remove(s); fireSys.smokes.splice(i, 1); }
  }
  if (fireSys.light) fireSys.light.intensity = 2.7 + Math.sin(t * 17) * 0.7 + Math.sin(t * 7.3) * 0.5;
}

// ---------------------------------------------------------------- village buildings + props (collidable)
const buildings = [];
const wallMats = [wallTexA, wallTexB, wallTexC, brickTex];
function makeBuilding(x, z, w, h, d, i, forceIntact = false) {
  const tex = wallMats[i % wallMats.length];
  const isBrick = tex === brickTex;
  const wall = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95,
    normalMap: isBrick ? brickNormal : stuccoNormal,
    normalScale: new THREE.Vector2(isBrick ? 0.9 : 0.5, isBrick ? 0.9 : 0.5) });
  const roof = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  const ry = (i % 4) * 0.12 - 0.18;
  const damaged = !forceIntact;   // M1 canon: "Whole blocks burning… is the WHOLE CITY on fire?" — every building is hit

  if (!damaged) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall, wall, roof, roof, wall, wall]);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (i % 3 === 0) {
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 1.6 + (i % 2), 4),
        new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.9 }));
      pyr.position.set(x, h + 0.8, z); pyr.rotation.y = ry + Math.PI / 4;
      pyr.castShadow = true;
      scene.add(pyr);
    } else {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.28, d + 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3f342a, roughness: 1 }));
      lip.position.set(x, h + 0.1, z); lip.rotation.y = ry;
      lip.castShadow = true;
      scene.add(lip);
    }
    buildings.push(new THREE.Box3().setFromObject(mesh));
    return;
  }

  // WAR-TORN: one half still standing and normal, the other half collapsed — and burning
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const wi = w * 0.55, wd = w * 0.45;
  const xi = -(w - wi) / 2, xd = (w - wd) / 2;      // centers of the intact / destroyed halves
  const intact = new THREE.Mesh(new THREE.BoxGeometry(wi, h, d), [wall, wall, roof, roof, wall, wall]);
  intact.position.set(xi, h / 2, 0);
  intact.castShadow = true; intact.receiveShadow = true;
  const hs = h * rnd(0.3, 0.55);                    // the fallen half is a low broken stub
  const stub = new THREE.Mesh(new THREE.BoxGeometry(wd, hs, d), [wall, wall, charMat, charMat, wall, wall]);
  stub.position.set(xd, hs / 2, 0);
  stub.castShadow = true; stub.receiveShadow = true;
  // charred break line: burnt cap on the stub + jagged chunks + soot climbing the intact wall
  const cap = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.1, 0.16, d + 0.1), charMat);
  cap.position.set(xd, hs + 0.08, 0);
  const soot = new THREE.Mesh(new THREE.BoxGeometry(0.12, h * 0.45, d * 0.8), charMat);
  soot.position.set((2 * wi - w) / 2 + 0.02, h * 0.72, 0);
  g.add(intact, stub, cap, soot);
  for (let j = 0; j < 5; j++) {
    const jag = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.3, 0.7), rnd(0.4, 1.1), 0.3), charMat);
    jag.position.set(xd + rnd(-wd / 2 + 0.3, wd / 2 - 0.3), hs + rnd(0.2, 0.6), rnd(-d / 2 + 0.3, d / 2 - 0.3));
    jag.rotation.z = rnd(-0.3, 0.3);
    g.add(jag);
  }
  // the collapsed roof slab, fallen and leaning from the intact half down onto the stub
  const slab = new THREE.Mesh(new THREE.BoxGeometry(wd * 1.15, 0.14, d * 0.85),
    new THREE.MeshStandardMaterial({ color: 0x4a3c2f, roughness: 1 }));
  slab.position.set(xd - 0.15, hs + (h - hs) * 0.35, rnd(-0.3, 0.3));
  slab.rotation.z = -Math.atan2((h - hs) * 0.6, wd) + rnd(-0.1, 0.1);
  slab.rotation.y = rnd(-0.12, 0.12);
  slab.castShadow = true;
  g.add(slab);
  // shell holes punched through the surviving wall — dark breaches with rubble below
  for (let j = 0; j < 2; j++) {
    const holeZ = (j % 2 ? 1 : -1) * (d / 2 + 0.012);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.35, 0.6), 7),
      new THREE.MeshBasicMaterial({ color: 0x0c0a08 }));
    hole.position.set(xi + rnd(-wi / 3, wi / 3), rnd(h * 0.35, h * 0.75), holeZ);
    hole.rotation.y = holeZ > 0 ? 0 : Math.PI;
    hole.rotation.z = rnd(0, 3);
    g.add(hole);
    for (let k = 0; k < 3; k++) {
      const bit = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.12, 0.3), rnd(0.08, 0.2), rnd(0.12, 0.3)), k % 2 ? charMat : wall);
      bit.position.set(hole.position.x + rnd(-0.4, 0.4), rnd(0.05, 0.2), holeZ + (holeZ > 0 ? rnd(0.1, 0.6) : -rnd(0.1, 0.6)));
      bit.rotation.y = rnd(0, 3);
      g.add(bit);
    }
  }
  // rubble spilling off the fallen half
  for (let j = 0; j < 4; j++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.3, 0.7), rnd(0.15, 0.4), rnd(0.3, 0.6)), j % 2 ? charMat : wall);
    r.position.set(xd + rnd(-0.5, 0.8) + wd / 2, rnd(0.08, 0.35), rnd(-d / 2, d / 2));
    r.rotation.set(rnd(0, 0.5), rnd(0, 3), rnd(0, 0.4));
    r.castShadow = true;
    g.add(r);
  }
  // roof lip survives over the intact half only
  const lip = new THREE.Mesh(new THREE.BoxGeometry(wi + 0.4, 0.26, d + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x3f342a, roughness: 1 }));
  lip.position.set(xi, h + 0.08, 0);
  lip.castShadow = true;
  g.add(lip);
  scene.add(g);
  buildings.push(new THREE.Box3().setFromObject(g));
  // EVERY damaged building smokes; half of them carry open flames at the break
  {
    const wx = x + xd * Math.cos(ry), wz = z - xd * Math.sin(ry);
    const flames = (i % 2 === 0)
      ? [[wx + rnd(-0.5, 0.5), hs + 0.4, wz + rnd(-0.4, 0.4), rnd(0.7, 1.1)],
         [wx + rnd(-0.5, 0.5), hs + 0.3, wz + rnd(-0.4, 0.4), rnd(0.5, 0.8)]]
      : [];
    addFireEmitter(wx, hs + 0.2, wz, { rate: rnd(0.8, 1.3), flames });
  }
}
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2, r = 22 + (i % 5) * 6;
  const x = Math.cos(a) * r, z = Math.sin(a) * r - 15;
  if (Math.hypot(x, z - 8) < 11) continue;   // keep the player spawn area clear
  makeBuilding(x, z, 5 + (i % 3) * 2, 4.5 + (i % 5) * 2, 5 + (i % 4) * 2, i);
}
// cover spots the squad AI can duck behind (filled in by the props below)
const coverPoints = [];
// crates
const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9,
  normalMap: plankNormal, normalScale: new THREE.Vector2(0.8, 0.8) });
[[-4, -8, 1.1], [-3, -8.8, 0.9], [-3.5, -7.5, 0.8, 0.9], [6, -10, 1.2], [7.1, -10.3, 0.85],
 [2, -20, 1.0], [-8, -18, 1.1], [10, -22, 0.95]].forEach(([x, z, s, y]) => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
  c.position.set(x, (y || 0) + s / 2, z);
  c.rotation.y = rnd(0, 1.2);
  c.castShadow = true; c.receiveShadow = true;
  scene.add(c);
  buildings.push(new THREE.Box3().setFromObject(c));
  if (!y) coverPoints.push({ x, z, r: s * 0.85 });
});
// barrels
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x39503a, map: metalTex, roughness: 0.7, metalness: 0.35 });
[[-6.5, -13], [5, -15.5], [5.7, -15.2], [-1, -27], [8.5, -25]].forEach(([x, z]) => {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), barrelMat);
  b.position.set(x, 0.55, z);
  b.castShadow = true;
  scene.add(b);
  buildings.push(new THREE.Box3().setFromObject(b));
  coverPoints.push({ x, z, r: 0.75 });
});
// sandbag lines
const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7c5c, roughness: 1 });
function sandbags(x, z, len, ry) {
  const g = new THREE.Group();
  for (let r = 0; r < 3; r++) for (let i = 0; i < len; i++) {
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 3, 6), bagMat);
    bag.rotation.z = Math.PI / 2;
    bag.position.set(i * 0.55 + (r % 2) * 0.24 - len * 0.27, 0.14 + r * 0.24, 0);
    g.add(bag);
  }
  g.position.set(x, 0, z); g.rotation.y = ry;
  scene.add(g);
  buildings.push(new THREE.Box3().setFromObject(g));
}
sandbags(0, -10.5, 7, 0);   coverPoints.push({ x: 0, z: -10.5, r: 1.9 });
sandbags(-9, -24, 6, 0.9);  coverPoints.push({ x: -9, z: -24, r: 1.7 });
sandbags(9, -18, 6, -0.7);  coverPoints.push({ x: 9, z: -18, r: 1.7 });

// ---------------------------------------------------------------- variety props (spheres, cones, reflections)
// jungle trees — cone canopies (triangles) on cylinder trunks; Colombia needs green
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4228, roughness: 1 });
const leafMatA = new THREE.MeshStandardMaterial({ color: 0x2f6b33, roughness: 0.9 });
const leafMatB = new THREE.MeshStandardMaterial({ color: 0x3f7d2e, roughness: 0.9 });
function tree(x, z, s = 1) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 7), trunkMat);
  trunk.position.y = 0.8 * s; trunk.castShadow = true;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.15 * s, 1.9 * s, 8), leafMatA);
  c1.position.y = 2.2 * s; c1.castShadow = true;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.85 * s, 1.5 * s, 8), leafMatB);
  c2.position.y = 3.1 * s; c2.castShadow = true;
  t.add(trunk, c1, c2);
  t.position.set(x, 0, z);
  scene.add(t);
  buildings.push(new THREE.Box3().setFromObject(trunk).expandByScalar(0.1));
}
[[-12, 6, 1.1], [14, 4, 0.9], [-20, -12, 1.3], [18, -8, 1.0], [-6, -31, 0.9], [13, -33, 1.2],
 [24, -20, 1.0], [-24, -20, 1.1], [8, 8, 0.8], [-16, -36, 1.0], [20, 10, 1.2], [-26, 2, 0.9]]
  .forEach(([x, z, s]) => tree(x, z, s));

// water tower — reflective steel sphere on legs (spheres + reflections in one)
{
  const wt = new THREE.Group();
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xb8c2c8, metalness: 1, roughness: 0.18 });
  const tank = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), tankMat);
  tank.position.y = 9; tank.castShadow = true;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.8, roughness: 0.45 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8.4, 8), legMat);
    leg.position.set(Math.cos(a) * 1.4, 4.2, Math.sin(a) * 1.4);
    leg.rotation.z = Math.cos(a) * 0.1; leg.rotation.x = -Math.sin(a) * 0.1;
    leg.castShadow = true;
    wt.add(leg);
  }
  wt.add(tank);
  wt.position.set(-22, 0, -28);
  scene.add(wt);
  buildings.push(new THREE.Box3().setFromObject(wt));
}

// telephone poles with sagging wires down the main street (the RDR skyline)
{
  const poleMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1c1a17 });
  const tops = [];
  [[-4.5, 2], [4.5, -8], [-4.5, -18], [4.5, -28], [-4.5, -38]].forEach(([px, pz]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 7.4, 8), poleMat);
    pole.position.set(px, 3.7, pz);
    pole.castShadow = true;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.09, 0.09), poleMat);
    cross.position.set(px, 6.9, pz);
    scene.add(pole, cross);
    buildings.push(new THREE.Box3().setFromObject(pole));
    tops.push(new THREE.Vector3(px, 7.05, pz));
  });
  for (let i = 0; i < tops.length - 1; i++) {           // catenary sag between poles
    for (const off of [-0.5, 0.5]) {
      const a = tops[i].clone(), b2 = tops[i + 1].clone();
      a.x += off; b2.x += off;
      const pts = [];
      for (let t = 0; t <= 10; t++) {
        const p = a.clone().lerp(b2, t / 10);
        p.y -= Math.sin((t / 10) * Math.PI) * 0.55;     // the sag
        pts.push(p);
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
  }
}

// REAL GRASS — thousands of instanced blade tufts following the terrain (one draw call)
function terrainH(x, z) {
  const d = Math.hypot(x, z);
  const amp = d < 12 ? 0 : Math.min(1, (d - 12) / 30);
  return (Math.sin(x * 0.16) * Math.cos(z * 0.13) + Math.sin(x * 0.31 - z * 0.21) * 0.5) * 0.22 * amp;
}
{
  const grassBladeTex = canvasTex(64, (ctx, s) => {
    for (let b2 = 0; b2 < 8; b2++) {                 // a few blades per tuft card
      const x0 = rnd(8, s - 8);
      const g = ctx.createLinearGradient(0, s, 0, 0);
      const hue = rnd(70, 108) | 0;
      g.addColorStop(0, `hsl(${hue},40%,22%)`);
      g.addColorStop(1, `hsl(${hue},45%,38%)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = rnd(2.5, 4.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, s);
      ctx.quadraticCurveTo(x0 + rnd(-6, 6), s * 0.5, x0 + rnd(-14, 14), rnd(4, s * 0.45));
      ctx.stroke();
    }
  });
  const grassMat = new THREE.MeshStandardMaterial({ map: grassBladeTex, alphaTest: 0.4,
    side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  const COUNT = 3200;
  const grass = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.42), grassMat, COUNT);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let placed = 0, guard = 0;
  const probe = new THREE.Vector3();
  while (placed < COUNT && guard++ < 30000) {
    const x = rnd(-66, 66), z = rnd(-70, 62);
    if (Math.hypot(x, z) > 67) continue;
    probe.set(x, 0.5, z);
    let blocked = false;
    for (const b2 of buildings) if (b2.containsPoint(probe)) { blocked = true; break; }
    if (blocked) continue;
    dummy.position.set(x, terrainH(x, z) + 0.17, z);
    dummy.rotation.y = rnd(0, Math.PI);
    const sc = rnd(0.6, 1.6);
    dummy.scale.set(sc, rnd(0.55, 1.25), sc);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    grass.setColorAt(placed, col.setHSL(rnd(0.2, 0.3), rnd(0.32, 0.5), rnd(0.3, 0.5)));
    placed++;
  }
  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  scene.add(grass);
}

// THE HALF-BURNED HOUSE — one side still a home, the other side rubble and fire
{
  const HX = 15, HZ = 8;
  const wallM = new THREE.MeshStandardMaterial({ map: wallTexA, roughness: 0.95,
    normalMap: stuccoNormal, normalScale: new THREE.Vector2(0.5, 0.5) });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  // the intact half: a real house with windows, roof lip and all
  const intact = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 4.2), [wallM, wallM, roofM, roofM, wallM, wallM]);
  intact.position.set(HX - 1.2, 1.6, HZ);
  intact.castShadow = true; intact.receiveShadow = true;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.26, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x3f342a, roughness: 1 }));
  lip.position.set(HX - 1.2, 3.3, HZ);
  lip.castShadow = true;
  scene.add(intact, lip);
  buildings.push(new THREE.Box3().setFromObject(intact));
  // soot climbing the intact wall where the fire licks it
  const soot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 3.4), charMat);
  soot.position.set(HX + 0.12, 2.2, HZ);
  scene.add(soot);
  // the destroyed half: low broken stubs, still wearing the house's own wall texture
  [[HX + 1.3, 1.0, HZ - 1.95, 2.4, 0.34, 0], [HX + 1.3, 0.7, HZ + 1.95, 2.4, 0.34, 0],
   [HX + 2.45, 1.15, HZ, 0.34, 3.9, 0]].forEach(([bx, bh, bz, bw, bd]) => {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), [wallM, wallM, charMat, charMat, wallM, wallM]);
    stub.position.set(bx, bh / 2, bz);
    stub.castShadow = true; stub.receiveShadow = true;
    scene.add(stub);
    buildings.push(new THREE.Box3().setFromObject(stub));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.08, 0.12, bd + 0.08), charMat);
    cap.position.set(bx, bh + 0.06, bz);
    scene.add(cap);
  });
  // collapsed burnt roof beams across the open half
  for (let i = 0; i < 4; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, rnd(2.6, 3.8)),
      new THREE.MeshStandardMaterial({ color: 0x211d18, roughness: 1 }));
    beam.position.set(HX + rnd(0.6, 2.2), rnd(0.6, 1.3), HZ + rnd(-1, 1));
    beam.rotation.set(rnd(-0.5, -0.2), rnd(0, 3), rnd(-0.2, 0.2));
    beam.castShadow = true;
    scene.add(beam);
  }
  // rubble where the wall came down
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.3, 0.8), rnd(0.2, 0.45), rnd(0.3, 0.7)),
      i % 2 ? charMat : wallM);
    r.position.set(HX + rnd(0.6, 2.4), rnd(0.1, 0.5), HZ + rnd(-1.5, 1.5));
    r.rotation.set(rnd(0, 0.6), rnd(0, 3), rnd(0, 0.5));
    r.castShadow = true; r.receiveShadow = true;
    scene.add(r);
  }
  // scorched ground under the burning half only
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20),
    new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.5, depthWrite: false }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.set(HX + 1.4, 0.015, HZ);
  scene.add(scorch);
  // the fire itself — biggest blaze in the village, with the one real firelight
  addFireEmitter(HX + 1.3, 1.4, HZ, { rate: 0.16, big: true, flames: [
    [HX + 0.8, 0.9, HZ + 0.4, 1.5], [HX + 1.8, 0.7, HZ - 0.9, 1.1],
    [HX + 0.4, 1.9, HZ - 0.2, 0.9], [HX + 2.2, 0.5, HZ + 0.8, 0.8]] });
  fireSys.light = new THREE.PointLight(0xff7726, 3, 14);
  fireSys.light.position.set(HX + 1.2, 1.8, HZ);
  scene.add(fireSys.light);
}

// STREET DEBRIS — the war's litter: rubble piles, scattered bricks, beams, craters
{
  const brickBit = new THREE.MeshStandardMaterial({ color: 0x8a5a48, roughness: 1 });
  const stoneBit = new THREE.MeshStandardMaterial({ color: 0x7d766c, roughness: 1 });
  function debrisPile(x, z, n, spread) {
    for (let i = 0; i < n; i++) {
      const mats = [charMat, brickBit, stoneBit];
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.12, 0.5), rnd(0.08, 0.3), rnd(0.12, 0.45)), mats[i % 3]);
      b2.position.set(x + rnd(-spread, spread), rnd(0.04, 0.22), z + rnd(-spread, spread));
      b2.rotation.set(rnd(0, 0.5), rnd(0, 3), rnd(0, 0.5));
      b2.castShadow = true; b2.receiveShadow = true;
      scene.add(b2);
    }
    // the odd fallen beam
    if (Math.random() < 0.7) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, rnd(1.6, 3)), charMat);
      beam.position.set(x + rnd(-spread, spread), 0.09, z + rnd(-spread, spread));
      beam.rotation.y = rnd(0, 3);
      beam.castShadow = true;
      scene.add(beam);
    }
  }
  [[-8, -6], [7, -4], [-3, -14], [11, -17], [-12, -20], [3, -25], [-7, -30], [14, -26],
   [-16, -10], [18, -14], [0, -34], [-19, 2], [9, 3], [-2, 6]].forEach(([x, z]) => debrisPile(x, z, 8, 1.6));
  // shell craters — scorched dish + a rim of thrown earth
  const craterMat = new THREE.MeshBasicMaterial({ color: 0x191410, transparent: true, opacity: 0.7, depthWrite: false });
  [[-5, -19], [8, -8], [-11, -13], [4, -30], [16, -20], [-15, 5]].forEach(([x, z]) => {
    const c = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.9, 1.5), 16), craterMat);
    c.rotation.x = -Math.PI / 2; c.position.set(x, 0.018, z);
    scene.add(c);
    for (let i = 0; i < 6; i++) {
      const a = rnd(0, 6.3), rr = rnd(1.0, 1.6);
      const clod = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.1, 0.28), rnd(0.08, 0.18), rnd(0.1, 0.24)),
        new THREE.MeshStandardMaterial({ color: 0x4c3e2c, roughness: 1 }));
      clod.position.set(x + Math.cos(a) * rr, 0.07, z + Math.sin(a) * rr);
      clod.rotation.y = rnd(0, 3);
      clod.castShadow = true;
      scene.add(clod);
    }
  });
}

// puddles — mirror-flat reflective discs after the rain
const puddleMat = new THREE.MeshStandardMaterial({ color: 0x93aabb, metalness: 1, roughness: 0.06 });
[[3, -6, 1.4], [-7, -16, 1.9], [7.5, -20, 1.2], [-2, -28, 1.6], [11, -9, 1.0]].forEach(([x, z, r]) => {
  const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddleMat);
  p.rotation.x = -Math.PI / 2; p.position.set(x, 0.012, z);
  p.receiveShadow = true;
  scene.add(p);
});

// ---------------------------------------------------------------- character faces (painted per person)
const entities = [];
function faceTex(f = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256;  // double-res faces
  const x = c.getContext('2d');
  x.scale(2, 2);
  const skin = f.skin || '#c9a184';
  if (f.mask === 'molotov') {
    // Molotov: BLACK KNIT SKI MASK with eye holes and the fire/bottle decal — a masked MAN, not a robot
    x.fillStyle = '#141414'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${rnd(0.015, 0.05)})`; x.fillRect(rnd(0, 128), rnd(0, 128), 1.5, 1); } // knit weave
    // eye holes with real eyes inside
    [[40, 52], [88, 52]].forEach(([ex, ey]) => {
      x.fillStyle = skin; x.beginPath(); x.ellipse(ex, ey, 13, 9, 0, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 8, 5, 0, 0, 7); x.fill();
      x.fillStyle = '#5a3c22'; x.beginPath(); x.arc(ex, ey, 3.4, 0, 7); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(ex, ey, 1.6, 0, 7); x.fill();
    });
    // painted flame decal rising from the chin + tiny molotov bottle on the forehead
    const fl = x.createLinearGradient(0, 128, 0, 78);
    fl.addColorStop(0, '#ff5522'); fl.addColorStop(0.6, '#ff9a2d'); fl.addColorStop(1, 'rgba(255,154,45,0)');
    x.fillStyle = fl;
    x.beginPath(); x.moveTo(8, 128);
    for (let i = 0; i <= 8; i++) x.lineTo(8 + i * 14, 128 - (i % 2 ? rnd(30, 44) : rnd(12, 20)));
    x.lineTo(120, 128); x.closePath(); x.fill();
    x.strokeStyle = '#ff7a2d'; x.lineWidth = 3;
    x.strokeRect(58, 14, 12, 18); x.fillStyle = '#ff7a2d'; x.fillRect(61, 8, 6, 6);   // the bottle
  } else if (f.mask === 'balaclava') {
    // HYDRA trooper: dark balaclava + goggles band
    x.fillStyle = '#1c1e22'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.04)})`; x.fillRect(rnd(0, 128), rnd(0, 128), 1.5, 1); }
    x.fillStyle = '#0c0d10'; x.fillRect(16, 38, 96, 26);                               // goggle band
    [[44, 51], [84, 51]].forEach(([ex, ey]) => {                                       // red lenses
      x.fillStyle = '#3b0f14'; x.beginPath(); x.ellipse(ex, ey, 13, 9, 0, 0, 7); x.fill();
      x.fillStyle = '#a33'; x.beginPath(); x.ellipse(ex - 3, ey - 2, 4, 2.5, 0, 0, 7); x.fill();
    });
  } else {
    // a human face: skin, eyes, brows, nose, mouth — per-character features
    x.fillStyle = skin; x.fillRect(0, 0, 128, 128);
    const shade = x.createLinearGradient(0, 0, 0, 128);
    shade.addColorStop(0, 'rgba(0,0,0,0.08)'); shade.addColorStop(0.5, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.14)');
    x.fillStyle = shade; x.fillRect(0, 0, 128, 128);
    if (f.old) { x.strokeStyle = 'rgba(60,40,30,0.35)'; x.lineWidth = 1.5;             // age lines
      [[30, 80, 55, 84], [98, 80, 73, 84], [40, 100, 88, 100]].forEach(([a, b, cx2, d]) => { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(64, b + 6, cx2, d); x.stroke(); }); }
    if (f.hair) { x.fillStyle = f.hair; x.fillRect(0, 0, 128, 22);                     // fringe
      x.fillRect(0, 0, 10, 60); x.fillRect(118, 0, 10, 60); }
    // eyes
    [[42, 54], [86, 54]].forEach(([ex, ey]) => {
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 9.5, 6, 0, 0, 7); x.fill();
      x.fillStyle = f.eye || '#4a3c28'; x.beginPath(); x.arc(ex, ey, 3.6, 0, 7); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(ex, ey, 1.8, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(ex + 1.4, ey - 1.6, 1, 0, 7); x.fill();
    });
    // brows
    x.fillStyle = f.hair || '#2c2019';
    const tilt = f.worried ? -4 : f.stern ? 4 : 0;
    x.save(); x.translate(42, 43); x.rotate(tilt * 0.04); x.fillRect(-11, -2.5, 22, 5); x.restore();
    x.save(); x.translate(86, 43); x.rotate(-tilt * 0.04); x.fillRect(-11, -2.5, 22, 5); x.restore();
    // nose + mouth
    x.strokeStyle = 'rgba(60,40,30,0.5)'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(64, 58); x.lineTo(61, 76); x.lineTo(67, 78); x.stroke();
    x.strokeStyle = '#6d4438'; x.lineWidth = 3.5;
    x.beginPath();
    if (f.worried) x.arc(64, 102, 12, Math.PI * 1.15, Math.PI * 1.85);
    else if (f.grim) { x.moveTo(50, 98); x.lineTo(78, 98); }
    else x.arc(64, 92, 12, Math.PI * 0.15, Math.PI * 0.85);
    x.stroke();
    if (f.mustache) { x.fillStyle = f.hair || '#3a2a1a';
      x.beginPath(); x.ellipse(64, 84, 20, 7, 0, 0, 7); x.fill(); }
    if (f.stubble) { for (let i = 0; i < 350; i++) { x.fillStyle = 'rgba(30,22,16,0.25)';
      x.fillRect(rnd(28, 100), rnd(86, 122), 1.2, 1.2); } }
    if (f.scar) { x.strokeStyle = 'rgba(140,60,50,0.8)'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(96, 34); x.lineTo(88, 66); x.stroke(); }
    if (f.scarf) { x.fillStyle = '#7a6a4e'; x.fillRect(0, 68, 128, 60);                // shemagh over nose/mouth
      x.strokeStyle = 'rgba(0,0,0,0.2)'; for (let yy = 74; yy < 126; yy += 8) { x.beginPath(); x.moveTo(0, yy); x.lineTo(128, yy + 4); x.stroke(); } }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// distinctive face + headgear per named character
const PRESETS = {
  'Molotov':         { face: { mask: 'molotov' },                                              hat: null,      hairSide: '#141414' },
  'Fox':             { face: { skin: '#c98d63', hair: '#4a3320', mustache: true, stern: true }, hat: 'cap',     hairSide: '#4a3320' },
  'Striker':         { face: { skin: '#7a5236', hair: '#171412', stern: true, stubble: true },  hat: 'helmetG', hairSide: '#171412' },
  'Payback':         { face: { skin: '#d9ab88', scarf: true, eye: '#2e4a2e' },                  hat: 'hood',    hairSide: '#7a6a4e' },
  'Brian Wolford':   { face: { skin: '#dcb08e', hair: '#7a4a22', grim: true, scar: true },      hat: 'boonie',  hairSide: '#7a4a22' },
  'Jesse Wolford':   { face: { skin: '#dcb08e', hair: '#7a4a22', worried: true },               hat: 'boonie',  hairSide: '#7a4a22' },
  'Victor Prestige': { face: { skin: '#d8c2ad', hair: '#8e8e94', old: true, grim: true },       hat: null,      hairSide: '#8e8e94' },
  'Civilian':        { face: { skin: '#c9a184', hair: '#2e2a26' },                              hat: null,      hairSide: '#2e2a26' },
  'HYDRA Trooper':   { face: { mask: 'balaclava' },                                             hat: 'helmetB', hairSide: '#1c1e22' },
};

// ---------------------------------------------------------------- soldier models — JOINTED (shoulders/elbows/hips/knees)
function limbSeg(w, len, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}
function soldierModel(kind, name) {
  const grp = new THREE.Group();
  const isEnemy = kind === 'enemy';
  const preset = PRESETS[name] || PRESETS['Civilian'];
  const suit = kind === 'protected'
    ? new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.55 })                     // Prestige: dark suit
    : new THREE.MeshStandardMaterial({ map: isEnemy ? camoBlack : camoGreen, roughness: 0.95 });
  const pants = new THREE.MeshStandardMaterial({ color: kind === 'neutral' ? 0x5a5347 : 0x2e3129, roughness: 1 });
  const skinM = new THREE.MeshStandardMaterial({ color: preset.face.skin || 0xc9a184, roughness: 0.8 });

  // torso + hips + chest rig
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.26), suit); torso.position.y = 1.18; torso.castShadow = true;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.24), pants); hips.position.y = 0.82; hips.castShadow = true;
  const rigM = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x15171a : 0x2c3526, roughness: 0.85 });
  for (let p = 0; p < 3; p++) {                              // ammo pouches on the chest
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), rigM);
    pouch.position.set(-0.15 + p * 0.15, 1.22, -0.155);
    grp.add(pouch);
  }
  // rounded shoulder pads (spheres!)
  const padM = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x1a1c20 : 0x39452f, roughness: 0.9 });
  [-0.29, 0.29].forEach(px => {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), padM);
    pad.position.set(px, 1.44, 0); pad.castShadow = true;
    grp.add(pad);
  });
  // neck + head with the PAINTED FACE (front) and hair/mask color on the other sides
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skinM); neck.position.y = 1.51;
  const sideM = new THREE.MeshStandardMaterial({ color: preset.hairSide || '#2e2a26', roughness: 0.9 });
  const faceM = new THREE.MeshStandardMaterial({ map: faceTex(preset.face), roughness: 0.75 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), [sideM, sideM, sideM, skinM, sideM, faceM]);
  head.position.y = 1.68; head.castShadow = true;
  // headgear
  if (preset.hat === 'helmetB' || preset.hat === 'helmetG') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 7, 0, Math.PI * 2, 0, 1.45),
      new THREE.MeshStandardMaterial({ color: preset.hat === 'helmetB' ? 0x1a1c20 : 0x3d4a33, roughness: 0.85 }));
    helmet.position.y = 1.8; helmet.castShadow = true; grp.add(helmet);
  } else if (preset.hat === 'boonie') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x4c523a, roughness: 1 }));
    dome.position.y = 1.815;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.025, 12),
      new THREE.MeshStandardMaterial({ color: 0x444a34, roughness: 1 }));
    brim.position.y = 1.79;
    grp.add(dome, brim);
  } else if (preset.hat === 'cap') {
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4530, roughness: 1 }));
    capTop.position.y = 1.83;
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x323b29, roughness: 1 }));
    bill.position.set(0, 1.8, -0.17);
    grp.add(capTop, bill);
  } else if (preset.hat === 'hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 7, 0, Math.PI * 2, 0, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x7a6a4e, roughness: 1 }));
    hood.position.y = 1.74; grp.add(hood);
  }
  // ARMS — shoulder + elbow joints, posed holding the rifle
  function makeArm(side) {                                   // side: -1 left, +1 right
    const shoulder = new THREE.Group();
    shoulder.position.set(0.3 * side, 1.44, 0);
    shoulder.add(limbSeg(0.11, 0.34, suit));                 // upper arm (human-proportioned)
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    elbow.add(limbSeg(0.09, 0.3, suit));                     // forearm
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 0.105), skinM);
    hand.position.y = -0.32; elbow.add(hand);
    shoulder.add(elbow);
    grp.add(shoulder);
    return { shoulder, elbow };
  }
  const armRJ = makeArm(1), armLJ = makeArm(-1);
  const combatant = isEnemy || kind === 'friendly';
  if (combatant) {                                           // READY: level gun — right hand ON the grip, left hand ON the barrel
    armRJ.shoulder.rotation.x = -0.05; armRJ.shoulder.rotation.z = -0.25; armRJ.elbow.rotation.x = 1.35;
    armLJ.shoulder.rotation.x = 1.19;  armLJ.shoulder.rotation.z = 0.58;  armLJ.elbow.rotation.x = 0.05;
  } else {                                                   // civilians: arms down, slight bend
    armRJ.shoulder.rotation.x = 0.1; armRJ.elbow.rotation.x = 0.15;
    armLJ.shoulder.rotation.x = 0.1; armLJ.elbow.rotation.x = 0.15;
  }
  armRJ.shoulder.userData.bx = armRJ.shoulder.rotation.x;
  armLJ.shoulder.userData.bx = armLJ.shoulder.rotation.x;
  // LEGS — hip + knee joints, natural stance
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.13 * side, 0.74, 0);
    hip.add(limbSeg(0.15, 0.36, pants));                     // thigh
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    knee.add(limbSeg(0.13, 0.32, pants));                    // shin
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x1e1a14, roughness: 0.9 }));
    boot.position.set(0, -0.35, -0.04); boot.castShadow = true;
    knee.add(boot);
    hip.add(knee);
    grp.add(hip);
    return { hip, knee };
  }
  const legRJ = makeLeg(1), legLJ = makeLeg(-1);
  legRJ.hip.rotation.x = -0.06; legRJ.knee.rotation.x = 0.1;  // relaxed combat stance
  legLJ.hip.rotation.x = 0.08;  legLJ.knee.rotation.x = 0.06;
  grp.add(torso, hips, neck, head);
  const armL = armLJ.shoulder, armR = armRJ.shoulder;         // (kept names for the animator)
  const legL = legLJ.hip, legR = legRJ.hip;
  // rifle for combatants — a REAL rifle now: receiver, handguard, muzzle device,
  // curved magazine, trigger guard, shaped grip, stock with buttpad
  let gun = null;
  if (isEnemy || kind === 'friendly') {
    gun = new THREE.Group();
    const mSteel = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.5 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.55, metalness: 0.4 });
    const mPoly = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.8 });
    gun.add(part(mSteel, 0.05, 0.07, 0.34, 0, 0, -0.1));            // upper receiver
    gun.add(part(mDark, 0.05, 0.05, 0.16, 0, -0.05, -0.04));        // lower receiver
    gun.add(part(mDark, 0.004, 0.026, 0.06, 0.027, 0.005, -0.1));   // ejection port
    gun.add(cyl(mPoly, 0.03, 0.034, 0.18, 0, 0, -0.36));            // handguard
    gun.add(cyl(mDark, 0.013, 0.013, 0.16, 0, 0, -0.5));            // barrel
    gun.add(cyl(mDark, 0.018, 0.018, 0.05, 0, 0, -0.59));           // muzzle device
    gun.add(part(mDark, 0.008, 0.06, 0.014, 0, 0.05, -0.44));       // front sight post
    gun.add(part(mDark, 0.03, 0.03, 0.05, 0, 0.05, 0.02));          // rear sight block
    const gGrip = part(mPoly, 0.03, 0.1, 0.05, 0, -0.115, 0.03, -0.45);
    gun.add(gGrip);
    gun.add(part(mDark, 0.02, 0.008, 0.09, 0, -0.09, -0.08));       // trigger guard
    const gmag = curvedMag(mDark, 1.15);
    gmag.position.set(0, -0.07, -0.16);
    gun.add(gmag);
    gun.add(part(mPoly, 0.045, 0.075, 0.2, 0, -0.008, 0.27));       // stock
    gun.add(part(mDark, 0.05, 0.085, 0.02, 0, -0.008, 0.38));       // buttpad
    gun.scale.setScalar(1.3);
    gun.position.set(0.16, 1.22, -0.5);
    gun.rotation.x = 0;
    gun.userData.baseRotX = 0;
    gun.userData.basePos = gun.position.clone();
    gun.userData.mag = gmag;
    grp.add(gun);
  }
  // record every joint's posed rotation so ragdolls can flop and respawns can restore
  const joints = [
    armLJ.shoulder, armLJ.elbow, armRJ.shoulder, armRJ.elbow,
    legLJ.hip, legLJ.knee, legRJ.hip, legRJ.knee, head,
  ];
  joints.forEach(j => j.userData.basePose = { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z });
  return { grp, torso, head, armL, armR, legL, legR, gun, joints };
}
function makeEntity(name, kind, x, z, baseY = 0) {
  const colors = { enemy: 0xf38ba8, protected: 0xf38ba8, friendly: 0x89b4fa, neutral: 0xe6e6e6 };
  const m = soldierModel(kind, name);
  m.grp.position.set(x, baseY, z);
  scene.add(m.grp);
  const e = { name, kind, grp: m.grp, body: m.torso, head: m.head, model: m, color: colors[kind],
    hp: 100, alive: true, dying: 0, hitT: 0, baseX: x, baseZ: z, baseY, phase: Math.random() * 9,
    shootTimer: 1 + Math.random() * 2.5, muzzleT: 0 };
  entities.push(e);
  return e;
}
// --- THE OPPOSITION ---
makeEntity('HYDRA Trooper', 'enemy', -6, -12);
makeEntity('HYDRA Trooper', 'enemy', 3, -16);
makeEntity('HYDRA Trooper', 'enemy', -2, -22);
makeEntity('HYDRA Trooper', 'enemy', 9, -14);
makeEntity('HYDRA Trooper', 'enemy', -10, -27);
makeEntity('HYDRA Trooper', 'enemy', 12, -29);
makeEntity('Victor Prestige', 'protected', 0, -34);
// --- TEAM APEX (Mission 1 deployment — your team fights WITH you) ---
makeEntity('Molotov', 'friendly', -4, 2);
makeEntity('Fox', 'friendly', -2, 4);
makeEntity('Striker', 'friendly', 2.5, 4);
makeEntity('Payback', 'friendly', 6, 2.5);
makeEntity('Civilian', 'neutral', 5, 1);
// The Wolford twins — on a rooftop, side by side, sniping below (their canonical M1 cameo)
makeBuilding(-15, -3, 6, 6, 6, 1, true);   // their overwatch post still stands
makeEntity('Brian Wolford', 'friendly', -16, -3, 6);
makeEntity('Jesse Wolford', 'friendly', -14, -3, 6);

// ---------------------------------------------------------------- NPC brains (combat AI state)
function makeAI(e) {
  const enemy = e.kind === 'enemy';
  return {
    state: 'hold',                 // hold | move | cover | peek
    mag: enemy ? 7 : 10, magMax: enemy ? 7 : 10,
    reloadT: 0,                    // >0 while reloading (seconds left)
    thinkT: rnd(0.6, 2.2),
    fireT: rnd(0.8, 2),
    burst: 0,
    moveX: 0, moveZ: 0,            // current destination
    runSpeed: 0,                   // speed while in 'move'
    cover: null,                   // chosen cover point
    coverT: 0,                     // time to stay tucked
    peekT: 0,
    peekCycles: 0,
    crouch: 0, crouchTarget: 0,    // 0..1 animated crouch
    walkPhase: rnd(0, 6),
    movingAmt: 0,                  // 0..1 for the walk-cycle blend
    aimAmt: 0, aimHold: 0,         // two-handed shouldered-aim blend + hold timer
    magDropped: false,             // one falling mag per reload
    kick: 0,                       // per-shot recoil impulse on the body
  };
}
entities.forEach(e => {
  if (e.kind === 'enemy' || e.kind === 'friendly') {
    e.ai = makeAI(e);
    e.posted = e.baseY > 0.5;      // rooftop twins hold their post
    e.hitT = 0;
  }
});

// step an NPC toward a point with building/prop collision (slide, else report blocked)
function stepNPC(e, tx, tz, speed, dt) {
  const p = e.grp.position;
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return 'arrived';
  const vx = dx / d * speed * dt, vz = dz / d * speed * dt;
  const clear = (nx, nz) => {
    const pt = new THREE.Vector3(nx, 0.5, nz);         // probe at knee height — sandbags & low crates block too
    for (const b of buildings) if (b.containsPoint(pt)) return false;
    return Math.hypot(nx, nz) < 68;                    // stay in the arena
  };
  if (clear(p.x + vx, p.z + vz)) { p.x += vx; p.z += vz; return 'moving'; }
  if (clear(p.x + vx, p.z)) { p.x += vx; return 'moving'; }
  if (clear(p.x, p.z + vz)) { p.z += vz; return 'moving'; }
  return 'blocked';
}

// pick a cover point that puts the object between the soldier and the threat
function pickCover(e, threatPos) {
  let best = null, bestScore = Infinity;
  for (const c of coverPoints) {
    const dxt = c.x - threatPos.x, dzt = c.z - threatPos.z;
    const dl = Math.hypot(dxt, dzt) || 1;
    const sx = c.x + (dxt / dl) * (c.r + 0.5), sz = c.z + (dzt / dl) * (c.r + 0.5);
    const dTar = Math.hypot(sx - threatPos.x, sz - threatPos.z);
    if (dTar < 6 || dTar > 48) continue;
    // don't stack two soldiers on the same slot
    let taken = false;
    for (const o of entities) {
      if (o !== e && o.ai && o.ai.cover && Math.hypot(o.ai.cover.sx - sx, o.ai.cover.sz - sz) < 1.3) { taken = true; break; }
    }
    if (taken) continue;
    const dSelf = Math.hypot(sx - e.grp.position.x, sz - e.grp.position.z);
    const score = dSelf + Math.abs(dTar - 16) * 0.5 + rnd(0, 5);
    if (score < bestScore) { bestScore = score; best = { sx, sz, c }; }
  }
  return best;
}

// one NPC trigger pull, honoring magazine + reload
function npcTryFire(e, targetPos, opts) {
  const ai = e.ai;
  if (ai.reloadT > 0 || e.hitT > 0.55) return false;   // reloading or staggered
  if ((e.faceErr || 0) > 0.6) return false;            // still turning — hold fire until on target
  if (ai.mag <= 0) { ai.reloadT = 1.7; ai.magDropped = false; return false; } // dry — reload (animation plays)
  ai.mag--;
  ai.aimHold = Math.max(ai.aimHold, 0.9);              // rifle stays shouldered after the shot
  ai.kick = 1;                                         // the shot ROCKS them — recoil on the body
  return npcFire(e, targetPos, opts);
}

// ---------------------------------------------------------------- arsenal
const WEAPONS = [
  { name: 'M16',                 cls: 'Assault Rifle', att: 'Flame Charm',     dmg: 34, rpm: 700, mag: 30, reserve: 180, auto: true,  spread: 0.012 },
  { name: 'PP919',               cls: 'SMG',           att: '(compact, semi)', dmg: 22, rpm: 320, mag: 25, reserve: 200, auto: false, spread: 0.02 },
  { name: 'Benelli M3 Super 90', cls: 'Shotgun',       att: 'Pump/Semi',       dmg: 15, rpm: 90,  mag: 7,  reserve: 56,  auto: false, spread: 0.06, pellets: 8 },
  { name: 'The Statesman',       cls: 'Pistol',        att: 'Gilded Slide',    dmg: 40, rpm: 380, mag: 8,  reserve: 64,  auto: false, spread: 0.008 },
];
let wIndex = 0;
const wState = WEAPONS.map(w => ({ ammo: w.mag, reserve: w.reserve, reloading: false, reloadT: 0 }));
function curW() { return WEAPONS[wIndex]; }
function curS() { return wState[wIndex]; }

// ---------------------------------------------------------------- gun viewmodels (modeled, per-weapon)
const gunSteel = new THREE.MeshStandardMaterial({ map: metalTex, color: 0x9aa0a8, roughness: 0.45, metalness: 0.75 });
const gunBlack = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.4 });
const gunPoly  = new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.8, metalness: 0.1 });
const gunWood  = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
const gunGold  = new THREE.MeshStandardMaterial({ color: 0xd9a92f, roughness: 0.25, metalness: 0.95 });

// ---- gun parts kit: shaped pieces every weapon is assembled from ----
const gunDark = new THREE.MeshStandardMaterial({ color: 0x121317, roughness: 0.5, metalness: 0.5 });
function part(mat, w, h, dp, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
}
function cyl(mat, r1, r2, len, x, y, z, alongZ = true, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
  if (alongZ) m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
function curvedMag(mat, sx = 1) {
  // a real banana magazine: three segments sweeping forward as they descend
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const seg = part(mat, 0.024 * sx, 0.055 * sx, 0.05 * sx, 0, -i * 0.048 * sx, -i * 0.014 * sx, 0.18 + i * 0.17);
    g.add(seg);
  }
  const plate = part(mat, 0.028 * sx, 0.012 * sx, 0.055 * sx, 0, -2.55 * 0.048 * sx, -2.4 * 0.014 * sx, 0.5);
  g.add(plate);
  return g;
}
function pistolGrip(mat, sx = 1) {
  const g = new THREE.Group();
  g.add(part(mat, 0.024 * sx, 0.095 * sx, 0.048 * sx, 0, -0.04 * sx, 0.012 * sx, -0.42));
  g.add(part(mat, 0.026 * sx, 0.02 * sx, 0.052 * sx, 0, -0.088 * sx, 0.03 * sx, -0.42)); // flared base
  return g;
}
function triggerAssembly(mat, sx = 1) {
  const g = new THREE.Group();
  g.add(part(mat, 0.016 * sx, 0.006 * sx, 0.075 * sx, 0, -0.042 * sx, 0, 0));           // guard bottom
  g.add(part(mat, 0.016 * sx, 0.03 * sx, 0.006 * sx, 0, -0.028 * sx, -0.036 * sx, 0));  // guard front
  g.add(part(mat, 0.016 * sx, 0.03 * sx, 0.006 * sx, 0, -0.028 * sx, 0.036 * sx, 0));   // guard rear
  g.add(part(gunDark, 0.007 * sx, 0.026 * sx, 0.007 * sx, 0, -0.026 * sx, -0.008 * sx, 0.25)); // the trigger
  return g;
}
function birdcage(x, y, z, sx = 1) {
  const g = new THREE.Group();
  g.add(cyl(gunDark, 0.014 * sx, 0.014 * sx, 0.055 * sx, 0, 0, 0));
  g.add(cyl(gunSteel, 0.0145 * sx, 0.0145 * sx, 0.006 * sx, 0, 0, -0.02 * sx));  // slot ring
  g.add(cyl(gunSteel, 0.0145 * sx, 0.0145 * sx, 0.006 * sx, 0, 0, 0.002 * sx));
  g.position.set(x, y, z);
  return g;
}
function ribbedGuard(mat, r, len, x, y, z, ribs = 4) {
  const g = new THREE.Group();
  g.add(cyl(mat, r, r * 1.12, len, 0, 0, 0));
  for (let i = 0; i < ribs; i++) {
    g.add(cyl(gunDark, r * 1.06, r * 1.06, 0.008, 0, 0, -len / 2 + (i + 0.5) * (len / ribs)));
  }
  g.position.set(x, y, z);
  return g;
}

function buildM16() {
  const g = new THREE.Group();
  // receiver: shaped upper + lower with a real mag well between them
  const upper = part(gunBlack, 0.026, 0.05, 0.3, 0, 0.006, -0.17);
  const lower = part(gunBlack, 0.026, 0.042, 0.17, 0, -0.033, -0.11);
  const ejPort = part(gunDark, 0.002, 0.02, 0.05, 0.0145, 0.004, -0.16);        // ejection port
  const chHandle = part(gunDark, 0.02, 0.012, 0.035, 0, 0.032, -0.015);         // charging handle — CYCLES
  chHandle.userData.home = chHandle.position.clone();
  // carry handle with the rear aperture
  const chL = part(gunBlack, 0.006, 0.03, 0.2, -0.01, 0.052, -0.14);
  const chR = part(gunBlack, 0.006, 0.03, 0.2, 0.01, 0.052, -0.14);
  const chTop = part(gunBlack, 0.026, 0.012, 0.2, 0, 0.068, -0.14);
  const rearSight = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 6, 14), gunBlack);
  rearSight.position.set(0, 0.065, -0.03);
  // furniture
  const grip = pistolGrip(gunPoly); grip.position.set(0, -0.054, -0.045);
  const trig = triggerAssembly(gunBlack); trig.position.set(0, -0.054, -0.1);
  const mag = curvedMag(gunSteel); mag.position.set(0, -0.075, -0.17);
  mag.userData.home = { y: -0.075, z: -0.17 };
  const guard = ribbedGuard(gunPoly, 0.02, 0.26, 0, 0, -0.45, 5);
  const barrel = cyl(gunSteel, 0.009, 0.009, 0.14, 0, 0, -0.65);
  const muzzle = birdcage(0, 0, -0.745);
  // A-frame front sight
  const fsL = part(gunBlack, 0.005, 0.05, 0.012, -0.012, 0.022, -0.6, 0, 0, 0.35);
  const fsR = part(gunBlack, 0.005, 0.05, 0.012, 0.012, 0.022, -0.6, 0, 0, -0.35);
  const fsPost = part(gunBlack, 0.005, 0.05, 0.008, 0, 0.045, -0.6);
  // stock with buttpad + cheek line
  const stock = part(gunPoly, 0.024, 0.05, 0.2, 0, -0.004, 0.12);
  const cheek = part(gunPoly, 0.024, 0.016, 0.14, 0, 0.026, 0.14);
  const buttpad = part(gunDark, 0.028, 0.06, 0.018, 0, -0.004, 0.228);
  g.add(upper, lower, ejPort, chHandle, chL, chR, chTop, rearSight, grip, trig, mag,
    guard, barrel, muzzle, fsL, fsR, fsPost, stock, cheek, buttpad);
  return { g, mag, bolt: chHandle, muzzle: new THREE.Vector3(0, 0, -0.78), pump: null,
    ads: new THREE.Vector3(0, -0.065, -0.36) };
}
function buildPP919() {
  const g = new THREE.Group();
  const body = part(gunBlack, 0.026, 0.055, 0.34, 0, 0, -0.16);
  const dust = cyl(gunBlack, 0.016, 0.016, 0.3, 0, 0.03, -0.16);                 // round dust cover
  const bolt = part(gunDark, 0.016, 0.014, 0.04, 0.02, 0.012, -0.08);            // side bolt knob — CYCLES
  bolt.userData.home = bolt.position.clone();
  const helical = cyl(gunPoly, 0.032, 0.032, 0.3, 0, -0.045, -0.22);             // Bizon helical mag
  helical.userData.home = { y: -0.045, z: -0.22 };
  const shroud = cyl(gunSteel, 0.014, 0.014, 0.14, 0, 0.012, -0.4);
  const muzzle = cyl(gunDark, 0.011, 0.013, 0.03, 0, 0.012, -0.475);
  const grip = pistolGrip(gunPoly); grip.position.set(0, -0.05, 0.015);
  const trig = triggerAssembly(gunBlack); trig.position.set(0, -0.05, -0.04);
  // skeleton folding stock
  const rodT = part(gunSteel, 0.012, 0.008, 0.18, 0, 0.02, 0.1);
  const rodB = part(gunSteel, 0.012, 0.008, 0.16, 0, -0.03, 0.11, -0.18);
  const plate = part(gunSteel, 0.016, 0.07, 0.014, 0, -0.005, 0.19);
  // sights
  const frontPost = part(gunBlack, 0.004, 0.03, 0.004, 0, 0.055, -0.42);
  const rearL = part(gunBlack, 0.004, 0.022, 0.004, -0.012, 0.055, 0.0);
  const rearR = part(gunBlack, 0.004, 0.022, 0.004, 0.012, 0.055, 0.0);
  g.add(body, dust, bolt, helical, shroud, muzzle, grip, trig, rodT, rodB, plate, frontPost, rearL, rearR);
  return { g, mag: helical, bolt, muzzle: new THREE.Vector3(0, 0.012, -0.5), pump: null,
    ads: new THREE.Vector3(0, -0.058, -0.32) };
}
function buildBenelli() {
  const g = new THREE.Group();
  const receiver = part(gunBlack, 0.028, 0.06, 0.24, 0, 0, -0.08);
  const port = part(gunDark, 0.002, 0.024, 0.05, 0.015, 0, -0.1);                 // loading/ejection port
  const barrel = cyl(gunSteel, 0.013, 0.013, 0.5, 0, 0.022, -0.45);
  const tube = cyl(gunBlack, 0.011, 0.011, 0.42, 0, -0.012, -0.42);               // mag tube
  const pump = ribbedGuard(gunPoly, 0.02, 0.13, 0, -0.012, -0.38, 3);             // ribbed pump — CYCLES
  pump.userData.base = pump.position.clone();
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9b25f, metalness: 0.9, roughness: 0.25 }));
  bead.position.set(0, 0.042, -0.69);
  const rearL = part(gunBlack, 0.004, 0.014, 0.006, -0.013, 0.042, 0.02);
  const rearR = part(gunBlack, 0.004, 0.014, 0.006, 0.013, 0.042, 0.02);
  const grip = pistolGrip(gunPoly); grip.position.set(0, -0.052, 0.03);
  const trig = triggerAssembly(gunBlack); trig.position.set(0, -0.052, -0.02);
  const stock = part(gunPoly, 0.026, 0.055, 0.2, 0, -0.006, 0.15);
  const buttpad = part(gunDark, 0.03, 0.065, 0.018, 0, -0.006, 0.258);
  g.add(receiver, port, barrel, tube, pump, bead, rearL, rearR, grip, trig, stock, buttpad);
  return { g, mag: null, bolt: null, muzzle: new THREE.Vector3(0, 0.022, -0.71), pump,
    ads: new THREE.Vector3(0, -0.046, -0.3) };
}
function buildStatesman() {
  const g = new THREE.Group();
  const slide = part(gunGold, 0.024, 0.045, 0.22, 0, 0.012, -0.09);               // gilded slide — CYCLES
  slide.userData.base = slide.position.clone();
  for (let i = 0; i < 5; i++) g.add(part(gunDark, 0.026, 0.028, 0.004, 0, 0.012, 0.006 + i * 0.011)); // serrations
  const frame = part(gunBlack, 0.022, 0.026, 0.19, 0, -0.022, -0.075);
  const hammer = part(gunDark, 0.01, 0.024, 0.008, 0, 0.032, 0.024);              // hammer — COCKS
  hammer.userData.home = hammer.rotation.x;
  const gripL = part(gunWood, 0.005, 0.085, 0.055, -0.015, -0.075, 0.005, -0.28);
  const gripR = part(gunWood, 0.005, 0.085, 0.055, 0.015, -0.075, 0.005, -0.28);
  const gripCore = part(gunBlack, 0.024, 0.09, 0.05, 0, -0.075, 0.005, -0.28);
  const magBase = part(gunDark, 0.026, 0.012, 0.055, 0, -0.122, 0.018, -0.28);
  const trig = triggerAssembly(gunBlack, 0.85); trig.position.set(0, -0.032, -0.09);
  const sight = part(gunBlack, 0.01, 0.016, 0.012, 0, 0.042, -0.19);
  const rearL2 = part(gunBlack, 0.005, 0.014, 0.01, -0.01, 0.042, 0.0);
  const rearR2 = part(gunBlack, 0.005, 0.014, 0.01, 0.01, 0.042, 0.0);
  g.add(slide, frame, hammer, gripL, gripR, gripCore, magBase, trig, sight, rearL2, rearR2);
  return { g, mag: magBase, bolt: hammer, muzzle: new THREE.Vector3(0, 0.012, -0.21), pump: slide,
    ads: new THREE.Vector3(0, -0.047, -0.3) };
}
const gunModels = [buildM16(), buildPP919(), buildBenelli(), buildStatesman()];

// PLAYER ARMS — visible camo sleeves + hands holding the weapon (the CoD frame)
const sleeveMat = new THREE.MeshStandardMaterial({ map: camoGreen, roughness: 0.95 });
const handMat = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
function buildPlayerArms() {
  const g = new THREE.Group();
  // right forearm: from bottom-right of the frame up to the grip
  const rFore = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), sleeveMat);
  rFore.position.set(0.045, -0.1, 0.09); rFore.rotation.x = 0.55; rFore.rotation.z = -0.12;
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.08), handMat);
  rHand.position.set(0.005, -0.085, -0.055);
  // left forearm: from bottom-left reaching to the handguard
  const lFore = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.42), sleeveMat);
  lFore.position.set(-0.12, -0.15, -0.25); lFore.rotation.x = 0.35; lFore.rotation.y = -0.35;
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.085), handMat);
  lHand.position.set(-0.02, -0.045, -0.46);
  g.add(rFore, rHand, lFore, lHand);
  return g;
}
const playerArms = buildPlayerArms();

// muzzle smoke — soft grey puffs that drift up after each shot
const smokeTex = canvasTex(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(190,185,175,0.55)');
  g.addColorStop(0.6, 'rgba(170,165,155,0.28)');
  g.addColorStop(1, 'rgba(160,155,145,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
const smokes = [];
function muzzleSmoke(worldPos) {
  const m = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.55 });
  const s = new THREE.Sprite(m);
  s.position.copy(worldPos);
  s.scale.setScalar(rnd(0.12, 0.2));
  s.userData = { t: 0, drift: new THREE.Vector3(rnd(-0.1, 0.1), rnd(0.25, 0.45), rnd(-0.1, 0.1)) };
  scene.add(s); smokes.push(s);
  if (smokes.length > 24) scene.remove(smokes.shift());
}
function updateSmoke(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.userData.t += dt;
    s.position.addScaledVector(s.userData.drift, dt);
    s.scale.multiplyScalar(1 + dt * 1.6);
    s.material.opacity = Math.max(0, 0.55 - s.userData.t * 0.8);
    if (s.userData.t > 0.8) { scene.remove(s); smokes.splice(i, 1); }
  }
}

// ambient dust motes drifting through the air (the RDR atmosphere)
const dustTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(220,205,175,0.7)'); g.addColorStop(1, 'rgba(220,205,175,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
const dustMotes = [];
for (let i = 0; i < 36; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: rnd(0.12, 0.3) }));
  s.position.set(rnd(-30, 30), rnd(0.3, 4), rnd(-35, 10));
  s.scale.setScalar(rnd(0.04, 0.12));
  s.userData.v = new THREE.Vector3(rnd(0.1, 0.4), rnd(-0.05, 0.05), rnd(-0.08, 0.08));
  scene.add(s); dustMotes.push(s);
}
function updateDust(dt) {
  for (const s of dustMotes) {
    s.position.addScaledVector(s.userData.v, dt);
    // wrap the mote volume around the player
    const dx = s.position.x - camera.position.x, dz = s.position.z - camera.position.z;
    if (dx > 32) s.position.x -= 64; if (dx < -32) s.position.x += 64;
    if (dz > 32) s.position.z -= 64; if (dz < -32) s.position.z += 64;
    if (s.position.y < 0.2) s.position.y = rnd(2, 4);
    if (s.position.y > 4.5) s.position.y = 0.3;
  }
}

// weapon rig (holds the current gun; animated every frame)
const rig = new THREE.Group();
const HIP = new THREE.Vector3(0.26, -0.24, -0.55);
const ADS = new THREE.Vector3(0, -0.155, -0.42);
rig.position.copy(HIP);
gunModels.forEach((m, i) => { m.g.visible = i === 0; rig.add(m.g); });
rig.add(playerArms);                     // your own arms in the frame, riding every bob/kick
camera.add(rig);
scene.add(camera);

// muzzle flash (textured plane + light)
const flashTex = canvasTex(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,240,190,1)');
  g.addColorStop(0.35, 'rgba(255,180,70,0.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 6;
  for (let i = 0; i < 6; i++) {              // star spikes
    const a = i * 1.05;
    ctx.beginPath(); ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + Math.cos(a) * s * 0.48, s / 2 + Math.sin(a) * s * 0.48); ctx.stroke();
  }
});
const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26),
  new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flash.visible = false;
rig.add(flash);
const muzzleLight = new THREE.PointLight(0xffc36b, 0, 7);
rig.add(muzzleLight);

// shell casings
// spent magazines physically fall out of guns during reloads
const fallingMags = [];
function dropMag(src) {
  src.updateWorldMatrix(true, false);
  const m = src.clone(true);
  m.visible = true;
  src.matrixWorld.decompose(m.position, m.quaternion, m.scale);
  m.userData = { v: new THREE.Vector3(rnd(-0.4, 0.4), -0.3, rnd(-0.4, 0.4)), av: rnd(-7, 7), t: 0 };
  scene.add(m);
  fallingMags.push(m);
  if (fallingMags.length > 8) scene.remove(fallingMags.shift());
}
function updateFallingMags(dt) {
  for (let i = fallingMags.length - 1; i >= 0; i--) {
    const m = fallingMags[i];
    m.userData.t += dt;
    m.userData.v.y -= 9.8 * dt;
    m.position.addScaledVector(m.userData.v, dt);
    m.rotation.x += m.userData.av * dt;
    if (m.position.y < 0.05) { m.position.y = 0.05; m.userData.v.set(0, 0, 0); m.userData.av = 0; }
    if (m.userData.t > 3) { scene.remove(m); fallingMags.splice(i, 1); }
  }
}
const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a13c, metalness: 0.9, roughness: 0.3 });
const shells = [];
function ejectShell() {
  const s = new THREE.Mesh(shellGeo, shellMat);
  const wp = new THREE.Vector3(0.06, -0.02, -0.15).applyMatrix4(rig.matrixWorld ? rig.matrixWorld : new THREE.Matrix4());
  rig.updateMatrixWorld();
  s.position.copy(new THREE.Vector3(0.06, -0.02, -0.15).applyMatrix4(rig.matrixWorld));
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  s.userData.v = right.multiplyScalar(rnd(1.2, 2)).add(new THREE.Vector3(0, rnd(1.6, 2.4), 0));
  s.userData.av = new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
  s.userData.t = 0;
  scene.add(s);
  shells.push(s);
  if (shells.length > 24) { const old = shells.shift(); scene.remove(old); }
}
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.userData.t += dt;
    s.userData.v.y -= 9.8 * dt;
    s.position.addScaledVector(s.userData.v, dt);
    s.rotation.x += s.userData.av.x * dt; s.rotation.y += s.userData.av.y * dt; s.rotation.z += s.userData.av.z * dt;
    if (s.position.y < 0.02) { s.position.y = 0.02; s.userData.v.set(0, 0, 0); s.userData.av.set(0, 0, 0); }
    if (s.userData.t > 4) { scene.remove(s); shells.splice(i, 1); }
  }
}

// player bullet tracers
const tracerMatP = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
function playerTracer(to) {
  rig.updateMatrixWorld();
  const from = gunModels[wIndex].muzzle.clone().applyMatrix4(gunModels[wIndex].g.matrixWorld);
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, tracerMatP);
  scene.add(line);
  setTimeout(() => scene.remove(line), 40);
}

// ---------------------------------------------------------------- controls / input
const controls = new PointerLockControls(camera, renderer.domElement);
const keys = {};
let aiming = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') reload();
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < WEAPONS.length) switchTo(n); }
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => {
  if (e.button === 0) firing = true;
  if (e.button === 2) aiming = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) firing = false;
  if (e.button === 2) aiming = false;
});
addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------- player state
const vel = new THREE.Vector3();
let vy = 0, onGround = true, crouching = false;
let firing = false, lastShot = 0;
let hp = 100, dead = false, killCount = 0, respawning = false;
let moveAmount = 0;   // 0..1 how much we're moving (drives bob)

// ---------------------------------------------------------------- gamepad
let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find(p => p);
  const padEl = document.getElementById('pad');
  if (!gp) { padEl.textContent = '🎮 controller: not detected'; padEl.classList.remove('on'); return null; }
  padEl.textContent = '🎮 controller: ' + (gp.id.slice(0, 22) || 'connected');
  padEl.classList.add('on');
  return gp;
}
function padBtn(gp, i) { return gp && gp.buttons[i] && gp.buttons[i].pressed; }
function padPressed(gp, i) { const now = padBtn(gp, i); const was = padPrev[i]; padPrev[i] = now; return now && !was; }
const DZ = 0.18;
function dz(v) { return Math.abs(v) < DZ ? 0 : v; }

// ---------------------------------------------------------------- shooting / reload
let recoil = 0;             // 0..1 spring
function reload() {
  const w = curW(), s = curS();
  if (s.reloading || s.ammo === w.mag || s.reserve <= 0) return;
  s.reloading = true; s.reloadT = 0;
  toast('RELOADING');
  setTimeout(() => {
    const need = w.mag - s.ammo, take = Math.min(need, s.reserve);
    s.ammo += take; s.reserve -= take; s.reloading = false;
  }, 900);
}
function switchTo(n) {
  if (n === wIndex) return;
  wIndex = n;
  gunModels.forEach((m, i) => m.g.visible = i === n);
  toast(curW().name);
}

const ray = new THREE.Raycaster();
const ffHits = [];   // recent friendly-fire timestamps (accident tolerance window)
function shoot() {
  const w = curW(), s = curS();
  if (s.reloading || dead) return;
  if (s.ammo <= 0) { reload(); return; }
  s.ammo--;
  recoil = 1;
  ejectShell();
  // muzzle flash
  const m = gunModels[wIndex];
  flash.position.copy(m.muzzle);
  flash.rotation.z = rnd(0, 6.28);
  flash.scale.setScalar(rnd(0.8, 1.3));
  flash.visible = true;
  muzzleLight.position.copy(m.muzzle);
  muzzleLight.intensity = 9;
  setTimeout(() => { flash.visible = false; muzzleLight.intensity = 0; }, 42);
  rig.updateMatrixWorld();
  muzzleSmoke(m.muzzle.clone().applyMatrix4(m.g.matrixWorld));

  const pellets = w.pellets || 1;
  const sprMul = aiming ? 0.45 : 1;
  for (let p = 0; p < pellets; p++) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * w.spread * 2 * sprMul;
    dir.y += (Math.random() - 0.5) * w.spread * 2 * sprMul;
    dir.z += (Math.random() - 0.5) * w.spread * 2 * sprMul;
    dir.normalize();
    ray.set(camera.getWorldPosition(new THREE.Vector3()), dir);
    const meshes = [];
    entities.forEach(e => { if (e.alive) { e.body.userData.e = e; e.head.userData.e = e; meshes.push(e.body, e.head); } });
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length) {
      const e = hits[0].object.userData.e;
      if (e.kind === 'friendly') {
        // squaddies now sprint across your firing line — one accident is a warning,
        // three hits inside 4s is a choice. Civilians are never an accident.
        const now2 = performance.now();
        while (ffHits.length && now2 - ffHits[0] > 4000) ffHits.shift();
        ffHits.push(now2);
        if (ffHits.length >= 3) { failFriendlyFire(); }
        else toast('WATCH YOUR FIRE — ' + e.name.toUpperCase());
        return;
      }
      if (e.kind === 'neutral') { failFriendlyFire(); return; }
      if (e.kind === 'protected') { toast('NICE TRY, BUT BE PATIENT'); playerTracer(hits[0].point); continue; }
      const head = hits[0].object === e.head;
      e.hp -= w.dmg * (head ? 2.2 : 1);
      e.hitT = 1;                                    // stagger animation
      bloodBurst(hits[0].point, dir, head);
      playerTracer(hits[0].point);
      if (e.hp <= 0) killEntity(e, head, dir);
    } else {
      const far = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 60);
      playerTracer(far);
    }
  }
}
// ---------------------------------------------------------------- BLOOD (splatter + ground pools)
const bloodTex = canvasTex(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(160,18,18,1)');
  g.addColorStop(0.55, 'rgba(120,10,10,0.85)');
  g.addColorStop(1, 'rgba(90,6,6,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
const bloodParts = [];
function bloodBurst(pos, dir, big = false) {
  const n = big ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: bloodTex, transparent: true, depthWrite: false, opacity: 1 });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(rnd(0.07, big ? 0.22 : 0.15));
    const v = dir ? dir.clone().multiplyScalar(rnd(0.6, 2.2)) : new THREE.Vector3();
    v.x += rnd(-1, 1); v.y += rnd(0.6, 2.4); v.z += rnd(-1, 1);
    s.userData = { v, t: 0 };
    scene.add(s); bloodParts.push(s);
  }
  if (bloodParts.length > 60) { const old = bloodParts.splice(0, bloodParts.length - 60); old.forEach(o => scene.remove(o)); }
}
const bloodPools = [];
const poolMat = new THREE.MeshBasicMaterial({ color: 0x5a0d0d, transparent: true, opacity: 0.85, depthWrite: false });
function bloodPool(x, z, y = 0.013, r = 0.4) {
  const p = new THREE.Mesh(new THREE.CircleGeometry(r * rnd(0.8, 1.3), 12), poolMat.clone());
  p.rotation.x = -Math.PI / 2;
  p.rotation.z = rnd(0, 6.3);
  p.position.set(x + rnd(-0.15, 0.15), y, z + rnd(-0.15, 0.15));
  p.userData.t = 0;
  scene.add(p); bloodPools.push(p);
  if (bloodPools.length > 18) scene.remove(bloodPools.shift());
}
function updateBlood(dt) {
  for (let i = bloodParts.length - 1; i >= 0; i--) {
    const s = bloodParts[i];
    s.userData.t += dt;
    s.userData.v.y -= 8 * dt;
    s.position.addScaledVector(s.userData.v, dt);
    s.material.opacity = Math.max(0, 1 - s.userData.t * 1.6);
    if (s.position.y < 0.03 || s.userData.t > 0.8) { scene.remove(s); bloodParts.splice(i, 1); }
  }
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const p = bloodPools[i];
    p.userData.t += dt;
    if (p.userData.t > 9) {
      p.material.opacity -= dt * 0.4;
      if (p.material.opacity <= 0) { scene.remove(p); bloodPools.splice(i, 1); }
    }
  }
}

// ---------------------------------------------------------------- ragdoll deaths
function killEntity(e, head, impulse, by) {
  e.alive = false;
  const dir = (impulse ? impulse.clone() : new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))).setY(0).normalize();
  e.rag = {
    t: 0,
    dir,
    spin: rnd(-1.2, 1.2),
    pooled: false,
    // every joint gets its own random flop target — no two deaths look alike
    targets: e.model.joints.map(j => ({
      j,
      fx: j.rotation.x, fy: j.rotation.y, fz: j.rotation.z,
      tx: j.userData.basePose.x + rnd(-1.8, 1.2),
      ty: j.userData.basePose.y + rnd(-0.7, 0.7),
      tz: j.userData.basePose.z + rnd(-1.1, 1.1),
    })),
  };
  bloodBurst(e.grp.position.clone().add(new THREE.Vector3(0, head ? 1.68 : 1.2, 0)), dir, head);
  if (by) addKill(by + ' ✖ ' + e.name);
  else { killCount++; addKill(e.name + (head ? '  ✖ HEADSHOT' : '  ✖')); }
  setTimeout(() => {
    e.hp = 100; e.alive = true; e.rag = null; e.dying = 0; e.hitT = 0;
    e.grp.visible = true;
    e.grp.rotation.set(0, 0, 0);
    e.grp.position.set(e.baseX, e.baseY, e.baseZ);
    e.model.joints.forEach(j => { const b = j.userData.basePose; j.rotation.set(b.x, b.y, b.z); });
    e.model.torso.rotation.set(0, 0, 0);
    if (e.model.gun) {
      e.model.gun.rotation.x = e.model.gun.userData.baseRotX;
      if (e.model.gun.userData.mag) e.model.gun.userData.mag.visible = true;
    }
    if (e.ai) e.ai = makeAI(e);                      // fresh brain, full mag, standing
  }, 5000);
}
function updateRagdoll(e, dt) {
  const r = e.rag;
  r.t += dt;
  const k = Math.min(1, r.t * 1.9);                 // 0->1 collapse
  const ease = 1 - (1 - k) * (1 - k);               // ease-out
  // body: knocked back along the shot, twists, drops — with a small landing bounce
  e.grp.rotation.x = -Math.PI / 2 * ease + Math.sin(Math.min(r.t * 9, Math.PI)) * 0.12 * (1 - ease);
  e.grp.rotation.y += r.spin * dt * (1 - ease);
  e.grp.position.x += r.dir.x * dt * 1.6 * (1 - ease);
  e.grp.position.z += r.dir.z * dt * 1.6 * (1 - ease);
  e.grp.position.y = e.baseY + 0.12 * ease + Math.max(0, Math.sin(Math.min(r.t * 7, Math.PI))) * 0.18 * (1 - ease);
  // joints: flop to their random targets with a decaying wobble
  const wob = Math.sin(r.t * 14) * Math.max(0, 0.35 - r.t * 0.3);
  for (const tg of r.targets) {
    tg.j.rotation.x = tg.fx + (tg.tx - tg.fx) * ease + wob;
    tg.j.rotation.y = tg.fy + (tg.ty - tg.fy) * ease;
    tg.j.rotation.z = tg.fz + (tg.tz - tg.fz) * ease + wob * 0.5;
  }
  // blood pool spreads under the body once it lands
  if (!r.pooled && r.t > 0.55) {
    r.pooled = true;
    if (e.baseY < 0.5) bloodPool(e.grp.position.x, e.grp.position.z);   // (not on rooftops' thin air)
    else bloodPool(e.grp.position.x, e.grp.position.z, e.baseY + 0.013);
  }
  if (r.t > 4.6) e.grp.visible = false;             // fade out just before respawn
}
function hitSpark(pos) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffee88 }));
  s.position.copy(pos); scene.add(s);
  setTimeout(() => scene.remove(s), 90);
}

// ---------------------------------------------------------------- fail flash (friendly fire) + damage
const failEl = document.getElementById('fail');
function failFriendlyFire() {
  document.getElementById('failtext').textContent = 'FRIENDLY FIRE WILL NOT BE TOLERATED';
  failEl.classList.add('show'); dead = true;
  setTimeout(() => {
    hp = 100; camera.position.set(0, PLAYER_H, 8);
    camera.rotation.set(0, 0, 0);
    dead = false; failEl.classList.remove('show');
  }, 1400);
}
const dmgEl = document.getElementById('dmg');
let lastDamageAt = -Infinity;
function damagePlayer(amount) {
  if (dead || respawning) return;
  hp -= amount;
  lastDamageAt = performance.now();
  dmgEl.style.opacity = Math.min(0.9, 0.3 + amount / 20);
  setTimeout(() => dmgEl.style.opacity = 0, 130);
  if (hp <= 0) { hp = 0; playerDie(); }
}
function playerDie() {
  respawning = true; dead = true;
  document.getElementById('failtext').textContent = 'YOU ARE DOWN — RESPAWNING';
  failEl.classList.add('show');
  setTimeout(() => {
    hp = 100; camera.position.set(0, PLAYER_H, 8);
    failEl.classList.remove('show'); dead = false; respawning = false;
  }, 1500);
}
// ---------------------------------------------------------------- NPC gunfire (flashes, tracers, misses)
const tracerMatE = new THREE.LineBasicMaterial({ color: 0xff5566, transparent: true, opacity: 0.85 });
const tracerMatF = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 });
function npcTracer(from, to, friendly) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, friendly ? tracerMatF : tracerMatE); scene.add(line);
  setTimeout(() => scene.remove(line), 55);
}
const flashSpriteMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function npcFlash(pos) {
  const s = new THREE.Sprite(flashSpriteMat);
  s.position.copy(pos);
  s.scale.setScalar(rnd(0.28, 0.42));
  scene.add(s);
  setTimeout(() => scene.remove(s), 45);
}
function npcMuzzle(e) {
  // world position of this soldier's gun muzzle (falls back to chest height)
  if (e.model.gun) {
    e.model.gun.updateWorldMatrix(true, false);
    return new THREE.Vector3(0, 0, -0.46).applyMatrix4(e.model.gun.matrixWorld);
  }
  return e.grp.position.clone().add(new THREE.Vector3(0, 1.3, 0));
}
// One NPC shot with real aim error — can visibly MISS (tracer streaks past the target)
function npcFire(e, targetPos, opts = {}) {
  const from = npcMuzzle(e);
  npcFlash(from);
  muzzleSmoke(from);
  const dir = targetPos.clone().sub(from).normalize();
  const err = opts.err ?? 0.06;
  dir.x += rnd(-err, err); dir.y += rnd(-err, err) * 0.6; dir.z += rnd(-err, err);
  dir.normalize();
  // closest approach of the shot line to the target — decides hit vs whiff
  const toT = targetPos.clone().sub(from);
  const along = toT.dot(dir);
  const closest = from.clone().addScaledVector(dir, Math.max(0, along));
  const missBy = closest.distanceTo(targetPos);
  const hit = missBy < (opts.hitRadius ?? 0.35);
  const end = hit ? targetPos.clone() : from.clone().addScaledVector(dir, Math.min(60, along + rnd(6, 18)));
  npcTracer(from, end, opts.friendly);
  return hit;
}

// ---------------------------------------------------------------- HUD
const hud = document.getElementById('hud');
const nameplateEl = document.getElementById('nameplate');
const toastEl = document.getElementById('toast');
const killfeedEl = document.getElementById('killfeed');
let toastT = 0;
function toast(t) { toastEl.textContent = t; toastEl.style.opacity = 1; toastT = 1.4; }
const kills = [];
function addKill(t) { kills.unshift(t); if (kills.length > 4) kills.pop(); killfeedEl.innerHTML = kills.join('<br>'); setTimeout(() => { kills.pop(); killfeedEl.innerHTML = kills.join('<br>'); }, 4000); }

function updateHUD() {
  const w = curW(), s = curS();
  document.getElementById('ammo').innerHTML = (s.reloading ? '⟳' : s.ammo) + '<small>/' + s.reserve + '</small>';
  document.getElementById('wname').textContent = w.name;
  document.getElementById('watt').textContent = w.cls + ' · ' + w.att + '  [1-4 swap · R reload · RMB aim]';
  document.getElementById('hpfill').style.width = Math.max(0, hp) + '%';
  document.getElementById('topright').innerHTML = isTouch
    ? '<b>CAMPAIGN</b> — Colombia, 1985<br>Left stick = move · drag right = look<br><b>FIRE</b> to shoot'
    : '<b>CAMPAIGN</b> — Colombia, 1985<br>Move <b>WASD</b> · Sprint <b>Shift</b> · Crouch <b>C</b> · Jump <b>Space</b><br>Shoot <b>LMB/RT</b> · Aim <b>RMB/LT</b> · Look <b>Mouse/R-Stick</b>';
}

const centerRay = new THREE.Raycaster();
function updateNameplate() {
  centerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const meshes = [];
  entities.forEach(e => { if (e.alive) { e.body.userData.e = e; e.head.userData.e = e; meshes.push(e.body, e.head); } });
  const hits = centerRay.intersectObjects(meshes, false);
  if (hits.length && hits[0].distance < 80) {
    const e = hits[0].object.userData.e;
    let col = e.kind === 'friendly' ? '#89b4fa' : (e.kind === 'neutral' ? '#e6e6e6' : '#f38ba8');
    nameplateEl.textContent = e.name;
    nameplateEl.style.color = col;
  } else nameplateEl.textContent = '';
}

// ---------------------------------------------------------------- game flow
let playing = false;
document.querySelectorAll('.mode').forEach(el => el.addEventListener('click', () => {
  const mode = el.dataset.mode;
  if (mode !== 'campaign') { toast('PROTOTYPE — not in this demo'); flashMenu(); return; }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('stamp').textContent = 'COLUMBIA, USA — 1985';
  document.getElementById('story').classList.remove('hidden');
}));
function flashMenu() { const m = document.getElementById('menu'); m.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 300 }); }
document.getElementById('story').addEventListener('click', () => {
  document.getElementById('story').classList.add('hidden');
  hud.classList.remove('hidden');
  if (isTouch) { playing = true; document.getElementById('touch').classList.remove('hidden'); }
  else controls.lock();
});
controls.addEventListener('lock', () => { playing = true; });
controls.addEventListener('unlock', () => { playing = false; });

// ---------------------------------------------------------------- touch controls
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const touch = { moveX: 0, moveZ: 0, sprint: false, crouchToggle: false, firing: false,
  moveId: null, lookId: null, fireId: null, moveOrigin: null, lookLast: null };
const knobEl = document.getElementById('knob');
if (isTouch) document.body.classList.add('touchmode');

function zoneAt(x, y) {
  for (const id of ['btn-fire', 'btn-jump', 'btn-reload', 'btn-crouch', 'btn-swap', 'btn-aim', 'stick']) {
    const r = document.getElementById(id).getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
  }
  return null;
}
function tStart(e) {
  if (!playing) return;
  for (const t of e.changedTouches) {
    const z = zoneAt(t.clientX, t.clientY);
    if (z === 'btn-fire') { touch.firing = true; touch.fireId = t.identifier; }
    else if (z === 'btn-jump') { if (onGround) { vy = 6; onGround = false; } }
    else if (z === 'btn-reload') { reload(); }
    else if (z === 'btn-crouch') { touch.crouchToggle = !touch.crouchToggle; }
    else if (z === 'btn-swap') { switchTo((wIndex + 1) % WEAPONS.length); }
    else if (z === 'btn-aim') { aiming = !aiming; document.getElementById('btn-aim').classList.toggle('on', aiming); }
    else if (z === 'stick' || t.clientX < innerWidth * 0.45) {
      touch.moveId = t.identifier;
      const r = document.getElementById('stick').getBoundingClientRect();
      touch.moveOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else { touch.lookId = t.identifier; touch.lookLast = { x: t.clientX, y: t.clientY }; }
  }
  e.preventDefault();
}
function tMove(e) {
  if (!playing) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId && touch.moveOrigin) {
      const dx = t.clientX - touch.moveOrigin.x, dy = t.clientY - touch.moveOrigin.y;
      const max = 55, mag = Math.hypot(dx, dy), cl = Math.min(mag, max);
      const nx = mag ? dx / mag : 0, ny = mag ? dy / mag : 0;
      touch.moveX = nx * (cl / max); touch.moveZ = ny * (cl / max);
      touch.sprint = (cl / max) > 0.92;
      knobEl.style.left = (40 + nx * cl * 0.7) + 'px';
      knobEl.style.top = (40 + ny * cl * 0.7) + 'px';
    } else if (t.identifier === touch.lookId && touch.lookLast) {
      const dx = t.clientX - touch.lookLast.x, dy = t.clientY - touch.lookLast.y;
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * 0.004; euler.x -= dy * 0.004;
      euler.x = Math.max(-1.5, Math.min(1.5, euler.x));
      camera.quaternion.setFromEuler(euler);
      touch.lookLast = { x: t.clientX, y: t.clientY };
    }
  }
  e.preventDefault();
}
function tEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.moveX = 0; touch.moveZ = 0; touch.sprint = false; knobEl.style.left = '40px'; knobEl.style.top = '40px'; }
    if (t.identifier === touch.lookId) { touch.lookId = null; touch.lookLast = null; }
    if (t.identifier === touch.fireId) { touch.firing = false; touch.fireId = null; }
  }
}
if (isTouch) {
  addEventListener('touchstart', tStart, { passive: false });
  addEventListener('touchmove', tMove, { passive: false });
  addEventListener('touchend', tEnd);
  addEventListener('touchcancel', tEnd);
}

// ---------------------------------------------------------------- weapon animation (bob/sway/recoil/reload/ADS)
let bobPhase = 0;
const prevCamQ = new THREE.Quaternion();
function updateWeapon(dt) {
  const s = curS();
  // per-gun ADS: rig moves so THIS gun's iron sights sit on the eye line
  const onSights = aiming && !s.reloading;
  const target = onSights ? (gunModels[wIndex].ads || ADS) : HIP;
  document.getElementById('crosshair').style.opacity = onSights ? 0 : 1;

  // base approach (ADS <-> hip)
  rig.position.lerp(target, Math.min(1, dt * 14));

  // walk bob
  bobPhase += dt * (4 + moveAmount * 6.5);
  const bobAmt = moveAmount * (aiming ? 0.004 : 0.014);
  rig.position.y += Math.abs(Math.sin(bobPhase)) * -bobAmt + bobAmt * 0.5;
  rig.position.x += Math.cos(bobPhase * 0.5) * bobAmt * 0.6;

  // look sway (rig lags the camera slightly)
  const dq = prevCamQ.clone().invert().multiply(camera.quaternion);
  const e = new THREE.Euler().setFromQuaternion(dq, 'YXZ');
  rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, THREE.MathUtils.clamp(e.y * 6, -0.06, 0.06), dt * 10);
  rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, THREE.MathUtils.clamp(e.x * 6, -0.05, 0.05), dt * 10);
  prevCamQ.copy(camera.quaternion);

  // recoil spring
  if (recoil > 0) {
    recoil = Math.max(0, recoil - dt * 7);
    const k = recoil * recoil;
    rig.position.z += k * 0.055;
    rig.rotation.x += k * 0.06;
  }

  // reload animation (gun dips + rolls, mag drops and returns)
  if (s.reloading) {
    s.reloadT = Math.min(1, s.reloadT + dt / 0.9);
    const t = s.reloadT;
    const dip = Math.sin(t * Math.PI);        // 0->1->0
    rig.position.y += -dip * 0.13;
    rig.rotation.z = -dip * 0.5;
    rig.rotation.x += -dip * 0.25;
    const gm = gunModels[wIndex];
    if (gm.mag && gm.mag.userData.home) {
      const home = gm.mag.userData.home;
      if (t < 0.35) {                                  // mag releases: slides down and tilts out
        gm.mag.visible = true;
        gm.mag.position.y = home.y - (t / 0.35) * 0.2;
        gm.mag.rotation.x = (t / 0.35) * 0.45;
      } else if (t < 0.6) {                            // the empty DROPS — a real mag falls to the ground
        if (!s.magDropped) { s.magDropped = true; dropMag(gm.mag); }
        gm.mag.visible = false;
      } else {                                         // fresh mag comes up from below and seats
        gm.mag.visible = true;
        const k = (t - 0.6) / 0.4;
        gm.mag.position.y = home.y - (1 - k) * 0.18;
        gm.mag.rotation.x = 0;
      }
    }
  } else {
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, 0, dt * 10);
    const gm = gunModels[wIndex];
    if (gm.mag && gm.mag.userData.home) {
      gm.mag.visible = true;
      gm.mag.position.y = gm.mag.userData.home.y;
      gm.mag.rotation.x = 0;
      s.magDropped = false;
    }
  }
  // bolt / charging handle / hammer cycles with every shot
  {
    const gm = gunModels[wIndex];
    if (gm.bolt && gm.bolt.userData.home !== undefined) {
      const k = recoil * recoil;
      if (wIndex === 3) gm.bolt.rotation.x = -k * 0.9;                       // hammer snaps back
      else if (gm.bolt.userData.home.z !== undefined) gm.bolt.position.z = gm.bolt.userData.home.z + k * 0.055;
    }
  }

  // shotgun pump / pistol slide cycle on recoil
  const pump = gunModels[wIndex].pump;
  if (pump) {
    pump.userData.base = pump.userData.base || pump.position.clone();
    pump.position.z = pump.userData.base.z + recoil * (wIndex === 3 ? 0.05 : 0.09);
  }

  // FOV
  const targetFov = aiming && !s.reloading ? ADS_FOV : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 12));
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- entity animation (idle / aim / death)
function updateEntities(dt) {
  for (const e of entities) {
    if (e.rag) { updateRagdoll(e, dt); continue; }   // ragdolling — let it flop
    if (!e.alive) continue;
    e.phase += dt;
    const J = e.model.joints;                        // [aLs, aLe, aRs, aRe, lLh, lLk, lRh, lRk, head]
    const B = (i) => J[i].userData.basePose;
    const ai = e.ai;

    // ---- hit reaction (both sides): jerk back, stagger, recover ----
    if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt * 2.6);
    e.model.torso.rotation.x = -0.35 * e.hitT;
    J[8].rotation.x = B(8).x - 0.35 * e.hitT;

    if (ai) {
      // walk-cycle blend decays HERE (runs even while paused/dead, so nobody jogs in place)
      ai.movingAmt = Math.max(0, ai.movingAmt - dt * 4);
      // ---- aim + recoil timers ----
      ai.aimHold = Math.max(0, ai.aimHold - dt);
      const wantAim = ai.aimHold > 0 && ai.reloadT === 0 ? 1 : 0;
      ai.aimAmt += (wantAim - ai.aimAmt) * Math.min(1, dt * 6);
      ai.kick = Math.max(0, ai.kick - dt * 7);
      const aimA = ai.aimAmt, kick = ai.kick * ai.kick;   // sharp kick, fast recovery
      // ---- crouch blend (cover) ----
      ai.crouch += ((ai.crouchTarget || 0) - ai.crouch) * Math.min(1, dt * 7);

      // ---- walk / run cycle + crouch formations on the leg joints ----
      const sp = ai.state === 'move' ? (ai.runSpeed || 2.3) : 0;
      if (ai.movingAmt > 0.05) ai.walkPhase += dt * (4 + sp * 1.7);
      const c = ai.crouch;
      const CR = CROUCH_STYLES[ai.crouchStyle || 0];
      const swing = Math.sin(ai.walkPhase) * (0.32 + sp * 0.08) * ai.movingAmt * (1 - c);
      const bendA = Math.max(0, -Math.sin(ai.walkPhase)) * 0.45 * ai.movingAmt * (1 - c);
      const bendB = Math.max(0, Math.sin(ai.walkPhase)) * 0.45 * ai.movingAmt * (1 - c);
      J[4].rotation.x = B(4).x + swing - bendA * 0 + (CR.lh - B(4).x) * c;  // left hip
      J[5].rotation.x = B(5).x - bendA + (CR.lk - B(5).x) * c;              // left knee (shin folds BACK)
      J[6].rotation.x = B(6).x - swing + (CR.rh - B(6).x) * c;              // right hip
      J[7].rotation.x = B(7).x - bendB + (CR.rk - B(7).x) * c;              // right knee
      // lean forward while running; settle lower into the kneel
      e.model.torso.rotation.x += -0.14 * ai.movingAmt - 0.12 * c;

      // ---- arms & gun: the gun stays LEVEL on the body; hands ride their stations ----
      // READY  (creation pose): gun at chest height; right hand grip, left hand barrel.
      // AIM: the level gun rises to the shoulder; both hands rise with it.
      const L = (a, b) => a * (1 - aimA) + b * aimA;
      const br = Math.sin(e.phase * 1.7) * 0.035 * (1 - aimA);
      if (ai.reloadT > 0) {
        // reload: right hand keeps the grip; LEFT hand drops to the belt for the mag
        const p = 1 - ai.reloadT / 1.7;
        const wave = Math.sin(Math.min(1, p) * Math.PI);
        J[0].rotation.x = B(0).x - wave * 0.75;
        J[0].rotation.z = B(0).z - wave * 0.55;
        J[1].rotation.x = B(1).x + wave * 0.3;
        if (e.model.gun) {
          const mg = e.model.gun.userData.mag;
          if (mg) {
            const out = p > 0.3 && p < 0.62;
            if (out && !ai.magDropped) { ai.magDropped = true; dropMag(mg); }  // the empty hits the dirt
            mg.visible = !out;
          }
        }
      } else {
        J[0].rotation.x = L(B(0).x + br, 1.44);          // left hand rides the BARREL
        J[0].rotation.z = L(B(0).z, 0.57);
        J[1].rotation.x = L(B(1).x, 0.03) - 0.2 * kick;
        if (e.model.gun) {
          const mg = e.model.gun.userData.mag;
          if (mg) mg.visible = true;
        }
      }
      // right arm: hand stays ON the grip; elbow bends deeper as the gun rises
      J[2].rotation.x = L(B(2).x + br, 0.35) + 0.1 * kick;
      J[2].rotation.z = L(B(2).z, -0.35);
      J[3].rotation.x = L(B(3).x, 1.6) - 0.25 * kick;
      // the LEVEL gun itself: rises from chest carry to shoulder aim; recoil shoves it straight back
      if (e.model.gun) {
        const g = e.model.gun;
        g.rotation.x = 0.12 * kick;                      // level — only the shot itself flips it
        g.position.x = L(g.userData.basePos.x, 0.12);
        g.position.y = L(g.userData.basePos.y, 1.38);
        g.position.z = L(g.userData.basePos.z, -0.52) + 0.06 * kick;  // butt seats AT the shoulder pocket
      }
      // cheek weld while aiming; the body rocks back on each shot
      // (torso yaw is set in the facing section below — turn-lead + blade)
      J[8].rotation.z = 0.07 * aimA;
      e.model.torso.rotation.x += -0.09 * kick;

      // ---- body height: crouch formation depth + footstep bob ----
      e.grp.position.y = e.baseY - CR.drop * ai.crouch
        + Math.abs(Math.sin(ai.walkPhase)) * 0.05 * ai.movingAmt
        + Math.sin(e.phase * 2) * 0.02 * (1 - ai.movingAmt);

      // ---- facing: TURN, don't snap — slow believable rotation, torso leads ----
      let fx, fz;
      if (ai.state === 'move') {
        fx = e.kind === 'friendly' ? (ai.cover ? ai.cover.sx : e.grp.position.x) : ai.moveX;
        fz = e.kind === 'friendly' ? (ai.cover ? ai.cover.sz : e.grp.position.z) : ai.moveZ;
      } else if (e.kind === 'friendly') {
        const t = nearestEnemyOf(e);
        fx = (t ? t.grp.position : camera.position).x;
        fz = (t ? t.grp.position : camera.position).z;
      } else {
        fx = camera.position.x; fz = camera.position.z;
      }
      turnToward(e, fx, fz, ai.state === 'move' ? 3.4 : 2.2, dt);
      // the upper body LEADS the turn — head and torso swing toward the target
      // first, the feet catch up. This is what makes rotation read as rotation.
      const lead = THREE.MathUtils.clamp(e.turnDiff || 0, -0.55, 0.55);
      e.model.torso.rotation.y = 0.12 * aimA + lead * 0.45;
      J[8].rotation.y = lead * 0.65;
    } else {
      // civilians / Prestige: breathe and watch you (turning, not snapping)
      e.grp.position.y = e.baseY + Math.sin(e.phase * 2) * 0.03;
      e.model.armL.rotation.x = (e.model.armL.userData.bx || 0) + Math.sin(e.phase * 1.7) * 0.035;
      e.model.armR.rotation.x = (e.model.armR.userData.bx || 0) - Math.sin(e.phase * 1.7) * 0.035;
      turnToward(e, camera.position.x, camera.position.z, 2.4, dt);
    }
  }
}

// rotate an NPC's body toward a point at a limited turn rate (rad/s).
// Leaves e.faceErr (remaining yaw error — AI holds fire mid-turn) and
// e.turnDiff (signed error — the torso/head visibly LEAD into the turn).
function turnToward(e, fx, fz, rate, dt) {
  const desired = Math.atan2(-(fx - e.grp.position.x), -(fz - e.grp.position.z));
  let diff = desired - e.grp.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  e.turnDiff = diff;
  const step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
  e.grp.rotation.y += step;
  e.faceErr = Math.abs(diff) - Math.abs(step);
}

// crouch formations — picked at random each time a soldier settles into cover
const CROUCH_STYLES = [
  { lh: 1.15, lk: -1.25, rh: -0.2, rk: -1.5,  drop: 0.42 }, // KNEEL: right knee down, left foot planted
  { lh: -0.2, lk: -1.5,  rh: 1.15, rk: -1.25, drop: 0.42 }, // KNEEL mirrored: left knee down
  { lh: 1.2,  lk: -1.4,  rh: 1.2,  rk: -1.4,  drop: 0.5 },  // LOW SQUAT: both legs coiled
];

// ---------------------------------------------------------------- combat AI (think + move + shoot)
function nearestEnemyOf(f) {
  let best = null, bestD = 70;
  for (const e of entities) {
    if (!e.alive || e.kind !== 'enemy') continue;
    const d = f.grp.position.distanceTo(e.grp.position);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
function updateCombatAI(dt) {
  const friendlies = entities.filter(f => f.alive && f.kind === 'friendly');

  for (const e of entities) {
    if (!e.alive || !e.ai) continue;
    const ai = e.ai;
    if (ai.reloadT > 0) ai.reloadT = Math.max(0, ai.reloadT - dt);
    if (ai.reloadT === 0 && ai.mag <= 0) ai.mag = ai.magMax;   // mag seated

    // ============ TEAM APEX (ground squad): run, take cover, peek, fire ============
    if (e.kind === 'friendly' && !e.posted) {
      const target = nearestEnemyOf(e);
      if (!target) { ai.state = 'hold'; ai.crouchTarget = 0; continue; }
      const aim = target.grp.position.clone().add(new THREE.Vector3(0, 1.15, 0));

      if (ai.state === 'hold') {                       // decide where to fight from
        const cov = pickCover(e, target.grp.position);
        if (cov) { ai.cover = cov; ai.state = 'move'; ai.runSpeed = rnd(3.6, 4.6); ai.fireT = rnd(0.5, 1.1); }
        else { ai.state = 'peek'; ai.peekT = rnd(1, 2); }
      } else if (ai.state === 'move') {                 // RUN to cover — shooting on the move
        const r = stepNPC(e, ai.cover.sx, ai.cover.sz, ai.runSpeed, dt);
        ai.movingAmt = 1; ai.crouchTarget = 0;
        ai.fireT -= dt;
        if (ai.fireT <= 0) {                            // snap a shot mid-run (wild)
          ai.fireT = rnd(0.8, 1.5);
          npcTryFire(e, aim, { err: 0.11, hitRadius: 0.3, friendly: true }) && hitEnemy(e, target, 16);
        }
        if (r === 'arrived') {
          ai.state = 'cover'; ai.coverT = rnd(0.9, 2.0); ai.peekCycles = 2 + (Math.random() * 3 | 0);
          ai.crouchStyle = (Math.random() * CROUCH_STYLES.length) | 0;   // pick a crouch formation
        }
        else if (r === 'blocked') { ai.cover = null; ai.state = 'hold'; }
      } else if (ai.state === 'cover') {                // tucked behind the object
        ai.crouchTarget = 1;
        ai.coverT -= dt;
        if (ai.reloadT === 0 && ai.mag < ai.magMax * 0.4) { ai.mag = 0; ai.reloadT = 1.7; ai.magDropped = false; } // top up while safe
        if (ai.coverT <= 0 && ai.reloadT === 0) { ai.state = 'peek'; ai.peekT = rnd(1.1, 1.9); ai.fireT = 0.25; }
      } else if (ai.state === 'peek') {                 // up on the sights — fire a burst
        ai.crouchTarget = 0;
        ai.aimHold = Math.max(ai.aimHold, 0.3);         // rifle shouldered the whole peek
        ai.peekT -= dt; ai.fireT -= dt;
        if (ai.fireT <= 0) {
          ai.fireT = rnd(0.32, 0.5);
          npcTryFire(e, aim, { err: 0.055, hitRadius: 0.32, friendly: true }) && hitEnemy(e, target, 22);
        }
        if (ai.peekT <= 0) {
          ai.peekCycles--;
          if (ai.peekCycles <= 0 || !ai.cover) { ai.cover = null; ai.state = 'hold'; } // REPOSITION — run somewhere new
          else { ai.state = 'cover'; ai.coverT = rnd(0.8, 1.6); }
        }
      }
    }

    // ============ Rooftop twins: posted snipers (reload + stagger only) ============
    else if (e.kind === 'friendly' && e.posted) {
      const target = nearestEnemyOf(e);
      if (!target) continue;
      ai.aimHold = Math.max(ai.aimHold, 0.3);           // snipers live on the glass
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.2 + Math.random() * 1.8;
        const aim = target.grp.position.clone().add(new THREE.Vector3(0, 1.15, 0));
        npcTryFire(e, aim, { err: 0.03, hitRadius: 0.32, friendly: true }) && hitEnemy(e, target, 45);
      }
    }

    // ============ HYDRA: defenders that patrol, stagger, and reload ============
    else if (e.kind === 'enemy') {
      const dPlayer = e.grp.position.distanceTo(camera.position);
      if (ai.state === 'move') {
        const r = stepNPC(e, ai.moveX, ai.moveZ, 2.3, dt);
        ai.movingAmt = 1;
        if (r !== 'moving') ai.state = 'hold';
      } else {
        ai.thinkT -= dt;
        if (ai.thinkT <= 0) {                           // sometimes walk to a new spot nearby
          ai.thinkT = rnd(2.5, 6);
          if (Math.random() < 0.45) {
            ai.moveX = e.baseX + rnd(-3.5, 3.5);
            ai.moveZ = e.baseZ + rnd(-3.5, 3.5);
            ai.state = 'move';
          }
        }
        if (dPlayer < 60) {
          e.shootTimer -= dt;
          if (e.shootTimer < 0.5) ai.aimHold = Math.max(ai.aimHold, 0.4);  // raises the rifle BEFORE firing — a readable tell
          if (e.shootTimer <= 0) {
            e.shootTimer = 1.1 + Math.random() * 1.9;
            if (friendlies.length && Math.random() < 0.4) {   // crossfire at your team
              const f = friendlies[(Math.random() * friendlies.length) | 0];
              const fAim = f.grp.position.clone().add(new THREE.Vector3(0, f.ai && f.ai.crouch > 0.5 ? 0.8 : 1.2, 0));
              if (npcTryFire(e, fAim, { err: 0.08, hitRadius: 0.3 })) {
                bloodBurst(fAim, null);
                f.hitT = 1;                                   // hit reaction (animated)
              }
            } else {
              const err = 0.035 + dPlayer * 0.0011 + moveAmount * 0.03 + (crouching ? -0.008 : 0);
              if (npcTryFire(e, camera.position.clone(), { err, hitRadius: 0.4 })) {
                damagePlayer(6 + Math.random() * 9);
              }
            }
          }
        }
      }
    }
  }
}
// a friendly landing a hit on an enemy (blood, stagger, maybe the kill)
function hitEnemy(f, target, dmg) {
  target.hp -= dmg;
  target.hitT = 1;
  const shotDir = target.grp.position.clone().sub(f.grp.position).setY(0).normalize();
  bloodBurst(target.grp.position.clone().add(new THREE.Vector3(0, 1.15, 0)), shotDir);
  if (target.hp <= 0 && target.alive) killEntity(target, false, shotDir, f.name);
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, lastFps = 0, elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.4) { lastFps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  document.getElementById('topleft').innerHTML =
    'FPS <span class="fps">' + lastFps + '</span>&nbsp;&nbsp;·&nbsp;&nbsp;KILLS <b style="color:#a6e3a1">' + killCount + '</b>';

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = 0; }

  updateEntities(dt);
  updateShells(dt);
  updateBlood(dt);
  updateSmoke(dt);
  updateDust(dt);
  updateFallingMags(dt);
  elapsed += dt;
  updateFire(dt, elapsed);
  skyDome.position.copy(camera.position);      // sky follows player

  const gp = pollGamepad();

  moveAmount = 0;
  if (playing && !dead) {
    if (gp) {
      const lookX = dz(gp.axes[2] || 0), lookY = dz(gp.axes[3] || 0);
      if (lookX || lookY) {
        camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -lookX * 2.4 * dt);
        camera.rotateX(-lookY * 2.0 * dt);
      }
      const ltHeld = !!(gp.buttons[6] && gp.buttons[6].value > 0.4);
      if (ltHeld !== !!padPrev.lt) { aiming = ltHeld; padPrev.lt = ltHeld; }
    }
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'] || (gp && padBtn(gp, 10)) || touch.sprint;
    crouching = keys['KeyC'] || (gp && padBtn(gp, 1)) || touch.crouchToggle;
    let speed = crouching ? 2.2 : sprint ? 8.5 : 5;
    if (aiming) speed *= 0.55;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    if (gp) { ix += dz(gp.axes[0] || 0); iz += dz(gp.axes[1] || 0); }
    if (isTouch) { ix += touch.moveX; iz += touch.moveZ; }
    const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
    moveAmount = Math.min(1, Math.hypot(ix, iz)) * (sprint ? 1 : 0.7);

    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(fwd, -iz * speed)
      .addScaledVector(right, ix * speed);

    if ((keys['Space'] || (gp && padPressed(gp, 0))) && onGround) { vy = 6; onGround = false; }
    vy -= 18 * dt;

    const prev = camera.position.clone();
    camera.position.addScaledVector(move, dt);
    camera.position.y += vy * dt;

    const targetH = crouching ? CROUCH_H : PLAYER_H;
    if (camera.position.y <= targetH) { camera.position.y = targetH; vy = 0; onGround = true; }

    const pt = new THREE.Vector3(camera.position.x, 1, camera.position.z);
    for (const b of buildings) {
      if (b.containsPoint(pt)) { camera.position.x = prev.x; camera.position.z = prev.z; break; }
    }
    const R = 70;
    if (Math.hypot(camera.position.x, camera.position.z) > R) { camera.position.x = prev.x; camera.position.z = prev.z; }

    const rt = gp && (gp.buttons[7] && gp.buttons[7].value > 0.4);
    const wantFire = firing || rt || touch.firing;
    const w = curW();
    const now = performance.now();
    if (wantFire && now - lastShot > 60000 / w.rpm) { lastShot = now; shoot(); if (!w.auto) { firing = false; } }

    if (gp) {
      if (padPressed(gp, 2)) reload();
      if (padPressed(gp, 3)) switchTo((wIndex + 1) % WEAPONS.length);
      if (padPressed(gp, 5)) switchTo((wIndex + 1) % WEAPONS.length);
      if (padPressed(gp, 4)) switchTo((wIndex - 1 + WEAPONS.length) % WEAPONS.length);
    }

    // ---- COMBAT AI: state machines for both sides (move/cover/peek/reload) ----
    updateCombatAI(dt);

    // health regen: 3 seconds without taking damage -> regenerate to 100
    if (hp < 100 && performance.now() - lastDamageAt > 3000) {
      hp = Math.min(100, hp + 45 * dt);
    }

    updateNameplate();
  }

  updateWeapon(dt);
  updateHUD();
  renderer.render(scene, camera);
}
animate();

const BUILD = 23;   // bump with each demo update — shown on the badge so staleness is visible
window.__demo = { THREE, scene, camera, entities, WEAPONS, BUILD };
console.log('[demo] ready — Three r' + THREE.REVISION + ' · build ' + BUILD);
document.getElementById('jsok').textContent = 'js: ✓ running · build ' + BUILD;
