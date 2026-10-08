// Builds terrain chunk geometry and map images off the main thread.
import { buildChunk, buildMap } from './chunkBuild.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'chunk') {
    const r = buildChunk(m.x0, m.z0, m.size, m.res);
    self.postMessage({ type: 'chunk', key: m.key, ...r }, [r.pos.buffer, r.nor.buffer, r.col.buffer, r.idx.buffer]);
  } else if (m.type === 'map') {
    const px = buildMap(m.cx, m.cz, m.span, m.px);
    self.postMessage({ type: 'map', id: m.id, px, w: m.px }, [px.buffer]);
  }
};
