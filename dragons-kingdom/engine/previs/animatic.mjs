#!/usr/bin/env node
// Engine phase 6: D0 ANIMATIC frames (engine/DESIGN.md 5.5). Pure Node: the camera and every actor from previs-core's
// measure(), the set's solids from its sheet, drawn as flat schematic shapes (sky / ground with a 2 m grid, buildings
// as grey prisms, people as coloured bodies with a head, dragons as wide ellipses) and written as PNG (own encoder,
// node:zlib). No browser, no three.js renderer: a whole episode takes seconds.
//
//   node engine/previs/animatic.mjs --episode t00 [--only 0A-01,..] [--us 0.15,0.5,0.85] [--width 480]
// Writes final/previs/<job>_<k>.png (k = 0.. for each u). make-cut.mjs shows them in turn as the shot's D0 picture.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { measure } from '../../scenes/lib/director/previs-core.js';
import { dirs, episodeArg, ROOT } from '../../scenes/lib/director/episode-paths.js';
import { SETS } from '../../scenes/lib/director/registry.js';
import { mergeSpecs } from '../../scenes/lib/director/staging/merge.js';

export const ANIMATIC_VERSION = 1;
const SHEETS = path.join(ROOT, 'scenes/lib/director/sets/sheets');

// ------------------------------------------------------------------ PNG ---
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
export function encodePng(W, H, rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// --------------------------------------------------------------- canvas ---
function canvas(W, H) {
  const px = Buffer.alloc(W * H * 3);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  return {
    W, H, px, set,
    fillRect(x0, y0, x1, y1, c) { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) set(x, y, c); },
    // convex or not: even-odd scanline fill
    fillPoly(pts, c) {
      if (pts.length < 3) return;
      const ys = pts.map((p) => p[1]);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
          if ((ay <= y + 0.5) !== (by <= y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(W, Math.round(xs[k + 1])); x++) set(x, y, c);
      }
    },
    ellipse(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c); },
    line(x0, y0, x1, y1, c) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1; for (let i = 0; i <= n; i++) set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); },
  };
}
const hull = (pts) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};
const COLORS = [[214, 92, 70], [70, 140, 214], [226, 180, 60], [120, 190, 100], [190, 110, 200], [90, 200, 200], [240, 140, 170], [160, 160, 90]];
const colorOf = (name) => COLORS[[...String(name)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % COLORS.length];

/** one schematic frame of shot `job` at shot-local time t -> PNG buffer */
export function drawFrame(spec, job, row, t, sheet, W = 480) {
  const H = Math.round(W * 9 / 16);
  const r = measure(spec, job, t, { row, sheet });
  const cv = canvas(W, H);
  if (r.skip) { cv.fillRect(0, 0, W, H, [30, 30, 32]); return { png: encodePng(W, H, cv.px), r }; }
  const cam = r.cam;
  const vfov = 2 * Math.atan((24.89 * 9 / 16) / 2 / cam.mm) * 180 / Math.PI;
  const C = new THREE.PerspectiveCamera(vfov, 16 / 9, 0.05, 5000);
  C.position.copy(cam.pos); C.lookAt(cam.look); C.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(); C.getWorldDirection(fwd);
  const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z); const front = v.clone().sub(C.position).dot(fwd) > 0.1; v.project(C); return front ? [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z] : null; };
  const gy = sheet?.ground?.y ?? 0;
  // sky / ground at the horizon (a far point at eye height in the look direction)
  const hz = new THREE.Vector3(fwd.x, 0, fwd.z).normalize().multiplyScalar(3000).add(new THREE.Vector3(cam.pos.x, gy, cam.pos.z));
  const hp = P(hz.x, hz.y, hz.z);
  const horizon = hp ? Math.max(-1, Math.min(H + 1, hp[1])) : (fwd.y > 0 ? H + 1 : -1);
  cv.fillRect(0, 0, W, horizon, [150, 178, 205]);
  cv.fillRect(0, horizon, W, H, [118, 108, 92]);
  // a 2 m ground grid around the camera
  const cx = Math.round(cam.pos.x / 2) * 2, cz = Math.round(cam.pos.z / 2) * 2;
  for (let k = -30; k <= 30; k += 2) for (const [ax, az, bx, bz] of [[cx + k, cz - 30, cx + k, cz + 30], [cx - 30, cz + k, cx + 30, cz + k]]) {
    let prev = null;
    for (let i = 0; i <= 30; i++) { const p = P(ax + (bx - ax) * i / 30, gy, az + (bz - az) * i / 30); if (p && prev) cv.line(prev[0], prev[1], p[0], p[1], [138, 127, 110]); prev = p; }
  }
  // solids (far first) and actors, painter's order
  const items = [];
  for (const s of sheet?.solids || []) {
    const y0 = s.y0 ?? gy, y1 = y0 + (s.h ?? 2);
    let foot = s.poly || (s.box ? [[s.box[0][0], s.box[0][1]], [s.box[1][0], s.box[0][1]], [s.box[1][0], s.box[1][1]], [s.box[0][0], s.box[1][1]]] : null);
    if (!foot && s.cyl) foot = Array.from({ length: 10 }, (_, i) => [s.cyl[0] + s.r * Math.cos(i * Math.PI / 5), s.cyl[1] + s.r * Math.sin(i * Math.PI / 5)]);
    if (!foot) continue;
    const mx = foot.reduce((a, p) => a + p[0], 0) / foot.length, mz = foot.reduce((a, p) => a + p[1], 0) / foot.length;
    const d = Math.hypot(mx - cam.pos.x, mz - cam.pos.z);
    if (d > 400) continue;
    const pts = [...foot.map((p) => P(p[0], y0, p[1])), ...foot.map((p) => P(p[0], s.ridge ?? y1, p[1]))];
    if (pts.some((p) => !p)) continue;
    const shade = Math.max(60, Math.min(170, 170 - d * 1.2));
    items.push({ d, draw: () => cv.fillPoly(hull(pts.map((p) => [p[0], p[1]])), [shade, shade - 6, shade - 14]) });
  }
  for (const a of r.actors) {
    if (a.behind) continue;
    const head = a.head, human = a.kind === 'human';
    items.push({ d: a.dist, draw: () => {
      const col = colorOf(a.name);
      const h = P(head.x, head.y, head.z);
      if (!h) return;
      if (human) {
        const f = P(head.x, Math.max(gy, head.y - 1.55), head.z);
        const rp = P(head.x + 0.12 * C.matrixWorld.elements[0], head.y, head.z + 0.12 * C.matrixWorld.elements[2]);
        const rad = rp ? Math.max(1.5, Math.hypot(rp[0] - h[0], rp[1] - h[1])) : 3;
        if (f) cv.fillRect(h[0] - rad * 1.6, h[1] + rad, h[0] + rad * 1.6, f[1], col.map((c) => c * 0.8));
        cv.ellipse(h[0], h[1], rad, rad * 1.15, col);
        if (a.speaking) cv.ellipse(h[0], h[1] - rad * 2.2, rad * 0.4, rad * 0.4, [255, 255, 255]);
      } else {
        const rp = P(head.x + 3 * C.matrixWorld.elements[0], head.y, head.z + 3 * C.matrixWorld.elements[2]);
        const rad = rp ? Math.max(3, Math.hypot(rp[0] - h[0], rp[1] - h[1])) : 6;
        cv.ellipse(h[0], h[1] + rad * 0.3, rad, rad * 0.45, col.map((c) => c * 0.7));
        cv.ellipse(h[0], h[1], rad * 0.25, rad * 0.2, col);
      }
    } });
  }
  items.sort((a, b) => b.d - a.d).forEach((x) => x.draw());
  // a thin frame line
  for (let x = 0; x < W; x++) { cv.set(x, 0, [20, 20, 20]); cv.set(x, H - 1, [20, 20, 20]); }
  return { png: encodePng(W, H, cv.px), r };
}

