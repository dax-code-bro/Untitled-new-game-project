#!/usr/bin/env node
/* Pull the source photographs down once, into assets/scans/raw/<id>/.
 * They are inputs to the capture stage, not shipped: the repository keeps
 * them so a rebuild is reproducible without the network.
 *   node tools/scan/fetch.js [--force]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..', '..');
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const RAW = path.join(ROOT, 'assets', 'scans', 'raw');
const force = process.argv.includes('--force');

function get(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'legend-scan/1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${res.statusCode} ${url}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        resolve(buf.length);
      });
    }).on('error', reject);
  });
}

(async () => {
  let got = 0, skipped = 0, failed = 0;
  const manifest = [];
  for (const m of SRC.materials) {
    const repo = SRC.repos[m.repo];
    for (const [slot, rel] of Object.entries(m.maps)) {
      const ext = path.extname(rel) || '.png';
      const dest = path.join(RAW, m.id, `${slot}${ext}`);
      const url = repo.base + rel;
      manifest.push({ id: m.id, slot, url, file: path.relative(ROOT, dest), repo: repo.name, licence: repo.licence });
      if (fs.existsSync(dest) && !force) { skipped++; continue; }
      try {
        const n = await get(url, dest);
        got++;
        process.stdout.write(`  ${m.id}/${slot}  ${(n / 1024).toFixed(0)} kB\n`);
      } catch (e) {
        failed++;
        process.stdout.write(`  ${m.id}/${slot}  FAILED ${e.message}\n`);
      }
    }
  }
  fs.writeFileSync(path.join(RAW, 'manifest.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), files: manifest }, null, 2));
  console.log(`\n${got} fetched, ${skipped} already present, ${failed} failed`);
  if (failed) process.exitCode = 1;
})();
