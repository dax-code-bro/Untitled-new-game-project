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
          { label: 'Pause', key: 'p' },
        ];
      }
      /* A page for the gun in your hands. Working an action, taking the
         safety off, thumbing in one round and stripping it on the bench
         are things a shooter does constantly, so they get their own page
         rather than being buried among the shelter verbs. */
      if (wheelPage === 2 && ctx.state.currentWeapon) {
        const w = ctx.state.currentWeapon;
        return [
          { label: 'Work the action', key: 'z' },
          { label: w.fireMode === 'safe' ? 'Off safe' : `Selector (${w.fireMode})`, key: 'z', shift: true },
          { label: 'Load', key: 'l' },
          { label: 'One round', key: 'l', shift: true },
          { label: 'Clear stoppage', key: 'u', disabled: !w.jammed },
          { label: 'Look it over', key: 'i' },
          { label: 'Strip it', key: 'i', shift: true },
          { label: 'Menu', key: 'escape' },
        ];
      }
      if (wheelPage === 1) {
        return [
          { label: 'Drying rack', key: 'g', shift: true },
          { label: 'Wiring', key: 'x' },
          { label: 'Clear stoppage', key: 'u' },
          { label: 'Load', key: 'l' },
          { label: 'Time ×', key: 't' },
          { label: 'Pause', key: 'p' },
          { label: 'Menu', key: 'escape' },
          ctx.world.mode === 'creative'
            ? { label: ctx.state.creativeFly ? 'Land' : 'Fly', key: 'o' }
            : { label: 'Key list', key: 'h' },
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
        { label: 'Inspect gun', key: 'i' },
      ];
    }

    // Two pages on foot, one everywhere else.
    /* Two pages on foot, three with a gun in your hands, one everywhere
       else. The gun page is an addition: folding it over the utility page
       took wiring off the pad entirely the moment you picked up a rifle. */
    function wheelPages() {
      if (ctx.state.fishing || ctx.state.driving || ctx.state.riding) return 1;
      return ctx.state.currentWeapon ? 3 : 2;
    }

    /* Published so that the check for "is every verb reachable with a pad in
       your hands" can read the real wheel rather than a copy of it that
       would rot the first time a slot changed. */
    ctx.state.wheelProbe = (page) => {
      const was = wheelPage;
      wheelPage = page;
      const out = wheelSlots();
      wheelPage = was;
      return out;
    };

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
      g.fillText(wheelPick >= 0 ? 'release' : 'aim', c, c - 18);
      g.fillText(wheelPick >= 0 ? 'to do it' : 'the stick', c, c);
      if (wheelPages() > 1) {
        g.font = '11px ui-monospace, monospace';
        g.fillStyle = 'rgba(233,228,217,0.42)';
        g.fillText(`${pad.glyph('rb')}  ${wheelPage + 1}/${wheelPages()}`, c, c + 20);
      }
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
      // The death screen first: it sits above everything and is the only
      // thing that matters when it is up.
      const over = document.getElementById('gameover');
      if (over && !over.hidden) return over;
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

    /* A slider is not a thing to walk past. With focus on one, left and
       right move the value — which is what the same two keys do on a
       keyboard — and only up and down leave it. */
    function isSlider(el) {
      return !!(el && el.tagName === 'INPUT' && (el.type === 'range' || el.type === 'number'));
    }
    function nudgeSlider(el, dir) {
      const step = parseFloat(el.step) || ((parseFloat(el.max) - parseFloat(el.min)) / 40) || 1;
      const lo = parseFloat(el.min), hi = parseFloat(el.max);
      const next = Math.min(hi, Math.max(lo, (parseFloat(el.value) || 0) + dir * step));
      if (next === parseFloat(el.value)) return;
      el.value = String(next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
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
      const act = () => {
        const el = document.activeElement;
        if (dir[0] && isSlider(el) && root.contains(el)) { nudgeSlider(el, dir[0]); return; }
        moveFocus(root, dir[0], dir[1]);
      };
      if (axis !== navAxis) { navAxis = axis; navHeld = 0; act(); return; }
      navHeld += dt;
      // A slider repeats faster than focus does, because it takes many
      // steps to cross and only one to change what is focused.
      const slider = isSlider(document.activeElement) && dir[0];
      const interval = navHeld > 0.4 ? (slider ? 0.04 : 0.09) : (slider ? 0.16 : 0.32);
      if (navHeld >= interval) { navHeld = navHeld > 0.4 ? 0.4 : 0; act(); }
    }

    /* The right stick scrolls a sheet that is taller than the window. Focus
       walking already scrolls what it lands on, but a page of prose with no
       controls in it cannot be reached any other way. */
    function stickScroll(dt, root) {
      if (Math.abs(rawRight.y) < 0.2) return;
      const box = root.querySelector('.sheet') || root;
      box.scrollTop += rawRight.y * 900 * dt;
    }

    /* Jump to the first control under the next heading. Every sheet in this
       game is headed prose with controls under it, so a heading is the
       natural unit to page by. */
    function jumpSection(root, dir) {
      const items = focusables(root);
      if (!items.length) return;
      const heads = Array.from(root.querySelectorAll('h2, h3, section'));
      const active = document.activeElement;
      const from = items.includes(active) ? active.getBoundingClientRect().top : -1e9;
      const tops = heads.map((h) => h.getBoundingClientRect().top)
        .filter((t) => (dir > 0 ? t > from + 4 : t < from - 4));
      const target = dir > 0 ? Math.min(...tops) : Math.max(...tops);
      if (!isFinite(target)) { items[dir > 0 ? items.length - 1 : 0].focus(); scrollIntoView(document.activeElement); return; }
      let best = null, bestD = Infinity;
      for (const el of items) {
        const t = el.getBoundingClientRect().top;
        const d = dir > 0 ? t - target : target - t;
        if (d < -4) continue;
        if (d < bestD) { bestD = d; best = el; }
      }
      if (best) { best.focus(); scrollIntoView(best); }
    }

    /* ---- the button legend --------------------------------------------

       A strip along the bottom naming the buttons that do something right
       here, right now. Console games have had one for thirty years because
       it solves the problem a pad has and a keyboard does not: there is
       nowhere to write the verb on the button. It is built from the same
       context the bindings are, so it cannot drift out of step with them. */
    const legend = document.createElement('div');
    legend.id = 'padLegend';
    legend.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:44;pointer-events:none;'
      + 'display:none;justify-content:center;gap:20px;padding:9px 16px;'
      + 'background:linear-gradient(to top, rgba(6,8,10,.86), rgba(6,8,10,0));'
      + 'font:11.5px/1 ui-monospace,SF Mono,Menlo,Consolas,monospace;letter-spacing:.04em;'
      + 'color:rgba(233,228,217,.72);flex-wrap:wrap';
    document.body.appendChild(legend);

    function legendFor(where) {
      const g = (n) => pad.glyph(n);
      if (where === 'ui') {
        if (ctx.state.padSheetCustom) {
          return [[`${g('ls')}`, 'move the cursor'], [g('a'), 'mark'], [g('x'), 'nearest place'],
            [g('y'), 'clear'], [g('b'), 'close']];
        }
        return [[`${g('ls')}`, 'choose'], [g('a'), 'select'],
          [`${g('lb')}/${g('rb')}`, 'section'], [`${g('rs')}`, 'scroll'], [g('b'), 'close']];
      }
      if (where === 'build') {
        return [[`${g('up')}/${g('down')}`, 'piece'], [g('a'), 'place'],
          [`${g('rs')}`, 'aim it'], [g('b'), 'close']];
      }
      if (where === 'vehicle' || where === 'mount') {
        const drive = where === 'vehicle';
        return [[g('rt'), drive ? 'throttle' : 'faster'], [g('lt'), drive ? 'brake' : 'slower'],
          [`${g('ls')}`, 'steer'], [g('a'), drive ? 'engine' : ''],
          [g('b'), drive ? 'get out' : 'dismount'], [`${g('lb')} hold`, 'wheel']].filter((r) => r[1]);
      }
      if (where === 'fishing') {
        return [[g('rt'), 'lean on it'], [g('x'), 'reel in'], [g('y'), 'bait'],
          [`${g('up')}/${g('down')}`, 'depth'], [`${g('lb')} hold`, 'wheel']];
      }
      const t = ctx.state.interactTarget;
      const rows = [];
      if (t && t.act) rows.push([g('x'), t.hold ? `${t.verb} (hold)` : t.verb]);
      // A legend says what the button will do, not what you are already
      // doing: B goes to the next stance round.
      const nextStance = ['crouch', 'go prone', 'stand up'][crouchState];
      rows.push([g('rt'), 'fire'], [g('lt'), 'aim'],
        [`${g('lb')} hold`, 'wheel'], [g('b'), nextStance],
        [g('start'), 'menu']);
      return rows;
    }

    let legendKey = '';
    function drawLegend(where) {
      if (!pad.active || wheelOpen) {
        legend.style.display = 'none';
        document.body.classList.remove('padLegendUp');
        return;
      }
      // Sheets get bottom room so their own last line is not buried by it.
      document.body.classList.add('padLegendUp');
      const rows = legendFor(where);
      const key = `${where}|${rows.map((r) => r.join(':')).join('|')}`;
      // Rebuilding this every frame would be sixty DOM writes a second for
      // something that changes when the player walks up to a tree.
      if (key !== legendKey) {
        legendKey = key;
        legend.innerHTML = rows.map(([btn, label]) =>
          `<span><b style="display:inline-block;min-width:2.1em;text-align:center;`
          + `border:1px solid rgba(233,228,217,.28);border-radius:3px;padding:1px 5px;`
          + `color:#e9e4d9;font-weight:400">${btn}</b> ${label}</span>`).join('');
      }
      legend.style.display = 'flex';
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
      const near = ctx.world.ecology.near(ctx.player.x, ctx.player.z, 160);
      if (!near.length) return 1;
      const a = ctx.aim();
      let best = 1;
      for (const an of near) {
        if (!an.alive) continue;
        const dx = an.x - a.origin.x, dy = (an.y + an.shoulderHeightM * 0.6) - a.origin.y, dz = an.z - a.origin.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 2 || dist > 160) continue;
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
    let lastContext = null;
    let slowdownAge = 0, slowdownTarget = 1, slowdownNow = 1;

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
        legend.style.display = 'none';
        document.body.classList.remove('padLegendUp');
        // The frame loop below scales look sensitivity for aiming and for
        // the slowdown; with no pad here to do that, the mouse gets its own
        // setting back rather than inheriting the last aimed frame's.
        game.input.lookSensitivity = opt.sensitivity;
        ctx.state.lookSlowdown = 1;
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
      drawLegend(where);

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
          // The other bumper turns the page without spending a wedge on it.
          if (pad.justPressed('rb') && wheelPages() > 1) { wheelPage = (wheelPage + 1) % wheelPages(); wheelPick = -1; }
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
        /* A sheet that drives its own sticks — the map moves a cursor with
           them — says so, and this keeps its hands off. B still closes it,
           because backing out has to work the same way everywhere. */
        if (ctx.state.padSheetCustom) {
          if (pad.justPressed('b') || pad.justPressed('start')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          }
          ctx.state.triggerHeld = false;
          ctx.state.adsHeld = false;
          ctx.state.interactHeld = false;
          ctx.state.sprintHeld = false;
          ctx.state.driveInput = null;
          return;
        }
        stickNav(dt, sheet);
        stickScroll(dt, sheet);
        if (pad.justPressed('a')) {
          const el = document.activeElement;
          if (el && sheet.contains(el) && typeof el.click === 'function') { el.click(); pad.rumble(0.2, 0.05); }
          else { const f = focusables(sheet)[0]; if (f) f.focus(); }
        }
        if (pad.justPressed('b') || pad.justPressed('start')) {
          // Close whatever is open, through the key that opened it.
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        }
        // The bumpers jump a section at a time, which is how you cross a
        // long sheet without walking every control on the way.
        if (pad.justPressed('rb')) jumpSection(sheet, 1);
        if (pad.justPressed('lb')) jumpSection(sheet, -1);
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
      if (where !== lastContext) { aimToggle = false; lastContext = where; }
      if (opt.holdToAim) {
        ctx.state.adsHeld = lt >= 0.4;
      } else {
        if (pad.justPressed('lt')) aimToggle = !aimToggle;
        ctx.state.adsHeld = aimToggle;
      }
      ctx.state.triggerHeld = rt >= 0.45;
      slowdownAge += dt;
      if (slowdownAge > 0.06) { slowdownAge = 0; slowdownTarget = aimSlowdown(); }
      // Eased rather than stepped, so crossing an animal feels like weight
      // on the stick instead of the sensitivity changing gear.
      slowdownNow += (slowdownTarget - slowdownNow) * Math.min(1, dt * 12);
      ctx.state.lookSlowdown = slowdownNow;
      game.input.lookSensitivity = opt.sensitivity
        * (ctx.state.adsHeld ? 0.55 : 1)          // slower with the sight up
        * slowdownNow;

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
        // A flag set while walking must not still be set while driving: a
        // held interact button, a crouch, a stance you cannot be in behind
        // a wheel.
        ctx.state.interactHeld = false;
        ctx.state.sprintHeld = false;
        ctx.state.crouchHeld = false;
        if (ctx.state.stance === 'prone') ctx.state.stance = null;
        crouchState = 0;
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
        ctx.state.interactHeld = false;
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
        ctx.toast(['Standing.', 'Crouched.', 'Prone.'][crouchState]);
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
      // Nobody sprints with the sights up, and a stance you cannot run in
      // is a stance you cannot run in.
      if (ctx.state.adsHeld || crouchState === 2) ctx.state.sprintHeld = false;

      if (pad.justPressed('y')) ctx.press('i');           // inspect the weapon
      /* The right bumper is whatever the gun in your hands needs next.
         On a bolt gun, a pump or a lever that is working the action —
         it happens between every single shot, and a wheel spin between
         shots is not a control scheme. With nothing to cycle it loads.
         The left bumper already opens the wheel and cannot be shared. */
      if (pad.justPressed('rb')) {
        const w = ctx.state.currentWeapon;
        const act = w && w.spec ? w.spec.action : null;
        const manual = act === 'boltAction' || act === 'pump' || act === 'leverAction'
          || act === 'revolver';
        if (manual && (w.chambered || w.magazine.length || w.roundsFired)) ctx.press('z');
        else ctx.press('l');
      }
      if (pad.justPressed('rs')) cycleWeapon();
      if (pad.justPressed('up')) ctx.press('n');          // build
      if (pad.justPressed('down')) ctx.press('c');        // condition
      if (pad.justPressed('left')) ctx.press('m');        // map
      if (pad.justPressed('right')) ctx.press('tab');     // inventory
      if (pad.justPressed('start')) ctx.press('escape');
      if (pad.justPressed('back')) ctx.press('h');
    }, { whilePaused: true });

    /* The key list at the bottom of the screen becomes a button list, in
       this pad's own glyphs. It is rewritten rather than duplicated so that
       there is never a moment where the screen is telling the player about a
       device they are not holding. */
    let keyboardHelp = null;
    function writeHelp() {
      const el = document.getElementById('help');
      if (!el) return;
      if (keyboardHelp == null) keyboardHelp = el.innerHTML;
      // The legend strip lives along the very bottom, so the full list sits
      // above it rather than through it.
      el.style.bottom = '46px';
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
      if (!el) return;
      if (keyboardHelp != null) el.innerHTML = keyboardHelp;
      el.style.bottom = '';
    }
    // Going back to the keyboard puts the key list back.
    let wasActive = false;
    ctx.onUpdate(() => {
      if (pad.active === wasActive) return;
      wasActive = pad.active;
      if (pad.active) writeHelp(); else restoreHelp();
    }, { whilePaused: true });

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
