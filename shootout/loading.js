// Shootout — loading screen.
// A revolver fires, the bullet streaks across the screen and hits a target.
// When the bullet lands, onDone() is called so the game can fade to the menu.

function runLoadingScreen(canvas, onDone) {
  const ctx = canvas.getContext('2d');
  let w, h, dpr;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Timeline (seconds)
  const T_AIM = 1.2;       // revolver slides in and the hammer cocks
  const T_FIRE = 1.6;      // shot
  const T_HIT = 2.5;       // bullet reaches the target
  const T_END = 3.8;       // hold on the hit, then hand off

  const start = performance.now();
  let fired = false, hit = false, done = false;
  const sparks = [];

  function drawRevolver(x, y, s, hammerBack, recoil) {
    ctx.save();
    ctx.translate(x - recoil * 20 * s, y);
    ctx.rotate(-recoil * 0.25);
    ctx.scale(s, s);
    ctx.fillStyle = '#1b1b1b';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;

    // barrel
    ctx.fillRect(10, -18, 120, 14);
    ctx.strokeRect(10, -18, 120, 14);
    ctx.fillRect(10, -6, 95, 8);           // ejector rod housing
    ctx.fillRect(124, -24, 6, 6);          // front sight
    // frame
    ctx.beginPath();
    ctx.moveTo(-40, -22); ctx.lineTo(14, -22); ctx.lineTo(14, 12); ctx.lineTo(-30, 14);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // cylinder
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-28, -24, 40, 32);
    ctx.strokeRect(-28, -24, 40, 32);
    ctx.strokeStyle = '#444';
    for (let i = -20; i < 10; i += 9) { ctx.beginPath(); ctx.moveTo(i, -22); ctx.lineTo(i, 6); ctx.stroke(); }
    // hammer
    ctx.save();
    ctx.translate(-38, -20);
    ctx.rotate(-hammerBack * 0.7);
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(-4, -16, 8, 18);
    ctx.restore();
    // trigger guard + trigger
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-14, 20, 13, 0, Math.PI); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14, 12); ctx.lineTo(-18, 24); ctx.stroke();
    // wooden grip
    const grad = ctx.createLinearGradient(-60, 0, -20, 60);
    grad.addColorStop(0, '#6b3e1e'); grad.addColorStop(1, '#3a1e0c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-40, 10); ctx.lineTo(-28, 12);
    ctx.quadraticCurveTo(-30, 50, -40, 78);
    ctx.lineTo(-72, 74);
    ctx.quadraticCurveTo(-58, 40, -40, 10);
    ctx.fill();
    ctx.restore();
  }

  function drawTarget(x, y, r, shake) {
    ctx.save();
    ctx.translate(x + shake * (Math.random() - 0.5) * 6, y);
    // post
    ctx.fillStyle = '#4a2e18';
    ctx.fillRect(-6, r * 0.9, 12, h);
    const rings = ['#e8dcc4', '#8b1a1a', '#e8dcc4', '#8b1a1a', '#e8dcc4', '#8b1a1a'];
    rings.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 - i / rings.length), 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill();
    });
    if (hit) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + 0.3;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function frame(now) {
    if (done) return;
    const t = (now - start) / 1000;

    // background: dusty dusk
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a0f08'); bg.addColorStop(0.7, '#2a160a'); bg.addColorStop(1, '#0a0503');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    const s = Math.min(w, h) / 500;
    const gunX = w * 0.18, gunY = h * 0.5;
    const muzzleX = gunX + 132 * s, muzzleY = gunY - 11 * s;
    const tX = w * 0.82, tY = h * 0.5 - 11 * s, tR = 70 * s;

    // gun slide-in
    const slide = Math.min(1, t / T_AIM);
    const ease = 1 - Math.pow(1 - slide, 3);
    const gx = -200 + (gunX + 200) * ease;
    const hammer = t < T_AIM ? 0 : t < T_FIRE ? Math.min(1, (t - T_AIM) / 0.2) : 0;
    const recoilT = t - T_FIRE;
    const recoil = recoilT > 0 && recoilT < 0.4 ? Math.sin((recoilT / 0.4) * Math.PI) : 0;

    if (!fired && t >= T_FIRE) { fired = true; Sound.gunshot(); }
    if (!hit && t >= T_HIT) {
      hit = true; Sound.impact();
      for (let i = 0; i < 30; i++) {
        sparks.push({ x: tX, y: tY, vx: -Math.random() * 6 - 1, vy: (Math.random() - 0.5) * 6, life: 1 });
      }
    }

    const shake = hit ? Math.max(0, 1 - (t - T_HIT) * 3) : 0;
    drawTarget(tX, tY, tR, shake);
    drawRevolver(gx, gunY, s, hammer, recoil);

    // muzzle flash + smoke
    if (fired && recoilT < 0.12) {
      ctx.save();
      ctx.translate(muzzleX, muzzleY);
      const fl = ctx.createRadialGradient(0, 0, 0, 0, 0, 60 * s);
      fl.addColorStop(0, 'rgba(255,240,180,1)');
      fl.addColorStop(0.4, 'rgba(255,140,30,0.8)');
      fl.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fl;
      ctx.beginPath(); ctx.arc(20 * s, 0, 60 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // whole-screen flash
      ctx.fillStyle = `rgba(255,200,120,${0.25 * (1 - recoilT / 0.12)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (fired) {
      const age = recoilT;
      for (let i = 0; i < 5; i++) {
        const a = Math.max(0, 0.35 - age * 0.15 - i * 0.04);
        ctx.fillStyle = `rgba(150,140,130,${a})`;
        ctx.beginPath();
        ctx.arc(muzzleX + age * 30 * s + i * 12 * s, muzzleY - age * 25 * s - i * 6 * s, (10 + age * 30 + i * 5) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // bullet in flight (slight slow-motion feel with a long trail)
    if (fired && !hit) {
      const p = (t - T_FIRE) / (T_HIT - T_FIRE);
      const bx = muzzleX + (tX - muzzleX) * p;
      const by = muzzleY + (tY - muzzleY) * p;
      const trail = ctx.createLinearGradient(bx - 180 * s, by, bx, by);
      trail.addColorStop(0, 'rgba(255,220,150,0)');
      trail.addColorStop(1, 'rgba(255,220,150,0.7)');
      ctx.strokeStyle = trail; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(bx - 180 * s, by); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = '#c89a4a';
      ctx.beginPath(); ctx.ellipse(bx, by, 9 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    }

    // sparks / splinters on impact
    for (const p of sparks) {
      if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= 0.03;
      ctx.fillStyle = `rgba(230,200,150,${p.life})`;
      ctx.fillRect(p.x, p.y, 3, 3);
    }

    if (t >= T_END) {
      done = true;
      window.removeEventListener('resize', resize);
      onDone();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