// a spec as it is on disk NOW: an engine spec is mergeSpecs(auto, touch), imported with a content-hash query each (a
// plain re-import of <builder>.spec.js would keep the module cache's OLD auto.js after a re-stage or a .next swap)
const bust = (f) => pathToFileURL(f).href + `?h=${crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12)}`;
export async function loadSpecFresh(specsDir, builder, specF) {
  const auto = path.join(specsDir, `${builder}.auto.js`), touch = path.join(specsDir, `${builder}.touch.js`);
  if (fs.existsSync(auto) && fs.existsSync(touch)) return mergeSpecs((await import(bust(auto))).default, (await import(bust(touch))).default);
  return (await import(bust(specF))).default;
}

/** the specs and tables of an episode: [{ setId, spec, table, sheet }] */
export async function loadEpisodeSets(ep) {
  const D = dirs(ep);
  const out = [];
  for (const f of fs.readdirSync(D.scenes).filter((x) => x.endsWith('.shots.json')).sort()) {
    const table = JSON.parse(fs.readFileSync(path.join(D.scenes, f), 'utf8'));
    const reg = SETS[table.set];
    const specF = path.join(D.specs, `${reg.builder}.spec.js`);
    const spec = await loadSpecFresh(D.specs, reg.builder, specF);
    const base = table.set.replace(/_\d+$/, '');
    const sf = [table.set, base].map((s) => path.join(SHEETS, `${s}.json`)).find((x) => fs.existsSync(x));
    out.push({ setId: table.set, spec, table, sheet: sf ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null });
  }
  return out;
}

export async function makeAnimatic(ep, { only = null, us = [0.15, 0.5, 0.85], width = 480, log = console.log } = {}) {
  const D = dirs(ep);
  fs.mkdirSync(D.previs, { recursive: true });
  const done = [];
  for (const { spec, table, sheet } of await loadEpisodeSets(ep)) {
    for (const row of table.shots) {
      if (only && !only.has(row.job)) continue;
      const secs = row.frames / 24;
      for (const f of fs.readdirSync(D.previs).filter((x) => x.startsWith(`${row.job}_`) && x.endsWith('.png'))) fs.rmSync(path.join(D.previs, f));
      us.forEach((u, k) => {
        const { png } = drawFrame(spec, row.job, row, Math.min(secs - 1 / 24, u * secs), sheet, width);
        fs.writeFileSync(path.join(D.previs, `${row.job}_${k}.png`), png);
      });
      done.push(row.job);
    }
  }
  log(`animatic ${ep}: ${done.length} shot(s) x ${us.length} frame(s) -> ${path.relative(ROOT, D.previs)}`);
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { ep, argv } = episodeArg(process.argv.slice(2), null);
  if (!ep) throw new Error('--episode <id> is required');
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  await makeAnimatic(ep, { only: opt('--only') ? new Set(opt('--only').split(',')) : null, us: opt('--us') ? opt('--us').split(',').map(Number) : undefined, width: +(opt('--width') || 480) });
}
