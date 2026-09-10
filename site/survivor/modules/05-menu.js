/* The front of house: one sheet on Escape that pauses the game and holds
   everything that is about the game rather than in it — what the mode means,
   how it looks and sounds, the seed to share, and the save.

   Two things here are deliberately blunt rather than clever. Loading does not
   happen in place: the island in front of the player was built at boot from
   the seed and the scene is hung off it, so a load reloads the page with the
   same query the save was made under and replays the record onto the freshly
   generated island. And the sheet only ever writes the record the world hands
   it — World.serialize() — because a save that was assembled by the menu would
   drift from the simulation the first time either changed.

   Emits:
     menu:open   {}                       the sheet opened; close your panels
     menu:close  {}
     audio:mute  { muted, volume }        master audio changed
     settings    { quality, fovDeg, sensitivity, muted, volume, autosave }
     restored    { day, savedAt }         a save was replayed onto this world

   Writes to ctx.state:
     creativeFly, creativeBuild           creative only, for others to honour
     movementLocked                       only while the sheet is open
*/
(function () {
  'use strict';

  const SETTINGS_KEY = 'survivor.settings';
  const SAVE_PREFIX = 'survivor.save.';
  const AUTOSAVE_SECONDS = 300;

  /* The engine's look constants, read out of _bindCameraInput. Sensitivity is
     not a setting the engine has, so the slider works by adding the missing
     fraction of the same rotation on top of what the engine already applied. */
  const ENGINE_YAW_PER_PX = 0.006;
  const ENGINE_PITCH_PER_PX = 0.005;
  const PITCH_MIN = -1.35, PITCH_MAX = 1.4;

  const DEFAULTS = {
    quality: null,          // null = leave the engine's own detection alone
    fovDeg: 62,
    sensitivity: 1,
    muted: false,
    volume: 0.5,
    autosave: false,
  };

  let C = null;                 // the ctx, kept for the DOM handlers
  let settings = Object.assign({}, DEFAULTS);
  let overlay = null, sheet = null;
  let open = false, wasPaused = false, wasLocked = false;
  let flyApplied = false;
  let autosaveClock = 0;
  let lastSaveNote = '';
  let coreCallsUpdate = false;

  /* ---------------- storage, which is allowed to be absent ---------------- */

  /* Private browsing throws on the property access itself in some builds, so
     even reaching for localStorage has to be guarded. */
  function storage() {
    try { return window.localStorage || null; } catch (err) { return null; }
  }

  function readJson(key) {
    const ls = storage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  function writeJson(key, value) {
    const ls = storage();
    if (!ls) return { ok: false, reason: 'this browser is not keeping anything' };
    try {
      const text = JSON.stringify(value);
      ls.setItem(key, text);
      return { ok: true, bytes: text.length };
    } catch (err) {
      const full = err && (err.name === 'QuotaExceededError' || err.code === 22);
      return { ok: false, reason: full ? 'no room left in local storage' : 'storage refused the write' };
    }
  }

  function saveKey(seed) { return SAVE_PREFIX + seed; }

  function listSaves() {
    const ls = storage();
    const out = [];
    if (!ls) return out;
    try {
      // Each record has to be parsed to read its day and date, so the listing
      // is capped rather than made to chew through every island ever played.
      for (let i = 0; i < ls.length && out.length < 12; i++) {
        const k = ls.key(i);
        if (!k || k.indexOf(SAVE_PREFIX) !== 0) continue;
        const rec = readJson(k);
        if (rec && rec.world) {
          out.push({ key: k, seed: rec.world.seed, day: rec.day || 1, savedAt: rec.savedAt, record: rec });
        }
      }
    } catch (err) { /* a storage that will not enumerate simply has no saves */ }
    out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    return out;
  }

  /* ---------------- settings ---------------- */

  function loadSettings() {
    const stored = readJson(SETTINGS_KEY);
    if (stored && typeof stored === 'object') {
      for (const k of Object.keys(DEFAULTS)) {
        if (stored[k] != null) settings[k] = stored[k];
      }
    }
    settings.fovDeg = num(settings.fovDeg, DEFAULTS.fovDeg, 55, 110);
    settings.sensitivity = num(settings.sensitivity, 1, 0.35, 2.5);
    settings.volume = num(settings.volume, DEFAULTS.volume, 0, 1);
    settings.muted = !!settings.muted;
    settings.autosave = !!settings.autosave;
  }

  // A settings file someone has edited by hand, or one written by an older
  // build, must not be able to hand the camera a NaN field of view.
  function num(value, fallback, lo, hi) {
    const v = Number(value);
    return C.LE.clamp(isFinite(v) ? v : fallback, lo, hi);
  }

  function persistSettings() {
    writeJson(SETTINGS_KEY, settings);
    C.emit('settings', Object.assign({}, settings));
  }

  function applyQuality(name) {
    const game = C.game;
    if (!name || typeof game.setGraphicsQuality !== 'function') return;
    try { game.setGraphicsQuality(name); } catch (err) { C.log('That quality tier was refused.'); }
  }

  function qualityTiers() {
    const listed = C.game.graphicsQualityOptions;
    if (Array.isArray(listed) && listed.length) return listed;
    // A stripped build without the getter still answers to the four names the
    // renderer has always had.
    return [{ key: 'low', label: 'Low' }, { key: 'medium', label: 'Balanced' },
      { key: 'high', label: 'High' }, { key: 'ultra', label: 'Ultra' }];
  }

  function currentQuality() {
    return settings.quality || C.game.graphicsQuality || null;
  }

  function applyFov() {
    // Camera.fov is radians and the camera rebuilds its projection every frame,
    // so writing it is enough — no resize, no reload.
    try { C.game.camera.fov = settings.fovDeg * Math.PI / 180; } catch (err) { /* no camera yet */ }
  }

  function applyAudio() {
    const audio = C.game.audio;
    if (!audio) return;
    try {
      audio.enabled = !settings.muted;
      const level = settings.muted ? 0 : settings.volume;
      if (typeof audio.setVolume === 'function') audio.setVolume(level);
      else audio.volume = level;
    } catch (err) { /* an engine built without audio is not an error */ }
    C.emit('audio:mute', { muted: !!settings.muted, volume: settings.volume });
  }

  /* ---------------- mouse sensitivity ---------------- */

  /* The engine turns the camera itself on a canvas drag with fixed constants.
     Rather than fight it, this tracks the same drag and adds the difference
     between the player's sensitivity and the engine's, so 1.0 costs nothing
     and every other value lands where the player expects. */
  function bindSensitivity() {
    const canvas = C.game.canvas;
    if (!canvas) return;
    let dragging = false, lastX = 0, lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const extra = settings.sensitivity - 1;
      if (open || !extra) return;
      try {
        const game = C.game;
        game._camYaw -= dx * ENGINE_YAW_PER_PX * extra;
        game._camPitch = C.LE.clamp(game._camPitch + dy * ENGINE_PITCH_PER_PX * extra, PITCH_MIN, PITCH_MAX);
      } catch (err) { dragging = false; }
    });
  }

  /* ---------------- saving ---------------- */

  /* The island is rebuilt from the seed on load, so the save has to carry the
     options it was generated under as well. Restoring a record onto a
     differently sized island would put every corpse and every remembered
     position somewhere else on a map that looks the same. */
  function currentQuery() {
    const out = {};
    try {
      const q = new URLSearchParams(location.search);
      q.forEach((v, k) => { if (k !== 'save') out[k] = v; });
    } catch (err) { /* no search string is a valid search string */ }
    out.seed = String(C.world.seed);
    out.mode = C.world.mode;
    return out;
  }

  function bootUrl(query, withSave) {
    const q = new URLSearchParams(query || {});
    if (withSave) q.set('save', '1');
    else q.delete('save');
    const base = String(location.href).split('#')[0].split('?')[0];
    return base + '?' + q.toString();
  }

  function doSave() {
    const w = C.world;
    let record;
    try {
      record = {
        format: 1,
        savedAt: new Date().toISOString(),
        day: w.clock.totalDays + 1,
        hourOfDay: w.clock.hourOfDay,
        query: currentQuery(),
        world: w.serialize(),
      };
    } catch (err) {
      C.log('The world would not serialise; nothing was saved.', true);
      C.toast('Save failed');
      return false;
    }
    const res = writeJson(saveKey(w.seed), record);
    if (!res.ok) {
      lastSaveNote = 'the last attempt failed: ' + res.reason;
      C.log(`Could not save: ${res.reason}.`, true);
      C.toast('Save failed');
      return false;
    }
    lastSaveNote = `day ${record.day}, ${(res.bytes / 1024).toFixed(1)} kB`;
    C.log(`Saved seed ${w.seed} on day ${record.day}.`, true);
    C.toast('Saved');
    return true;
  }

  function deleteSave(key) {
    const ls = storage();
    if (!ls) return;
    try { ls.removeItem(key); C.toast('Save deleted'); } catch (err) { C.toast('Could not delete'); }
  }

  function askedForRestore() {
    try { return new URLSearchParams(location.search).get('save') === '1'; } catch (err) { return false; }
  }

  /* What can honestly be put back onto a world that has already been built:
     the clock, the dead, and the player. This is the same set World.restore
     applies after its own generate(), less the island itself, which is already
     standing outside. */
  function applyRestore(record) {
    const w = C.world, SV = C.SV;
    const data = record && record.world;
    if (!data) return null;
    if (data.seed !== w.seed) {
      C.log(`That save is for seed ${data.seed}, not ${w.seed}. Nothing restored.`, true);
      return null;
    }

    if (data.clock) w.clock.restore(data.clock);
    w.deadAccounts = new Set(data.deadAccounts || []);
    w.corpses = data.corpses || [];
    w.log = data.log || [];

    const players = data.players || [];
    const rec = players.filter((p) => p.id === 'local')[0] || players[0];
    if (rec) {
      const p = C.player;
      if (rec.body) Object.assign(p.body, rec.body);
      if (rec.disease && SV.DiseaseSystem) {
        p.disease = SV.DiseaseSystem.deserialize(rec.disease, { rng: w.rng });
      }
      if (rec.skills) p.skills = rec.skills;
      if (rec.knowledge) p.knowledge = rec.knowledge;
      p.deaths = rec.deaths || 0;
      if (rec.inventory) p.inventory.slots = rec.inventory;

      // Never below the ground the island generated this time: a metre of
      // rounding in the heightmap would otherwise drop the player inside a hill.
      const floor = C.groundY(rec.x, rec.z) + 1.2;
      const y = Math.max(rec.y || floor, floor);
      C.avatar.setPosition([rec.x, y, rec.z]);
      C.avatar.setVelocity([0, 0, 0]);
      p.x = rec.x; p.y = y; p.z = rec.z;
    }
    return record;
  }

  /* ---------------- the sheet ---------------- */

  const CSS = `
    #menuScreen .sheet { width: min(760px, 94vw); }
    #menuScreen section { margin: 0 0 20px; }
    #menuScreen .kv { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
    #menuScreen .kv b { font-weight: 400; font-variant-numeric: tabular-nums; }
    #menuScreen .ctl { display: grid; grid-template-columns: 110px 1fr 62px; gap: 10px; align-items: center; margin: 6px 0; }
    #menuScreen input[type=range] { width: 100%; accent-color: #7fa05a; background: transparent; }
    #menuScreen .val { text-align: right; font-variant-numeric: tabular-nums; }
    #menuScreen .note { font-size: 11px; line-height: 1.7; margin: 6px 0 0; }
    #menuScreen code { word-break: break-all; font-size: 11px; }
    #menuScreen .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 4px; }
    #menuScreen .padH3 { margin: 16px 0 6px; font: 400 12px/1.2 inherit; letter-spacing: .1em; color: var(--dim); }
    #menuScreen .padMap { border-collapse: collapse; width: 100%; font-size: 11.5px; }
    #menuScreen .padMap td { padding: 4px 12px 4px 0; vertical-align: top; }
    /* The glyph column is fixed and centred so a row of ✕ ○ □ △ lines up
       with a row of A B X Y, whatever the pad calls its buttons. */
    #menuScreen .padMap td:first-child {
      width: 118px; color: var(--ink); text-align: center; white-space: nowrap;
      border: 1px solid var(--edge); border-radius: 3px; padding: 3px 8px;
    }
    #menuScreen .padMap tr + tr td { margin-top: 4px; }
    #menuScreen .padMap tr td:last-child { color: var(--dim); padding-left: 12px; }
  `;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function ensureScreen() {
    if (overlay) return overlay;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'menuScreen';
    overlay.className = 'screen';
    overlay.dataset.menu = '1';
    overlay.hidden = true;
    sheet = document.createElement('div');
    sheet.className = 'sheet';
    overlay.appendChild(sheet);
    // Outside #hud on purpose: the HUD layer takes no pointer events and sits
    // in its own stacking context below the toast and the death screen.
    document.body.appendChild(overlay);

    overlay.addEventListener('click', onSheetClick);
    // A click on the darkened background is a click on nothing, and everyone
    // expects it to close the menu.
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeMenu(); });
    return overlay;
  }

  function kv(k, v, cls) {
    return `<div class="kv"><span class="k">${esc(k)}</span><b class="${cls || ''}">${esc(v)}</b></div>`;
  }

  function modeSection() {
    const w = C.world;
    if (w.mode === 'multiplayer') {
      return `<section>
        <h2>multiplayer</h2>
        <p class="note badText">One life. When this character dies the account rejoins as a
        spectator and cannot play in this world again. The body stays where it fell with
        everything that was on it, for anyone who finds it.</p>
        <p class="note faint">Dead accounts so far: ${esc(w.deadAccounts ? w.deadAccounts.size : 0)}.</p>
      </section>`;
    }
    if (w.mode === 'creative') {
      const fly = C.state.creativeFly ? ' on' : '';
      const build = C.state.creativeBuild ? ' on' : '';
      return `<section>
        <h2>creative</h2>
        <div>
          <button class="btn${fly}" data-act="fly">Fly ${C.state.creativeFly ? 'on' : 'off'}</button>
          <button class="btn${build}" data-act="build">Instant build ${C.state.creativeBuild ? 'on' : 'off'}</button>
        </div>
        <p class="note muted">Flying cuts gravity on your own body: space rises, ctrl falls,
        shift is faster. Instant build only sets a flag; construction honours it by skipping
        the material and time costs, and modules that do not know about it carry on as normal.</p>
        <p class="note faint">Press <b>V</b> to toggle flight without opening this sheet.</p>
      </section>`;
    }
    return `<section>
      <h2>singleplayer</h2>
      <p class="note muted">You can die as often as you like. Death drops your pack where you
      fell${w.keepInventory ? ', except this world was started with keep-inventory, so it comes with you' : ''};
      your skills and everything you have worked out about the island survive either way.</p>
    </section>`;
  }

  function saveSection() {
    const w = C.world;
    const mine = readJson(saveKey(w.seed));
    const others = listSaves().filter((s) => String(s.seed) !== String(w.seed)).slice(0, 6);
    const when = mine && mine.savedAt ? new Date(mine.savedAt).toLocaleString() : null;

    let body = `<div>
        <button class="btn" data-act="save">Save this island</button>
        ${mine ? '<button class="btn" data-act="load">Reload and restore</button>' : ''}
        ${mine ? '<button class="btn" data-act="delete">Delete save</button>' : ''}
      </div>`;

    body += mine
      ? `<p class="note muted">Saved ${esc(when)} on day ${esc(mine.day)}.
         ${lastSaveNote ? esc('(' + lastSaveNote + ')') : ''}</p>`
      : `<p class="note faint">Nothing saved for seed ${esc(w.seed)} yet.${
        storage() ? '' : ' This browser is refusing local storage, so saving is off.'}</p>`;

    body += `<p class="note warnText">Loading cannot happen where you are standing. The island
      in front of you is already built, so a load reloads the page, generates seed ${esc(w.seed)}
      again from the options it was saved under, and replays the record onto it: the clock, the
      weather, your body, your skills, your pack and everyone who has died. Anything a module
      built and did not hand to the world is not in the record and does not come back.
      The address bar keeps <code>save=1</code> afterwards, so a refresh replays the same
      record again; take it out to start this seed clean.</p>`;

    if (others.length) {
      body += '<p class="note faint">Other islands you have saved:</p><div>' + others.map((s) => (
        `<button class="btn" data-act="loadOther" data-key="${esc(s.key)}">seed ${esc(s.seed)} &middot; day ${esc(s.day)}</button>`
      )).join('') + '</div>';
    }

    return `<section><h2>save</h2>${body}</section>`;
  }

  function render() {
    const w = C.world, clock = w.clock;
    const hh = Math.floor(clock.hourOfDay);
    const mm = Math.floor((clock.hourOfDay - hh) * 60);
    const tiers = qualityTiers();
    const active = currentQuality();
    const share = bootUrl({ seed: String(w.seed), mode: w.mode }, false);

    let places = '';
    try {
      const d = w.describe();
      places = `${d.sizeKm} km across, ${d.pois.length} places, ${d.animals} animals`;
    } catch (err) { places = '—'; }

    sheet.innerHTML = `
      <h1>Paused</h1>
      <p class="lede">${C.game.input.pad.active ? `${C.game.input.pad.glyph('b')} closes this` : 'Escape closes this'} and starts the clock again.</p>

      <section>
        <h2>this island</h2>
        ${kv('seed', w.seed)}
        ${kv('mode', w.mode)}
        ${kv('day', `${clock.totalDays + 1} at ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)}
        ${kv('season', clock.season)}
        ${kv('island', places)}
        ${kv('you are at', `${Math.round(C.player.x)}, ${Math.round(C.player.z)}`)}
        <p class="note faint">Anyone who opens this link lands on the same island:</p>
        <p class="note"><code>${esc(share)}</code></p>
        <button class="btn" data-act="copy">Copy link</button>
      </section>

      <section>
        <h2>graphics</h2>
        <div>${tiers.map((t) => (
          `<button class="btn${t.key === active ? ' on' : ''}" data-act="quality" data-key="${esc(t.key)}">${
            esc(t.label || t.key)}${t.fps ? ` <span class="faint">${esc(t.fps)}</span>` : ''}</button>`
        )).join('')}</div>
        <div class="ctl">
          <span class="k">field of view</span>
          <input type="range" id="menuFov" min="55" max="110" step="1" value="${esc(settings.fovDeg)}">
          <span class="val" id="menuFovVal">${esc(Math.round(settings.fovDeg))}&deg;</span>
        </div>
        <div class="ctl">
          <span class="k">mouse look</span>
          <input type="range" id="menuSens" min="0.35" max="2.5" step="0.05" value="${esc(settings.sensitivity)}">
          <span class="val" id="menuSensVal">${esc(settings.sensitivity.toFixed(2))}&times;</span>
        </div>
        <p class="note faint">Quality changes take effect immediately; the ultra tier will chase
        a 4K buffer if the display has one.</p>
      </section>

      ${controllerSection()}

      <section>
        <h2>audio</h2>
        <div>
          <button class="btn${settings.muted ? ' on' : ''}" data-act="mute">${settings.muted ? 'Muted' : 'Mute all'}</button>
        </div>
        <div class="ctl">
          <span class="k">master</span>
          <input type="range" id="menuVol" min="0" max="1" step="0.05" value="${esc(settings.volume)}"${settings.muted ? ' disabled' : ''}>
          <span class="val" id="menuVolVal">${esc(Math.round(settings.volume * 100))}</span>
        </div>
      </section>

      ${modeSection()}
      ${saveSection()}

      <section>
        <h2>other</h2>
        <button class="btn${settings.autosave ? ' on' : ''}" data-act="autosave">Autosave every 5 min ${settings.autosave ? 'on' : 'off'}</button>
        <p class="note faint">P pauses without this sheet &middot; T runs time faster &middot; H hides the key list.</p>
      </section>

      <div class="foot">
        <span class="faint">Settings are kept in this browser, per device.</span>
        <button class="btn" data-act="close">Close</button>
      </div>`;

    wireSliders();
  }

  /* Controller settings. The section only appears once a pad has been seen,
     because a page of stick options is noise to somebody playing on a
     keyboard, and it names the pad it found so there is no doubt which
     device the settings are about. */
  function controllerSection() {
    const pad = C.game && C.game.input && C.game.input.pad;
    const o = C.state.gamepadOptions;
    if (!pad || !o || !pad.connected) {
      return `<section>
        <h2>controller</h2>
        <p class="note faint">No controller found. Plug one in, or wake a wireless one with a
        button press, and this page fills in with its own buttons and settings.</p>
      </section>`;
    }
    const g = (n) => esc(pad.glyph(n));
    const toggle = (act, on, label) =>
      `<button class="btn${on ? ' on' : ''}" data-act="${act}">${esc(label)}</button>`;
    return `<section>
      <h2>controller</h2>
      <p class="note faint">${esc(pad.layoutName)} layout &middot; <span class="faint">${esc(pad.id || 'gamepad')}</span></p>
      <div class="ctl">
        <span class="k">look speed</span>
        <input type="range" id="padSens" min="1.2" max="8" step="0.1" value="${esc(o.sensitivity)}">
        <span class="val" id="padSensVal">${esc(o.sensitivity.toFixed(1))}</span>
      </div>
      <div class="ctl">
        <span class="k">dead zone</span>
        <input type="range" id="padDz" min="0.02" max="0.4" step="0.01" value="${esc(o.deadzone)}">
        <span class="val" id="padDzVal">${esc(Math.round(o.deadzone * 100))}%</span>
      </div>
      <div class="ctl">
        <span class="k">look curve</span>
        <input type="range" id="padCurve" min="1" max="4" step="0.1" value="${esc(o.lookCurve)}">
        <span class="val" id="padCurveVal">${esc(o.lookCurve.toFixed(1))}</span>
      </div>
      <div>
        ${toggle('padInvert', o.invertY, `Invert Y ${o.invertY ? 'on' : 'off'}`)}
        ${toggle('padSouthpaw', o.southpaw, `Southpaw ${o.southpaw ? 'on' : 'off'}`)}
        ${toggle('padVibe', o.vibration, `Vibration ${o.vibration ? 'on' : 'off'}`)}
        ${toggle('padAim', o.aimSlowdown, `Aim slowdown ${o.aimSlowdown ? 'on' : 'off'}`)}
        ${toggle('padHoldAim', o.holdToAim, o.holdToAim ? 'Hold to aim' : 'Toggle aim')}
        ${toggle('padHoldSprint', o.holdToSprint, o.holdToSprint ? 'Hold to sprint' : 'Toggle sprint')}
      </div>
      <p class="note faint">Aim slowdown makes the stick less sensitive near an animal. It never
      moves your aim for you and never bends a shot &mdash; the ballistics are the same
      whichever device is holding the gun.</p>
      <h3 class="padH3">what the buttons do</h3>
      <table class="padMap">
        <tr><td>${g('lb')} hold</td><td>the wheel &mdash; fire, shelter, water, drink, sleep and the rest</td></tr>
        <tr><td>${g('rt')} / ${g('lt')}</td><td>fire / aim &mdash; and throttle / brake in a vehicle</td></tr>
        <tr><td>${g('a')}</td><td>jump &mdash; start the engine in a vehicle</td></tr>
        <tr><td>${g('b')}</td><td>stand, crouch, prone &mdash; get out, or back out of a screen</td></tr>
        <tr><td>${g('x')}</td><td>interact, held for work</td></tr>
        <tr><td>${g('y')}</td><td>inspect the weapon &mdash; change bait while fishing</td></tr>
        <tr><td>${g('rb')} / ${g('rs')}</td><td>load / next weapon</td></tr>
        <tr><td>${g('ls')}</td><td>sprint</td></tr>
        <tr><td>${g('up')} ${g('down')} ${g('left')} ${g('right')}</td><td>build &middot; condition &middot; map &middot; inventory</td></tr>
        <tr><td>${g('start')} / ${g('back')}</td><td>this menu / the key list</td></tr>
      </table>
    </section>`;
  }

  function wireSliders() {
    const fov = sheet.querySelector('#menuFov');
    if (fov) {
      fov.addEventListener('input', () => {
        settings.fovDeg = num(fov.value, DEFAULTS.fovDeg, 55, 110);
        const out = sheet.querySelector('#menuFovVal');
        if (out) out.innerHTML = `${Math.round(settings.fovDeg)}&deg;`;
        applyFov();
      });
      fov.addEventListener('change', persistSettings);
    }

    const sens = sheet.querySelector('#menuSens');
    if (sens) {
      sens.addEventListener('input', () => {
        settings.sensitivity = num(sens.value, 1, 0.35, 2.5);
        const out = sheet.querySelector('#menuSensVal');
        if (out) out.innerHTML = `${settings.sensitivity.toFixed(2)}&times;`;
      });
      sens.addEventListener('change', persistSettings);
    }

    const padOpts = C.state.gamepadOptions;
    const padSlider = (id, key, lo, hi, fmt) => {
      const el = sheet.querySelector(`#${id}`);
      if (!el || !padOpts) return;
      el.addEventListener('input', () => {
        padOpts[key] = num(el.value, padOpts[key], lo, hi);
        const out = sheet.querySelector(`#${id}Val`);
        if (out) out.textContent = fmt(padOpts[key]);
        if (C.state.gamepadApply) C.state.gamepadApply();
      });
    };
    padSlider('padSens', 'sensitivity', 1.2, 8, (v) => v.toFixed(1));
    padSlider('padDz', 'deadzone', 0.02, 0.4, (v) => `${Math.round(v * 100)}%`);
    padSlider('padCurve', 'lookCurve', 1, 4, (v) => v.toFixed(1));

    const vol = sheet.querySelector('#menuVol');
    if (vol) {
      vol.addEventListener('input', () => {
        settings.volume = num(vol.value, DEFAULTS.volume, 0, 1);
        const out = sheet.querySelector('#menuVolVal');
        if (out) out.textContent = String(Math.round(settings.volume * 100));
        applyAudio();
      });
      vol.addEventListener('change', persistSettings);
    }
  }

  function onSheetClick(ev) {
    const btn = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const key = btn.getAttribute('data-key');
    try {
      if (act === 'close') { closeMenu(); return; }

      if (act === 'quality') {
        settings.quality = key;
        applyQuality(key);
        persistSettings();
      } else if (act === 'mute') {
        settings.muted = !settings.muted;
        applyAudio();
        persistSettings();
      } else if (act === 'autosave') {
        settings.autosave = !settings.autosave;
        autosaveClock = 0;
        persistSettings();
      } else if (act.startsWith('pad')) {
        const o = C.state.gamepadOptions;
        const field = { padInvert: 'invertY', padSouthpaw: 'southpaw', padVibe: 'vibration',
          padAim: 'aimSlowdown', padHoldAim: 'holdToAim', padHoldSprint: 'holdToSprint' }[act];
        if (o && field) {
          o[field] = !o[field];
          if (C.state.gamepadApply) C.state.gamepadApply();
          // A short buzz on the way in confirms vibration is really on.
          if (field === 'vibration' && o.vibration) C.game.input.pad.rumble(0.5, 0.15);
        }
      } else if (act === 'fly') {
        setCreative('creativeFly', !C.state.creativeFly);
      } else if (act === 'build') {
        setCreative('creativeBuild', !C.state.creativeBuild);
      } else if (act === 'copy') {
        copyLink(bootUrl({ seed: String(C.world.seed), mode: C.world.mode }, false));
      } else if (act === 'save') {
        doSave();
      } else if (act === 'delete') {
        deleteSave(saveKey(C.world.seed));
      } else if (act === 'load') {
        goToSave(readJson(saveKey(C.world.seed)));
        return;
      } else if (act === 'loadOther') {
        goToSave(readJson(key));
        return;
      }
      render();
    } catch (err) {
      C.log(`The menu could not do that (${act}).`);
    }
  }

  function copyLink(url) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          () => C.toast('Link copied'),
          () => C.toast('Copy it from the sheet'),
        );
        return;
      }
    } catch (err) { /* fall through to the honest answer */ }
    C.toast('Copy it from the sheet');
  }

  function goToSave(record) {
    if (!record || !record.world) { C.toast('That save has gone'); return; }
    // Leaving the page mid-frame is fine; nothing here owns anything the
    // browser will not reclaim.
    location.assign(bootUrl(record.query || { seed: String(record.world.seed) }, true));
  }

  function setCreative(flag, value) {
    if (C.world.mode !== 'creative') { C.toast('Creative only'); return; }
    C.state[flag] = !!value;
    if (flag === 'creativeFly') {
      C.toast(value ? 'Flight on — space up, ctrl down' : 'Flight off');
    } else {
      C.toast(value ? 'Instant build on' : 'Instant build off');
    }
  }

  /* ---------------- opening and closing ---------------- */

  function openMenu() {
    if (open) return;
    ensureScreen();
    open = true;
    wasPaused = C.paused;
    wasLocked = !!C.state.movementLocked;
    C.setPaused(true);
    C.state.movementLocked = true;
    overlay.hidden = false;
    render();
    C.emit('menu:open', {});
  }

  function closeMenu() {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    // Whatever else had the player pinned when the sheet opened keeps it.
    C.setPaused(wasPaused);
    C.state.movementLocked = wasLocked;
    C.emit('menu:close', {});
  }

  /* While the sheet is open the world's keys belong to it. Only keydown is
     swallowed: the engine's input tracks keyup on the same window, and eating
     those would leave a key stuck down for the rest of the session. */
  function onKeyCapture(e) {
    if (!open) return;
    const k = String(e.key || '').toLowerCase();
    if (k.indexOf('arrow') === 0 || k === 'tab') return;   // sliders and focus
    if (k === 'escape' || k === 'p') closeMenu();
    e.stopPropagation();
  }

  /* ---------------- creative flight ---------------- */

  /* Not a simulation of anything — creative mode is explicitly outside the
     model, and the honest way to fly is to switch the body's gravity off and
     drive its vertical velocity directly rather than to invent a flight
     physiology the world would then have to charge for. */
  function stepFly(dt) {
    const ctl = C.avatar && C.avatar.controller;
    const body = ctl && ctl.body;
    if (!body) return;

    const want = C.world.mode === 'creative' && !!C.state.creativeFly;
    if (want !== flyApplied) {
      body.gravityScale = want ? 0 : 1;
      flyApplied = want;
    }
    if (!want) return;

    const input = C.game.input;
    const up = (input.down(' ') ? 1 : 0) - (input.down('control') ? 1 : 0);
    const speed = input.down('shift') ? 16 : 6.5;
    const accel = 55 * dt;
    const target = up * speed;
    body.velocity.y += C.LE.clamp(target - body.velocity.y, -accel, accel);
    if (up === 0) body.velocity.y *= Math.pow(0.02, dt);
  }

  /* ---------------- per frame ---------------- */

  function tick(dt) {
    try { stepFly(dt); } catch (err) { /* one bad frame of flight is not worth a log line */ }

    if (!settings.autosave) return;
    autosaveClock += dt;
    if (autosaveClock < AUTOSAVE_SECONDS) return;
    autosaveClock = 0;
    // A silent autosave that fails silently is a lie, so this takes the same
    // path as the button and says the same things.
    doSave();
  }

  /* ---------------- the module ---------------- */

  SurvivorGame.module({
    id: 'menu',
    order: 5,

    init(ctx) {
      C = ctx;
      loadSettings();
      applyQuality(settings.quality);
      applyFov();
      applyAudio();
      bindSensitivity();
      ensureScreen();

      window.addEventListener('keydown', onKeyCapture, true);
      // Core keeps Escape from reaching here while another sheet is up, so
      // this only ever has to toggle the menu itself.
      ctx.key('escape', () => { if (open) closeMenu(); else openMenu(); }, 'Menu, settings and save');

      if (ctx.world.mode === 'creative') {
        // The world carries its own creative flag for the simulation's benefit;
        // keeping it true here means anything reading the world rather than the
        // state bag agrees with the menu.
        ctx.world.creative = ctx.world.creativeAllowed !== false;
        ctx.state.creativeFly = false;
        ctx.state.creativeBuild = false;
        ctx.key('o', () => setCreative('creativeFly', !ctx.state.creativeFly), 'Toggle flight');
      }

      // Said once, in the log where it stays, rather than as a toast that goes
      // away before anyone has read it.
      if (ctx.world.mode === 'multiplayer') {
        ctx.log('Multiplayer: one life. Die here and this character is gone for good.', true);
        ctx.toast('One life — death is permanent');
      }

      if (askedForRestore()) {
        try {
          const stored = readJson(saveKey(ctx.world.seed));
          const record = stored ? applyRestore(stored) : null;
          if (record) {
            // The log reads newest first and the core writes its arrival lines
            // after every module has started, so this is deferred by a tick to
            // land above them. The event is deferred for a better reason: no
            // other module has subscribed to anything yet.
            setTimeout(() => {
              ctx.log(`Restored your save from day ${record.day}.`, true);
              ctx.emit('restored', { day: record.day, savedAt: record.savedAt });
            }, 0);
          } else if (!stored) {
            ctx.log('No save was found for this seed, so this is a fresh start.');
          }
        } catch (err) {
          ctx.log('The save could not be replayed; the island is untouched.', true);
        }
      }

      ctx.onUpdate((dt) => { if (!coreCallsUpdate) tick(dt); });
      ctx.log('Escape opens the menu, settings and save.');
    },

    /* The core runs the hooks registered through ctx.onUpdate; the contract
       also allows a module to carry its own update, and which of the two a
       given build calls is not something this module should care about. The
       flag makes taking both paths harmless. */
    update(dt) { coreCallsUpdate = true; tick(dt); },
  });
})();
