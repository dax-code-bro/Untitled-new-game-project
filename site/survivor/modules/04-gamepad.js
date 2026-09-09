/* Controller support, all of it.

   The engine hands this module a polled pad with a radial deadzone, a
   response curve, edge-detected buttons and rumble. What is left is the part
   that is specific to this game, and it is mostly a question of context: the
   same eight buttons have to drive a person on foot, a person in a saddle, a
   person behind a windscreen, a person fighting a fish and a person reading
   a differential diagnosis, and none of those want the same map.

   So there is no single binding table. There is a context, worked out fresh
   every frame from what the game says is happening, and a table per context.
   Anything that will not fit on a pad lives on a wheel held under the left
   bumper, and the wheel is context-sensitive too.

   Two decisions worth defending:

   There is no aim assist in the sense of the crosshair being moved for you.
   What there is instead is slowdown: within a couple of degrees of something
   alive, the look sensitivity drops, which is the difference between a stick
   being twitchy and a stick being precise. Nothing is ever snapped to a
   target and no shot is ever bent — a game whose whole claim is that its
   ballistics are real cannot then steer the bullet.

   Prompts are relabelled rather than duplicated. Every module asks
   `ctx.hint('e', 'x')` for what to print, so plugging a pad in rewrites the
   HUD into that pad's own glyphs — a PlayStation pad says ✕, a Switch pro
   says B, and the same code produced both.

   Emits:  'pad-connected' { id, layout }
   Reads:  ctx.state.uiOpen, .fishing, .driving, .riding
   Writes: ctx.state.sprintHeld, .crouchHeld, .jumpRequested, .interactHeld,
           .triggerHeld, .adsHeld, .driveInput, .lookSlowdown
*/
SurvivorGame.module({
  id: 'gamepad',
  order: 4,

  init(ctx) {
    const { game } = ctx;
    const pad = game.input.pad;

    /* ---- settings ---------------------------------------------------- */

    const DEFAULTS = {
      sensitivity: 3.4,        // radians per second at full deflection
      invertY: false,
      deadzone: 0.16,
      lookCurve: 2.2,
      moveCurve: 1.5,
      vibration: true,
      southpaw: false,         // sticks swapped
      aimSlowdown: true,
      holdToAim: true,         // false: the trigger toggles
      holdToSprint: true,      // false: the stick click toggles
      layout: 'auto',
    };
    const KEY = 'survivor.gamepad';
    const opt = Object.assign({}, DEFAULTS);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const k of Object.keys(DEFAULTS)) if (saved[k] !== undefined) opt[k] = saved[k];
    } catch (e) { /* first run, or storage is off */ }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch (e) { /* private window */ }
    }
    function applyOptions() {
      pad.deadzone = opt.deadzone;
      pad.lookCurve = opt.lookCurve;
      pad.moveCurve = opt.moveCurve;
      pad.vibration = opt.vibration;
      game.input.lookSensitivity = opt.sensitivity;
      game.input.invertLookY = opt.invertY;
      if (opt.layout !== 'auto') pad.family = opt.layout;
    }
    applyOptions();
    ctx.state.gamepadOptions = opt;
    ctx.state.gamepadApply = () => { applyOptions(); save(); };

    /* Southpaw swaps the sticks. It is done here rather than in the engine
       because it is a preference about this game's controls, not a property
       of the hardware. */
    const rawLeft = { x: 0, y: 0, mag: 0 };
    const rawRight = { x: 0, y: 0, mag: 0 };
    function readSticks() {
      const l = opt.southpaw ? pad.right : pad.left;
      const r = opt.southpaw ? pad.left : pad.right;
      rawLeft.x = l.x; rawLeft.y = l.y; rawLeft.mag = l.mag;
      rawRight.x = r.x; rawRight.y = r.y; rawRight.mag = r.mag;
      if (opt.southpaw) {
        // The engine already folded the physical left stick into the move
        // axes and the physical right into look; undo and redo that.
        game.input.axes.x = rawLeft.x;
        game.input.axes.y = rawLeft.y;
        game.input.look.x = rawRight.x;
        game.input.look.y = rawRight.y;
      }
    }

    /* ---- the wheel --------------------------------------------------- */

    /* An inline `display:flex` beats the `hidden` attribute, which would
       leave the last frame of the wheel painted over everything for the rest
       of the session. Visibility is therefore driven by `display` directly,
       and `hidden` is kept in step only because it is what reads naturally
       from the outside. */
    const wheel = document.createElement('div');
    wheel.id = 'padWheel';
    wheel.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none;'
      + 'display:none;align-items:center;justify-content:center';
    wheel.hidden = true;
    document.body.appendChild(wheel);
    function showWheel(on) {
      wheel.hidden = !on;
      wheel.style.display = on ? 'flex' : 'none';
      if (!on) wheelCanvas.getContext('2d').clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
    }
    const wheelCanvas = document.createElement('canvas');
    wheelCanvas.width = 520; wheelCanvas.height = 520;
    wheelCanvas.style.cssText = 'width:390px;height:390px';
    wheel.appendChild(wheelCanvas);

    let wheelOpen = false, wheelPage = 0, wheelPick = -1;

    /* What the wheel offers, by context. Each entry is a label and the
       binding it presses — so the wheel is a second way to reach exactly the
       verbs the keyboard already has, and cannot drift out of step with them. */
    function wheelSlots() {
      if (ctx.state.fishing) {
        return [
          { label: 'Reel in', key: 'r' },
          { label: 'Change bait', key: 'b' },
          { label: 'Deeper', key: ']' },
          { label: 'Shallower', key: '[' },
          { label: 'Drink', key: 'j' },
          { label: 'Treat water', key: 'k' },
          { label: 'Condition', key: 'c' },
          { label: 'Map', key: 'm' },
        ];
      }
      if (ctx.state.driving || ctx.state.riding) {
        return [
          { label: ctx.state.riding ? 'Dismount' : 'Get out', key: 'q', shift: true },
          { label: 'Engine', key: 'y', disabled: !ctx.state.driving },
          { label: 'Map', key: 'm' },
          { label: 'Condition', key: 'c' },
          { label: 'Inventory', key: 'tab' },
          { label: 'Drink', key: 'j' },
          { label: 'Time ×', key: 't' },
          { label: 'Menu', key: 'escape' },
        ];
      }
      if (wheelPage === 1) {
        return [
          { label: 'Drying rack', key: 'g', shift: true },
          { label: 'Wiring', key: 'x' },
          { label: 'Inspect gun', key: 'i' },
          { label: 'Clear stoppage', key: 'u' },
          { label: 'Load', key: 'l' },
          { label: 'Time ×', key: 't' },
          { label: 'Menu', key: 'escape' },
          { label: '◂ Back', page: 0 },
        ];
      }
      return [
        { label: 'Fire', key: 'f' },
        { label: 'Lean-to', key: 'g' },
        { label: 'Treat water', key: 'k' },
        { label: 'Drink', key: 'j' },
        { label: 'Cast a line', key: 'r' },
        { label: 'Sleep', key: 'v' },
        { label: 'Relieve yourself', key: 'q' },
        { label: 'More ▸', page: 1 },
      ];
    }

    /* Which wedge the stick is pointing at. Twelve o'clock is slot zero and
       it runs clockwise, which is how every wheel in every game works and
       therefore what a player's hands already expect. A stick barely off
       centre selects nothing, so letting go without choosing is possible. */
    function wheelSelection(slots) {
      if (rawLeft.mag < 0.35) return -1;
      const ang = Math.atan2(rawLeft.x, -rawLeft.y);        // 0 = up, clockwise
      const step = (Math.PI * 2) / slots.length;
      const i = Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / step);
      return i % slots.length;
    }

    function drawWheel(slots) {
      const g = wheelCanvas.getContext('2d');
      const w = wheelCanvas.width, c = w / 2;
      g.clearRect(0, 0, w, w);
      const rOuter = 236, rInner = 92;
      const step = (Math.PI * 2) / slots.length;

      for (let i = 0; i < slots.length; i++) {
        const mid = i * step - Math.PI / 2;
        const a0 = mid - step / 2, a1 = mid + step / 2;
        const on = i === wheelPick;
        g.beginPath();
        g.arc(c, c, rOuter, a0 + 0.012, a1 - 0.012);
        g.arc(c, c, rInner, a1 - 0.012, a0 + 0.012, true);
        g.closePath();
        g.fillStyle = on ? 'rgba(233,228,217,0.16)' : 'rgba(10,12,11,0.80)';
        g.fill();
        g.strokeStyle = on ? 'rgba(233,228,217,0.55)' : 'rgba(233,228,217,0.14)';
        g.lineWidth = on ? 2 : 1;
        g.stroke();

        const tx = c + Math.cos(mid) * (rInner + rOuter) / 2;
        const ty = c + Math.sin(mid) * (rInner + rOuter) / 2;
        g.save();
        g.translate(tx, ty);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${on ? '600 ' : ''}17px ui-monospace, monospace`;
        g.fillStyle = slots[i].disabled ? 'rgba(233,228,217,0.3)'
          : on ? '#f2eee3' : 'rgba(233,228,217,0.72)';
        /* Wrap by how wide the wedge actually is at this radius rather than
           by word count: "Relieve yourself" is two words and does not fit,
           "Cast a line" is three and does. */
        const wedgeWidth = 2 * ((rInner + rOuter) / 2) * Math.sin(step / 2) * 0.92;
        const lines = [];
        let line = '';
        for (const word of String(slots[i].label).split(' ')) {
          const next = line ? `${line} ${word}` : word;
          if (line && g.measureText(next).width > wedgeWidth) { lines.push(line); line = word; }
          else line = next;
        }
        if (line) lines.push(line);
        lines.forEach((l, k) => g.fillText(l, 0, (k - (lines.length - 1) / 2) * 19));
        g.restore();
      }

      // The hub says what the stick is doing, and what to press to cancel.
      g.beginPath(); g.arc(c, c, rInner - 6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(6,8,10,0.9)'; g.fill();
      g.strokeStyle = 'rgba(233,228,217,0.18)'; g.lineWidth = 1; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(233,228,217,0.55)';
      g.font = '12px ui-monospace, monospace';
      g.fillText(wheelPick >= 0 ? 'release' : 'aim', c, c - 9);
      g.fillText(wheelPick >= 0 ? 'to do it' : 'the stick', c, c + 9);
      if (rawLeft.mag > 0.15) {
        g.beginPath();
        g.moveTo(c, c);
        g.lineTo(c + rawLeft.x * (rInner - 14), c + rawLeft.y * (rInner - 14));
        g.strokeStyle = 'rgba(233,228,217,0.5)'; g.lineWidth = 2; g.stroke();
      }
    }

    function openWheel() {
      wheelOpen = true;
      wheelPage = 0;
      wheelPick = -1;
      showWheel(true);
      ctx.state.wheelOpen = true;
    }
    function closeWheel(activate) {
      const slots = wheelSlots();
      wheelOpen = false;
      showWheel(false);
      ctx.state.wheelOpen = false;
      /* The wheel is the only thing that locked movement while it was up —
         a sheet cannot be open at the same time — so it is the only thing
         that has to unlock it again. */
      ctx.state.movementLocked = false;
      if (!activate || wheelPick < 0) return;
      const slot = slots[wheelPick];
      if (!slot || slot.disabled) return;
      if (slot.page != null) {
        // A page turn is not a choice; the wheel stays up on the new page.
        wheelPage = slot.page;
        wheelPick = -1;
        wheelOpen = true;
        showWheel(true);
        ctx.state.wheelOpen = true;
        return;
      }
      pad.rumble(0.25, 0.06);
      ctx.state.lastWheelVerb = { label: slot.label, key: slot.key };
      ctx.press(slot.key, { key: slot.key, shiftKey: !!slot.shift, synthetic: true });
    }

    /* ---- navigating a sheet with the stick --------------------------- */

    /* Every full-screen sheet in this game is ordinary DOM with ordinary
       buttons, which is a gift: focus already exists, and all a pad needs is
       a way to move it in a direction and press it. Picking the next element
       by direction rather than by document order is what makes a grid of
       buttons behave the way it looks. */
    function openSheet() {
      const screens = document.querySelectorAll('.screen');
      for (const s of screens) if (!s.hidden) return s;
      return null;
    }
    function focusables(root) {
      return Array.from(root.querySelectorAll('button, [href], input, select, canvas[data-focusable]'))
        .filter((el) => !el.disabled && el.offsetParent !== null);
    }
    function moveFocus(root, dx, dy) {
      const items = focusables(root);
      if (!items.length) return;
      const active = document.activeElement;
      const from = items.includes(active) ? active : null;
      if (!from) { items[0].focus(); scrollIntoView(items[0]); return; }
      const a = from.getBoundingClientRect();
      const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = null, bestScore = Infinity;
      for (const el of items) {
        if (el === from) continue;
        const b = el.getBoundingClientRect();
        const bx = b.left + b.width / 2, by = b.top + b.height / 2;
        const vx = bx - ax, vy = by - ay;
        // Only things genuinely in the pressed direction, and among those the
        // nearest — with movement across the axis counted double so focus
        // walks down a column rather than wandering off across the page.
        const along = vx * dx + vy * dy;
        if (along <= 2) continue;
        const across = Math.abs(vx * dy - vy * dx);
        const score = along + across * 2.2;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) { best.focus(); scrollIntoView(best); }
    }
    function scrollIntoView(el) {
      const sheet = el.closest('.sheet');
      if (!sheet) return;
      const r = el.getBoundingClientRect(), s = sheet.getBoundingClientRect();
      if (r.top < s.top + 8) sheet.scrollTop -= (s.top + 8 - r.top);
      else if (r.bottom > s.bottom - 8) sheet.scrollTop += (r.bottom - (s.bottom - 8));
    }

    /* A stick held over should repeat, like a held arrow key, but not at the
       frame rate. Slow first step, faster after. */
    let navHeld = 0, navAxis = 0;
    function stickNav(dt, root) {
      const x = rawLeft.x + (pad.down('right') ? 1 : 0) - (pad.down('left') ? 1 : 0);
      const y = rawLeft.y + (pad.down('down') ? 1 : 0) - (pad.down('up') ? 1 : 0);
      const mag = Math.hypot(x, y);
      if (mag < 0.5) { navHeld = 0; navAxis = 0; return; }
      const dir = Math.abs(x) > Math.abs(y)
        ? [Math.sign(x), 0] : [0, Math.sign(y)];
      const axis = dir[0] * 2 + dir[1];
      if (axis !== navAxis) { navAxis = axis; navHeld = 0; moveFocus(root, dir[0], dir[1]); return; }
      navHeld += dt;
      const interval = navHeld > 0.55 ? 0.09 : 0.32;
      if (navHeld >= interval) { navHeld = navHeld > 0.55 ? 0.55 : 0; moveFocus(root, dir[0], dir[1]); }
    }

    /* ---- context ------------------------------------------------------ */

    function context() {
      if (openSheet()) return 'ui';
      if (ctx.state.buildMenuOpen) return 'build';
      if (ctx.state.driving) return 'vehicle';
      if (ctx.state.riding) return 'mount';
      if (ctx.state.fishing) return 'fishing';
      return 'foot';
    }

    /* ---- aim slowdown -------------------------------------------------- */

    /* Not aim assist. Nothing is snapped and no shot is bent: what happens is
       that the stick becomes less sensitive while the crosshair is near
       something alive, which is the difference between a controller feeling
       twitchy and a controller feeling precise. The angle is generous at
       close range and tight at distance, so it helps you hold on a deer at
       forty metres without helping you find one at four hundred. */
    function aimSlowdown() {
      if (!opt.aimSlowdown) return 1;
      const near = ctx.world.ecology.near(ctx.player.x, ctx.player.z, 220);
      if (!near.length) return 1;
      const a = ctx.aim();
      let best = 1;
      for (const an of near) {
        if (!an.alive) continue;
        const dx = an.x - a.origin.x, dy = (an.y + an.shoulderHeightM * 0.6) - a.origin.y, dz = an.z - a.origin.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 2 || dist > 220) continue;
        const dot = (dx * a.direction.x + dy * a.direction.y + dz * a.direction.z) / dist;
        if (dot < 0.9) continue;
        const offAxisRad = Math.acos(Math.min(1, dot));
        // Roughly the angle the animal itself subtends, plus a degree.
        const halfAngle = Math.atan2(an.shoulderHeightM * 0.6, dist) + 0.017;
        if (offAxisRad > halfAngle * 2.2) continue;
        const t = 1 - Math.min(1, offAxisRad / (halfAngle * 2.2));
        best = Math.min(best, 1 - 0.55 * t * (ctx.state.aiming ? 1 : 0.6));
      }
      return best;
    }

    /* ---- per-frame ----------------------------------------------------- */

    let announced = false;
    let sprintToggle = false, crouchState = 0, aimToggle = false, buildPick = 0;

    ctx.onUpdate((dt) => {
      readSticks();

      if (!pad.connected) {
        // Nothing plugged in: give every flag back to the keyboard.
        ctx.state.sprintHeld = false;
        ctx.state.crouchHeld = false;
        ctx.state.interactHeld = false;
        ctx.state.triggerHeld = false;
        ctx.state.adsHeld = false;
        ctx.state.driveInput = null;
        if (wheelOpen) closeWheel(false);
        return;
      }
      if (!announced && pad.active) {
        announced = true;
        ctx.log(`${pad.layoutName} controller connected. ${pad.glyph('lb')} holds the wheel; `
          + `${pad.glyph('start')} opens the menu.`, true);
        ctx.emit('pad-connected', { id: pad.id, layout: pad.family });
        pad.rumble(0.4, 0.12);
        writeHelp();
      }

      const where = context();

      /* The wheel sits above every other context except a sheet, because it
         is the way to reach a verb from anywhere. */
      if (where !== 'ui') {
        if (pad.justPressed('lb') && !wheelOpen) openWheel();
        if (wheelOpen) {
          const slots = wheelSlots();
          /* The choice latches. A stick springs back to centre at about the
             same moment the bumper comes up, so a wheel that reads the stick
             at the instant of release loses the choice roughly half the
             time. Pointing at a wedge selects it; only pointing somewhere
             else changes it. */
          const aimedAt = wheelSelection(slots);
          if (aimedAt >= 0) wheelPick = aimedAt;
          drawWheel(slots);
          if (pad.justPressed('b')) { closeWheel(false); return; }
          if (!pad.down('lb')) { closeWheel(true); return; }
          // While the wheel is up the left stick is choosing, not walking.
          game.input.axes.x = 0;
          game.input.axes.y = 0;
          ctx.state.movementLocked = true;
          ctx.state.sprintHeld = false;
          return;
        }
      }

      if (where === 'build') {
        /* The build menu is a HUD panel rather than a sheet, so it gets its
           own handful of buttons: the d-pad walks the seven pieces, A puts
           the selected one down where you are looking, B backs out. The
           right stick still turns you, because you are aiming the piece. */
        if (pad.justPressed('b')) { ctx.press('n'); return; }
        if (pad.justPressed('start')) { ctx.press('n'); ctx.press('escape'); return; }
        if (pad.justPressed('down') || pad.justPressed('right')) {
          buildPick = (buildPick + 1) % 7;
          ctx.press(String(buildPick + 1));
        }
        if (pad.justPressed('up') || pad.justPressed('left')) {
          buildPick = (buildPick + 6) % 7;
          ctx.press(String(buildPick + 1));
        }
        if (pad.justPressed('a')) { ctx.press('enter'); pad.rumble(0.3, 0.08); }
        ctx.state.triggerHeld = false;
        ctx.state.adsHeld = false;
        return;
      }

      if (where === 'ui') {
        const sheet = openSheet();
        stickNav(dt, sheet);
        if (pad.justPressed('a')) {
          const el = document.activeElement;
          if (el && sheet.contains(el) && typeof el.click === 'function') { el.click(); pad.rumble(0.2, 0.05); }
          else { const f = focusables(sheet)[0]; if (f) f.focus(); }
        }
        if (pad.justPressed('b') || pad.justPressed('start')) {
          // Close whatever is open, through the key that opened it.
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }
        if (pad.justPressed('rb')) { const f = focusables(sheet); if (f.length) f[0].focus(); }
        // Nothing on the pad drives the world while a sheet is up.
        ctx.state.triggerHeld = false;
        ctx.state.adsHeld = false;
        ctx.state.interactHeld = false;
        ctx.state.sprintHeld = false;
        ctx.state.driveInput = null;
        return;
      }

      // Shoulder buttons and triggers, shared by every in-world context.
      const rt = pad.value('rt'), lt = pad.value('lt');
      if (opt.holdToAim) {
        ctx.state.adsHeld = lt >= 0.4;
      } else {
        if (pad.justPressed('lt')) aimToggle = !aimToggle;
        ctx.state.adsHeld = aimToggle;
      }
      ctx.state.triggerHeld = rt >= 0.45;
      ctx.state.lookSlowdown = aimSlowdown();
      game.input.lookSensitivity = opt.sensitivity
        * (ctx.state.adsHeld ? 0.55 : 1)          // slower with the sight up
        * ctx.state.lookSlowdown;

      if (where === 'vehicle' || where === 'mount') {
        /* Analogue everything: the triggers are the pedals and the left
           stick is the wheel, which is the entire reason to drive with a pad. */
        ctx.state.driveInput = {
          throttle: rt,
          brake: lt,
          steer: rawLeft.x,
          forward: rawLeft.y < -0.3,
          back: rawLeft.y > 0.3,
          fast: pad.down('ls') || rt > 0.85,
        };
        ctx.state.movementLocked = true;
        if (pad.justPressed('a') && where === 'vehicle') ctx.press('y');
        if (pad.justPressed('b')) ctx.press('q', { key: 'q', shiftKey: true, synthetic: true });
        if (pad.justPressed('start')) ctx.press('escape');
        if (pad.justPressed('up')) ctx.press('n');
        if (pad.justPressed('down')) ctx.press('c');
        if (pad.justPressed('left')) ctx.press('m');
        if (pad.justPressed('right')) ctx.press('tab');
        return;
      }
      ctx.state.driveInput = null;

      if (where === 'fishing') {
        if (pad.justPressed('x') || pad.justPressed('b')) ctx.press('r');
        if (pad.justPressed('y')) ctx.press('b');
        if (pad.justPressed('up')) ctx.press(']');
        if (pad.justPressed('down')) ctx.press('[');
        if (pad.justPressed('start')) ctx.press('escape');
        if (pad.justPressed('left')) ctx.press('m');
        return;
      }

      /* ---- on foot ---- */
      ctx.state.interactHeld = pad.down('x');
      if (pad.justPressed('x')) ctx.press('e');
      if (pad.justPressed('a')) ctx.state.jumpRequested = true;

      // Stance: B cycles standing → crouched → prone → standing.
      if (pad.justPressed('b')) {
        crouchState = (crouchState + 1) % 3;
        ctx.state.crouchHeld = crouchState === 1;
        ctx.state.stance = crouchState === 2 ? 'prone' : null;
        ctx.toast(['standing', 'crouched', 'prone'][crouchState]);
      }

      if (opt.holdToSprint) {
        ctx.state.sprintHeld = pad.down('ls');
      } else {
        if (pad.justPressed('ls')) sprintToggle = !sprintToggle;
        // Letting go of the stick ends a sprint, as it does in every game
        // that has ever had a sprint toggle.
        if (rawLeft.mag < 0.2) sprintToggle = false;
        ctx.state.sprintHeld = sprintToggle;
      }

      if (pad.justPressed('y')) ctx.press('i');           // inspect the weapon
      if (pad.justPressed('rb')) ctx.press('l');          // load
      if (pad.justPressed('rs')) cycleWeapon();
      if (pad.justPressed('up')) ctx.press('n');          // build
      if (pad.justPressed('down')) ctx.press('c');        // condition
      if (pad.justPressed('left')) ctx.press('m');        // map
      if (pad.justPressed('right')) ctx.press('tab');     // inventory
      if (pad.justPressed('start')) ctx.press('escape');
      if (pad.justPressed('back')) {
        const h = document.getElementById('help');
        if (h) h.hidden = !h.hidden;
      }
    });

    /* The key list at the bottom of the screen becomes a button list, in
       this pad's own glyphs. It is rewritten rather than duplicated so that
       there is never a moment where the screen is telling the player about a
       device they are not holding. */
    let keyboardHelp = null;
    function writeHelp() {
      const el = document.getElementById('help');
      if (!el) return;
      if (keyboardHelp == null) keyboardHelp = el.innerHTML;
      const g = (n) => `<b>${pad.glyph(n)}</b>`;
      el.innerHTML = [
        `${g('ls')} move &middot; ${g('rs')} look &middot; ${g('ls')} click sprint &middot; `
          + `${g('a')} jump &middot; ${g('b')} stance &middot; ${g('x')} interact (hold to work)`,
        `${g('rt')} fire &middot; ${g('lt')} aim &middot; ${g('rb')} load &middot; ${g('y')} inspect &middot; `
          + `${g('rs')} click next weapon`,
        `${g('lb')} <b>hold</b> for the wheel &mdash; fire, shelter, water, drink, sleep, fishing`,
        `${g('up')} build &middot; ${g('down')} condition &middot; ${g('left')} map &middot; `
          + `${g('right')} inventory &middot; ${g('start')} menu &middot; ${g('back')} hide this`,
      ].join('<br>');
    }
    function restoreHelp() {
      const el = document.getElementById('help');
      if (el && keyboardHelp != null) el.innerHTML = keyboardHelp;
    }
    // Going back to the keyboard puts the key list back.
    let wasActive = false;
    ctx.onUpdate(() => {
      if (pad.active === wasActive) return;
      wasActive = pad.active;
      if (pad.active) writeHelp(); else restoreHelp();
    });

    /* The weapons module binds one gun per number key; a pad has no number
       keys, so the stick click walks the same list. */
    const GUNS = ['1', '2', '3', '4', '5'];
    let gunIndex = -1;
    function cycleWeapon() {
      gunIndex = (gunIndex + 1) % GUNS.length;
      ctx.press(GUNS[gunIndex]);
    }

    /* ---- rumble ------------------------------------------------------- */

    /* Every one of these is scaled by something the simulation already knows,
       rather than being a fixed buzz per event: a .50 shakes the pad harder
       than a .22 because it really does have eight times the recoil energy. */
    ctx.on('gunshot', (d) => {
      const recoil = d && d.recoil ? d.recoil.energyJ || d.recoil : 12;
      pad.rumble(Math.min(1, 0.22 + recoil / 40), 0.16, { weak: 0.35 });
    });
    ctx.on('chop', () => pad.rumble(0.35, 0.09, { strong: 0.4, weak: 0.15 }));
    ctx.on('vehicle-crash', (d) => {
      const g = (d && d.report && d.report.decelG) || 20;
      pad.rumble(Math.min(1, g / 45), 0.45);
    });
    ctx.on('fish-landed', () => pad.rumble(0.5, 0.3, { weak: 0.7 }));
    ctx.on('death', () => { pad.rumble(1, 1.2, { weak: 1 }); });
    ctx.on('wound-care', () => pad.rumble(0.3, 0.12));

    /* A fish on the line pulls, and how hard it pulls is the number the
       fight is already computing. This is the one place a controller can say
       something a screen cannot. */
    let fightRumble = 0;
    ctx.onUpdate((dt) => {
      if (!pad.connected || !opt.vibration) return;
      const tension = ctx.state.fishTension || 0;
      if (tension > 0.15) {
        fightRumble -= dt;
        if (fightRumble <= 0) {
          fightRumble = 0.12;
          pad.rumble(Math.min(0.9, tension * 0.8), 0.12, { strong: tension * 0.9, weak: 0.2 });
        }
      } else fightRumble = 0;
    });
  },
});
