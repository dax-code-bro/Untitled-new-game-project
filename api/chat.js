// Legend AI proxy — runs on Vercel's server, not the user's phone.
// Calling the AI from the server sidesteps browser CORS and per-device rate limits.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const model = (body && body.model) || 'openai';
  const messages = (body && body.messages) || [];

  const sseHead = () => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
  };
  const sseText = (text) => {
    sseHead();
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  };

  // 1) Streaming passthrough from Pollinations
  try {
    const r = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.85, max_tokens: 4096, referrer: 'legend-app' })
    });
    if (r.ok && r.body) {
      sseHead();
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; res.write(dec.decode(value)); }
      res.end();
      return;
    }
  } catch (e) { /* next */ }

  // 2) Non-streaming POST
  try {
    const r = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.85, max_tokens: 4096, referrer: 'legend-app' })
    });
    if (r.ok) {
      const d = await r.json();
      const text = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
      if (text.trim()) { sseText(text.trim()); return; }
    }
  } catch (e) { /* next */ }

  // 3) Simple GET
  try {
    const prompt = messages.filter(m => m.role !== 'system')
      .map(m => (m.role === 'user' ? 'User: ' : 'Legend: ') + (typeof m.content === 'string' ? m.content : ''))
      .join('\n') + '\nLegend:';
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?referrer=legend-app');
    if (r.ok) {
      const text = await r.text();
      if (text.trim()) { sseText(text.trim()); return; }
    }
  } catch (e) { /* next */ }

  res.status(502).json({ error: 'All AI backends failed upstream' });
};
