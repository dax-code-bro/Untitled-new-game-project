// Extract GLSL template literals from engine/src/50-shaders.js into files.
// Chunks (no main()) -> lib/<name>.glsl; programs -> <name>.vert / .frag.
// ${GLSL.x} interpolations become #include "lib/x.glsl".
const fs = require('fs'), path = require('path');
const [,, srcFile, outDir] = process.argv;
const src = fs.readFileSync(srcFile, 'utf8');
const re = /^GLSL\.(\w+)\s*=\s*`([\s\S]*?)`;/gm;
let m; const out = [];
const CHUNKS = new Set(['common','sky','pbr','shadow','fog','transform','envSample']);
while ((m = re.exec(src))) {
  const [, name, body] = m;
  let text = body.replace(/\$\{GLSL\.(\w+)\}/g, (_, n) => `#include "lib/${n}.glsl"`);
  if (/\$\{/.test(text)) throw new Error(name + ': unexpected interpolation');
  let file;
  if (CHUNKS.has(name)) file = `lib/${name}.glsl`;
  else if (/Vert$/.test(name)) file = name.replace(/Vert$/, '') + '.vert';
  else if (/Frag$/.test(name)) file = name.replace(/Frag$/, '') + '.frag';
  else throw new Error('unclassified ' + name);
  const header = `// Ported from engine/src/50-shaders.js GLSL.${name} (GLSL ES 3.00 -> 4.50 core).\n`;
  fs.mkdirSync(path.dirname(path.join(outDir, file)), { recursive: true });
  fs.writeFileSync(path.join(outDir, file), header + text.replace(/^\n/, ''));
  out.push(file);
}
console.log(out.length + ' files: ' + out.join(' '));
