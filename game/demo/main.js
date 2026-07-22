// UNTITLED — First Demo (vertical slice) — "CoD1 milestone" build
// Three.js FPS: textured world (all textures painted procedurally on canvas — no assets),
// modeled gun viewmodels with animations (bob/sway/recoil/reload/muzzle flash/shells),
// soldier models with death animations, ADS, KB+mouse + controller + touch,
// nameplate system, friendly-fire lockout, story intro.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

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
const blackTacTex = camoTex('#16171a', '#0e0f11', '#1f2124');   // Molotov's black-on-black

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
const pbrBrickMats = [];   // brick walls waiting for the photo-scanned PBR upgrade
const wallMats = [wallTexA, wallTexB, wallTexC, brickTex];
function makeBuilding(x, z, w, h, d, i, forceIntact = false) {
  const tex = wallMats[i % wallMats.length];
  const isBrick = tex === brickTex;
  const wall = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95,
    normalMap: isBrick ? brickNormal : stuccoNormal,
    normalScale: new THREE.Vector2(isBrick ? 0.9 : 0.5, isBrick ? 0.9 : 0.5) });
  if (isBrick) pbrBrickMats.push(wall);
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
  const c = document.createElement('canvas'); c.width = c.height = 384;  // triple-res faces
  const x = c.getContext('2d');
  x.scale(3, 3);
  const skin = f.skin || '#c9a184';
  if (f.mask === 'molotov') {
    // SCULPTED FLAME MASK (ChatGPT design): living fire over the whole face,
    // dark eye sockets with ember glints, vent slits, the white bottle at the chin
    const base = x.createLinearGradient(0, 128, 0, 0);
    base.addColorStop(0, '#5a1404'); base.addColorStop(0.45, '#a33208');
    base.addColorStop(0.8, '#e06010'); base.addColorStop(1, '#f0a027');
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 14; i++) {                    // flame tongues licking upward
      const fx = rnd(4, 124), w = rnd(5, 14), h = rnd(30, 85);
      const g = x.createLinearGradient(0, 128, 0, 128 - h);
      g.addColorStop(0, 'rgba(255,210,90,0.85)');
      g.addColorStop(0.6, 'rgba(255,120,25,0.5)');
      g.addColorStop(1, 'rgba(255,120,25,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(fx - w / 2, 128);
      x.quadraticCurveTo(fx - w * 0.8, 128 - h * 0.55, fx + rnd(-6, 6), 128 - h);
      x.quadraticCurveTo(fx + w * 0.8, 128 - h * 0.5, fx + w / 2, 128);
      x.closePath(); x.fill();
    }
    x.strokeStyle = 'rgba(120,25,5,0.6)'; x.lineWidth = 3;   // brow ridge contour
    x.beginPath(); x.moveTo(20, 44); x.quadraticCurveTo(64, 30, 108, 44); x.stroke();
    [[42, 54], [86, 54]].forEach(([ex, ey]) => {             // DARK sockets, ember glint
      x.fillStyle = '#120503';
      x.beginPath(); x.ellipse(ex, ey, 13, 8, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,140,40,0.8)';
      x.beginPath(); x.arc(ex + 2, ey - 1, 1.6, 0, 7); x.fill();
    });
    x.fillStyle = 'rgba(60,12,4,0.7)';                       // vent slits
    x.fillRect(59, 74, 10, 3); x.fillRect(56, 82, 16, 3); x.fillRect(59, 90, 10, 3);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 2; // gloss (it is a hard shell)
    x.beginPath(); x.moveTo(30, 20); x.quadraticCurveTo(64, 10, 98, 22); x.stroke();
    x.fillStyle = '#f2f2f2';                                  // the white bottle emblem
    x.fillRect(60, 106, 8, 13); x.fillRect(62, 101, 4, 5);
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
    // a painted PORTRAIT: shaded skin, almond eyes with iris depth, real lips,
    // a shaded nose, individual brow hairs — no more Minecraft
    const skinC = skin;
    x.fillStyle = skinC; x.fillRect(0, 0, 128, 128);
    // skin shading: forehead light, jaw shadow, side falloff
    let g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,245,230,0.16)'); g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,22,14,0.28)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    [[0, 22], [128, -22]].forEach(([ex, dw]) => {          // cheekside falloff
      const gs = x.createLinearGradient(ex, 0, ex + dw, 0);
      gs.addColorStop(0, 'rgba(30,18,10,0.3)'); gs.addColorStop(1, 'rgba(30,18,10,0)');
      x.fillStyle = gs; x.fillRect(Math.min(ex, ex + dw), 0, Math.abs(dw), 128);
    });
    [[40, 78], [88, 78]].forEach(([cx2, cy2]) => {          // cheek warmth
      const cg = x.createRadialGradient(cx2, cy2, 0, cx2, cy2, 16);
      cg.addColorStop(0, 'rgba(200,90,60,0.14)'); cg.addColorStop(1, 'rgba(200,90,60,0)');
      x.fillStyle = cg; x.beginPath(); x.arc(cx2, cy2, 16, 0, 7); x.fill();
    });
    if (f.old) {
      x.strokeStyle = 'rgba(60,40,30,0.4)'; x.lineWidth = 1.2;
      [[30, 82, 55, 86], [98, 82, 73, 86], [40, 102, 88, 102], [34, 34, 94, 34]]
        .forEach(([a, b2, cx2, d2]) => { x.beginPath(); x.moveTo(a, b2); x.quadraticCurveTo(64, b2 + 5, cx2, d2); x.stroke(); });
    }
    // hair: layered strokes, not a paint bucket
    if (f.hair) {
      x.fillStyle = f.hair; x.fillRect(0, 0, 128, 16);
      x.strokeStyle = f.hair; x.lineWidth = 2.2;
      for (let i = 0; i < 26; i++) {
        const hx = i * 5 + rnd(-2, 2);
        x.beginPath(); x.moveTo(hx, 0);
        x.quadraticCurveTo(hx + rnd(-4, 4), 12 + rnd(0, 6), hx + rnd(-6, 6), 18 + rnd(0, 8));
        x.stroke();
      }
      x.fillRect(0, 0, 9, 52); x.fillRect(119, 0, 9, 52);   // temples
    }
    // eye sockets (subtle depth) then the eyes themselves
    [[42, 54], [86, 54]].forEach(([ex, ey]) => {
      const sg = x.createRadialGradient(ex, ey, 2, ex, ey, 14);
      sg.addColorStop(0, 'rgba(70,45,30,0.22)'); sg.addColorStop(1, 'rgba(70,45,30,0)');
      x.fillStyle = sg; x.beginPath(); x.arc(ex, ey, 14, 0, 7); x.fill();
      // almond white
      x.fillStyle = '#f4f1ea';
      x.beginPath(); x.moveTo(ex - 10, ey);
      x.quadraticCurveTo(ex, ey - 6.5, ex + 10, ey);
      x.quadraticCurveTo(ex, ey + 6, ex - 10, ey);
      x.closePath(); x.fill();
      // iris with rim + pupil + catchlight
      const ig = x.createRadialGradient(ex, ey, 0.5, ex, ey, 4.2);
      const eyeC = f.eye || '#4a3c28';
      ig.addColorStop(0, eyeC); ig.addColorStop(0.75, eyeC); ig.addColorStop(1, '#1c130a');
      x.fillStyle = ig; x.beginPath(); x.arc(ex, ey, 4.2, 0, 7); x.fill();
      x.fillStyle = '#0a0705'; x.beginPath(); x.arc(ex, ey, 1.9, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(ex + 1.5, ey - 1.7, 1, 0, 7); x.fill();
      // lids
      x.strokeStyle = 'rgba(50,30,18,0.85)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(ex - 10, ey); x.quadraticCurveTo(ex, ey - 7, ex + 10, ey); x.stroke();
      x.strokeStyle = 'rgba(50,30,18,0.35)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(ex - 9, ey + 1); x.quadraticCurveTo(ex, ey + 6.5, ex + 9, ey + 1); x.stroke();
    });
    // brows: individual hairs, expression-tilted
    const tilt = f.worried ? -0.16 : f.stern ? 0.14 : 0;
    [[42, 1], [86, -1]].forEach(([bx, sgn]) => {
      x.strokeStyle = f.hair || '#2c2019'; x.lineWidth = 1.3;
      for (let i = 0; i < 11; i++) {
        const px2 = bx - 10 + i * 2;
        const py2 = 43 + sgn * tilt * (i * 2 - 10);
        x.beginPath(); x.moveTo(px2, py2 + 2);
        x.lineTo(px2 + 1.4, py2 - 2.4); x.stroke();
      }
    });
    // nose: bridge light, side shadows, tip, nostrils
    g = x.createLinearGradient(58, 0, 70, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(255,240,220,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(58, 56, 12, 20);
    x.strokeStyle = 'rgba(70,42,26,0.4)'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(59, 60); x.quadraticCurveTo(57, 72, 58, 77); x.stroke();
    x.beginPath(); x.moveTo(69, 60); x.quadraticCurveTo(71, 72, 70, 77); x.stroke();
    const ng = x.createRadialGradient(64, 78, 1, 64, 78, 7);
    ng.addColorStop(0, 'rgba(210,150,120,0.35)'); ng.addColorStop(1, 'rgba(210,150,120,0)');
    x.fillStyle = ng; x.beginPath(); x.arc(64, 78, 7, 0, 7); x.fill();
    x.fillStyle = 'rgba(40,20,12,0.75)';
    x.beginPath(); x.ellipse(60, 80, 1.8, 1.2, 0.3, 0, 7); x.fill();
    x.beginPath(); x.ellipse(68, 80, 1.8, 1.2, -0.3, 0, 7); x.fill();
    // mouth: two lips, expression-shaped
    const my = 95;
    x.fillStyle = 'rgba(140,70,55,0.85)';                    // upper lip
    x.beginPath();
    if (f.worried) { x.moveTo(50, my + 3); x.quadraticCurveTo(64, my - 2, 78, my + 3); x.quadraticCurveTo(64, my + 2, 50, my + 3); }
    else if (f.grim) { x.moveTo(50, my); x.lineTo(78, my); x.lineTo(78, my + 2); x.lineTo(50, my + 2); }
    else { x.moveTo(50, my); x.quadraticCurveTo(64, my + 3, 78, my); x.quadraticCurveTo(64, my + 4, 50, my); }
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(190,110,90,0.6)';                    // lower lip
    x.beginPath(); x.moveTo(53, my + 3); x.quadraticCurveTo(64, my + (f.worried ? 6 : 9), 75, my + 3);
    x.quadraticCurveTo(64, my + 5, 53, my + 3); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(60,25,18,0.6)'; x.lineWidth = 1.2; // lip seam
    x.beginPath();
    if (f.worried) x.arc(64, my + 10, 11, Math.PI * 1.2, Math.PI * 1.8);
    else x.moveTo(51, my + 1.5), x.quadraticCurveTo(64, my + (f.grim ? 1.5 : 4.5), 77, my + 1.5);
    x.stroke();
    if (f.mustache) {
      x.strokeStyle = f.hair || '#3a2a1a'; x.lineWidth = 1.6;
      for (let i = 0; i < 22; i++) {
        const mx = 46 + i * 1.7;
        x.beginPath(); x.moveTo(mx, 86);
        x.quadraticCurveTo(mx + (mx < 64 ? -1.5 : 1.5), 91, mx + (mx < 64 ? -2.5 : 2.5), 94);
        x.stroke();
      }
    }
    if (f.stubble) { for (let i = 0; i < 500; i++) { x.fillStyle = 'rgba(30,22,16,0.22)';
      const sx2 = rnd(24, 104), sy2 = rnd(84, 124);
      if (Math.hypot(sx2 - 64, sy2 - 97) > 13) x.fillRect(sx2, sy2, 1, 1.4); } }
    if (f.scar) {
      x.strokeStyle = 'rgba(150,70,58,0.85)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(96, 34); x.lineTo(88, 66); x.stroke();
      x.strokeStyle = 'rgba(150,70,58,0.5)'; x.lineWidth = 1;
      for (let i = 0; i < 4; i++) { const sy2 = 40 + i * 7; x.beginPath(); x.moveTo(90 + i * -0.5 + 3, sy2); x.lineTo(94 + i * -0.5 - 3, sy2 + 2); x.stroke(); }
    }
    if (f.scarf) {
      x.fillStyle = '#7a6a4e'; x.fillRect(0, 68, 128, 60);
      const wg = x.createLinearGradient(0, 68, 0, 84);
      wg.addColorStop(0, 'rgba(0,0,0,0.3)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = wg; x.fillRect(0, 68, 128, 16);
      x.strokeStyle = 'rgba(0,0,0,0.22)';
      for (let yy = 74; yy < 126; yy += 6) { x.beginPath(); x.moveTo(0, yy); x.lineTo(128, yy + 3); x.stroke(); }
      x.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let yy = 71; yy < 126; yy += 6) { x.beginPath(); x.moveTo(0, yy); x.lineTo(128, yy + 3); x.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- SCULPTED 3D FACES
// Real modeled features — protruding nose, eyeballs with iris/pupil, skin
// eyelids that blink, browridges, lips, ears, hair volume. The face looks
// out along -Z (the entity facing convention).
function sculptFace(head, f, hasHat) {
  const skinC = new THREE.Color(f.skin || '#c9a184');
  const skin = new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.62 });
  const hairM = new THREE.MeshStandardMaterial({ color: f.hair || '#2e2a26', roughness: 0.97 });
  // cranium FIRST — it stays the headshot raycast target (head.children[0])
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), skin);
  cranium.scale.set(0.92, 1.08, 0.98);
  cranium.castShadow = true;
  head.add(cranium);
  // jaw + chin square the lower face
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skin);
  jaw.scale.set(0.86, 0.72, 0.8); jaw.position.set(0, -0.082, -0.018);
  jaw.castShadow = true;
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 8), skin);
  chin.scale.set(1.15, 0.85, 0.8); chin.position.set(0, -0.122, -0.072);
  head.add(jaw, chin);
  [-0.064, 0.064].forEach(px => {                       // cheekbones
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), skin);
    cb.scale.set(1, 0.78, 0.72); cb.position.set(px, -0.006, -0.088);
    head.add(cb);
  });
  // EYES — real eyeballs (sclera sphere, iris, pupil) set under skin lids
  const lids = [];
  const scleraM = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.22 });
  const irisM = new THREE.MeshStandardMaterial({ color: new THREE.Color(f.eye || '#4a3c28'), roughness: 0.3 });
  const pupilM = new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 0.15 });
  [-0.047, 0.047].forEach(px => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.023, 12, 9), scleraM);
    eye.position.set(px, 0.018, -0.112);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0118, 10, 8), irisM);
    iris.scale.z = 0.38; iris.position.z = -0.0215;   // proud of the sclera so it reads
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0054, 8, 6), pupilM);
    pupil.scale.z = 0.32; pupil.position.z = -0.0248;
    eye.add(iris, pupil);
    // eyelid — a skin cap that sweeps down over the eyeball on each blink;
    // at rest it hoods the top of the eye for an almond shape
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.0258, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.34), skin);
    lid.position.copy(eye.position);
    lid.userData.open = -0.5; lid.userData.closed = -1.28;
    lid.rotation.x = lid.userData.open;
    lids.push(lid);
    head.add(eye, lid);
  });
  // BROWS — expression-tilted ridges of hair
  [-0.047, 0.047].forEach(px => {
    const s = px < 0 ? -1 : 1;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.016, 0.022), hairM);
    brow.position.set(px, 0.052, -0.126);
    brow.rotation.y = s * 0.3;                          // follow the skull curve
    brow.rotation.z = f.stern ? s * 0.2 : f.worried ? -s * 0.16 : s * 0.05;
    head.add(brow);
  });
  const lowerFace = !f.scarf;                           // scarf hides everything below the eyes
  if (lowerFace) {
    // NOSE — bridge leaning out to a tip, nostril wings, dark nostrils
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.036), skin);
    bridge.position.set(0, 0.003, -0.134); bridge.rotation.x = 0.26;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin);
    tip.position.set(0, -0.036, -0.151);
    head.add(bridge, tip);
    [-0.0205, 0.0205].forEach(px => {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.0142, 8, 7), skin);
      wing.position.set(px, -0.042, -0.135);
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 1 }));
      hole.position.set(px * 0.6, -0.053, -0.143);
      head.add(wing, hole);
    });
    // LIPS — two volumes with a dark seam; grim mouths press thinner
    const lipT = new THREE.MeshStandardMaterial({ color: skinC.clone().lerp(new THREE.Color('#8e4a3c'), 0.55), roughness: 0.55 });
    const lipB = new THREE.MeshStandardMaterial({ color: skinC.clone().lerp(new THREE.Color('#b06a55'), 0.45), roughness: 0.5 });
    const thin = f.grim ? 0.7 : 1;
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 7), lipT);
    upper.scale.set(1.6, 0.38 * thin, 0.5); upper.position.set(0, -0.067, -0.113);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 7), lipB);
    lower.scale.set(1.3, 0.5 * thin, 0.6); lower.position.set(0, -0.081, -0.111);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0035, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x3a1c14, roughness: 0.9 }));
    seam.position.set(0, -0.074, -0.122);
    head.add(upper, lower, seam);
    if (f.mustache) [-0.018, 0.018].forEach(px => {
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0155, 0.02), hairM);
      mo.position.set(px, -0.055, -0.124);
      mo.rotation.z = px < 0 ? 0.26 : -0.26;
      mo.rotation.y = px < 0 ? -0.18 : 0.18;
      head.add(mo);
    });
    if (f.stubble) {                                    // five-o'clock shadow shell over the jaw
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.104, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x171310, roughness: 1, transparent: true, opacity: 0.38, depthWrite: false }));
      st.scale.set(0.85, 0.68, 0.8); st.position.set(0, -0.079, -0.02);
      head.add(st);
    }
  } else {                                              // wrapped scarf across the lower face
    const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x7a6a4e, roughness: 1 }));
    wrap.scale.set(0.98, 0.72, 0.98); wrap.position.set(0, -0.058, -0.008);
    head.add(wrap);
  }
  if (f.scar) {
    const scar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.052, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x8e4438, roughness: 0.8 }));
    scar.position.set(0.062, 0.028, -0.116);
    scar.rotation.z = 0.22; scar.rotation.y = -0.42;
    head.add(scar);
  }
  // EARS
  [-0.121, 0.121].forEach(px => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 7), skin);
    ear.scale.set(0.4, 1, 0.72); ear.position.set(px, -0.008, 0.004);
    head.add(ear);
  });
  // HAIR — crown cap (skipped under hats) + back-of-head shell
  if (!hasHat) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1405, 16, 8, 0, Math.PI * 2, 0, 0.95), hairM);
    crown.scale.set(0.94, 1.1, 1.0); crown.castShadow = true;
    head.add(crown);
  }
  // back + temple hair wraps everything but the face opening
  const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.1405, 18, 10, -0.55, Math.PI + 1.1, 0.6, 1.15), hairM);
  backHair.scale.set(0.94, 1.1, 1.0);
  head.add(backHair);
  return lids;
}

