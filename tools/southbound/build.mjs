// Bundles Southbound into one classic script (site/southbound/game.js) so it
// runs on browsers without import-map / module support (older iPhones etc).
//   cd tools/southbound && npm install && node build.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, '../../site/southbound');
const three = path.join(game, 'vendor/three');

const threeResolver = {
  name: 'three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(three, 'build/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(three, 'addons', a.path.slice('three/addons/'.length)) }));
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
