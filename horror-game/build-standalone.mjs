/*
 * Builds the single-file versions of the game from index.html.
 *
 *   node build-standalone.mjs
 *
 * Outputs:
 *   standalone.html      — a complete document that runs from file:// with
 *                          no server and no network access. Committed, since
 *                          it is the zero-setup way to play.
 *   dist/artifact.html   — the same page as a body fragment, for hosts that
 *                          supply their own document skeleton. Not committed.
 *
 * index.html stays the single source of truth for markup, styles and UI
 * wiring; this script only swaps the module loader for an inlined copy
 * of Three.js and inlines game.js.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

/**
 * three.module.min.js is minified, so its public names exist only in the
 * trailing `export{ mangled as Public, ... }` statement. Rewriting that
 * statement into an object literal gives us the usual THREE namespace
 * without a bundler, an importmap, or the deprecated UMD build.
 */
function moduleToNamespace(source, namespace = 'THREE') {
  const match = source.match(/export\s*\{([^{}]*)\}\s*;?\s*$/);
  if (!match) {
    throw new Error('No trailing export statement found in the Three.js build.');
  }

  const entries = match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+as\s+/);
      const local = parts[0].trim();
      const exported = (parts[1] || parts[0]).trim();
      return `${JSON.stringify(exported)}:${local}`;
    });

  const body = source.slice(0, match.index);
  return {
    code: `${body}\nconst ${namespace} = {${entries.join(',')}};\n`,
    count: entries.length
  };
}

const indexHtml = read('index.html');
const threeSrc = read('vendor/three/three.module.min.js');

// Every local script index.html pulls in, in document order.
const LOCAL_SCRIPTS = ['textures.js', 'fittings.js', 'entity.js', 'level.js', 'game.js'];
const sources = new Map(LOCAL_SCRIPTS.map((name) => [name, read(name)]));

// Nothing inlined into a <script> may contain a closing script tag.
for (const [name, src] of [...sources, ['three.module.min.js', threeSrc]]) {
  if (/<\/script/i.test(src)) {
    throw new Error(`${name} contains a literal </script> and cannot be inlined.`);
  }
}

const { code: threeCode, count } = moduleToNamespace(threeSrc);

const loader = `<script type="module">
/*! Three.js r160 — MIT License — https://threejs.org (inlined, unmodified except
    for the trailing export statement, which is rewritten as a namespace object) */
${threeCode}
window.bootUI(${'THREE'});
</script>`;

let out = indexHtml.replace(
  /<!-- LOADER:START[\s\S]*?LOADER:END -->/,
  loader
);
if (out === indexHtml) throw new Error('Loader block not found in index.html.');

for (const [name, src] of sources) {
  const tag = `<script src="./${name}"></script>`;
  if (!out.includes(tag)) throw new Error(`${tag} not found in index.html.`);
  out = out.replace(tag, `<script>\n${src}\n</script>`);
}

writeFileSync(join(here, 'standalone.html'), out);
mkdirSync(join(here, 'dist'), { recursive: true });

// Fragment form: drop the document skeleton, keep <title> and everything
// inside <body>, since some hosts wrap the content in their own shell.
const title = (out.match(/<title>([\s\S]*?)<\/title>/) || [, 'Untitled Horror Game'])[1];
const styles = (out.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const body = (out.match(/<body>([\s\S]*)<\/body>/) || [, ''])[1];
writeFileSync(
  join(here, 'dist/artifact.html'),
  `<title>${title}</title>\n${styles}\n${body.trim()}\n`
);

const kb = (s) => `${Math.round(s.length / 1024)} KB`;
console.log(`Three.js namespace rebuilt from ${count} exports`);
console.log(`standalone.html       ${kb(out)}`);
console.log(`dist/artifact.html    ${kb(readFileSync(join(here, 'dist/artifact.html'), 'utf8'))}`);