// a character's COMPLETE head — sculpted face (or painted mask shell) + headgear,
// built around the head center (origin). Works parented to a body group or a bone.
function buildCharacterHead(preset, withNeck = false) {
  const assembly = new THREE.Group();
  let lids = null;
  if (!preset.face.mask && HEADSCAN) {
    // PHOTOREAL branch: the scanned human head, tinted + dressed per character
    if (!HEADSCAN.headGeo) HEADSCAN.headGeo = clipBelowY(HEADSCAN.geo, -1.26);  // high neck cut — the scan neck flares wide below this
    const skin = new THREE.MeshStandardMaterial({
      map: HEADSCAN.colT, normalMap: HEADSCAN.nrmT, roughness: 0.58,
      color: new THREE.Color(preset.tint || '#ffffff'),
      side: THREE.DoubleSide,
    });
    const scan = new THREE.Mesh(HEADSCAN.headGeo, skin);
    scan.castShadow = true;
    scan.rotation.y = Math.PI;                 // scan faces +Z; assembly convention is -Z
    scan.scale.setScalar(0.066);
    scan.position.y = -0.043;                  // eyes land ~2cm above head center
    assembly.add(scan);
    // EYES — open eyeballs set into the scan's sockets (iris + pupil catch light)
    const scleraM2 = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.22 });
    const irisM2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(preset.face.eye || '#4a3c28'), roughness: 0.28 });
    const pupilM2 = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.14 });
    [-0.034, 0.034].forEach(px => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0148, 10, 8), scleraM2);
      eye.position.set(px, 0.045, -0.108);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0078, 9, 7), irisM2);
      iris.scale.z = 0.4; iris.position.z = -0.0122;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 7, 6), pupilM2);
      pupil.scale.z = 0.35; pupil.position.z = -0.0148;
      eye.add(iris, pupil);
      assembly.add(eye);
    });
    // HAIR — short military crop fitted to the scan skull (skipped under hats)
    const hairM3 = new THREE.MeshStandardMaterial({ color: preset.face.hair || preset.hairSide || '#2e2a26', roughness: 0.97 });
    if (!preset.hat) {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.126, 16, 8, 0, Math.PI * 2, 0, 1.0), hairM3);
      crown.scale.set(1.02, 1.14, 1.14);
      crown.position.set(0, 0.092, 0.008);
      assembly.add(crown);
    }
    const backHair2 = new THREE.Mesh(new THREE.SphereGeometry(0.126, 16, 9, -0.5, Math.PI + 1.0, 0.7, 0.95), hairM3);
    backHair2.scale.set(1.02, 1.15, 1.12);
    backHair2.position.set(0, 0.082, 0.01);
    assembly.add(backHair2);
    // character overlays on the real face
    if (preset.glasses) assembly.add(buildEyewear(preset.glasses));
    if (preset.face.mustache) {
      const hairM2 = new THREE.MeshStandardMaterial({ color: preset.face.hair || '#3a2a1a', roughness: 0.95 });
      [-0.016, 0.016].forEach(px => {
        const mo = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.013, 0.016), hairM2);
        mo.position.set(px, -0.041, -0.122);
        mo.rotation.z = px < 0 ? 0.24 : -0.24;
        mo.rotation.y = px < 0 ? -0.16 : 0.16;
        assembly.add(mo);
      });
    }
    if (preset.face.scarf) {                   // Payback: lower face stays hidden
      const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x7a6a4e, roughness: 1 }));
      wrap.scale.set(0.96, 0.7, 0.96); wrap.position.set(0, -0.052, -0.006);
      assembly.add(wrap);
    }
  } else if (preset.face.mask) {
    // masked (Molotov flame shell, HYDRA balaclava): painted shell over the skull
    const sideM = new THREE.MeshStandardMaterial({ color: preset.hairSide || '#2e2a26', roughness: 0.9 });
    const faceM = new THREE.MeshStandardMaterial({ map: faceTex(preset.face), roughness: 0.75 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 11), sideM);
    skull.scale.set(0.95, 1.12, 1.0);
    skull.castShadow = true;
    const facePanel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.125, 0.26, 14, 1, true, Math.PI - 1.15, 2.3), faceM);
    facePanel.position.z = -0.012;
    assembly.add(skull, facePanel);
  } else {
    // bare faces: fully SCULPTED 3D head — modeled nose/eyes/lips/brows + blinking lids
    lids = sculptFace(assembly, preset.face, !!preset.hat);
  }
  // headgear (offsets relative to head center — the old absolute y minus 1.68);
  // the scan skull is taller than the sculpted sphere, so gear rides higher
  const hatLift = (!preset.face.mask && HEADSCAN) ? 0.045 : 0;
  if (preset.hat === 'helmetB' || preset.hat === 'helmetG') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 7, 0, Math.PI * 2, 0, 1.45),
      new THREE.MeshStandardMaterial({ color: preset.hat === 'helmetB' ? 0x1a1c20 : 0x3d4a33, roughness: 0.85 }));
    helmet.position.y = 0.12 + hatLift; helmet.castShadow = true; assembly.add(helmet);
  } else if (preset.hat === 'boonie') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x4c523a, roughness: 1 }));
    dome.position.y = 0.135 + hatLift;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.025, 12),
      new THREE.MeshStandardMaterial({ color: 0x444a34, roughness: 1 }));
    brim.position.y = 0.11 + hatLift;
    assembly.add(dome, brim);
  } else if (preset.hat === 'cap') {
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4530, roughness: 1 }));
    capTop.position.y = 0.15 + hatLift;
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x323b29, roughness: 1 }));
    bill.position.set(0, 0.12 + hatLift, -0.16);
    assembly.add(capTop, bill);
  } else if (preset.hat === 'hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 7, 0, Math.PI * 2, 0, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x7a6a4e, roughness: 1 }));
    hood.position.y = 0.06 + hatLift; assembly.add(hood);
  }
  if (withNeck && !preset.face.mask && HEADSCAN) {
    // chunky uniform collar — covers the neck junction with the body
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.092, 0.07, 12),
      new THREE.MeshStandardMaterial({ color: preset.collar || 0x39412c, roughness: 0.95 }));
    collar.position.y = -0.16;
    assembly.add(collar);
  }
  if (withNeck && !(HEADSCAN && !preset.face.mask)) {   // close the gap down to the body's neck stump (scan heads bring their own neck)
    const neckC = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: preset.face.mask ? 0x1c1e22 : (preset.face.skin || 0xc9a184), roughness: 0.85 }));
    neckC.position.y = -0.17;
    assembly.add(neckC);
  }
  return { assembly, lids };
}

// distinctive face + headgear per named character
const PRESETS = {
  'Molotov':         { face: { mask: 'molotov' }, hat: null, hairSide: '#8a2f10', blackTac: true, tape: 'MOLOTOV', meshyBody: true, weapon: { type: 'akm', sight: 'reddot', fire: 'auto' }, hold: 'magwell' },
  'Fox':             { face: { skin: '#c98d63', hair: '#4a3320', mustache: true, stern: true }, hat: 'cap',     hairSide: '#4a3320', glasses: 'aviator', tint: '#e6c9a4', weapon: { type: 'm4', sight: 'iron', fire: 'semi', laser: true } },
  'Striker':         { face: { skin: '#7a5236', hair: '#171412', stern: true, stubble: true },  hat: 'helmetG', hairSide: '#171412', glasses: 'aviator', tint: '#9a7050', weapon: { type: 'm4', sight: 'reddot', fire: 'auto' }, hold: 'underBarrel' },
  'Payback':         { face: { skin: '#d9ab88', scarf: true, eye: '#2e4a2e' },                  hat: 'hood',    hairSide: '#7a6a4e', glasses: 'aviator', weapon: { type: 'm14', sight: 'scope', fire: 'semi' }, hold: 'relaxed' },
  'Brian Wolford':   { face: { skin: '#dcb08e', hair: '#7a4a22', grim: true, scar: true },      hat: 'boonie',  hairSide: '#7a4a22', glasses: 'aviator', weapon: { type: 'm24', sight: 'scope', fire: 'safe' } },
  'Jesse Wolford':   { face: { skin: '#dcb08e', hair: '#7a4a22', worried: true },               hat: 'boonie',  hairSide: '#7a4a22', glasses: 'aviator', weapon: { type: 'm24', sight: 'scope', fire: 'safe' } },
  'Victor Prestige': { face: { skin: '#d8c2ad', hair: '#8e8e94', old: true, grim: true },       hat: null,      hairSide: '#8e8e94', glasses: 'round', tint: '#e8e2dc', collar: 0x23252b },
  'Civilian':        { face: { skin: '#c9a184', hair: '#2e2a26' },                              hat: null,      hairSide: '#2e2a26', tint: '#d8b894', collar: 0x6e5f45 },
  'HYDRA Trooper':   { face: { mask: 'balaclava' },                                             hat: 'helmetB', hairSide: '#1c1e22', weapon: { type: 'akm', sight: 'iron', fire: 'auto' }, hold: 'sloppy' },
};

