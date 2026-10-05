// Frame sinks: where the frames the page sends over its WebSocket go. A sink
// writes them strictly in timeline order (it does not rely on arrival order)
// and only acknowledges a frame once it has been written (=> backpressure all
// the way back to the browser, which limits how many frames it keeps in flight).
import fs from 'node:fs';
import { spawnFfmpeg } from './ffmpeg.mjs';

/**
 * order: [{ frame, repeat }] - the rendered frames in output order and how many
 * output frames each one fills (repeat 2 = "animation on twos").
 * writeFn(buf, repeat) -> Promise
 */
export class OrderedSink {
  constructor(order, writeFn) {
    this.order = order;
    this.index = new Map(order.map((o, i) => [o.frame, i]));
    this.writeFn = writeFn;
    this.pos = 0;
    this.pending = new Map();
    this.busy = false;
    this.error = null;
    this.outFrames = 0;       // output frames written (incl. repeats)
    this.rendered = 0;        // unique frames written
    this.onProgress = null;
  }
  get complete() { return this.pos === this.order.length; }
  push(frame, buf) {
    if (this.error) return Promise.reject(this.error);
    if (!this.index.has(frame)) return Promise.reject(new Error(`unexpected frame ${frame}`));
    if (this.index.get(frame) < this.pos || this.pending.has(frame)) return Promise.reject(new Error(`duplicate frame ${frame}`));
    return new Promise((resolve, reject) => {
      this.pending.set(frame, { buf, resolve, reject });
      this.pump();
    });
  }
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.pos < this.order.length) {
        const { frame, repeat } = this.order[this.pos];
        const p = this.pending.get(frame);
        if (!p) break;
        this.pending.delete(frame);
        try {
          await this.writeFn(p.buf, repeat, frame);
        } catch (e) {
          this.fail(e); p.reject(e); return;
        }
        this.pos++;
        this.outFrames += repeat;
        this.rendered++;
        p.resolve();
        this.onProgress?.(this);
      }
    } finally { this.busy = false; }
  }
  fail(e) {
    this.error = this.error || e;
    for (const p of this.pending.values()) p.reject(this.error);
    this.pending.clear();
  }
}

/** Sink that pipes frames into an ffmpeg encoder writing `partPath`. */
export function ffmpegSink(order, args, { label } = {}) {
  const ff = spawnFfmpeg(args, { label });
  const sink = new OrderedSink(order, async (buf, repeat) => {
    for (let r = 0; r < repeat; r++) await ff.write(buf);
  });
  sink.ff = ff;
  sink.finish = async () => {
    if (sink.error) throw sink.error;
    if (!sink.complete) throw new Error(`sink incomplete: ${sink.pos}/${order.length} frames`);
    await ff.end();
  };
  sink.abort = async () => { sink.fail(new Error('aborted')); await ff.kill(); };
  return sink;
}

/** Sink that keeps frames in memory (stills, tests). */
export function memorySink(order) {
  const frames = new Map();
  const sink = new OrderedSink(order, async (buf, repeat, frame) => { frames.set(frame, buf); });
  sink.frames = frames;
  sink.finish = async () => { if (sink.error) throw sink.error; };
  sink.abort = async () => sink.fail(new Error('aborted'));
  return sink;
}

/** Sink that writes raw frames to a file (debug / tests). */
export function fileSink(order, file) {
  const fd = fs.openSync(file, 'w');
  const sink = new OrderedSink(order, async (buf, repeat) => { for (let r = 0; r < repeat; r++) fs.writeSync(fd, buf); });
  sink.finish = async () => { fs.closeSync(fd); if (sink.error) throw sink.error; };
  sink.abort = async () => { sink.fail(new Error('aborted')); try { fs.closeSync(fd); } catch {} };
  return sink;
}
