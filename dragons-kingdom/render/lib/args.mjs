// Minimal argv parser: --key value, --key=value, --flag, --no-flag, positionals.
export function parseArgs(argv, { booleans = [], aliases = {} } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (aliases[a]) a = aliases[a];
    if (!a.startsWith('--') || a === '--') { out._.push(a); continue; }
    let key = a.slice(2), val;
    const eq = key.indexOf('=');
    if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
    const camel = key.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    if (booleans.includes(key)) { out[camel] = val === undefined ? true : !/^(0|false|no)$/i.test(val); continue; }
    if (key.startsWith('no-') && booleans.includes(key.slice(3))) { out[camel.replace(/^no(.)/, (_, c) => c.toLowerCase())] = false; continue; }
    if (val === undefined) {
      if (i + 1 >= argv.length || (argv[i + 1].startsWith('--') && !/^--?\d/.test(argv[i + 1]))) throw new Error(`option --${key} needs a value`);
      val = argv[++i];
    }
    out[camel] = val;
  }
  return out;
}

export function num(v, name, { min = -Infinity, int = false } = {}) {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || (int && !Number.isInteger(n))) throw new Error(`--${name}: "${v}" is not a valid ${int ? 'whole ' : ''}number${min > -Infinity ? ` >= ${min}` : ''}`);
  return n;
}