// the fully-detailed NPC service rifle — shared by built-in and rigged soldiers.
// Meter units, barrel down -Z, origin at the receiver.
function buildNpcRifle() {
  const gun = new THREE.Group();
  const mSteel = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.55, metalness: 0.4 });
  const mPoly = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.8 });
  gun.add(part(mSteel, 0.05, 0.07, 0.34, 0, 0, -0.1));            // upper receiver
  gun.add(part(mDark, 0.05, 0.05, 0.16, 0, -0.05, -0.04));        // lower receiver
  gun.add(part(mDark, 0.004, 0.026, 0.06, 0.027, 0.005, -0.1));   // ejection port
  gun.add(cyl(mPoly, 0.03, 0.034, 0.18, 0, 0, -0.36));            // handguard
  gun.add(cyl(mDark, 0.013, 0.013, 0.16, 0, 0, -0.5));            // barrel
  gun.add(cyl(mDark, 0.018, 0.018, 0.05, 0, 0, -0.59));           // muzzle device
  gun.add(part(mDark, 0.008, 0.06, 0.014, 0, 0.042, -0.44));      // front sight post
  gun.add(part(mDark, 0.03, 0.03, 0.05, 0, 0.05, 0.02));          // rear sight block
  gun.add(part(mPoly, 0.03, 0.1, 0.05, 0, -0.115, 0.03, -0.45));  // pistol grip
  gun.add(part(mDark, 0.02, 0.008, 0.09, 0, -0.09, -0.08));       // trigger guard
  const gmag = curvedMag(mDark, 1.15);
  gmag.position.set(0, -0.07, -0.16);
  gun.add(gmag);
  gun.add(part(mPoly, 0.045, 0.075, 0.2, 0, -0.008, 0.165));      // stock
  gun.add(part(mDark, 0.05, 0.085, 0.02, 0, -0.008, 0.272));      // buttpad
  gun.add(part(mDark, 0.008, 0.012, 0.03, -0.028, -0.01, -0.02)); // selector
  gun.add(part(mDark, 0.01, 0.016, 0.016, 0.028, -0.02, -0.14));  // mag release
  gun.add(cyl(mDark, 0.036, 0.036, 0.016, 0, 0, -0.28));          // barrel band / delta ring
  gun.add(part(mSteel, 0.008, 0.01, 0.008, 0, -0.05, -0.42));     // front sling stud
  gun.add(part(mSteel, 0.008, 0.01, 0.008, 0, -0.055, 0.32));     // rear sling stud
  gun.add(part(mSteel, 0.052, 0.008, 0.008, 0, -0.024, -0.02));   // takedown pin line
  gun.rotation.x = 0;
  gun.userData.baseRotX = 0;
  gun.userData.mag = gmag;
  return gun;
}

// ---------------------------------------------------------------- OUR OWN SKELETON + CONTINUOUS SKINNED BODY
// A hand-built bone hierarchy (head/neck/spine/hips, shoulders->arms->fingers,
// hips->legs->feet->toes) at the EXACT stations and axis conventions of the
// battle-tested primitive rig — so the tuned walk/crouch/aim/reload/recoil
// animator drives it unchanged. Over it: ONE continuous skinned mesh (ring
// tubes with blended weights at every joint — bodies bend smoothly, no seams).
// AUTO-SKIN an arbitrary human mesh onto bones: each vertex weights to its
// two nearest bone segments (sharp falloff), like a rigger's first weight pass.
function bindGeoToBones(geo, B, segs, rigid = []) {
  const pos = geo.attributes.position;
  const SI = [], SW = [];
  const dSeg = (px, py, pz, s) => {
    const tx = s.bx - s.ax, ty = s.by - s.ay, tz = s.bz - s.az;
    const L2 = tx * tx + ty * ty + tz * tz;
    let u = L2 ? ((px - s.ax) * tx + (py - s.ay) * ty + (pz - s.az) * tz) / L2 : 0;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(px - (s.ax + tx * u), py - (s.ay + ty * u), pz - (s.az + tz * u));
  };
  const hipsSeg = segs[0];
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    // rigid zones: slung gear etc. rides ONE bone — no cross-limb stretching
    const rz2 = rigid.find(r => px >= r.minX && px <= r.maxX && py >= r.minY && py <= r.maxY && pz >= r.minZ && pz <= r.maxZ);
    if (rz2) { SI.push(B.indexOf(rz2.b), 0, 0, 0); SW.push(1, 0, 0, 0); continue; }
    const M2 = 0.07;   // soft margin: fade into the rigid zone instead of tearing at its edge
    const rz3 = rigid.find(r => px >= r.minX - M2 && px <= r.maxX + M2 && py >= r.minY - M2 && py <= r.maxY + M2 && pz >= r.minZ - M2 && pz <= r.maxZ + M2);
    let s1 = null, d1 = 1e9, s2 = null, d2 = 1e9;
    const ax2 = Math.abs(px);
    for (const s of segs) {
      // territory: below the chest, inner-body flesh can't join an arm,
      // and outboard hand-space flesh can't join a leg
      if (s.ch === 'a' && ax2 < 0.20 && py < 0.95) continue;
      if (s.ch === 'l' && ax2 > 0.24 && py > 0.5) continue;
      const d = dSeg(px, py, pz, s);
      if (d < d1) { d2 = d1; s2 = s1; d1 = d; s1 = s; }
      else if (d < d2) { d2 = d; s2 = s; }
    }
    // anything far from every bone (hanging gear) rides the hips rigidly
    if (d1 > 0.2) { SI.push(B.indexOf(hipsSeg.b), 0, 0, 0); SW.push(1, 0, 0, 0); continue; }
    let w1 = 1, w2 = 0;
    if (s2 && ((s1.ch === 'a' && s2.ch === 'l') || (s1.ch === 'l' && s2.ch === 'a'))) s2 = null;
    if (s2 && s2.b !== s1.b) {
      const k1 = 1 / Math.pow(d1 + 0.001, 4), k2 = 1 / Math.pow(d2 + 0.001, 4);
      w1 = k1 / (k1 + k2); w2 = 1 - w1;
      if (w2 < 0.18) { w1 = 1; w2 = 0; }
    }
    if (rz3) {                                   // boundary band: half local bone, half the rigid anchor
      SI.push(B.indexOf(s1.b), B.indexOf(rz3.b), 0, 0);
      SW.push(0.5, 0.5, 0, 0);
      continue;
    }
    SI.push(B.indexOf(s1.b), s2 ? B.indexOf(s2.b) : 0, 0, 0);
    SW.push(w1, w2, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
}

// WEIGHT SMOOTHING — the real fix for boundary tearing: diffuse skin weights
// across the mesh's actual surface (topology-aware), so no hard border between
// bones can exist anywhere. Runs after auto-binding, before use.
function smoothSkinWeights(geo, iters = 4) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const n = pos.count;
  const rep = new Array(n);                       // weld coincident verts
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = ((pos.getX(i) * 2000) | 0) + '_' + ((pos.getY(i) * 2000) | 0) + '_' + ((pos.getZ(i) * 2000) | 0);
    let g = groups.get(k);
    if (!g) groups.set(k, g = i);
    rep[i] = g;
  }
  const adj = new Map();
  const link = (a, b) => { let s2 = adj.get(a); if (!s2) adj.set(a, s2 = new Set()); s2.add(b); };
  for (let t = 0; t < n; t += 3) {
    const a = rep[t], b = rep[t + 1], c = rep[t + 2];
    link(a, b); link(b, a); link(b, c); link(c, b); link(a, c); link(c, a);
  }
  let W = new Map();
  adj.forEach((_, r) => {
    const m = new Map();
    m.set(si.getX(r), sw.getX(r));
    if (sw.getY(r) > 0) m.set(si.getY(r), (m.get(si.getY(r)) || 0) + sw.getY(r));
    W.set(r, m);
  });
  for (let it = 0; it < iters; it++) {
    const out = new Map();
    adj.forEach((nbrs, r) => {
      const acc = new Map();
      const add = (m, f) => { if (m) m.forEach((w, b) => acc.set(b, (acc.get(b) || 0) + w * f)); };
      add(W.get(r), 0.5);
      const f = 0.5 / nbrs.size;
      nbrs.forEach(nb => add(W.get(nb), f));
      out.set(r, acc);
    });
    W = out;
  }
  for (let i = 0; i < n; i++) {
    const m = W.get(rep[i]);
    if (!m) continue;
    let b1 = 0, w1 = 0, b2 = 0, w2 = 0;
    m.forEach((w, b) => { if (w > w1) { b2 = b1; w2 = w1; b1 = b; w1 = w; } else if (w > w2) { b2 = b; w2 = w; } });
    const tot = w1 + w2 || 1;
    si.setXYZW(i, b1, b2, 0, 0);
    sw.setXYZW(i, w1 / tot, w2 / tot, 0, 0);
  }
  si.needsUpdate = true; sw.needsUpdate = true;
}

