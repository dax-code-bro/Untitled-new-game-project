// Programmatic API: one server + one worker, frames rendered into memory.
// Used by --still, the tests and the benchmark.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startServer } from './server.mjs';
import { RenderWorker } from './worker.mjs';
import { resolvePreset } from './presets.mjs';
import { memorySink } from './sinks.mjs';

/** Runtime init config from a resolved preset + user options. */
export function runtimeConfig(p, o = {}) {
  return {
    width: p.width, height: p.height, renderWidth: p.renderWidth, renderHeight: p.renderHeight,
    fps: o.fps ?? 24,
    preset: p.name,
    quality: { ...p.quality, ...(o.quality || {}) },
    aa: o.aa ?? p.aa,
    dither: o.dither ?? true,
    sharpness: o.sharpness ?? p.sharpness ?? 0.5,
    readback: o.readback ?? 'async',
    maxInFlight: o.maxInFlight ?? 3,
    toneMapping: o.toneMapping,
    exposure: o.exposure,
    timing: !!o.timing,
    shadowCache: o.shadowCache ?? true,
    bitDepth: o.bitDepth ?? 8,
  };
}

export const newId = (prefix = 's') => `${prefix}${randomBytes(6).toString('hex')}`;

export async function openSession(o) {
  const sceneFile = path.resolve(o.scene);
  const p = o.resolved ?? resolvePreset(o.preset ?? 'draft', { size: o.size });
  const server = o.server ?? await startServer({ allowRoots: [path.dirname(sceneFile)] });
  const worker = new RenderWorker({ id: o.id ?? 0, server, sceneFile, init: runtimeConfig(p, o), gpu: o.gpu, log: o.log, verbose: o.verbose });
  let info;
  try { info = await worker.start(); } catch (e) { await worker.close(); if (!o.server) await server.close(); throw e; }
  return {
    info, preset: p, server, worker,
    /** Render frames (absolute indices) into memory. capture: 'yuv' | 'yuv10' | 'rgba'. */
    async render(frames, capture = 'yuv', extra = {}) {
      const sink = memorySink(frames.map((f) => ({ frame: f, repeat: 1 })));
      const sid = newId('m');
      const sinkUrl = server.addSink(sid, sink);
      try {
        const stats = await worker.render({ sinkUrl, frames, capture, ...extra });
        await sink.finish();
        return { frames: sink.frames, stats };
      } finally { server.removeSink(sid); }
    },
    async close() { await worker.close(); if (!o.server) await server.close(); },
  };
}
