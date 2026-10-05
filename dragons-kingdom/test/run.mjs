#!/usr/bin/env node
// "npm test" entry: runs the test files with node's built-in test runner,
// using the options this Node version supports.
//   --test-concurrency=1  test files one after another (Node 20.10+ / 21+)
//   --test-force-exit     safety net: never hang after the last test (Node 20.14+ / 22+, not 21)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
const at = (maj, min) => major > maj || (major === maj && minor >= min);
const flags = ['--test'];
if (at(21, 0) || (major === 20 && minor >= 10)) flags.push('--test-concurrency=1');
if (at(22, 0) || (major === 20 && minor >= 14)) flags.push('--test-force-exit');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
const extra = process.argv.slice(2);      // e.g. npm test -- --test-name-pattern="(b3)"
const r = spawnSync(process.execPath, [...flags, ...extra, ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
