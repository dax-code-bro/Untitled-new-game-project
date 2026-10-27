// FX library - a node:test file for `npm test` (REQUEST test owner: test/run.mjs runs only
// test/*.test.mjs, which the fx track does not own; add a one-line test/fx.test.mjs:
//
//   import '../scenes/lib/fx/tools/fx.test.mjs';
//
// ). It fails when the library does not import (a syntax error anywhere in scenes/lib/fx makes
// the director's loadFxLibrary() quietly return { loaded: false } and every FX cue draws nothing)
// and runs the self-test (solver, decals, fire calibration, tiers, director path; ~5 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('fx: the library imports and registers its director cue kinds', async () => {
  const m = await import('../index.js');
  assert.equal(typeof m.registerDirectorFx, 'function');
  const kinds = new Map();
  m.registerDirectorFx((k, f, meta) => kinds.set(k, { f, meta }));
  assert.ok(kinds.size >= 38, `only ${kinds.size} kinds registered`);
  for (const [k, r] of kinds) assert.ok(typeof r.f === 'function' && r.meta?.about, `kind ${k} has no factory / description`);
});

test('fx: self-test passes', () => {
  const r = spawnSync(process.execPath, [path.join(here, 'selftest.mjs')], { encoding: 'utf8', timeout: 300000 });
  const tail = (r.stdout || '').split('\n').filter((l) => /^FAIL|passed/.test(l)).join('\n');
  assert.equal(r.status, 0, `fx selftest failed:\n${tail}\n${(r.stderr || '').slice(-2000)}`);
});
