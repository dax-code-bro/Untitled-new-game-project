/* ============================================================
   Dying.

   What killing you looks like depends on what killed you, and the
   difference is not decoration — it is the last piece of information
   the game gives you about what went wrong. Bleeding out is a grey-out
   from the edges and knees that fold under you, because that is what
   losing 45% of your blood volume does: the brain browns out before
   the body falls. Hypothermia is the opposite — no fight at all, a slow
   sideways settle, and the paradoxical warmth people describe right at
   the end. A fall is over in a third of a second. Drowning is a slow
   roll with the surface receding.

   Every clip drives the camera directly, because in first person the
   camera is the head, and the head is the part of you that hits the
   ground.
   ============================================================ */

SurvivorGame.module({
  id: 'death',
  order: 29,
  init(ctx) {
    const LE = ctx.LE;
    const game = ctx.game;
    const { Vec3 } = LE;

    /* Each clip: how long it runs, and a function of 0..1 returning
       where the head is relative to where it was, how it is tilted, and
       how far the vision has closed in. */
    const CLIP = {
      /* Blood loss. Consciousness goes before the body does — the grey
         closes in from the edges while you are still upright, then the
         knees fold. Anyone who has fainted knows this order. */
      exsanguination: {
        seconds: 5.4, breath: 'gasp',
        at(t) {
          const fold = t < 0.42 ? 0 : Math.pow((t - 0.42) / 0.58, 1.7);
          return {
            drop: 1.42 * fold,
            pitch: -0.30 * fold - Math.sin(t * 5) * 0.02 * (1 - fold),
            roll: 0.55 * fold,
            yaw: 0.18 * fold,
            grey: Math.min(1, Math.pow(t, 0.55) * 1.15),
            tint: [0.62, 0.60, 0.66],
          };
        },
      },
      /* Hypothermia. No collapse: a sit, then a lie. The last of it is
         warm and quiet, which is the cruel part and is why people are
         found undressed. */
      hypothermia: {
        seconds: 7.0, breath: 'slow',
        at(t) {
          const sink = Math.pow(t, 1.25);
          return {
            drop: 1.34 * sink,
            pitch: -0.18 * sink,
            roll: 0.92 * sink,
            yaw: -0.22 * sink,
            grey: Math.pow(t, 1.8),
            tint: [1.0, 0.86, 0.72],      // the paradoxical warmth
            shiverTo: 0,
          };
        },
      },
      /* Heat. The other end of the same axis: the world swims, then goes.
         Collapse is sudden once it comes. */
      hyperthermia: {
        seconds: 5.0, breath: 'gasp',
        at(t) {
          const fold = t < 0.6 ? 0 : Math.pow((t - 0.6) / 0.4, 1.4);
          return {
            drop: 1.40 * fold,
            pitch: -0.26 * fold,
            roll: -0.62 * fold,
            yaw: Math.sin(t * 9) * 0.10 * (1 - fold),
            grey: Math.pow(t, 1.4),
            tint: [1.0, 0.78, 0.62],
            swim: (1 - fold) * 0.9,
          };
        },
      },
      /* Dehydration and starvation both end as a body simply stopping.
         Slow, forward, and without drama. */
      wasting: {
        seconds: 6.2, breath: 'slow',
        at(t) {
          const sink = Math.pow(t, 1.5);
          return {
            drop: 1.36 * sink,
            pitch: -0.62 * sink,
            roll: 0.22 * sink,
            yaw: 0,
            grey: Math.pow(t, 1.6),
            tint: [0.86, 0.84, 0.80],
          };
        },
      },
      /* Trauma. Over before you know it. The head hits and bounces. */
      trauma: {
        seconds: 3.2, breath: 'none',
        at(t) {
          const fall = Math.min(1, t / 0.22);
          const bounce = t > 0.22 && t < 0.34 ? Math.sin((t - 0.22) / 0.12 * Math.PI) * 0.10 : 0;
          return {
            drop: 1.52 * fall - bounce,
            pitch: -1.15 * fall,
            roll: 1.35 * fall,
            yaw: 0.5 * fall,
            grey: Math.min(1, Math.pow(t, 0.5) * 1.3),
            tint: [0.7, 0.45, 0.45],
            shake: t < 0.4 ? (0.4 - t) * 0.14 : 0,
          };
        },
      },
      /* Drowning. The surface goes away above you, and the last of it is
         the water taking the light. */
      drowning: {
        seconds: 6.6, breath: 'none',
        at(t) {
          return {
            drop: 1.1 * t,
            pitch: 0.45 * Math.sin(t * 2.1),
            roll: Math.sin(t * 1.4) * 0.7,
            yaw: t * 0.9,
            grey: Math.pow(t, 1.3),
            tint: [0.45, 0.62, 0.78],
            swim: 0.5,
          };
        },
      },
      /* Illness. A body that has been failing for days lies down. */
      illness: {
        seconds: 6.8, breath: 'wet',
        at(t) {
          const sink = Math.pow(t, 1.35);
          return {
            drop: 1.32 * sink,
            pitch: -0.34 * sink,
            roll: -0.78 * sink,
            yaw: 0.12 * sink,
            grey: Math.pow(t, 1.5),
            tint: [0.78, 0.82, 0.72],
          };
        },
      },
    };

    /* Which clip a cause of death gets. Anything unrecognised dies the
       way a body with nothing left dies. */
    function clipFor(cause) {
      const c = String(cause || '').toLowerCase();
      if (/exsangu|blood|bleed|haemorr/.test(c)) return CLIP.exsanguination;
      if (/hypotherm|cold|frost/.test(c)) return CLIP.hypothermia;
      if (/hyperther|heat/.test(c)) return CLIP.hyperthermia;
      if (/dehydrat|starv|hypoglyc|insomnia/.test(c)) return CLIP.wasting;
      if (/drown|water/.test(c)) return CLIP.drowning;
      if (/fall|trauma|crush|shot|gunshot|mauled|bite|impact|skull|broken neck/.test(c)) return CLIP.trauma;
      if (/sepsis|fever|infection|rabies|tetanus|cholera|dysentery|plague|disease/.test(c)) return CLIP.illness;
      return CLIP.wasting;
    }

    let play = null;                 // { clip, t, from: Vec3, yaw, pitch }
    const overlay = document.createElement('div');
    overlay.id = 'deathVeil';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:38;pointer-events:none;opacity:0';
    document.body.appendChild(overlay);

    ctx.on('death', (e) => {
      const cam = game.camera;
      const fwd = cam.forward;
      play = {
        clip: clipFor(e && e.cause),
        t: 0,
        from: new Vec3().copy(cam.position),
        last: performance.now(),
        yaw: Math.atan2(fwd.x, fwd.z),
        pitch: Math.asin(Math.max(-1, Math.min(1, fwd.y))),
        cause: e && e.cause,
      };
      if (ctx.state.dying) ctx.state.dying.claimed = true;
      ctx.state.dead = true;
      // The HUD has nothing useful left to say, and leaving a water bar
      // on the screen while you bleed out is the sort of thing that
      // stops a death landing.
      for (const id of HIDE_ON_DEATH) {
        const el = document.getElementById(id);
        if (el) { el.dataset.wasHidden = el.hidden ? '1' : '0'; el.hidden = true; }
      }
    });

    const HIDE_ON_DEATH = ['hud', 'help', 'compass', 'crosshair', 'prompt', 'tutorial', 'windStrip'];

    ctx.on('respawn', () => {
      play = null;
      overlay.style.opacity = '0';
      overlay.style.background = 'none';
      for (const id of HIDE_ON_DEATH) {
        const el = document.getElementById(id);
        if (el && el.dataset.wasHidden !== '1') el.hidden = false;
      }
      const canvas = game.canvas;
      if (canvas) canvas.style.transform = '';
      game._camMode = 'first';
    });

    const _eye = new Vec3(), _target = new Vec3();

    ctx.onUpdate(() => {
      if (!play) return;
      const c = play.clip;
      /* Wall clock, not the frame-clamped simulation dt. Dying should
         take the same five seconds on a slow machine as on a fast one —
         the engine's dt is clamped, so on a software rasteriser a clip
         driven by it would take half a minute. */
      const now = performance.now();
      const step = Math.min(0.25, (now - play.last) / 1000);
      play.last = now;
      play.t = Math.min(1, play.t + step / c.seconds);
      const f = c.at(play.t);

      /* Where the head ends up. The ground is the floor for it — a head
         does not sink into the sand, and letting it would show the
         inside of the terrain. */
      const groundY = ctx.groundY(play.from.x, play.from.z);
      const eyeY = Math.max(groundY + 0.14, play.from.y - f.drop);
      const shake = f.shake ? (Math.random() - 0.5) * f.shake : 0;
      const swim = f.swim ? Math.sin(play.t * 11) * 0.035 * f.swim : 0;

      _eye.set(play.from.x + shake, eyeY, play.from.z + shake);
      const yaw = play.yaw + f.yaw + swim;
      const pitch = Math.max(-1.45, Math.min(1.45, play.pitch + f.pitch + swim * 0.6));
      const ch = Math.cos(pitch);
      _target.set(
        _eye.x + Math.sin(yaw) * ch,
        _eye.y + Math.sin(pitch),
        _eye.z + Math.cos(yaw) * ch,
      );
      game.lookAt([_eye.x, _eye.y, _eye.z], [_target.x, _target.y, _target.z]);
      /* Roll: the engine's camera has no roll, so the veil takes it.
         Turning the whole page is cheap and, for two seconds at the end
         of a life, completely convincing. */
      const canvas = game.canvas;
      if (canvas) {
        /* Enough scale that the rotated frame still covers the window.
           A rotated rectangle needs |cos| + (other side / this side) *
           |sin| to cover; take the worse of the two axes or the corners
           show the page behind. */
        const a = f.roll * 0.60;                     // radians of page roll
        const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
        const ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
        const scale = Math.max(ca + (h / w) * sa, ca + (w / h) * sa);
        canvas.style.transform = `rotate(${(a * 180 / Math.PI).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      }

      const [r, g, b] = f.tint;
      const a = Math.min(0.97, f.grey);
      overlay.style.background =
        `radial-gradient(ellipse 92% 96% at 50% 50%,`
        + ` rgba(${Math.round(r * 40)},${Math.round(g * 40)},${Math.round(b * 44)},${(a * 0.30).toFixed(3)}) ${Math.round(56 - a * 52)}%,`
        + ` rgba(${Math.round(r * 22)},${Math.round(g * 22)},${Math.round(b * 26)},${a.toFixed(3)}) 100%)`;
      overlay.style.opacity = '1';

      if (play.t >= 1) {
        play = null;
        if (canvas) canvas.style.transform = '';
        overlay.style.background = '#05070a';
        if (window.SURVIVOR_DEATH_DONE) window.SURVIVOR_DEATH_DONE();
      }
    }, { whilePaused: true });
  },
});
