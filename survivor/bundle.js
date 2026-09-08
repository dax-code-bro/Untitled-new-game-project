#!/usr/bin/env node
/* Inlines the whole game into one self-contained HTML file.
 *
 * The playable build has to be a single file with no fetches: it is published
 * as an artifact, which serves one page from its own origin with a strict
 * content-security policy and no way to load a sibling script. Everything —
 * engine, simulation, core, every module — goes inline.
 *
 * The output is page *content*, not a document: no doctype, no <html>, no
 * <head>, no <body>. The artifact host supplies those. Written that way so the
 * same file drops into an artifact and, with a two-line wrapper, opens from
 * disk.
 *
 * Usage:  node survivor/bundle.js [outfile]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const SRC = path.join(SITE, 'survivor', 'index.html');
const OUT = process.argv[2] || path.join(ROOT, 'dist', 'survivor.html');

function inline(html) {
  const missing = [];
  let bytes = 0;
  const out = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    const file = path.resolve(path.dirname(SRC), src);
    if (!fs.existsSync(file)) {
      missing.push(src);
      return `<!-- missing: ${src} -->`;
    }
    let js = fs.readFileSync(file, 'utf8');
    bytes += Buffer.byteLength(js);
    // A closing tag inside a string literal ends the script element early.
    // It has never happened here, but it is a one-line insurance policy
    // against a future module containing the literal text.
    js = js.replace(/<\/script>/gi, '<\\/script>');
    return `<script>\n${js}\n</script>`;
  });
  return { out, missing, bytes };
}

function build() {
  if (!fs.existsSync(SRC)) throw new Error(`no ${SRC}`);
  let html = fs.readFileSync(SRC, 'utf8');

  // Strip the document scaffolding the artifact host provides itself.
  html = html
    .replace(/^<!doctype html>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<link rel="icon"[^>]*>\s*/i, '');

  const { out, missing, bytes } = inline(html);
  if (missing.length) {
    console.warn(`  ! ${missing.length} script(s) not found and skipped:`);
    for (const m of missing) console.warn(`      ${m}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);

  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`survivor.html  ${kb} KB  (${(bytes / 1024).toFixed(0)} KB of script inlined)`);

  // Compile-check every inlined script together, so a syntax error in any
  // module is caught here rather than as a blank page in the browser.
  const scripts = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  scripts.forEach((js, i) => {
    try {
      // eslint-disable-next-line no-new-func
      new Function(js);
    } catch (err) {
      throw new Error(`inlined script #${i + 1} has a syntax error: ${err.message}`);
    }
  });
  console.log(`  ${scripts.length} scripts, all parse`);
  return OUT;
}

build();
