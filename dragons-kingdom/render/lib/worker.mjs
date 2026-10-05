// One render worker = one headless Chromium with one page running the runtime.
import { loadPlaywright, chromeExecutable, chromeFlags } from './tools.mjs';

export class RenderWorker {
  /**
   * opts: { id, server, sceneFile, init: {...runtime cfg without sceneUrl}, gpu, log }
   */
  constructor(opts) {
    this.opts = opts;
    this.id = opts.id;
    this.browser = null;
    this.page = null;
    this.info = null;
    this.dead = false;
    this.deathReason = null;
  }

  log(...a) { (this.opts.log || console.error)(`[w${this.id}]`, ...a); }

  async start() {
    const pw = await loadPlaywright();
    const executablePath = await chromeExecutable();
    this.dead = false; this.deathReason = null;
    this.browser = await pw.chromium.launch({
      executablePath,
      headless: true,
      args: chromeFlags({ gpu: !!this.opts.gpu }),
      timeout: 120000,
    });
    this.browser.on('disconnected', () => { if (!this.closing) { this.dead = true; this.deathReason = this.deathReason || 'browser disconnected'; } });
    const page = await this.browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    this.page = page;
    page.on('crash', () => { this.dead = true; this.deathReason = 'page crashed (out of memory?)'; });
    page.on('pageerror', (e) => this.log('page error:', e.message));
    page.on('console', (m) => {
      const t = m.type();
      if (t === 'error' || t === 'warning') {
        const text = m.text();
        if (/GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|Automatic fallback to software WebGL/i.test(text)) return;
        this.log(`console.${t}:`, text);
      } else if (this.opts.verbose) this.log('console:', m.text());
    });
    await page.goto(this.opts.server.pageUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => window.dkReady === true, null, { timeout: 60000 });
    const cfg = { ...this.opts.init, sceneUrl: this.opts.server.fileUrl(this.opts.sceneFile) + `?v=${Date.now()}` };
    this.info = await page.evaluate((c) => window.dk.init(c), cfg);
    return this.info;
  }

  /** Render frames; bytes are POSTed by the page to postBase/<frame>. */
  async render({ postBase, frames, capture = 'yuv', chunkStart, maxInFlight }) {
    if (!this.page || this.dead) throw new Error(`worker ${this.id} is not running (${this.deathReason})`);
    return this.page.evaluate((o) => window.dk.renderFrames(o), { postBase, frames, capture, chunkStart, maxInFlight });
  }

  async close() {
    this.closing = true;
    try { await this.browser?.close(); } catch {}
    this.browser = null; this.page = null;
    this.closing = false;
  }

  async restart() {
    await this.close();
    return this.start();
  }
}
