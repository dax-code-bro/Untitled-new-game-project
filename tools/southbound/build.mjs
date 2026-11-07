// Bundles Southbound into one classic script (site/southbound/game.js) so it
// runs on browsers without import-map / module support (older iPhones etc).
//   cd tools/southbound && npm install && node build.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, '../../site/southbound');
const three = path.join(game, 'vendor/three');

const threeResolver = {
  name: 'three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(three, 'build/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(three, 'addons', a.path.slice('three/addons/'.length)) }));
    b.onResolve({ filter: /^three\/examples\/jsm\// }, (a) => ({ path: path.join(three, 'addons', a.path.slice('three/examples/jsm/'.length)) }));
    b.onResolve({ filter: /^postprocessing$/ }, () => ({ path: path.join(game, 'vendor/postprocessing/index.js') }));
    b.onResolve({ filter: /^n8ao$/ }, () => ({ path: path.join(game, 'vendor/n8ao/N8AO.js') }));
    b.onResolve({ filter: /^three-mesh-bvh$/ }, () => ({ path: path.join(game, 'vendor/three-mesh-bvh/index.module.js') }));
  },
};

await build({
  entryPoints: [path.join(game, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2017', 'safari12', 'chrome70', 'firefox68'],
  minify: true,
  sourcemap: false,
  outfile: path.join(game, 'game.js'),
  plugins: [threeResolver],
  logLevel: 'info',
});

// the models fetched on first use, for core/net.js to download ahead on a fast connection
{
  const root = path.join(game, 'assets/open'), files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.glb')) files.push([path.relative(game, p).split(path.sep).join('/'), fs.statSync(p).size]); } };
  walk(root);
  files.sort((a, b) => a[0].localeCompare(b[0]));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(files));
  console.log(`  assets/open/manifest.json: ${files.length} models`);
}
