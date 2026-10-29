#!/usr/bin/env node
// Do the speaking characters have their sculpted mouth shapes? (the lip-sync's CC0 MakeHuman mouth
// targets: cache/<id>.mouth.json + .bin from tools/mouthmorphs.py, made by offline/build.py after every
// build). Without a valid sidecar a character's mouth falls back to bone-only shapes - every line it
// says reads weaker. For the render PC's cache check and the render gate:
//
//   node scenes/lib/humans/tools/check-mouth.mjs [--json] [ids...]
//
// Checks every built character whose role speaks in Episode 1 (perform.js ROLE_OF, lines in
// data/lipsync-s01e01.json): the sidecar exists, belongs to that id, has the cache's vertex count and
// position checksum (the same tests the runtime makes before attaching it). Exit 1 when one is
// missing or stale; the fix is printed (Blender Python: tools/mouthmorphs.py <ids>).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', 'cache');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const only = argv.filter((a) => !a.startsWith('--'));

const ROLE_OF = (await import('../perform.js').catch(() => null))?.ROLE_OF || {};
const doc = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'lipsync-s01e01.json'), 'utf8'));
const speaking = new Set(Object.values(doc.lines).map((r) => r.role));
const ids = (only.length ? only : Object.keys(ROLE_OF).filter((id) => speaking.has(ROLE_OF[id])))
  .filter((id) => fs.existsSync(path.join(CACHE, `${id}.json`)));

const TYPES = { f32: Float32Array, u16: Uint16Array, u32: Uint32Array, u8: Uint8Array, i16: Int16Array };
function skinCheck(id) {
  const h = JSON.parse(fs.readFileSync(path.join(CACHE, `${id}.json`), 'utf8'));
  const body = h.meshes.find((m) => m.kind === 'skin');
  const d = body.attrs.position;
  const fd = fs.openSync(path.join(CACHE, `${id}.bin`), 'r');
  const buf = Buffer.alloc(d.count * 4);
  fs.readSync(fd, buf, 0, buf.length, d.offset);
  fs.closeSync(fd);
  const P = new TYPES[d.type](buf.buffer, buf.byteOffset, d.count);
  let sum = 0;
  for (let i = 0; i < P.length; i++) sum += Math.abs(P[i]);
  return { mesh: body.name, n: d.count / 3, sum };
}

const rows = [];
for (const id of ids) {
  const f = path.join(CACHE, `${id}.mouth.json`), b = path.join(CACHE, `${id}.mouth.bin`);
  let problem = null;
  if (!fs.existsSync(f) || !fs.existsSync(b)) problem = 'no sidecar';
  else {
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    const s = skinCheck(id);
    if (m.id !== id) problem = `sidecar is ${m.id}'s`;
    else if (m.vertexCount !== s.n) problem = `made for ${m.vertexCount} vertices, the skin has ${s.n}`;
    else if (m.check?.positionSum === undefined || Math.abs(s.sum - m.check.positionSum) > 1e-6 * m.check.positionSum + 1e-3) problem = 'stale (the cache was rebuilt since)';
  }
  rows.push({ id, role: ROLE_OF[id] || null, ok: !problem, problem });
}
const bad = rows.filter((r) => !r.ok);
if (asJson) console.log(JSON.stringify({ checked: rows.length, bad }, null, 1));
else {
  console.log(`mouth shapes: ${rows.length - bad.length}/${rows.length} speaking characters ok`);
  for (const r of bad) console.log(`  ${r.id} (${r.role}): ${r.problem}`);
  if (bad.length) console.log(`fix (Blender Python, ~1 min each): <bpy python> -I scenes/lib/humans/tools/mouthmorphs.py ${bad.map((r) => r.id).join(' ')} --force`);
}
process.exit(bad.length ? 1 : 0);