function buildSkinnedBody(kind, preset) {
  const isEnemy = kind === 'enemy';
  const B = [];
  const mk = (x, y, z, parent) => {
    const b = new THREE.Bone(); b.position.set(x, y, z);
    if (parent) parent.add(b);
    B.push(b); return b;
  };
  const hipsB = mk(0, 1.0, 0, null);
  const spineB = mk(0, 0.14, 0, hipsB);                    // waist -> chest lean pivot
  const chestB = mk(0, 0.24, 0, spineB);                   // world 1.38
  const neckB = mk(0, 0.16, 0, chestB);                    // world 1.54
  const headB = mk(0, 0.14, 0, neckB);                     // world 1.68
  const shL = mk(-0.285, 0.06, 0, chestB), elL = mk(0, -0.34, 0, shL), wrL = mk(0, -0.30, 0, elL), fiL = mk(0, -0.10, 0, wrL);
  const shR = mk(0.285, 0.06, 0, chestB),  elR = mk(0, -0.34, 0, shR), wrR = mk(0, -0.30, 0, elR), fiR = mk(0, -0.10, 0, wrR);
  const hipL = mk(-0.135, -0.26, 0, hipsB), knL = mk(0, -0.36, 0, hipL), anL = mk(0, -0.35, 0, knL), toL = mk(0, -0.02, -0.14, anL);
  const hipR = mk(0.135, -0.26, 0, hipsB),  knR = mk(0, -0.36, 0, hipR), anR = mk(0, -0.35, 0, knR), toR = mk(0, -0.02, -0.14, anR);
  const bi = (b) => B.indexOf(b);

  // ---- continuous mesh: rings of vertices, skin-weighted to the bones ----
  const P = [], UV = [], SI = [], SW = [], IDX = [];
  const SEG = 12;
  let ringStart = -SEG;
  const ring = (cx, cy, cz, rx, rz, w) => {                 // w: [[bone, weight], ...] (max 2)
    const base = P.length / 3;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      P.push(cx + Math.cos(a) * rx, cy, cz + Math.sin(a) * rz);
      UV.push(s / SEG * 2, cy * 1.4);
      SI.push(bi(w[0][0]), w[1] ? bi(w[1][0]) : 0, 0, 0);
      SW.push(w[0][1], w[1] ? w[1][1] : 0, 0, 0);
    }
    ringStart = base;
    return base;
  };
  const bridge = (a, b) => {
    for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG;
      IDX.push(a + s, b + s, b + s2, a + s, b + s2, a + s2);
    }
  };
  const chain = (rings) => { for (let i = 1; i < rings.length; i++) bridge(rings[i - 1], rings[i]); };
  const cap = (r0, cx, cy, cz, w) => {                      // close a tube end
    const c = P.length / 3;
    P.push(cx, cy, cz); UV.push(0.5, cy * 1.4);
    SI.push(bi(w[0][0]), 0, 0, 0); SW.push(1, 0, 0, 0);
    for (let s = 0; s < SEG; s++) IDX.push(r0 + s, c, r0 + (s + 1) % SEG);
    return c;
  };

  // TORSO — anatomical profile from pelvis to neck (elliptical rings)
  const torsoRings = [
    ring(0, 0.68, 0, 0.195, 0.165, [[hipsB, 1]]),                // pelvis floor
    ring(0, 0.80, 0, 0.25, 0.20, [[hipsB, 1]]),                  // hips
    ring(0, 0.98, 0, 0.23, 0.185, [[hipsB, 0.7], [spineB, 0.3]]),// waist
    ring(0, 1.14, 0, 0.265, 0.21, [[spineB, 0.8], [hipsB, 0.2]]),// ribs
    ring(0, 1.30, 0, 0.30, 0.225, [[spineB, 0.5], [chestB, 0.5]]),// chest
    ring(0, 1.42, 0, 0.285, 0.215, [[chestB, 1]]),               // upper chest
    ring(0, 1.50, 0, 0.185, 0.15, [[chestB, 0.8], [neckB, 0.2]]),// trapezius slope
    ring(0, 1.56, 0, 0.07, 0.065, [[neckB, 1]]),                 // neck base
    ring(0, 1.63, 0, 0.062, 0.06, [[neckB, 0.4], [headB, 0.6]]), // neck top
  ];
  chain(torsoRings);
  cap(torsoRings[0], 0, 0.66, 0, [[hipsB, 1]]);
  cap(torsoRings[torsoRings.length - 1], 0, 1.65, 0, [[headB, 1]]);

  // ARM tube builder (world-space rest: hanging straight down from the shoulder)
  const arm = (sx, sh, el, wr, fi) => {
    const rings = [
      ring(sx, 1.50, 0, 0.085, 0.085, [[chestB, 0.6], [sh, 0.4]]),   // deltoid top
      ring(sx, 1.40, 0, 0.079, 0.079, [[sh, 1]]),                    // upper arm
      ring(sx, 1.22, 0, 0.066, 0.066, [[sh, 1]]),
      ring(sx, 1.10, 0, 0.058, 0.058, [[sh, 0.5], [el, 0.5]]),       // elbow blend
      ring(sx, 0.96, 0, 0.052, 0.052, [[el, 1]]),                    // forearm
      ring(sx, 0.82, 0, 0.046, 0.046, [[el, 0.6], [wr, 0.4]]),       // wrist blend
      ring(sx, 0.76, 0, 0.048, 0.05, [[wr, 1]]),                     // palm
      ring(sx, 0.705, 0, 0.045, 0.047, [[wr, 0.5], [fi, 0.5]]),      // knuckle line
    ];
    chain(rings);
    cap(rings[rings.length - 1], sx, 0.70, 0, [[fi, 1]]);
    // INDIVIDUAL FINGERS — index extended to the trigger (rides the wrist bone),
    // middle/ring/pinky curl with the grip bone, thumb along the gun's side
    const finger = (dz, r, w, y0 = 0.70, y1 = 0.632, dx = 0) => {
      const a = ring(sx + dx, y0, dz, r, r, w);
      const b2 = ring(sx + dx, y1, dz, r * 0.85, r * 0.85, w);
      bridge(a, b2);
      cap(b2, sx + dx, y1 - 0.012, dz, w);
    };
    finger(-0.03, 0.0115, [[wr, 1]]);               // INDEX — on the trigger
    finger(-0.01, 0.0125, [[fi, 1]]);               // middle
    finger(0.009, 0.0115, [[fi, 1]]);               // ring
    finger(0.027, 0.0105, [[fi, 1]], 0.70, 0.648);  // pinky (shorter)
    finger(0.012, 0.0115, [[wr, 1]], 0.755, 0.705, -Math.sign(sx) * 0.045); // thumb, inner side
  };
  arm(-0.285, shL, elL, wrL, fiL);
  arm(0.285, shR, elR, wrR, fiR);

  // LEG tube builder + boot + toe
  const leg = (lx, hip, kn, an, to) => {
    const rings = [
      ring(lx, 0.78, 0, 0.115, 0.115, [[hipsB, 0.5], [hip, 0.5]]),   // upper thigh
      ring(lx, 0.60, 0, 0.10, 0.10, [[hip, 1]]),
      ring(lx, 0.42, 0, 0.085, 0.085, [[hip, 0.5], [kn, 0.5]]),      // knee blend
      ring(lx, 0.24, 0, 0.072, 0.072, [[kn, 1]]),                    // shin
      ring(lx, 0.10, 0, 0.06, 0.06, [[kn, 0.7], [an, 0.3]]),         // ankle blend
      ring(lx, 0.055, 0, 0.062, 0.07, [[an, 1]]),                    // boot cuff
    ];
    chain(rings);
    // boot: heel ring then toe rings extending forward (-Z)
    const heel = ring(lx, 0.02, 0.015, 0.062, 0.075, [[an, 1]]);
    bridge(rings[rings.length - 1], heel);
    const mid = ring(lx, 0.02, -0.075, 0.06, 0.062, [[an, 0.6], [to, 0.4]]);
    bridge(heel, mid);
    const toe = ring(lx, 0.022, -0.155, 0.05, 0.035, [[to, 1]]);
    bridge(mid, toe);
    cap(toe, lx, 0.02, -0.175, [[to, 1]]);
    cap(rings[0], lx, 0.80, 0, [[hip, 1]]);
  };
  leg(-0.135, hipL, knL, anL, toL);
  leg(0.135, hipR, knR, anR, toR);

  // creator-designed body (Meshy): bind HIS mesh to our bones instead of the rings
  if (preset.meshyBody && MOLLY) {
    try {
    if (!MOLLY.bound) {
      const sg = (b, ax, ay, az, bx, by, bz, ch = 't') => ({ b, ax, ay, az, bx, by, bz, ch });
      const segs = [
        sg(hipsB, 0, 0.86, 0, 0, 1.14, 0), sg(spineB, 0, 1.14, 0, 0, 1.38, 0),
        sg(chestB, 0, 1.38, 0, 0, 1.54, 0), sg(neckB, 0, 1.54, 0, 0, 1.66, 0),
        sg(headB, 0, 1.66, 0, 0, 1.92, 0),
        sg(shL, -0.285, 1.44, 0, -0.285, 1.10, 0, 'a'), sg(elL, -0.285, 1.10, 0, -0.285, 0.80, 0, 'a'),
        sg(wrL, -0.285, 0.80, 0, -0.285, 0.70, 0, 'a'), sg(fiL, -0.285, 0.70, 0, -0.285, 0.60, 0, 'a'),
        sg(shR, 0.285, 1.44, 0, 0.285, 1.10, 0, 'a'), sg(elR, 0.285, 1.10, 0, 0.285, 0.80, 0, 'a'),
        sg(wrR, 0.285, 0.80, 0, 0.285, 0.70, 0, 'a'), sg(fiR, 0.285, 0.70, 0, 0.285, 0.60, 0, 'a'),
        sg(hipL, -0.135, 0.74, 0, -0.135, 0.38, 0, 'l'), sg(knL, -0.135, 0.38, 0, -0.135, 0.03, 0, 'l'),
        sg(anL, -0.135, 0.05, 0, -0.135, 0.02, -0.10, 'l'), sg(toL, -0.135, 0.02, -0.10, -0.135, 0.02, -0.17, 'l'),
        sg(hipR, 0.135, 0.74, 0, 0.135, 0.38, 0, 'l'), sg(knR, 0.135, 0.38, 0, 0.135, 0.03, 0, 'l'),
        sg(anR, 0.135, 0.05, 0, 0.135, 0.02, -0.10, 'l'), sg(toR, 0.135, 0.02, -0.10, 0.135, 0.02, -0.17, 'l'),
      ];
      // (no rigid zones for this model — v2 has no slung gun; the stale v1 box
      // was slicing through the new mesh's coat and pinning it to the hip)
      bindGeoToBones(MOLLY.geo, B, segs, []);
      smoothSkinWeights(MOLLY.geo, 4);   // diffuse weights over the surface — no hard borders
      MOLLY.geo.computeVertexNormals();
      // paint him like the design: flame mask, black kit, jet gloves/boots
      const vp = MOLLY.geo.attributes.position, C = [];
      for (let i = 0; i < vp.count; i++) {
        const y = vp.getY(i), z = vp.getZ(i), x = vp.getX(i);
        const n = Math.sin(x * 41 + y * 57) * 0.5 + Math.sin(y * 91 + z * 63) * 0.5;
        if (y > 1.6 && z < -0.015) {                   // the FLAME MASK face
          const t = Math.max(0, Math.min(1, (1.92 - y) / 0.3));
          C.push(0.55 + 0.35 * t + n * 0.06, 0.12 + 0.28 * t, 0.02 + 0.04 * t);
        } else if (y > 1.56) {                         // hood/back of head
          C.push(0.05, 0.045, 0.05);
        } else if (y < 0.16 || (y > 0.6 && y < 0.85 && Math.abs(x) > 0.2)) {
          C.push(0.03, 0.03, 0.035);                   // boots + gloves: jet black
        } else {                                       // black tactical kit
          const v2 = 0.075 + n * 0.02;
          C.push(v2, v2, v2 + 0.008);
        }
      }
      MOLLY.geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      MOLLY.bound = true;
    }
    const mMat = MOLLY.mat
      ? MOLLY.mat                                     // the creator's PAINTED texture
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const mMesh = new THREE.SkinnedMesh(MOLLY.geo, mMat);
    mMesh.castShadow = true;
    mMesh.frustumCulled = false;
    mMesh.add(hipsB);
    mMesh.updateMatrixWorld(true);
    mMesh.bind(new THREE.Skeleton(B));
    fiL.rotation.x = 0.55; fiR.rotation.x = 0.55;
    return { mesh: mMesh, bones: { hipsB, spineB, chestB, neckB, headB, shL, elL, wrL, fiL, shR, elR, wrR, fiR, hipL, knL, anL, toL, hipR, knR, anR, toR }, meshy: true };
    } catch (err) { console.warn('[demo] Molotov bind failed — ring body', err); MOLLY = null; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(IDX);
  geo.computeVertexNormals();

  // fabric per faction: squad black-tac, HYDRA jungle merc, civvy cloth, suit
  const mat = isEnemy
    ? new THREE.MeshStandardMaterial({ map: camoGreen, color: 0x8a8f78, roughness: 0.95 })
    : kind === 'neutral'
      ? new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 })
      : kind === 'protected'
        ? new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7 })
        : new THREE.MeshStandardMaterial({ map: blackTacTex, roughness: 0.92 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.add(hipsB);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(B));
  // grip curl on the finger bones — hands read as gripping, not paddles
  fiL.rotation.x = 0.85; fiR.rotation.x = 0.85;
  return { mesh, bones: { hipsB, spineB, chestB, neckB, headB, shL, elL, wrL, fiL, shR, elR, wrR, fiR, hipL, knL, anL, toL, hipR, knR, anR, toR } };
}

// full character on the custom skeleton: skinned body + black tac gear + canon head + rifle
function operatorModel(kind, name) {
  const isEnemy = kind === 'enemy';
  const preset = PRESETS[name] || PRESETS['Civilian'];
  const grp = new THREE.Group();
  const built2 = buildSkinnedBody(kind, preset);
  const { mesh, bones } = built2;
  const meshy = !!built2.meshy;
  const { spineB, chestB, hipsB, neckB, headB, shL, elL, wrL, shR, elR, hipL, knL, hipR, knR } = bones;
  grp.add(mesh);
  const combatant = isEnemy || kind === 'friendly';

  // TACTICAL KIT — rounded, strapped, fabric-textured; no boxes against a scanned face
  if (combatant && !meshy) {
    const fab = new THREE.MeshStandardMaterial({ map: blackTacTex, color: isEnemy ? 0x8a8f78 : 0xffffff, roughness: 0.96 });
    const trim = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x23261c : 0x0b0c0e, roughness: 0.9 });
    const buckleM = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 });
    // plate carrier: a curved shell hugging the chest ellipse (front + back)
    const shellGeo = new THREE.CylinderGeometry(0.33, 0.315, 0.30, 18, 1, true, -0.85, 1.7);
    const front = new THREE.Mesh(shellGeo, fab);
    front.scale.z = 0.78; front.rotation.y = Math.PI;                    // front face (-Z)
    front.position.set(0, -0.02, 0.015); chestB.add(front);
    const backShell = new THREE.Mesh(shellGeo, fab);
    backShell.scale.z = 0.82; backShell.position.set(0, -0.02, -0.015); chestB.add(backShell);
    // MOLLE webbing rows across the front shell
    for (let r2 = 0; r2 < 3; r2++) {
      const web = new THREE.Mesh(new THREE.CylinderGeometry(0.333, 0.333, 0.022, 18, 1, true, Math.PI - 0.72, 1.44), trim);
      web.scale.z = 0.78;
      web.position.set(0, 0.055 - r2 * 0.055, 0.015);
      chestB.add(web);
    }
    // shoulder straps over the traps connecting front/back
    [-0.11, 0.11].forEach(px => {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.017, 6, 10, Math.PI), trim);
      strap.rotation.x = Math.PI / 2 + 0.12; strap.rotation.z = 0;
      strap.position.set(px, 0.135, 0.01);
      chestB.add(strap);
    });
    // mag pouches: rounded (capsule-ish) with flap + buckle
    for (let p = 0; p < 3; p++) {
      const px = -0.1 + p * 0.1;
      const pouch = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.055, 3, 8), fab);
      pouch.position.set(px, -0.135, -0.225); chestB.add(pouch);
      const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 8, 1, false), trim);
      flap.position.set(px, -0.095, -0.225); chestB.add(flap);
      const buckle = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), buckleM);
      buckle.position.set(px, -0.11, -0.262); chestB.add(buckle);
    }
    // duty belt: elliptical band with a rounded buckle plate
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.27, 0.055, 18, 1, true), trim);
    belt.scale.z = 0.82; belt.position.set(0, -0.045, 0); hipsB.add(belt);
    const bplate = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.03, 3, 8), buckleM);
    bplate.rotation.z = Math.PI / 2; bplate.position.set(0, -0.045, -0.205); hipsB.add(bplate);
    // knee pads: curved shells that cup the knee
    [knL, knR].forEach(k => {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, 1.25), trim);
      pad.rotation.x = -Math.PI / 2 + 0.25;
      pad.scale.set(0.85, 1, 0.9);
      pad.position.set(0, -0.055, -0.045); k.add(pad);
    });
    // deltoid shells: curved caps, not crates
    [shL, shR].forEach(s2 => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 8, 0, Math.PI * 2, 0, 1.35), fab);
      sp.scale.set(1, 0.85, 1);
      sp.position.set(0, 0.01, 0); s2.add(sp);
    });
    // drop-leg holster: rounded shell + retention strap
    const holster = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.09, 3, 8), trim);
    holster.rotation.x = 0.15;
    holster.position.set(0.08, -0.13, -0.03); hipR.add(holster);
    const hstrap = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 5, 12), trim);
    hstrap.rotation.x = Math.PI / 2;
    hstrap.position.set(0, -0.1, 0); hipR.add(hstrap);
    if (preset.tape) {
      const tape = markPlate([preset.tape], 0.15, 0.03, 'rgba(238,238,240,0.95)');
      tape.position.set(0, 0.09, -0.245); tape.rotation.y = Math.PI; chestB.add(tape);
    }
  }

  // the canon head (scan face + hair + eyes + hats + mask) on the head bone
  // (the sculpted Meshy body brings its own head, mask, and gear)
  if (meshy) {
    const ghostM0 = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const bodyHit0 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.82, 0.44), ghostM0);
    bodyHit0.position.set(0, 0.02, 0); spineB.add(bodyHit0);
    const headHit0 = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 8), ghostM0);
    headHit0.position.y = 0.12; headB.add(headHit0);
    // v2 was generated with EMPTY HANDS — full arm animation + the live rifle
    shR.rotation.x = -0.05; shR.rotation.z = -0.25; elR.rotation.x = 1.35;
    shL.rotation.x = 1.42;  shL.rotation.z = 0.42;  elL.rotation.x = 0.04;
    shL.userData.bx = shL.rotation.x; shR.userData.bx = shR.rotation.x;
    hipR.rotation.x = -0.06; knR.rotation.x = 0.1;
    hipL.rotation.x = 0.08;  knL.rotation.x = 0.06;
    const gun0 = buildWeapon(preset.weapon || {});
    gun0.scale.setScalar(1.3);
    gun0.position.set(0.15, 1.22, -0.44);
    gun0.userData.basePos = gun0.position.clone();
    grp.add(gun0);
    const joints0 = [shL, elL, shR, elR, hipL, knL, hipR, knR, headB];
    joints0.forEach(j => j.userData.basePose = { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z });
    return { grp, torso: spineB, bodyHit: bodyHit0, head: headHit0, headG: headB,
      armL: shL, armR: shR, legL: hipL, legR: hipR, gun: gun0, joints: joints0, lids: null, hold: HOLDS[preset.hold] || null };
  }
  const builtHead = buildCharacterHead(preset, false);
  builtHead.assembly.position.y = 0.02;
  headB.add(builtHead.assembly);
  // NECK JUNCTION on the BODY side (does not turn with the head):
  // a skin/mask-toned filler column inside, the jacket collar around it
  const masked = !!preset.face.mask;
  const filler = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.062, 0.17, 12),
    new THREE.MeshStandardMaterial({ color: masked ? 0x1c1e22 : new THREE.Color(preset.tint || '#e2c4a2').multiplyScalar(0.92), roughness: 0.8 }));
  filler.position.y = 0.075; neckB.add(filler);
  const collarColor = preset.collar || (kind === 'neutral' ? 0x6e5f45 : kind === 'protected' ? 0x23252b : isEnemy ? 0x39412c : 0x131418);
  const collar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.098, 0.1, 14),
    new THREE.MeshStandardMaterial({ color: collarColor, roughness: 0.95 }));
  collar2.position.y = 0.025; neckB.add(collar2);

  // hit volumes for the raycast systems
  const ghostM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.82, 0.44), ghostM);
  bodyHit.position.set(0, 0.02, 0); spineB.add(bodyHit);
  const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 8), ghostM);
  headHit.position.y = 0.03;
  builtHead.assembly.add(headHit);

  // combat pose (the tuned two-hand carry the animator lerps from) + rifle
  let gun = null;
  if (combatant) {
    shR.rotation.x = -0.05; shR.rotation.z = -0.25; elR.rotation.x = 1.35;
    shL.rotation.x = 1.42;  shL.rotation.z = 0.42;  elL.rotation.x = 0.04;
    gun = buildWeapon(preset.weapon || {});
    gun.scale.setScalar(1.3);
    gun.position.set(0.15, 1.22, -0.44);
    gun.userData.basePos = gun.position.clone();
    grp.add(gun);
  } else {
    shR.rotation.x = 0.1; elR.rotation.x = 0.15;
    shL.rotation.x = 0.1; elL.rotation.x = 0.15;
  }
  shL.userData.bx = shL.rotation.x; shR.userData.bx = shR.rotation.x;
  hipR.rotation.x = -0.06; knR.rotation.x = 0.1;    // relaxed stance
  hipL.rotation.x = 0.08;  knL.rotation.x = 0.06;

  const joints = [shL, elL, shR, elR, hipL, knL, hipR, knR, headB];
  joints.forEach(j => j.userData.basePose = { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z });
  return { grp, torso: spineB, bodyHit, head: headHit, headG: headB,
    armL: shL, armR: shR, legL: hipL, legR: hipR, gun, joints, lids: builtHead.lids, hold: HOLDS[preset.hold] || null };
}

