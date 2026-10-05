// Progress line: frames done/total, speed, ETA and what every worker is doing.

export function fmtDuration(s) {
  if (!Number.isFinite(s)) return '?';
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export class Progress {
  constructor({ totalFrames, doneFrames = 0, workers, fps, twos }) {
    this.total = totalFrames;
    this.done = doneFrames;
    this.startDone = doneFrames;
    this.workers = workers;
    this.fps = fps;
    this.twos = twos;
    this.t0 = Date.now();
    this.samples = [[this.t0, doneFrames]];
    this.tty = process.stderr.isTTY;
    this.lastPrint = 0;
    this.timer = setInterval(() => this.print(), this.tty ? 1000 : 5000);
    this.timer.unref?.();
  }
  frameDone(w, outFrames) {
    this.done += outFrames;
    const now = Date.now();
    if (outFrames > 0) this.lastFrameAt = now;
    this.samples.push([now, this.done]);
    while (this.samples.length > 2 && now - this.samples[1][0] > 90000) this.samples.shift();
  }
  rate(now = Date.now()) {
    // output frames per second over the last ~90 s, measured up to NOW: when
    // nothing arrives any more the rate falls towards 0 instead of freezing
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    const dt = (now - a[0]) / 1000;
    return dt > 0 ? (b[1] - a[1]) / dt : 0;
  }
  /** A worker reported that it is alive without finishing a frame (chunk-warmup replay). */
  alive() { this.lastAliveAt = Date.now(); }
  /** ms since the last frame, if that is suspiciously long (else 0). */
  stalledFor(now = Date.now()) {
    if (!this.lastFrameAt || this.done >= this.total) return 0;
    const n = this.samples.length;
    const avg = n > 1 ? (this.samples[n - 1][0] - this.samples[0][0]) / (n - 1) : 0;
    const idle = now - Math.max(this.lastFrameAt, this.lastAliveAt || 0);
    return idle > Math.max(60000, 10 * avg) ? idle : 0;
  }
  line() {
    const now = Date.now();
    const r = this.rate(now);
    const pct = ((100 * this.done) / this.total).toFixed(1);
    const stalled = this.stalledFor(now);
    const eta = stalled ? `stalled (no frame for ${fmtDuration(stalled / 1000)})` : r > 0 ? fmtDuration((this.total - this.done) / r) : '?';
    const speed = this.twos ? `${(r / 2).toFixed(2)} fps rendered (${r.toFixed(2)} out)` : `${r.toFixed(2)} fps`;
    const realtime = r > 0 ? ` | ${(this.fps / r).toFixed(1)} min render per min of video` : '';
    const ws = this.workers.map((w) => {
      const c = w.current;
      if (!c) return `w${w.id} idle`;
      const el = (now - c.started) / 1000;
      const idle = now - Math.max(c.lastFrameAt ?? c.started, c.aliveAt || 0);
      const per = idle > 60000 ? `no frame for ${fmtDuration(idle / 1000)}`
        : c.done ? `${(el / c.done).toFixed(1)}s/f`
          : c.warmup ? `warm-up ${Math.floor((100 * c.warmup.hb) / Math.max(1, c.warmup.of))}%` : 'starting';
      return `w${w.id} ${c.chunk.name.replace('chunk_', 'c')} ${c.done}/${c.total} ${per}`;
    }).join(' | ');
    return `frames ${this.done}/${this.total} (${pct}%) | ${speed}${realtime} | ETA ${eta} | elapsed ${fmtDuration((Date.now() - this.t0) / 1000)} || ${ws}`;
  }
  print() {
    const l = this.line();
    if (this.tty) {
      const cols = process.stderr.columns || 200;
      process.stderr.write('\r\x1b[2K' + (l.length > cols - 1 ? l.slice(0, cols - 2) + '…' : l));
      this.dirty = true;
    } else if (l !== this.lastLine) {
      process.stderr.write(l + '\n');
    }
    this.lastLine = l;
  }
  clearLine() { if (this.tty && this.dirty) { process.stderr.write('\r\x1b[2K'); this.dirty = false; } }
  stop() {
    clearInterval(this.timer);
    if (this.tty && this.dirty) { this.print(); process.stderr.write('\n'); this.dirty = false; }
    else if (!this.tty) this.print();
  }
}
