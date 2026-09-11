#!/usr/bin/env node
/* Photographs every animal: each species, each sex, each life stage, on a
 * neutral floor beside a metre rule. This is how the models get checked —
 * proportions are a thing you look at, not a thing you assert.
 */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const url = require('url');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/animals';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(req.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); return res.end('x'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(8108, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  const SPECIES = ONLY.length ? ONLY : [
    'whitetailDeer', 'muleDeer', 'elk', 'grizzlyBear', 'blackBear',
    'grayWolf', 'coyote', 'redFox', 'cougar', 'bobcat', 'wildBoar',
    'cottontailRabbit', 'graySquirrel', 'raccoon', 'opossum',
    'cattle', 'horse', 'wildTurkey', 'mallardDuck', 'canadaGoose',
  ];
  const STAGES = ['young', 'juvenile', 'adult', 'prime'];

  for (const sp of SPECIES) {
    for (const sex of ['male', 'female']) {
      for (const stage of STAGES) {
        // A young animal has no sex worth drawing twice.
        if (stage === 'young' && sex === 'female') continue;
        await page.goto(`http://localhost:8108/lab/animals.html?species=${sp}&sex=${sex}&stage=${stage}`,
          { waitUntil: 'load' });
        await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1600);
        const name = `${sp}-${stage}-${sex}.png`;
        await page.screenshot({ path: path.join(OUT, name) });
        process.stdout.write(`  ${name}\n`);
      }
    }
  }
  await browser.close();
  server.close();
})();