// WEAPON FACTORY — historically-flavored builds on the base receiver.
// spec: { type: m4|akm|m14|m24, sight: iron|reddot|scope, fire: safe|semi|auto, laser }
function buildWeapon(spec = {}) {
  const gun = buildNpcRifle();
  const mDark = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.55, metalness: 0.4 });
  const mSteel = new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.5 });
  const mWood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
  const mRed = new THREE.MeshStandardMaterial({ color: 0xff2211, emissive: 0xff2211, emissiveIntensity: 2, roughness: 0.3 });
  // fire selector: lever angle = SAFE straight / SEMI 60deg / AUTO 120deg
  const sel = part(mSteel, 0.007, 0.032, 0.009, -0.031, -0.004, -0.015);
  sel.rotation.x = spec.fire === 'auto' ? 1.15 : spec.fire === 'semi' ? 0.6 : 0;
  gun.add(sel);
  gun.add(part(mSteel, 0.012, 0.009, 0.055, 0.031, 0.024, 0.015));   // charging handle
  if (spec.type === 'akm') {
    const brake = cyl(mDark, 0.017, 0.021, 0.05, 0, 0.004, -0.615, true, 8);
    brake.rotation.x = Math.PI / 2 + 0.28;                            // the slant brake
    gun.add(brake);
    gun.add(cyl(mDark, 0.009, 0.009, 0.2, 0, 0.028, -0.36));          // gas tube
    gun.add(part(mWood, 0.062, 0.05, 0.16, 0, -0.006, -0.34));        // wood lower handguard
    gun.add(part(mWood, 0.05, 0.07, 0.1, 0, -0.01, 0.12));            // wood stock wrist
    gun.add(part(mSteel, 0.02, 0.012, 0.05, 0, 0.052, -0.02));        // tangent rear sight
  } else if (spec.type === 'm4') {
    gun.add(part(mDark, 0.034, 0.045, 0.14, 0, 0.062, 0.0));          // carry handle
    gun.add(part(mDark, 0.004, 0.02, 0.05, 0, 0.09, 0.0));            // handle aperture wall
    if (spec.laser) {
      gun.add(part(mDark, 0.02, 0.02, 0.06, 0.032, -0.012, -0.36));   // AN/PEQ-style laser box
      const lens = cyl(mRed, 0.004, 0.004, 0.006, 0.032, -0.012, -0.392, true, 6);
      gun.add(lens);
    }
  } else if (spec.type === 'm14') {
    gun.add(part(mWood, 0.058, 0.06, 0.5, 0, -0.02, -0.2));           // full-length walnut stock
    gun.add(cyl(mDark, 0.011, 0.011, 0.1, 0, 0, -0.62));              // long barrel + lug
    gun.add(part(mSteel, 0.02, 0.008, 0.03, 0, -0.045, -0.6));        // bayonet lug
  } else if (spec.type === 'm24') {
    const bolt = cyl(mSteel, 0.007, 0.007, 0.05, 0.035, 0.012, 0.03, false, 6);
    bolt.rotation.z = 0.9;                                            // bolt handle swept back
    gun.add(bolt);
    gun.add(part(mDark, 0.05, 0.05, 0.42, 0, -0.012, -0.18));         // stock forend
    if (gun.userData.mag) gun.userData.mag.scale.setScalar(0.55);     // internal magazine
  }
  // optics
  if (spec.sight === 'reddot') {
    const tube = cyl(mDark, 0.021, 0.023, 0.055, 0, 0.075, -0.03, true, 10);
    gun.add(tube);
    gun.add(cyl(mDark, 0.024, 0.024, 0.006, 0, 0.075, -0.06, true, 10));   // front rim
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 5), mRed);
    dot.position.set(0, 0.075, -0.045); gun.add(dot);                  // THE red dot
    gun.add(part(mDark, 0.016, 0.03, 0.03, 0, 0.052, -0.03));          // mount riser
  } else if (spec.sight === 'scope') {
    gun.add(cyl(mDark, 0.019, 0.019, 0.15, 0, 0.078, 0.0, true, 10));  // main tube
    gun.add(cyl(mDark, 0.026, 0.02, 0.05, 0, 0.078, -0.095, true, 10));// objective bell
    gun.add(cyl(mDark, 0.023, 0.019, 0.035, 0, 0.078, 0.09, true, 10));// ocular
    gun.add(part(mDark, 0.012, 0.02, 0.012, 0, 0.104, 0.0));           // elevation turret
    gun.add(part(mDark, 0.02, 0.012, 0.012, 0.016, 0.078, 0.0));       // windage turret
    gun.add(part(mDark, 0.014, 0.026, 0.024, 0, 0.052, 0.03));         // rings
  }
  return gun;
}
// distinct HOLDS: per-operator deltas layered on the tuned carry/aim pose
const HOLDS = {
  magwell:    { lx: -0.28, lz: -0.32 },            // support hand pulled back to the mag
  underBarrel:{ lx: 0.14, lz: 0.14 },              // hand far out on the guard
  relaxed:    { gy: -0.09, lx: -0.12 },            // DMR low-ready
  sloppy:     { lz: -0.12, rz: 0.1, gy: -0.03 },   // conscript grip
};

// ---------------------------------------------------------------- soldier models — JOINTED (shoulders/elbows/hips/knees)
function limbSeg(w, len, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.56, w * 0.38, len, 10), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}
function jointBall(r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat);
  m.castShadow = true;
  return m;
}
function soldierModel(kind, name) {
  const grp = new THREE.Group();
  const isEnemy = kind === 'enemy';
  const preset = PRESETS[name] || PRESETS['Civilian'];
  const blackOps = !!preset.blackTac;                        // Molotov: all-black kit
  const suit = kind === 'protected'
    ? new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.55 })                     // Prestige: dark suit
    : new THREE.MeshStandardMaterial({ map: isEnemy ? camoBlack : (blackOps ? blackTacTex : camoGreen), roughness: 0.95 });
  const pants = new THREE.MeshStandardMaterial({ color: kind === 'neutral' ? 0x5a5347 : (blackOps ? 0x121316 : 0x2e3129), roughness: 1 });
  const skinM = new THREE.MeshStandardMaterial({ color: preset.face.skin || 0xc9a184, roughness: 0.8 });
  const handM = blackOps ? new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.9 }) : skinM; // gloves

  // torso + hips + chest rig
  // ONE continuous trunk — a lathed anatomical profile (like a real body mesh):
  // neck base, sloped shoulders, chest, ribs, waist, hips, pelvis — no seams
  const trunkPts = [
    [0.001, -0.38], [0.15, -0.38],  // pelvis floor
    [0.215, -0.26],                 // hips
    [0.19, -0.1],                   // waist
    [0.235, 0.06],                  // ribs
    [0.26, 0.2],                    // chest
    [0.245, 0.32],                  // upper chest
    [0.155, 0.4],                   // shoulder slope (trapezius)
    [0.065, 0.44], [0.001, 0.44],   // neck base
  ].map(([r2, y2]) => new THREE.Vector2(r2, y2));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(trunkPts, 16), suit);
  torso.scale.z = 0.62;             // elliptical section
  torso.position.y = 1.1;           // pivot mid-trunk so leans bend at the waist
  torso.castShadow = true;
  // pants wrap the lower trunk as a short lathed pelvis piece
  const hipPts = [[0.001, -0.02], [0.152, -0.02], [0.218, 0.1], [0.205, 0.24], [0.001, 0.24]]
    .map(([r2, y2]) => new THREE.Vector2(r2, y2));
  const hips = new THREE.Mesh(new THREE.LatheGeometry(hipPts, 14), pants);
  hips.scale.z = 0.63;
  hips.position.y = 0.72;
  hips.castShadow = true;
  const rigM = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x15171a : (blackOps ? 0x0f1013 : 0x2c3526), roughness: 0.85 });
  for (let p = 0; p < 3; p++) {                              // ammo pouches on the chest
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), rigM);
    pouch.position.set(-0.15 + p * 0.15, 1.22, -0.17);
    grp.add(pouch);
  }
  // deltoids — flattened caps blending the trunk into the upper arms (same suit fabric)
  [-0.275, 0.275].forEach(px => {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), suit);
    pad.scale.set(1.08, 0.82, 0.95);
    pad.position.set(px, 1.425, 0); pad.castShadow = true;
    grp.add(pad);
  });
  // neck + head with the PAINTED FACE (front) and hair/mask color on the other sides
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), blackOps ? suit : skinM); neck.position.y = 1.51;
  const head = new THREE.Group();
  const builtHead = buildCharacterHead(preset);
  head.add(builtHead.assembly);
  const lids = builtHead.lids;
  head.position.y = 1.68;
  // ARMS — shoulder + elbow joints, posed holding the rifle
  function makeArm(side) {                                   // side: -1 left, +1 right
    const shoulder = new THREE.Group();
    shoulder.position.set(0.3 * side, 1.44, 0);
    shoulder.add(limbSeg(0.11, 0.34, suit));                 // upper arm (human-proportioned)
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    elbow.add(jointBall(0.056, suit));                       // elbow ball — the joint bends smoothly
    elbow.add(limbSeg(0.09, 0.3, suit));                     // forearm
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 9, 7), handM);
    hand.scale.set(1, 0.9, 1.15);
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
    knee.add(jointBall(0.075, pants));                       // knee ball
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
  if (blackOps) {                                            // hard-shell knee pads (ride the knee joints)
    [legRJ, legLJ].forEach(l => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.6 }));
      pad.position.set(0, -0.05, -0.075);
      l.knee.add(pad);
    });
  }
  if (preset.tape) {                                         // "MOLOTOV" name tape on the carrier
    const backing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.038, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.9 }));
    backing.position.set(0, 1.335, -0.162);
    const tape = markPlate([preset.tape], 0.15, 0.03, 'rgba(238,238,240,0.95)');
    tape.position.set(0, 1.335, -0.166);
    tape.rotation.y = Math.PI;
    grp.add(backing, tape);
  }
  legRJ.hip.rotation.x = -0.06; legRJ.knee.rotation.x = 0.1;  // relaxed combat stance
  legLJ.hip.rotation.x = 0.08;  legLJ.knee.rotation.x = 0.06;
  grp.add(torso, hips, neck, head);
  const armL = armLJ.shoulder, armR = armRJ.shoulder;         // (kept names for the animator)
  const legL = legLJ.hip, legR = legRJ.hip;
  // rifle for combatants — a REAL rifle now: receiver, handguard, muzzle device,
  // curved magazine, trigger guard, shaped grip, stock with buttpad
  let gun = null;
  if (isEnemy || kind === 'friendly') {
    gun = buildNpcRifle();
    gun.scale.setScalar(1.3);
    gun.position.set(0.15, 1.22, -0.44);
    gun.userData.basePos = gun.position.clone();
    grp.add(gun);
  }
  // record every joint's posed rotation so ragdolls can flop and respawns can restore
  const joints = [
    armLJ.shoulder, armLJ.elbow, armRJ.shoulder, armRJ.elbow,
    legLJ.hip, legLJ.knee, legRJ.hip, legRJ.knee, head,   // head is the whole head group
  ];
  joints.forEach(j => j.userData.basePose = { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z });
  return { grp, torso, head: builtHead.assembly.children[0], headG: head, armL, armR, legL, legR, gun, joints, lids };
}
// ---------------------------------------------------------------- RIGGED soldiers (real sculpted human mesh)
// Every NPC clones the professionally-modeled, skeleton-rigged human. Locomotion
// comes from its motion-captured clips (Idle/Walk/Run); the rifle stays a
// body-relative child exactly like before, and per-frame two-bone IK plants the
// hands ON the gun's grip and handguard, whatever the pose.
function riggedModel(kind, name) {
  const isEnemy = kind === 'enemy';
  const preset = PRESETS[name] || PRESETS['Civilian'];
  const grp = new THREE.Group();
  const inner = cloneSkeleton(RIG.scene);
  inner.rotation.y = Math.PI;                       // mannequin faces +Z; our forward is -Z
  // bulk the slim mannequin to real-adult proportions so the scanned head fits:
  // wider shoulders/chest, a touch taller — head/gear/hitboxes compensate dynamically
  inner.scale.set(1.16, 1.03, 1.12);
  grp.add(inner);
  const bones = {};
  inner.traverse(o => { if (o.isBone) bones[o.name.replace('mixamorig', '')] = o; });
  // uniform tints on the mannequin's two materials (surface panels + joint gaps)
  const TINT = isEnemy ? [0x33363d, 0x16181c]                       // HYDRA: near-black
    : kind === 'neutral' ? [0x8a7a5c, 0x4a4234]                     // civvy earth tones
    : kind === 'protected' ? [0x35383f, 0x1c1e24]                   // Prestige: dark suit
    : preset.blackTac ? [0x27282c, 0x111214]                        // Molotov: black kit
    : [0x4a5238, 0x252a1e];                                         // squad: olive drab
  inner.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;                      // skinned bounds lag the pose
      o.material = o.material.clone();
      o.material.color.setHex(/joint/i.test(o.material.name) ? TINT[1] : TINT[0]);
    }
  });
  // ragdoll joints — real bones; flop targets around the bind pose
  const joints = [bones.LeftArm, bones.LeftForeArm, bones.RightArm, bones.RightForeArm,
    bones.LeftUpLeg, bones.LeftLeg, bones.RightUpLeg, bones.RightLeg, bones.Head];
  joints.forEach(j => j.userData.basePose = { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z });
  // motion-captured locomotion (clip names vary per model — match loosely)
  const mixer = new THREE.AnimationMixer(inner);
  const findClip = (n) => RIG.clips.find(cl => cl.name.toLowerCase().includes(n));
  const act = {
    Idle: mixer.clipAction(findClip('idle')),
    Walk: mixer.clipAction(findClip('walk')),
    Run: mixer.clipAction(findClip('run')),
  };
  const sneak = findClip('sneak');
  if (sneak) { act.Sneak = mixer.clipAction(sneak); act.Sneak.play(); act.Sneak.weight = 0; }
  act.Idle.play(); act.Walk.play(); act.Run.play();
  act.Walk.weight = 0; act.Run.weight = 0;
  mixer.update(Math.random() * 1.7);                // desync the crowd
  const hipsRestY = bones.Hips.position.y;
  // THE CANON HEAD: collapse the mannequin's blank head and mount this
  // character's sculpted head (face, hair, hat, mask) on the head bone.
  // All bone-space attachments compensate the rig's world scale DYNAMICALLY
  // (different models export in meters or centimeters).
  bones.Head.scale.setScalar(0.01);  // collapse the blank head (junction hidden by the collar)
  grp.updateMatrixWorld(true);
  const _ws = new THREE.Vector3();
  const invScaleOf = (bone) => { bone.getWorldScale(_ws); return 1 / _ws.x; };
  const builtHead = buildCharacterHead(preset, true);
  const headAsm = builtHead.assembly;
  const headInv = invScaleOf(bones.Head);
  headAsm.scale.setScalar(headInv);
  headAsm.position.y = 0.1 * headInv;               // ~10cm above the head-bone origin
  headAsm.rotation.y = Math.PI;                     // face the mannequin's +Z front
  bones.Head.add(headAsm);
  // invisible hit volumes (raycast targets, meter dims scaled into bone space)
  const ghostM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const spineInv = invScaleOf(bones.Spine1);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.34), ghostM);
  torso.name = 'hitTorso';
  torso.scale.setScalar(spineInv);
  torso.position.y = 0.08 * spineInv;
  bones.Spine1.add(torso);
  const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), ghostM);
  headHit.name = 'hitHead';
  headAsm.add(headHit);                             // rides the custom head 1:1
  // chest gear on the spine: ammo pouches for combatants, Molotov's name tape
  if (isEnemy || kind === 'friendly') {
    const gear = new THREE.Group();
    gear.scale.setScalar(invScaleOf(bones.Spine2)); // meter units inside
    const rigM2 = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x15171a : (preset.blackTac ? 0x0f1013 : 0x2c3526), roughness: 0.85 });
    for (let p = 0; p < 3; p++) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.05), rigM2);
      pouch.position.set(-0.13 + p * 0.13, 0.02, 0.13);   // +Z = mannequin front
      gear.add(pouch);
    }
    if (preset.tape) {
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.038, 0.004),
        new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.9 }));
      backing.position.set(0, 0.13, 0.155);
      const tape = markPlate([preset.tape], 0.15, 0.03, 'rgba(238,238,240,0.95)');
      tape.position.set(0, 0.13, 0.159);
      gear.add(backing, tape);
    }
    bones.Spine2.add(gear);
  }
  // hips sink amounts are expressed in meters — convert to the hips' parent space
  const hipsUnit = (() => { bones.Hips.parent.getWorldScale(_ws); return 1 / _ws.x; })();
  // the detailed service rifle — same body-relative carry as the built-ins
  let gun = null;
  if (isEnemy || kind === 'friendly') {
    gun = buildNpcRifle();
    gun.scale.setScalar(1.3);
    gun.position.set(0.15, 1.22, -0.44);
    gun.userData.basePos = gun.position.clone();
    grp.add(gun);
  }
  const decoy = () => { const o = new THREE.Object3D(); o.userData.basePose = { x: 0, y: 0, z: 0 }; return o; };
  return { grp, torso, head: headHit, headG: bones.Head, gun, joints, lids: builtHead.lids,
    armL: decoy(), armR: decoy(), legL: decoy(), legR: decoy(),
    rigged: true, bones, mixer, act, hipsRestY, hipsUnit };
}

