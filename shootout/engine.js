// Shootout — 3D engine.
// One WebGL canvas sits behind every screen. Each screen (loading, menu, table)
// is a "stage" with its own scene and camera; the engine renders whichever
// stage is active and runs every animation tween from a single clock.

const Engine = (() => {
  let renderer, canvas, stage = null, last = 0, clock = 0;
  const tweens = [];
  const updaters = new Set();
  let speed = 1;   // animation speed multiplier (tests turn this up)

  const Ease = {
    linear: t => t,
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    back: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    bounce: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  function init(c) {
    canvas = c;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (stage && stage.camera) {
      stage.camera.aspect = w / h;
      stage.camera.updateProjectionMatrix();
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0) * speed;
    last = now;
    clock += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(p), p);
      if (p >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    updaters.forEach(fn => fn(dt, clock));
    if (stage) {
      stage.update && stage.update(dt, clock);
      renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(loop);
  }

  // Animate fn(easedT) over `seconds`. Resolves when finished.
  function tween(seconds, fn, ease = Ease.inOut) {
    return new Promise(resolve => {
      if (seconds <= 0) { fn(1, 1); resolve(); return; }
      tweens.push({ t: 0, dur: seconds, fn, ease, resolve });
    });
  }

  // Wait in animation time (follows the speed multiplier).
  function wait(seconds) { return tween(seconds, () => {}, Ease.linear); }

  function setStage(s) {
    if (stage && stage.leave) stage.leave();
    stage = s;
    if (stage && stage.enter) stage.enter();
    resize();
  }

  function onUpdate(fn) { updaters.add(fn); return () => updaters.delete(fn); }

  return {
    init, tween, wait, setStage, onUpdate, Ease,
    get renderer() { return renderer; },
    get stage() { return stage; },
    get time() { return clock; },
    set speed(v) { speed = v; },
    get speed() { return speed; },
  };
})();

// Small helpers shared by every stage.
const Util = {
  lerp: (a, b, t) => a + (b - a) * t,
  rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  },
  // A texture drawn on a 2D canvas.
  canvasTexture(w, h, draw, { repeat, srgb = true } = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    if (repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
    }
    return tex;
  },
  // A flat text label that always faces the camera.
  textSprite(text, { color = '#f0e0c0', sub = '', subColor = '#9a8a6a', width = 512 } = {}) {
    const tex = Util.canvasTexture(width, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center';
      g.font = 'bold 46px Georgia, serif';
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillText(text, w / 2 + 2, 58);
      g.fillStyle = color;
      g.fillText(text, w / 2, 56);
      if (sub) {
        g.font = '28px Georgia, serif';
        g.fillStyle = subColor;
        g.fillText(sub.toUpperCase().split('').join(' '), w / 2, 104);
      }
    });
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.56, 0.14, 1);
    return s;
  },
};
