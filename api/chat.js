// Legend AI proxy — runs on Vercel's server, not the user's phone.
// Calling the AI from the server sidesteps browser CORS and per-device rate limits.
module.exports = async (req, res) => {
  // (config exported below — long builds need more than the default 10s)
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

  const hasVision = messages.some(m => Array.isArray(m.content));
  const textMessages = () => messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text).join('\n') : '') }));

  // ── Keyed providers (used automatically if a key is set in Vercel env vars) ──
  // Any ONE of these makes Legend permanently reliable: ATOM_API_KEY (+ optional
  // ATOM_BASE_URL), GROQ_API_KEY, or ANTHROPIC_API_KEY.
  const streamOpenAICompat = async (url, key, m, msgs) => {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: m, messages: msgs, stream: true, temperature: 0.85, max_tokens: 4096 })
    });
    if (!r.ok || !r.body) return false;
    sseHead();
    const reader = r.body.getReader(); const dec = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(dec.decode(value)); }
    res.end(); return true;
  };
  if (process.env.ATOM_API_KEY) {
    try {
      const base = process.env.ATOM_BASE_URL || 'https://oasisos.io/api/v1';
      if (await streamOpenAICompat(base + '/chat/completions', process.env.ATOM_API_KEY, 'atom-32b', textMessages())) return;
    } catch (e) { /* next */ }
  }
  if (process.env.GROQ_API_KEY && !hasVision) {
    try {
      if (await streamOpenAICompat('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', textMessages())) return;
    } catch (e) { /* next */ }
  }
  if (process.env.ANTHROPIC_API_KEY && !hasVision) {
    try {
      const tm = textMessages();
      const system = tm.filter(m2 => m2.role === 'system').map(m2 => m2.content).join('\n\n');
      const convo = tm.filter(m2 => m2.role !== 'system');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, system, messages: convo })
      });
      if (r.ok) {
        const d = await r.json();
        const text = (d && d.content && d.content[0] && d.content[0].text) || '';
        if (text.trim()) { sseText(text.trim()); return; }
      }
    } catch (e) { /* next */ }
  }

  // If the requested model is down/renamed upstream, retry with the reliable default.
  const models = model === 'openai' ? ['openai'] : [model, 'openai'];

  // 1) Streaming passthrough from Pollinations (each model in turn)
  for (const m of models) {
    try {
      const r = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, messages, stream: true, temperature: 0.85, max_tokens: 4096, referrer: 'legend-app' })
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
  }

  // 2) Non-streaming POST (each model in turn)
  for (const m of models) {
    try {
      const r = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, messages, temperature: 0.85, max_tokens: 4096, referrer: 'legend-app' })
      });
      if (r.ok) {
        const d = await r.json();
        const text = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
        if (text.trim()) { sseText(text.trim()); return; }
      }
    } catch (e) { /* next */ }
  }

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

// Allow up to 60s so long game builds aren't cut off mid-stream.
module.exports.config = { maxDuration: 60 };