// two-bone IK: swing `bone` so the world position of `tip` lands on targetW
const _ikV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _ikQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function boneAim(bone, tip, targetW) {
  bone.updateWorldMatrix(true, false);
  tip.updateWorldMatrix(true, false);
  const bp = _ikV[0].setFromMatrixPosition(bone.matrixWorld);
  const cur = _ikV[1].setFromMatrixPosition(tip.matrixWorld).sub(bp);
  const des = _ikV[2].copy(targetW).sub(bp);
  if (cur.lengthSq() < 1e-8 || des.lengthSq() < 1e-8) return;
  _ikQ[0].setFromUnitVectors(cur.normalize(), des.normalize());
  const pw = bone.parent.getWorldQuaternion(_ikQ[1]);
  const bw = _ikQ[2].copy(pw).multiply(bone.quaternion);       // bone's world rotation
  bw.premultiply(_ikQ[0]);                                     // rotated by the world delta
  bone.quaternion.copy(pw.invert().multiply(bw));
}
function armIK(upper, fore, hand, targetW, elbowBiasW) {
  const hint = targetW.clone().add(elbowBiasW);
  boneAim(upper, hand, hint);
  boneAim(fore, hand, targetW);
  boneAim(upper, hand, hint);      // second pass tightens the solve
  boneAim(fore, hand, targetW);
}

function makeEntity(name, kind, x, z, baseY = 0) {
  const colors = { enemy: 0xf38ba8, protected: 0xf38ba8, friendly: 0x89b4fa, neutral: 0xe6e6e6 };
  const m = operatorModel(kind, name);   // our own skeleton + skinned body
  m.grp.position.set(x, baseY, z);
  scene.add(m.grp);
  const e = { name, kind, grp: m.grp, body: m.bodyHit || m.torso, head: m.head, model: m, color: colors[kind],
    hp: 100, alive: true, dying: 0, hitT: 0, baseX: x, baseZ: z, baseY, phase: Math.random() * 9,
    shootTimer: 1 + Math.random() * 2.5, muzzleT: 0,
    lids: m.lids, blinkN: 0.5 + Math.random() * 3, blinkP: 0 };
  entities.push(e);
  return e;
}
// --- SPAWNS run after the rigged model resolves (or immediately on fallback) ---
makeBuilding(-15, -3, 6, 6, 6, 1, true);   // the twins' overwatch post still stands
function spawnAll() {
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
  // The Wolford twins — rooftop, side by side, sniping below (their canonical M1 cameo)
  makeEntity('Brian Wolford', 'friendly', -16, -3, 6);
  makeEntity('Jesse Wolford', 'friendly', -14, -3, 6);
  entities.forEach(e => {
    if (e.kind === 'enemy' || e.kind === 'friendly') {
      e.ai = makeAI(e);
      e.posted = e.baseY > 0.5;    // rooftop twins hold their post
      e.hitT = 0;
    }
  });
}
// RIG: the professionally-sculpted, skeleton-rigged human mesh all soldiers clone.
// Loaded from base64 in the single-file build, from ./assets in the served build.
let RIG = null;            // (retired: bodies are our own skeleton now)
let HEADSCAN = null;   // photoreal scanned human head (geometry + photo skin maps)
let MOLLY = null;      // Molotov's Meshy-generated full body (creator's own design!)
(function loadAssets() {
  const loader = new GLTFLoader();
  let pending = 2, spawned = false;
  const go = () => { if (!spawned) { spawned = true; try { spawnAll(); } catch (err) { showFatal('spawn: ' + err.message); } } };
  const settle = () => { if (--pending <= 0) go(); };
  setTimeout(() => { if (!spawned) { console.warn('[demo] asset timeout — spawning with what we have'); go(); } }, 12000);
  // --- the scanned head + skin maps ---
  const texL = new THREE.TextureLoader();
  const colT = texL.load(window.__HEAD_COL_B64 ? 'data:image/jpeg;base64,' + window.__HEAD_COL_B64 : './assets/head-col.jpg');
  colT.colorSpace = THREE.SRGBColorSpace;
  const nrmT = texL.load(window.__HEAD_NRM_B64 ? 'data:image/jpeg;base64,' + window.__HEAD_NRM_B64 : './assets/head-nrm.jpg');
  const headDone = (g) => {
    let mesh = null;
    g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (mesh) HEADSCAN = { geo: mesh.geometry, colT, nrmT, headGeo: null };
    settle();
  };
  const headFail = (err) => { console.warn('[demo] head scan unavailable — sculpted heads', err); settle(); };
  // --- Molotov's generated body (streamed; ring body is the fallback) ---
  loader.load('./assets/molotov2.glb', (g) => {
    try {
    let mesh = null;
    g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (mesh) {
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      geo.rotateY(Math.PI);          // sculpt faces +Z; our forward is -Z
      geo.computeBoundingBox();
      geo.translate(0, -geo.boundingBox.min.y, 0);   // feet to the ground, whatever the export frame
      MOLLY = { geo, mat: mesh.material || null, bound: false };
      console.log('[demo] Molotov body model loaded');
    }
    } catch (err) { console.warn('[demo] Molotov model rejected', err); MOLLY = null; }
    settle();
  }, undefined, (err) => { console.warn('[demo] Molotov model unavailable — built-in body', err); settle(); });
  try {
    if (window.__HEAD_GLB_B64) {
      const bin = Uint8Array.from(atob(window.__HEAD_GLB_B64), c => c.charCodeAt(0)).buffer;
      loader.parse(bin, '', headDone, headFail);
    } else {
      loader.load('./assets/head.glb', headDone, undefined, headFail);
    }
  } catch (err) { headFail(err); }
})();

// drop every triangle of a geometry fully below yMin (cuts the scan bust at the neck)
function clipBelowY(geo, yMin) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.attributes.position, uv = g.attributes.uv, norm = g.attributes.normal;
  const P = [], U = [], N = [];
  for (let i = 0; i < pos.count; i += 3) {
    if (pos.getY(i) < yMin && pos.getY(i + 1) < yMin && pos.getY(i + 2) < yMin) continue;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      N.push(norm.getX(i + k), norm.getY(i + k), norm.getZ(i + k));
      U.push(uv.getX(i + k), uv.getY(i + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return out;
}

// 1985-issue eyewear — hides the scan's closed eyes with era style
function buildEyewear(style) {
  const g = new THREE.Group();
  const lensM = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.12, metalness: 0.55 });
  const frameM = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 0.35, metalness: 0.9 });
  const r = style === 'round' ? 0.03 : 0.039;
  [-0.036, 0.036].forEach(px => {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), lensM);
    lens.scale.set(1.05, style === 'round' ? 1 : 0.85, 0.28);
    lens.position.set(px, 0.046, -0.126);
    g.add(lens);
  });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.008), frameM);
  bridge.position.set(0, 0.058, -0.124);
  g.add(bridge);
  [-1, 1].forEach(s => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.15), frameM);
    arm.position.set(s * 0.08, 0.052, -0.05);
    arm.rotation.y = s * 0.1;
    g.add(arm);
  });
  return g;
}

// ---------------------------------------------------------------- photoreal PBR upgrade
// Fetched alongside the game (network path); painted textures remain the
// offline / file:// fallback. Materials upgrade IN PLACE when the photos land.
(function upgradePBR() {
  const TL = new THREE.TextureLoader();
  const setup = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.2, 1.5);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  TL.load('./assets/pbr-brick-diff.jpg', (d) => {
    setup(d, true);
    const rough = setup(TL.load('./assets/pbr-brick-rough.jpg', undefined, undefined, () => {}), false);
    const bump = setup(TL.load('./assets/pbr-brick-bump.jpg', undefined, undefined, () => {}), false);
    for (const m of pbrBrickMats) {
      m.map = d; m.roughnessMap = rough; m.bumpMap = bump; m.bumpScale = 0.5;
      m.normalMap = null; m.needsUpdate = true;
    }
    console.log('[demo] PBR brick applied to', pbrBrickMats.length, 'buildings');
  }, undefined, () => {});
  new RGBELoader().load('./assets/sky.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(hdr).texture;
    scene.environment = env;      // real photographed sky light on every surface
    hdr.dispose(); pm.dispose();
    console.log('[demo] HDRI environment lighting applied');
  }, undefined, () => {});
})();

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
    ready: 1,                      // 0 = patrol sling, 1 = both hands on the weapon
    kick: 0,                       // per-shot recoil impulse on the body
  };
}
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

