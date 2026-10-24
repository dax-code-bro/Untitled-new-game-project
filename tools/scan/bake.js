#!/usr/bin/env node
/* Bake the captured maps into a source file the engine can carry.
 * The game is one HTML file with no external assets, so the maps travel
 * as data URIs and are decoded by the browser at load.
 *   node tools/scan/bake.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const MAPS = path.join(ROOT, 'assets', 'scans', 'maps');
const OUT = path.join(ROOT, 'engine', 'src', '41-scans.js');
const report = JSON.parse(fs.readFileSync(path.join(MAPS, 'report.json'), 'utf8'));
const byId = Object.fromEntries(report.map((r) => [r.id, r]));

const uri = (f) => `data:image/webp;base64,${fs.readFileSync(f).toString('base64')}`;

let total = 0;
const entries = [];
for (const m of SRC.materials) {
  const dir = path.join(MAPS, m.id);
  if (!fs.existsSync(dir)) continue;
  const r = byId[m.id] || {};
  const files = ['albedo', 'normal', 'orm'].map((k) => path.join(dir, `${k}.webp`));
  if (!files.every((f) => fs.existsSync(f))) continue;
  for (const f of files) total += fs.statSync(f).size;
  const repo = SRC.repos[m.repo];
  entries.push(`  ${m.id}: {
    what: ${JSON.stringify(m.what)},
    metresPerTile: ${m.metresPerTile},
    slopeDeg: ${r.slopeDeg != null ? r.slopeDeg : m.slopeDeg || 15},
    meanAlbedo: ${r.meanAlbedo != null ? r.meanAlbedo : 0.3},
    subsurface: ${m.subsurface || 0},
    source: ${JSON.stringify(m.credit || repo.name)},
    licence: ${JSON.stringify(m.credit ? 'CC0' : repo.licence)},
    albedo: '${uri(files[0])}',
    normal: '${uri(files[1])}',
    orm: '${uri(files[2])}',
  },`);
}

const banner = `/* ============================================================
   SCANNED MATERIALS — photographed surfaces, not noise functions.

   Every entry here began as a photograph of a real surface, taken from
   an open-source asset repository, and was put through the pipeline in
   tools/scan/: the photograph's own lighting is divided back out, the
   reflectance is scaled to the published albedo of that material, the
   image is made periodic by blending its low and high frequencies over
   different widths, and the height, normal, roughness and ambient
   occlusion are derived from it — the normal strength solved so the
   surface has the RMS slope a real one of that kind has, rather than a
   number tuned until it looked right.

   The maps travel as data URIs because this game is one file with no
   external assets. They are decoded on load; until they arrive, the
   procedural texture of the same name is what you see, so nothing is
   ever missing, only less detailed for a moment.

   Sources and licences are on each entry and collected in
   assets/scans/CREDITS.md. Regenerate with:
       node tools/scan/fetch.js && node tools/scan/capture.js
       node tools/scan/bake.js
   ============================================================ */

`;

const body = `const SCAN = {
${entries.join('\n')}
};

/* Decode one scanned material and hand back raw RGBA for each map. The
   browser does the WebP decoding; this only puts the result somewhere
   the texture upload can reach it. */
function loadScan(id) {
  const s = SCAN[id];
  if (!s) return Promise.resolve(null);
  if (s._pending) return s._pending;
  const one = (uri) => new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      resolve({ data: new Uint8Array(d.data.buffer.slice(0)), size: c.width });
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
  s._pending = Promise.all([one(s.albedo), one(s.normal), one(s.orm)])
    .then(([albedo, normal, orm]) => (albedo && normal && orm ? { albedo, normal, orm, spec: s } : null));
  return s._pending;
}

function scanIds() { return Object.keys(SCAN); }
`;

fs.writeFileSync(OUT, banner + body);
console.log(`${entries.length} materials -> ${path.relative(ROOT, OUT)}  (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB, ${(total / 1024).toFixed(0)} kB of maps)`);

/* Credits, because CC BY means credit. */
const lines = ['# Scanned materials — sources and licences', '',
  'Every surface texture in Survivor began as a photograph of a real surface.',
  'None of it was made here. These are the people and projects it came from.', ''];
const seen = new Map();
for (const m of SRC.materials) {
  const repo = SRC.repos[m.repo];
  const key = m.credit || repo.name;
  if (!seen.has(key)) seen.set(key, { licence: m.credit ? 'CC0 1.0' : repo.licence, url: repo.url, ids: [] });
  seen.get(key).ids.push(m.id);
}
for (const [name, v] of seen) {
  lines.push(`## ${name}`, '', `- Licence: **${v.licence}**`, `- ${v.url}`, `- Used for: ${v.ids.join(', ')}`, '');
}
lines.push('## Processing', '',
  'The captures were delighted, calibrated to published diffuse reflectance,',
  'made seamless, and had height, normal, roughness and occlusion derived from',
  'them by `tools/scan/capture.js`. That code is part of this repository.', '');
fs.writeFileSync(path.join(ROOT, 'assets', 'scans', 'CREDITS.md'), lines.join('\n'));
