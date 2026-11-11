// Episode-making engine (engine/DESIGN.md), phase 1: the director's pure self-test (it includes
// build-shots --check: Episode 1's shot tables and edit lists are up to date, through the --episode
// plumbing), --episode on the tools, and template mining over the hand-written specs (>= 170 measured).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

test('engine phase 1: director self-test (build-shots --check for s01e01) passes', () => {
  const r = node('scenes/lib/director/tools/selftest.mjs', '--episode', 's01e01');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('engine phase 1: a bad --episode id is refused before anything is read', () => {
  const r = node('scenes/lib/director/tools/build-shots.mjs', '--episode', '../x', '--check');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /episode id/);
});

test('engine phase 1: mine-specs measures >= 170 hand-written specs, deterministically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-mine-'));
  try {
    const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json');
    for (const f of [a, b]) { const r = node('engine/tools/mine-specs.mjs', '--out', f); assert.equal(r.status, 0, r.stderr); }
    const d = JSON.parse(fs.readFileSync(a, 'utf8'));
    assert.ok(d.coverage.measured >= 170, `measured ${d.coverage.measured}`);
    assert.deepEqual(d.problems, []);
    assert.ok(d.by_size.MS?.bands?.dist && d.by_template['establish-wide']?.bands?.mm);
    assert.equal(fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8'), 'same specs, same bytes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