// etched text markings (caliber stamps, serials) painted onto receiver sides
function markingsTex(lines, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 18px monospace';
  x.fillStyle = color || 'rgba(15,15,18,0.9)';
  x.textBaseline = 'middle';
  lines.forEach((ln, i) => x.fillText(ln, 8, 20 + i * 24));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function markPlate(text, wdt, hgt, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt),
    new THREE.MeshBasicMaterial({ map: markingsTex(text, color), transparent: true, depthWrite: false }));
  return m;
}
// scroll engraving for the gilded slide
const engravingTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(110,78,18,0.85)';
  x.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const cx = 14 + i * 27, cy = 24;
    x.beginPath();
    for (let a = 0; a < 12; a += 0.3) x.lineTo(cx + Math.cos(a) * a * 0.9, cy + Math.sin(a) * a * 0.75);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

function buildM16() {
  const g = new THREE.Group();
  // receiver: shaped upper + lower with a real mag well between them
  const upper = part(gunBlack, 0.026, 0.05, 0.3, 0, 0.006, -0.17);
  const lower = part(gunBlack, 0.026, 0.042, 0.17, 0, -0.033, -0.11);
  const ejPort = part(gunDark, 0.002, 0.02, 0.05, 0.0145, 0.004, -0.16);        // ejection port
  const chHandle = part(gunDark, 0.02, 0.012, 0.035, 0, 0.028, -0.032);         // charging handle — CYCLES
  chHandle.userData.home = chHandle.position.clone();
  // carry handle with the rear aperture
  const chL = part(gunBlack, 0.006, 0.034, 0.2, -0.01, 0.046, -0.14);
  const chR = part(gunBlack, 0.006, 0.034, 0.2, 0.01, 0.046, -0.14);
  const chTop = part(gunBlack, 0.026, 0.012, 0.2, 0, 0.065, -0.14);
  const rearSight = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 6, 14), gunBlack);
  rearSight.position.set(0, 0.065, -0.055);
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
  const stock = part(gunPoly, 0.024, 0.05, 0.2, 0, -0.004, 0.075);
  const cheek = part(gunPoly, 0.024, 0.016, 0.14, 0, 0.026, 0.095);
  const buttpad = part(gunDark, 0.028, 0.06, 0.018, 0, -0.004, 0.183);
  g.add(upper, lower, ejPort, chHandle, chL, chR, chTop, rearSight, grip, trig, mag,
    guard, barrel, muzzle, fsL, fsR, fsPost, stock, cheek, buttpad);
  // --- the small stuff a real M16 carries ---
  g.add(part(gunDark, 0.01, 0.012, 0.012, 0.018, 0.01, -0.05));        // forward assist
  g.add(part(gunBlack, 0.008, 0.016, 0.014, 0.017, 0.008, -0.1, 0, 0, 0.6)); // brass deflector
  const portDoor = part(gunSteel, 0.002, 0.022, 0.05, 0.021, -0.014, -0.16, 0.95); // ejection port door hanging open
  g.add(portDoor);
  g.add(part(gunDark, 0.004, 0.008, 0.024, -0.016, 0.0, -0.06));       // fire selector lever
  g.add(cyl(gunSteel, 0.005, 0.005, 0.004, -0.0155, 0.0, -0.052, false)); // selector pivot
  g.add(part(gunDark, 0.006, 0.01, 0.01, 0.016, -0.008, -0.195));      // mag release button
  g.add(part(gunDark, 0.004, 0.018, 0.028, -0.016, 0.002, -0.15));     // bolt catch
  g.add(part(gunSteel, 0.029, 0.005, 0.005, 0, -0.03, -0.035));        // rear takedown pin
  g.add(part(gunSteel, 0.029, 0.005, 0.005, 0, -0.03, -0.185));        // front pivot pin
  g.add(cyl(gunBlack, 0.023, 0.026, 0.02, 0, 0, -0.325));              // delta ring
  const swF = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, 6, 12), gunSteel);
  swF.position.set(0, -0.016, -0.6); g.add(swF);                       // front sling swivel
  const swR = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, 6, 12), gunSteel);
  swR.position.set(0, -0.036, 0.17); g.add(swR);                       // rear sling swivel
  g.add(part(gunDark, 0.004, 0.004, 0.04, 0, 0.013, -0.745));          // birdcage top slot
  g.add(part(gunSteel, 0.028, 0.008, 0.008, 0, 0.052, -0.06));         // rear sight windage drum
  g.add(part(gunDark, 0.0245, 0.002, 0.05, 0, -0.078, -0.042));        // grip finger groove line
  const mk = markPlate(['M16A1 · CAL 5.56MM', 'AUTO — SEMI — SAFE'], 0.1, 0.024);
  mk.position.set(-0.0135, -0.028, -0.11); mk.rotation.y = -Math.PI / 2;
  g.add(mk);                                                           // receiver stampings
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
  const fpBase = part(gunBlack, 0.01, 0.024, 0.012, 0, 0.032, -0.42);
  const frontPost = part(gunBlack, 0.004, 0.03, 0.004, 0, 0.055, -0.42);
  const rearL = part(gunBlack, 0.004, 0.022, 0.004, -0.012, 0.055, 0.0);
  const rearR = part(gunBlack, 0.004, 0.022, 0.004, 0.012, 0.055, 0.0);
  g.add(body, dust, bolt, helical, shroud, muzzle, grip, trig, rodT, rodB, plate, fpBase, frontPost, rearL, rearR);
  // --- small parts ---
  g.add(part(gunBlack, 0.006, 0.026, 0.006, -0.018, 0.05, 0.0));       // rear sight ear L
  g.add(part(gunBlack, 0.006, 0.026, 0.006, 0.018, 0.05, 0.0));        // rear sight ear R
  g.add(part(gunDark, 0.004, 0.007, 0.02, 0.0145, -0.005, -0.02));     // selector lever
  g.add(part(gunDark, 0.008, 0.014, 0.01, 0, -0.032, -0.055));         // mag release lever
  g.add(part(gunDark, 0.002, 0.016, 0.04, 0.0135, 0.01, -0.12));       // ejection port
  g.add(cyl(gunSteel, 0.005, 0.005, 0.004, -0.014, 0.01, -0.08, false));// receiver pin
  g.add(cyl(gunSteel, 0.005, 0.005, 0.004, -0.014, -0.01, 0.02, false));// receiver pin
  for (let i = 0; i < 3; i++) g.add(cyl(gunDark, 0.0335, 0.0335, 0.004, 0, -0.045, -0.32 + i * 0.09)); // helical mag grooves
  const ppSw = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 6, 12), gunSteel);
  ppSw.position.set(0, -0.02, -0.44); g.add(ppSw);                     // front sling loop
  const ppSw2 = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 6, 12), gunSteel);
  ppSw2.position.set(0, 0.032, 0.16); g.add(ppSw2);                    // rear sling loop
  const mk2 = markPlate(['PP-919 · 9×18', ''], 0.08, 0.02);
  mk2.position.set(-0.0135, -0.015, -0.14); mk2.rotation.y = -Math.PI / 2;
  g.add(mk2);
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
  const grip = pistolGrip(gunPoly); grip.position.set(0, -0.04, 0.03);
  const trig = triggerAssembly(gunBlack); trig.position.set(0, -0.052, -0.02);
  const stock = part(gunPoly, 0.026, 0.055, 0.2, 0, -0.006, 0.13);
  const buttpad = part(gunDark, 0.03, 0.065, 0.018, 0, -0.006, 0.238);
  // action bars connect the pump to the receiver — and CYCLE with it
  pump.add(part(gunSteel, 0.004, 0.006, 0.26, -0.016, 0, 0.17));
  pump.add(part(gunSteel, 0.004, 0.006, 0.26, 0.016, 0, 0.17));
  g.add(receiver, port, barrel, tube, pump, bead, rearL, rearR, grip, trig, stock, buttpad);
  g.add(part(gunSteel, 0.012, 0.008, 0.008, 0.019, 0.012, -0.05));     // bolt handle knob
  g.add(part(gunDark, 0.022, 0.006, 0.006, 0, -0.04, 0.012));          // cross-bolt safety
  g.add(cyl(gunBlack, 0.02, 0.02, 0.012, 0, 0.005, -0.66));            // barrel/tube clamp band
  g.add(part(gunSteel, 0.02, 0.004, 0.032, 0, -0.031, -0.09));         // shell lifter
  g.add(part(gunSteel, 0.005, 0.008, 0.005, 0, -0.024, -0.62));        // front sling stud
  g.add(part(gunSteel, 0.005, 0.008, 0.005, 0, -0.036, 0.2));          // rear sling stud
  const mk3 = markPlate(['BENELLI M3 · 12GA', ''], 0.09, 0.02);
  mk3.position.set(-0.0145, -0.012, -0.1); mk3.rotation.y = -Math.PI / 2;
  g.add(mk3);
  return { g, mag: null, bolt: null, muzzle: new THREE.Vector3(0, 0.022, -0.71), pump,
    ads: new THREE.Vector3(0, -0.046, -0.3) };
}
function buildStatesman() {
  const g = new THREE.Group();
  const slide = part(gunGold, 0.024, 0.045, 0.22, 0, 0.012, -0.09);               // gilded slide — CYCLES
  slide.userData.base = slide.position.clone();
  for (let i = 0; i < 5; i++) g.add(part(gunDark, 0.026, 0.028, 0.004, 0, 0.012, 0.016 - i * 0.009)); // serrations
  const frame = part(gunBlack, 0.022, 0.026, 0.19, 0, -0.022, -0.075);
  const hammer = part(gunDark, 0.01, 0.024, 0.008, 0, 0.03, 0.021);               // hammer — COCKS
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
  // --- the gilded details ---
  g.add(part(gunDark, 0.002, 0.016, 0.034, 0.0125, 0.02, -0.115));     // ejection port cut
  g.add(cyl(gunGold, 0.0135, 0.0135, 0.012, 0, 0.012, -0.202));        // barrel bushing
  g.add(cyl(gunDark, 0.008, 0.008, 0.006, 0, 0.012, -0.207));          // recessed crown
  g.add(part(gunDark, 0.006, 0.008, 0.02, -0.0145, 0.014, 0.005));     // thumb safety
  g.add(part(gunDark, 0.004, 0.006, 0.032, -0.0145, -0.002, -0.1));    // slide stop lever
  g.add(cyl(gunSteel, 0.004, 0.004, 0.004, 0.0135, -0.002, -0.085, false)); // slide stop pin
  [[-0.0175, -0.045, -0.017], [-0.0175, -0.105, 0.026], [0.0175, -0.045, -0.017], [0.0175, -0.105, 0.026]]
    .forEach(([sx2, sy2, sz2]) => g.add(cyl(gunGold, 0.003, 0.003, 0.003, sx2, sy2, sz2, false))); // grip screws
  g.add(part(gunGold, 0.018, 0.005, 0.022, 0, 0.024, 0.03, 0.45));     // beavertail grip safety
  const lan = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0018, 6, 10), gunDark);
  lan.position.set(0, -0.132, 0.03); g.add(lan);                       // lanyard loop
  const bead2 = part(gunGold, 0.004, 0.004, 0.004, 0, 0.052, -0.19);   // gold bead front sight
  g.add(bead2);
  [-1, 1].forEach(sd => {                                              // scroll engraving on the slide
    const eng = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.032),
      new THREE.MeshBasicMaterial({ map: engravingTex, transparent: true, depthWrite: false }));
    eng.position.set(sd * 0.0125, 0.012, -0.09);
    eng.rotation.y = sd * -Math.PI / 2;
    g.add(eng);
  });
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
    const wOrigin = camera.getWorldPosition(new THREE.Vector3());
    const wD = wallDist(wOrigin, dir, 999);
    if (hits.length && hits[0].distance > wD + 0.05) {   // a wall is in the way
      playerTracer(wOrigin.addScaledVector(dir, wD));
      hitSpark(camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, wD));
    } else if (hits.length) {
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
    e.shootTimer = 1.5 + Math.random() * 1.5;        // no spawn-frame cheap shots
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
const _wallRay = new THREE.Ray();
function wallDist(origin, dir, maxD) {
  _wallRay.set(origin, dir);
  let best = maxD;
  const hitP = new THREE.Vector3();
  for (const b of buildings) {
    if (_wallRay.intersectBox(b, hitP)) {
      const d = origin.distanceTo(hitP);
      if (d < best) best = d;
    }
  }
  return best;
}
function npcFire(e, targetPos, opts = {}) {
  const from = npcMuzzle(e);
  npcFlash(from);
  muzzleSmoke(from);
  if (e.model.gun) {                                  // brass out of the ejection port
    const g = e.model.gun;
    g.updateWorldMatrix(true, false);
    const port = new THREE.Vector3(0.035, 0.01, -0.1).applyMatrix4(g.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(e.grp.quaternion);
    const sh = new THREE.Mesh(shellGeo, shellMat);
    sh.position.copy(port);
    sh.userData.v = right.multiplyScalar(rnd(1, 1.8)).add(new THREE.Vector3(0, rnd(1.4, 2.2), 0));
    sh.userData.av = new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
    sh.userData.t = 0;
    scene.add(sh);
    shells.push(sh);
    if (shells.length > 40) scene.remove(shells.shift());
  }
  const dir = targetPos.clone().sub(from).normalize();
  const err = opts.err ?? 0.06;
  dir.x += rnd(-err, err); dir.y += rnd(-err, err) * 0.6; dir.z += rnd(-err, err);
  dir.normalize();
  // closest approach of the shot line to the target — decides hit vs whiff
  const toT = targetPos.clone().sub(from);
  const along = toT.dot(dir);
  const closest = from.clone().addScaledVector(dir, Math.max(0, along));
  const missBy = closest.distanceTo(targetPos);
  const wd = wallDist(from, dir, 999);
  const blocked = wd < Math.max(0, along) - 0.3;      // a wall stands before the target
  const hit = !blocked && missBy < (opts.hitRadius ?? 0.35);
  const end = hit ? targetPos.clone() : from.clone().addScaledVector(dir, Math.min(60, Math.min(wd, along + rnd(6, 18))));
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
  document.getElementById('stamp').textContent = 'COLOMBIA — 1985';
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
let sprintNow = false, sprintAmt = 0;   // tactical-sprint viewmodel blend
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
  sprintAmt += ((sprintNow && !onSights ? 1 : 0) - sprintAmt) * Math.min(1, dt * 8);
  bobPhase += dt * (4 + moveAmount * 6.5 + sprintAmt * 4);
  const bobAmt = moveAmount * (aiming ? 0.004 : 0.014) * (1 + sprintAmt * 0.9);
  rig.position.y += Math.abs(Math.sin(bobPhase)) * -bobAmt + bobAmt * 0.5;
  rig.position.x += Math.cos(bobPhase * 0.5) * bobAmt * 0.6;

  // look sway (rig lags the camera slightly)
  const dq = prevCamQ.clone().invert().multiply(camera.quaternion);
  const e = new THREE.Euler().setFromQuaternion(dq, 'YXZ');
  rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, THREE.MathUtils.clamp(e.y * 6, -0.06, 0.06), dt * 10);
  rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, THREE.MathUtils.clamp(e.x * 6, -0.05, 0.05), dt * 10);
  if (sprintAmt > 0.003) {              // the classic run: muzzle dips, gun cants across the chest
    rig.rotation.y += 0.45 * sprintAmt;
    rig.rotation.x += -0.3 * sprintAmt;
    rig.position.x += 0.05 * sprintAmt;
    rig.position.y += -0.05 * sprintAmt;
    rig.position.z += 0.055 * sprintAmt;
  }
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
    // ---- blink (sculpted heads): lids sweep shut and reopen over ~0.22s ----
    if (e.lids) {
      e.blinkN -= dt;
      if (e.blinkN <= 0) { e.blinkP = 0.22; e.blinkN = 2.2 + Math.random() * 3.8; }
      if (e.blinkP > 0) {
        e.blinkP = Math.max(0, e.blinkP - dt);
        const c = Math.sin(Math.PI * (1 - e.blinkP / 0.22));
        for (const l of e.lids) l.rotation.x = l.userData.open + (l.userData.closed - l.userData.open) * c;
      }
    }
    const J = e.model.joints;                        // [aLs, aLe, aRs, aRe, lLh, lLk, lRh, lRk, head]
    const B = (i) => J[i].userData.basePose;
    const ai = e.ai;

    // ---- hit reaction (both sides): jerk back, stagger, recover ----
    if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt * 2.6);
    if (e.model.rigged) { updateRigged(e, dt); continue; }
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
      const wantCombat = (ai.aimHold > 0 || ai.reloadT > 0 || ai.threatNear) ? 1 : 0;
      if (ai.ready === undefined) ai.ready = 1;
      ai.ready += (wantCombat - ai.ready) * Math.min(1, dt * (wantCombat ? 9 : 1.7));
      const R = ai.ready;
      // the rifle can only rise once the support hand is back on it
      const aimA = ai.aimAmt * Math.max(0, Math.min(1, (R - 0.55) / 0.45));
      const kick = ai.kick * ai.kick;   // sharp kick, fast recovery
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
      e.model.torso.rotation.x += -0.14 * ai.movingAmt - 0.2 * c;

      // ---- arms & gun: the gun stays LEVEL on the body; hands ride their stations ----
      // READY  (creation pose): gun at chest height; right hand grip, left hand barrel.
      // AIM: the level gun rises to the shoulder; both hands rise with it.
      const L = (a, b) => a * (1 - aimA) + b * aimA;
      const H = e.model.hold || {};
      const runB = ai.movingAmt * (sp > 3.2 ? 1 : 0) * (1 - aimA);   // sprint pose blend
      const br = Math.sin(e.phase * 1.7) * 0.035 * (1 - aimA);
      if (!e.model.lockArms) {
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
        J[0].rotation.x = L(B(0).x + br, 1.62 + (H.lx || 0));  // left hand OUT on the handguard
        J[0].rotation.z = L(B(0).z, 0.42 + (H.lz || 0));
        J[1].rotation.x = L(B(1).x, 0.03) - 0.2 * kick;
        if (e.model.gun) {
          const mg = e.model.gun.userData.mag;
          if (mg) mg.visible = true;
        }
      }
      // right arm: hand stays ON the grip; elbow bends deeper as the gun rises
      J[2].rotation.x = L(B(2).x + br, 0.35) + 0.1 * kick;
      J[2].rotation.z = L(B(2).z, -0.35 + (H.rz || 0));
      J[3].rotation.x = L(B(3).x, 1.6) - 0.25 * kick;
      }
      // the LEVEL gun itself: rises from chest carry to shoulder aim; recoil shoves it straight back
      if (e.model.gun) {
        const g = e.model.gun;
        g.rotation.x = 0.12 * kick + 0.4 * runB;        // level; dips into the sprint
        g.position.x = L(g.userData.basePos.x, 0.12);
        g.position.y = L(g.userData.basePos.y, 1.38 + (H.gy || 0)) - 0.07 * runB;
        g.position.z = L(g.userData.basePos.z, -0.46) + 0.06 * kick;  // butt seats AT the shoulder pocket
      }
      // cheek weld while aiming; the body rocks back on each shot
      // (torso yaw is set in the facing section below — turn-lead + blade)
      J[8].rotation.z = 0.07 * aimA;
      e.model.torso.rotation.x += -0.09 * kick;
      // ---- PATROL CARRY: gun slung diagonal across the chest by the grip,
      // support hand free (swings with the stride); blends out on contact ----
      const P = 1 - R;
      if (P > 0.01) {
        const swingL = Math.sin(ai.walkPhase) * 0.4 * ai.movingAmt;
        const g2 = e.model.gun;
        if (g2) {
          g2.rotation.x = g2.rotation.x * R + 0.5 * P;
          g2.rotation.z = 0.65 * P;                       // the diagonal cant
          g2.position.x = g2.position.x * R + 0.03 * P;
          g2.position.y = g2.position.y * R + 1.04 * P;
          g2.position.z = g2.position.z * R + (-0.29) * P;
        }
        if (!e.model.lockArms) {
        J[0].rotation.x = J[0].rotation.x * R + (0.12 + swingL) * P;  // free hand swings
        J[0].rotation.z = J[0].rotation.z * R + 0.06 * P;
        J[1].rotation.x = J[1].rotation.x * R + 0.22 * P;
        J[2].rotation.x = J[2].rotation.x * R + 0.5 * P;              // grip hand rides the sling
        J[2].rotation.z = J[2].rotation.z * R + (-0.12) * P;
        J[3].rotation.x = J[3].rotation.x * R + 0.62 * P;
        }
      }

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

