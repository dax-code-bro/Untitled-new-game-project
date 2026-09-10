/* The map and the compass. Both are drawn from the world's own data — the
   heightmap for the relief, the biome classification for the colour, the
   traced rivers for the blue lines — so the map is the island rather than a
   picture of it.

   It is also deliberately not a satellite view of everything. The island
   starts unexplored and fills in as the player walks it, with a memory of
   where they have been; the marked places appear when they are found or
   when a wall map is read. Knowing where the prison is should be worth
   something.

   Emits: 'waypoint' { x, z }. Listens: 'reveal-map'. */
SurvivorGame.module({
  id: 'map',
  order: 90,

  init(ctx) {
    const { SV, game } = ctx;
    const map = ctx.world.map;
    const S = map.size;
    const WORLD = map.worldSizeM;

    /* The base image: one pixel per heightmap cell, biome colour shaded by
       the terrain's own normal so relief reads without contour lines. */
    const TEX = 512;
    const base = document.createElement('canvas');
    base.width = TEX; base.height = TEX;

    function paintBase() {
      const g = base.getContext('2d');
      const img = g.createImageData(TEX, TEX);
      const d = img.data;
      const cls = ctx.world.classified;
      // Sun from the north-west, which is the convention every paper map uses.
      const lx = -0.55, lz = -0.55, ly = 0.63;
      for (let py = 0; py < TEX; py++) {
        const r = Math.min(S - 1, Math.floor((py / TEX) * S));
        for (let px = 0; px < TEX; px++) {
          const c = Math.min(S - 1, Math.floor((px / TEX) * S));
          const i = (py * TEX + px) * 4;
          const h = map.get(c, r);
          const biome = cls.at(c, r);
          let col = biome.colour;
          if (h <= 0) {
            // Sea, shaded by depth so the shelf reads differently from deep water.
            const t = Math.min(1, -h / 45);
            col = 0x1a4a66;
            d[i] = 20 + (1 - t) * 40; d[i + 1] = 60 + (1 - t) * 50; d[i + 2] = 92 + (1 - t) * 44;
            d[i + 3] = 255;
            continue;
          }
          const hL = map.get(c - 1, r), hR = map.get(c + 1, r);
          const hD = map.get(c, r - 1), hU = map.get(c, r + 1);
          const nx = (hL - hR) / (2 * map.cellM), nz = (hD - hU) / (2 * map.cellM);
          const len = Math.hypot(nx, nz, 1);
          const shade = Math.max(0.35, Math.min(1.35, (nx * lx + nz * lz + ly) / len * 1.5 + 0.35));
          d[i] = Math.min(255, ((col >> 16) & 255) * shade);
          d[i + 1] = Math.min(255, ((col >> 8) & 255) * shade);
          d[i + 2] = Math.min(255, (col & 255) * shade);
          d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);

      /* Rivers, from the traced routes rather than from the biome colours.
         The path is in world metres, so it has to be projected the same way
         everything else on this map is. */
        g.strokeStyle = 'rgba(96,158,196,0.9)';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const rv of ctx.world.rivers || []) {
        const pts = rv.path || [];
        if (pts.length < 2) continue;
        // A river widens downstream, and drawing it that way is most of what
        // makes a hand-drawn map read as one.
        for (let k = 1; k < pts.length; k++) {
          const t = k / pts.length;
          g.lineWidth = 0.8 + t * 2.2;
          g.beginPath();
          g.moveTo(((pts[k - 1].x / WORLD) + 0.5) * TEX, ((pts[k - 1].z / WORLD) + 0.5) * TEX);
          g.lineTo(((pts[k].x / WORLD) + 0.5) * TEX, ((pts[k].z / WORLD) + 0.5) * TEX);
          g.stroke();
        }
      }
    }
    paintBase();

    /* Fog of war: a coarse grid of where the player has been. Kept separate
       so the base only has to be painted once. */
    const FOG = 96;
    const seen = new Uint8Array(FOG * FOG);
    let revealed = false;

    function markSeen(x, z, radiusM) {
      const cx = ((x / WORLD) + 0.5) * FOG;
      const cz = ((z / WORLD) + 0.5) * FOG;
      const r = Math.max(1, (radiusM / WORLD) * FOG);
      for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(FOG - 1, Math.ceil(cz + r)); j++) {
        for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(FOG - 1, Math.ceil(cx + r)); i++) {
          if (Math.hypot(i - cx, j - cz) <= r) seen[j * FOG + i] = 1;
        }
      }
    }

    ctx.on('reveal-map', () => {
      revealed = true;
      for (const p of ctx.world.pois) p.found = true;
      ctx.toast('The whole island, and every marked place on it.');
    });

    /* ---- the full-screen map --------------------------------------- */
    const sheet = document.createElement('div');
    sheet.className = 'screen';
    sheet.hidden = true;
    sheet.innerHTML = '<div class="sheet" style="max-width:960px"></div>';
    document.body.appendChild(sheet);
    const body = sheet.querySelector('.sheet');

    const view = document.createElement('canvas');
    view.width = 640; view.height = 640;
    view.style.cssText = 'width:100%;max-width:640px;display:block;margin:0 auto;'
      + 'image-rendering:auto;border:1px solid #3a3f44;background:#0d1114;cursor:crosshair';

    const legend = document.createElement('div');
    legend.style.cssText = 'margin-top:8px;font-size:12px;opacity:.8;text-align:center';

    const waypoints = [];
    /* The map is a picture, not a form: there is nothing on it to give focus
       to, so a pad drives a cursor across it instead. Kept in world metres
       so it survives the canvas being resized. */
    const cursor = { x: 0, z: 0, live: false };

    function drawMap() {
      const g = view.getContext('2d');
      g.clearRect(0, 0, 640, 640);
      g.drawImage(base, 0, 0, 640, 640);

      // Fog. Everything unvisited is dark, with a soft edge so the explored
      // area does not look like a set of squares.
      if (!revealed) {
        const f = g.getImageData(0, 0, 640, 640);
        const d = f.data;
        const cell = 640 / FOG;
        for (let py = 0; py < 640; py++) {
          const j = Math.min(FOG - 1, (py / cell) | 0);
          for (let px = 0; px < 640; px++) {
            const i = Math.min(FOG - 1, (px / cell) | 0);
            if (seen[j * FOG + i]) continue;
            const k = (py * 640 + px) * 4;
            d[k] = d[k] * 0.34 + 6; d[k + 1] = d[k + 1] * 0.34 + 8; d[k + 2] = d[k + 2] * 0.38 + 11;
          }
        }
        g.putImageData(f, 0, 0);
      }

      const toPx = (x, z) => [((x / WORLD) + 0.5) * 640, ((z / WORLD) + 0.5) * 640];

      // Places, once found.
      g.font = '11px ui-monospace, monospace';
      for (const p of ctx.world.pois) {
        if (!p.found && !revealed) continue;
        const [x, y] = toPx(p.x, p.z);
        g.fillStyle = '#e8c96a';
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 2; g.strokeText(p.name, x + 7, y + 4);
        g.fillStyle = '#f0e4c0'; g.fillText(p.name, x + 7, y + 4);
      }

      // The player's own camps: fires and things they have built.
      g.fillStyle = '#ff7a30';
      for (const f of ctx.world.fires || []) {
        const [x, y] = toPx(f.x, f.z);
        g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#9fd0e8';
      for (const b of ctx.world.built || []) {
        const [x, y] = toPx(b.x, b.z);
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
      }

      // Waypoints the player set.
      for (const w of waypoints) {
        const [x, y] = toPx(w.x, w.z);
        g.strokeStyle = '#e04a4a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5);
        g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke();
      }

      // The pad's cursor, when one is being driven.
      if (cursor.live) {
        const [cx, cy] = toPx(cursor.x, cursor.z);
        g.strokeStyle = 'rgba(233,228,217,0.9)';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(cx - 15, cy); g.lineTo(cx - 5, cy);
        g.moveTo(cx + 5, cy); g.lineTo(cx + 15, cy);
        g.moveTo(cx, cy - 15); g.lineTo(cx, cy - 5);
        g.moveTo(cx, cy + 5); g.lineTo(cx, cy + 15);
        g.stroke();
        // What is under it, which is the whole reason to move it there.
        const b = ctx.biomeAt(cursor.x, cursor.z);
        const d = Math.hypot(cursor.x - ctx.player.x, cursor.z - ctx.player.z);
        g.font = '11px ui-monospace, monospace';
        g.textAlign = 'left';
        const label = `${b ? b.name : 'open water'} · ${d < 1000 ? `${d.toFixed(0)} m` : `${(d / 1000).toFixed(1)} km`}`;
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(cx + 14, cy - 22, g.measureText(label).width + 10, 16);
        g.fillStyle = '#e8e4d8';
        g.fillText(label, cx + 19, cy - 10);
      }

      // The player, pointing the way they are facing.
      const [px, py] = toPx(ctx.player.x, ctx.player.z);
      const yaw = game._camYaw;
      g.save();
      g.translate(px, py); g.rotate(-yaw);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(0, -7); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
      g.restore();

      // Scale bar, because a map without one is a picture.
      const barM = WORLD > 3000 ? 500 : 200;
      const barPx = (barM / WORLD) * 640;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(12, 610, barPx + 60, 20);
      g.fillStyle = '#e8e4d8'; g.fillRect(18, 624, barPx, 3);
      g.fillText(`${barM} m`, 18 + barPx + 6, 627);
    }

    function setWaypoint(x, z) {
      // Marking the same spot twice removes the mark, whichever device did it.
      const near = waypoints.findIndex((w) => Math.hypot(w.x - x, w.z - z) < WORLD * 0.02);
      if (near >= 0) waypoints.splice(near, 1);
      else waypoints.push({ x, z });
      ctx.emit('waypoint', { x, z });
      drawMap();
      updateLegend();
    }

    view.addEventListener('click', (e) => {
      const r = view.getBoundingClientRect();
      setWaypoint(((e.clientX - r.left) / r.width - 0.5) * WORLD,
        ((e.clientY - r.top) / r.height - 0.5) * WORLD);
    });

    function updateLegend() {
      const b = ctx.biomeAt(ctx.player.x, ctx.player.z);
      const bearing = ((game._camYaw * 180) / Math.PI + 360) % 360;
      const w = waypoints.length
        ? waypoints.map((p) => {
          const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
          const brg = ((Math.atan2(p.x - ctx.player.x, p.z - ctx.player.z) * 180) / Math.PI + 360) % 360;
          return `mark: ${d < 1000 ? `${d.toFixed(0)} m` : `${(d / 1000).toFixed(2)} km`} on ${brg.toFixed(0)}°`;
        }).join(' · ')
        : '';
      const pad = ctx.game.input.pad;
      const how = pad && pad.active
        ? `stick moves the cursor · ${pad.glyph('a')} mark · ${pad.glyph('x')} nearest place`
          + ` · ${pad.glyph('y')} clear · ${pad.glyph('b')} close`
        : 'click to set a mark · M to close';
      legend.textContent = `${b ? b.name : 'open water'} · ${ctx.groundY(ctx.player.x, ctx.player.z).toFixed(0)} m ASL`
        + ` · facing ${bearing.toFixed(0)}° · ${w} · ${how}`;
    }

    body.innerHTML = '<h2>The island</h2>';
    body.appendChild(view);
    body.appendChild(legend);

    function toggle() {
      sheet.hidden = !sheet.hidden;
      ctx.state.uiOpen = !sheet.hidden;
      ctx.state.movementLocked = !sheet.hidden;
      // The gamepad module leaves the sticks alone while this is true, so
      // the map can drive its own cursor with them.
      ctx.state.padSheetCustom = !sheet.hidden;
      if (!sheet.hidden) {
        cursor.x = ctx.player.x; cursor.z = ctx.player.z;
        drawMap(); updateLegend();
      } else cursor.live = false;
    }

    /* Driving the map with a pad. Runs while paused because the map does not
       pause the game but the menu on top of it might. */
    ctx.onUpdate((dt) => {
      if (sheet.hidden) return;
      const pad = ctx.game.input.pad;
      if (!pad || !pad.connected) return;

      const sx = pad.left.x + (pad.down('right') ? 1 : 0) - (pad.down('left') ? 1 : 0);
      const sz = pad.left.y + (pad.down('down') ? 1 : 0) - (pad.down('up') ? 1 : 0);
      if (Math.abs(sx) > 0.02 || Math.abs(sz) > 0.02) {
        cursor.live = true;
        /* Holding a shoulder button slows the cursor to a crawl, which is
           what you want when placing a mark on a specific creek rather than
           somewhere on that side of the island. */
        const fine = pad.down('lb') || pad.down('rb') ? 0.18 : 1;
        const speed = WORLD * 0.34 * fine;
        cursor.x = Math.max(-WORLD / 2, Math.min(WORLD / 2, cursor.x + sx * speed * dt));
        cursor.z = Math.max(-WORLD / 2, Math.min(WORLD / 2, cursor.z + sz * speed * dt));
      }
      if (pad.justPressed('a') && cursor.live) {
        setWaypoint(cursor.x, cursor.z);
        pad.rumble(0.25, 0.06);
      }
      if (pad.justPressed('x')) {
        // Snap to the nearest found place, which is what you actually want
        // to navigate to nine times out of ten.
        let best = null, bestD = Infinity;
        for (const p of ctx.world.pois) {
          if (!p.found && !revealed) continue;
          const d = Math.hypot(p.x - cursor.x, p.z - cursor.z);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) { cursor.x = best.x; cursor.z = best.z; cursor.live = true; ctx.toast(best.name); }
      }
      if (pad.justPressed('y') && waypoints.length) {
        waypoints.length = 0;
        ctx.toast('Marks cleared.');
      }
      drawMap();
      updateLegend();
    }, { whilePaused: true });
    ctx.key('m', toggle, 'Map');
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) toggle(); });

    /* ---- the compass strip ------------------------------------------- */
    const compass = ctx.hud.panel('compass-strip', { className: 'panel' });
    compass.style.cssText += ';position:absolute;left:50%;top:10px;transform:translateX(-50%);'
      + 'width:420px;height:26px;padding:0;overflow:hidden;pointer-events:none';
    const strip = document.createElement('canvas');
    strip.width = 420; strip.height = 26;
    compass.appendChild(strip);

    // The core's own compass readout is the same information in a worse
    // form, and two of them on top of each other is just noise.
    const oldCompass = document.getElementById('compass');
    if (oldCompass) oldCompass.style.display = 'none';

    const CARDINALS = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];

    function drawCompass() {
      const g = strip.getContext('2d');
      g.clearRect(0, 0, 420, 26);
      const bearing = ((game._camYaw * 180) / Math.PI + 360) % 360;
      // 90 degrees across the strip, which is roughly the field of view.
      const pxPerDeg = 420 / 90;
      g.font = 'bold 12px ui-monospace, monospace';
      g.textAlign = 'center';
      for (const [deg, label] of CARDINALS) {
        let rel = ((deg - bearing + 540) % 360) - 180;
        const x = 210 + rel * pxPerDeg;
        if (x < -20 || x > 440) continue;
        g.fillStyle = label === 'N' ? '#e05a4a' : '#d8d4c8';
        g.fillText(label, x, 17);
      }
      for (let deg = 0; deg < 360; deg += 15) {
        let rel = ((deg - bearing + 540) % 360) - 180;
        const x = 210 + rel * pxPerDeg;
        if (x < 0 || x > 420) continue;
        g.fillStyle = 'rgba(216,212,200,0.4)';
        g.fillRect(x - 0.5, 20, 1, 5);
      }
      // Waypoints ride the strip, which is what makes it navigation.
      for (const w of waypoints) {
        const brg = ((Math.atan2(w.x - ctx.player.x, w.z - ctx.player.z) * 180) / Math.PI + 360) % 360;
        let rel = ((brg - bearing + 540) % 360) - 180;
        const x = 210 + rel * pxPerDeg;
        if (x < 0 || x > 420) continue;
        g.fillStyle = '#e04a4a';
        g.beginPath(); g.moveTo(x, 2); g.lineTo(x + 4, 9); g.lineTo(x - 4, 9); g.closePath(); g.fill();
      }
      g.fillStyle = '#ffffff';
      g.fillRect(209.5, 0, 1, 8);
    }

    /* ---- per-frame ------------------------------------------------------ */
    let acc = 0;
    ctx.onUpdate((dt) => {
      // What you can see from where you stand: further on a hill, less in
      // a forest, and almost nothing at night.
      acc += dt;
      if (acc > 0.5) {
        acc = 0;
        const canopy = ctx.state.canopyAt ? ctx.state.canopyAt(ctx.player.x, ctx.player.z) : 0;
        const light = ctx.world.clock.lightLevel();
        const elev = ctx.groundY(ctx.player.x, ctx.player.z);
        const sight = (60 + elev * 2.5) * (1 - canopy * 0.65) * (0.35 + 0.65 * light);
        markSeen(ctx.player.x, ctx.player.z, Math.min(500, sight));

        // Standing in a place marks it as found, which is how the map fills.
        for (const p of ctx.world.pois) {
          if (p.found) continue;
          if (Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) < (p.radiusM || 60) + sight * 0.5) {
            p.found = true;
            ctx.log(`Found: ${p.name}. ${p.blurb || ''}`, true);
          }
        }
      }
      drawCompass();
      if (!sheet.hidden) { drawMap(); updateLegend(); }
    });

    /* The nearest waypoint's bearing and range belong on the status panel,
       so the player can navigate without the map open. */
    ctx.onUpdate(() => {
      if (!waypoints.length) return;
      let best = null, bestD = Infinity;
      for (const w of waypoints) {
        const d = Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z);
        if (d < bestD) { bestD = d; best = w; }
      }
      const brg = ((Math.atan2(best.x - ctx.player.x, best.z - ctx.player.z) * 180) / Math.PI + 360) % 360;
      ctx.state.statusLines = (ctx.state.statusLines || []).concat(
        [`mark ${bestD < 1000 ? `${bestD.toFixed(0)} m` : `${(bestD / 1000).toFixed(2)} km`} on ${brg.toFixed(0)}°`]);
    });
  },
});
