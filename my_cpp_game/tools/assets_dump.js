#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Reference dump for tests/test_assets_parity.cpp.

   For every recipe in LE.Textures.kinds, bakes it with the ORIGINAL
   JavaScript (LE.Textures.generate(kind, size, seed)) and writes the three
   maps raw, so the C++ port can be compared to them byte for byte:

       <out>/<kind>.albedo.bin   size*size*4 bytes, row 0 first
       <out>/<kind>.normal.bin
       <out>/<kind>.orm.bin
       <out>/<kind>.meta.txt     "heightTop heightRange" (round-trip decimal)
       <out>/kinds.txt           one kind per line, in LE.Textures.kinds order
       <out>/params.txt          "size seed full|partial"

   Usage:
       /opt/node22/bin/node tools/assets_dump.js [outDir] [size] [seed] [kind,kind,...]
   Defaults: outDir = my_cpp_game/build-assets/parity, size 64, seed 1, all
   kinds. A kind list makes a PARTIAL dump (params.txt says so), for
   spot-checking a few recipes at 4096 without writing 46 x 192 MiB.

   Read-only with respect to the engine: it require()s the built bundle and
   never touches engine/ or site/.
   --------------------------------------------------------------------------- */
'use strict';
const fs = require('fs');
const path = require('path');

const BUNDLE = '/home/user/Untitled-new-game-project/site/engine/legend-engine.js';
const outDir = path.resolve(process.argv[2] ||
  path.join(__dirname, '..', 'build-assets', 'parity'));
const size = parseInt(process.argv[3] || '64', 10);
const seed = parseInt(process.argv[4] || '1', 10);

const LE = require(BUNDLE);
const T = LE.Textures;
fs.mkdirSync(outDir, { recursive: true });

const allKinds = Object.keys(T.kinds);
const only = process.argv[5] ? process.argv[5].split(',').filter(Boolean) : null;
for (const k of only || []) if (!allKinds.includes(k)) throw new Error(`unknown kind '${k}'`);
const kinds = only ? allKinds.filter((k) => only.includes(k)) : allKinds;
const t0 = Date.now();
for (const kind of kinds) {
  const m = T.generate(kind, size, seed);
  T._cache.delete(`${kind}:${size}:${seed}`);   // do not hold every 4K bake in memory
  for (const map of ['albedo', 'normal', 'orm']) {
    const bytes = m[map];
    if (!(bytes instanceof Uint8Array) || bytes.length !== size * size * 4) {
      throw new Error(`${kind}.${map}: expected Uint8Array(${size * size * 4})`);
    }
    fs.writeFileSync(path.join(outDir, `${kind}.${map}.bin`), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
  }
  // String(x) is the shortest round-trip form; strtod reads it back exactly.
  fs.writeFileSync(path.join(outDir, `${kind}.meta.txt`), `${String(m.heightTop)} ${String(m.heightRange)}\n`);
}
/* heightToNormal on its own, at its DEFAULT strength (2), on a synthetic
   48x48 field with steep and shallow regions -- so the public C++
   heightToNormal is checked directly, not only through bake(). */
{
  const S = 48, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = Math.sin(i * 0.37) * 0.8 + ((i * 7919) % 101) / 101 - 0.3;
  const nm = T.heightToNormal(h, S);
  fs.writeFileSync(path.join(outDir, 'h2n.height.f32'), Buffer.from(h.buffer));
  fs.writeFileSync(path.join(outDir, 'h2n.normal.bin'), Buffer.from(nm.buffer));
}
fs.writeFileSync(path.join(outDir, 'kinds.txt'), kinds.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'params.txt'), `${size} ${seed} ${only ? 'partial' : 'full'}\n`);
console.log(`assets_dump: ${kinds.length} kinds at ${size}x${size} seed ${seed} -> ${outDir} (${Date.now() - t0} ms)`);
