// Legend 3D model generation — text or photo in, a real .glb out.
// Two external calls, both server-side so keys never touch the browser:
//   1) Meshy (image-to-3d) turns a picture into an animatable model.
//   2) Anthropic vision looks at a render of the result and flags mistakes,
//      so a botched generation can retry itself instead of shipping broken.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const action = body && body.action;

  if (action === 'start') return handleStart(req, res, body);
  if (action === 'status') return handleStatus(req, res, body);
  if (action === 'critique') return handleCritique(req, res, body);
  res.status(400).json({ error: 'action must be start, status, or critique' });
};

async function handleStart(req, res, body) {
  const key = process.env.MESHY_API_KEY;
  if (!key) { res.status(501).json({ error: 'MESHY_API_KEY not configured — add it in Vercel project settings to enable model generation.' }); return; }

  const imageUrl = body.imageDataUrl || body.imageUrl;
  if (!imageUrl) { res.status(400).json({ error: 'imageUrl or imageDataUrl is required' }); return; }

  try {
    const r = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ image_url: imageUrl, enable_pbr: true, should_texture: true }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) { res.status(502).json({ error: 'Meshy rejected the request', detail: data }); return; }
    const taskId = data.result || data.id;
    if (!taskId) { res.status(502).json({ error: 'Meshy returned no task id', detail: data }); return; }
    res.status(200).json({ taskId });
  } catch (e) {
    res.status(502).json({ error: 'Meshy request failed: ' + e.message });
  }
}

async function handleStatus(req, res, body) {
  const key = process.env.MESHY_API_KEY;
  if (!key) { res.status(501).json({ error: 'MESHY_API_KEY not configured' }); return; }
  const taskId = body.taskId;
  if (!taskId) { res.status(400).json({ error: 'taskId is required' }); return; }

  try {
    const r = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d/' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + key },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) { res.status(502).json({ error: 'Meshy status check failed', detail: data }); return; }
    res.status(200).json({
      status: data.status,
      progress: data.progress || 0,
      modelUrl: (data.model_urls && data.model_urls.glb) || null,
      thumbnailUrl: data.thumbnail_url || null,
      error: (data.task_error && data.task_error.message) || null,
    });
  } catch (e) {
    res.status(502).json({ error: 'Meshy status request failed: ' + e.message });
  }
}

// Looks at a screenshot of the generated model and says whether it's usable.
// No ANTHROPIC_API_KEY configured -> pass through as "ok" rather than block
// generation entirely on an optional feature.
async function handleCritique(req, res, body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ ok: true, skipped: true }); return; }

  const screenshot = body.screenshotDataUrl;
  const prompt = body.prompt || '';
  if (!screenshot || !screenshot.startsWith('data:image')) { res.status(400).json({ error: 'screenshotDataUrl is required' }); return; }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(screenshot);
  if (!match) { res.status(400).json({ error: 'screenshotDataUrl must be a base64 data URL' }); return; }
  const [, mediaType, base64] = match;

  const instruction = `This is a render of a 3D model generated from the description: "${prompt}". Look closely for generation mistakes: duplicated or fused parts (e.g. extra limbs, extra barrels on a gun), missing parts, melted/distorted geometry, or a shape that clearly doesn't match the description. Minor stylization or rough edges are FINE — only flag genuine structural errors.

Reply with ONLY a JSON object, no other text: {"ok": true or false, "issues": "short description of the problem, or empty string if ok", "fixPrompt": "a revised, more specific version of the description that would avoid this problem, or empty string if ok"}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: instruction },
          ],
        }],
      }),
    });
    if (!r.ok) { res.status(200).json({ ok: true, skipped: true }); return; }
    const d = await r.json();
    const text = (d && d.content && d.content[0] && d.content[0].text) || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(200).json({ ok: true }); return; }
    let verdict;
    try { verdict = JSON.parse(jsonMatch[0]); } catch (e) { res.status(200).json({ ok: true }); return; }
    res.status(200).json({ ok: verdict.ok !== false, issues: verdict.issues || '', fixPrompt: verdict.fixPrompt || '' });
  } catch (e) {
    // A broken critique call should never block a generation that otherwise succeeded.
    res.status(200).json({ ok: true, skipped: true });
  }
}

module.exports.config = { maxDuration: 60 };