// pose application for RIGGED soldiers: mocap locomotion + procedural combat layer.
// Runs INSTEAD of the joint animator; shares all the same ai fields and facing logic.
function updateRigged(e, dt) {
  const M = e.model, ai = e.ai, b = M.bones;
  if (ai) {
    // ---- timers (identical to the built-in path) ----
    ai.movingAmt = Math.max(0, ai.movingAmt - dt * 4);
    ai.aimHold = Math.max(0, ai.aimHold - dt);
    const wantAim = ai.aimHold > 0 && ai.reloadT === 0 ? 1 : 0;
    ai.aimAmt += (wantAim - ai.aimAmt) * Math.min(1, dt * 6);
    ai.kick = Math.max(0, ai.kick - dt * 7);
    ai.crouch += ((ai.crouchTarget || 0) - ai.crouch) * Math.min(1, dt * 7);
    const aimA = ai.aimAmt, kick = ai.kick * ai.kick, c = ai.crouch;
    const sp = ai.state === 'move' ? (ai.runSpeed || 2.3) : 0;
    // ---- locomotion: blend the motion-captured clips (sneak pose = crouch) ----
    const run = sp > 3.2 ? 1 : 0;
    const mv = ai.movingAmt;
    if (M.act.Sneak) {
      M.act.Sneak.weight = c;
      M.act.Idle.weight = (1 - mv) * (1 - c);
      M.act.Walk.weight = mv * (1 - run) * (1 - c);
      M.act.Run.weight = mv * run * (1 - c);
      M.mixer.update(dt);
      b.Spine.rotation.x += 0.12 * c;              // settle lower over the knees
      b.Hips.position.y = M.hipsRestY - 0.12 * M.hipsUnit * c;  // extra sink under the mocap pose
    } else {
      M.act.Idle.weight = 1 - mv;
      M.act.Walk.weight = mv * (1 - run);
      M.act.Run.weight = mv * run;
      M.mixer.update(dt);
      // no sneak clip: procedural crouch — sink hips, fold legs
      if (c > 0.003) {
        b.Hips.position.y = M.hipsRestY - 0.34 * M.hipsUnit * c;
        b.LeftUpLeg.rotation.x += -1.15 * c;
        b.LeftLeg.rotation.x += 1.8 * c;
        b.RightUpLeg.rotation.x += -0.5 * c;
        b.RightLeg.rotation.x += 1.55 * c;
        b.Spine.rotation.x += 0.14 * c;
      } else b.Hips.position.y = M.hipsRestY;
    }
    // ---- facing FIRST so the gun/hand solve sees the final yaw ----
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
    // ---- the gun: level carry -> shouldered aim -> recoil shove (as before) ----
    let gripW = null, guardW = null;
    if (M.gun) {
      const g = M.gun;
      const L = (a2, b2) => a2 * (1 - aimA) + b2 * aimA;
      g.rotation.x = 0.12 * kick;
      g.position.x = L(g.userData.basePos.x, 0.12);
      g.position.y = L(g.userData.basePos.y, 1.38) - 0.34 * c;
      g.position.z = L(g.userData.basePos.z, -0.52) + 0.06 * kick;
      g.updateWorldMatrix(true, false);
      gripW = new THREE.Vector3(0, -0.1, 0.03).applyMatrix4(g.matrixWorld);   // pistol grip
      guardW = new THREE.Vector3(0, -0.01, -0.36).applyMatrix4(g.matrixWorld); // handguard
      const mg = g.userData.mag;
      if (ai.reloadT > 0) {
        // reload: left hand dives to the belt, the empty mag drops out
        const p = 1 - ai.reloadT / 1.7;
        if (mg) {
          const out = p > 0.3 && p < 0.62;
          if (out && !ai.magDropped) { ai.magDropped = true; dropMag(mg); }
          mg.visible = !out;
        }
        guardW = new THREE.Vector3(-0.16, 0.92 - 0.34 * c, -0.12).applyMatrix4(e.grp.matrixWorld);
      } else if (mg) mg.visible = true;
    }
    // ---- spine/head: turn lead, flinch, recoil rock (additive on the clip) ----
    const lead = THREE.MathUtils.clamp(e.turnDiff || 0, -0.55, 0.55);
    b.Spine1.rotation.y += lead * 0.4 + 0.1 * aimA;
    b.Spine1.rotation.x += -0.1 * kick - 0.45 * e.hitT;
    b.Head.rotation.y += lead * 0.55;
    b.Head.rotation.x += -0.3 * e.hitT + 0.06 * aimA;
    // ---- arms: IK the hands onto the rifle stations (overrides the clip swing) ----
    if (M.gun) {
      const q = e.grp.quaternion;
      armIK(b.RightArm, b.RightForeArm, b.RightHand, gripW,
        new THREE.Vector3(0.3, -0.45, 0.15).applyQuaternion(q));
      armIK(b.LeftArm, b.LeftForeArm, b.LeftHand, guardW,
        new THREE.Vector3(-0.3, -0.5, 0.1).applyQuaternion(q));
    }
    // ---- height: footstep bob only (the hips bone owns the crouch drop) ----
    e.grp.position.y = e.baseY + Math.abs(Math.sin(ai.walkPhase)) * 0.04 * ai.movingAmt;
    if (ai.movingAmt > 0.05) ai.walkPhase += dt * (4 + sp * 1.7);
  } else {
    // civilians / Prestige: idle clip, watch the player, head tracks first
    M.act.Idle.weight = 1; M.act.Walk.weight = 0; M.act.Run.weight = 0;
    M.mixer.update(dt);
    turnToward(e, camera.position.x, camera.position.z, 2.4, dt);
    b.Head.rotation.y += THREE.MathUtils.clamp(e.turnDiff || 0, -0.6, 0.6) * 0.5;
    b.Spine1.rotation.x += -0.45 * e.hitT;
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
  { lh: 1.38, lk: -1.5,  rh: -0.38, rk: -1.72, drop: 0.5 },  // KNEEL: right knee down, left foot planted, thigh shelf for the elbow
  { lh: -0.38, lk: -1.72, rh: 1.38, rk: -1.5,  drop: 0.5 },  // KNEEL mirrored: left knee down
  { lh: 1.5,  lk: -1.8,  rh: 1.5,  rk: -1.8,  drop: 0.62 }, // LOW SQUAT: coiled tight behind cover
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
      const distT = e.grp.position.distanceTo(target.grp.position);
      ai.threatNear = distT < 14;   // weapons up only in close engagement

      if (ai.state === 'hold') {                       // decide where to fight from
        const cov = pickCover(e, target.grp.position);
        if (cov) { ai.cover = cov; ai.state = 'move'; ai.runSpeed = rnd(3.6, 4.6); ai.fireT = rnd(0.5, 1.1); }
        else { ai.state = 'peek'; ai.peekT = rnd(1, 2); }
      } else if (ai.state === 'move') {                 // RUN to cover — shooting on the move
        const r = stepNPC(e, ai.cover.sx, ai.cover.sz, ai.runSpeed, dt);
        ai.movingAmt = 1; ai.crouchTarget = 0;
        ai.fireT -= dt;
        if (ai.fireT <= 0 && distT < 18) {              // snap a shot mid-run (only when close)
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
      ai.threatNear = true;                             // posted overwatch never relaxes
      ai.aimHold = Math.max(ai.aimHold, 0.3);           // snipers live on the glass
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.2 + Math.random() * 1.8;
        const aim = target.grp.position.clone().add(new THREE.Vector3(0, 1.15, 0));
      const distT = e.grp.position.distanceTo(target.grp.position);
      ai.threatNear = distT < 14;   // weapons up only in close engagement
        npcTryFire(e, aim, { err: 0.03, hitRadius: 0.32, friendly: true }) && hitEnemy(e, target, 45);
      }
    }

    // ============ HYDRA: defenders that patrol, stagger, and reload ============
    else if (e.kind === 'enemy') {
      const dPlayer = e.grp.position.distanceTo(camera.position);
      ai.threatNear = dPlayer < 14;
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
    sprintNow = !!sprint && moveAmount > 0.15;

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

const BUILD = 61;   // bump with each demo update — shown on the badge so staleness is visible
window.__demo = { THREE, scene, camera, entities, WEAPONS, BUILD };
console.log('[demo] ready — Three r' + THREE.REVISION + ' · build ' + BUILD);
document.getElementById('jsok').textContent = 'js: ✓ running · build ' + BUILD;
