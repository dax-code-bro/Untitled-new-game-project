// How fast the connection is, and what to download when (O4).
//
// The game is a single-player world that runs entirely on your own computer: once it has loaded it
// uses no network at all, so the connection can't make it stutter. What the connection does decide
// is how long the loading screen takes, and whether something fetched on first use (a shop's guns,
// the animals in the woods, furniture) arrives in a blink or a few seconds late. So:
//  - slow (under ~6 Mbit/s, data saver on, or the browser reports 2G/3G): start with what matters
//    most. The surfaces' colour, normal and roughness maps come first; their ambient-occlusion,
//    height and metal maps (the subtlest) and four of the seven townsfolk models wait. Once you're
//    playing they download quietly in the background, and the next start loads everything (from
//    the browser's cache by then)
//  - medium: everything at start, nothing extra
//  - fast (or already downloaded once): everything at start, and once you've been playing a little
//    while, the models fetched on first use are downloaded ahead in the background (two at a time,
//    low priority), so walking into a gun shop or the woods never waits on the network
// The speed comes from how long the game's own code (game.js) took to arrive, which the browser
// records, and the browser's own hints where it gives them. `?net=slow|medium|fast` forces a tier.

export function assessNetwork() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const out = { tier: 'fast', mbps: 0, cached: false, saveData: !!c?.saveData, hint: c?.effectiveType || '', downlink: c?.downlink || 0, fullCached: false, forced: false };
  try {
    const e = performance.getEntriesByType('resource').find((r) => /\/game\.js(\?|$)/.test(r.name));
    if (e) {
      if (e.transferSize === 0 && e.decodedBodySize > 0) out.cached = true; // came from the cache: been here before
      else if (e.transferSize > 50000 && e.responseEnd > e.requestStart) out.mbps = +((e.transferSize * 8) / ((e.responseEnd - e.requestStart) * 1000)).toFixed(1);
    }
  } catch (err) { /* no timings: go by the hints */ }
  try { out.fullCached = localStorage.getItem('sb.net.full') === '1'; } catch (err) { /* private window */ }
  let tier = 'fast';
  if (out.saveData || /(^|-)2g$|^3g$/.test(out.hint)) tier = 'slow';
  else if (out.cached) tier = 'fast';
  else if (out.mbps) tier = out.mbps < 6 ? 'slow' : out.mbps < 25 ? 'medium' : 'fast';
  else if (out.downlink && out.downlink < 1.5) tier = 'slow';
  if (tier === 'slow' && out.fullCached && !out.saveData) tier = 'medium'; // everything's been downloaded once already
  try { const f = new URLSearchParams(location.search).get('net'); if (/^(slow|medium|fast)$/.test(f || '')) { tier = f; out.forced = true; } } catch (err) { /* */ }
  out.tier = tier;
  out.label = () => `${tier} connection${out.forced ? ' (set by ?net=)' : out.cached ? ' (cached)' : out.mbps ? ` (~${Math.round(out.mbps)} Mbit/s)` : ''}`;
  return out;
}

// Download a list of files into the browser's cache in the background: a couple at a time, at low
// priority, read and thrown away (the browser keeps them). Stops if the page is hidden for a while.
export function backgroundFetch(urls, { concurrency = 2, onDone = null } = {}) {
  let i = 0, active = 0, done = 0, bytes = 0;
  const state = { get done() { return done; }, total: urls.length, get bytes() { return bytes; } };
  if (!urls.length) { onDone?.(state); return state; }
  const next = () => {
    while (active < concurrency && i < urls.length) {
      const u = urls[i++]; active++;
      fetch(u, { priority: 'low' }).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) bytes += b.byteLength; }).catch(() => {}).finally(() => {
        active--; done++;
        if (done === urls.length) onDone?.(state);
        else if (document.hidden) setTimeout(next, 3000); else next();
      });
    }
  };
  next();
  return state;
}
