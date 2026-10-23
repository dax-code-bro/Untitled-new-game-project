// The end-credits font: EB Garamond (SIL Open Font License 1.1), the SAME file on every computer, so the
// credits look identical on the cloud machine and on the render PC. Never a system font: when it cannot be
// had, the credits card stops with a message instead of quietly using Georgia / DejaVu.
//
// Source: the npm package @expo-google-fonts/eb-garamond 0.4.2 (published 2025-09-17; npm versions never
// change), which carries Google Fonts' EB Garamond TTFs and the OFL text. Pinned: the tarball's sha256 and
// every extracted file's sha256. Kept in pc/tools/fonts/ (git-ignored, like the pinned ffmpeg); downloaded on
// first use (render/episode.mjs) or by the setup (node pc/build-caches.mjs --only fonts).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { PROJECT_ROOT } from './tools.mjs';

export const FONT_DIR = process.env.DK_FONT_DIR || path.join(PROJECT_ROOT, 'pc', 'tools', 'fonts');
export const FONT_SOURCE = {
  name: 'EB Garamond',
  license: 'SIL Open Font License 1.1 (Copyright 2017 The EB Garamond Project Authors)',
  package: '@expo-google-fonts/eb-garamond@0.4.2',
  url: 'https://registry.npmjs.org/@expo-google-fonts/eb-garamond/-/eb-garamond-0.4.2.tgz',
  sha256: '93abd91dcb1c60d2bfceb8992567f00054372b90638163de6fdf33f2d73c2b4a',
  bytes: 3568844,
  files: {
    regular: { from: 'package/400Regular/EBGaramond_400Regular.ttf', to: 'EBGaramond-Regular.ttf', sha256: 'a45a5040e1a328d056871d42aa70f10f7ca3bf5c447887b80720542feeead5f2' },
    medium: { from: 'package/500Medium/EBGaramond_500Medium.ttf', to: 'EBGaramond-Medium.ttf', sha256: '8e2105ea6bbb11a408667c03e5f0fa19f69fffe417fffe9b915baee4bda9c77f' },
    license: { from: 'package/LICENSE_FONT', to: 'EBGaramond-OFL.txt', sha256: null },
  },
};

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const okFile = (f, want) => { try { return !want || sha256(fs.readFileSync(f)) === want; } catch { return false; } };

/** { regular, medium } paths when the pinned files are in place (sha256 checked), else null. */
export function fontPaths() {
  const out = {};
  for (const [k, f] of Object.entries(FONT_SOURCE.files)) {
    const p = path.join(FONT_DIR, f.to);
    if (!fs.existsSync(p) || !okFile(p, f.sha256)) return null;
    out[k] = p;
  }
  return out;
}

/** Files of a .tgz (ustar / pax) as { name: Buffer } for the names asked for. */
export function untgz(buf, wanted) {
  const tar = zlib.gunzipSync(buf);
  const out = {};
  let longName = null;
  for (let pos = 0; pos + 512 <= tar.length;) {
    const h = tar.subarray(pos, pos + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, n) => h.subarray(a, a + n).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(345, 155);
    let name = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    longName = null;
    const body = tar.subarray(pos + 512, pos + 512 + size);
    if (type === 'x') {                                     // pax header: path=...
      const m = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      if (m) longName = m[1];
    } else if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/s, '');
    else if ((type === '0' || type === '\0') && wanted.includes(name)) out[name] = Buffer.from(body);
    pos += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Make sure the pinned font files are in FONT_DIR (download + check once). Returns fontPaths(). */
export async function ensureFonts({ say = () => {} } = {}) {
  const have = fontPaths();
  if (have) return have;
  say(`  credits font: downloading ${FONT_SOURCE.name} (${FONT_SOURCE.package}, ${FONT_SOURCE.license.split(' (')[0]})`);
  let res;
  try { res = await fetch(FONT_SOURCE.url, { redirect: 'follow' }); } catch (e) { throw new Error(`the credits font could not be downloaded (${e.cause?.code || e.message}): internet connection? (${FONT_SOURCE.url})`); }
  if (!res.ok) throw new Error(`the credits font could not be downloaded: HTTP ${res.status} (${FONT_SOURCE.url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== FONT_SOURCE.sha256) throw new Error(`the credits font download is not the pinned file (sha256 ${sha256(buf).slice(0, 12)}..., expected ${FONT_SOURCE.sha256.slice(0, 12)}...)`);
  const files = untgz(buf, Object.values(FONT_SOURCE.files).map((f) => f.from));
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const f of Object.values(FONT_SOURCE.files)) {
    const b = files[f.from];
    if (!b) throw new Error(`the credits font package has no ${f.from}`);
    if (f.sha256 && sha256(b) !== f.sha256) throw new Error(`${f.from}: sha256 ${sha256(b).slice(0, 12)}... is not the pinned one`);
    fs.writeFileSync(path.join(FONT_DIR, f.to), b);
  }
  const p = fontPaths();
  if (!p) throw new Error('the credits font files did not check out after the download');
  return p;
}
