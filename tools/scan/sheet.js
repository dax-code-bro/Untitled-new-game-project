#!/usr/bin/env node
/* Contact sheets for the captured materials. Two of them: one showing the
 * three maps side by side, one showing each albedo tiled 2x2 so a seam
 * has nowhere to hide. */
const fs = require('fs'); const path = require('path');
const sharp = require('/tmp/imgtools/node_modules/sharp');
const ROOT = path.join(__dirname, '..', '..');
const MAPS = path.join(ROOT, 'assets', 'scans', 'maps');
const OUT = process.env.SHEET_DIR || '/tmp/claude-0/scansheets';
const ids = fs.readdirSync(MAPS).filter((d) => fs.statSync(path.join(MAPS, d)).isDirectory());

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const CELL = 150, PAD = 6, LABEL = 18;
  const cols = 3;
  const rowH = CELL + PAD + LABEL;
  const sheetW = cols * (CELL + PAD) + PAD;
  const sheetH = ids.length * rowH + PAD;
  const comp = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    for (let c = 0; c < 3; c++) {
      const f = path.join(MAPS, id, ['albedo', 'normal', 'orm'][c] + '.webp');
      if (!fs.existsSync(f)) continue;
      comp.push({ input: await sharp(f).resize(CELL, CELL, { kernel: 'nearest' }).png().toBuffer(),
        left: PAD + c * (CELL + PAD), top: PAD + i * rowH });
    }
    const svg = Buffer.from(`<svg width="${sheetW}" height="${LABEL}"><text x="4" y="13" font-family="monospace" font-size="12" fill="#e9e4d9">${id}</text></svg>`);
    comp.push({ input: svg, left: 0, top: PAD + i * rowH + CELL + 2 });
  }
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 18, g: 20, b: 22 } } })
    .composite(comp).png().toFile(path.join(OUT, 'maps.png'));

  // Tiling check: 2x2 of each albedo. A seam shows as a cross.
  const T = 170, tcols = 6;
  const trows = Math.ceil(ids.length / tcols);
  const tc = [];
  for (let i = 0; i < ids.length; i++) {
    const f = path.join(MAPS, ids[i], 'albedo.webp');
    const half = await sharp(f).resize(T / 2, T / 2).png().toBuffer();
    const quad = await sharp({ create: { width: T, height: T, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: half, left: 0, top: 0 }, { input: half, left: T / 2, top: 0 },
        { input: half, left: 0, top: T / 2 }, { input: half, left: T / 2, top: T / 2 }]).png().toBuffer();
    tc.push({ input: quad, left: PAD + (i % tcols) * (T + PAD), top: PAD + Math.floor(i / tcols) * (T + PAD + LABEL) });
    tc.push({ input: Buffer.from(`<svg width="${T}" height="${LABEL}"><text x="2" y="13" font-family="monospace" font-size="11" fill="#e9e4d9">${ids[i]}</text></svg>`),
      left: PAD + (i % tcols) * (T + PAD), top: PAD + Math.floor(i / tcols) * (T + PAD + LABEL) + T });
  }
  await sharp({ create: { width: tcols * (T + PAD) + PAD, height: trows * (T + PAD + LABEL) + PAD, channels: 3, background: { r: 18, g: 20, b: 22 } } })
    .composite(tc).png().toFile(path.join(OUT, 'tiling.png'));
  console.log('wrote', path.join(OUT, 'maps.png'), 'and tiling.png');
})();
