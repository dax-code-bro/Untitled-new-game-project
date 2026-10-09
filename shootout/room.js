// Shootout — the room.
// A gray room with a door on the side, desks and bookshelves, and a long table
// down the middle. `ravage` goes from 0 (neat) to 1 (wrecked and bloody) as the
// rounds go on: furniture tips over, books spill, walls crack, blood spreads
// and the light starts to flicker.

const Room = (() => {
  let canvas, ctx, w, h, dpr;
  let ravage = 0;
  let showBlood = true;
  let opponents = 1;
  let dead = [];              // dead[i] is true once opponent i has been shot
  let running = false;
  let flicker = 1;

  // Seeded random so blood and debris stay put between frames.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Pre-generate splatters; more of them become visible as ravage rises.
  const SPLATS = (() => {
    const r = rng(1337);
    const list = [];
    for (let i = 0; i < 70; i++) {
      list.push({
        x: r(), y: r(),                       // normalized position
        surface: r() < 0.55 ? 'wall' : 'floor',
        size: 0.3 + r() * 1.2,
        drops: Math.floor(3 + r() * 9),
        seed: Math.floor(r() * 1e9),
        drip: r() < 0.5,
        threshold: i / 70,                    // when it appears
      });
    }
    return list;
  })();

  function init(c) {
    canvas = c;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Room geometry: back wall rectangle, everything else is perspective.
  function geo() {
    const bw = w * 0.56, bh = h * 0.42;
    const bx = (w - bw) / 2, by = h * 0.1;
    return { bx, by, bw, bh, floorY: by + bh };
  }

  function shade(base, amt) {
    // darken a gray value by flicker / ravage
    const v = Math.max(0, Math.min(255, Math.round(base * amt)));
    return `rgb(${v},${v},${v})`;
  }

  function drawShell(g, light) {
    const { bx, by, bw, bh, floorY } = g;
    // ceiling
    ctx.fillStyle = shade(70, light);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(bx + bw, by); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
    // floor (dark wood-gray)
    ctx.fillStyle = shade(62, light);
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(bx + bw, floorY); ctx.lineTo(bx, floorY); ctx.closePath(); ctx.fill();
    // floorboards
    ctx.strokeStyle = `rgba(0,0,0,0.25)`; ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const fx = bx + (bw * i) / 12;
      const ex = (w * i) / 12;
      ctx.beginPath(); ctx.moveTo(fx, floorY); ctx.lineTo(ex, h); ctx.stroke();
    }
    // left wall
    ctx.fillStyle = shade(105, light);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(bx, by); ctx.lineTo(bx, floorY); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // right wall
    ctx.fillStyle = shade(100, light);
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, floorY); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // back wall
    ctx.fillStyle = shade(125, light);
    ctx.fillRect(bx, by, bw, bh);
    // skirting
    ctx.fillStyle = shade(80, light);
    ctx.fillRect(bx, floorY - 8, bw, 8);
  }

  function drawDoor(g, light) {
    // Door on the left wall, drawn in perspective.
    const { bx, by, floorY } = g;
    const lerp = (a, b, t) => a + (b - a) * t;
    const t0 = 0.35, t1 = 0.65;              // along the wall (0 = front, 1 = back)
    const x0 = lerp(0, bx, t0), x1 = lerp(0, bx, t1);
    const floorAt = t => lerp(h, floorY, t);
    const ceilAt = t => lerp(0, by, t);
    const top0 = lerp(ceilAt(t0), floorAt(t0), 0.22);
    const top1 = lerp(ceilAt(t1), floorAt(t1), 0.22);

    // frame
    ctx.fillStyle = '#2a1a0e';
    ctx.beginPath();
    ctx.moveTo(x0, floorAt(t0)); ctx.lineTo(x0, top0); ctx.lineTo(x1, top1); ctx.lineTo(x1, floorAt(t1));
    ctx.closePath(); ctx.fill();

    // the door swings open a little more each round; darkness beyond
    const open = 0.05 + ravage * 0.5;
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.moveTo(x0 + 3, floorAt(t0) - 2); ctx.lineTo(x0 + 3, top0 + 3); ctx.lineTo(x1 - 3, top1 + 3); ctx.lineTo(x1 - 3, floorAt(t1) - 2);
    ctx.closePath(); ctx.fill();

    const hingeX = x1 - 3;
    const swingX = lerp(x0 + 3, hingeX, open);
    ctx.fillStyle = `rgb(${Math.round(90 * light)},${Math.round(62 * light)},${Math.round(40 * light)})`;
    ctx.beginPath();
    ctx.moveTo(swingX, lerp(floorAt(t0), floorAt(t1), open) - 2);
    ctx.lineTo(swingX, lerp(top0, top1, open) + 3);
    ctx.lineTo(hingeX, top1 + 3);
    ctx.lineTo(hingeX, floorAt(t1) - 2);
    ctx.closePath(); ctx.fill();
    // knob
    ctx.fillStyle = '#b8954a';
    ctx.beginPath();
    ctx.arc(swingX + 6, lerp(lerp(floorAt(t0), floorAt(t1), open), lerp(top0, top1, open), 0.45), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBookshelf(x, y, sw, sh, tilt, spill, seed, light) {
    const r = rng(seed);
    ctx.save();
    ctx.translate(x + sw / 2, y + sh);
    ctx.rotate(tilt);
    ctx.translate(-sw / 2, -sh);
    ctx.fillStyle = `rgb(${Math.round(70 * light)},${Math.round(45 * light)},${Math.round(28 * light)})`;
    ctx.fillRect(0, 0, sw, sh);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const shelves = 4;
    for (let i = 0; i < shelves; i++) {
      const sy = 4 + (i * (sh - 8)) / shelves;
      const shH = (sh - 8) / shelves - 4;
      ctx.fillRect(4, sy, sw - 8, shH);
      // books (fewer remain as spill rises)
      let bxp = 6;
      while (bxp < sw - 10) {
        const bwid = 3 + r() * 5;
        const keep = r() > spill;
        if (keep) {
          const hue = Math.floor(r() * 4);
          const cols = ['#5a1f1f', '#2a3a4a', '#3a4a2a', '#6a5a3a'];
          ctx.fillStyle = cols[hue];
          const bh2 = shH * (0.6 + r() * 0.35);
          ctx.fillRect(bxp, sy + shH - bh2, bwid, bh2);
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
        } else { r(); r(); }
        bxp += bwid + 1;
      }
    }
    ctx.restore();
    // spilled books on floor
    const n = Math.floor(spill * 14);
    for (let i = 0; i < n; i++) {
      const fx = x - sw * 0.3 + r() * sw * 1.6;
      const fy = y + sh - 4 + r() * 18;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate((r() - 0.5) * 2);
      ctx.fillStyle = ['#5a1f1f', '#2a3a4a', '#3a4a2a', '#6a5a3a'][Math.floor(r() * 4)];
      ctx.fillRect(-7, -2, 14, 5);
      ctx.restore();
    }
  }

  function drawDesk(x, y, dw, dh, tilt, light, papers) {
    ctx.save();
    ctx.translate(x + dw / 2, y + dh);
    ctx.rotate(tilt);
    ctx.translate(-dw / 2, -dh);
    const wood = `rgb(${Math.round(85 * light)},${Math.round(58 * light)},${Math.round(36 * light)})`;
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, dw, dh * 0.18);              // top
    ctx.fillRect(4, dh * 0.18, dw * 0.32, dh * 0.82); // drawer stack
    ctx.fillRect(dw - 8, dh * 0.18, 4, dh * 0.82);  // leg
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    for (let i = 1; i < 3; i++) {
      ctx.strokeRect(6, dh * 0.18 + (i - 1) * dh * 0.27 + 2, dw * 0.32 - 4, dh * 0.25);
    }
    // neat stack of papers / a lamp while calm
    if (papers) {
      ctx.fillStyle = '#d8d0bc';
      ctx.fillRect(dw * 0.55, -4, dw * 0.25, 4);
      ctx.fillStyle = '#3a3a2a';
      ctx.fillRect(dw * 0.15, -14, 3, 14);
      ctx.fillStyle = '#7a6a3a';
      ctx.beginPath(); ctx.moveTo(dw * 0.1, -14); ctx.lineTo(dw * 0.25, -14); ctx.lineTo(dw * 0.2, -22); ctx.lineTo(dw * 0.13, -22); ctx.fill();
    }
    ctx.restore();
  }

  function drawFurniture(g, light) {
    const { bx, bw, floorY } = g;
    const R = ravage;
    // bookshelves against the back wall
    const shW = bw * 0.14, shH = g.bh * 0.62;
    drawBookshelf(bx + bw * 0.04, floorY - shH, shW, shH, R > 0.55 ? -0.12 * (R - 0.55) * 4 : 0, Math.max(0, R * 1.1 - 0.15), 11, light);
    drawBookshelf(bx + bw * 0.82, floorY - shH, shW, shH, R > 0.75 ? 0.5 * (R - 0.75) * 4 : 0, Math.max(0, R * 1.2 - 0.25), 22, light);
    // desks
    const dW = bw * 0.2, dH = g.bh * 0.26;
    drawDesk(bx + bw * 0.22, floorY - dH, dW, dH, R > 0.4 ? -0.08 * (R - 0.4) * 3 : 0, light, R < 0.35);
    drawDesk(bx + bw * 0.58, floorY - dH, dW, dH, R > 0.65 ? 0.35 * (R - 0.65) * 3 : 0, light, R < 0.5);

    // a picture frame that hangs straight, then crooked, then falls
    const fx = bx + bw * 0.45, fy = g.by + g.bh * 0.15;
    if (R < 0.85) {
      ctx.save();
      ctx.translate(fx + 30, fy);
      ctx.rotate(R * 0.5);
      ctx.fillStyle = '#4a3220'; ctx.fillRect(-30, 0, 60, 44);
      ctx.fillStyle = shade(160, light); ctx.fillRect(-25, 5, 50, 34);
      ctx.fillStyle = 'rgba(60,40,20,0.5)';
      ctx.beginPath(); ctx.moveTo(-25, 39); ctx.lineTo(-5, 18); ctx.lineTo(10, 30); ctx.lineTo(25, 15); ctx.lineTo(25, 39); ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(fx + 40, floorY + 6);
      ctx.rotate(1.3);
      ctx.fillStyle = '#4a3220'; ctx.fillRect(-30, 0, 60, 10);
      ctx.restore();
    }
  }

  function drawCracks(g) {
    if (ravage < 0.3) return;
    const r = rng(99);
    ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 1.2;
    const count = Math.floor((ravage - 0.3) * 10);
    for (let c = 0; c < count; c++) {
      let x = g.bx + r() * g.bw, y = g.by + r() * g.bh * 0.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0; i < 6; i++) {
        x += (r() - 0.5) * 30; y += r() * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function splatterAt(cx, cy, s, sp) {
    const r = rng(sp.seed);
    const red = `rgba(${110 + Math.floor(r() * 40)},0,0,0.85)`;
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(cx, cy, 10 * s, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < sp.drops; i++) {
      const a = r() * Math.PI * 2, d = (8 + r() * 26) * s;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (1 + r() * 4) * s, 0, Math.PI * 2); ctx.fill();
    }
    if (sp.drip && sp.surface === 'wall') {
      ctx.fillRect(cx - 1.5 * s, cy, 3 * s, (20 + r() * 50) * s * Math.min(1, ravage * 1.5));
    }
  }

  function drawBlood(g) {
    if (!showBlood || ravage <= 0) return;
    const { bx, by, bw, bh, floorY } = g;
    for (const sp of SPLATS) {
      if (sp.threshold > ravage) continue;
      if (sp.surface === 'wall') {
        // spread over back wall and side walls
        if (sp.x < 0.15) {
          const t = sp.x / 0.15;
          const x = bx * (0.2 + t * 0.8);
          const y = (by * (0.2 + t * 0.8)) + sp.y * (h - by * 2) * 0.55;
          splatterAt(x, y, sp.size, sp);
        } else if (sp.x > 0.85) {
          const t = (sp.x - 0.85) / 0.15;
          const x = bx + bw + (w - bx - bw) * t * 0.8;
          const y = by + sp.y * bh * 0.8;
          splatterAt(x, y, sp.size, sp);
        } else {
          splatterAt(bx + sp.x * bw, by + sp.y * bh * 0.75, sp.size * 0.8, sp);
        }
      } else {
        // floor: squashed pools
        const fy = floorY + sp.y * (h - floorY);
        const spread = 0.5 + (fy - floorY) / (h - floorY);
        const fx = w / 2 + (sp.x - 0.5) * w * spread;
        ctx.save();
        ctx.translate(fx, fy); ctx.scale(1.8, 0.6);
        splatterAt(0, 0, sp.size * spread * 1.4, sp);
        ctx.restore();
      }
    }
    // a big pool at the head of the table late in the game
    if (ravage > 0.7) {
      const p = (ravage - 0.7) / 0.3;
      ctx.fillStyle = 'rgba(90,0,0,0.75)';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.88, w * 0.18 * p, h * 0.04 * p, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLamp(light) {
    // single hanging bulb over the table; swings more as things get worse
    const t = performance.now() / 1000;
    const swing = Math.sin(t * (0.8 + ravage)) * (0.02 + ravage * 0.12);
    const ax = w / 2, ay = 0, len = h * 0.2;
    const lx = ax + Math.sin(swing) * len, ly = ay + Math.cos(swing) * len;
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.moveTo(lx - 20, ly + 12); ctx.lineTo(lx + 20, ly + 12); ctx.lineTo(lx + 8, ly); ctx.lineTo(lx - 8, ly); ctx.fill();
    const glow = ctx.createRadialGradient(lx, ly + 14, 2, lx, ly + 14, h * 0.7);
    glow.addColorStop(0, `rgba(255,230,170,${0.35 * light})`);
    glow.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(255,240,200,${light})`;
    ctx.beginPath(); ctx.arc(lx, ly + 14, 5, 0, Math.PI * 2); ctx.fill();
  }

  // Normalized seat positions for opponents (x, y of their head on screen).
  function seats(n) {
    const far = { x: 0.5, y: 0.47, scale: 1 };
    const left = { x: 0.24, y: 0.62, scale: 1.35 };
    const right = { x: 0.76, y: 0.62, scale: 1.35 };
    if (n <= 1) return [far];
    if (n === 2) return [left, right];
    return [far, left, right];
  }

  function drawPerson(sx, sy, scale, light, isDead) {
    const x = sx * w, y = sy * h, s = (Math.min(w, h) / 700) * scale;
    if (isDead) { drawBody(x, y, s, light); return; }
    ctx.fillStyle = `rgb(${Math.round(30 * light)},${Math.round(26 * light)},${Math.round(22 * light)})`;
    // shoulders
    ctx.beginPath();
    ctx.ellipse(x, y + 60 * s, 52 * s, 34 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 52 * s, y + 60 * s, 104 * s, 40 * s);
    // head
    ctx.beginPath(); ctx.arc(x, y + 8 * s, 22 * s, 0, Math.PI * 2); ctx.fill();
    // hat brim + crown
    ctx.fillStyle = `rgb(${Math.round(20 * light)},${Math.round(14 * light)},${Math.round(10 * light)})`;
    ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 44 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 22 * s, y - 34 * s, 44 * s, 26 * s);
    // eyes glint in the dark late game
    if (ravage > 0.6) {
      ctx.fillStyle = `rgba(200,30,20,${(ravage - 0.6) * 2})`;
      ctx.fillRect(x - 10 * s, y + 6 * s, 5 * s, 2 * s);
      ctx.fillRect(x + 5 * s, y + 6 * s, 5 * s, 2 * s);
    }
  }

  // A shot opponent slumps forward onto the table, hat knocked off.
  function drawBody(x, y, s, light) {
    ctx.fillStyle = `rgb(${Math.round(30 * light)},${Math.round(26 * light)},${Math.round(22 * light)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 80 * s, 54 * s, 26 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 54 * s, y + 80 * s, 108 * s, 30 * s);
    if (showBlood) {
      ctx.fillStyle = 'rgba(110,0,0,0.85)';
      ctx.beginPath(); ctx.ellipse(x + 14 * s, y + 104 * s, 46 * s, 12 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgb(${Math.round(30 * light)},${Math.round(26 * light)},${Math.round(22 * light)})`;
    ctx.beginPath(); ctx.ellipse(x + 8 * s, y + 92 * s, 22 * s, 16 * s, 0.3, 0, Math.PI * 2); ctx.fill();
    // hat on the floor beside the chair
    ctx.fillStyle = `rgb(${Math.round(20 * light)},${Math.round(14 * light)},${Math.round(10 * light)})`;
    ctx.save();
    ctx.translate(x - 70 * s, y + 118 * s); ctx.rotate(-0.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 40 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-20 * s, -24 * s, 40 * s, 24 * s);
    ctx.restore();
  }

  function drawTable(light) {
    // long table running from the player (bottom) to the far seat
    const nearY = h * 1.02, farY = h * 0.55;
    const nearHalf = w * 0.36, farHalf = w * 0.14;
    const cx = w / 2;
    // legs (far end)
    ctx.fillStyle = `rgb(${Math.round(40 * light)},${Math.round(25 * light)},${Math.round(15 * light)})`;
    ctx.fillRect(cx - farHalf + 6, farY, 8, h * 0.08);
    ctx.fillRect(cx + farHalf - 14, farY, 8, h * 0.08);
    // top
    const grad = ctx.createLinearGradient(0, farY, 0, nearY);
    grad.addColorStop(0, `rgb(${Math.round(70 * light)},${Math.round(44 * light)},${Math.round(26 * light)})`);
    grad.addColorStop(1, `rgb(${Math.round(105 * light)},${Math.round(68 * light)},${Math.round(40 * light)})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - farHalf, farY); ctx.lineTo(cx + farHalf, farY);
    ctx.lineTo(cx + nearHalf, nearY); ctx.lineTo(cx - nearHalf, nearY);
    ctx.closePath(); ctx.fill();
    // wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      ctx.beginPath();
      ctx.moveTo(cx - farHalf + farHalf * 2 * t, farY);
      ctx.lineTo(cx - nearHalf + nearHalf * 2 * t, nearY);
      ctx.stroke();
    }
    // blood on the table
    if (showBlood && ravage > 0.45) {
      const r = rng(7);
      const n = Math.floor((ravage - 0.45) * 20);
      ctx.fillStyle = 'rgba(120,0,0,0.8)';
      for (let i = 0; i < n; i++) {
        const t = r();
        const y = farY + (nearY - farY) * t;
        const half = farHalf + (nearHalf - farHalf) * t;
        const x = cx + (r() - 0.5) * half * 1.6;
        ctx.beginPath(); ctx.ellipse(x, y, (4 + r() * 10) * (0.6 + t), (2 + r() * 4) * (0.6 + t), 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function render() {
    if (!running) return;
    // light flickers more each round
    const flickChance = ravage * 0.08;
    if (Math.random() < flickChance) flicker = 0.25 + Math.random() * 0.4;
    else flicker += (1 - flicker) * 0.15;
    const light = (1 - ravage * 0.35) * flicker;

    const g = geo();
    ctx.clearRect(0, 0, w, h);
    drawShell(g, light);
    drawDoor(g, light);
    drawCracks(g);
    drawFurniture(g, light);
    drawBlood(g);

    // people behind/around the table, far seat drawn before the table
    const ss = seats(opponents).map((s, i) => ({ ...s, dead: !!dead[i] }));
    // the far seat sits behind the table, unless they've slumped forward onto it
    ss.filter(s => s.y < 0.55 && !s.dead).forEach(s => drawPerson(s.x, s.y, s.scale, light, false));
    drawTable(light);
    ss.filter(s => s.y >= 0.55 || s.dead).forEach(s => drawPerson(s.x, s.y, s.scale, light, s.dead));

    drawLamp(light);
    document.documentElement.style.setProperty('--vig', (0.55 + ravage * 0.35).toFixed(2));
    requestAnimationFrame(render);
  }

  function start() { if (!running) { running = true; requestAnimationFrame(render); } }
  function stop() { running = false; }
  function setRavage(v) { ravage = Math.max(0, Math.min(1, v)); }
  function setBlood(v) { showBlood = v; }
  function setOpponents(n) { opponents = n; dead = []; }
  function setDead(i, v) { dead[i] = v; }

  return { init, start, stop, setRavage, setBlood, setOpponents, setDead, seats, resize };
})();
