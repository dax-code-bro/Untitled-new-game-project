// Copies the built game (site/southbound) into ./game for the desktop app.
// Run `node tools/southbound/build.mjs` at the repo root first if you changed the source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../site/southbound'), dst = path.join(here, 'game');
const KEEP = ['index.html', 'game.js', 'style.css', 'manifest.webmanifest', 'assets', 'vendor', 'CREDITS.md'];
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
let files = 0, bytes = 0;
const copy = (a, b) => {
  const st = fs.statSync(a);
  if (st.isDirectory()) { fs.mkdirSync(b, { recursive: true }); for (const n of fs.readdirSync(a)) copy(path.join(a, n), path.join(b, n)); }
  else { fs.copyFileSync(a, b); files++; bytes += st.size; }
};
for (const k of KEEP) if (fs.existsSync(path.join(src, k))) copy(path.join(src, k), path.join(dst, k));
console.log(`game copied: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
