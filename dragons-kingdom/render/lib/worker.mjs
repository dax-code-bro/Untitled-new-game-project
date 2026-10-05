// One render worker = one headless Chromium with one page running the runtime.
//
// Robustness: Playwright fires the page 'crash' event when the renderer
// process dies (e.g. killed by the Linux OOM killer) but never settles a
// pending page.evaluate() - the job would wait forever. So every call into the
// page is raced against a "death" promise that rejects on page crash, page
// close, browser disconnect, or kill() (used by the job's stall watchdog).
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadPlaywright, chromeExecutable, chromeFlags } from './tools.mjs';

const INIT_TIMEOUT_MS = Number(process.env.DK_INIT_TIMEOUT_MS) || 10 * 60 * 1000;
const CLOSE_TIMEOUT_MS = Number(process.env.DK_CLOSE_TIMEOUT_MS) || 20000;   // env: tests

/** Linux: SIGKILL every process whose command line contains marker. */
function killByMarker(marker) {
  let n = 0;
  try {
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid) || +pid === process.pid) continue;
      let cmd = '';
      try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { continue; }
      if (cmd.includes(marker)) { try { process.kill(+pid, 'SIGKILL'); n++; } catch {} }
    }
  } catch {}
  return n;
}

export class RenderWorker {
  /**
   * opts: { id, server, sceneFile, init: {...runtime cfg without sceneUrl}, gpu, log, verbose }
   */
  constructor(opts) {
    this.opts = opts;
    this.id = opts.id;
    this.browser = null;
    this.page = null;
    this.info = null;
    this.dead = false;
    this.deathReason = null;
    this.death = null;
    this.marker = `--dk-worker=${process.pid}-${opts.id}-${randomBytes(3).toString('hex')}`;
  }

  log(...a) { (this.opts.log || console.error)(`[w${this.id}]`, ...a); }

  /** Mark the worker dead: every pending call into the page rejects with reason. */
  kill(reason) {
    if (this.dead || this.closing) return;
    this.dead = true;
    this.deathReason = reason;
    this._die?.(new Error(reason));
  }

  /** Race a promise against the worker's death (and an optional timeout). */
  _guard(p, { timeoutMs, what } = {}) {
    const racers = [p, this.death];
    let timer = null;
    if (timeoutMs) {
      racers.push(new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not finish within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
        timer.unref?.();
      }));
    }
    return Promise.race(racers).finally(() => clearTimeout(timer));
  }

  async start() {
    const pw = await loadPlaywright();
    const executablePath = await chromeExecutable();
    this.dead = false; this.deathReason = null; this.info = null;
    this.death = new Promise((_, reject) => { this._die = reject; });
    this.death.catch(() => {});
    const browser = await pw.chromium.launch({
      executablePath,
      headless: true,
      args: [...chromeFlags({ gpu: !!this.opts.gpu }), this.marker],
      timeout: 120000,
    });
    this.browser = browser;
    this.browserVersion = browser.version();
    // Every handler belongs to THIS browser/page: a browser that was replaced
    // (restart after a crash or freeze) can still fire 'disconnected'/'close'
    // late - that must not kill the new one.
    const current = () => this.browser === browser && !this.closing && !this.dead;
    browser.on('disconnected', () => {
      if (!current()) return;
      this.log('browser disconnected (crashed or killed)');
      this.kill('browser disconnected (crashed or killed)');
    });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    this.page = page;
    page.on('crash', () => {
      if (!current() || this.page !== page) return;
      this.log('page crashed: its renderer process died (out of memory? killed?)');
      this.kill('page crashed (renderer process died - out of memory?)');
    });
    page.on('close', () => { if (current() && this.page === page) this.kill('page closed'); });
    page.on('pageerror', (e) => { if (this.page === page) this.log('page error:', e.message); });
    page.on('console', (m) => {
      if (this.page !== page) return;
      const t = m.type();
      if (t === 'error' || t === 'warning') {
        const text = m.text();
        if (/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|Automatic fallback to software WebGL/i.test(text)) return;
        this.log(`console.${t}:`, text);
      } else if (this.opts.verbose) this.log('console:', m.text());
    });
    await this._guard(page.goto(this.opts.server.pageUrl, { waitUntil: 'load' }), { timeoutMs: 120000, what: 'loading the runtime page' });
    await this._guard(page.waitForFunction(() => window.dkReady === true, null, { timeout: 60000 }));
    const cfg = { ...this.opts.init, sceneUrl: this.opts.server.fileUrl(this.opts.sceneFile) + `?v=${Date.now()}` };
    this.info = await this._guard(page.evaluate((c) => window.dk.init(c), cfg), { timeoutMs: INIT_TIMEOUT_MS, what: 'scene setup (setup() + asset loading)' });
    this.info.browserVersion = this.browserVersion;
    return this.info;
  }

  /** Render frames; the page sends the bytes over a WebSocket to sinkUrl. */
  async render({ sinkUrl, frames, capture = 'yuv', chunkStart, maxInFlight }) {
    if (!this.page || this.dead) throw new Error(`worker ${this.id} is not running (${this.deathReason})`);
    return this._guard(this.page.evaluate((o) => window.dk.renderFrames(o), { sinkUrl, frames, capture, chunkStart, maxInFlight }));
  }

  async close() {
    this.closing = true;
    const b = this.browser;
    this.browser = null; this.page = null; this.info = null;
    if (b) {
      let timer;
      const ok = await Promise.race([
        b.close().then(() => true, () => true),
        new Promise((r) => { timer = setTimeout(() => r(false), CLOSE_TIMEOUT_MS); }),
      ]);
      clearTimeout(timer);
      // a browser that does not close in time is killed (it would keep a CPU busy forever)
      if (!ok) {
        const gone = b.isConnected() ? new Promise((r) => b.once('disconnected', r)) : Promise.resolve();
        const n = killByMarker(this.marker);
        this.log(`browser did not close in time, killed ${n} process(es)`);
        // let its late events arrive (they are ignored) before a new browser starts
        await Promise.race([gone, new Promise((r) => { const t = setTimeout(r, 5000); t.unref?.(); })]);
      }
    }
    this.closing = false;
  }

  async restart() {
    await this.close();
    return this.start();
  }
}
